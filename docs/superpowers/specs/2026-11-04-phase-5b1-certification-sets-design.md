# dte-sdk — Phase 5b-1 design (certification: test sets, simulation and books)

Date: 2026-11-04 · Status: **draft for Hans's review: the split and the scope were decided with him; section 1 was presented in chat and the rest was written on his go-ahead to advance** · Author: Claude (with Hans)

Starting point: the architecture and phase 1 spec, the phase 2, 3 and 4 specs, and the phase 5a spec (D39–D45; phase 4b
takes D46–D56, so this spec starts at D57). SII facts come from two public SII documents, "Instrucciones para la
construcción de documentos tributarios electrónicos con los datos del set de pruebas" (2003) and "Manual para empresas
usuarias, ambiente de certificación factura electrónica" (2009), and from field behaviour known to pass the SII's review
of the test sets; section 6 says which is which. No third-party implementation is named in the repository; the SII
behaviour is described directly.

---

## 1. Goal and scope

Phase 5 was split into 5a (printed samples, merged), 5b (certification runner) and 5c (GWT portals). Hans split 5b again
on 2026-11-04: **5b-1**, this spec, everything deterministic; **5b-2**, everything that talks to the portal and
orchestrates. The boundary (D57): 5b-1 only generates. It receives the text of the test set, the CAFs, the issuer and
receiver data, the certificate and the resolution, and returns data: the case plan, the signed documents, one signed
envelope per set, the simulation envelope and the three signed books. Downloading the set, sending, waiting for the
status, declaring and naming files belong to 5b-2, which reuses phases 2, 3 and 4.

**In scope**

1. **Parser:** the text the SII delivers as the test set (`SET … - NUMERO DE ATENCION: n`, cases, items, references,
   reasons, motives, global discounts, the two purchase-book sets) becomes typed data.
2. **Plan:** the parsed sets become the cases each set issues, with the folios each document type needs.
3. **Folios:** a `FolioSource` port and an in-memory allocator over one or several CAFs per type.
4. **Issuing the four sets:** basic (33, 61, 56), exempt (34, 61, 56), dispatch guides (52), purchase invoice (46, 61,
   56): the documents of each case, their references, one envelope per set.
5. **Simulation:** every case of the four sets issued again with fresh folios, in one envelope.
6. **Books:** the sales book from the issued basic set, the purchase book and the purchase book for exempt taxpayers
   from the parsed purchase-book sets, the guide book from the issued guide set.
7. **Tests:** synthetic set texts, every rule, a private differential harness, XSD validation of the books.

**Out of scope** (and where it goes)

- Obtaining the set from the portal (`pe_generar`, `pe_generar1`, `pe_generar2`), sending envelopes and books, waiting for
  the SII status, diagnosing a rejection, declaring progress, choosing the book period against the portal history,
  file names and artefacts between replicas, progress events: 5b-2.
- The export sets (110, 111, 112) and the settlement set (43): the parser types their cases but nothing issues them;
  the SII only includes them when asked, and the runner never asks.
- The exchange, the printed-samples upload and the receipts certification: 5c.
- Improvements over field behaviour (section 7).

---

## 2. Architecture decisions

### D57. 5b-1 generates and never sends

Pure functions over strings, parsed CAFs and the phase 1 and 3 types; no network, no disk, no clock other than the
injected one. Everything it returns is what 5b-2 sends, and every rule is testable offline and against the field
output.

### D58. The documents come from phase 1

`createDocument` and `issueDocument` build the documents: totals, rounding, the global discount on affected lines only,
the withholding of purchase invoices, the TED and the signature are phase 1's, already tested. 5b-1 maps each case to a
`DocumentInput`. Parity with the field output is checked at the data level (type, folio, items, discounts, totals,
references, receiver, transfer reason), not byte by byte: the field output writes unit prices with six decimals and
other formatting phase 1 does not reproduce, and the SII validates data, not formatting.

### D59. Folios come from a port

`FolioSource` is one method, `take(type)`, that returns the CAF that holds the next folio and the folio. The in-memory
allocator ports the field counters: one counter per CAF, the first CAF of the type that still has a folio wins, a folio
is never given twice, and when every CAF of the type is exhausted it throws `FOLIO_OUT_OF_RANGE`. The CAF that holds the
folio is the one that stamps it: each CAF carries its own private key, and stamping a folio with another CAF's key is a
signature error the SII rejects. 5b-2 may implement the port with the phase 4 registry.

### D60. Dates are Chile dates from the injected clock

Issue dates, reference dates and book document dates come from `chileDate(now)`. Field behaviour takes the UTC date for
the sets and the local date for the simulation, which between 21:00 and midnight in Chile issues with tomorrow's date.
The runner declares with the same dates it issued, so nothing misaligns; the Chile date is the SDK's convention since
phase 1.

### D61. The SET reference as the field writes it

Every document of a set carries, as its first reference, `TpoDocRef` `SET`, `FolioRef` `1`, `FchRef` the issue date and
`RazonRef` `CASO <case id>` (for example `CASO 4668070-1`), with no `CodRef`. The SII instructions fix only `SET` and the
`CASO` text and say the other references go from line 2; the 2009 manual's example carries `FolioRef 1`; an envelope
accepted in 2012 carried the document's own folio. The field form passed the SII review in 2026, so it stays. Notes add
the document reference on line 2: the referenced document's type, folio and date, the code derived from the set's reason
text, and that text verbatim.

### D62. Parity with field behaviour, deviations kept

Section 7 lists what the field output does that the SII documents word differently, and it stays as it is: one receiver
for every invoice (the 2003 instructions ask for different RUTs), the sales and purchase books as `MENSUAL` with no
notification folio (the instructions say `ESPECIAL` and folios 1 and 2), the placeholder counterparty of the purchase
books, `FolioRef 1`. They passed; they change only after a real certification passes with the output as it is.

### D63. Books through phase 3

`createPurchaseSalesBook`, `createGuideBook` and their signers build and sign the books; 5b-1 maps the field rules into
`BookEntryInput` and `GuideEntryInput`. The period is an input: 5b-2 chooses it against the portal history. If a field a
rule needs is missing from phase 3 (the plan checks `TpoDocRef`/`FolioDocRef` on purchase entries and the total VAT
withheld), the plan widens phase 3 the way phase 4 widened phase 2.

### D64. Root entry; the size cap goes to 64 kB

The root stands at 50.2 kB after phase 5a under a 54 kB cap, and this phase adds about ten kilobytes of rules. The cap
goes to 64 kB for both formats; issue 5 (subpath entry points) stays the place to reconsider before 0.1.0, when every
phase is in.

---

## 3. Phase 5b-1 — detailed design

### 3.1 `src/` layout

```
src/certification/set-text.ts     parseTestSetText; the grammar; detectors (document type, reference code,
                                  transfer reason, dispatch type, book document type)
src/certification/set-plan.ts     planCertificationSets; the per-set case models and folios required
src/certification/folios.ts       FolioSource, createFolioAllocator
src/certification/issue-set.ts    issueTestSet; the common rules and the four set rules
src/certification/simulation.ts   issueSimulation
src/certification/books.ts        createCertificationSalesBook, createCertificationPurchaseBook,
                                  createCertificationGuideBook
src/catalogs/certification.ts     set kinds and labels, the SII's portal names of sets and books,
                                  CERTIFICATION_COUNTERPARTY
```

Also touched: `src/index.ts`, `tests/public-api.test.ts`, `tests/types.test.ts`, `.size-limit.json`, `README.md`,
`CHANGELOG.md`, `llms.txt`, and phase 3 where D63 needs it.

### 3.2 Parser

`parseTestSetText(text: string): readonly TestSet[]`. The text is what the portal page becomes after its tags are
replaced by line breaks and its entities decoded (5b-2 does that); 5b-1 takes the plain text. Lines are trimmed; matching
is case-insensitive.

**Types**

```ts
export type TestSetKind =
  | 'basic' | 'exempt' | 'guide' | 'purchase' | 'export' | 'settlement'
  | 'salesBook' | 'purchaseBook' | 'exemptPurchaseBook' | 'guideBook' | 'other'
export type TestSet = {
  readonly name: string                     // the text after SET, trimmed
  readonly attentionNumber: string          // NUMERO DE ATENCION, digits as written
  readonly kind: TestSetKind
  readonly cases: readonly TestCase[]
  readonly bookDocuments: readonly TestBookDocument[]   // purchase-book sets only
  readonly proportionalityFactor: number | null         // FACTOR DE PROPORCIONALIDAD, purchase-book sets
}
export type TestCase = {
  readonly id: string                       // "4668070-1"
  readonly setId: string                    // "4668070"
  readonly number: number                   // 1
  readonly documentText: string             // after DOCUMENTO
  readonly documentType: number | null      // detected from documentText
  readonly items: readonly TestCaseItem[]
  readonly referenceText: string            // after REFERENCIA
  readonly referencedCase: string | null    // "4668070-1" found in referenceText
  readonly reasonText: string               // after RAZON REFERENCIA
  readonly motive: string                   // MOTIVO (guides)
  readonly transferBy: string               // TRASLADO POR (guides)
  readonly globalDiscountPercent: number | null
  readonly currency: string                 // MONEDA DE LA OPERACION
  readonly exportFields: Readonly<Record<string, string>>   // the export-only lines, by their label
  readonly raw: readonly string[]           // every line of the case after its header
}
export type TestCaseItem = {
  readonly name: string
  readonly quantity: number                 // 1 when the row has none
  readonly unitPrice?: number
  readonly unit?: string
  readonly discount?: string                // as written, e.g. "10%"
}
export type TestBookDocument = {
  readonly documentText: string             // FACTURA, FACTURA ELECTRONICA, NOTA DE CREDITO…
  readonly folio: number
  readonly observation: string | null       // the OBS line or the observation line
  readonly exemptAmount: number | null
  readonly affectedAmount: number | null
  readonly commonUseVat: boolean            // observation says IVA USO COMUN
  readonly nonRecoverableVatCode: number | null   // 4 when the observation says ENTREGA GRATUITA
  readonly totalWithholding: boolean        // observation says RETENCION TOTAL
}
```

**Grammar**, in matching order:

- Set header `^SET\s+(.+?)\s*[-:]\s*NUMERO DE ATENCI[^\d:]*[:\s]*(\d+)` (the accent of `ATENCIÓN` arrives corrupted,
  with its UTF-8 form or without it). It closes the previous set and case. The kind comes from the upper-cased name,
  first match: `LIBRO DE COMPRAS PARA EXENTOS`, `LIBRO DE COMPRAS`, `LIBRO DE VENTAS`, `LIBRO DE GUIAS`, `GUIA`, `FACTURA
  EXENTA` or `NO AFECTA`, `EXPORTACION`, `LIQUIDACION`, `FACTURA DE COMPRA` or `FACTURA COMPRA` (both spellings: the
  portal's progress page names the set `SET CASO GENERAL FACTURA COMPRA`), `BASICO`, else `other`.
- Case header `^CASO\s+(\d+)-(\d+)\s*$`: closes the previous case; `id` is `<setId>-<number>`.
- `^=+$` is ignored; `^-{20,}$` closes the current case (and book document).
- Inside a case, first match wins: `DOCUMENTO <text>`; `REFERENCIA[: ]<text>` (a `CASO n-m` inside it is the
  referenced case); `RAZON REFERENCIA <text>`; `MOTIVO[: ]<text>`; `TRASLADO POR[: ]<text>`; `DESCUENTO GLOBAL … n%`;
  `MONEDA DE LA OPERACION[: ]<text>`; the export labels (`FORMA DE PAGO EXPORTACION`, `MODALIDAD DE VENTA`,
  `CLAUSULA DE VENTA`, `TOTAL CLAUSULA DE VENTA`, `VIA DE TRANSPORTE`, `PUERTO DE EMBARQUE`, `PUERTO DE DESEMBARQUE`,
  `TIPO DE BULTO`, `TOTAL BULTOS`, `FLETE`, `SEGURO`, `PAIS RECEPTOR`, `COMISIONES EN EL EXTRANJERO`) kept as text in
  `exportFields`; an `ITEM CANTIDAD…` or `ITEM VALOR…` header is skipped; otherwise an item row.
- Item rows split on tabs or two or more spaces; a row with fewer than two parts, a colon, or starting with
  `DOCUMENTO`, `REFERENCIA` or `RAZON` is not an item. Four parts: `name qty unit price` when the third part is letters
  and has no `%`, else `name qty price discount`; three parts: `name qty price` when both numbers parse; two parts:
  `name value`, which is `quantity 1, unitPrice value` when the case's reason text contains `MODIFICA MONTO` (the reason
  line comes before the items), else `quantity value` with no price; the fallback `^(ITEM \d+|[A-Z][^0-9]+?)\s+(\d+)$`
  gives `name quantity`. Numbers are integers (`parseInt`); a zero quantity becomes 1 on four-part rows. Rows that fit
  none of these are dropped.
- Purchase-book sets, outside any case: header rows (`TIPO DOCUMENTO` with `FOLIO`, or `MONTO EXENTO` with `MONTO
  AFECTO`) are skipped. In `LIBRO DE COMPRAS`, a document line is `^(FACTURA DE COMPRA ELECTRONICA|FACTURA
  ELECTRONICA|FACTURA|NOTA DE CREDITO)\s+(\d+)$`; the observation line that follows starts with `FACTURA DEL GIRO`,
  `FACTURA CON IVA`, `NOTA DE CREDITO POR`, `ENTREGA GRATUITA` or `COMPRA CON RETENCION` and sets the flags; the amount
  line that follows is `exempt affected` (two integers) or `affected` (one). In `LIBRO DE COMPRAS PARA EXENTOS`, one
  columnar line per document, `TYPE FOLIO [EXEMPT] [AFFECTED]`, where a single amount goes to `exemptAmount` when the
  type text matches `EXENTA`, `EXENTO` or `DEBITO`, else to `affectedAmount`; `OBS: <text>` sets the observation.
  `FACTOR DE PROPORCIONALIDAD … n` anywhere in the set sets the factor.
- At the end of the text the open case, book document and set are closed.

**Detectors** (upper-cased text, first match):

- Document type: `LIQUIDACI` → 43; `FACTURA DE COMPRA` → 46; `FACTURA DE EXPORTACI` → 110; `NOTA DE CREDITO` with
  `EXPORTACION` → 112; `NOTA DE DEBITO` with `EXPORTACION` → 111; `NO AFECTA` or `EXENTA` → 34; `GUIA` → 52;
  `NOTA DE CREDITO` → 61; `NOTA DE DEBITO` → 56; `FACTURA` → 33; else null.
- Reference code from the reason text: empty → 1; `ANULA` → 1; `CORRIGE` with `GIRO` or `TEXTO` → 2; `DEVOLUCION` or
  `MODIFICA` → 3; else 1.
- Transfer reason from the motive, in this order: none → 1; `TRASLADO` with `INTERNO` or `BODEGA` → 5; `OTRO` with
  `TRASLADO` → 6; `DEVOLUCION` → 7; `CONSIGNACION` → 3; `GRATUITA` → 4; `VENTA` with `EXPORTACION` → 9; `VENTA` with
  `EFECTUAR` → 2; `VENTA` → 1; `EXPORTACION` → 8; `TRASLADO` → 5; else 1. The order matters: "otros traslados que no
  son venta" contains `VENTA`.
- Dispatch type from `TRASLADO POR`: `EMISOR` → 2 (checked first: "emisor del documento al local del cliente" holds
  both words); `CLIENTE` → 1; else none.
- Book document type: `FACTURA DE COMPRA ELECTRONICA` → 46; `FACTURA EXENTA ELECTRONICA` or `NO AFECTA` with
  `ELECTRONICA` → 34; `FACTURA ELECTRONICA` → 33; `FACTURA EXENTA` or `FACTURA NO AFECTA` → 30; exactly `FACTURA` → 30;
  `NOTA DE CREDITO` electronic → 61, else 60; `NOTA DE DEBITO` electronic → 56, else 55; else null.

The parser never throws: an unknown line is ignored, a set of unknown kind is `other`. Malformed input yields an empty
list.

### 3.3 Plan

`planCertificationSets(sets: readonly TestSet[]): CertificationPlan` keeps, per kind, the last set of that kind.

```ts
export type PlannedItem = { readonly name: string; readonly quantity: number; readonly unitPrice: number; readonly unit?: string; readonly discountPercent?: number; readonly exempt?: boolean }
export type PlannedInvoice = { readonly caseId: string; readonly items: readonly PlannedItem[]; readonly globalDiscountPercent?: number }
export type PlannedNote = { readonly caseId: string; readonly referencedCase: string | null; readonly referenceCode: 1 | 2 | 3; readonly reasonText: string; readonly items: readonly PlannedItem[]; readonly itemsFromCase: string | null }
export type PlannedGuide = { readonly caseId: string; readonly transferReason: number; readonly dispatchType?: 1 | 2; readonly items: readonly PlannedItem[] }
export type SetFolios = Readonly<Record<number, number>>   // document type → folios required
export type BasicSetPlan = { readonly kind: 'basic'; readonly attentionNumber: string; readonly invoices: readonly PlannedInvoice[]; readonly creditNotes: readonly PlannedNote[]; readonly debitNotes: readonly PlannedNote[]; readonly folios: SetFolios }
export type ExemptSetPlan = { readonly kind: 'exempt'; … same shape, invoices are 34 }
export type GuideSetPlan = { readonly kind: 'guide'; readonly attentionNumber: string; readonly guides: readonly PlannedGuide[]; readonly folios: SetFolios }
export type PurchaseSetPlan = { readonly kind: 'purchase'; readonly attentionNumber: string; readonly invoice: PlannedInvoice; readonly creditNote: PlannedNote | null; readonly debitNote: PlannedNote | null; readonly folios: SetFolios }
export type PurchaseBookPlan = { readonly kind: 'purchaseBook' | 'exemptPurchaseBook'; readonly attentionNumber: string; readonly documents: readonly TestBookDocument[]; readonly proportionalityFactor: number }
export type CertificationPlan = {
  readonly basic?: BasicSetPlan; readonly exempt?: ExemptSetPlan; readonly guide?: GuideSetPlan; readonly purchase?: PurchaseSetPlan
  readonly purchaseBook?: PurchaseBookPlan; readonly exemptPurchaseBook?: PurchaseBookPlan
}
```

Rules:

- **Basic:** cases of type 33 are invoices (`unitPrice` from the row, 0 when absent; `discountPercent` parsed from the
  `10%` text; `exempt` when the item name contains `EXENTO`; the case's global discount); 61 are credit notes and 56
  debit notes with the reference code from the reason text and the reason verbatim; a note with no items gets one item
  named after the reason with quantity 1 and price 0; a credit note whose reason contains `ANULA` takes its items from the
  referenced case (`itemsFromCase`). `folios` = `{ 33: invoices, 61: credit notes, 56: debit notes }`.
- **Exempt:** 34 are invoices with every item `exempt`, `unit` `UN` when absent; notes as in basic, every item exempt;
  `folios` = `{ 34, 61, 56 }` counts.
- **Guide:** one guide per case, `transferReason` from the motive, `dispatchType` from `TRASLADO POR` when found;
  `folios` = `{ 52: cases }`.
- **Purchase:** the last 46 case is the invoice, the last 61 the credit note, the last 56 the debit note; a debit note
  copies the credit note's items when it has none; `folios` = one per present type.
- **Purchase books:** the documents and the factor, 0.6 when the set gives none.
- The sales book and the guide book have no plan entries: they come from the issued basic and guide sets (3.7).

### 3.4 Folios

```ts
export type FolioSource = { readonly take: (type: DocumentType) => Promise<{ readonly caf: Caf; readonly folio: number }> }
export const createFolioAllocator = (cafs: readonly Caf[], options?: { readonly usedFolios?: readonly { type: number; folio: number }[] }): FolioSource
```

The allocator keeps one counter per CAF, starting at the CAF's first folio or after the highest used folio given for
that CAF's range; `take(type)` walks the CAFs of that type in the order given and returns the first folio not yet taken,
with that CAF; when none remains it throws `FOLIO_OUT_OF_RANGE` with `{ type }`. A CAF of another type is never used.
`take` is asynchronous so 5b-2 can implement the port with the phase 4 registry.

### 3.5 Issuing a set

```ts
export type IssueSetOptions = {
  readonly issuer: IssuerInput               // RUT, name, activity, activity code, address, commune, city
  readonly receiver: ReceiverInput           // the customer every document names (purchase invoices ignore it, 3.5.4)
  readonly certificate: Certificate
  readonly folios: FolioSource
  readonly resolution: { readonly number: number; readonly date: string }   // 0 and the certification date
  readonly now?: () => Date
}
export type IssuedCase = { readonly caseId: string; readonly type: DocumentType; readonly folio: number; readonly document: SignedDocument }
export type IssuedSet = { readonly kind: 'basic' | 'exempt' | 'guide' | 'purchase'; readonly attentionNumber: string; readonly cases: readonly IssuedCase[]; readonly envelope: SignedEnvelope }
export const issueTestSet = (plan: BasicSetPlan | ExemptSetPlan | GuideSetPlan | PurchaseSetPlan, options: IssueSetOptions): Promise<IssuedSet>
```

**Common rules.**

- Documents are issued in the order: every invoice (or guide) in case order, then every credit note, then every debit
  note. A note's referenced case must already be issued (an invoice or a credit note, never a debit note); otherwise
  `MISSING_FIELD` with `{ field: 'referencedCase', caseId }`.
- Each document: `issueDate` = `chileDate(now)`; `issuer` as given; `receiver` as given (purchase invoices and internal
  transfers excepted); first reference `{ documentType: 'SET', folio: 1, date: issueDate, reason: 'CASO <caseId>' }`;
  notes add `{ documentType, folio, date }` of the referenced document, `code` = the plan's reference code, `reason` =
  the set's reason text verbatim.
- Items map to phase 1 line items: name, quantity, unit when given, `unitPrice`, `discountPercent`, `exempt`. A line
  whose price is 0 or absent has no price and amount 0 (phase 1 omits `PrcItem` for it as the field does).
- Invoices of the basic set carry `options.saleTransactionType` 1 (`TpoTranVenta`), and a global discount
  `{ kind: 'discount', valueType: 'percent', value, description: 'DESCUENTO GLOBAL ITEMES AFECTOS' }`; phase 1 applies it
  to affected lines only, as the field does.
- The envelope: `createEnvelope` with `kind` `dte`, cover `{ issuerRut, senderRut: certificate RUT, receiverRut:
  '60803000-K', resolutionDate, resolutionNumber, setId: 'DTE_SetDoc' }`, then `signEnvelope`.

**3.5.1 Basic set (33, 61, 56).**

- Credit notes: items are `itemsFromCase` (the referenced case's items, for `ANULA`) or the note's own; with reference
  code 3, an item with no price whose name equals an item of the referenced document takes that item's price and
  discount; with no items left, one line `SIN MONTO`, quantity 1, price 0. No global discount on notes.
- Debit notes: the note's own items, or `SIN MONTO`.
- A note that corrects text (code 2) has one line named after the reason and total 0.

**3.5.2 Exempt set (34, 61, 56).** Every line exempt. Credit note items by code and reason: code 2 → one line
`reason text` or `CORRECCION`, price 0; code 3 with `DEVOLUCION` → all items of the referenced document with their
quantities; code 3 with `MODIFICA MONTO` → for each note item, the original item of the same name (upper-cased,
trimmed) with the original quantity and the note's new price, else the note item; code 1 → the referenced document's
items; otherwise the note's own items or the referenced document's. Debit notes: no items → the referenced document's
items or the `CORRECCION` line; code 3 with `MODIFICA MONTO` → the same mapping; otherwise the note's own items.

**3.5.3 Guide set (52).** One guide per case with `options.transferType` and `options.dispatchType`. Every line carries
its quantity, unit `UN` by default, and a price only when it has one. An internal transfer (reason 5) names the issuer
as receiver and has total 0. Guides carry the SET reference only.

**3.5.4 Purchase set (46, 61, 56).** The issuer is also the receiver of every document of this set. Every line is priced
(`unit` `UN` by default) and carries additional tax code 15; phase 1 computes the withholding (`ImptoReten` type 15 at
the VAT rate) and the total as net plus exempt. Credit note items: the note's own, a missing price taken from the
original item of the same name, else 0. Debit note: its own items with the same lookup, else the referenced document's
items.

### 3.6 Simulation

```ts
export const issueSimulation = (plan: CertificationPlan, options: IssueSetOptions): Promise<IssuedSimulation>
export type IssuedSimulation = { readonly cases: readonly IssuedCase[]; readonly envelope: SignedEnvelope; readonly types: readonly DocumentType[] }
```

Every case of the four set plans issued again, in the order basic (33, 61, 56), exempt (34, 61, 56), guide, purchase
(46, 61, 56), with fresh folios from `options.folios` (5b-2 passes CAFs other than the sets'), in one envelope with the
same cover as a set but the set id phase 1 generates. Differences from the sets, as in the field: no SET reference; a note carries one reference, line 1, to its referenced document when the
referenced case is in the simulation; the global discount has no description; a purchase note item with no price takes
the original's price or 1; the receiver is the issuer for purchase documents and internal transfers. With fewer than ten
documents the result carries `fewerThanRecommended: true` (the SII asks for at least ten).

### 3.7 Books

```ts
type BookInput = { readonly period: string; readonly issuerRut: string; readonly senderRut: string; readonly resolution: { readonly number: number; readonly date: string } }
export const createCertificationSalesBook = (set: IssuedSet, input: BookInput & { readonly receiver: { readonly rut: string; readonly name: string }; readonly creditNoteSign?: 'positive' | 'negative' }): SignedPurchaseSalesBook
export const createCertificationPurchaseBook = (plan: PurchaseBookPlan, input: BookInput): SignedPurchaseSalesBook
export const createCertificationGuideBook = (set: IssuedSet, input: BookInput & { readonly receiver: { readonly rut: string; readonly name: string }; readonly notificationFolio?: number; readonly caseFlags?: readonly ('normal' | 'modified' | 'voided')[] }): SignedGuideBook
```

- **Sales book:** only the basic set's documents (33, 61, 56): `type`, `folio`, `date` = `<period>-15`, counterparty =
  the receiver, exempt, net, VAT and total from the document's totals (0 when absent), `taxRate` 19 always. Credit
  notes are negative only with `creditNoteSign` `'negative'`. Cover: operation sale, book `MENSUAL`, submission `TOTAL`.
- **Purchase books:** one entry per parsed book document: `type` from the book document type detector (in the exempt
  book a paper `FACTURA` with an exempt amount and no affected amount becomes 32); counterparty
  `CERTIFICATION_COUNTERPARTY` (`60803000-K`, `Razon Social`); `date` `<period>-15`; `exemptAmount`; `netAmount` =
  affected and `vatAmount` = round(affected × 19 %); common-use VAT → `commonUseVat` = that VAT, `taxRate` 0, `vatAmount`
  0; free delivery → `nonRecoverableVat` `[{ code: 4, amount }]`, `taxRate` 0, `vatAmount` 0; total withholding on a 46 →
  `otherTaxes` `[{ code: 15, rate: 19, amount: vat }]` and total VAT withheld = vat; a note (55, 56, 60, 61) with an
  observation references the folio at the end of the observation and the type named in it (`FACTURA EXENTA
  ELECTRONICA` 34, `FACTURA EXENTA` 32 in the exempt book or 30, `FACTURA` with `ELECTRONICA` 33, `FACTURA` 30, none
  otherwise). Exempt book: a non-46 document with an affected amount gets `nonRecoverableVat` `[{ code: 1, amount:
  vat }]` and `vatAmount` 0; a purely exempt 32 carries only the exempt amount and the total; other purely exempt
  documents carry `taxRate` 19, net 0, VAT 0; a note with no amounts inherits the exempt, net and non-recoverable VAT of
  the entry whose folio it references. Totals: net + VAT + exempt (+ non-recoverable VAT in the exempt book); a 46 with
  total withholding totals its net. `proportionalityFactor` goes to the book. Cover: operation purchase, `MENSUAL`,
  `TOTAL`.
- **Guide book:** only the guide set's documents: `folio`, `transferType` = the guide's transfer reason, `date` = the
  guide's issue date. By position, as the field does: the second entry carries `Operacion` 1 although the submission is
  `TOTAL`, the third is voided as a guide (`Anulado` 2: total 0 and nothing else), the rest are normal, unless
  `caseFlags` says otherwise. A sale (reason 1) carries the receiver, the net, `taxRate` 19 and the VAT; every entry
  carries the total. `notificationFolio` 3 by default. Cover: book `ESPECIAL`, submission `TOTAL`. Phase 3 emits
  `Operacion` only on adjustment submissions today; D63 widens it so a `TOTAL` entry may carry it.

### 3.8 Errors

- `MISSING_FIELD` `{ field: 'referencedCase', caseId }` when a note references a case not issued before it, or
  `{ field: 'invoices', kind }` when a set plan has no invoice (or no guide) to issue.
- `FOLIO_OUT_OF_RANGE` `{ type }` from the allocator when the CAFs of a type are exhausted.
- Phase 1 and 3 codes pass through (`INVALID_RUT`, `FIELD_TOO_LONG`, `CAF_TYPE_MISMATCH`, `CAF_EXPIRED`, …): a set
  item name longer than 80 characters is the SII's text, so the caller sees `FIELD_TOO_LONG` rather than a silent cut.
- The parser never throws.

### 3.9 Public API additions

Runtime exports added to the root and to `RUNTIME_EXPORTS`:

- **Parser and plan:** `parseTestSetText`, `planCertificationSets`.
- **Folios:** `createFolioAllocator`.
- **Issuing:** `issueTestSet`, `issueSimulation`.
- **Books:** `createCertificationSalesBook`, `createCertificationPurchaseBook`, `createCertificationGuideBook`.
- **Catalog:** `TEST_SET_KINDS`, `CERTIFICATION_COUNTERPARTY`.

Types: `TestSet`, `TestSetKind`, `TestCase`, `TestCaseItem`, `TestBookDocument`, `CertificationPlan`, `BasicSetPlan`,
`ExemptSetPlan`, `GuideSetPlan`, `PurchaseSetPlan`, `PurchaseBookPlan`, `PlannedInvoice`, `PlannedNote`, `PlannedGuide`,
`PlannedItem`, `SetFolios`, `FolioSource`, `IssueSetOptions`, `IssuedCase`, `IssuedSet`, `IssuedSimulation`, and the
input types of the three book functions.

### 3.10 Typical flows

```ts
const sets = parseTestSetText(setText)                 // the text 5b-2 downloaded, or a file
const plan = planCertificationSets(sets)
const folios = createFolioAllocator(cafs)              // one or several CAFs per type
const options = { issuer, receiver, certificate, folios, resolution: { number: 0, date: '2026-11-01' } }

const basic = await issueTestSet(plan.basic!, options)
const guide = await issueTestSet(plan.guide!, options)
// … 5b-2 uploads basic.envelope.xml with uploadEnvelope and declares its track id

const sales = createCertificationSalesBook(basic, { period: '2026-11', issuerRut, senderRut, resolution, receiver })
const purchases = createCertificationPurchaseBook(plan.purchaseBook!, { period: '2026-11', issuerRut, senderRut, resolution })
const guides = createCertificationGuideBook(guide, { period: '2026-11', issuerRut, senderRut, resolution, receiver })

const simulation = await issueSimulation(plan, { ...options, folios: createFolioAllocator(freshCafs) })
```

### 3.11 Tests

- **Set texts:** synthetic texts in `tests/support/test-set-samples.ts`, written from the grammar of 3.2 and invented
  data: a basic set with four invoices (a priced row with a unit, a discounted row, an `EXENTO` item, a global
  discount), three credit notes (`ANULA`, `DEVOLUCION DE MERCADERIAS`, `CORRIGE GIRO`), one debit note (`MODIFICA
  MONTO`); an exempt set; a guide set with `VENTA`, `TRASLADO DE MATERIALES ENTRE BODEGAS` and `EMISOR DEL DOCUMENTO AL
  LOCAL DEL CLIENTE`; a purchase set under both spellings; the two purchase-book sets with every observation kind; the
  corrupted and the plain `ATENCION` header; `=` and `-` separators; an export set that must come out as `export` and be
  ignored by the plan; junk lines. Every parser rule and detector is table-driven.
- **Plan:** folios per type, the `itemsFromCase` of an `ANULA` note, the purchase set keeping the last of each kind
  and copying the credit note's items into the debit note, the exempt flag on `EXENTO` items.
- **Issuing:** with the fixture certificate and CAFs (one per type, plus two split CAFs of type 33 to prove the
  allocator walks CAFs): the order of documents, the SET reference on every document and the second reference on notes
  with the code and the verbatim reason, the receiver rules (issuer on purchase documents and internal transfers), the
  item resolution of every note case, the global discount description, `TpoTranVenta` on basic invoices only, the
  purchase invoice's withholding and total, the guide's transfer reason and dispatch type, the cover (`60803000-K`,
  `DTE_SetDoc`), and that every document verifies (`verifyDocumentSignature`, `verifyTed`) and every envelope verifies.
- **Simulation:** one envelope, every case, fresh folios, no SET reference, single references on notes, the
  `fewerThanRecommended` flag.
- **Books:** every entry rule of 3.7 with the synthetic purchase-book sets; the sums; the sign of credit notes; the
  guide flags by position; and every book validates against the XSDs of `tests/fixtures/xsd` (`LibroCV_v10.xsd`,
  `LibroGuia_v10.xsd`) with `xmllint-wasm`, as phase 3 does.
- **Allocator:** two CAFs of one type, exhaustion → `FOLIO_OUT_OF_RANGE`, `usedFolios` skipping, a CAF of another type
  never used.
- **Properties (fast-check):** the parser accepts any text without throwing and keeps the case ids it finds; the
  allocator never returns a folio twice; issuing with random item quantities and prices keeps every document's total
  consistent with phase 1's `calculateTotals`.
- **Differential (private, not in the repository):** a harness in the shared notes folder runs the field
  implementation of the four sets, the simulation and the books over the same synthetic set text with a fixed clock and
  a fake sender, and compares, per document, type, folio, items (name, quantity, price, discount, exempt), global
  discount, totals, references, receiver RUT and transfer reason, and per book every entry and total. Formatting
  differences (six-decimal prices, element presence for zero amounts) are normalised. The spec's section 6 records the
  result when the plan's code runs.
- Coverage stays at 100 % on the four metrics.

### 3.12 Build, size and docs

- `.size-limit.json`: both limits to 64 kB (D64); the plan records the measured sizes.
- No new dependency.
- `README.md`: a "Certification: test sets, simulation and books" section with the flow of 3.10 and the note that
  sending and declaring belong to the runner; `CHANGELOG.md` entry under `Unreleased`; `llms.txt` paragraph.

---

## 4. Glossary additions (public contract)

| Term | Meaning |
|---|---|
| Test set (set de pruebas) | The text the SII generates for an applicant with the cases its documents must reproduce; the SII reviews the envelopes against the last set downloaded |
| Case (caso) | One document of the set, numbered `<attention number>-<n>`; every document carries `CASO <id>` as its SET reference |
| Attention number (número de atención) | The number the SII assigns to the set; prefix of every case id |
| SET reference | The first reference of every document of a set: `TpoDocRef SET`, `RazonRef CASO <id>` |
| Simulation (simulación) | One envelope with representative documents of every type, at least ten, that the SII reviews after the sets |
| Purchase-book set (set libro de compras) | The documents the SII hands the applicant to build the purchase book; the counterparty is a placeholder |
| Folio source | The port that hands out the next folio and the CAF that stamps it |

---

## 5. Decisions reviewed with Hans

| # | Decision | Outcome |
|---|---|---|
| 1 | 5b in two specs and two pull requests: 5b-1 sets, simulation and books; 5b-2 declarations and runner | Hans's, 2026-11-04 |
| 2 | 5b-1 only generates; sending, waiting, diagnosing and declaring belong to 5b-2 (D57) | Recommended, accepted by Hans, 2026-11-04 |
| 3 | No real set text exists (Hans has none, the public sources have none); the grammar is the field one and stays unmeasured until the first download (section 6) | Hans confirmed he has none, 2026-11-04 |
| 4 | Section 1 (layout, inputs, outputs, phase 1 documents, Chile dates) | Presented in chat; Hans asked to advance on every front, so the rest was written for his review of this file |
| 5 | The size cap to 64 kB (D64) instead of a subpath entry | Proposed here; Hans decides on the file |

---

## 6. What is measured and what is not

**From public SII documents:**

- The 2003 instructions: one DTE per case; folios requested per type first; the receiver "un cliente existente"
  with different RUTs per invoice; the issue date is the day's; item names exactly as the case says, with accents, no
  extra lines, quantities and prices as given; a credit note for returned goods uses the original invoice's price; a
  credit note for a price difference applies the difference to every unit; the first reference is `SET` with `CASO
  xxxxx-x`, the others from line 2; the envelope cover names the SII (`60803000-K`) as receiver and the resolution of
  the certification environment; a document accepted with observations must be re-sent with another folio; the sales
  book carries only the set's invoices and notes, one tax period for all, `ESPECIAL`, `TOTAL`, notification folio 1;
  the purchase book carries the purchase-book set, same period, notification folio 2, with valid RUTs for the issuers.
- The 2009 manual: the sets are evaluated against the last set downloaded; envelopes must arrive within two months of
  the download; the simulation holds the documents of the last two months, at most 100 and at least 10; its example
  SET reference carries `FolioRef 1` and `CodRef 1`.

**Field behaviour known to pass the SII review (the rules of section 3):** the counts of folios per set, the
receiver rules, the note item resolution, the purchase invoice's withholding, the guide's internal transfer, the
simulation without SET references, the three books as described.

**Not measured:**

- The set text itself: no sample exists in any source found; the grammar is the one that parses the field downloads.
  5b-2 keeps the downloaded text as an artefact so the first real run turns it into a fixture of this phase.
- The SII's acceptance of envelopes and books built by this phase: it needs the company enrolled and 5b-2.
- The differential result of 3.11: recorded when the plan's code runs.

---

## 7. Deferred improvements and known limits

Kept as the field does them (D62), to be reconsidered after a real certification passes:

1. **Receivers.** One receiver for every invoice, although the 2003 instructions ask for different RUTs per invoice.
2. **Sales and purchase books.** `MENSUAL` with no notification folio, where the 2003 instructions say `ESPECIAL`
   with folios 1 and 2.
3. **Purchase-book counterparty.** The placeholder `60803000-K` / `Razon Social` on every entry, where the instructions
   ask for valid issuer RUTs; it passed, and it carries no personal data.
4. **`FolioRef 1`** on the SET reference (an accepted 2012 envelope used the document's own folio).
5. **Exempt set totals.** Every line exempt, no `TasaIVA`, as the field does; the SII instructions say nothing.
6. **Parser tolerance.** Rows the grammar does not recognise are dropped silently; a set of unknown kind is `other`.
   The first real download decides whether the grammar needs widening.
7. **Export and settlement sets** are parsed and never issued.

---

## Appendix A. Facts from the SII documents used

- "Instrucciones para la construcción de documentos tributarios electrónicos con los datos del set de pruebas"
  (sii.cl, 2003): sections I (document construction), II (envelope), III (sales book, IEV), IV (purchase book, IEC).
- "Manual para empresas usuarias, ambiente de certificación factura electrónica" (sii.cl, February 2009): the six steps
  of the certification (test set, simulation, exchange, printed samples, declaration of compliance, authorization), the
  two-month validity of a set, the simulation sizes, and an example DTE of a test set with its SET reference.
