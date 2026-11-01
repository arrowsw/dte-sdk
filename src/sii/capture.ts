import { errorMessage, isDteError } from '../errors'
import type { TokenChannel } from './token-cache'

/**
 * EN: The request half of a captured exchange, bodies already decoded to text.
 * ES: La mitad "petición" de un intercambio capturado, con los cuerpos ya decodificados a texto.
 */
export type HttpExchangeRequest = {
  readonly method: string
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  /** EN: Decoded body or null (GET). ES: Cuerpo decodificado o null (GET). */
  readonly body: string | null
}

/**
 * EN: The response half of a captured exchange.
 * ES: La mitad "respuesta" de un intercambio capturado.
 */
export type HttpExchangeResponse = {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: string | null
}

/**
 * EN: Why an exchange produced no response.
 * ES: Por qué un intercambio no produjo respuesta.
 */
export type HttpExchangeError = {
  /** EN: `DteError.code` or `UNKNOWN`. ES: `DteError.code` o `UNKNOWN`. */
  readonly code: string
  readonly reason: string
}

/**
 * EN: One HTTP attempt as handed to the `capture` port, already redacted.
 * ES: Un intento HTTP tal como se entrega al puerto `capture`, ya con los secretos tachados.
 */
export type HttpExchange = {
  /** EN: Operation name (`getSeed`, `uploadEnvelope`, `registerClaim`…). ES: Nombre de la operación. */
  readonly operation: string
  readonly channel: TokenChannel
  /** EN: Attempt number within the retry loop (1-based). ES: Número de intento dentro del ciclo de reintentos (desde 1). */
  readonly attempt: number
  readonly request: HttpExchangeRequest
  readonly response: HttpExchangeResponse | null
  readonly error: HttpExchangeError | null
  /** EN: ISO 8601 UTC. ES: ISO 8601 UTC. */
  readonly startedAt: string
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

// A secret element with its content, up to the closing tag or, when the text was cut short, to the end of the text.
// A self-closing tag (`<TOKEN/>`) has no content and is left alone. `open`/`close` are the angle brackets as written
// in the text: the raw ones or their XML-escaped forms.
const secretElement = (open: string, close: string, attributeCharacter: string): RegExp =>
  new RegExp(
    `(${open}(${SECRET_ELEMENT})(?:\\s${attributeCharacter}*?)?(?<!/)${close})[\\s\\S]*?(?:${open}/\\2\\s*${close}|$)`,
    'gi',
  )

// The DTEWS SOAP channel carries the seed, the token and the signed seed XML-escaped (`&lt;TOKEN&gt;…`) inside
// `<…Return>` and `<pszXml>`, so the escaped form is the common one there.
const RAW_SECRET_ELEMENT = secretElement('<', '>', '[^<>]')
const ESCAPED_SECRET_ELEMENT = secretElement('&lt;', '&gt;', '(?:(?!&lt;|&gt;)[^<>])')
const TOKEN_ASSIGNMENT = /(TOKEN=)(["']?)[^;&\s"'<]+/gi
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
 * EN: Replaces tokens, seeds, `RSASK` and PEM private keys inside a text with `[redacted]` (as raw or XML-escaped
 * elements, in any case, with or without a namespace prefix, and also when the text was cut before the closing tag)
 * and cuts the result at 512 KiB of UTF-8, suffixed with the number of dropped bytes. RUTs and XML stay: SII support
 * needs them to diagnose an upload.
 * ES: Reemplaza tokens, semillas, `RSASK` y llaves privadas PEM dentro de un texto por `[redacted]` (como elementos
 * crudos o escapados en XML, en cualquier caja, con o sin prefijo de espacio de nombres, y también cuando el texto
 * quedó cortado antes de la etiqueta de cierre) y corta el resultado a 512 KiB de UTF-8, con el número de bytes
 * descartados como sufijo. Los RUT y el XML se conservan: el soporte del SII los necesita para diagnosticar un envío.
 */
export const redactText = (text: string): string =>
  capBytes(
    text
      .replace(RAW_SECRET_ELEMENT, (_whole, opening: string, name: string) => `${opening}${REDACTED}</${name}>`)
      .replace(
        ESCAPED_SECRET_ELEMENT,
        (_whole, opening: string, name: string) => `${opening}${REDACTED}&lt;/${name}&gt;`,
      )
      .replace(TOKEN_ASSIGNMENT, `$1$2${REDACTED}`)
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
