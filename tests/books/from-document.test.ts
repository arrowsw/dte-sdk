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
