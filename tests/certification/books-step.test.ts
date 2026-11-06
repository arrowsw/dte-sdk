import { nextFreePeriod, previousPeriod, runBooks } from '../../src/certification/books-step'
import type { CertificationState, SentCase } from '../../src/certification/state'
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
const estUpAlways = (code: string): FakeRoute => ({
  url: 'https://maullin.sii.cl/DTEWS/QueryEstUp.jws',
  method: 'POST',
  reply: () => estUp(code),
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
  const sent = harness.fake.requests.filter((request) => request.url === UPLOAD)
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
  expect(harness.sleeps).toEqual([15000, 15000, 15000, 10000, 15000])
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
  expect(harness.events[harness.events.length - 1]).toEqual({
    step: 'BOOKS_DONE',
    books: ['purchaseBook', 'salesBook', 'guideBook', 'exemptPurchaseBook'],
    success: true,
  })
  expect(
    harness
      .urls()
      .filter((url) => url.includes('QEstLibro'))
      .map((url) => /year=(\d+)/.exec(url)![1]),
  ).toEqual(['2026', '2025'])
})

test('a book the portal shows approved is skipped; without an exempt plan there are three books; all approved is done at once', async () => {
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
  const finished = await runBooks(done.deps, booksState())
  expect(finished).toMatchObject({ outcome: 'approved' })
  expect(finished.state.books).toMatchObject({ period: '2026-10', occupiedPeriods: ['2026-11'] })
  expect(done.urls().filter((url) => url === UPLOAD)).toEqual([])
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
  const result = await runBooks(harness.deps, booksState({ sets: basicOnly, plan: noPurchasePlan }))
  expect(result).toMatchObject({ outcome: 'incomplete', detail: 'purchaseBook, guideBook' })
  expect(harness.steps().filter((step) => step === 'BOOK_ERROR')).toHaveLength(2)
  expect(result.state.books.results.purchaseBook).toBeUndefined()
  expect(harness.events[harness.events.length - 1]).toEqual({
    step: 'BOOKS_DONE',
    books: ['purchaseBook', 'salesBook', 'guideBook', 'exemptPurchaseBook'],
    success: false,
  })
  const refused = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage()]),
    uploads(
      reception('101'),
      { body: siiFixture('reception-schema-error.xml').replace('cvc-', 'xyz-') },
      reception('103'),
      reception('104'),
    ),
  ])
  const noSets = await runBooks(refused.deps, booksState({ sets: {} }))
  expect(noSets).toMatchObject({ outcome: 'incomplete', detail: 'salesBook, guideBook' })
  expect(noSets.state.books.period).toBe('2026-11')
})

test('nothing left to declare when the only book not approved could not be sent', async () => {
  const threeApproved = page(
    '<table><tr><td><font>LIBRO DE COMPRAS</font></td><td><b>REVISADO CONFORME</b></td></tr><tr><td><font>LIBRO DE VENTAS</font></td><td><b>REVISADO CONFORME</b></td></tr><tr><td><font>LIBRO DE GUIAS</font></td><td><b>REVISADO CONFORME</b></td></tr></table>',
  )
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([threeApproved]),
    uploads({ body: siiFixture('reception-schema-error.xml').replace('cvc-', 'xyz-') }),
  ])
  const result = await runBooks(harness.deps, booksState())
  expect(result).toMatchObject({ outcome: 'rejected', detail: 'noBooks' })
  expect(harness.steps().filter((step) => step === 'BOOK_SKIPPED')).toHaveLength(3)
  expect(harness.sleeps).toEqual([15000])
})

test('a purchase book the SII already holds goes again as an adjustment', async () => {
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([
      rowsPage(),
      booksForm(),
      booksForm(),
      booksForm(),
      booksForm({ purchaseBook: '111', salesBook: '112', guideBook: '113', exemptPurchaseBook: '114' }),
    ]),
    post('pe_avance3', DECLARATION_ANSWERS.success, DECLARATION_ANSWERS.success),
    uploads(
      { body: siiFixture('reception-schema-error.xml') },
      ...[101, 102, 103, 104, 111, 112, 113, 114].map((id) => reception(String(id))),
    ),
    estUpAlways('EPR'),
  ])
  const result = await runBooks(harness.deps, booksState())
  expect(result.outcome).toBe('approved')
  expect(result.state.books.results.purchaseBook).toMatchObject({ trackId: '111', submission: 'adjustment' })
  const sent = harness.fake.requests.filter((request) => request.url === UPLOAD)
  expect(uploadedXml(sent[0])).toContain('<TipoEnvio>TOTAL')
  expect(uploadedXml(sent[1])).toContain('<TipoEnvio>AJUSTE')
  expect(result.state.books.accumulated['2026-11'].purchase).toBeUndefined()
  expect(result.state.books.accumulated['2026-11'].sale).toBeDefined()
  // With only the sales totals kept, the first retry is still an adjustment in the same period.
  expect(harness.events.filter((event) => event.step === 'BOOK_PERIOD_RETRY')).toEqual([
    { step: 'BOOK_PERIOD_RETRY', period: '2026-11', attempt: 1 },
  ])
  expect(uploadedXml(sent[5])).toContain('<TipoEnvio>AJUSTE')
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
  const retries = harness.events.filter((event) => event.step === 'BOOK_PERIOD_RETRY')
  expect(retries).toEqual([
    { step: 'BOOK_PERIOD_RETRY', period: '2026-11', attempt: 1 },
    { step: 'BOOK_PERIOD_RETRY', period: '2026-09', attempt: 2 },
  ])
  expect(result.state.books).toMatchObject({
    period: '2026-09',
    adjustmentTried: ['2026-11'],
    occupiedPeriods: ['2026-10', '2026-11'],
  })
  const sent = harness.fake.requests.filter((request) => request.url === UPLOAD)
  expect(sent).toHaveLength(12)
  expect(uploadedXml(sent[4])).toContain('<TipoEnvio>AJUSTE')
  expect(uploadedXml(sent[5])).toContain('<TipoEnvio>AJUSTE')
  expect(uploadedXml(sent[6])).toContain('<TipoEnvio>TOTAL')
  expect(uploadedXml(sent[8])).toContain('<PeriodoTributario>2026-09')
  expect(Object.values(result.state.books.results).every((book) => book.period === '2026-09' && book.approved)).toBe(
    true,
  )
})

test('a closed book seen through SOAP after a resend leaves the period and the book behind; the wait resends it later', async () => {
  const state = booksState({ books: { ...booksState().books, adjustmentTried: ['2026-11'] } })
  const pendingGuide = rowsPage({
    purchaseBook: 'REVISADO CONFORME',
    salesBook: 'REVISADO CONFORME',
    exemptPurchaseBook: 'REVISADO CONFORME',
  })
  const after = booksForm({ purchaseBook: '111', salesBook: '112', exemptPurchaseBook: '114' })
  const final = booksForm({ purchaseBook: '111', salesBook: '112', guideBook: '301', exemptPurchaseBook: '114' })
  const soap = {
    url: 'https://maullin.sii.cl/DTEWS/QueryEstUp.jws',
    method: 'POST' as const,
    reply: (request: RecordedRequest) => estUp(request.text.includes('<TrackId>113</TrackId>') ? 'LNC' : 'EPR'),
  }
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage(), booksForm(), booksForm(), booksForm(), after], (call) =>
      call <= 5 + 40 ? pendingGuide : call <= 5 + 40 + 2 ? final : ALL_APPROVED,
    ),
    post('pe_avance3', ...repeat(DECLARATION_ANSWERS.success, 3)),
    uploads(...[101, 102, 103, 104, 111, 112, 113, 114, 301].map((id) => reception(String(id)))),
    soap,
  ])
  const result = await runBooks(harness.deps, state)
  expect(result.outcome).toBe('approved')
  expect(harness.events.filter((event) => event.step === 'BOOK_PERIOD_RETRY')).toEqual([
    { step: 'BOOK_PERIOD_RETRY', period: '2026-10', attempt: 1 },
    { step: 'BOOK_PERIOD_RETRY', period: '2026-10', attempt: 1 },
  ])
  expect(result.state.books.occupiedPeriods).toEqual(['2026-11', '2026-10'])
  expect(result.state.diagnosis?.['113']).toMatchObject({ code: 'LNC', status: 'rejected' })
  expect(result.state.books.results.guideBook).toMatchObject({ trackId: '301', period: '2026-10', approved: true })
  expect(harness.steps().filter((step) => step === 'POLLING').length).toBeGreaterThan(40)
})

test('the SOAP cross-check of the wait: a book the SII rejected while the portal does not even list it', async () => {
  const pending = page(
    '<table><tr><td><font>LIBRO DE VENTAS</font></td><td><b>REVISADO CONFORME</b></td></tr><tr><td><font>LIBRO DE GUIAS</font></td><td><b>REVISADO CONFORME</b></td></tr><tr><td><font>LIBRO DE COMPRAS PARA EXENTOS</font></td><td><b>REVISADO CONFORME</b></td></tr></table>',
  )
  const seen: Record<string, number> = {}
  const soap = {
    url: 'https://maullin.sii.cl/DTEWS/QueryEstUp.jws',
    method: 'POST' as const,
    reply: (request: RecordedRequest) => {
      const id = /<TrackId>(\d+)/.exec(request.text)![1]
      seen[id] = (seen[id] ?? 0) + 1
      return estUp(id === '101' && seen[id] > 3 ? 'LNC' : 'LSO', id)
    },
  }
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage(), booksForm(), KEPT, pending, pending, booksForm()]),
    post('pe_avance3', DECLARATION_ANSWERS.success, DECLARATION_ANSWERS.inconsistent),
    uploads(...[101, 102, 103, 104, 201].map((id) => reception(String(id)))),
    soap,
  ])
  const result = await runBooks(harness.deps, booksState())
  expect(result).toMatchObject({ outcome: 'rejected', detail: 'purchaseBook' })
  expect(result.state.diagnosis?.['101']).toMatchObject({ code: 'LNC', status: 'rejected' })
  expect(harness.steps().filter((step) => step === 'POLLING')).toHaveLength(4)
})

test('a resend in a period with no totals kept goes to the next free period; a resumed run keeps its period', async () => {
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
    uploads(reception('103'), reception('104'), reception('203')),
    estUpAlways('EPR'),
  ])
  const result = await runBooks(harness.deps, booksState({ books: { ...booksState().books, period: '2026-08' } }))
  expect(result).toMatchObject({ outcome: 'rejected', detail: 'guideBook' })
  expect(harness.events.filter((event) => event.step === 'BOOK_PERIOD_RETRY')).toEqual([
    { step: 'BOOK_PERIOD_RETRY', period: '2026-07', attempt: 1 },
  ])
  expect(result.state.books.results.guideBook).toMatchObject({ trackId: '203', period: '2026-07', submission: 'total' })
  expect(result.state.books.occupiedPeriods).toEqual(['2026-08'])
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
  expect(harness.events.filter((event) => event.step === 'BOOK_PERIOD_RETRY')).toHaveLength(24)
  expect(result.state.books.adjustmentTried).toHaveLength(12)
  expect(result.state.books.period).toBe('2025-11')
})

test('a SOAP service that keeps failing is given up after ten errors, and the declaration goes on', async () => {
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage(), booksForm(), KEPT, ALL_APPROVED]),
    post('pe_avance3', DECLARATION_ANSWERS.success),
    fourReceipts(),
    {
      url: 'https://maullin.sii.cl/DTEWS/QueryEstUp.jws',
      method: 'POST' as const,
      reply: () => new Error('socket hang up'),
    },
  ])
  const result = await runBooks(harness.deps, booksState())
  expect(result.outcome).toBe('approved')
  expect(harness.warnings().filter((message) => message === 'certification book status failed')).toHaveLength(10)
  expect(harness.sleeps).toEqual([15000, 15000, 15000, 10000, 15000])
})

test('a declaration the portal refuses after the retries ends the phase as rejected', async () => {
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
  expect(harness.events[harness.events.length - 1]).toEqual({
    step: 'BOOKS_DONE',
    books: ['purchaseBook', 'salesBook', 'guideBook', 'exemptPurchaseBook'],
    success: false,
  })
})

test('the approval wait: a refusal on the portal resends the book; a refusal of the second declaration stops; the wait can time out', async () => {
  const lnc = rowsPage({
    purchaseBook: 'LNC',
    salesBook: 'REVISADO CONFORME',
    guideBook: 'REVISADO CONFORME',
    exemptPurchaseBook: 'S25',
  })
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage(), booksForm(), KEPT, lnc, booksForm()]),
    post('pe_avance3', DECLARATION_ANSWERS.success, DECLARATION_ANSWERS.inconsistent),
    uploads(...[101, 102, 103, 104, 201].map((id) => reception(String(id)))),
    estUpAlways('EPR'),
  ])
  const result = await runBooks(harness.deps, booksState())
  expect(result).toMatchObject({ outcome: 'rejected', detail: 'purchaseBook' })
  expect(result.state.books.results.purchaseBook).toMatchObject({
    trackId: '201',
    submission: 'adjustment',
    period: '2026-11',
  })
  expect(result.state.lastDeclaration?.outcome).toBe('inconsistent')
  const pending = rowsPage({
    salesBook: 'REVISADO CONFORME',
    guideBook: 'REVISADO CONFORME',
    exemptPurchaseBook: 'REVISADO CONFORME',
  })
  const slow = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage(), booksForm(), KEPT], (call) => (call <= 3 + 40 ? pending : booksForm())),
    post('pe_avance3', DECLARATION_ANSWERS.success, DECLARATION_ANSWERS.contentMismatch),
    uploads(...[101, 102, 103, 104, 201].map((id) => reception(String(id)))),
    {
      url: 'https://maullin.sii.cl/DTEWS/QueryEstUp.jws',
      method: 'POST' as const,
      // The look before the declaration takes twelve answers; the first cross-check of the wait then fails.
      reply: [...repeat(estUp('LSO'), 12), { status: 500, body: 'down' }, ...repeat(estUp('LSO'), 200)],
    },
  ])
  const timed = await runBooks(slow.deps, booksState())
  expect(timed).toMatchObject({ outcome: 'timedOut', detail: 'purchaseBook' })
  expect(slow.steps().filter((step) => step === 'POLLING')).toHaveLength(1 + 40 + 1)
})

test('without a plan there is nothing to run', async () => {
  const harness = await certificationHarness([])
  expect((await failure(runBooks(harness.deps, stateWith()))).details).toEqual({ field: 'plan' })
})
