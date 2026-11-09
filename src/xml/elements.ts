import { escapeXmlAttribute, escapeXmlMarkup, escapeXmlText } from './escape'

const ELEMENT_NODE = 1
const CDATA_NODE = 4
const PROCESSING_INSTRUCTION_NODE = 7
const COMMENT_NODE = 8

/**
 * EN: The child elements of an element, in document order.
 * ES: Los elementos hijos de un elemento, en el orden del documento.
 */
export const childElements = (parent: Element): readonly Element[] =>
  Array.from(parent.childNodes).filter((node): node is Element => node.nodeType === ELEMENT_NODE)

/**
 * EN: The first child element named `tag`, or undefined.
 * ES: El primer elemento hijo llamado `tag`, o undefined.
 */
export const child = (parent: Element | undefined, tag: string): Element | undefined =>
  parent === undefined ? undefined : childElements(parent).find((element) => element.tagName === tag)

/**
 * EN: The trimmed text at a path of child elements, or null when the path is missing or the text is empty.
 * ES: El texto recortado en una ruta de elementos hijos, o null si falta la ruta o el texto está vacío.
 */
export const textAt = (parent: Element | undefined, ...path: readonly string[]): string | null => {
  const element = path.reduce<Element | undefined>(child, parent)
  const text = element?.textContent?.trim()
  return text === undefined || text === '' ? null : text
}

/**
 * EN: The text as a whole number, or null when it is not one written in digits.
 * ES: El texto como número entero, o null si no es uno escrito en dígitos.
 */
export const integer = (text: string | null): number | null =>
  text !== null && /^\d+$/.test(text) ? Number(text) : null

/**
 * EN: Every element below an element, in document order.
 * ES: Todos los elementos bajo un elemento, en el orden del documento.
 */
export const descendants = (element: Element): readonly Element[] => Array.from(element.getElementsByTagName('*'))

/**
 * EN: The elements among `elements` whose local name is `name`, whatever their prefix.
 * ES: Los elementos de `elements` cuyo nombre local es `name`, con cualquier prefijo.
 */
export const named = (elements: readonly Element[], name: string): readonly Element[] =>
  elements.filter((element) => element.localName === name)

/**
 * EN: The namespace declarations an element carries (`xmlns`, `xmlns:*`), as name and value.
 * ES: Las declaraciones de namespace que lleva un elemento (`xmlns`, `xmlns:*`), como nombre y valor.
 */
export const declarationsOf = (element: Element): readonly (readonly [string, string])[] =>
  Array.from(element.attributes)
    .filter((attribute) => attribute.name === 'xmlns' || attribute.name.startsWith('xmlns:'))
    .map((attribute) => [attribute.name, attribute.value] as const)

const UNREAD_NODES: readonly number[] = [CDATA_NODE, PROCESSING_INSTRUCTION_NODE, COMMENT_NODE]

// Text nodes have no child list in xmldom.
const nodesOf = (node: Node): readonly Node[] => [node, ...Array.from(node.childNodes ?? []).flatMap(nodesOf)]

/**
 * EN: True when an element and everything in it is plain: no prefixed element, no namespace declaration, and no
 * comment, CDATA section or processing instruction. Its element names then mean the same to every reader, whether it
 * matches names by prefix or by namespace, and its text is all in text nodes.
 * ES: True cuando un elemento y todo lo que contiene es simple: ningún elemento con prefijo, ninguna declaración de
 * namespace, y ningún comentario, sección CDATA ni instrucción de procesamiento. Sus nombres de elemento significan
 * entonces lo mismo para cualquier lector, compare nombres por prefijo o por namespace, y todo su texto está en nodos de
 * texto.
 */
export const isPlain = (element: Element): boolean =>
  nodesOf(element).every(
    (node) =>
      !UNREAD_NODES.includes(node.nodeType) &&
      (node.nodeType !== ELEMENT_NODE ||
        (!(node as Element).tagName.includes(':') && declarationsOf(node as Element).length === 0)),
  )

const flatten = (element: Element, escape: (text: string) => string): string => {
  const attributes = Array.from(
    element.attributes,
    (attribute) => ` ${attribute.name}="${escapeXmlAttribute(attribute.value)}"`,
  )
  const elements = childElements(element)
  const content =
    elements.length > 0 ? elements.map((inner) => flatten(inner, escape)).join('') : escape(String(element.textContent))
  return `<${element.tagName}${attributes.join('')}>${content}</${element.tagName}>`
}

/**
 * EN: The texts an SII-style signature over an element (`DA` under `FRMA`, `DD` under `FRMT`) may cover, written from
 * the element itself, so the bytes checked are the bytes read: the element flattened, with no whitespace between tags
 * and its attributes in document order, its texts escaped the SII's way (the five XML entities, any other character as
 * itself) or with only `&`, `<` and `>` escaped, as other writers do. The signature is over their ISO-8859-1 bytes.
 * ES: Los textos que puede cubrir una firma al estilo del SII sobre un elemento (`DA` bajo `FRMA`, `DD` bajo `FRMT`),
 * escritos desde el propio elemento, así los bytes chequeados son los bytes leídos: el elemento aplanado, sin espacios
 * entre etiquetas y con sus atributos en el orden del documento, sus textos escapados a la manera del SII (las cinco
 * entidades XML, todo otro carácter tal cual) o con solo `&`, `<` y `>` escapados, como hacen otros escritores. La firma
 * es sobre sus bytes ISO-8859-1.
 */
export const signedForms = (element: Element): readonly string[] => [
  ...new Set([flatten(element, escapeXmlText), flatten(element, escapeXmlMarkup)]),
]
