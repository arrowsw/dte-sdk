# dte-sdk — Phase 5c-2 design (certification: the receipts track)

Date: 2026-11-04 · Status: **written on Hans's go-ahead after the three design sections were approved in chat; the shape of the phase (D87) and the mandatory software provider (D88) were his decisions** · Author: Claude (with Hans)

Starting point: the phase 5c-1 spec (D76–D86: the GWT-RPC codec, the raw requests on the portal session), the phase 5b-1
spec (the test sets issued through phase 1), the phase 2 spec (uploads and status queries) and the phase 3 spec (the
folio consumption report). Decisions continue at D87. SII facts come from the official receipts schema
(`EnvioBOLETA_v11.xsd`) and from field behaviour known to carry a company through the certification of electronic
receipts on the SII's receipts portal; section 6 says which is which and what this SDK has never seen. No third-party
implementation is named in the repository; the SII behaviour is described directly.

---

## 1. Goal and scope

The certification of electronic receipts (boletas, types 39 and 41) is an application of its own at the SII, on its own
GWT portal, with its own test set and its own declaration of compliance. This phase gives the pieces of that track, as
the field runs them:

1. **The receipts test set**, a plain text of cases with items, parsed.
2. **The receipts of the set issued and their envelope signed**, through phase 1, one receipt per case.
3. **The envelope sent and the folio consumption report after it**, through phases 2 and 3, with the field's waits
   and its retries over the report's sequence number.
4. **The portal operations**: the set downloaded, the track id declared for the SII's validation, the state of the
   application read, the declaration of compliance and production authorisation made, and the authorisation verified.
5. **The receipt reference of the receipts schema** in phase 1, which the set needs and phase 1 lacks (D91).

Out of scope, on purpose: a runner with a saved state (D87: the field has none; the README documents the order), the
receipts book, the daily sales summary in production, and anything that calls the SII in the default test run.

---

## 2. Architecture decisions

### D87. The shape of the field: pieces, no runner, no saved state

Hans's decision: this phase stays as close to the field as it can. The field has the pieces (a parser, an issuer, a
sender, five portal functions) and no orchestration; the caller chains them. So does this phase: free functions over
`readonly` data, each usable alone, in `dte-sdk/portal`. `runCertification` does not change.

### D88. The software provider is mandatory in the declaration

Hans's decision. The declaration names the software provider (RUT, name, mail, query link). The field falls back to the
company itself when no provider is given, and records that the SII answered some companies with a bare HTTP 500 for
that variant. Here `provider` is required: without it the operation throws `MISSING_FIELD` before touching the portal.
A company that is its own provider says so by passing itself.

### D89. The portal's hashes are the known pair, with an override

The receipts portal's permutation and policy are the pair known to work; `gwt: { permutation, policy }` overrides them.
There is no discovery here: the name of this portal's GWT module is not recorded anywhere, and a guess would add a
request that always fails. A stale pair shows as an answer without `//OK`.

### D90. The declaration body is a template

The four small calls are built with the phase 5c-1 codec, which gains a null that carries its declared type (one call
passes a null `Integer`). The declaration (`autorizarEmpresaBolProd`) is written as the field writes it: a fixed table
of 24 strings and a fixed body with the values in their places. It holds back-references to an earlier object, which
the codec does not write, and its field names are known by position only; the exact wire is what passed.

### D91. Receipts carry their own reference

The receipts schema gives `Referencia` its own shape: `NroLinRef`, then optional `TpoDocRef`, `FolioRef`, `CodRef` (free
text, 18 characters), `RazonRef`, `CodVndor`, `CodCaja`; no `FchRef`, `IndGlobal` or `RUTOtr`. Phase 1 writes the
invoice shape on every document, so a receipt with a reference fails the schema today (measured: section 6), and the
test set asks for exactly `CodRef` = `SET` and `RazonRef` = `CASO-<n>` on every receipt. Phase 1 gains
`receiptReferences` on the document input and the document; `references` on a receipt and `receiptReferences` on
anything else are refused.

### D92. Chile dates and times

The issue date of the receipts and the date of the declaration (`dd-mm-yyyy`) are Chile dates of the injected clock,
as everywhere in the SDK (D70, D82).

### D93. Results are data

The XMLs the field writes to a debug directory come back in the results (the envelope, every folio consumption report
tried); the caller keeps them. "Not ready yet" and "already declared" are outcomes, not errors. Non-fatal failures (a
status query that does not answer) go to the logger.

### D94. Field defects not copied

Listed in section 7: the RUT handled by hand, the server not verified, the HTTP status ignored, a failed declaration
returned with its request unredacted, a pattern that never matches and its accidental fallback, dates from two
different clocks, a default verifier, two functions nobody calls.

### D95. Size: the `dte-sdk/portal` limit by the D36 rule

The entry stands at 62.53 kB against 64 kB with phase 5c-1. The limit is set from the measurement at the plan's tip,
rounded up to the next 2 kB.

### D96. Entries

Everything of this phase is exported by `dte-sdk/portal`; the receipt reference types by `dte-sdk`.

---

## 3. Phase 5c-2 — detailed design

### 3.1 `src/` layout

```
src/model/document.ts                             (modify) ReceiptReferenceInput, ReceiptReference, the two fields
src/model/sii.ts                                  (modify) SiiReferenciaBoleta
src/model/codec.ts                                (modify) receipts write and read their own Referencia
src/document/create.ts                            (modify) receiptReferences normalised; the two refusals
src/portal/gwt.ts                                 (modify) a null with a declared type
src/catalogs/certification.ts                     (modify) RECEIPTS_PORTAL
src/catalogs/portal.ts                            (modify) rejections receiptsNotEnrolled, receiptsTrackIdRefused, receiptsComplianceRefused
src/certification/receipts-set.ts                 parseReceiptsTestSet
src/certification/receipts.ts                     issueReceiptsSet, sendReceiptsSet, resendReceiptsConsumption
src/portal/pages/receipts-certification.ts        the receipts portal's answers
src/portal/pages/certification-progress.ts        (modify) the receipts row of the progress page
src/portal/receipts-certification.ts              the five operations
```

Also touched: `src/index.ts`, `src/portal/index.ts`, `tests/public-api.test.ts`, `tests/types.test.ts`,
`tests/dist.smoke.test.ts`, `tests/support/xsd.ts`, `.size-limit.json`, `README.md`, `CHANGELOG.md`, `llms.txt`.

### 3.2 The receipt reference (phase 1)

- `ReceiptReferenceInput { code?, reason?, documentType?, folio? }`: `CodRef` (the company's own reference code, at most
  18 characters; `SET` in the certification test set), `RazonRef` (at most 90), `TpoDocRef` (at most 3), `FolioRef` (at
  most 18). `ReceiptReference` adds `lineNumber`.
- `DocumentInput.receiptReferences?` and `Document.receiptReferences` (empty when none).
- `createDocument`: `references` on a receipt → `INVALID_OPTION { field: 'references' }`; `receiptReferences` on any
  other type → `INVALID_OPTION { field: 'receiptReferences' }`; texts sanitized as every SII text.
- `toSiiDocument` writes `Referencia` from `receiptReferences` on receipts, in schema order (`NroLinRef`, `TpoDocRef`,
  `FolioRef`, `CodRef`, `RazonRef`); `fromSiiDocument` reads it back. `SiiReferenciaBoleta` is the SII shape.

### 3.3 The receipts test set (`src/certification/receipts-set.ts`)

`parseReceiptsTestSet(text)` → `readonly ReceiptsTestCase[]`, each `{ number, items: [{ name, quantity, unitPrice,
exempt }], observations: string[] }`. Line by line, trimmed:

- A line starting with `CASO-<n>` or `CASO<n>` (any case) opens a case; the item mode goes off.
- A line holding `Item`, `Cantidad` and `Precio` turns the item mode on.
- A line starting with `OBSERVACION` gives the text after the colon, without its quotes, to the open case.
- In item mode, a non-empty line that does not start with `=` is split on tabs or runs of two or more spaces; with
  three parts or more it is an item: the name, the quantity (decimal comma accepted), the price (thousands dots and
  commas dropped); kept when both are numbers. An item whose name holds `exento` is exempt.

Nothing before the first case is kept. A text without cases gives an empty list.

### 3.4 Issuing the set (`issueReceiptsSet`)

`issueReceiptsSet(cases, { issuer, certificate, folios, resolution, now? })` → `{ receipts, envelope, firstFolio,
lastFolio }`. One receipt of type 39 per case, in order, each with the next folio of the phase 5b-1 folio source:

- The receiver is the final consumer (`66666666-6`), the phase 1 default for receipts.
- The prices of the set include VAT, as every receipt's do.
- An exempt item carries its exemption indicator.
- When an observation holds "unidad de medida", its last word after `en` (the text "… unidad de medida en Kg." gives
  `Kg`) is the unit of the first item.
- One receipt reference: `code` `SET`, `reason` `CASO-<n>`.
- The issue date is the Chile date of the clock.

The envelope is `EnvioBOLETA` with the issuer, the certificate holder as sender (the issuer when the certificate names
none), the SII as receiver and the resolution, signed with phase 1. No cases → `MISSING_FIELD { field: 'cases' }`.

### 3.5 Sending the set (`sendReceiptsSet`, `resendReceiptsConsumption`)

`sendReceiptsSet(sii, issued, { sequence?, sleep?, onProgress? })` → `ReceiptsSendResult`:

1. Upload the envelope (`uploadEnvelope`; in certification the receipts go through `DTEUpload`). An envelope the SII
   says it already has carries on with the track id the SII names. Any other failure propagates.
2. Unless it was a duplicate: `BOLETA_SOAP_CHECK`, wait 20 s, query the upload status. A rejection ends with
   `outcome: 'envelopeRejected'`, the SII's gloss, and `notAuthorized` when the gloss speaks of authorisation or
   signing (`autorizado|autorizar|firmar|permiso`). A query that fails is logged and the sequence goes on.
3. `BOLETA_RCOF`, then the folio consumption report, built with phase 3 from the receipts of the envelope, with the
   sequence number `sequence` (100 by default) plus the attempt, up to 10 attempts:
   - a report the SII says it already has counts as a duplicate; three in a row mean a report was already accepted
     today (the certification environment takes one per company per day): `consumptionAlreadySent`, stop;
   - an upload that fails for another reason ends with `outcome: 'consumptionFailed'` and the error;
   - a report uploaded: wait 30 s, query its status; a query that fails, an accepted report or one still in process
     is accepted, stop; a rejection whose gloss speaks of authorisation ends with `outcome: 'consumptionFailed'` and
     `notAuthorized`; any other rejection tries the next sequence number.
   - Ten attempts without an accepted report still end in `outcome: 'sent'`, without a report track id, as the field
     does: the SII's objections to the report are expected in certification and block nothing.
4. `outcome: 'sent'` with the envelope track id, the report's track id and sequence, and every report tried (its
   sequence, XML and what happened).

`resendReceiptsConsumption(sii, { envelopeXml, certificate, sequence })` builds the report again from a sent envelope
and uploads it once.

### 3.6 The receipts portal's answers (`src/portal/pages/receipts-certification.ts`)

- `representativeOf(answer)`: the last string of the table made of 7 or 8 digits, or null. An empty table is a company
  that is not enrolled.
- `postulationOf(answer)`: the authorisation date, the first table string shaped `dd/mm/yyyy` (empty when none), and
  the application's Long, the first single-quoted token of the body (`0` when none).
- `receiptsStateOf(body)`: `P90` when the body holds it; else the first quoted `P<digits>`; else null. `isEmptyList`
  when the body opens with `//OK[0,[]`.
- `isReceiptsSet(status, text)`: HTTP 200 and at least 10 characters once trimmed.
- The receipts row of the progress page (`pe_avance6`), added to the phase 5b-2 progress page: the bold text after the
  cell that names `BOLETA`; authorised when it holds `conform`, `aprobad` or `autoriz`, or when the page says
  "autorizada" next to "boleta".

### 3.7 The receipts portal operations (`src/portal/receipts-certification.ts`)

Base `https://www4.sii.cl/certBolElectDteInternet/`, service `facade`, interface
`cl.sii.sdi.diii.certBolElectDte.web.client.service.Facade`, known permutation `0FC3D987613537E6E13E9BB93A406F13` and
policy `082D0AC4BC4D75A5DF38F116C53877D4`. Every operation takes `companyRut?` and `gwt?`, logs in when the jar holds
no session (`ensureSession`), and holds the session on its own. `INT` and `STR` are the GWT signatures of
`java.lang.Integer` and `java.lang.String`; `<rut>` is the company's digits and `<dv>` its upper-cased verifier.

The four small calls, table then body:

| Method | Table after the four header slots | Body |
|---|---|---|
| `recuperarRepresentantesVigentesUsuariosAutorizados` | `INT`, `STR`, `<dv>` | `1\|2\|3\|4\|2\|5\|6\|5\|<rut>\|7\|` |
| `obtenerPostulacionSeg` | `INT`, `STR`, `<dv>`, `90`, `P90` | `1\|2\|3\|4\|4\|5\|6\|6\|6\|5\|<rut>\|7\|8\|9\|` |
| `ingresarTrackId` | `INT`, `STR`, `<dv>`, `90`, `<trackId>` | `1\|2\|3\|4\|7\|5\|6\|6\|6\|5\|6\|6\|5\|<rut>\|7\|0\|8\|0\|0\|9\|` |
| `obtenerEstadoAutorizaEmp` | `INT`, `STR`, `<dv>` | `1\|2\|3\|4\|4\|5\|6\|5\|6\|5\|<rut>\|7\|5\|<90 or 91>\|0\|` |

`ingresarTrackId` has seven parameters: the company digits, its verifier, a null String, `90`, a null Integer, a null
String, the track id. `obtenerEstadoAutorizaEmp` has four: the digits, the verifier, the state asked for, a null
String.

**The representative** is the owner of the session: the RUT the session cookies name. The portal's list is only the
fallback (its last 7- or 8-digit string, the verifier computed), and with neither the operation throws
`MISSING_FIELD { field: 'representative' }`. With two people enrolled for a company, any other choice makes the SII
answer the declaration with a bare HTTP 500.

- **`downloadReceiptsTestSet(portal, { providerMail? })`** → `{ text, representativeRut }`. The representatives list
  and `obtenerPostulacionSeg` first (the portal wants them before the download; their answers are not judged), then
  `GET DownloadFileServlet?rutEmpresa=<rut>&dvEmpresa=<dv>&rutRepre=<digits>&dvRepre=<dv>&mailProvSw=<mail>` with the
  referer `<base>?SET=1`. `isReceiptsSet`, else `SII_PORTAL_UNEXPECTED_PAGE`.
- **`declareReceiptsTrackId(portal, { trackId })`** → `{ body }`. `ingresarTrackId`, sent once. An answer that does not
  start with `//OK` → `SII_PORTAL_REJECTED { rejection: 'receiptsTrackIdRefused' }`. The SII then validates the set on
  its own and reports by mail.
- **`readReceiptsStatus(portal)`** → `{ enrolled, readyToDeclare, declared, state }`. The representatives list: none
  → not enrolled. Then `obtenerEstadoAutorizaEmp` for 90: `P90` is ready to declare. An empty list is either "not
  approved yet" or "already declared", so the state 91 is asked for: `P91` is declared. A failure of that second call
  is logged.
- **`declareReceiptsCompliance(portal, { provider, businessName, link? })`** → `{ outcome: 'declared' |
  'alreadyDeclared' | 'notReady', state }`. The status first: not enrolled → `SII_PORTAL_REJECTED { rejection:
  'receiptsNotEnrolled' }`; declared → `alreadyDeclared`; not ready → `notReady`, nothing sent. Then the
  representative, `obtenerPostulacionSeg` for the date and the Long, and `autorizarEmpresaBolProd` (3.8), sent once.
  An answer that does not start with `//OK` → `SII_PORTAL_REJECTED { rejection: 'receiptsComplianceRefused' }` with a
  redacted excerpt of the answer. The declaration cannot be undone.
- **`verifyReceiptsAuthorization({ production?, certification? })`** → `{ production, certification }`, each null when
  its client is not given. Production: the stamping types of phase 4 on a production client; `authorized` when type 39
  is among them; a form the portal does not serve is `queryFailed` with the error, never "not authorised".
  Certification: the receipts row of the progress page. Neither check throws.

### 3.8 The declaration body

The table, 24 strings, each escaped (`\` as `\\`, `|` as `\!`):

```
 1 the module base                       13 SII
 2 the policy                            14 the date, dd-mm-yyyy
 3 the service interface                 15 the provider's mail
 4 autorizarEmpresaBolProd               16 the provider's name
 5 cl.sii.sdi.diii.certBolElectDte.to.PostulSegHistInsUpdTo/138688689
 6 P91                                   17 19
 7 BVE                                   18 S
 8 java.lang.Integer/3438268394          19 the query link (www.sii.cl by default)
 9 the company's verifier                20 java.util.ArrayList/4159755760
10 cl.sii.sdi.diii.certBolElectDte.to.TdtEmpresaAutorizadaTo/2240026086
11 the provider's verifier               21 cl.sii.sdi.diii.certBolElectDte.to.DocumentoAutorizadoTo/493967287
12 the representative's verifier         22 the authorisation date
                                         23 java.lang.Long/4227064769
                                         24 the company's business name
```

The body, with `E` the company's digits, `P` the provider's, `U` the representative's and `L` the application's Long:

```
1|2|3|4|1|5|5|6|0|7|8|90|0|0|0|0|9|0|10|0|7|9|11|12|13|14|14|14|15|16|17|18|8|E|8|P|8|U|19|14|14|0|20|2|21|0|0|9|12|22|0|0|0|0|0|0|8|E|8|U|23|L|-11|8|39|0|21|0|0|9|12|22|0|0|0|0|0|0|8|E|8|U|-11|-11|8|41|0|0|24|-11|0|8|E|0|0|
```

One application record (target state `P91`, `BVE`, the state 90, the company) holding one authorised-company record
(the three verifiers, `SII`, the date, the provider, the three RUTs, the link) with a list of two authorised documents,
types 39 and 41; `-11` refers back to the Long each time it appears. What `19` and `S` mean is not known.

### 3.9 Errors

- `SII_PORTAL_REJECTED` with the new rejections `receiptsNotEnrolled`, `receiptsTrackIdRefused`,
  `receiptsComplianceRefused`; the glosses in `PORTAL_REJECTIONS`.
- `SII_PORTAL_UNEXPECTED_PAGE` for a download that is no set.
- `MISSING_FIELD` for `provider` and its `rut`, `name` and `mail`, `businessName`, `trackId`, `representative`,
  `cases`; `INVALID_RUT` from `rut.ts`; `INVALID_OPTION` for a reference of the wrong kind (3.2).
- The phase 2 and phase 3 codes from the upload and the report; session, block and transport codes as in phase 4.

### 3.10 Public API additions

`dte-sdk/portal`: `RECEIPTS_PORTAL`; `parseReceiptsTestSet`; `issueReceiptsSet`, `sendReceiptsSet`,
`resendReceiptsConsumption`; `downloadReceiptsTestSet`, `declareReceiptsTrackId`, `readReceiptsStatus`,
`declareReceiptsCompliance`, `verifyReceiptsAuthorization`; their input, result and event types. `ProgressReport` gains
`receipts`. `dte-sdk`: `ReceiptReferenceInput`, `ReceiptReference`, `SiiReferenciaBoleta`.

### 3.11 The order, as the caller chains it

```ts
import { createSiiClient } from 'dte-sdk'
import {
  createPortalClient, createFolioAllocator, downloadReceiptsTestSet, parseReceiptsTestSet, issueReceiptsSet,
  sendReceiptsSet, declareReceiptsTrackId, readReceiptsStatus, declareReceiptsCompliance, verifyReceiptsAuthorization,
} from 'dte-sdk/portal'

const { text } = await downloadReceiptsTestSet(portal, { providerMail })
const issued = await issueReceiptsSet(parseReceiptsTestSet(text), { issuer, certificate, folios, resolution })
const sent = await sendReceiptsSet(sii, issued)                 // the envelope, 20 s, its state, the report
await declareReceiptsTrackId(portal, { trackId: sent.envelopeTrackId })
// … the SII validates the set and answers by mail; later:
const status = await readReceiptsStatus(portal)                 // readyToDeclare once the set is approved
if (status.readyToDeclare) await declareReceiptsCompliance(portal, { provider, businessName })
await verifyReceiptsAuthorization({ production: productionPortal, certification: portal })
```

### 3.12 Tests

- **Phase 1:** a receipt with `receiptReferences` renders the receipts shape and reads back; the two refusals; the
  receipts envelope validates against the official `EnvioBOLETA_v11.xsd`, added to the fixtures.
- **Set:** a synthetic text with several cases, tabs and runs of spaces, decimal commas, thousands dots, an exempt
  item, observations with and without quotes, noise before the first case, lines of `=`.
- **Issuing:** one receipt per case with consecutive folios, the gross prices, the exemption, the unit of measure, the
  `SET` reference, the envelope's cover; the envelope against the schema.
- **Sending:** the fake SII of phase 2 with injected waits: the 20 s and 30 s, a duplicate envelope, a rejected
  envelope with and without the authorisation words, the report accepted, three duplicates, a rejection then an
  acceptance, ten rejections, an upload error, a status query that fails; the report against the fixture schema.
- **Portal:** the five wires compared character by character; the representative from the session and from the list;
  the four paths of the declaration; the tie-break between 90 and 91; the verification with the form present and
  absent.
- Coverage stays at 100 % on the four metrics.

### 3.13 Build and docs

- `.size-limit.json`: the `dte-sdk/portal` limit from the measurement at the plan's tip (D95).
- No new dependency.
- `README.md`: a "Certification: receipts" section with the order of 3.11; `CHANGELOG.md` entry; `llms.txt` paragraph.

---

## 4. Glossary additions (public contract)

| Term | Meaning |
|---|---|
| Receipts test set (set de boletas) | The plain text of cases the receipts portal delivers; one receipt per case |
| Folio consumption report (RCOF) | `ConsumoFolios`: the daily report of the receipts issued; still asked for in certification |
| Sequence number (`SecEnvio`) | The report's version for its day; a rejected report is sent again with the next one |
| `P90`, `P91` | The states of the receipts application: the set approved and ready to declare; declared |
| Software provider (proveedor de software) | The company whose software issues the receipts; named in the declaration |
| Representative | The person whose certificate holds the session, enrolled for the company on the receipts portal |

---

## 5. Decisions reviewed with Hans

| # | Decision | Outcome |
|---|---|---|
| 1 | The shape of the field: pieces, no runner (D87) | Hans's, 2026-11-04: "as close to the field as it can be" |
| 2 | The software provider mandatory (D88) | Hans's, 2026-11-04 |
| 3 | The official receipts schema fetched from the SII for the tests | Hans's go-ahead, 2026-11-04 |
| 4 | Sections 1 to 3 of the design (scope, protocol and rules, errors and tests) | Approved in chat, 2026-11-04 |
| 5 | The receipt reference in phase 1 (D91) | Found while writing; reported to Hans before the spec; pending his review of this file |

---

## 6. What is measured and what is not

**From the official SII schema** (`EnvioBOLETA_v11.xsd`, in `schema_envio_bol.zip` on the SII's XML formats page): the
shape of a receipt's `Referencia`. Measured on 2026-11-04: the phase 1 receipts envelope validates against that schema
as it is; with a reference in the invoice shape it fails on `FchRef`; with `CodRef` and `RazonRef` alone it validates.

**Field behaviour known to carry a certification of receipts (the rules of section 3):** the set text, the receipt per
case, the waits and the retries of the report, the five wires, the states, the representative rule, the provider rule.

**Not measured, and not measurable until a company is enrolled in the receipts application:** every call of the
receipts portal. The field's own notes say the names of the declaration's fields are inferred from their positions.
No real set text has been seen by this SDK: the tests use a synthetic one in the field's format.

---

## 7. Deferred improvements and field defects not copied

Kept as the field does them (to be reconsidered after a real run):

1. No wait for the SII's validation of the set: the caller reads the status again later.
2. Ten report attempts ending in success without an accepted report.
3. The hashes known to work as the only source.

Field defects not reproduced (D94):

1. RUTs split by hand, the verifier upper-cased in some calls only, a default verifier `8` for the representative; here
   every RUT goes through `rut.ts` and the verifier of a representative read from the list is computed.
2. The server verification disabled on this host; here the phase 4 transport.
3. The HTTP status of the portal's answers never looked at; here a status other than 200 is not an answer.
4. A failed declaration returned with its whole request, RUTs included; here a redacted excerpt of the answer.
5. A pattern for the representative that never matches, whose fallback to the session happens to be right; here the
   session is the rule and the list the fallback, on purpose.
6. The issue date from a UTC clock and the declaration date from the local one; here Chile dates (D92).
7. Two form-based functions nobody calls, and event names that are declared and never emitted; not ported.
8. The company declared as its own provider when none is given (D88).
