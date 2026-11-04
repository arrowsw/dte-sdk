import { RCV_SERVICES } from '../../src/catalogs/portal'
import {
  fetchPurchaseDocument,
  fetchRegisterSummary,
  listPeriodDocuments,
  listPurchaseTypes,
} from '../../src/portal/rcv'
import { createMemoryCapture } from '../../src/sii/capture'
import { DteError } from '../../src/errors'
import { ISSUER_RUT, RECEIVER_RUT } from '../support/fixtures'
import type { FakeReply, FakeRoute, RecordedRequest } from '../support/fake-sii'
import {
  failure,
  HERCULES,
  portalWith,
  seedSession,
  SESSION_COOKIES,
  signedIn,
  type PortalHarness,
} from '../support/portal'
import { AUTH_PAGE, page } from '../support/portal-pages'

const CERTIFICATION = 'https://www4c.sii.cl'
const PRODUCTION = 'https://www4.sii.cl'
const TOKEN = 'token-de-prueba'
const COOKIE = { 'Set-Cookie': `TOKEN=${TOKEN}; Path=/` }
const DOCUMENTS_API = `${CERTIFICATION}/consemitidosinternetui/services/data/facadeService`
const REGISTER_API = `${CERTIFICATION}/consdcvinternetui/services/data/facadeService`
const COMPLEMENTS_API = `${CERTIFICATION}/complementoscvui/services/data/facadeServiceCompCompraService`

const json = (value: unknown): FakeReply => ({ body: JSON.stringify(value), encoding: 'utf8' })
const app = (name: string, host = CERTIFICATION): FakeRoute => ({
  url: `${host}/${name}/`,
  reply: { headers: COOKIE, body: page('app') },
})
const api = (url: string, reply: FakeRoute['reply']): FakeRoute => ({ url, method: 'POST', reply })
const posts = (harness: PortalHarness): readonly RecordedRequest[] =>
  harness.fake.requests.filter((request) => request.method === 'POST')
const sent = (request: RecordedRequest): { metaData: Record<string, unknown>; data: Record<string, unknown> } =>
  JSON.parse(request.text)

const options = { randomId: () => 'tx-1' }
const SUMMARY = (...rows: readonly Record<string, unknown>[]): FakeReply =>
  json({ data: { resumenDte: rows, datosAsync: null }, metaData: {}, respEstado: { codRespuesta: 0 } })
const DETAILS = (...rows: readonly Record<string, unknown>[]): FakeReply => json({ dataResp: { detalles: rows } })

describe('listPeriodDocuments', () => {
  const routes = (rows: readonly Record<string, unknown>[], details: FakeRoute['reply'] = DETAILS({ folio: 7 })) => [
    app('consemitidosinternetui'),
    api(`${DOCUMENTS_API}/getResumen`, SUMMARY(...rows)),
    api(`${DOCUMENTS_API}/getDetalleEmitidos3334`, details),
    api(`${DOCUMENTS_API}/getDetalleRecibidos`, details),
  ]

  test('visits the app, and posts the envelope with the token as the conversation', async () => {
    const harness = await signedIn(routes([{ tipoDoc: 33, tipoDocDesc: 'Factura' }]), options)
    const result = await listPeriodDocuments(harness.portal, { period: '2026-10' })
    expect(harness.urls()[0]).toBe(`${CERTIFICATION}/consemitidosinternetui/`)
    const [summary, detail] = posts(harness)
    expect(sent(summary)).toEqual({
      metaData: {
        namespace: `${RCV_SERVICES.documents.namespace}/getResumen`,
        conversationId: TOKEN,
        transactionId: 'tx-1',
        page: null,
      },
      data: { periodo: '2026-10', rutContribuyente: '76543210', dvContribuyente: '3', operacion: 1 },
    })
    expect(summary.headers.referer).toBe(`${CERTIFICATION}/consemitidosinternetui/`)
    expect(detail.url).toBe(`${DOCUMENTS_API}/getDetalleEmitidos3334`)
    expect(sent(detail).data).toEqual({
      tipoDoc: '33',
      rut: '76543210',
      dv: '3',
      periodo: '2026-10',
      operacion: 1,
      derrCodigo: '33',
      refNCD: '0',
    })
    expect(result.documents).toMatchObject([{ type: 33, typeDescription: 'Factura', folio: 7 }])
    expect(result.summary).toHaveLength(1)
  })

  test('an issued 61 is asked through getDetalleRecibidos, with refNCD 0', async () => {
    const harness = await signedIn(routes([{ tipoDoc: 61, refNCD: '1' }]), options)
    await listPeriodDocuments(harness.portal, { period: '2026-10', direction: 'issued' })
    const [, detail] = posts(harness)
    expect(detail.url).toBe(`${DOCUMENTS_API}/getDetalleRecibidos`)
    expect(sent(detail).data).toMatchObject({ tipoDoc: '61', operacion: 1, refNCD: '0' })
  })

  test('a received 33 is asked through getDetalleRecibidos too, with operation 2', async () => {
    const harness = await signedIn(routes([{ tipoDoc: 34 }]), options)
    await listPeriodDocuments(harness.portal, { period: '2026-10', direction: 'received' })
    const [summary, detail] = posts(harness)
    expect(sent(summary).data.operacion).toBe(2)
    expect(detail.url).toBe(`${DOCUMENTS_API}/getDetalleRecibidos`)
  })

  test('one detail per row, all of them flattened in the order of the summary', async () => {
    const replies: Readonly<Record<string, FakeReply>> = {
      '33': DETAILS({ folio: 1 }, { folio: 2 }),
      '61': DETAILS({ folio: 3 }),
    }
    const harness = await signedIn(
      routes([{ tipoDoc: 33 }, { tipoDoc: 61 }], (request) => replies[sent(request).data.tipoDoc as string]),
      options,
    )
    const { documents } = await listPeriodDocuments(harness.portal, { period: '2026-10' })
    expect(documents.map((document) => [document.type, document.folio])).toEqual([
      [33, 1],
      [33, 2],
      [61, 3],
    ])
  })

  test('an empty summary, as measured, makes no more requests', async () => {
    const harness = await signedIn(routes([]), options)
    await expect(listPeriodDocuments(harness.portal, { period: '2026-10' })).resolves.toEqual({
      summary: [],
      documents: [],
    })
    expect(posts(harness)).toHaveLength(1)
  })

  test('a 99 of the SII reads as an empty month: response codes are not looked at', async () => {
    const harness = await signedIn(
      [
        app('consemitidosinternetui'),
        api(
          `${DOCUMENTS_API}/getResumen`,
          json({ data: null, respEstado: { codRespuesta: 99, msgeRespuesta: 'Usuario no autorizado' } }),
        ),
      ],
      options,
    )
    await expect(listPeriodDocuments(harness.portal, { period: '2026-10' })).resolves.toEqual({
      summary: [],
      documents: [],
    })
  })

  test('production goes to its own host', async () => {
    const harness = await signedIn(
      [
        app('consemitidosinternetui', PRODUCTION),
        api(`${PRODUCTION}/consemitidosinternetui/services/data/facadeService/getResumen`, SUMMARY()),
      ],
      { ...options, environment: 'production' },
    )
    await listPeriodDocuments(harness.portal, { period: '2026-10' })
    expect(harness.urls()[0]).toBe(`${PRODUCTION}/consemitidosinternetui/`)
  })

  test('the transaction id is a UUID unless injected', async () => {
    const harness = await signedIn(routes([]))
    await listPeriodDocuments(harness.portal, { period: '2026-10' })
    expect(sent(posts(harness)[0]).metaData.transactionId).toMatch(/^[0-9a-f-]{36}$/)
  })

  test('the company of the call wins over the one of the client', async () => {
    const harness = await signedIn(routes([]), options)
    await listPeriodDocuments(harness.portal, { period: '2026-10', companyRut: RECEIVER_RUT })
    expect(sent(posts(harness)[0]).data).toMatchObject({ rutContribuyente: '12345678', dvContribuyente: '5' })
  })

  test.each([
    ['a period that is not one', { period: '202610' }, 'INVALID_DATE', 'period'],
    ['a direction that is not one', { period: '2026-10', direction: 'sideways' }, 'INVALID_OPTION', 'direction'],
  ])('%s is refused before any request', async (_name, input, code, field) => {
    const harness = await signedIn(routes([]), options)
    const error = await failure(listPeriodDocuments(harness.portal, input as { period: string }))
    expect(error).toMatchObject({ code, details: { field } })
    expect(harness.fake.requests).toHaveLength(0)
  })

  test('no company at all is a missing field', async () => {
    const harness = await signedIn(routes([]), { ...options, companyRut: undefined })
    const error = await failure(listPeriodDocuments(harness.portal, { period: '2026-10' }))
    expect(error).toMatchObject({ code: 'MISSING_FIELD', details: { field: 'companyRut' } })
  })
})

describe('the session of a read', () => {
  const summaryRoute = (reply: FakeRoute['reply']) => api(`${DOCUMENTS_API}/getResumen`, reply)
  const entry = (cookies: Readonly<Record<string, string>> = COOKIE) => ({
    url: `${CERTIFICATION}/consemitidosinternetui/`,
    reply: { headers: cookies, body: page('app') },
  })

  test('CSESSIONID serves as the token when TOKEN is absent', async () => {
    const harness = await signedIn([entry({ 'Set-Cookie': 'CSESSIONID=otro-token; Path=/' }), summaryRoute(SUMMARY())])
    await listPeriodDocuments(harness.portal, { period: '2026-10' })
    expect(sent(posts(harness)[0]).metaData.conversationId).toBe('otro-token')
  })

  test('a token already in the jar is enough', async () => {
    const harness = portalWith([entry({}), summaryRoute(SUMMARY())])
    await seedSession(harness.portal, { ...SESSION_COOKIES, TOKEN: 'guardado' })
    await listPeriodDocuments(harness.portal, { period: '2026-10' })
    expect(sent(posts(harness)[0]).metaData.conversationId).toBe('guardado')
  })

  test('no token even with a fresh session is a page it cannot read', async () => {
    const harness = await signedIn([entry({})])
    const error = await failure(listPeriodDocuments(harness.portal, { period: '2026-10' }))
    expect(error).toMatchObject({ code: 'SII_PORTAL_UNEXPECTED_PAGE', details: { step: 'token' } })
    expect(posts(harness)).toHaveLength(0)
  })

  test('a cold session logs in on the way to the app, as measured', async () => {
    const appUrl = `${CERTIFICATION}/consemitidosinternetui/`
    const harness = portalWith([
      {
        url: appUrl,
        reply: [
          {
            status: 302,
            headers: { Location: `https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?${appUrl}` },
          },
          { headers: COOKIE, body: page('app') },
        ],
      },
      { url: 'https://zeusr.sii.cl/AUT2000/InicioAutenticacion/*', reply: { body: AUTH_PAGE } },
      {
        url: `${HERCULES}*`,
        method: 'POST',
        reply: { status: 302, headers: { Location: appUrl, 'Set-Cookie': 'NETSCAPE_LIVEWIRE.rut=12345678; Path=/' } },
      },
      summaryRoute(SUMMARY()),
    ])
    await listPeriodDocuments(harness.portal, { period: '2026-10' })
    expect(sent(posts(harness)[1]).metaData.conversationId).toBe(TOKEN)
  })

  test('an answer that is not JSON is repeated once with a fresh session, and its token stays out of the details', async () => {
    const cut = '{"metaData":{"conversationId":"token-de-prueba","page":null'
    const harness = await signedIn([entry(), summaryRoute({ body: cut })])
    const error = await failure(listPeriodDocuments(harness.portal, { period: '2026-10' }))
    expect(error).toMatchObject({ code: 'SII_PORTAL_UNEXPECTED_PAGE', details: { step: 'getResumen' } })
    expect(JSON.stringify(error.details)).not.toContain(TOKEN)
    expect(posts(harness)).toHaveLength(2)
  })

  test('the second try can succeed', async () => {
    const harness = await signedIn([entry(), summaryRoute([{ body: page('Intermedia') }, SUMMARY()])])
    await expect(listPeriodDocuments(harness.portal, { period: '2026-10' })).resolves.toEqual({
      summary: [],
      documents: [],
    })
  })

  test('one POST per call by default, also on a transient failure', async () => {
    const harness = await signedIn([entry(), summaryRoute([new DteError('TRANSPORT_FAILED', {}), SUMMARY()])], {
      retry: {},
    })
    const error = await failure(listPeriodDocuments(harness.portal, { period: '2026-10' }))
    expect(error.code).toBe('TRANSPORT_FAILED')
    expect(posts(harness)).toHaveLength(1)
  })

  test('a caller can opt into repeating the call', async () => {
    const harness = await signedIn([entry(), summaryRoute([new DteError('TRANSPORT_FAILED', {}), SUMMARY()])], {
      retry: {},
    })
    await expect(
      listPeriodDocuments(harness.portal, { period: '2026-10' }, { retry: { maxAttempts: 2 } }),
    ).resolves.toEqual({ summary: [], documents: [] })
    expect(posts(harness)).toHaveLength(2)
    expect(harness.sleeps).toEqual([2000])
  })

  test('the visit to the app keeps its retries', async () => {
    const harness = await signedIn(
      [
        {
          url: `${CERTIFICATION}/consemitidosinternetui/`,
          reply: [new DteError('TRANSPORT_FAILED', {}), { headers: COOKIE, body: page('app') }],
        },
        summaryRoute(SUMMARY()),
      ],
      { retry: {} },
    )
    await listPeriodDocuments(harness.portal, { period: '2026-10' })
    expect(harness.sleeps).toEqual([2000])
  })

  test('a capture never holds the token, in the request or in the echo of the answer', async () => {
    const memory = createMemoryCapture()
    const harness = await signedIn(
      [entry(), summaryRoute(json({ data: { resumenDte: [] }, metaData: { conversationId: TOKEN } }))],
      { capture: memory.capture },
    )
    await listPeriodDocuments(harness.portal, { period: '2026-10' })
    expect(JSON.stringify(memory.exchanges())).not.toContain(TOKEN)
    expect(memory.exchanges().map((exchange) => exchange.operation)).toContain('listPeriodDocuments.getResumen')
  })
})

describe('fetchRegisterSummary', () => {
  const routes = (reply: FakeRoute['reply']) => [app('consdcvinternetui'), api(`${REGISTER_API}/getResumen`, reply)]

  test('posts the period in digits, and defaults to the registered status', async () => {
    const harness = await signedIn(
      routes(json({ data: [{ rsmnTipoDocInteger: 33 }], dataCabecera: { dcvFctProp: 1 } })),
      options,
    )
    const result = await fetchRegisterSummary(harness.portal, { period: '2026-10', operation: 'purchase' })
    const [post] = posts(harness)
    expect(harness.urls()[0]).toBe(`${CERTIFICATION}/consdcvinternetui/`)
    expect(sent(post)).toEqual({
      metaData: {
        namespace: `${RCV_SERVICES.register.namespace}/getResumen`,
        conversationId: TOKEN,
        transactionId: 'tx-1',
        page: null,
      },
      data: {
        rutEmisor: '76543210',
        dvEmisor: '3',
        ptributario: '202610',
        estadoContab: 'REGISTRO',
        operacion: 'COMPRA',
        busquedaInicial: true,
      },
    })
    expect(post.headers.referer).toBe(`${CERTIFICATION}/consdcvinternetui/`)
    expect(result).toMatchObject({ rows: [{ type: 33 }], header: { proportionalityFactor: 1 } })
  })

  test.each([
    ['pending', 'PENDIENTE'],
    ['notIncluded', 'NO_INCLUIR'],
    ['claimed', 'RECLAMADO'],
  ] as const)('%s is %s', async (accountingStatus, code) => {
    const harness = await signedIn(routes(json({ data: null })), options)
    await fetchRegisterSummary(harness.portal, { period: '2026-10', operation: 'sale', accountingStatus })
    expect(sent(posts(harness)[0]).data).toMatchObject({ estadoContab: code, operacion: 'VENTA' })
  })

  test('as measured with no documents', async () => {
    const harness = await signedIn(
      routes(json({ data: null, dataCabecera: null, respEstado: { codRespuesta: 3 } })),
      options,
    )
    await expect(fetchRegisterSummary(harness.portal, { period: '2026-10', operation: 'purchase' })).resolves.toEqual({
      rows: [],
      header: null,
    })
  })

  test.each([
    ['operation', { period: '2026-10', operation: 'gift' }, 'INVALID_OPTION'],
    ['accountingStatus', { period: '2026-10', operation: 'sale', accountingStatus: 'lost' }, 'INVALID_OPTION'],
    ['period', { period: 'octubre', operation: 'sale' }, 'INVALID_DATE'],
  ])('a bad %s is refused before any request', async (field, input, code) => {
    const harness = await signedIn(routes(json({})), options)
    const error = await failure(fetchRegisterSummary(harness.portal, input as never))
    expect(error).toMatchObject({ code, details: { field } })
    expect(harness.fake.requests).toHaveLength(0)
  })
})

describe('complements', () => {
  const KEY = { type: 33, folio: 1234, period: '2026-10', counterpartyRut: RECEIVER_RUT }

  test('the catalogue is asked through the register app, with a fixed transaction and a page', async () => {
    const harness = await signedIn(
      [
        app('consdcvinternetui'),
        api(
          `${COMPLEMENTS_API}/obtieneTiposTransaccionCompra`,
          json({ data: [{ id: '2', descripcion: 'Supermercados', intercambiable: true }] }),
        ),
      ],
      options,
    )
    await expect(listPurchaseTypes(harness.portal)).resolves.toEqual([
      { id: '2', description: 'Supermercados', interchangeable: true },
    ])
    expect(harness.urls()[0]).toBe(`${CERTIFICATION}/consdcvinternetui/`)
    const [post] = posts(harness)
    expect(sent(post)).toEqual({
      metaData: {
        namespace: `${RCV_SERVICES.complements.namespace}/obtieneTiposTransaccionCompra`,
        conversationId: TOKEN,
        transactionId: '1',
        page: { pageSize: 1, pageIndex: 1 },
      },
      data: null,
    })
    expect(post.headers.referer).toBe(`${CERTIFICATION}/complementoscvui/`)
  })

  test('one purchase is asked by its key, with the fields in the order of the SII', async () => {
    const harness = await signedIn(
      [
        app('consdcvinternetui'),
        api(`${COMPLEMENTS_API}/obtieneDetalleDocumento`, json({ data: { det_nro_doc: 1234 } })),
      ],
      options,
    )
    await expect(fetchPurchaseDocument(harness.portal, KEY)).resolves.toMatchObject({ folio: 1234 })
    const data = sent(posts(harness)[0]).data
    expect(Object.entries(data)).toEqual([
      ['rut', '76543210'],
      ['dv', '3'],
      ['operacion', 'COMPRA'],
      ['tipoDocumento', '33'],
      ['numeroDocumento', '1234'],
      ['periodoTributario', '202610'],
      ['rutContraparte', '12345678'],
      ['dvContraparte', '5'],
    ])
  })

  test('no data is null', async () => {
    const harness = await signedIn(
      [app('consdcvinternetui'), api(`${COMPLEMENTS_API}/obtieneDetalleDocumento`, json({ data: null }))],
      options,
    )
    await expect(fetchPurchaseDocument(harness.portal, KEY)).resolves.toBeNull()
  })

  test.each([
    ['period', { ...KEY, period: '2026-13' }, 'INVALID_DATE'],
    ['counterpartyRut', { ...KEY, counterpartyRut: 'nadie' }, 'INVALID_RUT'],
  ])('a bad %s is refused before any request', async (field, key, code) => {
    const harness = await signedIn([], options)
    const error = await failure(fetchPurchaseDocument(harness.portal, key))
    expect(error).toMatchObject({ code, details: { field } })
    expect(harness.fake.requests).toHaveLength(0)
  })

  test('the company of the key wins over the one of the client', async () => {
    const harness = await signedIn(
      [app('consdcvinternetui'), api(`${COMPLEMENTS_API}/obtieneDetalleDocumento`, json({ data: null }))],
      { ...options, companyRut: RECEIVER_RUT },
    )
    await fetchPurchaseDocument(harness.portal, { ...KEY, companyRut: ISSUER_RUT })
    expect(sent(posts(harness)[0]).data).toMatchObject({ rut: '76543210', dv: '3' })
  })
})
