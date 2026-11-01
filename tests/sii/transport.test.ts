import { DteError } from '../../src/errors'
import {
  createFetchTransport,
  createRequestSignal,
  decodeBody,
  encodeUtf8,
  mapTransportError,
  type FetchLike,
  type HttpRequest,
} from '../../src/sii/transport'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const request = (overrides: Partial<HttpRequest> = {}): HttpRequest => ({
  method: 'POST',
  url: 'https://maullin.sii.cl/DTEWS/CrSeed.jws',
  headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
  body: encodeUtf8('<x/>'),
  timeoutMs: 1000,
  ...overrides,
})
const response = (status: number, text: string, headers: Record<string, string> = {}) => ({
  status,
  headers: new Headers(headers),
  arrayBuffer: async () => new TextEncoder().encode(text).buffer as ArrayBuffer,
})
const reply =
  (status: number, text: string, headers: Record<string, string> = {}): FetchLike =>
  async () =>
    response(status, text, headers)
const failWith =
  (error: unknown): FetchLike =>
  async () => {
    throw error
  }
const expectCode = async (promise: Promise<unknown>, code: string, reason?: string) => {
  try {
    await promise
    throw new Error('expected DteError')
  } catch (err) {
    expect(err).toBeInstanceOf(DteError)
    expect((err as DteError).code).toBe(code)
    if (reason !== undefined) expect((err as DteError).details.reason).toBe(reason)
  }
}

describe('decodeBody / encodeUtf8', () => {
  test('latin1 maps one byte per char, utf8 decodes multi-byte sequences', () => {
    expect(decodeBody(new Uint8Array([0xe1, 0x41]), 'latin1')).toBe('áA')
    expect(decodeBody(new Uint8Array([0xc3, 0xa1, 0x41]), 'utf8')).toBe('áA')
    expect(Array.from(encodeUtf8('á'))).toEqual([0xc3, 0xa1])
  })
})

describe('createRequestSignal', () => {
  test('aborts after the timeout and reports it', async () => {
    const guard = createRequestSignal(10)
    expect(guard.signal.aborted).toBe(false)
    await wait(30)
    expect(guard.signal.aborted).toBe(true)
    expect(guard.timedOut()).toBe(true)
    guard.cleanup()
  })

  test('follows the caller signal, before and after creation', async () => {
    const pre = new AbortController()
    pre.abort()
    expect(createRequestSignal(1000, pre.signal).signal.aborted).toBe(true)
    const later = new AbortController()
    const guard = createRequestSignal(1000, later.signal)
    later.abort()
    expect(guard.signal.aborted).toBe(true)
    expect(guard.timedOut()).toBe(false)
    guard.cleanup()
  })

  test('cleanup stops the timer', async () => {
    const guard = createRequestSignal(10)
    guard.cleanup()
    await wait(30)
    expect(guard.signal.aborted).toBe(false)
  })
})

describe('mapTransportError', () => {
  test.each([
    [new Error('x'), true, false, 'REQUEST_TIMEOUT', 'x'],
    [new Error('x'), false, true, 'REQUEST_ABORTED', undefined],
    [
      Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } }),
      false,
      false,
      'TRANSPORT_FAILED',
      'ECONNREFUSED',
    ],
    [Object.assign(new Error('read'), { code: 'ECONNRESET' }), false, false, 'TRANSPORT_FAILED', 'ECONNRESET'],
    [
      Object.assign(new Error('fetch failed'), { cause: { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' } }),
      false,
      false,
      'TRANSPORT_TLS',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
    ],
    [
      Object.assign(new Error('fetch failed'), { cause: { code: 'ERR_TLS_CERT_ALTNAME_INVALID' } }),
      false,
      false,
      'TRANSPORT_TLS',
      'ERR_TLS_CERT_ALTNAME_INVALID',
    ],
    [
      Object.assign(new Error('fetch failed'), { cause: new Error('unable to verify the first certificate') }),
      false,
      false,
      'TRANSPORT_TLS',
      'fetch failed',
    ],
    [
      Object.assign(new Error('write EPROTO SSL routines:ssl3_read_bytes:alert'), { code: 'EPROTO' }),
      false,
      false,
      'TRANSPORT_TLS',
      'EPROTO',
    ],
    [Object.assign(new Error('write EPROTO'), { code: 'EPROTO' }), false, false, 'TRANSPORT_FAILED', 'EPROTO'],
    [
      Object.assign(new Error('getaddrinfo ENOTFOUND ssl.example.test'), { code: 'ENOTFOUND' }),
      false,
      false,
      'TRANSPORT_FAILED',
      'ENOTFOUND',
    ],
    ['string failure', false, false, 'TRANSPORT_FAILED', 'string failure'],
  ])('%p (timedOut=%s, aborted=%s) → %s', (error, timedOut, aborted, code, reason) => {
    const mapped = mapTransportError(error, timedOut, aborted)
    expect(mapped.code).toBe(code)
    if (reason !== undefined) expect(mapped.details.reason).toBe(reason)
  })

  test.each([
    [new Error('x'), true, false, 'REQUEST_TIMEOUT'],
    [new Error('x'), false, true, 'REQUEST_ABORTED'],
    [Object.assign(new Error('read'), { code: 'ECONNRESET' }), false, false, 'TRANSPORT_FAILED'],
    [Object.assign(new Error('tls'), { code: 'CERT_HAS_EXPIRED' }), false, false, 'TRANSPORT_TLS'],
  ])('responseStarted is carried into %p (timedOut=%s, aborted=%s) → %s', (error, timedOut, aborted, code) => {
    const started = mapTransportError(error, timedOut, aborted, true)
    expect(started.code).toBe(code)
    expect(started.details.responseStarted).toBe(true)
    expect(mapTransportError(error, timedOut, aborted).details).not.toHaveProperty('responseStarted')
  })

  test('a DteError passes through untouched', () => {
    const original = new DteError('TRANSPORT_FAILED', { reason: 'kept' })
    expect(mapTransportError(original, true, true)).toBe(original)
  })
})

describe('createFetchTransport', () => {
  test('maps the request and the response, lower-casing header names', async () => {
    const calls: unknown[] = []
    const fetchFn: FetchLike = async (url, init) => {
      calls.push({
        url,
        method: init.method,
        headers: init.headers,
        body: Array.from(init.body ?? []),
        redirect: init.redirect,
        hasSignal: init.signal instanceof AbortSignal,
      })
      return response(200, '<r>é</r>', { 'Content-Type': 'text/xml', 'Set-Cookie': 'TOKEN=abc' })
    }
    const transport = createFetchTransport({ fetch: fetchFn })
    const result = await transport(request())
    expect(calls).toEqual([
      {
        url: 'https://maullin.sii.cl/DTEWS/CrSeed.jws',
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
        body: Array.from(encodeUtf8('<x/>')),
        redirect: 'manual',
        hasSignal: true,
      },
    ])
    expect(result.status).toBe(200)
    expect(result.headers).toEqual({ 'content-type': 'text/xml', 'set-cookie': 'TOKEN=abc' })
    expect(decodeBody(result.body, 'utf8')).toBe('<r>é</r>')
  })

  test('joins repeated response headers with a comma and a space', async () => {
    const repeated: FetchLike = async () => ({
      status: 200,
      headers: new Headers([
        ['Set-Cookie', 'TOKEN=abc'],
        ['Set-Cookie', 'LB=two'],
        ['X-Single', 'one'],
      ]),
      arrayBuffer: async () => new ArrayBuffer(0),
    })
    const result = await createFetchTransport({ fetch: repeated })(request())
    expect(result.headers).toEqual({ 'set-cookie': 'TOKEN=abc, LB=two', 'x-single': 'one' })
  })

  test('sends and returns bytes untouched, whatever the charset', async () => {
    const sent = new Uint8Array([0x00, 0xe1, 0xff, 0x3c])
    const bodies: number[][] = []
    const fetchFn: FetchLike = async (_url, init) => {
      bodies.push(Array.from(init.body ?? []))
      return { status: 200, headers: new Headers(), arrayBuffer: async () => sent.slice().buffer }
    }
    const result = await createFetchTransport({ fetch: fetchFn })(request({ body: sent }))
    expect(bodies).toEqual([[0x00, 0xe1, 0xff, 0x3c]])
    expect(Array.from(result.body)).toEqual([0x00, 0xe1, 0xff, 0x3c])
    expect(decodeBody(result.body, 'latin1')).toBe('\u0000áÿ<')
  })

  test.each([301, 302, 401, 404, 405, 429, 500, 503])('HTTP %i is returned, never thrown', async (status) => {
    const init: unknown[] = []
    const fetchFn: FetchLike = async (_url, options) => {
      init.push(options.redirect)
      return response(status, 'page', { Location: 'https://elsewhere.test/' })
    }
    const result = await createFetchTransport({ fetch: fetchFn })(request())
    expect(result.status).toBe(status)
    expect(result.headers.location).toBe('https://elsewhere.test/')
    expect(decodeBody(result.body, 'latin1')).toBe('page')
    expect(init).toEqual(['manual'])
  })

  test('GET requests carry no body', async () => {
    const bodies: unknown[] = []
    const fetchFn: FetchLike = async (_url, init) => {
      bodies.push(init.body)
      return response(200, '{}')
    }
    await createFetchTransport({ fetch: fetchFn })(request({ method: 'GET', body: undefined }))
    expect(bodies).toEqual([undefined])
  })

  test('uses globalThis.fetch by default and fails clearly when it is missing', async () => {
    const original = globalThis.fetch
    Object.defineProperty(globalThis, 'fetch', { value: reply(204, ''), configurable: true, writable: true })
    try {
      expect((await createFetchTransport()(request())).status).toBe(204)
      Object.defineProperty(globalThis, 'fetch', { value: undefined, configurable: true, writable: true })
      await expectCode(createFetchTransport()(request()), 'TRANSPORT_UNAVAILABLE')
    } finally {
      Object.defineProperty(globalThis, 'fetch', { value: original, configurable: true, writable: true })
    }
  })

  test('timeout and caller abort', async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      })
    await expectCode(createFetchTransport({ fetch: hang })(request({ timeoutMs: 10 })), 'REQUEST_TIMEOUT')
    const controller = new AbortController()
    const pending = createFetchTransport({ fetch: hang })(request({ signal: controller.signal }))
    controller.abort()
    await expectCode(pending, 'REQUEST_ABORTED')
  })

  describe('a failure after the response headers arrived', () => {
    const readFailure =
      (read: () => Promise<ArrayBuffer>): FetchLike =>
      async () => ({
        status: 200,
        headers: new Headers(),
        arrayBuffer: read,
      })
    const expectFailure = async (promise: Promise<unknown>): Promise<DteError> => {
      const error = await promise.then(
        () => null,
        (caught: unknown) => caught,
      )
      expect(error).toBeInstanceOf(DteError)
      return error as DteError
    }

    test('a body that fails to arrive is TRANSPORT_FAILED and says the response had started', async () => {
      const reset = readFailure(() =>
        Promise.reject(Object.assign(new TypeError('terminated'), { cause: { code: 'ECONNRESET' } })),
      )
      const error = await expectFailure(createFetchTransport({ fetch: reset })(request()))
      expect(error.code).toBe('TRANSPORT_FAILED')
      expect(error.details).toEqual({ reason: 'ECONNRESET', responseStarted: true })
    })

    test('a timeout while the body streams is REQUEST_TIMEOUT and says the response had started', async () => {
      const stalled: FetchLike = async (_url, init) => ({
        status: 200,
        headers: new Headers(),
        arrayBuffer: () =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () =>
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
            )
          }),
      })
      const error = await expectFailure(createFetchTransport({ fetch: stalled })(request({ timeoutMs: 10 })))
      expect(error.code).toBe('REQUEST_TIMEOUT')
      expect(error.details).toMatchObject({ responseStarted: true })
    })

    test('a failure before the headers carries no responseStarted', async () => {
      const refused = failWith(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }))
      const error = await expectFailure(createFetchTransport({ fetch: refused })(request()))
      expect(error.code).toBe('TRANSPORT_FAILED')
      expect(error.details).not.toHaveProperty('responseStarted')
      const hang: FetchLike = (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')))
        })
      const timeout = await expectFailure(createFetchTransport({ fetch: hang })(request({ timeoutMs: 10 })))
      expect(timeout.code).toBe('REQUEST_TIMEOUT')
      expect(timeout.details).not.toHaveProperty('responseStarted')
    })
  })

  test('network and TLS failures are classified', async () => {
    await expectCode(
      createFetchTransport({
        fetch: failWith(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } })),
      })(request()),
      'TRANSPORT_FAILED',
      'ENOTFOUND',
    )
    await expectCode(
      createFetchTransport({
        fetch: failWith(Object.assign(new TypeError('fetch failed'), { cause: { code: 'CERT_HAS_EXPIRED' } })),
      })(request()),
      'TRANSPORT_TLS',
      'CERT_HAS_EXPIRED',
    )
  })
})
