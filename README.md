<div align="center">
  <h1>dte-sdk: Chilean electronic tax documents (DTE) with TypeScript.</h1>

[![npm version](https://img.shields.io/npm/v/dte-sdk?color=000&label=npm)](https://www.npmjs.com/package/dte-sdk)
[![downloads](https://img.shields.io/npm/dm/dte-sdk?color=000)](https://www.npmjs.com/package/dte-sdk)
[![bundle size](https://deno.bundlejs.com/badge?q=dte-sdk&treeshake=[*]&config=%7B%22esbuild%22%3A%7B%22platform%22%3A%22node%22%7D%7D)](https://bundlejs.com/?q=dte-sdk&treeshake=[*]&config=%7B%22esbuild%22%3A%7B%22platform%22%3A%22node%22%7D%7D)
[![types included](https://img.shields.io/npm/types/dte-sdk?color=000)](https://www.npmjs.com/package/dte-sdk)
![dependencies](https://img.shields.io/badge/dependencies-4-000)
[![license](https://img.shields.io/npm/l/dte-sdk?color=000)](./LICENSE)

</div>

> **⚠️ Not ready for production.** `dte-sdk` is under active development, and its use is not recommended until it
> reaches version **1.0.0**, the release that will mark the library as mature enough to run in production. Until then
> the API can change in any release, and much of what this README describes has not met the real SII yet: see
> [Status](#status).

`dte-sdk` builds, stamps and signs Chilean **DTE** (Documento Tributario
Electrónico) the way the SII expects them, sends them through the SII web
services and tracks them. It also covers what surrounds issuing: the SII books,
the certificate-authenticated SII portal (folios, the purchase and sales
register, the MIPYME backup), the certification process and the printed
samples. The API is readable English, with bilingual (EN/ES) documentation on
every field.

- 🧾 **Document types** 33, 34, 39, 41, 43, 46, 52, 56 and 61, and the export documents 110, 111 and 112.
- 🧮 **Totals done right** — per-line rounding, exempt and non-billable lines, the deposit guarantee of containers,
  VAT-included prices (`MntBruto`), global discounts, purchase-invoice withholding,
  commissions taken off the total of a settlement invoice, and export amounts in their currency with four decimals,
  converted to pesos exactly.
- 🔏 **TED + XMLDSig** — the electronic stamp signed with the CAF key and the
  enveloped signature the SII validates, byte for byte.
- ✉️ **Envelopes** — `EnvioDTE` and `EnvioBOLETA` with cover and signed `SetDTE`.
- 📥 **Received documents** — the signature, the stamp and the CAF of every document a supplier
  sends, and the SII's signature over that CAF.
- 🪪 **Certificates** — PKCS#12 (`.pfx`/`.p12`, legacy and modern) or PEM; the
  holder RUT is read from the certificate.
- 📡 **SII web services** — seed/token, `DTEUpload` and the receipts REST API, envelope and
  document status, polling, acceptance/claims; injectable transport, retries, HTTP capture
  with redaction and an upload archive. TLS verification stays on.
- 📚 **SII books** — the purchase and sales book, the dispatch guide book and the folio
  consumption report, with their summaries computed from the lines.
- 🏛️ **SII portal and folios** — certificate login with reused sessions, company data, folio
  quota, CAF requests, annulment and re-obtaining, and a local folio registry.
- 🗂️ **Purchase and sales register and MIPYME backup** — the documents and official summaries of
  a period, purchase reclassification, and the XML of issued and received documents.
- 🔎 **Activity verification** — the status of the verification the SII requires before issuing
  documents with VAT, unstable for now, and the documents it takes to accredit an activity.
- 🎓 **Certification** — the SII test sets parsed and issued, their books, the simulation, the
  exchange answers, and a resumable runner over the certification portals; and the certification
  of receipts (boletas), an application of its own, as pieces to chain.
- 🖨️ **Printed samples** — one PDF per document following the SII manual, with its PDF417 stamp.
- 🧠 **Fully typed** — a domain model in English (`totalAmount`, `issuer.businessName`)
  that maps to the official SII tags (`MntTotal`, `RznSoc`) through a codec.
- 🇨🇱 **RUTs by [rut.ts](https://github.com/arrowsw/rut.ts)** — `dte-sdk` handles every RUT
  value with rut.ts, the most complete RUT library there is, with a world-class implementation.
  Every RUT is validated and normalized by it; nothing is reimplemented here.
- 🛡️ **Typed errors** with stable codes and no personal data in messages.

## Contents

- [Status](#status)
- [Installation](#installation)
- [Entry points](#entry-points)
- [Quick start](#quick-start)
- [Step by step](#step-by-step): [transport of goods](#transport-of-goods),
  [settlement invoices](#settlement-invoices), [export documents](#export-documents), [receipts](#receipts)
- [Validating against the SII's schemas](#validating-against-the-siis-schemas)
- [Answering a received envelope](#answering-a-received-envelope)
- [Assigning an invoice](#assigning-an-invoice)
- [Received documents](#received-documents)
- [SII web services](#sii-web-services)
- [SII books](#sii-books)
- [SII portal and folios](#sii-portal-and-folios)
- [Purchase and sales register and MIPYME backup](#purchase-and-sales-register-and-mipyme-backup)
- [Activity verification](#activity-verification)
- Certification: [test sets, simulation and books](#certification-test-sets-simulation-and-books),
  [the runner](#certification-the-runner),
  [the exchange and the printed samples](#certification-the-exchange-and-the-printed-samples),
  [receipts](#certification-receipts)
- [Printed samples (Node)](#printed-samples-node)
- [Catalogs](#catalogs)
- [Errors](#errors) and [status codes](#status-codes)
- [Development](#development)

## Status

0.1.0 was the first release with a public API. 0.2.0 added the catalog of the register's document codes, 0.3.0 the
activity verification, still unstable, and 0.4.0 the verification of received documents. 0.5.0 keeps the CAFs a batch
request already holds when a later trip fails, and writes the folio registry for its owner only. 0.6.0 does the same for
annulling, getting ranges back and the exact request, and logs what stopped a flow with every text redacted. 0.7.0
settles the gaps an application found while it was built on dte-sdk, in the folio flows, CAF files and CAF parsing, and
the receiver's answer, which reads a failed query as `unknown`. 0.8.0 reads a document the SII marked paid in cash,
which the registry takes no answer on, as `paidInCash`, and names the registry's code 27. 0.9.0 keeps a document type
stocked with folios in one call, `unstable_replenishFolios`, still unstable because it has not run against the SII,
and keeps the CAF a request delivered when the pause after it is cut short. 0.9.1 moves the runtime dependencies past
their published advisories and publishes declarations that compile without `@types/node-forge`. 0.10.0 writes the four
transport fields of 2026 on dispatch guides and invoices, and works out the totals of a settlement invoice (43) with its
commissions, refusing before stamping what the schema of its root does not declare; both are checked against
`DTE_v10.xsd`, and neither has been sent to the SII. 0.11.0 writes a receipt (39, 41) in the shape of its own schema,
`EnvioBOLETA_v11.xsd`, refusing before stamping what that schema does not declare, and prints the transport area of a
dispatch guide, or of an invoice that moves goods, on the printed sample; receipts are checked against that schema, and
none has been sent to the SII. 0.12.0 answers a received envelope document by document, with the reception answer, the
commercial result and the receipts of goods, where nothing is accepted or receipted unless the caller decides it;
prints a receipt on continuous paper, with the printed stamp as an option; and writes the numbers of a document with
the decimals its schema holds and holds an upload to the cover of its file. The answers and the documents are checked
against the SII's schemas, and none has been sent. 0.13.0 adds the SII's code tables, with the business activities in a
new entry, `dte-sdk/catalogs`; prints a document over several pages, with a settlement invoice's commissions and the
withholdings; issues the settlement set from the certification runner; and refuses before stamping what the SII
rejects in a document's content, which now asks for the issuer's activity code outside a receipt. None of it has been
sent to the SII. 0.14.0 prints on the printed sample the fields Formato DTE 2.5 marks to be printed, and writes more of
the document in words; it reads a document received from a third party from the bytes of its file and prints its stamp
as it was signed, and it bounds the key a received document names before a signature is checked with it. None of it has
been sent to the SII. 0.15.0 issues the export documents (110, 111 and 112) under their own root, builds and signs the
assignment of an invoice and registers it, and validates a document against the SII's schemas at run time from a new
entry, `dte-sdk/schemas`; from `dte-sdk/portal` it signs in with a tax password, reads the purchase and sales register
as a file and reads the mailbox an issuer registered for the exchange; and it works a line's amounts out over decimal
digits and writes each line as field 38 of Formato DTE 2.5 asks. The export documents and the assignment file are
checked against the SII's schemas, and none of it has been sent to the SII. Every area this README describes ships in
0.15.0.
Releases before 1.0.0 come out as the work lands, without waiting for the runs against the
real SII; those runs come before 1.0.0, the first version recommended for production.

Every area is tested against synthetic SII answers, with a 100 % coverage gate in CI. Those tests cannot show how the
real SII answers, so this table says what has met it so far, in each of the SII's environments: production and
certification (maullin). "Not recorded" means no run has been written down, not that the SII refused one; a dash means
the SII offers it in the other environment only.

| Area                                                           | Entry            | Production                                                                                                                                                                                                                                                                                                                                                            | Certification (maullin)                                                                                                                                                         |
| -------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documents, stamps, signatures and envelopes                    | `dte-sdk`        | Not sent yet                                                                                                                                                                                                                                                                                                                                                          | Not sent yet                                                                                                                                                                    |
| Verification of received documents                             | `dte-sdk`        | A local check with no SII call: not run on a supplier's document yet. The tests sign test CAFs with a test SII key, and the SII's keys met real CAFs only in a check by hand                                                                                                                                                                                          | Same as production                                                                                                                                                              |
| Web services: seed and token, SOAP                             | `dte-sdk`        | Yes, 2026-11-09 and 10: a token for a seed the certificate signed, reused between calls                                                                                                                                                                                                                                                                               | Not run yet ([issue 8](https://github.com/arrowsw/dte-sdk/issues/8))                                                                                                            |
| Web services: seed and token, receipts REST                    | `dte-sdk`        | Not run yet                                                                                                                                                                                                                                                                                                                                                           | Not run yet ([issue 8](https://github.com/arrowsw/dte-sdk/issues/8))                                                                                                            |
| Web services: uploads and their status                         | `dte-sdk`        | Not run yet                                                                                                                                                                                                                                                                                                                                                           | Not run yet ([issue 8](https://github.com/arrowsw/dte-sdk/issues/8))                                                                                                            |
| Web services: acceptance and claim registry                    | `dte-sdk`        | Yes, 2026-11-09 and 10, on one received invoice (type 33): `registerClaim` answered 0 for `ERM` and then for `ACD`; `listClaimEvents` answered 16 (no events) before and 15 (both events) after; `queryReceptionDate` gave the reception date and `receiverAnswer` the deadline. On 2026-11-11, `registerClaim` answered 27 for `ACD` on an invoice paid in cash, whose events listed `PAG` alone. The claims (`RCD`, `RFP`, `RFT`) and `queryTransferable` not run yet | Not run yet ([issue 8](https://github.com/arrowsw/dte-sdk/issues/8))                                                                                                            |
| Public registry of authorized issuers                          | `dte-sdk`        | Not recorded                                                                                                                                                                                                                                                                                                                                                          | Not recorded                                                                                                                                                                    |
| SII books                                                      | `dte-sdk`        | Not sent yet; they validate against the official schemas in the tests                                                                                                                                                                                                                                                                                                 | Not sent yet                                                                                                                                                                    |
| Assignment of invoices (AEC)                                   | `dte-sdk`        | Not sent yet; the files validate against the official schema in the tests                                                                                                                                                                                                                                                                                             | Not sent yet                                                                                                                                                                    |
| Portal session                                                 | `dte-sdk/portal` | Yes, 2026-11-09 and 10: certificate login and the session reused between reads, for a company not enrolled as an issuer                                                                                                                                                                                                                                               | Not recorded                                                                                                                                                                    |
| Company data and the refusal pages                             | `dte-sdk/portal` | Not recorded                                                                                                                                                                                                                                                                                                                                                          | Not recorded                                                                                                                                                                    |
| Folios and CAF requests                                        | `dte-sdk/portal` | Not run yet: they need an enrolled company                                                                                                                                                                                                                                                                                                                            | Not run yet: they need an enrolled company; the tests replay the pages this environment served to one                                                                           |
| Purchase and sales register: reads                             | `dte-sdk/portal` | Yes, 2026-11-09 and 10, for a company with one received invoice: `fetchRegisterSummary`, `listPeriodDocuments`, `fetchPurchaseDocument` and `listPurchaseTypes` answered with its rows. `createdAt` (`det_fec_creacion`) comes as milliseconds since the epoch. Right after a claim, the listing's summary call answered HTTP 503 twice and answered on the next read | Not recorded                                                                                                                                                                    |
| Purchase and sales register: writes, MIPYME backup             | `dte-sdk/portal` | Not run yet                                                                                                                                                                                                                                                                                                                                                           | Not run yet                                                                                                                                                                     |
| Activity verification                                          | `dte-sdk/portal` | Read on 2026-11-09 for a conditioned verification pending accreditation, as before for a pending one; an approved one not seen yet, so the read stays unstable                                                                                                                                                                                                        | —                                                                                                                                                                               |
| Certification sets, runner, exchange and upload of the samples | `dte-sdk/portal` | —                                                                                                                                                                                                                                                                                                                                                                     | Not run yet; the exchange answers validate against the official schemas in the tests                                                                                            |
| Certification of receipts (boletas)                            | `dte-sdk/portal` | —                                                                                                                                                                                                                                                                                                                                                                     | Not run yet: it needs a company enrolled in the receipts application; the receipts envelope and the folio consumption report validate against the official schemas in the tests |
| Printed samples                                                | `dte-sdk/pdf`    | —                                                                                                                                                                                                                                                                                                                                                                     | Not reviewed by the SII yet                                                                                                                                                     |

The production runs of 2026-11-09 and 10 came from an application built on dte-sdk, for one company, on 0.3.0 and
then 0.4.0. Earlier runs, whose environment wasn't written down, answered the portal's login and logout, the taxpayer
data and the refusal pages for a company not enrolled as an issuer, and the register's read-only requests for a company
with no documents.

Still to come before 1.0.0: running every area against the real SII, starting with the live runs tracked in
[issue 8](https://github.com/arrowsw/dte-sdk/issues/8). Also open: the detail calls of the purchase and sales register,
to be compared against real answers ([issue 14](https://github.com/arrowsw/dte-sdk/issues/14)), and the improvements of
the certification runner set aside to keep it to field behaviour, to be weighed after the first real certification
([issue 29](https://github.com/arrowsw/dte-sdk/issues/29)).

Planned, with no date:

- **A received document checked against its schema and its content,** besides its signature, its stamp and its CAF.
- **The backup's two-day range,** which today downloads only its first day when it holds more than 20 documents.
- **A lock for the directory folio registry that holds across processes.** Today it is for a single process.

Out of scope: forms F29 and F22, which are tax returns and not electronic documents, and may be offered later as a
separate tool; fee receipts (boletas de honorarios); the exchange e-mail; and issuing through the SII's free invoicing
system, which is for a company that issues without software of its own.

## Installation

```bash
npm install dte-sdk
```

Node ≥ 22.12. The package ships ES modules only, and a CommonJS project loads it with `require()` just the same. Printed
samples need two more packages, which stay out of the install otherwise:

```bash
npm install pdf-lib bwip-js
```

And validating a document against the SII's schemas needs one, `xmllint-wasm`, on the same terms:

```bash
npm install xmllint-wasm
```

## Entry points

| Import from        | What it holds                                                                                                                                                                                                             | Runs on                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `dte-sdk`          | Documents, stamps, signatures, envelopes, books, the assignment of invoices, the verification of received documents and the SII web services client over `fetch`                                                          | Node, Bun, Deno; bundles for the browser with no configuration |
| `dte-sdk/node`     | `createNodeHttpsTransport`, `createDirectoryCapture`, `createDirectoryUploadArchive`, `createDirectoryTokenCache`, `createDirectoryFolioRegistry`, `findCafFiles`, `findLatestCafFile`, `resolveCafFile`, `cafFileScope`  | Node                                                           |
| `dte-sdk/portal`   | SII portal, folios and CAF requests, the folio registry, purchase and sales register, MIPYME backup, activity verification, and certification: sets, runner, exchange, upload of the samples and the receipts application | Node                                                           |
| `dte-sdk/pdf`      | Printed samples and the SII office of each commune (`SII_OFFICES`, `siiOfficeForCommune`)                                                                                                                                 | Node, with `pdf-lib` and `bwip-js` installed                   |
| `dte-sdk/schemas`  | The SII's schemas, inside the package, and the validation of a document against them (`validateAgainstSchema`, `schemaOf`, `SII_SCHEMAS`)                                                                                 | Node, with `xmllint-wasm` installed |
| `dte-sdk/catalogs` | The SII's large code tables: the business activities (`BUSINESS_ACTIVITIES`, `businessActivity`, `isBusinessActivityCode`)                                                                                                | Node, Bun, Deno; bundles for the browser with no configuration |

`DteError` and `isDteError` come from `dte-sdk` and recognize what every entry throws.

Jest in its default CommonJS mode cannot `require()` an ES module. Run it in ESM mode, or let it transform this package
with `transformIgnorePatterns`.

Signatures are RSA-SHA1 with PKCS#1 v1.5, which is deterministic: the same key and bytes give the same signature
whoever works it out. On Node, Bun and Deno the runtime's own RSA signs, an order of magnitude faster than the
JavaScript engine on a 2048-bit key, which is what an envelope of hundreds of receipts costs. The runtime is not taken
at its word: the first signature of the process is worked out both ways and compared, the runtime signs the ones that
follow only when they agree, and a key it refuses is signed by the JavaScript engine. In a browser the JavaScript
engine signs, as before. `rsaSigningEngine()` says which one is in charge (`native`, `portable`, or null before the
first signature). The runtime signs with an RSA key alone: any other key is left to the JavaScript engine, which
throws on it.

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
    issuer: {
      rut: '76543210-3',
      businessName: 'Comercial Andina SpA',
      businessActivity: 'Software',
      address: 'Av. Los Aromos 1540',
      commune: 'Santiago',
      activityCode: 620200,
    },
    receiver: {
      rut: '12345678-5',
      businessName: 'Comercializadora Rapel Ltda',
      businessActivity: 'Comercio',
      address: 'Pasaje Los Olmos 88',
      commune: 'Providencia',
    },
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
    cover: {
      issuerRut: '76543210-3',
      senderRut: certificate.rut!,
      resolutionDate: '2024-01-15',
      resolutionNumber: 123,
    },
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

A receipt has a schema of its own, and `createDocument` holds it to that schema: see [Receipts](#receipts).

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

`createDocument` writes numbers the way the schema holds them. A quantity and a unit price are rounded to six
decimals, and a percentage, the value of a global adjustment and the rate of a commission to two, half away from zero
over their decimal digits, before any amount is computed: `0.1 + 0.2` is written `0.3`, a percent of 1.005 is written
1.01, and every amount is the one of the numbers written. A line's amounts (`calculateLineAmount`) are worked out over
those decimal digits, not in binary floating point: the base is the quantity by the price, rounded half away from
zero to a whole peso, and the discount and the surcharge are each their percent of that base, rounded the same way, so
9.2 % of 375 is 34.5 and is written as 35. Formato DTE 2.5 does not say how a line is rounded; each percent is taken of
the base already rounded, not of the unrounded product. `calculateLineAmount` works out a line from its numbers alone:
it does not know the lines `createDocument` writes at zero, below. A global discount or surcharge in percent is taken
of the amount it applies to the same way, over decimal digits and half away from zero. A number too large for its type is refused with
`INVALID_AMOUNT`, and so is a line whose amount has more digits than a number holds, with `items[i].amount`, and a
line discount or surcharge in percent whose share of the line rounds to no peso, as 1 % of 49: the format writes a
percent with its amount (Formato DTE 2.5, fields 30 and 34 of the detail), and `DTE_v10.xsd` takes no amount of zero.
A receipt, whose schema does, follows the same rule. A percent of zero is left out, as no discount or surcharge, since
`PctType` starts at 0.01, and a negative one is refused with `INVALID_AMOUNT`, as is one above 100 on a receipt (39,
41) once written with its two decimals, whose schema stops there where `DTE_v10.xsd` goes up to 999.99. A unit price
of zero is left out the same way, since `PrcItem` starts at 0.000001 and the format lets a transfer that is not a sale
leave it out (field 22 of the detail): the line is one without a price. A negative price is refused with
`INVALID_AMOUNT`; a negative line of a settlement invoice (43) is an `amount` with no price. A quantity, a reference
quantity or a reference price at or below zero, which their `Dec12_6Type` (a `Dec5Type` on a receipt) does not admit,
is refused with `INVALID_AMOUNT` on its field, on every line. With `unitPriceDecimals` the price is written with those
decimals over its decimal digits, padded with zeros, and fewer decimals than the price has are refused with
`INVALID_OPTION`, since `PrcItem` would be another price than the one the amount is worked out with. A line's `amount`
is taken
as it comes on a line with no price; on a line with one, `MontoItem` is the price by the quantity less the discount
plus the surcharge (Formato DTE 2.5, field 38 of the detail), and a given amount that is not that one is refused with
`TOTAL_MISMATCH`, the amount the price gives in `details.expected`. The same field makes some lines zero: a line that
is not a sale (`IndExe` 4 or 5) and every line of a credit note that corrects a text (61 or 112 with a reference of
`code` 2) are written with an amount of zero whatever their price, a given amount other than zero is refused with
`TOTAL_MISMATCH` and `expected` 0, and a percent on them is refused with `INVALID_AMOUNT`, as a global adjustment or
a commission on such a credit note is with `INVALID_OPTION`. A given zero is also taken on a priced line with no
percent of a dispatch guide whose `transferType` is not 1, a transfer that is not a sale; a given -0 is written 0.
The totals follow `IndExe` as Formato DTE 2.5 reads it, and a line's `IndExe` is 1 to 6 or none, the values the
schemas admit: any other, `null` included, is refused with `INVALID_OPTION`. `nonBillableAmount` (`MontoNF`, field
125) is the lines with `IndExe` 2 less the lines with `IndExe` 6, so it may be negative, and stays out of the total.
`depositGuarantee` (`GrntDep`, field 120) is the lines with `IndExe` 3, the deposit guarantee of containers, and is
added to the total (field 124). The format gives it to a 33, 34, 56 and 61 alone: on a dispatch guide (52) or a
purchase invoice (46) a line with `IndExe` 3 keeps its amount and is in no total, and a `depositGuarantee` other than
zero, or one that is not a number, is refused on any other type with `INVALID_OPTION`; a given zero is none. A
settlement invoice (43) and an export document refuse a line with `IndExe` 3 with `INVALID_OPTION` too. That is this
library's choice: the format's `IndExe` row admits the indicator on both. A line with `IndExe` 4 or 5 is in no total.
A line with a price and no quantity is written with the quantity it is computed with, 1, and so is
every line of a dispatch guide (52) that brings none. On a purchase invoice (46), or any document with
`withholdVat: true`, each VAT-affected line carries additional tax code 15, the one the withholding is summed over,
unless it brings codes of its own. A line's `withholdingAgent` writes `Retenedor`, the element of a transaction of a withholding agent: `{}` marks the line
(`IndAgente` R), and `slaughterBase`, `marginBase` and `finalConsumerPrice` are the bases it may declare (`MntBaseFaena`,
`MntMargComer`, `PrcConsFinal`). No type gets it by default, and a receipt and a settlement invoice refuse it, since
their lines have no such element.

### What the SII would reject, caught before stamping

The SII rejects a document whose content breaks its rules after the folio is spent, and a schema error takes the whole
envelope with it. `createDocument` refuses these before anything is stamped, with the field in `details.field`; each
check stops at the first fault it finds:

| Rule | Source | Error |
|---|---|---|
| At most 60 lines, and 1,000 on a receipt | `DTE_v10.xsd`, `EnvioBOLETA_v11.xsd` | `INVALID_OPTION` (`items`) |
| The issuer's `activityCode`, on every type but a receipt | `Acteco`, Formato DTE 2.5 field 37 | `MISSING_FIELD`, or `INVALID_OPTION` outside 1 to 999999 |
| An informative subtotal's `description`, on every type but a receipt | `GlosaSTI` | `MISSING_FIELD` |
| A line amount that is a whole number, and not negative outside a 43 | `MontoItem` | `INVALID_AMOUNT` (`items[i].amount`) |
| A given line amount on a line with a price is the price by the quantity less the discount plus the surcharge, or a zero with no percent on a dispatch guide that is not a sale | Formato DTE 2.5 field 38 of the detail | `TOTAL_MISMATCH` (`items[i].amount`), with `expected` and `actual` |
| A line that is not a sale (`IndExe` 4 or 5), and every line of a credit note that corrects a text, is zero and has no percent | Formato DTE 2.5 field 38 of the detail | `TOTAL_MISMATCH` (`items[i].amount`, `expected` 0), or `INVALID_AMOUNT` (`items[i].discountPercent`, `items[i].surchargePercent`) |
| A unit price above zero, when one is given (a price of zero is left out) | `PrcItem`, `Dec12_6Type`, and `Dec5Type` on a receipt | `INVALID_AMOUNT` (`items[i].unitPrice`) |
| A quantity, a reference quantity and a reference price above zero | `QtyItem`, `QtyRef`, `PrcRef`, `Dec12_6Type`, and `Dec5Type` for a receipt's `QtyItem` | `INVALID_AMOUNT` (`items[i].quantity`, `items[i].referenceQuantity`, `items[i].referencePrice`) |
| A price written with no fewer decimals than it has | `PrcItem`, Formato DTE 2.5 field 38 of the detail | `INVALID_OPTION` (`items[i].unitPriceDecimals`) |
| A credit note that cancels a document or corrects a text, and a debit note that cancels a credit note, have one document reference besides a `SET` one | Formato DTE 2.5, the `CodRef` row | `INVALID_OPTION` (`references[i]`) |
| A credit note that corrects a text has no global adjustment and no commission | Formato DTE 2.5 field 38 of the detail | `INVALID_OPTION` (`globalAdjustments[0]`, `commissions[0]`) |
| A line percent of 100 at most on a receipt | `DescuentoPct`, `RecargoPct` of `EnvioBOLETA_v11.xsd` | `INVALID_AMOUNT` (`items[i].discountPercent`, `items[i].surchargePercent`) |
| A line's `IndExe` is 1 to 6, when one is given, and not `null` | `IndExe` | `INVALID_OPTION` (`items[i].exemptIndicator`) |
| A deposit guarantee line (`IndExe` 3) on no 43 or export document, which dte-sdk chooses, and a `depositGuarantee` other than zero only on a 33, 34, 56 or 61 | Formato DTE 2.5 field 120 | `INVALID_OPTION` (`items[i].exemptIndicator`, `totals.depositGuarantee`) |
| A dispatch guide (52) states its transfer | `IndTraslado`, Formato DTE 2.5 field 7 | `MISSING_FIELD` (`options.transferType`) |
| Net, exempt, VAT, deposit guarantee and total that are whole numbers, and not negative outside a 43 | `MntNeto`, `MntExe`, `IVA`, `GrntDep`, `MntTotal` | `INVALID_AMOUNT` |
| An invoice (33) declares its VAT | validation 55 | `MISSING_FIELD` (`totals.vatAmount`) |
| An exempt invoice (34) has an exempt amount above zero, and no net amount or VAT | validation 57 | `MISSING_FIELD` or `INVALID_AMOUNT` |
| The total adds up: net + exempt + VAT + the deposit guarantee, less the VAT withheld and the commissions | Formato DTE 2.5 field 124 | `TOTAL_MISMATCH`, with `expected` and `actual` |
| The period amount is the total plus the non-billable amount | Formato DTE 2.5 field 126 | `TOTAL_MISMATCH` |
| On an export document, a line amount, an exempt amount and a total from zero up with four decimals at most, and a total that is the exempt amount, or zero without payment | `MontoItem`, `MntExe`, `MntTotal` of `Exportaciones`, Formato DTE 2.5 field 124 | `INVALID_AMOUNT`, `TOTAL_MISMATCH` |

The validations are those of the SII's "Nuevas validaciones a la IECV, DTE y DJ 3327 y 3328". They hold for totals
worked out from the lines and for totals given by hand. A document the SII accepts with an objection (a "reparo") is
built, and the validations that object to it are listed in `warnings`:

```typescript
const settlement = createDocument({
  type: 43,
  folio: 3,
  issuer,
  receiver,
  items: [{ name: 'Venta por cuenta de terceros', unitPrice: 1000, settledDocumentType: '33' }],
  commissions: [{ kind: 'commission', description: 'Comisión', netValue: 1000 }],
})
settlement.header.totals.totalAmount // 0
settlement.warnings // [{ validation: 10, field: 'totals.totalAmount' }]: a total of zero, objected to in the book
```

Validation 10 is a total of zero on a 33, 34, 43 or 46, 12 a net amount of zero on a 33, 43 or 46, and 56 an invoice
(33) whose net amount is not above zero. `warnings` is absent when there is nothing, is never written to the XML, and
travels to the signed document. `createEnvelope` holds an `EnvioDTE` to 2,000 documents and an `EnvioBOLETA` to 500
(`INVALID_OPTION`, `documents`).

Not checked yet: a total whose totals carry a tax code other than 15, since which of those codes add to the total and
which come off it waits for the catalog of additional taxes; and the generic receiver 66666666-6 on a type that is not
a receipt.

### Transport of goods

A dispatch guide (52), or an invoice that moves goods, carries its transport in `transport`, with the fields
Res. Ex. 144/2026 asks for since November 1, 2026:

```typescript
import { createDocument, DISPATCH_TYPES, TRANSFER_TYPES } from 'dte-sdk'

const guide = createDocument({
  type: 52,
  folio: 1,
  issuer,
  receiver,
  items: [{ name: 'Cajón de manzanas', quantity: 10, unitPrice: 8000 }],
  options: { transferType: TRANSFER_TYPES.sale, dispatchType: DISPATCH_TYPES.byIssuerToReceiver },
  transport: {
    licensePlate: 'ABCD12', // Patente
    trailerLicensePlate: 'JK1234', // PatenteCarro
    carrierRut: '12345678-5', // RUTTrans
    driver: { rut: '12345678-5', name: 'Juan Pérez' }, // Chofer
    destinationAddress: 'Bodega 1', // DirDest
    destinationCommune: 'Maipú', // CmnaDest
    destinationCity: 'Santiago', // CiudadDest
    departureDate: '2026-11-15', // FchSalida
    departureTime: '08:30', // HraSalida, written as 08:30:00
    arrivalDate: '2026-11-16', // FchLlegada
  },
})
```

Every field is optional, as the SII's schema declares them: Formato DTE 2.5 marks the plates, the departure and the
arrival mandatory on a guide, but the resolution makes the departure time optional and lets what is unknown when
issuing be completed by a later guide. Before stamping, `createDocument` holds both plates to 8 characters, the dates to
real days from 2003-04-01 to 2050-12-31 (`INVALID_DATE`) and the time to `HH:MM:SS` or `HH:MM` (`INVALID_TIME`).
`transferType` (`IndTraslado`) is required on a guide, as Formato DTE 2.5 marks it (field 7), and a guide without it
is refused with `MISSING_FIELD`. It takes 1 to 9, the values the schema admits: the three types the resolution adds (a
transfer of more than one day, as a sale or not, and an outsourced transfer) wait until the schema admits them, and
`createDocument` refuses any other value with `INVALID_OPTION`. The [printed sample](#printed-samples-node) prints the transport area with
whatever of these fields the document carries.

### Settlement invoices

A settlement invoice (43) is what an agent issues to the principal it sells for. Its lines are the documents it
settles, each with the type of the settled document (`settledDocumentType`, the SII's `TpoDocLiq`), and `commissions`
holds what the agent charges:

```typescript
import { createDocument } from 'dte-sdk'

const settlement = createDocument({
  type: 43,
  folio: 1,
  issuer,
  receiver, // with its businessActivity: the schema asks the receiver of a 43 for GiroRecep
  items: [{ name: 'Ventas de octubre', unitPrice: 100000, settledDocumentType: '33' }],
  commissions: [
    { kind: 'commission', description: 'Comisión 10%', rate: 10, netValue: 10000 }, // ValComIVA worked out: 1900
    { kind: 'otherCharge', description: 'Flete', exemptValue: 2500 },
  ],
})

settlement.header.totals
// { netAmount: 100000, vatRate: 19, vatAmount: 19000,
//   commissions: { netValue: 10000, exemptValue: 2500, vatValue: 1900 },
//   totalAmount: 104600 }  →  119000 − 10000 − 2500 − 1900
```

The totals follow Formato DTE 2.5. The summary of commissions in the totals (`Totales/Comisiones`, fields 121 to 123)
holds the net and the exempt value of the lines added up and the VAT of the charges, and the total (`MntTotal`, field
124) is net + exempt + VAT less the three. On a settlement invoice the total may be zero or negative, and so may the net, the exempt amount and the VAT when
it settles negative lines: the schema declares them as signed values under `Liquidacion`, the root of a 43, and the
stamp carries the same total with its sign in `MNT`.

A commission line needs a net value or an exempt one. The schema asks every line for both, so the one it lacks is
written as zero. Its `vatValue` is the one you pass or, without one, its net value by the VAT rate, rounded; pass
`vatValue: 0` for a line that carries none. The VAT in the summary is the VAT rate by the summary's net value, rounded
once: that is what the SII checks on a settlement invoice, in validation 38 of its
[new validations for the books and the DTE](https://www.sii.cl/factura_electronica/compra_venta.pdf) ("el IVA de las
Comisiones debe ser igual a la tasa del IVA (19%) por el Valor Neto de las Comisiones"). The Formato describes field 123
as the sum of the lines' VAT, and the two can be a peso apart: three charges of 1,003 net carry 191 each, 573 if added
up, and the summary carries 572. When a line states its `vatValue`, the summary is the sum of the lines instead. Totals
passed in `totals` are written as given, which is also how the own and the third-party VAT (`IVAProp`, `IVATerc`) reach
the document.

`Liquidacion` declares less than the root of the other types, and `createDocument` refuses before stamping what the
schema would reject: `transport`, `globalAdjustments`, a line's `discountPercent` or `surchargePercent`, a reference's
`otherRut`, `totals.nonBillableAmount` and the options `noDebitReduction`, `dispatchType`, `transferType`,
`printFormat`, `exportPaymentTerms` and `netAmountsIndicator`, each with `INVALID_OPTION` and the field in
`details.field`. It asks for the receiver's `businessActivity` (`MISSING_FIELD`) and admits 60 lines. Commissions are
optional, as the schema declares them, up to 20 lines. A non-billable line (`exemptIndicator: 2`) stays out of the
totals, because a 43 has no `MontoNF`.

The same sums apply to the commission lines of a purchase invoice (46) and of the notes that correct one. The printed
sample prints the commissions and takes them off in its totals. The certification runner issues the settlement set:
see [The settlement set](#the-settlement-set).

### Export documents

An export invoice (110), and the export debit (111) and credit (112) notes that correct one, have a root of their own,
`Exportaciones`. Their receiver is abroad, under the generic RUT 55555555-5 (`FOREIGN_RECEIVER_RUT`, Formato DTE 2.5,
field 50), their amounts are in a foreign currency with decimals and exempt as a whole, and the customs area goes in
`transport.customs`:

```typescript
import { createDocument, FOREIGN_RECEIVER_RUT } from 'dte-sdk'

const exportInvoice = createDocument({
  type: 110,
  folio: 1,
  issuer,
  receiver: {
    rut: FOREIGN_RECEIVER_RUT,
    businessName: 'Andes Trading LLC',
    address: '1200 Harbor Blvd', // DirRecep: the address abroad
    city: 'Miami', // CiudadRecep: asked for on a 110; no commune is
    foreign: { id: '59-1234567', nationality: '225' }, // Extranjero: NumId, Nacionalidad
  },
  currency: 'DOLAR USA', // TpoMoneda, one of CURRENCIES
  exchangeRate: 950.25, // TpoCambio: writes the totals in pesos, OtraMoneda
  items: [{ name: 'Uva de mesa', quantity: 800, unit: 'KN', unitPrice: 12.25 }],
  transport: {
    customs: {
      saleModality: 1, // CodModVenta
      saleClause: 2, // CodClauVenta
      saleClauseTotal: 9800, // TotClauVenta
      transportRoute: 1, // CodViaTransp
      loadingPort: 906, // CodPtoEmbarque
      unloadingPort: 211, // CodPtoDesemb
      grossWeight: 8450.75, // PesoBruto, with its unit
      grossWeightUnit: 6, // CodUnidPesoBruto
      totalPackages: 800, // TotBultos
      packages: [{ code: 13, count: 800, marks: 'ANDES MIAMI 1-800' }], // TipoBultos
      freight: 150.25, // MntFlete: informative, not added to the total
      receiverCountry: 225, // CodPaisRecep
      destinationCountry: 225, // CodPaisDestin
    },
  },
  globalAdjustments: [
    { kind: 'surcharge', valueType: 'amount', value: 150.25, description: 'Flete', exemptIndicator: 1 },
  ],
})

exportInvoice.header.totals // { exemptAmount: 9950.25, totalAmount: 9950.25 }
exportInvoice.header.otherCurrency
// { currency: 'PESO CL', exchangeRate: 950.25, exemptAmount: 9455225, totalAmount: 9455225 }
```

- **The amounts.** A line is its quantity by its price rounded to the four decimals of `MontoItem`, less its discount
  and plus its surcharge, each its percent of that base rounded to a whole number, the only amount `DescuentoMonto` and
  `RecargoMonto` admit (`calculateExportLineAmount`). The totals are the exempt amount, the sum of the lines with no
  exemption indicator or with 1 and the global adjustments, and the total, the same amount, or zero on an export
  without payment (`exportPaymentTerms: '21'`, Formato DTE 2.5, field 124) (`calculateExportTotals`, which
  `calculateTotals` calls for these types). Each is worked out exactly, over the decimal digits as written, and rounded
  half away from zero. An amount goes up to the schema's 99 999 999 999 999.9999, and one worked out with more digits
  than a number holds, which would be written as another amount, is refused with `INVALID_AMOUNT` and the amount in
  `details.value` (on a line, with `items[i].amount` in `details.field`). A line discount or surcharge in percent
  whose whole amount is zero is refused with `INVALID_AMOUNT`, since the format writes a percent with its amount
  (fields 30 and 34 of the detail): leave the percent out of that line, as on any other type. A line's given `amount`
  is rounded to four decimals, and on a line with a price it is the amount the price gives or `TOTAL_MISMATCH`, and
  every line of an export credit note (112) that corrects a text is zero, as on any other type (field 38 of the
  detail). With `exchangeRate`, `OtraMoneda` carries the exempt amount and the total in Chilean pesos, as field 129
  asks: each the amount by the rate, rounded half away from zero to a whole peso (`convertToPesos`). The stamp carries
  the total as the document writes it, decimals and all.
- **What it refuses.** What `Exportaciones` does not declare: `pricesIncludeVat`, `withholdVat`, `commissions`, the
  options `noDebitReduction`, `transferType`, `printFormat`, `grossAmounts`, `purchaseTransactionType`,
  `saleTransactionType` and `netAmountsIndicator`, every total but `exemptAmount` and `totalAmount`, the transport's
  trailer plate, departure and arrival, and a line's `withholdingAgent`, `additionalTaxCodes` and `settledDocumentType`;
  a `serviceIndicator` other than 3 to 6 (`EXPORT_SERVICE_INDICATORS`); an `exportPaymentTerms` that is not a code of one
  or two digits; a `currency` outside the schema's list; a receiver whose RUT is not 55555555-5; a global adjustment
  without `exemptIndicator: 1`, since an export has no other amount to apply it to; and more than ten package types.
  Each throws `INVALID_OPTION` with the field in `details.field`; a code of the customs area with more digits than the
  schema admits, too. An amount past the schema's digits, below zero, or above zero where the schema asks it (freight,
  insurance, the exchange rate, the clause total) is `INVALID_AMOUNT`.
- **What it requires.** `currency` (`MISSING_FIELD`), and the total of packages when the package types are given. On
  an export invoice (110), what Formato DTE 2.5 asks: the receiver's city (field 62) and country (field 104), each
  weight's unit (fields 89, 91 and 93), and, unless the service indicator excuses them, the sale modality, clause and
  clause total (3, 4 or 5 excuse them, fields 74 to 76), the transport route (4 excuses it, field 77) and each line's
  quantity and unit (3, 4 or 5, fields 15 and 21 of the detail). A payment terms code needs its description (field 28).
- **What the other types refuse.** `currency`, `exchangeRate`, `receiver.foreign`, `transport.customs`, the issuer's
  `additionalBranchCode` and `additionalId` and a reference's `otherAdditionalId`, which only `Exportaciones` declares
  or which dte-sdk writes only there, and the service indicators 5 and 6.
- **Not checked yet.** The codes of the customs service's tables (countries, ports, sale modalities and clauses,
  transport routes, units, package types, payment forms) are written as given; whether a package is a container, and
  so carries its id, seal and seal issuer; the cancellation date of an export paid in advance; that a note references
  the export invoice it corrects; and the value of a global adjustment in another currency (`ValorDROtrMnda`). An
  export document is not printed yet (`renderPrintedSample` refuses it with `INVALID_DOCUMENT_TYPE`), and the
  certification runner has no export sets.

### Receipts

A receipt (39, 41) has a schema of its own, `EnvioBOLETA_v11.xsd`, much shorter than the invoice's, and
`createDocument` holds it to that schema before the folio is spent:

```typescript
const periodic = createDocument({
  type: 39,
  folio: 11,
  issuer, // the same issuer as an invoice: what a receipt is not written with is left out
  receiver: { rut: '12345678-5', businessName: 'Ana Rojas', address: 'Pasaje Los Olmos 88', commune: 'Ñuñoa' },
  softwareProviderRut: '76543210-3', // RUTProvSW: who provides the issuing software; the issuer's own if in-house
  items: [{ name: 'Internet hogar', unitPrice: 21840 }],
  options: {
    serviceIndicator: 2, // IndServicio: 1 and 2 periodic services, 3 sales and services (the default), 4 shows
    netAmountsIndicator: 2, // IndMntNeto: the lines carry net amounts; set by itself on a 39 without pricesIncludeVat
    billingPeriod: { from: '2026-11-01', to: '2026-11-30' }, // PeriodoDesde, PeriodoHasta
    dueDate: '2026-12-10', // FchVenc
    paymentMedium: '2', // MedioPago: on a receipt, a number from 1 to 5
  },
})
```

- **What a receipt admits.** Of `options`, the five above. Global discounts and surcharges, informative subtotals and
  its own `receiptReferences`. Lines with codes, a description, a discount or a surcharge, and an `exemptIndicator` of
  1, 2 or 6. Totals passed by hand may carry `nonBillableAmount`, `periodAmount` (written as the receipt's
  `TotalPeriodo`), `previousBalance` and `amountDue`.
- **What it refuses.** `transport`, `commissions`, `withholdVat: true`, any other field of `options`, a rate, an own
  or third-party VAT, withholdings or commissions in `totals`, and a line's reference quantity, unit or price, its
  additional tax codes, or an `exemptIndicator` of 3, 4 or 5: each throws `INVALID_OPTION` with the field in
  `details.field`, because the schema declares no element for it. `softwareProviderRut` and `netAmountsIndicator` are
  the reverse: only a receipt declares them, and any other type refuses them.
- **What is left out without an error.** The issuer's branch name, phone, e-mail, activity code and salesperson, and
  the receiver's business activity, which a receipt has no element for, so the same issuer serves both. The receiver's
  e-mail and postal address are left out too: the schema declares them and dte-sdk does not write them yet.
- **Not checked yet.** A receipt's `paymentMedium` has to be a number from 1 to 5 and is written as given; the rules
  for receipts over 135 UF, and the fields of tickets to shows, are not there either.

## Validating against the SII's schemas

The first thing the SII does with an upload is to validate it against its schemas, and one document that fails takes
the whole envelope with it. `dte-sdk/schemas` runs the same check before anything is sent, so finding out costs no
folio:

```typescript
import { validateAgainstSchema } from 'dte-sdk/schemas'

const issues = await validateAgainstSchema(envelope.xml) // [] when the document is valid
if (issues.length > 0) throw new Error(issues.map((issue) => `line ${issue.line}: ${issue.message}`).join('\n'))
```

It is an option, and nothing else in dte-sdk calls it. The schemas come inside the package: the SII's own files, in the
versions in force, for every document dte-sdk sends in an `EnvioDTE` or an `EnvioBOLETA`, the three books and the
answers to a received envelope and the assignment file (`DTE`, `EnvioDTE`, `EnvioBOLETA`, `LibroCV`, `LibroGuia`,
`ConsumoFolio`, `RespuestaEnvioDTE`, `EnvioRecibos` and `AEC`; `SII_SCHEMAS` lists them). The schema is the one of the document element unless
`schema` names another, and `schemaOf(xml)` says which that is. A receipt (39, 41) on its own has none, since only
`EnvioBOLETA_v11.xsd` declares its `DTE`: validate it inside its envelope. The document can be its text or the bytes
of its file, read in the charset its declaration names, ISO-8859-1 or UTF-8 under any of their usual names (`latin1`,
`UTF8`, `US-ASCII`); bytes that name another are refused with `INVALID_OPTION`. The validator, `xmllint-wasm`, is an optional peer loaded on first use:
without it the call throws `DEPENDENCY_UNAVAILABLE`. The messages are the validator's, in English, and name each
element with its namespace.

A valid document is not an accepted one. The schema checks the structure alone: what `createDocument` refuses before
stamping, the signatures, the stamps and the rules of content the SII applies after its schema are all checked
elsewhere, and the last ones only by the SII.

## Answering a received envelope

Every company that receives an `EnvioDTE` answers it with up to three signed documents, and each one is built on its
own: the reception answer, the commercial result and the receipts of Ley 19.983. The caller chooses the state and the
gloss of each document, with a function of the document and its position or a record keyed by type and folio; a `null`
leaves a document out.

```typescript
import { readFileSync } from 'node:fs'
import {
  COMMERCIAL_RESULT_STATES,
  createGoodsReceipts,
  createReceptionAnswer,
  createResultAnswer,
  decodeLatin1,
  readReceivedEnvelope,
} from 'dte-sdk'

const envelope = readReceivedEnvelope(decodeLatin1(readFileSync('EnvioDTE.xml')))
const answer = { companyRut: '76543210-3', certificate, contact: { name: 'Ana Rojas', mail: 'ana@example.cl' } }

// RespuestaDTE / RecepcionEnvio: a document addressed to another RUT is EstadoRecepDTE 3 by default
const reception = createReceptionAnswer(envelope, { ...answer, documents: { '33:1234': { state: 4 } } })

// RespuestaDTE / ResultadoDTE: only the documents decided, each accepted (0), with discrepancies (1) or rejected (2)
const result = createResultAnswer(envelope, {
  ...answer,
  documents: { '33:1234': { state: 2, gloss: 'Rechazado, Ley 19.983: la mercadería no se recibió', rejectionCode: -1 } },
})
COMMERCIAL_RESULT_STATES[1] // 'DTE Aceptado con Discrepancias'

// EnvioRecibos: only the documents decided; Ley 19.983 names the invoices (33, 34, 43, 46) and the guides (52)
const receipts = createGoodsReceipts(envelope, { ...answer, documents: { '33:1234': { place: 'Bodega central' } } })
```

Each function returns the signed XML, one line, with no declaration, ready to send to the issuer. Only the reception
answer has defaults, which follow the format of the SII (Formato Mensaje de Respuesta a DTE 1.0): the envelope is
received (`EstadoRecepEnv` 0) unless its cover names another receiver (3), and a document is received
(`EstadoRecepDTE` 0) unless it is addressed to another RUT (3). The commercial result and the receipts have none,
because accepting a document and acknowledging its goods have legal effect under Ley 19.983: `documents` is required
in both, a document without a decision is left out, and nothing is accepted, rejected or receipted unless the caller
says so. `documents: () => ({ state: 0 })` accepts every document and `documents: () => ({})` receipts every one. The
catalogs `ENVELOPE_RECEPTION_STATES`, `DOCUMENT_RECEPTION_STATES` and `COMMERCIAL_RESULT_STATES` hold the codes and
their glosses. The format defines no codes for `CodRchDsc`, the negative integer of up to 3 digits that tells the reason of a
rejection or a discrepancy: a rejection writes -1 unless `rejectionCode` says otherwise. Check the envelope with
`verifyReceivedDocuments` before answering 0 or accepting a document.

`readReceivedEnvelope`, and each function when it is given the text, reads the envelope the way
`verifyReceivedDocuments` reads it, strictly and from the same elements, so the documents answered are the documents
verified: an `EnvioDTE` or `EnvioBOLETA` with no DOCTYPE, one `SetDTE` with every `DTE` directly inside it, and each
document giving its own type, folio, date, issuer, receiver and total. Nothing is taken from the cover and no number is
converted: a document that lacks one of them, or writes a folio such as `12abc`, refuses the envelope with
`XML_PARSE_FAILED`, and `details.field` and `details.index` name the element and the document. To answer an envelope
that cannot be read (`EstadoRecepEnv` 1 or 91), pass a `ReceivedEnvelope` built by hand with no documents.

A record names a document by its type and folio alone, so each of its keys has to be one document of the envelope. A
record is refused with `INVALID_OPTION` (`details.key` names the key) when one of its keys names no document, so a
mistyped key never drops its decision, and for an envelope where two documents share a type and a folio, a repeated
document among them: decide those with the function, which receives each document's position.

The answers go to the mailbox the issuer registered with the SII for the exchange, which is not the sender of the
message a document arrived in. `unstable_fetchExchangeMailbox(portal, { rut })`, from `dte-sdk/portal`, asks the
registry of authorized issuers for it with a portal session, and answers the issuer's name, resolution and document
types with `exchangeEmail`, null when the issuer registered none. It is unstable: the page it reads has not been read
against the SII by dte-sdk yet, so its shape may change in any version. Sending the e-mail stays with the application.

## Assigning an invoice

The holder of an invoice assigns its credit to a financier, under Ley 19.983, with an electronic assignment file
(Archivo Electrónico de Cesión, AEC) registered in the SII's public registry of credit transfers (RPETC).
`unstable_createAssignment` builds and signs that file from the signed document, as it was sent, with no network:

```typescript
import { unstable_createAssignment, unstable_verifyAssignment } from 'dte-sdk'
import { validateAgainstSchema } from 'dte-sdk/schemas'

const aec = unstable_createAssignment({
  document: signed.xml, // the DTE as it was sent: 33, 34, 46 or 43
  assignor: {
    rut: '76543210-3',
    businessName: 'Comercial Andina SpA',
    address: 'Av. Los Aromos 1540',
    email: 'pagos@andina.example',
    signers: [{ rut: '12345678-5', name: 'Carolina Valdés Rojas', certificate }], // one to three
  },
  assignee: {
    rut: '10000004-0',
    businessName: 'Factoring Austral SpA',
    address: 'Av. Apoquindo 3000',
    email: 'ops@austral.example',
  },
  amount: 254363, // MontoCesion, up to the document's total
  lastDueDate: '2026-12-15', // UltimoVencimiento
  certificate, // signs the assigned document's zone and the whole file
})
await validateAgainstSchema(aec) // [] — by AEC_v10.xsd
unstable_verifyAssignment(aec).valid // true: the document's own signature and the file's four zones
```

The file follows Formato Archivo Electrónico de Cesión 1.1 and `AEC_v10.xsd`: the document embedded byte for byte,
so its own signature still verifies, in a signed `DocumentoDTECedido`; the assignment, `DocumentoCesion` with
`SeqCesion` 1, signed once by each authorized signer with their own certificate, in their order; and the whole file
signed as `DocumentoAEC`. The result is ISO-8859-1 text with its declaration. Before anything is signed it refuses
what the format rules out: a type other than 33, 34, 46 and 43 (`ASSIGNABLE_DOCUMENT_TYPES`), a document whose
signature does not verify (`SIGNATURE_INVALID`), a first assignment by anyone but the creditor (the issuer of an
invoice, the receiver of a purchase or settlement invoice), no signers or more than three, a signer whose certificate
names another RUT, an amount that is not a whole number from 1 to the document's total, dates outside 2003-04-01 to
2050-12-31 and texts past the stricter of the format's and the schema's lengths. The file carries no electronic receipt
of the goods, so it carries the sworn statement the format words for that case (`DeclaracionJurada`), naming the
assignor, the assignee and the document's debtor. `otherTerms`, `debtorEmail` and `contact` are optional.

`unstable_createReassignment({ previous, ...terms })` builds a later assignment on top of an earlier file: every
signature of that file must verify, its zones are carried over as they were signed, and the new assignment, made by
the previous assignee, gets the next `SeqCesion`, up to 40 (`MAX_ASSIGNMENTS`). `unstable_verifyAssignment(xml)` checks
every signature of a file where it stands in it, and says which one fails. Both builders run it on the file they built and hand back none
that does not verify. That a previous file verifies says nobody changed it after it was signed, not who signed it: its
earlier assignments are not compared with the document nor with each other, beyond their numbering and the last
assignee. A `DTE` cut from an envelope must declare the SII's namespace itself, as the ones dte-sdk writes do.

The two builders and the verifier are unstable: no file they built has been registered at the SII yet, and what the
registry takes is the only judge of the choices in them (the wording of the sworn statement, the IDs of the zones,
what the file declares above them), so they may change in any release.

Registering the file is a call to the SII, and it is unstable as well: neither function has been run against the SII
yet, and the format does not describe the registry's services, so their shape may change in any release.

```typescript
import { unstable_queryAssignmentUploadStatus, unstable_uploadAssignment } from 'dte-sdk'

const sii = createSiiClient({ environment: 'certification', certificate, companyRut: '76543210-3' })
const receipt = await unstable_uploadAssignment(sii, { xml: aec, notificationEmail: 'cesiones@andina.example' })
const state = await unstable_queryAssignmentUploadStatus(sii, { trackId: receipt.trackId })
state.code // the SII's ESTADO, as sent; its codes are not documented, so it is not classified
```

`unstable_uploadAssignment` posts the file to `RTCAnotEnvio.cgi` with the SOAP token, the assignor's RUT, which must
be the `RutCedente` of the file's cover, and the address the SII notifies; it is retried only while no answer has
arrived, never sent again after one, and every answer goes to the `archive` port as kind `assignment`. `STATUS` 0 with
a TrackID is a received file, not a registered assignment; any other `STATUS` is `SII_UPLOAD_REJECTED`.
`unstable_queryAssignmentUploadStatus` asks `getEstEnvio` of `wsRPETCConsulta` for the TrackID. Not covered yet: the
PDF image of the document (`ImagenDTE`), the electronic receipts (`Recibo`) and the image of a manual one
(`ImagenAR`), and the state of a document's assignments in the registry.

## Received documents

```typescript
import { readFileSync } from 'node:fs'
import { decodeLatin1, isClaimDocumentType, verifyReceivedDocuments } from 'dte-sdk'

// Decode the bytes with the encoding the XML declaration names: ISO-8859-1 for the SII's documents
// In production by default: a document stamped with a certification CAF comes back invalid
const { envelope, documents, status } = verifyReceivedDocuments(decodeLatin1(readFileSync('EnvioDTE.xml')))

status // 'valid' | 'invalid' | 'unchecked': the worst of the envelope and its documents
envelope?.valid // the envelope's own signature; envelope is null for a single DTE
documents[0] // { type: 33, folio: 1234, issuerRut: '10000004-0', totalAmount: 119000, signature, ted, caf, status, xml, … }
const toAnswer = documents.filter((doc) => doc.status === 'valid' && isClaimDocumentType(doc.type))
```

`verifyReceivedDocuments` takes a `DTE`, an `EnvioDTE` or an `EnvioBOLETA` as a supplier sent it. Each document is
checked three ways, and its `status` is `invalid` when a check fails, `unchecked` when none fails but the CAF's `IDK`
has no known key, and `valid` otherwise:

- **`signature`**: its XMLDSig signature over `Documento` (or `Liquidacion`, or `Exportaciones`), with `found`, `digestValid` and
  `signatureValid`. It proves the document is intact with respect to the certificate it carries, not whose that
  certificate is.
- **`ted`**: the stamp. Its `FRMT` must verify with the key of the CAF the TED carries, over the `DD` as ISO-8859-1
  bytes, and its `DD` must agree with the header: `mismatches` names what differs among the issuer, the type, the folio,
  the date, the receiver and the total, which on an export document is compared by value with its decimals. `RSR` and
  `IT1` are free text each issuer folds its own way, and are not compared.
- **`caf`**: the CAF in the stamp, against the document (`mismatches`: another issuer, another type, a folio outside its
  range) and against the SII: `siiSignature` checks its `FRMA`, the SII's signature over `DA`, with the SII key its
  `IDK` names.

Nothing else is checked today: neither the document against its schema nor what its fields say. Both checks are
planned.

`SII_CAF_KEYS` holds the keys 100 (certification) and 300 (production) that sign every CAF, taken from the SII's
certificates as CryptoSys and LibreDTE publish them, the same bytes in both. Only the key of `environment` is accepted,
`production` by default: a CAF signed with the other one is `invalid`, with the mismatch `environment` and
`caf.environment` saying which it is, so a certification document never passes for a production one. Pass
`environment: 'certification'` to check documents of the certification environment. `siiKeys` replaces the key
material; spread `SII_CAF_KEYS` to add a key. `verifyCafSignature(cafXml, { environment })` checks the `FRMA` of a
single CAF the same way; to check the CAF your own TEDs will carry, pass it `parseCaf(file).xml`, the block `parseCaf`
keeps.

- **A document that fails a check is a result, not an error.** Malformed XML, another root, an envelope without
  exactly one `SetDTE` and a `DTE` without its `Documento` throw `XML_PARSE_FAILED`; an envelope without documents throws
  `ENVELOPE_EMPTY`.
- **What is checked is what is reported.** Each document is read from its element in the parsed input, never from a cut
  of the text: its signature is checked over forms written from that element and its fields and stamp are read from
  it. `xml` is that element written out: the same elements, attributes, text and comments, which read back and verify
  the same, but not the input byte for byte (a CDATA section becomes escaped text, a character reference the character,
  an empty element `<X/>`). To archive a received document, keep the bytes of the input itself, not `xml`. A document is often signed before it goes into an envelope, with other namespaces in scope:
  its signature is checked where it sits and, failing that, on its own, with the SII namespace and as written; the
  forms differ only in namespace declarations, never in content. A signature passes only with one `Reference`, SHA-1,
  RSA-SHA1, C14N 1.0 and no transform but enveloped-signature or C14N 1.0.
- **The stamp is read from its elements alone.** The `FRMT` and the `FRMA` are checked over the `DD` and the `DA` written
  from the very elements whose fields are compared: flattened, the form the SII signs, with their texts escaped the
  SII's way or with only `&`, `<` and `>` escaped (so `&#xC1;` reads as `Á`). A stamp is read only when its structure
  leaves no doubt: one `TED`, plain (no prefix, no namespace declaration, no comment, CDATA or instruction), holding a
  `DD` and then an `FRMT` and nothing else, and one `CAF` with one `DA` and one `FRMA` in the `DD`; anything else is a
  failed check. A DOCTYPE, which the parsers read differently, is refused with `XML_PARSE_FAILED`, as are a prefixed
  `DTE` or `Documento`.
- **Not checked:** whose certificate signed, and whether the CAF had expired when the document was stamped.
- **Not run on a supplier's document yet.** The tests sign test CAFs with a test SII key pair. The two SII keys were
  checked once by hand, outside the tests: key 100 verifies the CAF of the example the SII publishes, and key 300
  verified production CAFs carried by real documents.

## SII web services

```typescript
import { createSiiClient, uploadEnvelope, waitForUploadStatus, registerClaim, claimResponseMessage } from 'dte-sdk'

const sii = createSiiClient({ environment: 'certification', certificate, companyRut: '76543210-3' })

const receipt = await uploadEnvelope(sii, { envelope }) // EnvioDTE → DTEUpload; EnvioBOLETA → REST in production
const status = await waitForUploadStatus(sii, { trackId: receipt.trackId })
status.status // 'accepted' | 'acceptedWithObjections' | 'partiallyRejected' | 'rejected' | …
status.counts // { reported, accepted, rejected, objections }, added up over every document type
status.message // Spanish gloss from the SII

const claim = await registerClaim(sii, { issuerRut: '10000004-0', type: 33, folio: 1234, action: 'acceptContent' })
if (!claim.ok) console.log(claimResponseMessage(claim.code)) // business answers are codes, not errors
```

`status.status` is the verdict of the upload, not the class of its code alone. The SII answers `EPR` ("Envío
Procesado") once it has processed the envelope, whatever it did with each document inside, so the code by itself is not
an acceptance: the counts of the answer are. An `EPR` with rejected documents is `partiallyRejected`, or `rejected`
when none was accepted, and one with objections and no rejection is `acceptedWithObjections`. Counts never raise a
pending or a rejected envelope, and an answer without counts keeps the class of its code. `status.countsByType` has
the counts of each document type of the envelope, which `QueryEstUp` answers one block per type, and `status.counts`
adds them up. `uploadVerdict(cls, counts)` is the same rule for an answer kept elsewhere. For an invoice the SII says
which documents it rejected, and why, in the e-mail it sends the company; the receipts REST status lists them in
`status.documents`.

Uploads send the XML as ISO-8859-1 bytes, so it must open with an XML declaration naming
ISO-8859-1 (the envelopes and books this SDK builds do); anything else is refused with
`INVALID_OPTION { field: 'xml' }` before anything is sent, and whitespace before the declaration
is dropped.

The client is plain data: every operation is a free function that takes it first. Tokens are
obtained and renewed for you (one cache per environment, channel and certificate). Also
available: `getSeed`/`getToken`, `uploadBook`, `uploadFolioConsumption`, `queryUploadStatus`,
`queryDocumentStatus`, `folioReceived`, `listClaimEvents`, `queryTransferable`,
`queryReceptionDate`, `receiverStatus`. `CLAIM_DOCUMENT_TYPES` (33, 34 and 43) and `isClaimDocumentType` say which
documents the registry takes.

`receiverAnswer(listed, receivedAt, today)` reads what the receiver answered, with no request:
the result of `listClaimEvents`, the `receivedAt` of `queryReceptionDate` and today in Chile
(`chileDate()`). A credit note that annuls comes first, then a claim, then an acceptance; with
none of them, eight calendar days after the SII received the document it is accepted by law
(Ley 19.983, `tacitlyAccepted`). Pass the result of `listClaimEvents` whole: when the query
failed and listed no events, the answer is `unknown`, never pending or accepted by law. Its
events alone still work, but cannot tell a failed query. A document the SII marked paid in cash,
whose events list `PAG`, is `paidInCash`: the registry refuses any event on it with code 27, so
there is nothing to answer. It also gives `claimDeadline`, the last day to claim, null for
`paidInCash`.

`queryAuthorizedIssuer(sii, { rut })` asks the public registry of authorized issuers of the SII
(`ee_empresa_rut`) for a RUT: its business name, the resolution of the environment, which is the
`NroResol` and `FchResol` of every cover (number 0 in certification), and the document types it
may issue. The registry asks for no certificate and no session, so any object with
`environment`, `transport`, `capture`, `logger`, `now`, `retry` and `sleep` will do as well as a
client. A RUT that is not an authorized issuer throws `SII_PORTAL_REJECTED` with
`rejection: 'companyNotAuthorized'`. The public registry does not show the mailbox an issuer registered for the
exchange; `unstable_fetchExchangeMailbox`, from `dte-sdk/portal`, reads it with a session
([Answering a received envelope](#answering-a-received-envelope)).

Options worth knowing:

- `transport`: `fetch` by default; `createNodeHttpsTransport({ tls })` from `dte-sdk/node` for a custom CA
  (`tls.ca`, added to the public roots bundled with Node, not in place of them) or, only if
  you must, `rejectUnauthorized: false` / `legacyRenegotiation: true`. TLS verification is on
  by default and the SII hosts verify with the system trust store, so the defaults just work.
- `retry`: 6 attempts with exponential backoff by default; `false` disables it. An upload
  (`uploadEnvelope`, `uploadBook`, `uploadFolioConsumption`, `unstable_uploadAssignment`) and `registerClaim` change state at
  the SII, so they are sent again only while no SII response has arrived (connection failure,
  timeout before the response headers). Once the SII answered, whatever it said, and even if the
  reply was cut off halfway, they are never re-sent, except once with a fresh token when the SII
  refused the token. Queries are read-only and follow the full policy. `retry.retryOn` can only
  narrow what is retried (`() => false` never re-sends), never widen it. Getting a token is one
  retry loop around seed, signature and token, so every attempt signs a fresh seed.
  `waitForUploadStatus` polls every `intervalMs` instead of following the retry policy, and its
  `timeoutMs` is a budget: each poll and each sleep is cut to the time that remains.
- An upload names its company and its sender apart from the file, and they must be the ones on the file's cover
  (`RutEmisor` or `RutEmisorLibro`, and `RutEnvia`): from a client set up for another company it throws
  `INVALID_OPTION { field: 'companyRut' }` (or `senderRut`) and nothing is sent.
- `capture: createDirectoryCapture({ dir })` from `dte-sdk/node` writes every HTTP exchange, redacted (tokens,
  seeds, cookies, private keys), for SII support tickets. Its numbers go on from the last capture in the directory, so
  a run that is resumed keeps the files of the one before it, and no file is ever written over. `prefix` (letters,
  digits, `_`, `.` and `-`) keeps apart replicas that share a volume.
  `archive: createDirectoryUploadArchive({ dir })` keeps the exact bytes of every upload the SII answered,
  with its TrackID and the SII's reply (tokens redacted). A duplicate answer is kept as
  `<trackId>-<kind>-duplicate-<yyyymmddHHMMSS>` and never replaces the record of the original.
- `logger`: silent by default; pass `console` or your own. Messages never carry tokens, RUTs
  or XML.
- `tokenCache`: in memory by default. `createDirectoryTokenCache({ dir, logger })` from `dte-sdk/node` keeps the
  tokens on disk, one file per key that only its owner can read (on Windows the permissions of `dir` decide), so a
  restart and the other processes of the same user reuse them; it serves as the portal's `sessionCache` too. Give it
  a directory of its own. It never throws: an entry it cannot read or write is a miss, reported only to `logger`.
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

The VAT a purchase invoice (45, 46) withholds comes off the line total on both sides of the book, and each side
carries it in its own fields (the format of the book, sections 2.4 and 3.4). The sales detail of who received the
invoice has `totalVatWithheld` and `partialVatWithheld` (`IVARetTotal`, `IVARetParcial`). The purchase detail of who
issued it has neither: there the withheld VAT goes in `otherTaxes` under a withholding code, 15 with the rate of the
tax when the whole VAT was withheld, and that amount is what the formula takes off. A purchase line that brings
`totalVatWithheld` or `partialVatWithheld` is refused with `INVALID_OPTION`. `bookEntryFromDocument` follows the
`operation` it is given. It carries a document's deposit guarantee as `containerDeposit` (`DepEnvase`), which admits no
amount below zero, so it refuses `creditNoteSign: 'negative'` on a credit note that has one (`INVALID_OPTION`,
`creditNoteSign`).

Their use today is narrow. The RCV replaced the purchase and sales book in production from period
2017-08, and the guide book is sent only when the SII asks for it; both are still part of the
certification test set. The folio consumption report (now Resumen de Ventas Diarias) is used in the
receipts certification, and the SII probably no longer requires it in production.

## SII portal and folios

```typescript
import { createPortalClient, fetchIssuerProfile, queryFolioQuota, requestCaf, closePortalSession } from 'dte-sdk/portal'

const portal = createPortalClient({ environment: 'certification', certificate, companyRut: '76543210-3' })

const issuer = await fetchIssuerProfile(portal) // resolution of this environment, name, address, activity
const quota = await queryFolioQuota(portal, { type: 33 }) // reads MAX_AUTOR and FOLIOS_DISP; stamps nothing
const { xml, caf } = await requestCaf(portal, { type: 33, quantity: 50 })
await closePortalSession(portal)
```

The portal is the certificate-authenticated site of the SII, read as HTML. The certificate must be enabled as a login
method first, a manual step at sii.cl (_Cambiar Clave y datos de autenticación_, option "Utilizando Clave Tributaria o
Certificado Digital"); otherwise the login throws `SII_PORTAL_CERT_NOT_ENABLED`. It needs Node: `fetch` cannot
present a client certificate.

Whoever has no certificate at hand can sign in with the RUT and the tax password of a person, the SII's "Clave
Tributaria", and every portal function takes that client as it takes the other:

```typescript
import { unstable_createPasswordPortalClient, fetchRegisterSummary } from 'dte-sdk/portal'

const portal = unstable_createPasswordPortalClient({
  environment: 'production',
  userRut: '12345678-5', // the person who signs in: the taxpayer or a representative of the company
  password: () => readFromKeychain('sii'), // asked for when a login needs it, and never kept
  companyRut: '76543210-3',
})
```

The password is a function on purpose. The client holds no password, so logging it or writing it to disk writes none;
the capture port writes the login form as `clave=[redacted]`; and no error carries it. The SII locks a password after a
few wrong attempts, so a password the SII refused is never sent again by the same client: the next login throws
`SII_PORTAL_LOGIN_FAILED` with `refusedBefore: true` before it asks the SII for anything, and trying another password
takes a new client. The request that posts a password is never retried, whatever `retry` says: a timeout after the SII
read a wrong password would otherwise count twice. It is posted a second time in one case alone: the SII took it, said
the user has too many sessions open, and the client closed the earlier ones (`closePreviousSessions`).

A session in the cache is used without the password, so who can find it can use it. The key of a password session is
therefore random and of its client alone: in a `sessionCache` shared with other people, a client that merely names the
same RUT finds nothing and has to sign in. To keep a session across restarts, pass `sessionKey`, a secret of that
person, never a value another caller could supply, such as the RUT. The key written in the cache is a digest, so it
names nobody. That keeps a session from whoever asks the cache for it by key; whoever can read what the cache stores
reads the session itself, a certificate's included, so a cache is shared only with whom a session may be. It is
unstable: dte-sdk
has not run this login against the SII yet, so its shape may change in any version. What needs a signature, such as
the certification runner, still takes a certificate where it asks for one.

- **CAF XML is a secret.** `xml` holds the private key of the CAF. Where you keep it is up to you.
- **One session per certificate.** The SII rations sessions per RUT, so `sessionCache` and `lock` are ports: several
  replicas need shared ones. Sessions are reused for 90 minutes and logged in on demand. In memory by default, so a
  restart logs in again; `createDirectoryTokenCache({ dir })` from `dte-sdk/node` keeps the session on disk, one
  owner-only file per certificate, and a restart reuses it. The default `lock` holds within one process only: two
  processes that share the directory and run at once can send requests of one session at the same time or replace
  each other's session, so give them a shared `lock` too, or keep one process per certificate. Two clients made with
  one certificate in the same process do not share a session either: each `createPortalClient` makes its own cache and
  lock, so pass both the same `sessionCache` and `lock`, or make one client per certificate.
- **A portal request has 20 s in all,** body included, and is retried. The register and the MIPYME backup can answer
  more slowly than the folio pages: raise it with `timeoutMs` on the client, or `{ timeoutMs }` as the last argument
  of a call.
- **Rationing.** `MAX_AUTOR` and `FOLIOS_DISP` appear only while the SII rations a type. Unused folios lower what it
  authorizes and eventually block stamping.
- **To lift a block, issue with the folios you have.** `reobtainFolios` gets lost CAFs back without spending quota.
  `requestCafInBatches` is for a small `MAX_AUTOR` with nothing unused, and `requestCafExact` wants one CAF for the
  whole quantity.
- **A flow cut short keeps what it got.** Once a folio flow holds something, a later step that fails with anything but
  a refusal it can report (a transport failure, a timeout, an expired session, a block, `CAF_INVALID`, your abort) ends
  it with what it holds and `failure: { code, operation, rejection? }`, and the original error goes to the client's
  logger with every text redacted. `requestCafInBatches` returns the CAFs it got, with `complete: false` and
  `rejection: null`; a failed `requestCaf` may have been granted all the same, so check `listReobtainableRanges` before
  asking again. `annulFolios` returns what the SII already annulled, `reobtainFolios` the CAFs it already downloaded,
  and `requestCafExact` the `knownAnnulled` of its annulment. Read `failure` as well as `rejection`, and persist
  `knownAnnulled` whether `failure` is set or not.
- **A grant can be smaller than asked.** `requestCaf` caps at `MAX_AUTOR` and, past the effective maximum with no
  `minQuantity`, asks for one folio, so read `granted`. `minQuantity` and `requestCafExact` are the strict forms.
- **Annulling cannot be undone** and counts against the quota for six months. `annulFolios` needs `range`,
  `withinDays` or `all: true`, and `requestCafExact` annuls only with `allowAnnul: true`. `maxRanges` limits a pass,
  not the call: each pass tries at most `maxRanges` ranges (50, or 20 in `requestCafExact`) and there are up to four
  passes, so one call can annul up to four times that many (200, or 80). Every step is tried up to three times,
  whatever the error, on top of the retries of the client. `exclude` protects a CAF still in use. Pass `knownAnnulled`
  back between runs: the portal keeps listing annulled ranges forever, and a range its keys cover, in one key or
  several, is not posted again. Folios the SII answered one by one come back in runs, and a walk cut short keeps them.
- **Getting a range back asks the SII which folios are free.** `reobtainFolios` sends plain requests (referers
  without a host, the forms picked by their exact opening tag, no session handling on the way in) and
  reads the listing for ranges and nothing else: with a session that expired, or on a page that states a refusal, the
  list is empty, and a listing that fails for any reason reads as no ranges to get back (the failure is in `reason`).
  It does not sign in on demand: call it with a session that is alive. `reobtainCaf` on its own enters the procedure
  first and signs in on demand. Inside `reobtainFolios`, a login page in answer to a download is
  `SII_PORTAL_SESSION_EXPIRED`, which ends the walk with the CAFs in hand and `failure`, or throws with none.

`createFolioRegistry`, `createMemoryFolioRegistry` and, from `dte-sdk/node`, `createDirectoryFolioRegistry` keep local
track of the folios of each CAF: reserve, mark as sent or annulled, release. `reserve` hands out the next free folio:
after the last one reserved, or from the lowest one reserved and not sent, never one that is used or annulled and never
a free one below that point. With `{ lowestFree: true }` it hands out the lowest free folio of the whole range, which is
what the certification run asks for; use it only when the registry records every folio the range has spent. A service
with its own database implements `FolioRegistry` with its own transactions, the option included if it is to back a
certification run. `createDirectoryFolioRegistry` keeps `folios.json` for its owner only, as the token cache does: the
ledger holds the companies' RUTs, their track ids and what you keep in `extra`. It is for a single process: two
processes on one directory can reserve the same folio, so keep one process per directory until the lock across
processes, which is planned, is there.

To pick the CAF file to issue with, `dte-sdk/node` searches a directory, and its folders down to five levels below it,
for CAF files. `findCafFiles({ dir, type, issuerRut })` lists the usable ones newest first (by modification time):
`.xml` files that parse as a CAF of that type whose `RE` is that company, read from the file and never from the folder
it lies in, and that have not expired (`isCafExpired`, with its one-day margin). Each file is read in the encoding its
XML declaration names, ISO-8859-1 as the SII serves it or UTF-8, and with no declaration as UTF-8; a file whose bytes
are not that encoding is skipped, as is a folder or file that cannot be read. With `includeExpired: true` the expired
files are listed too, with `expired` set. `findLatestCafFile` gives the first of them, or null. `resolveCafFile({ dir,
type, issuerRut, required, registry, environment })` gives the newest one that still has `required` free folios,
`remaining` in the registry for the scope of the file (or its whole range without a registry), with that `scope` to
reserve from, and null when none has: then it is time to ask the SII for a new CAF. Neither `findLatestCafFile` nor
`resolveCafFile` takes an expired file. With `environment`, the three leave out a CAF the SII signed with the key of
the other environment (its `IDK`: 100 in certification, 300 in production), so one folder can hold the CAFs of both
and never hand the ones of one to the other. `cafFileScope(file, environment)` builds the same scope from a CAF's text and
the CAF parsed from it, such as the portal's `ObtainedCaf`: give it the text the file holds, since the scope's
`cafFingerprint` is of that text.

```typescript
import { createDirectoryFolioRegistry, resolveCafFile } from 'dte-sdk/node'

const registry = createDirectoryFolioRegistry({ dir: './folios' })
const file = await resolveCafFile({
  dir: './cafs',
  type: 33,
  issuerRut: '76543210-3',
  required: 1,
  registry,
  environment: 'production',
})
if (file === null) throw new Error('No CAF with free folios: request one')
const folio = await registry.reserve(file.scope!) // file.caf goes to issueDocument
```

A refusal of the SII is `SII_PORTAL_REJECTED`, with `details.rejection` and `portalRejectionMessage` saying what it means
and what to do; the composite flows return it as data, so the CAFs already obtained are not lost. Login, logout and the
refusal pages were measured against the real SII, but the pages of an enrolled company (quota, CAF, folio ranges) have not
been seen yet: see the [portal and folios design](./docs/superpowers/specs/2026-11-02-phase-4-portal-folios-design.md).

### Keeping folios stocked

`unstable_replenishFolios` is one call that keeps a document type stocked. It asks the SII only when the usable folios
fall below `minimum`, and then in the order that does not make a block worse: ranges already authorized that nobody
holds are downloaded again, which spends no quota (in production, only the ones stamped today); what is still missing
is requested in batches, within the quota; and unused folios are annulled as a last resort.

```typescript
import { unstable_replenishFolios } from 'dte-sdk/portal'

const report = await unstable_replenishFolios(portal, {
  type: 33,
  minimum: 20, // replenish below 20 usable folios
  quantity: 100, // folios to obtain each time
  cafs: () => store.holdings(33), // every CAF of the type you hold, with its unused folios
  lastIssuedFolio: await store.lastIssuedFolio(33), // 0 when none was issued
  coolUntil: state.coolUntil,
  knownAnnulled: state.knownAnnulled,
  onObtained: ({ cafs, reobtained }) => store.keep(cafs, reobtained), // runs with the portal lock still held
})
// report.status: 'none' | 'coolDown' | 'replenished' | 'partial' | 'blocked' | 'failed'
await store.saveState({ coolUntil: report.coolUntil, knownAnnulled: report.knownAnnulled })
```

- **`unstable_replenishFolios` is unstable.** Its shape may change in any release, a patch included. It has not run
  against the SII yet, in certification or in production, and it requests folios and can annul them, which cannot be
  undone. Once it has run in both environments it becomes `replenishFolios`.
- **It stores nothing and schedules nothing.** Call it before issuing, or on a timer. Keep `report.cafs`, whose XML
  holds a private key, so the report is not something to log, and pass `coolUntil` and `knownAnnulled` back next time.
  `planFolioReplenishment` is the decision alone, with no I/O: `none`, `coolDown` or `replenish`.
- **`reason` is the cause.** `expired` when the folios lost to expiry would have reached the minimum, whether some are
  left or none; otherwise they were used, `low` with some left and `exhausted` with none. `usable` and `expiredFolios`
  give the numbers. A CAF that expires within `expiryMarginMs`, a day by default, no longer counts.
- **Say what you hold and what you issued.** `cafs` is every CAF of the type you hold, spent and expired ones too: a
  range held is never downloaded again and never annulled. `lastIssuedFolio` is the highest folio the company has
  issued, on any system: a folio up to it is never taken as free. Without `isFolioFree`, every folio after it in a
  range nobody holds is free; with it, the SII is asked about each one, up to `maxChecksPerRange` per range.
- **In production it downloads again only a range stamped today.** What you hold is what you declare in `cafs`, so a
  range missing from them that was stamped before today may be one another system of the company issues with, and a
  second copy of its CAF would repeat its folios. It is left alone and comes back in `outsideWindow`, with the day it
  was stamped, for someone to decide: add its CAF to `cafs` if another system holds it, or pass `reobtainWithinDays`
  to take it. Today, counted in Chile, is where a grant that never arrived is; a range with no day to read is never
  taken. In certification every range is reached, unless `reobtainWithinDays` says less.
- **Annulling is off in production** unless you pass `allowAnnul: true`, and on in certification. It runs only for a
  refusal that unused folios cause, and only when the SII counts more of them (`FOLIOS_DISP`) than the ones in hand. It
  never touches a CAF held, a range the run downloaded or `exclude`, and it reaches only ranges stamped in the last
  day in production, which is today in Chile and where an older range may be another system's, and in the last 180
  days in certification (`annulWithinDays` sets it), ten per pass. Put in `exclude` the folios of documents signed and
  not received by the SII yet.
- **A run that ends short cools down.** With no failure, `coolUntil` is 15 minutes ahead (`coolDownMs`); after a
  session limit or a firewall block, an hour. Until then the call answers `coolDown` and nothing goes out. Any other
  failure sets none, and a report with enough folios hands back a cool-down still running.
- **Refusals and failures are data.** `rejection` and `portalMessage` carry the refusal in the SII's own words, and
  `failure` any other `DteError`. A listing that fails or is refused ends the run before any quota is spent. A request
  the SII may have granted without handing it over (`stampingUncertain`, `rangeAlreadyAuthorized`) is settled in the
  same run, by reading the listing again. `partial` with neither means the batches ran out of trips (`maxBatches`).
- **Several replicas.** The call waits for the portal lock, which may take as long as another replica's run, and then
  reads `cafs` again. Pass `cafs` as a function and keep what arrives in `onObtained`, which runs with the lock still
  held: a replica that waited then finds the folios and does nothing. `cafs`, `isIssued`, `isFolioFree` and
  `onObtained` run under the lock, so they must not call a portal operation of the same client.
- **Requests go out a second apart,** whatever the step.

## Purchase and sales register and MIPYME backup

These run on the same session as the rest of the portal.

```typescript
import {
  listPeriodDocuments,
  fetchRegisterSummary,
  unstable_downloadRegisterFile,
  listPurchaseTypes,
  changePurchaseType,
  fetchPurchaseDocument,
  moveVatToCommonUse,
  downloadMipymeBackup,
} from 'dte-sdk/portal'

const { summary, documents } = await listPeriodDocuments(portal, { period: '2026-10', direction: 'received' })
const { rows, header } = await fetchRegisterSummary(portal, { period: '2026-10', operation: 'purchase' })
const file = await unstable_downloadRegisterFile(portal, { period: '2026-10', operation: 'purchase' })
await writeFile('compras-2026-10.csv', file.csv) // or file.columns and file.rows, the same lines split

const types = await listPurchaseTypes(portal)
const key = { type: 33, folio: 1234, period: '2026-10', counterpartyRut: '12345678-5' }
await changePurchaseType(portal, { ...key, purchaseType: '4' })
const purchase = await fetchPurchaseDocument(portal, key)
await moveVatToCommonUse(portal, { ...key, commonUseVat: 19000 })

await downloadMipymeBackup(portal, {
  from: '2026-10-01',
  to: '2026-10-31',
  direction: 'received',
  onChunk: async ({ from, to, xml }) => saveBackup(`${from}_${to}.xml`, xml),
})
```

| I need                                                                            | Function                               | SII service              |
| --------------------------------------------------------------------------------- | -------------------------------------- | ------------------------ |
| Each document of a period (folio, date, amounts), with no receipts and no XML     | `listPeriodDocuments`                  | `consemitidosinternetui` |
| Official totals per document type and accounting status, with receipts aggregated | `fetchRegisterSummary`                 | `consdcvinternetui`      |
| The official detail of a period as a file, one line per document                  | `unstable_downloadRegisterFile`        | `consdcvinternetui`      |
| How a purchase is classified, and changing it                                     | `fetchPurchaseDocument` and the writes | `complementoscvui`       |
| The full XML of a document                                                        | `downloadMipymeBackup`                 | MIPYME backup            |

- **The register's codes and statuses are data.** `REGISTER_DOCUMENT_CODES` and `registerDocumentCode(code)` say, for each
  of the 49 document codes, which sides of the register show it, whether it is a DTE, its sign in the totals, whether
  it is listed per document and whether the buyer withholds the VAT. `REGISTER_ACCOUNTING_STATUSES` gives the accounting
  statuses of each side: four for purchases, only `registered` for sales.
- **The register as a file.** `unstable_downloadRegisterFile` asks for what the register's "Descargar Detalles" gives:
  every document of the operation in the period, one line each, with `;` between values and the SII's column names
  first. `csv` is the text to save; `columns` and `rows` are the same lines split, every value as the text the SII
  wrote. Purchases are asked by accounting status, `registered` by default, and sales have one. A period with no
  documents is an empty file. Unlike the reads above, it looks at the SII's response code: a period the SII refuses to
  show throws `SII_PORTAL_REJECTED` with `rejection: 'registerFileRefused'`, its `code` and the SII's message, and
  never reads as empty. The request carries, in its two reCAPTCHA fields, the constant the register's own page sends
  there; dte-sdk solves no challenge, and if the SII comes to ask for one the call is refused. It is unstable: dte-sdk
  has not run it against the SII yet.
- **A refused month reads as empty.** Response codes are not looked at, so `listPeriodDocuments` and
  `fetchRegisterSummary` cannot tell a month the SII refuses to show from one with no movement. `raw` holds each row as the
  SII sent it. The row names come from the SII's client code and have not been seen with real documents: an absent field is
  `null`.
- **A write changes the real register** on a production client. Each one is a single attempt and only the SII's `OK` confirms it.
  Anything else throws `purchaseChangeNotConfirmed`, and the change may have applied, so read the document again before retrying.
- **VAT amounts are final amounts,** the value of each bucket after the change and not a delta.
- **The backup reads production from any client,** because the service exists only there. It reads real documents even from a
  certification client, and a development environment that stores them needs its own gate. It needs only the certificate, not
  being enrolled as an issuer.
- **The backup downloads at most 20 documents at a time,** so it splits the range, and by document type within a day. The whole plan
  comes first: a day that cannot be downloaded throws `backupDayOverLimit` or `backupDayUnknownTypes` before any download. Use
  `onChunk` for long histories, so the XML does not stay in memory.
- **Known defect:** a two-day range with more than 20 documents downloads only its first day, while `total` counts both.
  The fix is planned.
- **`backupNoData` is definitive.** `backupCaptcha` and `backupIndeterminate` mean try later, never in a loop.

## Activity verification

The SII verifies a company's activities before it lets the company issue documents with VAT. These read that
verification on the same session as the rest of the portal.

```typescript
import { unstable_fetchActivityVerification, listAccreditationDocuments } from 'dte-sdk/portal'

const { requests, messages } = await unstable_fetchActivityVerification(portal)
// requests[0]: { status: 'PAC', statusDescription: 'PENDIENTE DE ACREDITACIÓN', preliminaryResult: 'CONDICIONADA',
//                finalResult: null, requestedOn: '2026-11-05', accreditationDeadline: null, … }

const documents = await listAccreditationDocuments(portal) // [{ category: 'general', code: 1, description: '…' }, …]
```

- **`unstable_fetchActivityVerification` is unstable.** Its shape may change in any release, a patch included. It has
  been read once against the real SII, for a company whose verification was pending, and the codes of an approved one
  are not known yet: nothing here says by itself whether the company may issue documents with VAT. Once an approved
  verification has been read, it becomes `fetchActivityVerification`.
- **It asks for the company, not for the session.** The SII's own page shows the verification of whoever logged in. This
  sends the company's RUT, and the SII answered a session of its legal representative. A request of another RUT throws
  `SII_PORTAL_UNEXPECTED_PAGE` with `step: 'otherTaxpayer'` instead of passing as the company's.
- **Officials, comments and the address never come out.** The SII sends them; dte-sdk drops them, and there is no `raw`.
- **No requests means the company never asked** for the verification. An error code from the SII throws
  `activityVerificationRefused`, with its words in `details.portalMessage`.
- **Both read production from any client,** because the app exists only there.

## Certification: test sets, simulation and books

```typescript
import {
  parseTestSetText,
  planCertificationSets,
  createFolioAllocator,
  issueTestSet,
  issueSimulation,
  createCertificationSalesBook,
} from 'dte-sdk/portal'

const plan = planCertificationSets(parseTestSetText(setText)) // the text the SII generated for the applicant
const options = {
  issuer,
  receiver,
  certificate,
  folios: createFolioAllocator(cafs),
  resolution: { number: 0, date: '2026-01-01' },
}
const basic = await issueTestSet(plan.basic!, options) // documents and the signed envelope, with the SET references
const sales = createCertificationSalesBook(basic, {
  period: '2026-11',
  issuerRut,
  senderRut,
  resolution,
  certificate,
  receiver: { rut, name },
})
const simulation = await issueSimulation(plan, { ...options, folios: createFolioAllocator(freshCafs) })
```

The SII test set is parsed line by line into cases; `planCertificationSets` turns them into what each set issues and the
folios each type needs; `issueTestSet` issues the basic, exempt, guide, purchase and settlement sets through
`issueDocument` with the `SET` reference (`CASO <id>`) and the rules the SII review expects (returned goods at the
original price, cancellations taking the cancelled document's items, the issuer as receiver of purchase invoices and
internal transfers); `issueSimulation` re-issues every case in one envelope; the three `createCertification*Book` functions
build and sign the sales, purchase and guide books, as total submissions or as adjustments of a period the SII already
holds. Everything is data: sending, waiting for the status and declaring
belong to the certification runner. No real test-set text was available while writing this: the grammar follows the
sets the SII delivers in the field, and the first download should be kept as a fixture.

## Certification: the runner

```typescript
import { createSiiClient } from 'dte-sdk'
import { createDirectoryFolioRegistry } from 'dte-sdk/node'
import {
  createPortalClient,
  createDirectoryCertificationStore,
  runCertification,
  sendTestSet,
  declareTestSets,
} from 'dte-sdk/portal'

const deps = {
  portal: createPortalClient({ environment: 'certification', certificate, companyRut }),
  sii: createSiiClient({ environment: 'certification', certificate, companyRut }),
  store: createDirectoryCertificationStore({ dir: './certification' }), // state.json and the artefacts; holds CAF keys
  registry: createDirectoryFolioRegistry({ dir: './folios' }),
  issuer, // rut, businessName and address; the activity, its code, the commune and the city have defaults
  certificate,
  // receiver: the test receiver 66666666-6 by default; resolution: number 0 with today's UTC date by default
  onProgress: (event) => console.log(event.step),
}

// The whole HTML side, resumable: run it again after a fix
const first = await runCertification(deps) // answers the exchange set, then stops with `printedSamples` until the samples are given
// The samples uploaded and submitted, it stops at `compliance`: the sworn statement needs an explicit go
const second = await runCertification(deps, {
  samples: () => readPrintedSamples('./certification/samples'),
  declareCompliance: true,
})

// One step alone, after the SII rejected a set with observations
let state = (await deps.store.load())!
state = (await sendTestSet(deps, state, { kind: 'basic' })).state
state = (await declareTestSets(deps, state)).state
```

The runner does what the field does, in its order: it downloads the test set once (downloading again regenerates it
at the SII, so a run with a plan starts over), gets the folios through the registry (CAFs in hand first, then the
quota, re-obtaining and annulling only as a last resort), sends each set and keeps its envelope and documents as
artefacts for the printed samples, declares the track ids on `pe_avance2` with every field in form order and reads
the page again to verify (a row left empty is asked again; "ENVIO CON ERRORES O REPAROS" is a state of an envelope,
not a failure of the declaration), waits for the approval (a page that shows none of the sets sent counts as approved;
a read that fails only uses up its attempt), runs the books (the history of books the SII holds marks the
occupied periods; a book the SII closes or never reviews is resent as an adjustment or in the next free month, at most
24 times), asks for the next stage once the three mandatory books are sent, sends and declares the simulation and
confirms it, answers the exchange set and confirms the exchange, uploads
the printed samples when the `samples` option gives them (without them it stops at `printedSamples`), and stops at
`compliance`: the declaration of compliance is the sworn statement of the legal representative, it cannot be undone,
and the runner makes it only with `declareCompliance: true`.

- **Everything is a step.** `obtainTestSet`, `prepareFolios`, `sendTestSet`, `declareTestSets`,
  `waitForTestSetsApproval`, `runBooks`, `advanceToNextStage`, `sendSimulation`, `declareSimulation`,
  `waitForSimulationApproval`, `runExchange`, `uploadPrintedSamples` and `declareComplianceFinal` take the dependencies
  and the state and return the saved state with an outcome; the portal operations beneath them (`downloadTestSet`,
  `declareProgress`, `readProgress`, `advanceStage`, `listBookHistory`, `declareCompliance`, and those of the next
  section) are exported too.
- **The state is a secret.** It holds the CAF files, each with a private key; the directory store writes them readable
  by the user only. A service may implement `CertificationStore` over its own storage.
- **The run keeps to field behaviour.** In what the SII receives and in how the run flows, the runner does what is
  known to work with the SII, including where a stricter reading looked safer. The [alignment design](./docs/superpowers/specs/2026-11-06-certification-alignment-design.md)
  says what changed and what is not reproduced, and the improvements set aside are listed in
  [issue 29](https://github.com/arrowsw/dte-sdk/issues/29) for after the first real certification.
- **The test sets are written in a fixed form.** Their documents carry the UTC day as issue date and UTC
  stamps with milliseconds (a run after 21:00 in Chile, 20:00 in winter, dates them the next day), unit prices with
  six decimals, notes that correct a text with a zero total and no VAT rate, and every case of the guide set as a
  guide. The declaration carries today's Chile date for every track id, whatever day the envelope was sent on.
- **The uploads of the run** are sent again only for a network failure that names a reset socket, a timed-out
  connection or an unresolved host: eight attempts, 2 s growing by 1.8 up to 15 s. Only `STATUS` 0 with a `TRACKID`
  element is a sent file; `STATUS` 7 is a duplicate recovered by that element; `STATUS` 99 is a failed send.
- **The books start over on every run.** The period is the UTC month the test set was read in (the current UTC month
  when the set brought no purchase book), or the first free month below it; which books stand approved is what the
  portal shows, not what the state remembers, so a run resumed at the books sends again every book the portal does not
  show as `REVISADO CONFORME`. When a period is taken every book goes again as an adjustment, the guide book and the
  exempt purchase book too; the books the declaration names with "ENVIO CON ERRORES O REPAROS" or the SOAP status
  rejects are not awaited but sent again; no portal read of the phase stops the run. A row the page leaves rejected,
  closed or declared keeps that search going even when it is of a book this run does not send (an exempt purchase book
  the test set did not bring): nothing is sent for it, but the books are declared again and that row is awaited, up
  to 24 times.
- **The portal decides the stage.** With the three mandatory books sent the runner asks for the next stage whether or
  not the books were approved, and stops with the portal's sentence when the portal does not
  move. `runBooks` ends `incomplete` only when a mandatory book could not be sent.
- **The simulation is not written as the test sets are:** the local date
  of the process, stamps in UTC to the second, the envelope stamped in Chile time, plain unit prices, and a guide
  without `TpoDespacho`. Run the process with `TZ=America/Santiago`.
- **The declaration of compliance counts as made when the last page no longer shows its form.** That is a
  reading of the page, not a confirmation from the SII; keep the page the store saves and check it.
- **The folios of a run are checked against the SII.** Before a set is issued the SII is asked whether it already
  holds the folios the run is about to use (as the company, up to 30 queries per CAF); one it holds is marked used. A
  range obtained again is used only through the folios the SII showed free, and takes the place of the CAFs in hand of
  its type. A maximum that cannot be read counts as no cap, a blocked type is not asked for but obtained again, a
  maximum below the need is asked in as many batches as folios are missing, and after annulling the maximum is read
  again. Annulling (the last resort: unused ranges of the last 180 days, 10 in each of up to four passes) never
  touches a range the run downloaded, and the ranges the SII reported annulled are kept in the state
  (`annulledRanges`) and not tried again. Every CAF obtained is saved in the state at once, so a step that ends short
  leaves it in hand for the next attempt.
- **The simulation keeps what it stamped.** It never issues with the sets' CAFs. An attempt that stops before the
  upload leaves the CAFs it obtained in the state (`simulationCafs`), and the next one issues with them and asks only
  for what is missing; once the upload was tried they are spent, and a new attempt asks for new ones.
- **A rejected set keeps its page.** When the progress page rejects a set, the step returns the labels and saves the
  readable text of the page as the artefact `sets-prueba/avance-rechazo.txt`: what the SII wrote around a label is the
  reason.
- **The operator gives less.** Without `receiver` the documents go to the test receiver (`DEFAULT_CERTIFICATION_RECEIVER`);
  without `resolution` every envelope of the run carries number 0 and the UTC date of the day the run started, which
  is only right on the day the SII resolved the application, so give `resolution.date` on any other day; the issuer's
  line of business, activity code, commune and city fall back to `DEFAULT_CERTIFICATION_ISSUER`. A receiver's line of
  business is cut at its 40 characters instead of being refused, the issuer's too where the issuer is the receiver of
  its own documents (the purchase set, internal transfers, the simulation); as issuer it keeps its 80.
- **The waits are the field's:** 5 polls of 10 s for the sets, 40 of 15 s for the books, 30 of 10 s for the
  simulation, 10 declaration attempts 5 s apart after 10 s. Inject `sleep` and `now` to test without waiting.
- **Nothing here has been run against the portal yet.** Every page shape comes from field behaviour; the first
  enrolled run should keep the artefacts the store writes (every portal answer is there) as fixtures.

### The settlement set

Res. Ex. SII N° 108 of 2005 asks an issuer of settlement invoices (43) for technical tests of their own. The SII hands
them out as one more set of the test set, `SET LIQUIDACION FACTURA`, which is not ticked by default: ask for it when
the test set is downloaded, and the runner issues it with the other sets.

```typescript
import { DEFAULT_OPTIONAL_SETS, runCertification } from 'dte-sdk/portal'

const result = await runCertification(deps, { optionalSets: [...DEFAULT_OPTIONAL_SETS, 'SET84'] })
// result.state.plan.settlement holds the cases, result.state.sets.settlement the envelope sent
```

- **One settlement invoice per case, in one envelope.** The set's cases are read by their two tables: each item of
  `ITEM  CANTIDAD  TOTAL LINEA` becomes a line with its quantity and its total as the amount, negative for a credit
  note or an earlier settlement, and each row of `COMISIONES Y OTROS CARGOS` a commission line. Names keep their
  accents, as the SII's instructions ask.
- **What the set does not say is read from the names.** The type of the settled document (`TpoDocLiq`) comes from the
  item name, read without accents: `ANTICIPO` is 99, and an invoice, a credit or debit note, a receipt or an earlier
  settlement is its electronic code when the name says electronic and its paper code when it does not (33 or 30, 61
  or 60, 56 or 55, 39 or 35, 43 or 40); any other name is 99, which Formato DTE gives to "otras transacciones". A line
  or a charge whose name starts with `EXENTO` is exempt, any other is net; a charge is a commission when its name
  says `COMISION` and another charge when it does not.
- **The totals are phase 1's.** The commissions are taken off the total and their VAT is the VAT rate by their net
  total, rounded once, as the SII's validation 38 asks; the receiver is the run's, the principal the settlement is
  issued to, with its line of business.
- **It is sent, declared and awaited with the others.** It goes after the four sets as
  `sets-prueba/envio-set-liquidacion.xml`, its folios of type 43 are asked for with theirs, and its track id is
  declared on its row with the sets and again with the books, so the portal keeps it.
- **No real set has been seen.** The SII generates the set company by company and none is public: the grammar rests
  on synthetic sets shaped like the field's, and the checkbox `SET84` and the label of its row on the progress page
  are not measured. Keep the first download as a fixture.
- **Not yet in the later stages.** The simulation re-issues the four sets only, and `readPrintedSamples` reads the
  settlement envelope as one of the simulation's. The printed sample of a 43 prints its commissions and other charges
  (see the printed samples).

## Certification: the exchange and the printed samples

```typescript
import { runCertification, createExchangeAnswers } from 'dte-sdk/portal'
import { readPrintedSamples, writePrintedSamples, findEnvelopeFiles } from 'dte-sdk/pdf'

// After the simulation: the exchange set is downloaded from the exchange portal, answered and confirmed; then the
// samples are rendered from the envelopes the store kept and uploaded to the samples portal
const samplesDir = './certification/samples'
await writePrintedSamples({
  xmlFiles: await findEnvelopeFiles('./certification'),
  outDir: samplesDir,
  transferable: true,
})
const run = await runCertification(deps, { samples: () => readPrintedSamples(samplesDir) })
// run.stopped: `compliance` once the samples are submitted; `rejected` with the SII's reasons in `run.detail`

// The set could not be downloaded (run.stopped `exchange`, run.detail names `intercambio/set-intercambio.xml`):
// save it by hand from the exchange portal into that artefact of the store, or pass it
await runCertification(deps, { exchangeSetXml: await readFile('set-intercambio.xml', 'utf8') })

// The answers alone, for a set in hand
const answers = createExchangeAnswers(setXml, {
  companyRut,
  certificate,
  contact: { name: 'Contacto', mail: 'contacto@example.test' },
})
```

The exchange is the SII's set of documents addressed to the company; the answers are the reception response
(`respuesta-recepcion-envio.xml`), the receipts of Ley 19.983 (`envio-recibos.xml`) and the commercial approval
(`respuesta-aprobacion-comercial.xml`), each signed, and valid against the official schemas in the tests. The runner
downloads the set once (it stays as an artefact), validates the user on the exchange portal, uploads the three answers
and confirms the exchange, which moves the application to the printed samples. The printed samples are the PDFs of
every document the sets and the simulation issued, as `writePrintedSamples` lays them out: the runner creates a review
on the samples portal (or resumes one left in `INGRESO`), uploads every PDF, submits the review and reads its state
again; a review the SII rejects at once comes back as `rejected` with a summary of how the SII filed each PDF. The
portal operations beneath (`downloadExchangeSet`, `validateExchangeUser`, `uploadExchangeAnswers`, `confirmExchange`;
`readSamplesReview`, `createSamplesReview`, `uploadSample`, `submitSamplesReview`, `readSamplesDetail`) and the
GWT-RPC codec (`gwtBody`, `gwtAnswer`) are exported too. The exchange portal is called with the pair of hashes known
to work; the samples portal's are discovered once on the way in, with the known pair as the fallback;
`gwt: { permutation, policy }` overrides either.

- **One stage, one warm-up.** The run enters each portal once per stage of work: once for the download of the exchange
  set, once for the validation, the three uploads and the confirmation, and once for the whole of the printed samples.
  The cookies the warm-up sets live only for that stage. `withExchangeStage` and `withSamplesStage` open a stage for a
  caller that chains the operations by hand (`stage` in their input); alone, each operation opens its own.
- **These calls are sent once and wait as long as it takes:** no retry (but for a PDF upload the portal answers with
  a 5xx) and no time-out of their own, with a fixed set of headers for each portal and the answers read as
  UTF-8. Pass `timeoutMs` to bound them. Inside a stage each call reads its own answer whatever its status: the client
  neither throws on a 502, 503 or 504 nor looks for the firewall's page there, so an error on the user validation or
  on the set validation does not stop the exchange.
- **A set that cannot be downloaded, for any reason, stops the run with `exchange`** and asks for the set by hand.
- **The exchange set is read loosely:** it is not checked for well-formedness, a number that does not parse is 0, a
  missing date or RUT is empty, and only a set without documents (or one the parser cannot read at all) fails. The
  names of the PDFs travel as given.
- **Nothing here has been run against the two portals yet.** Every wire and wording comes from field behaviour; the
  first enrolled run should keep every artefact the store writes under `intercambio/` and `muestras/` as fixtures.
- **The exchange answers are regenerated and uploaded on every run that reaches the portal;** only the set is kept.
- **A review left in `INGRESO`** (a run cut off while uploading) is resumed, every PDF uploaded again.

## Certification: receipts

```typescript
import { createSiiClient } from 'dte-sdk'
import {
  createPortalClient,
  createFolioAllocator,
  downloadReceiptsTestSet,
  parseReceiptsTestSet,
  issueReceiptsSet,
  sendReceiptsSet,
  declareReceiptsTrackId,
  readReceiptsStatus,
  declareReceiptsCompliance,
  verifyReceiptsAuthorization,
} from 'dte-sdk/portal'

const portal = createPortalClient({ environment: 'certification', certificate, companyRut })
const sii = createSiiClient({ environment: 'certification', certificate, companyRut })

// The receipts application is its own: its portal, its test set, its declaration. The pieces, in the order to chain them
const { text } = await downloadReceiptsTestSet(portal, { providerMail })
const issued = await issueReceiptsSet(parseReceiptsTestSet(text), {
  issuer, // rut, businessName and address; the rest has the defaults of the document runner
  certificate,
  folios: createFolioAllocator([caf39]),
  resolution, // number 0 and today's UTC date when left out
})
const sent = await sendReceiptsSet(sii, issued) // the envelope, 20 s, its status, then the folio consumption report
// envelopeTrackId is null when the SII said it already had the envelope and named no track id
if (sent.envelopeTrackId !== null) await declareReceiptsTrackId(portal, { trackId: sent.envelopeTrackId })

// The SII validates the set on its own and answers by mail. Later:
const status = await readReceiptsStatus(portal) // readyToDeclare once the set is approved (P90); declared after (P91)
if (status.readyToDeclare) await declareReceiptsCompliance(portal, { provider: { rut, name, mail }, businessName })
const check = await verifyReceiptsAuthorization({ production: productionPortal, certification: portal })
// check.production?.authorized: type 39 can be stamped in production
```

The receipts test set is a plain text of cases; each case is one receipt of type 39 to the final consumer, with prices
that include VAT and a reference `SET` / `CASO-<n>`. `sendReceiptsSet` uploads the `EnvioBOLETA`, waits 20 s and reads
its status, then sends the folio consumption report (RCOF) built from the envelope, starting at sequence number 100 and
trying the next one after a rejection, up to ten times; three duplicates in a row mean today's report was already
accepted (the certification environment takes one per company per day). Both uploads are read as the uploads of the
document runner are: only `STATUS` 0 with a `TRACKID` element is a sent file, `STATUS` 7 is a duplicate, `STATUS` 99
is a failure, and only a network failure is sent again. Each status is asked once: a query that never got through
counts as accepted, an answer without a state or with an unknown one as a rejection. The SII's objections to the
report are expected in certification and block nothing: ten attempts without an accepted report still end in `sent`. The other
outcomes are `envelopeRejected`, and `consumptionFailed` when the report could not be uploaded or was refused for lack
of authorisation (`notAuthorized`); the envelope's track id, when the SII named one, is in the result either way. The XMLs come back in the
result. There is no runner here: the SII's validation of the set takes its own time, and the caller reads the status
again later.

- **The declaration cannot be undone.** `declareReceiptsCompliance` authorises the company to issue receipts in
  production. It reads the status first: `alreadyDeclared` and `notReady` are outcomes, and nothing is sent. Nor is it
  sent without the application's own Long: a record that lacks it is `SII_PORTAL_UNEXPECTED_PAGE`. A record without an
  authorisation date is declared with the date empty.
- **The software provider is mandatory** (`provider`): the SII answered some companies with a bare HTTP 500 when they
  were declared as their own provider by default. A company that is its own provider passes itself.
- **The representative is the owner of the session**, read from the session's cookies; the portal's list is only the
  fallback, and when no cookie gives the check digit the declaration sends `8`. With two people enrolled for a
  company, any other choice is refused.
- **The receipts keep to field behaviour too.** The set is read by position (tabs or two or more spaces; the header and
  `OBSERVACION` in exact case); the receipts carry the UTC day and each is stamped with the UTC instant to the second,
  while the envelope keeps the time of Chile; every request to the receipts portal carries only a fixed set of
  headers, is sent once, waits 30 s and is read as UTF-8 whatever its status, the firewall's page included;
  `P90` and `P91` are searched in the raw answer; the posts that declare are judged by `//OK` alone.
  `verifyReceiptsAuthorization` reads a row as authorised when its state contains `conform`, `aprobad` or `autoriz`:
  read the state it returns yourself.
- **A receipt has its own reference.** The receipts schema gives `Referencia` no date and a free-text code, so a
  receipt takes `receiptReferences` (`{ code, reason, documentType?, folio? }`) and refuses `references`.
- **`verifyReceiptsAuthorization` never throws.** A stamping form the portal does not serve is `queryFailed`, not "not
  authorised".
- **Nothing here has been run against the receipts portal yet.** Every wire comes from field behaviour, and the tests
  use a synthetic set text; the receipts envelope and the report do validate against the official schemas.

## Printed samples (Node)

```typescript
import {
  parsePrintableDocuments,
  renderPrintedSample,
  renderPrintedSamples,
  resolutionLine,
  writePrintedSamples,
  findEnvelopeFiles,
  readPrintedSamples,
} from 'dte-sdk/pdf'

// The signed XML is the input: one document the SDK issued, or any EnvioDTE/EnvioBOLETA
const [doc] = parsePrintableDocuments(signed.xml)
const pdf = await renderPrintedSample(doc, {
  siiOffice: 'S.I.I. - SANTIAGO ORIENTE', // default: the office of the issuer's commune
  resolution: { number: 80, date: '2014-10-21' }, // NroResol and FchResol; a string is printed as given
}) // prints 'Res. Ex. SII N° 80 del 2014' under the stamp; default: 'Res. Ex. SII N° 0 del {year}'
const line = resolutionLine({ number: 80, date: '2014-10-21' }) // the same line, to show it elsewhere
const transferableCopy = await renderPrintedSample(doc, { transferable: true }) // adds the acknowledgement box and CEDIBLE

// A document received from a third party, straight from the bytes of its file (UTF-8 or ISO-8859-1)
const [received] = parsePrintableDocuments(readFileSync('./received/invoice.xml'))

// A receipt on continuous paper: an 80 mm roll as tall as its content, with or without the printed stamp
const ticket = await renderPrintedSample(doc, { paper: 'roll' })
const ticketWithoutStamp = await renderPrintedSample(doc, { paper: 'roll', stamp: false }) // receipts 39 and 41 only

// Every document of every envelope, in memory, classified into the test and simulation sets
const result = await renderPrintedSamples({
  envelopes: [{ name: 'envio-set-basico.xml', xml: envelope.xml }],
  transferable: true,
})

// From the files of a certification run into SET-PRUEBAS and SET-SIMULACION
const files = await findEnvelopeFiles('./certification/envelopes')
const written = await writePrintedSamples({
  xmlFiles: files,
  outDir: './certification/samples',
  logoPath: './logo.png',
  transferable: true,
})
// Back from disk, for the certification runner: every .pdf under the directory, the test set folder first
const samples = await readPrintedSamples('./certification/samples')
```

The printed sample follows the SII printed-samples manual: a page 21.5 cm wide and as tall as its content between 11
and 33 cm, the red type box with the RUT, the type name and the folio, issuer, date, receiver, a guide's transfer type,
the transport area, references, detail, totals, the acknowledgement box and `CEDIBLE` mark on the transferable copy
(33, 34, 43, 46 and sale guides), and the PDF417 stamp of the TED with its legends. The transport area is a box under
the receiver with what the document's `Transporte` carries, in the order of Formato DTE 2.5: both plates, the carrier's
RUT, the driver's name and RUT, the destination's address, commune and city, and the departure date and time and the
arrival date. Formato 2.5 marks every field of the area to be printed but the destination city, which is printed when
the document has it. A dispatch guide and an invoice that moves goods print it alike; a field the document lacks is
left out, and a document without `Transporte` has no box. A document taller than 33 cm goes on to further pages: each
repeats the issuer, the type box and the SII office, numbered under the office (`Página 1 de 2`); the date, the receiver
and the transport area print on the first page only; a table that breaks repeats its column head on the next page; and
the totals, the acknowledgement box, the stamp and the `CEDIBLE` mark go on the last page with at least the last detail
line. Every page but the last is 33 cm tall, and the last as tall as its content. A document that fits one page has no
page number. A document that carries commissions and other charges (a settlement invoice, 43, or a purchase invoice
and the notes that correct one) lists them under the detail, each with its description, rate and net, exempt and VAT
values, as Formato DTE 2.5 asks to print them; the totals take the commissions off, and print every additional tax or
withholding of `ImptoReten` by the name the Formato gives its code, with its rate, and the VAT not withheld, the VAT
withholdings with a minus. A purchase invoice thus shows its withheld VAT taken off the total, as the manual's change
of subject example does. Every amount is the one the document carries; `parsePrintableDocuments` reads them into
`commissions` (`PrintableCommission`), `withholdings` (`PrintableWithholding`) and the totals. Formato DTE 2.5 admits in a document only the lines one sheet can print, and the upload of the
certification takes one page per sample, so a document that needs a second page is better split, and a sample must fit
one; the pages keep a longer document whole instead of cutting it.
The sample also prints what Formato DTE 2.5 marks to be printed (section 2.2, column I) when the document has it: the
payment terms in words (`Forma de Pago: Crédito`) and the due date on a line under the issue date, the additional
description of an item under its name, and the special credit of construction companies among the totals, with a
minus. And it writes for the reader: the issue and due dates with the month in words (`15 de noviembre de 2026`), who
dispatches the goods in words under the receiver, the city of each party when it is not the commune again, the
receiver's RUT with dots, a referenced document that is not a DTE by the name the SII gives its code (`Orden de
Compra`), what the document does to the referenced one before its reason (`Anula documento de referencia`), quantities
and unit prices with a point between the thousands and a comma before up to six decimals, and the total in words under
the totals (`Son: …`). `parsePrintableDocuments` reads these into `paymentTerms`, `dueDate`, `dispatchType`, the `city`
of each party, an item's `description`, a reference's `code` and `totals.constructionCredit`.
The rest of that column prints too, when the document has it. Under the issue date, flowed on as many lines as they
need: the payment medium and the kind of account in words (`Medio de Pago: Cheque a fecha`, `Tipo de Cuenta: Cuenta
corriente`; a receipt names its media as its own format does), the account number and the bank, the description of the
terms of payment, the amount paid and the balance owed, and each scheduled payment. Under the receiver: the kind of
special invoice (`Tipo de Factura Especial: 1 - Factura Turista`), who issues a guide for export in words and the
resolution that authorises them, the principal (`RUT Mandante`) and whoever asked for the invoice (`RUT Solicitante`).
In the receiver's box, the document of a foreign receiver (`Identificación: Pasaporte N° …`). Among the totals, the
base of the slaughter of meat, the base of the margins of trade and the deposit guarantee of containers, and under
them the totals in another currency (`Otra Moneda: DOLAR USA`), each tax by the name of its code. Under an item, its
surcharge, the bases and the price to the final consumer of a withholding agent, and its value in another currency;
and a global discount or surcharge with its description. Every amount is the one the document carries.
`parsePrintableDocuments` reads them into the optional fields of `PrintableDocument` named after them (`payments` is a
list of `PrintablePayment`, the receiver a `PrintableReceiver` and `otherCurrency` a `PrintableOtherCurrency`). The
An export document (110 to 112) is not printed yet: its amounts are in a foreign currency, with decimals and a
customs area, and `renderPrintedSample` refuses it with `INVALID_DOCUMENT_TYPE` instead of printing them as pesos.
A document with no `TED` prints `SIN TIMBRE ELECTRÓNICO` in a box where the stamp goes, with the legend `Documento sin
validez tributaria`, so its print never passes for that of a stamped one.
`parsePrintableDocuments` takes the XML as text or as the bytes of its file, read as UTF-8 when they are UTF-8 and as
ISO-8859-1 otherwise, and takes each `TED` as it was signed: as written when its `FRMT` verifies over its `DD` with the
key of the CAF it carries, and otherwise the form the `FRMT` does verify, without the whitespace between its tags or
with its `DD` written again from its element. So a file some tool indented after it was signed still prints a stamp
that verifies; a stamp no form of which verifies prints as written.
`parsePrintableDocuments` reads the area into `transport` (`PrintableTransport`), every field as written. The legend under the type box is `siiOffice` when given;
otherwise the office of the issuer's commune (`CmnaOrigen`), looked up with `siiOfficeForCommune` in
`SII_OFFICES` (360 commune names in 40
offices, every official commune included, ignoring case, surrounding spaces and accents), and `S.I.I. - SANTIAGO CENTRO` for a commune the table lacks.
The line under the stamp is `resolution`: a string printed as given, or the company's resolution as `{ number, date }`
(`NroResol`, and `FchResol` as `YYYY-MM-DD`) printed as `Res. Ex. SII N° {number} del {year}`, the line
`resolutionLine` returns alone; a number that is not a whole number from 0 throws `INVALID_OPTION` and a date that is
not real `INVALID_DATE`. Without it the line is number 0 of the year of `now`, the one of certification.
`paper: 'roll'` prints the continuous paper of the manual (the format of a point of sale printer) instead of the sheet,
for any type: a page 80 mm wide, above the 7.5 cm the manual asks for, with the 0.5 cm border, as tall as its content
with no cap, and the order the manual gives for it: the type box centred, the SII office, the issuer, the receiver, the
date, references, detail, totals, the acknowledgement box of a transferable copy, the stamp and the destination mark.
The type box letters are 10 pt bold, and the stamp is 7 cm wide with its legends in 7 pt. The default is `'sheet'`, and
the certification samples are always the sheet. `stamp: false` leaves the electronic stamp and its legends out of a
receipt (39 or 41), whose printed stamp is optional from 1 January 2026 (Res. Ex. SII N° 207 of 2025; the XML keeps its
`TED`), on the sheet or on the roll; on any other type it throws `INVALID_OPTION`. Delivering the receipt virtually
instead of printing it (Res. Ex. SII N° 53 of 2025) stays with the application. The stamp encodes the signed bytes exactly (`renderTedBarcode` gives the PNG
alone), always at error correction level 5, the one the SII's instructions ask for. A stamp with a byte above ASCII,
as the document of another issuer may carry in a name, is written in byte compaction alone when it fits, so no reader
has to follow a shift in the middle of text to get the byte that was signed; a stamp of plain ASCII, as every one
dte-sdk issues, keeps the compaction the barcode library picks. It needs Node and the optional peers `pdf-lib` and `bwip-js`, which are loaded on first use: without them
the render functions throw `DEPENDENCY_UNAVAILABLE`. Failures of a batch come back as data (`failures[].code`), never as thrown errors; a folio that is not a run
of digits is an `INVALID_FOLIO` failure, since it would name the file. A stamp raster above 300 DPI is not printed
yet: see the
[printed samples design](./docs/superpowers/specs/2026-11-04-phase-5a-printed-samples-design.md).

## Catalogs

The root entry holds the SII's code tables as typed constants: the document types (`DOCUMENT_TYPES`), the `CodRef`
codes, the transfer and dispatch indicators, the payment terms and the books' codes, and, each with a type guard, the
tables of Formato DTE 2.5 and of the receipts' format:

| Constant | Field | Holds | Source |
|---|---|---|---|
| `ADDITIONAL_TAXES` | `TipoImp`, `CodImpAdic` | 40 codes of additional taxes and withholdings: name, class, rate, documents, code of total withholding | Formato DTE 2.5, section 4, pages 51 to 54 |
| `PAYMENT_MEDIA` | `MedioPago` | `CH`, `CF`, `LT`, `EF`, `PE`, `TC`, `OT` | Formato DTE 2.5, page 15 |
| `RECEIPT_PAYMENT_MEDIA` | `MedioPago` of a receipt | `'1'` to `'5'` | Formato Boletas Electrónicas 4.2, page 9 |
| `REFERENCE_DOCUMENT_TYPES` | `TpoDocRef` | 42 numeric codes a reference can name, with their names | Formato DTE 2.5, pages 45 and 3 |
| `RECEIPT_REFERENCE_DOCUMENT_TYPES` | `TpoDocRef` of a receipt | the 11 codes a receipt's reference can name | Formato Boletas Electrónicas 4.2, page 18 |
| `CURRENCIES` | `TpoMoneda` | the 40 currencies an export document can be in, `PESO CL` among them | `TipMonType` of `SiiTypes_v10.xsd` |
| `EXPORT_SERVICE_INDICATORS` | `IndServicio` of an export document | 3 to 6 | Formato DTE 2.5, page 13 |

```typescript
import { ADDITIONAL_TAXES, isAdditionalTaxCode, isReferenceDocumentType } from 'dte-sdk'

ADDITIONAL_TAXES[24] // { name: 'DL 825/74, ART. 42, letra b)', kind: 'additional', rate: 31.5, documents: [33, 56, 61] }
ADDITIONAL_TAXES[30].totalWithholdingCode // 301, the code when the buyer withholds the whole VAT
isAdditionalTaxCode(16) // false: the schema admits it, the table does not describe it
isReferenceDocumentType(801) // true, Orden de Compra; an alphabetic TpoDocRef such as 'SET' is not checked
```

The tables are data: `createDocument` does not check a document against them. The units of measure (`UnmdItem`,
`UnmdRef`) have no table, since Formato DTE 2.5 makes them free text of up to four characters that the SII does not
check outside exports.

The business activities (`Acteco`) are about 10 kB, so they have an entry of their own, `dte-sdk/catalogs`, and only
who imports it pays for them. `BUSINESS_ACTIVITIES` holds the 674 codes of the SII's list
([Códigos de Actividad Económica](https://www.sii.cl/ayudas/ayudas_por_servicios/1956-codigos-1959.html)), sorted,
each with its name and the list's three columns as the SII writes them: `subjectToVat` ("Afecto a IVA": `SI`, `NO`
or `G`), `taxCategory` ("Categoría Tributaria": `1`, `2` or `G`) and `availableOnline` ("Disponible Internet"). `G`
means, in the list's own glossary, that the tax category and VAT are decided by the activity's own characteristics.

```typescript
import { businessActivity, isBusinessActivityCode } from 'dte-sdk/catalogs'

businessActivity(620100) // { code: 620100, name: 'ACTIVIDADES DE PROGRAMACIÓN INFORMÁTICA', subjectToVat: 'G', taxCategory: 'G', availableOnline: true }
isBusinessActivityCode(11101) // true: the list writes it 011101, and as a number it loses its leading zero
```

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
`classifyUploadStatus` reads a code alone; `uploadVerdict('accepted', { accepted: 3, rejected: 1, objections: 0 })` →
`'partiallyRejected'` settles it with the counts of the documents, as `queryUploadStatus` does.
Spanish glosses via `uploadStatusMessage` and `documentStatusMessage`. The same pattern covers the
`DTEUpload` reception statuses (`classifyReceptionStatus`, `receptionStatusMessage`) and the acceptance/claim
registry (`claimResponseMessage`, `transferabilityMessage`, `CLAIM_ACTIONS`).

## Development

```bash
npm install          # also builds via `prepare`
npm test             # unit, property, type-level and dist smoke tests
npm test -- --coverage
npm run build        # esbuild (ES modules, one file per entry plus shared chunks) + tsc declarations
npm run lint         # ESLint flat config + Prettier
npm run size         # bundle size guard (.size-limit.json)
npm run scan         # no real RUTs, local paths or secrets in tracked files
SII_LIVE=1 SII_CERT_PFX=… SII_CERT_PASSWORD=… npx jest tests/live   # opt-in smoke against maullin (needs a real certificate)
```

Releases are tag-triggered and published from CI with npm provenance — see
[RELEASING.md](./RELEASING.md). The design of each area and the decisions behind it are under
[docs/superpowers/specs](./docs/superpowers/specs), and [docs/decisions/entry-points.md](./docs/decisions/entry-points.md)
explains the entries.

## Contributing

Contributions are welcome — feel free to open issues for bugs and feature
requests, or submit a pull request.

## License

[MIT](./LICENSE) © Arrow Software
