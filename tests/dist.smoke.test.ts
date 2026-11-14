import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { preProcessFile } from 'typescript'

/**
 * Smoke test for the built `dist/` artefacts and their `package.json` wiring. Jest cannot `require()` an ES module, so
 * every check runs the real Node loader in a fresh process. Skipped, outside CI, until `npm run build` has run; on CI a
 * missing build fails the run.
 */
const packageRoot = join(__dirname, '..')
const distRoot = join(packageRoot, 'dist')
const entryFile = (name: string): string => join(distRoot, `${name}.min.js`)
const href = (file: string): string => pathToFileURL(file).href

const EXPECTED_FUNCTIONS: Record<string, readonly string[]> = {
  index: [
    'createDocument',
    'stampDocument',
    'signDocument',
    'issueDocument',
    'verifyDocumentSignature',
    'verifyTed',
    'createEnvelope',
    'signEnvelope',
    'verifyEnvelopeSignature',
    'verifyReceivedDocuments',
    'verifyCafSignature',
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
    'isDteError',
  ],
  node: [
    'createNodeHttpsTransport',
    'createDirectoryCapture',
    'createDirectoryUploadArchive',
    'createDirectoryTokenCache',
    'createDirectoryFolioRegistry',
    'findCafFiles',
    'findLatestCafFile',
    'resolveCafFile',
  ],
  portal: [
    'createPortalClient',
    'requestCaf',
    'annulFolios',
    'createMemoryFolioRegistry',
    'listPeriodDocuments',
    'changePurchaseType',
    'downloadMipymeBackup',
    'parseTestSetText',
    'issueTestSet',
    'declareProgress',
    'createMemoryCertificationStore',
    'createDirectoryCertificationStore',
    'runCertification',
    'gwtBody',
    'createExchangeAnswers',
    'runExchange',
    'uploadPrintedSamples',
    'issueReceiptsSet',
    'sendReceiptsSet',
    'declareReceiptsCompliance',
  ],
  pdf: [
    'parsePrintableDocuments',
    'renderPrintedSample',
    'renderPrintedSamples',
    'writePrintedSamples',
    'readPrintedSamples',
    'siiOfficeForCommune',
  ],
}
const ENTRIES = Object.keys(EXPECTED_FUNCTIONS)

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

/** Runs `body`, in a fresh process, with every entry loaded as `root`, `node`, `portal` and `pdf`. */
const withEntries = (body: string): ProbeResult => {
  const script = `
const fs = require('node:fs')
const fixtures = ${JSON.stringify(fixtures)}
Promise.all(${JSON.stringify(ENTRIES.map((name) => href(entryFile(name))))}.map((file) => import(file))).then(async ([root, node, portal, pdf]) => {
${body}
}).catch((error) => { console.error(error); process.exit(1) })`
  return runNode(['-e', script])
}

/** The files `entry` loads when it loads: itself and the chunks it reaches. */
const closure = (entry: string, seen: Set<string> = new Set()): Set<string> => {
  if (seen.has(entry)) return seen
  seen.add(entry)
  const relative = readFileSync(entry, 'utf8').matchAll(/(?:from ?|import ?)"(\.[^"]+\.js)"/g)
  for (const [, specifier] of relative) closure(join(dirname(entry), specifier as string), seen)
  return seen
}

const ISSUE_DOCUMENT = `
  const caf = root.parseCaf(fs.readFileSync(fixtures + '/caf-33.xml', 'utf8'))
  const certificate = root.loadCertificateFromPkcs12(new Uint8Array(fs.readFileSync(fixtures + '/cert.pfx')), 'secret')
  const signed = root.issueDocument({
    document: {
      type: 33, folio: 1,
      issuer: { rut: '76543210-3', businessName: 'Comercial Andina SpA', businessActivity: 'Software', address: 'Av. 1', commune: 'Santiago' },
      receiver: { rut: '12345678-5', businessName: 'Cliente', businessActivity: 'Comercio', address: 'Calle 2', commune: 'Providencia' },
      items: [{ name: 'Servicio', unitPrice: 1000 }],
    },
    caf, certificate, checkCafExpiry: false,
  })`

const missingEntries = ENTRIES.filter((name) => !existsSync(entryFile(name)))
const distExists = missingEntries.length === 0
const guarded = distExists ? describe : describe.skip

// The skip above is for a local run that has not built yet. A CI run that has no build is a broken pipeline, and a
// skipped suite would let it through as green, so there the missing build fails the run by name. `CI` is what GitHub
// Actions and most other CI systems set. `CI=false` and `CI=0` count as not set.
const onCi = !['', '0', 'false'].includes(process.env.CI ?? '')
const requiredOnCi = onCi ? describe : describe.skip

requiredOnCi('dist smoke: the build is there', () => {
  test('dist/ holds the minified file of every entry', () => {
    expect(missingEntries).toEqual([])
  })
})

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

  test.each(ENTRIES)('%s loads under the real ESM loader and exposes its API', (name) => {
    const script = `import * as m from ${JSON.stringify(href(entryFile(name)))}; const missing = ${JSON.stringify(EXPECTED_FUNCTIONS[name])}.filter((n) => typeof m[n] !== 'function'); if (missing.length) { console.error(missing.join(',')); process.exit(1) } console.log('ok')`
    expect(runNode(['--input-type=module', '-e', script])).toEqual({ ok: true, output: 'ok\n' })
  })

  test.each(ENTRIES)('a CommonJS consumer gets the same %s module with require()', (name) => {
    const script = `const m = require(${JSON.stringify(entryFile(name))}); import(${JSON.stringify(href(entryFile(name)))}).then((n) => console.log(Object.keys(m).length > 0 && Object.keys(m).every((key) => m[key] === n[key])))`
    const result = runNode(['-e', script])
    expect(result.ok).toBe(true)
    expect(result.output).toContain('true')
  })

  test.each(ENTRIES)('%s evaluates no node: module while it loads', (name) => {
    expect(probeLoad(entryFile(name))).toEqual({ ok: true, output: 'loaded\n' })
  })

  test('the root entry reaches no node: module', () => {
    const code = [...closure(entryFile('index'))].map((file) => readFileSync(file, 'utf8')).join('\n')
    expect(code).not.toMatch(/"node:/)
  })

  // `pdf-lib` and `bwip-js` are optional peers: only `dte-sdk/pdf` may name them.
  test.each(['index', 'node', 'portal'])('%s reaches no optional peer, in code or in types', (name) => {
    const code = [...closure(entryFile(name))].map((file) => readFileSync(file, 'utf8')).join('\n')
    expect(code).not.toMatch(/"(pdf-lib|bwip-js)"/)
    const declarations = readdirSync(distRoot, { recursive: true, encoding: 'utf8' }).filter(
      (file) => file.endsWith('.d.ts') && !file.startsWith('pdf'),
    )
    const named = declarations.filter((file) =>
      /['"](pdf-lib|bwip-js)['"]/.test(readFileSync(join(distRoot, file), 'utf8')),
    )
    expect(named).toEqual([])
  })

  test('the closure walk does find what an entry reaches', () => {
    const code = (name: string) => [...closure(entryFile(name))].map((file) => readFileSync(file, 'utf8')).join('\n')
    expect(code('portal')).toContain('"node:https"')
    expect(code('pdf')).toContain('"pdf-lib"')
  })

  test('the root entry bundles for the browser with no configuration, and the portal does not', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dte-sdk-browser-'))
    const esbuild = join(packageRoot, 'node_modules', '.bin', 'esbuild')
    const bundle = (name: string) =>
      spawnSync(
        esbuild,
        [
          entryFile(name),
          '--bundle',
          '--platform=browser',
          '--format=esm',
          '--log-level=error',
          `--outfile=${join(dir, `${name}.js`)}`,
        ],
        {
          encoding: 'utf8',
          cwd: packageRoot,
        },
      )
    try {
      expect(bundle('index')).toMatchObject({ status: 0, stderr: '' })
      expect(bundle('portal').stderr).toContain('node:https')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('one DteError crosses the entries: what a subpath throws satisfies the root checks', () => {
    const result = withEntries(`
  const thrown = async (run) => { try { await run() } catch (error) { return error } throw new Error('did not throw') }
  const errors = [
    await thrown(() => node.createNodeHttpsTransport({})({ method: 'GET', url: 'not a url', headers: {}, timeoutMs: 10 })),
    await thrown(() => portal.createPortalClient({ environment: 'nope' })),
    await thrown(() => pdf.parsePrintableDocuments('<x')),
  ]
  console.log(JSON.stringify(errors.map((error) => [error.code, error instanceof root.DteError, root.isDteError(error), root.errorCode(error)])))`)
    expect(result.ok).toBe(true)
    expect(JSON.parse(result.output)).toEqual([
      ['TRANSPORT_FAILED', true, true, 'TRANSPORT_FAILED'],
      ['INVALID_OPTION', true, true, 'INVALID_OPTION'],
      ['XML_PARSE_FAILED', true, true, 'XML_PARSE_FAILED'],
    ])
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
  test('the lazy node:https import works inside the minified build', () => {
    const result = withEntries(`
  const https = require('node:https')
  const certificate = fs.readFileSync(fixtures + '/tls-localhost.pem', 'utf8')
  const key = fs.readFileSync(fixtures + '/tls-localhost.key.pem', 'utf8')
  const server = https.createServer({ key, cert: certificate }, (request, response) => response.end('pong'))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const transport = node.createNodeHttpsTransport({ tls: { ca: certificate } })
  const response = await transport({ method: 'GET', url: 'https://127.0.0.1:' + server.address().port + '/', headers: {}, timeoutMs: 5000 })
  console.log(response.status + ' ' + Buffer.from(response.body).toString())
  server.closeAllConnections()
  server.close()`)
    expect(result).toEqual({ ok: true, output: '200 pong\n' })
  })

  test('the root entry issues and verifies a document end to end', () => {
    const result = withEntries(`${ISSUE_DOCUMENT}
  console.log(root.verifyDocumentSignature(signed.xml).valid)`)
    expect(result).toEqual({ ok: true, output: 'true\n' })
  })

  test('the root entry builds a client, signs a seed and obtains a token without touching the network', () => {
    const result = withEntries(`
  const reply = (name) => ({ status: 200, headers: {}, body: new Uint8Array(fs.readFileSync(fixtures + '/sii/' + name)) })
  const requests = []
  const transport = async (request) => {
    requests.push(request.url)
    return reply(request.url.endsWith('CrSeed.jws') ? 'soap-seed-ok.xml' : 'soap-token-ok.xml')
  }
  const certificate = root.loadCertificateFromPem({
    privateKeyPem: fs.readFileSync(fixtures + '/cert.key.pem', 'utf8'),
    certificatePem: fs.readFileSync(fixtures + '/cert.pem', 'utf8'),
  })
  const sii = root.createSiiClient({ environment: 'certification', certificate, transport })
  console.log(JSON.stringify({
    channel: sii.receiptsChannel,
    seed: root.signSeed('000000000078', certificate).includes('<Reference URI="">'),
    token: await root.getToken(sii, 'soap'),
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

  test('dte-sdk/pdf loads pdf-lib and bwip-js on first use and renders a printed sample', () => {
    const result = withEntries(`${ISSUE_DOCUMENT}
  const [doc] = pdf.parsePrintableDocuments(signed.xml)
  const sample = await pdf.renderPrintedSample(doc, { transferable: true })
  console.log(Buffer.from(sample.subarray(0, 5)).toString() + ' ' + (sample.length > 10000))`)
    expect(result).toEqual({ ok: true, output: '%PDF- true\n' })
  })
})

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

const TYPE_CONSUMERS: ReadonlyArray<readonly [string, string, Record<string, string>]> = [
  ['an ES module on nodenext', 'consumer.mts', { module: 'nodenext', moduleResolution: 'nodenext' }],
  ['a CommonJS module on nodenext', 'consumer.cts', { module: 'nodenext', moduleResolution: 'nodenext' }],
  ['a project on bundler resolution', 'consumer.ts', { module: 'esnext', moduleResolution: 'bundler' }],
  ['a project on node10 resolution', 'consumer.ts', { module: 'commonjs', moduleResolution: 'node10' }],
]

/** Every module a declaration file names: imports, re-exports, `import()` types and `/// <reference types>`. */
const namedModules = (source: string): string[] => {
  const { importedFiles, typeReferenceDirectives } = preProcessFile(source, true, true)
  return [...importedFiles, ...typeReferenceDirectives].map(({ fileName }) => fileName)
}

const declarationFiles = (): string[] =>
  readdirSync(distRoot, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.d.ts'))

const packageName = (specifier: string): string =>
  specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/')

const declaresTypes = (exports: unknown): boolean =>
  typeof exports === 'object' &&
  exports !== null &&
  Object.entries(exports).some(([condition, target]) => condition === 'types' || declaresTypes(target))

/** Whether a consumer that installs dte-sdk gets `name` and its types: a dependency or peer that ships its own. */
const typedForConsumers = (name: string): boolean => {
  const { dependencies = {}, peerDependencies = {} } = JSON.parse(
    readFileSync(join(packageRoot, 'package.json'), 'utf8'),
  ) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> }
  if (!(name in dependencies) && !(name in peerDependencies)) return false
  const own = JSON.parse(readFileSync(join(packageRoot, 'node_modules', name, 'package.json'), 'utf8')) as {
    types?: unknown
    typings?: unknown
    exports?: unknown
  }
  return typeof own.types === 'string' || typeof own.typings === 'string' || declaresTypes(own.exports)
}

guarded('dist smoke: published types', () => {
  // A consumer has the dependencies, not the dev dependencies: a declaration that names a module typed only by an
  // `@types/*` package, as `node-forge` is, fails to compile for them under `skipLibCheck: false` (TS7016). The type
  // consumers below miss that, because the symlinked package resolves the repo's own `node_modules/@types`. A helper
  // whose signature names such a module stays out of the declarations with `@internal`. `node:` modules come from
  // `@types/node`, which a Node consumer has.
  test('every module a declaration names is relative, node: or a dependency that ships its own types', () => {
    const untyped = declarationFiles().flatMap((file) =>
      namedModules(readFileSync(join(distRoot, file), 'utf8'))
        .filter((specifier) => !/^\.\.?\//.test(specifier) && !specifier.startsWith('node:'))
        .filter((specifier) => !typedForConsumers(packageName(specifier)))
        .map((specifier) => `${file}: ${specifier}`),
    )
    expect(untyped).toEqual([])
  })

  test('the declaration scan does find the modules named, and does flag one typed only by @types', () => {
    const named = new Set(
      declarationFiles().flatMap((file) => namedModules(readFileSync(join(distRoot, file), 'utf8'))),
    )
    expect([...named]).toEqual(expect.arrayContaining(['./digest.js', '@xmldom/xmldom', 'node:https', 'pdf-lib']))
    expect(
      namedModules("/** import x from 'a' */\nimport forge from 'node-forge'\nexport type B = import('b').B"),
    ).toEqual(['node-forge', 'b'])
    expect(
      ['@xmldom/xmldom', 'fast-xml-parser', 'rut.ts', 'pdf-lib', 'bwip-js'].filter(typedForConsumers),
    ).toHaveLength(5)
    expect(typedForConsumers('node-forge')).toBe(false)
    expect(typedForConsumers('typescript')).toBe(false)
    expect(packageName('@xmldom/xmldom/lib/dom')).toBe('@xmldom/xmldom')
    expect(packageName('fast-xml-parser/src/fxp')).toBe('fast-xml-parser')
  })

  test.each(TYPE_CONSUMERS)(
    '%s sees the real types of every entry',
    (_name, file, options) => {
      const dir = mkdtempSync(join(tmpdir(), 'dte-sdk-types-'))
      try {
        mkdirSync(join(dir, 'node_modules'))
        symlinkSync(packageRoot, join(dir, 'node_modules', 'dte-sdk'))
        writeFileSync(join(dir, file), TYPE_CONSUMER)
        const compilerOptions = {
          ...options,
          target: 'es2020',
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          esModuleInterop: true,
          types: ['node'],
          typeRoots: [join(packageRoot, 'node_modules', '@types')],
        }
        writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions, files: [file] }))
        const tsc = join(packageRoot, 'node_modules', '.bin', 'tsc')
        const result = spawnSync(tsc, ['-p', dir], { encoding: 'utf8' })
        expect(result.stdout).toBe('')
        expect(result.status).toBe(0)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
    120_000,
  )
})
