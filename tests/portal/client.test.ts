import { BACKUP_ORIGINS, DOCUMENT_OPERATIONS } from '../../src/catalogs/portal'
import { DteError } from '../../src/errors'
import {
  createPortalClient,
  DEFAULT_PORTAL_RETRY_POLICY,
  isRetryablePortalError,
  resolvePortalCompany,
  siiCodeOf,
} from '../../src/portal/client'
import { certificate, failure } from '../support/portal'

const options = { environment: 'certification' as const, certificate }

test('defaults', () => {
  const portal = createPortalClient(options)
  expect(Object.isFrozen(portal)).toBe(true)
  expect(portal.companyRut).toBeNull()
  expect(portal.sessionTtlMs).toBe(90 * 60 * 1000)
  expect(portal.timeoutMs).toBe(20000)
  expect(portal.closePreviousSessions).toBe(true)
  expect(portal.capture).toBeNull()
  expect(portal.retry).toEqual(DEFAULT_PORTAL_RETRY_POLICY)
  expect(portal.now()).toBeInstanceOf(Date)
  expect(typeof portal.transport).toBe('function')
})

test('overrides', () => {
  const portal = createPortalClient({
    ...options,
    companyRut: '76.543.210-3',
    retry: false,
    timeoutMs: 5,
    sessionTtlMs: 7,
    closePreviousSessions: false,
  })
  expect(portal.companyRut).toBe('76543210-3')
  expect(portal.retry).toBe(false)
  expect(portal.timeoutMs).toBe(5)
  expect(portal.sessionTtlMs).toBe(7)
  expect(portal.closePreviousSessions).toBe(false)
  expect(createPortalClient({ ...options, retry: { maxAttempts: 2 } }).retry).toMatchObject({
    maxAttempts: 2,
    retryOn: isRetryablePortalError,
  })
})

test('validation', () => {
  expect(() => createPortalClient({ ...options, environment: 'nope' as never })).toThrow(
    expect.objectContaining({ code: 'INVALID_OPTION', details: { field: 'environment' } }),
  )
  expect(() => createPortalClient({ environment: 'production', certificate: undefined as never })).toThrow(
    expect.objectContaining({ code: 'MISSING_FIELD', details: { field: 'certificate' } }),
  )
  expect(() => createPortalClient({ ...options, timeoutMs: 0 })).toThrow(
    expect.objectContaining({ details: { field: 'timeoutMs' } }),
  )
  expect(() => createPortalClient({ ...options, sessionTtlMs: -1 })).toThrow(
    expect.objectContaining({ details: { field: 'sessionTtlMs' } }),
  )
  expect(() => createPortalClient({ ...options, companyRut: 'nope' })).toThrow(
    expect.objectContaining({ code: 'INVALID_RUT' }),
  )
})

test('the company comes from the call, else the client', () => {
  const portal = createPortalClient({ ...options, companyRut: '76543210-3' })
  expect(resolvePortalCompany(portal, '10000004-0')).toBe('10000004-0')
  expect(resolvePortalCompany(portal)).toBe('76543210-3')
  expect(() => resolvePortalCompany(createPortalClient(options))).toThrow(
    expect.objectContaining({ code: 'MISSING_FIELD', details: { field: 'companyRut' } }),
  )
})

test.each([
  ['TRANSPORT_FAILED', {}, true],
  ['REQUEST_TIMEOUT', {}, true],
  ['SII_HTTP_ERROR', { httpStatus: 502 }, true],
  ['SII_HTTP_ERROR', { httpStatus: 503 }, true],
  ['SII_HTTP_ERROR', { httpStatus: 504 }, true],
  ['SII_HTTP_ERROR', { httpStatus: 500 }, false],
  ['TRANSPORT_TLS', { reason: 'EPROTO' }, true],
  ['TRANSPORT_TLS', { reason: 'ERR_SSL_PACKET_LENGTH_TOO_LONG' }, true],
  ['TRANSPORT_TLS', { reason: 'CERT_HAS_EXPIRED' }, false],
  ['SII_PORTAL_SESSION_LIMIT', {}, false],
  ['SII_PORTAL_BLOCKED', {}, false],
  ['SII_PORTAL_REJECTED', {}, false],
] as const)('retry rule: %s %j', (code, details, expected) => {
  expect(isRetryablePortalError(new DteError(code, details))).toBe(expected)
})

test('anything else is not retried', () => {
  expect(isRetryablePortalError(new Error('x'))).toBe(false)
})

test('the failure helper needs a rejection', async () => {
  await expect(failure(Promise.resolve())).rejects.toThrow('expected a rejection')
})

test('transaction ids are UUIDs by default, and can be injected', () => {
  expect(createPortalClient(options).randomId()).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/)
  expect(createPortalClient({ ...options, randomId: () => 'tx-1' }).randomId()).toBe('tx-1')
})

test('values of the caller become codes of the SII, and an unknown one is refused', () => {
  expect(siiCodeOf(DOCUMENT_OPERATIONS, 'received', 'direction')).toBe(2)
  expect(siiCodeOf(BACKUP_ORIGINS, 'issued', 'direction')).toBe('ENV')
  for (const value of ['sideways', 'toString']) {
    expect(() => siiCodeOf(BACKUP_ORIGINS, value as 'issued', 'direction')).toThrow(
      expect.objectContaining({ code: 'INVALID_OPTION', details: { field: 'direction' } }),
    )
  }
})
