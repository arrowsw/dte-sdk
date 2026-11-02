import { DteError, errorMessage, isDteError } from '../errors'
import { exchangeError, redactExchange, redactText, type HttpChannel, type HttpExchange } from './capture'
import type { SiiClient } from './client'
import { decodeBody, type BodyEncoding, type HttpMethod, type HttpRequest, type HttpResponse } from './transport'

/**
 * EN: What `send` needs from a client; the portal client fits it too.
 * ES: Lo que `send` necesita de un cliente; el cliente del portal también calza.
 */
export type SendClient = Pick<SiiClient, 'transport' | 'capture' | 'logger' | 'now'>

/**
 * EN: One HTTP attempt as an operation describes it to `send`.
 * ES: Un intento HTTP tal como una operación se lo describe a `send`.
 */
export type SendInput = {
  /** EN: Operation name for capture and logs. ES: Nombre de la operación para captura y logs. */
  readonly operation: string
  /** EN: Channel of the call; picks the default charsets. ES: Canal de la llamada; determina los charsets por defecto. */
  readonly channel: HttpChannel
  /** EN: HTTP method. ES: Método HTTP. */
  readonly method: HttpMethod
  /** EN: Absolute URL. ES: URL absoluta. */
  readonly url: string
  /** EN: Request headers; `Content-Length` is added when there is a body. ES: Cabeceras; se agrega `Content-Length` cuando hay cuerpo. */
  readonly headers: Readonly<Record<string, string>>
  /** EN: Request body bytes (POST only). ES: Bytes del cuerpo (solo POST). */
  readonly body?: Uint8Array
  /** EN: Timeout of this attempt, ms. ES: Timeout de este intento, ms. */
  readonly timeoutMs: number
  /** EN: Caller cancellation. ES: Cancelación del llamador. */
  readonly signal?: AbortSignal
  /** EN: Attempt number (1-based). ES: Número de intento (desde 1). */
  readonly attempt: number
  /** EN: Charset of the request body for the capture; defaults by channel. ES: Charset del cuerpo enviado para la captura; por defecto según el canal. */
  readonly requestEncoding?: BodyEncoding
  /** EN: Charset of the response body for the capture, fixed or read from the response; defaults by channel. ES: Charset del cuerpo recibido para la captura, fijo o leído de la respuesta; por defecto según el canal. */
  readonly responseEncoding?: BodyEncoding | ((response: HttpResponse) => BodyEncoding)
}

type Outcome =
  | { readonly response: HttpResponse; readonly error: null }
  | { readonly response: null; readonly error: unknown }

const defaultEncoding = (channel: HttpChannel): BodyEncoding => (channel === 'rest' ? 'utf8' : 'latin1')

const hasHeader = (headers: Readonly<Record<string, string>>, name: string): boolean =>
  Object.keys(headers).some((key) => key.toLowerCase() === name)

// The SII CGI dislikes chunked uploads: every body travels with an explicit Content-Length.
const responseEncodingOf = (input: SendInput, response: HttpResponse): BodyEncoding =>
  typeof input.responseEncoding === 'function'
    ? input.responseEncoding(response)
    : (input.responseEncoding ?? defaultEncoding(input.channel))

const withContentLength = (
  headers: Readonly<Record<string, string>>,
  body: Uint8Array | undefined,
): Readonly<Record<string, string>> =>
  body === undefined || hasHeader(headers, 'content-length')
    ? headers
    : { ...headers, 'Content-Length': String(body.length) }

// A transport failure reaches the caller with the context the error table promises: the operation that was running
// and, for a timeout, the timeout that elapsed. What the transport already set stays. The URL is left out on purpose: it
// can hold a RUT. A value that is not a `DteError` (a custom transport) goes through untouched.
const withContext = (error: unknown, input: SendInput): unknown =>
  isDteError(error)
    ? new DteError(error.code, {
        operation: input.operation,
        ...(error.code === 'REQUEST_TIMEOUT' ? { timeoutMs: input.timeoutMs } : {}),
        ...error.details,
      })
    : error

const toExchange = (
  input: SendInput,
  request: HttpRequest,
  outcome: Outcome,
  startedAt: Date,
  durationMs: number,
): HttpExchange => ({
  operation: input.operation,
  channel: input.channel,
  attempt: input.attempt,
  request: {
    method: request.method,
    url: request.url,
    headers: request.headers,
    body:
      request.body === undefined
        ? null
        : decodeBody(request.body, input.requestEncoding ?? defaultEncoding(input.channel)),
  },
  response:
    outcome.response === null
      ? null
      : {
          status: outcome.response.status,
          headers: outcome.response.headers,
          body: decodeBody(outcome.response.body, responseEncodingOf(input, outcome.response)),
        },
  error: outcome.response === null ? exchangeError(outcome.error) : null,
  startedAt: startedAt.toISOString(),
  durationMs,
})

/**
 * EN: Performs one HTTP exchange through the client's transport: adds `Content-Length` to bodies, times the call,
 * hands the redacted exchange to the `capture` port (a failing capture is logged, never thrown), logs a `debug` line
 * and returns the response or rethrows the transport error with the operation (and, for `REQUEST_TIMEOUT`, `timeoutMs`)
 * added to its details. Retries and token renewal live above this function.
 * ES: Realiza un intercambio HTTP por el transporte del cliente: agrega `Content-Length` a los cuerpos, cronometra la
 * llamada, entrega el intercambio tachado al puerto `capture` (una captura que falla se registra, nunca se lanza),
 * escribe una línea `debug` y devuelve la respuesta o relanza el error de transporte con la operación (y, en
 * `REQUEST_TIMEOUT`, `timeoutMs`) agregadas a sus detalles. Los reintentos y la renovación de token viven por encima
 * de esta función.
 */
export const send = async (sii: SendClient, input: SendInput): Promise<HttpResponse> => {
  const request: HttpRequest = {
    method: input.method,
    url: input.url,
    headers: withContentLength(input.headers, input.body),
    body: input.body,
    timeoutMs: input.timeoutMs,
    signal: input.signal,
  }
  const startedAt = sii.now()
  const outcome: Outcome = await sii.transport(request).then(
    (response) => ({ response, error: null }),
    (error: unknown) => ({ response: null, error }),
  )
  const durationMs = sii.now().getTime() - startedAt.getTime()
  // Decoding and redacting a whole envelope is only worth it when a capture port will read it.
  if (sii.capture !== null) {
    try {
      await sii.capture(redactExchange(toExchange(input, request, outcome, startedAt, durationMs)))
    } catch (error) {
      sii.logger.warn('HTTP capture failed', { operation: input.operation, reason: errorMessage(error) })
    }
  }
  if (outcome.response === null) {
    const failure = exchangeError(outcome.error)
    sii.logger.debug('sii http failed', {
      operation: input.operation,
      attempt: input.attempt,
      durationMs,
      error: { ...failure, reason: redactText(failure.reason) },
    })
    throw withContext(outcome.error, input)
  }
  sii.logger.debug('sii http', {
    operation: input.operation,
    attempt: input.attempt,
    status: outcome.response.status,
    durationMs,
  })
  return outcome.response
}
