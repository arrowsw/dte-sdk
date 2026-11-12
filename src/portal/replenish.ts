import type { Caf } from '../caf/parse'
import { isCafExpired } from '../caf/validity'
import { isDocumentType, type DocumentType } from '../catalogs/document-types'
import type { PortalRejection } from '../catalogs/portal'
import { DteError, errorMessage, isDteError, type DteErrorCode } from '../errors'
import { assertPositive, type CallOverrides } from '../sii/client'
import type { HttpTransport } from '../sii/transport'
import { annulFoliosInSession, isSpan, type FolioSpan } from './annulment'
import { resolvePortalCompany, type PortalClient } from './client'
import { flowFailure, type FolioFlowFailure } from './flow-failure'
import {
  DEFAULT_MAX_BATCHES,
  DEFAULT_MAX_CHECKS_PER_RANGE,
  LIFTED_BY_ANNULLING,
  requestCafInBatchesInSession,
  type ReobtainFoliosInput,
  type ReobtainResult,
} from './flows'
import { listReobtainableInSession, reobtainCafInSession, type ReobtainableRange } from './reobtain'
import { withPortalSession, type PortalContext } from './session'
import { assertQuantity, queryFolioQuotaInSession, REQUEST_SPACING_MS, type ObtainedCaf } from './stamping'

const REFUSAL_COOL_DOWN_MS = 15 * 60 * 1000
// A session limit lasts 35 minutes, and insisting against the firewall makes its block longer.
const PORTAL_COOL_DOWN_MS = 60 * 60 * 1000
const LEAVE_THE_PORTAL_ALONE: ReadonlySet<DteErrorCode> = new Set<DteErrorCode>([
  'SII_PORTAL_SESSION_LIMIT',
  'SII_PORTAL_BLOCKED',
])
const DEFAULT_EXPIRY_MARGIN_MS = 24 * 60 * 60 * 1000
// Annulling reaches the ranges stamped in the last six months, the ones that weigh on the quota, a few at a time.
const ANNUL_WINDOW_DAYS = 180
const ANNUL_MAX_RANGES = 10
// Refusals after which the SII may hold a range it did not hand over: the listing says whether it does.
const MAYBE_GRANTED: ReadonlySet<PortalRejection> = new Set<PortalRejection>([
  'stampingUncertain',
  'rangeAlreadyAuthorized',
])

type Span = { readonly from: number; readonly to: number }

/**
 * EN: A CAF the caller holds for the type, with how many of its folios are still unused, as the caller's own records
 * say (`FolioRegistry.remaining`, for one). Hold every CAF of the type, spent or expired too: a range held is never
 * downloaded again and never annulled.
 * ES: Un CAF que quien llama tiene para el tipo, con cuántos de sus folios siguen sin usar, según sus propios registros
 * (`FolioRegistry.remaining`, por ejemplo). Incluye cada CAF del tipo, también los gastados o vencidos: un rango que se
 * tiene nunca se vuelve a descargar ni se anula.
 */
export type CafHolding = {
  /** EN: The CAF, parsed. ES: `CAF` — El CAF, parseado. */
  readonly caf: Pick<Caf, 'documentType' | 'range' | 'authorizationDate'>
  /** EN: Folios of the CAF not used yet. ES: Folios del CAF aún sin usar. */
  readonly remaining: number
}

/**
 * EN: When to replenish and how much. The SII rations by history: every folio stamped and left unused lowers the next
 * maximum, so the quantity is what the caller issues between two replenishments, not a stock for months.
 * ES: Cuándo reponer y cuánto. El SII raciona por historial: cada folio timbrado que queda sin usar baja el próximo
 * máximo, así que la cantidad es lo que quien llama emite entre dos reposiciones, no una reserva para meses.
 */
export type ReplenishmentPolicy = {
  /** EN: Document type. ES: `COD_DOCTO` — Tipo de documento. */
  readonly type: DocumentType
  /** EN: Replenish when the usable folios fall below this. ES: Reponer cuando los folios utilizables bajan de esto. */
  readonly minimum: number
  /** EN: Folios to obtain each time; at least `minimum`, so one replenishment reaches it. ES: Folios por obtener cada vez; al menos `minimum`, para que una reposición lo alcance. */
  readonly quantity: number
  /** EN: A CAF that expires within this many milliseconds no longer counts; one day by default. Only types 33, 46, 56 and 61 expire, six months after their authorization. ES: Un CAF que vence dentro de estos milisegundos ya no cuenta; un día por defecto. Solo vencen los tipos 33, 46, 56 y 61, seis meses después de su autorización. */
  readonly expiryMarginMs?: number
}

/**
 * EN: Input of `planFolioReplenishment`.
 * ES: Entrada de `planFolioReplenishment`.
 */
export type PlanReplenishmentInput = ReplenishmentPolicy & {
  /** EN: The CAFs held; those of other types are ignored. ES: Los CAF que se tienen; los de otros tipos se ignoran. */
  readonly cafs: readonly CafHolding[]
  /** EN: The present moment. ES: El momento presente. */
  readonly now: Date
  /** EN: `coolUntil` of the last report: before it, the SII is not asked again. ES: `coolUntil` del último informe: antes de esa hora no se le vuelve a pedir al SII. */
  readonly coolUntil?: Date | null
}

/**
 * EN: Why folios are short, by its cause; `usable` says how many are left. `expired`: the folios lost to expiry would
 * have reached the minimum. Otherwise they were used: `low` with some left, `exhausted` with none.
 * ES: Por qué faltan folios, según su causa; `usable` dice cuántos quedan. `expired`: los folios que se perdieron por
 * vencimiento habrían alcanzado el mínimo. Si no, se usaron: `low` si queda alguno, `exhausted` si no queda ninguno.
 */
export type ReplenishmentReason = 'low' | 'exhausted' | 'expired'

/**
 * EN: What to do now: nothing, wait for the cool-down, or replenish.
 * ES: Qué hacer ahora: nada, esperar el enfriamiento o reponer.
 */
export type ReplenishmentPlan =
  | {
      /** EN: The usable folios reach the minimum. ES: Los folios utilizables alcanzan el mínimo. */
      readonly action: 'none'
      /** EN: Usable folios: unused, in CAFs that do not expire within the margin. ES: Folios utilizables: sin usar, en CAF que no vencen dentro del margen. */
      readonly usable: number
      /** EN: Unused folios in CAFs that expired or expire within the margin. ES: Folios sin usar en CAF que vencieron o vencen dentro del margen. */
      readonly expiredFolios: number
    }
  | {
      /** EN: Folios are short, but the SII refused moments ago. ES: Faltan folios, pero el SII se negó hace poco. */
      readonly action: 'coolDown'
      /** EN: Usable folios. ES: Folios utilizables. */
      readonly usable: number
      /** EN: Unused folios lost to expiry. ES: Folios sin usar perdidos por vencimiento. */
      readonly expiredFolios: number
      /** EN: When the SII may be asked again. ES: Cuándo se le puede volver a pedir al SII. */
      readonly coolUntil: Date
    }
  | {
      /** EN: Folios must be obtained. ES: Hay que obtener folios. */
      readonly action: 'replenish'
      /** EN: Usable folios. ES: Folios utilizables. */
      readonly usable: number
      /** EN: Unused folios lost to expiry. ES: Folios sin usar perdidos por vencimiento. */
      readonly expiredFolios: number
      /** EN: Why. ES: Por qué. */
      readonly reason: ReplenishmentReason
      /** EN: Folios to obtain. ES: Folios por obtener. */
      readonly quantity: number
    }

const assertPolicy = (policy: ReplenishmentPolicy): void => {
  if (!isDocumentType(policy.type)) throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type' })
  assertQuantity(policy.minimum, 'minimum')
  assertQuantity(policy.quantity, 'quantity')
  // A quantity under the minimum would leave the stock short after replenishing, and every call would replenish again.
  if (policy.quantity < policy.minimum) throw new DteError('INVALID_OPTION', { field: 'quantity' })
  const margin = policy.expiryMarginMs ?? 0
  if (!(Number.isFinite(margin) && margin >= 0)) throw new DteError('INVALID_OPTION', { field: 'expiryMarginMs' })
}

const assertHolding = (holding: CafHolding): void => {
  if (!Number.isInteger(holding.remaining) || holding.remaining < 0)
    throw new DteError('INVALID_OPTION', { field: 'cafs.remaining' })
  if (!isSpan(holding.caf.range)) throw new DteError('INVALID_OPTION', { field: 'cafs.range' })
}

const unusedIn = (holdings: readonly CafHolding[]): number =>
  holdings.reduce((sum, holding) => sum + holding.remaining, 0)

const stillCooling = (coolUntil: Date | null | undefined, now: Date): Date | null =>
  coolUntil !== null && coolUntil !== undefined && coolUntil.getTime() > now.getTime() ? coolUntil : null

/**
 * EN: Decides what to do now, without any I/O: counts the unused folios in CAFs of the type that do not expire within
 * the margin and compares them with the minimum. Below it, a cool-down still running means waiting; otherwise it says
 * why folios are short and how many to obtain. The reason is the cause: `expired` when the folios lost to expiry would
 * have reached the minimum, whether some are left or none.
 * ES: Decide qué hacer ahora, sin entrada ni salida: cuenta los folios sin usar en CAF del tipo que no vencen dentro del
 * margen y los compara con el mínimo. Bajo él, un enfriamiento todavía en curso significa esperar; si no, dice por qué
 * faltan folios y cuántos obtener. La razón es la causa: `expired` cuando los folios perdidos por vencimiento habrían
 * alcanzado el mínimo, quede alguno o ninguno.
 * @param input EN: the policy, the CAFs held, the clock and the cool-down. ES: la política, los CAF que se tienen, el reloj y el enfriamiento.
 * @returns EN: the plan. ES: el plan.
 * @throws {DteError} EN: `INVALID_DOCUMENT_TYPE` and `INVALID_OPTION` for a policy or a holding out of range. ES: `INVALID_DOCUMENT_TYPE` e `INVALID_OPTION` para una política o un CAF fuera de rango.
 */
export const planFolioReplenishment = (input: PlanReplenishmentInput): ReplenishmentPlan => {
  assertPolicy(input)
  const marginMs = input.expiryMarginMs ?? DEFAULT_EXPIRY_MARGIN_MS
  const own = input.cafs.filter((holding) => holding.caf.documentType === input.type)
  own.forEach(assertHolding)
  const live = own.filter((holding) => !isCafExpired(holding.caf, { now: input.now, marginMs }))
  const usable = unusedIn(live)
  const expiredFolios = unusedIn(own) - usable
  if (usable >= input.minimum) return { action: 'none', usable, expiredFolios }
  const coolUntil = stillCooling(input.coolUntil, input.now)
  if (coolUntil !== null) return { action: 'coolDown', usable, expiredFolios, coolUntil }
  const reason: ReplenishmentReason =
    usable + expiredFolios >= input.minimum ? 'expired' : usable > 0 ? 'low' : 'exhausted'
  return { action: 'replenish', usable, expiredFolios, reason, quantity: input.quantity }
}

/**
 * EN: Input of `unstable_replenishFolios`.
 * ES: Entrada de `unstable_replenishFolios`.
 */
export type ReplenishFoliosInput = ReplenishmentPolicy & {
  /** EN: The CAFs held, or a function that reads them. A function is read again once the portal lock is held, so a replica that waited sees what another one kept in its `onObtained`. It runs with the lock held: it must not call a portal operation of the same client. ES: Los CAF que se tienen, o una función que los lee. Una función se vuelve a leer con el candado del portal tomado, así una réplica que esperó ve lo que otra guardó en su `onObtained`. Corre con el candado tomado: no debe llamar a una operación del portal del mismo cliente. */
  readonly cafs: readonly CafHolding[] | (() => readonly CafHolding[] | Promise<readonly CafHolding[]>)
  /** EN: The highest folio of the type the company has issued, on any system; 0 when it has issued none. A folio up to it is never taken as free, so a range that ends at or before it is never downloaded again. ES: El mayor folio del tipo que la empresa ha emitido, en cualquier sistema; 0 si no ha emitido ninguno. Un folio hasta ese número nunca se toma como libre, así que un rango que termina en él o antes nunca se vuelve a descargar. */
  readonly lastIssuedFolio: number
  /** EN: `coolUntil` of the last report. ES: `coolUntil` del último informe. */
  readonly coolUntil?: Date | null
  /** EN: How long to leave the SII alone after it refuses; 15 minutes by default. A session limit or a firewall block asks for an hour, or for this when it is longer. ES: Cuánto dejar tranquilo al SII después de que se niega; 15 minutos por defecto. Un límite de sesiones o un bloqueo del firewall piden una hora, o esto si es más. */
  readonly coolDownMs?: number
  /** EN: Annul unused folios as a last resort, when the SII counts more of them than the ones in hand and they are what keeps it from stamping. Only in certification by default: it cannot be undone and counts against the quota for six months. ES: Anular folios sin usar como último recurso, cuando el SII cuenta más de los que hay en la mano y son lo que le impide timbrar. Por defecto solo en certificación: no se puede deshacer y pesa contra el cupo seis meses. */
  readonly allowAnnul?: boolean
  /** EN: Folios annulling never touches, such as those of documents signed and not received by the SII yet; the CAFs held and the ranges this run downloads are always left out. ES: Folios que la anulación no toca, como los de documentos firmados que el SII aún no recibe; los CAF que se tienen y los rangos que esta corrida descarga siempre quedan fuera. */
  readonly exclude?: readonly { readonly from: number; readonly to: number }[]
  /** EN: `knownAnnulled` of the last report. ES: `knownAnnulled` del último informe. */
  readonly knownAnnulled?: readonly string[]
  /** EN: The caller's record of ranges already sent to the SII; a range overlapping a CAF held already counts as issued. It runs with the lock held. ES: El registro de quien llama de los rangos ya enviados al SII; un rango que se cruza con un CAF que se tiene ya cuenta como emitido. Corre con el candado tomado. */
  readonly isIssued?: ReobtainFoliosInput['isIssued']
  /** EN: Confirms at the SII that a folio after `lastIssuedFolio` is free, typically with `folioReceived`. Without it every folio after `lastIssuedFolio` is free. It runs with the lock held, and a `DteError` it throws ends the reobtaining with what was downloaded, as a failure of `reobtainCaf`. ES: Confirma en el SII que un folio posterior a `lastIssuedFolio` está libre, normalmente con `folioReceived`. Sin ella, todo folio posterior a `lastIssuedFolio` está libre. Corre con el candado tomado, y un `DteError` que lance termina la reobtención con lo descargado, como una falla de `reobtainCaf`. */
  readonly isFolioFree?: ReobtainFoliosInput['isFolioFree']
  /** EN: Most checks per range when reobtaining; 30 by default. ES: Máximo de consultas por rango al reobtener; 30 por defecto. */
  readonly maxChecksPerRange?: number
  /** EN: Most requests in each round of batches; 4 by default. ES: Máximo de solicitudes en cada ronda de tandas; 4 por defecto. */
  readonly maxBatches?: number
  /** EN: Company RUT; the client's by default. ES: `RUT_EMP` + `DV_EMP` — RUT de la empresa; por defecto el del cliente. */
  readonly companyRut?: string
  /** EN: Receives what was obtained as it arrives, with the portal lock still held: keep it here and another replica reads it before it replenishes. An error it throws is logged and the run goes on; the report carries everything all the same. ES: Recibe lo obtenido a medida que llega, con el candado del portal todavía tomado: guárdalo aquí y otra réplica lo lee antes de reponer. Un error que lance se registra y la corrida sigue; el informe lo trae todo igual. */
  readonly onObtained?: (obtained: Pick<ReplenishmentReport, 'cafs' | 'reobtained'>) => void | Promise<void>
}

/**
 * EN: How a replenishment ended. `none`: enough folios. `coolDown`: short, but the SII refused moments ago.
 * `replenished`: the quantity was covered. `partial`: something was obtained, not all. `blocked`: the SII refused and
 * nothing was obtained. `failed`: a failure that is not a refusal, with nothing obtained.
 * ES: Cómo terminó una reposición. `none`: alcanzan los folios. `coolDown`: faltan, pero el SII se negó hace poco.
 * `replenished`: se cubrió la cantidad. `partial`: se obtuvo algo, no todo. `blocked`: el SII se negó y no se obtuvo
 * nada. `failed`: una falla que no es un rechazo, sin nada obtenido.
 */
export type ReplenishmentStatus = 'none' | 'coolDown' | 'replenished' | 'partial' | 'blocked' | 'failed'

/**
 * EN: A step taken: download authorized ranges again, read the quota, request, annul.
 * ES: Un paso dado: volver a descargar rangos autorizados, leer el cupo, solicitar, anular.
 */
export type ReplenishmentStep = 'reobtain' | 'quota' | 'request' | 'annul'

/**
 * EN: What `unstable_replenishFolios` did. Keep `cafs` before anything else: the SII already authorized them, and their
 * XML holds a private key, so the report is not something to log. Persist `coolUntil` and `knownAnnulled` and pass
 * them back next time.
 * ES: Lo que hizo `unstable_replenishFolios`. Guarda `cafs` antes que nada: el SII ya los autorizó, y su XML contiene una
 * llave privada, así que el informe no es algo que registrar en un log. Guarda `coolUntil` y `knownAnnulled` y
 * devuélvelos la próxima vez.
 */
export type ReplenishmentReport = {
  /** EN: How it ended. ES: Cómo terminó. */
  readonly status: ReplenishmentStatus
  /** EN: Why folios were short, or null when nothing was attempted. ES: Por qué faltaban folios, o null si no se intentó nada. */
  readonly reason: ReplenishmentReason | null
  /** EN: Usable folios before replenishing. ES: Folios utilizables antes de reponer. */
  readonly usable: number
  /** EN: Unused folios in CAFs held that expired or expire within the margin. ES: Folios sin usar en CAF que se tienen y que vencieron o vencen dentro del margen. */
  readonly expiredFolios: number
  /** EN: Folios it set out to obtain; 0 when nothing was attempted. ES: Folios que se propuso obtener; 0 si no se intentó nada. */
  readonly wanted: number
  /** EN: Folios obtained: free folios reobtained plus folios granted. ES: Folios obtenidos: folios libres reobtenidos más folios otorgados. */
  readonly obtained: number
  /** EN: Every CAF obtained, in the order it arrived. ES: Todos los CAF obtenidos, en el orden en que llegaron. */
  readonly cafs: readonly ObtainedCaf[]
  /** EN: Each range reobtained and its free folios: without `isFolioFree`, every folio after `lastIssuedFolio`; with it, the ones it confirmed, and the folios after the last one it was asked about were not checked. ES: Cada rango reobtenido y sus folios libres: sin `isFolioFree`, todo folio posterior a `lastIssuedFolio`; con ella, los que confirmó, y los folios posteriores al último que se le consultó no se revisaron. */
  readonly reobtained: ReobtainResult['ranges']
  /** EN: Ranges reobtained whose CAF expires within the margin: they do not count. Hold each one, with nothing remaining, so it is not downloaded again. ES: Rangos reobtenidos cuyo CAF vence dentro del margen: no cuentan. Ten cada uno, sin folios restantes, para que no se vuelva a descargar. */
  readonly expired: ReobtainResult['expired']
  /** EN: Ranges annulled. ES: Rangos anulados. */
  readonly annulled: readonly FolioSpan[]
  /** EN: `from-to` keys that are final, to pass back. ES: Claves `desde-hasta` definitivas, para devolver. */
  readonly knownAnnulled: readonly string[]
  /** EN: The steps taken, in order. ES: Los pasos dados, en orden. */
  readonly steps: readonly ReplenishmentStep[]
  /** EN: Last `MAX_AUTOR` seen, or null. ES: `MAX_AUTOR` — Último máximo visto, o null. */
  readonly maxAuthorized: number | null
  /** EN: Last `FOLIOS_DISP` seen, or null. ES: `FOLIOS_DISP` — Último valor visto, o null. */
  readonly availableFolios: number | null
  /** EN: The refusal of the SII that left it short, or null; null with `partial` and no `failure` means the batches ran out of trips. ES: El rechazo del SII que lo dejó corto, o null; null con `partial` y sin `failure` significa que las tandas agotaron sus viajes. */
  readonly rejection: PortalRejection | null
  /** EN: What the portal said with it, in its own words, or null. ES: Lo que dijo el portal con él, con sus palabras, o null. */
  readonly portalMessage: string | null
  /** EN: What stopped it when it was not a refusal, or null. ES: Lo que lo detuvo cuando no fue un rechazo, o null. */
  readonly failure: FolioFlowFailure | null
  /** EN: Do not ask the SII again before this, or null. Set when it ends short without a failure, and after a session limit or a firewall block; a report with enough folios hands back a cool-down still running. ES: No volver a pedirle al SII antes de esta hora, o null. Se fija cuando termina corto sin una falla, y después de un límite de sesiones o un bloqueo del firewall; un informe con folios suficientes devuelve un enfriamiento todavía en curso. */
  readonly coolUntil: Date | null
}

type Progress = Omit<ReplenishmentReport, 'status' | 'reason' | 'usable' | 'expiredFolios' | 'wanted' | 'coolUntil'>

const startProgress = (knownAnnulled: readonly string[]): Progress => ({
  obtained: 0,
  cafs: [],
  reobtained: [],
  expired: [],
  annulled: [],
  knownAnnulled,
  steps: [],
  maxAuthorized: null,
  availableFolios: null,
  rejection: null,
  portalMessage: null,
  failure: null,
})

const idleReport = (
  plan: Exclude<ReplenishmentPlan, { action: 'replenish' }>,
  input: ReplenishFoliosInput,
  now: Date,
): ReplenishmentReport => ({
  status: plan.action,
  reason: null,
  usable: plan.usable,
  expiredFolios: plan.expiredFolios,
  wanted: 0,
  ...startProgress(input.knownAnnulled ?? []),
  coolUntil: stillCooling(input.coolUntil, now),
})

const assertOptions = (portal: PortalClient, input: ReplenishFoliosInput): void => {
  assertPolicy(input)
  assertPositive(input.coolDownMs, 'coolDownMs')
  // Zero batches would read as the SII's cap without ever asking it.
  if (input.maxBatches !== undefined) assertQuantity(input.maxBatches, 'maxBatches')
  if (input.maxChecksPerRange !== undefined) assertQuantity(input.maxChecksPerRange, 'maxChecksPerRange')
  if (!Number.isInteger(input.lastIssuedFolio) || input.lastIssuedFolio < 0)
    throw new DteError('INVALID_OPTION', { field: 'lastIssuedFolio' })
  if (!(input.exclude ?? []).every(isSpan)) throw new DteError('INVALID_OPTION', { field: 'exclude' })
  resolvePortalCompany(portal, input.companyRut)
}

// Every request of the run stays a second apart from the one before, whatever the step: a listing asks once for each
// range, and an annulment several times for each.
const paced = (context: PortalContext): PortalContext => {
  const sent = { any: false }
  const transport: HttpTransport = async (request) => {
    if (sent.any) await context.portal.sleep(REQUEST_SPACING_MS, context.overrides?.signal)
    sent.any = true
    return context.portal.transport(request)
  }
  return { ...context, portal: { ...context.portal, transport } }
}

// A refusal becomes data, and so does any other `DteError`, with its code alone and the original in the logger:
// nothing the SII already gave is thrown away. Anything else is a bug and stays an error.
const settle =
  (context: PortalContext, operation: FolioFlowFailure['operation']) =>
  (error: unknown): Pick<Progress, 'rejection' | 'portalMessage'> | Pick<Progress, 'failure'> => {
    if (!isDteError(error)) throw error
    return error.code === 'SII_PORTAL_REJECTED'
      ? { rejection: error.details.rejection as PortalRejection, portalMessage: error.details.portalMessage as string }
      : { failure: flowFailure(context, error, operation) }
  }

const overlaps = (a: Span, b: Span): boolean => a.from <= b.to && a.to >= b.from

const replenishInSession = async (
  context: PortalContext,
  input: ReplenishFoliosInput,
  held: readonly CafHolding[],
  plan: Extract<ReplenishmentPlan, { action: 'replenish' }>,
): Promise<ReplenishmentReport> => {
  const { portal } = context
  const company = { type: input.type, companyRut: input.companyRut }
  const own = held.filter((holding) => holding.caf.documentType === input.type)
  const marginMs = input.expiryMarginMs ?? DEFAULT_EXPIRY_MARGIN_MS
  const maxBatches = input.maxBatches ?? DEFAULT_MAX_BATCHES
  // The ranges the listing has shown so far: a second reading only looks at what is new.
  const seen = new Set<string>()
  const missing = (progress: Progress): number => plan.quantity - progress.obtained
  // Every range this run brought, kept or not: none is downloaded twice, and annulling never touches one.
  const brought = (progress: Progress): readonly Span[] => [
    ...progress.cafs.map((obtained) => obtained.caf.range),
    ...progress.reobtained,
    ...progress.expired,
  ]

  const finish = (progress: Progress): ReplenishmentReport => {
    const status: ReplenishmentStatus =
      progress.obtained >= plan.quantity
        ? 'replenished'
        : progress.obtained > 0
          ? 'partial'
          : progress.failure === null
            ? 'blocked'
            : 'failed'
    const refusalMs = input.coolDownMs ?? REFUSAL_COOL_DOWN_MS
    // Short with no failure, the SII said no or the batches ran out: asking again at once would only hear the same. A
    // session limit and a firewall block ask for longer; any other failure may be tried again.
    const coolMs =
      status === 'replenished'
        ? null
        : progress.failure === null
          ? refusalMs
          : LEAVE_THE_PORTAL_ALONE.has(progress.failure.code)
            ? Math.max(refusalMs, PORTAL_COOL_DOWN_MS)
            : null
    return {
      status,
      reason: plan.reason,
      usable: plan.usable,
      expiredFolios: plan.expiredFolios,
      wanted: plan.quantity,
      ...progress,
      coolUntil: coolMs === null ? null : new Date(portal.now().getTime() + coolMs),
    }
  }

  // What is obtained is handed over at once, with the lock still held. The caller's own failure to keep it stops
  // nothing: the report carries it all the same.
  const handOver = async (cafs: readonly ObtainedCaf[], reobtained: ReobtainResult['ranges']): Promise<void> => {
    if (input.onObtained === undefined || cafs.length === 0) return
    try {
      await input.onObtained({ cafs, reobtained })
    } catch (error) {
      portal.logger.warn('sii portal could not hand over what it obtained', {
        operation: context.operation,
        reason: errorMessage(error),
      })
    }
  }

  const isIssued = async (range: ReobtainableRange, mine: readonly Span[]): Promise<boolean> =>
    range.to <= input.lastIssuedFolio ||
    mine.some((span) => overlaps(range, span)) ||
    (input.isIssued !== undefined && (await input.isIssued({ from: range.from, to: range.to })))

  // The free folios of a range, all after the last one issued: every one of them, or those the caller confirms.
  const freeFoliosOf = async (range: ReobtainableRange, needed: number): Promise<readonly number[]> => {
    const first = Math.max(range.from, input.lastIssuedFolio + 1)
    if (input.isFolioFree === undefined)
      return Array.from({ length: range.to - first + 1 }, (_, index) => first + index)
    const last = Math.min(range.to, first + (input.maxChecksPerRange ?? DEFAULT_MAX_CHECKS_PER_RANGE) - 1)
    const free: number[] = []
    for (let folio = first; folio <= last && free.length < needed; folio += 1)
      if ((await input.isFolioFree(folio)) === true) free.push(folio)
    return free
  }

  // A range the SII refuses to hand over is logged and the walk moves on; anything else ends it.
  const refusedDownload = (error: unknown): null => {
    if (!isDteError(error) || error.code !== 'SII_PORTAL_REJECTED') throw error
    portal.logger.warn('sii portal could not reobtain a range', { rejection: error.details.rejection })
    return null
  }

  // Ranges the SII already authorized and nobody holds: they cost no quota, and issuing them is what lifts a block. A
  // listing that fails or is refused ends the run here, before any quota is spent on folios it may already have.
  const reobtain = async (progress: Progress): Promise<Progress> => {
    let current: Progress = { ...progress, steps: [...progress.steps, 'reobtain'] }
    let operation: FolioFlowFailure['operation'] = 'listReobtainableRanges'
    try {
      const listed = await listReobtainableInSession(context, company)
      const fresh = listed.filter((range) => !seen.has(`${range.from}-${range.to}`))
      listed.forEach((range) => seen.add(`${range.from}-${range.to}`))
      operation = 'reobtainCaf'
      const mine = [...own.map((holding) => holding.caf.range), ...brought(current)]
      const issued = await Promise.all(fresh.map((range) => isIssued(range, mine)))
      const usable = fresh.filter((range, index) => !range.annulled && !issued[index]).sort((a, b) => a.from - b.from)
      for (const range of usable) {
        if (missing(current) <= 0) break
        const freeFolios = await freeFoliosOf(range, missing(current))
        const caf =
          freeFolios.length === 0
            ? null
            : await reobtainCafInSession(context, { type: input.type, range }).catch(refusedDownload)
        if (caf !== null) {
          const span = { from: range.from, to: range.to }
          if (isCafExpired(caf.caf, { now: portal.now(), marginMs })) {
            const lost = { ...span, authorizationDate: caf.caf.authorizationDate }
            current = { ...current, expired: [...current.expired, lost] }
          } else {
            const entry = { ...span, freeFolios }
            current = {
              ...current,
              obtained: current.obtained + freeFolios.length,
              cafs: [...current.cafs, caf],
              reobtained: [...current.reobtained, entry],
            }
            await handOver([caf], [entry])
          }
        }
      }
      return current
    } catch (error) {
      return { ...current, ...settle(context, operation)(error) }
    }
  }

  // The quota, read once: it tells a stamping block apart, in the SII's own words, which the batches would read as
  // the cap. Then the batches, for what is still missing.
  const ask = async (progress: Progress): Promise<Progress> => {
    const read: Progress = {
      ...progress,
      steps: [...progress.steps, 'quota'],
      rejection: null,
      portalMessage: null,
    }
    const quota = await queryFolioQuotaInSession(context, company).catch(settle(context, 'queryFolioQuota'))
    if ('failure' in quota || 'rejection' in quota) return { ...read, ...quota }
    // A blocked quota always carries what the SII wrote.
    if (quota.blocked) return { ...read, rejection: 'stampingBlocked', portalMessage: quota.portalMessage! }
    const result = await requestCafInBatchesInSession(
      context,
      { ...company, quantity: missing(read), maxBatches, initialQuota: quota },
      true,
    )
    await handOver(result.cafs, [])
    // Batches that run out of trips were refused nothing: the SII was still granting.
    const outOfTrips = result.rejection === 'quotaCapReached' && result.cafs.length >= maxBatches
    const asked: Progress = {
      ...read,
      steps: [...read.steps, 'request'],
      obtained: read.obtained + result.granted,
      cafs: [...read.cafs, ...result.cafs],
      maxAuthorized: result.maxAuthorized,
      availableFolios: result.availableFolios,
      rejection: outOfTrips ? null : result.rejection,
      portalMessage: outOfTrips ? null : result.portalMessage,
      failure: result.failure,
    }
    if (asked.rejection === null || !MAYBE_GRANTED.has(asked.rejection)) return asked
    // The SII may hold a range it did not hand over. The listing says so now, and downloading it costs no quota.
    const settled = await reobtain(asked)
    return missing(settled) > 0 ? settled : { ...settled, rejection: null, portalMessage: null }
  }

  const reobtained = await reobtain(startProgress(input.knownAnnulled ?? []))
  if (reobtained.failure !== null || reobtained.rejection !== null || missing(reobtained) <= 0)
    return finish(reobtained)
  const asked = await ask(reobtained)

  // Annulling, last of all: only where it is allowed, only for a refusal that unused folios cause, and only when the
  // SII counts more of them than the ones in hand. Never a CAF held, nor a range this run downloaded.
  const inHand = unusedIn(own) + asked.obtained
  const liftable =
    (input.allowAnnul ?? portal.environment === 'certification') &&
    asked.rejection !== null &&
    LIFTED_BY_ANNULLING.has(asked.rejection) &&
    (asked.availableFolios === null || asked.availableFolios > inHand)
  if (!liftable) return finish(asked)
  const annulment = await annulFoliosInSession(context, {
    type: input.type,
    withinDays: ANNUL_WINDOW_DAYS,
    maxRanges: ANNUL_MAX_RANGES,
    knownAnnulled: asked.knownAnnulled,
    exclude: [...own.map((holding) => holding.caf.range), ...brought(asked), ...(input.exclude ?? [])],
    companyRut: input.companyRut,
  }).catch(settle(context, 'annulFolios'))
  const tried: Progress = { ...asked, steps: [...asked.steps, 'annul'] }
  if (!('annulled' in annulment)) return finish({ ...tried, ...annulment })
  const annulled: Progress = {
    ...tried,
    annulled: annulment.annulled,
    knownAnnulled: annulment.knownAnnulled,
    failure: annulment.failure,
  }
  // With nothing annulled, or the annulment cut short, the refusal of the SII stays as it was said.
  return finish(annulment.failure !== null || annulment.totalAnnulled === 0 ? annulled : await ask(annulled))
}

/**
 * EN: Keeps the folios of a type stocked, asking the SII only when they run short, in the order that does not make a
 * block worse: the folios in hand first, then ranges already authorized that nobody holds, downloaded again without
 * spending quota, then requests in batches within the quota, and annulling unused folios as a last resort, only in
 * certification unless allowed. Annulling never touches a CAF held nor a range this run downloaded, and reaches only
 * ranges stamped in the last 180 days. A request the SII may have granted without handing it over is settled in the
 * same run, by reading the listing again. Requests go out a second apart. It stores nothing and schedules nothing: the
 * caller decides when to call it (before issuing, or on a timer), keeps the CAFs it returns and passes back `coolUntil`
 * and `knownAnnulled`. It waits for the portal lock and then reads the CAFs again, so with `cafs` as a function and
 * the CAFs kept in `onObtained`, two replicas do not both replenish. A refusal of the SII and any other `DteError` come
 * back as data, never thrown, so nothing already granted is lost.
 *
 * Unstable: it has not run against the SII yet, in certification or in production, so its shape may change in any
 * release. It asks the SII for folios and, where allowed, annuls them, which cannot be undone. It becomes
 * `replenishFolios` once it has run in both environments.
 * ES: Mantiene el stock de folios de un tipo, pidiéndole al SII solo cuando faltan, en el orden que no agrava un
 * bloqueo: primero los folios en la mano, luego los rangos ya autorizados que nadie tiene, descargados de nuevo sin
 * gastar cupo, luego solicitudes en tandas dentro del cupo, y la anulación de folios sin usar como último recurso, solo
 * en certificación salvo que se permita. La anulación nunca toca un CAF que se tiene ni un rango que esta corrida
 * descargó, y alcanza solo rangos timbrados en los últimos 180 días. Una solicitud que el SII pudo otorgar sin entregarla
 * se resuelve en la misma corrida, leyendo el listado otra vez. Las peticiones salen a un segundo una de otra. No guarda
 * nada ni agenda nada: quien llama decide cuándo llamarla (antes de emitir o con un temporizador), guarda los CAF que
 * devuelve y devuelve `coolUntil` y `knownAnnulled`. Espera el candado del portal y luego vuelve a leer los CAF, así que
 * con `cafs` como función y los CAF guardados en `onObtained`, dos réplicas no reponen ambas. Un rechazo del SII y
 * cualquier otro `DteError` vuelven como datos, nunca se lanzan, así no se pierde nada ya otorgado.
 *
 * Inestable: todavía no ha corrido contra el SII, ni en certificación ni en producción, así que su forma puede cambiar
 * en cualquier versión. Le pide folios al SII y, donde se permite, los anula, lo que no se puede deshacer. Pasa a
 * llamarse `replenishFolios` cuando haya corrido en ambos ambientes.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the policy, the CAFs held, the last folio issued and the memory of the last report. ES: la política, los CAF que se tienen, el último folio emitido y la memoria del último informe.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the report. ES: el informe.
 * @throws {DteError} EN: `INVALID_DOCUMENT_TYPE`, `INVALID_OPTION`, `INVALID_RUT` and `MISSING_FIELD`, before anything goes out and before the CAFs are read. ES: `INVALID_DOCUMENT_TYPE`, `INVALID_OPTION`, `INVALID_RUT` y `MISSING_FIELD`, antes de que salga nada y antes de leer los CAF.
 */
export const unstable_replenishFolios = async (
  portal: PortalClient,
  input: ReplenishFoliosInput,
  overrides?: CallOverrides,
): Promise<ReplenishmentReport> => {
  assertOptions(portal, input)
  const read = async (): Promise<readonly CafHolding[]> =>
    typeof input.cafs === 'function' ? input.cafs() : input.cafs
  const planOf = (cafs: readonly CafHolding[]): ReplenishmentPlan =>
    planFolioReplenishment({ ...input, cafs, now: portal.now() })
  const first = planOf(await read())
  if (first.action !== 'replenish') return idleReport(first, input, portal.now())
  return withPortalSession(portal, 'unstable_replenishFolios', overrides, async (context) => {
    // Another replica may have replenished while this one waited for the lock.
    const held = await read()
    const plan = planOf(held)
    return plan.action === 'replenish'
      ? replenishInSession(paced(context), input, held, plan)
      : idleReport(plan, input, portal.now())
  })
}
