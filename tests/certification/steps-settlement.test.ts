import { runBooks } from '../../src/certification/books-step'
import { prepareFolios, setFolioNeeds } from '../../src/certification/folios-step'
import { runCertification } from '../../src/certification/runner'
import { planCertificationSets } from '../../src/certification/set-plan'
import { parseTestSetText } from '../../src/certification/set-text'
import type { SentSet } from '../../src/certification/state'
import { declareTestSets, sendTestSet, waitForTestSetsApproval } from '../../src/certification/steps'
import { classifyDeclarationAnswer, parseProgressPage } from '../../src/portal/pages/certification-progress'
import {
  cafXml,
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
  bookHistoryPage,
  DECLARATION_ANSWERS,
  declarationFormPage,
  progressPage,
  type DeclarationRowSpec,
  SET_ENTRY,
  setDownloadPage,
  setGenerationForm,
  STANDARD_ROWS,
} from '../support/certification-pages'
import type { FakeRoute } from '../support/fake-sii'
import { page } from '../support/portal-pages'
import { FULL_SET_TEXT, GUIDE_SET_TEXT, SETTLEMENT_ATTENTION, SETTLEMENT_SET_TEXT } from '../support/test-set-samples'

const TEXT = `${FULL_SET_TEXT}\n${SETTLEMENT_SET_TEXT}`
const plan = planCertificationSets(parseTestSetText(TEXT))
const SETTLEMENT_ROW = { label: 'SET LIQUIDACION FACTURA', index: 8 }
// The checkboxes of the generation page, with the settlement set's own.
const OFFERED = ['SET03', 'SET06', 'SET07', 'SET08', 'SET09', 'SET11', 'SET15', 'SET72', 'SET84']
// The form counts every row of the portal in `TOTREG`, the ones already approved too.
const form = (rows: readonly DeclarationRowSpec[]): string => declarationFormPage(rows, { totreg: 12 })
const sent = (trackId: string): SentSet => ({ trackId, date: TODAY, sentAt: 'x', cases: [] })
const entry = get('pe_avance1', ...repeat(page('entry'), 400))
const avance2 = (pages: readonly string[], fallback: (call: number) => string): FakeRoute => ({
  url: `${MAULLIN}/pe_avance2`,
  method: 'POST',
  reply: sequence(pages, fallback),
})

describe('the settlement set in the steps', () => {
  test('its folios are asked for with the other sets, until it is sent', () => {
    expect(setFolioNeeds(plan, [])).toMatchObject({ 43: 4, 33: 3 })
    expect(setFolioNeeds(plan, ['settlement'])).not.toHaveProperty('43')
    expect(setFolioNeeds({ basic: plan.basic }, [])).not.toHaveProperty('43')
  })

  test('the folios step requests the CAF of type 43 the plan needs', async () => {
    const harness = await certificationHarness(stampingRoutes())
    const state = stateWith({ plan: { settlement: plan.settlement } })
    const result = await prepareFolios(harness.deps, state)
    expect(result.state.cafs).toHaveLength(1)
    expect(result.state.cafs[0]).toContain('<TD>43</TD>')
    expect(harness.events).toEqual([
      { step: 'CAF_REQUESTING', type: 43 },
      { step: 'CAF_OK', type: 43 },
    ])
  })

  test('sending it issues the four in one envelope, keeps the artefacts and records the send with each total', async () => {
    const harness = await certificationHarness([uploadRoute(reception('555'))])
    const result = await sendTestSet(harness.deps, stateWith({ plan, cafs: [cafXml(43)] }), { kind: 'settlement' })
    expect(result.outcome).toBe('sent')
    const settlement = result.state.sets.settlement!
    expect(settlement).toMatchObject({ trackId: '555', date: TODAY })
    expect(settlement.cases.map((c) => [c.caseId, c.type, c.folio])).toEqual([
      [`${SETTLEMENT_ATTENTION}-1`, 43, 1],
      [`${SETTLEMENT_ATTENTION}-2`, 43, 2],
      [`${SETTLEMENT_ATTENTION}-3`, 43, 3],
      [`${SETTLEMENT_ATTENTION}-4`, 43, 4],
    ])
    expect(settlement.cases[3].totals).toEqual({
      netAmount: 442085,
      exemptAmount: 409960,
      vatAmount: 83996,
      totalAmount: 937098,
    })
    expect(result.state.usedFolios).toEqual([1, 2, 3, 4].map((folio) => ({ type: 43, folio })))
    expect(await harness.store.listArtefacts()).toEqual([
      'sets-prueba/dtes/dte-43-000001.xml',
      'sets-prueba/dtes/dte-43-000002.xml',
      'sets-prueba/dtes/dte-43-000003.xml',
      'sets-prueba/dtes/dte-43-000004.xml',
      'sets-prueba/envio-set-liquidacion.xml',
    ])
    expect(harness.events).toEqual([
      { step: 'SET_START', set: 'settlement' },
      { step: 'SET_OK', set: 'settlement', trackId: '555' },
    ])
  })

  test('the declaration of the sets carries it on its row of the form', async () => {
    const rows = [...STANDARD_ROWS.slice(0, 4), SETTLEMENT_ROW]
    const kept = form(rows.map((row) => ({ ...row, value: row === SETTLEMENT_ROW ? '555' : '1' })))
    const harness = await certificationHarness([
      entry,
      post('pe_avance2', form(rows), kept),
      post('pe_avance3', DECLARATION_ANSWERS.success),
    ])
    const result = await declareTestSets(
      harness.deps,
      stateWith({ sets: { basic: sent('1'), settlement: sent('555') } }),
    )
    expect(result).toMatchObject({ outcome: 'accepted', success: true })
    expect(harness.posted('pe_avance3')[0]).toMatchObject({
      NUM_ENV1: '1',
      NUM_ENV8: '555',
      FEC_ENV8: '15-11-2026',
    })
  })

  test('the wait for approval reads its row, and a rejected settlement stops it', async () => {
    const progress = (state: string) =>
      progressPage('SET', { 'SET BASICO': 'REVISADO CONFORME', 'SET LIQUIDACION FACTURA': state })
    const routes = (...pages: readonly string[]) => [
      entry,
      post('pe_avance2', ...repeat(page('<p>x</p>'), pages.length)),
      get('pe_avance5', ...repeat(page('p5'), pages.length)),
      post('pe_avance6', ...pages),
    ]
    const sets = { basic: sent('1'), settlement: sent('555') }
    const waiting = await certificationHarness(routes(progress('EN REVISION'), progress('REVISADO CONFORME')))
    expect((await waitForTestSetsApproval(waiting.deps, stateWith({ sets }))).outcome).toBe('approved')
    expect(waiting.sleeps).toEqual([10000, 10000])
    const rejected = await certificationHarness(routes(progress('RECHAZADO')))
    expect(await waitForTestSetsApproval(rejected.deps, stateWith({ sets }))).toMatchObject({
      outcome: 'rejected',
      detail: 'settlement: RECHAZADO',
    })
  })

  test('the portal pages name its row: its state on the progress page, its objections in a declaration answer', () => {
    expect(parseProgressPage(progressPage('SET', { 'SET LIQUIDACION FACTURA': 'EN REVISION' })).states).toEqual({
      settlement: { text: 'EN REVISION', state: 'inReview' },
    })
    expect(
      classifyDeclarationAnswer(page('<p>SET LIQUIDACION FACTURA: ENVIO CON ERRORES O REPAROS</p>')).contentErrors,
    ).toEqual(['settlement'])
  })

  test('the books are declared together with it, so the portal keeps its row', async () => {
    const approved = page(
      `<table>${['LIBRO DE COMPRAS', 'LIBRO DE VENTAS', 'LIBRO DE GUIAS', 'LIBRO DE COMPRAS PARA EXENTOS']
        .map((name) => `<tr><td><font>${name}</font></td><td><b>REVISADO CONFORME</b></td></tr>`)
        .join('')}</table>`,
    )
    const rows = [{ label: 'SET BASICO', index: 1 }, SETTLEMENT_ROW]
    const harness = await certificationHarness([
      { url: `${UPL}/DTEauth?7`, reply: repeat({ body: page('auth') }, 10) },
      { url: `${UPL}/QEstLibro*`, reply: repeat({ body: bookHistoryPage([]) }, 4) },
      entry,
      avance2([approved, form(rows), form(rows.map((row) => ({ ...row, value: '9' })))], () => approved),
      post('pe_avance3', DECLARATION_ANSWERS.success),
    ])
    const state = stateWith({ plan, sets: { basic: sent('1'), settlement: sent('555') }, stage: 'books' })
    const result = await runBooks(harness.deps, state)
    expect(result.outcome).toBe('approved')
    expect(harness.posted('pe_avance3')[0]).toMatchObject({ NUM_ENV1: '1', NUM_ENV8: '555' })
  })
})

test('a run whose text holds the settlement set issues it after the others, declares it and waits for it', async () => {
  // The guide set and the settlement set only: seven documents keep the run short.
  const rows = [{ label: 'SET GUIA DE DESPACHO', index: 2 }, SETTLEMENT_ROW]
  const harness = await certificationHarness([
    get('pe_generar', SET_ENTRY),
    post('pe_generar1', setGenerationForm(OFFERED)),
    post('pe_generar2', setDownloadPage(`${GUIDE_SET_TEXT}\n${SETTLEMENT_SET_TEXT}`)),
    ...stampingRoutes(),
    uploadRoute(reception('2'), reception('5')),
    entry,
    avance2([form(rows), form(rows.map((row) => ({ ...row, value: String(row.index) })))], () => page('x')),
    post('pe_avance3', DECLARATION_ANSWERS.success),
    get('pe_avance5', page('p5')),
    post(
      'pe_avance6',
      progressPage('SET', { 'SET GUIA DESP.': 'REVISADO CONFORME', 'SET LIQUIDACION FACTURA': 'REVISADO CONFORME' }),
    ),
  ])
  const result = await runCertification(harness.deps, { until: 'testSets', optionalSets: ['SET03', 'SET84'] })
  expect(result.stopped).toBe('until')
  expect(result.state).toMatchObject({ stage: 'books', setsApproved: true })
  expect(Object.keys(result.state.plan!)).toEqual(['guide', 'settlement'])
  expect(Object.keys(result.state.sets)).toEqual(['guide', 'settlement'])
  expect(result.state.sets.settlement).toMatchObject({ trackId: '5', date: TODAY })
  expect(result.state.cafs.map((xml) => /<TD>(\d+)<\/TD>/.exec(xml)![1]).sort()).toEqual(['43', '52'])
  expect(harness.posted('pe_generar2')[0]).toMatchObject({ SET03: 'S', SET84: 'S' })
  expect(harness.posted('pe_avance3')[0]).toMatchObject({ NUM_ENV2: '2', NUM_ENV8: '5' })
  expect(harness.events.flatMap((event) => (event.step === 'SET_OK' ? [event.set] : []))).toEqual([
    'guide',
    'settlement',
  ])
})
