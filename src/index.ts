/**
 * EN: dte-sdk public API. Everything is exported from this single entry.
 * ES: API pública de dte-sdk. Todo se exporta desde esta única entrada.
 */
export { DteError, DTE_ERROR_CODES, isDteError } from './errors'
export type { DteErrorCode, DteErrorDetails } from './errors'

export {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_VALUES,
  isDocumentType,
  isReceipt,
  isExemptType,
  isNote,
  requiresReceiver,
  isTransferable,
  documentTypeName,
} from './catalogs/document-types'
export type { DocumentType } from './catalogs/document-types'
export {
  ENVIRONMENTS,
  isEnvironment,
  REFERENCE_CODES,
  TRANSFER_TYPES,
  DISPATCH_TYPES,
  SERVICE_INDICATORS,
  PAYMENT_TERMS,
  EXEMPT_INDICATORS,
  WITHHOLDING_TAX_CODES,
  VAT_RATE,
  SII_RUT,
  FINAL_CONSUMER_RUT,
  CERTIFICATION_KEY_ID,
} from './catalogs/codes'
export type {
  Environment,
  ReferenceCode,
  TransferType,
  DispatchType,
  ServiceIndicator,
  PaymentTerms,
  ExemptIndicator,
} from './catalogs/codes'
export {
  SII_HOSTS,
  SOAP_ENDPOINTS,
  REST_ENDPOINTS,
  CLAIM_WS_ENDPOINTS,
  CLAIM_WSDL_ENDPOINTS,
  UPLOAD_USER_AGENT,
} from './catalogs/endpoints'
export type { SoapEndpoints, RestEndpoints } from './catalogs/endpoints'
export {
  classifyUploadStatus,
  uploadStatusMessage,
  isRetryableStatus,
  classifyDocumentStatus,
  documentStatusMessage,
  isTokenErrorStatus,
} from './catalogs/upload-status'
export type { UploadStatusClass, UploadChannel, DocumentStatusClass } from './catalogs/upload-status'

export { toSiiRut, isSiiRut, splitSiiRut } from './model/rut'
export type { SiiRut } from './model/rut'
export type {
  Issuer,
  IssuerInput,
  Receiver,
  ReceiverInput,
  ItemCode,
  LineItem,
  LineItemInput,
  Withholding,
  CommissionTotals,
  Totals,
  Reference,
  ReferenceInput,
  GlobalAdjustment,
  GlobalAdjustmentInput,
  CommissionLine,
  CommissionLineInput,
  Driver,
  Transport,
  TransportInput,
  Payment,
  HeaderOptions,
  SubtotalInfo,
  Header,
  Document,
  DocumentInput,
} from './model/document'
export type {
  SiiDocumento,
  SiiEncabezado,
  SiiIdDoc,
  SiiMntPagos,
  SiiEmisor,
  SiiReceptor,
  SiiTransporte,
  SiiTotales,
  SiiImptoReten,
  SiiComisionesTotales,
  SiiDetalle,
  SiiCdgItem,
  SiiSubTotInfo,
  SiiDscRcgGlobal,
  SiiReferencia,
  SiiComisiones,
} from './model/sii'
export { toSiiDocument, fromSiiDocument } from './model/codec'
export type { EnvelopeCover, EnvelopeCoverInput, EnvelopeSubtotal } from './model/cover'

export { sanitizeText, foldToAscii, truncateText, assertMaxLength } from './text/sanitize'
export { encodeLatin1, decodeLatin1 } from './text/latin1'
export { chileDate, chileTimestamp, chileDateTimeParts, toIsoDate, isIsoDate } from './time/chile'
export type { ChileDateTimeParts } from './time/chile'
export { calculateLineAmount, calculateTotals } from './totals/calculate'
export type { LineAmountInput, LineAmount, TotalsOptions } from './totals/calculate'

export { createDocument, FIELD_LIMITS } from './document/create'
export type { CreateDocumentOptions } from './document/create'
export { buildDocumentXml, documentElementName } from './document/build-xml'
export type { BuildDocumentXmlOptions } from './document/build-xml'
export { signDocument, verifyDocumentSignature } from './document/sign'
export type { SignedDocument } from './document/sign'
export { issueDocument } from './document/issue'
export type { IssueDocumentInput } from './document/issue'

export { buildXml } from './xml/build'
export { parseXml, parseXmlWithoutNamespaces, extractTagContent, decodeXmlEntities } from './xml/parse'
export type { ParsedXml } from './xml/parse'
export { escapeXmlText, escapeXmlAttribute } from './xml/escape'
export { wrapBase64, formatBase64Columns } from './xml/format'

export { sha1Base64 } from './crypto/digest'
export type { TextEncoding } from './crypto/digest'
export {
  rsaSha1SignBase64,
  rsaSha1VerifyBase64,
  rsaPublicKeyParts,
  rsaPublicKeyPartsFromCertificatePem,
} from './crypto/rsa'
export type { RsaPublicKeyParts } from './crypto/rsa'
export { parseCertificatePem, certificateBase64 } from './crypto/x509'
export type { ParsedCertificate } from './crypto/x509'

export { isCertificateExpired, daysUntilExpiry } from './certificate/certificate'
export type { Certificate, LoadCertificateOptions } from './certificate/certificate'
export { loadCertificateFromPem } from './certificate/pem'
export type { PemCertificateInput } from './certificate/pem'
export { loadCertificateFromPkcs12 } from './certificate/pkcs12'

export { parseCaf } from './caf/parse'
export type { Caf } from './caf/parse'
export { cafExpiresAt, isCafExpired, isFolioInRange, assertFolioInRange, availableFolios } from './caf/validity'
export { signWithCaf, verifyWithCaf } from './caf/sign'

export { stampDocument, verifyTed, buildDdString, buildTedXml, tedText } from './ted/build'
export type { Ted, StampedDocument, StampOptions } from './ted/build'
export { buildSignedInfo, buildSignatureXml, signEnveloped, verifyEnveloped } from './signature/xmldsig'
export type { XmlSignature, SignEnvelopedInput, SignatureVerification } from './signature/xmldsig'

export { createEnvelope, generateSetId } from './envelope/create'
export type { Envelope, EnvelopeKind, CreateEnvelopeInput } from './envelope/create'
export { buildEnvelopeXml, envelopeRootName } from './envelope/build-xml'
export { signEnvelope, verifyEnvelopeSignature } from './envelope/sign'
export type { SignedEnvelope } from './envelope/sign'
