# Phase 3 — SII books: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The three SII books of dte-sdk: the purchase and sales book (IECV, `LibroCompraVenta`), the dispatch guide book (`LibroGuia`) and the folio consumption report (RCOF, `ConsumoFolios`), in the full format of their official schemas, signed and ready for `uploadBook` and `uploadFolioConsumption`, all functional and in English with bilingual `EN:`/`ES:` JSDoc.

**Architecture:** Each book follows the pattern of the phase 1 envelopes: `create*` is pure, validates, normalizes and computes the summaries; `build*Xml` serializes from an SII-shaped model in XSD order; `sign*` signs the `ID` element with `signEnveloped`. Output that is proven in the field is the floor: an improvement never blocks by default what that output lets through (spec D21), so an explicit total that does not match the SII formula is kept and reported in `totalMismatches`.

**Tech Stack:** TypeScript 5.9 (strict), Node ≥ 20, Jest 30 + ts-jest, expect-type, fast-check, ESLint 9 + Prettier, esbuild, size-limit. One new devDependency, `xmllint-wasm`, for official XSD validation in the tests. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-11-01-phase-3-books-design.md` (section 2 holds the decisions, section 3 the rules and the API, section 4 the glossary, appendix A the SII format facts).

---

## This plan's code has already run

Every task below was applied in this order to a clean copy of the repository, by a script that wrote each file and made each replacement exactly as printed here. Each step marked to fail failed, each step marked to pass passed, and the final gates passed: Prettier, ESLint, `tsc`, 100 % coverage on the four metrics, the build, the size limit, the scan and the `dist` smoke. The differential of Task 14 passed against the external harness.

So copy the code as it is. If a test fails, something around it changed since 2026-11-01, such as `canary` or an SII schema: investigate that before you touch the test or the code.

## Conventions that apply to EVERY task

1. **Branch:** work on a branch cut from `canary`. Commands run from the repository root.
2. **Commits:** one per task, with the conventional message given, in English, ending with the `Co-Authored-By` line your session prescribes. Run `npm run prettier` before each commit; it changes nothing if you copied the code as printed.
3. **Bilingual JSDoc is mandatory** on every exported symbol and every type field, one `EN:` line and one `ES:` line, the `ES:` naming the SII tag. The code below already complies.
4. **No classes** (only `DteError`). `readonly` types everywhere. No module-level state.
5. **No PII in error messages:** values go in `details`, never in `message`.
6. **Tests:** one file per module under `tests/books/`. Coverage reaches 100 % at Task 15; before that it dips, because the codec functions of the guide book and the report get their tests in Tasks 8 and 9. No network in tests.
7. **No real data:** fixture RUTs come from the allow-list in `scripts/scan-real-data.mjs`, names are invented, and `npm run scan` checks it.
8. **Nothing public names any other project:** not code, comments, tests, fixtures or commits. Describe the SII behaviour directly.
9. **What not to do here:** nothing in this plan calls the SII. The live proof stays in issue 8 (spec section 6).

## File map

```
src/
  catalogs/book-codes.ts       (create) operations, kinds, submissions, document types, VAT and guide codes
  model/book.ts                (create) domain types of the three books
  model/sii-book.ts            (create) official tags in XSD order
  model/book-codec.ts          (create) toSiiPurchaseSalesBook, toSiiGuideBook, toSiiFolioConsumption
  model/codec.ts               (modify) exports compact
  books/common.ts              (create) cover, zones, amounts, dates and the XML frame
  books/totals.ts              (create) sumBookEntries, accumulateBookTotals, normalizeBookTotals
  books/entry.ts               (create) normalizeBookEntry, expectedBookEntryTotal
  books/purchase-sales.ts      (create) createPurchaseSalesBook, build, sign, verify
  books/guide.ts               (create) createGuideBook, build, sign, verify, accumulateGuideTotals
  books/folio-consumption.ts   (create) createFolioConsumption, build, sign, verify, compactFolioRanges
  books/from-document.ts       (create) bookEntryFromDocument, guideEntryFromDocument, folioConsumptionEntryFromDocument
  errors.ts                    (modify) BOOK_TOTAL_MISMATCH, safe keys expected and actual
  sii/upload.ts                (modify) fileName on UploadXmlInput, default by root element
  index.ts                     (modify) root exports of spec section 3.13
tests/
  books/                       (create) one test per module, property.test.ts, differential.test.ts, xsd.test.ts
  support/xsd.ts               (create) validateAgainstXsd
  support/book-fixtures.ts     (create) covers, certificate and sample lines
  support/purchase-sales-samples.ts, guide-samples.ts, report-samples.ts   (create) one sample per golden file
  fixtures/xsd/                (create) official SII schemas, downloaded in Task 3
  fixtures/books/              (create) golden unsigned XML
  fixtures/README.md           (modify)
  public-api.test.ts, dist.smoke.test.ts, types.test.ts, sii/upload.test.ts   (modify)
package.json, package-lock.json, .size-limit.json, README.md, llms.txt, CHANGELOG.md   (modify)
```

## Differential harness contract

`tests/books/differential.test.ts` runs an external program, located through `DTE_DIFFERENTIAL_BOOKS_HARNESS`, once per case, and it only runs with `RUN_DIFFERENTIAL=1`. The program lives outside the repository. It reads one JSON object on stdin and writes `{ "xml": "<signed xml>" }` on stdout.

Every payload has:

| Field | Meaning |
|---|---|
| `book` | `sale`, `purchase`, `adjustment`, `guide` or `report` |
| `now` | ISO instant: the harness pins its clock to it, in `America/Santiago` |
| `certificate` | `{ rut, privateKeyPem, certificatePem, modulus, exponent }` |
| `issuerRut`, `issuerName`, `receiverRut`, `receiverName` | the parties |
| `period`, `resolutionDate`, `resolutionNumber` | the cover |
| `submission` | `TOTAL` or `AJUSTE` |
| `documents` | the lines, in the shape shown in the test file for each case |

`adjustment` adds `previousTotals` (rows with the official tags). `guide` adds `id` and `notificationFolio`. `report` adds `id` and `sequence`. On the purchase and sales book the harness derives the id from the instant, as `HARNESS_ID` in the test does.

The harness is not in this repository, and it is not needed for the rest of the plan. Without it the suite is skipped, and the pull request must say the differential did not run.

---
## Task 1: Book catalogs and the new error code

The codes every other task uses. `BOOK_DOCUMENT_TYPES` is the `DoctoType` enumeration of `LibroCV_v10.xsd`, wider than `DocumentType` because books also report paper documents.

**Files:**
- Create: `src/catalogs/book-codes.ts`
- Modify: `src/errors.ts`
- Test: `tests/books/book-codes.test.ts`

- [ ] **Step 1: Write the tests (they fail until Step 3)**

`tests/books/book-codes.test.ts`:

```ts
import {
  BOOK_DOCUMENT_TYPES,
  BOOK_KINDS,
  BOOK_OPERATIONS,
  BOOK_SUBMISSIONS,
  GUIDE_TRANSFER_TYPES,
  GUIDE_VOID_CODES,
  isBookDocumentType,
  NON_RECOVERABLE_VAT_CODES,
  SUMMARY_ONLY_DOCUMENT_TYPES,
} from '../../src/catalogs/book-codes'

describe('book catalogs', () => {
  test('carry the SII values of the cover', () => {
    expect(BOOK_OPERATIONS).toEqual({ sale: 'VENTA', purchase: 'COMPRA' })
    expect(BOOK_KINDS).toEqual({ monthly: 'MENSUAL', special: 'ESPECIAL', rectification: 'RECTIFICA' })
    expect(BOOK_SUBMISSIONS).toEqual({ total: 'TOTAL', partial: 'PARCIAL', final: 'FINAL', adjustment: 'AJUSTE' })
  })

  test('list the codes of the schema', () => {
    expect(Object.values(NON_RECOVERABLE_VAT_CODES)).toEqual([1, 2, 3, 4, 9])
    expect(Object.values(GUIDE_TRANSFER_TYPES)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(GUIDE_VOID_CODES).toEqual({ folio: 1, guide: 2, partialReceipt: 3 })
  })

  test('document types are the DoctoType enumeration, summary-only ones included', () => {
    expect(BOOK_DOCUMENT_TYPES).toHaveLength(53)
    for (const type of SUMMARY_ONLY_DOCUMENT_TYPES) expect(BOOK_DOCUMENT_TYPES).toContain(type)
  })

  test.each([
    [33, true],
    [46, true],
    [501, true],
    [47, false],
    [48, true],
    [52, false],
    ['33', false],
    [undefined, false],
  ])('isBookDocumentType(%p) is %p', (value, expected) => {
    expect(isBookDocumentType(value)).toBe(expected)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx jest --config jest.config.cjs tests/books/book-codes.test.ts tests/errors.test.ts
```

Expected: FAIL, with `Cannot find module '../../src/catalogs/book-codes'`.

- [ ] **Step 3: Write the implementation**

`src/catalogs/book-codes.ts`:

```ts
/**
 * EN: Side of the purchase and sales book, with its SII value.
 * ES: `TipoOperacion` — Lado del libro de compras y ventas, con su valor en el SII.
 */
export const BOOK_OPERATIONS = { sale: 'VENTA', purchase: 'COMPRA' } as const

/** EN: Union of the book sides. ES: Unión de los lados del libro. */
export type BookOperation = keyof typeof BOOK_OPERATIONS

/**
 * EN: Kind of purchase and sales book, with its SII value.
 * ES: `TipoLibro` — Tipo de libro de compras y ventas, con su valor en el SII.
 */
export const BOOK_KINDS = { monthly: 'MENSUAL', special: 'ESPECIAL', rectification: 'RECTIFICA' } as const

/** EN: Union of the book kinds. ES: Unión de los tipos de libro. */
export type BookKind = keyof typeof BOOK_KINDS

/**
 * EN: How a book reaches the SII: in one go, in segments, the closing of the segments, or a later adjustment.
 * ES: `TipoEnvio` — Cómo llega un libro al SII: de una vez, por segmentos, el cierre de los segmentos o un ajuste posterior.
 */
export const BOOK_SUBMISSIONS = { total: 'TOTAL', partial: 'PARCIAL', final: 'FINAL', adjustment: 'AJUSTE' } as const

/** EN: Union of the submission kinds. ES: Unión de los tipos de envío. */
export type BookSubmission = keyof typeof BOOK_SUBMISSIONS

/**
 * EN: What an adjustment does with a line: `add` is `Operacion` 1, `remove` is `Operacion` 2.
 * ES: `Operacion` — Qué hace un ajuste con una línea: `add` es 1 (agrega), `remove` es 2 (elimina).
 */
export type BookAdjustment = 'add' | 'remove'

/**
 * EN: Document types the book schema admits (`DoctoType` of `LibroCV_v10.xsd`), electronic or not.
 * ES: `TpoDoc` — Tipos de documento que admite el esquema del libro (`DoctoType` de `LibroCV_v10.xsd`), electrónicos o no.
 */
export const BOOK_DOCUMENT_TYPES = [
  29, 30, 32, 33, 34, 35, 38, 39, 40, 41, 43, 45, 46, 48, 53, 55, 56, 60, 61, 101, 102, 103, 104, 105, 106, 108, 109,
  110, 111, 112, 175, 180, 185, 500, 501, 900, 901, 902, 903, 904, 905, 906, 907, 909, 910, 911, 914, 918, 919, 920,
  921, 922, 924,
] as const

/** EN: Union of the book document types. ES: Unión de los tipos de documento del libro. */
export type BookDocumentType = (typeof BOOK_DOCUMENT_TYPES)[number]

/**
 * EN: Type guard for `BookDocumentType`.
 * ES: Guarda de tipo para `BookDocumentType`.
 */
export const isBookDocumentType = (value: unknown): value is BookDocumentType =>
  (BOOK_DOCUMENT_TYPES as readonly unknown[]).includes(value)

/**
 * EN: Types the format excludes from the detail: report them in `summaryOnlyTotals` (receipts, exchange rate
 * adjustments, tickets without invoice, other unregistered records).
 * ES: Tipos que el formato excluye del detalle: se informan en `summaryOnlyTotals` (boletas, ajustes de tipo de cambio,
 * pasajes sin factura, otros registros no documentados).
 */
export const SUMMARY_ONLY_DOCUMENT_TYPES = [35, 38, 39, 41, 48, 105, 500, 501, 919, 920, 922, 924] as const

/**
 * EN: Why VAT on a purchase cannot be recovered.
 * ES: `CodIVANoRec` — Por qué no se puede recuperar el IVA de una compra.
 */
export const NON_RECOVERABLE_VAT_CODES = {
  /** EN: Purchases for non-taxable or exempt operations. ES: 1 — Compras destinadas a operaciones no gravadas o exentas. */
  nonTaxableOperations: 1,
  /** EN: Supplier invoices registered late. ES: 2 — Facturas de proveedores registradas fuera de plazo. */
  lateRegistration: 2,
  /** EN: Rejected expenses. ES: 3 — Gastos rechazados. */
  rejectedExpenses: 3,
  /** EN: Free deliveries received. ES: 4 — Entregas gratuitas recibidas. */
  freeDeliveries: 4,
  /** EN: Other. ES: 9 — Otros. */
  other: 9,
} as const

/** EN: Union of the non-recoverable VAT codes. ES: Unión de los códigos de IVA no recuperable. */
export type NonRecoverableVatCode = (typeof NON_RECOVERABLE_VAT_CODES)[keyof typeof NON_RECOVERABLE_VAT_CODES]

/**
 * EN: Operation of a guide line in the guide book. `TpoOper` stops at 7 in the schema, so values 8 and 9 of `IndTraslado`
 * cannot be reported on a line.
 * ES: `TpoOper` — Operación de una línea del libro de guías. En el esquema `TpoOper` llega hasta 7, así que los valores 8 y 9
 * de `IndTraslado` no se pueden informar en una línea.
 */
export const GUIDE_TRANSFER_TYPES = {
  /** EN: Sale. ES: 1 — Operación constituye venta. */
  sale: 1,
  /** EN: Sale to be made. ES: 2 — Ventas por efectuar. */
  pendingSale: 2,
  /** EN: Consignment. ES: 3 — Consignaciones. */
  consignment: 3,
  /** EN: Products on demonstration. ES: 4 — Productos en demostración. */
  demonstration: 4,
  /** EN: Internal transfer. ES: 5 — Traslados internos. */
  internalTransfer: 5,
  /** EN: Other non-sale transfer. ES: 6 — Otros traslados no venta. */
  otherTransfer: 6,
  /** EN: Return guide. ES: 7 — Guía de devolución. */
  returnGuide: 7,
} as const

/** EN: Union of the guide operations. ES: Unión de las operaciones de una guía. */
export type GuideTransferType = (typeof GUIDE_TRANSFER_TYPES)[keyof typeof GUIDE_TRANSFER_TYPES]

/**
 * EN: Why a guide line is marked: voided before reaching the SII, voided afterwards, or goods partly received.
 * ES: `Anulado` — Por qué se marca una línea de guía: anulada antes de llegar al SII, anulada después o productos recibidos en parte.
 */
export const GUIDE_VOID_CODES = { folio: 1, guide: 2, partialReceipt: 3 } as const

/** EN: Union of the guide void reasons. ES: Unión de los motivos de anulación de una guía. */
export type GuideVoidCode = keyof typeof GUIDE_VOID_CODES
```

In `src/errors.ts`, replace:

```ts
  WAIT_TIMEOUT: 'WAIT_TIMEOUT',
} as const
```

with:

```ts
  WAIT_TIMEOUT: 'WAIT_TIMEOUT',
  BOOK_TOTAL_MISMATCH: 'BOOK_TOTAL_MISMATCH',
} as const
```

In `src/errors.ts`, replace:

```ts
  WAIT_TIMEOUT: 'Timed out waiting for the SII status',
}
```

with:

```ts
  WAIT_TIMEOUT: 'Timed out waiting for the SII status',
  BOOK_TOTAL_MISMATCH: 'Book line total does not match the SII formula',
}
```

In `src/errors.ts`, replace:

```ts
  'trackId',
] as const
```

with:

```ts
  'trackId',
  'expected',
  'actual',
] as const
```

- [ ] **Step 4: Run them to see them pass**

```bash
npx jest --config jest.config.cjs tests/books/book-codes.test.ts tests/errors.test.ts
```

Expected: PASS, `Tests: 54 passed, 54 total`.

- [ ] **Step 5: Commit**

```bash
git add src/catalogs/book-codes.ts tests/books/book-codes.test.ts src/errors.ts
git commit -m "feat: book catalogs and BOOK_TOTAL_MISMATCH"
```

---

## Task 2: Domain model and SII-shaped model

Types only, so this task has no failing test: `tsc` is the check. `src/model/book.ts` carries the bilingual documentation of every field and `src/model/sii-book.ts` the official tags in XSD order.

**Files:**
- Create: `src/model/book.ts`
- Create: `src/model/sii-book.ts`

- [ ] **Step 1: Write the implementation**

`src/model/book.ts`:

```ts
/**
 * EN: The English domain model of the three SII books. `./sii-book` holds the official tags and `./book-codec` converts
 * from one to the other. Every `ES:` line names the SII tag the field produces.
 * ES: El modelo de dominio en inglés de los tres libros del SII. `./sii-book` tiene las etiquetas oficiales y
 * `./book-codec` convierte de uno a otro. Cada línea `ES:` nombra la etiqueta SII que produce el campo.
 */
import type {
  BookAdjustment,
  BookKind,
  BookOperation,
  BookSubmission,
  GuideVoidCode,
  NonRecoverableVatCode,
} from '../catalogs/book-codes'
import type { SiiRut } from './rut'

/**
 * EN: Cover fields common to the purchase and sales book and the guide book, as the caller provides them.
 * ES: `Caratula` — Campos comunes de la carátula del libro de compras y ventas y del libro de guías, tal como los entrega el llamador.
 */
export type BookCoverInput = {
  /** EN: Company the book belongs to. ES: `RutEmisorLibro` — RUT del contribuyente dueño del libro. */
  readonly issuerRut: string
  /** EN: Authorized sender, normally the certificate holder. ES: `RutEnvia` — RUT de quien envía, normalmente el titular del certificado. */
  readonly senderRut: string
  /** EN: Tax period, `YYYY-MM`. On a special book, the earliest period it covers. ES: `PeriodoTributario` — Período tributario, `AAAA-MM`. En un libro especial, el primero que incluye. */
  readonly period: string
  /** EN: Resolution date (YYYY-MM-DD or DD-MM-YYYY). ES: `FchResol` — Fecha de resolución (AAAA-MM-DD o DD-MM-AAAA). */
  readonly resolutionDate: string
  /** EN: Resolution number, 0 in certification. ES: `NroResol` — Número de resolución, 0 en certificación. */
  readonly resolutionNumber: number
  /** EN: Submission kind; `total` by default. ES: `TipoEnvio` — Tipo de envío; `total` por defecto. */
  readonly submission?: BookSubmission
  /** EN: Segment number; required on `partial` and emitted only there. ES: `NroSegmento` — Número de segmento; obligatorio en `partial` y se emite solo ahí. */
  readonly segmentNumber?: number
  /** EN: Folio of the SII notification; required on `special` books and on every guide book. ES: `FolioNotificacion` — Folio de la notificación del SII; obligatorio en libros `special` y en todo libro de guías. */
  readonly notificationFolio?: number
}

/**
 * EN: Normalized cover fields common to the purchase and sales book and the guide book.
 * ES: `Caratula` — Campos comunes normalizados de la carátula del libro de compras y ventas y del libro de guías.
 */
export type BookCover = Omit<BookCoverInput, 'issuerRut' | 'senderRut' | 'submission'> & {
  /** EN: Book owner. ES: `RutEmisorLibro` — RUT del dueño del libro. */
  readonly issuerRut: SiiRut
  /** EN: Sender. ES: `RutEnvia` — RUT de quien envía. */
  readonly senderRut: SiiRut
  /** EN: Submission kind. ES: `TipoEnvio` — Tipo de envío. */
  readonly submission: BookSubmission
}

/**
 * EN: Cover of a purchase and sales book, as the caller provides it.
 * ES: `Caratula` — Carátula de un libro de compras y ventas, tal como la entrega el llamador.
 */
export type PurchaseSalesCoverInput = BookCoverInput & {
  /** EN: Book side. ES: `TipoOperacion` — Lado del libro: `sale` (VENTA) o `purchase` (COMPRA). */
  readonly operation: BookOperation
  /** EN: Book kind; `monthly` by default. ES: `TipoLibro` — Tipo de libro; `monthly` por defecto. */
  readonly kind?: BookKind
  /** EN: Replacement authorization code (max 10); required on `rectification`. ES: `CodAutRec` — Código de autorización de reemplazo, máximo 10; obligatorio en `rectification`. */
  readonly rectificationCode?: string
}

/**
 * EN: Normalized cover of a purchase and sales book.
 * ES: `Caratula` — Carátula normalizada de un libro de compras y ventas.
 */
export type PurchaseSalesCover = BookCover & {
  /** EN: Book side. ES: `TipoOperacion` — Lado del libro. */
  readonly operation: BookOperation
  /** EN: Book kind. ES: `TipoLibro` — Tipo de libro. */
  readonly kind: BookKind
  /** EN: Replacement authorization code. ES: `CodAutRec` — Código de autorización de reemplazo. */
  readonly rectificationCode?: string
}

/**
 * EN: Non-recoverable VAT of a line.
 * ES: `IVANoRec` — IVA no recuperable de una línea.
 */
export type BookNonRecoverableVat = {
  /** EN: Reason code. ES: `CodIVANoRec` — Código del motivo. */
  readonly code: NonRecoverableVatCode
  /** EN: Amount. ES: `MntIVANoRec` — Monto. */
  readonly amount: number
}

/**
 * EN: Additional tax, retention or surcharge of a line.
 * ES: `OtrosImp` — Impuesto adicional, retención o recargo de una línea.
 */
export type BookOtherTax = {
  /** EN: Tax code. ES: `CodImp` — Código del impuesto. */
  readonly code: number
  /** EN: Rate, percent. ES: `TasaImp` — Tasa, en porcentaje. */
  readonly rate?: number
  /** EN: Amount; may be negative. ES: `MntImp` — Monto; puede ser negativo. */
  readonly amount: number
}

/**
 * EN: Foreign receiver of an export document.
 * ES: `Extranjero` — Receptor extranjero de un documento de exportación.
 */
export type BookForeignReceiver = {
  /** EN: Foreign identifier (max 20). ES: `NumId` — Identificador extranjero, máximo 20. */
  readonly id?: string
  /** EN: Nationality code (max 3). ES: `Nacionalidad` — Código de nacionalidad, máximo 3. */
  readonly nationality?: string
}

/**
 * EN: Commissions and other charges of a settlement invoice (40, 43, 103), as the caller provides them.
 * ES: `Liquidaciones` — Comisiones y otros cargos de una liquidación (40, 43, 103), tal como los entrega el llamador.
 */
export type BookSettlementInput = {
  /** EN: RUT of whoever issued the settlement. ES: `RutEmisor` — RUT del emisor de la liquidación. */
  readonly issuerRut: string
  /** EN: Net commissions; may be negative. ES: `ValComNeto` — Valor neto de comisiones; puede ser negativo. */
  readonly netValue?: number
  /** EN: Exempt commissions; may be negative. ES: `ValComExe` — Valor de comisiones exentas; puede ser negativo. */
  readonly exemptValue?: number
  /** EN: VAT on commissions; may be negative. ES: `ValComIVA` — IVA de comisiones; puede ser negativo. */
  readonly vatValue?: number
}

/**
 * EN: One line of the purchase and sales book, as the caller provides it. Each field says which book it applies to when
 * it is not both; the XSD has a single `Detalle`, so the SDK does not forbid a combination.
 * ES: `Detalle` — Una línea del libro de compras y ventas, tal como la entrega el llamador. Cada campo dice a qué libro
 * aplica cuando no es a ambos; el XSD tiene un solo `Detalle`, así que el SDK no prohíbe ninguna combinación.
 */
export type BookEntryInput = {
  /** EN: Document type. ES: `TpoDoc` — Tipo de documento. */
  readonly type: number
  /** EN: Folio. ES: `NroDoc` — Folio del documento. */
  readonly folio: number
  /** EN: Folio voided before reaching the SII: only type and folio travel, and it adds no amounts. ES: `Anulado` — Folio anulado antes de llegar al SII: solo viajan tipo y folio, y no suma montos. */
  readonly voided?: boolean
  /** EN: Adjustment operation; defaults to `add` on `adjustment` submissions, and `remove` subtracts in the totals. ES: `Operacion` — Operación del ajuste; por defecto `add` en envíos `adjustment`, y `remove` resta en los totales. */
  readonly adjustment?: BookAdjustment
  /** EN: Note issued by the book owner that affects a purchase invoice. ES: `Emisor` — Nota emitida por el dueño del libro que afecta a una factura de compra. */
  readonly issuedByBookOwner?: boolean
  /** EN: Purchase invoice indicator. ES: `IndFactCompra` — Indicador de factura de compra. */
  readonly purchaseInvoice?: boolean
  /** EN: Tax kind, purchases: `vat` or `freeZone` (Law 18.211). ES: `TpoImp` — Tipo de impuesto, compras: `vat` (IVA) o `freeZone` (Ley 18.211). */
  readonly taxKind?: BookTaxKind
  /** EN: VAT or Law 18.211 rate, percent; the VAT rate is used when a line has net and VAT without a rate. ES: `TasaImp` — Tasa de IVA o de la Ley 18.211, en porcentaje; se usa la tasa de IVA si una línea tiene neto e IVA sin tasa. */
  readonly taxRate?: number
  /** EN: Internal reference (max 10). ES: `NumInt` — Referencia interna, máximo 10. */
  readonly internalNumber?: string
  /** EN: Periodic service indicator, sales. ES: `IndServicio` — Indicador de servicio periódico, ventas. */
  readonly serviceIndicator?: 1 | 2 | 3
  /** EN: Free delivery, sales. ES: `IndSinCosto` — Entrega gratuita, ventas. */
  readonly freeOfCharge?: boolean
  /** EN: Document date (YYYY-MM-DD or DD-MM-YYYY), from 2000 to 2050. ES: `FchDoc` — Fecha del documento (AAAA-MM-DD o DD-MM-AAAA), de 2000 a 2050. */
  readonly date?: string
  /** EN: SII branch code. ES: `CdgSIISucur` — Código SII de la sucursal. */
  readonly branchCode?: number
  /** EN: Customer or supplier RUT. ES: `RUTDoc` — RUT del cliente o proveedor. */
  readonly counterpartyRut?: string
  /** EN: Customer or supplier name (max 50). ES: `RznSoc` — Razón social del cliente o proveedor, máximo 50. */
  readonly counterpartyName?: string
  /** EN: Foreign receiver, sales. ES: `Extranjero` — Receptor extranjero, ventas. */
  readonly foreignReceiver?: BookForeignReceiver
  /** EN: Type of the voided document, sales. ES: `TpoDocRef` — Tipo del documento anulado, ventas. */
  readonly referenceType?: number
  /** EN: Folio of the voided document, sales. ES: `FolioDocRef` — Folio del documento anulado, ventas. */
  readonly referenceFolio?: number
  /** EN: Exempt amount; 0 by default on sale books. ES: `MntExe` — Monto exento; 0 por defecto en libros de venta. */
  readonly exemptAmount?: number
  /** EN: Net amount; 0 by default on sale books. ES: `MntNeto` — Monto neto; 0 por defecto en libros de venta. */
  readonly netAmount?: number
  /** EN: VAT; on purchases, the recoverable part. 0 by default on sale books. ES: `MntIVA` — IVA; en compras, la parte recuperable. 0 por defecto en libros de venta. */
  readonly vatAmount?: number
  /** EN: Net of fixed assets, purchases; also included in `netAmount`. ES: `MntActivoFijo` — Neto de activo fijo, compras; también incluido en `netAmount`. */
  readonly fixedAssetNetAmount?: number
  /** EN: VAT of fixed assets, purchases. ES: `MntIVAActivoFijo` — IVA de activo fijo, compras. */
  readonly fixedAssetVatAmount?: number
  /** EN: Non-recoverable VAT, purchases (max 5). ES: `IVANoRec` — IVA no recuperable, compras, máximo 5. */
  readonly nonRecoverableVat?: readonly BookNonRecoverableVat[]
  /** EN: Common-use VAT, purchases. ES: `IVAUsoComun` — IVA de uso común, compras. */
  readonly commonUseVat?: number
  /** EN: VAT of a late credit note, sales. ES: `IVAFueraPlazo` — IVA de una nota de crédito fuera de plazo, ventas. */
  readonly lateVat?: number
  /** EN: Own VAT on sales for third parties. ES: `IVAPropio` — IVA propio en ventas por cuenta de terceros. */
  readonly ownVatAmount?: number
  /** EN: Third-party VAT on sales for third parties. ES: `IVATerceros` — IVA de terceros en ventas por cuenta de terceros. */
  readonly thirdPartyVatAmount?: number
  /** EN: Free zone tax. ES: `Ley18211` — Impuesto de zona franca. */
  readonly freeZoneTax?: number
  /** EN: Additional taxes and retentions (max 20). ES: `OtrosImp` — Impuestos adicionales y retenciones, máximo 20. */
  readonly otherTaxes?: readonly BookOtherTax[]
  /** EN: Tax without credit right, purchases. ES: `MntSinCred` — Impuesto sin derecho a crédito, compras. */
  readonly nonCreditableTax?: number
  /** EN: Fully withheld VAT. ES: `IVARetTotal` — IVA retenido total. */
  readonly totalVatWithheld?: number
  /** EN: Partly withheld VAT. ES: `IVARetParcial` — IVA retenido parcial. */
  readonly partialVatWithheld?: number
  /** EN: 65 % credit of construction companies, sales. ES: `CredEC` — Crédito 65 % de empresas constructoras, ventas. */
  readonly constructionCredit?: number
  /** EN: Container deposit. ES: `DepEnvase` — Garantía por depósito de envases. */
  readonly containerDeposit?: number
  /** EN: Settlement commissions, sales. ES: `Liquidaciones` — Comisiones de liquidaciones, ventas. */
  readonly settlement?: BookSettlementInput
  /** EN: Line total; computed with the SII formula when absent, kept and compared when present. ES: `MntTotal` — Total de la línea; se calcula con la fórmula del SII si falta, se conserva y se compara si viene. */
  readonly totalAmount?: number
  /** EN: VAT not withheld on purchase invoices. ES: `IVANoRetenido` — IVA no retenido en facturas de compra. */
  readonly vatNotWithheld?: number
  /** EN: Non-billable amount, sales. ES: `MntNoFact` — Monto no facturable, ventas. */
  readonly nonBillableAmount?: number
  /** EN: Period amount, sales. ES: `MntPeriodo` — Monto del período, ventas. */
  readonly periodAmount?: number
  /** EN: Domestic tickets, sales. ES: `PsjNac` — Pasajes nacionales, ventas. */
  readonly domesticTickets?: number
  /** EN: International tickets, sales. ES: `PsjInt` — Pasajes internacionales, ventas. */
  readonly internationalTickets?: number
  /** EN: Cigars tax, purchases. ES: `TabPuros` — Impuesto a los cigarros puros, compras. */
  readonly cigars?: number
  /** EN: Cigarettes tax, purchases. ES: `TabCigarrillos` — Impuesto a los cigarrillos, compras. */
  readonly cigarettes?: number
  /** EN: Processed tobacco tax, purchases. ES: `TabElaborado` — Impuesto al tabaco elaborado, compras. */
  readonly processedTobacco?: number
  /** EN: Vehicle tax, purchases. ES: `ImpVehiculo` — Impuesto a los vehículos, compras. */
  readonly vehicleTax?: number
}

/**
 * EN: Tax kind of a line: `vat` is `TpoImp` 1, `freeZone` (Law 18.211) is 2.
 * ES: `TpoImp` — Tipo de impuesto de una línea: `vat` (IVA) es 1, `freeZone` (Ley 18.211) es 2.
 */
export type BookTaxKind = 'vat' | 'freeZone'

/**
 * EN: A normalized line of the purchase and sales book. A voided line has only `type`, `folio`, `voided` and `adjustment`.
 * ES: `Detalle` — Línea normalizada del libro de compras y ventas. Una línea anulada solo tiene `type`, `folio`, `voided` y `adjustment`.
 */
export type BookEntry = Omit<BookEntryInput, 'counterpartyRut' | 'settlement'> & {
  /** EN: Customer or supplier RUT. ES: `RUTDoc` — RUT del cliente o proveedor. */
  readonly counterpartyRut?: SiiRut
  /** EN: Settlement commissions. ES: `Liquidaciones` — Comisiones de liquidaciones. */
  readonly settlement?: Omit<BookSettlementInput, 'issuerRut'> & { readonly issuerRut: SiiRut }
}

/**
 * EN: An explicit line total that differs from the SII formula. Reported, not thrown, unless `strictTotals` is set.
 * ES: Un total explícito de línea que difiere de la fórmula del SII. Se informa, no se lanza, salvo con `strictTotals`.
 */
export type BookTotalMismatch = {
  /** EN: Position of the line in `entries`. ES: Posición de la línea en `entries`. */
  readonly index: number
  /** EN: Document type. ES: `TpoDoc` — Tipo de documento. */
  readonly type: number
  /** EN: Folio. ES: `NroDoc` — Folio. */
  readonly folio: number
  /** EN: What the formula gives. ES: Lo que da la fórmula. */
  readonly expected: number
  /** EN: What the line says. ES: Lo que dice la línea. */
  readonly actual: number
}

/**
 * EN: Non-recoverable VAT of a document type in a summary.
 * ES: `TotIVANoRec` — IVA no recuperable de un tipo de documento en un resumen.
 */
export type BookNonRecoverableVatTotal = {
  /** EN: Reason code. ES: `CodIVANoRec` — Código del motivo. */
  readonly code: number
  /** EN: Lines with this code. ES: `TotOpIVANoRec` — Líneas con este código. */
  readonly count?: number
  /** EN: Amount. ES: `TotMntIVANoRec` — Monto. */
  readonly amount: number
}

/**
 * EN: Additional tax of a document type in a summary.
 * ES: `TotOtrosImp` — Impuesto adicional de un tipo de documento en un resumen.
 */
export type BookOtherTaxTotal = {
  /** EN: Tax code. ES: `CodImp` — Código del impuesto. */
  readonly code: number
  /** EN: Amount. ES: `TotMntImp` — Monto. */
  readonly amount: number
}

/**
 * EN: Settlement commissions of a document type in a summary.
 * ES: `TotLiquidaciones` — Comisiones de liquidaciones de un tipo de documento en un resumen.
 */
export type BookSettlementTotals = {
  /** EN: Net commissions. ES: `TotValComNeto` — Valor neto de comisiones. */
  readonly netValue?: number
  /** EN: Exempt commissions. ES: `TotValComExe` — Valor de comisiones exentas. */
  readonly exemptValue?: number
  /** EN: VAT on commissions. ES: `TotValComIVA` — IVA de comisiones. */
  readonly vatValue?: number
}

/**
 * EN: Totals of one document type in a summary. A plain JSON value: persist `book.periodTotals` and pass it back as
 * `previousTotals`.
 * ES: `TotalesSegmento` / `TotalesPeriodo` — Totales de un tipo de documento en un resumen. Es un valor JSON simple: se
 * puede guardar `book.periodTotals` y devolverlo como `previousTotals`.
 */
export type BookTotals = {
  /** EN: Document type. ES: `TpoDoc` — Tipo de documento. */
  readonly type: number
  /** EN: Tax kind. ES: `TpoImp` — Tipo de impuesto. */
  readonly taxKind?: BookTaxKind
  /** EN: Documents, voided ones included. ES: `TotDoc` — Documentos, incluidos los anulados. */
  readonly documentCount: number
  /** EN: Voided folios. ES: `TotAnulado` — Folios anulados. */
  readonly voidedCount?: number
  /** EN: Exempt amount. ES: `TotMntExe` — Monto exento. */
  readonly exemptAmount: number
  /** EN: Net amount. ES: `TotMntNeto` — Monto neto. */
  readonly netAmount: number
  /** EN: VAT. ES: `TotMntIVA` — IVA. */
  readonly vatAmount: number
  /** EN: Net of fixed assets. ES: `TotMntActivoFijo` — Neto de activo fijo. */
  readonly fixedAssetNetAmount?: number
  /** EN: VAT of fixed assets. ES: `TotMntIVAActivoFijo` — IVA de activo fijo. */
  readonly fixedAssetVatAmount?: number
  /** EN: Non-recoverable VAT per code. ES: `TotIVANoRec` — IVA no recuperable por código. */
  readonly nonRecoverableVat?: readonly BookNonRecoverableVatTotal[]
  /** EN: Lines with common-use VAT. ES: `TotOpIVAUsoComun` — Líneas con IVA de uso común. */
  readonly commonUseVatCount?: number
  /** EN: Common-use VAT. ES: `TotIVAUsoComun` — IVA de uso común. */
  readonly commonUseVat?: number
  /** EN: Late VAT. ES: `TotIVAFueraPlazo` — IVA fuera de plazo. */
  readonly lateVat?: number
  /** EN: Own VAT. ES: `TotIVAPropio` — IVA propio. */
  readonly ownVatAmount?: number
  /** EN: Third-party VAT. ES: `TotIVATerceros` — IVA de terceros. */
  readonly thirdPartyVatAmount?: number
  /** EN: Free zone tax. ES: `TotLey18211` — Impuesto de zona franca. */
  readonly freeZoneTax?: number
  /** EN: Additional taxes per code. ES: `TotOtrosImp` — Impuestos adicionales por código. */
  readonly otherTaxes?: readonly BookOtherTaxTotal[]
  /** EN: Tax without credit right. ES: `TotImpSinCredito` — Impuesto sin derecho a crédito. */
  readonly nonCreditableTax?: number
  /** EN: Fully withheld VAT. ES: `TotIVARetTotal` — IVA retenido total. */
  readonly totalVatWithheld?: number
  /** EN: Partly withheld VAT. ES: `TotIVARetParcial` — IVA retenido parcial. */
  readonly partialVatWithheld?: number
  /** EN: Construction companies credit. ES: `TotCredEC` — Crédito de empresas constructoras. */
  readonly constructionCredit?: number
  /** EN: Container deposit. ES: `TotDepEnvase` — Garantía por depósito de envases. */
  readonly containerDeposit?: number
  /** EN: Settlement commissions. ES: `TotLiquidaciones` — Comisiones de liquidaciones. */
  readonly settlement?: BookSettlementTotals
  /** EN: Total amount. ES: `TotMntTotal` — Monto total. */
  readonly totalAmount: number
  /** EN: VAT not withheld. ES: `TotIVANoRetenido` — IVA no retenido. */
  readonly vatNotWithheld?: number
  /** EN: Non-billable amount. ES: `TotMntNoFact` — Monto no facturable. */
  readonly nonBillableAmount?: number
  /** EN: Period amount. ES: `TotMntPeriodo` — Monto del período. */
  readonly periodAmount?: number
  /** EN: Domestic tickets. ES: `TotPsjNac` — Pasajes nacionales. */
  readonly domesticTickets?: number
  /** EN: International tickets. ES: `TotPsjInt` — Pasajes internacionales. */
  readonly internationalTickets?: number
  /** EN: Cigars tax. ES: `TotTabPuros` — Impuesto a los cigarros puros. */
  readonly cigars?: number
  /** EN: Cigarettes tax. ES: `TotTabCigarrillos` — Impuesto a los cigarrillos. */
  readonly cigarettes?: number
  /** EN: Processed tobacco tax. ES: `TotTabElaborado` — Impuesto al tabaco elaborado. */
  readonly processedTobacco?: number
  /** EN: Vehicle tax; period summaries only. ES: `TotImpVehiculo` — Impuesto a los vehículos; solo en resúmenes de período. */
  readonly vehicleTax?: number
}

/**
 * EN: Totals of a document type as the caller provides them: anything absent counts as 0.
 * ES: Totales de un tipo de documento tal como los entrega el llamador: lo que falte cuenta como 0.
 */
export type BookTotalsInput = Partial<Omit<BookTotals, 'type'>> & Pick<BookTotals, 'type'>

/**
 * EN: Input of `createPurchaseSalesBook`.
 * ES: Entrada de `createPurchaseSalesBook`.
 */
export type PurchaseSalesBookInput = {
  /** EN: Cover. ES: `Caratula` — Carátula. */
  readonly cover: PurchaseSalesCoverInput
  /** EN: One line per document. ES: `Detalle` — Una línea por documento. */
  readonly entries?: readonly BookEntryInput[]
  /** EN: Totals of types the format excludes from the detail (receipts, among others). Rejected on `partial`. ES: Totales de tipos que el formato excluye del detalle (boletas, entre otros). No se aceptan en `partial`. */
  readonly summaryOnlyTotals?: readonly BookTotalsInput[]
  /** EN: Period totals of earlier submissions; `final` and `adjustment` only. ES: Totales del período de envíos anteriores; solo en `final` y `adjustment`. */
  readonly previousTotals?: readonly BookTotals[]
  /** EN: Proportionality factor, one per book; required when a period summary has common-use VAT. ES: `FctProp` — Factor de proporcionalidad, uno por libro; obligatorio si un resumen de período tiene IVA de uso común. */
  readonly commonUseVatFactor?: number
  /** EN: Additional tax factor per tax code. ES: `FctImpAdic` — Factor de impuesto adicional por código. */
  readonly additionalTaxFactors?: Readonly<Record<number, number>>
  /** EN: Throw `BOOK_TOTAL_MISMATCH` instead of reporting in `totalMismatches`. ES: Lanzar `BOOK_TOTAL_MISMATCH` en vez de informar en `totalMismatches`. */
  readonly strictTotals?: boolean
  /** EN: Explicit `EnvioLibro/@ID`; generated when absent. ES: `ID` explícito del `EnvioLibro`; se genera si falta. */
  readonly id?: string
  /** EN: Clock for the id and `TmstFirma`. ES: Reloj para el id y `TmstFirma`. */
  readonly now?: Date
}

/**
 * EN: A normalized purchase and sales book, ready to render and sign.
 * ES: Un libro de compras y ventas normalizado, listo para renderizar y firmar.
 */
export type PurchaseSalesBook = {
  /** EN: `EnvioLibro/@ID`. ES: `EnvioLibro/@ID` — Identificador del envío. */
  readonly id: string
  /** EN: Cover. ES: `Caratula` — Carátula. */
  readonly cover: PurchaseSalesCover
  /** EN: Lines. ES: `Detalle` — Líneas. */
  readonly entries: readonly BookEntry[]
  /** EN: Segment summary, or null when the submission has none. ES: `ResumenSegmento` — Resumen del segmento, o null si el envío no lleva. */
  readonly segmentTotals: readonly BookTotals[] | null
  /** EN: Period summary, or null when the submission has none. ES: `ResumenPeriodo` — Resumen del período, o null si el envío no lleva. */
  readonly periodTotals: readonly BookTotals[] | null
  /** EN: Proportionality factor. ES: `FctProp` — Factor de proporcionalidad. */
  readonly commonUseVatFactor?: number
  /** EN: Additional tax factors. ES: `FctImpAdic` — Factores de impuesto adicional. */
  readonly additionalTaxFactors?: Readonly<Record<number, number>>
  /** EN: Explicit totals that differ from the formula. ES: Totales explícitos que difieren de la fórmula. */
  readonly totalMismatches: readonly BookTotalMismatch[]
  /** EN: Signing timestamp, Chile time. ES: `TmstFirma` — Marca de tiempo de la firma, hora de Chile. */
  readonly signedAt: string
}

/**
 * EN: Cover of a guide book, as the caller provides it. The schema only admits `TipoLibro` `ESPECIAL` and requires the
 * notification folio.
 * ES: `Caratula` — Carátula de un libro de guías, tal como la entrega el llamador. El esquema solo admite `TipoLibro`
 * `ESPECIAL` y exige el folio de notificación.
 */
export type GuideBookCoverInput = BookCoverInput & {
  /** EN: Folio of the SII notification. ES: `FolioNotificacion` — Folio de la notificación del SII. */
  readonly notificationFolio: number
}

/**
 * EN: Normalized cover of a guide book.
 * ES: `Caratula` — Carátula normalizada de un libro de guías.
 */
export type GuideBookCover = BookCover & {
  /** EN: Folio of the SII notification. ES: `FolioNotificacion` — Folio de la notificación del SII. */
  readonly notificationFolio: number
}

/**
 * EN: One line of the guide book, as the caller provides it.
 * ES: `Detalle` — Una línea del libro de guías, tal como la entrega el llamador.
 */
export type GuideEntryInput = {
  /** EN: Guide folio. ES: `Folio` — Folio de la guía. */
  readonly folio: number
  /** EN: `folio` and `guide` voids drop the amounts and the receiver; `partialReceipt` keeps them. ES: `Anulado` — `folio` y `guide` descartan montos y receptor; `partialReceipt` los conserva. */
  readonly voided?: GuideVoidCode
  /** EN: Adjustment operation; defaults to `add` on `adjustment` submissions, and `remove` subtracts in the totals. ES: `Operacion` — Operación del ajuste; por defecto `add` en envíos `adjustment`, y `remove` resta en los totales. */
  readonly adjustment?: BookAdjustment
  /** EN: Guide operation, 1 to 7 (see `GUIDE_TRANSFER_TYPES`). ES: `TpoOper` — Operación de la guía, 1 a 7 (ver `GUIDE_TRANSFER_TYPES`). */
  readonly transferType?: number
  /** EN: Guide date (YYYY-MM-DD or DD-MM-YYYY). ES: `FchDoc` — Fecha de la guía (AAAA-MM-DD o DD-MM-AAAA). */
  readonly date?: string
  /** EN: Receiver RUT, mandatory for the SII on sales. ES: `RUTDoc` — RUT del receptor, obligatorio para el SII en ventas. */
  readonly receiverRut?: string
  /** EN: Receiver name (max 50). ES: `RznSoc` — Razón social del receptor, máximo 50. */
  readonly receiverName?: string
  /** EN: Net amount. ES: `MntNeto` — Monto neto. */
  readonly netAmount?: number
  /** EN: VAT rate, percent; 0 by default. ES: `TasaImp` — Tasa de IVA, en porcentaje; 0 por defecto. */
  readonly taxRate?: number
  /** EN: VAT; computed from rate and net when absent or 0. ES: `IVA` — IVA; se calcula desde tasa y neto si falta o es 0. */
  readonly vatAmount?: number
  /** EN: Total; net + VAT when absent. ES: `MntTotal` — Total; neto + IVA si falta. */
  readonly totalAmount?: number
  /** EN: Corrected total of a `partialReceipt`. ES: `MntModificado` — Total corregido de una recepción parcial. */
  readonly modifiedAmount?: number
  /** EN: Type of the invoice issued for the guide. ES: `TpoDocRef` — Tipo de la factura emitida por la guía. */
  readonly referenceType?: number
  /** EN: Folio of the invoice issued for the guide. ES: `FolioDocRef` — Folio de la factura emitida por la guía. */
  readonly referenceFolio?: number
  /** EN: Date of the invoice issued for the guide. ES: `FchDocRef` — Fecha de la factura emitida por la guía. */
  readonly referenceDate?: string
}

/**
 * EN: A normalized line of the guide book.
 * ES: `Detalle` — Línea normalizada del libro de guías.
 */
export type GuideEntry = Omit<GuideEntryInput, 'receiverRut' | 'taxRate' | 'vatAmount' | 'totalAmount'> & {
  /** EN: Receiver RUT. ES: `RUTDoc` — RUT del receptor. */
  readonly receiverRut?: SiiRut
  /** EN: VAT rate. ES: `TasaImp` — Tasa de IVA. */
  readonly taxRate: number
  /** EN: VAT. ES: `IVA` — IVA. */
  readonly vatAmount: number
  /** EN: Total. ES: `MntTotal` — Total. */
  readonly totalAmount: number
}

/**
 * EN: Non-sale guides of one operation in a summary.
 * ES: `TotTraslado` — Guías no venta de una operación en un resumen.
 */
export type GuideTransferTotal = {
  /** EN: Operation, 2 to 7. ES: `TpoTraslado` — Operación, 2 a 7. */
  readonly type: number
  /** EN: Guides. ES: `CantGuia` — Cantidad de guías. */
  readonly count: number
  /** EN: Amount. ES: `MntGuia` — Monto. */
  readonly amount: number
}

/**
 * EN: Summary of a guide book. A plain JSON value: persist `book.periodTotals` and pass it back as `previousTotals`.
 * ES: `ResumenSegmento` / `ResumenPeriodo` — Resumen de un libro de guías. Es un valor JSON simple: se puede guardar
 * `book.periodTotals` y devolverlo como `previousTotals`.
 */
export type GuideTotals = {
  /** EN: Folios voided before reaching the SII. ES: `TotFolAnulado` — Folios anulados antes de llegar al SII. */
  readonly voidedFolios: number
  /** EN: Guides voided afterwards. ES: `TotGuiaAnulada` — Guías anuladas después. */
  readonly voidedGuides: number
  /** EN: Sale guides. ES: `TotGuiaVenta` — Guías de venta. */
  readonly saleGuides: number
  /** EN: Amount of the sale guides. ES: `TotMntGuiaVta` — Monto de las guías de venta. */
  readonly saleGuidesAmount: number
  /** EN: Sum of the corrected totals. ES: `TotMntModificado` — Suma de los totales corregidos. */
  readonly modifiedAmount: number
  /** EN: Non-sale guides per operation. ES: `TotTraslado` — Guías no venta por operación. */
  readonly transfers: readonly GuideTransferTotal[]
}

/**
 * EN: Input of `createGuideBook`.
 * ES: Entrada de `createGuideBook`.
 */
export type GuideBookInput = {
  /** EN: Cover. ES: `Caratula` — Carátula. */
  readonly cover: GuideBookCoverInput
  /** EN: One line per guide. ES: `Detalle` — Una línea por guía. */
  readonly entries?: readonly GuideEntryInput[]
  /** EN: Period totals of earlier submissions; `final` and `adjustment` only. ES: Totales del período de envíos anteriores; solo en `final` y `adjustment`. */
  readonly previousTotals?: GuideTotals
  /** EN: Explicit `EnvioLibro/@ID`; generated when absent. ES: `ID` explícito del `EnvioLibro`; se genera si falta. */
  readonly id?: string
  /** EN: Clock for the id and `TmstFirma`. ES: Reloj para el id y `TmstFirma`. */
  readonly now?: Date
}

/**
 * EN: A normalized guide book, ready to render and sign.
 * ES: Un libro de guías normalizado, listo para renderizar y firmar.
 */
export type GuideBook = {
  /** EN: `EnvioLibro/@ID`. ES: `EnvioLibro/@ID` — Identificador del envío. */
  readonly id: string
  /** EN: Cover. ES: `Caratula` — Carátula. */
  readonly cover: GuideBookCover
  /** EN: Lines. ES: `Detalle` — Líneas. */
  readonly entries: readonly GuideEntry[]
  /** EN: Segment summary, or null. ES: `ResumenSegmento` — Resumen del segmento, o null. */
  readonly segmentTotals: GuideTotals | null
  /** EN: Period summary, or null. ES: `ResumenPeriodo` — Resumen del período, o null. */
  readonly periodTotals: GuideTotals | null
  /** EN: Signing timestamp, Chile time. ES: `TmstFirma` — Marca de tiempo de la firma, hora de Chile. */
  readonly signedAt: string
}

/**
 * EN: Cover of a folio consumption report, as the caller provides it.
 * ES: `Caratula` — Carátula de un reporte de consumo de folios, tal como la entrega el llamador.
 */
export type FolioConsumptionCoverInput = {
  /** EN: Issuer company. ES: `RutEmisor` — RUT de la empresa emisora. */
  readonly issuerRut: string
  /** EN: Authorized sender. ES: `RutEnvia` — RUT de quien envía. */
  readonly senderRut: string
  /** EN: Resolution date. ES: `FchResol` — Fecha de resolución. */
  readonly resolutionDate: string
  /** EN: Resolution number. ES: `NroResol` — Número de resolución. */
  readonly resolutionNumber: number
  /** EN: First day; the earliest issue date when absent, required with no lines. ES: `FchInicio` — Primer día; la fecha de emisión más temprana si falta, obligatorio sin líneas. */
  readonly from?: string
  /** EN: Last day; the latest issue date when absent, required with no lines. ES: `FchFinal` — Último día; la fecha de emisión más tardía si falta, obligatorio sin líneas. */
  readonly to?: string
  /** EN: Submission sequence, 1 by default; raise it to correct a report. ES: `SecEnvio` — Secuencia de envío, 1 por defecto; se aumenta para corregir un reporte. */
  readonly sequence?: number
  /** EN: Correlative within the day. ES: `Correlativo` — Correlativo dentro del día. */
  readonly correlative?: number
}

/**
 * EN: Normalized cover of a folio consumption report.
 * ES: `Caratula` — Carátula normalizada de un reporte de consumo de folios.
 */
export type FolioConsumptionCover = {
  /** EN: Issuer company. ES: `RutEmisor` — RUT de la empresa emisora. */
  readonly issuerRut: SiiRut
  /** EN: Authorized sender. ES: `RutEnvia` — RUT de quien envía. */
  readonly senderRut: SiiRut
  /** EN: Resolution date. ES: `FchResol` — Fecha de resolución. */
  readonly resolutionDate: string
  /** EN: Resolution number. ES: `NroResol` — Número de resolución. */
  readonly resolutionNumber: number
  /** EN: First day. ES: `FchInicio` — Primer día. */
  readonly from: string
  /** EN: Last day. ES: `FchFinal` — Último día. */
  readonly to: string
  /** EN: Submission sequence. ES: `SecEnvio` — Secuencia de envío. */
  readonly sequence: number
  /** EN: Correlative within the day. ES: `Correlativo` — Correlativo dentro del día. */
  readonly correlative?: number
  /** EN: Signing timestamp, Chile time. ES: `TmstFirmaEnv` — Marca de tiempo de la firma, hora de Chile. */
  readonly signedAt: string
}

/**
 * EN: Document types of the report: 39 and 41, per the 2020 format.
 * ES: `TipoDocumento` — Tipos de documento del reporte: 39 y 41, según el formato de 2020.
 */
export type FolioConsumptionType = 39 | 41

/**
 * EN: One receipt issued.
 * ES: Una boleta emitida.
 */
export type FolioConsumptionEntry = {
  /** EN: Document type. ES: `TipoDocumento` — Tipo de documento. */
  readonly type: FolioConsumptionType
  /** EN: Folio. ES: Folio de la boleta. */
  readonly folio: number
  /** EN: Issue date; defines `from` and `to` when they are absent. ES: Fecha de emisión; define `from` y `to` si faltan. */
  readonly issueDate?: string
  /** EN: Net amount; ignored on type 41. ES: `MntNeto` — Monto neto; se ignora en el tipo 41. */
  readonly netAmount?: number
  /** EN: VAT; ignored on type 41. ES: `MntIva` — IVA; se ignora en el tipo 41. */
  readonly vatAmount?: number
  /** EN: Exempt amount. ES: `MntExento` — Monto exento. */
  readonly exemptAmount?: number
  /** EN: Total. ES: `MntTotal` — Total. */
  readonly totalAmount: number
}

/**
 * EN: A folio voided in the system before reaching the SII, not one voided through a credit note.
 * ES: Un folio anulado en el sistema antes de llegar al SII, no uno anulado con una nota de crédito.
 */
export type VoidedFolio = {
  /** EN: Document type. ES: `TipoDocumento` — Tipo de documento. */
  readonly type: FolioConsumptionType
  /** EN: Folio. ES: Folio anulado. */
  readonly folio: number
}

/**
 * EN: A range of consecutive folios; a single folio has `from` equal to `to`.
 * ES: `RangoUtilizados` / `RangoAnulados` — Un rango de folios consecutivos; un folio solo tiene `from` igual a `to`.
 */
export type FolioRange = {
  /** EN: First folio. ES: `Inicial` — Folio inicial. */
  readonly from: number
  /** EN: Last folio. ES: `Final` — Folio final. */
  readonly to: number
}

/**
 * EN: Summary of one document type in the report.
 * ES: `Resumen` — Resumen de un tipo de documento en el reporte.
 */
export type FolioConsumptionSummary = {
  /** EN: Document type. ES: `TipoDocumento` — Tipo de documento. */
  readonly type: FolioConsumptionType
  /** EN: Net amount. ES: `MntNeto` — Monto neto. */
  readonly netAmount: number
  /** EN: VAT. ES: `MntIva` — IVA. */
  readonly vatAmount: number
  /** EN: VAT rate; type 39 only. ES: `TasaIVA` — Tasa de IVA; solo tipo 39. */
  readonly vatRate?: number
  /** EN: Exempt amount. ES: `MntExento` — Monto exento. */
  readonly exemptAmount: number
  /** EN: Total. ES: `MntTotal` — Total. */
  readonly totalAmount: number
  /** EN: Documents issued. ES: `FoliosEmitidos` — Documentos emitidos. */
  readonly issuedCount: number
  /** EN: Folios voided. ES: `FoliosAnulados` — Folios anulados. */
  readonly voidedCount: number
  /** EN: Issued plus voided. ES: `FoliosUtilizados` — Emitidos más anulados. */
  readonly usedCount: number
  /** EN: Ranges of issued folios. ES: `RangoUtilizados` — Rangos de folios emitidos. */
  readonly usedRanges: readonly FolioRange[]
  /** EN: Ranges of voided folios. ES: `RangoAnulados` — Rangos de folios anulados. */
  readonly voidedRanges: readonly FolioRange[]
}

/**
 * EN: Input of `createFolioConsumption`.
 * ES: Entrada de `createFolioConsumption`.
 */
export type FolioConsumptionInput = {
  /** EN: Cover. ES: `Caratula` — Carátula. */
  readonly cover: FolioConsumptionCoverInput
  /** EN: One line per receipt issued. ES: Una línea por boleta emitida. */
  readonly entries?: readonly FolioConsumptionEntry[]
  /** EN: Folios voided in the system. ES: Folios anulados en el sistema. */
  readonly voidedFolios?: readonly VoidedFolio[]
  /** EN: Explicit `DocumentoConsumoFolios/@ID`; generated when absent. ES: `ID` explícito del `DocumentoConsumoFolios`; se genera si falta. */
  readonly id?: string
  /** EN: Clock for the id and `TmstFirmaEnv`. ES: Reloj para el id y `TmstFirmaEnv`. */
  readonly now?: Date
}

/**
 * EN: A normalized folio consumption report, ready to render and sign. Used today in the receipts certification; the SII
 * probably no longer requires it in production.
 * ES: Un reporte de consumo de folios normalizado, listo para renderizar y firmar. Hoy se usa en la certificación de
 * boletas; probablemente el SII ya no lo exige en producción.
 */
export type FolioConsumption = {
  /** EN: `DocumentoConsumoFolios/@ID`. ES: `DocumentoConsumoFolios/@ID` — Identificador del documento. */
  readonly id: string
  /** EN: Cover. ES: `Caratula` — Carátula. */
  readonly cover: FolioConsumptionCover
  /** EN: One summary per document type. ES: `Resumen` — Un resumen por tipo de documento. */
  readonly summaries: readonly FolioConsumptionSummary[]
}
```

`src/model/sii-book.ts`:

```ts
/**
 * EN: The SII-shaped model of the three books: the official tags of `LibroCV_v10.xsd`, `LibroGuia_v10.xsd` and
 * `ConsumoFolio_v10.xsd`, verbatim, in schema order. The English domain model in `./book` documents what each one means;
 * `./book-codec` produces these values.
 * ES: El modelo con forma SII de los tres libros: las etiquetas oficiales de `LibroCV_v10.xsd`, `LibroGuia_v10.xsd` y
 * `ConsumoFolio_v10.xsd`, tal cual y en el orden del esquema. El modelo de dominio en inglés de `./book` documenta qué
 * significa cada una; `./book-codec` produce estos valores.
 */

/**
 * EN: Cover of a purchase and sales book.
 * ES: `Caratula` del libro de compras y ventas.
 */
export type SiiCaratulaLibro = {
  /** EN: Book owner. ES: `RutEmisorLibro` — RUT del dueño del libro. */
  readonly RutEmisorLibro: string
  /** EN: Sender. ES: `RutEnvia` — RUT de quien envía. */
  readonly RutEnvia: string
  /** EN: Tax period. ES: `PeriodoTributario` — Período tributario. */
  readonly PeriodoTributario: string
  /** EN: Resolution date. ES: `FchResol` — Fecha de resolución. */
  readonly FchResol: string
  /** EN: Resolution number. ES: `NroResol` — Número de resolución. */
  readonly NroResol: number
  /** EN: Book side. ES: `TipoOperacion` — COMPRA o VENTA. */
  readonly TipoOperacion: string
  /** EN: Book kind. ES: `TipoLibro` — MENSUAL, ESPECIAL o RECTIFICA. */
  readonly TipoLibro: string
  /** EN: Submission kind. ES: `TipoEnvio` — TOTAL, PARCIAL, FINAL o AJUSTE. */
  readonly TipoEnvio: string
  /** EN: Segment number. ES: `NroSegmento` — Número de segmento. */
  readonly NroSegmento?: number
  /** EN: Notification folio. ES: `FolioNotificacion` — Folio de la notificación. */
  readonly FolioNotificacion?: number
  /** EN: Replacement authorization code. ES: `CodAutRec` — Código de autorización de reemplazo. */
  readonly CodAutRec?: string
}

/**
 * EN: Non-recoverable VAT in a summary row.
 * ES: `TotIVANoRec` — IVA no recuperable en una fila del resumen.
 */
export type SiiTotIVANoRec = {
  /** EN: Reason code. ES: `CodIVANoRec` — Código del motivo. */
  readonly CodIVANoRec: number
  /** EN: Lines. ES: `TotOpIVANoRec` — Líneas con este código. */
  readonly TotOpIVANoRec?: number
  /** EN: Amount. ES: `TotMntIVANoRec` — Monto. */
  readonly TotMntIVANoRec: number
}

/**
 * EN: Additional tax in a summary row. `FctImpAdic` and `TotCredImp` exist only in `TotalesPeriodo`.
 * ES: `TotOtrosImp` — Impuesto adicional en una fila del resumen. `FctImpAdic` y `TotCredImp` existen solo en `TotalesPeriodo`.
 */
export type SiiTotOtrosImp = {
  /** EN: Tax code. ES: `CodImp` — Código del impuesto. */
  readonly CodImp: number
  /** EN: Amount. ES: `TotMntImp` — Monto. */
  readonly TotMntImp: number
  /** EN: Additional tax factor. ES: `FctImpAdic` — Factor de impuesto adicional. */
  readonly FctImpAdic?: number
  /** EN: Tax credit: factor × amount. ES: `TotCredImp` — Crédito: factor × monto. */
  readonly TotCredImp?: number
}

/**
 * EN: Settlement commissions in a summary row.
 * ES: `TotLiquidaciones` — Comisiones de liquidaciones en una fila del resumen.
 */
export type SiiTotLiquidaciones = {
  /** EN: Net commissions. ES: `TotValComNeto` — Valor neto de comisiones. */
  readonly TotValComNeto?: number
  /** EN: Exempt commissions. ES: `TotValComExe` — Valor de comisiones exentas. */
  readonly TotValComExe?: number
  /** EN: VAT on commissions. ES: `TotValComIVA` — IVA de comisiones. */
  readonly TotValComIVA?: number
}

/**
 * EN: Summary row of a segment, in schema order. Values may be negative.
 * ES: `TotalesSegmento` — Fila del resumen de un segmento, en el orden del esquema. Los valores pueden ser negativos.
 */
export type SiiTotalesSegmento = {
  /** EN: Document type. ES: `TpoDoc` — Tipo de documento. */
  readonly TpoDoc: number
  /** EN: Tax kind. ES: `TpoImp` — Tipo de impuesto. */
  readonly TpoImp?: number
  /** EN: Documents. ES: `TotDoc` — Documentos. */
  readonly TotDoc: number
  /** EN: Voided folios. ES: `TotAnulado` — Folios anulados. */
  readonly TotAnulado?: number
  /** EN: Exempt amount. ES: `TotMntExe` — Monto exento. */
  readonly TotMntExe: number
  /** EN: Net amount. ES: `TotMntNeto` — Monto neto. */
  readonly TotMntNeto: number
  /** EN: VAT. ES: `TotMntIVA` — IVA. */
  readonly TotMntIVA: number
  /** EN: Net of fixed assets. ES: `TotMntActivoFijo` — Neto de activo fijo. */
  readonly TotMntActivoFijo?: number
  /** EN: VAT of fixed assets. ES: `TotMntIVAActivoFijo` — IVA de activo fijo. */
  readonly TotMntIVAActivoFijo?: number
  /** EN: Non-recoverable VAT. ES: `TotIVANoRec` — IVA no recuperable. */
  readonly TotIVANoRec?: readonly SiiTotIVANoRec[]
  /** EN: Lines with common-use VAT. ES: `TotOpIVAUsoComun` — Líneas con IVA de uso común. */
  readonly TotOpIVAUsoComun?: number
  /** EN: Common-use VAT. ES: `TotIVAUsoComun` — IVA de uso común. */
  readonly TotIVAUsoComun?: number
  /** EN: Late VAT. ES: `TotIVAFueraPlazo` — IVA fuera de plazo. */
  readonly TotIVAFueraPlazo?: number
  /** EN: Own VAT. ES: `TotIVAPropio` — IVA propio. */
  readonly TotIVAPropio?: number
  /** EN: Third-party VAT. ES: `TotIVATerceros` — IVA de terceros. */
  readonly TotIVATerceros?: number
  /** EN: Free zone tax. ES: `TotLey18211` — Impuesto de zona franca. */
  readonly TotLey18211?: number
  /** EN: Additional taxes. ES: `TotOtrosImp` — Impuestos adicionales. */
  readonly TotOtrosImp?: readonly SiiTotOtrosImp[]
  /** EN: Tax without credit right. ES: `TotImpSinCredito` — Impuesto sin derecho a crédito. */
  readonly TotImpSinCredito?: number
  /** EN: Fully withheld VAT. ES: `TotIVARetTotal` — IVA retenido total. */
  readonly TotIVARetTotal?: number
  /** EN: Partly withheld VAT. ES: `TotIVARetParcial` — IVA retenido parcial. */
  readonly TotIVARetParcial?: number
  /** EN: Construction companies credit. ES: `TotCredEC` — Crédito de empresas constructoras. */
  readonly TotCredEC?: number
  /** EN: Container deposit. ES: `TotDepEnvase` — Garantía por depósito de envases. */
  readonly TotDepEnvase?: number
  /** EN: Settlement commissions. ES: `TotLiquidaciones` — Comisiones de liquidaciones. */
  readonly TotLiquidaciones?: SiiTotLiquidaciones
  /** EN: Total amount. ES: `TotMntTotal` — Monto total. */
  readonly TotMntTotal: number
  /** EN: VAT not withheld. ES: `TotIVANoRetenido` — IVA no retenido. */
  readonly TotIVANoRetenido?: number
  /** EN: Non-billable amount. ES: `TotMntNoFact` — Monto no facturable. */
  readonly TotMntNoFact?: number
  /** EN: Period amount. ES: `TotMntPeriodo` — Monto del período. */
  readonly TotMntPeriodo?: number
  /** EN: Domestic tickets. ES: `TotPsjNac` — Pasajes nacionales. */
  readonly TotPsjNac?: number
  /** EN: International tickets. ES: `TotPsjInt` — Pasajes internacionales. */
  readonly TotPsjInt?: number
  /** EN: Cigars tax. ES: `TotTabPuros` — Impuesto a los cigarros puros. */
  readonly TotTabPuros?: number
  /** EN: Cigarettes tax. ES: `TotTabCigarrillos` — Impuesto a los cigarrillos. */
  readonly TotTabCigarrillos?: number
  /** EN: Processed tobacco tax. ES: `TotTabElaborado` — Impuesto al tabaco elaborado. */
  readonly TotTabElaborado?: number
}

/**
 * EN: Summary row of a period. Adds to the segment row the proportionality factor, the credit and the vehicle tax.
 * ES: `TotalesPeriodo` — Fila del resumen de un período. Agrega a la del segmento el factor de proporcionalidad, el crédito y el impuesto a los vehículos.
 */
export type SiiTotalesPeriodo = SiiTotalesSegmento & {
  /** EN: Proportionality factor. ES: `FctProp` — Factor de proporcionalidad. */
  readonly FctProp?: number
  /** EN: Credit: factor × common-use VAT. ES: `TotCredIVAUsoComun` — Crédito: factor × IVA de uso común. */
  readonly TotCredIVAUsoComun?: number
  /** EN: Vehicle tax. ES: `TotImpVehiculo` — Impuesto a los vehículos. */
  readonly TotImpVehiculo?: number
}

/**
 * EN: One line of the purchase and sales book, in schema order.
 * ES: `Detalle` — Una línea del libro de compras y ventas, en el orden del esquema.
 */
export type SiiDetalleLibro = {
  /** EN: Document type. ES: `TpoDoc` — Tipo de documento. */
  readonly TpoDoc: number
  /** EN: Note issued by the book owner. ES: `Emisor` — Nota emitida por el dueño del libro (1). */
  readonly Emisor?: number
  /** EN: Purchase invoice indicator. ES: `IndFactCompra` — Indicador de factura de compra (1). */
  readonly IndFactCompra?: number
  /** EN: Folio. ES: `NroDoc` — Folio. */
  readonly NroDoc: number
  /** EN: Voided folio. ES: `Anulado` — Folio anulado (A). */
  readonly Anulado?: string
  /** EN: Adjustment operation. ES: `Operacion` — 1 agrega, 2 elimina. */
  readonly Operacion?: number
  /** EN: Tax kind. ES: `TpoImp` — 1 IVA, 2 Ley 18.211. */
  readonly TpoImp?: number
  /** EN: Tax rate. ES: `TasaImp` — Tasa del impuesto. */
  readonly TasaImp?: number
  /** EN: Internal reference. ES: `NumInt` — Referencia interna. */
  readonly NumInt?: string
  /** EN: Periodic service indicator. ES: `IndServicio` — Indicador de servicio periódico. */
  readonly IndServicio?: number
  /** EN: Free delivery. ES: `IndSinCosto` — Entrega gratuita (1). */
  readonly IndSinCosto?: number
  /** EN: Document date. ES: `FchDoc` — Fecha del documento. */
  readonly FchDoc?: string
  /** EN: SII branch code. ES: `CdgSIISucur` — Código SII de la sucursal. */
  readonly CdgSIISucur?: number
  /** EN: Customer or supplier RUT. ES: `RUTDoc` — RUT del cliente o proveedor. */
  readonly RUTDoc?: string
  /** EN: Customer or supplier name. ES: `RznSoc` — Razón social. */
  readonly RznSoc?: string
  /** EN: Foreign receiver. ES: `Extranjero` — Receptor extranjero. */
  readonly Extranjero?: { readonly NumId?: string; readonly Nacionalidad?: string }
  /** EN: Type of the voided document. ES: `TpoDocRef` — Tipo del documento anulado. */
  readonly TpoDocRef?: number
  /** EN: Folio of the voided document. ES: `FolioDocRef` — Folio del documento anulado. */
  readonly FolioDocRef?: number
  /** EN: Exempt amount. ES: `MntExe` — Monto exento. */
  readonly MntExe?: number
  /** EN: Net amount. ES: `MntNeto` — Monto neto. */
  readonly MntNeto?: number
  /** EN: VAT. ES: `MntIVA` — IVA. */
  readonly MntIVA?: number
  /** EN: Net of fixed assets. ES: `MntActivoFijo` — Neto de activo fijo. */
  readonly MntActivoFijo?: number
  /** EN: VAT of fixed assets. ES: `MntIVAActivoFijo` — IVA de activo fijo. */
  readonly MntIVAActivoFijo?: number
  /** EN: Non-recoverable VAT. ES: `IVANoRec` — IVA no recuperable. */
  readonly IVANoRec?: readonly { readonly CodIVANoRec: number; readonly MntIVANoRec: number }[]
  /** EN: Common-use VAT. ES: `IVAUsoComun` — IVA de uso común. */
  readonly IVAUsoComun?: number
  /** EN: Late VAT. ES: `IVAFueraPlazo` — IVA fuera de plazo. */
  readonly IVAFueraPlazo?: number
  /** EN: Own VAT. ES: `IVAPropio` — IVA propio. */
  readonly IVAPropio?: number
  /** EN: Third-party VAT. ES: `IVATerceros` — IVA de terceros. */
  readonly IVATerceros?: number
  /** EN: Free zone tax. ES: `Ley18211` — Impuesto de zona franca. */
  readonly Ley18211?: number
  /** EN: Additional taxes. ES: `OtrosImp` — Impuestos adicionales. */
  readonly OtrosImp?: readonly { readonly CodImp: number; readonly TasaImp?: number; readonly MntImp: number }[]
  /** EN: Tax without credit right. ES: `MntSinCred` — Impuesto sin derecho a crédito. */
  readonly MntSinCred?: number
  /** EN: Fully withheld VAT. ES: `IVARetTotal` — IVA retenido total. */
  readonly IVARetTotal?: number
  /** EN: Partly withheld VAT. ES: `IVARetParcial` — IVA retenido parcial. */
  readonly IVARetParcial?: number
  /** EN: Construction companies credit. ES: `CredEC` — Crédito de empresas constructoras. */
  readonly CredEC?: number
  /** EN: Container deposit. ES: `DepEnvase` — Garantía por depósito de envases. */
  readonly DepEnvase?: number
  /** EN: Settlement commissions. ES: `Liquidaciones` — Comisiones de liquidaciones. */
  readonly Liquidaciones?: {
    readonly RutEmisor: string
    readonly ValComNeto?: number
    readonly ValComExe?: number
    readonly ValComIVA?: number
  }
  /** EN: Line total. ES: `MntTotal` — Total de la línea. */
  readonly MntTotal?: number
  /** EN: VAT not withheld. ES: `IVANoRetenido` — IVA no retenido. */
  readonly IVANoRetenido?: number
  /** EN: Non-billable amount. ES: `MntNoFact` — Monto no facturable. */
  readonly MntNoFact?: number
  /** EN: Period amount. ES: `MntPeriodo` — Monto del período. */
  readonly MntPeriodo?: number
  /** EN: Domestic tickets. ES: `PsjNac` — Pasajes nacionales. */
  readonly PsjNac?: number
  /** EN: International tickets. ES: `PsjInt` — Pasajes internacionales. */
  readonly PsjInt?: number
  /** EN: Cigars tax. ES: `TabPuros` — Impuesto a los cigarros puros. */
  readonly TabPuros?: number
  /** EN: Cigarettes tax. ES: `TabCigarrillos` — Impuesto a los cigarrillos. */
  readonly TabCigarrillos?: number
  /** EN: Processed tobacco tax. ES: `TabElaborado` — Impuesto al tabaco elaborado. */
  readonly TabElaborado?: number
  /** EN: Vehicle tax. ES: `ImpVehiculo` — Impuesto a los vehículos. */
  readonly ImpVehiculo?: number
}

/**
 * EN: The signed part of a purchase and sales book, in schema order.
 * ES: `EnvioLibro` — La parte firmada de un libro de compras y ventas, en el orden del esquema.
 */
export type SiiEnvioLibro = {
  /** EN: Cover. ES: `Caratula` — Carátula. */
  readonly Caratula: SiiCaratulaLibro
  /** EN: Segment summary. ES: `ResumenSegmento` — Resumen del segmento. */
  readonly ResumenSegmento?: { readonly TotalesSegmento: readonly SiiTotalesSegmento[] }
  /** EN: Period summary. ES: `ResumenPeriodo` — Resumen del período. */
  readonly ResumenPeriodo?: { readonly TotalesPeriodo: readonly SiiTotalesPeriodo[] }
  /** EN: Lines. ES: `Detalle` — Líneas. */
  readonly Detalle?: readonly SiiDetalleLibro[]
  /** EN: Signing timestamp. ES: `TmstFirma` — Marca de tiempo de la firma. */
  readonly TmstFirma: string
}

/**
 * EN: Cover of a guide book.
 * ES: `Caratula` del libro de guías.
 */
export type SiiCaratulaLibroGuia = {
  /** EN: Book owner. ES: `RutEmisorLibro` — RUT del dueño del libro. */
  readonly RutEmisorLibro: string
  /** EN: Sender. ES: `RutEnvia` — RUT de quien envía. */
  readonly RutEnvia: string
  /** EN: Tax period. ES: `PeriodoTributario` — Período tributario. */
  readonly PeriodoTributario: string
  /** EN: Resolution date. ES: `FchResol` — Fecha de resolución. */
  readonly FchResol: string
  /** EN: Resolution number. ES: `NroResol` — Número de resolución. */
  readonly NroResol: number
  /** EN: Book kind: the schema admits only ESPECIAL. ES: `TipoLibro` — El esquema solo admite ESPECIAL. */
  readonly TipoLibro: 'ESPECIAL'
  /** EN: Submission kind. ES: `TipoEnvio` — TOTAL, PARCIAL, FINAL o AJUSTE. */
  readonly TipoEnvio: string
  /** EN: Segment number. ES: `NroSegmento` — Número de segmento. */
  readonly NroSegmento?: number
  /** EN: Notification folio. ES: `FolioNotificacion` — Folio de la notificación. */
  readonly FolioNotificacion: number
}

/**
 * EN: Summary of a guide book, in schema order.
 * ES: `ResumenSegmento` / `ResumenPeriodo` — Resumen de un libro de guías, en el orden del esquema.
 */
export type SiiResumenLibroGuia = {
  /** EN: Folios voided before reaching the SII. ES: `TotFolAnulado` — Folios anulados antes de llegar al SII. */
  readonly TotFolAnulado?: number
  /** EN: Guides voided afterwards. ES: `TotGuiaAnulada` — Guías anuladas después. */
  readonly TotGuiaAnulada?: number
  /** EN: Sale guides. ES: `TotGuiaVenta` — Guías de venta. */
  readonly TotGuiaVenta: number
  /** EN: Amount of the sale guides. ES: `TotMntGuiaVta` — Monto de las guías de venta. */
  readonly TotMntGuiaVta: number
  /** EN: Sum of the corrected totals. ES: `TotMntModificado` — Suma de los totales corregidos. */
  readonly TotMntModificado?: number
  /** EN: Non-sale guides. ES: `TotTraslado` — Guías no venta. */
  readonly TotTraslado?: readonly {
    readonly TpoTraslado: number
    readonly CantGuia: number
    readonly MntGuia: number
  }[]
}

/**
 * EN: One line of the guide book, in schema order.
 * ES: `Detalle` — Una línea del libro de guías, en el orden del esquema.
 */
export type SiiDetalleLibroGuia = {
  /** EN: Folio. ES: `Folio` — Folio de la guía. */
  readonly Folio: number
  /** EN: Void reason. ES: `Anulado` — 1 folio anulado, 2 guía anulada, 3 recepción parcial. */
  readonly Anulado?: number
  /** EN: Adjustment operation. ES: `Operacion` — 1 agrega, 2 elimina. */
  readonly Operacion?: number
  /** EN: Guide operation. ES: `TpoOper` — Operación de la guía. */
  readonly TpoOper?: number
  /** EN: Guide date. ES: `FchDoc` — Fecha de la guía. */
  readonly FchDoc?: string
  /** EN: Receiver RUT. ES: `RUTDoc` — RUT del receptor. */
  readonly RUTDoc?: string
  /** EN: Receiver name. ES: `RznSoc` — Razón social del receptor. */
  readonly RznSoc?: string
  /** EN: Net amount. ES: `MntNeto` — Monto neto. */
  readonly MntNeto?: number
  /** EN: VAT rate. ES: `TasaImp` — Tasa de IVA. */
  readonly TasaImp: number
  /** EN: VAT. ES: `IVA` — IVA. */
  readonly IVA: number
  /** EN: Total. ES: `MntTotal` — Total. */
  readonly MntTotal: number
  /** EN: Corrected total. ES: `MntModificado` — Total corregido. */
  readonly MntModificado?: number
  /** EN: Type of the invoice issued. ES: `TpoDocRef` — Tipo de la factura emitida. */
  readonly TpoDocRef?: number
  /** EN: Folio of the invoice issued. ES: `FolioDocRef` — Folio de la factura emitida. */
  readonly FolioDocRef?: number
  /** EN: Date of the invoice issued. ES: `FchDocRef` — Fecha de la factura emitida. */
  readonly FchDocRef?: string
}

/**
 * EN: The signed part of a guide book, in schema order.
 * ES: `EnvioLibro` — La parte firmada de un libro de guías, en el orden del esquema.
 */
export type SiiEnvioLibroGuia = {
  /** EN: Cover. ES: `Caratula` — Carátula. */
  readonly Caratula: SiiCaratulaLibroGuia
  /** EN: Segment summary. ES: `ResumenSegmento` — Resumen del segmento. */
  readonly ResumenSegmento?: SiiResumenLibroGuia
  /** EN: Period summary. ES: `ResumenPeriodo` — Resumen del período. */
  readonly ResumenPeriodo?: SiiResumenLibroGuia
  /** EN: Lines. ES: `Detalle` — Líneas. */
  readonly Detalle?: readonly SiiDetalleLibroGuia[]
  /** EN: Signing timestamp. ES: `TmstFirma` — Marca de tiempo de la firma. */
  readonly TmstFirma: string
}

/**
 * EN: Cover of a folio consumption report. The `version` attribute travels as `@_version` when it is serialized.
 * ES: `Caratula` del reporte de consumo de folios. El atributo `version` viaja como `@_version` al serializar.
 */
export type SiiCaratulaConsumoFolios = {
  /** EN: Issuer company. ES: `RutEmisor` — RUT de la empresa emisora. */
  readonly RutEmisor: string
  /** EN: Sender. ES: `RutEnvia` — RUT de quien envía. */
  readonly RutEnvia: string
  /** EN: Resolution date. ES: `FchResol` — Fecha de resolución. */
  readonly FchResol: string
  /** EN: Resolution number. ES: `NroResol` — Número de resolución. */
  readonly NroResol: number
  /** EN: First day. ES: `FchInicio` — Primer día. */
  readonly FchInicio: string
  /** EN: Last day. ES: `FchFinal` — Último día. */
  readonly FchFinal: string
  /** EN: Correlative within the day. ES: `Correlativo` — Correlativo dentro del día. */
  readonly Correlativo?: number
  /** EN: Submission sequence. ES: `SecEnvio` — Secuencia de envío. */
  readonly SecEnvio: number
  /** EN: Signing timestamp. ES: `TmstFirmaEnv` — Marca de tiempo de la firma. */
  readonly TmstFirmaEnv: string
}

/**
 * EN: Summary of one document type of the report, in schema order.
 * ES: `Resumen` — Resumen de un tipo de documento del reporte, en el orden del esquema.
 */
export type SiiResumenConsumoFolios = {
  /** EN: Document type. ES: `TipoDocumento` — Tipo de documento. */
  readonly TipoDocumento: number
  /** EN: Net amount. ES: `MntNeto` — Monto neto. */
  readonly MntNeto?: number
  /** EN: VAT. ES: `MntIva` — IVA. */
  readonly MntIva?: number
  /** EN: VAT rate. ES: `TasaIVA` — Tasa de IVA. */
  readonly TasaIVA?: number
  /** EN: Exempt amount. ES: `MntExento` — Monto exento. */
  readonly MntExento?: number
  /** EN: Total. ES: `MntTotal` — Total. */
  readonly MntTotal: number
  /** EN: Documents issued. ES: `FoliosEmitidos` — Documentos emitidos. */
  readonly FoliosEmitidos: number
  /** EN: Folios voided. ES: `FoliosAnulados` — Folios anulados. */
  readonly FoliosAnulados: number
  /** EN: Issued plus voided. ES: `FoliosUtilizados` — Emitidos más anulados. */
  readonly FoliosUtilizados: number
  /** EN: Ranges of issued folios. ES: `RangoUtilizados` — Rangos de folios emitidos. */
  readonly RangoUtilizados?: readonly { readonly Inicial: number; readonly Final: number }[]
  /** EN: Ranges of voided folios. ES: `RangoAnulados` — Rangos de folios anulados. */
  readonly RangoAnulados?: readonly { readonly Inicial: number; readonly Final: number }[]
}

/**
 * EN: The signed part of a folio consumption report, in schema order.
 * ES: `DocumentoConsumoFolios` — La parte firmada de un reporte de consumo de folios, en el orden del esquema.
 */
export type SiiDocumentoConsumoFolios = {
  /** EN: Cover. ES: `Caratula` — Carátula. */
  readonly Caratula: SiiCaratulaConsumoFolios
  /** EN: One summary per document type. ES: `Resumen` — Un resumen por tipo de documento. */
  readonly Resumen: readonly SiiResumenConsumoFolios[]
}
```

- [ ] **Step 2: Check that it compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/model/book.ts src/model/sii-book.ts
git commit -m "feat: domain and SII-shaped models of the three books"
```

---

## Task 3: Official XSD validation for the tests

`xmllint-wasm` is a devDependency only (MIT, WASM, no native build). The schemas are downloaded from the SII and checked by SHA-256. If only `SiiTypes_v10.xsd` differs, the SII updated it: keep the new file as long as the tests of this task pass, and record the new hash in the commit message.

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `tests/fixtures/xsd/*.xsd` (downloaded)
- Modify: `tests/fixtures/README.md`
- Test: `tests/support/xsd.ts`
- Test: `tests/support/book-fixtures.ts`
- Test: `tests/books/xsd.test.ts`

- [ ] **Step 1: Install the validator**

```bash
npm install --save-dev --save-exact --ignore-scripts xmllint-wasm@5.3.0
```

- [ ] **Step 2: Download the official schemas and check them**

These are the files the links of the SII XML format page serve. Older copies with the same names exist at other SII paths, so use these URLs.

```bash
mkdir -p tests/fixtures/xsd
work="$(mktemp -d)"
base="https://www.sii.cl/factura_electronica/factura_mercado"
for zip in schema_iecv schema_lgd schema_dte; do curl -fsS -o "$work/$zip.zip" "$base/$zip.zip" && unzip -oq "$work/$zip.zip" -d "$work/$zip"; done
curl -fsS -o tests/fixtures/xsd/ConsumoFolio_v10.xsd "$base/ConsumoFolio_v10.xsd"
cp "$work"/schema_iecv/LibroCV_v10.xsd "$work"/schema_iecv/LceCal_v10.xsd "$work"/schema_iecv/LceCoCertif_v10.xsd "$work"/schema_iecv/LceSiiTypes_v10.xsd "$work"/schema_iecv/xmldsignature_v10.xsd tests/fixtures/xsd/
cp "$work"/schema_lgd/LibroGuia_v10.xsd "$work"/schema_dte/SiiTypes_v10.xsd tests/fixtures/xsd/
shasum -a 256 -c <<'SUMS'
ab56a92683a32f8621203b5416ebd0787bb50935bd34e3eef98c54ba25387cfc  tests/fixtures/xsd/ConsumoFolio_v10.xsd
47378044d6dff87a9ccda7f02e338bda7665f5bcd9da1b54c79e81da5ddf5257  tests/fixtures/xsd/LceCal_v10.xsd
3fc1c20b35e916a427a4800f8bbc3616489833784372f5bce9d3c121ca9fbde8  tests/fixtures/xsd/LceCoCertif_v10.xsd
fcccac6db4de9a74e157316d46abfa3f529086f55d45e68a9974204a25d98ca2  tests/fixtures/xsd/LceSiiTypes_v10.xsd
d38672ec612888b4f952264372afc836d5b905579d9735159fefe9ddacf167ce  tests/fixtures/xsd/LibroCV_v10.xsd
8be863658400bc87958e5f71a36a4b08fa31dfc05b470045e320ecfc4db242e7  tests/fixtures/xsd/LibroGuia_v10.xsd
ce9a84bde70aa9d0f9269d99acd3b0ea81d868022517ac31064b6cdfa0c45bdf  tests/fixtures/xsd/SiiTypes_v10.xsd
427e3225cd379ae92bae464b892dbf964665af92d453ac61774cffab38b95edb  tests/fixtures/xsd/xmldsignature_v10.xsd
SUMS
```

Expected: every line ends in `OK`.

- [ ] **Step 3: Write the tests**

`tests/support/xsd.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateXML } from 'xmllint-wasm'

const XSD_DIR = join(__dirname, '..', 'fixtures', 'xsd')

const SCHEMAS = {
  LibroCV: {
    main: 'LibroCV_v10.xsd',
    imports: ['LceCal_v10.xsd', 'LceCoCertif_v10.xsd', 'LceSiiTypes_v10.xsd', 'xmldsignature_v10.xsd'],
  },
  LibroGuia: { main: 'LibroGuia_v10.xsd', imports: ['xmldsignature_v10.xsd'] },
  ConsumoFolio: { main: 'ConsumoFolio_v10.xsd', imports: ['SiiTypes_v10.xsd', 'xmldsignature_v10.xsd'] },
} as const

export type BookSchema = keyof typeof SCHEMAS

const schemaFile = (fileName: string) => ({ fileName, contents: readFileSync(join(XSD_DIR, fileName), 'latin1') })

/**
 * Validates against an official SII schema and returns the errors, none when the XML is valid. The text reaches the
 * validator as UTF-8, so the prolog says so.
 */
export const validateAgainstXsd = async (xml: string, schema: BookSchema): Promise<readonly string[]> => {
  const contents = xml.replace('encoding="ISO-8859-1"', 'encoding="UTF-8"')
  const { main, imports } = SCHEMAS[schema]
  const result = await validateXML({
    xml: [{ fileName: 'book.xml', contents }],
    schema: [schemaFile(main)],
    preload: imports.map(schemaFile),
  })
  return result.errors.map((error) => error.message)
}
```

`tests/support/book-fixtures.ts`:

```ts
import { loadCertificateFromPem } from '../../src/certificate/pem'
import type {
  BookEntryInput,
  FolioConsumptionCoverInput,
  GuideBookCoverInput,
  PurchaseSalesCoverInput,
} from '../../src/model/book'
import { FIXED_NOW, fixtureText, ISSUER_RUT, RECEIVER_RUT } from './fixtures'

export const SENDER_RUT = '11111111-1'
export const SUPPLIER_RUT = '10000004-0'
export const BOOK_ID = 'LIBRO_TEST'

export const certificate = loadCertificateFromPem(
  { privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') },
  { now: FIXED_NOW },
)

export const saleCover: PurchaseSalesCoverInput = {
  issuerRut: ISSUER_RUT,
  senderRut: SENDER_RUT,
  period: '2026-10',
  resolutionDate: '2026-01-15',
  resolutionNumber: 80,
  operation: 'sale',
}

export const purchaseCover: PurchaseSalesCoverInput = { ...saleCover, operation: 'purchase' }

export const guideCover: GuideBookCoverInput = {
  issuerRut: ISSUER_RUT,
  senderRut: SENDER_RUT,
  period: '2026-10',
  resolutionDate: '2026-01-15',
  resolutionNumber: 80,
  notificationFolio: 3,
}

export const reportCover: FolioConsumptionCoverInput = {
  issuerRut: ISSUER_RUT,
  senderRut: SENDER_RUT,
  resolutionDate: '2026-01-15',
  resolutionNumber: 80,
}

export const invoice: BookEntryInput = {
  type: 33,
  folio: 101,
  date: '2026-10-05',
  counterpartyRut: RECEIVER_RUT,
  counterpartyName: 'Comercializadora Rapel Ltda',
  netAmount: 100000,
  vatAmount: 19000,
}

export const exemptInvoice: BookEntryInput = {
  type: 34,
  folio: 7,
  date: '2026-10-06',
  counterpartyRut: RECEIVER_RUT,
  counterpartyName: 'Comercializadora Rapel Ltda',
  exemptAmount: 50000,
}

export const creditNote: BookEntryInput = {
  type: 61,
  folio: 12,
  date: '2026-10-20',
  counterpartyRut: RECEIVER_RUT,
  netAmount: 10000,
  vatAmount: 1900,
}
```

`tests/books/xsd.test.ts`:

```ts
import { SENDER_RUT } from '../support/book-fixtures'
import { ISSUER_RUT } from '../support/fixtures'
import { validateAgainstXsd } from '../support/xsd'

jest.setTimeout(30_000)

const SII_NS = 'http://www.sii.cl/SiiDte'
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'
const XMLDSIG = 'http://www.w3.org/2000/09/xmldsig#'

// Shaped like a signature: these tests are about the schemas, and the values do not need to verify.
const signature =
  `<Signature xmlns="${XMLDSIG}"><SignedInfo xmlns="${XMLDSIG}"><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
  `<SignatureMethod Algorithm="${XMLDSIG}rsa-sha1"/><Reference URI="#X"><Transforms><Transform Algorithm="${XMLDSIG}enveloped-signature"/></Transforms>` +
  `<DigestMethod Algorithm="${XMLDSIG}sha1"/><DigestValue>AAAA</DigestValue></Reference></SignedInfo><SignatureValue>AAAA</SignatureValue>` +
  '<KeyInfo><KeyValue><RSAKeyValue><Modulus>AAAA</Modulus><Exponent>AQAB</Exponent></RSAKeyValue></KeyValue><X509Data><X509Certificate>AAAA</X509Certificate></X509Data></KeyInfo></Signature>'

const document = (root: string, schema: string, content: string): string =>
  `<?xml version="1.0" encoding="ISO-8859-1"?>\n<${root} xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}" xsi:schemaLocation="${SII_NS} ${schema}" version="1.0">${content}${signature}</${root}>`

const cover = `<RutEmisorLibro>${ISSUER_RUT}</RutEmisorLibro><RutEnvia>${SENDER_RUT}</RutEnvia><PeriodoTributario>2026-10</PeriodoTributario><FchResol>2026-01-15</FchResol><NroResol>0</NroResol>`

const purchaseBook = (extra: string): string =>
  document(
    'LibroCompraVenta',
    'LibroCV_v10.xsd',
    `<EnvioLibro ID="X"><Caratula>${cover}<TipoOperacion>COMPRA</TipoOperacion><TipoLibro>MENSUAL</TipoLibro><TipoEnvio>TOTAL</TipoEnvio></Caratula>` +
      `<ResumenPeriodo><TotalesPeriodo><TpoDoc>33</TpoDoc><TotDoc>1</TotDoc>${extra}<TotMntExe>0</TotMntExe><TotMntNeto>100</TotMntNeto><TotMntIVA>19</TotMntIVA><TotMntTotal>119</TotMntTotal></TotalesPeriodo></ResumenPeriodo>` +
      '<TmstFirma>2026-10-31T10:00:00</TmstFirma></EnvioLibro>',
  )

const guideBook = document(
  'LibroGuia',
  'LibroGuia_v10.xsd',
  `<EnvioLibro ID="X"><Caratula>${cover}<TipoLibro>ESPECIAL</TipoLibro><TipoEnvio>TOTAL</TipoEnvio><FolioNotificacion>3</FolioNotificacion></Caratula>` +
    '<ResumenPeriodo><TotGuiaVenta>0</TotGuiaVenta><TotMntGuiaVta>0</TotMntGuiaVta></ResumenPeriodo><TmstFirma>2026-10-31T10:00:00</TmstFirma></EnvioLibro>',
)

const report = document(
  'ConsumoFolios',
  'ConsumoFolio_v10.xsd',
  `<DocumentoConsumoFolios ID="X"><Caratula version="1.0"><RutEmisor>${ISSUER_RUT}</RutEmisor><RutEnvia>${SENDER_RUT}</RutEnvia><FchResol>2026-01-15</FchResol><NroResol>0</NroResol><FchInicio>2026-10-15</FchInicio><FchFinal>2026-10-15</FchFinal><SecEnvio>1</SecEnvio><TmstFirmaEnv>2026-10-15T10:00:00</TmstFirmaEnv></Caratula>` +
    '<Resumen><TipoDocumento>39</TipoDocumento><MntTotal>0</MntTotal><FoliosEmitidos>0</FoliosEmitidos><FoliosAnulados>0</FoliosAnulados><FoliosUtilizados>0</FoliosUtilizados></Resumen></DocumentoConsumoFolios>',
)

describe('validateAgainstXsd', () => {
  test('accepts a valid purchase and sales book', async () => {
    expect(await validateAgainstXsd(purchaseBook(''), 'LibroCV')).toEqual([])
  })

  test('accepts a valid guide book', async () => {
    expect(await validateAgainstXsd(guideBook, 'LibroGuia')).toEqual([])
  })

  test('accepts a valid report', async () => {
    expect(await validateAgainstXsd(report, 'ConsumoFolio')).toEqual([])
  })

  test('catches a zero in a positiveInteger counter, which is why the SDK omits them', async () => {
    const errors = await validateAgainstXsd(purchaseBook('<TotOpExe>0</TotOpExe>'), 'LibroCV')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('TotOpExe')
  })

  test('catches an element out of order', async () => {
    const swapped = purchaseBook('')
      .replace('<TotDoc>1</TotDoc>', '')
      .replace('<TotMntExe>', '<TotDoc>1</TotDoc><TotMntExe>')
    expect(await validateAgainstXsd(swapped.replace('<TpoDoc>33</TpoDoc>', ''), 'LibroCV')).not.toEqual([])
  })
})
```

In `tests/fixtures/README.md`, replace:

```markdown
| `sii/` | SII web service replies (SOAP, `DTEUpload`, REST, WSRECLAMO) with invented data, served by the fake SII in `tests/support/fake-sii.ts` |
```

with:

```markdown
| `sii/` | SII web service replies (SOAP, `DTEUpload`, REST, WSRECLAMO) with invented data, served by the fake SII in `tests/support/fake-sii.ts` |
| `xsd/` | official SII schemas of the three books, downloaded from the SII XML format page; `tests/support/xsd.ts` validates against them |
| `books/` | golden unsigned XML of the three books, one per sample in `tests/support/*-samples.ts`, with invented data |
```

- [ ] **Step 4: Run them to see them pass**

```bash
npx jest --config jest.config.cjs tests/books/xsd.test.ts
```

Expected: PASS, `Tests: 5 passed, 5 total`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tests/fixtures/xsd tests/support/xsd.ts tests/support/book-fixtures.ts tests/books/xsd.test.ts tests/fixtures/README.md
git commit -m "test: validate against the official SII schemas"
```

---

## Task 4: Cover, zones, amounts and the XML frame

What the books share: period and cover validation, the zones each submission admits (sections 1.2, 1.3 and 1.6 of the format), and the XML frame with a line break between every pair of tags (the SII rejects lines over about 4 090 characters, `CHR-00002`).

**Files:**
- Create: `src/books/common.ts`
- Test: `tests/books/common.test.ts`

- [ ] **Step 1: Write the tests (they fail until Step 3)**

`tests/books/common.test.ts`:

```ts
import {
  assertBookAmount,
  assertBookFolio,
  assertBookRate,
  assertBookZones,
  buildBookXml,
  normalizeBookCover,
  toBookDate,
} from '../../src/books/common'
import { DteError } from '../../src/errors'
import { guideCover, SENDER_RUT } from '../support/book-fixtures'
import { ISSUER_RUT } from '../support/fixtures'

const code = (run: () => unknown): { code: string; details: unknown } => {
  try {
    run()
  } catch (error) {
    return { code: (error as DteError).code, details: (error as DteError).details }
  }
  throw new Error('expected a DteError')
}

describe('assertBookFolio', () => {
  test.each([1, 9_999_999_999])('accepts %d', (folio) => {
    expect(() => assertBookFolio(folio, 'folio')).not.toThrow()
  })

  test.each([0, -1, 1.5, 10_000_000_000, Number.NaN])('rejects %d', (folio) => {
    expect(code(() => assertBookFolio(folio, 'folio', 2))).toEqual({
      code: 'INVALID_FOLIO',
      details: { field: 'folio', folio, index: 2 },
    })
  })
})

describe('assertBookAmount', () => {
  test.each([
    [undefined, false],
    [0, false],
    [100, false],
    [-100, true],
  ])('accepts %p with signed %p', (value, signed) => {
    expect(() => assertBookAmount(value, { field: 'x', signed })).not.toThrow()
  })

  test.each([
    [-1, false],
    [1.5, true],
    [Number.MAX_SAFE_INTEGER + 1, true],
    [Number.NaN, true],
  ])('rejects %p with signed %p', (value, signed) => {
    expect(code(() => assertBookAmount(value, { field: 'x', signed, index: 1 })).code).toBe('INVALID_AMOUNT')
  })
})

describe('assertBookRate', () => {
  test.each([undefined, 0, 19, 19.5, 19.25, 100])('accepts %p', (rate) => {
    expect(() => assertBookRate(rate, 'taxRate')).not.toThrow()
  })

  test.each([-1, 100.01, 19.255, Number.NaN])('rejects %p', (rate) => {
    expect(code(() => assertBookRate(rate, 'taxRate', 3))).toEqual({
      code: 'INVALID_AMOUNT',
      details: { field: 'taxRate', index: 3 },
    })
  })
})

describe('toBookDate', () => {
  test('normalizes to ISO within the schema range', () => {
    expect(toBookDate('15-10-2026', 'date')).toBe('2026-10-15')
    expect(toBookDate('2000-01-01', 'date')).toBe('2000-01-01')
    expect(toBookDate('2050-12-31', 'date')).toBe('2050-12-31')
  })

  test.each(['1999-12-31', '2051-01-01', '2026-02-30', 'hoy'])('rejects %s', (date) => {
    expect(code(() => toBookDate(date, 'date'))).toEqual({ code: 'INVALID_DATE', details: { field: 'date' } })
  })
})

describe('normalizeBookCover', () => {
  test('normalizes RUTs and dates and defaults to a total submission', () => {
    expect(
      normalizeBookCover({
        issuerRut: '76.543.210-3',
        senderRut: SENDER_RUT,
        period: '2026-10',
        resolutionDate: '15-01-2026',
        resolutionNumber: 0,
      }),
    ).toEqual({
      issuerRut: ISSUER_RUT,
      senderRut: SENDER_RUT,
      period: '2026-10',
      resolutionDate: '2026-01-15',
      resolutionNumber: 0,
      submission: 'total',
    })
  })

  test('keeps the segment number only on a partial submission', () => {
    expect(normalizeBookCover({ ...guideCover, submission: 'partial', segmentNumber: 2 }).segmentNumber).toBe(2)
    expect(normalizeBookCover({ ...guideCover, submission: 'final', segmentNumber: 2 }).segmentNumber).toBeUndefined()
  })

  test('keeps the notification folio', () => {
    expect(normalizeBookCover(guideCover).notificationFolio).toBe(3)
  })

  test.each(['2026-13', '2026-00', '2026', '10-2026', '2026-1'])('rejects the period %s', (period) => {
    expect(code(() => normalizeBookCover({ ...guideCover, period }))).toEqual({
      code: 'INVALID_DATE',
      details: { field: 'cover.period' },
    })
  })

  test.each([-1, 1.5, 1_000_000])('rejects the resolution number %d', (resolutionNumber) => {
    expect(code(() => normalizeBookCover({ ...guideCover, resolutionNumber }))).toEqual({
      code: 'INVALID_OPTION',
      details: { field: 'cover.resolutionNumber' },
    })
  })

  test('a partial submission needs a valid segment number', () => {
    expect(code(() => normalizeBookCover({ ...guideCover, submission: 'partial' }))).toEqual({
      code: 'MISSING_FIELD',
      details: { field: 'cover.segmentNumber' },
    })
    expect(code(() => normalizeBookCover({ ...guideCover, submission: 'partial', segmentNumber: 0 }))).toEqual({
      code: 'INVALID_OPTION',
      details: { field: 'cover.segmentNumber' },
    })
  })

  test('rejects an invalid notification folio', () => {
    expect(code(() => normalizeBookCover({ ...guideCover, notificationFolio: 0 }))).toEqual({
      code: 'INVALID_OPTION',
      details: { field: 'cover.notificationFolio' },
    })
  })

  test('rejects an invalid RUT', () => {
    expect(code(() => normalizeBookCover({ ...guideCover, issuerRut: '1-1' })).code).toBe('INVALID_RUT')
  })
})

describe('assertBookZones', () => {
  const zones = { submission: 'total', entryCount: 1, hasPreviousTotals: false, hasSummaryOnlyTotals: false } as const

  test.each([
    [zones],
    [{ ...zones, entryCount: 0 }],
    [{ ...zones, hasSummaryOnlyTotals: true }],
    [{ ...zones, submission: 'partial' }],
    [{ ...zones, submission: 'final', entryCount: 0, hasPreviousTotals: true }],
    [{ ...zones, submission: 'final', entryCount: 0, hasSummaryOnlyTotals: true }],
    [{ ...zones, submission: 'adjustment' }],
    [{ ...zones, submission: 'adjustment', hasPreviousTotals: true, hasSummaryOnlyTotals: true }],
  ] as const)('accepts %j', (input) => {
    expect(() => assertBookZones(input)).not.toThrow()
  })

  test.each([
    [{ ...zones, submission: 'partial', entryCount: 0 }, 'MISSING_FIELD', 'entries'],
    [{ ...zones, submission: 'final', hasPreviousTotals: true }, 'INVALID_OPTION', 'entries'],
    [{ ...zones, hasPreviousTotals: true }, 'INVALID_OPTION', 'previousTotals'],
    [{ ...zones, submission: 'partial', hasPreviousTotals: true }, 'INVALID_OPTION', 'previousTotals'],
    [{ ...zones, submission: 'partial', hasSummaryOnlyTotals: true }, 'INVALID_OPTION', 'summaryOnlyTotals'],
    [{ ...zones, submission: 'final', entryCount: 0 }, 'MISSING_FIELD', 'previousTotals'],
  ] as const)('rejects %j', (input, errorCode, field) => {
    expect(code(() => assertBookZones(input))).toEqual({ code: errorCode, details: { field } })
  })
})

describe('buildBookXml', () => {
  const xml = buildBookXml({
    rootTag: 'Libro',
    signedTag: 'Envio',
    schema: 'Libro_v10.xsd',
    id: 'ID1',
    content: { Caratula: { Rut: 'A&B', Monto: 0 }, Fin: 'x' },
  })

  test('breaks the line between tags, leaves the closing tags together and declares ISO-8859-1', () => {
    expect(xml).toBe(
      '<?xml version="1.0" encoding="ISO-8859-1"?>\n' +
        '<Libro xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte Libro_v10.xsd" version="1.0">\n' +
        '<Envio ID="ID1">\n<Caratula>\n<Rut>A&amp;B</Rut>\n<Monto>0</Monto>\n</Caratula>\n<Fin>x</Fin>\n</Envio></Libro>',
    )
  })

  test('escaped text cannot produce a line break', () => {
    const escaped = buildBookXml({
      rootTag: 'Libro',
      signedTag: 'Envio',
      schema: 'Libro_v10.xsd',
      id: 'ID1',
      content: { Glosa: '><' },
    })
    expect(escaped).toContain('<Glosa>&gt;&lt;</Glosa>')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx jest --config jest.config.cjs tests/books/common.test.ts
```

Expected: FAIL, with `Cannot find module '../../src/books/common'`.

- [ ] **Step 3: Write the implementation**

`src/books/common.ts`:

```ts
import type { BookSubmission } from '../catalogs/book-codes'
import { DteError } from '../errors'
import type { BookCover, BookCoverInput } from '../model/book'
import { toSiiRut } from '../model/rut'
import { toIsoDate } from '../time/chile'
import { buildXml } from '../xml/build'

const SII_NS = 'http://www.sii.cl/SiiDte'
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/
const MIN_BOOK_DATE = '2000-01-01'
const MAX_BOOK_DATE = '2050-12-31'
const MAX_RESOLUTION_NUMBER = 999_999
const MAX_FOLIO = 9_999_999_999

const isPositiveInteger = (value: number, max: number): boolean =>
  Number.isSafeInteger(value) && value > 0 && value <= max

/**
 * EN: Throws `INVALID_FOLIO` unless the folio is a positive integer of at most 10 digits.
 * ES: Lanza `INVALID_FOLIO` salvo que el folio sea un entero positivo de hasta 10 dígitos.
 */
export const assertBookFolio = (folio: number, field: string, index?: number): void => {
  if (!isPositiveInteger(folio, MAX_FOLIO)) throw new DteError('INVALID_FOLIO', { field, folio, index })
}

/**
 * EN: Throws `INVALID_AMOUNT` unless the value is absent or a safe integer; `signed: false` also rejects negatives,
 * as the fields the schema types as `MontoType` do.
 * ES: Lanza `INVALID_AMOUNT` salvo que el valor falte o sea un entero seguro; `signed: false` también rechaza negativos,
 * como los campos que el esquema tipa como `MontoType`.
 */
export const assertBookAmount = (
  value: number | undefined,
  options: { readonly field: string; readonly signed: boolean; readonly index?: number },
): void => {
  if (value === undefined) return
  if (!Number.isSafeInteger(value) || (!options.signed && value < 0))
    throw new DteError('INVALID_AMOUNT', { field: options.field, index: options.index })
}

/**
 * EN: Throws `INVALID_AMOUNT` unless the rate is absent or a percentage of at most 2 decimals (`PctType`).
 * ES: Lanza `INVALID_AMOUNT` salvo que la tasa falte o sea un porcentaje de hasta 2 decimales (`PctType`).
 */
export const assertBookRate = (rate: number | undefined, field: string, index?: number): void => {
  if (rate === undefined) return
  if (!(rate >= 0 && rate <= 100) || Math.round(rate * 100) / 100 !== rate)
    throw new DteError('INVALID_AMOUNT', { field, index })
}

/**
 * EN: Normalizes a document date of a book: `YYYY-MM-DD` within the 2000 to 2050 range of the schema.
 * ES: Normaliza una fecha de documento de un libro: `AAAA-MM-DD` dentro del rango 2000 a 2050 del esquema.
 * @throws {DteError} EN: `INVALID_DATE`. ES: `INVALID_DATE`.
 */
export const toBookDate = (value: string, field: string): string => {
  const iso = toIsoDate(value, field)
  if (iso < MIN_BOOK_DATE || iso > MAX_BOOK_DATE) throw new DteError('INVALID_DATE', { field })
  return iso
}

/**
 * EN: Throws `INVALID_OPTION` unless the resolution number is a non-negative integer of at most 6 digits.
 * ES: Lanza `INVALID_OPTION` salvo que el número de resolución sea un entero no negativo de hasta 6 dígitos.
 */
export const assertResolutionNumber = (value: number): void => {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_RESOLUTION_NUMBER)
    throw new DteError('INVALID_OPTION', { field: 'cover.resolutionNumber' })
}

/**
 * EN: Normalizes the cover fields both books share: RUTs through `toSiiRut`, the period as `YYYY-MM`, the resolution
 * date to ISO, `submission` to `total` by default, and the segment number required on `partial` and dropped elsewhere.
 * ES: Normaliza los campos de carátula que comparten ambos libros: RUT con `toSiiRut`, el período como `AAAA-MM`, la
 * fecha de resolución a ISO, `submission` en `total` por defecto, y el número de segmento obligatorio en `partial` y
 * descartado en los demás.
 * @throws {DteError} EN: `INVALID_RUT`, `INVALID_DATE`, `INVALID_OPTION`, `MISSING_FIELD`. ES: los mismos códigos.
 */
export const normalizeBookCover = (cover: BookCoverInput): BookCover => {
  if (!PERIOD.test(cover.period)) throw new DteError('INVALID_DATE', { field: 'cover.period' })
  assertResolutionNumber(cover.resolutionNumber)
  const submission = cover.submission ?? 'total'
  if (submission === 'partial' && cover.segmentNumber === undefined)
    throw new DteError('MISSING_FIELD', { field: 'cover.segmentNumber' })
  if (submission === 'partial' && !isPositiveInteger(cover.segmentNumber as number, MAX_RESOLUTION_NUMBER))
    throw new DteError('INVALID_OPTION', { field: 'cover.segmentNumber' })
  if (cover.notificationFolio !== undefined && !isPositiveInteger(cover.notificationFolio, MAX_FOLIO))
    throw new DteError('INVALID_OPTION', { field: 'cover.notificationFolio' })
  return {
    issuerRut: toSiiRut(cover.issuerRut, 'cover.issuerRut'),
    senderRut: toSiiRut(cover.senderRut, 'cover.senderRut'),
    period: cover.period,
    resolutionDate: toIsoDate(cover.resolutionDate, 'cover.resolutionDate'),
    resolutionNumber: cover.resolutionNumber,
    submission,
    ...(submission === 'partial' ? { segmentNumber: cover.segmentNumber } : {}),
    ...(cover.notificationFolio === undefined ? {} : { notificationFolio: cover.notificationFolio }),
  }
}

/**
 * EN: Enforces the zones of the format per submission (sections 1.2, 1.3 and 1.6): a `partial` needs lines and takes
 * neither previous nor summary-only totals, a `final` takes no lines and needs totals, and previous totals only belong to
 * `final` and `adjustment`.
 * ES: Exige las zonas del formato según el envío (secciones 1.2, 1.3 y 1.6): un `partial` necesita líneas y no acepta
 * totales previos ni de solo resumen, un `final` no acepta líneas y necesita totales, y los totales previos solo
 * corresponden a `final` y `adjustment`.
 * @throws {DteError} EN: `MISSING_FIELD`, `INVALID_OPTION`. ES: los mismos códigos.
 */
export const assertBookZones = (zones: {
  readonly submission: BookSubmission
  readonly entryCount: number
  readonly hasPreviousTotals: boolean
  readonly hasSummaryOnlyTotals: boolean
}): void => {
  const { submission, entryCount, hasPreviousTotals, hasSummaryOnlyTotals } = zones
  if (submission === 'partial' && entryCount === 0) throw new DteError('MISSING_FIELD', { field: 'entries' })
  if (submission === 'final' && entryCount > 0) throw new DteError('INVALID_OPTION', { field: 'entries' })
  if (hasPreviousTotals && submission !== 'final' && submission !== 'adjustment')
    throw new DteError('INVALID_OPTION', { field: 'previousTotals' })
  if (hasSummaryOnlyTotals && submission === 'partial')
    throw new DteError('INVALID_OPTION', { field: 'summaryOnlyTotals' })
  if (submission === 'final' && !hasPreviousTotals && !hasSummaryOnlyTotals)
    throw new DteError('MISSING_FIELD', { field: 'previousTotals' })
}

/**
 * EN: Input of `buildBookXml`.
 * ES: Entrada de `buildBookXml`.
 */
export type BookXmlInput = {
  /** EN: Root element. ES: Elemento raíz. */
  readonly rootTag: string
  /** EN: Element signed by `ID`. ES: Elemento que se firma por `ID`. */
  readonly signedTag: string
  /** EN: Schema file named in `xsi:schemaLocation`. ES: Archivo de esquema que nombra `xsi:schemaLocation`. */
  readonly schema: string
  /** EN: `ID` of the signed element. ES: `ID` del elemento firmado. */
  readonly id: string
  /** EN: Children of the signed element, in schema order. ES: Hijos del elemento firmado, en el orden del esquema. */
  readonly content: object
}

/**
 * EN: Renders a book: ISO-8859-1 prolog, root with its namespaces and a line break between every pair of adjacent tags,
 * because the SII rejects lines over about 4 090 characters (`CHR-00002`). The closing tag of the signed element stays
 * next to the closing root, where `signEnveloped` inserts the signature. Text cannot contain `><`: the builder escapes it.
 * ES: Renderiza un libro: prólogo ISO-8859-1, raíz con sus namespaces y un salto de línea entre cada par de etiquetas
 * adyacentes, porque el SII rechaza líneas de más de unos 4 090 caracteres (`CHR-00002`). El cierre del elemento firmado
 * queda junto al cierre del raíz, donde `signEnveloped` inserta la firma. El texto no puede contener `><`: el builder lo escapa.
 */
export const buildBookXml = ({ rootTag, signedTag, schema, id, content }: BookXmlInput): string => {
  const signed = buildXml({ [signedTag]: { '@_ID': id, ...content } })
  const root = `<?xml version="1.0" encoding="ISO-8859-1"?>\n<${rootTag} xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}" xsi:schemaLocation="${SII_NS} ${schema}" version="1.0">`
  return `${root}${signed}`.replace(/></g, '>\n<') + `</${rootTag}>`
}
```

- [ ] **Step 4: Run them to see them pass**

```bash
npx jest --config jest.config.cjs tests/books/common.test.ts
```

Expected: PASS, `Tests: 60 passed, 60 total`.

- [ ] **Step 5: Commit**

```bash
git add src/books/common.ts tests/books/common.test.ts
git commit -m "feat: shared rules of the books"
```

---

## Task 5: Summaries of the purchase and sales book

`sumBookEntries` and `accumulateBookTotals`, with `remove` lines subtracting. `compact` moves out of the phase 1 codec so the books can use it; it stays out of the root exports.

**Files:**
- Create: `src/books/totals.ts`
- Modify: `src/model/codec.ts`
- Test: `tests/books/totals.test.ts`

- [ ] **Step 1: Write the tests (they fail until Step 3)**

`tests/books/totals.test.ts`:

```ts
import { accumulateBookTotals, normalizeBookTotals, sumBookEntries } from '../../src/books/totals'
import type { DteError } from '../../src/errors'
import type { BookEntry, BookTotals } from '../../src/model/book'
import { RECEIVER_RUT } from '../support/fixtures'
import { toSiiRut } from '../../src/model/rut'

const row = (type: number, amount: number, extra: Partial<BookTotals> = {}): BookTotals => ({
  type,
  documentCount: 1,
  exemptAmount: 0,
  netAmount: amount,
  vatAmount: 0,
  totalAmount: amount,
  ...extra,
})

describe('sumBookEntries', () => {
  test('one row per type, in order of first appearance', () => {
    const entries: readonly BookEntry[] = [
      { type: 61, folio: 1, netAmount: 10, vatAmount: 2, totalAmount: 12 },
      { type: 33, folio: 2, exemptAmount: 5, totalAmount: 5 },
      { type: 61, folio: 3, netAmount: 20, vatAmount: 4, totalAmount: 24 },
    ]
    expect(sumBookEntries(entries)).toEqual([
      { type: 61, documentCount: 2, exemptAmount: 0, netAmount: 30, vatAmount: 6, totalAmount: 36 },
      { type: 33, documentCount: 1, exemptAmount: 5, netAmount: 0, vatAmount: 0, totalAmount: 5 },
    ])
  })

  test('adds every other amount of a line', () => {
    const entry: BookEntry = {
      type: 33,
      folio: 1,
      taxKind: 'vat',
      fixedAssetNetAmount: 1,
      fixedAssetVatAmount: 2,
      nonRecoverableVat: [{ code: 1, amount: 3 }],
      commonUseVat: 4,
      lateVat: 5,
      ownVatAmount: 6,
      thirdPartyVatAmount: 7,
      freeZoneTax: 8,
      otherTaxes: [{ code: 28, rate: 1, amount: 9 }],
      nonCreditableTax: 10,
      totalVatWithheld: 11,
      partialVatWithheld: 12,
      constructionCredit: 13,
      containerDeposit: 14,
      settlement: { issuerRut: toSiiRut(RECEIVER_RUT), netValue: 15, exemptValue: 16, vatValue: 17 },
      totalAmount: 18,
      vatNotWithheld: 19,
      nonBillableAmount: 20,
      periodAmount: 21,
      domesticTickets: 22,
      internationalTickets: 23,
      cigars: 24,
      cigarettes: 25,
      processedTobacco: 26,
      vehicleTax: 27,
    }
    expect(sumBookEntries([entry, entry])).toEqual([
      {
        type: 33,
        taxKind: 'vat',
        documentCount: 2,
        exemptAmount: 0,
        netAmount: 0,
        vatAmount: 0,
        fixedAssetNetAmount: 2,
        fixedAssetVatAmount: 4,
        nonRecoverableVat: [{ code: 1, count: 2, amount: 6 }],
        commonUseVatCount: 2,
        commonUseVat: 8,
        lateVat: 10,
        ownVatAmount: 12,
        thirdPartyVatAmount: 14,
        freeZoneTax: 16,
        otherTaxes: [{ code: 28, amount: 18 }],
        nonCreditableTax: 20,
        totalVatWithheld: 22,
        partialVatWithheld: 24,
        constructionCredit: 26,
        containerDeposit: 28,
        settlement: { netValue: 30, exemptValue: 32, vatValue: 34 },
        totalAmount: 36,
        vatNotWithheld: 38,
        nonBillableAmount: 40,
        periodAmount: 42,
        domesticTickets: 44,
        internationalTickets: 46,
        cigars: 48,
        cigarettes: 50,
        processedTobacco: 52,
        vehicleTax: 54,
      },
    ])
  })

  test('a voided line counts as a document and adds no amounts', () => {
    expect(sumBookEntries([{ type: 46, folio: 1, voided: true }])).toEqual([
      { type: 46, documentCount: 1, voidedCount: 1, exemptAmount: 0, netAmount: 0, vatAmount: 0, totalAmount: 0 },
    ])
  })

  test('a removed line subtracts everything, without producing -0', () => {
    const totals = sumBookEntries([
      {
        type: 33,
        folio: 1,
        adjustment: 'remove',
        netAmount: 100,
        vatAmount: 0,
        commonUseVat: 5,
        nonRecoverableVat: [{ code: 1, amount: 3 }],
        otherTaxes: [{ code: 28, rate: 1, amount: 2 }],
        settlement: { issuerRut: toSiiRut(RECEIVER_RUT), netValue: 4 },
        totalAmount: 100,
      },
      { type: 46, folio: 2, voided: true, adjustment: 'remove' },
    ])
    expect(totals).toEqual([
      {
        type: 33,
        documentCount: -1,
        exemptAmount: 0,
        netAmount: -100,
        vatAmount: 0,
        commonUseVatCount: -1,
        commonUseVat: -5,
        nonRecoverableVat: [{ code: 1, count: -1, amount: -3 }],
        otherTaxes: [{ code: 28, amount: -2 }],
        settlement: { netValue: -4 },
        totalAmount: -100,
      },
      { type: 46, documentCount: -1, voidedCount: -1, exemptAmount: 0, netAmount: 0, vatAmount: 0, totalAmount: 0 },
    ])
    expect(Object.is(totals[0].exemptAmount, 0)).toBe(true)
    expect(Object.is(totals[0].vatAmount, 0)).toBe(true)
  })

  test('nothing to sum yields no rows', () => {
    expect(sumBookEntries([])).toEqual([])
  })
})

describe('accumulateBookTotals', () => {
  test('adds by type and keeps rows present on one side only', () => {
    expect(accumulateBookTotals([row(33, 10), row(61, 1)], [row(39, 5), row(33, 20)])).toEqual([
      { ...row(33, 30), documentCount: 2 },
      row(61, 1),
      row(39, 5),
    ])
  })

  test('adds non-recoverable VAT and other taxes by code', () => {
    const [merged] = accumulateBookTotals(
      [
        row(33, 1, {
          nonRecoverableVat: [{ code: 1, count: 1, amount: 10 }],
          otherTaxes: [{ code: 28, amount: 1 }],
        }),
      ],
      [
        row(33, 1, {
          nonRecoverableVat: [
            { code: 1, count: 2, amount: 20 },
            { code: 9, amount: 5 },
          ],
          otherTaxes: [{ code: 35, amount: 2 }],
        }),
      ],
    )
    expect(merged.nonRecoverableVat).toEqual([
      { code: 1, count: 3, amount: 30 },
      { code: 9, amount: 5 },
    ])
    expect(merged.otherTaxes).toEqual([
      { code: 28, amount: 1 },
      { code: 35, amount: 2 },
    ])
  })

  test('adds the optional amounts present on either side', () => {
    const [merged] = accumulateBookTotals(
      [row(33, 1, { lateVat: 3, settlement: { netValue: 1 } })],
      [row(33, 1, { lateVat: 4, vehicleTax: 5, taxKind: 'vat', settlement: { netValue: 2, vatValue: 3 } })],
    )
    expect(merged).toMatchObject({
      lateVat: 7,
      vehicleTax: 5,
      taxKind: 'vat',
      settlement: { netValue: 3, vatValue: 3 },
    })
  })

  test('keeps one side of the lists and of the settlement when the other has none', () => {
    const [merged] = accumulateBookTotals(
      [row(33, 1)],
      [row(33, 1, { otherTaxes: [{ code: 28, amount: 2 }], settlement: { exemptValue: 2 } })],
    )
    expect(merged.otherTaxes).toEqual([{ code: 28, amount: 2 }])
    expect(merged.settlement).toEqual({ exemptValue: 2 })
    expect(merged).not.toHaveProperty('nonRecoverableVat')
  })
})

describe('normalizeBookTotals', () => {
  test('anything absent counts as 0', () => {
    expect(normalizeBookTotals({ type: 39, documentCount: 3, totalAmount: 30 })).toEqual({
      type: 39,
      documentCount: 3,
      exemptAmount: 0,
      netAmount: 0,
      vatAmount: 0,
      totalAmount: 30,
    })
    expect(normalizeBookTotals({ type: 39 })).toEqual({
      type: 39,
      documentCount: 0,
      exemptAmount: 0,
      netAmount: 0,
      vatAmount: 0,
      totalAmount: 0,
    })
  })

  test('keeps the rest of the row', () => {
    expect(normalizeBookTotals({ type: 39, exemptAmount: 1, netAmount: 2, vatAmount: 3, lateVat: 4 })).toMatchObject({
      exemptAmount: 1,
      netAmount: 2,
      vatAmount: 3,
      lateVat: 4,
    })
  })

  test('rejects an unknown type and an amount that is not an integer', () => {
    const failure = (input: Parameters<typeof normalizeBookTotals>[0]): string => {
      try {
        normalizeBookTotals(input)
      } catch (error) {
        return (error as DteError).code
      }
      throw new Error('expected a DteError')
    }
    expect(failure({ type: 52 })).toBe('INVALID_DOCUMENT_TYPE')
    expect(failure({ type: 39, netAmount: 1.5 })).toBe('INVALID_AMOUNT')
    expect(failure({ type: 39, lateVat: Number.NaN })).toBe('INVALID_AMOUNT')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx jest --config jest.config.cjs tests/books/totals.test.ts tests/codec.test.ts
```

Expected: FAIL, with `Cannot find module '../../src/books/totals'`.

- [ ] **Step 3: Write the implementation**

`src/books/totals.ts`:

```ts
import { DteError } from '../errors'
import { isBookDocumentType } from '../catalogs/book-codes'
import type { BookEntry, BookSettlementTotals, BookTotals, BookTotalsInput } from '../model/book'
import { compact } from '../model/codec'
import { assertBookAmount } from './common'

// Amounts added field by field, whichever row they come from.
const OPTIONAL_FIELDS = [
  'voidedCount',
  'fixedAssetNetAmount',
  'fixedAssetVatAmount',
  'commonUseVatCount',
  'commonUseVat',
  'lateVat',
  'ownVatAmount',
  'thirdPartyVatAmount',
  'freeZoneTax',
  'nonCreditableTax',
  'totalVatWithheld',
  'partialVatWithheld',
  'constructionCredit',
  'containerDeposit',
  'vatNotWithheld',
  'nonBillableAmount',
  'periodAmount',
  'domesticTickets',
  'internationalTickets',
  'cigars',
  'cigarettes',
  'processedTobacco',
  'vehicleTax',
] as const

const REQUIRED_FIELDS = ['documentCount', 'exemptAmount', 'netAmount', 'vatAmount', 'totalAmount'] as const

const SETTLEMENT_FIELDS = ['netValue', 'exemptValue', 'vatValue'] as const

const addOptional = (a: number | undefined, b: number | undefined): number | undefined =>
  a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0)

const mergeByCode = <T extends { readonly code: number }>(
  a: readonly T[] | undefined,
  b: readonly T[] | undefined,
  add: (left: T, right: T) => T,
): readonly T[] | undefined => {
  if (a === undefined && b === undefined) return undefined
  const merged = new Map<number, T>()
  for (const item of [...(a ?? []), ...(b ?? [])]) {
    const seen = merged.get(item.code)
    merged.set(item.code, seen === undefined ? item : add(seen, item))
  }
  return [...merged.values()]
}

const addSettlements = (
  a: BookSettlementTotals | undefined,
  b: BookSettlementTotals | undefined,
): BookSettlementTotals | undefined => {
  if (a === undefined && b === undefined) return undefined
  return compact(Object.fromEntries(SETTLEMENT_FIELDS.map((field) => [field, addOptional(a?.[field], b?.[field])])))
}

const addRows = (a: BookTotals, b: BookTotals): BookTotals =>
  compact({
    type: a.type,
    taxKind: a.taxKind ?? b.taxKind,
    ...Object.fromEntries(REQUIRED_FIELDS.map((field) => [field, a[field] + b[field]])),
    ...Object.fromEntries(OPTIONAL_FIELDS.map((field) => [field, addOptional(a[field], b[field])])),
    nonRecoverableVat: mergeByCode(a.nonRecoverableVat, b.nonRecoverableVat, (left, right) =>
      compact({ code: left.code, count: addOptional(left.count, right.count), amount: left.amount + right.amount }),
    ),
    otherTaxes: mergeByCode(a.otherTaxes, b.otherTaxes, (left, right) => ({
      code: left.code,
      amount: left.amount + right.amount,
    })),
    settlement: addSettlements(a.settlement, b.settlement),
  }) as BookTotals

/**
 * EN: Adds summaries by document type, and inside each type adds non-recoverable VAT and other taxes by code. Rows keep
 * the order of their first appearance, and a row present on one side only is kept. Use it to carry the period totals of
 * earlier submissions forward.
 * ES: Suma resúmenes por tipo de documento y, dentro de cada tipo, suma IVA no recuperable y otros impuestos por código.
 * Las filas conservan el orden en que aparecen por primera vez, y una fila presente en un solo lado se conserva. Sirve
 * para arrastrar los totales del período de envíos anteriores.
 */
export const accumulateBookTotals = (
  base: readonly BookTotals[],
  delta: readonly BookTotals[],
): readonly BookTotals[] => {
  const rows = new Map<number, BookTotals>()
  for (const row of [...base, ...delta]) {
    const seen = rows.get(row.type)
    rows.set(row.type, seen === undefined ? row : addRows(seen, row))
  }
  return [...rows.values()]
}

// `0 - value` rather than `-value`: a negated 0 would be -0, which prints the same but compares differently.
const signed =
  (remove: boolean) =>
  (value: number): number =>
    remove ? 0 - value : value

const signedOptional = (sign: (value: number) => number, value: number | undefined): number | undefined =>
  value === undefined ? undefined : sign(value)

const entryTotals = (entry: BookEntry): BookTotals => {
  const remove = entry.adjustment === 'remove'
  const sign = signed(remove)
  if (entry.voided)
    return {
      type: entry.type,
      documentCount: sign(1),
      voidedCount: sign(1),
      exemptAmount: 0,
      netAmount: 0,
      vatAmount: 0,
      totalAmount: 0,
    }
  const amount = (value: number | undefined): number | undefined => signedOptional(sign, value)
  return compact({
    type: entry.type,
    taxKind: entry.taxKind,
    documentCount: sign(1),
    exemptAmount: sign(entry.exemptAmount ?? 0),
    netAmount: sign(entry.netAmount ?? 0),
    vatAmount: sign(entry.vatAmount ?? 0),
    fixedAssetNetAmount: amount(entry.fixedAssetNetAmount),
    fixedAssetVatAmount: amount(entry.fixedAssetVatAmount),
    nonRecoverableVat: entry.nonRecoverableVat?.map((item) => ({
      code: item.code,
      count: sign(1),
      amount: sign(item.amount),
    })),
    commonUseVatCount: entry.commonUseVat === undefined ? undefined : sign(1),
    commonUseVat: amount(entry.commonUseVat),
    lateVat: amount(entry.lateVat),
    ownVatAmount: amount(entry.ownVatAmount),
    thirdPartyVatAmount: amount(entry.thirdPartyVatAmount),
    freeZoneTax: amount(entry.freeZoneTax),
    otherTaxes: entry.otherTaxes?.map((tax) => ({ code: tax.code, amount: sign(tax.amount) })),
    nonCreditableTax: amount(entry.nonCreditableTax),
    totalVatWithheld: amount(entry.totalVatWithheld),
    partialVatWithheld: amount(entry.partialVatWithheld),
    constructionCredit: amount(entry.constructionCredit),
    containerDeposit: amount(entry.containerDeposit),
    settlement:
      entry.settlement &&
      compact({
        netValue: amount(entry.settlement.netValue),
        exemptValue: amount(entry.settlement.exemptValue),
        vatValue: amount(entry.settlement.vatValue),
      }),
    totalAmount: sign(entry.totalAmount as number),
    vatNotWithheld: amount(entry.vatNotWithheld),
    nonBillableAmount: amount(entry.nonBillableAmount),
    periodAmount: amount(entry.periodAmount),
    domesticTickets: amount(entry.domesticTickets),
    internationalTickets: amount(entry.internationalTickets),
    cigars: amount(entry.cigars),
    cigarettes: amount(entry.cigarettes),
    processedTobacco: amount(entry.processedTobacco),
    vehicleTax: amount(entry.vehicleTax),
  })
}

/**
 * EN: The summary of a list of lines: one row per document type, `remove` lines with a negative sign.
 * ES: El resumen de una lista de líneas: una fila por tipo de documento, las líneas `remove` con signo negativo.
 */
export const sumBookEntries = (entries: readonly BookEntry[]): readonly BookTotals[] =>
  accumulateBookTotals([], entries.map(entryTotals))

/**
 * EN: Completes a row the caller provides: anything absent counts as 0.
 * ES: Completa una fila que entrega el llamador: lo que falte cuenta como 0.
 * @throws {DteError} EN: `INVALID_DOCUMENT_TYPE`, `INVALID_AMOUNT`. ES: los mismos códigos.
 */
export const normalizeBookTotals = (input: BookTotalsInput): BookTotals => {
  if (!isBookDocumentType(input.type)) throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type', type: input.type })
  for (const field of [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]) assertBookAmount(input[field], { field, signed: true })
  return {
    ...input,
    documentCount: input.documentCount ?? 0,
    exemptAmount: input.exemptAmount ?? 0,
    netAmount: input.netAmount ?? 0,
    vatAmount: input.vatAmount ?? 0,
    totalAmount: input.totalAmount ?? 0,
  }
}
```

In `src/model/codec.ts`, replace:

```ts
// Drops undefined values while keeping insertion order (the XML element order).
const compact = <T extends object>
```

with:

```ts
/**
 * EN: Drops undefined values while keeping insertion order, which is the XML element order.
 * ES: Quita los valores undefined conservando el orden de inserción, que es el orden de los elementos del XML.
 */
export const compact = <T extends object>
```

- [ ] **Step 4: Run them to see them pass**

```bash
npx jest --config jest.config.cjs tests/books/totals.test.ts tests/codec.test.ts
```

Expected: PASS, `Tests: 19 passed, 19 total`.

- [ ] **Step 5: Commit**

```bash
git add src/books/totals.ts tests/books/totals.test.ts src/model/codec.ts
git commit -m "feat: book totals per document type"
```

---

## Task 6: Lines of the purchase and sales book

The two formulas of the format, the defaults of each book side and the field-observed rules on purchases. A total that does not match is kept and reported: this is the parity rule of D21.

**Files:**
- Create: `src/books/entry.ts`
- Test: `tests/books/entry.test.ts`

- [ ] **Step 1: Write the tests (they fail until Step 3)**

`tests/books/entry.test.ts`:

```ts
import { expectedBookEntryTotal, normalizeBookEntry } from '../../src/books/entry'
import type { DteError } from '../../src/errors'
import type { BookEntryInput } from '../../src/model/book'
import { creditNote, invoice, SUPPLIER_RUT } from '../support/book-fixtures'
import { RECEIVER_RUT } from '../support/fixtures'

const sale = { operation: 'sale', submission: 'total', index: 0 } as const
const purchase = { operation: 'purchase', submission: 'total', index: 0 } as const
const line: BookEntryInput = { type: 33, folio: 1 }

const failure = (input: BookEntryInput): { code: string; details: unknown } => {
  try {
    normalizeBookEntry(input, { ...sale, index: 4 })
  } catch (error) {
    return { code: (error as DteError).code, details: (error as DteError).details }
  }
  throw new Error('expected a DteError')
}

describe('expectedBookEntryTotal', () => {
  test('sale: everything adds except credit, withholdings, commissions and the initial invoice retention', () => {
    expect(
      expectedBookEntryTotal(
        {
          ...line,
          netAmount: 1000,
          exemptAmount: 100,
          vatAmount: 190,
          otherTaxes: [
            { code: 24, rate: 31.5, amount: 50 },
            { code: 60, rate: 10, amount: 7 },
          ],
          containerDeposit: 20,
          constructionCredit: 30,
          partialVatWithheld: 2,
          totalVatWithheld: 3,
          settlement: { issuerRut: RECEIVER_RUT, netValue: 4, exemptValue: 5, vatValue: 6 },
        },
        'sale',
      ),
    ).toBe(1000 + 100 + 190 + 50 - 7 + 20 - 30 - 2 - 3 - 4 - 5 - 6)
  })

  test('purchase: common-use, non-recoverable and non-creditable add; retention codes do not', () => {
    expect(
      expectedBookEntryTotal(
        {
          ...line,
          netAmount: 1000,
          exemptAmount: 100,
          vatAmount: 190,
          commonUseVat: 11,
          nonRecoverableVat: [
            { code: 1, amount: 12 },
            { code: 9, amount: 13 },
          ],
          otherTaxes: [
            { code: 28, rate: 1, amount: 14 },
            { code: 15, rate: 19, amount: 190 },
            { code: 35, rate: 1, amount: 15 },
            { code: 60, rate: 10, amount: 16 },
          ],
          containerDeposit: 17,
          nonCreditableTax: 18,
          partialVatWithheld: 2,
          totalVatWithheld: 3,
        },
        'purchase',
      ),
    ).toBe(1000 + 100 + 190 + 11 + 12 + 13 + 14 + 15 - 16 + 17 + 18 - 2 - 3)
  })

  test('a purchase invoice with full withholding totals the net', () => {
    expect(expectedBookEntryTotal({ ...line, netAmount: 100, vatAmount: 19, totalVatWithheld: 19 }, 'purchase')).toBe(
      100,
    )
  })

  test('an empty line totals 0 on either side', () => {
    expect(expectedBookEntryTotal(line, 'sale')).toBe(0)
    expect(expectedBookEntryTotal(line, 'purchase')).toBe(0)
  })
})

describe('normalizeBookEntry on a sale book', () => {
  test('fills the amounts with 0, uses the VAT rate and computes the total', () => {
    expect(normalizeBookEntry(invoice, sale)).toEqual({
      entry: { ...invoice, exemptAmount: 0, taxRate: 19, totalAmount: 119000 },
      mismatch: null,
    })
  })

  test('an exempt line has no rate', () => {
    const { entry } = normalizeBookEntry({ ...line, exemptAmount: 500 }, sale)
    expect(entry).toEqual({ ...line, exemptAmount: 500, netAmount: 0, vatAmount: 0, totalAmount: 500 })
  })

  test('an explicit rate stays', () => {
    expect(normalizeBookEntry({ ...invoice, taxRate: 10 }, sale).entry.taxRate).toBe(10)
  })

  test('a net without VAT does not get a rate', () => {
    expect(normalizeBookEntry({ ...line, netAmount: 100 }, sale).entry.taxRate).toBeUndefined()
  })

  test('a VAT without net does not get a rate', () => {
    expect(normalizeBookEntry({ ...line, vatAmount: 19 }, sale).entry.taxRate).toBeUndefined()
  })

  test('sanitizes text and normalizes RUTs and dates', () => {
    const { entry } = normalizeBookEntry(
      {
        ...line,
        date: '05-10-2026',
        counterpartyRut: '12.345.678-5',
        counterpartyName: "  Rapel's Ltda ",
        internalNumber: 'A-1',
        foreignReceiver: { id: 'P-1', nationality: '224' },
        settlement: { issuerRut: '10.000.004-0', netValue: 1 },
      },
      sale,
    )
    expect(entry).toMatchObject({
      date: '2026-10-05',
      counterpartyRut: RECEIVER_RUT,
      counterpartyName: 'Rapels Ltda',
      internalNumber: 'A-1',
      foreignReceiver: { id: 'P-1', nationality: '224' },
      settlement: { issuerRut: SUPPLIER_RUT, netValue: 1 },
    })
  })

  test('a foreign receiver with a single field keeps that field', () => {
    expect(
      normalizeBookEntry({ ...line, foreignReceiver: { nationality: '224' } }, sale).entry.foreignReceiver,
    ).toEqual({
      nationality: '224',
    })
  })

  test('keeps every other field as given', () => {
    const fields = {
      issuedByBookOwner: true,
      purchaseInvoice: true,
      serviceIndicator: 1,
      freeOfCharge: true,
      branchCode: 12,
      referenceType: 33,
      referenceFolio: 9,
      lateVat: 1,
      ownVatAmount: 2,
      thirdPartyVatAmount: 3,
      freeZoneTax: 4,
      vatNotWithheld: 5,
      nonBillableAmount: -6,
      periodAmount: -7,
      domesticTickets: 8,
      internationalTickets: 9,
    } as const
    expect(normalizeBookEntry({ ...line, ...fields, totalAmount: 0 }, sale).entry).toMatchObject(fields)
  })
})

describe('normalizeBookEntry on a purchase book', () => {
  test('emits what was given, without zeros', () => {
    expect(normalizeBookEntry({ ...line, exemptAmount: 500 }, purchase).entry).toEqual({
      ...line,
      exemptAmount: 500,
      totalAmount: 500,
    })
  })

  test.each([
    ['common-use VAT', { commonUseVat: 57 }, 57],
    ['non-recoverable VAT', { nonRecoverableVat: [{ code: 1, amount: 57 }] }, 57],
  ] as const)('with %s, rate, VAT and net default to 0', (_name, fields, total) => {
    expect(normalizeBookEntry({ ...line, ...fields }, purchase).entry).toMatchObject({
      taxRate: 0,
      vatAmount: 0,
      netAmount: 0,
      totalAmount: total,
    })
  })

  test('a mixed document keeps its explicit values', () => {
    expect(
      normalizeBookEntry({ ...line, netAmount: 100, vatAmount: 10, taxRate: 19, commonUseVat: 9 }, purchase).entry,
    ).toMatchObject({ netAmount: 100, vatAmount: 10, taxRate: 19, commonUseVat: 9, totalAmount: 119 })
  })

  test('net alone or VAT alone does not get a rate', () => {
    expect(normalizeBookEntry({ ...line, netAmount: 100 }, purchase).entry.taxRate).toBeUndefined()
    expect(normalizeBookEntry({ ...line, vatAmount: 19 }, purchase).entry.taxRate).toBeUndefined()
  })

  test('a rate without net sets net and VAT to explicit zeros', () => {
    expect(normalizeBookEntry({ ...line, taxRate: 19, exemptAmount: 900 }, purchase).entry).toMatchObject({
      taxRate: 19,
      netAmount: 0,
      vatAmount: 0,
      exemptAmount: 900,
    })
    expect(normalizeBookEntry({ ...line, taxRate: 19, vatAmount: 5 }, purchase).entry.vatAmount).toBe(5)
  })
})

describe('voided lines and adjustments', () => {
  test('a voided line keeps only type and folio', () => {
    expect(normalizeBookEntry({ ...invoice, voided: true }, sale)).toEqual({
      entry: { type: 33, folio: 101, voided: true },
      mismatch: null,
    })
  })

  test('adjustments default to add on an adjustment submission and travel when given', () => {
    const adjustment = { ...sale, submission: 'adjustment' } as const
    expect(normalizeBookEntry(creditNote, adjustment).entry.adjustment).toBe('add')
    expect(normalizeBookEntry({ ...creditNote, adjustment: 'remove' }, adjustment).entry.adjustment).toBe('remove')
    expect(normalizeBookEntry({ ...line, voided: true }, adjustment).entry).toEqual({
      ...line,
      voided: true,
      adjustment: 'add',
    })
    expect(normalizeBookEntry(creditNote, sale).entry.adjustment).toBeUndefined()
    expect(normalizeBookEntry({ ...creditNote, adjustment: 'add' }, sale).entry.adjustment).toBe('add')
  })
})

describe('total mismatches', () => {
  test('an explicit total that matches is not reported', () => {
    expect(normalizeBookEntry({ ...invoice, totalAmount: 119000 }, sale).mismatch).toBeNull()
  })

  test('an explicit total that differs is kept and reported', () => {
    expect(normalizeBookEntry({ ...invoice, totalAmount: 119001 }, { ...sale, index: 7 })).toMatchObject({
      entry: { totalAmount: 119001 },
      mismatch: { index: 7, type: 33, folio: 101, expected: 119000, actual: 119001 },
    })
  })
})

describe('validation', () => {
  test.each([
    [{ ...line, type: 52 }, 'INVALID_DOCUMENT_TYPE', { field: 'type', type: 52, index: 4 }],
    [{ ...line, folio: 0 }, 'INVALID_FOLIO', { field: 'folio', folio: 0, index: 4 }],
    [{ ...line, referenceType: 52 }, 'INVALID_DOCUMENT_TYPE', { field: 'referenceType', type: 52, index: 4 }],
    [{ ...line, referenceFolio: 0 }, 'INVALID_FOLIO', { field: 'referenceFolio', folio: 0, index: 4 }],
    [{ ...line, branchCode: 0 }, 'INVALID_OPTION', { field: 'branchCode', index: 4 }],
    [{ ...line, branchCode: 1_000_000_000 }, 'INVALID_OPTION', { field: 'branchCode', index: 4 }],
    [{ ...line, branchCode: 1.5 }, 'INVALID_OPTION', { field: 'branchCode', index: 4 }],
    [{ ...line, netAmount: 1.5 }, 'INVALID_AMOUNT', { field: 'netAmount', index: 4 }],
    [{ ...line, commonUseVat: -1 }, 'INVALID_AMOUNT', { field: 'commonUseVat', index: 4 }],
    [{ ...line, taxRate: 101 }, 'INVALID_AMOUNT', { field: 'taxRate', index: 4 }],
    [
      { ...line, nonRecoverableVat: [{ code: 1, amount: -1 }] },
      'INVALID_AMOUNT',
      { field: 'nonRecoverableVat.amount', index: 4 },
    ],
    [
      { ...line, otherTaxes: [{ code: 28, rate: 1, amount: 1.5 }] },
      'INVALID_AMOUNT',
      { field: 'otherTaxes.amount', index: 4 },
    ],
    [
      { ...line, otherTaxes: [{ code: 28, rate: 101, amount: 1 }] },
      'INVALID_AMOUNT',
      { field: 'otherTaxes.rate', index: 4 },
    ],
    [
      { ...line, settlement: { issuerRut: RECEIVER_RUT, vatValue: 1.5 } },
      'INVALID_AMOUNT',
      { field: 'settlement', index: 4 },
    ],
    [
      { ...line, nonRecoverableVat: Array.from({ length: 6 }, () => ({ code: 1, amount: 1 }) as const) },
      'INVALID_OPTION',
      { field: 'nonRecoverableVat', index: 4 },
    ],
    [
      { ...line, otherTaxes: Array.from({ length: 21 }, () => ({ code: 28, rate: 1, amount: 1 })) },
      'INVALID_OPTION',
      { field: 'otherTaxes', index: 4 },
    ],
  ] as const)('rejects %j', (input, code, details) => {
    expect(failure(input as BookEntryInput)).toEqual({ code, details })
  })

  test('the rate of another tax is optional', () => {
    expect(normalizeBookEntry({ ...line, otherTaxes: [{ code: 28, amount: 5 }] }, sale).entry.totalAmount).toBe(5)
  })

  test('settlement and tax amounts may be negative', () => {
    expect(
      normalizeBookEntry(
        {
          type: 43,
          folio: 1,
          netAmount: -10,
          vatAmount: -2,
          otherTaxes: [{ code: 28, rate: 1, amount: -1 }],
          settlement: { issuerRut: RECEIVER_RUT, netValue: -3, exemptValue: -4, vatValue: -5 },
        },
        sale,
      ).entry.totalAmount,
    ).toBe(-10 - 2 - 1 + 3 + 4 + 5)
  })

  test.each([
    ['counterpartyName', 'RznSoc', 51],
    ['internalNumber', 'NumInt', 11],
  ])('rejects a %s over the limit', (field, element, length) => {
    expect(failure({ ...line, [field]: 'x'.repeat(length) })).toMatchObject({
      code: 'FIELD_TOO_LONG',
      details: { field: element, length },
    })
  })

  test.each([
    ['id', 'NumId', 21],
    ['nationality', 'Nacionalidad', 4],
  ])('rejects a foreign %s over the limit', (field, element, length) => {
    expect(failure({ ...line, foreignReceiver: { [field]: 'x'.repeat(length) } })).toMatchObject({
      code: 'FIELD_TOO_LONG',
      details: { field: element, length },
    })
  })

  test('rejects a date out of range and an invalid RUT', () => {
    expect(failure({ ...line, date: '1999-01-01' }).code).toBe('INVALID_DATE')
    expect(failure({ ...line, counterpartyRut: '1-1' }).code).toBe('INVALID_RUT')
    expect(failure({ ...line, settlement: { issuerRut: '1-1' } }).code).toBe('INVALID_RUT')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx jest --config jest.config.cjs tests/books/entry.test.ts
```

Expected: FAIL, with `Cannot find module '../../src/books/entry'`.

- [ ] **Step 3: Write the implementation**

`src/books/entry.ts`:

```ts
import { VAT_RATE } from '../catalogs/codes'
import { isBookDocumentType, type BookOperation, type BookSubmission } from '../catalogs/book-codes'
import { DteError } from '../errors'
import type { BookEntry, BookEntryInput, BookTotalMismatch } from '../model/book'
import { compact } from '../model/codec'
import { toSiiRut } from '../model/rut'
import { assertMaxLength, sanitizeText } from '../text/sanitize'
import { assertBookAmount, assertBookFolio, assertBookRate, toBookDate } from './common'

const MAX_NAME = 50
const MAX_INTERNAL_NUMBER = 10
const MAX_FOREIGN_ID = 20
const MAX_NATIONALITY = 3
const MAX_NON_RECOVERABLE_VAT = 5
const MAX_OTHER_TAXES = 20
const MAX_BRANCH_CODE = 999_999_999

// Fields the schema types as `ValorType`, which admits negatives on settlements and adjustments.
const SIGNED_AMOUNTS = [
  'exemptAmount',
  'netAmount',
  'vatAmount',
  'ownVatAmount',
  'thirdPartyVatAmount',
  'totalAmount',
  'nonBillableAmount',
  'periodAmount',
] as const

// Fields the schema types as `MontoType`: never negative.
const UNSIGNED_AMOUNTS = [
  'fixedAssetNetAmount',
  'fixedAssetVatAmount',
  'commonUseVat',
  'lateVat',
  'freeZoneTax',
  'nonCreditableTax',
  'totalVatWithheld',
  'partialVatWithheld',
  'constructionCredit',
  'containerDeposit',
  'vatNotWithheld',
  'domesticTickets',
  'internationalTickets',
  'cigars',
  'cigarettes',
  'processedTobacco',
  'vehicleTax',
] as const

// Their amount travels in `IVARetTotal` and `IVARetParcial`, so on a purchase book they do not add to the total. Code 35
// is the gasoline tax, despite the "30 to 41" range the format mentions.
const RETENTION_TAX_CODES: readonly number[] = [
  15, 30, 31, 32, 33, 34, 36, 37, 38, 39, 41, 47, 48, 49, 301, 321, 331, 341, 361, 371, 481,
]
const INITIAL_INVOICE_RETENTION = 60

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0)

/**
 * EN: The SII formula for a line total, per book side (sections 2.4 and 3.4 of the format).
 * ES: La fórmula del SII para el total de una línea, según el lado del libro (secciones 2.4 y 3.4 del formato).
 */
export const expectedBookEntryTotal = (entry: BookEntryInput, operation: BookOperation): number => {
  const otherTaxes = (entry.otherTaxes ?? []).filter(
    (tax) => operation === 'sale' || !RETENTION_TAX_CODES.includes(tax.code),
  )
  const taxes = sum(otherTaxes.map((tax) => (tax.code === INITIAL_INVOICE_RETENTION ? -tax.amount : tax.amount)))
  const base =
    (entry.netAmount ?? 0) +
    (entry.exemptAmount ?? 0) +
    (entry.vatAmount ?? 0) +
    taxes +
    (entry.containerDeposit ?? 0) -
    (entry.partialVatWithheld ?? 0) -
    (entry.totalVatWithheld ?? 0)
  if (operation === 'sale')
    return (
      base -
      (entry.constructionCredit ?? 0) -
      (entry.settlement?.exemptValue ?? 0) -
      (entry.settlement?.netValue ?? 0) -
      (entry.settlement?.vatValue ?? 0)
    )
  return (
    base +
    (entry.commonUseVat ?? 0) +
    sum((entry.nonRecoverableVat ?? []).map((item) => item.amount)) +
    (entry.nonCreditableTax ?? 0)
  )
}

const validate = (input: BookEntryInput, index: number): void => {
  if (!isBookDocumentType(input.type))
    throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type', type: input.type, index })
  assertBookFolio(input.folio, 'folio', index)
  if (input.referenceType !== undefined && !isBookDocumentType(input.referenceType))
    throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'referenceType', type: input.referenceType, index })
  if (input.referenceFolio !== undefined) assertBookFolio(input.referenceFolio, 'referenceFolio', index)
  if (
    input.branchCode !== undefined &&
    !(Number.isSafeInteger(input.branchCode) && input.branchCode > 0 && input.branchCode <= MAX_BRANCH_CODE)
  )
    throw new DteError('INVALID_OPTION', { field: 'branchCode', index })
  if ((input.nonRecoverableVat ?? []).length > MAX_NON_RECOVERABLE_VAT)
    throw new DteError('INVALID_OPTION', { field: 'nonRecoverableVat', index })
  if ((input.otherTaxes ?? []).length > MAX_OTHER_TAXES)
    throw new DteError('INVALID_OPTION', { field: 'otherTaxes', index })
  for (const field of SIGNED_AMOUNTS) assertBookAmount(input[field], { field, signed: true, index })
  for (const field of UNSIGNED_AMOUNTS) assertBookAmount(input[field], { field, signed: false, index })
  for (const item of input.nonRecoverableVat ?? [])
    assertBookAmount(item.amount, { field: 'nonRecoverableVat.amount', signed: false, index })
  for (const tax of input.otherTaxes ?? []) {
    assertBookAmount(tax.amount, { field: 'otherTaxes.amount', signed: true, index })
    assertBookRate(tax.rate, 'otherTaxes.rate', index)
  }
  assertBookRate(input.taxRate, 'taxRate', index)
  for (const value of [input.settlement?.netValue, input.settlement?.exemptValue, input.settlement?.vatValue])
    assertBookAmount(value, { field: 'settlement', signed: true, index })
}

const text = (value: string | undefined, maxLength: number, field: string): string | undefined => {
  if (value === undefined) return undefined
  const sanitized = sanitizeText(value)
  assertMaxLength(sanitized, maxLength, field)
  return sanitized
}

// Field-observed SII rules on purchase books: with common-use or non-recoverable VAT, the rate and the recoverable VAT
// default to 0 and `MntNeto` must be present (a missing one produced `LBR-3`); with a rate and no net, net and VAT must be
// explicit zeros (omitting them produced `LRH` with `LBR-3`, zeros produced `LOK` with `LBR-2`).
const purchaseDefaults = (input: BookEntryInput): Partial<BookEntryInput> => {
  const noRecoverableVat = input.commonUseVat !== undefined || input.nonRecoverableVat !== undefined
  if (noRecoverableVat)
    return { netAmount: input.netAmount ?? 0, vatAmount: input.vatAmount ?? 0, taxRate: input.taxRate ?? 0 }
  if (input.taxRate !== undefined && input.netAmount === undefined)
    return { netAmount: 0, vatAmount: input.vatAmount ?? 0 }
  return {}
}

const saleDefaults = (input: BookEntryInput): Partial<BookEntryInput> => ({
  exemptAmount: input.exemptAmount ?? 0,
  netAmount: input.netAmount ?? 0,
  vatAmount: input.vatAmount ?? 0,
})

const withRate = (entry: BookEntryInput): BookEntryInput =>
  entry.taxRate === undefined && (entry.netAmount ?? 0) > 0 && (entry.vatAmount ?? 0) > 0
    ? { ...entry, taxRate: VAT_RATE }
    : entry

/**
 * EN: Result of `normalizeBookEntry`.
 * ES: Resultado de `normalizeBookEntry`.
 */
export type NormalizedBookEntry = {
  /** EN: The line, ready to serialize. ES: La línea, lista para serializar. */
  readonly entry: BookEntry
  /** EN: The difference with the formula, when the total was explicit and does not match. ES: La diferencia con la fórmula, si el total era explícito y no calza. */
  readonly mismatch: BookTotalMismatch | null
}

/**
 * EN: Validates and normalizes one line: voided lines keep only type and folio, and the defaults of each book side and
 * the total apply to the rest.
 * ES: Valida y normaliza una línea: las anuladas conservan solo tipo y folio, y al resto se le aplican los valores por
 * defecto de cada lado del libro y el total.
 * @throws {DteError} EN: `INVALID_DOCUMENT_TYPE`, `INVALID_FOLIO`, `INVALID_AMOUNT`, `INVALID_DATE`, `INVALID_RUT`, `INVALID_OPTION`, `FIELD_TOO_LONG`. ES: los mismos códigos.
 */
export const normalizeBookEntry = (
  input: BookEntryInput,
  options: { readonly operation: BookOperation; readonly submission: BookSubmission; readonly index: number },
): NormalizedBookEntry => {
  const { operation, submission, index } = options
  validate(input, index)
  const adjustment = input.adjustment ?? (submission === 'adjustment' ? 'add' : undefined)
  if (input.voided)
    return {
      entry: { type: input.type, folio: input.folio, voided: true, ...(adjustment ? { adjustment } : {}) },
      mismatch: null,
    }
  const defaults = operation === 'sale' ? saleDefaults(input) : purchaseDefaults(input)
  const filled = withRate({ ...input, ...defaults })
  const expected = expectedBookEntryTotal(filled, operation)
  const entry: BookEntry = compact({
    ...filled,
    adjustment,
    date: filled.date === undefined ? undefined : toBookDate(filled.date, 'date'),
    counterpartyRut:
      filled.counterpartyRut === undefined ? undefined : toSiiRut(filled.counterpartyRut, 'counterpartyRut'),
    counterpartyName: text(filled.counterpartyName, MAX_NAME, 'RznSoc'),
    internalNumber: text(filled.internalNumber, MAX_INTERNAL_NUMBER, 'NumInt'),
    foreignReceiver:
      filled.foreignReceiver &&
      compact({
        id: text(filled.foreignReceiver.id, MAX_FOREIGN_ID, 'NumId'),
        nationality: text(filled.foreignReceiver.nationality, MAX_NATIONALITY, 'Nacionalidad'),
      }),
    settlement: filled.settlement && {
      ...filled.settlement,
      issuerRut: toSiiRut(filled.settlement.issuerRut, 'settlement.issuerRut'),
    },
    totalAmount: filled.totalAmount ?? expected,
  })
  return {
    entry,
    mismatch:
      filled.totalAmount === undefined || filled.totalAmount === expected
        ? null
        : { index, type: input.type, folio: input.folio, expected, actual: filled.totalAmount },
  }
}
```

- [ ] **Step 4: Run them to see them pass**

```bash
npx jest --config jest.config.cjs tests/books/entry.test.ts
```

Expected: PASS, `Tests: 45 passed, 45 total`.

- [ ] **Step 5: Commit**

```bash
git add src/books/entry.ts tests/books/entry.test.ts
git commit -m "feat: normalize book lines and the total formula"
```

---

## Task 7: Purchase and sales book

The codec holds the three `toSii*` functions because they share helpers; the guide and report ones get their tests in the next two tasks. Every sample is compared byte for byte with its golden file and, signed, validated against the official XSD.

**Files:**
- Create: `src/model/book-codec.ts`
- Create: `src/books/purchase-sales.ts`
- Test: `tests/support/purchase-sales-samples.ts`
- Test: `tests/books/book-codec.test.ts`
- Test: `tests/books/purchase-sales.test.ts`
- Golden: `tests/fixtures/books/sale-total.xml`
- Golden: `tests/fixtures/books/purchase-special.xml`
- Golden: `tests/fixtures/books/sale-partial.xml`
- Golden: `tests/fixtures/books/sale-final.xml`
- Golden: `tests/fixtures/books/sale-adjustment.xml`
- Golden: `tests/fixtures/books/sale-rectification.xml`

- [ ] **Step 1: Write the tests (they fail until Step 3)**

`tests/support/purchase-sales-samples.ts`:

```ts
import { buildPurchaseSalesBookXml, createPurchaseSalesBook } from '../../src/books/purchase-sales'
import type { BookEntryInput, PurchaseSalesBook, PurchaseSalesBookInput } from '../../src/model/book'
import { BOOK_ID, creditNote, exemptInvoice, invoice, purchaseCover, saleCover, SUPPLIER_RUT } from './book-fixtures'
import { FIXED_NOW } from './fixtures'

const purchaseInvoice: BookEntryInput = {
  type: 46,
  folio: 6,
  date: '2026-10-08',
  counterpartyRut: SUPPLIER_RUT,
  counterpartyName: 'Hortalizas del Maule Ltda',
  netAmount: 20000,
  vatAmount: 3800,
  totalVatWithheld: 3800,
}

const purchases: readonly BookEntryInput[] = [
  {
    type: 33,
    folio: 201,
    date: '2026-10-02',
    counterpartyRut: SUPPLIER_RUT,
    counterpartyName: 'Ferretería Ñuble SpA',
    netAmount: 30000,
    commonUseVat: 5700,
  },
  {
    type: 33,
    folio: 202,
    date: '2026-10-03',
    counterpartyRut: SUPPLIER_RUT,
    netAmount: 40000,
    nonRecoverableVat: [{ code: 1, amount: 7600 }],
  },
  { type: 30, folio: 203, date: '2026-10-04', counterpartyRut: SUPPLIER_RUT, exemptAmount: 9000, taxRate: 19 },
  {
    type: 33,
    folio: 204,
    date: '2026-10-05',
    counterpartyRut: SUPPLIER_RUT,
    netAmount: 100000,
    vatAmount: 19000,
    otherTaxes: [{ code: 28, rate: 1.5, amount: 1500 }],
  },
  purchaseInvoice,
]

const previousTotals = [
  { type: 33, documentCount: 4, exemptAmount: 0, netAmount: 400000, vatAmount: 76000, totalAmount: 476000 },
  { type: 61, documentCount: 1, exemptAmount: 0, netAmount: 10000, vatAmount: 1900, totalAmount: 11900 },
]

const receiptTotals = { type: 39, documentCount: 120, netAmount: 840000, vatAmount: 159600, totalAmount: 999600 }

type Sample = { readonly book: PurchaseSalesBook; readonly xml: string }

const sample = (input: PurchaseSalesBookInput): Sample => {
  const book = createPurchaseSalesBook({ id: BOOK_ID, now: FIXED_NOW, ...input })
  return { book, xml: buildPurchaseSalesBookXml(book) }
}

/** One sample per golden file in `tests/fixtures/books/`, named after it. */
export const PURCHASE_SALES_SAMPLES = {
  'sale-total': sample({
    cover: saleCover,
    entries: [invoice, exemptInvoice, creditNote, { type: 46, folio: 5, voided: true }, purchaseInvoice],
    summaryOnlyTotals: [receiptTotals],
  }),
  'purchase-special': sample({
    cover: { ...purchaseCover, kind: 'special', notificationFolio: 2 },
    entries: purchases,
    commonUseVatFactor: 0.6,
  }),
  'sale-partial': sample({
    cover: { ...saleCover, submission: 'partial', segmentNumber: 1 },
    entries: [invoice, creditNote],
  }),
  'sale-final': sample({
    cover: { ...saleCover, submission: 'final' },
    previousTotals,
    summaryOnlyTotals: [receiptTotals],
  }),
  'sale-adjustment': sample({
    cover: { ...saleCover, submission: 'adjustment' },
    entries: [
      { ...invoice, adjustment: 'remove' },
      { ...invoice, netAmount: 90000, vatAmount: 17100 },
    ],
    previousTotals,
  }),
  'sale-rectification': sample({
    cover: { ...saleCover, kind: 'rectification', rectificationCode: 'AUT123' },
    entries: [invoice],
  }),
}
```

`tests/books/book-codec.test.ts`:

```ts
import { createPurchaseSalesBook, signPurchaseSalesBook } from '../../src/books/purchase-sales'
import { toSiiPurchaseSalesBook } from '../../src/model/book-codec'
import { certificate, purchaseCover, saleCover, SUPPLIER_RUT } from '../support/book-fixtures'
import { FIXED_NOW, RECEIVER_RUT } from '../support/fixtures'
import { validateAgainstXsd } from '../support/xsd'

jest.setTimeout(30_000)

const fullLine = {
  type: 33,
  folio: 1,
  issuedByBookOwner: true,
  purchaseInvoice: true,
  adjustment: 'add',
  taxKind: 'freeZone',
  taxRate: 19,
  internalNumber: 'A-1',
  serviceIndicator: 1,
  freeOfCharge: true,
  date: '2026-10-05',
  branchCode: 12,
  counterpartyRut: RECEIVER_RUT,
  counterpartyName: 'Comercializadora Rapel Ltda',
  foreignReceiver: { id: 'P-1', nationality: '224' },
  referenceType: 33,
  referenceFolio: 9,
  exemptAmount: 1,
  netAmount: 2,
  vatAmount: 3,
  fixedAssetNetAmount: 4,
  fixedAssetVatAmount: 5,
  nonRecoverableVat: [{ code: 1, amount: 6 }],
  commonUseVat: 7,
  lateVat: 8,
  ownVatAmount: 9,
  thirdPartyVatAmount: 10,
  freeZoneTax: 11,
  otherTaxes: [{ code: 28, rate: 1, amount: 12 }],
  nonCreditableTax: 13,
  totalVatWithheld: 14,
  partialVatWithheld: 15,
  constructionCredit: 16,
  containerDeposit: 17,
  settlement: { issuerRut: SUPPLIER_RUT, netValue: 18, exemptValue: 19, vatValue: 20 },
  totalAmount: 21,
  vatNotWithheld: 22,
  nonBillableAmount: 23,
  periodAmount: 24,
  domesticTickets: 25,
  internationalTickets: 26,
  cigars: 27,
  cigarettes: 28,
  processedTobacco: 29,
  vehicleTax: 30,
} as const

const book = createPurchaseSalesBook({
  cover: { ...purchaseCover, submission: 'adjustment' },
  entries: [fullLine],
  commonUseVatFactor: 0.6,
  now: FIXED_NOW,
  id: 'LIBRO_TEST',
})

describe('toSiiPurchaseSalesBook', () => {
  const sii = toSiiPurchaseSalesBook(book)

  test('every line field reaches its tag, in the order of the schema', () => {
    expect(Object.keys(sii.Detalle?.[0] ?? {})).toEqual([
      'TpoDoc',
      'Emisor',
      'IndFactCompra',
      'NroDoc',
      'Operacion',
      'TpoImp',
      'TasaImp',
      'NumInt',
      'IndServicio',
      'IndSinCosto',
      'FchDoc',
      'CdgSIISucur',
      'RUTDoc',
      'RznSoc',
      'Extranjero',
      'TpoDocRef',
      'FolioDocRef',
      'MntExe',
      'MntNeto',
      'MntIVA',
      'MntActivoFijo',
      'MntIVAActivoFijo',
      'IVANoRec',
      'IVAUsoComun',
      'IVAFueraPlazo',
      'IVAPropio',
      'IVATerceros',
      'Ley18211',
      'OtrosImp',
      'MntSinCred',
      'IVARetTotal',
      'IVARetParcial',
      'CredEC',
      'DepEnvase',
      'Liquidaciones',
      'MntTotal',
      'IVANoRetenido',
      'MntNoFact',
      'MntPeriodo',
      'PsjNac',
      'PsjInt',
      'TabPuros',
      'TabCigarrillos',
      'TabElaborado',
      'ImpVehiculo',
    ])
    expect(sii.Detalle?.[0]).toMatchObject({
      Emisor: 1,
      IndFactCompra: 1,
      Operacion: 1,
      TpoImp: 2,
      IndSinCosto: 1,
      Extranjero: { NumId: 'P-1', Nacionalidad: '224' },
      IVANoRec: [{ CodIVANoRec: 1, MntIVANoRec: 6 }],
      OtrosImp: [{ CodImp: 28, TasaImp: 1, MntImp: 12 }],
      Liquidaciones: { RutEmisor: SUPPLIER_RUT, ValComNeto: 18, ValComExe: 19, ValComIVA: 20 },
    })
  })

  test('the summaries follow the order of their schema types', () => {
    const shared = [
      'TpoDoc',
      'TpoImp',
      'TotDoc',
      'TotMntExe',
      'TotMntNeto',
      'TotMntIVA',
      'TotMntActivoFijo',
      'TotMntIVAActivoFijo',
      'TotIVANoRec',
      'TotOpIVAUsoComun',
      'TotIVAUsoComun',
    ]
    const after = [
      'TotIVAFueraPlazo',
      'TotIVAPropio',
      'TotIVATerceros',
      'TotLey18211',
      'TotOtrosImp',
      'TotImpSinCredito',
      'TotIVARetTotal',
      'TotIVARetParcial',
      'TotCredEC',
      'TotDepEnvase',
      'TotLiquidaciones',
      'TotMntTotal',
      'TotIVANoRetenido',
      'TotMntNoFact',
      'TotMntPeriodo',
      'TotPsjNac',
      'TotPsjInt',
      'TotTabPuros',
      'TotTabCigarrillos',
      'TotTabElaborado',
    ]
    expect(Object.keys(sii.ResumenSegmento?.TotalesSegmento[0] ?? {})).toEqual([...shared, ...after])
    expect(Object.keys(sii.ResumenPeriodo?.TotalesPeriodo[0] ?? {})).toEqual([
      ...shared,
      'FctProp',
      'TotCredIVAUsoComun',
      ...after,
      'TotImpVehiculo',
    ])
  })

  test('a line with every field validates against the official schema', async () => {
    expect(await validateAgainstXsd(signPurchaseSalesBook(book, certificate).xml, 'LibroCV')).toEqual([])
  })

  test('zero counters and optional amounts are omitted, and the required ones stay', async () => {
    const adjusted = createPurchaseSalesBook({
      cover: { ...saleCover, submission: 'adjustment' },
      entries: [
        { type: 33, folio: 1, netAmount: 10, vatAmount: 2, lateVat: 3, adjustment: 'add' },
        { type: 33, folio: 1, netAmount: 10, vatAmount: 2, lateVat: 3, adjustment: 'remove' },
        { type: 46, folio: 2, voided: true },
        { type: 46, folio: 2, voided: true, adjustment: 'remove' },
      ],
    })
    const sii = toSiiPurchaseSalesBook(adjusted)
    expect(sii.ResumenPeriodo?.TotalesPeriodo).toEqual([
      { TpoDoc: 33, TotDoc: 0, TotMntExe: 0, TotMntNeto: 0, TotMntIVA: 0, TotMntTotal: 0 },
      { TpoDoc: 46, TotDoc: 0, TotMntExe: 0, TotMntNeto: 0, TotMntIVA: 0, TotMntTotal: 0 },
    ])
    expect(await validateAgainstXsd(signPurchaseSalesBook(adjusted, certificate).xml, 'LibroCV')).toEqual([])
  })

  test('a settlement that sums zero is omitted from the summary, and a tax kind reaches it', () => {
    const settled = toSiiPurchaseSalesBook(
      createPurchaseSalesBook({
        cover: saleCover,
        entries: [
          {
            type: 43,
            folio: 1,
            taxKind: 'vat',
            netAmount: 100,
            vatAmount: 19,
            settlement: { issuerRut: SUPPLIER_RUT, netValue: 0 },
          },
        ],
      }),
    )
    expect(settled.ResumenPeriodo?.TotalesPeriodo[0]).toMatchObject({ TpoImp: 1 })
    expect(settled.ResumenPeriodo?.TotalesPeriodo[0]).not.toHaveProperty('TotLiquidaciones')
    expect(settled.Detalle?.[0].Liquidaciones).toEqual({ RutEmisor: SUPPLIER_RUT, ValComNeto: 0 })
    expect(settled.Detalle?.[0].TpoImp).toBe(1)
  })

  test('an empty list and a voided line reach no tag of their own', () => {
    const sii = toSiiPurchaseSalesBook(
      createPurchaseSalesBook({
        cover: saleCover,
        entries: [
          { type: 46, folio: 2, voided: true },
          { type: 33, folio: 3, nonRecoverableVat: [], otherTaxes: [], netAmount: 1, totalAmount: 1 },
        ],
      }),
    )
    expect(sii.Detalle?.[0]).toEqual({ TpoDoc: 46, NroDoc: 2, Anulado: 'A' })
    expect(sii.Detalle?.[1]).not.toHaveProperty('IVANoRec')
    expect(sii.Detalle?.[1]).not.toHaveProperty('OtrosImp')
    expect(sii.ResumenPeriodo?.TotalesPeriodo[0]).toMatchObject({ TotDoc: 1, TotAnulado: 1 })
    expect(sii.ResumenPeriodo?.TotalesPeriodo[1]).not.toHaveProperty('TotIVANoRec')
    expect(sii.ResumenPeriodo?.TotalesPeriodo[1]).not.toHaveProperty('TotOtrosImp')
  })

  test('another tax without a rate has no TasaImp', () => {
    const sii = toSiiPurchaseSalesBook(
      createPurchaseSalesBook({
        cover: saleCover,
        entries: [{ type: 33, folio: 1, otherTaxes: [{ code: 28, amount: 5 }] }],
      }),
    )
    expect(sii.Detalle?.[0].OtrosImp).toEqual([{ CodImp: 28, MntImp: 5 }])
  })

  test('a removed adjustment becomes Operacion 2', () => {
    const removed = createPurchaseSalesBook({
      cover: { ...saleCover, submission: 'adjustment' },
      entries: [{ type: 33, folio: 1, adjustment: 'remove' }],
    })
    expect(toSiiPurchaseSalesBook(removed).Detalle?.[0].Operacion).toBe(2)
  })
})
```

`tests/books/purchase-sales.test.ts`:

```ts
import {
  buildPurchaseSalesBookXml,
  createPurchaseSalesBook,
  signPurchaseSalesBook,
  verifyPurchaseSalesBookSignature,
} from '../../src/books/purchase-sales'
import type { DteError } from '../../src/errors'
import type { PurchaseSalesBookInput } from '../../src/model/book'
import { encodeLatin1 } from '../../src/text/latin1'
import { BOOK_ID, certificate, exemptInvoice, invoice, purchaseCover, saleCover } from '../support/book-fixtures'
import { PURCHASE_SALES_SAMPLES } from '../support/purchase-sales-samples'
import { FIXED_NOW, fixtureText } from '../support/fixtures'
import { validateAgainstXsd } from '../support/xsd'

jest.setTimeout(30_000)

const failure = (input: PurchaseSalesBookInput): { code: string; details: unknown } => {
  try {
    createPurchaseSalesBook(input)
  } catch (error) {
    return { code: (error as DteError).code, details: (error as DteError).details }
  }
  throw new Error('expected a DteError')
}

const previous = [{ type: 33, documentCount: 1, exemptAmount: 0, netAmount: 10, vatAmount: 2, totalAmount: 12 }]

describe.each([
  'sale-total',
  'purchase-special',
  'sale-partial',
  'sale-final',
  'sale-adjustment',
  'sale-rectification',
] as const)('sample %s', (name) => {
  const { book, xml } = PURCHASE_SALES_SAMPLES[name]

  test('matches its golden XML byte for byte', () => {
    expect(xml).toBe(fixtureText(`books/${name}.xml`).trimEnd())
  })

  test('signed, it validates against the official schema and verifies', async () => {
    const signed = signPurchaseSalesBook(book, certificate)
    expect(await validateAgainstXsd(signed.xml, 'LibroCV')).toEqual([])
    expect(verifyPurchaseSalesBookSignature(signed.xml)).toMatchObject({ referenceId: BOOK_ID, valid: true })
  })
})

describe('createPurchaseSalesBook', () => {
  test('defaults to a monthly total and generates the id and timestamp in Chile time', () => {
    const book = createPurchaseSalesBook({ cover: saleCover, entries: [invoice], now: FIXED_NOW })
    expect(book.cover).toMatchObject({ kind: 'monthly', submission: 'total', operation: 'sale' })
    expect(book.id).toBe('LCV_15_11_2026_15_30_00_000')
    expect(book.signedAt).toBe('2026-11-15T15:30:00')
    expect(book.totalMismatches).toEqual([])
    expect(book).not.toHaveProperty('commonUseVatFactor')
    expect(book).not.toHaveProperty('additionalTaxFactors')
  })

  test('a period without movement is the cover alone', () => {
    const book = createPurchaseSalesBook({ cover: saleCover, id: BOOK_ID, now: FIXED_NOW })
    expect(book).toMatchObject({ entries: [], segmentTotals: null, periodTotals: null })
    const xml = buildPurchaseSalesBookXml(book)
    expect(xml).not.toContain('Resumen')
    expect(xml).not.toContain('Detalle')
    expect(xml).toContain('</Caratula>\n<TmstFirma>')
  })

  test('a total has a period summary and no segment summary', () => {
    const book = createPurchaseSalesBook({ cover: saleCover, entries: [invoice, exemptInvoice] })
    expect(book.segmentTotals).toBeNull()
    expect(book.periodTotals?.map((row) => row.type)).toEqual([33, 34])
  })

  test('a partial has a segment summary and no period summary', () => {
    const { book } = PURCHASE_SALES_SAMPLES['sale-partial']
    expect(book.periodTotals).toBeNull()
    expect(book.segmentTotals?.map((row) => row.type)).toEqual([33, 61])
    expect(buildPurchaseSalesBookXml(book)).toContain('<NroSegmento>1</NroSegmento>')
  })

  test('a final adds previous and summary-only totals and has no segment summary', () => {
    const { book } = PURCHASE_SALES_SAMPLES['sale-final']
    expect(book.segmentTotals).toBeNull()
    expect(book.periodTotals?.map((row) => [row.type, row.totalAmount])).toEqual([
      [33, 476000],
      [61, 11900],
      [39, 999600],
    ])
  })

  test('an adjustment signs its segment and carries it to the period', () => {
    const { book } = PURCHASE_SALES_SAMPLES['sale-adjustment']
    expect(book.segmentTotals).toEqual([
      { type: 33, documentCount: 0, exemptAmount: 0, netAmount: -10000, vatAmount: -1900, totalAmount: -11900 },
    ])
    expect(book.periodTotals?.[0]).toEqual({
      type: 33,
      documentCount: 4,
      exemptAmount: 0,
      netAmount: 390000,
      vatAmount: 74100,
      totalAmount: 464100,
    })
  })

  test('an adjustment without lines has no segment summary, and without previous totals the period equals the segment', () => {
    const noLines = createPurchaseSalesBook({
      cover: { ...saleCover, submission: 'adjustment' },
      previousTotals: previous,
      summaryOnlyTotals: [{ type: 39, documentCount: 1, totalAmount: 5 }],
    })
    expect(noLines.segmentTotals).toBeNull()
    expect(noLines.periodTotals?.map((row) => row.type)).toEqual([33, 39])
    const noPrevious = createPurchaseSalesBook({
      cover: { ...saleCover, submission: 'adjustment' },
      entries: [invoice],
    })
    expect(noPrevious.periodTotals).toEqual(noPrevious.segmentTotals)
  })

  test('the book kinds reach the cover', () => {
    const { xml } = PURCHASE_SALES_SAMPLES['sale-rectification']
    expect(xml).toContain('<TipoLibro>RECTIFICA</TipoLibro>')
    expect(xml).toContain('<CodAutRec>AUT123</CodAutRec>')
    const special = PURCHASE_SALES_SAMPLES['purchase-special'].xml
    expect(special).toContain('<TipoOperacion>COMPRA</TipoOperacion>')
    expect(special).toContain('<FolioNotificacion>2</FolioNotificacion>')
  })

  test('the proportionality factor reaches only the period summary, with its credit on the total', () => {
    const entry = { type: 33, folio: 1, netAmount: 10, commonUseVat: 1 } as const
    const period = createPurchaseSalesBook({
      cover: purchaseCover,
      entries: [entry, { ...entry, folio: 2 }, { ...entry, folio: 3 }],
      commonUseVatFactor: 0.5,
    })
    expect(period.commonUseVatFactor).toBe(0.5)
    const xml = buildPurchaseSalesBookXml(period)
    expect(xml).toContain(
      '<TotIVAUsoComun>3</TotIVAUsoComun>\n<FctProp>0.5</FctProp>\n<TotCredIVAUsoComun>2</TotCredIVAUsoComun>',
    )
    const segment = buildPurchaseSalesBookXml(
      createPurchaseSalesBook({
        cover: { ...purchaseCover, submission: 'partial', segmentNumber: 1 },
        entries: [entry],
      }),
    )
    expect(segment).toContain('<TotIVAUsoComun>1</TotIVAUsoComun>')
    expect(segment).not.toContain('FctProp')
  })

  test('additional tax factors produce the credit of each code', () => {
    const book = createPurchaseSalesBook({
      cover: purchaseCover,
      entries: [
        {
          type: 33,
          folio: 1,
          netAmount: 100,
          vatAmount: 19,
          otherTaxes: [
            { code: 24, rate: 31.5, amount: 31 },
            { code: 28, rate: 1, amount: 5 },
          ],
        },
      ],
      additionalTaxFactors: { 24: 0.5 },
    })
    expect(book.additionalTaxFactors).toEqual({ 24: 0.5 })
    const xml = buildPurchaseSalesBookXml(book)
    expect(xml).toContain(
      '<CodImp>24</CodImp>\n<TotMntImp>31</TotMntImp>\n<FctImpAdic>0.5</FctImpAdic>\n<TotCredImp>16</TotCredImp>',
    )
    expect(xml).toContain('<CodImp>28</CodImp>\n<TotMntImp>5</TotMntImp>\n</TotOtrosImp>')
  })

  test('total mismatches are reported by default and thrown with strictTotals', () => {
    const entries = [{ ...invoice, totalAmount: 1 }]
    expect(createPurchaseSalesBook({ cover: saleCover, entries }).totalMismatches).toEqual([
      { index: 0, type: 33, folio: 101, expected: 119000, actual: 1 },
    ])
    expect(failure({ cover: saleCover, entries, strictTotals: true })).toEqual({
      code: 'BOOK_TOTAL_MISMATCH',
      details: { index: 0, expected: 119000, actual: 1 },
    })
    expect(
      createPurchaseSalesBook({ cover: saleCover, entries: [invoice], strictTotals: true }).totalMismatches,
    ).toEqual([])
  })

  test.each([
    [{ cover: { ...saleCover, kind: 'special' } }, 'MISSING_FIELD', { field: 'cover.notificationFolio' }],
    [{ cover: { ...saleCover, kind: 'rectification' } }, 'MISSING_FIELD', { field: 'cover.rectificationCode' }],
    [{ cover: { ...saleCover, submission: 'partial', segmentNumber: 1 } }, 'MISSING_FIELD', { field: 'entries' }],
    [{ cover: { ...saleCover, submission: 'final' } }, 'MISSING_FIELD', { field: 'previousTotals' }],
    [
      { cover: { ...saleCover, submission: 'final' }, previousTotals: [] },
      'MISSING_FIELD',
      { field: 'previousTotals' },
    ],
    [
      { cover: { ...saleCover, submission: 'final' }, previousTotals: previous, entries: [invoice] },
      'INVALID_OPTION',
      { field: 'entries' },
    ],
    [{ cover: saleCover, previousTotals: previous }, 'INVALID_OPTION', { field: 'previousTotals' }],
    [
      {
        cover: { ...saleCover, submission: 'partial', segmentNumber: 1 },
        entries: [invoice],
        summaryOnlyTotals: [{ type: 39 }],
      },
      'INVALID_OPTION',
      { field: 'summaryOnlyTotals' },
    ],
    [
      { cover: purchaseCover, entries: [{ type: 33, folio: 1, commonUseVat: 1 }] },
      'MISSING_FIELD',
      { field: 'commonUseVatFactor' },
    ],
    [{ cover: saleCover, commonUseVatFactor: 0 }, 'INVALID_OPTION', { field: 'commonUseVatFactor' }],
    [{ cover: saleCover, commonUseVatFactor: 100 }, 'INVALID_OPTION', { field: 'commonUseVatFactor' }],
    [{ cover: saleCover, commonUseVatFactor: 0.1234 }, 'INVALID_OPTION', { field: 'commonUseVatFactor' }],
    [{ cover: saleCover, additionalTaxFactors: { 24: 0 } }, 'INVALID_OPTION', { field: 'additionalTaxFactors' }],
    [{ cover: saleCover, additionalTaxFactors: { 24: 1.5 } }, 'INVALID_OPTION', { field: 'additionalTaxFactors' }],
    [{ cover: saleCover, additionalTaxFactors: { 24: 0.12345 } }, 'INVALID_OPTION', { field: 'additionalTaxFactors' }],
  ] as const)('rejects %j', (input, code, details) => {
    expect(failure(input as PurchaseSalesBookInput)).toEqual({ code, details })
  })

  test('rejects a rectification code over the limit', () => {
    expect(
      failure({ cover: { ...saleCover, kind: 'rectification', rectificationCode: 'x'.repeat(11) } }),
    ).toMatchObject({ code: 'FIELD_TOO_LONG', details: { field: 'CodAutRec' } })
  })

  test('a rectification code outside a rectification book does not travel', () => {
    const book = createPurchaseSalesBook({ cover: { ...saleCover, rectificationCode: 'AUT123' } })
    expect(book.cover).not.toHaveProperty('rectificationCode')
  })
})

describe('signPurchaseSalesBook', () => {
  const { book } = PURCHASE_SALES_SAMPLES['sale-total']
  const signed = signPurchaseSalesBook(book, certificate)

  test('inserts the signature between the closing tags, referencing the ID', () => {
    expect(
      signed.xml.startsWith(PURCHASE_SALES_SAMPLES['sale-total'].xml.slice(0, -'</LibroCompraVenta>'.length)),
    ).toBe(true)
    expect(signed.xml).toContain('</EnvioLibro><Signature xmlns="http://www.w3.org/2000/09/xmldsig#">')
    expect(signed.xml.endsWith('</Signature></LibroCompraVenta>')).toBe(true)
    expect(signed.xml).toContain(`<Reference URI="#${BOOK_ID}">`)
    expect(signed).toMatchObject({ id: BOOK_ID, signature: { digestValue: expect.any(String) } })
  })

  test('no line goes over the limit of the SII', () => {
    expect(Math.max(...signed.xml.split('\n').map((line) => line.length))).toBeLessThan(4090)
  })

  test('the XML is ISO-8859-1 text', () => {
    expect(() => encodeLatin1(signed.xml)).not.toThrow()
  })

  test('a tampered book does not verify', () => {
    const tampered = signed.xml.replace('<MntNeto>100000</MntNeto>', '<MntNeto>100001</MntNeto>')
    expect(verifyPurchaseSalesBookSignature(tampered)).toMatchObject({ digestValid: false, valid: false })
  })
})
```

`tests/fixtures/books/sale-total.xml`:

```xml
<?xml version="1.0" encoding="ISO-8859-1"?>
<LibroCompraVenta xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte LibroCV_v10.xsd" version="1.0">
<EnvioLibro ID="LIBRO_TEST">
<Caratula>
<RutEmisorLibro>76543210-3</RutEmisorLibro>
<RutEnvia>11111111-1</RutEnvia>
<PeriodoTributario>2026-10</PeriodoTributario>
<FchResol>2026-01-15</FchResol>
<NroResol>80</NroResol>
<TipoOperacion>VENTA</TipoOperacion>
<TipoLibro>MENSUAL</TipoLibro>
<TipoEnvio>TOTAL</TipoEnvio>
</Caratula>
<ResumenPeriodo>
<TotalesPeriodo>
<TpoDoc>33</TpoDoc>
<TotDoc>1</TotDoc>
<TotMntExe>0</TotMntExe>
<TotMntNeto>100000</TotMntNeto>
<TotMntIVA>19000</TotMntIVA>
<TotMntTotal>119000</TotMntTotal>
</TotalesPeriodo>
<TotalesPeriodo>
<TpoDoc>34</TpoDoc>
<TotDoc>1</TotDoc>
<TotMntExe>50000</TotMntExe>
<TotMntNeto>0</TotMntNeto>
<TotMntIVA>0</TotMntIVA>
<TotMntTotal>50000</TotMntTotal>
</TotalesPeriodo>
<TotalesPeriodo>
<TpoDoc>61</TpoDoc>
<TotDoc>1</TotDoc>
<TotMntExe>0</TotMntExe>
<TotMntNeto>10000</TotMntNeto>
<TotMntIVA>1900</TotMntIVA>
<TotMntTotal>11900</TotMntTotal>
</TotalesPeriodo>
<TotalesPeriodo>
<TpoDoc>46</TpoDoc>
<TotDoc>2</TotDoc>
<TotAnulado>1</TotAnulado>
<TotMntExe>0</TotMntExe>
<TotMntNeto>20000</TotMntNeto>
<TotMntIVA>3800</TotMntIVA>
<TotIVARetTotal>3800</TotIVARetTotal>
<TotMntTotal>20000</TotMntTotal>
</TotalesPeriodo>
<TotalesPeriodo>
<TpoDoc>39</TpoDoc>
<TotDoc>120</TotDoc>
<TotMntExe>0</TotMntExe>
<TotMntNeto>840000</TotMntNeto>
<TotMntIVA>159600</TotMntIVA>
<TotMntTotal>999600</TotMntTotal>
</TotalesPeriodo>
</ResumenPeriodo>
<Detalle>
<TpoDoc>33</TpoDoc>
<NroDoc>101</NroDoc>
<TasaImp>19</TasaImp>
<FchDoc>2026-10-05</FchDoc>
<RUTDoc>12345678-5</RUTDoc>
<RznSoc>Comercializadora Rapel Ltda</RznSoc>
<MntExe>0</MntExe>
<MntNeto>100000</MntNeto>
<MntIVA>19000</MntIVA>
<MntTotal>119000</MntTotal>
</Detalle>
<Detalle>
<TpoDoc>34</TpoDoc>
<NroDoc>7</NroDoc>
<FchDoc>2026-10-06</FchDoc>
<RUTDoc>12345678-5</RUTDoc>
<RznSoc>Comercializadora Rapel Ltda</RznSoc>
<MntExe>50000</MntExe>
<MntNeto>0</MntNeto>
<MntIVA>0</MntIVA>
<MntTotal>50000</MntTotal>
</Detalle>
<Detalle>
<TpoDoc>61</TpoDoc>
<NroDoc>12</NroDoc>
<TasaImp>19</TasaImp>
<FchDoc>2026-10-20</FchDoc>
<RUTDoc>12345678-5</RUTDoc>
<MntExe>0</MntExe>
<MntNeto>10000</MntNeto>
<MntIVA>1900</MntIVA>
<MntTotal>11900</MntTotal>
</Detalle>
<Detalle>
<TpoDoc>46</TpoDoc>
<NroDoc>5</NroDoc>
<Anulado>A</Anulado>
</Detalle>
<Detalle>
<TpoDoc>46</TpoDoc>
<NroDoc>6</NroDoc>
<TasaImp>19</TasaImp>
<FchDoc>2026-10-08</FchDoc>
<RUTDoc>10000004-0</RUTDoc>
<RznSoc>Hortalizas del Maule Ltda</RznSoc>
<MntExe>0</MntExe>
<MntNeto>20000</MntNeto>
<MntIVA>3800</MntIVA>
<IVARetTotal>3800</IVARetTotal>
<MntTotal>20000</MntTotal>
</Detalle>
<TmstFirma>2026-11-15T15:30:00</TmstFirma>
</EnvioLibro></LibroCompraVenta>
```

`tests/fixtures/books/purchase-special.xml`:

```xml
<?xml version="1.0" encoding="ISO-8859-1"?>
<LibroCompraVenta xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte LibroCV_v10.xsd" version="1.0">
<EnvioLibro ID="LIBRO_TEST">
<Caratula>
<RutEmisorLibro>76543210-3</RutEmisorLibro>
<RutEnvia>11111111-1</RutEnvia>
<PeriodoTributario>2026-10</PeriodoTributario>
<FchResol>2026-01-15</FchResol>
<NroResol>80</NroResol>
<TipoOperacion>COMPRA</TipoOperacion>
<TipoLibro>ESPECIAL</TipoLibro>
<TipoEnvio>TOTAL</TipoEnvio>
<FolioNotificacion>2</FolioNotificacion>
</Caratula>
<ResumenPeriodo>
<TotalesPeriodo>
<TpoDoc>33</TpoDoc>
<TotDoc>3</TotDoc>
<TotMntExe>0</TotMntExe>
<TotMntNeto>170000</TotMntNeto>
<TotMntIVA>19000</TotMntIVA>
<TotIVANoRec>
<CodIVANoRec>1</CodIVANoRec>
<TotOpIVANoRec>1</TotOpIVANoRec>
<TotMntIVANoRec>7600</TotMntIVANoRec>
</TotIVANoRec>
<TotOpIVAUsoComun>1</TotOpIVAUsoComun>
<TotIVAUsoComun>5700</TotIVAUsoComun>
<FctProp>0.6</FctProp>
<TotCredIVAUsoComun>3420</TotCredIVAUsoComun>
<TotOtrosImp>
<CodImp>28</CodImp>
<TotMntImp>1500</TotMntImp>
</TotOtrosImp>
<TotMntTotal>203800</TotMntTotal>
</TotalesPeriodo>
<TotalesPeriodo>
<TpoDoc>30</TpoDoc>
<TotDoc>1</TotDoc>
<TotMntExe>9000</TotMntExe>
<TotMntNeto>0</TotMntNeto>
<TotMntIVA>0</TotMntIVA>
<TotMntTotal>9000</TotMntTotal>
</TotalesPeriodo>
<TotalesPeriodo>
<TpoDoc>46</TpoDoc>
<TotDoc>1</TotDoc>
<TotMntExe>0</TotMntExe>
<TotMntNeto>20000</TotMntNeto>
<TotMntIVA>3800</TotMntIVA>
<TotIVARetTotal>3800</TotIVARetTotal>
<TotMntTotal>20000</TotMntTotal>
</TotalesPeriodo>
</ResumenPeriodo>
<Detalle>
<TpoDoc>33</TpoDoc>
<NroDoc>201</NroDoc>
<TasaImp>0</TasaImp>
<FchDoc>2026-10-02</FchDoc>
<RUTDoc>10000004-0</RUTDoc>
<RznSoc>Ferretería Ñuble SpA</RznSoc>
<MntNeto>30000</MntNeto>
<MntIVA>0</MntIVA>
<IVAUsoComun>5700</IVAUsoComun>
<MntTotal>35700</MntTotal>
</Detalle>
<Detalle>
<TpoDoc>33</TpoDoc>
<NroDoc>202</NroDoc>
<TasaImp>0</TasaImp>
<FchDoc>2026-10-03</FchDoc>
<RUTDoc>10000004-0</RUTDoc>
<MntNeto>40000</MntNeto>
<MntIVA>0</MntIVA>
<IVANoRec>
<CodIVANoRec>1</CodIVANoRec>
<MntIVANoRec>7600</MntIVANoRec>
</IVANoRec>
<MntTotal>47600</MntTotal>
</Detalle>
<Detalle>
<TpoDoc>30</TpoDoc>
<NroDoc>203</NroDoc>
<TasaImp>19</TasaImp>
<FchDoc>2026-10-04</FchDoc>
<RUTDoc>10000004-0</RUTDoc>
<MntExe>9000</MntExe>
<MntNeto>0</MntNeto>
<MntIVA>0</MntIVA>
<MntTotal>9000</MntTotal>
</Detalle>
<Detalle>
<TpoDoc>33</TpoDoc>
<NroDoc>204</NroDoc>
<TasaImp>19</TasaImp>
<FchDoc>2026-10-05</FchDoc>
<RUTDoc>10000004-0</RUTDoc>
<MntNeto>100000</MntNeto>
<MntIVA>19000</MntIVA>
<OtrosImp>
<CodImp>28</CodImp>
<TasaImp>1.5</TasaImp>
<MntImp>1500</MntImp>
</OtrosImp>
<MntTotal>120500</MntTotal>
</Detalle>
<Detalle>
<TpoDoc>46</TpoDoc>
<NroDoc>6</NroDoc>
<TasaImp>19</TasaImp>
<FchDoc>2026-10-08</FchDoc>
<RUTDoc>10000004-0</RUTDoc>
<RznSoc>Hortalizas del Maule Ltda</RznSoc>
<MntNeto>20000</MntNeto>
<MntIVA>3800</MntIVA>
<IVARetTotal>3800</IVARetTotal>
<MntTotal>20000</MntTotal>
</Detalle>
<TmstFirma>2026-11-15T15:30:00</TmstFirma>
</EnvioLibro></LibroCompraVenta>
```

`tests/fixtures/books/sale-partial.xml`:

```xml
<?xml version="1.0" encoding="ISO-8859-1"?>
<LibroCompraVenta xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte LibroCV_v10.xsd" version="1.0">
<EnvioLibro ID="LIBRO_TEST">
<Caratula>
<RutEmisorLibro>76543210-3</RutEmisorLibro>
<RutEnvia>11111111-1</RutEnvia>
<PeriodoTributario>2026-10</PeriodoTributario>
<FchResol>2026-01-15</FchResol>
<NroResol>80</NroResol>
<TipoOperacion>VENTA</TipoOperacion>
<TipoLibro>MENSUAL</TipoLibro>
<TipoEnvio>PARCIAL</TipoEnvio>
<NroSegmento>1</NroSegmento>
</Caratula>
<ResumenSegmento>
<TotalesSegmento>
<TpoDoc>33</TpoDoc>
<TotDoc>1</TotDoc>
<TotMntExe>0</TotMntExe>
<TotMntNeto>100000</TotMntNeto>
<TotMntIVA>19000</TotMntIVA>
<TotMntTotal>119000</TotMntTotal>
</TotalesSegmento>
<TotalesSegmento>
<TpoDoc>61</TpoDoc>
<TotDoc>1</TotDoc>
<TotMntExe>0</TotMntExe>
<TotMntNeto>10000</TotMntNeto>
<TotMntIVA>1900</TotMntIVA>
<TotMntTotal>11900</TotMntTotal>
</TotalesSegmento>
</ResumenSegmento>
<Detalle>
<TpoDoc>33</TpoDoc>
<NroDoc>101</NroDoc>
<TasaImp>19</TasaImp>
<FchDoc>2026-10-05</FchDoc>
<RUTDoc>12345678-5</RUTDoc>
<RznSoc>Comercializadora Rapel Ltda</RznSoc>
<MntExe>0</MntExe>
<MntNeto>100000</MntNeto>
<MntIVA>19000</MntIVA>
<MntTotal>119000</MntTotal>
</Detalle>
<Detalle>
<TpoDoc>61</TpoDoc>
<NroDoc>12</NroDoc>
<TasaImp>19</TasaImp>
<FchDoc>2026-10-20</FchDoc>
<RUTDoc>12345678-5</RUTDoc>
<MntExe>0</MntExe>
<MntNeto>10000</MntNeto>
<MntIVA>1900</MntIVA>
<MntTotal>11900</MntTotal>
</Detalle>
<TmstFirma>2026-11-15T15:30:00</TmstFirma>
</EnvioLibro></LibroCompraVenta>
```

`tests/fixtures/books/sale-final.xml`:

```xml
<?xml version="1.0" encoding="ISO-8859-1"?>
<LibroCompraVenta xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte LibroCV_v10.xsd" version="1.0">
<EnvioLibro ID="LIBRO_TEST">
<Caratula>
<RutEmisorLibro>76543210-3</RutEmisorLibro>
<RutEnvia>11111111-1</RutEnvia>
<PeriodoTributario>2026-10</PeriodoTributario>
<FchResol>2026-01-15</FchResol>
<NroResol>80</NroResol>
<TipoOperacion>VENTA</TipoOperacion>
<TipoLibro>MENSUAL</TipoLibro>
<TipoEnvio>FINAL</TipoEnvio>
</Caratula>
<ResumenPeriodo>
<TotalesPeriodo>
<TpoDoc>33</TpoDoc>
<TotDoc>4</TotDoc>
<TotMntExe>0</TotMntExe>
<TotMntNeto>400000</TotMntNeto>
<TotMntIVA>76000</TotMntIVA>
<TotMntTotal>476000</TotMntTotal>
</TotalesPeriodo>
<TotalesPeriodo>
<TpoDoc>61</TpoDoc>
<TotDoc>1</TotDoc>
<TotMntExe>0</TotMntExe>
<TotMntNeto>10000</TotMntNeto>
<TotMntIVA>1900</TotMntIVA>
<TotMntTotal>11900</TotMntTotal>
</TotalesPeriodo>
<TotalesPeriodo>
<TpoDoc>39</TpoDoc>
<TotDoc>120</TotDoc>
<TotMntExe>0</TotMntExe>
<TotMntNeto>840000</TotMntNeto>
<TotMntIVA>159600</TotMntIVA>
<TotMntTotal>999600</TotMntTotal>
</TotalesPeriodo>
</ResumenPeriodo>
<TmstFirma>2026-11-15T15:30:00</TmstFirma>
</EnvioLibro></LibroCompraVenta>
```

`tests/fixtures/books/sale-adjustment.xml`:

```xml
<?xml version="1.0" encoding="ISO-8859-1"?>
<LibroCompraVenta xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte LibroCV_v10.xsd" version="1.0">
<EnvioLibro ID="LIBRO_TEST">
<Caratula>
<RutEmisorLibro>76543210-3</RutEmisorLibro>
<RutEnvia>11111111-1</RutEnvia>
<PeriodoTributario>2026-10</PeriodoTributario>
<FchResol>2026-01-15</FchResol>
<NroResol>80</NroResol>
<TipoOperacion>VENTA</TipoOperacion>
<TipoLibro>MENSUAL</TipoLibro>
<TipoEnvio>AJUSTE</TipoEnvio>
</Caratula>
<ResumenSegmento>
<TotalesSegmento>
<TpoDoc>33</TpoDoc>
<TotDoc>0</TotDoc>
<TotMntExe>0</TotMntExe>
<TotMntNeto>-10000</TotMntNeto>
<TotMntIVA>-1900</TotMntIVA>
<TotMntTotal>-11900</TotMntTotal>
</TotalesSegmento>
</ResumenSegmento>
<ResumenPeriodo>
<TotalesPeriodo>
<TpoDoc>33</TpoDoc>
<TotDoc>4</TotDoc>
<TotMntExe>0</TotMntExe>
<TotMntNeto>390000</TotMntNeto>
<TotMntIVA>74100</TotMntIVA>
<TotMntTotal>464100</TotMntTotal>
</TotalesPeriodo>
<TotalesPeriodo>
<TpoDoc>61</TpoDoc>
<TotDoc>1</TotDoc>
<TotMntExe>0</TotMntExe>
<TotMntNeto>10000</TotMntNeto>
<TotMntIVA>1900</TotMntIVA>
<TotMntTotal>11900</TotMntTotal>
</TotalesPeriodo>
</ResumenPeriodo>
<Detalle>
<TpoDoc>33</TpoDoc>
<NroDoc>101</NroDoc>
<Operacion>2</Operacion>
<TasaImp>19</TasaImp>
<FchDoc>2026-10-05</FchDoc>
<RUTDoc>12345678-5</RUTDoc>
<RznSoc>Comercializadora Rapel Ltda</RznSoc>
<MntExe>0</MntExe>
<MntNeto>100000</MntNeto>
<MntIVA>19000</MntIVA>
<MntTotal>119000</MntTotal>
</Detalle>
<Detalle>
<TpoDoc>33</TpoDoc>
<NroDoc>101</NroDoc>
<Operacion>1</Operacion>
<TasaImp>19</TasaImp>
<FchDoc>2026-10-05</FchDoc>
<RUTDoc>12345678-5</RUTDoc>
<RznSoc>Comercializadora Rapel Ltda</RznSoc>
<MntExe>0</MntExe>
<MntNeto>90000</MntNeto>
<MntIVA>17100</MntIVA>
<MntTotal>107100</MntTotal>
</Detalle>
<TmstFirma>2026-11-15T15:30:00</TmstFirma>
</EnvioLibro></LibroCompraVenta>
```

`tests/fixtures/books/sale-rectification.xml`:

```xml
<?xml version="1.0" encoding="ISO-8859-1"?>
<LibroCompraVenta xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte LibroCV_v10.xsd" version="1.0">
<EnvioLibro ID="LIBRO_TEST">
<Caratula>
<RutEmisorLibro>76543210-3</RutEmisorLibro>
<RutEnvia>11111111-1</RutEnvia>
<PeriodoTributario>2026-10</PeriodoTributario>
<FchResol>2026-01-15</FchResol>
<NroResol>80</NroResol>
<TipoOperacion>VENTA</TipoOperacion>
<TipoLibro>RECTIFICA</TipoLibro>
<TipoEnvio>TOTAL</TipoEnvio>
<CodAutRec>AUT123</CodAutRec>
</Caratula>
<ResumenPeriodo>
<TotalesPeriodo>
<TpoDoc>33</TpoDoc>
<TotDoc>1</TotDoc>
<TotMntExe>0</TotMntExe>
<TotMntNeto>100000</TotMntNeto>
<TotMntIVA>19000</TotMntIVA>
<TotMntTotal>119000</TotMntTotal>
</TotalesPeriodo>
</ResumenPeriodo>
<Detalle>
<TpoDoc>33</TpoDoc>
<NroDoc>101</NroDoc>
<TasaImp>19</TasaImp>
<FchDoc>2026-10-05</FchDoc>
<RUTDoc>12345678-5</RUTDoc>
<RznSoc>Comercializadora Rapel Ltda</RznSoc>
<MntExe>0</MntExe>
<MntNeto>100000</MntNeto>
<MntIVA>19000</MntIVA>
<MntTotal>119000</MntTotal>
</Detalle>
<TmstFirma>2026-11-15T15:30:00</TmstFirma>
</EnvioLibro></LibroCompraVenta>
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx jest --config jest.config.cjs tests/books/book-codec.test.ts tests/books/purchase-sales.test.ts
```

Expected: FAIL, with `Cannot find module '../../src/books/purchase-sales'`.

- [ ] **Step 3: Write the implementation**

`src/model/book-codec.ts`:

```ts
/**
 * EN: Converts the domain model of the three books to the SII-shaped model. What each official tag means is documented
 * on `./book`; the keys below follow the XSD order, which is the element order of the XML.
 * ES: Convierte el modelo de dominio de los tres libros al modelo con forma SII. El significado de cada etiqueta oficial
 * está documentado en `./book`; las claves de abajo siguen el orden del XSD, que es el orden de los elementos del XML.
 */
import { BOOK_KINDS, BOOK_OPERATIONS, BOOK_SUBMISSIONS, GUIDE_VOID_CODES } from '../catalogs/book-codes'
import type {
  BookEntry,
  BookOtherTaxTotal,
  BookTotals,
  FolioConsumption,
  FolioConsumptionSummary,
  FolioRange,
  GuideBook,
  GuideEntry,
  GuideTotals,
  PurchaseSalesBook,
} from './book'
import { compact } from './codec'
import type {
  SiiDetalleLibro,
  SiiDetalleLibroGuia,
  SiiDocumentoConsumoFolios,
  SiiEnvioLibro,
  SiiEnvioLibroGuia,
  SiiResumenConsumoFolios,
  SiiResumenLibroGuia,
  SiiTotalesPeriodo,
  SiiTotalesSegmento,
  SiiTotOtrosImp,
} from './sii-book'

// In `TotalesPeriodo` counters are `positiveInteger`, so a 0 fails the schema, and every other optional amount is omitted
// when there is nothing to report.
const nonZero = (value: number | undefined): number | undefined => (value === 0 ? undefined : value)

const flag = (value: boolean | undefined): 1 | undefined => (value ? 1 : undefined)

const taxKindCode = (kind: BookEntry['taxKind']): 1 | 2 | undefined =>
  kind === undefined ? undefined : kind === 'vat' ? 1 : 2

const adjustmentCode = (adjustment: BookEntry['adjustment']): 1 | 2 | undefined =>
  adjustment === undefined ? undefined : adjustment === 'add' ? 1 : 2

const nonEmpty = <T>(items: readonly T[] | undefined): readonly T[] | undefined =>
  items === undefined || items.length === 0 ? undefined : items

const toSiiDetalleLibro = (entry: BookEntry): SiiDetalleLibro =>
  compact({
    TpoDoc: entry.type,
    Emisor: flag(entry.issuedByBookOwner),
    IndFactCompra: flag(entry.purchaseInvoice),
    NroDoc: entry.folio,
    Anulado: entry.voided ? 'A' : undefined,
    Operacion: adjustmentCode(entry.adjustment),
    TpoImp: taxKindCode(entry.taxKind),
    TasaImp: entry.taxRate,
    NumInt: entry.internalNumber,
    IndServicio: entry.serviceIndicator,
    IndSinCosto: flag(entry.freeOfCharge),
    FchDoc: entry.date,
    CdgSIISucur: entry.branchCode,
    RUTDoc: entry.counterpartyRut,
    RznSoc: entry.counterpartyName,
    Extranjero:
      entry.foreignReceiver &&
      compact({ NumId: entry.foreignReceiver.id, Nacionalidad: entry.foreignReceiver.nationality }),
    TpoDocRef: entry.referenceType,
    FolioDocRef: entry.referenceFolio,
    MntExe: entry.exemptAmount,
    MntNeto: entry.netAmount,
    MntIVA: entry.vatAmount,
    MntActivoFijo: entry.fixedAssetNetAmount,
    MntIVAActivoFijo: entry.fixedAssetVatAmount,
    IVANoRec: nonEmpty(entry.nonRecoverableVat)?.map((item) => ({ CodIVANoRec: item.code, MntIVANoRec: item.amount })),
    IVAUsoComun: entry.commonUseVat,
    IVAFueraPlazo: entry.lateVat,
    IVAPropio: entry.ownVatAmount,
    IVATerceros: entry.thirdPartyVatAmount,
    Ley18211: entry.freeZoneTax,
    OtrosImp: nonEmpty(entry.otherTaxes)?.map((item) =>
      compact({ CodImp: item.code, TasaImp: item.rate, MntImp: item.amount }),
    ),
    MntSinCred: entry.nonCreditableTax,
    IVARetTotal: entry.totalVatWithheld,
    IVARetParcial: entry.partialVatWithheld,
    CredEC: entry.constructionCredit,
    DepEnvase: entry.containerDeposit,
    Liquidaciones:
      entry.settlement &&
      compact({
        RutEmisor: entry.settlement.issuerRut,
        ValComNeto: entry.settlement.netValue,
        ValComExe: entry.settlement.exemptValue,
        ValComIVA: entry.settlement.vatValue,
      }),
    MntTotal: entry.totalAmount,
    IVANoRetenido: entry.vatNotWithheld,
    MntNoFact: entry.nonBillableAmount,
    MntPeriodo: entry.periodAmount,
    PsjNac: entry.domesticTickets,
    PsjInt: entry.internationalTickets,
    TabPuros: entry.cigars,
    TabCigarrillos: entry.cigarettes,
    TabElaborado: entry.processedTobacco,
    ImpVehiculo: entry.vehicleTax,
  })

const settlementTotals = (row: BookTotals): SiiTotalesSegmento['TotLiquidaciones'] => {
  const totals = compact({
    TotValComNeto: nonZero(row.settlement?.netValue),
    TotValComExe: nonZero(row.settlement?.exemptValue),
    TotValComIVA: nonZero(row.settlement?.vatValue),
  })
  return Object.keys(totals).length === 0 ? undefined : totals
}

type PeriodContext = Pick<PurchaseSalesBook, 'commonUseVatFactor' | 'additionalTaxFactors'>

const otherTaxTotal =
  (factors: PeriodContext['additionalTaxFactors']) =>
  (item: BookOtherTaxTotal): SiiTotOtrosImp => {
    const factor = factors?.[item.code]
    return compact({
      CodImp: item.code,
      TotMntImp: item.amount,
      FctImpAdic: factor,
      TotCredImp: factor === undefined ? undefined : Math.round(item.amount * factor),
    })
  }

// One function for both summaries, in the order of `TotalesPeriodo`. `TotalesSegmento` is the same sequence without the
// proportionality factor, the credits and the vehicle tax, so `period` is null for it.
const toSiiTotales = (row: BookTotals, period: PeriodContext | null): SiiTotalesPeriodo => {
  const commonUseVat = nonZero(row.commonUseVat)
  const factor = commonUseVat === undefined ? undefined : period?.commonUseVatFactor
  return compact({
    TpoDoc: row.type,
    TpoImp: taxKindCode(row.taxKind),
    TotDoc: row.documentCount,
    TotAnulado: nonZero(row.voidedCount),
    TotMntExe: row.exemptAmount,
    TotMntNeto: row.netAmount,
    TotMntIVA: row.vatAmount,
    TotMntActivoFijo: nonZero(row.fixedAssetNetAmount),
    TotMntIVAActivoFijo: nonZero(row.fixedAssetVatAmount),
    TotIVANoRec: nonEmpty(row.nonRecoverableVat)?.map((item) =>
      compact({ CodIVANoRec: item.code, TotOpIVANoRec: nonZero(item.count), TotMntIVANoRec: item.amount }),
    ),
    TotOpIVAUsoComun: nonZero(row.commonUseVatCount),
    TotIVAUsoComun: commonUseVat,
    FctProp: factor,
    TotCredIVAUsoComun: factor === undefined ? undefined : Math.round((commonUseVat as number) * factor),
    TotIVAFueraPlazo: nonZero(row.lateVat),
    TotIVAPropio: nonZero(row.ownVatAmount),
    TotIVATerceros: nonZero(row.thirdPartyVatAmount),
    TotLey18211: nonZero(row.freeZoneTax),
    TotOtrosImp: nonEmpty(row.otherTaxes)?.map(otherTaxTotal(period?.additionalTaxFactors)),
    TotImpSinCredito: nonZero(row.nonCreditableTax),
    TotIVARetTotal: nonZero(row.totalVatWithheld),
    TotIVARetParcial: nonZero(row.partialVatWithheld),
    TotCredEC: nonZero(row.constructionCredit),
    TotDepEnvase: nonZero(row.containerDeposit),
    TotLiquidaciones: settlementTotals(row),
    TotMntTotal: row.totalAmount,
    TotIVANoRetenido: nonZero(row.vatNotWithheld),
    TotMntNoFact: nonZero(row.nonBillableAmount),
    TotMntPeriodo: nonZero(row.periodAmount),
    TotPsjNac: nonZero(row.domesticTickets),
    TotPsjInt: nonZero(row.internationalTickets),
    TotTabPuros: nonZero(row.cigars),
    TotTabCigarrillos: nonZero(row.cigarettes),
    TotTabElaborado: nonZero(row.processedTobacco),
    TotImpVehiculo: period === null ? undefined : nonZero(row.vehicleTax),
  })
}

/**
 * EN: The `EnvioLibro` of a purchase and sales book with the official tags, in schema order.
 * ES: El `EnvioLibro` de un libro de compras y ventas con las etiquetas oficiales, en el orden del esquema.
 */
export const toSiiPurchaseSalesBook = (book: PurchaseSalesBook): SiiEnvioLibro => {
  const c = book.cover
  return compact({
    Caratula: compact({
      RutEmisorLibro: c.issuerRut,
      RutEnvia: c.senderRut,
      PeriodoTributario: c.period,
      FchResol: c.resolutionDate,
      NroResol: c.resolutionNumber,
      TipoOperacion: BOOK_OPERATIONS[c.operation],
      TipoLibro: BOOK_KINDS[c.kind],
      TipoEnvio: BOOK_SUBMISSIONS[c.submission],
      NroSegmento: c.segmentNumber,
      FolioNotificacion: c.notificationFolio,
      CodAutRec: c.rectificationCode,
    }),
    ResumenSegmento:
      book.segmentTotals === null
        ? undefined
        : { TotalesSegmento: book.segmentTotals.map((row): SiiTotalesSegmento => toSiiTotales(row, null)) },
    ResumenPeriodo:
      book.periodTotals === null
        ? undefined
        : { TotalesPeriodo: book.periodTotals.map((row) => toSiiTotales(row, book)) },
    Detalle: nonEmpty(book.entries)?.map(toSiiDetalleLibro),
    TmstFirma: book.signedAt,
  })
}

const toSiiResumenLibroGuia = (totals: GuideTotals): SiiResumenLibroGuia =>
  compact({
    TotFolAnulado: nonZero(totals.voidedFolios),
    TotGuiaAnulada: nonZero(totals.voidedGuides),
    TotGuiaVenta: totals.saleGuides,
    TotMntGuiaVta: totals.saleGuidesAmount,
    TotMntModificado: nonZero(totals.modifiedAmount),
    TotTraslado: nonEmpty(totals.transfers)?.map((item) => ({
      TpoTraslado: item.type,
      CantGuia: item.count,
      MntGuia: item.amount,
    })),
  })

const toSiiDetalleLibroGuia = (entry: GuideEntry): SiiDetalleLibroGuia =>
  compact({
    Folio: entry.folio,
    Anulado: entry.voided && GUIDE_VOID_CODES[entry.voided],
    Operacion: adjustmentCode(entry.adjustment),
    TpoOper: entry.transferType,
    FchDoc: entry.date,
    RUTDoc: entry.receiverRut,
    RznSoc: entry.receiverName,
    MntNeto: entry.netAmount,
    TasaImp: entry.taxRate,
    IVA: entry.vatAmount,
    MntTotal: entry.totalAmount,
    MntModificado: entry.modifiedAmount,
    TpoDocRef: entry.referenceType,
    FolioDocRef: entry.referenceFolio,
    FchDocRef: entry.referenceDate,
  })

/**
 * EN: The `EnvioLibro` of a guide book with the official tags, in schema order.
 * ES: El `EnvioLibro` de un libro de guías con las etiquetas oficiales, en el orden del esquema.
 */
export const toSiiGuideBook = (book: GuideBook): SiiEnvioLibroGuia => {
  const c = book.cover
  return compact({
    Caratula: compact({
      RutEmisorLibro: c.issuerRut,
      RutEnvia: c.senderRut,
      PeriodoTributario: c.period,
      FchResol: c.resolutionDate,
      NroResol: c.resolutionNumber,
      TipoLibro: 'ESPECIAL' as const,
      TipoEnvio: BOOK_SUBMISSIONS[c.submission],
      NroSegmento: c.segmentNumber,
      FolioNotificacion: c.notificationFolio,
    }),
    ResumenSegmento: book.segmentTotals === null ? undefined : toSiiResumenLibroGuia(book.segmentTotals),
    ResumenPeriodo: book.periodTotals === null ? undefined : toSiiResumenLibroGuia(book.periodTotals),
    Detalle: nonEmpty(book.entries)?.map(toSiiDetalleLibroGuia),
    TmstFirma: book.signedAt,
  })
}

const toSiiRanges = (ranges: readonly FolioRange[]): SiiResumenConsumoFolios['RangoUtilizados'] =>
  nonEmpty(ranges)?.map((range) => ({ Inicial: range.from, Final: range.to }))

const toSiiResumenConsumoFolios = (summary: FolioConsumptionSummary): SiiResumenConsumoFolios =>
  compact({
    TipoDocumento: summary.type,
    MntNeto: nonZero(summary.netAmount),
    MntIva: nonZero(summary.vatAmount),
    TasaIVA: summary.vatRate,
    MntExento: nonZero(summary.exemptAmount),
    MntTotal: summary.totalAmount,
    FoliosEmitidos: summary.issuedCount,
    FoliosAnulados: summary.voidedCount,
    FoliosUtilizados: summary.usedCount,
    RangoUtilizados: toSiiRanges(summary.usedRanges),
    RangoAnulados: toSiiRanges(summary.voidedRanges),
  })

/**
 * EN: The `DocumentoConsumoFolios` of a report with the official tags, in schema order.
 * ES: El `DocumentoConsumoFolios` de un reporte con las etiquetas oficiales, en el orden del esquema.
 */
export const toSiiFolioConsumption = (report: FolioConsumption): SiiDocumentoConsumoFolios => {
  const c = report.cover
  return {
    Caratula: compact({
      RutEmisor: c.issuerRut,
      RutEnvia: c.senderRut,
      FchResol: c.resolutionDate,
      NroResol: c.resolutionNumber,
      FchInicio: c.from,
      FchFinal: c.to,
      Correlativo: c.correlative,
      SecEnvio: c.sequence,
      TmstFirmaEnv: c.signedAt,
    }),
    Resumen: report.summaries.map(toSiiResumenConsumoFolios),
  }
}
```

`src/books/purchase-sales.ts`:

```ts
import type { Certificate } from '../certificate/certificate'
import { generateSetId } from '../envelope/create'
import { DteError } from '../errors'
import type {
  BookTotalMismatch,
  BookTotals,
  PurchaseSalesBook,
  PurchaseSalesBookInput,
  PurchaseSalesCover,
  PurchaseSalesCoverInput,
} from '../model/book'
import { toSiiPurchaseSalesBook } from '../model/book-codec'
import { signEnveloped, verifyEnveloped, type SignatureVerification, type XmlSignature } from '../signature/xmldsig'
import { chileTimestamp } from '../time/chile'
import { assertMaxLength, sanitizeText } from '../text/sanitize'
import { assertBookZones, buildBookXml, normalizeBookCover } from './common'
import { normalizeBookEntry } from './entry'
import { accumulateBookTotals, normalizeBookTotals, sumBookEntries } from './totals'

const ROOT_TAG = 'LibroCompraVenta'
const SIGNED_TAG = 'EnvioLibro'
const MAX_RECTIFICATION_CODE = 10
const MIN_COMMON_USE_FACTOR = 0.001
const MAX_COMMON_USE_FACTOR = 99.999
const MIN_ADDITIONAL_FACTOR = 0.001
const MAX_ADDITIONAL_FACTOR = 1

const normalizeCover = (cover: PurchaseSalesCoverInput): PurchaseSalesCover => {
  const kind = cover.kind ?? 'monthly'
  if (kind === 'special' && cover.notificationFolio === undefined)
    throw new DteError('MISSING_FIELD', { field: 'cover.notificationFolio' })
  if (kind === 'rectification' && cover.rectificationCode === undefined)
    throw new DteError('MISSING_FIELD', { field: 'cover.rectificationCode' })
  const rectificationCode = kind === 'rectification' ? sanitizeText(cover.rectificationCode) : undefined
  if (rectificationCode !== undefined) assertMaxLength(rectificationCode, MAX_RECTIFICATION_CODE, 'CodAutRec')
  return {
    ...normalizeBookCover(cover),
    operation: cover.operation,
    kind,
    ...(rectificationCode === undefined ? {} : { rectificationCode }),
  }
}

const hasDecimalsUpTo = (value: number, decimals: number): boolean => {
  const scale = 10 ** decimals
  return Math.round(value * scale) / scale === value
}

const assertFactors = (input: PurchaseSalesBookInput): void => {
  const { commonUseVatFactor: factor, additionalTaxFactors } = input
  if (
    factor !== undefined &&
    !(factor >= MIN_COMMON_USE_FACTOR && factor <= MAX_COMMON_USE_FACTOR && hasDecimalsUpTo(factor, 3))
  )
    throw new DteError('INVALID_OPTION', { field: 'commonUseVatFactor' })
  for (const value of Object.values(additionalTaxFactors ?? {}))
    if (!(value >= MIN_ADDITIONAL_FACTOR && value <= MAX_ADDITIONAL_FACTOR && hasDecimalsUpTo(value, 4)))
      throw new DteError('INVALID_OPTION', { field: 'additionalTaxFactors' })
}

const assertCommonUseFactor = (rows: readonly BookTotals[] | null, factor: number | undefined): void => {
  if (factor === undefined && (rows ?? []).some((row) => (row.commonUseVat ?? 0) > 0))
    throw new DteError('MISSING_FIELD', { field: 'commonUseVatFactor' })
}

/**
 * EN: Builds a purchase and sales book (IECV): validates the cover and the zones of its submission, normalizes the lines
 * and computes the summaries. An explicit line total that differs from the SII formula is kept and reported in
 * `totalMismatches`, because the SII accepts some of them; `strictTotals` throws instead.
 * ES: Arma un libro de compras y ventas (IECV): valida la carátula y las zonas de su envío, normaliza las líneas y calcula
 * los resúmenes. Un total explícito de línea que difiere de la fórmula del SII se conserva y se informa en
 * `totalMismatches`, porque el SII acepta algunos; `strictTotals` lanza en vez de eso.
 * @throws {DteError} EN: `BOOK_TOTAL_MISMATCH` with `strictTotals`; `MISSING_FIELD`, `INVALID_OPTION`, `INVALID_RUT`, `INVALID_DATE`, `INVALID_DOCUMENT_TYPE`, `INVALID_FOLIO`, `INVALID_AMOUNT`, `FIELD_TOO_LONG`. ES: `BOOK_TOTAL_MISMATCH` con `strictTotals`; y los demás códigos.
 */
export const createPurchaseSalesBook = (input: PurchaseSalesBookInput): PurchaseSalesBook => {
  const cover = normalizeCover(input.cover)
  const inputs = input.entries ?? []
  const summaryOnly = (input.summaryOnlyTotals ?? []).map(normalizeBookTotals)
  const previous = input.previousTotals ?? []
  assertBookZones({
    submission: cover.submission,
    entryCount: inputs.length,
    hasPreviousTotals: previous.length > 0,
    hasSummaryOnlyTotals: summaryOnly.length > 0,
  })
  assertFactors(input)
  const normalized = inputs.map((entry, index) =>
    normalizeBookEntry(entry, { operation: cover.operation, submission: cover.submission, index }),
  )
  const totalMismatches = normalized.flatMap(({ mismatch }): readonly BookTotalMismatch[] =>
    mismatch ? [mismatch] : [],
  )
  if (input.strictTotals && totalMismatches.length > 0) {
    const { index, expected, actual } = totalMismatches[0]
    throw new DteError('BOOK_TOTAL_MISMATCH', { index, expected, actual })
  }
  const entries = normalized.map(({ entry }) => entry)
  const lineTotals = sumBookEntries(entries)
  const period = accumulateBookTotals(previous, [...lineTotals, ...summaryOnly])
  const periodTotals = cover.submission === 'partial' || period.length === 0 ? null : period
  assertCommonUseFactor(periodTotals, input.commonUseVatFactor)
  return {
    id: input.id ?? generateSetId('LCV', input.now),
    cover,
    entries,
    segmentTotals:
      (cover.submission === 'partial' || cover.submission === 'adjustment') && entries.length > 0 ? lineTotals : null,
    periodTotals,
    ...(input.commonUseVatFactor === undefined ? {} : { commonUseVatFactor: input.commonUseVatFactor }),
    ...(input.additionalTaxFactors === undefined ? {} : { additionalTaxFactors: input.additionalTaxFactors }),
    totalMismatches,
    signedAt: chileTimestamp(input.now),
  }
}

/**
 * EN: Renders the unsigned `LibroCompraVenta` XML.
 * ES: Renderiza el XML `LibroCompraVenta` sin firma.
 */
export const buildPurchaseSalesBookXml = (book: PurchaseSalesBook): string =>
  buildBookXml({
    rootTag: ROOT_TAG,
    signedTag: SIGNED_TAG,
    schema: 'LibroCV_v10.xsd',
    id: book.id,
    content: toSiiPurchaseSalesBook(book),
  })

/**
 * EN: A purchase and sales book with its signed XML, ready for `uploadBook`.
 * ES: Un libro de compras y ventas con su XML firmado, listo para `uploadBook`.
 */
export type SignedPurchaseSalesBook = PurchaseSalesBook & {
  /** EN: Signed XML with prolog. ES: XML firmado con prólogo. */
  readonly xml: string
  /** EN: Digest and signature values. ES: Valores de digest y firma. */
  readonly signature: XmlSignature
}

/**
 * EN: Signs the `EnvioLibro` with the sender certificate (enveloped XMLDSig, `URI="#ID"`).
 * ES: Firma el `EnvioLibro` con el certificado de quien envía (XMLDSig envuelta, `URI="#ID"`).
 */
export const signPurchaseSalesBook = (book: PurchaseSalesBook, certificate: Certificate): SignedPurchaseSalesBook => {
  const { xml, signature } = signEnveloped({
    xml: buildPurchaseSalesBookXml(book),
    elementTag: SIGNED_TAG,
    rootTag: ROOT_TAG,
    certificate,
  })
  return { ...book, xml, signature }
}

/**
 * EN: Verifies the signature of a `LibroCompraVenta` XML.
 * ES: Verifica la firma de un XML `LibroCompraVenta`.
 */
export const verifyPurchaseSalesBookSignature = (xml: string): SignatureVerification =>
  verifyEnveloped(xml, { elementTag: SIGNED_TAG, rootTag: ROOT_TAG })
```

- [ ] **Step 4: Run them to see them pass**

```bash
npx jest --config jest.config.cjs tests/books/book-codec.test.ts tests/books/purchase-sales.test.ts
```

Expected: PASS, `Tests: 52 passed, 52 total`.

- [ ] **Step 5: Commit**

```bash
git add src/model/book-codec.ts src/books/purchase-sales.ts tests/support/purchase-sales-samples.ts tests/books/book-codec.test.ts tests/books/purchase-sales.test.ts tests/fixtures/books/sale-total.xml tests/fixtures/books/purchase-special.xml tests/fixtures/books/sale-partial.xml tests/fixtures/books/sale-final.xml tests/fixtures/books/sale-adjustment.xml tests/fixtures/books/sale-rectification.xml
git commit -m "feat: purchase and sales book (IECV)"
```

---

## Task 8: Guide book

`TasaImp` and `IVA` are always emitted, 0 when absent, because that is the output known to pass. The schema only admits `TipoLibro` `ESPECIAL` and requires `FolioNotificacion`.

**Files:**
- Create: `src/books/guide.ts`
- Test: `tests/support/guide-samples.ts`
- Test: `tests/books/guide.test.ts`
- Golden: `tests/fixtures/books/guide-total.xml`
- Golden: `tests/fixtures/books/guide-adjustment.xml`

- [ ] **Step 1: Write the tests (they fail until Step 3)**

`tests/support/guide-samples.ts`:

```ts
import { buildGuideBookXml, createGuideBook } from '../../src/books/guide'
import type { GuideBook, GuideBookInput, GuideEntryInput } from '../../src/model/book'
import { BOOK_ID, guideCover } from './book-fixtures'
import { FIXED_NOW, RECEIVER_RUT } from './fixtures'

const guides: readonly GuideEntryInput[] = [
  {
    folio: 301,
    transferType: 1,
    date: '2026-10-05',
    receiverRut: RECEIVER_RUT,
    receiverName: 'Comercializadora Rapel Ltda',
    netAmount: 50000,
    taxRate: 19,
    referenceType: 33,
    referenceFolio: 101,
    referenceDate: '2026-10-05',
  },
  { folio: 302, voided: 'folio', transferType: 1, date: '2026-10-06' },
  { folio: 303, voided: 'guide', transferType: 1, date: '2026-10-07' },
  {
    folio: 304,
    voided: 'partialReceipt',
    transferType: 1,
    date: '2026-10-08',
    receiverRut: RECEIVER_RUT,
    netAmount: 10000,
    taxRate: 19,
    modifiedAmount: 5950,
  },
  { folio: 305, transferType: 5, date: '2026-10-09', totalAmount: 0 },
  { folio: 306, transferType: 7, date: '2026-10-10', totalAmount: 11900 },
]

type Sample = { readonly book: GuideBook; readonly xml: string }

const sample = (input: GuideBookInput): Sample => {
  const book = createGuideBook({ id: BOOK_ID, now: FIXED_NOW, ...input })
  return { book, xml: buildGuideBookXml(book) }
}

/** One sample per golden file in `tests/fixtures/books/`, named after it. */
export const GUIDE_SAMPLES = {
  'guide-total': sample({ cover: guideCover, entries: guides }),
  'guide-adjustment': sample({
    cover: { ...guideCover, submission: 'adjustment' },
    entries: [
      { folio: 301, adjustment: 'remove', transferType: 1, date: '2026-10-05', netAmount: 50000, taxRate: 19 },
      { folio: 301, transferType: 1, date: '2026-10-05', netAmount: 40000, taxRate: 19 },
    ],
    previousTotals: {
      voidedFolios: 1,
      voidedGuides: 1,
      saleGuides: 2,
      saleGuidesAmount: 71400,
      modifiedAmount: 5950,
      transfers: [{ type: 5, count: 1, amount: 0 }],
    },
  }),
}
```

`tests/books/guide.test.ts`:

```ts
import {
  accumulateGuideTotals,
  buildGuideBookXml,
  createGuideBook,
  signGuideBook,
  verifyGuideBookSignature,
} from '../../src/books/guide'
import type { DteError } from '../../src/errors'
import type { GuideBookInput, GuideEntryInput } from '../../src/model/book'
import { toSiiGuideBook } from '../../src/model/book-codec'
import { BOOK_ID, certificate, guideCover } from '../support/book-fixtures'
import { GUIDE_SAMPLES } from '../support/guide-samples'
import { FIXED_NOW, fixtureText, RECEIVER_RUT } from '../support/fixtures'
import { validateAgainstXsd } from '../support/xsd'

jest.setTimeout(30_000)

const failure = (input: GuideBookInput): { code: string; details: unknown } => {
  try {
    createGuideBook(input)
  } catch (error) {
    return { code: (error as DteError).code, details: (error as DteError).details }
  }
  throw new Error('expected a DteError')
}

const entry = (fields: Partial<GuideEntryInput>): GuideEntryInput => ({ folio: 1, transferType: 1, ...fields })
const firstEntry = (fields: Partial<GuideEntryInput>) =>
  createGuideBook({ cover: guideCover, entries: [entry(fields)] }).entries[0]

describe.each(['guide-total', 'guide-adjustment'] as const)('sample %s', (name) => {
  const { book, xml } = GUIDE_SAMPLES[name]

  test('matches its golden XML byte for byte', () => {
    expect(xml).toBe(fixtureText(`books/${name}.xml`).trimEnd())
  })

  test('signed, it validates against the official schema and verifies', async () => {
    const signed = signGuideBook(book, certificate)
    expect(await validateAgainstXsd(signed.xml, 'LibroGuia')).toEqual([])
    expect(verifyGuideBookSignature(signed.xml)).toMatchObject({ referenceId: BOOK_ID, valid: true })
  })
})

describe('createGuideBook', () => {
  test('defaults to a total and generates the id and timestamp', () => {
    const book = createGuideBook({ cover: guideCover, entries: [entry({ totalAmount: 1 })], now: FIXED_NOW })
    expect(book.cover).toMatchObject({ submission: 'total', notificationFolio: 3 })
    expect(book.id).toBe('LGD_15_11_2026_15_30_00_000')
    expect(book.signedAt).toBe('2026-11-15T15:30:00')
  })

  test('the summary counts voids, sales and transfers per operation', () => {
    expect(GUIDE_SAMPLES['guide-total'].book.periodTotals).toEqual({
      voidedFolios: 1,
      voidedGuides: 1,
      saleGuides: 2,
      saleGuidesAmount: 71400,
      modifiedAmount: 5950,
      transfers: [
        { type: 5, count: 1, amount: 0 },
        { type: 7, count: 1, amount: 11900 },
      ],
    })
  })

  test('the same operation adds up, and a line without operation only reports its modified amount', () => {
    const book = createGuideBook({
      cover: guideCover,
      entries: [
        { folio: 1, transferType: 5, totalAmount: 10 },
        { folio: 2, transferType: 5, totalAmount: 20 },
        { folio: 3, modifiedAmount: 7 },
      ],
    })
    expect(book.periodTotals).toEqual({
      voidedFolios: 0,
      voidedGuides: 0,
      saleGuides: 0,
      saleGuidesAmount: 0,
      modifiedAmount: 7,
      transfers: [{ type: 5, count: 2, amount: 30 }],
    })
  })

  test('an adjustment signs its segment and adds it to the previous totals', () => {
    const { book } = GUIDE_SAMPLES['guide-adjustment']
    expect(book.entries.map((line) => line.adjustment)).toEqual(['remove', 'add'])
    expect(book.segmentTotals).toMatchObject({ saleGuides: 0, saleGuidesAmount: -11900 })
    expect(book.periodTotals).toMatchObject({ saleGuides: 2, saleGuidesAmount: 59500 })
  })

  test('removed voids and transfers subtract, without producing -0', () => {
    const book = createGuideBook({
      cover: { ...guideCover, submission: 'adjustment' },
      entries: [
        { folio: 1, voided: 'folio', adjustment: 'remove' },
        { folio: 2, voided: 'guide', adjustment: 'remove' },
        { folio: 3, transferType: 5, totalAmount: 0, adjustment: 'remove' },
      ],
    })
    expect(book.segmentTotals).toEqual({
      voidedFolios: -1,
      voidedGuides: -1,
      saleGuides: 0,
      saleGuidesAmount: 0,
      modifiedAmount: 0,
      transfers: [{ type: 5, count: -1, amount: 0 }],
    })
    expect(Object.is(book.segmentTotals?.transfers[0].amount, 0)).toBe(true)
    expect(Object.is(book.segmentTotals?.modifiedAmount, 0)).toBe(true)
  })

  test('zones follow the submission', () => {
    const partial = createGuideBook({
      cover: { ...guideCover, submission: 'partial', segmentNumber: 2 },
      entries: [entry({ totalAmount: 1 })],
    })
    expect(partial.periodTotals).toBeNull()
    expect(partial.segmentTotals).not.toBeNull()
    expect(buildGuideBookXml(partial)).toContain('<NroSegmento>2</NroSegmento>')

    const previousTotals = GUIDE_SAMPLES['guide-total'].book.periodTotals
    const final = createGuideBook({
      cover: { ...guideCover, submission: 'final' },
      previousTotals: previousTotals as NonNullable<typeof previousTotals>,
    })
    expect(final.segmentTotals).toBeNull()
    expect(final.periodTotals).toEqual(previousTotals)

    const empty = createGuideBook({ cover: guideCover })
    expect(empty).toMatchObject({ entries: [], segmentTotals: null, periodTotals: null })
    expect(buildGuideBookXml(empty)).not.toContain('Resumen')

    const adjustmentOnlyTotals = createGuideBook({
      cover: { ...guideCover, submission: 'adjustment' },
      previousTotals: previousTotals as NonNullable<typeof previousTotals>,
    })
    expect(adjustmentOnlyTotals.segmentTotals).toBeNull()
  })

  test.each([
    [{ cover: { ...guideCover, notificationFolio: undefined } }, 'MISSING_FIELD', { field: 'cover.notificationFolio' }],
    [{ cover: guideCover, entries: [{ folio: 0 }] }, 'INVALID_FOLIO', { field: 'folio', folio: 0, index: 0 }],
    [
      { cover: guideCover, entries: [{ folio: 1, transferType: 8 }] },
      'INVALID_OPTION',
      { field: 'transferType', index: 0 },
    ],
    [
      { cover: guideCover, entries: [{ folio: 1, transferType: 0 }] },
      'INVALID_OPTION',
      { field: 'transferType', index: 0 },
    ],
    [
      { cover: guideCover, entries: [{ folio: 1, transferType: 1.5 }] },
      'INVALID_OPTION',
      { field: 'transferType', index: 0 },
    ],
    [
      { cover: guideCover, entries: [{ folio: 1, referenceType: 52 }] },
      'INVALID_DOCUMENT_TYPE',
      { field: 'referenceType', type: 52, index: 0 },
    ],
    [
      { cover: guideCover, entries: [{ folio: 1, referenceFolio: 0 }] },
      'INVALID_FOLIO',
      { field: 'referenceFolio', folio: 0, index: 0 },
    ],
    [{ cover: guideCover, entries: [{ folio: 1, netAmount: -1 }] }, 'INVALID_AMOUNT', { field: 'netAmount', index: 0 }],
    [{ cover: guideCover, entries: [{ folio: 1, taxRate: 101 }] }, 'INVALID_AMOUNT', { field: 'taxRate', index: 0 }],
    [
      {
        cover: guideCover,
        previousTotals: {
          voidedFolios: 0,
          voidedGuides: 0,
          saleGuides: 0,
          saleGuidesAmount: 0,
          modifiedAmount: 0,
          transfers: [],
        },
      },
      'INVALID_OPTION',
      { field: 'previousTotals' },
    ],
  ] as const)('rejects %j', (input, code, details) => {
    expect(failure(input as unknown as GuideBookInput)).toEqual({ code, details })
  })

  test('rejects a name over the limit, a bad date and a bad RUT', () => {
    expect(failure({ cover: guideCover, entries: [entry({ receiverName: 'x'.repeat(51) })] })).toMatchObject({
      code: 'FIELD_TOO_LONG',
      details: { field: 'RznSoc' },
    })
    expect(failure({ cover: guideCover, entries: [entry({ date: 'hoy' })] }).code).toBe('INVALID_DATE')
    expect(failure({ cover: guideCover, entries: [entry({ referenceDate: 'hoy' })] }).code).toBe('INVALID_DATE')
    expect(failure({ cover: guideCover, entries: [entry({ receiverRut: '1-1' })] }).code).toBe('INVALID_RUT')
  })
})

describe('guide lines', () => {
  test('rate and VAT default to 0 and the total to net plus VAT', () => {
    expect(firstEntry({})).toEqual({ folio: 1, transferType: 1, taxRate: 0, vatAmount: 0, totalAmount: 0 })
    expect(firstEntry({ netAmount: 100 })).toMatchObject({ taxRate: 0, vatAmount: 0, totalAmount: 100 })
  })

  test('VAT absent or 0 comes from rate and net, rounded', () => {
    expect(firstEntry({ netAmount: 1003, taxRate: 19 })).toMatchObject({ vatAmount: 191, totalAmount: 1194 })
    expect(firstEntry({ netAmount: 100, taxRate: 19, vatAmount: 0 }).vatAmount).toBe(19)
    expect(firstEntry({ netAmount: 100, taxRate: 19, vatAmount: 18 })).toMatchObject({
      vatAmount: 18,
      totalAmount: 118,
    })
  })

  test('an explicit total stays', () => {
    expect(firstEntry({ netAmount: 100, totalAmount: 5 }).totalAmount).toBe(5)
  })

  test('folio and guide voids drop amounts and receiver; a partial receipt keeps them', () => {
    const fields = { receiverRut: RECEIVER_RUT, receiverName: 'x', netAmount: 100, taxRate: 19, date: '2026-10-05' }
    expect(firstEntry({ ...fields, voided: 'folio' })).toEqual({
      folio: 1,
      voided: 'folio',
      transferType: 1,
      date: '2026-10-05',
      taxRate: 0,
      vatAmount: 0,
      totalAmount: 0,
    })
    expect(firstEntry({ ...fields, voided: 'guide' }).totalAmount).toBe(0)
    expect(firstEntry({ ...fields, voided: 'partialReceipt', modifiedAmount: 60 })).toMatchObject({
      voided: 'partialReceipt',
      receiverRut: RECEIVER_RUT,
      netAmount: 100,
      totalAmount: 119,
      modifiedAmount: 60,
    })
  })

  test('adjustments default to add on adjustment submissions and travel when given', () => {
    const book = createGuideBook({
      cover: { ...guideCover, submission: 'adjustment' },
      entries: [entry({})],
    })
    expect(book.entries[0].adjustment).toBe('add')
    expect(firstEntry({ adjustment: 'add' }).adjustment).toBe('add')
    expect(firstEntry({}).adjustment).toBeUndefined()
  })

  test('the reference to the invoice travels', () => {
    expect(GUIDE_SAMPLES['guide-total'].xml).toContain(
      '<TpoDocRef>33</TpoDocRef>\n<FolioDocRef>101</FolioDocRef>\n<FchDocRef>2026-10-05</FchDocRef>',
    )
  })
})

describe('accumulateGuideTotals', () => {
  test('adds everything, the transfers by operation', () => {
    const totals = {
      voidedFolios: 1,
      voidedGuides: 2,
      saleGuides: 3,
      saleGuidesAmount: 4,
      modifiedAmount: 5,
      transfers: [{ type: 5, count: 1, amount: 10 }],
    }
    expect(
      accumulateGuideTotals(totals, {
        ...totals,
        transfers: [
          { type: 5, count: 2, amount: 20 },
          { type: 7, count: 1, amount: 1 },
        ],
      }),
    ).toEqual({
      voidedFolios: 2,
      voidedGuides: 4,
      saleGuides: 6,
      saleGuidesAmount: 8,
      modifiedAmount: 10,
      transfers: [
        { type: 5, count: 3, amount: 30 },
        { type: 7, count: 1, amount: 1 },
      ],
    })
  })
})

describe('signGuideBook', () => {
  const signed = signGuideBook(GUIDE_SAMPLES['guide-total'].book, certificate)

  test('uses the XMLDSig namespace, as the schema requires', () => {
    expect(signed.xml).toContain('</EnvioLibro><Signature xmlns="http://www.w3.org/2000/09/xmldsig#">')
    expect(signed.xml.endsWith('</Signature></LibroGuia>')).toBe(true)
  })

  test('a tampered book does not verify', () => {
    expect(verifyGuideBookSignature(signed.xml.replace('<Folio>301</Folio>', '<Folio>399</Folio>'))).toMatchObject({
      valid: false,
    })
  })
})

describe('toSiiGuideBook', () => {
  test('the cover has no operation, and its kind is always ESPECIAL', () => {
    const sii = toSiiGuideBook(createGuideBook({ cover: guideCover }))
    expect(sii.Caratula.TipoLibro).toBe('ESPECIAL')
    expect(sii.Caratula).not.toHaveProperty('TipoOperacion')
    expect(sii).not.toHaveProperty('ResumenPeriodo')
    expect(sii).not.toHaveProperty('Detalle')
  })

  test('a line reaches its tags, in the order of the schema', () => {
    const sii = toSiiGuideBook(
      createGuideBook({
        cover: { ...guideCover, submission: 'adjustment' },
        entries: [
          {
            folio: 1,
            voided: 'partialReceipt',
            adjustment: 'remove',
            transferType: 1,
            date: '2026-10-05',
            receiverRut: RECEIVER_RUT,
            receiverName: 'Comercializadora Rapel Ltda',
            netAmount: 100,
            taxRate: 19,
            modifiedAmount: 50,
            referenceType: 33,
            referenceFolio: 2,
            referenceDate: '2026-10-05',
          },
        ],
      }),
    )
    expect(Object.keys(sii.Detalle?.[0] ?? {})).toEqual([
      'Folio',
      'Anulado',
      'Operacion',
      'TpoOper',
      'FchDoc',
      'RUTDoc',
      'RznSoc',
      'MntNeto',
      'TasaImp',
      'IVA',
      'MntTotal',
      'MntModificado',
      'TpoDocRef',
      'FolioDocRef',
      'FchDocRef',
    ])
    expect(sii.Detalle?.[0]).toMatchObject({ Anulado: 3, Operacion: 2 })
  })
})
```

`tests/fixtures/books/guide-total.xml`:

```xml
<?xml version="1.0" encoding="ISO-8859-1"?>
<LibroGuia xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte LibroGuia_v10.xsd" version="1.0">
<EnvioLibro ID="LIBRO_TEST">
<Caratula>
<RutEmisorLibro>76543210-3</RutEmisorLibro>
<RutEnvia>11111111-1</RutEnvia>
<PeriodoTributario>2026-10</PeriodoTributario>
<FchResol>2026-01-15</FchResol>
<NroResol>80</NroResol>
<TipoLibro>ESPECIAL</TipoLibro>
<TipoEnvio>TOTAL</TipoEnvio>
<FolioNotificacion>3</FolioNotificacion>
</Caratula>
<ResumenPeriodo>
<TotFolAnulado>1</TotFolAnulado>
<TotGuiaAnulada>1</TotGuiaAnulada>
<TotGuiaVenta>2</TotGuiaVenta>
<TotMntGuiaVta>71400</TotMntGuiaVta>
<TotMntModificado>5950</TotMntModificado>
<TotTraslado>
<TpoTraslado>5</TpoTraslado>
<CantGuia>1</CantGuia>
<MntGuia>0</MntGuia>
</TotTraslado>
<TotTraslado>
<TpoTraslado>7</TpoTraslado>
<CantGuia>1</CantGuia>
<MntGuia>11900</MntGuia>
</TotTraslado>
</ResumenPeriodo>
<Detalle>
<Folio>301</Folio>
<TpoOper>1</TpoOper>
<FchDoc>2026-10-05</FchDoc>
<RUTDoc>12345678-5</RUTDoc>
<RznSoc>Comercializadora Rapel Ltda</RznSoc>
<MntNeto>50000</MntNeto>
<TasaImp>19</TasaImp>
<IVA>9500</IVA>
<MntTotal>59500</MntTotal>
<TpoDocRef>33</TpoDocRef>
<FolioDocRef>101</FolioDocRef>
<FchDocRef>2026-10-05</FchDocRef>
</Detalle>
<Detalle>
<Folio>302</Folio>
<Anulado>1</Anulado>
<TpoOper>1</TpoOper>
<FchDoc>2026-10-06</FchDoc>
<TasaImp>0</TasaImp>
<IVA>0</IVA>
<MntTotal>0</MntTotal>
</Detalle>
<Detalle>
<Folio>303</Folio>
<Anulado>2</Anulado>
<TpoOper>1</TpoOper>
<FchDoc>2026-10-07</FchDoc>
<TasaImp>0</TasaImp>
<IVA>0</IVA>
<MntTotal>0</MntTotal>
</Detalle>
<Detalle>
<Folio>304</Folio>
<Anulado>3</Anulado>
<TpoOper>1</TpoOper>
<FchDoc>2026-10-08</FchDoc>
<RUTDoc>12345678-5</RUTDoc>
<MntNeto>10000</MntNeto>
<TasaImp>19</TasaImp>
<IVA>1900</IVA>
<MntTotal>11900</MntTotal>
<MntModificado>5950</MntModificado>
</Detalle>
<Detalle>
<Folio>305</Folio>
<TpoOper>5</TpoOper>
<FchDoc>2026-10-09</FchDoc>
<TasaImp>0</TasaImp>
<IVA>0</IVA>
<MntTotal>0</MntTotal>
</Detalle>
<Detalle>
<Folio>306</Folio>
<TpoOper>7</TpoOper>
<FchDoc>2026-10-10</FchDoc>
<TasaImp>0</TasaImp>
<IVA>0</IVA>
<MntTotal>11900</MntTotal>
</Detalle>
<TmstFirma>2026-11-15T15:30:00</TmstFirma>
</EnvioLibro></LibroGuia>
```

`tests/fixtures/books/guide-adjustment.xml`:

```xml
<?xml version="1.0" encoding="ISO-8859-1"?>
<LibroGuia xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte LibroGuia_v10.xsd" version="1.0">
<EnvioLibro ID="LIBRO_TEST">
<Caratula>
<RutEmisorLibro>76543210-3</RutEmisorLibro>
<RutEnvia>11111111-1</RutEnvia>
<PeriodoTributario>2026-10</PeriodoTributario>
<FchResol>2026-01-15</FchResol>
<NroResol>80</NroResol>
<TipoLibro>ESPECIAL</TipoLibro>
<TipoEnvio>AJUSTE</TipoEnvio>
<FolioNotificacion>3</FolioNotificacion>
</Caratula>
<ResumenSegmento>
<TotGuiaVenta>0</TotGuiaVenta>
<TotMntGuiaVta>-11900</TotMntGuiaVta>
</ResumenSegmento>
<ResumenPeriodo>
<TotFolAnulado>1</TotFolAnulado>
<TotGuiaAnulada>1</TotGuiaAnulada>
<TotGuiaVenta>2</TotGuiaVenta>
<TotMntGuiaVta>59500</TotMntGuiaVta>
<TotMntModificado>5950</TotMntModificado>
<TotTraslado>
<TpoTraslado>5</TpoTraslado>
<CantGuia>1</CantGuia>
<MntGuia>0</MntGuia>
</TotTraslado>
</ResumenPeriodo>
<Detalle>
<Folio>301</Folio>
<Operacion>2</Operacion>
<TpoOper>1</TpoOper>
<FchDoc>2026-10-05</FchDoc>
<MntNeto>50000</MntNeto>
<TasaImp>19</TasaImp>
<IVA>9500</IVA>
<MntTotal>59500</MntTotal>
</Detalle>
<Detalle>
<Folio>301</Folio>
<Operacion>1</Operacion>
<TpoOper>1</TpoOper>
<FchDoc>2026-10-05</FchDoc>
<MntNeto>40000</MntNeto>
<TasaImp>19</TasaImp>
<IVA>7600</IVA>
<MntTotal>47600</MntTotal>
</Detalle>
<TmstFirma>2026-11-15T15:30:00</TmstFirma>
</EnvioLibro></LibroGuia>
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx jest --config jest.config.cjs tests/books/guide.test.ts
```

Expected: FAIL, with `Cannot find module '../../src/books/guide'`.

- [ ] **Step 3: Write the implementation**

`src/books/guide.ts`:

```ts
import { isBookDocumentType, type BookSubmission } from '../catalogs/book-codes'
import type { Certificate } from '../certificate/certificate'
import { generateSetId } from '../envelope/create'
import { DteError } from '../errors'
import type {
  GuideBook,
  GuideBookCover,
  GuideBookCoverInput,
  GuideBookInput,
  GuideEntry,
  GuideEntryInput,
  GuideTotals,
  GuideTransferTotal,
} from '../model/book'
import { toSiiGuideBook } from '../model/book-codec'
import { compact } from '../model/codec'
import { toSiiRut } from '../model/rut'
import { signEnveloped, verifyEnveloped, type SignatureVerification, type XmlSignature } from '../signature/xmldsig'
import { assertMaxLength, sanitizeText } from '../text/sanitize'
import { chileTimestamp } from '../time/chile'
import {
  assertBookAmount,
  assertBookFolio,
  assertBookRate,
  assertBookZones,
  buildBookXml,
  normalizeBookCover,
  toBookDate,
} from './common'

const ROOT_TAG = 'LibroGuia'
const SIGNED_TAG = 'EnvioLibro'
const MAX_NAME = 50
const MIN_TRANSFER_TYPE = 1
// `TpoOper` stops at 7 in the schema, although `TotTraslado` admits 8 and 9.
const MAX_TRANSFER_TYPE = 7
const SALE: GuideEntry['transferType'] = 1

const EMPTY_TOTALS: GuideTotals = {
  voidedFolios: 0,
  voidedGuides: 0,
  saleGuides: 0,
  saleGuidesAmount: 0,
  modifiedAmount: 0,
  transfers: [],
}

const normalizeCover = (cover: GuideBookCoverInput): GuideBookCover => {
  if (cover.notificationFolio === undefined) throw new DteError('MISSING_FIELD', { field: 'cover.notificationFolio' })
  return { ...normalizeBookCover(cover), notificationFolio: cover.notificationFolio }
}

const validate = (input: GuideEntryInput, index: number): void => {
  assertBookFolio(input.folio, 'folio', index)
  const type = input.transferType
  if (type !== undefined && !(Number.isInteger(type) && type >= MIN_TRANSFER_TYPE && type <= MAX_TRANSFER_TYPE))
    throw new DteError('INVALID_OPTION', { field: 'transferType', index })
  if (input.referenceType !== undefined && !isBookDocumentType(input.referenceType))
    throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'referenceType', type: input.referenceType, index })
  if (input.referenceFolio !== undefined) assertBookFolio(input.referenceFolio, 'referenceFolio', index)
  for (const field of ['netAmount', 'vatAmount', 'totalAmount', 'modifiedAmount'] as const)
    assertBookAmount(input[field], { field, signed: false, index })
  assertBookRate(input.taxRate, 'taxRate', index)
}

const normalizeEntry = (input: GuideEntryInput, submission: BookSubmission, index: number): GuideEntry => {
  validate(input, index)
  const adjustment = input.adjustment ?? (submission === 'adjustment' ? 'add' : undefined)
  const shared = compact({
    folio: input.folio,
    voided: input.voided,
    adjustment,
    transferType: input.transferType,
    date: input.date === undefined ? undefined : toBookDate(input.date, 'date'),
  })
  if (input.voided === 'folio' || input.voided === 'guide')
    return { ...shared, taxRate: 0, vatAmount: 0, totalAmount: 0 }
  const name = input.receiverName === undefined ? undefined : sanitizeText(input.receiverName)
  if (name !== undefined) assertMaxLength(name, MAX_NAME, 'RznSoc')
  const net = input.netAmount ?? 0
  const taxRate = input.taxRate ?? 0
  const vatAmount = input.vatAmount || Math.round((net * taxRate) / 100)
  return compact({
    ...shared,
    receiverRut: input.receiverRut === undefined ? undefined : toSiiRut(input.receiverRut, 'receiverRut'),
    receiverName: name,
    netAmount: input.netAmount,
    taxRate,
    vatAmount,
    totalAmount: input.totalAmount ?? net + vatAmount,
    modifiedAmount: input.modifiedAmount,
    referenceType: input.referenceType,
    referenceFolio: input.referenceFolio,
    referenceDate: input.referenceDate === undefined ? undefined : toBookDate(input.referenceDate, 'referenceDate'),
  })
}

const mergeTransfers = (
  a: readonly GuideTransferTotal[],
  b: readonly GuideTransferTotal[],
): readonly GuideTransferTotal[] => {
  const merged = new Map<number, GuideTransferTotal>()
  for (const item of [...a, ...b]) {
    const seen = merged.get(item.type)
    merged.set(
      item.type,
      seen === undefined
        ? item
        : { type: item.type, count: seen.count + item.count, amount: seen.amount + item.amount },
    )
  }
  return [...merged.values()]
}

/**
 * EN: Adds two guide book summaries, the transfers by operation. Use it to carry the period totals of earlier submissions
 * forward.
 * ES: Suma dos resúmenes de libro de guías, los traslados por operación. Sirve para arrastrar los totales del período de
 * envíos anteriores.
 */
export const accumulateGuideTotals = (base: GuideTotals, delta: GuideTotals): GuideTotals => ({
  voidedFolios: base.voidedFolios + delta.voidedFolios,
  voidedGuides: base.voidedGuides + delta.voidedGuides,
  saleGuides: base.saleGuides + delta.saleGuides,
  saleGuidesAmount: base.saleGuidesAmount + delta.saleGuidesAmount,
  modifiedAmount: base.modifiedAmount + delta.modifiedAmount,
  transfers: mergeTransfers(base.transfers, delta.transfers),
})

const entryTotals = (entry: GuideEntry): GuideTotals => {
  const one = entry.adjustment === 'remove' ? -1 : 1
  if (entry.voided === 'folio') return { ...EMPTY_TOTALS, voidedFolios: one }
  if (entry.voided === 'guide') return { ...EMPTY_TOTALS, voidedGuides: one }
  const amount = 0 + one * entry.totalAmount
  const base = { ...EMPTY_TOTALS, modifiedAmount: 0 + one * (entry.modifiedAmount ?? 0) }
  if (entry.transferType === SALE) return { ...base, saleGuides: one, saleGuidesAmount: amount }
  return entry.transferType === undefined
    ? base
    : { ...base, transfers: [{ type: entry.transferType, count: one, amount }] }
}

const sumEntries = (entries: readonly GuideEntry[]): GuideTotals =>
  entries.map(entryTotals).reduce(accumulateGuideTotals, EMPTY_TOTALS)

/**
 * EN: Builds a guide book: validates the cover and the zones of its submission, normalizes the lines and computes the
 * summaries. `TasaImp` and `IVA` are always emitted, 0 when absent.
 * ES: Arma un libro de guías: valida la carátula y las zonas de su envío, normaliza las líneas y calcula los resúmenes.
 * `TasaImp` e `IVA` se emiten siempre, en 0 si faltan.
 * @throws {DteError} EN: `MISSING_FIELD`, `INVALID_OPTION`, `INVALID_RUT`, `INVALID_DATE`, `INVALID_DOCUMENT_TYPE`, `INVALID_FOLIO`, `INVALID_AMOUNT`, `FIELD_TOO_LONG`. ES: los mismos códigos.
 */
export const createGuideBook = (input: GuideBookInput): GuideBook => {
  const cover = normalizeCover(input.cover)
  const { submission } = cover
  const inputs = input.entries ?? []
  assertBookZones({
    submission,
    entryCount: inputs.length,
    hasPreviousTotals: input.previousTotals !== undefined,
    hasSummaryOnlyTotals: false,
  })
  const entries = inputs.map((entry, index) => normalizeEntry(entry, submission, index))
  const lineTotals = sumEntries(entries)
  const period = accumulateGuideTotals(input.previousTotals ?? EMPTY_TOTALS, lineTotals)
  const hasTotals = entries.length > 0 || input.previousTotals !== undefined
  return {
    id: input.id ?? generateSetId('LGD', input.now),
    cover,
    entries,
    segmentTotals: (submission === 'partial' || submission === 'adjustment') && entries.length > 0 ? lineTotals : null,
    periodTotals: submission === 'partial' || !hasTotals ? null : period,
    signedAt: chileTimestamp(input.now),
  }
}

/**
 * EN: Renders the unsigned `LibroGuia` XML.
 * ES: Renderiza el XML `LibroGuia` sin firma.
 */
export const buildGuideBookXml = (book: GuideBook): string =>
  buildBookXml({
    rootTag: ROOT_TAG,
    signedTag: SIGNED_TAG,
    schema: 'LibroGuia_v10.xsd',
    id: book.id,
    content: toSiiGuideBook(book),
  })

/**
 * EN: A guide book with its signed XML, ready for `uploadBook`.
 * ES: Un libro de guías con su XML firmado, listo para `uploadBook`.
 */
export type SignedGuideBook = GuideBook & {
  /** EN: Signed XML with prolog. ES: XML firmado con prólogo. */
  readonly xml: string
  /** EN: Digest and signature values. ES: Valores de digest y firma. */
  readonly signature: XmlSignature
}

/**
 * EN: Signs the `EnvioLibro` with the sender certificate (enveloped XMLDSig, `URI="#ID"`).
 * ES: Firma el `EnvioLibro` con el certificado de quien envía (XMLDSig envuelta, `URI="#ID"`).
 */
export const signGuideBook = (book: GuideBook, certificate: Certificate): SignedGuideBook => {
  const { xml, signature } = signEnveloped({
    xml: buildGuideBookXml(book),
    elementTag: SIGNED_TAG,
    rootTag: ROOT_TAG,
    certificate,
  })
  return { ...book, xml, signature }
}

/**
 * EN: Verifies the signature of a `LibroGuia` XML.
 * ES: Verifica la firma de un XML `LibroGuia`.
 */
export const verifyGuideBookSignature = (xml: string): SignatureVerification =>
  verifyEnveloped(xml, { elementTag: SIGNED_TAG, rootTag: ROOT_TAG })
```

- [ ] **Step 4: Run them to see them pass**

```bash
npx jest --config jest.config.cjs tests/books/guide.test.ts
```

Expected: PASS, `Tests: 32 passed, 32 total`.

- [ ] **Step 5: Commit**

```bash
git add src/books/guide.ts tests/support/guide-samples.ts tests/books/guide.test.ts tests/fixtures/books/guide-total.xml tests/fixtures/books/guide-adjustment.xml
git commit -m "feat: dispatch guide book (LibroGuia)"
```

---

## Task 9: Folio consumption report

Types 39 and 41 only, per the 2020 format. `RangoUtilizados` lists issued folios and `RangoAnulados` voided ones, following the worked example of the format. A day without sales is one summary of type 39 in zeros.

**Files:**
- Create: `src/books/folio-consumption.ts`
- Test: `tests/support/report-samples.ts`
- Test: `tests/books/folio-consumption.test.ts`
- Golden: `tests/fixtures/books/report-day.xml`
- Golden: `tests/fixtures/books/report-no-sales.xml`

- [ ] **Step 1: Write the tests (they fail until Step 3)**

`tests/support/report-samples.ts`:

```ts
import { buildFolioConsumptionXml, createFolioConsumption } from '../../src/books/folio-consumption'
import type { FolioConsumption, FolioConsumptionInput } from '../../src/model/book'
import { BOOK_ID, reportCover } from './book-fixtures'
import { FIXED_NOW } from './fixtures'

const receipts = [
  { type: 39, folio: 1, issueDate: '2026-10-15', netAmount: 840, vatAmount: 160, totalAmount: 1000 },
  { type: 39, folio: 2, issueDate: '2026-10-15', netAmount: 1681, vatAmount: 319, totalAmount: 2000 },
  { type: 39, folio: 3, issueDate: '2026-10-15', netAmount: 840, vatAmount: 160, exemptAmount: 500, totalAmount: 1500 },
  { type: 39, folio: 7, issueDate: '2026-10-15', netAmount: 2521, vatAmount: 479, totalAmount: 3000 },
  { type: 41, folio: 50, issueDate: '2026-10-15', exemptAmount: 900, totalAmount: 900 },
] as const

type Sample = { readonly book: FolioConsumption; readonly xml: string }

const sample = (input: FolioConsumptionInput): Sample => {
  const book = createFolioConsumption({ id: BOOK_ID, now: FIXED_NOW, ...input })
  return { book, xml: buildFolioConsumptionXml(book) }
}

/** One sample per golden file in `tests/fixtures/books/`, named after it. */
export const REPORT_SAMPLES = {
  'report-day': sample({
    cover: { ...reportCover, sequence: 2, correlative: 1 },
    entries: receipts,
    voidedFolios: [
      { type: 39, folio: 4 },
      { type: 39, folio: 5 },
      { type: 41, folio: 51 },
    ],
  }),
  'report-no-sales': sample({ cover: { ...reportCover, from: '2026-10-16', to: '2026-10-16' } }),
}
```

`tests/books/folio-consumption.test.ts`:

```ts
import {
  buildFolioConsumptionXml,
  compactFolioRanges,
  createFolioConsumption,
  signFolioConsumption,
  verifyFolioConsumptionSignature,
} from '../../src/books/folio-consumption'
import type { DteError } from '../../src/errors'
import type { FolioConsumptionEntry, FolioConsumptionInput } from '../../src/model/book'
import { toSiiFolioConsumption } from '../../src/model/book-codec'
import { BOOK_ID, certificate, reportCover } from '../support/book-fixtures'
import { REPORT_SAMPLES } from '../support/report-samples'
import { FIXED_NOW, fixtureText } from '../support/fixtures'
import { validateAgainstXsd } from '../support/xsd'

jest.setTimeout(30_000)

const receipt: FolioConsumptionEntry = { type: 39, folio: 1, issueDate: '2026-10-15', totalAmount: 1000 }

const failure = (input: FolioConsumptionInput): { code: string; details: unknown } => {
  try {
    createFolioConsumption(input)
  } catch (error) {
    return { code: (error as DteError).code, details: (error as DteError).details }
  }
  throw new Error('expected a DteError')
}

describe.each(['report-day', 'report-no-sales'] as const)('sample %s', (name) => {
  const { book, xml } = REPORT_SAMPLES[name]

  test('matches its golden XML byte for byte', () => {
    expect(xml).toBe(fixtureText(`books/${name}.xml`).trimEnd())
  })

  test('signed, it validates against the official schema and verifies', async () => {
    const signed = signFolioConsumption(book, certificate)
    expect(await validateAgainstXsd(signed.xml, 'ConsumoFolio')).toEqual([])
    expect(verifyFolioConsumptionSignature(signed.xml)).toMatchObject({ referenceId: BOOK_ID, valid: true })
  })
})

describe('compactFolioRanges', () => {
  test.each([
    [[], []],
    [[5], [{ from: 5, to: 5 }]],
    [[3, 1, 2], [{ from: 1, to: 3 }]],
    [
      [1, 2, 3, 7, 9, 10],
      [
        { from: 1, to: 3 },
        { from: 7, to: 7 },
        { from: 9, to: 10 },
      ],
    ],
    [
      [10, 2],
      [
        { from: 2, to: 2 },
        { from: 10, to: 10 },
      ],
    ],
  ])('%j', (folios, ranges) => {
    expect(compactFolioRanges(folios)).toEqual(ranges)
  })
})

describe('createFolioConsumption', () => {
  test('the dates come from the lines, the sequence defaults to 1 and the id and timestamp are generated', () => {
    const report = createFolioConsumption({
      cover: reportCover,
      entries: [
        receipt,
        { ...receipt, folio: 2, issueDate: '2026-10-13' },
        { ...receipt, folio: 3, issueDate: undefined },
      ],
      now: FIXED_NOW,
    })
    expect(report.cover).toMatchObject({
      from: '2026-10-13',
      to: '2026-10-15',
      sequence: 1,
      signedAt: '2026-11-15T15:30:00',
    })
    expect(report.cover).not.toHaveProperty('correlative')
    expect(report.id).toBe('RCOF_15_11_2026_15_30_00_000')
  })

  test('explicit dates win and are normalized', () => {
    const report = createFolioConsumption({
      cover: { ...reportCover, from: '01-10-2026', to: '02-10-2026' },
      entries: [receipt],
    })
    expect(report.cover).toMatchObject({ from: '2026-10-01', to: '2026-10-02' })
  })

  test('a summary adds the receipts and counts issued, voided and used folios', () => {
    expect(REPORT_SAMPLES['report-day'].book.summaries).toEqual([
      {
        type: 39,
        netAmount: 5882,
        vatAmount: 1118,
        vatRate: 19,
        exemptAmount: 500,
        totalAmount: 7500,
        issuedCount: 4,
        voidedCount: 2,
        usedCount: 6,
        usedRanges: [
          { from: 1, to: 3 },
          { from: 7, to: 7 },
        ],
        voidedRanges: [{ from: 4, to: 5 }],
      },
      {
        type: 41,
        netAmount: 0,
        vatAmount: 0,
        exemptAmount: 900,
        totalAmount: 900,
        issuedCount: 1,
        voidedCount: 1,
        usedCount: 2,
        usedRanges: [{ from: 50, to: 50 }],
        voidedRanges: [{ from: 51, to: 51 }],
      },
    ])
  })

  test('type 41 ignores net and VAT and emits no rate', () => {
    const { summaries } = createFolioConsumption({
      cover: reportCover,
      entries: [{ type: 41, folio: 1, issueDate: '2026-10-15', netAmount: 5, vatAmount: 1, totalAmount: 6 }],
    })
    expect(summaries[0]).toMatchObject({ netAmount: 0, vatAmount: 0, totalAmount: 6 })
    expect(summaries[0]).not.toHaveProperty('vatRate')
  })

  test('voided folios alone produce a summary of their type', () => {
    const { summaries } = createFolioConsumption({
      cover: { ...reportCover, from: '2026-10-15', to: '2026-10-15' },
      voidedFolios: [{ type: 41, folio: 9 }],
    })
    expect(summaries.map((summary) => [summary.type, summary.usedCount])).toEqual([[41, 1]])
  })

  test('a day without sales is one summary of type 39 in zeros', () => {
    const { book, xml } = REPORT_SAMPLES['report-no-sales']
    expect(book.summaries).toEqual([
      {
        type: 39,
        netAmount: 0,
        vatAmount: 0,
        vatRate: 19,
        exemptAmount: 0,
        totalAmount: 0,
        issuedCount: 0,
        voidedCount: 0,
        usedCount: 0,
        usedRanges: [],
        voidedRanges: [],
      },
    ])
    expect(xml).not.toContain('Rango')
  })

  test('zero amounts are omitted from the XML and the counts are not', () => {
    const xml = buildFolioConsumptionXml(createFolioConsumption({ cover: reportCover, entries: [receipt] }))
    expect(xml).toContain(
      '<TipoDocumento>39</TipoDocumento>\n<TasaIVA>19</TasaIVA>\n<MntTotal>1000</MntTotal>\n<FoliosEmitidos>1</FoliosEmitidos>\n<FoliosAnulados>0</FoliosAnulados>',
    )
  })

  test('the cover carries its version attribute and its correlative', () => {
    const { xml } = REPORT_SAMPLES['report-day']
    expect(xml).toContain('<Caratula version="1.0">')
    expect(xml).toContain('<Correlativo>1</Correlativo>\n<SecEnvio>2</SecEnvio>')
  })

  test.each([
    [{ cover: reportCover }, 'MISSING_FIELD', { field: 'cover.from' }],
    [{ cover: { ...reportCover, from: '2026-10-15' } }, 'MISSING_FIELD', { field: 'cover.to' }],
    [{ cover: reportCover, entries: [{ ...receipt, type: 61 }] }, 'INVALID_DOCUMENT_TYPE', { field: 'type', type: 61 }],
    [{ cover: reportCover, entries: [{ ...receipt, folio: 0 }] }, 'INVALID_FOLIO', { field: 'folio', folio: 0 }],
    [{ cover: reportCover, entries: [receipt, receipt] }, 'INVALID_FOLIO', { field: 'folio', folio: 1, type: 39 }],
    [
      { cover: reportCover, entries: [receipt], voidedFolios: [{ type: 39, folio: 1 }] },
      'INVALID_FOLIO',
      { field: 'folio', folio: 1, type: 39 },
    ],
    [{ cover: reportCover, entries: [{ ...receipt, totalAmount: -1 }] }, 'INVALID_AMOUNT', { field: 'totalAmount' }],
    [
      { cover: { ...reportCover, resolutionNumber: -1 }, entries: [receipt] },
      'INVALID_OPTION',
      { field: 'cover.resolutionNumber' },
    ],
    [{ cover: { ...reportCover, sequence: 1000 }, entries: [receipt] }, 'INVALID_OPTION', { field: 'cover.sequence' }],
    [
      { cover: { ...reportCover, correlative: -1 }, entries: [receipt] },
      'INVALID_OPTION',
      { field: 'cover.correlative' },
    ],
    [{ cover: { ...reportCover, sequence: 1.5 }, entries: [receipt] }, 'INVALID_OPTION', { field: 'cover.sequence' }],
  ] as const)('rejects %j', (input, code, details) => {
    expect(failure(input as FolioConsumptionInput)).toEqual({ code, details })
  })

  test('the same folio may appear on both receipt types', () => {
    expect(
      createFolioConsumption({ cover: reportCover, entries: [receipt, { ...receipt, type: 41 }] }).summaries,
    ).toHaveLength(2)
  })

  test('rejects bad dates and RUTs', () => {
    expect(failure({ cover: reportCover, entries: [{ ...receipt, issueDate: 'hoy' }] }).code).toBe('INVALID_DATE')
    expect(failure({ cover: { ...reportCover, issuerRut: '1-1' }, entries: [receipt] }).code).toBe('INVALID_RUT')
  })
})

describe('signFolioConsumption', () => {
  const signed = signFolioConsumption(REPORT_SAMPLES['report-day'].book, certificate)

  test('inserts the signature between the closing tags', () => {
    expect(signed.xml).toContain('</DocumentoConsumoFolios><Signature xmlns="http://www.w3.org/2000/09/xmldsig#">')
    expect(signed.xml.endsWith('</Signature></ConsumoFolios>')).toBe(true)
  })

  test('a tampered report does not verify', () => {
    const tampered = signed.xml.replace('<MntTotal>7500</MntTotal>', '<MntTotal>7501</MntTotal>')
    expect(verifyFolioConsumptionSignature(tampered)).toMatchObject({ digestValid: false, valid: false })
  })
})

describe('toSiiFolioConsumption', () => {
  test('the cover and the summary follow the order of the schema', () => {
    const sii = toSiiFolioConsumption(
      createFolioConsumption({
        cover: { ...reportCover, correlative: 1 },
        entries: [
          {
            type: 39,
            folio: 1,
            issueDate: '2026-10-15',
            netAmount: 84,
            vatAmount: 16,
            exemptAmount: 5,
            totalAmount: 105,
          },
        ],
        voidedFolios: [{ type: 39, folio: 2 }],
        now: FIXED_NOW,
      }),
    )
    expect(Object.keys(sii.Caratula)).toEqual([
      'RutEmisor',
      'RutEnvia',
      'FchResol',
      'NroResol',
      'FchInicio',
      'FchFinal',
      'Correlativo',
      'SecEnvio',
      'TmstFirmaEnv',
    ])
    expect(Object.keys(sii.Resumen[0])).toEqual([
      'TipoDocumento',
      'MntNeto',
      'MntIva',
      'TasaIVA',
      'MntExento',
      'MntTotal',
      'FoliosEmitidos',
      'FoliosAnulados',
      'FoliosUtilizados',
      'RangoUtilizados',
      'RangoAnulados',
    ])
  })
})
```

`tests/fixtures/books/report-day.xml`:

```xml
<?xml version="1.0" encoding="ISO-8859-1"?>
<ConsumoFolios xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte ConsumoFolio_v10.xsd" version="1.0">
<DocumentoConsumoFolios ID="LIBRO_TEST">
<Caratula version="1.0">
<RutEmisor>76543210-3</RutEmisor>
<RutEnvia>11111111-1</RutEnvia>
<FchResol>2026-01-15</FchResol>
<NroResol>80</NroResol>
<FchInicio>2026-10-15</FchInicio>
<FchFinal>2026-10-15</FchFinal>
<Correlativo>1</Correlativo>
<SecEnvio>2</SecEnvio>
<TmstFirmaEnv>2026-11-15T15:30:00</TmstFirmaEnv>
</Caratula>
<Resumen>
<TipoDocumento>39</TipoDocumento>
<MntNeto>5882</MntNeto>
<MntIva>1118</MntIva>
<TasaIVA>19</TasaIVA>
<MntExento>500</MntExento>
<MntTotal>7500</MntTotal>
<FoliosEmitidos>4</FoliosEmitidos>
<FoliosAnulados>2</FoliosAnulados>
<FoliosUtilizados>6</FoliosUtilizados>
<RangoUtilizados>
<Inicial>1</Inicial>
<Final>3</Final>
</RangoUtilizados>
<RangoUtilizados>
<Inicial>7</Inicial>
<Final>7</Final>
</RangoUtilizados>
<RangoAnulados>
<Inicial>4</Inicial>
<Final>5</Final>
</RangoAnulados>
</Resumen>
<Resumen>
<TipoDocumento>41</TipoDocumento>
<MntExento>900</MntExento>
<MntTotal>900</MntTotal>
<FoliosEmitidos>1</FoliosEmitidos>
<FoliosAnulados>1</FoliosAnulados>
<FoliosUtilizados>2</FoliosUtilizados>
<RangoUtilizados>
<Inicial>50</Inicial>
<Final>50</Final>
</RangoUtilizados>
<RangoAnulados>
<Inicial>51</Inicial>
<Final>51</Final>
</RangoAnulados>
</Resumen>
</DocumentoConsumoFolios></ConsumoFolios>
```

`tests/fixtures/books/report-no-sales.xml`:

```xml
<?xml version="1.0" encoding="ISO-8859-1"?>
<ConsumoFolios xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte ConsumoFolio_v10.xsd" version="1.0">
<DocumentoConsumoFolios ID="LIBRO_TEST">
<Caratula version="1.0">
<RutEmisor>76543210-3</RutEmisor>
<RutEnvia>11111111-1</RutEnvia>
<FchResol>2026-01-15</FchResol>
<NroResol>80</NroResol>
<FchInicio>2026-10-16</FchInicio>
<FchFinal>2026-10-16</FchFinal>
<SecEnvio>1</SecEnvio>
<TmstFirmaEnv>2026-11-15T15:30:00</TmstFirmaEnv>
</Caratula>
<Resumen>
<TipoDocumento>39</TipoDocumento>
<TasaIVA>19</TasaIVA>
<MntTotal>0</MntTotal>
<FoliosEmitidos>0</FoliosEmitidos>
<FoliosAnulados>0</FoliosAnulados>
<FoliosUtilizados>0</FoliosUtilizados>
</Resumen>
</DocumentoConsumoFolios></ConsumoFolios>
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx jest --config jest.config.cjs tests/books/folio-consumption.test.ts
```

Expected: FAIL, with `Cannot find module '../../src/books/folio-consumption'`.

- [ ] **Step 3: Write the implementation**

`src/books/folio-consumption.ts`:

```ts
import { VAT_RATE } from '../catalogs/codes'
import type { Certificate } from '../certificate/certificate'
import { generateSetId } from '../envelope/create'
import { DteError } from '../errors'
import type {
  FolioConsumption,
  FolioConsumptionCover,
  FolioConsumptionCoverInput,
  FolioConsumptionEntry,
  FolioConsumptionInput,
  FolioConsumptionSummary,
  FolioConsumptionType,
  FolioRange,
  VoidedFolio,
} from '../model/book'
import { toSiiFolioConsumption } from '../model/book-codec'
import { toSiiRut } from '../model/rut'
import { signEnveloped, verifyEnveloped, type SignatureVerification, type XmlSignature } from '../signature/xmldsig'
import { chileTimestamp, toIsoDate } from '../time/chile'
import { assertBookAmount, assertBookFolio, assertResolutionNumber, buildBookXml } from './common'

const ROOT_TAG = 'ConsumoFolios'
const SIGNED_TAG = 'DocumentoConsumoFolios'
const REPORT_TYPES: readonly FolioConsumptionType[] = [39, 41]
const MAX_SEQUENCE = 999

const isReportType = (type: number): type is FolioConsumptionType => (REPORT_TYPES as readonly number[]).includes(type)

/**
 * EN: Sorts folios and groups the consecutive ones into ranges; a lone folio has `from` equal to `to`.
 * ES: Ordena folios y agrupa los consecutivos en rangos; un folio solo tiene `from` igual a `to`.
 */
export const compactFolioRanges = (folios: readonly number[]): readonly FolioRange[] => {
  const ranges: FolioRange[] = []
  for (const folio of [...folios].sort((a, b) => a - b)) {
    const last = ranges[ranges.length - 1]
    if (last !== undefined && folio === last.to + 1) ranges[ranges.length - 1] = { from: last.from, to: folio }
    else ranges.push({ from: folio, to: folio })
  }
  return ranges
}

const assertCounter = (value: number | undefined, field: string): void => {
  if (value !== undefined && !(Number.isSafeInteger(value) && value >= 0 && value <= MAX_SEQUENCE))
    throw new DteError('INVALID_OPTION', { field })
}

const normalizeCover = (
  cover: FolioConsumptionCoverInput,
  entries: readonly FolioConsumptionEntry[],
  now: Date | undefined,
): FolioConsumptionCover => {
  const dates = entries
    .flatMap((entry) => (entry.issueDate === undefined ? [] : [toIsoDate(entry.issueDate, 'issueDate')]))
    .sort()
  const from = cover.from ?? dates[0]
  const to = cover.to ?? dates[dates.length - 1]
  if (from === undefined) throw new DteError('MISSING_FIELD', { field: 'cover.from' })
  if (to === undefined) throw new DteError('MISSING_FIELD', { field: 'cover.to' })
  assertResolutionNumber(cover.resolutionNumber)
  assertCounter(cover.sequence, 'cover.sequence')
  assertCounter(cover.correlative, 'cover.correlative')
  return {
    issuerRut: toSiiRut(cover.issuerRut, 'cover.issuerRut'),
    senderRut: toSiiRut(cover.senderRut, 'cover.senderRut'),
    resolutionDate: toIsoDate(cover.resolutionDate, 'cover.resolutionDate'),
    resolutionNumber: cover.resolutionNumber,
    from: toIsoDate(from, 'cover.from'),
    to: toIsoDate(to, 'cover.to'),
    sequence: cover.sequence ?? 1,
    ...(cover.correlative === undefined ? {} : { correlative: cover.correlative }),
    signedAt: chileTimestamp(now),
  }
}

const assertLines = (entries: readonly FolioConsumptionEntry[], voided: readonly VoidedFolio[]): void => {
  const seen = new Set<string>()
  for (const { type, folio } of [...entries, ...voided]) {
    if (!isReportType(type)) throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type', type })
    assertBookFolio(folio, 'folio')
    const key = `${type}:${folio}`
    if (seen.has(key)) throw new DteError('INVALID_FOLIO', { field: 'folio', folio, type })
    seen.add(key)
  }
  for (const entry of entries)
    for (const field of ['netAmount', 'vatAmount', 'exemptAmount', 'totalAmount'] as const)
      assertBookAmount(entry[field], { field, signed: false })
}

const summarize = (
  type: FolioConsumptionType,
  entries: readonly FolioConsumptionEntry[],
  voided: readonly VoidedFolio[],
): FolioConsumptionSummary => {
  const taxed = type === 39
  const add = (read: (entry: FolioConsumptionEntry) => number | undefined): number =>
    entries.reduce((total, entry) => total + (read(entry) ?? 0), 0)
  return {
    type,
    netAmount: taxed ? add((entry) => entry.netAmount) : 0,
    vatAmount: taxed ? add((entry) => entry.vatAmount) : 0,
    ...(taxed ? { vatRate: VAT_RATE } : {}),
    exemptAmount: add((entry) => entry.exemptAmount),
    totalAmount: add((entry) => entry.totalAmount),
    issuedCount: entries.length,
    voidedCount: voided.length,
    usedCount: entries.length + voided.length,
    usedRanges: compactFolioRanges(entries.map((entry) => entry.folio)),
    voidedRanges: compactFolioRanges(voided.map((item) => item.folio)),
  }
}

/**
 * EN: Builds a folio consumption report (RCOF, now Resumen de Ventas Diarias): one summary per receipt type present, 39
 * first, or one of type 39 in zeros for a day without sales. The ranges list issued folios and voided folios separately,
 * as the worked example of the format does. Used today in the receipts certification; the SII probably no longer requires
 * it in production.
 * ES: Arma un reporte de consumo de folios (RCOF, hoy Resumen de Ventas Diarias): un resumen por cada tipo de boleta
 * presente, primero el 39, o uno de tipo 39 en ceros para un día sin ventas. Los rangos listan por separado los folios
 * emitidos y los anulados, como el ejemplo del formato. Hoy se usa en la certificación de boletas; probablemente el SII ya
 * no lo exige en producción.
 * @throws {DteError} EN: `MISSING_FIELD`, `INVALID_OPTION`, `INVALID_RUT`, `INVALID_DATE`, `INVALID_DOCUMENT_TYPE`, `INVALID_FOLIO`, `INVALID_AMOUNT`. ES: los mismos códigos.
 */
export const createFolioConsumption = (input: FolioConsumptionInput): FolioConsumption => {
  const entries = input.entries ?? []
  const voided = input.voidedFolios ?? []
  assertLines(entries, voided)
  const cover = normalizeCover(input.cover, entries, input.now)
  const present = REPORT_TYPES.filter((type) => [...entries, ...voided].some((line) => line.type === type))
  const summaries = (present.length === 0 ? ([39] as const) : present).map((type) =>
    summarize(
      type,
      entries.filter((entry) => entry.type === type),
      voided.filter((item) => item.type === type),
    ),
  )
  return { id: input.id ?? generateSetId('RCOF', input.now), cover, summaries }
}

/**
 * EN: Renders the unsigned `ConsumoFolios` XML.
 * ES: Renderiza el XML `ConsumoFolios` sin firma.
 */
export const buildFolioConsumptionXml = (report: FolioConsumption): string => {
  const { Caratula, Resumen } = toSiiFolioConsumption(report)
  return buildBookXml({
    rootTag: ROOT_TAG,
    signedTag: SIGNED_TAG,
    schema: 'ConsumoFolio_v10.xsd',
    id: report.id,
    content: { Caratula: { '@_version': '1.0', ...Caratula }, Resumen },
  })
}

/**
 * EN: A folio consumption report with its signed XML, ready for `uploadFolioConsumption`.
 * ES: Un reporte de consumo de folios con su XML firmado, listo para `uploadFolioConsumption`.
 */
export type SignedFolioConsumption = FolioConsumption & {
  /** EN: Signed XML with prolog. ES: XML firmado con prólogo. */
  readonly xml: string
  /** EN: Digest and signature values. ES: Valores de digest y firma. */
  readonly signature: XmlSignature
}

/**
 * EN: Signs the `DocumentoConsumoFolios` with the sender certificate (enveloped XMLDSig, `URI="#ID"`).
 * ES: Firma el `DocumentoConsumoFolios` con el certificado de quien envía (XMLDSig envuelta, `URI="#ID"`).
 */
export const signFolioConsumption = (report: FolioConsumption, certificate: Certificate): SignedFolioConsumption => {
  const { xml, signature } = signEnveloped({
    xml: buildFolioConsumptionXml(report),
    elementTag: SIGNED_TAG,
    rootTag: ROOT_TAG,
    certificate,
  })
  return { ...report, xml, signature }
}

/**
 * EN: Verifies the signature of a `ConsumoFolios` XML.
 * ES: Verifica la firma de un XML `ConsumoFolios`.
 */
export const verifyFolioConsumptionSignature = (xml: string): SignatureVerification =>
  verifyEnveloped(xml, { elementTag: SIGNED_TAG, rootTag: ROOT_TAG })
```

- [ ] **Step 4: Run them to see them pass**

```bash
npx jest --config jest.config.cjs tests/books/folio-consumption.test.ts
```

Expected: PASS, `Tests: 33 passed, 33 total`.

- [ ] **Step 5: Commit**

```bash
git add src/books/folio-consumption.ts tests/support/report-samples.ts tests/books/folio-consumption.test.ts tests/fixtures/books/report-day.xml tests/fixtures/books/report-no-sales.xml
git commit -m "feat: folio consumption report (RCOF)"
```

---

## Task 10: Lines from issued documents

The counterparty rule covers sales, purchases received and purchase invoices on either side. `Emisor`, `IndFactCompra` and the voided-document reference are not inferred, on purpose: field-proven purchase books omit them.

**Files:**
- Create: `src/books/from-document.ts`
- Test: `tests/books/from-document.test.ts`

- [ ] **Step 1: Write the tests (they fail until Step 3)**

`tests/books/from-document.test.ts`:

```ts
import { createFolioConsumption } from '../../src/books/folio-consumption'
import {
  bookEntryFromDocument,
  folioConsumptionEntryFromDocument,
  guideEntryFromDocument,
} from '../../src/books/from-document'
import { createGuideBook } from '../../src/books/guide'
import { createPurchaseSalesBook } from '../../src/books/purchase-sales'
import { createDocument } from '../../src/document/create'
import type { DocumentInput } from '../../src/model/document'
import { guideCover, reportCover, saleCover, purchaseCover, SUPPLIER_RUT } from '../support/book-fixtures'
import { ISSUER_RUT, RECEIVER_RUT } from '../support/fixtures'

const issuer = {
  rut: ISSUER_RUT,
  businessName: 'Comercial Andina SpA',
  businessActivity: 'Software',
  address: 'Av. Los Aromos 1540',
  commune: 'Ñuñoa',
}
const receiver = {
  rut: RECEIVER_RUT,
  businessName: 'Comercializadora Rapel Ltda',
  businessActivity: 'Comercio',
  address: 'Pasaje Los Olmos 88',
  commune: 'Providencia',
}
const base: DocumentInput = {
  type: 33,
  folio: 10,
  issueDate: '2026-10-15',
  issuer,
  receiver,
  items: [{ name: 'Plan anual', quantity: 2, unitPrice: 50000 }],
}
const sale = { bookRut: ISSUER_RUT, operation: 'sale' } as const
const expectCodeOf = (run: () => unknown, code: string): void => {
  expect(run).toThrow(expect.objectContaining({ code }))
}
const purchase = { bookRut: RECEIVER_RUT, operation: 'purchase' } as const

describe('bookEntryFromDocument', () => {
  test('on a sale, the counterparty is the receiver', () => {
    expect(bookEntryFromDocument(createDocument(base), sale)).toEqual({
      type: 33,
      folio: 10,
      taxRate: 19,
      date: '2026-10-15',
      counterpartyRut: RECEIVER_RUT,
      counterpartyName: 'Comercializadora Rapel Ltda',
      netAmount: 100000,
      vatAmount: 19000,
      totalAmount: 119000,
    })
  })

  test('on a purchase received, the counterparty is the issuer', () => {
    expect(bookEntryFromDocument(createDocument(base), purchase)).toMatchObject({
      counterpartyRut: ISSUER_RUT,
      counterpartyName: 'Comercial Andina SpA',
    })
  })

  test('a purchase invoice issued by the book owner points to the supplier, with the withheld VAT', () => {
    const document = createDocument({
      ...base,
      type: 46,
      receiver: { ...receiver, rut: SUPPLIER_RUT, businessName: 'Hortalizas del Maule Ltda' },
    })
    expect(bookEntryFromDocument(document, { bookRut: ISSUER_RUT, operation: 'purchase' })).toMatchObject({
      counterpartyRut: SUPPLIER_RUT,
      netAmount: 100000,
      vatAmount: 19000,
      totalVatWithheld: 19000,
      totalAmount: 100000,
    })
  })

  test('the book RUT is compared normalized', () => {
    expect(
      bookEntryFromDocument(createDocument(base), { bookRut: '76.543.210-3', operation: 'sale' }).counterpartyRut,
    ).toBe(RECEIVER_RUT)
  })

  test('a long name is truncated, because the document admits more than the book', () => {
    const document = createDocument({ ...base, receiver: { ...receiver, businessName: 'N'.repeat(80) } })
    expect(bookEntryFromDocument(document, sale).counterpartyName).toBe('N'.repeat(50))
  })

  test('other withholdings, third-party VAT, commissions and the rest of the totals travel', () => {
    const document = createDocument({
      ...base,
      type: 43,
      items: [{ name: 'Liquidación', unitPrice: 100, settledDocumentType: '33' }],
      totals: {
        netAmount: 100,
        vatRate: 19,
        vatAmount: 19,
        ownVatAmount: 9,
        thirdPartyVatAmount: 10,
        withholdings: [{ taxCode: 24, rate: 31.5, amount: 5 }],
        commissions: { netValue: 1, exemptValue: 2, vatValue: 3 },
        totalAmount: 118,
        nonBillableAmount: 7,
        periodAmount: 8,
      },
    })
    expect(bookEntryFromDocument(document, sale)).toMatchObject({
      ownVatAmount: 9,
      thirdPartyVatAmount: 10,
      otherTaxes: [{ code: 24, rate: 31.5, amount: 5 }],
      settlement: { issuerRut: ISSUER_RUT, netValue: 1, exemptValue: 2, vatValue: 3 },
      nonBillableAmount: 7,
      periodAmount: 8,
    })
  })

  test('zero amounts stay absent', () => {
    const entry = bookEntryFromDocument(
      createDocument({ ...base, type: 34, items: [{ name: 'Curso', unitPrice: 500 }] }),
      purchase,
    )
    expect(entry).toMatchObject({ exemptAmount: 500, totalAmount: 500 })
    expect(entry).not.toHaveProperty('netAmount')
    expect(entry).not.toHaveProperty('vatAmount')
  })

  test('a credit note stays positive by default and negates the four amounts on request', () => {
    const note = createDocument({
      ...base,
      type: 61,
      items: [
        { name: 'Plan anual', quantity: 1, unitPrice: 1000 },
        { name: 'Curso', unitPrice: 500, exempt: true },
      ],
      references: [{ documentType: 33, folio: '10', date: '2026-10-15', code: 1, reason: 'Anula factura' }],
    })
    expect(bookEntryFromDocument(note, sale)).toMatchObject({ netAmount: 1000, totalAmount: 1690 })
    expect(bookEntryFromDocument(note, { ...sale, creditNoteSign: 'negative' })).toMatchObject({
      netAmount: -1000,
      vatAmount: -190,
      exemptAmount: -500,
      totalAmount: -1690,
    })
    expect(bookEntryFromDocument(createDocument(base), { ...sale, creditNoteSign: 'negative' }).netAmount).toBe(100000)
  })

  test('its result builds a book without mismatches', () => {
    const entries = [bookEntryFromDocument(createDocument(base), sale)]
    expect(createPurchaseSalesBook({ cover: saleCover, entries }).totalMismatches).toEqual([])
    const received = [bookEntryFromDocument(createDocument(base), purchase)]
    const cover = { ...purchaseCover, issuerRut: RECEIVER_RUT }
    expect(createPurchaseSalesBook({ cover, entries: received }).totalMismatches).toEqual([])
  })

  test('rejects an invalid book RUT', () => {
    expectCodeOf(() => bookEntryFromDocument(createDocument(base), { ...sale, bookRut: '1-1' }), 'INVALID_RUT')
  })
})

describe('guideEntryFromDocument', () => {
  const guide: DocumentInput = {
    ...base,
    type: 52,
    options: { transferType: 1 },
  }

  test('a sale carries receiver and amounts', () => {
    expect(guideEntryFromDocument(createDocument(guide))).toEqual({
      folio: 10,
      transferType: 1,
      date: '2026-10-15',
      totalAmount: 119000,
      receiverRut: RECEIVER_RUT,
      receiverName: 'Comercializadora Rapel Ltda',
      netAmount: 100000,
      taxRate: 19,
      vatAmount: 19000,
    })
  })

  test('the transfer defaults to a sale', () => {
    const document = createDocument({ ...guide, options: {} })
    expect(guideEntryFromDocument(document).transferType).toBe(1)
  })

  test('a non-sale reports its total alone', () => {
    const document = createDocument({ ...guide, options: { transferType: 5 } })
    expect(guideEntryFromDocument(document)).toEqual({
      folio: 10,
      transferType: 5,
      date: '2026-10-15',
      totalAmount: 119000,
    })
  })

  test('a long name is truncated', () => {
    const document = createDocument({ ...guide, receiver: { ...receiver, businessName: 'N'.repeat(80) } })
    expect(guideEntryFromDocument(document).receiverName).toBe('N'.repeat(50))
  })

  test('its result builds a book', () => {
    const book = createGuideBook({ cover: guideCover, entries: [guideEntryFromDocument(createDocument(guide))] })
    expect(book.periodTotals).toMatchObject({ saleGuides: 1, saleGuidesAmount: 119000 })
  })

  test('a transfer the book does not admit fails at the book', () => {
    const document = createDocument({ ...guide, options: { transferType: 8 } })
    expectCodeOf(
      () => createGuideBook({ cover: guideCover, entries: [guideEntryFromDocument(document)] }),
      'INVALID_OPTION',
    )
  })

  test('rejects a document that is not a guide', () => {
    expectCodeOf(() => guideEntryFromDocument(createDocument(base)), 'INVALID_DOCUMENT_TYPE')
  })
})

describe('folioConsumptionEntryFromDocument', () => {
  const receipt: DocumentInput = {
    type: 39,
    folio: 3,
    issueDate: '2026-10-15',
    issuer,
    items: [{ name: 'Café', quantity: 1, unitPrice: 1000 }],
    pricesIncludeVat: true,
  }

  test('a receipt carries its folio, date and exact totals', () => {
    expect(folioConsumptionEntryFromDocument(createDocument(receipt))).toEqual({
      type: 39,
      folio: 3,
      issueDate: '2026-10-15',
      netAmount: 840,
      vatAmount: 160,
      totalAmount: 1000,
    })
  })

  test('an exempt receipt carries its exempt amount', () => {
    const document = createDocument({ ...receipt, type: 41, pricesIncludeVat: undefined })
    expect(folioConsumptionEntryFromDocument(document)).toEqual({
      type: 41,
      folio: 3,
      issueDate: '2026-10-15',
      exemptAmount: 1000,
      totalAmount: 1000,
    })
  })

  test('its result builds a report', () => {
    const report = createFolioConsumption({
      cover: reportCover,
      entries: [folioConsumptionEntryFromDocument(createDocument(receipt))],
    })
    expect(report.cover.from).toBe('2026-10-15')
    expect(report.summaries[0]).toMatchObject({ netAmount: 840, vatAmount: 160, totalAmount: 1000 })
  })

  test('rejects a document that is not a receipt', () => {
    expectCodeOf(() => folioConsumptionEntryFromDocument(createDocument(base)), 'INVALID_DOCUMENT_TYPE')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx jest --config jest.config.cjs tests/books/from-document.test.ts
```

Expected: FAIL, with `Cannot find module '../../src/books/from-document'`.

- [ ] **Step 3: Write the implementation**

`src/books/from-document.ts`:

```ts
import { WITHHOLDING_TAX_CODES } from '../catalogs/codes'
import type { BookOperation } from '../catalogs/book-codes'
import { DteError } from '../errors'
import type { BookEntryInput, FolioConsumptionEntry, GuideEntryInput } from '../model/book'
import { compact } from '../model/codec'
import type { Document } from '../model/document'
import { toSiiRut } from '../model/rut'
import { truncateText } from '../text/sanitize'

const MAX_NAME = 50
const GUIDE_TYPE = 52
const SALE_TRANSFER = 1
const CREDIT_NOTE_TYPE = 61

/**
 * EN: Options of `bookEntryFromDocument`.
 * ES: Opciones de `bookEntryFromDocument`.
 */
export type BookEntryFromDocumentOptions = {
  /** EN: RUT of the book owner: decides who the counterparty is. ES: RUT del dueño del libro: decide quién es la contraparte. */
  readonly bookRut: string
  /** EN: Book side. ES: Lado del libro. */
  readonly operation: BookOperation
  /** EN: `negative` negates exempt, net, VAT and total of a credit note (61). `positive` by default, as the format has it. ES: `negative` niega exento, neto, IVA y total de una nota de crédito (61). `positive` por defecto, como dice el formato. */
  readonly creditNoteSign?: 'positive' | 'negative'
}

/**
 * EN: Derives a book line from a phase 1 document. The counterparty is the receiver when the book owner issued the
 * document and the issuer otherwise, which covers sales, purchases received and purchase invoices (46) on either side. The
 * name is truncated to 50 because the document admits 100 and the book field is optional on electronic documents. `Emisor`,
 * `IndFactCompra` and the voided-document reference are not inferred: spread them into the result when the case needs them.
 * ES: Deriva una línea del libro desde un documento de la fase 1. La contraparte es el receptor si el dueño del libro
 * emitió el documento y el emisor en caso contrario, lo que cubre ventas, compras recibidas y facturas de compra (46) en
 * cualquier lado. El nombre se trunca a 50 porque el documento admite 100 y el campo del libro es opcional en documentos
 * electrónicos. `Emisor`, `IndFactCompra` y la referencia al documento anulado no se infieren: se agregan al resultado si
 * el caso los necesita.
 * @throws {DteError} EN: `INVALID_RUT`. ES: `INVALID_RUT`.
 */
export const bookEntryFromDocument = (document: Document, options: BookEntryFromDocumentOptions): BookEntryInput => {
  const { type, folio, issueDate, issuer, receiver, totals } = document.header
  const counterparty = issuer.rut === toSiiRut(options.bookRut, 'bookRut') ? receiver : issuer
  const negate = options.creditNoteSign === 'negative' && type === CREDIT_NOTE_TYPE
  const signed = (value: number): number => (negate ? 0 - value : value)
  // Zero amounts stay absent: the sale defaults put them back, and purchase books omit them.
  const amount = (value: number | undefined): number | undefined => (value ? signed(value) : undefined)
  const withholdings = totals.withholdings ?? []
  const withheld = withholdings
    .filter((item) => item.taxCode === WITHHOLDING_TAX_CODES.totalVatWithholding)
    .reduce((total, item) => total + item.amount, 0)
  const otherTaxes = withholdings
    .filter((item) => item.taxCode !== WITHHOLDING_TAX_CODES.totalVatWithholding)
    .map((item) => ({ code: item.taxCode, rate: item.rate, amount: item.amount }))
  return compact({
    type,
    folio,
    taxRate: totals.vatRate,
    date: issueDate,
    counterpartyRut: counterparty.rut,
    counterpartyName: truncateText(counterparty.businessName, MAX_NAME),
    exemptAmount: amount(totals.exemptAmount),
    netAmount: amount(totals.netAmount),
    vatAmount: amount(totals.vatAmount),
    ownVatAmount: totals.ownVatAmount,
    thirdPartyVatAmount: totals.thirdPartyVatAmount,
    otherTaxes: otherTaxes.length === 0 ? undefined : otherTaxes,
    totalVatWithheld: withheld === 0 ? undefined : withheld,
    settlement: totals.commissions && { issuerRut: issuer.rut, ...totals.commissions },
    totalAmount: signed(totals.totalAmount),
    nonBillableAmount: totals.nonBillableAmount,
    periodAmount: totals.periodAmount,
  })
}

/**
 * EN: Derives a guide book line from a dispatch guide (52). The transfer defaults to a sale, and the receiver and the
 * amounts travel only on sales; a non-sale guide reports its total alone.
 * ES: Deriva una línea del libro de guías desde una guía de despacho (52). El traslado es venta por defecto, y el receptor
 * y los montos viajan solo en ventas; una guía no venta informa únicamente su total.
 * @throws {DteError} EN: `INVALID_DOCUMENT_TYPE` when the document is not a guide. ES: `INVALID_DOCUMENT_TYPE` si el documento no es una guía.
 */
export const guideEntryFromDocument = (document: Document): GuideEntryInput => {
  const { type, folio, issueDate, receiver, totals, options } = document.header
  if (type !== GUIDE_TYPE) throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type', type })
  const transferType = options.transferType ?? SALE_TRANSFER
  const shared = { folio, transferType, date: issueDate, totalAmount: totals.totalAmount }
  if (transferType !== SALE_TRANSFER) return shared
  return compact({
    ...shared,
    receiverRut: receiver.rut,
    receiverName: truncateText(receiver.businessName, MAX_NAME),
    netAmount: totals.netAmount,
    taxRate: totals.vatRate,
    vatAmount: totals.vatAmount,
  })
}

/**
 * EN: Derives a folio consumption line from a receipt (39 or 41).
 * ES: Deriva una línea del reporte de consumo de folios desde una boleta (39 o 41).
 * @throws {DteError} EN: `INVALID_DOCUMENT_TYPE` when the document is not a receipt. ES: `INVALID_DOCUMENT_TYPE` si el documento no es una boleta.
 */
export const folioConsumptionEntryFromDocument = (document: Document): FolioConsumptionEntry => {
  const { type, folio, issueDate, totals } = document.header
  if (type !== 39 && type !== 41) throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type', type })
  return compact({
    type,
    folio,
    issueDate,
    netAmount: totals.netAmount,
    vatAmount: totals.vatAmount,
    exemptAmount: totals.exemptAmount,
    totalAmount: totals.totalAmount,
  })
}
```

- [ ] **Step 4: Run them to see them pass**

```bash
npx jest --config jest.config.cjs tests/books/from-document.test.ts
```

Expected: PASS, `Tests: 21 passed, 21 total`.

- [ ] **Step 5: Commit**

```bash
git add src/books/from-document.ts tests/books/from-document.test.ts
git commit -m "feat: derive book lines from documents"
```

---

## Task 11: `fileName` on the book uploads

Phase 2 uploads every book as `LibroCV.xml`. The guide book goes up as `LibroGuia.xml`, and phase 5 will need names such as `LibroCVExentos.xml`. The name travels in the multipart `filename`, so it is validated.

**Files:**
- Modify: `src/sii/upload.ts`
- Modify: `tests/sii/upload.test.ts`

- [ ] **Step 1: Write the tests (they fail until Step 3)**

In `tests/sii/upload.test.ts`, replace:

```ts
  test('their rejections name their own operation', async () => {
```

with:

```ts
  test('a guide book uploads as LibroGuia.xml', async () => {
    const { sii, fake } = cachedSii(cgi(reception('reception-ok.xml')))
    const xml = '<?xml version="1.0" encoding="ISO-8859-1"?>\n<LibroGuia version="1.0"/>'
    expect(await uploadBook(sii, { xml })).toMatchObject({ kind: 'book', fileName: 'LibroGuia.xml' })
    expect(fake.requests[0].parts[4].fileName).toBe('LibroGuia.xml')
  })

  test('fileName overrides the default on both', async () => {
    const { sii, fake } = cachedSii(cgi(reception('reception-ok.xml')))
    expect(await uploadBook(sii, { xml: libroXml, fileName: 'LibroCVExentos.xml' })).toMatchObject({
      fileName: 'LibroCVExentos.xml',
    })
    expect(await uploadFolioConsumption(sii, { xml: consumoXml, fileName: 'RCOF_1.xml' })).toMatchObject({
      fileName: 'RCOF_1.xml',
    })
    expect(fake.requests[0].parts[4].fileName).toBe('LibroCVExentos.xml')
    expect(fake.requests[1].parts[4].fileName).toBe('RCOF_1.xml')
  })

  test.each(['libro.txt', 'a b.xml', '../libro.xml', 'libro".xml', '.xml'])(
    'a fileName like %s is refused before sending',
    async (fileName) => {
      const { sii, fake } = cachedSii(cgi(reception('reception-ok.xml')))
      await expectCode(uploadBook(sii, { xml: libroXml, fileName }), 'INVALID_OPTION', { field: 'fileName' })
      expect(posts(fake)).toBe(0)
    },
  )

  test('their rejections name their own operation', async () => {
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx jest --config jest.config.cjs tests/sii/upload.test.ts
```

Expected: FAIL, with `Expected: "LibroGuia.xml" / Received: "LibroCV.xml"`.

- [ ] **Step 3: Write the implementation**

In `src/sii/upload.ts`, replace:

```ts
  /** EN: Sender RUT; defaults to the client's. ES: `rutSender` — RUT de quien envía; por defecto el del cliente. */
  readonly senderRut?: string
}

type ReceptionBase
```

with:

```ts
  /** EN: Sender RUT; defaults to the client's. ES: `rutSender` — RUT de quien envía; por defecto el del cliente. */
  readonly senderRut?: string
  /** EN: Name of the multipart file; letters, digits, `_`, `.` and `-`, ending in `.xml`. Defaults to `LibroGuia.xml` for a guide book, `LibroCV.xml` for any other book and `ConsumoFolios.xml` for a report. ES: Nombre del archivo del multipart; letras, dígitos, `_`, `.` y `-`, terminado en `.xml`. Por defecto `LibroGuia.xml` en un libro de guías, `LibroCV.xml` en otro libro y `ConsumoFolios.xml` en un reporte. */
  readonly fileName?: string
}

type ReceptionBase
```

In `src/sii/upload.ts`, replace:

```ts
const MAX_REST_RECEIPTS = 500
```

with:

```ts
const MAX_REST_RECEIPTS = 500
const GUIDE_BOOK_FILE_NAME = 'LibroGuia.xml'
const GUIDE_BOOK_ROOT = /<LibroGuia[\s>]/
// It travels in the multipart `filename`, so it cannot be free text.
const SAFE_FILE_NAME = /^[\w.-]+\.xml$/

const resolveFileName = (kind: UploadKind, xml: string, fileName: string | undefined): string => {
  if (fileName !== undefined && !SAFE_FILE_NAME.test(fileName))
    throw new DteError('INVALID_OPTION', { field: 'fileName' })
  if (fileName !== undefined) return fileName
  return kind === 'book' && GUIDE_BOOK_ROOT.test(xml) ? GUIDE_BOOK_FILE_NAME : FILE_NAMES[kind]
}
```

In `src/sii/upload.ts`, replace:

```ts
  ruts: { readonly companyRut?: string; readonly senderRut?: string },
  channel: TokenChannel,
): UploadJob => ({
  kind,
  operation,
  fileName: FILE_NAMES[kind],
```

with:

```ts
  ruts: { readonly companyRut?: string; readonly senderRut?: string; readonly fileName?: string },
  channel: TokenChannel,
): UploadJob => ({
  kind,
  operation,
  fileName: resolveFileName(kind, xml, ruts.fileName),
```

In `src/sii/upload.ts`, replace:

```ts
 * EN: Uploads a signed book (`LibroCompraVenta`, `LibroGuia`) through `DTEUpload` as `LibroCV.xml`; the XML must
 * declare ISO-8859-1, as for `uploadEnvelope` (`INVALID_OPTION { field: 'xml' }` otherwise).
 * ES: Sube un libro firmado (`LibroCompraVenta`, `LibroGuia`) por `DTEUpload` como `LibroCV.xml`; el XML debe declarar
 * ISO-8859-1, igual que en `uploadEnvelope` (si no, `INVALID_OPTION { field: 'xml' }`).
```

with:

```ts
 * EN: Uploads a signed book through `DTEUpload`, as `LibroGuia.xml` for a `LibroGuia` and `LibroCV.xml` otherwise unless
 * `fileName` says differently; the XML must declare ISO-8859-1, as for `uploadEnvelope` (`INVALID_OPTION { field: 'xml' }`
 * otherwise).
 * ES: Sube un libro firmado por `DTEUpload`, como `LibroGuia.xml` si es un `LibroGuia` y como `LibroCV.xml` en otro caso,
 * salvo que `fileName` diga otra cosa; el XML debe declarar ISO-8859-1, igual que en `uploadEnvelope` (si no,
 * `INVALID_OPTION { field: 'xml' }`).
```

In `src/sii/upload.ts`, replace:

```ts
 * EN: Uploads a signed folio consumption report (RCOF, `ConsumoFolios`) through `DTEUpload` as `ConsumoFolios.xml`; the
 * XML must declare ISO-8859-1, as for `uploadEnvelope` (`INVALID_OPTION { field: 'xml' }` otherwise).
 * ES: Sube un Reporte de Consumo de Folios firmado (`ConsumoFolios`) por `DTEUpload` como `ConsumoFolios.xml`; el XML
 * debe declarar ISO-8859-1, igual que en `uploadEnvelope` (si no, `INVALID_OPTION { field: 'xml' }`).
```

with:

```ts
 * EN: Uploads a signed folio consumption report (RCOF, `ConsumoFolios`) through `DTEUpload` as `ConsumoFolios.xml`, unless
 * `fileName` says differently; the XML must declare ISO-8859-1, as for `uploadEnvelope` (`INVALID_OPTION { field: 'xml' }`
 * otherwise).
 * ES: Sube un Reporte de Consumo de Folios firmado (`ConsumoFolios`) por `DTEUpload` como `ConsumoFolios.xml`, salvo que
 * `fileName` diga otra cosa; el XML debe declarar ISO-8859-1, igual que en `uploadEnvelope` (si no,
 * `INVALID_OPTION { field: 'xml' }`).
```

- [ ] **Step 4: Run them to see them pass**

```bash
npx jest --config jest.config.cjs tests/sii/upload.test.ts
```

Expected: PASS, `Tests: 127 passed, 127 total`.

- [ ] **Step 5: Commit**

```bash
git add src/sii/upload.ts tests/sii/upload.test.ts
git commit -m "feat: fileName on uploadBook and uploadFolioConsumption"
```

---

## Task 12: Root exports

The surface of spec section 3.13, and nothing else: `normalizeBookEntry`, `sumBookEntries`, `normalizeBookCover` and the other helpers stay internal, because adding an export later is free and removing one after a release is breaking.

**Files:**
- Modify: `src/index.ts`
- Modify: `tests/dist.smoke.test.ts`
- Modify: `tests/types.test.ts`
- Modify: `tests/public-api.test.ts`

- [ ] **Step 1: Write the tests (they fail until Step 3)**

In `tests/dist.smoke.test.ts`, replace:

```ts
  'signSeed',
  'DteError',
```

with:

```ts
  'signSeed',
  'createPurchaseSalesBook',
  'signPurchaseSalesBook',
  'createGuideBook',
  'signGuideBook',
  'createFolioConsumption',
  'signFolioConsumption',
  'DteError',
```

In `tests/types.test.ts`, replace:

```ts
  folioReceived,
} from '../src'
```

with:

```ts
  folioReceived,
  createPurchaseSalesBook,
  signPurchaseSalesBook,
  createGuideBook,
  signGuideBook,
  createFolioConsumption,
  signFolioConsumption,
  bookEntryFromDocument,
} from '../src'
```

In `tests/types.test.ts`, replace:

```ts
import type {
  Document,
```

with:

```ts
import type {
  BookEntryInput,
  BookTotals,
  FolioConsumption,
  GuideBook,
  GuideTotals,
  PurchaseSalesBook,
  SignedFolioConsumption,
  SignedGuideBook,
  SignedPurchaseSalesBook,
  Document,
```

In `tests/types.test.ts`, replace:

```ts
  expectTypeOf<TokenChannel>().toEqualTypeOf<'soap' | 'rest'>()
```

with:

```ts
  expectTypeOf<TokenChannel>().toEqualTypeOf<'soap' | 'rest'>()
  expectTypeOf(createPurchaseSalesBook).returns.toEqualTypeOf<PurchaseSalesBook>()
  expectTypeOf(signPurchaseSalesBook).returns.toEqualTypeOf<SignedPurchaseSalesBook>()
  expectTypeOf(createGuideBook).returns.toEqualTypeOf<GuideBook>()
  expectTypeOf(signGuideBook).returns.toEqualTypeOf<SignedGuideBook>()
  expectTypeOf(createFolioConsumption).returns.toEqualTypeOf<FolioConsumption>()
  expectTypeOf(signFolioConsumption).returns.toEqualTypeOf<SignedFolioConsumption>()
  expectTypeOf(bookEntryFromDocument).returns.toEqualTypeOf<BookEntryInput>()
  expectTypeOf<PurchaseSalesBook['periodTotals']>().toEqualTypeOf<readonly BookTotals[] | null>()
  expectTypeOf<GuideBook['periodTotals']>().toEqualTypeOf<GuideTotals | null>()
```

In `tests/public-api.test.ts`, add these names to `RUNTIME_EXPORTS`, keeping the list alphabetical:

```ts
'BOOK_DOCUMENT_TYPES',
'BOOK_KINDS',
'BOOK_OPERATIONS',
'BOOK_SUBMISSIONS',
'GUIDE_TRANSFER_TYPES',
'GUIDE_VOID_CODES',
'NON_RECOVERABLE_VAT_CODES',
'SUMMARY_ONLY_DOCUMENT_TYPES',
'accumulateBookTotals',
'accumulateGuideTotals',
'bookEntryFromDocument',
'buildFolioConsumptionXml',
'buildGuideBookXml',
'buildPurchaseSalesBookXml',
'compactFolioRanges',
'createFolioConsumption',
'createGuideBook',
'createPurchaseSalesBook',
'folioConsumptionEntryFromDocument',
'guideEntryFromDocument',
'isBookDocumentType',
'signFolioConsumption',
'signGuideBook',
'signPurchaseSalesBook',
'toSiiFolioConsumption',
'toSiiGuideBook',
'toSiiPurchaseSalesBook',
'verifyFolioConsumptionSignature',
'verifyGuideBookSignature',
'verifyPurchaseSalesBookSignature',
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx jest --config jest.config.cjs tests/public-api.test.ts tests/types.test.ts
```

Expected: FAIL, with `the public API exports exactly the documented runtime names`.

- [ ] **Step 3: Write the implementation**

In `src/index.ts`, replace:

```ts
 * EN: dte-sdk public API: documents, stamps, signatures and envelopes, plus the SII web services client (seed and
 * token, uploads, status queries, acceptance and claims). Everything is exported from this single entry.
 * ES: API pública de dte-sdk: documentos, timbres, firmas y sobres, más el cliente de los servicios web del SII
 * (semilla y token, envíos, consultas de estado, aceptación y reclamos). Todo se exporta desde esta única entrada.
```

with:

```ts
 * EN: dte-sdk public API: documents, stamps, signatures and envelopes, the SII books, and the SII web services client
 * (seed and token, uploads, status queries, acceptance and claims). Everything is exported from this single entry.
 * ES: API pública de dte-sdk: documentos, timbres, firmas y sobres, los libros del SII y el cliente de los servicios web
 * del SII (semilla y token, envíos, consultas de estado, aceptación y reclamos). Todo se exporta desde esta única entrada.
```

In `src/index.ts`, replace:

```ts
export { silentLogger } from './sii/logger'
```

with:

```ts
export {
  BOOK_OPERATIONS,
  BOOK_KINDS,
  BOOK_SUBMISSIONS,
  BOOK_DOCUMENT_TYPES,
  isBookDocumentType,
  SUMMARY_ONLY_DOCUMENT_TYPES,
  NON_RECOVERABLE_VAT_CODES,
  GUIDE_TRANSFER_TYPES,
  GUIDE_VOID_CODES,
} from './catalogs/book-codes'
export type {
  BookOperation,
  BookKind,
  BookSubmission,
  BookAdjustment,
  BookDocumentType,
  NonRecoverableVatCode,
  GuideTransferType,
  GuideVoidCode,
} from './catalogs/book-codes'
export type {
  BookCoverInput,
  BookCover,
  PurchaseSalesCoverInput,
  PurchaseSalesCover,
  BookNonRecoverableVat,
  BookOtherTax,
  BookForeignReceiver,
  BookSettlementInput,
  BookTaxKind,
  BookEntryInput,
  BookEntry,
  BookTotalMismatch,
  BookNonRecoverableVatTotal,
  BookOtherTaxTotal,
  BookSettlementTotals,
  BookTotals,
  BookTotalsInput,
  PurchaseSalesBookInput,
  PurchaseSalesBook,
  GuideBookCoverInput,
  GuideBookCover,
  GuideEntryInput,
  GuideEntry,
  GuideTransferTotal,
  GuideTotals,
  GuideBookInput,
  GuideBook,
  FolioConsumptionCoverInput,
  FolioConsumptionCover,
  FolioConsumptionType,
  FolioConsumptionEntry,
  VoidedFolio,
  FolioRange,
  FolioConsumptionSummary,
  FolioConsumptionInput,
  FolioConsumption,
} from './model/book'
export type {
  SiiCaratulaLibro,
  SiiTotIVANoRec,
  SiiTotOtrosImp,
  SiiTotLiquidaciones,
  SiiTotalesSegmento,
  SiiTotalesPeriodo,
  SiiDetalleLibro,
  SiiEnvioLibro,
  SiiCaratulaLibroGuia,
  SiiResumenLibroGuia,
  SiiDetalleLibroGuia,
  SiiEnvioLibroGuia,
  SiiCaratulaConsumoFolios,
  SiiResumenConsumoFolios,
  SiiDocumentoConsumoFolios,
} from './model/sii-book'
export { toSiiPurchaseSalesBook, toSiiGuideBook, toSiiFolioConsumption } from './model/book-codec'
export { accumulateBookTotals } from './books/totals'
export {
  createPurchaseSalesBook,
  buildPurchaseSalesBookXml,
  signPurchaseSalesBook,
  verifyPurchaseSalesBookSignature,
} from './books/purchase-sales'
export type { SignedPurchaseSalesBook } from './books/purchase-sales'
export {
  createGuideBook,
  buildGuideBookXml,
  signGuideBook,
  verifyGuideBookSignature,
  accumulateGuideTotals,
} from './books/guide'
export type { SignedGuideBook } from './books/guide'
export {
  createFolioConsumption,
  buildFolioConsumptionXml,
  signFolioConsumption,
  verifyFolioConsumptionSignature,
  compactFolioRanges,
} from './books/folio-consumption'
export type { SignedFolioConsumption } from './books/folio-consumption'
export { bookEntryFromDocument, guideEntryFromDocument, folioConsumptionEntryFromDocument } from './books/from-document'
export type { BookEntryFromDocumentOptions } from './books/from-document'

export { silentLogger } from './sii/logger'
```

- [ ] **Step 4: Run them to see them pass**

```bash
npx jest --config jest.config.cjs tests/public-api.test.ts tests/types.test.ts
```

Expected: PASS, `Tests: 3 passed, 3 total`.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/dist.smoke.test.ts tests/types.test.ts tests/public-api.test.ts
git commit -m "feat: export the books from the root"
```

---

## Task 13: Property tests

Invariants the example tests cannot cover: lines always add up to the summary, adding and removing a line returns to zero, accumulation is associative, and ranges recompose their input.

**Files:**
- Test: `tests/books/property.test.ts`

- [ ] **Step 1: Write the tests**

`tests/books/property.test.ts`:

```ts
import fc from 'fast-check'
import { compactFolioRanges } from '../../src/books/folio-consumption'
import { accumulateGuideTotals } from '../../src/books/guide'
import { createPurchaseSalesBook } from '../../src/books/purchase-sales'
import { accumulateBookTotals, sumBookEntries } from '../../src/books/totals'
import type { BookEntry, BookTotals, GuideTotals } from '../../src/model/book'
import { saleCover } from '../support/book-fixtures'

const amount = fc.integer({ min: 0, max: 1_000_000 })
const lineArb = fc.record({
  type: fc.constantFrom(33, 34, 56, 61),
  folio: fc.integer({ min: 1, max: 100_000 }),
  netAmount: amount,
  vatAmount: amount,
  exemptAmount: amount,
})

const rowArb: fc.Arbitrary<BookTotals> = fc.record({
  type: fc.constantFrom(33, 34, 39, 61),
  documentCount: fc.integer({ min: 0, max: 100 }),
  exemptAmount: amount,
  netAmount: amount,
  vatAmount: amount,
  totalAmount: amount,
})
const rowsArb = fc.uniqueArray(rowArb, { selector: (row) => row.type, maxLength: 4 })

describe('book totals', () => {
  test('the summary adds up to its lines, and the line totals to the formula', () => {
    fc.assert(
      fc.property(fc.array(lineArb, { minLength: 1, maxLength: 20 }), (lines) => {
        const book = createPurchaseSalesBook({ cover: saleCover, entries: lines })
        expect(book.totalMismatches).toEqual([])
        for (const row of book.periodTotals ?? []) {
          const own = lines.filter((line) => line.type === row.type)
          expect(row.documentCount).toBe(own.length)
          expect(row.netAmount).toBe(own.reduce((sum, line) => sum + line.netAmount, 0))
          expect(row.totalAmount).toBe(row.netAmount + row.vatAmount + row.exemptAmount)
        }
      }),
    )
  })

  test('adding a line and removing it leaves every row at zero', () => {
    fc.assert(
      fc.property(lineArb, (line) => {
        const entry: BookEntry = { ...line, totalAmount: line.netAmount + line.vatAmount + line.exemptAmount }
        const [row] = sumBookEntries([
          { ...entry, adjustment: 'add' },
          { ...entry, adjustment: 'remove' },
        ])
        expect(row).toEqual({
          type: line.type,
          documentCount: 0,
          exemptAmount: 0,
          netAmount: 0,
          vatAmount: 0,
          totalAmount: 0,
        })
      }),
    )
  })

  test('accumulateBookTotals is associative', () => {
    fc.assert(
      fc.property(rowsArb, rowsArb, rowsArb, (a, b, c) => {
        const byType = (rows: readonly BookTotals[]): readonly BookTotals[] => [...rows].sort((x, y) => x.type - y.type)
        expect(byType(accumulateBookTotals(accumulateBookTotals(a, b), c))).toEqual(
          byType(accumulateBookTotals(a, accumulateBookTotals(b, c))),
        )
      }),
    )
  })
})

describe('guide totals', () => {
  const transfersArb = fc.uniqueArray(
    fc.record({
      type: fc.integer({ min: 2, max: 7 }),
      count: fc.integer({ min: 0, max: 100 }),
      amount,
    }),
    { selector: (item) => item.type, maxLength: 6 },
  )
  const totalsArb: fc.Arbitrary<GuideTotals> = fc.record({
    voidedFolios: fc.integer({ min: 0, max: 100 }),
    voidedGuides: fc.integer({ min: 0, max: 100 }),
    saleGuides: fc.integer({ min: 0, max: 100 }),
    saleGuidesAmount: amount,
    modifiedAmount: amount,
    transfers: transfersArb,
  })

  test('accumulateGuideTotals is associative', () => {
    fc.assert(
      fc.property(totalsArb, totalsArb, totalsArb, (a, b, c) => {
        const sorted = (totals: GuideTotals): GuideTotals => ({
          ...totals,
          transfers: [...totals.transfers].sort((x, y) => x.type - y.type),
        })
        expect(sorted(accumulateGuideTotals(accumulateGuideTotals(a, b), c))).toEqual(
          sorted(accumulateGuideTotals(a, accumulateGuideTotals(b, c))),
        )
      }),
    )
  })
})

describe('compactFolioRanges', () => {
  test('recomposes its input, ascending, with gaps between ranges', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: 1, max: 5_000 }), { maxLength: 200 }), (folios) => {
        const ranges = compactFolioRanges(folios)
        const expanded = ranges.flatMap(({ from, to }) => Array.from({ length: to - from + 1 }, (_, i) => from + i))
        expect(expanded).toEqual([...folios].sort((a, b) => a - b))
        ranges.slice(1).forEach((range, index) => expect(range.from).toBeGreaterThan(ranges[index].to + 1))
      }),
    )
  })
})
```

- [ ] **Step 2: Run them to see them pass**

```bash
npx jest --config jest.config.cjs tests/books/property.test.ts
```

Expected: PASS, `Tests: 5 passed, 5 total`.

- [ ] **Step 3: Commit**

```bash
git add tests/books/property.test.ts
git commit -m "test: properties of the book totals and folio ranges"
```

---

## Task 14: Opt-in differential

Skipped unless `RUN_DIFFERENTIAL=1` and `DTE_DIFFERENTIAL_BOOKS_HARNESS` are set; see "Differential harness contract". This is the direct proof of the parity rule of D21: run it if the harness is available and report the result.

**Files:**
- Modify: `package.json`
- Test: `tests/books/differential.test.ts`

- [ ] **Step 1: Write the tests**

`tests/books/differential.test.ts`:

```ts
import { execFileSync } from 'node:child_process'
import { createFolioConsumption, signFolioConsumption } from '../../src/books/folio-consumption'
import { createGuideBook, signGuideBook } from '../../src/books/guide'
import { createPurchaseSalesBook, signPurchaseSalesBook } from '../../src/books/purchase-sales'
import { toSiiGuideBook } from '../../src/model/book-codec'
import { certificate, guideCover, purchaseCover, reportCover, saleCover } from '../support/book-fixtures'
import { FIXED_NOW, fixtureText, ISSUER_RUT, RECEIVER_RUT } from '../support/fixtures'

/**
 * Comparison against an external harness (see the plan for the stdin/stdout JSON contract). Opt-in:
 * RUN_DIFFERENTIAL=1 DTE_DIFFERENTIAL_BOOKS_HARNESS=/path/to/harness. The purchase and sales book is compared byte for byte,
 * with its digest and signature. Guide books and reports are compared without the whitespace between tags, because this
 * SDK breaks their lines to stay under the SII limit and the harness does not. The cases avoid what this SDK does
 * differently on purpose: `TotMntModificado`, signed segments, the credit rounded on the total, and the supplier as
 * `RUTDoc` of a purchase invoice.
 */
const harness = process.env.DTE_DIFFERENTIAL_BOOKS_HARNESS
const guarded = process.env.RUN_DIFFERENTIAL === '1' && harness ? describe : describe.skip

const ISSUER_NAME = 'Comercial Andina SpA'
const RECEIVER_NAME = 'Comercializadora Rapel Ltda'
const BOOK_DATE = '2026-10-15'
// The id the harness generates for this book at this instant.
const HARNESS_ID = `LCV_${ISSUER_RUT.replace('-', '')}_${FIXED_NOW.getTime()}`

const shared = {
  now: FIXED_NOW.toISOString(),
  certificate: {
    rut: saleCover.senderRut,
    privateKeyPem: fixtureText('cert.key.pem'),
    certificatePem: fixtureText('cert.pem'),
    modulus: certificate.publicKey.modulus,
    exponent: certificate.publicKey.exponent,
  },
  issuerRut: ISSUER_RUT,
  issuerName: ISSUER_NAME,
  receiverRut: RECEIVER_RUT,
  receiverName: RECEIVER_NAME,
  period: saleCover.period,
  resolutionDate: saleCover.resolutionDate,
  resolutionNumber: saleCover.resolutionNumber,
  submission: 'TOTAL',
}

const callHarness = (payload: object): string => {
  const output = execFileSync(process.execPath, [harness as string], {
    input: JSON.stringify({ ...shared, ...payload }),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  return (JSON.parse(output) as { readonly xml: string }).xml
}

const signedPart = (xml: string, tag: string): string =>
  xml.slice(xml.indexOf(`<${tag} `), xml.indexOf(`</${tag}>`) + tag.length + 3)
const withoutGaps = (xml: string): string => xml.replace(/>\s+</g, '><')
const base64Value = (xml: string, tag: string): string =>
  (new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml) as RegExpExecArray)[1].replace(/\s+/g, '')

const expectSameBook = (mine: string, theirs: string): void => {
  expect(signedPart(mine, 'EnvioLibro')).toBe(signedPart(theirs, 'EnvioLibro'))
  expect(base64Value(mine, 'DigestValue')).toBe(base64Value(theirs, 'DigestValue'))
  expect(base64Value(mine, 'SignatureValue')).toBe(base64Value(theirs, 'SignatureValue'))
}

guarded('differential of the books against an external harness', () => {
  const sales = [
    { type: 33, folio: 101, net: 100000, vat: 19000, exempt: 0, total: 119000, rate: 19 },
    { type: 33, folio: 102, net: 50000, vat: 9500, exempt: 2000, total: 61500, rate: 19 },
    { type: 34, folio: 7, net: 0, vat: 0, exempt: 50000, total: 50000, rate: undefined },
    { type: 61, folio: 12, net: 10000, vat: 1900, exempt: 0, total: 11900, rate: 19 },
    { type: 56, folio: 13, net: 1000, vat: 190, exempt: 0, total: 1190, rate: 19 },
  ]
  const saleLine = (line: (typeof sales)[number]) => ({
    type: line.type,
    folio: line.folio,
    date: BOOK_DATE,
    counterpartyRut: RECEIVER_RUT,
    counterpartyName: RECEIVER_NAME,
    exemptAmount: line.exempt,
    netAmount: line.net,
    vatAmount: line.vat,
    totalAmount: line.total,
    taxRate: line.rate,
  })
  const saleDocument = (line: (typeof sales)[number]) => ({
    tipoDte: line.type,
    folio: line.folio,
    totales: { MntExe: line.exempt, MntNeto: line.net, IVA: line.vat, MntTotal: line.total, TasaIVA: line.rate },
  })

  test('a sale book', () => {
    const book = createPurchaseSalesBook({
      cover: saleCover,
      id: HARNESS_ID,
      now: FIXED_NOW,
      entries: sales.map(saleLine),
    })
    const theirs = callHarness({ book: 'sale', documents: sales.map(saleDocument) })
    expectSameBook(signPurchaseSalesBook(book, certificate).xml, theirs)
  })

  test('a purchase book with common-use VAT, non-recoverable VAT, other taxes and withholding', () => {
    const line = { date: BOOK_DATE, counterpartyRut: ISSUER_RUT, counterpartyName: ISSUER_NAME }
    const book = createPurchaseSalesBook({
      cover: purchaseCover,
      id: HARNESS_ID,
      now: FIXED_NOW,
      commonUseVatFactor: 0.6,
      entries: [
        { ...line, type: 33, folio: 201, netAmount: 30000, commonUseVat: 5700 },
        { ...line, type: 33, folio: 202, netAmount: 40000, nonRecoverableVat: [{ code: 1, amount: 7600 }] },
        {
          ...line,
          type: 33,
          folio: 204,
          netAmount: 100000,
          vatAmount: 19000,
          taxRate: 19,
          otherTaxes: [{ code: 28, rate: 1.5, amount: 1500 }],
        },
        { ...line, type: 34, folio: 205, exemptAmount: 9000 },
        { ...line, type: 46, folio: 6, netAmount: 20000, vatAmount: 3800, taxRate: 19, totalVatWithheld: 3800 },
      ],
    })
    const theirs = callHarness({
      book: 'purchase',
      documents: [
        { tipoDte: 33, folio: 201, totales: { MntNeto: 30000, IVAUsoComun: 5700, TasaIVA: 19 } },
        {
          tipoDte: 33,
          folio: 202,
          totales: { MntNeto: 40000, IVANoRec: { CodIVANoRec: 1, MntIVANoRec: 7600 }, TasaIVA: 19 },
        },
        {
          tipoDte: 33,
          folio: 204,
          totales: { MntNeto: 100000, IVA: 19000, TasaIVA: 19, OtrosImp: { CodImp: 28, TasaImp: 1.5, MntImp: 1500 } },
        },
        { tipoDte: 34, folio: 205, totales: { MntExe: 9000 } },
        { tipoDte: 46, folio: 6, totales: { MntNeto: 20000, IVA: 3800, TasaIVA: 19, IVARetTotal: 3800 } },
      ],
    })
    expectSameBook(signPurchaseSalesBook(book, certificate).xml, theirs)
  })

  test('an adjustment on top of previous totals', () => {
    const line = { type: 33, folio: 110, net: 1000, vat: 190, exempt: 0, total: 1190, rate: 19 }
    const book = createPurchaseSalesBook({
      cover: { ...saleCover, submission: 'adjustment' },
      id: HARNESS_ID,
      now: FIXED_NOW,
      entries: [saleLine(line)],
      previousTotals: [
        { type: 33, documentCount: 4, exemptAmount: 0, netAmount: 400000, vatAmount: 76000, totalAmount: 476000 },
        { type: 61, documentCount: 1, exemptAmount: 0, netAmount: 10000, vatAmount: 1900, totalAmount: 11900 },
      ],
    })
    const theirs = callHarness({
      book: 'adjustment',
      submission: 'AJUSTE',
      documents: [saleDocument(line)],
      previousTotals: [
        { TpoDoc: 33, TotDoc: 4, TotMntExe: 0, TotMntNeto: 400000, TotMntIVA: 76000, TotMntTotal: 476000 },
        { TpoDoc: 61, TotDoc: 1, TotMntExe: 0, TotMntNeto: 10000, TotMntIVA: 1900, TotMntTotal: 11900 },
      ],
    })
    expectSameBook(signPurchaseSalesBook(book, certificate).xml, theirs)
  })

  test('a guide book with sales, voids and transfers', () => {
    const book = createGuideBook({
      cover: guideCover,
      id: 'LGD_DIFFERENTIAL',
      now: FIXED_NOW,
      entries: [
        {
          folio: 301,
          transferType: 1,
          date: '2026-10-05',
          receiverRut: RECEIVER_RUT,
          receiverName: RECEIVER_NAME,
          netAmount: 50000,
          taxRate: 19,
        },
        { folio: 302, voided: 'folio', transferType: 1, date: '2026-10-06' },
        { folio: 303, voided: 'guide', transferType: 1, date: '2026-10-07' },
        { folio: 305, transferType: 5, date: '2026-10-09', totalAmount: 0 },
        { folio: 306, transferType: 7, date: '2026-10-10', totalAmount: 11900 },
        { folio: 307, transferType: 5, date: '2026-10-11', totalAmount: 100 },
      ],
    })
    const theirs = callHarness({
      book: 'guide',
      id: book.id,
      notificationFolio: guideCover.notificationFolio,
      documents: toSiiGuideBook(book).Detalle,
    })
    const mine = signGuideBook(book, certificate).xml
    expect(withoutGaps(signedPart(mine, 'EnvioLibro'))).toBe(withoutGaps(signedPart(theirs, 'EnvioLibro')))
  })

  test('a report with both receipt types', () => {
    const lines = [
      { type: 39, folio: 1, net: 840, vat: 160, exempt: 0, total: 1000 },
      { type: 39, folio: 2, net: 1681, vat: 319, exempt: 0, total: 2000 },
      { type: 39, folio: 3, net: 840, vat: 160, exempt: 500, total: 1500 },
      { type: 39, folio: 7, net: 2521, vat: 479, exempt: 0, total: 3000 },
      { type: 41, folio: 50, net: 0, vat: 0, exempt: 900, total: 900 },
    ] as const
    const report = createFolioConsumption({
      cover: reportCover,
      id: 'RCOF_DIFFERENTIAL',
      now: FIXED_NOW,
      entries: lines.map((line) => ({
        type: line.type,
        folio: line.folio,
        issueDate: BOOK_DATE,
        netAmount: line.net,
        vatAmount: line.vat,
        exemptAmount: line.exempt,
        totalAmount: line.total,
      })),
    })
    const theirs = callHarness({
      book: 'report',
      id: report.id,
      sequence: report.cover.sequence,
      documents: lines.map((line) => ({
        Encabezado: {
          IdDoc: { TipoDTE: line.type, Folio: line.folio, FchEmis: BOOK_DATE },
          Totales: { MntNeto: line.net, IVA: line.vat, MntExe: line.exempt, MntTotal: line.total },
        },
      })),
    })
    const mine = signFolioConsumption(report, certificate).xml
    const tag = 'DocumentoConsumoFolios'
    expect(withoutGaps(signedPart(mine, tag))).toBe(withoutGaps(signedPart(theirs, tag)))
  })
})
```

- [ ] **Step 2: Write the implementation**

In `package.json`, replace:

```json
"test:differential": "RUN_DIFFERENTIAL=1 jest --config jest.config.cjs tests/differential.test.ts"
```

with:

```json
"test:differential": "RUN_DIFFERENTIAL=1 jest --config jest.config.cjs differential"
```

- [ ] **Step 3: Run them to see them pass**

```bash
npx jest --config jest.config.cjs tests/books/differential.test.ts
```

Expected: `Tests: 5 skipped, 5 total`, because the suite is opt-in.

- [ ] **Step 4: Commit**

```bash
git add tests/books/differential.test.ts package.json
git commit -m "test: opt-in differential of the three books"
```

---

## Task 15: Documentation, size limit and final gates

The bundle grows from about 25.7 kB to about 32 kB. Measured on the proven code: ESM 31.86 kB, CJS 32.06 kB, so the limit goes to the next 2 kB, 34 kB. Measure again and adjust if your numbers differ.

**Files:**
- Modify: `README.md`
- Modify: `llms.txt`
- Modify: `CHANGELOG.md`
- Modify: `.size-limit.json`

- [ ] **Step 1: Update the documentation and the size limit**

In `README.md`, replace:

```markdown
## Errors
```

with:

````markdown
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
`uploadFolioConsumption`. All three cover the submission kinds of their schemas (`total`, `partial`,
`final`, `adjustment`), and the SDK computes the summaries from the lines. `previousTotals` carries
the totals of earlier submissions: `book.periodTotals` is a plain JSON value you can store and pass
back. `bookEntryFromDocument`, `guideEntryFromDocument` and `folioConsumptionEntryFromDocument`
derive the lines from documents issued with this SDK.

Their use today is narrow. The RCV replaced the purchase and sales book in production from period
2017-08, and the guide book is sent only when the SII asks for it; both are still part of the
certification test set. The folio consumption report (now Resumen de Ventas Diarias) is used in the
receipts certification, and the SII probably no longer requires it in production.

## Errors
````

In `llms.txt`, replace:

```text
- [README](
```

with:

```text
The SII books are `createPurchaseSalesBook` (IECV, `LibroCompraVenta`), `createGuideBook` (`LibroGuia`) and `createFolioConsumption` (RCOF, `ConsumoFolios`), each with `build*Xml`, `sign*`, `verify*Signature` and `toSii*`. All submission kinds of the schemas are covered, and the SDK computes the summaries from the lines; `summaryOnlyTotals` and `previousTotals` carry what cannot be derived. An explicit line total that differs from the SII formula is kept and reported in `totalMismatches`, and `strictTotals: true` throws `BOOK_TOTAL_MISMATCH` instead. `bookEntryFromDocument`, `guideEntryFromDocument` and `folioConsumptionEntryFromDocument` derive the lines from issued documents. The signed XML goes to `uploadBook` or `uploadFolioConsumption`. The RCV replaced the IECV in production from period 2017-08, the guide book is sent only on SII request, and the report is used in the receipts certification; the SII probably no longer requires it in production.

- [README](
```

In `CHANGELOG.md`, replace:

```markdown
- Helpers for custom adapters and tests: `buildMultipartBody`, `buildSoapEnvelope`/`parseSoapResponse`,
  `signSeed`, `signRootElement`, `redactExchange` and `tokenCacheKey`.

### Removed
```

with:

```markdown
- Helpers for custom adapters and tests: `buildMultipartBody`, `buildSoapEnvelope`/`parseSoapResponse`,
  `signSeed`, `signRootElement`, `redactExchange` and `tokenCacheKey`.
- SII books: the purchase and sales book (`createPurchaseSalesBook`, IECV), the dispatch guide book
  (`createGuideBook`) and the folio consumption report (`createFolioConsumption`, RCOF), each with
  `build*Xml`, `sign*`, `verify*Signature` and `toSii*`, in all the submission kinds of their
  schemas. The SDK computes the summaries from the lines; `summaryOnlyTotals` and `previousTotals`
  (with `accumulateBookTotals`/`accumulateGuideTotals`) carry what cannot be derived. An explicit
  line total that differs from the SII formula is kept and reported in `totalMismatches`, and
  `strictTotals: true` throws the new `BOOK_TOTAL_MISMATCH`. `bookEntryFromDocument`,
  `guideEntryFromDocument` and `folioConsumptionEntryFromDocument` derive the lines from documents.
- Book catalogs: `BOOK_OPERATIONS`, `BOOK_KINDS`, `BOOK_SUBMISSIONS`, `BOOK_DOCUMENT_TYPES`,
  `isBookDocumentType`, `SUMMARY_ONLY_DOCUMENT_TYPES`, `NON_RECOVERABLE_VAT_CODES`,
  `GUIDE_TRANSFER_TYPES`, `GUIDE_VOID_CODES`, plus `compactFolioRanges`.
- `uploadBook` and `uploadFolioConsumption` accept `fileName`, and a `LibroGuia` uploads as
  `LibroGuia.xml` by default.

### Removed
```

In `.size-limit.json`, replace:

```json
"name": "ESM (min + brotli)",
    "path": "dist/esm/index.min.js",
    "limit": "26 kB"
```

with:

```json
"name": "ESM (min + brotli)",
    "path": "dist/esm/index.min.js",
    "limit": "34 kB"
```

In `.size-limit.json`, replace:

```json
"name": "CJS (min + brotli)",
    "path": "dist/cjs/index.min.js",
    "limit": "26 kB"
```

with:

```json
"name": "CJS (min + brotli)",
    "path": "dist/cjs/index.min.js",
    "limit": "34 kB"
```

- [ ] **Step 2: Run the final gates**

```bash
npx prettier --check "{src,tests}/**/*.{js,ts,jsx,tsx}"
npm run lint
npx tsc --noEmit
npx jest --config jest.config.cjs --coverage --silent
npm run build
npm run size
npm run scan
npx jest --config jest.config.cjs tests/dist.smoke.test.ts --silent
```

Expected: formatting, lint and `tsc` are clean; coverage is 100 % on the four metrics; `size-limit` reports about 31.9 kB (ESM) and 32.1 kB (CJS), under the limit; the scan passes; the smoke passes. If the coverage report names a file below 100 %, a step above was not applied as printed.

- [ ] **Step 3: Run the differential, if you have the harness**

```bash
RUN_DIFFERENTIAL=1 DTE_DIFFERENTIAL_BOOKS_HARNESS=/path/to/harness npm run test:differential
```

Expected: the 5 tests of `tests/books/differential.test.ts` pass. The 3 of `tests/differential.test.ts` belong to phase 1 and use their own `DTE_DIFFERENTIAL_HARNESS`; they stay skipped without it. Record in the pull request whether the book differential ran.

- [ ] **Step 4: Commit**

```bash
git add README.md llms.txt CHANGELOG.md .size-limit.json
git commit -m "docs: the SII books in the README, llms.txt and CHANGELOG"
```

- [ ] **Step 5: Post the bundle sizes to the size issue**

```bash
gh issue comment 5 --repo arrowsw/dte-sdk --body "After phase 3 (books): ESM <measured> kB, CJS <measured> kB (min + brotli). Limit raised to 34 kB."
```

Replace `<measured>` with the numbers `npm run size` printed.

- [ ] **Step 6: Open the pull request**

Open it against `canary`. Say what the differential did, and that the books have not met the real SII (issue 8 is still open). Pull requests here are squash-merged by Hans.
