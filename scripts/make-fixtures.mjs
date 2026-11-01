// Generates the synthetic test fixtures under tests/fixtures. Run ONCE and commit the
// output: keys are random, so re-running changes every signature and forces the golden
// files to be regenerated too. Nothing here is real: the RUT, the names and the
// password are documentation examples.
import { mkdir, writeFile } from 'node:fs/promises'
import forge from 'node-forge'

const OUT = 'tests/fixtures'
const ISSUER_RUT = '76543210-3'
const ISSUER_NAME = 'COMERCIAL ANDINA SPA'
const PASSWORD = 'secret'
const RUT_OID = '1.3.6.1.4.1.8321.1'

const toBase64 = (bytes) => forge.util.encode64(bytes)
const bigIntToBase64 = (n) => {
  const hex = n.toString(16)
  return toBase64(forge.util.hexToBytes(hex.length % 2 ? `0${hex}` : hex))
}

const subjectAltName = (rut, email) => {
  const otherName = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, forge.asn1.oidToDer(RUT_OID).getBytes()),
    forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.IA5STRING, false, rut),
    ]),
  ])
  const rfc822 = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 1, false, email)
  const generalNames = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
    otherName,
    rfc822,
  ])
  return { id: '2.5.29.17', name: 'subjectAltName', critical: false, value: generalNames }
}

const makeCertificate = ({ notBefore, notAfter }) => {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 })
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = notBefore
  cert.validity.notAfter = notAfter
  const attrs = [
    { name: 'commonName', value: 'CAROLINA VALDES ROJAS' },
    { name: 'countryName', value: 'CL' },
    { name: 'organizationName', value: ISSUER_NAME },
    { shortName: 'OU', value: 'Terminos de uso en www.andina.test/tu' },
    { name: 'emailAddress', value: 'carolina@andina.test' },
    { type: '2.5.4.5', value: ISSUER_RUT },
  ]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true, keyEncipherment: true },
    subjectAltName(ISSUER_RUT, 'carolina@andina.test'),
  ])
  cert.sign(keys.privateKey, forge.md.sha256.create())
  return { keys, cert }
}

const pkcs12 = (keys, cert, algorithm) => {
  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], PASSWORD, { algorithm, friendlyName: 'andina' })
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary')
}

const makeCaf = ({ type, from, to, authorizationDate }) => {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 })
  const privatePem = forge.pki.privateKeyToPem(keys.privateKey).replace(/\r\n/g, '\n').trim()
  const publicPem = forge.pki.publicKeyToPem(keys.publicKey).replace(/\r\n/g, '\n').trim()
  const frma = toBase64(forge.random.getBytesSync(128))
  return [
    '<AUTORIZACION>',
    '<CAF version="1.0">',
    '<DA>',
    `<RE>${ISSUER_RUT}</RE>`,
    `<RS>${ISSUER_NAME}</RS>`,
    `<TD>${type}</TD>`,
    `<RNG><D>${from}</D><H>${to}</H></RNG>`,
    `<FA>${authorizationDate}</FA>`,
    `<RSAPK><M>${bigIntToBase64(keys.publicKey.n)}</M><E>${bigIntToBase64(keys.publicKey.e)}</E></RSAPK>`,
    '<IDK>100</IDK>',
    '</DA>',
    `<FRMA algoritmo="SHA1withRSA">${frma}</FRMA>`,
    '</CAF>',
    `<RSASK>${privatePem}</RSASK>`,
    `<RSAPUBK>${publicPem}</RSAPUBK>`,
    '</AUTORIZACION>',
    '',
  ].join('\n')
}

await mkdir(OUT, { recursive: true })

const valid = makeCertificate({
  notBefore: new Date('2026-01-01T00:00:00Z'),
  notAfter: new Date('2046-01-01T00:00:00Z'),
})
await writeFile(`${OUT}/cert.pem`, forge.pki.certificateToPem(valid.cert))
await writeFile(`${OUT}/cert.key.pem`, forge.pki.privateKeyToPem(valid.keys.privateKey))
await writeFile(`${OUT}/cert.pfx`, pkcs12(valid.keys, valid.cert, '3des'))
await writeFile(`${OUT}/cert-aes.pfx`, pkcs12(valid.keys, valid.cert, 'aes256'))

const expired = makeCertificate({
  notBefore: new Date('2020-01-01T00:00:00Z'),
  notAfter: new Date('2021-01-01T00:00:00Z'),
})
await writeFile(`${OUT}/cert-expired.pfx`, pkcs12(expired.keys, expired.cert, '3des'))

await writeFile(`${OUT}/caf-33.xml`, makeCaf({ type: 33, from: 1, to: 100, authorizationDate: '2026-10-31' }))
await writeFile(`${OUT}/caf-39.xml`, makeCaf({ type: 39, from: 1, to: 1000, authorizationDate: '2026-10-31' }))
await writeFile(`${OUT}/caf-33-old.xml`, makeCaf({ type: 33, from: 101, to: 200, authorizationDate: '2025-01-01' }))

console.log(`fixtures written to ${OUT}`)
