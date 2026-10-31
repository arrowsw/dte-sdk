import { sanitizeText, foldToAscii, truncateText, assertMaxLength } from '../src/text/sanitize'
import { DteError } from '../src/errors'

describe('sanitizeText', () => {
  test.each([
    ["CAPACITACION USO PLC'S CNC", 'CAPACITACION USO PLCS CNC'],
    ['Cable de 3" marca X', 'Cable de 3 marca X'],
    ['acento ´ y grave `', 'acento  y grave'],
    ['guion — largo – corto', 'guion - largo - corto'],
    ['puntos…', 'puntos...'],
    ['emoji 🚀 fuera', 'emoji  fuera'],
    ['comillas “tipográficas” y ‘simples’', 'comillas tipográficas y simples'],
    ['  bordes  ', 'bordes'],
    ['ñandú Ü ç', 'ñandú Ü ç'],
  ])('%p → %p', (input, expected) => {
    expect(sanitizeText(input)).toBe(expected)
  })

  test('null and undefined become empty', () => {
    expect(sanitizeText(undefined)).toBe('')
    expect(sanitizeText(null)).toBe('')
  })

  test('is idempotent', () => {
    const once = sanitizeText('Cajón “X” — ok… 🚀')
    expect(sanitizeText(once)).toBe(once)
  })
})

describe('foldToAscii (TED only)', () => {
  test.each([
    ['Cajón AFECTO', 'Cajon AFECTO'],
    ['Pañuelo', 'Panuelo'],
    ['CIGUEÑALES', 'CIGUENALES'],
    ['Straße', 'Strasse'],
    ['ﬁn Œuvre Æsir Øre Þor ð', 'fin OEuvre AEsir Ore THor d'],
    ['emoji 🚀', 'emoji'],
    ['Ü ü ç', 'U u c'],
  ])('%p → %p', (input, expected) => {
    expect(foldToAscii(input)).toBe(expected)
  })

  test('output is printable ASCII only', () => {
    expect(foldToAscii('áéíóú ñ Ñ ¿? ¡! € ©')).toMatch(/^[\x20-\x7E]*$/)
  })
})

describe('truncateText', () => {
  test('sanitizes then cuts', () => {
    expect(truncateText('abcdef', 3)).toBe('abc')
    expect(truncateText('ab', 3)).toBe('ab')
    expect(truncateText("a'bcdef", 3)).toBe('abc')
  })

  test('preserveWords keeps whole words when the cut is late enough', () => {
    expect(truncateText('hola mundo cruel', 12, true)).toBe('hola mundo')
    expect(truncateText('holamundocruel xx', 12, true)).toBe('holamundocru')
  })
})

describe('assertMaxLength', () => {
  test('passes at the limit and throws past it', () => {
    expect(() => assertMaxLength('x'.repeat(80), 80, 'NmbItem')).not.toThrow()
    expect(() => assertMaxLength('x'.repeat(81), 80, 'NmbItem')).toThrow(DteError)
    try {
      assertMaxLength('MARMITA'.repeat(12), 80, 'NmbItem')
    } catch (err) {
      const e = err as DteError
      expect(e.code).toBe('FIELD_TOO_LONG')
      expect(e.details).toEqual({ field: 'NmbItem', maxLength: 80, length: 84, value: 'MARMITA'.repeat(12) })
      expect(e.message).not.toContain('MARMITA')
    }
  })
})
