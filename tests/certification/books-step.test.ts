import { nextFreePeriod, previousPeriod, runBooks } from '../../src/certification/books-step'
import type { CertificationState, SentCase } from '../../src/certification/state'
import { DteError } from '../../src/errors'
import { fullPlan } from '../support/certification-fixtures'
import {
  certificationHarness,
  estUp,
  get,
  MAULLIN,
  post,
  reception,
  repeat,
  sequence,
  stateWith,
  TODAY,
  UPL,
  UPLOAD,
} from '../support/certification-harness'
import {
  bookHistoryPage,
  DECLARATION_ANSWERS,
  declarationFormPage,
  type DeclarationRowSpec,
} from '../support/certification-pages'
import type { FakeReply, FakeRoute, RecordedRequest } from '../support/fake-sii'
import { failure } from '../support/portal'
import { page } from '../support/portal-pages'
import { siiFixture } from '../support/sii-client'

const plan = fullPlan()
const totals = (net: number) => ({
  netAmount: net,
  vatAmount: Math.round(net * 0.19),
  totalAmount: net + Math.round(net * 0.19),
})
const basicCases: SentCase[] = [
  { caseId: 'c-1', type: 33, folio: 1, issueDate: TODAY, totals: totals(1000) },
  { caseId: 'c-2', type: 61, folio: 1, issueDate: TODAY, totals: totals(500) },
]
const guideCases: SentCase[] = [1, 2, 3].map((folio) => ({
  caseId: `g-${folio}`,
  type: 52,
  folio,
  issueDate: TODAY,
  transferType: 1,
  totals: totals(100),
}))
const sets = {
  basic: { trackId: '11', date: TODAY, sentAt: 'x', cases: basicCases },
  guide: { trackId: '12', date: TODAY, sentAt: 'x', cases: guideCases },
}
const BOOK_LABELS = {
  purchaseBook: 'LIBRO DE COMPRAS',
  salesBook: 'LIBRO DE VENTAS',
  guideBook: 'LIBRO DE GUIAS',
  exemptPurchaseBook: 'LIBRO DE COMPRAS PARA EXENTOS',
} as const
type BookLabel = keyof typeof BOOK_LABELS

/** The pe_avance2 rows as `queryCertificationSets` reads them: a bold state, or a hidden `S01`. */
const rowsPage = (states: Partial<Record<BookLabel, string>> = {}): string =>
  page(
    `<table><tr><td><font>SET BASICO</font></td><td><b>REVISADO CONFORME</b></td></tr><tr><td><font>SET GUIA DE DESPACHO</font></td><td><b>REVISADO CONFORME</b></td></tr>${(
      Object.keys(BOOK_LABELS) as BookLabel[]
    )
      .map((key, index) => {
        const state = states[key]
        return `<tr><td><font>${BOOK_LABELS[key]}</font></td><td>${state === undefined ? `<input type=hidden name="EST${index + 5}" value="S01">` : `<b>${state}</b>`}</td></tr>`
      })
      .join('')}</table>`,
  )
/** The pe_avance2 declaration form: approved sets without an input, the books with one (values when given). */
const booksForm = (values: Partial<Record<BookLabel, string>> = {}): string =>
  declarationFormPage([
    { label: 'SET BASICO', state: 'REVISADO CONFORME' },
    { label: 'SET GUIA DE DESPACHO', state: 'REVISADO CONFORME' },
    ...(Object.keys(BOOK_LABELS) as BookLabel[]).map(
      (key, index): DeclarationRowSpec => ({ label: BOOK_LABELS[key], index: index + 1, value: values[key] ?? '' }),
    ),
  ])
const ALL_APPROVED = rowsPage({
  purchaseBook: 'REVISADO CONFORME',
  salesBook: 'REVISADO CONFORME',
  guideBook: 'REVISADO CONFORME',
  exemptPurchaseBook: 'REVISADO CONFORME',
})
const KEPT = booksForm({ purchaseBook: '101', salesBook: '102', guideBook: '103', exemptPurchaseBook: '104' })

const history = (...pages: readonly (string | FakeReply)[]): FakeRoute[] => [
  { url: `${UPL}/DTEauth?7`, reply: repeat({ body: page('auth') }, 10) },
  { url: `${UPL}/QEstLibro*`, reply: pages.map((reply) => (typeof reply === 'string' ? { body: reply } : reply)) },
]
const EMPTY_HISTORY = history(bookHistoryPage([]), bookHistoryPage([]))
const entry = get('pe_avance1', ...repeat(page('entry'), 400))
const avance2 = (pages: readonly string[], fallback: (call: number) => string = () => ALL_APPROVED): FakeRoute => ({
  url: `${MAULLIN}/pe_avance2`,
  method: 'POST',
  reply: sequence(pages, fallback),
})
const uploads = (...replies: readonly FakeReply[]): FakeRoute => ({ url: UPLOAD, method: 'POST', reply: [...replies] })
const fourReceipts = () => uploads(reception('101'), reception('102'), reception('103'), reception('104'))
const EST_UP_URL = 'https://maullin.sii.cl/DTEWS/QueryEstUp.jws'
const estUpAlways = (code: string): FakeRoute => ({ url: EST_UP_URL, method: 'POST', reply: () => estUp(code) })
/** The SOAP status by track id: the codes given, `EPR` for the rest. */
const estUpBy = (codes: Readonly<Record<string, string>>): FakeRoute => ({
  url: EST_UP_URL,
  method: 'POST',
  reply: (request: RecordedRequest) => estUp(codes[/<TrackId>(\d+)/.exec(request.text)![1]] ?? 'EPR'),
})
const retries = (harness: { readonly events: readonly { readonly step: string }[] }) =>
  harness.events.filter((event) => event.step === 'BOOK_PERIOD_RETRY')
const polls = (harness: { readonly steps: () => readonly string[] }): number =>
  harness.steps().filter((step) => step === 'POLLING').length
const sentBooks = (harness: { readonly fake: { readonly requests: readonly RecordedRequest[] } }) =>
  harness.fake.requests.filter((request) => request.url === UPLOAD)
const CVC_REFUSAL: FakeReply = {
  body: siiFixture('reception-schema-error.xml').replace('<ERROR>SCH-00001: Error de Esquema</ERROR>\n', ''),
}
const SCHEMA_REFUSAL: FakeReply = { body: siiFixture('reception-schema-error.xml') }
const DUPLICATE_WITHOUT_TRACK_ID: FakeReply = {
  body: siiFixture('reception-duplicate-7.xml').replace('<TRACKID>9876543210</TRACKID>\n', ''),
}
const DONE_EVENT = (success: boolean) => ({
  step: 'BOOKS_DONE',
  books: ['purchaseBook', 'salesBook', 'guideBook', 'exemptPurchaseBook'],
  success,
})
const uploadedXml = (request: RecordedRequest): string =>
  request.parts.find((part) => part.fileName !== null)?.value ?? ''
const booksState = (patch: Partial<CertificationState> = {}): CertificationState => stateWith({ plan, sets, ...patch })

test('periods: the month before, and the first free month below an occupied one', () => {
  expect(previousPeriod('2026-01')).toBe('2025-12')
  expect(previousPeriod('2026-11')).toBe('2026-10')
  expect(nextFreePeriod('2026-11', new Set(['2026-11', '2026-10']))).toBe('2026-09')
  expect(nextFreePeriod('2026-11', new Set())).toBe('2026-11')
  const everything = new Set(
    Array.from({ length: 500 }, (_, i) => {
      let p = '2026-11'
      for (let k = 0; k < i; k += 1) p = previousPeriod(p)
      return p
    }),
  )
  expect(nextFreePeriod('2026-11', everything)).toBe('1993-07')
})

test('the happy path: history, period, four books sent and kept, the SOAP look, one declaration with the sets, approval', async () => {
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage(), booksForm(), KEPT, ALL_APPROVED]),
    post('pe_avance3', DECLARATION_ANSWERS.success),
    fourReceipts(),
    estUpAlways('LSO'),
  ])
  const result = await runBooks(harness.deps, booksState())
  expect(result.outcome).toBe('approved')
  const books = result.state.books
  expect(books.period).toBe('2026-11')
  expect(
    Object.fromEntries(
      Object.entries(books.results).map(([key, book]) => [
        key,
        [book.trackId, book.period, book.submission, book.approved],
      ]),
    ),
  ).toEqual({
    purchaseBook: ['101', '2026-11', 'total', true],
    salesBook: ['102', '2026-11', 'total', true],
    guideBook: ['103', '2026-11', 'total', true],
    exemptPurchaseBook: ['104', '2026-11', 'total', true],
  })
  expect(books.accumulated['2026-11'].purchase?.length).toBeGreaterThan(0)
  expect(books.accumulated['2026-11'].sale?.map((row) => row.type)).toEqual([33, 61])
  expect(await harness.store.listArtefacts()).toEqual([
    'declaracion-libros-1.html',
    'declaracion-libros-pe_avance2-1.html',
    'libro-compras-exentos.xml',
    'libro-compras.xml',
    'libro-guias.xml',
    'libro-ventas.xml',
  ])
  const sent = sentBooks(harness)
  expect(sent.map((request) => request.parts.find((part) => part.fileName !== null)?.fileName)).toEqual([
    'LibroCV.xml',
    'LibroCV.xml',
    'LibroGuia.xml',
    'LibroCVExentos.xml',
  ])
  expect(uploadedXml(sent[1])).toContain('<TipoOperacion>VENTA')
  expect(harness.posted('pe_avance3')[0]).toMatchObject({
    NUM_ENV1: '101',
    NUM_ENV2: '102',
    NUM_ENV3: '103',
    NUM_ENV4: '104',
  })
  // The SOAP look: 15 s, then three rounds with a book still in process, 15 s after each, the last one too.
  expect(harness.sleeps).toEqual([15000, 15000, 15000, 15000, 10000, 15000])
  expect(harness.steps()).toEqual([
    'BOOKS_START',
    'BOOK_SENDING',
    'BOOK_OK',
    'BOOK_SENDING',
    'BOOK_OK',
    'BOOK_SENDING',
    'BOOK_OK',
    'BOOK_SENDING',
    'BOOK_OK',
    'BOOKS_DECLARING',
    'POLLING',
    'POLLING',
    'BOOKS_DONE',
  ])
  expect(harness.events[harness.events.length - 1]).toEqual(DONE_EVENT(true))
  expect(
    harness
      .urls()
      .filter((url) => url.includes('QEstLibro'))
      .map((url) => /year=(\d+)/.exec(url)![1]),
  ).toEqual(['2026', '2025'])
})

test('a book the portal shows approved is skipped; without an exempt plan there are three books; with every book approved nothing is sent', async () => {
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage({ salesBook: 'REVISADO CONFORME' }), booksForm(), KEPT]),
    post('pe_avance3', DECLARATION_ANSWERS.success),
    uploads(reception('101'), reception('103')),
    estUpAlways('EPR'),
  ])
  const { exemptPurchaseBook, ...rest } = plan
  void exemptPurchaseBook
  const result = await runBooks(harness.deps, booksState({ plan: rest }))
  expect(result.outcome).toBe('approved')
  expect(Object.keys(result.state.books.results).sort()).toEqual(['guideBook', 'purchaseBook', 'salesBook'])
  expect(result.state.books.results.salesBook).toEqual({
    trackId: null,
    date: null,
    sentAt: null,
    period: '2026-11',
    submission: 'total',
    approved: true,
  })
  expect(harness.steps().filter((step) => step === 'BOOK_SKIPPED')).toHaveLength(1)
  expect(harness.sleeps).toEqual([15000, 10000, 15000])
  const done = await certificationHarness([
    ...history(
      bookHistoryPage([['2026-11', 'COMPRA', 'Recibido', 'LIBRO', 'MENSUAL', 'a']]),
      new Error('socket hang up'),
      bookHistoryPage([]),
      bookHistoryPage([]),
    ),
    entry,
    avance2([ALL_APPROVED]),
  ])
  // A state that still carries the books of an earlier run: the portal tells what stands, not the state.
  const earlier = booksState()
  const finished = await runBooks(
    done.deps,
    booksState({
      books: {
        ...earlier.books,
        period: '2026-05',
        occupiedPeriods: ['2026-05'],
        adjustmentTried: ['2026-05'],
        results: { guideBook: { trackId: '7', date: TODAY, sentAt: 'x', period: '2026-05', submission: 'total' } },
      },
    }),
  )
  expect(finished).toMatchObject({ outcome: 'approved' })
  expect(finished.state.books).toMatchObject({ period: '2026-10', occupiedPeriods: ['2026-11'], adjustmentTried: [] })
  expect(finished.state.books.results.guideBook).toMatchObject({ trackId: null, approved: true })
  expect(sentBooks(done)).toEqual([])
  // Nothing has a track id but the sets, and they are declared again; the page that answers is no form.
  expect(finished.state.lastDeclaration).toMatchObject({ scope: 'books', outcome: 'declined' })
  expect(done.sleeps).toEqual([15000, 10000])
  expect(
    done
      .urls()
      .filter((url) => url.includes('QEstLibro'))
      .map((url) => /year=(\d+)/.exec(url)![1]),
  ).toEqual(['2026', '2025', '2024'])
  expect(done.warnings()).toContain('certification book history failed')
})

test('a book that cannot be built or that the SII refuses leaves the phase incomplete', async () => {
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage()]),
    uploads(reception('102'), reception('104')),
  ])
  const { guide, ...basicOnly } = sets
  void guide
  const { purchaseBook, ...noPurchasePlan } = plan
  void purchaseBook
  const result = await runBooks(
    harness.deps,
    booksState({ sets: basicOnly, plan: noPurchasePlan, setReadDate: '2026-09-30' }),
  )
  expect(result).toMatchObject({ outcome: 'incomplete', detail: 'purchaseBook, guideBook' })
  expect(harness.steps().filter((step) => step === 'BOOK_ERROR')).toHaveLength(2)
  expect(result.state.books.results.purchaseBook).toBeUndefined()
  // The exempt purchase book of the set dates the period.
  expect(result.state.books.period).toBe('2026-09')
  expect(harness.events[harness.events.length - 1]).toEqual(DONE_EVENT(false))
  const refused = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage()]),
    uploads(reception('101'), reception('104')),
  ])
  const noSets = await runBooks(refused.deps, booksState({ sets: {} }))
  expect(noSets).toMatchObject({ outcome: 'incomplete', detail: 'salesBook, guideBook' })
  expect(noSets.state.books.period).toBe('2026-11')
  // A set that brought no purchase book dates nothing: the current UTC month.
  const { exemptPurchaseBook, ...noBooksPlan } = noPurchasePlan
  void exemptPurchaseBook
  const undated = await certificationHarness([...EMPTY_HISTORY, entry, avance2([rowsPage()]), fourReceipts()])
  const fallback = await runBooks(undated.deps, booksState({ plan: noBooksPlan, setReadDate: '2026-09-30' }))
  expect(fallback).toMatchObject({ outcome: 'incomplete', detail: 'purchaseBook' })
  expect(fallback.state.books.period).toBe('2026-11')
})

test('a purchase book the SII already holds goes again as an adjustment, once', async () => {
  for (const held of [CVC_REFUSAL, DUPLICATE_WITHOUT_TRACK_ID]) {
    const harness = await certificationHarness([
      ...EMPTY_HISTORY,
      entry,
      avance2([rowsPage(), booksForm(), KEPT]),
      post('pe_avance3', DECLARATION_ANSWERS.success),
      uploads(held, ...[101, 102, 103, 104].map((id) => reception(String(id)))),
      estUpAlways('EPR'),
    ])
    const result = await runBooks(harness.deps, booksState())
    expect(result.outcome).toBe('approved')
    expect(result.state.books.results.purchaseBook).toMatchObject({ trackId: '101', submission: 'adjustment' })
    const sent = sentBooks(harness)
    expect(sent).toHaveLength(5)
    expect(uploadedXml(sent[0])).toContain('<TipoEnvio>TOTAL')
    expect(uploadedXml(sent[1])).toContain('<TipoEnvio>AJUSTE')
    expect(result.state.books.accumulated['2026-11'].purchase).toBeUndefined()
    expect(result.state.books.accumulated['2026-11'].sale).toBeDefined()
    expect(harness.steps().filter((step) => step === 'BOOK_SENDING')).toHaveLength(5)
    expect(harness.steps()).not.toContain('BOOK_ERROR')
  }
  // The adjustment is refused too: the book is not sent a third time.
  const twice = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage()]),
    uploads(CVC_REFUSAL, CVC_REFUSAL, ...[102, 103, 104].map((id) => reception(String(id)))),
  ])
  expect(await runBooks(twice.deps, booksState())).toMatchObject({ outcome: 'incomplete', detail: 'purchaseBook' })
  expect(sentBooks(twice)).toHaveLength(5)
})

test('a purchase book refused for anything but being held already is not sent again', async () => {
  const refusals: readonly FakeReply[] = [
    SCHEMA_REFUSAL,
    { status: 500, body: 'down' },
    { body: siiFixture('reception-ok.xml').replace('<STATUS>0', '<STATUS>3') },
    new Error('socket hang up'),
  ]
  for (const refusal of refusals) {
    const harness = await certificationHarness([
      ...EMPTY_HISTORY,
      entry,
      avance2([rowsPage()]),
      uploads(refusal, ...[102, 103, 104].map((id) => reception(String(id)))),
    ])
    const result = await runBooks(harness.deps, booksState())
    expect(result).toMatchObject({ outcome: 'incomplete', detail: 'purchaseBook' })
    expect(sentBooks(harness)).toHaveLength(4)
    expect(harness.steps().filter((step) => step === 'BOOK_ERROR')).toHaveLength(1)
  }
})

test('with the mandatory books approved and the exempt one refused, the sets are declared alone and the wait runs out', async () => {
  const exemptLeft = rowsPage({
    purchaseBook: 'REVISADO CONFORME',
    salesBook: 'REVISADO CONFORME',
    guideBook: 'REVISADO CONFORME',
  })
  const form = declarationFormPage([
    { label: 'SET BASICO', state: 'REVISADO CONFORME' },
    { label: 'SET GUIA DE DESPACHO', state: 'REVISADO CONFORME' },
    { label: 'LIBRO DE COMPRAS', state: 'REVISADO CONFORME' },
    { label: 'LIBRO DE VENTAS', state: 'REVISADO CONFORME' },
    { label: 'LIBRO DE GUIAS', state: 'REVISADO CONFORME' },
    { label: 'LIBRO DE COMPRAS PARA EXENTOS', index: 1 },
  ])
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([exemptLeft, form, form], () => exemptLeft),
    post('pe_avance3', DECLARATION_ANSWERS.success),
    uploads({ status: 500, body: 'down' }),
  ])
  const result = await runBooks(harness.deps, booksState())
  // The exempt book was never sent, so its row never leaves S01: nothing to send again when the wait runs out.
  expect(result).toMatchObject({ outcome: 'timedOut', detail: 'exemptPurchaseBook' })
  expect(harness.steps().filter((step) => step === 'BOOK_SKIPPED')).toHaveLength(3)
  expect(harness.posted('pe_avance3')).toHaveLength(1)
  expect(harness.sleeps).toEqual([15000, 10000, ...repeat(15000, 40)])
  expect(retries(harness)).toEqual([])
  expect(harness.events[harness.events.length - 1]).toEqual(DONE_EVENT(true))
  // With no set either there is nothing at all to declare.
  const nothing = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([exemptLeft]),
    uploads({ status: 500, body: 'down' }),
  ])
  const none = await runBooks(nothing.deps, booksState({ sets: {} }))
  expect(none).toMatchObject({ outcome: 'rejected', detail: 'No hay libros para declarar' })
  expect(nothing.sleeps).toEqual([15000])
  expect(nothing.posted('pe_avance3')).toEqual([])
})

test('every row empty: the books go again as adjustments in the same period, then in the next free one', async () => {
  const resent = booksForm({ purchaseBook: '201', salesBook: '202', guideBook: '203', exemptPurchaseBook: '204' })
  const harness = await certificationHarness([
    ...history(
      bookHistoryPage([['2026-10', 'COMPRA', 'Recibido', 'LIBRO', 'MENSUAL', 'a']]),
      bookHistoryPage([]),
      bookHistoryPage([]),
    ),
    entry,
    avance2([rowsPage(), booksForm(), booksForm(), booksForm(), booksForm(), booksForm(), resent]),
    post('pe_avance3', ...repeat(DECLARATION_ANSWERS.success, 3)),
    uploads(...[101, 102, 103, 104, 111, 112, 113, 114, 201, 202, 203, 204].map((id) => reception(String(id)))),
    estUpAlways('EPR'),
  ])
  const result = await runBooks(harness.deps, booksState())
  expect(result.outcome).toBe('approved')
  expect(retries(harness)).toEqual([
    { step: 'BOOK_PERIOD_RETRY', period: '2026-11', attempt: 1 },
    { step: 'BOOK_PERIOD_RETRY', period: '2026-09', attempt: 2 },
  ])
  expect(result.state.books).toMatchObject({
    period: '2026-09',
    adjustmentTried: ['2026-11'],
    occupiedPeriods: ['2026-10', '2026-11'],
  })
  const sent = sentBooks(harness)
  expect(sent).toHaveLength(12)
  // Every book of the round goes as an adjustment: the guide book and the exempt purchase book too.
  expect(sent.slice(4, 8).every((request) => uploadedXml(request).includes('<TipoEnvio>AJUSTE'))).toBe(true)
  expect(uploadedXml(sent[8])).toContain('<TipoEnvio>TOTAL')
  expect(uploadedXml(sent[8])).toContain('<PeriodoTributario>2026-09')
  expect(Object.values(result.state.books.results).every((book) => book.period === '2026-09' && book.approved)).toBe(
    true,
  )
  expect(harness.steps().filter((step) => step === 'BOOKS_DECLARING')).toHaveLength(1)
})

test('every row empty with only the sales totals kept is still an adjustment; with none kept, the next free period at once', async () => {
  const resent = booksForm({ purchaseBook: '111', salesBook: '112', guideBook: '113', exemptPurchaseBook: '114' })
  const held = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage(), booksForm(), booksForm(), booksForm(), resent]),
    post('pe_avance3', ...repeat(DECLARATION_ANSWERS.success, 2)),
    uploads(CVC_REFUSAL, ...[101, 102, 103, 104, 111, 112, 113, 114].map((id) => reception(String(id)))),
    estUpAlways('EPR'),
  ])
  expect((await runBooks(held.deps, booksState())).outcome).toBe('approved')
  expect(retries(held)).toEqual([{ step: 'BOOK_PERIOD_RETRY', period: '2026-11', attempt: 1 }])
  expect(
    sentBooks(held)
      .slice(5)
      .every((request) => uploadedXml(request).includes('<PeriodoTributario>2026-11')),
  ).toBe(true)
  const twoApproved = rowsPage({ purchaseBook: 'REVISADO CONFORME', salesBook: 'REVISADO CONFORME' })
  const none = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([
      twoApproved,
      booksForm(),
      booksForm(),
      booksForm(),
      booksForm({ guideBook: '203', exemptPurchaseBook: '204' }),
    ]),
    post('pe_avance3', ...repeat(DECLARATION_ANSWERS.success, 2)),
    uploads(...[103, 104, 203, 204].map((id) => reception(String(id)))),
    estUpAlways('EPR'),
  ])
  const result = await runBooks(none.deps, booksState())
  expect(result.outcome).toBe('approved')
  expect(retries(none)).toEqual([{ step: 'BOOK_PERIOD_RETRY', period: '2026-10', attempt: 1 }])
  expect(result.state.books).toMatchObject({ period: '2026-10', occupiedPeriods: ['2026-11'], adjustmentTried: [] })
  expect(uploadedXml(sentBooks(none)[2])).toContain('<TipoEnvio>TOTAL')
})

test('a book the SOAP status rejects after a resend leaves the results and its period is occupied', async () => {
  const after = booksForm({ purchaseBook: '111', salesBook: '112', exemptPurchaseBook: '114' })
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage(), booksForm(), booksForm(), booksForm(), after]),
    post('pe_avance3', ...repeat(DECLARATION_ANSWERS.success, 2)),
    uploads(...[101, 102, 103, 104, 111, 112, 113, 114].map((id) => reception(String(id)))),
    estUpBy({ '113': 'LNC' }),
  ])
  const result = await runBooks(harness.deps, booksState())
  // The portal shows the guide book approved all the same: it is recorded as approved, with no track id of this run.
  expect(result.outcome).toBe('approved')
  expect(retries(harness)).toEqual([{ step: 'BOOK_PERIOD_RETRY', period: '2026-11', attempt: 1 }])
  expect(result.state.books.occupiedPeriods).toEqual(['2026-11'])
  expect(result.state.diagnosis?.['113']).toMatchObject({ code: 'LNC', status: 'rejected' })
  expect(result.state.diagnosis?.['111']).toMatchObject({ code: 'EPR', status: 'accepted' })
  expect(result.state.books.results.guideBook).toEqual({
    trackId: null,
    date: null,
    sentAt: null,
    period: '2026-11',
    submission: 'total',
    approved: true,
  })
  // The second declaration leaves the rejected book out.
  expect(harness.posted('pe_avance3')[1]).toMatchObject({ NUM_ENV1: '111', NUM_ENV2: '112', NUM_ENV4: '114' })
  expect(harness.posted('pe_avance3')[1].NUM_ENV3).toBe('')
  expect(polls(harness)).toBe(3)
})

test('the SOAP cross-check of the wait ends it; the book goes as an adjustment, and in a free period when that declaration does not stand', async () => {
  const declared = rowsPage({
    purchaseBook: 'S21',
    salesBook: 'REVISADO CONFORME',
    guideBook: 'REVISADO CONFORME',
    exemptPurchaseBook: 'REVISADO CONFORME',
  })
  const seen: Record<string, number> = {}
  const soap: FakeRoute = {
    url: EST_UP_URL,
    method: 'POST',
    reply: (request: RecordedRequest) => {
      const id = /<TrackId>(\d+)/.exec(request.text)![1]
      seen[id] = (seen[id] ?? 0) + 1
      // The fourth answer about the purchase book never arrives: the cross-check lets it pass and asks again later.
      if (id === '101' && seen[id] === 4) return new Error('socket hang up')
      return estUp(id !== '101' ? 'EPR' : seen[id] > 4 ? 'LNC' : 'LSO', id)
    },
  }
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([
      rowsPage(),
      booksForm(),
      KEPT,
      // A page that does not even list the purchase book: it is neither approved nor refused.
      page('<table><tr><td><font>LIBRO DE VENTAS</font></td><td><b>REVISADO CONFORME</b></td></tr></table>'),
      declared,
      declared,
      declared,
      booksForm(),
      booksForm(),
      booksForm({ purchaseBook: '202', salesBook: '102', guideBook: '103', exemptPurchaseBook: '104' }),
    ]),
    post('pe_avance3', DECLARATION_ANSWERS.success, DECLARATION_ANSWERS.inconsistent, DECLARATION_ANSWERS.success),
    uploads(...[101, 102, 103, 104, 201, 202].map((id) => reception(String(id)))),
    soap,
  ])
  const result = await runBooks(harness.deps, booksState())
  expect(result.outcome).toBe('approved')
  expect(result.state.diagnosis?.['101']).toMatchObject({ code: 'LNC', status: 'rejected' })
  expect(retries(harness)).toEqual([
    { step: 'BOOK_PERIOD_RETRY', period: '2026-11', attempt: 1 },
    { step: 'BOOK_PERIOD_RETRY', period: '2026-10', attempt: 2 },
  ])
  const sent = sentBooks(harness)
  expect(sent).toHaveLength(6)
  expect(uploadedXml(sent[4])).toContain('<TipoEnvio>AJUSTE')
  expect(uploadedXml(sent[5])).toContain('<TipoEnvio>TOTAL')
  expect(result.state.books.results.purchaseBook).toMatchObject({
    trackId: '202',
    period: '2026-10',
    submission: 'total',
    approved: true,
  })
  expect(result.state.books.occupiedPeriods).toEqual(['2026-11'])
  // One declaration poll each, four polls of the first wait, one of the last.
  expect(polls(harness)).toBe(3 + 4 + 1)
})

test('a refused book with no totals kept goes to the next free period; a declaration that then fails ends the search', async () => {
  const twoApproved = rowsPage({ purchaseBook: 'REVISADO CONFORME', salesBook: 'REVISADO CONFORME' })
  const guideClosed = rowsPage({
    purchaseBook: 'REVISADO CONFORME',
    salesBook: 'REVISADO CONFORME',
    guideBook: 'LNC',
    exemptPurchaseBook: 'REVISADO CONFORME',
  })
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([
      twoApproved,
      booksForm(),
      booksForm({ guideBook: '103', exemptPurchaseBook: '104' }),
      guideClosed,
      booksForm(),
    ]),
    post('pe_avance3', DECLARATION_ANSWERS.success, DECLARATION_ANSWERS.inconsistent),
    uploads(reception('103'), reception('104'), { status: 500, body: 'down' }),
    estUpAlways('EPR'),
  ])
  const result = await runBooks(harness.deps, booksState({ setReadDate: '2026-09-30' }))
  expect(result).toMatchObject({ outcome: 'rejected', detail: 'FECHA DE ENVIO NO CORRESPONDE AL ENVIO 123' })
  expect(retries(harness)).toEqual([{ step: 'BOOK_PERIOD_RETRY', period: '2026-08', attempt: 1 }])
  const sent = sentBooks(harness)
  expect(uploadedXml(sent[0])).toContain('<PeriodoTributario>2026-09')
  expect(uploadedXml(sent[2])).toContain('<PeriodoTributario>2026-08')
  expect(uploadedXml(sent[2])).toContain('<TipoEnvio>TOTAL')
  // The resend could not be uploaded: the book leaves the results and no SOAP status is asked for it.
  expect(result.state.books.results.guideBook).toBeUndefined()
  expect(result.state.books.results.exemptPurchaseBook).toMatchObject({ trackId: '104', approved: true })
  expect(result.state.books).toMatchObject({ period: '2026-08', occupiedPeriods: ['2026-09'] })
  expect(harness.sleeps).toEqual([15000, 10000, 15000, 10000])
})

test('the period retries stop after 24 rounds of "every row empty"', async () => {
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage()], () => booksForm()),
    post('pe_avance3', ...repeat(DECLARATION_ANSWERS.success, 25)),
    uploads(...repeat(reception('9'), 4 + 24 * 4)),
    estUpAlways('EPR'),
  ])
  const result = await runBooks(harness.deps, booksState())
  expect(result).toMatchObject({ outcome: 'rejected', detail: expect.stringMatching(/^notSaved: /) })
  // Each period is tried twice: an adjustment, then the next free period as a total submission.
  expect(retries(harness)).toHaveLength(24)
  expect(result.state.books.adjustmentTried).toHaveLength(12)
  expect(result.state.books.period).toBe('2025-11')
})

test('a status service that keeps failing: three rounds before the declaration, and after a resend each book is given up at its fifth failure', async () => {
  const thrown = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage(), booksForm(), KEPT, ALL_APPROVED]),
    post('pe_avance3', DECLARATION_ANSWERS.success),
    fourReceipts(),
    { url: EST_UP_URL, method: 'POST' as const, reply: () => new Error('socket hang up') },
  ])
  expect((await runBooks(thrown.deps, booksState())).outcome).toBe('approved')
  expect(thrown.warnings().filter((message) => message === 'certification book status failed')).toHaveLength(12)
  expect(thrown.sleeps).toEqual([15000, 15000, 15000, 15000, 10000, 15000])
  const unanswered = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([
      rowsPage(),
      booksForm(),
      booksForm(),
      booksForm(),
      booksForm({ purchaseBook: '111', salesBook: '112', guideBook: '113', exemptPurchaseBook: '114' }),
    ]),
    post('pe_avance3', ...repeat(DECLARATION_ANSWERS.success, 2)),
    uploads(...[101, 102, 103, 104, 111, 112, 113, 114].map((id) => reception(String(id)))),
    { url: EST_UP_URL, method: 'POST' as const, reply: () => ({ status: 500, body: 'down' }) },
  ])
  const result = await runBooks(unanswered.deps, booksState())
  expect(result.outcome).toBe('approved')
  expect(result.state.diagnosis).toEqual({})
  // 60 s before the declaration; after the resend 15 s and five rounds, the last one leaving no book to wait for.
  expect(unanswered.sleeps).toEqual([...repeat(15000, 4), 10000, ...repeat(15000, 5), 10000, 15000])
  expect(unanswered.urls().filter((url) => url === EST_UP_URL)).toHaveLength(3 * 4 + 5 * 4)
})

test('a declaration the portal does not take ends the phase as rejected, with the books sent', async () => {
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage(), booksForm()]),
    post('pe_avance3', DECLARATION_ANSWERS.contentMismatch),
    fourReceipts(),
    estUpAlways('LSO'),
  ])
  const result = await runBooks(harness.deps, booksState())
  expect(result).toMatchObject({ outcome: 'rejected', detail: 'contentMismatch' })
  expect(harness.events[harness.events.length - 1]).toEqual(DONE_EVENT(true))
  expect(polls(harness)).toBe(1)
})

test('books the SOAP status rejected or the declaration named with content errors are not awaited: they go again', async () => {
  const waitPage = rowsPage({ purchaseBook: 'EN REVISION', salesBook: 'REVISADO CONFORME', guideBook: 'S21' })
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([
      rowsPage(),
      booksForm(),
      KEPT,
      waitPage,
      booksForm(),
      booksForm(),
      booksForm(),
      booksForm({ purchaseBook: '101', salesBook: '102', guideBook: '204', exemptPurchaseBook: '104' }),
    ]),
    post('pe_avance3', DECLARATION_ANSWERS.contentErrors, ...repeat(DECLARATION_ANSWERS.success, 2)),
    uploads(...[101, 102, 103, 104, 203, 204].map((id) => reception(String(id)))),
    estUpBy({ '103': 'LNC' }),
  ])
  const result = await runBooks(harness.deps, booksState())
  // Only the sales book is awaited. The guide book stands as closed whatever the page says and goes to a free
  // period; its declaration comes back with every row empty, so the next round moves on. The purchase books the
  // declaration named keep the state the page gives them, which is not one that is sent again.
  expect(retries(harness)).toEqual([
    { step: 'BOOK_PERIOD_RETRY', period: '2026-10', attempt: 1 },
    { step: 'BOOK_PERIOD_RETRY', period: '2026-09', attempt: 2 },
  ])
  const sent = sentBooks(harness)
  expect(sent.map((request) => request.parts.find((part) => part.fileName !== null)?.fileName)).toEqual([
    'LibroCV.xml',
    'LibroCV.xml',
    'LibroGuia.xml',
    'LibroCVExentos.xml',
    'LibroGuia.xml',
    'LibroGuia.xml',
  ])
  expect(uploadedXml(sent[5])).toContain('<PeriodoTributario>2026-09')
  expect(result).toMatchObject({ outcome: 'rejected', detail: 'purchaseBook, exemptPurchaseBook' })
  expect(result.state.books.results.guideBook).toMatchObject({ trackId: '204', period: '2026-09', approved: true })
  expect(result.state.diagnosis?.['103']).toMatchObject({ code: 'LNC', status: 'rejected' })
  expect(polls(harness)).toBe(3 + 1 + 1)
})

test('a declaration that never stands is diagnosed: the envelope it names first, then the others as they are declared', async () => {
  const basicErrors = page('<table><tr><td>SET BASICO</td><td>ENVIO CON ERRORES O REPAROS</td></tr></table>')
  const partlyKept = booksForm({ purchaseBook: '101' })
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage()], () => partlyKept),
    post('pe_avance3', ...repeat(basicErrors, 10)),
    fourReceipts(),
    estUpAlways('EPR'),
  ])
  const result = await runBooks(harness.deps, booksState())
  expect(result.outcome).toBe('rejected')
  expect(harness.posted('pe_avance3')).toHaveLength(10)
  const asked = harness.fake.requests
    .filter((request) => request.url === EST_UP_URL)
    .map((request) => /<TrackId>(\d+)/.exec(request.text)![1])
  // The look before the declaration asks in the order the books were sent: purchases, sales, guides, exempt. The
  // diagnosis asks for the basic set the answer names, then for the rest as the declaration lists them: the other
  // set, then the sales book before the purchase book.
  expect(asked).toEqual(['101', '102', '103', '104', '11', '12', '102', '101', '103', '104'])
})

test('with every book left out of the wait there is no wait: the books named stand as closed and go again', async () => {
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([
      rowsPage(),
      booksForm(),
      KEPT,
      booksForm(),
      booksForm({ purchaseBook: '201', salesBook: '202', guideBook: '203', exemptPurchaseBook: '204' }),
    ]),
    post('pe_avance3', DECLARATION_ANSWERS.contentErrors, DECLARATION_ANSWERS.success),
    uploads(...[101, 102, 103, 104, 201, 202, 203, 204].map((id) => reception(String(id)))),
    estUpBy({ '102': 'RCH', '103': 'LNC' }),
  ])
  const result = await runBooks(harness.deps, booksState())
  expect(result.outcome).toBe('approved')
  expect(retries(harness)).toEqual([{ step: 'BOOK_PERIOD_RETRY', period: '2026-11', attempt: 1 }])
  const sent = sentBooks(harness)
  expect(sent).toHaveLength(8)
  expect(sent.slice(4).every((request) => uploadedXml(request).includes('<PeriodoTributario>2026-11'))).toBe(true)
  // 15 s and one round of SOAP, the declaration, the SOAP of the resend, the declaration, one poll of the wait.
  expect(harness.sleeps).toEqual([15000, 10000, 15000, 10000, 15000])
})

test('with no book left to declare after a resend the search goes on to the next free period', async () => {
  const mandatory = {
    purchaseBook: 'REVISADO CONFORME',
    salesBook: 'REVISADO CONFORME',
    guideBook: 'REVISADO CONFORME',
  }
  const exemptForm = (value = ''): string =>
    declarationFormPage([
      { label: 'LIBRO DE COMPRAS', state: 'REVISADO CONFORME' },
      { label: 'LIBRO DE VENTAS', state: 'REVISADO CONFORME' },
      { label: 'LIBRO DE GUIAS', state: 'REVISADO CONFORME' },
      { label: 'LIBRO DE COMPRAS PARA EXENTOS', index: 1, value },
    ])
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([
      rowsPage(mandatory),
      exemptForm(),
      exemptForm('104'),
      rowsPage({ ...mandatory, exemptPurchaseBook: 'LRH' }),
      exemptForm(),
      exemptForm('206'),
    ]),
    post('pe_avance3', ...repeat(DECLARATION_ANSWERS.success, 2)),
    uploads(reception('104'), reception('205'), reception('206')),
    estUpBy({ '205': 'LNC' }),
  ])
  const result = await runBooks(harness.deps, booksState({ sets: {} }))
  expect(result.outcome).toBe('approved')
  expect(retries(harness)).toEqual([
    { step: 'BOOK_PERIOD_RETRY', period: '2026-10', attempt: 1 },
    { step: 'BOOK_PERIOD_RETRY', period: '2026-09', attempt: 2 },
  ])
  // The period of the book the SOAP status rejected is occupied too.
  expect(result.state.books).toMatchObject({ period: '2026-09', occupiedPeriods: ['2026-11', '2026-10'] })
  expect(result.state.books.results.exemptPurchaseBook).toMatchObject({ trackId: '206', period: '2026-09' })
  expect(harness.posted('pe_avance3')).toHaveLength(2)
})

test('a page that cannot be read never stops the phase; a failure that is no portal answer does', async () => {
  const route = (...replies: readonly FakeReply[]): FakeRoute => ({
    url: `${MAULLIN}/pe_avance2`,
    method: 'POST',
    reply: [...replies],
  })
  const down: FakeReply = new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' })
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    route(down, { body: booksForm() }, { body: KEPT }, down, { body: ALL_APPROVED }),
    post('pe_avance3', DECLARATION_ANSWERS.success),
    fourReceipts(),
    estUpAlways('EPR'),
  ])
  const result = await runBooks(harness.deps, booksState())
  // Without the first page no book counts as approved: every book is sent.
  expect(result.outcome).toBe('approved')
  expect(sentBooks(harness)).toHaveLength(4)
  expect(harness.warnings().filter((message) => message === 'certification book states failed')).toHaveLength(2)
  expect(harness.sleeps).toEqual([15000, 10000, 15000, 15000])
  expect(polls(harness)).toBe(1 + 2)
  const broken = await certificationHarness([...EMPTY_HISTORY, entry, route(new Error('boom'))])
  await expect(runBooks(broken.deps, booksState())).rejects.toThrow('boom')
})

test('a row is a book when its name holds the book name; it is sent again only under its exact name', async () => {
  const row = (name: string, state: string): string => `<tr><td><font>${name}</font></td><td><b>${state}</b></td></tr>`
  // The exempt row comes first and is not the purchase book's; the sales row carries more than its name.
  const first = page(
    `<table>${row('LIBRO DE COMPRAS PARA EXENTOS', 'REVISADO CONFORME')}${row('LIBRO DE COMPRAS', 'S01')}${row('LIBRO DE VENTAS (IECV)', 'S01')}${row('LIBRO DE GUIAS', 'REVISADO CONFORME')}</table>`,
  )
  const stuck = page(
    `<table>${row('LIBRO DE COMPRAS PARA EXENTOS', 'REVISADO CONFORME')}${row('LIBRO DE COMPRAS', 'S25')}${row('LIBRO DE VENTAS (IECV)', 'S21')}${row('LIBRO DE GUIAS', 'REVISADO CONFORME')}</table>`,
  )
  const form = declarationFormPage([
    { label: 'LIBRO DE COMPRAS', index: 1, value: '101' },
    { label: 'LIBRO DE VENTAS', index: 2, value: '102' },
  ])
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([first, form, form], () => stuck),
    post('pe_avance3', DECLARATION_ANSWERS.success),
    uploads(reception('101'), reception('102')),
    estUpAlways('EPR'),
  ])
  const result = await runBooks(harness.deps, booksState())
  expect(harness.steps().filter((step) => step === 'BOOK_SKIPPED')).toHaveLength(2)
  expect(sentBooks(harness)).toHaveLength(2)
  // The sales book stays declared for the whole wait, and its row is not one the search knows by name.
  expect(result).toMatchObject({ outcome: 'timedOut', detail: 'salesBook' })
  expect(result.state.books.results.purchaseBook).toMatchObject({ trackId: '101', approved: true })
  expect(retries(harness)).toEqual([])
  expect(polls(harness)).toBe(1 + 40)
})

test('without a plan there is nothing to run', async () => {
  const harness = await certificationHarness([])
  expect((await failure(runBooks(harness.deps, stateWith()))).details).toEqual({ field: 'plan' })
})
