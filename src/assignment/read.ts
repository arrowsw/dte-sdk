import { verifyDocumentSignature } from '../document/sign'
import { DteError } from '../errors'
import { verifyEnveloped, XMLDSIG_NS, type SignatureVerification } from '../signature/xmldsig'
import { childElements, declarationsOf } from '../xml/elements'
import { escapeXmlAttribute } from '../xml/escape'
import { parseXmlDom } from '../xml/parse'

/**
 * EN: The SII's namespace, which every element of an assignment file is in.
 * ES: El namespace del SII, en el que está todo elemento de un archivo de cesión.
 */
export const SII_NS = 'http://www.sii.cl/SiiDte'

/**
 * EN: One signed zone of an assignment file: its element and its text, cut from the file as it came, with the namespace
 * declarations it inherits written on its start tag, so it verifies on its own as it does in the file.
 * ES: Una zona firmada de un archivo de cesión: su elemento y su texto, cortado del archivo tal como vino, con las
 * declaraciones de namespace que hereda escritas en su etiqueta de inicio, así verifica por sí sola como en el archivo.
 */
export type AssignmentZone = {
  /** EN: The element, in the file's DOM. ES: El elemento, en el DOM del archivo. */
  readonly element: Element
  /** EN: Its text, standing on its own. ES: Su texto, por sí solo. */
  readonly text: string
}

/**
 * EN: An assignment file, read: its root, the assigned document, the zone that carries it and each assignment.
 * ES: Un archivo de cesión, leído: su raíz, el documento cedido, la zona que lo lleva y cada cesión.
 */
export type AssignmentFile = {
  /** EN: The `AEC` element. ES: El elemento `AEC`. */
  readonly root: Element
  /** EN: The `DTE`. ES: El `DTE`. */
  readonly document: AssignmentZone
  /** EN: The `DTECedido`. ES: El `DTECedido`. */
  readonly assignedDocument: AssignmentZone
  /** EN: The `Cesion` elements, in the order of the file. ES: Los elementos `Cesion`, en el orden del archivo. */
  readonly assignments: readonly AssignmentZone[]
}

const refuse = (field: string, reason: string): never => {
  throw new DteError('XML_PARSE_FAILED', { field, reason })
}

// The child elements of `parent` named `tag` in the SII's namespace, unprefixed: a reader that matches names by
// prefix and one that matches them by namespace see the same elements.
const childrenNamed = (parent: Element, tag: string): readonly Element[] =>
  childElements(parent).filter((element) => element.tagName === tag && element.namespaceURI === SII_NS)

const onlyChild = (parent: Element, tag: string): Element => {
  const found = childrenNamed(parent, tag)
  return found.length === 1 ? found[0] : refuse(tag, `expected one ${tag} in ${parent.tagName}`)
}

// Namespace declarations in scope at `element` that it does not carry itself, the nearest ancestor winning.
const inherited = (element: Element): readonly (readonly [string, string])[] => {
  const own = new Set(declarationsOf(element).map(([name]) => name))
  const scope = new Map<string, string>()
  const ancestors: Element[] = []
  for (let node = element.parentNode; node !== null && node.nodeType === 1; node = node.parentNode)
    ancestors.unshift(node as Element)
  for (const ancestor of ancestors) for (const [name, value] of declarationsOf(ancestor)) scope.set(name, value)
  return Array.from(scope).filter(([name]) => !own.has(name))
}

/**
 * EN: The text of an element cut from the file, with the declarations it inherits added to its start tag. Inclusive
 * C14N writes every namespace in scope on the element it canonicalizes, so the text then canonicalizes on its own as
 * the element does in the file, and its signatures verify the same.
 * ES: El texto de un elemento cortado del archivo, con las declaraciones que hereda agregadas a su etiqueta de inicio.
 * C14N inclusivo escribe todo namespace en alcance en el elemento que canonicaliza, así el texto canonicaliza por sí
 * solo como el elemento en el archivo, y sus firmas verifican igual.
 */
export const standalone = (element: Element, text: string): string => {
  const added = inherited(element)
    .map(([name, value]) => ` ${name}="${escapeXmlAttribute(value)}"`)
    .join('')
  return `<${element.tagName}${added}${text.slice(element.tagName.length + 1)}`
}

// The texts of the elements named `tag` in `xml`, in order, which must be as many as the elements read: a comment or a
// CDATA section that holds the same markup would otherwise shift them.
const textsOf = (xml: string, tag: string, elements: readonly Element[]): readonly string[] => {
  const texts = Array.from(xml.matchAll(new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, 'g')), (match) => match[0])
  return texts.length === elements.length ? texts : refuse(tag, `the text does not hold one ${tag} per element`)
}

const zone = (element: Element, text: string): AssignmentZone => ({ element, text: standalone(element, text) })

/**
 * EN: Reads an assignment file into its signed zones, strictly: an unprefixed `AEC` in the SII's namespace, with one
 * `DocumentoAEC`, its `Cesiones` holding one `DTECedido` and at least one `Cesion`, and the `DTECedido` one
 * `DocumentoDTECedido` with one `DTE`. No DOCTYPE is read. Each zone's text is cut from the file as it came, so what
 * is verified, or carried on to a later assignment, is what was signed.
 * ES: Lee un archivo de cesión en sus zonas firmadas, de forma estricta: un `AEC` sin prefijo en el namespace del SII,
 * con un `DocumentoAEC`, cuyas `Cesiones` llevan un `DTECedido` y al menos una `Cesion`, y el `DTECedido` un
 * `DocumentoDTECedido` con un `DTE`. No se lee ningún DOCTYPE. El texto de cada zona se corta del archivo tal como vino,
 * así lo que se verifica, o se lleva a una cesión posterior, es lo que se firmó.
 * @param xml EN: the file as text. ES: el archivo como texto.
 * @returns EN: the file read. ES: el archivo leído.
 * @throws {DteError} EN: `XML_PARSE_FAILED` for malformed XML, a DOCTYPE or a structure other than the one above. ES: `XML_PARSE_FAILED` para XML malformado, un DOCTYPE o una estructura distinta de la descrita.
 */
export const readAssignmentFile = (xml: string): AssignmentFile => {
  if (/<!DOCTYPE/i.test(xml)) refuse('DOCTYPE', 'a DOCTYPE is not read')
  const root = parseXmlDom(xml).documentElement
  if (root.tagName !== 'AEC' || root.namespaceURI !== SII_NS) refuse('AEC', 'expected an AEC in the SII namespace')
  const transfers = onlyChild(onlyChild(root, 'DocumentoAEC'), 'Cesiones')
  const assignedDocument = onlyChild(transfers, 'DTECedido')
  const document = onlyChild(onlyChild(assignedDocument, 'DocumentoDTECedido'), 'DTE')
  const assignments = childrenNamed(transfers, 'Cesion')
  if (assignments.length === 0) refuse('Cesion', 'expected at least one Cesion')
  const [assignedText] = textsOf(xml, 'DTECedido', [assignedDocument])
  const [documentText] = textsOf(assignedText, 'DTE', [document])
  const assignmentTexts = textsOf(xml, 'Cesion', assignments)
  return {
    root,
    document: zone(document, documentText),
    assignedDocument: zone(assignedDocument, assignedText),
    assignments: assignments.map((element, index) => zone(element, assignmentTexts[index])),
  }
}

/**
 * EN: The verification of every signature of an assignment file.
 * ES: La verificación de cada firma de un archivo de cesión.
 */
export type AssignmentVerification = {
  /** EN: The signature of the assigned document itself, as its issuer signed it. ES: `DTE` — La firma del propio documento cedido, como lo firmó su emisor. */
  readonly document: SignatureVerification
  /** EN: The signature over the zone of the assigned document. ES: `DocumentoDTECedido` — La firma sobre el área del documento cedido. */
  readonly assignedDocument: SignatureVerification
  /** EN: Each assignment's signatures, one per authorized signer, in the order of the file. ES: `DocumentoCesion` — Las firmas de cada cesión, una por persona autorizada, en el orden del archivo. */
  readonly assignments: readonly (readonly SignatureVerification[])[]
  /** EN: The signature over the whole file. ES: `DocumentoAEC` — La firma sobre todo el archivo. */
  readonly file: SignatureVerification
  /** EN: Every one of them verified. ES: Todas verificaron. */
  readonly valid: boolean
}

const CESION_END = '</Cesion>'
const DOCUMENT_END = '</DocumentoCesion>'
const SIGNATURE = /<Signature[\s>][\s\S]*?<\/Signature>/g

// Each signature of a `Cesion` checked on its own: the `Cesion` with that signature alone. The enveloped-signature
// transform leaves the signed `DocumentoCesion` as it is whatever signatures sit beside it.
const assignmentSignatures = (assignment: AssignmentZone): readonly SignatureVerification[] => {
  const end = assignment.text.indexOf(DOCUMENT_END)
  if (end === -1) refuse('DocumentoCesion', 'expected a DocumentoCesion with its closing tag')
  const head = assignment.text.slice(0, end + DOCUMENT_END.length)
  const signatures = Array.from(assignment.text.slice(head.length).matchAll(SIGNATURE), (match) => match[0])
  // The schema admits nothing after `DocumentoCesion` but signatures, and they are its siblings: one found by its text
  // inside another element is not a signature of this assignment.
  const [, ...after] = childElements(assignment.element)
  const isSignature = (element: Element): boolean =>
    element.tagName === 'Signature' && element.namespaceURI === XMLDSIG_NS
  if (signatures.length !== after.length || !after.every(isSignature))
    refuse('Signature', 'expected only unprefixed signatures after DocumentoCesion')
  if (signatures.length === 0) throw new DteError('SIGNATURE_NOT_FOUND', { field: 'Cesion' })
  return signatures.map((signature) =>
    verifyEnveloped(`${head}${signature}${CESION_END}`, { elementTag: 'DocumentoCesion', rootTag: 'Cesion' }),
  )
}

/**
 * EN: **Unstable**: it is held to the files the builders write, none of which has been registered at the SII yet, so
 * its shape may change in any release, a patch included.
 * Verifies every signature of an assignment file (AEC): the assigned document's own, the one over its zone, each
 * signature of each assignment and the one over the whole file. Each zone is checked as it stands in the file, with
 * the namespaces it inherits there, so a result is the one a verifier of the whole file reaches. Pure: no clock and no
 * network. Whose certificates they are is not checked.
 * ES: **Inestable**: se rige por los archivos que arman los constructores, ninguno de los cuales se ha registrado aún en
 * el SII, así que su forma puede cambiar en cualquier versión, incluso un patch.
 * Verifica cada firma de un archivo de cesión (AEC): la del propio documento cedido, la de su área, cada firma de
 * cada cesión y la de todo el archivo. Cada zona se revisa como está en el archivo, con los namespaces que hereda ahí,
 * así un resultado es el que obtiene quien verifica el archivo completo. Pura: sin reloj ni red. No revisa de quién
 * son los certificados.
 * @param xml EN: the file as text. ES: el archivo como texto.
 * @returns EN: each signature's verification, and whether all of them verified. ES: la verificación de cada firma, y si todas verificaron.
 * @throws {DteError} EN: `XML_PARSE_FAILED` (see `readAssignmentFile`), `SIGNATURE_NOT_FOUND` for a zone without a signature. ES: `XML_PARSE_FAILED` (ver `readAssignmentFile`), `SIGNATURE_NOT_FOUND` para una zona sin firma.
 */
export const unstable_verifyAssignment = (xml: string): AssignmentVerification => {
  const file = readAssignmentFile(xml)
  const document = verifyDocumentSignature(file.document.text)
  const assignedDocument = verifyEnveloped(file.assignedDocument.text, {
    elementTag: 'DocumentoDTECedido',
    rootTag: 'DTECedido',
  })
  const assignments = file.assignments.map(assignmentSignatures)
  const whole = verifyEnveloped(xml, { elementTag: 'DocumentoAEC', rootTag: 'AEC' })
  const all = [document, assignedDocument, ...assignments.flat(), whole]
  return { document, assignedDocument, assignments, file: whole, valid: all.every((check) => check.valid) }
}
