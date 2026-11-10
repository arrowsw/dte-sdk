# Changelog

All notable changes to **dte-sdk** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **`requestCafInBatches` says why a later trip was refused.** Any refusal of the second trip or a later one, but
  `stampingUncertain`, came back as `quotaCapReached`, so a range the SII authorized without handing its CAF over
  (`rangeAlreadyAuthorized`) read as the quota running out, and so did a refusal of the company, the option or the
  person. A refusal now comes back with its own kind and `portalMessage`, as on the first trip. Only one folio over the
  maximum (`quotaExceeded`), after a grant, still reads as `quotaCapReached`: the SII has no more to give in that pass.
  - **What to change:** a caller that read `quotaCapReached` as "stop asking" for every short batch now meets the
    other kinds after a grant too; `rangeAlreadyAuthorized` means the range can be downloaded again with
    `listReobtainableRanges` and `reobtainCaf`.
  - **The certification's `prepareFolios`** follows from it: a later refusal that is not rationing (the company, the
    option) no longer leads it to annul folios, and a block on the person is first lifted by re-obtaining, as on the
    first trip.

### Fixed

- **The "flow stopped" warning no longer logs what a page said.** Since 0.6.0 a folio flow that keeps what it holds
  logs the error that stopped it, as `sii portal flow stopped, keeping what it holds`, with every detail spread and
  redacted. Redaction hides keys and tokens, but a page's text (`portalMessage`, `body`) and the `url` it came from can
  name the company and its RUT, and they reached the log. The warning now leaves those three out; the rest of the
  details, the step's `operation`, `flow`, `code` and `stoppedAt` are logged as before. The thrown errors keep them.
- **`annulFolios` reports a range answered folio by folio in as few pieces as its answers allow, and leaves alone a
  range `knownAnnulled` covers in pieces.** When the SII refused a whole range and the walk went folio by folio, each
  folio came back as its own entry and its own key, even when every folio got the same answer, as a step retried after
  its answer was lost does ("ya fue anulado" for each folio the first try annulled). Folios next to each other with the
  same answer are now one entry and one key in `annulled`, `rejected` and `knownAnnulled`. A listed range is skipped
  when the keys of `knownAnnulled` cover all its folios, in one key or several, where only its exact key was.
  - **What to change:** nothing for a caller that reads keys as spans of folios; one that compared them with the
    listing's ranges one to one reads them as spans now.
- **A cached session is checked on the client's own environment.** `openPortalSession`, and the check of a saved
  session before the GWT portals and the receipts' certification, read the company page `ad_empresa1` of the
  certification host whatever the client's environment, so a production client depended on maullin being up. They now
  read the page of the client's environment; one session still serves both.
- **`reobtainCaf` logs in on demand.** It posted the range with whatever session it found in the cache, so a session
  that had expired since `listReobtainableRanges` got the login page back, which read as the SII refusing the download
  (`SII_PORTAL_REJECTED` with `reobtainDownloadMissing`). It now enters the procedure first, as
  `listReobtainableRanges` does, logging in on demand and passing the representation screen, and a login page in
  answer to the range or to the file is `SII_PORTAL_SESSION_EXPIRED`, in `reobtainFolios` too. A page that states a
  refusal at the entry throws `SII_PORTAL_REJECTED`, and any other page `SII_PORTAL_UNEXPECTED_PAGE`, before anything
  is posted.
  - **What to change:** `reobtainCaf` makes one `GET` more, of `rf_reobtencion1_folios`. A caller that took
    `reobtainDownloadMissing` or `reobtainCafMissing` for an expired session now gets `SII_PORTAL_SESSION_EXPIRED`;
    `reobtainFolios` ends its walk on it, with the CAFs already in hand and `failure`, or throws it with none, where it
    used to skip the range as refused.

## [0.6.0] - 2026-11-10

### Changed

- **`annulFolios` returns what the SII already annulled when a later step fails.** The tally of a call lived only until
  the end of the walk, so a later pass's listing or a later range that failed with anything the step retries could not
  absorb (an expired session, a block, the caller's abort, a page it could not read, a refused listing) threw it away:
  folios already annulled, which cannot be undone, never reached `annulled` or `knownAnnulled`, and the next run posted
  their annulment again only to hear "ya fue anulado". Once the SII has answered for some folios (a range that never got
  through, recorded as `transport`, is no answer), such a `DteError` now ends the walk with what was done until then and
  the new field `failure: { code, operation }`, where `operation` is `listFolioRanges` or `annulFolios`. Only the code
  is kept, with the kind of refusal in `rejection` when the SII refused a later listing; the original error goes whole
  to the client's logger. Before any answer it still throws, and anything that is not a `DteError` still throws as a
  bug. `failure` is null on a walk that finishes.
  - **What to change:** `AnnulmentResult` gains `failure` as a required field. Persist `knownAnnulled` whether `failure`
    is set or not; a literal built by hand, as in a test double, needs `failure: null`. `FolioFlowFailure['operation']`
    now names every step a folio flow can stop at: `queryFolioQuota`, `requestCaf`, `reobtainCaf`, `listFolioRanges`
    and `annulFolios`. `FolioFlowFailure` gains an optional `rejection`, set only when `code` is
    `SII_PORTAL_REJECTED`.
  - **The certification's `prepareFolios`** keeps what such an annulment annulled in `annulledRanges` and then ends the
    step with the failure's code, with `type`, `operation: 'annulFolios'`, `step` and, for a refusal, `rejection`, as
    a cut-short request or re-obtaining does. It used to count it as none and end with `FOLIO_OUT_OF_RANGE`, which
    read a network failure as rationing. An annulment that throws before the SII answers still counts as none.
- **`reobtainFolios` returns the CAFs it already downloaded when a later download fails.** A download that failed
  with anything but a refusal threw out of the walk and the CAFs earlier downloads had brought were lost; nothing was
  spent, but they had to be downloaded again. Once a CAF is in hand such a `DteError` now ends the walk with
  `complete: false`, the CAFs, their ranges, the failure's message in `reason` and the new field
  `failure: { code, operation: 'reobtainCaf' }`. With no CAF in hand it still throws, and anything that is not a
  `DteError` still throws as a bug. A refused download is logged and skipped, as before.
  - **What to change:** `ReobtainResult` gains `failure` as a required field, null everywhere else; a literal built by
    hand needs `failure: null`.
  - **The certification's `prepareFolios`** keeps what such a walk brought by the rule it already applies to a short
    one, and then throws the failure's code with `type`, `operation: 'reobtainFolios'` and `step`, as it threw that
    code before.
- **`requestCafExact` keeps the memory of what it annulled when a later step fails.** With `allowAnnul`, a
  `DteError` that cut the annulment short, or one of the request asked once more after it, threw out of the flow and
  `knownAnnulled` was lost with the folios just annulled. Once the SII has answered the annulment, such a failure now
  ends the flow with `complete: false`, `rejection: null`, the first request's quota, `knownAnnulled` with what was
  annulled, and `failure`: the annulment's (`listFolioRanges` or `annulFolios`) or the request's (`requestCaf`). A
  listing the SII refuses during the annulment keeps its kind in `failure.rejection`, since `rejection` speaks of the
  request. A cut-short annulment is not followed by another request. Before the annulment's first answer it still throws, and
  anything that is not a `DteError` still throws as a bug.
  - **What to change:** `failure` was always null on `requestCafExact`; read it as on `requestCafInBatches`, and
    persist `knownAnnulled` whether it is set or not. The type does not change.
- **Size:** these changes and the logging below took `dte-sdk/portal` from 73.95 kB to 74.33 kB, over its 74 kB limit,
  which went to 76 kB.

### Fixed

- **A folio flow cut short logs the error it keeps only the code of.** Since 0.5.0 a batch cut short returns
  `failure: { code, operation }`, and the certification's `prepareFolios` rebuilt the error from that code alone, so the
  original's `reason` (`ECONNRESET`, a timeout), `httpStatus`, `attempts` and the rest reached neither the thrown error
  nor the `CERT_ERROR` event. Every flow that turns a failure into data (`requestCafInBatches`, `requestCafExact`,
  `reobtainFolios`, `annulFolios`) now logs the original first through the client's logger, as a warning
  `sii portal flow stopped, keeping what it holds` with the error's details (their `operation` names the step that
  failed), `flow` with the flow's name, its `code` and `stoppedAt`. Every text detail goes through `redactText` first,
  so a token, an `RSASK` or a session cookie reaches the log as `[redacted]`.
- **`portalMessage` no longer carries a secret a page showed.** The portal's message was the visible text of the page,
  read without redaction everywhere but on a block page, while `body` beside it was redacted: an `RSASK` or a token in
  a page's text reached the error's `portalMessage`, and from this release the log, as written. The page is now
  redacted before its text is read, on every error and result that carries `portalMessage`; redacting the text
  afterwards would miss an `RSASK`, whose tags the text no longer has.

## [0.5.0] - 2026-11-09

### Changed

- **`requestCafInBatches` returns the CAFs it already holds when a later trip fails, in a result callers have not seen
  before.** `FolioFlowResult` returned refusals as data so that CAFs already obtained reach the caller, but anything
  else on the second trip or a later one (a transport failure, a timeout, an expired session, a block, `CAF_INVALID`,
  the caller's abort) threw out of the flow, and the CAFs earlier trips had brought, each a range the SII had granted
  and its private key, were lost: only `listReobtainableRanges` and `reobtainCaf` could find them again. Once a CAF is
  in hand such a `DteError` now ends the flow with `complete: false`, the CAFs, `granted` so far, the last quota seen,
  `rejection: null` and the new field `failure: { code, operation }`, where `operation` is `queryFolioQuota` or
  `requestCaf`; a failed `requestCaf` may have been granted all the same, and `listReobtainableRanges` says whether it
  was. Only the code is kept, since the error's details may carry what a page said. With no CAF in hand it still
  throws, the caller's abort included, as `reobtainFolios` does, and anything that is not a `DteError` still throws as
  a bug. `failure` is null everywhere else, `requestCafExact` included: it holds no CAF when it asks a second time.
  `FolioFlowFailure` is exported from `dte-sdk/portal`.
  - **What to change:** until now a result with `complete: false` always carried a `rejection`. A caller that explains
    a short result by `rejection` alone must also read `failure`, or it records a batch cut short as a smaller grant.
    `FolioFlowResult` and `RequestCafExactResult` gain `failure` as a required field, so a literal built by hand, as in
    a test double, needs `failure: null`.
  - **`quantity` is checked before anything goes out.** It must be a whole number of at least 1, or the call throws
    `INVALID_OPTION` with `field: 'quantity'`. Before, `0` or less came back complete with no CAF, and a fraction was met
    only by a later trip, where it would now read as a `failure` with CAFs in hand.
  - **The certification's `prepareFolios`** keeps those CAFs in the state and then throws the failure's code, with
    `type`, `operation` and `step`, the code it threw before this change, instead of `FOLIO_OUT_OF_RANGE`.
  - **Size:** `dte-sdk/portal` went from 73.88 kB to 73.95 kB, under its 74 kB limit.

### Fixed

- **`createDirectoryFolioRegistry` writes its ledger for the owner only.** It created `dir` and `folios.json` with the
  default modes, so with the usual umask other users of the machine could read the companies' RUTs, their track ids and
  what callers keep in `extra`, and it saved through a temp file of fixed name, `folios.json.tmp`, opened without
  `O_EXCL`, so whatever sat at that name, a symlink included, was written through. It now saves as
  `createDirectoryTokenCache` does: `dir` is created for the owner only (0700), while one that exists keeps its
  permissions, and each save writes a temp file of its own, created exclusively and readable by the owner only (0600),
  renames it over `folios.json` and removes it when the write or the rename fails. A `folios.json` written before
  becomes owner-only on its next save. On Windows, where files have no such mode, the permissions of `dir` decide.
  `dte-sdk/node` went from 6.39 kB to 6.41 kB; the other entries did not change.

## [0.4.0] - 2026-11-09

### Added

- **The verification of received documents.** `verifyReceivedDocuments(xml, { environment?, siiKeys? })` takes a `DTE`,
  `EnvioDTE` or `EnvioBOLETA` as a supplier sent it and checks the envelope's own signature and, for each document: its
  XMLDSig signature; its TED, whose `FRMT` must verify with the key of the CAF the TED carries and whose `DD` must agree
  with the header (issuer, type, folio, date, receiver and total); that CAF against the document (issuer, type, folio
  inside the range); and the SII's signature over the CAF (`FRMA`) with the SII key of its `IDK`, accepting only the key
  of `environment` (production by default): a certification CAF is `invalid` in production, with the mismatch
  `environment`. Each check is data, and each document and the whole input get a `status` of `valid`, `invalid` or
  `unchecked`, the last for a CAF whose `IDK` has no known key. A document signed before it went into the envelope, with
  other namespaces in scope, is checked where it sits and, failing that, on its own, and each document is read from its
  element in the parsed input, never from a cut of the text, so what is checked is the element the envelope's signature
  covers and what is reported; `xml` is that element written out, which reads back and verifies the same but is not the
  input byte for byte, so an archive keeps the input's own bytes. The stamp is read from its elements alone: the `DD`
  and the `DA` are written from the elements whose fields are compared, flattened, with their texts escaped the SII's
  way or with only `&`, `<` and `>` escaped, and a stamp is read only when its structure leaves no doubt (one plain
  `TED` holding a `DD` and then an `FRMT`, one `CAF` with one `DA` and one `FRMA` in the `DD`); anything else is a
  failed check. Malformed input throws `XML_PARSE_FAILED` or `ENVELOPE_EMPTY`, and so do a DOCTYPE, a prefixed `DTE` or
  `Documento`, and an envelope with other than one `SetDTE`. Not checked: whose certificate signed, and whether the CAF
  had expired.
- **The SII's CAF keys.** `SII_CAF_KEYS` gives the 512-bit keys 100 (certification) and 300 (production) with which the
  SII signs every CAF, from the SII's certificates as CryptoSys and LibreDTE publish them, the same bytes in both, and
  `verifyCafSignature(cafXml, { environment?, siiKeys? })` checks the `FRMA` of one CAF, by the same rule for the
  environment. It reads no DOCTYPE, as `verifyReceivedDocuments` reads none, and throws `CAF_INVALID` for one. The tests
  sign test CAFs with a test SII key pair (`npm run fixtures:sii`); the two keys met real CAFs only in a check by hand,
  outside the tests: the CAF of the example the SII publishes for key 100, production CAFs of real documents for key 300.
- **The claim registry's document types at runtime.** `CLAIM_DOCUMENT_TYPES` (33, 34 and 43) and the guard
  `isClaimDocumentType` come from `dte-sdk`, so documents can be filtered by them; `ClaimDocumentType` is derived from
  the list and stays exported.
- `dte-sdk` went from 31.54 kB to 33.87 kB, over its 32 kB limit, which went to 34 kB, and `dte-sdk/portal` from 73.82 kB
  to 73.88 kB.

### Fixed

- **`verifyEnveloped` checks only the signature it computes.** It took the first `Reference` and the first `DigestValue`
  of `SignedInfo` and did not read the algorithms. A `SignedInfo` with more than one `Reference`, a `DigestValue`
  outside the one `Reference`, a digest other than SHA-1 or a transform other than enveloped-signature or C14N 1.0 now
  fails `digestValid`, with `referenceId` null when there is more than one `Reference`; a canonicalization other than
  C14N 1.0 or a signature method other than RSA-SHA1 fails `signatureValid`, so a signature declaring exclusive C14N no
  longer verifies. `verifyDocumentSignature`, `verifyEnvelopeSignature` and the books' `verify*Signature` share it; the
  signatures dte-sdk makes pass as before.
- **`parseCaf` keeps only the CAF it reads.** It cut the `<CAF>` block every TED carries from the text with a pattern,
  while its fields came from the parsed file, which reads no markup inside comments, instructions, CDATA or attribute
  values, so a copy of a CAF written in one of them before the real one became the block kept, unlike the CAF
  `verifyCafSignature` checks. The text must now hold one `<CAF` and one `</CAF`, and a DOCTYPE is refused; both throw `CAF_INVALID`. A CAF
  as the SII issues it reads as before.

## [0.3.0] - 2026-11-08

### Added

- **The activity verification, unstable.** `unstable_fetchActivityVerification(portal, { companyRut? })` in
  `dte-sdk/portal` reads the SII's "Consulta estado de verificación y acreditación", the verification the SII requires
  before a company issues documents with VAT. It gives the company's `requests` (number, kind, reason, preliminary and
  final result, status code and description, request date and accreditation deadline as `YYYY-MM-DD`, procedure status
  and whether a certificate exists) and the SII's `messages`, each saying whether it blocks. Officials, comments and the
  address never come out, and there is no `raw`. The SII's own page shows whoever logged in; this sends the company's
  RUT, and a request of another RUT throws `SII_PORTAL_UNEXPECTED_PAGE` with `step: 'otherTaxpayer'`. An SII error code
  throws the new rejection `activityVerificationRefused`. It is unstable because it was read once against the real SII,
  on 2026-11-08, for a pending verification: its shape may change in any release, a patch included, and it becomes
  `fetchActivityVerification` once an approved verification has been read.
- **The documents that accredit an activity.** `listAccreditationDocuments(portal)` gives the SII's catalog from the
  same app: `category` (`general` or `specific`), `code` and `description`, with codes that repeat across categories.
- Both read production whatever the client's environment, because the app exists only there. `dte-sdk/portal` went
  from 72.99 kB to 73.82 kB, under its 74 kB limit.

## [0.2.0] - 2026-11-08

### Added

- **A catalog of the register's document codes and the statuses of each operation.** `REGISTER_DOCUMENT_CODES` lists the
  49 codes of the purchase and sales register in `dte-sdk/portal`, and `registerDocumentCode(code)` finds one or gives
  `undefined`. Each entry has the SII label, the sides where it appears (`operations`), whether it is a DTE
  (`electronic`), whether it reaches the register (`inRegister`, false for dispatch guides 50 and 52), its `sign` in the
  totals (-1 for credit notes and decreases), whether the register lists it document by document (`perDocument`) and
  whether the buyer withholds the VAT (`buyerWithholdsVat`: 29, 45 and 46). Guides outside the register, the sign and
  the 906 summary-only flag are inferred where the SII does not state them, and the JSDoc says so.
  `REGISTER_ACCOUNTING_STATUSES` gives the statuses each side can hold: all four for purchases, only `registered` for
  sales. Nothing that exists changed. `dte-sdk/portal` went from 72.28 kB to 72.99 kB, under its 74 kB limit.

## [0.1.0] - 2026-11-07

### Added

- **The receiver's answer with the eight-day rule.** `receiverAnswer(events, receivedAt, today)` is a pure helper over
  the events of `listClaimEvents`, the `receivedAt` of `queryReceptionDate` (or null) and today in Chile. It gives the
  answer, `annulled` (`NCA`), `claimed` (`RCD`, `RFP`, `RFT`), `accepted` (`ACD`), `tacitlyAccepted` (past the eight
  calendar days of Ley 19.983 with none of those), `goodsReceived` (`ERM`) or `pending`, in that order of precedence,
  and `claimDeadline`, the reception day plus eight. `PAG` ("DTE Pagado al Contado", which the SII registers itself) is
  in `CLAIM_EVENT_CODES`; it and `ENC` change nothing. `receiverStatus` is unchanged.
- **The public registry of authorized issuers.** `queryAuthorizedIssuer(sii, { rut })` asks `ee_empresa_rut` on
  maullin or palena, with no certificate and no session, and returns the business name, the resolution of the
  environment (`resolutionNumber`, `resolutionDate`: the `NroResol` and `FchResol` of the cover, number 0 in
  certification), the regional office and each document type with the days it was authorized and deauthorized. A RUT
  that is not an issuer throws `SII_PORTAL_REJECTED` with `rejection: 'companyNotAuthorized'`; labels that moved leave
  their fields null, and a page with neither a name nor document types throws `SII_PORTAL_UNEXPECTED_PAGE`. It is in
  the root entry, which fits it under its 32 kB limit.
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
  them), token cache (`createMemoryTokenCache`, and `createDirectoryTokenCache` from
  `dte-sdk/node`: tokens and portal sessions on disk, one owner-only file per key that also
  holds the key, read only when it is a regular file of the same user and without blocking,
  shared by that user's processes, never throwing), retry policy with backoff, HTTP capture with
  redaction (`createMemoryCapture`, `createDirectoryCapture`) and upload archive
  (`createMemoryUploadArchive`, `createDirectoryUploadArchive`; a duplicate answer is kept
  as `<trackId>-<kind>-duplicate-<timestamp>` and archived replies and SOAP fault reasons have
  tokens redacted). SOAP calls send an empty `SOAPAction`. The Node adapters load
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
- CAF files on disk (`dte-sdk/node`): `findCafFiles` lists the usable CAF files of a type and company below a directory
  (five folder levels deep), newest first by modification time: `.xml` files that parse as a CAF of that `TD`, whose
  `RE` is the company (read from the file, never from its folder) and that have not expired; unreadable folders and
  files are skipped. `findLatestCafFile` gives the first, and `resolveCafFile` the newest with `required` free folios in
  a `FolioRegistry` (or in its whole range without one), with its registry `scope`, or null. Types `CafFile`,
  `FindCafFilesOptions`, `ResolveCafFileOptions`, `ResolvedCafFile`. `dte-sdk/node` limit to 8 kB.
- The SII office of each commune (`dte-sdk/pdf`): `SII_OFFICES` (355 commune names in 40 offices) and
  `siiOfficeForCommune`, which ignores case, surrounding spaces and accents. `renderPrintedSample` and the batch
  functions print the office of the issuer's commune when `siiOffice` is not given, and `S.I.I. - SANTIAGO CENTRO` only
  for a commune the table lacks. `dte-sdk/pdf` limit to 11 kB.

### Changed

- **Four entries.** `dte-sdk` keeps documents, stamps, signatures, envelopes, books and the web services client over
  `fetch`, and reaches no `node:` module, so it bundles for the browser with no configuration. `dte-sdk/node` holds
  `createNodeHttpsTransport`, `createDirectoryCapture`, `createDirectoryUploadArchive`, `createDirectoryTokenCache`,
  `createDirectoryFolioRegistry` and the search for CAF files on disk.
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

- **The certification run keeps to field behaviour: the books, the advance, the simulation and the closing.** `runBooks`
  starts over on every run: the period is the UTC month the test set was read in (`CertificationState.setReadDate` is
  new) when the set brought a purchase book, else the current UTC month, and the approved books are what the portal
  shows, by the name each row holds. The uploads follow the retries and the reading of the run; a purchase book goes
  again as an adjustment only on a duplicate without a track id or a schema rule on the first error line. The SOAP
  status is read for a minute with a count of failures per book; every book with a track id is declared with the sets;
  while every row comes back empty all the books go again; the books the SOAP status rejected or the declaration named
  with content errors are not awaited; after the wait the books the page shows rejected, closed or declared and never
  reviewed go again under their exact name; no portal read stops the phase. `BooksOutcome` keeps its values, but only
  `incomplete` stops the runner, and `BOOKS_DONE.success` means the three mandatory books were sent.
  `queryCertificationSets` returns no sets for a page without rows instead of throwing. `advanceToNextStage` reads the
  progress page (30 tries 10 s apart while it cannot be read), asks for the advance at once, reads the page again and
  returns `advanced`, `unchanged`, `failed` or `timedOut` without throwing for a portal answer; the runner stops with
  the portal's sentence when the portal does not move. The three certification books accept `submission:
'adjustment'` (the guide book too), the withheld VAT rate of `OtrosImp` is written 0.19, the common-use credit is
  rounded per document (`BookTotals.commonUseCredit` is new), the summaries carry no `TpoImp`, and the exempt purchase
  book and the purchase-book sets are read anew. The simulation carries the local date of the process, UTC stamps to
  the second, its own totals (0 with no VAT rate when the lines add up to nothing) and a guide without `TpoDespacho`; it is declared
  unless the progress page names the exchange, and awaited with reads that never throw, `REPARO` as a rejection and
  one SOAP query when the polls run out. `advanceStage` and `declareCompliance` follow the client's retry policy;
  the compliance wizard posts every named input of the page and counts the declaration as made when the last page no
  longer shows its form; `declareComplianceFinal` asks for the advance once, without reading the progress, and declares
  whatever came of it. Found while checking each of these, and fixed: a separator line
  no longer ends the purchase-book set for exempt taxpayers; a document flagged as common use with no VAT stays out of
  `TotOpIVAUsoComun`; a receiver's business activity is cut at 40 characters instead of refused, so an issuer with a
  longer one can be the receiver of its purchase documents, internal transfers and simulation; the books are declared
  sales first, which is the order a diagnosis asks the status service in; after the first wait every failed row of the
  page keeps the search going and is awaited in the order of the page, also one of a book the run does not send; the
  first post of the declaration of compliance names `pe_avance7` as its referer and its pages are read with fixed
  patterns; and a progress page that cannot be read before the simulation is declared no longer ends
  the run.

- **The certification run keeps to field behaviour: folios and web services.** Most of this reaches every caller,
  not only the run. SOAP calls send an empty `SOAPAction` and escape their parameters with `&`, `<` and `>` only
  (`escapeXmlMarkup` is internal); the REST status queries send the upload `User-Agent`; `folioReceived` asks as the
  company and reads the answer from the code and the state gloss alone (`FAU` or "no recibido" is free, any other
  "recibido" is used, the rest is undetermined), and `queryDocumentStatus` takes `consultantRut`. An authorised range
  is recovered with the UTC date, and "company not authorised" is only the wording `empresa no está autorizada para
  operar`. The reobtention sends referers without a host, picks its forms by their exact opening tag, reads only
  inputs with a quoted name and value, does no session handling on the way in and looks for no refusal: an expired
  session or a refusal page is an empty list, and in `reobtainFolios` a listing that fails for any reason is no ranges
  (`ReobtainResult` loses `rejection`). `annulFolios` applies `maxRanges` to each pass, not to the call (up to four
  passes: up to 200 ranges by default, 80 in `requestCafExact`), and tries each step up to three times whatever the
  error. `FolioRegistry.reserve` takes `{ lowestFree: true }` (`ReserveOptions`): the lowest folio of the range that
  is neither used nor annulled, instead of the next one after the last reserved, which stays the default. In the run,
  folios are taken with that option, because the run marks used the folios the SII did not show free;
  `prepareFolios` asks the SII for the folios it is about to use (30 queries per CAF at the most) and marks the
  received ones used, reads a maximum it cannot read as no cap, obtains again with the whole need (the ranges kept
  take the place of the CAFs in hand; ranges only listed cover nothing), never asks for a blocked type, asks in as
  many batches as folios are missing, reads the maximum again after annulling, never annuls a range it downloaded,
  keeps a range obtained again only through the folios the SII showed free, saves every CAF as it is obtained, and
  remembers the annulled ranges in the new `CertificationState.annulledRanges`. `dte-sdk/portal` limit to 72 kB.

- **The certification run keeps to field behaviour: the exchange and the printed samples.** None of this changes a
  default outside the two portals: the shared pieces it needs are options that only their stages turn on. The exchange
  portal is called with the known pair of hashes, without the discovery request, and its user validation writes the
  fixed table of strings. Each portal is entered once per stage of work: one warm-up for the download of the set, one
  for the validation, the uploads and the confirmation, one for the whole of the samples; the saved session is checked
  once per stage, the cookies of a warm-up stay in its stage, and when the warm-up of the samples gets no answer the
  known hashes stand. The calls of both portals are sent once, with no time-out of their own, a fixed set of
  headers and their answers read as UTF-8 (`withExchangeStage`, `withSamplesStage` and `GwtStage` are new; the
  operations take `stage`). Inside a stage every answer goes back to its call whatever its status, with no look for
  the firewall's page: a 502, 503 or 504 on the user validation or on the set validation no longer stops the exchange,
  and a warm-up that answers an error is a warm-up all the same. Any failure of the set download is `setUnavailable`,
  the page that came back kept when the store takes it (a downloaded set the store cannot keep is an error of the
  run); the download uses its own multipart limit. The exchange set is read loosely (no well-formedness check, tags by
  their full name, numbers as the parser reads them, unreadable ones 0, missing dates and RUTs empty, only the
  known document shapes) and the contact of the answers travels as given. A sample keeps its file name
  as given, written as UTF-8 in the part header (`buildMultipartParts` takes `utf8Headers`, off by default); after the
  review is submitted its state is read again whatever the status of the answer (`readSamplesReview` takes
  `anyStatus`, off by default), and a re-read that gets no answer leaves the stage as submitted.

- **The certification run keeps to field behaviour: the receipts.** `parseReceiptsTestSet` reads the set by position
  (tabs or two or more spaces, the header and `OBSERVACION` in exact case, a price without its dots and first comma,
  the unit as the last word after " en "). The receipts carry the UTC day and each is stamped and signed with the UTC
  instant to the second (only the envelope keeps the time of Chile); `issueReceiptsSet` takes an issuer without
  activity, activity code, commune or city and a missing or partial resolution, with the defaults of the document
  runner. `sendReceiptsSet` and `resendReceiptsConsumption` upload through the reading and the retries of the run
  (`envelopeTrackId` is `string | null`: null for a duplicate the SII names no track id for), ask each status once,
  take a query that never got through as accepted and an unanswered or unknown state as a rejection, name the report
  `RCOF_<rut>_<clock>` and report a rejection with the SII's own gloss. Every request to the receipts portal and to
  the production authorisation check carries only a fixed set of headers, is sent once, waits 30 s (20 s in
  production) and is read as UTF-8 whatever its status, the firewall's page included; the operations take
  `sessionChecked`. The representative comes from the session's cookies (the list is read again as the fallback, the
  check digit falls back to `8`); the states `P90` and `P91` are searched in the raw answer; the posts of the track id
  and of the declaration are judged by `//OK` alone; the declaration is dated with the local date and writes the
  provider's name and mail and the business name as given; the track id is declared as given.
  `verifyReceiptsAuthorization` reads the progress page with one request and fixed wordings, and posts the
  stamping form with the company as the caller wrote it. Also here: `advanceStage` and `declareCompliance` no longer
  search their pages for a refusal.

### Fixed

- **Every official commune has its SII office.** `SII_OFFICES` covered 306 names in 37 offices, and 49 of the 346
  official communes had none, so a printed sample of an issuer in Talcahuano, Chimbarongo or San Vicente got the
  default legend. They are now placed by the jurisdiction of the SII unit that serves each: under the office the table
  gives to the commune where that unit sits, or under a new office named after it (`S.I.I. - TALCAHUANO`,
  `S.I.I. - PANGUIPULLI`, `S.I.I. - CHAITÉN`); the official spellings of names it had (Llay-Llay, Treguaco, Mostazal,
  Saavedra) go with them, and Quemchi, which two units serve, goes with the one that serves fewer communes. No existing
  name changed office: 355 names in 40 offices.
- **The proportionality factor of the register reads with a decimal comma.** `dcvFctProp` reportedly comes as a text
  with spaces and a decimal comma (`" 1,0000"`, `"0,8532"`), which `fetchRegisterSummary` read as no factor. It now
  reads that form too; a value outside 0 to 1 is not a factor, so it is null and stays in `raw`.
- **A certificate not valid yet is refused.** `loadCertificateFromPem` and `loadCertificateFromPkcs12` checked only
  `notAfter`; a certificate whose `notBefore` is still ahead, by the same `now` option, now throws the new
  `CERT_NOT_YET_VALID` with `details.validFrom`. `allowExpired` lets either case load.
- **Portal pages that declare UTF-8 only in a `<meta>` are read as UTF-8.** The login pages of herculesr say
  `charset=UTF-8` in the page and not in the header, and a page without a charset in its header was always decoded as
  Latin-1, so what they said reached `details.portalMessage` garbled ("AutenticaciÃ³n"). With no charset in the header,
  the first 1024 bytes are now read for a `<meta>` that declares UTF-8; a charset in the header still decides.
- **A CAF authorized at the end of a month expires on the last day of the sixth month.** `cafExpiresAt` let the day run
  over into the next month: a CAF authorized on 2026-08-31 expired on 2027-03-03 instead of 2027-02-28, so it could
  stamp documents the SII rejects with `CAF-3-517`. The day is now kept within the month (2027-08-31 gives
  2028-02-29), still at midnight continental Chile; `isCafExpired` and `findCafFiles` follow.
- **The reobtention is entered like the other procedures.** `listReobtainableRanges` asked for the procedure with a
  plain request, so with a session that had expired it got the login page and returned an empty list and no error, as
  it did in the certification environment. It now goes through the login on demand and the representation screen, and
  only a listing gives a list (empty when it has no ranges): a stated refusal throws `SII_PORTAL_REJECTED`, a login
  page `SII_PORTAL_SESSION_EXPIRED` and any other page `SII_PORTAL_UNEXPECTED_PAGE`. `reobtainFolios` still does not
  throw for a failed listing: it reads as no ranges, with the failure in `reason`.
- **Stamping reads the quota form of the type, and never sends a request twice.** The page of the company, with only
  `-1 NINGUNO` chosen, also posts to `of_confirma_folio`, so `queryFolioQuota` could report a type as unrationed and
  `requestCaf` could skip choosing the type. A page is now the quota form only when the type asked for is the option its
  selector has chosen; otherwise the type is chosen first, and a last page that is not that form (a login page, an
  unknown page) throws `SII_PORTAL_SESSION_EXPIRED` or `SII_PORTAL_UNEXPECTED_PAGE`. The request form itself posts to
  `of_confirma_folio` with `FOLIO_INICIAL` 0 too: when the SII shows it again after a request, its button ("Solicitar
  Numeración", not "Confirmar Folio Inicial") tells it apart, nothing is sent a second time, and the new rejection
  `stampingUncertain` says to check the reobtainable ranges before asking again; a refusal the page states is that
  refusal. `requestCafInBatches` reports `stampingUncertain` as such instead of as `quotaCapReached`. "No está autorizado
  para solicitar timbraje" reads as `userWithoutPermission`. The `dte-sdk/portal` size limit goes from 72 kB to 74 kB.
- **An annulment answer is read only by its own words.** Every page of the annulment says it is for folios "que no han
  sido recepcionados por el SII", and the listings say "ningún folio haya sido recepcionado": those sentences are
  taken out before an answer is read. Before, any answer `annulFolios` did not know read as a conflict and then as
  `received`, which is final, so the folios went into `knownAnnulled` and were never tried again. An answer now counts
  only by a concrete sentence ("ha autorizado la anulación" or the heading `SOLICITUD ANULACION DE FOLIOS`, received,
  annulled before, error 500), and anything else is `unknown`, which is not final and never enters `knownAnnulled`.
  The `refused` reason is gone: it came from loose words that matched every page. A single folio whose answer is a
  conflict keeps that answer instead of being sent again, and a range `af_anular3` reports as annulled before is
  `alreadyAnnulled` only for the folios that page lists ("Folio Inicial Anulado", "Folio Final Anulado"), the rest of
  it `unknown`.
- **The test set is read in the case field behaviour reads it.** `EXENTO` in the name of an invoice item, `ANULA` in the
  reason of a basic-set note and `MODIFICA MONTO` in a reason count in capitals only, and so do the words that keep a
  row of a case from being an item (`DOCUMENTO`, `REFERENCIA` or `RAZON` opening the row, `ITEM`, `CANTIDAD` or
  `UNITARIO` in its first part). They were matched in any case, so a word in lower case changed the documents sent: a
  "Servicio exento" line was exempt, a note whose reason said "anula" took the items of the cancelled case, the value of
  a two-part row under "modifica monto" was read as a price, and an item named "Razones varias" was dropped.
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

[Unreleased]: https://github.com/arrowsw/dte-sdk/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.6.0
[0.5.0]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.5.0
[0.4.0]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.4.0
[0.3.0]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.3.0
[0.2.0]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.2.0
[0.1.0]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.1.0
[0.0.2]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.0.2
[0.0.1]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.0.1
