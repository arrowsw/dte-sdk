# dte-sdk — Phase 5a design (printed representation: PDF samples and the PDF417 stamp)

Date: 2026-11-04 · Status: **approved by Hans on 2026-11-04 (sections 1 to 3.4 one by one, the rest on the written file); amended the same day after the plan's code ran: 3.2, 3.7, 3.8, 3.10, 3.11 and sections 6 and 7** · Author: Claude (with Hans)

Starting point: the architecture and phase 1 spec (`2026-10-31-dte-sdk-architecture-and-phase-1-design.md`), the phase 2,
3 and 4 specs. Decisions D1–D38 and the glossaries are the contract; D40 and D41 below amend D3 and D4 for the PDF
module. SII facts come from the public SII documents (the printed-samples manual, version 3.0 of December 2013, and the
issuance instructions, section A.2.5) and from field behaviour known to pass the SII review of printed samples; section 6
says which is which. No third-party implementation is named in the repository; the SII behaviour is described directly.

---

## 1. Goal and scope

Phase 5 of the architecture spec covers the certification runner, the document exchange and the printed representation.
Hans split it into three specs and three pull requests on 2026-11-03 (D39):

- **5a**, this spec: the printed representation. Depends on phase 1 only.
- **5b**: the certification runner over the `pe_*` portal pages: set parser, test sets, books, simulation, progress
  declaration, compliance, artefacts between replicas. Depends on phases 2, 3 and 4.
- **5c**: the GWT portals: `pfeInternet` (document exchange), `pdfdteInternet` (printed-samples upload),
  `certBolElectDteInternet` (receipt certification).

Phase 5a turns a DTE, as it was signed, into the PDF the SII asks for when it reviews printed samples, with the PDF417
stamp of the TED. The same PDF serves as the printed representation of a document in production.

**In scope**

1. **Parser:** an `EnvioDTE`, `EnvioDTEB`, `EnvioDTETraslado`, `EnvioBOLETA`, bare `SetDTE` or bare `DTE` XML string
   becomes a list of printable documents, each carrying its `<TED>` verbatim from the input.
2. **Renderer:** one printable document becomes one single-page PDF laid out per the SII printed-samples manual, with
   the optional transferable copy (`cedible`) and its acknowledgement box.
3. **Stamp:** the PDF417 of a TED as a PNG that encodes exactly the bytes that were signed.
4. **In-memory batch:** many envelopes become many PDFs, classified into the test set and the simulation set, with
   failures reported as data.
5. **Node adapter:** the same batch over files and directories, the directory scan, and a logo read from a path.
6. **Infrastructure:** `pdf-lib` and `bwip-js` as dependencies, bundle externals, size cap, docs.

**Out of scope** (and where it goes)

- Uploading the PDFs to `pdfdteInternet`: phase 5c. The printed-samples step of the runner (5b) calls this module.
- An HTML representation, and continuous or POS paper layouts for receipts (39, 41): receipts print on the same sheet
  layout as every other type.
- Export documents (110, 111, 112): the catalog does not have them, so their type name prints as `DTE {type}`.
- Multi-page documents: a document taller than 33 cm loses what falls past the page, silently (3.3).
- Rendering from the typed `Document` without going through XML (D42).
- The layout improvements of section 7, deferred until the first real certification passes (D44).

---

## 2. Architecture decisions

### D39. Phase 5 is three specs and three pull requests

The printed representation depends on phase 1 only and is needed by the runner, so it goes first and alone. The runner
over the `pe_*` pages and the GWT portals are separate problems with separate measurement needs: the company is not yet
enrolled as an issuer, so neither can be verified live today, and splitting them keeps each pull request reviewable.

### D40. PDF and PDF417 come from `pdf-lib` and `bwip-js`, regular dependencies loaded on first use

> Superseded on 2026-11-04 by `docs/decisions/entry-points.md`: four entries, ES modules only.

Amends D4. `pdf-lib` 1.17.1 and `bwip-js` 4.11.4 enter `dependencies`, pinned exactly like the other four, and stay
external to the bundle. Both are loaded with `import()` inside the functions that need them, so importing `dte-sdk`
never evaluates them and the neutral bundle keeps loading everywhere it loads today.

An in-house PDF writer and PDF417 encoder were sized (about 25 to 30 kB brotli, no install cost) and set aside: the goal
of this phase is output that matches what already passes the SII review, and these two libraries are the ones that
produced that output in the field. `pdf-lib` has had no release since 2022-05 but is the de-facto standard (29 million
weekly downloads); its maintained fork `@cantoo/pdf-lib` keeps the same API, so swapping is a one-line change if a defect
appears. `bwip-js` is maintained (last release 2026-08). Section 6 holds the numbers.

### D41. Root entry; the size cap goes to 54 kB

> Superseded on 2026-11-04 by `docs/decisions/entry-points.md`: four entries, ES modules only.

Amends the `dte-sdk/pdf` row of D3 and keeps D36 (root entry only). The layout code measures about 8 kB brotli with the
libraries external; the root bundle stands at 44.45 kB under a 46 kB cap, so the cap goes to 54 kB for both formats.
Issue 5 (subpath entry points) stays open for a later phase.

### D42. The printed document comes from the signed XML, never from the typed `Document`

One source of truth: what was signed is what prints. `SignedDocument.xml` (a bare `DTE`) and `SignedEnvelope.xml`
enter the same parser as third-party XML and the XML of the runner's artefacts. The TED is copied verbatim from the
input, never rebuilt, because the stamp must carry the signed bytes.

### D43. A memory core and a Node adapter at the edge

Same shape as D37. The parser, the renderer and the batch work on strings and bytes and run anywhere `bwip-js` runs
(D45). One adapter loads `node:fs/promises` and `node:path` on first use, as `createDirectoryFolioRegistry` does, and
adds files, directories and a logo path.

### D44. Parity with field-proven output; no layout improvements in this phase

Every rule of 3.3 reproduces the layout known to pass the SII review of printed samples, including its defaults and its
omissions. Improvements that the SII documents suggest are listed in section 7 and deferred (Hans, 2026-11-04): the first
real certification validates the port before anything changes.

### D45. The PDF module is Node-only

`bwip-js` exposes `toBuffer` only in its Node entry; its browser entry draws to a canvas. The stamp, and with it the
PDF, run under Node. The bundle stays neutral: nothing is evaluated at import, and the parser and `needsTransferableCopy`
run anywhere.

---

## 3. Phase 5a — detailed design

### 3.1 `src/` layout

```
src/pdf/layout.ts        constants: page, margin, gaps, type box, stamp box, font sizes, line heights, table,
                         acknowledgement box; the Ley 19.983 acknowledgement text; transfer reason names
src/pdf/parse.ts         parsePrintableDocuments
src/pdf/stamp.ts         renderTedBarcode (bwip-js, lazy)
src/pdf/render.ts        renderPrintedSample, needsTransferableCopy; one measure and one draw function per block;
                         text helpers (wrap, draw, centred, rectangle, horizontal rule)
src/pdf/samples.ts       renderPrintedSamples (memory batch), sample naming, set classification
src/pdf/node-samples.ts  writePrintedSamples, findEnvelopeFiles (node:fs, lazy), logo from a path
```

Also touched: `src/errors.ts` (two codes, 3.7), `src/index.ts`, `tests/public-api.test.ts`, `scripts/build.mjs`,
`.size-limit.json`, `package.json`, `README.md`, `CHANGELOG.md`, and the architecture spec (a note under D3 and D4).

Every function is free and every type is `readonly`, with bilingual JSDoc naming the SII tag on the `ES:` line.

### 3.2 Printable document and parser

**Types** (`src/pdf/parse.ts`):

```ts
export type PrintableParty = {
  readonly rut: string        // RUTEmisor / RUTRecep, as written in the XML
  readonly name: string       // RznSoc or RznSocEmisor / RznSocRecep
  readonly activity: string   // GiroEmis / GiroRecep
  readonly address: string    // DirOrigen / DirRecep
  readonly commune: string    // CmnaOrigen / CmnaRecep
}
export type PrintableIssuer = PrintableParty & { readonly branch: string } // Sucursal
export type PrintableTotals = {
  readonly net?: number      // MntNeto
  readonly exempt?: number   // MntExe
  readonly vat?: number      // IVA
  readonly vatRate?: number  // TasaIVA
  readonly total?: number    // MntTotal
}
export type PrintableAdjustment = { readonly kind: 'D' | 'R'; readonly valueType: '%' | '$'; readonly value?: number } // DscRcgGlobal: TpoMov, TpoValor, ValorDR
export type PrintableItem = {
  readonly code: string               // CdgItem/VlrCodigo (the first code when there are several)
  readonly name: string               // NmbItem
  readonly quantity?: number          // QtyItem
  readonly unit?: string              // UnmdItem
  readonly unitPrice?: number         // PrcItem
  readonly amount?: number            // MontoItem
  readonly discountAmount?: number    // DescuentoMonto
  readonly discountPercent?: number   // DescuentoPct
}
export type PrintableReference = { readonly documentType: string; readonly folio: string; readonly date: string; readonly reason: string } // TpoDocRef, FolioRef, FchRef, RazonRef
export type PrintableDocument = {
  readonly type: number                  // IdDoc/TipoDTE, else TD of the TED, else 0
  readonly folio: string                 // IdDoc/Folio, else F of the TED, else ''
  readonly issueDate: string             // IdDoc/FchEmis, else FE of the TED, else ''; printed as is (AAAA-MM-DD)
  readonly transferReason: number | null // IdDoc/IndTraslado
  readonly grossAmounts: boolean         // IdDoc/MntBruto equal to 1
  readonly issuer: PrintableIssuer
  readonly receiver: PrintableParty
  readonly totals: PrintableTotals       // only these five fields print
  readonly globalAdjustments: readonly PrintableAdjustment[]
  readonly items: readonly PrintableItem[]
  readonly references: readonly PrintableReference[]
  readonly tedXml: string                // the <TED>…</TED> substring of the input, '' when none
}
```

Strings are `''` when the tag is absent; numbers are `undefined` when absent. `TpoDocRef` stays a string because the
schema admits `SET` and codes that are not DTE types. `Transporte` is not mapped: no block prints it.

**Parser** `parsePrintableDocuments(xml: string): readonly PrintableDocument[]`:

1. `parseXml` of the SDK (values as strings, `XML_PARSE_FAILED` when not well-formed), then the root: `EnvioDTE`,
   `EnvioDTEB`, `EnvioDTETraslado` or `EnvioBOLETA` → its `SetDTE/DTE` list; a bare `SetDTE` → its `DTE` list; a bare
   `DTE` → a list of one (the only adaptation, so `SignedDocument.xml` enters without an envelope). Any other root →
   an empty list. One `DTE` or many: both are lists. The document element is `Documento`, `Liquidacion` (type 43) or
   `Exportaciones` (export types).
2. Every `<TED…>…</TED>` is captured on the input text with one non-greedy regular expression, never rebuilt. Each
   document gets the TED whose `<F>` and `<TD>` equal its folio and type; with no match, the TED at the document's
   position; with none at all, `''`.
3. Values are coerced with `Number` where they are numeric in the schema: type, transfer reason, `MntBruto`, every
   amount, rate, quantity and percent. The printed effect is the field one: a total of 0 is not printed, and a quantity
   `2.000` prints as `2`.
4. Type, folio and date fall back to the TED's `TD`, `F` and `FE` when `IdDoc` lacks them.

**Printed names.** The type name is `documentTypeName(type, 'printed')` of the existing catalog, whose texts follow the
manual, and `DTE {type}` for a type outside the catalog. The document type of a reference prints the same way, with
`Tipo {code}` as fallback.

**Transferable copy.** `needsTransferableCopy(doc)` is true for 33, 34, 43 and 46 always; for 52 only when the transfer
reason is 1 (sale) or 9 (export sale), with 1 assumed when absent, because the manual excludes the transferable copy for
a transfer that is not a sale or is internal; false for every other type, including 56 and 61. The acknowledgement box
and the `CEDIBLE` mark are drawn only when the caller asks for the transferable copy **and** this function is true.

### 3.3 Rendering

`renderPrintedSample(doc, options?)` returns the PDF bytes (`Uint8Array`). `options` is `PrintedSampleOptions` plus
`transferable`:

```ts
export type PrintedLogo = { readonly bytes: Uint8Array; readonly format: 'png' | 'jpeg' }
export type PrintedSampleOptions = {
  readonly siiOffice?: string   // under the type box; default 'S.I.I. - SANTIAGO CENTRO'
  readonly resolution?: string  // under the stamp; default `Res. Ex. SII N° 0 del {year}` with the year of `now`
  readonly logo?: PrintedLogo   // top left; a logo the library cannot embed is ignored, as in the field
  readonly now?: () => Date     // clock for the default resolution; defaults to the system clock
}
export type RenderPrintedSampleOptions = PrintedSampleOptions & {
  readonly transferable?: boolean // draw the transferable copy (acknowledgement box and CEDIBLE mark); default false
}
```

Both `renderPrintedSample` and `renderTedBarcode` take a trailing `load` parameter that exists for tests, as
`createDirectoryFolioRegistry` does; the default loads the libraries on first use and memoizes them.

**Page and fonts.** One page, 609.45 pt wide (21.5 cm), 14.17 pt margin (0.5 cm) on the four sides, height equal to
the measured sum of the blocks clamped between 311.81 pt (11 cm) and 935.43 pt (33 cm). Standard Helvetica and
Helvetica-Bold of `pdf-lib`, no embedded font files. A character outside WinAnsi makes the library throw; 3.7 says how
it surfaces.

**Two phases.** First every block is measured (header, date, receiver, transfer line, references, detail, totals,
acknowledgement, and the stamp reserve, which is the stamp's maximum height plus its three legend lines) and the page
height is fixed. Then the blocks are drawn in order with `y` growing from the top; coordinates are rounded to whole
points; text whose baseline falls outside the page is skipped silently. A document taller than 33 cm therefore loses
its tail without an error (section 7).

**Constants** (`src/pdf/layout.ts`), in points: gaps section 10, small 6, tiny 4; type box width 155.91 (5.5 cm),
height between 42.52 (1.5 cm) and 113.39 (4 cm), border 1.5, padding 8 × 6; stamp width between 141.73 (5 cm) and
255.12 (9 cm), height between 56.69 (2 cm) and 113.39 (4 cm), 56.69 (2 cm) from the left margin, legend gap 5; font
sizes name 11, normal 10, small 9, tiny 8, legal 7, legend 7; line heights normal 13, small 11, tiny 10, legal 9; table
row 12, header 14, padding 3 × 2; acknowledgement box padding 8 × 8, field height 14. Colours: black, red (0.75, 0, 0),
dark grey (0.4), mid grey (0.5), light grey (0.88).

**Blocks, in order:**

| # | Block | Rule |
|---|---|---|
| 1 | Header, left | Logo if any: height at most 25 pt, width at most the smaller of 40 % of the free width and 120 pt, proportions kept; then issuer name bold 11, activity 9, `Casa Matriz: {address}, {commune}` 9 (the comma and commune only when the commune exists), `Sucursal: {branch}` 9 when present |
| 1 | Header, right | Type box in red: 155.91 pt wide, height from content within its bounds, border 1.5; inside, centred, red bold: `R.U.T.: {rut}` 9 with thousands dots (`rut.ts` formatting), the printed type name 10 wrapped when it does not fit, `N° {folio}` 9. Under the box, the SII office centred, 7 pt black. The header height is the taller column |
| 2 | Issue date | `Fecha Emisión: {issueDate}` bold 10 |
| 3 | Receiver | Box with mid-grey 0.5 border; three rows at 9 pt: `Señor(es):` + name and `RUT:` + rut aligned right (the rut as it came, no dots); `Dirección:` + address and `Comuna:` + commune aligned right; `Giro:` + activity. Labels bold, values regular |
| 4 | Transfer line | Only type 52 with a transfer reason: `Tipo de Traslado: {n} - {name}` 9, names from the catalog of `IndTraslado` (1 Operación constituye venta … 9 Venta para exportación) |
| 5 | References | Only when there are any: title `Referencias a otros documentos` bold 10; table with light-grey header, columns Tipo Documento 30 %, Folio 15 %, Fecha 20 %, Razón Referencia the rest; rows 12 pt, text 8 pt |
| 6 | Detail | Title `Detalle` bold 10; columns `#` 5 % centred, `Código` 10 %, `Descripción` the rest wrapped, `Cant.` 9 % right, `Unid.` 7 % centred with `UN` when absent, `P.Unit.` 13 % right, `Valor` 14 % right; the last two read `P.Unit. c/IVA` and `Valor c/IVA` when `grossAmounts`. Amounts as `$` plus `toLocaleString('es-CL')`. A row grows with its wrapped description and gains a mid-grey 7 pt line `Dcto: $…` or `Dcto: …%` when the item has a discount |
| 7 | Totals | Box 45 % of the page width aligned right, label 55 % and value 45 %, 10 pt, dark-grey 0.5 borders. Type 34: only `Monto Exento` and `Monto Total`. Others: one row per global adjustment (`Descuento Global` for `D`, `Recargo Global` for `R`, with `$value` when `TpoValor` is `$` and `value%` when it is `%`, empty without a value), `Monto Neto`, `Monto Exento`, `IVA ({rate}%)` with 19 when the rate is absent or 0, `Monto Total` bold. A row prints only when its amount is non-zero |
| 8 | Acknowledgement | Only on the transferable copy: box with black 0.5 border; `Acuse de Recibo` bold 9; `Nombre:` and `R.U.T.:` on one line, `Fecha:` and `Recinto:` on the next, `Firma:` on the third, each with underscores; a mid-grey rule; then the Ley 19.983 text (Appendix A) wrapped at 7 pt |
| 9 | Stamp | Only when `tedXml` is not empty: the PNG of 3.4 at the margin plus 56.69 pt from the left; width clamped to 141.73–255.12 pt, height clamped separately to 56.69–113.39 pt; under it `Timbre Electrónico SII` bold 7, the resolution text 7, `Verifique documento: www.sii.cl` 7 |
| 10 | CEDIBLE mark | Only on the transferable copy: bottom right, bold 11, `CEDIBLE CON SU FACTURA` for 52 and `CEDIBLE` for the rest |

**Text helpers.** Wrapping is by words; a single word wider than the column is split by characters. Centred text is
centred within its box and never pushed left of it.

### 3.4 Stamp

`renderTedBarcode(tedXml: string): Promise<Uint8Array>` returns the PNG of the PDF417. It loads `bwip-js` with
`import()` on first use and calls `toBuffer` with `bcid: 'pdf417'`, `scale: 3`, `height: 10`, `padding: 6`,
`includetext: false`, `binarytext: true`, and as text the TED with each code point turned into one byte: `encodeLatin1`
of the SDK (which throws `ENCODING_UNSUPPORTED_CHAR` above U+00FF instead of truncating; a valid TED never has such a
character) decoded back to a one-char-per-byte string. `binarytext` tells the library that the string is already bytes,
so an `ñ` reaches the symbol as the single byte 0xF1 that was signed and not as the two UTF-8 bytes. The input must
contain `<TED`; otherwise `MISSING_FIELD` with field `TED`.

The function is public for callers who lay out their own documents. The renderer calls it once per document and
embeds the PNG as is.

### 3.5 In-memory batch

```ts
export type PrintedEnvelope = { readonly name: string; readonly xml: string }
export type PrintedSampleSet = 'tests' | 'simulation'
export type PrintedSamplesInput = {
  readonly envelopes: readonly PrintedEnvelope[]
  readonly options?: PrintedSampleOptions
  readonly transferable?: boolean // also produce the transferable copy of every document that admits one; default false
}
export type PrintedSample = {
  readonly name: string            // muestra_{type}_{folio}.pdf or muestra_{type}_{folio}_cedible.pdf
  readonly set: PrintedSampleSet
  readonly source: string          // the envelope name
  readonly type: number
  readonly folio: string
  readonly transferable: boolean
  readonly bytes: Uint8Array
}
export type PrintedSampleFailure = {
  readonly source: string
  readonly type?: number           // absent when the envelope itself failed to parse
  readonly folio?: string
  readonly transferable?: boolean
  readonly code?: DteErrorCode     // when the failure is a DteError
  readonly reason: string          // the error message
}
export type PrintedSamplesResult = {
  readonly success: boolean        // no failures
  readonly samples: readonly PrintedSample[]
  readonly failures: readonly PrintedSampleFailure[]
  readonly documents: number       // documents parsed
  readonly tests: number           // samples in the test set
  readonly simulation: number      // samples in the simulation set
}
```

`renderPrintedSamples(input)`:

- Each envelope is parsed; a parse failure becomes one failure entry for that envelope and the batch continues.
- The set of an envelope comes from its name, lower-cased: a name matching `envio-set-(basico|guia|exenta|compra)\.xml`
  belongs to the test set, every other name to the simulation set. The Node adapter passes the file's basename; a caller
  in memory passes whatever name it has, for example the artefact key.
- Every document yields one sample; with `transferable` true, a second one with the transferable copy when
  `needsTransferableCopy(doc)` is true. A render failure becomes one failure entry (with `type`, `folio` and
  `transferable`) and the batch continues; `success` is false when any entry exists.
- Nothing is logged; the counts replace the field tool's console output.

### 3.6 Node adapter

```ts
export type WritePrintedSamplesInput = {
  readonly xmlFiles: readonly string[]
  readonly outDir: string
  readonly options?: PrintedSampleOptions
  readonly logoPath?: string      // read once, replaces options.logo; a missing file or an extension other than png, jpg or jpeg means no logo
  readonly transferable?: boolean
}
export type WrittenPrintedSample = Omit<PrintedSample, 'bytes'> & { readonly path: string; readonly size: number }
export type WritePrintedSamplesResult = Omit<PrintedSamplesResult, 'samples'> & { readonly samples: readonly WrittenPrintedSample[] }
```

`writePrintedSamples(input, load = loadNodeFs)` creates `{outDir}/SET-PRUEBAS` and `{outDir}/SET-SIMULACION`, reads
every file as UTF-8 (a read failure is a failure entry for that file), runs the memory batch one envelope at a time with
the basename as `source`, and writes each sample into the folder of its set under its sample name. The result is the
batch result with paths and sizes instead of bytes.

`findEnvelopeFiles(inputPath, load = loadNodeFs)` returns `[inputPath]` for a file, the recursive list of `.xml` files
whose lower-cased name contains `envio-set-`, `envio-simulacion` or `envioboleta` for a directory (responses and receipt
envelopes of the exchange carry no DTE and are skipped), and `[]` for a path that does not exist.

Both take the `load` parameter of `createDirectoryFolioRegistry` and fail with `TRANSPORT_UNAVAILABLE` when `node:fs`
cannot be loaded.

### 3.7 Errors

Two codes join `DTE_ERROR_CODES`:

- `DEPENDENCY_UNAVAILABLE` with `{ module: 'pdf-lib' | 'bwip-js', reason }`: the library could not be loaded.
- `PDF_RENDER_FAILED` with `{ reason, type, folio }`: the library threw while drawing or encoding (a character outside
  WinAnsi is the usual cause). The message carries the code and the safe keys; the reason is the library's message, which may quote the offending character.

Existing codes used: `XML_PARSE_FAILED` (parser), `MISSING_FIELD` with `TipoDTE` (`renderPrintedSample` on a document
with type 0) or `TED` (`renderTedBarcode` without a `<TED`), `ENCODING_UNSUPPORTED_CHAR` (stamp), `TRANSPORT_UNAVAILABLE`
(Node adapter). A logo the library cannot embed is not an error: the sample prints without it, as in the field.

`INVALID_FOLIO` with `{ field: 'Folio' }` guards the file names (added after the merge, on a security review): the folio
is part of `muestra_{type}_{folio}.pdf`, and an XML from elsewhere could carry `..` or a separator in `<Folio>`. The
batch refuses a folio that is not a run of digits before it can name a file, and the Node adapter refuses on its own a
sample path that would leave the folder of its set (`samplePath`), so each layer is safe without the other.

The batch never throws for one envelope or one document: everything above becomes a failure entry with its `code`,
read with `errorCode(error)`, a new helper of `src/errors.ts` (exported) that gives the code of a thrown `DteError`
and undefined for anything else.

### 3.8 Public API additions

Runtime exports added to the root and to `RUNTIME_EXPORTS`:

- **Parser:** `parsePrintableDocuments`, `needsTransferableCopy`.
- **Rendering:** `renderPrintedSample`, `renderTedBarcode`.
- **Batch:** `renderPrintedSamples`, `writePrintedSamples`, `findEnvelopeFiles`.
- **Errors:** `errorCode`.

Types:

- **Document:** `PrintableDocument`, `PrintableIssuer`, `PrintableParty`, `PrintableTotals`, `PrintableAdjustment`,
  `PrintableItem`, `PrintableReference`.
- **Rendering:** `PrintedLogo`, `PrintedSampleOptions`, `RenderPrintedSampleOptions`.
- **Batch:** `PrintedEnvelope`, `PrintedSampleSet`, `PrintedSamplesInput`, `PrintedSample`, `PrintedSampleFailure`,
  `PrintedSamplesResult`, `WritePrintedSamplesInput`, `WrittenPrintedSample`, `WritePrintedSamplesResult`.

No layout constant is exported: the layout is the SII's, not a parameter.

### 3.9 Typical flows

```ts
// A document the SDK issued (phase 1): its signed XML is the input
const [doc] = parsePrintableDocuments(signed.xml)
const pdf = await renderPrintedSample(doc, { siiOffice: 'S.I.I. - SANTIAGO ORIENTE', resolution: 'Res. Ex. SII N° 80 del 2014' })
const transferableCopy = await renderPrintedSample(doc, { transferable: true })

// Every document of an envelope, in memory, both copies where they apply
const result = await renderPrintedSamples({
  envelopes: [{ name: 'envio-set-basico.xml', xml: envelope.xml }],
  options: { logo: { bytes: logoPng, format: 'png' } },
  transferable: true,
})
for (const failure of result.failures) console.error(failure.source, failure.code, failure.reason)

// From the files of a certification run, into SET-PRUEBAS and SET-SIMULACION
const files = await findEnvelopeFiles('./certification/envelopes')
const written = await writePrintedSamples({ xmlFiles: files, outDir: './certification/samples', logoPath: './logo.png', transferable: true })

// Only the stamp, for a layout of your own
const png = await renderTedBarcode(doc.tedXml)
```

### 3.10 Tests

- **Fixtures:** envelopes built in the tests with the SDK's own `issueDocument` and envelope functions over the fixture
  certificate and CAFs, so every TED is real and signed; plus hand-written XML strings for third-party shapes:
  `EnvioBOLETA`, a bare `SetDTE`, a bare `DTE`, `MntBruto` 1, line discounts by amount and by percent, a global discount
  and a global surcharge, references (including `SET` and a code outside the catalog), a guide per transfer reason, a
  type 34, a document without TED, a TED whose folio does not match (positional fallback), a type 110, an envelope with
  no DTE, malformed XML, a name with `ñ` and accents. All data invented; `npm run scan` stays green.
- **Parser:** table-driven mapping of every field of 3.2; the TED equals the substring of the input; the fallbacks of
  type, folio and date; coercion (`"0"` totals, `"2.000"` quantities); the root variants.
- **Renderer:** every PDF is loaded back with the library: one page, width 609.45, height within the bounds, the minimum
  height for a tiny document and the maximum for a long detail; the page content is read (the library Flate-compresses
  it; the test helper inflates it and reads the `Tj` strings as Latin-1) and asserted to contain the printed type name, `N° {folio}`,
  `IVA (19%)`, `P.Unit. c/IVA` on a gross document, `Tipo de Traslado` on a guide, `CEDIBLE CON SU FACTURA` on a guide's
  transferable copy and `Acuse de Recibo` on it; and not to contain the acknowledgement on a plain copy, nor on a guide
  that is not a sale, nor on a credit note; an image object is present with a TED and absent without one; the logo is
  embedded for PNG and JPEG and ignored for bytes that are not an image. Every fixture PDF measures at most 500 KB.
- **Stamp:** the PNG is decoded (`pngjs`), composited over white (the library draws on a transparent background) and
  read with the PDF417 reader of `@zxing/library` (dev dependencies): the decoded text equals the TED XML, including an
  `Ñ` and an `Ó` in the receiver name. The image embedded in the PDF is rebuilt from its XObject (Flate data plus
  `SMask`) and decoded the same way, so the test covers the stamp as it is printed.
- **Properties (fast-check):** wrapped lines never exceed the column width and re-join to the input words; the page
  height stays within its bounds for random item counts and name lengths (few runs: each render takes tens of
  milliseconds).
- **Batch:** classification by name, sample names, the transferable copy only where it applies, failures as data for a
  malformed envelope and a type 0 document, counts and `success`.
- **Node adapter:** a temporary directory per test; files land in the right folder; the scan filter, a file path, a
  missing path; the logo from a PNG path, a JPEG path, another extension and a missing file; `load` injected to fail.
- **Dependencies:** `load` injected to fail yields `DEPENDENCY_UNAVAILABLE`; a name with a character outside WinAnsi
  yields `PDF_RENDER_FAILED` with the type and folio; a TED with a code point above U+00FF yields
  `ENCODING_UNSUPPORTED_CHAR`.
- **Public API:** `RUNTIME_EXPORTS` gains the seven names; `expect-type` checks the exported types; the dist smoke test
  keeps loading both formats without evaluating the libraries.
- Coverage stays at 100 % on the four metrics.

### 3.11 Build, dependencies and docs

- `package.json`: `pdf-lib` 1.17.1 and `bwip-js` 4.11.4 in `dependencies`; `@zxing/library` 0.23.0, `pngjs` 7.0.0 and
  `@types/pngjs` 6.0.5 in `devDependencies`, exact versions.
- `scripts/build.mjs`: `pdf-lib` and `bwip-js` join `EXTERNAL`.
- `.size-limit.json`: both limits to 54 kB. Measured with the plan's code: ESM 50.15 kB, CJS 50.26 kB.
- Type declarations: `import('bwip-js')` and `import('pdf-lib')` resolve through the packages' own declarations; the
  loader types stay internal (not exported from the root), as `NodeFsModules` is.
- `README.md`: a "Printed samples (Node)" section with the flows of 3.9 and the Node-only note of D45. `CHANGELOG.md`:
  an `Added` entry under `Unreleased`. `llms.txt`: the new exports, if it lists exports.
- The architecture spec gets a one-line note under D3 and D4: the PDF module ships from the root with regular
  dependencies, per this spec.

---

## 4. Glossary additions (public contract)

| Term | Meaning |
|---|---|
| Printed sample (muestra impresa) | The PDF of a document that the SII reviews during certification, and the printed representation of a document in production |
| Transferable copy (copia cedible) | The copy of a 33, 34, 43, 46 or sale 52 that carries the `CEDIBLE` mark and the acknowledgement box, so the receiver can acknowledge receipt under Ley 19.983 |
| Acknowledgement box (acuse de recibo) | The box with name, RUT, date, place and signature and the Ley 19.983 text; only on the transferable copy |
| Stamp (timbre electrónico) | The PDF417 symbol of the TED, labelled `Timbre Electrónico SII`, with the resolution and verification lines |
| Type box (recuadro) | The red box at the top right with the issuer's RUT, the printed type name and the folio, with the SII office under it |
| Test set and simulation set | The two folders of printed samples the certification asks for: the documents of the basic, guide, exempt and purchase sets, and the documents of the simulation |

---

## 5. Decisions reviewed with Hans

| # | Decision | Outcome |
|---|---|---|
| 1 | Three specs and three pull requests: 5a printed representation, 5b runner, 5c GWT portals (D39) | Hans's, 2026-11-03 |
| 2 | `pdf-lib` and `bwip-js` now, with the in-house writer kept as a later option (D40) | Hans's, 2026-11-03 |
| 3 | Root entry with regular dependencies and a 54 kB cap, instead of a `dte-sdk/pdf` subpath with optional peers (D41) | Hans's, 2026-11-03 |
| 4 | A memory core plus a Node adapter for files, instead of memory only or a direct path from the typed `Document` (D42, D43) | Hans's, 2026-11-04 |
| 5 | No layout improvements in this phase; the three found are deferred to after the first real certification (D44, section 7) | Hans's, 2026-11-04 |
| 6 | Approach: a direct functional port, one measure and one draw function per block, over a declarative layout engine or HTML plus a headless browser | Approved 2026-11-04 |
| 7 | Sections 3.1 (layout), 3.2 (model and parser), 3.3 and 3.4 (rendering and stamp) | Approved 2026-11-04 |
| 8 | Sections 3.5 to 3.11 (batch, adapter, errors, API, tests, build) | Written without a section review at Hans's request, to finish sooner; approved on the written file on 2026-11-04 |

---

## 6. What is measured and what is not

**Measured on 2026-11-03:**

- npm: `pdf-lib` 1.17.1, last publish 2022-05-12, 29.1 million downloads in the week to 2026-11-02, MIT, dependencies
  `@pdf-lib/standard-fonts`, `@pdf-lib/upng`, `pako`, `tslib`; `@cantoo/pdf-lib` 2.11.1, last publish 2026-09-15, 3.2
  million, MIT; `bwip-js` 4.11.4, last publish 2026-08-19, 1.7 million, MIT. Installed: `pdf-lib` about 23 MB, `bwip-js`
  about 12 MB. Bundled and brotli-compressed, 175 kB and 186 kB; neither enters the bundle (D40).
- The layout code of the field-proven output, minified with the libraries external: 28.1 kB, 8.2 kB brotli (D41).
- A TED issued from the fixtures measures 1 010 characters (1 024-bit keys). At error correction level 5 the encoder
  produces a symbol of 16 data columns and 52 rows, 341 × 52 modules; the longer TED of the test fixtures gives 17
  columns. Read from the PNG: with `scale` 3, `padding` 6 and `height` 10 the symbol is drawn with 3 px modules, an
  18 px quiet zone and rows as tall as one module (1 110 × 192 px for the 17-column symbol), because `height` squashes
  the rows. Scaled to the 9 cm maximum that is about 292 DPI for 16 columns and 313 DPI for 17, a module of about
  0.25 mm (10 mils, above the 6.7 mils minimum), and a natural height of about 1.6 cm that the 2 cm minimum stretches
  to a row-to-module ratio of about 1.6:1, under the 3:1 the instructions recommend (section 7). With byte compaction
  alone the 1 010-character TED needs 908 of the 928 codewords a PDF417 can hold and overflows with a 40-character `RSR`
  and `IT1`; the library mixes text and byte compaction, which is what the field output carries and what the SII reader
  accepted.
- The SII rules of Appendix A, from the two public documents.

**Measured on 2026-11-04 with the plan's code:**

- `pdf-lib` Flate-compresses the page content streams and writes text as hexadecimal strings; the test helper inflates
  and decodes them. The PDF417 reader of `@zxing/library` decodes the field symbol once the PNG's alpha channel is
  composited over white: the 1 010-character TED, an accented one, and the image rebuilt from the PDF all decode to
  the exact bytes, at level 5.
- 1 758 tests pass with coverage at 100 % on the four metrics; the bundles measure ESM 50.15 kB and CJS 50.26 kB.

**Not measured:**

- The SII's acceptance of the generated samples. It needs the company enrolled and the `pdfdteInternet` upload of phase
  5c. Until then the proof is parity with the output known to pass, plus the decoding tests of 3.10.

---

## 7. Deferred improvements and known limits

Kept out of this phase on purpose (D44); to be reconsidered after the first real certification passes:

1. **Withholdings in the totals (46 and 43).** The totals print only global adjustments, net, exempt, VAT and total,
   never `ImptoReten`, so a purchase invoice shows a total that does not add up from net plus VAT. The SII's change of
   subject format shows the withheld VAT.
2. **Commissions of the settlement invoice (43).** The `Comisiones` block (net, exempt and VAT of the commission) is
   not printed; the manual asks for it on type 43. Phase 1 already models it.
3. **Stamp raster at 300 DPI or more, and 3:1 rows.** `scale` 3 gives about 292 DPI at 9 cm for a 16-column symbol,
   just under the minimum of the issuance instructions (313 DPI for 17 columns); `scale` 4 would give 389 DPI with no
   visible change. The field `height` 10 squashes the rows to the height of a module, so the printed ratio is about
   1.6:1 instead of the 3:1 the instructions recommend; dropping `height` restores 3:1 (section 6). Both stay as they
   are because that output passed the SII review.

Minor: `MontoNF` is not printed; the stamp height is clamped independently of its width, so a tall symbol loses up to
4 % of its 3:1 row ratio; a logo the library rejects is ignored silently; a document taller than 33 cm is cut silently.

---

## Appendix A. SII facts used

From the printed-samples manual (version 3.0, December 2013):

- Sheet from 21.5 × 11 cm to 21.5 × 33 cm, a blank border of 0.5 cm, the logo at the top left taking at most one fifth
  of the sheet.
- The type box at the top right: at least 1.5 × 5.5 cm and at most 4 × 8 cm, black or red, line 0.5 to 1 mm, text at
  least 10 pt bold uppercase, holding only the RUT with dots, the type name and the folio preceded by `N°`; the SII
  regional office under it.
- Layout order: issuer at the top left, type box at the top right, then issue date, receiver, references, detail; at the
  bottom the totals, the acknowledgement box, the stamp at least 2 cm from the left edge, and `CEDIBLE` at the bottom
  right.
- Transferable copies for 33, 34, 52, 46 and 43 (`CEDIBLE CON SU FACTURA` for guides; none for a guide that is not a sale
  or is an internal transfer); none for 56 and 61. The acknowledgement box holds Nombre, Rut, Fecha, Recinto and Firma
  and the text of Res. Ex. 51 of 2005: "El acuse de recibo que se declara en este acto, de acuerdo a lo dispuesto en la
  letra b) del Art. 4°, y la letra c) del Art. 5° de la Ley 19.983, acredita que la entrega de mercaderías o servicio(s)
  prestado(s) ha(n) sido recibido(s)." Never "Recibí conforme".
- Type 34 prints only the exempt amount and the total; VAT always prints with its rate; type 46 follows the change of
  subject format.
- One PDF per document, one page, at most 500 KB (about 100 KB ideal). The stamp as a raster PNG preferred, vector
  accepted; under it the label `Timbre Electrónico SII`, used to locate it, then the resolution line and
  `Verifique documento: www.sii.cl`, at 6 pt or more; the document data as text, never as an image; a margin around the
  stamp.

From the issuance instructions, section A.2.5 (PDF417): 300 DPI or more, black, a quiet zone of at least 0.25 inch on
the four sides, no truncation, byte compaction, error correction level 5, module width at least 6.7 mils, row height 3:1,
a recommended maximum of 3 cm high by 9 cm wide. Section A.2.4: `RSR` and `IT1` in ISO-8859-1 with XML entities.
