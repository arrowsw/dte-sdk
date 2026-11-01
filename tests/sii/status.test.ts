import { DteError } from '../../src/errors'
import type { SleepFn } from '../../src/sii/client'
import { folioReceived, queryDocumentStatus, queryUploadStatus, waitForUploadStatus } from '../../src/sii/status'
import type { FakeReply, FakeRoute } from '../support/fake-sii'
import {
  authRoutes,
  cachedSii,
  expectCode,
  REST_TOKEN,
  siiFixture,
  SOAP_TOKEN,
  testClock,
  testSii,
} from '../support/sii-client'

// A token handshake signs a seed with a 2048-bit key in pure JavaScript (about 0.6 s). Tests that are not about the
// handshake start with the tokens already cached; the ones that renew a token get more than the default 5 s.
const SLOW = 30000
const EST_UP = 'https://maullin.sii.cl/DTEWS/QueryEstUp.jws'
const EST_DTE = 'https://maullin.sii.cl/DTEWS/QueryEstDte.jws'
const REST_STATUS = 'https://apicert.sii.cl/recursos/v1/boleta.electronica.envio/10000004-0-1234567890'
const REST_DOC_BASE = 'https://apicert.sii.cl/recursos/v1/boleta.electronica/10000004-0-39-45/estado'
const REST_DOC = `${REST_DOC_BASE}?rut_receptor=12345678&dv_receptor=5&monto=1500&fechaEmision=15-11-2026`

const fx = (name: string): FakeReply => ({ body: siiFixture(name) })
const json = (name: string): FakeReply => ({ body: siiFixture(name), encoding: 'utf8' })
const restBody = (body: string): FakeReply => ({ body, encoding: 'utf8' })
const route = (url: string, reply: FakeRoute['reply']): FakeRoute[] => [{ url, reply }]
// The same route with the seed/token routes in front, for the tests whose token is rejected and must be renewed.
const withAuth = (url: string, reply: FakeRoute['reply']): FakeRoute[] => [...authRoutes(), { url, reply }]
const params = (text: string) => Array.from(text.matchAll(/<(\w+)>([^<]*)<\/\1>/g), (m) => [m[1], m[2]])
const escapeXml = (xml: string): string => xml.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// A SOAP fixture with one piece of its (escaped) payload swapped, failing loudly when the fixture has drifted.
const edited = (name: string, from: string, to: string): FakeReply => {
  const text = siiFixture(name)
  if (!text.includes(escapeXml(from))) throw new Error(`fixture ${name} does not contain ${from}`)
  return { body: text.replace(escapeXml(from), escapeXml(to)) }
}
const estadoReply = (name: string, from: string, to: string): FakeReply =>
  edited(name, `<ESTADO>${from}</ESTADO>`, `<ESTADO>${to}</ESTADO>`)

const document = {
  receiverRut: '12.345.678-5',
  type: 33 as const,
  folio: 45,
  issueDate: '2026-11-15',
  totalAmount: 119000,
}
const receiptDocument = { ...document, type: 39 as const, totalAmount: 1500 }
const requestsTo = (requests: readonly { readonly url: string }[], url: string): number =>
  requests.filter((request) => request.url === url).length

describe('queryUploadStatus (SOAP)', () => {
  test('posts getEstUp with the WSDL parameters in order and reads the counts', async () => {
    const { sii, fake } = cachedSii(route(EST_UP, fx('soap-estup-epr.xml')))
    const status = await queryUploadStatus(sii, { trackId: '9876543210' })
    expect(fake.requests).toHaveLength(1)
    expect(fake.requests[0]).toMatchObject({ method: 'POST', url: EST_UP })
    expect(fake.requests[0].headers['content-type']).toBe('text/xml; charset=utf-8')
    expect(params(fake.requests[0].text)).toEqual([
      ['RutCompania', '10000004'],
      ['DvCompania', '0'],
      ['TrackId', '9876543210'],
      ['Token', SOAP_TOKEN],
    ])
    expect(status).toEqual({
      code: 'EPR',
      status: 'accepted',
      message: 'Envio Procesado',
      trackId: '9876543210',
      channel: 'soap',
      counts: { reported: 2, accepted: 1, rejected: 1, objections: 0 },
      documentType: '33',
      documents: [],
      raw: expect.stringContaining('<ESTADO>EPR</ESTADO>'),
    })
  })

  test(
    'authenticates first when no token is cached, then asks QueryEstUp with the new token',
    async () => {
      const { sii, fake } = testSii(withAuth(EST_UP, fx('soap-estup-epr.xml')))
      expect((await queryUploadStatus(sii, { trackId: '9876543210' })).code).toBe('EPR')
      expect(fake.requests.map((request) => request.url)).toEqual([
        'https://maullin.sii.cl/DTEWS/CrSeed.jws',
        'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws',
        EST_UP,
      ])
      expect(params(fake.requests[2].text)).toContainEqual(['Token', SOAP_TOKEN])
    },
    SLOW,
  )

  test('a per-call company RUT replaces the client one', async () => {
    const { sii, fake } = cachedSii(route(EST_UP, fx('soap-estup-epr.xml')))
    await queryUploadStatus(sii, { trackId: '9876543210', companyRut: '76.543.210-3' })
    expect(params(fake.requests[0].text).slice(0, 2)).toEqual([
      ['RutCompania', '76543210'],
      ['DvCompania', '3'],
    ])
  })

  test('pending envelopes have no counts; partial counts default to zero; a missing gloss comes from the catalog', async () => {
    const rec = cachedSii(route(EST_UP, fx('soap-estup-rec.xml')))
    expect(await queryUploadStatus(rec.sii, { trackId: '9876543210' })).toMatchObject({
      code: 'REC',
      status: 'pending',
      message: 'Envio Recibido',
      counts: null,
      documentType: null,
    })
    const partial = cachedSii(
      route(
        EST_UP,
        edited(
          'soap-estup-epr.xml',
          '<ACEPTADOS>1</ACEPTADOS><RECHAZADOS>1</RECHAZADOS><REPAROS>0</REPAROS>',
          '<ACEPTADOS></ACEPTADOS><RECHAZADOS>x</RECHAZADOS>',
        ),
      ),
    )
    expect((await queryUploadStatus(partial.sii, { trackId: '9876543210' })).counts).toEqual({
      reported: 2,
      accepted: 0,
      rejected: 0,
      objections: 0,
    })
    const noGloss = cachedSii(route(EST_UP, edited('soap-estup-rec.xml', '<GLOSA>Envio Recibido</GLOSA>', '')))
    expect((await queryUploadStatus(noGloss.sii, { trackId: '9876543210' })).message).toBe(
      'Envío recibido, esperando validación',
    )
    const blankGloss = cachedSii(route(EST_UP, edited('soap-estup-rec.xml', 'Envio Recibido', '  ')))
    expect((await queryUploadStatus(blankGloss.sii, { trackId: '9876543210' })).message).toBe(
      'Envío recibido, esperando validación',
    )
  })

  test('query errors are retried with the normal policy', async () => {
    const retried = cachedSii(route(EST_UP, [fx('soap-estup-error.xml'), fx('soap-estup-epr.xml')]))
    expect((await queryUploadStatus(retried.sii, { trackId: '9876543210' })).code).toBe('EPR')
    expect(retried.sleeps).toEqual([2000])
    const dead = cachedSii(route(EST_UP, fx('soap-estup-error.xml')), { retry: { maxAttempts: 2 } })
    await expectCode(queryUploadStatus(dead.sii, { trackId: '9876543210' }), 'SII_QUERY_ERROR', {
      operation: 'queryUploadStatus',
      code: '-1',
      reason: '3',
      attempts: 2,
    })
    expect(requestsTo(dead.fake.requests, EST_UP)).toBe(2)
  })

  test('a per-call retry override applies to status queries', async () => {
    const { sii, fake } = cachedSii(route(EST_UP, fx('soap-estup-error.xml')))
    await expectCode(queryUploadStatus(sii, { trackId: '9876543210' }, { retry: false }), 'SII_QUERY_ERROR', {
      attempts: 1,
    })
    expect(fake.requests).toHaveLength(1)
  })

  test.each(['-2', '-14'])(
    '%s is a query error too, with the SII reason from GLOSA_ERR when ERR_CODE is absent',
    async (estado) => {
      const reply = edited(
        'soap-estup-error.xml',
        '<ESTADO>-1</ESTADO><ERR_CODE>3</ERR_CODE>',
        `<ESTADO>${estado}</ESTADO><GLOSA_ERR>Error SQL</GLOSA_ERR>`,
      )
      const { sii } = cachedSii(route(EST_UP, reply), { retry: false })
      await expectCode(queryUploadStatus(sii, { trackId: '9876543210' }), 'SII_QUERY_ERROR', {
        code: estado,
        reason: 'Error SQL',
      })
    },
  )

  test('a query error without ERR_CODE or GLOSA_ERR has an empty reason', async () => {
    const reply = edited('soap-estup-error.xml', '<ERR_CODE>3</ERR_CODE>', '<ERR_CODE> </ERR_CODE>')
    const { sii } = cachedSii(route(EST_UP, reply), { retry: false })
    await expectCode(queryUploadStatus(sii, { trackId: '9876543210' }), 'SII_QUERY_ERROR', { code: '-1', reason: '' })
  })

  test.each(['-3', '-13', '001', '002', '003'])(
    'token error %s renews the token once and repeats the query',
    async (estado) => {
      const rejected = estadoReply('soap-estup-token-error.xml', '001', estado)
      const { sii, fake } = cachedSii([...authRoutes(), { url: EST_UP, reply: [rejected, fx('soap-estup-epr.xml')] }])
      expect((await queryUploadStatus(sii, { trackId: '9876543210' })).code).toBe('EPR')
      expect(fake.requests.map((request) => request.url)).toEqual([
        EST_UP,
        'https://maullin.sii.cl/DTEWS/CrSeed.jws',
        'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws',
        EST_UP,
      ])
    },
    SLOW,
  )

  test(
    'a token rejected twice in a row is SII_TOKEN_INVALID after exactly one renewal',
    async () => {
      const { sii, fake } = cachedSii(withAuth(EST_UP, fx('soap-estup-token-error.xml')))
      await expectCode(queryUploadStatus(sii, { trackId: '9876543210' }), 'SII_TOKEN_INVALID', {
        channel: 'soap',
        operation: 'queryUploadStatus',
        code: '001',
        attempts: 2,
      })
      expect(requestsTo(fake.requests, EST_UP)).toBe(2)
    },
    SLOW,
  )

  test('unreadable replies are invalid, faults and HTTP errors keep their own codes', async () => {
    const empty = cachedSii(route(EST_UP, edited('soap-estup-rec.xml', '<ESTADO>REC</ESTADO>', '')), { retry: false })
    await expectCode(queryUploadStatus(empty.sii, { trackId: '9876543210' }), 'SII_RESPONSE_INVALID', {
      operation: 'queryUploadStatus',
    })
    const fault = cachedSii(route(EST_UP, fx('soap-fault.xml')), { retry: false })
    await expectCode(queryUploadStatus(fault.sii, { trackId: '9876543210' }), 'SII_SOAP_FAULT', {
      operation: 'queryUploadStatus',
    })
    const html = cachedSii(route(EST_UP, { status: 503, body: 'down' }))
    await expectCode(queryUploadStatus(html.sii, { trackId: '9876543210' }), 'SII_HTTP_ERROR', {
      httpStatus: 503,
      attempts: 3,
    })
    expect(html.sleeps).toEqual([2000, 3600])
    const reset = cachedSii(
      route(EST_UP, [new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' }), fx('soap-estup-epr.xml')]),
    )
    expect((await queryUploadStatus(reset.sii, { trackId: '9876543210' })).code).toBe('EPR')
  })

  test('without a company RUT the call is MISSING_FIELD and nothing is sent', async () => {
    const { sii, fake } = cachedSii(route(EST_UP, fx('soap-estup-epr.xml')), { companyRut: undefined })
    await expectCode(queryUploadStatus(sii, { trackId: '1' }), 'MISSING_FIELD', { field: 'companyRut' })
    await expectCode(queryUploadStatus(sii, { trackId: '1', companyRut: 'bad' }), 'INVALID_RUT', {
      field: 'companyRut',
    })
    expect(fake.requests).toHaveLength(0)
  })
})

describe('queryUploadStatus (REST)', () => {
  test('GETs the envelope status with the REST token and maps counts and documents', async () => {
    const { sii, fake } = cachedSii(route(REST_STATUS, json('rest-envelope-status.json')))
    const status = await queryUploadStatus(sii, { trackId: '1234567890', channel: 'rest' })
    expect(fake.requests).toHaveLength(1)
    expect(fake.requests[0]).toMatchObject({ method: 'GET', url: REST_STATUS })
    expect(fake.requests[0].headers.cookie).toBe(`TOKEN=${REST_TOKEN}`)
    expect(fake.requests[0].headers.accept).toBe('application/json')
    expect(status).toEqual({
      code: 'RCH',
      status: 'rejected',
      message: 'Rechazado',
      trackId: '1234567890',
      channel: 'rest',
      counts: { reported: 4, accepted: 2, rejected: 1, objections: 0 },
      documentType: null,
      documents: [
        {
          type: '39',
          folio: 7,
          code: 'RCH',
          description: 'Rechazado',
          errors: [
            {
              section: 'DTE',
              line: 12,
              level: 1,
              code: 'E001',
              description: 'Firma invalida',
              detail: 'SignatureValue',
            },
          ],
        },
        { type: '41', folio: null, code: 'RLV', description: 'Aceptado con reparos leves', errors: [] },
      ],
      raw: siiFixture('rest-envelope-status.json'),
    })
  })

  test('RLV is an accepted state on REST (it only appears per document); missing lists are empty', async () => {
    const minimal = cachedSii(route(REST_STATUS, restBody('{"estado":"RLV","detalle_rep_rech":[{"error":[{}]}]}')))
    const status = await queryUploadStatus(minimal.sii, { trackId: '1234567890', channel: 'rest' })
    expect(status).toMatchObject({ code: 'RLV', status: 'accepted', counts: null })
    expect(status.documents).toEqual([
      {
        type: '',
        folio: null,
        code: '',
        description: '',
        errors: [{ section: '', line: null, level: 0, code: '', description: '', detail: '' }],
      },
    ])
  })

  test('malformed entries in the lists read as empty values instead of failing', async () => {
    const body =
      '{"estado":"EPR","estadistica":[null,{"informados":"3"},{"aceptados":2}],' +
      '"detalle_rep_rech":[null,"x",{"tipo":39,"folio":"7","error":"bad"}]}'
    const { sii } = cachedSii(route(REST_STATUS, restBody(body)))
    const status = await queryUploadStatus(sii, { trackId: '1234567890', channel: 'rest' })
    expect(status.counts).toEqual({ reported: 0, accepted: 2, rejected: 0, objections: 0 })
    expect(status.documents).toEqual([
      { type: '', folio: null, code: '', description: '', errors: [] },
      { type: '', folio: null, code: '', description: '', errors: [] },
      { type: '39', folio: null, code: '', description: '', errors: [] },
    ])
  })

  test(
    'HTTP 401 renews the REST token once',
    async () => {
      const { sii, fake } = cachedSii(
        withAuth(REST_STATUS, [{ status: 401, body: 'x' }, json('rest-envelope-status.json')]),
      )
      expect((await queryUploadStatus(sii, { trackId: '1234567890', channel: 'rest' })).code).toBe('RCH')
      expect(fake.requests.map((request) => request.url)).toEqual([
        REST_STATUS,
        'https://apicert.sii.cl/recursos/v1/boleta.electronica.semilla',
        'https://apicert.sii.cl/recursos/v1/boleta.electronica.token',
        REST_STATUS,
      ])
    },
    SLOW,
  )

  test(
    'two 401 in a row are SII_TOKEN_INVALID',
    async () => {
      const { sii, fake } = cachedSii(withAuth(REST_STATUS, { status: 401, body: 'x' }))
      await expectCode(queryUploadStatus(sii, { trackId: '1234567890', channel: 'rest' }), 'SII_TOKEN_INVALID', {
        channel: 'rest',
        httpStatus: 401,
        attempts: 2,
      })
      expect(requestsTo(fake.requests, REST_STATUS)).toBe(2)
    },
    SLOW,
  )

  test('HTTP errors are classified and retried when transient; odd bodies are invalid', async () => {
    const broken = cachedSii(route(REST_STATUS, { status: 500, body: 'x' }))
    await expectCode(queryUploadStatus(broken.sii, { trackId: '1234567890', channel: 'rest' }), 'SII_HTTP_ERROR', {
      httpStatus: 500,
      attempts: 3,
    })
    const missing = cachedSii(route(REST_STATUS, { status: 404, body: 'x' }))
    await expectCode(queryUploadStatus(missing.sii, { trackId: '1234567890', channel: 'rest' }), 'SII_HTTP_ERROR', {
      httpStatus: 404,
      attempts: 1,
    })
    const noState = cachedSii(route(REST_STATUS, restBody('{"trackid":1}')), { retry: false })
    await expectCode(
      queryUploadStatus(noState.sii, { trackId: '1234567890', channel: 'rest' }),
      'SII_RESPONSE_INVALID',
      {
        operation: 'queryUploadStatus',
      },
    )
    const notJson = cachedSii(route(REST_STATUS, restBody('<html>')), { retry: false })
    await expectCode(queryUploadStatus(notJson.sii, { trackId: '1234567890', channel: 'rest' }), 'SII_RESPONSE_INVALID')
  })
})

describe('TrackID and channel validation', () => {
  // The TrackID goes into a URL path (REST) and into a SOAP parameter: nothing but digits may get through.
  test.each([
    '',
    ' ',
    '12 34',
    '1/../2',
    '../1234567890',
    '1234567890/estado',
    '12?x=1',
    '12#frag',
    '12%2F34',
    '1234567890\n',
    '1</TrackId><Token>x',
    '١٢٣',
    '1e5',
    '-1',
    '1'.repeat(21),
  ])('rejects the TrackID %j before sending anything', async (trackId) => {
    for (const channel of ['soap', 'rest'] as const) {
      const { sii, fake } = cachedSii(route('*', fx('soap-estup-epr.xml')))
      await expectCode(queryUploadStatus(sii, { trackId, channel }), 'INVALID_OPTION', { field: 'trackId' })
      expect(fake.requests).toHaveLength(0)
    }
  })

  test.each([undefined, null, 1234567890, {}, ['1']])(
    'rejects a TrackID that is not a string (%p)',
    async (trackId) => {
      const { sii, fake } = cachedSii(route('*', fx('soap-estup-epr.xml')))
      await expectCode(queryUploadStatus(sii, { trackId: trackId as unknown as string }), 'INVALID_OPTION', {
        field: 'trackId',
      })
      expect(fake.requests).toHaveLength(0)
    },
  )

  test('the message of the rejection carries the field, never the value', async () => {
    const { sii } = cachedSii(route('*', fx('soap-estup-epr.xml')))
    const error = await queryUploadStatus(sii, { trackId: '1/../secret' }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(DteError)
    expect((error as DteError).message).toContain('trackId')
    expect((error as DteError).message).not.toContain('secret')
  })

  test('the longest and the shortest valid TrackIDs reach the URL unchanged', async () => {
    const long = '9'.repeat(20)
    const { sii, fake } = cachedSii(route('*', json('rest-envelope-status.json')))
    await queryUploadStatus(sii, { trackId: '0', channel: 'rest' })
    await queryUploadStatus(sii, { trackId: long, channel: 'rest' })
    expect(fake.requests.map((request) => request.url)).toEqual([
      'https://apicert.sii.cl/recursos/v1/boleta.electronica.envio/10000004-0-0',
      `https://apicert.sii.cl/recursos/v1/boleta.electronica.envio/10000004-0-${long}`,
    ])
  })

  test('an unknown channel is INVALID_OPTION', async () => {
    const { sii, fake } = cachedSii(route('*', fx('soap-estup-epr.xml')))
    await expectCode(queryUploadStatus(sii, { trackId: '1', channel: 'ftp' as unknown as 'soap' }), 'INVALID_OPTION', {
      field: 'channel',
    })
    await expectCode(queryDocumentStatus(sii, { ...document, channel: 'ftp' as unknown as 'soap' }), 'INVALID_OPTION', {
      field: 'channel',
    })
    expect(fake.requests).toHaveLength(0)
  })
})

describe('waitForUploadStatus', () => {
  // A sleep that only moves the injected clock: the whole suite takes no real time.
  const manualTime = () => {
    const clock = testClock()
    const sleeps: number[] = []
    const signals: (AbortSignal | undefined)[] = []
    const sleep: SleepFn = async (ms, signal) => {
      sleeps.push(ms)
      signals.push(signal)
      clock.advance(ms)
    }
    return { clock, sleeps, signals, sleep, options: { now: clock.now, sleep } }
  }

  test('polls until a final state, treating query errors as pending', async () => {
    const { sleeps, options } = manualTime()
    const { sii, fake } = cachedSii(
      route(EST_UP, [fx('soap-estup-rec.xml'), fx('soap-estup-error.xml'), fx('soap-estup-epr.xml')]),
      { ...options, retry: false },
    )
    expect((await waitForUploadStatus(sii, { trackId: '9876543210' })).code).toBe('EPR')
    expect(sleeps).toEqual([5000, 5000])
    expect(requestsTo(fake.requests, EST_UP)).toBe(3)
  })

  test('the poll interval replaces the retry policy: a failed poll is one request, then the wait sleeps', async () => {
    const { sleeps, options } = manualTime()
    const error = fx('soap-estup-error.xml')
    const { sii, fake } = cachedSii(route(EST_UP, [error, error, fx('soap-estup-epr.xml')]), {
      ...options,
      retry: { maxAttempts: 6 },
    })
    expect((await waitForUploadStatus(sii, { trackId: '9876543210' }, { retry: { maxAttempts: 6 } })).code).toBe('EPR')
    // No 2000 ms / 3600 ms backoff inside a poll: only the wait's own 5000 ms.
    expect(sleeps).toEqual([5000, 5000])
    expect(requestsTo(fake.requests, EST_UP)).toBe(3)
  })

  test.each([
    ['a transport failure', new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' }), 'TRANSPORT_FAILED'],
    ['a timeout', new DteError('REQUEST_TIMEOUT'), 'REQUEST_TIMEOUT'],
    ['an HTTP 503', { status: 503, body: 'down' } as FakeReply, 'SII_HTTP_ERROR'],
    ['an HTTP 429', { status: 429, body: 'slow down' } as FakeReply, 'SII_HTTP_ERROR'],
    ['an unreadable page', { body: siiFixture('html-maintenance.html') } as FakeReply, 'SII_RESPONSE_INVALID'],
  ])('%s counts as pending and the wait goes on', async (_label, failure, lastCode) => {
    const { sleeps, options } = manualTime()
    const down = cachedSii(route(EST_UP, [failure, fx('soap-estup-epr.xml')]), options)
    expect((await waitForUploadStatus(down.sii, { trackId: '9876543210' })).code).toBe('EPR')
    expect(sleeps).toEqual([5000])
    const forever = cachedSii(route(EST_UP, failure), options)
    await expectCode(
      waitForUploadStatus(forever.sii, { trackId: '9876543210', intervalMs: 1000, timeoutMs: 2500 }),
      'WAIT_TIMEOUT',
      { trackId: '9876543210', attempts: 3, lastCode },
    )
  })

  test.each([
    ['EPR', 'accepted'],
    ['RPR', 'acceptedWithObjections'],
    ['RCH', 'rejected'],
    ['XYZ', 'unknown'],
  ])('%s ends the wait as %s', async (estado, expected) => {
    const { options } = manualTime()
    const { sii } = cachedSii(route(EST_UP, estadoReply('soap-estup-rec.xml', 'REC', estado)), options)
    expect(await waitForUploadStatus(sii, { trackId: '9876543210' })).toMatchObject({ code: estado, status: expected })
  })

  test('waits on the REST channel too', async () => {
    const { sleeps, options } = manualTime()
    const pending = restBody('{"estado":"REC"}')
    const { sii } = cachedSii(route(REST_STATUS, [pending, pending, json('rest-envelope-status.json')]), options)
    const status = await waitForUploadStatus(sii, { trackId: '1234567890', channel: 'rest', intervalMs: 750 })
    expect(status).toMatchObject({ code: 'RCH', channel: 'rest' })
    expect(sleeps).toEqual([750, 750])
  })

  test('times out with the number of polls and the last code seen', async () => {
    const { sleeps, options } = manualTime()
    const { sii } = cachedSii(route(EST_UP, fx('soap-estup-rec.xml')), options)
    await expectCode(
      waitForUploadStatus(sii, { trackId: '9876543210', intervalMs: 1000, timeoutMs: 2500 }),
      'WAIT_TIMEOUT',
      { trackId: '9876543210', attempts: 3, lastCode: 'REC' },
    )
    // The last sleep is cut to the 500 ms that remain, so the wait ends at 2.5 s, not later.
    expect(sleeps).toEqual([1000, 1000, 500])
  })

  test('when only query errors came back, the timeout is still WAIT_TIMEOUT and names the error code', async () => {
    const { options } = manualTime()
    const { sii } = cachedSii(route(EST_UP, fx('soap-estup-error.xml')), { ...options, retry: false })
    await expectCode(
      waitForUploadStatus(sii, { trackId: '9876543210', intervalMs: 1000, timeoutMs: 1000 }),
      'WAIT_TIMEOUT',
      { trackId: '9876543210', attempts: 1, lastCode: '-1' },
    )
  })

  test('the defaults are a 5 s interval and a 10 minute timeout', async () => {
    const { sleeps, options } = manualTime()
    const { sii } = cachedSii(route(EST_UP, fx('soap-estup-rec.xml')), options)
    await expectCode(waitForUploadStatus(sii, { trackId: '9876543210' }), 'WAIT_TIMEOUT', {
      attempts: 120,
      lastCode: 'REC',
    })
    expect(sleeps).toHaveLength(120)
    expect(new Set(sleeps)).toEqual(new Set([5000]))
  })

  test('the time spent inside the polls counts against the timeout', async () => {
    const { clock, options } = manualTime()
    const slowPoll: FakeRoute['reply'] = () => {
      clock.advance(4000)
      return fx('soap-estup-rec.xml')
    }
    const { sii, fake } = cachedSii(route(EST_UP, slowPoll), options)
    await expectCode(
      waitForUploadStatus(sii, { trackId: '9876543210', intervalMs: 1000, timeoutMs: 8000 }),
      'WAIT_TIMEOUT',
      { attempts: 2 },
    )
    // 4 s inside the first poll, 1 s of sleep, 4 s inside the second: 9 s have gone when the 8 s budget is checked.
    expect(requestsTo(fake.requests, EST_UP)).toBe(2)
  })

  describe('the timeout is a budget no poll can overrun', () => {
    // A query that costs `cost` ms of the fake clock but, like a real transport, never longer than its own timeout.
    const spending = (clock: ReturnType<typeof testClock>, cost: number, reply: () => FakeReply | DteError) => {
      const seen: { readonly timeoutMs: number; readonly remainingMs: number }[] = []
      const deadline = { at: 0 }
      const route: FakeRoute['reply'] = (request) => {
        seen.push({ timeoutMs: request.timeoutMs, remainingMs: deadline.at - clock.now().getTime() })
        clock.advance(Math.min(cost, request.timeoutMs))
        return reply()
      }
      return { seen, route, startAt: (timeoutMs: number) => void (deadline.at = clock.now().getTime() + timeoutMs) }
    }

    test('timeoutMs 10 s with query errors ends at 10 s, one request per poll and no retry sleeps', async () => {
      const { clock, sleeps, options } = manualTime()
      const spent = spending(clock, 0, () => fx('soap-estup-error.xml') as FakeReply)
      const { sii, fake } = cachedSii(route(EST_UP, spent.route), options)
      const started = clock.now().getTime()
      spent.startAt(10000)
      await expectCode(
        waitForUploadStatus(sii, { trackId: '9876543210', intervalMs: 4000, timeoutMs: 10000 }),
        'WAIT_TIMEOUT',
        { trackId: '9876543210', attempts: 3, lastCode: '-1' },
      )
      expect(clock.now().getTime() - started).toBe(10000)
      expect(sleeps).toEqual([4000, 4000, 2000])
      expect(requestsTo(fake.requests, EST_UP)).toBe(3)
    })

    test('a hanging query is cut at the time remaining, not at its normal timeout, and not retried', async () => {
      const { clock, sleeps, options } = manualTime()
      const spent = spending(clock, Number.POSITIVE_INFINITY, () => new DteError('REQUEST_TIMEOUT'))
      const { sii, fake } = cachedSii(route(EST_UP, spent.route), options)
      const started = clock.now().getTime()
      spent.startAt(40000)
      await expectCode(waitForUploadStatus(sii, { trackId: '9876543210', timeoutMs: 40000 }), 'WAIT_TIMEOUT', {
        attempts: 2,
        lastCode: 'REQUEST_TIMEOUT',
      })
      // 30 s (the normal SOAP timeout) while 40 s remain, then only the 5 s that remain after the 5 s sleep.
      expect(spent.seen.map((request) => request.timeoutMs)).toEqual([30000, 5000])
      expect(clock.now().getTime() - started).toBe(40000)
      expect(sleeps).toEqual([5000])
      expect(requestsTo(fake.requests, EST_UP)).toBe(2)
    })

    test('the timeout of a poll never exceeds the time remaining, and a per-call timeout is the normal one', async () => {
      const { clock, options } = manualTime()
      const spent = spending(clock, 3000, () => fx('soap-estup-rec.xml') as FakeReply)
      const { sii } = cachedSii(route(EST_UP, spent.route), options)
      const started = clock.now().getTime()
      spent.startAt(20000)
      await expectCode(
        waitForUploadStatus(sii, { trackId: '9876543210', intervalMs: 1500, timeoutMs: 20000 }, { timeoutMs: 4000 }),
        'WAIT_TIMEOUT',
        { lastCode: 'REC' },
      )
      expect(spent.seen.length).toBeGreaterThan(3)
      for (const request of spent.seen) {
        expect(request.timeoutMs).toBeLessThanOrEqual(4000)
        expect(request.timeoutMs).toBeLessThanOrEqual(request.remainingMs)
      }
      // The last poll got what was left, which was less than the normal 4 s.
      expect(spent.seen[spent.seen.length - 1].timeoutMs).toBeLessThan(4000)
      expect(clock.now().getTime() - started).toBe(20000)
    })

    test('the REST channel is bounded by its own, shorter, normal timeout', async () => {
      const { clock, options } = manualTime()
      const spent = spending(clock, 0, () => restBody('{"estado":"REC"}') as FakeReply)
      const { sii } = cachedSii(route(REST_STATUS, spent.route), options)
      spent.startAt(60000)
      await expectCode(
        waitForUploadStatus(sii, { trackId: '1234567890', channel: 'rest', timeoutMs: 60000 }),
        'WAIT_TIMEOUT',
        { lastCode: 'REC' },
      )
      // 15 s while that much remains (not the 30 s of SOAP), then whatever is left of the 60 s.
      expect(spent.seen.map((request) => request.timeoutMs)).toEqual([
        15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 10000, 5000,
      ])
    })

    test(
      'a token the SII refuses is still renewed during a wait, inside the same budget',
      async () => {
        const { sleeps, options } = manualTime()
        const rejected = fx('soap-estup-token-error.xml')
        const { sii, fake } = cachedSii(
          withAuth(EST_UP, [rejected, fx('soap-estup-rec.xml'), fx('soap-estup-epr.xml')]),
          options,
        )
        expect((await waitForUploadStatus(sii, { trackId: '9876543210', timeoutMs: 10000 })).code).toBe('EPR')
        expect(fake.requests.map((request) => request.url)).toEqual([
          EST_UP,
          'https://maullin.sii.cl/DTEWS/CrSeed.jws',
          'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws',
          EST_UP,
          EST_UP,
        ])
        expect(sleeps).toEqual([5000])
        // The first poll renewed the token: all three of its requests are capped at the 10 s budget, the second at the 5 s left.
        expect(fake.requests.map((request) => request.timeoutMs)).toEqual([10000, 10000, 10000, 10000, 5000])
      },
      SLOW,
    )
  })

  test('other errors end the wait at once', async () => {
    const { sleeps, options } = manualTime()
    const http = cachedSii(route(EST_UP, { status: 400, body: 'x' }), options)
    await expectCode(waitForUploadStatus(http.sii, { trackId: '9876543210' }), 'SII_HTTP_ERROR', { httpStatus: 400 })
    const refused = cachedSii(route(EST_UP, new DteError('TRANSPORT_TLS', { reason: 'CERT_HAS_EXPIRED' })), options)
    await expectCode(waitForUploadStatus(refused.sii, { trackId: '9876543210' }), 'TRANSPORT_TLS')
    const claimed = cachedSii(route(EST_UP, fx('soap-estup-rec.xml')), options)
    await expectCode(
      waitForUploadStatus(claimed.sii, { trackId: '9876543210', channel: 'ftp' as unknown as 'soap' }),
      'INVALID_OPTION',
      { field: 'channel' },
    )
    const boom = cachedSii(route(EST_UP, new Error('boom')), options)
    await expect(waitForUploadStatus(boom.sii, { trackId: '9876543210' })).rejects.toThrow('boom')
    const trackId = cachedSii(route(EST_UP, fx('soap-estup-rec.xml')), options)
    await expectCode(waitForUploadStatus(trackId.sii, { trackId: '12/34' }), 'INVALID_OPTION', { field: 'trackId' })
    expect(sleeps).toEqual([])
  })

  test('hands the caller signal to the sleep', async () => {
    const { signals, options } = manualTime()
    const controller = new AbortController()
    const { sii } = cachedSii(route(EST_UP, [fx('soap-estup-rec.xml'), fx('soap-estup-epr.xml')]), options)
    await waitForUploadStatus(sii, { trackId: '9876543210' }, { signal: controller.signal })
    expect(signals).toEqual([controller.signal])
  })

  test('an aborted signal stops the wait with REQUEST_ABORTED before any request', async () => {
    const { options } = manualTime()
    const { sii, fake } = cachedSii(route(EST_UP, fx('soap-estup-rec.xml')), options)
    const controller = new AbortController()
    controller.abort()
    await expectCode(
      waitForUploadStatus(sii, { trackId: '9876543210' }, { signal: controller.signal }),
      'REQUEST_ABORTED',
      { operation: 'waitForUploadStatus' },
    )
    expect(fake.requests).toHaveLength(0)
  })

  test('a signal that fires while sleeping stops the wait even if the sleep ignores it', async () => {
    const clock = testClock()
    const controller = new AbortController()
    const sleep: SleepFn = async (ms) => {
      clock.advance(ms)
      controller.abort()
    }
    const { sii, fake } = cachedSii(route(EST_UP, fx('soap-estup-rec.xml')), { now: clock.now, sleep })
    await expectCode(
      waitForUploadStatus(sii, { trackId: '9876543210' }, { signal: controller.signal }),
      'REQUEST_ABORTED',
      { operation: 'waitForUploadStatus' },
    )
    expect(requestsTo(fake.requests, EST_UP)).toBe(1)
  })

  test('a signal that fires during a request ends the wait with the transport error', async () => {
    const { options } = manualTime()
    const { sii } = cachedSii(route(EST_UP, new DteError('REQUEST_ABORTED')), options)
    await expectCode(waitForUploadStatus(sii, { trackId: '9876543210' }), 'REQUEST_ABORTED')
  })

  test.each([
    ['intervalMs', { intervalMs: 0 }],
    ['intervalMs', { intervalMs: -5 }],
    ['intervalMs', { intervalMs: Number.NaN }],
    ['intervalMs', { intervalMs: Number.POSITIVE_INFINITY }],
    ['timeoutMs', { timeoutMs: 0 }],
    ['timeoutMs', { timeoutMs: Number.NaN }],
    ['timeoutMs', { timeoutMs: Number.POSITIVE_INFINITY }],
  ])('rejects an invalid %s (%p) instead of polling forever', async (field, option) => {
    const { options } = manualTime()
    const { sii, fake } = cachedSii(route(EST_UP, fx('soap-estup-rec.xml')), options)
    await expectCode(waitForUploadStatus(sii, { trackId: '9876543210', ...option }), 'INVALID_OPTION', { field })
    expect(fake.requests).toHaveLength(0)
  })
})

describe('queryDocumentStatus', () => {
  test('SOAP for invoices: consultant is the sender, date as DDMMYYYY, amount rounded', async () => {
    const { sii, fake } = cachedSii(route(EST_DTE, fx('soap-estdte-dok.xml')))
    const status = await queryDocumentStatus(sii, { ...document, totalAmount: 119000.4 })
    expect(fake.requests).toHaveLength(1)
    expect(fake.requests[0]).toMatchObject({ method: 'POST', url: EST_DTE })
    expect(params(fake.requests[0].text)).toEqual([
      ['RutConsultante', '76543210'],
      ['DvConsultante', '3'],
      ['RutCompania', '10000004'],
      ['DvCompania', '0'],
      ['RutReceptor', '12345678'],
      ['DvReceptor', '5'],
      ['TipoDte', '33'],
      ['FolioDte', '45'],
      ['FechaEmisionDte', '15112026'],
      ['MontoDte', '119000'],
      ['Token', SOAP_TOKEN],
    ])
    expect(status).toEqual({
      code: 'DOK',
      status: 'received',
      message: 'Documento Recibido por el SII. Datos Coinciden con los Registrados.',
      raw: expect.stringContaining('<ESTADO>DOK</ESTADO>'),
    })
  })

  test('the consultant follows the client sender, and a per-call company replaces the client one', async () => {
    const { sii, fake } = cachedSii(route(EST_DTE, fx('soap-estdte-dok.xml')), { senderRut: '12345678-5' })
    await queryDocumentStatus(sii, { ...document, companyRut: '76543210-3' })
    expect(params(fake.requests[0].text).slice(0, 4)).toEqual([
      ['RutConsultante', '12345678'],
      ['DvConsultante', '5'],
      ['RutCompania', '76543210'],
      ['DvCompania', '3'],
    ])
  })

  test.each([
    [0.4, '0'],
    [1499.5, '1500'],
    [119000.49, '119000'],
  ])('amount %p is sent as %s', async (totalAmount, sent) => {
    const { sii, fake } = cachedSii(route(EST_DTE, fx('soap-estdte-dok.xml')))
    await queryDocumentStatus(sii, { ...document, totalAmount })
    expect(params(fake.requests[0].text)).toContainEqual(['MontoDte', sent])
  })

  test('the issue date may come as DD-MM-YYYY and a receiver verifier K is kept', async () => {
    const { sii, fake } = cachedSii(route(EST_DTE, fx('soap-estdte-dok.xml')))
    await queryDocumentStatus(sii, { ...document, issueDate: '05-01-2027', receiverRut: '14625621-k' })
    expect(params(fake.requests[0].text)).toEqual(
      expect.arrayContaining([
        ['RutReceptor', '14625621'],
        ['DvReceptor', 'K'],
        ['FechaEmisionDte', '05012027'],
      ]),
    )
  })

  test('classifies the state and falls back from GLOSA_ESTADO to GLOSA to the catalog', async () => {
    const fau = cachedSii(route(EST_DTE, fx('soap-estdte-fau.xml')))
    expect(await queryDocumentStatus(fau.sii, document)).toMatchObject({
      code: 'FAU',
      status: 'notReceived',
      message: 'DTE No Recibido por el SII.',
    })
    const glosa = cachedSii(
      route(
        EST_DTE,
        edited(
          'soap-estdte-fau.xml',
          '<GLOSA_ESTADO>DTE No Recibido por el SII.</GLOSA_ESTADO>',
          '<GLOSA>Sin registro</GLOSA>',
        ),
      ),
    )
    expect((await queryDocumentStatus(glosa.sii, document)).message).toBe('Sin registro')
    const bare = cachedSii(
      route(
        EST_DTE,
        edited(
          'soap-estdte-dok.xml',
          '<GLOSA_ESTADO>Documento Recibido por el SII. Datos Coinciden con los Registrados.</GLOSA_ESTADO>',
          '',
        ),
      ),
    )
    expect((await queryDocumentStatus(bare.sii, document)).message).toBe(
      'Documento recibido por el SII, datos coinciden',
    )
    const blank = cachedSii(
      route(
        EST_DTE,
        edited('soap-estdte-dok.xml', 'Documento Recibido por el SII. Datos Coinciden con los Registrados.', ' '),
      ),
    )
    expect((await queryDocumentStatus(blank.sii, document)).message).toBe(
      'Documento recibido por el SII, datos coinciden',
    )
  })

  test('SOAP failures: query error and token error', async () => {
    const errored = cachedSii(route(EST_DTE, fx('soap-estup-error.xml')), { retry: false })
    await expectCode(queryDocumentStatus(errored.sii, document), 'SII_QUERY_ERROR', {
      operation: 'queryDocumentStatus',
      code: '-1',
      reason: '3',
    })
    const retried = cachedSii(route(EST_DTE, [fx('soap-estup-error.xml'), fx('soap-estdte-dok.xml')]))
    expect((await queryDocumentStatus(retried.sii, document)).code).toBe('DOK')
    expect(retried.sleeps).toEqual([2000])
  })

  test(
    'a rejected token renews once',
    async () => {
      const { sii, fake } = cachedSii(withAuth(EST_DTE, [fx('soap-estup-token-error.xml'), fx('soap-estdte-dok.xml')]))
      expect((await queryDocumentStatus(sii, document)).code).toBe('DOK')
      expect(requestsTo(fake.requests, EST_DTE)).toBe(2)
    },
    SLOW,
  )

  test('unreadable replies are invalid', async () => {
    const empty = cachedSii(route(EST_DTE, edited('soap-estdte-dok.xml', '<ESTADO>DOK</ESTADO>', '')), { retry: false })
    await expectCode(queryDocumentStatus(empty.sii, document), 'SII_RESPONSE_INVALID', {
      operation: 'queryDocumentStatus',
    })
  })

  test('invalid input is rejected before anything is sent', async () => {
    const { sii, fake } = cachedSii(route('*', fx('soap-estdte-dok.xml')))
    await expectCode(queryDocumentStatus(sii, { ...document, folio: 0 }), 'INVALID_FOLIO', { field: 'folio' })
    await expectCode(queryDocumentStatus(sii, { ...document, folio: 1.5 }), 'INVALID_FOLIO', { field: 'folio' })
    await expectCode(queryDocumentStatus(sii, { ...document, folio: 2 ** 53 }), 'INVALID_FOLIO', { field: 'folio' })
    await expectCode(
      queryDocumentStatus(sii, { ...document, folio: '45/../x' as unknown as number }),
      'INVALID_FOLIO',
      { field: 'folio' },
    )
    await expectCode(queryDocumentStatus(sii, { ...document, totalAmount: Number.NaN }), 'INVALID_AMOUNT', {
      field: 'totalAmount',
    })
    await expectCode(queryDocumentStatus(sii, { ...document, totalAmount: -1 }), 'INVALID_AMOUNT', {
      field: 'totalAmount',
    })
    await expectCode(
      queryDocumentStatus(sii, { ...document, totalAmount: Number.POSITIVE_INFINITY }),
      'INVALID_AMOUNT',
      { field: 'totalAmount' },
    )
    await expectCode(queryDocumentStatus(sii, { ...document, totalAmount: 1e21 }), 'INVALID_AMOUNT', {
      field: 'totalAmount',
    })
    await expectCode(queryDocumentStatus(sii, { ...document, issueDate: '15/11/26' }), 'INVALID_DATE', {
      field: 'issueDate',
    })
    await expectCode(queryDocumentStatus(sii, { ...document, receiverRut: 'bad' }), 'INVALID_RUT', {
      field: 'receiverRut',
    })
    await expectCode(queryDocumentStatus(sii, { ...document, companyRut: 'bad' }), 'INVALID_RUT', {
      field: 'companyRut',
    })
    await expectCode(queryDocumentStatus(sii, { ...document, type: 99 as unknown as 33 }), 'INVALID_DOCUMENT_TYPE', {
      field: 'type',
    })
    await expectCode(
      queryDocumentStatus(sii, { ...document, type: '39/../x' as unknown as 39 }),
      'INVALID_DOCUMENT_TYPE',
      { field: 'type' },
    )
    const bare = cachedSii(route('*', fx('soap-estdte-dok.xml')), { companyRut: undefined })
    await expectCode(queryDocumentStatus(bare.sii, document), 'MISSING_FIELD', { field: 'companyRut' })
    expect(fake.requests).toHaveLength(0)
    expect(bare.fake.requests).toHaveLength(0)
  })

  test('REST for receipts: per-document endpoint with the query string', async () => {
    const { sii, fake } = cachedSii(route(REST_DOC, json('rest-document-status.json')))
    const status = await queryDocumentStatus(sii, receiptDocument)
    expect(fake.requests).toHaveLength(1)
    expect(fake.requests[0]).toMatchObject({ method: 'GET', url: REST_DOC })
    expect(fake.requests[0].headers.cookie).toBe(`TOKEN=${REST_TOKEN}`)
    expect(fake.requests[0].headers.accept).toBe('application/json')
    expect(status).toEqual({
      code: 'DOK',
      status: 'received',
      message: 'Documento recibido por el SII, datos coinciden',
      raw: siiFixture('rest-document-status.json'),
    })
  })

  test.each([
    [39, 'rest'],
    [41, 'rest'],
    [33, 'soap'],
    [34, 'soap'],
    [43, 'soap'],
    [46, 'soap'],
    [52, 'soap'],
    [56, 'soap'],
    [61, 'soap'],
  ] as const)('document type %s goes through the %s channel by default', async (type, channel) => {
    const { sii, fake } = cachedSii([
      { url: EST_DTE, reply: fx('soap-estdte-dok.xml') },
      { url: /boleta\.electronica\//, reply: json('rest-document-status.json') },
    ])
    await queryDocumentStatus(sii, { ...document, type })
    expect(fake.requests).toHaveLength(1)
    expect(fake.requests[0].method).toBe(channel === 'rest' ? 'GET' : 'POST')
    expect(fake.requests[0].url).toBe(
      channel === 'rest'
        ? `https://apicert.sii.cl/recursos/v1/boleta.electronica/10000004-0-${type}-45/estado?rut_receptor=12345678&dv_receptor=5&monto=119000&fechaEmision=15-11-2026`
        : EST_DTE,
    )
  })

  test('the REST query string carries the receiver verifier, the rounded amount and DD-MM-YYYY', async () => {
    const { sii, fake } = cachedSii(route('*', json('rest-document-status.json')))
    await queryDocumentStatus(sii, {
      ...receiptDocument,
      type: 41,
      folio: 123,
      receiverRut: '14625621-k',
      issueDate: '2027-01-05',
      totalAmount: 99.6,
    })
    expect(fake.requests[0].url).toBe(
      'https://apicert.sii.cl/recursos/v1/boleta.electronica/10000004-0-41-123/estado' +
        '?rut_receptor=14625621&dv_receptor=K&monto=100&fechaEmision=05-01-2027',
    )
  })

  test('a channel can be forced either way', async () => {
    const soap = cachedSii(route(EST_DTE, fx('soap-estdte-dok.xml')))
    expect((await queryDocumentStatus(soap.sii, { ...receiptDocument, channel: 'soap' })).code).toBe('DOK')
    expect(params(soap.fake.requests[0].text)).toContainEqual(['TipoDte', '39'])
    const rest = cachedSii(route('*', json('rest-document-status.json')))
    await queryDocumentStatus(rest.sii, { ...document, channel: 'rest' })
    expect(rest.fake.requests[0].url).toContain('/boleta.electronica/10000004-0-33-45/estado?')
  })

  test('REST gloss falls back to the catalog when absent or blank', async () => {
    const absent = cachedSii(route(REST_DOC, restBody('{"codigo":"FAU"}')))
    expect(await queryDocumentStatus(absent.sii, receiptDocument)).toMatchObject({
      status: 'notReceived',
      message: 'DTE no recibido por el SII',
    })
    const blank = cachedSii(route(REST_DOC, restBody('{"codigo":"DNK","descripcion":" "}')))
    expect(await queryDocumentStatus(blank.sii, receiptDocument)).toMatchObject({
      status: 'receivedWithMismatch',
      message: 'Documento recibido por el SII, datos no coinciden',
    })
  })

  test(
    'REST: HTTP 401 renews the token once; transient HTTP errors are retried; odd bodies are invalid',
    async () => {
      const renewed = cachedSii(withAuth(REST_DOC, [{ status: 401, body: 'x' }, json('rest-document-status.json')]))
      expect((await queryDocumentStatus(renewed.sii, receiptDocument)).code).toBe('DOK')
      expect(requestsTo(renewed.fake.requests, REST_DOC)).toBe(2)
      const broken = cachedSii(route(REST_DOC, { status: 500, body: 'x' }), { retry: false })
      await expectCode(queryDocumentStatus(broken.sii, receiptDocument), 'SII_HTTP_ERROR', { httpStatus: 500 })
      const recovered = cachedSii(
        route(REST_DOC, [{ status: 405, body: 'slow down' }, json('rest-document-status.json')]),
      )
      expect((await queryDocumentStatus(recovered.sii, receiptDocument)).code).toBe('DOK')
      const noCode = cachedSii(route(REST_DOC, restBody('{}')), { retry: false })
      await expectCode(queryDocumentStatus(noCode.sii, receiptDocument), 'SII_RESPONSE_INVALID', {
        operation: 'queryDocumentStatus',
      })
    },
    SLOW,
  )
})

describe('folioReceived', () => {
  const withEstado = (code: string, gloss: string): FakeReply => ({
    body: siiFixture('soap-estdte-dok.xml')
      .replace('&lt;ESTADO&gt;DOK&lt;/ESTADO&gt;', `&lt;ESTADO&gt;${code}&lt;/ESTADO&gt;`)
      .replace(/&lt;GLOSA_ESTADO&gt;[^&]*&lt;\/GLOSA_ESTADO&gt;/, `&lt;GLOSA_ESTADO&gt;${gloss}&lt;/GLOSA_ESTADO&gt;`),
  })

  test('asks QueryEstDte as the sender with the generic receiver, today and amount 1', async () => {
    const { sii, fake } = cachedSii(route(EST_DTE, fx('soap-estdte-dok.xml')))
    expect(await folioReceived(sii, { type: 33, folio: 45 })).toBe(true)
    expect(fake.requests).toHaveLength(1)
    expect(params(fake.requests[0].text)).toEqual([
      ['RutConsultante', '76543210'],
      ['DvConsultante', '3'],
      ['RutCompania', '10000004'],
      ['DvCompania', '0'],
      ['RutReceptor', '66666666'],
      ['DvReceptor', '6'],
      ['TipoDte', '33'],
      ['FolioDte', '45'],
      ['FechaEmisionDte', '15112026'],
      ['MontoDte', '1'],
      ['Token', SOAP_TOKEN],
    ])
  })

  test('always uses SOAP, even for receipts, and a per-call company RUT', async () => {
    const { sii, fake } = cachedSii(route(EST_DTE, fx('soap-estdte-fau.xml')))
    expect(await folioReceived(sii, { type: 39, folio: 7, companyRut: '76543210-3' })).toBe(false)
    expect(fake.requests[0].url).toBe(EST_DTE)
    expect(params(fake.requests[0].text)).toEqual(
      expect.arrayContaining([
        ['RutCompania', '76543210'],
        ['TipoDte', '39'],
        ['FolioDte', '7'],
      ]),
    )
  })

  test(
    'today is the date in Chile, not the UTC date',
    async () => {
      // 01:30 UTC on the 16th is 22:30 on the 15th in Chile (UTC-3 in November).
      const { sii, fake } = testSii(withAuth(EST_DTE, fx('soap-estdte-dok.xml')), {
        now: () => new Date('2026-11-16T01:30:00.000Z'),
      })
      await folioReceived(sii, { type: 33, folio: 45 })
      expect(params(fake.requests[2].text)).toContainEqual(['FechaEmisionDte', '15112026'])
      // 03:30 UTC on the 16th is 00:30 on the 16th in Chile.
      const next = testSii(withAuth(EST_DTE, fx('soap-estdte-dok.xml')), {
        now: () => new Date('2026-11-16T03:30:00.000Z'),
      })
      await folioReceived(next.sii, { type: 33, folio: 45 })
      expect(params(next.fake.requests[2].text)).toContainEqual(['FechaEmisionDte', '16112026'])
    },
    SLOW,
  )

  test.each([
    ['FAU', 'DTE No Recibido por el SII.', false],
    ['FAU', 'Documento recibido', false],
    ['DOK', 'Documento Recibido por el SII.', true],
    ['DOK', 'Sin glosa de recepción', true],
    ['DNK', 'Datos no coinciden', true],
    ['XYZ', 'Documento recibido con observaciones', true],
    ['XYZ', 'RECIBIDO', true],
    ['XYZ', 'Documento no recibido', null],
    ['XYZ', 'DTE NO  RECIBIDO por el SII', null],
    ['XYZ', 'Folio sin información', null],
    ['EMP', 'Empresa no autorizada', null],
    ['FAN', 'Folio anulado', null],
    ['TMC', 'Existe nota de crédito que modifica textos', null],
  ])('%s / %s → %s', async (code, gloss, expected) => {
    const { sii } = cachedSii(route(EST_DTE, withEstado(code, gloss)))
    expect(await folioReceived(sii, { type: 33, folio: 45 })).toBe(expected)
  })

  test('with no gloss at all the catalog message decides', async () => {
    const { sii } = cachedSii(route(EST_DTE, withEstado('XYZ', '')))
    expect(await folioReceived(sii, { type: 33, folio: 45 })).toBeNull()
  })

  test('a failed query is an error, not an undetermined answer', async () => {
    const { sii } = cachedSii(route(EST_DTE, fx('soap-estup-error.xml')), { retry: false })
    await expectCode(folioReceived(sii, { type: 33, folio: 45 }), 'SII_QUERY_ERROR', { code: '-1' })
    await expectCode(folioReceived(sii, { type: 33, folio: 0 }), 'INVALID_FOLIO', { field: 'folio' })
    await expectCode(folioReceived(sii, { type: 99 as unknown as 33, folio: 1 }), 'INVALID_DOCUMENT_TYPE')
  })
})
