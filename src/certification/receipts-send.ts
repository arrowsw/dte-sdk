import { createFolioConsumption, signFolioConsumption } from '../books/folio-consumption'
import type { SignedEnvelope } from '../envelope/sign'
import { receptionStatusMessage } from '../catalogs/reception-status'
import { DteError, errorMessage, isDteError } from '../errors'
import type { FolioConsumptionEntry } from '../model/book'
import type { SiiClient } from '../sii/client'
import { parseReceptionResponse, uploadEnvelope, uploadFolioConsumption, type UploadReceipt } from '../sii/upload'
import { parseXmlWithoutNamespaces } from '../xml/parse'
import { queryFieldUploadState, type FieldUploadState } from './field-status'

const ENVELOPE_WAIT_MS = 20000
const CONSUMPTION_WAIT_MS = 30000
const MAX_CONSUMPTION_ATTEMPTS = 10
const MAX_CONSECUTIVE_DUPLICATES = 3
const DEFAULT_SEQUENCE = 100
const AUTHORIZATION_WORDS = /autorizado|autorizar|firmar|permiso/i

/**
 * EN: The progress events of `sendReceiptsSet`, with the field's step names.
 * ES: Los eventos de progreso de `sendReceiptsSet`, con los nombres de paso del campo.
 */
export type ReceiptsProgressEvent = { readonly step: 'BOLETA_SOAP_CHECK' } | { readonly step: 'BOLETA_RCOF' }

/**
 * EN: Options of `sendReceiptsSet`.
 * ES: Opciones de `sendReceiptsSet`.
 */
export type SendReceiptsSetOptions = {
  /** EN: The sequence number of the first folio consumption report; 100 by default, and each attempt adds one. ES: `SecEnvio` — La secuencia del primer reporte de consumo de folios; 100 por defecto, y cada intento suma uno. */
  readonly sequence?: number
  /** EN: Wait function; the client's by default. ES: Función de espera; por defecto la del cliente. */
  readonly sleep?: (ms: number) => Promise<void>
  /** EN: Progress events. ES: Eventos de progreso. */
  readonly onProgress?: (event: ReceiptsProgressEvent) => void
}

/**
 * EN: One folio consumption report tried.
 * ES: Un reporte de consumo de folios intentado.
 */
export type ReceiptsConsumptionAttempt = {
  /** EN: Its sequence number. ES: `SecEnvio` — Su secuencia de envío. */
  readonly sequence: number
  /** EN: The signed report. ES: `ConsumoFolios` — El reporte firmado. */
  readonly xml: string
  /** EN: Its track id, or null when the upload failed. ES: Su track id, o null si la subida falló. */
  readonly trackId: string | null
  /** EN: What happened: accepted (or still in process, or its status did not answer), a duplicate, rejected, or the upload failed. ES: Qué pasó: aceptado (o aún en proceso, o su estado no respondió), duplicado, rechazado, o la subida falló. */
  readonly outcome: 'accepted' | 'duplicate' | 'rejected' | 'failed'
  /** EN: The SII's gloss or the error, when there is one. ES: La glosa del SII o el error, cuando lo hay. */
  readonly detail?: string
}

/**
 * EN: What `sendReceiptsSet` did. `sent` is the envelope uploaded and not rejected, with its report accepted, already
 * sent today or objected to: the SII's objections to the report are expected in certification and block nothing.
 * `consumptionFailed` is a report that could not be uploaded, or one refused for lack of authorisation.
 * ES: Lo que hizo `sendReceiptsSet`. `sent` es el sobre subido y no rechazado, con su reporte aceptado, ya enviado hoy
 * o con reparos: los reparos del SII al reporte son esperables en certificación y no bloquean nada.
 * `consumptionFailed` es un reporte que no se pudo subir, o uno rechazado por falta de autorización.
 */
export type ReceiptsSendResult = {
  /** EN: How it ended. ES: Cómo terminó. */
  readonly outcome: 'sent' | 'envelopeRejected' | 'consumptionFailed'
  /** EN: The SII's gloss or the error speaks of authorisation or signing: the company cannot sign receipts yet. ES: La glosa del SII o el error habla de autorización o firma: la empresa aún no puede firmar boletas. */
  readonly notAuthorized: boolean
  /** EN: The envelope's track id, to declare on the receipts portal; null when the SII already had the envelope and named none. ES: `TrackId` — El track id del sobre, para declararlo en el portal de boletas; null cuando el SII ya tenía el sobre y no nombró ninguno. */
  readonly envelopeTrackId: string | null
  /** EN: The SII already had the envelope. ES: El SII ya tenía el sobre. */
  readonly envelopeDuplicate: boolean
  /** EN: The accepted report's track id, or null. ES: El track id del reporte aceptado, o null. */
  readonly consumptionTrackId: string | null
  /** EN: The accepted report's sequence number, or null. ES: `SecEnvio` del reporte aceptado, o null. */
  readonly consumptionSequence: number | null
  /** EN: Three reports in a row were duplicates: one was already accepted today. ES: Tres reportes seguidos fueron duplicados: ya se aceptó uno hoy. */
  readonly consumptionAlreadySent: boolean
  /** EN: Every report tried, in order. ES: Cada reporte intentado, en orden. */
  readonly consumptions: readonly ReceiptsConsumptionAttempt[]
  /** EN: The gloss or error that ended it, when it did not end in `sent`. ES: La glosa o el error que lo terminó, cuando no terminó en `sent`. */
  readonly detail?: string
}

type Node = Readonly<Record<string, unknown>>

const nodeOf = (value: unknown): Node | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Node) : null

const textOf = (node: Node | null, key: string): string | undefined => {
  const value = node?.[key]
  return typeof value === 'string' ? value : undefined
}

const required = (node: Node | null, key: string): string => {
  const value = textOf(node, key)
  if (value === undefined) throw new DteError('MISSING_FIELD', { field: key })
  return value
}

const amountOf = (node: Node | null, key: string): number | undefined => {
  const value = textOf(node, key)
  return value === undefined ? undefined : Number(value)
}

const compact = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T

type ReceiptsEnvelope = {
  readonly issuerRut: string
  readonly senderRut: string
  readonly resolutionDate: string
  readonly resolutionNumber: number
  readonly entries: readonly FolioConsumptionEntry[]
}

// The report is built from the envelope as it was signed: its cover and, per receipt, the totals the document holds.
const readReceiptsEnvelope = (xml: string): ReceiptsEnvelope => {
  const set = nodeOf(nodeOf(parseXmlWithoutNamespaces(xml)['EnvioBOLETA'])?.['SetDTE'])
  const cover = nodeOf(set?.['Caratula'])
  const documents = set?.['DTE']
  const entries = (Array.isArray(documents) ? documents : documents === undefined ? [] : [documents]).map(
    (dte): FolioConsumptionEntry => {
      const header = nodeOf(nodeOf(nodeOf(dte)?.['Documento'])?.['Encabezado'])
      const id = nodeOf(header?.['IdDoc'])
      const totals = nodeOf(header?.['Totales'])
      return compact({
        type: Number(textOf(id, 'TipoDTE')) as FolioConsumptionEntry['type'],
        folio: Number(textOf(id, 'Folio')),
        issueDate: textOf(id, 'FchEmis'),
        netAmount: amountOf(totals, 'MntNeto'),
        vatAmount: amountOf(totals, 'IVA'),
        exemptAmount: amountOf(totals, 'MntExe'),
        totalAmount: amountOf(totals, 'MntTotal') ?? 0,
      })
    },
  )
  if (entries.length === 0) throw new DteError('ENVELOPE_EMPTY', { field: 'DTE' })
  return {
    issuerRut: required(cover, 'RutEmisor'),
    senderRut: required(cover, 'RutEnvia'),
    resolutionDate: required(cover, 'FchResol'),
    resolutionNumber: Number(required(cover, 'NroResol')),
    entries,
  }
}

// The id of a report is the issuer RUT without its hyphen and the milliseconds of the clock, as the field names it.
const consumptionXml = (sii: SiiClient, envelope: ReceiptsEnvelope, sequence: number): string => {
  const now = sii.now()
  return signFolioConsumption(
    createFolioConsumption({
      id: `RCOF_${envelope.issuerRut.replace('-', '')}_${now.getTime()}`,
      cover: {
        issuerRut: envelope.issuerRut,
        senderRut: envelope.senderRut,
        resolutionDate: envelope.resolutionDate,
        resolutionNumber: envelope.resolutionNumber,
        sequence,
      },
      entries: envelope.entries,
      now,
    }),
    sii.certificate,
  ).xml
}

// A status query that never got through blocks nothing: the field goes on as if the upload were fine. An answer
// without a state is not that: it is read by the caller as the field reads it.
const stateOf = async (sii: SiiClient, trackId: string): Promise<FieldUploadState | null> => {
  try {
    return await queryFieldUploadState(sii, trackId)
  } catch (error) {
    sii.logger.warn('receipts status query failed', { trackId, reason: errorMessage(error) })
    return null
  }
}

// The gloss as the SII wrote it in its answer (not the catalog's text for the state), else the state code.
const GLOSS_ELEMENT = /<GLOSA>([^<]+)<\/GLOSA>/i
const glossOf = (state: FieldUploadState): string => GLOSS_ELEMENT.exec(state.raw ?? '')?.[1] ?? state.code ?? ''

const detailOf = (state: FieldUploadState): string =>
  state.answered ? `${glossOf(state)} (${state.code})` : `${state.message}`

// What the field makes of the reception of a file: it has a track id, or it is a duplicate the SII names no track id
// for. `duplicate` also marks a track id taken from a duplicate reply.
type FieldReception = { readonly trackId: string | null; readonly duplicate: boolean }

const TRACK_ID_ELEMENT = /<TRACKID>(\d+)<\/TRACKID>/i
// The first error line of a `STATUS` 7 says whether it is a real charset or schema refusal.
const REFUSAL_DETAIL = /CHR-00001|SCH-00001|cvc-/

// `STATUS` 7 is a duplicate unless its first error line names a refusal; with a `TRACKID` element the track id is
// recovered and the upload goes on as a sent one, without it the SII named none.
const readStatusSeven = (errors: readonly string[], trackId: string | undefined): FieldReception | null =>
  REFUSAL_DETAIL.test(errors[0] ?? '') ? null : { trackId: trackId ?? null, duplicate: true }

// The upload client reads more replies as duplicates than the field does, so the reply is read again as the field
// reads it: only `STATUS` 0 with a `TRACKID` element is a sent file, `STATUS` 7 a duplicate, and `STATUS` 99 and
// anything else a refusal.
const fieldReception = async (upload: () => Promise<UploadReceipt>, operation: string): Promise<FieldReception> => {
  let receipt: UploadReceipt
  try {
    receipt = await upload()
  } catch (error) {
    // A `STATUS` 7 the client refused is still a duplicate, or a sent file, for the field, which reads only the first
    // error line and the `TRACKID` element.
    const reading =
      isDteError(error) && error.code === 'SII_UPLOAD_REJECTED' && error.details.status === 7
        ? readStatusSeven(
            error.details.errors as readonly string[],
            (error.details.trackIdElement as string | null) ?? undefined,
          )
        : null
    if (reading === null) throw error
    return reading
  }
  const { status, errors } = parseReceptionResponse(receipt.raw, operation)
  const trackId = TRACK_ID_ELEMENT.exec(receipt.raw)?.[1]
  const reading =
    status === '7'
      ? readStatusSeven(errors, trackId)
      : status === '0' && trackId !== undefined
        ? { trackId, duplicate: false }
        : null
  if (reading === null)
    throw new DteError('SII_UPLOAD_REJECTED', {
      status: Number(status),
      errors,
      fileName: receipt.fileName,
      operation,
      message: receptionStatusMessage(status),
    })
  return reading
}

type ConsumptionPart = Pick<
  ReceiptsSendResult,
  | 'outcome'
  | 'notAuthorized'
  | 'consumptionTrackId'
  | 'consumptionSequence'
  | 'consumptionAlreadySent'
  | 'consumptions'
  | 'detail'
>

const NO_CONSUMPTION = {
  notAuthorized: false,
  consumptionTrackId: null,
  consumptionSequence: null,
  consumptionAlreadySent: false,
} as const

const sendConsumption = async (
  sii: SiiClient,
  envelope: ReceiptsEnvelope,
  start: number,
  sleep: (ms: number) => Promise<void>,
): Promise<ConsumptionPart> => {
  const consumptions: ReceiptsConsumptionAttempt[] = []
  const box = { duplicates: 0 }
  for (let attempt = 0; attempt < MAX_CONSUMPTION_ATTEMPTS; attempt += 1) {
    const sequence = start + attempt
    const xml = consumptionXml(sii, envelope, sequence)
    const receipt = await fieldReception(() => uploadFolioConsumption(sii, { xml }), 'uploadFolioConsumption').catch(
      (error: unknown) => errorMessage(error),
    )
    if (typeof receipt === 'string') {
      consumptions.push({ sequence, xml, trackId: null, outcome: 'failed', detail: receipt })
      return {
        ...NO_CONSUMPTION,
        outcome: 'consumptionFailed',
        notAuthorized: AUTHORIZATION_WORDS.test(receipt),
        consumptions,
        detail: receipt,
      }
    }
    if (receipt.trackId === null) {
      box.duplicates += 1
      consumptions.push({ sequence, xml, trackId: null, outcome: 'duplicate' })
      // The certification environment takes one report per company per day: three in a row say it has today's.
      if (box.duplicates >= MAX_CONSECUTIVE_DUPLICATES)
        return { ...NO_CONSUMPTION, outcome: 'sent', consumptionAlreadySent: true, consumptions }
      continue
    }
    box.duplicates = 0
    await sleep(CONSUMPTION_WAIT_MS)
    const state = await stateOf(sii, receipt.trackId)
    // A query that never got through counts as accepted; an answer without a state, or with one the table does not
    // know, counts as a rejection, as the field reads it.
    if (state === null || state.successful || state.intermediate) {
      consumptions.push({ sequence, xml, trackId: receipt.trackId, outcome: 'accepted' })
      return {
        ...NO_CONSUMPTION,
        outcome: 'sent',
        consumptionTrackId: receipt.trackId,
        consumptionSequence: sequence,
        consumptions,
      }
    }
    const detail = detailOf(state)
    consumptions.push({ sequence, xml, trackId: receipt.trackId, outcome: 'rejected', detail })
    if (AUTHORIZATION_WORDS.test(glossOf(state)))
      return { ...NO_CONSUMPTION, outcome: 'consumptionFailed', notAuthorized: true, consumptions, detail }
  }
  sii.logger.warn('receipts folio consumption not accepted', { attempts: MAX_CONSUMPTION_ATTEMPTS })
  return { ...NO_CONSUMPTION, outcome: 'sent', consumptions }
}

/**
 * EN: Sends the receipts set as the field does: uploads the envelope and reads the reply as the field reads it
 * (`STATUS` 0 with a track id is sent; `STATUS` 7 with a track id is also taken as sent, and without one it is a
 * duplicate that skips to the report with no track id; `STATUS` 99 and any other reply is a failure and throws), waits
 * 20 s and reads the status of a sent envelope once (a rejection ends here; a query that never got through is logged,
 * and an answer without a state, or an unknown one, blocks nothing), then sends the folio consumption report built
 * from the envelope, with the sequence number `sequence` plus the attempt, up to ten attempts: a `STATUS` 7 without a
 * track id is a duplicate and three in a row mean today's report was already accepted; a `STATUS` 99 or another
 * refusal ends it as `consumptionFailed`; an uploaded report is given 30 s and its status read once: a success or an
 * intermediate state (a query error code or `0` too) accepts it, a query that never got through accepts it, and
 * anything else (a rejection, no state, an unknown state) tries the next sequence number, unless its gloss speaks of
 * authorisation or signing. Ten attempts without an accepted report still end in `sent`.
 * ES: Envía el set de boletas como lo hace el campo: sube el sobre y lee la respuesta como la lee el campo (`STATUS` 0
 * con track id es enviado; `STATUS` 7 con track id también se toma como enviado, y sin él es un duplicado que salta al
 * reporte sin track id; `STATUS` 99 y cualquier otra respuesta es una falla y lanza), espera 20 s y lee una vez el
 * estado de un sobre enviado (un rechazo termina aquí; una consulta que nunca llegó se registra, y una respuesta sin
 * estado, o con uno desconocido, no bloquea nada), y luego envía el reporte de consumo de folios armado desde el
 * sobre, con la secuencia `sequence` más el intento, hasta diez intentos: un `STATUS` 7 sin track id es un duplicado y
 * tres seguidos significan que el reporte de hoy ya se aceptó; un `STATUS` 99 u otro rechazo lo termina como
 * `consumptionFailed`; a un reporte subido se le dan 30 s y se lee su estado una vez: un éxito o un estado intermedio
 * (también un código de error de la consulta o `0`) lo acepta, una consulta que nunca llegó lo acepta, y cualquier
 * otra cosa (un rechazo, ningún estado, un estado desconocido) prueba la secuencia siguiente, salvo que su glosa hable
 * de autorización o firma. Diez intentos sin reporte aceptado terminan igual en `sent`.
 * @param sii EN: the phase 2 client on the certification environment. ES: el cliente de la fase 2 en el ambiente de certificación.
 * @param issued EN: the set of `issueReceiptsSet`, or anything with its signed envelope. ES: el set de `issueReceiptsSet`, o cualquier cosa con su sobre firmado.
 * @param options EN: the first sequence number, the wait function, the progress events. ES: la primera secuencia, la función de espera, los eventos de progreso.
 * @throws {DteError} EN: the phase 2 codes of the envelope upload; `ENVELOPE_EMPTY` for an envelope without receipts; `MISSING_FIELD` for a cover without its issuer, sender or resolution. ES: los códigos de la fase 2 de la subida del sobre; `ENVELOPE_EMPTY` por un sobre sin boletas; `MISSING_FIELD` por una carátula sin emisor, enviador o resolución.
 */
export const sendReceiptsSet = async (
  sii: SiiClient,
  issued: { readonly envelope: SignedEnvelope },
  options: SendReceiptsSetOptions = {},
): Promise<ReceiptsSendResult> => {
  const sleep = options.sleep ?? ((ms: number) => sii.sleep(ms))
  const envelope = readReceiptsEnvelope(issued.envelope.xml)
  const upload = await fieldReception(
    () => uploadEnvelope(sii, { envelope: issued.envelope, channel: 'soap' }),
    'uploadEnvelope',
  )
  const sent = { envelopeTrackId: upload.trackId, envelopeDuplicate: upload.duplicate }
  if (upload.trackId !== null) {
    options.onProgress?.({ step: 'BOLETA_SOAP_CHECK' })
    await sleep(ENVELOPE_WAIT_MS)
    const state = await stateOf(sii, upload.trackId)
    if (state !== null && state.rejected)
      return {
        ...NO_CONSUMPTION,
        ...sent,
        outcome: 'envelopeRejected',
        notAuthorized: AUTHORIZATION_WORDS.test(glossOf(state)),
        consumptions: [],
        detail: detailOf(state),
      }
  }
  options.onProgress?.({ step: 'BOLETA_RCOF' })
  return { ...sent, ...(await sendConsumption(sii, envelope, options.sequence ?? DEFAULT_SEQUENCE, sleep)) }
}

/**
 * EN: Input of `resendReceiptsConsumption`.
 * ES: Entrada de `resendReceiptsConsumption`.
 */
export type ResendReceiptsConsumptionInput = {
  /** EN: The receipts envelope as it was sent. ES: `EnvioBOLETA` — El sobre de boletas tal como se envió. */
  readonly envelopeXml: string
  /** EN: The sequence number of the report. ES: `SecEnvio` — La secuencia del reporte. */
  readonly sequence: number
}

/**
 * EN: Builds the folio consumption report again from a receipts envelope already sent and uploads it once, with the
 * sequence number given.
 * ES: Arma de nuevo el reporte de consumo de folios desde un sobre de boletas ya enviado y lo sube una vez, con la
 * secuencia dada.
 * @throws {DteError} EN: `ENVELOPE_EMPTY`, `MISSING_FIELD` for an incomplete cover; the phase 2 codes of the upload. ES: `ENVELOPE_EMPTY`, `MISSING_FIELD` por una carátula incompleta; los códigos de la fase 2 de la subida.
 */
export const resendReceiptsConsumption = async (
  sii: SiiClient,
  input: ResendReceiptsConsumptionInput,
): Promise<{
  readonly sequence: number
  readonly xml: string
  readonly trackId: string
  readonly duplicate: boolean
}> => {
  const xml = consumptionXml(sii, readReceiptsEnvelope(input.envelopeXml), input.sequence)
  const receipt = await uploadFolioConsumption(sii, { xml })
  return { sequence: input.sequence, xml, trackId: receipt.trackId, duplicate: receipt.duplicate }
}
