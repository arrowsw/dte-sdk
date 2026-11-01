import { FINAL_CONSUMER_RUT } from '../catalogs/codes'
import { isDocumentType, isReceipt, type DocumentType } from '../catalogs/document-types'
import {
  classifyDocumentStatus,
  classifyUploadStatus,
  documentStatusMessage,
  isTokenErrorStatus,
  uploadStatusMessage,
  type DocumentStatusClass,
  type UploadStatusClass,
} from '../catalogs/upload-status'
import { DteError, isDteError } from '../errors'
import { splitSiiRut, toSiiRut, type SiiRut } from '../model/rut'
import { chileDate, toIsoDate } from '../time/chile'
import { extractTagContent } from '../xml/parse'
import { withToken } from './auth'
import { resolveCompanyRut, retryFor, timeoutFor, type CallOverrides, type SiiClient } from './client'
import {
  bodyExcerpt,
  httpError,
  isSuccess,
  parseJson,
  readSiiResponse,
  restCall,
  retryOptions,
  soapCall,
} from './operation'
import { isRetryableError, withRetry } from './retry'
import type { TokenChannel } from './token-cache'

/**
 * EN: Document counts of an envelope.
 * ES: Cantidades de documentos de un envío.
 */
export type UploadStatusCounts = {
  /** EN: Documents reported. ES: `INFORMADOS` / `informados` — Documentos informados. */
  readonly reported: number
  /** EN: Documents accepted. ES: `ACEPTADOS` / `aceptados` — Documentos aceptados. */
  readonly accepted: number
  /** EN: Documents rejected. ES: `RECHAZADOS` / `rechazados` — Documentos rechazados. */
  readonly rejected: number
  /** EN: Documents accepted with objections. ES: `REPAROS` / `reparos` — Documentos aceptados con reparos. */
  readonly objections: number
}

/**
 * EN: One error of a document in the REST envelope status.
 * ES: Un error de un documento en el estado de envío REST (`detalle_rep_rech/error`).
 */
export type UploadStatusDocumentError = {
  /** EN: Section: ENV, CRT, TED, CAF, DTE, HED, DET, REF, DRG. ES: `seccion` — Sección del error. */
  readonly section: string
  /** EN: Line the error refers to, or null. ES: `linea` — Línea a la que se refiere el error, o null. */
  readonly line: number | null
  /** EN: Severity level, 1 to 3 (0 when the SII omits it). ES: `nivel` — Nivel de gravedad, 1 a 3 (0 si el SII lo omite). */
  readonly level: number
  /** EN: Error code. ES: `codigo` — Código del error. */
  readonly code: string
  /** EN: Error description. ES: `descripcion` — Descripción del error. */
  readonly description: string
  /** EN: Error detail. ES: `detalle` — Detalle del error. */
  readonly detail: string
}

/**
 * EN: Per-document result in the REST envelope status.
 * ES: Resultado por documento en el estado de envío REST (`detalle_rep_rech`).
 */
export type UploadStatusDocument = {
  /** EN: Document type. ES: `tipo` — Tipo de documento. */
  readonly type: string
  /** EN: Folio, or null. ES: `folio` — Folio, o null. */
  readonly folio: number | null
  /** EN: Document state (`DOK`, `RPR`, `RCH`, `RLV`). ES: `estado` — Estado del documento. */
  readonly code: string
  /** EN: Description. ES: `descripcion` — Descripción del estado. */
  readonly description: string
  /** EN: Errors found in the document. ES: `error` — Errores encontrados en el documento. */
  readonly errors: readonly UploadStatusDocumentError[]
}

/**
 * EN: Status of an upload.
 * ES: Estado de un envío.
 */
export type UploadStatus = {
  /** EN: SII status code. ES: `ESTADO` / `estado` — Código de estado del envío. */
  readonly code: string
  /** EN: Outcome class of the code on this channel. ES: Clase de resultado del código en este canal. */
  readonly status: UploadStatusClass
  /** EN: Spanish gloss from the SII, else from the catalog. ES: `GLOSA` — Glosa del SII, si no la del catálogo. */
  readonly message: string
  /** EN: TrackID that was asked about. ES: `TRACKID` / `trackid` — Identificador del envío consultado. */
  readonly trackId: string
  /** EN: Channel the answer came from. ES: Canal por el que respondió el SII. */
  readonly channel: TokenChannel
  /** EN: Counts when the SII reports them. ES: `INFORMADOS` … `REPAROS` — Cantidades cuando el SII las informa. */
  readonly counts: UploadStatusCounts | null
  /** EN: Document type the counts refer to (SOAP). ES: `TIPO_DOCTO` — Tipo de documento al que se refieren las cantidades (SOAP). */
  readonly documentType: string | null
  /** EN: Per-document detail (REST only). ES: `detalle_rep_rech` — Detalle por documento (solo REST). */
  readonly documents: readonly UploadStatusDocument[]
  /** EN: Raw SII answer: the unescaped `SII:RESPUESTA` (SOAP) or the JSON text (REST). ES: Respuesta cruda del SII: el `SII:RESPUESTA` des-escapado (SOAP) o el texto JSON (REST). */
  readonly raw: string
}

/**
 * EN: Input of `queryUploadStatus`.
 * ES: Entrada de `queryUploadStatus`.
 */
export type QueryUploadStatusInput = {
  /** EN: TrackID of the upload, digits only. ES: `TrackId` — Identificador del envío, solo dígitos. */
  readonly trackId: string
  /** EN: Company RUT; defaults to the client's. ES: `RutCompania` — RUT de la empresa; por defecto el del cliente. */
  readonly companyRut?: string
  /** EN: `soap` (default) or `rest` (receipts uploaded through the REST API). ES: `soap` (por defecto) o `rest` (boletas subidas por la API REST). */
  readonly channel?: TokenChannel
}

/**
 * EN: Input of `waitForUploadStatus`.
 * ES: Entrada de `waitForUploadStatus`.
 */
export type WaitForUploadStatusInput = QueryUploadStatusInput & {
  /** EN: Poll interval, ms (5 000). ES: Intervalo de sondeo, ms (5 000). */
  readonly intervalMs?: number
  /** EN: Give up after, ms (600 000). ES: Tiempo máximo de espera, ms (600 000). */
  readonly timeoutMs?: number
}

/**
 * EN: Status of one document.
 * ES: Estado de un documento.
 */
export type DocumentStatus = {
  /** EN: `DOK`, `DNK`, `FAU`, `FNA`, `FAN`, `EMP`, `TMD`, `TMC`, `MMD`, `MMC`, `AND`, `ANC`. ES: `ESTADO` / `codigo` — Código de estado del documento. */
  readonly code: string
  /** EN: Outcome class of the code. ES: Clase de resultado del código. */
  readonly status: DocumentStatusClass
  /** EN: Spanish gloss from the SII, else from the catalog. ES: `GLOSA_ESTADO` / `descripcion` — Glosa del SII, si no la del catálogo. */
  readonly message: string
  /** EN: Raw SII answer: the unescaped `SII:RESPUESTA` (SOAP) or the JSON text (REST). ES: Respuesta cruda del SII: el `SII:RESPUESTA` des-escapado (SOAP) o el texto JSON (REST). */
  readonly raw: string
}

/**
 * EN: Input of `queryDocumentStatus`.
 * ES: Entrada de `queryDocumentStatus`.
 */
export type QueryDocumentStatusInput = {
  /** EN: Company (issuer) RUT; defaults to the client's. ES: `RutCompania` — RUT de la empresa emisora; por defecto el del cliente. */
  readonly companyRut?: string
  /** EN: Receiver RUT. ES: `RutReceptor` / `rut_receptor` — RUT del receptor. */
  readonly receiverRut: string
  /** EN: Document type. ES: `TipoDte` / `tipo` — Tipo de documento. */
  readonly type: DocumentType
  /** EN: Folio. ES: `FolioDte` / `folio` — Folio del documento. */
  readonly folio: number
  /** EN: Issue date `YYYY-MM-DD`. ES: `FechaEmisionDte` / `fechaEmision` — Fecha de emisión `AAAA-MM-DD`. */
  readonly issueDate: string
  /** EN: Total amount, rounded to a whole number. ES: `MontoDte` / `monto` — Monto total, redondeado a entero. */
  readonly totalAmount: number
  /** EN: `soap` (default for invoices) or `rest` (default for receipts). ES: `soap` (por defecto en facturas) o `rest` (por defecto en boletas). */
  readonly channel?: TokenChannel
}

/**
 * EN: Input of `folioReceived`.
 * ES: Entrada de `folioReceived`.
 */
export type FolioReceivedInput = {
  /** EN: Company (issuer) RUT; defaults to the client's. ES: `RutCompania` — RUT de la empresa emisora; por defecto el del cliente. */
  readonly companyRut?: string
  /** EN: Document type of the folio. ES: `TipoDte` — Tipo de documento del folio. */
  readonly type: DocumentType
  /** EN: Folio to look up. ES: `FolioDte` — Folio a consultar. */
  readonly folio: number
}

const DEFAULT_INTERVAL_MS = 5000
const DEFAULT_WAIT_MS = 600000
const NEGATIVE = /^-\d+$/
// A TrackID is interpolated into a URL path and into a SOAP parameter, so nothing but digits gets through: it cannot
// add a path segment, a query string or markup. The SII issues at most 15 digits; the bound is generous.
const TRACK_ID_PATTERN = /^\d{1,20}$/
const RECEIVED_GLOSS = /\brecibido\b/i
const NOT_RECEIVED_GLOSS = /\bno\s+recibido\b/i

const requireTrackId = (value: unknown): string => {
  if (typeof value !== 'string' || !TRACK_ID_PATTERN.test(value))
    throw new DteError('INVALID_OPTION', { field: 'trackId' })
  return value
}

const requireChannel = (value: TokenChannel | undefined, fallback: TokenChannel): TokenChannel => {
  if (value === undefined) return fallback
  if (value !== 'soap' && value !== 'rest') throw new DteError('INVALID_OPTION', { field: 'channel' })
  return value
}

const positiveOption = (value: number | undefined, fallback: number, field: string): number => {
  if (value === undefined) return fallback
  if (!(Number.isFinite(value) && value > 0)) throw new DteError('INVALID_OPTION', { field })
  return value
}

// The gloss the SII sent, or null when it is absent or blank (the SII sends empty elements such as `<GLOSA_ERR/>`).
const gloss = (value: string | null): string | null => {
  const text = value?.trim() ?? ''
  return text === '' ? null : text
}

const numberOrNull = (value: string | null): number | null => {
  if (value === null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const asRecord = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : {}
const asArray = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : [])
const str = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

const toDocumentError = (value: unknown): UploadStatusDocumentError => {
  const error = asRecord(value)
  return {
    section: str(error.seccion),
    line: num(error.linea),
    level: num(error.nivel) ?? 0,
    code: str(error.codigo),
    description: str(error.descripcion),
    detail: str(error.detalle),
  }
}

const toDocument = (value: unknown): UploadStatusDocument => {
  const document = asRecord(value)
  return {
    type: str(document.tipo),
    folio: num(document.folio),
    code: str(document.estado),
    description: str(document.descripcion),
    errors: asArray(document.error).map(toDocumentError),
  }
}

const sumCounts = (stats: readonly unknown[]): UploadStatusCounts =>
  stats.reduce<UploadStatusCounts>(
    (acc, value) => {
      const entry = asRecord(value)
      return {
        reported: acc.reported + (num(entry.informados) ?? 0),
        accepted: acc.accepted + (num(entry.aceptados) ?? 0),
        rejected: acc.rejected + (num(entry.rechazados) ?? 0),
        objections: acc.objections + (num(entry.reparos) ?? 0),
      }
    },
    { reported: 0, accepted: 0, rejected: 0, objections: 0 },
  )

// A token the SII refuses renews once in `withToken`; any other negative `ESTADO` is a transient failure of the query
// service itself, which the retry policy repeats.
const assertStatusCode = (code: string, operation: string, xml: string): void => {
  if (isTokenErrorStatus(code)) throw new DteError('SII_TOKEN_INVALID', { operation, channel: 'soap', code })
  if (NEGATIVE.test(code))
    throw new DteError('SII_QUERY_ERROR', {
      operation,
      code,
      reason: gloss(extractTagContent(xml, 'ERR_CODE')) ?? gloss(extractTagContent(xml, 'GLOSA_ERR')) ?? '',
    })
}

const soapUploadStatus = async (
  sii: SiiClient,
  token: string,
  companyRut: SiiRut,
  trackId: string,
  attempt: number,
  overrides?: CallOverrides,
): Promise<UploadStatus> => {
  const company = splitSiiRut(companyRut)
  const xml = await soapCall(sii, {
    operation: 'queryUploadStatus',
    url: sii.endpoints.soap.uploadStatus,
    method: 'getEstUp',
    // The order is the WSDL's: Axis matches the parameters by position, not by name.
    params: [
      { name: 'RutCompania', value: company.body },
      { name: 'DvCompania', value: company.verifier },
      { name: 'TrackId', value: trackId },
      { name: 'Token', value: token },
    ],
    attempt,
    overrides,
  })
  const { code, message } = readSiiResponse(xml, 'queryUploadStatus')
  assertStatusCode(code, 'queryUploadStatus', xml)
  const reported = numberOrNull(extractTagContent(xml, 'INFORMADOS'))
  return {
    code,
    status: classifyUploadStatus(code, 'soap'),
    message: gloss(message) ?? uploadStatusMessage(code, 'soap'),
    trackId,
    channel: 'soap',
    counts:
      reported === null
        ? null
        : {
            reported,
            accepted: numberOrNull(extractTagContent(xml, 'ACEPTADOS')) ?? 0,
            rejected: numberOrNull(extractTagContent(xml, 'RECHAZADOS')) ?? 0,
            objections: numberOrNull(extractTagContent(xml, 'REPAROS')) ?? 0,
          },
    documentType: extractTagContent(xml, 'TIPO_DOCTO'),
    documents: [],
    raw: xml,
  }
}

const restHeaders = (token: string): Readonly<Record<string, string>> => ({
  Cookie: `TOKEN=${token}`,
  Accept: 'application/json',
})

const restJson = async (
  sii: SiiClient,
  operation: string,
  url: string,
  token: string,
  attempt: number,
  overrides?: CallOverrides,
): Promise<{ readonly json: Readonly<Record<string, unknown>>; readonly text: string }> => {
  const { response, text } = await restCall(sii, {
    operation,
    method: 'GET',
    url,
    headers: restHeaders(token),
    attempt,
    overrides,
  })
  if (response.status === 401) throw new DteError('SII_TOKEN_INVALID', { operation, channel: 'rest', httpStatus: 401 })
  if (!isSuccess(response.status)) throw httpError(response, text, operation, 'rest', url)
  return { json: parseJson(text, operation), text }
}

const restUploadStatus = async (
  sii: SiiClient,
  token: string,
  companyRut: SiiRut,
  trackId: string,
  attempt: number,
  overrides?: CallOverrides,
): Promise<UploadStatus> => {
  const company = splitSiiRut(companyRut)
  const url = `${sii.endpoints.rest.status}${company.body}-${company.verifier}-${trackId}`
  const { json, text } = await restJson(sii, 'queryUploadStatus', url, token, attempt, overrides)
  const code = str(json.estado)
  if (code === '')
    throw new DteError('SII_RESPONSE_INVALID', { operation: 'queryUploadStatus', body: bodyExcerpt(text) })
  const stats = asArray(json.estadistica)
  return {
    code,
    status: classifyUploadStatus(code, 'rest'),
    message: uploadStatusMessage(code, 'rest'),
    trackId,
    channel: 'rest',
    counts: stats.length === 0 ? null : sumCounts(stats),
    documentType: null,
    documents: asArray(json.detalle_rep_rech).map(toDocument),
    raw: text,
  }
}

/**
 * EN: Status of an upload by TrackID: `QueryEstUp` on the `soap` channel (default) or the receipts REST envelope
 * status on `rest`. Unlike an upload, a status query is safe to repeat, so it follows the normal retry policy: query
 * errors (`-1` … `-14`), transport failures and 5xx answers are retried. A token the SII refuses (`-3`, `-13`,
 * `001`–`003`, HTTP 401) renews the token once. The TrackID must be digits only.
 * ES: Estado de un envío por TrackID: `QueryEstUp` por el canal `soap` (por defecto) o el estado de envío REST de
 * boletas por `rest`. A diferencia de una subida, una consulta de estado se puede repetir sin riesgo, así que sigue la
 * política de reintentos normal: errores de consulta (`-1` … `-14`), fallas de transporte y respuestas 5xx se
 * reintentan. Un token que el SII rechaza (`-3`, `-13`, `001`–`003`, HTTP 401) renueva el token una vez. El TrackID
 * debe ser solo dígitos.
 * @throws {DteError} EN: `SII_QUERY_ERROR { code }`, `SII_TOKEN_INVALID`, `SII_HTTP_ERROR`, `SII_RESPONSE_INVALID`, `SII_SOAP_FAULT`, `INVALID_OPTION { field: 'trackId' | 'channel' }`, `MISSING_FIELD`, `INVALID_RUT`, transport codes. ES: los mismos códigos.
 */
export const queryUploadStatus = async (
  sii: SiiClient,
  input: QueryUploadStatusInput,
  overrides?: CallOverrides,
): Promise<UploadStatus> => {
  const trackId = requireTrackId(input.trackId)
  const channel = requireChannel(input.channel, 'soap')
  const companyRut = resolveCompanyRut(sii, input.companyRut)
  return withToken(sii, channel, overrides, (token) =>
    withRetry(
      retryFor(sii, overrides),
      (attempt) =>
        channel === 'rest'
          ? restUploadStatus(sii, token, companyRut, trackId, attempt, overrides)
          : soapUploadStatus(sii, token, companyRut, trackId, attempt, overrides),
      retryOptions(sii, 'queryUploadStatus', overrides),
    ),
  )
}

// One poll: the status, or only the code of the retryable failure that stood in for it.
type Poll = { readonly status: UploadStatus | null; readonly code: string }

// A failure worth repeating (`isRetryableError`) is not the end of a wait: the next poll is the retry. The SII's own
// query errors report their `-1` … `-14` code; any other one reports its error code. Everything else ends the wait.
const pollOnce = (sii: SiiClient, input: QueryUploadStatusInput, overrides: CallOverrides): Promise<Poll> =>
  queryUploadStatus(sii, input, overrides).then(
    (status): Poll => ({ status, code: status.code }),
    (error: unknown): Poll => {
      if (!isDteError(error) || !isRetryableError(error)) throw error
      return { status: null, code: error.code === 'SII_QUERY_ERROR' ? String(error.details.code) : error.code }
    },
  )

/**
 * EN: Polls `queryUploadStatus` every `intervalMs` until the status is no longer `pending`, up to `timeoutMs`. During a
 * wait the polling interval replaces the retry policy: each poll is a single request (the client's and the call's
 * `retry` are ignored), its timeout is the smaller of the normal timeout of the call and the time remaining, and the
 * sleep between polls is the smaller of `intervalMs` and the time remaining, so the wait ends at `timeoutMs` and not
 * after a retry policy has run its course on every poll (a poll that has to renew the token makes up to three requests,
 * each with that timeout). An error that `isRetryableError` accepts (the SII's query errors `-1` … `-14`, transport
 * failures and timeouts, HTTP 429/405/5xx, unreadable pages) counts as pending, so a flaky query service does not end
 * the wait; any other error (invalid token, HTTP 4xx, a failed handshake) ends it at once. The wait ends with
 * `WAIT_TIMEOUT { trackId, attempts, lastCode }` only when `timeoutMs` elapses; `lastCode` is the last status code or
 * query-error code, or the error code of a retryable failure (`REQUEST_TIMEOUT`…), so it tells which. It uses the
 * client's `now` and `sleep`, and stops with `REQUEST_ABORTED` when the caller's `signal` fires.
 * ES: Sondea `queryUploadStatus` cada `intervalMs` hasta que el estado deje de ser `pending`, hasta `timeoutMs`.
 * Durante la espera el intervalo de sondeo reemplaza a la política de reintentos: cada sondeo es una sola petición (el
 * `retry` del cliente y el de la llamada se ignoran), su timeout es el menor entre el timeout normal de la llamada y el
 * tiempo que queda, y la pausa entre sondeos es la menor entre `intervalMs` y el tiempo que queda, así que la espera
 * termina en `timeoutMs` y no después de que la política de reintentos se agote en cada sondeo (un sondeo que debe
 * renovar el token hace hasta tres peticiones, cada una con ese timeout). Un error que `isRetryableError` acepta (los
 * errores de consulta del SII `-1` … `-14`, fallas de transporte y timeouts, HTTP 429/405/5xx, páginas ilegibles) cuenta
 * como pendiente, así que un servicio de consulta inestable no termina la espera; cualquier otro error (token inválido,
 * HTTP 4xx, un intercambio de token fallido) la termina de inmediato. La espera termina con `WAIT_TIMEOUT { trackId,
 * attempts, lastCode }` solo cuando se cumple `timeoutMs`; `lastCode` es el último código de estado o de error de
 * consulta, o el código de error de una falla reintentable (`REQUEST_TIMEOUT`…), así que dice cuál fue. Usa el `now` y
 * el `sleep` del cliente, y se detiene con `REQUEST_ABORTED` cuando se dispara el `signal` del llamador.
 * @throws {DteError} EN: `WAIT_TIMEOUT { trackId, attempts, lastCode }`, `REQUEST_ABORTED`, `INVALID_OPTION { field: 'intervalMs' | 'timeoutMs' }` plus whatever `queryUploadStatus` throws. ES: `WAIT_TIMEOUT { trackId, attempts, lastCode }`, `REQUEST_ABORTED`, `INVALID_OPTION { field: 'intervalMs' | 'timeoutMs' }` más lo que lance `queryUploadStatus`.
 */
export const waitForUploadStatus = async (
  sii: SiiClient,
  input: WaitForUploadStatusInput,
  overrides?: CallOverrides,
): Promise<UploadStatus> => {
  const intervalMs = positiveOption(input.intervalMs, DEFAULT_INTERVAL_MS, 'intervalMs')
  const timeoutMs = positiveOption(input.timeoutMs, DEFAULT_WAIT_MS, 'timeoutMs')
  // An unknown channel is reported by the first poll, which validates it; here it only picks the normal timeout.
  const normalMs = timeoutFor(sii, input.channel === 'rest' ? 'rest' : 'soap', overrides)
  const deadline = sii.now().getTime() + timeoutMs
  const poll = async (polled: number, lastCode: string): Promise<UploadStatus> => {
    // An injected `sleep` may ignore the signal, so it is checked here as well as handed to `sleep`.
    if (overrides?.signal?.aborted) throw new DteError('REQUEST_ABORTED', { operation: 'waitForUploadStatus' })
    const remainingMs = deadline - sii.now().getTime()
    if (remainingMs <= 0) throw new DteError('WAIT_TIMEOUT', { trackId: input.trackId, attempts: polled, lastCode })
    const outcome = await pollOnce(sii, input, {
      ...overrides,
      retry: false,
      timeoutMs: Math.min(normalMs, remainingMs),
    })
    if (outcome.status !== null && outcome.status.status !== 'pending') return outcome.status
    const leftMs = deadline - sii.now().getTime()
    if (leftMs > 0) await sii.sleep(Math.min(intervalMs, leftMs), overrides?.signal)
    return poll(polled + 1, outcome.code)
  }
  return poll(0, '')
}

type DocumentQuery = {
  readonly companyRut: SiiRut
  readonly receiverRut: SiiRut
  readonly type: DocumentType
  readonly folio: number
  readonly issueDate: string
  readonly amount: number
}

const dateParts = (isoDate: string): { readonly day: string; readonly month: string; readonly year: string } => {
  const [year, month, day] = isoDate.split('-')
  return { day, month, year }
}

const buildDocumentQuery = (sii: SiiClient, input: QueryDocumentStatusInput): DocumentQuery => {
  if (!isDocumentType(input.type)) throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type' })
  const companyRut = resolveCompanyRut(sii, input.companyRut)
  const receiverRut = toSiiRut(input.receiverRut, 'receiverRut')
  const issueDate = toIsoDate(input.issueDate, 'issueDate')
  // Folio and type end up in a URL path, so they must be plain integers, not strings that merely look like one.
  if (!Number.isSafeInteger(input.folio) || input.folio <= 0) throw new DteError('INVALID_FOLIO', { field: 'folio' })
  const amount = Math.round(input.totalAmount)
  if (!Number.isSafeInteger(amount) || amount < 0) throw new DteError('INVALID_AMOUNT', { field: 'totalAmount' })
  return { companyRut, receiverRut, type: input.type, folio: input.folio, issueDate, amount }
}

const soapDocumentStatus = async (
  sii: SiiClient,
  token: string,
  query: DocumentQuery,
  attempt: number,
  overrides?: CallOverrides,
): Promise<DocumentStatus> => {
  // The consultant is whoever authenticates, i.e. the sender, not the company the document belongs to.
  const consultant = splitSiiRut(sii.senderRut)
  const company = splitSiiRut(query.companyRut)
  const receiver = splitSiiRut(query.receiverRut)
  const { day, month, year } = dateParts(query.issueDate)
  const xml = await soapCall(sii, {
    operation: 'queryDocumentStatus',
    url: sii.endpoints.soap.documentStatus,
    method: 'getEstDte',
    // The order is the WSDL's: Axis matches the parameters by position, not by name.
    params: [
      { name: 'RutConsultante', value: consultant.body },
      { name: 'DvConsultante', value: consultant.verifier },
      { name: 'RutCompania', value: company.body },
      { name: 'DvCompania', value: company.verifier },
      { name: 'RutReceptor', value: receiver.body },
      { name: 'DvReceptor', value: receiver.verifier },
      { name: 'TipoDte', value: String(query.type) },
      { name: 'FolioDte', value: String(query.folio) },
      { name: 'FechaEmisionDte', value: `${day}${month}${year}` },
      { name: 'MontoDte', value: String(query.amount) },
      { name: 'Token', value: token },
    ],
    attempt,
    overrides,
  })
  const { code, message } = readSiiResponse(xml, 'queryDocumentStatus')
  assertStatusCode(code, 'queryDocumentStatus', xml)
  return {
    code,
    status: classifyDocumentStatus(code),
    message: gloss(extractTagContent(xml, 'GLOSA_ESTADO')) ?? gloss(message) ?? documentStatusMessage(code),
    raw: xml,
  }
}

const queryString = (entries: readonly (readonly [string, string])[]): string =>
  entries.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')

const restDocumentStatus = async (
  sii: SiiClient,
  token: string,
  query: DocumentQuery,
  attempt: number,
  overrides?: CallOverrides,
): Promise<DocumentStatus> => {
  const company = splitSiiRut(query.companyRut)
  const receiver = splitSiiRut(query.receiverRut)
  const { day, month, year } = dateParts(query.issueDate)
  const url =
    `${sii.endpoints.rest.documentStatus}${company.body}-${company.verifier}-${query.type}-${query.folio}/estado?` +
    queryString([
      ['rut_receptor', receiver.body],
      ['dv_receptor', receiver.verifier],
      ['monto', String(query.amount)],
      ['fechaEmision', `${day}-${month}-${year}`],
    ])
  const { json, text } = await restJson(sii, 'queryDocumentStatus', url, token, attempt, overrides)
  const code = str(json.codigo)
  if (code === '')
    throw new DteError('SII_RESPONSE_INVALID', { operation: 'queryDocumentStatus', body: bodyExcerpt(text) })
  return {
    code,
    status: classifyDocumentStatus(code),
    message: gloss(str(json.descripcion)) ?? documentStatusMessage(code),
    raw: text,
  }
}

/**
 * EN: Status of one document: `QueryEstDte` (SOAP, the default for every type except receipts) or the receipts REST
 * per-document endpoint (the default for 39 and 41; the REST API answers about ten minutes after the upload). Same
 * retry and token renewal rules as `queryUploadStatus`. The amount is rounded to a whole number and the date is sent
 * as `DDMMYYYY` (SOAP) or `DD-MM-YYYY` (REST).
 * ES: Estado de un documento: `QueryEstDte` (SOAP, por defecto en todos los tipos salvo boletas) o el endpoint REST
 * por documento de boletas (por defecto en 39 y 41; la API REST responde unos diez minutos después del envío). Mismas
 * reglas de reintento y renovación de token que `queryUploadStatus`. El monto se redondea a entero y la fecha se envía
 * como `DDMMAAAA` (SOAP) o `DD-MM-AAAA` (REST).
 * @throws {DteError} EN: `INVALID_DOCUMENT_TYPE`, `INVALID_RUT`, `INVALID_FOLIO`, `INVALID_AMOUNT`, `INVALID_DATE`, `INVALID_OPTION { field: 'channel' }`, `MISSING_FIELD`, then the codes of `queryUploadStatus`. ES: los mismos códigos.
 */
export const queryDocumentStatus = async (
  sii: SiiClient,
  input: QueryDocumentStatusInput,
  overrides?: CallOverrides,
): Promise<DocumentStatus> => {
  const query = buildDocumentQuery(sii, input)
  const channel = requireChannel(input.channel, isReceipt(query.type) ? 'rest' : 'soap')
  return withToken(sii, channel, overrides, (token) =>
    withRetry(
      retryFor(sii, overrides),
      (attempt) =>
        channel === 'rest'
          ? restDocumentStatus(sii, token, query, attempt, overrides)
          : soapDocumentStatus(sii, token, query, attempt, overrides),
      retryOptions(sii, 'queryDocumentStatus', overrides),
    ),
  )
}

/**
 * EN: Whether the SII already holds a document with this type and folio: `QueryEstDte` (always SOAP) with the
 * final-consumer receiver, today's date in Chile and amount 1 answers by folio existence first. `FAU` is `false`
 * (the folio is free); `DOK` and `DNK`, or a gloss that says "recibido" (and not "no recibido"), are `true` (the
 * folio is used); anything else is `null`: undetermined, the caller decides. Prevents reusing a folio obtained again
 * from a CAF, which the SII rejects.
 * ES: Si el SII ya tiene un documento con este tipo y folio: `QueryEstDte` (siempre SOAP) con el receptor consumidor
 * final, la fecha de hoy en Chile y monto 1 responde primero por existencia del folio. `FAU` es `false` (el folio
 * está libre); `DOK` y `DNK`, o una glosa que diga "recibido" (y no "no recibido"), son `true` (el folio está usado);
 * todo lo demás es `null`: indeterminado, decide el llamador. Evita reutilizar un folio reobtenido de un CAF, que el
 * SII rechaza.
 * @throws {DteError} EN: the codes of `queryDocumentStatus`. ES: los códigos de `queryDocumentStatus`.
 */
export const folioReceived = async (
  sii: SiiClient,
  input: FolioReceivedInput,
  overrides?: CallOverrides,
): Promise<boolean | null> => {
  const status = await queryDocumentStatus(
    sii,
    {
      companyRut: input.companyRut,
      receiverRut: FINAL_CONSUMER_RUT,
      type: input.type,
      folio: input.folio,
      issueDate: chileDate(sii.now()),
      totalAmount: 1,
      channel: 'soap',
    },
    overrides,
  )
  if (status.code === 'FAU') return false
  if (status.code === 'DOK' || status.code === 'DNK') return true
  return RECEIVED_GLOSS.test(status.message) && !NOT_RECEIVED_GLOSS.test(status.message) ? true : null
}
