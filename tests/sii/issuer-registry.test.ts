import { readFileSync } from 'node:fs'
import { DEFAULT_RETRY_POLICY } from '../../src/sii/retry'
import { isUnlistedIssuer, parseIssuerRegistry } from '../../src/portal/pages/issuer-registry'
import { queryAuthorizedIssuer, type IssuerRegistryClient } from '../../src/sii/issuer-registry'
import { createFakeSii, type FakeReply } from '../support/fake-sii'
import { fixturePath, FIXED_NOW } from '../support/fixtures'
import { expectCode, testSii } from '../support/sii-client'

const MAULLIN = 'https://maullin.sii.cl/cvc_cgi/dte/ee_empresa_rut'
const PALENA = 'https://palena.sii.cl/cvc_cgi/dte/ee_empresa_rut'
// The CGI answers ISO-8859-1 bytes and declares no charset.
const bytes = (name: string): Uint8Array => new Uint8Array(readFileSync(fixturePath(`sii/${name}`)))
const page = (name: string): FakeReply => ({ headers: { 'Content-Type': 'text/html' }, body: bytes(name) })
const AUTHORIZED = page('issuer-registry-authorized.html')
const UNLISTED = page('issuer-registry-unlisted.html')

// No certificate: the registry needs only an environment and the means to send.
const plainClient = (reply: FakeReply | FakeReply[], overrides: Partial<IssuerRegistryClient> = {}) => {
  const fake = createFakeSii([{ url: /ee_empresa_rut$/, reply }])
  const sleeps: number[] = []
  const client: IssuerRegistryClient = {
    environment: 'certification',
    transport: fake.transport,
    capture: null,
    logger: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
    now: () => FIXED_NOW,
    retry: false,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    ...overrides,
  }
  return { client, fake, sleeps }
}

describe('queryAuthorizedIssuer', () => {
  test('reads the resolution of the environment and the document types, as the cover needs them', async () => {
    const { client, fake } = plainClient(AUTHORIZED)
    const issuer = await queryAuthorizedIssuer(client, { rut: '76.543.210-3' })
    expect(issuer).toMatchObject({
      rut: '76543210-3',
      businessName: 'EMPRESA DE PRUEBA LIMITADA',
      resolutionNumber: 0,
      resolutionDate: '2026-01-01',
      regionalOffice: 'VI',
    })
    expect(issuer.documents.map((document) => document.type)).toEqual([33, 34, 39, 41, 43, 52, 56, 61, 890])
    expect(issuer.documents.find((document) => document.type === 39)).toEqual({
      type: 39,
      description: 'BOLETA ELECTRONICA',
      authorizedFrom: '2026-10-07',
      deauthorizedOn: null,
    })
    expect(issuer.documents.find((document) => document.type === 890)).toMatchObject({
      description: 'SIST. SII DE EMISIÓN DE BOLETAS ELECTRÓNICAS',
      deauthorizedOn: '2026-10-22',
    })
    const [request] = fake.requests
    expect(request).toMatchObject({ method: 'POST', url: MAULLIN, timeoutMs: 20000 })
    expect(request.text).toBe('RUT_EMP=76543210&DV_EMP=3&ACEPTAR=Consultar')
    expect(request.headers).toMatchObject({
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'Mozilla/4.0 ( compatible; PROG 1.0; Windows NT)',
    })
    expect(request.headers.cookie).toBeUndefined()
  })

  test('asks the host of each environment, and a SII client fits as well', async () => {
    const production = plainClient(AUTHORIZED, { environment: 'production' })
    await queryAuthorizedIssuer(production.client, { rut: '76543210-3' }, { timeoutMs: 5000 })
    expect(production.fake.requests[0]).toMatchObject({ url: PALENA, timeoutMs: 5000 })
    const { sii, fake } = testSii([{ url: MAULLIN, reply: AUTHORIZED }])
    await expect(queryAuthorizedIssuer(sii, { rut: '76543210-3' })).resolves.toMatchObject({ resolutionNumber: 0 })
    expect(fake.requests).toHaveLength(1)
  })

  test('a RUT that is not an authorized issuer is told apart from a page that cannot be read', async () => {
    const unlisted = plainClient(UNLISTED)
    const error = await queryAuthorizedIssuer(unlisted.client, { rut: '12345678-5' }).catch((thrown) => thrown)
    expect(error).toMatchObject({
      code: 'SII_PORTAL_REJECTED',
      details: { rejection: 'companyNotAuthorized', operation: 'queryAuthorizedIssuer' },
    })
    expect(error.details.portalMessage).toContain('no corresponde a una empresa autorizada')
    const changed = plainClient({ body: '<html><body>El SII cambió esta página</body></html>' })
    const unreadable = await queryAuthorizedIssuer(changed.client, { rut: '76543210-3' }).catch((thrown) => thrown)
    expect(unreadable).toMatchObject({
      code: 'SII_PORTAL_UNEXPECTED_PAGE',
      details: { operation: 'queryAuthorizedIssuer', step: 'ee_empresa_rut' },
    })
  })

  test('an HTTP error is an error, and it follows the retry policy', async () => {
    const failing = plainClient({ status: 503, body: 'down' })
    await expectCode(queryAuthorizedIssuer(failing.client, { rut: '76543210-3' }), 'SII_HTTP_ERROR')
    const recovering = plainClient([{ status: 503, body: 'down' }, AUTHORIZED], {
      retry: { ...DEFAULT_RETRY_POLICY, maxAttempts: 2 },
    })
    await expect(queryAuthorizedIssuer(recovering.client, { rut: '76543210-3' })).resolves.toMatchObject({
      businessName: 'EMPRESA DE PRUEBA LIMITADA',
    })
    expect(recovering.sleeps).toHaveLength(1)
  })

  test('an invalid RUT is refused before anything is sent', async () => {
    const { client, fake } = plainClient(AUTHORIZED)
    await expectCode(queryAuthorizedIssuer(client, { rut: '76543210-K' }), 'INVALID_RUT')
    expect(fake.requests).toEqual([])
  })
})

describe('parseIssuerRegistry', () => {
  test('a label that moved leaves its field null, and a table without documents has none', () => {
    expect(
      parseIssuerRegistry('<table><tr><td>Raz&oacute;n Social/Nombres</td><td>EMPRESA X</td></tr></table>'),
    ).toEqual({
      businessName: 'EMPRESA X',
      resolutionNumber: null,
      resolutionDate: null,
      regionalOffice: null,
      documents: [],
    })
  })

  test('the degree sign of the resolution number may come as a bad byte, and a value may be missing', () => {
    const html = (label: string, value: string) =>
      `<table><tr><td>${label}</td><td>${value}</td></tr><tr><td>Fecha Resoluci&oacute;n</td><td>21-9-2026</td></tr><tr><td>Direcci&oacute;n Regional</td><td>&nbsp;</td></tr></table>`
    expect(parseIssuerRegistry(html('NÂ° ResoluciÃ³n', '80')).resolutionNumber).toBe(80)
    expect(parseIssuerRegistry(html('N� Resoluci&oacute;n', '80')).resolutionNumber).toBe(80)
    expect(parseIssuerRegistry(html('N Resolucion', 'ochenta'))).toMatchObject({
      resolutionNumber: null,
      resolutionDate: null,
      regionalOffice: null,
    })
  })

  test('only rows whose code is a document type, with a description, are documents', () => {
    const rows = [
      '<tr><td>C&oacute;digo</td><td>Descripci&oacute;n</td><td>Autorizado</td><td>Desautorizado</td></tr>',
      '<tr><td>33</td><td>FACTURA</td><td>01-10-2026</td><td>&nbsp;</td></tr>',
      '<tr><td>12</td><td>OTRA</td><td>01-10-2026</td><td>&nbsp;</td></tr>',
      '<tr><td>34</td><td>&nbsp;</td><td>01-10-2026</td><td>&nbsp;</td></tr>',
      '<tr><td>52</td><td>GUIA</td></tr>',
      '<tr><td>61</td></tr>',
      '<tr></tr>',
    ]
    expect(parseIssuerRegistry(`<table>${rows.join('')}</table>`).documents).toEqual([
      { type: 33, description: 'FACTURA', authorizedFrom: '2026-10-01', deauthorizedOn: null },
      { type: 52, description: 'GUIA', authorizedFrom: null, deauthorizedOn: null },
    ])
  })

  test('the sentence of a RUT that is not an issuer', () => {
    expect(isUnlistedIssuer(readFileSync(fixturePath('sii/issuer-registry-unlisted.html')).toString('latin1'))).toBe(
      true,
    )
    expect(isUnlistedIssuer(readFileSync(fixturePath('sii/issuer-registry-authorized.html')).toString('latin1'))).toBe(
      false,
    )
  })
})
