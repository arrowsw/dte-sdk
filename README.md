<div align="center">
  <h1>dte-sdk: Chilean electronic tax documents (DTE) with TypeScript.</h1>

[![npm version](https://img.shields.io/npm/v/dte-sdk?color=000&label=npm)](https://www.npmjs.com/package/dte-sdk)
[![types included](https://img.shields.io/npm/types/dte-sdk?color=000)](https://www.npmjs.com/package/dte-sdk)
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
- 📚 **SII books** — the purchase and sales book, the dispatch guide book and the folio
  consumption report, with their summaries computed from the lines.
- 🏛️ **SII portal and folios** — certificate login with reused sessions, company data, folio
  quota, CAF requests, annulment and re-obtaining, and a local folio registry.
- 🗂️ **Purchase and sales register and MIPYME backup** — the documents and official summaries of
  a period, purchase reclassification, and the XML of issued and received documents.
- 🎓 **Certification** — the SII test sets parsed and issued, their books, the simulation, the
  exchange answers, and a resumable runner over the certification portals; and the certification
  of receipts (boletas), an application of its own, as pieces to chain.
- 🖨️ **Printed samples** — one PDF per document following the SII manual, with its PDF417 stamp.
- 🧠 **Fully typed** — a domain model in English (`totalAmount`, `issuer.businessName`)
  that maps to the official SII tags (`MntTotal`, `RznSoc`) through a codec.
- 🇨🇱 **Identity by [rut.ts](https://github.com/arrowsw/rut.ts)** — every RUT is
  validated and normalized by rut.ts; nothing is reimplemented here.
- 🛡️ **Typed errors** with stable codes and no personal data in messages.

## Contents

- [Status](#status)
- [Installation](#installation)
- [Entry points](#entry-points)
- [Quick start](#quick-start)
- [Step by step](#step-by-step)
- [SII web services](#sii-web-services)
- [SII books](#sii-books)
- [SII portal and folios](#sii-portal-and-folios)
- [Purchase and sales register and MIPYME backup](#purchase-and-sales-register-and-mipyme-backup)
- Certification: [test sets, simulation and books](#certification-test-sets-simulation-and-books),
  [the runner](#certification-the-runner),
  [the exchange and the printed samples](#certification-the-exchange-and-the-printed-samples),
  [receipts](#certification-receipts)
- [Printed samples (Node)](#printed-samples-node)
- [Errors](#errors) and [status codes](#status-codes)
- [Development](#development)

## Status

The version on npm (0.0.2) is a placeholder with no API. Everything in this README lives on the
[`canary`](https://github.com/arrowsw/dte-sdk/tree/canary) branch and ships in 0.1.0, the first release with a public
API. Version 1.0.0 will be the first one recommended for production.

Every area is tested against synthetic SII answers, with a 100 % coverage gate in CI. Those tests cannot show how the
real SII answers, so this table says what has met it so far:

| Area                                                           | Entry            | Against the real SII                                                                                                                                                            |
| -------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documents, stamps, signatures and envelopes                    | `dte-sdk`        | Not sent yet                                                                                                                                                                    |
| SII web services client                                        | `dte-sdk`        | Not run yet ([issue 8](https://github.com/arrowsw/dte-sdk/issues/8))                                                                                                            |
| SII books                                                      | `dte-sdk`        | Not sent yet; they validate against the official schemas in the tests                                                                                                           |
| Portal session and company data                                | `dte-sdk/portal` | Login, logout, taxpayer data and the refusal pages, for a company not enrolled as an issuer                                                                                     |
| Folios and CAF requests                                        | `dte-sdk/portal` | Not seen yet: they need an enrolled company                                                                                                                                     |
| Purchase and sales register, MIPYME backup                     | `dte-sdk/portal` | Read-only requests answered for a company with no documents; rows, downloads and writes not seen yet                                                                            |
| Certification sets, runner, exchange and upload of the samples | `dte-sdk/portal` | Not run yet; the exchange answers validate against the official schemas in the tests                                                                                            |
| Certification of receipts (boletas)                            | `dte-sdk/portal` | Not run yet: it needs a company enrolled in the receipts application; the receipts envelope and the folio consumption report validate against the official schemas in the tests |
| Printed samples                                                | `dte-sdk/pdf`    | Not reviewed by the SII yet                                                                                                                                                     |

Still to come before 0.1.0: the live runs tracked in [issue 8](https://github.com/arrowsw/dte-sdk/issues/8). Out of
scope: export documents (110, 111 and 112), fee receipts (boletas de honorarios), the assignment of invoices (AEC),
forms F29 and F22, the exchange e-mail and full XSD validation.

## Installation

```bash
npm install dte-sdk
```

Until 0.1.0 is published, that command installs the 0.0.2 placeholder. To try the API described here, build the
package from `canary`:

```bash
git clone https://github.com/arrowsw/dte-sdk.git
cd dte-sdk
npm install
npm pack   # builds and writes dte-sdk-0.0.2.tgz
```

and install that file in your project:

```bash
npm install ../dte-sdk/dte-sdk-0.0.2.tgz
```

Node ≥ 22.12. The package ships ES modules only, and a CommonJS project loads it with `require()` just the same. Printed
samples need two more packages, which stay out of the install otherwise:

```bash
npm install pdf-lib bwip-js
```

## Entry points

| Import from      | What it holds                                                                                                                                                                                      | Runs on                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `dte-sdk`        | Documents, stamps, signatures, envelopes, books and the SII web services client over `fetch`                                                                                                       | Node, Bun, Deno; bundles for the browser with no configuration |
| `dte-sdk/node`   | `createNodeHttpsTransport`, `createDirectoryCapture`, `createDirectoryUploadArchive`, `createDirectoryFolioRegistry`                                                                               | Node                                                           |
| `dte-sdk/portal` | SII portal, folios and CAF requests, the folio registry, purchase and sales register, MIPYME backup, and certification: sets, runner, exchange, upload of the samples and the receipts application | Node                                                           |
| `dte-sdk/pdf`    | Printed samples                                                                                                                                                                                    | Node, with `pdf-lib` and `bwip-js` installed                   |

`DteError` and `isDteError` come from `dte-sdk` and recognize what every entry throws.

Jest in its default CommonJS mode cannot `require()` an ES module. Run it in ESM mode, or let it transform this package
with `transformIgnorePatterns`.

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
ISO-8859-1 (the envelopes and books this SDK builds do); anything else is refused with
`INVALID_OPTION { field: 'xml' }` before anything is sent, and whitespace before the declaration
is dropped.

The client is plain data: every operation is a free function that takes it first. Tokens are
obtained and renewed for you (one cache per environment, channel and certificate). Also
available: `getSeed`/`getToken`, `uploadBook`, `uploadFolioConsumption`, `queryUploadStatus`,
`queryDocumentStatus`, `folioReceived`, `listClaimEvents`, `queryTransferable`,
`queryReceptionDate`, `receiverStatus`.

Options worth knowing:

- `transport`: `fetch` by default; `createNodeHttpsTransport({ tls })` from `dte-sdk/node` for a custom CA
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
- `capture: createDirectoryCapture({ dir })` from `dte-sdk/node` writes every HTTP exchange, redacted (tokens,
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

- **CAF XML is a secret.** `xml` holds the private key of the CAF. Where you keep it is up to you.
- **One session per certificate.** The SII rations sessions per RUT, so `sessionCache` and `lock` are ports: several
  replicas need shared ones. Sessions are reused for 90 minutes and logged in on demand.
- **Rationing.** `MAX_AUTOR` and `FOLIOS_DISP` appear only while the SII rations a type. Unused folios lower what it
  authorizes and eventually block stamping.
- **To lift a block, issue with the folios you have.** `reobtainFolios` gets lost CAFs back without spending quota.
  `requestCafInBatches` is for a small `MAX_AUTOR` with nothing unused, and `requestCafExact` wants one CAF for the
  whole quantity.
- **A grant can be smaller than asked.** `requestCaf` caps at `MAX_AUTOR` and, past the effective maximum with no
  `minQuantity`, asks for one folio, so read `granted`. `minQuantity` and `requestCafExact` are the strict forms.
- **Annulling cannot be undone** and counts against the quota for six months. `annulFolios` needs `range`,
  `withinDays` or `all: true`, and `requestCafExact` annuls only with `allowAnnul: true`. `maxRanges` limits a pass,
  not the call: each pass tries at most `maxRanges` ranges (50, or 20 in `requestCafExact`) and there are up to four
  passes, so one call can annul up to four times that many (200, or 80). Every step is tried up to three times,
  whatever the error, on top of the retries of the client. `exclude` protects a CAF still in use. Pass `knownAnnulled`
  back between runs: the portal keeps listing annulled ranges forever.
- **Getting a range back asks the SII which folios are free.** `reobtainFolios` sends the requests the reference
  sends (referers without a host, the forms picked by their exact opening tag, no session handling on the way in) and
  reads the listing for ranges and nothing else: with a session that expired, or on a page that states a refusal, the
  list is empty, and a listing that fails for any reason reads as no ranges to get back (the failure is in `reason`).
  It does not sign in on demand: call it with a session that is alive.

`createFolioRegistry`, `createMemoryFolioRegistry` and, from `dte-sdk/node`, `createDirectoryFolioRegistry` keep local
track of the folios of each CAF: reserve, mark as sent or annulled, release. `reserve` hands out the next free folio:
after the last one reserved, or from the lowest one reserved and not sent, never one that is used or annulled and never
a free one below that point. With `{ lowestFree: true }` it hands out the lowest free folio of the whole range, which is
what the certification run asks for; use it only when the registry records every folio the range has spent. A service
with its own database implements `FolioRegistry` with its own transactions, the option included if it is to back a
certification run.

A refusal of the SII is `SII_PORTAL_REJECTED`, with `details.rejection` and `portalRejectionMessage` saying what it means
and what to do; the composite flows return it as data, so the CAFs already obtained are not lost. Login, logout and the
refusal pages were measured against the real SII, but the pages of an enrolled company (quota, CAF, folio ranges) have not
been seen yet: see the [portal and folios design](./docs/superpowers/specs/2026-11-02-phase-4-portal-folios-design.md).

## Purchase and sales register and MIPYME backup

These run on the same session as the rest of the portal.

```typescript
import {
  listPeriodDocuments,
  fetchRegisterSummary,
  listPurchaseTypes,
  changePurchaseType,
  fetchPurchaseDocument,
  moveVatToCommonUse,
  downloadMipymeBackup,
} from 'dte-sdk/portal'

const { summary, documents } = await listPeriodDocuments(portal, { period: '2026-10', direction: 'received' })
const { rows, header } = await fetchRegisterSummary(portal, { period: '2026-10', operation: 'purchase' })

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
| How a purchase is classified, and changing it                                     | `fetchPurchaseDocument` and the writes | `complementoscvui`       |
| The full XML of a document                                                        | `downloadMipymeBackup`                 | MIPYME backup            |

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
- **`backupNoData` is definitive.** `backupCaptcha` and `backupIndeterminate` mean try later, never in a loop.

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
folios each type needs; `issueTestSet` issues the basic, exempt, guide and purchase sets through `issueDocument`
with the `SET` reference (`CASO <id>`) and the rules the SII review expects (returned goods at the original price,
cancellations taking the cancelled document's items, the issuer as receiver of purchase invoices and internal
transfers); `issueSimulation` re-issues every case in one envelope; the three `createCertification*Book` functions
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
- **The run keeps to the reference.** Where this runner and the reference implementation it was ported from differed
  in what the SII receives or in how the run flows, the runner now does what the reference does, including where a
  stricter reading looked safer; the improvements set aside are tracked for after the first real certification.
- **The test sets are written as the reference writes them.** Their documents carry the UTC day as issue date and UTC
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
  not the books were approved, as the reference does, and stops with the portal's sentence when the portal does not
  move. `runBooks` ends `incomplete` only when a mandatory book could not be sent.
- **The simulation is written as the reference writes it,** which is not how it writes the test sets: the local date
  of the process, stamps in UTC to the second, the envelope stamped in Chile time, plain unit prices, and a guide
  without `TpoDespacho`. Run the process with `TZ=America/Santiago`.
- **The declaration of compliance counts as made when the last page no longer shows its form.** That is the
  reference's reading; keep the page the store saves and check it.
- **The folios of a run are checked against the SII.** Before a set is issued the SII is asked whether it already
  holds the folios the run is about to use (as the company, up to 30 queries per CAF); one it holds is marked used. A
  range obtained again is used only through the folios the SII showed free, and takes the place of the CAFs in hand of
  its type. A maximum that cannot be read counts as no cap, a blocked type is not asked for but obtained again, a
  maximum below the need is asked in as many batches as folios are missing, and after annulling the maximum is read
  again. Annulling (the last resort: unused ranges of the last 180 days, 10 in each of up to four passes) never
  touches a range the run downloaded, and the ranges the SII reported annulled are kept in the state
  (`annulledRanges`) and not tried again. Every CAF obtained is saved in the state at once, so a step that ends short
  leaves it in hand for the next attempt.
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
  a 5xx) and no time-out of their own, with the headers the reference sends to each portal and the answers read as
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
- **The receipts keep to the reference too.** The set is read by position (tabs or two or more spaces; the header and
  `OBSERVACION` in exact case); the receipts carry the UTC day; every request to the receipts portal carries only the
  headers the reference sends, is sent once, waits 30 s and is read as UTF-8 whatever its status; `P90` and `P91` are
  searched in the raw answer; the posts that declare are judged by `//OK` alone. `verifyReceiptsAuthorization` reads a
  row as authorised when its state contains `conform`, `aprobad` or `autoriz`: read the state it returns yourself.
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
  writePrintedSamples,
  findEnvelopeFiles,
  readPrintedSamples,
} from 'dte-sdk/pdf'

// The signed XML is the input: one document the SDK issued, or any EnvioDTE/EnvioBOLETA
const [doc] = parsePrintableDocuments(signed.xml)
const pdf = await renderPrintedSample(doc, {
  siiOffice: 'S.I.I. - SANTIAGO ORIENTE',
  resolution: 'Res. Ex. SII N° 80 del 2014',
})
const transferableCopy = await renderPrintedSample(doc, { transferable: true }) // adds the acknowledgement box and CEDIBLE

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

The printed sample follows the SII printed-samples manual: one page 21.5 cm wide and as tall as its content between 11
and 33 cm, the red type box with the RUT, the type name and the folio, issuer, date, receiver, references, detail,
totals, the acknowledgement box and `CEDIBLE` mark on the transferable copy (33, 34, 43, 46 and sale guides), and the
PDF417 stamp of the TED with its legends. The stamp encodes the signed bytes exactly (`renderTedBarcode` gives the PNG
alone). It needs Node and the optional peers `pdf-lib` and `bwip-js`, which are loaded on first use: without them
the render functions throw `DEPENDENCY_UNAVAILABLE`. Failures of a batch come back as data (`failures[].code`), never as thrown errors; a folio that is not a run
of digits is an `INVALID_FOLIO` failure, since it would name the file. Retentions, the commission block of settlement
invoices and a stamp raster above 300 DPI are not printed yet: see the
[printed samples design](./docs/superpowers/specs/2026-11-04-phase-5a-printed-samples-design.md).

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
npm run build        # esbuild (ES modules, one file per entry plus shared chunks) + tsc declarations
npm run lint         # ESLint flat config + Prettier
npm run size         # bundle size guard (.size-limit.json)
npm run scan         # no real RUTs, local paths or secrets in tracked files
SII_LIVE=1 SII_CERT_PFX=… SII_CERT_PASSWORD=… npx jest tests/live   # opt-in smoke against maullin (needs a real certificate)
```

Releases are tag-triggered and published from CI with npm provenance — see
[RELEASING.md](./RELEASING.md). The design of each area and the decisions behind it are under
[docs/superpowers/specs](./docs/superpowers/specs), and [docs/decisions/entry-points.md](./docs/decisions/entry-points.md)
explains the four entries.

## Contributing

Contributions are welcome — feel free to open issues for bugs and feature
requests, or submit a pull request.

## License

[MIT](./LICENSE) © Arrow Software
