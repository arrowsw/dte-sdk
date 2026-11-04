import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Smoke test for the built `dist/` artefacts and their `package.json` wiring. Jest cannot `require()` an ES module, so
 * every check runs the real Node loader in a fresh process. Auto-skipped until `npm run build` has run.
 */
const packageRoot = join(__dirname, '..')
const distRoot = join(packageRoot, 'dist')
const rootEntry = join(distRoot, 'index.min.js')
const href = (file: string): string => pathToFileURL(file).href

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
  'createPortalClient',
  'requestCaf',
  'annulFolios',
  'createMemoryFolioRegistry',
  'listPeriodDocuments',
  'changePurchaseType',
  'downloadMipymeBackup',
  'createFetchTransport',
  'createNodeHttpsTransport',
  'createMemoryTokenCache',
  'uploadEnvelope',
  'queryUploadStatus',
  'queryDocumentStatus',
  'registerClaim',
  'signSeed',
  'createPurchaseSalesBook',
  'signPurchaseSalesBook',
  'createGuideBook',
  'signGuideBook',
  'createFolioConsumption',
  'signFolioConsumption',
  'DteError',
  'parsePrintableDocuments',
  'renderPrintedSample',
] as const

const nodeImportGuard = href(join(__dirname, 'support', 'node-import-guard.mjs'))
const fixtures = join(__dirname, 'fixtures')

type ProbeResult = { readonly ok: boolean; readonly output: string }

const runNode = (args: readonly string[]): ProbeResult => {
  const result = spawnSync(process.execPath, [...args], { encoding: 'utf8' })
  return { ok: result.status === 0, output: `${result.stdout}${result.stderr}` }
}

/** Loads `entry` as an ES module in a fresh process where its directory may not import a `node:` module. */
const probeLoad = (entry: string): ProbeResult => {
  const file = realpathSync(entry)
  const script = `import { register } from 'node:module'; register(${JSON.stringify(nodeImportGuard)}, { data: { scope: ${JSON.stringify(href(dirname(file)))} } }); await import(${JSON.stringify(href(file))}); console.log('loaded')`
  return runNode(['--input-type=module', '-e', script])
}

/** Runs `body`, in a fresh process, with the root entry as `sdk`. */
const withSdk = (body: string): ProbeResult => {
  const script = `
const fs = require('node:fs')
const fixtures = ${JSON.stringify(fixtures)}
import(${JSON.stringify(href(rootEntry))}).then(async (sdk) => {
${body}
}).catch((error) => { console.error(error); process.exit(1) })`
  return runNode(['-e', script])
}

const ISSUE_DOCUMENT = `
  const caf = sdk.parseCaf(fs.readFileSync(fixtures + '/caf-33.xml', 'utf8'))
  const certificate = sdk.loadCertificateFromPkcs12(new Uint8Array(fs.readFileSync(fixtures + '/cert.pfx')), 'secret')
  const signed = sdk.issueDocument({
    document: {
      type: 33, folio: 1,
      issuer: { rut: '76543210-3', businessName: 'Comercial Andina SpA', businessActivity: 'Software', address: 'Av. 1', commune: 'Santiago' },
      receiver: { rut: '12345678-5', businessName: 'Cliente', businessActivity: 'Comercio', address: 'Calle 2', commune: 'Providencia' },
      items: [{ name: 'Servicio', unitPrice: 1000 }],
    },
    caf, certificate, checkCafExpiry: false,
  })`

const distExists = existsSync(rootEntry)
const guarded = distExists ? describe : describe.skip

guarded('dist smoke (ES modules)', () => {
  test('every target of package.json#exports exists', () => {
    const { exports: targets } = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      exports: Record<string, string | Record<string, string>>
    }
    const files = Object.values(targets).flatMap((target) =>
      typeof target === 'string' ? [target] : Object.values(target),
    )
    expect(files.filter((file) => !existsSync(join(packageRoot, file)))).toEqual([])
  })

  test('the root entry loads under the real ESM loader and exposes the public API', () => {
    const script = `import * as m from ${JSON.stringify(href(rootEntry))}; const missing = ${JSON.stringify(EXPECTED_FUNCTIONS)}.filter((n) => typeof m[n] !== 'function'); if (missing.length) { console.error(missing.join(',')); process.exit(1) } console.log(m.DOCUMENT_TYPES.invoice)`
    expect(runNode(['--input-type=module', '-e', script])).toEqual({ ok: true, output: '33\n' })
  })

  test('a CommonJS consumer gets the same module with require()', () => {
    const script = `const m = require(${JSON.stringify(rootEntry)}); import(${JSON.stringify(href(rootEntry))}).then((n) => console.log(typeof m.createDocument, m.DteError === n.DteError))`
    const result = runNode(['-e', script])
    expect(result.ok).toBe(true)
    expect(result.output).toContain('function true')
  })

  test('the entry evaluates no node: module while it loads', () => {
    expect(probeLoad(rootEntry)).toEqual({ ok: true, output: 'loaded\n' })
  })

  test('the node: probe does catch an entry that imports a node: module eagerly', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dte-sdk-probe-'))
    try {
      const file = join(dir, 'eager.mjs')
      writeFileSync(file, "import 'node:os'\n")
      expect(probeLoad(file)).toMatchObject({ ok: false, output: expect.stringContaining('eager import of node:os') })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // A loopback HTTPS server in a fresh process, so the lazy `node:https` import runs for real inside the built artefact.
  test('the lazy node:https import works inside the minified bundle', () => {
    const result = withSdk(`
  const https = require('node:https')
  const certificate = fs.readFileSync(fixtures + '/tls-localhost.pem', 'utf8')
  const key = fs.readFileSync(fixtures + '/tls-localhost.key.pem', 'utf8')
  const server = https.createServer({ key, cert: certificate }, (request, response) => response.end('pong'))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const transport = sdk.createNodeHttpsTransport({ tls: { ca: certificate } })
  const response = await transport({ method: 'GET', url: 'https://127.0.0.1:' + server.address().port + '/', headers: {}, timeoutMs: 5000 })
  console.log(response.status + ' ' + Buffer.from(response.body).toString())
  server.closeAllConnections()
  server.close()`)
    expect(result).toEqual({ ok: true, output: '200 pong\n' })
  })

  test('the bundle issues and verifies a document end to end', () => {
    const result = withSdk(`${ISSUE_DOCUMENT}
  console.log(sdk.verifyDocumentSignature(signed.xml).valid)`)
    expect(result).toEqual({ ok: true, output: 'true\n' })
  })

  test('the bundle builds a client, signs a seed and obtains a token without touching the network', () => {
    const result = withSdk(`
  const reply = (name) => ({ status: 200, headers: {}, body: new Uint8Array(fs.readFileSync(fixtures + '/sii/' + name)) })
  const requests = []
  const transport = async (request) => {
    requests.push(request.url)
    return reply(request.url.endsWith('CrSeed.jws') ? 'soap-seed-ok.xml' : 'soap-token-ok.xml')
  }
  const certificate = sdk.loadCertificateFromPem({
    privateKeyPem: fs.readFileSync(fixtures + '/cert.key.pem', 'utf8'),
    certificatePem: fs.readFileSync(fixtures + '/cert.pem', 'utf8'),
  })
  const sii = sdk.createSiiClient({ environment: 'certification', certificate, transport })
  console.log(JSON.stringify({
    channel: sii.receiptsChannel,
    seed: sdk.signSeed('000000000078', certificate).includes('<Reference URI="">'),
    token: await sdk.getToken(sii, 'soap'),
    requests,
  }))`)
    expect(result.ok).toBe(true)
    expect(JSON.parse(result.output)).toEqual({
      channel: 'soap',
      seed: true,
      token: 'ABCDEFGHIJKLM',
      requests: ['https://maullin.sii.cl/DTEWS/CrSeed.jws', 'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws'],
    })
  })

  test('the bundle loads pdf-lib and bwip-js on first use and renders a printed sample', () => {
    const result = withSdk(`${ISSUE_DOCUMENT}
  const [doc] = sdk.parsePrintableDocuments(signed.xml)
  const pdf = await sdk.renderPrintedSample(doc, { transferable: true })
  console.log(Buffer.from(pdf.subarray(0, 5)).toString() + ' ' + (pdf.length > 10000))`)
    expect(result).toEqual({ ok: true, output: '%PDF- true\n' })
  })
})
