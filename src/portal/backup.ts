import { BACKUP_ORIGINS, cgiUrl, MIPYME_BACKUP_BASE_URL, type DocumentDirection } from '../catalogs/portal'
import { DteError } from '../errors'
import { assertPositive, type CallOverrides } from '../sii/client'
import { withRetry, type RetryPolicy } from '../sii/retry'
import { isIsoDate } from '../time/chile'
import { isRetryablePortalError, resolvePortalCompany, siiCodeOf, type PortalClient } from './client'
import { backupTotal, backupVerdict, isBackupXml } from './pages/backup'
import {
  companyFields,
  ensurePage,
  formEncode,
  portalRequest,
  rejected,
  unexpectedPage,
  withPortalSession,
  type PortalContext,
} from './session'

const LIST_URL = `${MIPYME_BACKUP_BASE_URL}/lista_documentos.cgi`
const DOWNLOAD_URL = `${MIPYME_BACKUP_BASE_URL}/download.cgi`
// The SII's cap per download: 20 documents answer XML, 21 answer an error page.
const MAX_DOCUMENTS = 20
const SPLIT_TYPES: readonly number[] = [33, 34, 46, 56, 61, 52, 110, 111, 112]
const DAY_MS = 86400000
const DEFAULT_ATTEMPTS = 3

/**
 * EN: What `downloadMipymeBackup` needs.
 * ES: Lo que necesita `downloadMipymeBackup`.
 */
export type MipymeBackupInput = {
  /** EN: First day, `YYYY-MM-DD`. ES: `FEC_DESDE` — Primer día, `AAAA-MM-DD`. */
  readonly from: string
  /** EN: Last day, `YYYY-MM-DD`. ES: `FEC_HASTA` — Último día, `AAAA-MM-DD`. */
  readonly to: string
  /** EN: Issued or received documents; issued by default. ES: `ORIGEN` — Documentos emitidos o recibidos; por defecto emitidos. */
  readonly direction?: DocumentDirection
  /** EN: Only this document type; all by default. ES: `TPO_DOC` — Solo este tipo de documento; por defecto todos. */
  readonly type?: number
  /** EN: Tries per listing and per download; 3 by default. ES: Intentos por listado y por descarga; por defecto 3. */
  readonly attempts?: number
  /** EN: Receives each piece as it arrives, so a long history does not stay in memory: then the result holds no `xml`. ES: Recibe cada tramo a medida que llega, para que un histórico largo no quede en memoria: entonces el resultado no trae `xml`. */
  readonly onChunk?: (chunk: MipymeDownloadedChunk) => Promise<void> | void
  /** EN: Company, when it is not the client's. ES: `RUT_EMP` + `DV_EMP` — Empresa, si no es la del cliente. */
  readonly companyRut?: string
}

/**
 * EN: One downloaded piece, as `onChunk` receives it.
 * ES: Un tramo descargado, tal como lo recibe `onChunk`.
 */
export type MipymeDownloadedChunk = {
  /** EN: First day. ES: `FEC_DESDE` — Primer día. */
  readonly from: string
  /** EN: Last day. ES: `FEC_HASTA` — Último día. */
  readonly to: string
  /** EN: Documents the listing counted. ES: Documentos que contó el listado. */
  readonly total: number
  /** EN: The XML of the piece. ES: El XML del tramo. */
  readonly xml: string
}

/**
 * EN: One piece of a backup.
 * ES: Un tramo de un respaldo.
 */
export type MipymeBackupChunk = {
  /** EN: First day. ES: `FEC_DESDE` — Primer día. */
  readonly from: string
  /** EN: Last day. ES: `FEC_HASTA` — Último día. */
  readonly to: string
  /** EN: Documents the listing counted. ES: Documentos que contó el listado. */
  readonly total: number
  /** EN: Document type, when a day had to be split by type. ES: `TPO_DOC` — Tipo de documento, si hubo que separar un día por tipo. */
  readonly type?: number
  /** EN: The XML of the piece; absent with `onChunk`. ES: El XML del tramo; ausente con `onChunk`. */
  readonly xml?: string
}

/**
 * EN: What a backup downloaded.
 * ES: Lo que descargó un respaldo.
 */
export type MipymeBackup = {
  /** EN: Sum of the pieces' totals. ES: Suma de los totales de los tramos. */
  readonly total: number
  /** EN: The pieces, newest first. ES: Los tramos, del más nuevo al más viejo. */
  readonly chunks: readonly MipymeBackupChunk[]
}

type Piece = Pick<MipymeBackupChunk, 'from' | 'to' | 'total' | 'type'>

type BackupRun = {
  /** One attempt per request: the loop of `repeated` is the only one. */
  readonly context: PortalContext
  readonly policy: RetryPolicy
  readonly origin: string
  readonly company: { readonly RUT_EMP: string; readonly DV_EMP: string }
  readonly type: number | undefined
}

const backupPolicy = (attempts: number): RetryPolicy => ({
  maxAttempts: attempts,
  initialDelayMs: 1000,
  maxDelayMs: 1000 * 2 ** attempts,
  backoffMultiplier: 2,
  jitterRatio: 0,
  retryOn: (error) => isRetryablePortalError(error) || error.code === 'SII_PORTAL_UNEXPECTED_PAGE',
})

const repeated = <T>(run: BackupRun, attempt: () => Promise<T>): Promise<T> => {
  const { portal, operation, overrides } = run.context
  return withRetry(run.policy, attempt, {
    sleep: portal.sleep,
    signal: overrides?.signal,
    onRetry: (error, attemptNumber, delayMs) =>
      portal.logger.warn('sii portal retrying', { operation, attempt: attemptNumber, delayMs, code: error.code }),
  })
}

const pageFailure = (context: PortalContext, step: string, html: string): DteError => {
  const verdict = backupVerdict(html)
  if (verdict === null) return unexpectedPage(context, step, html)
  const { rejection, ...details } = verdict
  return rejected(context, rejection, details)
}

const commonFields = (run: BackupRun, type: number | undefined): Readonly<Record<string, string>> => ({
  ...run.company,
  RUT_RECP: '',
  FOLIO: '',
  FOLIOHASTA: '',
  RZN_SOC: '',
  TPO_DOC: type === undefined ? '' : String(type),
  ESTADO: '',
  ORDEN: '',
})

const countDocuments = (run: BackupRun, from: string, to: string, type = run.type): Promise<number> =>
  repeated(run, async () => {
    const page = await portalRequest(run.context, 'list', 'POST', LIST_URL, {
      form: {
        'recaptcha-response': '',
        ORIGEN: run.origin,
        FEC_DESDE: from,
        FEC_HASTA: to,
        NUM_PAG: '1',
        TPO_ARCHIVO: 'dte',
        ...commonFields(run, type),
      },
      referer: LIST_URL,
    })
    const total = backupTotal(page.html)
    if (total === null) throw pageFailure(run.context, 'list', page.html)
    return total
  })

const downloadPiece = (run: BackupRun, piece: Piece): Promise<string> =>
  repeated(run, async () => {
    const query = formEncode({
      ...commonFields(run, piece.type ?? run.type),
      ORIGEN: run.origin,
      FEC_DESDE: piece.from,
      FEC_HASTA: piece.to,
      DOWNLOAD: 'XML',
    })
    const page = await portalRequest(run.context, 'download', 'GET', `${DOWNLOAD_URL}?${query}`, { referer: LIST_URL })
    if (!isBackupXml(page.html)) throw pageFailure(run.context, 'download', page.html)
    return page.html
  })

const midnight = (day: string): number => Date.parse(`${day}T00:00:00Z`)
const isoDay = (time: number): string => new Date(time).toISOString().slice(0, 10)

const planByType = async (run: BackupRun, from: string, to: string, listed: number): Promise<readonly Piece[]> => {
  const pieces: Piece[] = []
  for (const type of SPLIT_TYPES) {
    const total = await countDocuments(run, from, to, type)
    if (total > MAX_DOCUMENTS) throw rejected(run.context, 'backupDayOverLimit', { day: from, type, listed: total })
    if (total > 0) pieces.push({ from, to: from, total, type })
  }
  const covered = pieces.reduce((sum, piece) => sum + piece.total, 0)
  if (covered < listed) throw rejected(run.context, 'backupDayUnknownTypes', { day: from, listed, covered })
  return pieces
}

const planRange = async (run: BackupRun, from: string, to: string): Promise<readonly Piece[]> => {
  const listed = await countDocuments(run, from, to)
  if (listed === 0) return []
  if (listed <= MAX_DOCUMENTS) return [{ from, to, total: listed }]
  const middle = isoDay((midnight(from) + midnight(to)) / 2)
  if (middle === from || middle === to) return planByType(run, from, to, listed)
  return [...(await planRange(run, from, middle)), ...(await planRange(run, isoDay(midnight(middle) + DAY_MS), to))]
}

/**
 * EN: Downloads the XML of the issued or received documents of a date range from the MIPYME backup, splitting the range until
 * each piece fits the 20 documents the SII allows per download. It needs only the certificate, not being enrolled as an issuer.
 * This reads production whatever the client's environment, because the service exists only there: it reads real documents even
 * from a certification client, and a development environment that stores them needs its own gate.
 *
 * The whole plan comes first, so a day that cannot be downloaded throws before any download. Known defect: a two-day range
 * with more than 20 documents downloads only its first day, split by type, while `total` still counts both.
 *
 * A captcha or an indeterminate page means try later, never in a loop. No data is definitive.
 * ES: Descarga desde el respaldo MIPYME el XML de los documentos emitidos o recibidos de un rango de fechas, partiendo el rango
 * hasta que cada tramo quepa en los 20 documentos por descarga que permite el SII. Solo necesita el certificado, no estar
 * inscrito como emisor. Esto lee producción sea cual sea el ambiente del cliente, porque el servicio existe solo ahí: lee
 * documentos reales incluso desde un cliente de certificación, y un entorno de desarrollo que los guarde necesita su propia puerta.
 *
 * El plan completo va primero, así que un día que no se puede descargar lanza antes de cualquier descarga. Defecto conocido: un
 * rango de dos días con más de 20 documentos baja solo su primer día, separado por tipo, mientras `total` sigue contando ambos.
 *
 * Un captcha o una página indeterminada significan intentar más tarde, nunca en un loop. Sin datos es definitivo.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the range and how to receive it. ES: el rango y cómo recibirlo.
 * @param overrides EN: per-call overrides; `retry` reaches only the login. ES: ajustes de la llamada; `retry` solo alcanza al inicio de sesión.
 * @returns EN: the pieces, newest first, and their total. ES: los tramos, del más nuevo al más viejo, y su total.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED` with `backupCaptcha`, `backupIndeterminate`, `backupNoData`, `backupRefused`, `backupNoCompany`, `backupDayOverLimit` or `backupDayUnknownTypes`; `INVALID_DATE`, `INVALID_OPTION`, `MISSING_FIELD`, `INVALID_RUT`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const downloadMipymeBackup = (
  portal: PortalClient,
  input: MipymeBackupInput,
  overrides?: CallOverrides,
): Promise<MipymeBackup> =>
  withPortalSession(portal, 'downloadMipymeBackup', overrides, async (context) => {
    if (!isIsoDate(input.from)) throw new DteError('INVALID_DATE', { field: 'from' })
    if (!isIsoDate(input.to)) throw new DteError('INVALID_DATE', { field: 'to' })
    const origin = siiCodeOf(BACKUP_ORIGINS, input.direction ?? 'issued', 'direction')
    assertPositive(input.attempts, 'attempts')
    const company = companyFields(resolvePortalCompany(portal, input.companyRut))
    await ensurePage(context, 'session', cgiUrl('certification', 'ad_empresa1'))
    context.state.cookies = { ...context.state.cookies, usa_firma_central: 'true' }
    const run: BackupRun = {
      context: { ...context, overrides: { ...overrides, retry: false } },
      policy: backupPolicy(input.attempts ?? DEFAULT_ATTEMPTS),
      origin,
      company,
      type: input.type,
    }
    const pieces = await planRange(run, input.from, input.to)
    const chunks: MipymeBackupChunk[] = []
    for (const piece of [...pieces].sort((a, b) => b.from.localeCompare(a.from))) {
      const xml = await downloadPiece(run, piece)
      if (input.onChunk === undefined) chunks.push({ ...piece, xml })
      else {
        await input.onChunk({ from: piece.from, to: piece.to, total: piece.total, xml })
        chunks.push(piece)
      }
    }
    return { total: chunks.reduce((sum, chunk) => sum + chunk.total, 0), chunks }
  })
