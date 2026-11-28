import type { Caf } from '../caf/parse'
import type { Certificate } from '../certificate/certificate'
import { DteError } from '../errors'
import type { Document, DocumentInput } from '../model/document'
import { stampDocument } from '../ted/build'
import { createDocument } from './create'
import { signDocument, type SignedDocument } from './sign'
import { verifyReceivedDocuments } from './verify-received'

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
  /** EN: Verify the signed XML before returning it, as `verifyReceivedDocuments` checks a received one (default false): its XML signature with the certificate it carries, the `FRMT` of its stamp with the `RSAPK` of the CAF the stamp carries, and that the `DD` agrees with the header. Not checked: the SII's signature over the CAF (`FRMA`), the CAF against the document, nor who the certificate belongs to. It takes a little over twice the time: 100 invoices took about 100 ms without it and 240 ms with it. ES: `Signature`, `TED` — Verificar el XML firmado antes de devolverlo, como `verifyReceivedDocuments` revisa uno recibido (por defecto false): su firma XML con el certificado que trae, el `FRMT` de su timbre con el `RSAPK` del CAF que trae el timbre, y que el `DD` concuerde con el encabezado. No se revisa: la firma del SII sobre el CAF (`FRMA`), el CAF contra el documento, ni de quién es el certificado. Toma algo más del doble: 100 facturas tomaron cerca de 100 ms sin ella y 240 ms con ella. */
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
 * not or whose `DD` disagrees with the header, listed in `details.mismatches`. ES: lo que lanzan `createDocument`,
 * `stampDocument` y `signDocument`, y con `verify`, `SIGNATURE_INVALID` con `details.field` `DTE` por una firma que
 * no verifica y `TED` por un timbre que no verifica o cuyo `DD` no concuerda con el encabezado, listado en
 * `details.mismatches`.
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
    // The XML about to be returned, read as a receiver reads it.
    const [{ signature, ted }] = verifyReceivedDocuments(signed.xml).documents
    if (!signature.valid) throw new DteError('SIGNATURE_INVALID', { field: 'DTE' })
    if (!ted.valid) throw new DteError('SIGNATURE_INVALID', { field: 'TED', mismatches: ted.mismatches })
  }
  return signed
}
