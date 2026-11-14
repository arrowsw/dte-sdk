import { DteError } from '../errors'
import { child, childElements, descendants, integer, named, signedInteger, textAt } from '../xml/elements'
import { parseXmlDom } from '../xml/parse'

const ROOTS = ['DTE', 'EnvioDTE', 'EnvioBOLETA'] as const
const SIGNED_ELEMENTS = ['Documento', 'Liquidacion']

/**
 * EN: The root of a received input: one document or an envelope.
 * ES: La raíz de una entrada recibida: un documento o un sobre.
 */
export type ReceivedRoot = (typeof ROOTS)[number]

/**
 * EN: The header fields of a received document, each null when absent, and the numbers when they are not whole numbers
 * written in digits.
 * ES: Los campos del encabezado de un documento recibido, cada uno null si falta, y los números si no son enteros
 * escritos en dígitos.
 */
export type ReceivedHeader = {
  /** EN: Document type. ES: `TipoDTE` — Tipo de documento. */
  readonly type: number | null
  /** EN: Folio. ES: `Folio` — Folio. */
  readonly folio: number | null
  /** EN: Issue date as written. ES: `FchEmis` — Fecha de emisión tal como viene. */
  readonly issueDate: string | null
  /** EN: Issuer RUT as written. ES: `RUTEmisor` — RUT del emisor tal como viene. */
  readonly issuerRut: string | null
  /** EN: Receiver RUT as written. ES: `RUTRecep` — RUT del receptor tal como viene. */
  readonly receiverRut: string | null
  /** EN: Total amount, which may be zero or negative. ES: `MntTotal` — Monto total, que puede ser cero o negativo. */
  readonly totalAmount: number | null
}

/**
 * EN: One document of a received input, as its elements.
 * ES: Un documento de una entrada recibida, como sus elementos.
 */
export type ReceivedDocumentElements = {
  /** EN: The `DTE` element. ES: El elemento `DTE`. */
  readonly element: Element
  /** EN: Its signed element, the one `Documento` or `Liquidacion`. ES: Su elemento firmado, el único `Documento` o `Liquidacion`. */
  readonly signed: Element
  /** EN: The header read from the signed element. ES: El encabezado leído del elemento firmado. */
  readonly header: ReceivedHeader
}

/**
 * EN: A received input, read: its root, its set and its documents.
 * ES: Una entrada recibida, leída: su raíz, su set y sus documentos.
 */
export type ReceivedStructure = {
  /** EN: The name of the root. ES: El nombre de la raíz. */
  readonly rootTag: ReceivedRoot
  /** EN: The root element. ES: El elemento raíz. */
  readonly root: Element
  /** EN: The one `SetDTE` of an envelope; undefined for a single `DTE`. ES: El único `SetDTE` de un sobre; undefined para un `DTE` solo. */
  readonly set: Element | undefined
  /** EN: Every document, in the order of the input. ES: Cada documento, en el orden de la entrada. */
  readonly documents: readonly ReceivedDocumentElements[]
}

const readHeader = (signed: Element): ReceivedHeader => {
  const header = child(signed, 'Encabezado')
  return {
    type: integer(textAt(header, 'IdDoc', 'TipoDTE')),
    folio: integer(textAt(header, 'IdDoc', 'Folio')),
    issueDate: textAt(header, 'IdDoc', 'FchEmis'),
    issuerRut: textAt(header, 'Emisor', 'RUTEmisor'),
    receiverRut: textAt(header, 'Receptor', 'RUTRecep'),
    totalAmount: signedInteger(textAt(header, 'Totales', 'MntTotal')),
  }
}

const readDocument = (element: Element, index: number): ReceivedDocumentElements => {
  const signedElements = childElements(element).filter((node) => SIGNED_ELEMENTS.includes(node.localName))
  if (signedElements.length !== 1 || signedElements[0].tagName !== signedElements[0].localName)
    throw new DteError('XML_PARSE_FAILED', {
      field: 'Documento',
      index,
      reason: 'expected one Documento or Liquidacion',
    })
  const signed = signedElements[0]
  return { element, signed, header: readHeader(signed) }
}

/**
 * EN: Reads a `DTE`, `EnvioDTE` or `EnvioBOLETA` as received, strictly, into its elements: the one reading that
 * verifying the documents and answering them share, so what is answered is what was verified. No DOCTYPE is read; an
 * envelope has exactly one `SetDTE`, a child of its root, and every `DTE` of the input is a child of it, unprefixed;
 * each `DTE` holds one unprefixed `Documento` or `Liquidacion`, whose header is read by the full name of each element,
 * the first when one is repeated.
 * ES: Lee un `DTE`, `EnvioDTE` o `EnvioBOLETA` tal como llega, de forma estricta, a sus elementos: la única lectura que
 * comparten verificar los documentos y responderlos, así lo que se responde es lo que se verificó. No se lee ningún
 * DOCTYPE; un sobre tiene exactamente un `SetDTE`, hijo de su raíz, y todo `DTE` de la entrada es hijo suyo, sin
 * prefijo; cada `DTE` tiene un `Documento` o `Liquidacion` sin prefijo, cuyo encabezado se lee por el nombre completo
 * de cada elemento, el primero cuando uno viene repetido.
 * @param xml EN: the input as received. ES: la entrada como se recibió.
 * @returns EN: the root, the set and the documents. ES: la raíz, el set y los documentos.
 * @throws {DteError} EN: `XML_PARSE_FAILED` for empty or malformed XML, a DOCTYPE, another root, an envelope without exactly one `SetDTE`, a `DTE` out of place or prefixed, or a `DTE` without one unprefixed `Documento` or `Liquidacion`; `ENVELOPE_EMPTY` for an envelope without documents. ES: `XML_PARSE_FAILED` para XML vacío o malformado, un DOCTYPE, otro raíz, un sobre sin exactamente un `SetDTE`, un `DTE` fuera de lugar o con prefijo, o un `DTE` sin un `Documento` o `Liquidacion` sin prefijo; `ENVELOPE_EMPTY` para un sobre sin documentos.
 */
export const readReceivedStructure = (xml: string): ReceivedStructure => {
  if (typeof xml !== 'string' || xml.trim() === '') throw new DteError('XML_PARSE_FAILED', { reason: 'empty' })
  // The parsers read a DOCTYPE differently (xmldom takes markup in an entity for elements), so none is read.
  if (/<!DOCTYPE/i.test(xml))
    throw new DteError('XML_PARSE_FAILED', { field: 'DOCTYPE', reason: 'a DOCTYPE is not read' })
  const root = parseXmlDom(xml).documentElement
  const rootTag = ROOTS.find((tag) => tag === root.tagName)
  if (rootTag === undefined)
    throw new DteError('XML_PARSE_FAILED', {
      field: 'root',
      root: root.tagName,
      reason: 'expected DTE, EnvioDTE or EnvioBOLETA',
    })
  // One SetDTE, so the one the envelope's signature covers is the one whose documents are read.
  const sets = rootTag === 'DTE' ? [] : childElements(root).filter((element) => element.tagName === 'SetDTE')
  if (rootTag !== 'DTE' && sets.length !== 1)
    throw new DteError('XML_PARSE_FAILED', { field: 'SetDTE', reason: 'expected one SetDTE' })
  const set = sets[0]
  const placed = set === undefined ? [root] : childElements(set).filter((element) => element.tagName === 'DTE')
  const total = named([root, ...descendants(root)], 'DTE').length
  if (total === 0) throw new DteError('ENVELOPE_EMPTY', { field: 'SetDTE' })
  if (placed.length !== total) throw new DteError('XML_PARSE_FAILED', { field: 'DTE', reason: 'a DTE out of place' })
  return { rootTag, root, set, documents: placed.map(readDocument) }
}
