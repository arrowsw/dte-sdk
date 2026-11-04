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
- Dependencies: `node-forge`, `@xmldom/xmldom`, `fast-xml-parser`, `rut.ts`, `pdf-lib`, `bwip-js`.
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
  adapter `writePrintedSamples`/`findEnvelopeFiles` (`SET-PRUEBAS` and `SET-SIMULACION` on disk). Dependencies `pdf-lib`
  and `bwip-js`, loaded on first use. Error codes `DEPENDENCY_UNAVAILABLE` and `PDF_RENDER_FAILED`, and `errorCode`.
  A folio that is not a run of digits is an `INVALID_FOLIO` failure of its document and never names a file, and the
  Node adapter refuses a sample path outside the folder of its set.
- Certification, the deterministic half: `parseTestSetText` (the SII test-set text to typed sets and cases),
  `planCertificationSets`, `createFolioAllocator` (a `FolioSource` over one or several CAFs), `issueTestSet` (the
  basic, exempt, guide and purchase sets through phase 1, with the `SET` reference and the field rules), `issueSimulation`
  (every case again in one envelope) and `createCertificationSalesBook`, `createCertificationPurchaseBook`,
  `createCertificationGuideBook` through phase 3. Catalog `TEST_SET_KINDS`, `TEST_SET_PORTAL_NAMES`,
  `TEST_SET_REFERENCE_TYPE`, `TEST_SET_ENVELOPE_ID`, `CERTIFICATION_COUNTERPARTY`. `DocumentInput.withholdVat` withholds
  the VAT on the notes of a purchase invoice. Bundle limit to 64 kB.

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
