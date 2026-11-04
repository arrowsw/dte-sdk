import { expectTypeOf } from 'expect-type'
import type { PortalClient } from '../src/portal/client'
import {
  createDocument,
  issueDocument,
  stampDocument,
  signDocument,
  toSiiRut,
  DOCUMENT_TYPES,
  classifyUploadStatus,
  parseCaf,
  loadCertificateFromPkcs12,
  createEnvelope,
  signEnvelope,
  DteError,
  createSiiClient,
  createFetchTransport,
  uploadEnvelope,
  queryUploadStatus,
  queryDocumentStatus,
  queryReceptionDate,
  receiverStatus,
  registerClaim,
  folioReceived,
  createPurchaseSalesBook,
  signPurchaseSalesBook,
  createGuideBook,
  signGuideBook,
  createFolioConsumption,
  signFolioConsumption,
  bookEntryFromDocument,
  parsePrintableDocuments,
  renderPrintedSample,
  renderTedBarcode,
  renderPrintedSamples,
  writePrintedSamples,
  needsTransferableCopy,
} from '../src'
import type {
  PrintableDocument,
  PrintedSamplesResult,
  WritePrintedSamplesResult,
  BookEntryInput,
  BookTotals,
  FolioConsumption,
  GuideBook,
  GuideTotals,
  PurchaseSalesBook,
  SignedFolioConsumption,
  SignedGuideBook,
  SignedPurchaseSalesBook,
  Document,
  SignedDocument,
  StampedDocument,
  SiiRut,
  DteErrorCode,
  UploadStatusClass,
  Caf,
  Certificate,
  Envelope,
  SignedEnvelope,
  EnvelopeKind,
  Environment,
  SiiClient,
  SiiClientOptions,
  SiiEndpoints,
  SiiTimeouts,
  CallOverrides,
  TokenChannel,
  TokenCache,
  CachedToken,
  HttpTransport,
  HttpRequest,
  HttpResponse,
  HttpCapture,
  HttpExchange,
  Logger,
  RetryPolicy,
  UploadArchive,
  UploadKind,
  UploadRecord,
  UploadReceipt,
  UploadStatus,
  UploadStatusDocument,
  DocumentStatus,
  DocumentStatusClass,
  ClaimAction,
  ClaimResult,
  ClaimEvent,
  ReceiverStatus,
  ReceiverStatusResult,
  ReceptionDateResult,
} from '../src'

// Every type the SII web services design names is exported: a missing one fails the import above, and this tuple
// keeps each import in use.
type SiiWebServicesTypes = [
  EnvelopeKind,
  Environment,
  SiiClient,
  SiiClientOptions,
  SiiEndpoints,
  SiiTimeouts,
  CallOverrides,
  TokenChannel,
  TokenCache,
  CachedToken,
  HttpTransport,
  HttpRequest,
  HttpResponse,
  HttpCapture,
  HttpExchange,
  Logger,
  RetryPolicy,
  UploadArchive,
  UploadKind,
  UploadRecord,
  UploadReceipt,
  UploadStatus,
  UploadStatusDocument,
  DocumentStatus,
  DocumentStatusClass,
  ClaimAction,
  ClaimResult,
  ClaimEvent,
  ReceiverStatus,
]

const _typecheck = () => {
  expectTypeOf(createDocument).returns.toEqualTypeOf<Document>()
  expectTypeOf(stampDocument).returns.toEqualTypeOf<StampedDocument>()
  expectTypeOf(signDocument).returns.toEqualTypeOf<SignedDocument>()
  expectTypeOf(issueDocument).returns.toEqualTypeOf<SignedDocument>()
  expectTypeOf(toSiiRut).returns.toEqualTypeOf<SiiRut>()
  expectTypeOf<SiiRut>().toMatchTypeOf<string>()
  expectTypeOf<string>().not.toMatchTypeOf<SiiRut>()
  expectTypeOf(DOCUMENT_TYPES.invoice).toEqualTypeOf<33>()
  expectTypeOf(classifyUploadStatus).returns.toEqualTypeOf<UploadStatusClass>()
  expectTypeOf(parseCaf).returns.toEqualTypeOf<Caf>()
  expectTypeOf(loadCertificateFromPkcs12).returns.toEqualTypeOf<Certificate>()
  expectTypeOf(createEnvelope).returns.toEqualTypeOf<Envelope>()
  expectTypeOf(signEnvelope).returns.toEqualTypeOf<SignedEnvelope>()
  expectTypeOf<DteError['code']>().toEqualTypeOf<DteErrorCode>()

  // SII web services: the client is data and every operation is a free function that takes it first.
  expectTypeOf(createSiiClient).returns.toEqualTypeOf<SiiClient>()
  expectTypeOf(createSiiClient).parameter(0).toEqualTypeOf<SiiClientOptions>()
  expectTypeOf<SiiClient['retry']>().toEqualTypeOf<RetryPolicy | false>()
  expectTypeOf<SiiClient['companyRut']>().toEqualTypeOf<SiiRut | null>()
  expectTypeOf<SiiClient['senderRut']>().toEqualTypeOf<SiiRut>()
  expectTypeOf<SiiClient['capture']>().toEqualTypeOf<HttpCapture | null>()
  expectTypeOf<SiiClient['archive']>().toEqualTypeOf<UploadArchive | null>()
  expectTypeOf<SiiClient>().not.toHaveProperty('uploadEnvelope')
  expectTypeOf<SiiClient>().not.toHaveProperty('registerClaim')
  expectTypeOf(uploadEnvelope).parameter(0).toEqualTypeOf<SiiClient>()
  expectTypeOf(uploadEnvelope).returns.resolves.toEqualTypeOf<UploadReceipt>()
  expectTypeOf(queryUploadStatus).returns.resolves.toEqualTypeOf<UploadStatus>()
  expectTypeOf(queryDocumentStatus).returns.resolves.toEqualTypeOf<DocumentStatus>()
  expectTypeOf(registerClaim).returns.resolves.toEqualTypeOf<ClaimResult>()
  expectTypeOf(registerClaim).parameter(2).toEqualTypeOf<CallOverrides | undefined>()
  expectTypeOf(folioReceived).returns.resolves.toEqualTypeOf<boolean | null>()
  expectTypeOf(receiverStatus).returns.resolves.toEqualTypeOf<ReceiverStatusResult>()
  expectTypeOf(queryReceptionDate).returns.resolves.toEqualTypeOf<ReceptionDateResult>()
  expectTypeOf<ReceptionDateResult>().toEqualTypeOf<{ readonly receivedAt: string | null; readonly raw: string }>()
  expectTypeOf<ReceiverStatusResult['lastEvent']>().toEqualTypeOf<ClaimEvent | null>()
  expectTypeOf(createFetchTransport).returns.toEqualTypeOf<HttpTransport>()
  expectTypeOf<HttpTransport>().parameter(0).toEqualTypeOf<HttpRequest>()
  expectTypeOf<HttpTransport>().returns.resolves.toEqualTypeOf<HttpResponse>()
  expectTypeOf<ClaimAction>().toEqualTypeOf<
    'acceptContent' | 'claimContent' | 'acknowledgeGoods' | 'claimPartialShortfall' | 'claimTotalShortfall'
  >()
  expectTypeOf<ReceiverStatus>().toEqualTypeOf<'accepted' | 'goodsReceived' | 'claimed' | 'none' | 'unknown'>()
  expectTypeOf<UploadKind>().toEqualTypeOf<'dte' | 'receipt' | 'book' | 'folioConsumption'>()
  expectTypeOf<TokenChannel>().toEqualTypeOf<'soap' | 'rest'>()
  expectTypeOf(createPurchaseSalesBook).returns.toEqualTypeOf<PurchaseSalesBook>()
  expectTypeOf(signPurchaseSalesBook).returns.toEqualTypeOf<SignedPurchaseSalesBook>()
  expectTypeOf(createGuideBook).returns.toEqualTypeOf<GuideBook>()
  expectTypeOf(signGuideBook).returns.toEqualTypeOf<SignedGuideBook>()
  expectTypeOf(createFolioConsumption).returns.toEqualTypeOf<FolioConsumption>()
  expectTypeOf(signFolioConsumption).returns.toEqualTypeOf<SignedFolioConsumption>()
  expectTypeOf(bookEntryFromDocument).returns.toEqualTypeOf<BookEntryInput>()
  expectTypeOf(parsePrintableDocuments).returns.toEqualTypeOf<readonly PrintableDocument[]>()
  expectTypeOf(needsTransferableCopy).returns.toEqualTypeOf<boolean>()
  expectTypeOf(renderPrintedSample).returns.resolves.toEqualTypeOf<Uint8Array>()
  expectTypeOf(renderTedBarcode).returns.resolves.toEqualTypeOf<Uint8Array>()
  expectTypeOf(renderPrintedSamples).returns.resolves.toEqualTypeOf<PrintedSamplesResult>()
  expectTypeOf(writePrintedSamples).returns.resolves.toEqualTypeOf<WritePrintedSamplesResult>()
  expectTypeOf<PurchaseSalesBook['periodTotals']>().toEqualTypeOf<readonly BookTotals[] | null>()
  expectTypeOf<GuideBook['periodTotals']>().toEqualTypeOf<GuideTotals | null>()

  // The client is frozen data: its fields cannot be assigned.
  const sii = createSiiClient({} as SiiClientOptions)
  // @ts-expect-error environment is readonly
  sii.environment = 'production'
}

test('public API types compile', () => {
  const names: SiiWebServicesTypes | null = null
  expect(names).toBeNull()
  expect(typeof _typecheck).toBe('function')
})

describe('portal client', () => {
  test('is immutable data', () => {
    expectTypeOf<PortalClient['companyRut']>().toEqualTypeOf<SiiRut | null>()
    expectTypeOf<PortalClient['randomId']>().toEqualTypeOf<() => string>()
    // @ts-expect-error every field is readonly
    const write = (portal: PortalClient): void => void (portal.timeoutMs = 1)
    expect(typeof write).toBe('function')
  })
})
