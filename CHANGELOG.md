# Changelog

All notable changes to **dte-sdk** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Core issuance: `createDocument`, `stampDocument` (TED), `signDocument` (enveloped XMLDSig),
  `issueDocument`, `createEnvelope`/`signEnvelope` (`EnvioDTE`, `EnvioBOLETA`), verification
  helpers (`verifyTed`, `verifyDocumentSignature`, `verifyEnvelopeSignature`).
- Domain model in English with bilingual (EN/ES) JSDoc, SII-shaped types and the
  `toSiiDocument`/`fromSiiDocument` codec.
- Certificates from PKCS#12 and PEM, CAF parsing and validity, Chile-local timestamps,
  text sanitization and ISO-8859-1 encoding, SII status code classification.
- Dependencies: `node-forge`, `@xmldom/xmldom`, `fast-xml-parser`, `rut.ts`. Optional peers of `dte-sdk/pdf`: `pdf-lib`,
  `bwip-js`.
- SII web services client: `createSiiClient` (plain data, no methods) and free functions
  for seed/token on the DTEWS SOAP and receipts REST channels (`getSeed`, `getToken`),
  uploads (`uploadEnvelope`, `uploadBook`, `uploadFolioConsumption`) with duplicate
  recovery, status queries (`queryUploadStatus`, `waitForUploadStatus`,
  `queryDocumentStatus`, `folioReceived`) and the acceptance/claim registry
  (`registerClaim`, `listClaimEvents`, `queryTransferable`, `queryReceptionDate`,
  `receiverStatus`). Uploads and `registerClaim` are never re-sent once the SII has
  answered, even if the reply was cut off halfway (transport errors then carry
  `details.responseStarted: true`), except once with a fresh token when the SII refused
  the token. `retry.retryOn` can narrow what is retried, never widen it. Getting a token is
  one retry loop around seed, signature and token (a fresh seed per attempt), and
  `waitForUploadStatus` polls inside a hard `timeoutMs` budget instead of applying the
  retry policy to every poll. Uploaded XML must open with an XML declaration naming
  ISO-8859-1 (the bytes sent are ISO-8859-1), else `INVALID_OPTION { field: 'xml' }`
  before anything is sent; whitespace before the declaration is dropped. Errors follow the
  spec: transport failures carry `details.operation` (and `timeoutMs` on `REQUEST_TIMEOUT`),
  `SII_HTTP_ERROR` carries `details.url` (never in the message) and
  `SII_UPLOAD_REJECTED.details.status` is a number.
- Injectable HTTP transport (`createFetchTransport`, `createNodeHttpsTransport` with TLS
  verification on by default; `tls.ca` adds to Node's bundled roots instead of replacing
  them), token cache, retry policy with backoff, HTTP capture with
  redaction (`createMemoryCapture`, `createDirectoryCapture`) and upload archive
  (`createMemoryUploadArchive`, `createDirectoryUploadArchive`; a duplicate answer is kept
  as `<trackId>-<kind>-duplicate-<timestamp>` and archived replies and SOAP fault reasons have
  tokens redacted). SOAP calls send `SOAPAction: ""`. The Node adapters load
  `node:` modules lazily, so importing the package evaluates no `node:` module.
- Catalogs: `DTEUpload` reception statuses, claim actions/events/response codes,
  `FAN` document status, the `RCO` envelope status (rejected), REST per-document status
  endpoint, WSRECLAMO service URLs (`CLAIM_WS_ENDPOINTS`) and their WSDLs
  (`CLAIM_WSDL_ENDPOINTS`).
- Helpers for custom adapters and tests: `buildMultipartBody`, `buildSoapEnvelope`/`parseSoapResponse`,
  `signSeed`, `signRootElement`, `redactExchange` and `tokenCacheKey`.
- SII books: the purchase and sales book (`createPurchaseSalesBook`, IECV), the dispatch guide book
  (`createGuideBook`) and the folio consumption report (`createFolioConsumption`, RCOF), each with
  `build*Xml`, `sign*`, `verify*Signature` and `toSii*`, in all the submission kinds of their
  schemas. The SDK computes the summaries from the lines; `summaryOnlyTotals` and `previousTotals`
  (with `accumulateBookTotals`/`accumulateGuideTotals`) carry what cannot be derived. An explicit
  line total that differs from the SII formula is kept and reported in `totalMismatches`, and
  `strictTotals: true` throws the new `BOOK_TOTAL_MISMATCH`. `bookEntryFromDocument`,
  `guideEntryFromDocument` and `folioConsumptionEntryFromDocument` derive the lines from documents.
- Book catalogs: `BOOK_OPERATIONS`, `BOOK_KINDS`, `BOOK_SUBMISSIONS`, `BOOK_DOCUMENT_TYPES`,
  `isBookDocumentType`, `SUMMARY_ONLY_DOCUMENT_TYPES`, `NON_RECOVERABLE_VAT_CODES`,
  `GUIDE_TRANSFER_TYPES`, `GUIDE_VOID_CODES`, plus `compactFolioRanges`.
- `uploadBook` and `uploadFolioConsumption` accept `fileName`, and a `LibroGuia` uploads as
  `LibroGuia.xml` by default.
- SII portal: `createPortalClient`, certificate login with reused sessions (`openPortalSession`, `closePortalSession`,
  `createMemoryPortalLock`), company data (`fetchCompanyResolution`, `fetchTaxpayerData`, `fetchIssuerProfile`), certification
  state (`queryCertificationSets`), folios (`listStampableTypes`, `queryFolioQuota`, `requestCaf`, `listFolioRanges`,
  `annulFolios`, `listReobtainableRanges`, `reobtainCaf`) and composite flows (`requestCafExact`, `requestCafInBatches`,
  `reobtainFolios`), with `SII_PORTAL_*` error codes, `PORTAL_REJECTIONS` and redaction of session cookies. Measured
  against the real SII up to the login, the logout and the refusal pages; the pages of an enrolled company are not.
- SII purchase and sales register (RCV) on the portal session: `listPeriodDocuments`, `fetchRegisterSummary`,
  `listPurchaseTypes`, `fetchPurchaseDocument`, and the writes `changePurchaseType`, `moveVatToCommonUse` and
  `moveVatToRecoverable`, one attempt each and confirmed only by the SII's `OK`. Response codes are not looked at, so a
  month the SII refuses to show reads as an empty one. `PortalClientOptions.randomId` is new.
- MIPYME backup: `downloadMipymeBackup` splits a date range to fit the 20 documents the SII allows per download and
  downloads the XML, in the result or through `onChunk`. It reads production whatever the client's environment. Known
  defect: a two-day range with more than 20 documents downloads only its first day, while `total` counts both.
- Local folio registry: `createFolioRegistry`, `createMemoryFolioRegistry`, `createDirectoryFolioRegistry`, `cafFingerprint`.
- Printed samples (Node): `parsePrintableDocuments` (any `EnvioDTE`, `EnvioBOLETA`, `SetDTE` or `DTE` XML, with each
  `TED` verbatim), `renderPrintedSample` (one single-page PDF per the SII printed-samples manual, with the transferable
  copy and acknowledgement box), `renderTedBarcode` (the PDF417 stamp as PNG with the signed bytes), `needsTransferableCopy`,
  `renderPrintedSamples` (in-memory batch classified into the test and simulation sets, failures as data) and the Node
  adapter `writePrintedSamples`/`findEnvelopeFiles` (`SET-PRUEBAS` and `SET-SIMULACION` on disk). `pdf-lib`
  and `bwip-js` load on first use. Error codes `DEPENDENCY_UNAVAILABLE` and `PDF_RENDER_FAILED`, and `errorCode`.
  A folio that is not a run of digits is an `INVALID_FOLIO` failure of its document and never names a file, and the
  Node adapter refuses a sample path outside the folder of its set.
- Certification, the deterministic half: `parseTestSetText` (the SII test-set text to typed sets and cases),
  `planCertificationSets`, `createFolioAllocator` (a `FolioSource` over one or several CAFs), `issueTestSet` (the
  basic, exempt, guide and purchase sets through phase 1, with the `SET` reference and the field rules), `issueSimulation`
  (every case again in one envelope) and `createCertificationSalesBook`, `createCertificationPurchaseBook`,
  `createCertificationGuideBook` through phase 3. Catalog `TEST_SET_KINDS`, `TEST_SET_PORTAL_NAMES`,
  `TEST_SET_REFERENCE_TYPE`, `TEST_SET_ENVELOPE_ID`, `CERTIFICATION_COUNTERPARTY`. `DocumentInput.withholdVat` withholds
  the VAT on the notes of a purchase invoice. Bundle limit to 64 kB.
- Certification, the portal half, in `dte-sdk/portal`: `downloadTestSet`, `declareProgress`, `readProgress`,
  `advanceStage`, `listBookHistory`, `declareCompliance` on the phase 4 session, with pure page modules;
  `CertificationState` and the `CertificationStore` port (`createMemoryCertificationStore`,
  `createDirectoryCertificationStore`, private files); the steps `obtainTestSet`, `prepareFolios`, `sendTestSet`,
  `declareTestSets`, `waitForTestSetsApproval`, `runBooks`, `advanceToNextStage`, `sendSimulation`, `declareSimulation`,
  `waitForSimulationApproval`, `declareComplianceFinal`, each returning the saved state with an outcome, with typed
  progress events; and `runCertification`, which chains them in the field's order, resumes from the saved state and
  makes the irreversible declaration of compliance only with `declareCompliance: true`. Catalog `SET_KEYS`, `BOOK_KEYS`, `CERTIFICATION_STAGES`, `CERTIFICATION_STEPS`,
  `DEFAULT_OPTIONAL_SETS`; portal rejections `notEnrolled`, `advanceRefused`, `declarationDeclined`. The 5b-1 books
  accept the cases a run keeps and an adjustment submission. `dte-sdk/portal` limit to 56 kB.
- Certification, the exchange and the printed samples (`dte-sdk/portal`): the GWT-RPC codec of the SII's portals
  (`gwtBody`, `gwtAnswer`, `encodeGwtLong`, `decodeGwtLong`) and the discovery of their hashes (`discoverGwtHashes`,
  with the pairs known to work as the fallback and `gwt` as the override); the exchange portal operations
  `downloadExchangeSet`, `validateExchangeUser`, `uploadExchangeAnswers`, `confirmExchange`; the samples portal
  operations `readSamplesReview`, `createSamplesReview`, `uploadSample` (a 5xx retried up to four attempts, 2, 4 and
  6 s apart), `submitSamplesReview`, `readSamplesDetail`; `createExchangeAnswers` and `parseExchangeSet`, the three
  answers to an exchange set (the reception response, the receipts of Ley 19.983 and the commercial approval) signed and
  valid against the official `RespuestaEnvioDTE_v10.xsd` and `EnvioRecibos_v10.xsd`; the steps `runExchange` and
  `uploadPrintedSamples`; `runCertification` now answers the exchange and uploads the samples given by the `samples`
  option (`readPrintedSamples` from `dte-sdk/pdf` reads them from a directory), stopping with `exchange`,
  `printedSamples` or `rejected` in front of what it lacks, and `exchangeSetXml` takes a set downloaded by hand;
  `CertificationState` gains `exchange` and `samples`; progress events `INTERCAMBIO_START`, `INTERCAMBIO_DESCARGADO`,
  `INTERCAMBIO_DONE`, `MUESTRAS_UPLOADING`, `MUESTRAS_DONE`; the portal session takes raw bodies; catalog
  `EXCHANGE_PORTAL`, `SAMPLES_PORTAL`, `EXCHANGE_ANSWER_FILES`; portal rejections `exchangeUploadRefused`,
  `samplesReviewRefused`, `sampleUploadRefused`. `dte-sdk/portal` limit to 64 kB.
- Certification of receipts (`dte-sdk/portal`), as pieces to chain: `parseReceiptsTestSet` (the plain-text set of the
  receipts portal), `issueReceiptsSet` (one receipt of type 39 per case, the `SET` reference, the signed `EnvioBOLETA`),
  `sendReceiptsSet` (the envelope, 20 s, its status, then the folio consumption report with the sequence number 100
  plus the attempt, up to ten attempts) and `resendReceiptsConsumption`; the receipts portal operations
  `downloadReceiptsTestSet`, `declareReceiptsTrackId`, `readReceiptsStatus` (`P90` ready to declare, `P91` declared),
  `declareReceiptsCompliance` (irreversible; the software provider is mandatory; the representative is the owner of
  the session) and `verifyReceiptsAuthorization` (production and certification, never throws). `readProgress` gives
  the receipts row of the progress page. Catalog `RECEIPTS_PORTAL`; portal rejections `receiptsNotEnrolled`,
  `receiptsTrackIdRefused`, `receiptsComplianceRefused`. `dte-sdk/portal` limit to 68 kB.
- `receiptReferences` on `DocumentInput` and `Document`, with `ReceiptReferenceInput`, `ReceiptReference` and
  `SiiReferenciaBoleta`: the reference of a receipt (39, 41) as the receipts schema defines it.

### Changed

- **Four entries.** `dte-sdk` keeps documents, stamps, signatures, envelopes, books and the web services client over
  `fetch`, and reaches no `node:` module, so it bundles for the browser with no configuration. `dte-sdk/node` holds
  `createNodeHttpsTransport`, `createDirectoryCapture`, `createDirectoryUploadArchive` and `createDirectoryFolioRegistry`.
  `dte-sdk/portal` holds the portal, the folio registry, the register, the MIPYME backup and the certification sets.
  `dte-sdk/pdf` holds the printed samples. One `DteError` crosses them. Why and the measurements:
  `docs/decisions/entry-points.md`.
- **ES modules only, on Node ≥ 22.12.** The CommonJS build is gone. `require()` still loads every entry from that version
  on. Jest in its default CommonJS mode needs its ESM mode or `transformIgnorePatterns`.
- **`pdf-lib` and `bwip-js` are optional peers of `dte-sdk/pdf`.** The install drops from 44 MB to 6.6 MB. Whoever prints
  installs them; without them the render functions throw `DEPENDENCY_UNAVAILABLE`.

- **The certification run keeps to field behaviour: the test sets and their declaration.** In what the SII receives and
  in how the run flows, the runner now does what is known to work with the SII. The test set is asked for with the company in the last post (`RUT_EMP`, `DV_EMP`), a fixed
  referer and the progress pages read first when no session is cached; no page on the way is searched for a refusal.
  The documents of the test sets carry the UTC day and UTC stamps with milliseconds, unit prices with six decimals
  (`LineItemInput.unitPriceDecimals` is new; `SiiDetalle.PrcItem` is now `number | string`, a text when the price is
  written with fixed decimals), zero totals without a VAT rate on the notes that correct a text, the unit
  `UN` on the exempt notes, and every case of the guide set is planned as a guide. `declareProgress` reads the form by
  its quoted attributes, posts even when no row has a field, verifies with one post and returns the new
  `DeclarationResult` (`success`, `verified`, `inReview`, `emptyFields`, `contentErrors`, `allRejected`); the outcomes
  are `accepted`, `inReview`, `contentErrors`, `allRejected`, `notSaved`, `inconsistent`, `declined` and `failed`, and
  `DeclarationVerification` replaces `DeclarationRow` and `VerificationState`. The declaration carries today's Chile
  date for every track id. `readProgress` reads each state as the first bold text after its label anywhere on the
  page and `ItemState` gains `objections`; the wait for the sets counts a failed read as an attempt, takes a page that
  shows none of the sets sent as approval and goes on waiting on objections alone. The envelopes of the run are
  uploaded with eight attempts on network failures only and their answers read anew (`STATUS` 99 is a
  failed send; `SII_UPLOAD_REJECTED` carries `trackIdElement`). `DEFAULT_PORTAL_TIMEOUT_MS` is 20 s, for every portal
  operation that sets no `timeoutMs` of its own, not only the certification ones.
  `CertificationDependencies.receiver` and `.resolution` are optional and the issuer may leave out its activity, its
  activity code, its commune and its city (`DEFAULT_CERTIFICATION_RECEIVER`, `DEFAULT_CERTIFICATION_ISSUER`,
  `CertificationIssuerInput`). `StampOptions.stampedAt`, the `signedAt` option of `signDocument` and
  `IssueDocumentInput.timestamp` let a caller set the stamps. `dte-sdk/portal` limit to 70 kB.

### Fixed

- A receipt (39, 41) with a reference was written with the invoice shape of `Referencia` (`FchRef`), which the receipts
  schema does not allow. Receipts now take `receiptReferences`, and `references` on a receipt is refused with
  `INVALID_OPTION`, as is `receiptReferences` on any other type. The official `EnvioBOLETA_v11.xsd` is in the test
  fixtures and the receipts envelope validates against it.
- ES module consumers on `moduleResolution: nodenext` get the real types. The declarations lacked extensions in their
  relative imports, which was 165 errors, or every type silently `any` under `skipLibCheck`.

### Removed

- The placeholder `hello()` export.

## [0.0.2] - 2026-10-26

### Changed

- No public API or runtime changes. First release published from CI through
  npm Trusted Publishing (GitHub OIDC) with a provenance attestation;
  `0.0.1` was published manually to create the package on npm.

## [0.0.1] - 2026-10-26

### Added

- Initial placeholder release: project scaffolding (dual ESM + CJS build,
  Jest, ESLint, Prettier, size-limit, Stryker, CI and tag-triggered publish)
  and a single `hello()` export that returns `'dte-sdk is coming'`.

[Unreleased]: https://github.com/arrowsw/dte-sdk/compare/v0.0.2...HEAD
[0.0.2]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.0.2
[0.0.1]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.0.1
