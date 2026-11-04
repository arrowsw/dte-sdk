import fc from 'fast-check'
import { createFolioAllocator } from '../../src/certification/folios'
import { issueTestSet, issuerAsReceiver, type IssuedSet } from '../../src/certification/issue-set'
import type { BasicSetPlan } from '../../src/certification/set-plan'
import { calculateTotals } from '../../src/totals/calculate'
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

test("random quantities and prices keep every document's totals consistent with calculateTotals", async () => {
  const item = fc.record({
    name: fc.constantFrom('Caja', 'Saco', 'Tubo'),
    quantity: fc.integer({ min: 1, max: 500 }),
    unitPrice: fc.integer({ min: 0, max: 100000 }),
    discountPercent: fc.option(fc.integer({ min: 0, max: 50 }), { nil: undefined }),
  })
  await fc.assert(
    fc.asyncProperty(fc.array(item, { minLength: 1, maxLength: 4 }), async (items) => {
      const random: BasicSetPlan = {
        kind: 'basic',
        attentionNumber: ATTENTION,
        invoices: [{ caseId: id(1), items }],
        creditNotes: [],
        debitNotes: [],
        folios: { 33: 1 },
      }
      const issued = await issueTestSet(random, issueOptions())
      const document = issued.cases[0].document
      expect(document.header.totals).toEqual(calculateTotals(document.items, { type: 33, vatRate: 19 }))
    }),
    { numRuns: 10 },
  )
})
