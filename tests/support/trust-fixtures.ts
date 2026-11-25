// A small public key infrastructure for the tests of who signed a received document: certification authorities and
// the certificates they issue, made on the spot. Every name and RUT is fictitious.
import forge from 'node-forge'
import type { Certificate } from '../../src/certificate/certificate'
import { loadCertificateFromPem } from '../../src/certificate/pem'
import { FIXED_NOW } from './fixtures'

const RUT_OID = '1.3.6.1.4.1.8321.1'

// The holder's RUT as Chilean certificates carry it: an otherName of the subject alternative name.
const rutAltName = (rut: string) => ({
  id: '2.5.29.17',
  name: 'subjectAltName',
  critical: false,
  value: forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
    forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
      forge.asn1.create(
        forge.asn1.Class.UNIVERSAL,
        forge.asn1.Type.OID,
        false,
        forge.asn1.oidToDer(RUT_OID).getBytes(),
      ),
      forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.IA5STRING, false, rut),
      ]),
    ]),
  ]),
})

const built = new Map<string, unknown>()
const once = <T>(key: string, build: () => T): T => {
  if (!built.has(key)) built.set(key, build())
  return built.get(key) as T
}

/** A certification authority: its certificate, as PEM and as DER bytes, and the key it issues with. */
export type Authority = {
  readonly name: string
  readonly pem: string
  readonly der: Uint8Array
  readonly certificate: forge.pki.Certificate
  readonly privateKey: forge.pki.rsa.PrivateKey
}

const derOf = (certificate: forge.pki.Certificate): Uint8Array =>
  Uint8Array.from(Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes(), 'binary'))

const AUTHORITY_EXTENSIONS: readonly Record<string, unknown>[] = [
  { name: 'basicConstraints', cA: true, critical: true },
  { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
]

/**
 * A self-signed certificate named `name` that issues others; `variant` tells apart two of the same name, and
 * `extensions` replaces the ones that make it an authority.
 */
export const authority = (
  name: string,
  variant = '',
  extensions: readonly Record<string, unknown>[] = AUTHORITY_EXTENSIONS,
): Authority =>
  once(`authority ${name} ${variant} ${JSON.stringify(extensions)}`, () => {
    const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 })
    const certificate = forge.pki.createCertificate()
    certificate.publicKey = keys.publicKey
    certificate.serialNumber = '01'
    certificate.validity.notBefore = new Date('2020-01-01T00:00:00Z')
    certificate.validity.notAfter = new Date('2040-01-01T00:00:00Z')
    const subject = [
      { name: 'commonName', value: name },
      { name: 'countryName', value: 'CL' },
    ]
    certificate.setSubject(subject)
    certificate.setIssuer(subject)
    certificate.setExtensions([...extensions])
    certificate.sign(keys.privateKey, forge.md.sha256.create())
    return {
      name,
      pem: forge.pki.certificateToPem(certificate),
      der: derOf(certificate),
      certificate,
      privateKey: keys.privateKey,
    }
  })

/** What a signer's certificate says and who issues it; `issuer` null makes it self-signed. */
export type SignerSpec = {
  readonly issuer: Authority | null
  readonly rut?: string
  /** The common name; null for a certificate without one. */
  readonly name?: string | null
  readonly notBefore?: string
  readonly notAfter?: string
  /** Extensions beside the usual ones, such as a critical one the chain check does not know. */
  readonly extensions?: readonly Record<string, unknown>[]
}

/** A signer's certificate with its key, ready to sign documents with, and its PEM. */
export const signerOf = (spec: SignerSpec): { readonly certificate: Certificate; readonly pem: string } =>
  once(
    `signer ${spec.issuer?.name ?? 'self'} ${spec.issuer?.pem ?? ''} ${JSON.stringify({ ...spec, issuer: null })}`,
    () => {
      const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 })
      const certificate = forge.pki.createCertificate()
      certificate.publicKey = keys.publicKey
      certificate.serialNumber = '02'
      certificate.validity.notBefore = new Date(spec.notBefore ?? '2026-01-01T00:00:00Z')
      certificate.validity.notAfter = new Date(spec.notAfter ?? '2028-01-01T00:00:00Z')
      const subject = [
        ...(spec.name === null ? [] : [{ name: 'commonName', value: spec.name ?? 'PEDRO PRUEBA SOTO' }]),
        { name: 'countryName', value: 'CL' },
      ]
      certificate.setSubject(subject)
      certificate.setIssuer(spec.issuer === null ? subject : spec.issuer.certificate.subject.attributes)
      certificate.setExtensions([
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, nonRepudiation: true, critical: true },
        ...(spec.rut === undefined ? [] : [rutAltName(spec.rut)]),
        ...(spec.extensions ?? []),
      ])
      certificate.sign(spec.issuer === null ? keys.privateKey : spec.issuer.privateKey, forge.md.sha256.create())
      const pem = forge.pki.certificateToPem(certificate)
      return {
        certificate: loadCertificateFromPem(
          { privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey), certificatePem: pem },
          { now: FIXED_NOW, allowExpired: true },
        ),
        pem,
      }
    },
  )

/** A signer's certificate and key taken as an issuer: what its holder would use to issue certificates of its own. */
export const asIssuer = (signer: { readonly certificate: Certificate; readonly pem: string }): Authority => {
  const certificate = forge.pki.certificateFromPem(signer.pem)
  return {
    name: String(certificate.subject.getField('CN')?.value),
    pem: signer.pem,
    der: derOf(certificate),
    certificate,
    privateKey: forge.pki.privateKeyFromPem(signer.certificate.privateKeyPem),
  }
}
