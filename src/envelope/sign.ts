import type { Certificate } from '../certificate/certificate'
import { signEnveloped, verifyEnveloped, type SignatureVerification, type XmlSignature } from '../signature/xmldsig'
import { buildEnvelopeXml, envelopeRootName } from './build-xml'
import type { Envelope } from './create'

/**
 * EN: An envelope with its signed XML, ready to encode as ISO-8859-1 and upload.
 * ES: Un sobre con su XML firmado, listo para codificar en ISO-8859-1 y subir.
 */
export type SignedEnvelope = Envelope & {
  /** EN: Signed XML with prolog. ES: XML firmado con prólogo. */
  readonly xml: string
  readonly signature: XmlSignature
}

/**
 * EN: Signs the `SetDTE` with the sender certificate.
 * ES: Firma el `SetDTE` con el certificado de quien envía.
 */
export const signEnvelope = (envelope: Envelope, certificate: Certificate): SignedEnvelope => {
  const { xml, signature } = signEnveloped({
    xml: buildEnvelopeXml(envelope),
    elementTag: 'SetDTE',
    rootTag: envelopeRootName(envelope.kind),
    certificate,
  })
  return { ...envelope, xml, signature }
}

/**
 * EN: Verifies the `SetDTE` signature of an `EnvioDTE`/`EnvioBOLETA` XML.
 * ES: Verifica la firma del `SetDTE` de un XML `EnvioDTE`/`EnvioBOLETA`.
 */
export const verifyEnvelopeSignature = (xml: string): SignatureVerification =>
  verifyEnveloped(xml, { elementTag: 'SetDTE', rootTag: xml.includes('<EnvioBOLETA') ? 'EnvioBOLETA' : 'EnvioDTE' })
