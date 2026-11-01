import { XMLBuilder } from 'fast-xml-parser'

const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: false })

/**
 * EN: Serializes a plain object to compact XML. Keys become elements in insertion order, `@_name` keys become
 * attributes, arrays repeat the element and values are entity-escaped.
 * ES: Serializa un objeto plano a XML compacto. Las claves son elementos en orden de inserción, las claves `@_nombre`
 * son atributos, los arreglos repiten el elemento y los valores se escapan con entidades.
 */
export const buildXml = (value: Readonly<Record<string, unknown>>): string => builder.build(value) as string
