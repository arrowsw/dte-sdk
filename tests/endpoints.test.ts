import {
  ASSIGNMENT_ENDPOINTS,
  SII_HOSTS,
  SOAP_ENDPOINTS,
  REST_ENDPOINTS,
  CLAIM_WS_ENDPOINTS,
  CLAIM_WSDL_ENDPOINTS,
  UPLOAD_USER_AGENT,
} from '../src/catalogs/endpoints'

describe('endpoints', () => {
  test('hosts per environment', () => {
    expect(SII_HOSTS).toEqual({ certification: 'maullin.sii.cl', production: 'palena.sii.cl' })
  })

  test.each(['certification', 'production'] as const)('%s SOAP, REST and claim URLs are https', (env) => {
    for (const url of Object.values(SOAP_ENDPOINTS[env])) expect(url).toMatch(/^https:\/\/(maullin|palena)\.sii\.cl\//)
    for (const url of Object.values(REST_ENDPOINTS[env]))
      expect(url).toMatch(/^https:\/\/(apicert|api|pangal|rahue)\.sii\.cl\//)
    expect(CLAIM_WS_ENDPOINTS[env]).toMatch(
      /^https:\/\/ws[12]\.sii\.cl\/WSREGISTRORECLAMODTE(CERT)?\/registroreclamodteservice$/,
    )
    expect(CLAIM_WSDL_ENDPOINTS[env]).toBe(`${CLAIM_WS_ENDPOINTS[env]}?wsdl`)
  })

  test('upload endpoints', () => {
    expect(SOAP_ENDPOINTS.certification.upload).toBe('https://maullin.sii.cl/cgi_dte/UPL/DTEUpload')
    expect(REST_ENDPOINTS.production.upload).toBe('https://rahue.sii.cl/recursos/v1/boleta.electronica.envio')
    expect(UPLOAD_USER_AGENT).toBe('Mozilla/4.0 ( compatible; PROG 1.0; Windows NT)')
  })

  test('the registry of credit transfers lives on the DTE hosts', () => {
    expect(ASSIGNMENT_ENDPOINTS).toEqual({
      certification: {
        upload: 'https://maullin.sii.cl/cgi_rtc/RTC/RTCAnotEnvio.cgi',
        uploadStatus: 'https://maullin.sii.cl/DTEWS/services/wsRPETCConsulta',
      },
      production: {
        upload: 'https://palena.sii.cl/cgi_rtc/RTC/RTCAnotEnvio.cgi',
        uploadStatus: 'https://palena.sii.cl/DTEWS/services/wsRPETCConsulta',
      },
    })
  })

  test('REST status endpoints are prefixes the client completes', () => {
    expect(REST_ENDPOINTS.certification.status).toBe('https://apicert.sii.cl/recursos/v1/boleta.electronica.envio/')
    expect(REST_ENDPOINTS.production.documentStatus).toBe('https://api.sii.cl/recursos/v1/boleta.electronica/')
  })
})
