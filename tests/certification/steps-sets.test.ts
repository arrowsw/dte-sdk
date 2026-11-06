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
import { DteError } from '../../src/errors'
import { cafFingerprint } from '../../src/folios/registry'
import { fullPlan } from '../support/certification-fixtures'
import {
  cafXml,
  certificationCafXmls,
  certificationHarness,
  EST_DTE,
  EST_UP,
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
import type { FakeReply } from '../support/fake-sii'
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
    // The UTC day the set was read on: FIXED_NOW is 18:30 UTC.
    expect(result.state).toMatchObject({ attentionNumber: ATTENTION, stage: 'testSets', setReadDate: TODAY })
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

  test('a duplicate the SII only names in an error text is a failed send; a network failure is sent again', async () => {
    const refused = { body: siiFixture('reception-duplicate-99.xml') }
    const harness = await certificationHarness([
      uploadRoute(refused, new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' }), reception('77')),
    ])
    const state = stateWith({ plan, cafs: certificationCafXmls() })
    const error = await failure(sendTestSet(harness.deps, state, { kind: 'exempt' }))
    expect(error.code).toBe('SII_UPLOAD_REJECTED')
    expect(error.details.status).toBe(99)
    expect(harness.steps()).toEqual(['SET_START', 'SET_ERROR'])
    const again = await sendTestSet(harness.deps, (await harness.store.load())!, { kind: 'exempt' })
    expect(again.state.sets.exempt?.trackId).toBe('77')
    expect(harness.urls()).toEqual([UPLOAD, UPLOAD, UPLOAD])
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
  // Sent days ago: the declaration still carries today's date.
  const sent = { basic: { trackId: '1234', date: '2026-11-10', sentAt: 'x', cases: [] } }
  const form = declarationFormPage(STANDARD_ROWS)
  const kept = declarationFormPage([{ label: 'SET BASICO', index: 1, value: '1234' }, ...STANDARD_ROWS.slice(1)])

  test('ten seconds, one declaration with today as its date, the pages as artefacts, the outcome in the state', async () => {
    const harness = await certificationHarness([
      entry,
      post('pe_avance2', form, kept),
      post('pe_avance3', DECLARATION_ANSWERS.success),
    ])
    const result = await declareTestSets(harness.deps, stateWith({ sets: sent }))
    expect(result).toMatchObject({ outcome: 'accepted', success: true })
    expect(result.detail).toBeUndefined()
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

  test('"not processed yet" and a declaration that was not saved are asked again five seconds apart', async () => {
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
    expect(result).toMatchObject({ outcome: 'inReview', success: true })
    expect(harness.sleeps).toEqual([10000, 5000, 5000])
  })

  test('a declaration that stands is asked again while its answer says "not processed yet"', async () => {
    const harness = await certificationHarness([
      entry,
      post('pe_avance2', form, kept, form, kept),
      post('pe_avance3', DECLARATION_ANSWERS.notProcessed, DECLARATION_ANSWERS.success),
    ])
    const result = await declareTestSets(harness.deps, stateWith({ sets: sent }))
    expect(result).toMatchObject({ outcome: 'accepted', success: true })
    expect(harness.sleeps).toEqual([10000, 5000])
    expect(harness.posted('pe_avance3')).toHaveLength(2)
  })

  test('a lost session reads as "not yet": the next attempt declares again', async () => {
    const harness = await certificationHarness([
      entry,
      post('pe_avance2', form, form, kept),
      post('pe_avance3', DECLARATION_ANSWERS.sessionExpired, DECLARATION_ANSWERS.success),
    ])
    const result = await declareTestSets(harness.deps, stateWith({ sets: sent }))
    expect(result).toMatchObject({ outcome: 'accepted', success: true })
    expect(harness.sleeps).toEqual([10000, 5000])
  })

  test('content errors with the fields in place stand: no diagnosis, and the run goes on to the wait', async () => {
    const harness = await certificationHarness([
      entry,
      post('pe_avance2', form, kept),
      post('pe_avance3', DECLARATION_ANSWERS.contentErrors),
    ])
    const result = await declareTestSets(harness.deps, stateWith({ sets: sent }))
    expect(result).toMatchObject({
      outcome: 'contentErrors',
      success: true,
      detail: 'ENVIO CON ERRORES O REPAROS: exemptPurchaseBook, purchaseBook, basic',
    })
    expect(result.state.diagnosis).toEqual({})
    expect(harness.steps()).toEqual(['SETS_DECLARING', 'POLLING', 'SETS_DECLARED'])
    expect(harness.sleeps).toEqual([10000])
  })

  test('content errors with empty fields are asked again; after the last attempt the SOAP status is the diagnosis', async () => {
    const harness = await certificationHarness([
      entry,
      post('pe_avance2', ...repeat(form, 20)),
      post('pe_avance3', ...repeat(DECLARATION_ANSWERS.contentErrors, 10)),
      estUpRoute(estUp('RPR', '1234')),
    ])
    const result = await declareTestSets(harness.deps, stateWith({ sets: sent }))
    expect(result).toMatchObject({ outcome: 'contentErrors', success: false })
    expect(harness.sleeps).toEqual([10000, ...repeat(5000, 9)])
    expect(result.state.diagnosis?.['1234']).toEqual({ code: 'RPR', status: 'accepted', message: 'Envio Procesado' })
    expect(await harness.store.readArtefact('declaracion-sets-estado-basic-1234.xml')).toContain('RPR')
    expect(harness.steps().filter((step) => step === 'SETS_DECLARED')).toEqual([])
    expect(harness.fake.requests.filter((request) => request.url === EST_UP)).toHaveLength(1)
  })

  test('the diagnosis asks for the envelopes the answer names first, then for the others', async () => {
    const guideErrors = page(
      '<table><tr><td>SET GUIA DE DESPACHO</td><td>ENVIO CON ERRORES O REPAROS</td></tr><tr><td>SET FACTURA EXENTA</td><td>ENVIO CON ERRORES O REPAROS</td></tr></table>',
    )
    const harness = await certificationHarness([
      entry,
      post('pe_avance2', ...repeat(form, 20)),
      post('pe_avance3', ...repeat(guideErrors, 10)),
      estUpRoute(estUp('RPR', '5'), estUp('EPR', '1234')),
    ])
    const two = { basic: sent.basic, guide: { trackId: '5', date: TODAY, sentAt: 'x', cases: [] } }
    const result = await declareTestSets(harness.deps, stateWith({ sets: two }))
    expect(result).toMatchObject({ outcome: 'contentErrors', success: false })
    const asked = harness.fake.requests
      .filter((request) => request.url === EST_UP)
      .map((request) => />(\d+)<\/TrackId>/.exec(request.text)?.[1])
    // The exempt set is named too, but no envelope of it was declared: nothing to ask for.
    expect(asked).toEqual(['5', '1234'])
  })

  test.each([
    ['rejected', estUp('RCT', '1234'), { code: 'RCT', status: 'rejected' }],
    ['pending', estUp('SOK', '1234'), { code: 'SOK', status: 'pending' }],
    ['unknown', estUp('XYZ', '1234'), { code: 'XYZ', status: 'unknown' }],
    ['query-service error', estUp('-11', '1234'), { code: '-11', status: 'pending', message: '' }],
  ] as const)('the diagnosis keeps a %s state', async (_, reply, expected) => {
    const harness = await certificationHarness([
      entry,
      post('pe_avance2', ...repeat(form, 20)),
      post('pe_avance3', ...repeat(DECLARATION_ANSWERS.contentErrors, 10)),
      estUpRoute(reply),
    ])
    const result = await declareTestSets(harness.deps, stateWith({ sets: sent }))
    expect(result.state.diagnosis?.['1234']).toMatchObject(expected)
  })

  test('a diagnosis the SII does not answer keeps nothing; one that never got through only warns', async () => {
    const routes = (reply: FakeReply) => [
      entry,
      post('pe_avance2', ...repeat(form, 20)),
      post('pe_avance3', ...repeat(DECLARATION_ANSWERS.contentErrors, 10)),
      estUpRoute(reply),
    ]
    const unanswered = await certificationHarness(routes({ status: 500, body: 'down' }))
    const first = await declareTestSets(unanswered.deps, stateWith({ sets: sent }))
    expect(first.state.diagnosis).toEqual({})
    expect(unanswered.warnings()).not.toContain('certification diagnosis failed')
    expect(await unanswered.store.readArtefact('declaracion-sets-estado-basic-1234.xml')).toBeNull()
    const offline = await certificationHarness(routes(new DteError('TRANSPORT_FAILED', { reason: 'socket hang up' })))
    const second = await declareTestSets(offline.deps, stateWith({ sets: sent }))
    expect(second.state.diagnosis).toEqual({})
    expect(offline.warnings()).toContain('certification diagnosis failed')
  })

  test('every row empty ends at once; inconsistent data and a post the portal did not take too', async () => {
    const rejected = await certificationHarness([
      entry,
      post('pe_avance2', form, form),
      post('pe_avance3', DECLARATION_ANSWERS.success),
    ])
    await expect(declareTestSets(rejected.deps, stateWith({ sets: sent }))).resolves.toMatchObject({
      outcome: 'allRejected',
      success: false,
    })
    expect(rejected.sleeps).toEqual([10000])
    const inconsistent = await certificationHarness([
      entry,
      post('pe_avance2', form),
      post('pe_avance3', DECLARATION_ANSWERS.inconsistent),
    ])
    const result = await declareTestSets(inconsistent.deps, stateWith({ sets: sent }))
    expect(result).toMatchObject({
      outcome: 'inconsistent',
      success: false,
      detail: 'FECHA DE ENVIO NO CORRESPONDE AL ENVIO 123',
    })
    expect(result.state.lastDeclaration?.detail).toBe('FECHA DE ENVIO NO CORRESPONDE AL ENVIO 123')
    expect(inconsistent.sleeps).toEqual([10000])
    const failed = await certificationHarness([
      entry,
      post('pe_avance2', form),
      post('pe_avance3', DECLARATION_ANSWERS.contentMismatch),
    ])
    await expect(declareTestSets(failed.deps, stateWith({ sets: sent }))).resolves.toMatchObject({
      outcome: 'failed',
      success: false,
      detail: 'contentMismatch',
    })
    expect(failed.sleeps).toEqual([10000])
  })

  test('ten attempts at most, and the last one returns what it got', async () => {
    const harness = await certificationHarness([
      entry,
      post('pe_avance2', ...repeat(form, 20)),
      post('pe_avance3', ...repeat(DECLARATION_ANSWERS.notProcessed, 10)),
    ])
    const result = await declareTestSets(harness.deps, stateWith({ sets: sent }))
    expect(result).toMatchObject({ outcome: 'allRejected', success: false })
    expect(harness.sleeps).toHaveLength(10)
    expect(harness.posted('pe_avance3')).toHaveLength(10)
    // A declaration that stands on the last attempt is returned as standing, whatever its answer still says.
    const standing = await certificationHarness([
      entry,
      post('pe_avance2', ...repeat([form, kept], 10).flat()),
      post('pe_avance3', ...repeat(DECLARATION_ANSWERS.notProcessed, 10)),
    ])
    await expect(declareTestSets(standing.deps, stateWith({ sets: sent }))).resolves.toMatchObject({
      outcome: 'accepted',
      success: true,
    })
    expect(standing.posted('pe_avance3')).toHaveLength(10)
    // A declaration still not saved on the last attempt ends as not saved.
    const partial = declarationFormPage([
      STANDARD_ROWS[0],
      { ...STANDARD_ROWS[1], value: '5' },
      ...STANDARD_ROWS.slice(2),
    ])
    const unsaved = await certificationHarness([
      entry,
      post('pe_avance2', ...repeat([form, partial], 10).flat()),
      post('pe_avance3', ...repeat(DECLARATION_ANSWERS.success, 10)),
    ])
    const two = { basic: sent.basic, guide: { trackId: '5', date: TODAY, sentAt: 'x', cases: [] } }
    await expect(declareTestSets(unsaved.deps, stateWith({ sets: two }))).resolves.toMatchObject({
      outcome: 'notSaved',
      success: false,
    })
    expect(unsaved.posted('pe_avance3')).toHaveLength(10)
  })

  test('the simulation flag asks again on "every row empty", up to the last attempt', async () => {
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
    const never = await certificationHarness([
      entry,
      post('pe_avance2', ...repeat(empty, 20)),
      post('pe_avance3', ...repeat(DECLARATION_ANSWERS.success, 10)),
    ])
    const exhausted = await declareWithRetries(
      runtime(never.deps),
      { simulation: { trackId: '77', date: TODAY } },
      { label: 'simulation', prefix: 'x', retryOnAllRejected: true },
    )
    expect(exhausted).toMatchObject({ attempts: 10, result: { outcome: 'allRejected', success: false } })
  })

  test('sets with no field left on the form are declared all the same, and the declaration stands', async () => {
    const reviewed = declarationFormPage([{ label: 'SET BASICO', state: 'EN REVISION' }, ...STANDARD_ROWS.slice(1)])
    const harness = await certificationHarness([
      entry,
      post('pe_avance2', reviewed, reviewed),
      post('pe_avance3', DECLARATION_ANSWERS.success),
    ])
    const result = await declareTestSets(harness.deps, stateWith({ sets: sent }))
    expect(result).toMatchObject({ outcome: 'accepted', success: true })
    expect(harness.posted('pe_avance3')).toHaveLength(1)
    expect(harness.steps()).toEqual(['SETS_DECLARING', 'POLLING', 'SETS_DECLARED'])
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
    expect(result).toMatchObject({
      outcome: 'rejected',
      detail: 'basic: ENVIO CON ERRORES O REPAROS; guide: FECHA NO CORRESPONDE',
    })
    expect(harness.steps()).toEqual(['POLLING', 'SETS_REJECTED'])
  })

  test('a wording that says rejected stops the wait even on a set that also reads approved', async () => {
    const harness = await certificationHarness(
      progressRoutes(
        progressPage('SET', { 'SET BASICO': 'REVISADO CONFORME CON ERRORES', 'SET GUIA DESP.': 'EN REVISION' }),
      ),
    )
    const result = await waitForTestSetsApproval(harness.deps, stateWith({ sets: sent }))
    expect(result).toMatchObject({ outcome: 'rejected', detail: 'basic: REVISADO CONFORME CON ERRORES' })
    expect(harness.sleeps).toEqual([10000])
    // With every set approved the approval is read first, whatever else the wordings say.
    const all = await certificationHarness(
      progressRoutes(
        progressPage('SET', {
          'SET BASICO': 'REVISADO CONFORME CON ERRORES',
          'SET GUIA DESP.': 'REVISADO CONFORME, FECHA NO CORRESPONDE',
        }),
      ),
    )
    await expect(waitForTestSetsApproval(all.deps, stateWith({ sets: sent }))).resolves.toMatchObject({
      outcome: 'approved',
    })
  })

  test('objections alone do not stop the wait, and a set that was not sent is not looked at', async () => {
    const harness = await certificationHarness(
      progressRoutes(
        ...repeat(
          progressPage('SET', {
            'SET BASICO': 'CON REPAROS',
            'SET GUIA DESP.': 'REVISADO CONFORME',
            'SET FACTURA EXENTA': 'RECHAZADO',
          }),
          5,
        ),
      ),
    )
    await expect(waitForTestSetsApproval(harness.deps, stateWith({ sets: sent }))).resolves.toMatchObject({
      outcome: 'timedOut',
    })
    expect(harness.sleeps).toHaveLength(5)
  })

  test('five polls, then a time-out', async () => {
    const pending = progressPage('SET', { 'SET BASICO': 'EN REVISION', 'SET GUIA DESP.': 'REVISADO CONFORME' })
    const harness = await certificationHarness(progressRoutes(...repeat(pending, 5)))
    await expect(waitForTestSetsApproval(harness.deps, stateWith({ sets: sent }))).resolves.toMatchObject({
      outcome: 'timedOut',
    })
    expect(harness.sleeps).toHaveLength(5)
  })

  test('a page that shows none of the sets sent counts as approval', async () => {
    const none = await certificationHarness(progressRoutes(progressPage('SET', {})))
    const result = await waitForTestSetsApproval(none.deps, stateWith({ sets: sent }))
    expect(result).toMatchObject({ outcome: 'approved', state: { setsApproved: true, stage: 'books' } })
    expect(none.steps()).toEqual(['POLLING', 'SETS_APPROVED'])
  })

  test('with no set sent every state of the page is looked at', async () => {
    const books = progressPage('SET', { 'SET BASICO': 'REVISADO CONFORME', 'LIBRO DE COMPRAS': 'RECHAZADO' })
    const harness = await certificationHarness(progressRoutes(books))
    await expect(waitForTestSetsApproval(harness.deps, stateWith())).resolves.toMatchObject({
      outcome: 'rejected',
      detail: 'purchaseBook: RECHAZADO',
    })
  })

  test('a read that fails only uses up its attempt', async () => {
    const approved = progressPage('SET', { 'SET BASICO': 'REVISADO CONFORME', 'SET GUIA DESP.': 'REVISADO CONFORME' })
    const harness = await certificationHarness([
      entry,
      post('pe_avance2', page('x'), page('x')),
      get('pe_avance5', page('p5'), page('p5')),
      {
        url: 'https://maullin.sii.cl/cvc_cgi/dte/pe_avance6',
        method: 'POST' as const,
        reply: [new DteError('TRANSPORT_FAILED', { reason: 'socket hang up' }), { body: approved }],
      },
    ])
    const result = await waitForTestSetsApproval(harness.deps, stateWith({ sets: sent }))
    expect(result.outcome).toBe('approved')
    expect(harness.sleeps).toEqual([10000, 10000])
    expect(harness.warnings()).toContain('certification progress read failed')
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
  const form = declarationFormPage(STANDARD_ROWS)
  const before = progressPage('SET DE PRUEBAS', { 'LIBRO DE VENTAS': 'EN REVISION' })
  // The page is read, the advance asked for, and the page read again: four posts of the company at the most.
  const routes = (answer: string | FakeReply, after: string | FakeReply, first: string | FakeReply = before) => [
    entry,
    post('pe_avance2', ...repeat(form, 4)),
    post('pe_avance4', answer),
    get('pe_avance5', page('p5'), page('p5')),
    post('pe_avance6', first, after),
  ]
  const down = new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' })

  test('the page is read, the advance asked for at once whatever the books show, and the stage read again', async () => {
    const harness = await certificationHarness(
      routes(ADVANCE_ANSWERS.advanced, progressPage('SIMULACION', { 'SET BASICO': 'REVISADO CONFORME' })),
    )
    const result = await advanceToNextStage(harness.deps, stateWith({ stage: 'books' }))
    expect(result).toMatchObject({ outcome: 'advanced', detail: 'La empresa ha pasado al paso de SIMULACION' })
    expect(result.state.stage).toBe('simulation')
    expect(harness.steps()).toEqual(['ADVANCE_WAITING', 'ADVANCE_DONE'])
    expect(harness.events[1]).toEqual({ step: 'ADVANCE_DONE', stage: 'SIMULACION' })
    expect(harness.sleeps).toEqual([])
    const names = harness.urls().map((url) => url.slice(url.lastIndexOf('/') + 1))
    expect(names.slice(0, 7)).toEqual([
      'pe_avance1',
      'pe_avance2',
      'pe_avance5',
      'pe_avance6',
      'pe_avance1',
      'pe_avance2',
      'pe_avance4',
    ])
    expect(names.slice(7, 11)).toEqual(['pe_avance1', 'pe_avance2', 'pe_avance5', 'pe_avance6'])
  })

  test('"already there" never moves the stage back; a stage the page does not name is empty', async () => {
    const harness = await certificationHarness(routes(ADVANCE_ANSWERS.unchanged, progressPage('SET DE PRUEBAS')))
    const result = await advanceToNextStage(harness.deps, stateWith({ stage: 'exchange' }))
    expect(result.outcome).toBe('unchanged')
    expect(result.state.stage).toBe('exchange')
    const noStage = await certificationHarness(
      routes(ADVANCE_ANSWERS.advanced, page('<tr><td>SET BASICO</td><td><b>EN REVISION</b></td></tr>')),
    )
    await advanceToNextStage(noStage.deps, stateWith())
    expect(noStage.events[1]).toEqual({ step: 'ADVANCE_DONE', stage: '' })
  })

  test('a refusal, or an advance that could not be asked for, is `failed` with its sentence: nothing throws', async () => {
    const refused = await certificationHarness(routes(ADVANCE_ANSWERS.failed, progressPage('SET DE PRUEBAS')))
    const result = await advanceToNextStage(refused.deps, stateWith({ stage: 'books' }))
    expect(result).toMatchObject({ outcome: 'failed', detail: 'No es posible avanzar: faltan sets por revisar.' })
    expect(result.state.stage).toBe('books')
    const unreachable = await certificationHarness(routes(down, progressPage('SET DE PRUEBAS')))
    const failed = await advanceToNextStage(unreachable.deps, stateWith({ stage: 'books' }))
    expect(failed.outcome).toBe('failed')
    expect(failed.detail).toContain('before a response arrived')
    expect(unreachable.steps()).toEqual(['ADVANCE_WAITING', 'ADVANCE_DONE'])
  })

  test('the stage that cannot be read again is left as it was', async () => {
    const harness = await certificationHarness(routes(ADVANCE_ANSWERS.advanced, down))
    const state = stateWith({ stage: 'books' })
    const result = await advanceToNextStage(harness.deps, state)
    expect(result.outcome).toBe('advanced')
    expect(result.state).toBe(state)
    expect(harness.events[1]).toEqual({ step: 'ADVANCE_DONE', stage: '' })
    expect(harness.warnings()).toEqual(['certification progress after the advance failed'])
  })

  test('a page that cannot be read is asked again 10 s later, 30 times at the most', async () => {
    const twice = await certificationHarness([
      entry,
      post('pe_avance2', ...repeat(form, 6)),
      post('pe_avance4', ADVANCE_ANSWERS.advanced),
      get('pe_avance5', ...repeat(page('p5'), 4)),
      post('pe_avance6', down, down, before, progressPage('SIMULACION', {}, { confirm: true })),
    ])
    expect((await advanceToNextStage(twice.deps, stateWith({ stage: 'books' }))).outcome).toBe('advanced')
    expect(twice.sleeps).toEqual([10000, 10000])
    expect(twice.warnings()).toEqual(repeat('certification progress before the advance failed', 2))
    const never = await certificationHarness([
      entry,
      post('pe_avance2', ...repeat(form, 30)),
      get('pe_avance5', ...repeat(page('p5'), 30)),
      post('pe_avance6', ...repeat(down, 30)),
    ])
    const state = stateWith({ stage: 'books' })
    const result = await advanceToNextStage(never.deps, state)
    expect(result).toEqual({ state, outcome: 'timedOut', detail: 'progress' })
    expect(never.sleeps).toEqual(repeat(10000, 30))
    expect(never.steps()).toEqual(['ADVANCE_WAITING'])
    expect(never.urls().some((url) => url.endsWith('pe_avance4'))).toBe(false)
  })

  test('a failure that is no portal answer is thrown, from a read or from the advance', async () => {
    const boom = new Error('boom')
    const reading = await certificationHarness(routes(ADVANCE_ANSWERS.advanced, before, boom))
    await expect(advanceToNextStage(reading.deps, stateWith())).rejects.toThrow('boom')
    const advancing = await certificationHarness(routes(boom, before))
    await expect(advanceToNextStage(advancing.deps, stateWith())).rejects.toThrow('boom')
  })
})
