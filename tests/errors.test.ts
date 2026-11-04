import { DteError, DTE_ERROR_CODES, errorCode, errorMessage, isDteError } from '../src/errors'

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

  test('phase 2 codes exist with generic messages', () => {
    expect(new DteError('TRANSPORT_FAILED').message).toBe('HTTP request failed before a response arrived')
    expect(new DteError('TRANSPORT_TLS').message).toBe('TLS handshake or certificate verification failed')
    expect(new DteError('SII_UPLOAD_REJECTED').message).toBe('SII rejected the upload')
    expect(new DteError('WAIT_TIMEOUT').message).toBe('Timed out waiting for the SII status')
  })

  test('the figures of a day the backup cannot download appear in the message; what the portal said never does', () => {
    const error = new DteError('SII_PORTAL_REJECTED', {
      rejection: 'backupDayUnknownTypes',
      day: '2026-10-05',
      listed: 30,
      covered: 25,
      portalMessage: 'texto del portal',
    })
    expect(error.message).toContain('day=2026-10-05')
    expect(error.message).toContain('listed=30')
    expect(error.message).toContain('covered=25')
    expect(error.message).not.toContain('texto del portal')
  })

  test('phase 2 safe keys appear in the message; url and body never do', () => {
    const err = new DteError('SII_HTTP_ERROR', {
      httpStatus: 503,
      operation: 'getSeed',
      attempts: 3,
      channel: 'soap',
      url: 'https://maullin.sii.cl/DTEWS/CrSeed.jws?rut=SECRET',
      body: '<html>SECRET</html>',
    })
    expect(err.message).toBe(
      'SII answered with an HTTP error status (httpStatus=503, attempts=3, channel=soap, operation=getSeed)',
    )
    expect(err.message).not.toContain('SECRET')
    expect(new DteError('SII_UPLOAD_REJECTED', { status: '7', trackId: '123', code: 'SCH-00001' }).message).toBe(
      'SII rejected the upload (status=7, code=SCH-00001, trackId=123)',
    )
  })

  test('isDteError narrows', () => {
    expect(isDteError(new DteError('CAF_EXPIRED'))).toBe(true)
    expect(isDteError(new Error('x'))).toBe(false)
    expect(isDteError(null)).toBe(false)
  })
})

describe('errorMessage', () => {
  test('takes the message of an Error and the string form of anything else', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage('plain')).toBe('plain')
    expect(errorMessage(42)).toBe('42')
  })
})

test('errorCode is the code of a DteError and undefined for anything else', () => {
  expect(errorCode(new DteError('INVALID_RUT'))).toBe('INVALID_RUT')
  expect(errorCode(new Error('plain'))).toBeUndefined()
  expect(errorCode('text')).toBeUndefined()
})
