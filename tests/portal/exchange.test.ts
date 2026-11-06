import { EXCHANGE_PORTAL } from '../../src/catalogs/certification'
import {
  confirmExchange,
  downloadExchangeSet,
  uploadExchangeAnswers,
  validateExchangeUser,
  withExchangeStage,
} from '../../src/portal/exchange'
import { createMemoryCapture } from '../../src/sii/capture'
import type { Logger } from '../../src/sii/logger'
import type { FakeReply, FakeRoute, RecordedRequest } from '../support/fake-sii'
import { FIXED_NOW, RECEIVER_RUT } from '../support/fixtures'
import { SESSION_CHECK_URL, sessionCheckRoute as alive } from '../support/exchange-fixtures'
import { EMPTY_OK, EXCEPTION, okAnswer } from '../support/gwt-answers'
import {
  certificate,
  failure,
  HERCULES,
  portalWith,
  SESSION_COOKIES,
  SESSION_KEY,
  signedIn,
  type PortalHarness,
} from '../support/portal'
import { page } from '../support/portal-pages'

const BASE = EXCHANGE_PORTAL.base
const FACADE = `${BASE}facade`
const KNOWN = EXCHANGE_PORTAL.known
const SERVICE = EXCHANGE_PORTAL.serviceInterface
const BOUNDARY = `----WebKitFormBoundary${FIXED_NOW.getTime().toString(16)}`
// The download's own limit: the browser prefix and the clock in decimal.
const DOWNLOAD_BOUNDARY = `----WebKitFormBoundary${FIXED_NOW.getTime()}`
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
  alive,
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
const LONGEST_TIMEOUT_MS = 2147483647
const BROWSER_LINE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const ACCEPT_LIST = 'text/html,application/xhtml+xml,*/*;q=0.8'
const names = (request: RecordedRequest): readonly string[] => Object.keys(request.headers).sort()
const BASE_HEADERS = ['accept', 'connection', 'cookie', 'user-agent']
const sessionCookiesOf = async (harness: PortalHarness): Promise<unknown> => {
  const entry = await harness.portal.sessionCache.get(SESSION_KEY)
  return entry === null ? null : JSON.parse(entry.token)
}
const ANSWERS = {
  reception: '<RespuestaDTE>1</RespuestaDTE>',
  receipts: '<EnvioRecibos/>',
  approval: '<RespuestaDTE>3</RespuestaDTE>',
}

describe('downloadExchangeSet', () => {
  test('warms the portal up through one redirect and posts the empty multipart with the company in the query', async () => {
    const harness = await signedIn([...warmUp, download({ body: SET_XML })])
    await expect(downloadExchangeSet(harness.portal)).resolves.toEqual({ xml: SET_XML })
    expect(harness.urls()).toEqual([
      SESSION_CHECK_URL,
      BASE,
      `${BASE}index.html`,
      `${BASE}downloadFile${COMPANY_QUERY}`,
    ])
    const [, warming, redirected, request] = harness.fake.requests
    expect(request.text).toBe(`--${DOWNLOAD_BOUNDARY}--\r\n`)
    expect(request.headers['content-type']).toBe(`multipart/form-data; boundary=${DOWNLOAD_BOUNDARY}`)
    expect(request.headers['cookie']).toContain('NETSCAPE_LIVEWIRE.rut=12345678')
    expect(request.headers['cookie']).toContain('PFE=warm')
    expect(request.headers['cookie']).toContain('JSESSIONID=abc')
    // The warm-up and its redirect carry the portal's base headers and the cookies, no referer, no origin.
    for (const warm of [warming, redirected]) {
      expect(names(warm)).toEqual(BASE_HEADERS)
      expect(warm.headers).toMatchObject({ 'user-agent': BROWSER_LINE, accept: ACCEPT_LIST, connection: 'keep-alive' })
    }
    expect(redirected.headers['cookie']).toContain('PFE=warm')
    // The download adds only its content type, its referer and its origin (and the length the transport needs).
    expect(names(request)).toEqual([...BASE_HEADERS, 'content-length', 'content-type', 'origin', 'referer'].sort())
    expect(request.headers).toMatchObject({ referer: BASE, origin: 'https://www4.sii.cl', 'user-agent': BROWSER_LINE })
  })

  test('the cookies the warm-up brings last as long as the stage: the shared session keeps the session cookies only', async () => {
    const harness = await signedIn([...warmUp, download({ body: SET_XML })])
    await downloadExchangeSet(harness.portal)
    await expect(sessionCookiesOf(harness)).resolves.toEqual(SESSION_COOKIES)
  })

  test('waits as long as a timer allows, once, whatever the client retry policy; a caller timeout still wins', async () => {
    const busy = await signedIn([...warmUp, download({ status: 503, body: 'busy' })], {
      retry: { maxAttempts: 3, initialDelayMs: 1 },
    })
    // A 503 is one more page that is no set: the stage's requests come back whatever their status.
    const error = await failure(downloadExchangeSet(busy.portal))
    expect(error.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect(error.details).toMatchObject({ httpStatus: 503, page: 'busy' })
    expect(busy.fake.requests.filter((request) => request.url.includes('downloadFile'))).toHaveLength(1)
    expect(busy.sleeps).toEqual([])
    expect(busy.fake.requests.slice(1).map((request) => request.timeoutMs)).toEqual([
      LONGEST_TIMEOUT_MS,
      LONGEST_TIMEOUT_MS,
      LONGEST_TIMEOUT_MS,
    ])
    const short = await signedIn([...warmUp, download({ body: SET_XML })])
    await downloadExchangeSet(short.portal, {}, { timeoutMs: 5000 })
    expect(short.fake.requests.slice(1).map((request) => request.timeoutMs)).toEqual([5000, 5000, 5000])
  })

  test('reads the answer as UTF-8 whatever the portal says, so accents in the set survive', async () => {
    const set = SET_XML.replace('SetDoc', 'Cajón')
    const harness = await signedIn([...warmUp, download({ body: set, encoding: 'utf8' })])
    await expect(downloadExchangeSet(harness.portal)).resolves.toEqual({ xml: set })
  })

  test('a warm-up that answers an error is a warm-up all the same: its cookies stay for the stage', async () => {
    for (const status of [503, 403]) {
      const log = logger()
      const harness = await signedIn(
        [
          alive,
          { method: 'GET', url: BASE, reply: { status, body: 'busy', headers: { 'set-cookie': 'PFE=warm; Path=/' } } },
          download({ body: SET_XML }),
        ],
        { logger: log },
      )
      await expect(downloadExchangeSet(harness.portal)).resolves.toEqual({ xml: SET_XML })
      expect(harness.fake.requests[2].headers['cookie']).toContain('PFE=warm')
      expect(log.lines).not.toContain('gwt portal warm-up failed')
    }
  })

  test('a redirect without a place to go is not followed', async () => {
    const harness = await signedIn([
      alive,
      { method: 'GET', url: BASE, reply: { status: 302, headers: { location: '' } } },
      download({ body: SET_XML }),
    ])
    await downloadExchangeSet(harness.portal)
    expect(harness.urls()).toEqual([SESSION_CHECK_URL, BASE, `${BASE}downloadFile${COMPANY_QUERY}`])
  })

  test('logs a failed warm-up and goes on', async () => {
    const log = logger()
    const harness = await signedIn(
      [alive, { method: 'GET', url: BASE, reply: new Error('socket hang up') }, download({ body: SET_XML })],
      {
        logger: log,
      },
    )
    await expect(downloadExchangeSet(harness.portal)).resolves.toEqual({ xml: SET_XML })
    expect(log.lines).toContain('gwt portal warm-up failed')
    expect(harness.urls()).toHaveLength(3)
  })

  test('a page that is no set is unexpected, with the whole page in the details', async () => {
    const harness = await signedIn([
      alive,
      { method: 'GET', url: BASE, reply: { body: '<html>portal</html>' } },
      download({ body: REFUSED_PAGE }),
    ])
    const error = await failure(downloadExchangeSet(harness.portal))
    expect(error.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect(error.details).toMatchObject({ step: 'downloadFile', httpStatus: 200, page: REFUSED_PAGE })
    expect(harness.urls()).toEqual([SESSION_CHECK_URL, BASE, `${BASE}downloadFile${COMPANY_QUERY}`])
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
    expect(harness.urls()).not.toContain(SESSION_CHECK_URL)
  })

  test('a saved session is checked against the company page before the portal is entered, and kept when it is alive', async () => {
    const harness = await signedIn([...warmUp, download({ body: SET_XML })])
    await downloadExchangeSet(harness.portal)
    expect(harness.urls()[0]).toBe(SESSION_CHECK_URL)
    expect(harness.urls().filter((url) => url === SESSION_CHECK_URL)).toHaveLength(1)
    expect(harness.urls().some((url) => url.includes('zeusr'))).toBe(false)
  })

  test('a saved session the SII no longer answers for is dropped and the login starts again', async () => {
    const harness = await signedIn([
      {
        method: 'GET',
        url: SESSION_CHECK_URL,
        reply: { status: 302, headers: { location: 'https://zeusr.sii.cl/login' } },
      },
      { url: ENTRY, reply: { body: page('x') } },
      { url: `${HERCULES}*`, method: 'POST', reply: LOGIN_OK },
      HOME,
      ...warmUp.slice(1),
      download({ body: SET_XML }),
    ])
    await expect(downloadExchangeSet(harness.portal)).resolves.toEqual({ xml: SET_XML })
    expect(harness.urls().slice(0, 4)).toEqual([
      SESSION_CHECK_URL,
      `https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoCertificado.html?${HOME.url}`,
      `${HERCULES}?${HOME.url}`,
      HOME.url,
    ])
    const request = harness.fake.requests[harness.fake.requests.length - 1]
    expect(request.headers['cookie']).not.toContain('TS01ab')
    expect(request.headers['cookie']).toContain('NETSCAPE_LIVEWIRE.dv=5')
  })

  test('a check that fails counts as a dead session too', async () => {
    const harness = await signedIn([
      { method: 'GET', url: SESSION_CHECK_URL, reply: new Error('socket hang up') },
      { url: ENTRY, reply: { body: page('x') } },
      { url: `${HERCULES}*`, method: 'POST', reply: LOGIN_OK },
      HOME,
      ...warmUp.slice(1),
      download({ body: SET_XML }),
    ])
    await expect(downloadExchangeSet(harness.portal)).resolves.toEqual({ xml: SET_XML })
    expect(harness.urls()[1]).toContain('zeusr.sii.cl')
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
    expect(harness.urls()).toEqual([SESSION_CHECK_URL, BASE, `${BASE}index.html`, FACADE])
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
      'user-agent': BROWSER_LINE,
      accept: ACCEPT_LIST,
      connection: 'keep-alive',
    })
    expect(request.headers['cookie']).toContain('JSESSIONID=abc')
    // Nothing else of the client's goes along with the field's headers.
    expect(names(request)).toEqual(
      [
        ...BASE_HEADERS,
        'content-length',
        'content-type',
        'x-gwt-module-base',
        'x-gwt-permutation',
        'origin',
        'referer',
      ].sort(),
    )
  })

  test('is sent once, with the longest timeout, even when the client retries, and its answer is read whatever its status', async () => {
    const harness = await signedIn([...warmUp, facade({ status: 503, body: 'busy' })], {
      retry: { maxAttempts: 3, initialDelayMs: 1 },
    })
    // The field never looks at the status of this answer: one without the portal's sentence reads as "in the exchange".
    await expect(validateExchangeUser(harness.portal)).resolves.toMatchObject({
      inExchange: true,
      state: null,
      message: null,
      body: 'busy',
    })
    expect(facadePosts(harness)).toHaveLength(1)
    expect(facadePosts(harness)[0].timeoutMs).toBe(LONGEST_TIMEOUT_MS)
    expect(harness.sleeps).toEqual([])
  })

  test('a page the client would take for the firewall is the call own to read, as any other', async () => {
    const refusal = '<html><body>acceso restringido</body></html>'
    const harness = await signedIn([...warmUp, facade({ status: 403, body: refusal })])
    await expect(validateExchangeUser(harness.portal)).resolves.toMatchObject({ inExchange: true, body: refusal })
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
    const uploads = harness.fake.requests.slice(3)
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
      expect(names(request)).toEqual([...BASE_HEADERS, 'content-length', 'content-type', 'origin', 'referer'].sort())
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
    expect(harness.urls()).toHaveLength(5)
  })

  test('never retries an upload, even when the client retries', async () => {
    const harness = await signedIn([...warmUp, upload(1, { status: 503, body: 'busy' }, { body: 'uno' })], {
      retry: { maxAttempts: 3, initialDelayMs: 1 },
    })
    const error = await failure(uploadExchangeAnswers(harness.portal, ANSWERS))
    expect(error.code).toBe('SII_PORTAL_REJECTED')
    expect(error.details).toMatchObject({ rejection: 'exchangeUploadRefused', httpStatus: 503 })
    expect(harness.urls()).toHaveLength(4)
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
    // The set validation is not judged; the first confirmation without `//OK` is what stops the sequence.
    const error = await failure(confirmExchange(harness.portal))
    expect(error.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect(error.details['step']).toBe('updatePostulacionSeguimiento.40')
    expect(facadePosts(harness)).toHaveLength(2)
    expect(harness.sleeps).toEqual([])
  })

  test('the set validation is not judged whatever its status: the three confirmations still go', async () => {
    const harness = await signedIn([
      ...warmUp,
      facade((request) =>
        methodOf(request) === 'validarSetContriPostSeguimiento' ? { status: 503, body: 'busy' } : { body: EMPTY_OK },
      ),
    ])
    await expect(confirmExchange(harness.portal)).resolves.toEqual({
      validation: 'busy',
      confirmations: [40, 41, 43].map((id) => ({ id, body: EMPTY_OK })),
    })
  })
})

describe('withExchangeStage', () => {
  const routes = (): FakeRoute[] => [
    ...warmUp,
    facade((request) =>
      methodOf(request) === 'validarUsuario'
        ? { body: EMPTY_OK, headers: { 'set-cookie': 'LATE=1; Path=/' } }
        : { body: EMPTY_OK },
    ),
    upload(1, { body: 'uno' }),
    upload(2, { body: 'dos' }),
    upload(3, { body: 'tres' }),
  ]

  test('the user validation, the uploads and the confirmations share one session check and one warm-up', async () => {
    const harness = await signedIn(routes())
    const result = await withExchangeStage(harness.portal, 'stage', undefined, async (stage) => {
      const validation = await validateExchangeUser(harness.portal, { stage })
      const uploaded = await uploadExchangeAnswers(harness.portal, { ...ANSWERS, stage })
      const confirmed = await confirmExchange(harness.portal, { stage })
      return { validation, uploaded, confirmed }
    })
    expect(result.validation.hashes).toEqual(KNOWN)
    expect(result.uploaded.answers).toHaveLength(3)
    expect(result.confirmed.confirmations).toHaveLength(3)
    expect(harness.urls()).toEqual([
      SESSION_CHECK_URL,
      BASE,
      `${BASE}index.html`,
      FACADE,
      `${BASE}uploadFile1${COMPANY_QUERY}`,
      `${BASE}uploadFile2${COMPANY_QUERY}`,
      `${BASE}uploadFile3${COMPANY_QUERY}`,
      FACADE,
      FACADE,
      FACADE,
      FACADE,
    ])
    expect(facadePosts(harness).map(methodOf)).toEqual([
      'validarUsuario',
      'validarSetContriPostSeguimiento',
      'updatePostulacionSeguimiento',
      'updatePostulacionSeguimiento',
      'updatePostulacionSeguimiento',
    ])
  })

  test('every request carries the cookies of the warm-up, and no cookie a later answer sets joins them', async () => {
    const harness = await signedIn(routes())
    await withExchangeStage(harness.portal, 'stage', undefined, async (stage) => {
      await validateExchangeUser(harness.portal, { stage })
      await confirmExchange(harness.portal, { stage })
    })
    const [, , , ...calls] = harness.fake.requests
    for (const request of calls) {
      expect(request.headers['cookie']).toContain('PFE=warm')
      expect(request.headers['cookie']).toContain('JSESSIONID=abc')
      expect(request.headers['cookie']).not.toContain('LATE')
    }
    await expect(sessionCookiesOf(harness)).resolves.toEqual(SESSION_COOKIES)
  })

  test('the calls inside the stage keep their own names for the captures', async () => {
    const memory = createMemoryCapture()
    const harness = await signedIn(routes(), { capture: memory.capture })
    await withExchangeStage(harness.portal, 'stage', undefined, (stage) =>
      validateExchangeUser(harness.portal, { stage }),
    )
    expect(memory.exchanges().map((exchange) => exchange.operation)).toContain('validateExchangeUser.validarUsuario')
  })
})
