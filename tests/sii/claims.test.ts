import { DteError } from '../../src/errors'
import { createMemoryCapture } from '../../src/sii/capture'
import type { SiiClientOptions } from '../../src/sii/client'
import {
  listClaimEvents,
  queryReceptionDate,
  queryTransferable,
  receiverStatus,
  registerClaim,
  type ClaimDocumentInput,
} from '../../src/sii/claims'
import type { FakeReply, FakeRoute, FakeSii } from '../support/fake-sii'
import { authRoutes, cachedSii, expectCode, siiFixture, SOAP_TOKEN } from '../support/sii-client'

// Renewing a token runs the seed/token handshake, which signs with a 2048-bit key in pure JavaScript (about 0.6 s). The
// other tests start from a client whose tokens are already cached.
const SLOW = 30000
const CLAIMS = 'https://ws2.sii.cl/WSREGISTRORECLAMODTECERT/registroreclamodteservice'
const CLAIMS_PRODUCTION = 'https://ws1.sii.cl/WSREGISTRORECLAMODTE/registroreclamodteservice'
const NAMESPACE = 'http://ws.registroreclamodte.diii.sdi.sii.cl'
const doc = { issuerRut: '12.345.678-5', type: 33 as const, folio: 45 }
const ACCEPT = { ...doc, action: 'acceptContent' } as const

const fx = (name: string): FakeReply => ({ body: siiFixture(name), encoding: 'utf8' })
const utf8 = (body: string, status = 200): FakeReply => ({ status, body, encoding: 'utf8' })
const envelope = (inner: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><ns2:listarEventosHistDocResponse xmlns:ns2="${NAMESPACE}"><ns2:return>${inner}</ns2:return></ns2:listarEventosHistDocResponse></soapenv:Body></soapenv:Envelope>`
const answer = (inner: string): FakeReply => utf8(envelope(inner))
const code = (value: number | string): FakeReply => answer(`<codResp>${value}</codResp><descResp>glosa</descResp>`)
const event = (eventCode: string, date?: string): string =>
  `<listaEventosDoc><codEvento>${eventCode}</codEvento>${date === undefined ? '' : `<fechaEvento>${date}</fechaEvento>`}</listaEventosDoc>`

const answering = (reply: FakeRoute['reply'], options: Partial<SiiClientOptions> = {}) =>
  cachedSii([{ url: CLAIMS, reply }], options)
const renewing = (reply: FakeRoute['reply']) => cachedSii([...authRoutes(), { url: CLAIMS, reply }])
const posts = (fake: FakeSii, url = CLAIMS): number => fake.requests.filter((request) => request.url === url).length

type Operation = (sii: ReturnType<typeof answering>['sii'], input: ClaimDocumentInput) => Promise<unknown>
const readOperations: [string, string, string, Operation][] = [
  ['listClaimEvents', 'listarEventosHistDoc', 'claims-events.xml', listClaimEvents],
  ['queryTransferable', 'consultarDocDteCedible', 'claims-cedible-23.xml', queryTransferable],
  ['queryReceptionDate', 'consultarFechaRecepcionSii', 'claims-reception-date.xml', queryReceptionDate],
  ['receiverStatus', 'listarEventosHistDoc', 'claims-events.xml', receiverStatus],
]

describe('wire format', () => {
  test('registerClaim posts the qualified operation with unqualified parameters and the token cookie', async () => {
    const { sii, fake } = answering(fx('claims-register-ok.xml'))
    await registerClaim(sii, ACCEPT)
    expect(fake.requests).toHaveLength(1)
    const request = fake.requests[0]
    expect(request.method).toBe('POST')
    expect(request.url).toBe(CLAIMS)
    expect(request.headers['content-type']).toBe('text/xml; charset=utf-8')
    expect(request.headers.soapaction).toBe('""')
    expect(request.headers.cookie).toBe(`TOKEN=${SOAP_TOKEN}`)
    expect(request.text).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="${NAMESPACE}">` +
        '<soapenv:Body><ws:ingresarAceptacionReclamoDoc><rutEmisor>12345678</rutEmisor><dvEmisor>5</dvEmisor>' +
        '<tipoDoc>33</tipoDoc><folio>45</folio><accionDoc>ACD</accionDoc></ws:ingresarAceptacionReclamoDoc>' +
        '</soapenv:Body></soapenv:Envelope>',
    )
  })

  test.each([
    ['acceptContent', 'ACD'],
    ['claimContent', 'RCD'],
    ['acknowledgeGoods', 'ERM'],
    ['claimPartialShortfall', 'RFP'],
    ['claimTotalShortfall', 'RFT'],
  ] as const)('the %s action travels as %s', async (action, siiCode) => {
    const { sii, fake } = answering(fx('claims-register-ok.xml'))
    await registerClaim(sii, { ...doc, action })
    expect(fake.requests[0].text).toContain(`<accionDoc>${siiCode}</accionDoc></ws:ingresarAceptacionReclamoDoc>`)
  })

  test.each(readOperations)(
    '%s sends %s with the four document parameters in WSDL order',
    async (_name, method, fixture, call) => {
      const { sii, fake } = answering(fx(fixture))
      await call(sii, { issuerRut: '60.803.000-k', type: 43, folio: 7 })
      expect(fake.requests[0].text).toContain(
        `<ws:${method}><rutEmisor>60803000</rutEmisor><dvEmisor>K</dvEmisor><tipoDoc>43</tipoDoc><folio>7</folio></ws:${method}>`,
      )
      expect(fake.requests[0].text).not.toContain('accionDoc')
      expect(fake.requests[0].headers.cookie).toBe(`TOKEN=${SOAP_TOKEN}`)
    },
  )

  test('the production client posts to the production service URL', async () => {
    const { sii, fake } = cachedSii([{ url: CLAIMS_PRODUCTION, reply: fx('claims-register-ok.xml') }], {
      environment: 'production',
    })
    expect((await registerClaim(sii, ACCEPT)).ok).toBe(true)
    expect(fake.requests.map((request) => request.url)).toEqual([CLAIMS_PRODUCTION])
  })

  test('the request is UTF-8 and the reply is decoded as UTF-8', async () => {
    const memory = createMemoryCapture()
    const { sii, fake } = answering(fx('claims-events.xml'), { capture: memory.capture })
    const result = await listClaimEvents(sii, doc)
    expect(result.events[0].description).toBe('Otorga Recibo de Mercaderías o Servicios')
    const [exchange] = memory.exchanges()
    expect(exchange.request.body).toBe(fake.requests[0].text)
    expect(exchange.response?.body).toContain('Otorga Recibo de Mercaderías o Servicios')
  })
})

describe('registerClaim', () => {
  test('reads codResp and descResp; ok is true for code 0', async () => {
    const { sii } = answering(fx('claims-register-ok.xml'))
    expect(await registerClaim(sii, ACCEPT)).toEqual({
      code: 0,
      description: 'Accion completada OK',
      ok: true,
      raw: expect.stringContaining('<codResp>0</codResp>'),
    })
  })

  test('the raw field is the inner XML of return, prefixes stripped', async () => {
    const { sii } = answering(fx('claims-register-ok.xml'))
    expect((await registerClaim(sii, ACCEPT)).raw).toBe(
      '<codResp>0</codResp><descResp>Accion completada OK</descResp><rutToken>76543210</rutToken>',
    )
  })

  test('a business answer is returned, not thrown', async () => {
    const { sii } = answering(fx('claims-register-5.xml'))
    expect(await registerClaim(sii, { ...doc, action: 'claimContent' })).toMatchObject({
      code: 5,
      ok: false,
      description: 'DTE ya reclamado por 76543210-3',
    })
  })

  test.each([5, 7, 8, 11, 17, 19, -1])('code %i comes back as an answer and is sent only once', async (value) => {
    const { sii, fake } = answering(code(value))
    expect(await registerClaim(sii, ACCEPT)).toMatchObject({ code: value, ok: false, description: 'glosa' })
    expect(posts(fake)).toBe(1)
  })

  test('decodes XML entities and trims the description', async () => {
    const { sii } = answering(answer('<codResp> 0 </codResp><descResp> Acepta &amp; cierra &lt;ok&gt; </descResp>'))
    expect(await registerClaim(sii, ACCEPT)).toMatchObject({ code: 0, description: 'Acepta & cierra <ok>' })
  })

  test('validates the input before calling', async () => {
    const { sii, fake } = answering(fx('claims-register-ok.xml'))
    await expectCode(registerClaim(sii, { ...doc, action: 'approve' as never }), 'INVALID_OPTION', { field: 'action' })
    await expectCode(registerClaim(sii, { ...doc, action: 'toString' as never }), 'INVALID_OPTION', { field: 'action' })
    await expectCode(
      registerClaim(sii, { ...doc, type: 39 as never, action: 'acceptContent' }),
      'INVALID_DOCUMENT_TYPE',
      {
        type: 39,
      },
    )
    await expectCode(
      registerClaim(sii, { ...doc, type: 41 as never, action: 'acceptContent' }),
      'INVALID_DOCUMENT_TYPE',
    )
    await expectCode(registerClaim(sii, { ...doc, folio: 0, action: 'acceptContent' }), 'INVALID_FOLIO', {
      field: 'folio',
    })
    await expectCode(registerClaim(sii, { ...doc, folio: 1.5, action: 'acceptContent' }), 'INVALID_FOLIO')
    await expectCode(registerClaim(sii, { ...doc, issuerRut: 'bad', action: 'acceptContent' }), 'INVALID_RUT', {
      field: 'issuerRut',
    })
    await expectCode(registerClaim(sii, { ...doc, issuerRut: '12345678-9', action: 'acceptContent' }), 'INVALID_RUT')
    expect(fake.requests).toHaveLength(0)
  })

  test.each(readOperations)('%s validates the document before calling', async (_name, _method, _fixture, call) => {
    const { sii, fake } = answering(fx('claims-register-ok.xml'))
    await expectCode(call(sii, { ...doc, issuerRut: 'bad' }), 'INVALID_RUT', { field: 'issuerRut' })
    await expectCode(call(sii, { ...doc, type: 39 as never }), 'INVALID_DOCUMENT_TYPE', { type: 39 })
    await expectCode(call(sii, { ...doc, folio: -3 }), 'INVALID_FOLIO', { field: 'folio' })
    expect(fake.requests).toHaveLength(0)
  })
})

describe('token failures', () => {
  test(
    'HTTP 401 renews the token once and sends again',
    async () => {
      const { sii, fake } = renewing([utf8(siiFixture('soap-fault.xml'), 401), fx('claims-register-ok.xml')])
      expect((await registerClaim(sii, ACCEPT)).ok).toBe(true)
      expect(fake.requests.map((request) => request.url.split('/').pop())).toEqual([
        'registroreclamodteservice',
        'CrSeed.jws',
        'GetTokenFromSeed.jws',
        'registroreclamodteservice',
      ])
      expect(fake.requests[3].headers.cookie).toBe(`TOKEN=${SOAP_TOKEN}`)
      expect(fake.requests[3].text).toBe(fake.requests[0].text)
    },
    SLOW,
  )

  test(
    'HTTP 403 twice is SII_TOKEN_INVALID after exactly two requests',
    async () => {
      const { sii, fake } = renewing({ status: 403, body: 'denied' })
      await expectCode(registerClaim(sii, ACCEPT), 'SII_TOKEN_INVALID', {
        channel: 'soap',
        operation: 'registerClaim',
        httpStatus: 403,
        attempts: 2,
      })
      expect(posts(fake)).toBe(2)
    },
    SLOW,
  )

  test(
    'a read-only operation renews the token the same way',
    async () => {
      const { sii, fake } = renewing([{ status: 403, body: 'denied' }, fx('claims-events.xml')])
      expect((await listClaimEvents(sii, doc)).events).toHaveLength(2)
      expect(posts(fake)).toBe(2)
    },
    SLOW,
  )
})

describe('faults, HTTP errors and unreadable replies', () => {
  const fault = utf8(siiFixture('soap-fault.xml'), 500)

  test('a SOAP Fault on HTTP 500 is SII_SOAP_FAULT with the faultstring in details.reason', async () => {
    const { sii } = answering(fault)
    const error: unknown = await registerClaim(sii, ACCEPT).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(DteError)
    expect(error).toMatchObject({
      code: 'SII_SOAP_FAULT',
      details: {
        code: 'soapenv:Server',
        reason: 'Error de Autenticacion: TOKEN invalido',
        operation: 'registerClaim',
        httpStatus: 500,
        attempts: 1,
      },
    })
    expect((error as DteError).message).not.toContain('TOKEN')
  })

  test('a token inside the fault text is redacted in details.reason', async () => {
    const leaky = (text: string): FakeReply =>
      utf8(
        `<e:Envelope xmlns:e="x"><e:Body><e:Fault><faultcode>e:Server</faultcode><faultstring>${text}</faultstring></e:Fault></e:Body></e:Envelope>`,
        500,
      )
    for (const [text, expected] of [
      ['TOKEN invalido: TOKEN=SECRET123', 'TOKEN invalido: TOKEN=[redacted]'],
      ['&lt;TOKEN&gt;SECRET123&lt;/TOKEN&gt;', '<TOKEN>[redacted]</TOKEN>'],
    ] as const) {
      const { sii } = answering(leaky(text), { retry: false })
      const error: unknown = await registerClaim(sii, ACCEPT).catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(DteError)
      expect((error as DteError).details.reason).toBe(expected)
      expect(JSON.stringify((error as DteError).details)).not.toContain('SECRET123')
      expect((error as DteError).message).not.toContain('SECRET123')
    }
  })

  test('the Fault is read on a read-only operation too, and never retried', async () => {
    const { sii, fake, sleeps } = answering(fault, { retry: { maxAttempts: 6 } })
    await expectCode(listClaimEvents(sii, doc), 'SII_SOAP_FAULT', {
      code: 'soapenv:Server',
      operation: 'listClaimEvents',
      attempts: 1,
    })
    expect(posts(fake)).toBe(1)
    expect(sleeps).toEqual([])
  })

  test('a Fault inside a 200 reply is still a fault', async () => {
    const { sii } = answering(utf8(siiFixture('soap-fault.xml')), { retry: false })
    await expectCode(queryTransferable(sii, doc), 'SII_SOAP_FAULT', { code: 'soapenv:Server', httpStatus: 200 })
  })

  test('a plain HTTP 500 without a Fault stays SII_HTTP_ERROR', async () => {
    const { sii } = answering({ status: 500, body: 'Internal Server Error' }, { retry: false })
    await expectCode(listClaimEvents(sii, doc), 'SII_HTTP_ERROR', {
      httpStatus: 500,
      operation: 'listClaimEvents',
      url: CLAIMS,
      channel: 'soap',
      body: 'Internal Server Error',
    })
  })

  test.each([
    ['an HTML maintenance page', { body: siiFixture('html-maintenance.html'), encoding: 'utf8' as const }],
    ['a reply without codResp', answer('<descResp>sin codigo</descResp>')],
    ['a codResp that is not an integer', answer('<codResp>ok</codResp>')],
    ['an empty codResp', answer('<codResp></codResp>')],
    ['a SOAP body without return', utf8(siiFixture('soap-seed-ok.xml'))],
  ] as const)('%s is SII_RESPONSE_INVALID', async (_label, reply) => {
    const { sii } = answering(reply, { retry: false })
    await expectCode(registerClaim(sii, ACCEPT), 'SII_RESPONSE_INVALID', { operation: 'registerClaim' })
    await expectCode(listClaimEvents(sii, doc), 'SII_RESPONSE_INVALID', { operation: 'listClaimEvents' })
  })
})

describe('retries', () => {
  const unreadable: [string, FakeReply][] = [
    ['HTTP 503', { status: 503, body: 'down' }],
    ['HTTP 500', { status: 500, body: 'error' }],
    ['HTTP 429', { status: 429, headers: { 'Retry-After': '1' }, body: 'slow down' }],
    ['an HTML page', { body: siiFixture('html-maintenance.html'), encoding: 'utf8' }],
    ['a reply without codResp', answer('<descResp>sin codigo</descResp>')],
  ]

  test.each(unreadable)('registerClaim is not sent again after %s', async (_label, reply) => {
    const { sii, fake, sleeps } = answering(reply, { retry: { maxAttempts: 6 } })
    await expect(registerClaim(sii, ACCEPT)).rejects.toMatchObject({ details: { attempts: 1 } })
    expect(posts(fake)).toBe(1)
    expect(sleeps).toEqual([])
  })

  test('a retry policy that retries everything still cannot re-send a registered claim', async () => {
    const policy = { maxAttempts: 6, retryOn: () => true }
    const client = answering({ status: 503, body: 'down' }, { retry: policy })
    await expectCode(registerClaim(client.sii, ACCEPT), 'SII_HTTP_ERROR', { attempts: 1 })
    const perCall = answering({ status: 503, body: 'down' })
    await expectCode(registerClaim(perCall.sii, ACCEPT, { retry: policy }), 'SII_HTTP_ERROR', { attempts: 1 })
    expect([client, perCall].map((test) => posts(test.fake))).toEqual([1, 1])
  })

  test('registerClaim is retried only while no SII response has arrived, with the same bytes', async () => {
    const reset = new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' })
    const { sii, fake, sleeps } = answering([reset, new DteError('REQUEST_TIMEOUT'), fx('claims-register-ok.xml')])
    expect((await registerClaim(sii, ACCEPT)).ok).toBe(true)
    expect(posts(fake)).toBe(3)
    expect(sleeps).toEqual([2000, 3600])
    expect(new Set(fake.requests.map((request) => request.text)).size).toBe(1)
  })

  test('registerClaim gives up after the configured attempts and honours retry: false', async () => {
    const timeout = new DteError('REQUEST_TIMEOUT')
    const { sii, fake } = answering(timeout)
    await expectCode(registerClaim(sii, ACCEPT), 'REQUEST_TIMEOUT', { attempts: 3 })
    expect(posts(fake)).toBe(3)
    const perCall = answering(timeout)
    await expectCode(registerClaim(perCall.sii, ACCEPT, { retry: false }), 'REQUEST_TIMEOUT', { attempts: 1 })
    expect(posts(perCall.fake)).toBe(1)
  })

  test('a retryOn that refuses everything, on the client or on the call, means one POST', async () => {
    const timeout = new DteError('REQUEST_TIMEOUT')
    const policy = { retryOn: () => false }
    const client = answering(timeout, { retry: policy })
    await expectCode(registerClaim(client.sii, ACCEPT), 'REQUEST_TIMEOUT', { attempts: 1 })
    const perCall = answering(timeout)
    await expectCode(registerClaim(perCall.sii, ACCEPT, { retry: policy }), 'REQUEST_TIMEOUT', { attempts: 1 })
    expect([client, perCall].map((test) => posts(test.fake))).toEqual([1, 1])
    expect([client, perCall].map((test) => test.sleeps)).toEqual([[], []])
  })

  test.each(unreadable)('a read-only operation retries after %s with the normal backoff', async (_label, reply) => {
    const { sii, fake, sleeps } = answering([reply, fx('claims-events.xml')])
    expect((await listClaimEvents(sii, doc)).code).toBe(15)
    expect(posts(fake)).toBe(2)
    expect(sleeps.length).toBe(1)
  })

  test('a read-only operation stops at maxAttempts, or at the first attempt with retry: false', async () => {
    const down: FakeReply = { status: 503, body: 'down' }
    const { sii, fake, sleeps } = answering(down)
    await expectCode(queryReceptionDate(sii, doc), 'SII_HTTP_ERROR', { httpStatus: 503, attempts: 3 })
    expect(posts(fake)).toBe(3)
    expect(sleeps).toEqual([2000, 3600])
    const once = answering(down)
    await expectCode(queryTransferable(once.sii, doc, { retry: false }), 'SII_HTTP_ERROR', { attempts: 1 })
    expect(posts(once.fake)).toBe(1)
  })

  test('a read-only operation retries a connection failure too', async () => {
    const { sii, fake } = answering([
      new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' }),
      fx('claims-cedible-23.xml'),
    ])
    expect(await queryTransferable(sii, doc)).toMatchObject({ code: 23 })
    expect(posts(fake)).toBe(2)
  })
})

describe('listClaimEvents', () => {
  test('parses every event with the responsible RUT and an ISO date', async () => {
    const { sii } = answering(fx('claims-events.xml'))
    const result = await listClaimEvents(sii, doc)
    expect(result).toMatchObject({ code: 15, ok: false, description: 'Lista de eventos del documento' })
    expect(result.events).toEqual([
      {
        code: 'ERM',
        description: 'Otorga Recibo de Mercaderías o Servicios',
        responsibleRut: '12345678-5',
        date: '12-11-2026 09:30:00',
        dateIso: '2026-11-12T09:30:00',
      },
      {
        code: 'ACD',
        description: 'Acepta Contenido del Documento',
        responsibleRut: '12345678-5',
        date: '10-11-2026 10:00:00',
        dateIso: '2026-11-10T10:00:00',
      },
    ])
  })

  test('no events is an empty list', async () => {
    const { sii } = answering(fx('claims-events-none.xml'))
    expect(await listClaimEvents(sii, doc)).toMatchObject({ code: 16, ok: false, events: [] })
  })

  test('tolerates missing fields and an invalid RUT without throwing', async () => {
    const inner =
      '<codResp>15</codResp>' +
      '<listaEventosDoc><codEvento>RCD</codEvento></listaEventosDoc>' +
      '<listaEventosDoc><rutResponsable>1</rutResponsable><dvResponsable>1</dvResponsable><fechaEvento>soon</fechaEvento></listaEventosDoc>' +
      '<listaEventosDoc><rutResponsable>12345678</rutResponsable></listaEventosDoc>' +
      '<listaEventosDoc><dvResponsable>5</dvResponsable></listaEventosDoc>'
    const { sii } = answering(answer(inner))
    const result = await listClaimEvents(sii, doc)
    expect(result.description).toBe('')
    expect(result.events).toEqual([
      { code: 'RCD', description: '', responsibleRut: null, date: '', dateIso: null },
      { code: '', description: '', responsibleRut: null, date: 'soon', dateIso: null },
      { code: '', description: '', responsibleRut: null, date: '', dateIso: null },
      { code: '', description: '', responsibleRut: null, date: '', dateIso: null },
    ])
  })

  test('normalises the responsible RUT through rut.ts and decodes entities in the description', async () => {
    const inner =
      '<codResp>15</codResp><listaEventosDoc><codEvento>ACD</codEvento><descEvento>Acepta &amp; cierra</descEvento>' +
      '<rutResponsable>60803000</rutResponsable><dvResponsable>k</dvResponsable>' +
      '<fechaEvento> 01-12-2026 08:05:09 </fechaEvento></listaEventosDoc>'
    const { sii } = answering(answer(inner))
    expect((await listClaimEvents(sii, doc)).events).toEqual([
      {
        code: 'ACD',
        description: 'Acepta & cierra',
        responsibleRut: '60803000-K',
        date: '01-12-2026 08:05:09',
        dateIso: '2026-12-01T08:05:09',
      },
    ])
  })
})

describe('queryTransferable', () => {
  test.each([
    [20, false],
    [21, false],
    [22, null],
    [23, true],
    [24, false],
    [25, true],
    [0, null],
    [1, null],
    [10, null],
    [18, null],
    [-1, null],
  ])('codResp %i gives transferable %s', async (value, expected) => {
    const { sii } = answering(code(value))
    expect(await queryTransferable(sii, doc)).toMatchObject({ code: value, transferable: expected, ok: value === 0 })
  })

  test('reads the fixture', async () => {
    const { sii } = answering(fx('claims-cedible-23.xml'))
    expect(await queryTransferable(sii, doc)).toMatchObject({
      code: 23,
      description: 'Documento cedible',
      transferable: true,
    })
  })
})

describe('queryReceptionDate', () => {
  test('returns the raw string and the ISO date when it matches DD-MM-YYYY HH:MM:SS', async () => {
    const { sii } = answering(fx('claims-reception-date.xml'))
    expect(await queryReceptionDate(sii, doc)).toEqual({
      receivedAt: '2026-11-15T15:30:05',
      raw: '15-11-2026 15:30:05',
    })
  })

  test.each([
    ['blank', ' ', ' '],
    ['empty', '', ''],
    ['text that is not a date', 'Documento no recibido', 'Documento no recibido'],
    ['a date in another shape that does not parse', '15 de noviembre de 2026', '15 de noviembre de 2026'],
  ])('%s gives receivedAt null and keeps the raw string', async (_label, value, raw) => {
    const { sii } = answering(
      utf8(
        `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><ns2:consultarFechaRecepcionSiiResponse xmlns:ns2="${NAMESPACE}"><ns2:return>${value}</ns2:return></ns2:consultarFechaRecepcionSiiResponse></soapenv:Body></soapenv:Envelope>`,
      ),
    )
    expect(await queryReceptionDate(sii, doc)).toEqual({ receivedAt: null, raw })
  })

  test.each(['<ns2:return/>', '<ns2:return />', '<ns2:return xsi:nil="true"/>'])(
    'a self-closing %s is an empty answer: receivedAt null and an empty raw string',
    async (element) => {
      const { sii } = answering(
        utf8(
          `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><ns2:consultarFechaRecepcionSiiResponse xmlns:ns2="${NAMESPACE}">${element}</ns2:consultarFechaRecepcionSiiResponse></soapenv:Body></soapenv:Envelope>`,
        ),
      )
      expect(await queryReceptionDate(sii, doc)).toEqual({ receivedAt: null, raw: '' })
    },
  )

  test('a self-closing return is still invalid where a result code is required', async () => {
    const { sii } = answering(
      utf8(
        `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><ns2:r xmlns:ns2="${NAMESPACE}"><ns2:return/></ns2:r></soapenv:Body></soapenv:Envelope>`,
      ),
      { retry: false },
    )
    await expectCode(listClaimEvents(sii, doc), 'SII_RESPONSE_INVALID', { operation: 'listClaimEvents' })
  })
})

describe('receiverStatus', () => {
  test('derives the status from the latest event by date', async () => {
    const { sii } = answering(fx('claims-events.xml'))
    expect(await receiverStatus(sii, doc)).toMatchObject({
      status: 'goodsReceived',
      code: 15,
      lastEvent: { code: 'ERM' },
    })
  })

  test('the latest event wins whatever order the SII lists them in', async () => {
    const newestLast = answering(
      answer(`<codResp>15</codResp>${event('ACD', '10-11-2026 10:00:00')}${event('ERM', '12-11-2026 09:30:00')}`),
    )
    expect(await receiverStatus(newestLast.sii, doc)).toMatchObject({
      status: 'goodsReceived',
      lastEvent: { code: 'ERM' },
    })
    const newestFirst = answering(
      answer(`<codResp>15</codResp>${event('RCD', '12-11-2026 09:30:00')}${event('ACD', '10-11-2026 10:00:00')}`),
    )
    expect(await receiverStatus(newestFirst.sii, doc)).toMatchObject({ status: 'claimed', lastEvent: { code: 'RCD' } })
  })

  test.each([
    ['ACD', 'accepted'],
    ['ERM', 'goodsReceived'],
    ['RCD', 'claimed'],
    ['RFP', 'claimed'],
    ['RFT', 'claimed'],
    ['NCA', 'none'],
    ['ENC', 'none'],
    ['XYZ', 'unknown'],
    ['', 'unknown'],
    ['constructor', 'unknown'],
    ['__proto__', 'unknown'],
  ])('a last event %j gives %s', async (eventCode, expected) => {
    const { sii } = answering(
      answer(`<codResp>15</codResp>${event('ACD', '09-11-2026 08:00:00')}${event(eventCode, '10-11-2026 10:00:00')}`),
    )
    const result = await receiverStatus(sii, doc)
    expect(result.status).toBe(expected)
    expect(result.lastEvent?.code).toBe(eventCode)
  })

  test('dates that do not parse fall back to the last element', async () => {
    const { sii } = answering(answer(`<codResp>15</codResp>${event('ACD')}${event('RFT')}${event('NCA', 'later')}`))
    expect(await receiverStatus(sii, doc)).toMatchObject({ status: 'none', lastEvent: { code: 'NCA' } })
  })

  test('equal dates fall back to the last element, and an event without a date never beats one with a date', async () => {
    const equal = answering(
      answer(`<codResp>15</codResp>${event('ACD', '10-11-2026 10:00:00')}${event('RCD', '10-11-2026 10:00:00')}`),
    )
    expect(await receiverStatus(equal.sii, doc)).toMatchObject({ status: 'claimed', lastEvent: { code: 'RCD' } })
    const mixed = answering(
      answer(`<codResp>15</codResp>${event('ACD', '10-11-2026 10:00:00')}${event('RFT', 'soon')}`),
    )
    expect(await receiverStatus(mixed.sii, doc)).toMatchObject({ status: 'accepted', lastEvent: { code: 'ACD' } })
    const mixedFirst = answering(
      answer(`<codResp>15</codResp>${event('RFT', 'soon')}${event('ACD', '10-11-2026 10:00:00')}`),
    )
    expect(await receiverStatus(mixedFirst.sii, doc)).toMatchObject({ status: 'accepted', lastEvent: { code: 'ACD' } })
  })

  test.each([
    [15, 'none'],
    [16, 'none'],
    [18, 'none'],
    [0, 'unknown'],
    [9, 'unknown'],
    [14, 'unknown'],
    [-1, 'unknown'],
  ])('no events with codResp %i gives %s', async (value, expected) => {
    const { sii } = answering(answer(`<codResp>${value}</codResp>`))
    expect(await receiverStatus(sii, doc)).toEqual({ status: expected, lastEvent: null, code: value })
  })

  test('no events from the fixture is none', async () => {
    const { sii } = answering(fx('claims-events-none.xml'))
    expect(await receiverStatus(sii, doc)).toEqual({ status: 'none', lastEvent: null, code: 16 })
  })
})
