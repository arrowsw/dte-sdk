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
const xmlId = (value: string, field: string): string => {
  if (typeof value !== 'string' || !XML_ID.test(value)) throw new DteError('INVALID_OPTION', { field })
  return value
}

/**
 * EN: The id a caller gave, checked as `xmlId` checks it, or a generated one when none was given: `undefined`, or the
 * `null` a caller's JSON may carry in its place. Internal.
 * ES: El id entregado por quien llama, revisado como lo revisa `xmlId`, o uno generado si no se entregó ninguno:
 * `undefined`, o el `null` que el JSON de quien llama puede traer en su lugar. Interno.
 * @param value EN: the id, if any. ES: el id, si hay.
 * @param field EN: name of the field, for the error. ES: nombre del campo, para el error.
 * @param generate EN: makes the id when none was given. ES: genera el id cuando no se entregó ninguno.
 * @throws {DteError} EN: `INVALID_OPTION` with the field in `details.field`. ES: `INVALID_OPTION` con el campo en `details.field`.
 */
export const givenOrGeneratedId = (value: string | null | undefined, field: string, generate: () => string): string =>
  value === undefined || value === null ? generate() : xmlId(value, field)
