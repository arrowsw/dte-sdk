import { EXCHANGE_PORTAL } from '../../src/catalogs/certification'
import {
  confirmExchange,
  downloadExchangeSet,
  uploadExchangeAnswers,
  validateExchangeUser,
} from '../../src/portal/exchange'
import type { Logger } from '../../src/sii/logger'
import type { FakeReply, FakeRoute, RecordedRequest } from '../support/fake-sii'
import { FIXED_NOW, RECEIVER_RUT } from '../support/fixtures'
import { EMPTY_OK, EXCEPTION, okAnswer } from '../support/gwt-answers'
import { certificate, failure, HERCULES, portalWith, signedIn, type PortalHarness } from '../support/portal'
import { page } from '../support/portal-pages'

const BASE = EXCHANGE_PORTAL.base
const FACADE = `${BASE}facade`
const KNOWN = EXCHANGE_PORTAL.known
const SERVICE = EXCHANGE_PORTAL.serviceInterface
const BOUNDARY = `----WebKitFormBoundary${FIXED_NOW.getTime().toString(16)}`
const COMPANY_QUERY = '?re=76543210&dve=3'
const SET_XML = '<?xml version="1.0" encoding="ISO-8859-1"?><EnvioDTE><SetDTE ID="SetDoc"></SetDTE></EnvioDTE>'
const REFUSED_PAGE = '<html><head><title>ERROR</title></head><body>no vienen los parametros necesarios</body></html>'
const INTEGER = 'java.lang.Integer/3438268394'
const STRING = 'java.lang.String/2004016611'
const USER_TYPE = 'cl.sii.sdi.dim.pfe.to.UsuarioTo/3723336533'
const FOLLOW_UP_TYPE = 'cl.sii.sdi.dim.pfe.to.PostulacionSeguimientoTo/3921005560'
const ENTRY = 'https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoCertificado.html*'
const LOGIN_OK = {
  status: 302,
  headers: {
    Location: 'https://misiir.sii.cl/cgi_misii/siihome.cgi',
    'Set-Cookie': 'NETSCAPE_LIVEWIRE.rut=12345678; Domain=.sii.cl; Path=/, NETSCAPE_LIVEWIRE.dv=5; Path=/',
  },
}
const HOME = { url: 'https://misiir.sii.cl/cgi_misii/siihome.cgi', reply: { body: page('Mi SII') } }

const warmUp: readonly FakeRoute[] = [
  {
    method: 'GET',
    url: BASE,
    reply: { status: 302, headers: { location: '/pfeInternet/index.html', 'set-cookie': 'PFE=warm; Path=/' } },
  },
  {
    method: 'GET',
    url: `${BASE}index.html`,
    reply: { body: '<html>portal</html>', headers: { 'set-cookie': 'JSESSIONID=abc; Path=/pfeInternet' } },
  },
]
const NOCACHE = `${BASE}pfe.nocache.js`
const facade = (reply: FakeReply | ((request: RecordedRequest) => FakeReply)): FakeRoute => ({
  method: 'POST',
  url: FACADE,
  reply,
})
const download = (reply: FakeReply, query = COMPANY_QUERY): FakeRoute => ({
  method: 'POST',
  url: `${BASE}downloadFile${query}`,
  reply,
})
const upload = (index: number, ...replies: FakeReply[]): FakeRoute => ({
  method: 'POST',
  url: `${BASE}uploadFile${index}${COMPANY_QUERY}`,
  reply: replies,
})
const methodOf = (request: RecordedRequest): string => request.text.split('|')[6]
const facadePosts = (harness: PortalHarness): readonly RecordedRequest[] =>
  harness.fake.requests.filter((request) => request.url === FACADE)
const logger = (): Logger & { readonly lines: string[] } => {
  const lines: string[] = []
  const log = (message: string): void => {
    lines.push(message)
  }
  return { debug: log, info: log, warn: log, error: log, lines }
}
const ANSWERS = {
  reception: '<RespuestaDTE>1</RespuestaDTE>',
  receipts: '<EnvioRecibos/>',
  approval: '<RespuestaDTE>3</RespuestaDTE>',
}

describe('downloadExchangeSet', () => {
  test('warms the portal up through one redirect, merges its cookies and posts the empty multipart with the company in the query', async () => {
    const harness = await signedIn([...warmUp, download({ body: SET_XML })])
    await expect(downloadExchangeSet(harness.portal)).resolves.toEqual({ xml: SET_XML })
    expect(harness.urls()).toEqual([BASE, `${BASE}index.html`, `${BASE}downloadFile${COMPANY_QUERY}`])
    const [, redirected, request] = harness.fake.requests
    expect(redirected.headers['referer']).toBe(BASE)
    expect(request.headers['content-type']).toBe(`multipart/form-data; boundary=${BOUNDARY}`)
    expect(request.text).toBe(`--${BOUNDARY}--\r\n`)
    expect(request.headers['referer']).toBe(BASE)
    expect(request.headers['origin']).toBe('https://www4.sii.cl')
    expect(request.headers['cookie']).toContain('NETSCAPE_LIVEWIRE.rut=12345678')
    expect(request.headers['cookie']).toContain('PFE=warm')
    expect(request.headers['cookie']).toContain('JSESSIONID=abc')
  })

  test('logs a failed warm-up and goes on', async () => {
    const log = logger()
    const harness = await signedIn(
      [{ method: 'GET', url: BASE, reply: new Error('socket hang up') }, download({ body: SET_XML })],
      {
        logger: log,
      },
    )
    await expect(downloadExchangeSet(harness.portal)).resolves.toEqual({ xml: SET_XML })
    expect(log.lines).toContain('gwt portal warm-up failed')
    expect(harness.urls()).toHaveLength(2)
  })

  test('a page that is no set is unexpected, with the whole page in the details', async () => {
    const harness = await signedIn([
      { method: 'GET', url: BASE, reply: { body: '<html>portal</html>' } },
      download({ body: REFUSED_PAGE }),
    ])
    const error = await failure(downloadExchangeSet(harness.portal))
    expect(error.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect(error.details).toMatchObject({ step: 'downloadFile', httpStatus: 200, page: REFUSED_PAGE })
    expect(harness.urls()).toEqual([BASE, `${BASE}downloadFile${COMPANY_QUERY}`])
  })

  test('logs in first when the jar holds no session, and takes the company from the call', async () => {
    const harness = portalWith([
      { url: ENTRY, reply: { body: page('x'), headers: { 'Set-Cookie': 'TS01=abc; Path=/' } } },
      { url: `${HERCULES}*`, method: 'POST', reply: LOGIN_OK },
      HOME,
      ...warmUp,
      download({ body: SET_XML }, '?re=12345678&dve=5'),
    ])
    await expect(downloadExchangeSet(harness.portal, { companyRut: '12.345.678-5' })).resolves.toEqual({ xml: SET_XML })
    expect(harness.urls().slice(0, 3)).toEqual([
      `https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoCertificado.html?${HOME.url}`,
      `${HERCULES}?${HOME.url}`,
      HOME.url,
    ])
    const request = harness.fake.requests[harness.fake.requests.length - 1]
    expect(request.url).toBe(`${BASE}downloadFile?re=12345678&dve=5`)
    expect(request.headers['cookie']).toContain('NETSCAPE_LIVEWIRE.rut=12345678')
  })
})

describe('validateExchangeUser', () => {
  test('posts validarUsuario with the certificate holder and the company, over the known hashes and without looking for others', async () => {
    const harness = await signedIn([...warmUp, facade({ body: EMPTY_OK })])
    const result = await validateExchangeUser(harness.portal, { companyRut: RECEIVER_RUT })
    expect(result).toEqual({
      inExchange: true,
      state: null,
      completed: false,
      message: null,
      hashes: KNOWN,
      body: EMPTY_OK,
    })
    expect(harness.urls()).toEqual([BASE, `${BASE}index.html`, FACADE])
    const [request] = facadePosts(harness)
    expect(request.text).toBe(
      `7|0|8|${BASE}|${KNOWN.policy}|${SERVICE}|validarUsuario|${USER_TYPE}|3|5|${INTEGER}|1|2|3|4|1|5|5|0|0|0|0|6|7|8|12345678|0|0|0|0|0|8|76543210|`,
    )
    expect(request.headers).toMatchObject({
      'content-type': 'text/x-gwt-rpc; charset=UTF-8',
      'x-gwt-module-base': BASE,
      'x-gwt-permutation': KNOWN.permutation,
      origin: 'https://www4.sii.cl',
      referer: BASE,
    })
    expect(request.headers['cookie']).toContain('JSESSIONID=abc')
  })

  test('the table keeps both verifiers in their own slots when the holder and the company share one', async () => {
    const harness = await signedIn([...warmUp, facade({ body: EMPTY_OK })])
    await validateExchangeUser(harness.portal)
    const [request] = facadePosts(harness)
    expect(request.text).toBe(
      `7|0|8|${BASE}|${KNOWN.policy}|${SERVICE}|validarUsuario|${USER_TYPE}|3|3|${INTEGER}|1|2|3|4|1|5|5|0|0|0|0|6|7|8|76543210|0|0|0|0|0|8|76543210|`,
    )
  })

  test('reads the state the portal names when the company is not in the exchange, with the hashes given', async () => {
    const gwt = { permutation: 'A'.repeat(32), policy: 'B'.repeat(32) }
    const message = 'La empresa no esta en estado P06, estado: P90'
    const harness = await signedIn([...warmUp, facade({ body: okAnswer([0], [USER_TYPE, message]) })])
    const result = await validateExchangeUser(harness.portal, { gwt })
    expect(result).toMatchObject({ inExchange: false, state: 'P90', completed: true, message, hashes: gwt })
    const [request] = facadePosts(harness)
    expect(request.text).toContain(`|${gwt.policy}|`)
    expect(request.headers['x-gwt-permutation']).toBe(gwt.permutation)
    expect(harness.urls()).not.toContain(NOCACHE)
  })

  test('refuses a certificate that names no holder before touching the portal', async () => {
    const harness = await signedIn([], { certificate: { ...certificate, rut: null } })
    const error = await failure(validateExchangeUser(harness.portal))
    expect(error.code).toBe('MISSING_FIELD')
    expect(error.details).toEqual({ field: 'certificate.rut' })
    expect(harness.urls()).toEqual([])
  })
})

describe('uploadExchangeAnswers', () => {
  test('posts the three answers in the portal order, each as one text/xml part named uploadFormElement', async () => {
    const harness = await signedIn([
      ...warmUp,
      upload(1, { body: 'uno' }),
      upload(2, { body: 'dos' }),
      upload(3, { body: 'tres' }),
    ])
    const result = await uploadExchangeAnswers(harness.portal, ANSWERS)
    expect(result.answers).toEqual([
      { fileName: 'respuesta-recepcion-envio.xml', body: 'uno' },
      { fileName: 'envio-recibos.xml', body: 'dos' },
      { fileName: 'respuesta-aprobacion-comercial.xml', body: 'tres' },
    ])
    const uploads = harness.fake.requests.slice(2)
    expect(uploads.map((request) => request.url)).toEqual([1, 2, 3].map((n) => `${BASE}uploadFile${n}${COMPANY_QUERY}`))
    expect(uploads.map((request) => request.parts)).toEqual([
      [
        {
          name: 'uploadFormElement',
          fileName: 'respuesta-recepcion-envio.xml',
          contentType: 'text/xml',
          value: ANSWERS.reception,
        },
      ],
      [{ name: 'uploadFormElement', fileName: 'envio-recibos.xml', contentType: 'text/xml', value: ANSWERS.receipts }],
      [
        {
          name: 'uploadFormElement',
          fileName: 'respuesta-aprobacion-comercial.xml',
          contentType: 'text/xml',
          value: ANSWERS.approval,
        },
      ],
    ])
    for (const request of uploads) {
      expect(request.headers['content-type']).toBe(`multipart/form-data; boundary=${BOUNDARY}`)
      expect(request.headers['referer']).toBe(BASE)
      expect(request.headers['origin']).toBe('https://www4.sii.cl')
    }
  })

  test('a refused page at HTTP 200 stops the sequence and names the file', async () => {
    const harness = await signedIn([...warmUp, upload(1, { body: 'uno' }), upload(2, { body: REFUSED_PAGE })])
    const error = await failure(uploadExchangeAnswers(harness.portal, ANSWERS))
    expect(error.code).toBe('SII_PORTAL_REJECTED')
    expect(error.details).toMatchObject({
      rejection: 'exchangeUploadRefused',
      file: 'envio-recibos.xml',
      httpStatus: 200,
    })
    expect(error.details['portalMessage']).toContain('no vienen los parametros')
    expect(harness.urls()).toHaveLength(4)
  })

  test('never retries an upload, even when the client retries', async () => {
    const harness = await signedIn([...warmUp, upload(1, { status: 503, body: 'busy' }, { body: 'uno' })], {
      retry: { maxAttempts: 3, initialDelayMs: 1 },
    })
    const error = await failure(uploadExchangeAnswers(harness.portal, ANSWERS))
    expect(error.code).toBe('SII_HTTP_ERROR')
    expect(error.details['httpStatus']).toBe(503)
    expect(harness.urls()).toHaveLength(3)
    expect(harness.sleeps).toEqual([])
  })
})

describe('confirmExchange', () => {
  const confirming = (failing?: number) =>
    facade((request) => {
      if (methodOf(request) === 'validarSetContriPostSeguimiento') return { body: okAnswer([1], ['validado']) }
      return { body: request.text.includes(`|${failing}|`) ? EXCEPTION : EMPTY_OK }
    })

  test('validates the set, then confirms the follow-up ids 40, 41 and 43 in order', async () => {
    const harness = await signedIn([...warmUp, confirming()])
    const result = await confirmExchange(harness.portal)
    expect(result).toEqual({
      validation: okAnswer([1], ['validado']),
      confirmations: [40, 41, 43].map((id) => ({ id, body: EMPTY_OK })),
    })
    const posts = facadePosts(harness)
    expect(posts.map((request) => request.text)).toEqual([
      `7|0|7|${BASE}|${KNOWN.policy}|${SERVICE}|validarSetContriPostSeguimiento|${INTEGER}|${STRING}|3|1|2|3|4|2|5|6|5|76543210|7|`,
      ...[40, 41, 43].map(
        (id) =>
          `7|0|7|${BASE}|${KNOWN.policy}|${SERVICE}|updatePostulacionSeguimiento|${FOLLOW_UP_TYPE}|${INTEGER}|3|1|2|3|4|1|5|5|6|${id}|0|0|0|0|7|6|76543210|`,
      ),
    ])
    expect(posts.every((request) => request.headers['x-gwt-permutation'] === KNOWN.permutation)).toBe(true)
    expect(harness.urls()).not.toContain(NOCACHE)
  })

  test('a confirmation without //OK is unexpected, named by its id, and stops the sequence', async () => {
    const harness = await signedIn([...warmUp, confirming(41)])
    const error = await failure(confirmExchange(harness.portal, { gwt: KNOWN }))
    expect(error.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect(error.details['step']).toBe('updatePostulacionSeguimiento.41')
    expect(facadePosts(harness).map(methodOf)).toEqual([
      'validarSetContriPostSeguimiento',
      'updatePostulacionSeguimiento',
      'updatePostulacionSeguimiento',
    ])
  })

  test('never retries a confirmation call, even when the client retries', async () => {
    const harness = await signedIn([...warmUp, facade({ status: 503, body: 'busy' })], {
      retry: { maxAttempts: 3, initialDelayMs: 1 },
    })
    const error = await failure(confirmExchange(harness.portal))
    expect(error.code).toBe('SII_HTTP_ERROR')
    expect(facadePosts(harness)).toHaveLength(1)
    expect(harness.sleeps).toEqual([])
  })
})
