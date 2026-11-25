import forge from 'node-forge'
import { decodeLatin1, encodeLatin1 } from '../text/latin1'
import { wrapBase64 } from '../xml/format'

/**
 * EN: How a JS string is turned into bytes before hashing or signing.
 * ES: Cómo se convierte un string JS a bytes antes de hashear o firmar.
 */
export type TextEncoding = 'utf8' | 'latin1'

/**
 * EN: Bytes of `data` as a "binary string" (one char per byte, what node-forge consumes). `latin1` throws on characters outside ISO-8859-1.
 * ES: Bytes de `data` como "binary string" (un carácter por byte, lo que consume node-forge). `latin1` lanza si hay caracteres fuera de ISO-8859-1.
 */
export const toBinaryString = (data: string, encoding: TextEncoding): string =>
  encoding === 'utf8' ? forge.util.encodeUtf8(data) : decodeLatin1(encodeLatin1(data))

/**
 * EN: The base64 of `bytes`, on lines of 76 characters: a file carried inside an XML element stays under the length of
 * line the SII admits.
 * ES: El base64 de `bytes`, en líneas de 76 caracteres: un archivo llevado dentro de un elemento XML queda bajo el largo
 * de línea que admite el SII.
 */
export const base64Lines = (bytes: Uint8Array): string => wrapBase64(forge.util.encode64(decodeLatin1(bytes)), 76)

/**
 * EN: Base64 SHA-1 of `data` encoded as `encoding` (default UTF-8). Used for XMLDSig `DigestValue`.
 * ES: SHA-1 en base64 de `data` codificado como `encoding` (por defecto UTF-8). Se usa en el `DigestValue` de XMLDSig.
 */
export const sha1Base64 = (data: string, encoding: TextEncoding = 'utf8'): string => {
  const md = forge.md.sha1.create()
  md.update(toBinaryString(data, encoding))
  return forge.util.encode64(md.digest().getBytes())
}
