import {
  CLAIM_ACTIONS,
  isClaimAction,
  isClaimDocumentType,
  transferabilityOf,
  type ClaimAction,
  type ClaimDocumentType,
} from '../catalogs/claim-codes'
import { DteError } from '../errors'
import { splitSiiRut, toSiiRut, type SiiRut } from '../model/rut'
import { toIsoDate } from '../time/chile'
import { decodeXmlEntities, extractTagContent } from '../xml/parse'
import { withToken } from './auth'
import { redactText } from './capture'
import { retryFor, timeoutFor, type CallOverrides, type SiiClient } from './client'
import { bodyExcerpt, httpError, isNoAnswer, isSuccess, retryOptions, siiTimestampToIso } from './operation'
import { withRetry } from './retry'
import { send } from './send'
import { buildSoapEnvelope, parseSoapResponse, SOAP_HEADERS, type SoapParam } from './soap'
import { decodeBody, encodeUtf8 } from './transport'

const CLAIMS_NAMESPACE = 'http://ws.registroreclamodte.diii.sdi.sii.cl'

/**
 * EN: A received document identified for the registry.
 * ES: Un documento recibido identificado para el registro.
 */
export type ClaimDocumentInput = {
  /** EN: RUT of the document issuer (the supplier). ES: `rutEmisor`-`dvEmisor` — RUT del emisor del documento (el proveedor). */
  readonly issuerRut: string
  /** EN: 33, 34 or 43. ES: `tipoDoc` — 33, 34 o 43. */
  readonly type: ClaimDocumentType
  /** EN: Folio. ES: `folio`. */
  readonly folio: number
}

/**
 * EN: Input of `registerClaim`.
 * ES: Entrada de `registerClaim`.
 */
export type RegisterClaimInput = ClaimDocumentInput & {
  /** EN: Action to register. ES: `accionDoc` — Acción a registrar. */
  readonly action: ClaimAction
}

/**
 * EN: Outcome of a registry operation. The SII answers business situations with a code instead of an error.
 * ES: Resultado de una operación del registro. El SII responde situaciones de negocio con un código, no con un error.
 */
export type ClaimResult = {
  /** EN: SII response code (0 ok, 1–19 business, -1 internal). ES: `codResp` — Código de respuesta del SII. */
  readonly code: number
  /** EN: SII description (≤ 70 chars). ES: `descResp` — Descripción del SII. */
  readonly description: string
  /** EN: true when `code` is 0. ES: true si `codResp` es 0. */
  readonly ok: boolean
  /** EN: Inner XML of `return`. ES: XML interior de `return`. */
  readonly raw: string
}

/**
 * EN: One registered event.
 * ES: Un evento registrado (`listaEventosDoc`).
 */
export type ClaimEvent = {
  /** EN: ACD, RCD, ERM, RFP, RFT, NCA, ENC. ES: `codEvento` — Código del evento. */
  readonly code: string
  /** EN: Description. ES: `descEvento` — Descripción del evento. */
  readonly description: string
  /** EN: RUT that registered the event, or null when the SII sent none or an invalid one. ES: `rutResponsable`-`dvResponsable` — RUT que registró el evento, o null si el SII no lo envía o es inválido. */
  readonly responsibleRut: SiiRut | null
  /** EN: Date as sent by the SII. ES: `fechaEvento` — Fecha tal cual la envía el SII. */
  readonly date: string
  /** EN: `YYYY-MM-DDTHH:MM:SS` when the date parses. ES: `fechaEvento` normalizada (`AAAA-MM-DDTHH:MM:SS`) cuando se puede. */
  readonly dateIso: string | null
}

/**
 * EN: `listClaimEvents` result.
 * ES: Resultado de `listClaimEvents` (`listarEventosHistDoc`).
 */
export type ClaimEventsResult = ClaimResult & {
  /** EN: Events in the order the SII listed them. ES: `listaEventosDoc` — Eventos en el orden en que los lista el SII. */
  readonly events: readonly ClaimEvent[]
}

/**
 * EN: `queryTransferable` result.
 * ES: Resultado de `queryTransferable` (`consultarDocDteCedible`).
 */
export type TransferabilityResult = ClaimResult & {
  /** EN: true (23, 25), false (20, 21, 24), null when undetermined. ES: `codResp` interpretado: true (23, 25), false (20, 21, 24), null si indeterminado. */
  readonly transferable: boolean | null
}

/**
 * EN: `queryReceptionDate` result.
 * ES: Resultado de `queryReceptionDate` (`consultarFechaRecepcionSii`).
 */
export type ReceptionDateResult = {
  /** EN: When the SII received the document as `YYYY-MM-DDTHH:MM:SS`, or null when the reply is empty or not a date. ES: Cuándo recibió el SII el documento (`AAAA-MM-DDTHH:MM:SS`), o null si la respuesta viene vacía o no es una fecha. */
  readonly receivedAt: string | null
  /** EN: The string the SII returned, as sent (`DD-MM-YYYY HH:MM:SS`). ES: El string que devolvió el SII, tal cual (`DD-MM-AAAA HH:MM:SS`). */
  readonly raw: string
}

/**
 * EN: Summary of what the receiver did with a document.
 * ES: Resumen de lo que hizo el receptor con un documento: aceptado, recibo de mercaderías, reclamado, nada, desconocido.
 */
export type ReceiverStatus = 'accepted' | 'goodsReceived' | 'claimed' | 'none' | 'unknown'

/**
 * EN: `receiverStatus` result.
 * ES: Resultado de `receiverStatus`.
 */
export type ReceiverStatusResult = {
  /** EN: What the receiver did, derived from the latest event. ES: Qué hizo el receptor, derivado del último evento (`codEvento`). */
  readonly status: ReceiverStatus
  /** EN: The latest event, or null when there are none. ES: `listaEventosDoc` — El último evento, o null si no hay. */
  readonly lastEvent: ClaimEvent | null
  /** EN: `codResp` of the events query. ES: `codResp` de la consulta de eventos. */
  readonly code: number
}

const documentParams = (input: ClaimDocumentInput): readonly SoapParam[] => {
  const issuer = splitSiiRut(toSiiRut(input.issuerRut, 'issuerRut'))
  if (!isClaimDocumentType(input.type)) throw new DteError('INVALID_DOCUMENT_TYPE', { type: input.type })
  if (!Number.isInteger(input.folio) || input.folio <= 0) throw new DteError('INVALID_FOLIO', { field: 'folio' })
  return [
    { name: 'rutEmisor', value: issuer.body },
    { name: 'dvEmisor', value: issuer.verifier },
    { name: 'tipoDoc', value: String(input.type) },
    { name: 'folio', value: String(input.folio) },
  ]
}

// One registry call. `read` turns the inner XML of `return` into the result and runs inside the attempt, so a reply it
// cannot read is `SII_RESPONSE_INVALID` and follows the retry rules of the operation. `writes` marks the operations
// that change state at the SII.
type ClaimCall<T> = {
  readonly operation: string
  readonly method: string
  readonly params: readonly SoapParam[]
  readonly read: (xml: string, operation: string) => T
  readonly writes: boolean
}

// `soapCall` looks at the HTTP status before it looks for a Fault. WSRECLAMO sends its faults on HTTP 500, so this
// module reads the Fault first, and only then classifies the status. 401 and 403 are the token being refused.
const attemptClaim = async <T>(
  sii: SiiClient,
  call: ClaimCall<T>,
  token: string,
  attempt: number,
  overrides?: CallOverrides,
): Promise<T> => {
  const { operation } = call
  const response = await send(sii, {
    operation,
    channel: 'soap',
    method: 'POST',
    url: sii.endpoints.claims,
    headers: { ...SOAP_HEADERS, Cookie: `TOKEN=${token}` },
    body: encodeUtf8(buildSoapEnvelope({ method: call.method, namespace: CLAIMS_NAMESPACE, params: call.params })),
    timeoutMs: timeoutFor(sii, 'soap', overrides),
    signal: overrides?.signal,
    attempt,
    requestEncoding: 'utf8',
    responseEncoding: 'utf8',
  })
  const text = decodeBody(response.body, 'utf8')
  if (response.status === 401 || response.status === 403)
    throw new DteError('SII_TOKEN_INVALID', { operation, channel: 'soap', httpStatus: response.status })
  const parsed = parseSoapResponse(text)
  if (parsed.fault !== null)
    throw new DteError('SII_SOAP_FAULT', {
      code: parsed.fault.code,
      reason: redactText(parsed.fault.reason),
      operation,
      httpStatus: response.status,
    })
  if (!isSuccess(response.status)) throw httpError(response, text, operation, 'soap', sii.endpoints.claims)
  if (parsed.returnXml === null) throw new DteError('SII_RESPONSE_INVALID', { operation, body: bodyExcerpt(text) })
  return call.read(parsed.returnXml, operation)
}

// A refused token renews once in `withToken`; the SII did not process that request. A call that writes is then sent
// again only while no SII response has arrived (`isNoAnswer`): after an answer, whatever it was, the claim may be
// registered already. A read-only call follows the normal retry policy.
const callClaims = <T>(sii: SiiClient, call: ClaimCall<T>, overrides?: CallOverrides): Promise<T> =>
  withToken(sii, 'soap', overrides, (token) =>
    withRetry(retryFor(sii, overrides), (attempt) => attemptClaim(sii, call, token, attempt, overrides), {
      ...retryOptions(sii, call.operation, overrides),
      retryOn: call.writes ? isNoAnswer : undefined,
    }),
  )

// Text of a child element: entities decoded, trimmed, empty when the element is missing.
const textOf = (xml: string, tag: string): string => decodeXmlEntities(extractTagContent(xml, tag) ?? '').trim()

const readResult = (xml: string, operation: string): ClaimResult => {
  const code = textOf(xml, 'codResp')
  if (!/^-?\d+$/.test(code)) throw new DteError('SII_RESPONSE_INVALID', { operation, body: bodyExcerpt(xml) })
  const value = Number(code)
  return { code: value, description: textOf(xml, 'descResp'), ok: value === 0, raw: xml }
}

// A RUT the SII sends is data, not input: one that does not validate is null, never an error. The parts are checked
// for presence first, because a missing check digit would otherwise be taken from the last digit of the body.
const rutOrNull = (body: string, verifier: string): SiiRut | null => {
  if (body === '' || verifier === '') return null
  try {
    return toSiiRut(`${body}-${verifier}`)
  } catch {
    return null
  }
}

const toEvent = (item: string): ClaimEvent => {
  const date = textOf(item, 'fechaEvento')
  return {
    code: textOf(item, 'codEvento'),
    description: textOf(item, 'descEvento'),
    responsibleRut: rutOrNull(textOf(item, 'rutResponsable'), textOf(item, 'dvResponsable')),
    date,
    dateIso: siiTimestampToIso(date),
  }
}

const readEvents = (xml: string): readonly ClaimEvent[] =>
  Array.from(xml.matchAll(/<listaEventosDoc>([\s\S]*?)<\/listaEventosDoc>/g), (match) => toEvent(match[1]))

/**
 * EN: Registers an action on a received document (`ingresarAceptacionReclamoDoc`): accept content, claim content,
 * acknowledge goods, claim partial or total shortfall. Business answers (already claimed, past 8 days…) come back as
 * `code`/`ok: false`, not as errors. This call changes state at the SII, so it is sent again only while no SII
 * response has arrived (connection failure, timeout); once the SII answered, whatever it said, it is never re-sent,
 * except once with a fresh token when the SII refused the token.
 * ES: Registra una acción sobre un documento recibido (`ingresarAceptacionReclamoDoc`): acepta contenido, reclama
 * contenido, otorga recibo de mercaderías, reclama falta parcial o total. Las respuestas de negocio (ya reclamado,
 * pasados 8 días…) vuelven como `code`/`ok: false`, no como errores. Esta llamada cambia el estado en el SII, así que
 * solo se reenvía mientras no haya llegado respuesta del SII (falla de conexión, timeout); una vez que el SII
 * respondió, diga lo que diga, no se vuelve a enviar, salvo una vez con un token nuevo cuando el SII rechazó el token.
 * @throws {DteError} EN: `INVALID_OPTION { field: 'action' }`, `INVALID_DOCUMENT_TYPE`, `INVALID_FOLIO`, `INVALID_RUT`, `SII_TOKEN_INVALID`, `SII_SOAP_FAULT`, `SII_HTTP_ERROR`, `SII_RESPONSE_INVALID`, transport codes. ES: los mismos códigos.
 */
export const registerClaim = async (
  sii: SiiClient,
  input: RegisterClaimInput,
  overrides?: CallOverrides,
): Promise<ClaimResult> => {
  if (!isClaimAction(input.action)) throw new DteError('INVALID_OPTION', { field: 'action' })
  const params = [...documentParams(input), { name: 'accionDoc', value: CLAIM_ACTIONS[input.action] }]
  return callClaims(
    sii,
    { operation: 'registerClaim', method: 'ingresarAceptacionReclamoDoc', params, read: readResult, writes: true },
    overrides,
  )
}

/**
 * EN: Events registered on a document (`listarEventosHistDoc`).
 * ES: Eventos registrados sobre un documento (`listarEventosHistDoc`).
 * @throws {DteError} EN: `INVALID_DOCUMENT_TYPE`, `INVALID_FOLIO`, `INVALID_RUT`, `SII_TOKEN_INVALID`, `SII_SOAP_FAULT`, `SII_HTTP_ERROR`, `SII_RESPONSE_INVALID`, transport codes. ES: los mismos códigos.
 */
export const listClaimEvents = async (
  sii: SiiClient,
  input: ClaimDocumentInput,
  overrides?: CallOverrides,
): Promise<ClaimEventsResult> =>
  callClaims(
    sii,
    {
      operation: 'listClaimEvents',
      method: 'listarEventosHistDoc',
      params: documentParams(input),
      read: (xml, operation) => ({ ...readResult(xml, operation), events: readEvents(xml) }),
      writes: false,
    },
    overrides,
  )

/**
 * EN: Whether a document is transferable (`consultarDocDteCedible`): `transferable` follows the 20–25 codes, null when undetermined.
 * ES: Si un documento es cedible (`consultarDocDteCedible`): `transferable` sigue los códigos 20–25, null si indeterminado.
 * @throws {DteError} EN: the codes of `listClaimEvents`. ES: los códigos de `listClaimEvents`.
 */
export const queryTransferable = async (
  sii: SiiClient,
  input: ClaimDocumentInput,
  overrides?: CallOverrides,
): Promise<TransferabilityResult> =>
  callClaims(
    sii,
    {
      operation: 'queryTransferable',
      method: 'consultarDocDteCedible',
      params: documentParams(input),
      read: (xml, operation) => {
        const result = readResult(xml, operation)
        return { ...result, transferable: transferabilityOf(result.code) }
      },
      writes: false,
    },
    overrides,
  )

/**
 * EN: When the SII received a document (`consultarFechaRecepcionSii`): the string it returned and that string as ISO
 * when it is a date (`DD-MM-YYYY HH:MM:SS`).
 * ES: Cuándo recibió el SII un documento (`consultarFechaRecepcionSii`): el string que devolvió y ese string en ISO
 * cuando es una fecha (`DD-MM-AAAA HH:MM:SS`).
 * @throws {DteError} EN: the codes of `listClaimEvents`. ES: los códigos de `listClaimEvents`.
 */
export const queryReceptionDate = async (
  sii: SiiClient,
  input: ClaimDocumentInput,
  overrides?: CallOverrides,
): Promise<ReceptionDateResult> =>
  callClaims(
    sii,
    {
      operation: 'queryReceptionDate',
      method: 'consultarFechaRecepcionSii',
      params: documentParams(input),
      read: (xml) => ({ receivedAt: siiTimestampToIso(xml), raw: xml }),
      writes: false,
    },
    overrides,
  )

const EVENT_STATUS: ReadonlyMap<string, ReceiverStatus> = new Map([
  ['ACD', 'accepted'],
  ['ERM', 'goodsReceived'],
  ['RCD', 'claimed'],
  ['RFP', 'claimed'],
  ['RFT', 'claimed'],
  ['NCA', 'none'],
  ['ENC', 'none'],
])
const NO_EVENT_CODES: readonly number[] = [15, 16, 18]

// The event with the highest ISO date; an event whose date does not parse sorts before any that does, and among equal
// dates (or no dates at all) the later one in the list wins.
const latestEvent = (events: readonly ClaimEvent[]): ClaimEvent =>
  events.reduce((latest, event) => ((event.dateIso ?? '') >= (latest.dateIso ?? '') ? event : latest))

/**
 * EN: What the receiver did, derived from the latest event of `listClaimEvents` (by date, else by position):
 * `accepted` (ACD), `goodsReceived` (ERM), `claimed` (RCD/RFP/RFT), `none` (no events, NCA/ENC), `unknown` otherwise.
 * No events means `none` for `codResp` 15, 16 and 18, and `unknown` for any other code.
 * ES: Qué hizo el receptor, derivado del último evento de `listClaimEvents` (por fecha, si no por posición):
 * `accepted` (ACD), `goodsReceived` (ERM), `claimed` (RCD/RFP/RFT), `none` (sin eventos, NCA/ENC), `unknown` en otro caso.
 * Sin eventos es `none` para `codResp` 15, 16 y 18, y `unknown` para cualquier otro código.
 * @throws {DteError} EN: the codes of `listClaimEvents`. ES: los códigos de `listClaimEvents`.
 */
export const receiverStatus = async (
  sii: SiiClient,
  input: ClaimDocumentInput,
  overrides?: CallOverrides,
): Promise<ReceiverStatusResult> => {
  const { code, events } = await listClaimEvents(sii, input, overrides)
  if (events.length === 0) return { status: NO_EVENT_CODES.includes(code) ? 'none' : 'unknown', lastEvent: null, code }
  const lastEvent = latestEvent(events)
  return { status: EVENT_STATUS.get(lastEvent.code) ?? 'unknown', lastEvent, code }
}

/**
 * EN: The receiver's answer to a document, Ley 19.983 included: `annulled` (a credit note annulled it, `NCA`),
 * `claimed` (`RCD`, `RFP`, `RFT`), `accepted` (`ACD`), `tacitlyAccepted` (eight calendar days after the SII received it
 * with none of those), `goodsReceived` (`ERM`, with the eight days still running), `pending`, or `unknown` (the events
 * query answered a `codResp` that lists nothing, so nothing can be said).
 * ES: La respuesta del receptor a un documento, con la Ley 19.983: `annulled` (una nota de crédito lo anuló, `NCA`),
 * `claimed` (`RCD`, `RFP`, `RFT`), `accepted` (`ACD`), `tacitlyAccepted` (ocho días corridos después de que el SII lo
 * recibió sin ninguno de esos), `goodsReceived` (`ERM`, con los ocho días aún corriendo), `pending`, o `unknown` (la
 * consulta de eventos respondió un `codResp` que no lista nada, así que nada puede decirse).
 */
export type ReceiverAnswer =
  | 'annulled'
  | 'claimed'
  | 'accepted'
  | 'tacitlyAccepted'
  | 'goodsReceived'
  | 'pending'
  | 'unknown'

/**
 * EN: `receiverAnswer` result.
 * ES: Resultado de `receiverAnswer`.
 */
export type ReceiverAnswerResult = {
  /** EN: The answer. ES: La respuesta. */
  readonly answer: ReceiverAnswer
  /** EN: Last day to claim, YYYY-MM-DD: the day of the SII reception plus eight; null without a reception date. ES: Último día para reclamar, AAAA-MM-DD: el día de la recepción en el SII más ocho; null sin fecha de recepción. */
  readonly claimDeadline: string | null
}

const CLAIMED: readonly string[] = ['RCD', 'RFP', 'RFT']
const CLAIM_DAYS = 8

/**
 * EN: The receiver's answer from the events of `listClaimEvents` and the reception date of `queryReceptionDate`, with
 * no request: `NCA` comes first, then a claim, then `ACD`; past the deadline with none of them the document is
 * accepted by law (Ley 19.983), and before it `ERM` is goods received and anything else pending. `PAG` and `ENC`
 * change nothing. Given the whole result of `listClaimEvents`, with no events and a `codResp` other than 15, 16 or 18
 * (the codes that list events or say there are none), the query failed and the answer is `unknown`, never pending or
 * tacitly accepted, as `receiverStatus` reads it. `receiverStatus` keeps reading the latest event only.
 * ES: La respuesta del receptor desde los eventos de `listClaimEvents` y la fecha de recepción de `queryReceptionDate`,
 * sin ninguna petición: primero `NCA`, luego un reclamo, luego `ACD`; pasado el plazo sin ninguno de ellos el documento
 * queda aceptado por ley (Ley 19.983), y antes de eso `ERM` es recibo de mercaderías y cualquier otra cosa pendiente.
 * `PAG` y `ENC` no cambian nada. Con el resultado completo de `listClaimEvents`, sin eventos y con un `codResp` distinto
 * de 15, 16 o 18 (los códigos que listan eventos o dicen que no hay), la consulta falló y la respuesta es `unknown`,
 * nunca pendiente ni aceptada tácitamente, como lo lee `receiverStatus`. `receiverStatus` sigue leyendo solo el último
 * evento.
 * @param events EN: the result of `listClaimEvents`, or its events alone, in any order; only the result can say the query failed. ES: el resultado de `listClaimEvents`, o solo sus eventos, en cualquier orden; solo el resultado puede decir que la consulta falló.
 * @param receivedAt EN: `receivedAt` of `queryReceptionDate` (its date is what counts), or null. ES: `receivedAt` de `queryReceptionDate` (cuenta su fecha), o null.
 * @param today EN: today in Chile, YYYY-MM-DD, as `chileDate()` gives it. ES: hoy en Chile, AAAA-MM-DD, como lo da `chileDate()`.
 * @returns EN: the answer and the deadline to claim. ES: la respuesta y el plazo para reclamar.
 * @throws {DteError} EN: `INVALID_DATE` when `today` is not a date. ES: `INVALID_DATE` si `today` no es una fecha.
 */
export const receiverAnswer = (
  listed:
    | readonly Pick<ClaimEvent, 'code'>[]
    | { readonly code: number; readonly events: readonly Pick<ClaimEvent, 'code'>[] },
  receivedAt: string | null,
  today: string,
): ReceiverAnswerResult => {
  const events = 'events' in listed ? listed.events : listed
  const failed = 'events' in listed && events.length === 0 && !NO_EVENT_CODES.includes(listed.code)
  const day = toIsoDate(today, 'today')
  const received = /^(\d{4})-(\d{2})-(\d{2})/.exec(receivedAt ?? '')
  const claimDeadline =
    received === null
      ? null
      : new Date(Date.UTC(Number(received[1]), Number(received[2]) - 1, Number(received[3]) + CLAIM_DAYS))
          .toISOString()
          .slice(0, 10)
  const has = (codes: readonly string[]): boolean => events.some((event) => codes.includes(event.code))
  const answer: ReceiverAnswer = failed
    ? 'unknown'
    : has(['NCA'])
      ? 'annulled'
      : has(CLAIMED)
        ? 'claimed'
        : has(['ACD'])
          ? 'accepted'
          : claimDeadline !== null && day > claimDeadline
            ? 'tacitlyAccepted'
            : has(['ERM'])
              ? 'goodsReceived'
              : 'pending'
  return { answer, claimDeadline }
}
