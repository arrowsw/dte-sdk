# dte-sdk — Overall architecture and Phase 1 design (core issuance)

Date: 2026-10-31 · Status: **approved; phase 1 implemented on the feat/core-issuance branch** · Author: Claude (with Hans)

Quality reference: `rut.ts` 5.0.0 (same scaffolding: dual ESM/CJS, Jest at 100 %, ESLint, Prettier, size-limit, Stryker,
expect-type, `dist/` smoke test).

---

## 1. Goal

Implement in `dte-sdk` the nine feature areas (types 33/34/39/41/43/46/52/56/61; generation, stamp and signature;
envelopes and upload; CAF and folios; portal; acceptance/claims; books; automated certification; operations) with:

1. **Functional programming.** Pure functions over immutable (`readonly`) data. No classes except the typed
   errors (`DteError extends Error`, like `InvalidRutError` in rut.ts). What is often modelled as an
   "object with methods" is **data + function** here: `parseCaf(xml)` returns a `Caf`; `stampDocument(doc, caf)`
   returns the stamped document.
2. **Code in English, bilingual documentation.** The domain model uses readable names (`totalAmount`,
   `netAmount`, `issuer.businessName`) and **the JSDoc of every function, type and field is bilingual: one `EN:`
   line and one `ES:` line**; the `ES:` line also names the SII tag the field produces. Towards the SII the
   official tags (`MntTotal`, `RznSoc`) are still emitted, through a codec.
3. **Every RUT operation comes from `rut.ts`.** Validating, cleaning, formatting, decomposing or masking a RUT is
   a call into rut.ts; dte-sdk does not reimplement a single modulo 11.
4. **rut.ts quality.** Strict and branded types, overloads where they help, typed errors with no PII in the
   message, 100 % coverage in the core, property tests, type-level tests, `dist/` smoke test, `llms.txt`
   documentation.

---

## 2. Architecture decisions

Each decision lists the alternatives considered and the recommendation (marked ✅).

### D1. Style: data + functions, no classes

- ✅ **Immutable data + pure functions.** `readonly` types; operations return new values. Anything "stateful"
  (token cache, folio registry, portal session) is modelled as **ports** (function interfaces) that the consumer
  implements or takes from a bundled adapter (`createMemoryTokenCache()`, `createFileStateStore()`).
- Discarded alternative: "one class per file". It clashes with the project requirement and mixes state with
  logic (e.g. a client that keeps the token as an attribute).
- Only exception: `DteError` (and subtypes if needed) are classes, because `instanceof` is the idiomatic way to
  discriminate errors in JS and rut.ts already does it that way.

### D2. Naming layer: English domain on top, SII underneath

Two models, one codec between them:

| Layer | Names | For whom |
|---|---|---|
| **Domain** (`Document`, `Issuer`, `Totals`…) | English (`totalAmount`) + bilingual `EN:`/`ES:` JSDoc naming the SII tag | humans and LLMs programming against the SDK |
| **SII-shaped** (`SiiDocumento`, `SiiEncabezado`…) | official tags verbatim (`MntTotal`, `RznSoc`) | interoperating with existing XML, pass-through of advanced fields |

- `toSiiDocument(doc)` and `fromSiiDocument(sii)` are pure, total functions. XML is **always** serialized from
  the SII-shaped layer (so the XSD element order lives in one place).
- JSDoc convention, mandatory on every exported symbol and every type field: first line `EN:` (what it is / what
  it does), second line `ES:` (the same in Spanish and, on fields, the SII tag in backticks). `@param`/`@returns`
  also in both languages, in that order. Real example from the model:

  ```ts
  type Totals = {
    /**
     * EN: Net amount: sum of the VAT-affected lines, before tax. Integer pesos. Omitted when 0.
     * ES: `MntNeto` — Monto neto: suma de las líneas afectas a IVA, sin impuesto. Entero en pesos. Se omite si es 0.
     */
    readonly netAmount?: number
    /**
     * EN: Exempt amount: sum of the lines flagged as exempt. Integer pesos.
     * ES: `MntExe` — Monto exento: suma de las líneas con `IndExe`. Entero en pesos.
     */
    readonly exemptAmount?: number
    /**
     * EN: VAT rate in force (19). Not declared on boletas (EnvioBOLETA_v11.xsd does not allow it).
     * ES: `TasaIVA` — Tasa de IVA vigente (19). No se declara en boletas (EnvioBOLETA_v11.xsd no lo admite).
     */
    readonly vatRate?: number
    /**
     * EN: VAT amount: `round(net × rate / 100)`, or `gross − net` when prices include VAT.
     * ES: `IVA` — Monto del IVA: `round(MntNeto × TasaIVA / 100)`, o `bruto − neto` cuando los precios incluyen IVA.
     */
    readonly vatAmount?: number
    /**
     * EN: Document total: net + VAT + exempt. Required.
     * ES: `MntTotal` — Monto total del documento: neto + IVA + exento. Obligatorio.
     */
    readonly totalAmount: number
  }
  ```

  For functions:

  ```ts
  /**
   * EN: Stamps a document with the CAF: builds the exact `<DD>` string and signs it (SHA1withRSA, Latin-1 bytes).
   * ES: Timbra un documento con el CAF: arma el string `<DD>` exacto y lo firma (SHA1withRSA sobre bytes Latin-1).
   * @param doc EN: a normalized document. ES: un documento normalizado.
   * @param caf EN: the parsed CAF whose range covers `doc.folio`. ES: el CAF parseado cuyo rango cubre `doc.folio`.
   * @returns EN: the document plus its `ted`. ES: el documento más su `ted`.
   * @throws {DteError} EN: `FOLIO_OUT_OF_RANGE`, `CAF_TYPE_MISMATCH`. ES: `FOLIO_OUT_OF_RANGE`, `CAF_TYPE_MISMATCH`.
   */
  ```

- The full SII tag → English name glossary is in section 5. It is part of the public contract: renaming is a
  major change.

### D3. One package, one entry point (decided by Hans on 2026-10-31)

> Superseded on 2026-11-04 by `docs/decisions/entry-points.md`: four entries, ES modules only.

✅ **Everything is exported from the root** (`import { … } from 'dte-sdk'`). Modules stay organized by area
under `src/` (below), but there is a single entry point, a single ESM/CJS build and a single `.d.ts`. The parts
that need Node (`node:https`, `node:fs`) import those modules lazily inside the function that uses them, so
loading the package never fails in environments without them; the package is documented as Node ≥ 20. Evaluating
subpaths declared in `exports` is tracked as a GitHub issue (see section 6), with the following split as the
proposal:

```
dte-sdk           core: model, catalogs, totals, XML, C14N, XMLDSig, TED, CAF, certificate
                  (PFX and PEM), envelopes, books (builders), status codes. Deps: node-forge,
                  @xmldom/xmldom, fast-xml-parser, rut.ts. No node:fs or node:https.
dte-sdk/sii       SII web services client (seed/token, DTEUpload, receipts REST,
                  QueryEstUp/QueryEstDte, WSRECLAMO). Injectable transport; `fetch` by default.
dte-sdk/node      Node adapters: `https` transport with mTLS and the SII legacy TLS flags,
                  on-disk stores, HTTP capture to a directory, upload archive.
dte-sdk/portal    certificate-authenticated portal: session, company data, RCV, MIPYME backup,
                  folios (query/void), CAF request, automated certification.
dte-sdk/pdf       printed representations (PDF417 + PDF). Optional peer deps at first.
                  (Superseded by the phase 5a spec: the PDF functions ship from the root entry with
                  `pdf-lib` and `bwip-js` as regular dependencies loaded on first use, D40 and D41.)
```

- What a subpath is: **the same npm package with more than one entry point**, declared in
  `package.json#exports` (`"./sii"`, `"./node"`, `"./portal"`, `"./pdf"`), each with its own types and ESM/CJS
  build.
- Why separate entries would help: the core (generate, stamp, sign) needs neither `node:fs` nor `node:https`,
  but the portal, the HTTP capture and the upload archive do. If everything comes out of a single `index`, any
  browser or edge bundler fails to resolve `node:https`, and a CJS consumer that only generates XML still loads
  the portal scraping. With separate entries `import { issueDocument } from 'dte-sdk'` is lightweight and
  `import { requestCaf } from 'dte-sdk/portal'` is explicitly Node.
- Decision: **everything from the root** for now (simpler; the package is Node-only meanwhile). Subpaths remain a
  future evaluation in the GitHub issue.
- Alternative still open in that issue: subpaths declared in `exports`; a `@dte-sdk/*` monorepo is discarded
  because of release friction.
- Scaffolding impact if subpaths arrive: the build minifies N entries; `.size-limit.json` gets one limit per
  entry; `dist.smoke.test.ts` checks every entry in ESM and CJS.

### D4. Dependencies (decided by Hans on 2026-10-31)

- ✅ The core uses **established dependencies** for cryptography and XML: `node-forge` (PKCS#12, RSA, SHA-1,
  X.509), `@xmldom/xmldom` (DOM for canonicalization) and `fast-xml-parser` (parsing CAF files and responses,
  building XML in order). Plus `rut.ts` (section 1, point 3: the only source of RUT logic). All four are pure JS
  and load in the browser, so the core stays usable outside Node even though it stops being zero-dependency (the
  README and the badge are updated).
- Not adopted: `got` or `form-data` (the phase 2 transport uses native `node:https`/`fetch` and `FormData` behind
  an injectable interface) and `dotenv` (configuration is passed as parameters). `pdf-lib` and `bwip-js` arrive
  with the PDF module in phase 5. `xml-crypto` is not needed: the in-house signer also covers the certification
  exchange.
- Exact pinned versions in `package.json` (`node-forge 1.4.2`, `@xmldom/xmldom 0.8.15`, `fast-xml-parser 5.11.2`,
  `rut.ts 5.0.0`), as rut.ts does with its devDeps.
- Alternative discarded by Hans: in-house crypto and XML on top of WebCrypto (universal and zero-dep, but more
  code to maintain). For the record, WebCrypto in Node 24 does sign RSA-SHA1 with 512/1024-bit keys, should this
  be revisited.

### D5. Synchronous API

With `node-forge` all cryptography is synchronous, so `stampDocument`, `signDocument`, `signEnvelope` and the
certificate loaders are synchronous functions, like rut.ts. Hans had accepted a `Promise` API (only required with
WebCrypto); without WebCrypto there is no reason to impose it. Only the transport (phase 2) is `async`.

### D6. Typed errors without PII

`DteError` with a `code` (closed literal union per domain: `CAF_INVALID`, `CAF_EXPIRED`, `FOLIO_OUT_OF_RANGE`,
`CERT_EXPIRED`, `FIELD_TOO_LONG`, `SII_REJECTED`…), typed `details` and a **generic message**: a RUT, a name or
an item text is never interpolated into the message (rut.ts rule). The offending value goes into `details`, which
the consumer decides whether to log. `isDteError(e)` and `isRetryable(e)` as functions.

### D7. No global state

No module-level `configure()`, global logger or module-level `Map` of tokens. Configuration (retries, timeouts,
logger, token cache, HTTP capture) travels in the **client** created by `createSiiClient({...})` and can be
overridden per call. This eases multi-tenant setups and tests.

### D8. Dates in Chile time, injectable clock

`TmstFirma`, `TmstFirmaEnv`, `TSTED`, the default `FchEmis` and the `SetId` values are computed with
`Intl.DateTimeFormat` in `America/Santiago`, never with `toISOString()` (a `TmstFirmaEnv` in UTC lands ~3 h in the
future and the SII rejects the envelope with "Error en Carátula"). Every function that uses "now" accepts
`{ now?: Date }` so tests are deterministic and the differential test can pin the instant.

### D9. Explicit ISO-8859-1 encoding

The XML lives as a JS `string`. For transport it is encoded with an in-house Latin-1 encoder that **rejects** (does
not truncate) characters outside the range; `sanitizeText` removes them beforehand so that never happens. The TED
folds to ASCII (`foldToAscii`) because the SII PDF417 reader loses bytes ≥ 128 and verifies the signature over
what it read.

### D10. Verification: differential against an external harness + full coverage

- Versioned synthetic fixtures: a self-signed certificate and synthetic CAF files generated by a script
  (`scripts/make-fixtures.mjs`), with an invented `76543210-3`-style RUT. Never real data.
- **Differential test** (`RUN_DIFFERENTIAL=1`, as in rut.ts): runs an external harness in a subprocess with the same
  certificate, CAF, document and instant, and compares the signed `<DTE>` and the signed envelope byte for byte (RSA
  PKCS#1 v1.5 is deterministic, so equality is exact). The harness lives outside the repository and is located through
  `DTE_DIFFERENTIAL_HARNESS`; the repository does not install it.
- In-house cryptographic verification: `verifyTed` (with the CAF `RSAPK` public key) and
  `verifyDocumentSignature` (with the embedded `X509Certificate`) using `node-forge` `verify`; both also serve for
  received DTEs.
- Property tests (fast-check): totals invariants (`total = net + VAT + exempt`, per-line rounding, gross↔net),
  `sanitizeText` idempotence, codec round trip.
- Type-level tests with `expect-type`; `dist/` smoke per entry; 100 % coverage in the core.

---

## 3. Phase breakdown

Each phase has its own spec → plan → implementation cycle. This spec details phase 1; the others are listed to fix
boundaries and order.

| Phase | Entry | Contents | Depends on | Estimated size | Done when |
|---|---|---|---|---|---|
| **1. Core issuance** | `dte-sdk` | model + glossary, catalogs, RUT (rut.ts), sanitization, Chile dates, totals, XML (build/parse/C14N), certificate from PFX and PEM (node-forge: bags, leaf, leaf→root chain, RUT from SAN OID 1.3.6.1.4.1.8321.1 / serialNumber / OU / CN), CAF, TED, XMLDSig, document, EnvioDTE/EnvioBOLETA envelopes, Latin-1, errors, status classification | — | ≈ 4 400 LOC | a signed DTE 33 and a signed boleta 39 pass the differential; `npm test` at 100 % |
| **2. SII web services** | `dte-sdk/sii`, `dte-sdk/node` | injectable transport (`fetch` + Node `https` with mTLS/legacy TLS), REST and SOAP seed/token with cache and retries, Latin-1 multipart DTEUpload, receipts REST upload, QueryEstUp/QueryEstDte/receipt status, `folioReceived`, book and RCOF upload, WSRECLAMO (4 methods), HTTP capture with redaction, upload archive, injectable logger and retries | 1 | ≈ 3 300 LOC | tests with a simulated transport and response fixtures; manual smoke against maullin |
| **3. Books** | `dte-sdk` | IECV (`LibroCompraVenta`: monthly/total/partial/adjustment, LTC), `LibroGuia`, RCOF (`ConsumoFolio`) signed by reusing phase 1 | 1 | ≈ 1 100 LOC | valid signed XML; differential against an external harness |
| **4. Portal and folios** | `dte-sdk/portal` | certificate session (cookies, store/lock/state as ports, 90 min TTL, session close), company/taxpayer/branch data, RCV, MIPYME backup, local folio registry (port), folio queries and CAF requests with HTML detectors | 1, 2 | ≈ 6 400 LOC | tests with synthetic HTML for the detectors and flows |
| **5. Certification and PDF** | `dte-sdk/portal`, `dte-sdk/pdf` | set parser, runner (basic/guide/exempt/purchase sets, books, simulation, RespuestaDTE/EnvioRecibos exchange, progress and compliance, receipts through the portal), artefacts between replicas, PDF417 printed representations (pdf-lib + bwip-js) | 2, 3, 4 | ≈ 15 800 LOC | full run on maullin with a test taxpayer |

Out of scope for every phase: export DTEs 110/111/112, fee receipts (boleta de honorarios), assignment (AEC),
F29/F22, exchange e-mail, full XSD validation.

---

## 4. Phase 1 — detailed design

### 4.1 `src/` layout

```
src/
  index.ts                 re-exports the public API of the core
  errors.ts                DteError, codes, isDteError, isRetryable
  catalogs/
    document-types.ts      DocumentType (33|34|…|61), names, predicates (isReceipt, isExemptType, isNote…)
    reference-codes.ts     ReferenceCode (1 voids, 2 corrects text, 3 corrects amounts)
    codes.ts               transferType, dispatchType, serviceIndicator, paymentTerms, withholdingTax…
    upload-status.ts       EPR/RPR/RSC/RFR/RCT/… codes, DOK/DNK/FAU/…, -1…-14 → classification
    endpoints.ts           hosts and URLs per environment (data only, used by dte-sdk/sii)
  rut.ts                   toSiiRut / splitSiiRut: thin adapter over rut.ts (zero RUT logic of its own)
  text/
    sanitize.ts            sanitizeText, foldToAscii, truncate, assertMaxLength
    latin1.ts              encodeLatin1 / decodeLatin1
  time/chile.ts            chileDate, chileTimestamp, formatSetId (injectable clock)
  model/
    document.ts            Document, DocumentInput, Header, Issuer, Receiver, LineItem, Totals,
                           Reference, GlobalDiscount, Transport, SubtotalInfo (English + ES JSDoc)
    sii.ts                 SiiDocumento, SiiEncabezado, SiiDetalle… (official tags)
    codec.ts               toSiiDocument / fromSiiDocument
    cover.ts               EnvelopeCover (Carátula) and SiiCaratula
  totals/calculate.ts      calculateLineAmount, calculateTotals (net/gross/exempt/discount/withholding)
  document/
    create.ts              createDocument(input): normalizes, sanitizes, checks lengths, computes totals
    build-xml.ts           buildDocumentXml(doc, { ted?, signedAt? }) in XSD order with line breaks
  xml/
    escape.ts              escapeText, escapeAttribute
    build.ts               buildXml(SII-shaped object) with fast-xml-parser XMLBuilder (order = key order)
    parse.ts               parseXml / parseXmlWithoutNamespaces with fast-xml-parser XMLParser
    c14n.ts                canonicalization of the SII subset over @xmldom/xmldom (sorted attributes, inherited xmlns)
    format.ts              formatBase64Columns (SignatureValue/Modulus/X509Certificate at 64), expandSelfClosing
  crypto/
    digest.ts              sha1Base64(data, encoding), toBinaryString with node-forge
    rsa.ts                 signSha1WithRsa(privateKey, data, encoding), verifySha1WithRsa, modulus/exponent base64
    x509.ts                subjectFields, rutFromCertificate (SAN OID → serialNumber → OU → CN), validity
  certificate/
    pkcs12.ts              loadCertificateFromPkcs12(bytes, password): bags, leaf by public key, leaf→root chain
    pem.ts                 loadCertificateFromPem({ privateKeyPem, certificatePem, chainPem? })
    certificate.ts         Certificate type, isCertificateExpired, daysUntilExpiry, certificateBase64
  caf/
    parse.ts               parseCaf(xml) → Caf (data + exact <CAF> XML)
    validity.ts            cafExpiresAt, isCafExpired, isFolioInRange, assertFolioInRange
    sign.ts                signWithCaf(caf, bytes) (RSA-SHA1, Latin-1)
  ted/
    build.ts               buildDd(doc, caf, stampedAt) → exact string; stampDocument; verifyTed
  signature/xmldsig.ts     buildSignedInfo, buildSignature, signEnveloped(xml, { id, element }), verifySignature
  envelope/
    create.ts              createEnvelope({ kind: 'dte' | 'receipt', documents, cover }) → Envelope
    build-xml.ts           buildEnvelopeXml(envelope) (EnvioDTE_v10 / EnvioBOLETA_v11)
    sign.ts                signEnvelope(envelope, certificate) → SignedEnvelope
```

Every file < 300 lines; every module exports functions and types, nothing else.

### 4.2 Domain model (summary)

```ts
type DocumentType = 33 | 34 | 39 | 41 | 43 | 46 | 52 | 56 | 61

type DocumentInput = {
  /** EN: Electronic tax document type. ES: `TipoDTE` — Tipo de documento tributario electrónico. */
  readonly type: DocumentType
  /** EN: Sequential number authorized by the CAF. ES: `Folio` — Número correlativo autorizado por el CAF. */
  readonly folio: number
  /** EN: Issue date YYYY-MM-DD; defaults to today in Chile. ES: `FchEmis` — Fecha de emisión AAAA-MM-DD; por defecto hoy en hora de Chile. */
  readonly issueDate?: string
  readonly issuer: IssuerInput
  /** EN: Receiver; optional on receipts (final consumer 66666666-6). ES: Receptor; en boletas puede omitirse (consumidor final 66666666-6). */
  readonly receiver?: ReceiverInput
  readonly items: readonly LineItemInput[]
  readonly references?: readonly ReferenceInput[]
  /** EN: Global discounts or surcharges. ES: `DscRcgGlobal` — Descuentos o recargos globales. */
  readonly globalAdjustments?: readonly GlobalAdjustmentInput[]
  /** EN: Transport data, dispatch guides (52) only. ES: `Transporte` — Solo guías de despacho (52). */
  readonly transport?: TransportInput
  /** EN: Optional `IdDoc` fields. ES: `IndServicio`, `FmaPago`, `FchVenc`, `MntBruto`, … — campos opcionales de `IdDoc`. */
  readonly options?: HeaderOptions
  /** EN: true when `unitPrice` already includes VAT (`MntBruto=1`; net and VAT derive from gross). ES: true si `unitPrice` ya incluye IVA: se declara `MntBruto=1` y neto/IVA se derivan del bruto. */
  readonly pricesIncludeVat?: boolean
  /** EN: Explicit totals (advanced); computed when omitted. ES: Totales explícitos (uso avanzado); si se omiten, se calculan. */
  readonly totals?: Totals
}

type Document = {               // result of createDocument: normalized, immutable
  readonly id: string           // `ID` of <Documento>: DTE_T{type}F{folio}
  readonly header: Header       // { type, folio, issueDate, options, issuer, receiver, transport?, totals }
  readonly items: readonly LineItem[]
  readonly references: readonly Reference[]
  readonly globalAdjustments: readonly GlobalAdjustment[]
  readonly subtotals?: readonly SubtotalInfo[]
}

type StampedDocument = Document & { readonly ted: Ted; readonly stampedAt: string }
type SignedDocument  = StampedDocument & { readonly xml: string; readonly signedAt: string; readonly signature: XmlSignature }
```

`Issuer`, `Receiver`, `LineItem`, `Totals`, `Reference`, `GlobalAdjustment` and `Transport` follow the glossary
in section 5; all `readonly`, with bilingual JSDoc per field.

### 4.3 Phase 1 public API

```ts
// Document
createDocument(input: DocumentInput): Document                       // pure; throws DteError
buildDocumentXml(doc: Document | StampedDocument, opts?): string      // unsigned
stampDocument(doc: Document, caf: Caf, opts?: { now?: Date }): StampedDocument
signDocument(doc: StampedDocument, cert: Certificate, opts?: { now?: Date }): SignedDocument
issueDocument(p: { document: DocumentInput | Document; caf: Caf; certificate: Certificate; now?: Date }): SignedDocument
verifyTed(ted: Ted | string, caf: Caf | CafPublicKey): boolean
verifyDocumentSignature(xml: string): SignatureVerification

// SII codec
toSiiDocument(doc: Document): SiiDocumento
fromSiiDocument(sii: SiiDocumento): Document

// CAF
parseCaf(xml: string): Caf
cafExpiresAt(caf: Caf): Date | null            // 6 months for 33/46/56/61 (Res. 58/2017)
isCafExpired(caf: Caf, opts?: { now?: Date; marginMs?: number }): boolean
isFolioInRange(caf: Caf, folio: number): boolean
availableFolios(caf: Caf): number

// Certificate
loadCertificateFromPkcs12(pfx: Uint8Array, password: string): Certificate     // throws CERT_PASSWORD_WRONG / CERT_INVALID / CERT_EXPIRED
loadCertificateFromPem(p: { privateKeyPem: string; certificatePem: string; chainPem?: string }): Certificate
isCertificateExpired(cert: Certificate, opts?): boolean
daysUntilExpiry(cert: Certificate, opts?): number

// Envelopes
createEnvelope(p: { kind: 'dte' | 'receipt'; documents: readonly SignedDocument[]; cover: EnvelopeCoverInput; now?: Date }): Envelope
buildEnvelopeXml(envelope: Envelope): string
signEnvelope(envelope: Envelope, cert: Certificate): SignedEnvelope

// Text, dates, RUT, encoding
sanitizeText, foldToAscii, truncateText, assertMaxLength
chileDate(now?), chileTimestamp(now?)
toSiiRut(rut: string): SiiRut                  // validates with rut.ts; throws DteError('INVALID_RUT')
encodeLatin1(xml: string): Uint8Array, decodeLatin1(bytes): string

// Catalogs and statuses
DOCUMENT_TYPES, documentTypeName(type, { short? }), isReceipt, isExemptType, isNote, requiresReceiver
REFERENCE_CODES, TRANSFER_TYPES, DISPATCH_TYPES, SERVICE_INDICATORS, PAYMENT_TERMS
classifyUploadStatus(code: string): UploadStatusClass   // 'accepted' | 'acceptedWithObjections' | 'pending' | 'rejected' | 'queryError'
classifyDocumentStatus(code: string): DocumentStatusClass
uploadStatusMessage(code: string): string      // Spanish gloss

// Errors
DteError, DTE_ERROR_CODES, isDteError, isRetryable
```

Typical pipeline:

```ts
const caf = parseCaf(cafXml)
const cert = loadCertificateFromPkcs12(pfxBytes, password)
const signed = issueDocument({ document: { type: 33, folio: 1, issuer, receiver, items }, caf, certificate: cert })
const envelope = signEnvelope(createEnvelope({ kind: 'dte', documents: [signed], cover }), cert)
encodeLatin1(envelope.xml) // bytes ready for DTEUpload (phase 2)
```

### 4.4 Data flow and SII rules the core guarantees

1. `createDocument` normalizes RUTs (`toSiiRut`: no dots, with hyphen, uppercase, validated), sanitizes text
   (`sanitizeText`), **throws** `FIELD_TOO_LONG` when `NmbItem` > 80, `RznSoc` > 100, `GiroRecep` > 40,
   `DscItem` > 1000 (whatever is not checked here surfaces as an `RSC` rejection of the whole envelope),
   computes totals with per-line rounding, supports `pricesIncludeVat` (gross → `MntBruto=1`,
   net = `round(gross/1.19)`, VAT = gross − net), exempt per line (`IndExe`) or per type (34/41), global
   percentage discount over the affected base, full withholding for 46 (`ImptoReten` 15), receipts without
   `TasaIVA`, `IndServicio=3` by default on receipts, final-consumer receiver on receipts without one.
2. `toSiiDocument` produces the structure with the official tags **in XSD order** (`IdDoc` with its 25 optional
   fields in order, `Totales` MntNeto/MntExe/TasaIVA/IVA/ImptoReten/MntTotal, `Detalle`
   NroLinDet/IndExe/NmbItem/DscItem/QtyItem/UnmdItem/PrcItem/DescuentoPct/DescuentoMonto/CodImpAdic/MontoItem,
   `Referencia` NroLinRef/TpoDocRef/IndGlobal/FolioRef/FchRef/CodRef/RazonRef, etc.).
3. `buildDocumentXml` serializes `<DTE xmlns="http://www.sii.cl/SiiDte" xmlns:xsi=… version="1.0"><Documento ID=…>…`
   and inserts a line break between `</Encabezado>`, each `</Detalle>`, `</DscRcgGlobal>`, `</Referencia>` and
   `</TED>` and the next sibling (the SII limit of 4 090 characters per line, `CHR-00002`). It never strips the
   `xmlns` declarations from `<DTE>`: the digest inherits them.
4. `stampDocument` builds the exact `<DD>` string (`RE, TD, F, FE, RR, RSR, MNT, IT1, CAF, TSTED`), with `RSR` and
   `IT1` folded to ASCII **and then** truncated to 40, an empty `RR` on receipts without receiver, the `<CAF>`
   byte for byte from the original file (no whitespace between tags), `TSTED` in Chile time; it signs SHA1withRSA
   over the Latin-1 bytes with the `RSASK` key.
5. `signDocument` canonicalizes `<Documento>` inheriting `xmlns` and `xmlns:xsi` from `<DTE>`, computes the
   SHA-1 digest (over UTF-8), builds `SignedInfo` **expanded** (`<X></X>`) for signing and **compact** (`<X/>`)
   for storage, without `xmlns:xsi` in the DTE `SignedInfo` (with it in envelopes and books), `SignatureValue`,
   `Modulus` and `X509Certificate` wrapped at 64 columns, `TmstFirma` in Chile time. Canonical text escapes only
   `& < > \r` (never `'` or `"`: escaping them changes the digest and the SII rejects the envelope with RFR).
6. `createEnvelope` generates the `SetId` (`DTE_SetDoc_dd_mm_yyyy_hh_mm_ss_ms` or `ENVIOBOLETA_…`), `SubTotDTE`
   (33, 61, 56 first in EnvioDTE), a fixed `RutReceptor` `60803000-K` on receipts, `FchResol` normalized to
   YYYY-MM-DD, `TmstFirmaEnv` in Chile time; `signEnvelope` signs `<SetDTE>` with the same XMLDSig module
   (`includeXsi: true`).
7. `classifyUploadStatus` classifies: `EPR`/`RPR`/`LOK`/`RLV`(REST) successful; `REC`/`SOK`/`FOK`/`PRD`/`CRT`/
   `DNK`/`PDR`/`LSO`/`0` intermediate; `RPT`/`RFR`/`VOF`/`RCT`/`RCH`/`RSC`/`LNC`/`LRH`/`RLV`(SOAP) rejected;
   `-1`…`-14` retryable query errors. Note: `RLV` is success on the receipts REST API and rejection on
   QueryEstUp; the function takes the channel (`'rest' | 'soap'`).

### 4.5 Errors

| Code | When | `details` |
|---|---|---|
| `INVALID_RUT` | RUT not valid (rut.ts) | `{ field }` (never the value) |
| `FIELD_TOO_LONG` | sanitized text exceeds the XSD `maxLength` | `{ field, maxLength, length }` |
| `MISSING_FIELD` | required field absent (e.g. receiver on a 33) | `{ field }` |
| `INVALID_DOCUMENT_TYPE` | type outside the catalog | `{ type }` |
| `CAF_INVALID` / `CAF_EXPIRED` / `CAF_TYPE_MISMATCH` / `FOLIO_OUT_OF_RANGE` | CAF | `{ type, from, to, folio }` |
| `CERT_INVALID` / `CERT_PASSWORD_WRONG` / `CERT_EXPIRED` / `CERT_NO_RUT` | certificate | `{ expiresAt }` |
| `XML_PARSE_FAILED` | lightweight parser | `{ position }` |
| `ENCODING_UNSUPPORTED_CHAR` | `encodeLatin1` meets a character outside Latin-1 | `{ index, codePoint }` |

### 4.6 Phase 1 tests

- Unit tests per module (`tests/<module>.test.ts`), `test.each` as in rut.ts.
- `tests/fixtures/`: legacy `cert.pfx` (OpenSSL 1.1: 3DES/RC2) and `cert-aes.pfx` (PBES2/AES), plus
  `cert.key.pem`/`cert.pem` (self-signed, synthetic RUT in the SAN OID), `caf-33.xml`, `caf-39.xml` (synthetic,
  with their own `RSASK`). Reproducible `scripts/make-fixtures.mjs` (no real data; `scripts/scan-real-data.mjs`
  with an allow-list of RUTs, run in CI).
- Jest snapshots (`tests/__snapshots__/`): the expected XML of a signed document with a fixed `now`.
- Differential test (opt-in, external harness located through `DTE_DIFFERENTIAL_HARNESS`): the same input to the harness
  (subprocess) and to dte-sdk; exact equality of the signed `<DTE>` and of the envelope.
- `tests/property.test.ts`: fast-check over totals, sanitization and the codec.
- `tests/types.test.ts`: `expect-type` over overloads and literals.
- `tests/dist.smoke.test.ts`: every entry in ESM and CJS.

---

## 5. Naming glossary (public contract)

Format: SII tag → `name` in the model (type). Only what phase 1 covers; later phases extend the table in their
own spec.

**Document types** (`DocumentType`): 33 `invoice`, 34 `exemptInvoice`, 39 `receipt`, 41 `exemptReceipt`,
43 `settlementInvoice`, 46 `purchaseInvoice`, 52 `dispatchGuide`, 56 `debitNote`, 61 `creditNote`. (Hans fixed
`boleta` = `receipt`; `folio` is kept as a loanword because it is a search term with no faithful equivalent.)
Envelopes: EnvioDTE `'dte'`, EnvioBOLETA `'receipt'`. Predicate: `isReceipt`.

**`IdDoc` → `Header` + `HeaderOptions`**
TipoDTE `type` · Folio `folio` · FchEmis `issueDate` · IndNoRebaja `noDebitReduction` ·
TipoDespacho `dispatchType` · IndTraslado `transferType` · TpoImpresion `printFormat` ·
IndServicio `serviceIndicator` · MntBruto `grossAmounts` · TpoTranCompra `purchaseTransactionType` ·
TpoTranVenta `saleTransactionType` · FmaPago `paymentTerms` · FmaPagExp `exportPaymentTerms` ·
FchCancel `settlementDate` · MntCancel `settledAmount` · SaldoInsol `outstandingBalance` ·
MntPagos `payments[] { FchPago date, MntPago amount, GlosaPagos note }` · PeriodoDesde/Hasta
`billingPeriod { from, to }` · MedioPago `paymentMedium` · TpoCtaPago `paymentAccountType` ·
NumCtaPago `paymentAccountNumber` · BcoPago `paymentBank` · TermPagoCdg `paymentTermsCode` ·
TermPagoGlosa `paymentTermsNote` · TermPagoDias `paymentTermsDays` · FchVenc `dueDate` ·
IndMntNeto `netAmountsIndicator`.

**`Emisor` → `Issuer`**
RUTEmisor `rut` · RznSoc/RznSocEmisor `businessName` · GiroEmis/GiroEmisor `businessActivity` ·
Telefono `phone` · CorreoEmisor `email` · Acteco `activityCode` · Sucursal `branch` ·
CdgSIISucur `siiBranchCode` · DirOrigen `address` · CmnaOrigen `commune` · CiudadOrigen `city` ·
CdgVendedor `salespersonCode`.

**`Receptor` → `Receiver`**
RUTRecep `rut` · CdgIntRecep `internalCode` · RznSocRecep `businessName` · GiroRecep
`businessActivity` · Contacto `contact` · CorreoRecep `email` · DirRecep `address` ·
CmnaRecep `commune` · CiudadRecep `city` · DirPostal `postalAddress` · CmnaPostal
`postalCommune` · CiudadPostal `postalCity`.

**`Totales` → `Totals`**
MntNeto `netAmount` · MntExe `exemptAmount` · TasaIVA `vatRate` · IVA `vatAmount` ·
IVAProp `ownVatAmount` · IVATerc `thirdPartyVatAmount` · ImptoReten[] `withholdings[]
{ TipoImp taxCode, TasaImp rate, MontoImp amount }` · Comisiones `commissions { ValComNeto
netValue, ValComExe exemptValue, ValComIVA vatValue }` · MntTotal `totalAmount` · MontoNF
`nonBillableAmount` · MontoPeriodo `periodAmount` · SaldoAnterior `previousBalance` ·
VlrPagar `amountDue`.

**`Detalle` → `LineItem`**
NroLinDet `lineNumber` · CdgItem[] `codes[] { TpoCodigo type, VlrCodigo value }` · TpoDocLiq
`settledDocumentType` · IndExe `exemptIndicator` (input: `exempt: true`) · NmbItem `name` ·
DscItem `description` · QtyRef `referenceQuantity` · UnmdRef `referenceUnit` · PrcRef
`referencePrice` · QtyItem `quantity` · UnmdItem `unit` · PrcItem `unitPrice` · DescuentoPct
`discountPercent` · DescuentoMonto `discountAmount` · RecargoPct `surchargePercent` ·
RecargoMonto `surchargeAmount` · CodImpAdic[] `additionalTaxCodes` · MontoItem `amount`.

**`Referencia` → `Reference`**
NroLinRef `lineNumber` · TpoDocRef `documentType` (number or `'SET'`) · IndGlobal `global` ·
FolioRef `folio` · RUTOtr `otherRut` · FchRef `date` · CodRef `code` · RazonRef `reason`.

**`DscRcgGlobal` → `GlobalAdjustment`**
NroLinDR `lineNumber` · TpoMov `kind` (`'discount'` D | `'surcharge'` R) · GlosaDR
`description` · TpoValor `valueType` (`'percent'` % | `'amount'` $) · ValorDR `value` ·
IndExeDR `exemptIndicator`.

**`Transporte` → `Transport`**
Patente `licensePlate` · RUTTrans `carrierRut` · Chofer `driver { RUTChofer rut, NombreChofer name }` ·
DirDest `destinationAddress` · CmnaDest `destinationCommune` · CiudadDest `destinationCity`.

**`Caratula` → `EnvelopeCover`**
RutEmisor `issuerRut` · RutEnvia `senderRut` · RutReceptor `receiverRut` · FchResol
`resolutionDate` · NroResol `resolutionNumber` · TmstFirmaEnv `signedAt` · SubTotDTE[]
`subtotals[] { TpoDTE type, NroDTE count }` · SetDTE/@ID `setId`.

**`CAF`**
DA/RE `issuerRut` · DA/RS `issuerName` · DA/TD `documentType` · DA/RNG/D,H `range { from, to }` ·
DA/FA `authorizationDate` · DA/RSAPK/M,E `publicKey { modulus, exponent }` · DA/IDK `keyId`
(100 = certification) · FRMA `siiSignature` · RSASK `privateKeyPem` · exact `<CAF>` `xml`.

**`TED/DD` → `Ted`**
RE `issuerRut` · TD `documentType` · F `folio` · FE `issueDate` · RR `receiverRut` · RSR
`receiverName` · MNT `totalAmount` · IT1 `firstItemName` · CAF `caf` · TSTED `stampedAt` ·
FRMT `signature`.

**Environment**: certificacion `'certification'` (maullin) · produccion `'production'` (palena).

---

## 6. Decisions that needed Hans's confirmation

Resolved by Hans on 2026-10-31: `rut.ts` is the only source of RUT logic; JSDoc is bilingual `EN:`/`ES:`; the
dependencies are `node-forge`, `@xmldom/xmldom` and `fast-xml-parser`; the API may be synchronous; `boleta` = `receipt`;
the rest of the glossary stays as is.

Entry points (D3): everything from the root; the subpath evaluation lives in the GitHub issue
[arrowsw/dte-sdk#5](https://github.com/arrowsw/dte-sdk/issues/5) (in English, assigned to hansfpc).

**Design approved. The phase 1 implementation plan is `docs/superpowers/plans/2026-10-31-phase-1-core-issuance.md`.**
