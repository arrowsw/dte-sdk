import forge from 'node-forge'
import { format } from 'rut.ts'
import { DteError, errorMessage } from '../errors'
import { decodeLatin1 } from '../text/latin1'
import type { SiiRut } from '../model/rut'
import type { RsaPublicKeyParts } from './rsa'

const RUT_OID = '1.3.6.1.4.1.8321.1'

/**
 * EN: What dte-sdk reads from an X.509 certificate.
 * ES: Lo que dte-sdk lee de un certificado X.509.
 */
export type ParsedCertificate = {
  /** EN: Subject fields by short name (`CN`, `O`, `OU`, `serialNumber`…). ES: Campos del sujeto por nombre corto (`CN`, `O`, `OU`, `serialNumber`…). */
  readonly subject: Readonly<Record<string, string>>
  /** EN: Common name. ES: Nombre común (`CN`). */
  readonly commonName: string | null
  /** EN: Validity start. ES: Inicio de vigencia. */
  readonly notBefore: Date
  /** EN: Validity end. ES: Fin de vigencia. */
  readonly notAfter: Date
  /** EN: Holder RUT, SII shape, or null when the certificate carries none. ES: RUT del titular en forma SII, o null si el certificado no lo trae. */
  readonly rut: SiiRut | null
  /** EN: DER certificate in base64, no headers or whitespace (`X509Certificate`). ES: Certificado DER en base64, sin cabeceras ni espacios (`X509Certificate`). */
  readonly base64: string
  /** EN: Public key parts. ES: Partes de la clave pública. */
  readonly publicKey: RsaPublicKeyParts
}

const asSiiRut = (candidate: string | undefined): SiiRut | null => {
  if (candidate === undefined) return null
  const formatted = format(candidate.trim(), { dots: false, throwOnError: false })
  return formatted === null ? null : (formatted as SiiRut)
}

/**
 * EN: Subject attributes keyed by short name (falls back to the long name).
 * ES: Atributos del sujeto por nombre corto (o el nombre largo si no hay corto).
 * @internal
 */
export const subjectFields = (certificate: forge.pki.Certificate): Readonly<Record<string, string>> =>
  Object.fromEntries(
    certificate.subject.attributes.flatMap((attribute) => {
      const key = attribute.shortName ?? attribute.name
      return key === undefined ? [] : [[key, String(attribute.value)] as const]
    }),
  )

// The RUT lives in SubjectAltName as otherName OID 1.3.6.1.4.1.8321.1 (Chilean e-signature law), the one source
// that is consistent across certification authorities.
const rutFromSubjectAltName = (certificate: forge.pki.Certificate): SiiRut | null => {
  const extension = certificate.getExtension('subjectAltName') as {
    altNames?: readonly { type: number; value: unknown }[]
  } | null
  for (const altName of extension?.altNames ?? []) {
    if (altName.type !== 0) continue
    try {
      const [oid, explicit] = altName.value as [forge.asn1.Asn1, forge.asn1.Asn1]
      if (forge.asn1.derToOid(oid.value as string) !== RUT_OID) continue
      const inner = (explicit.value as forge.asn1.Asn1[])[0]
      const rut = asSiiRut(typeof inner?.value === 'string' ? inner.value : undefined)
      if (rut !== null) return rut
    } catch {
      // Not the shape we expect: keep looking, then fall back to the subject.
    }
  }
  return null
}

/**
 * EN: Holder RUT from the certificate: SAN otherName first, then `serialNumber`, `OU` and a RUT-looking token in `CN`.
 * Each candidate must pass rut.ts; invalid ones fall through to the next source.
 * ES: RUT del titular desde el certificado: primero el otherName del SAN, luego `serialNumber`, `OU` y un token con forma
 * de RUT en `CN`. Cada candidato debe pasar rut.ts; los inválidos caen al siguiente origen.
 * @internal
 */
export const rutFromCertificate = (certificate: forge.pki.Certificate): SiiRut | null => {
  const fromSan = rutFromSubjectAltName(certificate)
  if (fromSan !== null) return fromSan
  const subject = subjectFields(certificate)
  const fromCn = /(\d{7,8}-[\dkK])/.exec(subject.CN ?? '')?.[1]
  return asSiiRut(subject.serialNumber) ?? asSiiRut(subject.OU) ?? asSiiRut(fromCn)
}

/**
 * EN: Base64 body of a PEM certificate (no headers, no whitespace).
 * ES: Cuerpo base64 de un certificado PEM (sin cabeceras ni espacios).
 */
export const certificateBase64 = (certificatePem: string): string =>
  certificatePem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')

const bigIntToBase64 = (value: forge.jsbn.BigInteger): string => {
  const hex = value.toString(16)
  return forge.util.encode64(forge.util.hexToBytes(hex.length % 2 === 1 ? `0${hex}` : hex))
}

/**
 * EN: Parses a PEM certificate into the fields dte-sdk needs.
 * ES: Parsea un certificado PEM a los campos que dte-sdk necesita.
 * @throws {DteError} EN: `CERT_INVALID`. ES: `CERT_INVALID`.
 */
export const parseCertificatePem = (certificatePem: string): ParsedCertificate => {
  const certificate = (() => {
    try {
      return forge.pki.certificateFromPem(certificatePem)
    } catch (error) {
      throw new DteError('CERT_INVALID', { reason: errorMessage(error) })
    }
  })()
  const subject = subjectFields(certificate)
  const publicKey = certificate.publicKey as forge.pki.rsa.PublicKey
  return {
    subject,
    commonName: subject.CN ?? null,
    notBefore: certificate.validity.notBefore,
    notAfter: certificate.validity.notAfter,
    rut: rutFromCertificate(certificate),
    base64: certificateBase64(forge.pki.certificateToPem(certificate)),
    publicKey: { modulus: bigIntToBase64(publicKey.n), exponent: bigIntToBase64(publicKey.e) },
  }
}

/**
 * EN: What a certificate says of its holder: the RUT and the name it names, and the dates it is in force between.
 * ES: Lo que un certificado dice de su titular: el RUT y el nombre que nombra, y las fechas entre las que rige.
 */
export type CertificateHolder = {
  /** EN: Holder RUT, SII shape, or null when the certificate carries none. ES: RUT del titular en forma SII, o null si el certificado no lo trae. */
  readonly rut: SiiRut | null
  /** EN: Common name of the holder, or null. ES: Nombre común (`CN`) del titular, o null. */
  readonly name: string | null
  /** EN: Validity start. ES: Inicio de vigencia. */
  readonly notBefore: Date
  /** EN: Validity end. ES: Fin de vigencia. */
  readonly notAfter: Date
}

const PEM_BLOCK = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g

const certificateFromDer = (der: string): forge.pki.Certificate =>
  forge.pki.certificateFromAsn1(forge.asn1.fromDer(der))

/**
 * EN: The certificates a caller trusts, read into a store: each a PEM text, which may hold several certificates, or
 * the DER bytes of one.
 * ES: Los certificados en que confía quien llama, leídos a un almacén: cada uno un texto PEM, que puede traer varios
 * certificados, o los bytes DER de uno.
 * @throws {DteError} EN: `INVALID_OPTION { field: 'trustedCertificates', index }` for an entry that is not a certificate. ES: `INVALID_OPTION { field: 'trustedCertificates', index }` para una entrada que no es un certificado.
 * @internal
 */
export const trustStore = (certificates: readonly (string | Uint8Array)[]): forge.pki.CAStore =>
  forge.pki.createCaStore(
    certificates.flatMap((entry, index) => {
      try {
        if (entry instanceof Uint8Array) return [certificateFromDer(decodeLatin1(entry))]
        const blocks = String(entry).match(PEM_BLOCK) ?? []
        if (blocks.length === 0) throw new Error('no certificate')
        return blocks.map((block) => forge.pki.certificateFromPem(block))
      } catch {
        throw new DteError('INVALID_OPTION', { field: 'trustedCertificates', index })
      }
    }),
  )

/**
 * EN: What a certificate says of its holder, when a certificate of `store` vouches for it: it was issued and signed by
 * one of them, or it is one of them. Null otherwise: for what is not an RSA certificate, for one no trusted
 * certificate issued, for one whose signature does not verify, and for one with a critical extension other than key
 * usage, basic constraints or name constraints. The dates are reported, not held against a clock, and no revocation
 * is looked up.
 * ES: Lo que un certificado dice de su titular, cuando un certificado de `store` responde por él: fue emitido y firmado
 * por uno de ellos, o es uno de ellos. Null si no: para lo que no es un certificado RSA, para uno que ningún
 * certificado de confianza emitió, para uno cuya firma no verifica, y para uno con una extensión crítica distinta de
 * uso de llave, restricciones básicas o restricciones de nombre. Las fechas se informan, no se comparan con un reloj,
 * y no se consulta revocación alguna.
 * @internal
 */
export const trustedHolder = (certificateBase64: string, store: forge.pki.CAStore): CertificateHolder | null => {
  try {
    const certificate = certificateFromDer(forge.util.decode64(certificateBase64))
    forge.pki.verifyCertificateChain(store, [certificate], { validityCheckDate: null })
    return {
      rut: rutFromCertificate(certificate),
      name: subjectFields(certificate).CN ?? null,
      notBefore: certificate.validity.notBefore,
      notAfter: certificate.validity.notAfter,
    }
  } catch {
    return null
  }
}
