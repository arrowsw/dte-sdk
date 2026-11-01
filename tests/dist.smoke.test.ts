import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Dual-package smoke test for the built `dist/` artefacts: the ESM and CJS bundles, their
 * `package.json` wiring and the CJS marker. Auto-skipped until `npm run build` has run.
 */
const distRoot = join(__dirname, '..', 'dist')
const cjsEntry = join(distRoot, 'cjs', 'index.min.js')
const esmEntry = join(distRoot, 'esm', 'index.min.js')
const cjsPkgJson = join(distRoot, 'cjs', 'package.json')

const EXPECTED_FUNCTIONS = [
  'createDocument',
  'stampDocument',
  'signDocument',
  'issueDocument',
  'verifyDocumentSignature',
  'verifyTed',
  'createEnvelope',
  'signEnvelope',
  'verifyEnvelopeSignature',
  'buildEnvelopeXml',
  'buildDocumentXml',
  'toSiiDocument',
  'fromSiiDocument',
  'parseCaf',
  'isCafExpired',
  'loadCertificateFromPkcs12',
  'loadCertificateFromPem',
  'toSiiRut',
  'sanitizeText',
  'foldToAscii',
  'encodeLatin1',
  'chileTimestamp',
  'calculateTotals',
  'classifyUploadStatus',
  'classifyDocumentStatus',
  'DteError',
] as const

const distExists = existsSync(cjsEntry) && existsSync(esmEntry)
const guarded = distExists ? describe : describe.skip

guarded('dist smoke (dual ESM + CJS package)', () => {
  test('CJS entry loads via require() and exposes the public API', () => {
    const req = createRequire(__filename)
    const cjs = req(cjsEntry) as Record<string, unknown>
    for (const name of EXPECTED_FUNCTIONS) expect(typeof cjs[name]).toBe('function')
    expect((cjs.DOCUMENT_TYPES as Record<string, number>).invoice).toBe(33)
  })

  test('ESM entry loads under the real ESM loader', () => {
    const script = `import * as m from ${JSON.stringify(pathToFileURL(esmEntry).href)}; const missing = ${JSON.stringify(EXPECTED_FUNCTIONS)}.filter((n) => typeof m[n] !== 'function'); if (missing.length) { console.error(missing.join(',')); process.exit(1) } console.log('ok')`
    expect(execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }).trim()).toBe(
      'ok',
    )
  })

  test('CJS marker is present', () => {
    const req = createRequire(__filename)
    expect(req(cjsPkgJson)).toEqual({ type: 'commonjs' })
  })

  test('the bundles issue and verify a document end to end', () => {
    const req = createRequire(__filename)
    const sdk = req(cjsEntry) as typeof import('../src')
    const { readFileSync } = req('node:fs') as typeof import('node:fs')
    const fixtures = join(__dirname, 'fixtures')
    const caf = sdk.parseCaf(readFileSync(join(fixtures, 'caf-33.xml'), 'utf8'))
    const certificate = sdk.loadCertificateFromPkcs12(
      new Uint8Array(readFileSync(join(fixtures, 'cert.pfx'))),
      'secret',
    )
    const signed = sdk.issueDocument({
      document: {
        type: 33,
        folio: 1,
        issuer: {
          rut: '76543210-3',
          businessName: 'Empresa Ejemplo SpA',
          businessActivity: 'Software',
          address: 'Av. 1',
          commune: 'Santiago',
        },
        receiver: {
          rut: '12345678-5',
          businessName: 'Cliente',
          businessActivity: 'Comercio',
          address: 'Calle 2',
          commune: 'Providencia',
        },
        items: [{ name: 'Servicio', unitPrice: 1000 }],
      },
      caf,
      certificate,
      checkCafExpiry: false,
    })
    expect(sdk.verifyDocumentSignature(signed.xml).valid).toBe(true)
  })
})
