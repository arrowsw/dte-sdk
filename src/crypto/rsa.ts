import forge from 'node-forge'
import { toBinaryString, type TextEncoding } from './digest'

/**
 * EN: RSA public key as the big-endian unsigned base64 integers XMLDSig `RSAKeyValue` and the CAF `RSAPK` use.
 * ES: Clave pública RSA como los enteros base64 big-endian sin signo que usan `RSAKeyValue` de XMLDSig y `RSAPK` del CAF.
 */
export type RsaPublicKeyParts = {
  /** EN: `Modulus` / `M`. ES: `Modulus` / `M` — Módulo. */
  readonly modulus: string
  /** EN: `Exponent` / `E`. ES: `Exponent` / `E` — Exponente público. */
  readonly exponent: string
}

const bigIntToBase64 = (value: forge.jsbn.BigInteger): string => {
  const hex = value.toString(16)
  return forge.util.encode64(forge.util.hexToBytes(hex.length % 2 === 1 ? `0${hex}` : hex))
}

const base64ToBigInt = (value: string): forge.jsbn.BigInteger =>
  new forge.jsbn.BigInteger(forge.util.bytesToHex(forge.util.decode64(value)), 16)

const sha1Of = (data: string, encoding: TextEncoding): forge.md.MessageDigest => {
  const md = forge.md.sha1.create()
  md.update(toBinaryString(data, encoding))
  return md
}

/**
 * EN: Public modulus and exponent of a PEM private key (PKCS#1 or PKCS#8).
 * ES: Módulo y exponente públicos de una clave privada PEM (PKCS#1 o PKCS#8).
 */
export const rsaPublicKeyParts = (privateKeyPem: string): RsaPublicKeyParts => {
  const key = forge.pki.privateKeyFromPem(privateKeyPem)
  return { modulus: bigIntToBase64(key.n), exponent: bigIntToBase64(key.e) }
}

/**
 * EN: Public modulus and exponent of a PEM certificate.
 * ES: Módulo y exponente públicos de un certificado PEM.
 */
export const rsaPublicKeyPartsFromCertificatePem = (certificatePem: string): RsaPublicKeyParts => {
  const publicKey = forge.pki.certificateFromPem(certificatePem).publicKey as forge.pki.rsa.PublicKey
  return { modulus: bigIntToBase64(publicKey.n), exponent: bigIntToBase64(publicKey.e) }
}

/**
 * EN: SHA1withRSA (PKCS#1 v1.5) signature of `data`, base64. Deterministic: same key and bytes, same signature.
 * ES: Firma SHA1withRSA (PKCS#1 v1.5) de `data`, en base64. Determinista: misma clave y bytes, misma firma.
 */
export const rsaSha1SignBase64 = (privateKeyPem: string, data: string, encoding: TextEncoding = 'utf8'): string => {
  const key = forge.pki.privateKeyFromPem(privateKeyPem)
  return forge.util.encode64(key.sign(sha1Of(data, encoding)))
}

/**
 * EN: Verifies a SHA1withRSA base64 signature against a public key given as modulus/exponent. Never throws: malformed input is `false`.
 * ES: Verifica una firma SHA1withRSA en base64 contra una clave pública dada como módulo/exponente. Nunca lanza: entrada malformada es `false`.
 */
export const rsaSha1VerifyBase64 = (
  publicKey: RsaPublicKeyParts,
  data: string,
  encoding: TextEncoding,
  signatureBase64: string,
): boolean => {
  try {
    const key = forge.pki.setRsaPublicKey(base64ToBigInt(publicKey.modulus), base64ToBigInt(publicKey.exponent))
    return key.verify(sha1Of(data, encoding).digest().getBytes(), forge.util.decode64(signatureBase64))
  } catch {
    return false
  }
}
