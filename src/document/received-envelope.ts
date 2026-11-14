import { DteError } from '../errors'
import { child, textAt } from '../xml/elements'
import { readReceivedStructure, type ReceivedHeader } from './received-structure'

const DEFAULT_SET_ID = 'SetDTE'

/**
 * EN: One document of a received envelope, as the answers to it describe it.
 * ES: Un documento de un sobre recibido, como lo describen las respuestas a él.
 */
export type ReceivedEnvelopeDocument = {
  /** EN: Document type. ES: `TipoDTE` — Tipo de documento. */
  readonly type: number
  /** EN: Folio. ES: `Folio` — Folio. */
  readonly folio: number
  /** EN: Issue date as the document wrote it, `YYYY-MM-DD`. `readReceivedEnvelope` always gives one; null only in an envelope built another way, and the answers then carry an empty element. ES: `FchEmis` — Fecha de emisión como la escribió el documento, `AAAA-MM-DD`. `readReceivedEnvelope` siempre la entrega; null solo en un sobre armado de otra forma, y las respuestas llevan entonces un elemento vacío. */
  readonly issueDate: string | null
  /** EN: The issuer the document names, without dots and upper-cased. ES: `RUTEmisor` — El emisor que nombra el documento, sin puntos y en mayúsculas. */
  readonly issuerRut: string
  /** EN: The receiver the document names, without dots and upper-cased. ES: `RUTRecep` — El receptor que nombra el documento, sin puntos y en mayúsculas. */
  readonly receiverRut: string
  /** EN: The total, which may be zero or negative. ES: `MntTotal` — El total, que puede ser cero o negativo. */
  readonly total: number
}

/**
 * EN: A received envelope: its id, its cover and its documents.
 * ES: Un sobre recibido: su id, su carátula y sus documentos.
 */
export type ReceivedEnvelope = {
  /** EN: `SetDTE/@ID`, `SetDTE` when absent. ES: `SetDTE/@ID`, `SetDTE` si falta. */
  readonly setId: string
  /** EN: The cover's issuer, without dots and upper-cased; `''` when the cover names none. ES: `RutEmisor` — El emisor de la carátula, sin puntos y en mayúsculas; `''` si la carátula no lo nombra. */
  readonly issuerRut: string
  /** EN: The cover's sender, without dots and upper-cased, or null. ES: `RutEnvia` — El enviador de la carátula, sin puntos y en mayúsculas, o null. */
  readonly senderRut: string | null
  /** EN: The cover's receiver, without dots and upper-cased, or null. ES: `RutReceptor` — El receptor de la carátula, sin puntos y en mayúsculas, o null. */
  readonly receiverRut: string | null
  /** EN: The documents, in envelope order. ES: Los documentos, en el orden del sobre. */
  readonly documents: readonly ReceivedEnvelopeDocument[]
}

// The RUTs of an envelope are the sender's: they are not validated (so rut.ts has nothing to say here); only the dots
// go and the verifier letter is upper-cased, so one written with dots still compares with the company's.
const envelopeRut = (value: string): string => value.replace(/\./g, '').toUpperCase()

const optionalEnvelopeRut = (value: string | null): string | null => (value === null ? null : envelopeRut(value))

// A document gives each field itself, or the envelope is refused: nothing is taken from the cover and nothing is
// converted, so what an answer says of a document is what the document says.
const refuse = (field: string, index: number, reason: string): never => {
  throw new DteError('XML_PARSE_FAILED', { field, index, reason })
}

const textOf = (value: string | null, field: string, index: number): string =>
  value ?? refuse(field, index, 'the document does not give it')

// A whole number written in digits that JavaScript holds exactly, and no less than `least`.
const wholeOf = (value: number | null, field: string, index: number, least: number): number =>
  value !== null && Number.isSafeInteger(value) && value >= least
    ? value
    : refuse(field, index, 'expected a whole number written in digits')

const documentOf = (header: ReceivedHeader, index: number): ReceivedEnvelopeDocument => ({
  type: wholeOf(header.type, 'TipoDTE', index, 1),
  folio: wholeOf(header.folio, 'Folio', index, 1),
  issueDate: textOf(header.issueDate, 'FchEmis', index),
  issuerRut: envelopeRut(textOf(header.issuerRut, 'RUTEmisor', index)),
  receiverRut: envelopeRut(textOf(header.receiverRut, 'RUTRecep', index)),
  total: wholeOf(header.totalAmount, 'MntTotal', index, Number.MIN_SAFE_INTEGER),
})

/**
 * EN: Reads a received envelope, to answer it, the way `verifyReceivedDocuments` reads it: the same strict reading of
 * the same elements, so the documents answered are the documents verified. The root is `EnvioDTE` or `EnvioBOLETA`,
 * with no DOCTYPE, exactly one `SetDTE` and every `DTE` a child of it, each with one `Documento` or `Liquidacion`. Each
 * document gives its own type (`TipoDTE`), folio, issue date, issuer, receiver and total: nothing is taken from the
 * cover, and of a repeated element the first is read, as the verification does. A document that lacks one of them, or
 * whose type, folio or total is not a whole number written in digits (the type and the folio from 1), refuses the
 * envelope; a number is never converted (`1e3`, `0x10` and `12abc` are refused). The set id is the `ID` attribute of
 * the `SetDTE`, `SetDTE` when absent; the cover gives its issuer, sender and receiver. The RUTs are not validated:
 * only their dots are removed and their letter is upper-cased. It does not check the signatures or the stamps:
 * `verifyReceivedDocuments` does, over the same text. To answer an envelope that cannot be read (`EstadoRecepEnv` 1 or
 * 91), build the `ReceivedEnvelope` by hand, with no documents.
 * ES: Lee un sobre recibido, para responderlo, como lo lee `verifyReceivedDocuments`: la misma lectura estricta de los
 * mismos elementos, así los documentos que se responden son los que se verificaron. La raíz es `EnvioDTE` o
 * `EnvioBOLETA`, sin DOCTYPE, con exactamente un `SetDTE` y todo `DTE` hijo suyo, cada uno con un `Documento` o
 * `Liquidacion`. Cada documento entrega su propio tipo (`TipoDTE`), folio, fecha de emisión, emisor, receptor y total:
 * nada se toma de la carátula, y de un elemento repetido se lee el primero, como hace la verificación. Un documento al
 * que le falta alguno, o cuyo tipo, folio o total no es un entero escrito en dígitos (el tipo y el folio desde 1),
 * hace que el sobre se rechace; un número nunca se convierte (`1e3`, `0x10` y `12abc` se rechazan). El id del set es el
 * atributo `ID` del `SetDTE`, `SetDTE` si falta; la carátula entrega su emisor, enviador y receptor. Los RUT no se
 * validan: solo se les quitan los puntos y se sube su letra a mayúscula. No chequea las firmas ni los timbres:
 * `verifyReceivedDocuments` lo hace, sobre el mismo texto. Para responder un sobre que no se puede leer
 * (`EstadoRecepEnv` 1 o 91), arma el `ReceivedEnvelope` a mano, sin documentos.
 * @param envelopeXml EN: the envelope as received. ES: el sobre como se recibió.
 * @returns EN: the envelope read. ES: el sobre leído.
 * @throws {DteError} EN: `XML_PARSE_FAILED` for empty or malformed XML, a DOCTYPE, a root that is not `EnvioDTE` or `EnvioBOLETA` (`details.field` `root`), an envelope without exactly one `SetDTE`, a `DTE` out of place or prefixed, a `DTE` without one unprefixed `Documento` or `Liquidacion`, or a document that lacks a field or gives a number that is not one (`details.field` names the element and `details.index` the document, from 0); `ENVELOPE_EMPTY` for an envelope without documents. ES: `XML_PARSE_FAILED` para XML vacío o malformado, un DOCTYPE, una raíz que no es `EnvioDTE` ni `EnvioBOLETA` (`details.field` `root`), un sobre sin exactamente un `SetDTE`, un `DTE` fuera de lugar o con prefijo, un `DTE` sin un `Documento` o `Liquidacion` sin prefijo, o un documento al que le falta un campo o trae un número que no lo es (`details.field` nombra el elemento y `details.index` el documento, desde 0); `ENVELOPE_EMPTY` para un sobre sin documentos.
 */
export const readReceivedEnvelope = (envelopeXml: string): ReceivedEnvelope => {
  const { rootTag, set, documents } = readReceivedStructure(envelopeXml)
  if (set === undefined)
    throw new DteError('XML_PARSE_FAILED', {
      field: 'root',
      root: rootTag,
      reason: 'expected EnvioDTE or EnvioBOLETA',
    })
  const cover = child(set, 'Caratula')
  return {
    setId: set.getAttribute('ID') || DEFAULT_SET_ID,
    issuerRut: envelopeRut(textAt(cover, 'RutEmisor') ?? ''),
    senderRut: optionalEnvelopeRut(textAt(cover, 'RutEnvia')),
    receiverRut: optionalEnvelopeRut(textAt(cover, 'RutReceptor')),
    documents: documents.map(({ header }, index) => documentOf(header, index)),
  }
}
