import forge from 'node-forge'
import { isCertificateExpired, daysUntilExpiry } from '../src/certificate/certificate'
import { loadCertificateFromPem } from '../src/certificate/pem'
import { loadCertificateFromPkcs12 } from '../src/certificate/pkcs12'
import { DteError } from '../src/errors'
import { fixtureBytes, fixtureText, FIXED_NOW, FIXTURE_PASSWORD } from './support/fixtures'

const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn()
    throw new Error('expected DteError')
  } catch (err) {
    expect(err).toBeInstanceOf(DteError)
    expect((err as DteError).code).toBe(code)
  }
}

describe('loadCertificateFromPkcs12', () => {
  test.each(['cert.pfx', 'cert-aes.pfx'])('%s: legacy and modern PKCS#12 both load', (file) => {
    const cert = loadCertificateFromPkcs12(fixtureBytes(file), FIXTURE_PASSWORD, { now: FIXED_NOW })
    expect(cert.rut).toBe('76543210-3')
    expect(cert.commonName).toBe('JUAN PEREZ PRUEBA')
    expect(cert.subject.O).toBe('EMPRESA EJEMPLO SPA')
    expect(cert.notAfter.toISOString()).toBe('2046-01-01T00:00:00.000Z')
    expect(cert.privateKeyPem).toMatch(/^-----BEGIN RSA PRIVATE KEY-----/)
    expect(cert.certificatePem).toMatch(/^-----BEGIN CERTIFICATE-----/)
    expect(cert.chainPem).toBe(cert.certificatePem)
    expect(cert.certificateBase64).not.toMatch(/\s/)
    expect(cert.publicKey.exponent).toBe('AQAB')
  })

  test('wrong password', () => {
    expectCode(
      () => loadCertificateFromPkcs12(fixtureBytes('cert.pfx'), 'nope', { now: FIXED_NOW }),
      'CERT_PASSWORD_WRONG',
    )
  })

  test('garbage bytes', () => {
    expectCode(() => loadCertificateFromPkcs12(new Uint8Array([1, 2, 3]), 'x'), 'CERT_INVALID')
  })

  test('expired certificate is rejected unless allowExpired', () => {
    expectCode(
      () => loadCertificateFromPkcs12(fixtureBytes('cert-expired.pfx'), FIXTURE_PASSWORD, { now: FIXED_NOW }),
      'CERT_EXPIRED',
    )
    const cert = loadCertificateFromPkcs12(fixtureBytes('cert-expired.pfx'), FIXTURE_PASSWORD, {
      now: FIXED_NOW,
      allowExpired: true,
    })
    expect(cert.notAfter.toISOString()).toBe('2021-01-01T00:00:00.000Z')
  })

  test('orders a chain leaf → intermediate → root whatever the bag order', () => {
    const makeKeyPair = () => forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 })
    const makeCert = (
      subject: string,
      keys: forge.pki.rsa.KeyPair,
      issuer: { name: string; keys: forge.pki.rsa.KeyPair } | null,
      ca: boolean,
    ) => {
      const cert = forge.pki.createCertificate()
      cert.publicKey = keys.publicKey
      cert.serialNumber = String(Math.floor(Math.random() * 1e6) + 1)
      cert.validity.notBefore = new Date('2026-01-01T00:00:00Z')
      cert.validity.notAfter = new Date('2036-01-01T00:00:00Z')
      cert.setSubject([{ name: 'commonName', value: subject }])
      cert.setIssuer([{ name: 'commonName', value: issuer ? issuer.name : subject }])
      cert.setExtensions([{ name: 'basicConstraints', cA: ca }])
      cert.sign(issuer ? issuer.keys.privateKey : keys.privateKey, forge.md.sha256.create())
      return cert
    }
    const rootKeys = makeKeyPair()
    const intermediateKeys = makeKeyPair()
    const leafKeys = makeKeyPair()
    const root = makeCert('Root CA', rootKeys, null, true)
    const intermediate = makeCert('Intermediate CA', intermediateKeys, { name: 'Root CA', keys: rootKeys }, true)
    const leaf = makeCert('Leaf', leafKeys, { name: 'Intermediate CA', keys: intermediateKeys }, false)
    const asn1 = forge.pkcs12.toPkcs12Asn1(leafKeys.privateKey, [root, leaf, intermediate], 'pw', { algorithm: '3des' })
    const bytes = new Uint8Array(Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary'))

    const cert = loadCertificateFromPkcs12(bytes, 'pw', { now: FIXED_NOW })
    expect(cert.commonName).toBe('Leaf')
    expect(cert.rut).toBeNull()
    const pems = cert.chainPem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? []
    expect(pems.length).toBe(3)
    expect(pems.map((pem) => forge.pki.certificateFromPem(pem).subject.getField('CN').value)).toEqual([
      'Leaf',
      'Intermediate CA',
      'Root CA',
    ])
  })
})

describe('loadCertificateFromPem', () => {
  const privateKeyPem = fixtureText('cert.key.pem')
  const certificatePem = fixtureText('cert.pem')

  test('loads a matching key/cert pair', () => {
    const cert = loadCertificateFromPem({ privateKeyPem, certificatePem }, { now: FIXED_NOW })
    expect(cert.rut).toBe('76543210-3')
    expect(cert.chainPem).toBe(certificatePem)
    expect(
      loadCertificateFromPem({ privateKeyPem, certificatePem, chainPem: 'CHAIN' }, { now: FIXED_NOW }).chainPem,
    ).toBe('CHAIN')
  })

  test('rejects a key that does not match the certificate', () => {
    const other = forge.pki.privateKeyToPem(forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 }).privateKey)
    expectCode(
      () => loadCertificateFromPem({ privateKeyPem: other, certificatePem }, { now: FIXED_NOW }),
      'CERT_INVALID',
    )
    expectCode(
      () => loadCertificateFromPem({ privateKeyPem: 'not a key', certificatePem }, { now: FIXED_NOW }),
      'CERT_INVALID',
    )
  })

  test('expiry helpers', () => {
    const cert = loadCertificateFromPem({ privateKeyPem, certificatePem }, { now: FIXED_NOW })
    expect(isCertificateExpired(cert, { now: FIXED_NOW })).toBe(false)
    expect(isCertificateExpired(cert, { now: new Date('2046-01-02T00:00:00Z') })).toBe(true)
    expect(isCertificateExpired(cert, { now: new Date('2045-12-20T00:00:00Z'), marginDays: 30 })).toBe(true)
    expect(daysUntilExpiry(cert, { now: new Date('2045-12-22T00:00:00Z') })).toBe(10)
    expect(isCertificateExpired(cert)).toBe(false)
    expect(daysUntilExpiry(cert)).toBeGreaterThan(0)
  })
})
