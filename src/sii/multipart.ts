import { DteError } from '../errors'
import { decodeLatin1, encodeLatin1 } from '../text/latin1'

/**
 * EN: A plain multipart field (`rutSender`, `dvSender`, `rutCompany`, `dvCompany`).
 * ES: Un campo multipart simple (`rutSender`, `dvSender`, `rutCompany`, `dvCompany`).
 */
export type MultipartField = {
  readonly name: string
  readonly value: string
}

/**
 * EN: The file part (`archivo`): bytes already encoded in the charset the XML declares.
 * ES: La parte archivo (`archivo`): bytes ya codificados en el charset que declara el XML.
 */
export type MultipartFile = {
  readonly name: string
  readonly fileName: string
  readonly contentType: string
  readonly bytes: Uint8Array
}

/**
 * EN: Input of `buildMultipartBody`.
 * ES: Entrada de `buildMultipartBody`.
 */
export type MultipartBodyInput = {
  readonly boundary: string
  readonly fields: readonly MultipartField[]
  readonly file: MultipartFile
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/**
 * EN: Browser-like boundary (`----WebKitFormBoundary` + 16 alphanumerics), the shape the SII CGI has accepted for years.
 * ES: Límite al estilo navegador (`----WebKitFormBoundary` + 16 alfanuméricos), la forma que el CGI del SII acepta hace años.
 */
export const generateBoundary = (random: () => number = Math.random): string =>
  `----WebKitFormBoundary${Array.from({ length: 16 }, () => ALPHABET[Math.min(ALPHABET.length - 1, Math.floor(random() * ALPHABET.length))]).join('')}`

/**
 * EN: `Content-Type` header value for a boundary.
 * ES: Valor de la cabecera `Content-Type` para un límite.
 */
export const multipartContentType = (boundary: string): string => `multipart/form-data; boundary=${boundary}`

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  parts.reduce((offset, part) => {
    out.set(part, offset)
    return offset + part.length
  }, 0)
  return out
}

/**
 * EN: `multipart/form-data` bytes: CRLF framing, the fields in order, then the file part. The framing is ASCII; the
 * file bytes are copied untouched (Latin-1 for the SII envelopes). The boundary must not occur in any field value or
 * in the file, or a receiver would cut the body there.
 * ES: Bytes `multipart/form-data`: delimitación CRLF, los campos en orden y luego la parte archivo. La delimitación es
 * ASCII; los bytes del archivo se copian tal cual (Latin-1 en los sobres del SII). El límite no debe aparecer en el
 * valor de un campo ni en el archivo, o el receptor cortaría el cuerpo ahí.
 * @throws {DteError} EN: `INVALID_OPTION { field: 'boundary' }` when the boundary occurs in the content. ES: `INVALID_OPTION { field: 'boundary' }` si el límite aparece en el contenido.
 */
export const buildMultipartBody = ({ boundary, fields, file }: MultipartBodyInput): Uint8Array => {
  // Latin-1 decoding is one character per byte, so an ASCII boundary is in the string exactly when it is in the bytes.
  if ([...fields.map(({ value }) => value), decodeLatin1(file.bytes)].some((text) => text.includes(boundary)))
    throw new DteError('INVALID_OPTION', { field: 'boundary' })
  const delimiter = `--${boundary}\r\n`
  const fieldParts = fields.map(({ name, value }) =>
    encodeLatin1(`${delimiter}Content-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`),
  )
  const fileHeader = encodeLatin1(
    `${delimiter}Content-Disposition: form-data; name="${file.name}"; filename="${file.fileName}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
  )
  const closing = encodeLatin1(`\r\n--${boundary}--\r\n`)
  return concat([...fieldParts, fileHeader, file.bytes, closing])
}
