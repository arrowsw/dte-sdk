import { sanitizeText, foldToAscii, truncateText, assertMaxLength } from '../src/text/sanitize'
import { DteError } from '../src/errors'

describe('sanitizeText', () => {
  test.each([
    ["MANTENCION DE UPS'S 10KVA", 'MANTENCION DE UPSS 10KVA'],
    ['Cable de 3" marca X', 'Cable de 3 marca X'],
    ['acento ´ y grave `', 'acento  y grave'],
    ['guion — largo – corto', 'guion - largo - corto'],
    ['puntos…', 'puntos...'],
    // Every dash a text editor writes is a hyphen, and the minus sign too: dropped, `−5` would read `5`.
    ['Lun\u2010Vie \u2011 9\u2012 18 \u2015 fin', 'Lun-Vie - 9- 18 - fin'],
    ['Temperatura \u22125 grados', 'Temperatura -5 grados'],
    // A typographic space is a space: dropped, two words would run together.
    ['10\u202f000 unidades\u2009netas\u3000aqui', '10 000 unidades netas aqui'],
    ['emoji 🚀 fuera', 'emoji  fuera'],
    ['comillas “tipográficas” y ‘simples’', 'comillas tipográficas y simples'],
    ['  bordes  ', 'bordes'],
    ['ñandú Ü ç', 'ñandú Ü ç'],
    // The control characters XML 1.0 forbids go; the tab, the line feed and the carriage return are text.
    ['nulo\u0000 y campana\u0007 y escape\u001b', 'nulo y campana y escape'],
    ['\u0001bordes\u001f', 'bordes'],
    ['tab\ty\nlínea\r\nnueva', 'tab\ty\nlínea\r\nnueva'],
    // A letter outside ISO-8859-1 keeps its base letter, and one Unicode does not decompose has its own spelling.
    ['Škoda Łódź ğ ő', 'Skoda Lódz g o'],
    ['Đorđe ıslak Œuvre cœur', 'Dorde islak OEuvre coeur'],
    // A base letter and a combining accent are composed first, so the accent ISO-8859-1 has stays.
    ['an\u0303o cafe\u0301', 'año café'],
    ['s\u030Cal', 'sal'],
    // A ligature and a compatibility form are spelled out; a fullwidth quote is still a quote.
    ['ﬁn ™ № ℃ ㎏ Ａ１ ‼ 𝐀lfa', 'fin TM No °C kg A1 !! Alfa'],
    ['＂x＇ｙ｀', 'xy'],
    ['Total € 5 ‰', 'Total EUR 5 o/oo'],
    ['• uno ‣ dos ◦ tres ∙ cuatro', '* uno * dos * tres * cuatro'],
    ['Santiago → Arica ← vuelta, 1⁄2 y 3∕4, x ≤ 3 ≥ 1', 'Santiago -> Arica <- vuelta, 1/2 y 3/4, x <= 3 >= 1'],
    // Decoration and what cannot be seen go, as an emoji does.
    ['★ Premium ✓ listo ✔', 'Premium  listo'],
    ['cero\u200Bancho\uFEFF y marca\u200E', 'ceroancho y marca'],
    ['primo 5′ 3″ ‹cita›', 'primo 5 3 cita'],
    ['línea\u2028separada', 'línea separada'],
    ['anillo ˚ suelto \u20E3', 'anillo  suelto'],
    ['daga † y punto 。', 'daga  y punto'],
  ])('%p → %p', (input, expected) => {
    expect(sanitizeText(input)).toBe(expected)
  })

  // Dropping one of these would change what the text says, so the text is refused.
  test.each([
    ['Ω-3 cápsulas', 0, 0x3a9],
    ['Té matcha 抹茶', 10, 0x62b9],
    ['Precio ₿ 2', 7, 0x20bf],
    ['a ≠ b', 2, 0x2260],
    ['suma ∑ total', 5, 0x2211],
    ['10⁴ unidades', 2, 0x2074],
    ['2⅓ tazas', 1, 0x2153],
    ['H₂O', 1, 0x2082],
    ['paso ① listo', 5, 0x2460],
    ['٣ cajas', 0, 0x663],
    // The ohm sign is composed into the Greek letter it is, which has no ISO-8859-1 form either.
    ['ohm \u2126', 4, 0x3a9],
  ])('%p is refused at %p', (input, index, codePoint) => {
    expect.assertions(4)
    try {
      sanitizeText(input, 'NmbItem')
    } catch (error) {
      expect(error).toBeInstanceOf(DteError)
      expect((error as DteError).code).toBe('ENCODING_UNSUPPORTED_CHAR')
      expect((error as DteError).details).toEqual({ field: 'NmbItem', index, codePoint })
      expect((error as DteError).message).not.toContain(input)
    }
  })

  test('the refusal names no field when none was given, and counts in UTF-16 units past an emoji', () => {
    expect.assertions(1)
    try {
      sanitizeText('🚀 Ωmega')
    } catch (error) {
      expect((error as DteError).details).toEqual({ index: 3, codePoint: 0x3a9 })
    }
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
    ['Jamón SERRANO', 'Jamon SERRANO'],
    ['Pañuelo', 'Panuelo'],
    ['CIGUEÑALES', 'CIGUENALES'],
    ['Straße', 'Strasse'],
    ['ﬁn Œuvre Æsir Øre Þor ð', 'fin OEuvre AEsir Ore THor d'],
    ['emoji 🚀', 'emoji'],
    ['Ü ü ç', 'U u c'],
  ])('%p → %p', (input, expected) => {
    expect(foldToAscii(input)).toBe(expected)
  })

  test('null and undefined fold to empty', () => {
    expect(foldToAscii(null)).toBe('')
    expect(foldToAscii(undefined)).toBe('')
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
