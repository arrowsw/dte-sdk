import { DteError, DTE_ERROR_CODES, isDteError } from '../src/errors'

describe('DteError', () => {
  test('carries a stable code, generic message and details', () => {
    const err = new DteError('FIELD_TOO_LONG', { field: 'NmbItem', maxLength: 80, length: 83 })
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('DteError')
    expect(err.code).toBe('FIELD_TOO_LONG')
    expect(err.details).toEqual({ field: 'NmbItem', maxLength: 80, length: 83 })
    expect(err.message).toBe(
      'Field exceeds the maximum length allowed by the SII schema (field=NmbItem, maxLength=80, length=83)',
    )
  })

  test('never echoes free text details into the message', () => {
    const err = new DteError('INVALID_RUT', { field: 'issuer.rut', value: 'SECRET-RUT' })
    expect(err.message).toBe('Invalid RUT (field=issuer.rut)')
    expect(err.message).not.toContain('SECRET')
  })

  test('defaults details to an empty object', () => {
    expect(new DteError('CAF_INVALID').details).toEqual({})
    expect(new DteError('CAF_INVALID').message).toBe('CAF is not valid')
  })

  test.each(Object.values(DTE_ERROR_CODES))('every code has a message: %s', (code) => {
    expect(new DteError(code).message.length).toBeGreaterThan(5)
  })

  test('isDteError narrows', () => {
    expect(isDteError(new DteError('CAF_EXPIRED'))).toBe(true)
    expect(isDteError(new Error('x'))).toBe(false)
    expect(isDteError(null)).toBe(false)
  })
})
