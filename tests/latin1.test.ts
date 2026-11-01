import { encodeLatin1, decodeLatin1 } from '../src/text/latin1'
import { DteError } from '../src/errors'

describe('latin1', () => {
  test('round-trips every Latin-1 code point', () => {
    const all = Array.from({ length: 256 }, (_, i) => String.fromCharCode(i)).join('')
    const bytes = encodeLatin1(all)
    expect(bytes.length).toBe(256)
    expect(bytes[0xf1]).toBe(0xf1)
    expect(decodeLatin1(bytes)).toBe(all)
  })

  test('ñ is one byte (0xF1), not two', () => {
    expect(Array.from(encodeLatin1('ñ'))).toEqual([0xf1])
  })

  test('rejects characters outside Latin-1 instead of truncating them', () => {
    expect(() => encodeLatin1('a—b')).toThrow(DteError)
    try {
      encodeLatin1('ok🚀')
    } catch (err) {
      expect((err as DteError).code).toBe('ENCODING_UNSUPPORTED_CHAR')
      expect((err as DteError).details).toEqual({ index: 2, codePoint: 0xd83d })
    }
  })

  test('decodes large arrays', () => {
    const bytes = new Uint8Array(100000).fill(0x41)
    expect(decodeLatin1(bytes).length).toBe(100000)
  })
})
