import { DteError } from '../errors'
import { decodeLatin1, encodeLatin1 } from '../text/latin1'

/**
 * EN: A plain multipart field (`rutSender`, `dvSender`, `rutCompany`, `dvCompany`).
 * ES: Un campo multipart simple (`rutSender`, `dvSender`, `rutCompany`, `dvCompany`).
 */
export type MultipartField = {
  /** EN: Field name. ES: Nombre del campo, p. ej. `rutSender`. */
  readonly name: string
  /** EN: Field value, in ASCII. ES: Valor del campo, en ASCII. */
  readonly value: string
}

/**
 * EN: The file part (`archivo`): bytes already encoded in the charset the XML declares.
 * ES: La parte archivo (`archivo`): bytes ya codificados en el charset que declara el XML.
 */
export type MultipartFile = {
  /** EN: Part name. ES: Nombre de la parte: `archivo`. */
  readonly name: string
  /** EN: File name sent in the part. ES: Nombre del archivo enviado, p. ej. `EnvioDTE.xml`. */
  readonly fileName: string
  /** EN: Content type of the part. ES: Tipo de contenido de la parte: `text/xml`. */
  readonly contentType: string
  /** EN: File bytes, copied untouched. ES: Bytes del archivo, copiados sin cambios. */
  readonly bytes: Uint8Array
}

/**
 * EN: Input of `buildMultipartBody`.
 * ES: Entrada de `buildMultipartBody`.
 */
export type MultipartBodyInput = {
  /** EN: Boundary; must not occur in any field or in the file. ES: Separador; no debe aparecer en ningún campo ni en el archivo. */
  readonly boundary: string
  /** EN: Text fields, in order. ES: Campos de texto, en orden. */
  readonly fields: readonly MultipartField[]
  /** EN: The file part, sent last. ES: La parte del archivo, enviada al final. */
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
 * EN: A part of a multipart body: a text field or a file.
 * ES: Una parte de un cuerpo multipart: un campo de texto o un archivo.
 */
export type MultipartPart = MultipartField | MultipartFile

/**
 * EN: Input of `buildMultipartParts`.
 * ES: Entrada de `buildMultipartParts`.
 */
export type MultipartPartsInput = {
  /** EN: Boundary; must not occur in any part. ES: Separador; no debe aparecer en ninguna parte. */
  readonly boundary: string
  /** EN: The parts, in the order they are sent. ES: Las partes, en el orden en que se envían. */
  readonly parts: readonly MultipartPart[]
}

const isFile = (part: MultipartPart): part is MultipartFile => 'bytes' in part

const partText = (part: MultipartPart): string => (isFile(part) ? decodeLatin1(part.bytes) : part.value)

// What goes into a part's headers: a CR, LF or quote there would end the header or the quoted name early.
const headerTexts = (part: MultipartPart): readonly string[] =>
  isFile(part) ? [part.name, part.fileName, part.contentType] : [part.name]
const BREAKS_HEADER = /[\r\n"]/

/**
 * EN: `multipart/form-data` bytes with the parts in the given order: CRLF framing in ASCII, every file's bytes copied
 * untouched. The boundary must not occur in any part, or a receiver would cut the body there.
 * ES: Bytes `multipart/form-data` con las partes en el orden dado: delimitación CRLF en ASCII, los bytes de cada
 * archivo copiados tal cual. El límite no debe aparecer en ninguna parte, o el receptor cortaría el cuerpo ahí.
 * @throws {DteError} EN: `INVALID_OPTION { field: 'parts' }` when a name, file name or content type holds a CR, LF or quote; `INVALID_OPTION { field: 'boundary' }` when the boundary occurs in the content. ES: `INVALID_OPTION { field: 'parts' }` si un nombre, nombre de archivo o tipo de contenido trae CR, LF o comillas; `INVALID_OPTION { field: 'boundary' }` si el límite aparece en el contenido.
 */
export const buildMultipartParts = ({ boundary, parts }: MultipartPartsInput): Uint8Array => {
  if (parts.some((part) => headerTexts(part).some((text) => BREAKS_HEADER.test(text))))
    throw new DteError('INVALID_OPTION', { field: 'parts' })
  // Latin-1 decoding is one character per byte, so an ASCII boundary is in the string exactly when it is in the bytes.
  if (parts.some((part) => [...headerTexts(part), partText(part)].some((text) => text.includes(boundary))))
    throw new DteError('INVALID_OPTION', { field: 'boundary' })
  const delimiter = `--${boundary}\r\n`
  const encoded = parts.flatMap((part) =>
    isFile(part)
      ? [
          encodeLatin1(
            `${delimiter}Content-Disposition: form-data; name="${part.name}"; filename="${part.fileName}"\r\nContent-Type: ${part.contentType}\r\n\r\n`,
          ),
          part.bytes,
          encodeLatin1('\r\n'),
        ]
      : [encodeLatin1(`${delimiter}Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value}\r\n`)],
  )
  return concat([...encoded, encodeLatin1(`--${boundary}--\r\n`)])
}

/**
 * EN: `multipart/form-data` bytes: the fields in order, then the file part, as the SII's upload CGI expects them.
 * ES: Bytes `multipart/form-data`: los campos en orden y luego la parte archivo, como los espera el CGI de subida del SII.
 * @throws {DteError} EN: `INVALID_OPTION { field: 'boundary' }` when the boundary occurs in the content. ES: `INVALID_OPTION { field: 'boundary' }` si el límite aparece en el contenido.
 */
export const buildMultipartBody = ({ boundary, fields, file }: MultipartBodyInput): Uint8Array =>
  buildMultipartParts({ boundary, parts: [...fields, file] })
