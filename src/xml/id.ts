import { DteError } from '../errors'

// `xs:ID` is a name without a colon: a letter or an underscore, then letters, digits, full stops, hyphens and
// underscores. The letters past ASCII are those of ISO-8859-1, the encoding of every file the SII takes.
const LETTERS = 'A-Za-z_À-ÖØ-öø-ÿ'
const XML_ID = new RegExp(`^[${LETTERS}][${LETTERS}0-9.·-]*$`)

/**
 * EN: An id a caller gave, when it is a name the `xs:ID` of the SII's schemas admits: it is written in an attribute
 * and referenced by the signature, so anything else fails the schema, and a `<` or a quote would break the file.
 * Internal.
 * ES: Un id entregado por quien llama, cuando es un nombre que admite el `xs:ID` de los esquemas del SII: se escribe en
 * un atributo y lo refiere la firma, así que cualquier otra cosa falla el esquema, y un `<` o una comilla romperían
 * el archivo. Interno.
 * @param value EN: the id. ES: el id.
 * @param field EN: name of the field, for the error. ES: nombre del campo, para el error.
 * @throws {DteError} EN: `INVALID_OPTION` with the field in `details.field`. ES: `INVALID_OPTION` con el campo en `details.field`.
 */
export const xmlId = (value: string, field: string): string => {
  if (typeof value !== 'string' || !XML_ID.test(value)) throw new DteError('INVALID_OPTION', { field })
  return value
}
