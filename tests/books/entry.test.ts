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
