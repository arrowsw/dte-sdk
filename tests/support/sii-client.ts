import { loadCertificateFromPem } from '../../src/certificate/pem'
import type { Environment } from '../../src/catalogs/codes'
import { createSiiClient, type SiiClientOptions } from '../../src/sii/client'
import type { Logger } from '../../src/sii/logger'
import { tokenCacheKey, type CachedToken, type TokenCache } from '../../src/sii/token-cache'
import { createFakeSii, type FakeRoute, type FakeSii } from './fake-sii'
import { fixtureText, FIXED_NOW } from './fixtures'

export const certificate = loadCertificateFromPem(
  { privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') },
  { now: FIXED_NOW },
)
export const siiFixture = (name: string): string => fixtureText(`sii/${name}`)
export const COMPANY_RUT = '10000004-0'
export const SOAP_TOKEN = 'ABCDEFGHIJKLM'
export const REST_TOKEN = 'RESTTOKEN1234'

/** Routes that answer the SOAP and REST seed/token handshakes with the OK fixtures. */
export const authRoutes = (environment: 'certification' | 'production' = 'certification'): FakeRoute[] => {
  const soapHost = environment === 'production' ? 'palena' : 'maullin'
  const restHost = environment === 'production' ? 'api' : 'apicert'
  return [
    { url: `https://${soapHost}.sii.cl/DTEWS/CrSeed.jws`, reply: { body: siiFixture('soap-seed-ok.xml') } },
    { url: `https://${soapHost}.sii.cl/DTEWS/GetTokenFromSeed.jws`, reply: { body: siiFixture('soap-token-ok.xml') } },
    {
      url: `https://${restHost}.sii.cl/recursos/v1/boleta.electronica.semilla`,
      reply: { body: siiFixture('rest-seed-ok.xml'), encoding: 'utf8' },
    },
    {
      url: `https://${restHost}.sii.cl/recursos/v1/boleta.electronica.token`,
      reply: { body: siiFixture('rest-token-ok.xml'), encoding: 'utf8' },
    },
  ]
}

export type TestClock = { readonly now: () => Date; advance: (ms: number) => void }
export const testClock = (start: Date = FIXED_NOW): TestClock => {
  const state = { t: start.getTime() }
  return { now: () => new Date(state.t), advance: (ms) => void (state.t += ms) }
}

export type RecordingLogger = Logger & { readonly lines: readonly [string, string, unknown][] }
export const recordingLogger = (): RecordingLogger => {
  const lines: [string, string, unknown][] = []
  const log = (level: string) => (message: string, context?: unknown) => void lines.push([level, message, context])
  return { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error'), lines }
}

export type TestSii = {
  readonly fake: FakeSii
  readonly clock: TestClock
  readonly logger: RecordingLogger
  readonly sleeps: number[]
  readonly sii: ReturnType<typeof createSiiClient>
}

/** A client wired to a fake SII, a controllable clock, a recording logger and a non-waiting sleep. */
export const testSii = (routes: FakeRoute[], options: Partial<SiiClientOptions> = {}): TestSii => {
  const fake = createFakeSii(routes)
  const clock = testClock()
  const logger = recordingLogger()
  const sleeps: number[] = []
  const { retry, ...rest } = options
  const sii = createSiiClient({
    environment: 'certification',
    certificate,
    companyRut: COMPANY_RUT,
    transport: fake.transport,
    logger,
    now: clock.now,
    sleep: async (ms) => void sleeps.push(ms),
    // No jitter in tests: delays are exact (2000, 3600, …) and the assertions stay deterministic.
    retry: retry === false ? false : { maxAttempts: 3, jitterRatio: 0, ...retry },
    ...rest,
  })
  return { fake, clock, logger, sleeps, sii }
}

const HOUR = 60 * 60 * 1000

/**
 * A token cache that already holds a fresh SOAP token and a fresh REST token, so no seed/token handshake runs. A
 * handshake signs a seed with a 2048-bit key in pure JavaScript (about 0.6 s); tests that are not about
 * authentication start from this cache. A token the test makes the SII reject is deleted like any cached token, and
 * the next call authenticates for real.
 */
export const seededTokenCache = (environment: Environment): TokenCache => {
  const fresh = (token: string): CachedToken => ({ token, expiresAt: FIXED_NOW.getTime() + HOUR })
  const entries = new Map<string, CachedToken>([
    [tokenCacheKey(environment, 'soap', certificate), fresh(SOAP_TOKEN)],
    [tokenCacheKey(environment, 'rest', certificate), fresh(REST_TOKEN)],
  ])
  return {
    get: async (key) => entries.get(key) ?? null,
    set: async (key, value) => void entries.set(key, value),
    delete: async (key) => void entries.delete(key),
  }
}

/** A `testSii` whose tokens are already cached, so the routes only need the operation's own URLs. */
export const cachedSii = (routes: FakeRoute[], options: Partial<SiiClientOptions> = {}): TestSii =>
  testSii(routes, { tokenCache: seededTokenCache(options.environment ?? 'certification'), ...options })

export const expectCode = async (
  promise: Promise<unknown>,
  code: string,
  details?: Record<string, unknown>,
): Promise<void> => {
  const outcome = await promise.then(
    () => null,
    (error: unknown) => error,
  )
  if (outcome === null) throw new Error(`expected DteError ${code}`)
  expect(outcome).toMatchObject({
    name: 'DteError',
    code,
    ...(details === undefined ? {} : { details: expect.objectContaining(details) }),
  })
}
