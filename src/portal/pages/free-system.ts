import { attribute, decodeEntities, namedForm } from '../html'

/**
 * EN: One field of a form as the browser posts it: its name and its value, entities decoded.
 * ES: Un campo de un formulario tal como lo envía el navegador: su nombre y su valor, con las entidades decodificadas.
 */
export type FormField = readonly [name: string, value: string]

// The fields of a fragment are its inputs, selects and textareas, read in one pass so their order is the page's.
const FIELD = /<input\b[^>]*>|<select\b[^>]*>[\s\S]*?<\/select>|<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi

// A select posts its last option marked `selected`, else its first option, as a browser does.
const selectValue = (block: string): string => {
  const options = [...block.matchAll(/<option\b([^>]*)>/gi)].map((match) => ({
    value: decodeEntities(attribute(`<option ${match[1]}>`, 'value') ?? ''),
    selected: /(?:^|\s)selected\b/i.test(match[1]),
  }))
  return (options.filter((option) => option.selected).pop() ?? options[0])?.value ?? ''
}

const fieldOf = (element: string): FormField | null => {
  const tag = /^<[^>]*>/.exec(element)![0]
  const name = attribute(tag, 'name')
  if (name === null) return null
  if (/^<select/i.test(element)) return [name, selectValue(element)]
  if (/^<textarea/i.test(element))
    return [name, decodeEntities(element.slice(tag.length).replace(/<\/textarea>$/i, ''))]
  return [name, decodeEntities(attribute(tag, 'value') ?? '')]
}

/**
 * EN: Every named field of a fragment, in the page's order, a repeated name repeated.
 * ES: Todos los campos con nombre de un fragmento, en el orden de la página, con los nombres repetidos tal cual.
 */
export const formFields = (html: string): readonly FormField[] =>
  (html.match(FIELD) ?? []).flatMap((element) => {
    const field = fieldOf(element)
    return field === null ? [] : [field]
  })

/**
 * EN: The fields as a map in which the first value of a repeated name wins, as field behaviour reads a page.
 * ES: Los campos como mapa en que gana el primer valor de un nombre repetido, como lee una página el comportamiento del campo.
 */
export const firstValues = (fields: readonly FormField[]): Readonly<Record<string, string>> => {
  const values: Record<string, string> = {}
  for (const [name, value] of fields) if (!Object.prototype.hasOwnProperty.call(values, name)) values[name] = value
  return values
}

/**
 * EN: The signing form the folio step answers with: its `action` and its fields, or null when the page has none.
 * ES: El formulario de firma con que responde el paso del folio: su `action` y sus campos, o null si la página no lo trae.
 */
export const signForm = (html: string): { readonly action: string; readonly fields: readonly FormField[] } | null => {
  const block = namedForm(html, /^frmSign$/i)
  if (block === null) return null
  return {
    action: decodeEntities(attribute(/<form\b[^>]*>/i.exec(block)![0], 'action') ?? ''),
    fields: formFields(block),
  }
}

/**
 * EN: The folio of a document, or null.
 * ES: El folio de un documento, o null.
 */
export const folioOf = (xml: string): number | null => {
  const match = /<Folio>\s*(\d+)\s*<\/Folio>/.exec(xml)
  return match === null ? null : Number(match[1])
}

/**
 * EN: The signing time of a signed document, or null.
 * ES: La hora de firma de un documento firmado, o null.
 */
export const signingTimeOf = (xml: string): string | null => /<TmstFirma>([^<]+)<\/TmstFirma>/.exec(xml)?.[1] ?? null

/**
 * EN: The signed document the central signature answered, as plain text or inside `{"status": 0, "text": …}`, or null
 * when the answer holds no signature.
 * ES: El documento firmado con que respondió la firma central, como texto plano o dentro de `{"status": 0, "text": …}`, o
 * null si la respuesta no trae una firma.
 */
export const signedDocumentOf = (answer: string): string | null => {
  const text = answer.trim().replace(/^while\s*\(\s*1\s*\)\s*;?\s*/, '')
  const plain = /^(?:<\?xml|<DTE\b)/.test(text) ? text : jsonText(text)
  return plain !== null && plain.includes('<Signature') ? plain : null
}

const jsonText = (text: string): string | null => {
  try {
    const value: unknown = JSON.parse(text)
    if (typeof value !== 'object' || value === null) return null
    const { status, statusCode, text: signed } = value as Record<string, unknown>
    return Number(statusCode ?? status) === 0 && typeof signed === 'string' ? signed : null
  } catch {
    return null
  }
}

/**
 * EN: True when the central signature refused the password of the certificate.
 * ES: True cuando la firma central rechazó la clave del certificado.
 */
export const isSignatureRefused = (answer: string): boolean => /clave\s+no\s+corresponde/i.test(answer)

/**
 * EN: True for the firewall's own rejection page, which names no reason and gives a support id.
 * ES: True para la página de rechazo del propio firewall, que no da motivo y entrega un id de soporte.
 */
export const isFirewallRejection = (html: string): boolean => html.includes('Request Rejected')

/**
 * EN: The support code an error page of the portal states, or null.
 * ES: El código de soporte que declara una página de error del portal, o null.
 */
export const siiCodeOf = (html: string): string | null => /CODIGO:\s*(\d[\d.]*)/.exec(html)?.[1] ?? null

/**
 * EN: What the last step answered: the SII's id of the document, when it gives one in the page or in the redirect, and
 * whether the page confirms the document was signed and sent.
 * ES: Lo que respondió el último paso: el id del documento en el SII, cuando lo da en la página o en la redirección, y si
 * la página confirma que el documento se firmó y se envió.
 */
export const sendOutcome = (
  html: string,
  location: string,
): { readonly documentId: string | null; readonly confirmed: boolean } => {
  const documentId = /DHDR_CODIGO=(\d+)/.exec(html)?.[1] ?? /DHDR_CODIGO=(\d+)/.exec(location)?.[1] ?? null
  const said = /Firmado\s+y\s+Enviado|ENVIADO\s+EXITOSAMENTE|Documento\s+enviado/i.test(html)
  return { documentId, confirmed: !/Firma\s+no\s+reconocida/i.test(html) && (documentId !== null || said) }
}
