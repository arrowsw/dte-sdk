// The control characters XML 1.0 has no way to carry: U+0000 to U+001F but the tab, the line feed and the carriage
// return. A text with one of them is not XML 1.0, and a parser that follows it refuses the document it is written in.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g

/**
 * EN: Drops the control characters XML 1.0 forbids (U+0000 to U+001F but the tab, the line feed and the carriage
 * return), which no escaping can write.
 * ES: Quita los caracteres de control que XML 1.0 prohíbe (U+0000 a U+001F salvo el tabulador, el salto de línea y el
 * retorno de carro), que ningún escapado puede escribir.
 */
export const dropForbiddenControls = (value: string): string => value.replace(FORBIDDEN_CONTROLS, '')

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
