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

/**
 * EN: Parses XML into a DOM (needed by canonicalization and signature verification).
 * ES: Parsea XML a un DOM (lo necesitan la canonicalización y la verificación de firmas).
 */
export const parseXmlDom = (xml: string): XmlDocument => {
  assertWellFormed(xml)
  return domParser.parseFromString(xml, 'application/xml')
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
