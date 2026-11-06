import { uploadPrintedSamples } from '../../src/certification/samples-step'
import { certificationHarness, stateWith } from '../support/certification-harness'
import {
  CREATED_REVIEW,
  gwtMethodOf,
  REVIEW_ID,
  REVIEW_TOKEN,
  reviewAnswer,
  SAMPLES_BLOCKED,
  SESSION_CHECK_URL,
  SAMPLES_SERVICE_URL,
  SAMPLES_UPLOAD_URL,
  samplesRoutes,
} from '../support/exchange-fixtures'
import { detailAnswer, EMPTY_OK, EXCEPTION, okAnswer } from '../support/gwt-answers'
import { failure } from '../support/portal'

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46])
const samples = [
  { fileName: 'muestra_33_1.pdf', bytes: PDF },
  { fileName: 'muestra_61_2.pdf', bytes: PDF },
]
const atSamples = () => stateWith({ stage: 'printedSamples' })
const DETAIL_ROWS = [
  ['1', 'muestra_33_1.pdf', 'PRUEBA', 'FACTURA ELECTRONICA', '1', 'ORIGINAL', 'CASO-1'],
  ['2', 'muestra_61_2.pdf', 'SIMULACION', 'NOTA DE CREDITO ELECTRONICA', '2', 'ORIGINAL', ''],
]
type Harness = Awaited<ReturnType<typeof certificationHarness>>
const methods = (harness: Harness) =>
  harness.fake.requests.filter((request) => request.url === SAMPLES_SERVICE_URL).map(gwtMethodOf)
const uploads = (harness: Harness) => harness.fake.requests.filter((request) => request.url === SAMPLES_UPLOAD_URL)

describe('uploadPrintedSamples', () => {
  test('no review yet: one is created, every PDF uploaded in order, the review submitted and read again', async () => {
    const harness = await certificationHarness(
      samplesRoutes({
        service: {
          leeImpreso: (call) => ({ body: call === 1 ? EMPTY_OK : reviewAnswer('ENVIADO AL SII') }),
          creaLista: { body: CREATED_REVIEW },
        },
      }),
    )
    const result = await uploadPrintedSamples(harness.deps, atSamples(), { samples })
    expect(result.outcome).toBe('submitted')
    expect(result.detail).toBe('ENVIADO AL SII')
    expect(result.state.stage).toBe('compliance')
    expect(result.state.samples).toEqual({
      revisionId: REVIEW_ID,
      revisionToken: REVIEW_TOKEN,
      state: 'ENVIADO AL SII',
      uploaded: ['muestra_33_1.pdf', 'muestra_61_2.pdf'],
      submittedAt: '2026-11-15T18:30:00.000Z',
    })
    expect(methods(harness)).toEqual(['leeImpreso', 'creaLista', 'solicitaRevisionSII', 'leeImpreso'])
    expect(uploads(harness).map((request) => request.parts.map((part) => part.value))).toEqual([
      ['%PDF', String(REVIEW_ID), 'false'],
      ['%PDF', String(REVIEW_ID), 'false'],
    ])
    expect(uploads(harness).map((request) => request.parts[0].fileName)).toEqual(samples.map((s) => s.fileName))
    expect(await harness.store.listArtefacts()).toEqual([
      'muestras/pdfte-crea-lista.html',
      'muestras/pdfte-enviar-sii.html',
      'muestras/pdfte-estado-post-envio.html',
      'muestras/pdfte-lee-impreso.html',
      'muestras/upload-1.html',
      'muestras/upload-2.html',
    ])
    expect(harness.events).toEqual([
      { step: 'MUESTRAS_UPLOADING', count: 2 },
      { step: 'MUESTRAS_DONE', success: true },
    ])
    expect(harness.urls().filter((url) => url.endsWith('nocache.js'))).toHaveLength(1)
  })

  test('the whole stage is one stage of the portal: one session check, one warm-up, one look at the hashes', async () => {
    const harness = await certificationHarness(
      samplesRoutes({
        service: {
          leeImpreso: (call) => ({ body: call === 1 ? EMPTY_OK : reviewAnswer('RECHAZADO') }),
          creaLista: { body: CREATED_REVIEW },
          muestraMail: { body: detailAnswer(DETAIL_ROWS) },
        },
      }),
    )
    await uploadPrintedSamples(harness.deps, atSamples(), { samples })
    const base = SAMPLES_SERVICE_URL.replace('ServicePdfDte', '')
    expect(harness.urls().map((url) => url.replace(base, '<pdf>/'))).toEqual([
      SESSION_CHECK_URL,
      '<pdf>/',
      '<pdf>/pdfdte.nocache.js',
      '<pdf>/ServicePdfDte',
      '<pdf>/ServicePdfDte',
      '<pdf>/upload',
      '<pdf>/upload',
      '<pdf>/ServicePdfDte',
      '<pdf>/ServicePdfDte',
      '<pdf>/ServicePdfDte',
    ])
  })

  test('a review in INGRESO with a readable id is resumed; one without an id is replaced by a new review', async () => {
    const resumed = await certificationHarness(
      samplesRoutes({
        service: {
          leeImpreso: (call) => ({ body: call === 1 ? reviewAnswer('INGRESO') : reviewAnswer('POR REVISAR') }),
        },
      }),
    )
    const result = await uploadPrintedSamples(resumed.deps, atSamples(), { samples: samples.slice(0, 1) })
    expect(result.outcome).toBe('submitted')
    expect(result.state.samples).toMatchObject({
      revisionId: REVIEW_ID,
      state: 'POR REVISAR',
      uploaded: ['muestra_33_1.pdf'],
    })
    expect(methods(resumed)).toEqual(['leeImpreso', 'solicitaRevisionSII', 'leeImpreso'])
    expect(await resumed.store.readArtefact('muestras/pdfte-crea-lista.html')).toBeNull()
    const noId = await certificationHarness(
      samplesRoutes({
        service: {
          leeImpreso: (call) => ({
            body: call === 1 ? okAnswer([0], ['cl.sii.x/1', 'INGRESO']) : reviewAnswer('POR REVISAR'),
          }),
          creaLista: { body: CREATED_REVIEW },
        },
      }),
    )
    await uploadPrintedSamples(noId.deps, atSamples(), { samples: samples.slice(0, 1) })
    expect(methods(noId)).toEqual(['leeImpreso', 'creaLista', 'solicitaRevisionSII', 'leeImpreso'])
  })

  test('a review already sent ends at once with its state and date, the stage moved on', async () => {
    const harness = await certificationHarness(
      samplesRoutes({ service: { leeImpreso: { body: reviewAnswer('EN REVISION') } } }),
    )
    const before = stateWith({
      stage: 'printedSamples',
      samples: { revisionId: 1, revisionToken: 'x', state: 'INGRESO', uploaded: ['a.pdf'] },
    })
    const result = await uploadPrintedSamples(harness.deps, before, { samples })
    expect(result).toMatchObject({ outcome: 'alreadySubmitted', detail: 'EN REVISION' })
    expect(result.state.stage).toBe('compliance')
    expect(result.state.samples).toEqual({
      revisionId: REVIEW_ID,
      revisionToken: REVIEW_TOKEN,
      state: 'EN REVISION',
      uploaded: ['a.pdf'],
      submittedAt: '2026-11-01 10:20',
    })
    expect(uploads(harness)).toHaveLength(0)
    expect(harness.events[1]).toEqual({ step: 'MUESTRAS_DONE', success: true })
    const fresh = await uploadPrintedSamples(harness.deps, atSamples(), { samples })
    expect(fresh.state.samples?.uploaded).toEqual([])
  })

  test('a portal that names no state after the submission: submitted all the same', async () => {
    const harness = await certificationHarness(
      samplesRoutes({
        service: {
          leeImpreso: (call) => ({ body: call === 1 ? reviewAnswer('APROBADO') : EMPTY_OK }),
          creaLista: { body: CREATED_REVIEW },
        },
      }),
    )
    const result = await uploadPrintedSamples(harness.deps, atSamples(), { samples: samples.slice(0, 1) })
    expect(result).toMatchObject({ outcome: 'submitted', detail: 'submitted' })
    expect(result.state.samples).toMatchObject({ state: null, uploaded: ['muestra_33_1.pdf'] })
    expect(result.state.stage).toBe('compliance')
  })

  test('a state that cannot be read again after the submission is warned about, and the stage ends submitted with the state unknown', async () => {
    for (const second of [new Error('socket hang up'), { status: 500, body: 'busy' }]) {
      const harness = await certificationHarness(
        samplesRoutes({
          service: {
            leeImpreso: (call) => (call === 1 ? { body: EMPTY_OK } : second),
            creaLista: { body: CREATED_REVIEW },
          },
        }),
      )
      const result = await uploadPrintedSamples(harness.deps, atSamples(), { samples: samples.slice(0, 1) })
      expect(result).toMatchObject({ outcome: 'submitted', detail: 'submitted' })
      expect(result.state.stage).toBe('compliance')
      expect(result.state.samples).toEqual({
        revisionId: REVIEW_ID,
        revisionToken: REVIEW_TOKEN,
        state: null,
        uploaded: ['muestra_33_1.pdf'],
        submittedAt: '2026-11-15T18:30:00.000Z',
      })
      expect(harness.warnings()).toContain('sii samples state unreadable after the submission')
      expect(await harness.store.readArtefact('muestras/pdfte-estado-post-envio.html')).toBeNull()
      expect(await harness.store.readArtefact('muestras/pdfte-enviar-sii.html')).toBe(EMPTY_OK)
      expect(harness.events[1]).toEqual({ step: 'MUESTRAS_DONE', success: true })
    }
  })

  test('blocked: the sentence of the portal, nothing uploaded, the stage kept', async () => {
    const harness = await certificationHarness(samplesRoutes({ service: { leeImpreso: { body: SAMPLES_BLOCKED } } }))
    const result = await uploadPrintedSamples(harness.deps, atSamples(), { samples })
    expect(result.outcome).toBe('blocked')
    expect(result.detail).toBe("El estado de la postulacion NO es: 'DOCUMENTOS IMPRESOS'")
    expect(result.state.stage).toBe('printedSamples')
    expect(result.state.samples).toEqual({ revisionId: null, revisionToken: null, state: null, uploaded: [] })
    expect(methods(harness)).toEqual(['leeImpreso'])
    expect(harness.events[1]).toEqual({ step: 'MUESTRAS_DONE', success: false })
  })

  test('rejected at once: the detail read and summed up; a detail that cannot be read leaves the summary generic', async () => {
    const service = {
      leeImpreso: (call: number) => ({ body: call === 1 ? reviewAnswer('RECHAZADO') : reviewAnswer('RECHAZADO') }),
      creaLista: { body: CREATED_REVIEW },
    }
    const detailed = await certificationHarness(
      samplesRoutes({ service: { ...service, muestraMail: { body: detailAnswer(DETAIL_ROWS) } } }),
    )
    const result = await uploadPrintedSamples(detailed.deps, atSamples(), { samples })
    expect(result.outcome).toBe('rejected')
    expect(result.detail).toBe(
      'The SII recognised 1 document(s) as the test set (cases CASO-1: FACTURA ELECTRONICA 1) and 1 as the simulation (NOTA DE CREDITO ELECTRONICA 1). A set missing from the cases was not the envelope the SII registered for it.',
    )
    expect(result.state.stage).toBe('printedSamples')
    expect(result.state.samples).toMatchObject({
      state: 'RECHAZADO',
      summary: result.detail,
      uploaded: samples.map((s) => s.fileName),
    })
    expect(result.state.samples?.detail).toHaveLength(2)
    expect(await detailed.store.readArtefact('muestras/pdfte-detalle-revision.html')).toBe(detailAnswer(DETAIL_ROWS))
    expect(methods(detailed)).toEqual(['leeImpreso', 'creaLista', 'solicitaRevisionSII', 'leeImpreso', 'muestraMail'])
    expect(detailed.events[1]).toEqual({ step: 'MUESTRAS_DONE', success: false })
    const unreadable = await certificationHarness(
      samplesRoutes({ service: { ...service, muestraMail: new Error('socket hang up') } }),
    )
    const generic = await uploadPrintedSamples(unreadable.deps, atSamples(), { samples })
    expect(generic.outcome).toBe('rejected')
    expect(generic.detail).toBe('The SII rejected the printed samples; the detail is in the portal.')
    expect(generic.state.samples?.detail).toEqual([])
    expect(await unreadable.store.readArtefact('muestras/pdfte-detalle-revision.html')).toBeNull()
  })

  test('no samples is a missing field; an upload that fails leaves the names uploaded so far in the state', async () => {
    const quiet = await certificationHarness([])
    const error = await failure(uploadPrintedSamples(quiet.deps, atSamples(), { samples: [] }))
    expect(error.code).toBe('MISSING_FIELD')
    expect(error.details).toEqual({ field: 'samples' })
    expect(quiet.urls()).toEqual([])
    const failing = await certificationHarness(
      samplesRoutes({
        service: { leeImpreso: { body: reviewAnswer('INGRESO') } },
        uploads: [{ body: 'ok' }, { status: 413, body: 'too large' }],
      }),
    )
    const refused = await failure(uploadPrintedSamples(failing.deps, atSamples(), { samples }))
    expect(refused.code).toBe('SII_PORTAL_REJECTED')
    expect((await failing.store.load())?.samples).toMatchObject({
      revisionId: REVIEW_ID,
      uploaded: ['muestra_33_1.pdf'],
    })
    const broken = await certificationHarness(
      samplesRoutes({ service: { leeImpreso: { body: reviewAnswer('APROBADO') }, creaLista: { body: EXCEPTION } } }),
    )
    expect((await failure(uploadPrintedSamples(broken.deps, atSamples(), { samples }))).code).toBe(
      'SII_PORTAL_UNEXPECTED_PAGE',
    )
  })
})
