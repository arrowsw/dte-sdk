import {
  declareComplianceFinal,
  declareSimulation,
  sendSimulation,
  waitForSimulationApproval,
} from '../../src/certification/steps'
import { fullPlan } from '../support/certification-fixtures'
import {
  certificationHarness,
  estUp,
  estUpRoute,
  get,
  MAULLIN,
  post,
  reception,
  repeat,
  sequence,
  stampingRoutes,
  stateWith,
  TODAY,
  uploadRoute,
} from '../support/certification-harness'
import {
  ADVANCE_ANSWERS,
  COMPLIANCE_BLOCKED,
  COMPLIANCE_DECLARED,
  COMPLIANCE_ENTRY,
  COMPLIANCE_FORM,
  COMPLIANCE_UNCONFIRMED,
  DECLARATION_ANSWERS,
  declarationFormPage,
  progressPage,
  STANDARD_ROWS,
} from '../support/certification-pages'
import { failure } from '../support/portal'
import { page } from '../support/portal-pages'

const plan = fullPlan()
const entry = get('pe_avance1', ...repeat(page('entry'), 200))
const avance5 = get('pe_avance5', ...repeat(page('p5'), 100))
const simulation = { trackId: '777', date: TODAY, sentAt: 'x' }
const simRow = (value = '') => [{ label: 'SET DE SIMULACION', index: 1, value }, ...STANDARD_ROWS.slice(1)]
const SIM_FORM = declarationFormPage(simRow())
const SIM_KEPT = declarationFormPage(simRow('777'))
const avance2 = (pages: readonly string[], fallback: (call: number) => string = () => SIM_KEPT) => ({
  url: `${MAULLIN}/pe_avance2`,
  method: 'POST' as const,
  reply: sequence(pages, fallback),
})
const avance6 = (pages: readonly string[], fallback: (call: number) => string) => ({
  url: `${MAULLIN}/pe_avance6`,
  method: 'POST' as const,
  reply: sequence(pages, fallback),
})
const AT_EXCHANGE = progressPage('INTERCAMBIO', { 'SET SIMULACION': 'REVISADO CONFORME' })
const IN_SIMULATION = progressPage('SIMULACION', { 'SET SIMULACION': 'EN REVISION' })

describe('sendSimulation', () => {
  test('fresh CAFs for every type, one envelope with every case, the artefacts, the send', async () => {
    const harness = await certificationHarness([...stampingRoutes(), uploadRoute(reception('777'))])
    const result = await sendSimulation(harness.deps, stateWith({ plan, cafs: [] }))
    expect(result.outcome).toBe('sent')
    expect(result.state.simulation).toEqual({ trackId: '777', date: TODAY, sentAt: '2026-11-15T18:30:00.000Z' })
    expect(result.state.cafs).toHaveLength(6)
    expect(result.state.usedFolios.length).toBeGreaterThan(10)
    const names = await harness.store.listArtefacts()
    expect(names).toContain('simulacion/envio-simulacion.xml')
    expect(names).toContain('simulacion/dtes/dte-33-000001.xml')
    expect(harness.steps().filter((step) => step === 'CAF_OK')).toHaveLength(6)
    expect(harness.steps().slice(-2)).toEqual(['SIM_SENDING', 'SIM_OK'])
    expect(harness.events[0]).toEqual({ step: 'SIM_START' })
  })

  test('the sets’ CAFs are never reused, and a failed send still marks the folios', async () => {
    const harness = await certificationHarness([...stampingRoutes(), uploadRoute({ status: 500, body: 'down' })])
    const before = stateWith({ plan, cafs: [] })
    const error = await failure(sendSimulation(harness.deps, before))
    expect(error.code).toBe('SII_HTTP_ERROR')
    const saved = (await harness.store.load())!
    expect(saved.simulation).toBeUndefined()
    expect(saved.cafs).toHaveLength(6)
    expect(saved.usedFolios.length).toBeGreaterThan(10)
    const stats = await harness.registry.stats({ companyRut: '76543210-3', type: 33, environment: 'certification' })
    expect(stats.totalSent).toBe(plan.basic!.invoices.length)
    expect((await failure(sendSimulation(harness.deps, stateWith()))).details).toEqual({ field: 'plan' })
  })
})

describe('declareSimulation', () => {
  test('already at the exchange: nothing to declare', async () => {
    const harness = await certificationHarness([
      entry,
      avance2([page('x')]),
      avance5,
      avance6([AT_EXCHANGE], () => AT_EXCHANGE),
    ])
    const result = await declareSimulation(harness.deps, stateWith({ simulation, stage: 'simulation' }))
    expect(result).toMatchObject({ outcome: 'skipped', detail: 'INTERCAMBIO' })
    expect(result.state.stage).toBe('exchange')
    expect(harness.steps()).toEqual([])
  })

  test('declared with the simulation flag: every row empty is retried', async () => {
    const harness = await certificationHarness([
      entry,
      avance2([page('x'), SIM_FORM, SIM_FORM, SIM_FORM, SIM_KEPT]),
      avance5,
      avance6([IN_SIMULATION], () => IN_SIMULATION),
      post('pe_avance3', DECLARATION_ANSWERS.success, DECLARATION_ANSWERS.success),
    ])
    const result = await declareSimulation(harness.deps, stateWith({ simulation }))
    expect(result.outcome).toBe('accepted')
    expect(result.state.lastDeclaration).toMatchObject({ scope: 'simulation', outcome: 'accepted' })
    expect(harness.sleeps).toEqual([10000, 5000])
    expect(harness.steps()).toEqual(['SIM_DECLARING', 'POLLING', 'POLLING'])
    expect(await harness.store.listArtefacts()).toContain('declaracion-simulacion-2.html')
    expect((await failure(declareSimulation(harness.deps, stateWith()))).details).toEqual({ field: 'simulation' })
  })
})

describe('waitForSimulationApproval', () => {
  const reading = (
    progress: readonly string[],
    fallback: string,
    more: readonly string[] = [],
    extra: Parameters<typeof certificationHarness>[0] = [],
  ) =>
    certificationHarness([
      entry,
      avance2([page('x'), ...more], () => page('x')),
      avance5,
      avance6(progress, () => fallback),
      ...extra,
    ])

  test('the exchange reached on the first poll: done at once', async () => {
    const harness = await reading([AT_EXCHANGE], AT_EXCHANGE)
    const result = await waitForSimulationApproval(harness.deps, stateWith({ simulation, stage: 'simulation' }))
    expect(result.outcome).toBe('done')
    expect(result.state).toMatchObject({ stage: 'exchange', simulation: { ...simulation, confirmed: true } })
    expect(harness.sleeps).toEqual([])
    expect(harness.steps()).toEqual(['POLLING', 'SIM_DONE'])
  })

  test('an approved simulation awaiting its confirmation is declared once more', async () => {
    const offer = progressPage('SIMULACION', { 'SET SIMULACION': 'REVISADO CONFORME' }, { confirm: true })
    const harness = await certificationHarness([
      entry,
      avance2([page('x'), SIM_FORM, SIM_KEPT, page('x')], () => page('x')),
      avance5,
      avance6([offer, AT_EXCHANGE], () => AT_EXCHANGE),
      post('pe_avance3', DECLARATION_ANSWERS.success),
    ])
    const result = await waitForSimulationApproval(harness.deps, stateWith({ simulation }))
    expect(result.outcome).toBe('confirmed')
    expect(result.state).toMatchObject({ stage: 'exchange', simulation: { confirmed: true } })
    expect(harness.posted('pe_avance3')[0]).toMatchObject({ NUM_ENV1: '777' })
    expect(harness.sleeps).toEqual([])
  })

  test('a confirmation the portal does not take yet is polled again', async () => {
    const offer = progressPage('SIMULACION', { 'SET SIMULACION': 'EN REVISION' }, { confirm: true })
    const harness = await certificationHarness([
      entry,
      avance2([page('x'), SIM_FORM, SIM_KEPT, page('x'), page('x')], () => page('x')),
      avance5,
      avance6([offer, offer, AT_EXCHANGE], () => AT_EXCHANGE),
      post('pe_avance3', DECLARATION_ANSWERS.success),
    ])
    const result = await waitForSimulationApproval(harness.deps, stateWith({ simulation }))
    expect(result.outcome).toBe('done')
    expect(harness.sleeps).toEqual([10000])
  })

  test('the state of the simulation row: approved is done, rejected stops', async () => {
    const approved = await reading([progressPage('SIMULACION', { 'SET SIMULACION': 'REVISADO CONFORME' })], AT_EXCHANGE)
    await expect(waitForSimulationApproval(approved.deps, stateWith({ simulation }))).resolves.toMatchObject({
      outcome: 'done',
    })
    const rejected = await reading(
      [progressPage('SIMULACION', { 'SET SIMULACION': 'ENVIO CON ERRORES O REPAROS' })],
      AT_EXCHANGE,
    )
    await expect(waitForSimulationApproval(rejected.deps, stateWith({ simulation }))).resolves.toMatchObject({
      outcome: 'rejected',
      detail: 'ENVIO CON ERRORES O REPAROS',
    })
  })

  test('thirty polls, then the SOAP status decides: rejected, pending, or unreachable', async () => {
    const rejected = await reading([], IN_SIMULATION, [], [estUpRoute(estUp('RFR', '777'))])
    const result = await waitForSimulationApproval(rejected.deps, stateWith({ simulation }))
    expect(result).toMatchObject({ outcome: 'rejected', detail: 'RFR: Envio Procesado' })
    expect(result.state.diagnosis?.['777']).toMatchObject({ code: 'RFR', status: 'rejected' })
    expect(rejected.sleeps).toHaveLength(30)
    expect(rejected.steps().filter((step) => step === 'POLLING')).toHaveLength(30)
    const pending = await reading([], IN_SIMULATION, [], [estUpRoute(estUp('LSO', '777'))])
    await expect(waitForSimulationApproval(pending.deps, stateWith({ simulation }))).resolves.toMatchObject({
      outcome: 'timedOut',
    })
    const down = await reading([], IN_SIMULATION, [], [estUpRoute({ status: 500, body: 'down' })])
    await expect(waitForSimulationApproval(down.deps, stateWith({ simulation }))).resolves.toMatchObject({
      outcome: 'timedOut',
    })
    expect((await failure(waitForSimulationApproval(down.deps, stateWith()))).details).toEqual({ field: 'simulation' })
  })
})

describe('declareComplianceFinal', () => {
  const routes = (second: string, third?: string, final?: string) => [
    entry,
    avance2([], () => declarationFormPage(STANDARD_ROWS)),
    post('pe_avance4', ADVANCE_ANSWERS.unchanged),
    avance5,
    avance6([], () => progressPage('DOCUMENTOS IMPRESOS', {})),
    get('pe_avance7', COMPLIANCE_ENTRY),
    post('pe_avance8', second, ...(third === undefined ? [] : [third])),
    ...(final === undefined ? [] : [post('pe_avance9', final)]),
  ]

  test('declared: the run is done and a previous block is forgotten', async () => {
    const harness = await certificationHarness(routes(COMPLIANCE_FORM, undefined, COMPLIANCE_DECLARED))
    const result = await declareComplianceFinal(harness.deps, stateWith({ stage: 'printedSamples', blocked: 'antes' }))
    expect(result).toMatchObject({ outcome: 'declared', detail: 'Su Declaración de Cumplimiento ha sido efectuada' })
    expect(result.state.stage).toBe('done')
    expect(result.state.blocked).toBeUndefined()
    expect(harness.steps()).toEqual(['ADVANCE_WAITING', 'ADVANCE_DONE', 'CERT_DONE'])
    expect(await harness.store.load()).toEqual(result.state)
  })

  test('blocked: the sentence stays in the state', async () => {
    const harness = await certificationHarness(routes(COMPLIANCE_BLOCKED))
    const result = await declareComplianceFinal(harness.deps, stateWith({ stage: 'printedSamples' }))
    expect(result.outcome).toBe('blocked')
    expect(result.state).toMatchObject({ stage: 'compliance', blocked: expect.stringContaining('no ha finalizado') })
  })

  test('a final page that does not confirm is unexpected', async () => {
    const harness = await certificationHarness(routes(COMPLIANCE_FORM, undefined, COMPLIANCE_UNCONFIRMED))
    const error = await failure(declareComplianceFinal(harness.deps, stateWith({ stage: 'printedSamples' })))
    expect(error.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect(error.details).toMatchObject({ step: 'pe_avance9' })
  })
})
