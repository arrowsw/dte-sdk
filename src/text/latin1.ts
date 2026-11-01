import { DteError } from '../errors'

/**
 * EN: Encodes text as ISO-8859-1 bytes (what the SII upload endpoints expect). Throws instead of truncating a code
 * point above U+00FF to its low byte, which is how corrupted control characters used to reach the SII.
 * ES: Codifica texto como bytes ISO-8859-1 (lo que esperan los endpoints de subida del SII). Lanza en vez de truncar
 * un code point mayor a U+00FF a su byte bajo, que es como llegaban caracteres de control corruptos al SII.
 * @throws {DteError} EN: `ENCODING_UNSUPPORTED_CHAR` with `{ index, codePoint }`. ES: `ENCODING_UNSUPPORTED_CHAR` con `{ index, codePoint }`.
 */
export const encodeLatin1 = (text: string): Uint8Array => {
  const bytes = new Uint8Array(text.length)
  for (let index = 0; index < text.length; index += 1) {
    const codePoint = text.charCodeAt(index)
    if (codePoint > 0xff) throw new DteError('ENCODING_UNSUPPORTED_CHAR', { index, codePoint })
    bytes[index] = codePoint
  }
  return bytes
}

const CHUNK = 8192

/**
 * EN: Decodes ISO-8859-1 bytes to a string (one char per byte).
 * ES: Decodifica bytes ISO-8859-1 a string (un carácter por byte).
 */
export const decodeLatin1 = (bytes: Uint8Array): string => {
  const parts: string[] = []
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + CHUNK)))
  }
  return parts.join('')
}
