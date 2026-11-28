import { createFolioConsumption } from '../../src/books/folio-consumption'
import {
  bookEntryFromDocument,
  folioConsumptionEntryFromDocument,
  guideEntryFromDocument,
} from '../../src/books/from-document'
import { createGuideBook } from '../../src/books/guide'
import { createPurchaseSalesBook, signPurchaseSalesBook } from '../../src/books/purchase-sales'
import { FOREIGN_RECEIVER_RUT } from '../../src/catalogs/codes'
import { createDocument } from '../../src/document/create'
import type { Document, DocumentInput, Withholding } from '../../src/model/document'
import { certificate, guideCover, reportCover, saleCover, purchaseCover, SUPPLIER_RUT } from '../support/book-fixtures'
import { FIXED_NOW, ISSUER_RUT, RECEIVER_RUT } from '../support/fixtures'
import { validateAgainstXsd } from '../support/xsd'

const issuer = {
  rut: ISSUER_RUT,
  businessName: 'Comercial Andina SpA',
  businessActivity: 'Software',
  address: 'Av. Los Aromos 1540',
  commune: 'Ñuñoa',
  activityCode: 620200,
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
    const issued = bookEntryFromDocument(document, { bookRut: ISSUER_RUT, operation: 'purchase' })
    expect(issued).toMatchObject({
      counterpartyRut: SUPPLIER_RUT,
      netAmount: 100000,
      vatAmount: 19000,
      otherTaxes: [{ code: 15, rate: 19, amount: 19000 }],
      totalAmount: 100000,
    })
    // `IVARetTotal` is a field of the sales detail: the purchase line of who issued the invoice does not carry it.
    expect(issued.totalVatWithheld).toBeUndefined()
    expect(createPurchaseSalesBook({ cover: purchaseCover, entries: [issued] }).totalMismatches).toEqual([])
  })

  test('the supplier who receives a purchase invoice reports the withheld VAT in the field of the sales detail', () => {
    const document = createDocument({
      ...base,
      type: 46,
      receiver: { ...receiver, rut: SUPPLIER_RUT, businessName: 'Hortalizas del Maule Ltda' },
    })
    const received = bookEntryFromDocument(document, { bookRut: SUPPLIER_RUT, operation: 'sale' })
    expect(received).toMatchObject({ counterpartyRut: ISSUER_RUT, totalVatWithheld: 19000, totalAmount: 100000 })
    expect(received.otherTaxes).toBeUndefined()
    expect(
      createPurchaseSalesBook({ cover: { ...saleCover, issuerRut: SUPPLIER_RUT }, entries: [received] })
        .totalMismatches,
    ).toEqual([])
  })

  test('on a sale line every withholding of VAT takes a field of the sales detail, and none stays in the other taxes', () => {
    const invoice = (withholdings: readonly Withholding[], totalAmount: number) =>
      createDocument({
        ...base,
        type: 46,
        receiver: { ...receiver, rut: SUPPLIER_RUT, businessName: 'Hortalizas del Maule Ltda' },
        totals: { netAmount: 100000, vatRate: 19, vatAmount: 19000, withholdings, totalAmount },
      })
    const supplierBook = { bookRut: SUPPLIER_RUT, operation: 'sale' } as const
    const cover = { ...saleCover, issuerRut: SUPPLIER_RUT }

    // Timber (code 33) withholds 8 points of the 19: the supplier is paid the total less that part.
    const partial = invoice([{ taxCode: 33, rate: 8, amount: 8000 }], 111000)
    const received = bookEntryFromDocument(partial, supplierBook)
    expect(received).toMatchObject({ partialVatWithheld: 8000, totalAmount: 111000 })
    expect(received.otherTaxes).toBeUndefined()
    expect(received.totalVatWithheld).toBeUndefined()
    expect(createPurchaseSalesBook({ cover, entries: [received] }).totalMismatches).toEqual([])

    // Who issued it reports the same withholding under its code, and both books add up.
    const issued = bookEntryFromDocument(partial, { bookRut: ISSUER_RUT, operation: 'purchase' })
    expect(issued).toMatchObject({ otherTaxes: [{ code: 33, rate: 8, amount: 8000 }], totalAmount: 111000 })
    expect(issued.partialVatWithheld).toBeUndefined()
    expect(createPurchaseSalesBook({ cover: purchaseCover, entries: [issued] }).totalMismatches).toEqual([])

    // The whole VAT withheld under a code by product is a whole withholding all the same.
    const whole = bookEntryFromDocument(invoice([{ taxCode: 39, rate: 19, amount: 19000 }], 100000), supplierBook)
    expect(whole).toMatchObject({ totalVatWithheld: 19000, totalAmount: 100000 })
    expect(whole.partialVatWithheld).toBeUndefined()
    expect(whole.otherTaxes).toBeUndefined()
    expect(createPurchaseSalesBook({ cover, entries: [whole] }).totalMismatches).toEqual([])

    // A tax that withholds no VAT stays in the other taxes beside it.
    const mixed = bookEntryFromDocument(
      invoice(
        [
          { taxCode: 33, rate: 8, amount: 8000 },
          { taxCode: 24, rate: 31.5, amount: 500 },
        ],
        111500,
      ),
      supplierBook,
    )
    expect(mixed).toMatchObject({ partialVatWithheld: 8000, otherTaxes: [{ code: 24, rate: 31.5, amount: 500 }] })
    expect(createPurchaseSalesBook({ cover, entries: [mixed] }).totalMismatches).toEqual([])

    // A document read with no rate of the tax is measured against the rate in force.
    const { header } = invoice([{ taxCode: 39, rate: 19, amount: 19000 }], 100000)
    const bare = { ...partial, header: { ...header, totals: { ...header.totals, vatRate: undefined } } }
    expect(bookEntryFromDocument(bare, supplierBook)).toMatchObject({ totalVatWithheld: 19000 })
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
        periodAmount: 118,
      },
    })
    expect(bookEntryFromDocument(document, sale)).toMatchObject({
      ownVatAmount: 9,
      thirdPartyVatAmount: 10,
      otherTaxes: [{ code: 24, rate: 31.5, amount: 5 }],
      settlement: { issuerRut: ISSUER_RUT, netValue: 1, exemptValue: 2, vatValue: 3 },
      periodAmount: 118,
    })
    // A settlement invoice has no non-billable amount in its totals, so an invoice carries this one.
    const invoice = createDocument({
      ...base,
      totals: { netAmount: 100, vatRate: 19, vatAmount: 19, totalAmount: 119, nonBillableAmount: 7 },
    })
    expect(bookEntryFromDocument(invoice, sale)).toMatchObject({ nonBillableAmount: 7 })
  })

  test('a settlement invoice whose totals are worked out carries the sums of its commissions', () => {
    const document = createDocument({
      ...base,
      type: 43,
      items: [{ name: 'Liquidación', unitPrice: 10000, settledDocumentType: '33' }],
      commissions: [
        { kind: 'commission', description: 'Comisión', netValue: 1000 },
        { kind: 'otherCharge', description: 'Flete', exemptValue: 500 },
      ],
    })
    expect(bookEntryFromDocument(document, sale)).toMatchObject({
      netAmount: 10000,
      vatAmount: 1900,
      settlement: { issuerRut: ISSUER_RUT, netValue: 1000, exemptValue: 500, vatValue: 190 },
      totalAmount: 10210,
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

  // The total of a document with a deposit guarantee includes it (Formato DTE 2.5, field 124), and so does the total
  // of a book line, through `DepEnvase`.
  test('the deposit guarantee travels as the container deposit, and the book adds up', () => {
    const document = createDocument({
      ...base,
      items: [...base.items, { name: 'Garantía de envases', quantity: 24, unitPrice: 150, exemptIndicator: 3 }],
    })
    expect(document.header.totals).toMatchObject({ depositGuarantee: 3600, totalAmount: 122600 })
    const entry = bookEntryFromDocument(document, sale)
    expect(entry).toMatchObject({ containerDeposit: 3600, totalAmount: 122600 })
    expect(createPurchaseSalesBook({ cover: saleCover, entries: [entry] }).totalMismatches).toEqual([])
    expect(bookEntryFromDocument(createDocument(base), sale)).not.toHaveProperty('containerDeposit')
  })

  // `DepEnvase` is a `MontoType` of `LibroCV_v10.xsd`, from zero up, so a credit note's guarantee cannot be negated.
  test('a negative sign is refused on a credit note with a deposit guarantee, and a positive one adds up', () => {
    const note = createDocument({
      ...base,
      type: 61,
      items: [
        { name: 'Cerveza retornable', quantity: 24, unitPrice: 900 },
        { name: 'Garantía de envases', quantity: 24, unitPrice: 150, exemptIndicator: 3 },
      ],
      references: [{ documentType: 33, folio: '10', date: '2026-10-15', code: 3, reason: 'Devolución' }],
    })
    for (const side of [sale, purchase])
      expect(() => bookEntryFromDocument(note, { ...side, creditNoteSign: 'negative' })).toThrow(
        expect.objectContaining({ code: 'INVALID_OPTION', details: { field: 'creditNoteSign' } }),
      )
    const entry = bookEntryFromDocument(note, sale)
    expect(entry).toMatchObject({ containerDeposit: 3600, totalAmount: 29304 })
    expect(createPurchaseSalesBook({ cover: saleCover, entries: [entry] }).totalMismatches).toEqual([])
    const received = bookEntryFromDocument(note, purchase)
    const cover = { ...purchaseCover, issuerRut: RECEIVER_RUT }
    expect(createPurchaseSalesBook({ cover, entries: [received] }).totalMismatches).toEqual([])
  })

  // A guarantee of zero is none, so it leaves nothing to negate.
  test('a negative sign books a credit note whose given deposit guarantee is zero, on both sides', () => {
    const note = createDocument({
      ...base,
      type: 61,
      items: [{ name: 'Cerveza retornable', quantity: 24, unitPrice: 900 }],
      references: [{ documentType: 33, folio: '10', date: '2026-10-15', code: 3, reason: 'Devolución' }],
      totals: { netAmount: 21600, vatRate: 19, vatAmount: 4104, depositGuarantee: 0, totalAmount: 25704 },
    })
    expect(note.header.totals.depositGuarantee).toBe(0)
    for (const side of [sale, purchase]) {
      const entry = bookEntryFromDocument(note, { ...side, creditNoteSign: 'negative' })
      expect(entry).toMatchObject({ netAmount: -21600, vatAmount: -4104, totalAmount: -25704 })
      expect(entry).not.toHaveProperty('containerDeposit')
    }
  })

  test('rejects an invalid book RUT', () => {
    expectCodeOf(() => bookEntryFromDocument(createDocument(base), { ...sale, bookRut: '1-1' }), 'INVALID_RUT')
  })
})

// "Formato de Información de Compras y Ventas", version 2.2, section 1.4: every amount of a book is in pesos. An export
// document (110, 111, 112) carries its amounts in a foreign currency, and in pesos only in `OtraMoneda`.
describe('bookEntryFromDocument with an export document', () => {
  const foreign = {
    rut: FOREIGN_RECEIVER_RUT,
    businessName: 'Pacific Orchard Imports Inc',
    address: '480 Bayview Ave',
    city: 'Seattle',
  }
  const customs = { saleModality: 1, saleClause: 2, saleClauseTotal: 980, transportRoute: 1, receiverCountry: 225 }
  const exportOf = (overrides: Partial<DocumentInput> = {}): Document =>
    createDocument({
      type: 110,
      folio: 7,
      issueDate: '2026-10-20',
      issuer,
      receiver: foreign,
      currency: 'DOLAR USA',
      items: [{ name: 'Nueces con cáscara', quantity: 40, unit: 'KN', unitPrice: 24.5 }],
      transport: { customs },
      ...overrides,
    })
  const withPesos = (document: Document, otherCurrency: Document['header']['otherCurrency']): Document => ({
    ...document,
    header: { ...document.header, otherCurrency },
  })
  const expectError = (run: () => unknown, code: string, details: Record<string, unknown>): void => {
    expect(run).toThrow(expect.objectContaining({ code, details: expect.objectContaining(details) }))
  }

  test('one issued with an exchange rate enters the book with the totals it carries in pesos', () => {
    // 980 × 912.37 = 894122.6.
    const document = exportOf({ exchangeRate: 912.37 })
    expect(document.header.otherCurrency).toMatchObject({ exemptAmount: 894123, totalAmount: 894123 })
    expect(bookEntryFromDocument(document, sale)).toEqual({
      type: 110,
      folio: 7,
      date: '2026-10-20',
      counterpartyRut: FOREIGN_RECEIVER_RUT,
      counterpartyName: 'Pacific Orchard Imports Inc',
      exemptAmount: 894123,
      totalAmount: 894123,
    })
  })

  test('one with no totals in pesos is refused, with the exchange rate it needs in the details', () => {
    expectError(() => bookEntryFromDocument(exportOf(), sale), 'MISSING_FIELD', { field: 'exchangeRate', type: 110 })
  })

  test('given an exchange rate, each amount is converted once, half away from zero, and the line adds up', () => {
    // 980 × 912.37 = 894122.6, and 10.5 × 1 = 10.5: both round away from zero.
    expect(bookEntryFromDocument(exportOf(), { ...sale, exchangeRate: 912.37 })).toMatchObject({
      exemptAmount: 894123,
      totalAmount: 894123,
    })
    const note = exportOf({
      type: 112,
      items: [{ name: 'Diferencia de precio', amount: 10.5 }],
      transport: undefined,
      references: [{ documentType: 110, folio: 7, date: '2026-10-20', code: 3 }],
    })
    const entry = bookEntryFromDocument(note, { ...sale, exchangeRate: 1 })
    expect(entry).toMatchObject({ type: 112, exemptAmount: 11, totalAmount: 11 })
    expect(createPurchaseSalesBook({ cover: saleCover, entries: [entry] }).totalMismatches).toEqual([])
  })

  test('the conversion is exact: 0.145 at 100 is 14.5, which books as 15', () => {
    // In floating point 0.145 × 100 is 14.499999999999998, which rounds to 14.
    const document = exportOf({ totals: { exemptAmount: 0.145, totalAmount: 0.145 } })
    expect(bookEntryFromDocument(document, { ...sale, exchangeRate: 100 })).toMatchObject({
      exemptAmount: 15,
      totalAmount: 15,
    })
  })

  test('the rate is checked as the document checks it, and compared with the carried one after rounding', () => {
    expectError(() => bookEntryFromDocument(exportOf(), { ...sale, exchangeRate: 999999.99995 }), 'INVALID_AMOUNT', {
      field: 'exchangeRate',
    })
    expect(() => exportOf({ exchangeRate: 999999.99995 })).toThrow(
      expect.objectContaining({ code: 'INVALID_AMOUNT', details: expect.objectContaining({ field: 'exchangeRate' }) }),
    )
    // The document writes 912.37005 as 912.3701, and the book takes the rate as the document would have written it.
    const document = exportOf({ exchangeRate: 912.3701 })
    expect(bookEntryFromDocument(document, { ...sale, exchangeRate: 912.37005 })).toMatchObject({ totalAmount: 894123 })
    expectError(() => bookEntryFromDocument(document, { ...sale, exchangeRate: 912.37004 }), 'INVALID_OPTION', {
      field: 'exchangeRate',
    })
  })

  test('a converted amount the book cannot hold is refused here, naming it', () => {
    const huge = exportOf({ totals: { exemptAmount: 99999999999.9999, totalAmount: 99999999999.9999 } })
    expectError(() => bookEntryFromDocument(huge, { ...sale, exchangeRate: 999999.9999 }), 'INVALID_AMOUNT', {
      field: 'exemptAmount',
      kind: 'converted',
    })
    const total = withPesos(huge, undefined)
    const totalOnly = { ...total, header: { ...total.header, totals: { totalAmount: 99999999999.9999 } } }
    expectError(() => bookEntryFromDocument(totalOnly, { ...sale, exchangeRate: 999999.9999 }), 'INVALID_AMOUNT', {
      field: 'totalAmount',
      kind: 'converted',
    })
  })

  test('the book RUT is checked first', () => {
    expectError(() => bookEntryFromDocument(exportOf(), { ...sale, bookRut: '1-1' }), 'INVALID_RUT', {
      field: 'bookRut',
    })
    expectError(
      () => bookEntryFromDocument(createDocument(base), { ...sale, bookRut: '1-1', exchangeRate: 1 }),
      'INVALID_RUT',
      { field: 'bookRut' },
    )
  })

  test('a negative sign negates an export credit note (112) as a credit note (61)', () => {
    const note = exportOf({
      type: 112,
      items: [{ name: 'Diferencia de precio', amount: 10.5 }],
      transport: undefined,
      references: [{ documentType: 110, folio: 7, date: '2026-10-20', code: 3 }],
    })
    const entry = bookEntryFromDocument(note, { ...sale, exchangeRate: 1, creditNoteSign: 'negative' })
    expect(entry).toMatchObject({ type: 112, exemptAmount: -11, totalAmount: -11 })
    expect(bookEntryFromDocument(note, { ...sale, exchangeRate: 1 })).toMatchObject({ totalAmount: 11 })
  })

  // Not solved here: an export without payment carries an exempt amount and a total of zero, in its currency and in
  // pesos, and its book line does not add up by the formula.
  test('an export without payment books its exempt amount in pesos and a total of zero, which the book reports', () => {
    const unpaid = exportOf({ options: { exportPaymentTerms: '21' }, exchangeRate: 912.37 })
    expect(unpaid.header.totals).toEqual({ exemptAmount: 980, totalAmount: 0 })
    expect(unpaid.header.otherCurrency).toMatchObject({ exemptAmount: 894123, totalAmount: 0 })
    const entry = bookEntryFromDocument(unpaid, sale)
    expect(entry).toMatchObject({ exemptAmount: 894123, totalAmount: 0 })
    // Converted with the option, the exempt amount and the total are each converted on their own.
    const converted = bookEntryFromDocument(exportOf({ options: { exportPaymentTerms: '21' } }), {
      ...sale,
      exchangeRate: 912.37,
    })
    expect(converted).toMatchObject({ exemptAmount: 894123, totalAmount: 0 })
    expect(createPurchaseSalesBook({ cover: saleCover, entries: [entry] }).totalMismatches).toEqual([
      { index: 0, type: 110, folio: 7, expected: 894123, actual: 0 },
    ])
    expect(() => createPurchaseSalesBook({ cover: saleCover, entries: [entry], strictTotals: true })).toThrow(
      expect.objectContaining({ code: 'BOOK_TOTAL_MISMATCH' }),
    )
  })

  test.each([0, -1, 0.00004, 1_000_000, Number.NaN, Number.POSITIVE_INFINITY])(
    'an exchange rate of %p is refused, as the document refuses it',
    (exchangeRate) => {
      expectError(() => bookEntryFromDocument(exportOf(), { ...sale, exchangeRate }), 'INVALID_AMOUNT', {
        field: 'exchangeRate',
      })
    },
  )

  test('an exchange rate the document does not carry is refused, and the one it carries is taken', () => {
    const document = exportOf({ exchangeRate: 912.37 })
    expect(bookEntryFromDocument(document, { ...sale, exchangeRate: 912.37 })).toMatchObject({ totalAmount: 894123 })
    expectError(() => bookEntryFromDocument(document, { ...sale, exchangeRate: 912.38 }), 'INVALID_OPTION', {
      field: 'exchangeRate',
    })
    const noRate = withPesos(document, { currency: 'PESO CL', exemptAmount: 894123, totalAmount: 894123 })
    expect(bookEntryFromDocument(noRate, sale)).toMatchObject({ exemptAmount: 894123, totalAmount: 894123 })
    expectError(() => bookEntryFromDocument(noRate, { ...sale, exchangeRate: 912.37 }), 'INVALID_OPTION', {
      field: 'exchangeRate',
    })
  })

  test('a document that is not an export one refuses an exchange rate', () => {
    expectError(() => bookEntryFromDocument(createDocument(base), { ...sale, exchangeRate: 1 }), 'INVALID_OPTION', {
      field: 'exchangeRate',
    })
  })

  test('one issued in pesos takes its own totals, and refuses an exchange rate', () => {
    const document = exportOf({
      currency: 'PESO CL',
      items: [{ name: 'Nueces con cáscara', quantity: 40, unit: 'KN', unitPrice: 2450 }],
    })
    expect(bookEntryFromDocument(document, sale)).toMatchObject({ exemptAmount: 98000, totalAmount: 98000 })
    expectError(() => bookEntryFromDocument(document, { ...sale, exchangeRate: 1 }), 'INVALID_OPTION', {
      field: 'exchangeRate',
    })
  })

  test('totals in another currency, or without the exempt amount, are not totals in pesos', () => {
    const euros = withPesos(exportOf(), { currency: 'EURO', exemptAmount: 850, totalAmount: 850 })
    expectError(() => bookEntryFromDocument(euros, sale), 'MISSING_FIELD', { field: 'exchangeRate' })
    const noExempt = withPesos(exportOf(), { currency: 'PESO CL', totalAmount: 894123 })
    expectError(() => bookEntryFromDocument(noExempt, sale), 'MISSING_FIELD', { field: 'exchangeRate' })
    expect(bookEntryFromDocument(noExempt, { ...sale, exchangeRate: 912.37 })).toMatchObject({
      exemptAmount: 894123,
      totalAmount: 894123,
    })
  })

  test('totals in pesos with decimals are refused, naming the amount', () => {
    const own = exportOf({
      currency: 'PESO CL',
      items: [{ name: 'Nueces con cáscara', quantity: 1, unit: 'KN', unitPrice: 2450.5 }],
    })
    expectError(() => bookEntryFromDocument(own, sale), 'INVALID_AMOUNT', { field: 'totals.exemptAmount' })
    const ownTotal = { ...own, header: { ...own.header, totals: { totalAmount: 2450.5 } } }
    expectError(() => bookEntryFromDocument(ownTotal, sale), 'INVALID_AMOUNT', { field: 'totals.totalAmount' })
    const cents = withPesos(exportOf(), { currency: 'PESO CL', exemptAmount: 894122.6, totalAmount: 894123 })
    expectError(() => bookEntryFromDocument(cents, sale), 'INVALID_AMOUNT', { field: 'otherCurrency.exemptAmount' })
    const total = withPesos(exportOf(), { currency: 'PESO CL', exemptAmount: 894123, totalAmount: 894122.6 })
    expectError(() => bookEntryFromDocument(total, sale), 'INVALID_AMOUNT', { field: 'otherCurrency.totalAmount' })
  })

  test('a sales book with an export invoice validates against the official schema', async () => {
    const book = createPurchaseSalesBook({
      cover: saleCover,
      entries: [
        bookEntryFromDocument(createDocument(base), sale),
        bookEntryFromDocument(exportOf({ exchangeRate: 912.37 }), sale),
      ],
      now: FIXED_NOW,
    })
    expect(book.totalMismatches).toEqual([])
    expect(book.periodTotals?.find((totals) => totals.type === 110)).toMatchObject({
      exemptAmount: 894123,
      totalAmount: 894123,
    })
    expect(await validateAgainstXsd(signPurchaseSalesBook(book, certificate).xml, 'LibroCV')).toEqual([])
  }, 30_000)
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

  // `createDocument` requires the transfer on a guide; a guide read from XML may come without it.
  test('the transfer defaults to a sale', () => {
    const issued = createDocument(guide)
    const document = { ...issued, header: { ...issued.header, options: {} } }
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

  // A credit note that takes back a receipt, with a taxed line and an exempt one, so its line carries every amount.
  const creditNote: DocumentInput = {
    ...base,
    type: 61,
    folio: 7,
    items: [
      { name: 'Café', quantity: 1, unitPrice: 1000 },
      { name: 'Libro', unitPrice: 500, exempt: true },
    ],
    references: [{ documentType: 39, folio: '3', date: '2026-10-15', code: 1, reason: 'Anula boleta' }],
  }

  test('a credit note carries its folio, date, net, VAT, exempt amount and total', () => {
    expect(folioConsumptionEntryFromDocument(createDocument(creditNote))).toEqual({
      type: 61,
      folio: 7,
      issueDate: '2026-10-15',
      netAmount: 1000,
      vatAmount: 190,
      exemptAmount: 500,
      totalAmount: 1690,
    })
  })

  test('the line of a credit note builds a report beside the line of a receipt', () => {
    const report = createFolioConsumption({
      cover: reportCover,
      entries: [receipt, creditNote].map((input) => folioConsumptionEntryFromDocument(createDocument(input))),
    })
    expect(report.summaries.map(({ type }) => type)).toEqual([39, 61])
    expect(report.summaries[1]).toMatchObject({
      netAmount: 1000,
      vatAmount: 190,
      exemptAmount: 500,
      totalAmount: 1690,
      issuedCount: 1,
      usedRanges: [{ from: 7, to: 7 }],
    })
  })

  test('a non-billable amount stays out of the line of a credit note, as it stays out of its total', () => {
    const note = createDocument({
      ...creditNote,
      items: [...creditNote.items, { name: 'Propina', unitPrice: 300, exemptIndicator: 2 }],
    })
    expect(note.header.totals.nonBillableAmount).toBe(300)
    expect(folioConsumptionEntryFromDocument(note)).toMatchObject({
      netAmount: 1000,
      exemptAmount: 500,
      totalAmount: 1690,
    })
  })

  // Field 6 of the format of the report: the total of a summary is the sum of its net, its VAT and its exempt amount. A
  // receipt always adds up; a credit note may carry what a receipt cannot, and then its total is something else.
  test.each<[string, Partial<DocumentInput>, { expected: number; actual: number }]>([
    [
      'withholds its VAT',
      {
        withholdVat: true,
        references: [{ documentType: 46, folio: '7', date: '2026-10-15', code: 3, reason: 'Devolución' }],
      },
      { expected: 1690, actual: 1500 },
    ],
    [
      'carries a deposit guarantee',
      { items: [...creditNote.items, { name: 'Envase', unitPrice: 300, exemptIndicator: 3 }] },
      { expected: 1690, actual: 1990 },
    ],
    [
      'carries another tax',
      {
        items: [{ name: 'Bebida', quantity: 1, unitPrice: 1000, additionalTaxCodes: [27] }],
        totals: {
          netAmount: 1000,
          vatRate: 19,
          vatAmount: 190,
          withholdings: [{ taxCode: 27, rate: 18, amount: 180 }],
          totalAmount: 1370,
        },
      },
      { expected: 1190, actual: 1370 },
    ],
  ])('refuses a credit note that %s, whose line would not add up', (_name, extra, amounts) => {
    const note = createDocument({ ...creditNote, ...extra })
    expect(() => folioConsumptionEntryFromDocument(note)).toThrow(
      expect.objectContaining({ code: 'BOOK_TOTAL_MISMATCH', details: { field: 'totalAmount', ...amounts } }),
    )
  })

  test.each<[string, DocumentInput]>([
    ['an invoice', base],
    [
      'a debit note',
      {
        ...base,
        type: 56,
        references: [{ documentType: 33, folio: '10', date: '2026-10-15', code: 3, reason: 'Corrige monto' }],
      },
    ],
  ])('rejects %s, which the report does not take', (_name, input) => {
    expect(() => folioConsumptionEntryFromDocument(createDocument(input))).toThrow(
      expect.objectContaining({ code: 'INVALID_DOCUMENT_TYPE', details: { field: 'type', type: input.type } }),
    )
  })
})
