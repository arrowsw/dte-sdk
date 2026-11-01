import { loadCertificateFromPem } from '../../src/certificate/pem'
import { DteError } from '../../src/errors'
import { createMemoryCapture } from '../../src/sii/capture'
import { createSiiClient } from '../../src/sii/client'
import type { Logger } from '../../src/sii/logger'
import { send } from '../../src/sii/send'
import { decodeBody, encodeUtf8 } from '../../src/sii/transport'
import { encodeLatin1 } from '../../src/text/latin1'
import { createFakeSii } from '../support/fake-sii'
import { fixtureText, FIXED_NOW } from '../support/fixtures'

const certificate = loadCertificateFromPem(
  { privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') },
  { now: FIXED_NOW },
)
const recordingLogger = (): Logger & { readonly lines: unknown[] } => {
  const lines: unknown[] = []
  const log = (level: string) => (message: string, context?: unknown) => lines.push([level, message, context])
  return { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error'), lines }
}
const ticking = () => {
  const state = { t: FIXED_NOW.getTime() }
  return () => new Date((state.t += 100))
}

describe('send', () => {
  test('performs the exchange, captures it redacted and decoded, logs it', async () => {
    const fake = createFakeSii([
      {
        url: 'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws',
        reply: { body: '<r><TOKEN>XYZ</TOKEN><G>é</G></r>', headers: { 'Set-Cookie': 'TOKEN=XYZ' } },
      },
    ])
    const memory = createMemoryCapture()
    const logger = recordingLogger()
    const sii = createSiiClient({
      environment: 'certification',
      certificate,
      transport: fake.transport,
      capture: memory.capture,
      logger,
      now: ticking(),
    })
    const body = encodeUtf8('<getToken><Semilla>1</Semilla>é</getToken>')
    const response = await send(sii, {
      operation: 'getToken',
      channel: 'soap',
      method: 'POST',
      url: 'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws',
      headers: { Cookie: 'TOKEN=OLD', 'Content-Type': 'text/xml; charset=utf-8' },
      body,
      timeoutMs: 100,
      attempt: 2,
      requestEncoding: 'utf8',
    })
    expect(response.status).toBe(200)
    expect(decodeBody(response.body, 'latin1')).toBe('<r><TOKEN>XYZ</TOKEN><G>é</G></r>')
    expect(fake.requests[0].headers.cookie).toBe('TOKEN=OLD')
    expect(fake.requests[0].headers['content-length']).toBe(String(body.length))
    expect(memory.exchanges()).toEqual([
      {
        operation: 'getToken',
        channel: 'soap',
        attempt: 2,
        request: {
          method: 'POST',
          url: 'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws',
          headers: {
            Cookie: '[redacted]',
            'Content-Type': 'text/xml; charset=utf-8',
            'Content-Length': String(body.length),
          },
          body: '<getToken><Semilla>[redacted]</Semilla>é</getToken>',
        },
        response: {
          status: 200,
          headers: { 'set-cookie': '[redacted]' },
          body: '<r><TOKEN>[redacted]</TOKEN><G>é</G></r>',
        },
        error: null,
        startedAt: '2026-11-15T18:30:00.100Z',
        durationMs: 100,
      },
    ])
    expect(logger.lines).toEqual([
      ['debug', 'sii http', { operation: 'getToken', attempt: 2, status: 200, durationMs: 100 }],
    ])
  })

  test('REST channel decodes UTF-8 by default; GET has a null request body', async () => {
    const fake = createFakeSii([{ url: 'https://api.test/x', reply: { body: '{"a":"é"}', encoding: 'utf8' } }])
    const memory = createMemoryCapture()
    const sii = createSiiClient({
      environment: 'production',
      certificate,
      transport: fake.transport,
      capture: memory.capture,
    })
    await send(sii, {
      operation: 'queryUploadStatus',
      channel: 'rest',
      method: 'GET',
      url: 'https://api.test/x',
      headers: {},
      timeoutMs: 100,
      attempt: 1,
    })
    expect(memory.exchanges()[0].request.body).toBeNull()
    expect(memory.exchanges()[0].response?.body).toBe('{"a":"é"}')
  })

  test('the SOAP channel decodes a captured request body as Latin-1 by default', async () => {
    const fake = createFakeSii([{ url: 'https://maullin.sii.cl/DTEWS/CrSeed.jws', reply: { body: '<r/>' } }])
    const memory = createMemoryCapture()
    const sii = createSiiClient({
      environment: 'certification',
      certificate,
      transport: fake.transport,
      capture: memory.capture,
    })
    await send(sii, {
      operation: 'getSeed',
      channel: 'soap',
      method: 'POST',
      url: 'https://maullin.sii.cl/DTEWS/CrSeed.jws',
      headers: {},
      body: Uint8Array.from([0x61, 0xe1]),
      timeoutMs: 100,
      attempt: 1,
    })
    expect(memory.exchanges()[0].request.body).toBe('aá')
  })

  test('transport failures are captured with the error summary and rethrown', async () => {
    const fake = createFakeSii([
      { url: 'https://api.test/x', reply: new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' }) },
    ])
    const memory = createMemoryCapture()
    const logger = recordingLogger()
    const sii = createSiiClient({
      environment: 'production',
      certificate,
      transport: fake.transport,
      capture: memory.capture,
      logger,
      now: ticking(),
    })
    await expect(
      send(sii, {
        operation: 'getSeed',
        channel: 'rest',
        method: 'GET',
        url: 'https://api.test/x',
        headers: {},
        timeoutMs: 100,
        attempt: 1,
      }),
    ).rejects.toMatchObject({ code: 'TRANSPORT_FAILED' })
    expect(memory.exchanges()[0].response).toBeNull()
    expect(memory.exchanges()[0].error).toEqual({ code: 'TRANSPORT_FAILED', reason: 'ECONNRESET' })
    expect(logger.lines).toEqual([
      [
        'debug',
        'sii http failed',
        {
          operation: 'getSeed',
          attempt: 1,
          durationMs: 100,
          error: { code: 'TRANSPORT_FAILED', reason: 'ECONNRESET' },
        },
      ],
    ])
  })

  describe('the context a transport failure carries (spec table 3.8)', () => {
    const input = {
      operation: 'uploadEnvelope',
      channel: 'soap' as const,
      method: 'POST' as const,
      url: 'https://api.test/x?rut=10000004-0',
      headers: {},
      timeoutMs: 4321,
      attempt: 1,
    }
    const failWith = async (error: Error): Promise<unknown> => {
      const fake = createFakeSii([{ url: 'https://api.test/x*', reply: error }])
      const sii = createSiiClient({ environment: 'production', certificate, transport: fake.transport })
      return send(sii, input).then(
        () => null,
        (caught: unknown) => caught,
      )
    }

    test.each([
      ['TRANSPORT_FAILED', { reason: 'ECONNRESET' }, { reason: 'ECONNRESET', operation: 'uploadEnvelope' }],
      [
        'TRANSPORT_FAILED',
        { reason: 'ECONNRESET', responseStarted: true },
        { reason: 'ECONNRESET', responseStarted: true, operation: 'uploadEnvelope' },
      ],
      ['TRANSPORT_TLS', { reason: 'CERT_HAS_EXPIRED' }, { reason: 'CERT_HAS_EXPIRED', operation: 'uploadEnvelope' }],
      ['REQUEST_ABORTED', {}, { operation: 'uploadEnvelope' }],
      [
        'REQUEST_TIMEOUT',
        { reason: 'This operation was aborted' },
        { reason: 'This operation was aborted', operation: 'uploadEnvelope', timeoutMs: 4321 },
      ],
      [
        'REQUEST_TIMEOUT',
        { responseStarted: true },
        { responseStarted: true, operation: 'uploadEnvelope', timeoutMs: 4321 },
      ],
    ] as const)(
      '%s keeps its details and gains the operation (and the timeout, for a timeout)',
      async (code, details, expected) => {
        const error = await failWith(new DteError(code, details))
        expect(error).toBeInstanceOf(DteError)
        expect((error as DteError).code).toBe(code)
        expect((error as DteError).details).toEqual(expected)
        expect((error as DteError).message).toContain('operation=uploadEnvelope')
        // The URL of the call can hold a RUT: it is not part of the error at all.
        expect(JSON.stringify(error)).not.toContain('10000004')
        expect((error as DteError).message).not.toContain('4321')
      },
    )

    test('a detail the transport already set is not overwritten', async () => {
      const error = await failWith(new DteError('REQUEST_TIMEOUT', { operation: 'custom', timeoutMs: 7 }))
      expect((error as DteError).details).toEqual({ operation: 'custom', timeoutMs: 7 })
    })

    test('a value that is not a DteError (a custom transport) is rethrown as it is', async () => {
      const boom = new TypeError('boom')
      expect(await failWith(boom)).toBe(boom)
    })
  })

  test('a token inside a transport failure reaches neither the capture nor the log', async () => {
    const fake = createFakeSii([
      { url: 'https://api.test/x', reply: new DteError('TRANSPORT_FAILED', { reason: 'reset after TOKEN=abc123' }) },
    ])
    const memory = createMemoryCapture()
    const logger = recordingLogger()
    const sii = createSiiClient({
      environment: 'production',
      certificate,
      transport: fake.transport,
      capture: memory.capture,
      logger,
    })
    await expect(
      send(sii, {
        operation: 'getSeed',
        channel: 'rest',
        method: 'GET',
        url: 'https://api.test/x',
        headers: { Authorization: 'Bearer abc123' },
        timeoutMs: 100,
        attempt: 1,
      }),
    ).rejects.toMatchObject({ code: 'TRANSPORT_FAILED' })
    expect(JSON.stringify([memory.exchanges(), logger.lines])).not.toContain('abc123')
    expect(memory.exchanges()[0].error).toEqual({ code: 'TRANSPORT_FAILED', reason: 'reset after TOKEN=[redacted]' })
  })

  test('a failing capture is logged and never fails the call; no capture is fine too', async () => {
    const fake = createFakeSii([{ url: 'https://api.test/x', reply: { body: 'ok' } }])
    const logger = recordingLogger()
    const failing = async () => {
      throw new Error('disk full')
    }
    const sii = createSiiClient({
      environment: 'production',
      certificate,
      transport: fake.transport,
      capture: failing,
      logger,
    })
    const input = {
      operation: 'getSeed',
      channel: 'rest' as const,
      method: 'GET' as const,
      url: 'https://api.test/x',
      headers: {},
      timeoutMs: 100,
      attempt: 1,
    }
    expect((await send(sii, input)).status).toBe(200)
    expect(logger.lines[0]).toEqual(['warn', 'HTTP capture failed', { operation: 'getSeed', reason: 'disk full' }])
    const quiet = createSiiClient({ environment: 'production', certificate, transport: fake.transport })
    expect((await send(quiet, { ...input, body: encodeLatin1('x'), method: 'POST' })).status).toBe(200)
    expect(fake.requests[1].headers['content-length']).toBe('1')
    await send(quiet, { ...input, body: encodeLatin1('xy'), method: 'POST', headers: { 'content-length': '2' } })
    expect(fake.requests[2].headers['content-length']).toBe('2')
    expect(fake.requests[0].headers['content-length']).toBeUndefined()
  })
})
