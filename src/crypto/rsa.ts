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

const bytesToBigInt = (bytes: string): forge.jsbn.BigInteger =>
  new forge.jsbn.BigInteger(forge.util.bytesToHex(bytes), 16)

const base64ToBigInt = (value: string): forge.jsbn.BigInteger => bytesToBigInt(forge.util.decode64(value))

// The cost of checking a signature grows with the key, and a received document names its own: the CAF its stamp
// carries, the certificate of its signature. A CAF key is 512 to 1024 bits with exponent 3 or 65537 and a certificate
// key at most 4096 bits, so a modulus over 4096 bits or an exponent over 32 bits is refused before the signature is
// tried. The bytes counted are the ones decoded, leading zeros included, so no way of writing the base64 gets a larger
// key past the bound.
const MAX_KEY_BYTES = { modulus: 512, exponent: 4 } as const

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
 * EN: Whether a private key is the pair of a public key given as modulus/exponent, compared as numbers: whitespace in
 * the base64 and leading zero bytes change nothing.
 * ES: Si una llave privada es el par de una clave pública dada como módulo/exponente, comparadas como números: los
 * espacios en el base64 y los bytes cero al inicio no cambian nada.
 * @internal
 */
export const isRsaKeyPair = (privateKey: forge.pki.rsa.PrivateKey, publicKey: RsaPublicKeyParts): boolean =>
  privateKey.n.equals(base64ToBigInt(publicKey.modulus)) && privateKey.e.equals(base64ToBigInt(publicKey.exponent))

/**
 * EN: Public modulus and exponent of a PEM certificate.
 * ES: Módulo y exponente públicos de un certificado PEM.
 */
export const rsaPublicKeyPartsFromCertificatePem = (certificatePem: string): RsaPublicKeyParts => {
  const publicKey = forge.pki.certificateFromPem(certificatePem).publicKey as forge.pki.rsa.PublicKey
  return { modulus: bigIntToBase64(publicKey.n), exponent: bigIntToBase64(publicKey.e) }
}

/**
 * EN: Which code signs: the runtime's own RSA (`native`) or the JavaScript one (`portable`).
 * ES: Qué código firma: el RSA del propio runtime (`native`) o el de JavaScript (`portable`).
 */
export type RsaSigningEngine = 'native' | 'portable'

// The part of `node:crypto` the signature uses.
type NativeKey = { readonly asymmetricKeyType?: string }
type NativeCrypto = {
  readonly createPrivateKey: (pem: string) => NativeKey
  readonly sign: (algorithm: string, data: Uint8Array, key: NativeKey) => { toString(encoding: 'base64'): string }
}

type Runtime = { readonly process?: { readonly getBuiltinModule?: (id: string) => unknown } }

// Node, Bun and Deno hand over their crypto module without an import, so a bundle for the browser never names it and
// no entry loads it at import time. Anything else, a browser among them, has none.
const nativeCrypto = (): NativeCrypto | null => {
  try {
    const builtin = (globalThis as Runtime).process?.getBuiltinModule?.('node:crypto') as NativeCrypto | undefined
    return typeof builtin?.sign === 'function' && typeof builtin.createPrivateKey === 'function' ? builtin : null
  } catch {
    return null
  }
}

const binaryBytes = (binary: string): Uint8Array => Uint8Array.from(binary, (char) => char.charCodeAt(0))

const portableSign = (privateKeyPem: string, data: string, encoding: TextEncoding): string =>
  forge.util.encode64(forge.pki.privateKeyFromPem(privateKeyPem).sign(sha1Of(data, encoding)))

// The runtime takes only the digest from the name it is given and signs with whatever key it is handed, an elliptic
// curve one included. Only an RSA key writes the signature this module promises, so any other is not signed here: null
// leaves it to the portable engine, which refuses it.
const nativeSign = (
  crypto: NativeCrypto,
  privateKeyPem: string,
  data: string,
  encoding: TextEncoding,
): string | null => {
  const key = crypto.createPrivateKey(privateKeyPem)
  if (key.asymmetricKeyType !== 'rsa') return null
  return crypto.sign('RSA-SHA1', binaryBytes(toBinaryString(data, encoding)), key).toString('base64')
}

// Undefined until the first signature settles it; null when the runtime has no RSA of its own or it was set aside.
let trusted: NativeCrypto | null | undefined

// PKCS#1 v1.5 is deterministic, so both engines must write the same signature. The first one of the process is worked
// out with both: equal, the runtime's signs from then on; different, or refused, the portable one does. The runtime is
// never taken at its word.
const settle = (privateKeyPem: string, data: string, encoding: TextEncoding): string => {
  const portable = portableSign(privateKeyPem, data, encoding)
  const crypto = nativeCrypto()
  trusted = null
  if (crypto === null) return portable
  try {
    if (nativeSign(crypto, privateKeyPem, data, encoding) === portable) trusted = crypto
  } catch {
    // A runtime that refuses SHA-1 or the key leaves the portable engine in charge.
  }
  return portable
}

/**
 * EN: The engine the next signature uses, or null before the first one settles it. `native` is the RSA of the runtime
 * (Node, Bun, Deno), an order of magnitude faster on a 2048-bit key; `portable` is the JavaScript one, the only one in
 * a browser.
 * ES: El motor que usa la próxima firma, o null antes de que la primera lo zanje. `native` es el RSA del runtime (Node,
 * Bun, Deno), un orden de magnitud más rápido con una llave de 2048 bits; `portable` es el de JavaScript, el único en
 * un navegador.
 */
export const rsaSigningEngine = (): RsaSigningEngine | null =>
  trusted === undefined ? null : trusted === null ? 'portable' : 'native'

/**
 * EN: SHA1withRSA (PKCS#1 v1.5) signature of `data`, base64. Deterministic: same key and bytes, same signature, which
 * is what lets the runtime's own RSA sign when there is one. The first signature of the process is worked out by the
 * runtime and by the JavaScript engine and compared; only when they agree does the runtime sign the ones that follow,
 * and a key it refuses is still signed by the JavaScript engine. The bytes written are the same either way. The runtime
 * signs with an RSA key alone: any other key is left to the JavaScript engine, which throws on it.
 * ES: Firma SHA1withRSA (PKCS#1 v1.5) de `data`, en base64. Determinista: misma clave y bytes, misma firma, y eso es lo
 * que deja firmar al RSA del propio runtime cuando lo hay. La primera firma del proceso la calculan el runtime y el
 * motor de JavaScript y se comparan; solo si coinciden firma el runtime las que siguen, y una llave que el runtime
 * rechaza la firma igual el motor de JavaScript. Los bytes escritos son los mismos de cualquier modo. El runtime firma
 * solo con una llave RSA: cualquier otra queda para el motor de JavaScript, que lanza un error con ella.
 */
export const rsaSha1SignBase64 = (privateKeyPem: string, data: string, encoding: TextEncoding = 'utf8'): string => {
  if (trusted === undefined) return settle(privateKeyPem, data, encoding)
  let signature: string | null = null
  if (trusted !== null)
    try {
      signature = nativeSign(trusted, privateKeyPem, data, encoding)
    } catch {
      // A key the runtime refuses is still the portable engine's to sign.
    }
  return signature ?? portableSign(privateKeyPem, data, encoding)
}

/**
 * EN: Verifies a SHA1withRSA base64 signature against a public key given as modulus/exponent. Never throws: malformed
 * input is `false`. A key larger than any CAF or certificate key, a modulus over 512 bytes (4096 bits) or an exponent
 * over 4 bytes (32 bits), is `false` without the signature being tried, since the cost of the check grows with the
 * key; the bytes are counted as decoded, leading zeros included.
 * ES: Verifica una firma SHA1withRSA en base64 contra una clave pública dada como módulo/exponente. Nunca lanza:
 * entrada malformada es `false`. Una clave mayor que cualquier clave de CAF o de certificado, un módulo de más de 512
 * bytes (4096 bits) o un exponente de más de 4 bytes (32 bits), es `false` sin que se pruebe la firma, porque el costo
 * del chequeo crece con la clave; los bytes se cuentan decodificados, incluidos los ceros al inicio.
 */
export const rsaSha1VerifyBase64 = (
  publicKey: RsaPublicKeyParts,
  data: string,
  encoding: TextEncoding,
  signatureBase64: string,
): boolean => {
  try {
    const modulus = forge.util.decode64(publicKey.modulus)
    const exponent = forge.util.decode64(publicKey.exponent)
    if (modulus.length > MAX_KEY_BYTES.modulus || exponent.length > MAX_KEY_BYTES.exponent) return false
    const key = forge.pki.setRsaPublicKey(bytesToBigInt(modulus), bytesToBigInt(exponent))
    return key.verify(sha1Of(data, encoding).digest().getBytes(), forge.util.decode64(signatureBase64))
  } catch {
    return false
  }
}
