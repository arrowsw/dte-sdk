import type { RsaPublicKeyParts } from '../crypto/rsa'
import type { SiiRut } from '../model/rut'

/**
 * EN: A signing certificate loaded from PKCS#12 or PEM: private key, leaf certificate, chain for mTLS and the
 * identity fields the SII cares about. Plain data; pass it to `signDocument`, `signEnvelope` and the SII client.
 * ES: Certificado de firma cargado desde PKCS#12 o PEM: llave privada, certificado hoja, cadena para mTLS y los campos
 * de identidad que le importan al SII. Datos planos; se pasa a `signDocument`, `signEnvelope` y al cliente del SII.
 */
export type Certificate = {
  /** EN: Private key PEM. ES: Llave privada en PEM. */
  readonly privateKeyPem: string
  /** EN: Leaf certificate PEM (XML signing). ES: Certificado hoja en PEM (firma XML). */
  readonly certificatePem: string
  /** EN: Leaf → intermediates → root PEM (TLS client auth); equals `certificatePem` when there is no chain. ES: Hoja → intermedios → raíz en PEM (autenticación TLS); igual a `certificatePem` si no hay cadena. */
  readonly chainPem: string
  /** EN: Leaf DER in base64 (`X509Certificate`). ES: Hoja en DER base64 (`X509Certificate`). */
  readonly certificateBase64: string
  /** EN: Public modulus/exponent (`RSAKeyValue`). ES: Módulo/exponente públicos (`RSAKeyValue`). */
  readonly publicKey: RsaPublicKeyParts
  /** EN: Holder RUT or null. ES: RUT del titular o null. */
  readonly rut: SiiRut | null
  /** EN: Common name. ES: Nombre común. */
  readonly commonName: string | null
  /** EN: Subject fields. ES: Campos del sujeto. */
  readonly subject: Readonly<Record<string, string>>
  /** EN: Validity start. ES: Inicio de vigencia. */
  readonly notBefore: Date
  /** EN: Validity end. ES: Fin de vigencia. */
  readonly notAfter: Date
}

/**
 * EN: Options shared by the certificate loaders.
 * ES: Opciones comunes a los cargadores de certificado.
 */
export type LoadCertificateOptions = {
  /** EN: Clock for the expiry check (tests). ES: Reloj para el chequeo de vigencia (tests). */
  readonly now?: Date
  /** EN: Load an expired certificate instead of throwing `CERT_EXPIRED`. ES: Cargar un certificado vencido en vez de lanzar `CERT_EXPIRED`. */
  readonly allowExpired?: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * EN: True when `now` is past `notAfter` minus `marginDays`.
 * ES: True cuando `now` pasó `notAfter` menos `marginDays`.
 */
export const isCertificateExpired = (
  certificate: Pick<Certificate, 'notAfter'>,
  options: { readonly now?: Date; readonly marginDays?: number } = {},
): boolean =>
  (options.now ?? new Date()).getTime() > certificate.notAfter.getTime() - (options.marginDays ?? 0) * DAY_MS

/**
 * EN: Whole days until `notAfter` (negative once expired).
 * ES: Días enteros hasta `notAfter` (negativo una vez vencido).
 */
export const daysUntilExpiry = (
  certificate: Pick<Certificate, 'notAfter'>,
  options: { readonly now?: Date } = {},
): number => Math.floor((certificate.notAfter.getTime() - (options.now ?? new Date()).getTime()) / DAY_MS)
