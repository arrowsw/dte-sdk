import forge from 'node-forge'
import { isDocumentType, type DocumentType } from '../catalogs/document-types'
import type { RsaPublicKeyParts } from '../crypto/rsa'
import { DteError } from '../errors'
import { toSiiRut, type SiiRut } from '../model/rut'
import { parseXml } from '../xml/parse'

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
 * EN: Parses a CAF XML file as downloaded from the SII. Validates structure, type, range and key.
 * ES: Parsea un archivo CAF XML tal como se descarga del SII. Valida estructura, tipo, rango y llave.
 * @throws {DteError} EN: `CAF_INVALID`, `INVALID_RUT`. ES: `CAF_INVALID`, `INVALID_RUT`.
 */
export const parseCaf = (xml: string): Caf => {
  if (typeof xml !== 'string' || xml.trim() === '') throw invalid('empty')
  const tree = (() => {
    try {
      return parseXml(xml)
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
  try {
    forge.pki.privateKeyFromPem(privateKeyPem)
  } catch {
    throw invalid('RSASK is not a PEM private key')
  }
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
