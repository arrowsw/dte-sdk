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
