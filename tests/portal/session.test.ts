import { DteError } from '../../src/errors'
import {
  closePortalSession,
  ensurePage,
  formEncode,
  companyFields,
  navigate,
  openPortalSession,
  portalRequest,
  withFreshSessionRetry,
  withPortalSession,
} from '../../src/portal/session'
import { createMemoryCapture } from '../../src/sii/capture'
import type { Logger } from '../../src/sii/logger'
import { FIXED_NOW, ISSUER_RUT } from '../support/fixtures'
import {
  failure,
  HERCULES,
  MAULLIN,
  portalWith,
  seedSession,
  SESSION_COOKIES,
  SESSION_KEY,
  signedIn,
} from '../support/portal'
import { AUTH_PAGE, COMPANY_FORM, NOT_ENABLED_PAGE, page, SESSION_LIMIT_PAGE } from '../support/portal-pages'

const ENTRY = 'https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoCertificado.html*'
const LOGIN_OK = {
  status: 302,
  headers: {
    Location: 'https://misiir.sii.cl/cgi_misii/siihome.cgi',
    'Set-Cookie': 'NETSCAPE_LIVEWIRE.rut=12345678; Domain=.sii.cl; Path=/, NETSCAPE_LIVEWIRE.dv=5; Path=/',
  },
}
const HOME = { url: 'https://misiir.sii.cl/cgi_misii/siihome.cgi', reply: { body: page('Mi SII') } }
const LOGIN_REDIRECT = {
  status: 302,
  headers: { Location: `https://zeus.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?${MAULLIN}/ad_empresa1` },
}
const ZEUS = { url: 'https://zeus.sii.cl/AUT2000/InicioAutenticacion/*', reply: { body: AUTH_PAGE } }

const logger = (): Logger & { readonly lines: string[] } => {
  const lines: string[] = []
  const log = (message: string): void => {
    lines.push(message)
  }
  return { debug: log, info: log, warn: log, error: log, lines }
}

const run = <T>(
  harness: { portal: Parameters<typeof withPortalSession>[0] },
  work: Parameters<typeof withPortalSession<T>>[3],
) => withPortalSession<T>(harness.portal, 'test', undefined, work)

describe('openPortalSession', () => {
  test('visits the entry page, then posts the certificate login', async () => {
    const harness = portalWith([
      { url: ENTRY, reply: { body: page('x'), headers: { 'Set-Cookie': 'TS01=abc; Path=/' } } },
      { url: `${HERCULES}*`, method: 'POST', reply: LOGIN_OK },
      HOME,
    ])
    await expect(openPortalSession(harness.portal)).resolves.toEqual({ userRut: '12345678-5', reused: false })
    const login = harness.fake.requests[1]
    expect(login.url).toBe(`${HERCULES}?https://misiir.sii.cl/cgi_misii/siihome.cgi`)
    expect(login.text).toBe('referencia=https%3A%2F%2Fmisiir.sii.cl%2Fcgi_misii%2Fsiihome.cgi')
    expect(login.headers['cookie']).toBe('TS01=abc')
    expect(login.headers['content-type']).toBe('application/x-www-form-urlencoded')
    expect(login.headers['origin']).toBe('https://herculesr.sii.cl')
    expect(login.headers['referer']).toBe(login.url)
    expect(login.timeoutMs).toBe(30000)
    expect(harness.fake.requests[0].headers['cookie']).toBeUndefined()
    const stored = await harness.portal.sessionCache.get(SESSION_KEY)
    expect(JSON.parse(stored!.token)).toMatchObject({ 'NETSCAPE_LIVEWIRE.rut': '12345678', TS01: 'abc' })
    expect(stored!.expiresAt).toBe(FIXED_NOW.getTime() + 90 * 60 * 1000)
  })

  test('reuses a cached session that still answers', async () => {
    const harness = await signedIn([{ url: `${MAULLIN}/ad_empresa1`, reply: { body: COMPANY_FORM } }])
    await expect(openPortalSession(harness.portal)).resolves.toEqual({ userRut: '12345678-5', reused: true })
    expect(harness.fake.requests).toHaveLength(1)
  })

  test.each([
    ['another page', { body: page('hola') }],
    ['another status', { status: 500, body: 'RUT_EMP' }],
    ['a transport failure', new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' })],
  ])('logs in again when the cached session meets %s', async (_name, reply) => {
    const harness = await signedIn([
      { url: `${MAULLIN}/ad_empresa1`, reply },
      { url: ENTRY, reply: { body: page('x') } },
      { url: `${HERCULES}*`, reply: LOGIN_OK },
      HOME,
    ])
    await expect(openPortalSession(harness.portal)).resolves.toMatchObject({ reused: false })
  })

  test('the page after login also counts when it holds `ad_empresa`', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/ad_empresa1`, reply: { body: page('ver /cvc_cgi/dte/ad_empresa2') } },
    ])
    await expect(openPortalSession(harness.portal)).resolves.toMatchObject({ reused: true })
  })

  test('a certificate not enabled is its own error, as measured at the SII', async () => {
    const harness = portalWith([
      { url: ENTRY, reply: { body: page('x') } },
      { url: `${HERCULES}*`, reply: { body: NOT_ENABLED_PAGE } },
    ])
    const error = await failure(openPortalSession(harness.portal))
    expect(error.code).toBe('SII_PORTAL_CERT_NOT_ENABLED')
    expect(error.details.portalMessage).toContain('Cambiar clave')
  })

  test('no session cookie is a failed login', async () => {
    const harness = portalWith([
      { url: ENTRY, reply: { body: page('x') } },
      { url: `${HERCULES}*`, reply: { body: page('algo') } },
    ])
    expect((await failure(openPortalSession(harness.portal))).code).toBe('SII_PORTAL_LOGIN_FAILED')
    expect(await harness.portal.sessionCache.get(SESSION_KEY)).toBeNull()
  })
})

describe('session limit', () => {
  const limitWith = (html: string) => ({ body: page(`${SESSION_LIMIT_PAGE}${html}`) })
  const entry = { url: ENTRY, reply: { body: page('x') } }

  test('no offer, no retry', async () => {
    const harness = portalWith([entry, { url: `${HERCULES}*`, reply: { body: SESSION_LIMIT_PAGE } }])
    expect((await failure(openPortalSession(harness.portal))).code).toBe('SII_PORTAL_SESSION_LIMIT')
    expect(harness.fake.requests).toHaveLength(2)
  })

  test('a form offer is submitted and the login repeated once', async () => {
    const harness = portalWith([
      entry,
      {
        url: `${HERCULES}*`,
        reply: [
          limitWith('<form action="/cgi_AUT2000/CierraAnt.cgi"><input type=hidden name=K value=1></form>'),
          LOGIN_OK,
        ],
      },
      { url: 'https://herculesr.sii.cl/cgi_AUT2000/CierraAnt.cgi', reply: { body: page('ok') } },
      HOME,
    ])
    await expect(openPortalSession(harness.portal)).resolves.toMatchObject({ userRut: '12345678-5' })
    expect(harness.posted('CierraAnt')).toEqual([{ K: '1', ACEPTAR: 'Aceptar' }])
  })

  test('a link offer is followed; if the limit stays, it throws', async () => {
    const limit = limitWith('<a href="/cgi_AUT2000/CierraAnt.cgi?x=1">cerrar</a>')
    const harness = portalWith([
      entry,
      { url: `${HERCULES}*`, reply: [limit, limit] },
      { url: 'https://herculesr.sii.cl/cgi_AUT2000/CierraAnt.cgi?x=1', method: 'GET', reply: { body: page('ok') } },
    ])
    expect((await failure(openPortalSession(harness.portal))).code).toBe('SII_PORTAL_SESSION_LIMIT')
    expect(harness.urls().filter((url) => url.startsWith(HERCULES))).toHaveLength(2)
  })

  test('closing can be turned off', async () => {
    const harness = portalWith(
      [entry, { url: `${HERCULES}*`, reply: limitWith('<a href="/cgi_AUT2000/CierraAnt.cgi">x</a>') }],
      { closePreviousSessions: false },
    )
    expect((await failure(openPortalSession(harness.portal))).code).toBe('SII_PORTAL_SESSION_LIMIT')
    expect(harness.fake.requests).toHaveLength(2)
  })

  test('closing that fails leaves the limit standing', async () => {
    const log = logger()
    const harness = portalWith(
      [
        entry,
        { url: `${HERCULES}*`, reply: limitWith('<a href="/cgi_AUT2000/CierraAnt.cgi">x</a>') },
        {
          url: 'https://herculesr.sii.cl/cgi_AUT2000/CierraAnt.cgi',
          reply: new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' }),
        },
      ],
      { logger: log },
    )
    expect((await failure(openPortalSession(harness.portal))).code).toBe('SII_PORTAL_SESSION_LIMIT')
    expect(log.lines).toContain('sii portal could not close earlier sessions')
  })

  test('a limit page while visiting a CGI page is handled the same way', async () => {
    const harness = await signedIn([{ url: `${MAULLIN}/ad_empresa1`, reply: { body: SESSION_LIMIT_PAGE } }])
    const error = await failure(run(harness, (context) => ensurePage(context, 'x', `${MAULLIN}/ad_empresa1`)))
    expect(error.code).toBe('SII_PORTAL_SESSION_LIMIT')
  })
})

describe('ensurePage', () => {
  test('a live session goes straight to the page', async () => {
    const harness = await signedIn([{ url: `${MAULLIN}/ad_empresa1`, reply: { body: COMPANY_FORM } }])
    const reached = await run(harness, (context) => ensurePage(context, 'x', `${MAULLIN}/ad_empresa1`))
    expect(reached.html).toBe(COMPANY_FORM)
    expect(harness.fake.requests[0].headers['cookie']).toContain('NETSCAPE_LIVEWIRE.rut=12345678')
  })

  test('an expired session logs in on demand with the target of the redirect', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/ad_empresa1`, reply: [LOGIN_REDIRECT, { body: COMPANY_FORM }] },
      ZEUS,
      {
        url: `${HERCULES}*`,
        reply: { status: 302, headers: { Location: `${MAULLIN}/ad_empresa1`, 'Set-Cookie': 'NETSCAPE_LIVEWIRE.x=1' } },
      },
    ])
    const reached = await run(harness, (context) => ensurePage(context, 'x', `${MAULLIN}/ad_empresa1`))
    expect(reached.html).toBe(COMPANY_FORM)
    expect(harness.urls()).toContain(`${HERCULES}?${MAULLIN}/ad_empresa1`)
    expect(harness.posted('CAutInicio')).toEqual([{ referencia: `${MAULLIN}/ad_empresa1` }])
  })

  test('a second request for login within one operation is an expired session', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/a`, reply: LOGIN_REDIRECT },
      { url: `${MAULLIN}/ad_empresa1`, reply: LOGIN_REDIRECT },
      ZEUS,
      { url: `${HERCULES}*`, reply: { body: page('ok') } },
    ])
    const error = await failure(
      run(harness, async (context) => {
        await ensurePage(context, 'first', `${MAULLIN}/a`)
        await ensurePage(context, 'second', `${MAULLIN}/a`)
      }),
    )
    expect(error.code).toBe('SII_PORTAL_SESSION_EXPIRED')
    expect(error.details).toMatchObject({ operation: 'test', step: 'second' })
  })

  test('an authentication page without a redirect target comes back as it is', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/a`, reply: { body: AUTH_PAGE } },
      {
        url: `${MAULLIN}/b`,
        reply: { status: 302, headers: { Location: 'https://zeus.sii.cl/AUT2000/InicioAutenticacion/x' } },
      },
      ZEUS,
    ])
    await run(harness, async (context) => {
      expect((await ensurePage(context, 'x', `${MAULLIN}/a`)).html).toBe(AUTH_PAGE)
      expect((await ensurePage(context, 'x', `${MAULLIN}/b`)).html).toBe(AUTH_PAGE)
    })
  })

  test('a query that does not decode is used raw', async () => {
    const harness = await signedIn([
      {
        url: `${MAULLIN}/a`,
        reply: { status: 302, headers: { Location: 'https://zeus.sii.cl/AUT2000/InicioAutenticacion/x?%zz' } },
      },
      ZEUS,
      { url: `${HERCULES}*`, reply: { body: page('ok') } },
    ])
    await run(harness, (context) => ensurePage(context, 'x', `${MAULLIN}/a`))
    expect(harness.posted('CAutInicio')).toEqual([{ referencia: '%zz' }])
  })

  test('the representation screen is not a failure: its link goes on', async () => {
    const choice = page('ESCOJA COMO DESEA INGRESAR <a href="/go">Continuar</a>', 'Autenticaci&oacute;n')
    const harness = await signedIn([
      {
        url: `${MAULLIN}/a`,
        reply: { status: 302, headers: { Location: 'https://maullin.sii.cl/choice?x=1' } },
      },
      { url: 'https://maullin.sii.cl/choice?x=1', reply: { body: choice } },
      { url: 'https://maullin.sii.cl/go', reply: { body: COMPANY_FORM } },
    ])
    const reached = await run(harness, (context) => ensurePage(context, 'x', `${MAULLIN}/a`))
    expect(reached.html).toBe(COMPANY_FORM)
    expect(harness.urls()).not.toContain(`${HERCULES}?x=1`)
  })

  test('without its link the representation screen comes back', async () => {
    const choice = page('ESCOJA COMO DESEA INGRESAR')
    const harness = await signedIn([{ url: `${MAULLIN}/a`, reply: { body: choice } }])
    expect((await run(harness, (context) => ensurePage(context, 'x', `${MAULLIN}/a`))).html).toBe(choice)
  })

  test('a page pointing at the annulment entry is visited once more', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/af_anular1`, reply: [{ body: page('ir a /cvc_cgi/dte/af_anular1') }, { body: page('real') }] },
    ])
    expect((await run(harness, (context) => ensurePage(context, 'x', `${MAULLIN}/af_anular1`))).html).toBe(page('real'))
  })
})

describe('requests', () => {
  test('a block stops at once, with what the page said', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/a`, reply: { status: 200, body: page('Transaccion Rechazada<br>ID: 980') } },
    ])
    const error = await failure(run(harness, (context) => portalRequest(context, 'x', 'GET', `${MAULLIN}/a`)))
    expect(error.code).toBe('SII_PORTAL_BLOCKED')
    expect(error.details).toMatchObject({ operation: 'test', step: 'x', httpStatus: 200 })
    expect(error.details.portalMessage).toContain('Transaccion Rechazada')
  })

  test('502, 503 and 504 repeat; the waits follow the policy', async () => {
    const harness = await signedIn(
      [{ url: `${MAULLIN}/a`, reply: [{ status: 502 }, { status: 503 }, { status: 504 }, { body: page('ok') }] }],
      { retry: { jitterRatio: 0 } },
    )
    expect((await run(harness, (context) => portalRequest(context, 'x', 'GET', `${MAULLIN}/a`))).html).toBe(page('ok'))
    expect(harness.sleeps).toEqual([2000, 4000, 8000])
  })

  test('the portal TLS hiccup repeats and the operator can see it', async () => {
    const log = logger()
    const harness = await signedIn(
      [{ url: `${MAULLIN}/a`, reply: [new DteError('TRANSPORT_TLS', { reason: 'EPROTO' }), { body: page('ok') }] }],
      { retry: {}, logger: log },
    )
    await run(harness, (context) => portalRequest(context, 'x', 'GET', `${MAULLIN}/a`))
    expect(log.lines).toContain('sii portal retrying')
  })

  test('with retries exhausted, the HTTP error reaches the caller', async () => {
    const harness = await signedIn([{ url: `${MAULLIN}/a`, reply: { status: 503, body: 'caido' } }])
    const error = await failure(run(harness, (context) => portalRequest(context, 'x', 'GET', `${MAULLIN}/a`)))
    expect(error.code).toBe('SII_HTTP_ERROR')
    expect(error.details).toMatchObject({ httpStatus: 503, channel: 'portal', operation: 'test.x' })
  })

  test('any other status is a page', async () => {
    const harness = await signedIn([{ url: `${MAULLIN}/a`, reply: { status: 500, body: 'Error 500' } }])
    const reached = await run(harness, (context) => portalRequest(context, 'x', 'GET', `${MAULLIN}/a`))
    expect(reached).toMatchObject({ status: 500, html: 'Error 500', lastLocation: null })
  })

  test('Latin-1 unless the page declares UTF-8', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/a`, reply: { body: 'Ñuñoa', encoding: 'latin1' } },
      {
        url: `${MAULLIN}/b`,
        reply: { body: 'Ñuñoa', encoding: 'utf8', headers: { 'Content-Type': 'text/html; charset=UTF-8' } },
      },
    ])
    await run(harness, async (context) => {
      expect((await portalRequest(context, 'x', 'GET', `${MAULLIN}/a`)).html).toBe('Ñuñoa')
      expect((await portalRequest(context, 'x', 'GET', `${MAULLIN}/b`)).html).toBe('Ñuñoa')
    })
  })

  test('redirects stop after eight hops and resolve relative targets', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/loop`, reply: { status: 302, headers: { Location: '/cvc_cgi/dte/loop' } } },
    ])
    const reached = await run(harness, (context) => navigate(context, 'x', 'GET', `${MAULLIN}/loop`))
    expect(harness.fake.requests).toHaveLength(9)
    expect(reached.lastLocation).toBe(`${MAULLIN}/loop`)
  })

  test('a redirect status without a target is a page', async () => {
    const harness = await signedIn([{ url: `${MAULLIN}/a`, reply: { status: 302 } }])
    const reached = await run(harness, (context) => navigate(context, 'x', 'GET', `${MAULLIN}/a`))
    expect(reached.status).toBe(302)
  })

  test('overrides reach the request', async () => {
    const harness = await signedIn([{ url: `${MAULLIN}/a`, reply: { body: 'x' } }])
    await withPortalSession(harness.portal, 'test', { timeoutMs: 5 }, (context) =>
      portalRequest(context, 'x', 'GET', `${MAULLIN}/a`),
    )
    expect(harness.fake.requests[0].timeoutMs).toBe(5)
  })

  test('the capture sees the portal channel, the step and no cookie value', async () => {
    const capture = createMemoryCapture()
    const harness = await signedIn(
      [
        {
          url: `${MAULLIN}/a`,
          reply: {
            body: page('NETSCAPE_LIVEWIRE.rut=99999999;'),
            headers: { 'Set-Cookie': 'CSESSIONID=secret-value' },
          },
        },
      ],
      { capture: capture.capture },
    )
    await run(harness, (context) => portalRequest(context, 'x', 'GET', `${MAULLIN}/a`))
    const [exchange] = capture.exchanges()
    expect(exchange.channel).toBe('portal')
    expect(exchange.operation).toBe('test.x')
    const text = JSON.stringify(exchange)
    expect(text).not.toContain('cookie-value')
    expect(text).not.toContain('secret-value')
    expect(text).not.toContain('99999999')
  })

  test('form helpers', () => {
    expect(formEncode({ a: 'ñ b', c: '' })).toBe('a=%C3%B1%20b&c=')
    expect(companyFields(ISSUER_RUT as never)).toEqual({ RUT_EMP: '76543210', DV_EMP: '3' })
  })
})

describe('the session in the cache', () => {
  test('an expired entry does not count', async () => {
    const harness = portalWith([{ url: `${MAULLIN}/a`, reply: { body: 'x' } }])
    await harness.portal.sessionCache.set(SESSION_KEY, { token: JSON.stringify(SESSION_COOKIES), expiresAt: 1 })
    await run(harness, (context) => portalRequest(context, 'x', 'GET', `${MAULLIN}/a`))
    expect(harness.fake.requests[0].headers['cookie']).toBeUndefined()
  })

  test('a failing cache is logged and never fails the operation', async () => {
    const log = logger()
    const boom = async (): Promise<never> => {
      throw new Error('cache down')
    }
    const harness = portalWith([{ url: `${MAULLIN}/a`, reply: { body: 'x' } }], {
      logger: log,
      sessionCache: { get: boom, set: boom, delete: boom },
    })
    await expect(run(harness, (context) => portalRequest(context, 'x', 'GET', `${MAULLIN}/a`))).resolves.toMatchObject({
      html: 'x',
    })
    expect(log.lines.filter((line) => line === 'sii portal session cache failed')).toHaveLength(2)
  })

  test('two operations on one certificate never overlap', async () => {
    const harness = await signedIn([{ url: `${MAULLIN}/a`, reply: { body: 'x' } }])
    const order: string[] = []
    const op = (name: string) =>
      run(harness, async (context) => {
        order.push(`${name} start`)
        await portalRequest(context, 'x', 'GET', `${MAULLIN}/a`)
        order.push(`${name} end`)
      })
    await Promise.all([op('one'), op('two')])
    expect(order).toEqual(['one start', 'one end', 'two start', 'two end'])
  })
})

describe('withFreshSessionRetry', () => {
  test.each(['SII_PORTAL_SESSION_EXPIRED', 'SII_PORTAL_UNEXPECTED_PAGE'] as const)(
    '%s repeats once with the session forgotten',
    async (code) => {
      const log = logger()
      const harness = await signedIn([], { logger: log })
      const seen: Readonly<Record<string, string>>[] = []
      const result = await run(harness, (context) =>
        withFreshSessionRetry(context, async () => {
          seen.push(context.state.cookies)
          if (seen.length === 1) throw new DteError(code)
          return 'done'
        }),
      )
      expect(result).toBe('done')
      expect(seen[1]).toEqual({})
      expect(log.lines).toContain('sii portal retrying with a fresh session')
    },
  )

  test('anything else goes straight through', async () => {
    const harness = await signedIn([])
    const calls = { count: 0 }
    const attempt = (thrown: unknown) =>
      run(harness, (context) =>
        withFreshSessionRetry(context, async () => {
          calls.count += 1
          throw thrown
        }),
      )
    expect((await failure(attempt(new DteError('SII_PORTAL_BLOCKED')))).code).toBe('SII_PORTAL_BLOCKED')
    await expect(attempt(new Error('boom'))).rejects.toThrow('boom')
    expect(calls.count).toBe(2)
  })
})

describe('closePortalSession', () => {
  test('tries every logout URL, once, and removes the session', async () => {
    const harness = await signedIn([
      { url: 'https://zeusr.sii.cl/cgi_AUT2000/autTermino.cgi', reply: new DteError('TRANSPORT_FAILED') },
      { url: 'https://herculesr.sii.cl/cgi_AUT2000/autLogout.cgi', reply: { status: 404 } },
      { url: 'https://www.sii.cl/AUT2000/autLogout.cgi', reply: { status: 503 } },
    ])
    await closePortalSession(harness.portal)
    expect(harness.fake.requests).toHaveLength(3)
    expect(await harness.portal.sessionCache.get(SESSION_KEY)).toBeNull()
  })

  test('with no session there is nothing to say to the SII', async () => {
    const harness = portalWith([])
    await closePortalSession(harness.portal)
    expect(harness.fake.requests).toHaveLength(0)
  })

  test('seeding helper accepts custom cookies', async () => {
    const harness = portalWith([])
    await seedSession(harness.portal, { 'NETSCAPE_LIVEWIRE.rut': '1' })
    expect((await harness.portal.sessionCache.get(SESSION_KEY))!.token).toContain('LIVEWIRE')
  })
})
