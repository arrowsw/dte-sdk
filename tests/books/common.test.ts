import {
  assertBookAmount,
  assertBookFolio,
  assertBookRate,
  assertBookZones,
  buildBookXml,
  normalizeBookCover,
  toBookDate,
} from '../../src/books/common'
import { DteError } from '../../src/errors'
import { guideCover, SENDER_RUT } from '../support/book-fixtures'
import { ISSUER_RUT } from '../support/fixtures'

const code = (run: () => unknown): { code: string; details: unknown } => {
  try {
    run()
  } catch (error) {
    return { code: (error as DteError).code, details: (error as DteError).details }
  }
  throw new Error('expected a DteError')
}

describe('assertBookFolio', () => {
  test.each([1, 9_999_999_999])('accepts %d', (folio) => {
    expect(() => assertBookFolio(folio, 'folio')).not.toThrow()
  })

  test.each([0, -1, 1.5, 10_000_000_000, Number.NaN])('rejects %d', (folio) => {
    expect(code(() => assertBookFolio(folio, 'folio', 2))).toEqual({
      code: 'INVALID_FOLIO',
      details: { field: 'folio', folio, index: 2 },
    })
  })
})

describe('assertBookAmount', () => {
  test.each([
    [undefined, false],
    [0, false],
    [100, false],
    [-100, true],
  ])('accepts %p with signed %p', (value, signed) => {
    expect(() => assertBookAmount(value, { field: 'x', signed })).not.toThrow()
  })

  test.each([
    [-1, false],
    [1.5, true],
    [Number.MAX_SAFE_INTEGER + 1, true],
    [Number.NaN, true],
  ])('rejects %p with signed %p', (value, signed) => {
    expect(code(() => assertBookAmount(value, { field: 'x', signed, index: 1 })).code).toBe('INVALID_AMOUNT')
  })
})

describe('assertBookRate', () => {
  test.each([undefined, 0, 19, 19.5, 19.25, 100])('accepts %p', (rate) => {
    expect(() => assertBookRate(rate, 'taxRate')).not.toThrow()
  })

  test.each([-1, 100.01, 19.255, Number.NaN])('rejects %p', (rate) => {
    expect(code(() => assertBookRate(rate, 'taxRate', 3))).toEqual({
      code: 'INVALID_AMOUNT',
      details: { field: 'taxRate', index: 3 },
    })
  })
})

describe('toBookDate', () => {
  test('normalizes to ISO within the schema range', () => {
    expect(toBookDate('15-10-2026', 'date')).toBe('2026-10-15')
    expect(toBookDate('2000-01-01', 'date')).toBe('2000-01-01')
    expect(toBookDate('2050-12-31', 'date')).toBe('2050-12-31')
  })

  test.each(['1999-12-31', '2051-01-01', '2026-02-30', 'hoy'])('rejects %s', (date) => {
    expect(code(() => toBookDate(date, 'date'))).toEqual({ code: 'INVALID_DATE', details: { field: 'date' } })
  })
})

describe('normalizeBookCover', () => {
  test('normalizes RUTs and dates and defaults to a total submission', () => {
    expect(
      normalizeBookCover({
        issuerRut: '76.543.210-3',
        senderRut: SENDER_RUT,
        period: '2026-10',
        resolutionDate: '15-01-2026',
        resolutionNumber: 0,
      }),
    ).toEqual({
      issuerRut: ISSUER_RUT,
      senderRut: SENDER_RUT,
      period: '2026-10',
      resolutionDate: '2026-01-15',
      resolutionNumber: 0,
      submission: 'total',
    })
  })

  test('keeps the segment number only on a partial submission', () => {
    expect(normalizeBookCover({ ...guideCover, submission: 'partial', segmentNumber: 2 }).segmentNumber).toBe(2)
    expect(normalizeBookCover({ ...guideCover, submission: 'final', segmentNumber: 2 }).segmentNumber).toBeUndefined()
  })

  test('keeps the notification folio', () => {
    expect(normalizeBookCover(guideCover).notificationFolio).toBe(3)
  })

  test.each(['2026-13', '2026-00', '2026', '10-2026', '2026-1'])('rejects the period %s', (period) => {
    expect(code(() => normalizeBookCover({ ...guideCover, period }))).toEqual({
      code: 'INVALID_DATE',
      details: { field: 'cover.period' },
    })
  })

  test.each([-1, 1.5, 1_000_000])('rejects the resolution number %d', (resolutionNumber) => {
    expect(code(() => normalizeBookCover({ ...guideCover, resolutionNumber }))).toEqual({
      code: 'INVALID_OPTION',
      details: { field: 'cover.resolutionNumber' },
    })
  })

  test('a partial submission needs a valid segment number', () => {
    expect(code(() => normalizeBookCover({ ...guideCover, submission: 'partial' }))).toEqual({
      code: 'MISSING_FIELD',
      details: { field: 'cover.segmentNumber' },
    })
    expect(code(() => normalizeBookCover({ ...guideCover, submission: 'partial', segmentNumber: 0 }))).toEqual({
      code: 'INVALID_OPTION',
      details: { field: 'cover.segmentNumber' },
    })
  })

  test('rejects an invalid notification folio', () => {
    expect(code(() => normalizeBookCover({ ...guideCover, notificationFolio: 0 }))).toEqual({
      code: 'INVALID_OPTION',
      details: { field: 'cover.notificationFolio' },
    })
  })

  test('rejects an invalid RUT', () => {
    expect(code(() => normalizeBookCover({ ...guideCover, issuerRut: '1-1' })).code).toBe('INVALID_RUT')
  })
})

describe('assertBookZones', () => {
  const zones = { submission: 'total', entryCount: 1, hasPreviousTotals: false, hasSummaryOnlyTotals: false } as const

  test.each([
    [zones],
    [{ ...zones, entryCount: 0 }],
    [{ ...zones, hasSummaryOnlyTotals: true }],
    [{ ...zones, submission: 'partial' }],
    [{ ...zones, submission: 'final', entryCount: 0, hasPreviousTotals: true }],
    [{ ...zones, submission: 'final', entryCount: 0, hasSummaryOnlyTotals: true }],
    [{ ...zones, submission: 'adjustment' }],
    [{ ...zones, submission: 'adjustment', hasPreviousTotals: true, hasSummaryOnlyTotals: true }],
  ] as const)('accepts %j', (input) => {
    expect(() => assertBookZones(input)).not.toThrow()
  })

  test.each([
    [{ ...zones, submission: 'partial', entryCount: 0 }, 'MISSING_FIELD', 'entries'],
    [{ ...zones, submission: 'final', hasPreviousTotals: true }, 'INVALID_OPTION', 'entries'],
    [{ ...zones, hasPreviousTotals: true }, 'INVALID_OPTION', 'previousTotals'],
    [{ ...zones, submission: 'partial', hasPreviousTotals: true }, 'INVALID_OPTION', 'previousTotals'],
    [{ ...zones, submission: 'partial', hasSummaryOnlyTotals: true }, 'INVALID_OPTION', 'summaryOnlyTotals'],
    [{ ...zones, submission: 'final', entryCount: 0 }, 'MISSING_FIELD', 'previousTotals'],
  ] as const)('rejects %j', (input, errorCode, field) => {
    expect(code(() => assertBookZones(input))).toEqual({ code: errorCode, details: { field } })
  })
})

describe('buildBookXml', () => {
  const xml = buildBookXml({
    rootTag: 'Libro',
    signedTag: 'Envio',
    schema: 'Libro_v10.xsd',
    id: 'ID1',
    content: { Caratula: { Rut: 'A&B', Monto: 0 }, Fin: 'x' },
  })

  test('breaks the line between tags, leaves the closing tags together and declares ISO-8859-1', () => {
    expect(xml).toBe(
      '<?xml version="1.0" encoding="ISO-8859-1"?>\n' +
        '<Libro xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte Libro_v10.xsd" version="1.0">\n' +
        '<Envio ID="ID1">\n<Caratula>\n<Rut>A&amp;B</Rut>\n<Monto>0</Monto>\n</Caratula>\n<Fin>x</Fin>\n</Envio></Libro>',
    )
  })

  test('escaped text cannot produce a line break', () => {
    const escaped = buildBookXml({
      rootTag: 'Libro',
      signedTag: 'Envio',
      schema: 'Libro_v10.xsd',
      id: 'ID1',
      content: { Glosa: '><' },
    })
    expect(escaped).toContain('<Glosa>&gt;&lt;</Glosa>')
  })
})
