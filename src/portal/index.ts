/**
 * EN: dte-sdk/portal entry: the certificate-authenticated SII portal (session, company data, folios and CAF requests, the
 * purchase and sales register, the MIPYME backup) and the certification sets. Node only: `fetch` cannot present a client
 * certificate.
 * ES: Entrada dte-sdk/portal: el portal del SII autenticado con certificado (sesión, datos de la empresa, folios y
 * solicitudes de CAF, el registro de compras y ventas, el respaldo MIPYME) y los sets de certificación. Solo Node: `fetch`
 * no puede presentar un certificado de cliente.
 */
export { PORTAL_REJECTIONS, portalRejectionMessage } from '../catalogs/portal'
export type { AccountingStatus, DocumentDirection, PortalRejection, RegisterOperation } from '../catalogs/portal'
export { createPortalClient, DEFAULT_PORTAL_RETRY_POLICY, isRetryablePortalError } from './client'
export type { PortalClient, PortalClientOptions } from './client'
export { createMemoryPortalLock } from './lock'
export type { PortalLock } from './lock'
export { openPortalSession, closePortalSession } from './session'
export type { PortalSessionInfo } from './session'
export { fetchCompanyResolution, fetchTaxpayerData, fetchIssuerProfile } from './company'
export type { IssuerProfile } from './company'
export type { CompanyResolution, TaxpayerData, TaxpayerActivity, TaxpayerBranch } from './pages/company'
export { queryCertificationSets } from './certification'
export type { CertificationSets } from './certification'
export type { CertificationSet } from './pages/certification'
export { listStampableTypes, queryFolioQuota, requestCaf } from './stamping'
export type { CafRequestInput, FolioQuota, ObtainedCaf } from './stamping'
export type { QuotaFields, StampableType } from './pages/stamping'
export { listFolioRanges, annulFolios } from './annulment'
export type { AnnulFoliosInput, AnnulmentResult, FolioRanges, FolioSpan } from './annulment'
export type { AnnulmentRejectionReason, UnusedFolioRange } from './pages/annulment'
export { listReobtainableRanges, reobtainCaf } from './reobtain'
export type { ReobtainableRange } from './reobtain'
export { requestCafExact, requestCafInBatches, reobtainFolios } from './flows'
export type {
  FolioFlowResult,
  ReobtainFoliosInput,
  ReobtainResult,
  RequestCafExactInput,
  RequestCafExactResult,
  RequestCafInBatchesInput,
} from './flows'
export {
  changePurchaseType,
  fetchPurchaseDocument,
  fetchRegisterSummary,
  listPeriodDocuments,
  listPurchaseTypes,
  moveVatToCommonUse,
  moveVatToRecoverable,
} from './rcv'
export type {
  ChangePurchaseTypeInput,
  ListPeriodDocumentsInput,
  MoveVatInput,
  PurchaseDocumentKey,
  RegisterSummaryInput,
} from './rcv'
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
} from './pages/rcv'
export { downloadMipymeBackup } from './backup'
export type { MipymeBackup, MipymeBackupChunk, MipymeBackupInput, MipymeDownloadedChunk } from './backup'
export { cafFingerprint, createFolioRegistry, createMemoryFolioRegistry } from '../folios/registry'
export type { FolioLedgerStore, FolioRegistry } from '../folios/registry'
export type { FolioEntry, FolioLedger, FolioScope, FolioSentRecord, FolioStats } from '../folios/ledger'
export {
  TEST_SET_KINDS,
  TEST_SET_PORTAL_NAMES,
  TEST_SET_REFERENCE_TYPE,
  CERTIFICATION_COUNTERPARTY,
} from '../catalogs/certification'
export type { TestSetKind } from '../catalogs/certification'
export { parseTestSetText } from '../certification/set-text'
export type { TestSet, TestCase, TestCaseItem, TestBookDocument } from '../certification/set-text'
export { planCertificationSets } from '../certification/set-plan'
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
} from '../certification/set-plan'
export { createFolioAllocator } from '../certification/folios'
export type { FolioSource, FolioAllocatorOptions } from '../certification/folios'
export { issueTestSet, TEST_SET_ENVELOPE_ID } from '../certification/issue-set'
export type { IssueSetOptions, IssuableSetPlan, IssuedCase, IssuedSet } from '../certification/issue-set'
export { issueSimulation } from '../certification/simulation'
export type { IssuedSimulation } from '../certification/simulation'
export {
  createCertificationSalesBook,
  createCertificationPurchaseBook,
  createCertificationGuideBook,
} from '../certification/books'
export type {
  CertificationBookInput,
  CertificationSalesBookInput,
  CertificationGuideBookInput,
  BookReceiver,
  GuideBookCaseFlag,
} from '../certification/books'
