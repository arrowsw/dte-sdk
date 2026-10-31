import { toSiiRut, isSiiRut, splitSiiRut } from '../src/model/rut'
import { DteError } from '../src/errors'

describe('toSiiRut', () => {
  test.each([
    ['12.345.678-5', '12345678-5'],
    ['12345678-5', '12345678-5'],
    ['123456785', '12345678-5'],
    ['14.625.621-k', '14625621-K'],
    ['  76543210-3 ', '76543210-3'],
    ['60803000-K', '60803000-K'],
    ['66666666-6', '66666666-6'],
  ])('normalizes %s to the SII shape %s', (input, expected) => {
    expect(toSiiRut(input)).toBe(expected)
  })

  test.each(['12345678-9', '76543210-K', 'abc', '', '1-9'])('rejects %p with INVALID_RUT', (input) => {
    expect(() => toSiiRut(input)).toThrow(DteError)
    try {
      toSiiRut(input, 'issuer.rut')
    } catch (err) {
      expect((err as DteError).code).toBe('INVALID_RUT')
      expect((err as DteError).details).toEqual({ field: 'issuer.rut' })
      expect((err as DteError).message).not.toContain(input || 'never')
    }
  })

  test('rejects non-strings', () => {
    expect(() => toSiiRut(12345678 as unknown as string)).toThrow(DteError)
    expect(() => toSiiRut(null as unknown as string)).toThrow(DteError)
  })
})

describe('isSiiRut', () => {
  test('accepts only the canonical SII shape of a valid RUT', () => {
    expect(isSiiRut('12345678-5')).toBe(true)
    expect(isSiiRut('12.345.678-5')).toBe(false)
    expect(isSiiRut('12345678-9')).toBe(false)
    expect(isSiiRut(5)).toBe(false)
  })
})

describe('splitSiiRut', () => {
  test('splits body and verifier', () => {
    expect(splitSiiRut(toSiiRut('14625621-K'))).toEqual({ body: '14625621', verifier: 'K' })
  })
})
