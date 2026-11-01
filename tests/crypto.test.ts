import forge from 'node-forge'
import { sha1Base64, toBinaryString } from '../src/crypto/digest'
import {
  rsaSha1SignBase64,
  rsaSha1VerifyBase64,
  rsaPublicKeyParts,
  rsaPublicKeyPartsFromCertificatePem,
} from '../src/crypto/rsa'
import { parseCertificatePem, rutFromCertificate, certificateBase64 } from '../src/crypto/x509'
import { fixtureText } from './support/fixtures'
import { DteError } from '../src/errors'

const keyPem = fixtureText('cert.key.pem')
const certPem = fixtureText('cert.pem')

describe('digest', () => {
  test('sha1 over UTF-8 and over Latin-1 differ for non-ASCII input', () => {
    expect(sha1Base64('abc')).toBe('qZk+NkcGgWq6PiVxeFDCbJzQ2J0=')
    expect(sha1Base64('ñ', 'utf8')).not.toBe(sha1Base64('ñ', 'latin1'))
    expect(toBinaryString('ñ', 'latin1')).toBe('ñ')
    expect(toBinaryString('ñ', 'utf8')).toBe('Ã±')
  })

  test('latin1 rejects characters outside the charset', () => {
    expect(() => sha1Base64('—', 'latin1')).toThrow(DteError)
  })
})

describe('rsa', () => {
  test('sign and verify (utf8 and latin1), wrong data fails', () => {
    const parts = rsaPublicKeyParts(keyPem)
    expect(parts.exponent).toBe('AQAB')
    expect(parts.modulus).toMatch(/^[A-Za-z0-9+/]+=*$/)
    const signature = rsaSha1SignBase64(keyPem, '<DD>ñ</DD>', 'latin1')
    expect(rsaSha1VerifyBase64(parts, '<DD>ñ</DD>', 'latin1', signature)).toBe(true)
    expect(rsaSha1VerifyBase64(parts, '<DD>n</DD>', 'latin1', signature)).toBe(false)
    expect(rsaSha1VerifyBase64(parts, '<DD>ñ</DD>', 'utf8', signature)).toBe(false)
    expect(rsaSha1VerifyBase64(parts, '<DD>ñ</DD>', 'latin1', 'AAAA')).toBe(false)
    expect(rsaSha1SignBase64(keyPem, 'abc')).toBe(rsaSha1SignBase64(keyPem, 'abc', 'utf8'))
  })

  test('public key parts from the certificate match the private key', () => {
    expect(rsaPublicKeyPartsFromCertificatePem(certPem)).toEqual(rsaPublicKeyParts(keyPem))
  })

  test('modulus has no sign byte and is 256 bytes for a 2048-bit key', () => {
    expect(forge.util.decode64(rsaPublicKeyParts(keyPem).modulus).length).toBe(256)
  })
})

describe('x509', () => {
  test('parses the fixture certificate', () => {
    const cert = parseCertificatePem(certPem)
    expect(cert.rut).toBe('76543210-3')
    expect(cert.commonName).toBe('JUAN PEREZ PRUEBA')
    expect(cert.subject.O).toBe('EMPRESA EJEMPLO SPA')
    expect(cert.subject.serialNumber).toBe('76543210-3')
    expect(cert.notBefore.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(cert.notAfter.toISOString()).toBe('2046-01-01T00:00:00.000Z')
    expect(cert.base64).toBe(certificateBase64(certPem))
    expect(cert.base64).not.toMatch(/\s|BEGIN/)
    expect(cert.publicKey).toEqual(rsaPublicKeyParts(keyPem))
  })

  const RUT_OID = '1.3.6.1.4.1.8321.1'
  const sanExtension = (rut: string) => {
    const otherName = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
      forge.asn1.create(
        forge.asn1.Class.UNIVERSAL,
        forge.asn1.Type.OID,
        false,
        forge.asn1.oidToDer(RUT_OID).getBytes(),
      ),
      forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.UTF8, false, rut),
      ]),
    ])
    const generalNames = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [otherName])
    return { id: '2.5.29.17', name: 'subjectAltName', critical: false, value: generalNames }
  }

  const buildCert = (
    subject: forge.pki.CertificateField[],
    sanRut?: string,
    extraExtensions: readonly object[] = [],
  ): forge.pki.Certificate => {
    const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 })
    const cert = forge.pki.createCertificate()
    cert.publicKey = keys.publicKey
    cert.serialNumber = '01'
    cert.validity.notBefore = new Date('2026-01-01T00:00:00Z')
    cert.validity.notAfter = new Date('2027-01-01T00:00:00Z')
    cert.setSubject(subject)
    cert.setIssuer(subject)
    cert.setExtensions([
      { name: 'basicConstraints', cA: false },
      ...(sanRut ? [sanExtension(sanRut)] : []),
      ...extraExtensions,
    ])
    cert.sign(keys.privateKey, forge.md.sha256.create())
    // Round-trip through DER so extensions are parsed the way a real PFX certificate is.
    return forge.pki.certificateFromAsn1(
      forge.asn1.fromDer(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()),
    )
  }

  test('RUT sources in priority order: SAN, serialNumber, OU, CN, none', () => {
    expect(
      rutFromCertificate(
        buildCert(
          [
            { shortName: 'CN', value: 'Ana' },
            { type: '2.5.4.5', value: '11111111-1' },
          ],
          '12.345.678-5',
        ),
      ),
    ).toBe('12345678-5')
    expect(
      rutFromCertificate(
        buildCert([
          { shortName: 'CN', value: 'Ana' },
          { type: '2.5.4.5', value: '12345678-5' },
        ]),
      ),
    ).toBe('12345678-5')
    expect(
      rutFromCertificate(
        buildCert([
          { shortName: 'CN', value: 'Maria' },
          { shortName: 'OU', value: '7654321-6' },
        ]),
      ),
    ).toBe('7654321-6')
    expect(rutFromCertificate(buildCert([{ shortName: 'CN', value: 'Pedro Soto 14625621-k' }]))).toBe('14625621-K')
    expect(rutFromCertificate(buildCert([{ shortName: 'CN', value: 'Pedro Soto' }]))).toBeNull()
  })

  test('an invalid RUT in a higher-priority source falls through to the next one', () => {
    expect(
      rutFromCertificate(
        buildCert([
          { shortName: 'CN', value: 'Ana 12345678-5' },
          { type: '2.5.4.5', value: '12345678-9' },
        ]),
      ),
    ).toBe('12345678-5')
  })

  test('subject attributes without a known name are skipped; a certificate may have no CN', () => {
    const cert = buildCert([
      { shortName: 'O', value: 'Org' },
      { type: '1.2.3.4', value: 'opaque' },
    ])
    const parsed = parseCertificatePem(forge.pki.certificateToPem(cert))
    expect(parsed.subject).toEqual({ O: 'Org' })
    expect(parsed.commonName).toBeNull()
    expect(parsed.rut).toBeNull()
  })

  test('SAN entries that are not a valid RUT otherName are skipped', () => {
    const { asn1 } = forge
    const otherName = (oid: string, inner: forge.asn1.Asn1) =>
      asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(oid).getBytes()),
        asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [inner]),
      ])
    const utf8 = (text: string) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.UTF8, false, text)
    const names = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.CONTEXT_SPECIFIC, 2, false, 'www.ejemplo.cl'),
      otherName('1.2.3.4', utf8('12345678-5')),
      otherName(RUT_OID, asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [])),
      otherName(RUT_OID, utf8('not a rut')),
    ])
    const cert = buildCert([{ type: '2.5.4.5', value: '7654321-6' }], undefined, [
      { id: '2.5.29.17', name: 'subjectAltName', critical: false, value: names },
    ])
    expect(rutFromCertificate(cert)).toBe('7654321-6')
  })

  test('parseCertificatePem rejects garbage', () => {
    expect(() => parseCertificatePem('not a pem')).toThrow(DteError)
  })
})
