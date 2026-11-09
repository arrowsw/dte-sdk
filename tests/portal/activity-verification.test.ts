import { ACTIVITY_VERIFICATION_SERVICE } from '../../src/catalogs/portal'
import { listAccreditationDocuments, unstable_fetchActivityVerification } from '../../src/portal/activity-verification'
import type { FakeReply, FakeRoute, RecordedRequest } from '../support/fake-sii'
import { failure, portalWith, signedIn, type PortalHarness } from '../support/portal'
import { page } from '../support/portal-pages'
import { ACCREDITATION_ROWS, verificationAnswer, verificationEntry } from '../support/activity-verification-samples'

// The app lives only on the production host: a certification client reads it there too.
const APP = 'https://www4.sii.cl/verificacionactividadesinternetui/'
const API = `${APP}services/data/facadeService`
const NAMESPACE = 'cl.sii.sdi.lob.did.verificacionactividades.data.api.interfaces.FacadeService'
const TOKEN = 'token-de-prueba'

const json = (value: unknown): FakeReply => ({
  headers: { 'Content-Type': 'application/json;charset=UTF-8' },
  body: JSON.stringify(value),
  encoding: 'utf8',
})
const app: FakeRoute = { url: APP, reply: { headers: { 'Set-Cookie': `TOKEN=${TOKEN}; Path=/` }, body: page('app') } }
const api = (method: string, reply: FakeRoute['reply']): FakeRoute => ({
  url: `${API}/${method}`,
  method: 'POST',
  reply,
})
const posts = (harness: PortalHarness): readonly RecordedRequest[] =>
  harness.fake.requests.filter((request) => request.method === 'POST')
const sent = (request: RecordedRequest): Record<string, unknown> => JSON.parse(request.text)

const options = { randomId: () => 'tx-1' }

describe('unstable_fetchActivityVerification', () => {
  const routes = (reply: FakeRoute['reply'] = json(verificationAnswer())): FakeRoute[] => [
    app,
    api('consultarVerificacionInternet', reply),
  ]

  test('visits the app on production and posts the envelope the app posts, with the company as the taxpayer', async () => {
    const harness = await signedIn(routes(), options)
    const verification = await unstable_fetchActivityVerification(harness.portal)
    expect(harness.urls()[0]).toBe(APP)
    const [post] = posts(harness)
    expect(post.url).toBe(`${API}/consultarVerificacionInternet`)
    expect(post.headers.referer).toBe(APP)
    expect(sent(post)).toEqual({
      metaData: {
        namespace: `${NAMESPACE}/consultarVerificacionInternet`,
        conversationId: TOKEN,
        transactionId: 'tx-1',
      },
      data: { contribuyenteBO: { rut: 76543210, dv: '3' } },
    })
    expect(verification).toEqual({
      requests: [
        {
          number: 1234567,
          kind: 'VIA',
          reason: 'INGRESO DE UNA SOLICITUD DE VERIFICACION',
          preliminaryResult: 'CONDICIONADA',
          finalResult: null,
          status: 'PAC',
          statusDescription: 'PENDIENTE DE ACREDITACIÓN',
          requestedOn: '2026-11-05',
          accreditationDeadline: null,
          procedureStatus: null,
          hasCertificate: false,
        },
      ],
      messages: [],
    })
  })

  test('the company of the call goes before the client one', async () => {
    const entry = verificationEntry({ rut: 14625621, dv: 'K' })
    const harness = await signedIn(routes(json(verificationAnswer([entry]))), options)
    await unstable_fetchActivityVerification(harness.portal, { companyRut: '14.625.621-k' })
    expect(sent(posts(harness)[0]).data).toEqual({ contribuyenteBO: { rut: 14625621, dv: 'K' } })
  })

  test('a company is needed, and it must be a RUT', async () => {
    const harness = await signedIn(routes(), { companyRut: undefined })
    expect(await failure(unstable_fetchActivityVerification(harness.portal))).toMatchObject({
      code: 'MISSING_FIELD',
      details: { field: 'companyRut' },
    })
    expect(await failure(unstable_fetchActivityVerification(harness.portal, { companyRut: '1-2' }))).toMatchObject({
      code: 'INVALID_RUT',
    })
    expect(harness.fake.requests).toHaveLength(0)
  })

  test("an error code is the SII's refusal, said once and not repeated", async () => {
    const answer = verificationAnswer([], { codigoError: 9, descripcionError: 'Servicio no disponible' })
    const harness = await signedIn(routes(json(answer)), options)
    const error = await failure(unstable_fetchActivityVerification(harness.portal))
    expect(error).toMatchObject({
      code: 'SII_PORTAL_REJECTED',
      details: {
        rejection: 'activityVerificationRefused',
        operation: 'fetchActivityVerification',
        portalMessage: 'Servicio no disponible',
      },
    })
    expect(posts(harness)).toHaveLength(1)
  })

  test('a refusal without words has no portal message', async () => {
    const harness = await signedIn(routes(json(verificationAnswer([], { codigoError: 9 }))), options)
    const error = await failure(unstable_fetchActivityVerification(harness.portal))
    expect(error.details).not.toHaveProperty('portalMessage')
  })

  test("requests of someone other than the company never come out, nor does the answer's data", async () => {
    const other = verificationEntry({ rut: 12345678, dv: '5' })
    const harness = await signedIn(routes(json(verificationAnswer([other]))), options)
    const error = await failure(unstable_fetchActivityVerification(harness.portal))
    expect(error).toMatchObject({ code: 'SII_PORTAL_UNEXPECTED_PAGE', details: { step: 'otherTaxpayer' } })
    expect(JSON.stringify(error.details)).not.toMatch(/12345678|FICTICI|CALLE/)
    expect(posts(harness)).toHaveLength(1)
  })

  test('an answer without data is repeated once with a fresh session', async () => {
    const harness = await signedIn(routes(json({ data: null, metaData: {} })), options)
    const error = await failure(unstable_fetchActivityVerification(harness.portal))
    expect(error).toMatchObject({
      code: 'SII_PORTAL_UNEXPECTED_PAGE',
      details: { operation: 'fetchActivityVerification', step: 'consultarVerificacionInternet' },
    })
    expect(posts(harness)).toHaveLength(2)
  })

  test('an answer that is not JSON is a page it cannot read', async () => {
    const harness = await signedIn(routes({ body: page('Intermedia') }), options)
    const error = await failure(unstable_fetchActivityVerification(harness.portal))
    expect(error).toMatchObject({
      code: 'SII_PORTAL_UNEXPECTED_PAGE',
      details: { step: 'consultarVerificacionInternet' },
    })
  })

  test('the accents arrive as the SII writes them in UTF-8', async () => {
    const harness = await signedIn(routes(), options)
    const { requests } = await unstable_fetchActivityVerification(harness.portal)
    expect(requests[0].statusDescription).toBe('PENDIENTE DE ACREDITACIÓN')
  })

  test('a cold session logs in on the way to the app', async () => {
    const login = `https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?${APP}`
    const harness = portalWith([
      {
        url: APP,
        reply: [
          { status: 302, headers: { Location: login } },
          { headers: { 'Set-Cookie': `TOKEN=${TOKEN}; Path=/` }, body: page('app') },
        ],
      },
      { url: login, reply: { body: page('<p>Ingrese su clave</p>', 'Autenticaci&oacute;n') } },
      {
        url: `https://herculesr.sii.cl/cgi_AUT2000/CAutInicio.cgi?${APP}`,
        method: 'POST',
        reply: {
          headers: { 'Set-Cookie': 'NETSCAPE_LIVEWIRE.rut=12345678; Path=/' },
          body: `<html><head><title>Autenticaci&oacute;n</title></head><script>location.replace('${APP}');</script></html>`,
        },
      },
      api('consultarVerificacionInternet', json(verificationAnswer())),
    ])
    await expect(unstable_fetchActivityVerification(harness.portal)).resolves.toMatchObject({
      requests: [{ status: 'PAC' }],
    })
  })
})

describe('listAccreditationDocuments', () => {
  test('posts no data and gives the catalog', async () => {
    const harness = await signedIn([app, api('recuperarDocAcreditar', json({ data: ACCREDITATION_ROWS }))], options)
    await expect(listAccreditationDocuments(harness.portal)).resolves.toEqual([
      { category: 'specific', code: 5, description: 'AUTORIZACIÓN DE CARABINEROS' },
      { category: 'general', code: 1, description: 'FACTURA DE PROVEEDORES' },
      { category: 'specific', code: 1, description: 'CERTIFICADO CONAF' },
    ])
    expect(sent(posts(harness)[0])).toEqual({
      metaData: { namespace: `${NAMESPACE}/recuperarDocAcreditar`, conversationId: TOKEN, transactionId: 'tx-1' },
      data: null,
    })
  })

  test('an answer without a list is repeated once with a fresh session', async () => {
    const harness = await signedIn([app, api('recuperarDocAcreditar', json({ data: null }))], options)
    const error = await failure(listAccreditationDocuments(harness.portal))
    expect(error).toMatchObject({
      code: 'SII_PORTAL_UNEXPECTED_PAGE',
      details: { operation: 'listAccreditationDocuments', step: 'recuperarDocAcreditar' },
    })
    expect(posts(harness)).toHaveLength(2)
  })
})

test('the service of the app', () => {
  expect(ACTIVITY_VERIFICATION_SERVICE).toEqual({
    entryApp: 'verificacionactividadesinternetui',
    app: 'verificacionactividadesinternetui',
    facade: 'services/data/facadeService',
    namespace: NAMESPACE,
    paged: false,
    productionOnly: true,
    omitsPage: true,
  })
})
