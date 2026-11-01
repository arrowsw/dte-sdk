import { escapeXmlText } from '../xml/escape'

const SOAP_ENVELOPE_NS = 'http://schemas.xmlsoap.org/soap/envelope/'

/**
 * EN: One rpc parameter, in the order the WSDL declares them (Axis matches by position).
 * ES: Un parámetro rpc, en el orden que declara el WSDL (Axis los asocia por posición).
 */
export type SoapParam = {
  /** EN: Parameter name. ES: Nombre del parámetro. */
  readonly name: string
  /** EN: Parameter value; escaped when the envelope is built. ES: Valor del parámetro; se escapa al armar el sobre. */
  readonly value: string
}

/**
 * EN: Input of `buildSoapEnvelope`.
 * ES: Entrada de `buildSoapEnvelope`.
 */
export type SoapEnvelopeInput = {
  /** EN: Operation name (`getSeed`, `getEstUp`, `ingresarAceptacionReclamoDoc`…). ES: Nombre de la operación. */
  readonly method: string
  /** EN: Parameters; text is XML-escaped. ES: Parámetros; el texto se escapa como XML. */
  readonly params?: readonly SoapParam[]
  /** EN: Operation namespace (WSRECLAMO, prefix `ws`); omitted for DTEWS, which accepts unqualified operations. ES: Namespace de la operación (WSRECLAMO, prefijo `ws`); se omite en DTEWS, que acepta operaciones sin calificar. */
  readonly namespace?: string
}

/**
 * EN: Headers of every SOAP 1.1 call to the SII. SOAP 1.1 writes an empty `soapAction` as `SOAPAction: ""`, two literal
 * quote characters, which is what the value holds.
 * ES: Cabeceras de toda llamada SOAP 1.1 al SII. SOAP 1.1 escribe un `soapAction` vacío como `SOAPAction: ""`, dos
 * comillas literales, que es lo que contiene el valor.
 */
export const SOAP_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'text/xml; charset=utf-8',
  SOAPAction: '""',
}

/**
 * EN: Builds a SOAP 1.1 envelope (UTF-8 text) with one rpc operation and its parameters as unqualified children.
 * ES: Arma un sobre SOAP 1.1 (texto UTF-8) con una operación rpc y sus parámetros como hijos sin calificar.
 */
export const buildSoapEnvelope = ({ method, params = [], namespace }: SoapEnvelopeInput): string => {
  const body = params.map(({ name, value }) => `<${name}>${escapeXmlText(value)}</${name}>`).join('')
  const tag = namespace === undefined ? method : `ws:${method}`
  const declaration = namespace === undefined ? '' : ` xmlns:ws="${namespace}"`
  return (
    `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="${SOAP_ENVELOPE_NS}"${declaration}>` +
    `<soapenv:Body><${tag}>${body}</${tag}></soapenv:Body></soapenv:Envelope>`
  )
}

/**
 * EN: Removes element namespace prefixes (`<ns1:a>` → `<a>`); attributes and the XML declaration are untouched.
 * ES: Quita los prefijos de namespace de los elementos (`<ns1:a>` → `<a>`); atributos y declaración XML quedan igual.
 */
export const stripNamespacePrefixes = (xml: string): string => xml.replace(/<(\/?)[\w.-]+:(?=[\w.-]+[\s/>])/g, '<$1')

const NAMED_ENTITIES: Readonly<Record<string, string>> = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }
const ENTITY = /&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|quot|apos|amp);/g
const MAX_CODE_POINT = 0x10ffff

// One pass over the text, so an escaped ampersand never starts a second entity: `&amp;#xd;` is the text `&#xd;`, not a
// carriage return. A numeric reference beyond U+10FFFF cannot be a character and stays as it came.
const decodeEntities = (text: string): string =>
  text.replace(ENTITY, (entity: string, reference: string) => {
    if (!reference.startsWith('#')) return NAMED_ENTITIES[reference]
    const codePoint = reference.startsWith('#x') ? parseInt(reference.slice(2), 16) : parseInt(reference.slice(1), 10)
    return codePoint <= MAX_CODE_POINT ? String.fromCodePoint(codePoint) : entity
  })

// Axis puts namespace declarations on `faultcode`, so the opening tag may carry attributes.
const faultText = (xml: string, tag: string): string | null => {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`).exec(xml)
  return match === null ? null : decodeEntities(match[1])
}

/**
 * EN: A SOAP 1.1 fault.
 * ES: Un fault SOAP 1.1.
 */
export type SoapFault = {
  /** EN: `faultcode`. ES: `faultcode`. */
  readonly code: string
  /** EN: `faultstring`. ES: `faultstring`. */
  readonly reason: string
}

/**
 * EN: What a SOAP reply carried: a fault, the unescaped XML inside `<…Return>` (DTEWS) or the inner XML of
 * `<return>` (WSRECLAMO), prefixes stripped. Nulls when absent; a self-closing element (`<return/>`) is present and
 * empty, so its value is an empty string.
 * ES: Lo que trajo una respuesta SOAP: un fault, el XML des-escapado dentro de `<…Return>` (DTEWS) o el XML interior
 * de `<return>` (WSRECLAMO), sin prefijos. Null cuando no está; un elemento autocerrado (`<return/>`) está presente y
 * vacío, así que su valor es un string vacío.
 */
export type SoapResponse = {
  /** EN: The SOAP fault, or null. ES: El fault SOAP, o null. */
  readonly fault: SoapFault | null
  /** EN: Text of the return element with its entities decoded, or null. ES: Texto del elemento de retorno con sus entidades decodificadas, o null. */
  readonly returnValue: string | null
  /** EN: Inner XML of `<return>` as received, or null. ES: XML interno de `<return>` tal como llegó, o null. */
  readonly returnXml: string | null
}

// A self-closing element (`<return/>`, `<xReturn xsi:nil="true"/>`) is the first alternative and leaves its capture
// group undefined; the parser reads it as an empty string.
const RETURN_VALUE = /<([\w.-]+Return)\b(?:[^>]*?\/>|[^>]*>([\s\S]*?)<\/\1>)/
const RETURN_XML = /<return\b(?:[^>]*?\/>|[^>]*>([\s\S]*?)<\/return>)/

/**
 * EN: Parses a SOAP reply without a full XML parse: the SII answers are flat and sometimes carry stray entities.
 * ES: Interpreta una respuesta SOAP sin parseo XML completo: las respuestas del SII son planas y a veces traen
 * entidades sueltas.
 */
export const parseSoapResponse = (xml: string): SoapResponse => {
  const plain = stripNamespacePrefixes(xml)
  const fault = /<Fault[\s>/]/.test(plain)
    ? { code: faultText(plain, 'faultcode') ?? 'Unknown', reason: faultText(plain, 'faultstring') ?? '' }
    : null
  const value = RETURN_VALUE.exec(plain)
  const inner = RETURN_XML.exec(plain)
  return {
    fault,
    returnValue: value === null ? null : decodeEntities(value[2] ?? ''),
    returnXml: inner === null ? null : (inner[1] ?? ''),
  }
}
