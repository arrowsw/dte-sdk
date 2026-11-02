import { cgiUrl, PORTAL_LOGOUT_URLS, PORTAL_REJECTIONS, portalRejectionMessage } from '../src/catalogs/portal'

test('CGI pages live on the host of the environment', () => {
  expect(cgiUrl('certification', 'ad_empresa1')).toBe('https://maullin.sii.cl/cvc_cgi/dte/ad_empresa1')
  expect(cgiUrl('production', 'ad_empresa1')).toBe('https://palena.sii.cl/cvc_cgi/dte/ad_empresa1')
})

test('every rejection tells the operator something in Spanish', () => {
  for (const [rejection, message] of Object.entries(PORTAL_REJECTIONS)) {
    expect(message.length).toBeGreaterThan(20)
    expect(portalRejectionMessage(rejection as keyof typeof PORTAL_REJECTIONS)).toBe(message)
  }
})

test('logout candidates are SII URLs', () => {
  for (const url of PORTAL_LOGOUT_URLS) expect(new URL(url).hostname.endsWith('.sii.cl')).toBe(true)
})
