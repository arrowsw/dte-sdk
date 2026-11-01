import { EventEmitter } from 'node:events'
import https, { createServer, type Server } from 'node:https'
import type { AddressInfo } from 'node:net'
import { rootCertificates } from 'node:tls'
import { DteError } from '../../src/errors'
import { agentOptions, createNodeHttpsTransport, type NodeModules } from '../../src/sii/node-transport'
import { SOAP_HEADERS } from '../../src/sii/soap'
import { decodeBody, type HttpRequest } from '../../src/sii/transport'
import { encodeLatin1 } from '../../src/text/latin1'
import { fixtureText } from '../support/fixtures'

const cert = fixtureText('tls-localhost.pem')
const key = fixtureText('tls-localhost.key.pem')
// A certificate that has nothing to do with the test server: the "unrelated extra CA" of the tests below.
const unrelatedCa = fixtureText('cert.pem')
const roots = ['ROOT-1', 'ROOT-2']
const constants = { SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION: 0x40000, SSL_OP_LEGACY_SERVER_CONNECT: 0x4 }
const loadReal = async (): Promise<NodeModules> => ({
  https: await import('node:https'),
  constants: (await import('node:crypto')).constants,
  rootCertificates: (await import('node:tls')).rootCertificates,
})

const state: { server: Server | null; base: string } = { server: null, base: '' }

beforeAll(async () => {
  const server = createServer({ key, cert }, (req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      if (req.url === '/latin1') {
        res.writeHead(200, { 'Content-Type': 'text/xml; charset=ISO-8859-1', 'X-Echo-Length': String(body.length) })
        res.end(Buffer.from([0xe1]))
      } else if (req.url === '/echo') {
        res.writeHead(201, {
          'X-Method': req.method ?? '',
          'X-Cookie': req.headers.cookie ?? '',
          'X-Soap-Action': req.headers.soapaction ?? 'none',
          'Set-Cookie': ['a=1', 'b=2'],
        })
        res.end(body)
      } else if (req.url === '/half') {
        res.writeHead(200)
        res.write('partial') // never ends
      } else if (req.url === '/cut') {
        // Headers and the start of the body, then the connection dies: the SII answered, but never finished.
        res.writeHead(200, { 'Content-Length': '500' })
        res.write('<RECEPCIONDTE>\n<STATUS>0', () => setTimeout(() => res.socket?.destroy(), 20))
      } else if (req.url !== '/slow') {
        res.writeHead(404)
        res.end()
      } // '/slow' never answers
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  state.server = server
  state.base = `https://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  state.server?.closeAllConnections()
  await new Promise<void>((resolve) => state.server?.close(() => resolve()))
})

const get = (path: string, overrides: Partial<HttpRequest> = {}): HttpRequest => ({
  method: 'GET',
  url: `${state.base}${path}`,
  headers: {},
  timeoutMs: 2000,
  ...overrides,
})
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

describe('agentOptions', () => {
  test('verifies by default and negotiates the protocol freely', () => {
    expect(agentOptions({}, constants, roots)).toEqual({ keepAlive: true, rejectUnauthorized: true })
  })

  test('tls.ca adds to the bundled public roots instead of replacing them', () => {
    expect(agentOptions({ tls: { ca: 'EXTRA' } }, constants, roots).ca).toEqual(['ROOT-1', 'ROOT-2', 'EXTRA'])
    expect(agentOptions({ tls: { ca: ['EXTRA-1', 'EXTRA-2'] } }, constants, roots).ca).toEqual([
      'ROOT-1',
      'ROOT-2',
      'EXTRA-1',
      'EXTRA-2',
    ])
    expect(agentOptions({ tls: { ca: [] } }, constants, roots).ca).toEqual(roots)
    // Without tls.ca there is nothing to add: Node keeps its own default trust (bundled roots and NODE_EXTRA_CA_CERTS).
    expect(agentOptions({ tls: {} }, constants, roots)).not.toHaveProperty('ca')
  })

  test('every knob is opt-in', () => {
    expect(
      agentOptions(
        {
          keepAlive: false,
          tls: {
            ca: ['CA1', 'CA2'],
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2',
            maxVersion: 'TLSv1.2',
            legacyRenegotiation: true,
            clientCertificate: { privateKeyPem: 'KEY', chainPem: 'CHAIN' },
          },
        },
        constants,
        roots,
      ),
    ).toEqual({
      keepAlive: false,
      rejectUnauthorized: false,
      ca: ['ROOT-1', 'ROOT-2', 'CA1', 'CA2'],
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.2',
      secureOptions: 0x40004,
      key: 'KEY',
      cert: 'CHAIN',
    })
  })
})

describe('createNodeHttpsTransport', () => {
  test('rejects a self-signed server by default with the OpenSSL code', async () => {
    await expectCode(createNodeHttpsTransport()(get('/latin1')), 'TRANSPORT_TLS', 'DEPTH_ZERO_SELF_SIGNED_CERT')
  })

  test('trusts the server through tls.ca and round-trips Latin-1 bytes', async () => {
    const transport = createNodeHttpsTransport({ tls: { ca: cert } })
    const response = await transport({
      method: 'POST',
      url: `${state.base}/latin1`,
      headers: { 'Content-Type': 'text/xml', 'Content-Length': '3' },
      body: encodeLatin1('áé!'),
      timeoutMs: 2000,
    })
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('text/xml; charset=ISO-8859-1')
    expect(response.headers['x-echo-length']).toBe('3')
    expect(Array.from(response.body)).toEqual([0xe1])
    expect(decodeBody(response.body, 'latin1')).toBe('á')
  })

  test('an extra CA does not displace the public roots: a server they vouch for stays trusted', async () => {
    // The loopback server stands in for a publicly trusted host: its certificate is one of the "bundled roots" here.
    const withRoot = async (): Promise<NodeModules> => ({ ...(await loadReal()), rootCertificates: [cert] })
    const withExtra = createNodeHttpsTransport({ tls: { ca: unrelatedCa }, keepAlive: false }, withRoot)
    expect((await withExtra(get('/echo'))).status).toBe(201)
    const twoExtras = createNodeHttpsTransport({ tls: { ca: [unrelatedCa, unrelatedCa] }, keepAlive: false }, withRoot)
    expect((await twoExtras(get('/echo'))).status).toBe(201)
    // Without that root the same extra CA cannot vouch for the server, so it is the root that made the call succeed.
    const withoutRoot = async (): Promise<NodeModules> => ({ ...(await loadReal()), rootCertificates: [] })
    await expectCode(
      createNodeHttpsTransport({ tls: { ca: unrelatedCa }, keepAlive: false }, withoutRoot)(get('/echo')),
      'TRANSPORT_TLS',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
    )
  })

  test('the extra CA itself is trusted next to the real bundled roots, which the default loader supplies', async () => {
    const spy = jest.spyOn(https, 'Agent')
    const created: unknown[] = []
    try {
      const response = await createNodeHttpsTransport({ tls: { ca: cert }, keepAlive: false })(get('/echo'))
      expect(response.status).toBe(201)
      created.push(...spy.mock.calls.map(([options]) => options))
    } finally {
      spy.mockRestore()
    }
    expect(rootCertificates.length).toBeGreaterThan(50)
    expect(created).toHaveLength(1)
    expect((created[0] as { readonly ca: readonly string[] }).ca).toEqual([...rootCertificates, cert])
  })

  test('rejectUnauthorized: false also connects (opt-in escape hatch)', async () => {
    const response = await createNodeHttpsTransport({ tls: { rejectUnauthorized: false } })(get('/echo'))
    expect(response.status).toBe(201)
  })

  test('SOAPAction goes on the wire as two quote characters', async () => {
    const response = await createNodeHttpsTransport({ tls: { ca: cert }, keepAlive: false })(
      get('/echo', { method: 'POST', headers: { ...SOAP_HEADERS, 'Content-Length': '0' } }),
    )
    expect(response.headers['x-soap-action']).toBe('""')
  })

  test('forwards headers, joins repeated response headers and echoes the body', async () => {
    const transport = createNodeHttpsTransport({ tls: { ca: cert }, keepAlive: false })
    const response = await transport({
      method: 'POST',
      url: `${state.base}/echo`,
      headers: { Cookie: 'TOKEN=abc', 'Content-Length': '2' },
      body: new Uint8Array([1, 2]),
      timeoutMs: 2000,
    })
    expect(response.headers['x-method']).toBe('POST')
    expect(response.headers['x-cookie']).toBe('TOKEN=abc')
    expect(response.headers['set-cookie']).toBe('a=1, b=2')
    expect(Array.from(response.body)).toEqual([1, 2])
  })

  test('times out before the headers and while the body streams', async () => {
    const transport = createNodeHttpsTransport({ tls: { ca: cert } })
    await expectCode(transport(get('/slow', { timeoutMs: 50 })), 'REQUEST_TIMEOUT')
    await expectCode(transport(get('/half', { timeoutMs: 50 })), 'REQUEST_TIMEOUT')
  })

  test('a failure after the response headers arrived says so; one before them does not', async () => {
    const transport = createNodeHttpsTransport({ tls: { ca: cert }, keepAlive: false })
    const detailsOf = async (promise: Promise<unknown>): Promise<DteError> => {
      const error = await promise.then(
        () => null,
        (caught: unknown) => caught,
      )
      expect(error).toBeInstanceOf(DteError)
      return error as DteError
    }
    const cut = await detailsOf(transport(get('/cut')))
    expect(cut.code).toBe('TRANSPORT_FAILED')
    expect(cut.details).toMatchObject({ reason: 'ECONNRESET', responseStarted: true })
    const stalled = await detailsOf(transport(get('/half', { timeoutMs: 50 })))
    expect(stalled.code).toBe('REQUEST_TIMEOUT')
    expect(stalled.details).toMatchObject({ responseStarted: true })
    const silent = await detailsOf(transport(get('/slow', { timeoutMs: 50 })))
    expect(silent.code).toBe('REQUEST_TIMEOUT')
    expect(silent.details).not.toHaveProperty('responseStarted')
    const refused = await detailsOf(createNodeHttpsTransport()(get('/latin1')))
    expect(refused.code).toBe('TRANSPORT_TLS')
    expect(refused.details).not.toHaveProperty('responseStarted')
  })

  describe('a request that cannot even be built', () => {
    afterEach(() => {
      jest.useRealTimers()
    })

    test.each([
      ['a URL that does not parse', { url: 'not a url' }, undefined],
      ['an illegal character in a header value', { headers: { Cookie: 'TOKEN=secret-a\nb' } }, 'secret-a'],
      ['an illegal header name', { headers: { 'Bad Name': 'x' } }, undefined],
    ] as const)('%s is TRANSPORT_FAILED with a reason, and no timer outlives it', async (_label, overrides, secret) => {
      const transport = createNodeHttpsTransport({ tls: { ca: cert }, keepAlive: false })
      await transport(get('/echo')) // loads node:https with the real timers, so the next call starts from nothing
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })
      const error = await transport(get('/echo', { ...overrides, timeoutMs: 60000 })).then(
        () => null,
        (caught: unknown) => caught,
      )
      expect(error).toBeInstanceOf(DteError)
      expect((error as DteError).code).toBe('TRANSPORT_FAILED')
      expect((error as DteError).details.reason).toEqual(expect.any(String))
      expect((error as DteError).details.reason).not.toBe('')
      if (secret !== undefined) expect(JSON.stringify(error)).not.toContain(secret)
      expect(jest.getTimerCount()).toBe(0)
    })

    test('a caller who already aborted gets REQUEST_ABORTED, not a TypeError', async () => {
      const controller = new AbortController()
      controller.abort()
      const transport = createNodeHttpsTransport({ tls: { ca: cert } })
      await expectCode(transport(get('/echo', { url: 'not a url', signal: controller.signal })), 'REQUEST_ABORTED')
    })

    test('the next request on the same transport still works', async () => {
      const transport = createNodeHttpsTransport({ tls: { ca: cert }, keepAlive: false })
      await expectCode(transport(get('/echo', { url: 'not a url' })), 'TRANSPORT_FAILED')
      expect((await transport(get('/echo'))).status).toBe(201)
    })
  })

  test('caller abort', async () => {
    const controller = new AbortController()
    const pending = createNodeHttpsTransport({ tls: { ca: cert } })(get('/slow', { signal: controller.signal }))
    controller.abort()
    await expectCode(pending, 'REQUEST_ABORTED')
  })

  test('connection refused is a transport failure with the OS code', async () => {
    const closed = createServer({ key, cert })
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve))
    const port = (closed.address() as AddressInfo).port
    await new Promise<void>((resolve) => closed.close(() => resolve()))
    await expectCode(
      createNodeHttpsTransport({ tls: { ca: cert } })(get('/', { url: `https://127.0.0.1:${port}/` })),
      'TRANSPORT_FAILED',
      'ECONNREFUSED',
    )
  })

  test('builds the request from the URL and defaults to port 443', async () => {
    const seen: Record<string, unknown>[] = []
    const fakeHttps = {
      Agent: function Agent() {},
      request: (options: Record<string, unknown>) => {
        seen.push(options)
        const req = new EventEmitter() as EventEmitter & { write: () => boolean; end: () => void }
        req.write = () => true
        req.end = () => {
          req.emit('error', Object.assign(new Error('stub'), { code: 'ECONNRESET' }))
        }
        return req
      },
    }
    const stub = createNodeHttpsTransport(
      {},
      async () => ({ https: fakeHttps, constants, rootCertificates: roots }) as unknown as NodeModules,
    )
    await expectCode(
      stub({
        method: 'POST',
        url: 'https://sii.example/cgi/up?a=1',
        headers: { A: 'b' },
        body: new Uint8Array([7]),
        timeoutMs: 1000,
      }),
      'TRANSPORT_FAILED',
      'ECONNRESET',
    )
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({
      hostname: 'sii.example',
      port: 443,
      path: '/cgi/up?a=1',
      method: 'POST',
      headers: { A: 'b' },
    })
  })

  test('loads node:https once and reports a loader failure as TRANSPORT_UNAVAILABLE', async () => {
    const counter = { loads: 0 }
    const counting = async (): Promise<NodeModules> => {
      counter.loads += 1
      return loadReal()
    }
    const transport = createNodeHttpsTransport({ tls: { ca: cert } }, counting)
    await transport(get('/echo'))
    await transport(get('/echo'))
    expect(counter.loads).toBe(1)
    const broken = createNodeHttpsTransport({}, async () => {
      throw new Error('no node here')
    })
    await expectCode(broken(get('/echo')), 'TRANSPORT_UNAVAILABLE', 'no node here')
  })
})
