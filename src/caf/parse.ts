import forge from 'node-forge'
import { isDocumentType, type DocumentType } from '../catalogs/document-types'
import { isRsaKeyPair, type RsaPublicKeyParts } from '../crypto/rsa'
import { DteError } from '../errors'
import { toSiiRut, type SiiRut } from '../model/rut'
import { parseXmlWithReferences } from '../xml/parse'

/**
 * EN: A parsed CAF (Código de Autorización de Folios): the SII authorization of a folio range plus the private key that
 * signs each TED. Keep `privateKeyPem` secret.
 * ES: Un CAF (Código de Autorización de Folios) parseado: la autorización del SII de un rango de folios más la llave
 * privada que firma cada TED. `privateKeyPem` es secreto.
 */
export type Caf = {
  /** EN: Authorized issuer. ES: `DA/RE` — RUT del emisor autorizado. */
  readonly issuerRut: SiiRut
  /** EN: Issuer business name. ES: `DA/RS` — Razón social del emisor. */
  readonly issuerName: string
  /** EN: Document type the range is for. ES: `DA/TD` — Tipo de documento del rango. */
  readonly documentType: DocumentType
  /** EN: Inclusive folio range. ES: `DA/RNG` — Rango de folios, inclusivo (`D` desde, `H` hasta). */
  readonly range: { readonly from: number; readonly to: number }
  /** EN: Authorization date YYYY-MM-DD, or null when absent. ES: `DA/FA` — Fecha de autorización AAAA-MM-DD, o null si no viene. */
  readonly authorizationDate: string | null
  /** EN: Public key that verifies TED signatures. ES: `DA/RSAPK` — Clave pública que verifica las firmas del TED. */
  readonly publicKey: RsaPublicKeyParts
  /** EN: Key id; 100 marks the certification environment. ES: `DA/IDK` — Identificador de llave; 100 marca certificación. */
  readonly keyId: number
  /** EN: SII signature over the authorization data. ES: `FRMA` — Firma del SII sobre los datos de autorización. */
  readonly siiSignature: string
  /** EN: Private key PEM used to sign the TED. ES: `RSASK` — Llave privada PEM con la que se firma el TED. */
  readonly privateKeyPem: string
  /** EN: The `<CAF>…</CAF>` block exactly as the SII issued it (whitespace between tags removed), copied verbatim into every TED. ES: El bloque `<CAF>…</CAF>` tal como lo emitió el SII (sin espacios entre etiquetas), que va íntegro en cada TED. */
  readonly xml: string
}

type Tree = Readonly<Record<string, unknown>>

const node = (tree: unknown, key: string): Tree | undefined =>
  typeof tree === 'object' && tree !== null && typeof (tree as Tree)[key] === 'object' && (tree as Tree)[key] !== null
    ? ((tree as Tree)[key] as Tree)
    : undefined

const textOf = (tree: unknown, key: string): string | undefined => {
  const value = typeof tree === 'object' && tree !== null ? (tree as Tree)[key] : undefined
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null && typeof (value as Tree)['#text'] === 'string')
    return (value as Tree)['#text'] as string
  return undefined
}

const invalid = (reason: string): DteError => new DteError('CAF_INVALID', { reason })

const integer = (value: string | undefined, reason: string): number => {
  const parsed = Number(value)
  if (value === undefined || !Number.isInteger(parsed)) throw invalid(reason)
  return parsed
}

/**
 * EN: Parses a CAF XML file as downloaded from the SII. Validates structure, type, range and keys (the private key
 * `RSASK` must be the pair of the public key `RSAPK` the SII signed), and that the text holds one `<CAF` and one
 * `</CAF`, so the `<CAF>` block kept for the TED is the CAF its fields are read from.
 * ES: Parsea un archivo CAF XML tal como se descarga del SII. Valida estructura, tipo, rango y llaves (la llave privada
 * `RSASK` debe ser el par de la clave pública `RSAPK` que firmó el SII), y que el texto tenga un `<CAF` y un `</CAF`,
 * para que el bloque `<CAF>` que se guarda para el TED sea el CAF del que se leen sus campos.
 * @throws {DteError} EN: `CAF_INVALID`, also for keys that are not a pair, a DOCTYPE or another `<CAF` or `</CAF` anywhere in the text, such as in a comment; `INVALID_RUT`. ES: `CAF_INVALID`, también para llaves que no son par, un DOCTYPE u otro `<CAF` o `</CAF` en cualquier parte del texto, como en un comentario; `INVALID_RUT`.
 */
export const parseCaf = (xml: string): Caf => {
  if (typeof xml !== 'string' || xml.trim() === '') throw invalid('empty')
  // The parsers read a DOCTYPE differently, so none is read, as in verifyCafSignature.
  if (/<!DOCTYPE/i.test(xml)) throw invalid('a DOCTYPE is not read')
  const tree = (() => {
    try {
      // Character references decode as `verifyCafSignature`'s DOM decodes them, so both read the same fields.
      return parseXmlWithReferences(xml)
    } catch {
      throw invalid('malformed XML')
    }
  })()
  const authorization = node(tree, 'AUTORIZACION')
  const caf = node(authorization, 'CAF')
  const data = node(caf, 'DA')
  if (authorization === undefined || caf === undefined || data === undefined)
    throw invalid('missing AUTORIZACION/CAF/DA')
  const type = integer(textOf(data, 'TD'), 'TD')
  if (!isDocumentType(type)) throw invalid('unsupported TD')
  const range = node(data, 'RNG')
  const from = integer(textOf(range, 'D'), 'RNG/D')
  const to = integer(textOf(range, 'H'), 'RNG/H')
  if (from <= 0 || to < from) throw invalid('RNG')
  const publicKey = node(data, 'RSAPK')
  const modulus = textOf(publicKey, 'M')
  const exponent = textOf(publicKey, 'E')
  if (modulus === undefined || exponent === undefined) throw invalid('RSAPK')
  const privateKeyPem = textOf(authorization, 'RSASK')?.trim()
  if (privateKeyPem === undefined) throw invalid('missing RSASK')
  const privateKey = (() => {
    try {
      return forge.pki.privateKeyFromPem(privateKeyPem)
    } catch {
      throw invalid('RSASK is not a PEM private key')
    }
  })()
  // A stamp signed with a key that is not the pair of the one the SII signed in the DA fails every check of it.
  if (!isRsaKeyPair(privateKey, { modulus, exponent })) throw invalid('RSASK is not the pair of RSAPK')
  // The block every TED carries is cut from the text, while the fields come from the parsed file, which reads no markup
  // inside comments, instructions, CDATA or attribute values: with one `<CAF` and one `</CAF` in the whole text, the
  // block cut is the element read, never a copy written in one of them.
  if (xml.split('<CAF').length !== 2 || xml.split('</CAF').length !== 2) throw invalid('expected one <CAF> block')
  const block = /<CAF[^>]*>[\s\S]*?<\/CAF>/.exec(xml)?.[0]
  if (block === undefined) throw invalid('missing <CAF> block')
  const authorizationDate = textOf(data, 'FA')?.trim() ?? ''
  return {
    issuerRut: toSiiRut(textOf(data, 'RE') ?? '', 'CAF.RE'),
    issuerName: textOf(data, 'RS') ?? '',
    documentType: type,
    range: { from, to },
    authorizationDate: /^\d{4}-\d{2}-\d{2}$/.test(authorizationDate) ? authorizationDate : null,
    publicKey: { modulus, exponent },
    keyId: integer(textOf(data, 'IDK'), 'IDK'),
    siiSignature: (textOf(caf, 'FRMA') ?? '').replace(/\s+/g, ''),
    privateKeyPem,
    xml: block.replace(/>\s+</g, '><'),
  }
}
