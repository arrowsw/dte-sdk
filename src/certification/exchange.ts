import { EXCHANGE_ANSWER_FILES } from '../catalogs/certification'
import type { Certificate } from '../certificate/certificate'
import { toSiiRut } from '../model/rut'
import { createGoodsReceipts, createReceptionAnswer, createResultAnswer, type AnswerContact } from '../document/answer'
import {
  readReceivedEnvelope,
  type ReceivedEnvelope,
  type ReceivedEnvelopeDocument,
} from '../document/received-envelope'

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

/**
 * EN: Reads the exchange set the way the field's reader does, loosely: the XML is not checked for well-formedness and
 * its tags are read by their full name, so a prefixed envelope is no envelope; the root is `EnvioDTE`, `EnvioDTEB`,
 * `EnvioDTETraslado` or `EnvioBOLETA`; the set id (the `ID` attribute, else an `ID` child, else `SetDTE`), the cover's
 * RUTs and, per document, its type (`TipoDTE` or `TpoDoc`), folio, issue date, issuer and receiver (the cover's when
 * the document names none) and total. A number is read as the parser reads it (`1e3` is 1000) and is 0 when it cannot
 * be read, an absent date is null and an absent RUT is empty. The RUTs are not validated: only their dots are removed
 * and their letter is upper-cased. It is `readReceivedEnvelope`.
 * ES: Lee el set de intercambio como lo lee el lector de campo, con tolerancia: no se comprueba que el XML esté bien
 * formado y sus etiquetas se leen por su nombre completo, así que un sobre con prefijo no es un sobre; la raíz es
 * `EnvioDTE`, `EnvioDTEB`, `EnvioDTETraslado` o `EnvioBOLETA`; el id del set (el atributo `ID`, si no un hijo `ID`, si
 * no `SetDTE`), los RUT de la carátula y, por documento, su tipo (`TipoDTE` o `TpoDoc`), folio, fecha de emisión,
 * emisor y receptor (los de la carátula cuando el documento no los nombra) y total. Un número se lee como lo lee el
 * parser (`1e3` es 1000) y vale 0 si no se puede leer, una fecha ausente es null y un RUT ausente queda vacío. Los RUT
 * no se validan: solo se les quitan los puntos y se sube su letra a mayúscula. Es `readReceivedEnvelope`.
 * @throws {DteError} EN: `XML_PARSE_FAILED` (the parser gives up, or there is no envelope root), `ENVELOPE_EMPTY` (no document at all). ES: los mismos códigos.
 */
export const parseExchangeSet = (setXml: string): ExchangeSet => readReceivedEnvelope(setXml)

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
