import { unstable_createPasswordPortalClient } from '../../src/portal/client'
import { validateExchangeUser } from '../../src/portal/exchange'
import { ensurePage, openPortalSession, withPortalSession } from '../../src/portal/session'
import { createMemoryCapture } from '../../src/sii/capture'
import { createMemoryTokenCache, textFingerprint } from '../../src/sii/token-cache'
import { FIXED_NOW } from '../support/fixtures'
import {
  failure,
  HERCULES,
  MAULLIN,
  PASSWORD_SESSION_KEY,
  PASSWORD_SESSION_NAME,
  PASSWORD_USER_RUT,
  passwordPortalWith,
  SESSION_KEY,
  TAX_PASSWORD,
  ZEUS_LOGIN,
} from '../support/portal'
import {
  AUTH_PAGE,
  COMPANY_FORM,
  NOT_ENABLED_PAGE,
  page,
  REPRESENTATION_REFUSED,
  SESSION_LIMIT_PAGE,
} from '../support/portal-pages'

const ENTRY = 'https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html*'
const LANDING = 'https://misiir.sii.cl/cgi_misii/siihome.cgi'
const LOGIN_OK = {
  status: 302,
  headers: {
    Location: LANDING,
    'Set-Cookie': 'NETSCAPE_LIVEWIRE.rut=12345678; Domain=.sii.cl; Path=/, NETSCAPE_LIVEWIRE.dv=5; Path=/',
  },
}
const HOME = { url: LANDING, reply: { body: page('Mi SII') } }
const REFUSED = { body: page('<p>La clave ingresada no es correcta</p>', 'Identificaci&oacute;n') }
const entry = { url: ENTRY, reply: { body: page('x'), headers: { 'Set-Cookie': 'TS01=abc; Path=/' } } }
const options = { environment: 'certification' as const, userRut: PASSWORD_USER_RUT, password: () => TAX_PASSWORD }

describe('unstable_createPasswordPortalClient', () => {
  test('a frozen client with no certificate and no password in it', () => {
    const portal = unstable_createPasswordPortalClient({ ...options, userRut: '12.345.678-5' })
    expect(Object.isFrozen(portal)).toBe(true)
    expect(portal.certificate).toBeNull()
    expect(portal.passwordSignIn).toMatchObject({ rut: PASSWORD_USER_RUT })
    // With no session key given, each client gets a random one of its own.
    expect(portal.passwordSignIn?.sessionKey).toMatch(/^[0-9a-f-]{36}$/)
    expect(unstable_createPasswordPortalClient(options).passwordSignIn?.sessionKey).not.toBe(
      portal.passwordSignIn?.sessionKey,
    )
    expect(unstable_createPasswordPortalClient({ ...options, sessionKey: 'k' }).passwordSignIn?.sessionKey).toBe('k')
    expect(Object.isFrozen(portal.passwordSignIn)).toBe(true)
    expect(portal.timeoutMs).toBe(20000)
    expect(typeof portal.transport).toBe('function')
    // The password is behind a function, so writing the client down never writes it.
    expect(JSON.stringify(portal)).not.toContain(TAX_PASSWORD)
    expect(JSON.stringify(portal)).toContain(PASSWORD_USER_RUT)
  })

  test('validation', () => {
    const invalid = (extra: object, code: string, field: string): void =>
      expect(() => unstable_createPasswordPortalClient({ ...options, ...extra } as never)).toThrow(
        expect.objectContaining({ code, details: expect.objectContaining({ field }) }),
      )
    invalid({ password: TAX_PASSWORD }, 'MISSING_FIELD', 'password')
    invalid({ password: undefined }, 'MISSING_FIELD', 'password')
    invalid({ userRut: 'nope' }, 'INVALID_RUT', 'userRut')
    invalid({ environment: 'nope' }, 'INVALID_OPTION', 'environment')
    // The environment is checked first, as on a certificate's client.
    invalid({ environment: 'nope', password: undefined }, 'INVALID_OPTION', 'environment')
    invalid({ companyRut: 'nope' }, 'INVALID_RUT', 'companyRut')
    invalid({ timeoutMs: 0 }, 'INVALID_OPTION', 'timeoutMs')
    invalid({ sessionKey: '' }, 'INVALID_OPTION', 'sessionKey')
    invalid({ sessionKey: 7 }, 'INVALID_OPTION', 'sessionKey')
  })
})

describe('signing in with a tax password', () => {
  test('visits the password entry page, then posts the RUT, the password and where to go next', async () => {
    const harness = passwordPortalWith([entry, { url: ZEUS_LOGIN, method: 'POST', reply: LOGIN_OK }, HOME])
    await expect(openPortalSession(harness.portal)).resolves.toEqual({ userRut: PASSWORD_USER_RUT, reused: false })
    expect(harness.urls()).toEqual([
      `https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?${LANDING}`,
      ZEUS_LOGIN,
      LANDING,
    ])
    expect(harness.posted('CAutInicio')).toEqual([
      { rut: '12345678', dv: '5', rutcntr: PASSWORD_USER_RUT, clave: TAX_PASSWORD, referencia: LANDING, '411': '' },
    ])
    const login = harness.fake.requests[1]
    // The password is escaped as any form value: `&`, `=`, `%`, a space and an `ñ` cannot break out of their field.
    expect(login.text).toContain(`clave=${encodeURIComponent(TAX_PASSWORD)}&`)
    expect(login.headers['content-type']).toBe('application/x-www-form-urlencoded')
    expect(login.headers['origin']).toBe('https://zeusr.sii.cl')
    expect(login.headers['referer']).toBe(ZEUS_LOGIN)
    expect(login.headers['cookie']).toBe('TS01=abc')
    expect(harness.asked()).toBe(1)
    // The session is kept under a key of its own, which names nobody: a digest of the RUT and of the session key.
    expect(PASSWORD_SESSION_KEY).toBe(
      `portal:password:${textFingerprint(`${PASSWORD_USER_RUT}:${PASSWORD_SESSION_NAME}`)}`,
    )
    expect(PASSWORD_SESSION_KEY).not.toContain('12345678')
    const stored = await harness.portal.sessionCache.get(PASSWORD_SESSION_KEY)
    expect(JSON.parse(stored!.token)).toMatchObject({ 'NETSCAPE_LIVEWIRE.rut': '12345678' })
    expect(stored!.expiresAt).toBe(FIXED_NOW.getTime() + 90 * 60 * 1000)
    expect(await harness.portal.sessionCache.get(SESSION_KEY)).toBeNull()
  })

  test('a kept session is reused, and the password is not asked for', async () => {
    const harness = passwordPortalWith([{ url: `${MAULLIN}/ad_empresa1`, reply: { body: COMPANY_FORM } }])
    await harness.portal.sessionCache.set(PASSWORD_SESSION_KEY, {
      token: JSON.stringify({ 'NETSCAPE_LIVEWIRE.rut': '12345678', 'NETSCAPE_LIVEWIRE.dv': '5' }),
      expiresAt: FIXED_NOW.getTime() + 60000,
    })
    await expect(openPortalSession(harness.portal)).resolves.toEqual({ userRut: PASSWORD_USER_RUT, reused: true })
    expect(harness.asked()).toBe(0)
    expect(harness.posted('CAutInicio')).toEqual([])
  })

  test('a page that asks to authenticate is answered with the password and the page it was after', async () => {
    const target = `${MAULLIN}/ad_empresa1`
    const asks = {
      status: 302,
      headers: { Location: `https://zeus.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?${target}` },
    }
    const harness = passwordPortalWith([
      { url: target, reply: [asks, { body: COMPANY_FORM }] },
      { url: 'https://zeus.sii.cl/AUT2000/InicioAutenticacion/*', reply: { body: AUTH_PAGE } },
      {
        url: ZEUS_LOGIN,
        reply: { status: 302, headers: { Location: target, 'Set-Cookie': 'NETSCAPE_LIVEWIRE.rut=12345678' } },
      },
    ])
    const reached = await withPortalSession(harness.portal, 'test', undefined, (context) =>
      ensurePage(context, 'x', target),
    )
    expect(reached.html).toBe(COMPANY_FORM)
    expect(harness.posted('CAutInicio')).toEqual([expect.objectContaining({ clave: TAX_PASSWORD, referencia: target })])
    // The certificate's login is never visited.
    expect(harness.urls().some((url) => url.startsWith(HERCULES))).toBe(false)
  })

  test('a password may come later, from wherever it is kept', async () => {
    const harness = passwordPortalWith([entry, { url: ZEUS_LOGIN, reply: LOGIN_OK }, HOME], {
      password: async () => TAX_PASSWORD,
    })
    await expect(openPortalSession(harness.portal)).resolves.toMatchObject({ reused: false })
    expect(harness.posted('CAutInicio')[0].clave).toBe(TAX_PASSWORD)
  })

  test.each([[''], [undefined], [42]])('a password of %p is refused before anything is posted', async (password) => {
    const harness = passwordPortalWith([entry], { password: (() => password) as never })
    const error = await failure(openPortalSession(harness.portal))
    expect(error.code).toBe('MISSING_FIELD')
    expect(error.details).toEqual({ field: 'password' })
    expect(harness.posted('CAutInicio')).toEqual([])
  })
})

describe('a cached session and who may use it', () => {
  // A session found in the cache is checked against a page of the portal before it is used.
  const alive = { url: `${MAULLIN}/ad_empresa1`, reply: { body: COMPANY_FORM } }
  const login = [entry, { url: ZEUS_LOGIN, method: 'POST' as const, reply: LOGIN_OK }, HOME, alive]

  test('in a cache others share, naming the same RUT does not find the session of who signed in', async () => {
    const sessionCache = createMemoryTokenCache()
    // Neither client is given a session key, so each has a random one.
    const owner = passwordPortalWith(login, { sessionCache, sessionKey: undefined })
    await openPortalSession(owner.portal)
    const other = passwordPortalWith([entry, { url: ZEUS_LOGIN, reply: REFUSED }], {
      sessionCache,
      sessionKey: undefined,
      password: () => 'otra-clave',
    })
    // The second client has the RUT and not the password: it has to sign in, and the SII refuses it.
    expect((await failure(openPortalSession(other.portal))).code).toBe('SII_PORTAL_LOGIN_FAILED')
    expect(other.posted('CAutInicio')).toHaveLength(1)
    // The owner's session is still there, and still its own.
    await expect(openPortalSession(owner.portal)).resolves.toMatchObject({ reused: true })
  })

  test('a session key given on purpose shares the session, and another key does not', async () => {
    const sessionCache = createMemoryTokenCache()
    const first = passwordPortalWith(login, { sessionCache, sessionKey: 'secreto-de-ana' })
    await openPortalSession(first.portal)
    const restarted = passwordPortalWith([alive], { sessionCache, sessionKey: 'secreto-de-ana' })
    await expect(openPortalSession(restarted.portal)).resolves.toMatchObject({ reused: true })
    expect(restarted.asked()).toBe(0)
    const stranger = passwordPortalWith(login, { sessionCache, sessionKey: 'otro-secreto' })
    await expect(openPortalSession(stranger.portal)).resolves.toMatchObject({ reused: false })
    expect(stranger.asked()).toBe(1)
  })
})

describe('a password the SII refuses', () => {
  test('is a failed login with what the page said, and is never sent again by the same client', async () => {
    const harness = passwordPortalWith([entry, { url: ZEUS_LOGIN, reply: REFUSED }])
    const first = await failure(openPortalSession(harness.portal))
    expect(first.code).toBe('SII_PORTAL_LOGIN_FAILED')
    expect(first.details).toMatchObject({ operation: 'openPortalSession' })
    expect(String(first.details.portalMessage)).toContain('La clave ingresada no es correcta')
    expect(JSON.stringify(first.details)).not.toContain(TAX_PASSWORD)
    // The SII locks a password after a few wrong attempts: the next login asks for nothing and posts nothing.
    const requests = harness.fake.requests.length
    const second = await failure(openPortalSession(harness.portal))
    expect(second.code).toBe('SII_PORTAL_LOGIN_FAILED')
    expect(second.details).toEqual({ operation: 'openPortalSession', refusedBefore: true })
    expect(harness.posted('CAutInicio')).toHaveLength(1)
    expect(harness.asked()).toBe(1)
    // Not even the entry page is visited again.
    expect(harness.fake.requests).toHaveLength(requests)
  })

  test('a refusal is read from that login, not from the cookies an expired session left in the cache', async () => {
    const target = `${MAULLIN}/ad_empresa1`
    const asks = {
      status: 302,
      headers: { Location: `https://zeus.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?${target}` },
    }
    const harness = passwordPortalWith([
      { url: target, reply: asks },
      { url: 'https://zeus.sii.cl/AUT2000/InicioAutenticacion/*', reply: { body: AUTH_PAGE } },
      { url: ZEUS_LOGIN, reply: REFUSED },
    ])
    // The SII dropped this session, and the cache still has its cookies beside the load balancer's.
    await harness.portal.sessionCache.set(PASSWORD_SESSION_KEY, {
      token: JSON.stringify({ 'NETSCAPE_LIVEWIRE.rut': '12345678', 'NETSCAPE_LIVEWIRE.dv': '5', TS01: 'abc' }),
      expiresAt: FIXED_NOW.getTime() + 60000,
    })
    const visit = (): Promise<unknown> =>
      withPortalSession(harness.portal, 'test', undefined, (context) => ensurePage(context, 'x', target))
    const first = await failure(visit())
    expect(first.code).toBe('SII_PORTAL_LOGIN_FAILED')
    expect(String(first.details.portalMessage)).toContain('La clave ingresada no es correcta')
    // The password went with the load balancer's cookie and none of the dead session.
    const login = harness.fake.requests.find((request) => request.url === ZEUS_LOGIN)
    expect(login?.headers['cookie']).toBe('TS01=abc')
    // It is marked as refused, so the calls that follow post nothing: without that, each would post it again.
    expect((await failure(visit())).details).toMatchObject({ refusedBefore: true })
    expect((await failure(openPortalSession(harness.portal))).details).toMatchObject({ refusedBefore: true })
    expect(harness.posted('CAutInicio')).toHaveLength(1)
    expect(harness.asked()).toBe(1)
  })

  test('the request that posts a password is sent once, whatever the retry policy says', async () => {
    const gateway = { status: 504, body: page('Gateway Time-out') }
    const harness = passwordPortalWith(
      [entry, { url: ZEUS_LOGIN, reply: [gateway, LOGIN_OK] }, HOME],
      // The default policy of a client: four attempts at a request the SII answers with a gateway error.
      { retry: undefined },
    )
    expect(harness.portal.retry).toMatchObject({ maxAttempts: 4 })
    const error = await failure(openPortalSession(harness.portal))
    expect(error.code).toBe('SII_HTTP_ERROR')
    expect(harness.posted('CAutInicio')).toHaveLength(1)
    expect(harness.sleeps).toEqual([])
    // A gateway error is no refusal: the next call signs in, with the password asked for again.
    await expect(openPortalSession(harness.portal)).resolves.toMatchObject({ reused: false })
    expect(harness.posted('CAutInicio')).toHaveLength(2)
    expect(harness.asked()).toBe(2)
  })

  test('after the session limit, a refusal is read from the second login and not from what the limit page left', async () => {
    // The SII took the password, said the user has too many sessions, and set the cookies of a session on that page.
    const limit = {
      body: page(
        '<p>Ha superado el m&aacute;ximo de sesiones autenticadas</p><a href="/cgi_AUT2000/CierraAnt.cgi?x=1">cerrar</a>',
      ),
      headers: { 'Set-Cookie': 'NETSCAPE_LIVEWIRE.rut=12345678; Path=/, NETSCAPE_LIVEWIRE.dv=5; Path=/' },
    }
    const harness = passwordPortalWith([
      entry,
      { url: ZEUS_LOGIN, reply: [limit, REFUSED] },
      { url: 'https://zeusr.sii.cl/cgi_AUT2000/CierraAnt.cgi*', reply: { body: page('ok') } },
      HOME,
    ])
    const error = await failure(openPortalSession(harness.portal))
    expect(error.code).toBe('SII_PORTAL_LOGIN_FAILED')
    expect(String(error.details.portalMessage)).toContain('La clave ingresada no es correcta')
    // The one case in which a password is posted twice: the SII had taken it the first time. The second post goes
    // with the load balancer's cookie and none of a session, as the first.
    const logins = harness.fake.requests.filter((request) => request.url === ZEUS_LOGIN)
    expect(logins.map((request) => request.headers['cookie'])).toEqual(['TS01=abc', 'TS01=abc'])
    // It is marked as refused: the next call posts nothing.
    expect((await failure(openPortalSession(harness.portal))).details).toMatchObject({ refusedBefore: true })
    expect(harness.posted('CAutInicio')).toHaveLength(2)
    expect(harness.asked()).toBe(1)
  })

  test('once refused, the page where stale cookies end is not answered with a visit to the entry page', async () => {
    const target = `${MAULLIN}/ad_empresa1`
    const harness = passwordPortalWith([
      entry,
      { url: ZEUS_LOGIN, reply: REFUSED },
      { url: target, reply: { body: REPRESENTATION_REFUSED } },
    ])
    expect((await failure(openPortalSession(harness.portal))).code).toBe('SII_PORTAL_LOGIN_FAILED')
    // The cookies of a session the SII dropped come back from the cache.
    await harness.portal.sessionCache.set(PASSWORD_SESSION_KEY, {
      token: JSON.stringify({ 'NETSCAPE_LIVEWIRE.rut': '12345678', 'NETSCAPE_LIVEWIRE.dv': '5', TS01: 'abc' }),
      expiresAt: FIXED_NOW.getTime() + 60000,
    })
    const before = harness.fake.requests.length
    const error = await failure(
      withPortalSession(harness.portal, 'test', undefined, (context) => ensurePage(context, 'x', target)),
    )
    expect(error.details).toMatchObject({ refusedBefore: true })
    // The page was asked for and nothing after it: neither the entry page nor the login.
    expect(harness.fake.requests.slice(before).map((request) => request.url)).toEqual([target])
    expect(harness.posted('CAutInicio')).toHaveLength(1)
  })

  test('another client starts clean', async () => {
    const refused = passwordPortalWith([entry, { url: ZEUS_LOGIN, reply: REFUSED }])
    await failure(openPortalSession(refused.portal))
    const other = passwordPortalWith([entry, { url: ZEUS_LOGIN, reply: LOGIN_OK }, HOME])
    await expect(openPortalSession(other.portal)).resolves.toMatchObject({ reused: false })
  })

  test('the page that tells a certificate it is not enabled means nothing here: it is a failed login', async () => {
    const harness = passwordPortalWith([entry, { url: ZEUS_LOGIN, reply: { body: NOT_ENABLED_PAGE } }])
    expect((await failure(openPortalSession(harness.portal))).code).toBe('SII_PORTAL_LOGIN_FAILED')
  })

  test('the session limit is not a refusal: the client may sign in again', async () => {
    const harness = passwordPortalWith(
      [entry, { url: ZEUS_LOGIN, reply: [{ body: SESSION_LIMIT_PAGE }, LOGIN_OK] }, HOME],
      { closePreviousSessions: false },
    )
    expect((await failure(openPortalSession(harness.portal))).code).toBe('SII_PORTAL_SESSION_LIMIT')
    await expect(openPortalSession(harness.portal)).resolves.toMatchObject({ reused: false })
    expect(harness.asked()).toBe(2)
  })
})

describe('where the password never appears', () => {
  test('the capture writes the form with the password taken out', async () => {
    const capture = createMemoryCapture()
    const harness = passwordPortalWith([entry, { url: ZEUS_LOGIN, reply: LOGIN_OK }, HOME], {
      capture: capture.capture,
    })
    await openPortalSession(harness.portal)
    const written = JSON.stringify(capture.exchanges())
    expect(written).toContain('clave=[redacted]')
    expect(written).not.toContain(encodeURIComponent(TAX_PASSWORD))
    expect(written).not.toContain(TAX_PASSWORD)
    // What a support ticket needs stays.
    expect(written).toContain('rutcntr=12345678-5')
  })
})

describe('the holder of a password session', () => {
  test('is the person who signs in, where a flow names the user of the session', async () => {
    const harness = passwordPortalWith([])
    await harness.portal.sessionCache.set(PASSWORD_SESSION_KEY, {
      token: JSON.stringify({ 'NETSCAPE_LIVEWIRE.rut': '12345678', 'NETSCAPE_LIVEWIRE.dv': '5' }),
      expiresAt: FIXED_NOW.getTime() + 60000,
    })
    // No route answers, so the flow fails on its first request: what matters is that it got that far.
    const error = await failure(validateExchangeUser(harness.portal))
    expect(error.code).not.toBe('MISSING_FIELD')
    expect(harness.urls().length).toBeGreaterThan(0)
  })
})
