import { createServer, type Server } from 'node:https'
import type { AddressInfo } from 'node:net'
import { SOAP_ENDPOINTS } from '../../src/catalogs/endpoints'
import { registerClaim } from '../../src/sii/claims'
import type { SiiClient } from '../../src/sii/client'
import { createNodeHttpsTransport } from '../../src/sii/node-transport'
import { createFetchTransport, type FetchLike } from '../../src/sii/transport'
import { uploadEnvelope } from '../../src/sii/upload'
import { fixtureText } from '../support/fixtures'
import { cachedSii, expectCode } from '../support/sii-client'

// A server that sends `200` and the start of a reply and then stalls or resets has answered: the upload or the claim
// may already be in. Neither adapter may let the retry policy send it a second time.
const cert = fixtureText('tls-localhost.pem')
const key = fixtureText('tls-localhost.key.pem')
const dte = { envelope: { kind: 'dte', xml: '<?xml version="1.0" encoding="ISO-8859-1"?>\n<EnvioDTE/>' } } as const
const CLAIM = { issuerRut: '12.345.678-5', type: 33, folio: 45, action: 'acceptContent' } as const

type Operation = (sii: SiiClient) => Promise<unknown>
const operations: [string, Operation][] = [
  ['uploadEnvelope', (sii) => uploadEnvelope(sii, dte)],
  ['registerClaim', (sii) => registerClaim(sii, CLAIM)],
]

describe('the Node adapter against a loopback server', () => {
  const state: { server: Server | null; base: string; requests: number } = { server: null, base: '', requests: 0 }

  beforeAll(async () => {
    const server = createServer({ key, cert }, (req, res) => {
      req.resume()
      req.on('end', () => {
        state.requests += 1
        if (req.url === '/reset-after-headers') {
          res.writeHead(200, { 'Content-Length': '500' })
          res.write('<RECEPCIONDTE>\n<STATUS>0', () => setTimeout(() => res.socket?.destroy(), 20))
        } else if (req.url === '/stall-after-headers') {
          res.writeHead(200, { 'Content-Length': '500' })
          res.write('<RECEPCIONDTE>\n<STATUS>0') // never ends
        } else {
          res.socket?.destroy() // reset before any answer
        }
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

  beforeEach(() => {
    state.requests = 0
  })

  const clientFor = (path: string, upload = 300) => {
    const url = `${state.base}${path}`
    return cachedSii([], {
      transport: createNodeHttpsTransport({ tls: { ca: cert }, keepAlive: false }),
      endpoints: { soap: { ...SOAP_ENDPOINTS.certification, upload: url }, claims: url },
      timeouts: { upload, soap: upload },
    }).sii
  }

  test.each(operations)('%s: a reset after the headers is one POST', async (_name, operate) => {
    await expectCode(operate(clientFor('/reset-after-headers')), 'TRANSPORT_FAILED', {
      reason: 'ECONNRESET',
      responseStarted: true,
      attempts: 1,
    })
    expect(state.requests).toBe(1)
  })

  test.each(operations)('%s: a stall after the headers is one POST', async (_name, operate) => {
    await expectCode(operate(clientFor('/stall-after-headers')), 'REQUEST_TIMEOUT', {
      responseStarted: true,
      attempts: 1,
    })
    expect(state.requests).toBe(1)
  })

  test.each(operations)('%s: a reset before any answer is still sent again', async (_name, operate) => {
    await expectCode(operate(clientFor('/reset-before-answer')), 'TRANSPORT_FAILED', { attempts: 3 })
    expect(state.requests).toBe(3)
  })
})

describe('the fetch adapter with an injected fetch', () => {
  const clientFor = (fetchFn: FetchLike) =>
    cachedSii([], {
      transport: createFetchTransport({ fetch: fetchFn }),
      endpoints: {
        soap: { ...SOAP_ENDPOINTS.certification, upload: 'https://upload.test/up' },
        claims: 'https://claims.test/c',
      },
    }).sii

  const answering = (read: () => Promise<ArrayBuffer>) => {
    const calls = { n: 0 }
    const fetchFn: FetchLike = async () => {
      calls.n += 1
      return { status: 200, headers: new Headers(), arrayBuffer: read }
    }
    return { calls, fetchFn }
  }

  test.each(operations)('%s: a body that fails to arrive is one request', async (_name, operate) => {
    const { calls, fetchFn } = answering(() =>
      Promise.reject(Object.assign(new TypeError('terminated'), { cause: { code: 'ECONNRESET' } })),
    )
    await expectCode(operate(clientFor(fetchFn)), 'TRANSPORT_FAILED', {
      reason: 'ECONNRESET',
      responseStarted: true,
      attempts: 1,
    })
    expect(calls.n).toBe(1)
  })

  test.each(operations)('%s: a failure before the headers is still sent again', async (_name, operate) => {
    const calls = { n: 0 }
    const refused: FetchLike = async () => {
      calls.n += 1
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
    }
    await expectCode(operate(clientFor(refused)), 'TRANSPORT_FAILED', { reason: 'ECONNREFUSED', attempts: 3 })
    expect(calls.n).toBe(3)
  })
})
