import { runCertification } from '../../src/certification/runner'
import type { CertificationState } from '../../src/certification/state'
import { fullPlan } from '../support/certification-fixtures'
import {
  certificationCafXmls,
  certificationHarness,
  get,
  MAULLIN,
  post,
  reception,
  repeat,
  sequence,
  stampingRoutes,
  stateWith,
  TODAY,
  UPL,
  uploadRoute,
} from '../support/certification-harness'
import {
  ADVANCE_ANSWERS,
  bookHistoryPage,
  COMPLIANCE_BLOCKED,
  COMPLIANCE_DECLARED,
  COMPLIANCE_ENTRY,
  COMPLIANCE_FORM,
  DECLARATION_ANSWERS,
  declarationFormPage,
  NOT_ENROLLED,
  progressPage,
  SET_ENTRY,
  setDownloadPage,
  setGenerationForm,
  STANDARD_ROWS,
} from '../support/certification-pages'
import {
  CREATED_REVIEW,
  exchangeRoutes,
  exchangeSetXml,
  NOT_IN_EXCHANGE,
  reviewAnswer,
  SAMPLES_BLOCKED,
  samplesRoutes,
} from '../support/exchange-fixtures'
import { detailAnswer, EMPTY_OK } from '../support/gwt-answers'
import { failure } from '../support/portal'
import { page } from '../support/portal-pages'
import { ISSUER_RUT } from '../support/fixtures'

const plan = fullPlan()
const entry = get('pe_avance1', ...repeat(page('entry'), 400))
const avance5 = get('pe_avance5', ...repeat(page('p5'), 100))
const avance2 = (pages: readonly string[], fallback: (call: number) => string = () => page('x')) => ({
  url: `${MAULLIN}/pe_avance2`,
  method: 'POST' as const,
  reply: sequence(pages, fallback),
})
const avance6 = (pages: readonly string[], fallback: (call: number) => string) => ({
  url: `${MAULLIN}/pe_avance6`,
  method: 'POST' as const,
  reply: sequence(pages, fallback),
})
const setRoutes = () => [
  get('pe_generar', SET_ENTRY),
  post('pe_generar1', setGenerationForm()),
  post('pe_generar2', setDownloadPage()),
]
const history = () => [
  { url: `${UPL}/DTEauth?7`, reply: repeat({ body: page('auth') }, 10) },
  { url: `${UPL}/QEstLibro*`, reply: repeat({ body: bookHistoryPage([]) }, 4) },
]
const SETS_FORM = declarationFormPage(STANDARD_ROWS.slice(0, 4))
const SETS_KEPT = declarationFormPage(
  STANDARD_ROWS.slice(0, 4).map((row, index) => ({ ...row, value: String(index + 1) })),
)
const SETS_APPROVED = progressPage('SET', {
  'SET BASICO': 'REVISADO CONFORME',
  'SET GUIA DESP.': 'REVISADO CONFORME',
  'SET FACTURA EXENTA': 'REVISADO CONFORME',
  'SET CASO GENERAL FACTURA COMPRA': 'REVISADO CONFORME',
})
const BOOKS_APPROVED = page(
  `<table>${[
    'SET BASICO',
    'SET GUIA DE DESPACHO',
    'SET FACTURA EXENTA',
    'SET CASO GENERAL FACTURA COMPRA',
    'LIBRO DE COMPRAS',
    'LIBRO DE VENTAS',
    'LIBRO DE GUIAS',
    'LIBRO DE COMPRAS PARA EXENTOS',
  ]
    .map((name) => `<tr><td><font>${name}</font></td><td><b>REVISADO CONFORME</b></td></tr>`)
    .join('')}</table>`,
)
const simRow = (value = '') => [{ label: 'SET DE SIMULACION', index: 1, value }, ...STANDARD_ROWS.slice(1)]
const SIM_FORM = declarationFormPage(simRow())
const SIM_KEPT = declarationFormPage(simRow('777'))
const AT_EXCHANGE = progressPage('INTERCAMBIO', { 'SET SIMULACION': 'REVISADO CONFORME' })
const IN_SIMULATION = progressPage('SIMULACION', { 'SET SIMULACION': 'EN REVISION' })
const AT_SAMPLES = progressPage('DOCUMENTOS IMPRESOS', {})
const sent = (trackId: string) => ({ trackId, date: TODAY, sentAt: 'x', cases: [] })
const allSets = { basic: sent('1'), guide: sent('2'), exempt: sent('3'), purchase: sent('4') }
const compliance = (second: string, final?: string) => [
  get('pe_avance7', COMPLIANCE_ENTRY),
  post('pe_avance8', second),
  ...(final === undefined ? [] : [post('pe_avance9', final)]),
]
const seeded = async (routes: Parameters<typeof certificationHarness>[0], state: CertificationState) => {
  const harness = await certificationHarness(routes)
  await harness.store.save(state)
  return harness
}

test('a fresh run: the set, the folios, four sets sent, declared and approved, then it stops where asked', async () => {
  const harness = await certificationHarness([
    ...setRoutes(),
    ...stampingRoutes(),
    uploadRoute(reception('1'), reception('2'), reception('3'), reception('4')),
    entry,
    avance2([SETS_FORM, SETS_KEPT]),
    post('pe_avance3', DECLARATION_ANSWERS.success),
    avance5,
    avance6([], () => SETS_APPROVED),
  ])
  const result = await runCertification(harness.deps, { until: 'testSets', optionalSets: ['SET03', 'SET06', 'SET72'] })
  expect(result.stopped).toBe('until')
  expect(result.state).toMatchObject({ companyRut: ISSUER_RUT, stage: 'books', setsApproved: true })
  expect(Object.keys(result.state.sets).sort()).toEqual(['basic', 'exempt', 'guide', 'purchase'])
  expect(result.state.cafs).toHaveLength(6)
  expect(await harness.store.load()).toEqual(result.state)
  const steps = harness.steps()
  expect(steps.slice(0, 2)).toEqual(['SETS_DOWNLOADING', 'SETS_LOADED'])
  expect(steps.filter((step) => step === 'SET_OK')).toHaveLength(4)
  expect(steps.slice(-3)).toEqual(['SETS_DECLARED', 'POLLING', 'SETS_APPROVED'])
  expect(harness.posted('pe_generar2')[0]).toEqual({
    RUT_EMP: '76543210',
    DV_EMP: '3',
    AUTORIZADA: 'S',
    TOTAL: '15',
    SET01: 'S',
    SET03: 'S',
    SET06: 'S',
    SET72: 'S',
  })
})

test('resumed at the books: approved books, the advance, the simulation sent, declared and confirmed, then the exchange stops when the portal says the company is not in it', async () => {
  const harness = await seeded(
    [
      ...history(),
      entry,
      // While the stage reads SIMULACION each progress read asks for the declaration form once more.
      avance2([BOOKS_APPROVED, page('x'), page('x'), page('x'), page('x'), page('x'), SIM_FORM, SIM_KEPT]),
      post('pe_avance4', ADVANCE_ANSWERS.advanced),
      avance5,
      avance6([progressPage('SIMULACION', {}), IN_SIMULATION], () => AT_EXCHANGE),
      ...stampingRoutes(),
      uploadRoute(reception('777')),
      post('pe_avance3', DECLARATION_ANSWERS.success),
      ...exchangeRoutes({ facade: { validarUsuario: { body: NOT_IN_EXCHANGE } } }),
    ],
    stateWith({ plan, sets: allSets, setsApproved: true, stage: 'books', cafs: certificationCafXmls() }),
  )
  const result = await runCertification(harness.deps)
  expect(result.stopped).toBe('exchange')
  expect(result.detail).toContain('estado: P05')
  expect(result.state).toMatchObject({
    stage: 'exchange',
    simulation: { trackId: '777', confirmed: true },
    exchange: { portalState: 'P05', uploaded: false },
  })
  expect(result.state.books.results.guideBook?.approved).toBe(true)
  const steps = harness.steps()
  expect(steps).toContain('BOOKS_DONE')
  expect(steps).toContain('ADVANCE_DONE')
  expect(steps.slice(-5)).toEqual(['POLLING', 'POLLING', 'SIM_DONE', 'INTERCAMBIO_START', 'INTERCAMBIO_DESCARGADO'])
  expect(harness.urls().filter((url) => url.endsWith('DTEUpload'))).toHaveLength(1)
})

test('at the compliance the portal decides: blocked, or declared; the exchange stops when the company is not in it', async () => {
  const beyond = stateWith({
    plan,
    sets: allSets,
    stage: 'compliance',
    simulation: { trackId: '777', date: TODAY, sentAt: 'x', confirmed: true },
  })
  const blocked = await seeded(
    [
      entry,
      avance2([], () => declarationFormPage(STANDARD_ROWS)),
      post('pe_avance4', ADVANCE_ANSWERS.unchanged),
      avance5,
      avance6([], () => AT_SAMPLES),
      ...compliance(COMPLIANCE_BLOCKED),
    ],
    beyond,
  )
  const first = await runCertification(blocked.deps, { declareCompliance: true })
  expect(first.stopped).toBe('blocked')
  expect(first.state).toMatchObject({ stage: 'compliance', blocked: expect.stringContaining('no ha finalizado') })
  const declared = await seeded(
    [
      entry,
      avance2([], () => declarationFormPage(STANDARD_ROWS)),
      post('pe_avance4', ADVANCE_ANSWERS.unchanged),
      avance5,
      avance6([], () => AT_SAMPLES),
      ...compliance(COMPLIANCE_FORM, COMPLIANCE_DECLARED),
    ],
    beyond,
  )
  const second = await runCertification(declared.deps, { declareCompliance: true })
  expect(second.stopped).toBe('done')
  expect(second.state.stage).toBe('done')
  expect(declared.steps().slice(-1)).toEqual(['CERT_DONE'])
  const still = await seeded(exchangeRoutes({ facade: { validarUsuario: { body: NOT_IN_EXCHANGE } } }), {
    ...beyond,
    stage: 'exchange',
  })
  await expect(runCertification(still.deps)).resolves.toMatchObject({ stopped: 'exchange' })
  // The declaration cannot be undone: without the explicit go the runner stops in front of it.
  const waiting = await seeded([entry, avance2([]), avance5, avance6([], () => AT_SAMPLES)], beyond)
  const held = await runCertification(waiting.deps)
  expect(held).toMatchObject({ stopped: 'compliance', state: { stage: 'compliance' } })
  expect(waiting.urls().some((url) => url.endsWith('pe_avance7'))).toBe(false)
  const asked = await seeded([entry, avance2([]), avance5, avance6([], () => AT_SAMPLES)], beyond)
  await expect(
    runCertification(asked.deps, { until: 'printedSamples', declareCompliance: true }),
  ).resolves.toMatchObject({ stopped: 'until' })
})

test('what stops a run: a refused declaration, a wait that times out, incomplete books', async () => {
  const sentState = stateWith({ plan, sets: allSets, cafs: certificationCafXmls() })
  const refused = await seeded(
    [entry, avance2([SETS_FORM]), post('pe_avance3', DECLARATION_ANSWERS.contentMismatch)],
    sentState,
  )
  await expect(runCertification(refused.deps)).resolves.toMatchObject({
    stopped: 'rejected',
    detail: 'contentMismatch',
  })
  const pending = progressPage('SET', { 'SET BASICO': 'EN REVISION' })
  const slow = await seeded(
    [
      entry,
      avance2([SETS_FORM, SETS_KEPT]),
      post('pe_avance3', DECLARATION_ANSWERS.success),
      avance5,
      avance6([], () => pending),
    ],
    sentState,
  )
  await expect(runCertification(slow.deps)).resolves.toMatchObject({ stopped: 'timedOut' })
  const { purchaseBook, ...noPurchase } = plan
  void purchaseBook
  const books = await seeded(
    [...history(), entry, avance2([], () => page('<tr><td><font>SET BASICO</font></td><td><b>x</b></td></tr>'))],
    stateWith({ plan: noPurchase, sets: {}, stage: 'books' }),
  )
  await expect(runCertification(books.deps)).resolves.toMatchObject({ stopped: 'incomplete' })
})

test('the simulation: a refused declaration, a rejected wait, a confirmed one skipped, and an unknown stage wording', async () => {
  const simulated = stateWith({
    plan,
    sets: allSets,
    stage: 'simulation',
    simulation: { trackId: '777', date: TODAY, sentAt: 'x' },
  })
  const refused = await seeded(
    [
      entry,
      avance2([page('x'), page('x'), SIM_FORM]),
      avance5,
      avance6([], () => IN_SIMULATION),
      post('pe_avance3', DECLARATION_ANSWERS.contentMismatch),
    ],
    simulated,
  )
  await expect(runCertification(refused.deps)).resolves.toMatchObject({
    stopped: 'rejected',
    detail: 'contentMismatch',
  })
  const rejected = await seeded(
    [
      entry,
      avance2([page('x'), page('x'), SIM_FORM, SIM_KEPT]),
      avance5,
      avance6([IN_SIMULATION], () => progressPage('SIMULACION', { 'SET SIMULACION': 'RECHAZADO' })),
      post('pe_avance3', DECLARATION_ANSWERS.success),
    ],
    simulated,
  )
  await expect(runCertification(rejected.deps)).resolves.toMatchObject({ stopped: 'rejected', detail: 'RECHAZADO' })
  const confirmed = await seeded(exchangeRoutes({ facade: { validarUsuario: { body: NOT_IN_EXCHANGE } } }), {
    ...simulated,
    simulation: { ...simulated.simulation!, confirmed: true },
  })
  const skipped = await runCertification(confirmed.deps)
  expect(skipped).toMatchObject({ stopped: 'exchange' })
  expect(skipped.state.stage).toBe('exchange')
  const unknown = await seeded(
    [
      ...history(),
      entry,
      avance2([BOOKS_APPROVED]),
      post('pe_avance4', ADVANCE_ANSWERS.advanced),
      avance5,
      avance6([], () => progressPage('ALGO NUEVO', {})),
    ],
    stateWith({ plan, sets: allSets, stage: 'books' }),
  )
  const forced = await runCertification(unknown.deps, { until: 'books' })
  expect(forced).toMatchObject({ stopped: 'until' })
  expect(forced.state.stage).toBe('simulation')
})

test('an error of a step is reported and rethrown; the company comes from the issuer when the client names none', async () => {
  const harness = await certificationHarness([get('pe_generar', NOT_ENROLLED, NOT_ENROLLED)])
  const error = await failure(runCertification(harness.deps))
  expect(error.details).toMatchObject({ rejection: 'notEnrolled' })
  expect(harness.steps()).toEqual(['SETS_DOWNLOADING', 'CERT_ERROR'])
  expect(await harness.store.load()).toBeNull()
  const nameless = { ...harness.deps, portal: { ...harness.deps.portal, companyRut: null } }
  expect((await failure(runCertification(nameless))).details).toEqual({ field: 'companyRut' })
})

test('a refusal without a sentence stops with the outcome itself; a run already done or at compliance', async () => {
  const sentState = stateWith({ plan, sets: allSets, cafs: certificationCafXmls() })
  const empty = await seeded(
    [entry, avance2([SETS_FORM, SETS_FORM]), post('pe_avance3', DECLARATION_ANSWERS.success)],
    sentState,
  )
  await expect(runCertification(empty.deps)).resolves.toMatchObject({
    stopped: 'rejected',
    detail: 'notSaved: basic, guide, exempt, purchase',
  })
  const simulated = stateWith({
    plan,
    sets: allSets,
    stage: 'simulation',
    simulation: { trackId: '777', date: TODAY, sentAt: 'x' },
  })
  const never = await seeded(
    [
      entry,
      avance2([page('x')], () => SIM_FORM),
      avance5,
      avance6([], () => IN_SIMULATION),
      post('pe_avance3', ...repeat(DECLARATION_ANSWERS.notProcessed, 10)),
    ],
    simulated,
  )
  await expect(runCertification(never.deps)).resolves.toMatchObject({
    stopped: 'rejected',
    detail: 'notSaved: simulation',
  })
  const confirmed = await seeded([entry, avance2([]), avance5, avance6([], () => AT_EXCHANGE)], {
    ...simulated,
    simulation: { ...simulated.simulation!, confirmed: true },
  })
  await expect(runCertification(confirmed.deps, { until: 'simulation' })).resolves.toMatchObject({
    stopped: 'until',
    state: { stage: 'exchange' },
  })
  const done = await seeded([], stateWith({ stage: 'done' }))
  await expect(runCertification(done.deps)).resolves.toMatchObject({ stopped: 'done' })
  expect(done.urls()).toEqual([])
  const atCompliance = await seeded(
    [
      entry,
      avance2([], () => declarationFormPage(STANDARD_ROWS)),
      post('pe_avance4', ADVANCE_ANSWERS.unchanged),
      avance5,
      avance6([], () => AT_SAMPLES),
      ...compliance(COMPLIANCE_FORM, COMPLIANCE_DECLARED),
    ],
    stateWith({ stage: 'compliance', blocked: 'antes' }),
  )
  const finished = await runCertification(atCompliance.deps, { declareCompliance: true })
  expect(finished.stopped).toBe('done')
  expect(finished.state.blocked).toBeUndefined()
})

test('the exchange answered and confirmed, then the samples: none stops the run, a list or a function submits them, a block or a rejection stops', async () => {
  const confirmedSimulation = stateWith({
    plan,
    sets: allSets,
    stage: 'exchange',
    simulation: { trackId: '777', date: TODAY, sentAt: 'x', confirmed: true },
  })
  const review = (first: string, second: string) => ({
    leeImpreso: (call: number) => ({ body: call === 1 ? first : second }),
    creaLista: { body: CREATED_REVIEW },
  })
  const none = await seeded(exchangeRoutes(), confirmedSimulation)
  const atSamples = await runCertification(none.deps)
  expect(atSamples).toMatchObject({
    stopped: 'printedSamples',
    state: { stage: 'printedSamples', exchange: { confirmed: true, documents: 2 } },
  })
  expect(none.steps().slice(-1)).toEqual(['INTERCAMBIO_DONE'])
  const pdf = { fileName: 'muestra_33_1.pdf', bytes: new Uint8Array([0x25]) }
  const listed = await seeded(
    samplesRoutes({ service: review(EMPTY_OK, reviewAnswer('ENVIADO AL SII')) }),
    atSamples.state,
  )
  await expect(runCertification(listed.deps, { samples: [pdf] })).resolves.toMatchObject({
    stopped: 'compliance',
    state: { stage: 'compliance', samples: { state: 'ENVIADO AL SII', uploaded: ['muestra_33_1.pdf'] } },
  })
  const byFunction = await seeded(
    samplesRoutes({ service: review(reviewAnswer('INGRESO'), reviewAnswer('POR REVISAR')) }),
    atSamples.state,
  )
  await expect(
    runCertification(byFunction.deps, { samples: async () => [pdf], until: 'printedSamples' }),
  ).resolves.toMatchObject({ stopped: 'until', state: { stage: 'compliance' } })
  const blocked = await seeded(samplesRoutes({ service: { leeImpreso: { body: SAMPLES_BLOCKED } } }), atSamples.state)
  await expect(runCertification(blocked.deps, { samples: [pdf] })).resolves.toMatchObject({
    stopped: 'blocked',
    detail: expect.stringContaining('DOCUMENTOS IMPRESOS'),
  })
  const rejected = await seeded(
    samplesRoutes({
      service: {
        ...review(reviewAnswer('RECHAZADO'), reviewAnswer('RECHAZADO')),
        muestraMail: { body: detailAnswer([]) },
      },
    }),
    atSamples.state,
  )
  await expect(runCertification(rejected.deps, { samples: [pdf] })).resolves.toMatchObject({
    stopped: 'rejected',
    detail: expect.stringContaining('rejected the printed samples'),
  })
  // The set given by hand skips the download; a set that cannot be downloaded names the artefact to fill.
  const given = await seeded(exchangeRoutes({ download: new Error('never') }), confirmedSimulation)
  await expect(
    runCertification(given.deps, { exchangeSetXml: exchangeSetXml(), until: 'exchange' }),
  ).resolves.toMatchObject({ stopped: 'until', state: { stage: 'printedSamples' } })
  const unavailable = await seeded(exchangeRoutes({ download: { body: '<html>ERROR</html>' } }), confirmedSimulation)
  await expect(runCertification(unavailable.deps)).resolves.toMatchObject({
    stopped: 'exchange',
    detail: 'intercambio/set-intercambio.xml',
  })
  // An exchange confirmed in a state still at the exchange moves on without the portal.
  const edited = await seeded([], { ...confirmedSimulation, exchange: atSamples.state.exchange })
  await expect(runCertification(edited.deps)).resolves.toMatchObject({
    stopped: 'printedSamples',
    state: { stage: 'printedSamples' },
  })
  expect(edited.urls()).toEqual([])
})
