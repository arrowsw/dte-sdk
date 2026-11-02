<div align="center">
  <h1>dte-sdk: Chilean electronic tax documents (DTE) with TypeScript.</h1>

[![npm version](https://img.shields.io/npm/v/dte-sdk?color=000&label=npm)](https://www.npmjs.com/package/dte-sdk)
[![types included](https://img.shields.io/npm/types/dte-sdk?color=000)](https://www.npmjs.com/package/dte-sdk)
[![license](https://img.shields.io/npm/l/dte-sdk?color=000)](./LICENSE)

</div>

`dte-sdk` builds, stamps and signs Chilean **DTE** (Documento Tributario
Electrónico) the way the SII expects them, sends them through the SII web
services and tracks them, with a readable English API and bilingual (EN/ES)
documentation on every field.

- 🧾 **Document types** 33, 34, 39, 41, 43, 46, 52, 56 and 61.
- 🧮 **Totals done right** — per-line rounding, exempt and non-billable lines,
  VAT-included prices (`MntBruto`), global discounts, purchase-invoice withholding.
- 🔏 **TED + XMLDSig** — the electronic stamp signed with the CAF key and the
  enveloped signature the SII validates, byte for byte.
- ✉️ **Envelopes** — `EnvioDTE` and `EnvioBOLETA` with cover and signed `SetDTE`.
- 🪪 **Certificates** — PKCS#12 (`.pfx`/`.p12`, legacy and modern) or PEM; the
  holder RUT is read from the certificate.
- 📡 **SII web services** — seed/token, `DTEUpload` and the receipts REST API, envelope and
  document status, polling, acceptance/claims; injectable transport, retries, HTTP capture
  with redaction and an upload archive. TLS verification stays on.
- 🧠 **Fully typed** — a domain model in English (`totalAmount`, `issuer.businessName`)
  that maps to the official SII tags (`MntTotal`, `RznSoc`) through a codec.
- 🇨🇱 **Identity by [rut.ts](https://github.com/arrowsw/rut.ts)** — every RUT is
  validated and normalized by rut.ts; nothing is reimplemented here.
- 🛡️ **Typed errors** with stable codes and no personal data in messages.

## Installation

```bash
npm install dte-sdk
```

Node ≥ 20, ESM and CommonJS.

## Quick start

```typescript
import { readFileSync } from 'node:fs'
import { loadCertificateFromPkcs12, parseCaf, issueDocument, createEnvelope, signEnvelope, encodeLatin1 } from 'dte-sdk'

const certificate = loadCertificateFromPkcs12(readFileSync('firma.pfx'), process.env.PFX_PASSWORD!)
const caf = parseCaf(readFileSync('caf-33.xml', 'utf8'))

const invoice = issueDocument({
  document: {
    type: 33,
    folio: 1,
    issuer: { rut: '76543210-3', businessName: 'Comercial Andina SpA', businessActivity: 'Software', address: 'Av. Los Aromos 1540', commune: 'Santiago', activityCode: 620200 },
    receiver: { rut: '12345678-5', businessName: 'Comercializadora Rapel Ltda', businessActivity: 'Comercio', address: 'Pasaje Los Olmos 88', commune: 'Providencia' },
    items: [{ name: 'Plan anual', quantity: 1, unitPrice: 100000 }],
  },
  caf,
  certificate,
})

invoice.header.totals // { netAmount: 100000, vatRate: 19, vatAmount: 19000, totalAmount: 119000 }
invoice.xml // signed <DTE> with its TED

const envelope = signEnvelope(
  createEnvelope({
    kind: 'dte',
    documents: [invoice],
    cover: { issuerRut: '76543210-3', senderRut: certificate.rut!, resolutionDate: '2024-01-15', resolutionNumber: 123 },
  }),
  certificate,
)

encodeLatin1(envelope.xml) // ISO-8859-1 bytes, as the SII receives them
```

To send the envelope to the SII, see [SII web services](#sii-web-services).

Receipts (boletas) need no receiver and take VAT-included prices:

```typescript
const receipt = issueDocument({
  document: { type: 39, folio: 10, issuer, items: [{ name: 'Café', unitPrice: 1500 }], pricesIncludeVat: true },
  caf: parseCaf(readFileSync('caf-39.xml', 'utf8')),
  certificate,
})
```

## Step by step

```typescript
import { createDocument, stampDocument, signDocument, verifyTed, verifyDocumentSignature, toSiiDocument } from 'dte-sdk'

const doc = createDocument(input) // validates, sanitizes, numbers lines, computes totals
toSiiDocument(doc) // the same data with the official tags: MntTotal, RznSoc, NmbItem…
const stamped = stampDocument(doc, caf) // adds the TED (signed with the CAF key)
const signed = signDocument(stamped, certificate) // enveloped XMLDSig → signed.xml

verifyTed(signed.ted.xml, caf) // true
verifyDocumentSignature(signed.xml) // { digestValid: true, signatureValid: true, valid: true, … }
```

Every function that depends on "now" accepts `{ now: Date }`, so tests are deterministic.

## SII web services

```typescript
import { createSiiClient, uploadEnvelope, waitForUploadStatus, registerClaim, claimResponseMessage } from 'dte-sdk'

const sii = createSiiClient({ environment: 'certification', certificate, companyRut: '76543210-3' })

const receipt = await uploadEnvelope(sii, { envelope }) // EnvioDTE → DTEUpload; EnvioBOLETA → REST in production
const status = await waitForUploadStatus(sii, { trackId: receipt.trackId })
status.status // 'accepted' | 'acceptedWithObjections' | 'rejected' | …
status.message // Spanish gloss from the SII

const claim = await registerClaim(sii, { issuerRut: '10000004-0', type: 33, folio: 1234, action: 'acceptContent' })
if (!claim.ok) console.log(claimResponseMessage(claim.code)) // business answers are codes, not errors
```

Uploads send the XML as ISO-8859-1 bytes, so it must open with an XML declaration naming
ISO-8859-1 (the phase 1 envelopes do); anything else is refused with
`INVALID_OPTION { field: 'xml' }` before anything is sent, and whitespace before the declaration
is dropped.

The client is plain data: every operation is a free function that takes it first. Tokens are
obtained and renewed for you (one cache per environment, channel and certificate). Also
available: `getSeed`/`getToken`, `uploadBook`, `uploadFolioConsumption`, `queryUploadStatus`,
`queryDocumentStatus`, `folioReceived`, `listClaimEvents`, `queryTransferable`,
`queryReceptionDate`, `receiverStatus`.

Options worth knowing:

- `transport`: `fetch` by default; `createNodeHttpsTransport({ tls })` for a custom CA
  (`tls.ca`, added to the public roots bundled with Node, not in place of them) or, only if
  you must, `rejectUnauthorized: false` / `legacyRenegotiation: true`. TLS verification is on
  by default and the SII hosts verify with the system trust store, so the defaults just work.
- `retry`: 6 attempts with exponential backoff by default; `false` disables it. An upload
  (`uploadEnvelope`, `uploadBook`, `uploadFolioConsumption`) and `registerClaim` change state at
  the SII, so they are sent again only while no SII response has arrived (connection failure,
  timeout before the response headers). Once the SII answered, whatever it said, and even if the
  reply was cut off halfway, they are never re-sent, except once with a fresh token when the SII
  refused the token. Queries are read-only and follow the full policy. `retry.retryOn` can only
  narrow what is retried (`() => false` never re-sends), never widen it. Getting a token is one
  retry loop around seed, signature and token, so every attempt signs a fresh seed.
  `waitForUploadStatus` polls every `intervalMs` instead of following the retry policy, and its
  `timeoutMs` is a budget: each poll and each sleep is cut to the time that remains.
- `capture: createDirectoryCapture({ dir })` writes every HTTP exchange, redacted (tokens,
  seeds, cookies, private keys), for SII support tickets. `archive:
  createDirectoryUploadArchive({ dir })` keeps the exact bytes of every upload the SII answered,
  with its TrackID and the SII's reply (tokens redacted). A duplicate answer is kept as
  `<trackId>-<kind>-duplicate-<yyyymmddHHMMSS>` and never replaces the record of the original.
- `logger`: silent by default; pass `console` or your own. Messages never carry tokens, RUTs
  or XML.
- Every call accepts `{ signal, timeoutMs, retry }` as a last argument.

## SII books

```typescript
import { bookEntryFromDocument, createPurchaseSalesBook, signPurchaseSalesBook, uploadBook } from 'dte-sdk'

const book = createPurchaseSalesBook({
  cover: {
    issuerRut: '76543210-3',
    senderRut: '12345678-5',
    period: '2026-10',
    resolutionDate: '2026-01-15',
    resolutionNumber: 0,
    operation: 'sale',
  },
  entries: invoices.map((doc) => bookEntryFromDocument(doc, { bookRut: '76543210-3', operation: 'sale' })),
  summaryOnlyTotals: [{ type: 39, documentCount: 120, netAmount: 840000, vatAmount: 159600, totalAmount: 999600 }],
})
book.totalMismatches // explicit line totals that differ from the SII formula; `strictTotals: true` throws instead

const receipt = await uploadBook(sii, { xml: signPurchaseSalesBook(book, certificate).xml })
```

`createGuideBook`/`signGuideBook` build the dispatch guide book and
`createFolioConsumption`/`signFolioConsumption` the folio consumption report, which goes up with
`uploadFolioConsumption`. The SDK computes the summaries of all three from the lines. The two books
cover every submission kind of their schemas (`total`, `partial`, `final`, `adjustment`), and
`previousTotals` carries the totals of earlier submissions: `book.periodTotals` is a plain JSON value
you can store and pass back. The report has no submission kinds: to correct one, send it whole again
with a higher `sequence`. `bookEntryFromDocument`, `guideEntryFromDocument` and
`folioConsumptionEntryFromDocument` derive the lines from documents issued with this SDK.

Their use today is narrow. The RCV replaced the purchase and sales book in production from period
2017-08, and the guide book is sent only when the SII asks for it; both are still part of the
certification test set. The folio consumption report (now Resumen de Ventas Diarias) is used in the
receipts certification, and the SII probably no longer requires it in production.

## Errors

```typescript
import { DteError, isDteError } from 'dte-sdk'

try {
  createDocument({ ...input, items: [{ name: 'x'.repeat(81), unitPrice: 1 }] })
} catch (err) {
  if (isDteError(err)) err.code // 'FIELD_TOO_LONG'; err.details → { field: 'NmbItem', maxLength: 80, length: 81, value }
}
```

Messages never include RUTs, names or item text; the offending value lives in `details`.

The SII web services use the same `DteError` (`TRANSPORT_FAILED`, `TRANSPORT_TLS`, `REQUEST_TIMEOUT`,
`SII_UPLOAD_REJECTED`, `SII_TOKEN_INVALID`, `WAIT_TIMEOUT`, …); `isRetryableError(err)` tells which ones are
worth another try. Their messages carry only codes and numbers; a response excerpt (tokens and seeds
redacted) lives in `details`, never in the message. Transport errors carry `details.operation` (and
`timeoutMs` on `REQUEST_TIMEOUT`), `SII_HTTP_ERROR` carries `httpStatus`, `url` and `body`, and the
`details.status` of `SII_UPLOAD_REJECTED` is the `DTEUpload` status as a number.

## Status codes

`classifyUploadStatus('EPR')` → `'accepted'`, `classifyUploadStatus('RCT')` → `'rejected'`,
`classifyUploadStatus('-11')` → `'queryError'` (retry). `classifyDocumentStatus('FAU')` → `'notReceived'`.
Spanish glosses via `uploadStatusMessage` and `documentStatusMessage`. The same pattern covers the
`DTEUpload` reception statuses (`classifyReceptionStatus`, `receptionStatusMessage`) and the acceptance/claim
registry (`claimResponseMessage`, `transferabilityMessage`, `CLAIM_ACTIONS`).

## Development

```bash
npm install          # also builds via `prepare`
npm test             # unit, property, type-level and dist smoke tests
npm test -- --coverage
npm run build        # esbuild (ESM + CJS) + tsc declarations
npm run lint         # ESLint flat config + Prettier
npm run size         # bundle size guard (.size-limit.json)
npm run scan         # no real RUTs, local paths or secrets in tracked files
SII_LIVE=1 SII_CERT_PFX=… SII_CERT_PASSWORD=… npx jest tests/live   # opt-in smoke against maullin (needs a real certificate)
```

Releases are tag-triggered and published from CI with npm provenance — see
[RELEASING.md](./RELEASING.md).

## Contributing

Contributions are welcome — feel free to open issues for bugs and feature
requests, or submit a pull request.

## License

[MIT](./LICENSE) © dte-sdk contributors
