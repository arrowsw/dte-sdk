import { parseCaf, type Caf } from '../caf/parse'
import { isCafExpired } from '../caf/validity'
import type { DocumentType } from '../catalogs/document-types'
import type { PortalRejection } from '../catalogs/portal'
import { DteError } from '../errors'
import type { FolioScope } from '../folios/ledger'
import { cafFingerprint, type FolioRegistry } from '../folios/registry'
import { annulFolios } from '../portal/annulment'
import { reobtainFolios, requestCafExact, requestCafInBatches, type FolioFlowResult } from '../portal/flows'
import { queryFolioQuota, type FolioQuota, type ObtainedCaf } from '../portal/stamping'
import { folioReceived } from '../sii/status'
import type { FolioSource } from './folios'
import type { CertificationPlan } from './set-plan'
import type { CertificationState } from './state'
import { runtime, saveState, type CertificationDependencies, type Runtime, type StepResult } from './runtime'

/**
 * EN: A CAF the run holds, parsed, with its registry scope.
 * ES: Un CAF que tiene la corrida, parseado, con su alcance en el registro.
 */
export type HeldCaf = {
  readonly xml: string
  readonly caf: Caf
  readonly scope: FolioScope
}

const ANNUL_WINDOW_DAYS = 180
const ANNUL_MAX_RANGES = 10
const MAX_RECEIPT_CHECKS = 30
// The refusals that come from unused folios: annulling may lift them.
const RATIONING: ReadonlySet<PortalRejection> = new Set([
  'quotaInsufficient',
  'stampingBlocked',
  'quotaCapReached',
  'personWithPendingIssues',
])
// After an exact request these mean "less than asked": a run of batches may still cover it.
const BATCH_FALLBACK: ReadonlySet<PortalRejection> = new Set(['quotaInsufficient', 'foliosShort', 'quotaExceeded'])

/**
 * EN: The CAFs of a run, parsed; an expired one is left out, because the SII refuses its folios.
 * ES: Los CAF de una corrida, parseados; uno vencido se deja fuera, porque el SII rechaza sus folios.
 */
export const heldCafs = (xmls: readonly string[], now: Date): readonly HeldCaf[] =>
  xmls.flatMap((xml) => {
    const caf = parseCaf(xml)
    if (isCafExpired(caf, { now })) return []
    return [
      {
        xml,
        caf,
        scope: {
          companyRut: caf.issuerRut,
          type: caf.documentType,
          range: caf.range,
          environment: 'certification',
          cafFingerprint: cafFingerprint(xml),
        },
      },
    ]
  })

/**
 * EN: The scope of the CAF whose range holds a folio. The folio came out of these CAFs, so one of them holds it.
 * ES: El alcance del CAF cuyo rango contiene un folio. El folio salió de estos CAF, así que uno de ellos lo contiene.
 */
export const scopeFor = (held: readonly HeldCaf[], type: number, folio: number): FolioScope =>
  held.find((h) => h.caf.documentType === type && folio >= h.caf.range.from && folio <= h.caf.range.to)!.scope

/**
 * EN: A folio source over the held CAFs through the registry: the first CAF of the type with a folio left gives the
 * next one, reserved in the registry, so two runs never take the same folio.
 * ES: Una fuente de folios sobre los CAF en mano a través del registro: el primer CAF del tipo con un folio libre da
 * el siguiente, reservado en el registro, así dos corridas nunca toman el mismo folio.
 */
export const registryFolioSource = (registry: FolioRegistry, held: readonly HeldCaf[]): FolioSource => ({
  take: async (type: DocumentType) => {
    for (const h of held) {
      if (h.caf.documentType !== type) continue
      if ((await registry.remaining(h.scope)) > 0) return { caf: h.caf, folio: await registry.reserve(h.scope) }
    }
    throw new DteError('FOLIO_OUT_OF_RANGE', { type })
  },
})

const addNeed = (needs: Record<number, number>, type: number, count: number): void => {
  if (count > 0) needs[type] = (needs[type] ?? 0) + count
}

/**
 * EN: The folios each type needs for the sets not yet sent: the sum of each set plan's `folios`, never more, because
 * unused authorized folios make the SII ration the next request.
 * ES: Los folios que necesita cada tipo para los sets aún no enviados: la suma de los `folios` de cada plan de set,
 * nunca más, porque folios autorizados sin usar hacen que el SII racione la próxima solicitud.
 */
export const setFolioNeeds = (plan: CertificationPlan, sent: readonly string[]): Readonly<Record<number, number>> => {
  const needs: Record<number, number> = {}
  for (const kind of ['basic', 'guide', 'exempt', 'purchase'] as const) {
    const set = plan[kind]
    if (set === undefined || sent.includes(kind)) continue
    for (const [type, count] of Object.entries(set.folios)) addNeed(needs, Number(type), count)
  }
  return needs
}

/**
 * EN: The folios the simulation needs: one per case, by type.
 * ES: Los folios que necesita la simulación: uno por caso, por tipo.
 */
export const simulationFolioNeeds = (plan: CertificationPlan): Readonly<Record<number, number>> => {
  const needs: Record<number, number> = {}
  for (const set of [plan.basic, plan.exempt]) {
    if (set === undefined) continue
    addNeed(needs, set.kind === 'basic' ? 33 : 34, set.invoices.length)
    addNeed(needs, 61, set.creditNotes.length)
    addNeed(needs, 56, set.debitNotes.length)
  }
  addNeed(needs, 52, plan.guide?.guides.length ?? 0)
  if (plan.purchase !== undefined) {
    addNeed(needs, 46, 1)
    addNeed(needs, 61, plan.purchase.creditNote === null ? 0 : 1)
    addNeed(needs, 56, plan.purchase.debitNote === null ? 0 : 1)
  }
  return needs
}

/**
 * EN: Options of `prepareFolios`.
 * ES: Opciones de `prepareFolios`.
 */
export type PrepareFoliosOptions = {
  /** EN: Folios needed per type; the sets not yet sent by default. ES: Folios necesarios por tipo; por defecto los sets aún no enviados. */
  readonly needs?: Readonly<Record<number, number>>
  /** EN: Ignore the CAFs in hand and request new ones (the simulation never reuses the sets' CAFs). ES: Ignorar los CAF en mano y pedir nuevos (la simulación nunca reutiliza los CAF de los sets). */
  readonly fresh?: boolean
}

/**
 * EN: What `prepareFolios` returns: the state, and the CAFs that cover the needs.
 * ES: Lo que devuelve `prepareFolios`: el estado, y los CAF que cubren las necesidades.
 */
export type PrepareFoliosResult = StepResult<'ready'> & {
  /** EN: The CAF files to issue with: the ones in hand plus the new ones, or only the new ones with `fresh`. ES: Los CAF con que emitir: los en mano más los nuevos, o solo los nuevos con `fresh`. */
  readonly cafs: readonly string[]
}

type Used = readonly { readonly type: number; readonly folio: number }[]

// Folios this run marked sent whose envelope the SII never received (a failed send) come back: the field learnt it after
// six retries burned 66 folios. At most 30 checks per CAF.
const recoverUnreceived = async (rt: Runtime, held: readonly HeldCaf[], used: Used): Promise<Used> => {
  const released = new Set<string>()
  for (const h of held) {
    const candidates = used
      .filter((u) => u.type === h.caf.documentType && u.folio >= h.caf.range.from && u.folio <= h.caf.range.to)
      .slice(0, MAX_RECEIPT_CHECKS)
    const free: number[] = []
    for (const candidate of candidates) {
      const received = await folioReceived(rt.sii, { type: h.caf.documentType, folio: candidate.folio }).catch(
        () => null,
      )
      if (received === false) free.push(candidate.folio)
    }
    if (free.length === 0) continue
    await rt.registry.release(h.scope, free)
    for (const folio of free) released.add(`${h.caf.documentType}-${folio}`)
  }
  return used.filter((u) => !released.has(`${u.type}-${u.folio}`))
}

const shortage = (type: number, required: number, available: number, result: FolioFlowResult): DteError =>
  new DteError('FOLIO_OUT_OF_RANGE', {
    type,
    required,
    available,
    maxAuthorized: result.maxAuthorized,
    availableFolios: result.availableFolios,
    rejection: result.rejection,
    reason: result.availableFolios === 0 ? 'noUnusedFolios' : 'unusedFoliosBlock',
  })

/**
 * EN: Makes sure the run holds the folios each type needs, as the field does it: the CAFs in hand first (an expired
 * one is skipped; folios of this run the SII never received are given back), then the quota; a blocked or short quota
 * with unused folios at the SII re-obtains them; then one exact request, or batches when the maximum is below the
 * need, falling back to batches when the exact request falls short; as a last resort, when the refusal is rationing
 * and the SII shows more unused folios than the run holds, unused ranges of the last 180 days (at most 10, never the
 * CAFs in hand) are annulled and the request repeated. Still short throws `FOLIO_OUT_OF_RANGE` with the numbers.
 * ES: Asegura que la corrida tenga los folios que necesita cada tipo, como lo hace el campo: primero los CAF en mano
 * (uno vencido se omite; los folios de esta corrida que el SII nunca recibió se devuelven), luego el cupo; un cupo
 * bloqueado o corto con folios sin usar en el SII los reobtiene; luego una solicitud exacta, o por tandas cuando el
 * máximo está bajo la necesidad, cayendo a tandas cuando la exacta queda corta; como último recurso, cuando la negativa
 * es racionamiento y el SII muestra más folios sin usar que los en mano, se anulan rangos sin usar de los últimos 180
 * días (máximo 10, nunca los CAF en mano) y se repite la solicitud. Si aún falta, lanza `FOLIO_OUT_OF_RANGE` con los
 * números.
 * @throws {DteError} EN: `MISSING_FIELD { field: 'plan' }` without a plan and without `needs`; `FOLIO_OUT_OF_RANGE { type, required, available, maxAuthorized, availableFolios, rejection, reason }`; the portal codes. ES: los mismos códigos.
 */
export const prepareFolios = async (
  deps: CertificationDependencies,
  state: CertificationState,
  options: PrepareFoliosOptions = {},
): Promise<PrepareFoliosResult> => {
  const rt = runtime(deps)
  if (options.needs === undefined && state.plan === undefined) throw new DteError('MISSING_FIELD', { field: 'plan' })
  const needs = options.needs ?? setFolioNeeds(state.plan!, Object.keys(state.sets))
  const inHand: string[] = options.fresh ? [] : [...state.cafs]
  const obtained: string[] = []
  let usedFolios = state.usedFolios
  const add = (cafs: readonly ObtainedCaf[]): void => {
    for (const caf of cafs) {
      inHand.push(caf.xml)
      obtained.push(caf.xml)
    }
  }
  for (const type of Object.keys(needs)
    .map(Number)
    .sort((a, b) => a - b)) {
    const required = needs[type]
    rt.emit({ step: 'CAF_REQUESTING', type })
    const held = (): readonly HeldCaf[] => heldCafs(inHand, rt.now()).filter((h) => h.caf.documentType === type)
    // Annulling never touches a CAF the run holds, the sets' included, whatever `fresh` says.
    const everyHeld = (): readonly HeldCaf[] =>
      heldCafs([...state.cafs, ...obtained], rt.now()).filter((h) => h.caf.documentType === type)
    const available = async (): Promise<number> => {
      let sum = 0
      for (const h of held()) sum += await rt.registry.remaining(h.scope)
      return sum
    }
    usedFolios = await recoverUnreceived(rt, held(), usedFolios)
    let missing = required - (await available())
    let last: FolioFlowResult | null = null
    if (missing > 0) {
      const quota: FolioQuota = await queryFolioQuota(rt.portal, { type: type as DocumentType })
      // A quota that is not unrestricted always carries its maximum.
      const short = quota.blocked || (!quota.unrestricted && quota.maxAuthorized! < missing)
      if (short && (quota.availableFolios ?? 0) > 0) {
        const reobtained = await reobtainFolios(rt.portal, {
          type: type as DocumentType,
          quantity: missing,
          isIssued: async (range) =>
            (await rt.registry.stats({ companyRut: state.companyRut, type, environment: 'certification' })).ranges.some(
              (r) => r.from === range.from && r.to === range.to && r.sent > 0,
            ),
          isFolioFree: async (folio) => (await folioReceived(rt.sii, { type: type as DocumentType, folio })) === false,
        })
        add(reobtained.cafs)
        missing = required - (await available())
      }
      if (missing > 0) {
        const exactFirst = quota.unrestricted || quota.maxAuthorized === null || quota.maxAuthorized >= missing
        last = exactFirst
          ? await requestCafExact(rt.portal, { type: type as DocumentType, quantity: missing })
          : await requestCafInBatches(rt.portal, { type: type as DocumentType, quantity: missing, initialQuota: quota })
        add(last.cafs)
        if (!last.complete && exactFirst && last.rejection !== null && BATCH_FALLBACK.has(last.rejection)) {
          last = await requestCafInBatches(rt.portal, { type: type as DocumentType, quantity: missing - last.granted })
          add(last.cafs)
        }
        missing = required - (await available())
      }
      if (missing > 0 && last !== null && last.rejection !== null && RATIONING.has(last.rejection)) {
        const unusedInHand = await available()
        if (last.availableFolios === null || last.availableFolios > unusedInHand) {
          await annulFolios(rt.portal, {
            type: type as DocumentType,
            withinDays: ANNUL_WINDOW_DAYS,
            maxRanges: ANNUL_MAX_RANGES,
            exclude: everyHeld().map((h) => h.caf.range),
          })
          last = await requestCafExact(rt.portal, { type: type as DocumentType, quantity: missing })
          add(last.cafs)
          missing = required - (await available())
        }
      }
      // Still missing after the quota means a request was made, so `last` holds its outcome.
      if (missing > 0) throw shortage(type, required, required - missing, last!)
    }
    rt.emit({ step: 'CAF_OK', type })
  }
  const next = await saveState(rt, state, { cafs: [...state.cafs, ...obtained], usedFolios })
  return { state: next, outcome: 'ready', cafs: options.fresh ? obtained : inHand }
}
