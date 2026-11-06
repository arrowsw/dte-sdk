import {
  BOOK_ARTEFACT_NAMES,
  BOOK_FILE_NAMES,
  BOOK_KEYS,
  MANDATORY_BOOK_KEYS,
  SET_KEYS,
  TEST_SET_PORTAL_NAMES,
  type BookKey,
} from '../catalogs/certification'
import { DteError, errorMessage, isDteError } from '../errors'
import type { BookTotals } from '../model/book'
import { listBookHistory, queryCertificationSets, type DeclarationEntries } from '../portal/certification'
import type { CertificationSet } from '../portal/pages/certification'
import { uploadBook } from '../sii/upload'
import { chileDate } from '../time/chile'
import {
  createCertificationGuideBook,
  createCertificationPurchaseBook,
  createCertificationSalesBook,
  type CertificationBookInput,
} from './books'
import { fieldDiagnosis, queryFieldUploadState, type FieldUploadState } from './field-status'
import { uploadForTrackId } from './field-upload'
import type { BooksState, CertificationState, SentBook } from './state'
import {
  declareWithRetries,
  entryOf,
  runtime,
  saveState,
  type CertificationDependencies,
  type Runtime,
  type StepResult,
} from './steps'

const HISTORY_TIMEOUT_MS = 12000
const HISTORY_EMPTY_YEARS = 2
const HISTORY_FIRST_YEAR = 1990
const MAX_PERIOD_SKIPS = 400
const MAX_PERIOD_RETRIES = 24
const SOAP_WAIT_MS = 15000
const SOAP_PRECHECK_POLLS = 3
const SOAP_PRECHECK_ERRORS = 10
const SOAP_RESEND_POLLS = 20
const SOAP_RESEND_ERRORS = 5
const APPROVAL_ATTEMPTS = 40
const APPROVAL_INTERVAL_MS = 15000
const CROSS_CHECK_EVERY = 2
// A purchase book the SII already holds for the period: "duplicado", or the schema error it answers instead.
const DUPLICATE = /duplicado|cvc-/i
const CONFORMING = 'REVISADO CONFORME'
const APPROVED: readonly string[] = [CONFORMING, 'S25']
const DECLARED = 'S21'
const CLOSED_BOOK = 'LNC'
const NO_BOOKS = 'No hay libros para declarar'
const ADJUSTABLE: readonly BookKey[] = ['purchaseBook', 'salesBook']
// The order the books are declared and first awaited in, which is not the order they are sent in.
const DECLARED_ORDER: readonly BookKey[] = ['salesBook', 'purchaseBook', 'guideBook', 'exemptPurchaseBook']
const BOOK_NAMES = TEST_SET_PORTAL_NAMES as Readonly<Record<BookKey, string>>

/**
 * EN: How the books phase ended: every wanted book approved; a mandatory book never sent; a declaration the portal did
 * not take or books the SII refused; the approval wait exhausted. Only `incomplete` keeps the run from asking for the
 * next stage: with the three mandatory books sent, the portal decides.
 * ES: Cómo terminó la fase de libros: todos los libros pedidos aprobados; un libro obligatorio nunca enviado; una
 * declaración que el portal no tomó o libros que el SII rechazó; la espera de aprobación agotada. Solo `incomplete`
 * impide que la corrida pida la etapa siguiente: con los tres libros obligatorios enviados, decide el portal.
 */
export type BooksOutcome = 'approved' | 'incomplete' | 'rejected' | 'timedOut'

/**
 * EN: The month before a `YYYY-MM` period.
 * ES: El mes anterior a un período `AAAA-MM`.
 */
export const previousPeriod = (period: string): string => {
  const [year, month] = period.split('-').map(Number)
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`
}

/**
 * EN: The first period at or below `period` the SII does not hold, stepping down month by month, at most 400 times.
 * ES: El primer período en o bajo `period` que el SII no tiene, bajando mes a mes, a lo más 400 veces.
 */
export const nextFreePeriod = (period: string, occupied: ReadonlySet<string>): string => {
  let candidate = period
  for (let skips = 0; occupied.has(candidate) && skips < MAX_PERIOD_SKIPS; skips += 1)
    candidate = previousPeriod(candidate)
  return candidate
}

// The states of the rows of the portal by name, as an object keyed by name would hold them: a name that comes twice
// keeps its first place and its last state.
type Table = ReadonlyMap<string, string>

const tableOf = (rows: readonly CertificationSet[]): Table => new Map(rows.map((row) => [row.name, row.status]))

// The state of a book: the first row whose name holds the book's name; the purchase book is not the exempt one's row.
const bookState = (table: Table, key: BookKey): string | undefined => {
  const found = [...table].find(([name]) => {
    const upper = name.toUpperCase()
    return upper.includes(BOOK_NAMES[key]) && (key !== 'purchaseBook' || !upper.includes('EXENTOS'))
  })
  return found?.[1]
}

const bookKeyOf = (name: string): BookKey | undefined => BOOK_KEYS.find((key) => BOOK_NAMES[key] === name)

// The rows of the portal, or null when they cannot be read: no read of this phase stops the run.
const readTable = async (rt: Runtime): Promise<Table | null> => {
  try {
    return tableOf((await queryCertificationSets(rt.portal)).sets)
  } catch (error) {
    if (!isDteError(error)) throw error
    rt.portal.logger.warn('certification book states failed', { reason: errorMessage(error) })
    return null
  }
}

const withBooks = (state: CertificationState, patch: Partial<BooksState>): Partial<CertificationState> => ({
  books: { ...state.books, ...patch },
})

const without = (results: BooksState['results'], key: BookKey): Readonly<Partial<Record<BookKey, SentBook>>> => {
  const { [key]: dropped, ...rest } = results
  void dropped
  return rest
}

const trackIdOf = (state: CertificationState, key: BookKey): string | null => state.books.results[key]?.trackId ?? null

const operationOf = (key: BookKey): 'purchase' | 'sale' => (key === 'salesBook' ? 'sale' : 'purchase')

const keptTotals = (state: CertificationState, period: string, key: BookKey): readonly BookTotals[] | undefined =>
  ADJUSTABLE.includes(key) ? state.books.accumulated[period]?.[operationOf(key)] : undefined

const buildBook = (
  rt: Runtime,
  state: CertificationState,
  key: BookKey,
  period: string,
  submission: 'total' | 'adjustment',
): { readonly xml: string; readonly periodTotals: readonly BookTotals[] | null } => {
  // Only the sales and the purchase book carry the totals of their earlier total submission into an adjustment.
  const previous = keptTotals(state, period, key)
  const input: CertificationBookInput = {
    period,
    issuerRut: rt.issuer.rut,
    senderRut: rt.sii.senderRut,
    resolution: rt.resolution,
    certificate: rt.certificate,
    now: rt.now,
    submission,
    ...(submission === 'adjustment' && previous !== undefined ? { previousTotals: previous } : {}),
  }
  const receiver = { rut: rt.receiver.rut, name: rt.receiver.businessName }
  switch (key) {
    case 'purchaseBook':
    case 'exemptPurchaseBook': {
      const plan = state.plan?.[key]
      if (plan === undefined) throw new DteError('MISSING_FIELD', { field: 'plan', kind: key })
      const book = createCertificationPurchaseBook(plan, input)
      return { xml: book.xml, periodTotals: book.periodTotals }
    }
    case 'salesBook': {
      const set = state.sets.basic
      if (set === undefined) throw new DteError('MISSING_FIELD', { field: 'sets', kind: 'basic' })
      const book = createCertificationSalesBook({ kind: 'basic', cases: set.cases }, { ...input, receiver })
      return { xml: book.xml, periodTotals: book.periodTotals }
    }
    default: {
      const set = state.sets.guide
      if (set === undefined) throw new DteError('MISSING_FIELD', { field: 'sets', kind: 'guide' })
      const book = createCertificationGuideBook({ kind: 'guide', cases: set.cases }, { ...input, receiver })
      return { xml: book.xml, periodTotals: null }
    }
  }
}

// The SII says it already holds the file: a duplicate it names no track id for, or a `STATUS` 7 refusal whose first
// error line says "duplicado" or names a schema rule.
const heldAlready = (error: unknown): boolean =>
  isDteError(error) &&
  error.code === 'SII_UPLOAD_REJECTED' &&
  error.details.status === 7 &&
  (error.details.duplicate === true || DUPLICATE.test(String((error.details.errors as readonly string[])[0])))

// Builds, keeps, uploads and records one book. A book that cannot be built or that the SII does not take is reported
// and leaves the results, so it is not declared. With `retryHeld`, a purchase book the SII already holds for the
// period goes again as an adjustment.
const sendBook = async (
  rt: Runtime,
  state: CertificationState,
  key: BookKey,
  period: string,
  submission: 'total' | 'adjustment',
  retryHeld: boolean,
): Promise<CertificationState> => {
  rt.emit({ step: 'BOOK_SENDING', book: key })
  const failed = (error: unknown): Promise<CertificationState> => {
    rt.emit({ step: 'BOOK_ERROR', book: key, error: errorMessage(error) })
    return saveState(rt, state, withBooks(state, { results: without(state.books.results, key) }))
  }
  let built: ReturnType<typeof buildBook>
  try {
    built = buildBook(rt, state, key, period, submission)
  } catch (error) {
    return failed(error)
  }
  await rt.store.writeArtefact(BOOK_ARTEFACT_NAMES[key], built.xml)
  try {
    const trackId = await uploadForTrackId(
      (overrides) => uploadBook(rt.sii, { xml: built.xml, fileName: BOOK_FILE_NAMES[key] }, overrides),
      'uploadBook',
    )
    const sent: SentBook = { trackId, date: chileDate(rt.now()), sentAt: rt.now().toISOString(), period, submission }
    // The totals of a total submission of the sales or purchase book are kept for an adjustment of the same period;
    // these two books always have entries, so their totals are never null.
    const accumulated =
      submission === 'total' && ADJUSTABLE.includes(key)
        ? {
            ...state.books.accumulated,
            [period]: { ...state.books.accumulated[period], [operationOf(key)]: built.periodTotals! },
          }
        : state.books.accumulated
    const next = await saveState(
      rt,
      state,
      withBooks(state, { results: { ...state.books.results, [key]: sent }, accumulated }),
    )
    rt.emit({ step: 'BOOK_OK', book: key, trackId })
    return next
  } catch (error) {
    if (retryHeld && submission === 'total' && heldAlready(error))
      return sendBook(rt, state, key, period, 'adjustment', false)
    return failed(error)
  }
}

type StatePoll = {
  readonly state: CertificationState
  /** The books whose envelope reached a state that is not an intermediate one. */
  readonly terminal: ReadonlyMap<BookKey, FieldUploadState>
}

// The SOAP status of sent books: a wait, then rounds 15 s apart, sleeping after every round that leaves a book
// pending. An answer without a state, or a query that fails, counts against the book; at `maxErrors` in a row the
// book is given up. A state that is not intermediate ends the book's poll and is kept as a diagnosis.
const pollBookStates = async (
  rt: Runtime,
  state: CertificationState,
  keys: readonly BookKey[],
  rounds: number,
  maxErrors: number,
): Promise<StatePoll> => {
  let current = state
  const terminal = new Map<BookKey, FieldUploadState>()
  const errors = new Map<BookKey, number>()
  const pending = new Set(keys)
  await rt.sleep(SOAP_WAIT_MS)
  for (let round = 0; round < rounds && pending.size > 0; round += 1) {
    for (const key of keys) {
      if (!pending.has(key)) continue
      // Only sent books reach here, so each has a track id.
      const trackId = trackIdOf(current, key)!
      const status = await queryFieldUploadState(rt.sii, trackId).catch((error: unknown) => {
        rt.portal.logger.warn('certification book status failed', { book: key, reason: errorMessage(error) })
        return null
      })
      if (status === null || !status.answered) {
        const count = (errors.get(key) ?? 0) + 1
        errors.set(key, count)
        if (count >= maxErrors) pending.delete(key)
        continue
      }
      errors.set(key, 0)
      if (status.intermediate) continue
      pending.delete(key)
      terminal.set(key, status)
      current = await saveState(rt, current, {
        diagnosis: { ...current.diagnosis, [trackId]: fieldDiagnosis(status) },
      })
    }
    if (pending.size > 0) await rt.sleep(SOAP_WAIT_MS)
  }
  return { state: current, terminal }
}

// Sends books again in a period, then reads their SOAP status: a rejection marks the period occupied and takes the
// book out of the results, so the next declaration leaves it out.
const resendBooks = async (
  rt: Runtime,
  state: CertificationState,
  keys: readonly BookKey[],
  period: string,
  submission: 'total' | 'adjustment',
  occupied: Set<string>,
): Promise<CertificationState> => {
  let current = state
  for (const key of keys) current = await sendBook(rt, current, key, period, submission, false)
  const resent = keys.filter((key) => trackIdOf(current, key) !== null)
  if (resent.length === 0) return current
  const poll = await pollBookStates(rt, current, resent, SOAP_RESEND_POLLS, SOAP_RESEND_ERRORS)
  current = poll.state
  for (const [key, status] of poll.terminal) {
    if (!status.rejected) continue
    occupied.add(period)
    current = await saveState(
      rt,
      current,
      withBooks(current, { results: without(current.books.results, key), occupiedPeriods: [...occupied] }),
    )
  }
  return current
}

type BooksDeclaration = {
  readonly state: CertificationState
  /** The declaration stands. */
  readonly success: boolean
  /** Every declared row came back empty: the period is one the SII already holds. */
  readonly allRejected: boolean
  /** The rows the answer names with content errors. */
  readonly contentErrors: readonly string[]
  readonly detail: string | null
}

// Declares every book that has a track id together with the four sets: the portal resets to S01 any row the
// declaration leaves empty. The order of the entries is the order a diagnosis asks for the ones the answer does not name.
const declareBooks = async (rt: Runtime, state: CertificationState): Promise<BooksDeclaration> => {
  const today = rt.now()
  const entries: Record<string, { trackId: string; date: string }> = {}
  for (const key of SET_KEYS) {
    const set = state.sets[key]
    if (set !== undefined) entries[key] = entryOf(set.trackId, today)
  }
  for (const key of DECLARED_ORDER) {
    const trackId = trackIdOf(state, key)
    if (trackId !== null) entries[key] = entryOf(trackId, today)
  }
  if (Object.keys(entries).length === 0)
    return { state, success: false, allRejected: false, contentErrors: [], detail: NO_BOOKS }
  const { result, diagnosis } = await declareWithRetries(rt, entries as DeclarationEntries, {
    label: 'books',
    prefix: 'declaracion-libros',
  })
  const next = await saveState(rt, state, {
    lastDeclaration: { scope: 'books', outcome: result.outcome, detail: result.detail, at: rt.now().toISOString() },
    diagnosis: { ...state.diagnosis, ...diagnosis },
  })
  return {
    state: next,
    success: result.success,
    allRejected: result.allRejected,
    contentErrors: result.contentErrors,
    detail: result.detail,
  }
}

type Wait = {
  readonly state: CertificationState
  readonly ok: boolean
  /** The rows of the last page that could be read. */
  readonly table: Table
  readonly timedOut: boolean
}

const isApproved = (table: Table, key: BookKey): boolean => APPROVED.includes(bookState(table, key) ?? '')

const isRefused = (table: Table, key: BookKey): boolean => {
  const status = bookState(table, key) ?? ''
  return status === CLOSED_BOOK || status === 'LRH' || status.includes('RECHAZADO') || status.includes('ERROR')
}

// The books of a run: the exempt purchase book only when the test set brought one.
const wantedBooks = (state: CertificationState): readonly BookKey[] =>
  BOOK_KEYS.filter((key) => key !== 'exemptPurchaseBook' || state.plan?.exemptPurchaseBook !== undefined)

// A book of the run the portal shows approved is recorded as approved, sent by this run or not.
const markApproved = async (
  rt: Runtime,
  state: CertificationState,
  table: Table,
  verify: readonly BookKey[],
): Promise<CertificationState> => {
  const fresh = wantedBooks(state).filter(
    (key) => verify.includes(key) && isApproved(table, key) && state.books.results[key]?.approved !== true,
  )
  if (fresh.length === 0) return state
  const results = { ...state.books.results }
  for (const key of fresh)
    results[key] = {
      // A state in this phase always has its period.
      ...(results[key] ?? {
        trackId: null,
        date: null,
        sentAt: null,
        period: state.books.period!,
        submission: 'total',
      }),
      approved: true,
    }
  return saveState(rt, state, withBooks(state, { results }))
}

// 40 polls of the portal 15 s apart, sleeping first; a page that cannot be read only uses up its poll. Every book
// approved ends the wait well; a refused book ends it; every second poll the SOAP status of the books still pending is
// asked, because the portal shows S21 forever for an envelope the SII rejected, and a rejection there ends the wait.
const waitForBooksApproval = async (
  rt: Runtime,
  state: CertificationState,
  verify: readonly BookKey[],
): Promise<Wait> => {
  let current = state
  let table: Table = new Map()
  for (let attempt = 1; attempt <= APPROVAL_ATTEMPTS; attempt += 1) {
    await rt.sleep(APPROVAL_INTERVAL_MS)
    rt.emit({ step: 'POLLING', attempt, max: APPROVAL_ATTEMPTS, label: 'books' })
    const read = await readTable(rt)
    if (read === null) continue
    table = read
    current = await markApproved(rt, current, read, verify)
    if (verify.every((key) => isApproved(read, key))) return { state: current, ok: true, table, timedOut: false }
    if (verify.some((key) => isRefused(read, key))) return { state: current, ok: false, table, timedOut: false }
    if (attempt % CROSS_CHECK_EVERY !== 0) continue
    for (const key of verify) {
      const trackId = trackIdOf(current, key)
      if (isApproved(read, key) || trackId === null) continue
      const status = await queryFieldUploadState(rt.sii, trackId).catch(() => null)
      if (status === null || !status.answered || !status.rejected) continue
      current = await saveState(rt, current, {
        diagnosis: { ...current.diagnosis, [trackId]: fieldDiagnosis(status) },
      })
      return { state: current, ok: false, table, timedOut: false }
    }
  }
  return { state: current, ok: false, table, timedOut: true }
}

// The books a finished wait leaves to send again: the rows that name a book, exactly by its name, and stand rejected,
// closed or declared and never reviewed.
const failedBooks = (table: Table): readonly BookKey[] =>
  [...table]
    .filter(
      ([name, status]) =>
        name.toUpperCase().includes('LIBRO') &&
        (status === CLOSED_BOOK || status === 'LRH' || status.includes('RECHAZADO') || status === DECLARED),
    )
    .flatMap(([name]) => bookKeyOf(name) ?? [])

const utcMonth = (at: Date): string => at.toISOString().slice(0, 7)

/**
 * EN: The books phase. The history of books the SII holds (year by year, until two empty years) marks the occupied
 * periods; the period is the UTC month the test set was read in when the set brought a purchase book, else the current
 * UTC month, or the first free month below it, searched anew on every run. A book the portal shows as `REVISADO
 * CONFORME` is skipped; the purchase, sales, guide and (with a plan) exempt purchase books are built, kept as artefacts
 * and uploaded, and a purchase book the SII already holds goes again as an adjustment. Without the three mandatory
 * books sent or skipped the phase ends `incomplete`. Then: the SOAP status of the books is read for a minute; the books
 * are declared together with the four sets; while every declared row comes back empty, at most 24 times, every book
 * goes again, as an adjustment once per period when the totals of the sales or the purchase book are kept, else as a
 * total submission in the next free period. A declaration that stands is followed by the approval wait (40 polls 15 s
 * apart, the SOAP status every second poll) for the books neither rejected by the SOAP status nor named with content
 * errors by the declaration; those, and the books the wait leaves rejected, closed or declared and never reviewed, go
 * again the same way and are declared and awaited again, at most 24 times. No portal read of this phase stops the run.
 * The outcome says how the books stand; the run asks for the next stage with the three mandatory books sent, whatever
 * the outcome.
 * ES: La fase de libros. El historial de libros que tiene el SII (año a año, hasta dos años vacíos) marca los períodos
 * ocupados; el período es el mes UTC en que se leyó el set de pruebas cuando el set trajo un libro de compras, si no el
 * mes UTC actual, o el primer mes libre bajo él, buscado de nuevo en cada corrida. Un libro que el portal muestra como
 * `REVISADO CONFORME` se omite; los libros de compras, ventas, guías y (con plan) compras para exentos se arman, se
 * guardan como artefactos y se suben, y un libro de compras que el SII ya tiene va de nuevo como ajuste. Sin los tres
 * libros obligatorios enviados u omitidos la fase termina `incomplete`. Luego: se lee el estado SOAP de los libros por
 * un minuto; los libros se declaran junto con los cuatro sets; mientras toda fila declarada vuelva vacía, a lo más 24
 * veces, todos los libros van de nuevo, como ajuste una vez por período cuando se guardan los totales del libro de
 * ventas o del de compras, si no como envío total en el siguiente período libre. A una declaración que queda en pie le
 * sigue la espera de aprobación (40 consultas cada 15 s, el estado SOAP cada dos) de los libros que ni el estado SOAP
 * rechazó ni la declaración nombró con errores de contenido; esos, y los que la espera deja rechazados, cerrados o
 * declarados y nunca revisados, van de nuevo del mismo modo y se declaran y se esperan otra vez, a lo más 24 veces.
 * Ninguna lectura del portal de esta fase detiene la corrida. El resultado dice cómo quedaron los libros; la corrida
 * pide la etapa siguiente con los tres libros obligatorios enviados, sea cual sea el resultado.
 * @throws {DteError} EN: `MISSING_FIELD { field: 'plan' }` without a plan; the session and transport codes of the declaration. ES: `MISSING_FIELD { field: 'plan' }` sin plan; los códigos de sesión y de transporte de la declaración.
 */
export const runBooks = async (
  deps: CertificationDependencies,
  state: CertificationState,
): Promise<StepResult<BooksOutcome>> => {
  const rt = runtime(deps)
  const plan = state.plan
  if (plan === undefined) throw new DteError('MISSING_FIELD', { field: 'plan' })
  rt.emit({ step: 'BOOKS_START' })
  const wanted = wantedBooks(state)
  const occupied = new Set<string>()
  const thisYear = Number(chileDate(rt.now()).slice(0, 4))
  let emptyYears = 0
  for (let year = thisYear; year >= HISTORY_FIRST_YEAR && emptyYears < HISTORY_EMPTY_YEARS; year -= 1) {
    try {
      const history = await listBookHistory(rt.portal, { year }, { timeoutMs: HISTORY_TIMEOUT_MS })
      for (const period of history.occupiedPeriods) occupied.add(period)
      emptyYears = history.entries.length === 0 ? emptyYears + 1 : 0
    } catch (error) {
      // A year that cannot be read is skipped; it counts as empty so a failing portal does not take the scan to 1990.
      rt.portal.logger.warn('certification book history failed', { year, reason: errorMessage(error) })
      emptyYears += 1
    }
  }
  // The purchase books are dated with the day the set was read, and the period is taken from that date.
  const dated = [plan.purchaseBook, plan.exemptPurchaseBook].some((book) => (book?.documents.length ?? 0) > 0)
  const base = dated && state.setReadDate !== undefined ? state.setReadDate.slice(0, 7) : utcMonth(rt.now())
  let period = nextFreePeriod(base, occupied)
  // Every run starts over: the books of an earlier run are told by the portal, not by the state.
  let current = await saveState(
    rt,
    state,
    withBooks(state, { period, occupiedPeriods: [...occupied], adjustmentTried: [], results: {} }),
  )
  const initial = (await readTable(rt)) ?? new Map<string, string>()
  const conforming = (key: BookKey): boolean => bookState(initial, key) === CONFORMING
  const outstanding = wanted.filter((key) => !conforming(key))
  for (const key of wanted) {
    if (!conforming(key)) {
      current = await sendBook(rt, current, key, period, 'total', key === 'purchaseBook')
      continue
    }
    rt.emit({ step: 'BOOK_SKIPPED', book: key })
    const skipped: SentBook = { trackId: null, date: null, sentAt: null, period, submission: 'total', approved: true }
    current = await saveState(
      rt,
      current,
      withBooks(current, { results: { ...current.books.results, [key]: skipped } }),
    )
  }
  const missing = MANDATORY_BOOK_KEYS.filter((key) => current.books.results[key] === undefined)
  if (missing.length > 0) {
    rt.emit({ step: 'BOOKS_DONE', books: wanted, success: false })
    return { state: current, outcome: 'incomplete', detail: missing.join(', ') }
  }
  const before = await pollBookStates(
    rt,
    current,
    BOOK_KEYS.filter((key) => trackIdOf(current, key) !== null),
    SOAP_PRECHECK_POLLS,
    SOAP_PRECHECK_ERRORS,
  )
  current = before.state
  rt.emit({ step: 'BOOKS_DECLARING' })
  const declare = async (): Promise<BooksDeclaration> => {
    const declaration = await declareBooks(rt, current)
    current = declaration.state
    return declaration
  }
  // Sends `keys` again: as an adjustment in the same period, once per period, when `adjust` says so; else as a total
  // submission in the next free period, the one in use now counted as occupied.
  const resend = async (
    keys: readonly BookKey[],
    adjust: boolean,
    tried: Set<string>,
    attempt: number,
  ): Promise<void> => {
    if (adjust && !tried.has(period)) {
      rt.emit({ step: 'BOOK_PERIOD_RETRY', period, attempt })
      tried.add(period)
      current = await saveState(
        rt,
        current,
        withBooks(current, { adjustmentTried: [...new Set([...current.books.adjustmentTried, period])] }),
      )
      current = await resendBooks(rt, current, keys, period, 'adjustment', occupied)
      return
    }
    occupied.add(period)
    period = nextFreePeriod(previousPeriod(period), occupied)
    rt.emit({ step: 'BOOK_PERIOD_RETRY', period, attempt })
    current = await saveState(rt, current, withBooks(current, { period, occupiedPeriods: [...occupied] }))
    current = await resendBooks(rt, current, keys, period, 'total', occupied)
  }
  let declaration = await declare()
  const triedEmpty = new Set<string>()
  for (let retry = 1; retry <= MAX_PERIOD_RETRIES && declaration.allRejected; retry += 1) {
    const totals = current.books.accumulated[period]
    await resend(outstanding, totals?.purchase !== undefined || totals?.sale !== undefined, triedEmpty, retry)
    declaration = await declare()
  }
  let wait: Wait | null = null
  if (declaration.success) {
    const refusedBySoap = [...before.terminal].filter(([, status]) => status.rejected).map(([key]) => key)
    const excluded = new Set<string>([...refusedBySoap, ...declaration.contentErrors])
    const awaited = DECLARED_ORDER.filter((key) => outstanding.includes(key) && !excluded.has(key))
    wait =
      awaited.length > 0
        ? await waitForBooksApproval(rt, current, awaited)
        : { state: current, ok: false, table: new Map(), timedOut: false }
    current = wait.state
    // The books left out of the wait stand as closed ones: the SOAP status rejected them, or the declaration named
    // them, and the portal would show them declared forever.
    const closed = new Map(wait.table)
    for (const key of refusedBySoap) closed.set(BOOK_NAMES[key], CLOSED_BOOK)
    // In the order the declaration names them, which is the order a book the page does not list is awaited in.
    for (const key of declaration.contentErrors.flatMap((named) => BOOK_KEYS.filter((book) => book === named)))
      if ((closed.get(BOOK_NAMES[key]) ?? '') === '') closed.set(BOOK_NAMES[key], CLOSED_BOOK)
    wait = { ...wait, ok: wait.ok && excluded.size === 0, table: closed }
    const triedFailed = new Set<string>()
    for (let retry = 1; !wait.ok && retry <= MAX_PERIOD_RETRIES; retry += 1) {
      // Every failed book of the page keeps the search going and is awaited, in the order of the page; only the ones
      // this run sends go again, in the order they are sent.
      const failed = failedBooks(wait.table)
      if (failed.length === 0) break
      const kept = failed.some((key) => keptTotals(current, period, key) !== undefined)
      await resend(
        BOOK_KEYS.filter((key) => failed.includes(key) && outstanding.includes(key)),
        kept,
        triedFailed,
        retry,
      )
      declaration = await declare()
      if (!declaration.success) {
        // A declaration that does not stand ends the search, unless every row came back empty, an adjustment was
        // tried (the next round moves to a free period) or no book was left to declare.
        if (declaration.allRejected || triedFailed.size > 0 || declaration.detail === NO_BOOKS) continue
        break
      }
      wait = await waitForBooksApproval(rt, current, failed)
      current = wait.state
    }
  }
  rt.emit({ step: 'BOOKS_DONE', books: wanted, success: true })
  if (wanted.every((key) => current.books.results[key]?.approved === true))
    return { state: current, outcome: 'approved' }
  // A declaration that does not stand always says why.
  if (!declaration.success || wait === null) return { state: current, outcome: 'rejected', detail: declaration.detail! }
  const pending = wanted.filter((key) => current.books.results[key]?.approved !== true)
  return { state: current, outcome: wait.timedOut ? 'timedOut' : 'rejected', detail: pending.join(', ') }
}
