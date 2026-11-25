import {
  chileDate,
  chileInstant,
  chileTimestamp,
  chileDateTimeParts,
  toIsoDate,
  isIsoDate,
  isPeriod,
  startedWithinDays,
} from '../src/time/chile'
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
    expect(Object.keys(chileDateTimeParts())).toEqual(['year', 'month', 'day', 'hour', 'minute', 'second'])
    expect(chileDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(chileTimestamp()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
  })
})

describe('chileInstant', () => {
  test('reads a Chile-local timestamp with the offset of its day, summer or winter', () => {
    // Summer time, UTC-3.
    expect(chileInstant('2026-11-15T15:30:00')?.toISOString()).toBe('2026-11-15T18:30:00.000Z')
    expect(chileInstant('2026-12-31T21:00:00')?.toISOString()).toBe('2027-01-01T00:00:00.000Z')
    // Winter time, UTC-4.
    expect(chileInstant('2026-07-01T12:00:00')?.toISOString()).toBe('2026-07-01T16:00:00.000Z')
    expect(chileInstant('2026-06-30T23:59:59')?.toISOString()).toBe('2026-07-01T03:59:59.000Z')
  })

  test('it is the inverse of chileTimestamp, on both sides of each change of season', () => {
    const instants = [
      '2026-04-04T12:00:00.000Z',
      '2026-04-05T02:59:59.000Z',
      '2026-04-05T04:00:00.000Z',
      '2026-04-05T12:00:00.000Z',
      '2026-09-05T12:00:00.000Z',
      '2026-09-06T03:59:59.000Z',
      '2026-09-06T04:00:00.000Z',
      '2026-09-06T12:00:00.000Z',
    ]
    for (const instant of instants) expect(chileInstant(chileTimestamp(new Date(instant)))?.toISOString()).toBe(instant)
  })

  test('what follows the seconds is not read, and a text that is not a timestamp or names no real date is null', () => {
    expect(chileInstant('2026-11-15T15:30:00.250')?.toISOString()).toBe('2026-11-15T18:30:00.000Z')
    expect(chileInstant('2026-11-15T15:30:00Z')?.toISOString()).toBe('2026-11-15T18:30:00.000Z')
    expect(chileInstant('2026-11-15 15:30:00')).toBeNull()
    expect(chileInstant('2026-11-15')).toBeNull()
    expect(chileInstant('2026-13-45T00:00:00')).toBeNull()
    expect(chileInstant('2026-02-30T00:00:00')).toBeNull()
    expect(chileInstant('')).toBeNull()
  })
})

describe('startedWithinDays', () => {
  // 15:30 of the 15th in Chile.
  const afternoon = new Date('2026-11-15T18:30:00.000Z')
  // 22:30 of the 15th in Chile, already the 16th in UTC.
  const lateEvening = new Date('2026-11-16T01:30:00.000Z')

  test('a day counts while it started, in Chile, no more than that many days ago', () => {
    expect(startedWithinDays('2026-11-15', 1, afternoon)).toBe(true)
    expect(startedWithinDays('2026-11-14', 1, afternoon)).toBe(false)
    expect(startedWithinDays('2026-11-14', 2, afternoon)).toBe(true)
    expect(startedWithinDays('2026-05-19', 180, afternoon)).toBe(false)
    expect(startedWithinDays('2026-05-20', 180, afternoon)).toBe(true)
  })

  test('the day is the one in Chile, not the one in UTC', () => {
    expect(startedWithinDays('2026-11-15', 1, lateEvening)).toBe(true)
    expect(startedWithinDays('2026-11-14', 1, lateEvening)).toBe(false)
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

  test('a missing value is an invalid date, not a crash', () => {
    expect(() => toIsoDate(undefined as unknown as string)).toThrow(DteError)
  })

  test('isIsoDate', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('2024-02-29')).toBe(true)
    expect(isIsoDate('2026-2-2')).toBe(false)
  })

  test('isPeriod', () => {
    expect(isPeriod('2026-10')).toBe(true)
    expect(isPeriod('2026-12')).toBe(true)
    expect(isPeriod('2026-00')).toBe(false)
    expect(isPeriod('2026-13')).toBe(false)
    expect(isPeriod('202610')).toBe(false)
    expect(isPeriod('2026-10-01')).toBe(false)
  })
})
