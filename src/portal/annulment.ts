import { isDocumentType, type DocumentType } from '../catalogs/document-types'
import { cgiUrl } from '../catalogs/portal'
import { DteError, isDteError } from '../errors'
import { assertPositive, type CallOverrides } from '../sii/client'
import { isRetryablePortalError, resolvePortalCompany, type PortalClient } from './client'
import { flowFailure, type FolioFlowFailure } from './flow-failure'
import { formAction, inputValues, namedForm } from './html'
import {
  annulledBefore,
  annulmentAnswer,
  isAlreadyAnnulled,
  nextPageButton,
  parseUnusedRanges,
  uniqueRanges,
  type AnnulmentAnswer,
  type AnnulmentRejectionReason,
  type UnusedFolioRange,
} from './pages/annulment'
import {
  assertNotRejected,
  companyFields,
  ensurePage,
  submitForm,
  unexpectedPage,
  withPortalSession,
  type PortalContext,
  type PortalPage,
} from './session'

const MAX_EXTRA_PAGES = 20
const MAX_PASSES = 4
const PASS_PAUSE_MS = 1500
const STEP_RETRIES = 2
const STEP_RETRY_PAUSE_MS = 1500
const DEFAULT_MAX_RANGES = 50
const MAX_REFUSALS_IN_A_ROW = 2
const DEFAULT_REASON = 'Folios no utilizados'
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * EN: The unused ranges of a document type.
 * ES: Los rangos sin usar de un tipo de documento.
 */
export type FolioRanges = {
  /** EN: Every unused range, annulled ones included: the SII does not tell them apart. ES: Todos los rangos sin usar, incluidos los anulados: el SII no los distingue. */
  readonly ranges: readonly UnusedFolioRange[]
  /** EN: Highest folio listed, or null. ES: Mayor folio listado, o null. */
  readonly lastFolio: number | null
}

/**
 * EN: Some folios and how many they are.
 * ES: Algunos folios y cuántos son.
 */
export type FolioSpan = {
  /** EN: First folio. ES: Primer folio. */
  readonly from: number
  /** EN: Last folio. ES: Último folio. */
  readonly to: number
  /** EN: Folios it covers. ES: Folios que cubre. */
  readonly count: number
}

/**
 * EN: Input of `annulFolios`. One of `range`, `withinDays` or `all` is required: annulment cannot be undone and annulled
 * folios count against the stamping quota for six months.
 * ES: Entrada de `annulFolios`. Se exige `range`, `withinDays` o `all`: la anulación no se puede deshacer y los folios
 * anulados pesan contra el cupo de timbraje durante seis meses.
 */
export type AnnulFoliosInput = {
  /** EN: Document type. ES: `COD_DOCTO` — Tipo de documento. */
  readonly type: DocumentType
  /** EN: Only these folios. ES: `FOLIO_INI_A`, `FOLIO_FIN_A` — Solo estos folios. */
  readonly range?: { readonly from: number; readonly to: number }
  /** EN: Only ranges stamped within these days; a range with no readable date is skipped. ES: Solo rangos timbrados en estos días; un rango sin fecha legible se omite. */
  readonly withinDays?: number
  /** EN: Every unused range, up to `maxRanges`. ES: Todos los rangos sin usar, hasta `maxRanges`. */
  readonly all?: boolean
  /** EN: Reason; "Folios no utilizados" by default. ES: `MOTIVO` — Motivo; "Folios no utilizados" por defecto. */
  readonly reason?: string
  /** EN: Most ranges tried in EACH pass, taken from the end of the listing; 50 by default. It is not a limit on the call: there are up to four passes, so one call can annul up to four times this many ranges (200 by default). ES: Máximo de rangos que se intentan en CADA pasada, tomados del final del listado; 50 por defecto. No es un tope de la llamada: hay hasta cuatro pasadas, así que una llamada puede anular hasta cuatro veces esta cantidad de rangos (200 por defecto). */
  readonly maxRanges?: number
  /** EN: Folios never to touch, such as a CAF still in use. ES: Folios que no se tocan, como un CAF todavía en uso. */
  readonly exclude?: readonly { readonly from: number; readonly to: number }[]
  /** EN: `knownAnnulled` of the previous run: a listed range whose folios these keys cover, in one key or several, is not tried again. ES: `knownAnnulled` de la corrida anterior: un rango listado cuyos folios cubren estas claves, en una o en varias, no se vuelve a intentar. */
  readonly knownAnnulled?: readonly string[]
  /** EN: Company RUT; the client's by default. ES: `RUT_EMP` + `DV_EMP` — RUT de la empresa; por defecto el del cliente. */
  readonly companyRut?: string
}

/**
 * EN: What an annulment did.
 * ES: Lo que hizo una anulación.
 */
export type AnnulmentResult = {
  /** EN: Folios annulled. ES: Folios anulados. */
  readonly annulled: readonly FolioSpan[]
  /** EN: Folios not annulled, and why. `alreadyAnnulled` and `received` are expected results, not refusals; `unknown` is an answer the SII gave in no known words, so those folios may be annulled or not. ES: Folios no anulados y por qué. `alreadyAnnulled` y `received` son resultados esperados, no negativas; `unknown` es una respuesta del SII sin palabras conocidas, así que esos folios pueden estar anulados o no. */
  readonly rejected: readonly (FolioSpan & { readonly reason: AnnulmentRejectionReason })[]
  /** EN: Sum of `annulled`. ES: Suma de `annulled`. */
  readonly totalAnnulled: number
  /** EN: Sum of `rejected`. ES: Suma de `rejected`. */
  readonly totalRejected: number
  /** EN: `from-to` keys that are final (annulled, `alreadyAnnulled` or `received`): persist it and pass it back, because the portal keeps listing them forever. A range answered folio by folio comes in as few keys as its answers allow, one for each run of folios with the same answer. Nothing the SII answered in unknown words goes here. ES: Claves `desde-hasta` definitivas (anuladas, `alreadyAnnulled` o `received`): guárdalas y devuélvelas, porque el portal las sigue listando para siempre. Un rango respondido folio por folio queda en tan pocas claves como lo permitan sus respuestas, una por cada tramo de folios con la misma respuesta. Nada que el SII haya respondido con palabras desconocidas va aquí. */
  readonly knownAnnulled: readonly string[]
  /** EN: What stopped the walk once the SII had answered for some folios, or null: a `DteError` of a later listing (`listFolioRanges`) or of a later range (`annulFolios`), a refusal included. Annulling cannot be undone, so what was done until then comes back; with no answer yet the error is thrown, and a range that never got through (`transport`) is no answer. ES: Lo que detuvo el recorrido cuando el SII ya había respondido por algunos folios, o null: un `DteError` de un listado posterior (`listFolioRanges`) o de un rango posterior (`annulFolios`), un rechazo incluido. Anular no se puede deshacer, así que vuelve lo hecho hasta entonces; sin respuesta aún, el error se lanza, y un rango que nunca llegó (`transport`) no es respuesta. */
  readonly failure: FolioFlowFailure | null
}

const at = (context: PortalContext, page: string): string => cgiUrl(context.portal.environment, page)

// A second layer over the request retries of the client, as field behaviour has: every query of the listing and every
// step of the annulment is tried up to three times, whatever the error, with a pause between tries. A POST that did
// change something on the first try is recovered by the "already annulled" answer of the next one.
const withStepRetries = async <T>(
  context: PortalContext,
  run: () => Promise<T>,
  retries = STEP_RETRIES,
): Promise<T> => {
  try {
    return await run()
  } catch (error) {
    if (retries === 0) throw error
    await context.portal.sleep(STEP_RETRY_PAUSE_MS, context.overrides?.signal)
    return withStepRetries(context, run, retries - 1)
  }
}

const moreRanges = async (
  context: PortalContext,
  current: PortalPage,
  ranges: readonly UnusedFolioRange[],
  remaining: number,
): Promise<readonly UnusedFolioRange[]> => {
  const button = nextPageButton(current.html)
  if (button === null || remaining === 0) return ranges
  const form = namedForm(current.html, 'frm') ?? ''
  const action = formAction(form) ?? at(context, 'af_anular2')
  const next = await withStepRetries(context, () =>
    submitForm(
      context,
      'af_anular2.page',
      action,
      current.url,
      { ...inputValues(form), ...(button.page === null ? {} : { PAGINA: String(button.page) }) },
      at(context, 'af_anular2'),
    ),
  )
  assertNotRejected(context, next.html)
  const merged = uniqueRanges([...ranges, ...parseUnusedRanges(next.html)])
  return moreRanges(
    context,
    next,
    [...merged].sort((a, b) => b.to - a.to),
    remaining - 1,
  )
}

const listInSession = async (context: PortalContext, type: number, companyRut?: string): Promise<FolioRanges> => {
  const company = companyFields(resolvePortalCompany(context.portal, companyRut))
  const entry = await ensurePage(context, 'af_anular1', at(context, 'af_anular1'))
  assertNotRejected(context, entry.html)
  if (!entry.html.includes('ANULACION DE FOLIOS')) throw unexpectedPage(context, 'af_anular1', entry.html)
  const first = await withStepRetries(context, () =>
    submitForm(
      context,
      'af_anular2',
      at(context, 'af_anular2'),
      entry.url,
      { ...inputValues(entry.html), ...company, PAGINA: '1', COD_DOCTO: String(type), ACEPTAR: 'Consultar' },
      at(context, 'af_anular1'),
    ),
  )
  assertNotRejected(context, first.html)
  const ranges = await moreRanges(context, first, parseUnusedRanges(first.html), MAX_EXTRA_PAGES)
  return { ranges, lastFolio: ranges.length === 0 ? null : Math.max(...ranges.map((range) => range.to)) }
}

const assertDocumentType = (type: unknown): void => {
  if (!isDocumentType(type)) throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type' })
}

const isPositiveInteger = (value: number): boolean => Number.isInteger(value) && value > 0

const isSpan = (span: { readonly from: number; readonly to: number }): boolean =>
  isPositiveInteger(span.from) && isPositiveInteger(span.to) && span.from <= span.to

// Annulling cannot be undone, and a value the filters cannot read would widen the scope instead of narrowing it:
// `withinDays: NaN` passes every date, `maxRanges: 0` every range and `exclude` with `NaN` protects nothing.
const assertScope = (input: AnnulFoliosInput): void => {
  if (input.range === undefined && input.withinDays === undefined && input.all !== true)
    throw new DteError('INVALID_OPTION', { field: 'range' })
  if (input.range !== undefined && !isSpan(input.range)) throw new DteError('INVALID_OPTION', { field: 'range' })
  assertPositive(input.withinDays, 'withinDays')
  if (input.maxRanges !== undefined && !isPositiveInteger(input.maxRanges))
    throw new DteError('INVALID_OPTION', { field: 'maxRanges' })
  if (input.exclude !== undefined && !input.exclude.every(isSpan))
    throw new DteError('INVALID_OPTION', { field: 'exclude' })
}

/**
 * EN: Lists the unused ranges of a document type, following the pages of the listing. It changes nothing.
 * ES: Lista los rangos sin usar de un tipo de documento, siguiendo las páginas del listado. No cambia nada.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: document type and company. ES: tipo de documento y empresa.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the ranges and the highest folio. ES: los rangos y el mayor folio.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const listFolioRanges = (
  portal: PortalClient,
  input: { readonly type: DocumentType; readonly companyRut?: string },
  overrides?: CallOverrides,
): Promise<FolioRanges> =>
  withPortalSession(portal, 'listFolioRanges', overrides, (context) => {
    assertDocumentType(input.type)
    return listInSession(context, input.type, input.companyRut)
  })

const overlaps = (range: UnusedFolioRange, span: { readonly from: number; readonly to: number }): boolean =>
  range.from <= span.to && range.to >= span.from

const inScope = (range: UnusedFolioRange, input: AnnulFoliosInput, earliestMs: number | null): boolean => {
  if (input.range !== undefined && !overlaps(range, input.range)) return false
  if (earliestMs !== null && (range.date === null || new Date(`${range.date}T00:00:00Z`).getTime() < earliestMs))
    return false
  return !(input.exclude ?? []).some((span) => overlaps(range, span))
}

// A transport failure on one range is recorded and the walk goes on; a block or a limit ends the whole operation.
const attempt = async (
  context: PortalContext,
  step: string,
  page: string,
  base: string,
  fields: Readonly<Record<string, string>>,
  referer: string,
): Promise<PortalPage | null> => {
  try {
    return await withStepRetries(context, () => submitForm(context, step, at(context, page), base, fields, referer))
  } catch (error) {
    if (isRetryablePortalError(error)) return null
    throw error
  }
}

const isFinal = (reason: AnnulmentAnswer | 'transport'): boolean =>
  reason === 'alreadyAnnulled' || reason === 'received'

type Tally = {
  readonly annulled: FolioSpan[]
  readonly rejected: (FolioSpan & { readonly reason: AnnulmentRejectionReason })[]
  readonly known: Set<string>
}

// Writes down what the SII answered for some folios, and returns the refusals it adds to the count; `null` resets it.
// Only a final answer goes into the memory: after any other the folios may or may not be annulled, so they are tried
// again by a later run instead of being left out of issuing for good.
const record = (tally: Tally, span: FolioSpan, answer: AnnulmentAnswer | 'transport'): number | null => {
  if (answer === 'accepted') {
    tally.annulled.push(span)
    tally.known.add(`${span.from}-${span.to}`)
    return null
  }
  tally.rejected.push({ ...span, reason: answer })
  if (!isFinal(answer)) return 1
  tally.known.add(`${span.from}-${span.to}`)
  return 0
}

// Writes down the answers of a span's folios, from its first, each run of folios with the same answer as one span: a
// range the SII answers folio by folio is reported, and remembered, in as few pieces as its answers allow. Returns the
// most refusals one run adds, or 0.
const recordFolios = (tally: Tally, from: number, answers: readonly (AnnulmentAnswer | 'transport')[]): number => {
  const runs: (FolioSpan & { readonly answer: AnnulmentAnswer | 'transport' })[] = []
  answers.forEach((answer, index) => {
    const last = runs[runs.length - 1]
    if (last?.answer === answer) runs[runs.length - 1] = { ...last, to: from + index, count: last.count + 1 }
    else runs.push({ from: from + index, to: from + index, count: 1, answer })
  })
  return runs.reduce((refusals, { answer, ...run }) => Math.max(refusals, record(tally, run, answer) ?? 0), 0)
}

// `af_anular3` said the range was annulled before. The page lists the folios it means ("Folio Inicial Anulado 114
// Folio Final Anulado 114"): those are `alreadyAnnulled`, and about the rest of the span it says nothing. A page with
// no such list speaks for the whole span.
const recordAnnulledBefore = (tally: Tally, span: FolioSpan, html: string): number => {
  const before = annulledBefore(html)
  if (before.length === 0) return record(tally, span, 'alreadyAnnulled')!
  const answers = Array.from({ length: span.count }, (_, index) =>
    before.some((range) => range.from <= span.from + index && span.from + index <= range.to)
      ? 'alreadyAnnulled'
      : 'unknown',
  )
  return recordFolios(tally, span.from, answers)
}

// A step retried after its answer was lost hears "already annulled" for what its first try did: every folio says so,
// and the span is one piece again. What the SII answered is written down whatever ends the walk: a block or an expired
// session at one folio must not throw away the folios it annulled before, which cannot be undone.
const annulOneByOne = async (
  context: PortalContext,
  span: FolioSpan,
  fields: Readonly<Record<string, string>>,
  base: string,
  tally: Tally,
): Promise<void> => {
  const answers: (AnnulmentAnswer | 'transport')[] = []
  try {
    for (let folio = span.from; folio <= span.to; folio += 1) {
      const answer = await attempt(
        context,
        'af_anular.folio',
        'af_anular',
        base,
        { ...fields, FOLIO_INI_A: String(folio), FOLIO_FIN_A: String(folio) },
        at(context, 'af_anular3'),
      )
      answers.push(answer === null ? 'transport' : annulmentAnswer(answer.html))
    }
  } finally {
    recordFolios(tally, span.from, answers)
  }
}

// Returns the refusals this range adds to the count; `null` resets it. Only real refusals count: `alreadyAnnulled` and
// `received` come mixed with successes, and counting them once stopped a clean-up with ranges still annullable.
const annulRange = async (
  context: PortalContext,
  range: UnusedFolioRange,
  input: AnnulFoliosInput,
  company: ReturnType<typeof companyFields>,
  tally: Tally,
): Promise<number | null> => {
  const from = input.range === undefined ? range.from : Math.max(range.from, input.range.from)
  const to = input.range === undefined ? range.to : Math.min(range.to, input.range.to)
  const span = { from, to, count: to - from + 1 }
  const [year, month = '', day = ''] = (range.date ?? '').split('-')
  const entryForm = await attempt(
    context,
    'af_anular3',
    'af_anular3',
    at(context, 'af_anular2'),
    {
      ...company,
      DIA: day,
      MES: month,
      ANO: year,
      COD_DOCTO: String(input.type),
      FOLIO_INI: String(range.from),
      FOLIO_FIN: String(range.to),
      CANT_DOCTOS: String(range.quantity),
    },
    at(context, 'af_anular2'),
  )
  if (entryForm === null) return record(tally, span, 'transport')
  if (isAlreadyAnnulled(entryForm.html)) return recordAnnulledBefore(tally, span, entryForm.html)
  const fields = {
    ...inputValues(entryForm.html),
    FOLIO_INI_A: String(from),
    FOLIO_FIN_A: String(to),
    MOTIVO: input.reason ?? DEFAULT_REASON,
  }
  const answer = await attempt(context, 'af_anular', 'af_anular', entryForm.url, fields, at(context, 'af_anular3'))
  const outcome = answer === null ? 'transport' : annulmentAnswer(answer.html)
  // Part of the range was annulled or received before, and the SII refuses the whole range: it goes folio by folio. A
  // single folio already has its answer, and sending it again would only ask the same thing twice.
  if (!isFinal(outcome) || span.count === 1) return record(tally, span, outcome)
  await annulOneByOne(context, span, fields, entryForm.url, tally)
  return 0
}

const sum = (spans: readonly FolioSpan[]): number => spans.reduce((total, span) => total + span.count, 0)

// The spans of the `from-to` keys, by their first folio; a key that is not one is left out.
const spansOf = (keys: Iterable<string>): readonly { readonly from: number; readonly to: number }[] =>
  [...keys]
    .flatMap((key) => {
      const match = /^(\d+)-(\d+)$/.exec(key)
      return match === null ? [] : [{ from: Number(match[1]), to: Number(match[2]) }]
    })
    .sort((a, b) => a.from - b.from)

// Whether the spans hold every folio of the range: a range answered folio by folio is remembered in pieces, and only its
// exact key would be left out.
const isCovered = (
  range: UnusedFolioRange,
  spans: readonly { readonly from: number; readonly to: number }[],
): boolean => {
  let next = range.from
  for (const span of spans) if (span.from <= next && span.to >= next) next = span.to + 1
  return next > range.to
}

/**
 * EN: `annulFolios` inside a session already held.
 * ES: `annulFolios` dentro de una sesión ya tomada.
 */
export const annulFoliosInSession = async (
  context: PortalContext,
  input: AnnulFoliosInput,
): Promise<AnnulmentResult> => {
  assertDocumentType(input.type)
  assertScope(input)
  const company = companyFields(resolvePortalCompany(context.portal, input.companyRut))
  const earliestMs = input.withinDays === undefined ? null : context.portal.now().getTime() - input.withinDays * DAY_MS
  const tally: Tally = { annulled: [], rejected: [], known: new Set(input.knownAnnulled ?? []) }
  const seen = new Set<string>()
  // The limit applies to each pass, as in field behaviour: four passes can reach four times `maxRanges`.
  const limit = input.maxRanges ?? DEFAULT_MAX_RANGES
  // The step under way, for a failure: the pause between passes belongs to the next listing.
  let step: FolioFlowFailure['operation'] = 'listFolioRanges'
  let failure: FolioFlowFailure | null = null
  try {
    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
      const { ranges } = await listInSession(context, input.type, input.companyRut)
      const known = spansOf(tally.known)
      const candidates = ranges
        .filter((range) => inScope(range, input, earliestMs))
        .filter((range) => !isCovered(range, known) && !seen.has(`${range.from}-${range.to}`))
        .slice(-limit)
      if (candidates.length === 0) break
      step = 'annulFolios'
      const counter = { refusals: 0 }
      for (const range of candidates) {
        if (counter.refusals >= MAX_REFUSALS_IN_A_ROW) {
          context.portal.logger.warn('sii portal stopped annulling: the SII keeps refusing', {
            operation: context.operation,
            type: input.type,
          })
          break
        }
        seen.add(`${range.from}-${range.to}`)
        const added = await annulRange(context, range, input, company, tally)
        counter.refusals = added === null ? 0 : counter.refusals + added
      }
      step = 'listFolioRanges'
      if (pass < MAX_PASSES - 1) await context.portal.sleep(PASS_PAUSE_MS, context.overrides?.signal)
    }
  } catch (error) {
    // Annulling cannot be undone: once the SII has answered for some folios, what it did may not be thrown away. A range
    // that never got through is no answer. Before any answer the error stays an error, and so does anything that is not
    // a `DteError`: a bug.
    const answered = tally.annulled.length > 0 || tally.rejected.some((entry) => entry.reason !== 'transport')
    if (!isDteError(error) || !answered) throw error
    failure = flowFailure(context, error, step)
  }
  return {
    annulled: tally.annulled,
    rejected: tally.rejected,
    totalAnnulled: sum(tally.annulled),
    totalRejected: sum(tally.rejected),
    knownAnnulled: [...tally.known],
    failure,
  }
}

/**
 * EN: Annuls unused folios: up to four passes over the listing, by range and folio by folio when the range conflicts,
 * stopping a pass after two real refusals in a row. Each pass takes the last `maxRanges` ranges it has not tried yet,
 * so `maxRanges` limits a pass and not the call: one call can annul up to four times `maxRanges` ranges. Every query of
 * the listing and every step is tried up to three times, 1.5 s apart, whatever the error, on top of the retries of the
 * client; a step that changed something on a try that failed is recovered by the "already annulled" answer of the next.
 * Annulment cannot be undone and counts against the quota for six months; to lift a stamping block, issuing with the
 * unused folios works and annulling makes it worse. For that reason, once the SII has answered for some folios, a
 * `DteError` that ends the walk (an expired session, a block, the caller's abort, a later listing refused or not
 * understood) comes back in `failure`, with what was done until then, instead of throwing it away. A range that never
 * got through, recorded as `transport`, is no answer.
 * ES: Anula folios sin usar: hasta cuatro pasadas por el listado, por rango y folio por folio cuando el rango choca,
 * deteniendo una pasada tras dos negativas reales seguidas. Cada pasada toma los últimos `maxRanges` rangos que aún no
 * intentó, así que `maxRanges` limita una pasada y no la llamada: una llamada puede anular hasta cuatro veces
 * `maxRanges` rangos. Cada consulta del listado y cada paso se intenta hasta tres veces, con 1,5 s entre intentos, sea
 * cual sea el error, encima de los reintentos del cliente; un paso que cambió algo en un intento fallido se recupera
 * con la respuesta "ya anulado" del siguiente. La anulación no se puede deshacer y pesa contra el cupo seis meses; para
 * levantar un bloqueo de timbraje, emitir con los folios sin usar sirve y anular lo empeora. Por eso, cuando el SII ya
 * respondió por algunos folios, un `DteError` que termina el recorrido (una sesión vencida, un bloqueo, la cancelación de
 * quien llama, un listado posterior rechazado o ilegible) vuelve en `failure`, con lo hecho hasta entonces, en vez de
 * botarlo. Un rango que nunca llegó, anotado como `transport`, no es respuesta.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: type and an explicit scope. ES: tipo y un alcance explícito.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: what was annulled, what was not, the memory to persist, and what cut the walk short. ES: lo anulado, lo no anulado, la memoria que guardar y lo que cortó el recorrido.
 * @throws {DteError} EN: `INVALID_OPTION { field }` without a scope or with one that cannot be read; `SII_PORTAL_REJECTED`, `SII_PORTAL_UNEXPECTED_PAGE`, session and block codes only before the SII has answered for any folio. ES: `INVALID_OPTION { field }` sin alcance o con uno ilegible; `SII_PORTAL_REJECTED`, `SII_PORTAL_UNEXPECTED_PAGE`, códigos de sesión y bloqueo solo antes de que el SII responda por algún folio.
 */
export const annulFolios = (
  portal: PortalClient,
  input: AnnulFoliosInput,
  overrides?: CallOverrides,
): Promise<AnnulmentResult> =>
  withPortalSession(portal, 'annulFolios', overrides, (context) => annulFoliosInSession(context, input))
