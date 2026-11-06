import { parseCaf, type Caf } from '../caf/parse'
import { isCafExpired } from '../caf/validity'
import type { DocumentType } from '../catalogs/document-types'
import type { PortalRejection } from '../catalogs/portal'
import { DteError } from '../errors'
import type { FolioScope } from '../folios/ledger'
import { cafFingerprint, type FolioRegistry } from '../folios/registry'
import { annulFolios } from '../portal/annulment'
import {
  reobtainFolios,
  requestCafExact,
  requestCafInBatches,
  type FolioFlowResult,
  type ReobtainResult,
} from '../portal/flows'
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
// After an exact request these mean "less than asked": a run of batches may still cover it. A single folio over the
// maximum is not one of them: that refusal stands.
const BATCH_FALLBACK: ReadonlySet<PortalRejection> = new Set(['quotaInsufficient', 'foliosShort'])

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
 * EN: A folio source over the held CAFs through the registry: the first CAF of the type with a folio left gives its
 * lowest folio that is neither used nor annulled, reserved in the registry, so two runs never take the same folio. The
 * lowest and not the next after the last one: the run marks used the folios the SII did not show free, wherever they
 * lie, and the free ones below them are the ones to issue with, as field behaviour takes them.
 * ES: Una fuente de folios sobre los CAF en mano a través del registro: el primer CAF del tipo con un folio libre da su
 * menor folio que no esté usado ni anulado, reservado en el registro, así dos corridas nunca toman el mismo folio. El
 * menor y no el siguiente al último: la corrida marca como usados los folios que el SII no mostró libres, estén donde
 * estén, y los libres bajo ellos son los que hay que emitir, como los toma el comportamiento de campo.
 */
export const registryFolioSource = (registry: FolioRegistry, held: readonly HeldCaf[]): FolioSource => ({
  take: async (type: DocumentType) => {
    for (const h of held) {
      if (h.caf.documentType !== type) continue
      if ((await registry.remaining(h.scope)) > 0)
        return { caf: h.caf, folio: await registry.reserve(h.scope, { lowestFree: true }) }
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
  /** EN: The CAF files to issue with: the ones in hand plus the new ones, or only the new ones with `fresh`; ranges obtained again that were kept take the place of the ones in hand of their type. ES: Los CAF con que emitir: los en mano más los nuevos, o solo los nuevos con `fresh`; los rangos reobtenidos que se conservan ocupan el lugar de los en mano de su tipo. */
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

// A CAF already in hand can hold folios the SII received in an earlier run or from other software, and a document issued
// with one is rejected whole. Before issuing, the SII is asked for the folios the run is about to use, oldest CAF first,
// until the need is covered and at most 30 per CAF; a received folio is marked used in the registry. A
// folio the SII cannot answer for keeps the previous behaviour and is used.
const skipReceivedFolios = async (
  rt: Runtime,
  held: readonly HeldCaf[],
  used: Used,
  required: number,
): Promise<void> => {
  const known = new Set(used.map((u) => `${u.type}-${u.folio}`))
  const sorted = [...held].sort((a, b) => a.caf.range.from - b.caf.range.from)
  let pending = required
  for (const h of sorted) {
    if (pending <= 0) break
    const type = h.caf.documentType
    const received: number[] = []
    let good = 0
    let checks = 0
    for (let folio = h.caf.range.from; folio <= h.caf.range.to; folio += 1) {
      if (good >= pending || checks >= MAX_RECEIPT_CHECKS) break
      if (known.has(`${type}-${folio}`)) continue
      checks += 1
      const answer = await folioReceived(rt.sii, { type, folio }).catch(() => null)
      if (answer === true) received.push(folio)
      else good += 1
    }
    pending -= good
    for (const folio of received) await rt.registry.markSent(h.scope, folio, { extra: { receivedAtSii: true } })
  }
}

// A range obtained again is used only through the folios the SII showed free: every other folio of it, whether received,
// not known or never looked at, is marked used as soon as the CAF is kept, so the registry counts exactly the free ones.
const restrictToFree = async (rt: Runtime, reobtained: ReobtainResult): Promise<void> => {
  for (const [index, range] of reobtained.ranges.entries()) {
    const free = new Set(range.freeFolios)
    const [held] = heldCafs([reobtained.cafs[index].xml], rt.now())
    // The folios of the CAF itself: the SII may hand back a file narrower than the range it listed.
    for (let folio = held.caf.range.from; folio <= held.caf.range.to; folio += 1)
      if (!free.has(folio)) await rt.registry.markSent(held.scope, folio, { extra: { notFree: true } })
  }
}

type Span = { readonly from: number; readonly to: number }

// The ranges of the CAFs of a type, expired ones included.
const rangesOf = (xmls: readonly string[], type: number): readonly Span[] =>
  xmls
    .map((xml) => parseCaf(xml))
    .filter((caf) => caf.documentType === type)
    .map((caf) => caf.range)

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
 * EN: Makes sure the run holds the folios each type needs, as the field does it. The CAFs in hand first: an expired one
 * is skipped, folios of this run the SII never received are given back, and folios the SII already received are marked
 * used so they are skipped. Then the quota: a refusal or a failure reading it is not a stop, the run goes on with no
 * maximum. A blocked quota, or a short one with unused folios at the SII, re-obtains them for the whole need of the
 * type: a whole answer ends the type and is what it is issued with; a short one is kept, in place of the CAFs in hand,
 * only if it downloaded something that covers more than they do. A blocked maximum asks the portal for nothing;
 * otherwise one exact request, or batches when the maximum is below the need (as many batches as folios are missing),
 * falling back to batches when the exact request falls short with a maximum that is not zero. A block on the person
 * tries the re-obtaining once, if it was not tried, before anything else. As a last resort, when the refusal is
 * rationing and the SII shows more unused folios than the run holds, unused ranges of the last 180 days are annulled:
 * at most 10 in each of up to four passes, never a range the run downloaded (the CAFs of the state, expired ones
 * included, the ones just obtained, and the ones a re-obtention brought and the run did not keep) and never the ranges
 * kept in `annulledRanges`. If any was annulled the maximum is read again and the request repeated following it; an
 * annulment that fails counts as none. Every CAF obtained is saved in the state at once, so a step that ends short
 * leaves them in hand for the next attempt. Still short throws `FOLIO_OUT_OF_RANGE` with the numbers.
 * ES: Asegura que la corrida tenga los folios que necesita cada tipo, como lo hace el campo. Primero los CAF en mano:
 * uno vencido se omite, los folios de esta corrida que el SII nunca recibió se devuelven, y los que el SII ya recibió
 * se marcan como usados para saltarlos. Luego el cupo: un rechazo o un fallo al leerlo no detiene, la corrida sigue sin
 * tope. Un cupo bloqueado, o corto con folios sin usar en el SII, los reobtiene para toda la necesidad del tipo: una
 * respuesta completa cierra el tipo y es con lo que se emite; una corta se conserva, en lugar de los CAF en mano, solo
 * si descargó algo que cubre más que ellos. Un máximo bloqueado no pide nada al portal; si no, una solicitud exacta, o
 * por tandas cuando el máximo está bajo la necesidad (tantas tandas como folios falten), cayendo a tandas cuando la
 * exacta queda corta con un máximo que no es cero. Un bloqueo de la persona intenta la reobtención una vez, si no se
 * había intentado, antes que cualquier otra cosa. Como último recurso, cuando la negativa es racionamiento y el SII
 * muestra más folios sin usar que los en mano, se anulan rangos sin usar de los últimos 180 días: máximo 10 en cada una
 * de hasta cuatro pasadas, nunca un rango que la corrida descargó (los CAF del estado, incluidos los vencidos, los
 * recién obtenidos y los que trajo una reobtención y la corrida no conservó) ni los rangos de `annulledRanges`. Si se
 * anuló alguno se lee de nuevo el máximo y se repite la solicitud siguiéndolo; una anulación que falla cuenta como
 * ninguna. Cada CAF obtenido se guarda en el estado de inmediato, así un paso que termina corto los deja en mano para
 * el siguiente intento. Si aún falta, lanza `FOLIO_OUT_OF_RANGE` con los números.
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
  let inHand: readonly string[] = options.fresh ? [] : state.cafs
  const obtained: string[] = []
  let usedFolios = state.usedFolios
  let annulledRanges: Readonly<Record<string, readonly string[]>> = state.annulledRanges ?? {}
  let current = state
  // A file the run already holds is counted once.
  const stateCafs = (): readonly string[] => [...new Set([...state.cafs, ...obtained])]
  // What is obtained is kept at once, as field behaviour leaves every CAF on disk: a step that ends short further on
  // finds it in hand at the next attempt instead of asking for it again, which is what makes the SII ration.
  const add = async (cafs: readonly ObtainedCaf[]): Promise<void> => {
    if (cafs.length === 0) return
    obtained.push(...cafs.map((caf) => caf.xml))
    inHand = [...new Set([...inHand, ...cafs.map((caf) => caf.xml)])]
    current = await saveState(rt, current, { cafs: stateCafs() })
  }
  for (const type of Object.keys(needs)
    .map(Number)
    .sort((a, b) => a - b)) {
    const required = needs[type]
    rt.emit({ step: 'CAF_REQUESTING', type })
    const held = (): readonly HeldCaf[] => heldCafs(inHand, rt.now()).filter((h) => h.caf.documentType === type)
    // Annulling never touches a range the run downloaded, whatever `fresh` says: the CAFs of the state (the sets' and
    // the expired ones included), the ones just obtained, and the ones a re-obtention brought and the run did not keep,
    // as field behaviour leaves out every CAF file it has on disk.
    const setAside: Span[] = []
    const untouchable = (): readonly Span[] => [...rangesOf(stateCafs(), type), ...setAside]
    const available = async (): Promise<number> => {
      let sum = 0
      for (const h of held()) sum += await rt.registry.remaining(h.scope)
      return sum
    }
    usedFolios = await recoverUnreceived(rt, held(), usedFolios)
    await skipReceivedFolios(rt, held(), usedFolios, required)
    let missing = required - (await available())
    let last: FolioFlowResult | null = null
    let reobtainTried = false
    // The SII is asked for the whole need of the type, as field behaviour does, and the folios already in hand count as
    // covered. Whole: the run is done. Short: what was downloaded is kept only if it covers more than the run already
    // holds, and then the portal is asked for the rest; ranges that were only listed cover nothing. Before any request
    // the ranges kept take the place of the CAFs in hand (one of them may be the same range); after a request a whole
    // answer does too, and a short one joins them.
    const reobtain = async (afterRequest: boolean): Promise<void> => {
      reobtainTried = true
      const reobtained = await reobtainFolios(rt.portal, {
        type: type as DocumentType,
        quantity: required,
        isIssued: async (range) =>
          (await rt.registry.stats({ companyRut: state.companyRut, type, environment: 'certification' })).ranges.some(
            (r) => r.from === range.from && r.to === range.to && r.sent > 0,
          ),
        // A lookup that fails is "not known": the folio is dropped, never an abort.
        isFolioFree: async (folio) =>
          (await folioReceived(rt.sii, { type: type as DocumentType, folio }).catch(() => null)) === false,
      })
      setAside.push(...reobtained.expired.map(({ from, to }) => ({ from, to })))
      const kept = reobtained.complete || (reobtained.cafs.length > 0 && reobtained.available > required - missing)
      if (!kept) {
        setAside.push(...reobtained.cafs.map((caf) => caf.caf.range))
        return
      }
      if (reobtained.complete || !afterRequest) {
        const replaced = new Set(held().map((h) => h.xml))
        inHand = inHand.filter((xml) => !replaced.has(xml))
      }
      await add(reobtained.cafs)
      await restrictToFree(rt, reobtained)
      missing = reobtained.complete ? 0 : required - reobtained.available
    }
    // The floor of the SII is a maximum of one folio and every batch asks for at least one, so as many batches as
    // folios are missing always reach; four, the default, fall short as soon as the SII gives them one by one.
    const batches = (quantity: number, initialQuota?: FolioQuota): Promise<FolioFlowResult> =>
      requestCafInBatches(rt.portal, {
        type: type as DocumentType,
        quantity,
        maxBatches: Math.max(1, quantity),
        ...(initialQuota === undefined ? {} : { initialQuota }),
      })
    // A blocked maximum asks for nothing: the portal is not even visited. Otherwise one exact request, or batches when
    // the maximum is below the need, falling back to batches when the exact request falls short and the maximum it
    // showed is not zero.
    const ask = async (quota: FolioQuota | null, quantity: number): Promise<FolioFlowResult> => {
      if (quota !== null && quota.blocked)
        return {
          complete: false,
          cafs: [],
          granted: 0,
          maxAuthorized: null,
          availableFolios: null,
          rejection: 'stampingBlocked',
          portalMessage: null,
        }
      const exactFirst =
        quota === null || quota.unrestricted || quota.maxAuthorized === null || quota.maxAuthorized >= quantity
      const first = exactFirst
        ? await requestCafExact(rt.portal, { type: type as DocumentType, quantity })
        : await batches(quantity, quota)
      await add(first.cafs)
      const fallsBack =
        !first.complete &&
        exactFirst &&
        first.rejection !== null &&
        BATCH_FALLBACK.has(first.rejection) &&
        (first.maxAuthorized === null || first.maxAuthorized > 0)
      if (!fallsBack) return first
      const rest = await batches(quantity - first.granted)
      await add(rest.cafs)
      return rest
    }
    // A refusal or a failure reading the maximum is not a stop: the run goes on with no maximum, asking in one go.
    const readQuota = (): Promise<FolioQuota | null> =>
      queryFolioQuota(rt.portal, { type: type as DocumentType }).catch(() => null)
    if (missing > 0) {
      const quota = await readQuota()
      // A quota that is not unrestricted always carries its maximum and the count of unused folios.
      const short =
        quota !== null &&
        (quota.blocked || (!quota.unrestricted && quota.maxAuthorized! < required && quota.availableFolios! > 0))
      if (short) await reobtain(false)
      if (missing > 0) {
        last = await ask(quota, missing)
        missing = required - (await available())
      }
      // A block on the person is lifted by issuing with folios already authorized, and annulling makes it worse, so
      // the SII is asked for those folios once before any annulment.
      if (missing > 0 && !reobtainTried && last !== null && last.rejection === 'personWithPendingIssues') {
        await reobtain(true)
      }
      if (missing > 0 && last !== null && last.rejection !== null && RATIONING.has(last.rejection)) {
        const unusedInHand = await available()
        if (last.availableFolios === null || last.availableFolios > unusedInHand) {
          // A failed annulment counts as none annulled and the run goes on.
          const annulment = await annulFolios(rt.portal, {
            type: type as DocumentType,
            withinDays: ANNUL_WINDOW_DAYS,
            maxRanges: ANNUL_MAX_RANGES,
            exclude: untouchable(),
            knownAnnulled: annulledRanges[type] ?? [],
          }).catch(() => null)
          if (annulment !== null) {
            if (annulment.knownAnnulled.length !== (annulledRanges[type] ?? []).length) {
              annulledRanges = { ...annulledRanges, [type]: annulment.knownAnnulled }
              current = await saveState(rt, current, { annulledRanges })
            }
            if (annulment.totalAnnulled > 0) {
              // Annulling moves the maximum, so it is read again and the request follows the same rule as the first.
              last = await ask(await readQuota(), missing)
              missing = required - (await available())
            }
          }
        }
      }
      // Still missing after the quota means a request was made, so `last` holds its outcome.
      if (missing > 0) throw shortage(type, required, required - missing, last!)
    }
    rt.emit({ step: 'CAF_OK', type })
  }
  const next = await saveState(rt, current, { cafs: stateCafs(), usedFolios })
  return { state: next, outcome: 'ready', cafs: inHand }
}
