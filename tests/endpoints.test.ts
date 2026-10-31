import { SII_HOSTS, SOAP_ENDPOINTS, REST_ENDPOINTS, CLAIM_WS_ENDPOINTS, UPLOAD_USER_AGENT } from '../src/catalogs/endpoints'

describe('endpoints', () => {
  test('hosts per environment', () => {
    expect(SII_HOSTS).toEqual({ certification: 'maullin.sii.cl', production: 'palena.sii.cl' })
  })

  test.each(['certification', 'production'] as const)('%s SOAP and REST URLs are https', (env) => {
    for (const url of Object.values(SOAP_ENDPOINTS[env])) expect(url).toMatch(/^https:\/\/(maullin|palena)\.sii\.cl\//)
    for (const url of Object.values(REST_ENDPOINTS[env])) expect(url).toMatch(/^https:\/\/(apicert|api|pangal|rahue)\.sii\.cl\//)
    expect(CLAIM_WS_ENDPOINTS[env]).toMatch(/^https:\/\/ws[12]\.sii\.cl\//)
  })

  test('upload endpoints', () => {
    expect(SOAP_ENDPOINTS.certification.upload).toBe('https://maullin.sii.cl/cgi_dte/UPL/DTEUpload')
    expect(REST_ENDPOINTS.production.upload).toBe('https://rahue.sii.cl/recursos/v1/boleta.electronica.envio')
    expect(UPLOAD_USER_AGENT).toBe('Mozilla/4.0 ( compatible; PROG 1.0; Windows NT)')
  })
})
