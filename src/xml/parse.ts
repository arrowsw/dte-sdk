import { DOMParser } from '@xmldom/xmldom'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { DteError, errorMessage } from '../errors'

/**
 * EN: Result of parsing XML into a plain object: elements become keys, repeated elements become arrays, attributes are
 * `@_name` keys and every value stays a string.
 * ES: Resultado de parsear XML a objeto plano: los elementos son claves, los repetidos son arreglos, los atributos son
 * claves `@_nombre` y todo valor queda como string.
 */
export type ParsedXml = Readonly<Record<string, unknown>>

/**
 * EN: DOM document type returned by `parseXmlDom`.
 * ES: Tipo del documento DOM que devuelve `parseXmlDom`.
 */
export type XmlDocument = ReturnType<DOMParser['parseFromString']>

const base = { ignoreAttributes: false, attributeNamePrefix: '@_', trimValues: true, parseTagValue: false } as const
const objectParser = new XMLParser(base)
const noNamespaceParser = new XMLParser({ ...base, removeNSPrefix: true })
const looseParser = new XMLParser({ ...base, parseTagValue: true })
const XML_ENTITIES: Readonly<Record<string, string>> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }
// A character XML allows: a reference to any other one is left as written, as the parsers leave it.
const isXmlChar = (code: number): boolean =>
  code === 0x9 ||
  code === 0xa ||
  code === 0xd ||
  (code >= 0x20 && code <= 0xd7ff) ||
  (code >= 0xe000 && code <= 0xfffd) ||
  (code >= 0x10000 && code <= 0x10ffff)
// The five XML entities and numeric character references, in one pass, so `&amp;#67;` stays `&#67;`, as the DOM reads
// it. No other named entity is read: without a DOCTYPE the DOM knows none.
const decodeReferences = (text: string): string =>
  text.replace(
    /&(?:#(\d+)|#x([0-9a-fA-F]+)|(lt|gt|amp|quot|apos));/g,
    (reference, decimal?: string, hex?: string, name?: string) => {
      if (name !== undefined) return XML_ENTITIES[name]
      const code = decimal === undefined ? Number.parseInt(hex!, 16) : Number(decimal)
      return isXmlChar(code) ? String.fromCodePoint(code) : reference
    },
  )
// The decoder keeps no state: entities a DOCTYPE declares are not expanded, and nothing else is set on it.
const ignore = (): void => undefined
const referenceParser = new XMLParser({
  ...base,
  entityDecoder: {
    setExternalEntities: ignore,
    addInputEntities: ignore,
    reset: ignore,
    setXmlVersion: ignore,
    decode: decodeReferences,
  },
})

const assertWellFormed = (xml: string): void => {
  const result = XMLValidator.validate(xml)
  if (result !== true)
    throw new DteError('XML_PARSE_FAILED', { line: result.err.line, column: result.err.col, reason: result.err.msg })
}

/**
 * EN: Parses XML into a plain object (values as strings). Throws `XML_PARSE_FAILED` when not well-formed.
 * ES: Parsea XML a objeto plano (valores como string). Lanza `XML_PARSE_FAILED` si no está bien formado.
 */
export const parseXml = (xml: string): ParsedXml => {
  assertWellFormed(xml)
  return objectParser.parse(xml) as ParsedXml
}

/**
 * EN: Like `parseXml`, with numeric character references (`&#209;`, `&#xD1;`) decoded as a DOM decodes them, where
 * `parseXml` keeps them as written. For text read field by field beside a DOM reading of it, as a CAF is.
 * ES: Como `parseXml`, con las referencias numéricas de carácter (`&#209;`, `&#xD1;`) decodificadas como las decodifica
 * un DOM, donde `parseXml` las deja tal cual. Para un texto que se lee campo por campo junto a una lectura DOM de él,
 * como un CAF.
 */
export const parseXmlWithReferences = (xml: string): ParsedXml => {
  assertWellFormed(xml)
  return referenceParser.parse(xml) as ParsedXml
}

/**
 * EN: Like `parseXml` but drops namespace prefixes (`SII:RESPUESTA` → `RESPUESTA`), handy for SOAP responses.
 * ES: Como `parseXml` pero quita los prefijos de namespace (`SII:RESPUESTA` → `RESPUESTA`), útil para respuestas SOAP.
 */
export const parseXmlWithoutNamespaces = (xml: string): ParsedXml => {
  assertWellFormed(xml)
  return noNamespaceParser.parse(xml) as ParsedXml
}

/**
 * EN: Parses XML the loose way, for input whose reader in the field is this loose: nothing is checked for
 * well-formedness (whatever can be read is read), tags keep their prefixes, and a text that reads as a number becomes
 * one (`007` is 7, `1e3` is 1000). Throws `XML_PARSE_FAILED` only when the parser itself gives up.
 * ES: Parsea XML con tolerancia, para entradas cuyo lector de campo es así de tolerante: no se comprueba que esté bien
 * formado (se lee lo que se pueda leer), las etiquetas conservan sus prefijos, y un texto que se lee como número pasa
 * a serlo (`007` es 7, `1e3` es 1000). Lanza `XML_PARSE_FAILED` solo cuando el propio parser se rinde.
 */
export const parseXmlLoosely = (xml: string): ParsedXml => {
  try {
    return looseParser.parse(xml) as ParsedXml
  } catch (error) {
    throw new DteError('XML_PARSE_FAILED', { reason: errorMessage(error) })
  }
}

const failDom = (message: string): never => {
  throw new DteError('XML_PARSE_FAILED', { reason: message })
}

// `assertWellFormed` runs first, so xmldom only ever sees well-formed input; what it can still object to (an
// undefined entity, say) it reports as an error, never as a warning.
const domParser = new DOMParser({ locator: {}, errorHandler: { error: failDom, fatalError: failDom } })

// No document the SII or an issuer writes nests more than a dozen elements; what reads a DOM walks it recursively, and a
// few thousand levels overflow the stack.
const MAX_DEPTH = 100

// Walked with a list of its own, not recursively, so the walk itself cannot overflow.
const assertShallow = (document: XmlDocument): void => {
  const pending: { readonly node: Node; readonly depth: number }[] = [{ node: document.documentElement, depth: 1 }]
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (next.depth > MAX_DEPTH)
      throw new DteError('XML_PARSE_FAILED', { reason: `nested deeper than ${MAX_DEPTH} elements` })
    for (let child = next.node.firstChild; child !== null; child = child.nextSibling)
      if (child.nodeType === 1) pending.push({ node: child, depth: next.depth + 1 })
  }
}

/**
 * EN: Parses XML into a DOM (needed by canonicalization and signature verification). Elements nested deeper than 100
 * levels are `XML_PARSE_FAILED`, before anything walks them.
 * ES: Parsea XML a un DOM (lo necesitan la canonicalización y la verificación de firmas). Elementos anidados a más de 100
 * niveles son `XML_PARSE_FAILED`, antes de que algo los recorra.
 */
export const parseXmlDom = (xml: string): XmlDocument => {
  assertWellFormed(xml)
  const document = domParser.parseFromString(xml, 'application/xml')
  assertShallow(document)
  return document
}

/**
 * EN: Text of the first `<tag>…</tag>` occurrence, or `null`. Regex-based, for flat SII responses.
 * ES: Texto de la primera ocurrencia de `<tag>…</tag>`, o `null`. Por regex, para respuestas planas del SII.
 */
export const extractTagContent = (xml: string, tag: string): string | null => {
  const match = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i').exec(xml)
  return match ? match[1] : null
}

/**
 * EN: Decodes the five XML entities (SOAP responses often embed escaped XML).
 * ES: Decodifica las cinco entidades XML (las respuestas SOAP suelen traer XML escapado).
 */
export const decodeXmlEntities = (xml: string): string =>
  xml
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
