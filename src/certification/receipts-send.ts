import { createFolioConsumption, signFolioConsumption } from '../books/folio-consumption'
import type { SignedEnvelope } from '../envelope/sign'
import { DteError, errorMessage } from '../errors'
import type { FolioConsumptionEntry } from '../model/book'
import type { SiiClient } from '../sii/client'
import { queryUploadStatus, type UploadStatus } from '../sii/status'
import { uploadEnvelope, uploadFolioConsumption } from '../sii/upload'
import { parseXmlWithoutNamespaces } from '../xml/parse'

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
 * EN: What `sendReceiptsSet` did. `sent` is the envelope uploaded and not rejected, whatever became of the report:
 * the SII's objections to the report are expected in certification and block nothing.
 * ES: Lo que hizo `sendReceiptsSet`. `sent` es el sobre subido y no rechazado, sea cual sea la suerte del reporte: los
 * reparos del SII al reporte son esperables en certificación y no bloquean nada.
 */
export type ReceiptsSendResult = {
  /** EN: How it ended. ES: Cómo terminó. */
  readonly outcome: 'sent' | 'envelopeRejected' | 'consumptionFailed'
  /** EN: The SII's gloss or the error speaks of authorisation or signing: the company cannot sign receipts yet. ES: La glosa del SII o el error habla de autorización o firma: la empresa aún no puede firmar boletas. */
  readonly notAuthorized: boolean
  /** EN: The envelope's track id, to declare on the receipts portal. ES: El track id del sobre, para declararlo en el portal de boletas. */
  readonly envelopeTrackId: string
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

const consumptionXml = (sii: SiiClient, envelope: ReceiptsEnvelope, sequence: number): string =>
  signFolioConsumption(
    createFolioConsumption({
      cover: {
        issuerRut: envelope.issuerRut,
        senderRut: envelope.senderRut,
        resolutionDate: envelope.resolutionDate,
        resolutionNumber: envelope.resolutionNumber,
        sequence,
      },
      entries: envelope.entries,
      now: sii.now(),
    }),
    sii.certificate,
  ).xml

// A status query that does not answer blocks nothing: the field goes on as if the upload were fine.
const statusOf = async (sii: SiiClient, trackId: string): Promise<UploadStatus | null> => {
  try {
    return await queryUploadStatus(sii, { trackId })
  } catch (error) {
    sii.logger.warn('receipts status query failed', { trackId, reason: errorMessage(error) })
    return null
  }
}

const glossOf = (status: UploadStatus): string => `${status.message} (${status.code})`

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
    const receipt = await uploadFolioConsumption(sii, { xml }).catch((error: unknown) => errorMessage(error))
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
    if (receipt.duplicate) {
      box.duplicates += 1
      consumptions.push({ sequence, xml, trackId: receipt.trackId, outcome: 'duplicate' })
      // The certification environment takes one report per company per day: three in a row say it has today's.
      if (box.duplicates >= MAX_CONSECUTIVE_DUPLICATES)
        return { ...NO_CONSUMPTION, outcome: 'sent', consumptionAlreadySent: true, consumptions }
      continue
    }
    box.duplicates = 0
    await sleep(CONSUMPTION_WAIT_MS)
    const status = await statusOf(sii, receipt.trackId)
    if (status === null || status.status !== 'rejected') {
      consumptions.push({ sequence, xml, trackId: receipt.trackId, outcome: 'accepted' })
      return {
        ...NO_CONSUMPTION,
        outcome: 'sent',
        consumptionTrackId: receipt.trackId,
        consumptionSequence: sequence,
        consumptions,
      }
    }
    const detail = glossOf(status)
    consumptions.push({ sequence, xml, trackId: receipt.trackId, outcome: 'rejected', detail })
    if (AUTHORIZATION_WORDS.test(status.message))
      return { ...NO_CONSUMPTION, outcome: 'consumptionFailed', notAuthorized: true, consumptions, detail }
  }
  sii.logger.warn('receipts folio consumption not accepted', { attempts: MAX_CONSUMPTION_ATTEMPTS })
  return { ...NO_CONSUMPTION, outcome: 'sent', consumptions }
}

/**
 * EN: Sends the receipts set as the field does: uploads the envelope (one the SII already has carries on with the
 * track id the SII names), waits 20 s and reads its status (a rejection ends here; a status that does not answer is
 * logged), then sends the folio consumption report built from the envelope, with the sequence number `sequence` plus
 * the attempt, up to ten attempts: three duplicates in a row mean today's report was already accepted; an uploaded
 * report is given 30 s and its status read; a rejection tries the next sequence number, unless its gloss speaks of
 * authorisation or signing. Ten attempts without an accepted report still end in `sent`.
 * ES: Envía el set de boletas como lo hace el campo: sube el sobre (uno que el SII ya tiene sigue con el track id que
 * nombra el SII), espera 20 s y lee su estado (un rechazo termina aquí; un estado que no responde se registra), y luego
 * envía el reporte de consumo de folios armado desde el sobre, con la secuencia `sequence` más el intento, hasta diez
 * intentos: tres duplicados seguidos significan que el reporte de hoy ya se aceptó; a un reporte subido se le dan 30 s
 * y se lee su estado; un rechazo prueba la secuencia siguiente, salvo que su glosa hable de autorización o firma. Diez
 * intentos sin reporte aceptado terminan igual en `sent`.
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
  const upload = await uploadEnvelope(sii, { envelope: issued.envelope })
  const sent = { envelopeTrackId: upload.trackId, envelopeDuplicate: upload.duplicate }
  if (!upload.duplicate) {
    options.onProgress?.({ step: 'BOLETA_SOAP_CHECK' })
    await sleep(ENVELOPE_WAIT_MS)
    const status = await statusOf(sii, upload.trackId)
    if (status !== null && status.status === 'rejected')
      return {
        ...NO_CONSUMPTION,
        ...sent,
        outcome: 'envelopeRejected',
        notAuthorized: AUTHORIZATION_WORDS.test(status.message),
        consumptions: [],
        detail: glossOf(status),
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
