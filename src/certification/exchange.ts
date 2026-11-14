import { EXCHANGE_ANSWER_FILES } from '../catalogs/certification'
import type { Certificate } from '../certificate/certificate'
import { DteError } from '../errors'
import { toSiiRut } from '../model/rut'
import { createGoodsReceipts, createReceptionAnswer, createResultAnswer, type AnswerContact } from '../document/answer'
import type { ReceivedEnvelope, ReceivedEnvelopeDocument } from '../document/received-envelope'
import { parseXmlLoosely } from '../xml/parse'

const ENVELOPE_ROOTS = ['EnvioDTE', 'EnvioDTEB', 'EnvioDTETraslado', 'EnvioBOLETA'] as const
const DEFAULT_SET_ID = 'SetDTE'

// The certification's answers, word for word: a document whose receiver is the company is received and accepted, any
// other is "error en RUT receptor" and rejected with `CodRchDsc` -1.
const ENVELOPE_RECEIVED = { state: 0, gloss: 'Envío recibido conforme.' } as const
const DOCUMENT_RECEIVED = { state: 0, gloss: 'DTE Recibido OK.' } as const
const DOCUMENT_WRONG_RECEIVER = { state: 3, gloss: 'DTE No Recibido - Error en RUT Receptor.' } as const
const DOCUMENT_ACCEPTED = { state: 0, gloss: 'DTE Aceptado OK' } as const
const DOCUMENT_REJECTED = { state: 2, gloss: 'DTE Rechazado', rejectionCode: -1 } as const

/**
 * EN: One document of the exchange set, as the answers describe it: a `ReceivedEnvelopeDocument`.
 * ES: Un documento del set de intercambio, como lo describen las respuestas: un `ReceivedEnvelopeDocument`.
 */
export type ExchangeDocument = ReceivedEnvelopeDocument

/**
 * EN: The exchange set the SII sends: its id, its cover and its documents; a `ReceivedEnvelope`.
 * ES: El set de intercambio que envía el SII: su id, su carátula y sus documentos; un `ReceivedEnvelope`.
 */
export type ExchangeSet = ReceivedEnvelope

/**
 * EN: The contact the answers name, every field optional: an `AnswerContact`. The phone goes in the receipts only.
 * ES: El contacto que nombran las respuestas, cada campo opcional: un `AnswerContact`. El teléfono va solo en los recibos.
 */
export type ExchangeContact = AnswerContact

/**
 * EN: Input of `createExchangeAnswers`.
 * ES: Entrada de `createExchangeAnswers`.
 */
export type CreateExchangeAnswersInput = {
  /** EN: The company that answers: the receiver the SII expects on every document. ES: `RutResponde` — La empresa que responde: el receptor que el SII espera en cada documento. */
  readonly companyRut: string
  /** EN: The signing certificate; its holder signs the receipts. ES: `RutFirma` — El certificado firmante; su titular firma los recibos. */
  readonly certificate: Pick<Certificate, 'privateKeyPem' | 'publicKey' | 'certificateBase64' | 'rut'>
  /** EN: The contact, when any. ES: El contacto, si hay. */
  readonly contact?: ExchangeContact
  /** EN: The clock; now by default. ES: El reloj; por defecto ahora. */
  readonly now?: Date
}

/**
 * EN: One answer, ready to upload.
 * ES: Una respuesta, lista para subir.
 */
export type ExchangeAnswer = {
  /** EN: The file name the portal's upload expects. ES: El nombre de archivo que espera la subida del portal. */
  readonly fileName: string
  /** EN: The signed XML, one line, UTF-8, no declaration. ES: El XML firmado, una línea, UTF-8, sin declaración. */
  readonly xml: string
}

/**
 * EN: The three answers of the exchange and the set they answer.
 * ES: Las tres respuestas del intercambio y el set que responden.
 */
export type ExchangeAnswers = {
  /** EN: The reception response. ES: `RespuestaDTE/Resultado/RecepcionEnvio` — La respuesta de recepción. */
  readonly reception: ExchangeAnswer
  /** EN: The receipts. ES: `EnvioRecibos` — Los recibos. */
  readonly receipts: ExchangeAnswer
  /** EN: The commercial approval. ES: `RespuestaDTE/Resultado/ResultadoDTE` — La aprobación comercial. */
  readonly approval: ExchangeAnswer
  /** EN: The set as parsed. ES: El set tal como se leyó. */
  readonly set: ExchangeSet
}

type Node = Readonly<Record<string, unknown>>

const nodeOf = (value: unknown): Node | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Node) : null

// The loose parser hands a number for a text that reads as one; both are what the element says.
type Scalar = string | number

const scalarOf = (node: Node | null, key: string): Scalar | null => {
  const value = node?.[key]
  return typeof value === 'string' || typeof value === 'number' ? value : null
}

const listOf = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : value === undefined ? [] : [value]

// The first of these that the set really gives, the way its fields chain: an absent element, an empty one and a zero
// all count as not given.
const firstOf = (...values: readonly (Scalar | null)[]): string | null => {
  const given = values.find((value) => value !== null && value !== '' && value !== 0)
  return given === undefined ? null : String(given)
}

// A number the set writes loosely reads as its leading digits, and as 0 when it has none.
const looseInteger = (value: Scalar | null): number => Number.parseInt(String(value ?? ''), 10) || 0

// The RUTs of the set are the SII's: they are not validated, as the SII's own test companies need (so rut.ts has
// nothing to say here); only the dots go and the verifier letter is upper-cased.
const setRut = (value: string | null): string => (value === null ? '' : value.replace(/\./g, '').toUpperCase())

const optionalSetRut = (value: Scalar | null): string | null => {
  const rut = firstOf(value)
  return rut === null ? null : setRut(rut)
}

const documentOf = (dte: Node | null, coverIssuer: string, coverReceiver: string | null): ExchangeDocument => {
  // Only a plain `Documento` is read, or one nested inside a second `DTE`; any other kind of document reads as empty.
  const document = nodeOf(dte?.['Documento']) ?? nodeOf(nodeOf(dte?.['DTE'])?.['Documento'])
  const header = nodeOf(document?.['Encabezado'])
  const idDoc = nodeOf(header?.['IdDoc'])
  const issuer = nodeOf(header?.['Emisor'])
  const receiver = nodeOf(header?.['Receptor'])
  const coverIssuerRut = coverIssuer === '' ? null : coverIssuer
  return {
    type: looseInteger(scalarOf(idDoc, 'TipoDTE') ?? scalarOf(idDoc, 'TpoDoc')),
    folio: looseInteger(scalarOf(idDoc, 'Folio')),
    issueDate: firstOf(scalarOf(idDoc, 'FchEmis')),
    issuerRut: setRut(firstOf(scalarOf(issuer, 'RUTEmisor'), scalarOf(issuer, 'RutEmisor'), coverIssuerRut)),
    receiverRut: setRut(firstOf(scalarOf(receiver, 'RUTRecep'), scalarOf(receiver, 'RutRecep'), coverReceiver)),
    total: looseInteger(scalarOf(nodeOf(header?.['Totales']), 'MntTotal')),
  }
}

/**
 * EN: Reads the exchange set the SII serves in the certification the way the field's reader does, loosely: the XML is
 * not checked for well-formedness and its tags are read by their full name, so a prefixed envelope is no envelope; the
 * root is `EnvioDTE`, `EnvioDTEB`, `EnvioDTETraslado` or `EnvioBOLETA`; the set id (the `ID` attribute, else an `ID`
 * child, else `SetDTE`), the cover's RUTs and, per document, its type (`TipoDTE` or `TpoDoc`), folio, issue date,
 * issuer and receiver (the cover's when the document names none) and total. A number is read as the parser reads it
 * (`1e3` is 1000) and is 0 when it cannot be read, an absent date is null and an absent RUT is empty. The RUTs are not
 * validated: only their dots are removed and their letter is upper-cased. It is the reading of the certification's
 * exchange alone, for the set the SII itself serves: an envelope a supplier sends is read with `readReceivedEnvelope`,
 * which takes nothing from the cover and converts nothing.
 * ES: Lee el set de intercambio que el SII sirve en la certificación como lo lee el lector de campo, con tolerancia:
 * no se comprueba que el XML esté bien formado y sus etiquetas se leen por su nombre completo, así que un sobre con
 * prefijo no es un sobre; la raíz es `EnvioDTE`, `EnvioDTEB`, `EnvioDTETraslado` o `EnvioBOLETA`; el id del set (el
 * atributo `ID`, si no un hijo `ID`, si no `SetDTE`), los RUT de la carátula y, por documento, su tipo (`TipoDTE` o
 * `TpoDoc`), folio, fecha de emisión, emisor y receptor (los de la carátula cuando el documento no los nombra) y
 * total. Un número se lee como lo lee el parser (`1e3` es 1000) y vale 0 si no se puede leer, una fecha ausente es
 * null y un RUT ausente queda vacío. Los RUT no se validan: solo se les quitan los puntos y se sube su letra a
 * mayúscula. Es la lectura del intercambio de la certificación y de nada más, para el set que sirve el propio SII: un
 * sobre que envía un proveedor se lee con `readReceivedEnvelope`, que no toma nada de la carátula ni convierte nada.
 * @param setXml EN: the set as the portal served it. ES: el set como lo sirvió el portal.
 * @returns EN: the set read. ES: el set leído.
 * @throws {DteError} EN: `XML_PARSE_FAILED` (the parser gives up, or there is no envelope root), `ENVELOPE_EMPTY` (no document at all). ES: los mismos códigos.
 */
export const parseExchangeSet = (setXml: string): ExchangeSet => {
  const parsed = parseXmlLoosely(setXml)
  const root = ENVELOPE_ROOTS.map((name) => nodeOf(parsed[name])).find((node) => node !== null) ?? null
  const set = nodeOf(root?.['SetDTE']) ?? nodeOf(parsed['SetDTE'])
  if (set === null) throw new DteError('XML_PARSE_FAILED', { field: 'SetDTE', reason: 'no envelope root' })
  const cover = nodeOf(set['Caratula'])
  const issuerRut = setRut(firstOf(scalarOf(cover, 'RutEmisor')))
  const receiverRut = optionalSetRut(scalarOf(cover, 'RutReceptor'))
  const documents = listOf(set['DTE']).map((dte) => documentOf(nodeOf(dte), issuerRut, receiverRut))
  if (documents.length === 0) throw new DteError('ENVELOPE_EMPTY', { field: 'DTE' })
  return {
    setId: firstOf(scalarOf(set, '@_ID'), scalarOf(set, 'ID')) ?? DEFAULT_SET_ID,
    issuerRut,
    senderRut: optionalSetRut(scalarOf(cover, 'RutEnvia')),
    receiverRut,
    documents,
  }
}

/**
 * EN: Builds and signs the three answers to an exchange set, as the certification expects them: the reception
 * response (the envelope received, every document received when its receiver is the company, else "error en RUT
 * receptor"), the receipts of Ley 19.983 (one per document, signed by the certificate holder) and the commercial
 * approval (accepted when the receiver is the company, else rejected with `CodRchDsc` -1). One line each, UTF-8, no
 * declaration; the ids carry the clock in milliseconds and every timestamp is Chile's local time. It is
 * `createReceptionAnswer`, `createGoodsReceipts` and `createResultAnswer` with the certification's decisions; a
 * receiver in production decides each one itself.
 * ES: Arma y firma las tres respuestas a un set de intercambio, como las espera la certificación: la respuesta de
 * recepción (el sobre recibido, cada documento recibido cuando su receptor es la empresa, si no "error en RUT
 * receptor"), los recibos de la Ley 19.983 (uno por documento, firmados por el titular del certificado) y la
 * aprobación comercial (aceptado cuando el receptor es la empresa, si no rechazado con `CodRchDsc` -1). Una línea cada
 * una, UTF-8, sin declaración; los ids llevan el reloj en milisegundos y cada marca de tiempo es la hora local de Chile.
 * Es `createReceptionAnswer`, `createGoodsReceipts` y `createResultAnswer` con las decisiones de la certificación; un
 * receptor en producción decide cada una por su cuenta.
 * @param setXml EN: the set as the portal served it. ES: el set como lo sirvió el portal.
 * @param input EN: the company, the certificate, the contact and the clock. ES: la empresa, el certificado, el contacto y el reloj.
 * @returns EN: the three answers and the set read. ES: las tres respuestas y el set leído.
 * @throws {DteError} EN: the codes of `parseExchangeSet`; `INVALID_RUT { field: 'companyRut' }`. ES: los mismos códigos.
 */
export const createExchangeAnswers = (setXml: string, input: CreateExchangeAnswersInput): ExchangeAnswers => {
  const set = parseExchangeSet(setXml)
  const { companyRut, certificate, now } = input
  // The responses never carry the phone; the receipts do.
  const responseContact = { name: input.contact?.name, mail: input.contact?.mail }
  const company = toSiiRut(companyRut, 'companyRut')
  const isCompany = (document: ExchangeDocument): boolean => document.receiverRut === company
  const answer = { companyRut, certificate, now }
  const reception = createReceptionAnswer(set, {
    ...answer,
    contact: responseContact,
    envelope: ENVELOPE_RECEIVED,
    documents: (document) => (isCompany(document) ? DOCUMENT_RECEIVED : DOCUMENT_WRONG_RECEIVER),
  })
  const approval = createResultAnswer(set, {
    ...answer,
    contact: responseContact,
    documents: (document, position) => ({
      ...(isCompany(document) ? DOCUMENT_ACCEPTED : DOCUMENT_REJECTED),
      envelopeCode: position,
    }),
  })
  const receipts = createGoodsReceipts(set, { ...answer, contact: input.contact, documents: () => ({}) })
  return {
    reception: { fileName: EXCHANGE_ANSWER_FILES.reception, xml: reception },
    receipts: { fileName: EXCHANGE_ANSWER_FILES.receipts, xml: receipts },
    approval: { fileName: EXCHANGE_ANSWER_FILES.approval, xml: approval },
    set,
  }
}
