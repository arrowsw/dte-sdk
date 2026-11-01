<div align="center">
  <h1>dte-sdk: Chilean electronic tax documents (DTE) with TypeScript.</h1>

[![npm version](https://img.shields.io/npm/v/dte-sdk?color=000&label=npm)](https://www.npmjs.com/package/dte-sdk)
[![types included](https://img.shields.io/npm/types/dte-sdk?color=000)](https://www.npmjs.com/package/dte-sdk)
[![license](https://img.shields.io/npm/l/dte-sdk?color=000)](./LICENSE)

</div>

`dte-sdk` builds, stamps and signs Chilean **DTE** (Documento Tributario
Electrónico) the way the SII expects them, with a readable English API and
bilingual (EN/ES) documentation on every field.

- 🧾 **Document types** 33, 34, 39, 41, 43, 46, 52, 56 and 61.
- 🧮 **Totals done right** — per-line rounding, exempt and non-billable lines,
  VAT-included prices (`MntBruto`), global discounts, purchase-invoice withholding.
- 🔏 **TED + XMLDSig** — the electronic stamp signed with the CAF key and the
  enveloped signature the SII validates, byte for byte.
- ✉️ **Envelopes** — `EnvioDTE` and `EnvioBOLETA` with cover and signed `SetDTE`.
- 🪪 **Certificates** — PKCS#12 (`.pfx`/`.p12`, legacy and modern) or PEM; the
  holder RUT is read from the certificate.
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

encodeLatin1(envelope.xml) // ISO-8859-1 bytes, ready for the SII upload
```

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

## Status codes

`classifyUploadStatus('EPR')` → `'accepted'`, `classifyUploadStatus('RCT')` → `'rejected'`,
`classifyUploadStatus('-11')` → `'queryError'` (retry). `classifyDocumentStatus('FAU')` → `'notReceived'`.
Spanish glosses via `uploadStatusMessage` and `documentStatusMessage`.

## Development

```bash
npm install          # also builds via `prepare`
npm test             # unit, property, type-level and dist smoke tests
npm test -- --coverage
npm run build        # esbuild (ESM + CJS) + tsc declarations
npm run lint         # ESLint flat config + Prettier
npm run size         # bundle size guard (.size-limit.json)
npm run scan         # no real RUTs, local paths or secrets in tracked files
```

Releases are tag-triggered and published from CI with npm provenance — see
[RELEASING.md](./RELEASING.md).

## Contributing

Contributions are welcome — feel free to open issues for bugs and feature
requests, or submit a pull request.

## License

[MIT](./LICENSE) © dte-sdk contributors
