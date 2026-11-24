<div align="center">
  <h1>dte-sdk: Chilean electronic tax documents (DTE) with TypeScript.</h1>

[![npm version](https://img.shields.io/npm/v/dte-sdk?color=000&label=npm)](https://www.npmjs.com/package/dte-sdk)
[![downloads](https://img.shields.io/npm/dm/dte-sdk?color=000)](https://www.npmjs.com/package/dte-sdk)
[![bundle size](https://deno.bundlejs.com/badge?q=dte-sdk&treeshake=[*]&config=%7B%22esbuild%22%3A%7B%22platform%22%3A%22node%22%7D%7D)](https://bundlejs.com/?q=dte-sdk&treeshake=[*]&config=%7B%22esbuild%22%3A%7B%22platform%22%3A%22node%22%7D%7D)
[![types included](https://img.shields.io/npm/types/dte-sdk?color=000)](https://www.npmjs.com/package/dte-sdk)
![dependencies](https://img.shields.io/badge/dependencies-4-000)
[![license](https://img.shields.io/npm/l/dte-sdk?color=000)](./LICENSE)

</div>

Build, stamp, sign and send Chilean **DTE** (Documento Tributario Electrónico) the way the SII expects them, and
handle what surrounds issuing: folios, the SII books, the SII portal, certification and printed samples.

> **Not ready for production.** Until **1.0.0** the API can change in any release, and much of it has not met the
> real SII yet: see [Project status](https://dte.arrowsw.com/documentation/status).

- 🧾 **Every document type** — 33, 34, 39, 41, 43, 46, 52, 56 and 61, and the export documents 110 to 112, with their
  totals worked out and what the SII would reject caught before stamping.
- 🔏 **Stamped and signed as the SII validates** — the TED with the CAF key and the enveloped XMLDSig, and the same
  checks on the documents your suppliers send.
- 📡 **The SII end to end** — web services, the portal (folios, the purchase and sales register, the MIPYME backup)
  and the certification process.
- 🧠 **Fully typed** — a domain model in English (`totalAmount`) mapped to the SII tags (`MntTotal`), with bilingual
  (EN/ES) docs on every field, and every RUT handled by [rut.ts](https://github.com/arrowsw/rut.ts).
- 🛡️ **Safe by default** — typed errors with stable codes and no personal data in messages, TLS verification on,
  redacted HTTP capture.

## Installation

```bash
npm install dte-sdk
# printed samples (dte-sdk/pdf):          npm install pdf-lib bwip-js
# schema validation (dte-sdk/schemas):    npm install xmllint-wasm
```

Node ≥ 22.12. The package ships ES modules only, and a CommonJS project loads it with `require()` just the same.

## Quick start: issue an invoice

Issuing takes three steps, and each one is a function of its own: issue the document, stamped with your CAF and
signed with your certificate; put it in an envelope, signed too; and upload the envelope to the SII.

```typescript
import { readFileSync } from 'node:fs'
import {
  loadCertificateFromPkcs12,
  parseCaf,
  issueDocument,
  createEnvelope,
  signEnvelope,
  createSiiClient,
  uploadEnvelope,
  PAYMENT_TERMS,
} from 'dte-sdk'

const certificate = loadCertificateFromPkcs12(readFileSync('firma.pfx'), process.env.PFX_PASSWORD!) // your certificate
const caf = parseCaf(readFileSync('caf-33.xml', 'utf8')) // the CAF of the type you issue: it holds the folios

// 1. The document: checked, its totals worked out from the lines, stamped (TED) with the CAF and signed (XMLDSig).
const invoice = issueDocument({
  document: {
    type: 33, // factura electrónica
    folio: 1, // a folio of the CAF
    // issueDate: '2026-11-24', today in Chile when left out
    issuer: {
      rut: '76543210-3',
      businessName: 'Comercial Andina SpA',
      businessActivity: 'Software', // giro
      activityCode: 620200, // Acteco, required on every type but a receipt
      address: 'Av. Los Aromos 1540',
      commune: 'Santiago',
    },
    receiver: {
      rut: '12345678-5',
      businessName: 'Comercializadora Rapel Ltda',
      businessActivity: 'Comercio',
      address: 'Pasaje Los Olmos 88',
      commune: 'Providencia',
    },
    items: [{ name: 'Plan anual', quantity: 1, unitPrice: 100000 }],
    options: { paymentTerms: PAYMENT_TERMS.cash }, // FmaPago
  },
  caf,
  certificate,
})

invoice.header.totals // { netAmount: 100000, vatRate: 19, vatAmount: 19000, totalAmount: 119000 }

// 2. The envelope (EnvioDTE), signed with the same certificate. It holds up to 2,000 documents.
const envelope = signEnvelope(
  createEnvelope({
    kind: 'dte',
    documents: [invoice],
    cover: {
      issuerRut: '76543210-3',
      senderRut: certificate.rut!, // the person who holds the certificate
      resolutionDate: '2024-01-15', // the SII resolution that authorized the company to issue
      resolutionNumber: 0, // 0 in certification
    },
  }),
  certificate,
)

// 3. The upload. 'certification' is maullin, the SII's test environment; 'production' is palena.
const sii = createSiiClient({ environment: 'certification', certificate, companyRut: '76543210-3' })
const upload = await uploadEnvelope(sii, { envelope }) // the token is asked for and reused for you
upload.trackId // the SII received the envelope
```

**A `trackId` is not an acceptance.** The SII answers the upload at once and checks the envelope afterwards, so ask
until it settles:

```typescript
import { waitForUploadStatus } from 'dte-sdk'

const status = await waitForUploadStatus(sii, { trackId: upload.trackId }) // every 5 s, for up to 10 minutes
status.status // 'accepted' | 'acceptedWithObjections' | 'partiallyRejected' | 'rejected' | …
status.counts // { reported, accepted, rejected, objections }
```

The upload needs a company the SII authorized in that environment and a CAF the SII delivered there;
`queryAuthorizedIssuer(sii, { rut })` reads the cover's resolution from the SII's public registry. A receipt (39, 41)
needs no receiver and goes in an envelope of `kind: 'receipt'`: see the
[receipt example](https://dte.arrowsw.com/documentation/examples/receipt).

> 📚 Guides, examples and the API reference: **[dte.arrowsw.com](https://dte.arrowsw.com/documentation)**

## Features

- **[Documents and totals](https://dte.arrowsw.com/documentation/features/documents)** — every type, per-line
  rounding, exempt and non-billable lines, VAT-included prices, global adjustments, withholding, commissions, export
  amounts in their currency, and the SII's content rules checked before stamping.
- **[Stamp](https://dte.arrowsw.com/documentation/features/stamp) and
  [signatures](https://dte.arrowsw.com/documentation/features/sign)** — the TED and the XMLDSig, and the verification
  of a received document: its signature, its stamp, its CAF and the SII's signature over that CAF.
- **[Envelopes](https://dte.arrowsw.com/documentation/features/envelopes)** — `EnvioDTE` and `EnvioBOLETA`, and the
  answers to a received envelope.
- **[SII web services](https://dte.arrowsw.com/documentation/features/sii-web-services)** — seed and token, uploads,
  envelope and document status, acceptance and claims, the public registry of authorized issuers.
- **[SII books](https://dte.arrowsw.com/documentation/features/books)** — the purchase and sales book, the dispatch
  guide book and the folio consumption report.
- **[Assignment of invoices](https://dte.arrowsw.com/documentation/features/assignment)** — the AEC file, signed and
  registered.
- **[SII portal](https://dte.arrowsw.com/documentation/features/portal)** — certificate or tax-password login, folios
  and CAF requests, a local folio registry, and the activity verification.
- **[Purchase and sales register](https://dte.arrowsw.com/documentation/features/register)** — the documents and
  summaries of a period, reclassification, and the MIPYME backup.
- **[Certification](https://dte.arrowsw.com/documentation/certification)** — the SII test sets, their books, the
  simulation, the exchange, a resumable runner, and the certification of receipts.
- **[Printed samples](https://dte.arrowsw.com/documentation/features/printed-samples)** — one PDF per document with
  its PDF417 stamp, and a receipt on continuous paper.
- **[Schemas](https://dte.arrowsw.com/documentation/api-reference/schemas)** and
  **[catalogs](https://dte.arrowsw.com/documentation/api-reference/catalogs)** — the SII's schemas inside the package,
  and its code tables.
- **[Typed errors](https://dte.arrowsw.com/documentation/features/errors)** — `DteError` with a stable `code` and the
  offending value in `details`, never in the message.

## Entry points

| Import from        | What it holds                                                                              | Runs on                                    |
| ------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `dte-sdk`          | Documents, signatures, envelopes, books, assignment, received documents, SII web services  | Node, Bun, Deno; bundles for the browser   |
| `dte-sdk/node`     | On-disk token cache, HTTP capture, upload archive and folio registry; CAF files; HTTPS     | Node                                       |
| `dte-sdk/portal`   | SII portal, folios and CAFs, register, MIPYME backup, activity verification, certification | Node                                       |
| `dte-sdk/pdf`      | Printed samples                                                                            | Node, with `pdf-lib` and `bwip-js`         |
| `dte-sdk/schemas`  | The SII's schemas and validation against them                                              | Node, with `xmllint-wasm`                  |
| `dte-sdk/catalogs` | The SII's large code tables, such as the business activities                               | Node, Bun, Deno; bundles for the browser   |

More on each entry: [Entry points](https://dte.arrowsw.com/documentation/entry-points).

## Status

Every area is tested against synthetic SII answers, with a 100 % coverage gate in CI. Those tests cannot show how the
real SII answers: [Project status](https://dte.arrowsw.com/documentation/status) says, area by area, what has met it so
far, in production and in certification. The live runs that come before 1.0.0 are tracked in
[issue 8](https://github.com/arrowsw/dte-sdk/issues/8), and the release notes of every version are in the
[CHANGELOG](./CHANGELOG.md).

## Development

```bash
npm install          # also builds via `prepare`
npm test             # unit, property, type-level and dist smoke tests
npm run build        # esbuild + tsc declarations
npm run lint         # ESLint + Prettier
npm run size         # bundle size guard
npm run scan         # no real RUTs, local paths or secrets in tracked files
```

Releases are tag-triggered and published from CI with npm provenance: see [RELEASING.md](./RELEASING.md). Security
reports: [SECURITY.md](./SECURITY.md).

## Contributing

Contributions are welcome — feel free to open issues for bugs and feature requests, or submit a pull request.

## License

[MIT](./LICENSE) © Arrow Software
