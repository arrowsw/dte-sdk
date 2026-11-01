import type { Certificate } from '../certificate/certificate'
import { signEnveloped, verifyEnveloped, type SignatureVerification, type XmlSignature } from '../signature/xmldsig'
import type { StampedDocument } from '../ted/build'
import { chileTimestamp } from '../time/chile'
import { buildDocumentXml, documentElementName } from './build-xml'

/**
 * EN: A stamped document that has been signed: carries the final XML.
 * ES: Un documento timbrado y firmado: trae el XML final.
 */
export type SignedDocument = StampedDocument & {
  /** EN: Signed `<DTE>` XML (no prolog). ES: XML `<DTE>` firmado (sin prólogo). */
  readonly xml: string
  /** EN: `TmstFirma`, Chile time. ES: `TmstFirma`, hora de Chile. */
  readonly signedAt: string
  /** EN: Digest and signature values. ES: Valores de digest y firma. */
  readonly signature: XmlSignature
}

/**
 * EN: Signs a stamped document with the issuer certificate (enveloped XMLDSig over `Documento`/`Liquidacion`).
 * ES: Firma un documento timbrado con el certificado del emisor (XMLDSig envuelta sobre `Documento`/`Liquidacion`).
 */
export const signDocument = (
  doc: StampedDocument,
  certificate: Certificate,
  options: { readonly now?: Date } = {},
): SignedDocument => {
  const signedAt = chileTimestamp(options.now)
  const unsigned = buildDocumentXml(doc, { ted: doc.ted, signedAt })
  const { xml, signature } = signEnveloped({
    xml: unsigned,
    elementTag: documentElementName(doc.header.type),
    rootTag: 'DTE',
    certificate,
    includeXsiInStoredSignedInfo: false,
  })
  return { ...doc, xml, signedAt, signature }
}

/**
 * EN: Verifies the signature of a `<DTE>` XML (own or received).
 * ES: Verifica la firma de un XML `<DTE>` (propio o recibido).
 */
export const verifyDocumentSignature = (xml: string): SignatureVerification =>
  verifyEnveloped(xml, { elementTag: xml.includes('<Liquidacion') ? 'Liquidacion' : 'Documento', rootTag: 'DTE' })
