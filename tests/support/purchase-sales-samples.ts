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
