# dte-sdk — Phase 3 design (SII books)

Date: 2026-11-01 · Status: **approved** · Author: Claude (with Hans)

Starting point: the architecture and phase 1 spec
(`docs/superpowers/specs/2026-10-31-dte-sdk-architecture-and-phase-1-design.md`) and the phase 2 spec
(`docs/superpowers/specs/2026-11-01-phase-2-sii-web-services-design.md`); decisions D1–D20 and both glossaries are the
contract. SII facts come from the official XSD files and format PDFs (appendix A), checked on 2026-11-01. No
third-party implementation is named in the repository; the SII behaviour is described directly.

---

## 1. Goal and scope

Phase 3 builds and signs the three electronic books the SII still defines: the purchase and sales book (IECV,
`LibroCompraVenta`), the dispatch guide book (`LibroGuia`) and the folio consumption report (RCOF, `ConsumoFolios`, now
called Resumen de Ventas Diarias). The bytes reach the SII through `uploadBook` and `uploadFolioConsumption` from
phase 2.

Why these books matter today, since it shapes the priorities:

| Book | Production status | Still needed for |
|---|---|---|
| IECV | Replaced by the RCV from period 2017-08 (Res. 61 and 68/2017) | The certification test set; requests by SII notification; `DJ 3327/3328` |
| `LibroGuia` | Sent only on SII request (format PDF, section 1a) | The certification test set; requests by SII notification |
| `ConsumoFolios` | Probably no longer required since 2022; the resolution was not identified | The receipts certification |
| `LibroBOLETA` | Removed by Res. 74/2020 | Nothing; out of scope |

The main consumer is therefore the certification runner of phase 5, plus anyone answering an SII notification.

**In scope**

1. All submission and book kinds the XSD defines for the three books: `TOTAL`, `PARCIAL`, `FINAL`, `AJUSTE`;
   `MENSUAL`, `ESPECIAL`, `RECTIFICA`.
2. Two layers per book: an English domain model and an SII-shaped model in XSD order, with a one-way codec (`toSii*`).
3. Summaries computed by the SDK from the detail lines, plus previous totals and summary-only totals given as data.
4. Pure helpers that derive a book line from a phase 1 `Document`.
5. Signature and verification.
6. One phase 2 change: `uploadBook` and `uploadFolioConsumption` accept `fileName`, and the guide book uploads as
   `LibroGuia.xml`.

**Out of scope**

- `LibroCVS_v10` (simplified book), `LibroBOLETA_v10` and the accounting book extensions (`LceCal`, `LceCoCertif`).
- `fromSii*`: nothing reads books back. Adding it later breaks nothing.
- Certification logic, which belongs to phase 5: persisting the totals of a previous `TOTAL` between runs, stepping the
  period back on `LNC`, the `SecEnvio` cadence, the test-set defaults (`FolioNotificacion` 3, factor 0.6) and parsing
  `RespSIILibros`.
- Sending anything to the SII from the test suite.

**Done when:** every XML the tests sign validates against the official XSD files in `npm test`; the golden unsigned XML
files match byte for byte; the opt-in differential passes with only the differences listed in section 3.11;
coverage stays at 100 %; bundle sizes are measured and posted to
[arrowsw/dte-sdk#5](https://github.com/arrowsw/dte-sdk/issues/5); `npm run scan` passes. The live SII is not part of
this definition (section 6).

---

## 2. Architecture decisions

D1–D20 stay in force. Phase 3 adds D21–D27.

### D21. Field-proven output is the floor (Hans, 2026-11-01)

- ✅ What a book generator proven in certification against the SII emits is the baseline. An improvement may add or
  report, but it may not block by default what that output lets through. Whatever is known to pass stays byte-compatible
  or differs only in whitespace.
- Strict behaviour is opt-in or reported as data. `totalMismatches` and `strictTotals` (section 3.4) are the model.
- Exceptions, all of them cases the SII rejects anyway: values outside an XSD enumeration, overlapping folio ranges and
  an `ESPECIAL` book without its notification folio.

### D22. The SDK computes the summaries (Hans, 2026-11-01)

- ✅ `create*` always computes `ResumenSegmento` and `ResumenPeriodo` from the lines. The caller supplies only what
  cannot be derived: `previousTotals` (the period totals of earlier submissions) and `summaryOnlyTotals` (types that the
  format excludes from the detail).
- Discarded: caller-provided summaries, which leave any mismatch to surface as an SII repair or rejection.

### D23. Books sign the `EnvioLibro` by `ID`, not the root

- ✅ `signEnveloped` with `elementTag: 'EnvioLibro'` (or `'DocumentoConsumoFolios'`) and the root as `rootTag`. The
  reference is `URI="#ID"`. `signRootElement` (`URI=""`) is for the seed only and does not apply.
- The stored `SignedInfo` carries `xmlns:xsi`, as on envelopes, which is the default of `signEnveloped`.
- The `Signature` element uses the XMLDSig namespace on all three books, including `LibroGuia`, whose published 2004 XSD
  declares `Signature` in the SII namespace (section 6).

### D24. A line break between every pair of adjacent tags

- ✅ `xml.replace(/></g, '>\n<')` over the whole unsigned XML, for all three books, except that the closing tag of the
  signed element and the closing root stay adjacent because `signEnveloped` requires it. The breaks sit inside the signed
  element, so the digest covers them. Text cannot contain `><` because the builder escapes `<` and `>`.
- Why: the SII rejects lines over about 4 090 characters (`CHR-00002`). A guide book on one line reaches that limit at
  about 16 lines, and a report with many folio ranges at about 60. One rule keeps all three books safe and keeps the
  IECV byte-identical to the field-proven layout.

### D25. Official XSD validation in the test suite (Hans, 2026-11-01)

- ✅ The eight official XSD files live in `tests/fixtures/xsd/` (169 kB, not published). `tests/support/xsd.ts` validates
  with `xmllint-wasm` (MIT, pure WASM, no native build), a devDependency. No new runtime dependencies.
- Why: schema errors are the most common book failure. Twelve `STATUS` 7 replies captured from real runs were all books
  with `cvc-*` details. The trial on 2026-11-01 validated all three schemas in about 30 ms each and caught
  `<TotOpExe>0</TotOpExe>`, a value that looks harmless and that the SII would reject.
- Full XSD validation stays out of the runtime (phase 1 scope note).

### D26. A single line type for the IECV

- ✅ `BookEntryInput` carries every field of the XSD `Detalle`, and the JSDoc of each field says which book it applies
  to.
- Why: the XSD has a single `Detalle`, and the format itself mixes fields between the books: the purchase total formula
  uses `DepEnvase`, for instance. Separate sale and purchase types could block valid combinations (D21).

### D27. One-way codec and JSON-friendly totals

- ✅ `toSii*` only. `BookTotals` and `GuideTotals` are plain JSON values, so phase 5 can persist `book.periodTotals` and
  pass it back as `previousTotals` without a parser.

---

## 3. Phase 3 — detailed design

### 3.1 `src/` layout

New files:

```
src/
  books/
    common.ts             period and cover validation, zone rules per submission, line breaks, book ids
    entry.ts              normalizeBookEntry, expectedBookEntryTotal, BookTotalMismatch
    totals.ts             sumBookEntries, accumulateBookTotals
    purchase-sales.ts     createPurchaseSalesBook, buildPurchaseSalesBookXml, signPurchaseSalesBook,
                          verifyPurchaseSalesBookSignature
    guide.ts              createGuideBook, buildGuideBookXml, signGuideBook, verifyGuideBookSignature,
                          accumulateGuideTotals
    folio-consumption.ts  createFolioConsumption, buildFolioConsumptionXml, signFolioConsumption,
                          verifyFolioConsumptionSignature, compactFolioRanges
    from-document.ts      bookEntryFromDocument, guideEntryFromDocument, folioConsumptionEntryFromDocument
  model/
    book.ts               domain types of the three books
    sii-book.ts           SiiLibroCompraVenta, SiiLibroGuia, SiiConsumoFolios and their parts, in XSD order
    book-codec.ts         toSiiPurchaseSalesBook, toSiiGuideBook, toSiiFolioConsumption
  catalogs/
    book-codes.ts         operations, kinds, submissions, document types, non-recoverable VAT codes, guide codes
tests/
  books/                  one test file per module above
  support/xsd.ts          validateAgainstXsd(xml, schema)
  fixtures/xsd/           official XSD files
  fixtures/books/         golden unsigned XML
```

Phase 1 and 2 files that change:

| File | Change |
|---|---|
| `src/errors.ts` | new code `BOOK_TOTAL_MISMATCH`; `SAFE_DETAIL_KEYS` gains `expected`, `actual` |
| `src/sii/upload.ts` | `UploadXmlInput.fileName?`; default name by root element |
| `src/index.ts` | re-exports section 3.13 |
| `.size-limit.json` | limits raised to the measured size rounded up to the next 2 kB |
| `tests/public-api.test.ts`, `tests/dist.smoke.test.ts` | new exports |
| `tests/differential.test.ts` | the three books |
| `package.json` | devDependency `xmllint-wasm` |
| `README.md`, `llms.txt`, `CHANGELOG.md` | the new API and the validity notes of section 1 |

### 3.2 Cover

```ts
type BookCoverInput = {
  /** EN: Company the book belongs to. ES: `RutEmisorLibro` — RUT del contribuyente dueño del libro. */
  readonly issuerRut: string
  /** EN: Authorized sender, normally the certificate holder. ES: `RutEnvia` — RUT de quien envía. */
  readonly senderRut: string
  /** EN: Tax period, `YYYY-MM`. ES: `PeriodoTributario` — Período tributario, `AAAA-MM`. */
  readonly period: string
  /** EN: Resolution date. ES: `FchResol` — Fecha de resolución. */
  readonly resolutionDate: string
  /** EN: Resolution number, 0 in certification. ES: `NroResol` — Número de resolución, 0 en certificación. */
  readonly resolutionNumber: number
  /** EN: Submission kind; `total` by default. ES: `TipoEnvio` — Tipo de envío; `total` por defecto. */
  readonly submission?: BookSubmission
  /** EN: Segment number; required on `partial`. ES: `NroSegmento` — Número de segmento; obligatorio en `partial`. */
  readonly segmentNumber?: number
  /** EN: Notification folio; required on `special`. ES: `FolioNotificacion` — Folio de la notificación; obligatorio en `special`. */
  readonly notificationFolio?: number
}

type PurchaseSalesCoverInput = BookCoverInput & {
  /** EN: Book side. ES: `TipoOperacion` — `sale` (VENTA) o `purchase` (COMPRA). */
  readonly operation: BookOperation
  /** EN: Book kind; `monthly` by default. ES: `TipoLibro` — Tipo de libro; `monthly` por defecto. */
  readonly kind?: BookKind
  /** EN: Replacement authorization; required on `rectification`. ES: `CodAutRec` — Código de autorización de reemplazo; obligatorio en `rectification`. */
  readonly rectificationCode?: string
}

type GuideBookCoverInput = BookCoverInput & { readonly notificationFolio: number }
```

Rules:

- `period` must match `YYYY-MM` with a real month (`INVALID_DATE { field: 'cover.period' }`). RUTs go through `toSiiRut`,
  `resolutionDate` through `toIsoDate`. `resolutionNumber` is a non-negative integer of at most 6 digits
  (`INVALID_OPTION { field: 'cover.resolutionNumber' }`).
- `segmentNumber` is required on `partial` and emitted only there. `notificationFolio` is required on `special` and on
  every guide book, because the XSD makes it mandatory there. `rectificationCode` (at most 10 characters) is required on
  `rectification`. Absent ones throw `MISSING_FIELD { field }`.
- `LibroGuia` has no `operation` and no `kind`: its XSD only admits `TipoLibro` `ESPECIAL`, although the 2003 PDF also
  mentions `MENSUAL`. The XSD wins.
- `Caratula` carries `version="1.0"` on `ConsumoFolios` only, per the XSD.

### 3.3 Zones per submission

From the format PDFs, sections 1.2, 1.3 and 1.6. The IECV and the guide book share this table.

| `submission` | `ResumenSegmento` | `ResumenPeriodo` | `Detalle` |
|---|---|---|---|
| `total` | no | when there is anything to total (otherwise the cover alone, valid for a period without movement) | when there are lines |
| `partial` | yes | no | required (`MISSING_FIELD { field: 'entries' }`) |
| `final` | no | `previousTotals` plus `summaryOnlyTotals`; `MISSING_FIELD { field: 'previousTotals' }` when empty | forbidden (`INVALID_OPTION { field: 'entries' }`) |
| `adjustment` | signed, when there are lines | previous + segment + summary-only | when there are lines |

`previousTotals` is accepted only on `final` and `adjustment`, and `summaryOnlyTotals` is rejected on `partial`
(`INVALID_OPTION { field }`). An `adjustment` without `previousTotals` is valid: the period zone then equals the segment
plus the summary-only totals.

### 3.4 IECV lines

```ts
createPurchaseSalesBook(input: PurchaseSalesBookInput): PurchaseSalesBook

type PurchaseSalesBookInput = {
  readonly cover: PurchaseSalesCoverInput
  /** EN: One line per document. ES: `Detalle` — Una línea por documento. */
  readonly entries?: readonly BookEntryInput[]
  /** EN: Totals of types the format excludes from the detail (receipts, among others). ES: Totales de tipos que el formato excluye del detalle (boletas, entre otros). */
  readonly summaryOnlyTotals?: readonly BookTotalsInput[]
  /** EN: Period totals of earlier submissions. ES: Totales del período de envíos anteriores. */
  readonly previousTotals?: readonly BookTotals[]
  /** EN: Proportionality factor, one per book. ES: `FctProp` — Factor de proporcionalidad, uno por libro. */
  readonly commonUseVatFactor?: number
  /** EN: Additional tax factor per tax code. ES: `FctImpAdic` — Factor de impuesto adicional por código. */
  readonly additionalTaxFactors?: Readonly<Record<number, number>>
  /** EN: Throw on a total that does not match the formula. ES: Lanzar si un total no calza con la fórmula. */
  readonly strictTotals?: boolean
  /** EN: Explicit `EnvioLibro/@ID`. ES: `ID` explícito del `EnvioLibro`. */
  readonly id?: string
  /** EN: Clock for the id and `TmstFirma`. ES: Reloj para el id y `TmstFirma`. */
  readonly now?: Date
}

type PurchaseSalesBook = {
  readonly id: string
  readonly cover: PurchaseSalesCover
  readonly entries: readonly BookEntry[]
  readonly segmentTotals: readonly BookTotals[] | null
  readonly periodTotals: readonly BookTotals[] | null
  readonly commonUseVatFactor?: number
  readonly additionalTaxFactors?: Readonly<Record<number, number>>
  /** EN: Explicit totals that differ from the formula. ES: Totales explícitos que difieren de la fórmula. */
  readonly totalMismatches: readonly BookTotalMismatch[]
  /** EN: Signing timestamp, Chile time. ES: `TmstFirma` — Marca de tiempo de la firma, hora de Chile. */
  readonly signedAt: string
}
```

`BookEntryInput` fields are listed in the glossary (section 4). Normalization, in order:

1. **Validation.** `type` in `BOOK_DOCUMENT_TYPES` (`INVALID_DOCUMENT_TYPE`). `folio` a positive integer of at most 10
   digits (`INVALID_FOLIO`). RUTs through `toSiiRut`. `date` through `toIsoDate`, within 2000-01-01 to 2050-12-31
   (`INVALID_DATE`). `counterpartyName` through `sanitizeText`, at most 50 characters (`FIELD_TOO_LONG`). Amounts are
   integers of at most 18 digits (`INVALID_AMOUNT`). Fields typed `MontoType` in the `Detalle` XSD reject negatives
   (`INVALID_AMOUNT`). `nonRecoverableVat` holds at most 5 items and `otherTaxes` at most 20 (`INVALID_OPTION`).
2. **Voided lines.** `voided: true` keeps only `type`, `folio`, `voided` and `adjustment`. It counts in `TotDoc` and
   `TotAnulado` and adds no amounts.
3. **Defaults on sale books.** `exemptAmount`, `netAmount` and `vatAmount` become 0 when absent, so all three are always
   emitted, as the format requires for `MntIVA`.
4. **Defaults on purchase books.** Field-observed SII rules:
   - With `commonUseVat` or `nonRecoverableVat`: `vatAmount` and `taxRate` default to 0, and `netAmount` defaults to 0
     (a missing `MntNeto` here produced `LBR-3` and a rejection). A caller with a mixed document passes explicit values.
   - With `taxRate` and no `netAmount`: `netAmount` and `vatAmount` become 0. Omitting them produced `LRH` with `LBR-3`;
     zeros produced `LOK` with `LBR-2`.
   - Everything else is emitted as given.
5. **Tax rate.** When `netAmount` and `vatAmount` are positive and `taxRate` is absent, `VAT_RATE` is used.
6. **Total.** When `totalAmount` is absent, it is the formula. When present, it is kept, and a difference goes to
   `totalMismatches` as `{ index, folio, type, expected, actual }`. `strictTotals: true` throws
   `BOOK_TOTAL_MISMATCH { index, expected, actual }` at the first one.

```ts
// Sale
net + exempt + vat + Σ otherTaxes (code 60 subtracts) + containerDeposit
  − constructionCredit − partialVatWithheld − totalVatWithheld
  − settlement.exemptValue − settlement.netValue − settlement.vatValue

// Purchase
net + exempt + vat + commonUseVat + Σ nonRecoverableVat
  + Σ otherTaxes (retention codes excluded, code 60 subtracts)
  + containerDeposit + nonCreditableTax − partialVatWithheld − totalVatWithheld
```

Retention codes, whose amount travels in `IVARetTotal` and `IVARetParcial`: 15, 30, 31, 32, 33, 34, 36, 37, 38, 39, 41,
47, 48, 49, 301, 321, 331, 341, 361, 371, 481. Code 35 is the gasoline tax, not a retention, despite the "30 to 41" range
in the PDF. `totalMismatches` is why a false positive here is harmless (D21).

`adjustment` defaults to `add` on an `adjustment` submission (the format assumes 1) and is otherwise emitted only when
given, which keeps a field-observed `Operacion` on a guide `TOTAL` possible.

### 3.5 IECV summaries

```ts
accumulateBookTotals(base: readonly BookTotals[], delta: readonly BookTotals[]): readonly BookTotals[]
```

- One `BookTotals` per `type`, in order of first appearance. `remove` lines count with a negative sign, so `TotDoc` and
  any amount in `TotalesSegmento` may be negative, as the format allows.
- `accumulateBookTotals` adds by `type`, and inside it adds `nonRecoverableVat` by `code` and `otherTaxes` by `code`.
  A row in `base` absent from `delta` is kept and vice versa.
- `BookTotalsInput` is `Partial<Omit<BookTotals, 'type'>> & { type }`; missing amounts are 0.
- The sign of credit notes is the caller's choice: positive by default, as the format and the field practice have it.

Serialization rules (`book-codec.ts`):

| Field | Rule |
|---|---|
| `TpoDoc`, `TotDoc`, `TotMntExe`, `TotMntNeto`, `TotMntIVA`, `TotMntTotal` | always, also as 0 |
| `TotAnulado`, `TotOpIVAUsoComun`, `TotOpIVANoRec` | only when non-zero: `positiveInteger` in `TotalesPeriodo`, so a 0 fails the XSD |
| `TotOpExe`, `TotOpIVARec`, `TotOpActivoFijo`, `TotOpIVARetTotal`, `TotOpIVARetParcial`, `TotOpIVANoRetenido` | never computed: optional since 2004, and field-proven books omit them |
| every other amount | only when non-zero |
| `FctProp`, `TotCredIVAUsoComun`, `TotImpVehiculo`, `FctImpAdic`, `TotCredImp` | `TotalesPeriodo` only; `TotalesSegmento` has no such elements |

- `FctProp` is a book-level value, per the 2016 note of the format. A period row with `commonUseVat` greater than 0 and
  no `commonUseVatFactor` throws `MISSING_FIELD { field: 'commonUseVatFactor' }`. It must be between 0.001 and 99.999
  with at most 3 decimals (`INVALID_OPTION`).
- `TotCredIVAUsoComun` is `round(TotIVAUsoComun × FctProp)`, on the total, as the format says. Field practice rounds per
  document, which can differ by 1 when several lines round differently; the format wins.
- `FctImpAdic` is between 0.001 and 1 with at most 4 decimals. When a code has a factor, `TotCredImp` is
  `round(TotMntImp × FctImpAdic)`; otherwise both are omitted.
- XSD order lives in `sii-book.ts` and in the key order of the codec, as in phase 1.

### 3.6 `bookEntryFromDocument`

```ts
bookEntryFromDocument(document: Document, options: {
  readonly bookRut: string
  readonly operation: BookOperation
  readonly creditNoteSign?: 'positive' | 'negative'
}): BookEntryInput
```

- **Counterparty.** The receiver when `document.header.issuer.rut === bookRut`, the issuer otherwise. This one rule
  covers sales, purchases received, a purchase invoice (46) issued by the book owner, and a 46 received. `RznSoc` is
  truncated to 50 characters here, because the DTE admits 100 and the field is optional on electronic documents. A raw
  line over 50 throws instead (section 3.4).
- **Amounts.** `exemptAmount`, `netAmount`, `vatAmount`, `taxRate` (`vatRate`), `totalAmount`, `ownVatAmount`,
  `thirdPartyVatAmount`, `nonBillableAmount`, `periodAmount`, and `settlement` from `commissions` with the issuer RUT.
  On purchases, zero amounts stay absent; on sales the defaults of section 3.4 fill them.
- **Withholdings.** Code 15 goes to `totalVatWithheld`. Every other withholding goes to `otherTaxes`.
- `creditNoteSign: 'negative'` negates `exemptAmount`, `netAmount`, `vatAmount` and `totalAmount` of a type 61 line, for
  callers whose reporting needs it. Those four accept negatives in the XSD.
- **Not inferred:** `Emisor`, `IndFactCompra`, `TpoDocRef`, `FolioDocRef`. The caller spreads them into the result when
  the case needs them. Field-proven purchase books omit them.

### 3.7 Guide book

```ts
createGuideBook(input: GuideBookInput): GuideBook
accumulateGuideTotals(base: GuideTotals, delta: GuideTotals): GuideTotals
guideEntryFromDocument(document: Document): GuideEntryInput

type GuideBookInput = {
  readonly cover: GuideBookCoverInput
  readonly entries?: readonly GuideEntryInput[]
  readonly previousTotals?: GuideTotals
  readonly id?: string
  readonly now?: Date
}

type GuideBook = {
  readonly id: string
  readonly cover: GuideBookCover
  readonly entries: readonly GuideEntry[]
  readonly segmentTotals: GuideTotals | null
  readonly periodTotals: GuideTotals | null
  readonly signedAt: string
}

type GuideTotals = {
  readonly voidedFolios: number          // TotFolAnulado
  readonly voidedGuides: number          // TotGuiaAnulada
  readonly saleGuides: number            // TotGuiaVenta
  readonly saleGuidesAmount: number      // TotMntGuiaVta
  readonly modifiedAmount: number        // TotMntModificado
  readonly transfers: readonly { readonly type: number; readonly count: number; readonly amount: number }[] // TotTraslado
}
```

Line rules:

| Rule | Behaviour |
|---|---|
| `voided` | `'folio'` (1), `'guide'` (2), `'partialReceipt'` (3) |
| `TasaImp`, `IVA` | always emitted, 0 when absent: this is the output known to pass, and the XSD accepts it |
| `IVA` absent with `taxRate` and `netAmount` | `round(net × rate / 100)` |
| `MntTotal` absent | `net + IVA`; `folio` and `guide` voids emit 0 |
| `transferType` | 1 to 7, else `INVALID_OPTION { field: 'transferType' }` (values 8 and 9 of `IndTraslado` are not in this XSD and would be a `cvc-*` rejection) |
| `receiverName` | sanitized, at most 50 characters (`FIELD_TOO_LONG`) |
| `adjustment` | emitted as `Operacion` when given, default `add` on `adjustment` submissions; `remove` subtracts in the totals |

Summary rules:

- `TotFolAnulado` counts `voided: 'folio'`, `TotGuiaAnulada` counts `voided: 'guide'`. Both are emitted only when
  non-zero.
- `TotGuiaVenta` and `TotMntGuiaVta` count lines with `transferType` 1 that are not voided, and `partialReceipt` is not
  a void for this purpose. Both are always emitted because the XSD requires them.
- `TotMntModificado` sums `modifiedAmount` and is emitted when non-zero.
- `TotTraslado` holds one row per type 2 to 7, in order of first appearance, with `MntGuia` emitted also as 0.
- `TotalesSegmento` values may be negative; `ResumenPeriodo` ones may not per the XSD, and the SDK does not re-check it.

`guideEntryFromDocument` maps `IndTraslado` to `transferType`, `date` from `issueDate`, and copies the receiver and the
amounts only when the transfer is a sale.

### 3.8 Folio consumption report

```ts
createFolioConsumption(input: FolioConsumptionInput): FolioConsumption
folioConsumptionEntryFromDocument(document: Document): FolioConsumptionEntry
compactFolioRanges(folios: readonly number[]): readonly FolioRange[]

type FolioConsumptionInput = {
  readonly cover: FolioConsumptionCoverInput
  /** EN: One line per receipt issued. ES: Una línea por boleta emitida. */
  readonly entries?: readonly FolioConsumptionEntry[]
  /** EN: Folios voided in the system before reaching the SII. ES: Folios anulados en el sistema antes de llegar al SII. */
  readonly voidedFolios?: readonly { readonly type: 39 | 41; readonly folio: number }[]
  readonly id?: string
  readonly now?: Date
}

type FolioConsumptionCoverInput = {
  readonly issuerRut: string            // RutEmisor
  readonly senderRut: string            // RutEnvia
  readonly resolutionDate: string       // FchResol
  readonly resolutionNumber: number     // NroResol
  readonly from?: string                // FchInicio
  readonly to?: string                  // FchFinal
  readonly sequence?: number            // SecEnvio, 1 by default
  readonly correlative?: number         // Correlativo
}

type FolioConsumption = {
  readonly id: string
  readonly cover: FolioConsumptionCover // `signedAt` is `TmstFirmaEnv`
  readonly summaries: readonly FolioConsumptionSummary[]
}
```

Rules:

- Types 39 and 41 only (`INVALID_DOCUMENT_TYPE`), per the 2020 format. The XSD still admits 61.
- `from` and `to` default to the minimum and maximum `issueDate` of the lines. With no lines they are required
  (`MISSING_FIELD { field: 'cover.from' }`). The format asks for `from` equal to `to` on daily reports; the SDK does not
  enforce it (D21).
- `sequence` and `correlative` are non-negative integers of at most 3 digits (`INVALID_OPTION`).
- One `Resumen` per type present, 39 first. `TipoDocumento`, `MntTotal`, `FoliosEmitidos`, `FoliosAnulados` and
  `FoliosUtilizados` are always emitted. `MntNeto`, `MntIva`, `MntExento` and `TasaIVA` are omitted when zero, which is
  the field-proven output.
- Type 39 has `TasaIVA = VAT_RATE`. Type 41 emits no net, VAT or rate.
- `FoliosEmitidos` counts lines, `FoliosAnulados` counts voided folios, `FoliosUtilizados` is the sum.
- `RangoUtilizados` lists issued folios only and `RangoAnulados` lists voided ones. The text of the format says "issued
  plus voided" but its worked example lists issued folios only; the SDK follows the example (section 6).
- A folio that appears twice, in the lines or across lines and voids, throws `INVALID_FOLIO { folio, type }`: it would
  produce ranges the format calls wrong.
- `compactFolioRanges` sorts ascending and groups consecutive folios. A single folio yields `{ from: n, to: n }`.
- A day with no sales, no lines and no voids, emits one `Resumen` of type 39 in zeros, as the 2020 format requires. The
  XSD needs at least one.

### 3.9 XML, signature and upload

- Roots, each with `xmlns`, `xmlns:xsi`, `xsi:schemaLocation` and `version="1.0"`:

  | Book | Root | Signed element | Schema location |
  |---|---|---|---|
  | IECV | `LibroCompraVenta` | `EnvioLibro` | `LibroCV_v10.xsd` |
  | Guide | `LibroGuia` | `EnvioLibro` | `LibroGuia_v10.xsd` |
  | RCOF | `ConsumoFolios` | `DocumentoConsumoFolios` | `ConsumoFolio_v10.xsd` |

- Prolog `<?xml version="1.0" encoding="ISO-8859-1"?>` followed by `\n`, so the phase 2 upload accepts it.
- `TmstFirma` is the last child of `EnvioLibro`. On the RCOF the timestamp is `TmstFirmaEnv`, inside `Caratula`.
- Line breaks per D24.
- Default ids from `generateSetId`: `LCV_…` for the IECV, `LGD_…` for guides, `RCOF_…` for the report. `id` overrides.
- `sign*(book, certificate)` returns the book plus `{ xml, signature }`, as `signEnvelope` does. `verify*Signature(xml)`
  calls `verifyEnveloped` with the book's tags.
- Upload: `uploadBook(sii, { xml: signed.xml })` and `uploadFolioConsumption(sii, { xml: signed.xml })`. `fileName?`
  overrides the default, which is `LibroGuia.xml` when the root is `LibroGuia`, `LibroCV.xml` for any other book and
  `ConsumoFolios.xml` for the report. It must match `^[\w.-]+\.xml$` (`INVALID_OPTION { field: 'fileName' }`). It travels
  in the multipart `filename`, so it cannot be free text.
- Status: `queryUploadStatus` already knows `LOK`, `LSO`, `LNC` and `LRH`.

### 3.10 Errors

New code: `BOOK_TOTAL_MISMATCH` (`{ index, expected, actual }`). Message text: `Book line total does not match the SII
formula`. Every other failure reuses existing codes:

| Code | When |
|---|---|
| `INVALID_DATE` | `period`, `FchDoc` out of range, cover dates |
| `INVALID_AMOUNT` | not an integer, over 18 digits, or negative in a `MontoType` field |
| `INVALID_DOCUMENT_TYPE` | type outside `BOOK_DOCUMENT_TYPES`, or a report line that is not 39 or 41 |
| `INVALID_FOLIO` | not a positive integer of at most 10 digits; duplicate in a report |
| `INVALID_RUT`, `FIELD_TOO_LONG` | as in phase 1 |
| `MISSING_FIELD` | `notificationFolio`, `segmentNumber`, `rectificationCode`, `commonUseVatFactor`, `cover.from`, `entries` on `partial`, `previousTotals` on `final` |
| `INVALID_OPTION` | lines on `final`, `previousTotals` or `summaryOnlyTotals` where the zone forbids them, `transferType` out of 1–7, over 5 `nonRecoverableVat`, over 20 `otherTaxes`, factor out of range, invalid `fileName`, invalid numeric cover field |

### 3.11 Tests

Three layers, per D25 and the decision of section 5:

1. **Official XSD in `npm test`.** `validateAgainstXsd(xml, 'LibroCV' | 'LibroGuia' | 'ConsumoFolio')` in
   `tests/support/xsd.ts`. Every test that signs a book passes its XML through it. For `LibroGuia`, the helper rewrites
   the XMLDSig namespace off `Signature` and `SignedInfo` before validating, because the 2004 XSD declares that element
   in the SII namespace; the XML that would be sent is not altered.
2. **Golden unsigned XML, byte for byte.** `tests/fixtures/books/*.xml`, one per book and submission: IECV sale `total`,
   purchase `total` with common-use and non-recoverable VAT, `partial`, `final`, `adjustment` with add and remove,
   `rectification`, `special`; guide `total` with voids and transfers, `adjustment`; report with both types and voids, a
   day with no sales. All with `FIXED_NOW` and invented data (`Comercial Andina SpA`, `Comercializadora Rapel Ltda`,
   RUTs from the scan allow-list).
3. **Opt-in differential.** `tests/differential.test.ts` adds the three books with an external harness located through
   `DTE_REFERENCE_HARNESS`, as in phase 1 (JSON contract in the plan). For the IECV, `<EnvioLibro>` is compared byte for
   byte and `DigestValue` and `SignatureValue` are compared after whitespace removal, because the harness wraps base64
   differently. For guides and the report, the comparison strips whitespace between tags, because the harness emits them
   on one line.

   `TmstFirma` and the ids are pinned on both sides. **Expected differences**, each a deliberate decision of this spec:
   - `TotMntModificado` on a guide book, and `TotalesSegmento` of an `adjustment` with `remove` lines.
   - Rounding of `TotCredIVAUsoComun` on cases built to expose it.
   - `RUTDoc` of a type 46 on a purchase book: the supplier here, per the format.

Also: `verify*Signature` valid and tampered; property tests with `fast-check` (sum of lines equals the summary, add then
remove returns to zero, `compactFolioRanges` recomposes its input, `accumulateBookTotals` is associative); type tests
with `expect-type`; one entry in `tests/public-api.test.ts` per export; `dist` smoke; `tests/sii/upload.test.ts` gains
`fileName`. No network.

### 3.12 Typical flows

```ts
// Sales book for a month
const book = createPurchaseSalesBook({
  cover: { issuerRut, senderRut, period: '2026-10', resolutionDate, resolutionNumber: 0, operation: 'sale' },
  entries: signedInvoices.map((doc) => bookEntryFromDocument(doc, { bookRut: issuerRut, operation: 'sale' })),
  summaryOnlyTotals: [{ type: 39, documentCount: 120, netAmount: 840000, vatAmount: 159600, totalAmount: 999600 }],
})
if (book.totalMismatches.length > 0) console.warn(book.totalMismatches)
const signed = signPurchaseSalesBook(book, certificate)
const receipt = await uploadBook(sii, { xml: signed.xml })

// Adjustment on a closed period
const adjustment = createPurchaseSalesBook({
  cover: { ...cover, submission: 'adjustment' },
  entries: [{ ...wrongLine, adjustment: 'remove' }, { ...rightLine, adjustment: 'add' }],
  previousTotals: book.periodTotals ?? [],
})

// Guide book on notification
const guides = signGuideBook(
  createGuideBook({
    cover: { issuerRut, senderRut, period: '2026-10', resolutionDate, resolutionNumber: 0, notificationFolio: 3 },
    entries: signedGuides.map(guideEntryFromDocument),
  }),
  certificate,
)

// Folio consumption report for a day
const report = signFolioConsumption(
  createFolioConsumption({
    cover: { issuerRut, senderRut, resolutionDate, resolutionNumber: 0 },
    entries: signedReceipts.map(folioConsumptionEntryFromDocument),
  }),
  certificate,
)
await uploadFolioConsumption(sii, { xml: report.xml })
```

### 3.13 Public API additions and scaffolding

Runtime exports added to the root and to `RUNTIME_EXPORTS`:

- **IECV:** `createPurchaseSalesBook`, `buildPurchaseSalesBookXml`, `signPurchaseSalesBook`,
  `verifyPurchaseSalesBookSignature`, `toSiiPurchaseSalesBook`, `bookEntryFromDocument`, `accumulateBookTotals`.
- **Guides:** `createGuideBook`, `buildGuideBookXml`, `signGuideBook`, `verifyGuideBookSignature`, `toSiiGuideBook`,
  `guideEntryFromDocument`, `accumulateGuideTotals`.
- **Report:** `createFolioConsumption`, `buildFolioConsumptionXml`, `signFolioConsumption`,
  `verifyFolioConsumptionSignature`, `toSiiFolioConsumption`, `folioConsumptionEntryFromDocument`, `compactFolioRanges`.
- **Catalogs:** `BOOK_OPERATIONS`, `BOOK_KINDS`, `BOOK_SUBMISSIONS`, `BOOK_DOCUMENT_TYPES`, `isBookDocumentType`,
  `SUMMARY_ONLY_DOCUMENT_TYPES`, `NON_RECOVERABLE_VAT_CODES`, `GUIDE_TRANSFER_TYPES`, `GUIDE_VOID_CODES`.

Types: `BookOperation`, `BookKind`, `BookSubmission`, `BookAdjustment`, `BookDocumentType`, `NonRecoverableVatCode`,
`GuideTransferType`, `GuideVoidCode`, `BookCoverInput`, `BookCover`, `PurchaseSalesCoverInput`, `PurchaseSalesCover`,
`GuideBookCoverInput`, `GuideBookCover`, `FolioConsumptionCoverInput`, `FolioConsumptionCover`, `BookEntryInput`,
`BookEntry`, `BookTotals`, `BookTotalsInput`, `BookTotalMismatch`, `PurchaseSalesBookInput`, `PurchaseSalesBook`,
`SignedPurchaseSalesBook`, `BookEntryFromDocumentOptions`, `GuideEntryInput`, `GuideEntry`, `GuideTotals`,
`GuideBookInput`, `GuideBook`, `SignedGuideBook`, `FolioConsumptionEntry`, `FolioRange`, `FolioConsumptionSummary`,
`FolioConsumptionInput`, `FolioConsumption`, `SignedFolioConsumption`, and the SII-shaped `SiiLibroCompraVenta`,
`SiiEnvioLibro`, `SiiCaratulaLibro`, `SiiTotalesSegmento`, `SiiTotalesPeriodo`, `SiiDetalleLibro`, `SiiLibroGuia`,
`SiiEnvioLibroGuia`, `SiiCaratulaLibroGuia`, `SiiResumenLibroGuia`, `SiiDetalleLibroGuia`, `SiiConsumoFolios`,
`SiiDocumentoConsumoFolios`, `SiiCaratulaConsumoFolios`, `SiiResumenConsumoFolios`.

Scaffolding: `xmllint-wasm` as a pinned devDependency; `.size-limit.json` raised to the measured post-phase-3 size
rounded up to the next 2 kB, with the numbers posted to issue #5; CI unchanged, since the WASM runs on every Node of the
matrix; the Deno and Bun smokes unchanged.

---

## 4. Glossary additions (public contract)

Same format as section 5 of the phase 1 spec: SII tag → `name` in the model.

**`Caratula` of a book → `BookCover`**
RutEmisorLibro `issuerRut` · RutEnvia `senderRut` · PeriodoTributario `period` · FchResol `resolutionDate` · NroResol
`resolutionNumber` · TipoOperacion `operation` (VENTA `'sale'`, COMPRA `'purchase'`) · TipoLibro `kind` (MENSUAL
`'monthly'`, ESPECIAL `'special'`, RECTIFICA `'rectification'`) · TipoEnvio `submission` (TOTAL `'total'`, PARCIAL
`'partial'`, FINAL `'final'`, AJUSTE `'adjustment'`) · NroSegmento `segmentNumber` · FolioNotificacion
`notificationFolio` · CodAutRec `rectificationCode` · TmstFirma `signedAt`.

**`Detalle` of the IECV → `BookEntry`**
TpoDoc `type` · Emisor `issuedByBookOwner` · IndFactCompra `purchaseInvoice` · NroDoc `folio` · Anulado `voided` ·
Operacion `adjustment` (1 `'add'`, 2 `'remove'`) · TpoImp `taxKind` (1 `'vat'`, 2 `'freeZone'`) · TasaImp `taxRate` ·
NumInt `internalNumber` · IndServicio `serviceIndicator` · IndSinCosto `freeOfCharge` · FchDoc `date` · CdgSIISucur
`branchCode` · RUTDoc `counterpartyRut` · RznSoc `counterpartyName` · Extranjero `foreignReceiver { NumId id,
Nacionalidad nationality }` · TpoDocRef `referenceType` · FolioDocRef `referenceFolio` · MntExe `exemptAmount` · MntNeto
`netAmount` · MntIVA `vatAmount` · MntActivoFijo `fixedAssetNetAmount` · MntIVAActivoFijo `fixedAssetVatAmount` ·
IVANoRec[] `nonRecoverableVat[] { CodIVANoRec code, MntIVANoRec amount }` · IVAUsoComun `commonUseVat` · IVAFueraPlazo
`lateVat` · IVAPropio `ownVatAmount` · IVATerceros `thirdPartyVatAmount` · Ley18211 `freeZoneTax` · OtrosImp[]
`otherTaxes[] { CodImp code, TasaImp rate, MntImp amount }` · MntSinCred `nonCreditableTax` · IVARetTotal
`totalVatWithheld` · IVARetParcial `partialVatWithheld` · CredEC `constructionCredit` · DepEnvase `containerDeposit` ·
Liquidaciones `settlement { RutEmisor issuerRut, ValComNeto netValue, ValComExe exemptValue, ValComIVA vatValue }` ·
MntTotal `totalAmount` · IVANoRetenido `vatNotWithheld` · MntNoFact `nonBillableAmount` · MntPeriodo `periodAmount` ·
PsjNac `domesticTickets` · PsjInt `internationalTickets` · TabPuros `cigars` · TabCigarrillos `cigarettes` ·
TabElaborado `processedTobacco` · ImpVehiculo `vehicleTax`.

**`TotalesSegmento` / `TotalesPeriodo` → `BookTotals`**
The same names as the line for the same amount (`TotMntExe` `exemptAmount`, `TotIVAUsoComun` `commonUseVat`, and so on),
plus: TotDoc `documentCount` · TotAnulado `voidedCount` · TotOpIVAUsoComun `commonUseVatCount` · TotIVANoRec[]
`nonRecoverableVat[] { CodIVANoRec code, TotOpIVANoRec count, TotMntIVANoRec amount }` · TotOtrosImp[] `otherTaxes[] {
CodImp code, TotMntImp amount }` · TotImpSinCredito `nonCreditableTax` · TotLiquidaciones `settlement { TotValComNeto
netValue, TotValComExe exemptValue, TotValComIVA vatValue }` · FctProp `commonUseVatFactor` (book level) · FctImpAdic
`additionalTaxFactors` (book level). TotCredIVAUsoComun and TotCredImp are derived at serialization.

**`Detalle` of `LibroGuia` → `GuideEntry`**
Folio `folio` · Anulado `voided` (1 `'folio'`, 2 `'guide'`, 3 `'partialReceipt'`) · Operacion `adjustment` · TpoOper
`transferType` (1 `sale`, 2 `pendingSale`, 3 `consignment`, 4 `demonstration`, 5 `internalTransfer`, 6 `otherTransfer`,
7 `returnGuide`) · FchDoc `date` · RUTDoc `receiverRut` · RznSoc `receiverName` · MntNeto `netAmount` · TasaImp `taxRate`
· IVA `vatAmount` · MntTotal `totalAmount` · MntModificado `modifiedAmount` · TpoDocRef `referenceType` · FolioDocRef
`referenceFolio` · FchDocRef `referenceDate`.

**Summary of `LibroGuia` → `GuideTotals`**
TotFolAnulado `voidedFolios` · TotGuiaAnulada `voidedGuides` · TotGuiaVenta `saleGuides` · TotMntGuiaVta
`saleGuidesAmount` · TotMntModificado `modifiedAmount` · TotTraslado[] `transfers[] { TpoTraslado type, CantGuia count,
MntGuia amount }`.

**`ConsumoFolios` → `FolioConsumption`**
RutEmisor `issuerRut` · RutEnvia `senderRut` · FchResol `resolutionDate` · NroResol `resolutionNumber` · FchInicio `from`
· FchFinal `to` · Correlativo `correlative` · SecEnvio `sequence` · TmstFirmaEnv `signedAt` · TipoDocumento `type` ·
MntNeto `netAmount` · MntIva `vatAmount` · TasaIVA `vatRate` · MntExento `exemptAmount` · MntTotal `totalAmount` ·
FoliosEmitidos `issuedCount` · FoliosAnulados `voidedCount` · FoliosUtilizados `usedCount` · RangoUtilizados[]
`usedRanges[] { Inicial from, Final to }` · RangoAnulados[] `voidedRanges[] { Inicial from, Final to }`.

---

## 5. Decisions taken with Hans (2026-11-01)

1. Full XSD format rather than certification only (section 1).
2. Lines from raw records and from phase 1 documents through helpers; the SDK computes the summaries (D22).
3. Field-proven output is the floor (D21). An explicit total that does not add up is kept and reported in
   `totalMismatches`; `strictTotals` is opt-in.
4. Three verification layers: official XSD in every run, golden XML, opt-in differential (D25, section 3.11).
5. One set of functions per book, following the phase 1 pattern (section 3.13).
6. The implementation plan is built from code that compiled and passed in a copy outside the repository. The phase 2
   plan had not, and its implementation had to diverge from it.
7. The implementation (phase 3 plan execution) runs in a separate session.

---

## 6. Open points and how the design handles them

| Point | Status | Handling |
|---|---|---|
| Namespace of `Signature` in `LibroGuia`: the published 2004 XSD declares it in the SII namespace | Field-proven output uses XMLDSig and completes certification | XMLDSig; the test helper rewrites it only for XSD validation; confirm in the first live guide book |
| Contents of `RangoUtilizados` when there are voided folios: the format text and its worked example disagree | Unverified; field-proven reports never carry voids | Follow the worked example (issued folios only); confirm with a live report that has voids |
| `TotOp*` counters that the SDK does not compute | Optional in the XSD and the format; field-proven books omit them; the official sample includes them | Omit; adding them later is free |
| `Emisor=1` on notes affecting a purchase invoice | The format asks for it; field-proven purchase books omit it | Field available, not inferred by the helper |
| `RUTDoc` of a 46 on the purchase book | The format says supplier; a field-proven book used the book owner's RUT and the SII did not object | Supplier, by the counterparty rule; visible as an expected difference in the differential |
| Whether the SII checks the `MntTotal` formula on every line | Field reports show repairs rather than rejections for some cases | `totalMismatches` reports; nothing blocks by default |
| Production validity of `ConsumoFolios` | The resolution that ended it was not identified | Documented as "used in the receipts certification; probably no longer required in production" |
| Live behaviour of all three books | Nothing has met the real SII from this codebase | An optional book step is proposed for issue #8, to run with a company in certification; not a condition for merging |

---

## Appendix A. SII format facts the implementation relies on (verified 2026-11-01)

**Sources.** `LibroCV_v10.xsd` (last modified 2011-03-02), `LceCal_v10.xsd`, `LceCoCertif_v10.xsd`,
`LceSiiTypes_v10.xsd`, `LibroGuia_v10.xsd` (2004), `ConsumoFolio_v10.xsd`, `SiiTypes_v10.xsd` (2026-02-06),
`xmldsignature_v10.xsd`, from the SII XML format page. Format PDFs: IECV version 3.0 (March 2016), guide book version
1.0 (2003-10-29), folio consumption 1.0 (2009-02-05), daily sales summary 2.0 (2020-08-03).

**`LibroCompraVenta`.** `EnvioLibro @ID { Caratula, ResumenSegmento?, ResumenPeriodo?, Detalle*, (LceCal | LceCoCertif)?,
TmstFirma }`, then `ds:Signature`. `TotalesSegmento` and `TotalesPeriodo`, 1 to 40 each. `DoctoType`: 29 30 32 33 34 35
38 39 40 41 43 45 46 53 55 56 60 61 101–106 108–112 175 180 185 900–907 909–911 914 918–922 924 500 501. Types 47 and 48
appear in the PDF but not in the XSD. Only in `TotalesPeriodo`: `FctProp`, `TotCredIVAUsoComun`, `TotImpVehiculo`,
`FctImpAdic`, `TotCredImp`. In `TotalesPeriodo`, `TotAnulado`, `TotOpExe`, `TotOpIVARec`, `TotOpActivoFijo`,
`TotOpIVANoRec`, `TotOpIVAUsoComun`, `TotOpIVARetTotal`, `TotOpIVARetParcial` and `TotOpIVANoRetenido` are
`positiveInteger`. `TotalesSegmento` counters and amounts are signed integers. `RznSoc` at most 50. `FchDoc` from
2000-01-01 to 2050-12-31. `CdgSIISucur` at most 9 digits. `IVANoRec` at most 5, codes 1 2 3 4 9. `OtrosImp` at most 20,
`MntImp` signed. `MontoType` fields of `Detalle` (non-negative): `MntActivoFijo`, `MntIVAActivoFijo`, `MntIVANoRec`,
`IVAUsoComun`, `IVAFueraPlazo`, `Ley18211`, `MntSinCred`, `IVARetTotal`, `IVARetParcial`, `CredEC`, `DepEnvase`,
`IVANoRetenido`, `PsjNac`, `PsjInt`, `TabPuros`, `TabCigarrillos`, `TabElaborado`, `ImpVehiculo`.

**Summary-only types (PDF section 4.1 and 6).** 35, 38, 39, 41, 105, 919, 920, 922, 924, 500, 501.

**`LibroGuia`.** `EnvioLibro @ID { Caratula, ResumenSegmento?, ResumenPeriodo?, Detalle*, TmstFirma }`, then `Signature`
(SII namespace in the XSD). `TipoLibro` only `ESPECIAL`. `FolioNotificacion` required. `TotGuiaVenta` and `TotMntGuiaVta`
required. `TotTraslado` at most 6, types 2 to 7. `Anulado` 1 2 3. `Operacion` 1 2. `TpoOper` 1 to 7. `RznSoc` at most 50.
`ResumenSegmento` amounts are signed, `ResumenPeriodo` ones are not.

**`ConsumoFolios`.** `DocumentoConsumoFolios @ID { Caratula @version { RutEmisor, RutEnvia, FchResol, NroResol, FchInicio,
FchFinal, Correlativo?, SecEnvio, TmstFirmaEnv }, Resumen+ }`, then `ds:Signature`. `Resumen` at most 3, types 39 41 61.
`Resumen { TipoDocumento, MntNeto?, MntIva?, TasaIVA?, MntExento?, MntTotal, FoliosEmitidos, FoliosAnulados,
FoliosUtilizados, RangoUtilizados*, RangoAnulados* }`. `RangoAnulados/Final` optional. The 2020 format lists only 39 and
41 and requires a report in zeros when there are no sales.

**Book states on `QueryEstUp`.** `LOK` accepted, `LSO` schema correct and processing, `LNC` submission kind does not
correspond (the period already has a total), `LRH` rejected. Repair details arrive as `LBR-*`. The SII takes at least 15
seconds to validate a book's schema.
