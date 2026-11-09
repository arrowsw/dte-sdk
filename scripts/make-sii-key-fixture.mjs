// Generates a test "SII": the key pair that signs the `DA` of a CAF (its `FRMA`), and a CAF it signed. The tests of
// `verifyReceivedDocuments` and `verifyCafSignature` pass its public key in place of the SII's, which no test can sign
// with. Separate from make-fixtures.mjs on purpose: re-running that script regenerates every key and forces the phase 1
// snapshots to change; this one only touches these two files. Run once and commit the output. Nothing here is real:
// `76543210-3` is a documentation RUT and every key was generated locally.
import { writeFile } from 'node:fs/promises'
import forge from 'node-forge'

const OUT = 'tests/fixtures'
const ISSUER_RUT = '76543210-3'
const ISSUER_NAME = 'COMERCIAL ANDINA SPA'

const bigIntToBase64 = (n) => {
  const hex = n.toString(16)
  return forge.util.encode64(forge.util.hexToBytes(hex.length % 2 ? `0${hex}` : hex))
}

// 512 bits, the size of the SII's own keys 100 and 300.
const sii = forge.pki.rsa.generateKeyPair({ bits: 512, e: 0x10001 })
const caf = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 })

const da = [
  '<DA>',
  `<RE>${ISSUER_RUT}</RE>`,
  `<RS>${ISSUER_NAME}</RS>`,
  '<TD>33</TD>',
  '<RNG><D>1</D><H>100</H></RNG>',
  '<FA>2026-10-31</FA>',
  `<RSAPK><M>${bigIntToBase64(caf.publicKey.n)}</M><E>${bigIntToBase64(caf.publicKey.e)}</E></RSAPK>`,
  '<IDK>100</IDK>',
  '</DA>',
]
// The SII signs the DA flattened (no whitespace between tags), over its ISO-8859-1 bytes; this one is ASCII.
const md = forge.md.sha1.create()
md.update(da.join(''), 'raw')
const frma = forge.util.encode64(sii.privateKey.sign(md))

const pem = (text) => text.replace(/\r\n/g, '\n').trim()
const xml = [
  '<AUTORIZACION>',
  '<CAF version="1.0">',
  ...da,
  `<FRMA algoritmo="SHA1withRSA">${frma}</FRMA>`,
  '</CAF>',
  `<RSASK>${pem(forge.pki.privateKeyToPem(caf.privateKey))}</RSASK>`,
  `<RSAPUBK>${pem(forge.pki.publicKeyToPem(caf.publicKey))}</RSAPUBK>`,
  '</AUTORIZACION>',
  '',
].join('\n')

await writeFile(`${OUT}/sii-test-key.pem`, forge.pki.privateKeyToPem(sii.privateKey))
await writeFile(`${OUT}/caf-33-signed.xml`, xml)
console.log(`test SII key and the CAF it signed written to ${OUT}`)
