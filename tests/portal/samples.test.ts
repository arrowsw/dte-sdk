import { SAMPLES_PORTAL } from '../../src/catalogs/certification'
import {
  createSamplesReview,
  readSamplesDetail,
  readSamplesReview,
  submitSamplesReview,
  uploadSample,
} from '../../src/portal/samples'
import type { Logger } from '../../src/sii/logger'
import type { FakeReply, FakeRoute, RecordedRequest } from '../support/fake-sii'
import { FIXED_NOW } from '../support/fixtures'
import { detailAnswer, EMPTY_OK, EXCEPTION, okAnswer } from '../support/gwt-answers'
import { failure, signedIn, type PortalHarness } from '../support/portal'

const BASE = SAMPLES_PORTAL.base
const SERVICE_URL = `${BASE}ServicePdfDte`
const UPLOAD_URL = `${BASE}upload`
const KNOWN = SAMPLES_PORTAL.known
const SERVICE = SAMPLES_PORTAL.serviceInterface
const BOUNDARY = `----WebKitFormBoundary${FIXED_NOW.getTime().toString(16)}`
const STRING = 'java.lang.String/2004016611'
const LONG = 'java.lang.Long/4227064769'
const TOKEN = 'BAqo'
const REVIEW_ID = 264872
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46])

const warmUp: FakeRoute = { method: 'GET', url: BASE, reply: { body: '<html>portal</html>' } }
const nocache: FakeRoute = { method: 'GET', url: `${BASE}pdfdte.nocache.js`, reply: { body: `'${KNOWN.permutation}'` } }
const service = (reply: FakeReply | FakeReply[]): FakeRoute => ({ method: 'POST', url: SERVICE_URL, reply })
const upload = (...replies: FakeReply[]): FakeRoute => ({ method: 'POST', url: UPLOAD_URL, reply: replies })
const reviewAnswer = (state: string): string =>
  `//OK[7,6,'${TOKEN}',5,4,["java.util.ArrayList/4159755760","cl.sii.sdi.dim.validaPdfDte.to.ImpresoTo/1","${state}","2026-11-01 10:20","3"],0,7]`
const servicePosts = (harness: PortalHarness): readonly RecordedRequest[] =>
  harness.fake.requests.filter((request) => request.url === SERVICE_URL)
const uploads = (harness: PortalHarness): readonly RecordedRequest[] =>
  harness.fake.requests.filter((request) => request.url === UPLOAD_URL)
const logger = (): Logger & { readonly lines: string[] } => {
  const lines: string[] = []
  const log = (message: string): void => {
    lines.push(message)
  }
  return { debug: log, info: log, warn: log, error: log, lines }
}
const retrying = { retry: { maxAttempts: 3, initialDelayMs: 1 } }

describe('readSamplesReview', () => {
  test('posts leeImpreso with the company RUT, without caching, and reads the state, the id, the token and the date', async () => {
    const harness = await signedIn([warmUp, nocache, service({ body: reviewAnswer('INGRESO') })])
    const result = await readSamplesReview(harness.portal)
    expect(result).toEqual({
      state: 'INGRESO',
      blocked: null,
      revisionId: REVIEW_ID,
      revisionToken: TOKEN,
      sentAt: '2026-11-01 10:20',
      hashes: KNOWN,
      body: reviewAnswer('INGRESO'),
    })
    expect(harness.urls()).toEqual([BASE, `${BASE}pdfdte.nocache.js`, SERVICE_URL])
    const [request] = servicePosts(harness)
    expect(request.text).toBe(`7|0|6|${BASE}|${KNOWN.policy}|${SERVICE}|leeImpreso|${STRING}|76543210-3|1|2|3|4|1|5|6|`)
    expect(request.headers).toMatchObject({
      'content-type': 'text/x-gwt-rpc; charset=UTF-8',
      'x-gwt-module-base': BASE,
      'x-gwt-permutation': KNOWN.permutation,
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      origin: 'https://www4.sii.cl',
      referer: BASE,
    })
  })

  test('reads the sentence that blocks when the portal names no state', async () => {
    const message = "El estado de la postulacion NO es: 'DOCUMENTOS IMPRESOS'"
    const harness = await signedIn([
      warmUp,
      service({ body: okAnswer([0], ['cl.sii.sdi.dim.validaPdfDte.to.ImpresoTo/1', message]) }),
    ])
    const result = await readSamplesReview(harness.portal, { gwt: KNOWN })
    expect(result).toMatchObject({ state: null, blocked: message, revisionId: null, revisionToken: null, sentAt: null })
  })

  test('any status but 200 is unexpected', async () => {
    const harness = await signedIn([warmUp, service({ status: 500, body: 'down' })])
    const error = await failure(readSamplesReview(harness.portal, { gwt: KNOWN }))
    expect(error.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect(error.details['step']).toBe('leeImpreso')
  })
})

describe('createSamplesReview', () => {
  const created = okAnswer([`'${TOKEN}'`], ['cl.sii.sdi.dim.validaPdfDte.to.ListaTo/1'])

  test('posts creaLista with the company twice and the environment flag off, and reads the review id and token', async () => {
    const harness = await signedIn([warmUp, nocache, service({ body: created })])
    await expect(createSamplesReview(harness.portal)).resolves.toEqual({
      revisionId: REVIEW_ID,
      revisionToken: TOKEN,
      hashes: KNOWN,
      body: created,
    })
    const [request] = servicePosts(harness)
    expect(request.text).toBe(
      `7|0|9|${BASE}|${KNOWN.policy}|${SERVICE}|creaLista|${STRING}|Z|76543210|3||1|2|3|4|6|5|5|5|5|5|6|7|8|9|7|8|0|`,
    )
  })

  test('the SII sentence that refuses the review is a rejection', async () => {
    const message = 'El contribuyente 76543210-3 no ha solicitado Set de pruebas.'
    const harness = await signedIn([warmUp, service({ body: okAnswer([0], [message]) })])
    const error = await failure(createSamplesReview(harness.portal, { gwt: KNOWN }))
    expect(error.code).toBe('SII_PORTAL_REJECTED')
    expect(error.details).toMatchObject({ rejection: 'samplesReviewRefused', portalMessage: message })
  })

  test('an exception, or an answer without a readable id, is unexpected', async () => {
    const exception = await signedIn([warmUp, service({ body: EXCEPTION })])
    expect((await failure(createSamplesReview(exception.portal, { gwt: KNOWN }))).code).toBe(
      'SII_PORTAL_UNEXPECTED_PAGE',
    )
    const noId = await signedIn([warmUp, service({ body: EMPTY_OK })])
    expect((await failure(createSamplesReview(noId.portal, { gwt: KNOWN }))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
  })

  test('is never retried by the transport, even when the client retries', async () => {
    const harness = await signedIn([warmUp, service({ status: 503, body: 'busy' })], retrying)
    expect((await failure(createSamplesReview(harness.portal, { gwt: KNOWN }))).code).toBe('SII_HTTP_ERROR')
    expect(servicePosts(harness)).toHaveLength(1)
    expect(harness.sleeps).toEqual([])
  })
})

describe('uploadSample', () => {
  const input = { revisionId: REVIEW_ID, fileName: 'muestra_33_1.pdf', bytes: PDF, gwt: KNOWN }

  test('posts the file, the review id and the environment flag as three parts, the referer the permutation page', async () => {
    const harness = await signedIn([warmUp, upload({ body: 'ok' })])
    await expect(uploadSample(harness.portal, input)).resolves.toEqual({ body: 'ok', attempts: 1 })
    const [request] = uploads(harness)
    expect(request.parts).toEqual([
      { name: 'Filedata', fileName: 'muestra_33_1.pdf', contentType: 'application/octet-stream', value: '%PDF' },
      { name: 'id', fileName: null, contentType: null, value: '264872' },
      { name: 'ambiente', fileName: null, contentType: null, value: 'false' },
    ])
    expect(request.headers).toMatchObject({
      'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
      referer: `${BASE}${KNOWN.permutation}.cache.html`,
      'x-dtreferer': BASE,
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      origin: 'https://www4.sii.cl',
    })
  })

  test('retries a 5xx up to four attempts with the same body, waiting 2, 4 and 6 s', async () => {
    const log = logger()
    const harness = await signedIn(
      [
        warmUp,
        upload(
          { status: 503, body: 'busy' },
          { status: 500, body: 'oops' },
          { status: 502, body: 'bad' },
          { body: 'ok' },
        ),
      ],
      { logger: log },
    )
    await expect(uploadSample(harness.portal, input)).resolves.toEqual({ body: 'ok', attempts: 4 })
    expect(harness.sleeps).toEqual([2000, 4000, 6000])
    const sent = uploads(harness)
    expect(sent).toHaveLength(4)
    expect(new Set(sent.map((request) => request.text)).size).toBe(1)
    expect(log.lines.filter((line) => line === 'sii samples upload retrying')).toHaveLength(3)
  })

  test('the fourth 5xx is the error', async () => {
    const harness = await signedIn([
      warmUp,
      upload(
        { status: 503, body: '1' },
        { status: 503, body: '2' },
        { status: 503, body: '3' },
        { status: 504, body: '4' },
      ),
    ])
    const error = await failure(uploadSample(harness.portal, input))
    expect(error.code).toBe('SII_HTTP_ERROR')
    expect(error.details['httpStatus']).toBe(504)
    expect(harness.sleeps).toEqual([2000, 4000, 6000])
    expect(uploads(harness)).toHaveLength(4)
  })

  test('a 4xx is refused at once, naming the file', async () => {
    const harness = await signedIn([warmUp, upload({ status: 413, body: '<html>too large</html>' })])
    const error = await failure(uploadSample(harness.portal, input))
    expect(error.code).toBe('SII_PORTAL_REJECTED')
    expect(error.details).toMatchObject({ rejection: 'sampleUploadRefused', file: 'muestra_33_1.pdf', httpStatus: 413 })
    expect(error.details['portalMessage']).toBe('too large')
    expect(harness.sleeps).toEqual([])
    expect(uploads(harness)).toHaveLength(1)
  })

  test('a file name that would break the part header is refused before any request', async () => {
    const harness = await signedIn([])
    for (const fileName of ['muestra"; name="id', 'x\r\n.pdf', 'x\n.pdf', 'x\r.pdf', 'say "hi".pdf']) {
      const error = await failure(uploadSample(harness.portal, { ...input, fileName }))
      expect(error.code).toBe('INVALID_OPTION')
      expect(error.details).toEqual({ field: 'fileName' })
    }
    expect(harness.urls()).toEqual([])
  })

  test('any other file name travels as it comes: spaces, brackets, another extension', async () => {
    const names = ['muestra (1) final.pdf', 'copia #2.PDF', 'muestra.xml', 'sin extension']
    const harness = await signedIn([warmUp, nocache, upload(...names.map(() => ({ body: 'ok' })))])
    for (const fileName of names) await uploadSample(harness.portal, { ...input, fileName })
    expect(uploads(harness).map((request) => request.parts[0].fileName)).toEqual(names)
  })

  test('any other status is unexpected', async () => {
    const harness = await signedIn([warmUp, upload({ status: 204 })])
    expect((await failure(uploadSample(harness.portal, input))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
  })
})

describe('submitSamplesReview', () => {
  test('posts solicitaRevisionSII with the review token and the flag off', async () => {
    const harness = await signedIn([warmUp, nocache, service({ body: EMPTY_OK })])
    await expect(submitSamplesReview(harness.portal, { revisionToken: TOKEN })).resolves.toEqual({ body: EMPTY_OK })
    const [request] = servicePosts(harness)
    expect(request.text).toBe(
      `7|0|6|${BASE}|${KNOWN.policy}|${SERVICE}|solicitaRevisionSII|${LONG}|Z|1|2|3|4|2|5|6|5|${TOKEN}|0|`,
    )
  })

  test('an answer without //OK is unexpected', async () => {
    const harness = await signedIn([warmUp, service({ body: EXCEPTION })])
    const error = await failure(submitSamplesReview(harness.portal, { revisionToken: TOKEN, gwt: KNOWN }))
    expect(error.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect(error.details['step']).toBe('solicitaRevisionSII')
  })
})

describe('readSamplesDetail', () => {
  const rows = [['1', 'muestra_33_1.pdf', 'PRUEBA', 'FACTURA ELECTRONICA', '1', 'ORIGINAL', 'CASO-1']]

  test('posts muestraMail with the review token and reads the rows', async () => {
    const harness = await signedIn([warmUp, nocache, service({ body: detailAnswer(rows) })])
    await expect(readSamplesDetail(harness.portal, { revisionToken: TOKEN })).resolves.toEqual({
      rows: [
        {
          fileName: 'muestra_33_1.pdf',
          kind: 'test',
          documentType: 'FACTURA ELECTRONICA',
          folio: 1,
          copy: 'ORIGINAL',
          caseId: 'CASO-1',
        },
      ],
      body: detailAnswer(rows),
    })
    const [request] = servicePosts(harness)
    expect(request.text).toBe(`7|0|5|${BASE}|${KNOWN.policy}|${SERVICE}|muestraMail|${LONG}|1|2|3|4|1|5|5|${TOKEN}|`)
  })

  test('a failure is logged and gives an empty detail', async () => {
    const log = logger()
    const harness = await signedIn([warmUp, service(new Error('socket hang up'))], { logger: log })
    await expect(readSamplesDetail(harness.portal, { revisionToken: TOKEN, gwt: KNOWN })).resolves.toEqual({
      rows: [],
      body: '',
    })
    expect(log.lines).toContain('sii samples detail unavailable')
  })
})
