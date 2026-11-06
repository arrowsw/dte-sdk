import { readFileSync } from 'node:fs'
import { prepareFolios, setFolioNeeds, simulationFolioNeeds } from '../../src/certification/folios-step'
import {
  advanceToNextStage,
  declareTestSets,
  declareWithRetries,
  obtainTestSet,
  runtime,
  sendTestSet,
  waitForTestSetsApproval,
} from '../../src/certification/steps'
import { cafFingerprint } from '../../src/folios/registry'
import { fullPlan } from '../support/certification-fixtures'
import {
  cafXml,
  certificationCafXmls,
  certificationHarness,
  EST_DTE,
  estDteRoute,
  estUp,
  estUpRoute,
  get,
  post,
  reception,
  repeat,
  stateWith,
  TODAY,
  TRACK_ID,
  UPLOAD,
  uploadRoute,
} from '../support/certification-harness'
import {
  ADVANCE_ANSWERS,
  DECLARATION_ANSWERS,
  declarationFormPage,
  progressPage,
  SET_ENTRY,
  setDownloadPage,
  setGenerationForm,
  STANDARD_ROWS,
} from '../support/certification-pages'
import { fixturePath } from '../support/fixtures'
import { siiFixture } from '../support/sii-client'
import { failure } from '../support/portal'
import {
  ANNUL_ENTRY,
  ANNUL_FORM,
  ANNUL_OK,
  page,
  quotaForm,
  REJECTION_PAGES,
  REOBTAIN_RESOLUTION,
  reobtainDetailPage,
  reobtainListPage,
  STAMP_ENTRY,
  unusedRangesPage,
} from '../support/portal-pages'
import { ATTENTION, FULL_SET_TEXT } from '../support/test-set-samples'

const plan = fullPlan()
const CAF_XML = readFileSync(fixturePath('caf-33.xml'), 'latin1')
const OLD_CAF_XML = readFileSync(fixturePath('caf-33-old.xml'), 'latin1')
const entry = get('pe_avance1', ...repeat(page('entry'), 40))
const stampEntry = {
  url: `https://maullin.sii.cl/cvc_cgi/dte/of_solicita_folios`,
  method: 'GET' as const,
  reply: repeat({ body: STAMP_ENTRY }, 8),
}

describe('obtainTestSet', () => {
  const routes = () => [
    get('pe_generar', SET_ENTRY),
    post('pe_generar1', setGenerationForm()),
    post('pe_generar2', setDownloadPage(FULL_SET_TEXT, '<p>Set generado correctamente</p>')),
  ]

  test('downloads, plans and keeps the text and the plan as artefacts', async () => {
    const harness = await certificationHarness(routes())
    const result = await obtainTestSet(harness.deps, stateWith(), { optionalSets: ['SET03'] })
    expect(result.outcome).toBe('loaded')
    expect(result.state).toMatchObject({ attentionNumber: ATTENTION, stage: 'testSets' })
    expect(result.state.plan?.basic?.kind).toBe('basic')
    expect(result.state.setText).toContain('SET BASICO')
    expect(await harness.store.listArtefacts()).toEqual(['estructuras.json', 'set-texto.txt'])
    expect(JSON.parse((await harness.store.readArtefact('estructuras.json'))!)).toEqual(result.state.plan)
    expect(harness.steps()).toEqual(['SETS_DOWNLOADING', 'SETS_LOADED'])
    expect(harness.posted('pe_generar2')[0]).toEqual({
      RUT_EMP: '76543210',
      DV_EMP: '3',
      AUTORIZADA: 'S',
      TOTAL: '15',
      SET03: 'S',
      SET01: 'S',
    })
    expect(await harness.store.load()).toEqual(result.state)
  })

  test('a run that already had a plan starts over: the sets are void, the CAFs stay', async () => {
    const harness = await certificationHarness(routes())
    const before = stateWith({
      plan,
      attentionNumber: '1',
      cafs: [cafXml()],
      usedFolios: [{ type: 33, folio: 1 }],
      sets: { basic: { trackId: '1', date: TODAY, sentAt: 'x', cases: [] } },
      setsApproved: true,
      stage: 'books',
    })
    const result = await obtainTestSet(harness.deps, before)
    expect(result.outcome).toBe('regenerated')
    expect(result.state).toMatchObject({ sets: {}, setsApproved: false, stage: 'testSets', cafs: [cafXml()] })
    expect(result.state.usedFolios).toEqual([{ type: 33, folio: 1 }])
    expect(harness.steps()).toEqual(['SETS_DOWNLOADING', 'SETS_REGENERATED', 'SETS_LOADED'])
    expect(harness.posted('pe_generar2')[0]).toMatchObject({ SET72: 'S' })
  })

  test('a text with no set is an unexpected page', async () => {
    const harness = await certificationHarness([
      get('pe_generar', SET_ENTRY),
      post('pe_generar1', setGenerationForm()),
      post('pe_generar2', setDownloadPage('CASO 1\nDOCUMENTO FACTURA')),
    ])
    const error = await failure(obtainTestSet(harness.deps, stateWith()))
    expect(error.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect(error.details).toMatchObject({ step: 'set-text' })
  })
})

describe('folio needs', () => {
  test('the sets not yet sent, and the simulation', () => {
    const all = setFolioNeeds(plan, [])
    expect(all[33]).toBe(plan.basic!.folios[33])
    expect(all[61]).toBe(plan.basic!.folios[61] + plan.exempt!.folios[61] + plan.purchase!.folios[61])
    expect(setFolioNeeds(plan, ['basic', 'guide', 'exempt', 'purchase'])).toEqual({})
    const simulation = simulationFolioNeeds(plan)
    expect(simulation[33]).toBe(plan.basic!.invoices.length)
    expect(simulation[52]).toBe(plan.guide!.guides.length)
    expect(simulation[46]).toBe(1)
    expect(simulationFolioNeeds({})).toEqual({})
    expect(simulationFolioNeeds({ purchase: { ...plan.purchase!, creditNote: null, debitNote: null } })).toEqual({
      46: 1,
    })
  })
})

describe('prepareFolios', () => {
  const quota = (...bodies: readonly string[]) => post('of_solicita_folios_dcto', ...bodies)
  const confirm = (...bodies: readonly string[]) => post('of_confirma_folio', ...bodies)

  test('CAFs in hand that cover the needs ask the portal nothing', async () => {
    const harness = await certificationHarness([])
    const state = stateWith({ plan, cafs: certificationCafXmls() })
    const result = await prepareFolios(harness.deps, state)
    expect(result.outcome).toBe('ready')
    expect(result.cafs).toEqual(certificationCafXmls())
    expect(harness.urls()).toEqual([])
    expect(harness.steps().filter((step) => step === 'CAF_OK')).toHaveLength(6)
    expect(result.state.cafs).toEqual(certificationCafXmls())
  })

  test('an unrestricted quota gets one exact request; the new CAF joins the state', async () => {
    const harness = await certificationHarness([stampEntry, quota(quotaForm(), quotaForm()), confirm(CAF_XML)])
    const result = await prepareFolios(harness.deps, stateWith(), { needs: { 33: 5 } })
    expect(result.cafs).toEqual([CAF_XML])
    expect(result.state.cafs).toEqual([CAF_XML])
    expect(harness.posted('of_solicita_folios_dcto')[1].CANTIDAD).toBe('5')
    expect(harness.steps()).toEqual(['CAF_REQUESTING', 'CAF_OK'])
  })

  test('with `fresh` the CAFs in hand are ignored and only the new ones come back', async () => {
    const harness = await certificationHarness([stampEntry, quota(quotaForm(), quotaForm()), confirm(CAF_XML)])
    const result = await prepareFolios(harness.deps, stateWith({ cafs: [cafXml(33, { from: 200, to: 300 })] }), {
      needs: { 33: 2 },
      fresh: true,
    })
    expect(result.cafs).toEqual([CAF_XML])
    expect(result.state.cafs).toEqual([cafXml(33, { from: 200, to: 300 }), CAF_XML])
  })

  test('a maximum below the need asks in batches', async () => {
    const harness = await certificationHarness([
      stampEntry,
      quota(quotaForm(3, 0), quotaForm(3, 0), quotaForm(3, 0)),
      confirm(CAF_XML, CAF_XML),
    ])
    const result = await prepareFolios(harness.deps, stateWith(), { needs: { 33: 3 } })
    expect(result.cafs.length).toBeGreaterThan(0)
    expect(result.outcome).toBe('ready')
  })

  test('an exact request that falls short falls back to batches for the rest', async () => {
    const harness = await certificationHarness([
      stampEntry,
      quota(quotaForm(), quotaForm(), ...repeat(quotaForm(100, 0), 4)),
      confirm(cafXml(33, { from: 1, to: 1 }), cafXml(33, { from: 2, to: 2 })),
    ])
    const result = await prepareFolios(harness.deps, stateWith(), { needs: { 33: 2 } })
    expect(result.cafs).toEqual([cafXml(33, { from: 1, to: 1 }), cafXml(33, { from: 2, to: 2 })])
    expect(harness.posted('of_confirma_folio')).toHaveLength(2)
    const refused = await certificationHarness([stampEntry, quota(quotaForm(), REJECTION_PAGES.companyNotAuthorized)])
    const error = await failure(prepareFolios(refused.deps, stateWith(), { needs: { 33: 2 } }))
    expect(error.details).toMatchObject({ rejection: 'companyNotAuthorized' })
  })

  test('a short quota with unused folios at the SII re-obtains them first', async () => {
    const harness = await certificationHarness([
      stampEntry,
      quota(quotaForm(1, 9)),
      get('rf_reobtencion1_folios', page('form')),
      post('rf_reobtencion2_folios', reobtainListPage([[1, 100]])),
      post('rf_reobtencion3_folios', reobtainDetailPage(1)),
      post('rf_genera_folio', REOBTAIN_RESOLUTION),
      post('rf_genera_archivo', CAF_XML),
      estDteRoute(false, false),
    ])
    // A range reserved but never sent is still re-obtainable: the registry is asked about every listed range.
    await harness.registry.reserve({
      companyRut: '76543210-3',
      type: 33,
      range: { from: 1, to: 100 },
      environment: 'certification',
    })
    const result = await prepareFolios(harness.deps, stateWith(), { needs: { 33: 2 } })
    expect(result.cafs).toEqual([CAF_XML])
    expect(harness.posted('of_confirma_folio')).toEqual([])
  })

  test('rationing with nothing else to do annuls the last 180 days and asks again', async () => {
    const harness = await certificationHarness([
      stampEntry,
      quota(REJECTION_PAGES.stampingBlocked, REJECTION_PAGES.stampingBlocked, quotaForm()),
      get('af_anular1', ...repeat(ANNUL_ENTRY, 4)),
      post('af_anular2', ...repeat(unusedRangesPage([[1, 9, '01-11-2026']]), 4)),
      post('af_anular3', ...repeat(ANNUL_FORM, 4)),
      post('af_anular', ...repeat(ANNUL_OK, 4)),
      confirm(CAF_XML),
    ])
    const result = await prepareFolios(harness.deps, stateWith({ cafs: [cafXml(33, { from: 500, to: 500 })] }), {
      needs: { 33: 2 },
    })
    expect(result.cafs).toEqual([cafXml(33, { from: 500, to: 500 }), CAF_XML])
    expect(harness.posted('af_anular')).toHaveLength(1)
  })

  test('annulling never touches a CAF the run holds, even when the simulation asks for fresh ones', async () => {
    const harness = await certificationHarness([
      stampEntry,
      quota(REJECTION_PAGES.stampingBlocked, REJECTION_PAGES.stampingBlocked, quotaForm()),
      get('af_anular1', ...repeat(ANNUL_ENTRY, 4)),
      post(
        'af_anular2',
        ...repeat(
          unusedRangesPage([
            [500, 500, '01-11-2026'],
            [1, 9, '01-11-2026'],
          ]),
          4,
        ),
      ),
      post('af_anular3', ...repeat(ANNUL_FORM, 4)),
      post('af_anular', ...repeat(ANNUL_OK, 4)),
      confirm(CAF_XML),
    ])
    const inHand = cafXml(33, { from: 500, to: 500 })
    const result = await prepareFolios(harness.deps, stateWith({ cafs: [inHand] }), { needs: { 33: 2 }, fresh: true })
    expect(result.cafs).toEqual([CAF_XML])
    expect(harness.posted('af_anular')).toHaveLength(1)
    expect(JSON.stringify(harness.posted('af_anular'))).not.toContain('500')
  })

  test('still short: the error carries the numbers and the reason', async () => {
    const harness = await certificationHarness([
      stampEntry,
      quota(...repeat(quotaForm(1, 0), 4)),
      confirm(cafXml(33, { from: 1, to: 1 }), REJECTION_PAGES.personWithPendingIssues),
    ])
    const error = await failure(prepareFolios(harness.deps, stateWith(), { needs: { 33: 2 } }))
    expect(error.code).toBe('FOLIO_OUT_OF_RANGE')
    expect(error.details).toMatchObject({
      type: 33,
      required: 2,
      available: 1,
      availableFolios: 0,
      rejection: 'quotaCapReached',
      reason: 'noUnusedFolios',
    })
    const refused = await certificationHarness([
      stampEntry,
      quota(quotaForm(5, 3), REJECTION_PAGES.companyNotAuthorized),
    ])
    const capped = await failure(prepareFolios(refused.deps, stateWith(), { needs: { 33: 2 } }))
    expect(capped.details).toMatchObject({ reason: 'unusedFoliosBlock', rejection: 'companyNotAuthorized' })
  })

  test('folios of this run the SII never received come back; received ones stay used; an expired CAF is skipped', async () => {
    const harness = await certificationHarness([
      {
        url: EST_DTE,
        method: 'POST',
        reply: [
          { body: siiFixture('soap-estdte-fau.xml') },
          { status: 500, body: 'down' },
          { body: siiFixture('soap-estdte-dok.xml') },
        ],
      },
    ])
    const held = cafXml(33, { from: 1, to: 3 })
    const other = cafXml(33, { from: 10, to: 12 })
    const otherScope = {
      companyRut: '76543210-3',
      type: 33,
      range: { from: 10, to: 12 },
      environment: 'certification' as const,
      cafFingerprint: cafFingerprint(other),
    }
    await harness.registry.reserve(otherScope)
    await harness.registry.markSent(otherScope, 10)
    const scope = {
      companyRut: '76543210-3',
      type: 33,
      range: { from: 1, to: 3 },
      environment: 'certification' as const,
      cafFingerprint: cafFingerprint(held),
    }
    await harness.registry.reserve(scope)
    await harness.registry.reserve(scope)
    await harness.registry.markSent(scope, 1)
    await harness.registry.markSent(scope, 2)
    const state = stateWith({
      cafs: [held, OLD_CAF_XML, other],
      usedFolios: [
        { type: 33, folio: 1 },
        { type: 33, folio: 2 },
        { type: 61, folio: 7 },
        { type: 33, folio: 10 },
      ],
    })
    const result = await prepareFolios(harness.deps, state, { needs: { 33: 2 } })
    expect(result.state.usedFolios).toEqual([
      { type: 33, folio: 2 },
      { type: 61, folio: 7 },
      { type: 33, folio: 10 },
    ])
    expect(await harness.registry.remaining(scope)).toBe(2)
    expect(await harness.registry.remaining(otherScope)).toBe(2)
    expect(harness.urls().every((url) => url.endsWith('QueryEstDte.jws'))).toBe(true)
  })

  test('without a plan and without needs there is nothing to prepare', async () => {
    const harness = await certificationHarness([])
    expect((await failure(prepareFolios(harness.deps, stateWith()))).details).toEqual({ field: 'plan' })
  })
})

describe('sendTestSet', () => {
  test('issues, keeps the artefacts, uploads, marks the folios and records the send', async () => {
    const harness = await certificationHarness([uploadRoute(reception())])
    const state = stateWith({ plan, cafs: certificationCafXmls() })
    const result = await sendTestSet(harness.deps, state, { kind: 'basic' })
    expect(result.outcome).toBe('sent')
    const sent = result.state.sets.basic!
    expect(sent).toMatchObject({ trackId: TRACK_ID, date: TODAY, sentAt: '2026-11-15T18:30:00.000Z' })
    expect(sent.cases).toHaveLength(
      plan.basic!.invoices.length + plan.basic!.creditNotes.length + plan.basic!.debitNotes.length,
    )
    expect(sent.cases[0]).toMatchObject({ type: 33, folio: 1, issueDate: TODAY })
    expect(sent.cases[0].totals.totalAmount).toBeGreaterThan(0)
    expect(result.state.usedFolios).toHaveLength(sent.cases.length)
    const names = await harness.store.listArtefacts()
    expect(names).toContain('sets-prueba/envio-set-basico.xml')
    expect(names).toContain('sets-prueba/dtes/dte-33-000001.xml')
    expect((await harness.store.readArtefact('sets-prueba/envio-set-basico.xml'))!.startsWith('<?xml')).toBe(true)
    const stats = await harness.registry.stats({ companyRut: '76543210-3', type: 33, environment: 'certification' })
    expect(stats.totalSent).toBe(plan.basic!.invoices.length)
    expect(harness.steps()).toEqual(['SET_START', 'SET_OK'])
    expect(harness.urls()).toEqual([UPLOAD])
  })

  test('a failed upload still marks the folios as sent, then throws', async () => {
    const harness = await certificationHarness([uploadRoute({ status: 500, body: 'down' })])
    const state = stateWith({ plan, cafs: certificationCafXmls() })
    const error = await failure(sendTestSet(harness.deps, state, { kind: 'guide' }))
    expect(error.code).toBe('SII_HTTP_ERROR')
    expect(harness.steps()).toEqual(['SET_START', 'SET_ERROR'])
    const stats = await harness.registry.stats({ companyRut: '76543210-3', type: 52, environment: 'certification' })
    expect(stats.totalSent).toBe(plan.guide!.guides.length)
    expect((await harness.store.load())?.usedFolios).toHaveLength(plan.guide!.guides.length)
    expect((await harness.store.load())?.sets).toEqual({})
  })

  test('a type with no CAF in hand, or with every CAF exhausted, cannot issue', async () => {
    const harness = await certificationHarness([])
    const error = await failure(sendTestSet(harness.deps, stateWith({ plan, cafs: [cafXml(33)] }), { kind: 'guide' }))
    expect(error.code).toBe('FOLIO_OUT_OF_RANGE')
    expect(error.details).toEqual({ type: 52 })
    const short = stateWith({ plan, cafs: [cafXml(52, { from: 1, to: 1 }), cafXml(52, { from: 5, to: 5 })] })
    expect((await failure(sendTestSet(harness.deps, short, { kind: 'guide' }))).details).toEqual({ type: 52 })
  })

  test('a guide set keeps the transfer type of each case', async () => {
    const harness = await certificationHarness([uploadRoute(reception('55'))])
    const result = await sendTestSet(harness.deps, stateWith({ plan, cafs: certificationCafXmls() }), { kind: 'guide' })
    expect(result.state.sets.guide?.trackId).toBe('55')
    expect(result.state.sets.guide?.cases.every((c) => c.type === 52 && c.transferType !== undefined)).toBe(true)
  })

  test('a set without a plan', async () => {
    const harness = await certificationHarness([])
    expect((await failure(sendTestSet(harness.deps, stateWith(), { kind: 'exempt' }))).details).toEqual({
      field: 'plan',
      kind: 'exempt',
    })
  })
})

describe('declareTestSets', () => {
  const sent = { basic: { trackId: '1234', date: TODAY, sentAt: 'x', cases: [] } }
  const form = declarationFormPage(STANDARD_ROWS)
  const kept = declarationFormPage([{ label: 'SET BASICO', index: 1, value: '1234' }, ...STANDARD_ROWS.slice(1)])

  test('ten seconds, one declaration, the pages as artefacts, the outcome in the state', async () => {
    const harness = await certificationHarness([
      entry,
      post('pe_avance2', form, kept),
      post('pe_avance3', DECLARATION_ANSWERS.success),
    ])
    const result = await declareTestSets(harness.deps, stateWith({ sets: sent }))
    expect(result.outcome).toBe('accepted')
    expect(harness.sleeps).toEqual([10000])
    expect(harness.steps()).toEqual(['SETS_DECLARING', 'POLLING', 'SETS_DECLARED'])
    expect(harness.events[1]).toEqual({ step: 'POLLING', attempt: 1, max: 10, label: 'declaration' })
    expect(await harness.store.listArtefacts()).toEqual([
      'declaracion-sets-1.html',
      'declaracion-sets-pe_avance2-1.html',
    ])
    expect(result.state.lastDeclaration).toEqual({
      scope: 'sets',
      outcome: 'accepted',
      detail: null,
      at: '2026-11-15T18:30:00.000Z',
    })
    expect(harness.posted('pe_avance3')[0]).toMatchObject({ NUM_ENV1: '1234', FEC_ENV1: '15-11-2026' })
  })

  test('"not processed" and "not saved" are retried five seconds apart', async () => {
    const partial = declarationFormPage([
      STANDARD_ROWS[0],
      { ...STANDARD_ROWS[1], value: '5' },
      ...STANDARD_ROWS.slice(2),
    ])
    const final = declarationFormPage([
      { label: 'SET BASICO', index: 1, value: '1234' },
      { label: 'SET GUIA DE DESPACHO', state: 'EN REVISION' },
      ...STANDARD_ROWS.slice(2),
    ])
    const harness = await certificationHarness([
      entry,
      post('pe_avance2', form, form, form, partial, form, final),
      post('pe_avance3', DECLARATION_ANSWERS.notProcessed, DECLARATION_ANSWERS.success, DECLARATION_ANSWERS.success),
    ])
    const two = { basic: sent.basic, guide: { trackId: '5', date: TODAY, sentAt: 'x', cases: [] } }
    const result = await declareTestSets(harness.deps, stateWith({ sets: two }))
    expect(result.outcome).toBe('inReview')
    expect(harness.sleeps).toEqual([10000, 5000, 5000])
  })

  test('content errors with the fields present are diagnosed through the SOAP status', async () => {
    const harness = await certificationHarness([
      entry,
      post('pe_avance2', form, kept),
      post('pe_avance3', DECLARATION_ANSWERS.contentErrors),
      estUpRoute(estUp('RPR', '1234')),
    ])
    const result = await declareTestSets(harness.deps, stateWith({ sets: sent }))
    expect(result.outcome).toBe('contentErrors')
    expect(result.state.diagnosis?.['1234']).toMatchObject({ code: 'RPR', status: 'acceptedWithObjections' })
    expect(await harness.store.readArtefact('declaracion-sets-estado-basic-1234.xml')).toContain('RPR')
    expect(harness.steps()).toEqual(['SETS_DECLARING', 'POLLING'])
  })

  test('content errors with empty fields are retried; a failed diagnosis only warns', async () => {
    const harness = await certificationHarness([
      entry,
      post('pe_avance2', form, form, form, kept),
      post('pe_avance3', DECLARATION_ANSWERS.contentErrors, DECLARATION_ANSWERS.contentErrors),
      estUpRoute({ status: 500, body: 'down' }),
    ])
    const result = await declareTestSets(harness.deps, stateWith({ sets: sent }))
    expect(result.outcome).toBe('contentErrors')
    expect(harness.sleeps).toEqual([10000, 5000])
    expect(result.state.diagnosis).toEqual({})
    expect(harness.warnings()).toContain('certification diagnosis failed')
  })

  test('every row empty stops at once; inconsistent data too', async () => {
    const rejected = await certificationHarness([
      entry,
      post('pe_avance2', form, form),
      post('pe_avance3', DECLARATION_ANSWERS.success),
    ])
    await expect(declareTestSets(rejected.deps, stateWith({ sets: sent }))).resolves.toMatchObject({
      outcome: 'allRejected',
    })
    expect(rejected.sleeps).toEqual([10000])
    const inconsistent = await certificationHarness([
      entry,
      post('pe_avance2', form),
      post('pe_avance3', DECLARATION_ANSWERS.inconsistent),
    ])
    const result = await declareTestSets(inconsistent.deps, stateWith({ sets: sent }))
    expect(result).toMatchObject({ outcome: 'inconsistent', detail: 'LA FECHA DE ENVIO NO CORRESPONDE AL ENVIO 123' })
    expect(result.state.lastDeclaration?.detail).toBe('LA FECHA DE ENVIO NO CORRESPONDE AL ENVIO 123')
  })

  test('ten attempts at most', async () => {
    const harness = await certificationHarness([
      entry,
      post('pe_avance2', ...repeat(form, 20)),
      post('pe_avance3', ...repeat(DECLARATION_ANSWERS.notProcessed, 10)),
    ])
    const result = await declareTestSets(harness.deps, stateWith({ sets: sent }))
    expect(result.outcome).toBe('notProcessed')
    expect(harness.sleeps).toHaveLength(10)
    expect(harness.posted('pe_avance3')).toHaveLength(10)
  })

  test('the simulation flag retries "every row empty"', async () => {
    const rows = [{ label: 'SET DE SIMULACION', index: 1 }, ...STANDARD_ROWS.slice(1)]
    const empty = declarationFormPage(rows)
    const done = declarationFormPage([{ label: 'SET DE SIMULACION', index: 1, value: '77' }, ...STANDARD_ROWS.slice(1)])
    const harness = await certificationHarness([
      entry,
      post('pe_avance2', empty, empty, empty, done),
      post('pe_avance3', DECLARATION_ANSWERS.success, DECLARATION_ANSWERS.success),
    ])
    const loop = await declareWithRetries(
      runtime(harness.deps),
      { simulation: { trackId: '77', date: TODAY } },
      { label: 'simulation', prefix: 'x', retryOnAllRejected: true },
    )
    expect(loop.result.outcome).toBe('accepted')
    expect(loop.attempts).toBe(2)
    expect(harness.sleeps).toEqual([10000, 5000])
  })

  test('nothing sent, nothing to declare', async () => {
    const harness = await certificationHarness([])
    expect((await failure(declareTestSets(harness.deps, stateWith()))).details).toEqual({ field: 'sets' })
  })
})

describe('waitForTestSetsApproval', () => {
  const sent = {
    basic: { trackId: '1', date: TODAY, sentAt: 'x', cases: [] },
    guide: { trackId: '2', date: TODAY, sentAt: 'x', cases: [] },
  }
  const progressRoutes = (...pages: readonly string[]) => [
    entry,
    post('pe_avance2', ...repeat(page('<tr><td><font>SET BASICO</font></td><td><b>x</b></td></tr>'), pages.length)),
    get('pe_avance5', ...repeat(page('p5'), pages.length)),
    post('pe_avance6', ...pages),
  ]

  test('approved on the second poll, sleeping first each time', async () => {
    const harness = await certificationHarness(
      progressRoutes(
        progressPage('SET', { 'SET BASICO': 'REVISADO CONFORME', 'SET GUIA DESP.': 'EN REVISION' }),
        progressPage('SET', {
          'SET BASICO': 'REVISADO CONFORME',
          'SET GUIA DESP.': 'REVISADO CONFORME',
          'SET FACTURA EXENTA': 'RECHAZADO',
        }),
      ),
    )
    const result = await waitForTestSetsApproval(harness.deps, stateWith({ sets: sent }))
    expect(result.outcome).toBe('approved')
    expect(result.state).toMatchObject({ setsApproved: true, stage: 'books' })
    expect(harness.sleeps).toEqual([10000, 10000])
    expect(harness.steps()).toEqual(['POLLING', 'POLLING', 'SETS_APPROVED'])
  })

  test('a rejected or inconsistent set stops with the wording', async () => {
    const harness = await certificationHarness(
      progressRoutes(
        progressPage('SET', { 'SET BASICO': 'ENVIO CON ERRORES O REPAROS', 'SET GUIA DESP.': 'FECHA NO CORRESPONDE' }),
      ),
    )
    const result = await waitForTestSetsApproval(harness.deps, stateWith({ sets: sent }))
    expect(result).toMatchObject({ outcome: 'rejected', detail: 'ENVIO CON ERRORES O REPAROS | FECHA NO CORRESPONDE' })
    expect(harness.steps()).toEqual(['POLLING', 'SETS_REJECTED'])
  })

  test('five polls, then a time-out; no set at all is never approval', async () => {
    const pending = progressPage('SET', { 'SET BASICO': 'EN REVISION', 'SET GUIA DESP.': 'REVISADO CONFORME' })
    const harness = await certificationHarness(progressRoutes(...repeat(pending, 5)))
    await expect(waitForTestSetsApproval(harness.deps, stateWith({ sets: sent }))).resolves.toMatchObject({
      outcome: 'timedOut',
    })
    expect(harness.sleeps).toHaveLength(5)
    const none = await certificationHarness(progressRoutes(...repeat(progressPage('SET', {}), 5)))
    await expect(waitForTestSetsApproval(none.deps, stateWith())).resolves.toMatchObject({ outcome: 'timedOut' })
  })
})

test('the runtime defaults: a real clock, a real sleep, no listener', async () => {
  const harness = await certificationHarness([])
  const rt = runtime({ ...harness.deps, now: undefined, sleep: undefined, onProgress: undefined })
  expect(rt.now()).toBeInstanceOf(Date)
  await rt.sleep(1)
  expect(() => rt.emit({ step: 'CERT_DONE' })).not.toThrow()
})

describe('advanceToNextStage', () => {
  const routes = (answer: string, stage: string) => [
    entry,
    post('pe_avance2', declarationFormPage(STANDARD_ROWS), declarationFormPage(STANDARD_ROWS)),
    post('pe_avance4', answer),
    get('pe_avance5', page('p5')),
    post('pe_avance6', progressPage(stage, { 'SET BASICO': 'REVISADO CONFORME' })),
  ]

  test('advanced, and the stage read from the portal', async () => {
    const harness = await certificationHarness(routes(ADVANCE_ANSWERS.advanced, 'SIMULACION'))
    const result = await advanceToNextStage(harness.deps, stateWith({ stage: 'books' }))
    expect(result).toMatchObject({ outcome: 'advanced', detail: 'La empresa ha pasado al paso de SIMULACION' })
    expect(result.state.stage).toBe('simulation')
    expect(harness.steps()).toEqual(['ADVANCE_WAITING', 'ADVANCE_DONE'])
    expect(harness.events[1]).toEqual({ step: 'ADVANCE_DONE', stage: 'SIMULACION' })
  })

  test('"already there" is fine and never moves the stage back', async () => {
    const harness = await certificationHarness(routes(ADVANCE_ANSWERS.unchanged, 'SET DE PRUEBAS'))
    const result = await advanceToNextStage(harness.deps, stateWith({ stage: 'exchange' }))
    expect(result.outcome).toBe('unchanged')
    expect(result.state.stage).toBe('exchange')
    const noStage = await certificationHarness([
      entry,
      post('pe_avance2', declarationFormPage(STANDARD_ROWS), declarationFormPage(STANDARD_ROWS)),
      post('pe_avance4', ADVANCE_ANSWERS.advanced),
      get('pe_avance5', page('p5')),
      post('pe_avance6', page('<tr><td>SET BASICO</td><td><b>EN REVISION</b></td></tr>')),
    ])
    await advanceToNextStage(noStage.deps, stateWith())
    expect(noStage.events[1]).toEqual({ step: 'ADVANCE_DONE', stage: '' })
  })

  test('a refusal throws with the portal sentence', async () => {
    const harness = await certificationHarness(routes(ADVANCE_ANSWERS.failed, 'SIMULACION'))
    const error = await failure(advanceToNextStage(harness.deps, stateWith()))
    expect(error.code).toBe('SII_PORTAL_REJECTED')
    expect(error.details).toMatchObject({
      rejection: 'advanceRefused',
      portalMessage: 'No es posible avanzar: faltan sets por revisar.',
    })
  })
})
