/**
 * EN: dte-sdk public API: documents, stamps, signatures and envelopes, the SII books, and the SII web services client
 * (seed and token, uploads, status queries, acceptance and claims). Everything is exported from this single entry.
 * ES: API pública de dte-sdk: documentos, timbres, firmas y sobres, los libros del SII y el cliente de los servicios web
 * del SII (semilla y token, envíos, consultas de estado, aceptación y reclamos). Todo se exporta desde esta única entrada.
 */
export { DteError, DTE_ERROR_CODES, errorCode, isDteError } from './errors'
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
export { RECEPTION_STATUS, classifyReceptionStatus, receptionStatusMessage } from './catalogs/reception-status'
export type { ReceptionStatusClass } from './catalogs/reception-status'
export {
  CLAIM_ACTIONS,
  CLAIM_EVENT_CODES,
  CLAIM_RESPONSE_CODES,
  claimResponseMessage,
  TRANSFERABILITY_CODES,
  transferabilityMessage,
} from './catalogs/claim-codes'
export type { ClaimAction, ClaimActionCode } from './catalogs/claim-codes'

export { PORTAL_REJECTIONS, portalRejectionMessage } from './catalogs/portal'
export type { AccountingStatus, DocumentDirection, PortalRejection, RegisterOperation } from './catalogs/portal'

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
export {
  buildSignedInfo,
  buildSignatureXml,
  signEnveloped,
  signRootElement,
  verifyEnveloped,
} from './signature/xmldsig'
export type { XmlSignature, SignEnvelopedInput, SignRootElementInput, SignatureVerification } from './signature/xmldsig'

export { createEnvelope, generateSetId } from './envelope/create'
export type { Envelope, EnvelopeKind, CreateEnvelopeInput } from './envelope/create'
export { buildEnvelopeXml, envelopeRootName } from './envelope/build-xml'
export { signEnvelope, verifyEnvelopeSignature } from './envelope/sign'
export type { SignedEnvelope } from './envelope/sign'

export {
  BOOK_OPERATIONS,
  BOOK_KINDS,
  BOOK_SUBMISSIONS,
  BOOK_DOCUMENT_TYPES,
  isBookDocumentType,
  SUMMARY_ONLY_DOCUMENT_TYPES,
  NON_RECOVERABLE_VAT_CODES,
  GUIDE_TRANSFER_TYPES,
  GUIDE_VOID_CODES,
} from './catalogs/book-codes'
export type {
  BookOperation,
  BookKind,
  BookSubmission,
  BookAdjustment,
  BookDocumentType,
  NonRecoverableVatCode,
  GuideTransferType,
  GuideVoidCode,
} from './catalogs/book-codes'
export type {
  BookCoverInput,
  BookCover,
  PurchaseSalesCoverInput,
  PurchaseSalesCover,
  BookNonRecoverableVat,
  BookOtherTax,
  BookForeignReceiver,
  BookSettlementInput,
  BookTaxKind,
  BookEntryInput,
  BookEntry,
  BookTotalMismatch,
  BookNonRecoverableVatTotal,
  BookOtherTaxTotal,
  BookSettlementTotals,
  BookTotals,
  BookTotalsInput,
  PurchaseSalesBookInput,
  PurchaseSalesBook,
  GuideBookCoverInput,
  GuideBookCover,
  GuideEntryInput,
  GuideEntry,
  GuideTransferTotal,
  GuideTotals,
  GuideBookInput,
  GuideBook,
  FolioConsumptionCoverInput,
  FolioConsumptionCover,
  FolioConsumptionType,
  FolioConsumptionEntry,
  VoidedFolio,
  FolioRange,
  FolioConsumptionSummary,
  FolioConsumptionInput,
  FolioConsumption,
} from './model/book'
export type {
  SiiCaratulaLibro,
  SiiTotIVANoRec,
  SiiTotOtrosImp,
  SiiTotLiquidaciones,
  SiiTotalesSegmento,
  SiiTotalesPeriodo,
  SiiDetalleLibro,
  SiiEnvioLibro,
  SiiCaratulaLibroGuia,
  SiiResumenLibroGuia,
  SiiDetalleLibroGuia,
  SiiEnvioLibroGuia,
  SiiCaratulaConsumoFolios,
  SiiResumenConsumoFolios,
  SiiDocumentoConsumoFolios,
} from './model/sii-book'
export { toSiiPurchaseSalesBook, toSiiGuideBook, toSiiFolioConsumption } from './model/book-codec'
export { accumulateBookTotals } from './books/totals'
export {
  createPurchaseSalesBook,
  buildPurchaseSalesBookXml,
  signPurchaseSalesBook,
  verifyPurchaseSalesBookSignature,
} from './books/purchase-sales'
export type { SignedPurchaseSalesBook } from './books/purchase-sales'
export {
  createGuideBook,
  buildGuideBookXml,
  signGuideBook,
  verifyGuideBookSignature,
  accumulateGuideTotals,
} from './books/guide'
export type { SignedGuideBook } from './books/guide'
export {
  createFolioConsumption,
  buildFolioConsumptionXml,
  signFolioConsumption,
  verifyFolioConsumptionSignature,
  compactFolioRanges,
} from './books/folio-consumption'
export type { SignedFolioConsumption } from './books/folio-consumption'
export { bookEntryFromDocument, guideEntryFromDocument, folioConsumptionEntryFromDocument } from './books/from-document'
export type { BookEntryFromDocumentOptions } from './books/from-document'

export { silentLogger } from './sii/logger'
export type { Logger, LogFn, LogContext } from './sii/logger'
export { tokenCacheKey, createMemoryTokenCache } from './sii/token-cache'
export type { TokenChannel, CachedToken, TokenCache } from './sii/token-cache'
export { DEFAULT_RETRY_POLICY, isRetryableError } from './sii/retry'
export type { RetryPolicy, RetryOptions } from './sii/retry'
export { createFetchTransport } from './sii/transport'
export type { HttpMethod, HttpRequest, HttpResponse, HttpTransport, BodyEncoding, FetchLike } from './sii/transport'
export { createNodeHttpsTransport } from './sii/node-transport'
export type { NodeTlsOptions, NodeHttpsTransportOptions, TlsVersion } from './sii/node-transport'
export { redactExchange, createMemoryCapture } from './sii/capture'
export type {
  HttpChannel,
  HttpExchange,
  HttpExchangeRequest,
  HttpExchangeResponse,
  HttpExchangeError,
  HttpCapture,
} from './sii/capture'
export { createMemoryUploadArchive } from './sii/archive'
export type { UploadKind, UploadRecord, UploadArchive } from './sii/archive'
export { createDirectoryCapture } from './sii/node-capture'
export type { DirectoryCaptureOptions } from './sii/node-capture'
export { createDirectoryUploadArchive } from './sii/node-archive'
export type { DirectoryUploadArchiveOptions } from './sii/node-archive'
export { createSiiClient } from './sii/client'
export type { SiiClient, SiiClientOptions, SiiTimeouts, SiiEndpoints, CallOverrides, SleepFn } from './sii/client'
export { buildSoapEnvelope, parseSoapResponse } from './sii/soap'
export type { SoapParam, SoapEnvelopeInput, SoapFault, SoapResponse } from './sii/soap'
export { buildMultipartBody } from './sii/multipart'
export type { MultipartField, MultipartFile, MultipartBodyInput } from './sii/multipart'
export { getSeed, signSeed, getToken, invalidateToken } from './sii/auth'
export { uploadEnvelope, uploadBook, uploadFolioConsumption } from './sii/upload'
export type {
  UploadReceipt,
  UploadableEnvelope,
  UploadEnvelopeInput,
  UploadXmlInput,
  ReceptionOutcome,
} from './sii/upload'
export { queryUploadStatus, waitForUploadStatus, queryDocumentStatus, folioReceived } from './sii/status'
export type {
  UploadStatus,
  UploadStatusCounts,
  UploadStatusDocument,
  UploadStatusDocumentError,
  QueryUploadStatusInput,
  WaitForUploadStatusInput,
  DocumentStatus,
  QueryDocumentStatusInput,
  FolioReceivedInput,
} from './sii/status'
export { registerClaim, listClaimEvents, queryTransferable, queryReceptionDate, receiverStatus } from './sii/claims'
export type {
  ClaimDocumentType,
  ClaimDocumentInput,
  RegisterClaimInput,
  ClaimResult,
  ClaimEvent,
  ClaimEventsResult,
  TransferabilityResult,
  ReceptionDateResult,
  ReceiverStatus,
  ReceiverStatusResult,
} from './sii/claims'

export { createPortalClient, DEFAULT_PORTAL_RETRY_POLICY, isRetryablePortalError } from './portal/client'
export type { PortalClient, PortalClientOptions } from './portal/client'
export { createMemoryPortalLock } from './portal/lock'
export type { PortalLock } from './portal/lock'
export { openPortalSession, closePortalSession } from './portal/session'
export type { PortalSessionInfo } from './portal/session'
export { fetchCompanyResolution, fetchTaxpayerData, fetchIssuerProfile } from './portal/company'
export type { IssuerProfile } from './portal/company'
export type { CompanyResolution, TaxpayerData, TaxpayerActivity, TaxpayerBranch } from './portal/pages/company'
export { queryCertificationSets } from './portal/certification'
export type { CertificationSets } from './portal/certification'
export type { CertificationSet } from './portal/pages/certification'
export { listStampableTypes, queryFolioQuota, requestCaf } from './portal/stamping'
export type { CafRequestInput, FolioQuota, ObtainedCaf } from './portal/stamping'
export type { QuotaFields, StampableType } from './portal/pages/stamping'
export { listFolioRanges, annulFolios } from './portal/annulment'
export type { AnnulFoliosInput, AnnulmentResult, FolioRanges, FolioSpan } from './portal/annulment'
export type { AnnulmentRejectionReason, UnusedFolioRange } from './portal/pages/annulment'
export { listReobtainableRanges, reobtainCaf } from './portal/reobtain'
export type { ReobtainableRange } from './portal/reobtain'
export { requestCafExact, requestCafInBatches, reobtainFolios } from './portal/flows'
export type {
  FolioFlowResult,
  ReobtainFoliosInput,
  ReobtainResult,
  RequestCafExactInput,
  RequestCafExactResult,
  RequestCafInBatchesInput,
} from './portal/flows'
export {
  changePurchaseType,
  fetchPurchaseDocument,
  fetchRegisterSummary,
  listPeriodDocuments,
  listPurchaseTypes,
  moveVatToCommonUse,
  moveVatToRecoverable,
} from './portal/rcv'
export type {
  ChangePurchaseTypeInput,
  ListPeriodDocumentsInput,
  MoveVatInput,
  PurchaseDocumentKey,
  RegisterSummaryInput,
} from './portal/rcv'
export type {
  PeriodDocument,
  PeriodDocuments,
  PeriodSummaryRow,
  PurchaseDocument,
  PurchaseType,
  RcvObject,
  RegisterHeader,
  RegisterSummary,
  RegisterSummaryRow,
} from './portal/pages/rcv'
export { downloadMipymeBackup } from './portal/backup'
export type { MipymeBackup, MipymeBackupChunk, MipymeBackupInput, MipymeDownloadedChunk } from './portal/backup'

export { cafFingerprint, createFolioRegistry, createMemoryFolioRegistry } from './folios/registry'
export type { FolioLedgerStore, FolioRegistry } from './folios/registry'
export { createDirectoryFolioRegistry } from './folios/node-registry'
export type { DirectoryFolioRegistryOptions } from './folios/node-registry'
export type { FolioEntry, FolioLedger, FolioScope, FolioSentRecord, FolioStats } from './folios/ledger'

export { parsePrintableDocuments } from './pdf/parse'
export type {
  PrintableAdjustment,
  PrintableDocument,
  PrintableIssuer,
  PrintableItem,
  PrintableParty,
  PrintableReference,
  PrintableTotals,
} from './pdf/parse'
export { renderTedBarcode } from './pdf/stamp'
export { needsTransferableCopy, renderPrintedSample } from './pdf/render'
export type { PrintedLogo, PrintedSampleOptions, RenderPrintedSampleOptions } from './pdf/render'
export { renderPrintedSamples } from './pdf/samples'
export type {
  PrintedEnvelope,
  PrintedSample,
  PrintedSampleFailure,
  PrintedSampleSet,
  PrintedSamplesInput,
  PrintedSamplesResult,
} from './pdf/samples'
export { findEnvelopeFiles, writePrintedSamples } from './pdf/node-samples'
export type { WritePrintedSamplesInput, WritePrintedSamplesResult, WrittenPrintedSample } from './pdf/node-samples'

export {
  TEST_SET_KINDS,
  TEST_SET_PORTAL_NAMES,
  TEST_SET_REFERENCE_TYPE,
  CERTIFICATION_COUNTERPARTY,
} from './catalogs/certification'
export type { TestSetKind } from './catalogs/certification'
export { parseTestSetText } from './certification/set-text'
export type { TestSet, TestCase, TestCaseItem, TestBookDocument } from './certification/set-text'
export { planCertificationSets } from './certification/set-plan'
export type {
  CertificationPlan,
  BasicSetPlan,
  ExemptSetPlan,
  GuideSetPlan,
  PurchaseSetPlan,
  PurchaseBookPlan,
  PlannedInvoice,
  PlannedNote,
  PlannedGuide,
  PlannedItem,
  SetFolios,
} from './certification/set-plan'
export { createFolioAllocator } from './certification/folios'
export type { FolioSource, FolioAllocatorOptions } from './certification/folios'
export { issueTestSet, TEST_SET_ENVELOPE_ID } from './certification/issue-set'
export type { IssueSetOptions, IssuableSetPlan, IssuedCase, IssuedSet } from './certification/issue-set'
export { issueSimulation } from './certification/simulation'
export type { IssuedSimulation } from './certification/simulation'
export {
  createCertificationSalesBook,
  createCertificationPurchaseBook,
  createCertificationGuideBook,
} from './certification/books'
export type {
  CertificationBookInput,
  CertificationSalesBookInput,
  CertificationGuideBookInput,
  BookReceiver,
  GuideBookCaseFlag,
} from './certification/books'
