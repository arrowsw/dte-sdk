# Changelog

All notable changes to **dte-sdk** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **The VAT not withheld of a purchase invoice and its notes** (`totals.vatNotWithheld`, `IVANoRet`). Formato DTE 2.5
  gives `IVANoRet` (field 118) to a purchase invoice (46) that withholds part of the VAT and to the notes that
  reference one (56, 61): the VAT less the VAT withheld by product. The totals had no place for it. It is written
  after the withholdings, a whole number above zero; a zero is none, and any other type refuses it
  (`INVALID_OPTION`, `totals.vatNotWithheld`).
- **A global adjustment of an export document in pesos** (`GlobalAdjustment.otherCurrencyValue`, `ValorDROtrMnda`).
  Formato DTE 2.5 marks `ValorDROtrMnda` required on the three export documents, for the amounts of global discounts
  and surcharges (field 6). An adjustment given as an amount now carries it, `convertToPesos` of its value, when the
  document brings its `exchangeRate`. An adjustment in percent has none.
- **The site the legend under the stamp names** (`verificationSite`, `dte-sdk/pdf`). The printed sample always said
  `Verifique documento: www.sii.cl`. A company that declared to the SII the site where its receipts are consulted
  names it here, on the sheet and on the roll; `www.sii.cl` stays the default.
- **The digest of a received envelope** (`ReceivedEnvelope.digest`). `readReceivedEnvelope` reads the digest of the
  envelope's own signature, and `createReceptionAnswer` quotes it (`Digest`, which `RespuestaEnvioDTE_v10.xsd`
  declares after the id of the envelope).
- **The customs tables of an export document** (`dte-sdk/catalogs`). Formato DTE 2.5 sends the codes of an export
  document to the tables of the Servicio Nacional de Aduanas, and the library carried none. `dte-sdk/catalogs` now
  holds eight of Anexo 51 of the Compendio de Normas Aduaneras, each row as the annex writes it: countries
  (`CUSTOMS_COUNTRIES`, `CodPaisRecep` and `CodPaisDestin`), ports (`CUSTOMS_PORTS`, with the heading each is listed
  under), transport routes, sale clauses, payment terms of an export (`FmaPagExp`), package types, units of measure
  and sale modes. `customsCode` finds the code of a name or an abbreviation, matched whole by its letters and digits
  alone, and answers `null` when rows of different codes match, as `SAN FRANCISCO` does without the heading of its
  port; `customsName` names a code. They are catalogs: `createDocument` takes any code, as before.
- **The printed sample of an export document** (`dte-sdk/pdf`). `renderPrintedSample` refused the three export
  documents (110, 111, 112). It now draws them on the sheet: the amounts in the currency the document names
  (`TpoMoneda`), with the decimals they have, no peso sign and no total in words; the payment terms of the export
  (`FmaPagExp`) in words; and the customs area (`Aduana`) in the transport box, each code Formato DTE 2.5 asks to
  print in words (sale mode and clause, transport route, ports, units, kinds of package, countries) by the name its
  customs table gives it, and a code the table does not list as written. A receiver abroad that names no commune and
  no line of business prints neither label. A dispatch guide prints the customs area it carries the same way. The
  continuous paper stays a receipt's: an export document on `paper: 'roll'` is refused (`INVALID_OPTION`, `paper`).
  `parsePrintableDocuments` reads the customs area (`transport.customs`), the currency and the payment terms.

### Changed

- **On an export line the share of a percent keeps its decimals.** A line of an export document rounded the share of
  a discount or a surcharge in percent to a whole number, the only amount `DescuentoMonto` and `RecargoMonto` admit,
  so a price of 94 with 10 % on the line was 103. Formato DTE 2.5 leaves those two amounts optional on the three
  export documents (fields 30 and 34 of the detail). The share now has the four decimals of `MontoItem`, 103.4, and it
  is written as an amount only when it is a whole number; otherwise the percent goes alone, and `warnings` lists it
  (`{ formatField: 30 | 34, field }`), since the same fields say a percent goes with its amount. Only a share those
  four decimals bring to zero is refused. None of it has been run against the SII: a discount with decimals, and a
  line with one share written and the other not, are the cases to look at in the first export documents.
  - **What to change:** nothing in the call. `calculateExportLineAmount` returns shares with decimals, so code that
    writes them as `DescuentoMonto` or `RecargoMonto` itself must write only a whole one; the amount of a line with a
    percent may differ from the one 0.15.0 wrote; and `DocumentWarning` is now one of two shapes, so code that reads
    `validation` of every warning must tell them apart.
- **`sanitizeText` keeps the dashes and the spaces a text editor writes.** It dropped every dash but two and the minus
  sign, so a pasted `−5` read `5`, and the typographic spaces, so two words ran together. Each dash from U+2010 to
  U+2015 and U+2212 is now a hyphen, and each typographic space a plain space.
- **A commune is matched to its SII office by its letters and digits alone.** `siiOfficeForCommune` ignored case and
  accents only, so `Til Til`, `Tal-Tal` and `OHiggins` found no office and the printed sample fell back to Santiago
  Centro. Spaces, hyphens and apostrophes no longer count, and `SII_OFFICES` gains five spellings in use of names it
  already listed (Aisén, Coihaique, Llaillay, Marchigüe, Paiguano): 360 names in 40 offices.
- **A document admits 30 payment installments.** `MntPagos` repeats up to 30 times (Formato DTE 2.5), and
  `createDocument` wrote any number. More than 30 are refused with `INVALID_OPTION` and `options.payments`.

- **A dispatch guide without its transfer type is refused.** Formato DTE 2.5 marks `IndTraslado` (field 7) mandatory
  on a guide, and `createDocument` issued a 52 without `options.transferType` and read it as a sale. It now refuses
  one with `MISSING_FIELD` and `options.transferType` in `details.field`. The schema still declares the element
  optional, since `IdDoc` serves every type, and the certification runner always gives one.
  - **What to change:** pass `options.transferType` on every 52: `TRANSFER_TYPES.sale` (1) for a guide that is a
    sale, or the reason of the transfer (2 to 9) for one that is not.
- **A line's `IndExe` outside 1 to 6 is refused, and so is a line with `IndExe` 3 on a settlement invoice or an export
  document.** The schemas admit `IndExe` 1 to 6 and no other value. `createDocument` wrote any other value as it came:
  on a 33, 34, 46, 52, 56 and 61 it put the line in `MontoNF`, and on a settlement invoice (43) and an export document
  (110, 111, 112) it left the line out of every total. A receipt already refused it. Every type now refuses it with
  `INVALID_OPTION` and `items[i].exemptIndicator` in `details.field`, `null` included: every type but a receipt read a
  `null` indicator as none, and the numeric fields of a line already refused `null`. A settlement invoice and an
  export document also refuse a line with `IndExe` 3, the deposit guarantee for containers, which was in none of
  their totals. That is this library's choice, not the format's: Formato DTE 2.5 gives `GrntDep` to neither type, as
  it gives it to neither a 46 nor a 52, where such a line is accepted, and its `IndExe` row admits the indicator on
  both (on a settlement invoice "Sólo en caso de Liquidación-Factura que tenga ítems no facturables"). On every type
  the format gives no `GrntDep` to, `createDocument` refuses a given `totals.depositGuarantee` other than zero, a value
  that is not a number included (`INVALID_OPTION`, `totals.depositGuarantee`).
  - **What to change:** give a line an `exemptIndicator` from 1 to 6, or leave it out instead of passing `null`. Issue
    a guarantee for containers on a 33, 34, 56 or 61, not on a 43 or an export document.
- **`bookEntryFromDocument` refuses a negative sign on a credit note with a deposit guarantee.** The guarantee of a
  credit note (61) now travels to the purchase and sales book as `containerDeposit` (`DepEnvase`), a `MontoType` of
  `LibroCV_v10.xsd`, from zero up, so `creditNoteSign: 'negative'` cannot negate it with the other amounts. Such a
  note is now refused with `INVALID_OPTION` and `creditNoteSign` in `details.field`. The positive sign, the default,
  carries the guarantee.
  - **What to change:** book a credit note with a deposit guarantee with the positive sign.

### Fixed

- **A header too long for one line is broken inside.** The SII rejects an upload over a line of about 4,090
  characters (`CHR-00002`), with the folio already spent. The header of a document is one line, and thirty payment
  installments with their glosses took it to 4,992 characters. A line over 4,000 characters is now broken again
  after the sections of the header and the elements that repeat inside them, before the document is signed, and a
  line that still does not fit is refused with `FIELD_TOO_LONG` (`field: 'line'`). A document that fits is written as
  before.
- **The samples of the settlement set are filed with the test set.** `sampleSetOf` named the basic, guide, exempt and
  purchase sets, and the envelope of the settlement set (`envio-set-liquidacion.xml`) fell with the simulation.
- **The issuer's name, activity and address wrap in the header of the printed sample.** Each was drawn on one line
  whatever its length, so a name of a hundred characters ran under the type box. They wrap to the width left of the
  box; a text that fits is one line, as before.
- **The non-billable amount takes off the lines with `IndExe` 6.** Formato DTE 2.5 defines `MontoNF` (field 125) as
  the lines with `IndExe` 2 less the lines with `IndExe` 6, and lets it be negative. `calculateTotals` added the
  lines with `IndExe` 6, and those with 3, 4 and 5, to the lines with 2: on a 33, a line of 1 000 with `IndExe` 2 and
  one of 400 with `IndExe` 6 gave `nonBillableAmount` 1 400, where the format gives 600. The lines with `IndExe` 6
  now come off it, so it is negative when they are larger, as `MontoNF`, a `ValorType`, admits in `DTE_v10.xsd` and
  `EnvioBOLETA_v11.xsd`. A line that is not a sale (`IndExe` 4) or is to be deducted (5), which `createDocument`
  writes at zero, is in no total. The period amount that `createDocument` checks (field 126) is the total plus this
  amount, as before.
  - **What to change:** nothing in the call. A document or a receipt with lines of `IndExe` 6 now reports a smaller
    `nonBillableAmount`, which may be negative, so code that reads it as an amount from zero up should take a negative
    one. Totals given by hand are written as they come.
- **The deposit guarantee for containers is reported in `GrntDep` and added to the total.** A line with `IndExe` 3 is
  the guarantee for the deposit of containers or packaging. Formato DTE 2.5 reports their sum in `GrntDep` (field 120)
  and adds it to `MntTotal` (field 124), and `DTE_v10.xsd` declares `GrntDep` between `CredEC` and `Comisiones`.
  `calculateTotals` put those lines in `MontoNF` and left them out of the total, so a 33 with a sale of 1 000 and a
  guarantee of 300 wrote `MntTotal` 1 190 and `MontoNF` 300, where the format gives `GrntDep` 300 and `MntTotal` 1 490.
  `Totals` gains `depositGuarantee` (`GrntDep`), which `calculateTotals` works out, the codec writes and reads, the
  check of the total adds and `bookEntryFromDocument` carries to the purchase and sales book as `containerDeposit`
  (`DepEnvase`), whose total already added it. The format gives `GrntDep` to a 33, 34, 56 and 61 alone (code 0, "no
  debe ir", on every other type). Its `IndExe` row admits the indicator on a dispatch guide (52) and a purchase
  invoice (46) without limiting the value 3 by type, so there a line with `IndExe` 3 keeps its amount and is in no
  total, as one with 4 or 5 is. A given `depositGuarantee` of zero is none on every type: no `GrntDep` is written.
  - **What to change:** nothing in the call for a document without `IndExe` 3 lines. On a 33, 34, 56 or 61 with
    them, the totals worked out now include the guarantee in the total and report it in `GrntDep`, no longer in
    `MontoNF`. Totals given by hand are taken as they come: given as before, with the guarantee in
    `nonBillableAmount` and no `depositGuarantee`, they are issued unchanged, with `MontoNF` and no `GrntDep`, so move
    the guarantee to `depositGuarantee` and add it to `totalAmount` to write it where the format puts it. A given
    `depositGuarantee` that `totalAmount` leaves out is refused with `TOTAL_MISMATCH`. On a 46 or 52, a line with
    `IndExe` 3 no longer counts in `nonBillableAmount`.

## [0.15.0] - 2026-11-23

### Added

- **Export documents: the export invoice (110) and the export debit (111) and credit (112) notes.** The README listed
  them as planned after the first certification. They go through the same functions as the other types
  (`createDocument`, `stampDocument`, `signDocument`, `issueDocument`, `createEnvelope`, `calculateTotals`) and are
  written under their own root, `Exportaciones`, which `documentElementName` now names. `DOCUMENT_TYPES` gains
  `exportInvoice`, `exportDebitNote` and `exportCreditNote`; `isExport` says which types they are, and `isNote` now
  counts 111 and 112. `DocumentInput` gains `currency` (`TpoMoneda`, required on them, one of `CURRENCIES`, the 40 of
  the schema's `TipMonType`, with `isCurrency`) and `exchangeRate` (`TpoCambio`), which adds the totals in pesos
  (`Header.otherCurrency`, `OtraMoneda`, in `PESO CL` as Formato DTE 2.5 field 129 asks). The model gains the foreign
  receiver (`receiver.foreign`, `Extranjero`: `id`, `nationality`, `additionalId`), the customs area
  (`transport.customs`, `Aduana`, with its package types, `PackageType`), the issuer's `additionalBranchCode`
  (`CodAdicSucur`) and `additionalId` (`IdAdicEmisor`) and a reference's `otherAdditionalId` (`IdAdicOtr`), with their
  SII shapes (`SiiExtranjero`, `SiiAduana`, `SiiTipoBultos`, `SiiOtraMoneda`); `fromSiiDocument` reads them back. Their
  amounts are in the document's currency with the four decimals the schema admits: a line is its quantity by its price
  rounded to four decimals, less its discount and plus its surcharge, each a whole number because `DescuentoMonto` and
  `RecargoMonto` are (`calculateExportLineAmount`); the totals are the exempt amount, the only one an export has, and
  the same total, or zero on an export without payment, `FmaPagExp` 21 (field 124) (`calculateExportTotals`); and each
  amount in pesos is the amount by the rate rounded half away from zero to a whole peso (`convertToPesos`). All of it is
  worked out exactly, over the decimal digits as written, so binary floating point never decides a rounding. An amount
  goes up to the schema's 99 999 999 999 999.9999 and is written as it is given. A number holds some fifteen significant
  digits, so an amount the arithmetic works out with more may have no number of its own: when the number it would get
  writes another amount, it is `INVALID_AMOUNT` with the amount in `details.value`, and so is a number that is not
  finite or is 10^21 or more, in every function of the arithmetic. A line discount or surcharge in percent whose whole
  amount is zero is refused, since Formato DTE 2.5 writes a percent with its amount (fields 30 and 34 of the detail).
  The stamp carries the total as the document writes it, decimals and all. Before stamping, `createDocument` refuses
  what `Exportaciones` does not declare (prices with VAT, the withholding, commissions, six options of `IdDoc`, every
  total but the exempt amount and the total, the trailer plate and the departure and arrival of the transport, a line's
  withholding agent and additional taxes), a service indicator other than 3 to 6 (`EXPORT_SERVICE_INDICATORS`), an
  `exportPaymentTerms` that is not a code of one or two digits, a receiver whose RUT is not the generic 55555555-5 the
  format gives (`FOREIGN_RECEIVER_RUT`), a global adjustment without `exemptIndicator: 1` and more than ten package
  types, and asks on a 110 for what Formato DTE 2.5 asks: the receiver's city and country, each weight's unit and,
  unless the service indicator excuses them, the sale modality, clause and clause total, the transport route and each
  line's quantity and unit; a commune is not asked of a receiver abroad. Every other type refuses the new fields, and
  the service indicators 5 and 6. A received export document is read and verified under `Exportaciones`, its total and
  the `MNT` of its stamp read with their decimals; `readReceivedEnvelope` refuses one whose total has decimals, which
  the answers have no place for. The SII's `DTE_v10.xsd` and `EnvioDTE_v10.xsd` validate every variant the tests build,
  and none has been sent to the SII. Not done yet: the printed sample of an export document, which `dte-sdk/pdf` refuses
  with `INVALID_DOCUMENT_TYPE` instead of printing its amounts as pesos; the status of one, which `queryDocumentStatus`
  refuses as before, since its query carries a whole total; the export sets of the certification runner; the books; and
  the customs service's code tables, which are written as given. `dte-sdk` grows from 43.06 kB to 46.24 kB, over its 44
  kB limit, which goes to 48 kB, and `dte-sdk/portal` from 82.11 kB to 84.82 kB, over its 84 kB limit, which goes to 86
  kB.
  - **What to change:** nothing for the other types. Code that switches over `DocumentType`, or keeps a record keyed by
    it, has three new members; `HeaderOptions.serviceIndicator` also takes `ExportServiceIndicator`.
- **The assignment of an invoice: the electronic assignment file (AEC), built and signed, and its registration.** The
  README listed the assignment of invoices as planned after the first certification. `unstable_createAssignment(input)`
  builds and signs, with no network, the file with which the creditor of a document assigns it to a financier under Ley
  19.983, as Formato Archivo Electrónico de Cesión 1.1 and `AEC_v10.xsd` define it: the signed `DTE` embedded byte for
  byte, so its own signature still verifies, in a signed `DocumentoDTECedido`; the `DocumentoCesion` with `SeqCesion` 1,
  signed by each of one to three authorized signers (`RUTAutorizado`) with their own certificate, in their order; and
  the whole file signed as `DocumentoAEC`. Only the SII's namespace is declared above the zones, so nothing the file
  declares changes what a zone's signature covers. The file carries no electronic receipt of the goods, so it carries
  the sworn statement the format words for that case (`DeclaracionJurada`), with the assignor, the assignee and the
  debtor filled in. Before signing it refuses a type other than 33, 34, 46 and 43 (`ASSIGNABLE_DOCUMENT_TYPES`,
  `isAssignableDocumentType`), a document whose signature does not verify, a first assignment by anyone but the
  document's creditor (the issuer of a 33 or 34, the receiver of a 46 or 43), no signers or more than three, a signer's
  certificate that names another RUT, an amount that is not a whole number from 1 to the document's total, dates outside
  2003-04-01 to 2050-12-31, and texts past the stricter of the format's and the schema's lengths.
  `unstable_createReassignment({ previous, ...terms })` builds the next assignment on top of an earlier file, by its
  last assignee, once every signature of that file verifies, up to 40 (`MAX_ASSIGNMENTS`).
  `unstable_verifyAssignment(xml)` checks every signature of a file, the document's own included, where it stands in the
  file, and takes for an assignment's signatures only its own children. Both builders run it on the file they built and
  return none that does not verify: a file whose signatures do not stand, as with a zone ID the document also uses, is
  `SIGNATURE_INVALID`. The three carry the `unstable_` prefix because no file they built has been registered at the SII
  yet, and what the registry takes is the only judge of the choices in them: the wording of the sworn statement, the IDs
  of the zones and what the file declares above them. Registering a file in the SII's registry of credit transfers is
  `unstable_uploadAssignment(sii, { xml, notificationEmail })`, a multipart upload to `RTCAnotEnvio.cgi` held to the
  `RutCedente` of the file's cover and never sent again after an answer, and the state of the upload is
  `unstable_queryAssignmentUploadStatus(sii, { trackId })`, `getEstEnvio` of `wsRPETCConsulta`, whose codes come back
  unclassified. Both are unstable: dte-sdk has not run them against the SII, and the format does not describe these
  services. `SII_SCHEMAS` has a ninth schema, `AEC`, with its three files (`AEC_v10.xsd`, `Cesion_v10.xsd`,
  `DTECedido_v10.xsd`), and every file the tests build validates against it. New error code `SIGNATURE_INVALID`, new
  upload kind `assignment`, new endpoints `ASSIGNMENT_ENDPOINTS` (`SiiEndpoints.assignments`) and new types
  `AssignableDocumentType`, `AssignmentCertificate`, `AssignmentParty`, `AssignmentSigner`, `Assignor`,
  `AssignmentContact`, `AssignmentTerms`, `AssignmentInput`, `ReassignmentInput`, `AssignmentVerification`,
  `AssignmentEndpoints`, `AssignmentUploadInput`, `AssignmentUploadStatusInput` and `AssignmentUploadStatus`. Not
  written yet: the PDF image of the document, the electronic receipts and the image of a manual one. `dte-sdk` grows
  from 40.12 kB to 43.06 kB, over its 42 kB limit, which goes to 44 kB, and `dte-sdk/schemas` from 23.59 kB to 24.64 kB,
  over its 24 kB limit, which goes to 26 kB.
  - **What to change:** nothing. Code that switches over `UploadKind` has a new member, `assignment`, and code that
    builds a whole `SiiEndpoints` by hand adds `assignments`.
- **A new entry point, `dte-sdk/schemas`: validation against the SII's schemas, as an option.** The tests validated what
  dte-sdk issues against the SII's schemas, and nothing did at run time; the README listed it as planned.
  `validateAgainstSchema(xml, { schema })` validates a document against the SII's own schema and returns what the schema
  says against it, `{ message, line }` each, and an empty list when the document is valid. It is the check the SII runs
  first on an upload, where one document that fails takes the whole envelope with it, so running it before costs no
  folio. The schema is the one of the document element (`schemaOf(xml)`) unless `schema` names another; a receipt (39,
  41) on its own has none, since only `EnvioBOLETA_v11.xsd` declares its `DTE`, and is validated inside its envelope;
  and `SII_SCHEMAS` lists the eight it has: `DTE`, `EnvioDTE`, `EnvioBOLETA`, `LibroCV`, `LibroGuia`, `ConsumoFolio`,
  `RespuestaEnvioDTE` and `EnvioRecibos`. The document can be its text or the bytes of its file, read in the charset its
  declaration names, ISO-8859-1 or UTF-8 under any of their usual names (`latin1`, `UTF8`, `US-ASCII`); bytes that name
  another are refused with `INVALID_OPTION`. The schemas come inside the package, as text (`SCHEMA_SOURCES`): the SII's
  14 files, whole, decoded from ISO-8859-1, and a test holds them to the files the tests already validated against,
  which now validate through this entry. The validator, `xmllint-wasm`, is a new optional peer dependency, loaded on
  first use; without it the call throws `DEPENDENCY_UNAVAILABLE`. Nothing else in the package calls the entry, and no
  other entry reaches the schemas. `npm run schemas` writes them again after a schema of the SII changes. The entry
  measures 23.59 kB against a limit of 24 kB.
  - **What to change:** nothing. To validate, install `xmllint-wasm` and import from `dte-sdk/schemas`.
- **The purchase and sales register as a file, from `dte-sdk/portal`.** The register was read page by page, and the
  README listed its file as planned. `unstable_downloadRegisterFile(portal, { period, operation, accountingStatus })`
  asks the register's service for what its "Descargar Detalles" gives: every document of the operation in the period,
  one line each, `;` between values, the SII's column names first. `csv` is the text to save, and `columns` and `rows`
  are the same lines split, every value as the text the SII wrote. Purchases are asked by accounting status,
  `registered` by default; sales have one, and any other is refused with `INVALID_OPTION`. A period with no documents
  is an empty file. A period the SII refuses to show throws `SII_PORTAL_REJECTED` with the new rejection
  `registerFileRefused`, the SII's `code` and its message, instead of reading as empty as the other reads of the
  register still do. The request carries, in its two reCAPTCHA fields, the constant the register's own page sends
  there; dte-sdk solves no challenge, and if the SII comes to ask for one the call is refused. It carries the
  `unstable_` prefix because dte-sdk has not run it against the SII yet. New type `RegisterFile`. `dte-sdk/portal`
  grows from 81.68 kB to 82.03 kB, over its 82 kB limit, which goes to 84 kB.
  - **What to change:** nothing.
- **A portal client that signs in with a tax password, from `dte-sdk/portal`.** The portal took a certificate alone.
  `unstable_createPasswordPortalClient({ environment, userRut, password, companyRut })` makes a client that signs in
  with the RUT and the tax password of a person (the SII's "Clave Tributaria"), posted to the same CGI the certificate
  login uses, on the host that asks for no client certificate; every portal function takes it as it takes the client of
  `createPortalClient`. `password` is a function, asked for each time a login needs it and never kept, so the client
  holds no password and writing it down writes none. The capture port writes the login form as `clave=[redacted]`, and
  no error or log message carries the password. The SII locks a password after a few wrong attempts, so a password it
  refused is never sent again by the same client: the next login throws `SII_PORTAL_LOGIN_FAILED` with `refusedBefore:
  true` before it asks the SII for anything. For the same reason the request that posts a password is never retried,
  whatever the retry policy of the client says, and a refusal is read from the cookies that login set, never from the
  ones an expired session or another page left behind. A password is posted a second time in one case alone: the SII
  took it, said the user has too many sessions open, and the client closed the earlier ones (`closePreviousSessions`). A
  session in the cache is used without the password, so the key of a password session is random and of its client alone:
  in a cache shared with other people, a client that merely names the same RUT finds no session and has to sign in.
  `sessionKey`, a secret of that person, shares a session on purpose, across restarts for one. It carries the
  `unstable_` prefix because dte-sdk has not run this login against the SII yet. `PortalClient.certificate` is null on
  such a client and the new `passwordSignIn` is null on a certificate's; new types `PasswordPortalClientOptions`,
  `PortalPasswordSignIn` and `PortalSignIn`.
  - **What to change:** nothing for a client made with `createPortalClient`. Code that reads `portal.certificate` of
    a `PortalClient` it did not make now gets `Certificate | null`.
- **The runtime's own RSA signs, checked against the JavaScript engine.** Every signature is RSA-SHA1 with PKCS#1
  v1.5, which is deterministic, and it was worked out in JavaScript: about 12 ms for a 2048-bit key on a current
  laptop, against 0.35 ms for the RSA of Node, so the signatures of an envelope of 500 receipts took about 6 seconds.
  On a runtime that offers its crypto module without an import (Node, Bun, Deno), the first signature of the process
  is worked out both ways and compared, and when they agree the runtime signs the ones that follow; if they differ, if
  the runtime has no such module (a browser) or refuses SHA-1, the JavaScript engine stays in charge, and a key the
  runtime refuses later is signed by it too. The runtime signs with an RSA key alone, since asked for RSA-SHA1 with
  another key it signs with that key's own algorithm: any other key is left to the JavaScript engine, which throws on
  it as before. The bytes are the same either way, and no entry loads `node:crypto` at
  import time. `rsaSigningEngine()` answers `native`, `portable`, or null before the first signature. With the rest
  of this release's changes to the root entry, `dte-sdk` grows from 39.51 kB to 40.08 kB, over its 40 kB limit, which
  goes to 42 kB.
  - **What to change:** nothing.
- **A line can be marked as a transaction of a withholding agent.** `Retenedor` is an element of a line of
  `Documento` in `DTE_v10.xsd` that dte-sdk read when printing and could not write. A line's `withholdingAgent` writes
  it, between `IndExe` and `NmbItem`: `{}` marks the line (`IndAgente` R), and `slaughterBase`, `marginBase` and
  `finalConsumerPrice` are the bases it may declare (`MntBaseFaena`, `MntMargComer`, `PrcConsFinal`), whole amounts
  from zero up or `INVALID_AMOUNT`. No document gets it by default. A receipt and a settlement invoice (43) refuse it
  with `INVALID_OPTION`, since their lines declare no such element. New types `WithholdingAgentLine` and
  `SiiRetenedor`.
  - **What to change:** nothing.
- **The mailbox an issuer registered for the exchange, from `dte-sdk/portal`.** The answers to a received document
  (the reception answer, the commercial result and the receipt of goods) go to the mailbox the issuer registered with
  the SII, which is not the sender of the message the document arrived in, and which the public registry
  `queryAuthorizedIssuer` reads does not show. `unstable_fetchExchangeMailbox(portal, { rut })` asks the registry with
  a portal session (`ce_consulta_e`), in the client's environment, and answers the issuer's name, resolution and
  document types with `exchangeEmail`, null when the issuer registered none. A RUT that is not an authorized issuer
  throws `SII_PORTAL_REJECTED` with `rejection: 'companyNotAuthorized'`. It carries the `unstable_` prefix because
  dte-sdk has not read that page against the SII yet: its tests use a page written by hand on the markup of the public
  registry. New type `ExchangeMailbox`.
  - **What to change:** nothing.
- **The printed sample takes the company's resolution as data.** `PrintedSampleOptions.resolution`, beside the string
  it has always taken, accepts `{ number, date }` (`NroResol`, and `FchResol` as `YYYY-MM-DD`) and prints the line in
  the wording of the default, `Res. Ex. SII N° {number} del {year}`, with the year of the date, on the sheet and on the
  roll, so a company in production no longer writes the SII's line itself nor sets the clock to get its year. The new
  pure `resolutionLine({ number, date })`, exported from `dte-sdk/pdf`, returns the same line for a caller that shows
  it elsewhere. A number that is not a whole number from 0 throws `INVALID_OPTION` (`resolution.number`) and a date
  that is not a real `YYYY-MM-DD` throws `INVALID_DATE` (`resolution.date`), before the PDF libraries load;
  `renderPrintedSamples` and `writePrintedSamples` report it as a failure of each sample. A string is printed as
  before, and without `resolution` the line is still number 0 of the year of `now`.
  - **What to change:** nothing. To print a production resolution, pass it as `{ number, date }` instead of writing
    the line.

### Changed

- **A line discount or surcharge in percent whose share of the line rounds to no peso is refused.** A line's discount
  is its percent of the line rounded to a whole peso, and on a cheap line a small percent rounds to none: 1 % of 49 is
  0.49. `createDocument` then wrote `DescuentoPct` alone, where Formato DTE 2.5 asks for the amount with it ("Si va el
  descuento en %, debe ir el monto correspondiente", fields 30 and 34 of the detail, the same of a surcharge), and
  `DescuentoMonto` and `RecargoMonto` take no zero in `DTE_v10.xsd`, so there is no amount to write. It is now
  `INVALID_AMOUNT` with the field in `details.field`, `items[i].discountPercent` or `items[i].surchargePercent`, on
  every type that takes them, as an export document already did. That includes a percent on a line whose base is
  zero, one with no price or priced at zero, and one above zero that its two decimals bring to zero, as 0.004. A
  receipt follows the same rule, though `EnvioBOLETA_v11.xsd` would take an amount of zero, so a line is written one
  way whatever its type. A percent whose share rounds to one peso or more is written with its amount, as before, and
  `calculateLineAmount` still answers a share of zero. The certification runner leaves such a discount out of the line
  it builds, which changes no amount: a return of one unit of a cheap discounted line, at the original's price and
  discount, comes to it, and the set would otherwise stop there.
  - **What to change:** a line that brought such a percent, which 0.14.0 issued, is now refused: leave the percent
    out of that line, whose discount or surcharge comes to no peso.
- **A given amount on a line with a price is the amount the price gives.** `createDocument` took a line's `amount` as
  it came, and on a line with a price wrote beside it the discount and the surcharge the price gives: `unitPrice:
  1000`, `amount: 100` and `discountPercent: 10` wrote `MontoItem` 100 and `DescuentoMonto` 100, which do not add up.
  Formato DTE 2.5 makes `MontoItem` "(Precio Unitario * Cantidad) – Monto Descuento + Monto Recargo" (field 38 of the
  detail). On a line with a price, a given amount that is not that one is now `TOTAL_MISMATCH`, with `items[i].amount`
  in `details.field`, the amount the price gives in `details.expected` and the given one in `details.actual`; one that
  is that amount is taken as if it were not given. A zero is no exception, save where the same field admits one: on
  a dispatch guide (52) whose `transferType` is not 1, a transfer that is not a sale ("Puede ser cero cuando el
  documento es una Guía de despacho NO VENTA"), a zero is taken on a line with a price and no percent. On an export
  document the given amount is compared once rounded to its four decimals. A line with no price takes its amount as it
  comes, as before, save that a given -0 is written 0, where it was written `<MontoItem>-0</MontoItem>`. The message
  of `TOTAL_MISMATCH` now reads "Amount does not match the SII formula", since a line's amount has it too; the code is
  the same.
  - **What to change:** a line that brought a price and an amount that do not add up, which 0.14.0 issued, is now
    refused: leave out the amount, or the price. A line with a price and an amount of zero is refused too, outside a
    guide that is not a sale: mark a line that is not a sale with `exemptIndicator: 4`, which writes it at zero. A
    negative line of a settlement invoice (43) goes without a price, as `PrcItem` is above zero in the schema.
- **The status of an upload is its verdict, not the class of its code.** The SII answers `EPR` ("Envío Procesado")
  once it has processed an envelope, whatever it did with each document inside, and `queryUploadStatus` and
  `waitForUploadStatus` read that code as `accepted` while the counts of the same answer reported rejected documents.
  Now `status` is settled with the counts: an accepted code with rejected documents is the new class
  `partiallyRejected`, or `rejected` when none was accepted, and one with objections and no rejection is
  `acceptedWithObjections`. Counts only lower an acceptance: a pending or a rejected envelope stays as its code says,
  and so does an answer without counts. `QueryEstUp` answers one block of counts per document type of the envelope, and
  only the first was read: `counts` now adds up every type and the new `countsByType` has each one, on both channels.
  `uploadVerdict(cls, counts)` is the rule as a pure function, and `classifyUploadStatus` still reads a code alone,
  without ever answering the new class. The certification runner reads the codes, as before.
  - **What to change:** a caller that takes `status === 'accepted'` as "every document went in" needs nothing more.
    One that compares against the list of classes, or switches over `UploadStatusClass`, has a new member,
    `partiallyRejected`: the envelope went in and some of its documents did not, so only those are to be corrected
    and sent again. Code that builds an `UploadStatus` by hand, a test double for one, adds `countsByType`.
- **A purchase book reports the VAT a purchase invoice withholds where the format puts it.** The format of the book
  (Información Electrónica de Compras y Ventas 3.0, sections 2.4 and 3.4) gives each side its own fields: the sales
  detail has `IVARetTotal` and `IVARetParcial`, which the schema itself marks "(LV)", and the purchase detail has
  neither, and takes the withheld VAT in `OtrosImp` under a withholding code, 15 with the rate of the tax when the whole
  VAT was withheld, and off `MntTotal`. Three things followed the sales side on a purchase book and now follow the
  format. The line total of a purchase line takes off the amount of `otherTaxes` under a withholding code, and a
  purchase line that brings `totalVatWithheld` or `partialVatWithheld`, which would be written and leave the total as if
  nothing had been withheld, is refused with `INVALID_OPTION` and the field in `details.field`; a sale line is as
  before. `bookEntryFromDocument` with `operation: 'purchase'` puts the withholding of code 15 in `otherTaxes`, with the
  rate the document gives it, and keeps `totalVatWithheld` for `operation: 'sale'`. And the certification purchase book
  writes the withholding of a purchase invoice as `OtrosImp` with code 15 and rate 19, where it wrote the rate as 0.19
  and `IVARetTotal` beside it; the line total is still the net amount.
  - **What to change:** nothing for a sales book. On a purchase book, a line that brought `totalVatWithheld` or
    `partialVatWithheld` is now refused: give the withheld VAT in `otherTaxes` under its withholding code, 15 for the
    whole tax, instead. A line with an explicit `totalAmount` keeps it, and a difference with the formula is reported in
    `totalMismatches`, as always.
- **The stamp is always printed at error correction level 5.** The level was left to the barcode library, which picks
  it by the size of the data and lowers or raises it to fill the symbol: 5 for a stamp of the usual size, and nothing
  held it there. It is now fixed at 5, the level the SII's instructions ask for (section A.2.5). And a stamp with a
  byte above ASCII, as the document of another issuer may carry in the name of its receiver or of its first item, is
  written in byte compaction alone when it fits in the symbol, where it was mixed with text compaction and the byte
  travelled behind a shift. A stamp of plain ASCII, as every document dte-sdk issues has, is encoded as before.
  - **What to change:** nothing. A `BarcodeModule` written for a test receives `eclevel` and `fixedeclevel`, and
    `raw: true` with the codewords as its text for a stamp in bytes.

### Fixed

- **A line percent of zero is left out, and a negative one is refused.** `DescuentoPct` and `RecargoPct` are
  `PctType`, which starts at 0.01 in `SiiTypes_v10.xsd`, and `createDocument` wrote a percent of zero as it came, as
  `<DescuentoPct>0</DescuentoPct>`, which fails the schema on every type but a receipt, and with it the whole
  envelope. A percent of zero is no discount or surcharge, and the line is now written without it, its amount the
  same. A negative percent was written too, and left the amount of the line as if there were none; it is now
  `INVALID_AMOUNT` with the field in `details.field`. A settlement invoice (43) still refuses any line percent with
  `INVALID_OPTION`.
  - **What to change:** nothing for a percent of zero. A line that brought a negative percent is now refused.
- **A line's amounts are worked out over decimal digits.** `calculateLineAmount`, which `createDocument` writes a line
  with, rounded the quantity by the price, and each percent of that base, with `Math.round` over binary floating
  point, where a half in decimal digits may come out a hair below it: 9.2 % of 375 is 34.5, worked out as
  34.49999999999999 and written as `DescuentoMonto` 34, and 0.145 by 100 is 14.5, written as `MontoItem` 14. Of the
  shares of a base of 1 to 2 000 pesos at each percent from 0.01 to 100.00, 264 came out a peso short. The quantity and
  the price are now taken with the six decimals the schema holds and a percent with two, as `calculateExportLineAmount`
  already took them, the base is their product rounded half away from zero to a whole peso and each share is its
  percent of the base rounded the same way, all over decimal digits. Formato DTE 2.5 does not say how a line is
  rounded; each percent is still taken of the base already rounded to a whole peso, not of the unrounded product, as
  the README and the JSDoc now say. An input that is not finite or is 10^21 or more,
  and an amount with more digits than a number holds, which would be written as another one, are `INVALID_AMOUNT`
  with it in `details.value`, where the function answered `NaN` or the other amount; from `createDocument`, such a
  line is refused with `items[i].amount` in `details.field`. The certification runner adds up the invoices and the
  notes of its simulation with the same function, so their net is the sum of the lines they carry.
  - **What to change:** `calculateLineAmount` now throws a `DteError` with `INVALID_AMOUNT` where it answered `NaN` or
    another amount: a caller that may pass a value that is not a finite number, or a quantity and a price whose
    product has more digits than a number holds (about fifteen), checks its inputs first or catches the error. A line
    whose base or share is a half in decimal digits is written a peso further from zero, and its totals with it.
- **A quantity, a price or a percent is rounded to its decimals over its decimal digits.** `createDocument` rounded
  each number to the decimals its schema type holds with `toFixed`, over its binary value, where a half in decimal
  digits may be a hair below it: a discount of 1.005 % was written `DescuentoPct` 1, and a quantity of 1.0000015
  `QtyItem` 1.000001. `calculateLineAmount` takes the same numbers half away from zero over their decimal digits, so
  on a price of 10 000 it answered a discount of 101 where `createDocument` wrote 100. Each number is now rounded half
  away from zero over its decimal digits, as the amounts of a line are: 1.005 is written 1.01, and the line's amounts
  are worked out with what is written. That covers every decimal `createDocument` rounds: a line's quantity, price,
  reference quantity and reference price, a percent, a global adjustment value, a commission rate and, on an export
  document, the exchange rate, the freight, the insurance, the sale clause total and the weights. A receipt's cap of
  100 is on the percent as written: 100.005, which 0.14.0 wrote as 100, is now 100.01, and refused.
  - **What to change:** nothing, except that a receipt percent of 100.005, which 0.14.0 wrote as 100, is now refused
    by the receipt's cap: give 100. A number a half past its decimals in decimal digits, which binary floating point
    holds a hair below, is written one unit of its last decimal further from zero, and the line's amounts with it.
- **A line that is not a sale, and every line of a credit note that corrects a text, is written with an amount of
  zero.** Formato DTE 2.5 says of `MontoItem` that it "debe ser cero" on a line whose `IndExe` is 4 (an item that is
  not a sale) or 5 (an item a guide that is not a sale takes off an earlier one), and on a credit note that corrects a
  text ("fe de erratas", `CodRef` 2) (field 38 of the detail). `createDocument` wrote such a line with the amount its
  price gives. It now writes it with an amount of zero, with its price and quantity, on every line with `IndExe` 4 or
  5 and on every line of a credit note (61, or 112 on an export) with a reference of `code` 2, and its totals add up
  that zero. A given amount other than zero there is `TOTAL_MISMATCH` with `items[i].amount` in `details.field` and
  `expected` 0, compared on an export document once rounded to four decimals, and a line percent is `INVALID_AMOUNT`
  on its field, since its discount or surcharge would add up with nothing. Such a credit note has nothing for a global
  adjustment to apply to, and a commission would take its total below zero: either is `INVALID_OPTION` with
  `globalAdjustments[0]` or `commissions[0]` in `details.field`. A debit note that corrects a text keeps its amounts.
  The certification runner and its simulation add up such a note's totals as zero, the total alone, as they do for a
  note whose lines bring no price.
  - **What to change:** a line with `exemptIndicator` 4 or 5, or of a credit note that corrects a text, is now
    written at zero whatever its price, and its document totals change with it: leave out its `amount`, or give 0, and
    leave out its percents, and the global adjustments and commissions of a credit note that corrects a text.
- **A unit price of zero is left out, and a negative one is refused.** `PrcItem` is a `Dec12_6Type` in
  `SiiTypes_v10.xsd`, and on a receipt a `Dec5Type` of `EnvioBOLETA_v11.xsd` with the same limits, both from 0.000001
  up, and `createDocument` wrote a price of zero as `<PrcItem>0</PrcItem>`, which fails the schema, and with it the
  whole envelope; Formato DTE 2.5 lets a transfer that is not a sale leave the price out (field 22 of the detail). A
  price of zero is now no price, as a percent of zero is no percent: the line is written as one without a price, its
  amount the one it brings, or zero. A negative price, or one above zero that its six decimals bring to zero, is
  `INVALID_AMOUNT` with `items[i].unitPrice` in `details.field`; a negative line of a settlement invoice (43) is an
  amount with no price. The certification runner's purchase notes, which gave an item the original's price or zero,
  write one whose price is zero without it.
  - **What to change:** nothing for a price of zero, except that a line with a price of zero and no quantity is now
    written with no quantity, where it was written with 1: give the quantity if it should be written (a dispatch
    guide still writes 1). On an export invoice of goods (110), which asks each line for its quantity, such a line is
    now refused with `MISSING_FIELD` and `items[i].quantity` in `details.field`: give its quantity. A line with a
    negative price is now refused: write it with a negative `amount` and no price on a 43, or as a credit note
    elsewhere.
- **A receipt refuses a line percent above 100.** `EnvioBOLETA_v11.xsd` restricts a receipt's `DescuentoPct` and
  `RecargoPct` to 100.00 at most, where the `PctType` of `DTE_v10.xsd` goes up to 999.99, and `createDocument` wrote a
  receipt's line with `surchargePercent: 150` as it came, which fails the receipts schema and with it the whole
  envelope. A discount above 100 was refused only when its share left the line below zero, with `items[i].amount`:
  100.01 % of 1 500 is a discount of 1 500 and a line of zero, which was written with `DescuentoPct` 100.01 and failed
  the same schema. A percent above 100 on a receipt (39, 41) is now `INVALID_AMOUNT` with `items[i].discountPercent`
  or `items[i].surchargePercent` in `details.field`. Every other type takes up to 999.99, as before.
  - **What to change:** a receipt line with a discount or a surcharge above 100 % is now refused: write a surcharge
    above it in the line's price, and a discount of the whole line as 100.
- **A quantity, a reference quantity or a reference price at or below zero is refused.** `QtyItem`, `QtyRef` and
  `PrcRef` are each a `Dec12_6Type` in `SiiTypes_v10.xsd`, and a receipt's `QtyItem` a `Dec5Type` of
  `EnvioBOLETA_v11.xsd` with the same limits, both from 0.000001 up, and `createDocument` wrote what it was given:
  `quantity: 0` as `<QtyItem>0</QtyItem>` on every type, and on a settlement invoice (43) `quantity: -1` and
  `unitPrice: 300` as `QtyItem` -1 and `MontoItem` -300, either of which fails the schema and the whole envelope with
  it. A
  quantity, a reference quantity or a reference price at or below zero, or above zero and brought to zero by its six
  decimals, is now `INVALID_AMOUNT` with `items[i].quantity`, `items[i].referenceQuantity` or `items[i].referencePrice`
  in `details.field`, on every line, priced or not, and on a line written at zero too. The certification runner leaves
  out a planned quantity of zero, an item the case gives none, so a priced line is written with 1, the quantity its
  simulation and its totals of zero already added it up with.
  - **What to change:** a line that brought a quantity of zero is now refused: leave the quantity out, and a line with
    a price is written with 1. A negative line of a settlement invoice (43) is a negative `amount` with no price and
    no quantity.
- **A note that cancels a document or corrects a text has a single document reference.** Formato DTE 2.5 asks a
  credit note that cancels the document it references (`CodRef` 1) or corrects a text of it (2), and a debit note
  that cancels a credit note (1), for one document reference ("CASOS a) b) y c) DEBEN TENER UN ÚNICO DOCUMENTO DE
  REFERENCIA", the `CodRef` row), and `createDocument` wrote such a note with as many as it was given. A credit note
  (61, 112) with a reference of `code` 1 or 2, or a debit note (56, 111) with one of `code` 1, and another document
  reference is now `INVALID_OPTION` with that other `references[i]` in `details.field`. Each type the `TpoDocRef` row
  lists counts ("Indica si el documento de referencia es: …"): a tax document, a purchase order (801), a DUS (807) and
  the others. The reference of a certification set (`documentType: 'SET'`) names no document and is not counted, here or
  for the credit note that corrects a text above, so the test sets issue as before.
  - **What to change:** a note that cancels or corrects more than one document is now refused: issue one note for
    each document. A reference to a purchase order, a DUS or any other document cannot go beside a reference of
    `code` 1 or 2 on such a note either: leave it out of the note.
- **A price is written with the decimals asked for over its digits, and with no fewer than it has.**
  `unitPriceDecimals` wrote `PrcItem` with `toFixed`, over the binary value of the price and with any number of
  decimals: a price of 1.005 with two was written `PrcItem` 1.00 beside a `MontoItem` worked out with 1.005, which by
  1 000 is 1 005, and a price of 0.4 with none was written `PrcItem` 0, which fails the schema. A `unitPriceDecimals`
  below the decimals of the price, once rounded to the six the schema holds, is now `INVALID_OPTION` with
  `items[i].unitPriceDecimals` in `details.field`, and `PrcItem` is written over the decimal digits of the price,
  padded with the zeros asked for: 84301134689.0647 with six was written 84301134689.064697, and is now
  84301134689.064700.
  - **What to change:** a line whose `unitPriceDecimals` is below the decimals of its price is now refused: ask for as
    many decimals as the price has, or leave `unitPriceDecimals` out.
- **A global percent is worked out over decimal digits.** `calculateTotals` took a global discount or surcharge in
  percent with `Math.round` over binary floating point, where a half in decimal digits may come out a hair below it:
  a discount of 9.2 % on 375 is 34.5, worked out as 34.49999999999999 and taken off as 34, for a net of 341. Its share
  is now its percent, with two decimals, of the amount it applies to, rounded half away from zero to a whole peso over
  decimal digits, as a line's share is, so that net is 340; a global adjustment in pesos is rounded the same way. The
  certification runner's simulation, which worked out its global discount with its own floating point, takes it the
  same way, so its totals are the ones of its lines: a discount of 14.5 % on 100 gave a net of 86, and gives 85.
  `calculateTotals` takes each adjustment as `createDocument` writes it: its value with two decimals and the amount it
  applies to as a whole peso, each rounded half away from zero. A value of 10^21 or more, or one that is not a
  number, is now `INVALID_AMOUNT` with it in `details.value`.
  - **What to change:** from `createDocument`, nothing: some totals with a global percent whose share is a half in
    decimal digits change by a peso, and totals worked out outside the library round that share half away from zero
    to match. A direct caller of `calculateTotals` sees the two-decimal step: an adjustment of 0.495 pesos on 1 000 now
    takes off 1, where it took off none, and a discount of 0.004 % on 1 000 000 now takes off nothing, where it took
    off 40. Give the value with the two decimals `ValorDR` holds, and catch `INVALID_AMOUNT` where a value may not be
    a finite number below 10^21.
- **A sale line of a purchase invoice carries a partial withholding where the sales detail takes it.**
  `bookEntryFromDocument` with `operation: 'sale'` left a withholding of VAT other than code 15 in `otherTaxes`, where
  the sales detail takes none (the format, section 2.4: "Estos datos van sólo en los Campos IVA Retenido Total e IVA
  Retenido parcial"), and the line total added it instead of taking it off, so the book reported a mismatch. Every
  withholding of VAT of the document now goes to `totalVatWithheld` when it is of the whole tax (code 15, or a rate
  that is the rate of the tax) and to `partialVatWithheld` when it is of less; the other taxes stay in `otherTaxes`.
  - **What to change:** nothing. A sales book built from such a document no longer reports the mismatch.
- **A signature is put where the root closes.** Every enveloped signature was inserted at the first place the text had
  the two tags that close the root. A document embedded in that text may carry them inside a comment or a CDATA section,
  which changes nothing of what its own signature covers, and the signature then went inside the comment: the file came
  back with no signature and no error. It goes before the pair that closes the root, found among the nodes of the
  document: the same tags inside a comment, a CDATA section or a processing instruction, before the root closes or after
  it, are left alone, and a root those tags do not close is `XML_PARSE_FAILED`.
  - **What to change:** nothing.
- **A text with a control character no longer makes a document that cannot be read.** The control characters XML 1.0
  forbids (U+0000 to U+001F but the tab, the line feed and the carriage return) were written as they came, and a name
  with one was stamped and signed into a file the SII's schemas, and any parser that follows XML 1.0, refuse.
  `sanitizeText` drops them, as it drops the characters outside ISO-8859-1, and so does the writer of every document,
  book and answer, for the texts that are written as they are given: a code of a line, the folio of a reference, the
  note of a payment.
  - **What to change:** nothing.
- **`verifyDocumentSignature` reads the signed element from the elements of the `DTE`.** It chose between `Documento`
  and `Liquidacion` by searching the text, so a signed invoice with a comment that named the other one did not verify,
  though a comment is no part of what a signature covers.
  - **What to change:** nothing.

## [0.14.0] - 2026-11-16

### Added

- **The printed sample prints four fields Formato DTE 2.5 asks for.** The format's print column (section 2.2, column
  I) marks them to be printed and the sample left them out: the payment terms, in words (`FmaPago`, page 14), the due
  date (`FchVenc`, page 16), the additional description of an item (`DscItem`, page 37) and the special credit of
  construction companies (`CredEC`, page 31). `createDocument` already wrote the first three, from `paymentTerms`,
  `dueDate` and an item's `description`, and they never reached the paper. Now `Forma de Pago` and `Fecha Vencimiento`
  print on a line under the issue date, the description under the item's name, wrapped in its column, and the credit
  among the totals with a minus, since the total takes it off; on the sheet and on the roll. `parsePrintableDocuments`
  reads them into `paymentTerms`, `dueDate`, an item's `description` and `totals.constructionCredit`. A document
  without them prints as before.
  - **What to change:** nothing.
- **The printed sample prints the rest of the format's print column.** Formato DTE 2.5 marks more fields `I` (to be
  printed) or `P` (to be printed in words), and the sample left them out. Now, when the document has them, on the
  sheet and on the roll: under the issue date, flowed on as many lines as they need, the payment medium and the kind
  of account in words, the account number and the bank (`MedioPago`, `TpoCtaPago`, `NumCtaPago`, `BcoPago`, page 15),
  the description of the terms of payment (`TermPagoGlosa`, page 16), the amount paid and the balance owed
  (`MntCancel`, `SaldoInsol`) and each scheduled payment (`MntPagos`, page 15); under the receiver, the kind of
  special invoice (`TipoFactEsp`, `1 - Factura Turista`, page 16), who issues a guide for export in words and the
  resolution that authorises them (`CdgTraslado`, `FolioAut`, `FchAut`, page 18), the principal (`RUTMandante`, page
  19) and whoever asked for the invoice (`RUTSolicita`, page 22), both with dots; in the receiver's box, the document
  of a foreign receiver (`TipoDocID` in words and `NumId`, as `Identificación: Pasaporte N° …`, pages 19 and 20);
  among the totals, the base of the slaughter of meat, the base of the margins of trade (`MntBase`, `MntMargenCom`,
  page 29) and the deposit guarantee of containers (`GrntDep`, page 31), and under them the totals in another
  currency (`OtraMoneda`, pages 33 to 35), each tax by the name of its code; under an item, its surcharge
  (`RecargoMonto`, page 41), the bases and the price to the final consumer of a withholding agent (`MntBaseFaena`,
  `MntMargComer`, `PrcConsFinal`, page 37) and its value in another currency (`MontoItemOtrMnda`, page 40); and a
  global discount or surcharge with its description (`GlosaDR`, page 44) and its value in another currency
  (`ValorDROtrMnda`). A receipt's payment medium prints by the names of its own format (`1` is `Efectivo`). Every
  amount is the one the document carries. `parsePrintableDocuments` reads them into `settledAmount`,
  `outstandingBalance`, `payments` (`PrintablePayment`), `paymentMedium`, `paymentAccountType`,
  `paymentAccountNumber`, `paymentBank`, `paymentTermsNote`, `specialInvoiceType`, `exceptionalTransferCode`,
  `authorizationFolio`, `authorizationDate`, `principalRut`, `requesterRut`, the receiver's `foreignId` and
  `foreignIdType` (`PrintableReceiver`), `totals.slaughterBase`, `totals.marginBase`, `totals.depositGuarantee`,
  `otherCurrency` (`PrintableOtherCurrency`), an item's `surchargeAmount`, `surchargePercent`, `slaughterBase`,
  `marginBase`, `finalConsumerPrice`, `otherCurrency` and `otherCurrencyAmount`, and an adjustment's `description`
  and `otherCurrencyValue`. A document without them prints as before. The customs area (`Aduana`) and the fields of
  export documents (110 to 112) are not printed yet.
  - **What to change:** nothing.
- **The printed sample says more, in words.** Who dispatches the goods prints under the receiver (`TipoDespacho`, as
  `Tipo de Despacho: 2 - Por cuenta del emisor a instalaciones del cliente`), the city of the issuer and of the
  receiver print when they are not the commune again (`CiudadOrigen`, `CiudadRecep`), a reference says what the
  document does to the referenced one before its reason (`CodRef`: `Anula documento de referencia`, `Corrige texto
  documento de referencia`, `Corrige montos`), and the total is written out under the totals (`Son: setenta y seis
  mil setecientos sesenta y cinco pesos`). `parsePrintableDocuments` reads `dispatchType`, the `city` of each party
  and a reference's `code`.
  - **What to change:** nothing.
- **`parsePrintableDocuments` takes the bytes of a file.** Besides a text it now takes a `Uint8Array`, and so does the
  `xml` of an envelope of `renderPrintedSamples`. The bytes are read as UTF-8 when they are UTF-8, with a byte order
  mark dropped, and as ISO-8859-1 otherwise, whatever the declaration says: the SII's documents declare ISO-8859-1 and
  a file may hold them in either encoding. A document received from a third party can be printed straight from its
  file.
  - **What to change:** nothing; `parsePrintableDocuments(await readFile(path))` now works without decoding first.

### Changed

- **The stamp of a file changed after it was signed is printed as it was signed.** The PDF417 must carry the `DD` its
  `FRMT` covers. `parsePrintableDocuments` copied each `TED` from the text as written, so a file some tool had indented
  after signing printed a stamp with the indentation inside, which the signature does not cover. Now the form is the
  one the issuer's signature verifies, checked with the key of the CAF the stamp carries: the `TED` as written; then
  without the whitespace between its tags; then with its `DD` written again from its element, for a file written
  again with other escapes. A stamp signed with whitespace between its tags therefore stays as it is, and one no form
  of which verifies stays as written. Only the stamp of each document is checked, and one whose key is larger than any
  CAF key (a modulus over 4096 bits or an exponent over 32 bits) is left as written without its signature being
  tried, so a file from anyone cannot make the check costly. `tedXml` of a document the SDK issued is the same as
  before.
  - **What to change:** nothing.
- **A document without a `TED` says so on its print.** It printed like any other, only without the stamp, and could
  pass for a stamped one. Now a box where the stamp goes reads `SIN TIMBRE ELECTRÓNICO`, with the legend `Documento
  sin validez tributaria`, on the sheet and on the roll. A receipt printed with `stamp: false` carries no such
  notice: it has its `TED` and leaves the printed stamp out, as Res. Ex. SII N° 207 of 2025 allows.
  - **What to change:** nothing.
- **Dates, the receiver's RUT and referenced documents print to be read.** The issue date prints with its month in
  words (`Fecha Emisión: 15 de noviembre de 2026`, where it read `2026-11-15`), as Formato DTE 2.5 suggests for a
  printed date (section 2.2), and so does the due date; a date not written `YYYY-MM-DD` prints as written. The
  receiver's RUT prints with dots on the sheet (`12.345.678-5`), as the roll and the issuer's already did. A
  referenced document that is not a DTE prints by the name the SII gives its code (`Orden de Compra`, `Factura`,
  from `REFERENCE_DOCUMENT_TYPES`) where it read `Tipo 801`; a code with no name still prints `Tipo` and the code. A
  reference's name and its reason wrap inside their columns, and its row grows with them, where a long one ran over
  the next column.
  - **What to change:** nothing, unless you compare the text of a sample: those three read differently.
- **Size:** `dte-sdk/pdf` grows from 14.89 kB to 17.7 kB, over its 16 kB limit, which goes to 18 kB: it now holds the
  words of an amount and the names of the documents a reference can name, and reaches the helpers that check a stamp's
  signature. The rest of the print column takes it on to 19.03 kB, over that 18 kB limit, which goes to 20 kB: it
  holds the names of the payment media, the kinds of account, the special invoices, the documents of a tourist and the
  issuers of a guide for export. The bound on the key, shared by every check in place of the one the printed stamp
  carried, then takes `dte-sdk` from 39.46 kB to 39.52 kB, `dte-sdk/node` from 7.4 kB to 7.38 kB, `dte-sdk/portal` from
  80.33 kB to 80.32 kB and `dte-sdk/pdf` from 19.03 kB to 19.07 kB, all under their limits. Reading a code's name among
  a table's own entries then takes `dte-sdk/pdf` to 19.04 kB.

### Fixed

- **Quantities and unit prices print the Chilean way, with every decimal.** A quantity printed as JavaScript writes
  it (`1051.5`) beside amounts with a point between the thousands, and a unit price lost its decimals past the third.
  Both now print with a point between the thousands, a comma before the decimals and up to the six decimals the
  format admits (`1.051,5`, `$10.412,125`).
- **`writePrintedSamples` reads a file written in ISO-8859-1.** It read every file as UTF-8, which is how the
  certification store writes its envelopes, so a document received from a third party, written in the ISO-8859-1 it
  declares, failed with `ENCODING_UNSUPPORTED_CHAR` or `PDF_RENDER_FAILED` at its first accented letter. It now hands
  the bytes to `parsePrintableDocuments`, which reads both.
- **A document whose code is the name of a property every object has prints.** The printed sample looks a code up in
  a table of names, and a table is an object: a received document whose `TipoImp`, `MedioPago` or `TpoCtaPago` was
  `constructor`, `toString` or the like took that property for the code's name, and `renderPrintedSample` failed with
  `PDF_RENDER_FAILED`. No valid document carries such a code, but a received one may. A name is now read among a
  table's own entries only, so such a code prints as any code no table names: `Impuesto o retención constructor`,
  `Medio de Pago: constructor`. A tax's code failed so since 0.13.0; the payment medium and the kind of account,
  since they first printed, which no release carries.

### Security

- **The key a received document names is bounded before a signature is checked with it.** `verifyReceivedDocuments`
  checks the stamp of each document with the key of the CAF the stamp carries, and its signature with the key of the
  certificate it carries, and the cost of that check grows with the key: a document whose stamp named a modulus and an
  exponent of 16 384 bits took 45 seconds to verify, against 4 ms for a real one. `rsaSha1VerifyBase64`, which every
  check goes through, now returns `false` without trying the signature for a modulus over 512 bytes (4096 bits) or an
  exponent over 4 bytes (32 bits), the bytes counted as decoded, leading zeros included. A CAF key is 512 to 1024 bits
  with exponent 3 or 65537 and a certificate key at most 4096 bits, so no real key reaches the bound; a document that
  names a larger one fails that check (`signatureValid: false`), in a few milliseconds.
  - **What to change:** nothing.

## [0.13.0] - 2026-11-14

### Added

- **The SII's tables of additional taxes, payment media and reference documents.** Every issuer picks from them.
  `ADDITIONAL_TAXES` holds, by code, the 40 codes `TipoImp` and `CodImpAdic` take (Formato DTE 2.5, section 4, pages
  51 to 54: its 33 rows and the 7 codes of total withholding of its second column), each with its name as the SII
  writes it, its `kind` (`additional`, `specific`, `margin`, `advance` or `withholding`, in the words of `MntTotal`),
  the `rate` the table gives, the electronic `documents` it applies to and the `totalWithholdingCode` that takes its
  place when the buyer withholds the whole VAT; `isAdditionalTaxCode` is its guard. The schema's `ImpAdicDTEType` also
  admits 16, 40, 54 and 55, which the table does not describe, so they are left out. `PAYMENT_MEDIA` holds the seven
  `MedioPago` codes (page 15) and `RECEIPT_PAYMENT_MEDIA` a receipt's, `'1'` to `'5'` as `paymentMedium` carries them
  (Formato Boletas Electrónicas 4.2, page 9), with `isPaymentMedium` and `isReceiptPaymentMedium`.
  `REFERENCE_DOCUMENT_TYPES` names the 42 numeric codes a `TpoDocRef` can take: the 39 of its field (page 45) and 821
  to 823, which the change log of 2021-09-14 added (page 3); `RECEIPT_REFERENCE_DOCUMENT_TYPES` holds the 11 of a
  receipt (page 18), and `isReferenceDocumentType` and `isReceiptReferenceDocumentType` are their guards. An
  alphabetic `TpoDocRef`, `SET` among them, is not checked by the SII and stays free. The tables are data: no check of
  `createDocument` changes. The units of measure get no table, since `UnmdItem` and `UnmdRef` are free text the SII
  does not check outside exports. `dte-sdk` grows from 37.66 kB to 38.87 kB, over its 38 kB limit, which goes to
  40 kB.
  - **What to change:** nothing.
- **A new entry point, `dte-sdk/catalogs`, with the SII's business activities.** The SII's large code tables get an
  entry of their own, so that only who imports them pays for them; the root does not grow. Its first table is the
  list of economic activity codes an issuer writes in `Acteco`: `BUSINESS_ACTIVITIES` holds its 674 codes, sorted
  (sii.cl, "Códigos de Actividad Económica", read on 2026-11-14), each with its `name` and the list's three columns as
  the SII writes them: `subjectToVat` ("Afecto a IVA": `SI`, `NO` or `G`), `taxCategory` ("Categoría Tributaria": `1`,
  `2` or `G`) and `availableOnline` ("Disponible Internet"; the two rows that write `S` read as true). `G` is, in the
  list's glossary, a category and a VAT decided by the activity's own characteristics. `businessActivity(code)` looks
  an activity up and `isBusinessActivityCode` is its guard; a code the list writes with a leading zero, such as
  `011101`, is the number 11101. Like the root, the entry runs anywhere, names no `node:` module and bundles for the
  browser. It is 10.65 kB, under a limit of 12 kB; the other entries do not move.
  - **What to change:** nothing. Import `dte-sdk/catalogs` for the business activities.
- **A printed sample of several pages.** A document taller than the 33 cm of the sheet lost what fell past it; now
  `renderPrintedSample` goes on to further pages, 21.5 cm wide. Every page repeats the issuer, the type box and the SII
  office, and is numbered under the office (`Página 1 de 2`); the date, the receiver and the transport area print on the
  first page only; a table that breaks, the detail or the documents it refers to, repeats its column head on the next
  page; and the totals, the acknowledgement box, the stamp and the `CEDIBLE` mark go on the last page, which takes at
  least the last detail line with them. Every page but the last is 33 cm tall and the last is as tall as its content,
  between 11 and 33 cm, so the stamp stays at the bottom of the document, where the printed-samples manual puts it. A
  document that fits one page prints as before, with no page number, and `paper: 'roll'` keeps its one page with no
  cap. Formato DTE 2.5 admits in a document only the lines one sheet can print (page 36), and the manual's upload takes
  one page per sample, so a document that needs a second page is better split, and a certification sample must fit
  one; the pages keep a longer document whole on paper instead of cutting it. `dte-sdk/pdf` grows from 13.2 kB to
  13.72 kB, under its 14 kB limit.
  - **What to change:** nothing.
- **The commissions of a settlement invoice, and the withholdings, on the printed sample.** A document that carries
  commissions and other charges, a settlement invoice (43) or a purchase invoice (46) and the notes that correct one,
  now lists them under the detail, on the sheet and on the roll, each with its description, rate and net, exempt and
  VAT values, as Formato DTE 2.5 asks to print them (section F), and its totals take off the net, exempt and VAT
  commissions. The totals also print every additional tax or withholding of `ImptoReten`, by the name Formato DTE 2.5
  gives its code (section 4) and with its rate, and the VAT not withheld (`IVANoRet`); a VAT withholding prints with
  a minus, so a purchase invoice shows its withheld VAT taken off the total, as the change of subject example of the
  printed-samples manual does. A label too long for its cell goes on over more lines. Every amount is the one the
  document carries, never worked out again. `parsePrintableDocuments` reads them into `commissions`
  (`PrintableCommission`), `withholdings` (`PrintableWithholding`) and four new fields of the totals, and a document
  without them prints as before. `dte-sdk/pdf` grows from 13.72 kB to 14.89 kB, over its 14 kB limit, which goes to
  16 kB.
  - **What to change:** nothing.
- **The certification runner issues the settlement set.** Res. Ex. SII N° 108 of 2005 asks an issuer of settlement
  invoices (43) for technical tests of their own, and the SII hands them out as one more set of the test set, `SET
  LIQUIDACION FACTURA`. `parseTestSetText` recognized it and `planCertificationSets` left it out, so it was never
  issued or declared. Now a settlement set is read by its two tables: each item of `ITEM  CANTIDAD  TOTAL LINEA` with
  its quantity and its line total, sign included (`TestCaseItem.lineTotal`), and each row of `COMISIONES Y OTROS
  CARGOS` in the new `TestCase.commissions`; the cases of every other set read as before, without either field.
  `planCertificationSets` plans it in `settlement` (`SettlementSetPlan`): one settlement invoice per case, each item a
  line with its quantity and its total as the amount, the type of the settled document (`TpoDocLiq`) from the item
  name read without accents (`ANTICIPO` is 99; an invoice, a credit or debit note, a receipt or an earlier settlement
  is its electronic code when the name says electronic and its paper code when it does not; any other name is 99, the
  code Formato DTE gives to "otras transacciones"), exempt when the name starts with `EXENTO`, and each charge a
  commission (`COMISION` in its name) or another charge, with its total as the exempt value when its name starts with
  `EXENTO` and as the net value otherwise. `issueTestSet` issues every case of the set in one envelope, each with the
  `SET` reference, to the run's receiver, with its commissions taken off the total and their VAT rounded
  once over their net total, as the SII's validation 38 asks. The runner sends it after the other four, as
  `sets-prueba/envio-set-liquidacion.xml`, asks for its folios of type 43 with theirs, declares its track id with the
  sets and again with the books, and waits for its approval: `readProgress` reads the state of its row in
  `states.settlement`, and a declaration answer names its objections as `settlement`. The set is planned only when the
  text holds it, and it holds it only when it was asked for on download (`optionalSets: [...DEFAULT_OPTIONAL_SETS,
  'SET84']`), so a run with the default sets is unchanged. The SII hands the set out company by company and none is
  public: the grammar rests on synthetic sets, and the checkbox `SET84` and the label of the row on the progress page
  are not measured. The simulation does not re-issue the settlement invoices, `readPrintedSamples` files their
  envelope with the simulation's, and the printed sample of a 43 has no commissions yet. `dte-sdk/portal` grows from
  79.02 kB to 79.64 kB, under its limit.
  - **What to change:** nothing for a run with the default sets. A run that already asked for `SET84` now issues,
    declares and awaits the settlement set where it used to download it and leave it. The new keys widen some types:
    `CertificationState.sets` and `sendTestSet` take a `SentSetKey` (the four of `SetKey` and `'settlement'`), as does
    the `set` of the `SET_START`, `SET_OK` and `SET_ERROR` events, and `IssuableSetPlan` and `IssuedSet.kind` take the
    settlement plan; an exhaustive `switch` over any of them needs the `settlement` case.
- **`Document.warnings`: what the SII accepts with an objection.** `createDocument` builds a document the SII
  accepts with an objection (a "reparo") and lists, in the new optional `warnings`, the validations of the SII's
  "Nuevas validaciones a la IECV, DTE y DJ 3327 y 3328" that object to it: 10, a total of zero on an invoice, an exempt
  invoice, a settlement invoice or a purchase invoice (33, 34, 43, 46), and 12, a net amount of zero on a 33, 43 or
  46, both in the purchase book of the one who books it; 56, an invoice (33) whose net amount is not above zero. Each
  is `{ validation, field }`, with the field of the totals it is about. The list is absent when there is nothing, is
  never written to the XML, and travels to the stamped and the signed document. The new `DocumentWarning` type names
  it.
  - **What to change:** nothing. Read `warnings` to tell the receiver of a settlement invoice that settles nothing,
    for example.

### Changed

- **`createDocument` requires `issuer.activityCode` on every type but a receipt.** Every root of `DTE_v10.xsd`
  (`Documento`, `Liquidacion`, `Exportaciones`) requires one to four `Acteco`, a positive integer of at most six digits,
  and Formato DTE 2.5 (field 37) marks it as required on every type; an issuer without it was written without the
  element, and the SII's schema rejected the whole envelope. It now throws `MISSING_FIELD` with `issuer.activityCode`
  in `details.field` on a 33, 34, 43, 46, 52, 56 or 61, and `INVALID_OPTION` for one that is not a positive integer of
  at most six digits. A receipt (39, 41) has no element for it: it is still optional there, and left out of the XML.
  In the same way, an informative subtotal needs its `description` on every type but a receipt, since `DTE_v10.xsd`
  requires `GlosaSTI` and `EnvioBOLETA_v11.xsd` leaves it optional (`MISSING_FIELD`, `subtotals[i].description`); the
  description is now sanitized and held to its 40 characters (`FIELD_TOO_LONG`) on every type, as the other texts are.
  - **What to change:** give the issuer of every invoice, exempt invoice, settlement invoice, purchase invoice,
    dispatch guide and note its `activityCode`, the SII's code of the activity of the transaction (`fetchIssuerProfile`
    of `dte-sdk/portal` reads the first one as `activityCode`), and every informative subtotal of those types its
    `description`. An issuer used only for receipts needs neither.
- **`createDocument` refuses before stamping what the SII rejects in a document's content.** The SII rejects these
  documents after their folio is spent, and some of them take the whole envelope down with them. They now throw
  before anything is stamped, each with the field in `details.field`, and each check stops at the first fault:
  - more than 60 `items` on any type but a receipt, and more than 1,000 on a receipt, as `Detalle` admits in each root
    of `DTE_v10.xsd` and in `EnvioBOLETA_v11.xsd`: `INVALID_OPTION` (`items`). Only a 43 was held to the 60 before;
  - a line amount that is not a whole number, or that is below zero on any type but a settlement invoice (43), since
    `MontoItem` is a whole number from zero up in `Documento` and in a receipt: `INVALID_AMOUNT` (`items[i].amount`).
    A line discount above 100 % gave one;
  - over the totals, worked out or given: a net amount, an exempt amount, a VAT or a total that is not a whole number,
    or is below zero on any type but a 43 (`INVALID_AMOUNT`); an invoice (33) without VAT, which validation 55 of the
    SII's "Nuevas validaciones a la IECV, DTE y DJ 3327 y 3328" rejects (`MISSING_FIELD`, `totals.vatAmount`); an
    exempt invoice (34) without an exempt amount above zero, or with a net amount or a VAT other than zero, which
    validation 57 rejects (`MISSING_FIELD` or `INVALID_AMOUNT`, `totals.exemptAmount`, `totals.netAmount` or
    `totals.vatAmount`);
  - a `totals.totalAmount` that is not the net amount, the exempt amount and the VAT, less the VAT withheld (code 15)
    and the commissions and other charges with their VAT (Formato DTE 2.5, field 124), and a `totals.periodAmount`
    that is not the total plus the non-billable amount (field 126): the new `TOTAL_MISMATCH`, with `expected` and
    `actual`. A total whose totals carry a tax code other than 15 is not checked, because which of those codes add to
    the total and which come off it waits for the catalog of additional taxes.
  - **What to change:** an invoice whose lines are all exempt is an exempt invoice (34). Totals given by hand have to
    add up. A global amount discount on an exempt invoice needs `exemptIndicator: 1`: without it the discount was
    taken from the affected amounts, of which the invoice has none, and the total came out below the exempt amount.
- **A receipt (39) issued without `pricesIncludeVat` carries `IndMntNeto` 2.** Its totals were worked out from net
  lines, and without the indicator Formato de Boletas 4.2 (`IdDoc`, field 6) reads a receipt's lines as VAT included.
  `createDocument` now sets `options.netAmountsIndicator: 2` on a 39 whose totals carry a net amount and whose prices
  do not include VAT, as it sets `MntBruto` on an invoice whose prices do. An exempt receipt (41) gets none, since the
  indicator does not apply to it.
  - **What to change:** nothing. A receipt whose prices include VAT needs `pricesIncludeVat: true`, as before.
- **`createEnvelope` refuses more documents than an envelope admits.** `SetDTE` holds at most 2,000 documents in
  `EnvioDTE_v10.xsd` and 500 in `EnvioBOLETA_v11.xsd`; more now throw `INVALID_OPTION` with `documents` in
  `details.field` and the kind in `details.kind`. Each kind admits as many types as its 20 and 2 `SubTotDTE`, or
  fewer, so the count of types needs no check.
  - **What to change:** split a larger batch into several envelopes.
- **Size:** the content rules took `dte-sdk` from 38.95 kB to 39.47 kB, under its limit, and `dte-sdk/portal` from
  79.83 kB to 80.36 kB, over its 80 kB limit, which goes to 82 kB; the new error code took `dte-sdk/node` from 7.36 kB
  to 7.37 kB.
- **In production, `unstable_replenishFolios` downloads again only a range stamped today.** Its first step downloads
  again the ranges the SII already authorized and nobody holds, which spends no quota. A company holds what it
  declares in `cafs`, so in production a range missing from them may be one another system of the company issues
  with, and a second copy of its CAF would repeat its folios, which the SII rejects. Since 0.12.0 such a range is not
  annulled when it was stamped before the last day; it was still downloaded and issued with. Now, in production, the
  step reaches the ranges stamped today, counted in Chile, which is where a grant that never arrived is, and leaves
  the others alone. They come back in a new field of the report, `outsideWindow`, each with its first and last folio
  and the day it was stamped, or null when the list gives no day to read; a range with no day is never taken.
  `reobtainWithinDays`, new, sets how many days back the step reaches in either environment; certification has no
  limit, as before. A request the SII may have granted without handing it over is still settled in the same run.
  `ReobtainableRange` gains `date`, the day the listing gives for the range.
  - **What to change:** nothing in certification. In production, read `outsideWindow`: add to `cafs` the CAF of a
    range another system holds, or pass `reobtainWithinDays` to take the ranges nobody else issues with. A
    `ReplenishmentReport` built by hand needs `outsideWindow`, and a `ReobtainableRange` needs `date`.
- **Size:** this change and the fix below took `dte-sdk` from 38.87 kB to 38.95 kB and `dte-sdk/portal` from 79.03 kB
  to 79.27 kB, both under their limits.

### Fixed

- **`withinDays` of an annulment counts the days in Chile.** `annulFolios` read the day a range was stamped as a day
  in UTC, so late in the day in Chile, when UTC is already in the next one, a range stamped that same day was more
  than a day old: from 21:00, or 20:00 in winter, `withinDays: 1` reached no range at all, and 1 is what
  `unstable_replenishFolios` uses in production since 0.12.0. A day now counts from its start in Chile, so 1 is today
  at any hour. The error only left ranges out: nothing was annulled that should not have been.
  - **What to change:** nothing.


## [0.12.0] - 2026-11-14

### Added

- **A receipt on continuous paper, with the printed stamp as an option.** `renderPrintedSample` takes `paper: 'roll'`
  to print the continuous paper the printed-samples manual allows (its "papel continuo", the format of a point of sale
  printer) instead of the sheet: a page 80 mm wide, above the manual's least width of 7.5 cm, with the 0.5 cm border,
  as tall as its content with no cap, in the order the manual gives for the format: the type box centred with its RUT,
  type and folio, the SII office, the issuer, the receiver when the document has one, the date, the documents it
  refers to, the detail, the totals, the acknowledgement box and the destination mark of a transferable copy, and the
  stamp 7 cm wide with its legends, at the manual's minimum sizes (10 pt in the box, 7 pt in the legends). Every type
  admits it, as the manual does not limit the format to any. The default is `paper: 'sheet'`, the sample is unchanged,
  and `renderPrintedSamples` and `writePrintedSamples` still produce the sheet. `stamp: false` leaves the electronic
  stamp and its legends out of a receipt, 39 or 41, on the sheet or on the roll, since the printed stamp is optional
  from 1 January 2026 (Res. Ex. SII N° 207 of 2025) and the XML keeps its `TED`; on any other type, and for a value
  that is not a boolean, it throws `INVALID_OPTION`, as does a `paper` that is neither `'sheet'` nor `'roll'`. Res. Ex.
  SII N° 53 of 2025 allows delivering the receipt virtually, which stays with the application. `dte-sdk/pdf` grows
  from 11.47 kB to 13.2 kB, and its size limit from 12 kB to 14 kB.
  - **What to change:** nothing. Pass `paper: 'roll'` for the ticket and `stamp: false` for a receipt without the
    printed stamp.
- **Answers to a received envelope, document by document.** Every company that receives an `EnvioDTE` answers it, and
  now a receiver in production can. `createReceptionAnswer` builds the `RespuestaDTE` with the `RecepcionEnvio` and a
  `RecepcionDTE` for each document, `createResultAnswer` the `RespuestaDTE` with the `ResultadoDTE` of the commercial
  result, and `createGoodsReceipts` the `EnvioRecibos` of Ley 19.983; each is signed, takes the envelope as received
  (or read with the new `readReceivedEnvelope`) and works on its own. The envelope is read the way
  `verifyReceivedDocuments` reads it, strictly and from the same elements, so the documents answered are the documents
  verified: an `EnvioDTE` or `EnvioBOLETA` with no DOCTYPE, one `SetDTE` with every `DTE` directly inside it, and each
  document giving its own type, folio, issue date, issuer, receiver and total. Nothing is taken from the cover and no
  number is converted: a document that lacks one of them, or whose type, folio or total is not a whole number written
  in digits, refuses the envelope with `XML_PARSE_FAILED` (`details.field` names the element and `details.index` the
  document). The caller decides each document through a function of the document and its position, or a record keyed
  by `documentKey` (`'33:1234'`), choosing its state and its gloss, and a `null` leaves the document out. A record
  names a document by its type and folio alone, so it is refused with `INVALID_OPTION` (`details.key` names the key)
  for an envelope where two documents share them, which the function decides by their position, and when one of its
  keys names no document of the envelope, so a mistyped key never drops its decision. Only the reception answer has
  defaults, which follow the format of the SII: a document addressed to another RUT than the company's is
  `EstadoRecepDTE` 3 ("DTE No Recibido - Error en RUT Receptor") and any other is received (0). The commercial result
  and the receipts have none, because accepting a document and acknowledging its goods have legal effect under Ley
  19.983: `documents` is required in `createResultAnswer` and in `createGoodsReceipts` (`INVALID_OPTION` without it),
  a document without a decision is left out, and nothing is accepted, rejected or receipted unless the caller says so;
  `documents: () => ({ state: 0 })` accepts every document and `documents: () => ({})` receipts every one. A rejection
  without a code writes `CodRchDsc` -1. `ENVELOPE_RECEPTION_STATES` (`EstadoRecepEnv`), `DOCUMENT_RECEPTION_STATES`
  (`EstadoRecepDTE`) and `COMMERCIAL_RESULT_STATES` (`EstadoDTE`) hold every code of the format with its gloss, and
  the states are typed unions (`EnvelopeReceptionState`, `DocumentReceptionState`, `CommercialResultState`). A state
  outside them, a gloss over 256 characters and a `CodRchDsc` that is not a negative integer of up to 3 digits are
  refused with `INVALID_OPTION` (`details.field` names it); the format defines no codes for `CodRchDsc`, so the caller
  picks them. All of it is in the root entry. `dte-sdk` grows from 35.51 kB to 37.27 kB, over its 36 kB limit, which
  went to 38 kB; `dte-sdk/portal` grows from 77.82 kB to 78.51 kB, and its limit from 78 kB to 80 kB.
  - **What to change:** nothing. `createExchangeAnswers` of `dte-sdk/portal` is now built on these answers and writes
    the same bytes as before; `parseExchangeSet` keeps its loose reading, for the set the SII itself serves in the
    certification.
  - **For who built from `canary` since these functions entered it** (they were in no release before this one):
    - `createResultAnswer` and `createGoodsReceipts` need `documents`. Before, without decisions the result accepted
      every document addressed to the company and rejected the rest, and the receipts covered the documents addressed
      to the company of the types 33, 34, 43, 46 and 52; with a record, the documents it did not name took those
      defaults too, so a record that rejected one document accepted the others. Now a document without a decision is
      left out of both, and a call without `documents` throws `INVALID_OPTION` (`details.field` `documents`). To
      accept or receipt a document, decide it. `createReceptionAnswer` keeps its defaults.
    - `readReceivedEnvelope`, and the three functions when they are given the text, read strictly. Before, the reading
      was the loose one of the certification's exchange: a document without a receiver, with an empty one or with two
      took the receiver of the cover, so it could pass for a document addressed to the company; a folio `12abc` read
      as 12 and `0x10` as 16; a `SetDTE` outside the root and a `DTE` nested in another were read, where the
      verification refuses them; and a settlement invoice (`Liquidacion`) read as a document of type 0. An envelope
      could be verified as one thing and answered as another. An envelope that cannot be read now throws where it was
      answered with zeros and empty fields: to reject it (`EstadoRecepEnv` 1 or 91), pass a `ReceivedEnvelope` built
      by hand with no documents. The roots `EnvioDTEB` and `EnvioDTETraslado`, the `TpoDoc`, `RutEmisor` and
      `RutRecep` tags of a document and an `ID` child as the id of the set are read by `parseExchangeSet` alone.
    - `documentKey` keeps its format, so no key changes. A record is now refused for an envelope where two documents
      share a type and a folio, whether they come from one issuer or from two and whether the record names that key or
      not; before, the two took the one decision. Decide such an envelope with the function. A record is refused too
      when one of its keys names no document of the envelope; before, the key was ignored, so a mistyped rejection was
      never sent. A record that held keys of other envelopes has to be cut down to the one it decides.
    - **Size:** on top of every change in this section, the strict reading and the checks on the decisions take
      `dte-sdk` from 37.62 kB to 37.66 kB and `dte-sdk/portal` from 78.98 kB to 79.02 kB, both under their limits.
- **`ProgressReport.text`, and the page of a rejected test set kept.** `readProgress` hands over the readable text of
  the progress page, up to 6000 characters, in a new `text` field. When that page rejects a set,
  `waitForTestSetsApproval` still returns the labels in `detail`, and now saves the text as the artefact
  `sets-prueba/avance-rechazo.txt`: what the SII writes around a label is the reason of the rejection, and it was gone
  once the page was, unless the HTTP capture was on.
  - **What to change:** nothing. A `ProgressReport` built by hand needs `text`.

### Changed

- **`createDocument` writes numbers with the decimals the schema holds.** `QtyItem`, `PrcItem`, `QtyRef` and `PrcRef`
  hold six decimals and `DescuentoPct`, `RecargoPct`, `TasaComision` and `ValorDR` two. A `quantity`, `unitPrice`,
  `referenceQuantity` or `referencePrice` is now rounded to six, and a `discountPercent`, a `surchargePercent`, the
  `value` of a global adjustment and the `rate` of a commission to two, before any amount is computed from them, so
  the amount of a line is the one of the numbers written. Before, the number went out as given: `0.1 + 0.2` was
  written `0.30000000000000004` and `100 / 3` as `33.333333333333336`, which `DTE_v10.xsd` and `EnvioBOLETA_v11.xsd`
  reject, and with the document the whole envelope. A number with more digits than its type holds (twelve before the
  point for a quantity or a price, three for a percentage, sixteen for an adjustment value) is refused with
  `INVALID_AMOUNT` and the path of the field. `unitPriceDecimals` still writes the price with fixed decimals.
  - **What to change:** nothing to issue. An amount worked out from a number with more decimals than the schema holds
    may differ by a peso or, with a percentage on a large base, by more: `discountPercent: 100 / 3` on 3 000 000 now
    discounts 999 900, the 33.33 % that is written, and not 1 000 000. Pass `amount`, or the exact percentage, to keep
    a figure.
- **A line with a price and no quantity is written with `QtyItem` 1, and so is every line of a dispatch guide.** The
  amount of a priced line was already computed with a quantity of 1, and the line went out with `PrcItem` and no
  `QtyItem`. It now carries the quantity it is computed with, on every type. A dispatch guide (52) gets it on a line
  with no price too, because Formato DTE 2.5 (field 15) marks `QtyItem` as required there. On any other type a line
  with no price gets no quantity of its own.
  - **What to change:** nothing. The XML of a priced line, or of a guide's line, that brought no quantity gains
    `<QtyItem>1</QtyItem>`.
- **Each VAT-affected line of a document that withholds the whole VAT carries additional tax code 15.** A purchase
  invoice (46), and a note with `withholdVat: true`, came out with `ImptoReten` code 15 in the totals and no
  `CodImpAdic` on the lines, while Formato DTE 2.5 (field 117) defines the withheld amount as the rate by the sum of
  the lines that carry the code. When `createDocument` works out totals that withhold the VAT, each line with no
  exempt indicator and no `additionalTaxCodes` of its own now gets `[15]`. A line that brings codes, an empty list
  included, keeps them, and so do the lines of a document whose `totals` the caller gave.
  - **What to change:** nothing if the lines already carried the code. To keep a line without it, give it
    `additionalTaxCodes: []`.
- **`createDocument` refuses an `issuer.siiBranchCode` that is not an integer from 1 to 999999999, and
  `createEnvelope` a `cover.resolutionNumber` that is not an integer from 0 to 999999.** Both throw `INVALID_OPTION`
  with the field. They were written as given, and a 0, a 1.5 or a `NaN` failed the schema at the SII. The books
  already checked both.
  - **What to change:** nothing for valid values. A certification envelope keeps its resolution number 0.
- **An upload is held to the cover of its file.** `uploadEnvelope`, `uploadBook` and `uploadFolioConsumption` send the
  company and the sender in the form, apart from the file, and take them from the call or the client. They now read
  the cover of the file (`RutEmisor`, or `RutEmisorLibro` in a book, and `RutEnvia`) and throw
  `INVALID_OPTION { field: 'companyRut' }` or `{ field: 'senderRut' }` when it names another, before anything is
  sent. A client set up for one company no longer uploads another company's file under the wrong RUT. A file with no
  cover to read is sent as before.
  - **What to change:** pass `companyRut` (and `senderRut`) on the call when the file is not the client's company's.
- **`createDirectoryCapture` goes on from the last capture and never writes over a file.** Its numbers started at 1
  with every adapter, so a run that was resumed, which is a new process, wrote over the first captures of the run
  before it while `index.jsonl` still pointed at them. The adapter now reads the directory once and goes on from the
  highest number its prefix already has there, and creates each file only if no file has its name: a name another
  process took meanwhile is left alone and the next number is used. `prefix` must be made of letters, digits, `_`, `.`
  and `-`, 40 at most, and anything else throws `INVALID_OPTION { field: 'prefix' }` when the adapter is created; it
  went into the file name as given, so one with `../` wrote outside the directory.
  - **What to change:** a `prefix` with other characters, a space included, needs replacing.
- **`findCafFiles`, `findLatestCafFile` and `resolveCafFile` leave out a CAF of the other environment.** A CAF names
  the SII key that signed it (`IDK`: 100 for certification, 300 for production). The three take an `environment`, new
  on the first two, and with it skip a CAF signed by the other environment's key; one of a key that is neither is
  kept. `resolveCafFile` used its `environment` for the registry scope alone, so in a folder that held the CAFs of
  both it could resolve a production CAF for certification, under a scope labelled certification.
  - **What to change:** nothing if each environment has its folder. `resolveCafFile` with `environment` no longer
    returns a CAF of the other one: it returns null when the folder holds no other.
- **`unstable_replenishFolios` annuls only ranges stamped in the last day in production.** Annulling cannot be undone,
  and a range stamped days ago may be one another system of the company holds and did not declare in `cafs`. The
  window stays at 180 days in certification, and the new `annulWithinDays` sets it in either. Annulling in production
  still needs `allowAnnul: true`.
  - **What to change:** pass `annulWithinDays` to reach further back in production.
- **A simulation that is tried again issues with the CAFs it already obtained.** `sendSimulation` asked for the
  folios of every type at each attempt, so an attempt that stamped some types and stopped before the upload left
  those folios stamped and unused, which is what makes the SII ration the next request. The CAFs obtained for the
  simulation are now kept in the state as `simulationCafs`, a new optional field, until an upload is tried with them:
  the next attempt issues with them and asks only for what is missing. Once the upload was tried they are spent, as
  the folios are, and a new attempt asks for new ones. The simulation still never issues with the sets' CAFs.
  `prepareFolios` with `fresh` follows the same rule.
  - **What to change:** nothing. A state saved by an earlier version has no `simulationCafs` and behaves as before.
- **Size:** these changes took `dte-sdk` from 37.27 kB to 37.62 kB, `dte-sdk/node` from 7.09 kB to 7.36 kB and
  `dte-sdk/portal` from 78.51 kB to 78.98 kB, all under their limits.

### Fixed

- **The reason of a stamping block stops at the SII's boilerplate when the page writes it with accents.**
  `portalMessage` of a `stampingBlocked` refusal, and `FolioQuota.portalMessage`, carried "Si necesita más
  información, comuníquese con la Mesa de Ayuda." after the reason: the cut looked for the sentence without accents,
  and the page text has them once its entities are decoded.

## [0.11.0] - 2026-11-14

### Added

- **The printed sample prints the transport area.** `renderPrintedSample` draws a box under the receiver, and under a
  guide's transfer type, with what the document's `Transporte` carries, in the order of Formato DTE 2.5: the plates of
  the vehicle and of the trailer, the carrier's RUT, the driver's name and RUT, the destination's address, commune and
  city, and the departure date and time and the arrival date, one line for each of those four groups. Formato 2.5
  marks every field of the area to be printed (column I, pages 22 to 24) but the destination city, which the sample
  prints when the document has it. A dispatch guide and an invoice that moves goods print the area alike; a field the
  document lacks is left out, a group too wide for its line flows onto the next, and the page grows by the box. Before,
  the sample printed a guide's transfer type and nothing of `Transporte`. `parsePrintableDocuments` reads the area
  into a new `transport` field of `PrintableDocument`, a `PrintableTransport` exported from `dte-sdk/pdf` with every
  field as written, and undefined when the document has no `Transporte`. `dte-sdk/pdf` grows from 10.98 kB to
  11.45 kB, and its size limit from 11 kB to 12 kB.
  - **What to change:** nothing. A sample of a document with `Transporte` now carries the area and is taller by it. A
    `PrintableDocument` built by hand prints the area once it is given `transport`.
- **`softwareProviderRut` on a receipt.** `DocumentInput` and `Header` gain `softwareProviderRut`, the receipt's
  `Encabezado/RUTProvSW`: the RUT of the company that provides the software the receipt is issued with, or the
  issuer's own when the software is its own (Formato de Boletas 4.2, field 30). `createDocument` checks it with
  rut.ts (`INVALID_RUT { field: 'softwareProviderRut' }`), the codec writes it between `Receptor` and `Totales`, where
  `EnvioBOLETA_v11.xsd` declares it, and `fromSiiDocument` reads it back. It is written only when given: the schema
  leaves it optional and nothing here works it out. Only a receipt declares it, so on any other type it throws
  `INVALID_OPTION { field: 'softwareProviderRut' }`.
  - **What to change:** nothing for receipts already issued. To carry the field, pass `softwareProviderRut` on a 39
    or a 41.

### Changed

- **`createDocument` refuses on a receipt (39, 41) what its schema does not declare.** `EnvioBOLETA_v11.xsd` gives a
  receipt a shape of its own, much shorter than the invoice's, and the codec built a receipt from the invoice's shape:
  whatever the input carried was written, and the SII rejected the envelope after the folio was spent. These now throw
  `INVALID_OPTION` with the field in `details.field`: `transport` (`Transporte`), `commissions` (`Comisiones`),
  `withholdVat: true` (`ImptoReten`); every field of `options` but the five a receipt's `IdDoc` declares, which leaves
  out `noDebitReduction` (`IndNoRebaja`), `dispatchType` (`TipoDespacho`), `transferType` (`IndTraslado`),
  `printFormat` (`TpoImpresion`), `grossAmounts` (`MntBruto`), `purchaseTransactionType` (`TpoTranCompra`),
  `saleTransactionType` (`TpoTranVenta`), `paymentTerms` (`FmaPago`), `exportPaymentTerms` (`FmaPagExp`),
  `settlementDate` (`FchCancel`), `settledAmount` (`MntCancel`), `outstandingBalance` (`SaldoInsol`), `payments`
  (`MntPagos`), `paymentAccountType` (`TpoCtaPago`), `paymentAccountNumber` (`NumCtaPago`), `paymentBank` (`BcoPago`),
  `paymentTermsCode` (`TermPagoCdg`), `paymentTermsNote` (`TermPagoGlosa`) and `paymentTermsDays` (`TermPagoDias`); in
  `totals`, `vatRate` (`TasaIVA`), `ownVatAmount` (`IVAProp`), `thirdPartyVatAmount` (`IVATerc`), `withholdings`
  (`ImptoReten`) and `commissions` (`Comisiones`); and on a line, `referenceQuantity` (`QtyRef`), `referenceUnit`
  (`UnmdRef`), `referencePrice` (`PrcRef`), `additionalTaxCodes` (`CodImpAdic`) and an `exemptIndicator` of 3, 4 or 5,
  since a receipt's `IndExe` admits 1, 2 and 6. An empty list is not refused. A receipt keeps the five options,
  `serviceIndicator`, `netAmountsIndicator`, `billingPeriod`, `dueDate` and `paymentMedium`, with its global discounts
  and surcharges, its informative subtotals and its own references.
  - **What to change:** remove those fields from a receipt. A receipt that wrote one of those elements failed the
    schema, so none the SII accepted changes. Two inputs wrote nothing and are refused all the same: `withholdVat: true`
    on a receipt with no VAT to withhold, and a key of `options` that is not one of its fields.
- **A receipt is written in the shape and the order of its own schema.** The receipt's `IdDoc` has `IndMntNeto` right
  after `IndServicio` and `FchVenc` before `MedioPago`; the codec wrote the invoice's order, so a receipt with net
  amounts and a period or a due date, or with a payment medium and a due date, failed the schema. `periodAmount` is now
  written as the receipt's `TotalPeriodo` (Formato de Boletas 4.2, field 37) and read back from it, where it used to be
  written as the invoice's `MontoPeriodo`, which a receipt does not declare. The issuer's `branch` is left out of a
  receipt, whose `Emisor` has no `Sucursal`, as its phone, e-mail, activity code and salesperson already were: the same
  issuer serves an invoice and a receipt. `toSiiDocument` writes nothing else under a receipt, also for a `Document`
  put together by hand. `SiiTotales` gains `TotalPeriodo` and `SiiEncabezado` gains `RUTProvSW`.
  - **What to change:** nothing to issue. Code that reads a receipt's XML or its `SiiDocumento` finds the period's
    total under `TotalPeriodo`, and no `Sucursal`.
- **`options.netAmountsIndicator` is a receipt's alone, and takes 2.** Only the schema of receipts declares
  `IndMntNeto`, with 2 as its one value. `createDocument` refused it on a settlement invoice; it now refuses it on
  every type but 39 and 41, and on a receipt refuses any value but 2, both with `INVALID_OPTION
  { field: 'options.netAmountsIndicator' }`. The codec no longer writes it under any other type. In the types it is
  `2` instead of `number`.
  - **What to change:** remove `netAmountsIndicator` from invoices, notes and guides, where it failed `DTE_v10.xsd`.
    On a receipt whose lines carry net amounts, pass `2`.

### Fixed

- **The printed sample of a receipt shows its line of business.** `parsePrintableDocuments` read the issuer's activity
  from `GiroEmis`, the invoice's tag, and a receipt names it `GiroEmisor`, so `issuer.activity` came back empty for a
  receipt and the sample printed no line of business. It now reads either.
  - **What to change:** nothing.

## [0.10.0] - 2026-11-13

### Added

- **The four transport fields of 2026.** `Transport` gains `trailerLicensePlate` (`PatenteCarro`), `departureDate`
  (`FchSalida`), `departureTime` (`HraSalida`) and `arrivalDate` (`FchLlegada`), the fields Formato DTE 2.5 adds to
  `Transporte` for Res. Ex. 144/2026, in force since November 1, 2026. `createDocument` writes them in the order of
  `DTE_v10.xsd`, the trailer plate after the vehicle's and the dates and time after the destination, and
  `fromSiiDocument` reads them back. Before stamping, the trailer plate is held to 8 characters (`FIELD_TOO_LONG`), the
  dates must be real days from 2003-04-01 to 2050-12-31, given as `YYYY-MM-DD`, `DD-MM-YYYY` or `DD/MM/YYYY`
  (`INVALID_DATE`), and the time `HH:MM:SS` or `HH:MM`, written with its seconds because the schema's `xs:time` asks
  for them (`INVALID_TIME`, a new code). All four are optional on every type, as the schema declares them: Formato 2.5
  marks them mandatory on a dispatch guide, while the resolution makes the departure time optional and lets what is
  unknown when issuing be completed by a later guide. The printed sample does not print the transport area yet.
  - **What to change:** nothing for documents already issued. A dispatch guide, or an invoice that moves goods, passes
    the new fields in `transport`. An exhaustive `switch` on `DteErrorCode` needs the `INVALID_TIME` case.
- **A settlement invoice (43) works out its totals.** `createDocument` now hands the commission lines to
  `calculateTotals`, which takes them in a new `commissions` option. The totals carry the summary of commissions and
  other charges (`Totales/Comisiones`), the net and the exempt value each the sum of its lines, and every value left
  out when zero, and the total is net + exempt + VAT less the three, as Formato DTE 2.5 defines `MntTotal` in field
  124. Before, the summary was only written from totals passed by hand, and the total worked out for a 43 ignored its
  commissions. On a 43 the net, the exempt amount, the VAT and the total keep their sign, so a settlement whose charges
  reach or exceed what it settles totals zero or less, and negative lines are totalled instead of dropped:
  `DTE_v10.xsd` declares those amounts, and the `MNT` of the stamp, as signed values under `Liquidacion`. A
  non-billable line of a 43 stays out of its totals, because `Liquidacion` has no `MontoNF`. The VAT of the summary is
  the VAT rate by the summary's net value, rounded once, which is what the SII checks on a settlement invoice
  (validation 38 of its "Nuevas validaciones a la IECV, DTE y DJ 3327 y 3328"); it can be a peso off the sum of the
  lines' VAT, which the Formato gives for field 123, and it is that sum when a line states its `vatValue`. The same
  applies to the commission lines of a purchase invoice (46) and of the notes that correct one.
  - **What to change:** nothing for a 43 issued with `totals` passed by hand: they are still written as given. A 43
    issued without `totals` now carries `Totales/Comisiones` and a `MntTotal` with the commissions taken off, where it
    used to carry net + VAT + exempt: drop any correction applied afterwards. A purchase invoice or a note with
    commission lines and no `totals` changes the same way.

### Changed

- **`createDocument` refuses an `options.transferType` outside 1 to 9.** Res. Ex. 144/2026 names three more transfer
  types, a transfer of more than one day as a sale or not and an outsourced transfer, but `DTE_v10.xsd` admits only 1 to
  9 in `IndTraslado`, and a document that carries another value fails it. `TRANSFER_TYPES` keeps them out until the
  schema admits them, and any other value now throws `INVALID_OPTION { field: 'options.transferType' }` before
  stamping, where it used to be written as given.
  - **What to change:** nothing in TypeScript, where `TransferType` already allowed only 1 to 9. A JavaScript caller
    that passed another value, a number written as text included, gets the error.
- **Commission lines are written the way the schema requires them.** `DTE_v10.xsd` asks every line of `Comisiones` for
  `ValComNeto` and `ValComExe`, and a line that brought only one of them was written without the other, which fails
  the schema. `createDocument` now writes the missing one as zero, refuses a line with neither (`MISSING_FIELD
  { field: 'commissions[i].netValue' }`), and refuses values that are not finite numbers (`INVALID_AMOUNT`) and more
  than the 20 lines the schema admits (`INVALID_OPTION { field: 'commissions' }`). A line without `vatValue` now
  carries its `ValComIVA`: its net value by the VAT rate, rounded half away from zero, and left out when that is zero.
  In the types, `netValue` and `exemptValue` are required numbers on `CommissionLine` and on `SiiComisiones`, and stay
  optional on `CommissionLineInput`.
  - **What to change:** a line that must carry no VAT passes `vatValue: 0`. If you pass `totals` by hand for a 43, the
    lines can now carry a `ValComIVA` you did not write: check that `totals.commissions.vatValue` is the VAT rate by
    `totals.commissions.netValue`, or drop `totals` and let `createDocument` work them out. Code that builds a
    `Document` or a `SiiDocumento` by hand gives every commission line both values.
- **`createDocument` refuses on a settlement invoice (43) what its root does not declare.** `DTE_v10.xsd` gives a 43 a
  root of its own, `Liquidacion`, which declares less than `Documento`, and the codec wrote under it whatever the input
  carried, so the SII rejected the document after its folio was spent. These now throw `INVALID_OPTION` with the field
  in `details.field`: `transport` (`Transporte`), `globalAdjustments` (`DscRcgGlobal`), a line's `discountPercent` or
  `surchargePercent` (`DescuentoPct`, `RecargoPct` and their amounts), a reference's `otherRut` (`RUTOtr`),
  `totals.nonBillableAmount` (`MontoNF`) and the options `noDebitReduction` (`IndNoRebaja`), `dispatchType`
  (`TipoDespacho`), `transferType` (`IndTraslado`), `printFormat` (`TpoImpresion`), `exportPaymentTerms`
  (`FmaPagExp`) and `netAmountsIndicator` (`IndMntNeto`). The receiver of a 43 needs its `businessActivity`
  (`GiroRecep`, `MISSING_FIELD`), and a 43 with more than 60 lines is refused (`INVALID_OPTION { field: 'items' }`).
  Commissions stay optional, as the schema declares them.
  - **What to change:** remove those fields from a 43, and give its receiver a `businessActivity`. A discount on a
    settled line goes into the line's `amount`.
- **`settledDocumentType` is refused on every type but the 43.** Only a line of `Liquidacion` declares `TpoDocLiq`;
  on an invoice, a note, a guide or a receipt it failed the schema. It now throws `INVALID_OPTION
  { field: 'items[i].settledDocumentType' }`.
  - **What to change:** pass `settledDocumentType` only on the lines of a 43.

### Fixed

- **`verifyReceivedDocuments` reads a negative total.** `MntTotal` and the `MNT` of the stamp were read as runs of
  digits, so a settlement invoice whose charges exceed what it settles came back with `totalAmount: null`, a
  `totalAmount` mismatch in its stamp and `status: 'invalid'`. Both are now read with their sign.
  - **What to change:** nothing.

## [0.9.1] - 2026-11-13

### Fixed

- **The published types compile without `@types/node-forge`.** The declarations of `crypto/rsa` and `crypto/x509`,
  which `dte-sdk`, `dte-sdk/node` and `dte-sdk/portal` reach, began with `import forge from 'node-forge'`, a package
  that ships no types of its own: a consumer on `strict` with `skipLibCheck: false` got TS7016, "Could not find a
  declaration file for module 'node-forge'", unless they installed `@types/node-forge` themselves. The three internal
  helpers whose signatures named it are now left out of the declarations, so no declaration file imports `node-forge`,
  and a test fails if one names a module that ships no types of its own. No exported name, signature or runtime code
  changes.
  - **What to change:** nothing. A project that added `@types/node-forge` only for this can drop it.

### Security

- **The runtime dependencies move past their published advisories.** `node-forge` goes from 1.4.2 to 1.4.3,
  `fast-xml-parser` from 5.11.2 to 5.12.0 and `rut.ts` from 5.0.0 to 5.1.2, still pinned to exact versions. Because
  they are exact, an app that installs 0.9.0 or older gets the affected versions until it upgrades, unless it sets
  `overrides` itself.
  - `node-forge` 1.4.3 fixes four moderate advisories: Ed25519 verification accepting small-order public keys
    ([GHSA-6889-vf6x-f3g5](https://github.com/advisories/GHSA-6889-vf6x-f3g5)), two crashes of its TLS client
    ([GHSA-w4xr-hqv8-ch44](https://github.com/advisories/GHSA-w4xr-hqv8-ch44),
    [GHSA-j8rw-jp99-435v](https://github.com/advisories/GHSA-j8rw-jp99-435v)) and a ReDoS in `forge.http`
    ([GHSA-6cv4-p8m7-4r25](https://github.com/advisories/GHSA-6cv4-p8m7-4r25)). dte-sdk calls none of them: it uses
    node-forge for PKCS#12, X.509, RSA and digests, and sends its requests through `fetch` or `node:https`. The release
    also enforces name constraints in `verifyCertificateChain`, which dte-sdk does not call either.
  - `fast-xml-parser` 5.12.0 fixes a low advisory, quadratic CPU time on an unterminated stop-node tag
    ([GHSA-474x-hrwr-fgx4](https://github.com/advisories/GHSA-474x-hrwr-fgx4)). dte-sdk sets no stop nodes. The other
    change, the offsets of `captureMetaData` on CRLF input, is an option dte-sdk does not set.
  - `rut.ts` 5.1.2 reads options only from the object passed, not from its prototype, and only `incremental: true`
    turns its incremental mode on. dte-sdk passes object literals and never asks for incremental mode, so every RUT
    reads and prints as before.
  - **What to change:** nothing. The dependencies stay external, so the package's own code is the same as in 0.9.0.

## [0.9.0] - 2026-11-12

### Added

- **Keeping folios stocked, unstable.** `unstable_replenishFolios(portal, { type, minimum, quantity, cafs,
  lastIssuedFolio, … })` in `dte-sdk/portal` is one call that asks the SII for folios only when the usable ones fall
  below `minimum`, in the order that does not make a block worse: ranges already authorized that nobody holds are
  downloaded again without spending quota, what is still missing is requested in batches within the quota, and unused
  folios are annulled as a last resort, in certification only unless `allowAnnul` says otherwise. Annulling never
  touches a CAF held or a range the run downloaded, runs only when the SII counts more unused folios than the ones in
  hand, and reaches only ranges stamped in the last 180 days. A run that ends short sets `coolUntil`, 15 minutes ahead
  after a refusal and an hour after a session limit or a firewall block. A request the SII may have granted without
  handing it over is settled in the same run by reading the listing again, and every request goes out a second after
  the one before. It stores nothing: the caller keeps the CAFs, in `onObtained` while the portal lock is still held,
  and passes `coolUntil` and `knownAnnulled` back. It is unstable because it has not run against the SII yet, in
  either environment: its shape may change in any release, and once it has run it becomes `replenishFolios`.
- **`planFolioReplenishment`**, the decision alone and with no I/O: `none`, `coolDown` or `replenish`, with `usable`,
  `expiredFolios` and a `reason` that is the cause, `expired` when the folios lost to expiry would have reached the
  minimum and otherwise `low` or `exhausted`.
- **`FolioQuota.portalMessage`**: `queryFolioQuota` hands over what the SII wrote when it blocks stamping, which it
  kept to itself.
  - **What to change:** nothing, unless a test compares a blocked quota whole: it has one more field.
- **`listReobtainableRanges` in `FolioFlowFailure['operation']`**, for a listing of ranges to download again that
  stops a flow.
  - **What to change:** an exhaustive `switch` on `operation` needs the case.

### Fixed

- **`requestCaf` keeps the CAF when the pause after it is cut short.** Each request is followed by a pause of a
  second, and a pause that failed, with the caller's abort for one, replaced the outcome of the request: the CAF the
  SII had just delivered was lost, or the refusal it had stated came back as `REQUEST_ABORTED`. The pause now takes
  nothing with it, in `requestCaf`, `requestCafExact` and `requestCafInBatches`; the next request meets the abort.

## [0.8.0] - 2026-11-11

### Changed

- **`receiverAnswer` reads a document paid in cash.** The SII registers `PAG` ("DTE Pagado al Contado") on a document
  issued as paid in cash as it receives it, and the registry then refuses any event on it, acceptance, claim or goods
  received, with code 27. `receiverAnswer` read `PAG` as changing nothing, so such a document read as `pending` with
  eight days to claim, and as `tacitlyAccepted` after them, inviting an answer the SII refuses. It now answers the new
  `paidInCash`, with `claimDeadline` null since nothing can be claimed; an annulment, a claim or an acceptance the
  registry holds still comes first. `receiverStatus` reads a last `PAG` as `paidInCash` too, where it said `unknown`.
  - **What to change:** `ReceiverAnswer` and `ReceiverStatus` gain `paidInCash`: an exhaustive `switch` on either
    needs the case. A caller that offers registry actions offers none on it, and one that shows `claimDeadline` meets
    null for it.
  - **Not covered yet:** the SII refuses a document issued as free (`Sin costo`) with the same code, but no events
    listing of one has been seen, so whether it carries `PAG` is not known; until then it reads as before.

### Added

- **Code 27 in `CLAIM_RESPONSE_CODES`**: "No se puede registrar un evento de un DTE pagado al contado o gratuito",
  the registry refusing an event on a document paid in cash or free, as production answered an acceptance on
  2026-11-11. `claimResponseMessage(27)` said "Código de respuesta desconocido: 27".

## [0.7.0] - 2026-11-10

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
- **`findCafFiles` can include expired CAFs, and says which are.** With `includeExpired: true` it also lists the files
  whose CAF has expired, so a caller can say why a file is not used; `CafFile` gains `expired`, true for those and
  false otherwise. `findLatestCafFile` and `resolveCafFile` never take an expired one, whatever the option says.
  - **What to change:** `CafFile` gains `expired` as a required field; a literal built by hand, as in a test double,
    needs `expired: false`.
- **`FolioStats.ranges` say which file and environment each count is for.** A registry keeps one entry per CAF file,
  by its range, environment and `cafFingerprint`, but the stats gave only the range, so two files of one range, or one
  range in both environments, could not be told apart. Each range now carries `environment` and `cafFingerprint`, null
  when its scope has none.
  - **What to change:** a `FolioRegistry` of one's own returns `stats` with both fields in each range.
- **`receiverAnswer` reads the `codResp` of the events query.** It took the events alone, so a query that failed (the
  SII's internal error, a company that may not consult the document, a wrong folio) gave no events and read as
  `pending`, and past the eight days as `tacitlyAccepted`: a document read as accepted by law because the SII did not
  answer. It now also takes the whole result of `listClaimEvents`; with no events and a `codResp` other than 15, 16 or
  18, the codes that list events or say there are none, the answer is the new `unknown`, as `receiverStatus` already
  reads it. Events, when the SII sent some, speak whatever the code.
  - **What to change:** pass the result of `listClaimEvents` whole rather than its `events`, which still works but
    cannot tell a failed query. `ReceiverAnswer` gains `unknown`: an exhaustive `switch` on it needs the case.
- **Size:** these changes took `dte-sdk` from 33.87 kB to 34.36 kB, over its 34 kB limit, which went to 36 kB.
  `dte-sdk/node` went to 7.09 kB, `dte-sdk/portal` to 74.90 kB and `dte-sdk/pdf` to 10.93 kB, under their limits.

### Added

- **`cafEnvironment(keyId)`**, from the root: the environment of the SII key a CAF names in its `IDK`,
  `certification` for 100 and `production` for 300, null for another. `verifyCafSignature` and
  `verifyReceivedDocuments` already read it; it was not exported.
- **`cafFileScope(file, environment)`**, in `dte-sdk/node`: the registry scope of a CAF file (its company, type and
  range, the environment, and the `cafFingerprint` of its text), the one `resolveCafFile` builds and returns. Anything
  with a CAF's text and the CAF parsed from it, such as the portal's `ObtainedCaf`, has one too, but it is the saved
  file's scope only when given the text the file holds: an app that rewrites a downloaded CAF before saving it, its
  declaration say, takes the scope from the text it saved.

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
  same answer are now one entry and one key in `annulled`, `rejected` and `knownAnnulled`, and a walk cut short at one
  folio (a block, an expired session) still returns the folios answered before it, with `failure`. A listed range is
  skipped when the keys of `knownAnnulled` cover all its folios, in one key or several, where only its exact key was.
  - **What to change:** nothing for a caller that reads keys as spans of folios; one that compared them with the
    listing's ranges one to one reads them as spans now.
- **`findCafFiles` reads each file in the encoding its XML declaration names.** It read every file as UTF-8, while the
  SII writes ISO-8859-1: a CAF saved as the SII served it, with an Ñ or an accent in the company's name, was read with
  replacement characters in `RS`, and every stamp made with its `<CAF>` block failed the SII's check. A file that
  declares ISO-8859-1 is now read as such, and one that declares UTF-8, or no encoding, as strict UTF-8; a file whose
  bytes are not the encoding it names, or that names another one, is skipped rather than misread. A UTF-8 byte order
  mark is dropped. `findLatestCafFile` and `resolveCafFile` follow.
  - **What to change:** a file with no declaration and ISO-8859-1 bytes is no longer found; declare its encoding, as
    the SII's file does, or save it as UTF-8.
  - **The registry scope of some files moves.** `cafFingerprint` hashes the text as read, so the scope
    `resolveCafFile` returns changes for a file saved with a UTF-8 byte order mark (the mark is no longer in the text)
    and for one declared ISO-8859-1 with bytes above 0x7F (read as Latin-1 now, where they were replacement
    characters). A folio registry entry kept under the old fingerprint no longer matches the file, and
    `resolveCafFile` would read its whole range as free, folios already used included. Before issuing from such a
    file again, move its entry to the new scope (`cafFileScope` of the file as now read), or re-save the file without
    the mark, or as UTF-8, and move the entry then. A file in plain UTF-8, or ASCII, keeps its fingerprint.
- **An empty `FRMA` is a CAF whose signature fails, not a CAF that is not one.** `verifyCafSignature` threw
  `CAF_INVALID` for a CAF whose `FRMA` was empty, as for one with no `FRMA` at all; it now answers `invalid`, whatever
  the CAF's `IDK`, as it does for an `FRMA` that is not base64. In `verifyReceivedDocuments` such a CAF used to be no
  CAF, and the stamp, left without its key, failed too: the CAF is now found and fails its SII signature, and the stamp
  is checked with the CAF's key like any other.
- **`parseCaf` checks that the CAF's private key is the pair of its public key.** It checked that `RSASK` was a PEM
  private key, but not that it was the pair of the `RSAPK` the SII signed in the `DA`, as dte-sdk already checks a
  certificate's key: a CAF with another key parsed, and every stamp signed with it failed the SII's check. A CAF whose
  keys are not a pair now throws `CAF_INVALID` with the reason `RSASK is not the pair of RSAPK`. The keys are compared
  as numbers, so a modulus wrapped over lines or with a leading zero byte still pairs.
  - **What to change:** nothing for a CAF the SII issued. The portal's flows parse the CAF they download, so a CAF
    whose keys are not a pair reaches them as `CAF_INVALID`, as a malformed one does.
- **`parseCaf` reads character references as the DOM does.** Its fields came from a parser that kept numeric
  character references as written, while `verifyCafSignature` and the SII read the same CAF through a DOM that decodes
  them: a CAF whose writer turned an Ñ into `&#209;` read `RS` with the reference in it, and one with a reference in
  `RE` or `TD` failed to parse. `parseCaf` now decodes `&#…;` and `&#x…;` as the DOM does, leaves a reference to a
  character XML does not allow as written, and expands no other entity. The `<CAF>` block it keeps for the TED is still
  the text as the SII issued it.
- **XML nested thousands of levels deep is `XML_PARSE_FAILED`, not a stack overflow.** `verifyReceivedDocuments` threw a
  `RangeError` for a file of a few thousand nested elements, since what reads a DOM walks it recursively. Every DOM
  dte-sdk parses (received documents, signatures, CAFs, the SII's answers) now refuses elements nested deeper than 100
  levels with `XML_PARSE_FAILED`, before anything walks them; no document the SII or an issuer writes comes close.
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

[Unreleased]: https://github.com/arrowsw/dte-sdk/compare/v0.15.0...HEAD
[0.15.0]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.15.0
[0.14.0]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.14.0
[0.13.0]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.13.0
[0.12.0]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.12.0
[0.11.0]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.11.0
[0.10.0]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.10.0
[0.9.1]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.9.1
[0.9.0]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.9.0
[0.8.0]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.8.0
[0.7.0]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.7.0
[0.6.0]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.6.0
[0.5.0]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.5.0
[0.4.0]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.4.0
[0.3.0]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.3.0
[0.2.0]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.2.0
[0.1.0]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.1.0
[0.0.2]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.0.2
[0.0.1]: https://github.com/arrowsw/dte-sdk/releases/tag/v0.0.1
