import { DteError } from '../errors'
import { parseXmlLoosely } from '../xml/parse'

const ENVELOPE_ROOTS = ['EnvioDTE', 'EnvioDTEB', 'EnvioDTETraslado', 'EnvioBOLETA'] as const
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
  /** EN: Issue date, `YYYY-MM-DD`, or null when the document has none (the answers then carry an empty element). ES: `FchEmis` — Fecha de emisión, `AAAA-MM-DD`, o null si el documento no trae (las respuestas llevan entonces un elemento vacío). */
  readonly issueDate: string | null
  /** EN: The issuer, the document's or the cover's, as the envelope wrote it without dots and upper-cased; `''` when neither names one. ES: `RUTEmisor` — El emisor, el del documento o el de la carátula, como lo escribió el sobre sin puntos y en mayúsculas; `''` si ninguno lo nombra. */
  readonly issuerRut: string
  /** EN: The receiver, the document's or the cover's, as the envelope wrote it without dots and upper-cased; `''` when neither names one. ES: `RUTRecep` — El receptor, el del documento o el de la carátula, como lo escribió el sobre sin puntos y en mayúsculas; `''` si ninguno lo nombra. */
  readonly receiverRut: string
  /** EN: The total, 0 when the document has none or it is not a number. ES: `MntTotal` — El total, 0 si el documento no trae o no es un número. */
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

// The first of these that the envelope really gives, the way its fields chain: an absent element, an empty one and a
// zero all count as not given.
const firstOf = (...values: readonly (Scalar | null)[]): string | null => {
  const given = values.find((value) => value !== null && value !== '' && value !== 0)
  return given === undefined ? null : String(given)
}

// A number the envelope writes loosely reads as its leading digits, and as 0 when it has none.
const looseInteger = (value: Scalar | null): number => Number.parseInt(String(value ?? ''), 10) || 0

// The RUTs of an envelope are the sender's: they are not validated, as the SII's own test companies need (so rut.ts has
// nothing to say here); only the dots go and the verifier letter is upper-cased.
const envelopeRut = (value: string | null): string => (value === null ? '' : value.replace(/\./g, '').toUpperCase())

const optionalEnvelopeRut = (value: Scalar | null): string | null => {
  const rut = firstOf(value)
  return rut === null ? null : envelopeRut(rut)
}

const documentOf = (dte: Node | null, coverIssuer: string, coverReceiver: string | null): ReceivedEnvelopeDocument => {
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
    issuerRut: envelopeRut(firstOf(scalarOf(issuer, 'RUTEmisor'), scalarOf(issuer, 'RutEmisor'), coverIssuerRut)),
    receiverRut: envelopeRut(firstOf(scalarOf(receiver, 'RUTRecep'), scalarOf(receiver, 'RutRecep'), coverReceiver)),
    total: looseInteger(scalarOf(nodeOf(header?.['Totales']), 'MntTotal')),
  }
}

/**
 * EN: Reads a received envelope loosely, to answer it: the XML is not checked for well-formedness and its tags are
 * read by their full name, so a prefixed envelope is no envelope; the root is `EnvioDTE`, `EnvioDTEB`,
 * `EnvioDTETraslado` or `EnvioBOLETA`; the set id (the `ID` attribute, else an `ID` child, else `SetDTE`), the cover's
 * RUTs and, per document, its type (`TipoDTE` or `TpoDoc`), folio, issue date, issuer and receiver (the cover's when
 * the document names none) and total. A number is read as the parser reads it (`1e3` is 1000) and is 0 when it cannot
 * be read, an absent date is null and an absent RUT is empty. The RUTs are not validated: only their dots are removed
 * and their letter is upper-cased. It does not check the signature or the stamps: `verifyReceivedDocuments` does.
 * ES: Lee un sobre recibido con tolerancia, para responderlo: no se comprueba que el XML esté bien formado y sus
 * etiquetas se leen por su nombre completo, así que un sobre con prefijo no es un sobre; la raíz es `EnvioDTE`,
 * `EnvioDTEB`, `EnvioDTETraslado` o `EnvioBOLETA`; el id del set (el atributo `ID`, si no un hijo `ID`, si no
 * `SetDTE`), los RUT de la carátula y, por documento, su tipo (`TipoDTE` o `TpoDoc`), folio, fecha de emisión, emisor y
 * receptor (los de la carátula cuando el documento no los nombra) y total. Un número se lee como lo lee el parser
 * (`1e3` es 1000) y vale 0 si no se puede leer, una fecha ausente es null y un RUT ausente queda vacío. Los RUT no se
 * validan: solo se les quitan los puntos y se sube su letra a mayúscula. No chequea la firma ni los timbres:
 * `verifyReceivedDocuments` lo hace.
 * @param envelopeXml EN: the envelope as received. ES: el sobre como se recibió.
 * @returns EN: the envelope read. ES: el sobre leído.
 * @throws {DteError} EN: `XML_PARSE_FAILED` (the parser gives up, or there is no envelope root), `ENVELOPE_EMPTY` (no document at all). ES: los mismos códigos.
 */
export const readReceivedEnvelope = (envelopeXml: string): ReceivedEnvelope => {
  const parsed = parseXmlLoosely(envelopeXml)
  const root = ENVELOPE_ROOTS.map((name) => nodeOf(parsed[name])).find((node) => node !== null) ?? null
  const set = nodeOf(root?.['SetDTE']) ?? nodeOf(parsed['SetDTE'])
  if (set === null) throw new DteError('XML_PARSE_FAILED', { field: 'SetDTE', reason: 'no envelope root' })
  const cover = nodeOf(set['Caratula'])
  const issuerRut = envelopeRut(firstOf(scalarOf(cover, 'RutEmisor')))
  const receiverRut = optionalEnvelopeRut(scalarOf(cover, 'RutReceptor'))
  const documents = listOf(set['DTE']).map((dte) => documentOf(nodeOf(dte), issuerRut, receiverRut))
  if (documents.length === 0) throw new DteError('ENVELOPE_EMPTY', { field: 'DTE' })
  return {
    setId: firstOf(scalarOf(set, '@_ID'), scalarOf(set, 'ID')) ?? DEFAULT_SET_ID,
    issuerRut,
    senderRut: optionalEnvelopeRut(scalarOf(cover, 'RutEnvia')),
    receiverRut,
    documents,
  }
}
