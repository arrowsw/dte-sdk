import { setFolioNeeds } from '../../src/certification/folios-step'
import { runCertification } from '../../src/certification/runner'
import { planCertificationSets } from '../../src/certification/set-plan'
import { parseTestSetText } from '../../src/certification/set-text'
import type { SentSet } from '../../src/certification/state'
import {
  checkExportSets,
  declareTestSets,
  sendSimulation,
  sendTestSet,
  waitForTestSetsApproval,
} from '../../src/certification/steps'
import { parseProgressPage } from '../../src/portal/pages/certification-progress'
import { renderPrintedSamples } from '../../src/pdf/samples'
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
  uploadRoute,
} from '../support/certification-harness'
import {
  DECLARATION_ANSWERS,
  declarationFormPage,
  progressPage,
  type DeclarationRowSpec,
  SET_ENTRY,
  setDownloadPage,
  setGenerationForm,
  STANDARD_ROWS,
} from '../support/certification-pages'
import { FIXED_NOW } from '../support/fixtures'
import { failure } from '../support/portal'
import { page } from '../support/portal-pages'
import { EXPORT_ATTENTION_1, EXPORT_ATTENTION_2, EXPORT_SET_TEXT, FULL_SET_TEXT } from '../support/test-set-samples'

// Six documents issued and signed per run, and their samples rendered: CI's coverage job runs several times slower.
jest.setTimeout(60_000)

const RATES = { 'FRANCO SZ': 1075, YEN: 7, 'DOLAR USA': 950 }
const plan = planCertificationSets(parseTestSetText(`${FULL_SET_TEXT}\n${EXPORT_SET_TEXT}`))
const exportPlan = { export1: plan.export1, export2: plan.export2 }
const EXPORT_ROWS: readonly DeclarationRowSpec[] = [
  { label: 'SET DOCUMENTOS DE EXPORTACION', index: 8 },
  { label: 'SET DOCUMENTOS DE EXPORTACION(2)', index: 9 },
]
const OFFERED = ['SET03', 'SET06', 'SET07', 'SET08', 'SET09', 'SET11', 'SET15', 'SET72', 'SET84']
const form = (rows: readonly DeclarationRowSpec[]): string => declarationFormPage(rows, { totreg: 12 })
const sent = (trackId: string): SentSet => ({ trackId, date: TODAY, sentAt: 'x', cases: [] })
const exportCafs = (): readonly string[] => [110, 111, 112].map((type) => cafXml(type))

describe('the export sets in the steps', () => {
  test('their folios are asked for with the other sets, each until it is sent', () => {
    expect(setFolioNeeds(plan, [])).toMatchObject({ 110: 4, 111: 1, 112: 1, 33: 3 })
    expect(setFolioNeeds(plan, ['export1'])).toMatchObject({ 110: 3 })
    expect(setFolioNeeds(plan, ['export1'])).not.toHaveProperty('112')
    expect(setFolioNeeds(plan, ['export1', 'export2'])).not.toHaveProperty('110')
  })

  test('the check before the folios stops on a missing rate and lets a set sent, or none, through', async () => {
    const harness = await certificationHarness([])
    const error = await failure(checkExportSets(harness.deps, stateWith({ plan: exportPlan })))
    expect(error).toMatchObject({
      code: 'MISSING_FIELD',
      details: { field: 'exportSets.exchangeRates', currency: 'FRANCO SZ' },
    })
    const deps = { ...harness.deps, exportSets: { exchangeRates: { YEN: 7, 'DOLAR USA': 950 } } }
    await expect(
      checkExportSets(deps, stateWith({ plan: exportPlan, sets: { export1: sent('1') } })),
    ).resolves.toBeUndefined()
    await expect(checkExportSets(harness.deps, stateWith({ plan: { basic: plan.basic } }))).resolves.toBeUndefined()
    await expect(checkExportSets(harness.deps, stateWith())).resolves.toBeUndefined()
    expect(harness.urls()).toEqual([])
  })

  test('sending one issues its documents in one envelope, keeps the artefacts and records each total', async () => {
    const harness = await certificationHarness([uploadRoute(reception('777'))])
    const deps = { ...harness.deps, exportSets: { exchangeRates: RATES } }
    const result = await sendTestSet(deps, stateWith({ plan, cafs: exportCafs() }), { kind: 'export1' })
    const set = result.state.sets.export1!
    expect(set).toMatchObject({ trackId: '777', date: TODAY })
    expect(set.cases).toEqual([
      {
        caseId: `${EXPORT_ATTENTION_1}-1`,
        type: 110,
        folio: 1,
        issueDate: TODAY,
        totals: { exemptAmount: 112517.5, totalAmount: 112517.5 },
      },
      {
        caseId: `${EXPORT_ATTENTION_1}-2`,
        type: 112,
        folio: 1,
        issueDate: TODAY,
        totals: { exemptAmount: 36411, totalAmount: 36411 },
      },
      {
        caseId: `${EXPORT_ATTENTION_1}-3`,
        type: 111,
        folio: 1,
        issueDate: TODAY,
        totals: { exemptAmount: 36411, totalAmount: 36411 },
      },
    ])
    expect(await harness.store.listArtefacts()).toEqual([
      'sets-prueba/dtes/dte-110-000001.xml',
      'sets-prueba/dtes/dte-111-000001.xml',
      'sets-prueba/dtes/dte-112-000001.xml',
      'sets-prueba/envio-set-exportacion-1.xml',
    ])
    expect(harness.events).toEqual([
      { step: 'SET_START', set: 'export1' },
      { step: 'SET_OK', set: 'export1', trackId: '777' },
    ])
    // The printed samples take the envelope to the test set.
    const xml = (await harness.store.readArtefact('sets-prueba/envio-set-exportacion-1.xml'))!
    const samples = await renderPrintedSamples({
      envelopes: [{ name: 'envio-set-exportacion-1.xml', xml }],
      options: { now: () => FIXED_NOW },
    })
    expect(samples).toMatchObject({ success: true, documents: 3, tests: 3, simulation: 0 })
    expect(samples.samples.map((sample) => sample.name)).toEqual([
      'muestra_110_1.pdf',
      'muestra_112_1.pdf',
      'muestra_111_1.pdf',
    ])
  })

  test('the declaration of the sets carries each on its row of the form', async () => {
    const rows = [STANDARD_ROWS[0], ...EXPORT_ROWS]
    const kept = form(rows.map((row) => ({ ...row, value: String(row.index) })))
    const harness = await certificationHarness([
      get('pe_avance1', page('entry'), page('entry')),
      post('pe_avance2', form(rows), kept),
      post('pe_avance3', DECLARATION_ANSWERS.success),
    ])
    const result = await declareTestSets(
      harness.deps,
      stateWith({ sets: { basic: sent('1'), export1: sent('8'), export2: sent('9') } }),
    )
    expect(result).toMatchObject({ outcome: 'accepted', success: true })
    expect(harness.posted('pe_avance3')[0]).toMatchObject({
      NUM_ENV1: '1',
      NUM_ENV8: '8',
      FEC_ENV8: '15-11-2026',
      NUM_ENV9: '9',
    })
  })
})

describe('a run whose text holds the export sets', () => {
  const routes = (extra: ReturnType<typeof stampingRoutes> = []) => [
    get('pe_generar', SET_ENTRY),
    post('pe_generar1', setGenerationForm(OFFERED)),
    post('pe_generar2', setDownloadPage(EXPORT_SET_TEXT)),
    ...extra,
  ]

  test('issues each after the other sets in its own envelope, declares them and waits', async () => {
    const harness = await certificationHarness([
      ...routes(stampingRoutes()),
      uploadRoute(reception('31'), reception('32')),
      get('pe_avance1', page('entry'), page('entry')),
      {
        url: `${MAULLIN}/pe_avance2`,
        method: 'POST',
        reply: sequence(
          [form(EXPORT_ROWS), form(EXPORT_ROWS.map((row) => ({ ...row, value: String(row.index) })))],
          () => page('x'),
        ),
      },
      post('pe_avance3', DECLARATION_ANSWERS.success),
      get('pe_avance5', page('p5')),
      post(
        'pe_avance6',
        progressPage('SET', {
          'SET DOCUMENTOS DE EXPORTACION': 'REVISADO CONFORME',
          'SET DOCUMENTOS DE EXPORTACION(2)': 'REVISADO CONFORME',
        }),
      ),
    ])
    const deps = { ...harness.deps, exportSets: { exchangeRates: RATES } }
    const result = await runCertification(deps, { until: 'testSets', optionalSets: ['SET11'] })
    expect(result.stopped).toBe('until')
    expect(Object.keys(result.state.plan!)).toEqual(['export1', 'export2'])
    expect(result.state.plan!.export2!.attentionNumber).toBe(EXPORT_ATTENTION_2)
    expect(Object.keys(result.state.sets)).toEqual(['export1', 'export2'])
    expect(result.state.sets.export2!.cases.map((c) => [c.type, c.folio, c.totals.totalAmount])).toEqual([
      [110, 2, 103.4],
      [110, 3, 233792.38],
      [110, 4, 281],
    ])
    expect(result.state.cafs.map((xml) => /<TD>(\d+)<\/TD>/.exec(xml)![1]).sort()).toEqual(['110', '111', '112'])
    expect(harness.posted('pe_avance3')[0]).toMatchObject({ NUM_ENV8: '31', NUM_ENV9: '32' })
    expect(harness.events.flatMap((event) => (event.step === 'SET_OK' ? [event.set] : []))).toEqual([
      'export1',
      'export2',
    ])
  })

  test('without the rate of a currency it stops before asking for any folio', async () => {
    const harness = await certificationHarness(routes(stampingRoutes()))
    const error = await failure(runCertification(harness.deps, { until: 'testSets', optionalSets: ['SET11'] }))
    expect(error).toMatchObject({ code: 'MISSING_FIELD', details: { field: 'exportSets.exchangeRates' } })
    expect(harness.urls().some((url) => url.includes('of_solicita_folios'))).toBe(false)
    expect(harness.steps()).toContain('CERT_ERROR')
  })
})

// The progress page has not been seen with export sets. Their rows are looked for by the labels the declaration form
// gives them, and a set that was sent and that the page does not show is not approved: the wait goes on and times out,
// naming it, rather than give for approved what nobody was seen to approve.
describe('the wait for the approval of the export sets', () => {
  const FIRST = 'SET DOCUMENTOS DE EXPORTACION'
  const SECOND = 'SET DOCUMENTOS DE EXPORTACION(2)'
  const routes = (...pages: readonly string[]) => [
    get('pe_avance1', ...repeat(page('entry'), pages.length)),
    post('pe_avance2', ...repeat(page('<p>x</p>'), pages.length)),
    get('pe_avance5', ...repeat(page('p5'), pages.length)),
    post('pe_avance6', ...pages),
  ]
  const wait = async (sets: Record<string, SentSet>, ...pages: readonly string[]) => {
    const harness = await certificationHarness(routes(...pages))
    return waitForTestSetsApproval(harness.deps, stateWith({ sets }))
  }
  const both = { export1: sent('31'), export2: sent('32') }

  test('the progress page names each export set by the label of the declaration form', () => {
    const states = parseProgressPage(
      progressPage('SET', { [FIRST]: 'REVISADO CONFORME', [SECOND]: 'RECHAZADO' }),
    ).states
    expect(states).toEqual({
      export1: { text: 'REVISADO CONFORME', state: 'approved' },
      export2: { text: 'RECHAZADO', state: 'rejected' },
    })
    // The second set alone is not taken for the first.
    expect(Object.keys(parseProgressPage(progressPage('SET', { [SECOND]: 'EN REVISION' })).states)).toEqual(['export2'])
  })

  test('both approved is approval, and a rejected one stops the wait with its wording', async () => {
    const approved = progressPage('SET', { [FIRST]: 'REVISADO CONFORME', [SECOND]: 'REVISADO CONFORME' })
    expect(await wait(both, approved)).toMatchObject({ outcome: 'approved', state: { setsApproved: true } })
    const rejected = progressPage('SET', {
      'SET BASICO': 'REVISADO CONFORME',
      [FIRST]: 'REVISADO CONFORME',
      [SECOND]: 'RECHAZADO',
    })
    expect(await wait({ basic: sent('1'), ...both }, rejected)).toMatchObject({
      outcome: 'rejected',
      detail: 'export2: RECHAZADO',
    })
  })

  test('an export set the page does not show is not approved: the wait times out and names it', async () => {
    const others = progressPage('SET', { 'SET BASICO': 'REVISADO CONFORME' })
    const result = await wait({ basic: sent('1'), ...both }, ...repeat(others, 5))
    expect(result).toMatchObject({ outcome: 'timedOut', detail: 'not shown by the progress page: export1, export2' })
    expect(result.state.setsApproved).toBe(false)
    // One of the two shown and approved: still not approval.
    const one = progressPage('SET', { [FIRST]: 'REVISADO CONFORME' })
    expect(await wait(both, ...repeat(one, 5))).toMatchObject({
      outcome: 'timedOut',
      detail: 'not shown by the progress page: export2',
    })
    // The export sets alone, on a page that shows no set at all.
    expect((await wait(both, ...repeat(progressPage('SET', {}), 5))).outcome).toBe('timedOut')
  })

  // The state of a row is its own: a row that shows none yet must not answer with the state of the row below it.
  const table = (...rows: readonly string[]) => page(`<table>\n${rows.join('\n')}\n</table>`)
  const row = (label: string, cell: string) => `<tr><td><font>${label}</font></td><td>${cell}</td></tr>`
  const APPROVED = '<b>REVISADO CONFORME</b>'

  test('an export row with no state of its own takes none from the rows around it', async () => {
    const empty = table(row(FIRST, ''), row(SECOND, APPROVED))
    expect(parseProgressPage(empty).states).toEqual({ export2: { text: 'REVISADO CONFORME', state: 'approved' } })
    // A hidden input, as the page shows a book that waits, and the simulation approved below it.
    const hidden = table(row(FIRST, '<input type=hidden name="EST9" value="S21">'), row('SET DE SIMULACION', APPROVED))
    expect(Object.keys(parseProgressPage(hidden).states)).toEqual(['simulation'])
    // The sets named in a paragraph, above the table of another set.
    const mention = page(`<p>Los ${FIRST} se revisan aparte.</p>${table(row('SET BASICO', APPROVED))}`)
    expect(Object.keys(parseProgressPage(mention).states)).toEqual(['basic'])
    // A set that was sent and whose row shows nothing is not approved by the row below it.
    const result = await wait(both, ...repeat(empty, 5))
    expect(result).toMatchObject({ outcome: 'timedOut', detail: 'not shown by the progress page: export1' })
  })

  test('the second export set is the one whose label carries a 2, however it is written', () => {
    for (const label of [
      'SET DOCUMENTOS DE EXPORTACION 2',
      'SET DOCUMENTOS DE EXPORTACION (2)',
      'SET DOC. EXPORTACION(2)',
    ])
      expect(Object.keys(parseProgressPage(table(row(label, '<b>EN REVISION</b>'))).states)).toEqual(['export2'])
    for (const label of ['SET DOCUMENTOS DE EXPORTACION (1)', 'SET DOC. EXPORTACION'])
      expect(Object.keys(parseProgressPage(table(row(label, '<b>EN REVISION</b>'))).states)).toEqual(['export1'])
  })

  test('a wait with no set on record reads the rows it read before the export sets had one', async () => {
    const rejected = progressPage('SET', { [FIRST]: 'RECHAZADO', [SECOND]: 'EN REVISION' })
    expect((await wait({}, rejected)).outcome).toBe('approved')
  })

  test('the sets the page already showed are waited for as before, with or without export sets', async () => {
    const approved = progressPage('SET', { 'SET BASICO': 'REVISADO CONFORME' })
    expect((await wait({ basic: sent('1') }, approved)).outcome).toBe('approved')
    // A page that shows none of the sets sent counted as approval, and still does without an export set.
    expect((await wait({ basic: sent('1') }, progressPage('SET', {}))).outcome).toBe('approved')
    const waiting = progressPage('SET', { 'SET BASICO': 'EN REVISION' })
    expect(await wait({ basic: sent('1') }, ...repeat(waiting, 5))).toEqual(
      expect.objectContaining({ outcome: 'timedOut' }),
    )
    expect(await wait({ basic: sent('1') }, ...repeat(waiting, 5))).not.toHaveProperty('detail')
  })
})

// The simulation issues the export sets again, so it needs what they need. It works them out before it asks the SII
// for a folio: a rate that is missing in a run resumed later stops it there, with nothing asked.
describe('the simulation of a run that sent the export sets', () => {
  test('without the rate of a currency it stops before asking for any folio', async () => {
    const harness = await certificationHarness([...stampingRoutes(), uploadRoute(reception('901'))])
    const error = await failure(sendSimulation(harness.deps, stateWith({ plan: exportPlan, cafs: [] })))
    expect(error).toMatchObject({ code: 'MISSING_FIELD', details: { field: 'exportSets.exchangeRates' } })
    expect(harness.urls().some((url) => url.includes('of_solicita_folios'))).toBe(false)
    expect(harness.steps()).not.toContain('CAF_REQUESTING')
  })

  test('with the rates it issues their six documents in the envelope of the simulation', async () => {
    const harness = await certificationHarness([...stampingRoutes(), uploadRoute(reception('902'))])
    const deps = { ...harness.deps, exportSets: { exchangeRates: RATES } }
    const result = await sendSimulation(deps, stateWith({ plan: exportPlan, cafs: [] }))
    expect(result.outcome).toBe('sent')
    const names = await harness.store.listArtefacts()
    expect(names.filter((name) => /simulacion\/dtes\/dte-11[012]-/.test(name))).toHaveLength(6)
    const envelope = (await harness.store.readArtefact('simulacion/envio-simulacion.xml'))!
    expect(envelope).not.toContain('<TpoDocRef>SET</TpoDocRef>')
    expect((envelope.match(/<TipoDTE>110<\/TipoDTE>/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })

  test('with the four sets besides, its twenty-four documents are within what the declaration takes: nothing logged', async () => {
    const harness = await certificationHarness([...stampingRoutes(), uploadRoute(reception('903'))])
    const deps = { ...harness.deps, exportSets: { exchangeRates: RATES } }
    const result = await sendSimulation(deps, stateWith({ plan, cafs: [] }))
    expect(result.state.usedFolios).toHaveLength(24)
    expect(harness.warnings()).not.toContain('certification simulation size outside 20 to 100 documents')
  })
})
