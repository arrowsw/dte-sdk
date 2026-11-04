# Phase 5b-1 — certification sets, simulation and books: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The deterministic half of the certification runner: the SII test-set text becomes the signed documents and envelopes of the four test sets, the simulation envelope and the three signed books, all in memory, so the runner of phase 5b-2 only sends and declares.

**Architecture:** `src/certification/` holds six modules of free functions over `readonly` data: the parser of the set text, the plan of cases per set, a folio source over one or several CAFs, the issuing of the four sets through phase 1 (`createDocument`, `issueDocument`, `createEnvelope`, `signEnvelope`), the simulation, and the three books through phase 3 (`createPurchaseSalesBook`, `createGuideBook` and their signers). Nothing touches the network or the disk. Phase 1 gains one option, `withholdVat`, so the notes of a purchase invoice withhold the VAT as the field does.

**Tech Stack:** TypeScript 5.9 (strict), Node ≥ 20, Jest 30 + ts-jest, fast-check, expect-type, xmllint-wasm (the books validate against the SII schemas), ESLint 9 + Prettier, esbuild, size-limit. No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-04-phase-5b1-certification-sets-design.md` (section 2 holds the decisions D57–D64, section 3 the rules and the API, section 6 what is and is not measured, section 7 what is deferred on purpose).

---

## This plan's code has already run

This plan was generated from a throwaway branch cut from `canary` at `c2c7c6e`, where the code was written and made to pass, with one commit per task. On that branch each task was checked in order: its tests alone fail on the previous commit, and with the task applied `tsc` compiles and the tests pass. At the tip, on 2026-11-04: Prettier, ESLint, `tsc`, 1 907 tests with coverage at 100 % on the four metrics, build, size (ESM 56.17 kB, CJS 56.3 kB against the 64 kB limit) and scan all pass.

So copy the code as it is. If a test fails, something around it changed since then, such as `canary`: investigate that before changing the code.

**Nothing here has met the SII, and no real set text was available.** The grammar of the parser and every rule reproduce the behaviour known to pass the SII review of the test sets; the first real download of a set should become a fixture of this module (spec section 6), and the SII's acceptance of the envelopes and books needs the company enrolled and the runner of phase 5b-2.

## Conventions that apply to EVERY task

1. **Branch:** work on a branch cut from `canary`. Commands run from the repository root. Run `npm ci` first.
2. **Commits:** one per task, with the message given, in English, with a prose body saying why, ending with the `Co-Authored-By` line your session prescribes.
3. **Diffs:** a modified file comes as a unified diff, relative to the repository root. Save it to a temporary file outside the repository and run `git apply <file>`. A new file comes whole.
4. **Bilingual JSDoc is mandatory** on every exported symbol and every type field, one `EN:` line and one `ES:` line, the `ES:` naming the SII tag. The code below already has it.
5. **No classes** (only `DteError`). `readonly` types everywhere. No module-level state; the allocator's counters live in its closure.
6. **No PII in error messages:** values go in `details`, never in `message`.
7. **Coverage** reaches 100 % at Task 7; before that it dips, which is why the per-task commands use `--coverage=false`.
8. **No real data:** fixture RUTs come from the allow-list in `scripts/scan-real-data.mjs`, the set texts and names are invented, and `npm run scan` checks it.
9. **Nothing public names any third-party implementation:** not code, comments, tests, fixtures, commits or the pull request. Describe the SII behaviour directly.
10. **Nothing in this plan calls the SII,** and the default test run never does.
11. **You own the pull request.** The session that runs this plan is the sole owner of its PR and of every review note or post-merge follow-up on it. Run `gh pr list` before opening anything.

## File map

```
src/catalogs/certification.ts                 (create) task 1   set kinds, portal names, SET reference type, counterparty
src/certification/set-text.ts                 (create) task 1   parseTestSetText and the detectors
tests/support/test-set-samples.ts             (create) task 1   synthetic set texts
tests/certification/set-text.test.ts          (create) task 1
src/certification/set-plan.ts                 (create) task 2   planCertificationSets and the plan types
tests/certification/set-plan.test.ts          (create) task 2
src/certification/folios.ts                   (create) task 3   FolioSource, createFolioAllocator
tests/certification/folios.test.ts            (create) task 3
src/model/document.ts                         (modify) task 4   DocumentInput.withholdVat
src/document/create.ts                        (modify) task 4   passes withholdVat to the totals
src/certification/issue-set.ts                (create) task 4   issueTestSet and the shared issuing internals
tests/support/certification-fixtures.ts       (create) task 4   certificate, CAFs, issuer, receiver, options
tests/certification/issue-set.test.ts         (create) task 4
tests/create-document.test.ts                 (modify) task 4
src/certification/simulation.ts               (create) task 5   issueSimulation
tests/certification/simulation.test.ts        (create) task 5
src/certification/books.ts                    (create) task 6   the three books
tests/certification/books.test.ts             (create) task 6
src/index.ts                                  (modify) task 7
tests/public-api.test.ts                      (modify) task 7
tests/types.test.ts                           (modify) task 7
.size-limit.json                              (modify) task 7   64 kB
README.md / CHANGELOG.md / llms.txt           (modify) task 7
```

---

## Task 1: The certification catalog and the test-set parser

`parseTestSetText` (spec 3.2) reads the SII test-set text line by line into sets, cases, items, references and the purchase-book documents, with the detectors of document type, reference code, transfer reason, dispatch type and book document type; `src/catalogs/certification.ts` holds the set kinds, their portal names, the `SET` reference type and the placeholder counterparty. The tests use synthetic set texts written from the grammar: no real set text exists in any public source.

**Files:**

- Create: `src/catalogs/certification.ts`
- Create: `src/certification/set-text.ts`
- Test (create): `tests/support/test-set-samples.ts`
- Test (create): `tests/certification/set-text.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/support/test-set-samples.ts` (new file, whole):

```ts
/**
 * Synthetic SII test-set texts, written from the grammar of the phase 5b-1 spec with invented data. No real set text
 * exists in any public source; these reproduce every line shape the parser knows.
 */
export const ATTENTION = '2410011'

export const BASIC_SET_TEXT = `SET BASICO - NUMERO DE ATENCION: ${ATTENTION}
==========================================
CASO ${ATTENTION}-1
==========================================
DOCUMENTO                        FACTURA ELECTRONICA

ITEM                             CANTIDAD   PRECIO UNITARIO
Cajon de manzanas                130        2800
Relleno de pollo                 90         1700

--------------------------------------------------
CASO ${ATTENTION}-2
DOCUMENTO                        FACTURA ELECTRONICA
ITEM                             CANTIDAD   PRECIO UNITARIO   DESCUENTO
Pintura blanca                   40         5000              14%
Servicio exento de instalacion   1          20000

DESCUENTO GLOBAL ITEMES AFECTOS  7%
--------------------------------------------------
CASO ${ATTENTION}-3
DOCUMENTO                        FACTURA ELECTRONICA
ITEM                             CANTIDAD   UNIDAD   PRECIO UNITARIO
Cemento                          10         SACO     8000
--------------------------------------------------
CASO ${ATTENTION}-4
DOCUMENTO                        NOTA DE CREDITO ELECTRONICA
REFERENCIA                       CASO ${ATTENTION}-1
RAZON REFERENCIA                 DEVOLUCION DE MERCADERIAS
ITEM                             CANTIDAD
Cajon de manzanas                62
--------------------------------------------------
CASO ${ATTENTION}-5
DOCUMENTO                        NOTA DE CREDITO ELECTRONICA
REFERENCIA                       CASO ${ATTENTION}-2
RAZON REFERENCIA                 CORRIGE GIRO DEL RECEPTOR
--------------------------------------------------
CASO ${ATTENTION}-6
DOCUMENTO                        NOTA DE CREDITO ELECTRONICA
REFERENCIA                       CASO ${ATTENTION}-3
RAZON REFERENCIA                 ANULA FACTURA ELECTRONICA
--------------------------------------------------
CASO ${ATTENTION}-7
DOCUMENTO                        NOTA DE DEBITO ELECTRONICA
REFERENCIA                       CASO ${ATTENTION}-6
RAZON REFERENCIA                 ANULA NOTA DE CREDITO ELECTRONICA
--------------------------------------------------
CASO ${ATTENTION}-8
DOCUMENTO                        NOTA DE DEBITO ELECTRONICA
REFERENCIA                       CASO ${ATTENTION}-1
RAZON REFERENCIA                 MODIFICA MONTO
ITEM                             VALOR
Cajon de manzanas                3100
--------------------------------------------------
`

export const EXEMPT_SET_TEXT = `SET FACTURA EXENTA - NUMERO DE ATENCION: ${ATTENTION}
CASO ${ATTENTION}-9
DOCUMENTO                        FACTURA NO AFECTA O EXENTA ELECTRONICA
ITEM                             CANTIDAD   PRECIO UNITARIO
Arriendo de oficina              1          450000
Asesoria tributaria              2          80000
--------------------------------------------------
CASO ${ATTENTION}-10
DOCUMENTO                        NOTA DE CREDITO ELECTRONICA
REFERENCIA                       CASO ${ATTENTION}-9
RAZON REFERENCIA                 DEVOLUCION DE MERCADERIAS
--------------------------------------------------
CASO ${ATTENTION}-11
DOCUMENTO                        NOTA DE DEBITO ELECTRONICA
REFERENCIA                       CASO ${ATTENTION}-10
RAZON REFERENCIA                 ANULA NOTA DE CREDITO
--------------------------------------------------
CASO ${ATTENTION}-12
DOCUMENTO                        NOTA DE CREDITO ELECTRONICA
REFERENCIA                       CASO ${ATTENTION}-9
RAZON REFERENCIA                 MODIFICA MONTO
ITEM                             VALOR
Asesoria tributaria              75000
--------------------------------------------------
`

export const GUIDE_SET_TEXT = `SET GUIA DE DESPACHO - NUMERO DE ATENCION: ${ATTENTION}
CASO ${ATTENTION}-13
DOCUMENTO                        GUIA DE DESPACHO
MOTIVO:                          VENTA
TRASLADO POR:                    EMISOR DEL DOCUMENTO AL LOCAL DEL CLIENTE
ITEM                             CANTIDAD   PRECIO UNITARIO
Cajon de manzanas                25         2800
--------------------------------------------------
CASO ${ATTENTION}-14
DOCUMENTO                        GUIA DE DESPACHO
MOTIVO:                          TRASLADO DE MATERIALES ENTRE BODEGAS DE LA EMPRESA
TRASLADO POR:                    CLIENTE
ITEM                             CANTIDAD
Relleno de pollo                 40
--------------------------------------------------
CASO ${ATTENTION}-15
DOCUMENTO                        GUIA DE DESPACHO
MOTIVO:                          VENTA
ITEM                             CANTIDAD   PRECIO UNITARIO
Pintura blanca                   12         5000
--------------------------------------------------
`

export const purchaseSetText = (
  header = 'SET FACTURA DE COMPRA',
): string => `${header} - NUMERO DE ATENCION: ${ATTENTION}
CASO ${ATTENTION}-16
DOCUMENTO                        FACTURA DE COMPRA ELECTRONICA
ITEM                             CANTIDAD   PRECIO UNITARIO
Chatarra de fierro               300        1200
--------------------------------------------------
CASO ${ATTENTION}-17
DOCUMENTO                        NOTA DE CREDITO ELECTRONICA
REFERENCIA                       CASO ${ATTENTION}-16
RAZON REFERENCIA                 DEVOLUCION DE MERCADERIAS
ITEM                             CANTIDAD
Chatarra de fierro               100
--------------------------------------------------
CASO ${ATTENTION}-18
DOCUMENTO                        NOTA DE DEBITO ELECTRONICA
REFERENCIA                       CASO ${ATTENTION}-17
RAZON REFERENCIA                 ANULA NOTA DE CREDITO
--------------------------------------------------
`

export const PURCHASE_BOOK_SET_TEXT = `SET LIBRO DE COMPRAS - NUMERO DE ATENCION: ${ATTENTION}
TIPO DOCUMENTO                   FOLIO
FACTURA                          234
FACTURA DEL GIRO CON DERECHO A CREDITO
                                 MONTO EXENTO   MONTO AFECTO
   7893     3897
FACTURA ELECTRONICA              32
FACTURA DEL GIRO CON DERECHO A CREDITO
          4305
FACTURA                          781
FACTURA CON IVA USO COMUN
          12000
FACTURA ELECTRONICA              1004
ENTREGA GRATUITA DEL PROVEEDOR
          2000
FACTURA DE COMPRA ELECTRONICA    87
COMPRA CON RETENCION TOTAL DEL IVA
          9000
NOTA DE CREDITO                  5
NOTA DE CREDITO POR DESCUENTO FACTURA ELECTRONICA 32
          1000
FACTOR DE PROPORCIONALIDAD IVA: 0.60
`

export const EXEMPT_PURCHASE_BOOK_SET_TEXT = `SET LIBRO DE COMPRAS PARA EXENTOS - NUMERO DE ATENCION: ${ATTENTION}
TIPO DOCUMENTO                   FOLIO     MONTO EXENTO   MONTO AFECTO
==========================================
FACTURA                          120       5000
FACTURA ELECTRONICA              77        3000           10000
FACTURA EXENTA                   9         2500
NOTA DE DEBITO                   3         400
OBS: NOTA DE DEBITO POR INTERESES FACTURA 120
NOTA DE CREDITO ELECTRONICA      14
OBS: NOTA DE CREDITO POR DESCUENTO FACTURA ELECTRONICA 77
FACTOR DE PROPORCIONALIDAD IVA: 0.60
`

export const SALES_BOOK_SET_TEXT = `SET LIBRO DE VENTAS - NUMERO DE ATENCION: ${ATTENTION}
Usar DTEs del SET BASICO
`

export const EXPORT_SET_TEXT = `SET DOCUMENTOS DE EXPORTACION (1) - NUMERO DE ATENCION: ${ATTENTION}
CASO ${ATTENTION}-19
DOCUMENTO                        FACTURA DE EXPORTACION ELECTRONICA
MONEDA DE LA OPERACION:          DOLAR USA
FORMA DE PAGO EXPORTACION:       ANTICIPO
MODALIDAD DE VENTA:              A FIRME
CLAUSULA DE VENTA:               CIF
TOTAL CLAUSULA DE VENTA:         1500.50
VIA DE TRANSPORTE:               MARITIMA
PUERTO DE EMBARQUE:              VALPARAISO
PUERTO DE DESEMBARQUE:           ROTTERDAM
TIPO DE BULTO:                   PALLET
TOTAL BULTOS:                    4
FLETE:                           200
SEGURO:                          50
PAIS RECEPTOR:                   HOLANDA
COMISIONES EN EL EXTRANJERO:     5%
ITEM                             CANTIDAD   PRECIO UNITARIO
Vino tinto reserva               100        12
--------------------------------------------------
`

/** The whole download, every set, with the corrupted accent the portal sometimes sends and some junk lines. */
export const FULL_SET_TEXT = [
  'Postulacion Factura Electronica',
  '',
  BASIC_SET_TEXT.replace('NUMERO DE ATENCION', 'NUMERO DE ATENCIÓN'),
  GUIDE_SET_TEXT,
  EXEMPT_SET_TEXT,
  purchaseSetText('SET CASO GENERAL FACTURA COMPRA'),
  SALES_BOOK_SET_TEXT,
  PURCHASE_BOOK_SET_TEXT,
  EXEMPT_PURCHASE_BOOK_SET_TEXT,
  EXPORT_SET_TEXT,
  'Fin del set',
].join('\n')
```

`tests/certification/set-text.test.ts` (new file, whole):

```ts
import fc from 'fast-check'
import {
  bookDocumentTypeOf,
  dispatchTypeOf,
  documentTypeOf,
  parseTestSetText,
  referenceCodeOf,
  testSetKindOf,
  transferReasonOf,
} from '../../src/certification/set-text'
import {
  ATTENTION,
  BASIC_SET_TEXT,
  EXEMPT_PURCHASE_BOOK_SET_TEXT,
  EXEMPT_SET_TEXT,
  EXPORT_SET_TEXT,
  FULL_SET_TEXT,
  GUIDE_SET_TEXT,
  PURCHASE_BOOK_SET_TEXT,
  purchaseSetText,
} from '../support/test-set-samples'

describe('the whole download', () => {
  const sets = parseTestSetText(FULL_SET_TEXT)

  test('yields every set in order, with its kind and attention number, ignoring junk', () => {
    expect(sets.map((set) => set.kind)).toEqual([
      'basic',
      'guide',
      'exempt',
      'purchase',
      'salesBook',
      'purchaseBook',
      'exemptPurchaseBook',
      'export',
    ])
    expect(sets.every((set) => set.attentionNumber === ATTENTION)).toBe(true)
    expect(sets[0].name).toBe('BASICO')
    expect(sets[3].name).toBe('CASO GENERAL FACTURA COMPRA')
  })

  test('a corrupted accent in ATENCION still opens the set', () => {
    const corrupted = BASIC_SET_TEXT.replace('NUMERO DE ATENCION', 'NUMERO DE ATENCI�N')
    expect(parseTestSetText(corrupted)[0]).toMatchObject({ kind: 'basic', attentionNumber: ATTENTION })
  })
})

describe('the basic set', () => {
  const [set] = parseTestSetText(BASIC_SET_TEXT)
  const byNumber = (number: number) => set.cases.find((item) => item.number === number)!

  test('has eight cases with ids, document texts and types', () => {
    expect(set.cases).toHaveLength(8)
    expect(set.cases.map((item) => item.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => `${ATTENTION}-${n}`))
    expect(set.cases.map((item) => item.documentType)).toEqual([33, 33, 33, 61, 61, 61, 56, 56])
    expect(byNumber(1)).toMatchObject({ setId: ATTENTION, documentText: 'FACTURA ELECTRONICA' })
  })

  test('reads three-part rows, discount rows, unit rows and the global discount', () => {
    expect(byNumber(1).items).toEqual([
      { name: 'Cajon de manzanas', quantity: 130, unitPrice: 2800 },
      { name: 'Relleno de pollo', quantity: 90, unitPrice: 1700 },
    ])
    expect(byNumber(2).items).toEqual([
      { name: 'Pintura blanca', quantity: 40, unitPrice: 5000, discount: '14%' },
      { name: 'Servicio exento de instalacion', quantity: 1, unitPrice: 20000 },
    ])
    expect(byNumber(2).globalDiscountPercent).toBe(7)
    expect(byNumber(3).items).toEqual([{ name: 'Cemento', quantity: 10, unit: 'SACO', unitPrice: 8000 }])
    expect(byNumber(1).globalDiscountPercent).toBeNull()
  })

  test('reads references, reasons, quantity-only rows and MODIFICA MONTO rows', () => {
    expect(byNumber(4)).toMatchObject({
      referenceText: `CASO ${ATTENTION}-1`,
      referencedCase: `${ATTENTION}-1`,
      reasonText: 'DEVOLUCION DE MERCADERIAS',
      items: [{ name: 'Cajon de manzanas', quantity: 62 }],
    })
    expect(byNumber(5)).toMatchObject({
      referencedCase: `${ATTENTION}-2`,
      reasonText: 'CORRIGE GIRO DEL RECEPTOR',
      items: [],
    })
    expect(byNumber(7)).toMatchObject({
      referencedCase: `${ATTENTION}-6`,
      reasonText: 'ANULA NOTA DE CREDITO ELECTRONICA',
    })
    expect(byNumber(8).items).toEqual([{ name: 'Cajon de manzanas', quantity: 1, unitPrice: 3100 }])
  })

  test('a reference without a CASO keeps its text and no referenced case', () => {
    const [set] = parseTestSetText(
      `SET BASICO - NUMERO DE ATENCION: 1\nCASO 1-1\nDOCUMENTO NOTA DE CREDITO\nREFERENCIA FACTURA 55\n`,
    )
    expect(set.cases[0]).toMatchObject({ referenceText: 'FACTURA 55', referencedCase: null })
  })

  test('keeps the raw lines of a case, including blank ones and headers', () => {
    expect(byNumber(1).raw).toEqual([
      'DOCUMENTO                        FACTURA ELECTRONICA',
      '',
      'ITEM                             CANTIDAD   PRECIO UNITARIO',
      'Cajon de manzanas                130        2800',
      'Relleno de pollo                 90         1700',
      '',
    ])
  })
})

describe('the other case sets', () => {
  test('exempt: 34 and notes, with no price rows kept as quantity rows', () => {
    const [set] = parseTestSetText(EXEMPT_SET_TEXT)
    expect(set.kind).toBe('exempt')
    expect(set.cases.map((item) => item.documentType)).toEqual([34, 61, 56, 61])
    expect(set.cases[0].items).toEqual([
      { name: 'Arriendo de oficina', quantity: 1, unitPrice: 450000 },
      { name: 'Asesoria tributaria', quantity: 2, unitPrice: 80000 },
    ])
    expect(set.cases[3].items).toEqual([{ name: 'Asesoria tributaria', quantity: 1, unitPrice: 75000 }])
  })

  test('guide: motive and transfer-by lines, with and without prices', () => {
    const [set] = parseTestSetText(GUIDE_SET_TEXT)
    expect(set.kind).toBe('guide')
    expect(set.cases.map((item) => item.documentType)).toEqual([52, 52, 52])
    expect(set.cases[0]).toMatchObject({
      motive: 'VENTA',
      transferBy: 'EMISOR DEL DOCUMENTO AL LOCAL DEL CLIENTE',
      items: [{ name: 'Cajon de manzanas', quantity: 25, unitPrice: 2800 }],
    })
    expect(set.cases[1]).toMatchObject({
      motive: 'TRASLADO DE MATERIALES ENTRE BODEGAS DE LA EMPRESA',
      transferBy: 'CLIENTE',
      items: [{ name: 'Relleno de pollo', quantity: 40 }],
    })
    expect(set.cases[2]).toMatchObject({ motive: 'VENTA', transferBy: '' })
  })

  test.each(['SET FACTURA DE COMPRA', 'SET CASO GENERAL FACTURA COMPRA'])('purchase under the header %s', (header) => {
    const [set] = parseTestSetText(purchaseSetText(header))
    expect(set.kind).toBe('purchase')
    expect(set.cases.map((item) => item.documentType)).toEqual([46, 61, 56])
    expect(set.cases[1].items).toEqual([{ name: 'Chatarra de fierro', quantity: 100 }])
  })

  test('export: the export-only lines are kept by label and the set is typed export', () => {
    const [set] = parseTestSetText(EXPORT_SET_TEXT)
    expect(set.kind).toBe('export')
    expect(set.cases[0]).toMatchObject({
      documentType: 110,
      currency: 'DOLAR USA',
      exportFields: {
        'FORMA DE PAGO EXPORTACION': 'ANTICIPO',
        'MODALIDAD DE VENTA': 'A FIRME',
        'CLAUSULA DE VENTA': 'CIF',
        'TOTAL CLAUSULA DE VENTA': '1500.50',
        'VIA DE TRANSPORTE': 'MARITIMA',
        'PUERTO DE EMBARQUE': 'VALPARAISO',
        'PUERTO DE DESEMBARQUE': 'ROTTERDAM',
        'TIPO DE BULTO': 'PALLET',
        'TOTAL BULTOS': '4',
        FLETE: '200',
        SEGURO: '50',
        'PAIS RECEPTOR': 'HOLANDA',
        'COMISIONES EN EL EXTRANJERO': '5',
      },
      items: [{ name: 'Vino tinto reserva', quantity: 100, unitPrice: 12 }],
    })
  })
})

describe('the purchase-book sets', () => {
  test('LIBRO DE COMPRAS: document, observation and amount lines, and the factor', () => {
    const [set] = parseTestSetText(PURCHASE_BOOK_SET_TEXT)
    expect(set.kind).toBe('purchaseBook')
    expect(set.proportionalityFactor).toBe(0.6)
    expect(set.bookDocuments).toEqual([
      {
        documentText: 'FACTURA',
        folio: 234,
        observation: 'FACTURA DEL GIRO CON DERECHO A CREDITO',
        exemptAmount: 7893,
        affectedAmount: 3897,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
      {
        documentText: 'FACTURA ELECTRONICA',
        folio: 32,
        observation: 'FACTURA DEL GIRO CON DERECHO A CREDITO',
        exemptAmount: null,
        affectedAmount: 4305,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
      {
        documentText: 'FACTURA',
        folio: 781,
        observation: 'FACTURA CON IVA USO COMUN',
        exemptAmount: null,
        affectedAmount: 12000,
        commonUseVat: true,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
      {
        documentText: 'FACTURA ELECTRONICA',
        folio: 1004,
        observation: 'ENTREGA GRATUITA DEL PROVEEDOR',
        exemptAmount: null,
        affectedAmount: 2000,
        commonUseVat: false,
        nonRecoverableVatCode: 4,
        totalWithholding: false,
      },
      {
        documentText: 'FACTURA DE COMPRA ELECTRONICA',
        folio: 87,
        observation: 'COMPRA CON RETENCION TOTAL DEL IVA',
        exemptAmount: null,
        affectedAmount: 9000,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: true,
      },
      {
        documentText: 'NOTA DE CREDITO',
        folio: 5,
        observation: 'NOTA DE CREDITO POR DESCUENTO FACTURA ELECTRONICA 32',
        exemptAmount: null,
        affectedAmount: 1000,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
    ])
  })

  test('LIBRO DE COMPRAS PARA EXENTOS: columnar lines, OBS lines, the exempt column by type', () => {
    const [set] = parseTestSetText(EXEMPT_PURCHASE_BOOK_SET_TEXT)
    expect(set.kind).toBe('exemptPurchaseBook')
    expect(set.proportionalityFactor).toBe(0.6)
    expect(
      set.bookDocuments.map((doc) => [
        doc.documentText,
        doc.folio,
        doc.exemptAmount,
        doc.affectedAmount,
        doc.observation,
      ]),
    ).toEqual([
      ['FACTURA', 120, null, 5000, null],
      ['FACTURA ELECTRONICA', 77, 3000, 10000, null],
      ['FACTURA EXENTA', 9, 2500, null, null],
      ['NOTA DE DEBITO', 3, 400, null, 'NOTA DE DEBITO POR INTERESES FACTURA 120'],
      ['NOTA DE CREDITO ELECTRONICA', 14, null, null, 'NOTA DE CREDITO POR DESCUENTO FACTURA ELECTRONICA 77'],
    ])
  })

  test('an OBS line before any document is ignored, and a factor with no documents is kept', () => {
    const [set] = parseTestSetText(
      `SET LIBRO DE COMPRAS PARA EXENTOS - NUMERO DE ATENCION: 1\nOBS: nada\nFACTOR DE PROPORCIONALIDAD IVA: 0.4\n`,
    )
    expect(set.bookDocuments).toEqual([])
    expect(set.proportionalityFactor).toBe(0.4)
    const [plain] = parseTestSetText(
      `SET LIBRO DE COMPRAS - NUMERO DE ATENCION: 1\nFACTURA 9\nFACTURA DEL GIRO\nno es monto\nFACTOR DE PROPORCIONALIDAD 0.5\n`,
    )
    expect(plain.bookDocuments).toEqual([
      expect.objectContaining({ folio: 9, affectedAmount: null, exemptAmount: null }),
    ])
    expect(plain.proportionalityFactor).toBe(0.5)
  })

  test('a sales-book set keeps its instruction lines out and a factor outside book sets is read too', () => {
    const [set] = parseTestSetText(
      `SET LIBRO DE VENTAS - NUMERO DE ATENCION: 1\nUsar DTEs del SET BASICO\nFACTOR DE PROPORCIONALIDAD IVA: 0.7\n`,
    )
    expect(set).toMatchObject({ kind: 'salesBook', cases: [], bookDocuments: [], proportionalityFactor: 0.7 })
  })
})

describe('item rows', () => {
  const parseItems = (lines: string, reason = '') =>
    parseTestSetText(
      `SET BASICO - NUMERO DE ATENCION: 1\nCASO 1-1\nDOCUMENTO FACTURA\n${reason ? `RAZON REFERENCIA ${reason}\n` : ''}${lines}\n`,
    )[0].cases[0].items

  test('four parts with a non-letter third part is a discount row; a bad quantity becomes 1', () => {
    expect(parseItems('Pintura  x  5000  14%')).toEqual([
      { name: 'Pintura', quantity: 1, unitPrice: 5000, discount: '14%' },
    ])
    expect(parseItems('Cemento  3  SACO  abc')).toEqual([{ name: 'Cemento', quantity: 3, unit: 'SACO', unitPrice: 0 }])
    expect(parseItems('Pintura  2  x5  14%')).toEqual([{ name: 'Pintura', quantity: 2, unitPrice: 0, discount: '14%' }])
    expect(parseItems('Cemento  x  SACO  8000')).toEqual([
      { name: 'Cemento', quantity: 1, unit: 'SACO', unitPrice: 8000 },
    ])
  })

  test('three parts with a non-number fall to the fallback; two non-numeric parts are dropped', () => {
    expect(parseItems('ITEM 1         56')).toEqual([{ name: 'ITEM 1', quantity: 56 }])
    expect(parseItems('Caja grande  x  5')).toEqual([{ name: 'Caja grande  x', quantity: 5 }])
    expect(parseItems('Servicio basico  dos')).toEqual([])
    expect(parseItems('Servicio  dos  tres')).toEqual([])
    expect(parseItems('a  b  c  d  e')).toEqual([])
  })

  test('a line with a colon, a header-like first part or a single part is never an item', () => {
    expect(parseItems('NOTA: 5  6')).toEqual([])
    expect(parseItems('ITEM  5')).toEqual([])
    expect(parseItems('CANTIDAD TOTAL  5')).toEqual([])
    expect(parseItems('PRECIO UNITARIO  5')).toEqual([])
    expect(parseItems('Solo')).toEqual([])
  })

  test('MODIFICA MONTO turns the value of a two-part row into the new price', () => {
    expect(parseItems('Cajon  3100', 'MODIFICA MONTO')).toEqual([{ name: 'Cajon', quantity: 1, unitPrice: 3100 }])
    expect(parseItems('Cajon  3100', 'DEVOLUCION')).toEqual([{ name: 'Cajon', quantity: 3100 }])
  })
})

describe('detectors', () => {
  test.each([
    ['LIBRO DE COMPRAS PARA EXENTOS', 'exemptPurchaseBook'],
    ['LIBRO DE COMPRAS', 'purchaseBook'],
    ['LIBRO DE VENTAS', 'salesBook'],
    ['LIBRO DE GUIAS', 'guideBook'],
    ['GUIA DE DESPACHO', 'guide'],
    ['FACTURA EXENTA', 'exempt'],
    ['FACTURA NO AFECTA', 'exempt'],
    ['DOCUMENTOS DE EXPORTACION (2)', 'export'],
    ['LIQUIDACION FACTURA', 'settlement'],
    ['FACTURA DE COMPRA', 'purchase'],
    ['CASO GENERAL FACTURA COMPRA', 'purchase'],
    ['BASICO', 'basic'],
    ['ALGO MAS', 'other'],
  ])('set kind of %s is %s', (name, kind) => {
    expect(testSetKindOf(name)).toBe(kind)
  })

  test.each([
    ['LIQUIDACION FACTURA ELECTRONICA', 43],
    ['FACTURA DE COMPRA ELECTRONICA', 46],
    ['FACTURA DE EXPORTACION ELECTRONICA', 110],
    ['NOTA DE CREDITO DE EXPORTACION ELECTRONICA', 112],
    ['NOTA DE DEBITO DE EXPORTACION ELECTRONICA', 111],
    ['FACTURA NO AFECTA O EXENTA ELECTRONICA', 34],
    ['GUIA DE DESPACHO ELECTRONICA', 52],
    ['NOTA DE CRÉDITO ELECTRÓNICA', 61],
    ['NOTA DE DÉBITO ELECTRÓNICA', 56],
    ['FACTURA ELECTRONICA', 33],
    ['BOLETA', null],
  ])('document type of %s is %s', (text, type) => {
    expect(documentTypeOf(text)).toBe(type)
  })

  test.each([
    ['', 1],
    ['ANULA FACTURA', 1],
    ['CORRIGE GIRO', 2],
    ['CORRIGE TEXTO DEL ITEM', 2],
    ['CORRIGE MONTO', 1],
    ['DEVOLUCION DE MERCADERIAS', 3],
    ['MODIFICA MONTO', 3],
    ['OTRA COSA', 1],
  ])('reference code of "%s" is %s', (reason, code) => {
    expect(referenceCodeOf(reason)).toBe(code)
  })

  test.each([
    ['', 1],
    ['VENTA', 1],
    ['VENTAS POR EFECTUAR', 2],
    ['CONSIGNACION', 3],
    ['ENTREGA GRATUITA', 4],
    ['TRASLADO DE MATERIALES ENTRE BODEGAS', 5],
    ['TRASLADO INTERNO', 5],
    ['OTROS TRASLADOS QUE NO SON VENTA', 6],
    ['DEVOLUCION', 7],
    ['TRASLADO PARA EXPORTACION', 8],
    ['VENTA PARA EXPORTACION', 9],
    ['TRASLADO', 5],
    ['CUALQUIER COSA', 1],
  ])('transfer reason of "%s" is %s', (motive, reason) => {
    expect(transferReasonOf(motive)).toBe(reason)
  })

  test.each([
    ['EMISOR DEL DOCUMENTO AL LOCAL DEL CLIENTE', 2],
    ['CLIENTE', 1],
    ['', null],
    ['TRANSPORTISTA', null],
  ])('dispatch type of "%s" is %s', (text, type) => {
    expect(dispatchTypeOf(text)).toBe(type)
  })

  test.each([
    ['FACTURA DE COMPRA ELECTRONICA', 46],
    ['FACTURA EXENTA ELECTRONICA', 34],
    ['FACTURA NO AFECTA ELECTRONICA', 34],
    ['FACTURA ELECTRONICA', 33],
    ['FACTURA EXENTA', 30],
    ['FACTURA NO AFECTA', 30],
    ['FACTURA', 30],
    ['NOTA DE CREDITO ELECTRONICA', 61],
    ['NOTA DE CREDITO', 60],
    ['NOTA DE DEBITO ELECTRONICO', 56],
    ['NOTA DE DEBITO', 55],
    ['BOLETA', null],
  ])('book document type of %s is %s', (text, type) => {
    expect(bookDocumentTypeOf(text)).toBe(type)
  })
})

test('the parser never throws and keeps the case ids it finds', () => {
  const line = fc.oneof(
    fc.constantFrom(
      `CASO ${ATTENTION}-1`,
      'DOCUMENTO FACTURA ELECTRONICA',
      'ITEM CANTIDAD',
      'a  1  2',
      '=====',
      '-'.repeat(25),
      '',
      'OBS: x',
    ),
    fc.string({ maxLength: 40 }),
  )
  fc.assert(
    fc.property(fc.array(line, { maxLength: 40 }), (lines) => {
      const text = `SET BASICO - NUMERO DE ATENCION: ${ATTENTION}\n${lines.join('\n')}`
      const [set] = parseTestSetText(text)
      const expected = lines.filter((candidate) => candidate === `CASO ${ATTENTION}-1`).length
      expect(set.cases).toHaveLength(expected)
      expect(set.cases.every((item) => item.id === `${ATTENTION}-1`)).toBe(true)
    }),
  )
  expect(parseTestSetText('')).toEqual([])
  expect(parseTestSetText('no set here\nCASO 1-1\nDOCUMENTO FACTURA')).toEqual([])
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/certification/set-text --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/certification/set-text'`.

- [ ] **Step 3: Write the implementation**

`src/catalogs/certification.ts` (new file, whole):

```ts
import { SII_RUT } from './codes'

/**
 * EN: Kinds of set the SII test-set text can hold, by their English name.
 * ES: Tipos de set que puede traer el texto del set de pruebas del SII, por su nombre en inglés.
 */
export const TEST_SET_KINDS = {
  /** EN: Invoices and notes (33, 61, 56). ES: `SET BASICO` — Facturas y notas (33, 61, 56). */
  basic: 'basic',
  /** EN: Exempt invoices and notes (34, 61, 56). ES: `SET FACTURA EXENTA` — Facturas exentas y notas (34, 61, 56). */
  exempt: 'exempt',
  /** EN: Dispatch guides (52). ES: `SET GUIA DE DESPACHO` — Guías de despacho (52). */
  guide: 'guide',
  /** EN: Purchase invoice and notes (46, 61, 56). ES: `SET FACTURA DE COMPRA` / `SET CASO GENERAL FACTURA COMPRA` — Factura de compra y notas (46, 61, 56). */
  purchase: 'purchase',
  /** EN: Export documents (110, 111, 112); parsed, never issued. ES: `SET DOCUMENTOS DE EXPORTACION` — Documentos de exportación; se parsea, no se emite. */
  export: 'export',
  /** EN: Settlement invoices (43); parsed, never issued. ES: `SET LIQUIDACION FACTURA` — Liquidaciones factura; se parsea, no se emite. */
  settlement: 'settlement',
  /** EN: The sales book set: an instruction to use the basic set's documents. ES: `SET LIBRO DE VENTAS` — Instrucción de usar los documentos del set básico. */
  salesBook: 'salesBook',
  /** EN: The purchase book set: the supplier documents to register. ES: `SET LIBRO DE COMPRAS` — Los documentos de proveedores a registrar. */
  purchaseBook: 'purchaseBook',
  /** EN: The purchase book set for exempt taxpayers. ES: `SET LIBRO DE COMPRAS PARA EXENTOS` — Libro de compras para contribuyentes exentos. */
  exemptPurchaseBook: 'exemptPurchaseBook',
  /** EN: The guide book set: an instruction to use the guide set's documents. ES: `SET LIBRO DE GUIAS` — Instrucción de usar los documentos del set de guías. */
  guideBook: 'guideBook',
  /** EN: Any other set; ignored. ES: Cualquier otro set; se ignora. */
  other: 'other',
} as const

/** EN: Union of the set kinds. ES: Unión de los tipos de set. */
export type TestSetKind = (typeof TEST_SET_KINDS)[keyof typeof TEST_SET_KINDS]

/**
 * EN: Names of the sets and books as the certification portal lists them (`pe_avance2`).
 * ES: Nombres de los sets y libros tal como los lista el portal de certificación (`pe_avance2`).
 */
export const TEST_SET_PORTAL_NAMES: Readonly<Partial<Record<TestSetKind, string>>> = {
  basic: 'SET BASICO',
  exempt: 'SET FACTURA EXENTA',
  guide: 'SET GUIA DE DESPACHO',
  purchase: 'SET CASO GENERAL FACTURA COMPRA',
  export: 'SET DOCUMENTOS DE EXPORTACION',
  settlement: 'SET LIQUIDACION FACTURA',
  salesBook: 'LIBRO DE VENTAS',
  purchaseBook: 'LIBRO DE COMPRAS',
  exemptPurchaseBook: 'LIBRO DE COMPRAS PARA EXENTOS',
  guideBook: 'LIBRO DE GUIAS',
}

/**
 * EN: The reference document type every document of a test set carries on its first reference line.
 * ES: `TpoDocRef` — El tipo de documento de referencia que lleva cada documento del set en su primera referencia: `SET`.
 */
export const TEST_SET_REFERENCE_TYPE = 'SET'

/**
 * EN: The counterparty written on every entry of the certification purchase books: the SII's own RUT and a placeholder
 * name. The SII accepts it, it exists as a taxpayer and it is nobody's personal data.
 * ES: La contraparte de cada línea de los libros de compras de certificación: el RUT del propio SII y un nombre de
 * relleno. El SII lo acepta, existe como contribuyente y no es dato personal de nadie.
 */
export const CERTIFICATION_COUNTERPARTY = { rut: SII_RUT, name: 'Razon Social' } as const
```

`src/certification/set-text.ts` (new file, whole):

```ts
import { TEST_SET_KINDS, type TestSetKind } from '../catalogs/certification'

/**
 * EN: One item row of a case.
 * ES: Una fila de ítem de un caso.
 */
export type TestCaseItem = {
  /** EN: Item name, exactly as the set writes it. ES: Nombre del ítem, tal como lo escribe el set. */
  readonly name: string
  /** EN: Quantity; 1 when the row has none. ES: Cantidad; 1 cuando la fila no trae. */
  readonly quantity: number
  /** EN: Unit price, when the row has one. ES: Precio unitario, cuando la fila trae uno. */
  readonly unitPrice?: number
  /** EN: Unit of measure, when the row has one. ES: Unidad de medida, cuando la fila trae una. */
  readonly unit?: string
  /** EN: Discount as written, for example `10%`. ES: Descuento tal como viene, por ejemplo `10%`. */
  readonly discount?: string
}

/**
 * EN: One case of a set: one document to issue.
 * ES: Un caso de un set: un documento a emitir.
 */
export type TestCase = {
  /** EN: `<setId>-<number>`, for example `4256-1`. ES: `<setId>-<número>`, por ejemplo `4256-1`. */
  readonly id: string
  /** EN: The attention number part of the id. ES: La parte del id que es el número de atención. */
  readonly setId: string
  /** EN: Case number within the set. ES: Número del caso dentro del set. */
  readonly number: number
  /** EN: Text after `DOCUMENTO`. ES: Texto tras `DOCUMENTO`. */
  readonly documentText: string
  /** EN: Document type detected from the text, or null. ES: Tipo de documento detectado del texto, o null. */
  readonly documentType: number | null
  readonly items: readonly TestCaseItem[]
  /** EN: Text after `REFERENCIA`. ES: Texto tras `REFERENCIA`. */
  readonly referenceText: string
  /** EN: The `CASO n-m` found in the reference text, or null. ES: El `CASO n-m` encontrado en la referencia, o null. */
  readonly referencedCase: string | null
  /** EN: Text after `RAZON REFERENCIA`. ES: Texto tras `RAZON REFERENCIA`. */
  readonly reasonText: string
  /** EN: Text after `MOTIVO` (guides). ES: Texto tras `MOTIVO` (guías). */
  readonly motive: string
  /** EN: Text after `TRASLADO POR` (guides). ES: Texto tras `TRASLADO POR` (guías). */
  readonly transferBy: string
  /** EN: Percent of `DESCUENTO GLOBAL`, or null. ES: Porcentaje de `DESCUENTO GLOBAL`, o null. */
  readonly globalDiscountPercent: number | null
  /** EN: Text after `MONEDA DE LA OPERACION`. ES: Texto tras `MONEDA DE LA OPERACION`. */
  readonly currency: string
  /** EN: The export-only lines, by their upper-case label. ES: Las líneas propias de exportación, por su rótulo en mayúsculas. */
  readonly exportFields: Readonly<Record<string, string>>
  /** EN: Every line of the case after its header, trimmed. ES: Cada línea del caso tras su cabecera, recortada. */
  readonly raw: readonly string[]
}

/**
 * EN: One supplier document of a purchase-book set.
 * ES: Un documento de proveedor de un set de libro de compras.
 */
export type TestBookDocument = {
  /** EN: Document text, upper case (`FACTURA`, `FACTURA ELECTRONICA`, `NOTA DE CREDITO`…). ES: Texto del documento, en mayúsculas. */
  readonly documentText: string
  readonly folio: number
  /** EN: The observation line, or null. ES: La línea de observación, o null. */
  readonly observation: string | null
  readonly exemptAmount: number | null
  readonly affectedAmount: number | null
  /** EN: The observation says `IVA USO COMUN`. ES: La observación dice `IVA USO COMUN`. */
  readonly commonUseVat: boolean
  /** EN: 4 when the observation says `ENTREGA GRATUITA`, else null. ES: 4 cuando la observación dice `ENTREGA GRATUITA`, si no null. */
  readonly nonRecoverableVatCode: number | null
  /** EN: The observation says `RETENCION TOTAL`. ES: La observación dice `RETENCION TOTAL`. */
  readonly totalWithholding: boolean
}

/**
 * EN: One set of the test-set text.
 * ES: Un set del texto del set de pruebas.
 */
export type TestSet = {
  /** EN: Name after `SET`, trimmed. ES: Nombre tras `SET`, recortado. */
  readonly name: string
  /** EN: `NUMERO DE ATENCION`, digits as written. ES: `NUMERO DE ATENCION`, dígitos tal como vienen. */
  readonly attentionNumber: string
  readonly kind: TestSetKind
  readonly cases: readonly TestCase[]
  /** EN: Supplier documents of a purchase-book set. ES: Documentos de proveedor de un set de libro de compras. */
  readonly bookDocuments: readonly TestBookDocument[]
  /** EN: `FACTOR DE PROPORCIONALIDAD`, or null. ES: `FACTOR DE PROPORCIONALIDAD`, o null. */
  readonly proportionalityFactor: number | null
}

const SET_HEADER = /^SET\s+(.+?)\s*[-:]\s*NUMERO DE ATENCI[^\d:]*[:\s]*(\d+)/i
const CASE_HEADER = /^CASO\s+(\d+)-(\d+)\s*$/i
const EQUALS_LINE = /^=+$/
const DASH_LINE = /^-{20,}$/
const DOCUMENT_LINE = /^DOCUMENTO\s+(.+)$/i
const REFERENCE_LINE = /^REFERENCIA[:\s]+(.+)$/i
const REFERENCED_CASE = /CASO\s+(\d+-\d+)/i
const REASON_LINE = /^RAZON\s+REFERENCIA\s+(.+)$/i
const MOTIVE_LINE = /^MOTIVO[:\s]+(.+)$/i
const TRANSFER_BY_LINE = /^TRASLADO\s+POR[:\s]+(.+)$/i
const GLOBAL_DISCOUNT_LINE = /^DESCUENTO\s+GLOBAL.+?(\d+)%/i
const CURRENCY_LINE = /^MONEDA\s+DE\s+LA\s+OPERACION[:\s]+(.+)$/i
const ITEM_HEADER = /^ITEM\s+(CANTIDAD|VALOR)/i
const ITEM_SPLIT = /\t+|\s{2,}/
const ITEM_FALLBACK = /^(ITEM\s+\d+|[A-Z][^0-9]+?)\s+(\d+)$/i
const BOOK_DOCUMENT_LINE = /^(FACTURA DE COMPRA ELECTRONICA|FACTURA ELECTRONICA|FACTURA|NOTA DE CREDITO)\s+(\d+)\s*$/i
const BOOK_OBSERVATION_LINE =
  /^(FACTURA DEL GIRO|FACTURA CON IVA|NOTA DE CREDITO POR|ENTREGA GRATUITA|COMPRA CON RETENCION)/i
const TWO_AMOUNTS = /^\s*(\d+)\s+(\d+)\s*$/
const ONE_AMOUNT = /^\s*(\d+)\s*$/
const FACTOR_LINE = /FACTOR\s+DE\s+PROPORCIONALIDAD.+?(\d+\.?\d*)/i
const OBSERVATION_PREFIX = /^OBS:\s*(.*)$/i
const EXEMPT_COLUMN = /EXENTA|EXENTO|DEBITO/i

const EXPORT_LINES: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: 'FORMA DE PAGO EXPORTACION', pattern: /^FORMA\s+DE\s+PAGO\s+EXPORTACION[:\s]+(.+)$/i },
  { label: 'MODALIDAD DE VENTA', pattern: /^MODALIDAD\s+DE\s+VENTA[:\s]+(.+)$/i },
  { label: 'CLAUSULA DE VENTA', pattern: /^CLAUSULA\s+DE\s+VENTA.+?[:\s]+(.+)$/i },
  { label: 'TOTAL CLAUSULA DE VENTA', pattern: /^TOTAL\s+CLAUSULA\s+DE\s+VENTA[:\s]+(.+)$/i },
  { label: 'VIA DE TRANSPORTE', pattern: /^VIA\s+DE\s+TRANSPORTE[:\s]+(.+)$/i },
  { label: 'PUERTO DE EMBARQUE', pattern: /^PUERTO\s+DE\s+EMBARQUE[:\s]+(.+)$/i },
  { label: 'PUERTO DE DESEMBARQUE', pattern: /^PUERTO\s+DE\s+DESEMBARQUE[:\s]+(.+)$/i },
  { label: 'TIPO DE BULTO', pattern: /^TIPO\s+DE\s+BULTO[:\s]+(.+)$/i },
  { label: 'TOTAL BULTOS', pattern: /^TOTAL\s+BULTOS[:\s]+(.+)$/i },
  { label: 'FLETE', pattern: /^FLETE[^:]*[:\s]+(.+)$/i },
  { label: 'SEGURO', pattern: /^SEGURO[^:]*[:\s]+(.+)$/i },
  { label: 'PAIS RECEPTOR', pattern: /^PAIS\s+RECEPTOR[^:]*[:\s]+(.+)$/i },
  { label: 'COMISIONES EN EL EXTRANJERO', pattern: /^COMISION(?:ES)?\s+EN\s+EL\s+EXTRANJERO.*?(\d+)%/i },
]

const SET_KINDS_BY_NAME: readonly { readonly needles: readonly string[]; readonly kind: TestSetKind }[] = [
  { needles: ['LIBRO DE COMPRAS PARA EXENTOS'], kind: TEST_SET_KINDS.exemptPurchaseBook },
  { needles: ['LIBRO DE COMPRAS'], kind: TEST_SET_KINDS.purchaseBook },
  { needles: ['LIBRO DE VENTAS'], kind: TEST_SET_KINDS.salesBook },
  { needles: ['LIBRO DE GUIAS'], kind: TEST_SET_KINDS.guideBook },
  { needles: ['GUIA'], kind: TEST_SET_KINDS.guide },
  { needles: ['FACTURA EXENTA', 'NO AFECTA'], kind: TEST_SET_KINDS.exempt },
  { needles: ['EXPORTACION'], kind: TEST_SET_KINDS.export },
  { needles: ['LIQUIDACION'], kind: TEST_SET_KINDS.settlement },
  { needles: ['FACTURA DE COMPRA', 'FACTURA COMPRA'], kind: TEST_SET_KINDS.purchase },
  { needles: ['BASICO'], kind: TEST_SET_KINDS.basic },
]

/**
 * EN: The kind of a set from its name, first match wins; `other` when nothing matches.
 * ES: El tipo de un set según su nombre, gana la primera coincidencia; `other` si nada coincide.
 */
export const testSetKindOf = (name: string): TestSetKind => {
  const upper = name.toUpperCase()
  return (
    SET_KINDS_BY_NAME.find(({ needles }) => needles.some((needle) => upper.includes(needle)))?.kind ??
    TEST_SET_KINDS.other
  )
}

const DOCUMENT_TYPES_BY_TEXT: readonly { readonly test: (upper: string) => boolean; readonly type: number }[] = [
  { test: (u) => u.includes('LIQUIDACI'), type: 43 },
  { test: (u) => u.includes('FACTURA DE COMPRA'), type: 46 },
  { test: (u) => u.includes('FACTURA DE EXPORTACI'), type: 110 },
  { test: (u) => u.includes('NOTA DE CREDITO') && u.includes('EXPORTACION'), type: 112 },
  { test: (u) => u.includes('NOTA DE DEBITO') && u.includes('EXPORTACION'), type: 111 },
  { test: (u) => u.includes('NO AFECTA') || u.includes('EXENTA'), type: 34 },
  { test: (u) => u.includes('GUIA'), type: 52 },
  { test: (u) => u.includes('NOTA DE CREDITO') || u.includes('NOTA DE CRÉDITO'), type: 61 },
  { test: (u) => u.includes('NOTA DE DEBITO') || u.includes('NOTA DE DÉBITO'), type: 56 },
  { test: (u) => u.includes('FACTURA'), type: 33 },
]

/**
 * EN: The document type a case text names, or null.
 * ES: El tipo de documento que nombra el texto de un caso, o null.
 */
export const documentTypeOf = (documentText: string): number | null => {
  const upper = documentText.toUpperCase()
  return DOCUMENT_TYPES_BY_TEXT.find(({ test }) => test(upper))?.type ?? null
}

/**
 * EN: The reference code a reason text implies: 1 cancels, 2 corrects text, 3 corrects amounts.
 * ES: `CodRef` — El código de referencia que implica una razón: 1 anula, 2 corrige texto, 3 corrige montos.
 */
export const referenceCodeOf = (reasonText: string): 1 | 2 | 3 => {
  const upper = reasonText.toUpperCase().trim()
  if (upper === '' || upper.includes('ANULA')) return 1
  if (upper.includes('CORRIGE') && (upper.includes('GIRO') || upper.includes('TEXTO'))) return 2
  if (upper.includes('DEVOLUCION') || upper.includes('MODIFICA')) return 3
  return 1
}

const TRANSFER_REASONS: readonly { readonly test: (upper: string) => boolean; readonly reason: number }[] = [
  { test: (u) => u.includes('TRASLADO') && (u.includes('INTERNO') || u.includes('BODEGA')), reason: 5 },
  { test: (u) => u.includes('OTRO') && u.includes('TRASLADO'), reason: 6 },
  { test: (u) => u.includes('DEVOLUCION'), reason: 7 },
  { test: (u) => u.includes('CONSIGNACION'), reason: 3 },
  { test: (u) => u.includes('GRATUITA'), reason: 4 },
  { test: (u) => u.includes('VENTA') && u.includes('EXPORTACION'), reason: 9 },
  { test: (u) => u.includes('VENTA') && u.includes('EFECTUAR'), reason: 2 },
  { test: (u) => u.includes('VENTA'), reason: 1 },
  { test: (u) => u.includes('EXPORTACION'), reason: 8 },
  { test: (u) => u.includes('TRASLADO'), reason: 5 },
]

/**
 * EN: The transfer reason (`IndTraslado`) a guide motive implies; 1 when the motive is empty or unknown. Specific
 * wordings go first because "otros traslados que no son venta" contains `VENTA`.
 * ES: `IndTraslado` — El tipo de traslado que implica el motivo de una guía; 1 si el motivo falta o no se reconoce. Las
 * frases específicas van primero porque "otros traslados que no son venta" contiene `VENTA`.
 */
export const transferReasonOf = (motive: string): number => {
  const upper = motive.toUpperCase().trim()
  if (upper === '') return 1
  return TRANSFER_REASONS.find(({ test }) => test(upper))?.reason ?? 1
}

/**
 * EN: The dispatch type (`TipoDespacho`) a `TRASLADO POR` text implies: 2 by the issuer, 1 by the customer, none
 * otherwise. `EMISOR` is checked first: "emisor del documento al local del cliente" holds both words.
 * ES: `TipoDespacho` — El tipo de despacho que implica el texto de `TRASLADO POR`: 2 por cuenta del emisor, 1 por cuenta
 * del cliente, ninguno si no. `EMISOR` se busca primero: "emisor del documento al local del cliente" tiene ambas palabras.
 */
export const dispatchTypeOf = (transferBy: string): 1 | 2 | null => {
  const upper = transferBy.toUpperCase()
  if (upper.includes('EMISOR')) return 2
  if (upper.includes('CLIENTE')) return 1
  return null
}

/**
 * EN: The book document type (`TpoDoc`) of a purchase-book line: electronic invoices 33, 34 and 46, paper invoices 30,
 * electronic notes 61 and 56, paper notes 60 and 55; null when unknown.
 * ES: `TpoDoc` — El tipo de documento de libro de una línea del set de compras: facturas electrónicas 33, 34 y 46,
 * factura en papel 30, notas electrónicas 61 y 56, notas en papel 60 y 55; null si no se reconoce.
 */
export const bookDocumentTypeOf = (documentText: string): number | null => {
  const upper = documentText.toUpperCase().trim()
  const electronic = upper.includes('ELECTRONICA') || upper.includes('ELECTRONICO')
  if (upper.includes('FACTURA DE COMPRA ELECTRONICA')) return 46
  if (upper.includes('FACTURA EXENTA ELECTRONICA') || (upper.includes('NO AFECTA') && electronic)) return 34
  if (upper.includes('FACTURA ELECTRONICA')) return 33
  if (upper.includes('FACTURA EXENTA') || upper.includes('FACTURA NO AFECTA')) return 30
  if (upper === 'FACTURA') return 30
  if (upper.includes('NOTA DE CREDITO')) return electronic ? 61 : 60
  if (upper.includes('NOTA DE DEBITO')) return electronic ? 56 : 55
  return null
}

const int = (value: string): number => parseInt(value, 10)

const parseItemRow = (line: string, reasonText: string): TestCaseItem | null => {
  const parts = line
    .split(ITEM_SPLIT)
    .map((part) => part.trim())
    .filter((part) => part !== '')
  if (parts.length >= 2 && !line.includes(':') && !/^(DOCUMENTO|REFERENCIA|RAZON)/i.test(line)) {
    const first = parts[0].toUpperCase()
    if (first === 'ITEM' || first.includes('CANTIDAD') || first.includes('UNITARIO')) return null
    {
      if (parts.length === 4) {
        if (/^[A-Za-z]+$/.test(parts[2]))
          return { name: parts[0], quantity: int(parts[1]) || 1, unit: parts[2], unitPrice: int(parts[3]) || 0 }
        return { name: parts[0], quantity: int(parts[1]) || 1, unitPrice: int(parts[2]) || 0, discount: parts[3] }
      }
      if (parts.length === 3) {
        const quantity = int(parts[1])
        const unitPrice = int(parts[2])
        if (!Number.isNaN(quantity) && !Number.isNaN(unitPrice)) return { name: parts[0], quantity, unitPrice }
      }
      if (parts.length === 2) {
        const value = int(parts[1])
        if (!Number.isNaN(value))
          return reasonText.includes('MODIFICA MONTO')
            ? { name: parts[0], quantity: 1, unitPrice: value }
            : { name: parts[0], quantity: value }
      }
    }
  }
  const fallback = ITEM_FALLBACK.exec(line)
  return fallback ? { name: fallback[1], quantity: int(fallback[2]) } : null
}

type MutableCase = {
  -readonly [K in keyof TestCase]: TestCase[K] extends readonly (infer T)[] ? T[] : TestCase[K]
} & { exportFields: Record<string, string> }
type MutableBookDocument = { -readonly [K in keyof TestBookDocument]: TestBookDocument[K] }
type MutableSet = {
  name: string
  attentionNumber: string
  kind: TestSetKind
  cases: TestCase[]
  bookDocuments: TestBookDocument[]
  proportionalityFactor: number | null
}

const newCase = (setId: string, number: number): MutableCase => ({
  id: `${setId}-${number}`,
  setId,
  number,
  documentText: '',
  documentType: null,
  items: [],
  referenceText: '',
  referencedCase: null,
  reasonText: '',
  motive: '',
  transferBy: '',
  globalDiscountPercent: null,
  currency: '',
  exportFields: {},
  raw: [],
})

const newBookDocument = (documentText: string, folio: number): MutableBookDocument => ({
  documentText: documentText.toUpperCase(),
  folio,
  observation: null,
  exemptAmount: null,
  affectedAmount: null,
  commonUseVat: false,
  nonRecoverableVatCode: null,
  totalWithholding: false,
})

const isBookHeaderRow = (upper: string): boolean =>
  (upper.includes('TIPO DOCUMENTO') && upper.includes('FOLIO')) ||
  (upper.includes('MONTO EXENTO') && upper.includes('MONTO AFECTO'))

const observe = (document: MutableBookDocument, observation: string): void => {
  const upper = observation.toUpperCase()
  document.observation = observation
  if (upper.includes('IVA USO COMUN')) document.commonUseVat = true
  if (upper.includes('ENTREGA GRATUITA')) document.nonRecoverableVatCode = 4
  if (upper.includes('RETENCION TOTAL')) document.totalWithholding = true
}

/**
 * EN: Parses the text of the SII test set: sets, their cases with items and references, the supplier documents of the
 * purchase-book sets and the proportionality factor. Lines the grammar does not know are ignored and a set of unknown
 * kind is `other`, so the function never throws. The text is the portal page with its tags turned into line breaks and
 * its entities decoded, or a file holding the same.
 * ES: Parsea el texto del set de pruebas del SII: sets, sus casos con ítems y referencias, los documentos de proveedor
 * de los sets de libro de compras y el factor de proporcionalidad. Las líneas que la gramática no conoce se ignoran y
 * un set de tipo desconocido es `other`, así que la función nunca lanza. El texto es la página del portal con las
 * etiquetas vueltas saltos de línea y las entidades decodificadas, o un archivo con lo mismo.
 * @param text EN: the set text. ES: el texto del set.
 */
export const parseTestSetText = (text: string): readonly TestSet[] => {
  const sets: TestSet[] = []
  let set: MutableSet | null = null
  let current: MutableCase | null = null
  let bookDocument: MutableBookDocument | null = null
  let awaitingAmounts = false

  const closeCase = (): void => {
    if (set !== null && current !== null)
      set.cases.push({ ...current, documentType: documentTypeOf(current.documentText) })
    current = null
  }
  const closeBookDocument = (): void => {
    if (set !== null && bookDocument !== null) set.bookDocuments.push(bookDocument)
    bookDocument = null
    awaitingAmounts = false
  }
  const closeSet = (): void => {
    closeCase()
    closeBookDocument()
    if (set !== null) sets.push(set)
    set = null
  }

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    const header = SET_HEADER.exec(line)
    if (header !== null) {
      closeSet()
      const name = header[1].trim()
      set = {
        name,
        attentionNumber: header[2],
        kind: testSetKindOf(name),
        cases: [],
        bookDocuments: [],
        proportionalityFactor: null,
      }
      continue
    }
    if (set === null) continue
    const caseHeader = CASE_HEADER.exec(line)
    if (caseHeader !== null) {
      closeCase()
      closeBookDocument()
      current = newCase(caseHeader[1], int(caseHeader[2]))
      continue
    }
    if (EQUALS_LINE.test(line)) continue
    if (DASH_LINE.test(line)) {
      closeCase()
      closeBookDocument()
      continue
    }
    if (current !== null) {
      current.raw.push(line)
      parseCaseLine(current, line)
      continue
    }
    if (set.kind === TEST_SET_KINDS.purchaseBook) {
      const upper = line.toUpperCase()
      if (isBookHeaderRow(upper)) continue
      const documentLine = BOOK_DOCUMENT_LINE.exec(line)
      if (documentLine !== null) {
        closeBookDocument()
        bookDocument = newBookDocument(documentLine[1], int(documentLine[2]))
        continue
      }
      if (bookDocument !== null && !awaitingAmounts && BOOK_OBSERVATION_LINE.test(line)) {
        observe(bookDocument, line)
        awaitingAmounts = true
        continue
      }
      if (bookDocument !== null && awaitingAmounts) {
        const two = TWO_AMOUNTS.exec(line)
        if (two !== null) {
          bookDocument.exemptAmount = int(two[1])
          bookDocument.affectedAmount = int(two[2])
          awaitingAmounts = false
          continue
        }
        const one = ONE_AMOUNT.exec(line)
        if (one !== null) {
          bookDocument.affectedAmount = int(one[1])
          awaitingAmounts = false
          continue
        }
      }
      const factor = FACTOR_LINE.exec(line)
      if (factor !== null) set.proportionalityFactor = parseFloat(factor[1])
      continue
    }
    if (set.kind === TEST_SET_KINDS.exemptPurchaseBook) {
      const upper = line.toUpperCase()
      if (isBookHeaderRow(upper)) continue
      const observation = OBSERVATION_PREFIX.exec(line)
      if (observation !== null) {
        if (bookDocument !== null) observe(bookDocument, observation[1].trim())
        continue
      }
      const factor = FACTOR_LINE.exec(line)
      if (factor !== null) {
        set.proportionalityFactor = parseFloat(factor[1])
        continue
      }
      const parts = line
        .split(ITEM_SPLIT)
        .map((part) => part.trim())
        .filter((part) => part !== '')
      if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
        closeBookDocument()
        bookDocument = newBookDocument(parts[0], int(parts[1]))
        if (parts.length >= 4) {
          bookDocument.exemptAmount = int(parts[2])
          bookDocument.affectedAmount = int(parts[3])
        } else if (parts.length === 3) {
          if (EXEMPT_COLUMN.test(parts[0])) bookDocument.exemptAmount = int(parts[2])
          else bookDocument.affectedAmount = int(parts[2])
        }
      }
      continue
    }
    const factor = FACTOR_LINE.exec(line)
    if (factor !== null) set.proportionalityFactor = parseFloat(factor[1])
  }
  closeSet()
  return sets
}

const parseCaseLine = (current: MutableCase, line: string): void => {
  const document = DOCUMENT_LINE.exec(line)
  if (document !== null) {
    current.documentText = document[1].trim()
    return
  }
  const reference = REFERENCE_LINE.exec(line)
  if (reference !== null) {
    current.referenceText = reference[1].trim()
    current.referencedCase = REFERENCED_CASE.exec(reference[1])?.[1] ?? null
    return
  }
  const reason = REASON_LINE.exec(line)
  if (reason !== null) {
    current.reasonText = reason[1].trim()
    return
  }
  const motive = MOTIVE_LINE.exec(line)
  if (motive !== null) {
    current.motive = motive[1].trim()
    return
  }
  const transferBy = TRANSFER_BY_LINE.exec(line)
  if (transferBy !== null) {
    current.transferBy = transferBy[1].trim()
    return
  }
  const discount = GLOBAL_DISCOUNT_LINE.exec(line)
  if (discount !== null) {
    current.globalDiscountPercent = int(discount[1])
    return
  }
  const currency = CURRENCY_LINE.exec(line)
  if (currency !== null) {
    current.currency = currency[1].trim()
    return
  }
  for (const { label, pattern } of EXPORT_LINES) {
    const match = pattern.exec(line)
    if (match !== null) {
      current.exportFields[label] = match[1].trim()
      return
    }
  }
  if (ITEM_HEADER.test(line)) return
  const item = parseItemRow(line, current.reasonText)
  if (item !== null) current.items.push(item)
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/certification/set-text --coverage=false
```

Expected: PASS, 82 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/catalogs/certification.ts src/certification/set-text.ts tests/support/test-set-samples.ts tests/certification/set-text.test.ts
```

```bash
git commit -F - <<'MSG'
feat: parse the SII test-set text

The certification catalog (set kinds, their portal names, the SET reference type and the
placeholder counterparty of the purchase books) and parseTestSetText, which reads the text the
SII generates for an applicant line by line: sets, cases with items and references, the two
purchase-book sets and the proportionality factor. The grammar follows the sets delivered in
the field; no real text exists in any public source, so synthetic texts stand in.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 2: The plan of the certification sets

`planCertificationSets` (spec 3.3): the cases each set issues, typed, with the folios every document type needs; the last set of each kind wins; export, settlement, sales-book and guide-book sets have no plan entry.

**Files:**

- Create: `src/certification/set-plan.ts`
- Test (create): `tests/certification/set-plan.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/certification/set-plan.test.ts` (new file, whole):

```ts
import { planCertificationSets } from '../../src/certification/set-plan'
import { parseTestSetText } from '../../src/certification/set-text'
import { ATTENTION, FULL_SET_TEXT, purchaseSetText } from '../support/test-set-samples'

const plan = planCertificationSets(parseTestSetText(FULL_SET_TEXT))
const id = (n: number) => `${ATTENTION}-${n}`

test('the basic set: invoices with exempt items and discounts, notes with codes, reasons and items', () => {
  const basic = plan.basic!
  expect(basic).toMatchObject({ kind: 'basic', attentionNumber: ATTENTION, folios: { 33: 3, 61: 3, 56: 2 } })
  expect(basic.invoices).toEqual([
    {
      caseId: id(1),
      items: [
        { name: 'Cajon de manzanas', quantity: 130, unitPrice: 2800 },
        { name: 'Relleno de pollo', quantity: 90, unitPrice: 1700 },
      ],
    },
    {
      caseId: id(2),
      items: [
        { name: 'Pintura blanca', quantity: 40, unitPrice: 5000, discountPercent: 14 },
        { name: 'Servicio exento de instalacion', quantity: 1, unitPrice: 20000, exempt: true },
      ],
      globalDiscountPercent: 7,
    },
    { caseId: id(3), items: [{ name: 'Cemento', quantity: 10, unitPrice: 8000 }] },
  ])
  expect(basic.creditNotes).toEqual([
    {
      caseId: id(4),
      referencedCase: id(1),
      referenceCode: 3,
      reasonText: 'DEVOLUCION DE MERCADERIAS',
      items: [{ name: 'Cajon de manzanas', quantity: 62, unitPrice: 0 }],
      itemsFromCase: null,
    },
    {
      caseId: id(5),
      referencedCase: id(2),
      referenceCode: 2,
      reasonText: 'CORRIGE GIRO DEL RECEPTOR',
      items: [{ name: 'CORRIGE GIRO DEL RECEPTOR', quantity: 1, unitPrice: 0 }],
      itemsFromCase: null,
    },
    {
      caseId: id(6),
      referencedCase: id(3),
      referenceCode: 1,
      reasonText: 'ANULA FACTURA ELECTRONICA',
      items: [{ name: 'ANULA FACTURA ELECTRONICA', quantity: 1, unitPrice: 0 }],
      itemsFromCase: id(3),
    },
  ])
  expect(basic.debitNotes).toEqual([
    {
      caseId: id(7),
      referencedCase: id(6),
      referenceCode: 1,
      reasonText: 'ANULA NOTA DE CREDITO ELECTRONICA',
      items: [{ name: 'ANULA NOTA DE CREDITO ELECTRONICA', quantity: 1, unitPrice: 0 }],
      itemsFromCase: null,
    },
    {
      caseId: id(8),
      referencedCase: id(1),
      referenceCode: 3,
      reasonText: 'MODIFICA MONTO',
      items: [{ name: 'Cajon de manzanas', quantity: 1, unitPrice: 3100 }],
      itemsFromCase: null,
    },
  ])
})

test('the exempt set: every item exempt, units on invoices, notes may have no items', () => {
  const exempt = plan.exempt!
  expect(exempt).toMatchObject({ kind: 'exempt', folios: { 34: 1, 61: 2, 56: 1 } })
  expect(exempt.invoices).toEqual([
    {
      caseId: id(9),
      items: [
        { name: 'Arriendo de oficina', quantity: 1, unitPrice: 450000, unit: 'UN', exempt: true },
        { name: 'Asesoria tributaria', quantity: 2, unitPrice: 80000, unit: 'UN', exempt: true },
      ],
    },
  ])
  expect(exempt.creditNotes[0]).toEqual({
    caseId: id(10),
    referencedCase: id(9),
    referenceCode: 3,
    reasonText: 'DEVOLUCION DE MERCADERIAS',
    items: [],
    itemsFromCase: null,
  })
  expect(exempt.creditNotes[1].items).toEqual([
    { name: 'Asesoria tributaria', quantity: 1, unitPrice: 75000, exempt: true },
  ])
  expect(exempt.debitNotes[0]).toMatchObject({ caseId: id(11), referenceCode: 1, items: [], itemsFromCase: null })
})

test('the guide set: transfer reasons and dispatch types from the texts', () => {
  expect(plan.guide).toEqual({
    kind: 'guide',
    attentionNumber: ATTENTION,
    guides: [
      {
        caseId: id(13),
        transferReason: 1,
        dispatchType: 2,
        items: [{ name: 'Cajon de manzanas', quantity: 25, unitPrice: 2800 }],
      },
      {
        caseId: id(14),
        transferReason: 5,
        dispatchType: 1,
        items: [{ name: 'Relleno de pollo', quantity: 40, unitPrice: 0 }],
      },
      { caseId: id(15), transferReason: 1, items: [{ name: 'Pintura blanca', quantity: 12, unitPrice: 5000 }] },
    ],
    folios: { 52: 3 },
  })
})

test('the purchase set: the last of each kind, the debit note copying the credit note items', () => {
  expect(plan.purchase).toEqual({
    kind: 'purchase',
    attentionNumber: ATTENTION,
    invoice: { caseId: id(16), items: [{ name: 'Chatarra de fierro', quantity: 300, unitPrice: 1200 }] },
    creditNote: {
      caseId: id(17),
      referencedCase: id(16),
      referenceCode: 3,
      reasonText: 'DEVOLUCION DE MERCADERIAS',
      items: [{ name: 'Chatarra de fierro', quantity: 100, unitPrice: 0 }],
      itemsFromCase: null,
    },
    debitNote: {
      caseId: id(18),
      referencedCase: id(17),
      referenceCode: 1,
      reasonText: 'ANULA NOTA DE CREDITO',
      items: [{ name: 'Chatarra de fierro', quantity: 100, unitPrice: 0 }],
      itemsFromCase: null,
    },
    folios: { 46: 1, 61: 1, 56: 1 },
  })
})

test('a purchase set without an invoice case is left out, and one with the invoice only has no notes', () => {
  const noInvoice = purchaseSetText().replace('FACTURA DE COMPRA ELECTRONICA', 'GUIA DE DESPACHO')
  expect(planCertificationSets(parseTestSetText(noInvoice)).purchase).toBeUndefined()
  const onlyInvoice = purchaseSetText().split('--------------------------------------------------')[0]
  expect(planCertificationSets(parseTestSetText(onlyInvoice)).purchase).toMatchObject({
    creditNote: null,
    debitNote: null,
    folios: { 46: 1, 61: 0, 56: 0 },
  })
})

test('the purchase-book sets carry their documents and factor, and a missing factor is 0.6', () => {
  expect(plan.purchaseBook).toMatchObject({
    kind: 'purchaseBook',
    attentionNumber: ATTENTION,
    proportionalityFactor: 0.6,
  })
  expect(plan.purchaseBook!.documents).toHaveLength(6)
  expect(plan.exemptPurchaseBook).toMatchObject({ kind: 'exemptPurchaseBook', proportionalityFactor: 0.6 })
  const noFactor = planCertificationSets(parseTestSetText('SET LIBRO DE COMPRAS - NUMERO DE ATENCION: 1\nFACTURA 1\n'))
  expect(noFactor.purchaseBook).toMatchObject({
    proportionalityFactor: 0.6,
    documents: [expect.objectContaining({ folio: 1 })],
  })
})

test('export, sales-book and unknown sets have no plan entry, and the last set of a kind wins', () => {
  expect(Object.keys(plan).sort()).toEqual([
    'basic',
    'exempt',
    'exemptPurchaseBook',
    'guide',
    'purchase',
    'purchaseBook',
  ])
  const twice = planCertificationSets(
    parseTestSetText(
      `SET BASICO - NUMERO DE ATENCION: 1\nCASO 1-1\nDOCUMENTO FACTURA\n\nSET BASICO - NUMERO DE ATENCION: 2\nCASO 2-1\nDOCUMENTO FACTURA\n`,
    ),
  )
  expect(twice.basic?.attentionNumber).toBe('2')
  const empty = planCertificationSets(
    parseTestSetText('SET ALGO - NUMERO DE ATENCION: 1\nCASO 1-1\nDOCUMENTO FACTURA\n'),
  )
  expect(empty).toEqual({})
})

test('a discount that is not a number is dropped, a zero quantity on an exempt row becomes 1, and an exempt unit row keeps its unit', () => {
  const basic = planCertificationSets(
    parseTestSetText('SET BASICO - NUMERO DE ATENCION: 1\nCASO 1-1\nDOCUMENTO FACTURA\nPintura  2  5000  x%\n'),
  ).basic!
  expect(basic.invoices[0].items).toEqual([{ name: 'Pintura', quantity: 2, unitPrice: 5000 }])
  const exempt = planCertificationSets(
    parseTestSetText(
      'SET FACTURA EXENTA - NUMERO DE ATENCION: 1\nCASO 1-1\nDOCUMENTO FACTURA EXENTA\nCapacitacion  0  30000\nArriendo bodega  1  MES  100000\n',
    ),
  ).exempt!
  expect(exempt.invoices[0].items).toEqual([
    { name: 'Capacitacion', quantity: 1, unitPrice: 30000, unit: 'UN', exempt: true },
    { name: 'Arriendo bodega', quantity: 1, unitPrice: 100000, unit: 'MES', exempt: true },
  ])
})

test('invoice and exempt rows without a price get price 0', () => {
  const text = 'SET BASICO - NUMERO DE ATENCION: 1\nCASO 1-1\nDOCUMENTO FACTURA\nCajon  5\n'
  expect(planCertificationSets(parseTestSetText(text)).basic!.invoices[0].items).toEqual([
    { name: 'Cajon', quantity: 5, unitPrice: 0 },
  ])
  const exempt =
    'SET FACTURA EXENTA - NUMERO DE ATENCION: 1\nCASO 1-1\nDOCUMENTO FACTURA EXENTA\nCajon  5\nCASO 1-2\nDOCUMENTO NOTA DE CREDITO\nREFERENCIA CASO 1-1\nRAZON REFERENCIA DEVOLUCION\nCajon  2\n'
  const plan = planCertificationSets(parseTestSetText(exempt)).exempt!
  expect(plan.invoices[0].items).toEqual([{ name: 'Cajon', quantity: 5, unitPrice: 0, unit: 'UN', exempt: true }])
  expect(plan.creditNotes[0].items).toEqual([{ name: 'Cajon', quantity: 2, unitPrice: 0, exempt: true }])
})

test('a purchase debit note keeps its own items, and copies nothing when there is no credit note', () => {
  const own = purchaseSetText().replace(
    'RAZON REFERENCIA                 ANULA NOTA DE CREDITO',
    'RAZON REFERENCIA                 MODIFICA MONTO\nChatarra de fierro  1500',
  )
  expect(planCertificationSets(parseTestSetText(own)).purchase!.debitNote!.items).toEqual([
    { name: 'Chatarra de fierro', quantity: 1, unitPrice: 1500 },
  ])
  const noCredit = purchaseSetText().replace('NOTA DE CREDITO ELECTRONICA', 'GUIA DE DESPACHO')
  expect(planCertificationSets(parseTestSetText(noCredit)).purchase).toMatchObject({
    creditNote: null,
    debitNote: { items: [] },
    folios: { 46: 1, 61: 0, 56: 1 },
  })
})

test('a later purchase set without an invoice keeps the earlier plan', () => {
  const text = `${purchaseSetText()}\nSET FACTURA DE COMPRA - NUMERO DE ATENCION: 2\nCASO 2-1\nDOCUMENTO NOTA DE CREDITO\n`
  expect(planCertificationSets(parseTestSetText(text)).purchase?.attentionNumber).toBe(ATTENTION)
})

test('a basic note whose row has a discount or a unit keeps only name, quantity and price', () => {
  const text = `SET BASICO - NUMERO DE ATENCION: 1\nCASO 1-1\nDOCUMENTO FACTURA\nCemento  10  SACO  8000\nCASO 1-2\nDOCUMENTO NOTA DE DEBITO\nREFERENCIA CASO 1-1\nRAZON REFERENCIA MODIFICA MONTO\nCemento  2  9000  10%\n`
  const basic = planCertificationSets(parseTestSetText(text)).basic!
  expect(basic.invoices[0].items).toEqual([{ name: 'Cemento', quantity: 10, unitPrice: 8000 }])
  expect(basic.debitNotes[0].items).toEqual([{ name: 'Cemento', quantity: 2, unitPrice: 9000 }])
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/certification/set-plan --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/certification/set-plan'`.

- [ ] **Step 3: Write the implementation**

`src/certification/set-plan.ts` (new file, whole):

```ts
import { dispatchTypeOf, referenceCodeOf, transferReasonOf } from './set-text'
import type { TestBookDocument, TestCase, TestCaseItem, TestSet } from './set-text'

/**
 * EN: An item of a case, ready to become a phase 1 line.
 * ES: Un ítem de un caso, listo para ser una línea de la fase 1.
 */
export type PlannedItem = {
  readonly name: string
  readonly quantity: number
  /** EN: Unit price; 0 when the case gives none. ES: Precio unitario; 0 cuando el caso no trae. */
  readonly unitPrice: number
  readonly unit?: string
  /** EN: Line discount, percent. ES: `DescuentoPct` — Descuento de la línea, en porcentaje. */
  readonly discountPercent?: number
  /** EN: Exempt line. ES: `IndExe` — Línea exenta. */
  readonly exempt?: boolean
}

/**
 * EN: An invoice case (33, 34 or 46).
 * ES: Un caso de factura (33, 34 o 46).
 */
export type PlannedInvoice = {
  readonly caseId: string
  readonly items: readonly PlannedItem[]
  /** EN: `DESCUENTO GLOBAL` of the case, percent. ES: `DESCUENTO GLOBAL` del caso, en porcentaje. */
  readonly globalDiscountPercent?: number
}

/**
 * EN: A credit or debit note case.
 * ES: Un caso de nota de crédito o débito.
 */
export type PlannedNote = {
  readonly caseId: string
  /** EN: The case this note refers to, or null. ES: El caso al que refiere esta nota, o null. */
  readonly referencedCase: string | null
  /** EN: `CodRef` derived from the reason text. ES: `CodRef` derivado del texto de la razón. */
  readonly referenceCode: 1 | 2 | 3
  /** EN: `RAZON REFERENCIA` verbatim. ES: `RAZON REFERENCIA` textual. */
  readonly reasonText: string
  readonly items: readonly PlannedItem[]
  /** EN: The case whose items the note takes (an `ANULA` note of the basic set), or null. ES: El caso cuyos ítems toma la nota (una nota `ANULA` del set básico), o null. */
  readonly itemsFromCase: string | null
}

/**
 * EN: A dispatch guide case.
 * ES: Un caso de guía de despacho.
 */
export type PlannedGuide = {
  readonly caseId: string
  /** EN: `IndTraslado` from the motive. ES: `IndTraslado` según el motivo. */
  readonly transferReason: number
  /** EN: `TipoDespacho` from `TRASLADO POR`, when it says. ES: `TipoDespacho` según `TRASLADO POR`, cuando lo dice. */
  readonly dispatchType?: 1 | 2
  readonly items: readonly PlannedItem[]
}

/** EN: Folios each document type needs. ES: Folios que necesita cada tipo de documento. */
export type SetFolios = Readonly<Record<number, number>>

/**
 * EN: The basic set: invoices 33, credit notes 61, debit notes 56.
 * ES: El set básico: facturas 33, notas de crédito 61, notas de débito 56.
 */
export type BasicSetPlan = {
  readonly kind: 'basic'
  readonly attentionNumber: string
  readonly invoices: readonly PlannedInvoice[]
  readonly creditNotes: readonly PlannedNote[]
  readonly debitNotes: readonly PlannedNote[]
  readonly folios: SetFolios
}

/**
 * EN: The exempt set: invoices 34, credit notes 61, debit notes 56; every line exempt.
 * ES: El set exento: facturas 34, notas de crédito 61, notas de débito 56; toda línea exenta.
 */
export type ExemptSetPlan = Omit<BasicSetPlan, 'kind'> & { readonly kind: 'exempt' }

/**
 * EN: The guide set: one 52 per case.
 * ES: El set de guías: una 52 por caso.
 */
export type GuideSetPlan = {
  readonly kind: 'guide'
  readonly attentionNumber: string
  readonly guides: readonly PlannedGuide[]
  readonly folios: SetFolios
}

/**
 * EN: The purchase set: one 46, at most one 61 and one 56.
 * ES: El set de factura de compra: una 46, a lo más una 61 y una 56.
 */
export type PurchaseSetPlan = {
  readonly kind: 'purchase'
  readonly attentionNumber: string
  readonly invoice: PlannedInvoice
  readonly creditNote: PlannedNote | null
  readonly debitNote: PlannedNote | null
  readonly folios: SetFolios
}

/**
 * EN: A purchase-book set: the supplier documents and the proportionality factor (0.6 when the set gives none).
 * ES: Un set de libro de compras: los documentos de proveedor y el factor de proporcionalidad (0,6 si el set no lo trae).
 */
export type PurchaseBookPlan = {
  readonly kind: 'purchaseBook' | 'exemptPurchaseBook'
  readonly attentionNumber: string
  readonly documents: readonly TestBookDocument[]
  readonly proportionalityFactor: number
}

/**
 * EN: What the certification issues, per set kind; a kind the text lacks is absent. The sales and guide books have no
 * plan: they come from the issued basic and guide sets.
 * ES: Lo que la certificación emite, por tipo de set; un tipo que el texto no trae está ausente. Los libros de ventas
 * y de guías no tienen plan: salen de los sets básico y de guías emitidos.
 */
export type CertificationPlan = {
  readonly basic?: BasicSetPlan
  readonly exempt?: ExemptSetPlan
  readonly guide?: GuideSetPlan
  readonly purchase?: PurchaseSetPlan
  readonly purchaseBook?: PurchaseBookPlan
  readonly exemptPurchaseBook?: PurchaseBookPlan
}

const DEFAULT_PROPORTIONALITY_FACTOR = 0.6

const percent = (discount: string | undefined): number | undefined => {
  if (discount === undefined) return undefined
  const value = parseInt(discount, 10)
  return Number.isNaN(value) ? undefined : value
}

const compact = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T

const invoiceItem = (item: TestCaseItem): PlannedItem =>
  compact({
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice ?? 0,
    discountPercent: percent(item.discount),
    exempt: item.name.toUpperCase().includes('EXENTO') ? true : undefined,
  })

const exemptItem = (item: TestCaseItem, withUnit: boolean): PlannedItem =>
  compact({
    name: item.name,
    quantity: item.quantity || 1,
    unitPrice: item.unitPrice ?? 0,
    unit: withUnit ? (item.unit ?? 'UN') : undefined,
    exempt: true,
  })

const plainItem = (item: TestCaseItem): PlannedItem => ({
  name: item.name,
  quantity: item.quantity,
  unitPrice: item.unitPrice ?? 0,
})

const note = (testCase: TestCase, items: readonly PlannedItem[], itemsFromCase: string | null): PlannedNote => ({
  caseId: testCase.id,
  referencedCase: testCase.referencedCase,
  referenceCode: referenceCodeOf(testCase.reasonText),
  reasonText: testCase.reasonText,
  items,
  itemsFromCase,
})

const reasonLine = (testCase: TestCase): PlannedItem => ({ name: testCase.reasonText, quantity: 1, unitPrice: 0 })

const ofType = (set: TestSet, type: number): readonly TestCase[] =>
  set.cases.filter((item) => item.documentType === type)

const basicPlan = (set: TestSet, kind: 'basic' | 'exempt'): BasicSetPlan | ExemptSetPlan => {
  const exempt = kind === 'exempt'
  const invoiceType = exempt ? 34 : 33
  const invoices = ofType(set, invoiceType).map(
    (testCase): PlannedInvoice =>
      compact({
        caseId: testCase.id,
        items: testCase.items.map((item) => (exempt ? exemptItem(item, true) : invoiceItem(item))),
        globalDiscountPercent: exempt ? undefined : (testCase.globalDiscountPercent ?? undefined),
      }),
  )
  const noteOf = (testCase: TestCase, cancelTakesItems: boolean): PlannedNote => {
    const items = exempt
      ? testCase.items.map((item) => exemptItem(item, false))
      : testCase.items.length > 0
        ? testCase.items.map(plainItem)
        : [reasonLine(testCase)]
    const cancels = cancelTakesItems && testCase.reasonText.toUpperCase().includes('ANULA')
    return note(testCase, items, cancels ? testCase.referencedCase : null)
  }
  const creditNotes = ofType(set, 61).map((testCase) => noteOf(testCase, !exempt))
  const debitNotes = ofType(set, 56).map((testCase) => noteOf(testCase, false))
  return {
    kind,
    attentionNumber: set.attentionNumber,
    invoices,
    creditNotes,
    debitNotes,
    folios: { [invoiceType]: invoices.length, 61: creditNotes.length, 56: debitNotes.length },
  }
}

const guidePlan = (set: TestSet): GuideSetPlan => {
  const guides = ofType(set, 52).map(
    (testCase): PlannedGuide =>
      compact({
        caseId: testCase.id,
        transferReason: transferReasonOf(testCase.motive),
        dispatchType: dispatchTypeOf(testCase.transferBy) ?? undefined,
        items: testCase.items.map(plainItem),
      }),
  )
  return { kind: 'guide', attentionNumber: set.attentionNumber, guides, folios: { 52: guides.length } }
}

const last = <T>(items: readonly T[]): T | undefined => items[items.length - 1]

const purchasePlan = (set: TestSet): PurchaseSetPlan | undefined => {
  const invoiceCase = last(ofType(set, 46))
  if (invoiceCase === undefined) return undefined
  const creditCase = last(ofType(set, 61))
  const debitCase = last(ofType(set, 56))
  const creditNote = creditCase === undefined ? null : note(creditCase, creditCase.items.map(plainItem), null)
  const debitNote =
    debitCase === undefined
      ? null
      : note(debitCase, debitCase.items.length > 0 ? debitCase.items.map(plainItem) : (creditNote?.items ?? []), null)
  return {
    kind: 'purchase',
    attentionNumber: set.attentionNumber,
    invoice: { caseId: invoiceCase.id, items: invoiceCase.items.map(plainItem) },
    creditNote,
    debitNote,
    folios: { 46: 1, 61: creditNote === null ? 0 : 1, 56: debitNote === null ? 0 : 1 },
  }
}

const bookPlan = (set: TestSet, kind: PurchaseBookPlan['kind']): PurchaseBookPlan => ({
  kind,
  attentionNumber: set.attentionNumber,
  documents: set.bookDocuments,
  proportionalityFactor: set.proportionalityFactor ?? DEFAULT_PROPORTIONALITY_FACTOR,
})

/**
 * EN: The cases each set issues, with the folios every document type needs, from the parsed sets. For each kind the
 * last set of the text wins. Export and settlement sets, the sales-book and guide-book instructions and unknown sets
 * are left out: the first two are never issued, the books come from the issued sets.
 * ES: Los casos que emite cada set, con los folios que necesita cada tipo de documento, a partir de los sets parseados.
 * Por cada tipo gana el último set del texto. Los sets de exportación y liquidación, las instrucciones de libro de
 * ventas y de guías y los sets desconocidos quedan fuera: los dos primeros nunca se emiten, los libros salen de los
 * sets emitidos.
 * @param sets EN: the parsed sets. ES: los sets parseados.
 */
export const planCertificationSets = (sets: readonly TestSet[]): CertificationPlan => {
  const plan: {
    -readonly [K in keyof CertificationPlan]: CertificationPlan[K]
  } = {}
  for (const set of sets) {
    if (set.kind === 'basic') plan.basic = basicPlan(set, 'basic') as BasicSetPlan
    else if (set.kind === 'exempt') plan.exempt = basicPlan(set, 'exempt') as ExemptSetPlan
    else if (set.kind === 'guide') plan.guide = guidePlan(set)
    else if (set.kind === 'purchase') plan.purchase = purchasePlan(set) ?? plan.purchase
    else if (set.kind === 'purchaseBook') plan.purchaseBook = bookPlan(set, 'purchaseBook')
    else if (set.kind === 'exemptPurchaseBook') plan.exemptPurchaseBook = bookPlan(set, 'exemptPurchaseBook')
  }
  return plan
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/certification/set-plan --coverage=false
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/certification/set-plan.ts tests/certification/set-plan.test.ts
```

```bash
git commit -F - <<'MSG'
feat: plan the certification sets

planCertificationSets turns the parsed sets into what each set issues: invoices, notes and
guides with their items, reference codes and reasons, the folios each document type needs,
and the purchase-book documents with their factor.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 3: A folio source over one or several CAFs

`FolioSource` and `createFolioAllocator` (spec 3.4): one counter per CAF, the first CAF of the type with a folio left, the CAF whose range holds the folio, `FOLIO_OUT_OF_RANGE` when the type is exhausted, `usedFolios` to resume.

**Files:**

- Create: `src/certification/folios.ts`
- Test (create): `tests/certification/folios.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/certification/folios.test.ts` (new file, whole):

```ts
import { parseCaf } from '../../src/caf/parse'
import { createFolioAllocator } from '../../src/certification/folios'
import { fixtureText } from '../support/fixtures'
import { failure } from '../support/portal'

const caf33 = parseCaf(fixtureText('caf-33.xml')) // folios 1 to 100
const caf33Next = parseCaf(fixtureText('caf-33.xml').replace('<D>1</D><H>100</H>', '<D>101</D><H>200</H>'))
const caf33Small = parseCaf(fixtureText('caf-33.xml').replace('<D>1</D><H>100</H>', '<D>1</D><H>2</H>'))
const caf39 = parseCaf(fixtureText('caf-39.xml'))

test('hands out consecutive folios of the first CAF of the type, with that CAF', async () => {
  const folios = createFolioAllocator([caf39, caf33, caf33Next])
  await expect(folios.take(33)).resolves.toEqual({ caf: caf33, folio: 1 })
  await expect(folios.take(33)).resolves.toEqual({ caf: caf33, folio: 2 })
  await expect(folios.take(39)).resolves.toEqual({ caf: caf39, folio: 1 })
})

test('moves to the next CAF when one is exhausted, and throws when every CAF of the type is', async () => {
  const folios = createFolioAllocator([caf33Small, caf33Next])
  await expect(folios.take(33)).resolves.toMatchObject({ folio: 1 })
  await expect(folios.take(33)).resolves.toMatchObject({ folio: 2 })
  await expect(folios.take(33)).resolves.toEqual({ caf: caf33Next, folio: 101 })
  const only = createFolioAllocator([caf33Small])
  await only.take(33)
  await only.take(33)
  const error = await failure(only.take(33))
  expect(error.code).toBe('FOLIO_OUT_OF_RANGE')
  expect(error.details).toEqual({ type: 33 })
})

test('a type with no CAF throws at once, and a CAF of another type is never used', async () => {
  const folios = createFolioAllocator([caf33])
  expect((await failure(folios.take(39))).code).toBe('FOLIO_OUT_OF_RANGE')
  expect((await failure(folios.take(61))).details).toEqual({ type: 61 })
})

test('used folios push the counter past the highest one inside the range, and others are ignored', async () => {
  const folios = createFolioAllocator([caf33, caf33Next], {
    usedFolios: [
      { type: 33, folio: 7 },
      { type: 33, folio: 3 },
      { type: 33, folio: 150 },
      { type: 33, folio: 999 },
      { type: 39, folio: 50 },
    ],
  })
  await expect(folios.take(33)).resolves.toEqual({ caf: caf33, folio: 8 })
  const exhausted = createFolioAllocator([caf33Small], { usedFolios: [{ type: 33, folio: 2 }] })
  expect((await failure(exhausted.take(33))).code).toBe('FOLIO_OUT_OF_RANGE')
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/certification/folios --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/certification/folios'`.

- [ ] **Step 3: Write the implementation**

`src/certification/folios.ts` (new file, whole):

```ts
import type { Caf } from '../caf/parse'
import type { DocumentType } from '../catalogs/document-types'
import { DteError } from '../errors'

/**
 * EN: Where the next folio of a type comes from, with the CAF that stamps it. The in-memory allocator below is one
 * implementation; the runner may implement it with the folio registry.
 * ES: De dónde sale el siguiente folio de un tipo, con el CAF que lo timbra. El asignador en memoria de abajo es una
 * implementación; el runner puede implementarlo con el registro de folios.
 */
export type FolioSource = {
  /** EN: The next free folio of the type and its CAF. ES: El siguiente folio libre del tipo y su CAF. */
  readonly take: (type: DocumentType) => Promise<{ readonly caf: Caf; readonly folio: number }>
}

/**
 * EN: Options of `createFolioAllocator`.
 * ES: Opciones de `createFolioAllocator`.
 */
export type FolioAllocatorOptions = {
  /** EN: Folios already used; the allocator starts after the highest used one of each CAF. ES: Folios ya usados; el asignador parte después del mayor usado de cada CAF. */
  readonly usedFolios?: readonly { readonly type: number; readonly folio: number }[]
}

/**
 * EN: A folio source over one or several CAFs: one counter per CAF, the first CAF of the type with a folio left wins,
 * a folio is never given twice, and the CAF returned is the one whose range holds the folio, so it stamps with its own
 * key. When every CAF of the type is exhausted it throws `FOLIO_OUT_OF_RANGE`.
 * ES: Una fuente de folios sobre uno o varios CAF: un contador por CAF, gana el primer CAF del tipo con folio libre, un
 * folio nunca se entrega dos veces, y el CAF devuelto es el que contiene el folio en su rango, así timbra con su propia
 * llave. Cuando todos los CAF del tipo se agotan lanza `FOLIO_OUT_OF_RANGE`.
 * @param cafs EN: the CAFs, in the order to use them. ES: los CAF, en el orden en que se usan.
 * @param options EN: folios already used. ES: folios ya usados.
 * @throws {DteError} EN: `FOLIO_OUT_OF_RANGE` with `{ type }` from `take`. ES: `FOLIO_OUT_OF_RANGE` con `{ type }` desde `take`.
 */
export const createFolioAllocator = (cafs: readonly Caf[], options: FolioAllocatorOptions = {}): FolioSource => {
  const next = cafs.map((caf) => {
    const used = (options.usedFolios ?? [])
      .filter(
        (entry) => entry.type === caf.documentType && entry.folio >= caf.range.from && entry.folio <= caf.range.to,
      )
      .map((entry) => entry.folio)
    return used.length === 0 ? caf.range.from : Math.max(...used) + 1
  })
  return {
    take: async (type) => {
      for (const [index, caf] of cafs.entries()) {
        if (caf.documentType !== type || next[index] > caf.range.to) continue
        const folio = next[index]
        next[index] = folio + 1
        return { caf, folio }
      }
      throw new DteError('FOLIO_OUT_OF_RANGE', { type })
    },
  }
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/certification/folios --coverage=false
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/certification/folios.ts tests/certification/folios.test.ts
```

```bash
git commit -F - <<'MSG'
feat: a folio source over one or several CAFs

FolioSource is the port the sets take folios from. createFolioAllocator keeps one counter per
CAF, hands out the next free folio with the CAF whose range holds it, so each folio is stamped
with its own key, and throws FOLIO_OUT_OF_RANGE when every CAF of a type is exhausted.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 4: Issuing the four certification sets

`issueTestSet` (spec 3.5): the basic, exempt, guide and purchase sets through phase 1, invoices or guides first, then credit notes, then debit notes, each with the SET reference and the field rules for notes, purchase documents and internal transfers, and one signed envelope per set. Phase 1 gains `withholdVat` on `DocumentInput` (D63 widening), so the notes of a purchase invoice withhold the VAT as the field does. The test support issues the sets with the fixture certificate and CAFs, the type-33 range split in two CAFs.

**Files:**

- Create: `src/certification/issue-set.ts`
- Modify: `src/model/document.ts`
- Modify: `src/document/create.ts`
- Test (create): `tests/support/certification-fixtures.ts`
- Test (create): `tests/certification/issue-set.test.ts`
- Test (modify): `tests/create-document.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/support/certification-fixtures.ts` (new file, whole):

```ts
import { parseCaf, type Caf } from '../../src/caf/parse'
import { loadCertificateFromPem } from '../../src/certificate/pem'
import { createFolioAllocator } from '../../src/certification/folios'
import type { IssueSetOptions } from '../../src/certification/issue-set'
import { planCertificationSets } from '../../src/certification/set-plan'
import { parseTestSetText } from '../../src/certification/set-text'
import { FIXED_NOW, ISSUER_RUT, RECEIVER_RUT, fixtureText } from './fixtures'
import { FULL_SET_TEXT } from './test-set-samples'

/** The fixture certificate and CAFs, one per document type the sets use, with the type-33 range split in two. */
export const certificate = loadCertificateFromPem(
  { privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') },
  { now: FIXED_NOW },
)

const caf33Text = fixtureText('caf-33.xml')
export const cafFor = (type: number, range?: { from: number; to: number }): Caf =>
  parseCaf(
    caf33Text
      .replace(/<TD>33<\/TD>/, `<TD>${type}</TD>`)
      .replace('<D>1</D><H>100</H>', range ? `<D>${range.from}</D><H>${range.to}</H>` : '<D>1</D><H>100</H>'),
  )

/** Type 33 split in two CAFs (1 to 2, then 101 to 200) so a set proves the allocator walks CAFs. */
export const certificationCafs = (): readonly Caf[] => [
  cafFor(33, { from: 1, to: 2 }),
  cafFor(33, { from: 101, to: 200 }),
  cafFor(61),
  cafFor(56),
  cafFor(34),
  cafFor(52),
  cafFor(46),
]

export const issuer = {
  rut: ISSUER_RUT,
  businessName: 'Comercial Andina SpA',
  businessActivity: 'Desarrollo de software',
  activityCode: 620200,
  address: 'Av. Los Aromos 1540',
  commune: 'Ñuñoa',
}
export const receiver = {
  rut: RECEIVER_RUT,
  businessName: 'Comercializadora Rapel Ltda',
  businessActivity: 'Comercio al por menor',
  address: 'Pasaje Los Olmos 88',
  commune: 'Providencia',
}
export const resolution = { number: 0, date: '2026-01-01' }

export const issueOptions = (cafs: readonly Caf[] = certificationCafs()): IssueSetOptions => ({
  issuer,
  receiver,
  certificate,
  folios: createFolioAllocator(cafs),
  resolution,
  now: () => FIXED_NOW,
})

export const fullPlan = () => planCertificationSets(parseTestSetText(FULL_SET_TEXT))
```

`tests/certification/issue-set.test.ts` (new file, whole):

```ts
import { createFolioAllocator } from '../../src/certification/folios'
import { issueTestSet, issuerAsReceiver, type IssuedSet } from '../../src/certification/issue-set'
import type { BasicSetPlan } from '../../src/certification/set-plan'
import { verifyDocumentSignature } from '../../src/document/sign'
import { verifyEnvelopeSignature } from '../../src/envelope/sign'
import { verifyTed } from '../../src/ted/build'
import { chileDate } from '../../src/time/chile'
import { ATTENTION } from '../support/test-set-samples'
import type { DocumentType } from '../../src/catalogs/document-types'
import { cafFor, certificationCafs, fullPlan, issueOptions, issuer } from '../support/certification-fixtures'
import { ISSUER_RUT, RECEIVER_RUT } from '../support/fixtures'
import { failure } from '../support/portal'

const id = (n: number) => `${ATTENTION}-${n}`
const DATE = '2026-11-15'
const plan = fullPlan()
const byCase = (set: IssuedSet, n: number) => set.cases.find((issued) => issued.caseId === id(n))!

describe('the basic set', () => {
  let set: IssuedSet
  beforeAll(async () => {
    set = await issueTestSet(plan.basic!, issueOptions())
  })

  test('issues invoices, then credit notes, then debit notes, walking the CAFs of type 33', () => {
    expect(set.kind).toBe('basic')
    expect(set.attentionNumber).toBe(ATTENTION)
    expect(set.cases.map((issued) => [issued.caseId, issued.type, issued.folio])).toEqual([
      [id(1), 33, 1],
      [id(2), 33, 2],
      [id(3), 33, 101],
      [id(4), 61, 1],
      [id(5), 61, 2],
      [id(6), 61, 3],
      [id(7), 56, 1],
      [id(8), 56, 2],
    ])
    expect(set.cases.every((issued) => issued.document.header.folio === issued.folio)).toBe(true)
  })

  test('every document carries the SET reference first, the issue date and the receiver', () => {
    for (const issued of set.cases) {
      expect(issued.document.references[0]).toMatchObject({
        documentType: 'SET',
        folio: '1',
        date: DATE,
        reason: `CASO ${issued.caseId}`,
      })
      expect(issued.document.references[0].code).toBeUndefined()
      expect(issued.document.header.issueDate).toBe(DATE)
      expect(issued.document.header.receiver.rut).toBe(RECEIVER_RUT)
      expect(issued.document.header.issuer.rut).toBe(ISSUER_RUT)
    }
  })

  test('invoices carry TpoTranVenta 1, line discounts, exempt lines and the global discount', () => {
    const first = byCase(set, 1).document
    expect(first.header.options.saleTransactionType).toBe(1)
    expect(first.items.map((item) => [item.name, item.quantity, item.unitPrice, item.amount])).toEqual([
      ['Cajon de manzanas', 130, 2800, 364000],
      ['Relleno de pollo', 90, 1700, 153000],
    ])
    expect(first.header.totals).toMatchObject({ netAmount: 517000, vatRate: 19, vatAmount: 98230, totalAmount: 615230 })
    expect(first.globalAdjustments).toEqual([])

    const second = byCase(set, 2).document
    expect(second.items[0]).toMatchObject({
      name: 'Pintura blanca',
      quantity: 40,
      unitPrice: 5000,
      discountPercent: 14,
      discountAmount: 28000,
      amount: 172000,
    })
    expect(second.items[1]).toMatchObject({ name: 'Servicio exento de instalacion', exemptIndicator: 1, amount: 20000 })
    expect(second.globalAdjustments).toEqual([
      {
        lineNumber: 1,
        kind: 'discount',
        valueType: 'percent',
        value: 7,
        description: 'DESCUENTO GLOBAL ITEMES AFECTOS',
      },
    ])
    expect(second.header.totals).toMatchObject({
      netAmount: 159960,
      exemptAmount: 20000,
      vatAmount: 30392,
      totalAmount: 210352,
    })

    const third = byCase(set, 3).document
    expect(third.items[0]).toMatchObject({ name: 'Cemento', quantity: 10, unitPrice: 8000, amount: 80000 })
    expect(third.items[0].unit).toBeUndefined()
  })

  test('a credit note for returned goods takes the original price, and references the invoice with code 3', () => {
    const note = byCase(set, 4).document
    expect(note.items).toEqual([
      expect.objectContaining({ name: 'Cajon de manzanas', quantity: 62, unitPrice: 2800, amount: 173600 }),
    ])
    expect(note.header.totals).toMatchObject({ netAmount: 173600, vatAmount: 32984, totalAmount: 206584 })
    expect(note.references[1]).toMatchObject({
      documentType: 33,
      folio: '1',
      date: DATE,
      code: 3,
      reason: 'DEVOLUCION DE MERCADERIAS',
    })
    expect(note.header.options.saleTransactionType).toBeUndefined()
    expect(note.globalAdjustments).toEqual([])
  })

  test('a credit note that corrects text has one line named after the reason and total 0', () => {
    const note = byCase(set, 5).document
    expect(note.items.map((item) => [item.name, item.quantity, item.unitPrice, item.amount])).toEqual([
      ['CORRIGE GIRO DEL RECEPTOR', undefined, undefined, 0],
    ])
    expect(note.header.totals).toEqual({ vatRate: 19, totalAmount: 0 })
    expect(note.references[1]).toMatchObject({
      documentType: 33,
      folio: '2',
      code: 2,
      reason: 'CORRIGE GIRO DEL RECEPTOR',
    })
  })

  test('a credit note that cancels takes the items of the cancelled invoice', () => {
    const note = byCase(set, 6).document
    expect(note.items).toEqual([
      expect.objectContaining({ name: 'Cemento', quantity: 10, unitPrice: 8000, amount: 80000 }),
    ])
    expect(note.references[1]).toMatchObject({
      documentType: 33,
      folio: '101',
      code: 1,
      reason: 'ANULA FACTURA ELECTRONICA',
    })
  })

  test('a debit note that cancels a credit note references it with a zero line; one that changes the price carries it', () => {
    const cancel = byCase(set, 7).document
    expect(cancel.items.map((item) => [item.name, item.amount])).toEqual([['ANULA NOTA DE CREDITO ELECTRONICA', 0]])
    expect(cancel.references[1]).toMatchObject({
      documentType: 61,
      folio: '3',
      code: 1,
      reason: 'ANULA NOTA DE CREDITO ELECTRONICA',
    })
    const price = byCase(set, 8).document
    expect(price.items).toEqual([
      expect.objectContaining({ name: 'Cajon de manzanas', quantity: 1, unitPrice: 3100, amount: 3100 }),
    ])
    expect(price.references[1]).toMatchObject({ documentType: 33, folio: '1', code: 3, reason: 'MODIFICA MONTO' })
  })

  test('the envelope names the SII, carries DTE_SetDoc and every signature verifies', () => {
    expect(set.envelope.cover).toMatchObject({
      issuerRut: ISSUER_RUT,
      senderRut: ISSUER_RUT,
      receiverRut: '60803000-K',
      resolutionNumber: 0,
    })
    expect(set.envelope.setId).toBe('DTE_SetDoc')
    expect(set.envelope.documents).toHaveLength(8)
    expect(verifyEnvelopeSignature(set.envelope.xml).valid).toBe(true)
    for (const issued of set.cases) {
      expect(verifyDocumentSignature(issued.document.xml).valid).toBe(true)
      expect(verifyTed(issued.document.ted.xml, cafFor(issued.type))).toBe(true)
    }
  })
})

describe('the exempt set', () => {
  let set: IssuedSet
  beforeAll(async () => {
    set = await issueTestSet(plan.exempt!, issueOptions())
  })

  test('the invoice has every line exempt with its unit, exempt totals and no TpoTranVenta', () => {
    const invoice = byCase(set, 9).document
    expect(invoice.header.type).toBe(34)
    expect(
      invoice.items.map((item) => [item.name, item.quantity, item.unit, item.unitPrice, item.exemptIndicator]),
    ).toEqual([
      ['Arriendo de oficina', 1, 'UN', 450000, 1],
      ['Asesoria tributaria', 2, 'UN', 80000, 1],
    ])
    expect(invoice.header.totals).toEqual({ exemptAmount: 610000, totalAmount: 610000 })
    expect(invoice.header.options.saleTransactionType).toBeUndefined()
  })

  test('notes without items take the referenced document items; a price change keeps the original quantity', () => {
    const returned = byCase(set, 10).document
    expect(returned.items.map((item) => [item.name, item.quantity, item.unitPrice, item.exemptIndicator])).toEqual([
      ['Arriendo de oficina', 1, 450000, 1],
      ['Asesoria tributaria', 2, 80000, 1],
    ])
    const cancel = byCase(set, 11).document
    expect(cancel.header.type).toBe(56)
    expect(cancel.items.map((item) => item.name)).toEqual(['Arriendo de oficina', 'Asesoria tributaria'])
    expect(cancel.references[1]).toMatchObject({ documentType: 61, code: 1, reason: 'ANULA NOTA DE CREDITO' })
    const newPrice = byCase(set, 12).document
    expect(newPrice.items).toEqual([
      expect.objectContaining({
        name: 'Asesoria tributaria',
        quantity: 2,
        unit: 'UN',
        unitPrice: 75000,
        exemptIndicator: 1,
        amount: 150000,
      }),
    ])
    expect(newPrice.header.totals).toEqual({ exemptAmount: 150000, totalAmount: 150000 })
  })
})

describe('the guide set', () => {
  let set: IssuedSet
  beforeAll(async () => {
    set = await issueTestSet(plan.guide!, issueOptions())
  })

  test('a sale carries the transfer reason, the dispatch type, the customer and its totals', () => {
    const sale = byCase(set, 13).document
    expect(sale.header.type).toBe(52)
    expect(sale.header.options).toMatchObject({ transferType: 1, dispatchType: 2 })
    expect(sale.header.receiver.rut).toBe(RECEIVER_RUT)
    expect(sale.items[0]).toMatchObject({
      name: 'Cajon de manzanas',
      quantity: 25,
      unit: 'UN',
      unitPrice: 2800,
      amount: 70000,
    })
    expect(sale.header.totals).toMatchObject({ netAmount: 70000, vatAmount: 13300, totalAmount: 83300 })
    expect(sale.references).toHaveLength(1)
    expect(byCase(set, 15).document.header.options.dispatchType).toBeUndefined()
  })

  test('an internal transfer names the issuer as receiver, keeps the quantity and totals 0', () => {
    const internal = byCase(set, 14).document
    expect(internal.header.options).toMatchObject({ transferType: 5, dispatchType: 1 })
    expect(internal.header.receiver).toMatchObject({
      rut: ISSUER_RUT,
      businessName: issuer.businessName,
      city: 'Ñuñoa',
    })
    expect(internal.items[0]).toMatchObject({ name: 'Relleno de pollo', quantity: 40, unit: 'UN', amount: 0 })
    expect(internal.items[0].unitPrice).toBeUndefined()
    expect(internal.header.totals).toEqual({ vatRate: 19, totalAmount: 0 })
  })

  test('an internal transfer with priced lines still totals 0, as the field does', async () => {
    const priced = await issueTestSet(
      {
        ...plan.guide!,
        guides: [{ ...plan.guide!.guides[1], items: [{ name: 'Relleno', quantity: 2, unitPrice: 500 }] }],
      },
      issueOptions(),
    )
    expect(priced.cases[0].document.items[0].amount).toBe(1000)
    expect(priced.cases[0].document.header.totals).toEqual({ vatRate: 19, totalAmount: 0 })
  })
})

describe('the purchase set', () => {
  let set: IssuedSet
  beforeAll(async () => {
    set = await issueTestSet(plan.purchase!, issueOptions())
  })

  test('the invoice names the issuer as receiver, prices every line with tax code 15 and withholds the VAT', () => {
    const invoice = byCase(set, 16).document
    expect(invoice.header.type).toBe(46)
    expect(invoice.header.receiver).toMatchObject(issuerAsReceiver(issuer))
    expect(invoice.items[0]).toMatchObject({
      name: 'Chatarra de fierro',
      quantity: 300,
      unit: 'UN',
      unitPrice: 1200,
      additionalTaxCodes: [15],
      amount: 360000,
    })
    expect(invoice.header.totals).toEqual({
      netAmount: 360000,
      vatRate: 19,
      vatAmount: 68400,
      withholdings: [{ taxCode: 15, rate: 19, amount: 68400 }],
      totalAmount: 360000,
    })
  })

  test('the notes take the original price by name and reference the invoice and then the credit note', () => {
    const credit = byCase(set, 17).document
    expect(credit.items[0]).toMatchObject({
      name: 'Chatarra de fierro',
      quantity: 100,
      unitPrice: 1200,
      additionalTaxCodes: [15],
      amount: 120000,
    })
    expect(credit.header.totals).toMatchObject({
      netAmount: 120000,
      withholdings: [{ taxCode: 15, rate: 19, amount: 22800 }],
      totalAmount: 120000,
    })
    expect(credit.references[1]).toMatchObject({ documentType: 46, folio: '1', code: 3 })
    const debit = byCase(set, 18).document
    expect(debit.items[0]).toMatchObject({ name: 'Chatarra de fierro', quantity: 100, unitPrice: 1200 })
    expect(debit.references[1]).toMatchObject({
      documentType: 61,
      folio: '1',
      code: 1,
      reason: 'ANULA NOTA DE CREDITO',
    })
    expect(debit.header.receiver.rut).toBe(ISSUER_RUT)
  })

  test('a debit note without items takes the referenced document items, and an unknown name gets price 0', async () => {
    const own = await issueTestSet(
      {
        ...plan.purchase!,
        creditNote: { ...plan.purchase!.creditNote!, items: [{ name: 'Otra cosa', quantity: 2, unitPrice: 0 }] },
        debitNote: { ...plan.purchase!.debitNote!, items: [] },
      },
      issueOptions(),
    )
    expect(own.cases[1].document.items[0]).toMatchObject({ name: 'Otra cosa', quantity: 2, unitPrice: 0, amount: 0 })
    expect(own.cases[2].document.items[0]).toMatchObject({ name: 'Otra cosa', quantity: 2 })
  })
})

describe('errors and defaults', () => {
  const basic = plan.basic!

  test('a note whose case was not issued before it is MISSING_FIELD', async () => {
    const orphan: BasicSetPlan = {
      ...basic,
      creditNotes: [{ ...basic.creditNotes[0], referencedCase: `${ATTENTION}-99` }],
      debitNotes: [],
    }
    const error = await failure(issueTestSet(orphan, issueOptions()))
    expect(error.code).toBe('MISSING_FIELD')
    expect(error.details).toEqual({ field: 'referencedCase', caseId: id(4) })
    const noReference: BasicSetPlan = {
      ...basic,
      creditNotes: [],
      debitNotes: [{ ...basic.debitNotes[0], referencedCase: null }],
    }
    expect((await failure(issueTestSet(noReference, issueOptions()))).details).toEqual({
      field: 'referencedCase',
      caseId: id(7),
    })
  })

  test('a plan without invoices or without guides is MISSING_FIELD', async () => {
    expect((await failure(issueTestSet({ ...basic, invoices: [] }, issueOptions()))).details).toEqual({
      field: 'invoices',
      kind: 'basic',
    })
    expect((await failure(issueTestSet({ ...plan.guide!, guides: [] }, issueOptions()))).details).toEqual({
      field: 'guides',
      kind: 'guide',
    })
  })

  test('an exhausted folio source stops the set', async () => {
    const few = issueOptions([cafFor(33, { from: 1, to: 1 }), cafFor(61), cafFor(56)])
    expect((await failure(issueTestSet(basic, few))).code).toBe('FOLIO_OUT_OF_RANGE')
  })

  test('without a clock the issue date is today in Chile, and a certificate without RUT sends as the issuer', async () => {
    const options = { ...issueOptions(), now: undefined, certificate: { ...issueOptions().certificate, rut: null } }
    const set = await issueTestSet(basic, options)
    expect(set.cases[0].document.header.issueDate).toBe(chileDate(new Date()))
    expect(set.envelope.cover.senderRut).toBe(ISSUER_RUT)
  })

  test('basic notes that need no fill-in keep their items; items with a price are never overwritten', async () => {
    const priced: BasicSetPlan = {
      ...basic,
      creditNotes: [
        {
          ...basic.creditNotes[0],
          items: [
            { name: 'Cajon de manzanas', quantity: 3, unitPrice: 99 },
            { name: 'Nada', quantity: 1, unitPrice: 0 },
          ],
        },
      ],
      debitNotes: [{ ...basic.debitNotes[1], items: [] }],
    }
    const set = await issueTestSet(priced, issueOptions())
    const note = set.cases[3].document
    expect(note.items.map((item) => [item.name, item.unitPrice])).toEqual([
      ['Cajon de manzanas', 99],
      ['Nada', undefined],
    ])
    expect(set.cases[4].document.items.map((item) => item.name)).toEqual(['SIN MONTO'])
  })

  test('exempt notes: a code 2 note gets the reason line, a MODIFICA MONTO with unknown names keeps its items, and a code 3 without wording takes its own items', async () => {
    const exempt = plan.exempt!
    const variants = {
      ...exempt,
      creditNotes: [
        { ...exempt.creditNotes[0], referenceCode: 2 as const, reasonText: 'CORRIGE GIRO', items: [] },
        { ...exempt.creditNotes[1], items: [{ name: 'Desconocido', quantity: 1, unitPrice: 5, exempt: true }] },
        {
          ...exempt.creditNotes[0],
          caseId: 'x-1',
          referenceCode: 3 as const,
          reasonText: 'CORRIGE MONTO',
          items: [{ name: 'Propio', quantity: 1, unitPrice: 7 }],
        },
        { ...exempt.creditNotes[0], caseId: 'x-2', referenceCode: 3 as const, reasonText: 'CORRIGE MONTO', items: [] },
        {
          ...exempt.creditNotes[0],
          caseId: 'x-3',
          referenceCode: 1 as const,
          reasonText: 'ANULA',
          items: [{ name: 'Ignorado', quantity: 1, unitPrice: 1 }],
        },
      ],
      debitNotes: [
        {
          ...exempt.debitNotes[0],
          referencedCase: id(9),
          items: [{ name: 'Asesoria tributaria', quantity: 1, unitPrice: 70000 }],
          referenceCode: 3 as const,
          reasonText: 'MODIFICA MONTO',
        },
        {
          ...exempt.debitNotes[0],
          caseId: 'y-1',
          items: [{ name: 'Libre', quantity: 1, unitPrice: 3 }],
          referenceCode: 1 as const,
        },
        { ...exempt.debitNotes[0], caseId: 'y-2', items: [], referencedCase: 'x-1' },
      ],
    }
    const set = await issueTestSet(variants, issueOptions())
    const names = (index: number) =>
      set.cases[index].document.items.map((item) => [item.name, item.quantity, item.unitPrice])
    expect(names(1)).toEqual([['CORRIGE GIRO', undefined, undefined]])
    expect(names(2)).toEqual([['Desconocido', 1, 5]])
    expect(names(3)).toEqual([['Propio', 1, 7]])
    expect(names(4)).toEqual([
      ['Arriendo de oficina', 1, 450000],
      ['Asesoria tributaria', 2, 80000],
    ])
    expect(names(5)).toEqual([
      ['Arriendo de oficina', 1, 450000],
      ['Asesoria tributaria', 2, 80000],
    ])
    expect(names(6)).toEqual([['Asesoria tributaria', 2, 70000]])
    expect(names(7)).toEqual([['Libre', 1, 3]])
    expect(names(8)).toEqual([['Propio', 1, 7]])
    const noItemsAnywhere = {
      ...variants,
      creditNotes: [{ ...exempt.creditNotes[0], caseId: 'z-1', referenceCode: 2 as const, reasonText: '', items: [] }],
      debitNotes: [{ ...exempt.debitNotes[0], referencedCase: 'z-1', items: [] }],
    }
    const empty = await issueTestSet(noItemsAnywhere, issueOptions())
    expect(empty.cases[1].document.items.map((item) => item.name)).toEqual(['CORRECCION'])
    expect(empty.cases[2].document.items.map((item) => item.name)).toEqual(['CORRECCION'])
  })

  test('a purchase set with the invoice alone, and an exempt purchase line without tax code', async () => {
    const purchase = plan.purchase!
    const alone = await issueTestSet(
      {
        ...purchase,
        creditNote: null,
        debitNote: null,
        invoice: {
          ...purchase.invoice,
          items: [...purchase.invoice.items, { name: 'Flete exento', quantity: 1, unitPrice: 500, exempt: true }],
        },
      },
      issueOptions(),
    )
    expect(alone.cases).toHaveLength(1)
    const exemptLine = alone.cases[0].document.items[1]
    expect(exemptLine).toMatchObject({ name: 'Flete exento', exemptIndicator: 1, unitPrice: 500 })
    expect(exemptLine.additionalTaxCodes).toBeUndefined()
    expect(alone.cases[0].document.header.totals).toMatchObject({
      netAmount: 360000,
      exemptAmount: 500,
      totalAmount: 360500,
    })
  })

  test('a basic credit note with no items at all gets the SIN MONTO line, and an issuer with a city keeps it as receiver', async () => {
    const basic = plan.basic!
    const options = { ...issueOptions(), issuer: { ...issuer, city: 'Santiago' } }
    const set = await issueTestSet(
      { ...basic, creditNotes: [{ ...basic.creditNotes[0], items: [] }], debitNotes: [] },
      options,
    )
    expect(set.cases[3].document.items.map((item) => item.name)).toEqual(['SIN MONTO'])
    expect(issuerAsReceiver(options.issuer).city).toBe('Santiago')
  })

  test('exempt returns with the accented wording, and a price change on a note whose items have no unit', async () => {
    const exempt = plan.exempt!
    const set = await issueTestSet(
      {
        ...exempt,
        creditNotes: [
          { ...exempt.creditNotes[0], reasonText: 'DEVOLUCIÓN DE MERCADERÍAS' },
          {
            ...exempt.creditNotes[0],
            caseId: 'x-1',
            referenceCode: 3 as const,
            reasonText: 'CORRIGE MONTO',
            items: [{ name: 'Propio', quantity: 3, unitPrice: 7 }],
          },
        ],
        debitNotes: [
          {
            ...exempt.debitNotes[0],
            referencedCase: 'x-1',
            referenceCode: 3 as const,
            reasonText: 'MODIFICA MONTO',
            items: [{ name: 'propio', quantity: 1, unitPrice: 9 }],
          },
        ],
      },
      issueOptions(),
    )
    expect(set.cases[1].document.items.map((item) => item.name)).toEqual(['Arriendo de oficina', 'Asesoria tributaria'])
    expect(set.cases[3].document.items[0]).toMatchObject({
      name: 'propio',
      quantity: 3,
      unit: 'UN',
      unitPrice: 9,
      exemptIndicator: 1,
    })
  })

  test('a folio source of the caller is used as given', async () => {
    const taken: number[] = []
    const source = createFolioAllocator(certificationCafs())
    const options = {
      ...issueOptions(),
      folios: {
        take: async (type: DocumentType) => {
          const next = await source.take(type)
          taken.push(next.folio)
          return next
        },
      },
    }
    await issueTestSet(plan.guide!, options)
    expect(taken).toEqual([1, 2, 3])
  })
})
```

`tests/create-document.test.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/create-document.test.ts b/tests/create-document.test.ts
index 7dfcf7f..a9ebbbc 100644
--- a/tests/create-document.test.ts
+++ b/tests/create-document.test.ts
@@ -291,3 +291,41 @@ describe('createDocument', () => {
     expect(FIELD_LIMITS.DscItem).toBe(1000)
   })
 })
+
+test('withholdVat withholds the whole VAT on a note that affects a purchase invoice', () => {
+  const base = {
+    folio: 1,
+    issueDate: '2026-11-15',
+    issuer: {
+      rut: '76543210-3',
+      businessName: 'Comercial Andina SpA',
+      businessActivity: 'Software',
+      address: 'Av. 1',
+      commune: 'Santiago',
+    },
+    receiver: {
+      rut: '76543210-3',
+      businessName: 'Comercial Andina SpA',
+      businessActivity: 'Software',
+      address: 'Av. 1',
+      commune: 'Santiago',
+    },
+    items: [{ name: 'Chatarra', quantity: 10, unitPrice: 1000, additionalTaxCodes: [15] }],
+    references: [{ documentType: 46, folio: 7, date: '2026-11-15', code: 3 as const, reason: 'DEVOLUCION' }],
+  }
+  const withheld = createDocument({ ...base, type: 61, withholdVat: true })
+  expect(withheld.header.totals).toEqual({
+    netAmount: 10000,
+    vatRate: 19,
+    vatAmount: 1900,
+    withholdings: [{ taxCode: 15, rate: 19, amount: 1900 }],
+    totalAmount: 10000,
+  })
+  expect(createDocument({ ...base, type: 61 }).header.totals).toEqual({
+    netAmount: 10000,
+    vatRate: 19,
+    vatAmount: 1900,
+    totalAmount: 11900,
+  })
+  expect(createDocument({ ...base, type: 46, withholdVat: false }).header.totals.totalAmount).toBe(11900)
+})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/create-document tests/certification/issue-set --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/certification/issue-set'`, and `withholdVat` is not a known property of `DocumentInput`.

- [ ] **Step 3: Write the implementation**

`src/certification/issue-set.ts` (new file, whole):

```ts
import { TEST_SET_REFERENCE_TYPE } from '../catalogs/certification'
import { SII_RUT, type DispatchType, type TransferType } from '../catalogs/codes'
import type { DocumentType } from '../catalogs/document-types'
import type { Certificate } from '../certificate/certificate'
import { issueDocument } from '../document/issue'
import type { SignedDocument } from '../document/sign'
import { createEnvelope } from '../envelope/create'
import { signEnvelope, type SignedEnvelope } from '../envelope/sign'
import { DteError } from '../errors'
import type { DocumentInput, IssuerInput, LineItemInput, ReceiverInput, ReferenceInput } from '../model/document'
import { chileDate } from '../time/chile'
import type { FolioSource } from './folios'
import type {
  BasicSetPlan,
  ExemptSetPlan,
  GuideSetPlan,
  PlannedGuide,
  PlannedItem,
  PlannedNote,
  PurchaseSetPlan,
} from './set-plan'

/**
 * EN: What issuing a set needs.
 * ES: Lo que necesita emitir un set.
 */
export type IssueSetOptions = {
  /** EN: The issuer, as for phase 1. ES: El emisor, como en la fase 1. */
  readonly issuer: IssuerInput
  /** EN: The customer every document names; purchase invoices and internal transfers name the issuer instead. ES: El cliente que nombra cada documento; las facturas de compra y los traslados internos nombran al emisor. */
  readonly receiver: ReceiverInput
  readonly certificate: Certificate
  /** EN: Where folios and their CAFs come from. ES: De dónde salen los folios y sus CAF. */
  readonly folios: FolioSource
  /** EN: The resolution of the certification environment: number 0 and its date. ES: La resolución del ambiente de certificación: número 0 y su fecha. */
  readonly resolution: { readonly number: number; readonly date: string }
  /** EN: Clock; issue dates are Chile dates of it. ES: Reloj; las fechas de emisión son fechas de Chile de él. */
  readonly now?: () => Date
}

/**
 * EN: One issued document of a set.
 * ES: Un documento emitido de un set.
 */
export type IssuedCase = {
  readonly caseId: string
  readonly type: DocumentType
  readonly folio: number
  readonly document: SignedDocument
}

/**
 * EN: An issued set: its documents in issue order and the signed envelope that carries them.
 * ES: Un set emitido: sus documentos en orden de emisión y el sobre firmado que los lleva.
 */
export type IssuedSet = {
  readonly kind: 'basic' | 'exempt' | 'guide' | 'purchase'
  readonly attentionNumber: string
  readonly cases: readonly IssuedCase[]
  readonly envelope: SignedEnvelope
}

/** EN: The plans `issueTestSet` accepts. ES: Los planes que acepta `issueTestSet`. */
export type IssuableSetPlan = BasicSetPlan | ExemptSetPlan | GuideSetPlan | PurchaseSetPlan

/** EN: `SetDTE/@ID` of every certification envelope. ES: `SetDTE/@ID` de cada sobre de certificación. */
export const TEST_SET_ENVELOPE_ID = 'DTE_SetDoc'

const GLOBAL_DISCOUNT_DESCRIPTION = 'DESCUENTO GLOBAL ITEMES AFECTOS'
const NO_AMOUNT_LINE: PlannedItem = { name: 'SIN MONTO', quantity: 1, unitPrice: 0 }
const CORRECTION = 'CORRECCION'
const PURCHASE_TAX_CODE = 15
const INTERNAL_TRANSFER = 5

/**
 * EN: What one issued document leaves for the notes that reference its case. Internal.
 * ES: Lo que un documento emitido deja para las notas que refieren su caso. Interno.
 */
export type IssuedRecord = {
  readonly type: DocumentType
  readonly folio: number
  readonly date: string
  readonly items: readonly PlannedItem[]
}

/**
 * EN: The state of one issuing run: options, clock, the records of issued cases and the documents so far. Internal:
 * `issueTestSet` and `issueSimulation` share it.
 * ES: El estado de una corrida de emisión: opciones, reloj, los registros de casos emitidos y los documentos hasta
 * ahora. Interno: lo comparten `issueTestSet` e `issueSimulation`.
 */
export type IssueContext = {
  readonly options: IssueSetOptions
  readonly now: Date
  readonly date: string
  readonly records: Map<string, IssuedRecord>
  readonly issued: IssuedCase[]
}

type LineStyle = 'plain' | 'guide' | 'purchase'

const compact = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T

/**
 * EN: The issuer written as the receiver of its own documents (purchase invoices, internal transfers).
 * ES: El emisor escrito como receptor de sus propios documentos (facturas de compra, traslados internos).
 */
export const issuerAsReceiver = (issuer: IssuerInput): ReceiverInput => ({
  rut: issuer.rut,
  businessName: issuer.businessName,
  businessActivity: issuer.businessActivity,
  address: issuer.address,
  commune: issuer.commune,
  city: issuer.city ?? issuer.commune,
})

const line = (item: PlannedItem, style: LineStyle): LineItemInput => {
  const priced = item.unitPrice > 0
  if (style === 'purchase')
    return compact({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit ?? 'UN',
      unitPrice: item.unitPrice,
      exempt: item.exempt,
      additionalTaxCodes: item.exempt ? undefined : [PURCHASE_TAX_CODE],
    })
  if (style === 'guide')
    return compact({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit ?? 'UN',
      unitPrice: priced ? item.unitPrice : undefined,
      exempt: item.exempt,
    })
  return compact({
    name: item.name,
    quantity: priced ? item.quantity : undefined,
    unit: priced ? item.unit : undefined,
    unitPrice: priced ? item.unitPrice : undefined,
    discountPercent: priced ? item.discountPercent : undefined,
    exempt: item.exempt,
  })
}

const setReference = (caseId: string, date: string): ReferenceInput => ({
  documentType: TEST_SET_REFERENCE_TYPE,
  folio: 1,
  date,
  reason: `CASO ${caseId}`,
})

const documentReference = (referenced: IssuedRecord, note: PlannedNote): ReferenceInput => ({
  documentType: referenced.type,
  folio: referenced.folio,
  date: referenced.date,
  code: note.referenceCode,
  reason: note.reasonText,
})

const referencedRecord = (context: IssueContext, note: PlannedNote): IssuedRecord => {
  const record = note.referencedCase === null ? undefined : context.records.get(note.referencedCase)
  if (record === undefined) throw new DteError('MISSING_FIELD', { field: 'referencedCase', caseId: note.caseId })
  return record
}

/** EN: Names compared upper-cased and trimmed. ES: Nombres comparados en mayúsculas y sin espacios. Interno. */
export const sameName = (a: string, b: string): boolean => a.toUpperCase().trim() === b.toUpperCase().trim()
/** EN: The items marked exempt. ES: Los ítems marcados exentos. Interno. */
export const exemptAll = (items: readonly PlannedItem[]): readonly PlannedItem[] =>
  items.map((item) => ({ ...item, exempt: true }))

const basicCreditItems = (context: IssueContext, note: PlannedNote): readonly PlannedItem[] => {
  const referenced = referencedRecord(context, note)
  const base = note.itemsFromCase === null ? note.items : referenced.items
  const filled =
    note.referenceCode === 3
      ? base.map((item) => {
          if (item.unitPrice > 0) return item
          const original = referenced.items.find((candidate) => candidate.name === item.name)
          return original === undefined
            ? item
            : compact({ ...item, unitPrice: original.unitPrice, discountPercent: original.discountPercent })
        })
      : base
  return filled.length > 0 ? filled : [NO_AMOUNT_LINE]
}

const basicDebitItems = (note: PlannedNote): readonly PlannedItem[] =>
  note.items.length > 0 ? note.items : [NO_AMOUNT_LINE]

const newPriceItems = (note: PlannedNote, referenced: IssuedRecord): readonly PlannedItem[] =>
  note.items.map((item) => {
    const original = referenced.items.find((candidate) => sameName(candidate.name, item.name))
    return original === undefined
      ? { ...item, exempt: true }
      : {
          name: item.name,
          quantity: original.quantity,
          unitPrice: item.unitPrice,
          unit: item.unit ?? original.unit ?? 'UN',
          exempt: true,
        }
  })

const correctionLine = (note: PlannedNote): PlannedItem => ({
  name: note.reasonText || CORRECTION,
  quantity: 1,
  unitPrice: 0,
  exempt: true,
})

const exemptCreditItems = (context: IssueContext, note: PlannedNote): readonly PlannedItem[] => {
  const referenced = referencedRecord(context, note)
  const upper = note.reasonText.toUpperCase()
  if (note.referenceCode === 2) return [correctionLine(note)]
  if (note.referenceCode === 3) {
    if ((upper.includes('DEVOLUCION') || upper.includes('DEVOLUCIÓN')) && referenced.items.length > 0)
      return exemptAll(referenced.items)
    if (upper.includes('MODIFICA MONTO') && note.items.length > 0 && referenced.items.length > 0)
      return newPriceItems(note, referenced)
    return note.items.length > 0 ? exemptAll(note.items) : exemptAll(referenced.items)
  }
  return exemptAll(referenced.items)
}

const exemptDebitItems = (context: IssueContext, note: PlannedNote): readonly PlannedItem[] => {
  const referenced = referencedRecord(context, note)
  if (note.items.length === 0) return exemptAll(referenced.items)
  if (note.referenceCode === 3 && note.reasonText.toUpperCase().includes('MODIFICA MONTO'))
    return newPriceItems(note, referenced)
  return exemptAll(note.items)
}

const purchaseNoteItems = (note: PlannedNote, referenced: IssuedRecord): readonly PlannedItem[] =>
  note.items.map((item) => {
    const original = referenced.items.find((candidate) => candidate.name === item.name)
    return compact({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice || original?.unitPrice || 0,
      unit: item.unit ?? original?.unit,
    })
  })

const purchaseCreditItems = (context: IssueContext, note: PlannedNote): readonly PlannedItem[] =>
  purchaseNoteItems(note, referencedRecord(context, note))

const purchaseDebitItems = (context: IssueContext, note: PlannedNote): readonly PlannedItem[] => {
  const referenced = referencedRecord(context, note)
  return note.items.length > 0 ? purchaseNoteItems(note, referenced) : referenced.items
}

/**
 * EN: One document to issue inside a run. Internal.
 * ES: Un documento a emitir dentro de una corrida. Interno.
 */
export type IssueDocumentSpec = {
  readonly caseId: string
  readonly type: DocumentType
  readonly items: readonly PlannedItem[]
  readonly style: LineStyle
  readonly receiver?: ReceiverInput
  readonly references: readonly ReferenceInput[]
  readonly globalDiscountPercent?: number
  /** EN: Write the field's description on the global discount; true by default, false in the simulation. ES: Escribir la glosa del campo en el descuento global; true por defecto, false en la simulación. */
  readonly globalDiscountDescription?: boolean
  readonly options?: DocumentInput['options']
  readonly totals?: DocumentInput['totals']
  readonly withholdVat?: boolean
  readonly record: boolean
}

/**
 * EN: Takes a folio, builds the phase 1 input, issues the document and records it when asked. Internal.
 * ES: Toma un folio, arma la entrada de la fase 1, emite el documento y lo registra si se pide. Interno.
 */
export const issueCertificationDocument = async (
  context: IssueContext,
  input: IssueDocumentSpec,
): Promise<IssuedCase> => {
  const { caf, folio } = await context.options.folios.take(input.type)
  const document: DocumentInput = compact({
    type: input.type,
    folio,
    issueDate: context.date,
    issuer: context.options.issuer,
    receiver: input.receiver ?? context.options.receiver,
    items: input.items.map((item) => line(item, input.style)),
    references: input.references,
    globalAdjustments:
      input.globalDiscountPercent === undefined
        ? undefined
        : [
            compact({
              kind: 'discount',
              valueType: 'percent',
              value: input.globalDiscountPercent,
              description: input.globalDiscountDescription === false ? undefined : GLOBAL_DISCOUNT_DESCRIPTION,
            }),
          ],
    options: input.options,
    totals: input.totals,
    withholdVat: input.withholdVat,
  })
  const signed = issueDocument({ document, caf, certificate: context.options.certificate, now: context.now })
  const issued: IssuedCase = { caseId: input.caseId, type: input.type, folio, document: signed }
  context.issued.push(issued)
  if (input.record)
    context.records.set(input.caseId, { type: input.type, folio, date: context.date, items: input.items })
  return issued
}

const issueInvoicesAndNotes = async (
  context: IssueContext,
  plan: BasicSetPlan | ExemptSetPlan | PurchaseSetPlan,
): Promise<void> => {
  const kind = plan.kind
  const style: LineStyle = kind === 'purchase' ? 'purchase' : 'plain'
  const receiver = kind === 'purchase' ? issuerAsReceiver(context.options.issuer) : undefined
  const invoices = kind === 'purchase' ? [plan.invoice] : plan.invoices
  const creditNotes = kind === 'purchase' ? (plan.creditNote === null ? [] : [plan.creditNote]) : plan.creditNotes
  const debitNotes = kind === 'purchase' ? (plan.debitNote === null ? [] : [plan.debitNote]) : plan.debitNotes
  const invoiceType: DocumentType = kind === 'basic' ? 33 : kind === 'exempt' ? 34 : 46
  if (invoices.length === 0) throw new DteError('MISSING_FIELD', { field: 'invoices', kind })

  for (const invoice of invoices) {
    await issueCertificationDocument(context, {
      caseId: invoice.caseId,
      type: invoiceType,
      items: invoice.items,
      style,
      receiver,
      references: [setReference(invoice.caseId, context.date)],
      globalDiscountPercent: invoice.globalDiscountPercent,
      options: kind === 'basic' ? { saleTransactionType: 1 } : undefined,
      record: true,
    })
  }
  const creditItems = kind === 'basic' ? basicCreditItems : kind === 'exempt' ? exemptCreditItems : purchaseCreditItems
  for (const note of creditNotes) {
    const items = creditItems(context, note)
    await issueCertificationDocument(context, {
      caseId: note.caseId,
      type: 61,
      items,
      style,
      receiver,
      references: [setReference(note.caseId, context.date), documentReference(referencedRecord(context, note), note)],
      withholdVat: kind === 'purchase' ? true : undefined,
      record: true,
    })
  }
  for (const note of debitNotes) {
    const items =
      kind === 'basic'
        ? basicDebitItems(note)
        : kind === 'exempt'
          ? exemptDebitItems(context, note)
          : purchaseDebitItems(context, note)
    await issueCertificationDocument(context, {
      caseId: note.caseId,
      type: 56,
      items,
      style,
      receiver,
      references: [setReference(note.caseId, context.date), documentReference(referencedRecord(context, note), note)],
      withholdVat: kind === 'purchase' ? true : undefined,
      record: false,
    })
  }
}

/**
 * EN: The `IdDoc` options of a guide: its transfer reason and dispatch type. Internal.
 * ES: Las opciones de `IdDoc` de una guía: su tipo de traslado y de despacho. Interno.
 */
export const guideOptions = (guide: PlannedGuide): DocumentInput['options'] =>
  compact({
    transferType: guide.transferReason as TransferType,
    dispatchType: guide.dispatchType as DispatchType | undefined,
  })

/** EN: True for an internal transfer, which names the issuer and totals 0. ES: True para un traslado interno, que nombra al emisor y totaliza 0. Interno. */
export const isInternalTransfer = (guide: PlannedGuide): boolean => guide.transferReason === INTERNAL_TRANSFER

const issueGuides = async (context: IssueContext, plan: GuideSetPlan): Promise<void> => {
  if (plan.guides.length === 0) throw new DteError('MISSING_FIELD', { field: 'guides', kind: plan.kind })
  for (const guide of plan.guides) {
    const internal = isInternalTransfer(guide)
    await issueCertificationDocument(context, {
      caseId: guide.caseId,
      type: 52,
      items: guide.items,
      style: 'guide',
      receiver: internal ? issuerAsReceiver(context.options.issuer) : undefined,
      references: [setReference(guide.caseId, context.date)],
      options: guideOptions(guide),
      totals: internal ? { vatRate: 19, totalAmount: 0 } : undefined,
      record: false,
    })
  }
}

/**
 * EN: Signs the envelope of a set or of the simulation: `EnvioDTE` with the issuer, the certificate holder as sender,
 * the SII as receiver and the certification resolution. Internal: `issueTestSet` and `issueSimulation` share it.
 * ES: Firma el sobre de un set o de la simulación: `EnvioDTE` con el emisor, el titular del certificado como enviador,
 * el SII como receptor y la resolución de certificación. Interno: lo comparten `issueTestSet` e `issueSimulation`.
 */
export const signCertificationEnvelope = (
  documents: readonly SignedDocument[],
  options: IssueSetOptions,
  now: Date,
  setId: string | undefined,
): SignedEnvelope =>
  signEnvelope(
    createEnvelope({
      kind: 'dte',
      documents,
      cover: compact({
        issuerRut: options.issuer.rut,
        senderRut: options.certificate.rut ?? options.issuer.rut,
        receiverRut: SII_RUT,
        resolutionDate: options.resolution.date,
        resolutionNumber: options.resolution.number,
        setId,
      }),
      now,
    }),
    options.certificate,
  )

/**
 * EN: Issues every document of a set plan and signs its envelope. Invoices (or guides) go first, then credit notes,
 * then debit notes, each with the SET reference (`SET`, folio 1, the issue date, `CASO <id>`) and, on notes, the
 * reference to the document of the referenced case with the code and reason of the set. Basic invoices carry
 * `TpoTranVenta` 1 and the global discount of the case; purchase documents name the issuer as receiver and carry the
 * withholding; an internal transfer names the issuer and totals 0.
 * ES: Emite cada documento del plan de un set y firma su sobre. Primero las facturas (o guías), luego las notas de
 * crédito, luego las de débito, cada una con la referencia SET (`SET`, folio 1, la fecha de emisión, `CASO <id>`) y, en
 * las notas, la referencia al documento del caso referido con el código y la razón del set. Las facturas del set
 * básico llevan `TpoTranVenta` 1 y el descuento global del caso; los documentos de compra nombran al emisor como
 * receptor y llevan la retención; un traslado interno nombra al emisor y totaliza 0.
 * @param plan EN: a set plan of `planCertificationSets`. ES: un plan de set de `planCertificationSets`.
 * @param options EN: issuer, receiver, certificate, folios, resolution, clock. ES: emisor, receptor, certificado, folios, resolución, reloj.
 * @throws {DteError} EN: `MISSING_FIELD` (`invoices` or `guides` on an empty plan, `referencedCase` on a note whose case was not issued before it), `FOLIO_OUT_OF_RANGE` from the folio source, and the phase 1 codes. ES: `MISSING_FIELD` (`invoices` o `guides` en un plan vacío, `referencedCase` en una nota cuyo caso no se emitió antes), `FOLIO_OUT_OF_RANGE` de la fuente de folios, y los códigos de la fase 1.
 */
export const issueTestSet = async (plan: IssuableSetPlan, options: IssueSetOptions): Promise<IssuedSet> => {
  const now = options.now?.() ?? new Date()
  const context: IssueContext = { options, now, date: chileDate(now), records: new Map(), issued: [] }
  if (plan.kind === 'guide') await issueGuides(context, plan)
  else await issueInvoicesAndNotes(context, plan)
  const envelope = signCertificationEnvelope(
    context.issued.map((issued) => issued.document),
    options,
    now,
    TEST_SET_ENVELOPE_ID,
  )
  return { kind: plan.kind, attentionNumber: plan.attentionNumber, cases: context.issued, envelope }
}
```

`src/model/document.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/model/document.ts b/src/model/document.ts
index 3317a81..a48b330 100644
--- a/src/model/document.ts
+++ b/src/model/document.ts
@@ -516,6 +516,8 @@ export type DocumentInput = {
   readonly options?: HeaderOptions
   /** EN: Unit prices already include VAT: emits `MntBruto=1` and derives net/VAT from the gross. ES: Los precios unitarios ya incluyen IVA: emite `MntBruto=1` y deriva neto/IVA del bruto. */
   readonly pricesIncludeVat?: boolean
+  /** EN: Withhold the whole VAT (`ImptoReten` 15, total without VAT); true by default on purchase invoices, settable on the notes that affect one. ES: `ImptoReten` — Retener todo el IVA (código 15, total sin IVA); true por defecto en facturas de compra (46), se puede fijar en las notas que las afectan. */
+  readonly withholdVat?: boolean
   /** EN: Explicit totals (advanced); computed when omitted. ES: Totales explícitos (uso avanzado); se calculan si se omiten. */
   readonly totals?: Totals
 }
```

`src/document/create.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/document/create.ts b/src/document/create.ts
index 2c26ce6..0c758bf 100644
--- a/src/document/create.ts
+++ b/src/document/create.ts
@@ -260,7 +260,13 @@ export const createDocument = (input: DocumentInput, options: CreateDocumentOpti
   const transport = normalizeTransport(input.transport)
   const totals =
     input.totals ??
-    calculateTotals(items, { type, pricesIncludeVat: input.pricesIncludeVat, vatRate: VAT_RATE, globalAdjustments })
+    calculateTotals(items, {
+      type,
+      pricesIncludeVat: input.pricesIncludeVat,
+      vatRate: VAT_RATE,
+      globalAdjustments,
+      withholdVat: input.withholdVat,
+    })
   const headerOptions: HeaderOptions = compact({
     ...input.options,
     serviceIndicator: input.options?.serviceIndicator ?? (receipt ? SERVICE_INDICATORS.salesAndServices : undefined),
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/create-document tests/certification/issue-set --coverage=false
```

Expected: PASS, 56 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/certification/issue-set.ts src/model/document.ts src/document/create.ts tests/support/certification-fixtures.ts tests/certification/issue-set.test.ts tests/create-document.test.ts
```

```bash
git commit -F - <<'MSG'
feat: issue the four certification sets

issueTestSet issues the basic, exempt, guide and purchase sets through phase 1: invoices or
guides first, then credit notes, then debit notes, each with the SET reference and, on notes,
the reference to the document of the referenced case; the note item rules of the field;
purchase documents with the issuer as receiver and the VAT withheld; internal transfers with
the issuer as receiver and total 0; one signed envelope per set naming the SII. Phase 1 gains
withholdVat on DocumentInput so the notes of a purchase invoice withhold the VAT too.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 5: The simulation

`issueSimulation` (spec 3.6): every case of the four sets issued again with fresh folios in one envelope, no SET reference, one reference on notes, no description on the global discount, the field's own item rules for the simulation.

**Files:**

- Create: `src/certification/simulation.ts`
- Test (create): `tests/certification/simulation.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/certification/simulation.test.ts` (new file, whole):

```ts
import { issueSimulation, type IssuedSimulation } from '../../src/certification/simulation'
import { verifyEnvelopeSignature } from '../../src/envelope/sign'
import { cafFor, fullPlan, issueOptions, issuer } from '../support/certification-fixtures'
import { ISSUER_RUT, RECEIVER_RUT } from '../support/fixtures'
import { failure } from '../support/portal'
import { ATTENTION } from '../support/test-set-samples'

const id = (n: number) => `${ATTENTION}-${n}`
const plan = fullPlan()
const byCase = (simulation: IssuedSimulation, n: number) => simulation.cases.find((issued) => issued.caseId === id(n))!

describe('the simulation of the whole plan', () => {
  let simulation: IssuedSimulation
  beforeAll(async () => {
    simulation = await issueSimulation(plan, issueOptions())
  })

  test('issues every case of the four sets in order, in one envelope, with the types it holds', () => {
    expect(simulation.cases.map((issued) => issued.type)).toEqual([
      33, 33, 33, 61, 61, 61, 56, 56, 34, 61, 61, 56, 52, 52, 52, 46, 61, 56,
    ])
    expect(simulation.types).toEqual([33, 61, 56, 34, 52, 46])
    expect(simulation.fewerThanRecommended).toBe(false)
    expect(simulation.envelope.documents).toHaveLength(18)
    expect(simulation.envelope.setId).toMatch(/^DTE_SetDoc_/)
    expect(simulation.envelope.cover.receiverRut).toBe('60803000-K')
    expect(verifyEnvelopeSignature(simulation.envelope.xml).valid).toBe(true)
  })

  test('no document carries the SET reference; notes carry one reference to their document', () => {
    for (const issued of simulation.cases) {
      expect(issued.document.references.some((reference) => reference.documentType === 'SET')).toBe(false)
    }
    expect(byCase(simulation, 1).document.references).toEqual([])
    expect(byCase(simulation, 13).document.references).toEqual([])
    const note = byCase(simulation, 4).document
    expect(note.references).toHaveLength(1)
    expect(note.references[0]).toMatchObject({
      lineNumber: 1,
      documentType: 33,
      folio: '1',
      code: 3,
      reason: 'DEVOLUCION DE MERCADERIAS',
    })
  })

  test('the global discount has no description, and invoices keep TpoTranVenta 1', () => {
    const second = byCase(simulation, 2).document
    expect(second.globalAdjustments).toEqual([{ lineNumber: 1, kind: 'discount', valueType: 'percent', value: 7 }])
    expect(second.header.options.saleTransactionType).toBe(1)
    expect(byCase(simulation, 9).document.header.options.saleTransactionType).toBeUndefined()
  })

  test('a return takes every item of the referenced document; a price change keeps the original quantity', () => {
    expect(byCase(simulation, 4).document.items.map((item) => [item.name, item.quantity, item.unitPrice])).toEqual([
      ['Cajon de manzanas', 130, 2800],
      ['Relleno de pollo', 90, 1700],
    ])
    expect(byCase(simulation, 8).document.items.map((item) => [item.name, item.quantity, item.unitPrice])).toEqual([
      ['Cajon de manzanas', 130, 3100],
    ])
    expect(byCase(simulation, 6).document.items.map((item) => item.name)).toEqual(['Cemento'])
  })

  test('a note without items gets a line named after its reason; exempt notes stay exempt', () => {
    expect(byCase(simulation, 5).document.items.map((item) => [item.name, item.amount])).toEqual([
      ['CORRIGE GIRO DEL RECEPTOR', 0],
    ])
    const exemptNote = byCase(simulation, 10).document
    expect(exemptNote.items.map((item) => [item.name, item.exemptIndicator])).toEqual([
      ['DEVOLUCION DE MERCADERIAS', 1],
    ])
    expect(byCase(simulation, 12).document.items[0]).toMatchObject({
      name: 'Asesoria tributaria',
      quantity: 2,
      unitPrice: 75000,
      exemptIndicator: 1,
    })
  })

  test('purchase documents and internal transfers name the issuer; a purchase note takes the original price', () => {
    expect(byCase(simulation, 16).document.header.receiver.rut).toBe(ISSUER_RUT)
    expect(byCase(simulation, 14).document.header.receiver.rut).toBe(ISSUER_RUT)
    expect(byCase(simulation, 13).document.header.receiver.rut).toBe(RECEIVER_RUT)
    expect(byCase(simulation, 14).document.header.options).toMatchObject({ transferType: 5, dispatchType: 1 })
    const credit = byCase(simulation, 17).document
    expect(credit.items[0]).toMatchObject({
      name: 'Chatarra de fierro',
      quantity: 100,
      unitPrice: 1200,
      additionalTaxCodes: [15],
    })
    expect(credit.header.totals).toMatchObject({
      totalAmount: 120000,
      withholdings: [{ taxCode: 15, rate: 19, amount: 22800 }],
    })
    expect(credit.references[0]).toMatchObject({ documentType: 46, code: 3 })
  })
})

describe('edges', () => {
  test('a note whose case is not in the simulation carries no reference and keeps its own items', async () => {
    const basic = plan.basic!
    const simulation = await issueSimulation(
      {
        basic: {
          ...basic,
          invoices: basic.invoices.slice(1),
          creditNotes: [basic.creditNotes[0]],
          debitNotes: [basic.debitNotes[1]],
        },
      },
      issueOptions(),
    )
    expect(simulation.cases.map((issued) => issued.caseId)).toEqual([id(2), id(3), id(4), id(8)])
    expect(byCase(simulation, 4).document.references).toEqual([])
    expect(byCase(simulation, 4).document.items.map((item) => [item.name, item.quantity, item.unitPrice])).toEqual([
      ['Cajon de manzanas', undefined, undefined],
    ])
    expect(byCase(simulation, 8).document.items.map((item) => [item.name, item.quantity, item.unitPrice])).toEqual([
      ['Cajon de manzanas', 1, 3100],
    ])
    expect(simulation.fewerThanRecommended).toBe(true)
  })

  test('a purchase note item the invoice does not have gets price 1, and a basic note with an unknown name keeps its quantity', async () => {
    const purchase = plan.purchase!
    const simulation = await issueSimulation(
      {
        purchase: {
          ...purchase,
          creditNote: { ...purchase.creditNote!, items: [{ name: 'Otra cosa', quantity: 4, unitPrice: 0 }] },
          debitNote: null,
        },
        basic: {
          ...plan.basic!,
          creditNotes: [],
          debitNotes: [{ ...plan.basic!.debitNotes[1], items: [{ name: 'Desconocido', quantity: 1, unitPrice: 500 }] }],
        },
      },
      issueOptions(),
    )
    expect(byCase(simulation, 17).document.items[0]).toMatchObject({
      name: 'Otra cosa',
      quantity: 4,
      unitPrice: 1,
      amount: 4,
    })
    expect(byCase(simulation, 8).document.items[0]).toMatchObject({ name: 'Desconocido', quantity: 1, unitPrice: 500 })
  })

  test('notes without a referenced case, without items, or with a code 3 reason of neither kind', async () => {
    const basic = plan.basic!
    const simulation = await issueSimulation(
      {
        basic: {
          ...basic,
          creditNotes: [
            { ...basic.creditNotes[0], referencedCase: null, items: [] },
            {
              ...basic.creditNotes[0],
              caseId: 'c-2',
              reasonText: 'MODIFICA PRECIO',
              items: [{ name: 'Cajon de manzanas', quantity: 7, unitPrice: 10 }],
            },
            {
              ...basic.creditNotes[2],
              caseId: 'c-3',
              itemsFromCase: 'nope',
              items: [{ name: 'Propio', quantity: 1, unitPrice: 2 }],
            },
            { ...basic.creditNotes[0], caseId: 'c-4', reasonText: '', items: [] },
          ],
          debitNotes: [],
        },
      },
      { ...issueOptions(), now: undefined },
    )
    const items = (index: number) =>
      simulation.cases[index].document.items.map((item) => [item.name, item.quantity, item.unitPrice])
    expect(simulation.cases[3].document.references).toEqual([])
    expect(items(3)).toEqual([['DEVOLUCION DE MERCADERIAS', undefined, undefined]])
    expect(items(4)).toEqual([['Cajon de manzanas', 7, 10]])
    expect(items(5)).toEqual([['Propio', 1, 2]])
    expect(items(6)).toEqual([['CORRECCION', undefined, undefined]])
    expect(simulation.cases[0].document.header.issueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('an exempt note with no items and no reason gets the CORRECCION line, exempt', async () => {
    const exempt = plan.exempt!
    const simulation = await issueSimulation(
      { exempt: { ...exempt, creditNotes: [{ ...exempt.creditNotes[0], reasonText: '', items: [] }], debitNotes: [] } },
      issueOptions(),
    )
    expect(simulation.cases[1].document.items.map((item) => [item.name, item.exemptIndicator])).toEqual([
      ['CORRECCION', 1],
    ])
  })

  test('an empty plan is MISSING_FIELD, and only the guide set is fewer than recommended', async () => {
    expect((await failure(issueSimulation({}, issueOptions()))).details).toEqual({ field: 'cases' })
    const guides = await issueSimulation({ guide: plan.guide }, issueOptions([cafFor(52)]))
    expect(guides.cases).toHaveLength(3)
    expect(guides.fewerThanRecommended).toBe(true)
    expect(guides.types).toEqual([52])
    expect(guides.cases[1].document.header.receiver.businessName).toBe(issuer.businessName)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/certification/simulation --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/certification/simulation'`.

- [ ] **Step 3: Write the implementation**

`src/certification/simulation.ts` (new file, whole):

```ts
import type { DocumentType } from '../catalogs/document-types'
import type { SignedEnvelope } from '../envelope/sign'
import { DteError } from '../errors'
import type { ReferenceInput } from '../model/document'
import { chileDate } from '../time/chile'
import {
  exemptAll,
  guideOptions,
  isInternalTransfer,
  issueCertificationDocument,
  issuerAsReceiver,
  sameName,
  signCertificationEnvelope,
  type IssueContext,
  type IssueSetOptions,
  type IssuedCase,
  type IssuedRecord,
} from './issue-set'
import type { CertificationPlan, PlannedItem, PlannedNote } from './set-plan'

/**
 * EN: The simulation: every case of the four sets issued again, in one envelope.
 * ES: La simulación: cada caso de los cuatro sets reemitido, en un sobre.
 */
export type IssuedSimulation = {
  readonly cases: readonly IssuedCase[]
  readonly envelope: SignedEnvelope
  /** EN: Document types in the envelope, in order of first appearance. ES: Tipos de documento del sobre, en orden de aparición. */
  readonly types: readonly DocumentType[]
  /** EN: True with fewer than the ten documents the SII asks for. ES: True con menos de los diez documentos que pide el SII. */
  readonly fewerThanRecommended: boolean
}

const RECOMMENDED_MINIMUM = 10
const CORRECTION = 'CORRECCION'

const referencedOf = (context: IssueContext, note: PlannedNote): IssuedRecord | undefined =>
  note.referencedCase === null ? undefined : context.records.get(note.referencedCase)

const noteReference = (referenced: IssuedRecord | undefined, note: PlannedNote): readonly ReferenceInput[] =>
  referenced === undefined
    ? []
    : [
        {
          documentType: referenced.type,
          folio: referenced.folio,
          date: referenced.date,
          code: note.referenceCode,
          reason: note.reasonText,
        },
      ]

const basicLikeItems = (
  context: IssueContext,
  kind: 'basic' | 'exempt',
  note: PlannedNote,
  referenced: IssuedRecord | undefined,
): readonly PlannedItem[] => {
  const exempt = kind === 'exempt'
  const mark = (items: readonly PlannedItem[]): readonly PlannedItem[] => (exempt ? exemptAll(items) : items)
  const upper = note.reasonText.toUpperCase()
  const fromCase = note.itemsFromCase === null ? undefined : context.records.get(note.itemsFromCase)
  if (fromCase !== undefined) return mark(fromCase.items)
  if (note.items.length === 0)
    return [
      exempt
        ? { name: note.reasonText || CORRECTION, quantity: 1, unitPrice: 0, exempt: true }
        : { name: note.reasonText || CORRECTION, quantity: 1, unitPrice: 0 },
    ]
  if (note.referenceCode === 3 && referenced !== undefined) {
    if (upper.includes('DEVOLUCION')) return mark(referenced.items)
    if (upper.includes('MODIFICA MONTO'))
      return mark(
        note.items.map((item) => {
          const original = referenced.items.find((candidate) => sameName(candidate.name, item.name))
          return original === undefined ? item : { ...item, quantity: original.quantity }
        }),
      )
  }
  return mark(note.items)
}

const purchaseItems = (note: PlannedNote, referenced: IssuedRecord | undefined): readonly PlannedItem[] =>
  note.items.map((item) => {
    const original = referenced?.items.find((candidate) => candidate.name === item.name)
    return { ...item, unitPrice: item.unitPrice || original?.unitPrice || 1 }
  })

/**
 * EN: Issues every case of the four set plans again with fresh folios, in the order basic, exempt, guide and purchase,
 * and signs one envelope with all of them. As the field does for the simulation: no SET reference; a note carries one
 * reference to its referenced document when that case is in the simulation; the global discount has no description;
 * the receiver is the issuer on purchase documents and internal transfers; a note with no items gets one line named
 * after its reason; a purchase note item without a price takes the original's price, or 1.
 * ES: Reemite cada caso de los cuatro planes con folios nuevos, en el orden básico, exento, guías y compra, y firma un
 * solo sobre con todos. Como el campo en la simulación: sin referencia SET; una nota lleva una referencia a su documento
 * referido cuando ese caso está en la simulación; el descuento global no lleva glosa; el receptor es el emisor en los
 * documentos de compra y los traslados internos; una nota sin ítems lleva una línea con su razón; un ítem de nota de
 * compra sin precio toma el del original, o 1.
 * @param plan EN: the plan of `planCertificationSets`. ES: el plan de `planCertificationSets`.
 * @param options EN: as for `issueTestSet`; the folio source should hold CAFs other than the sets'. ES: como en `issueTestSet`; la fuente de folios debería traer CAF distintos de los de los sets.
 * @throws {DteError} EN: `MISSING_FIELD` (`cases`) when the plan has no case, `FOLIO_OUT_OF_RANGE` from the folio source, and the phase 1 codes. ES: `MISSING_FIELD` (`cases`) si el plan no tiene casos, `FOLIO_OUT_OF_RANGE` de la fuente de folios, y los códigos de la fase 1.
 */
export const issueSimulation = async (plan: CertificationPlan, options: IssueSetOptions): Promise<IssuedSimulation> => {
  const now = options.now?.() ?? new Date()
  const context: IssueContext = { options, now, date: chileDate(now), records: new Map(), issued: [] }
  const issuer = issuerAsReceiver(options.issuer)

  for (const set of [plan.basic, plan.exempt]) {
    if (set === undefined) continue
    const invoiceType: DocumentType = set.kind === 'basic' ? 33 : 34
    for (const invoice of set.invoices)
      await issueCertificationDocument(context, {
        caseId: invoice.caseId,
        type: invoiceType,
        items: invoice.items,
        style: 'plain',
        references: [],
        globalDiscountPercent: invoice.globalDiscountPercent,
        globalDiscountDescription: false,
        options: set.kind === 'basic' ? { saleTransactionType: 1 } : undefined,
        record: true,
      })
    for (const [type, notes] of [
      [61, set.creditNotes],
      [56, set.debitNotes],
    ] as const)
      for (const note of notes) {
        const referenced = referencedOf(context, note)
        await issueCertificationDocument(context, {
          caseId: note.caseId,
          type,
          items: basicLikeItems(context, set.kind, note, referenced),
          style: 'plain',
          references: noteReference(referenced, note),
          record: true,
        })
      }
  }
  for (const guide of plan.guide?.guides ?? [])
    await issueCertificationDocument(context, {
      caseId: guide.caseId,
      type: 52,
      items: guide.items,
      style: 'guide',
      receiver: isInternalTransfer(guide) ? issuer : undefined,
      references: [],
      options: guideOptions(guide),
      record: true,
    })
  if (plan.purchase !== undefined) {
    const { invoice, creditNote, debitNote } = plan.purchase
    await issueCertificationDocument(context, {
      caseId: invoice.caseId,
      type: 46,
      items: invoice.items,
      style: 'purchase',
      receiver: issuer,
      references: [],
      record: true,
    })
    for (const [type, note] of [
      [61, creditNote],
      [56, debitNote],
    ] as const) {
      if (note === null) continue
      const referenced = referencedOf(context, note)
      await issueCertificationDocument(context, {
        caseId: note.caseId,
        type,
        items: purchaseItems(note, referenced),
        style: 'purchase',
        receiver: issuer,
        references: noteReference(referenced, note),
        withholdVat: true,
        record: true,
      })
    }
  }
  if (context.issued.length === 0) throw new DteError('MISSING_FIELD', { field: 'cases' })
  const envelope = signCertificationEnvelope(
    context.issued.map((issued) => issued.document),
    options,
    now,
    undefined,
  )
  const types = [...new Set(context.issued.map((issued) => issued.type))]
  return { cases: context.issued, envelope, types, fewerThanRecommended: context.issued.length < RECOMMENDED_MINIMUM }
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/certification/simulation --coverage=false
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/certification/simulation.ts tests/certification/simulation.test.ts
```

```bash
git commit -F - <<'MSG'
feat: issue the certification simulation

issueSimulation issues every case of the four sets again with fresh folios in one envelope,
without the SET reference, with a single reference on notes, no description on the global
discount and the field's own item rules.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 6: The three certification books

`createCertificationSalesBook`, `createCertificationPurchaseBook` and `createCertificationGuideBook` (spec 3.7) through phase 3, with every field rule of the purchase books and the position flags of the guide book; every book validates against the SII schemas.

**Files:**

- Create: `src/certification/books.ts`
- Test (create): `tests/certification/books.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/certification/books.test.ts` (new file, whole):

```ts
import {
  createCertificationGuideBook,
  createCertificationPurchaseBook,
  createCertificationSalesBook,
} from '../../src/certification/books'
import { issueTestSet, type IssuedSet } from '../../src/certification/issue-set'
import { cafFor, certificate, fullPlan, issueOptions, receiver } from '../support/certification-fixtures'
import { FIXED_NOW, ISSUER_RUT } from '../support/fixtures'
import { validateAgainstXsd } from '../support/xsd'

const plan = fullPlan()
const bookInput = {
  period: '2026-11',
  issuerRut: ISSUER_RUT,
  senderRut: ISSUER_RUT,
  resolution: { number: 0, date: '2026-01-01' },
  certificate,
  now: () => FIXED_NOW,
}
const bookReceiver = { rut: receiver.rut, name: receiver.businessName }
const placeholder = { counterpartyRut: '60803000-K', counterpartyName: 'Razon Social', date: '2026-11-15' }

describe('the sales book', () => {
  let basic: IssuedSet
  beforeAll(async () => {
    basic = await issueTestSet(plan.basic!, issueOptions())
  })

  test('carries the basic set documents with every amount, the customer and the VAT rate, and validates', async () => {
    const book = createCertificationSalesBook(basic, { ...bookInput, receiver: bookReceiver })
    expect(book.cover).toMatchObject({
      operation: 'sale',
      kind: 'monthly',
      submission: 'total',
      period: '2026-11',
      resolutionNumber: 0,
    })
    expect(book.entries).toHaveLength(8)
    expect(book.entries[0]).toMatchObject({
      type: 33,
      folio: 1,
      date: '2026-11-15',
      counterpartyRut: receiver.rut,
      counterpartyName: receiver.businessName,
      exemptAmount: 0,
      netAmount: 517000,
      vatAmount: 98230,
      totalAmount: 615230,
      taxRate: 19,
    })
    expect(book.entries[1]).toMatchObject({
      type: 33,
      folio: 2,
      exemptAmount: 20000,
      netAmount: 159960,
      vatAmount: 30392,
      totalAmount: 210352,
    })
    expect(book.entries[4]).toMatchObject({
      type: 61,
      folio: 2,
      exemptAmount: 0,
      netAmount: 0,
      vatAmount: 0,
      totalAmount: 0,
      taxRate: 19,
    })
    expect(book.entries[3]).toMatchObject({ type: 61, folio: 1, netAmount: 173600 })
    expect(await validateAgainstXsd(book.xml, 'LibroCV')).toEqual([])
  })

  test('credit notes can be negative', () => {
    const book = createCertificationSalesBook(basic, {
      ...bookInput,
      receiver: bookReceiver,
      creditNoteSign: 'negative',
    })
    expect(book.entries[3]).toMatchObject({ type: 61, netAmount: -173600, vatAmount: -32984, totalAmount: -206584 })
    expect(book.entries[6]).toMatchObject({ type: 56, totalAmount: 0 })
    expect(book.entries[7]).toMatchObject({ type: 56, netAmount: 3100 })
  })

  test('refuses a set that is not the basic one', async () => {
    const guide = await issueTestSet(plan.guide!, issueOptions())
    expect(() => createCertificationSalesBook(guide, { ...bookInput, receiver: bookReceiver })).toThrow(
      expect.objectContaining({ code: 'INVALID_OPTION', details: { field: 'set', kind: 'guide' } }),
    )
  })
})

describe('the purchase books', () => {
  test('the purchase book: one line per supplier document with the field rules, and it validates', async () => {
    const book = createCertificationPurchaseBook(plan.purchaseBook!, bookInput)
    expect(book.cover).toMatchObject({ operation: 'purchase', kind: 'monthly', submission: 'total' })
    expect(book.commonUseVatFactor).toBe(0.6)
    const entries = book.entries.map(({ counterpartyRut, ...entry }) => ({
      ...entry,
      counterpartyRut: String(counterpartyRut),
    }))
    expect(entries).toEqual([
      {
        ...placeholder,
        type: 30,
        folio: 234,
        taxRate: 19,
        exemptAmount: 7893,
        netAmount: 3897,
        vatAmount: 740,
        totalAmount: 12530,
      },
      { ...placeholder, type: 33, folio: 32, taxRate: 19, netAmount: 4305, vatAmount: 818, totalAmount: 5123 },
      {
        ...placeholder,
        type: 30,
        folio: 781,
        taxRate: 0,
        taxKind: 'vat',
        netAmount: 12000,
        vatAmount: 0,
        commonUseVat: 2280,
        totalAmount: 14280,
      },
      {
        ...placeholder,
        type: 33,
        folio: 1004,
        taxRate: 0,
        netAmount: 2000,
        vatAmount: 0,
        nonRecoverableVat: [{ code: 4, amount: 380 }],
        totalAmount: 2380,
      },
      {
        ...placeholder,
        type: 46,
        folio: 87,
        taxRate: 19,
        netAmount: 9000,
        vatAmount: 1710,
        otherTaxes: [{ code: 15, rate: 19, amount: 1710 }],
        totalVatWithheld: 1710,
        totalAmount: 9000,
      },
      {
        ...placeholder,
        type: 60,
        folio: 5,
        taxRate: 19,
        netAmount: 1000,
        vatAmount: 190,
        referenceFolio: 32,
        referenceType: 33,
        totalAmount: 1190,
      },
    ])
    expect(await validateAgainstXsd(book.xml, 'LibroCV')).toEqual([])
  })

  test('the book for exempt taxpayers: non-recoverable VAT on affected lines, type 32, inherited note amounts, and it validates', async () => {
    const book = createCertificationPurchaseBook(plan.exemptPurchaseBook!, bookInput)
    const entries = book.entries.map(({ counterpartyRut, ...entry }) => ({
      ...entry,
      counterpartyRut: String(counterpartyRut),
    }))
    expect(entries).toEqual([
      {
        ...placeholder,
        type: 30,
        folio: 120,
        taxRate: 0,
        netAmount: 5000,
        vatAmount: 0,
        nonRecoverableVat: [{ code: 1, amount: 950 }],
        totalAmount: 5950,
      },
      {
        ...placeholder,
        type: 33,
        folio: 77,
        taxRate: 0,
        exemptAmount: 3000,
        netAmount: 10000,
        vatAmount: 0,
        nonRecoverableVat: [{ code: 1, amount: 1900 }],
        totalAmount: 14900,
      },
      { ...placeholder, type: 32, folio: 9, exemptAmount: 2500, totalAmount: 2500 },
      {
        ...placeholder,
        type: 55,
        folio: 3,
        taxRate: 19,
        exemptAmount: 400,
        netAmount: 0,
        vatAmount: 0,
        referenceFolio: 120,
        referenceType: 30,
        totalAmount: 400,
      },
      {
        ...placeholder,
        type: 61,
        folio: 14,
        taxRate: 0,
        exemptAmount: 3000,
        netAmount: 10000,
        vatAmount: 0,
        nonRecoverableVat: [{ code: 1, amount: 1900 }],
        referenceFolio: 77,
        referenceType: 33,
        totalAmount: 14900,
      },
    ])
    expect(await validateAgainstXsd(book.xml, 'LibroCV')).toEqual([])
  })

  test('note observations: exempt invoice references, a note referencing a note, and no trailing folio', () => {
    const documents = [
      {
        documentText: 'FACTURA EXENTA',
        folio: 1,
        observation: null,
        exemptAmount: 100,
        affectedAmount: null,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
      {
        documentText: 'NOTA DE CREDITO',
        folio: 2,
        observation: 'NOTA DE CREDITO POR DESCUENTO FACTURA EXENTA ELECTRONICA 9',
        exemptAmount: 10,
        affectedAmount: null,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
      {
        documentText: 'NOTA DE DEBITO',
        folio: 3,
        observation: 'NOTA DE DEBITO POR INTERESES FACTURA EXENTA 1',
        exemptAmount: 5,
        affectedAmount: null,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
      {
        documentText: 'NOTA DE DEBITO',
        folio: 4,
        observation: 'NOTA DE DEBITO POR NOTA DE CREDITO 2',
        exemptAmount: null,
        affectedAmount: null,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
      {
        documentText: 'NOTA DE CREDITO',
        folio: 5,
        observation: 'NOTA DE CREDITO POR DESCUENTO SIN FOLIO',
        exemptAmount: 7,
        affectedAmount: null,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
      {
        documentText: 'FACTURA DE COMPRA ELECTRONICA',
        folio: 6,
        observation: 'COMPRA CON RETENCION TOTAL',
        exemptAmount: null,
        affectedAmount: 1000,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: true,
      },
      {
        documentText: 'NOTA DE CREDITO',
        folio: 7,
        observation: 'NOTA DE CREDITO POR DESCUENTO FACTURA 6',
        exemptAmount: null,
        affectedAmount: null,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
      {
        documentText: 'NOTA DE DEBITO',
        folio: 8,
        observation: 'NOTA DE DEBITO POR INTERESES FACTURA 1',
        exemptAmount: null,
        affectedAmount: null,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
      {
        documentText: 'FACTURA DE COMPRA ELECTRONICA',
        folio: 9,
        observation: 'COMPRA CON RETENCION TOTAL',
        exemptAmount: null,
        affectedAmount: null,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: true,
      },
      {
        documentText: 'FACTURA ELECTRONICA',
        folio: 10,
        observation: 'ENTREGA GRATUITA',
        exemptAmount: null,
        affectedAmount: null,
        commonUseVat: false,
        nonRecoverableVatCode: 4,
        totalWithholding: false,
      },
    ]
    const exemptBook = createCertificationPurchaseBook(
      { kind: 'exemptPurchaseBook', attentionNumber: '1', documents, proportionalityFactor: 0.6 },
      bookInput,
    )
    expect(
      exemptBook.entries.map((entry) => [
        entry.type,
        entry.folio,
        entry.referenceFolio,
        entry.referenceType,
        entry.exemptAmount,
        entry.netAmount,
        entry.totalAmount,
      ]),
    ).toEqual([
      [32, 1, undefined, undefined, 100, undefined, 100],
      [60, 2, 9, 34, 10, 0, 10],
      [55, 3, 1, 32, 5, 0, 5],
      [55, 4, 2, undefined, 10, 0, 10],
      [60, 5, undefined, undefined, 7, 0, 7],
      [46, 6, undefined, undefined, undefined, 1000, 1000],
      [60, 7, 6, 30, undefined, 1000, 1000],
      [55, 8, 1, 30, 100, 0, 100],
      [46, 9, undefined, undefined, undefined, 0, 0],
      [33, 10, undefined, undefined, undefined, 0, 0],
    ])
    expect(exemptBook.entries[6].nonRecoverableVat).toBeUndefined()
    expect(exemptBook.entries[9]).toMatchObject({
      taxRate: 0,
      vatAmount: 0,
      netAmount: 0,
      nonRecoverableVat: [{ code: 4, amount: 0 }],
    })
    const normalBook = createCertificationPurchaseBook(
      {
        kind: 'purchaseBook',
        attentionNumber: '1',
        documents: [...documents.slice(0, 3), documents[8], documents[9]],
        proportionalityFactor: 0.6,
      },
      bookInput,
    )
    expect(
      normalBook.entries.map((entry) => [
        entry.type,
        entry.referenceType,
        entry.taxRate,
        entry.netAmount,
        entry.vatAmount,
        entry.totalAmount,
      ]),
    ).toEqual([
      [30, undefined, 19, 0, 0, 100],
      [60, 34, 19, 0, 0, 10],
      [55, 30, 19, 0, 0, 5],
      [46, undefined, 19, 0, 0, 0],
      [33, undefined, 0, 0, 0, 0],
    ])
    expect(normalBook.entries[3]).toMatchObject({
      otherTaxes: [{ code: 15, rate: 19, amount: 0 }],
      totalVatWithheld: 0,
    })
    expect(normalBook.entries[4]).toMatchObject({ nonRecoverableVat: [{ code: 4, amount: 0 }] })
    const unreferenced = createCertificationPurchaseBook(
      { kind: 'exemptPurchaseBook', attentionNumber: '1', documents: [documents[3]], proportionalityFactor: 0.6 },
      bookInput,
    )
    expect(unreferenced.entries[0]).toMatchObject({ type: 55, referenceFolio: 2, netAmount: 0, totalAmount: 0 })
  })

  test('a document the detector does not know is rejected by phase 3', () => {
    const documents = [
      {
        documentText: 'BOLETA',
        folio: 1,
        observation: null,
        exemptAmount: null,
        affectedAmount: 10,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
    ]
    expect(() =>
      createCertificationPurchaseBook(
        { kind: 'purchaseBook', attentionNumber: '1', documents, proportionalityFactor: 0.6 },
        bookInput,
      ),
    ).toThrow(expect.objectContaining({ code: 'INVALID_DOCUMENT_TYPE' }))
  })
})

describe('the guide book', () => {
  let guide: IssuedSet
  beforeAll(async () => {
    guide = await issueTestSet(plan.guide!, issueOptions())
  })

  test('by position: a sale, a modified guide, a voided guide; notification folio 3; it validates', async () => {
    const book = createCertificationGuideBook(guide, { ...bookInput, receiver: bookReceiver })
    expect(book.cover).toMatchObject({ notificationFolio: 3, submission: 'total', period: '2026-11' })
    expect(
      book.entries.map(({ receiverRut, ...entry }) => ({
        ...entry,
        receiverRut: receiverRut === undefined ? undefined : String(receiverRut),
      })),
    ).toEqual([
      {
        folio: 1,
        transferType: 1,
        date: '2026-11-15',
        receiverRut: receiver.rut,
        receiverName: receiver.businessName,
        netAmount: 70000,
        taxRate: 19,
        vatAmount: 13300,
        totalAmount: 83300,
      },
      { folio: 2, transferType: 5, date: '2026-11-15', adjustment: 'add', taxRate: 0, vatAmount: 0, totalAmount: 0 },
      { folio: 3, transferType: 1, date: '2026-11-15', voided: 'guide', taxRate: 0, vatAmount: 0, totalAmount: 0 },
    ])
    expect(book.xml).toContain('<Operacion>1</Operacion>')
    expect(book.xml).toContain('<Anulado>2</Anulado>')
    expect(await validateAgainstXsd(book.xml, 'LibroGuia')).toEqual([])
  })

  test('flags given by the caller replace the defaults', () => {
    const book = createCertificationGuideBook(guide, {
      ...bookInput,
      receiver: bookReceiver,
      notificationFolio: 7,
      caseFlags: ['normal', 'normal', 'normal'],
    })
    expect(book.cover.notificationFolio).toBe(7)
    expect(book.entries[2]).toMatchObject({
      folio: 3,
      transferType: 1,
      netAmount: 60000,
      vatAmount: 11400,
      totalAmount: 71400,
    })
    expect(book.entries[1]).toMatchObject({ folio: 2, transferType: 5, totalAmount: 0 })
    expect(book.entries[1].adjustment).toBeUndefined()
  })

  test('a guide without a transfer reason counts as a sale, and a sale without net carries no amounts', () => {
    const [first] = guide.cases
    const stripped = {
      ...guide,
      cases: [
        { ...first, document: { ...first.document, header: { ...first.document.header, options: {} } } },
        {
          ...first,
          folio: 9,
          document: {
            ...first.document,
            header: { ...first.document.header, totals: { vatRate: 19, totalAmount: 0 } },
          },
        },
      ],
    }
    const book = createCertificationGuideBook(stripped, {
      ...bookInput,
      receiver: bookReceiver,
      caseFlags: ['normal', 'normal'],
    })
    expect(book.entries[0]).toMatchObject({ folio: 1, transferType: 1, netAmount: 70000 })
    expect(book.entries[1]).toMatchObject({
      folio: 9,
      transferType: 1,
      totalAmount: 0,
      receiverName: receiver.businessName,
    })
    expect(book.entries[1].netAmount).toBeUndefined()
  })

  test('refuses a set that is not the guide one', async () => {
    const basic = await issueTestSet(plan.basic!, issueOptions([cafFor(33), cafFor(61), cafFor(56)]))
    expect(() => createCertificationGuideBook(basic, { ...bookInput, receiver: bookReceiver })).toThrow(
      expect.objectContaining({ code: 'INVALID_OPTION' }),
    )
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/certification/books --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/certification/books'`.

- [ ] **Step 3: Write the implementation**

`src/certification/books.ts` (new file, whole):

```ts
import { createGuideBook, signGuideBook, type SignedGuideBook } from '../books/guide'
import { createPurchaseSalesBook, signPurchaseSalesBook, type SignedPurchaseSalesBook } from '../books/purchase-sales'
import { CERTIFICATION_COUNTERPARTY } from '../catalogs/certification'
import type { Certificate } from '../certificate/certificate'
import { DteError } from '../errors'
import type { BookEntryInput, GuideEntryInput } from '../model/book'
import type { IssuedSet } from './issue-set'
import type { PurchaseBookPlan } from './set-plan'
import { bookDocumentTypeOf, type TestBookDocument } from './set-text'

/**
 * EN: What every certification book needs.
 * ES: Lo que necesita cada libro de certificación.
 */
export type CertificationBookInput = {
  /** EN: Tax period `YYYY-MM`; the runner chooses it against the portal history. ES: `PeriodoTributario` — Período `AAAA-MM`; el runner lo elige contra el historial del portal. */
  readonly period: string
  readonly issuerRut: string
  readonly senderRut: string
  readonly resolution: { readonly number: number; readonly date: string }
  readonly certificate: Certificate
  /** EN: Clock for the book id and signature timestamp. ES: Reloj para el id del libro y la marca de la firma. */
  readonly now?: () => Date
}

/**
 * EN: The customer written on the sales and guide books.
 * ES: El cliente escrito en los libros de ventas y de guías.
 */
export type BookReceiver = { readonly rut: string; readonly name: string }

/**
 * EN: Options of `createCertificationSalesBook`.
 * ES: Opciones de `createCertificationSalesBook`.
 */
export type CertificationSalesBookInput = CertificationBookInput & {
  readonly receiver: BookReceiver
  /** EN: Credit notes as positive amounts (default) or negative. ES: Notas de crédito con montos positivos (por defecto) o negativos. */
  readonly creditNoteSign?: 'positive' | 'negative'
}

/** EN: How a guide enters the guide book. ES: Cómo entra una guía al libro de guías. */
export type GuideBookCaseFlag = 'normal' | 'modified' | 'voided'

/**
 * EN: Options of `createCertificationGuideBook`.
 * ES: Opciones de `createCertificationGuideBook`.
 */
export type CertificationGuideBookInput = CertificationBookInput & {
  readonly receiver: BookReceiver
  /** EN: `FolioNotificacion`; 3 by default. ES: `FolioNotificacion`; 3 por defecto. */
  readonly notificationFolio?: number
  /** EN: One flag per guide, by position; by default the second is `modified` and the third `voided`. ES: Un indicador por guía, por posición; por defecto la segunda es `modified` y la tercera `voided`. */
  readonly caseFlags?: readonly GuideBookCaseFlag[]
}

const VAT_RATE = 19
const PURCHASE_INVOICE = 46
const PAPER_EXEMPT_INVOICE = 32
const NOTE_TYPES: readonly number[] = [55, 56, 60, 61]
const DEFAULT_NOTIFICATION_FOLIO = 3

const vatOf = (affected: number): number => Math.round((affected * VAT_RATE) / 100)
const documentDate = (period: string): string => `${period}-15`

const compact = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T

/**
 * EN: The sales book of the certification: only the basic set's invoices and notes, dated the 15th of the period,
 * with the customer as counterparty, every amount present (0 when absent) and the VAT rate on every line, as the
 * field sends it. Book `MENSUAL`, submission `TOTAL`.
 * ES: El libro de ventas de la certificación: solo las facturas y notas del set básico, con fecha 15 del período, el
 * cliente como contraparte, todo monto presente (0 si falta) y la tasa de IVA en cada línea, como lo envía el campo.
 * Libro `MENSUAL`, envío `TOTAL`.
 * @throws {DteError} EN: `INVALID_OPTION` (field `set`) when the set is not the basic one; the phase 3 codes. ES: `INVALID_OPTION` (campo `set`) si el set no es el básico; los códigos de la fase 3.
 */
export const createCertificationSalesBook = (
  set: IssuedSet,
  input: CertificationSalesBookInput,
): SignedPurchaseSalesBook => {
  if (set.kind !== 'basic') throw new DteError('INVALID_OPTION', { field: 'set', kind: set.kind })
  const entries: BookEntryInput[] = set.cases.map((issued) => {
    const totals = issued.document.header.totals
    const sign = issued.type === 61 && input.creditNoteSign === 'negative' ? -1 : 1
    const amount = (value: number | undefined): number => Math.round((value ?? 0) * sign)
    return {
      type: issued.type,
      folio: issued.folio,
      date: documentDate(input.period),
      counterpartyRut: input.receiver.rut,
      counterpartyName: input.receiver.name,
      exemptAmount: amount(totals.exemptAmount),
      netAmount: amount(totals.netAmount),
      vatAmount: amount(totals.vatAmount),
      totalAmount: amount(totals.totalAmount),
      taxRate: VAT_RATE,
    }
  })
  const book = createPurchaseSalesBook({
    cover: {
      issuerRut: input.issuerRut,
      senderRut: input.senderRut,
      period: input.period,
      resolutionDate: input.resolution.date,
      resolutionNumber: input.resolution.number,
      operation: 'sale',
      kind: 'monthly',
      submission: 'total',
    },
    entries,
    now: input.now?.(),
  })
  return signPurchaseSalesBook(book, input.certificate)
}

const referenceTypeOf = (observation: string, exemptBook: boolean): number | undefined => {
  const upper = observation.toUpperCase()
  if (upper.includes('FACTURA EXENTA ELECTRONICA')) return 34
  if (upper.includes('FACTURA EXENTA')) return exemptBook ? PAPER_EXEMPT_INVOICE : 30
  if (upper.includes('FACTURA') && upper.includes('ELECTRONICA')) return 33
  if (upper.includes('FACTURA')) return 30
  return undefined
}

type PurchaseEntry = BookEntryInput & { readonly nonRecoverableAmount: number }

const purchaseEntry = (document: TestBookDocument, period: string, exemptBook: boolean): PurchaseEntry => {
  const detected = bookDocumentTypeOf(document.documentText) ?? 0
  const exempt = document.exemptAmount ?? 0
  const affected = document.affectedAmount ?? 0
  const type = exemptBook && detected === 30 && exempt > 0 && affected === 0 ? PAPER_EXEMPT_INVOICE : detected
  const vat = vatOf(affected)
  const trailingFolio = /(\d+)\s*$/.exec(document.observation ?? '')
  const reference =
    NOTE_TYPES.includes(type) && document.observation !== null && trailingFolio !== null
      ? {
          referenceFolio: parseInt(trailingFolio[1], 10),
          referenceType: referenceTypeOf(document.observation, exemptBook),
        }
      : {}

  let entry: BookEntryInput = compact({
    type,
    folio: document.folio,
    date: documentDate(period),
    counterpartyRut: CERTIFICATION_COUNTERPARTY.rut,
    counterpartyName: CERTIFICATION_COUNTERPARTY.name,
    taxRate: VAT_RATE,
    exemptAmount: exempt > 0 ? exempt : undefined,
    netAmount: affected > 0 ? affected : undefined,
    vatAmount: affected > 0 ? vat : undefined,
    ...reference,
  })
  let nonRecoverableAmount = 0
  if (document.commonUseVat) entry = { ...entry, commonUseVat: vat, taxKind: 'vat' }
  if (document.nonRecoverableVatCode !== null) {
    entry = { ...entry, nonRecoverableVat: [{ code: 4, amount: vat }] }
    nonRecoverableAmount = vat
  }
  if (document.totalWithholding && type === PURCHASE_INVOICE)
    entry = { ...entry, otherTaxes: [{ code: 15, rate: VAT_RATE, amount: vat }], totalVatWithheld: vat }
  if (exemptBook) {
    if (type !== PURCHASE_INVOICE && affected > 0) {
      entry = { ...entry, nonRecoverableVat: [{ code: 1, amount: vat }], vatAmount: 0 }
      nonRecoverableAmount = vat
    } else if (type === PAPER_EXEMPT_INVOICE) {
      const { taxRate, netAmount, vatAmount, nonRecoverableVat, ...rest } = entry
      void taxRate
      void netAmount
      void vatAmount
      void nonRecoverableVat
      entry = rest
    } else if (affected === 0) {
      entry = { ...entry, taxRate: VAT_RATE, netAmount: 0, vatAmount: 0 }
    }
  }
  const total =
    document.totalWithholding && type === PURCHASE_INVOICE
      ? (entry.netAmount ?? 0)
      : (entry.netAmount ?? 0) +
        (entry.vatAmount ?? 0) +
        (entry.exemptAmount ?? 0) +
        (exemptBook ? nonRecoverableAmount : 0)
  return { ...entry, totalAmount: total, nonRecoverableAmount }
}

const inheritFromReferenced = (entries: readonly PurchaseEntry[]): readonly PurchaseEntry[] =>
  entries.map((entry) => {
    if (!NOTE_TYPES.includes(entry.type) || entry.netAmount || entry.exemptAmount || entry.referenceFolio === undefined)
      return entry
    const referenced = entries.find((candidate) => candidate.folio === entry.referenceFolio)
    if (referenced === undefined) return entry
    const nonRecoverable =
      referenced.nonRecoverableVat === undefined
        ? undefined
        : [{ code: 1 as const, amount: referenced.nonRecoverableAmount }]
    const inherited = compact({
      ...entry,
      exemptAmount: referenced.exemptAmount,
      netAmount: referenced.netAmount,
      nonRecoverableVat: nonRecoverable,
      nonRecoverableAmount: referenced.nonRecoverableAmount,
    })
    return {
      ...inherited,
      totalAmount: (inherited.netAmount ?? 0) + (inherited.exemptAmount ?? 0) + inherited.nonRecoverableAmount,
    }
  })

const settleRate = (entry: PurchaseEntry): BookEntryInput => {
  const { nonRecoverableAmount, ...fields } = entry
  void nonRecoverableAmount
  if (fields.commonUseVat !== undefined) return { ...fields, taxRate: 0, vatAmount: 0 }
  if (fields.nonRecoverableVat !== undefined)
    return { ...fields, taxRate: 0, vatAmount: 0, netAmount: fields.netAmount ?? 0 }
  if (fields.taxRate !== undefined && !((fields.netAmount ?? 0) > 0)) return { ...fields, netAmount: 0, vatAmount: 0 }
  return fields
}

/**
 * EN: A purchase book of the certification from a purchase-book set: one line per supplier document with the SII's
 * placeholder counterparty, the VAT at 19 % of the affected amount, common-use VAT, non-recoverable VAT for free
 * deliveries, the withholding of a purchase invoice, the referenced folio of a note from its observation, and, for the
 * exempt taxpayers' book, non-recoverable VAT on every affected line, the paper exempt invoice as type 32 and notes
 * inheriting the amounts of the document they reference. Totals follow the field formula. Book `MENSUAL`, submission
 * `TOTAL`, the proportionality factor of the set.
 * ES: Un libro de compras de la certificación desde un set de libro de compras: una línea por documento de proveedor
 * con la contraparte de relleno del SII, el IVA al 19 % del afecto, IVA de uso común, IVA no recuperable en entregas
 * gratuitas, la retención de una factura de compra, el folio referido de una nota tomado de su observación y, en el
 * libro para exentos, IVA no recuperable en toda línea afecta, la factura exenta en papel como tipo 32 y notas que
 * heredan los montos del documento que refieren. Los totales siguen la fórmula del campo. Libro `MENSUAL`, envío `TOTAL`,
 * el factor de proporcionalidad del set.
 * @throws {DteError} EN: the phase 3 codes (`INVALID_DOCUMENT_TYPE` for a document the detector does not know). ES: los códigos de la fase 3 (`INVALID_DOCUMENT_TYPE` para un documento que el detector no conoce).
 */
export const createCertificationPurchaseBook = (
  plan: PurchaseBookPlan,
  input: CertificationBookInput,
): SignedPurchaseSalesBook => {
  const exemptBook = plan.kind === 'exemptPurchaseBook'
  const raw = plan.documents.map((document) => purchaseEntry(document, input.period, exemptBook))
  const entries = (exemptBook ? inheritFromReferenced(raw) : raw).map(settleRate)
  const book = createPurchaseSalesBook({
    cover: {
      issuerRut: input.issuerRut,
      senderRut: input.senderRut,
      period: input.period,
      resolutionDate: input.resolution.date,
      resolutionNumber: input.resolution.number,
      operation: 'purchase',
      kind: 'monthly',
      submission: 'total',
    },
    entries,
    commonUseVatFactor: plan.proportionalityFactor,
    now: input.now?.(),
  })
  return signPurchaseSalesBook(book, input.certificate)
}

const defaultFlag = (index: number): GuideBookCaseFlag => (index === 1 ? 'modified' : index === 2 ? 'voided' : 'normal')

/**
 * EN: The guide book of the certification: only the guide set's guides, with their transfer reason and issue date;
 * by position the second guide carries `Operacion` 1 and the third is voided (`Anulado` 2, total 0 and nothing else),
 * unless `caseFlags` says otherwise; a sale carries the customer, the net, the VAT rate and the VAT; every guide its
 * total. Notification folio 3 by default, book `ESPECIAL`, submission `TOTAL`.
 * ES: El libro de guías de la certificación: solo las guías del set de guías, con su tipo de traslado y fecha de
 * emisión; por posición la segunda lleva `Operacion` 1 y la tercera va anulada (`Anulado` 2, total 0 y nada más), salvo
 * que `caseFlags` diga otra cosa; una venta lleva el cliente, el neto, la tasa y el IVA; toda guía su total. Folio de
 * notificación 3 por defecto, libro `ESPECIAL`, envío `TOTAL`.
 * @throws {DteError} EN: `INVALID_OPTION` (field `set`) when the set is not the guide one; the phase 3 codes. ES: `INVALID_OPTION` (campo `set`) si el set no es el de guías; los códigos de la fase 3.
 */
export const createCertificationGuideBook = (set: IssuedSet, input: CertificationGuideBookInput): SignedGuideBook => {
  if (set.kind !== 'guide') throw new DteError('INVALID_OPTION', { field: 'set', kind: set.kind })
  const entries: GuideEntryInput[] = set.cases.map((issued, index) => {
    const flag = input.caseFlags?.[index] ?? defaultFlag(index)
    const header = issued.document.header
    const transferType = header.options.transferType ?? 1
    if (flag === 'voided')
      return { folio: issued.folio, transferType, date: header.issueDate, voided: 'guide', totalAmount: 0 }
    const net = header.totals.netAmount ?? 0
    const sale =
      transferType === 1
        ? compact({
            receiverRut: input.receiver.rut,
            receiverName: input.receiver.name,
            netAmount: net > 0 ? net : undefined,
            taxRate: net > 0 ? VAT_RATE : undefined,
            vatAmount: net > 0 ? header.totals.vatAmount : undefined,
          })
        : {}
    return compact({
      folio: issued.folio,
      transferType,
      date: header.issueDate,
      adjustment: flag === 'modified' ? ('add' as const) : undefined,
      ...sale,
      totalAmount: header.totals.totalAmount,
    })
  })
  const book = createGuideBook({
    cover: {
      issuerRut: input.issuerRut,
      senderRut: input.senderRut,
      period: input.period,
      resolutionDate: input.resolution.date,
      resolutionNumber: input.resolution.number,
      notificationFolio: input.notificationFolio ?? DEFAULT_NOTIFICATION_FOLIO,
      submission: 'total',
    },
    entries,
    now: input.now?.(),
  })
  return signGuideBook(book, input.certificate)
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/certification/books --coverage=false
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/certification/books.ts tests/certification/books.test.ts
```

```bash
git commit -F - <<'MSG'
feat: the three certification books

The sales book from the issued basic set, the purchase book and the purchase book for exempt
taxpayers from the parsed purchase-book sets with the field rules for VAT, non-recoverable VAT,
common-use VAT, withholding, references and inherited note amounts, and the guide book from the
issued guide set with the position flags, all built and signed through phase 3.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 7: Public API, size cap and documentation

The thirteen runtime names and the types on the root entry and in `RUNTIME_EXPORTS` (spec 3.9), the type tests, the bundle limit at 64 kB (D64), the README section, `llms.txt` and the changelog (spec 3.12).

**Files:**

- Modify: `src/index.ts`
- Modify: `.size-limit.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `llms.txt`
- Test (modify): `tests/public-api.test.ts`
- Test (modify): `tests/types.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/public-api.test.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/public-api.test.ts b/tests/public-api.test.ts
index a295866..a6d1b1c 100644
--- a/tests/public-api.test.ts
+++ b/tests/public-api.test.ts
@@ -5,6 +5,19 @@ import * as sdk from '../src'
  * the CHANGELOG in the same commit.
  */
 const RUNTIME_EXPORTS = [
+  'CERTIFICATION_COUNTERPARTY',
+  'TEST_SET_ENVELOPE_ID',
+  'TEST_SET_KINDS',
+  'TEST_SET_PORTAL_NAMES',
+  'TEST_SET_REFERENCE_TYPE',
+  'createCertificationGuideBook',
+  'createCertificationPurchaseBook',
+  'createCertificationSalesBook',
+  'createFolioAllocator',
+  'issueSimulation',
+  'issueTestSet',
+  'parseTestSetText',
+  'planCertificationSets',
   'errorCode',
   'findEnvelopeFiles',
   'needsTransferableCopy',
```

`tests/types.test.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/types.test.ts b/tests/types.test.ts
index 41fb4e7..2a98132 100644
--- a/tests/types.test.ts
+++ b/tests/types.test.ts
@@ -35,8 +35,20 @@ import {
   renderPrintedSamples,
   writePrintedSamples,
   needsTransferableCopy,
+  parseTestSetText,
+  planCertificationSets,
+  createFolioAllocator,
+  issueTestSet,
+  issueSimulation,
+  createCertificationSalesBook,
+  createCertificationGuideBook,
 } from '../src'
 import type {
+  TestSet,
+  CertificationPlan,
+  FolioSource,
+  IssuedSet,
+  IssuedSimulation,
   PrintableDocument,
   PrintedSamplesResult,
   WritePrintedSamplesResult,
@@ -185,6 +197,13 @@ const _typecheck = () => {
   expectTypeOf(renderTedBarcode).returns.resolves.toEqualTypeOf<Uint8Array>()
   expectTypeOf(renderPrintedSamples).returns.resolves.toEqualTypeOf<PrintedSamplesResult>()
   expectTypeOf(writePrintedSamples).returns.resolves.toEqualTypeOf<WritePrintedSamplesResult>()
+  expectTypeOf(parseTestSetText).returns.toEqualTypeOf<readonly TestSet[]>()
+  expectTypeOf(planCertificationSets).returns.toEqualTypeOf<CertificationPlan>()
+  expectTypeOf(createFolioAllocator).returns.toEqualTypeOf<FolioSource>()
+  expectTypeOf(issueTestSet).returns.resolves.toEqualTypeOf<IssuedSet>()
+  expectTypeOf(issueSimulation).returns.resolves.toEqualTypeOf<IssuedSimulation>()
+  expectTypeOf(createCertificationSalesBook).returns.toEqualTypeOf<SignedPurchaseSalesBook>()
+  expectTypeOf(createCertificationGuideBook).returns.toEqualTypeOf<SignedGuideBook>()
   expectTypeOf<PurchaseSalesBook['periodTotals']>().toEqualTypeOf<readonly BookTotals[] | null>()
   expectTypeOf<GuideBook['periodTotals']>().toEqualTypeOf<GuideTotals | null>()
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/public-api tests/types --coverage=false
```

Expected: FAIL: `the public API exports exactly the documented runtime names` lists the thirteen names missing from the root, and the type test does not compile.

- [ ] **Step 3: Write the implementation**

`src/index.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/index.ts b/src/index.ts
index 3500e1e..dfaaed0 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -418,3 +418,45 @@ export type {
 } from './pdf/samples'
 export { findEnvelopeFiles, writePrintedSamples } from './pdf/node-samples'
 export type { WritePrintedSamplesInput, WritePrintedSamplesResult, WrittenPrintedSample } from './pdf/node-samples'
+
+export {
+  TEST_SET_KINDS,
+  TEST_SET_PORTAL_NAMES,
+  TEST_SET_REFERENCE_TYPE,
+  CERTIFICATION_COUNTERPARTY,
+} from './catalogs/certification'
+export type { TestSetKind } from './catalogs/certification'
+export { parseTestSetText } from './certification/set-text'
+export type { TestSet, TestCase, TestCaseItem, TestBookDocument } from './certification/set-text'
+export { planCertificationSets } from './certification/set-plan'
+export type {
+  CertificationPlan,
+  BasicSetPlan,
+  ExemptSetPlan,
+  GuideSetPlan,
+  PurchaseSetPlan,
+  PurchaseBookPlan,
+  PlannedInvoice,
+  PlannedNote,
+  PlannedGuide,
+  PlannedItem,
+  SetFolios,
+} from './certification/set-plan'
+export { createFolioAllocator } from './certification/folios'
+export type { FolioSource, FolioAllocatorOptions } from './certification/folios'
+export { issueTestSet, TEST_SET_ENVELOPE_ID } from './certification/issue-set'
+export type { IssueSetOptions, IssuableSetPlan, IssuedCase, IssuedSet } from './certification/issue-set'
+export { issueSimulation } from './certification/simulation'
+export type { IssuedSimulation } from './certification/simulation'
+export {
+  createCertificationSalesBook,
+  createCertificationPurchaseBook,
+  createCertificationGuideBook,
+} from './certification/books'
+export type {
+  CertificationBookInput,
+  CertificationSalesBookInput,
+  CertificationGuideBookInput,
+  BookReceiver,
+  GuideBookCaseFlag,
+} from './certification/books'
```

`.size-limit.json` (save the diff and run `git apply`):

```diff
diff --git a/.size-limit.json b/.size-limit.json
index dfbd7f6..2367a49 100644
--- a/.size-limit.json
+++ b/.size-limit.json
@@ -2,11 +2,11 @@
   {
     "name": "ESM (min + brotli)",
     "path": "dist/esm/index.min.js",
-    "limit": "54 kB"
+    "limit": "64 kB"
   },
   {
     "name": "CJS (min + brotli)",
     "path": "dist/cjs/index.min.js",
-    "limit": "54 kB"
+    "limit": "64 kB"
   }
 ]
```

`README.md` (save the diff and run `git apply`):

```diff
diff --git a/README.md b/README.md
index d677837..c29f1e7 100644
--- a/README.md
+++ b/README.md
@@ -231,6 +231,27 @@ and what to do; the composite flows return it as data, so the CAFs already obtai
 refusal pages were measured against the real SII, but the pages of an enrolled company (quota, CAF, folio ranges) have not
 been seen yet: see the phase 4 design.
 
+## Certification: test sets, simulation and books
+
+```typescript
+import { parseTestSetText, planCertificationSets, createFolioAllocator, issueTestSet, issueSimulation, createCertificationSalesBook } from 'dte-sdk'
+
+const plan = planCertificationSets(parseTestSetText(setText)) // the text the SII generated for the applicant
+const options = { issuer, receiver, certificate, folios: createFolioAllocator(cafs), resolution: { number: 0, date: '2026-01-01' } }
+const basic = await issueTestSet(plan.basic!, options) // documents and the signed envelope, with the SET references
+const sales = createCertificationSalesBook(basic, { period: '2026-11', issuerRut, senderRut, resolution, certificate, receiver: { rut, name } })
+const simulation = await issueSimulation(plan, { ...options, folios: createFolioAllocator(freshCafs) })
+```
+
+The SII test set is parsed line by line into cases; `planCertificationSets` turns them into what each set issues and the
+folios each type needs; `issueTestSet` issues the basic, exempt, guide and purchase sets through the phase 1 functions
+with the `SET` reference (`CASO <id>`) and the rules the SII review expects (returned goods at the original price,
+cancellations taking the cancelled document's items, the issuer as receiver of purchase invoices and internal
+transfers); `issueSimulation` re-issues every case in one envelope; the three `createCertification*Book` functions
+build and sign the sales, purchase and guide books. Everything is data: sending, waiting for the status and declaring
+belong to the certification runner. No real test-set text was available while writing this: the grammar follows the
+sets the SII delivers in the field, and the first download should be kept as a fixture.
+
 ## Printed samples (Node)
 
 ```typescript
```

`CHANGELOG.md` (save the diff and run `git apply`):

```diff
diff --git a/CHANGELOG.md b/CHANGELOG.md
index 945976e..c35e151 100644
--- a/CHANGELOG.md
+++ b/CHANGELOG.md
@@ -75,6 +75,13 @@ and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0
   `renderPrintedSamples` (in-memory batch classified into the test and simulation sets, failures as data) and the Node
   adapter `writePrintedSamples`/`findEnvelopeFiles` (`SET-PRUEBAS` and `SET-SIMULACION` on disk). Dependencies `pdf-lib`
   and `bwip-js`, loaded on first use. Error codes `DEPENDENCY_UNAVAILABLE` and `PDF_RENDER_FAILED`, and `errorCode`.
+- Certification, the deterministic half: `parseTestSetText` (the SII test-set text to typed sets and cases),
+  `planCertificationSets`, `createFolioAllocator` (a `FolioSource` over one or several CAFs), `issueTestSet` (the
+  basic, exempt, guide and purchase sets through phase 1, with the `SET` reference and the field rules), `issueSimulation`
+  (every case again in one envelope) and `createCertificationSalesBook`, `createCertificationPurchaseBook`,
+  `createCertificationGuideBook` through phase 3. Catalog `TEST_SET_KINDS`, `TEST_SET_PORTAL_NAMES`,
+  `TEST_SET_REFERENCE_TYPE`, `TEST_SET_ENVELOPE_ID`, `CERTIFICATION_COUNTERPARTY`. `DocumentInput.withholdVat` withholds
+  the VAT on the notes of a purchase invoice. Bundle limit to 64 kB.
   A folio that is not a run of digits is an `INVALID_FOLIO` failure of its document and never names a file, and the
   Node adapter refuses a sample path outside the folder of its set.
```

`llms.txt` (save the diff and run `git apply`):

```diff
diff --git a/llms.txt b/llms.txt
index 0e34ec9..5194d74 100644
--- a/llms.txt
+++ b/llms.txt
@@ -8,6 +8,8 @@ The SII web services client is `createSiiClient({ environment, certificate, comp
 
 The SII books are `createPurchaseSalesBook` (IECV, `LibroCompraVenta`), `createGuideBook` (`LibroGuia`) and `createFolioConsumption` (RCOF, `ConsumoFolios`), each with `build*Xml`, `sign*`, `verify*Signature` and `toSii*`. All submission kinds of the schemas are covered, and the SDK computes the summaries from the lines; `summaryOnlyTotals` and `previousTotals` carry what cannot be derived. An explicit line total that differs from the SII formula is kept and reported in `totalMismatches`, and `strictTotals: true` throws `BOOK_TOTAL_MISMATCH` instead. `bookEntryFromDocument`, `guideEntryFromDocument` and `folioConsumptionEntryFromDocument` derive the lines from issued documents. The signed XML goes to `uploadBook` or `uploadFolioConsumption`. The RCV replaced the IECV in production from period 2017-08, the guide book is sent only on SII request, and the report is used in the receipts certification; the SII probably no longer requires it in production.
 
+Certification (deterministic half): `parseTestSetText` parses the SII test-set text into sets and cases; `planCertificationSets` gives what each set issues and the folios per type; `createFolioAllocator` hands out folios with the CAF that stamps them; `issueTestSet` issues the basic, exempt, guide and purchase sets through phase 1 with the `SET` reference (`CASO <id>`) and the field rules; `issueSimulation` re-issues every case in one envelope; `createCertificationSalesBook`, `createCertificationPurchaseBook` and `createCertificationGuideBook` build and sign the books through phase 3. Nothing sends: the runner does.
+
 Printed samples (Node only): `parsePrintableDocuments` turns any `EnvioDTE`, `EnvioBOLETA`, bare `SetDTE` or bare `DTE` XML into printable documents with each `TED` copied verbatim; `renderPrintedSample` draws one single-page PDF per the SII printed-samples manual (21.5 cm wide, 11 to 33 cm tall, red type box, acknowledgement box and `CEDIBLE` mark on the transferable copy of 33, 34, 43, 46 and sale guides, PDF417 stamp with the signed bytes and its legends); `renderTedBarcode` gives the stamp PNG alone; `renderPrintedSamples` batches envelopes in memory into the test and simulation sets with failures as data; `writePrintedSamples` and `findEnvelopeFiles` do the same over files (`SET-PRUEBAS`, `SET-SIMULACION`). `pdf-lib` and `bwip-js` load on first use.
 
 The SII portal is `createPortalClient({ environment, certificate, companyRut })` plus free functions, on Node ≥ 20 (client certificate over `https`; TLS 1.2, server verified). The certificate must be enabled as a login method at sii.cl, or the login throws `SII_PORTAL_CERT_NOT_ENABLED`. Session: `openPortalSession`, `closePortalSession`, or on demand; `sessionCache` and `lock` are ports for several replicas. Company data: `fetchCompanyResolution` (per environment), `fetchTaxpayerData`, `fetchIssuerProfile`, `queryCertificationSets`. Folios: `listStampableTypes`, `queryFolioQuota` (`MAX_AUTOR`, `FOLIOS_DISP`; stamps nothing), `requestCaf` (may grant less than asked; read `granted`), `listFolioRanges`, `annulFolios` (explicit scope required; `maxRanges` limits one call; irreversible; counts against the quota for six months), `listReobtainableRanges`, `reobtainCaf`. Composite flows return refusals as data: `requestCafExact`, `requestCafInBatches`, `reobtainFolios`. Refusals are `SII_PORTAL_REJECTED` with `details.rejection` and `portalRejectionMessage`. `createFolioRegistry`, `createMemoryFolioRegistry` and `createDirectoryFolioRegistry` track folios locally. The CAF XML holds a private key: treat it as a secret.
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/public-api tests/types --coverage=false
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/index.ts .size-limit.json README.md CHANGELOG.md llms.txt tests/public-api.test.ts tests/types.test.ts
```

```bash
git commit -F - <<'MSG'
feat: export the certification sets, simulation and books

The thirteen runtime names and their types on the root entry, in the public API list and the
type tests; the bundle limit at 64 kB; README, llms.txt and the changelog describe the surface
and that sending and declaring belong to the runner.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Measurements

Minified and brotli-compressed, whole bundle:

| After | ESM | CJS |
|---|---|---|
| Phase 1 | under 16 kB | under 16 kB |
| Phase 2 | 25.65 kB | 25.9 kB |
| Phase 3 | 31.85 kB | 32.07 kB |
| Phase 4 | 44.45 kB | 44.64 kB |
| Phase 5a | 50.15 kB | 50.26 kB |
| Phase 5b-1 | 56.17 kB | 56.3 kB |

## What this leaves open

- **The set text.** No sample exists in any source; the grammar is the one that parses the field downloads. The runner
  of phase 5b-2 keeps the downloaded text as an artefact so the first real run turns it into a fixture here.
- **The SII's acceptance** of the envelopes and books: it needs the company enrolled and the runner.
- **Deferred on purpose** (spec section 7): one receiver for every invoice, the sales and purchase books as `MENSUAL`
  without a notification folio, the placeholder counterparty of the purchase books, `FolioRef 1` on the SET
  reference, the exempt set without `TasaIVA`, the silent drop of unknown set lines, the export and settlement sets
  parsed and never issued.
- **The private differential harness** of spec 3.11 was not run during this plan; the rules were checked one by one
  against the field behaviour described in the spec.

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

Expected: all pass, 1 907 tests, 100 % on the four metrics, ESM about 56.17 kB and CJS about 56.3 kB against the 64 kB limit.

- [ ] **Step 2: Read the diff against `canary` once**

Nothing public may name a third-party implementation, and no RUT, certificate or local path may appear outside the allow-list. `npm run scan` covers the last part; the first is yours to check.

- [ ] **Step 3: Open the pull request against `canary`**

The body explains the certification surface (parser, plan, folio source, the four sets, the simulation, the three books), the `withholdVat` option added to phase 1, the 64 kB cap, lists the decisions of spec section 5 and the deferred items of section 7, and states plainly that no real set text was available and nothing has been submitted to the SII. Squash-merge is how this repository integrates, and merging is Hans's call.

- [ ] **Step 4: Record what stays open**

Add to [issue 8](https://github.com/arrowsw/dte-sdk/issues/8) the live proof the certification sets still need before the first release that ships them: the company enrolled, the real set text kept as a fixture, the four envelopes and the books accepted by the SII through the runner of phase 5b-2. Post the bundle sizes on [issue 5](https://github.com/arrowsw/dte-sdk/issues/5).
