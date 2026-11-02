import { errorMessage, isDteError } from '../errors'
import type { TokenChannel } from './token-cache'

/**
 * EN: Channel of a captured exchange: the two token channels of the web services, or the certificate portal.
 * ES: Canal de un intercambio capturado: los dos canales con token de los web services, o el portal con certificado.
 */
export type HttpChannel = TokenChannel | 'portal'

/**
 * EN: The request half of a captured exchange, bodies already decoded to text.
 * ES: La mitad "petición" de un intercambio capturado, con los cuerpos ya decodificados a texto.
 */
export type HttpExchangeRequest = {
  /** EN: HTTP method. ES: Método HTTP. */
  readonly method: string
  /** EN: Absolute URL, redacted. ES: URL absoluta, tachada. */
  readonly url: string
  /** EN: Request headers, redacted. ES: Cabeceras de la solicitud, tachadas. */
  readonly headers: Readonly<Record<string, string>>
  /** EN: Decoded body or null (GET). ES: Cuerpo decodificado o null (GET). */
  readonly body: string | null
}

/**
 * EN: The response half of a captured exchange.
 * ES: La mitad "respuesta" de un intercambio capturado.
 */
export type HttpExchangeResponse = {
  /** EN: HTTP status. ES: Estado HTTP. */
  readonly status: number
  /** EN: Response headers with lower-cased names, redacted. ES: Cabeceras de la respuesta con nombres en minúscula, tachadas. */
  readonly headers: Readonly<Record<string, string>>
  /** EN: Body decoded with the channel charset and redacted; null when there is none. ES: Cuerpo decodificado con el charset del canal y tachado; null si no hay. */
  readonly body: string | null
}

/**
 * EN: Why an exchange produced no response.
 * ES: Por qué un intercambio no produjo respuesta.
 */
export type HttpExchangeError = {
  /** EN: `DteError.code` or `UNKNOWN`. ES: `DteError.code` o `UNKNOWN`. */
  readonly code: string
  /** EN: OS or OpenSSL code, or the failure text, redacted. ES: Código del SO u OpenSSL, o el texto de la falla, tachado. */
  readonly reason: string
}

/**
 * EN: One HTTP attempt as handed to the `capture` port, already redacted.
 * ES: Un intento HTTP tal como se entrega al puerto `capture`, ya con los secretos tachados.
 */
export type HttpExchange = {
  /** EN: Operation name (`getSeed`, `uploadEnvelope`, `registerClaim`…). ES: Nombre de la operación. */
  readonly operation: string
  /** EN: Channel of the call. ES: Canal de la llamada. */
  readonly channel: HttpChannel
  /** EN: Attempt number within the retry loop (1-based). ES: Número de intento dentro del ciclo de reintentos (desde 1). */
  readonly attempt: number
  /** EN: The request as sent, redacted. ES: La solicitud enviada, tachada. */
  readonly request: HttpExchangeRequest
  /** EN: The response, or null when none arrived. ES: La respuesta, o null si no llegó. */
  readonly response: HttpExchangeResponse | null
  /** EN: The failure, or null when a response arrived. ES: La falla, o null si llegó respuesta. */
  readonly error: HttpExchangeError | null
  /** EN: ISO 8601 UTC. ES: ISO 8601 UTC. */
  readonly startedAt: string
  /** EN: Duration of the attempt, ms. ES: Duración del intento, ms. */
  readonly durationMs: number
}

/**
 * EN: Capture port: receives every attempt. Failures inside it are logged and never fail the operation.
 * ES: Puerto de captura: recibe cada intento. Sus fallas se registran y nunca hacen fallar la operación.
 */
export type HttpCapture = (exchange: HttpExchange) => Promise<void>

const REDACTED = '[redacted]'
const MAX_BODY_BYTES = 512 * 1024
const SENSITIVE_HEADERS: ReadonlySet<string> = new Set(['cookie', 'set-cookie', 'authorization', 'proxy-authorization'])

// The elements that carry a secret, with an optional namespace prefix and in any case.
const SECRET_ELEMENT = '(?:[\\w.-]+:)?(?:TOKEN|SEMILLA|RSASK)'

// A bracket as written in the text: raw, as a named entity or as a numeric reference (the forms the SOAP parser
// decodes), also with its `&` escaped again. The DTEWS SOAP channel carries the seed, the token and the signed seed
// XML-escaped (`&lt;TOKEN&gt;…`) inside `<…Return>` and `<pszXml>`, so the escaped form is the common one there.
const bracket = (raw: string, named: string, decimal: string, hex: string): string =>
  `(?:${raw}|&(?:amp;)*(?:${named}|#0*${decimal}|#x0*${hex});)`
const OPEN = bracket('<', 'lt', '60', '3c')
const CLOSE = bracket('>', 'gt', '62', '3e')

// A secret element with its content, up to the closing tag or, when the text was cut short, to the end of the text.
// A self-closing tag (`<TOKEN/>`) has no content and is left alone.
const SECRET_ELEMENT_WITH_CONTENT = new RegExp(
  `(${OPEN})(${SECRET_ELEMENT})((?:\\s(?:(?!${OPEN}|${CLOSE})[\\s\\S])*?)?)(?<!/)(${CLOSE})[\\s\\S]*?(?:${OPEN}/\\2\\s*${CLOSE}|$)`,
  'gi',
)
const TOKEN_ASSIGNMENT = /(TOKEN=)(["']?)[^;&\s"'<]+/gi
const SESSION_COOKIE_ASSIGNMENT = /((?:NETSCAPE_LIVEWIRE[\w.]*|CSESSIONID)=)(["']?)[^;&\s"'<]+/gi
const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g

const utf8Encoder = new TextEncoder()
const utf8Decoder = new TextDecoder()

// Cuts a text at 512 KiB of UTF-8 without splitting a character and states how many bytes were dropped.
const capBytes = (text: string): string => {
  const bytes = utf8Encoder.encode(text)
  if (bytes.length <= MAX_BODY_BYTES) {
    return text
  }
  let cut = MAX_BODY_BYTES
  while ((bytes[cut] & 0xc0) === 0x80) {
    cut -= 1
  }
  return `${utf8Decoder.decode(bytes.subarray(0, cut))}…[truncated ${bytes.length - cut} bytes]`
}

/**
 * EN: Replaces tokens, seeds, portal session cookies, `RSASK` and PEM private keys inside a text with `[redacted]` (as raw or XML-escaped
 * elements, in any case, with or without a namespace prefix, and also when the text was cut before the closing tag)
 * and cuts the result at 512 KiB of UTF-8, suffixed with the number of dropped bytes. RUTs and XML stay: SII support
 * needs them to diagnose an upload.
 * ES: Reemplaza tokens, semillas, cookies de sesión del portal, `RSASK` y llaves privadas PEM dentro de un texto por `[redacted]` (como elementos
 * crudos o escapados en XML, en cualquier caja, con o sin prefijo de espacio de nombres, y también cuando el texto
 * quedó cortado antes de la etiqueta de cierre) y corta el resultado a 512 KiB de UTF-8, con el número de bytes
 * descartados como sufijo. Los RUT y el XML se conservan: el soporte del SII los necesita para diagnosticar un envío.
 */
export const redactText = (text: string): string =>
  capBytes(
    text
      .replace(
        SECRET_ELEMENT_WITH_CONTENT,
        (_whole, open: string, name: string, attributes: string, close: string) =>
          `${open}${name}${attributes}${close}${REDACTED}${open}/${name}${close}`,
      )
      .replace(TOKEN_ASSIGNMENT, `$1$2${REDACTED}`)
      .replace(SESSION_COOKIE_ASSIGNMENT, `$1$2${REDACTED}`)
      .replace(PRIVATE_KEY_BLOCK, REDACTED),
  )

/**
 * EN: Replaces the values of `Cookie`, `Set-Cookie`, `Authorization` and `Proxy-Authorization` (any case) and
 * redacts the rest.
 * ES: Reemplaza los valores de `Cookie`, `Set-Cookie`, `Authorization` y `Proxy-Authorization` (en cualquier caja) y
 * tacha el resto.
 */
export const redactHeaders = (headers: Readonly<Record<string, string>>): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      SENSITIVE_HEADERS.has(name.toLowerCase()) ? REDACTED : redactText(value),
    ]),
  )

/**
 * EN: Pure redaction of a whole exchange (URL, headers, bodies and the error reason); the client applies it before
 * calling the port, and adapters may reuse it.
 * ES: Tachado puro de un intercambio completo (URL, cabeceras, cuerpos y el motivo del error); el cliente lo aplica
 * antes de llamar al puerto y los adaptadores pueden reutilizarlo.
 */
export const redactExchange = (exchange: HttpExchange): HttpExchange => ({
  ...exchange,
  request: {
    ...exchange.request,
    url: redactText(exchange.request.url),
    headers: redactHeaders(exchange.request.headers),
    body: exchange.request.body === null ? null : redactText(exchange.request.body),
  },
  response:
    exchange.response === null
      ? null
      : {
          ...exchange.response,
          headers: redactHeaders(exchange.response.headers),
          body: exchange.response.body === null ? null : redactText(exchange.response.body),
        },
  error: exchange.error === null ? null : { ...exchange.error, reason: redactText(exchange.error.reason) },
})

/**
 * EN: Summary of a thrown value for `HttpExchange.error`.
 * ES: Resumen de un valor lanzado para `HttpExchange.error`.
 */
export const exchangeError = (error: unknown): HttpExchangeError =>
  isDteError(error)
    ? { code: error.code, reason: typeof error.details.reason === 'string' ? error.details.reason : error.message }
    : { code: 'UNKNOWN', reason: errorMessage(error) }

/**
 * EN: In-memory capture: `exchanges()` returns a copy of everything captured so far.
 * ES: Captura en memoria: `exchanges()` devuelve una copia de lo capturado hasta ahora.
 */
export const createMemoryCapture = (): {
  readonly capture: HttpCapture
  readonly exchanges: () => readonly HttpExchange[]
} => {
  const list: HttpExchange[] = []
  return {
    capture: async (exchange) => {
      list.push(exchange)
    },
    exchanges: () => [...list],
  }
}
