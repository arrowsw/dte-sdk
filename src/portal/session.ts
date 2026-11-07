import {
  CERTIFICATE_ENTRY_URL,
  CERTIFICATE_LOGIN_URL,
  cgiUrl,
  PORTAL_LANDING_URL,
  PORTAL_LOGOUT_URL,
  type PortalRejection,
} from '../catalogs/portal'
import { DteError, errorMessage, isDteError } from '../errors'
import { splitSiiRut, type SiiRut } from '../model/rut'
import type { CallOverrides } from '../sii/client'
import { redactText } from '../sii/capture'
import { bodyExcerpt, httpError } from '../sii/operation'
import { mergeRetryPolicy, withRetry } from '../sii/retry'
import { send } from '../sii/send'
import { certificateFingerprint } from '../sii/token-cache'
import { decodeBody, encodeUtf8, type BodyEncoding, type HttpMethod, type HttpResponse } from '../sii/transport'
import type { PortalClient } from './client'
import {
  cookieHeader,
  hasSessionCookie,
  mergeSetCookie,
  parseCookies,
  serializeCookies,
  sessionRut,
  type CookieJar,
} from './cookies'
import {
  asksForAuthentication,
  closeSessionsOffer,
  isBlockedPage,
  looksLikeLoginRedirect,
  isCertificateNotEnabledPage,
  isRepresentationChoice,
  isRepresentationRefused,
  isSessionLimitPage,
  portalMessageOf,
  representationContinueLink,
  scriptRedirect,
} from './pages/auth'
import { hardRejection } from './pages/stamping'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'
const ACCEPT_LANGUAGE = 'es-419,es-US;q=0.9,es;q=0.8,en;q=0.7'
const RETRYABLE_STATUS: ReadonlySet<number> = new Set([502, 503, 504])
const REDIRECT_STATUS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308])
const MAX_REDIRECTS = 8
const ANNULMENT_ENTRY_PATH = '/cvc_cgi/dte/af_anular1'

/**
 * EN: One operation's hold on the session. `state` is the one piece of mutable data: it lives as long as the operation,
 * under the lock, and never reaches the caller.
 * ES: El control de una operación sobre la sesión. `state` es el único dato mutable: vive lo que dura la operación, bajo el
 * candado, y nunca llega a quien llama.
 */
export type PortalContext = {
  /** EN: The client. ES: El cliente. */
  readonly portal: PortalClient
  /** EN: Operation name for capture, logs and errors. ES: Nombre de la operación para captura, logs y errores. */
  readonly operation: string
  /** EN: Per-call overrides. ES: Ajustes de la llamada. */
  readonly overrides?: CallOverrides
  /** EN: Current cookies and whether this operation already logged in. ES: Cookies actuales y si esta operación ya inició sesión. */
  readonly state: { cookies: CookieJar; loggedIn: boolean }
  /** EN: When set, every request carries these headers and no others of the client's, its answers are read as UTF-8, every status comes back as a page (502, 503 and 504 too, and no page is read as the firewall's) and, once `sealed`, its `Set-Cookie` lines no longer change the jar. ES: Si está presente, cada petición lleva estas cabeceras y ninguna otra del cliente, sus respuestas se leen como UTF-8, todo estado vuelve como página (también 502, 503 y 504, y ninguna página se lee como la del firewall) y, una vez `sealed`, sus líneas `Set-Cookie` ya no cambian la bolsa. */
  readonly verbatim?: PortalVerbatim
}

/**
 * EN: How a request is written when it must match the field's exactly: the whole set of headers it starts from, and
 * whether the jar is closed to new cookies. Its answer goes back to the caller whatever its status or its wording: the
 * operation alone decides what a 503 or a refusal page means, as each call of the field does.
 * ES: Cómo se escribe una petición cuando debe calzar exactamente con la del campo: el conjunto completo de cabeceras
 * del que parte, y si la bolsa está cerrada a cookies nuevas. Su respuesta vuelve a quien llama sea cual sea su estado
 * o su texto: solo la operación decide qué significa un 503 o una página de rechazo, como hace cada llamada del campo.
 */
export type PortalVerbatim = {
  /** EN: The headers every request starts from; the request's own content type, referer, cookie and headers go over them. ES: Las cabeceras de las que parte cada petición; el tipo de contenido, el referer, la cookie y las cabeceras propias de la petición van encima. */
  readonly headers: Readonly<Record<string, string>>
  /** EN: True when responses no longer add cookies to the jar. ES: True cuando las respuestas ya no agregan cookies a la bolsa. */
  readonly sealed: boolean
}

/**
 * EN: One portal answer, decoded.
 * ES: Una respuesta del portal, decodificada.
 */
export type PortalPage = {
  /** EN: HTTP status. ES: Estado HTTP. */
  readonly status: number
  /** EN: Response headers. ES: Cabeceras de la respuesta. */
  readonly headers: Readonly<Record<string, string>>
  /** EN: Decoded body. ES: Cuerpo decodificado. */
  readonly html: string
  /** EN: URL this answer came from. ES: URL de la que vino esta respuesta. */
  readonly url: string
  /** EN: Last redirect followed to get here, or null. ES: Última redirección seguida para llegar aquí, o null. */
  readonly lastLocation: string | null
}

/**
 * EN: The form fields that name a company.
 * ES: Los campos de formulario que nombran a una empresa.
 */
export const companyFields = (rut: SiiRut): { readonly RUT_EMP: string; readonly DV_EMP: string } => {
  const { body, verifier } = splitSiiRut(rut)
  return { RUT_EMP: body, DV_EMP: verifier }
}

/**
 * EN: The form body the portal expects.
 * ES: El cuerpo de formulario que espera el portal.
 */
export const formEncode = (fields: Readonly<Record<string, string>>): string =>
  Object.entries(fields)
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join('&')

const UTF8 = /charset\s*=\s*["']?utf-?8/i
const META_UTF8 = /<meta\b[^>]*charset\s*=\s*["']?utf-?8/i

// The old portal is Latin-1. A charset in the header decides; without one, a page may still declare UTF-8 in a
// `<meta>`, as the login pages of herculesr do (measured on 2026-11-06), and its first bytes are read for it.
const portalEncoding = (response: Pick<HttpResponse, 'headers' | 'body'>): BodyEncoding => {
  const contentType = response.headers['content-type'] ?? ''
  const utf8 = /charset=/i.test(contentType)
    ? UTF8.test(contentType)
    : META_UTF8.test(decodeBody(response.body.subarray(0, 1024), 'latin1'))
  return utf8 ? 'utf8' : 'latin1'
}

const encodingOf =
  (context: PortalContext) =>
  (response: Pick<HttpResponse, 'headers' | 'body'>): BodyEncoding =>
    context.verbatim === undefined ? portalEncoding(response) : 'utf8'

// The jar is flat, so the URL is all that keeps the session on the SII: no cookie goes to another host or in clear text,
// and no other host writes into the jar.
const isSiiUrl = (url: string): boolean => {
  const { protocol, hostname } = new URL(url)
  return protocol === 'https:' && hostname.endsWith('.sii.cl')
}

const contextHeaders = (
  url: string,
  cookies: CookieJar,
  referer: string | undefined,
): Readonly<Record<string, string>> => ({
  ...(referer === undefined ? {} : { Referer: referer }),
  ...(Object.keys(cookies).length === 0 || !isSiiUrl(url) ? {} : { Cookie: cookieHeader(cookies) }),
})

const requestHeaders = (
  url: string,
  method: HttpMethod,
  cookies: CookieJar,
  referer: string | undefined,
): Readonly<Record<string, string>> => ({
  'User-Agent': USER_AGENT,
  Accept: ACCEPT,
  'Accept-Language': ACCEPT_LANGUAGE,
  'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  ...(method === 'POST'
    ? {
        'Cache-Control': 'max-age=0',
        Origin: new URL(url).origin,
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    : {}),
  ...contextHeaders(url, cookies, referer),
})

// The headers of a JSON service: these got good answers in both environments.
const jsonHeaders = (
  url: string,
  cookies: CookieJar,
  referer: string | undefined,
): Readonly<Record<string, string>> => ({
  'User-Agent': USER_AGENT,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': ACCEPT_LANGUAGE,
  'Content-Type': 'application/json',
  Origin: new URL(url).origin,
  ...contextHeaders(url, cookies, referer),
})

// The headers of a raw post (a multipart body, a GWT-RPC body): the browser's, with the given content type and
// whatever the caller adds.
const rawHeaders = (
  url: string,
  cookies: CookieJar,
  referer: string | undefined,
  contentType: string,
  extra: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> => ({
  'User-Agent': USER_AGENT,
  Accept: '*/*',
  'Accept-Language': ACCEPT_LANGUAGE,
  'Content-Type': contentType,
  Origin: new URL(url).origin,
  ...contextHeaders(url, cookies, referer),
  ...extra,
})

// A verbatim request is its base headers, then what the request itself names, then the cookies of the jar.
const verbatimHeaders = (
  base: Readonly<Record<string, string>>,
  url: string,
  cookies: CookieJar,
  options: PortalRequestOptions,
): Readonly<Record<string, string>> => ({
  ...base,
  ...(options.contentType === undefined ? {} : { 'Content-Type': options.contentType }),
  ...contextHeaders(url, cookies, options.referer),
  ...options.headers,
})

/**
 * EN: What a request may carry: a form, a JSON value, or raw bytes with their content type, plus the referer and any
 * header the page expects.
 * ES: Lo que puede llevar una petición: un formulario, un valor JSON, o bytes crudos con su tipo de contenido, más el
 * referer y cualquier cabecera que la página espere.
 */
export type PortalRequestOptions = {
  readonly form?: Readonly<Record<string, string>>
  readonly json?: unknown
  readonly body?: Uint8Array
  readonly contentType?: string
  readonly referer?: string
  readonly headers?: Readonly<Record<string, string>>
}

// A document or a JSON answer may say anything: only a page can be the firewall's.
const isStructuredBody = (text: string): boolean => /^\s*(?:<\?xml|[{[])/.test(text)

/**
 * EN: The error for a page the code cannot interpret, with what the page said.
 * ES: El error para una página que el código no puede interpretar, con lo que dijo la página.
 */
export const unexpectedPage = (context: PortalContext, step: string, html: string): DteError =>
  new DteError('SII_PORTAL_UNEXPECTED_PAGE', {
    operation: context.operation,
    step,
    portalMessage: portalMessageOf(html),
    body: bodyExcerpt(html),
  })

/**
 * EN: The error for a page that is not the one a step needed: a page that asks to log in means the session expired, and
 * it is dropped; any other is a page the code cannot interpret.
 * ES: El error para una página que no es la que necesitaba un paso: una que pide ingresar significa que la sesión
 * venció, y se descarta; cualquier otra es una página que el código no puede interpretar.
 */
export const wrongPage = (context: PortalContext, step: string, html: string): DteError => {
  if (!asksForAuthentication(html) && !looksLikeLoginRedirect(html)) return unexpectedPage(context, step, html)
  forgetSession(context)
  return new DteError('SII_PORTAL_SESSION_EXPIRED', { operation: context.operation, step })
}

/**
 * EN: The error for a business refusal, with what the portal said.
 * ES: El error para un rechazo de negocio, con lo que dijo el portal.
 */
export const rejected = (
  context: PortalContext,
  rejection: PortalRejection,
  details: Readonly<Record<string, unknown>>,
): DteError => new DteError('SII_PORTAL_REJECTED', { rejection, operation: context.operation, ...details })

/**
 * EN: Throws the refusal a page states, if any: a refused listing must not read as an empty one.
 * ES: Lanza el rechazo que declara una página, si lo hay: un listado rechazado no debe leerse como uno vacío.
 */
export const assertNotRejected = (context: PortalContext, html: string): void => {
  const rejection = hardRejection(html)
  if (rejection !== null) throw rejected(context, rejection, { portalMessage: portalMessageOf(html) })
}

/**
 * EN: One request and no redirects: one `send` inside the retry loop. Cookies go into the jar; a block throws. Any other
 * status is a page, except 502, 503 and 504, which are repeated. A body that is a document or JSON is not read for the
 * firewall's words, although HTTP 403 still blocks. A `verbatim` context gets every answer back as a page instead: no
 * status throws and no block is looked for.
 * ES: Una petición sin redirecciones: un `send` dentro del ciclo de reintentos. Las cookies entran a la bolsa; un bloqueo
 * lanza. Cualquier otro estado es una página, salvo 502, 503 y 504, que se repiten. Un cuerpo que sea un documento o JSON
 * no se revisa en busca de las palabras del firewall, aunque un HTTP 403 igual bloquea. Un contexto `verbatim` recibe en
 * cambio toda respuesta como página: ningún estado lanza y no se busca ningún bloqueo.
 */
export const portalRequest = async (
  context: PortalContext,
  step: string,
  method: HttpMethod,
  url: string,
  options: PortalRequestOptions = {},
): Promise<PortalPage> => {
  const { portal, overrides, state, verbatim } = context
  const responseEncoding = encodingOf(context)
  const operation = `${context.operation}.${step}`
  const text = options.json === undefined ? options.form && formEncode(options.form) : JSON.stringify(options.json)
  const body = options.body ?? (text === undefined ? undefined : encodeUtf8(text))
  const headersOf = (): Readonly<Record<string, string>> => {
    if (verbatim !== undefined) return verbatimHeaders(verbatim.headers, url, state.cookies, options)
    if (options.body !== undefined)
      return rawHeaders(
        url,
        state.cookies,
        options.referer,
        options.contentType ?? 'application/octet-stream',
        options.headers ?? {},
      )
    if (options.json !== undefined) return { ...jsonHeaders(url, state.cookies, options.referer), ...options.headers }
    return { ...requestHeaders(url, method, state.cookies, options.referer), ...options.headers }
  }
  const response = await withRetry(
    mergeRetryPolicy(portal.retry, overrides?.retry),
    async (attempt) => {
      const answer = await send(portal, {
        operation,
        channel: 'portal',
        method,
        url,
        headers: headersOf(),
        body,
        timeoutMs: overrides?.timeoutMs ?? portal.timeoutMs,
        signal: overrides?.signal,
        attempt,
        requestEncoding: 'utf8',
        responseEncoding,
      })
      if (verbatim === undefined && RETRYABLE_STATUS.has(answer.status))
        throw httpError(answer, decodeBody(answer.body, responseEncoding(answer)), operation, 'portal', url)
      return answer
    },
    {
      sleep: portal.sleep,
      signal: overrides?.signal,
      onRetry: (error, attempt, delayMs) =>
        portal.logger.warn('sii portal retrying', { operation, attempt, delayMs, code: error.code }),
    },
  )
  if (isSiiUrl(url) && verbatim?.sealed !== true)
    state.cookies = mergeSetCookie(state.cookies, response.headers['set-cookie'])
  const html = decodeBody(response.body, responseEncoding(response))
  if (verbatim === undefined && isBlockedPage(response.status, isStructuredBody(html) ? '' : html))
    throw new DteError('SII_PORTAL_BLOCKED', {
      operation: context.operation,
      step,
      httpStatus: response.status,
      portalMessage: portalMessageOf(redactText(html)),
    })
  return { status: response.status, headers: response.headers, html, url, lastLocation: null }
}

const followRedirects = async (context: PortalContext, step: string, first: PortalPage): Promise<PortalPage> => {
  const hop = async (page: PortalPage, count: number): Promise<PortalPage> => {
    const location = page.headers['location']
    if (!REDIRECT_STATUS.has(page.status) || location === undefined || count >= MAX_REDIRECTS) return page
    const next = new URL(location, page.url).toString()
    return hop({ ...(await portalRequest(context, step, 'GET', next)), lastLocation: next }, count + 1)
  }
  return hop(first, 0)
}

/**
 * EN: A request plus the redirects it leads to.
 * ES: Una petición más las redirecciones a las que lleva.
 */
export const navigate = async (
  context: PortalContext,
  step: string,
  method: HttpMethod,
  url: string,
  options: PortalRequestOptions = {},
): Promise<PortalPage> => followRedirects(context, step, await portalRequest(context, step, method, url, options))

const sessionLimit = (context: PortalContext): DteError =>
  new DteError('SII_PORTAL_SESSION_LIMIT', { operation: context.operation })

const closePreviousSessions = async (context: PortalContext, step: string, page: PortalPage): Promise<boolean> => {
  if (!context.portal.closePreviousSessions) return false
  const offer = closeSessionsOffer(page.html)
  if (offer === null) return false
  const closing =
    offer.kind === 'form'
      ? portalRequest(context, `${step}.closeSessions`, 'POST', new URL(offer.action, page.url).toString(), {
          form: { ...offer.fields, ACEPTAR: 'Aceptar' },
        })
      : portalRequest(context, `${step}.closeSessions`, 'GET', new URL(offer.href, page.url).toString())
  return closing.then(
    () => true,
    (error: unknown) => {
      context.portal.logger.warn('sii portal could not close earlier sessions', { reason: errorMessage(error) })
      return false
    },
  )
}

// The limit is never repeated on its own: only after the SII itself closed the earlier sessions, and only once.
const settleSessionLimit = async (
  context: PortalContext,
  step: string,
  page: PortalPage,
  again: () => Promise<PortalPage>,
): Promise<PortalPage> => {
  if (!isSessionLimitPage(page.html)) return page
  if (!(await closePreviousSessions(context, step, page))) throw sessionLimit(context)
  const next = await again()
  if (isSessionLimitPage(next.html)) throw sessionLimit(context)
  return next
}

const login = async (context: PortalContext, referencia: string): Promise<PortalPage> => {
  const url = `${CERTIFICATE_LOGIN_URL}?${referencia}`
  const post = (): Promise<PortalPage> =>
    navigate(context, 'login', 'POST', url, { form: { referencia }, referer: url })
  context.state.loggedIn = true
  const page = await settleSessionLimit(context, 'login', await post(), post)
  if (isCertificateNotEnabledPage(page.html))
    throw new DteError('SII_PORTAL_CERT_NOT_ENABLED', {
      operation: context.operation,
      portalMessage: portalMessageOf(page.html),
    })
  if (!hasSessionCookie(context.state.cookies))
    throw new DteError('SII_PORTAL_LOGIN_FAILED', {
      operation: context.operation,
      portalMessage: portalMessageOf(page.html),
    })
  // A good login answers 200 with a script that goes on: no `Location`, so nothing has reached the target yet.
  const target = scriptRedirect(page.html)
  if (target === null || !isSiiUrl(target)) return page
  const goOn = (): Promise<PortalPage> => navigate(context, 'login.target', 'GET', target)
  return settleSessionLimit(context, 'login', await goOn(), goOn)
}

const referenciaOf = (location: string): string | null => {
  const query = new URL(location).search.slice(1)
  if (query === '') return null
  try {
    return decodeURIComponent(query)
  } catch {
    return query
  }
}

// Stale cookies end in the representation page, with no target to go back to: they are dropped and the session starts
// over, as an explicit login does. If the page comes back after that, the refusal is real and `ensurePage` says so.
const authenticateIfAsked = async (
  context: PortalContext,
  step: string,
  url: string,
  page: PortalPage,
): Promise<PortalPage> => {
  if (isRepresentationRefused(page.html) && !context.state.loggedIn) {
    forgetSession(context)
    await portalRequest(context, 'entry', 'GET', `${CERTIFICATE_ENTRY_URL}?${url}`)
    return login(context, url)
  }
  if (!asksForAuthentication(page.html) || isRepresentationChoice(page.html) || page.lastLocation === null) return page
  const referencia = referenciaOf(page.lastLocation)
  if (referencia === null) return page
  if (context.state.loggedIn) throw new DteError('SII_PORTAL_SESSION_EXPIRED', { operation: context.operation, step })
  return login(context, referencia)
}

const continueRepresentation = async (context: PortalContext, step: string, page: PortalPage): Promise<PortalPage> => {
  const link = representationContinueLink(page.html)
  return link === null ? page : navigate(context, step, 'GET', new URL(link, page.url).toString())
}

/**
 * EN: Reaches a CGI page: a fresh `GET` (the SII binds a session to it before accepting a `POST`), redirects, the session
 * limit, a login on demand when the portal asks for one, and the representation screen.
 * ES: Llega a una página CGI: un `GET` fresco (el SII le liga la sesión antes de aceptar un `POST`), redirecciones, el
 * límite de sesiones, un inicio de sesión a pedido cuando el portal lo solicita y la pantalla de representación.
 * @throws {DteError} EN: `SII_PORTAL_SESSION_LIMIT`, `SII_PORTAL_CERT_NOT_ENABLED`, `SII_PORTAL_LOGIN_FAILED`, `SII_PORTAL_SESSION_EXPIRED`, `SII_PORTAL_BLOCKED`, `SII_PORTAL_REJECTED`. ES: los mismos códigos.
 */
export const ensurePage = async (context: PortalContext, step: string, url: string): Promise<PortalPage> => {
  const visit = (): Promise<PortalPage> => navigate(context, step, 'GET', url)
  const reached = await settleSessionLimit(context, step, await visit(), visit)
  const authenticated = await authenticateIfAsked(context, step, url, reached)
  if (isRepresentationRefused(authenticated.html))
    throw rejected(context, 'optionNotAuthorized', { portalMessage: portalMessageOf(authenticated.html) })
  const settled = isRepresentationChoice(authenticated.html)
    ? await continueRepresentation(context, step, authenticated)
    : authenticated
  return settled.html.includes(ANNULMENT_ENTRY_PATH) ? visit() : settled
}

/**
 * EN: Submits a form to an action resolved against `base`, following redirects.
 * ES: Envía un formulario a una acción resuelta contra `base`, siguiendo redirecciones.
 */
export const submitForm = (
  context: PortalContext,
  step: string,
  action: string,
  base: string,
  fields: Readonly<Record<string, string>>,
  referer?: string,
): Promise<PortalPage> =>
  navigate(context, step, 'POST', new URL(action, base).toString(), {
    form: fields,
    ...(referer === undefined ? {} : { referer }),
  })

/**
 * EN: Throws away the session of this operation; the entry leaves the cache when the operation ends.
 * ES: Descarta la sesión de esta operación; la entrada sale de la caché cuando termina la operación.
 */
export const forgetSession = (context: PortalContext): void => {
  context.state.cookies = {}
  context.state.loggedIn = false
}

const cacheKey = (portal: PortalClient): string => `portal:${certificateFingerprint(portal.certificate)}`

const loadCookies = async (portal: PortalClient): Promise<CookieJar> => {
  try {
    const entry = await portal.sessionCache.get(cacheKey(portal))
    return entry === null || entry.expiresAt <= portal.now().getTime() ? {} : parseCookies(entry.token)
  } catch (error) {
    portal.logger.warn('sii portal session cache failed', { reason: errorMessage(error) })
    return {}
  }
}

const saveCookies = async (portal: PortalClient, cookies: CookieJar): Promise<void> => {
  try {
    if (hasSessionCookie(cookies))
      await portal.sessionCache.set(cacheKey(portal), {
        token: serializeCookies(cookies),
        expiresAt: portal.now().getTime() + portal.sessionTtlMs,
      })
    else await portal.sessionCache.delete(cacheKey(portal))
  } catch (error) {
    portal.logger.warn('sii portal session cache failed', { reason: errorMessage(error) })
  }
}

/**
 * EN: Runs one operation with the session: takes the lock of the certificate, loads the cookies, runs, and saves them
 * with a fresh expiry. Internal flows pass the context on, so they never re-enter the lock.
 * ES: Ejecuta una operación con la sesión: toma el candado del certificado, carga las cookies, ejecuta y las guarda con
 * una vigencia nueva. Los flujos internos pasan el contexto, así nunca vuelven a entrar al candado.
 */
export const withPortalSession = <T>(
  portal: PortalClient,
  operation: string,
  overrides: CallOverrides | undefined,
  run: (context: PortalContext) => Promise<T>,
): Promise<T> =>
  portal.lock(cacheKey(portal), async () => {
    const context: PortalContext = {
      portal,
      operation,
      ...(overrides === undefined ? {} : { overrides }),
      state: { cookies: await loadCookies(portal), loggedIn: false },
    }
    try {
      return await run(context)
    } finally {
      await saveCookies(portal, context.state.cookies)
    }
  })

/**
 * EN: Runs a read, and once more with a fresh session if the first try met an expired session or a page it cannot read:
 * a cached session can pass a form `GET` and still get an interstitial page.
 * ES: Ejecuta una lectura, y una vez más con una sesión nueva si el primer intento encontró una sesión vencida o una
 * página que no puede leer: una sesión en caché puede pasar el `GET` de un formulario y aun así recibir una página intermedia.
 */
export const withFreshSessionRetry = async <T>(context: PortalContext, read: () => Promise<T>): Promise<T> => {
  try {
    return await read()
  } catch (error) {
    if (
      !isDteError(error) ||
      (error.code !== 'SII_PORTAL_SESSION_EXPIRED' && error.code !== 'SII_PORTAL_UNEXPECTED_PAGE')
    )
      throw error
    context.portal.logger.warn('sii portal retrying with a fresh session', { operation: context.operation })
    forgetSession(context)
    return read()
  }
}

/**
 * EN: What `openPortalSession` learned.
 * ES: Lo que supo `openPortalSession`.
 */
export type PortalSessionInfo = {
  /** EN: RUT the session belongs to, when the cookies say. ES: `NETSCAPE_LIVEWIRE.rut` + `.dv` — RUT al que pertenece la sesión, si las cookies lo dicen. */
  readonly userRut: SiiRut | null
  /** EN: True when a cached session was still alive. ES: True si una sesión en caché seguía viva. */
  readonly reused: boolean
}

const cachedSessionAlive = async (context: PortalContext): Promise<boolean> => {
  if (!hasSessionCookie(context.state.cookies)) return false
  const page = await portalRequest(context, 'validate', 'GET', cgiUrl('certification', 'ad_empresa1')).catch(() => null)
  return page !== null && page.status === 200 && (page.html.includes('RUT_EMP') || page.html.includes('ad_empresa'))
}

/**
 * EN: Makes sure the jar holds a session, logging in through the portal landing when it does not. The GWT portals
 * never ask for a login themselves: a visitor without a session gets their pages all the same.
 * ES: Se asegura de que la bolsa tenga una sesión, iniciándola por la portada del portal cuando no la tiene. Los
 * portales GWT nunca piden iniciar sesión por sí mismos: un visitante sin sesión recibe sus páginas igual.
 * @throws {DteError} EN: `SII_PORTAL_CERT_NOT_ENABLED`, `SII_PORTAL_SESSION_LIMIT`, `SII_PORTAL_LOGIN_FAILED`, `SII_PORTAL_BLOCKED`, transport codes. ES: los mismos códigos.
 */
export const ensureSession = async (context: PortalContext): Promise<void> => {
  if (hasSessionCookie(context.state.cookies)) return
  await portalRequest(context, 'entry', 'GET', `${CERTIFICATE_ENTRY_URL}?${PORTAL_LANDING_URL}`)
  await login(context, PORTAL_LANDING_URL)
}

/**
 * EN: Makes sure the jar holds a session that is alive: a session it already holds is checked with a read of the
 * company page and dropped when the SII no longer answers for it, then `ensureSession` logs in when there is none. With
 * `checked` the session was already checked in this run and the company page is not read again.
 * ES: Se asegura de que la bolsa tenga una sesión viva: una sesión que ya tiene se comprueba con una lectura de la
 * página de empresa y se descarta cuando el SII ya no responde por ella; luego `ensureSession` inicia sesión si no hay.
 * Con `checked` la sesión ya se comprobó en esta corrida y no se vuelve a leer la página de empresa.
 * @throws {DteError} EN: the codes of `ensureSession`. ES: los códigos de `ensureSession`.
 */
export const ensureLiveSession = async (context: PortalContext, checked: boolean): Promise<void> => {
  if (!checked && hasSessionCookie(context.state.cookies) && !(await cachedSessionAlive(context)))
    forgetSession(context)
  await ensureSession(context)
}

/**
 * EN: Opens a session explicitly, reusing a cached one that is still alive. The other operations do not need this: they
 * log in on demand.
 * ES: Abre una sesión de forma explícita, reutilizando una en caché que siga viva. Las demás operaciones no lo necesitan:
 * inician sesión a pedido.
 * @param portal EN: the client. ES: el cliente.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: who the session belongs to and whether it was reused. ES: de quién es la sesión y si se reutilizó.
 * @throws {DteError} EN: `SII_PORTAL_CERT_NOT_ENABLED`, `SII_PORTAL_SESSION_LIMIT`, `SII_PORTAL_LOGIN_FAILED`, `SII_PORTAL_BLOCKED`, transport codes. ES: los mismos códigos.
 */
export const openPortalSession = (portal: PortalClient, overrides?: CallOverrides): Promise<PortalSessionInfo> =>
  withPortalSession(portal, 'openPortalSession', overrides, async (context) => {
    if (await cachedSessionAlive(context)) return { userRut: sessionRut(context.state.cookies), reused: true }
    forgetSession(context)
    await ensureSession(context)
    return { userRut: sessionRut(context.state.cookies), reused: false }
  })

/**
 * EN: Closes the session to give its slot back, and always removes the cached session. A failed logout is only logged: the
 * SII expires the session on its own anyway.
 * ES: Cierra la sesión para devolver su cupo y siempre borra la sesión en caché. Un cierre fallido solo se registra: de todos
 * modos el SII vence la sesión por su cuenta.
 * @param portal EN: the client. ES: el cliente.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 */
export const closePortalSession = (portal: PortalClient, overrides?: CallOverrides): Promise<void> =>
  withPortalSession(portal, 'closePortalSession', { ...overrides, retry: false }, async (context) => {
    if (hasSessionCookie(context.state.cookies)) {
      await portalRequest(context, 'logout', 'GET', PORTAL_LOGOUT_URL).catch((error: unknown) => {
        portal.logger.warn('sii portal logout failed', { reason: errorMessage(error) })
      })
    }
    forgetSession(context)
  })
