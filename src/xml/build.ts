import { XMLBuilder } from 'fast-xml-parser'
import { dropForbiddenControls } from './escape'

const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: false })

/**
 * EN: Serializes a plain object to compact XML. Keys become elements in insertion order, `@_name` keys become
 * attributes, arrays repeat the element and values are entity-escaped. A control character XML 1.0 forbids has no
 * escaping: it is dropped, whatever value brought it, so what is written is always XML.
 * ES: Serializa un objeto plano a XML compacto. Las claves son elementos en orden de inserción, las claves `@_nombre`
 * son atributos, los arreglos repiten el elemento y los valores se escapan con entidades. Un carácter de control que
 * XML 1.0 prohíbe no tiene escapado: se quita, venga del valor que venga, así lo escrito siempre es XML.
 */
export const buildXml = (value: Readonly<Record<string, unknown>>): string =>
  dropForbiddenControls(builder.build(value) as string)
