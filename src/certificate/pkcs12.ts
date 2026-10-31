import forge from 'node-forge'
import { DteError } from '../errors'
import { decodeLatin1 } from '../text/latin1'
import type { Certificate, LoadCertificateOptions } from './certificate'
import { loadCertificateFromPem } from './pem'

type ForgeCertificate = forge.pki.Certificate
type ForgeRsaPrivateKey = forge.pki.rsa.PrivateKey

const bagsOf = (pfx: forge.pkcs12.Pkcs12Pfx, bagType: string): readonly forge.pkcs12.Bag[] =>
  pfx.getBags({ bagType })[bagType] ?? []

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const decode = (bytes: Uint8Array, password: string): forge.pkcs12.Pkcs12Pfx => {
  const asn1 = (() => {
    try {
      return forge.asn1.fromDer(decodeLatin1(bytes))
    } catch (error) {
      throw new DteError('CERT_INVALID', { reason: `not DER: ${describe(error)}` })
    }
  })()
  try {
    return forge.pkcs12.pkcs12FromAsn1(asn1, password)
  } catch (error) {
    const reason = describe(error)
    if (/password|MAC could not be verified/i.test(reason)) throw new DteError('CERT_PASSWORD_WRONG')
    throw new DteError('CERT_INVALID', { reason })
  }
}

// The leaf is the certificate whose public key is the private key's; failing that, the first non-CA one.
const findLeaf = (certificates: readonly ForgeCertificate[], privateKey: ForgeRsaPrivateKey): ForgeCertificate => {
  const byKey = certificates.find(
    (certificate) => (certificate.publicKey as forge.pki.rsa.PublicKey).n.compareTo(privateKey.n) === 0,
  )
  if (byKey) return byKey
  const nonCa = certificates.find((certificate) => {
    const basic = certificate.getExtension('basicConstraints') as { cA?: boolean } | null
    return basic === null || basic.cA !== true
  })
  return nonCa ?? certificates[0]
}

// Leaf → issuer → issuer's issuer…; anything unlinked goes last. The SII TLS endpoints need the intermediates.
const orderChain = (leaf: ForgeCertificate, certificates: readonly ForgeCertificate[]): readonly ForgeCertificate[] => {
  const remaining = certificates.filter((certificate) => certificate !== leaf)
  const chain: ForgeCertificate[] = [leaf]
  for (let current: ForgeCertificate | undefined = leaf; current !== undefined; ) {
    const issuerHash = current.issuer.hash as string
    const index = remaining.findIndex((certificate) => (certificate.subject.hash as string) === issuerHash)
    current = index < 0 ? undefined : remaining.splice(index, 1)[0]
    if (current !== undefined) chain.push(current)
  }
  return [...chain, ...remaining]
}

/**
 * EN: Loads a PKCS#12 (`.pfx`/`.p12`) as a `Certificate`: legacy (3DES/RC2) and modern (PBES2/AES) files, shrouded or
 * plain key bags, leaf detection by key, chain ordered leaf → root, RUT from the certificate.
 * ES: Carga un PKCS#12 (`.pfx`/`.p12`) como `Certificate`: archivos legacy (3DES/RC2) y modernos (PBES2/AES), bolsas de
 * llave cifradas o planas, detección de la hoja por llave, cadena ordenada hoja → raíz, RUT desde el certificado.
 * @param bytes EN: file contents. ES: contenido del archivo.
 * @param password EN: PKCS#12 password. ES: contraseña del PKCS#12.
 * @throws {DteError} EN: `CERT_PASSWORD_WRONG`, `CERT_INVALID`, `CERT_EXPIRED`. ES: los mismos códigos.
 */
export const loadCertificateFromPkcs12 = (
  bytes: Uint8Array,
  password: string,
  options: LoadCertificateOptions = {},
): Certificate => {
  const pfx = decode(bytes, password)
  const privateKey = (bagsOf(pfx, forge.pki.oids.pkcs8ShroudedKeyBag)[0] ?? bagsOf(pfx, forge.pki.oids.keyBag)[0])
    ?.key as ForgeRsaPrivateKey | undefined
  const certificates = bagsOf(pfx, forge.pki.oids.certBag)
    .map((bag) => bag.cert)
    .filter((certificate): certificate is ForgeCertificate => certificate !== undefined && certificate !== null)
  if (privateKey === undefined) throw new DteError('CERT_INVALID', { reason: 'no private key in PKCS#12' })
  if (certificates.length === 0) throw new DteError('CERT_INVALID', { reason: 'no certificate in PKCS#12' })
  const leaf = findLeaf(certificates, privateKey)
  const chain = orderChain(leaf, certificates)
  return loadCertificateFromPem(
    {
      privateKeyPem: forge.pki.privateKeyToPem(privateKey),
      certificatePem: forge.pki.certificateToPem(leaf),
      chainPem: chain.map((certificate) => forge.pki.certificateToPem(certificate)).join(''),
    },
    options,
  )
}
