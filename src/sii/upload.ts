import { UPLOAD_USER_AGENT } from '../catalogs/endpoints'
import { classifyReceptionStatus, isSchemaRejection, receptionStatusMessage } from '../catalogs/reception-status'
import type { EnvelopeKind } from '../envelope/create'
import type { SignedEnvelope } from '../envelope/sign'
import { DteError, errorMessage } from '../errors'
import { splitSiiRut, type SiiRut } from '../model/rut'
import { encodeLatin1 } from '../text/latin1'
import { chileTimestamp } from '../time/chile'
import { decodeXmlEntities, extractTagContent } from '../xml/parse'
import type { UploadKind } from './archive'
import { withToken } from './auth'
import { resolveCompanyRut, resolveSenderRut, retryFor, timeoutFor, type CallOverrides, type SiiClient } from './client'
import { buildMultipartBody, generateBoundary, multipartContentType, type MultipartField } from './multipart'
import { bodyExcerpt, httpError, isNoAnswer, isSuccess, parseJson, retryOptions, siiTimestampToIso } from './operation'
import { withRetry } from './retry'
import { send } from './send'
import type { TokenChannel } from './token-cache'
import { decodeBody, type HttpResponse } from './transport'

/**
 * EN: What the SII returns when it takes a file.
 * ES: Lo que devuelve el SII cuando recibe un archivo.
 */
export type UploadReceipt = {
  /** EN: SII tracking id of the upload (digits only). ES: `TRACKID` / `trackid` — Identificador del envío en el SII (solo dígitos). */
  readonly trackId: string
  /** EN: SII reception timestamp, `YYYY-MM-DDTHH:MM:SS` Chile time (client clock when the SII omits it). ES: `TIMESTAMP` / `fecha_recepcion` — Marca de recepción del SII (reloj del cliente si el SII la omite). */
  readonly receivedAt: string
  /** EN: What was uploaded. ES: Qué se subió. */
  readonly kind: UploadKind
  /** EN: Channel used. ES: Canal usado. */
  readonly channel: TokenChannel
  /** EN: File name sent in the multipart part. ES: `FILE` — Nombre del archivo enviado. */
  readonly fileName: string
  /** EN: true when the SII reported the file as already uploaded and returned the original TrackID. ES: true si el SII lo reportó como duplicado y devolvió el TrackID original. */
  readonly duplicate: boolean
  /** EN: Raw SII response. ES: Respuesta cruda del SII. */
  readonly raw: string
}

/**
 * EN: A signed envelope from phase 1, or just its kind and XML (for XML produced elsewhere).
 * ES: Un sobre firmado de la fase 1, o solo su tipo y XML (para XML generado en otra parte).
 */
export type UploadableEnvelope = SignedEnvelope | { readonly kind: EnvelopeKind; readonly xml: string }

/**
 * EN: Input of `uploadEnvelope`.
 * ES: Entrada de `uploadEnvelope`.
 */
export type UploadEnvelopeInput = {
  /** EN: The envelope to upload. ES: `EnvioDTE` / `EnvioBOLETA` — El sobre a subir. */
  readonly envelope: UploadableEnvelope
  /** EN: Company RUT; defaults to the client's. ES: `rutCompany` — RUT de la empresa; por defecto el del cliente. */
  readonly companyRut?: string
  /** EN: Sender RUT; defaults to the client's. ES: `rutSender` — RUT de quien envía; por defecto el del cliente. */
  readonly senderRut?: string
  /** EN: Force a channel for receipts (`rest` or `soap`); `EnvioDTE` always uses `soap`. ES: Forzar el canal de boletas (`rest` o `soap`); `EnvioDTE` siempre usa `soap`. */
  readonly channel?: TokenChannel
}

/**
 * EN: Input of `uploadBook` and `uploadFolioConsumption`: the signed XML.
 * ES: Entrada de `uploadBook` y `uploadFolioConsumption`: el XML firmado.
 */
export type UploadXmlInput = {
  /** EN: The signed XML document. ES: `LibroCompraVenta` / `LibroGuia` / `ConsumoFolios` — El documento XML firmado. */
  readonly xml: string
  /** EN: Company RUT; defaults to the client's. ES: `rutCompany` — RUT de la empresa; por defecto el del cliente. */
  readonly companyRut?: string
  /** EN: Sender RUT; defaults to the client's. ES: `rutSender` — RUT de quien envía; por defecto el del cliente. */
  readonly senderRut?: string
}

type ReceptionBase = {
  /** EN: `STATUS` as sent (one to three digits). ES: `STATUS` tal cual (uno a tres dígitos). */
  readonly status: string
  /** EN: `TIMESTAMP` as `YYYY-MM-DDTHH:MM:SS`, or null when absent or unreadable. ES: `TIMESTAMP` como `AAAA-MM-DDTHH:MM:SS`, o null si falta o no se lee. */
  readonly receivedAt: string | null
  /** EN: `FILE` or null. ES: `FILE` o null. */
  readonly fileName: string | null
  /** EN: `DETAIL/ERROR` lines, entities decoded. ES: Líneas `DETAIL/ERROR`, con las entidades decodificadas. */
  readonly errors: readonly string[]
}

/**
 * EN: Interpreted `RECEPCIONDTE`: `received` and `duplicate` always carry a TrackID made of digits only; the other
 * outcomes carry none.
 * ES: `RECEPCIONDTE` interpretado: `received` y `duplicate` siempre traen un TrackID de solo dígitos; los demás
 * resultados no traen ninguno.
 */
export type ReceptionOutcome =
  | (ReceptionBase & {
      /** EN: What the SII said. ES: Lo que dijo el SII. */
      readonly outcome: 'received' | 'duplicate'
      /** EN: `TRACKID`, or the TrackID the duplicate message names. ES: `TRACKID`, o el TrackID que nombra el mensaje de duplicado. */
      readonly trackId: string
    })
  | (ReceptionBase & {
      /** EN: What the SII said. ES: Lo que dijo el SII. */
      readonly outcome: 'notAuthenticated' | 'rejected'
      /** EN: Always null: a refused file has no TrackID. ES: Siempre null: un archivo rechazado no tiene TrackID. */
      readonly trackId: null
    })

const STATUS_PATTERN = /^\d{1,3}$/
// A TrackID ends up in a file name (the directory archive) and in status URLs: nothing but digits gets through.
const TRACK_ID_PATTERN = /^\d{1,20}$/
const TRACK_ID_IN_TEXT = /\btrackid\b\s*[:=]?\s*(\S+)/i

const invalidResponse = (operation: string, text: string): DteError =>
  new DteError('SII_RESPONSE_INVALID', { operation, body: bodyExcerpt(text) })

// The word after "Trackid" in the first error line that has one, without the punctuation that may follow it.
const trackIdInErrors = (errors: readonly string[]): string => {
  const token = errors.map((line) => TRACK_ID_IN_TEXT.exec(line)?.[1]).find((value) => value !== undefined)
  return token === undefined ? '' : token.replace(/[.,;)]+$/, '')
}

// The `TRACKID` element wins; duplicate replies may carry the TrackID only in the text of an error line.
const trackIdCandidate = (text: string, errors: readonly string[]): string => {
  const tagged = extractTagContent(text, 'TRACKID')?.trim() ?? ''
  return tagged !== '' ? tagged : trackIdInErrors(errors)
}

/**
 * EN: Reads a `DTEUpload` reply. `STATUS` 0 with a TrackID is `received`; 5 is `notAuthenticated`; 7 is a rejection
 * when `DETAIL/ERROR` names `CHR-`/`SCH-`/`cvc-` errors and otherwise a `duplicate` when a TrackID can be found;
 * 99 is a `duplicate` when the `TRACKID` element or the message names the TrackID; everything else is `rejected`.
 * The TrackID must be digits only (it becomes a file name), and so must be `STATUS` (it reaches error messages).
 * ES: Lee una respuesta de `DTEUpload`. `STATUS` 0 con TrackID es `received`; 5 es `notAuthenticated`; 7 es un
 * rechazo cuando `DETAIL/ERROR` nombra errores `CHR-`/`SCH-`/`cvc-` y si no un `duplicate` cuando se encuentra un
 * TrackID; 99 es un `duplicate` cuando el elemento `TRACKID` o el mensaje nombran el TrackID; todo lo demás es
 * `rejected`. El TrackID debe ser solo dígitos (pasa a ser un nombre de archivo) y el `STATUS` también (llega a los
 * mensajes de error).
 * @param text EN: Reply body decoded as ISO-8859-1. ES: Cuerpo de la respuesta decodificado como ISO-8859-1.
 * @param operation EN: Operation name for the error details. ES: Nombre de la operación para los detalles del error.
 * @throws {DteError} EN: `SII_RESPONSE_INVALID` when the body is not a `RECEPCIONDTE`, `STATUS` is not a number or a TrackID is not digits only. ES: `SII_RESPONSE_INVALID` si el cuerpo no es un `RECEPCIONDTE`, el `STATUS` no es un número o un TrackID no es solo dígitos.
 */
export const parseReceptionResponse = (text: string, operation = 'upload'): ReceptionOutcome => {
  if (!/<RECEPCIONDTE>/i.test(text)) throw invalidResponse(operation, text)
  const status = (extractTagContent(text, 'STATUS') ?? '').trim()
  if (!STATUS_PATTERN.test(status)) throw invalidResponse(operation, text)
  const errors = Array.from(text.matchAll(/<ERROR>([^<]*)<\/ERROR>/gi), (match) => decodeXmlEntities(match[1]).trim())
  const base: ReceptionBase = {
    status,
    receivedAt: siiTimestampToIso(extractTagContent(text, 'TIMESTAMP')),
    fileName: extractTagContent(text, 'FILE'),
    errors,
  }
  const cls = classifyReceptionStatus(status)
  if (cls === 'notAuthenticated') return { ...base, outcome: 'notAuthenticated', trackId: null }
  const duplicate = cls === 'alreadyUploaded' || (cls === 'schemaInvalid' && !isSchemaRejection(errors))
  if (cls === 'received' || duplicate) {
    const trackId = trackIdCandidate(text, errors)
    if (trackId !== '') {
      if (!TRACK_ID_PATTERN.test(trackId)) throw invalidResponse(operation, text)
      return { ...base, outcome: duplicate ? 'duplicate' : 'received', trackId }
    }
  }
  return { ...base, outcome: 'rejected', trackId: null }
}

type UploadJob = {
  readonly kind: UploadKind
  readonly operation: string
  readonly fileName: string
  readonly bytes: Uint8Array
  readonly companyRut: SiiRut
  readonly senderRut: SiiRut
  readonly channel: TokenChannel
}

const FILE_NAMES: Readonly<Record<UploadKind, string>> = {
  dte: 'EnvioDTE.xml',
  receipt: 'EnvioBOLETA.xml',
  book: 'LibroCV.xml',
  folioConsumption: 'ConsumoFolios.xml',
}
const MAX_REST_RECEIPTS = 500

// Phase 1 envelopes carry the prolog; XML produced elsewhere may not, and the SII expects it.
const ensureProlog = (xml: string): string =>
  xml.trimStart().startsWith('<?xml') ? xml : `<?xml version="1.0" encoding="ISO-8859-1"?>\n${xml}`

const buildJob = (
  sii: SiiClient,
  kind: UploadKind,
  operation: string,
  xml: string,
  ruts: { readonly companyRut?: string; readonly senderRut?: string },
  channel: TokenChannel,
): UploadJob => ({
  kind,
  operation,
  fileName: FILE_NAMES[kind],
  // The prolog declares ISO-8859-1, so the file bytes are Latin-1 on both channels.
  bytes: encodeLatin1(ensureProlog(xml)),
  companyRut: resolveCompanyRut(sii, ruts.companyRut),
  senderRut: resolveSenderRut(sii, ruts.senderRut),
  channel,
})

const rutFields = (senderRut: SiiRut, companyRut: SiiRut): readonly MultipartField[] => {
  const sender = splitSiiRut(senderRut)
  const company = splitSiiRut(companyRut)
  return [
    { name: 'rutSender', value: sender.body },
    { name: 'dvSender', value: sender.verifier.toUpperCase() },
    { name: 'rutCompany', value: company.body },
    { name: 'dvCompany', value: company.verifier.toUpperCase() },
  ]
}

type Form = { readonly body: Uint8Array; readonly contentType: string }

const buildForm = (job: UploadJob): Form => {
  const boundary = generateBoundary()
  return {
    body: buildMultipartBody({
      boundary,
      fields: rutFields(job.senderRut, job.companyRut),
      file: { name: 'archivo', fileName: job.fileName, contentType: 'text/xml', bytes: job.bytes },
    }),
    contentType: multipartContentType(boundary),
  }
}

// What the SII's answer means for the caller and for the archive. `code` is the SII's own code (`STATUS`, `estado`),
// empty when the answer carried none (HTTP error, unreadable body).
type Verdict =
  | {
      readonly ok: true
      readonly code: string
      readonly trackId: string
      readonly duplicate: boolean
      readonly receivedAt: string | null
    }
  | { readonly ok: false; readonly code: string; readonly failure: unknown }

const refuse = (failure: unknown, code = ''): Verdict => ({ ok: false, code, failure })

// Throws for an answer that cannot be read (HTTP error status, body that is not what the channel returns); returns
// a verdict for one that can.
const readCgiAnswer = (job: UploadJob, response: HttpResponse, text: string): Verdict => {
  if (!isSuccess(response.status)) throw httpError(response, text, job.operation, 'soap')
  const reception = parseReceptionResponse(text, job.operation)
  // Only `received` and `duplicate` carry a TrackID; the other two are the SII refusing the token or the file.
  if (reception.trackId === null)
    return refuse(
      reception.outcome === 'notAuthenticated'
        ? new DteError('SII_TOKEN_INVALID', { operation: job.operation, channel: 'soap', status: reception.status })
        : new DteError('SII_UPLOAD_REJECTED', {
            status: reception.status,
            errors: reception.errors,
            fileName: job.fileName,
            operation: job.operation,
            message: receptionStatusMessage(reception.status),
          }),
      reception.status,
    )
  return {
    ok: true,
    code: reception.status,
    trackId: reception.trackId,
    duplicate: reception.outcome === 'duplicate',
    receivedAt: reception.receivedAt,
  }
}

const restTrackId = (value: unknown): string | null => {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value
  return typeof text === 'string' && TRACK_ID_PATTERN.test(text) ? text : null
}

const readRestAnswer = (job: UploadJob, response: HttpResponse, text: string): Verdict => {
  if (response.status === 401)
    return refuse(new DteError('SII_TOKEN_INVALID', { operation: job.operation, channel: 'rest', httpStatus: 401 }))
  if (!isSuccess(response.status)) throw httpError(response, text, job.operation, 'rest')
  const json = parseJson(text, job.operation)
  const trackId = restTrackId(json.trackid)
  if (trackId === null) throw invalidResponse(job.operation, text)
  return {
    ok: true,
    code: typeof json.estado === 'string' ? json.estado : '',
    trackId,
    duplicate: false,
    receivedAt: typeof json.fecha_recepcion === 'string' ? siiTimestampToIso(json.fecha_recepcion) : null,
  }
}

const readAnswer = (job: UploadJob, response: HttpResponse, text: string): Verdict => {
  try {
    return job.channel === 'rest' ? readRestAnswer(job, response, text) : readCgiAnswer(job, response, text)
  } catch (error) {
    return refuse(error)
  }
}

// Hands the answer to the archive port, rejections and unreadable answers included. A port that fails is logged:
// the SII already has the file, and the caller needs the TrackID or the SII's error, not the port's.
const archiveUpload = async (
  sii: SiiClient,
  job: UploadJob,
  answer: { readonly sentAt: Date; readonly response: HttpResponse; readonly raw: string; readonly verdict: Verdict },
): Promise<void> => {
  if (sii.archive === null) return
  const { verdict } = answer
  try {
    await sii.archive({
      environment: sii.environment,
      kind: job.kind,
      channel: job.channel,
      trackId: verdict.ok ? verdict.trackId : null,
      duplicate: verdict.ok && verdict.duplicate,
      companyRut: job.companyRut,
      senderRut: job.senderRut,
      fileName: job.fileName,
      sentAt: answer.sentAt.toISOString(),
      xml: job.bytes,
      response: { httpStatus: answer.response.status, code: verdict.code, raw: answer.raw },
    })
  } catch (error) {
    sii.logger.warn('upload archive failed', { operation: job.operation, reason: errorMessage(error) })
  }
}

// One POST. Everything after `send` resolves is the SII's answer: it is archived and then returned or thrown, never
// retried (see `isNoAnswer`).
const attemptUpload = async (
  sii: SiiClient,
  job: UploadJob,
  form: Form,
  token: string,
  attempt: number,
  overrides?: CallOverrides,
): Promise<UploadReceipt> => {
  const rest = job.channel === 'rest'
  const sentAt = sii.now()
  const response = await send(sii, {
    operation: job.operation,
    channel: job.channel,
    method: 'POST',
    url: rest ? sii.endpoints.rest.upload : sii.endpoints.soap.upload,
    headers: {
      'User-Agent': UPLOAD_USER_AGENT,
      Cookie: `TOKEN=${token}`,
      Accept: rest ? 'application/json' : '*/*',
      'Content-Type': form.contentType,
    },
    body: form.body,
    timeoutMs: timeoutFor(sii, 'upload', overrides),
    signal: overrides?.signal,
    attempt,
    requestEncoding: 'latin1',
  })
  const text = decodeBody(response.body, rest ? 'utf8' : 'latin1')
  const verdict = readAnswer(job, response, text)
  await archiveUpload(sii, job, { sentAt, response, raw: text, verdict })
  if (!verdict.ok) throw verdict.failure
  return {
    trackId: verdict.trackId,
    receivedAt: verdict.receivedAt ?? chileTimestamp(sentAt),
    kind: job.kind,
    channel: job.channel,
    fileName: job.fileName,
    duplicate: verdict.duplicate,
    raw: text,
  }
}

// An upload is sent again only while no SII response has arrived (`isNoAnswer`): once the SII answered, whatever the
// HTTP status or `STATUS`, the file may be in already, and a second copy is exactly the duplicate upload this client has
// to recover from. The one exception to "never re-send after an answer" lives in `withToken`: when the SII refuses the
// token (`STATUS` 5, HTTP 401) it did not take the file, so the call runs once more with a fresh token.
const performUpload = (sii: SiiClient, job: UploadJob, overrides?: CallOverrides): Promise<UploadReceipt> => {
  const form = buildForm(job)
  return withToken(sii, job.channel, overrides, (token) =>
    withRetry(retryFor(sii, overrides), (attempt) => attemptUpload(sii, job, form, token, attempt, overrides), {
      ...retryOptions(sii, job.operation, overrides),
      retryOn: isNoAnswer,
    }),
  )
}

/**
 * EN: Uploads a signed envelope: `EnvioDTE` through `DTEUpload` (ISO-8859-1 multipart), `EnvioBOLETA` through the
 * receipts REST API in production or `DTEUpload` in certification (`channel` overrides). Duplicate uploads are
 * recognised and return the original TrackID with `duplicate: true`. The upload is retried only while no SII response
 * has arrived; once the SII answered (any HTTP status, any `STATUS`) it is never sent again, except once with a fresh
 * token when the SII refused the token. Every answer is handed to the archive port.
 * ES: Sube un sobre firmado: `EnvioDTE` por `DTEUpload` (multipart ISO-8859-1), `EnvioBOLETA` por la API REST de
 * boletas en producción o `DTEUpload` en certificación (`channel` lo fuerza). Los envíos duplicados se reconocen y
 * devuelven el TrackID original con `duplicate: true`. El envío se reintenta solo mientras no haya llegado respuesta
 * del SII; una vez que el SII respondió (cualquier estado HTTP, cualquier `STATUS`) no se vuelve a enviar, salvo una
 * vez con un token nuevo cuando el SII rechazó el token. Toda respuesta se entrega al puerto de archivo.
 * @throws {DteError} EN: `SII_UPLOAD_REJECTED { status, errors }`, `SII_TOKEN_INVALID`, `SII_HTTP_ERROR`, `SII_RESPONSE_INVALID`, `INVALID_OPTION { field: 'channel' }`, `MISSING_FIELD`, `INVALID_RUT`, `ENCODING_UNSUPPORTED_CHAR`, transport codes. ES: los mismos códigos.
 */
export const uploadEnvelope = async (
  sii: SiiClient,
  input: UploadEnvelopeInput,
  overrides?: CallOverrides,
): Promise<UploadReceipt> => {
  const kind: UploadKind = input.envelope.kind === 'receipt' ? 'receipt' : 'dte'
  if (input.channel !== undefined && input.channel !== 'soap' && input.channel !== 'rest')
    throw new DteError('INVALID_OPTION', { field: 'channel' })
  const channel = input.channel ?? (kind === 'receipt' ? sii.receiptsChannel : 'soap')
  if (channel === 'rest' && kind !== 'receipt') throw new DteError('INVALID_OPTION', { field: 'channel' })
  if (channel === 'rest' && 'cover' in input.envelope) {
    const count = input.envelope.cover.subtotals.reduce((sum, subtotal) => sum + subtotal.count, 0)
    if (count > MAX_REST_RECEIPTS)
      throw new DteError('SII_UPLOAD_REJECTED', { status: 'TOO_MANY', count, operation: 'uploadEnvelope' })
  }
  return performUpload(sii, buildJob(sii, kind, 'uploadEnvelope', input.envelope.xml, input, channel), overrides)
}

/**
 * EN: Uploads a signed book (`LibroCompraVenta`, `LibroGuia`) through `DTEUpload` as `LibroCV.xml`.
 * ES: Sube un libro firmado (`LibroCompraVenta`, `LibroGuia`) por `DTEUpload` como `LibroCV.xml`.
 */
export const uploadBook = async (
  sii: SiiClient,
  input: UploadXmlInput,
  overrides?: CallOverrides,
): Promise<UploadReceipt> =>
  performUpload(sii, buildJob(sii, 'book', 'uploadBook', input.xml, input, 'soap'), overrides)

/**
 * EN: Uploads a signed folio consumption report (RCOF, `ConsumoFolios`) through `DTEUpload` as `ConsumoFolios.xml`.
 * ES: Sube un Reporte de Consumo de Folios firmado (`ConsumoFolios`) por `DTEUpload` como `ConsumoFolios.xml`.
 */
export const uploadFolioConsumption = async (
  sii: SiiClient,
  input: UploadXmlInput,
  overrides?: CallOverrides,
): Promise<UploadReceipt> =>
  performUpload(sii, buildJob(sii, 'folioConsumption', 'uploadFolioConsumption', input.xml, input, 'soap'), overrides)
