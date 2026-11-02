import {
  asksForAuthentication,
  closeSessionsOffer,
  isBlockedPage,
  isCertificateNotEnabledPage,
  isRepresentationChoice,
  isSessionLimitPage,
  looksLikeLoginRedirect,
  portalMessageOf,
  representationContinueLink,
} from '../../src/portal/pages/auth'
import { AUTH_PAGE, NOT_ENABLED_PAGE, page, SESSION_LIMIT_PAGE } from '../support/portal-pages'

test.each([
  ['superado el m', SESSION_LIMIT_PAGE],
  ['máximo', 'el máximo de sesiones'],
  ['maximo', 'el maximo de sesiones'],
  ['code', 'código 01.01.215.500.709.3'],
])('session limit: %s', (_name, html) => {
  expect(isSessionLimitPage(html)).toBe(true)
})

test('other pages are not the limit', () => {
  expect(isSessionLimitPage(page('hola'))).toBe(false)
})

test('certificate not enabled, in the wording measured at the SII', () => {
  expect(isCertificateNotEnabledPage(NOT_ENABLED_PAGE)).toBe(true)
  expect(isCertificateNotEnabledPage('01.01.215.500.473')).toBe(true)
  expect(isCertificateNotEnabledPage(page('hola'))).toBe(false)
  expect(portalMessageOf(NOT_ENABLED_PAGE)).toContain('Cambiar clave')
})

test('authentication and login leftovers', () => {
  expect(asksForAuthentication(AUTH_PAGE)).toBe(true)
  expect(asksForAuthentication(page('hola'))).toBe(false)
  for (const text of ['autInicioDTE.cgi', '/cgi_AUT2000/x', '302 Found'])
    expect(looksLikeLoginRedirect(text)).toBe(true)
  expect(looksLikeLoginRedirect('hola')).toBe(false)
})

test('representation screen and its link', () => {
  const html = page('ESCOJA COMO DESEA INGRESAR <a href="/go?x=1" class=b> Continuar </a>')
  expect(isRepresentationChoice(html)).toBe(true)
  expect(representationContinueLink(html)).toBe('/go?x=1')
  expect(isRepresentationChoice(page('hola'))).toBe(false)
  expect(representationContinueLink(page('hola'))).toBeNull()
})

test('offers to close sessions', () => {
  expect(
    closeSessionsOffer(
      page('<form action="/x"></form><form action="/cgi/CierraAnt.cgi"><input type=hidden name=K value=1></form>'),
    ),
  ).toEqual({ kind: 'form', action: '/cgi/CierraAnt.cgi', fields: { K: '1' } })
  expect(closeSessionsOffer(page('<a href="/cgi/CierraAntSesion?a=1">cerrar</a>'))).toEqual({
    kind: 'link',
    href: '/cgi/CierraAntSesion?a=1',
  })
  expect(closeSessionsOffer(page('<form></form>'))).toBeNull()
})

test.each([
  [403, page('nada'), true],
  [200, page('acceso restringido'), true],
  [200, page('Transaccion Rechazada<br>ID: 980'), true],
  [200, page('hola'), false],
])('blocks: %s', (status, html, expected) => {
  expect(isBlockedPage(status, html)).toBe(expected)
})

test('the portal message prefers alerts, else visible text', () => {
  expect(portalMessageOf(page('Hola <b>mundo</b>'))).toBe('SII Hola mundo')
  expect(portalMessageOf(`<script>alert('uno');\nalert('dos');</script>`)).toBe('uno | dos')
})
