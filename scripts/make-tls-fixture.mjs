// Generates the self-signed `localhost` certificate used by the Node transport tests (a loopback HTTPS server).
// Separate from make-fixtures.mjs on purpose: re-running that script regenerates every key and forces the
// phase 1 snapshots to change; this one only touches the two TLS files. Run once and commit the output.
import { writeFile } from 'node:fs/promises'
import forge from 'node-forge'

const OUT = 'tests/fixtures'

const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 })
const cert = forge.pki.createCertificate()
cert.publicKey = keys.publicKey
cert.serialNumber = '02'
cert.validity.notBefore = new Date('2026-01-01T00:00:00Z')
cert.validity.notAfter = new Date('2046-01-01T00:00:00Z')
const attrs = [
  { name: 'commonName', value: 'localhost' },
  { name: 'organizationName', value: 'dte-sdk test server' },
]
cert.setSubject(attrs)
cert.setIssuer(attrs)
cert.setExtensions([
  { name: 'basicConstraints', cA: true },
  { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, keyCertSign: true },
  { name: 'extKeyUsage', serverAuth: true },
  {
    name: 'subjectAltName',
    altNames: [
      { type: 2, value: 'localhost' },
      { type: 7, ip: '127.0.0.1' },
    ],
  },
])
cert.sign(keys.privateKey, forge.md.sha256.create())

await writeFile(`${OUT}/tls-localhost.pem`, forge.pki.certificateToPem(cert))
await writeFile(`${OUT}/tls-localhost.key.pem`, forge.pki.privateKeyToPem(keys.privateKey))
console.log(`TLS fixture written to ${OUT}/tls-localhost.pem`)
