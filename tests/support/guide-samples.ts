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
