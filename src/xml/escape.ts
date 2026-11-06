/**
 * EN: Escapes a text node value with the five XML entities (`& < > " '`).
 * ES: Escapa el valor de un nodo de texto con las cinco entidades XML (`& < > " '`).
 */
export const escapeXmlText = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

/**
 * EN: Escapes a text node value with only `&`, `<` and `>`; quotes and apostrophes stay as they are. It is the escaping
 * of a signed XML carried as text inside a SOAP parameter.
 * ES: Escapa el valor de un nodo de texto solo con `&`, `<` y `>`; las comillas y los apóstrofes quedan como están. Es
 * el escapado de un XML firmado que viaja como texto dentro de un parámetro SOAP.
 */
export const escapeXmlMarkup = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * EN: Escapes an attribute value quoted with double quotes.
 * ES: Escapa el valor de un atributo entre comillas dobles.
 */
export const escapeXmlAttribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
