import { loadCertificateFromPem } from '../../src/certificate/pem'
import {
  createPortalClient,
  unstable_createPasswordPortalClient,
  type PasswordPortalClientOptions,
  type PortalClient,
  type PortalClientOptions,
} from '../../src/portal/client'
import { certificateFingerprint, textFingerprint } from '../../src/sii/token-cache'
import { createFakeSii, type FakeRoute, type FakeSii } from './fake-sii'
import { fixtureText, FIXED_NOW, ISSUER_RUT } from './fixtures'

export const certificate = loadCertificateFromPem(
  { privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') },
  { now: FIXED_NOW },
)

export const MAULLIN = 'https://maullin.sii.cl/cvc_cgi/dte'
export const PALENA = 'https://palena.sii.cl/cvc_cgi/dte'
export const HERCULES = 'https://herculesr.sii.cl/cgi_AUT2000/CAutInicio.cgi'
export const SESSION_KEY = `portal:${certificateFingerprint(certificate)}`
export const ZEUS_LOGIN = 'https://zeusr.sii.cl/cgi_AUT2000/CAutInicio.cgi'
export const PASSWORD_USER_RUT = '12345678-5'
// A made-up password, with the characters a form has to escape.
export const TAX_PASSWORD = 'S3creta&=ñ %'
// The harness gives its clients a session key, so a test can find the session in the cache.
export const PASSWORD_SESSION_NAME = 'secreto-de-la-sesion'
export const PASSWORD_SESSION_KEY = `portal:password:${textFingerprint(`${PASSWORD_USER_RUT}:${PASSWORD_SESSION_NAME}`)}`
export const SESSION_COOKIES = {
  'NETSCAPE_LIVEWIRE.rut': '12345678',
  'NETSCAPE_LIVEWIRE.dv': '5',
  TS01ab: 'cookie-value',
}

export type PortalHarness = {
  readonly portal: PortalClient
  readonly fake: FakeSii
  readonly sleeps: number[]
  /** The forms posted to a page, named by the last segment of its path, with or without `.cgi`. */
  readonly posted: (page: string) => readonly Readonly<Record<string, string>>[]
  readonly urls: () => readonly string[]
}

const parseForm = (text: string): Readonly<Record<string, string>> =>
  Object.fromEntries(
    text
      .split('&')
      .filter((pair) => pair !== '')
      .map((pair) => {
        const [name, value = ''] = pair.split('=')
        return [decodeURIComponent(name), decodeURIComponent(value)]
      }),
  )

/** A client over the fake SII with instant waits and no retries unless a test asks for them. */
export const portalWith = (routes: readonly FakeRoute[], options: Partial<PortalClientOptions> = {}): PortalHarness => {
  const fake = createFakeSii(routes)
  const sleeps: number[] = []
  const portal = createPortalClient({
    environment: 'certification',
    certificate,
    companyRut: ISSUER_RUT,
    transport: fake.transport,
    now: () => FIXED_NOW,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    retry: false,
    ...options,
  })
  return {
    portal,
    fake,
    sleeps,
    posted: (page) =>
      fake.requests
        .filter(
          (request) =>
            request.method === 'POST' &&
            new URL(request.url).pathname
              .split('/')
              .pop()
              ?.replace(/\.cgi$/, '') === page,
        )
        .map((request) => parseForm(request.text)),
    urls: () => fake.requests.map((request) => request.url),
  }
}

/** A client that signs in with a tax password, over the fake SII; `asked` counts the times the password was asked for. */
export const passwordPortalWith = (
  routes: readonly FakeRoute[],
  options: Partial<PasswordPortalClientOptions> = {},
): PortalHarness & { readonly asked: () => number } => {
  const fake = createFakeSii(routes)
  const sleeps: number[] = []
  let asked = 0
  const portal = unstable_createPasswordPortalClient({
    environment: 'certification',
    userRut: PASSWORD_USER_RUT,
    password: () => {
      asked += 1
      return TAX_PASSWORD
    },
    sessionKey: PASSWORD_SESSION_NAME,
    companyRut: ISSUER_RUT,
    transport: fake.transport,
    now: () => FIXED_NOW,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    retry: false,
    ...options,
  })
  return {
    portal,
    fake,
    sleeps,
    posted: (page) =>
      fake.requests
        .filter(
          (request) =>
            request.method === 'POST' &&
            new URL(request.url).pathname
              .split('/')
              .pop()
              ?.replace(/\.cgi$/, '') === page,
        )
        .map((request) => parseForm(request.text)),
    urls: () => fake.requests.map((request) => request.url),
    asked: () => asked,
  }
}

/** Puts a live session in the client's cache, so the flow under test needs no login. */
export const seedSession = async (
  portal: PortalClient,
  cookies: Readonly<Record<string, string>> = SESSION_COOKIES,
): Promise<void> => {
  await portal.sessionCache.set(SESSION_KEY, {
    token: JSON.stringify(cookies),
    expiresAt: FIXED_NOW.getTime() + 60000,
  })
}

/** A client whose session is already in the cache. */
export const signedIn = async (
  routes: readonly FakeRoute[],
  options: Partial<PortalClientOptions> = {},
): Promise<PortalHarness> => {
  const harness = portalWith(routes, options)
  await seedSession(harness.portal)
  return harness
}

/** Awaits a rejection and returns the error. */
export const failure = async (
  promise: Promise<unknown>,
): Promise<{ code: string; details: Readonly<Record<string, unknown>> }> => {
  try {
    await promise
  } catch (error) {
    return error as { code: string; details: Readonly<Record<string, unknown>> }
  }
  throw new Error('expected a rejection')
}
