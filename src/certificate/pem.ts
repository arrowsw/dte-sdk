import { rsaPublicKeyParts } from '../crypto/rsa'
import { parseCertificatePem } from '../crypto/x509'
import { DteError, errorMessage } from '../errors'
import { isCertificateExpired, type Certificate, type LoadCertificateOptions } from './certificate'

/**
 * EN: PEM material for `loadCertificateFromPem`.
 * ES: Material PEM para `loadCertificateFromPem`.
 */
export type PemCertificateInput = {
  /** EN: Private key PEM (PKCS#1 `RSA PRIVATE KEY` or PKCS#8 `PRIVATE KEY`, unencrypted). ES: Llave privada PEM (PKCS#1 o PKCS#8, sin cifrar). */
  readonly privateKeyPem: string
  /** EN: Leaf certificate PEM. ES: Certificado hoja PEM. */
  readonly certificatePem: string
  /** EN: Full chain PEM for TLS; defaults to the leaf. ES: Cadena completa PEM para TLS; por defecto la hoja. */
  readonly chainPem?: string
}

/**
 * EN: Builds a `Certificate` from PEM strings (e.g. after `openssl pkcs12 -nodes`). Verifies the key matches the
 * certificate and that it is valid now: not expired, and not before its `notBefore`.
 * ES: Construye un `Certificate` desde strings PEM (p. ej. tras `openssl pkcs12 -nodes`). Verifica que la llave
 * corresponda al certificado y que esté vigente ahora: no vencido, y no antes de su `notBefore`.
 * @throws {DteError} EN: `CERT_INVALID`, `CERT_EXPIRED`, `CERT_NOT_YET_VALID`. ES: `CERT_INVALID`, `CERT_EXPIRED`, `CERT_NOT_YET_VALID`.
 */
export const loadCertificateFromPem = (
  input: PemCertificateInput,
  options: LoadCertificateOptions = {},
): Certificate => {
  const parsed = parseCertificatePem(input.certificatePem)
  const keyParts = (() => {
    try {
      return rsaPublicKeyParts(input.privateKeyPem)
    } catch (error) {
      throw new DteError('CERT_INVALID', { reason: `private key: ${errorMessage(error)}` })
    }
  })()
  if (keyParts.modulus !== parsed.publicKey.modulus)
    throw new DteError('CERT_INVALID', { reason: 'private key does not match the certificate' })
  if (!options.allowExpired && isCertificateExpired(parsed, { now: options.now }))
    throw new DteError('CERT_EXPIRED', { expiresAt: parsed.notAfter })
  if (!options.allowExpired && (options.now ?? new Date()).getTime() < parsed.notBefore.getTime())
    throw new DteError('CERT_NOT_YET_VALID', { validFrom: parsed.notBefore })
  return {
    privateKeyPem: input.privateKeyPem,
    certificatePem: input.certificatePem,
    chainPem: input.chainPem ?? input.certificatePem,
    certificateBase64: parsed.base64,
    publicKey: parsed.publicKey,
    rut: parsed.rut,
    commonName: parsed.commonName,
    subject: parsed.subject,
    notBefore: parsed.notBefore,
    notAfter: parsed.notAfter,
  }
}
