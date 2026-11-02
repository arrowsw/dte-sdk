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
