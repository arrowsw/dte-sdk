import type { PeriodDocument } from '../../src/portal/pages/rcv'
import { reconcilePeriodDocuments, type PeriodRecord } from '../../src/portal/reconcile'
import { SUPPLIER_RUT } from '../support/book-fixtures'
import { RECEIVER_RUT } from '../support/fixtures'

// A document as `listPeriodDocuments` gives it: the RUT and the date as the SII writes them.
const registered = (overrides: Partial<PeriodDocument> = {}): PeriodDocument => ({
  type: 33,
  typeDescription: 'Factura Electrónica',
  folio: 12,
  issueDate: '15/10/2026',
  receivedDate: '15/10/2026',
  counterpartyRut: '12345678-5',
  counterpartyName: 'Comercializadora Rapel Ltda',
  exemptAmount: 0,
  netAmount: 100000,
  vatAmount: 19000,
  totalAmount: 119000,
  eventOrder: null,
  eventDescription: null,
  raw: {},
  ...overrides,
})

const record = (overrides: Partial<PeriodRecord> = {}): PeriodRecord => ({
  type: 33,
  folio: 12,
  counterpartyRut: RECEIVER_RUT,
  issueDate: '2026-10-15',
  exemptAmount: 0,
  netAmount: 100000,
  vatAmount: 19000,
  totalAmount: 119000,
  ...overrides,
})

const expectError = (run: () => unknown, code: string, details: Record<string, unknown>): void => {
  expect(run).toThrow(expect.objectContaining({ code, details: expect.objectContaining(details) }))
}

describe('reconcilePeriodDocuments', () => {
  test('the same document on both sides agrees, whatever the shape of the RUT, and the sides balance', () => {
    const document = registered({ counterpartyRut: '12.345.678-5' })
    const own = record({ counterpartyRut: '123456785' })
    expect(reconcilePeriodDocuments([document], [own])).toEqual({
      matching: [{ register: document, record: own }],
      differing: [],
      registerOnly: [],
      recordsOnly: [],
      duplicates: [],
      unreadable: [],
      totals: {
        register: { documentCount: 1, exemptAmount: 0, netAmount: 100000, vatAmount: 19000, totalAmount: 119000 },
        records: { documentCount: 1, exemptAmount: 0, netAmount: 100000, vatAmount: 19000, totalAmount: 119000 },
      },
      balanced: true,
    })
  })

  test('a K verifier matches in either case', () => {
    const result = reconcilePeriodDocuments(
      [registered({ counterpartyRut: '14625621-K' })],
      [record({ counterpartyRut: '14.625.621-k' })],
    )
    expect(result.matching).toHaveLength(1)
    expect(result.balanced).toBe(true)
  })

  test('a document that differs lists every field that differs, with its two values', () => {
    const document = registered({ issueDate: '16/10/2026', netAmount: 100001, totalAmount: 119001 })
    const own = record({ exemptAmount: 5 })
    const result = reconcilePeriodDocuments([document], [own])
    expect(result.matching).toEqual([])
    expect(result.differing).toEqual([
      {
        register: document,
        record: own,
        differences: [
          { field: 'issueDate', register: '2026-10-16', record: '2026-10-15' },
          { field: 'exemptAmount', register: 0, record: 5 },
          { field: 'netAmount', register: 100001, record: 100000 },
          { field: 'totalAmount', register: 119001, record: 119000 },
        ],
      },
    ])
    expect(result.balanced).toBe(false)
  })

  test('an amount or a date the caller leaves out is not compared, and adds nothing to its totals', () => {
    const own: PeriodRecord = { type: 33, folio: 12, counterpartyRut: RECEIVER_RUT, totalAmount: 119000 }
    const result = reconcilePeriodDocuments([registered({ netAmount: null, issueDate: 'sin fecha' })], [own])
    expect(result.matching).toHaveLength(1)
    expect(result.totals.records).toEqual({
      documentCount: 1,
      exemptAmount: 0,
      netAmount: 0,
      vatAmount: 0,
      totalAmount: 119000,
    })
    // An amount the register does not bring counts as zero in its totals, and differs from one the caller gives.
    expect(result.totals.register.netAmount).toBe(0)
    const compared = reconcilePeriodDocuments([registered({ netAmount: null, issueDate: 'sin fecha' })], [record()])
    expect(compared.differing[0]?.differences).toEqual([
      { field: 'issueDate', register: 'sin fecha', record: '2026-10-15' },
      { field: 'netAmount', register: null, record: 100000 },
    ])
  })

  test('the type, the RUT and the folio make the key: a change in any one leaves each on its own side', () => {
    const documents = [registered(), registered({ folio: 13 }), registered({ type: 61 })]
    const records = [record(), record({ folio: 14 }), record({ counterpartyRut: SUPPLIER_RUT })]
    const result = reconcilePeriodDocuments(documents, records)
    expect(result.matching).toEqual([{ register: documents[0], record: records[0] }])
    expect(result.registerOnly).toEqual([documents[1], documents[2]])
    expect(result.recordsOnly).toEqual([records[1], records[2]])
    expect(result.totals.register.documentCount).toBe(3)
    expect(result.totals.records.totalAmount).toBe(357000)
    expect(result.balanced).toBe(false)
  })

  test('two entries with one key on the same side are reported together and never collapse', () => {
    const twice = [registered(), registered({ counterpartyRut: '12.345.678-5' })]
    const result = reconcilePeriodDocuments(twice, [record()])
    expect(result.duplicates).toEqual([
      { type: 33, folio: 12, counterpartyRut: RECEIVER_RUT, register: twice, records: [record()] },
    ])
    expect(result.matching).toEqual([])
    expect(result.registerOnly).toEqual([])
    expect(result.recordsOnly).toEqual([])
    expect(result.totals.register.documentCount).toBe(2)
    expect(result.balanced).toBe(false)

    const own = reconcilePeriodDocuments([], [record(), record({ netAmount: 1 })])
    expect(own.duplicates).toEqual([
      {
        type: 33,
        folio: 12,
        counterpartyRut: RECEIVER_RUT,
        register: [],
        records: [record(), record({ netAmount: 1 })],
      },
    ])
    expect(own.recordsOnly).toEqual([])
  })

  test('a document of the register without a type, a folio or a RUT that reads is unreadable, not unmatched', () => {
    const documents = [
      registered({ type: null }),
      registered({ folio: null }),
      registered({ counterpartyRut: null }),
      registered({ counterpartyRut: '12345678-9' }),
    ]
    const result = reconcilePeriodDocuments(documents, [])
    expect(result.unreadable).toEqual(documents)
    expect(result.registerOnly).toEqual([])
    expect(result.totals.register.documentCount).toBe(4)
    expect(result.balanced).toBe(false)
  })

  test('two empty sides balance', () => {
    expect(reconcilePeriodDocuments([], [])).toMatchObject({ balanced: true, matching: [] })
  })

  test.each([
    ['type', { type: 0 }, 'INVALID_DOCUMENT_TYPE'],
    ['type', { type: 33.5 }, 'INVALID_DOCUMENT_TYPE'],
    ['folio', { folio: 0 }, 'INVALID_FOLIO'],
    ['folio', { folio: 1.5 }, 'INVALID_FOLIO'],
    ['counterpartyRut', { counterpartyRut: '12345678-9' }, 'INVALID_RUT'],
    ['issueDate', { issueDate: '2026-02-30' }, 'INVALID_DATE'],
    ['netAmount', { netAmount: 10.5 }, 'INVALID_AMOUNT'],
    ['totalAmount', { totalAmount: Number.NaN }, 'INVALID_AMOUNT'],
  ] as const)('a record with a bad %s is refused, with its index', (field, overrides, code) => {
    expectError(() => reconcilePeriodDocuments([], [record(), record(overrides)]), code, { field, index: 1 })
  })

  test('a record dated as the SII writes dates is compared as the same day', () => {
    expect(reconcilePeriodDocuments([registered()], [record({ issueDate: '15-10-2026' })]).balanced).toBe(true)
  })
})
