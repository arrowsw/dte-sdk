import type { Caf } from '../caf/parse'
import type { Certificate } from '../certificate/certificate'
import type { Document, DocumentInput } from '../model/document'
import { stampDocument } from '../ted/build'
import { createDocument } from './create'
import { signDocument, type SignedDocument } from './sign'

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
}

const isDocument = (value: DocumentInput | Document): value is Document => 'header' in value

/**
 * EN: The whole pipeline: create (if needed) → stamp with the CAF → sign with the certificate.
 * ES: El flujo completo: crear (si hace falta) → timbrar con el CAF → firmar con el certificado.
 */
export const issueDocument = ({
  document,
  caf,
  certificate,
  now,
  checkCafExpiry,
  timestamp,
}: IssueDocumentInput): SignedDocument => {
  const doc = isDocument(document) ? document : createDocument(document, { now })
  return signDocument(
    stampDocument(doc, caf, { now, checkExpiry: checkCafExpiry, stampedAt: timestamp }),
    certificate,
    {
      now,
      signedAt: timestamp,
    },
  )
}
