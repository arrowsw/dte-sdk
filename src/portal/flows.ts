import { isCafExpired } from '../caf/validity'
import type { DocumentType } from '../catalogs/document-types'
import type { PortalRejection } from '../catalogs/portal'
import { errorMessage, isDteError } from '../errors'
import type { CallOverrides } from '../sii/client'
import { annulFoliosInSession } from './annulment'
import type { PortalClient } from './client'
import { listReobtainableInSession, reobtainCafInSession, type ReobtainableRange } from './reobtain'
import { withPortalSession, type PortalContext } from './session'
import { queryFolioQuotaInSession, requestCafInSession, type FolioQuota, type ObtainedCaf } from './stamping'

const DEFAULT_MAX_BATCHES = 4
const DEFAULT_MAX_CHECKS_PER_RANGE = 30
const MAX_RANGES_TO_ANNUL = 20

/**
 * EN: The outcome of a composite flow. Refusals come back as data, because the flow may already hold CAFs: those must
 * reach the caller, and a CAF cannot travel in an error's details, which get logged.
 * ES: El resultado de un flujo compuesto. Los rechazos vuelven como datos, porque el flujo puede tener ya CAF en la mano:
 * esos deben llegar a quien llama, y un CAF no puede viajar en los detalles de un error, que se registran.
 */
export type FolioFlowResult = {
  /** EN: The quantity asked for was covered. ES: Se cubrió la cantidad pedida. */
  readonly complete: boolean
  /** EN: Every CAF obtained, even when falling short. ES: Todos los CAF obtenidos, aunque no alcancen. */
  readonly cafs: readonly ObtainedCaf[]
  /** EN: Folios covered. ES: Folios cubiertos. */
  readonly granted: number
  /** EN: Last `MAX_AUTOR` seen, or null. ES: `MAX_AUTOR` — Último máximo visto, o null. */
  readonly maxAuthorized: number | null
  /** EN: Last `FOLIOS_DISP` seen, or null. ES: `FOLIOS_DISP` — Último valor visto, o null. */
  readonly availableFolios: number | null
  /** EN: Why it fell short, or null. ES: Por qué no alcanzó, o null. */
  readonly rejection: PortalRejection | null
  /** EN: What the portal said, or null. ES: Lo que dijo el portal, o null. */
  readonly portalMessage: string | null
}

// A refusal of the SII turns into data; a transport failure, a block or an expired session stays an error.
const asRefusal = (
  error: unknown,
): { readonly rejection: PortalRejection; readonly details: Readonly<Record<string, unknown>> } => {
  if (!isDteError(error) || error.code !== 'SII_PORTAL_REJECTED') throw error
  return { rejection: error.details.rejection as PortalRejection, details: error.details }
}

const refusalResult = (
  cafs: readonly ObtainedCaf[],
  rejection: PortalRejection,
  details: Readonly<Record<string, unknown>>,
): FolioFlowResult => ({
  complete: false,
  cafs,
  granted: cafs.reduce((total, caf) => total + caf.granted, 0),
  maxAuthorized: typeof details.maxAuthorized === 'number' ? details.maxAuthorized : null,
  availableFolios: typeof details.availableFolios === 'number' ? details.availableFolios : null,
  rejection,
  // Every refusal these flows can meet carries what the portal said.
  portalMessage: details.portalMessage as string,
})

/**
 * EN: Input of `requestCafExact`.
 * ES: Entrada de `requestCafExact`.
 */
export type RequestCafExactInput = {
  /** EN: Document type. ES: `COD_DOCTO` — Tipo de documento. */
  readonly type: DocumentType
  /** EN: Folios needed in one CAF. ES: Folios necesarios en un CAF. */
  readonly quantity: number
  /** EN: Annul unused folios to lift the limit, and ask once more. Off by default: it cannot be undone and counts against the quota for six months. ES: Anular folios sin usar para levantar el límite y pedir una vez más. Apagado por defecto: no se puede deshacer y pesa contra el cupo seis meses. */
  readonly allowAnnul?: boolean
  /** EN: Folios annulling never touches, such as a CAF still in use. ES: Folios que la anulación no toca, como un CAF todavía en uso. */
  readonly exclude?: readonly { readonly from: number; readonly to: number }[]
  /** EN: `knownAnnulled` of the previous run: these are not tried again. ES: `knownAnnulled` de la corrida anterior: estos no se vuelven a intentar. */
  readonly knownAnnulled?: readonly string[]
  /** EN: Company RUT; the client's by default. ES: `RUT_EMP` + `DV_EMP` — RUT de la empresa; por defecto el del cliente. */
  readonly companyRut?: string
}

/**
 * EN: The outcome of `requestCafExact`, plus the memory of annulled ranges.
 * ES: El resultado de `requestCafExact`, más la memoria de rangos anulados.
 */
export type RequestCafExactResult = FolioFlowResult & {
  /** EN: `from-to` keys that are final: persist it and pass it back, because the portal keeps listing them forever. ES: Claves `desde-hasta` definitivas: guárdalas y devuélvelas, porque el portal las sigue listando para siempre. */
  readonly knownAnnulled: readonly string[]
}

const fromCaf = (caf: ObtainedCaf, quantity: number): FolioFlowResult => ({
  complete: caf.granted >= quantity,
  cafs: [caf],
  granted: caf.granted,
  maxAuthorized: caf.maxAuthorized,
  availableFolios: caf.availableFolios,
  rejection: caf.granted >= quantity ? null : 'foliosShort',
  portalMessage: null,
})

/**
 * EN: Requests one CAF that covers the whole quantity; below it nothing is stamped. With `allowAnnul`, a limit caused by
 * unused folios is lifted by annulling up to 20 ranges in each of up to four passes (80 ranges in all), never those in
 * `exclude`, and asking once more. `FOLIOS_DISP` 0 means nothing is annullable, so that attempt is skipped; while
 * blocked the field is absent, and that case does try.
 * ES: Solicita un CAF que cubra toda la cantidad; bajo ella no se timbra nada. Con `allowAnnul`, un límite causado por folios
 * sin usar se levanta anulando hasta 20 rangos en cada una de hasta cuatro pasadas (80 rangos en total), nunca los de
 * `exclude`, y pidiendo una vez más. `FOLIOS_DISP` 0 significa que nada es anulable, así que ese intento se omite; con
 * el timbraje bloqueado el campo no viene, y ese caso sí lo intenta.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: type, quantity and whether annulling is allowed. ES: tipo, cantidad y si se permite anular.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the outcome, where a refusal is data, and the memory to persist. ES: el resultado, donde un rechazo es un dato, y la memoria que guardar.
 * @throws {DteError} EN: session, block and transport codes. ES: códigos de sesión, bloqueo y transporte.
 */
export const requestCafExact = (
  portal: PortalClient,
  input: RequestCafExactInput,
  overrides?: CallOverrides,
): Promise<RequestCafExactResult> =>
  withPortalSession(portal, 'requestCafExact', overrides, async (context) => {
    const ask = async (): Promise<FolioFlowResult> => {
      try {
        const caf = await requestCafInSession(context, {
          type: input.type,
          quantity: input.quantity,
          minQuantity: input.quantity,
          ...(input.companyRut === undefined ? {} : { companyRut: input.companyRut }),
        })
        return fromCaf(caf, input.quantity)
      } catch (error) {
        const refusal = asRefusal(error)
        return refusalResult([], refusal.rejection, refusal.details)
      }
    }
    const known = input.knownAnnulled ?? []
    const first = await ask()
    const recoverable = first.rejection === 'quotaInsufficient' || first.rejection === 'stampingBlocked'
    if (!recoverable || input.allowAnnul !== true || first.availableFolios === 0)
      return { ...first, knownAnnulled: known }
    const annulment = await annulFoliosInSession(context, {
      type: input.type,
      all: true,
      maxRanges: MAX_RANGES_TO_ANNUL,
      knownAnnulled: known,
      ...(input.exclude === undefined ? {} : { exclude: input.exclude }),
      ...(input.companyRut === undefined ? {} : { companyRut: input.companyRut }),
    }).catch((error: unknown) => asRefusal(error))
    if ('rejection' in annulment)
      return {
        ...first,
        rejection: annulment.rejection,
        portalMessage: annulment.details.portalMessage as string,
        knownAnnulled: known,
      }
    if (annulment.totalAnnulled === 0)
      return {
        ...first,
        rejection: 'noAnnullableFolios',
        portalMessage: first.portalMessage,
        knownAnnulled: annulment.knownAnnulled,
      }
    return { ...(await ask()), knownAnnulled: annulment.knownAnnulled }
  })

/**
 * EN: Input of `requestCafInBatches`.
 * ES: Entrada de `requestCafInBatches`.
 */
export type RequestCafInBatchesInput = {
  /** EN: Document type. ES: `COD_DOCTO` — Tipo de documento. */
  readonly type: DocumentType
  /** EN: Folios to cover in total. ES: Folios por cubrir en total. */
  readonly quantity: number
  /** EN: Most trips to the portal; 4 by default. ES: Máximo de viajes al portal; 4 por defecto. */
  readonly maxBatches?: number
  /** EN: A quota already read, to skip the first reading. ES: Un cupo ya leído, para omitir la primera lectura. */
  readonly initialQuota?: FolioQuota
  /** EN: Company RUT; the client's by default. ES: `RUT_EMP` + `DV_EMP` — RUT de la empresa; por defecto el del cliente. */
  readonly companyRut?: string
}

/**
 * EN: Covers a quantity across several CAFs, for when `FOLIOS_DISP` is 0 and `MAX_AUTOR` is small: the SII rations by
 * history, there is nothing to annul or download again, and waiting does not move it. It stops as soon as a batch adds
 * nothing, because every grant raises `FOLIOS_DISP` and can lower the next `MAX_AUTOR`.
 * ES: Cubre una cantidad con varios CAF, para cuando `FOLIOS_DISP` es 0 y `MAX_AUTOR` es chico: el SII raciona por historial,
 * no hay nada que anular ni reobtener, y esperar no lo mueve. Se detiene apenas una tanda no aporta, porque cada entrega sube
 * `FOLIOS_DISP` y puede bajar el próximo `MAX_AUTOR`.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: type, quantity and limits. ES: tipo, cantidad y límites.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the outcome, with whatever was obtained. ES: el resultado, con lo que se haya obtenido.
 * @throws {DteError} EN: session, block and transport codes. ES: códigos de sesión, bloqueo y transporte.
 */
export const requestCafInBatches = (
  portal: PortalClient,
  input: RequestCafInBatchesInput,
  overrides?: CallOverrides,
): Promise<FolioFlowResult> =>
  withPortalSession(portal, 'requestCafInBatches', overrides, async (context) => {
    const company = input.companyRut === undefined ? {} : { companyRut: input.companyRut }
    const maxBatches = input.maxBatches ?? DEFAULT_MAX_BATCHES
    const batch = async (
      number: number,
      cafs: readonly ObtainedCaf[],
      covered: number,
      lastQuota: FolioQuota | null,
    ): Promise<FolioFlowResult> => {
      const seen = {
        maxAuthorized: lastQuota?.maxAuthorized ?? null,
        availableFolios: lastQuota?.availableFolios ?? null,
      }
      const capReached = (): FolioFlowResult => ({
        complete: false,
        cafs,
        granted: covered,
        ...seen,
        rejection: 'quotaCapReached',
        portalMessage: null,
      })
      if (covered >= input.quantity)
        return { complete: true, cafs, granted: covered, ...seen, rejection: null, portalMessage: null }
      if (number > maxBatches) return capReached()
      const quota =
        number === 1 && input.initialQuota !== undefined
          ? input.initialQuota
          : await queryFolioQuotaInSession(context, { type: input.type, ...company }).catch((error: unknown) =>
              asRefusal(error),
            )
      if ('rejection' in quota) return refusalResult(cafs, quota.rejection, quota.details)
      const missing = input.quantity - covered
      const wanted = quota.unrestricted ? missing : Math.min(quota.maxAuthorized ?? 0, missing)
      const current = { maxAuthorized: quota.maxAuthorized, availableFolios: quota.availableFolios }
      if (wanted <= 0)
        return {
          complete: false,
          cafs,
          granted: covered,
          ...current,
          rejection: 'quotaCapReached',
          portalMessage: null,
        }
      const outcome = await requestCafInSession(context, {
        type: input.type,
        quantity: wanted,
        minQuantity: 1,
        ...company,
      }).catch((error: unknown) => asRefusal(error))
      if ('rejection' in outcome) {
        return covered === 0
          ? refusalResult(cafs, outcome.rejection, { ...outcome.details, ...current })
          : { complete: false, cafs, granted: covered, ...current, rejection: 'quotaCapReached', portalMessage: null }
      }
      return batch(number + 1, [...cafs, outcome], covered + outcome.granted, quota)
    }
    return batch(1, [], 0, null)
  })

/**
 * EN: Input of `reobtainFolios`.
 * ES: Entrada de `reobtainFolios`.
 */
export type ReobtainFoliosInput = {
  /** EN: Document type. ES: `COD_DOCTO` — Tipo de documento. */
  readonly type: DocumentType
  /** EN: Folios to cover. ES: Folios por cubrir. */
  readonly quantity: number
  /** EN: The caller's record of ranges already sent to the SII, which the portal does not mark. ES: El registro de quien llama de los rangos ya enviados al SII, que el portal no marca. */
  readonly isIssued?: (range: { readonly from: number; readonly to: number }) => boolean | Promise<boolean>
  /** EN: Confirms a folio at the SII, typically with `folioReceived`. ES: Confirma un folio en el SII, normalmente con `folioReceived`. */
  readonly isFolioFree?: (folio: number) => boolean | Promise<boolean>
  /** EN: Most checks per range; 30 by default. ES: Máximo de consultas por rango; 30 por defecto. */
  readonly maxChecksPerRange?: number
  /** EN: Company RUT; the client's by default. ES: `RUT_EMP` + `DV_EMP` — RUT de la empresa; por defecto el del cliente. */
  readonly companyRut?: string
}

/**
 * EN: What `reobtainFolios` obtained. What was downloaded comes back even when it falls short, so the caller asks only
 * for the difference.
 * ES: Lo que obtuvo `reobtainFolios`. Lo descargado vuelve aunque no alcance, así quien llama pide solo la diferencia.
 */
export type ReobtainResult = {
  /** EN: The quantity was covered. ES: Se cubrió la cantidad. */
  readonly complete: boolean
  /** EN: The CAFs downloaded. ES: Los CAF descargados. */
  readonly cafs: readonly ObtainedCaf[]
  /** EN: Each range used and its free folios. ES: Cada rango usado y sus folios libres. */
  readonly ranges: readonly { readonly from: number; readonly to: number; readonly freeFolios: readonly number[] }[]
  /** EN: Ranges whose CAF already expired: they do not count and should be annulled. ES: Rangos cuyo CAF ya venció: no cuentan y conviene anularlos. */
  readonly expired: readonly { readonly from: number; readonly to: number; readonly authorizationDate: string | null }[]
  /** EN: Free folios covered. ES: Folios libres cubiertos. */
  readonly available: number
  /** EN: Why it fell short, in words, or null; when the listing failed, the message of that failure. ES: Por qué no alcanzó, en palabras, o null; si el listado falló, el mensaje de ese fallo. */
  readonly reason: string | null
}

const freeFoliosOf = async (
  range: ReobtainableRange,
  needed: number,
  input: ReobtainFoliosInput,
): Promise<readonly number[]> => {
  const free: number[] = []
  const counter = { checks: 0 }
  const maxChecks = input.maxChecksPerRange ?? DEFAULT_MAX_CHECKS_PER_RANGE
  for (let folio = range.from; folio <= range.to && free.length < needed; folio += 1) {
    if (input.isFolioFree === undefined) {
      free.push(folio)
    } else {
      if (counter.checks >= maxChecks) break
      counter.checks += 1
      if ((await input.isFolioFree(folio)) === true) free.push(folio)
    }
  }
  return free
}

const usableRanges = async (
  ranges: readonly ReobtainableRange[],
  input: ReobtainFoliosInput,
): Promise<readonly ReobtainableRange[]> => {
  const issued = await Promise.all(
    ranges.map((range) => (input.isIssued === undefined ? false : input.isIssued({ from: range.from, to: range.to }))),
  )
  return ranges.filter((range, index) => !range.annulled && !issued[index]).sort((a, b) => a.from - b.from)
}

const reobtainInSession = async (context: PortalContext, input: ReobtainFoliosInput): Promise<ReobtainResult> => {
  const company = input.companyRut === undefined ? {} : { companyRut: input.companyRut }
  // Whatever fails while listing leaves the run with no ranges to use, as field behaviour does: the flow goes on by the
  // normal way. Only the caller's own abort is not a failure of the listing.
  const listed = await listReobtainableInSession(context, { type: input.type, ...company }).catch((error: unknown) => {
    if (isDteError(error) && error.code === 'REQUEST_ABORTED') throw error
    return { failed: errorMessage(error) }
  })
  if ('failed' in listed)
    return { complete: false, cafs: [], ranges: [], expired: [], available: 0, reason: listed.failed }
  const usable = await usableRanges(listed, input)
  const total = usable.reduce((sum, range) => sum + range.quantity, 0)
  if (total < input.quantity)
    return {
      complete: false,
      cafs: [],
      ranges: [],
      expired: [],
      available: total,
      reason: `usable ranges do not reach the quantity: ${total} of ${input.quantity}`,
    }
  const cafs: ObtainedCaf[] = []
  const used: { from: number; to: number; freeFolios: readonly number[] }[] = []
  const expired: { from: number; to: number; authorizationDate: string | null }[] = []
  const covered = { folios: 0 }
  for (const range of usable) {
    if (covered.folios >= input.quantity) break
    const freeFolios = await freeFoliosOf(range, input.quantity - covered.folios, input)
    if (freeFolios.length > 0) {
      const caf = await reobtainCafInSession(context, { type: input.type, range }).catch((error: unknown) => {
        const refusal = asRefusal(error)
        context.portal.logger.warn('sii portal could not reobtain a range', { rejection: refusal.rejection })
        return null
      })
      if (caf !== null) {
        if (isCafExpired(caf.caf, { now: context.portal.now() })) {
          expired.push({ from: range.from, to: range.to, authorizationDate: caf.caf.authorizationDate })
        } else {
          cafs.push(caf)
          used.push({ from: range.from, to: range.to, freeFolios })
          covered.folios += freeFolios.length
        }
      }
    }
  }
  const complete = covered.folios >= input.quantity
  return {
    complete,
    cafs,
    ranges: used,
    expired,
    available: covered.folios,
    reason: complete ? null : `usable ranges do not reach the quantity: ${covered.folios} of ${input.quantity}`,
  }
}

/**
 * EN: Covers a quantity from authorized ranges without spending quota, oldest folio first. It is what lifts a stamping
 * block, since the SII asks for folios to be issued. A range with some received folios is not discarded: its free folios
 * are used. An expired CAF does not count and the walk moves on. As the reference does, the listing is asked for with
 * no session handling on the way in (no login on demand: with a session that expired the list comes back empty) and
 * whatever fails while listing reads as no ranges, with the failure in `reason`: it does not throw. A page that states
 * a refusal is not told apart either: it has no ranges.
 * ES: Cubre una cantidad con rangos autorizados sin gastar cupo, partiendo por el folio más antiguo. Es lo que levanta un
 * bloqueo de timbraje, porque el SII pide emitir folios. Un rango con algunos folios recibidos no se descarta: se usan sus
 * folios libres. Un CAF vencido no cuenta y se sigue con el siguiente. Como la referencia, el listado se pide sin manejo
 * de sesión al entrar (sin login a pedido: con una sesión vencida la lista vuelve vacía) y cualquier fallo al listar se
 * lee como sin rangos, con el fallo en `reason`: no lanza. Una página que declara un rechazo tampoco se distingue: no
 * tiene rangos.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: type, quantity and the checks the caller can make. ES: tipo, cantidad y las verificaciones que puede hacer quien llama.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: what was obtained, even when it falls short. ES: lo obtenido, aunque no alcance.
 * @throws {DteError} EN: session, block and transport codes while downloading a range; `REQUEST_ABORTED`. ES: códigos de sesión, bloqueo y transporte al descargar un rango; `REQUEST_ABORTED`.
 */
export const reobtainFolios = (
  portal: PortalClient,
  input: ReobtainFoliosInput,
  overrides?: CallOverrides,
): Promise<ReobtainResult> =>
  withPortalSession(portal, 'reobtainFolios', overrides, (context) => reobtainInSession(context, input))
