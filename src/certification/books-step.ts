import {
  BOOK_ARTEFACT_NAMES,
  BOOK_FILE_NAMES,
  BOOK_KEYS,
  MANDATORY_BOOK_KEYS,
  SET_KEYS,
  TEST_SET_PORTAL_NAMES,
  type BookKey,
} from '../catalogs/certification'
import { DteError, errorMessage } from '../errors'
import type { BookTotals } from '../model/book'
import {
  listBookHistory,
  queryCertificationSets,
  type DeclarationEntries,
  type DeclarationOutcome,
} from '../portal/certification'
import type { CertificationSet } from '../portal/pages/certification'
import { queryUploadStatus } from '../sii/status'
import { uploadBook } from '../sii/upload'
import { chileDate } from '../time/chile'
import {
  createCertificationGuideBook,
  createCertificationPurchaseBook,
  createCertificationSalesBook,
  type CertificationBookInput,
} from './books'
import type { BooksState, CertificationState, EnvelopeDiagnosis, SentBook } from './state'
import {
  declareWithRetries,
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
const SOAP_RESEND_POLLS = 20
const SOAP_MAX_ERRORS = 10
const APPROVAL_ATTEMPTS = 40
const APPROVAL_INTERVAL_MS = 15000
const CROSS_CHECK_EVERY = 2
// A purchase book the SII already holds for the period: "duplicado", or the schema error it answers instead.
const DUPLICATE = /duplicado|cvc-/i
const APPROVED = /REVISADO CONFORME|S25/
const REJECTED = /LNC|LRH|RECHAZADO|ERROR/
const CLOSED_BOOK = 'LNC'
const ADJUSTABLE: readonly BookKey[] = ['purchaseBook', 'salesBook']

/**
 * EN: How the books phase ended: every wanted book approved; a mandatory book never sent; a declaration or a book the
 * SII refused; the approval wait exhausted.
 * ES: Cómo terminó la fase de libros: todos los libros pedidos aprobados; un libro obligatorio nunca enviado; una
 * declaración o un libro que el SII rechazó; la espera de aprobación agotada.
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

const monthOf = (date: string): string => date.slice(0, 7)

const rowOf = (rows: readonly CertificationSet[], key: BookKey): CertificationSet | undefined => {
  const name = TEST_SET_PORTAL_NAMES[key]
  return rows.find((row) => row.name.toUpperCase().trim() === name)
}

const withBooks = (state: CertificationState, patch: Partial<BooksState>): Partial<CertificationState> => ({
  books: { ...state.books, ...patch },
})

const sentKeys = (state: CertificationState, wanted: readonly BookKey[]): readonly BookKey[] =>
  wanted.filter((key) => {
    const result = state.books.results[key]
    return result !== undefined && result.trackId !== null && result.approved !== true
  })

const operationOf = (key: BookKey): 'purchase' | 'sale' => (key === 'salesBook' ? 'sale' : 'purchase')

const buildBook = (
  rt: Runtime,
  state: CertificationState,
  key: BookKey,
  period: string,
  submission: 'total' | 'adjustment',
): { readonly xml: string; readonly periodTotals: readonly BookTotals[] | null } => {
  const previous = state.books.accumulated[period]?.[operationOf(key)]
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

const isDuplicate = (error: unknown): boolean =>
  error instanceof DteError && (DUPLICATE.test(error.message) || DUPLICATE.test(JSON.stringify(error.details)))

// Builds, keeps, uploads and records one book. A purchase book the SII already holds for the period goes again as an
// adjustment. A book that cannot be built or that the SII refuses is reported and left out of the results.
const sendBook = async (
  rt: Runtime,
  state: CertificationState,
  key: BookKey,
  period: string,
  submission: 'total' | 'adjustment',
): Promise<CertificationState> => {
  rt.emit({ step: 'BOOK_SENDING', book: key })
  let built: ReturnType<typeof buildBook>
  try {
    built = buildBook(rt, state, key, period, submission)
  } catch (error) {
    rt.emit({ step: 'BOOK_ERROR', book: key, error: errorMessage(error) })
    return state
  }
  await rt.store.writeArtefact(BOOK_ARTEFACT_NAMES[key], built.xml)
  try {
    const receipt = await uploadBook(rt.sii, { xml: built.xml, fileName: BOOK_FILE_NAMES[key] })
    const sent: SentBook = {
      trackId: receipt.trackId,
      date: chileDate(rt.now()),
      sentAt: rt.now().toISOString(),
      period,
      submission,
    }
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
    rt.emit({ step: 'BOOK_OK', book: key, trackId: receipt.trackId })
    return next
  } catch (error) {
    if (key === 'purchaseBook' && submission === 'total' && isDuplicate(error))
      return sendBook(rt, state, key, period, 'adjustment')
    rt.emit({ step: 'BOOK_ERROR', book: key, error: errorMessage(error) })
    const { [key]: dropped, ...rest } = state.books.results
    void dropped
    return saveState(rt, state, withBooks(state, { results: rest }))
  }
}

// The SOAP status of the sent books: a wait, then polls 15 s apart. A terminal answer is kept as a diagnosis; with
// `drop`, a rejection takes the book out of the results and, when it is a closed book, marks the period occupied. The
// SII leaves books in LSO far longer than worth waiting, so nothing here blocks the declaration.
const soapCheck = async (
  rt: Runtime,
  state: CertificationState,
  keys: readonly BookKey[],
  polls: number,
  drop: boolean,
): Promise<CertificationState> => {
  let current = state
  const terminal = new Map<BookKey, EnvelopeDiagnosis>()
  let errors = 0
  await rt.sleep(SOAP_WAIT_MS)
  for (let poll = 1; poll <= polls && errors < SOAP_MAX_ERRORS; poll += 1) {
    for (const key of keys) {
      if (terminal.has(key) || errors >= SOAP_MAX_ERRORS) continue
      // Only sent books reach here, so each has a track id.
      const trackId = current.books.results[key]!.trackId!
      try {
        const status = await queryUploadStatus(rt.sii, { trackId })
        errors = 0
        if (status.status === 'pending' || status.status === 'queryError') continue
        terminal.set(key, { code: status.code, status: status.status, message: status.message })
      } catch (error) {
        errors += 1
        rt.portal.logger.warn('certification book status failed', { book: key, reason: errorMessage(error) })
      }
    }
    if (keys.every((key) => terminal.has(key))) break
    if (poll < polls) await rt.sleep(SOAP_WAIT_MS)
  }
  for (const [key, diagnosis] of terminal) {
    const result = current.books.results[key]!
    const rejected = drop && diagnosis.status === 'rejected'
    const { [key]: dropped, ...rest } = current.books.results
    void dropped
    current = await saveState(rt, current, {
      diagnosis: { ...current.diagnosis, [result.trackId!]: diagnosis },
      ...withBooks(current, {
        results: rejected ? rest : current.books.results,
        occupiedPeriods:
          rejected && diagnosis.code === CLOSED_BOOK && !current.books.occupiedPeriods.includes(result.period)
            ? [...current.books.occupiedPeriods, result.period]
            : current.books.occupiedPeriods,
      }),
    })
  }
  return current
}

const declareBooks = async (
  rt: Runtime,
  state: CertificationState,
  wanted: readonly BookKey[],
): Promise<{
  readonly state: CertificationState
  readonly outcome: DeclarationOutcome
  readonly detail: string | null
}> => {
  const entries: Record<string, { trackId: string; date: string }> = {}
  for (const key of sentKeys(state, wanted)) {
    const result = state.books.results[key]!
    entries[key] = { trackId: result.trackId!, date: result.date! }
  }
  if (Object.keys(entries).length === 0) return { state, outcome: 'declined', detail: 'noBooks' }
  // The four sets go with the books: the portal resets to S01 any row the declaration leaves empty.
  for (const key of SET_KEYS) {
    const set = state.sets[key]
    if (set !== undefined) entries[key] = { trackId: set.trackId, date: set.date }
  }
  rt.emit({ step: 'BOOKS_DECLARING' })
  const { result, diagnosis } = await declareWithRetries(rt, entries as DeclarationEntries, {
    label: 'books',
    prefix: 'declaracion-libros',
  })
  const next = await saveState(rt, state, {
    lastDeclaration: { scope: 'books', outcome: result.outcome, detail: result.detail, at: rt.now().toISOString() },
    diagnosis: { ...state.diagnosis, ...diagnosis },
  })
  return { state: next, outcome: result.outcome, detail: result.detail }
}

const isGood = (outcome: DeclarationOutcome): boolean => outcome === 'accepted' || outcome === 'inReview'

type Wait = {
  readonly state: CertificationState
  readonly approved: boolean
  readonly failed: readonly BookKey[]
  readonly timedOut: boolean
}

// 40 polls of the portal 15 s apart, sleeping first; every second poll the SOAP status of the pending books, because
// the portal shows S21 forever for a closed book. A rejection ends the wait; the books still pending after the last
// poll count as rejected uploads.
const waitForBooksApproval = async (
  rt: Runtime,
  state: CertificationState,
  wanted: readonly BookKey[],
): Promise<Wait> => {
  let current = state
  const pending = new Set(wanted.filter((key) => current.books.results[key]?.approved !== true))
  const failed: BookKey[] = []
  for (let attempt = 1; attempt <= APPROVAL_ATTEMPTS; attempt += 1) {
    await rt.sleep(APPROVAL_INTERVAL_MS)
    rt.emit({ step: 'POLLING', attempt, max: APPROVAL_ATTEMPTS, label: 'books' })
    const rows = (await queryCertificationSets(rt.portal)).sets
    for (const key of [...pending]) {
      const status = rowOf(rows, key)?.status ?? ''
      if (APPROVED.test(status)) {
        pending.delete(key)
        current = await saveState(
          rt,
          current,
          withBooks(current, {
            results: { ...current.books.results, [key]: { ...current.books.results[key]!, approved: true } },
          }),
        )
      } else if (REJECTED.test(status)) {
        pending.delete(key)
        failed.push(key)
      }
    }
    if (attempt % CROSS_CHECK_EVERY === 0)
      for (const key of [...pending]) {
        const trackId = current.books.results[key]?.trackId
        if (trackId === undefined || trackId === null) continue
        const status = await queryUploadStatus(rt.sii, { trackId }).catch(() => null)
        if (status?.status === 'rejected') {
          pending.delete(key)
          failed.push(key)
          current = await saveState(rt, current, {
            diagnosis: {
              ...current.diagnosis,
              [trackId]: { code: status.code, status: status.status, message: status.message },
            },
          })
        }
      }
    if (failed.length > 0) return { state: current, approved: false, failed, timedOut: false }
    if (pending.size === 0) return { state: current, approved: true, failed: [], timedOut: false }
  }
  return { state: current, approved: false, failed: [...pending], timedOut: true }
}

// Resends books in the period they failed as adjustments (the sales and purchase books, once per period, when their
// totals are kept) or in the next free period as total submissions; then the SOAP status, which may close a period.
const resendBooks = async (
  rt: Runtime,
  state: CertificationState,
  keys: readonly BookKey[],
  attempt: number,
): Promise<CertificationState> => {
  const period = state.books.period!
  const totals = state.books.accumulated[period]
  const adjust =
    totals !== undefined &&
    (totals.purchase !== undefined || totals.sale !== undefined) &&
    !state.books.adjustmentTried.includes(period)
  let current = state
  if (adjust) {
    rt.emit({ step: 'BOOK_PERIOD_RETRY', period, attempt })
    current = await saveState(
      rt,
      current,
      withBooks(current, { adjustmentTried: [...current.books.adjustmentTried, period] }),
    )
    for (const key of keys)
      current = await sendBook(rt, current, key, period, ADJUSTABLE.includes(key) ? 'adjustment' : 'total')
  } else {
    const occupied = new Set([...current.books.occupiedPeriods, period])
    const next = nextFreePeriod(previousPeriod(period), occupied)
    rt.emit({ step: 'BOOK_PERIOD_RETRY', period: next, attempt })
    current = await saveState(rt, current, withBooks(current, { period: next, occupiedPeriods: [...occupied] }))
    for (const key of keys) current = await sendBook(rt, current, key, next, 'total')
  }
  return soapCheck(rt, current, sentKeys(current, keys), SOAP_RESEND_POLLS, true)
}

/**
 * EN: The books phase, as the field runs it. The history of books the SII holds (year by year, until two empty
 * years) marks the occupied periods; the period is the month the sets were issued in, or the first free month below
 * it. A book the portal already shows approved is skipped. The purchase, sales, guide and (with a plan) exempt
 * purchase books are built from the plan and the sent sets, kept as artefacts and uploaded; a purchase book the SII
 * already holds goes again as an adjustment. With the three mandatory books sent or skipped: the SOAP status is read
 * for 45 s without blocking anything, the books are declared together with the four sets, and while every row comes
 * back empty (the wrong period) the books are resent, as adjustments with the totals kept or in the next free
 * period, at most 24 times. Then the approval wait: 40 polls 15 s apart with the SOAP status every second poll; the
 * books the SII refuses are resent the same way, at most 24 times. The result says whether every wanted book is
 * approved; each book's approval is in the state.
 * ES: La fase de libros, como la corre el campo. El historial de libros que tiene el SII (año a año, hasta dos años
 * vacíos) marca los períodos ocupados; el período es el mes en que se emitieron los sets, o el primer mes libre bajo
 * él. Un libro que el portal ya muestra aprobado se omite. Los libros de compras, ventas, guías y (con plan) compras
 * para exentos se arman desde el plan y los sets enviados, se guardan como artefactos y se suben; un libro de compras
 * que el SII ya tiene va de nuevo como ajuste. Con los tres libros obligatorios enviados u omitidos: se lee el estado
 * SOAP por 45 s sin bloquear nada, los libros se declaran junto con los cuatro sets, y mientras toda fila vuelva vacía
 * (el período equivocado) los libros se reenvían, como ajuste con los totales guardados o en el siguiente período
 * libre, a lo más 24 veces. Luego la espera de aprobación: 40 consultas cada 15 s con el estado SOAP cada dos; los
 * libros que el SII rechaza se reenvían del mismo modo, a lo más 24 veces. El resultado dice si todo libro pedido está
 * aprobado; la aprobación de cada libro queda en el estado.
 * @throws {DteError} EN: `MISSING_FIELD { field: 'plan' }` without a plan; the portal and upload codes that are not a book's refusal. ES: `MISSING_FIELD { field: 'plan' }` sin plan; los códigos del portal y de envío que no sean el rechazo de un libro.
 */
export const runBooks = async (
  deps: CertificationDependencies,
  state: CertificationState,
): Promise<StepResult<BooksOutcome>> => {
  const rt = runtime(deps)
  if (state.plan === undefined) throw new DteError('MISSING_FIELD', { field: 'plan' })
  rt.emit({ step: 'BOOKS_START' })
  const wanted = BOOK_KEYS.filter((key) => key !== 'exemptPurchaseBook' || state.plan?.exemptPurchaseBook !== undefined)
  const occupied = new Set(state.books.occupiedPeriods)
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
  const base = state.books.period ?? monthOf(state.sets.basic?.date ?? chileDate(rt.now()))
  const period = nextFreePeriod(base, occupied)
  let current = await saveState(rt, state, withBooks(state, { period, occupiedPeriods: [...occupied] }))
  const rows = (await queryCertificationSets(rt.portal)).sets
  for (const key of wanted) {
    if (!(rowOf(rows, key)?.status.includes('REVISADO CONFORME') ?? false)) continue
    rt.emit({ step: 'BOOK_SKIPPED', book: key })
    const kept = current.books.results[key] ?? {
      trackId: null,
      date: null,
      sentAt: null,
      period,
      submission: 'total' as const,
    }
    current = await saveState(
      rt,
      current,
      withBooks(current, { results: { ...current.books.results, [key]: { ...kept, approved: true } } }),
    )
  }
  for (const key of wanted) {
    if (current.books.results[key]?.approved === true) continue
    current = await sendBook(rt, current, key, period, 'total')
  }
  const covered = (key: BookKey): boolean => {
    const result = current.books.results[key]
    return result !== undefined && (result.approved === true || result.trackId !== null)
  }
  if (!MANDATORY_BOOK_KEYS.every(covered)) {
    rt.emit({ step: 'BOOKS_DONE', books: wanted, success: false })
    return {
      state: current,
      outcome: 'incomplete',
      detail: MANDATORY_BOOK_KEYS.filter((key) => !covered(key)).join(', '),
    }
  }
  if (wanted.every((key) => current.books.results[key]?.approved === true)) {
    rt.emit({ step: 'BOOKS_DONE', books: wanted, success: true })
    return { state: current, outcome: 'approved' }
  }
  current = await soapCheck(rt, current, sentKeys(current, wanted), SOAP_PRECHECK_POLLS, false)
  let declaration = await declareBooks(rt, current, wanted)
  current = declaration.state
  for (let retry = 1; declaration.outcome === 'allRejected' && retry <= MAX_PERIOD_RETRIES; retry += 1) {
    current = await resendBooks(
      rt,
      current,
      wanted.filter((key) => current.books.results[key]?.approved !== true),
      retry,
    )
    declaration = await declareBooks(rt, current, wanted)
    current = declaration.state
  }
  if (!isGood(declaration.outcome)) {
    rt.emit({ step: 'BOOKS_DONE', books: wanted, success: false })
    return { state: current, outcome: 'rejected', detail: declaration.detail ?? declaration.outcome }
  }
  let wait = await waitForBooksApproval(rt, current, wanted)
  current = wait.state
  for (let retry = 1; !wait.approved && wait.failed.length > 0 && retry <= MAX_PERIOD_RETRIES; retry += 1) {
    current = await resendBooks(rt, current, wait.failed, retry)
    declaration = await declareBooks(rt, current, wanted)
    current = declaration.state
    if (!isGood(declaration.outcome)) break
    wait = await waitForBooksApproval(rt, current, wanted)
    current = wait.state
  }
  const approved = wanted.every((key) => current.books.results[key]?.approved === true)
  rt.emit({ step: 'BOOKS_DONE', books: wanted, success: approved })
  if (approved) return { state: current, outcome: 'approved' }
  // Not approved means the last wait named the books it gave up on.
  return { state: current, outcome: wait.timedOut ? 'timedOut' : 'rejected', detail: wait.failed.join(', ') }
}
