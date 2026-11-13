import type { Caf } from '../caf/parse'
import { signWithCaf, verifyWithCaf } from '../caf/sign'
import { assertFolioInRange, isCafExpired } from '../caf/validity'
import type { DocumentType } from '../catalogs/document-types'
import { DteError } from '../errors'
import type { Document } from '../model/document'
import type { SiiRut } from '../model/rut'
import { foldToAscii } from '../text/sanitize'
import { chileTimestamp } from '../time/chile'
import { escapeXmlText } from '../xml/escape'

const TED_TEXT_MAX_LENGTH = 40

/**
 * EN: The electronic stamp (`TED`): the `DD` fields, the CAF they embed and the signature made with the CAF key.
 * ES: `TED` — Timbre electrónico: los campos de `DD`, el CAF que incluyen y la firma hecha con la llave del CAF.
 */
export type Ted = {
  /** EN: Issuer RUT. ES: `RE` — RUT del emisor. */
  readonly issuerRut: SiiRut
  /** EN: Document type. ES: `TD` — Tipo de documento. */
  readonly documentType: DocumentType
  /** EN: Folio. ES: `F` — Folio. */
  readonly folio: number
  /** EN: Issue date. ES: `FE` — Fecha de emisión. */
  readonly issueDate: string
  /** EN: Receiver RUT. ES: `RR` — RUT del receptor. */
  readonly receiverRut: string
  /** EN: Receiver name folded to ASCII, max 40. ES: `RSR` — Razón social del receptor plegada a ASCII, máximo 40. */
  readonly receiverName: string
  /** EN: Document total, with its sign: zero or negative on a settlement invoice (43) whose charges reach or exceed what it settles. ES: `MNT` — Monto total, con su signo: cero o negativo en una liquidación factura (43) cuyos cargos igualan o superan lo que liquida. */
  readonly totalAmount: number
  /** EN: First item name folded to ASCII, max 40. ES: `IT1` — Nombre del primer ítem plegado a ASCII, máximo 40. */
  readonly firstItemName: string
  /** EN: Exact `<CAF>…</CAF>` block. ES: `CAF` — Bloque `<CAF>…</CAF>` exacto. */
  readonly caf: string
  /** EN: Stamp timestamp, Chile time. ES: `TSTED` — Marca de tiempo del timbre, hora de Chile. */
  readonly stampedAt: string
  /** EN: SHA1withRSA signature of `<DD>`, base64. ES: `FRMT` — Firma SHA1withRSA del `<DD>`, base64. */
  readonly signature: string
  /** EN: Full `<TED version="1.0">…</TED>` XML. ES: XML completo `<TED version="1.0">…</TED>`. */
  readonly xml: string
}

/**
 * EN: A document with its TED.
 * ES: Un documento con su TED.
 */
export type StampedDocument = Document & { readonly ted: Ted }

/**
 * EN: Options of `stampDocument`.
 * ES: Opciones de `stampDocument`.
 */
export type StampOptions = {
  /** EN: Clock for `TSTED` and the expiry check. ES: Reloj para `TSTED` y el chequeo de vencimiento. */
  readonly now?: Date
  /** EN: Check CAF expiry (default true). ES: Chequear el vencimiento del CAF (por defecto true). */
  readonly checkExpiry?: boolean
  /** EN: `TSTED` as given, instead of the Chile time of `now`. ES: `TSTED` tal como se entrega, en vez de la hora de Chile de `now`. */
  readonly stampedAt?: string
}

/**
 * EN: Folds text to ASCII and then cuts it to 40, the way `RSR` and `IT1` need it (folding may lengthen the text).
 * ES: Pliega el texto a ASCII y después lo corta a 40, como exigen `RSR` e `IT1` (el plegado puede alargar el texto).
 */
export const tedText = (text: string): string => foldToAscii(text).slice(0, TED_TEXT_MAX_LENGTH)

/**
 * EN: The exact `<DD>…</DD>` string that gets signed and printed in the PDF417.
 * ES: El string `<DD>…</DD>` exacto que se firma y se imprime en el PDF417.
 */
export const buildDdString = (fields: Omit<Ted, 'signature' | 'xml'>): string =>
  `<DD><RE>${fields.issuerRut}</RE><TD>${fields.documentType}</TD><F>${fields.folio}</F><FE>${fields.issueDate}</FE><RR>${fields.receiverRut}</RR><RSR>${escapeXmlText(fields.receiverName)}</RSR><MNT>${fields.totalAmount}</MNT><IT1>${escapeXmlText(fields.firstItemName)}</IT1>${fields.caf}<TSTED>${fields.stampedAt}</TSTED></DD>`

/**
 * EN: Wraps a `DD` and its signature in the `TED` element.
 * ES: Envuelve un `DD` y su firma en el elemento `TED`.
 */
export const buildTedXml = (dd: string, signature: string): string =>
  `<TED version="1.0">${dd}<FRMT algoritmo="SHA1withRSA">${signature}</FRMT></TED>`

/**
 * EN: Stamps a document with a CAF: checks type, issuer, folio range and expiry, builds the exact `DD` and signs it
 * with the CAF key (SHA1withRSA over Latin-1 bytes).
 * ES: Timbra un documento con un CAF: verifica tipo, emisor, rango de folios y vencimiento, arma el `DD` exacto y lo
 * firma con la llave del CAF (SHA1withRSA sobre bytes Latin-1).
 * @throws {DteError} EN: `CAF_TYPE_MISMATCH`, `CAF_ISSUER_MISMATCH`, `FOLIO_OUT_OF_RANGE`, `CAF_EXPIRED`. ES: los mismos códigos.
 */
export const stampDocument = (doc: Document, caf: Caf, options: StampOptions = {}): StampedDocument => {
  const { header } = doc
  if (caf.documentType !== header.type)
    throw new DteError('CAF_TYPE_MISMATCH', { type: header.type, cafType: caf.documentType })
  if (caf.issuerRut !== header.issuer.rut) throw new DteError('CAF_ISSUER_MISMATCH', { type: header.type })
  assertFolioInRange(caf, header.folio)
  if ((options.checkExpiry ?? true) && isCafExpired(caf, { now: options.now })) {
    throw new DteError('CAF_EXPIRED', { type: caf.documentType, authorizationDate: caf.authorizationDate })
  }
  const fields: Omit<Ted, 'signature' | 'xml'> = {
    issuerRut: header.issuer.rut,
    documentType: header.type,
    folio: header.folio,
    issueDate: header.issueDate,
    receiverRut: header.receiver.rut,
    receiverName: tedText(header.receiver.businessName),
    totalAmount: header.totals.totalAmount,
    firstItemName: tedText(doc.items[0].name),
    caf: caf.xml,
    stampedAt: options.stampedAt ?? chileTimestamp(options.now),
  }
  const dd = buildDdString(fields)
  const signature = signWithCaf(caf, dd)
  return { ...doc, ted: { ...fields, signature, xml: buildTedXml(dd, signature) } }
}

/**
 * EN: Verifies a `TED` XML against the CAF public key: true only when the `<DD>` bytes match the `FRMT` signature.
 * ES: Verifica un XML `TED` contra la clave pública del CAF: true solo si los bytes del `<DD>` coinciden con la firma `FRMT`.
 */
export const verifyTed = (tedXml: string, caf: Pick<Caf, 'publicKey'>): boolean => {
  const dd = /<DD>[\s\S]*?<\/DD>/.exec(tedXml)?.[0]
  const signature = /<FRMT[^>]*>([^<]*)<\/FRMT>/.exec(tedXml)?.[1]
  if (dd === undefined || signature === undefined) return false
  return verifyWithCaf(caf, dd, signature.replace(/\s+/g, ''))
}
