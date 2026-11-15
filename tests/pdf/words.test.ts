import { amountInWords, formatQuantity, longDate } from '../../src/pdf/words'

describe('amountInWords', () => {
  test.each([
    [0, 'cero pesos'],
    [1, 'un peso'],
    [2, 'dos pesos'],
    [15, 'quince pesos'],
    [16, 'dieciséis pesos'],
    [21, 'veintiún pesos'],
    [22, 'veintidós pesos'],
    [30, 'treinta pesos'],
    [31, 'treinta y un pesos'],
    [99, 'noventa y nueve pesos'],
    [100, 'cien pesos'],
    [101, 'ciento un pesos'],
    [500, 'quinientos pesos'],
    [999, 'novecientos noventa y nueve pesos'],
    [1_000, 'mil pesos'],
    [1_001, 'mil un pesos'],
    [2_000, 'dos mil pesos'],
    [10_665, 'diez mil seiscientos sesenta y cinco pesos'],
    [21_000, 'veintiún mil pesos'],
    [100_000, 'cien mil pesos'],
    [101_001, 'ciento un mil un pesos'],
    [1_000_000, 'un millón de pesos'],
    [1_000_001, 'un millón un pesos'],
    [2_000_000, 'dos millones de pesos'],
    [13_028_535, 'trece millones veintiocho mil quinientos treinta y cinco pesos'],
    [21_000_000, 'veintiún millones de pesos'],
    [1_000_000_000, 'mil millones de pesos'],
    [2_500_000_000, 'dos mil quinientos millones de pesos'],
    [1_000_000_000_000, 'un billón de pesos'],
    [3_000_001_000_000, 'tres billones un millón de pesos'],
    [3_000_000_000_001, 'tres billones un pesos'],
  ])('%d', (value, words) => {
    expect(amountInWords(value)).toBe(words)
  })

  test('a negative amount, as the total of a settlement invoice may be, says so', () => {
    expect(amountInWords(-1_500)).toBe('menos mil quinientos pesos')
  })

  test('an amount it cannot say exactly has no words', () => {
    expect(amountInWords(1.5)).toBe('')
    expect(amountInWords(Number.MAX_SAFE_INTEGER + 1)).toBe('')
    expect(amountInWords(Number.NaN)).toBe('')
  })
})

describe('longDate', () => {
  test('writes the month in words', () => {
    expect(longDate('2026-11-05')).toBe('5 de noviembre de 2026')
    expect(longDate('2026-01-31')).toBe('31 de enero de 2026')
    expect(longDate('2026-12-15')).toBe('15 de diciembre de 2026')
  })

  test('leaves as written what is not a date', () => {
    expect(longDate('05/11/2026')).toBe('05/11/2026')
    expect(longDate('2026-13-01')).toBe('2026-13-01')
    expect(longDate('2026-00-10')).toBe('2026-00-10')
    expect(longDate('')).toBe('')
  })
})

describe('formatQuantity', () => {
  test('separates the thousands with a point and the decimals with a comma, up to six', () => {
    expect(formatQuantity(2)).toBe('2')
    expect(formatQuantity(1051.5)).toBe('1.051,5')
    expect(formatQuantity(10412.125)).toBe('10.412,125')
    expect(formatQuantity(0.123456)).toBe('0,123456')
    expect(formatQuantity(1234567.000001)).toBe('1.234.567,000001')
  })
})
