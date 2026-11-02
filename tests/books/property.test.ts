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
