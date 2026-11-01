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
 * EN: Escapes an attribute value quoted with double quotes.
 * ES: Escapa el valor de un atributo entre comillas dobles.
 */
export const escapeXmlAttribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
