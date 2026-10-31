import { chileDate, chileTimestamp, chileDateTimeParts, toIsoDate, isIsoDate } from '../src/time/chile'
import { DteError } from '../src/errors'

describe('Chile time', () => {
  test('winter (UTC-4): a UTC instant is 4 hours earlier', () => {
    expect(chileTimestamp(new Date('2026-06-15T12:00:00.000Z'))).toBe('2026-06-15T08:00:00')
  })

  test('summer (UTC-3): a UTC instant is 3 hours earlier', () => {
    expect(chileTimestamp(new Date('2026-01-15T12:00:00.000Z'))).toBe('2026-01-15T09:00:00')
  })

  test('crosses midnight: UTC is already the next day', () => {
    expect(chileTimestamp(new Date('2026-06-16T02:00:00.000Z'))).toBe('2026-06-15T22:00:00')
    expect(chileDate(new Date('2026-06-16T02:00:00.000Z'))).toBe('2026-06-15')
  })

  test('midnight renders as 00, never 24', () => {
    expect(chileTimestamp(new Date('2026-06-15T04:00:00.000Z'))).toBe('2026-06-15T00:00:00')
  })

  test('parts and defaults to now', () => {
    expect(chileDateTimeParts(new Date('2026-11-15T18:30:05.000Z'))).toEqual({
      year: '2026',
      month: '11',
      day: '15',
      hour: '15',
      minute: '30',
      second: '05',
    })
    expect(chileDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(chileTimestamp()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
  })
})

describe('toIsoDate', () => {
  test.each([
    ['2014-08-22', '2014-08-22'],
    ['22-08-2014', '2014-08-22'],
    ['22/08/2014', '2014-08-22'],
    [' 2014-08-22 ', '2014-08-22'],
  ])('%p → %p', (input, expected) => {
    expect(toIsoDate(input)).toBe(expected)
  })

  test.each(['2014-13-01', '2014-02-30', '20140822', 'ayer', '', '2014-8-2'])('rejects %p', (input) => {
    expect(() => toIsoDate(input)).toThrow(DteError)
    try {
      toIsoDate(input, 'resolutionDate')
    } catch (err) {
      expect((err as DteError).code).toBe('INVALID_DATE')
      expect((err as DteError).details).toEqual({ field: 'resolutionDate' })
    }
  })

  test('isIsoDate', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('2024-02-29')).toBe(true)
    expect(isIsoDate('2026-2-2')).toBe(false)
  })
})
