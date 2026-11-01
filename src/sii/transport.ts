import { DteError, errorMessage, isDteError } from '../errors'
import { decodeLatin1 } from '../text/latin1'

/**
 * EN: HTTP methods the SII services use.
 * ES: Métodos HTTP que usan los servicios del SII.
 */
export type HttpMethod = 'GET' | 'POST'

/**
 * EN: One HTTP request as the client hands it to the transport: bytes, never text.
 * ES: Una petición HTTP tal como el cliente la entrega al transporte: bytes, nunca texto.
 */
export type HttpRequest = {
  readonly method: HttpMethod
  readonly url: string
  /** EN: Header names as the SII expects them (`User-Agent`, `Cookie`…). ES: Cabeceras tal como las espera el SII. */
  readonly headers: Readonly<Record<string, string>>
  /** EN: Body bytes (POST only). ES: Bytes del cuerpo (solo POST). */
  readonly body?: Uint8Array
  /** EN: Per-request timeout, ms. ES: Timeout de la petición, ms. */
  readonly timeoutMs: number
  /** EN: Caller cancellation. ES: Cancelación del llamador. */
  readonly signal?: AbortSignal
}

/**
 * EN: One HTTP response: status, lower-cased header names and body bytes. Any status is a response; only
 * network, TLS, timeout and abort failures are thrown.
 * ES: Una respuesta HTTP: estado, cabeceras en minúsculas y bytes del cuerpo. Cualquier estado es una respuesta; solo
 * las fallas de red, TLS, timeout y cancelación se lanzan.
 */
export type HttpResponse = {
  readonly status: number
  /** EN: Lower-cased names; repeated headers joined with `, `. ES: Nombres en minúsculas; cabeceras repetidas unidas con `, `. */
  readonly headers: Readonly<Record<string, string>>
  readonly body: Uint8Array
}

/**
 * EN: Transport port: `fetch` by default (`createFetchTransport`), Node `https` as an adapter
 * (`createNodeHttpsTransport`), or anything the consumer injects (tests use a route-based fake).
 * ES: Puerto de transporte: `fetch` por defecto (`createFetchTransport`), `https` de Node como adaptador
 * (`createNodeHttpsTransport`), o lo que inyecte el consumidor (los tests usan un falso por rutas).
 */
export type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>

/**
 * EN: Charset of a body: `latin1` for DTEWS SOAP and the `DTEUpload` CGI, `utf8` for the REST API and WSRECLAMO.
 * ES: Charset de un cuerpo: `latin1` para SOAP DTEWS y el CGI `DTEUpload`, `utf8` para la API REST y WSRECLAMO.
 */
export type BodyEncoding = 'latin1' | 'utf8'

/**
 * EN: Decodes response bytes with the charset of the channel; never guesses.
 * ES: Decodifica los bytes de una respuesta con el charset del canal; nunca adivina.
 */
export const decodeBody = (bytes: Uint8Array, encoding: BodyEncoding): string =>
  encoding === 'latin1' ? decodeLatin1(bytes) : new TextDecoder('utf-8').decode(bytes)

/**
 * EN: UTF-8 bytes of a text (REST and WSRECLAMO bodies).
 * ES: Bytes UTF-8 de un texto (cuerpos REST y WSRECLAMO).
 */
export const encodeUtf8 = (text: string): Uint8Array => new TextEncoder().encode(text)

/**
 * EN: An abort signal that fires on the timeout or when the caller's signal fires, and remembers which one it was.
 * ES: Un signal que se dispara al vencer el timeout o cuando se dispara el del llamador, y recuerda cuál fue.
 */
export type RequestSignal = {
  readonly signal: AbortSignal
  readonly timedOut: () => boolean
  readonly cleanup: () => void
}

/**
 * EN: Merges the timeout and the caller's signal (manual merge: `AbortSignal.any` needs Node 20.3).
 * ES: Combina el timeout y el signal del llamador (combinación manual: `AbortSignal.any` exige Node 20.3).
 */
export const createRequestSignal = (timeoutMs: number, signal?: AbortSignal): RequestSignal => {
  const controller = new AbortController()
  const state = { timedOut: false }
  const timer = setTimeout(() => {
    state.timedOut = true
    controller.abort()
  }, timeoutMs)
  const onAbort = (): void => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', onAbort, { once: true })
  return {
    signal: controller.signal,
    timedOut: () => state.timedOut,
    cleanup: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

const TLS_CODE = /^(ERR_TLS_|ERR_OSSL_|ERR_SSL_|CERT_|UNABLE_TO_|SELF_SIGNED_|DEPTH_ZERO_|HOSTNAME_MISMATCH)/

const errorCode = (error: unknown): string | null => {
  const direct = (error as { code?: unknown } | null)?.code
  if (typeof direct === 'string') return direct
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause?.code
  return typeof cause === 'string' ? cause : null
}

/**
 * EN: Classifies a failure thrown by `fetch` or `node:https` into `REQUEST_TIMEOUT`, `REQUEST_ABORTED`,
 * `TRANSPORT_TLS` or `TRANSPORT_FAILED`; a `DteError` passes through. `details.reason` is the OS/OpenSSL code when
 * there is one, so the operator sees `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` instead of a generic failure.
 * ES: Clasifica una falla lanzada por `fetch` o `node:https` en `REQUEST_TIMEOUT`, `REQUEST_ABORTED`, `TRANSPORT_TLS` o
 * `TRANSPORT_FAILED`; un `DteError` pasa tal cual. `details.reason` es el código del SO/OpenSSL cuando lo hay, así el
 * operador ve `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` en vez de una falla genérica.
 */
export const mapTransportError = (error: unknown, timedOut: boolean, aborted: boolean): DteError => {
  if (isDteError(error)) return error
  if (timedOut) return new DteError('REQUEST_TIMEOUT', { reason: errorMessage(error) })
  if (aborted) return new DteError('REQUEST_ABORTED')
  const code = errorCode(error)
  const cause = (error as { cause?: unknown } | null)?.cause
  const text = `${errorMessage(error)} ${cause === undefined ? '' : errorMessage(cause)}`
  // The text only decides when there is no code (runtimes without OpenSSL codes) or for EPROTO: a DNS failure on a host
  // whose name holds `ssl` or `tls` must stay a retryable network failure.
  const textDecides = code === null || code === 'EPROTO'
  const tls = (code !== null && TLS_CODE.test(code)) || (textDecides && /certificate|\btls\b|\bssl\b/i.test(text))
  return new DteError(tls ? 'TRANSPORT_TLS' : 'TRANSPORT_FAILED', { reason: code ?? errorMessage(error) })
}

/**
 * EN: The slice of `fetch` the transport uses, so consumers and tests can inject their own.
 * ES: La porción de `fetch` que usa el transporte, para que consumidores y tests inyecten la suya.
 */
export type FetchLike = (
  url: string,
  init: {
    readonly method: HttpMethod
    readonly headers: Record<string, string>
    readonly body?: Uint8Array<ArrayBuffer>
    readonly signal: AbortSignal
    readonly redirect: 'manual'
  },
) => Promise<{
  readonly status: number
  readonly headers: { forEach(callback: (value: string, key: string) => void): void }
  arrayBuffer(): Promise<ArrayBuffer>
}>

/**
 * EN: Default transport over `globalThis.fetch` (Node ≥ 20, Deno, Bun) or an injected `fetch`. Redirects are not
 * followed: the SII never redirects a well-formed call and following one would hide an error page.
 * ES: Transporte por defecto sobre `globalThis.fetch` (Node ≥ 20, Deno, Bun) o un `fetch` inyectado. No sigue
 * redirecciones: el SII nunca redirige una llamada bien formada y seguirla ocultaría una página de error.
 * @throws {DteError} EN: `TRANSPORT_UNAVAILABLE` when no `fetch` exists, then the codes of `mapTransportError`. ES: `TRANSPORT_UNAVAILABLE` si no hay `fetch`, luego los códigos de `mapTransportError`.
 */
export const createFetchTransport =
  (options: { readonly fetch?: FetchLike } = {}): HttpTransport =>
  async (request) => {
    const fetchFn = options.fetch ?? (globalThis as unknown as { fetch?: FetchLike }).fetch
    if (typeof fetchFn !== 'function')
      throw new DteError('TRANSPORT_UNAVAILABLE', { reason: 'globalThis.fetch is not defined' })
    const guard = createRequestSignal(request.timeoutMs, request.signal)
    try {
      const response = await fetchFn(request.url, {
        method: request.method,
        headers: { ...request.headers },
        body: request.body === undefined ? undefined : new Uint8Array(request.body),
        signal: guard.signal,
        redirect: 'manual',
      })
      // `fetch` reports each `Set-Cookie` on its own, so repeated names are joined here, not overwritten.
      const joined = new Map<string, string>()
      response.headers.forEach((value, key) => {
        const name = key.toLowerCase()
        const previous = joined.get(name)
        joined.set(name, previous === undefined ? value : `${previous}, ${value}`)
      })
      return {
        status: response.status,
        headers: Object.fromEntries(joined),
        body: new Uint8Array(await response.arrayBuffer()),
      }
    } catch (error) {
      throw mapTransportError(error, guard.timedOut(), request.signal?.aborted ?? false)
    } finally {
      guard.cleanup()
    }
  }
