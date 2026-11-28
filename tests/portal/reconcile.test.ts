import type { PeriodDocument } from '../../src/portal/pages/rcv'
import { reconcilePeriodDocuments, type PeriodRecord } from '../../src/portal/reconcile'
import { SUPPLIER_RUT } from '../support/book-fixtures'
import { RECEIVER_RUT } from '../support/fixtures'

// A document as `listPeriodDocuments` gives it: the RUT and the date as the SII writes them.
const listed = (overrides: Partial<PeriodDocument> = {}): PeriodDocument => ({
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
    const document = listed({ counterpartyRut: '12.345.678-5' })
    const own = record({ counterpartyRut: '123456785' })
    expect(reconcilePeriodDocuments([document], [own])).toEqual({
      matching: [{ listed: document, record: own }],
      differing: [],
      listedOnly: [],
      recordsOnly: [],
      duplicates: [],
      unreadable: [],
      totals: {
        listed: { documentCount: 1, exemptAmount: 0, netAmount: 100000, vatAmount: 19000, totalAmount: 119000 },
        records: { documentCount: 1, exemptAmount: 0, netAmount: 100000, vatAmount: 19000, totalAmount: 119000 },
      },
      balanced: true,
    })
  })

  test('a K verifier matches in either case', () => {
    const result = reconcilePeriodDocuments(
      [listed({ counterpartyRut: '14625621-K' })],
      [record({ counterpartyRut: '14.625.621-k' })],
    )
    expect(result.matching).toHaveLength(1)
    expect(result.balanced).toBe(true)
  })

  test('a document that differs lists every field that differs, with its two values', () => {
    const document = listed({ issueDate: '16/10/2026', netAmount: 100001, totalAmount: 119001 })
    const own = record({ exemptAmount: 5 })
    const result = reconcilePeriodDocuments([document], [own])
    expect(result.matching).toEqual([])
    expect(result.differing).toEqual([
      {
        listed: document,
        record: own,
        differences: [
          { field: 'issueDate', listed: '2026-10-16', record: '2026-10-15' },
          { field: 'exemptAmount', listed: 0, record: 5 },
          { field: 'netAmount', listed: 100001, record: 100000 },
          { field: 'totalAmount', listed: 119001, record: 119000 },
        ],
      },
    ])
    expect(result.balanced).toBe(false)
  })

  test('an amount or a date the caller leaves out is not compared, and adds nothing to its totals', () => {
    const own: PeriodRecord = { type: 33, folio: 12, counterpartyRut: RECEIVER_RUT, totalAmount: 119000 }
    const result = reconcilePeriodDocuments([listed({ netAmount: null, issueDate: 'sin fecha' })], [own])
    expect(result.matching).toHaveLength(1)
    expect(result.totals.records).toEqual({
      documentCount: 1,
      exemptAmount: 0,
      netAmount: 0,
      vatAmount: 0,
      totalAmount: 119000,
    })
    // An amount the listing does not bring counts as zero in its totals, and differs from one the caller gives.
    expect(result.totals.listed.netAmount).toBe(0)
    const compared = reconcilePeriodDocuments([listed({ netAmount: null, issueDate: 'sin fecha' })], [record()])
    expect(compared.differing[0]?.differences).toEqual([
      { field: 'issueDate', listed: 'sin fecha', record: '2026-10-15' },
      { field: 'netAmount', listed: null, record: 100000 },
    ])
  })

  test('the type, the RUT and the folio make the key: a change in any one leaves each on its own side', () => {
    const documents = [listed(), listed({ folio: 13 }), listed({ type: 61 })]
    const records = [record(), record({ folio: 14 }), record({ counterpartyRut: SUPPLIER_RUT })]
    const result = reconcilePeriodDocuments(documents, records)
    expect(result.matching).toEqual([{ listed: documents[0], record: records[0] }])
    expect(result.listedOnly).toEqual([documents[1], documents[2]])
    expect(result.recordsOnly).toEqual([records[1], records[2]])
    expect(result.totals.listed.documentCount).toBe(3)
    expect(result.totals.records.totalAmount).toBe(357000)
    expect(result.balanced).toBe(false)
  })

  test('two entries with one key on the same side are reported together and never collapse', () => {
    const twice = [listed(), listed({ counterpartyRut: '12.345.678-5' })]
    const result = reconcilePeriodDocuments(twice, [record()])
    expect(result.duplicates).toEqual([
      { type: 33, folio: 12, counterpartyRut: RECEIVER_RUT, listed: twice, records: [record()] },
    ])
    expect(result.matching).toEqual([])
    expect(result.listedOnly).toEqual([])
    expect(result.recordsOnly).toEqual([])
    expect(result.totals.listed.documentCount).toBe(2)
    expect(result.balanced).toBe(false)

    const own = reconcilePeriodDocuments([], [record(), record({ netAmount: 1 })])
    expect(own.duplicates).toEqual([
      {
        type: 33,
        folio: 12,
        counterpartyRut: RECEIVER_RUT,
        listed: [],
        records: [record(), record({ netAmount: 1 })],
      },
    ])
    expect(own.recordsOnly).toEqual([])
  })

  test('a listed document without a type, a folio or a RUT that reads is unreadable, not unmatched', () => {
    const documents = [
      listed({ type: null }),
      listed({ folio: null }),
      listed({ counterpartyRut: null }),
      listed({ counterpartyRut: '12345678-9' }),
    ]
    const result = reconcilePeriodDocuments(documents, [])
    expect(result.unreadable).toEqual(documents)
    expect(result.listedOnly).toEqual([])
    expect(result.totals.listed.documentCount).toBe(4)
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
    expect(reconcilePeriodDocuments([listed()], [record({ issueDate: '15-10-2026' })]).balanced).toBe(true)
  })

  test.each(['2026-10-15T00:00:00', '15/10/2026 00:00:00', '15-10-2026 13:45', '2026-10-15 08:30:00.000'])(
    'a date followed by a time, %p, is read as its day on either side',
    (date) => {
      expect(reconcilePeriodDocuments([listed({ issueDate: date })], [record()]).balanced).toBe(true)
      expect(reconcilePeriodDocuments([listed()], [record({ issueDate: date })]).balanced).toBe(true)
    },
  )

  test.each(['2026-10-15T00:00:00Z', '15/10/2026 25:00', '2026-10-15T', '15.10.2026'])(
    'a date in another form, %p, is not read',
    (date) => {
      expect(reconcilePeriodDocuments([listed({ issueDate: date })], [record()]).differing[0]?.differences).toEqual([
        { field: 'issueDate', listed: date, record: '2026-10-15' },
      ])
      expectError(() => reconcilePeriodDocuments([], [record({ issueDate: date })]), 'INVALID_DATE', {
        field: 'issueDate',
        index: 0,
      })
    },
  )

  test('the records must all match too: a record more on its side does not balance', () => {
    const result = reconcilePeriodDocuments([listed()], [record(), record({ folio: 99 })])
    expect(result.matching).toHaveLength(1)
    expect(result.recordsOnly).toEqual([record({ folio: 99 })])
    expect(result.balanced).toBe(false)
  })

  test('a zero the caller gives differs from an amount the listing does not bring', () => {
    expect(
      reconcilePeriodDocuments([listed({ exemptAmount: null })], [record({ exemptAmount: 0 })]).differing[0]
        ?.differences,
    ).toEqual([{ field: 'exemptAmount', listed: null, record: 0 }])
    expect(reconcilePeriodDocuments([listed({ issueDate: null })], [record()]).differing[0]?.differences).toEqual([
      { field: 'issueDate', listed: null, record: '2026-10-15' },
    ])
  })

  test('each list keeps the order of its entries: the listing first, then the records', () => {
    const documents = [listed({ folio: 3 }), listed({ folio: 1 }), listed({ folio: 2, netAmount: 1 })]
    const records = [record({ folio: 5 }), record({ folio: 2 }), record({ folio: 1 }), record({ folio: 4 })]
    const result = reconcilePeriodDocuments(documents, records)
    expect(result.listedOnly).toEqual([documents[0]])
    expect(result.matching).toEqual([{ listed: documents[1], record: records[2] }])
    expect(result.differing.map((item) => item.listed)).toEqual([documents[2]])
    expect(result.recordsOnly).toEqual([records[0], records[3]])
  })

  // An issued 33 with folio 7 to a RUT and a received 33 with folio 7 from that RUT share a key: a document carries
  // no direction, so one call takes one direction.
  test('the two directions mixed in one call land in duplicates', () => {
    const issued = listed({ folio: 7 })
    const received = listed({ folio: 7, counterpartyName: 'Otro nombre' })
    expect(reconcilePeriodDocuments([issued, received], []).duplicates).toHaveLength(1)
  })

  test.each([
    ['documents', undefined, [], {}],
    ['records', [], undefined, {}],
    ['documents', 'x', [], {}],
    ['records', [], {}, {}],
    ['documents', [null], [], { index: 0 }],
    ['records', [], [record(), null], { index: 1 }],
    ['records', [], [record(), 3], { index: 1 }],
  ])('a malformed %s argument is refused, with the position', (field, documents, records, position) => {
    expectError(() => reconcilePeriodDocuments(documents as never, records as never), 'INVALID_OPTION', {
      field,
      ...position,
    })
  })

  test('a sparse argument is refused at its hole, on either side', () => {
    // eslint-disable-next-line no-sparse-arrays
    const holes = [listed(), , listed()] as PeriodDocument[]
    expectError(() => reconcilePeriodDocuments(holes, []), 'INVALID_OPTION', { field: 'documents', index: 1 })
    // eslint-disable-next-line no-sparse-arrays
    const gaps = [record(), , record({ folio: 2 })] as PeriodRecord[]
    expectError(() => reconcilePeriodDocuments([], gaps), 'INVALID_OPTION', { field: 'records', index: 1 })
  })
})
