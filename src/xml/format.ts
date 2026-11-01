/**
 * EN: Removes whitespace from a base64 string and wraps it at `width` columns.
 * ES: Quita los espacios de un base64 y lo corta en columnas de `width`.
 */
export const wrapBase64 = (value: string, width = 64): string =>
  value
    .replace(/\s+/g, '')
    .replace(new RegExp(`(.{${width}})`, 'g'), '$1\n')
    .trim()

const BASE64_TAGS = ['SignatureValue', 'Modulus', 'X509Certificate'] as const

/**
 * EN: Rewraps `SignatureValue`, `Modulus` and `X509Certificate` at 64 columns, the layout the SII expects.
 * ES: Recorta `SignatureValue`, `Modulus` y `X509Certificate` a 64 columnas, la disposición que espera el SII.
 */
export const formatBase64Columns = (xml: string): string =>
  BASE64_TAGS.reduce(
    (acc, tag) =>
      acc.replace(
        new RegExp(`<${tag}>([^<]+)</${tag}>`, 'g'),
        (_match, b64: string) => `<${tag}>${wrapBase64(b64)}</${tag}>`,
      ),
    xml,
  )
