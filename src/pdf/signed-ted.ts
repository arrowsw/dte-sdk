import { rsaPublicKeyBytes, rsaSha1VerifyBase64 } from '../crypto/rsa'
import { child, signedForms } from '../xml/elements'
import { parseXmlDom } from '../xml/parse'

const DD_PATTERN = /<DD>[\s\S]*<\/DD>/
const BETWEEN_TAGS = />\s+</g

const textOf = (ted: string, tag: string): string =>
  new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`).exec(ted)?.[1] ?? ''

// A stamp is input from anyone, and the cost of checking a signature grows with the key it names. A CAF key is 512 to
// 1024 bits with a small exponent (3 or 65537), so a modulus over 4096 bits or an exponent over 32 bits is no CAF key
// and its signature is not tried. The size is that of the bytes the verification itself decodes, so no way of writing
// the base64 gets a larger key past the bound.
const MAX_KEY_BYTES = { modulus: 512, exponent: 4 } as const

// True when the signature of the stamp (`FRMT`) covers its `DD` as this text writes it. The key is the one of the CAF
// the stamp itself carries, so nothing else is needed; anything missing, malformed or out of bounds is false.
const verifies = (ted: string): boolean => {
  const key = { modulus: textOf(ted, 'M'), exponent: textOf(ted, 'E') }
  const size = rsaPublicKeyBytes(key)
  return (
    size.modulus <= MAX_KEY_BYTES.modulus &&
    size.exponent <= MAX_KEY_BYTES.exponent &&
    rsaSha1VerifyBase64(key, DD_PATTERN.exec(ted)?.[0] ?? '', 'latin1', textOf(ted, 'FRMT'))
  )
}

// The stamp with its `DD` written from its element, in the forms a signature may cover (`signedForms`): what recovers
// a file some tool wrote again with other escapes. None for a stamp that cannot be read or has no `DD`.
const rewritten = (ted: string): readonly string[] => {
  try {
    const dd = child(parseXmlDom(ted).documentElement as Element, 'DD')
    return dd === undefined ? [] : signedForms(dd).map((form) => ted.replace(DD_PATTERN, () => form))
  } catch {
    return []
  }
}

/**
 * EN: A stamp as it was signed. The `DD` in the PDF417 must be the bytes its `FRMT` covers, and a file may no longer
 * hold them: most issuers sign the `DD` flat and some tool indents the file afterwards, while a few sign it with
 * whitespace between its tags. So the form is not assumed, it is the one the issuer's signature verifies, tried in
 * this order: the stamp as written; without the whitespace between its tags; and with its `DD` written again from its
 * element. A stamp whose signature verifies over none of them is returned as written, and so is one whose key is
 * larger than any CAF key (a modulus over 4096 bits or an exponent over 32 bits), whose signature is not tried.
 * Internal: `parsePrintableDocuments` applies it to the stamp of each document.
 * ES: Un timbre tal como se firmó. El `DD` del PDF417 debe ser los bytes que cubre su `FRMT`, y un archivo puede ya no
 * tenerlos: la mayoría de los emisores firma el `DD` aplanado y alguna herramienta indenta el archivo después, mientras
 * que unos pocos lo firman con espacios entre sus etiquetas. Por eso la forma no se supone, es la que verifica la firma
 * del emisor, probadas en este orden: el timbre tal como viene; sin los espacios entre sus etiquetas; y con su `DD`
 * escrito de nuevo desde su elemento. Un timbre cuya firma no verifica con ninguna se devuelve tal como viene, y también
 * uno cuya llave es mayor que cualquier llave de CAF (un módulo de más de 4096 bits o un exponente de más de 32 bits),
 * cuya firma no se prueba. Interno: `parsePrintableDocuments` lo aplica al timbre de cada documento.
 */
export const signedTed = (tedXml: string): string => {
  if (verifies(tedXml)) return tedXml
  const flat = tedXml.replace(BETWEEN_TAGS, '><')
  return verifies(flat) ? flat : (rewritten(flat).find(verifies) ?? tedXml)
}
