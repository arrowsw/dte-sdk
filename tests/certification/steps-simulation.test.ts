import {
  declareComplianceFinal,
  declareSimulation,
  sendSimulation,
  waitForSimulationApproval,
} from '../../src/certification/steps'
import { fullPlan } from '../support/certification-fixtures'
import {
  cafXml,
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
import { DteError } from '../../src/errors'
import type { FakeRoute } from '../support/fake-sii'
import { failure } from '../support/portal'
import { page, quotaForm, STAMP_ENTRY } from '../support/portal-pages'

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

// Every CAF the SII stamps and nobody issues with counts against the next request, so an attempt that stamped some
// types and stopped must not leave them behind: the next one issues with them.
describe('a simulation that is tried again', () => {
  // The stamping pages of `stampingRoutes`, with a range of its own for each CAF and one failure for a type.
  const stamping = (failOnce?: number): FakeRoute[] => {
    const box = { type: 33, failed: false, serial: 0 }
    return [
      { url: `${MAULLIN}/of_solicita_folios`, method: 'GET', reply: () => ({ body: STAMP_ENTRY }) },
      {
        url: `${MAULLIN}/of_solicita_folios_dcto`,
        method: 'POST',
        reply: (request) => {
          const type = /COD_DOCTO=(\d+)/.exec(request.text)
          if (type !== null) box.type = Number(type[1])
          return { body: quotaForm(undefined, undefined, box.type) }
        },
      },
      {
        url: `${MAULLIN}/of_confirma_folio`,
        method: 'POST',
        reply: () => {
          if (box.type === failOnce && !box.failed) {
            box.failed = true
            return { body: page('otra cosa') }
          }
          box.serial += 1
          return { body: cafXml(box.type, { from: box.serial * 1000 + 1, to: box.serial * 1000 + 100 }) }
        },
      },
    ]
  }
  const typesAsked = (harness: Awaited<ReturnType<typeof certificationHarness>>): readonly string[] => [
    ...new Set(harness.posted('of_solicita_folios_dcto').map((form) => form.COD_DOCTO)),
  ]
  const requests = (harness: Awaited<ReturnType<typeof certificationHarness>>): number =>
    harness.posted('of_confirma_folio').length

  test('the CAFs of an attempt that never got to send are in hand at the next one, which asks only for the rest', async () => {
    const harness = await certificationHarness([...stamping(61), uploadRoute(reception('777'))])
    const first = await failure(sendSimulation(harness.deps, stateWith({ plan, cafs: [] })))
    expect(first.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect(first.details).toMatchObject({ operation: 'requestCafExact', step: 'of_confirma_folio' })
    const stopped = (await harness.store.load())!
    expect(typesAsked(harness)).toEqual(['33', '34', '46', '52', '56', '61'])
    expect(stopped.simulationCafs).toHaveLength(5)
    expect(stopped.cafs).toEqual(stopped.simulationCafs)
    expect(stopped.usedFolios).toEqual([])
    const before = requests(harness)

    const second = await sendSimulation(harness.deps, stopped)
    expect(second.outcome).toBe('sent')
    // One more request, for the type that was missing; the five CAFs in hand are the ones issued with.
    expect(requests(harness) - before).toBe(1)
    expect(second.state.cafs).toHaveLength(6)
    const stats = await harness.registry.stats({ companyRut: '76543210-3', type: 33, environment: 'certification' })
    expect(stats.ranges.map((range) => [range.from, range.sent])).toEqual([[1001, plan.basic!.invoices.length]])
    // Sent with, so no longer in hand.
    expect(second.state.simulationCafs).toEqual([])
  })

  test('once a send was tried the CAFs are spent, as the folios are: the next attempt asks for new ones', async () => {
    const harness = await certificationHarness([
      ...stamping(),
      uploadRoute({ status: 500, body: 'down' }, reception('777')),
    ])
    await failure(sendSimulation(harness.deps, stateWith({ plan, cafs: [] })))
    const failed = (await harness.store.load())!
    expect(failed.simulationCafs).toEqual([])
    expect(requests(harness)).toBe(6)
    const second = await sendSimulation(harness.deps, failed)
    expect(second.outcome).toBe('sent')
    expect(requests(harness)).toBe(12)
    expect(second.state.cafs).toHaveLength(12)
  })

  test('the CAFs of the sets are still never the simulation’s', async () => {
    const harness = await certificationHarness([...stamping(), uploadRoute(reception('777'))])
    const sets = [33, 34, 46, 52, 56, 61].map((type) => cafXml(type, { from: 1, to: 100 }))
    const result = await sendSimulation(harness.deps, stateWith({ plan, cafs: sets }))
    expect(requests(harness)).toBe(6)
    expect(result.state.cafs).toHaveLength(12)
    const stats = await harness.registry.stats({ companyRut: '76543210-3', type: 33, environment: 'certification' })
    expect(stats.ranges.map((range) => range.from)).toEqual([1001])
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

  test('only the exchange is skipped: a later step is declared like any other', async () => {
    const later = progressPage('DOCUMENTOS IMPRESOS', { 'SET SIMULACION': 'REVISADO CONFORME' })
    const harness = await certificationHarness([
      entry,
      avance2([page('x')], () => SIM_KEPT),
      avance5,
      avance6([later], () => later),
      post('pe_avance3', DECLARATION_ANSWERS.success),
    ])
    const result = await declareSimulation(harness.deps, stateWith({ simulation }))
    expect(result.outcome).toBe('accepted')
    expect(harness.steps()).toEqual(['SIM_DECLARING', 'POLLING'])
    expect(harness.posted('pe_avance3')[0]).toMatchObject({ NUM_ENV1: '777' })
  })

  test('a progress page that cannot be read before the declaration does not stop it: the simulation is declared', async () => {
    const harness = await certificationHarness([
      entry,
      avance2([page('x')], () => SIM_KEPT),
      avance5,
      {
        url: `${MAULLIN}/pe_avance6`,
        method: 'POST',
        reply: [new DteError('TRANSPORT_FAILED', { reason: 'socket hang up' })],
      },
      post('pe_avance3', DECLARATION_ANSWERS.success),
    ])
    const result = await declareSimulation(harness.deps, stateWith({ simulation }))
    expect(result.outcome).toBe('accepted')
    expect(harness.steps()).toEqual(['SIM_DECLARING', 'POLLING'])
    expect(harness.posted('pe_avance3')[0]).toMatchObject({ NUM_ENV1: '777' })
    expect(harness.warnings()).toContain('certification progress before the simulation failed')
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

  test('an approved row reads the page once more for the stage it left the application in', async () => {
    const approved = progressPage('SIMULACION', { 'SET SIMULACION': 'REVISADO CONFORME' })
    const harness = await reading([approved], AT_EXCHANGE)
    const result = await waitForSimulationApproval(harness.deps, stateWith({ simulation }))
    expect(result).toMatchObject({ outcome: 'done', state: { stage: 'exchange' } })
    expect(harness.urls().filter((url) => url.endsWith('pe_avance6'))).toHaveLength(2)
    const unreadable = await certificationHarness([
      entry,
      avance2([page('x')], () => page('x')),
      avance5,
      {
        url: `${MAULLIN}/pe_avance6`,
        method: 'POST',
        reply: [{ body: approved }, new DteError('TRANSPORT_FAILED', { reason: 'socket hang up' })],
      },
    ])
    await expect(waitForSimulationApproval(unreadable.deps, stateWith({ simulation }))).resolves.toMatchObject({
      outcome: 'done',
      state: { stage: 'exchange' },
    })
  })

  test('a read that fails only uses up its attempt', async () => {
    const harness = await certificationHarness([
      entry,
      avance2([], () => page('x')),
      avance5,
      {
        url: `${MAULLIN}/pe_avance6`,
        method: 'POST',
        reply: [new DteError('TRANSPORT_FAILED', { reason: 'socket hang up' }), { body: AT_EXCHANGE }],
      },
    ])
    const result = await waitForSimulationApproval(harness.deps, stateWith({ simulation }))
    expect(result.outcome).toBe('done')
    expect(harness.sleeps).toEqual([10000])
    expect(harness.steps()).toEqual(['POLLING', 'POLLING', 'SIM_DONE'])
    expect(harness.warnings()).toContain('certification simulation read failed')
  })

  test('objections alone reject the simulation, a date that does not match keeps the wait going', async () => {
    const objections = await reading([progressPage('SIMULACION', { 'SET SIMULACION': 'CON REPAROS' })], AT_EXCHANGE)
    await expect(waitForSimulationApproval(objections.deps, stateWith({ simulation }))).resolves.toMatchObject({
      outcome: 'rejected',
      detail: 'CON REPAROS',
    })
    const mismatch = await reading(
      [],
      progressPage('SIMULACION', { 'SET SIMULACION': 'FECHA NO CORRESPONDE' }),
      [],
      [estUpRoute(estUp('LSO', '777'))],
    )
    await expect(waitForSimulationApproval(mismatch.deps, stateWith({ simulation }))).resolves.toMatchObject({
      outcome: 'timedOut',
    })
    expect(mismatch.sleeps).toHaveLength(30)
  })

  test('a confirmation the portal does not take leaves the page to be judged as it is', async () => {
    const offer = progressPage('SIMULACION', { 'SET SIMULACION': 'REVISADO CONFORME' }, { confirm: true })
    const harness = await certificationHarness([
      entry,
      avance2([page('x'), SIM_FORM], () => page('x')),
      avance5,
      avance6([offer], () => AT_EXCHANGE),
      post('pe_avance3', DECLARATION_ANSWERS.plainError),
    ])
    const result = await waitForSimulationApproval(harness.deps, stateWith({ simulation }))
    expect(result.outcome).toBe('done')
    expect(harness.sleeps).toEqual([])
    const broken = await certificationHarness([
      entry,
      avance2([page('x'), SIM_FORM], () => page('x')),
      avance5,
      avance6([offer], () => AT_EXCHANGE),
      {
        url: `${MAULLIN}/pe_avance3`,
        method: 'POST',
        reply: [new DteError('TRANSPORT_FAILED', { reason: 'socket hang up' })],
      },
    ])
    await expect(waitForSimulationApproval(broken.deps, stateWith({ simulation }))).resolves.toMatchObject({
      outcome: 'done',
    })
  })

  test('after a confirmation, the exchange, a row approved or no form left all count; none of them keeps waiting', async () => {
    const offer = (state: string, stage = 'SIMULACION') =>
      progressPage(stage, { 'SET SIMULACION': state }, { confirm: true })
    const confirmed = async (after: string) => {
      const harness = await certificationHarness([
        entry,
        avance2([page('x'), SIM_FORM, SIM_KEPT], () => page('x')),
        avance5,
        avance6([offer('EN REVISION'), after], () => after),
        post('pe_avance3', DECLARATION_ANSWERS.success),
      ])
      return waitForSimulationApproval(harness.deps, stateWith({ simulation }))
    }
    await expect(confirmed(offer('EN REVISION', 'INTERCAMBIO'))).resolves.toMatchObject({ outcome: 'confirmed' })
    await expect(confirmed(offer('REVISADO CONFORME'))).resolves.toMatchObject({ outcome: 'confirmed' })
    await expect(confirmed(progressPage('SIMULACION', { 'SET SIMULACION': 'EN REVISION' }))).resolves.toMatchObject({
      outcome: 'confirmed',
    })
  })

  test('a page with no row for the simulation is waited on', async () => {
    const rowless = await reading(
      [progressPage('SIMULACION', {})],
      progressPage('SIMULACION', {}),
      [],
      [estUpRoute(estUp('LSO', '777'))],
    )
    await expect(waitForSimulationApproval(rowless.deps, stateWith({ simulation }))).resolves.toMatchObject({
      outcome: 'timedOut',
    })
    expect(rowless.sleeps).toHaveLength(30)
  })

  test('a confirmation followed by a read that fails counts as confirmed', async () => {
    const offer = progressPage('SIMULACION', { 'SET SIMULACION': 'REVISADO CONFORME' }, { confirm: true })
    const harness = await certificationHarness([
      entry,
      avance2([page('x'), SIM_FORM, SIM_KEPT], () => page('x')),
      avance5,
      {
        url: `${MAULLIN}/pe_avance6`,
        method: 'POST',
        reply: [{ body: offer }, new DteError('TRANSPORT_FAILED', { reason: 'socket hang up' })],
      },
      post('pe_avance3', DECLARATION_ANSWERS.success),
    ])
    const result = await waitForSimulationApproval(harness.deps, stateWith({ simulation }))
    expect(result).toMatchObject({ outcome: 'confirmed', state: { stage: 'exchange' } })
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
  const routes = (
    second: string,
    third?: string,
    final?: string,
    advance: FakeRoute['reply'] = [{ body: ADVANCE_ANSWERS.unchanged }],
  ) => [
    entry,
    avance2([], () => declarationFormPage(STANDARD_ROWS)),
    { url: `${MAULLIN}/pe_avance4`, method: 'POST' as const, reply: advance },
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
    // The advance of the closing reads no stage, so it emits no progress event.
    expect(harness.steps()).toEqual(['CERT_DONE'])
    expect(await harness.store.load()).toEqual(result.state)
  })

  test('the advance is one post to pe_avance4 and no read of the progress after it', async () => {
    const harness = await certificationHarness(routes(COMPLIANCE_FORM, undefined, COMPLIANCE_DECLARED))
    await declareComplianceFinal(harness.deps, stateWith({ stage: 'printedSamples' }))
    expect(harness.urls().map((url) => url.split('/').pop())).toEqual([
      'pe_avance1',
      'pe_avance2',
      'pe_avance4',
      'pe_avance7',
      'pe_avance8',
      'pe_avance9',
    ])
  })

  test('an advance that fails or throws is only logged, and the compliance is declared all the same', async () => {
    const refused = await certificationHarness(
      routes(COMPLIANCE_FORM, undefined, COMPLIANCE_DECLARED, [{ body: ADVANCE_ANSWERS.failed }]),
    )
    const first = await declareComplianceFinal(refused.deps, stateWith({ stage: 'printedSamples' }))
    expect(first.outcome).toBe('declared')
    expect(refused.steps()).toEqual(['CERT_DONE'])
    expect(refused.warnings()).toContain('certification final advance not applied')
    const broken = await certificationHarness(
      routes(COMPLIANCE_FORM, undefined, COMPLIANCE_DECLARED, [new DteError('TRANSPORT_FAILED', { reason: 'down' })]),
    )
    const second = await declareComplianceFinal(broken.deps, stateWith({ stage: 'printedSamples' }))
    expect(second.outcome).toBe('declared')
    expect(broken.warnings()).toContain('certification final advance not applied')
    expect(broken.posted('pe_avance9')).toHaveLength(1)
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
