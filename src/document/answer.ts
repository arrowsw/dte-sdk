import type { Certificate } from '../certificate/certificate'
import { DteError } from '../errors'
import { toSiiRut, type SiiRut } from '../model/rut'
import { signEnveloped } from '../signature/xmldsig'
import { sanitizeText } from '../text/sanitize'
import { chileTimestamp } from '../time/chile'
import { buildXml } from '../xml/build'
import { readReceivedEnvelope, type ReceivedEnvelope, type ReceivedEnvelopeDocument } from './received-envelope'

const SII_NS = 'http://www.sii.cl/SiiDte'
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'
const RESPONSE_SCHEMA = 'RespuestaEnvioDTE_v10.xsd'
const RECEIPTS_SCHEMA = 'EnvioRecibos_v10.xsd'
const MAX_GLOSS = 256
const DEFAULT_RECEIPT_PLACE = 'Oficina central'
const RECEIPT_DECLARATION =
  'El acuse de recibo que se declara en este acto, de acuerdo a lo dispuesto en la letra b) del Art. 4, y la letra c) del Art. 5 de la Ley 19.983, acredita que la entrega de mercaderias o servicio(s) prestado(s) ha(n) sido recibido(s).'

/**
 * EN: `EstadoRecepEnv`, the state of the reception of an envelope, with the gloss the format names for each (Formato
 * Mensaje de Respuesta a DTE 1.0, page 7, field 8).
 * ES: `EstadoRecepEnv` — Estado de recepción del envío, con la glosa que el formato nombra para cada uno (Formato
 * Mensaje de Respuesta a DTE 1.0, página 7, campo 8).
 */
export const ENVELOPE_RECEPTION_STATES = {
  0: 'Envío Recibido Conforme',
  1: 'Envío Rechazado - Error de Schema',
  2: 'Envío Rechazado - Error de Firma',
  3: 'Envío Rechazado - RUT Receptor No Corresponde',
  90: 'Envío Rechazado - Archivo Repetido',
  91: 'Envío Rechazado - Archivo Ilegible',
  99: 'Envío Rechazado - Otros',
} as const

/**
 * EN: `EstadoRecepDTE`, the state of the reception of a document, with the gloss the format names for each (page 8,
 * field 17).
 * ES: `EstadoRecepDTE` — Estado de recepción del documento, con la glosa que el formato nombra para cada uno
 * (página 8, campo 17).
 */
export const DOCUMENT_RECEPTION_STATES = {
  0: 'DTE Recibido OK',
  1: 'DTE No Recibido - Error de Firma',
  2: 'DTE No Recibido - Error en RUT Emisor',
  3: 'DTE No Recibido - Error en RUT Receptor',
  4: 'DTE No Recibido - DTE Repetido',
  99: 'DTE No Recibido - Otros',
} as const

/**
 * EN: `EstadoDTE`, the commercial result of a document, with the gloss the format names for each (page 9, field 8).
 * ES: `EstadoDTE` — Resultado comercial del documento, con la glosa que el formato nombra para cada uno (página 9,
 * campo 8).
 */
export const COMMERCIAL_RESULT_STATES = {
  0: 'DTE Aceptado OK',
  1: 'DTE Aceptado con Discrepancias',
  2: 'DTE Rechazado',
} as const

/**
 * EN: A `EstadoRecepEnv` code.
 * ES: Un código de `EstadoRecepEnv`.
 */
export type EnvelopeReceptionState = keyof typeof ENVELOPE_RECEPTION_STATES

/**
 * EN: A `EstadoRecepDTE` code.
 * ES: Un código de `EstadoRecepDTE`.
 */
export type DocumentReceptionState = keyof typeof DOCUMENT_RECEPTION_STATES

/**
 * EN: A `EstadoDTE` code.
 * ES: Un código de `EstadoDTE`.
 */
export type CommercialResultState = keyof typeof COMMERCIAL_RESULT_STATES

/**
 * EN: The contact the answers name, every field optional.
 * ES: El contacto que nombran las respuestas, cada campo opcional.
 */
export type AnswerContact = {
  /** EN: Contact name. ES: `NmbContacto` — Nombre del contacto. */
  readonly name?: string
  /** EN: Contact mail. ES: `MailContacto` — Correo del contacto. */
  readonly mail?: string
  /** EN: Contact phone. ES: `FonoContacto` — Teléfono del contacto. */
  readonly phone?: string
}

/**
 * EN: What every answer needs: who answers, with what certificate, and when.
 * ES: Lo que necesita toda respuesta: quién responde, con qué certificado y cuándo.
 */
export type AnswerInput = {
  /** EN: The company that answers, the receiver of the envelope. ES: `RutResponde` — La empresa que responde, el receptor del sobre. */
  readonly companyRut: string
  /** EN: The signing certificate. ES: El certificado firmante. */
  readonly certificate: Pick<Certificate, 'privateKeyPem' | 'publicKey' | 'certificateBase64' | 'rut'>
  /** EN: The contact, when any. ES: El contacto, si hay. */
  readonly contact?: AnswerContact
  /** EN: The clock, for the timestamps and the ids; now by default. ES: El reloj, para las marcas de tiempo y los ids; por defecto ahora. */
  readonly now?: Date
}

/**
 * EN: The decisions about the documents of an envelope: a function of the document and its position (1 for the first),
 * or a record by `documentKey` (`'33:1234'`); `undefined` leaves the document to the default and `null` leaves it out
 * of the answer. A record names a document by its type and folio alone, so it is refused (`INVALID_OPTION`, with
 * `details.field` `documents` and the key in `details.key`) for an envelope where two documents share them, whether
 * the record names that key or not; the function decides each of those by its position.
 * ES: Las decisiones sobre los documentos de un sobre: una función del documento y su posición (1 el primero), o un
 * registro por `documentKey` (`'33:1234'`); `undefined` deja el documento al valor por defecto y `null` lo deja fuera
 * de la respuesta. Un registro nombra un documento solo por su tipo y folio, así que se rechaza (`INVALID_OPTION`, con
 * `details.field` `documents` y la clave en `details.key`) para un sobre en que dos documentos los comparten, nombre o
 * no el registro esa clave; la función decide cada uno de esos por su posición.
 */
export type DocumentDecisions<Decision> =
  | ((document: ReceivedEnvelopeDocument, position: number) => Decision | null | undefined)
  | Readonly<Record<string, Decision | null>>

/**
 * EN: What the answer says about the envelope: a state of `EstadoRecepEnv` and its gloss (the catalog's by default;
 * for state 99 the format asks for additional information).
 * ES: Lo que la respuesta dice del sobre: un estado de `EstadoRecepEnv` y su glosa (la del catálogo por defecto; para
 * el estado 99 el formato pide información adicional).
 */
export type EnvelopeReceptionDecision = {
  /** EN: `EstadoRecepEnv` — the state. ES: `EstadoRecepEnv` — el estado. */
  readonly state: EnvelopeReceptionState
  /** EN: `RecepEnvGlosa` — the gloss, up to 256 characters. ES: `RecepEnvGlosa` — la glosa, hasta 256 caracteres. */
  readonly gloss?: string
}

/**
 * EN: What the reception answer says about one document.
 * ES: Lo que la respuesta de recepción dice de un documento.
 */
export type DocumentReceptionDecision = {
  /** EN: `EstadoRecepDTE` — the state. ES: `EstadoRecepDTE` — el estado. */
  readonly state: DocumentReceptionState
  /** EN: `RecepDTEGlosa` — the gloss, up to 256 characters; the catalog's by default. ES: `RecepDTEGlosa` — la glosa, hasta 256 caracteres; la del catálogo por defecto. */
  readonly gloss?: string
}

/**
 * EN: What the commercial result says about one document.
 * ES: Lo que el resultado comercial dice de un documento.
 */
export type CommercialResultDecision = {
  /** EN: `EstadoDTE` — the state. ES: `EstadoDTE` — el estado. */
  readonly state: CommercialResultState
  /** EN: `EstadoDTEGlosa` — the gloss, up to 256 characters; the catalog's by default. For a rejection under Ley 19.983 the format asks it to state the reason and name the law. ES: `EstadoDTEGlosa` — la glosa, hasta 256 caracteres; la del catálogo por defecto. En un rechazo bajo la Ley 19.983 el formato pide que diga el motivo y nombre la ley. */
  readonly gloss?: string
  /** EN: `CodRchDsc` — the code of the reason for the rejection or the discrepancy: a negative integer of up to 3 digits, which the SII leaves for the sender to define. Written for states 1 and 2 when given; a rejection writes -1 when it is not given. ES: `CodRchDsc` — el código del motivo de rechazo o discrepancia: un entero negativo de hasta 3 dígitos, que el SII deja a definir por quien responde. Se escribe en los estados 1 y 2 cuando se da; un rechazo escribe -1 cuando no se da. */
  readonly rejectionCode?: number
  /** EN: `CodEnvio` — the code of the envelope the document came in, for this document alone. ES: `CodEnvio` — el código del envío en que llegó el documento, solo para este documento. */
  readonly envelopeCode?: number
}

/**
 * EN: What the receipts say about one document.
 * ES: Lo que los recibos dicen de un documento.
 */
export type GoodsReceiptDecision = {
  /** EN: `Recinto` — where the goods or the service were received, up to 80 characters; `Oficina central` by default. ES: `Recinto` — el lugar en que se recibieron las mercaderías o el servicio, hasta 80 caracteres; `Oficina central` por defecto. */
  readonly place?: string
}

/**
 * EN: Input of `createReceptionAnswer`.
 * ES: Entrada de `createReceptionAnswer`.
 */
export type ReceptionAnswerInput = AnswerInput & {
  /** EN: What to say of the envelope; `EstadoRecepEnv` 3 when its cover names another receiver, else 0. ES: Lo que se dice del sobre; `EstadoRecepEnv` 3 cuando su carátula nombra otro receptor, si no 0. */
  readonly envelope?: EnvelopeReceptionDecision
  /** EN: What to say of each document; `EstadoRecepDTE` 3 when it is addressed to another RUT, else 0. ES: Lo que se dice de cada documento; `EstadoRecepDTE` 3 cuando va dirigido a otro RUT, si no 0. */
  readonly documents?: DocumentDecisions<DocumentReceptionDecision>
  /** EN: `FchRecep` — when the envelope arrived; `now` by default. ES: `FchRecep` — cuándo llegó el envío; `now` por defecto. */
  readonly receivedAt?: Date
  /** EN: `NmbEnvio` — the name of the file received, up to 80 characters; `ENVIO_DTE_` and the clock by default. ES: `NmbEnvio` — el nombre del archivo recibido, hasta 80 caracteres; `ENVIO_DTE_` y el reloj por defecto. */
  readonly envelopeName?: string
  /** EN: `CodEnvio` — the code the receiver gives the envelope; 1 by default. ES: `CodEnvio` — el código que el receptor da al envío; 1 por defecto. */
  readonly envelopeCode?: number
  /** EN: `IdRespuesta` — the id of the answer; 1 by default. ES: `IdRespuesta` — el id de la respuesta; 1 por defecto. */
  readonly answerId?: number
}

/**
 * EN: Input of `createResultAnswer`.
 * ES: Entrada de `createResultAnswer`.
 */
export type ResultAnswerInput = AnswerInput & {
  /** EN: What to say of each document; accepted (`EstadoDTE` 0) when it is addressed to the company, else rejected (2) with `CodRchDsc` -1. ES: Lo que se dice de cada documento; aceptado (`EstadoDTE` 0) cuando va dirigido a la empresa, si no rechazado (2) con `CodRchDsc` -1. */
  readonly documents?: DocumentDecisions<CommercialResultDecision>
  /** EN: `CodEnvio` — the code of the envelope the documents came in, the one the reception answer gave it; 1 by default. ES: `CodEnvio` — el código del envío en que llegaron los documentos, el que le dio la respuesta de recepción; 1 por defecto. */
  readonly envelopeCode?: number
  /** EN: `IdRespuesta` — the id of the answer; 1 by default. ES: `IdRespuesta` — el id de la respuesta; 1 por defecto. */
  readonly answerId?: number
}

/**
 * EN: Input of `createGoodsReceipts`.
 * ES: Entrada de `createGoodsReceipts`.
 */
export type GoodsReceiptsInput = AnswerInput & {
  /** EN: What to receipt; by default the documents addressed to the company of the types Ley 19.983 names (33, 34, 43, 46 and 52). ES: Qué recibir; por defecto los documentos dirigidos a la empresa de los tipos que nombra la Ley 19.983 (33, 34, 43, 46 y 52). */
  readonly documents?: DocumentDecisions<GoodsReceiptDecision>
  /** EN: `RutFirma` — who signs the receipts; the certificate's holder by default. ES: `RutFirma` — quién firma los recibos; el titular del certificado por defecto. */
  readonly signerRut?: string
}

const RECEIPT_TYPES: readonly number[] = [33, 34, 43, 46, 52]

/**
 * EN: The key a record of decisions uses for a document: its type and folio, `'33:1234'`. It does not name the issuer
 * or the position, so it tells apart the documents of one envelope only while no two share a type and a folio; a
 * record is refused for an envelope where two do.
 * ES: La clave que usa un registro de decisiones para un documento: su tipo y folio, `'33:1234'`. No nombra al emisor
 * ni la posición, así que distingue los documentos de un sobre solo mientras no haya dos con el mismo tipo y folio; un
 * registro se rechaza para un sobre en que los hay.
 * @param document EN: the document of the envelope. ES: el documento del sobre.
 * @returns EN: the key. ES: la clave.
 */
export const documentKey = (document: Pick<ReceivedEnvelopeDocument, 'type' | 'folio'>): string =>
  `${document.type}:${document.folio}`

type Node = Readonly<Record<string, unknown>>
type Signer = AnswerInput['certificate']

const invalid = (field: string): never => {
  throw new DteError('INVALID_OPTION', { field })
}

const checkState = (catalog: Readonly<Record<number, string>>, state: number): void => {
  if (!Object.keys(catalog).includes(String(state))) invalid('state')
}

const checkGloss = (gloss: string): string => (gloss.length > MAX_GLOSS ? invalid('gloss') : gloss)

const checkCode = (value: number, field: string, max: number): number =>
  Number.isInteger(value) && value >= 1 && value <= max ? value : invalid(field)

// The first key two documents of the envelope share, in one pass: a set does not grow when it already holds the key.
const repeatedKey = (envelope: ReceivedEnvelope): string | undefined => {
  const seen = new Set<string>()
  return envelope.documents.map(documentKey).find((key) => seen.size === seen.add(key).size)
}

// A record names a document by its type and folio alone, so it decides only an envelope where no two documents share
// them: otherwise one decision would answer both, whatever their issuer or their content.
const checkRecord = (envelope: ReceivedEnvelope): void => {
  const key = repeatedKey(envelope)
  if (key !== undefined)
    throw new DteError('INVALID_OPTION', { field: 'documents', key, reason: 'two documents share this key' })
}

const resolveDecisions = <Decision>(
  envelope: ReceivedEnvelope,
  decisions: DocumentDecisions<Decision> | undefined,
  fallback: (document: ReceivedEnvelopeDocument) => Decision | null,
): readonly {
  readonly document: ReceivedEnvelopeDocument
  readonly position: number
  readonly decision: Decision
}[] => {
  if (decisions !== undefined && typeof decisions !== 'function') checkRecord(envelope)
  return envelope.documents.flatMap((document, index) => {
    const position = index + 1
    const given = typeof decisions === 'function' ? decisions(document, position) : decisions?.[documentKey(document)]
    const decision = given === undefined ? fallback(document) : given
    return decision === null ? [] : [{ document, position, decision }]
  })
}

const rootAttributes = (schema: string): Readonly<Record<string, string>> => ({
  '@_xmlns': SII_NS,
  '@_xmlns:xsi': XSI_NS,
  '@_xsi:schemaLocation': `${SII_NS} ${schema}`,
  '@_version': '1.0',
})

const documentFields = (document: ReceivedEnvelopeDocument): Readonly<Record<string, string | number | null>> => ({
  TipoDTE: document.type,
  Folio: document.folio,
  FchEmis: document.issueDate,
  RUTEmisor: document.issuerRut,
  RUTRecep: document.receiverRut,
  MntTotal: document.total,
})

const signedResponse = (resultado: Node, certificate: Signer): string =>
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
  document: ReceivedEnvelopeDocument,
  position: number,
  place: string,
  signer: SiiRut,
  stamp: string,
  certificate: Signer,
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
          Recinto: place,
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

// What every answer shares: the company, the clock and the contact. Only the name is sanitized; each field is written
// when the caller gave it, whatever the sanitizer leaves of it.
const context = (input: AnswerInput) => {
  const company = toSiiRut(input.companyRut, 'companyRut')
  const now = input.now ?? new Date()
  const { name, mail, phone } = input.contact ?? {}
  return {
    company,
    ms: now.getTime(),
    stamp: chileTimestamp(now),
    contact: {
      ...(name ? { NmbContacto: sanitizeText(name) } : {}),
      ...(phone ? { FonoContacto: phone } : {}),
      ...(mail ? { MailContacto: mail } : {}),
    },
  }
}

const responseCover = (
  common: ReturnType<typeof context>,
  envelope: ReceivedEnvelope,
  answerId: number,
  details: number,
): Node => ({
  '@_version': '1.0',
  RutResponde: common.company,
  RutRecibe: envelope.issuerRut,
  IdRespuesta: checkCode(answerId, 'answerId', 9_999_999_999),
  NroDetalles: details,
  ...common.contact,
  TmstFirmaResp: common.stamp,
})

const envelopeOf = (received: string | ReceivedEnvelope): ReceivedEnvelope =>
  typeof received === 'string' ? readReceivedEnvelope(received) : received

/**
 * EN: `createReceptionAnswer` for an envelope already read. The certification's exchange builds on it, so it does not
 * carry the strict reader of the text.
 * ES: `createReceptionAnswer` para un sobre ya leído. El intercambio de la certificación se arma sobre ella, así no
 * carga el lector estricto del texto.
 * @param envelope EN: the envelope read. ES: el sobre leído.
 * @param input EN: the company, the certificate, the decisions and the clock. ES: la empresa, el certificado, las decisiones y el reloj.
 * @returns EN: the signed `RespuestaDTE`. ES: la `RespuestaDTE` firmada.
 */
export const receptionAnswerOf = (envelope: ReceivedEnvelope, input: ReceptionAnswerInput): string => {
  const common = context(input)
  const toCompany = (document: ReceivedEnvelopeDocument): boolean => document.receiverRut === common.company
  const stateOf: EnvelopeReceptionDecision = input.envelope ?? {
    state: envelope.receiverRut === null || envelope.receiverRut === common.company ? 0 : 3,
  }
  checkState(ENVELOPE_RECEPTION_STATES, stateOf.state)
  const documents = resolveDecisions<DocumentReceptionDecision>(envelope, input.documents, (document) => ({
    state: toCompany(document) ? 0 : 3,
  }))
  const receivedAt = chileTimestamp(input.receivedAt ?? new Date(common.ms))
  return signedResponse(
    {
      '@_ID': `R_ENVIO_${common.ms}`,
      Caratula: responseCover(common, envelope, input.answerId ?? 1, 1),
      RecepcionEnvio: {
        NmbEnvio: input.envelopeName ?? `ENVIO_DTE_${common.ms}`,
        FchRecep: receivedAt,
        CodEnvio: checkCode(input.envelopeCode ?? 1, 'envelopeCode', 9_999_999_999),
        EnvioDTEID: envelope.setId,
        RutEmisor: envelope.issuerRut,
        RutReceptor: common.company,
        EstadoRecepEnv: stateOf.state,
        RecepEnvGlosa: checkGloss(stateOf.gloss ?? ENVELOPE_RECEPTION_STATES[stateOf.state]),
        ...(documents.length === 0 ? {} : { NroDTE: documents.length }),
        RecepcionDTE: documents.map(({ document, decision }) => {
          checkState(DOCUMENT_RECEPTION_STATES, decision.state)
          return {
            ...documentFields(document),
            EstadoRecepDTE: decision.state,
            RecepDTEGlosa: checkGloss(decision.gloss ?? DOCUMENT_RECEPTION_STATES[decision.state]),
          }
        }),
      },
    },
    input.certificate,
  )
}

/**
 * EN: Builds and signs the reception answer to a received envelope: a `RespuestaDTE` with one `RecepcionEnvio` that
 * states the reception of the envelope (`EstadoRecepEnv`) and, for each document, the reception of the document
 * (`EstadoRecepDTE`), the answer the SII asks every receiver to give. The caller decides the state and the gloss of the
 * envelope and of each document; by default a document addressed to another RUT than the company's is "DTE No
 * Recibido - Error en RUT Receptor" (3), any other is received (0), and the envelope is received (0) unless its cover
 * names another receiver (3). A document decided `null` is left out. One line, UTF-8, no declaration; the ids carry
 * the clock in milliseconds and every timestamp is Chile's local time.
 * ES: Arma y firma la respuesta de recepción a un sobre recibido: una `RespuestaDTE` con una `RecepcionEnvio` que dice
 * la recepción del envío (`EstadoRecepEnv`) y, por documento, la recepción del documento (`EstadoRecepDTE`), la
 * respuesta que el SII pide a todo receptor. Quien llama decide el estado y la glosa del envío y de cada documento; por
 * defecto un documento dirigido a otro RUT que el de la empresa es "DTE No Recibido - Error en RUT Receptor" (3), los
 * demás se reciben (0), y el sobre se recibe (0) salvo que su carátula nombre otro receptor (3). Un documento
 * decidido `null` queda fuera. Una línea, UTF-8, sin declaración; los ids llevan el reloj en milisegundos y cada marca
 * de tiempo es la hora local de Chile.
 * @param received EN: the envelope as received, which is read as `readReceivedEnvelope` reads it, or one already read. ES: el sobre como se recibió, que se lee como lo lee `readReceivedEnvelope`, o uno ya leído.
 * @param input EN: the company, the certificate, the decisions and the clock. ES: la empresa, el certificado, las decisiones y el reloj.
 * @returns EN: the signed `RespuestaDTE`. ES: la `RespuestaDTE` firmada.
 * @throws {DteError} EN: the codes of `readReceivedEnvelope`; `INVALID_RUT { field: 'companyRut' }`; `INVALID_OPTION` (`state`, `gloss`, `answerId`, `envelopeCode`, and `documents` for a record when two documents share a key). ES: los mismos códigos.
 */
export const createReceptionAnswer = (received: string | ReceivedEnvelope, input: ReceptionAnswerInput): string =>
  receptionAnswerOf(envelopeOf(received), input)

/**
 * EN: `createResultAnswer` for an envelope already read. The certification's exchange builds on it, so it does not
 * carry the strict reader of the text.
 * ES: `createResultAnswer` para un sobre ya leído. El intercambio de la certificación se arma sobre ella, así no carga
 * el lector estricto del texto.
 * @param envelope EN: the envelope read. ES: el sobre leído.
 * @param input EN: the company, the certificate, the decisions and the clock. ES: la empresa, el certificado, las decisiones y el reloj.
 * @returns EN: the signed `RespuestaDTE`. ES: la `RespuestaDTE` firmada.
 */
export const resultAnswerOf = (envelope: ReceivedEnvelope, input: ResultAnswerInput): string => {
  const common = context(input)
  const results = resolveDecisions<CommercialResultDecision>(envelope, input.documents, (document) =>
    document.receiverRut === common.company ? { state: 0 } : { state: 2 },
  )
  if (results.length === 0) throw new DteError('ENVELOPE_EMPTY', { field: 'ResultadoDTE' })
  return signedResponse(
    {
      '@_ID': `R_DTE_${common.ms}`,
      Caratula: responseCover(common, envelope, input.answerId ?? 1, results.length),
      ResultadoDTE: results.map(({ document, decision }) => {
        checkState(COMMERCIAL_RESULT_STATES, decision.state)
        const code = decision.rejectionCode ?? (decision.state === 2 ? -1 : undefined)
        const rejection =
          decision.state === 0 || code === undefined
            ? {}
            : { CodRchDsc: code < 0 && code >= -999 && Number.isInteger(code) ? code : invalid('rejectionCode') }
        return {
          ...documentFields(document),
          CodEnvio: checkCode(decision.envelopeCode ?? input.envelopeCode ?? 1, 'envelopeCode', 9_999_999_999),
          EstadoDTE: decision.state,
          EstadoDTEGlosa: checkGloss(decision.gloss ?? COMMERCIAL_RESULT_STATES[decision.state]),
          ...rejection,
        }
      }),
    },
    input.certificate,
  )
}

/**
 * EN: Builds and signs the commercial result of the documents of a received envelope: a `RespuestaDTE` with one
 * `ResultadoDTE` for each document, stating whether it is accepted, accepted with discrepancies or rejected
 * (`EstadoDTE`) and why. The caller decides the state, the gloss and the code of each; by default a document addressed
 * to the company is accepted (0) and any other is rejected (2) with `CodRchDsc` -1, and a rejection without a code
 * writes -1. A document decided `null` is left out. One line, UTF-8, no declaration; the ids carry the clock in
 * milliseconds and every timestamp is Chile's local time.
 * ES: Arma y firma el resultado comercial de los documentos de un sobre recibido: una `RespuestaDTE` con un
 * `ResultadoDTE` por documento, que dice si se acepta, se acepta con discrepancias o se rechaza (`EstadoDTE`) y por
 * qué. Quien llama decide el estado, la glosa y el código de cada uno; por defecto un documento dirigido a la empresa
 * se acepta (0) y cualquier otro se rechaza (2) con `CodRchDsc` -1, y un rechazo sin código escribe -1. Un documento
 * decidido `null` queda fuera. Una línea, UTF-8, sin declaración; los ids llevan el reloj en milisegundos y cada marca
 * de tiempo es la hora local de Chile.
 * @param received EN: the envelope as received, which is read as `readReceivedEnvelope` reads it, or one already read. ES: el sobre como se recibió, que se lee como lo lee `readReceivedEnvelope`, o uno ya leído.
 * @param input EN: the company, the certificate, the decisions and the clock. ES: la empresa, el certificado, las decisiones y el reloj.
 * @returns EN: the signed `RespuestaDTE`. ES: la `RespuestaDTE` firmada.
 * @throws {DteError} EN: the codes of `readReceivedEnvelope`; `INVALID_RUT { field: 'companyRut' }`; `INVALID_OPTION` (`state`, `gloss`, `rejectionCode`, `envelopeCode`, `answerId`, and `documents` for a record when two documents share a key); `ENVELOPE_EMPTY` when every document is left out. ES: los mismos códigos.
 */
export const createResultAnswer = (received: string | ReceivedEnvelope, input: ResultAnswerInput): string =>
  resultAnswerOf(envelopeOf(received), input)

/**
 * EN: `createGoodsReceipts` for an envelope already read. The certification's exchange builds on it, so it does not
 * carry the strict reader of the text.
 * ES: `createGoodsReceipts` para un sobre ya leído. El intercambio de la certificación se arma sobre ella, así no
 * carga el lector estricto del texto.
 * @param envelope EN: the envelope read. ES: el sobre leído.
 * @param input EN: the company, the certificate, the decisions and the clock. ES: la empresa, el certificado, las decisiones y el reloj.
 * @returns EN: the signed `EnvioRecibos`. ES: el `EnvioRecibos` firmado.
 */
export const goodsReceiptsOf = (envelope: ReceivedEnvelope, input: GoodsReceiptsInput): string => {
  const common = context(input)
  const signer =
    input.signerRut === undefined ? (input.certificate.rut ?? common.company) : toSiiRut(input.signerRut, 'signerRut')
  const receipted = resolveDecisions<GoodsReceiptDecision>(envelope, input.documents, (document) =>
    document.receiverRut === common.company && RECEIPT_TYPES.includes(document.type) ? {} : null,
  )
  if (receipted.length === 0) throw new DteError('ENVELOPE_EMPTY', { field: 'Recibo' })
  const receipts = receipted
    .map(({ document, decision }, index) => {
      const place = decision.place ?? DEFAULT_RECEIPT_PLACE
      if (place.length > 80) invalid('place')
      return signedReceipt(document, index + 1, place, signer, common.stamp, input.certificate)
    })
    .join('')
  const unsigned = buildXml({
    EnvioRecibos: {
      ...rootAttributes(RECEIPTS_SCHEMA),
      SetRecibos: {
        '@_ID': `SetRecibos_${common.ms}`,
        Caratula: {
          '@_version': '1.0',
          RutResponde: common.company,
          RutRecibe: envelope.issuerRut,
          ...common.contact,
          TmstFirmaEnv: common.stamp,
        },
      },
    },
  }).replace('</SetRecibos>', () => `${receipts}</SetRecibos>`)
  return signEnveloped({
    xml: unsigned,
    elementTag: 'SetRecibos',
    rootTag: 'EnvioRecibos',
    certificate: input.certificate,
  }).xml
}

/**
 * EN: Builds and signs the receipts of Ley 19.983, the `EnvioRecibos` that acknowledges the goods or services of the
 * documents of a received envelope: one `Recibo`, signed on its own, for each document, and the set signed again.
 * By default it receipts the documents addressed to the company of the types the law names (33, 34, 43, 46 and 52);
 * the caller can decide each document (`null` leaves it out) and its place of reception. The declaration is the one the
 * format fixes. One line, UTF-8, no declaration; the ids carry the clock in milliseconds and every timestamp is Chile's
 * local time.
 * ES: Arma y firma los recibos de la Ley 19.983, el `EnvioRecibos` que acusa recibo de las mercaderías o los servicios
 * de los documentos de un sobre recibido: un `Recibo`, firmado por sí solo, por documento, y el set firmado de nuevo.
 * Por defecto recibe los documentos dirigidos a la empresa de los tipos que nombra la ley (33, 34, 43, 46 y 52); quien
 * llama puede decidir cada documento (`null` lo deja fuera) y su recinto. La declaración es la que fija el formato.
 * Una línea, UTF-8, sin declaración; los ids llevan el reloj en milisegundos y cada marca de tiempo es la hora local
 * de Chile.
 * @param received EN: the envelope as received, which is read as `readReceivedEnvelope` reads it, or one already read. ES: el sobre como se recibió, que se lee como lo lee `readReceivedEnvelope`, o uno ya leído.
 * @param input EN: the company, the certificate, the decisions and the clock. ES: la empresa, el certificado, las decisiones y el reloj.
 * @returns EN: the signed `EnvioRecibos`. ES: el `EnvioRecibos` firmado.
 * @throws {DteError} EN: the codes of `readReceivedEnvelope`; `INVALID_RUT` (`companyRut`, `signerRut`); `INVALID_OPTION` (`place`, and `documents` for a record when two documents share a key); `ENVELOPE_EMPTY` when no document is left to receipt. ES: los mismos códigos.
 */
export const createGoodsReceipts = (received: string | ReceivedEnvelope, input: GoodsReceiptsInput): string =>
  goodsReceiptsOf(envelopeOf(received), input)
