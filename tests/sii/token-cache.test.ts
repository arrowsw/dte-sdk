import { loadCertificateFromPem } from '../../src/certificate/pem'
import { certificateFingerprint, createMemoryTokenCache, tokenCacheKey } from '../../src/sii/token-cache'
import { fixtureText, FIXED_NOW } from '../support/fixtures'

const certificate = loadCertificateFromPem(
  { privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') },
  { now: FIXED_NOW },
)

describe('tokenCacheKey', () => {
  test('fingerprint is the SHA-1 of the DER certificate, in hex', () => {
    expect(certificateFingerprint(certificate)).toMatch(/^[0-9a-f]{40}$/)
    expect(certificateFingerprint(certificate)).toBe(
      certificateFingerprint({ certificateBase64: certificate.certificateBase64 }),
    )
  })

  test('key separates environment, channel and certificate, and carries no RUT', () => {
    const key = tokenCacheKey('certification', 'soap', certificate)
    expect(key).toBe(`certification:soap:${certificateFingerprint(certificate)}`)
    expect(key).not.toBe(tokenCacheKey('production', 'soap', certificate))
    expect(key).not.toBe(tokenCacheKey('certification', 'rest', certificate))
    expect(key).not.toContain('76543210')
  })
})

describe('createMemoryTokenCache', () => {
  test('get, set and delete', async () => {
    const cache = createMemoryTokenCache()
    expect(await cache.get('k')).toBeNull()
    await cache.set('k', { token: 'ABC', expiresAt: 1000 })
    expect(await cache.get('k')).toEqual({ token: 'ABC', expiresAt: 1000 })
    await cache.delete('k')
    expect(await cache.get('k')).toBeNull()
  })

  test('two caches do not share entries', async () => {
    const a = createMemoryTokenCache()
    const b = createMemoryTokenCache()
    await a.set('k', { token: 'A', expiresAt: 1 })
    expect(await b.get('k')).toBeNull()
  })
})
