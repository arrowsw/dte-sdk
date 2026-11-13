// Installs a packed dte-sdk tarball into an empty temporary project and checks it the way a consumer gets it: through
// the package name and its `exports` map, under `import` and `require()`, with the runtime dependencies and the optional
// peers installed from the registry at the versions the tarball declares, and with its published types. CI runs it on
// every change, and the publish workflow runs it on the exact tarball it is about to publish.
//
// Usage: node scripts/smoke-package.mjs <path-to-tarball>
// Needs the npm registry, and this repository's `npm ci` for `tsc`, `@types/node` and the test fixtures.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const tarball = process.argv[2]
if (!tarball) {
  console.error('Usage: node scripts/smoke-package.mjs <path-to-tarball>')
  process.exit(2)
}

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixtures = join(repo, 'tests', 'fixtures')

// The package.json inside the tarball, so the peers come at the ranges this very package declares.
const manifest = JSON.parse(
  execFileSync('tar', ['-xOzf', resolve(tarball), 'package/package.json'], { encoding: 'utf8' }),
)
const peers = Object.entries(manifest.peerDependencies ?? {}).map(([name, range]) => `${name}@${range}`)

// A few functions per entry. The full list of each entry is checked against `dist/` in tests/dist.smoke.test.ts.
const ENTRIES = {
  'dte-sdk': ['createDocument', 'issueDocument', 'verifyDocumentSignature', 'createSiiClient', 'DteError'],
  'dte-sdk/node': ['createNodeHttpsTransport', 'createDirectoryTokenCache', 'findCafFiles'],
  'dte-sdk/portal': ['createPortalClient', 'requestCaf', 'runCertification'],
  'dte-sdk/pdf': ['parsePrintableDocuments', 'renderPrintedSample'],
}

const RUNTIME = `
import * as root from 'dte-sdk'
import * as node from 'dte-sdk/node'
import * as portal from 'dte-sdk/portal'
import * as pdf from 'dte-sdk/pdf'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const fail = (what) => { console.error('package smoke FAILED: ' + what); process.exit(1) }
const modules = { 'dte-sdk': root, 'dte-sdk/node': node, 'dte-sdk/portal': portal, 'dte-sdk/pdf': pdf }
const require = createRequire(join(process.cwd(), 'consumer.cjs'))

for (const [name, functions] of Object.entries(${JSON.stringify(ENTRIES)})) {
  const imported = modules[name]
  const missing = functions.filter((fn) => typeof imported[fn] !== 'function')
  if (missing.length) fail(name + ' does not export ' + missing.join(', '))
  const required = require(name)
  const keys = Object.keys(imported)
  if (Object.keys(required).join() !== keys.join() || keys.some((key) => required[key] !== imported[key])) {
    fail('require(' + JSON.stringify(name) + ') does not give the module that import gives')
  }
}

// Issuing and verifying a document runs node-forge, @xmldom/xmldom, fast-xml-parser and rut.ts as installed.
const fixtures = ${JSON.stringify(fixtures)}
const caf = root.parseCaf(readFileSync(join(fixtures, 'caf-33.xml'), 'utf8'))
const certificate = root.loadCertificateFromPkcs12(new Uint8Array(readFileSync(join(fixtures, 'cert.pfx'))), 'secret')
const signed = root.issueDocument({
  document: {
    type: 33, folio: 1,
    issuer: { rut: '76543210-3', businessName: 'Comercial Andina SpA', businessActivity: 'Software', address: 'Av. 1', commune: 'Santiago' },
    receiver: { rut: '12345678-5', businessName: 'Cliente', businessActivity: 'Comercio', address: 'Calle 2', commune: 'Providencia' },
    items: [{ name: 'Servicio', unitPrice: 1000 }],
  },
  caf, certificate, checkCafExpiry: false,
})
if (root.verifyDocumentSignature(signed.xml).valid !== true) fail('an issued document does not verify')

// One DteError class across the entries: they share the package's chunks.
let thrown
try { await portal.createPortalClient({ environment: 'nope' }) } catch (error) { thrown = error }
if (!(thrown instanceof root.DteError) || thrown.code !== 'INVALID_OPTION') fail('dte-sdk/portal threw no DteError')

// dte-sdk/pdf loads the optional peers on first use, from the consumer's node_modules.
const [printable] = pdf.parsePrintableDocuments(signed.xml)
const sample = await pdf.renderPrintedSample(printable, { transferable: true })
if (Buffer.from(sample.subarray(0, 5)).toString() !== '%PDF-') fail('dte-sdk/pdf rendered no PDF')

console.log('package smoke ok (runtime: four entries, import and require, issue, verify, PDF)')
`

// An `any` would let each assignment compile, and the unused `@ts-expect-error` would then be the error.
const TYPE_CONSUMER = `
import { createDocument } from 'dte-sdk'
import { createNodeHttpsTransport } from 'dte-sdk/node'
import { createPortalClient } from 'dte-sdk/portal'
import { parsePrintableDocuments } from 'dte-sdk/pdf'

// @ts-expect-error
export const root: number = createDocument
// @ts-expect-error
export const node: number = createNodeHttpsTransport
// @ts-expect-error
export const portal: number = createPortalClient
// @ts-expect-error
export const pdf: number = parsePrintableDocuments
`

// The `exports` map (nodenext) and `typesVersions` (node10) each have to reach the shipped declarations.
const TYPE_CONSUMERS = [
  ['consumer.mts', { module: 'nodenext', moduleResolution: 'nodenext' }],
  ['consumer.ts', { module: 'commonjs', moduleResolution: 'node10' }],
]

const dir = mkdtempSync(join(tmpdir(), 'dte-sdk-package-smoke-'))
try {
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'dte-sdk-package-smoke', private: true }))
  execFileSync(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', resolve(tarball), ...peers],
    { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' },
  )

  execFileSync(process.execPath, ['--input-type=module', '-e', RUNTIME], { cwd: dir, stdio: 'inherit' })

  const tsc = join(repo, 'node_modules', 'typescript', 'bin', 'tsc')
  for (const [file, options] of TYPE_CONSUMERS) {
    const project = mkdtempSync(join(dir, 'types-'))
    writeFileSync(join(project, file), TYPE_CONSUMER)
    // skipLibCheck, as `tsc --init` sets it: three internal declarations (`dist/crypto/rsa.d.ts`, `x509.d.ts`) name
    // node-forge types, which only the dev dependency `@types/node-forge` provides, so a strict consumer that checks
    // library declarations gets TS7016 there. The four entries' own types are still checked: see TYPE_CONSUMER.
    const compilerOptions = {
      ...options,
      target: 'es2020',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      esModuleInterop: true,
      types: ['node'],
      typeRoots: [join(repo, 'node_modules', '@types')],
    }
    writeFileSync(join(project, 'tsconfig.json'), JSON.stringify({ compilerOptions, files: [file] }))
    const result = spawnSync(process.execPath, [tsc, '-p', project], { encoding: 'utf8' })
    if (result.status !== 0 || result.stdout !== '') {
      throw new Error(
        `the types do not compile for ${file} on ${options.moduleResolution}:\n${result.stdout}${result.stderr}`,
      )
    }
  }
  console.log('package smoke ok (types: nodenext and node10)')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
