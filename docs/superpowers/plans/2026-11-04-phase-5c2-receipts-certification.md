# Phase 5c-2 — certification: the receipts track: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The certification of electronic receipts (types 39 and 41), an application of its own on the SII's receipts portal, as the pieces the field has: the receipts test set parsed, its receipts issued and their envelope signed, the envelope sent with the folio consumption report after it, and the five operations of the receipts portal (the set, the track id, the status, the declaration of compliance, the verification). No runner: the caller chains the pieces.

**Architecture:** Free functions over `readonly` data, exported by `dte-sdk/portal`. `src/certification/receipts-set.ts` parses the set text; `src/certification/receipts.ts` issues one receipt per case through phase 1 and signs the `EnvioBOLETA`; `src/certification/receipts-send.ts` uploads it through phase 2 and sends the folio consumption report of phase 3 with the field's waits and retries. `src/portal/pages/receipts-certification.ts` reads the receipts portal's answers and writes the declaration body; `src/portal/receipts-certification.ts` holds the five operations on the phase 4 session, with the phase 5c-1 GWT-RPC codec. Phase 1 gains the reference of a receipt, which the receipts schema defines on its own and the set needs.

**Tech Stack:** TypeScript 5.9 (strict), Node ≥ 22.12, Jest 30 + ts-jest, expect-type, xmllint-wasm (tests), ESLint 9 + Prettier, esbuild, size-limit. No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-04-phase-5c2-receipts-certification-design.md` (section 2 holds the decisions D87–D96, section 3 the rules and the API, section 6 what is and is not measured, section 7 what is deferred on purpose and the field defects not reproduced).

---

## This plan's code has already run

This plan was generated from a throwaway branch cut from `canary` at `ec84774` (with phase 5c-1 merged), where the code was written and made to pass, with one commit per task. On that branch each task was checked in order: its tests alone fail on the previous commit, and with the task applied `tsc` compiles and the tests pass. At the tip, on 2026-11-04: Prettier, ESLint, `tsc`, 2 394 tests with coverage at 100 % on the four metrics, build, size (`dte-sdk/portal` 66.68 kB against 68 kB, `dte-sdk` 30.31 kB against 32 kB, `dte-sdk/pdf` 8.45 kB, `dte-sdk/node` 4.19 kB) and scan all pass.

So copy the code as it is. If a test fails, something around it changed since then, such as `canary`: investigate that before changing the code.

**Nothing here has met the receipts portal.** Every wire, wording and rule reproduces field behaviour known to carry a company through the certification of receipts; none of it has been seen by this SDK, because no company at hand is enrolled in the receipts application (spec section 6), and the set text of the tests is synthetic. What is checked against official sources: the receipts envelope and the folio consumption report validate against the SII's schemas, which are in the fixtures.

## Conventions that apply to EVERY task

1. **Branch:** work on a branch cut from `canary`. Commands run from the repository root. Run `npm ci` first.
2. **Commits:** one per task, with the message given, in English, with a prose body saying why, ending with the `Co-Authored-By` line your session prescribes.
3. **Diffs:** a modified file comes as a unified diff, relative to the repository root. Save it to a temporary file outside the repository and run `git apply <file>`. A new file comes whole.
4. **Bilingual JSDoc is mandatory** on every exported symbol and every type field, one `EN:` line and one `ES:` line, the `ES:` naming the SII tag. The code below already has it.
5. **No classes** (only `DteError`). `readonly` types everywhere. No module-level state; the counters of a loop live in its closure.
6. **No PII in error messages:** values go in `details`, never in `message`.
7. **Coverage** reaches 100 % at Task 7; before that it dips, which is why the per-task commands use `--coverage=false`. The suites that issue and sign receipts take about twenty seconds each.
8. **No real data:** fixture RUTs come from the allow-list in `scripts/scan-real-data.mjs`, the pages, texts and names are invented, and `npm run scan` checks it.
9. **Nothing public names any other project:** not code, comments, tests, fixtures, commits or the pull request. Describe the SII behaviour directly.
10. **Nothing in this plan calls the SII,** and the default test run never does.
11. **You own the pull request.** The session that runs this plan is the sole owner of its PR and of every review note or post-merge follow-up on it. Run `gh pr list` before opening anything.

## File map

```
src/model/document.ts                             (modify) task 1   ReceiptReferenceInput, ReceiptReference, the two fields
src/model/sii.ts                                  (modify) task 1   SiiReferenciaBoleta
src/model/codec.ts                                (modify) task 1   receipts write and read their own Referencia
src/document/create.ts                            (modify) task 1   receiptReferences normalised; the two refusals
src/index.ts                                      (modify) task 1   the three types
tests/fixtures/xsd/EnvioBOLETA_v11.xsd            (create) task 1   the official receipts schema
tests/support/xsd.ts                              (modify) task 1   the schema entry
tests/receipt-reference.test.ts                   (create) task 1
src/certification/receipts-set.ts                 (create) task 2   parseReceiptsTestSet
tests/support/receipts-set-samples.ts             (create) task 2   a synthetic set text
tests/certification/receipts-set.test.ts          (create) task 2
src/certification/receipts.ts                     (create) task 3   issueReceiptsSet
tests/certification/receipts-issue.test.ts        (create) task 3
src/certification/receipts-send.ts                (create) task 4   sendReceiptsSet, resendReceiptsConsumption
tests/certification/receipts-send.test.ts         (create) task 4
src/portal/pages/receipts-certification.ts        (create) task 5   the receipts portal's answers, the declaration body
src/portal/gwt.ts                                 (modify) task 5   a null that names its declared type
src/model/rut.ts                                  (modify) task 5   siiRutOfBody
src/catalogs/certification.ts                     (modify) task 5   RECEIPTS_PORTAL
src/catalogs/portal.ts                            (modify) task 5   three rejections
src/portal/pages/certification-progress.ts        (modify) task 5   the receipts row
src/portal/certification.ts                       (modify) task 5   ProgressReport.receipts
tests/portal/pages-receipts-certification.test.ts (create) task 5
tests/portal/gwt.test.ts, pages-certification-progress.test.ts, tests/rut.test.ts (modify) task 5
src/portal/receipts-certification.ts              (create) task 6   the five operations
tests/portal/receipts-certification.test.ts       (create) task 6
src/portal/index.ts                               (modify) task 7
tests/public-api.test.ts, tests/types.test.ts, tests/dist.smoke.test.ts (modify) task 7
.size-limit.json                                  (modify) task 7   dte-sdk/portal 68 kB
README.md / CHANGELOG.md / llms.txt               (modify) task 7
```

---

## Task 1: The reference of a receipt (phase 1)

The receipts schema gives `Referencia` its own shape (spec D91, 3.2): `NroLinRef`, then optional `TpoDocRef`, `FolioRef`, `CodRef` (free text) and `RazonRef`; no date. Phase 1 wrote the invoice shape on every document, so a receipt with a reference failed the schema. `DocumentInput` and `Document` gain `receiptReferences`; `createDocument` normalises them with the schema limits and refuses `references` on a receipt and `receiptReferences` on any other type; the codec writes and reads the receipts shape. The official `EnvioBOLETA_v11.xsd` joins the fixtures and a receipts envelope validates against it.

**Files:**

- Modify: `src/model/document.ts`
- Modify: `src/model/sii.ts`
- Modify: `src/model/codec.ts`
- Modify: `src/document/create.ts`
- Modify: `src/index.ts`
- Test (create): `tests/receipt-reference.test.ts`
- Test (create): `tests/fixtures/xsd/EnvioBOLETA_v11.xsd`
- Test (modify): `tests/support/xsd.ts`

- [ ] **Step 1: Write the failing tests**

`tests/receipt-reference.test.ts` (new file, whole):

```ts
import { createDocument } from '../src/document/create'
import { DteError } from '../src/errors'
import { fromSiiDocument, toSiiDocument } from '../src/model/codec'
import type { DocumentInput } from '../src/model/document'
import { envelopeXml, issue, issuer, receiver } from './support/printed-fixtures'
import { validateAgainstXsd } from './support/xsd'

const receipt = (extra: Partial<DocumentInput> = {}): DocumentInput => ({
  type: 39,
  folio: 11,
  issueDate: '2026-11-15',
  issuer,
  items: [{ name: 'Café', quantity: 2, unitPrice: 1500 }],
  pricesIncludeVat: true,
  ...extra,
})
const SET_REFERENCE = { code: 'SET', reason: 'CASO-1' }
const codeOf = (work: () => unknown): { code: string; details: unknown } => {
  try {
    work()
  } catch (error) {
    return { code: (error as DteError).code, details: (error as DteError).details }
  }
  throw new Error('expected a throw')
}

describe('the reference of a receipt', () => {
  test('is normalised with its line number, its texts sanitized and its numbers as text', () => {
    const document = createDocument(
      receipt({ receiptReferences: [SET_REFERENCE, { documentType: 39, folio: 7, code: ' CAJA "2" ', reason: '' }] }),
    )
    expect(document.receiptReferences).toEqual([
      { lineNumber: 1, code: 'SET', reason: 'CASO-1' },
      { lineNumber: 2, documentType: '39', folio: '7', code: 'CAJA 2' },
    ])
    expect(document.references).toEqual([])
    expect(createDocument(receipt()).receiptReferences).toEqual([])
  })

  test('is written in the order of the receipts schema, without a date, and read back', () => {
    const document = createDocument(
      receipt({ receiptReferences: [{ documentType: 39, folio: 7, code: 'SET', reason: 'CASO-1' }] }),
    )
    const sii = toSiiDocument(document)
    expect(sii.Referencia).toEqual([
      { NroLinRef: 1, TpoDocRef: '39', FolioRef: '7', CodRef: 'SET', RazonRef: 'CASO-1' },
    ])
    expect(Object.keys(sii.Referencia![0])).toEqual(['NroLinRef', 'TpoDocRef', 'FolioRef', 'CodRef', 'RazonRef'])
    expect(fromSiiDocument(sii)).toEqual(document)
    const bare = { ...sii, Referencia: [{ NroLinRef: 1, RazonRef: 'solo la razón' }] }
    expect(fromSiiDocument(bare).receiptReferences).toEqual([{ lineNumber: 1, reason: 'solo la razón' }])
    expect(fromSiiDocument({ ...sii, Referencia: undefined }).receiptReferences).toEqual([])
  })

  test('each kind of document takes its own kind of reference, and the schema limits hold', () => {
    const invoiceReference = { documentType: 33, folio: 7, date: '2026-11-15' }
    expect(codeOf(() => createDocument(receipt({ references: [invoiceReference] })))).toEqual({
      code: 'INVALID_OPTION',
      details: { field: 'references' },
    })
    const invoice: DocumentInput = {
      type: 33,
      folio: 7,
      issuer,
      receiver,
      items: [{ name: 'Licencia', unitPrice: 1000 }],
    }
    expect(codeOf(() => createDocument({ ...invoice, receiptReferences: [SET_REFERENCE] }))).toEqual({
      code: 'INVALID_OPTION',
      details: { field: 'receiptReferences' },
    })
    expect(
      createDocument({ ...invoice, references: [invoiceReference], receiptReferences: [] }).receiptReferences,
    ).toEqual([])
    expect(codeOf(() => createDocument(receipt({ receiptReferences: [{ code: 'X'.repeat(19) }] }))).code).toBe(
      'FIELD_TOO_LONG',
    )
    expect(codeOf(() => createDocument(receipt({ receiptReferences: [{ documentType: 1234 }] }))).code).toBe(
      'FIELD_TOO_LONG',
    )
  })

  test('a receipts envelope validates against the official schema, with and without a reference', async () => {
    const plain = envelopeXml([issue(receipt())], 'receipt')
    await expect(validateAgainstXsd(plain, 'EnvioBOLETA')).resolves.toEqual([])
    const referenced = envelopeXml([issue(receipt({ receiptReferences: [SET_REFERENCE] }))], 'receipt')
    expect(referenced).toContain(
      '<Referencia><NroLinRef>1</NroLinRef><CodRef>SET</CodRef><RazonRef>CASO-1</RazonRef></Referencia>',
    )
    await expect(validateAgainstXsd(referenced, 'EnvioBOLETA')).resolves.toEqual([])
  })
})
```

`tests/fixtures/xsd/EnvioBOLETA_v11.xsd` (new file, an official SII schema, not reproduced here): download `schema_envio_bol.zip` from the SII page "Formato XML de documentos electrónicos" (`https://www.sii.cl/servicios_online/3532-formato_xml-3811.html`, the file lives under `https://www.sii.cl/factura_electronica/factura_mercado/`), extract `EnvioBOLETA_v11.xsd` and save it as `tests/fixtures/xsd/EnvioBOLETA_v11.xsd` byte for byte (ISO-8859-1, CRLF line ends, 57115 bytes, SHA-256 `e0fbbaf70b0ac8ea2c0ac2310edac41bdd3773cef20fccf6d97e5b92ebeedaa9`). The `xmldsignature_v10.xsd` it imports is already in the fixtures.

`tests/support/xsd.ts` (save the diff and run `git apply`; a line that looks empty inside a hunk is a context line):

```diff
diff --git a/tests/support/xsd.ts b/tests/support/xsd.ts
index b69870c..3edc395 100644
--- a/tests/support/xsd.ts
+++ b/tests/support/xsd.ts
@@ -12,6 +12,7 @@ const SCHEMAS = {
   LibroGuia: { main: 'LibroGuia_v10.xsd', imports: ['xmldsignature_v10.xsd'] },
   ConsumoFolio: { main: 'ConsumoFolio_v10.xsd', imports: ['SiiTypes_v10.xsd', 'xmldsignature_v10.xsd'] },
   RespuestaEnvioDTE: { main: 'RespuestaEnvioDTE_v10.xsd', imports: ['SiiTypes_v10.xsd', 'xmldsignature_v10.xsd'] },
+  EnvioBOLETA: { main: 'EnvioBOLETA_v11.xsd', imports: ['xmldsignature_v10.xsd'] },
   EnvioRecibos: {
     main: 'EnvioRecibos_v10.xsd',
     imports: ['Recibos_v10.xsd', 'SiiTypes_v10.xsd', 'xmldsignature_v10.xsd'],
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/receipt-reference --coverage=false
```

Expected: FAIL: the test does not compile (`receiptReferences` is not a property of `DocumentInput`).

- [ ] **Step 3: Write the implementation**

`src/model/document.ts` (save the diff and run `git apply`; a line that looks empty inside a hunk is a context line):

```diff
diff --git a/src/model/document.ts b/src/model/document.ts
index a48b330..b5363fc 100644
--- a/src/model/document.ts
+++ b/src/model/document.ts
@@ -279,6 +279,40 @@ export type Reference = {
   readonly reason?: string
 }
 
+/**
+ * EN: Reference on a receipt (39, 41) as the caller provides it. The receipts schema gives `Referencia` its own
+ * shape: no date, and a code that is the company's own text.
+ * ES: `Referencia` de una boleta (39, 41) tal como la entrega el llamador. El esquema de boletas le da a `Referencia`
+ * su propia forma: sin fecha, y con un código que es texto propio de la empresa.
+ */
+export type ReceiptReferenceInput = {
+  /** EN: The company's own reference code (max 18); `SET` in the certification test set. ES: `CodRef` — Código interno del tipo de referencia, máximo 18; `SET` en el set de pruebas de certificación. */
+  readonly code?: string
+  /** EN: Reason (max 90). ES: `RazonRef` — Razón de la referencia, máximo 90. */
+  readonly reason?: string
+  /** EN: Referenced document type (max 3). ES: `TpoDocRef` — Tipo del documento referenciado, máximo 3. */
+  readonly documentType?: number | string
+  /** EN: Referenced folio (max 18). ES: `FolioRef` — Folio del documento referenciado, máximo 18. */
+  readonly folio?: number | string
+}
+
+/**
+ * EN: Normalized reference of a receipt.
+ * ES: `Referencia` de una boleta, normalizada.
+ */
+export type ReceiptReference = {
+  /** EN: 1-based line number. ES: `NroLinRef` — Número de línea, desde 1. */
+  readonly lineNumber: number
+  /** EN: Referenced document type. ES: `TpoDocRef` — Tipo del documento referenciado. */
+  readonly documentType?: string
+  /** EN: Referenced folio. ES: `FolioRef` — Folio referenciado. */
+  readonly folio?: string
+  /** EN: The company's own reference code. ES: `CodRef` — Código interno del tipo de referencia. */
+  readonly code?: string
+  /** EN: Reason. ES: `RazonRef` — Razón. */
+  readonly reason?: string
+}
+
 /**
  * EN: Global discount or surcharge as the caller provides it (`DscRcgGlobal`).
  * ES: `DscRcgGlobal` — Descuento o recargo global tal como lo entrega el llamador.
@@ -489,6 +523,8 @@ export type Document = {
   readonly subtotals: readonly SubtotalInfo[]
   readonly globalAdjustments: readonly GlobalAdjustment[]
   readonly references: readonly Reference[]
+  /** EN: References of a receipt (39, 41), which has its own shape; empty on every other type. ES: `Referencia` — Referencias de una boleta (39, 41), que tiene forma propia; vacío en los demás tipos. */
+  readonly receiptReferences: readonly ReceiptReference[]
   /** EN: Commission lines (settlement invoices only). ES: `Comisiones` — Líneas de comisión (solo 43). */
   readonly commissions: readonly CommissionLine[]
 }
@@ -509,6 +545,8 @@ export type DocumentInput = {
   readonly receiver?: ReceiverInput
   readonly items: readonly LineItemInput[]
   readonly references?: readonly ReferenceInput[]
+  /** EN: References of a receipt (39, 41); `references` is for every other type. ES: `Referencia` — Referencias de una boleta (39, 41); `references` es para los demás tipos. */
+  readonly receiptReferences?: readonly ReceiptReferenceInput[]
   readonly globalAdjustments?: readonly GlobalAdjustmentInput[]
   readonly subtotals?: readonly SubtotalInfo[]
   readonly commissions?: readonly CommissionLineInput[]
```

`src/model/sii.ts` (save the diff and run `git apply`; a line that looks empty inside a hunk is a context line):

```diff
diff --git a/src/model/sii.ts b/src/model/sii.ts
index b72900a..5de4ff7 100644
--- a/src/model/sii.ts
+++ b/src/model/sii.ts
@@ -329,6 +329,20 @@ export type SiiReferencia = {
   readonly RazonRef?: string
 }
 
+/** EN: `Referencia` of a receipt (39, 41), SII shape: the receipts schema has no date and a free-text code. ES: `Referencia` de una boleta (39, 41) en forma SII: el esquema de boletas no trae fecha y su código es texto libre. */
+export type SiiReferenciaBoleta = {
+  /** EN: Line number. ES: `NroLinRef` — Número de línea de referencia. */
+  readonly NroLinRef: number
+  /** EN: Referenced document type. ES: `TpoDocRef` — Tipo de documento de referencia. */
+  readonly TpoDocRef?: string
+  /** EN: Referenced folio. ES: `FolioRef` — Folio de referencia. */
+  readonly FolioRef?: string
+  /** EN: The company's own reference code. ES: `CodRef` — Código interno del tipo de referencia. */
+  readonly CodRef?: string
+  /** EN: Reason. ES: `RazonRef` — Razón de la referencia. */
+  readonly RazonRef?: string
+}
+
 /** EN: `Comisiones` line (43), SII shape. ES: Línea de `Comisiones` (43) en forma SII. */
 export type SiiComisiones = {
   /** EN: Line number. ES: `NroLinCom` — Número de línea de comisión. */
@@ -360,8 +374,8 @@ export type SiiDocumento = {
   readonly SubTotInfo?: readonly SiiSubTotInfo[]
   /** EN: Global discounts and surcharges. ES: `DscRcgGlobal` — Descuentos y recargos globales. */
   readonly DscRcgGlobal?: readonly SiiDscRcgGlobal[]
-  /** EN: References to other documents. ES: `Referencia` — Referencias a otros documentos. */
-  readonly Referencia?: readonly SiiReferencia[]
+  /** EN: References to other documents; receipts (39, 41) carry their own shape. ES: `Referencia` — Referencias a otros documentos; las boletas (39, 41) llevan su propia forma. */
+  readonly Referencia?: readonly SiiReferencia[] | readonly SiiReferenciaBoleta[]
   /** EN: Commission lines (settlement invoices). ES: `Comisiones` — Líneas de comisiones (liquidación factura). */
   readonly Comisiones?: readonly SiiComisiones[]
 }
```

`src/model/codec.ts` (save the diff and run `git apply`; a line that looks empty inside a hunk is a context line):

```diff
diff --git a/src/model/codec.ts b/src/model/codec.ts
index 36065a1..ed4dfb3 100644
--- a/src/model/codec.ts
+++ b/src/model/codec.ts
@@ -16,6 +16,7 @@ import type {
   Issuer,
   LineItem,
   Receiver,
+  ReceiptReference,
   Reference,
   SubtotalInfo,
   Totals,
@@ -31,6 +32,7 @@ import type {
   SiiIdDoc,
   SiiReceptor,
   SiiReferencia,
+  SiiReferenciaBoleta,
   SiiSubTotInfo,
   SiiTotales,
   SiiTransporte,
@@ -228,6 +230,16 @@ const toSiiReferencia = (reference: Reference): SiiReferencia =>
     RazonRef: reference.reason,
   })
 
+// A receipt's `Referencia`, in the order of the receipts schema: no date, no global flag, no other issuer.
+const toSiiReferenciaBoleta = (reference: ReceiptReference): SiiReferenciaBoleta =>
+  compact({
+    NroLinRef: reference.lineNumber,
+    TpoDocRef: reference.documentType,
+    FolioRef: reference.folio,
+    CodRef: reference.code,
+    RazonRef: reference.reason,
+  })
+
 const toSiiComisiones = (line: CommissionLine): SiiComisiones =>
   compact({
     NroLinCom: line.lineNumber,
@@ -260,7 +272,9 @@ export const toSiiDocument = (doc: Document): SiiDocumento => {
     Detalle: doc.items.map(toSiiDetalle),
     SubTotInfo: nonEmpty(doc.subtotals.map(toSiiSubTotInfo)),
     DscRcgGlobal: nonEmpty(doc.globalAdjustments.map(toSiiDscRcgGlobal)),
-    Referencia: nonEmpty(doc.references.map(toSiiReferencia)),
+    Referencia: receipt
+      ? nonEmpty(doc.receiptReferences.map(toSiiReferenciaBoleta))
+      : nonEmpty(doc.references.map(toSiiReferencia)),
     Comisiones: nonEmpty(doc.commissions.map(toSiiComisiones)),
   })
 }
@@ -439,6 +453,15 @@ const fromSiiComisiones = (line: SiiComisiones): CommissionLine =>
     vatValue: line.ValComIVA,
   })
 
+const fromSiiReferenciaBoleta = (reference: SiiReferenciaBoleta): ReceiptReference =>
+  compact({
+    lineNumber: reference.NroLinRef,
+    documentType: reference.TpoDocRef === undefined ? undefined : String(reference.TpoDocRef),
+    folio: reference.FolioRef === undefined ? undefined : String(reference.FolioRef),
+    code: reference.CodRef === undefined ? undefined : String(reference.CodRef),
+    reason: reference.RazonRef,
+  })
+
 /**
  * EN: Maps a SII-shaped document back to the domain model (for received DTEs and interop). RUTs are validated with
  * rut.ts on the way in.
@@ -449,6 +472,8 @@ const fromSiiComisiones = (line: SiiComisiones): CommissionLine =>
 export const fromSiiDocument = (sii: SiiDocumento): Document => {
   const idDoc = sii.Encabezado.IdDoc
   const type = idDoc.TipoDTE as DocumentType
+  const receipt = isReceipt(type)
+  const referencia = sii.Referencia ?? []
   return {
     id: `DTE_T${type}F${idDoc.Folio}`,
     header: compact({
@@ -464,7 +489,8 @@ export const fromSiiDocument = (sii: SiiDocumento): Document => {
     items: sii.Detalle.map(fromSiiDetalle),
     subtotals: (sii.SubTotInfo ?? []).map(fromSiiSubTotInfo),
     globalAdjustments: (sii.DscRcgGlobal ?? []).map(fromSiiDscRcgGlobal),
-    references: (sii.Referencia ?? []).map(fromSiiReferencia),
+    references: receipt ? [] : (referencia as readonly SiiReferencia[]).map(fromSiiReferencia),
+    receiptReferences: receipt ? (referencia as readonly SiiReferenciaBoleta[]).map(fromSiiReferenciaBoleta) : [],
     commissions: (sii.Comisiones ?? []).map(fromSiiComisiones),
   }
 }
```

`src/document/create.ts` (save the diff and run `git apply`; a line that looks empty inside a hunk is a context line):

```diff
diff --git a/src/document/create.ts b/src/document/create.ts
index 0c758bf..f328956 100644
--- a/src/document/create.ts
+++ b/src/document/create.ts
@@ -15,6 +15,8 @@ import type {
   LineItemInput,
   Receiver,
   ReceiverInput,
+  ReceiptReference,
+  ReceiptReferenceInput,
   Reference,
   ReferenceInput,
   Transport,
@@ -54,6 +56,9 @@ export const FIELD_LIMITS = {
   UnmdRef: 4,
   TpoDocLiq: 3,
   RazonRef: 90,
+  CodRef: 18,
+  TpoDocRef: 3,
+  FolioRef: 18,
   GlosaDR: 45,
   Glosa: 60,
   GlosaSTI: 40,
@@ -194,6 +199,17 @@ const normalizeReference = (input: ReferenceInput, index: number): Reference =>
     reason: text(input.reason, 'RazonRef'),
   })
 
+// The receipts schema gives `Referencia` its own shape: a type and a folio that are optional texts, a free-text code
+// and the reason; no date.
+const normalizeReceiptReference = (input: ReceiptReferenceInput, index: number): ReceiptReference =>
+  compact({
+    lineNumber: index + 1,
+    documentType: input.documentType === undefined ? undefined : text(String(input.documentType), 'TpoDocRef'),
+    folio: input.folio === undefined ? undefined : text(String(input.folio), 'FolioRef'),
+    code: text(input.code, 'CodRef'),
+    reason: text(input.reason, 'RazonRef'),
+  })
+
 const normalizeAdjustment = (input: GlobalAdjustmentInput, index: number): GlobalAdjustment =>
   compact({
     lineNumber: index + 1,
@@ -242,7 +258,7 @@ const normalizeTransport = (input: TransportInput | undefined): Transport | unde
  * sanitiza textos y exige los largos del esquema (falla temprano en vez de dejar que el SII rechace el sobre entero),
  * numera líneas, calcula montos y totales, aplica los defaults de boleta (consumidor final, `IndServicio=3`) y fija
  * `MntBruto=1` cuando los precios incluyen IVA. Pura: misma entrada, misma salida.
- * @throws {DteError} EN: `INVALID_DOCUMENT_TYPE`, `INVALID_FOLIO`, `INVALID_DATE`, `INVALID_RUT`, `MISSING_FIELD`, `FIELD_TOO_LONG`, `INVALID_AMOUNT`. ES: los mismos códigos.
+ * @throws {DteError} EN: `INVALID_DOCUMENT_TYPE`, `INVALID_FOLIO`, `INVALID_DATE`, `INVALID_RUT`, `MISSING_FIELD`, `FIELD_TOO_LONG`, `INVALID_AMOUNT`; `INVALID_OPTION` for `references` on a receipt or `receiptReferences` on any other type. ES: los mismos códigos; `INVALID_OPTION` por `references` en una boleta o `receiptReferences` en cualquier otro tipo.
  */
 export const createDocument = (input: DocumentInput, options: CreateDocumentOptions = {}): Document => {
   if (!isDocumentType(input.type)) throw new DteError('INVALID_DOCUMENT_TYPE', { type: input.type })
@@ -254,7 +270,12 @@ export const createDocument = (input: DocumentInput, options: CreateDocumentOpti
   const receiver = normalizeReceiver(input.receiver, receipt)
   if (input.items.length === 0) throw new DteError('MISSING_FIELD', { field: 'items' })
   const items = input.items.map((item, index) => normalizeItem(item, index, type))
+  // A receipt's `Referencia` has no date: the invoice shape would fail the receipts schema, and the other way round.
+  if (receipt && (input.references ?? []).length > 0) throw new DteError('INVALID_OPTION', { field: 'references' })
+  if (!receipt && (input.receiptReferences ?? []).length > 0)
+    throw new DteError('INVALID_OPTION', { field: 'receiptReferences' })
   const references = (input.references ?? []).map(normalizeReference)
+  const receiptReferences = (input.receiptReferences ?? []).map(normalizeReceiptReference)
   const globalAdjustments = (input.globalAdjustments ?? []).map(normalizeAdjustment)
   const commissions = (input.commissions ?? []).map(normalizeCommission)
   const transport = normalizeTransport(input.transport)
@@ -291,6 +312,7 @@ export const createDocument = (input: DocumentInput, options: CreateDocumentOpti
     subtotals: input.subtotals ?? [],
     globalAdjustments,
     references,
+    receiptReferences,
     commissions,
   }
 }
```

`src/index.ts` (save the diff and run `git apply`; a line that looks empty inside a hunk is a context line):

```diff
diff --git a/src/index.ts b/src/index.ts
index 96e4abb..29aaba0 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -90,6 +90,8 @@ export type {
   Withholding,
   CommissionTotals,
   Totals,
+  ReceiptReference,
+  ReceiptReferenceInput,
   Reference,
   ReferenceInput,
   GlobalAdjustment,
@@ -122,6 +124,7 @@ export type {
   SiiSubTotInfo,
   SiiDscRcgGlobal,
   SiiReferencia,
+  SiiReferenciaBoleta,
   SiiComisiones,
 } from './model/sii'
 export { toSiiDocument, fromSiiDocument } from './model/codec'
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/receipt-reference --coverage=false
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/model/document.ts src/model/sii.ts src/model/codec.ts src/document/create.ts src/index.ts tests/receipt-reference.test.ts tests/fixtures/xsd/EnvioBOLETA_v11.xsd tests/support/xsd.ts
```

```bash
git commit -F - <<'MSG'
feat: receipts carry the reference of the receipts schema

The receipts schema gives Referencia its own shape: an optional type and
folio, a free-text code and the reason, without a date. Phase 1 wrote the
invoice shape on every document, so a receipt with a reference failed the
schema. Receipts now take receiptReferences, and each kind of document
refuses the other kind of reference. The official EnvioBOLETA_v11.xsd joins
the fixtures and a receipts envelope validates against it in the tests.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 2: The receipts test set parsed

`parseReceiptsTestSet` (spec 3.3): the plain text the receipts portal delivers, line by line: `CASO-<n>` opens a case, a line naming `Item`, `Cantidad` and `Precio` turns the item mode on, `OBSERVACION` lines give their text without quotes, and in item mode a line that splits into a name, a quantity and a price on tabs or runs of spaces is an item, exempt when its name says so.

**Files:**

- Create: `src/certification/receipts-set.ts`
- Test (create): `tests/support/receipts-set-samples.ts`
- Test (create): `tests/certification/receipts-set.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/support/receipts-set-samples.ts` (new file, whole):

```ts
// A receipts test set in the format the receipts portal delivers. Every case, item and price is invented.
export const RECEIPTS_SET_TEXT = [
  'SET DE PRUEBAS BOLETA ELECTRONICA AFECTA',
  'Linea sin caso\t1\t100',
  '',
  'CASO-1',
  '==========',
  'Item\t\tCantidad\tPrecio Unitario',
  'Cambio de aceite\t1\t19.900',
  'Alineacion y balanceo\t1\t9.900',
  '',
  'CASO-2',
  '==========',
  'Item            Cantidad    Precio Unitario',
  'Papel de regalo         17      120',
  '',
  'CASO-3',
  '==========',
  'ITEM\tCANTIDAD\tPRECIO UNITARIO',
  'Clavo galvanizado 3/4"\t3,7\t1.190',
  'Item afecto sin columnas',
  'Tornillo\tmuchos\t100',
  'OBSERVACIONES: "Se debe informar en el XML Unidad de medida en Kg."',
  '',
  'caso4',
  '==========',
  'Item\tCantidad\tPrecio Unitario',
  'item afecto 1\t8\t1.590',
  'item exento 2\t2\t1.000',
  'OBSERVACION: Item exento debe informarse como exento',
  'OBSERVACIONES',
  'OBSERVACION: ""',
].join('\n')
```

`tests/certification/receipts-set.test.ts` (new file, whole):

```ts
import { parseReceiptsTestSet } from '../../src/certification/receipts-set'
import { RECEIPTS_SET_TEXT } from '../support/receipts-set-samples'

describe('parseReceiptsTestSet', () => {
  test('reads every case with its items and observations, and nothing before the first case', () => {
    expect(parseReceiptsTestSet(RECEIPTS_SET_TEXT)).toEqual([
      {
        number: 1,
        items: [
          { name: 'Cambio de aceite', quantity: 1, unitPrice: 19900, exempt: false },
          { name: 'Alineacion y balanceo', quantity: 1, unitPrice: 9900, exempt: false },
        ],
        observations: [],
      },
      {
        number: 2,
        items: [{ name: 'Papel de regalo', quantity: 17, unitPrice: 120, exempt: false }],
        observations: [],
      },
      {
        number: 3,
        items: [{ name: 'Clavo galvanizado 3/4"', quantity: 3.7, unitPrice: 1190, exempt: false }],
        observations: ['Se debe informar en el XML Unidad de medida en Kg.'],
      },
      {
        number: 4,
        items: [
          { name: 'item afecto 1', quantity: 8, unitPrice: 1590, exempt: false },
          { name: 'item exento 2', quantity: 2, unitPrice: 1000, exempt: true },
        ],
        observations: ['Item exento debe informarse como exento'],
      },
    ])
  })

  test('a case without an item header has no items, and a text without cases gives nothing', () => {
    expect(parseReceiptsTestSet('CASO-9\nPan\t1\t100\nOBSERVACION: sola')).toEqual([
      { number: 9, items: [], observations: ['sola'] },
    ])
    expect(parseReceiptsTestSet('Item\tCantidad\tPrecio\nPan\t1\t100\nOBSERVACION: sin caso')).toEqual([])
    expect(parseReceiptsTestSet('')).toEqual([])
  })

  test('Windows line ends are handled like any other', () => {
    expect(parseReceiptsTestSet('CASO-1\r\nItem\tCantidad\tPrecio\r\nPan\t2\t1.500\r\n')).toEqual([
      { number: 1, items: [{ name: 'Pan', quantity: 2, unitPrice: 1500, exempt: false }], observations: [] },
    ])
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/certification/receipts-set --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/certification/receipts-set'`.

- [ ] **Step 3: Write the implementation**

`src/certification/receipts-set.ts` (new file, whole):

```ts
/**
 * EN: One item of a case of the receipts test set.
 * ES: Un ítem de un caso del set de pruebas de boletas.
 */
export type ReceiptsTestItem = {
  /** EN: Item name. ES: `NmbItem` — Nombre del ítem. */
  readonly name: string
  /** EN: Quantity. ES: `QtyItem` — Cantidad. */
  readonly quantity: number
  /** EN: Unit price, VAT included. ES: `PrcItem` — Precio unitario, con IVA. */
  readonly unitPrice: number
  /** EN: The name says the item is exempt. ES: `IndExe` — El nombre dice que el ítem es exento. */
  readonly exempt: boolean
}

/**
 * EN: One case of the receipts test set: one receipt to issue.
 * ES: Un caso del set de pruebas de boletas: una boleta por emitir.
 */
export type ReceiptsTestCase = {
  /** EN: The case number, as in `CASO-1`. ES: El número del caso, como en `CASO-1`. */
  readonly number: number
  /** EN: The items, in order. ES: Los ítems, en orden. */
  readonly items: readonly ReceiptsTestItem[]
  /** EN: The observations of the case, without their quotes. ES: Las observaciones del caso, sin sus comillas. */
  readonly observations: readonly string[]
}

const CASE = /^CASO-?(\d+)/i
const OBSERVATION_LINE = /^OBSERVACION/i
const OBSERVATION = /OBSERVACION[ES]*:\s*"?([^"]+)"?/i
const COLUMNS = /\t+|\s{2,}/
const RULE = '='

const isItemHeader = (line: string): boolean => /item/i.test(line) && /cantidad/i.test(line) && /precio/i.test(line)

// An item line: the name, the quantity (a decimal comma is accepted) and the price (thousands dots and commas are
// dropped), separated by tabs or by runs of two or more spaces.
const itemOf = (line: string): ReceiptsTestItem | null => {
  const parts = line.split(COLUMNS)
  if (parts.length < 3) return null
  const quantity = Number.parseFloat(parts[1].replace(',', '.'))
  const unitPrice = Number.parseInt(parts[2].replace(/\./g, '').replace(',', ''), 10)
  if (Number.isNaN(quantity) || Number.isNaN(unitPrice)) return null
  return { name: parts[0], quantity, unitPrice, exempt: parts[0].toLowerCase().includes('exento') }
}

type Reading = { readonly cases: readonly ReceiptsTestCase[]; readonly inItems: boolean }

const withLast = (reading: Reading, change: (last: ReceiptsTestCase) => ReceiptsTestCase): Reading => {
  const last = reading.cases[reading.cases.length - 1]
  return last === undefined ? reading : { ...reading, cases: [...reading.cases.slice(0, -1), change(last)] }
}

const readLine = (reading: Reading, line: string): Reading => {
  const opening = CASE.exec(line)
  if (opening !== null)
    return { cases: [...reading.cases, { number: Number(opening[1]), items: [], observations: [] }], inItems: false }
  if (isItemHeader(line)) return { ...reading, inItems: true }
  if (OBSERVATION_LINE.test(line)) {
    const observation = OBSERVATION.exec(line)?.[1].trim()
    return observation === undefined || observation === ''
      ? reading
      : withLast(reading, (last) => ({ ...last, observations: [...last.observations, observation] }))
  }
  if (!reading.inItems || line === '' || line.startsWith(RULE)) return reading
  const item = itemOf(line)
  return item === null ? reading : withLast(reading, (last) => ({ ...last, items: [...last.items, item] }))
}

/**
 * EN: Parses the receipts test set the receipts portal delivers, a plain text. A line starting with `CASO-<n>` opens a
 * case; a line naming `Item`, `Cantidad` and `Precio` (in any case) turns the item mode on for that case; a line
 * starting with `OBSERVACION` gives its text, without quotes, to the case; in item mode every other non-empty line
 * that is not a rule of `=` is an item when it splits into a name, a quantity and a price. An item whose name says
 * `exento` is exempt. Nothing before the first case is kept, and a text without cases gives an empty list.
 * ES: Parsea el set de pruebas de boletas que entrega el portal de boletas, un texto plano. Una línea que empieza con
 * `CASO-<n>` abre un caso; una línea que nombra `Item`, `Cantidad` y `Precio` (en mayúsculas o minúsculas) activa el
 * modo de ítems de ese caso; una línea que empieza con `OBSERVACION` entrega su texto, sin comillas, al caso; en modo
 * de ítems cualquier otra línea no vacía que no sea una regla de `=` es un ítem cuando se parte en nombre, cantidad y
 * precio. Un ítem cuyo nombre dice `exento` es exento. Nada anterior al primer caso se guarda, y un texto sin casos
 * da una lista vacía.
 * @param text EN: the set text. ES: el texto del set.
 * @returns EN: the cases, in order. ES: los casos, en orden.
 */
export const parseReceiptsTestSet = (text: string): readonly ReceiptsTestCase[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .reduce<Reading>(readLine, { cases: [], inItems: false }).cases
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/certification/receipts-set --coverage=false
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/certification/receipts-set.ts tests/support/receipts-set-samples.ts tests/certification/receipts-set.test.ts
```

```bash
git commit -F - <<'MSG'
feat: the receipts test set parsed

The receipts portal delivers its test set as plain text: cases, an item
table per case and observations. The parser keeps what the set issuer
needs: each case with its items (name, quantity, price, exempt by name)
and its observations.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 3: The receipts set issued

`issueReceiptsSet` (spec 3.4): one receipt of type 39 per case with the next folio of the phase 5b-1 folio source, the final consumer, prices that include VAT, the exemption of an exempt item, the unit of measure an observation names on the first item, and the receipt reference `SET` / `CASO-<n>`; then the `EnvioBOLETA` signed with the certificate holder as sender, valid against the official schema.

**Files:**

- Create: `src/certification/receipts.ts`
- Test (create): `tests/certification/receipts-issue.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/certification/receipts-issue.test.ts` (new file, whole):

```ts
import { createFolioAllocator } from '../../src/certification/folios'
import { issueReceiptsSet } from '../../src/certification/receipts'
import { parseReceiptsTestSet } from '../../src/certification/receipts-set'
import { verifyDocumentSignature } from '../../src/document/sign'
import { verifyEnvelopeSignature } from '../../src/envelope/sign'
import { cafFor, certificate, issuer, resolution } from '../support/certification-fixtures'
import { FIXED_NOW, ISSUER_RUT } from '../support/fixtures'
import { failure } from '../support/portal'
import { RECEIPTS_SET_TEXT } from '../support/receipts-set-samples'
import { validateAgainstXsd } from '../support/xsd'

const cases = parseReceiptsTestSet(RECEIPTS_SET_TEXT)
const options = (from = 21) => ({
  issuer,
  certificate,
  folios: createFolioAllocator([cafFor(39, { from, to: from + 9 })]),
  resolution,
  now: () => FIXED_NOW,
})

describe('issueReceiptsSet', () => {
  test('one receipt of type 39 per case with consecutive folios, the final consumer and the SET reference', async () => {
    const issued = await issueReceiptsSet(cases, options())
    expect(issued.receipts.map((receipt) => [receipt.caseNumber, receipt.folio])).toEqual([
      [1, 21],
      [2, 22],
      [3, 23],
      [4, 24],
    ])
    expect([issued.firstFolio, issued.lastFolio]).toEqual([21, 24])
    for (const receipt of issued.receipts) {
      const { header, receiptReferences, references } = receipt.document
      expect(header).toMatchObject({ type: 39, folio: receipt.folio, issueDate: '2026-11-15' })
      expect(header.receiver).toMatchObject({ rut: '66666666-6', businessName: 'Consumidor Final' })
      expect(receiptReferences).toEqual([{ lineNumber: 1, code: 'SET', reason: `CASO-${receipt.caseNumber}` }])
      expect(references).toEqual([])
      expect(verifyDocumentSignature(receipt.document.xml).valid).toBe(true)
    }
  })

  test('the prices include VAT, an exempt item is exempt, and the unit an observation names goes on the first item', async () => {
    const issued = await issueReceiptsSet(cases, options())
    const [first, , third, fourth] = issued.receipts.map((receipt) => receipt.document)
    expect(first.header.totals).toMatchObject({ netAmount: 25042, vatAmount: 4758, totalAmount: 29800 })
    expect(first.items.map((item) => item.unit)).toEqual([undefined, undefined])
    expect(third.items[0]).toMatchObject({ name: 'Clavo galvanizado 3/4', quantity: 3.7, unitPrice: 1190, unit: 'Kg' })
    expect(fourth.items.map((item) => item.exemptIndicator)).toEqual([undefined, 1])
    expect(fourth.header.totals).toMatchObject({ exemptAmount: 2000, totalAmount: 14720 })
  })

  test('the envelope names the issuer, the certificate holder and the SII, and validates against the official schema', async () => {
    const issued = await issueReceiptsSet(cases, options())
    expect(issued.envelope.kind).toBe('receipt')
    expect(issued.envelope.cover).toMatchObject({
      issuerRut: ISSUER_RUT,
      senderRut: certificate.rut,
      receiverRut: '60803000-K',
      resolutionDate: '2026-01-01',
      resolutionNumber: 0,
    })
    expect(verifyEnvelopeSignature(issued.envelope.xml).valid).toBe(true)
    await expect(validateAgainstXsd(issued.envelope.xml, 'EnvioBOLETA')).resolves.toEqual([])
    const unnamed = await issueReceiptsSet(cases.slice(0, 1), {
      ...options(),
      certificate: { ...certificate, rut: null },
    })
    expect(unnamed.envelope.cover.senderRut).toBe(ISSUER_RUT)
  })

  test('no cases is a missing field, the clock defaults to now, and a spent CAF says so', async () => {
    const empty = await failure(issueReceiptsSet([], options()))
    expect(empty.code).toBe('MISSING_FIELD')
    expect(empty.details).toEqual({ field: 'cases' })
    const { now: _now, ...withoutClock } = options()
    const today = await issueReceiptsSet(cases.slice(0, 1), withoutClock)
    expect(today.receipts[0].document.header.issueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const short = { ...options(), folios: createFolioAllocator([cafFor(39, { from: 1, to: 2 })]) }
    expect((await failure(issueReceiptsSet(cases, short))).code).toBe('FOLIO_OUT_OF_RANGE')
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/certification/receipts-issue --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/certification/receipts'`.

- [ ] **Step 3: Write the implementation**

`src/certification/receipts.ts` (new file, whole):

```ts
import { TEST_SET_REFERENCE_TYPE } from '../catalogs/certification'
import type { Certificate } from '../certificate/certificate'
import { issueDocument } from '../document/issue'
import type { SignedDocument } from '../document/sign'
import { createEnvelope } from '../envelope/create'
import { signEnvelope, type SignedEnvelope } from '../envelope/sign'
import { DteError } from '../errors'
import type { IssuerInput, LineItemInput } from '../model/document'
import { chileDate } from '../time/chile'
import type { FolioSource } from './folios'
import type { ReceiptsTestCase } from './receipts-set'

const RECEIPT_TYPE = 39
const UNIT_OBSERVATION = /unidad de medida/i
const UNIT_WORD = /en\s+(\w+)\.?$/i

/**
 * EN: What issuing the receipts set needs.
 * ES: Lo que necesita emitir el set de boletas.
 */
export type IssueReceiptsSetOptions = {
  /** EN: The issuer, as for phase 1. ES: El emisor, como en la fase 1. */
  readonly issuer: IssuerInput
  /** EN: The signing certificate; its holder is the sender of the envelope. ES: `RutEnvia` — El certificado de firma; su titular es quien envía el sobre. */
  readonly certificate: Certificate
  /** EN: Where the folios of type 39 and their CAFs come from. ES: De dónde salen los folios del tipo 39 y sus CAF. */
  readonly folios: FolioSource
  /** EN: The resolution of the certification environment: number 0 and its date. ES: `NroResol`, `FchResol` — La resolución del ambiente de certificación: número 0 y su fecha. */
  readonly resolution: { readonly number: number; readonly date: string }
  /** EN: Clock; the issue date is the Chile date of it. ES: Reloj; la fecha de emisión es la fecha de Chile de él. */
  readonly now?: () => Date
}

/**
 * EN: One issued receipt of the set.
 * ES: Una boleta emitida del set.
 */
export type IssuedReceipt = {
  /** EN: The case it answers. ES: El caso que responde. */
  readonly caseNumber: number
  /** EN: Folio taken for it. ES: `Folio` — Folio tomado para ella. */
  readonly folio: number
  /** EN: The issued and signed receipt. ES: La boleta emitida y firmada. */
  readonly document: SignedDocument
}

/**
 * EN: The receipts set issued: its receipts in case order and the signed envelope that carries them.
 * ES: El set de boletas emitido: sus boletas en orden de caso y el sobre firmado que las lleva.
 */
export type IssuedReceiptsSet = {
  /** EN: The receipts, in case order. ES: Las boletas, en orden de caso. */
  readonly receipts: readonly IssuedReceipt[]
  /** EN: The signed envelope. ES: `EnvioBOLETA` — El sobre firmado. */
  readonly envelope: SignedEnvelope
  /** EN: The first folio used. ES: El primer folio usado. */
  readonly firstFolio: number
  /** EN: The last folio used. ES: El último folio usado. */
  readonly lastFolio: number
}

// "… unidad de medida en Kg." names the unit of the first item: the last word after `en`.
const unitOf = (testCase: ReceiptsTestCase): string | undefined => {
  const observation = testCase.observations.find((text) => UNIT_OBSERVATION.test(text))
  return observation === undefined ? undefined : UNIT_WORD.exec(observation.trim())?.[1]
}

const linesOf = (testCase: ReceiptsTestCase): readonly LineItemInput[] => {
  const unit = unitOf(testCase)
  return testCase.items.map((item, index) => ({
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    ...(index === 0 && unit !== undefined ? { unit } : {}),
    ...(item.exempt ? { exempt: true } : {}),
  }))
}

/**
 * EN: Issues the receipts test set: one receipt of type 39 per case, in order, each with the next folio of the source,
 * the final consumer as receiver, the prices of the set taken as including VAT, the exemption of an exempt item, the
 * unit of measure an observation names on its first item, and one reference with the code `SET` and the reason
 * `CASO-<n>`; then signs the `EnvioBOLETA` that carries them, with the certificate holder as sender (the issuer when
 * the certificate names none) and the SII as receiver.
 * ES: Emite el set de pruebas de boletas: una boleta tipo 39 por caso, en orden, cada una con el siguiente folio de la
 * fuente, el consumidor final como receptor, los precios del set tomados con IVA incluido, la exención de un ítem
 * exento, la unidad de medida que nombra una observación en su primer ítem, y una referencia con el código `SET` y la
 * razón `CASO-<n>`; luego firma el `EnvioBOLETA` que las lleva, con el titular del certificado como enviador (el
 * emisor cuando el certificado no nombra ninguno) y el SII como receptor.
 * @param cases EN: the cases of `parseReceiptsTestSet`. ES: los casos de `parseReceiptsTestSet`.
 * @param options EN: issuer, certificate, folios, resolution, clock. ES: emisor, certificado, folios, resolución, reloj.
 * @throws {DteError} EN: `MISSING_FIELD { field: 'cases' }` without cases, `FOLIO_OUT_OF_RANGE` from the folio source, and the phase 1 codes. ES: `MISSING_FIELD { field: 'cases' }` sin casos, `FOLIO_OUT_OF_RANGE` de la fuente de folios, y los códigos de la fase 1.
 */
export const issueReceiptsSet = async (
  cases: readonly ReceiptsTestCase[],
  options: IssueReceiptsSetOptions,
): Promise<IssuedReceiptsSet> => {
  if (cases.length === 0) throw new DteError('MISSING_FIELD', { field: 'cases' })
  const now = options.now?.() ?? new Date()
  const issueDate = chileDate(now)
  const receipts: IssuedReceipt[] = []
  for (const testCase of cases) {
    const { caf, folio } = await options.folios.take(RECEIPT_TYPE)
    const document = issueDocument({
      document: {
        type: RECEIPT_TYPE,
        folio,
        issueDate,
        issuer: options.issuer,
        items: linesOf(testCase),
        pricesIncludeVat: true,
        receiptReferences: [{ code: TEST_SET_REFERENCE_TYPE, reason: `CASO-${testCase.number}` }],
      },
      caf,
      certificate: options.certificate,
      now,
    })
    receipts.push({ caseNumber: testCase.number, folio, document })
  }
  const envelope = signEnvelope(
    createEnvelope({
      kind: 'receipt',
      documents: receipts.map((receipt) => receipt.document),
      cover: {
        issuerRut: options.issuer.rut,
        senderRut: options.certificate.rut ?? options.issuer.rut,
        resolutionDate: options.resolution.date,
        resolutionNumber: options.resolution.number,
      },
      now,
    }),
    options.certificate,
  )
  return { receipts, envelope, firstFolio: receipts[0].folio, lastFolio: receipts[receipts.length - 1].folio }
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/certification/receipts-issue --coverage=false
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/certification/receipts.ts tests/certification/receipts-issue.test.ts
```

```bash
git commit -F - <<'MSG'
feat: the receipts test set issued and its envelope signed

One receipt of type 39 per case with the next folio, the final consumer,
prices that include VAT, the exemption and the unit of measure the set
asks for, and the SET reference in the receipts shape; the EnvioBOLETA
validates against the official schema.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 4: The receipts set sent with its folio consumption report

`sendReceiptsSet` and `resendReceiptsConsumption` (spec 3.5): the envelope uploaded through phase 2 (a duplicate carries on with the track id the SII names), 20 s, its status (a rejection ends there, flagged when the gloss speaks of authorisation or signing), then the folio consumption report built from the envelope as it was signed, with the sequence number 100 plus the attempt, up to ten attempts: three duplicates in a row mean today's report was already accepted, an uploaded report gets 30 s and its status, a rejection tries the next number. Ten attempts without an accepted report still end in `sent`. The waits are injectable and the XMLs come back in the result.

**Files:**

- Create: `src/certification/receipts-send.ts`
- Test (create): `tests/certification/receipts-send.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/certification/receipts-send.test.ts` (new file, whole):

```ts
import { createFolioAllocator } from '../../src/certification/folios'
import { issueReceiptsSet, type IssuedReceiptsSet } from '../../src/certification/receipts'
import {
  resendReceiptsConsumption,
  sendReceiptsSet,
  type ReceiptsProgressEvent,
} from '../../src/certification/receipts-send'
import { parseReceiptsTestSet } from '../../src/certification/receipts-set'
import { cafFor, certificate, issuer, resolution } from '../support/certification-fixtures'
import {
  certificationHarness,
  estUp,
  estUpRoute,
  reception,
  repeat,
  uploadRoute,
} from '../support/certification-harness'
import type { FakeReply } from '../support/fake-sii'
import { FIXED_NOW } from '../support/fixtures'
import { failure } from '../support/portal'
import { RECEIPTS_SET_TEXT } from '../support/receipts-set-samples'
import { siiFixture } from '../support/sii-client'
import { validateAgainstXsd } from '../support/xsd'

const DUPLICATE: FakeReply = { body: siiFixture('reception-duplicate-99.xml') }
const rejected = (trackId: string, gloss = 'Envio Rechazado'): FakeReply => ({
  body: siiFixture('soap-estup-epr.xml')
    .replace('EPR', 'RCH')
    .replace('9876543210', trackId)
    .replace('Envio Procesado', gloss),
})
const NOT_AUTHORIZED = 'Rut No Autorizado a Firmar'

let issued: IssuedReceiptsSet
beforeAll(async () => {
  issued = await issueReceiptsSet(parseReceiptsTestSet(RECEIPTS_SET_TEXT), {
    issuer,
    certificate,
    folios: createFolioAllocator([cafFor(39, { from: 21, to: 30 })]),
    resolution,
    now: () => FIXED_NOW,
  })
})

const run = async (uploads: readonly FakeReply[], statuses: readonly FakeReply[], sequence?: number) => {
  const harness = await certificationHarness([uploadRoute(...uploads), estUpRoute(...statuses)])
  const sleeps: number[] = []
  const events: ReceiptsProgressEvent[] = []
  const result = await sendReceiptsSet(harness.deps.sii, issued, {
    ...(sequence === undefined ? {} : { sequence }),
    sleep: async (ms) => void sleeps.push(ms),
    onProgress: (event) => void events.push(event),
  })
  const uploaded = harness.fake.requests.filter((request) => request.url.endsWith('DTEUpload'))
  return { harness, result, sleeps, steps: events.map((event) => event.step), uploaded }
}

describe('sendReceiptsSet', () => {
  test('uploads the envelope, waits 20 s for its status, then the report with sequence 100 and 30 s for its status', async () => {
    const { result, sleeps, steps, uploaded } = await run(
      [reception('111'), reception('222')],
      [estUp('EPR', '111'), estUp('EPR', '222')],
    )
    expect(result).toMatchObject({
      outcome: 'sent',
      notAuthorized: false,
      envelopeTrackId: '111',
      envelopeDuplicate: false,
      consumptionTrackId: '222',
      consumptionSequence: 100,
      consumptionAlreadySent: false,
    })
    expect(result.consumptions.map(({ xml: _xml, ...rest }) => rest)).toEqual([
      { sequence: 100, trackId: '222', outcome: 'accepted' },
    ])
    expect(result).not.toHaveProperty('detail')
    expect(sleeps).toEqual([20000, 30000])
    expect(steps).toEqual(['BOLETA_SOAP_CHECK', 'BOLETA_RCOF'])
    expect(uploaded.map((request) => request.parts.find((part) => part.fileName !== null)?.fileName)).toEqual([
      'EnvioBOLETA.xml',
      'ConsumoFolios.xml',
    ])
    const report = result.consumptions[0].xml
    expect(report).toContain('<SecEnvio>100</SecEnvio>')
    expect(report).toContain('<RutEmisor>76543210-3</RutEmisor>')
    expect(report).toContain('<FoliosEmitidos>4</FoliosEmitidos>')
    expect(report).toContain('<Inicial>21</Inicial>')
    expect(report).toContain('<Final>24</Final>')
    await expect(validateAgainstXsd(report, 'ConsumoFolio')).resolves.toEqual([])
  })

  test('an envelope the SII already has skips its check and carries on with the report', async () => {
    const { result, sleeps, steps } = await run([DUPLICATE, reception('222')], [estUp('EPR', '222')], 7)
    expect(result).toMatchObject({
      outcome: 'sent',
      envelopeTrackId: '9876543210',
      envelopeDuplicate: true,
      consumptionTrackId: '222',
      consumptionSequence: 7,
    })
    expect(sleeps).toEqual([30000])
    expect(steps).toEqual(['BOLETA_RCOF'])
  })

  test('a rejected envelope ends there, and says when the gloss speaks of authorisation', async () => {
    const plain = await run([reception('111')], [rejected('111')])
    expect(plain.result).toEqual({
      outcome: 'envelopeRejected',
      notAuthorized: false,
      envelopeTrackId: '111',
      envelopeDuplicate: false,
      consumptionTrackId: null,
      consumptionSequence: null,
      consumptionAlreadySent: false,
      consumptions: [],
      detail: 'Envio Rechazado (RCH)',
    })
    expect(plain.uploaded).toHaveLength(1)
    expect(plain.steps).toEqual(['BOLETA_SOAP_CHECK'])
    const refused = await run([reception('111')], [rejected('111', NOT_AUTHORIZED)])
    expect(refused.result).toMatchObject({ outcome: 'envelopeRejected', notAuthorized: true })
  })

  test('a status that does not answer blocks nothing, for the envelope or for the report', async () => {
    const { harness, result, sleeps } = await run(
      [reception('111'), reception('222')],
      [new Error('socket hang up'), new Error('socket hang up')],
    )
    expect(result).toMatchObject({ outcome: 'sent', consumptionTrackId: '222', consumptionSequence: 100 })
    expect(sleeps).toEqual([20000, 30000])
    expect(harness.warnings().filter((warning) => warning === 'receipts status query failed')).toHaveLength(2)
  })

  test('three duplicate reports in a row mean the report of today was already accepted', async () => {
    const { result, sleeps } = await run([reception('111'), DUPLICATE, DUPLICATE, DUPLICATE], [estUp('EPR', '111')])
    expect(result).toMatchObject({
      outcome: 'sent',
      consumptionTrackId: null,
      consumptionSequence: null,
      consumptionAlreadySent: true,
    })
    expect(result.consumptions.map((attempt) => [attempt.sequence, attempt.outcome])).toEqual([
      [100, 'duplicate'],
      [101, 'duplicate'],
      [102, 'duplicate'],
    ])
    expect(sleeps).toEqual([20000])
  })

  test('a rejected report tries the next sequence number, and a report in between resets the duplicate count', async () => {
    const { result, sleeps } = await run(
      [reception('111'), DUPLICATE, reception('222'), DUPLICATE, DUPLICATE, reception('333')],
      [estUp('EPR', '111'), rejected('222'), estUp('REC', '333')],
    )
    expect(result).toMatchObject({ outcome: 'sent', consumptionTrackId: '333', consumptionSequence: 104 })
    expect(result.consumptions.map((attempt) => [attempt.sequence, attempt.outcome, attempt.detail])).toEqual([
      [100, 'duplicate', undefined],
      [101, 'rejected', 'Envio Rechazado (RCH)'],
      [102, 'duplicate', undefined],
      [103, 'duplicate', undefined],
      [104, 'accepted', undefined],
    ])
    expect(sleeps).toEqual([20000, 30000, 30000])
  })

  test('a report rejected for authorisation, or an upload that fails, ends with the envelope track id kept', async () => {
    const refused = await run(
      [reception('111'), reception('222')],
      [estUp('EPR', '111'), rejected('222', NOT_AUTHORIZED)],
    )
    expect(refused.result).toMatchObject({
      outcome: 'consumptionFailed',
      notAuthorized: true,
      envelopeTrackId: '111',
      consumptionTrackId: null,
      detail: `${NOT_AUTHORIZED} (RCH)`,
    })
    const failed = await run([reception('111'), new Error('socket hang up')], [estUp('EPR', '111')])
    expect(failed.result).toMatchObject({ outcome: 'consumptionFailed', notAuthorized: false, envelopeTrackId: '111' })
    expect(failed.result.consumptions).toEqual([
      expect.objectContaining({ sequence: 100, trackId: null, outcome: 'failed', detail: failed.result.detail }),
    ])
  })

  test('ten rejected reports still end in sent, without a report track id', async () => {
    const tracks = Array.from({ length: 10 }, (_, index) => String(200 + index))
    const { harness, result, sleeps } = await run(
      [reception('111'), ...tracks.map((track) => reception(track))],
      [estUp('EPR', '111'), ...tracks.map((track) => rejected(track))],
    )
    expect(result).toMatchObject({ outcome: 'sent', consumptionTrackId: null, consumptionSequence: null })
    expect(result.consumptions.map((attempt) => attempt.sequence)).toEqual([
      100, 101, 102, 103, 104, 105, 106, 107, 108, 109,
    ])
    expect(sleeps).toEqual([20000, ...repeat(30000, 10)])
    expect(harness.warnings()).toContain('receipts folio consumption not accepted')
  })

  test('the waits are the client’s by default, and an envelope without receipts is refused before any upload', async () => {
    const harness = await certificationHarness([
      uploadRoute(reception('111'), reception('222')),
      estUpRoute(estUp('EPR', '111'), estUp('EPR', '222')),
    ])
    await expect(sendReceiptsSet(harness.deps.sii, issued)).resolves.toMatchObject({ outcome: 'sent' })
    const empty = {
      envelope: { ...issued.envelope, xml: '<EnvioBOLETA><SetDTE ID="X"><Caratula/></SetDTE></EnvioBOLETA>' },
    }
    const quiet = await certificationHarness([])
    expect((await failure(sendReceiptsSet(quiet.deps.sii, empty))).code).toBe('ENVELOPE_EMPTY')
    const coverless = {
      envelope: { ...issued.envelope, xml: issued.envelope.xml.replace(/<RutEmisor>[^<]*<\/RutEmisor>/, '') },
    }
    const missing = await failure(sendReceiptsSet(quiet.deps.sii, coverless))
    expect(missing.code).toBe('MISSING_FIELD')
    expect(missing.details).toEqual({ field: 'RutEmisor' })
    expect(quiet.urls()).toEqual([])
  })
})

describe('resendReceiptsConsumption', () => {
  test('builds the report again from the envelope and uploads it once with the sequence given', async () => {
    const harness = await certificationHarness([uploadRoute(reception('333'))])
    const result = await resendReceiptsConsumption(harness.deps.sii, { envelopeXml: issued.envelope.xml, sequence: 5 })
    expect(result).toMatchObject({ sequence: 5, trackId: '333', duplicate: false })
    expect(result.xml).toContain('<SecEnvio>5</SecEnvio>')
    await expect(validateAgainstXsd(result.xml, 'ConsumoFolio')).resolves.toEqual([])
    expect(harness.fake.requests).toHaveLength(1)
  })

  test('an envelope with one receipt and no totals still gives a report', async () => {
    const one = `<EnvioBOLETA><SetDTE ID="X"><Caratula><RutEmisor>76543210-3</RutEmisor><RutEnvia>76543210-3</RutEnvia><FchResol>2026-01-01</FchResol><NroResol>0</NroResol></Caratula><DTE><Documento ID="B"><Encabezado><IdDoc><TipoDTE>41</TipoDTE><Folio>9</Folio><FchEmis>2026-11-15</FchEmis></IdDoc></Encabezado></Documento></DTE></SetDTE></EnvioBOLETA>`
    const harness = await certificationHarness([uploadRoute(DUPLICATE)])
    const result = await resendReceiptsConsumption(harness.deps.sii, { envelopeXml: one, sequence: 2 })
    expect(result).toMatchObject({ duplicate: true, trackId: '9876543210' })
    expect(result.xml).toContain('<TipoDocumento>41</TipoDocumento>')
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/certification/receipts-send --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/certification/receipts-send'`.

- [ ] **Step 3: Write the implementation**

`src/certification/receipts-send.ts` (new file, whole):

```ts
import { createFolioConsumption, signFolioConsumption } from '../books/folio-consumption'
import type { SignedEnvelope } from '../envelope/sign'
import { DteError, errorMessage } from '../errors'
import type { FolioConsumptionEntry } from '../model/book'
import type { SiiClient } from '../sii/client'
import { queryUploadStatus, type UploadStatus } from '../sii/status'
import { uploadEnvelope, uploadFolioConsumption } from '../sii/upload'
import { parseXmlWithoutNamespaces } from '../xml/parse'

const ENVELOPE_WAIT_MS = 20000
const CONSUMPTION_WAIT_MS = 30000
const MAX_CONSUMPTION_ATTEMPTS = 10
const MAX_CONSECUTIVE_DUPLICATES = 3
const DEFAULT_SEQUENCE = 100
const AUTHORIZATION_WORDS = /autorizado|autorizar|firmar|permiso/i

/**
 * EN: The progress events of `sendReceiptsSet`, with the field's step names.
 * ES: Los eventos de progreso de `sendReceiptsSet`, con los nombres de paso del campo.
 */
export type ReceiptsProgressEvent = { readonly step: 'BOLETA_SOAP_CHECK' } | { readonly step: 'BOLETA_RCOF' }

/**
 * EN: Options of `sendReceiptsSet`.
 * ES: Opciones de `sendReceiptsSet`.
 */
export type SendReceiptsSetOptions = {
  /** EN: The sequence number of the first folio consumption report; 100 by default, and each attempt adds one. ES: `SecEnvio` — La secuencia del primer reporte de consumo de folios; 100 por defecto, y cada intento suma uno. */
  readonly sequence?: number
  /** EN: Wait function; the client's by default. ES: Función de espera; por defecto la del cliente. */
  readonly sleep?: (ms: number) => Promise<void>
  /** EN: Progress events. ES: Eventos de progreso. */
  readonly onProgress?: (event: ReceiptsProgressEvent) => void
}

/**
 * EN: One folio consumption report tried.
 * ES: Un reporte de consumo de folios intentado.
 */
export type ReceiptsConsumptionAttempt = {
  /** EN: Its sequence number. ES: `SecEnvio` — Su secuencia de envío. */
  readonly sequence: number
  /** EN: The signed report. ES: `ConsumoFolios` — El reporte firmado. */
  readonly xml: string
  /** EN: Its track id, or null when the upload failed. ES: Su track id, o null si la subida falló. */
  readonly trackId: string | null
  /** EN: What happened: accepted (or still in process, or its status did not answer), a duplicate, rejected, or the upload failed. ES: Qué pasó: aceptado (o aún en proceso, o su estado no respondió), duplicado, rechazado, o la subida falló. */
  readonly outcome: 'accepted' | 'duplicate' | 'rejected' | 'failed'
  /** EN: The SII's gloss or the error, when there is one. ES: La glosa del SII o el error, cuando lo hay. */
  readonly detail?: string
}

/**
 * EN: What `sendReceiptsSet` did. `sent` is the envelope uploaded and not rejected, whatever became of the report:
 * the SII's objections to the report are expected in certification and block nothing.
 * ES: Lo que hizo `sendReceiptsSet`. `sent` es el sobre subido y no rechazado, sea cual sea la suerte del reporte: los
 * reparos del SII al reporte son esperables en certificación y no bloquean nada.
 */
export type ReceiptsSendResult = {
  /** EN: How it ended. ES: Cómo terminó. */
  readonly outcome: 'sent' | 'envelopeRejected' | 'consumptionFailed'
  /** EN: The SII's gloss or the error speaks of authorisation or signing: the company cannot sign receipts yet. ES: La glosa del SII o el error habla de autorización o firma: la empresa aún no puede firmar boletas. */
  readonly notAuthorized: boolean
  /** EN: The envelope's track id, to declare on the receipts portal. ES: El track id del sobre, para declararlo en el portal de boletas. */
  readonly envelopeTrackId: string
  /** EN: The SII already had the envelope. ES: El SII ya tenía el sobre. */
  readonly envelopeDuplicate: boolean
  /** EN: The accepted report's track id, or null. ES: El track id del reporte aceptado, o null. */
  readonly consumptionTrackId: string | null
  /** EN: The accepted report's sequence number, or null. ES: `SecEnvio` del reporte aceptado, o null. */
  readonly consumptionSequence: number | null
  /** EN: Three reports in a row were duplicates: one was already accepted today. ES: Tres reportes seguidos fueron duplicados: ya se aceptó uno hoy. */
  readonly consumptionAlreadySent: boolean
  /** EN: Every report tried, in order. ES: Cada reporte intentado, en orden. */
  readonly consumptions: readonly ReceiptsConsumptionAttempt[]
  /** EN: The gloss or error that ended it, when it did not end in `sent`. ES: La glosa o el error que lo terminó, cuando no terminó en `sent`. */
  readonly detail?: string
}

type Node = Readonly<Record<string, unknown>>

const nodeOf = (value: unknown): Node | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Node) : null

const textOf = (node: Node | null, key: string): string | undefined => {
  const value = node?.[key]
  return typeof value === 'string' ? value : undefined
}

const required = (node: Node | null, key: string): string => {
  const value = textOf(node, key)
  if (value === undefined) throw new DteError('MISSING_FIELD', { field: key })
  return value
}

const amountOf = (node: Node | null, key: string): number | undefined => {
  const value = textOf(node, key)
  return value === undefined ? undefined : Number(value)
}

const compact = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T

type ReceiptsEnvelope = {
  readonly issuerRut: string
  readonly senderRut: string
  readonly resolutionDate: string
  readonly resolutionNumber: number
  readonly entries: readonly FolioConsumptionEntry[]
}

// The report is built from the envelope as it was signed: its cover and, per receipt, the totals the document holds.
const readReceiptsEnvelope = (xml: string): ReceiptsEnvelope => {
  const set = nodeOf(nodeOf(parseXmlWithoutNamespaces(xml)['EnvioBOLETA'])?.['SetDTE'])
  const cover = nodeOf(set?.['Caratula'])
  const documents = set?.['DTE']
  const entries = (Array.isArray(documents) ? documents : documents === undefined ? [] : [documents]).map(
    (dte): FolioConsumptionEntry => {
      const header = nodeOf(nodeOf(nodeOf(dte)?.['Documento'])?.['Encabezado'])
      const id = nodeOf(header?.['IdDoc'])
      const totals = nodeOf(header?.['Totales'])
      return compact({
        type: Number(textOf(id, 'TipoDTE')) as FolioConsumptionEntry['type'],
        folio: Number(textOf(id, 'Folio')),
        issueDate: textOf(id, 'FchEmis'),
        netAmount: amountOf(totals, 'MntNeto'),
        vatAmount: amountOf(totals, 'IVA'),
        exemptAmount: amountOf(totals, 'MntExe'),
        totalAmount: amountOf(totals, 'MntTotal') ?? 0,
      })
    },
  )
  if (entries.length === 0) throw new DteError('ENVELOPE_EMPTY', { field: 'DTE' })
  return {
    issuerRut: required(cover, 'RutEmisor'),
    senderRut: required(cover, 'RutEnvia'),
    resolutionDate: required(cover, 'FchResol'),
    resolutionNumber: Number(required(cover, 'NroResol')),
    entries,
  }
}

const consumptionXml = (sii: SiiClient, envelope: ReceiptsEnvelope, sequence: number): string =>
  signFolioConsumption(
    createFolioConsumption({
      cover: {
        issuerRut: envelope.issuerRut,
        senderRut: envelope.senderRut,
        resolutionDate: envelope.resolutionDate,
        resolutionNumber: envelope.resolutionNumber,
        sequence,
      },
      entries: envelope.entries,
      now: sii.now(),
    }),
    sii.certificate,
  ).xml

// A status query that does not answer blocks nothing: the field goes on as if the upload were fine.
const statusOf = async (sii: SiiClient, trackId: string): Promise<UploadStatus | null> => {
  try {
    return await queryUploadStatus(sii, { trackId })
  } catch (error) {
    sii.logger.warn('receipts status query failed', { trackId, reason: errorMessage(error) })
    return null
  }
}

const glossOf = (status: UploadStatus): string => `${status.message} (${status.code})`

type ConsumptionPart = Pick<
  ReceiptsSendResult,
  | 'outcome'
  | 'notAuthorized'
  | 'consumptionTrackId'
  | 'consumptionSequence'
  | 'consumptionAlreadySent'
  | 'consumptions'
  | 'detail'
>

const NO_CONSUMPTION = {
  notAuthorized: false,
  consumptionTrackId: null,
  consumptionSequence: null,
  consumptionAlreadySent: false,
} as const

const sendConsumption = async (
  sii: SiiClient,
  envelope: ReceiptsEnvelope,
  start: number,
  sleep: (ms: number) => Promise<void>,
): Promise<ConsumptionPart> => {
  const consumptions: ReceiptsConsumptionAttempt[] = []
  const box = { duplicates: 0 }
  for (let attempt = 0; attempt < MAX_CONSUMPTION_ATTEMPTS; attempt += 1) {
    const sequence = start + attempt
    const xml = consumptionXml(sii, envelope, sequence)
    const receipt = await uploadFolioConsumption(sii, { xml }).catch((error: unknown) => errorMessage(error))
    if (typeof receipt === 'string') {
      consumptions.push({ sequence, xml, trackId: null, outcome: 'failed', detail: receipt })
      return {
        ...NO_CONSUMPTION,
        outcome: 'consumptionFailed',
        notAuthorized: AUTHORIZATION_WORDS.test(receipt),
        consumptions,
        detail: receipt,
      }
    }
    if (receipt.duplicate) {
      box.duplicates += 1
      consumptions.push({ sequence, xml, trackId: receipt.trackId, outcome: 'duplicate' })
      // The certification environment takes one report per company per day: three in a row say it has today's.
      if (box.duplicates >= MAX_CONSECUTIVE_DUPLICATES)
        return { ...NO_CONSUMPTION, outcome: 'sent', consumptionAlreadySent: true, consumptions }
      continue
    }
    box.duplicates = 0
    await sleep(CONSUMPTION_WAIT_MS)
    const status = await statusOf(sii, receipt.trackId)
    if (status === null || status.status !== 'rejected') {
      consumptions.push({ sequence, xml, trackId: receipt.trackId, outcome: 'accepted' })
      return {
        ...NO_CONSUMPTION,
        outcome: 'sent',
        consumptionTrackId: receipt.trackId,
        consumptionSequence: sequence,
        consumptions,
      }
    }
    const detail = glossOf(status)
    consumptions.push({ sequence, xml, trackId: receipt.trackId, outcome: 'rejected', detail })
    if (AUTHORIZATION_WORDS.test(status.message))
      return { ...NO_CONSUMPTION, outcome: 'consumptionFailed', notAuthorized: true, consumptions, detail }
  }
  sii.logger.warn('receipts folio consumption not accepted', { attempts: MAX_CONSUMPTION_ATTEMPTS })
  return { ...NO_CONSUMPTION, outcome: 'sent', consumptions }
}

/**
 * EN: Sends the receipts set as the field does: uploads the envelope (one the SII already has carries on with the
 * track id the SII names), waits 20 s and reads its status (a rejection ends here; a status that does not answer is
 * logged), then sends the folio consumption report built from the envelope, with the sequence number `sequence` plus
 * the attempt, up to ten attempts: three duplicates in a row mean today's report was already accepted; an uploaded
 * report is given 30 s and its status read; a rejection tries the next sequence number, unless its gloss speaks of
 * authorisation or signing. Ten attempts without an accepted report still end in `sent`.
 * ES: Envía el set de boletas como lo hace el campo: sube el sobre (uno que el SII ya tiene sigue con el track id que
 * nombra el SII), espera 20 s y lee su estado (un rechazo termina aquí; un estado que no responde se registra), y luego
 * envía el reporte de consumo de folios armado desde el sobre, con la secuencia `sequence` más el intento, hasta diez
 * intentos: tres duplicados seguidos significan que el reporte de hoy ya se aceptó; a un reporte subido se le dan 30 s
 * y se lee su estado; un rechazo prueba la secuencia siguiente, salvo que su glosa hable de autorización o firma. Diez
 * intentos sin reporte aceptado terminan igual en `sent`.
 * @param sii EN: the phase 2 client on the certification environment. ES: el cliente de la fase 2 en el ambiente de certificación.
 * @param issued EN: the set of `issueReceiptsSet`, or anything with its signed envelope. ES: el set de `issueReceiptsSet`, o cualquier cosa con su sobre firmado.
 * @param options EN: the first sequence number, the wait function, the progress events. ES: la primera secuencia, la función de espera, los eventos de progreso.
 * @throws {DteError} EN: the phase 2 codes of the envelope upload; `ENVELOPE_EMPTY` for an envelope without receipts; `MISSING_FIELD` for a cover without its issuer, sender or resolution. ES: los códigos de la fase 2 de la subida del sobre; `ENVELOPE_EMPTY` por un sobre sin boletas; `MISSING_FIELD` por una carátula sin emisor, enviador o resolución.
 */
export const sendReceiptsSet = async (
  sii: SiiClient,
  issued: { readonly envelope: SignedEnvelope },
  options: SendReceiptsSetOptions = {},
): Promise<ReceiptsSendResult> => {
  const sleep = options.sleep ?? ((ms: number) => sii.sleep(ms))
  const envelope = readReceiptsEnvelope(issued.envelope.xml)
  const upload = await uploadEnvelope(sii, { envelope: issued.envelope })
  const sent = { envelopeTrackId: upload.trackId, envelopeDuplicate: upload.duplicate }
  if (!upload.duplicate) {
    options.onProgress?.({ step: 'BOLETA_SOAP_CHECK' })
    await sleep(ENVELOPE_WAIT_MS)
    const status = await statusOf(sii, upload.trackId)
    if (status !== null && status.status === 'rejected')
      return {
        ...NO_CONSUMPTION,
        ...sent,
        outcome: 'envelopeRejected',
        notAuthorized: AUTHORIZATION_WORDS.test(status.message),
        consumptions: [],
        detail: glossOf(status),
      }
  }
  options.onProgress?.({ step: 'BOLETA_RCOF' })
  return { ...sent, ...(await sendConsumption(sii, envelope, options.sequence ?? DEFAULT_SEQUENCE, sleep)) }
}

/**
 * EN: Input of `resendReceiptsConsumption`.
 * ES: Entrada de `resendReceiptsConsumption`.
 */
export type ResendReceiptsConsumptionInput = {
  /** EN: The receipts envelope as it was sent. ES: `EnvioBOLETA` — El sobre de boletas tal como se envió. */
  readonly envelopeXml: string
  /** EN: The sequence number of the report. ES: `SecEnvio` — La secuencia del reporte. */
  readonly sequence: number
}

/**
 * EN: Builds the folio consumption report again from a receipts envelope already sent and uploads it once, with the
 * sequence number given.
 * ES: Arma de nuevo el reporte de consumo de folios desde un sobre de boletas ya enviado y lo sube una vez, con la
 * secuencia dada.
 * @throws {DteError} EN: `ENVELOPE_EMPTY`, `MISSING_FIELD` for an incomplete cover; the phase 2 codes of the upload. ES: `ENVELOPE_EMPTY`, `MISSING_FIELD` por una carátula incompleta; los códigos de la fase 2 de la subida.
 */
export const resendReceiptsConsumption = async (
  sii: SiiClient,
  input: ResendReceiptsConsumptionInput,
): Promise<{
  readonly sequence: number
  readonly xml: string
  readonly trackId: string
  readonly duplicate: boolean
}> => {
  const xml = consumptionXml(sii, readReceiptsEnvelope(input.envelopeXml), input.sequence)
  const receipt = await uploadFolioConsumption(sii, { xml })
  return { sequence: input.sequence, xml, trackId: receipt.trackId, duplicate: receipt.duplicate }
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/certification/receipts-send --coverage=false
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/certification/receipts-send.ts tests/certification/receipts-send.test.ts
```

```bash
git commit -F - <<'MSG'
feat: the receipts set sent with its folio consumption report

The envelope is uploaded, given 20 s and its status read; then the folio
consumption report built from the envelope, with the sequence number 100
plus the attempt, up to ten attempts: three duplicates in a row mean
today's report was already accepted, a rejection tries the next number,
and a gloss that speaks of authorisation or signing ends it.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 5: The answers of the receipts portal

The pure side of the receipts portal (spec 3.6, 3.8): the representative in the portal's list, the application record (the authorisation date and the Long), the states of a status answer (exact entries of an `//OK` answer's table, never a search of the raw body), the empty list, the set download, and the declaration body written as the portal's own page writes it: a table of 24 strings and a fixed sequence with back-references. The codec gains a null that names its declared type (D90), the RUT model `siiRutOfBody`, the catalog `RECEIPTS_PORTAL` and three rejections, and the progress page the receipts row, which reads as authorised only on a whole word that says so and no word that denies it.

**Files:**

- Create: `src/portal/pages/receipts-certification.ts`
- Modify: `src/portal/gwt.ts`
- Modify: `src/model/rut.ts`
- Modify: `src/catalogs/certification.ts`
- Modify: `src/catalogs/portal.ts`
- Modify: `src/portal/pages/certification-progress.ts`
- Modify: `src/portal/certification.ts`
- Test (create): `tests/portal/pages-receipts-certification.test.ts`
- Test (modify): `tests/portal/gwt.test.ts`
- Test (modify): `tests/portal/pages-certification-progress.test.ts`
- Test (modify): `tests/rut.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/portal/pages-receipts-certification.test.ts` (new file, whole):

```ts
import { RECEIPTS_PORTAL } from '../../src/catalogs/certification'
import { gwtAnswer } from '../../src/portal/gwt'
import {
  isEmptyList,
  isReceiptsSet,
  postulationOf,
  receiptsComplianceBody,
  receiptsStatesOf,
  representativeDigitsOf,
} from '../../src/portal/pages/receipts-certification'
import { EMPTY_OK, EXCEPTION, okAnswer } from '../support/gwt-answers'

const REPRESENTATIVES = okAnswer(
  [2, 1],
  ['java.util.ArrayList/4159755760', 'cl.sii.sdi.diii.certBolElectDte.to.RepreTo/1', '9', '11111111', '5', '12345678'],
)

describe('the receipts portal answers', () => {
  test('the representative is the last string of 7 or 8 digits, none on an empty table', () => {
    expect(representativeDigitsOf(gwtAnswer(REPRESENTATIVES))).toBe('12345678')
    expect(representativeDigitsOf(gwtAnswer(okAnswer([1], ['x', '1234567'])))).toBe('1234567')
    expect(representativeDigitsOf(gwtAnswer(EMPTY_OK))).toBeNull()
    expect(representativeDigitsOf(gwtAnswer(okAnswer([1], ['123456', '123456789'])))).toBeNull()
  })

  test('the application record gives the authorisation date and the Long as written', () => {
    const answer = gwtAnswer('//OK[3,\'BAqo\',2,1,["cl.sii.x/1","15/11/2026","otro"],0,7]')
    expect(postulationOf(answer)).toEqual({ authorizationDate: '15/11/2026', token: 'BAqo' })
    expect(postulationOf(gwtAnswer(EMPTY_OK))).toEqual({ authorizationDate: '', token: '0' })
  })

  test('the states are the table strings that are exactly a P code, and only of an //OK answer', () => {
    expect(receiptsStatesOf(gwtAnswer(okAnswer([1], ['x', 'P90'])))).toEqual(['P90'])
    expect(receiptsStatesOf(gwtAnswer(okAnswer([1], ['x', 'P05', 'P91'])))).toEqual(['P05', 'P91'])
    expect(receiptsStatesOf(gwtAnswer(EMPTY_OK))).toEqual([])
    // A state quoted inside a sentence, or inside an exception, is not a state.
    expect(receiptsStatesOf(gwtAnswer(okAnswer([1], ['La empresa no esta en estado P90', 'xP90', 'P90x'])))).toEqual([])
    expect(receiptsStatesOf(gwtAnswer('//EX[1,["P90"],0,7]'))).toEqual([])
    expect(receiptsStatesOf(gwtAnswer('<html>"P90"</html>'))).toEqual([])
    expect(isEmptyList(EMPTY_OK)).toBe(true)
    expect(isEmptyList(okAnswer([1], ['P90']))).toBe(false)
    expect(isEmptyList(EXCEPTION)).toBe(false)
  })

  test('a set is an HTTP 200 with at least ten characters of text', () => {
    expect(isReceiptsSet(200, 'CASO-1\nItem')).toBe(true)
    expect(isReceiptsSet(200, '   corto   ')).toBe(false)
    expect(isReceiptsSet(500, 'CASO-1\nItem Cantidad Precio')).toBe(false)
  })
})

describe('the declaration body', () => {
  const values = {
    moduleBase: RECEIPTS_PORTAL.base,
    policy: RECEIPTS_PORTAL.known.policy,
    serviceInterface: RECEIPTS_PORTAL.serviceInterface,
    company: { digits: '76543210', verifier: '3' },
    provider: { digits: '10000004', verifier: '0' },
    representative: { digits: '12345678', verifier: '5' },
    date: '15-11-2026',
    providerMail: 'soporte@example.test',
    providerName: 'Proveedor de Software SpA',
    link: 'www.sii.cl',
    authorizationDate: '10/11/2026',
    token: 'BAqo',
    businessName: 'Comercial Andina SpA',
  }

  test('is the 24-string table and the fixed sequence with the values in their places', () => {
    expect(receiptsComplianceBody(values)).toBe(
      [
        '7|0|24',
        RECEIPTS_PORTAL.base,
        RECEIPTS_PORTAL.known.policy,
        RECEIPTS_PORTAL.serviceInterface,
        'autorizarEmpresaBolProd',
        'cl.sii.sdi.diii.certBolElectDte.to.PostulSegHistInsUpdTo/138688689',
        'P91',
        'BVE',
        'java.lang.Integer/3438268394',
        '3',
        'cl.sii.sdi.diii.certBolElectDte.to.TdtEmpresaAutorizadaTo/2240026086',
        '0',
        '5',
        'SII',
        '15-11-2026',
        'soporte@example.test',
        'Proveedor de Software SpA',
        '19',
        'S',
        'www.sii.cl',
        'java.util.ArrayList/4159755760',
        'cl.sii.sdi.diii.certBolElectDte.to.DocumentoAutorizadoTo/493967287',
        '10/11/2026',
        'java.lang.Long/4227064769',
        'Comercial Andina SpA',
        '1|2|3|4|1|5|5|6|0|7|8|90|0|0|0|0|9|0|10|0|7|9|11|12|13|14|14|14|15|16|17|18|8|76543210|8|10000004|8|12345678|19|14|14|0|20|2|21|0|0|9|12|22|0|0|0|0|0|0|8|76543210|8|12345678|23|BAqo|-11|8|39|0|21|0|0|9|12|22|0|0|0|0|0|0|8|76543210|8|12345678|-11|-11|8|41|0|0|24|-11|0|8|76543210|0|0|',
      ].join('|'),
    )
  })

  test('a pipe or a backslash in a value is escaped, so the table keeps its 24 strings', () => {
    const body = receiptsComplianceBody({ ...values, businessName: 'A|B\\C', providerName: 'Uno | Dos' })
    expect(body).toContain('|A\\!B\\\\C|')
    expect(body).toContain('|Uno \\! Dos|')
    expect(body.startsWith('7|0|24|')).toBe(true)
  })
})
```

`tests/portal/gwt.test.ts` (save the diff and run `git apply`; a line that looks empty inside a hunk is a context line):

```diff
diff --git a/tests/portal/gwt.test.ts b/tests/portal/gwt.test.ts
index e9bfa71..5ff87bf 100644
--- a/tests/portal/gwt.test.ts
+++ b/tests/portal/gwt.test.ts
@@ -8,6 +8,7 @@ import {
   gwtHeaders,
   gwtLongToken,
   gwtMessage,
+  gwtNull,
   GWT_INTEGER,
   GWT_LONG,
   GWT_STRING,
@@ -256,3 +257,58 @@ describe('discoverGwtHashes', () => {
     expect(harness.urls()).toEqual([])
   })
 })
+
+describe('a null that names its declared type', () => {
+  const RECEIPTS = 'https://www4.sii.cl/certBolElectDteInternet/'
+  const RECEIPTS_FACADE = 'cl.sii.sdi.diii.certBolElectDte.web.client.service.Facade'
+
+  test('ingresarTrackId: seven parameters, the fifth a null Integer', () => {
+    const body = gwtBody(
+      call(RECEIPTS, RECEIPTS_FACADE, 'ingresarTrackId', [
+        integer(76543210),
+        string('3'),
+        string(null),
+        string('90'),
+        gwtNull(GWT_INTEGER),
+        string(null),
+        string('9876543210'),
+      ]),
+    )
+    expect(body).toBe(
+      `7|0|9|${RECEIPTS}|${POLICY}|${RECEIPTS_FACADE}|ingresarTrackId|${GWT_INTEGER}|${GWT_STRING}|3|90|9876543210|1|2|3|4|7|5|6|6|6|5|6|6|5|76543210|7|0|8|0|0|9|`,
+    )
+  })
+
+  test('obtenerEstadoAutorizaEmp and obtenerPostulacionSeg, as the receipts portal takes them', () => {
+    expect(
+      gwtBody(
+        call(RECEIPTS, RECEIPTS_FACADE, 'obtenerEstadoAutorizaEmp', [
+          integer(76543210),
+          string('3'),
+          integer(90),
+          string(null),
+        ]),
+      ),
+    ).toBe(
+      `7|0|7|${RECEIPTS}|${POLICY}|${RECEIPTS_FACADE}|obtenerEstadoAutorizaEmp|${GWT_INTEGER}|${GWT_STRING}|3|1|2|3|4|4|5|6|5|6|5|76543210|7|5|90|0|`,
+    )
+    expect(
+      gwtBody(
+        call(RECEIPTS, RECEIPTS_FACADE, 'obtenerPostulacionSeg', [
+          integer(76543210),
+          string('3'),
+          string('90'),
+          string('P90'),
+        ]),
+      ),
+    ).toBe(
+      `7|0|9|${RECEIPTS}|${POLICY}|${RECEIPTS_FACADE}|obtenerPostulacionSeg|${GWT_INTEGER}|${GWT_STRING}|3|90|P90|1|2|3|4|4|5|6|6|6|5|76543210|7|8|9|`,
+    )
+  })
+
+  test('a plain null stays a String', () => {
+    expect(gwtBody(call(RECEIPTS, RECEIPTS_FACADE, 'x', [nothing]))).toBe(
+      `7|0|5|${RECEIPTS}|${POLICY}|${RECEIPTS_FACADE}|x|${GWT_STRING}|1|2|3|4|1|5|0|`,
+    )
+  })
+})
```

`tests/portal/pages-certification-progress.test.ts` (save the diff and run `git apply`; a line that looks empty inside a hunk is a context line):

```diff
diff --git a/tests/portal/pages-certification-progress.test.ts b/tests/portal/pages-certification-progress.test.ts
index 677097b..65f0ec9 100644
--- a/tests/portal/pages-certification-progress.test.ts
+++ b/tests/portal/pages-certification-progress.test.ts
@@ -216,6 +216,7 @@ describe('parseProgressPage', () => {
       stageKey: 'testSets',
       states: {},
       simulationAwaitsConfirmation: false,
+      receipts: null,
     })
   })
 })
@@ -228,3 +229,46 @@ test('portalStageOf and classifyItemState on the wordings of the field', () => {
   expect(classifyItemState('FECHA INV&Aacute;LIDA')).toBe('unknown')
   expect(classifyItemState('FECHA INVALIDA')).toBe('inconsistent')
 })
+
+describe('the receipts row of the progress page', () => {
+  test('gives the bold text after the receipts cell and whether it says authorised', () => {
+    expect(
+      parseProgressPage(progressPage('DOCUMENTOS IMPRESOS', { 'BOLETA ELECTRONICA': 'REVISADO CONFORME' })).receipts,
+    ).toEqual({
+      text: 'REVISADO CONFORME',
+      authorized: true,
+    })
+    expect(parseProgressPage(progressPage('LIBROS', { 'SET BOLETA': 'EN REVISION' })).receipts).toEqual({
+      text: 'EN REVISION',
+      authorized: false,
+    })
+    expect(parseProgressPage(progressPage('LIBROS', { Boleta: ' Autorizado ' })).receipts).toEqual({
+      text: 'Autorizado',
+      authorized: true,
+    })
+  })
+
+  test('a wording that denies, or that is unknown, is not an authorisation', () => {
+    const authorized = (text: string): boolean | undefined =>
+      parseProgressPage(progressPage('LIBROS', { 'BOLETA ELECTRONICA': text })).receipts?.authorized
+    for (const text of ['AUTORIZADA', 'Aprobado', 'REVISADO CONFORME']) expect(authorized(text)).toBe(true)
+    for (const text of [
+      'NO AUTORIZADO',
+      'DESAUTORIZADA',
+      'NO CONFORME',
+      'INCONFORME',
+      'SIN AUTORIZACION',
+      'AUTORIZADO CON REPAROS',
+      'AUTORIZACION PENDIENTE',
+      'RECHAZADO',
+      'OTRO ESTADO',
+    ])
+      expect(authorized(text)).toBe(false)
+  })
+
+  test('a page without a receipts row gives null, whatever its text says about receipts', () => {
+    const sentence = `${progressPage('LIBROS', {})}<p>Empresa autorizada para emitir boleta electrónica</p>`
+    expect(parseProgressPage(sentence).receipts).toBeNull()
+    expect(parseProgressPage(progressPage('LIBROS', { 'SET BASICO': 'REVISADO CONFORME' })).receipts).toBeNull()
+  })
+})
```

`tests/rut.test.ts` (save the diff and run `git apply`; a line that looks empty inside a hunk is a context line):

```diff
diff --git a/tests/rut.test.ts b/tests/rut.test.ts
index 69bdee9..7e3c7db 100644
--- a/tests/rut.test.ts
+++ b/tests/rut.test.ts
@@ -1,4 +1,4 @@
-import { toSiiRut, isSiiRut, splitSiiRut } from '../src/model/rut'
+import { toSiiRut, isSiiRut, siiRutOfBody, splitSiiRut } from '../src/model/rut'
 import { DteError } from '../src/errors'
 
 describe('toSiiRut', () => {
@@ -45,3 +45,22 @@ describe('splitSiiRut', () => {
     expect(splitSiiRut(toSiiRut('14625621-K'))).toEqual({ body: '14625621', verifier: 'K' })
   })
 })
+
+describe('siiRutOfBody', () => {
+  test('computes the verifier of a body of 7 or 8 digits', () => {
+    expect(siiRutOfBody('76543210')).toBe('76543210-3')
+    expect(siiRutOfBody('12345678')).toBe('12345678-5')
+    expect(siiRutOfBody('14625621')).toBe('14625621-K')
+  })
+
+  test('anything else is an invalid RUT, named by its field', () => {
+    for (const body of ['', '123', 'abcdefgh', '123456789']) {
+      expect(() => siiRutOfBody(body, 'representative')).toThrow(DteError)
+    }
+    try {
+      siiRutOfBody('x', 'representative')
+    } catch (error) {
+      expect((error as DteError).details).toEqual({ field: 'representative' })
+    }
+  })
+})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/pages-receipts-certification tests/portal/gwt tests/portal/pages-certification-progress tests/rut --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/portal/pages/receipts-certification'`; `gwtNull` is not exported by `src/portal/gwt.ts`, `siiRutOfBody` by `src/model/rut.ts`, and the progress page has no `receipts`.

- [ ] **Step 3: Write the implementation**

`src/portal/pages/receipts-certification.ts` (new file, whole):

```ts
import type { GwtAnswer } from '../gwt'

const REPRESENTATIVE = /^\d{7,8}$/
const AUTHORIZATION_DATE = /^\d{2}\/\d{2}\/\d{4}$/
const STATE = /^P\d+$/
const EMPTY_LIST = /^\/\/OK\[0,\[\]/
const MIN_SET_LENGTH = 10
const NO_TOKEN = '0'

/**
 * EN: The digits of a representative in the portal's list: the last string of the table made of 7 or 8 digits, or
 * null. A company without valid representatives, one that is not enrolled, answers an empty table.
 * ES: Los dígitos de un representante en la lista del portal: el último string de la tabla hecho de 7 u 8 dígitos, o
 * null. Una empresa sin representantes vigentes, una que no está inscrita, responde una tabla vacía.
 */
export const representativeDigitsOf = (answer: GwtAnswer): string | null =>
  [...answer.table].reverse().find((item) => REPRESENTATIVE.test(item)) ?? null

/**
 * EN: What the declaration needs from the application record.
 * ES: Lo que la declaración necesita del registro de la postulación.
 */
export type ReceiptsPostulation = {
  /** EN: The authorisation date, `dd/mm/yyyy`, or empty. ES: La fecha de autorización, `dd/mm/aaaa`, o vacía. */
  readonly authorizationDate: string
  /** EN: The application's Long as the portal wrote it, or `0`. ES: El Long de la postulación como lo escribió el portal, o `0`. */
  readonly token: string
}

/**
 * EN: Reads the application record: the first string of the table shaped as a date, and the first single-quoted token
 * of the body.
 * ES: Lee el registro de la postulación: el primer string de la tabla con forma de fecha, y el primer token entre
 * comillas simples del cuerpo.
 */
export const postulationOf = (answer: GwtAnswer): ReceiptsPostulation => ({
  authorizationDate: answer.table.find((item) => AUTHORIZATION_DATE.test(item)) ?? '',
  token: /'([^']+)'/.exec(answer.body)?.[1] ?? NO_TOKEN,
})

/**
 * EN: The states a status answer names: the strings of its table that are exactly `P<digits>`, in order. An answer
 * that is not `//OK` names none: the raw body is never searched, so a state quoted inside a sentence or an exception
 * does not count.
 * ES: Los estados que nombra una respuesta de estado: los strings de su tabla que son exactamente `P<dígitos>`, en
 * orden. Una respuesta que no es `//OK` no nombra ninguno: nunca se busca en el cuerpo crudo, así que un estado
 * citado dentro de una frase o de una excepción no cuenta.
 */
export const receiptsStatesOf = (answer: GwtAnswer): readonly string[] =>
  answer.ok ? answer.table.filter((item) => STATE.test(item)) : []

/**
 * EN: The status answer is an empty list: the company is not in the state asked for.
 * ES: La respuesta de estado es una lista vacía: la empresa no está en el estado consultado.
 */
export const isEmptyList = (body: string): boolean => EMPTY_LIST.test(body)

/**
 * EN: The download gave the receipts test set: HTTP 200 and at least ten characters of text.
 * ES: La descarga entregó el set de pruebas de boletas: HTTP 200 y al menos diez caracteres de texto.
 */
export const isReceiptsSet = (status: number, text: string): boolean =>
  status === 200 && text.trim().length >= MIN_SET_LENGTH

/**
 * EN: The values of the declaration body.
 * ES: Los valores del cuerpo de la declaración.
 */
export type ReceiptsComplianceValues = {
  /** EN: The module base URL. ES: La URL base del módulo. */
  readonly moduleBase: string
  /** EN: The serialization policy. ES: La política de serialización. */
  readonly policy: string
  /** EN: The service interface. ES: La interfaz del servicio. */
  readonly serviceInterface: string
  /** EN: The company: digits and verifier. ES: La empresa: dígitos y verificador. */
  readonly company: { readonly digits: string; readonly verifier: string }
  /** EN: The software provider: digits and verifier. ES: El proveedor de software: dígitos y verificador. */
  readonly provider: { readonly digits: string; readonly verifier: string }
  /** EN: The representative who holds the session: digits and verifier. ES: El representante dueño de la sesión: dígitos y verificador. */
  readonly representative: { readonly digits: string; readonly verifier: string }
  /** EN: The date of the declaration, `dd-mm-yyyy`. ES: La fecha de la declaración, `dd-mm-aaaa`. */
  readonly date: string
  /** EN: The provider's mail. ES: El correo del proveedor. */
  readonly providerMail: string
  /** EN: The provider's name. ES: El nombre del proveedor. */
  readonly providerName: string
  /** EN: The query link. ES: El link de consulta. */
  readonly link: string
  /** EN: The authorisation date of the application. ES: La fecha de autorización de la postulación. */
  readonly authorizationDate: string
  /** EN: The application's Long, as the portal wrote it. ES: El Long de la postulación, como lo escribió el portal. */
  readonly token: string
  /** EN: The company's business name. ES: La razón social de la empresa. */
  readonly businessName: string
}

const escapeTableString = (value: string): string => value.replace(/\\/g, '\\\\').replace(/\|/g, '\\!')

/**
 * EN: The body of `autorizarEmpresaBolProd`, as the portal's own page writes it: a table of 24 strings and a fixed
 * sequence with the values in their places. One application record (target state `P91`, `BVE`, the state 90, the
 * company) holds one authorised-company record (the three verifiers, `SII`, the date, the provider, the three RUTs,
 * the link) with a list of two authorised documents, types 39 and 41; `-11` refers back to the application's Long
 * each time it appears. The codec does not write back-references, and the field names are known by position only.
 * ES: El cuerpo de `autorizarEmpresaBolProd`, como lo escribe la propia página del portal: una tabla de 24 strings y
 * una secuencia fija con los valores en sus lugares. Un registro de postulación (estado destino `P91`, `BVE`, el
 * estado 90, la empresa) lleva un registro de empresa autorizada (los tres verificadores, `SII`, la fecha, el
 * proveedor, los tres RUT, el link) con una lista de dos documentos autorizados, tipos 39 y 41; `-11` vuelve a
 * referirse al Long de la postulación cada vez que aparece. El codec no escribe referencias hacia atrás, y los nombres
 * de los campos se conocen solo por posición.
 */
export const receiptsComplianceBody = (values: ReceiptsComplianceValues): string => {
  const table = [
    values.moduleBase,
    values.policy,
    values.serviceInterface,
    'autorizarEmpresaBolProd',
    'cl.sii.sdi.diii.certBolElectDte.to.PostulSegHistInsUpdTo/138688689',
    'P91',
    'BVE',
    'java.lang.Integer/3438268394',
    values.company.verifier,
    'cl.sii.sdi.diii.certBolElectDte.to.TdtEmpresaAutorizadaTo/2240026086',
    values.provider.verifier,
    values.representative.verifier,
    'SII',
    values.date,
    values.providerMail,
    values.providerName,
    '19',
    'S',
    values.link,
    'java.util.ArrayList/4159755760',
    'cl.sii.sdi.diii.certBolElectDte.to.DocumentoAutorizadoTo/493967287',
    values.authorizationDate,
    'java.lang.Long/4227064769',
    values.businessName,
  ]
  const E = values.company.digits
  const P = values.provider.digits
  const U = values.representative.digits
  const L = values.token
  const body = `1|2|3|4|1|5|5|6|0|7|8|90|0|0|0|0|9|0|10|0|7|9|11|12|13|14|14|14|15|16|17|18|8|${E}|8|${P}|8|${U}|19|14|14|0|20|2|21|0|0|9|12|22|0|0|0|0|0|0|8|${E}|8|${U}|23|${L}|-11|8|39|0|21|0|0|9|12|22|0|0|0|0|0|0|8|${E}|8|${U}|-11|-11|8|41|0|0|24|-11|0|8|${E}|0|0|`
  return `7|0|${table.length}|${table.map(escapeTableString).join('|')}|${body}`
}
```

`src/portal/gwt.ts` (save the diff and run `git apply`; a line that looks empty inside a hunk is a context line):

```diff
diff --git a/src/portal/gwt.ts b/src/portal/gwt.ts
index 7699c92..5103106 100644
--- a/src/portal/gwt.ts
+++ b/src/portal/gwt.ts
@@ -6,17 +6,19 @@ import { portalRequest, type PortalContext, type PortalPage } from './session'
 /**
  * EN: One parameter of a GWT-RPC call, as the SII's portals serialize it: a string (interned in the table, `0` when
  * null), a boxed `java.lang.Integer`, a boxed `java.lang.Long` (a number, or a token already in the GWT base-64
- * alphabet), a primitive boolean (`Z`), null, or an object with its fields in serialization order.
+ * alphabet), a primitive boolean (`Z`), null (a String unless it names its declared type), or an object with its fields
+ * in serialization order.
  * ES: Un parámetro de una llamada GWT-RPC, como lo serializan los portales del SII: un string (en la tabla, `0` si es
  * null), un `java.lang.Integer` encajonado, un `java.lang.Long` encajonado (un número, o un token ya en el alfabeto
- * base 64 de GWT), un booleano primitivo (`Z`), null, o un objeto con sus campos en orden de serialización.
+ * base 64 de GWT), un booleano primitivo (`Z`), null (un String salvo que nombre su tipo declarado), o un objeto con
+ * sus campos en orden de serialización.
  */
 export type GwtParameter =
   | { readonly kind: 'string'; readonly value: string | null }
   | { readonly kind: 'integer'; readonly value: number }
   | { readonly kind: 'long'; readonly value: number | string }
   | { readonly kind: 'boolean'; readonly value: boolean }
-  | { readonly kind: 'null' }
+  | { readonly kind: 'null'; readonly type?: string }
   | { readonly kind: 'object'; readonly type: string; readonly fields: readonly GwtParameter[] }
 
 /**
@@ -126,8 +128,9 @@ const serialize = (call: GwtCall): { readonly table: string[]; readonly body: st
   const typeOf = (parameter: GwtParameter): string => {
     switch (parameter.kind) {
       case 'string':
-      case 'null':
         return GWT_STRING
+      case 'null':
+        return parameter.type ?? GWT_STRING
       case 'integer':
         return GWT_INTEGER
       case 'long':
@@ -317,6 +320,8 @@ export const gwtLong = (value: number | string): GwtParameter => ({ kind: 'long'
 export const gwtBoolean = (value: boolean): GwtParameter => ({ kind: 'boolean', value })
 /** EN: A null parameter or field. ES: Un parámetro o campo nulo. */
 export const GWT_NULL: GwtParameter = { kind: 'null' }
+/** EN: A null parameter declared with a type other than String. ES: Un parámetro nulo declarado con un tipo distinto de String. */
+export const gwtNull = (type: string): GwtParameter => ({ kind: 'null', type })
 
 const REDIRECT_STATUS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308])
 
```

`src/model/rut.ts` (save the diff and run `git apply`; a line that looks empty inside a hunk is a context line):

```diff
diff --git a/src/model/rut.ts b/src/model/rut.ts
index 89549be..cc0c3ff 100644
--- a/src/model/rut.ts
+++ b/src/model/rut.ts
@@ -1,4 +1,4 @@
-import { decompose, format } from 'rut.ts'
+import { calculateVerifier, decompose, format } from 'rut.ts'
 import { DteError } from '../errors'
 
 declare const SII_RUT_BRAND: unique symbol
@@ -45,3 +45,16 @@ export const splitSiiRut = (rut: SiiRut): { readonly body: string; readonly veri
   const { body, verifier } = decompose(rut)
   return { body, verifier }
 }
+
+/**
+ * EN: A SII RUT from its body alone: rut.ts computes the verifier (Modulo 11).
+ * ES: Un RUT SII a partir de solo su cuerpo: rut.ts calcula el dígito verificador (módulo 11).
+ * @param body EN: the 7 or 8 digits. ES: los 7 u 8 dígitos.
+ * @param field EN: field name for the error details (default `rut`). ES: nombre del campo para los detalles del error (por defecto `rut`).
+ * @throws {DteError} EN: `INVALID_RUT` when the body is not 7 or 8 digits. ES: `INVALID_RUT` si el cuerpo no son 7 u 8 dígitos.
+ */
+export const siiRutOfBody = (body: string, field = 'rut'): SiiRut => {
+  const verifier = calculateVerifier(body, { throwOnError: false })
+  if (verifier === null) throw new DteError('INVALID_RUT', { field })
+  return toSiiRut(`${body}-${verifier}`, field)
+}
```

`src/catalogs/certification.ts` (save the diff and run `git apply`; a line that looks empty inside a hunk is a context line):

```diff
diff --git a/src/catalogs/certification.ts b/src/catalogs/certification.ts
index d2f8145..a0bd0e1 100644
--- a/src/catalogs/certification.ts
+++ b/src/catalogs/certification.ts
@@ -261,3 +261,17 @@ export const EXCHANGE_ANSWER_FILES: Readonly<Record<ExchangeAnswerKey, string>>
   receipts: 'envio-recibos.xml',
   approval: 'respuesta-aprobacion-comercial.xml',
 }
+
+/**
+ * EN: The receipts portal (`certBolElectDteInternet`), where the certification of electronic receipts runs. Its
+ * hashes are not discovered: `moduleName` is what its interface suggests, not a recorded fact.
+ * ES: El portal de boletas (`certBolElectDteInternet`), donde corre la certificación de boletas electrónicas. Sus
+ * hashes no se descubren: `moduleName` es lo que sugiere su interfaz, no un dato registrado.
+ */
+export const RECEIPTS_PORTAL: GwtPortal = {
+  base: 'https://www4.sii.cl/certBolElectDteInternet/',
+  service: 'facade',
+  serviceInterface: 'cl.sii.sdi.diii.certBolElectDte.web.client.service.Facade',
+  moduleName: 'certBolElectDte',
+  known: { permutation: '0FC3D987613537E6E13E9BB93A406F13', policy: '082D0AC4BC4D75A5DF38F116C53877D4' },
+}
```

`src/catalogs/portal.ts` (save the diff and run `git apply`; a line that looks empty inside a hunk is a context line):

```diff
diff --git a/src/catalogs/portal.ts b/src/catalogs/portal.ts
index e77306b..e7efee8 100644
--- a/src/catalogs/portal.ts
+++ b/src/catalogs/portal.ts
@@ -182,6 +182,9 @@ export type PortalRejection =
   | 'exchangeUploadRefused'
   | 'samplesReviewRefused'
   | 'sampleUploadRefused'
+  | 'receiptsNotEnrolled'
+  | 'receiptsTrackIdRefused'
+  | 'receiptsComplianceRefused'
 
 /**
  * EN: What each rejection means and what to do about it, in Spanish, for the operator.
@@ -245,6 +248,12 @@ export const PORTAL_REJECTIONS: Readonly<Record<PortalRejection, string>> = {
     'El portal de muestras impresas no creó la revisión: el motivo es la frase del SII, en `details.portalMessage`.',
   sampleUploadRefused:
     'El portal de muestras impresas rechazó un PDF con un estado 4xx: el archivo va en `details.file` y el estado en `details.httpStatus`.',
+  receiptsNotEnrolled:
+    'La empresa no tiene representantes vigentes en el portal de boletas: debe inscribirse en la postulación a boleta electrónica antes de declarar.',
+  receiptsTrackIdRefused:
+    'El portal de boletas no aceptó el track id del set: lo que respondió va en `details.portalMessage`.',
+  receiptsComplianceRefused:
+    'El portal de boletas no aceptó la declaración de cumplimiento: revisa que el representante sea el dueño de la sesión y que el proveedor sea el real; lo que respondió va en `details.portalMessage`.',
 }
 
 /**
```

`src/portal/pages/certification-progress.ts` (save the diff and run `git apply`; a line that looks empty inside a hunk is a context line):

```diff
diff --git a/src/portal/pages/certification-progress.ts b/src/portal/pages/certification-progress.ts
index 4c0e781..5cf208c 100644
--- a/src/portal/pages/certification-progress.ts
+++ b/src/portal/pages/certification-progress.ts
@@ -96,6 +96,19 @@ export type ProgressPage = {
   readonly states: Readonly<Partial<Record<DeclarationKey, { readonly text: string; readonly state: ItemState }>>>
   /** EN: The page offers to confirm the review of an approved simulation. ES: La página ofrece confirmar la revisión de una simulación aprobada. */
   readonly simulationAwaitsConfirmation: boolean
+  /** EN: The receipts row: its bold text and whether it says the company is authorised; null when the page has none. ES: La fila de boletas: su texto en negrita y si dice que la empresa está autorizada; null si la página no la trae. */
+  readonly receipts: ReceiptsProgress | null
+}
+
+/**
+ * EN: The receipts row of the progress page.
+ * ES: La fila de boletas de la página de avance.
+ */
+export type ReceiptsProgress = {
+  /** EN: The bold text of the row. ES: El texto en negrita de la fila. */
+  readonly text: string
+  /** EN: The text says conforming, approved or authorised, as a whole word and without a word that denies it. ES: El texto dice conforme, aprobado o autorizado, como palabra completa y sin una palabra que lo niegue. */
+  readonly authorized: boolean
 }
 
 const DEFAULT_TOTAL_ROWS = 10
@@ -313,6 +326,19 @@ export const portalStageOf = (stage: string | null): CertificationStage => {
   return PORTAL_STAGE_WORDS.find((entry) => entry.words.some((word) => upper.includes(word)))?.stage ?? 'testSets'
 }
 
+const RECEIPTS_ROW = /BOLETA[^<]*<\/[^>]+>\s*<[^>]+><b>([^<]+)<\/b>/i
+const RECEIPTS_AUTHORIZED = /\b(?:CONFORME|APROBAD[OA]|AUTORIZAD[OA])\b/i
+const RECEIPTS_REFUSED = /\bNO\b|\bSIN\b|RECHAZ|REPARO|PENDIENTE/i
+
+// The bold text after the cell that names the receipts. It reads as authorised only on a whole word that says so and
+// no word that denies it: "NO AUTORIZADO" and "DESAUTORIZADA" are not authorisations, and anything unknown is not one.
+const receiptsProgressOf = (html: string): ReceiptsProgress | null => {
+  const row = RECEIPTS_ROW.exec(html)
+  if (row === null) return null
+  const text = row[1].trim()
+  return { text, authorized: RECEIPTS_AUTHORIZED.test(text) && !RECEIPTS_REFUSED.test(text) }
+}
+
 /**
  * EN: Reads the progress page: the stage from the first pattern that matches, and per set or book the first bold text
  * after its label, row by row (a page-wide search once took the next row's state), plus whether an approved
@@ -341,5 +367,6 @@ export const parseProgressPage = (html: string): ProgressPage => {
     states,
     simulationAwaitsConfirmation:
       html.includes('pe_avance3') && /SET DE SIMULACION/i.test(html) && /Confirmar Revisi/i.test(decodeEntities(html)),
+    receipts: receiptsProgressOf(html),
   }
 }
```

`src/portal/certification.ts` (save the diff and run `git apply`; a line that looks empty inside a hunk is a context line):

```diff
diff --git a/src/portal/certification.ts b/src/portal/certification.ts
index 281e170..b0f2b86 100644
--- a/src/portal/certification.ts
+++ b/src/portal/certification.ts
@@ -25,6 +25,7 @@ import {
   type AdvanceAnswer,
   type DeclarationAnswer,
   type ItemState,
+  type ReceiptsProgress,
   type VerificationState,
 } from './pages/certification-progress'
 import {
@@ -204,6 +205,8 @@ export type ProgressReport = {
   readonly simulationAwaitsConfirmation: boolean
   /** EN: The rows of `pe_avance2`, read on the way. ES: Las filas de `pe_avance2`, leídas de paso. */
   readonly rows: readonly CertificationSet[]
+  /** EN: The receipts row of the page, or null. ES: La fila de boletas de la página, o null. */
+  readonly receipts: ReceiptsProgress | null
 }
 
 /**
@@ -549,6 +552,7 @@ export const readProgress = (
       states: progress.states,
       simulationAwaitsConfirmation: progress.simulationAwaitsConfirmation || onForm,
       rows: parseCertificationSets(formPage.html),
+      receipts: progress.receipts,
     }
   })
 
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/pages-receipts-certification tests/portal/gwt tests/portal/pages-certification-progress tests/rut --coverage=false
```

Expected: PASS, 67 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/portal/pages/receipts-certification.ts src/portal/gwt.ts src/model/rut.ts src/catalogs/certification.ts src/catalogs/portal.ts src/portal/pages/certification-progress.ts src/portal/certification.ts tests/portal/pages-receipts-certification.test.ts tests/portal/gwt.test.ts tests/portal/pages-certification-progress.test.ts tests/rut.test.ts
```

```bash
git commit -F - <<'MSG'
feat: the answers of the receipts portal, a typed null in the codec and the receipts row of the progress page

The receipts portal's answers are read by pure functions: the
representative, the application record, the state, the set download, and
the declaration body written as the portal's own page writes it, a table
of 24 strings with back-references. The codec gains a null that names
its declared type, which one call of this portal needs. The catalog names
the portal and its known hashes, and three rejections; the progress page
gives the receipts row.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 6: The receipts portal operations

The five operations (spec 3.7): `downloadReceiptsTestSet` (the two calls the portal wants first, then `DownloadFileServlet` with the company, the representative and the provider's mail), `declareReceiptsTrackId` (`ingresarTrackId`, once), `readReceiptsStatus` (enrolled, `P90` ready to declare, `P91` declared, the empty list for 90 settled by asking for 91), `declareReceiptsCompliance` (the status first, the session owner as representative, the mandatory provider, the application record, the declaration sent once) and `verifyReceiptsAuthorization` (type 39 among the stamping types of a production client, the receipts row of the certification progress page; never throws). A status other than 200 is not an answer.

**Files:**

- Create: `src/portal/receipts-certification.ts`
- Test (create): `tests/portal/receipts-certification.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/portal/receipts-certification.test.ts` (new file, whole):

```ts
import { RECEIPTS_PORTAL } from '../../src/catalogs/certification'
import { receiptsComplianceBody } from '../../src/portal/pages/receipts-certification'
import {
  declareReceiptsCompliance,
  declareReceiptsTrackId,
  downloadReceiptsTestSet,
  readReceiptsStatus,
  verifyReceiptsAuthorization,
} from '../../src/portal/receipts-certification'
import type { Logger } from '../../src/sii/logger'
import { get, post } from '../support/certification-harness'
import { progressPage } from '../support/certification-pages'
import { gwtMethodOf } from '../support/exchange-fixtures'
import type { FakeReply, FakeRoute, RecordedRequest } from '../support/fake-sii'
import { EMPTY_OK, EXCEPTION, okAnswer } from '../support/gwt-answers'
import { failure, PALENA, portalWith, seedSession, signedIn, type PortalHarness } from '../support/portal'
import {
  BOLETA_OPTION,
  certificationPage,
  FACTURA_OPTION,
  page,
  STAMP_ENTRY,
  typeSelector,
} from '../support/portal-pages'
import { RECEIPTS_SET_TEXT } from '../support/receipts-set-samples'

const BASE = RECEIPTS_PORTAL.base
const FACADE = `${BASE}facade`
const KNOWN = RECEIPTS_PORTAL.known
const SERVICE = RECEIPTS_PORTAL.serviceInterface
const INTEGER = 'java.lang.Integer/3438268394'
const STRING = 'java.lang.String/2004016611'
const HEAD = `${BASE}|${KNOWN.policy}|${SERVICE}`
const LIST = 'recuperarRepresentantesVigentesUsuariosAutorizados'
const REPRESENTATIVES = okAnswer([2, 1], ['cl.sii.sdi.diii.certBolElectDte.to.RepreTo/1', '1', '11111111'])
const POSTULATION = '//OK[3,\'BAqo\',2,1,["cl.sii.x/1","10/11/2026"],0,7]'
const READY = okAnswer([1], ['cl.sii.x/1', 'P90'])
const DECLARED = okAnswer([1], ['cl.sii.x/1', 'P91'])
const provider = { rut: '10.000.004-0', name: 'Proveedor de Software SpA', mail: 'soporte@example.test' }
const businessName = 'Comercial Andina SpA'

type Answers = Readonly<Record<string, FakeReply | ((request: RecordedRequest, call: number) => FakeReply)>>
const facade = (answers: Answers = {}): FakeRoute => {
  const calls = new Map<string, number>()
  return {
    method: 'POST',
    url: FACADE,
    reply: (request) => {
      const method = gwtMethodOf(request)
      const call = (calls.get(method) ?? 0) + 1
      calls.set(method, call)
      const answer = answers[method] ?? (method === LIST ? { body: REPRESENTATIVES } : { body: EMPTY_OK })
      return typeof answer === 'function' ? answer(request, call) : answer
    },
  }
}
const servlet = (reply: FakeReply = { body: RECEIPTS_SET_TEXT }): FakeRoute => ({
  method: 'GET',
  url: `${BASE}DownloadFileServlet*`,
  reply,
})
const posts = (harness: PortalHarness): readonly RecordedRequest[] =>
  harness.fake.requests.filter((request) => request.url === FACADE)
const methods = (harness: PortalHarness): readonly string[] => posts(harness).map(gwtMethodOf)
const logger = (): Logger & { readonly lines: string[] } => {
  const lines: string[] = []
  const log = (message: string): void => void lines.push(message)
  return { debug: log, info: log, warn: log, error: log, lines }
}
const retrying = { retry: { maxAttempts: 3, initialDelayMs: 1 } }
// A session whose cookies name no RUT: the representative then comes from the portal's list.
const anonymous = async (routes: readonly FakeRoute[]): Promise<PortalHarness> => {
  const harness = portalWith(routes)
  await seedSession(harness.portal, { 'NETSCAPE_LIVEWIRE.locexp': 'x' })
  return harness
}

describe('downloadReceiptsTestSet', () => {
  test('reads the representatives and the application, then downloads the set with the session owner as representative', async () => {
    const harness = await signedIn([facade(), servlet()])
    const result = await downloadReceiptsTestSet(harness.portal, { providerMail: 'soporte@example.test' })
    expect(result).toEqual({ text: RECEIPTS_SET_TEXT, representativeRut: '12345678-5' })
    expect(posts(harness).map((request) => request.text)).toEqual([
      `7|0|7|${HEAD}|${LIST}|${INTEGER}|${STRING}|3|1|2|3|4|2|5|6|5|76543210|7|`,
      `7|0|9|${HEAD}|obtenerPostulacionSeg|${INTEGER}|${STRING}|3|90|P90|1|2|3|4|4|5|6|6|6|5|76543210|7|8|9|`,
    ])
    expect(posts(harness)[0].headers).toMatchObject({
      'content-type': 'text/x-gwt-rpc; charset=UTF-8',
      'x-gwt-module-base': BASE,
      'x-gwt-permutation': KNOWN.permutation,
    })
    const download = harness.fake.requests[2]
    expect(download.method).toBe('GET')
    expect(download.url).toBe(
      `${BASE}DownloadFileServlet?rutEmpresa=76543210&dvEmpresa=3&rutRepre=12345678&dvRepre=5&mailProvSw=soporte%40example.test`,
    )
    expect(download.headers).toMatchObject({ referer: `${BASE}?SET=1`, accept: 'text/plain,text/html,*/*' })
  })

  test('without a RUT in the session the representative is the last of the portal list, its verifier computed', async () => {
    const harness = await anonymous([facade(), servlet()])
    const gwt = { permutation: 'A'.repeat(32), policy: 'B'.repeat(32) }
    const result = await downloadReceiptsTestSet(harness.portal, { companyRut: '12.345.678-5', gwt })
    expect(result.representativeRut).toBe('11111111-1')
    expect(harness.urls()[2]).toBe(
      `${BASE}DownloadFileServlet?rutEmpresa=12345678&dvEmpresa=5&rutRepre=11111111&dvRepre=1&mailProvSw=`,
    )
    expect(posts(harness)[0].text).toContain(`|${gwt.policy}|`)
    expect(posts(harness)[0].headers['x-gwt-permutation']).toBe(gwt.permutation)
  })

  test('no representative anywhere is a missing field; a download that is no set is unexpected', async () => {
    const nobody = await anonymous([facade({ [LIST]: { body: EMPTY_OK } }), servlet()])
    const missing = await failure(downloadReceiptsTestSet(nobody.portal))
    expect(missing.code).toBe('MISSING_FIELD')
    expect(missing.details).toEqual({ field: 'representative' })
    const short = await signedIn([facade(), servlet({ body: '  nada  ' })])
    expect((await failure(downloadReceiptsTestSet(short.portal))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    const down = await signedIn([facade(), servlet({ status: 500, body: RECEIPTS_SET_TEXT })])
    expect((await failure(downloadReceiptsTestSet(down.portal))).details['step']).toBe('DownloadFileServlet')
  })
})

describe('declareReceiptsTrackId', () => {
  test('posts ingresarTrackId with the company, the state 90 and the track id, once', async () => {
    const harness = await signedIn([facade()])
    await expect(declareReceiptsTrackId(harness.portal, { trackId: ' 9876543210 ' })).resolves.toEqual({
      body: EMPTY_OK,
    })
    expect(posts(harness).map((request) => request.text)).toEqual([
      `7|0|9|${HEAD}|ingresarTrackId|${INTEGER}|${STRING}|3|90|9876543210|1|2|3|4|7|5|6|6|6|5|6|6|5|76543210|7|0|8|0|0|9|`,
    ])
  })

  test('an answer that is not //OK is a refusal, an empty track id is refused before any request, and nothing is retried', async () => {
    const refused = await signedIn([facade({ ingresarTrackId: { body: EXCEPTION } })])
    const error = await failure(declareReceiptsTrackId(refused.portal, { trackId: '1' }))
    expect(error.code).toBe('SII_PORTAL_REJECTED')
    expect(error.details).toMatchObject({ rejection: 'receiptsTrackIdRefused', httpStatus: 200 })
    const quiet = await signedIn([])
    expect((await failure(declareReceiptsTrackId(quiet.portal, { trackId: '  ' }))).details).toEqual({
      field: 'trackId',
    })
    expect(quiet.urls()).toEqual([])
    const busy = await signedIn([facade({ ingresarTrackId: { status: 503, body: 'busy' } })], retrying)
    expect((await failure(declareReceiptsTrackId(busy.portal, { trackId: '1' }))).code).toBe('SII_HTTP_ERROR')
    expect(posts(busy)).toHaveLength(1)
    const down = await signedIn([facade({ ingresarTrackId: { status: 500, body: EMPTY_OK } })])
    expect((await failure(declareReceiptsTrackId(down.portal, { trackId: '1' }))).details['httpStatus']).toBe(500)
  })
})

describe('readReceiptsStatus', () => {
  test('a company without representatives is not enrolled, and nothing else is asked', async () => {
    const harness = await signedIn([facade({ [LIST]: { body: EMPTY_OK } })])
    await expect(readReceiptsStatus(harness.portal)).resolves.toEqual({
      enrolled: false,
      readyToDeclare: false,
      declared: false,
      state: null,
    })
    expect(methods(harness)).toEqual([LIST])
  })

  test('P90 is ready to declare; another state is reported as it is', async () => {
    const ready = await signedIn([facade({ obtenerEstadoAutorizaEmp: { body: READY } })])
    await expect(readReceiptsStatus(ready.portal)).resolves.toEqual({
      enrolled: true,
      readyToDeclare: true,
      declared: false,
      state: 'P90',
    })
    expect(posts(ready)[1].text).toBe(
      `7|0|7|${HEAD}|obtenerEstadoAutorizaEmp|${INTEGER}|${STRING}|3|1|2|3|4|4|5|6|5|6|5|76543210|7|5|90|0|`,
    )
    const earlier = await signedIn([facade({ obtenerEstadoAutorizaEmp: { body: okAnswer([1], ['x', 'P05']) } })])
    await expect(readReceiptsStatus(earlier.portal)).resolves.toMatchObject({ readyToDeclare: false, state: 'P05' })
    expect(methods(earlier)).toEqual([LIST, 'obtenerEstadoAutorizaEmp'])
    const odd = await signedIn([
      facade({ obtenerEstadoAutorizaEmp: { body: okAnswer([1], ['La empresa no esta en estado P90']) } }),
    ])
    await expect(readReceiptsStatus(odd.portal)).resolves.toMatchObject({
      readyToDeclare: false,
      declared: false,
      state: null,
    })
    expect(methods(odd)).toHaveLength(2)
    // An answer that is not HTTP 200 is not an answer, for the list or for the state.
    const down = await signedIn([facade({ obtenerEstadoAutorizaEmp: { status: 500, body: READY } })])
    expect((await failure(readReceiptsStatus(down.portal))).details['step']).toBe('obtenerEstadoAutorizaEmp')
    const listDown = await signedIn([facade({ [LIST]: { status: 500, body: REPRESENTATIVES } })])
    expect((await failure(readReceiptsStatus(listDown.portal))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
  })

  test('an empty list for 90 is settled by asking for 91: declared, or not approved yet', async () => {
    const declared = await signedIn([
      facade({ obtenerEstadoAutorizaEmp: (_request, call) => ({ body: call === 1 ? EMPTY_OK : DECLARED }) }),
    ])
    await expect(readReceiptsStatus(declared.portal)).resolves.toEqual({
      enrolled: true,
      readyToDeclare: false,
      declared: true,
      state: 'P91',
    })
    expect(posts(declared)[2].text).toBe(
      `7|0|7|${HEAD}|obtenerEstadoAutorizaEmp|${INTEGER}|${STRING}|3|1|2|3|4|4|5|6|5|6|5|76543210|7|5|91|0|`,
    )
    const pending = await signedIn([facade()])
    await expect(readReceiptsStatus(pending.portal)).resolves.toEqual({
      enrolled: true,
      readyToDeclare: false,
      declared: false,
      state: null,
    })
    const log = logger()
    const silent = await signedIn(
      [
        facade({
          obtenerEstadoAutorizaEmp: (_request, call) => (call === 1 ? { body: EMPTY_OK } : new Error('socket hang up')),
        }),
      ],
      { logger: log },
    )
    await expect(readReceiptsStatus(silent.portal)).resolves.toMatchObject({ declared: false, state: null })
    expect(log.lines).toContain('receipts declared state unavailable')
  })
})

describe('declareReceiptsCompliance', () => {
  const ready = (extra: Answers = {}) =>
    facade({ obtenerEstadoAutorizaEmp: { body: READY }, obtenerPostulacionSeg: { body: POSTULATION }, ...extra })
  const input = { provider, businessName }

  test('with the set approved it reads the application and posts the declaration once, with the session owner as representative', async () => {
    const harness = await signedIn([ready()])
    await expect(declareReceiptsCompliance(harness.portal, input)).resolves.toEqual({
      outcome: 'declared',
      state: 'P91',
    })
    expect(methods(harness)).toEqual([
      LIST,
      'obtenerEstadoAutorizaEmp',
      'obtenerPostulacionSeg',
      'autorizarEmpresaBolProd',
    ])
    const declaration = posts(harness)[3]
    expect(declaration.text).toBe(
      receiptsComplianceBody({
        moduleBase: BASE,
        policy: KNOWN.policy,
        serviceInterface: SERVICE,
        company: { digits: '76543210', verifier: '3' },
        provider: { digits: '10000004', verifier: '0' },
        representative: { digits: '12345678', verifier: '5' },
        date: '15-11-2026',
        providerMail: 'soporte@example.test',
        providerName: 'Proveedor de Software SpA',
        link: 'www.sii.cl',
        authorizationDate: '10/11/2026',
        token: 'BAqo',
        businessName,
      }),
    )
    expect(declaration.headers).toMatchObject({
      'content-type': 'text/x-gwt-rpc; charset=UTF-8',
      'x-gwt-permutation': KNOWN.permutation,
      referer: BASE,
    })
    const linked = await signedIn([ready()])
    await declareReceiptsCompliance(linked.portal, { ...input, link: 'consulta.example.test' })
    expect(posts(linked)[3].text).toContain('|consulta.example.test|')
  })

  test('already declared, or not approved yet: an outcome, and nothing is sent', async () => {
    const declared = await signedIn([
      facade({ obtenerEstadoAutorizaEmp: (_request, call) => ({ body: call === 1 ? EMPTY_OK : DECLARED }) }),
    ])
    await expect(declareReceiptsCompliance(declared.portal, input)).resolves.toEqual({
      outcome: 'alreadyDeclared',
      state: 'P91',
    })
    const pending = await signedIn([facade()])
    await expect(declareReceiptsCompliance(pending.portal, input)).resolves.toEqual({
      outcome: 'notReady',
      state: null,
    })
    for (const harness of [declared, pending]) expect(methods(harness)).not.toContain('autorizarEmpresaBolProd')
  })

  test('a company that is not enrolled, and a declaration the portal does not take, are refusals', async () => {
    const outsider = await signedIn([facade({ [LIST]: { body: EMPTY_OK } })])
    expect((await failure(declareReceiptsCompliance(outsider.portal, input))).details['rejection']).toBe(
      'receiptsNotEnrolled',
    )
    const refused = await signedIn([ready({ autorizarEmpresaBolProd: { body: EXCEPTION } })])
    const error = await failure(declareReceiptsCompliance(refused.portal, input))
    expect(error.code).toBe('SII_PORTAL_REJECTED')
    expect(error.details).toMatchObject({ rejection: 'receiptsComplianceRefused', httpStatus: 200 })
    expect(error.details['portalMessage']).toContain('The call failed on the server')
    const down = await signedIn([ready({ autorizarEmpresaBolProd: { status: 500, body: '//OK[0,[],0,7]' } })])
    expect((await failure(declareReceiptsCompliance(down.portal, input))).details['httpStatus']).toBe(500)
    const busy = await signedIn([ready({ autorizarEmpresaBolProd: { status: 503, body: 'busy' } })], retrying)
    expect((await failure(declareReceiptsCompliance(busy.portal, input))).code).toBe('SII_HTTP_ERROR')
    expect(methods(busy).filter((method) => method === 'autorizarEmpresaBolProd')).toHaveLength(1)
  })

  test('the provider and the business name are mandatory, checked before any request', async () => {
    const quiet = await signedIn([])
    const fieldOf = async (bad: unknown): Promise<unknown> =>
      (await failure(declareReceiptsCompliance(quiet.portal, bad as Parameters<typeof declareReceiptsCompliance>[1])))
        .details['field']
    expect(await fieldOf({ businessName })).toBe('provider')
    expect(await fieldOf({ provider: { ...provider, rut: ' ' }, businessName })).toBe('provider.rut')
    expect(await fieldOf({ provider: { ...provider, name: '' }, businessName })).toBe('provider.name')
    expect(await fieldOf({ provider: { rut: provider.rut, name: provider.name }, businessName })).toBe('provider.mail')
    expect(await fieldOf({ provider, businessName: '  ' })).toBe('businessName')
    const invalid = await failure(
      declareReceiptsCompliance(quiet.portal, { provider: { ...provider, rut: '1-2' }, businessName }),
    )
    expect(invalid.code).toBe('INVALID_RUT')
    expect(quiet.urls()).toEqual([])
  })

  test('without a RUT in the session the representative of the declaration comes from the portal list', async () => {
    const harness = await anonymous([ready()])
    await declareReceiptsCompliance(harness.portal, input)
    expect(posts(harness)[3].text).toContain('|8|76543210|8|10000004|8|11111111|')
  })
})

describe('verifyReceiptsAuthorization', () => {
  const stamping = (selector: string): FakeRoute[] => [
    { url: `${PALENA}/of_solicita_folios`, method: 'GET', reply: { body: STAMP_ENTRY } },
    { url: `${PALENA}/of_solicita_folios_dcto`, method: 'POST', reply: { body: selector } },
  ]
  const production = async (selector: string) => {
    const harness = portalWith(stamping(selector), { environment: 'production' })
    await seedSession(harness.portal)
    return harness
  }
  const certification = (progress: string) =>
    signedIn([
      get('pe_avance1', page('entry')),
      post('pe_avance2', certificationPage()),
      get('pe_avance5', page('p5')),
      post('pe_avance6', progress),
    ])

  test('production is authorised when type 39 can be stamped; certification reads the receipts row', async () => {
    const live = await production(typeSelector(`${FACTURA_OPTION}${BOLETA_OPTION}`))
    const test = await certification(progressPage('DOCUMENTOS IMPRESOS', { 'BOLETA ELECTRONICA': 'REVISADO CONFORME' }))
    await expect(verifyReceiptsAuthorization({ production: live.portal, certification: test.portal })).resolves.toEqual(
      {
        production: { authorized: true, queryFailed: false, types: [33, 39] },
        certification: { authorized: true, queryFailed: false, state: 'REVISADO CONFORME' },
      },
    )
    expect(live.posted('of_solicita_folios_dcto')[0]).toMatchObject({ RUT_EMP: '76543210', DV_EMP: '3' })
  })

  test('no type 39 and no receipts row are plain answers; a side without a client is null', async () => {
    const live = await production(typeSelector(FACTURA_OPTION))
    const test = await certification(progressPage('LIBROS', { 'SET BASICO': 'REVISADO CONFORME' }))
    await expect(
      verifyReceiptsAuthorization({ production: live.portal, certification: test.portal, companyRut: '76543210-3' }),
    ).resolves.toEqual({
      production: { authorized: false, queryFailed: false, types: [33] },
      certification: { authorized: false, queryFailed: false, state: null },
    })
    await expect(verifyReceiptsAuthorization({})).resolves.toEqual({ production: null, certification: null })
  })

  test('a form the portal does not serve is a failed query, never "not authorised"', async () => {
    const live = await production(page('LIBRUD-OFSF-DTE-3-1-02 No ha sido posible completar su solicitud'))
    const test = await signedIn([])
    const result = await verifyReceiptsAuthorization({ production: live.portal, certification: test.portal })
    expect(result.production).toMatchObject({
      authorized: false,
      queryFailed: true,
      errorCode: 'SII_PORTAL_UNEXPECTED_PAGE',
      types: [],
    })
    expect(result.certification).toMatchObject({ authorized: false, queryFailed: true, state: null })
    expect(result.certification?.error).toContain('no route')
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/receipts-certification --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/portal/receipts-certification'`.

- [ ] **Step 3: Write the implementation**

`src/portal/receipts-certification.ts` (new file, whole):

```ts
import { RECEIPTS_PORTAL } from '../catalogs/certification'
import { DteError, errorCode, errorMessage } from '../errors'
import { siiRutOfBody, splitSiiRut, toSiiRut, type SiiRut } from '../model/rut'
import type { CallOverrides } from '../sii/client'
import { bodyExcerpt } from '../sii/operation'
import { encodeUtf8 } from '../sii/transport'
import { chileDate } from '../time/chile'
import { readProgress } from './certification'
import { resolvePortalCompany, type PortalClient } from './client'
import { sessionRut } from './cookies'
import {
  GWT_CONTENT_TYPE,
  GWT_INTEGER,
  gwtHeaders,
  gwtInteger,
  gwtNull,
  gwtString,
  postGwt,
  type GwtAnswer,
  type GwtHashes,
  type GwtParameter,
} from './gwt'
import {
  isEmptyList,
  isReceiptsSet,
  postulationOf,
  receiptsComplianceBody,
  receiptsStatesOf,
  representativeDigitsOf,
} from './pages/receipts-certification'
import {
  ensureSession,
  portalRequest,
  rejected,
  unexpectedPage,
  withPortalSession,
  type PortalContext,
} from './session'
import { listStampableTypes } from './stamping'

const RECEIPT_TYPE = 39
const READY_STATE = 90
const DECLARED_STATE = 91
const READY = 'P90'
const DECLARED = 'P91'
const DEFAULT_LINK = 'www.sii.cl'
const SERVICE_URL = `${RECEIPTS_PORTAL.base}${RECEIPTS_PORTAL.service}`

type Party = { readonly digits: string; readonly verifier: string }

const partyOf = (rut: SiiRut): Party => {
  const { body, verifier } = splitSiiRut(rut)
  return { digits: body, verifier }
}

// The posts that change the application (the track id, the declaration) are sent once: a retry could repeat them.
const once = (context: PortalContext): PortalContext => ({
  ...context,
  overrides: { ...context.overrides, retry: false },
})

const call = (
  context: PortalContext,
  hashes: GwtHashes,
  method: string,
  parameters: readonly GwtParameter[],
): ReturnType<typeof postGwt> => postGwt(context, method, RECEIPTS_PORTAL, hashes, method, parameters)

const companyParameters = (company: Party): readonly GwtParameter[] => [
  gwtInteger(Number(company.digits)),
  gwtString(company.verifier),
]

// A read whose answer is judged: a status other than 200 is not an answer.
const read = async (
  context: PortalContext,
  hashes: GwtHashes,
  method: string,
  parameters: readonly GwtParameter[],
): ReturnType<typeof postGwt> => {
  const result = await call(context, hashes, method, parameters)
  if (result.page.status !== 200) throw unexpectedPage(context, method, result.page.html)
  return result
}

const REPRESENTATIVES_METHOD = 'recuperarRepresentantesVigentesUsuariosAutorizados'
const POSTULATION_METHOD = 'obtenerPostulacionSeg'

const postulationParameters = (company: Party): readonly GwtParameter[] => [
  ...companyParameters(company),
  gwtString(String(READY_STATE)),
  gwtString(READY),
]

// The representative is the owner of the session: with two people enrolled for a company, any other choice makes the
// SII answer the declaration with a bare HTTP 500. The portal's list is only the fallback.
const representativeOf = (context: PortalContext, list: GwtAnswer): SiiRut => {
  const owner = sessionRut(context.state.cookies)
  if (owner !== null) return owner
  const digits = representativeDigitsOf(list)
  if (digits === null) throw new DteError('MISSING_FIELD', { field: 'representative' })
  return siiRutOfBody(digits, 'representative')
}

/**
 * EN: What every operation of the receipts portal takes.
 * ES: Lo que recibe cada operación del portal de boletas.
 */
export type ReceiptsPortalInput = {
  /** EN: Company RUT; the client's by default. ES: RUT de la empresa; por defecto el del cliente. */
  readonly companyRut?: string
  /** EN: The portal's hashes, when the pair known to work has gone stale. ES: Los hashes del portal, cuando el par que se sabe que funciona quedó obsoleto. */
  readonly gwt?: GwtHashes
}

/**
 * EN: Input of `downloadReceiptsTestSet`.
 * ES: Entrada de `downloadReceiptsTestSet`.
 */
export type DownloadReceiptsTestSetInput = ReceiptsPortalInput & {
  /** EN: The software provider's mail the portal asks for with the set. ES: `mailProvSw` — El correo del proveedor de software que el portal pide con el set. */
  readonly providerMail?: string
}

/**
 * EN: What `downloadReceiptsTestSet` read.
 * ES: Lo que leyó `downloadReceiptsTestSet`.
 */
export type ReceiptsTestSetDownload = {
  /** EN: The set text, for `parseReceiptsTestSet`. ES: El texto del set, para `parseReceiptsTestSet`. */
  readonly text: string
  /** EN: The representative the download named. ES: `rutRepre` + `dvRepre` — El representante que nombró la descarga. */
  readonly representativeRut: SiiRut
}

/**
 * EN: The state of the receipts application.
 * ES: El estado de la postulación de boletas.
 */
export type ReceiptsStatus = {
  /** EN: The company has valid representatives on the receipts portal. ES: La empresa tiene representantes vigentes en el portal de boletas. */
  readonly enrolled: boolean
  /** EN: The SII approved the set: the declaration can be made (`P90`). ES: El SII aprobó el set: se puede declarar (`P90`). */
  readonly readyToDeclare: boolean
  /** EN: The declaration was already made (`P91`). ES: La declaración ya se hizo (`P91`). */
  readonly declared: boolean
  /** EN: The state the portal named, or null. ES: El estado que nombró el portal, o null. */
  readonly state: string | null
}

/**
 * EN: The software provider the declaration names.
 * ES: El proveedor de software que nombra la declaración.
 */
export type ReceiptsProvider = {
  /** EN: The provider's RUT. ES: RUT del proveedor. */
  readonly rut: string
  /** EN: The provider's name. ES: Nombre del proveedor. */
  readonly name: string
  /** EN: The provider's mail. ES: Correo del proveedor. */
  readonly mail: string
}

/**
 * EN: Input of `declareReceiptsCompliance`.
 * ES: Entrada de `declareReceiptsCompliance`.
 */
export type DeclareReceiptsComplianceInput = ReceiptsPortalInput & {
  /** EN: The software provider; a company that is its own provider passes itself. ES: El proveedor de software; una empresa que es su propio proveedor se pasa a sí misma. */
  readonly provider: ReceiptsProvider
  /** EN: The company's business name. ES: La razón social de la empresa. */
  readonly businessName: string
  /** EN: The query link; `www.sii.cl` by default. ES: El link de consulta; por defecto `www.sii.cl`. */
  readonly link?: string
}

/**
 * EN: How `declareReceiptsCompliance` ended.
 * ES: Cómo terminó `declareReceiptsCompliance`.
 */
export type ReceiptsComplianceResult = {
  /** EN: `declared` now, `alreadyDeclared` earlier, or `notReady`: the SII has not approved the set yet and nothing was sent. ES: `declared` ahora, `alreadyDeclared` antes, o `notReady`: el SII aún no aprueba el set y no se envió nada. */
  readonly outcome: 'declared' | 'alreadyDeclared' | 'notReady'
  /** EN: The state of the application. ES: El estado de la postulación. */
  readonly state: string | null
}

/**
 * EN: Input of `verifyReceiptsAuthorization`.
 * ES: Entrada de `verifyReceiptsAuthorization`.
 */
export type VerifyReceiptsAuthorizationInput = {
  /** EN: A client on production, to read the stamping types. ES: Un cliente en producción, para leer los tipos timbrables. */
  readonly production?: PortalClient
  /** EN: A client on certification, to read the progress page. ES: Un cliente en certificación, para leer la página de avance. */
  readonly certification?: PortalClient
  /** EN: Company RUT; each client's by default. ES: RUT de la empresa; por defecto el de cada cliente. */
  readonly companyRut?: string
}

/**
 * EN: One side of `verifyReceiptsAuthorization`. `queryFailed` means the portal did not answer the question: it is
 * never "not authorised".
 * ES: Un lado de `verifyReceiptsAuthorization`. `queryFailed` significa que el portal no respondió la pregunta: nunca
 * es "no autorizada".
 */
export type ReceiptsAuthorizationCheck = {
  /** EN: The company may issue receipts there. ES: La empresa puede emitir boletas ahí. */
  readonly authorized: boolean
  /** EN: The query could not be answered. ES: La consulta no se pudo responder. */
  readonly queryFailed: boolean
  /** EN: The error code, when the query failed. ES: El código del error, si la consulta falló. */
  readonly errorCode?: string
  /** EN: The error message, when the query failed. ES: El mensaje del error, si la consulta falló. */
  readonly error?: string
}

/**
 * EN: What `verifyReceiptsAuthorization` read; a side is null when its client was not given.
 * ES: Lo que leyó `verifyReceiptsAuthorization`; un lado es null cuando no se entregó su cliente.
 */
export type ReceiptsAuthorization = {
  /** EN: Production: authorised when type 39 can be stamped. ES: Producción: autorizada cuando el tipo 39 se puede timbrar. */
  readonly production: (ReceiptsAuthorizationCheck & { readonly types: readonly number[] }) | null
  /** EN: Certification: the receipts row of the progress page. ES: Certificación: la fila de boletas de la página de avance. */
  readonly certification: (ReceiptsAuthorizationCheck & { readonly state: string | null }) | null
}

/**
 * EN: Downloads the receipts test set. The representatives list and the application record are read first (the portal
 * wants them before the download; their answers are not judged), then `DownloadFileServlet` with the company, the
 * representative and the provider's mail.
 * ES: Descarga el set de pruebas de boletas. Primero se leen la lista de representantes y el registro de la
 * postulación (el portal los quiere antes de la descarga; sus respuestas no se juzgan), y luego `DownloadFileServlet`
 * con la empresa, el representante y el correo del proveedor.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the company, the provider's mail, the hashes. ES: la empresa, el correo del proveedor, los hashes.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the set text and the representative named. ES: el texto del set y el representante nombrado.
 * @throws {DteError} EN: `SII_PORTAL_UNEXPECTED_PAGE` when the download is no set; `MISSING_FIELD { field: 'representative' }` when neither the session nor the portal names one; session, block and transport codes. ES: los mismos códigos.
 */
export const downloadReceiptsTestSet = (
  portal: PortalClient,
  input: DownloadReceiptsTestSetInput = {},
  overrides?: CallOverrides,
): Promise<ReceiptsTestSetDownload> =>
  withPortalSession(portal, 'downloadReceiptsTestSet', overrides, async (context) => {
    const company = partyOf(resolvePortalCompany(portal, input.companyRut))
    const hashes = input.gwt ?? RECEIPTS_PORTAL.known
    await ensureSession(context)
    // The portal wants both calls before the download; their answers are not judged.
    const list = await call(context, hashes, REPRESENTATIVES_METHOD, companyParameters(company))
    const representativeRut = representativeOf(context, list.answer)
    const representative = partyOf(representativeRut)
    await call(context, hashes, POSTULATION_METHOD, postulationParameters(company))
    const query = `rutEmpresa=${company.digits}&dvEmpresa=${company.verifier}&rutRepre=${representative.digits}&dvRepre=${representative.verifier}&mailProvSw=${encodeURIComponent(input.providerMail ?? '')}`
    const page = await portalRequest(
      context,
      'DownloadFileServlet',
      'GET',
      `${RECEIPTS_PORTAL.base}DownloadFileServlet?${query}`,
      { referer: `${RECEIPTS_PORTAL.base}?SET=1`, headers: { Accept: 'text/plain,text/html,*/*' } },
    )
    if (!isReceiptsSet(page.status, page.html)) throw unexpectedPage(context, 'DownloadFileServlet', page.html)
    return { text: page.html, representativeRut }
  })

/**
 * EN: Declares the track id of the receipts envelope, so the SII validates the set (`ingresarTrackId`). Sent once. The
 * SII validates on its own and reports by mail; `readReceiptsStatus` tells when the declaration can be made.
 * ES: Declara el track id del sobre de boletas, para que el SII valide el set (`ingresarTrackId`). Se envía una vez. El
 * SII valida por su cuenta y avisa por correo; `readReceiptsStatus` dice cuándo se puede declarar.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the track id, the company, the hashes. ES: el track id, la empresa, los hashes.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the raw answer. ES: la respuesta cruda.
 * @throws {DteError} EN: `MISSING_FIELD { field: 'trackId' }`; `SII_PORTAL_REJECTED { rejection: 'receiptsTrackIdRefused' }` when the answer is not `//OK`; session, block and transport codes. ES: los mismos códigos.
 */
export const declareReceiptsTrackId = (
  portal: PortalClient,
  input: ReceiptsPortalInput & { readonly trackId: string },
  overrides?: CallOverrides,
): Promise<{ readonly body: string }> =>
  withPortalSession(portal, 'declareReceiptsTrackId', overrides, async (context) => {
    if (input.trackId.trim() === '') throw new DteError('MISSING_FIELD', { field: 'trackId' })
    const company = partyOf(resolvePortalCompany(portal, input.companyRut))
    await ensureSession(context)
    const { page, answer } = await call(once(context), input.gwt ?? RECEIPTS_PORTAL.known, 'ingresarTrackId', [
      ...companyParameters(company),
      gwtString(null),
      gwtString(String(READY_STATE)),
      gwtNull(GWT_INTEGER),
      gwtString(null),
      gwtString(input.trackId.trim()),
    ])
    if (page.status !== 200 || !answer.ok)
      throw rejected(context, 'receiptsTrackIdRefused', {
        httpStatus: page.status,
        portalMessage: bodyExcerpt(page.html),
      })
    return { body: page.html }
  })

const NOT_ENROLLED: ReceiptsStatus = { enrolled: false, readyToDeclare: false, declared: false, state: null }

const statusIn = async (
  context: PortalContext,
  hashes: GwtHashes,
  company: Party,
): Promise<{ readonly status: ReceiptsStatus; readonly list: GwtAnswer }> => {
  const { answer: list } = await read(context, hashes, REPRESENTATIVES_METHOD, companyParameters(company))
  if (representativeDigitsOf(list) === null) return { status: NOT_ENROLLED, list }
  const statesOf = async (state: number): Promise<{ readonly states: readonly string[]; readonly empty: boolean }> => {
    const { page, answer } = await read(context, hashes, 'obtenerEstadoAutorizaEmp', [
      ...companyParameters(company),
      gwtInteger(state),
      gwtString(null),
    ])
    return { states: receiptsStatesOf(answer), empty: isEmptyList(page.html) }
  }
  const asked = await statesOf(READY_STATE)
  const readyToDeclare = asked.states.includes(READY)
  const state = readyToDeclare ? READY : (asked.states[0] ?? null)
  if (state !== null || !asked.empty)
    return { status: { enrolled: true, readyToDeclare, declared: false, state }, list }
  // An empty list for 90 is "not approved yet" or "already declared": the state 91 tells them apart.
  const declared = await statesOf(DECLARED_STATE).then(
    (answer) => answer.states.includes(DECLARED),
    (error: unknown) => {
      context.portal.logger.warn('receipts declared state unavailable', { reason: errorMessage(error) })
      return false
    },
  )
  return { status: { enrolled: true, readyToDeclare: false, declared, state: declared ? DECLARED : null }, list }
}

/**
 * EN: Reads the state of the receipts application: whether the company is enrolled (it has valid representatives),
 * whether the SII approved the set (`P90`, ready to declare) and whether the declaration was made (`P91`). The portal
 * answers an empty list for the state 90 both before the approval and after the declaration, so the state 91 is asked
 * for too.
 * ES: Lee el estado de la postulación de boletas: si la empresa está inscrita (tiene representantes vigentes), si el
 * SII aprobó el set (`P90`, lista para declarar) y si la declaración ya se hizo (`P91`). El portal responde una lista
 * vacía para el estado 90 tanto antes de la aprobación como después de la declaración, así que también se consulta el
 * estado 91.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the company, the hashes. ES: la empresa, los hashes.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @throws {DteError} EN: session, block and transport codes. ES: códigos de sesión, bloqueo y transporte.
 */
export const readReceiptsStatus = (
  portal: PortalClient,
  input: ReceiptsPortalInput = {},
  overrides?: CallOverrides,
): Promise<ReceiptsStatus> =>
  withPortalSession(portal, 'readReceiptsStatus', overrides, async (context) => {
    const company = partyOf(resolvePortalCompany(portal, input.companyRut))
    await ensureSession(context)
    return (await statusIn(context, input.gwt ?? RECEIPTS_PORTAL.known, company)).status
  })

const requiredText = (value: string | undefined, field: string): string => {
  const text = (value ?? '').trim()
  if (text === '') throw new DteError('MISSING_FIELD', { field })
  return text
}

const declarationDate = (now: Date): string => {
  const [year, month, day] = chileDate(now).split('-')
  return `${day}-${month}-${year}`
}

/**
 * EN: Makes the declaration of compliance of the receipts application, which authorises the company to issue receipts
 * in production (`autorizarEmpresaBolProd`). It cannot be undone. The status is read first: a declaration already made
 * and an application the SII has not approved yet are outcomes, and nothing is sent. The representative is the owner
 * of the session; the software provider is mandatory, because the SII refused some companies that declared
 * themselves as their own provider by default. Sent once.
 * ES: Hace la declaración de cumplimiento de la postulación de boletas, que autoriza a la empresa a emitir boletas en
 * producción (`autorizarEmpresaBolProd`). No se puede deshacer. Primero se lee el estado: una declaración ya hecha y
 * una postulación que el SII aún no aprueba son resultados, y no se envía nada. El representante es el dueño de la
 * sesión; el proveedor de software es obligatorio, porque el SII rechazó a algunas empresas que se declararon por
 * defecto como su propio proveedor. Se envía una vez.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the provider, the business name, the link, the company, the hashes. ES: el proveedor, la razón social, el link, la empresa, los hashes.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @throws {DteError} EN: `MISSING_FIELD` (`provider`, `provider.rut`, `provider.name`, `provider.mail`, `businessName`, `representative`), `INVALID_RUT`; `SII_PORTAL_REJECTED` with `receiptsNotEnrolled` or `receiptsComplianceRefused`; session, block and transport codes. ES: los mismos códigos.
 */
export const declareReceiptsCompliance = (
  portal: PortalClient,
  input: DeclareReceiptsComplianceInput,
  overrides?: CallOverrides,
): Promise<ReceiptsComplianceResult> =>
  withPortalSession(portal, 'declareReceiptsCompliance', overrides, async (context) => {
    if (input.provider === undefined) throw new DteError('MISSING_FIELD', { field: 'provider' })
    const provider = partyOf(toSiiRut(requiredText(input.provider.rut, 'provider.rut'), 'provider.rut'))
    const providerName = requiredText(input.provider.name, 'provider.name')
    const providerMail = requiredText(input.provider.mail, 'provider.mail')
    const businessName = requiredText(input.businessName, 'businessName')
    const company = partyOf(resolvePortalCompany(portal, input.companyRut))
    const hashes = input.gwt ?? RECEIPTS_PORTAL.known
    await ensureSession(context)
    const { status, list } = await statusIn(context, hashes, company)
    if (!status.enrolled) throw rejected(context, 'receiptsNotEnrolled', {})
    if (status.declared) return { outcome: 'alreadyDeclared', state: status.state }
    if (!status.readyToDeclare) return { outcome: 'notReady', state: status.state }
    const representative = partyOf(representativeOf(context, list))
    const record = postulationOf(
      (await read(context, hashes, POSTULATION_METHOD, postulationParameters(company))).answer,
    )
    const body = receiptsComplianceBody({
      moduleBase: RECEIPTS_PORTAL.base,
      policy: hashes.policy,
      serviceInterface: RECEIPTS_PORTAL.serviceInterface,
      company,
      provider,
      representative,
      date: declarationDate(portal.now()),
      providerMail,
      providerName,
      link: input.link ?? DEFAULT_LINK,
      authorizationDate: record.authorizationDate,
      token: record.token,
      businessName,
    })
    const page = await portalRequest(once(context), 'autorizarEmpresaBolProd', 'POST', SERVICE_URL, {
      body: encodeUtf8(body),
      contentType: GWT_CONTENT_TYPE,
      referer: RECEIPTS_PORTAL.base,
      headers: gwtHeaders(RECEIPTS_PORTAL.base, hashes.permutation),
    })
    if (page.status !== 200 || !page.html.startsWith('//OK'))
      throw rejected(context, 'receiptsComplianceRefused', {
        httpStatus: page.status,
        portalMessage: bodyExcerpt(page.html),
      })
    return { outcome: 'declared', state: DECLARED }
  })

const failed = (error: unknown): ReceiptsAuthorizationCheck => ({
  authorized: false,
  queryFailed: true,
  errorCode: errorCode(error),
  error: errorMessage(error),
})

/**
 * EN: Reads whether the company may issue receipts: in production, whether type 39 is among the types it can stamp
 * (the stamping operation of phase 4 on a production client); in certification, the receipts row of the progress page.
 * A query the portal does not answer is `queryFailed`, never "not authorised": a missing stamping form was once read
 * as a refusal. Neither side throws.
 * ES: Lee si la empresa puede emitir boletas: en producción, si el tipo 39 está entre los tipos que puede timbrar (la
 * operación de timbraje de la fase 4 sobre un cliente de producción); en certificación, la fila de boletas de la
 * página de avance. Una consulta que el portal no responde es `queryFailed`, nunca "no autorizada": un formulario de
 * timbraje ausente se leyó una vez como rechazo. Ningún lado lanza.
 * @param input EN: the two clients and the company. ES: los dos clientes y la empresa.
 */
export const verifyReceiptsAuthorization = async (
  input: VerifyReceiptsAuthorizationInput,
): Promise<ReceiptsAuthorization> => {
  const company = input.companyRut === undefined ? {} : { companyRut: input.companyRut }
  const production =
    input.production === undefined
      ? null
      : await listStampableTypes(input.production, company).then(
          (types) => ({
            authorized: types.some((entry) => entry.type === RECEIPT_TYPE),
            queryFailed: false,
            types: types.map((entry) => entry.type),
          }),
          (error: unknown) => ({ ...failed(error), types: [] }),
        )
  const certification =
    input.certification === undefined
      ? null
      : await readProgress(input.certification, company).then(
          (report) => ({
            authorized: report.receipts?.authorized ?? false,
            queryFailed: false,
            state: report.receipts?.text ?? null,
          }),
          (error: unknown) => ({ ...failed(error), state: null }),
        )
  return { production, certification }
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/receipts-certification --coverage=false
```

Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/portal/receipts-certification.ts tests/portal/receipts-certification.test.ts
```

```bash
git commit -F - <<'MSG'
feat: the receipts portal operations: the set, the track id, the status, the declaration and the verification

The set is downloaded with the session owner as representative; the track
id is declared once; the status tells a set approved from one already
declared by asking for both states; the declaration of compliance names
the software provider, which is mandatory, and is sent once; the
verification reads production and certification without throwing. A
status other than 200 is not an answer, and a state counts only as an
exact entry of an //OK answer's table.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 7: Public API, size limit and documentation

The runtime names and the types on `dte-sdk/portal` (spec 3.10), the public API lists, the type tests, the dist smoke expectations, the `dte-sdk/portal` limit at 68 kB (D95: measured 66.68 kB, rounded up to the next 2 kB), the README section, `llms.txt` and the changelog, with the receipt reference under Fixed (spec 3.13).

**Files:**

- Modify: `src/portal/index.ts`
- Modify: `.size-limit.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `llms.txt`
- Test (modify): `tests/public-api.test.ts`
- Test (modify): `tests/types.test.ts`
- Test (modify): `tests/dist.smoke.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/public-api.test.ts` (save the diff and run `git apply`; a line that looks empty inside a hunk is a context line):

```diff
diff --git a/tests/public-api.test.ts b/tests/public-api.test.ts
index 02ef297..8a495eb 100644
--- a/tests/public-api.test.ts
+++ b/tests/public-api.test.ts
@@ -252,6 +252,16 @@ const PORTAL_EXPORTS = [
   'runExchange',
   'EXCHANGE_SET_ARTEFACT',
   'uploadPrintedSamples',
+  'RECEIPTS_PORTAL',
+  'parseReceiptsTestSet',
+  'issueReceiptsSet',
+  'sendReceiptsSet',
+  'resendReceiptsConsumption',
+  'downloadReceiptsTestSet',
+  'declareReceiptsTrackId',
+  'readReceiptsStatus',
+  'declareReceiptsCompliance',
+  'verifyReceiptsAuthorization',
   'CERTIFICATION_COUNTERPARTY',
   'TEST_SET_ENVELOPE_ID',
   'TEST_SET_KINDS',
```

`tests/types.test.ts` (save the diff and run `git apply`; a line that looks empty inside a hunk is a context line):

```diff
diff --git a/tests/types.test.ts b/tests/types.test.ts
index 691723f..d4ca10c 100644
--- a/tests/types.test.ts
+++ b/tests/types.test.ts
@@ -49,6 +49,11 @@ import {
   gwtBody,
   gwtAnswer,
   readSamplesReview,
+  parseReceiptsTestSet,
+  issueReceiptsSet,
+  sendReceiptsSet,
+  readReceiptsStatus,
+  declareReceiptsCompliance,
 } from '../src/portal'
 import {
   parsePrintableDocuments,
@@ -123,6 +128,11 @@ import type {
   RunStop,
   CertificationState,
   ExchangeState,
+  ReceiptsTestCase,
+  IssuedReceiptsSet,
+  ReceiptsSendResult,
+  ReceiptsStatus,
+  ReceiptsComplianceResult,
   DeclarationResult,
   CertificationStore,
   CertificationProgressEvent,
@@ -134,6 +144,7 @@ import type {
   IssuedSimulation,
 } from '../src/portal'
 import type { PrintableDocument, PrintedSampleFile, PrintedSamplesResult, WritePrintedSamplesResult } from '../src/pdf'
+import type { ReceiptReference } from '../src'
 
 // Every type the SII web services design names is exported: a missing one fails the import above, and this tuple
 // keeps each import in use.
@@ -254,6 +265,12 @@ const _typecheck = () => {
     'done' | 'exchange' | 'printedSamples' | 'compliance' | 'until' | 'blocked' | 'rejected' | 'timedOut' | 'incomplete'
   >()
   expectTypeOf<CertificationState['exchange']>().toEqualTypeOf<ExchangeState | undefined>()
+  expectTypeOf(parseReceiptsTestSet).returns.toEqualTypeOf<readonly ReceiptsTestCase[]>()
+  expectTypeOf(issueReceiptsSet).returns.resolves.toEqualTypeOf<IssuedReceiptsSet>()
+  expectTypeOf(sendReceiptsSet).returns.resolves.toEqualTypeOf<ReceiptsSendResult>()
+  expectTypeOf(readReceiptsStatus).returns.resolves.toEqualTypeOf<ReceiptsStatus>()
+  expectTypeOf(declareReceiptsCompliance).returns.resolves.toEqualTypeOf<ReceiptsComplianceResult>()
+  expectTypeOf<Document['receiptReferences']>().toEqualTypeOf<readonly ReceiptReference[]>()
 
   // The client is frozen data: its fields cannot be assigned.
   const sii = createSiiClient({} as SiiClientOptions)
```

`tests/dist.smoke.test.ts` (save the diff and run `git apply`; a line that looks empty inside a hunk is a context line):

```diff
diff --git a/tests/dist.smoke.test.ts b/tests/dist.smoke.test.ts
index e35da76..f0e6dd9 100644
--- a/tests/dist.smoke.test.ts
+++ b/tests/dist.smoke.test.ts
@@ -91,6 +91,9 @@ const EXPECTED_FUNCTIONS: Record<string, readonly string[]> = {
     'createExchangeAnswers',
     'runExchange',
     'uploadPrintedSamples',
+    'issueReceiptsSet',
+    'sendReceiptsSet',
+    'declareReceiptsCompliance',
   ],
   pdf: [
     'parsePrintableDocuments',
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/public-api tests/types --coverage=false
```

Expected: FAIL: `dte-sdk/portal exports exactly the documented runtime names` lists the names missing from the entry, and the type test does not compile.

- [ ] **Step 3: Write the implementation**

`src/portal/index.ts` (save the diff and run `git apply`; a line that looks empty inside a hunk is a context line):

```diff
diff --git a/src/portal/index.ts b/src/portal/index.ts
index c6bdfe3..6a8e25c 100644
--- a/src/portal/index.ts
+++ b/src/portal/index.ts
@@ -245,3 +245,38 @@ export type { UploadPrintedSamplesInput, SamplesOutcome } from '../certification
 export type { PrintedSampleFile } from '../pdf/samples'
 export { runCertification } from '../certification/runner'
 export type { RunCertificationOptions, RunCertificationResult, RunStop } from '../certification/runner'
+
+// Phase 5c-2: the certification of receipts (the receipts portal).
+export { RECEIPTS_PORTAL } from '../catalogs/certification'
+export { parseReceiptsTestSet } from '../certification/receipts-set'
+export type { ReceiptsTestCase, ReceiptsTestItem } from '../certification/receipts-set'
+export { issueReceiptsSet } from '../certification/receipts'
+export type { IssueReceiptsSetOptions, IssuedReceipt, IssuedReceiptsSet } from '../certification/receipts'
+export { sendReceiptsSet, resendReceiptsConsumption } from '../certification/receipts-send'
+export type {
+  ReceiptsProgressEvent,
+  SendReceiptsSetOptions,
+  ReceiptsConsumptionAttempt,
+  ReceiptsSendResult,
+  ResendReceiptsConsumptionInput,
+} from '../certification/receipts-send'
+export {
+  downloadReceiptsTestSet,
+  declareReceiptsTrackId,
+  readReceiptsStatus,
+  declareReceiptsCompliance,
+  verifyReceiptsAuthorization,
+} from './receipts-certification'
+export type {
+  ReceiptsPortalInput,
+  DownloadReceiptsTestSetInput,
+  ReceiptsTestSetDownload,
+  ReceiptsStatus,
+  ReceiptsProvider,
+  DeclareReceiptsComplianceInput,
+  ReceiptsComplianceResult,
+  VerifyReceiptsAuthorizationInput,
+  ReceiptsAuthorizationCheck,
+  ReceiptsAuthorization,
+} from './receipts-certification'
+export type { ReceiptsProgress } from './pages/certification-progress'
```

`.size-limit.json` (save the diff and run `git apply`; a line that looks empty inside a hunk is a context line):

```diff
diff --git a/.size-limit.json b/.size-limit.json
index 76df15b..2c0b49d 100644
--- a/.size-limit.json
+++ b/.size-limit.json
@@ -15,7 +15,7 @@
     "name": "dte-sdk/portal (min + brotli)",
     "path": "dist/portal.min.js",
     "ignore": ["node-forge", "@xmldom/xmldom", "fast-xml-parser", "rut.ts", "pdf-lib", "bwip-js", "node:*"],
-    "limit": "64 kB"
+    "limit": "68 kB"
   },
   {
     "name": "dte-sdk/pdf (min + brotli)",
```

`README.md` (save the diff and run `git apply`; a line that looks empty inside a hunk is a context line):

```diff
diff --git a/README.md b/README.md
index 00d7cc9..a640316 100644
--- a/README.md
+++ b/README.md
@@ -476,6 +476,63 @@ pair known to work as the fallback; `gwt: { permutation, policy }` overrides the
 - **The exchange answers are regenerated and uploaded on every run that reaches the portal;** only the set is kept.
 - **A review left in `INGRESO`** (a run cut off while uploading) is resumed, every PDF uploaded again.
 
+## Certification: receipts
+
+```typescript
+import { createSiiClient } from 'dte-sdk'
+import {
+  createPortalClient,
+  createFolioAllocator,
+  downloadReceiptsTestSet,
+  parseReceiptsTestSet,
+  issueReceiptsSet,
+  sendReceiptsSet,
+  declareReceiptsTrackId,
+  readReceiptsStatus,
+  declareReceiptsCompliance,
+  verifyReceiptsAuthorization,
+} from 'dte-sdk/portal'
+
+// The receipts application is its own: its portal, its test set, its declaration. The pieces, in the order to chain them
+const { text } = await downloadReceiptsTestSet(portal, { providerMail })
+const issued = await issueReceiptsSet(parseReceiptsTestSet(text), {
+  issuer,
+  certificate,
+  folios: createFolioAllocator([caf39]),
+  resolution,
+})
+const sent = await sendReceiptsSet(sii, issued) // the envelope, 20 s, its status, then the folio consumption report
+await declareReceiptsTrackId(portal, { trackId: sent.envelopeTrackId })
+
+// The SII validates the set on its own and answers by mail. Later:
+const status = await readReceiptsStatus(portal) // readyToDeclare once the set is approved (P90); declared after (P91)
+if (status.readyToDeclare) await declareReceiptsCompliance(portal, { provider: { rut, name, mail }, businessName })
+const check = await verifyReceiptsAuthorization({ production: productionPortal, certification: portal })
+// check.production.authorized: type 39 can be stamped in production
+```
+
+The receipts test set is a plain text of cases; each case is one receipt of type 39 to the final consumer, with prices
+that include VAT and a reference `SET` / `CASO-<n>`. `sendReceiptsSet` uploads the `EnvioBOLETA`, waits 20 s and reads
+its status, then sends the folio consumption report (RCOF) built from the envelope, starting at sequence number 100 and
+trying the next one after a rejection, up to ten times; three duplicates in a row mean today's report was already
+accepted (the certification environment takes one per company per day). The SII's objections to the report are
+expected in certification and block nothing, so the outcome is `sent` as long as the envelope was not rejected. The
+XMLs come back in the result. There is no runner here: the SII's validation of the set takes its own time, and the
+caller reads the status again later.
+
+- **The declaration cannot be undone.** `declareReceiptsCompliance` authorises the company to issue receipts in
+  production. It reads the status first: `alreadyDeclared` and `notReady` are outcomes, and nothing is sent.
+- **The software provider is mandatory** (`provider`): the SII answered some companies with a bare HTTP 500 when they
+  were declared as their own provider by default. A company that is its own provider passes itself.
+- **The representative is the owner of the session**, the person whose certificate logged in; the portal's list is
+  only the fallback. With two people enrolled for a company, any other choice is refused.
+- **A receipt has its own reference.** The receipts schema gives `Referencia` no date and a free-text code, so a
+  receipt takes `receiptReferences` (`{ code, reason, documentType?, folio? }`) and refuses `references`.
+- **`verifyReceiptsAuthorization` never throws.** A stamping form the portal does not serve is `queryFailed`, not "not
+  authorised".
+- **Nothing here has been run against the receipts portal yet.** Every wire comes from field behaviour, and the tests
+  use a synthetic set text; the receipts envelope and the report do validate against the official schemas.
+
 ## Printed samples (Node)
 
 ```typescript
```

`CHANGELOG.md` (save the diff and run `git apply`; a line that looks empty inside a hunk is a context line):

```diff
diff --git a/CHANGELOG.md b/CHANGELOG.md
index 5b8406c..d4e7f12 100644
--- a/CHANGELOG.md
+++ b/CHANGELOG.md
@@ -117,6 +117,17 @@ and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0
   `INTERCAMBIO_DONE`, `MUESTRAS_UPLOADING`, `MUESTRAS_DONE`; the portal session takes raw bodies; catalog
   `EXCHANGE_PORTAL`, `SAMPLES_PORTAL`, `EXCHANGE_ANSWER_FILES`; portal rejections `exchangeUploadRefused`,
   `samplesReviewRefused`, `sampleUploadRefused`. `dte-sdk/portal` limit to 64 kB.
+- Certification of receipts (`dte-sdk/portal`), as pieces to chain: `parseReceiptsTestSet` (the plain-text set of the
+  receipts portal), `issueReceiptsSet` (one receipt of type 39 per case, the `SET` reference, the signed `EnvioBOLETA`),
+  `sendReceiptsSet` (the envelope, 20 s, its status, then the folio consumption report with the sequence number 100
+  plus the attempt, up to ten attempts) and `resendReceiptsConsumption`; the receipts portal operations
+  `downloadReceiptsTestSet`, `declareReceiptsTrackId`, `readReceiptsStatus` (`P90` ready to declare, `P91` declared),
+  `declareReceiptsCompliance` (irreversible; the software provider is mandatory; the representative is the owner of
+  the session) and `verifyReceiptsAuthorization` (production and certification, never throws). `readProgress` gives
+  the receipts row of the progress page. Catalog `RECEIPTS_PORTAL`; portal rejections `receiptsNotEnrolled`,
+  `receiptsTrackIdRefused`, `receiptsComplianceRefused`. `dte-sdk/portal` limit to 68 kB.
+- `receiptReferences` on `DocumentInput` and `Document`, with `ReceiptReferenceInput`, `ReceiptReference` and
+  `SiiReferenciaBoleta`: the reference of a receipt (39, 41) as the receipts schema defines it.
 
 ### Changed
 
@@ -133,6 +144,10 @@ and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0
 
 ### Fixed
 
+- A receipt (39, 41) with a reference was written with the invoice shape of `Referencia` (`FchRef`), which the receipts
+  schema does not allow. Receipts now take `receiptReferences`, and `references` on a receipt is refused with
+  `INVALID_OPTION`, as is `receiptReferences` on any other type. The official `EnvioBOLETA_v11.xsd` is in the test
+  fixtures and the receipts envelope validates against it.
 - ES module consumers on `moduleResolution: nodenext` get the real types. The declarations lacked extensions in their
   relative imports, which was 165 errors, or every type silently `any` under `skipLibCheck`.
 
```

`llms.txt` (save the diff and run `git apply`; a line that looks empty inside a hunk is a context line):

```diff
diff --git a/llms.txt b/llms.txt
index c6f6888..4538485 100644
--- a/llms.txt
+++ b/llms.txt
@@ -14,6 +14,8 @@ Certification (deterministic half, from `dte-sdk/portal`): `parseTestSetText` pa
 
 Certification (portal half, from `dte-sdk/portal`): `runCertification` runs the HTML side in the field's order from a `CertificationStore` (`createMemoryCertificationStore`, `createDirectoryCertificationStore`; the state holds CAF private keys): the test sets, the books, the simulation, the exchange set answered on the exchange portal (`downloadExchangeSet`, `validateExchangeUser`, `uploadExchangeAnswers`, `confirmExchange`; the answers from `createExchangeAnswers`, signed and schema-valid), the printed samples uploaded to the samples portal when the `samples` option gives them (`readPrintedSamples` from `dte-sdk/pdf`; `readSamplesReview`, `createSamplesReview`, `uploadSample`, `submitSamplesReview`, `readSamplesDetail`), and the declaration of compliance, irreversible, only with `declareCompliance: true`; it stops with `exchange` (the set unavailable or the company not in the exchange), `printedSamples` (no samples given), `rejected` (the SII's reasons in the detail) or `compliance`. Each phase is a step over the dependencies and the state (`obtainTestSet`, `prepareFolios`, `sendTestSet`, `declareTestSets`, `waitForTestSetsApproval`, `runBooks`, `advanceToNextStage`, `sendSimulation`, `declareSimulation`, `waitForSimulationApproval`, `runExchange`, `uploadPrintedSamples`, `declareComplianceFinal`), with typed progress events through `onProgress`; beneath them the portal operations `downloadTestSet` (generates the set anew at the SII), `declareProgress` (every field in form order, the page read again to verify), `readProgress`, `advanceStage`, `listBookHistory` and `declareCompliance`. The two GWT portals speak GWT-RPC (`gwtBody`, `gwtAnswer`); their hashes are discovered on the way in with the pair known to work as the fallback. Dates are Chile dates; the waits are the field's and `sleep` and `now` are injectable. None of it has been run against the portal yet.
 
+Certification of receipts (from `dte-sdk/portal`), an application of its own with no runner, as pieces to chain: `downloadReceiptsTestSet` (the plain-text set), `parseReceiptsTestSet`, `issueReceiptsSet` (one receipt of type 39 per case to the final consumer, prices with VAT, the reference `SET` / `CASO-<n>`, the signed `EnvioBOLETA`), `sendReceiptsSet` (uploads the envelope, waits 20 s, reads its status, then sends the folio consumption report with the sequence number 100 plus the attempt, up to ten attempts; `sent` unless the envelope is rejected), `declareReceiptsTrackId`, then later `readReceiptsStatus` (`readyToDeclare` at `P90`, `declared` at `P91`) and `declareReceiptsCompliance` (irreversible; `provider` is mandatory; the representative is the owner of the session; `alreadyDeclared` and `notReady` are outcomes), and `verifyReceiptsAuthorization` (type 39 among the stamping types of a production client, and the receipts row of the certification progress page; never throws, a form not served is `queryFailed`). A receipt (39, 41) takes `receiptReferences` (`code`, `reason`, optional `documentType` and `folio`), never `references`: the receipts schema has its own `Referencia`, without a date. None of it has been run against the receipts portal yet.
+
 Printed samples (Node only, from `dte-sdk/pdf`): `parsePrintableDocuments` turns any `EnvioDTE`, `EnvioBOLETA`, bare `SetDTE` or bare `DTE` XML into printable documents with each `TED` copied verbatim; `renderPrintedSample` draws one single-page PDF per the SII printed-samples manual (21.5 cm wide, 11 to 33 cm tall, red type box, acknowledgement box and `CEDIBLE` mark on the transferable copy of 33, 34, 43, 46 and sale guides, PDF417 stamp with the signed bytes and its legends); `renderTedBarcode` gives the stamp PNG alone; `renderPrintedSamples` batches envelopes in memory into the test and simulation sets with failures as data; `writePrintedSamples` and `findEnvelopeFiles` do the same over files (`SET-PRUEBAS`, `SET-SIMULACION`). `pdf-lib` and `bwip-js` load on first use.
 
 The SII portal, from `dte-sdk/portal`, is `createPortalClient({ environment, certificate, companyRut })` plus free functions, on Node (client certificate over `https`; TLS 1.2, server verified). The certificate must be enabled as a login method at sii.cl, or the login throws `SII_PORTAL_CERT_NOT_ENABLED`. Session: `openPortalSession`, `closePortalSession`, or on demand; `sessionCache` and `lock` are ports for several replicas. Company data: `fetchCompanyResolution` (per environment), `fetchTaxpayerData`, `fetchIssuerProfile`, `queryCertificationSets`. Folios: `listStampableTypes`, `queryFolioQuota` (`MAX_AUTOR`, `FOLIOS_DISP`; stamps nothing), `requestCaf` (may grant less than asked; read `granted`), `listFolioRanges`, `annulFolios` (explicit scope required; `maxRanges` limits one call; irreversible; counts against the quota for six months), `listReobtainableRanges`, `reobtainCaf`. Composite flows return refusals as data: `requestCafExact`, `requestCafInBatches`, `reobtainFolios`. Refusals are `SII_PORTAL_REJECTED` with `details.rejection` and `portalRejectionMessage`. `createFolioRegistry`, `createMemoryFolioRegistry` and `createDirectoryFolioRegistry` track folios locally. The CAF XML holds a private key: treat it as a secret.
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/public-api tests/types --coverage=false
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/portal/index.ts .size-limit.json README.md CHANGELOG.md llms.txt tests/public-api.test.ts tests/types.test.ts tests/dist.smoke.test.ts
```

```bash
git commit -F - <<'MSG'
feat: the 5c-2 exports, the public API lists, the portal limit and the docs of the receipts certification

The portal entry exports the receipts set parser, issuer and sender and
the five operations of the receipts portal. The portal limit goes to
68 kB (measured 66.68 kB). README, CHANGELOG and llms.txt describe the
pieces in the order to chain them, the mandatory provider and the
reference of a receipt.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Measurements

Minified and brotli-compressed, per entry:

| Entry | Before this phase | After | Limit |
|---|---|---|---|
| `dte-sdk` | 30.16 kB | 30.31 kB | 32 kB |
| `dte-sdk/node` | 4.19 kB | 4.19 kB | 6 kB |
| `dte-sdk/portal` | 62.53 kB | 66.68 kB | 68 kB |
| `dte-sdk/pdf` | 8.45 kB | 8.45 kB | 10 kB |

## What this leaves open

- **The receipts portal itself.** Nothing of this phase has been seen by this SDK. The first company enrolled in the
  receipts application should keep every answer of the portal (the HTTP capture port of the client does it) and its
  real set text, and turn them into fixtures.
- **No runner** (D87): the caller chains the pieces; the SII validates the set on its own time.
- **Deferred on purpose** (spec section 7): no wait for the SII's validation, ten report attempts ending in `sent`,
  the known hashes as the only source.
- **Field defects not reproduced** (spec 7, D94), and two wordings read strictly after the automated security review:
  the receipts row of the progress page and the states of a status answer.

---

## Task 8: Final gates and the pull request

No code, unless a gate finds something.

- [ ] **Step 1: Run every gate**

```bash
npm ci
```

```bash
npx prettier --check "{src,tests}/**/*.{js,ts}"
```

```bash
npm run lint
```

```bash
npx tsc --noEmit -p .
```

```bash
npm run build
```

```bash
npx jest --config jest.config.cjs --coverage
```

```bash
npx size-limit
```

```bash
npm run scan
```

Expected: all pass, 2 394 tests, 100 % on the four metrics, `dte-sdk/portal` about 66.68 kB against 68 kB and `dte-sdk` about 30.31 kB against 32 kB.

- [ ] **Step 2: Read the diff against `canary` once**

Nothing public may name any other project, and no RUT, certificate or local path may appear outside the allow-list. `npm run scan` covers the last part; the first is yours to check.

- [ ] **Step 3: Open the pull request against `canary`**

The body explains the pieces and the order to chain them, the receipt reference fixed in phase 1 and why, the mandatory software provider, the irreversible declaration and its outcomes, the 68 kB limit of `dte-sdk/portal`, lists the decisions of spec section 5 and the deferred items and field defects not reproduced of section 7, and states plainly that nothing has been run against the receipts portal. Squash-merge is how this repository integrates, and merging is Hans's call.

- [ ] **Step 4: Record what stays open**

Add to [issue 8](https://github.com/arrowsw/dte-sdk/issues/8) the live proof this phase needs before the first release that ships it: a company enrolled in the receipts application, its real set text, the set sent, the track id declared, and the answers of the receipts portal kept as fixtures.
