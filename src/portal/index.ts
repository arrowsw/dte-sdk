/**
 * EN: dte-sdk/portal entry: the certificate-authenticated SII portal (session, company data, folios and CAF requests, the
 * purchase and sales register, the MIPYME backup), the certification sets and the certification runner. Node only: `fetch`
 * cannot present a client certificate.
 * ES: Entrada dte-sdk/portal: el portal del SII autenticado con certificado (sesión, datos de la empresa, folios y
 * solicitudes de CAF, el registro de compras y ventas, el respaldo MIPYME), los sets de certificación y el proceso de
 * certificación. Solo Node: `fetch` no puede presentar un certificado de cliente.
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
export type { FolioEntry, FolioLedger, FolioScope, FolioSentRecord, FolioStats, ReserveOptions } from '../folios/ledger'
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
  BookCaseTotals,
  SalesBookCase,
  GuideBookCase,
  SalesBookSource,
  GuideBookSource,
} from '../certification/books'

// Phase 5b-2: the certification portal (declarations, books, the runner).
export {
  SET_KEYS,
  BOOK_KEYS,
  MANDATORY_BOOK_KEYS,
  BOOK_FILE_NAMES,
  BOOK_ARTEFACT_NAMES,
  SET_ARTEFACT_NAMES,
  DEFAULT_OPTIONAL_SETS,
  CERTIFICATION_STAGES,
  PORTAL_STAGE_WORDS,
  CERTIFICATION_STEPS,
} from '../catalogs/certification'
export type { SetKey, BookKey, DeclarationKey, CertificationStage, CertificationStep } from '../catalogs/certification'
export {
  downloadTestSet,
  declareProgress,
  readProgress,
  advanceStage,
  listBookHistory,
  declareCompliance,
} from './certification'
export type {
  DownloadTestSetInput,
  DownloadedTestSet,
  DeclarationEntry,
  DeclarationEntries,
  DeclareProgressInput,
  DeclarationOutcome,
  DeclarationResult,
  ProgressReport,
  AdvanceResult,
  BookHistory,
  ComplianceResult,
} from './certification'
export type { SetGenerationState, OptionalSetOption, SetGenerationPage } from './pages/certification-set'
export type {
  DeclarationForm,
  DeclarationAnswer,
  DeclarationVerification,
  AdvanceAnswer,
  ItemState,
  ProgressPage,
} from './pages/certification-progress'
export type { BookHistoryEntry } from './pages/certification-books'
export type { ComplianceForm } from './pages/certification-compliance'
export { createCertificationState, createMemoryCertificationStore, assertArtefactName } from '../certification/state'
export type {
  CertificationState,
  CertificationStore,
  SentEnvelope,
  SentCase,
  SentSet,
  SentBook,
  BooksState,
  AccumulatedTotals,
  EnvelopeDiagnosis,
} from '../certification/state'
export { createDirectoryCertificationStore } from '../certification/node-store'
export type { DirectoryCertificationStoreOptions } from '../certification/node-store'
export { DEFAULT_CERTIFICATION_ISSUER, DEFAULT_CERTIFICATION_RECEIVER } from '../certification/runtime'
export type {
  CertificationDependencies,
  CertificationIssuerInput,
  CertificationProgressEvent,
  PollingLabel,
  StepResult,
} from '../certification/runtime'
export {
  obtainTestSet,
  sendTestSet,
  declareTestSets,
  waitForTestSetsApproval,
  advanceToNextStage,
  sendSimulation,
  declareSimulation,
  waitForSimulationApproval,
  declareComplianceFinal,
} from '../certification/steps'
export { prepareFolios, setFolioNeeds, simulationFolioNeeds } from '../certification/folios-step'
export type { PrepareFoliosOptions, PrepareFoliosResult } from '../certification/folios-step'
export { runBooks, previousPeriod, nextFreePeriod } from '../certification/books-step'
export type { BooksOutcome } from '../certification/books-step'

// Phase 5c-1: the exchange and the printed samples (the two GWT portals).
export { EXCHANGE_PORTAL, SAMPLES_PORTAL, EXCHANGE_ANSWER_FILES, EXCHANGE_ANSWER_KEYS } from '../catalogs/certification'
export type { GwtPortal, ExchangeAnswerKey } from '../catalogs/certification'
export { gwtBody, gwtAnswer, encodeGwtLong, decodeGwtLong, discoverGwtHashes } from './gwt'
export type { GwtCall, GwtParameter, GwtAnswer, GwtHashes, GwtDiscoveryInput } from './gwt'
export { downloadExchangeSet, validateExchangeUser, uploadExchangeAnswers, confirmExchange } from './exchange'
export type {
  ExchangeCompanyInput,
  ExchangeGwtInput,
  ExchangeSetDownload,
  ExchangeUserValidation,
  UploadExchangeAnswersInput,
  ExchangeUploadAnswer,
  ExchangeUploadResult,
  ExchangeConfirmationAnswer,
  ExchangeConfirmation,
} from './exchange'
export type { ExchangeUserState } from './pages/exchange'
export { readSamplesReview, createSamplesReview, uploadSample, submitSamplesReview, readSamplesDetail } from './samples'
export type {
  SamplesCompanyInput,
  SamplesReviewInput,
  SamplesReview,
  SamplesReviewCreated,
  UploadSampleInput,
  SampleUploaded,
  SamplesDetail,
} from './samples'
export type { ReviewState, SampleDetail } from './pages/samples'
export { createExchangeAnswers, parseExchangeSet } from '../certification/exchange'
export type {
  ExchangeDocument,
  ExchangeSet,
  ExchangeContact,
  CreateExchangeAnswersInput,
  ExchangeAnswer,
  ExchangeAnswers,
} from '../certification/exchange'
export type { ExchangeState, SamplesState } from '../certification/state'
export { runExchange, EXCHANGE_SET_ARTEFACT } from '../certification/exchange-step'
export type { RunExchangeInput, ExchangeOutcome } from '../certification/exchange-step'
export { uploadPrintedSamples } from '../certification/samples-step'
export type { UploadPrintedSamplesInput, SamplesOutcome } from '../certification/samples-step'
export type { PrintedSampleFile } from '../pdf/samples'
export { runCertification } from '../certification/runner'
export type { RunCertificationOptions, RunCertificationResult, RunStop } from '../certification/runner'

// Phase 5c-2: the certification of receipts (the receipts portal).
export { RECEIPTS_PORTAL } from '../catalogs/certification'
export { parseReceiptsTestSet } from '../certification/receipts-set'
export type { ReceiptsTestCase, ReceiptsTestItem } from '../certification/receipts-set'
export { issueReceiptsSet } from '../certification/receipts'
export type { IssueReceiptsSetOptions, IssuedReceipt, IssuedReceiptsSet } from '../certification/receipts'
export { sendReceiptsSet, resendReceiptsConsumption } from '../certification/receipts-send'
export type {
  ReceiptsProgressEvent,
  SendReceiptsSetOptions,
  ReceiptsConsumptionAttempt,
  ReceiptsSendResult,
  ResendReceiptsConsumptionInput,
} from '../certification/receipts-send'
export {
  downloadReceiptsTestSet,
  declareReceiptsTrackId,
  readReceiptsStatus,
  declareReceiptsCompliance,
  verifyReceiptsAuthorization,
} from './receipts-certification'
export type {
  ReceiptsPortalInput,
  DownloadReceiptsTestSetInput,
  ReceiptsTestSetDownload,
  ReceiptsStatus,
  ReceiptsProvider,
  DeclareReceiptsComplianceInput,
  ReceiptsComplianceResult,
  VerifyReceiptsAuthorizationInput,
  ReceiptsAuthorizationCheck,
  ReceiptsAuthorization,
} from './receipts-certification'
export type { ReceiptsProgress } from './pages/certification-progress'
