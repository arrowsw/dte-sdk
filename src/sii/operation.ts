import { DteError } from '../errors'
import { extractTagContent } from '../xml/parse'
import { redactText } from './capture'
import { retryFor, timeoutFor, type CallOverrides, type SiiClient } from './client'
import type { RetryOptions } from './retry'
import { send } from './send'
import { buildSoapEnvelope, parseSoapResponse, SOAP_HEADERS, type SoapParam } from './soap'
import type { TokenChannel } from './token-cache'
import { decodeBody, encodeUtf8, type HttpMethod, type HttpResponse } from './transport'

const EXCERPT_CHARS = 2000

/**
 * EN: First 2 000 characters of a body with its secrets redacted, for `details.body` (never part of a message).
 * Consumers log `details`, and a reply that fails to parse can still carry a token. Redacting comes first, so a cut
 * cannot split a secret away from the tag that identifies it.
 * ES: Primeros 2 000 caracteres de un cuerpo con sus secretos tachados, para `details.body` (nunca parte de un mensaje).
 * Los consumidores registran `details`, y una respuesta que no se puede interpretar igual puede traer un token. Se tacha
 * primero, así un corte no puede separar un secreto de la etiqueta que lo identifica.
 */
export const bodyExcerpt = (text: string): string => redactText(text).slice(0, EXCERPT_CHARS)

/**
 * EN: `X-Retry-After` / `Retry-After` in seconds → ms, or null.
 * ES: `X-Retry-After` / `Retry-After` en segundos → ms, o null.
 */
export const retryAfterMs = (headers: Readonly<Record<string, string>>): number | null => {
  const raw = headers['x-retry-after'] ?? headers['retry-after']
  if (raw === undefined) return null
  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null
}

/**
 * EN: True for 2xx.
 * ES: True para 2xx.
 */
export const isSuccess = (status: number): boolean => status >= 200 && status < 300

/**
 * EN: `SII_HTTP_ERROR` for a non-2xx response; carries the status, an excerpt of the body and the SII retry hint.
 * ES: `SII_HTTP_ERROR` para una respuesta no 2xx; trae el estado, un extracto del cuerpo y la sugerencia de reintento del SII.
 */
export const httpError = (response: HttpResponse, text: string, operation: string, channel: TokenChannel): DteError =>
  new DteError('SII_HTTP_ERROR', {
    httpStatus: response.status,
    operation,
    channel,
    body: bodyExcerpt(text),
    retryAfterMs: retryAfterMs(response.headers),
  })

/**
 * EN: `RESP_HDR` of a `SII:RESPUESTA` document.
 * ES: `RESP_HDR` de un documento `SII:RESPUESTA`.
 */
export type SiiResponseHeader = {
  /** EN: `ESTADO`, trimmed. ES: `ESTADO`, sin espacios. */
  readonly code: string
  /** EN: `GLOSA` or null. ES: `GLOSA` o null. */
  readonly message: string | null
}

/**
 * EN: Reads `ESTADO` and `GLOSA`; a document without `ESTADO` is `SII_RESPONSE_INVALID`.
 * ES: Lee `ESTADO` y `GLOSA`; un documento sin `ESTADO` es `SII_RESPONSE_INVALID`.
 */
export const readSiiResponse = (xml: string, operation: string): SiiResponseHeader => {
  const code = extractTagContent(xml, 'ESTADO')
  if (code === null) throw new DteError('SII_RESPONSE_INVALID', { operation, body: bodyExcerpt(xml) })
  return { code: code.trim(), message: extractTagContent(xml, 'GLOSA') }
}

/**
 * EN: Parses a JSON object body; anything else is `SII_RESPONSE_INVALID`.
 * ES: Parsea un cuerpo JSON objeto; cualquier otra cosa es `SII_RESPONSE_INVALID`.
 */
export const parseJson = (text: string, operation: string): Readonly<Record<string, unknown>> => {
  const parsed: unknown = (() => {
    try {
      return JSON.parse(text)
    } catch {
      return undefined
    }
  })()
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new DteError('SII_RESPONSE_INVALID', { operation, body: bodyExcerpt(text) })
  return parsed as Readonly<Record<string, unknown>>
}

/**
 * EN: `YYYY-MM-DD HH:MM:SS` or `DD/MM/YYYY HH:MM:SS` (also with `-`) → `YYYY-MM-DDTHH:MM:SS`; null when it does not parse.
 * ES: `AAAA-MM-DD HH:MM:SS` o `DD/MM/AAAA HH:MM:SS` (también con `-`) → `AAAA-MM-DDTHH:MM:SS`; null si no calza.
 */
export const siiTimestampToIso = (value: string | null): string | null => {
  if (value === null) return null
  const text = value.trim()
  const ymd = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(text)
  if (ymd !== null) return `${ymd[1]}-${ymd[2]}-${ymd[3]}T${ymd[4]}`
  const dmy = /^(\d{2})[-/](\d{2})[-/](\d{4})[ T](\d{2}:\d{2}:\d{2})/.exec(text)
  return dmy === null ? null : `${dmy[3]}-${dmy[2]}-${dmy[1]}T${dmy[4]}`
}

/**
 * EN: `RetryOptions` for an operation: the client's sleep, the caller's signal and a `warn` line per retry.
 * ES: `RetryOptions` de una operación: el sleep del cliente, el signal del llamador y una línea `warn` por reintento.
 */
export const retryOptions = (sii: SiiClient, operation: string, overrides?: CallOverrides): RetryOptions => ({
  sleep: sii.sleep,
  signal: overrides?.signal,
  onRetry: (error, attempt, delayMs) =>
    sii.logger.warn('sii retrying', { operation, attempt, delayMs, code: error.code }),
})

/**
 * EN: Input of `soapCall`.
 * ES: Entrada de `soapCall`.
 */
export type SoapCallInput = {
  /** EN: Operation name for the capture, logs and errors. ES: Nombre de la operación para la captura, los logs y los errores. */
  readonly operation: string
  /** EN: Service URL (`CrSeed.jws`, `GetTokenFromSeed.jws`, `QueryEst*.jws`). ES: URL del servicio (`CrSeed.jws`, `GetTokenFromSeed.jws`, `QueryEst*.jws`). */
  readonly url: string
  /** EN: rpc operation name inside the envelope (`getSeed`, `getToken`, `getEstUp`…). ES: Nombre de la operación rpc dentro del sobre (`getSeed`, `getToken`, `getEstUp`…). */
  readonly method: string
  /** EN: Parameters in the order the WSDL declares them (`pszXml`, `Token`…). ES: Parámetros en el orden que declara el WSDL (`pszXml`, `Token`…). */
  readonly params: readonly SoapParam[]
  /** EN: Attempt number (1-based), for the capture and logs. ES: Número de intento (desde 1), para la captura y los logs. */
  readonly attempt: number
  /** EN: Per-call timeout and cancellation. ES: Timeout y cancelación de esta llamada. */
  readonly overrides?: CallOverrides
}

/**
 * EN: One DTEWS SOAP attempt: UTF-8 envelope out, Latin-1 reply in; returns the unescaped `<…Return>` payload.
 * ES: Un intento SOAP DTEWS: sobre UTF-8 de ida, respuesta Latin-1 de vuelta; devuelve el contenido des-escapado de `<…Return>`.
 * @throws {DteError} EN: `SII_HTTP_ERROR`, `SII_SOAP_FAULT`, `SII_RESPONSE_INVALID` plus the transport codes. ES: los mismos códigos.
 */
export const soapCall = async (sii: SiiClient, input: SoapCallInput): Promise<string> => {
  const response = await send(sii, {
    operation: input.operation,
    channel: 'soap',
    method: 'POST',
    url: input.url,
    headers: SOAP_HEADERS,
    body: encodeUtf8(buildSoapEnvelope({ method: input.method, params: input.params })),
    timeoutMs: timeoutFor(sii, 'soap', input.overrides),
    signal: input.overrides?.signal,
    attempt: input.attempt,
    requestEncoding: 'utf8',
  })
  const text = decodeBody(response.body, 'latin1')
  if (!isSuccess(response.status)) throw httpError(response, text, input.operation, 'soap')
  const parsed = parseSoapResponse(text)
  if (parsed.fault !== null)
    throw new DteError('SII_SOAP_FAULT', {
      code: parsed.fault.code,
      reason: parsed.fault.reason,
      operation: input.operation,
    })
  if (parsed.returnValue === null)
    throw new DteError('SII_RESPONSE_INVALID', { operation: input.operation, body: bodyExcerpt(text) })
  return parsed.returnValue
}

/**
 * EN: Input of `restCall`.
 * ES: Entrada de `restCall`.
 */
export type RestCallInput = {
  /** EN: Operation name for the capture, logs and errors. ES: Nombre de la operación para la captura, los logs y los errores. */
  readonly operation: string
  /** EN: HTTP method. ES: Método HTTP. */
  readonly method: HttpMethod
  /** EN: Absolute URL of the receipts API. ES: URL absoluta de la API de boletas. */
  readonly url: string
  /** EN: Request headers (`Accept`, `Content-Type`, `Cookie`…). ES: Cabeceras de la petición (`Accept`, `Content-Type`, `Cookie`…). */
  readonly headers: Readonly<Record<string, string>>
  /** EN: Request body bytes (POST only). ES: Bytes del cuerpo de la petición (solo POST). */
  readonly body?: Uint8Array
  /** EN: Attempt number (1-based), for the capture and logs. ES: Número de intento (desde 1), para la captura y los logs. */
  readonly attempt: number
  /** EN: Per-call timeout and cancellation. ES: Timeout y cancelación de esta llamada. */
  readonly overrides?: CallOverrides
  /** EN: Which timeout applies (`rest` by default, `upload` for uploads). ES: Qué timeout aplica (`rest` por defecto, `upload` en subidas). */
  readonly timeoutKind?: 'rest' | 'upload'
  /** EN: Charset of the request body for the capture. ES: Charset del cuerpo enviado para la captura. */
  readonly requestEncoding?: 'latin1' | 'utf8'
}

/**
 * EN: One receipts-API attempt: returns the response and its UTF-8 text; the caller classifies the status.
 * ES: Un intento contra la API de boletas: devuelve la respuesta y su texto UTF-8; el llamador clasifica el estado.
 */
export const restCall = async (
  sii: SiiClient,
  input: RestCallInput,
): Promise<{ readonly response: HttpResponse; readonly text: string }> => {
  const response = await send(sii, {
    operation: input.operation,
    channel: 'rest',
    method: input.method,
    url: input.url,
    headers: input.headers,
    body: input.body,
    timeoutMs: timeoutFor(sii, input.timeoutKind ?? 'rest', input.overrides),
    signal: input.overrides?.signal,
    attempt: input.attempt,
    requestEncoding: input.requestEncoding,
  })
  return { response, text: decodeBody(response.body, 'utf8') }
}

/**
 * EN: `restCall` that must succeed (2xx), else `SII_HTTP_ERROR`.
 * ES: `restCall` que debe tener éxito (2xx), si no `SII_HTTP_ERROR`.
 */
export const restText = async (sii: SiiClient, input: RestCallInput): Promise<string> => {
  const { response, text } = await restCall(sii, input)
  if (!isSuccess(response.status)) throw httpError(response, text, input.operation, 'rest')
  return text
}

/** EN: Re-exported for the operations' convenience. ES: Re-exportado por comodidad de las operaciones. */
export { retryFor }
