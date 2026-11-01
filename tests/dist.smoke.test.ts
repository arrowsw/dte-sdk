import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
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
  'createSiiClient',
  'createFetchTransport',
  'createNodeHttpsTransport',
  'createMemoryTokenCache',
  'uploadEnvelope',
  'queryUploadStatus',
  'queryDocumentStatus',
  'registerClaim',
  'signSeed',
  'DteError',
] as const

const nodeImportGuard = pathToFileURL(join(__dirname, 'support', 'node-import-guard.mjs')).href
const fixtures = join(__dirname, 'fixtures')

type ProbeResult = { readonly ok: boolean; readonly output: string }

const runNode = (args: readonly string[]): ProbeResult => {
  const result = spawnSync(process.execPath, [...args], { encoding: 'utf8' })
  return { ok: result.status === 0, output: `${result.stdout}${result.stderr}` }
}

/** Loads `entry` as an ES module in a fresh process where the entry itself may not import a `node:` module. */
const probeEsmLoad = (entry: string): ProbeResult => {
  const href = pathToFileURL(realpathSync(entry)).href
  const script = `import { register } from 'node:module'; register(${JSON.stringify(nodeImportGuard)}, { data: { entry: ${JSON.stringify(href)} } }); await import(${JSON.stringify(href)}); console.log('loaded')`
  return runNode(['--input-type=module', '-e', script])
}

/** Loads `entry` with `require` in a fresh process where the entry itself may not require a `node:` module. */
const probeCjsLoad = (entry: string): ProbeResult => {
  const file = realpathSync(entry)
  const script = `const Module = require('node:module'); const load = Module._load; Module._load = function (request, parent, ...rest) { if (request.startsWith('node:') && parent && parent.filename === ${JSON.stringify(file)}) throw new Error('eager require of ' + request); return load.call(this, request, parent, ...rest) }; require(${JSON.stringify(file)}); console.log('loaded')`
  return runNode(['-e', script])
}

/**
 * Starts a loopback HTTPS server in a fresh process, loads the bundle and sends one request through
 * `createNodeHttpsTransport`, so the lazy `node:https` import runs for real inside the built artefact.
 */
const probeNodeTransport = (loadBundle: string): ProbeResult => {
  const script = `
const https = require('node:https'), fs = require('node:fs')
const certificate = fs.readFileSync(${JSON.stringify(join(fixtures, 'tls-localhost.pem'))}, 'utf8')
const key = fs.readFileSync(${JSON.stringify(join(fixtures, 'tls-localhost.key.pem'))}, 'utf8')
${loadBundle}.then(async (sdk) => {
  const server = https.createServer({ key, cert: certificate }, (request, response) => response.end('pong'))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const transport = sdk.createNodeHttpsTransport({ tls: { ca: certificate } })
  const response = await transport({ method: 'GET', url: 'https://127.0.0.1:' + server.address().port + '/', headers: {}, timeoutMs: 5000 })
  console.log(response.status + ' ' + Buffer.from(response.body).toString())
  server.closeAllConnections()
  server.close()
}).catch((error) => { console.error(error); process.exit(1) })`
  return runNode(['-e', script])
}

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

  test('neither bundle evaluates a node: module while it loads', () => {
    const esm = probeEsmLoad(esmEntry)
    const cjs = probeCjsLoad(cjsEntry)
    expect(esm).toEqual({ ok: true, output: 'loaded\n' })
    expect(cjs).toEqual({ ok: true, output: 'loaded\n' })
  })

  test('the node: probes do catch an entry that imports a node: module eagerly', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dte-sdk-probe-'))
    try {
      const esmFile = join(dir, 'eager.mjs')
      const cjsFile = join(dir, 'eager.cjs')
      writeFileSync(esmFile, "import 'node:os'\n")
      writeFileSync(cjsFile, "require('node:os')\n")
      expect(probeEsmLoad(esmFile)).toMatchObject({
        ok: false,
        output: expect.stringContaining('eager import of node:os'),
      })
      expect(probeCjsLoad(cjsFile)).toMatchObject({
        ok: false,
        output: expect.stringContaining('eager require of node:os'),
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('the lazy node:https import works inside the minified bundles', () => {
    const esm = probeNodeTransport(`import(${JSON.stringify(pathToFileURL(esmEntry).href)})`)
    const cjs = probeNodeTransport(`Promise.resolve(require(${JSON.stringify(cjsEntry)}))`)
    expect(esm).toEqual({ ok: true, output: '200 pong\n' })
    expect(cjs).toEqual({ ok: true, output: '200 pong\n' })
  })

  test('CJS marker is present', () => {
    const req = createRequire(__filename)
    expect(req(cjsPkgJson)).toEqual({ type: 'commonjs' })
  })

  test('the bundles issue and verify a document end to end', () => {
    const req = createRequire(__filename)
    const sdk = req(cjsEntry) as typeof import('../src')
    const { readFileSync } = req('node:fs') as typeof import('node:fs')
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
          businessName: 'Comercial Andina SpA',
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

  test('the bundles build a client, sign a seed and obtain a token without touching the network', async () => {
    const req = createRequire(__filename)
    const sdk = req(cjsEntry) as typeof import('../src')
    const { readFileSync } = req('node:fs') as typeof import('node:fs')
    const reply = (name: string) => ({
      status: 200,
      headers: {},
      body: new Uint8Array(readFileSync(join(fixtures, 'sii', name))),
    })
    const requests: string[] = []
    const transport: import('../src').HttpTransport = async (request) => {
      requests.push(request.url)
      return reply(request.url.endsWith('CrSeed.jws') ? 'soap-seed-ok.xml' : 'soap-token-ok.xml')
    }
    const certificate = sdk.loadCertificateFromPem({
      privateKeyPem: readFileSync(join(fixtures, 'cert.key.pem'), 'utf8'),
      certificatePem: readFileSync(join(fixtures, 'cert.pem'), 'utf8'),
    })
    const sii = sdk.createSiiClient({ environment: 'certification', certificate, transport })
    expect(sii.receiptsChannel).toBe('soap')
    expect(sdk.signSeed('000000000078', certificate)).toContain('<Reference URI="">')
    await expect(sdk.getToken(sii, 'soap')).resolves.toBe('ABCDEFGHIJKLM')
    expect(requests).toEqual([
      'https://maullin.sii.cl/DTEWS/CrSeed.jws',
      'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws',
    ])
  })
})
