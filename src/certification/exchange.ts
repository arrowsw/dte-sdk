import { EXCHANGE_ANSWER_FILES } from '../catalogs/certification'
import type { Certificate } from '../certificate/certificate'
import { DteError } from '../errors'
import { toSiiRut, type SiiRut } from '../model/rut'
import { signEnveloped } from '../signature/xmldsig'
import { sanitizeText } from '../text/sanitize'
import { chileTimestamp } from '../time/chile'
import { buildXml } from '../xml/build'
import { parseXmlWithoutNamespaces } from '../xml/parse'

const SII_NS = 'http://www.sii.cl/SiiDte'
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'
const RESPONSE_SCHEMA = 'RespuestaEnvioDTE_v10.xsd'
const RECEIPTS_SCHEMA = 'EnvioRecibos_v10.xsd'
const ENVELOPE_ROOTS = ['EnvioDTE', 'EnvioDTEB', 'EnvioDTETraslado', 'EnvioBOLETA'] as const
const DEFAULT_SET_ID = 'SetDTE'
const ENVELOPE_RECEIVED = { code: 0, gloss: 'Envío recibido conforme.' } as const
const DOCUMENT_RECEIVED = { code: 0, gloss: 'DTE Recibido OK.' } as const
const DOCUMENT_WRONG_RECEIVER = { code: 3, gloss: 'DTE No Recibido - Error en RUT Receptor.' } as const
const DOCUMENT_ACCEPTED = { code: 0, gloss: 'DTE Aceptado OK' } as const
const DOCUMENT_REJECTED = { code: 2, gloss: 'DTE Rechazado', reason: -1 } as const
const RECEIPT_PLACE = 'Oficina central'
const RECEIPT_DECLARATION =
  'El acuse de recibo que se declara en este acto, de acuerdo a lo dispuesto en la letra b) del Art. 4, y la letra c) del Art. 5 de la Ley 19.983, acredita que la entrega de mercaderias o servicio(s) prestado(s) ha(n) sido recibido(s).'

/**
 * EN: One document of the exchange set, as the answers describe it.
 * ES: Un documento del set de intercambio, como lo describen las respuestas.
 */
export type ExchangeDocument = {
  /** EN: Document type. ES: `TipoDTE` — Tipo de documento. */
  readonly type: number
  /** EN: Folio. ES: `Folio` — Folio. */
  readonly folio: number
  /** EN: Issue date, `YYYY-MM-DD`, or null when the document has none (the answers then carry an empty element). ES: `FchEmis` — Fecha de emisión, `AAAA-MM-DD`, o null si el documento no trae (las respuestas llevan entonces un elemento vacío). */
  readonly issueDate: string | null
  /** EN: The issuer, the document's or the cover's, as the set wrote it without dots and upper-cased; `''` when neither names one. ES: `RUTEmisor` — El emisor, el del documento o el de la carátula, como lo escribió el set sin puntos y en mayúsculas; `''` si ninguno lo nombra. */
  readonly issuerRut: string
  /** EN: The receiver, the document's or the cover's, as the set wrote it without dots and upper-cased; `''` when neither names one. ES: `RUTRecep` — El receptor, el del documento o el de la carátula, como lo escribió el set sin puntos y en mayúsculas; `''` si ninguno lo nombra. */
  readonly receiverRut: string
  /** EN: The total, 0 when the document has none or it is not a number. ES: `MntTotal` — El total, 0 si el documento no trae o no es un número. */
  readonly total: number
}

/**
 * EN: The exchange set the SII sends: its id, its cover and its documents.
 * ES: El set de intercambio que envía el SII: su id, su carátula y sus documentos.
 */
export type ExchangeSet = {
  /** EN: `SetDTE/@ID`, `SetDTE` when absent. ES: `SetDTE/@ID`, `SetDTE` si falta. */
  readonly setId: string
  /** EN: The cover's issuer, without dots and upper-cased; `''` when the cover names none. ES: `RutEmisor` — El emisor de la carátula, sin puntos y en mayúsculas; `''` si la carátula no lo nombra. */
  readonly issuerRut: string
  /** EN: The cover's sender, without dots and upper-cased, or null. ES: `RutEnvia` — El enviador de la carátula, sin puntos y en mayúsculas, o null. */
  readonly senderRut: string | null
  /** EN: The cover's receiver, without dots and upper-cased, or null. ES: `RutReceptor` — El receptor de la carátula, sin puntos y en mayúsculas, o null. */
  readonly receiverRut: string | null
  /** EN: The documents, in set order. ES: Los documentos, en el orden del set. */
  readonly documents: readonly ExchangeDocument[]
}

/**
 * EN: The contact the answers name, every field optional.
 * ES: El contacto que nombran las respuestas, cada campo opcional.
 */
export type ExchangeContact = {
  /** EN: Contact name. ES: `NmbContacto` — Nombre del contacto. */
  readonly name?: string
  /** EN: Contact mail. ES: `MailContacto` — Correo del contacto. */
  readonly mail?: string
  /** EN: Contact phone, in the receipts only. ES: `FonoContacto` — Teléfono del contacto, solo en los recibos. */
  readonly phone?: string
}

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

const textOf = (node: Node | null, key: string): string | null => {
  const value = node?.[key]
  return typeof value === 'string' ? value : null
}

const listOf = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : value === undefined ? [] : [value]

// The first of these that is not empty, the way the set's fields chain: a present but empty element counts as absent.
const firstOf = (...values: readonly (string | null)[]): string | null =>
  values.find((value) => value !== '' && value !== null) ?? null

// A number the set writes loosely reads as its leading digits, and as 0 when it has none. The set is the SII's own.
const looseInteger = (value: string | null): number => Number.parseInt(value ?? '', 10) || 0

// The RUTs of the set are the SII's: they are not validated, as the set's own test companies need (so rut.ts has
// nothing to say here); only the dots go and the verifier letter is upper-cased.
const setRut = (value: string | null): string => (value === null ? '' : value.replace(/\./g, '').toUpperCase())

const optionalSetRut = (value: string | null): string | null => {
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
    type: looseInteger(textOf(idDoc, 'TipoDTE') ?? textOf(idDoc, 'TpoDoc')),
    folio: looseInteger(textOf(idDoc, 'Folio')),
    issueDate: firstOf(textOf(idDoc, 'FchEmis')),
    issuerRut: setRut(firstOf(textOf(issuer, 'RUTEmisor'), textOf(issuer, 'RutEmisor'), coverIssuerRut)),
    receiverRut: setRut(firstOf(textOf(receiver, 'RUTRecep'), textOf(receiver, 'RutRecep'), coverReceiver)),
    total: looseInteger(textOf(nodeOf(header?.['Totales']), 'MntTotal')),
  }
}

/**
 * EN: Reads the exchange set the way the field's reader does, loosely: the root is `EnvioDTE`, `EnvioDTEB`,
 * `EnvioDTETraslado` or `EnvioBOLETA`; the set id (`SetDTE` when absent or empty), the cover's RUTs and, per document,
 * its type (`TipoDTE` or `TpoDoc`), folio, issue date, issuer and receiver (the cover's when the document names none)
 * and total. A number that cannot be read is 0, an absent date is null and an absent RUT is empty. The RUTs are not
 * validated: only their dots are removed and their letter is upper-cased.
 * ES: Lee el set de intercambio como lo lee el lector de campo, con tolerancia: la raíz es `EnvioDTE`, `EnvioDTEB`,
 * `EnvioDTETraslado` o `EnvioBOLETA`; el id del set (`SetDTE` si falta o está vacío), los RUT de la carátula y, por
 * documento, su tipo (`TipoDTE` o `TpoDoc`), folio, fecha de emisión, emisor y receptor (los de la carátula cuando el
 * documento no los nombra) y total. Un número que no se puede leer vale 0, una fecha ausente es null y un RUT ausente
 * queda vacío. Los RUT no se validan: solo se les quitan los puntos y se sube su letra a mayúscula.
 * @throws {DteError} EN: `XML_PARSE_FAILED` (malformed, no envelope root), `ENVELOPE_EMPTY` (no document at all). ES: los mismos códigos.
 */
export const parseExchangeSet = (setXml: string): ExchangeSet => {
  const parsed = parseXmlWithoutNamespaces(setXml)
  const root = ENVELOPE_ROOTS.map((name) => nodeOf(parsed[name])).find((node) => node !== null) ?? null
  const set = nodeOf(root?.['SetDTE']) ?? nodeOf(parsed['SetDTE'])
  if (set === null) throw new DteError('XML_PARSE_FAILED', { field: 'SetDTE', reason: 'no envelope root' })
  const cover = nodeOf(set['Caratula'])
  const issuerRut = setRut(textOf(cover, 'RutEmisor'))
  const receiverRut = optionalSetRut(textOf(cover, 'RutReceptor'))
  const documents = listOf(set['DTE']).map((dte) => documentOf(nodeOf(dte), issuerRut, receiverRut))
  if (documents.length === 0) throw new DteError('ENVELOPE_EMPTY', { field: 'DTE' })
  return {
    setId: firstOf(textOf(set, '@_ID')) ?? DEFAULT_SET_ID,
    issuerRut,
    senderRut: optionalSetRut(textOf(cover, 'RutEnvia')),
    receiverRut,
    documents,
  }
}

const documentFields = (document: ExchangeDocument): Readonly<Record<string, string | number | null>> => ({
  TipoDTE: document.type,
  Folio: document.folio,
  FchEmis: document.issueDate,
  RUTEmisor: document.issuerRut,
  RUTRecep: document.receiverRut,
  MntTotal: document.total,
})

const rootAttributes = (schema: string): Readonly<Record<string, string>> => ({
  '@_xmlns': SII_NS,
  '@_xmlns:xsi': XSI_NS,
  '@_xsi:schemaLocation': `${SII_NS} ${schema}`,
  '@_version': '1.0',
})

const signedResponse = (resultado: Node, certificate: CreateExchangeAnswersInput['certificate']): string =>
  signEnveloped({
    xml: buildXml({ RespuestaDTE: { ...rootAttributes(RESPONSE_SCHEMA), Resultado: resultado } }),
    elementTag: 'Resultado',
    rootTag: 'RespuestaDTE',
    certificate,
  }).xml

// A receipt is signed on its own, with the namespaces the envelope will put in scope declared on it, so its digest
// is the one a verifier computes inside the envelope; the declarations then leave the start tag, as redundant.
const STANDALONE_RECEIPT = `<Recibo xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}" version="1.0">`

const signedReceipt = (
  document: ExchangeDocument,
  position: number,
  signer: SiiRut,
  stamp: string,
  certificate: CreateExchangeAnswersInput['certificate'],
): string =>
  signEnveloped({
    xml: buildXml({
      Recibo: {
        '@_xmlns': SII_NS,
        '@_xmlns:xsi': XSI_NS,
        '@_version': '1.0',
        DocumentoRecibo: {
          '@_ID': `REC-${position}`,
          TipoDoc: document.type,
          Folio: document.folio,
          FchEmis: document.issueDate,
          RUTEmisor: document.issuerRut,
          RUTRecep: document.receiverRut,
          MntTotal: document.total,
          Recinto: RECEIPT_PLACE,
          RutFirma: signer,
          Declaracion: RECEIPT_DECLARATION,
          TmstFirmaRecibo: stamp,
        },
      },
    }),
    elementTag: 'DocumentoRecibo',
    rootTag: 'Recibo',
    certificate,
  }).xml.replace(STANDALONE_RECEIPT, '<Recibo version="1.0">')

/**
 * EN: Builds and signs the three answers to an exchange set, as the certification expects them: the reception
 * response (the envelope received, every document received when its receiver is the company, else "error en RUT
 * receptor"), the receipts of Ley 19.983 (one per document, signed by the certificate holder) and the commercial
 * approval (accepted when the receiver is the company, else rejected with `CodRchDsc` -1). One line each, UTF-8, no
 * declaration; the ids carry the clock in milliseconds and every timestamp is Chile's local time.
 * ES: Arma y firma las tres respuestas a un set de intercambio, como las espera la certificación: la respuesta de
 * recepción (el sobre recibido, cada documento recibido cuando su receptor es la empresa, si no "error en RUT
 * receptor"), los recibos de la Ley 19.983 (uno por documento, firmados por el titular del certificado) y la
 * aprobación comercial (aceptado cuando el receptor es la empresa, si no rechazado con `CodRchDsc` -1). Una línea cada
 * una, UTF-8, sin declaración; los ids llevan el reloj en milisegundos y cada marca de tiempo es la hora local de Chile.
 * @param setXml EN: the set as the portal served it. ES: el set como lo sirvió el portal.
 * @param input EN: the company, the certificate, the contact and the clock. ES: la empresa, el certificado, el contacto y el reloj.
 * @returns EN: the three answers and the set read. ES: las tres respuestas y el set leído.
 * @throws {DteError} EN: the codes of `parseExchangeSet`; `INVALID_RUT { field: 'companyRut' }`. ES: los mismos códigos.
 */
export const createExchangeAnswers = (setXml: string, input: CreateExchangeAnswersInput): ExchangeAnswers => {
  const set = parseExchangeSet(setXml)
  const company = toSiiRut(input.companyRut, 'companyRut')
  const now = input.now ?? new Date()
  const ms = now.getTime()
  const stamp = chileTimestamp(now)
  // Only the name is sanitized; each field is written when the caller gave it, whatever the sanitizer leaves of it.
  const { name, mail, phone } = input.contact ?? {}
  const nameField = name ? { NmbContacto: sanitizeText(name) } : {}
  const mailField = mail ? { MailContacto: mail } : {}
  const phoneField = phone ? { FonoContacto: phone } : {}
  const isCompany = (document: ExchangeDocument): boolean => document.receiverRut === company
  const cover = (details: number): Node => ({
    '@_version': '1.0',
    RutResponde: company,
    RutRecibe: set.issuerRut,
    IdRespuesta: 1,
    NroDetalles: details,
    ...nameField,
    ...mailField,
    TmstFirmaResp: stamp,
  })
  const reception = signedResponse(
    {
      '@_ID': `R_ENVIO_${ms}`,
      Caratula: cover(1),
      RecepcionEnvio: {
        NmbEnvio: `ENVIO_DTE_${ms}`,
        FchRecep: stamp,
        CodEnvio: 1,
        EnvioDTEID: set.setId,
        RutEmisor: set.issuerRut,
        RutReceptor: company,
        EstadoRecepEnv: ENVELOPE_RECEIVED.code,
        RecepEnvGlosa: ENVELOPE_RECEIVED.gloss,
        NroDTE: set.documents.length,
        RecepcionDTE: set.documents.map((document) => {
          const state = isCompany(document) ? DOCUMENT_RECEIVED : DOCUMENT_WRONG_RECEIVER
          return { ...documentFields(document), EstadoRecepDTE: state.code, RecepDTEGlosa: state.gloss }
        }),
      },
    },
    input.certificate,
  )
  const approval = signedResponse(
    {
      '@_ID': `R_DTE_${ms}`,
      Caratula: cover(set.documents.length),
      ResultadoDTE: set.documents.map((document, index) =>
        isCompany(document)
          ? {
              ...documentFields(document),
              CodEnvio: index + 1,
              EstadoDTE: DOCUMENT_ACCEPTED.code,
              EstadoDTEGlosa: DOCUMENT_ACCEPTED.gloss,
            }
          : {
              ...documentFields(document),
              CodEnvio: index + 1,
              EstadoDTE: DOCUMENT_REJECTED.code,
              EstadoDTEGlosa: DOCUMENT_REJECTED.gloss,
              CodRchDsc: DOCUMENT_REJECTED.reason,
            },
      ),
    },
    input.certificate,
  )
  const signer = input.certificate.rut ?? company
  const receipts = set.documents
    .map((document, index) => signedReceipt(document, index + 1, signer, stamp, input.certificate))
    .join('')
  const unsignedReceipts = buildXml({
    EnvioRecibos: {
      ...rootAttributes(RECEIPTS_SCHEMA),
      SetRecibos: {
        '@_ID': `SetRecibos_${ms}`,
        Caratula: {
          '@_version': '1.0',
          RutResponde: company,
          RutRecibe: set.issuerRut,
          ...nameField,
          ...phoneField,
          ...mailField,
          TmstFirmaEnv: stamp,
        },
      },
    },
  }).replace('</SetRecibos>', () => `${receipts}</SetRecibos>`)
  const signedReceipts = signEnveloped({
    xml: unsignedReceipts,
    elementTag: 'SetRecibos',
    rootTag: 'EnvioRecibos',
    certificate: input.certificate,
  }).xml
  return {
    reception: { fileName: EXCHANGE_ANSWER_FILES.reception, xml: reception },
    receipts: { fileName: EXCHANGE_ANSWER_FILES.receipts, xml: signedReceipts },
    approval: { fileName: EXCHANGE_ANSWER_FILES.approval, xml: approval },
    set,
  }
}
