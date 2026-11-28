import type { Caf } from '../caf/parse'
import type { Certificate } from '../certificate/certificate'
import { DteError } from '../errors'
import type { Document, DocumentInput } from '../model/document'
import { stampDocument, verifyTed } from '../ted/build'
import { createDocument } from './create'
import { signDocument, verifyDocumentSignature, type SignedDocument } from './sign'

/**
 * EN: Input of `issueDocument`.
 * ES: Entrada de `issueDocument`.
 */
export type IssueDocumentInput = {
  /** EN: Raw input or an already created document. ES: Entrada cruda o un documento ya creado. */
  readonly document: DocumentInput | Document
  /** EN: CAF covering the folio. ES: CAF que cubre el folio. */
  readonly caf: Caf
  /** EN: Issuer certificate. ES: Certificado del emisor. */
  readonly certificate: Certificate
  /** EN: Clock for dates and timestamps. ES: Reloj para fechas y marcas de tiempo. */
  readonly now?: Date
  /** EN: Check CAF expiry (default true). ES: Chequear vencimiento del CAF (por defecto true). */
  readonly checkCafExpiry?: boolean
  /** EN: `TSTED` and `TmstFirma` as given, instead of the Chile time of `now`. ES: `TSTED` y `TmstFirma` tal como se entregan, en vez de la hora de Chile de `now`. */
  readonly timestamp?: string
  /** EN: Verify the document just signed before returning it: its XML signature with the certificate it carries, and its stamp, the `FRMT` over the `DD` with the key of the CAF (default false). It takes about twice the time: 100 invoices took about 100 ms without it and 210 ms with it. ES: `Signature`, `TED` — Verificar el documento recién firmado antes de devolverlo: su firma XML con el certificado que trae, y su timbre, el `FRMT` sobre el `DD` con la llave del CAF (por defecto false). Toma cerca del doble: 100 facturas tomaron cerca de 100 ms sin ella y 210 ms con ella. */
  readonly verify?: boolean
}

const isDocument = (value: DocumentInput | Document): value is Document => 'header' in value

/**
 * EN: The whole pipeline: create (if needed) → stamp with the CAF → sign with the certificate, and with `verify`,
 * check the signature and the stamp of what was signed.
 * ES: El flujo completo: crear (si hace falta) → timbrar con el CAF → firmar con el certificado, y con `verify`,
 * comprobar la firma y el timbre de lo firmado.
 * @throws {DteError} EN: what `createDocument`, `stampDocument` and `signDocument` throw, and with `verify`,
 * `SIGNATURE_INVALID` with `details.field` `DTE` for a signature that does not verify and `TED` for a stamp that does
 * not. ES: lo que lanzan `createDocument`, `stampDocument` y `signDocument`, y con `verify`, `SIGNATURE_INVALID` con
 * `details.field` `DTE` por una firma que no verifica y `TED` por un timbre que no verifica.
 */
export const issueDocument = ({
  document,
  caf,
  certificate,
  now,
  checkCafExpiry,
  timestamp,
  verify,
}: IssueDocumentInput): SignedDocument => {
  const doc = isDocument(document) ? document : createDocument(document, { now })
  const signed = signDocument(
    stampDocument(doc, caf, { now, checkExpiry: checkCafExpiry, stampedAt: timestamp }),
    certificate,
    {
      now,
      signedAt: timestamp,
    },
  )
  if (verify === true) {
    if (!verifyDocumentSignature(signed.xml).valid) throw new DteError('SIGNATURE_INVALID', { field: 'DTE' })
    if (!verifyTed(signed.ted.xml, caf)) throw new DteError('SIGNATURE_INVALID', { field: 'TED' })
  }
  return signed
}
