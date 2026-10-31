import { DteError } from '../errors'
import type { XmlDocument } from './parse'

const ELEMENT_NODE = 1
const TEXT_NODE = 3
const CDATA_NODE = 4

const canonicalText = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;')

const canonicalAttribute = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/\t/g, '&#x9;')
    .replace(/\n/g, '&#xA;')
    .replace(/\r/g, '&#xD;')

const isNamespaceDeclaration = (name: string): boolean => name === 'xmlns' || name.startsWith('xmlns:')

// xmlns first, then xmlns:* by name, then the rest by name (code point order).
const compareAttributeNames = (a: string, b: string): number => {
  if (a === b) return 0
  if (a === 'xmlns') return -1
  if (b === 'xmlns') return 1
  const aNs = a.startsWith('xmlns:')
  const bNs = b.startsWith('xmlns:')
  if (aNs !== bNs) return aNs ? -1 : 1
  return a < b ? -1 : 1
}

type NamespaceScope = ReadonlyMap<string, string>

const ownAttributes = (element: Element): readonly Attr[] => Array.from(element.attributes)

const renderAttributes = (attributes: readonly { readonly name: string; readonly value: string }[]): string =>
  [...attributes]
    .sort((a, b) => compareAttributeNames(a.name, b.name))
    .map((attribute) => ` ${attribute.name}="${canonicalAttribute(attribute.value)}"`)
    .join('')

const serializeNode = (node: Node, inherited: NamespaceScope): string => {
  if (node.nodeType === TEXT_NODE || node.nodeType === CDATA_NODE) return canonicalText(node.nodeValue ?? '')
  if (node.nodeType !== ELEMENT_NODE) return ''
  const element = node as Element
  const scope = new Map(inherited)
  const attributes = ownAttributes(element).filter((attribute) => {
    if (!isNamespaceDeclaration(attribute.name)) return true
    if (scope.get(attribute.name) === attribute.value) return false
    scope.set(attribute.name, attribute.value)
    return true
  })
  const children = Array.from(element.childNodes)
    .map((child) => serializeNode(child, scope))
    .join('')
  return `<${element.tagName}${renderAttributes(attributes)}>${children}</${element.tagName}>`
}

// Namespace declarations in scope at `element`, nearest ancestor winning, including the element's own.
const namespacesInScope = (element: Element): Map<string, string> => {
  const chain: Element[] = []
  for (
    let current: Node | null = element;
    current !== null && current.nodeType === ELEMENT_NODE;
    current = current.parentNode
  ) {
    chain.unshift(current as Element)
  }
  const scope = new Map<string, string>()
  for (const ancestor of chain) {
    for (const attribute of ownAttributes(ancestor)) {
      if (isNamespaceDeclaration(attribute.name)) scope.set(attribute.name, attribute.value)
    }
  }
  return scope
}

/**
 * EN: First element with that tag name, or `XML_PARSE_FAILED` when absent.
 * ES: Primer elemento con ese nombre de etiqueta, o `XML_PARSE_FAILED` si no existe.
 */
export const findElement = (dom: XmlDocument, tagName: string): Element => {
  const element = dom.getElementsByTagName(tagName)[0]
  if (element === undefined) throw new DteError('XML_PARSE_FAILED', { field: tagName, reason: 'element not found' })
  return element
}

/**
 * EN: Canonical XML 1.0 (inclusive, without comments) of one element, restricted to what SII documents use: the apex
 * declares every namespace in scope, children drop redundant `xmlns`, attributes are sorted, text escapes only
 * `& < > CR`, empty elements render as `<X></X>`. This is the byte string whose SHA-1 goes into `DigestValue`.
 * ES: Canonical XML 1.0 (inclusivo, sin comentarios) de un elemento, acotado a lo que usan los documentos del SII:
 * el apex declara todos los namespaces en alcance, los hijos omiten `xmlns` redundantes, los atributos van ordenados,
 * el texto escapa solo `& < > CR` y los elementos vacíos salen como `<X></X>`. Es el string cuyo SHA-1 va en `DigestValue`.
 */
export const canonicalizeElement = (element: Element): string => {
  const scope = namespacesInScope(element)
  const namespaceAttributes = Array.from(scope, ([name, value]) => ({ name, value }))
  const plainAttributes = ownAttributes(element).filter((attribute) => !isNamespaceDeclaration(attribute.name))
  const children = Array.from(element.childNodes)
    .map((child) => serializeNode(child, scope))
    .join('')
  return `<${element.tagName}${renderAttributes([...namespaceAttributes, ...plainAttributes])}>${children}</${element.tagName}>`
}
