import { CLAIM_WS_ENDPOINTS, REST_ENDPOINTS, SOAP_ENDPOINTS } from '../../src/catalogs/endpoints'
import { loadCertificateFromPem } from '../../src/certificate/pem'
import { DteError } from '../../src/errors'
import {
  createSiiClient,
  DEFAULT_TIMEOUTS,
  DEFAULT_TOKEN_TTL_MS,
  resolveCompanyRut,
  resolveSenderRut,
  retryFor,
  timeoutFor,
  type SiiClientOptions,
} from '../../src/sii/client'
import { createMemoryCapture } from '../../src/sii/capture'
import { createMemoryUploadArchive } from '../../src/sii/archive'
import { silentLogger } from '../../src/sii/logger'
import { DEFAULT_RETRY_POLICY } from '../../src/sii/retry'
import { createMemoryTokenCache } from '../../src/sii/token-cache'
import type { HttpTransport } from '../../src/sii/transport'
import { fixtureText, FIXED_NOW, ISSUER_RUT } from '../support/fixtures'

const certificate = loadCertificateFromPem(
  { privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') },
  { now: FIXED_NOW },
)
const base: SiiClientOptions = { environment: 'certification', certificate }
const expectCode = (fn: () => unknown, code: string, field?: string) => {
  try {
    fn()
    throw new Error('expected DteError')
  } catch (err) {
    expect(err).toBeInstanceOf(DteError)
    expect((err as DteError).code).toBe(code)
    if (field !== undefined) expect((err as DteError).details.field).toBe(field)
  }
}

describe('createSiiClient', () => {
  test('defaults: certification uses DTEUpload for receipts, memory cache, silent logger, no capture', () => {
    const sii = createSiiClient(base)
    expect(Object.isFrozen(sii)).toBe(true)
    expect([sii.timeouts, sii.endpoints, sii.retry, DEFAULT_TIMEOUTS].map((part) => Object.isFrozen(part))).toEqual([
      true,
      true,
      true,
      true,
    ])
    expect(sii.retry).not.toBe(DEFAULT_RETRY_POLICY)
    expect(sii.environment).toBe('certification')
    expect(sii.senderRut).toBe(ISSUER_RUT)
    expect(sii.companyRut).toBeNull()
    expect(sii.receiptsChannel).toBe('soap')
    expect(sii.tokenTtlMs).toBe(DEFAULT_TOKEN_TTL_MS)
    expect(DEFAULT_TOKEN_TTL_MS).toBe(55 * 60 * 1000)
    expect(sii.timeouts).toEqual(DEFAULT_TIMEOUTS)
    expect(DEFAULT_TIMEOUTS).toEqual({ soap: 30000, rest: 15000, upload: 60000 })
    expect(sii.retry).toEqual(DEFAULT_RETRY_POLICY)
    expect(sii.logger).toBe(silentLogger)
    expect(sii.capture).toBeNull()
    expect(sii.archive).toBeNull()
    expect(sii.endpoints).toEqual({
      soap: SOAP_ENDPOINTS.certification,
      rest: REST_ENDPOINTS.certification,
      claims: CLAIM_WS_ENDPOINTS.certification,
    })
    expect(typeof sii.transport).toBe('function')
    expect(typeof sii.tokenCache.get).toBe('function')
    expect(sii.now()).toBeInstanceOf(Date)
  })

  test('production uses the REST channel for receipts', () => {
    expect(createSiiClient({ ...base, environment: 'production' }).receiptsChannel).toBe('rest')
    expect(createSiiClient({ ...base, environment: 'production' }).endpoints.soap).toBe(SOAP_ENDPOINTS.production)
  })

  test('every option is applied', async () => {
    const transport: HttpTransport = async () => ({ status: 204, headers: {}, body: new Uint8Array() })
    const tokenCache = createMemoryTokenCache()
    const capture = createMemoryCapture().capture
    const archive = createMemoryUploadArchive().archive
    const now = () => FIXED_NOW
    const sleep = async () => undefined
    const sii = createSiiClient({
      ...base,
      companyRut: '60.803.000-K',
      senderRut: '12.345.678-5',
      transport,
      tokenCache,
      tokenTtlMs: 1000,
      retry: { maxAttempts: 2 },
      timeouts: { soap: 1, rest: 2, upload: 3 },
      receiptsChannel: 'rest',
      logger: console,
      capture,
      archive,
      endpoints: {
        soap: { ...SOAP_ENDPOINTS.production, seed: 'https://proxy.test/seed' },
        rest: REST_ENDPOINTS.production,
        claims: 'https://proxy.test/claims',
      },
      now,
      sleep,
    })
    expect(sii.companyRut).toBe('60803000-K')
    expect(sii.senderRut).toBe('12345678-5')
    expect(sii.transport).toBe(transport)
    expect(sii.tokenCache).toBe(tokenCache)
    expect(sii.tokenTtlMs).toBe(1000)
    expect(sii.retry).toEqual({ ...DEFAULT_RETRY_POLICY, maxAttempts: 2 })
    expect(sii.timeouts).toEqual({ soap: 1, rest: 2, upload: 3 })
    expect(sii.receiptsChannel).toBe('rest')
    expect(sii.logger).toBe(console)
    expect(sii.capture).toBe(capture)
    expect(sii.archive).toBe(archive)
    expect(sii.endpoints.soap.seed).toBe('https://proxy.test/seed')
    expect(sii.endpoints.rest).toBe(REST_ENDPOINTS.production)
    expect(sii.endpoints.claims).toBe('https://proxy.test/claims')
    expect(sii.now).toBe(now)
    expect(sii.sleep).toBe(sleep)
    expect(createSiiClient({ ...base, retry: false }).retry).toBe(false)
    expect(createSiiClient({ ...base, timeouts: { rest: 7 } }).timeouts).toEqual({ ...DEFAULT_TIMEOUTS, rest: 7 })
  })

  test('validates its options without echoing values', () => {
    expectCode(() => createSiiClient({ ...base, environment: 'staging' as never }), 'INVALID_OPTION', 'environment')
    expectCode(() => createSiiClient({ ...base, certificate: undefined as never }), 'MISSING_FIELD', 'certificate')
    expectCode(
      () => createSiiClient({ ...base, certificate: { ...certificate, rut: null } }),
      'MISSING_FIELD',
      'senderRut',
    )
    expect(
      createSiiClient({ ...base, certificate: { ...certificate, rut: null }, senderRut: ISSUER_RUT }).senderRut,
    ).toBe(ISSUER_RUT)
    expectCode(() => createSiiClient({ ...base, senderRut: '1-1' }), 'INVALID_RUT', 'senderRut')
    expectCode(() => createSiiClient({ ...base, companyRut: 'nope' }), 'INVALID_RUT', 'companyRut')
    expectCode(() => createSiiClient({ ...base, tokenTtlMs: 0 }), 'INVALID_OPTION', 'tokenTtlMs')
    expectCode(() => createSiiClient({ ...base, timeouts: { rest: -1 } }), 'INVALID_OPTION', 'timeouts.rest')
    expectCode(() => createSiiClient({ ...base, timeouts: { soap: Number.NaN } }), 'INVALID_OPTION', 'timeouts.soap')
    expectCode(() => createSiiClient({ ...base, timeouts: { upload: 0 } }), 'INVALID_OPTION', 'timeouts.upload')
    expectCode(() => createSiiClient({ ...base, retry: { maxAttempts: 0 } }), 'INVALID_OPTION', 'retry.maxAttempts')
    expectCode(() => createSiiClient({ ...base, retry: { maxAttempts: 1.5 } }), 'INVALID_OPTION', 'retry.maxAttempts')
    expectCode(
      () => createSiiClient({ ...base, retry: { initialDelayMs: 0 } }),
      'INVALID_OPTION',
      'retry.initialDelayMs',
    )
    expectCode(() => createSiiClient({ ...base, retry: { maxDelayMs: -5 } }), 'INVALID_OPTION', 'retry.maxDelayMs')
    expectCode(
      () => createSiiClient({ ...base, retry: { backoffMultiplier: 0 } }),
      'INVALID_OPTION',
      'retry.backoffMultiplier',
    )
    expectCode(() => createSiiClient({ ...base, retry: { jitterRatio: 2 } }), 'INVALID_OPTION', 'retry.jitterRatio')
    expectCode(() => createSiiClient({ ...base, receiptsChannel: 'ftp' as never }), 'INVALID_OPTION', 'receiptsChannel')
  })

  test('the default transport is lazy: the client builds with no fetch and fails only on the first request', async () => {
    const original = globalThis.fetch
    Object.defineProperty(globalThis, 'fetch', { value: undefined, configurable: true, writable: true })
    try {
      const sii = createSiiClient(base)
      await expect(
        sii.transport({ method: 'GET', url: 'https://api.test/x', headers: {}, timeoutMs: 100 }),
      ).rejects.toMatchObject({ code: 'TRANSPORT_UNAVAILABLE' })
    } finally {
      Object.defineProperty(globalThis, 'fetch', { value: original, configurable: true, writable: true })
    }
  })

  test('the default sleep waits and honours the signal', async () => {
    const sii = createSiiClient(base)
    const started = Date.now()
    await sii.sleep(20)
    expect(Date.now() - started).toBeGreaterThanOrEqual(15)
    const pre = new AbortController()
    pre.abort()
    await expect(sii.sleep(1000, pre.signal)).rejects.toMatchObject({ code: 'REQUEST_ABORTED' })
    const later = new AbortController()
    const pending = sii.sleep(1000, later.signal)
    later.abort()
    await expect(pending).rejects.toMatchObject({ code: 'REQUEST_ABORTED' })
  })
})

describe('per-call resolution helpers', () => {
  const sii = createSiiClient({ ...base, companyRut: '60803000-K' })

  test('resolveCompanyRut prefers the call, then the client, else MISSING_FIELD', () => {
    expect(resolveCompanyRut(sii, '12.345.678-5')).toBe('12345678-5')
    expect(resolveCompanyRut(sii)).toBe('60803000-K')
    expectCode(() => resolveCompanyRut(createSiiClient(base)), 'MISSING_FIELD', 'companyRut')
    expectCode(() => resolveCompanyRut(sii, 'bad'), 'INVALID_RUT', 'companyRut')
  })

  test('resolveSenderRut prefers the call, else the certificate holder', () => {
    expect(resolveSenderRut(sii)).toBe(ISSUER_RUT)
    expect(resolveSenderRut(sii, '12345678-5')).toBe('12345678-5')
  })

  test('timeoutFor and retryFor merge the overrides', () => {
    expect(timeoutFor(sii, 'upload')).toBe(60000)
    expect(timeoutFor(sii, 'soap', { timeoutMs: 5 })).toBe(5)
    expect(retryFor(sii)).toEqual(DEFAULT_RETRY_POLICY)
    expect(retryFor(sii, { retry: false })).toBe(false)
    expect(retryFor(sii, { retry: { maxAttempts: 1 } })).toEqual({ ...DEFAULT_RETRY_POLICY, maxAttempts: 1 })
  })
})
