import { DteError } from '../../src/errors'
import { createMemoryCapture } from '../../src/sii/capture'
import {
  bodyExcerpt,
  httpError,
  isNoAnswer,
  isSuccess,
  parseJson,
  readSiiResponse,
  restCall,
  restText,
  retryAfterMs,
  retryOptions,
  siiTimestampToIso,
  soapCall,
} from '../../src/sii/operation'
import { buildSoapEnvelope } from '../../src/sii/soap'
import { encodeUtf8 } from '../../src/sii/transport'
import { encodeLatin1 } from '../../src/text/latin1'
import { createFakeSii, type FakeRoute } from '../support/fake-sii'
import { expectCode, testSii } from '../support/sii-client'

describe('bodyExcerpt', () => {
  test('keeps a short body and cuts a long one at 2 000 characters', () => {
    expect(bodyExcerpt('<html/>')).toBe('<html/>')
    expect(bodyExcerpt('x'.repeat(2500))).toBe('x'.repeat(2000))
  })

  test.each([
    ['raw', '<r><TOKEN>SECRET123</TOKEN></r>', '<r><TOKEN>[redacted]</TOKEN></r>'],
    ['prefixed', '<SII:TOKEN>SECRET123</SII:TOKEN>', '<SII:TOKEN>[redacted]</SII:TOKEN>'],
    ['XML-escaped', '&lt;TOKEN&gt;SECRET123&lt;/TOKEN&gt;', '&lt;TOKEN&gt;[redacted]&lt;/TOKEN&gt;'],
    ['a seed', '<SEMILLA>000000000078</SEMILLA>', '<SEMILLA>[redacted]</SEMILLA>'],
    ['a cookie', 'TOKEN=SECRET123; Path=/', 'TOKEN=[redacted]; Path=/'],
  ])('redacts a secret: %s', (_name, body, expected) => {
    expect(bodyExcerpt(body)).toBe(expected)
  })

  test('redacts before cutting, so a secret across the cut cannot survive', () => {
    const excerpt = bodyExcerpt(`${'x'.repeat(1990)}<TOKEN>SECRET123</TOKEN>`)
    expect(excerpt).toHaveLength(2000)
    expect(excerpt).not.toContain('SECRET123')
    expect(excerpt.startsWith(`${'x'.repeat(1990)}<TOKEN>[`)).toBe(true)
  })
})

describe('operation helpers', () => {
  test('retryAfterMs reads X-Retry-After or Retry-After in seconds', () => {
    expect(retryAfterMs({ 'x-retry-after': '2' })).toBe(2000)
    expect(retryAfterMs({ 'retry-after': '0.5' })).toBe(500)
    expect(retryAfterMs({ 'retry-after': 'soon' })).toBeNull()
    expect(retryAfterMs({ 'retry-after': '-1' })).toBeNull()
    expect(retryAfterMs({})).toBeNull()
  })

  test('isSuccess and httpError', () => {
    expect(isSuccess(200)).toBe(true)
    expect(isSuccess(299)).toBe(true)
    expect(isSuccess(300)).toBe(false)
    expect(isSuccess(199)).toBe(false)
    const error = httpError(
      { status: 405, headers: { 'x-retry-after': '3' }, body: new Uint8Array() },
      'x'.repeat(3000),
      'uploadEnvelope',
      'rest',
    )
    expect(error.code).toBe('SII_HTTP_ERROR')
    expect(error.details).toEqual({
      httpStatus: 405,
      operation: 'uploadEnvelope',
      channel: 'rest',
      body: 'x'.repeat(2000),
      retryAfterMs: 3000,
    })
    expect(error.message).not.toContain('xxx')
  })

  test('readSiiResponse reads ESTADO and GLOSA or fails as invalid', () => {
    expect(
      readSiiResponse(
        '<SII:RESPUESTA><SII:RESP_HDR><ESTADO> 00 </ESTADO><GLOSA>Ok</GLOSA></SII:RESP_HDR></SII:RESPUESTA>',
        'getSeed',
      ),
    ).toEqual({ code: '00', message: 'Ok' })
    expect(readSiiResponse('<R><ESTADO>-1</ESTADO></R>', 'getSeed')).toEqual({ code: '-1', message: null })
    expect(() => readSiiResponse('<html/>', 'getSeed')).toThrow(
      expect.objectContaining({ code: 'SII_RESPONSE_INVALID', details: { operation: 'getSeed', body: '<html/>' } }),
    )
  })

  test('parseJson accepts objects only', () => {
    expect(parseJson('{"a":1}', 'x')).toEqual({ a: 1 })
    expect(() => parseJson('[1]', 'x')).toThrow(expect.objectContaining({ code: 'SII_RESPONSE_INVALID' }))
    expect(() => parseJson('null', 'x')).toThrow(expect.objectContaining({ code: 'SII_RESPONSE_INVALID' }))
    expect(() => parseJson('<html>', 'x')).toThrow(expect.objectContaining({ code: 'SII_RESPONSE_INVALID' }))
  })

  test('siiTimestampToIso normalises both SII layouts', () => {
    expect(siiTimestampToIso('2026-11-15 15:30:05')).toBe('2026-11-15T15:30:05')
    expect(siiTimestampToIso(' 15/11/2026 15:30:05 ')).toBe('2026-11-15T15:30:05')
    expect(siiTimestampToIso('15-11-2026 15:30:05')).toBe('2026-11-15T15:30:05')
    expect(siiTimestampToIso('yesterday')).toBeNull()
    expect(siiTimestampToIso(null)).toBeNull()
  })
})

const SOAP_URL = 'https://maullin.sii.cl/DTEWS/Probe.jws'
const REST_URL = 'https://apicert.sii.cl/recursos/v1/probe'

/** A client whose transport also records the timeout each request was given. */
const probe = (routes: FakeRoute[], options: Parameters<typeof testSii>[1] = {}) => {
  const fake = createFakeSii(routes)
  const timeouts: number[] = []
  const signals: (AbortSignal | undefined)[] = []
  const test = testSii([], {
    ...options,
    transport: async (request) => {
      timeouts.push(request.timeoutMs)
      signals.push(request.signal)
      return fake.transport(request)
    },
  })
  return { ...test, fake, timeouts, signals }
}

const soapReply = (inner: string): string =>
  `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><ns1:probeResponse xmlns:ns1="http://DefaultNamespace"><probeReturn>${inner}</probeReturn></ns1:probeResponse></soapenv:Body></soapenv:Envelope>`

describe('soapCall', () => {
  const input = {
    operation: 'probe',
    url: SOAP_URL,
    method: 'probe',
    params: [{ name: 'texto', value: 'año' }],
    attempt: 1,
  }

  test('sends the envelope as UTF-8 and reads the reply as Latin-1', async () => {
    const { sii, fake, timeouts } = probe([{ url: SOAP_URL, reply: { body: soapReply('Acción &amp;lt; señal') } }])
    expect(await soapCall(sii, input)).toBe('Acción &lt; señal')
    expect(fake.requests[0].method).toBe('POST')
    expect(fake.requests[0].headers['content-type']).toBe('text/xml; charset=utf-8')
    expect(fake.requests[0].headers.soapaction).toBe('')
    // `ñ` is the two bytes C3 B1 on the wire (UTF-8), not the single byte F1 the replies use.
    expect(Array.from(fake.requests[0].body!)).toEqual(Array.from(encodeUtf8(buildSoapEnvelope(input))))
    expect(Array.from(fake.requests[0].body!)).toContain(0xc3)
    expect(fake.requests[0].headers['content-length']).toBe(String(fake.requests[0].body!.length))
    expect(timeouts).toEqual([sii.timeouts.soap])
  })

  test('the reply is Latin-1 whatever the bytes look like: UTF-8 bytes come out as two characters', async () => {
    const { sii } = probe([{ url: SOAP_URL, reply: { body: soapReply('señal'), encoding: 'utf8' } }])
    expect(await soapCall(sii, input)).toBe('seÃ±al')
  })

  test('the call timeout and signal are handed to the transport', async () => {
    const controller = new AbortController()
    const { sii, timeouts, signals } = probe([{ url: SOAP_URL, reply: { body: soapReply('ok') } }])
    await soapCall(sii, { ...input, overrides: { timeoutMs: 1234, signal: controller.signal } })
    expect(timeouts).toEqual([1234])
    expect(signals).toEqual([controller.signal])
  })

  test('a non-2xx status is SII_HTTP_ERROR with the Latin-1 text capped in details', async () => {
    const { sii } = probe([
      { url: SOAP_URL, reply: { status: 503, headers: { 'X-Retry-After': '4' }, body: `${'á'.repeat(2500)}` } },
    ])
    await expectCode(soapCall(sii, input), 'SII_HTTP_ERROR', {
      httpStatus: 503,
      operation: 'probe',
      channel: 'soap',
      body: 'á'.repeat(2000),
      retryAfterMs: 4000,
    })
  })

  test('a Fault is SII_SOAP_FAULT and a reply without a return element is SII_RESPONSE_INVALID', async () => {
    const fault = probe([
      {
        url: SOAP_URL,
        reply: {
          body: '<e:Envelope xmlns:e="x"><e:Body><e:Fault><faultcode>e:Server</faultcode><faultstring>Falló</faultstring></e:Fault></e:Body></e:Envelope>',
        },
      },
    ])
    await expectCode(soapCall(fault.sii, input), 'SII_SOAP_FAULT', {
      code: 'e:Server',
      reason: 'Falló',
      operation: 'probe',
    })
    const html = probe([{ url: SOAP_URL, reply: { body: '<html>mantención</html>' } }])
    await expectCode(soapCall(html.sii, input), 'SII_RESPONSE_INVALID', {
      operation: 'probe',
      body: '<html>mantención</html>',
    })
  })
})

describe('restCall and restText', () => {
  const input = {
    operation: 'probe',
    method: 'GET',
    url: REST_URL,
    headers: { Accept: 'application/json' },
    attempt: 1,
  } as const

  test('restCall returns the response and its UTF-8 text without judging the status', async () => {
    const { sii, fake, timeouts } = probe([
      { url: REST_URL, reply: { status: 404, body: '{"error":"señal"}', encoding: 'utf8' } },
    ])
    const { response, text } = await restCall(sii, input)
    expect(response.status).toBe(404)
    expect(text).toBe('{"error":"señal"}')
    expect(fake.requests[0]).toMatchObject({ method: 'GET', url: REST_URL, body: null })
    expect(fake.requests[0].headers.accept).toBe('application/json')
    expect(timeouts).toEqual([sii.timeouts.rest])
  })

  test('the reply is UTF-8 whatever the bytes look like: a lone Latin-1 byte is a replacement character', async () => {
    const { sii } = probe([{ url: REST_URL, reply: { body: 'señal' } }])
    expect((await restCall(sii, input)).text).toBe('se�al')
  })

  test('uploads use the upload timeout, a call override beats it, and the body keeps its Content-Length', async () => {
    const body = encodeUtf8('año')
    const { sii, fake, timeouts } = probe([{ url: REST_URL, reply: { body: 'ok' } }])
    await restCall(sii, { ...input, method: 'POST', body, timeoutKind: 'upload' })
    await restCall(sii, { ...input, method: 'POST', body, timeoutKind: 'upload', overrides: { timeoutMs: 99 } })
    expect(timeouts).toEqual([sii.timeouts.upload, 99])
    expect(fake.requests[0].headers['content-length']).toBe(String(body.length))
    expect(fake.requests[0].body).toEqual(body)
  })

  test('requestEncoding tells the capture how to read the request body', async () => {
    const memory = createMemoryCapture()
    const { sii } = probe([{ url: REST_URL, reply: { body: 'ok' } }], { capture: memory.capture })
    await restCall(sii, { ...input, method: 'POST', body: encodeLatin1('año'), requestEncoding: 'latin1' })
    await restCall(sii, { ...input, method: 'POST', body: encodeUtf8('año') })
    expect(memory.exchanges().map((exchange) => exchange.request.body)).toEqual(['año', 'año'])
  })

  test('restText returns the text of a 2xx and turns anything else into SII_HTTP_ERROR', async () => {
    const ok = probe([{ url: REST_URL, reply: { body: 'señal', encoding: 'utf8' } }])
    expect(await restText(ok.sii, input)).toBe('señal')
    const bad = probe([{ url: REST_URL, reply: { status: 401, body: 'sin token', encoding: 'utf8' } }])
    await expectCode(restText(bad.sii, input), 'SII_HTTP_ERROR', {
      httpStatus: 401,
      operation: 'probe',
      channel: 'rest',
      body: 'sin token',
      retryAfterMs: null,
    })
  })
})

describe('retryOptions', () => {
  test('uses the client sleep and the caller signal, and logs every retry as a warn without values', () => {
    const { sii, logger } = testSii([])
    const controller = new AbortController()
    const options = retryOptions(sii, 'getSeed', { signal: controller.signal })
    expect(options.sleep).toBe(sii.sleep)
    expect(options.signal).toBe(controller.signal)
    options.onRetry?.(new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' }), 2, 3600)
    expect(logger.lines).toEqual([
      ['warn', 'sii retrying', { operation: 'getSeed', attempt: 2, delayMs: 3600, code: 'TRANSPORT_FAILED' }],
    ])
    expect(retryOptions(sii, 'getSeed').signal).toBeUndefined()
  })
})

describe('isNoAnswer', () => {
  test.each(['TRANSPORT_FAILED', 'REQUEST_TIMEOUT'] as const)('%s happens before any SII response', (code) => {
    expect(isNoAnswer(new DteError(code))).toBe(true)
  })

  test.each([
    'SII_HTTP_ERROR',
    'SII_RESPONSE_INVALID',
    'SII_SOAP_FAULT',
    'SII_UPLOAD_REJECTED',
    'TRANSPORT_TLS',
    'REQUEST_ABORTED',
  ] as const)('%s is not retryable for a request that changes state', (code) => {
    expect(isNoAnswer(new DteError(code, { httpStatus: 503, status: '9' }))).toBe(false)
  })
})
