# Fase 1 — Core de emisión: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Núcleo de emisión de dte-sdk, funcional y en inglés: crear, timbrar (TED) y firmar (XMLDSig) un DTE de cualquier tipo soportado, y armar y firmar sobres `EnvioDTE`/`EnvioBOLETA`, con modelo de dominio en inglés y JSDoc bilingüe `EN:`/`ES:`.

**Architecture:** Datos inmutables + funciones puras (sin clases salvo `DteError`). Dos modelos: dominio en inglés (`Document`, `Totals`…) y SII-shaped con etiquetas oficiales (`SiiDocumento`, `MntTotal`…) unidos por un codec; el XML siempre se serializa desde la capa SII-shaped en el orden del XSD. Una sola entrada `dte-sdk` (todo desde la raíz). Criptografía y XML con `node-forge`, `@xmldom/xmldom` y `fast-xml-parser`; RUT exclusivamente con `rut.ts`.

**Tech Stack:** TypeScript 5.9 (strict), Node ≥ 20, Jest 30 + ts-jest, expect-type, fast-check, ESLint 9 + Prettier, esbuild (bundle ESM+CJS minificado), size-limit, node-forge 1.4.2, @xmldom/xmldom 0.8.15, fast-xml-parser 5.11.2, rut.ts 5.0.0.

**Spec:** `docs/superpowers/specs/2026-10-31-dte-sdk-architecture-and-phase-1-design.md` (secciones 4 y 5 son el contrato: estructura, API y glosario).

---

## Convenciones que aplican a TODAS las tareas

1. **JSDoc bilingüe obligatorio** en cada símbolo exportado y cada campo de tipo:
   ```ts
   /**
    * EN: What it is or does.
    * ES: `EtiquetaSII` — Qué es o qué hace.
    */
   ```
   En `@param`/`@returns`/`@throws`: `EN: … ES: …` en la misma línea.
2. **Sin clases** (solo `DteError`). Sin `let` mutable fuera de bucles locales. Tipos `readonly`.
3. **Sin PII en mensajes de error**: nunca interpolar RUT, nombres ni textos de ítems en `message`; van en `details`.
4. **Estilo Prettier del repo**: comillas simples, sin punto y coma, ancho 120, comas finales.
5. **Tests**: un archivo por módulo en `tests/`, `describe`/`test.each` como rut.ts. Cobertura 100 % (`jest.config.cjs` ya lo exige). Si una rama defensiva es inalcanzable, elimínala; no bajes el umbral.
6. **Commits** en la rama `feat/core-issuance`, mensaje convencional en inglés, terminados en la línea `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Nada de datos reales (RUT, certificados, rutas locales): `npm run scan` lo verifica.
7. Los comandos se corren desde la raíz del repo.
8. **Fixtures**: `tests/fixtures/` (certificado autofirmado sintético, CAF sintéticos). Se generan con `node scripts/make-fixtures.mjs` **una sola vez** y se versionan; regenerarlos cambia llaves y obliga a regenerar los snapshots.
9. **Nada público nombra a la implementación de referencia**: ni código, ni comentarios, ni tests, ni commits. Descríbase el comportamiento del SII directamente.

## Mapa de archivos

```
scripts/
  build.mjs                 esbuild: ESM + CJS minificados con sourcemap, marcador dist/cjs/package.json
  make-fixtures.mjs         genera tests/fixtures/* con node-forge (correr una vez)
  scan-real-data.mjs        falla si hay RUT no permitidos, rutas locales o secretos versionados
src/
  index.ts                  re-exporta la API pública
  errors.ts                 DteError, DTE_ERROR_CODES, isDteError
  catalogs/document-types.ts DocumentType, DOCUMENT_TYPES, nombres, predicados
  catalogs/codes.ts         ENVIRONMENTS, REFERENCE_CODES, TRANSFER_TYPES, DISPATCH_TYPES, SERVICE_INDICATORS,
                            PAYMENT_TERMS, EXEMPT_INDICATORS, WITHHOLDING_TAX_CODES, VAT_RATE, SII_RUT, FINAL_CONSUMER_RUT…
  catalogs/endpoints.ts     hosts y URLs por ambiente (datos)
  catalogs/upload-status.ts códigos de estado de envío y de documento + clasificación
  model/rut.ts              SiiRut, toSiiRut, isSiiRut, splitSiiRut (adaptador sobre rut.ts)
  model/document.ts         tipos de dominio en inglés (Issuer, Receiver, LineItem, Totals, …, Document, DocumentInput)
  model/sii.ts              tipos SII-shaped (SiiDocumento, SiiEncabezado, …)
  model/codec.ts            toSiiDocument / fromSiiDocument
  model/cover.ts            EnvelopeCover, EnvelopeCoverInput, SiiCaratula
  text/sanitize.ts          sanitizeText, foldToAscii, truncateText, assertMaxLength
  text/latin1.ts            encodeLatin1, decodeLatin1
  time/chile.ts             chileDate, chileTimestamp, chileDateTimeParts, toIsoDate, isIsoDate
  totals/calculate.ts       calculateLineAmount, calculateTotals
  document/create.ts        createDocument, FIELD_LIMITS
  document/build-xml.ts     buildDocumentXml
  document/sign.ts          signDocument, verifyDocumentSignature, SignedDocument
  document/issue.ts         issueDocument
  xml/escape.ts             escapeXmlText, escapeXmlAttribute
  xml/build.ts              buildXml (fast-xml-parser XMLBuilder)
  xml/parse.ts              parseXml, parseXmlWithoutNamespaces, parseXmlDom (xmldom), extractTagContent
  xml/format.ts             formatBase64Columns, wrapBase64
  xml/c14n.ts               canonicalizeElement
  crypto/digest.ts          sha1Base64
  crypto/rsa.ts             rsaSha1SignBase64, rsaSha1VerifyBase64, rsaPublicKeyParts
  crypto/x509.ts            parseCertificatePem, rutFromCertificate
  certificate/certificate.ts Certificate, isCertificateExpired, daysUntilExpiry
  certificate/pem.ts        loadCertificateFromPem
  certificate/pkcs12.ts     loadCertificateFromPkcs12
  caf/parse.ts              parseCaf, Caf
  caf/validity.ts           cafExpiresAt, isCafExpired, isFolioInRange, assertFolioInRange, availableFolios
  caf/sign.ts               signWithCaf, verifyWithCaf
  ted/build.ts              buildDdString, buildTedXml, stampDocument, verifyTed, Ted, StampedDocument
  signature/xmldsig.ts      buildSignedInfo, buildSignatureXml, signEnveloped, verifyEnveloped
  envelope/create.ts        createEnvelope, Envelope
  envelope/build-xml.ts     buildEnvelopeXml
  envelope/sign.ts          signEnvelope, SignedEnvelope
tests/
  support/fixtures.ts       carga de fixtures (ignorado por jest como suite)
  fixtures/                 cert.pfx, cert-aes.pfx, cert-expired.pfx, cert.pem, cert.key.pem, caf-33.xml, caf-39.xml, caf-33-old.xml
  golden/                   XML esperados (documento sin firma, DD, sobre sin firma)
  <modulo>.test.ts          uno por módulo
  property.test.ts, types.test.ts, dist.smoke.test.ts, differential.test.ts
```

---

### Task 0: Scaffolding (rama, dependencias, build con esbuild, fixtures, scan)

**Files:**
- Modify: `package.json`, `.size-limit.json`, `jest.config.cjs`, `tsconfig.json`, `.gitignore`, `.github/workflows/ci.yml`, `src/index.ts`
- Create: `scripts/build.mjs`, `scripts/make-fixtures.mjs`, `scripts/scan-real-data.mjs`, `tests/support/fixtures.ts`, `tests/fixtures/README.md`
- Delete: `scripts/postbuild.mjs`, `tests/hello.test.ts`

- [ ] **Step 1: Crear la rama y limpiar `dist/`**

```bash
git checkout -b feat/core-issuance
rm -rf dist coverage
```

- [ ] **Step 2: Instalar dependencias (exactas; `.npmrc` ya tiene `save-exact`)**

```bash
npm install node-forge@1.4.2 @xmldom/xmldom@0.8.15 fast-xml-parser@5.11.2 rut.ts@5.0.0
npm install --save-dev @types/node-forge@1.3.14 @types/node@26.6.6 esbuild@0.28.2 fast-check@4.10.2
npm uninstall terser
```

Expected: `package.json` con `dependencies` (4) y `devDependencies` sin `terser`.

- [ ] **Step 3: Reemplazar el build por esbuild**

Crear `scripts/build.mjs`:

```js
// Build: one bundle per module format, minified, with a source map that points at the
// shipped `src/` instead of embedding it. Dependencies stay external (they are real
// runtime dependencies in package.json).
import { mkdir, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'

const EXTERNAL = ['node-forge', '@xmldom/xmldom', 'fast-xml-parser', 'rut.ts']

const TARGETS = [
  { format: 'esm', outfile: 'dist/esm/index.min.js' },
  { format: 'cjs', outfile: 'dist/cjs/index.min.js' },
]

for (const { format, outfile } of TARGETS) {
  await build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    format,
    platform: 'neutral',
    target: 'es2020',
    outfile,
    minify: true,
    sourcemap: true,
    sourcesContent: false,
    external: EXTERNAL,
    legalComments: 'none',
    logLevel: 'info',
  })
}

await mkdir('dist/cjs', { recursive: true })
await writeFile('dist/cjs/package.json', '{"type":"commonjs"}\n')
```

Borrar `scripts/postbuild.mjs`:

```bash
git rm scripts/postbuild.mjs
```

En `package.json`, reemplazar los scripts `build`, `build:esm`, `build:cjs` por:

```json
"build": "node scripts/build.mjs && npm run build:types",
"build:types": "tsc --emitDeclarationOnly --outDir dist/esm && tsc --emitDeclarationOnly --outDir dist/cjs",
"scan": "node scripts/scan-real-data.mjs",
"fixtures": "node scripts/make-fixtures.mjs",
"test:differential": "RUN_DIFFERENTIAL=1 jest --config jest.config.cjs tests/differential.test.ts",
```

y en `prepublishOnly` agregar el scan: `"prepublishOnly": "npm run scan && npm run test && npm run prettier && npm run lint"`.
Cambiar `description` a `"TypeScript SDK for Chilean electronic tax documents (DTE): build, stamp (TED), sign and envelope DTEs for the SII."`.

En `tsconfig.json` agregar dentro de `compilerOptions`: `"types": ["node"]` (los tests usan `node:fs`).

En `.size-limit.json` poner `"limit": "60 kB"` en las dos entradas (se ajusta en la Task 23 al valor medido + 10 %).

En `jest.config.cjs` cambiar `testPathIgnorePatterns` por:

```js
testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.claude/', '<rootDir>/tests/support/'],
```

En `.gitignore` agregar una línea `local/` (harness diferencial y referencia, nunca versionados).

En `.github/workflows/ci.yml`:
- renombrar el paso `Build (tsc ESM + CJS + terser)` a `Build (esbuild ESM + CJS + tsc types)`;
- en el job `lint`, agregar después del paso ESLint:
  ```yaml
      - name: Real-data scan (no real RUTs, local paths or secrets)
        run: npm run scan
  ```
- en los smokes de Deno y Bun reemplazar `m.hello() !== 'dte-sdk is coming'` por `typeof m.createDocument !== 'function'` (ambos).

- [ ] **Step 4: Dejar `src/index.ts` vacío y borrar el test del placeholder**

`src/index.ts`:

```ts
// Public API is assembled in Task 21. Kept empty so the build and lint stay green meanwhile.
export {}
```

```bash
git rm tests/hello.test.ts
```

- [ ] **Step 5: Script de fixtures**

Crear `scripts/make-fixtures.mjs`:

```js
// Generates the synthetic test fixtures under tests/fixtures. Run ONCE and commit the
// output: keys are random, so re-running changes every signature and forces the golden
// files to be regenerated too. Nothing here is real: the RUT, the names and the
// password are documentation examples.
import { mkdir, writeFile } from 'node:fs/promises'
import forge from 'node-forge'

const OUT = 'tests/fixtures'
const ISSUER_RUT = '76543210-3'
const ISSUER_NAME = 'EMPRESA EJEMPLO SPA'
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
  const generalNames = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [otherName, rfc822])
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
    { name: 'commonName', value: 'JUAN PEREZ PRUEBA' },
    { name: 'countryName', value: 'CL' },
    { name: 'organizationName', value: ISSUER_NAME },
    { shortName: 'OU', value: 'Terminos de uso en www.ejemplo.cl/tu' },
    { name: 'emailAddress', value: 'juan@ejemplo.cl' },
    { type: '2.5.4.5', value: ISSUER_RUT },
  ]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true, keyEncipherment: true },
    subjectAltName(ISSUER_RUT, 'juan@ejemplo.cl'),
  ])
  cert.sign(keys.privateKey, forge.md.sha256.create())
  return { keys, cert }
}

const pkcs12 = (keys, cert, algorithm) => {
  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], PASSWORD, { algorithm, friendlyName: 'ejemplo' })
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

const valid = makeCertificate({ notBefore: new Date('2026-01-01T00:00:00Z'), notAfter: new Date('2046-01-01T00:00:00Z') })
await writeFile(`${OUT}/cert.pem`, forge.pki.certificateToPem(valid.cert))
await writeFile(`${OUT}/cert.key.pem`, forge.pki.privateKeyToPem(valid.keys.privateKey))
await writeFile(`${OUT}/cert.pfx`, pkcs12(valid.keys, valid.cert, '3des'))
await writeFile(`${OUT}/cert-aes.pfx`, pkcs12(valid.keys, valid.cert, 'aes256'))

const expired = makeCertificate({ notBefore: new Date('2020-01-01T00:00:00Z'), notAfter: new Date('2021-01-01T00:00:00Z') })
await writeFile(`${OUT}/cert-expired.pfx`, pkcs12(expired.keys, expired.cert, '3des'))

await writeFile(`${OUT}/caf-33.xml`, makeCaf({ type: 33, from: 1, to: 100, authorizationDate: '2026-10-31' }))
await writeFile(`${OUT}/caf-39.xml`, makeCaf({ type: 39, from: 1, to: 1000, authorizationDate: '2026-10-31' }))
await writeFile(`${OUT}/caf-33-old.xml`, makeCaf({ type: 33, from: 101, to: 200, authorizationDate: '2025-01-01' }))

console.log(`fixtures written to ${OUT}`)
```

Crear `tests/fixtures/README.md`:

```md
# Test fixtures

Synthetic material generated by `npm run fixtures` (`scripts/make-fixtures.mjs`). Nothing
here is real: `76543210-3` is a documentation RUT, the certificate is self-signed, the CAF
private keys were generated locally and the PFX password is `secret`.

| File | What |
|---|---|
| `cert.pem`, `cert.key.pem` | self-signed certificate (valid 2026-2046) with the RUT in SAN OID 1.3.6.1.4.1.8321.1 and in `serialNumber` |
| `cert.pfx` | same key pair, PKCS#12 with legacy 3DES/RC2 (OpenSSL 1.1 style) |
| `cert-aes.pfx` | same key pair, PKCS#12 with PBES2 + AES-256 (OpenSSL 3 style) |
| `cert-expired.pfx` | certificate valid 2020-2021 |
| `caf-33.xml` | CAF type 33, folios 1-100, authorized 2026-10-31 (1024-bit key) |
| `caf-39.xml` | CAF type 39, folios 1-1000, authorized 2026-10-31 |
| `caf-33-old.xml` | CAF type 33, folios 101-200, authorized 2025-01-01 (expired) |

Regenerating changes every key, so `tests/golden/` must be regenerated in the same commit.
```

Crear `tests/support/fixtures.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const FIXTURES_DIR = join(__dirname, '..', 'fixtures')

export const fixturePath = (name: string): string => join(FIXTURES_DIR, name)
export const fixtureText = (name: string): string => readFileSync(fixturePath(name), 'utf8')
export const fixtureBytes = (name: string): Uint8Array => new Uint8Array(readFileSync(fixturePath(name)))

/** Fixed instant for deterministic tests: 2026-11-15 15:30:00 Chile time (UTC-3 in November). */
export const FIXED_NOW = new Date('2026-11-15T18:30:00.000Z')
export const FIXTURE_PASSWORD = 'secret'
export const ISSUER_RUT = '76543210-3'
export const RECEIVER_RUT = '12345678-5'
```

- [ ] **Step 6: Generar y versionar las fixtures**

Run: `npm run fixtures && ls -la tests/fixtures`
Expected: 8 archivos más el README; `cert.pfx` ≈ 2.7 kB.

- [ ] **Step 7: Script de escaneo de datos reales**

Crear `scripts/scan-real-data.mjs`:

```js
// Fails when a tracked file in the published/scanned areas contains a RUT outside the
// allow-list, a local machine path, or a tracked secret. This repository is public and must
// never carry a real taxpayer.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const SCANNED_PREFIXES = ['src/', 'tests/', 'scripts/', 'README.md', 'llms.txt', 'CHANGELOG.md', 'docs/']
const TEXT_EXTENSIONS = /\.(ts|js|mjs|cjs|json|md|xml|yml|yaml|txt)$/

// Documentation and SII constants only. Adding one is a deliberate decision: ask whose it is first.
const ALLOWED_RUTS = new Set([
  '60803000-K', // SII
  '66666666-6', // final consumer
  '55555555-5', // foreign receiver placeholder
  '44444446-0', // SII placeholder
  '76543210-3', // fixture issuer
  '76543210-K', // documentation RUT (invalid verifier on purpose)
  '77111222-3', // documentation RUT
  '12345678-5', // rut.ts documentation RUT
  '11111111-1', // rut.ts documentation RUT
  '12345678-9', // documentation (invalid verifier)
  '14625621-K', // rut.ts documentation RUT
  '10000004-0', // rut.ts documentation RUT
  '18264950-3', // rut.ts documentation RUT
  '7654321-6', // documentation RUT
  '9876543-2', // documentation RUT
])
const RUT_PATTERN = /\b\d{1,2}(?:\.\d{3}){2}-[\dkK]\b|\b\d{7,8}-[\dkK]\b/g
const LOCAL_PATH_PATTERN = /\/Users\/|\/home\/[a-z]|C:\\Users\\/
const SECRET_FILE_PATTERN = /\.(pfx|p12|pem|key)$|(^|\/)\.env(\.|$)/

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter((file) => file && SCANNED_PREFIXES.some((prefix) => file.startsWith(prefix)))

const problems = []
for (const file of tracked) {
  if (SECRET_FILE_PATTERN.test(file) && !file.startsWith('tests/fixtures/')) {
    problems.push(`${file}: secret-looking file is tracked`)
    continue
  }
  if (!TEXT_EXTENSIONS.test(file)) continue
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(RUT_PATTERN)) {
    const canonical = match[0].replace(/\./g, '').toUpperCase()
    if (!ALLOWED_RUTS.has(canonical)) problems.push(`${file}: RUT not in allow-list: ${canonical}`)
  }
  if (LOCAL_PATH_PATTERN.test(text)) problems.push(`${file}: local machine path`)
}

if (problems.length > 0) {
  console.error('Real-data scan FAILED:\n' + problems.map((p) => `  - ${p}`).join('\n'))
  process.exit(1)
}
console.log(`Real-data scan ok (${tracked.length} files)`)
```

Run: `npm run scan`
Expected: `Real-data scan ok (N files)`.

- [ ] **Step 8: Verificar que todo sigue verde y commitear**

Run: `npm test && npm run lint && npm run build && npm run size`
Expected: Jest "No tests found" sale con código 1 — por eso en este paso usa `npx jest --passWithNoTests`; build genera `dist/esm/index.min.js` y `dist/cjs/index.min.js`; size-limit pasa.

```bash
git add -A
git commit -m "chore: scaffold phase 1 (deps, esbuild build, fixtures, real-data scan)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 1: Errores tipados (`src/errors.ts`)

**Files:**
- Create: `src/errors.ts`
- Test: `tests/errors.test.ts`

- [ ] **Step 1: Test que falla**

`tests/errors.test.ts`:

```ts
import { DteError, DTE_ERROR_CODES, isDteError } from '../src/errors'

describe('DteError', () => {
  test('carries a stable code, generic message and details', () => {
    const err = new DteError('FIELD_TOO_LONG', { field: 'NmbItem', maxLength: 80, length: 83 })
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('DteError')
    expect(err.code).toBe('FIELD_TOO_LONG')
    expect(err.details).toEqual({ field: 'NmbItem', maxLength: 80, length: 83 })
    expect(err.message).toBe('Field exceeds the maximum length allowed by the SII schema (field=NmbItem, maxLength=80, length=83)')
  })

  test('never echoes free text details into the message', () => {
    const err = new DteError('INVALID_RUT', { field: 'issuer.rut', value: 'SECRET-RUT' })
    expect(err.message).toBe('Invalid RUT (field=issuer.rut)')
    expect(err.message).not.toContain('SECRET')
  })

  test('defaults details to an empty object', () => {
    expect(new DteError('CAF_INVALID').details).toEqual({})
    expect(new DteError('CAF_INVALID').message).toBe('CAF is not valid')
  })

  test.each(Object.values(DTE_ERROR_CODES))('every code has a message: %s', (code) => {
    expect(new DteError(code).message.length).toBeGreaterThan(5)
  })

  test('isDteError narrows', () => {
    expect(isDteError(new DteError('CAF_EXPIRED'))).toBe(true)
    expect(isDteError(new Error('x'))).toBe(false)
    expect(isDteError(null)).toBe(false)
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest tests/errors.test.ts`
Expected: FAIL, `Cannot find module '../src/errors'`.

- [ ] **Step 3: Implementación**

`src/errors.ts`:

```ts
/**
 * EN: Stable error codes thrown by dte-sdk. Branch on `error.code`, never on the message text.
 * ES: Códigos de error estables que lanza dte-sdk. Discrimina por `error.code`, nunca por el texto del mensaje.
 */
export const DTE_ERROR_CODES = {
  INVALID_RUT: 'INVALID_RUT',
  INVALID_DOCUMENT_TYPE: 'INVALID_DOCUMENT_TYPE',
  INVALID_FOLIO: 'INVALID_FOLIO',
  INVALID_DATE: 'INVALID_DATE',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  MISSING_FIELD: 'MISSING_FIELD',
  FIELD_TOO_LONG: 'FIELD_TOO_LONG',
  CAF_INVALID: 'CAF_INVALID',
  CAF_EXPIRED: 'CAF_EXPIRED',
  CAF_TYPE_MISMATCH: 'CAF_TYPE_MISMATCH',
  CAF_ISSUER_MISMATCH: 'CAF_ISSUER_MISMATCH',
  FOLIO_OUT_OF_RANGE: 'FOLIO_OUT_OF_RANGE',
  CERT_INVALID: 'CERT_INVALID',
  CERT_PASSWORD_WRONG: 'CERT_PASSWORD_WRONG',
  CERT_EXPIRED: 'CERT_EXPIRED',
  XML_PARSE_FAILED: 'XML_PARSE_FAILED',
  SIGNATURE_NOT_FOUND: 'SIGNATURE_NOT_FOUND',
  ENCODING_UNSUPPORTED_CHAR: 'ENCODING_UNSUPPORTED_CHAR',
  ENVELOPE_EMPTY: 'ENVELOPE_EMPTY',
  ENVELOPE_KIND_MISMATCH: 'ENVELOPE_KIND_MISMATCH',
} as const

/**
 * EN: Union of every `DTE_ERROR_CODES` value.
 * ES: Unión de todos los valores de `DTE_ERROR_CODES`.
 */
export type DteErrorCode = (typeof DTE_ERROR_CODES)[keyof typeof DTE_ERROR_CODES]

/**
 * EN: Structured context of an error. May hold the offending value; it is never copied into `message`.
 * ES: Contexto estructurado de un error. Puede traer el valor ofensivo; nunca se copia al `message`.
 */
export type DteErrorDetails = Readonly<Record<string, unknown>>

const MESSAGES: Readonly<Record<DteErrorCode, string>> = {
  INVALID_RUT: 'Invalid RUT',
  INVALID_DOCUMENT_TYPE: 'Unsupported document type',
  INVALID_FOLIO: 'Folio must be a positive integer',
  INVALID_DATE: 'Date must be YYYY-MM-DD',
  INVALID_AMOUNT: 'Amount must be a finite number',
  MISSING_FIELD: 'Required field is missing',
  FIELD_TOO_LONG: 'Field exceeds the maximum length allowed by the SII schema',
  CAF_INVALID: 'CAF is not valid',
  CAF_EXPIRED: 'CAF has expired (6 months after its authorization date)',
  CAF_TYPE_MISMATCH: 'CAF document type does not match the document',
  CAF_ISSUER_MISMATCH: 'CAF issuer RUT does not match the document issuer',
  FOLIO_OUT_OF_RANGE: 'Folio is outside the CAF range',
  CERT_INVALID: 'Certificate is not valid',
  CERT_PASSWORD_WRONG: 'Certificate password is wrong',
  CERT_EXPIRED: 'Certificate has expired',
  XML_PARSE_FAILED: 'XML could not be parsed',
  SIGNATURE_NOT_FOUND: 'XML has no Signature element',
  ENCODING_UNSUPPORTED_CHAR: 'Text contains a character outside ISO-8859-1',
  ENVELOPE_EMPTY: 'Envelope has no documents',
  ENVELOPE_KIND_MISMATCH: 'Document type does not belong in this envelope kind',
}

// Only these detail keys are safe to show: field names and numbers, never user text.
const SAFE_DETAIL_KEYS = ['field', 'maxLength', 'length', 'type', 'folio', 'from', 'to', 'kind', 'index'] as const

const formatMessage = (code: DteErrorCode, details: DteErrorDetails): string => {
  const shown = SAFE_DETAIL_KEYS.filter((key) => details[key] !== undefined).map((key) => `${key}=${String(details[key])}`)
  return shown.length === 0 ? MESSAGES[code] : `${MESSAGES[code]} (${shown.join(', ')})`
}

/**
 * EN: Typed error thrown by dte-sdk. The message is generic (code + safe keys such as the field name); the
 * offending value, if any, lives in `details` so no RUT or free text leaks into logs.
 * ES: Error tipado que lanza dte-sdk. El mensaje es genérico (código + claves seguras como el nombre del campo);
 * el valor ofensivo, si lo hay, va en `details`, así ningún RUT ni texto libre llega a los logs.
 */
export class DteError extends Error {
  /** EN: Stable error code. ES: Código de error estable. */
  readonly code: DteErrorCode
  /** EN: Structured context. ES: Contexto estructurado. */
  readonly details: DteErrorDetails

  constructor(code: DteErrorCode, details: DteErrorDetails = {}) {
    super(formatMessage(code, details))
    this.name = 'DteError'
    this.code = code
    this.details = details
  }
}

/**
 * EN: Type guard for `DteError`.
 * ES: Guarda de tipo para `DteError`.
 * @param value EN: anything. ES: cualquier valor.
 * @returns EN: true when `value` is a `DteError`. ES: true cuando `value` es un `DteError`.
 */
export const isDteError = (value: unknown): value is DteError => value instanceof DteError
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest tests/errors.test.ts`
Expected: PASS (5 tests + los `test.each`).

- [ ] **Step 5: Commit**

```bash
git add src/errors.ts tests/errors.test.ts
git commit -m "feat: typed DteError with stable codes and PII-free messages

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Catálogo de tipos de documento (`src/catalogs/document-types.ts`)

**Files:**
- Create: `src/catalogs/document-types.ts`
- Test: `tests/document-types.test.ts`

- [ ] **Step 1: Test que falla**

`tests/document-types.test.ts`:

```ts
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_VALUES,
  documentTypeName,
  isDocumentType,
  isExemptType,
  isNote,
  isReceipt,
  requiresReceiver,
  isTransferable,
} from '../src/catalogs/document-types'

describe('document types', () => {
  test('maps English names to SII codes', () => {
    expect(DOCUMENT_TYPES).toEqual({
      invoice: 33,
      exemptInvoice: 34,
      receipt: 39,
      exemptReceipt: 41,
      settlementInvoice: 43,
      purchaseInvoice: 46,
      dispatchGuide: 52,
      debitNote: 56,
      creditNote: 61,
    })
    expect(DOCUMENT_TYPE_VALUES).toEqual([33, 34, 39, 41, 43, 46, 52, 56, 61])
  })

  test.each([33, 34, 39, 41, 43, 46, 52, 56, 61])('isDocumentType accepts %i', (type) => {
    expect(isDocumentType(type)).toBe(true)
  })

  test.each([0, 110, '33', null, undefined, 33.5, NaN])('isDocumentType rejects %p', (value) => {
    expect(isDocumentType(value)).toBe(false)
  })

  test('predicates', () => {
    expect([39, 41].every(isReceipt)).toBe(true)
    expect([33, 34, 43, 46, 52, 56, 61].some(isReceipt)).toBe(false)
    expect([34, 41].every(isExemptType)).toBe(true)
    expect(isExemptType(33)).toBe(false)
    expect([56, 61].every(isNote)).toBe(true)
    expect(isNote(33)).toBe(false)
    expect([33, 34, 43, 46, 52, 56, 61].every(requiresReceiver)).toBe(true)
    expect([39, 41].some(requiresReceiver)).toBe(false)
    expect([33, 34, 43, 46, 52].every(isTransferable)).toBe(true)
    expect([39, 41, 56, 61].some(isTransferable)).toBe(false)
  })

  test('names in the three variants', () => {
    expect(documentTypeName(33)).toBe('Factura Electrónica')
    expect(documentTypeName(33, 'short')).toBe('FACTURA')
    expect(documentTypeName(33, 'printed')).toBe('FACTURA ELECTRÓNICA')
    expect(documentTypeName(43, 'printed')).toBe('LIQUIDACIÓN FACTURA ELECTRÓNICA')
    expect(documentTypeName(34, 'printed')).toBe('FACTURA NO AFECTA O EXENTA ELECTRÓNICA')
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest tests/document-types.test.ts`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementación**

`src/catalogs/document-types.ts`:

```ts
/**
 * EN: SII document type codes supported by dte-sdk, keyed by their English name.
 * ES: `TipoDTE` — Códigos de tipo de documento del SII que soporta dte-sdk, por su nombre en inglés.
 */
export const DOCUMENT_TYPES = {
  /** EN: Electronic invoice. ES: 33 — Factura Electrónica. */
  invoice: 33,
  /** EN: VAT-exempt electronic invoice. ES: 34 — Factura No Afecta o Exenta Electrónica. */
  exemptInvoice: 34,
  /** EN: Electronic receipt (boleta). ES: 39 — Boleta Electrónica. */
  receipt: 39,
  /** EN: VAT-exempt electronic receipt. ES: 41 — Boleta Exenta Electrónica. */
  exemptReceipt: 41,
  /** EN: Settlement invoice issued by an agent on behalf of a principal. ES: 43 — Liquidación Factura Electrónica. */
  settlementInvoice: 43,
  /** EN: Purchase invoice (buyer issues it and withholds VAT). ES: 46 — Factura de Compra Electrónica. */
  purchaseInvoice: 46,
  /** EN: Dispatch guide (goods in transit). ES: 52 — Guía de Despacho Electrónica. */
  dispatchGuide: 52,
  /** EN: Debit note. ES: 56 — Nota de Débito Electrónica. */
  debitNote: 56,
  /** EN: Credit note. ES: 61 — Nota de Crédito Electrónica. */
  creditNote: 61,
} as const

/**
 * EN: Union of the supported `TipoDTE` codes.
 * ES: Unión de los códigos `TipoDTE` soportados.
 */
export type DocumentType = (typeof DOCUMENT_TYPES)[keyof typeof DOCUMENT_TYPES]

/**
 * EN: Every supported code, ascending.
 * ES: Todos los códigos soportados, ascendentes.
 */
export const DOCUMENT_TYPE_VALUES: readonly DocumentType[] = [33, 34, 39, 41, 43, 46, 52, 56, 61]

const RECEIPT_TYPES: readonly DocumentType[] = [39, 41]
const EXEMPT_TYPES: readonly DocumentType[] = [34, 41]
const NOTE_TYPES: readonly DocumentType[] = [56, 61]
const RECEIVER_REQUIRED_TYPES: readonly DocumentType[] = [33, 34, 43, 46, 52, 56, 61]
const TRANSFERABLE_TYPES: readonly DocumentType[] = [33, 34, 43, 46, 52]

type NameVariants = { readonly long: string; readonly short: string; readonly printed: string }

const NAMES: Readonly<Record<DocumentType, NameVariants>> = {
  33: { long: 'Factura Electrónica', short: 'FACTURA', printed: 'FACTURA ELECTRÓNICA' },
  34: { long: 'Factura Exenta Electrónica', short: 'FACTURA EXENTA', printed: 'FACTURA NO AFECTA O EXENTA ELECTRÓNICA' },
  39: { long: 'Boleta Electrónica', short: 'BOLETA', printed: 'BOLETA ELECTRÓNICA' },
  41: { long: 'Boleta Exenta Electrónica', short: 'BOLETA EXENTA', printed: 'BOLETA EXENTA ELECTRÓNICA' },
  43: { long: 'Liquidación Factura Electrónica', short: 'LIQUIDACION FACTURA', printed: 'LIQUIDACIÓN FACTURA ELECTRÓNICA' },
  46: { long: 'Factura de Compra Electrónica', short: 'FACTURA COMPRA', printed: 'FACTURA DE COMPRA ELECTRÓNICA' },
  52: { long: 'Guía de Despacho Electrónica', short: 'GUIA DESPACHO', printed: 'GUÍA DE DESPACHO ELECTRÓNICA' },
  56: { long: 'Nota de Débito Electrónica', short: 'NOTA DEBITO', printed: 'NOTA DE DÉBITO ELECTRÓNICA' },
  61: { long: 'Nota de Crédito Electrónica', short: 'NOTA CREDITO', printed: 'NOTA DE CRÉDITO ELECTRÓNICA' },
}

/**
 * EN: Type guard: true when `value` is one of the supported `TipoDTE` codes.
 * ES: Guarda de tipo: true cuando `value` es uno de los códigos `TipoDTE` soportados.
 */
export const isDocumentType = (value: unknown): value is DocumentType =>
  typeof value === 'number' && (DOCUMENT_TYPE_VALUES as readonly number[]).includes(value)

/**
 * EN: True for receipts (39, 41): no identified receiver required, no `TasaIVA`, REST channel.
 * ES: True para boletas (39, 41): no exigen receptor identificado, no llevan `TasaIVA`, van por REST.
 */
export const isReceipt = (type: DocumentType): boolean => RECEIPT_TYPES.includes(type)

/**
 * EN: True for the VAT-exempt types (34, 41): every line is exempt.
 * ES: True para los tipos exentos (34, 41): todas las líneas son exentas.
 */
export const isExemptType = (type: DocumentType): boolean => EXEMPT_TYPES.includes(type)

/**
 * EN: True for debit and credit notes (56, 61), which must reference another document.
 * ES: True para notas de débito y crédito (56, 61), que deben referenciar otro documento.
 */
export const isNote = (type: DocumentType): boolean => NOTE_TYPES.includes(type)

/**
 * EN: True when the type needs an identified receiver (everything but receipts).
 * ES: True cuando el tipo exige receptor identificado (todo menos boletas).
 */
export const requiresReceiver = (type: DocumentType): boolean => RECEIVER_REQUIRED_TYPES.includes(type)

/**
 * EN: True when the printed document carries a transferable copy (cedible) and the Ley 19.983 acknowledgement box.
 * ES: True cuando el impreso lleva copia cedible y recuadro de acuse de recibo Ley 19.983 (33, 34, 43, 46, 52).
 */
export const isTransferable = (type: DocumentType): boolean => TRANSFERABLE_TYPES.includes(type)

/**
 * EN: Official Spanish name of a document type: `long` (default), `short` (uppercase, no accents) or `printed` (uppercase per the SII printed-samples manual).
 * ES: Nombre oficial del tipo: `long` (por defecto), `short` (mayúsculas sin tildes) o `printed` (mayúsculas según el manual de muestras impresas del SII).
 */
export const documentTypeName = (type: DocumentType, variant: keyof NameVariants = 'long'): string => NAMES[type][variant]
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest tests/document-types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/catalogs/document-types.ts tests/document-types.test.ts
git commit -m "feat: document type catalog with English names and predicates

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Catálogos de códigos y endpoints (`src/catalogs/codes.ts`, `src/catalogs/endpoints.ts`)

**Files:**
- Create: `src/catalogs/codes.ts`, `src/catalogs/endpoints.ts`
- Test: `tests/codes.test.ts`, `tests/endpoints.test.ts`

- [ ] **Step 1: Tests que fallan**

`tests/codes.test.ts`:

```ts
import {
  ENVIRONMENTS,
  REFERENCE_CODES,
  TRANSFER_TYPES,
  DISPATCH_TYPES,
  SERVICE_INDICATORS,
  PAYMENT_TERMS,
  EXEMPT_INDICATORS,
  WITHHOLDING_TAX_CODES,
  VAT_RATE,
  SII_RUT,
  FINAL_CONSUMER_RUT,
  CERTIFICATION_KEY_ID,
  isEnvironment,
} from '../src/catalogs/codes'

describe('codes', () => {
  test('constants match the SII values', () => {
    expect(ENVIRONMENTS).toEqual({ certification: 'certification', production: 'production' })
    expect(REFERENCE_CODES).toEqual({ cancels: 1, correctsText: 2, correctsAmounts: 3 })
    expect(TRANSFER_TYPES.sale).toBe(1)
    expect(TRANSFER_TYPES.internalTransfer).toBe(5)
    expect(TRANSFER_TYPES.exportSale).toBe(9)
    expect(DISPATCH_TYPES.byReceiver).toBe(1)
    expect(SERVICE_INDICATORS.salesAndServices).toBe(3)
    expect(PAYMENT_TERMS).toEqual({ cash: 1, credit: 2, free: 3 })
    expect(EXEMPT_INDICATORS.exempt).toBe(1)
    expect(EXEMPT_INDICATORS.nonBillableNegative).toBe(6)
    expect(WITHHOLDING_TAX_CODES.totalVatWithholding).toBe(15)
    expect(VAT_RATE).toBe(19)
    expect(SII_RUT).toBe('60803000-K')
    expect(FINAL_CONSUMER_RUT).toBe('66666666-6')
    expect(CERTIFICATION_KEY_ID).toBe(100)
  })

  test('isEnvironment', () => {
    expect(isEnvironment('certification')).toBe(true)
    expect(isEnvironment('production')).toBe(true)
    expect(isEnvironment('certificacion')).toBe(false)
    expect(isEnvironment(1)).toBe(false)
  })
})
```

`tests/endpoints.test.ts`:

```ts
import { SII_HOSTS, SOAP_ENDPOINTS, REST_ENDPOINTS, CLAIM_WS_ENDPOINTS, UPLOAD_USER_AGENT } from '../src/catalogs/endpoints'

describe('endpoints', () => {
  test('hosts per environment', () => {
    expect(SII_HOSTS).toEqual({ certification: 'maullin.sii.cl', production: 'palena.sii.cl' })
  })

  test.each(['certification', 'production'] as const)('%s SOAP and REST URLs are https', (env) => {
    for (const url of Object.values(SOAP_ENDPOINTS[env])) expect(url).toMatch(/^https:\/\/(maullin|palena)\.sii\.cl\//)
    for (const url of Object.values(REST_ENDPOINTS[env])) expect(url).toMatch(/^https:\/\/(apicert|api|pangal|rahue)\.sii\.cl\//)
    expect(CLAIM_WS_ENDPOINTS[env]).toMatch(/^https:\/\/ws[12]\.sii\.cl\//)
  })

  test('upload endpoints', () => {
    expect(SOAP_ENDPOINTS.certification.upload).toBe('https://maullin.sii.cl/cgi_dte/UPL/DTEUpload')
    expect(REST_ENDPOINTS.production.upload).toBe('https://rahue.sii.cl/recursos/v1/boleta.electronica.envio')
    expect(UPLOAD_USER_AGENT).toBe('Mozilla/4.0 ( compatible; PROG 1.0; Windows NT)')
  })
})
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx jest tests/codes.test.ts tests/endpoints.test.ts`
Expected: FAIL, módulos no encontrados.

- [ ] **Step 3: Implementación**

`src/catalogs/codes.ts`:

```ts
/**
 * EN: SII environments: `certification` (maullin, test) and `production` (palena).
 * ES: Ambientes del SII: `certification` (maullin, certificación) y `production` (palena, producción).
 */
export const ENVIRONMENTS = { certification: 'certification', production: 'production' } as const

/** EN: Union of the environment names. ES: Unión de los nombres de ambiente. */
export type Environment = (typeof ENVIRONMENTS)[keyof typeof ENVIRONMENTS]

/** EN: Type guard for `Environment`. ES: Guarda de tipo para `Environment`. */
export const isEnvironment = (value: unknown): value is Environment =>
  value === ENVIRONMENTS.certification || value === ENVIRONMENTS.production

/**
 * EN: Reference codes used in `Referencia/CodRef` by credit and debit notes.
 * ES: `CodRef` — Códigos de referencia de notas de crédito y débito: 1 anula, 2 corrige texto, 3 corrige montos.
 */
export const REFERENCE_CODES = { cancels: 1, correctsText: 2, correctsAmounts: 3 } as const
/** EN: Union of `REFERENCE_CODES` values. ES: Unión de los valores de `REFERENCE_CODES`. */
export type ReferenceCode = (typeof REFERENCE_CODES)[keyof typeof REFERENCE_CODES]

/**
 * EN: Transfer reasons for dispatch guides (`IdDoc/IndTraslado`).
 * ES: `IndTraslado` — Tipo de traslado de la guía de despacho (1 venta, 2 ventas por efectuar, 3 consignación, 4 entrega gratuita, 5 traslado interno, 6 otros no venta, 7 devolución, 8 traslado para exportación, 9 venta para exportación).
 */
export const TRANSFER_TYPES = {
  sale: 1,
  pendingSale: 2,
  consignment: 3,
  freeDelivery: 4,
  internalTransfer: 5,
  otherNonSale: 6,
  return: 7,
  exportTransfer: 8,
  exportSale: 9,
} as const
/** EN: Union of `TRANSFER_TYPES` values. ES: Unión de los valores de `TRANSFER_TYPES`. */
export type TransferType = (typeof TRANSFER_TYPES)[keyof typeof TRANSFER_TYPES]

/**
 * EN: Who dispatches the goods (`IdDoc/TipoDespacho`).
 * ES: `TipoDespacho` — 1 por cuenta del receptor, 2 por cuenta del emisor a instalaciones del receptor, 3 por cuenta del emisor a otras instalaciones.
 */
export const DISPATCH_TYPES = { byReceiver: 1, byIssuerToReceiver: 2, byIssuerToOther: 3 } as const
/** EN: Union of `DISPATCH_TYPES` values. ES: Unión de los valores de `DISPATCH_TYPES`. */
export type DispatchType = (typeof DISPATCH_TYPES)[keyof typeof DISPATCH_TYPES]

/**
 * EN: Service indicator (`IdDoc/IndServicio`), mandatory on receipts (3 is the common case).
 * ES: `IndServicio` — 1 servicios periódicos, 2 servicios periódicos domiciliarios, 3 ventas y servicios (el habitual), 4 espectáculos.
 */
export const SERVICE_INDICATORS = { periodicServices: 1, periodicHomeServices: 2, salesAndServices: 3, shows: 4 } as const
/** EN: Union of `SERVICE_INDICATORS` values. ES: Unión de los valores de `SERVICE_INDICATORS`. */
export type ServiceIndicator = (typeof SERVICE_INDICATORS)[keyof typeof SERVICE_INDICATORS]

/**
 * EN: Payment terms (`IdDoc/FmaPago`).
 * ES: `FmaPago` — Forma de pago: 1 contado, 2 crédito, 3 sin costo (entrega gratuita).
 */
export const PAYMENT_TERMS = { cash: 1, credit: 2, free: 3 } as const
/** EN: Union of `PAYMENT_TERMS` values. ES: Unión de los valores de `PAYMENT_TERMS`. */
export type PaymentTerms = (typeof PAYMENT_TERMS)[keyof typeof PAYMENT_TERMS]

/**
 * EN: Line exemption indicator (`Detalle/IndExe`).
 * ES: `IndExe` — 1 no afecto o exento, 2 no facturable, 3 garantía por depósito de envases, 4 no constituye venta, 5 ítem a rebajar, 6 no facturable negativo.
 */
export const EXEMPT_INDICATORS = {
  exempt: 1,
  nonBillable: 2,
  containerDeposit: 3,
  notASale: 4,
  deduction: 5,
  nonBillableNegative: 6,
} as const
/** EN: Union of `EXEMPT_INDICATORS` values. ES: Unión de los valores de `EXEMPT_INDICATORS`. */
export type ExemptIndicator = (typeof EXEMPT_INDICATORS)[keyof typeof EXEMPT_INDICATORS]

/**
 * EN: Withholding tax codes used in `Totales/ImptoReten/TipoImp`.
 * ES: `TipoImp` — Códigos de impuesto de retención: 15 = IVA retenido total (factura de compra, tipo 46).
 */
export const WITHHOLDING_TAX_CODES = { totalVatWithholding: 15 } as const

/** EN: VAT rate in force, percent. ES: `TasaIVA` — Tasa de IVA vigente, en porcentaje (19). */
export const VAT_RATE = 19

/** EN: RUT of the SII itself, the receiver of every envelope. ES: RUT del SII, receptor de todo sobre: 60803000-K. */
export const SII_RUT = '60803000-K'

/** EN: Generic final-consumer RUT used on receipts without an identified buyer. ES: RUT genérico de consumidor final para boletas sin comprador identificado: 66666666-6. */
export const FINAL_CONSUMER_RUT = '66666666-6'

/** EN: `IDK` value that marks a certification-environment CAF. ES: `IDK` — Valor que marca un CAF del ambiente de certificación (100). */
export const CERTIFICATION_KEY_ID = 100
```

`src/catalogs/endpoints.ts`:

```ts
import type { Environment } from './codes'

/**
 * EN: Base hosts of the DTE web services per environment.
 * ES: Hosts base de los web services DTE por ambiente: maullin (certificación) y palena (producción).
 */
export const SII_HOSTS: Readonly<Record<Environment, string>> = {
  certification: 'maullin.sii.cl',
  production: 'palena.sii.cl',
}

type SoapEndpoints = {
  /** EN: `CrSeed.jws`, seed for the SOAP token. ES: Semilla del token SOAP. */
  readonly seed: string
  /** EN: `GetTokenFromSeed.jws`. ES: Token a partir de la semilla firmada. */
  readonly token: string
  /** EN: `DTEUpload` multipart endpoint. ES: Subida de sobres, libros y RCOF. */
  readonly upload: string
  /** EN: `QueryEstUp.jws`, envelope status. ES: Estado de un envío por TrackID. */
  readonly uploadStatus: string
  /** EN: `QueryEstDte.jws`, single document status. ES: Estado de un documento puntual. */
  readonly documentStatus: string
}

const soapFor = (host: string): SoapEndpoints => ({
  seed: `https://${host}/DTEWS/CrSeed.jws`,
  token: `https://${host}/DTEWS/GetTokenFromSeed.jws`,
  upload: `https://${host}/cgi_dte/UPL/DTEUpload`,
  uploadStatus: `https://${host}/DTEWS/QueryEstUp.jws`,
  documentStatus: `https://${host}/DTEWS/QueryEstDte.jws`,
})

/**
 * EN: SOAP / CGI endpoints per environment (seed, token, upload, status).
 * ES: Endpoints SOAP / CGI por ambiente (semilla, token, DTEUpload, estados).
 */
export const SOAP_ENDPOINTS: Readonly<Record<Environment, SoapEndpoints>> = {
  certification: soapFor(SII_HOSTS.certification),
  production: soapFor(SII_HOSTS.production),
}

type RestEndpoints = {
  /** EN: GET seed for the receipts REST API. ES: Semilla de la API REST de boletas. */
  readonly seed: string
  /** EN: POST signed seed → token. ES: Token REST a partir de la semilla firmada. */
  readonly token: string
  /** EN: multipart upload of `EnvioBOLETA`. ES: Envío REST de boletas. */
  readonly upload: string
  /** EN: status prefix; append `{rut}-{dv}-{trackId}`. ES: Prefijo de estado; se completa con `{rut}-{dv}-{trackId}`. */
  readonly status: string
}

/**
 * EN: REST endpoints of the receipts API per environment.
 * ES: Endpoints REST de boletas por ambiente (apicert/pangal en certificación, api/rahue en producción).
 */
export const REST_ENDPOINTS: Readonly<Record<Environment, RestEndpoints>> = {
  certification: {
    seed: 'https://apicert.sii.cl/recursos/v1/boleta.electronica.semilla',
    token: 'https://apicert.sii.cl/recursos/v1/boleta.electronica.token',
    upload: 'https://pangal.sii.cl/recursos/v1/boleta.electronica.envio',
    status: 'https://apicert.sii.cl/recursos/v1/boleta.electronica.envio/',
  },
  production: {
    seed: 'https://api.sii.cl/recursos/v1/boleta.electronica.semilla',
    token: 'https://api.sii.cl/recursos/v1/boleta.electronica.token',
    upload: 'https://rahue.sii.cl/recursos/v1/boleta.electronica.envio',
    status: 'https://api.sii.cl/recursos/v1/boleta.electronica.envio/',
  },
}

/**
 * EN: WSDL of the acceptance/claim registry web service (WSRECLAMO v1.2).
 * ES: WSDL del web service de Registro de Aceptación/Reclamo (WSRECLAMO v1.2).
 */
export const CLAIM_WS_ENDPOINTS: Readonly<Record<Environment, string>> = {
  certification: 'https://ws2.sii.cl/WSREGISTRORECLAMODTECERT/registroreclamodteservice?wsdl',
  production: 'https://ws1.sii.cl/WSREGISTRORECLAMODTE/registroreclamodteservice?wsdl',
}

/**
 * EN: User-Agent the SII upload CGI expects (it rejects modern browser strings).
 * ES: User-Agent que espera el CGI de subida del SII (rechaza cadenas de navegador modernas).
 */
export const UPLOAD_USER_AGENT = 'Mozilla/4.0 ( compatible; PROG 1.0; Windows NT)'
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx jest tests/codes.test.ts tests/endpoints.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/catalogs/codes.ts src/catalogs/endpoints.ts tests/codes.test.ts tests/endpoints.test.ts
git commit -m "feat: SII code catalogs and endpoint tables

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Clasificación de estados del SII (`src/catalogs/upload-status.ts`)

**Files:**
- Create: `src/catalogs/upload-status.ts`
- Test: `tests/upload-status.test.ts`

- [ ] **Step 1: Test que falla**

`tests/upload-status.test.ts`:

```ts
import {
  classifyUploadStatus,
  uploadStatusMessage,
  classifyDocumentStatus,
  documentStatusMessage,
  isRetryableStatus,
} from '../src/catalogs/upload-status'

describe('upload status (QueryEstUp / REST)', () => {
  test.each([
    ['EPR', 'accepted'],
    ['LOK', 'accepted'],
    ['RPR', 'acceptedWithObjections'],
    ['REC', 'pending'],
    ['SOK', 'pending'],
    ['FOK', 'pending'],
    ['PRD', 'pending'],
    ['CRT', 'pending'],
    ['DNK', 'pending'],
    ['PDR', 'pending'],
    ['LSO', 'pending'],
    ['0', 'pending'],
    ['RPT', 'rejected'],
    ['RFR', 'rejected'],
    ['VOF', 'rejected'],
    ['RCT', 'rejected'],
    ['RCH', 'rejected'],
    ['RSC', 'rejected'],
    ['RLV', 'rejected'],
    ['LNC', 'rejected'],
    ['LRH', 'rejected'],
    ['-1', 'queryError'],
    ['-14', 'queryError'],
    ['ZZZ', 'unknown'],
  ])('SOAP %s → %s', (code, expected) => {
    expect(classifyUploadStatus(code)).toBe(expected)
    expect(classifyUploadStatus(code, 'soap')).toBe(expected)
  })

  test('RLV is accepted on the receipts REST channel and rejected on SOAP', () => {
    expect(classifyUploadStatus('RLV', 'rest')).toBe('accepted')
    expect(classifyUploadStatus('RLV', 'soap')).toBe('rejected')
    expect(classifyUploadStatus('EPR', 'rest')).toBe('accepted')
    expect(classifyUploadStatus('RCH', 'rest')).toBe('rejected')
  })

  test('messages are Spanish glosses', () => {
    expect(uploadStatusMessage('EPR')).toBe('Envío procesado')
    expect(uploadStatusMessage('RCT')).toBe('Rechazado por error en carátula')
    expect(uploadStatusMessage('-11')).toBe('Error de consulta del SII, reintentar más tarde')
    expect(uploadStatusMessage('ZZZ')).toBe('Estado desconocido: ZZZ')
  })

  test('negative codes are retryable, everything else is not', () => {
    expect(isRetryableStatus('-3')).toBe(true)
    expect(isRetryableStatus('EPR')).toBe(false)
    expect(isRetryableStatus('REC')).toBe(false)
  })
})

describe('document status (QueryEstDte)', () => {
  test.each([
    ['DOK', 'received'],
    ['DNK', 'receivedWithMismatch'],
    ['FAU', 'notReceived'],
    ['FNA', 'notAuthorized'],
    ['EMP', 'notAuthorized'],
    ['TMC', 'modified'],
    ['TMD', 'modified'],
    ['MMC', 'modified'],
    ['MMD', 'modified'],
    ['ANC', 'cancelled'],
    ['AND', 'cancelled'],
    ['-5', 'queryError'],
    ['XYZ', 'unknown'],
  ])('%s → %s', (code, expected) => {
    expect(classifyDocumentStatus(code)).toBe(expected)
  })

  test('messages', () => {
    expect(documentStatusMessage('DOK')).toBe('Documento recibido por el SII, datos coinciden')
    expect(documentStatusMessage('FAU')).toBe('DTE no recibido por el SII')
    expect(documentStatusMessage('XYZ')).toBe('Estado desconocido: XYZ')
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest tests/upload-status.test.ts`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementación**

`src/catalogs/upload-status.ts`:

```ts
/**
 * EN: Outcome class of an envelope status code (`QueryEstUp` ESTADO or the receipts REST `estado`).
 * ES: Clase de resultado de un código de estado de envío: aceptado, aceptado con reparos, intermedio, rechazado, error de consulta o desconocido.
 */
export type UploadStatusClass = 'accepted' | 'acceptedWithObjections' | 'pending' | 'rejected' | 'queryError' | 'unknown'

/**
 * EN: Channel the status came from: `soap` (QueryEstUp / DTEUpload) or `rest` (receipts API). `RLV` means success on REST and rejection on SOAP.
 * ES: Canal del estado: `soap` (QueryEstUp / DTEUpload) o `rest` (API de boletas). `RLV` es éxito en REST y rechazo en SOAP.
 */
export type UploadChannel = 'soap' | 'rest'

type StatusEntry = { readonly cls: UploadStatusClass; readonly message: string }

const QUERY_ERROR_MESSAGE = 'Error de consulta del SII, reintentar más tarde'

const UPLOAD_STATUS: Readonly<Record<string, StatusEntry>> = {
  EPR: { cls: 'accepted', message: 'Envío procesado' },
  LOK: { cls: 'accepted', message: 'Envío de libro aceptado' },
  RPR: { cls: 'acceptedWithObjections', message: 'Aceptado con reparos' },
  REC: { cls: 'pending', message: 'Envío recibido, esperando validación' },
  SOK: { cls: 'pending', message: 'Schema validado, validando firma' },
  FOK: { cls: 'pending', message: 'Firma validada, procesando envío' },
  PRD: { cls: 'pending', message: 'Envío en proceso, validando carátula' },
  CRT: { cls: 'pending', message: 'Carátula validada, finalizando proceso' },
  DNK: { cls: 'pending', message: 'En proceso de revisión' },
  PDR: { cls: 'pending', message: 'Envío en proceso, validando' },
  LSO: { cls: 'pending', message: 'Schema de libro correcto, procesando contenido' },
  '0': { cls: 'pending', message: 'Enviado al SII, pendiente de validación' },
  RPT: { cls: 'rejected', message: 'Rechazado por schema' },
  RFR: { cls: 'rejected', message: 'Rechazado por error en firma' },
  VOF: { cls: 'rejected', message: 'Error interno del SII' },
  RCT: { cls: 'rejected', message: 'Rechazado por error en carátula' },
  RCH: { cls: 'rejected', message: 'Rechazado' },
  RSC: { cls: 'rejected', message: 'Rechazado por error en schema' },
  RLV: { cls: 'rejected', message: 'Rechazado, error en documento' },
  LNC: { cls: 'rejected', message: 'Tipo de envío de libro no corresponde' },
  LRH: { cls: 'rejected', message: 'Libro rechazado con historial' },
  '-1': { cls: 'queryError', message: 'Campo estado no retornado por el SII, reintentar más tarde' },
  '-2': { cls: 'queryError', message: QUERY_ERROR_MESSAGE },
  '-3': { cls: 'queryError', message: 'RUT de usuario no existe en el SII, verificar autenticación' },
  '-4': { cls: 'queryError', message: QUERY_ERROR_MESSAGE },
  '-5': { cls: 'queryError', message: QUERY_ERROR_MESSAGE },
  '-6': { cls: 'queryError', message: 'Usuario no autorizado para consultar' },
  '-7': { cls: 'queryError', message: QUERY_ERROR_MESSAGE },
  '-8': { cls: 'queryError', message: QUERY_ERROR_MESSAGE },
  '-9': { cls: 'queryError', message: QUERY_ERROR_MESSAGE },
  '-10': { cls: 'queryError', message: 'Error de validación del RUT de usuario' },
  '-11': { cls: 'queryError', message: QUERY_ERROR_MESSAGE },
  '-12': { cls: 'queryError', message: QUERY_ERROR_MESSAGE },
  '-13': { cls: 'queryError', message: 'RUT de usuario nulo, verificar autenticación' },
  '-14': { cls: 'queryError', message: 'Error en el XML de retorno del SII, reintentar más tarde' },
}

const REST_OVERRIDES: Readonly<Record<string, StatusEntry>> = {
  RLV: { cls: 'accepted', message: 'Aceptado, documentos válidos' },
}

const lookup = (code: string, channel: UploadChannel): StatusEntry | undefined =>
  channel === 'rest' ? (REST_OVERRIDES[code] ?? UPLOAD_STATUS[code]) : UPLOAD_STATUS[code]

/**
 * EN: Classifies an envelope status code. Negative codes are errors of the query service, not of the envelope.
 * ES: Clasifica un código de estado de envío. Los códigos negativos son errores del servicio de consulta, no del envío.
 * @param code EN: `ESTADO` as returned by the SII. ES: `ESTADO` tal como lo devuelve el SII.
 * @param channel EN: `soap` (default) or `rest`. ES: `soap` (por defecto) o `rest`.
 */
export const classifyUploadStatus = (code: string, channel: UploadChannel = 'soap'): UploadStatusClass =>
  lookup(code, channel)?.cls ?? 'unknown'

/**
 * EN: Spanish gloss of an envelope status code.
 * ES: Glosa en español de un código de estado de envío.
 */
export const uploadStatusMessage = (code: string, channel: UploadChannel = 'soap'): string =>
  lookup(code, channel)?.message ?? `Estado desconocido: ${code}`

/**
 * EN: True when the status is a transient query error (`-1` … `-14`) worth retrying.
 * ES: True cuando el estado es un error transitorio de consulta (`-1` … `-14`) que conviene reintentar.
 */
export const isRetryableStatus = (code: string): boolean => classifyUploadStatus(code) === 'queryError'

/**
 * EN: Outcome class of a single-document status (`QueryEstDte` ESTADO).
 * ES: Clase de resultado del estado de un documento (`QueryEstDte`): recibido, recibido con datos distintos, no recibido, no autorizado, modificado por nota, anulado por nota, error de consulta o desconocido.
 */
export type DocumentStatusClass =
  | 'received'
  | 'receivedWithMismatch'
  | 'notReceived'
  | 'notAuthorized'
  | 'modified'
  | 'cancelled'
  | 'queryError'
  | 'unknown'

type DocumentStatusEntry = { readonly cls: DocumentStatusClass; readonly message: string }

const DOCUMENT_STATUS: Readonly<Record<string, DocumentStatusEntry>> = {
  DOK: { cls: 'received', message: 'Documento recibido por el SII, datos coinciden' },
  DNK: { cls: 'receivedWithMismatch', message: 'Documento recibido por el SII, datos no coinciden' },
  FAU: { cls: 'notReceived', message: 'DTE no recibido por el SII' },
  FNA: { cls: 'notAuthorized', message: 'DTE no autorizado' },
  EMP: { cls: 'notAuthorized', message: 'Empresa no autorizada a emitir DTE' },
  TMD: { cls: 'modified', message: 'Existe nota de débito que modifica textos' },
  TMC: { cls: 'modified', message: 'Existe nota de crédito que modifica textos' },
  MMD: { cls: 'modified', message: 'Existe nota de débito que modifica montos' },
  MMC: { cls: 'modified', message: 'Existe nota de crédito que modifica montos' },
  AND: { cls: 'cancelled', message: 'Existe nota de débito que anula el documento' },
  ANC: { cls: 'cancelled', message: 'Existe nota de crédito que anula el documento' },
}

/**
 * EN: Classifies a `QueryEstDte` status code.
 * ES: Clasifica un código de estado de `QueryEstDte` (DOK/DNK/FAU/FNA/EMP, notas que modifican o anulan, errores negativos).
 */
export const classifyDocumentStatus = (code: string): DocumentStatusClass => {
  const entry = DOCUMENT_STATUS[code]
  if (entry) return entry.cls
  return /^-\d+$/.test(code) ? 'queryError' : 'unknown'
}

/**
 * EN: Spanish gloss of a `QueryEstDte` status code.
 * ES: Glosa en español de un código de estado de `QueryEstDte`.
 */
export const documentStatusMessage = (code: string): string => {
  const entry = DOCUMENT_STATUS[code]
  if (entry) return entry.message
  return /^-\d+$/.test(code) ? QUERY_ERROR_MESSAGE : `Estado desconocido: ${code}`
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest tests/upload-status.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/catalogs/upload-status.ts tests/upload-status.test.ts
git commit -m "feat: classify SII envelope and document status codes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Adaptador de RUT sobre rut.ts (`src/model/rut.ts`)

**Files:**
- Create: `src/model/rut.ts`
- Test: `tests/rut.test.ts`

Regla: **ninguna lógica de RUT propia**; todo pasa por `rut.ts`.

- [ ] **Step 1: Test que falla**

`tests/rut.test.ts`:

```ts
import { toSiiRut, isSiiRut, splitSiiRut } from '../src/model/rut'
import { DteError } from '../src/errors'

describe('toSiiRut', () => {
  test.each([
    ['12.345.678-5', '12345678-5'],
    ['12345678-5', '12345678-5'],
    ['123456785', '12345678-5'],
    ['14.625.621-k', '14625621-K'],
    ['  76543210-3 ', '76543210-3'],
    ['60803000-K', '60803000-K'],
    ['66666666-6', '66666666-6'],
  ])('normalizes %s to the SII shape %s', (input, expected) => {
    expect(toSiiRut(input)).toBe(expected)
  })

  test.each(['12345678-9', '76543210-K', 'abc', '', '1-9'])('rejects %p with INVALID_RUT', (input) => {
    expect(() => toSiiRut(input)).toThrow(DteError)
    try {
      toSiiRut(input, 'issuer.rut')
    } catch (err) {
      expect((err as DteError).code).toBe('INVALID_RUT')
      expect((err as DteError).details).toEqual({ field: 'issuer.rut' })
      expect((err as DteError).message).not.toContain(input || 'never')
    }
  })

  test('rejects non-strings', () => {
    expect(() => toSiiRut(12345678 as unknown as string)).toThrow(DteError)
    expect(() => toSiiRut(null as unknown as string)).toThrow(DteError)
  })
})

describe('isSiiRut', () => {
  test('accepts only the canonical SII shape of a valid RUT', () => {
    expect(isSiiRut('12345678-5')).toBe(true)
    expect(isSiiRut('12.345.678-5')).toBe(false)
    expect(isSiiRut('12345678-9')).toBe(false)
    expect(isSiiRut(5)).toBe(false)
  })
})

describe('splitSiiRut', () => {
  test('splits body and verifier', () => {
    expect(splitSiiRut(toSiiRut('14625621-K'))).toEqual({ body: '14625621', verifier: 'K' })
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest tests/rut.test.ts`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementación**

`src/model/rut.ts`:

```ts
import { decompose, format } from 'rut.ts'
import { DteError } from '../errors'

declare const SII_RUT_BRAND: unique symbol

/**
 * EN: A RUT already validated with rut.ts and formatted the way the SII schemas expect: no dots, hyphen, uppercase K
 * (`12345678-5`). The brand is phantom: the only way to mint one is `toSiiRut`.
 * ES: Un RUT ya validado con rut.ts y en la forma que exigen los esquemas del SII: sin puntos, con guión, K mayúscula
 * (`12345678-5`). La marca es fantasma: la única forma de obtener uno es `toSiiRut`.
 */
export type SiiRut = string & { readonly [SII_RUT_BRAND]: true }

// rut.ts formats '' as '' instead of rejecting it, so emptiness is checked here before delegating.
const normalize = (value: unknown): SiiRut | null => {
  if (typeof value !== 'string' || value.trim() === '') return null
  const formatted = format(value.trim(), { dots: false, throwOnError: false })
  return formatted === null || formatted === '' ? null : (formatted as SiiRut)
}

/**
 * EN: Validates a RUT with rut.ts (Modulo 11) and returns it in SII shape. Accepts dotted, hyphenated or compact input.
 * ES: Valida un RUT con rut.ts (módulo 11) y lo devuelve en forma SII. Acepta entrada con puntos, con guión o compacta.
 * @param value EN: the RUT in any shape. ES: el RUT en cualquier forma.
 * @param field EN: field name for the error details (default `rut`). ES: nombre del campo para los detalles del error (por defecto `rut`).
 * @throws {DteError} EN: `INVALID_RUT`; the value is never echoed in the message. ES: `INVALID_RUT`; el valor nunca va en el mensaje.
 */
export const toSiiRut = (value: string, field = 'rut'): SiiRut => {
  const formatted = normalize(value)
  if (formatted === null) throw new DteError('INVALID_RUT', { field })
  return formatted
}

/**
 * EN: Type guard: true when `value` is already a valid RUT in SII shape.
 * ES: Guarda de tipo: true cuando `value` ya es un RUT válido en forma SII.
 */
export const isSiiRut = (value: unknown): value is SiiRut => typeof value === 'string' && normalize(value) === value

/**
 * EN: Splits a SII RUT into body and verifier (what the SII multipart fields `rutSender`/`dvSender` need).
 * ES: Separa un RUT SII en cuerpo y dígito verificador (lo que piden los campos `rutSender`/`dvSender` del SII).
 */
export const splitSiiRut = (rut: SiiRut): { readonly body: string; readonly verifier: string } => {
  const { body, verifier } = decompose(rut)
  return { body, verifier }
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest tests/rut.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/model/rut.ts tests/rut.test.ts
git commit -m "feat: SiiRut brand backed entirely by rut.ts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Sanitización de texto y codificación Latin-1 (`src/text/sanitize.ts`, `src/text/latin1.ts`)

**Files:**
- Create: `src/text/sanitize.ts`, `src/text/latin1.ts`
- Test: `tests/sanitize.test.ts`, `tests/latin1.test.ts`

- [ ] **Step 1: Tests que fallan**

`tests/sanitize.test.ts`:

```ts
import { sanitizeText, foldToAscii, truncateText, assertMaxLength } from '../src/text/sanitize'
import { DteError } from '../src/errors'

describe('sanitizeText', () => {
  test.each([
    ["CAPACITACION USO PLC'S CNC", 'CAPACITACION USO PLCS CNC'],
    ['Cable de 3" marca X', 'Cable de 3 marca X'],
    ['acento ´ y grave `', 'acento  y grave'],
    ['guion — largo – corto', 'guion - largo - corto'],
    ['puntos…', 'puntos...'],
    ['emoji 🚀 fuera', 'emoji  fuera'],
    ['comillas “tipográficas” y ‘simples’', 'comillas tipográficas y simples'],
    ['  bordes  ', 'bordes'],
    ['ñandú Ü ç', 'ñandú Ü ç'],
  ])('%p → %p', (input, expected) => {
    expect(sanitizeText(input)).toBe(expected)
  })

  test('null and undefined become empty', () => {
    expect(sanitizeText(undefined)).toBe('')
    expect(sanitizeText(null)).toBe('')
  })

  test('is idempotent', () => {
    const once = sanitizeText('Cajón “X” — ok… 🚀')
    expect(sanitizeText(once)).toBe(once)
  })
})

describe('foldToAscii (TED only)', () => {
  test.each([
    ['Cajón AFECTO', 'Cajon AFECTO'],
    ['Pañuelo', 'Panuelo'],
    ['CIGUEÑALES', 'CIGUENALES'],
    ['Straße', 'Strasse'],
    ['ﬁn Œuvre Æsir Øre Þor ð', 'fin OEuvre AEsir Ore THor d'],
    ['emoji 🚀', 'emoji'],
    ['Ü ü ç', 'U u c'],
  ])('%p → %p', (input, expected) => {
    expect(foldToAscii(input)).toBe(expected)
  })

  test('output is printable ASCII only', () => {
    expect(foldToAscii('áéíóú ñ Ñ ¿? ¡! € ©')).toMatch(/^[\x20-\x7E]*$/)
  })
})

describe('truncateText', () => {
  test('sanitizes then cuts', () => {
    expect(truncateText('abcdef', 3)).toBe('abc')
    expect(truncateText('ab', 3)).toBe('ab')
    expect(truncateText("a'bcdef", 3)).toBe('abc')
  })

  test('preserveWords keeps whole words when the cut is late enough', () => {
    expect(truncateText('hola mundo cruel', 12, true)).toBe('hola mundo')
    expect(truncateText('holamundocruel xx', 12, true)).toBe('holamundocru')
  })
})

describe('assertMaxLength', () => {
  test('passes at the limit and throws past it', () => {
    expect(() => assertMaxLength('x'.repeat(80), 80, 'NmbItem')).not.toThrow()
    expect(() => assertMaxLength('x'.repeat(81), 80, 'NmbItem')).toThrow(DteError)
    try {
      assertMaxLength('MARMITA'.repeat(12), 80, 'NmbItem')
    } catch (err) {
      const e = err as DteError
      expect(e.code).toBe('FIELD_TOO_LONG')
      expect(e.details).toEqual({ field: 'NmbItem', maxLength: 80, length: 84, value: 'MARMITA'.repeat(12) })
      expect(e.message).not.toContain('MARMITA')
    }
  })
})
```

`tests/latin1.test.ts`:

```ts
import { encodeLatin1, decodeLatin1 } from '../src/text/latin1'
import { DteError } from '../src/errors'

describe('latin1', () => {
  test('round-trips every Latin-1 code point', () => {
    const all = Array.from({ length: 256 }, (_, i) => String.fromCharCode(i)).join('')
    const bytes = encodeLatin1(all)
    expect(bytes.length).toBe(256)
    expect(bytes[0xf1]).toBe(0xf1)
    expect(decodeLatin1(bytes)).toBe(all)
  })

  test('ñ is one byte (0xF1), not two', () => {
    expect(Array.from(encodeLatin1('ñ'))).toEqual([0xf1])
  })

  test('rejects characters outside Latin-1 instead of truncating them', () => {
    expect(() => encodeLatin1('a—b')).toThrow(DteError)
    try {
      encodeLatin1('ok🚀')
    } catch (err) {
      expect((err as DteError).code).toBe('ENCODING_UNSUPPORTED_CHAR')
      expect((err as DteError).details).toEqual({ index: 2, codePoint: 0xd83d })
    }
  })

  test('decodes large arrays', () => {
    const bytes = new Uint8Array(100000).fill(0x41)
    expect(decodeLatin1(bytes).length).toBe(100000)
  })
})
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx jest tests/sanitize.test.ts tests/latin1.test.ts`
Expected: FAIL, módulos no encontrados.

- [ ] **Step 3: Implementación**

`src/text/sanitize.ts`:

```ts
import { DteError } from '../errors'

/**
 * EN: Normalizes free text for a DTE field: drops apostrophes and double quotes (they break the SII signature
 * checks), maps typographic dashes and ellipsis to ASCII, removes anything outside ISO-8859-1 (emoji, curly quotes)
 * and trims. `null`/`undefined` become `''`.
 * ES: Normaliza texto libre para un campo del DTE: quita apóstrofes y comillas dobles (rompen la validación de firma
 * del SII), pasa guiones y puntos suspensivos tipográficos a ASCII, elimina todo lo que no es ISO-8859-1 (emoji,
 * comillas curvas) y recorta espacios. `null`/`undefined` quedan en `''`.
 */
export const sanitizeText = (text: string | null | undefined): string => {
  if (text === undefined || text === null) return ''
  return String(text)
    .replace(/['´`]/g, '')
    .replace(/"/g, '')
    .replace(/[—–]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\u0000-ÿ]/g, '')
    .trim()
}

const LIGATURES: Readonly<Record<string, string>> = {
  'ﬀ': 'ff',
  'ﬁ': 'fi',
  'ﬂ': 'fl',
  'ﬃ': 'ffi',
  'ﬄ': 'ffl',
  'Œ': 'OE',
  'œ': 'oe',
  'Æ': 'AE',
  'æ': 'ae',
  'Ø': 'O',
  'ø': 'o',
  'Ð': 'D',
  'ð': 'd',
  'Þ': 'TH',
  'þ': 'th',
  'ß': 'ss',
}

/**
 * EN: Folds text to printable ASCII for the TED (`RSR`, `IT1`): strips diacritics (á→a, ñ→n), expands ligatures and
 * special letters (ß→ss, Æ→AE, Þ→TH), then drops every remaining non-ASCII character. The SII PDF417 reader loses
 * bytes ≥ 128 and verifies the TED signature over what it read, so any accent inside the stamp means
 * "TED - Firma invalida". Apply BEFORE truncating to 40: folding can lengthen the text.
 * ES: Pliega texto a ASCII imprimible para el TED (`RSR`, `IT1`): quita diacríticos (á→a, ñ→n), expande ligaduras y
 * letras especiales (ß→ss, Æ→AE, Þ→TH) y elimina lo que siga fuera de ASCII. El lector PDF417 del SII pierde los
 * bytes ≥ 128 y verifica la firma del TED sobre lo que leyó, así que una tilde dentro del timbre termina en
 * "TED - Firma invalida". Aplicar ANTES de truncar a 40: el plegado puede alargar el texto.
 */
export const foldToAscii = (text: string | null | undefined): string =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ﬀ-ﬄŒœÆæØøÐðÞþß]/g, (m) => LIGATURES[m])
    .replace(/[^ -~]/g, '')
    .trim()

/**
 * EN: Sanitizes and cuts text to `maxLength`; with `preserveWords`, backs up to the last space when it sits past 70 % of the limit.
 * ES: Sanitiza y corta el texto a `maxLength`; con `preserveWords`, retrocede al último espacio si queda después del 70 % del límite.
 */
export const truncateText = (text: string | null | undefined, maxLength: number, preserveWords = false): string => {
  const sanitized = sanitizeText(text)
  if (sanitized.length <= maxLength) return sanitized
  const cut = sanitized.slice(0, maxLength)
  if (!preserveWords) return cut
  const lastSpace = cut.lastIndexOf(' ')
  return lastSpace > maxLength * 0.7 ? cut.slice(0, lastSpace).trim() : cut
}

/**
 * EN: Throws `FIELD_TOO_LONG` when the (already sanitized) text exceeds the `xs:maxLength` of the SII schema. The SII
 * rejects the WHOLE envelope when one document fails the schema, so this fails early instead of truncating silently.
 * ES: Lanza `FIELD_TOO_LONG` cuando el texto (ya sanitizado) supera el `xs:maxLength` del esquema del SII. El SII
 * rechaza el sobre COMPLETO cuando un documento falla el schema, por eso se falla temprano en vez de truncar en silencio.
 * @param value EN: sanitized text. ES: texto ya sanitizado.
 * @param maxLength EN: schema limit. ES: límite del esquema.
 * @param field EN: schema element name, e.g. `NmbItem`. ES: nombre del elemento del esquema, p. ej. `NmbItem`.
 */
export const assertMaxLength = (value: string, maxLength: number, field: string): void => {
  if (value.length > maxLength) throw new DteError('FIELD_TOO_LONG', { field, maxLength, length: value.length, value })
}
```

`src/text/latin1.ts`:

```ts
import { DteError } from '../errors'

/**
 * EN: Encodes text as ISO-8859-1 bytes (what the SII upload endpoints expect). Throws instead of truncating a code
 * point above U+00FF to its low byte, which is how corrupted control characters used to reach the SII.
 * ES: Codifica texto como bytes ISO-8859-1 (lo que esperan los endpoints de subida del SII). Lanza en vez de truncar
 * un code point mayor a U+00FF a su byte bajo, que es como llegaban caracteres de control corruptos al SII.
 * @throws {DteError} EN: `ENCODING_UNSUPPORTED_CHAR` with `{ index, codePoint }`. ES: `ENCODING_UNSUPPORTED_CHAR` con `{ index, codePoint }`.
 */
export const encodeLatin1 = (text: string): Uint8Array => {
  const bytes = new Uint8Array(text.length)
  for (let index = 0; index < text.length; index += 1) {
    const codePoint = text.charCodeAt(index)
    if (codePoint > 0xff) throw new DteError('ENCODING_UNSUPPORTED_CHAR', { index, codePoint })
    bytes[index] = codePoint
  }
  return bytes
}

const CHUNK = 8192

/**
 * EN: Decodes ISO-8859-1 bytes to a string (one char per byte).
 * ES: Decodifica bytes ISO-8859-1 a string (un carácter por byte).
 */
export const decodeLatin1 = (bytes: Uint8Array): string => {
  const parts: string[] = []
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + CHUNK)))
  }
  return parts.join('')
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx jest tests/sanitize.test.ts tests/latin1.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/text tests/sanitize.test.ts tests/latin1.test.ts
git commit -m "feat: SII text sanitization, TED ASCII folding and Latin-1 codec

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Fechas en hora de Chile (`src/time/chile.ts`)

**Files:**
- Create: `src/time/chile.ts`
- Test: `tests/chile.test.ts`

- [ ] **Step 1: Test que falla**

`tests/chile.test.ts`:

```ts
import { chileDate, chileTimestamp, chileDateTimeParts, toIsoDate, isIsoDate } from '../src/time/chile'
import { DteError } from '../src/errors'

describe('Chile time', () => {
  test('winter (UTC-4): a UTC instant is 4 hours earlier', () => {
    expect(chileTimestamp(new Date('2026-06-15T12:00:00.000Z'))).toBe('2026-06-15T08:00:00')
  })

  test('summer (UTC-3): a UTC instant is 3 hours earlier', () => {
    expect(chileTimestamp(new Date('2026-01-15T12:00:00.000Z'))).toBe('2026-01-15T09:00:00')
  })

  test('crosses midnight: UTC is already the next day', () => {
    expect(chileTimestamp(new Date('2026-06-16T02:00:00.000Z'))).toBe('2026-06-15T22:00:00')
    expect(chileDate(new Date('2026-06-16T02:00:00.000Z'))).toBe('2026-06-15')
  })

  test('midnight renders as 00, never 24', () => {
    expect(chileTimestamp(new Date('2026-06-15T04:00:00.000Z'))).toBe('2026-06-15T00:00:00')
  })

  test('parts and defaults to now', () => {
    expect(chileDateTimeParts(new Date('2026-11-15T18:30:05.000Z'))).toEqual({
      year: '2026',
      month: '11',
      day: '15',
      hour: '15',
      minute: '30',
      second: '05',
    })
    expect(chileDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(chileTimestamp()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
  })
})

describe('toIsoDate', () => {
  test.each([
    ['2014-08-22', '2014-08-22'],
    ['22-08-2014', '2014-08-22'],
    ['22/08/2014', '2014-08-22'],
    [' 2014-08-22 ', '2014-08-22'],
  ])('%p → %p', (input, expected) => {
    expect(toIsoDate(input)).toBe(expected)
  })

  test.each(['2014-13-01', '2014-02-30', '20140822', 'ayer', '', '2014-8-2'])('rejects %p', (input) => {
    expect(() => toIsoDate(input)).toThrow(DteError)
    try {
      toIsoDate(input, 'resolutionDate')
    } catch (err) {
      expect((err as DteError).code).toBe('INVALID_DATE')
      expect((err as DteError).details).toEqual({ field: 'resolutionDate' })
    }
  })

  test('isIsoDate', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('2024-02-29')).toBe(true)
    expect(isIsoDate('2026-2-2')).toBe(false)
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest tests/chile.test.ts`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementación**

`src/time/chile.ts`:

```ts
import { DteError } from '../errors'

const CHILE_TIME_ZONE = 'America/Santiago'

const FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: CHILE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/**
 * EN: Zero-padded date and time components of an instant in Chile (`America/Santiago`, DST-aware).
 * ES: Componentes de fecha y hora de un instante en Chile (`America/Santiago`, con horario de verano), con ceros a la izquierda.
 */
export type ChileDateTimeParts = {
  readonly year: string
  readonly month: string
  readonly day: string
  readonly hour: string
  readonly minute: string
  readonly second: string
}

/**
 * EN: Breaks an instant (default: now) into Chile-local components using `Intl`, never the process time zone.
 * ES: Descompone un instante (por defecto: ahora) en componentes de hora de Chile con `Intl`, nunca con la zona del proceso.
 */
export const chileDateTimeParts = (now: Date = new Date()): ChileDateTimeParts => {
  const parts = FORMATTER.formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? ''
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

/**
 * EN: Today's date in Chile as `YYYY-MM-DD` (the SII `FchEmis`/`FchResol` format).
 * ES: La fecha de hoy en Chile como `AAAA-MM-DD` (formato de `FchEmis`/`FchResol` del SII).
 */
export const chileDate = (now: Date = new Date()): string => {
  const { year, month, day } = chileDateTimeParts(now)
  return `${year}-${month}-${day}`
}

/**
 * EN: Chile-local timestamp `YYYY-MM-DDTHH:MM:SS` without zone or milliseconds (`TmstFirma`, `TmstFirmaEnv`, `TSTED`).
 * Never built with `toISOString()`, which is always UTC and put envelopes ~3 h in the future ("Error en Carátula").
 * ES: Marca de tiempo en hora de Chile `AAAA-MM-DDTHH:MM:SS` sin zona ni milisegundos (`TmstFirma`, `TmstFirmaEnv`, `TSTED`).
 * Nunca se arma con `toISOString()`, que siempre es UTC y dejaba los sobres ~3 h en el futuro ("Error en Carátula").
 */
export const chileTimestamp = (now: Date = new Date()): string => {
  const { year, month, day, hour, minute, second } = chileDateTimeParts(now)
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * EN: True when `value` is a real calendar date in `YYYY-MM-DD`.
 * ES: True cuando `value` es una fecha de calendario real en `AAAA-MM-DD`.
 */
export const isIsoDate = (value: string): boolean => {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day)
}

/**
 * EN: Normalizes `DD-MM-YYYY`, `DD/MM/YYYY` or `YYYY-MM-DD` (as the SII portal and resolutions show dates) to ISO.
 * ES: Normaliza `DD-MM-AAAA`, `DD/MM/AAAA` o `AAAA-MM-DD` (como muestran las fechas el portal y las resoluciones del SII) a ISO.
 * @throws {DteError} EN: `INVALID_DATE` with `{ field }`. ES: `INVALID_DATE` con `{ field }`.
 */
export const toIsoDate = (value: string, field = 'date'): string => {
  const raw = String(value ?? '').trim()
  const dmy = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(raw)
  const iso = dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : raw
  if (!isIsoDate(iso)) throw new DteError('INVALID_DATE', { field })
  return iso
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest tests/chile.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/time/chile.ts tests/chile.test.ts
git commit -m "feat: Chile-local dates and timestamps with injectable clock

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Tipos del modelo de dominio y del modelo SII (`src/model/document.ts`, `src/model/sii.ts`, `src/model/cover.ts`)

**Files:**
- Create: `src/model/document.ts`, `src/model/sii.ts`, `src/model/cover.ts`
- Test: `tests/model-types.test.ts` (nivel de tipos con `expect-type`)

Estos archivos son solo tipos: el test se verifica al compilar. Cada campo lleva JSDoc `EN:`/`ES:` con la etiqueta SII; el glosario de la spec (sección 5) es la fuente.

- [ ] **Step 1: Test que falla**

`tests/model-types.test.ts`:

```ts
import { expectTypeOf } from 'expect-type'
import type { Document, DocumentInput, Totals, LineItem, Issuer, Receiver, Reference, HeaderOptions } from '../src/model/document'
import type { SiiDocumento, SiiTotales, SiiDetalle } from '../src/model/sii'
import type { EnvelopeCover, EnvelopeCoverInput } from '../src/model/cover'
import type { SiiRut } from '../src/model/rut'

const _typecheck = () => {
  expectTypeOf<Totals['totalAmount']>().toEqualTypeOf<number>()
  expectTypeOf<Totals['netAmount']>().toEqualTypeOf<number | undefined>()
  expectTypeOf<Issuer['rut']>().toEqualTypeOf<SiiRut>()
  expectTypeOf<Receiver['rut']>().toEqualTypeOf<SiiRut>()
  expectTypeOf<LineItem['amount']>().toEqualTypeOf<number>()
  expectTypeOf<Reference['documentType']>().toEqualTypeOf<number | 'SET'>()
  expectTypeOf<HeaderOptions['paymentTerms']>().toEqualTypeOf<1 | 2 | 3 | undefined>()
  expectTypeOf<Document['items']>().toEqualTypeOf<readonly LineItem[]>()
  expectTypeOf<DocumentInput['issuer']['rut']>().toEqualTypeOf<string>()
  expectTypeOf<SiiTotales['MntTotal']>().toEqualTypeOf<number>()
  expectTypeOf<SiiDetalle['NmbItem']>().toEqualTypeOf<string>()
  expectTypeOf<SiiDocumento['Encabezado']['Totales']>().toEqualTypeOf<SiiTotales>()
  expectTypeOf<EnvelopeCover['receiverRut']>().toEqualTypeOf<SiiRut>()
  expectTypeOf<EnvelopeCoverInput['receiverRut']>().toEqualTypeOf<string | undefined>()
}

test('model types compile', () => {
  expect(typeof _typecheck).toBe('function')
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest tests/model-types.test.ts`
Expected: FAIL (ts-jest: módulos no encontrados).

- [ ] **Step 3: Implementación**

`src/model/document.ts`:

```ts
import type { DocumentType } from '../catalogs/document-types'
import type { DispatchType, ExemptIndicator, PaymentTerms, ReferenceCode, ServiceIndicator, TransferType } from '../catalogs/codes'
import type { SiiRut } from './rut'

/**
 * EN: Party that issues the document (`Emisor`).
 * ES: `Emisor` — Quien emite el documento.
 */
export type Issuer = {
  /** EN: Issuer RUT, SII shape. ES: `RUTEmisor` — RUT del emisor, sin puntos y con guión. */
  readonly rut: SiiRut
  /** EN: Legal/business name (max 100). ES: `RznSoc` (`RznSocEmisor` en boletas) — Razón social, máximo 100 caracteres. */
  readonly businessName: string
  /** EN: Line of business (max 80). ES: `GiroEmis` (`GiroEmisor` en boletas) — Giro comercial, máximo 80. */
  readonly businessActivity: string
  /** EN: SII economic activity code. ES: `Acteco` — Código de actividad económica del SII. */
  readonly activityCode?: number
  /** EN: Phone. ES: `Telefono` — Teléfono. */
  readonly phone?: string
  /** EN: Email. ES: `CorreoEmisor` — Correo electrónico del emisor. */
  readonly email?: string
  /** EN: Branch name (max 20). ES: `Sucursal` — Nombre de la sucursal, máximo 20. */
  readonly branch?: string
  /** EN: SII branch code (1-999999999). ES: `CdgSIISucur` — Código de sucursal inscrito en el SII, entero de 1 a 999999999. */
  readonly siiBranchCode?: number
  /** EN: Street address (max 70). ES: `DirOrigen` — Dirección de origen, máximo 70. */
  readonly address: string
  /** EN: Commune (max 20). ES: `CmnaOrigen` — Comuna de origen, máximo 20. */
  readonly commune: string
  /** EN: City (max 20); defaults to the commune. ES: `CiudadOrigen` — Ciudad de origen, máximo 20; por defecto la comuna. */
  readonly city?: string
  /** EN: Salesperson code. ES: `CdgVendedor` — Código del vendedor. */
  readonly salespersonCode?: string
}

/**
 * EN: Issuer as the caller provides it: the RUT may come in any shape.
 * ES: Emisor tal como lo entrega el llamador: el RUT puede venir en cualquier forma.
 */
export type IssuerInput = Omit<Issuer, 'rut'> & { readonly rut: string }

/**
 * EN: Party that receives the document (`Receptor`).
 * ES: `Receptor` — Quien recibe el documento.
 */
export type Receiver = {
  /** EN: Receiver RUT (66666666-6 for an anonymous final consumer on receipts). ES: `RUTRecep` — RUT del receptor (66666666-6 para consumidor final en boletas). */
  readonly rut: SiiRut
  /** EN: Internal customer code (max 20). ES: `CdgIntRecep` — Código interno del receptor, máximo 20. */
  readonly internalCode?: string
  /** EN: Legal/business name (max 100). ES: `RznSocRecep` — Razón social del receptor, máximo 100. */
  readonly businessName: string
  /** EN: Line of business (max 40). ES: `GiroRecep` — Giro del receptor, máximo 40. */
  readonly businessActivity?: string
  /** EN: Contact person (max 80). ES: `Contacto` — Persona de contacto, máximo 80. */
  readonly contact?: string
  /** EN: Email (max 80). ES: `CorreoRecep` — Correo del receptor, máximo 80. */
  readonly email?: string
  /** EN: Street address (max 70); required except on receipts. ES: `DirRecep` — Dirección del receptor, máximo 70; obligatoria salvo en boletas. */
  readonly address?: string
  /** EN: Commune (max 20); required except on receipts. ES: `CmnaRecep` — Comuna del receptor, máximo 20; obligatoria salvo en boletas. */
  readonly commune?: string
  /** EN: City (max 20). ES: `CiudadRecep` — Ciudad del receptor, máximo 20. */
  readonly city?: string
  /** EN: Postal address (max 70). ES: `DirPostal` — Dirección postal, máximo 70. */
  readonly postalAddress?: string
  /** EN: Postal commune (max 20). ES: `CmnaPostal` — Comuna postal, máximo 20. */
  readonly postalCommune?: string
  /** EN: Postal city (max 20). ES: `CiudadPostal` — Ciudad postal, máximo 20. */
  readonly postalCity?: string
}

/**
 * EN: Receiver as the caller provides it.
 * ES: Receptor tal como lo entrega el llamador.
 */
export type ReceiverInput = Omit<Receiver, 'rut'> & { readonly rut: string }

/**
 * EN: Item code (`CdgItem`): a code system and the code itself.
 * ES: `CdgItem` — Código del ítem: sistema (`TpoCodigo`, p. ej. EAN, INT1) y valor (`VlrCodigo`).
 */
export type ItemCode = {
  /** EN: Code system (max 10). ES: `TpoCodigo` — Tipo de codificación, máximo 10. */
  readonly type: string
  /** EN: Code value (max 35). ES: `VlrCodigo` — Valor del código, máximo 35. */
  readonly value: string
}

/**
 * EN: A detail line as the caller provides it; amounts are computed unless `amount` is given.
 * ES: Línea de detalle tal como la entrega el llamador; los montos se calculan salvo que venga `amount`.
 */
export type LineItemInput = {
  /** EN: Item name (max 80). ES: `NmbItem` — Nombre del ítem, máximo 80. */
  readonly name: string
  /** EN: Description (max 1000). ES: `DscItem` — Descripción, máximo 1000. */
  readonly description?: string
  /** EN: Quantity (default 1). ES: `QtyItem` — Cantidad, por defecto 1. */
  readonly quantity?: number
  /** EN: Unit of measure (max 4). ES: `UnmdItem` — Unidad de medida, máximo 4. */
  readonly unit?: string
  /** EN: Unit price, net or VAT-included according to `pricesIncludeVat`. ES: `PrcItem` — Precio unitario, neto o con IVA según `pricesIncludeVat`. */
  readonly unitPrice?: number
  /** EN: Shorthand for `exemptIndicator: 1`. ES: Atajo para `exemptIndicator: 1` (`IndExe=1`). */
  readonly exempt?: boolean
  /** EN: Explicit exemption indicator. ES: `IndExe` — Indicador de exención explícito (1 a 6). */
  readonly exemptIndicator?: ExemptIndicator
  /** EN: Line discount percent. ES: `DescuentoPct` — Porcentaje de descuento de la línea. */
  readonly discountPercent?: number
  /** EN: Line surcharge percent. ES: `RecargoPct` — Porcentaje de recargo de la línea. */
  readonly surchargePercent?: number
  /** EN: Item codes. ES: `CdgItem` — Códigos del ítem (hasta 5). */
  readonly codes?: readonly ItemCode[]
  /** EN: Additional tax codes. ES: `CodImpAdic` — Códigos de impuesto adicional (hasta 2). */
  readonly additionalTaxCodes?: readonly number[]
  /** EN: Settled document type, settlement invoices only. ES: `TpoDocLiq` — Tipo del documento liquidado; obligatorio en liquidación factura (43). */
  readonly settledDocumentType?: string
  /** EN: Reference quantity. ES: `QtyRef` — Cantidad de referencia. */
  readonly referenceQuantity?: number
  /** EN: Reference unit (max 4). ES: `UnmdRef` — Unidad de referencia, máximo 4. */
  readonly referenceUnit?: string
  /** EN: Reference price. ES: `PrcRef` — Precio de referencia. */
  readonly referencePrice?: number
  /** EN: Explicit line amount; skips the quantity × price computation. ES: `MontoItem` — Monto explícito de la línea; omite el cálculo cantidad × precio. */
  readonly amount?: number
}

/**
 * EN: A normalized detail line (`Detalle`).
 * ES: `Detalle` — Línea de detalle normalizada.
 */
export type LineItem = {
  /** EN: 1-based line number. ES: `NroLinDet` — Número de línea, desde 1. */
  readonly lineNumber: number
  /** EN: Item codes. ES: `CdgItem` — Códigos del ítem. */
  readonly codes?: readonly ItemCode[]
  /** EN: Settled document type (43 only). ES: `TpoDocLiq` — Tipo del documento liquidado (solo 43). */
  readonly settledDocumentType?: string
  /** EN: Exemption indicator; absent on VAT-affected lines. ES: `IndExe` — Indicador de exención; ausente en líneas afectas. */
  readonly exemptIndicator?: ExemptIndicator
  /** EN: Item name. ES: `NmbItem` — Nombre del ítem. */
  readonly name: string
  /** EN: Description. ES: `DscItem` — Descripción. */
  readonly description?: string
  /** EN: Reference quantity. ES: `QtyRef` — Cantidad de referencia. */
  readonly referenceQuantity?: number
  /** EN: Reference unit. ES: `UnmdRef` — Unidad de referencia. */
  readonly referenceUnit?: string
  /** EN: Reference price. ES: `PrcRef` — Precio de referencia. */
  readonly referencePrice?: number
  /** EN: Quantity. ES: `QtyItem` — Cantidad. */
  readonly quantity?: number
  /** EN: Unit of measure. ES: `UnmdItem` — Unidad de medida. */
  readonly unit?: string
  /** EN: Unit price as declared. ES: `PrcItem` — Precio unitario tal como se declara. */
  readonly unitPrice?: number
  /** EN: Discount percent. ES: `DescuentoPct` — Porcentaje de descuento. */
  readonly discountPercent?: number
  /** EN: Discount amount. ES: `DescuentoMonto` — Monto del descuento. */
  readonly discountAmount?: number
  /** EN: Surcharge percent. ES: `RecargoPct` — Porcentaje de recargo. */
  readonly surchargePercent?: number
  /** EN: Surcharge amount. ES: `RecargoMonto` — Monto del recargo. */
  readonly surchargeAmount?: number
  /** EN: Additional tax codes. ES: `CodImpAdic` — Códigos de impuesto adicional. */
  readonly additionalTaxCodes?: readonly number[]
  /** EN: Line amount, integer pesos. ES: `MontoItem` — Monto de la línea, entero en pesos. */
  readonly amount: number
}

/**
 * EN: Withholding tax entry (`ImptoReten`), e.g. total VAT withholding on purchase invoices.
 * ES: `ImptoReten` — Impuesto de retención, p. ej. IVA retenido total en facturas de compra (46).
 */
export type Withholding = {
  /** EN: Tax code. ES: `TipoImp` — Código del impuesto (15 = IVA retenido total). */
  readonly taxCode: number
  /** EN: Rate percent. ES: `TasaImp` — Tasa en porcentaje. */
  readonly rate: number
  /** EN: Withheld amount. ES: `MontoImp` — Monto retenido. */
  readonly amount: number
}

/**
 * EN: Commission totals of a settlement invoice (`Totales/Comisiones`).
 * ES: `Comisiones` (dentro de `Totales`) — Totales de comisiones de una liquidación factura.
 */
export type CommissionTotals = {
  /** EN: Net commission value. ES: `ValComNeto` — Valor neto de las comisiones. */
  readonly netValue?: number
  /** EN: Exempt commission value. ES: `ValComExe` — Valor exento de las comisiones. */
  readonly exemptValue?: number
  /** EN: VAT on commissions. ES: `ValComIVA` — IVA de las comisiones. */
  readonly vatValue?: number
}

/**
 * EN: Document totals (`Totales`). Integer pesos.
 * ES: `Totales` — Totales del documento. Enteros en pesos.
 */
export type Totals = {
  /** EN: Net amount: VAT-affected lines before tax; omitted when 0. ES: `MntNeto` — Monto neto: líneas afectas sin IVA; se omite si es 0. */
  readonly netAmount?: number
  /** EN: Exempt amount (`IndExe=1` lines). ES: `MntExe` — Monto exento (líneas con `IndExe=1`). */
  readonly exemptAmount?: number
  /** EN: VAT rate percent (19); never on receipts. ES: `TasaIVA` — Tasa de IVA (19); nunca en boletas. */
  readonly vatRate?: number
  /** EN: VAT amount. ES: `IVA` — Monto del IVA. */
  readonly vatAmount?: number
  /** EN: Own VAT (settlement invoices). ES: `IVAProp` — IVA propio (liquidaciones). */
  readonly ownVatAmount?: number
  /** EN: Third-party VAT (settlement invoices). ES: `IVATerc` — IVA de terceros (liquidaciones). */
  readonly thirdPartyVatAmount?: number
  /** EN: Withholdings. ES: `ImptoReten` — Retenciones. */
  readonly withholdings?: readonly Withholding[]
  /** EN: Commission totals (43). ES: `Comisiones` — Totales de comisiones (43). */
  readonly commissions?: CommissionTotals
  /** EN: Document total: net + VAT + exempt (VAT excluded when withheld). ES: `MntTotal` — Monto total: neto + IVA + exento (sin IVA si está retenido). */
  readonly totalAmount: number
  /** EN: Non-billable amount (lines with `IndExe` 2-6). ES: `MontoNF` — Monto no facturable (líneas con `IndExe` 2 a 6). */
  readonly nonBillableAmount?: number
  /** EN: Period amount. ES: `MontoPeriodo` — Monto del período. */
  readonly periodAmount?: number
  /** EN: Previous balance. ES: `SaldoAnterior` — Saldo anterior. */
  readonly previousBalance?: number
  /** EN: Amount due. ES: `VlrPagar` — Valor a pagar. */
  readonly amountDue?: number
}

/**
 * EN: Reference to another document as the caller provides it (`Referencia`).
 * ES: `Referencia` — Referencia a otro documento tal como la entrega el llamador.
 */
export type ReferenceInput = {
  /** EN: Referenced document type, or `'SET'` for certification test sets. ES: `TpoDocRef` — Tipo del documento referenciado, o `'SET'` en los sets de certificación. */
  readonly documentType: number | 'SET'
  /** EN: Referenced folio. ES: `FolioRef` — Folio del documento referenciado. */
  readonly folio: number | string
  /** EN: Referenced document date YYYY-MM-DD. ES: `FchRef` — Fecha del documento referenciado, AAAA-MM-DD. */
  readonly date: string
  /** EN: Reference code (1 cancels, 2 corrects text, 3 corrects amounts). ES: `CodRef` — Código de referencia (1 anula, 2 corrige texto, 3 corrige montos). */
  readonly code?: ReferenceCode
  /** EN: Reason (max 90). ES: `RazonRef` — Razón de la referencia, máximo 90. */
  readonly reason?: string
  /** EN: Global reference (`IndGlobal=1`). ES: `IndGlobal` — Referencia global. */
  readonly global?: boolean
  /** EN: RUT of another issuer. ES: `RUTOtr` — RUT de otro contribuyente. */
  readonly otherRut?: string
}

/**
 * EN: Normalized reference.
 * ES: `Referencia` — Referencia normalizada.
 */
export type Reference = {
  /** EN: 1-based line number. ES: `NroLinRef` — Número de línea, desde 1. */
  readonly lineNumber: number
  /** EN: Referenced document type or `'SET'`. ES: `TpoDocRef` — Tipo del documento referenciado o `'SET'`. */
  readonly documentType: number | 'SET'
  /** EN: Global reference. ES: `IndGlobal` — Referencia global. */
  readonly global?: true
  /** EN: Referenced folio. ES: `FolioRef` — Folio referenciado. */
  readonly folio: string
  /** EN: RUT of another issuer. ES: `RUTOtr` — RUT de otro contribuyente. */
  readonly otherRut?: SiiRut
  /** EN: Referenced document date. ES: `FchRef` — Fecha del documento referenciado. */
  readonly date: string
  /** EN: Reference code. ES: `CodRef` — Código de referencia. */
  readonly code?: ReferenceCode
  /** EN: Reason. ES: `RazonRef` — Razón. */
  readonly reason?: string
}

/**
 * EN: Global discount or surcharge as the caller provides it (`DscRcgGlobal`).
 * ES: `DscRcgGlobal` — Descuento o recargo global tal como lo entrega el llamador.
 */
export type GlobalAdjustmentInput = {
  /** EN: `discount` (D) or `surcharge` (R). ES: `TpoMov` — `discount` (D, descuento) o `surcharge` (R, recargo). */
  readonly kind: 'discount' | 'surcharge'
  /** EN: `percent` (%) or `amount` ($). ES: `TpoValor` — `percent` (%) o `amount` ($). */
  readonly valueType: 'percent' | 'amount'
  /** EN: Value in the unit of `valueType`. ES: `ValorDR` — Valor en la unidad de `valueType`. */
  readonly value: number
  /** EN: Description (max 45). ES: `GlosaDR` — Glosa, máximo 45. */
  readonly description?: string
  /** EN: Applies to exempt (1) or non-billable (2) amounts instead of affected ones. ES: `IndExeDR` — Aplica a montos exentos (1) o no facturables (2) en vez de afectos. */
  readonly exemptIndicator?: 1 | 2
}

/**
 * EN: Normalized global adjustment.
 * ES: `DscRcgGlobal` — Descuento o recargo global normalizado.
 */
export type GlobalAdjustment = GlobalAdjustmentInput & {
  /** EN: 1-based line number. ES: `NroLinDR` — Número de línea, desde 1. */
  readonly lineNumber: number
}

/**
 * EN: Commission or other charge line of a settlement invoice (`Comisiones`).
 * ES: `Comisiones` — Línea de comisión u otro cargo de una liquidación factura (43).
 */
export type CommissionLine = {
  /** EN: 1-based line number. ES: `NroLinCom` — Número de línea, desde 1. */
  readonly lineNumber: number
  /** EN: `commission` (C) or `otherCharge` (O). ES: `TipoMovim` — `commission` (C, comisión) u `otherCharge` (O, otro cargo). */
  readonly kind: 'commission' | 'otherCharge'
  /** EN: Description (max 60). ES: `Glosa` — Glosa, máximo 60. */
  readonly description: string
  /** EN: Commission rate percent. ES: `TasaComision` — Tasa de la comisión en porcentaje. */
  readonly rate?: number
  /** EN: Net value. ES: `ValComNeto` — Valor neto. */
  readonly netValue?: number
  /** EN: Exempt value. ES: `ValComExe` — Valor exento. */
  readonly exemptValue?: number
  /** EN: VAT value. ES: `ValComIVA` — IVA de la comisión. */
  readonly vatValue?: number
}

/** EN: Commission line as the caller provides it. ES: Línea de comisión tal como la entrega el llamador. */
export type CommissionLineInput = Omit<CommissionLine, 'lineNumber'>

/**
 * EN: Driver of the transport (`Chofer`).
 * ES: `Chofer` — Conductor del transporte.
 */
export type Driver = {
  /** EN: Driver RUT. ES: `RUTChofer` — RUT del chofer. */
  readonly rut: SiiRut
  /** EN: Driver name (max 30). ES: `NombreChofer` — Nombre del chofer, máximo 30. */
  readonly name: string
}

/**
 * EN: Transport data of a dispatch guide (`Transporte`).
 * ES: `Transporte` — Datos de transporte de una guía de despacho (52).
 */
export type Transport = {
  /** EN: License plate (max 8). ES: `Patente` — Patente del vehículo, máximo 8. */
  readonly licensePlate?: string
  /** EN: Carrier RUT. ES: `RUTTrans` — RUT del transportista. */
  readonly carrierRut?: SiiRut
  /** EN: Driver. ES: `Chofer` — Chofer. */
  readonly driver?: Driver
  /** EN: Destination address (max 70). ES: `DirDest` — Dirección de destino, máximo 70. */
  readonly destinationAddress?: string
  /** EN: Destination commune (max 20). ES: `CmnaDest` — Comuna de destino, máximo 20. */
  readonly destinationCommune?: string
  /** EN: Destination city (max 20). ES: `CiudadDest` — Ciudad de destino, máximo 20. */
  readonly destinationCity?: string
}

/** EN: Transport as the caller provides it. ES: Transporte tal como lo entrega el llamador. */
export type TransportInput = Omit<Transport, 'carrierRut' | 'driver'> & {
  readonly carrierRut?: string
  readonly driver?: { readonly rut: string; readonly name: string }
}

/**
 * EN: A payment installment (`MntPagos`).
 * ES: `MntPagos` — Una cuota de pago.
 */
export type Payment = {
  /** EN: Payment date. ES: `FchPago` — Fecha de pago. */
  readonly date: string
  /** EN: Payment amount. ES: `MntPago` — Monto del pago. */
  readonly amount: number
  /** EN: Note (max 40). ES: `GlosaPagos` — Glosa, máximo 40. */
  readonly note?: string
}

/**
 * EN: Optional `IdDoc` fields. Only the ones you set are emitted, in schema order.
 * ES: Campos opcionales de `IdDoc`. Solo se emiten los que se fijan, en el orden del esquema.
 */
export type HeaderOptions = {
  /** EN: Credit note that does not reduce the debit (`IndNoRebaja=1`). ES: `IndNoRebaja` — Nota de crédito sin derecho a descontar débito (1). */
  readonly noDebitReduction?: 1
  /** EN: Dispatch type. ES: `TipoDespacho` — Tipo de despacho (1-3). */
  readonly dispatchType?: DispatchType
  /** EN: Transfer reason. ES: `IndTraslado` — Tipo de traslado (1-9). */
  readonly transferType?: TransferType
  /** EN: Print format: `N` normal, `T` ticket. ES: `TpoImpresion` — Formato de impresión: `N` normal, `T` ticket. */
  readonly printFormat?: 'N' | 'T'
  /** EN: Service indicator. ES: `IndServicio` — Indicador de servicio (1-4; 3 por defecto en boletas). */
  readonly serviceIndicator?: ServiceIndicator
  /** EN: Line amounts include VAT (`MntBruto=1`); set automatically with `pricesIncludeVat`. ES: `MntBruto` — Montos de las líneas con IVA incluido (1); se fija solo con `pricesIncludeVat`. */
  readonly grossAmounts?: 1
  /** EN: Purchase transaction type. ES: `TpoTranCompra` — Tipo de transacción de compra (1-7). */
  readonly purchaseTransactionType?: number
  /** EN: Sale transaction type. ES: `TpoTranVenta` — Tipo de transacción de venta (1-4). */
  readonly saleTransactionType?: number
  /** EN: Payment terms. ES: `FmaPago` — Forma de pago (1 contado, 2 crédito, 3 sin costo). */
  readonly paymentTerms?: PaymentTerms
  /** EN: Export payment terms. ES: `FmaPagExp` — Forma de pago de exportación. */
  readonly exportPaymentTerms?: string
  /** EN: Settlement date. ES: `FchCancel` — Fecha de cancelación. */
  readonly settlementDate?: string
  /** EN: Settled amount. ES: `MntCancel` — Monto cancelado. */
  readonly settledAmount?: number
  /** EN: Outstanding balance. ES: `SaldoInsol` — Saldo insoluto. */
  readonly outstandingBalance?: number
  /** EN: Payment installments. ES: `MntPagos` — Cuotas de pago. */
  readonly payments?: readonly Payment[]
  /** EN: Billing period. ES: `PeriodoDesde`/`PeriodoHasta` — Período de facturación. */
  readonly billingPeriod?: { readonly from: string; readonly to: string }
  /** EN: Payment medium. ES: `MedioPago` — Medio de pago. */
  readonly paymentMedium?: string
  /** EN: Payment account type. ES: `TpoCtaPago` — Tipo de cuenta de pago. */
  readonly paymentAccountType?: string
  /** EN: Payment account number. ES: `NumCtaPago` — Número de cuenta de pago. */
  readonly paymentAccountNumber?: string
  /** EN: Payment bank. ES: `BcoPago` — Banco de pago. */
  readonly paymentBank?: string
  /** EN: Payment terms code. ES: `TermPagoCdg` — Código de términos de pago. */
  readonly paymentTermsCode?: string
  /** EN: Payment terms note (max 100). ES: `TermPagoGlosa` — Glosa de términos de pago, máximo 100. */
  readonly paymentTermsNote?: string
  /** EN: Payment terms days. ES: `TermPagoDias` — Días de los términos de pago. */
  readonly paymentTermsDays?: number
  /** EN: Due date. ES: `FchVenc` — Fecha de vencimiento. */
  readonly dueDate?: string
  /** EN: Net amounts indicator. ES: `IndMntNeto` — Indicador de montos netos. */
  readonly netAmountsIndicator?: number
}

/**
 * EN: Informative subtotal (`SubTotInfo`).
 * ES: `SubTotInfo` — Subtotal informativo.
 */
export type SubtotalInfo = {
  /** EN: Subtotal number. ES: `NroSTI` — Número del subtotal. */
  readonly number: number
  /** EN: Description (max 40). ES: `GlosaSTI` — Glosa, máximo 40. */
  readonly description?: string
  /** EN: Print order. ES: `OrdenSTI` — Orden de impresión. */
  readonly order?: number
  /** EN: Net subtotal. ES: `SubTotNetoSTI` — Subtotal neto. */
  readonly netAmount?: number
  /** EN: VAT subtotal. ES: `SubTotIVASTI` — Subtotal IVA. */
  readonly vatAmount?: number
  /** EN: Additional taxes subtotal. ES: `SubTotAdicSTI` — Subtotal impuestos adicionales. */
  readonly additionalTaxAmount?: number
  /** EN: Exempt subtotal. ES: `SubTotExeSTI` — Subtotal exento. */
  readonly exemptAmount?: number
  /** EN: Subtotal value. ES: `ValSubtotSTI` — Valor del subtotal. */
  readonly totalAmount: number
  /** EN: Detail line numbers included. ES: `LineasDeta` — Líneas de detalle incluidas. */
  readonly lines?: readonly number[]
}

/**
 * EN: Document header (`Encabezado`).
 * ES: `Encabezado` — Encabezado del documento.
 */
export type Header = {
  /** EN: Document type. ES: `TipoDTE` — Tipo de documento. */
  readonly type: DocumentType
  /** EN: Folio. ES: `Folio` — Folio. */
  readonly folio: number
  /** EN: Issue date YYYY-MM-DD. ES: `FchEmis` — Fecha de emisión AAAA-MM-DD. */
  readonly issueDate: string
  /** EN: Optional `IdDoc` fields. ES: Campos opcionales de `IdDoc`. */
  readonly options: HeaderOptions
  readonly issuer: Issuer
  readonly receiver: Receiver
  readonly transport?: Transport
  readonly totals: Totals
}

/**
 * EN: A normalized document, ready to be rendered, stamped and signed. Produced by `createDocument`.
 * ES: Documento normalizado, listo para renderizar, timbrar y firmar. Lo produce `createDocument`.
 */
export type Document = {
  /** EN: `ID` attribute of the signed element: `DTE_T{type}F{folio}`. ES: Atributo `ID` del elemento firmado: `DTE_T{tipo}F{folio}`. */
  readonly id: string
  readonly header: Header
  readonly items: readonly LineItem[]
  readonly subtotals: readonly SubtotalInfo[]
  readonly globalAdjustments: readonly GlobalAdjustment[]
  readonly references: readonly Reference[]
  /** EN: Commission lines (settlement invoices only). ES: `Comisiones` — Líneas de comisión (solo 43). */
  readonly commissions: readonly CommissionLine[]
}

/**
 * EN: What the caller passes to `createDocument`.
 * ES: Lo que el llamador entrega a `createDocument`.
 */
export type DocumentInput = {
  /** EN: Document type. ES: `TipoDTE` — Tipo de documento. */
  readonly type: DocumentType
  /** EN: Folio authorized by the CAF. ES: `Folio` — Folio autorizado por el CAF. */
  readonly folio: number
  /** EN: Issue date YYYY-MM-DD; defaults to today in Chile. ES: `FchEmis` — Fecha de emisión AAAA-MM-DD; por defecto hoy en hora de Chile. */
  readonly issueDate?: string
  readonly issuer: IssuerInput
  /** EN: Receiver; optional on receipts (anonymous final consumer). ES: Receptor; opcional en boletas (consumidor final anónimo). */
  readonly receiver?: ReceiverInput
  readonly items: readonly LineItemInput[]
  readonly references?: readonly ReferenceInput[]
  readonly globalAdjustments?: readonly GlobalAdjustmentInput[]
  readonly subtotals?: readonly SubtotalInfo[]
  readonly commissions?: readonly CommissionLineInput[]
  readonly transport?: TransportInput
  readonly options?: HeaderOptions
  /** EN: Unit prices already include VAT: emits `MntBruto=1` and derives net/VAT from the gross. ES: Los precios unitarios ya incluyen IVA: emite `MntBruto=1` y deriva neto/IVA del bruto. */
  readonly pricesIncludeVat?: boolean
  /** EN: Explicit totals (advanced); computed when omitted. ES: Totales explícitos (uso avanzado); se calculan si se omiten. */
  readonly totals?: Totals
}
```

`src/model/sii.ts` (etiquetas oficiales, mismo orden que el XSD):

```ts
/**
 * EN: Payment installment, SII shape.
 * ES: `MntPagos` — Cuota de pago, forma SII.
 */
export type SiiMntPagos = { readonly FchPago: string; readonly MntPago: number; readonly GlosaPagos?: string }

/**
 * EN: `IdDoc` with the official tags, in schema order.
 * ES: `IdDoc` con las etiquetas oficiales, en el orden del esquema.
 */
export type SiiIdDoc = {
  readonly TipoDTE: number
  readonly Folio: number
  readonly FchEmis: string
  readonly IndNoRebaja?: number
  readonly TipoDespacho?: number
  readonly IndTraslado?: number
  readonly TpoImpresion?: string
  readonly IndServicio?: number
  readonly MntBruto?: number
  readonly TpoTranCompra?: number
  readonly TpoTranVenta?: number
  readonly FmaPago?: number
  readonly FmaPagExp?: string
  readonly FchCancel?: string
  readonly MntCancel?: number
  readonly SaldoInsol?: number
  readonly MntPagos?: readonly SiiMntPagos[]
  readonly PeriodoDesde?: string
  readonly PeriodoHasta?: string
  readonly MedioPago?: string
  readonly TpoCtaPago?: string
  readonly NumCtaPago?: string
  readonly BcoPago?: string
  readonly TermPagoCdg?: string
  readonly TermPagoGlosa?: string
  readonly TermPagoDias?: number
  readonly FchVenc?: string
  readonly IndMntNeto?: number
}

/** EN: `Emisor`, SII shape (receipts use `RznSocEmisor`/`GiroEmisor`). ES: `Emisor` en forma SII (las boletas usan `RznSocEmisor`/`GiroEmisor`). */
export type SiiEmisor = {
  readonly RUTEmisor: string
  readonly RznSoc?: string
  readonly RznSocEmisor?: string
  readonly GiroEmis?: string
  readonly GiroEmisor?: string
  readonly Telefono?: string
  readonly CorreoEmisor?: string
  readonly Acteco?: number
  readonly Sucursal?: string
  readonly CdgSIISucur?: number
  readonly DirOrigen: string
  readonly CmnaOrigen: string
  readonly CiudadOrigen?: string
  readonly CdgVendedor?: string
}

/** EN: `Receptor`, SII shape. ES: `Receptor` en forma SII. */
export type SiiReceptor = {
  readonly RUTRecep: string
  readonly CdgIntRecep?: string
  readonly RznSocRecep: string
  readonly GiroRecep?: string
  readonly Contacto?: string
  readonly CorreoRecep?: string
  readonly DirRecep?: string
  readonly CmnaRecep?: string
  readonly CiudadRecep?: string
  readonly DirPostal?: string
  readonly CmnaPostal?: string
  readonly CiudadPostal?: string
}

/** EN: `Transporte`, SII shape. ES: `Transporte` en forma SII. */
export type SiiTransporte = {
  readonly Patente?: string
  readonly RUTTrans?: string
  readonly Chofer?: { readonly RUTChofer: string; readonly NombreChofer: string }
  readonly DirDest?: string
  readonly CmnaDest?: string
  readonly CiudadDest?: string
}

/** EN: `ImptoReten`, SII shape. ES: `ImptoReten` en forma SII. */
export type SiiImptoReten = { readonly TipoImp: number; readonly TasaImp: number; readonly MontoImp: number }

/** EN: `Totales/Comisiones`, SII shape. ES: `Totales/Comisiones` en forma SII. */
export type SiiComisionesTotales = { readonly ValComNeto?: number; readonly ValComExe?: number; readonly ValComIVA?: number }

/** EN: `Totales`, SII shape, schema order. ES: `Totales` en forma SII, orden del esquema. */
export type SiiTotales = {
  readonly MntNeto?: number
  readonly MntExe?: number
  readonly TasaIVA?: number
  readonly IVA?: number
  readonly IVAProp?: number
  readonly IVATerc?: number
  readonly ImptoReten?: readonly SiiImptoReten[]
  readonly Comisiones?: SiiComisionesTotales
  readonly MntTotal: number
  readonly MontoNF?: number
  readonly MontoPeriodo?: number
  readonly SaldoAnterior?: number
  readonly VlrPagar?: number
}

/** EN: `Encabezado`, SII shape. ES: `Encabezado` en forma SII. */
export type SiiEncabezado = {
  readonly IdDoc: SiiIdDoc
  readonly Emisor: SiiEmisor
  readonly Receptor: SiiReceptor
  readonly Transporte?: SiiTransporte
  readonly Totales: SiiTotales
}

/** EN: `CdgItem`, SII shape. ES: `CdgItem` en forma SII. */
export type SiiCdgItem = { readonly TpoCodigo: string; readonly VlrCodigo: string }

/** EN: `Detalle`, SII shape, schema order. ES: `Detalle` en forma SII, orden del esquema. */
export type SiiDetalle = {
  readonly NroLinDet: number
  readonly CdgItem?: readonly SiiCdgItem[]
  readonly TpoDocLiq?: string
  readonly IndExe?: number
  readonly NmbItem: string
  readonly DscItem?: string
  readonly QtyRef?: number
  readonly UnmdRef?: string
  readonly PrcRef?: number
  readonly QtyItem?: number
  readonly UnmdItem?: string
  readonly PrcItem?: number
  readonly DescuentoPct?: number
  readonly DescuentoMonto?: number
  readonly RecargoPct?: number
  readonly RecargoMonto?: number
  readonly CodImpAdic?: readonly number[]
  readonly MontoItem: number
}

/** EN: `SubTotInfo`, SII shape. ES: `SubTotInfo` en forma SII. */
export type SiiSubTotInfo = {
  readonly NroSTI: number
  readonly GlosaSTI?: string
  readonly OrdenSTI?: number
  readonly SubTotNetoSTI?: number
  readonly SubTotIVASTI?: number
  readonly SubTotAdicSTI?: number
  readonly SubTotExeSTI?: number
  readonly ValSubtotSTI: number
  readonly LineasDeta?: readonly number[]
}

/** EN: `DscRcgGlobal`, SII shape. ES: `DscRcgGlobal` en forma SII. */
export type SiiDscRcgGlobal = {
  readonly NroLinDR: number
  readonly TpoMov: 'D' | 'R'
  readonly GlosaDR?: string
  readonly TpoValor: '%' | '$'
  readonly ValorDR: number
  readonly IndExeDR?: number
}

/** EN: `Referencia`, SII shape. ES: `Referencia` en forma SII. */
export type SiiReferencia = {
  readonly NroLinRef: number
  readonly TpoDocRef: number | string
  readonly IndGlobal?: number
  readonly FolioRef: string
  readonly RUTOtr?: string
  readonly FchRef: string
  readonly CodRef?: number
  readonly RazonRef?: string
}

/** EN: `Comisiones` line (43), SII shape. ES: Línea de `Comisiones` (43) en forma SII. */
export type SiiComisiones = {
  readonly NroLinCom: number
  readonly TipoMovim: 'C' | 'O'
  readonly Glosa: string
  readonly TasaComision?: number
  readonly ValComNeto?: number
  readonly ValComExe?: number
  readonly ValComIVA?: number
}

/**
 * EN: The document body with official tags, in the order `Documento`/`Liquidacion` require. `TED` and `TmstFirma` are added when rendering.
 * ES: Cuerpo del documento con etiquetas oficiales, en el orden que exigen `Documento`/`Liquidacion`. `TED` y `TmstFirma` se agregan al renderizar.
 */
export type SiiDocumento = {
  readonly Encabezado: SiiEncabezado
  readonly Detalle: readonly SiiDetalle[]
  readonly SubTotInfo?: readonly SiiSubTotInfo[]
  readonly DscRcgGlobal?: readonly SiiDscRcgGlobal[]
  readonly Referencia?: readonly SiiReferencia[]
  readonly Comisiones?: readonly SiiComisiones[]
}
```

`src/model/cover.ts`:

```ts
import type { DocumentType } from '../catalogs/document-types'
import type { SiiRut } from './rut'

/**
 * EN: Count of documents per type inside an envelope (`SubTotDTE`).
 * ES: `SubTotDTE` — Cantidad de documentos por tipo dentro del sobre.
 */
export type EnvelopeSubtotal = {
  /** EN: Document type. ES: `TpoDTE` — Tipo de documento. */
  readonly type: DocumentType
  /** EN: How many. ES: `NroDTE` — Cuántos. */
  readonly count: number
}

/**
 * EN: Envelope cover as the caller provides it (`Caratula`).
 * ES: `Caratula` — Carátula del sobre tal como la entrega el llamador.
 */
export type EnvelopeCoverInput = {
  /** EN: Issuer company RUT. ES: `RutEmisor` — RUT de la empresa emisora. */
  readonly issuerRut: string
  /** EN: RUT of the certificate holder who signs the envelope. ES: `RutEnvia` — RUT del firmante autorizado (dueño del certificado). */
  readonly senderRut: string
  /** EN: Receiver RUT; defaults to the SII (always the SII on receipt envelopes). ES: `RutReceptor` — RUT del receptor; por defecto el SII (siempre el SII en sobres de boletas). */
  readonly receiverRut?: string
  /** EN: SII resolution date (YYYY-MM-DD or DD-MM-YYYY). ES: `FchResol` — Fecha de la resolución del SII (AAAA-MM-DD o DD-MM-AAAA). */
  readonly resolutionDate: string
  /** EN: Resolution number (0 in certification). ES: `NroResol` — Número de resolución (0 en certificación). */
  readonly resolutionNumber: number
  /** EN: Explicit signing timestamp; defaults to now in Chile. ES: `TmstFirmaEnv` — Marca de tiempo explícita; por defecto ahora en hora de Chile. */
  readonly signedAt?: string
  /** EN: Explicit `SetDTE` ID; generated when omitted. ES: ID explícito del `SetDTE`; se genera si se omite. */
  readonly setId?: string
}

/**
 * EN: Normalized envelope cover.
 * ES: `Caratula` — Carátula normalizada.
 */
export type EnvelopeCover = {
  /** EN: Issuer RUT. ES: `RutEmisor` — RUT del emisor. */
  readonly issuerRut: SiiRut
  /** EN: Sender RUT. ES: `RutEnvia` — RUT de quien envía. */
  readonly senderRut: SiiRut
  /** EN: Receiver RUT. ES: `RutReceptor` — RUT del receptor. */
  readonly receiverRut: SiiRut
  /** EN: Resolution date YYYY-MM-DD. ES: `FchResol` — Fecha de resolución AAAA-MM-DD. */
  readonly resolutionDate: string
  /** EN: Resolution number. ES: `NroResol` — Número de resolución. */
  readonly resolutionNumber: number
  /** EN: Signing timestamp, Chile time. ES: `TmstFirmaEnv` — Marca de tiempo de la firma, hora de Chile. */
  readonly signedAt: string
  /** EN: Documents per type. ES: `SubTotDTE` — Documentos por tipo. */
  readonly subtotals: readonly EnvelopeSubtotal[]
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest tests/model-types.test.ts && npx tsc --noEmit`
Expected: PASS y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/model/document.ts src/model/sii.ts src/model/cover.ts tests/model-types.test.ts
git commit -m "feat: domain model (English, bilingual JSDoc) and SII-shaped types

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Cálculo de montos y totales (`src/totals/calculate.ts`)

**Files:**
- Create: `src/totals/calculate.ts`
- Test: `tests/calculate.test.ts`

Reglas:
- Monto de línea: `round(qty × price)`, descuento `round(base × pct/100)`, recargo igual.
- Línea con `exemptIndicator` 1 → exento; con 2…6 → no facturable (`MontoNF`, fuera de `MntTotal`); sin indicador → afecta.
- Tipos 34/41: todo exento (lo decide `createDocument` al poner `exemptIndicator: 1`).
- Ajustes globales: `%` sobre la base afecta (o exenta/no facturable según `IndExeDR`), `$` directo. Descuento resta, recargo suma.
- `pricesIncludeVat`: afecto es bruto → `neto = round(bruto / 1.19)`, `IVA = bruto − neto`, `MntTotal = bruto + exento`.
- Normal: `IVA = round(neto × 19/100)`, `MntTotal = neto + IVA + exento`.
- Retención (46): `ImptoReten [{15, 19, IVA}]` y `MntTotal = neto + exento`.
- Boletas: sin `TasaIVA`. `MntNeto`/`IVA`/`TasaIVA` solo si neto > 0; `MntExe` solo si exento > 0.
- Sin montos: `{ TasaIVA (si no es boleta), MntTotal: 0 }` (guía de traslado sin valores).

- [ ] **Step 1: Test que falla**

`tests/calculate.test.ts`:

```ts
import { calculateLineAmount, calculateTotals } from '../src/totals/calculate'

const line = (amount: number, exemptIndicator?: 1 | 2 | 3 | 4 | 5 | 6) => ({ amount, exemptIndicator })

describe('calculateLineAmount', () => {
  test.each([
    [{ quantity: 2, unitPrice: 1000 }, { base: 2000, discountAmount: 0, surchargeAmount: 0, amount: 2000 }],
    [{ quantity: 1.5, unitPrice: 333 }, { base: 500, discountAmount: 0, surchargeAmount: 0, amount: 500 }],
    [{ quantity: 3, unitPrice: 1000, discountPercent: 10 }, { base: 3000, discountAmount: 300, surchargeAmount: 0, amount: 2700 }],
    [{ quantity: 1, unitPrice: 1000, surchargePercent: 5 }, { base: 1000, discountAmount: 0, surchargeAmount: 50, amount: 1050 }],
    [{}, { base: 0, discountAmount: 0, surchargeAmount: 0, amount: 0 }],
    [{ unitPrice: 999 }, { base: 999, discountAmount: 0, surchargeAmount: 0, amount: 999 }],
  ])('%p → %p', (input, expected) => {
    expect(calculateLineAmount(input)).toEqual(expected)
  })
})

describe('calculateTotals', () => {
  test('invoice, net prices', () => {
    expect(calculateTotals([line(1680)], { type: 33 })).toEqual({ netAmount: 1680, vatRate: 19, vatAmount: 319, totalAmount: 1999 })
  })

  test('invoice with VAT-included prices derives net and VAT from the gross', () => {
    expect(calculateTotals([line(2000)], { type: 33, pricesIncludeVat: true })).toEqual({ netAmount: 1681, vatRate: 19, vatAmount: 319, totalAmount: 2000 })
    expect(calculateTotals([line(1018)], { type: 33, pricesIncludeVat: true })).toEqual({ netAmount: 855, vatRate: 19, vatAmount: 163, totalAmount: 1018 })
    expect(calculateTotals([line(1005)], { type: 33, pricesIncludeVat: true })).toEqual({ netAmount: 845, vatRate: 19, vatAmount: 160, totalAmount: 1005 })
  })

  test('affected + exempt keeps exempt out of the net, keys in schema order', () => {
    const totals = calculateTotals([line(2000), line(500, 1)], { type: 33, pricesIncludeVat: true })
    expect(Object.keys(totals)).toEqual(['netAmount', 'exemptAmount', 'vatRate', 'vatAmount', 'totalAmount'])
    expect(totals).toEqual({ netAmount: 1681, exemptAmount: 500, vatRate: 19, vatAmount: 319, totalAmount: 2500 })
  })

  test('receipt: no vatRate, gross by default', () => {
    expect(calculateTotals([line(2000)], { type: 39, pricesIncludeVat: true })).toEqual({ netAmount: 1681, vatAmount: 319, totalAmount: 2000 })
  })

  test('only exempt lines: no net, no VAT', () => {
    expect(calculateTotals([line(500, 1)], { type: 33 })).toEqual({ exemptAmount: 500, totalAmount: 500 })
  })

  test('non-billable lines go to nonBillableAmount and stay out of the total', () => {
    expect(calculateTotals([line(1000), line(300, 2), line(-50, 6)], { type: 33 })).toEqual({
      netAmount: 1000,
      vatRate: 19,
      vatAmount: 190,
      totalAmount: 1190,
      nonBillableAmount: 250,
    })
  })

  test('purchase invoice withholds the whole VAT', () => {
    expect(calculateTotals([line(1000)], { type: 46 })).toEqual({
      netAmount: 1000,
      vatRate: 19,
      vatAmount: 190,
      withholdings: [{ taxCode: 15, rate: 19, amount: 190 }],
      totalAmount: 1000,
    })
  })

  test('global percent discount applies to the affected base', () => {
    const totals = calculateTotals([line(1000), line(500, 1)], {
      type: 33,
      globalAdjustments: [{ lineNumber: 1, kind: 'discount', valueType: 'percent', value: 10 }],
    })
    expect(totals).toEqual({ netAmount: 900, exemptAmount: 500, vatRate: 19, vatAmount: 171, totalAmount: 1571 })
  })

  test('global amount surcharge on exempt base', () => {
    const totals = calculateTotals([line(1000), line(500, 1)], {
      type: 33,
      globalAdjustments: [{ lineNumber: 1, kind: 'surcharge', valueType: 'amount', value: 100, exemptIndicator: 1 }],
    })
    expect(totals).toEqual({ netAmount: 1000, exemptAmount: 600, vatRate: 19, vatAmount: 190, totalAmount: 1790 })
  })

  test('no amounts at all (transfer without values)', () => {
    expect(calculateTotals([line(0)], { type: 52 })).toEqual({ vatRate: 19, totalAmount: 0 })
    expect(calculateTotals([], { type: 39 })).toEqual({ totalAmount: 0 })
  })

  test('custom VAT rate', () => {
    expect(calculateTotals([line(1000)], { type: 33, vatRate: 10 })).toEqual({ netAmount: 1000, vatRate: 10, vatAmount: 100, totalAmount: 1100 })
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest tests/calculate.test.ts`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementación**

`src/totals/calculate.ts`:

```ts
import { VAT_RATE, WITHHOLDING_TAX_CODES } from '../catalogs/codes'
import { isReceipt, type DocumentType } from '../catalogs/document-types'
import type { GlobalAdjustment, LineItem, Totals } from '../model/document'

/**
 * EN: Inputs of a line amount.
 * ES: Entradas del monto de una línea.
 */
export type LineAmountInput = {
  /** EN: Quantity (default 1). ES: `QtyItem` — Cantidad (por defecto 1). */
  readonly quantity?: number
  /** EN: Unit price (default 0). ES: `PrcItem` — Precio unitario (por defecto 0). */
  readonly unitPrice?: number
  /** EN: Discount percent. ES: `DescuentoPct` — Porcentaje de descuento. */
  readonly discountPercent?: number
  /** EN: Surcharge percent. ES: `RecargoPct` — Porcentaje de recargo. */
  readonly surchargePercent?: number
}

/**
 * EN: Result of a line amount computation, integer pesos.
 * ES: Resultado del cálculo del monto de una línea, enteros en pesos.
 */
export type LineAmount = {
  /** EN: `round(quantity × unitPrice)`. ES: `round(cantidad × precio)`. */
  readonly base: number
  /** EN: Discount in pesos. ES: `DescuentoMonto` — Descuento en pesos. */
  readonly discountAmount: number
  /** EN: Surcharge in pesos. ES: `RecargoMonto` — Recargo en pesos. */
  readonly surchargeAmount: number
  /** EN: `base − discount + surcharge`. ES: `MontoItem` — `base − descuento + recargo`. */
  readonly amount: number
}

/**
 * EN: Computes a detail line amount with per-line rounding (the SII compares `MontoItem` against `QtyItem × PrcItem`).
 * ES: Calcula el monto de una línea con redondeo por línea (el SII compara `MontoItem` contra `QtyItem × PrcItem`).
 */
export const calculateLineAmount = ({ quantity = 1, unitPrice = 0, discountPercent = 0, surchargePercent = 0 }: LineAmountInput): LineAmount => {
  const base = Math.round(quantity * unitPrice)
  const discountAmount = discountPercent > 0 ? Math.round((base * discountPercent) / 100) : 0
  const surchargeAmount = surchargePercent > 0 ? Math.round((base * surchargePercent) / 100) : 0
  return { base, discountAmount, surchargeAmount, amount: base - discountAmount + surchargeAmount }
}

/**
 * EN: Options of `calculateTotals`.
 * ES: Opciones de `calculateTotals`.
 */
export type TotalsOptions = {
  /** EN: Document type (drives receipts, withholding). ES: Tipo de documento (decide boletas y retención). */
  readonly type: DocumentType
  /** EN: Line amounts include VAT. ES: Los montos de línea incluyen IVA. */
  readonly pricesIncludeVat?: boolean
  /** EN: VAT rate percent (default 19). ES: Tasa de IVA en porcentaje (por defecto 19). */
  readonly vatRate?: number
  /** EN: Global discounts/surcharges. ES: Descuentos/recargos globales. */
  readonly globalAdjustments?: readonly GlobalAdjustment[]
  /** EN: Withhold the whole VAT (default: true for purchase invoices). ES: Retener todo el IVA (por defecto: true en facturas de compra, 46). */
  readonly withholdVat?: boolean
}

type Bases = { readonly affected: number; readonly exempt: number; readonly nonBillable: number }

const sumBases = (items: readonly Pick<LineItem, 'amount' | 'exemptIndicator'>[]): Bases =>
  items.reduce<Bases>(
    (acc, item) => {
      if (item.exemptIndicator === undefined) return { ...acc, affected: acc.affected + item.amount }
      if (item.exemptIndicator === 1) return { ...acc, exempt: acc.exempt + item.amount }
      return { ...acc, nonBillable: acc.nonBillable + item.amount }
    },
    { affected: 0, exempt: 0, nonBillable: 0 },
  )

const applyAdjustments = (bases: Bases, adjustments: readonly GlobalAdjustment[]): Bases =>
  adjustments.reduce<Bases>((acc, adjustment) => {
    const key = adjustment.exemptIndicator === 1 ? 'exempt' : adjustment.exemptIndicator === 2 ? 'nonBillable' : 'affected'
    const delta = adjustment.valueType === 'percent' ? Math.round((acc[key] * adjustment.value) / 100) : Math.round(adjustment.value)
    const signed = adjustment.kind === 'discount' ? -delta : delta
    return { ...acc, [key]: acc[key] + signed }
  }, bases)

/**
 * EN: Computes `Totales` from detail lines: net, exempt, VAT (derived from the gross when `pricesIncludeVat`),
 * non-billable, withholding for purchase invoices and the total. Keys come out in schema order and zero
 * sections are omitted, exactly as the SII expects.
 * ES: Calcula `Totales` desde las líneas: neto, exento, IVA (derivado del bruto con `pricesIncludeVat`), no facturable,
 * retención en facturas de compra y el total. Las claves salen en el orden del esquema y las secciones en cero se omiten,
 * tal como espera el SII.
 */
export const calculateTotals = (items: readonly Pick<LineItem, 'amount' | 'exemptIndicator'>[], options: TotalsOptions): Totals => {
  const vatRate = options.vatRate ?? VAT_RATE
  const receipt = isReceipt(options.type)
  const withholdVat = options.withholdVat ?? options.type === 46
  const { affected, exempt, nonBillable } = applyAdjustments(sumBases(items), options.globalAdjustments ?? [])

  if (affected <= 0 && exempt <= 0 && nonBillable === 0) {
    return receipt ? { totalAmount: 0 } : { vatRate, totalAmount: 0 }
  }

  const net = options.pricesIncludeVat ? Math.round(affected / (1 + vatRate / 100)) : affected
  const vat = options.pricesIncludeVat ? affected - net : Math.round((net * vatRate) / 100)
  const total = withholdVat ? net + exempt : net + vat + exempt

  return {
    ...(net > 0 ? { netAmount: net } : {}),
    ...(exempt > 0 ? { exemptAmount: exempt } : {}),
    ...(net > 0 && !receipt ? { vatRate } : {}),
    ...(net > 0 ? { vatAmount: vat } : {}),
    ...(withholdVat && vat > 0 ? { withholdings: [{ taxCode: WITHHOLDING_TAX_CODES.totalVatWithholding, rate: vatRate, amount: vat }] } : {}),
    totalAmount: total,
    ...(nonBillable !== 0 ? { nonBillableAmount: nonBillable } : {}),
  }
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest tests/calculate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/totals/calculate.ts tests/calculate.test.ts
git commit -m "feat: line amounts and document totals (net, gross, exempt, withholding)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: `createDocument` (`src/document/create.ts`)

**Files:**
- Create: `src/document/create.ts`
- Test: `tests/create-document.test.ts`

- [ ] **Step 1: Test que falla**

`tests/create-document.test.ts`:

```ts
import { createDocument, FIELD_LIMITS } from '../src/document/create'
import { DteError } from '../src/errors'
import { FIXED_NOW, ISSUER_RUT, RECEIVER_RUT } from './support/fixtures'

const issuer = { rut: ISSUER_RUT, businessName: 'Empresa Ejemplo SpA', businessActivity: 'Desarrollo de software', address: 'Av. Ejemplo 123', commune: 'Santiago', activityCode: 620200 }
const receiver = { rut: RECEIVER_RUT, businessName: "Cliente 'Ejemplo' SA", businessActivity: 'Comercio', address: 'Calle 456', commune: 'Providencia' }
const items = [
  { name: 'Licencia anual', quantity: 1, unitPrice: 100000 },
  { name: 'Soporte técnico', quantity: 3, unitPrice: 15000 },
]

const expectError = (fn: () => unknown, code: string, details?: Record<string, unknown>) => {
  try {
    fn()
    throw new Error('expected DteError')
  } catch (err) {
    expect(err).toBeInstanceOf(DteError)
    expect((err as DteError).code).toBe(code)
    if (details) expect((err as DteError).details).toMatchObject(details)
  }
}

describe('createDocument', () => {
  test('invoice: normalizes parties, numbers lines, computes totals and id', () => {
    const doc = createDocument({ type: 33, folio: 7, issueDate: '2026-11-15', issuer, receiver, items })
    expect(doc.id).toBe('DTE_T33F7')
    expect(doc.header.type).toBe(33)
    expect(doc.header.folio).toBe(7)
    expect(doc.header.issueDate).toBe('2026-11-15')
    expect(doc.header.issuer).toEqual({ ...issuer, city: 'Santiago' })
    expect(doc.header.receiver.businessName).toBe('Cliente Ejemplo SA')
    expect(doc.header.options).toEqual({})
    expect(doc.items).toEqual([
      { lineNumber: 1, name: 'Licencia anual', quantity: 1, unitPrice: 100000, amount: 100000 },
      { lineNumber: 2, name: 'Soporte técnico', quantity: 3, unitPrice: 15000, amount: 45000 },
    ])
    expect(doc.header.totals).toEqual({ netAmount: 145000, vatRate: 19, vatAmount: 27550, totalAmount: 172550 })
    expect(doc.references).toEqual([])
    expect(doc.globalAdjustments).toEqual([])
    expect(doc.subtotals).toEqual([])
    expect(doc.commissions).toEqual([])
  })

  test('issueDate defaults to today in Chile (injectable clock)', () => {
    expect(createDocument({ type: 33, folio: 1, issuer, receiver, items }, { now: FIXED_NOW }).header.issueDate).toBe('2026-11-15')
  })

  test('receipt without receiver uses the final consumer and IndServicio 3', () => {
    const doc = createDocument({ type: 39, folio: 1, issuer, items: [{ name: 'Café', unitPrice: 1000 }], pricesIncludeVat: true })
    expect(doc.header.receiver).toEqual({ rut: '66666666-6', businessName: 'Consumidor Final', address: 'Sin Direccion', commune: 'Santiago' })
    expect(doc.header.options).toEqual({ serviceIndicator: 3 })
    expect(doc.header.totals).toEqual({ netAmount: 840, vatAmount: 160, totalAmount: 1000 })
  })

  test('receipt with a partial receiver keeps what was given', () => {
    const doc = createDocument({ type: 41, folio: 2, issuer, receiver: { rut: RECEIVER_RUT, businessName: 'Ana' }, items: [{ name: 'Clase', unitPrice: 5000 }] })
    expect(doc.header.receiver).toEqual({ rut: RECEIVER_RUT, businessName: 'Ana' })
    expect(doc.items[0].exemptIndicator).toBe(1)
    expect(doc.header.totals).toEqual({ exemptAmount: 5000, totalAmount: 5000 })
  })

  test('VAT-included prices set grossAmounts on invoices but not on receipts', () => {
    const invoice = createDocument({ type: 33, folio: 1, issuer, receiver, items: [{ name: 'P', quantity: 2, unitPrice: 1000 }], pricesIncludeVat: true })
    expect(invoice.header.options).toEqual({ grossAmounts: 1 })
    expect(invoice.header.totals).toEqual({ netAmount: 1681, vatRate: 19, vatAmount: 319, totalAmount: 2000 })
    const exemptOnly = createDocument({ type: 33, folio: 1, issuer, receiver, items: [{ name: 'E', unitPrice: 500, exempt: true }], pricesIncludeVat: true })
    expect(exemptOnly.header.options).toEqual({})
  })

  test('explicit options are kept and serviceIndicator is not overridden', () => {
    const doc = createDocument({ type: 39, folio: 1, issuer, items: [{ name: 'X', unitPrice: 100 }], options: { serviceIndicator: 1, paymentTerms: 1 } })
    expect(doc.header.options).toEqual({ serviceIndicator: 1, paymentTerms: 1 })
  })

  test('references, adjustments, transport, subtotals and explicit totals', () => {
    const doc = createDocument({
      type: 61,
      folio: 9,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [{ name: 'Devolución', unitPrice: 1000 }],
      references: [{ documentType: 33, folio: 7, date: '2026-11-01', code: 1, reason: "Anula 'factura'" }],
      globalAdjustments: [{ kind: 'discount', valueType: 'percent', value: 10, description: 'Desc. global' }],
      transport: { licensePlate: 'ABCD12', carrierRut: '12.345.678-5', driver: { rut: RECEIVER_RUT, name: 'Juan' }, destinationAddress: 'Bodega 1', destinationCommune: 'Maipú' },
      subtotals: [{ number: 1, totalAmount: 1000 }],
      totals: { netAmount: 1000, vatRate: 19, vatAmount: 190, totalAmount: 1190 },
    })
    expect(doc.references).toEqual([{ lineNumber: 1, documentType: 33, folio: '7', date: '2026-11-01', code: 1, reason: 'Anula factura' }])
    expect(doc.globalAdjustments).toEqual([{ lineNumber: 1, kind: 'discount', valueType: 'percent', value: 10, description: 'Desc. global' }])
    expect(doc.header.transport).toEqual({ licensePlate: 'ABCD12', carrierRut: '12345678-5', driver: { rut: '12345678-5', name: 'Juan' }, destinationAddress: 'Bodega 1', destinationCommune: 'Maipú' })
    expect(doc.subtotals).toEqual([{ number: 1, totalAmount: 1000 }])
    expect(doc.header.totals).toEqual({ netAmount: 1000, vatRate: 19, vatAmount: 190, totalAmount: 1190 })
  })

  test('settlement invoice (43) requires settledDocumentType per line and keeps commissions', () => {
    const doc = createDocument({
      type: 43,
      folio: 1,
      issuer,
      receiver,
      items: [{ name: 'Venta liquidada', unitPrice: 10000, settledDocumentType: '33' }],
      commissions: [{ kind: 'commission', description: 'Comisión 10%', rate: 10, netValue: 1000, vatValue: 190 }],
    })
    expect(doc.items[0].settledDocumentType).toBe('33')
    expect(doc.commissions).toEqual([{ lineNumber: 1, kind: 'commission', description: 'Comisión 10%', rate: 10, netValue: 1000, vatValue: 190 }])
    expectError(() => createDocument({ type: 43, folio: 1, issuer, receiver, items: [{ name: 'X', unitPrice: 1 }] }), 'MISSING_FIELD', { field: 'items[0].settledDocumentType' })
  })

  test('line with explicit amount and reference fields', () => {
    const doc = createDocument({ type: 52, folio: 1, issuer, receiver, items: [{ name: 'Pallet', quantity: 2, unit: 'UN', amount: 0, codes: [{ type: 'INT1', value: 'P-1' }] }] })
    expect(doc.items[0]).toEqual({ lineNumber: 1, codes: [{ type: 'INT1', value: 'P-1' }], name: 'Pallet', quantity: 2, unit: 'UN', amount: 0 })
    expect(doc.header.totals).toEqual({ vatRate: 19, totalAmount: 0 })
  })

  describe('validation', () => {
    test.each([
      [{ type: 99 }, 'INVALID_DOCUMENT_TYPE', { type: 99 }],
      [{ folio: 0 }, 'INVALID_FOLIO', { folio: 0 }],
      [{ folio: 1.5 }, 'INVALID_FOLIO', { folio: 1.5 }],
      [{ issueDate: '15-11-2026x' }, 'INVALID_DATE', { field: 'issueDate' }],
      [{ issuer: { ...issuer, rut: '76543210-K' } }, 'INVALID_RUT', { field: 'issuer.rut' }],
      [{ issuer: { ...issuer, businessName: '' } }, 'MISSING_FIELD', { field: 'issuer.businessName' }],
      [{ issuer: { ...issuer, businessName: 'x'.repeat(101) } }, 'FIELD_TOO_LONG', { field: 'RznSoc', maxLength: 100 }],
      [{ receiver: undefined }, 'MISSING_FIELD', { field: 'receiver' }],
      [{ receiver: { ...receiver, address: undefined } }, 'MISSING_FIELD', { field: 'receiver.address' }],
      [{ receiver: { ...receiver, businessActivity: 'x'.repeat(41) } }, 'FIELD_TOO_LONG', { field: 'GiroRecep', maxLength: 40 }],
      [{ items: [] }, 'MISSING_FIELD', { field: 'items' }],
      [{ items: [{ name: '', unitPrice: 1 }] }, 'MISSING_FIELD', { field: 'items[0].name' }],
      [{ items: [{ name: 'x'.repeat(81), unitPrice: 1 }] }, 'FIELD_TOO_LONG', { field: 'NmbItem', maxLength: 80, length: 81 }],
      [{ items: [{ name: 'ok', unitPrice: Number.NaN }] }, 'INVALID_AMOUNT', { field: 'items[0].unitPrice' }],
      [{ items: [{ name: 'ok', quantity: Infinity }] }, 'INVALID_AMOUNT', { field: 'items[0].quantity' }],
      [{ references: [{ documentType: 33, folio: 1, date: 'ayer' }] }, 'INVALID_DATE', { field: 'references[0].date' }],
      [{ references: [{ documentType: 33, folio: 1, date: '2026-01-01', reason: 'x'.repeat(91) }] }, 'FIELD_TOO_LONG', { field: 'RazonRef' }],
      [{ transport: { carrierRut: 'nope' } }, 'INVALID_RUT', { field: 'transport.carrierRut' }],
    ] as const)('%p → %s', (override, code, details) => {
      expectError(() => createDocument({ type: 33, folio: 1, issueDate: '2026-11-15', issuer, receiver, items, ...override }), code, details)
    })
  })

  test('FIELD_LIMITS exposes the schema limits used', () => {
    expect(FIELD_LIMITS.NmbItem).toBe(80)
    expect(FIELD_LIMITS.RznSoc).toBe(100)
    expect(FIELD_LIMITS.GiroRecep).toBe(40)
    expect(FIELD_LIMITS.DscItem).toBe(1000)
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest tests/create-document.test.ts`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementación**

`src/document/create.ts`:

```ts
import { FINAL_CONSUMER_RUT, SERVICE_INDICATORS, VAT_RATE } from '../catalogs/codes'
import { isDocumentType, isExemptType, isReceipt, type DocumentType } from '../catalogs/document-types'
import { DteError } from '../errors'
import type {
  CommissionLine,
  CommissionLineInput,
  Document,
  DocumentInput,
  GlobalAdjustment,
  GlobalAdjustmentInput,
  HeaderOptions,
  Issuer,
  IssuerInput,
  LineItem,
  LineItemInput,
  Receiver,
  ReceiverInput,
  Reference,
  ReferenceInput,
  Transport,
  TransportInput,
} from '../model/document'
import { toSiiRut } from '../model/rut'
import { assertMaxLength, sanitizeText } from '../text/sanitize'
import { chileDate, toIsoDate } from '../time/chile'
import { calculateLineAmount, calculateTotals } from '../totals/calculate'

/**
 * EN: `xs:maxLength` of the SII schema per element; `createDocument` enforces them on sanitized text.
 * ES: `xs:maxLength` del esquema del SII por elemento; `createDocument` los exige sobre el texto ya sanitizado.
 */
export const FIELD_LIMITS = {
  RznSoc: 100,
  GiroEmis: 80,
  DirOrigen: 70,
  CmnaOrigen: 20,
  CiudadOrigen: 20,
  Sucursal: 20,
  CdgVendedor: 60,
  RznSocRecep: 100,
  GiroRecep: 40,
  Contacto: 80,
  CorreoRecep: 80,
  DirRecep: 70,
  CmnaRecep: 20,
  CiudadRecep: 20,
  DirPostal: 70,
  CmnaPostal: 20,
  CiudadPostal: 20,
  CdgIntRecep: 20,
  NmbItem: 80,
  DscItem: 1000,
  UnmdItem: 4,
  UnmdRef: 4,
  TpoDocLiq: 3,
  RazonRef: 90,
  GlosaDR: 45,
  Glosa: 60,
  GlosaSTI: 40,
  Patente: 8,
  NombreChofer: 30,
  DirDest: 70,
  CmnaDest: 20,
  CiudadDest: 20,
} as const

type LimitedField = keyof typeof FIELD_LIMITS

/**
 * EN: Options of `createDocument`.
 * ES: Opciones de `createDocument`.
 */
export type CreateDocumentOptions = {
  /** EN: Clock for the default issue date (tests). ES: Reloj para la fecha de emisión por defecto (tests). */
  readonly now?: Date
}

// Sanitizes a text field, enforces its schema limit and returns undefined for empty optionals.
const text = (value: string | undefined, field: LimitedField): string | undefined => {
  if (value === undefined) return undefined
  const clean = sanitizeText(value)
  if (clean === '') return undefined
  assertMaxLength(clean, FIELD_LIMITS[field], field)
  return clean
}

const requiredText = (value: string | undefined, field: LimitedField, path: string): string => {
  const clean = text(value, field)
  if (clean === undefined) throw new DteError('MISSING_FIELD', { field: path })
  return clean
}

const finiteNumber = (value: number | undefined, path: string): number | undefined => {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new DteError('INVALID_AMOUNT', { field: path })
  return value
}

const compact = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T

const normalizeIssuer = (input: IssuerInput): Issuer => {
  const commune = requiredText(input.commune, 'CmnaOrigen', 'issuer.commune')
  return compact({
    rut: toSiiRut(input.rut, 'issuer.rut'),
    businessName: requiredText(input.businessName, 'RznSoc', 'issuer.businessName'),
    businessActivity: requiredText(input.businessActivity, 'GiroEmis', 'issuer.businessActivity'),
    activityCode: input.activityCode,
    phone: input.phone,
    email: input.email,
    branch: text(input.branch, 'Sucursal'),
    siiBranchCode: input.siiBranchCode,
    address: requiredText(input.address, 'DirOrigen', 'issuer.address'),
    commune,
    city: text(input.city, 'CiudadOrigen') ?? commune,
    salespersonCode: text(input.salespersonCode, 'CdgVendedor'),
  })
}

const FINAL_CONSUMER: Receiver = {
  rut: toSiiRut(FINAL_CONSUMER_RUT),
  businessName: 'Consumidor Final',
  address: 'Sin Direccion',
  commune: 'Santiago',
}

const normalizeReceiver = (input: ReceiverInput | undefined, receipt: boolean): Receiver => {
  if (input === undefined) {
    if (receipt) return FINAL_CONSUMER
    throw new DteError('MISSING_FIELD', { field: 'receiver' })
  }
  const address = text(input.address, 'DirRecep')
  const commune = text(input.commune, 'CmnaRecep')
  if (!receipt && address === undefined) throw new DteError('MISSING_FIELD', { field: 'receiver.address' })
  if (!receipt && commune === undefined) throw new DteError('MISSING_FIELD', { field: 'receiver.commune' })
  return compact({
    rut: toSiiRut(input.rut, 'receiver.rut'),
    internalCode: text(input.internalCode, 'CdgIntRecep'),
    businessName: requiredText(input.businessName, 'RznSocRecep', 'receiver.businessName'),
    businessActivity: text(input.businessActivity, 'GiroRecep'),
    contact: text(input.contact, 'Contacto'),
    email: input.email,
    address,
    commune,
    city: text(input.city, 'CiudadRecep'),
    postalAddress: text(input.postalAddress, 'DirPostal'),
    postalCommune: text(input.postalCommune, 'CmnaPostal'),
    postalCity: text(input.postalCity, 'CiudadPostal'),
  })
}

const normalizeItem = (input: LineItemInput, index: number, type: DocumentType): LineItem => {
  const path = `items[${index}]`
  const quantity = finiteNumber(input.quantity, `${path}.quantity`)
  const unitPrice = finiteNumber(input.unitPrice, `${path}.unitPrice`)
  const discountPercent = finiteNumber(input.discountPercent, `${path}.discountPercent`)
  const surchargePercent = finiteNumber(input.surchargePercent, `${path}.surchargePercent`)
  const computed = calculateLineAmount({ quantity, unitPrice, discountPercent, surchargePercent })
  const settledDocumentType = text(input.settledDocumentType, 'TpoDocLiq')
  if (type === 43 && settledDocumentType === undefined) throw new DteError('MISSING_FIELD', { field: `${path}.settledDocumentType` })
  const exemptIndicator = input.exemptIndicator ?? (input.exempt || isExemptType(type) ? 1 : undefined)
  return compact({
    lineNumber: index + 1,
    codes: input.codes,
    settledDocumentType,
    exemptIndicator,
    name: requiredText(input.name, 'NmbItem', `${path}.name`),
    description: text(input.description, 'DscItem'),
    referenceQuantity: finiteNumber(input.referenceQuantity, `${path}.referenceQuantity`),
    referenceUnit: text(input.referenceUnit, 'UnmdRef'),
    referencePrice: finiteNumber(input.referencePrice, `${path}.referencePrice`),
    quantity,
    unit: text(input.unit, 'UnmdItem'),
    unitPrice,
    discountPercent,
    discountAmount: computed.discountAmount > 0 ? computed.discountAmount : undefined,
    surchargePercent,
    surchargeAmount: computed.surchargeAmount > 0 ? computed.surchargeAmount : undefined,
    additionalTaxCodes: input.additionalTaxCodes,
    amount: finiteNumber(input.amount, `${path}.amount`) ?? computed.amount,
  })
}

const normalizeReference = (input: ReferenceInput, index: number): Reference =>
  compact({
    lineNumber: index + 1,
    documentType: input.documentType,
    global: input.global ? (true as const) : undefined,
    folio: String(input.folio),
    otherRut: input.otherRut === undefined ? undefined : toSiiRut(input.otherRut, `references[${index}].otherRut`),
    date: toIsoDate(input.date, `references[${index}].date`),
    code: input.code,
    reason: text(input.reason, 'RazonRef'),
  })

const normalizeAdjustment = (input: GlobalAdjustmentInput, index: number): GlobalAdjustment =>
  compact({ lineNumber: index + 1, kind: input.kind, valueType: input.valueType, value: input.value, description: text(input.description, 'GlosaDR'), exemptIndicator: input.exemptIndicator })

const normalizeCommission = (input: CommissionLineInput, index: number): CommissionLine =>
  compact({
    lineNumber: index + 1,
    kind: input.kind,
    description: requiredText(input.description, 'Glosa', `commissions[${index}].description`),
    rate: input.rate,
    netValue: input.netValue,
    exemptValue: input.exemptValue,
    vatValue: input.vatValue,
  })

const normalizeTransport = (input: TransportInput | undefined): Transport | undefined =>
  input === undefined
    ? undefined
    : compact({
        licensePlate: text(input.licensePlate, 'Patente'),
        carrierRut: input.carrierRut === undefined ? undefined : toSiiRut(input.carrierRut, 'transport.carrierRut'),
        driver:
          input.driver === undefined
            ? undefined
            : { rut: toSiiRut(input.driver.rut, 'transport.driver.rut'), name: requiredText(input.driver.name, 'NombreChofer', 'transport.driver.name') },
        destinationAddress: text(input.destinationAddress, 'DirDest'),
        destinationCommune: text(input.destinationCommune, 'CmnaDest'),
        destinationCity: text(input.destinationCity, 'CiudadDest'),
      })

/**
 * EN: Builds a normalized `Document` from caller input: validates type, folio and dates, normalizes RUTs with rut.ts,
 * sanitizes text and enforces schema lengths (fails early instead of letting the SII reject the whole envelope),
 * numbers lines, computes amounts and totals, applies receipt defaults (final consumer, `IndServicio=3`) and sets
 * `MntBruto=1` when prices include VAT. Pure: same input, same output.
 * ES: Construye un `Document` normalizado desde la entrada: valida tipo, folio y fechas, normaliza RUT con rut.ts,
 * sanitiza textos y exige los largos del esquema (falla temprano en vez de dejar que el SII rechace el sobre entero),
 * numera líneas, calcula montos y totales, aplica los defaults de boleta (consumidor final, `IndServicio=3`) y fija
 * `MntBruto=1` cuando los precios incluyen IVA. Pura: misma entrada, misma salida.
 * @throws {DteError} EN: `INVALID_DOCUMENT_TYPE`, `INVALID_FOLIO`, `INVALID_DATE`, `INVALID_RUT`, `MISSING_FIELD`, `FIELD_TOO_LONG`, `INVALID_AMOUNT`. ES: los mismos códigos.
 */
export const createDocument = (input: DocumentInput, options: CreateDocumentOptions = {}): Document => {
  if (!isDocumentType(input.type)) throw new DteError('INVALID_DOCUMENT_TYPE', { type: input.type })
  if (!Number.isInteger(input.folio) || input.folio <= 0) throw new DteError('INVALID_FOLIO', { folio: input.folio })
  const type = input.type
  const receipt = isReceipt(type)
  const issueDate = input.issueDate === undefined ? chileDate(options.now) : toIsoDate(input.issueDate, 'issueDate')
  const issuer = normalizeIssuer(input.issuer)
  const receiver = normalizeReceiver(input.receiver, receipt)
  if (input.items.length === 0) throw new DteError('MISSING_FIELD', { field: 'items' })
  const items = input.items.map((item, index) => normalizeItem(item, index, type))
  const references = (input.references ?? []).map(normalizeReference)
  const globalAdjustments = (input.globalAdjustments ?? []).map(normalizeAdjustment)
  const commissions = (input.commissions ?? []).map(normalizeCommission)
  const transport = normalizeTransport(input.transport)
  const totals = input.totals ?? calculateTotals(items, { type, pricesIncludeVat: input.pricesIncludeVat, vatRate: VAT_RATE, globalAdjustments })
  const headerOptions: HeaderOptions = compact({
    ...input.options,
    serviceIndicator: input.options?.serviceIndicator ?? (receipt ? SERVICE_INDICATORS.salesAndServices : undefined),
    grossAmounts: input.options?.grossAmounts ?? (input.pricesIncludeVat && !receipt && (totals.netAmount ?? 0) > 0 ? 1 : undefined),
  })

  return {
    id: `DTE_T${type}F${input.folio}`,
    header: compact({ type, folio: input.folio, issueDate, options: headerOptions, issuer, receiver, transport, totals }),
    items,
    subtotals: input.subtotals ?? [],
    globalAdjustments,
    references,
    commissions,
  }
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest tests/create-document.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/document/create.ts tests/create-document.test.ts
git commit -m "feat: createDocument normalizes, validates and totals a DTE

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Codec dominio ↔ SII (`src/model/codec.ts`)

**Files:**
- Create: `src/model/codec.ts`
- Test: `tests/codec.test.ts`

Orden de claves = orden del XSD (`DTE_v10.xsd` / `EnvioBOLETA_v11.xsd`). Es lo único que garantiza que el XML salga en el orden que el schema exige, porque `fast-xml-parser` serializa en el orden de inserción.

- [ ] **Step 1: Test que falla**

`tests/codec.test.ts`:

```ts
import { toSiiDocument, fromSiiDocument } from '../src/model/codec'
import { createDocument } from '../src/document/create'
import { ISSUER_RUT, RECEIVER_RUT } from './support/fixtures'

const issuer = { rut: ISSUER_RUT, businessName: 'Empresa Ejemplo SpA', businessActivity: 'Software', address: 'Av. Ejemplo 123', commune: 'Santiago', activityCode: 620200, phone: '+56 9 1111 1111', email: 'ventas@ejemplo.cl' }
const receiver = { rut: RECEIVER_RUT, businessName: 'Cliente SA', businessActivity: 'Comercio', address: 'Calle 456', commune: 'Providencia', email: 'pagos@cliente.cl' }

describe('toSiiDocument', () => {
  test('invoice: official tags in schema order', () => {
    const doc = createDocument({
      type: 33,
      folio: 1,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [{ name: 'Servicio', quantity: 2, unitPrice: 1000, description: 'Detalle' }, { name: 'Exento', unitPrice: 500, exempt: true }],
      references: [{ documentType: 801, folio: 'OC-77', date: '2026-11-01', reason: 'Orden de compra' }],
      globalAdjustments: [{ kind: 'discount', valueType: 'percent', value: 10, description: 'Desc.' }],
      options: { paymentTerms: 2, dueDate: '2026-12-15' },
    })
    const sii = toSiiDocument(doc)
    expect(Object.keys(sii)).toEqual(['Encabezado', 'Detalle', 'DscRcgGlobal', 'Referencia'])
    expect(Object.keys(sii.Encabezado)).toEqual(['IdDoc', 'Emisor', 'Receptor', 'Totales'])
    expect(sii.Encabezado.IdDoc).toEqual({ TipoDTE: 33, Folio: 1, FchEmis: '2026-11-15', FmaPago: 2, FchVenc: '2026-12-15' })
    expect(Object.keys(sii.Encabezado.IdDoc)).toEqual(['TipoDTE', 'Folio', 'FchEmis', 'FmaPago', 'FchVenc'])
    expect(sii.Encabezado.Emisor).toEqual({
      RUTEmisor: ISSUER_RUT,
      RznSoc: 'Empresa Ejemplo SpA',
      GiroEmis: 'Software',
      Telefono: '+56 9 1111 1111',
      CorreoEmisor: 'ventas@ejemplo.cl',
      Acteco: 620200,
      DirOrigen: 'Av. Ejemplo 123',
      CmnaOrigen: 'Santiago',
      CiudadOrigen: 'Santiago',
    })
    expect(Object.keys(sii.Encabezado.Emisor)).toEqual(['RUTEmisor', 'RznSoc', 'GiroEmis', 'Telefono', 'CorreoEmisor', 'Acteco', 'DirOrigen', 'CmnaOrigen', 'CiudadOrigen'])
    expect(sii.Encabezado.Receptor).toEqual({ RUTRecep: RECEIVER_RUT, RznSocRecep: 'Cliente SA', GiroRecep: 'Comercio', CorreoRecep: 'pagos@cliente.cl', DirRecep: 'Calle 456', CmnaRecep: 'Providencia' })
    expect(Object.keys(sii.Encabezado.Totales)).toEqual(['MntNeto', 'MntExe', 'TasaIVA', 'IVA', 'MntTotal'])
    expect(sii.Encabezado.Totales).toEqual({ MntNeto: 1800, MntExe: 500, TasaIVA: 19, IVA: 342, MntTotal: 2642 })
    expect(sii.Detalle).toEqual([
      { NroLinDet: 1, NmbItem: 'Servicio', DscItem: 'Detalle', QtyItem: 2, PrcItem: 1000, MontoItem: 2000 },
      { NroLinDet: 2, IndExe: 1, NmbItem: 'Exento', PrcItem: 500, MontoItem: 500 },
    ])
    expect(sii.DscRcgGlobal).toEqual([{ NroLinDR: 1, TpoMov: 'D', GlosaDR: 'Desc.', TpoValor: '%', ValorDR: 10 }])
    expect(sii.Referencia).toEqual([{ NroLinRef: 1, TpoDocRef: 801, FolioRef: 'OC-77', FchRef: '2026-11-01', RazonRef: 'Orden de compra' }])
  })

  test('receipt: boleta tags for the issuer, minimal receiver, no TasaIVA', () => {
    const doc = createDocument({ type: 39, folio: 5, issueDate: '2026-11-15', issuer: { ...issuer, siiBranchCode: 12 }, items: [{ name: 'Café', unitPrice: 1000 }], pricesIncludeVat: true })
    const sii = toSiiDocument(doc)
    expect(sii.Encabezado.IdDoc).toEqual({ TipoDTE: 39, Folio: 5, FchEmis: '2026-11-15', IndServicio: 3 })
    expect(sii.Encabezado.Emisor).toEqual({
      RUTEmisor: ISSUER_RUT,
      RznSocEmisor: 'Empresa Ejemplo SpA',
      GiroEmisor: 'Software',
      CdgSIISucur: 12,
      DirOrigen: 'Av. Ejemplo 123',
      CmnaOrigen: 'Santiago',
      CiudadOrigen: 'Santiago',
    })
    expect(sii.Encabezado.Receptor).toEqual({ RUTRecep: '66666666-6', RznSocRecep: 'Consumidor Final', DirRecep: 'Sin Direccion', CmnaRecep: 'Santiago' })
    expect(sii.Encabezado.Totales).toEqual({ MntNeto: 840, IVA: 160, MntTotal: 1000 })
  })

  test('gross invoice emits MntBruto after IndServicio', () => {
    const doc = createDocument({ type: 33, folio: 1, issueDate: '2026-11-15', issuer, receiver, items: [{ name: 'P', unitPrice: 1000 }], pricesIncludeVat: true, options: { serviceIndicator: 3 } })
    expect(Object.keys(toSiiDocument(doc).Encabezado.IdDoc)).toEqual(['TipoDTE', 'Folio', 'FchEmis', 'IndServicio', 'MntBruto'])
  })

  test('dispatch guide with transport, purchase invoice with withholding, settlement invoice with commissions', () => {
    const guide = createDocument({
      type: 52,
      folio: 3,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [{ name: 'Pallet', quantity: 1, unitPrice: 1000 }],
      options: { transferType: 1, dispatchType: 2 },
      transport: { licensePlate: 'ABCD12', carrierRut: RECEIVER_RUT, driver: { rut: RECEIVER_RUT, name: 'Juan' }, destinationAddress: 'Bodega', destinationCommune: 'Maipú', destinationCity: 'Santiago' },
    })
    const guideSii = toSiiDocument(guide)
    expect(Object.keys(guideSii.Encabezado)).toEqual(['IdDoc', 'Emisor', 'Receptor', 'Transporte', 'Totales'])
    expect(guideSii.Encabezado.IdDoc).toEqual({ TipoDTE: 52, Folio: 3, FchEmis: '2026-11-15', TipoDespacho: 2, IndTraslado: 1 })
    expect(guideSii.Encabezado.Transporte).toEqual({ Patente: 'ABCD12', RUTTrans: RECEIVER_RUT, Chofer: { RUTChofer: RECEIVER_RUT, NombreChofer: 'Juan' }, DirDest: 'Bodega', CmnaDest: 'Maipú', CiudadDest: 'Santiago' })

    const purchase = createDocument({ type: 46, folio: 2, issueDate: '2026-11-15', issuer, receiver, items: [{ name: 'Compra', unitPrice: 1000 }] })
    expect(toSiiDocument(purchase).Encabezado.Totales).toEqual({ MntNeto: 1000, TasaIVA: 19, IVA: 190, ImptoReten: [{ TipoImp: 15, TasaImp: 19, MontoImp: 190 }], MntTotal: 1000 })

    const settlement = createDocument({
      type: 43,
      folio: 4,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [{ name: 'Venta', unitPrice: 10000, settledDocumentType: '33' }],
      commissions: [{ kind: 'commission', description: 'Comisión', rate: 10, netValue: 1000, vatValue: 190 }],
      totals: { netAmount: 10000, vatRate: 19, vatAmount: 1900, commissions: { netValue: 1000, vatValue: 190 }, totalAmount: 10710 },
    })
    const settlementSii = toSiiDocument(settlement)
    expect(Object.keys(settlementSii)).toEqual(['Encabezado', 'Detalle', 'Comisiones'])
    expect(settlementSii.Detalle[0]).toEqual({ NroLinDet: 1, TpoDocLiq: '33', NmbItem: 'Venta', PrcItem: 10000, MontoItem: 10000 })
    expect(settlementSii.Encabezado.Totales).toEqual({ MntNeto: 10000, TasaIVA: 19, IVA: 1900, Comisiones: { ValComNeto: 1000, ValComIVA: 190 }, MntTotal: 10710 })
    expect(settlementSii.Comisiones).toEqual([{ NroLinCom: 1, TipoMovim: 'C', Glosa: 'Comisión', TasaComision: 10, ValComNeto: 1000, ValComIVA: 190 }])
  })

  test('payments, billing period and subtotals', () => {
    const doc = createDocument({
      type: 33,
      folio: 1,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [{ name: 'P', unitPrice: 1000 }],
      options: { payments: [{ date: '2026-12-01', amount: 500, note: 'Cuota 1' }, { date: '2027-01-01', amount: 690 }], billingPeriod: { from: '2026-11-01', to: '2026-11-30' } },
      subtotals: [{ number: 1, description: 'Sub', totalAmount: 1000, lines: [1] }],
    })
    const sii = toSiiDocument(doc)
    expect(sii.Encabezado.IdDoc).toEqual({
      TipoDTE: 33,
      Folio: 1,
      FchEmis: '2026-11-15',
      MntPagos: [{ FchPago: '2026-12-01', MntPago: 500, GlosaPagos: 'Cuota 1' }, { FchPago: '2027-01-01', MntPago: 690 }],
      PeriodoDesde: '2026-11-01',
      PeriodoHasta: '2026-11-30',
    })
    expect(Object.keys(sii)).toEqual(['Encabezado', 'Detalle', 'SubTotInfo'])
    expect(sii.SubTotInfo).toEqual([{ NroSTI: 1, GlosaSTI: 'Sub', ValSubtotSTI: 1000, LineasDeta: [1] }])
  })
})

describe('fromSiiDocument', () => {
  test('round-trips what toSiiDocument produces', () => {
    const inputs = [
      createDocument({ type: 33, folio: 1, issueDate: '2026-11-15', issuer, receiver, items: [{ name: 'A', quantity: 2, unitPrice: 10, discountPercent: 10 }, { name: 'B', unitPrice: 5, exempt: true }], references: [{ documentType: 'SET', folio: 1, date: '2026-11-15', reason: 'CASO 1' }], globalAdjustments: [{ kind: 'surcharge', valueType: 'amount', value: 3 }], options: { paymentTerms: 1 } }),
      createDocument({ type: 39, folio: 2, issueDate: '2026-11-15', issuer, items: [{ name: 'C', unitPrice: 100 }], pricesIncludeVat: true }),
      createDocument({ type: 61, folio: 3, issueDate: '2026-11-15', issuer, receiver, items: [{ name: 'D', unitPrice: 100 }], references: [{ documentType: 33, folio: 1, date: '2026-11-01', code: 1, reason: 'Anula', global: true }] }),
      createDocument({ type: 52, folio: 4, issueDate: '2026-11-15', issuer, receiver, items: [{ name: 'E', quantity: 1, unit: 'UN', amount: 0 }], options: { transferType: 5 }, transport: { licensePlate: 'XX1234', driver: { rut: RECEIVER_RUT, name: 'Ana' } } }),
      createDocument({ type: 43, folio: 5, issueDate: '2026-11-15', issuer, receiver, items: [{ name: 'F', unitPrice: 100, settledDocumentType: '39' }], commissions: [{ kind: 'otherCharge', description: 'Flete', netValue: 10 }] }),
    ]
    for (const doc of inputs) {
      expect(fromSiiDocument(toSiiDocument(doc))).toEqual(doc)
    }
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest tests/codec.test.ts`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementación**

`src/model/codec.ts`:

```ts
import { isReceipt, type DocumentType } from '../catalogs/document-types'
import type { ExemptIndicator, ReferenceCode } from '../catalogs/codes'
import type {
  CommissionLine,
  Document,
  GlobalAdjustment,
  Header,
  HeaderOptions,
  Issuer,
  LineItem,
  Receiver,
  Reference,
  SubtotalInfo,
  Totals,
  Transport,
} from './document'
import { toSiiRut } from './rut'
import type {
  SiiComisiones,
  SiiDetalle,
  SiiDocumento,
  SiiDscRcgGlobal,
  SiiEmisor,
  SiiIdDoc,
  SiiReceptor,
  SiiReferencia,
  SiiSubTotInfo,
  SiiTotales,
  SiiTransporte,
} from './sii'

// Drops undefined values while keeping insertion order (the XML element order).
const compact = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T

const toSiiIdDoc = (header: Header): SiiIdDoc => {
  const o = header.options
  return compact({
    TipoDTE: header.type,
    Folio: header.folio,
    FchEmis: header.issueDate,
    IndNoRebaja: o.noDebitReduction,
    TipoDespacho: o.dispatchType,
    IndTraslado: o.transferType,
    TpoImpresion: o.printFormat,
    IndServicio: o.serviceIndicator,
    MntBruto: o.grossAmounts,
    TpoTranCompra: o.purchaseTransactionType,
    TpoTranVenta: o.saleTransactionType,
    FmaPago: o.paymentTerms,
    FmaPagExp: o.exportPaymentTerms,
    FchCancel: o.settlementDate,
    MntCancel: o.settledAmount,
    SaldoInsol: o.outstandingBalance,
    MntPagos: o.payments?.map((payment) => compact({ FchPago: payment.date, MntPago: payment.amount, GlosaPagos: payment.note })),
    PeriodoDesde: o.billingPeriod?.from,
    PeriodoHasta: o.billingPeriod?.to,
    MedioPago: o.paymentMedium,
    TpoCtaPago: o.paymentAccountType,
    NumCtaPago: o.paymentAccountNumber,
    BcoPago: o.paymentBank,
    TermPagoCdg: o.paymentTermsCode,
    TermPagoGlosa: o.paymentTermsNote,
    TermPagoDias: o.paymentTermsDays,
    FchVenc: o.dueDate,
    IndMntNeto: o.netAmountsIndicator,
  })
}

const toSiiEmisor = (issuer: Issuer, receipt: boolean): SiiEmisor =>
  receipt
    ? compact({
        RUTEmisor: issuer.rut,
        RznSocEmisor: issuer.businessName,
        GiroEmisor: issuer.businessActivity,
        Sucursal: issuer.branch,
        CdgSIISucur: issuer.siiBranchCode,
        DirOrigen: issuer.address,
        CmnaOrigen: issuer.commune,
        CiudadOrigen: issuer.city,
      })
    : compact({
        RUTEmisor: issuer.rut,
        RznSoc: issuer.businessName,
        GiroEmis: issuer.businessActivity,
        Telefono: issuer.phone,
        CorreoEmisor: issuer.email,
        Acteco: issuer.activityCode,
        Sucursal: issuer.branch,
        CdgSIISucur: issuer.siiBranchCode,
        DirOrigen: issuer.address,
        CmnaOrigen: issuer.commune,
        CiudadOrigen: issuer.city,
        CdgVendedor: issuer.salespersonCode,
      })

const toSiiReceptor = (receiver: Receiver, receipt: boolean): SiiReceptor =>
  receipt
    ? compact({
        RUTRecep: receiver.rut,
        CdgIntRecep: receiver.internalCode,
        RznSocRecep: receiver.businessName,
        Contacto: receiver.contact,
        DirRecep: receiver.address,
        CmnaRecep: receiver.commune,
        CiudadRecep: receiver.city,
      })
    : compact({
        RUTRecep: receiver.rut,
        CdgIntRecep: receiver.internalCode,
        RznSocRecep: receiver.businessName,
        GiroRecep: receiver.businessActivity,
        Contacto: receiver.contact,
        CorreoRecep: receiver.email,
        DirRecep: receiver.address,
        CmnaRecep: receiver.commune,
        CiudadRecep: receiver.city,
        DirPostal: receiver.postalAddress,
        CmnaPostal: receiver.postalCommune,
        CiudadPostal: receiver.postalCity,
      })

const toSiiTransporte = (transport: Transport | undefined): SiiTransporte | undefined =>
  transport === undefined
    ? undefined
    : compact({
        Patente: transport.licensePlate,
        RUTTrans: transport.carrierRut,
        Chofer: transport.driver === undefined ? undefined : { RUTChofer: transport.driver.rut, NombreChofer: transport.driver.name },
        DirDest: transport.destinationAddress,
        CmnaDest: transport.destinationCommune,
        CiudadDest: transport.destinationCity,
      })

const toSiiTotales = (totals: Totals): SiiTotales =>
  compact({
    MntNeto: totals.netAmount,
    MntExe: totals.exemptAmount,
    TasaIVA: totals.vatRate,
    IVA: totals.vatAmount,
    IVAProp: totals.ownVatAmount,
    IVATerc: totals.thirdPartyVatAmount,
    ImptoReten: totals.withholdings?.map((w) => ({ TipoImp: w.taxCode, TasaImp: w.rate, MontoImp: w.amount })),
    Comisiones:
      totals.commissions === undefined
        ? undefined
        : compact({ ValComNeto: totals.commissions.netValue, ValComExe: totals.commissions.exemptValue, ValComIVA: totals.commissions.vatValue }),
    MntTotal: totals.totalAmount,
    MontoNF: totals.nonBillableAmount,
    MontoPeriodo: totals.periodAmount,
    SaldoAnterior: totals.previousBalance,
    VlrPagar: totals.amountDue,
  })

const toSiiDetalle = (item: LineItem): SiiDetalle =>
  compact({
    NroLinDet: item.lineNumber,
    CdgItem: item.codes?.map((code) => ({ TpoCodigo: code.type, VlrCodigo: code.value })),
    TpoDocLiq: item.settledDocumentType,
    IndExe: item.exemptIndicator,
    NmbItem: item.name,
    DscItem: item.description,
    QtyRef: item.referenceQuantity,
    UnmdRef: item.referenceUnit,
    PrcRef: item.referencePrice,
    QtyItem: item.quantity,
    UnmdItem: item.unit,
    PrcItem: item.unitPrice,
    DescuentoPct: item.discountPercent,
    DescuentoMonto: item.discountAmount,
    RecargoPct: item.surchargePercent,
    RecargoMonto: item.surchargeAmount,
    CodImpAdic: item.additionalTaxCodes,
    MontoItem: item.amount,
  })

const toSiiSubTotInfo = (subtotal: SubtotalInfo): SiiSubTotInfo =>
  compact({
    NroSTI: subtotal.number,
    GlosaSTI: subtotal.description,
    OrdenSTI: subtotal.order,
    SubTotNetoSTI: subtotal.netAmount,
    SubTotIVASTI: subtotal.vatAmount,
    SubTotAdicSTI: subtotal.additionalTaxAmount,
    SubTotExeSTI: subtotal.exemptAmount,
    ValSubtotSTI: subtotal.totalAmount,
    LineasDeta: subtotal.lines,
  })

const toSiiDscRcgGlobal = (adjustment: GlobalAdjustment): SiiDscRcgGlobal =>
  compact({
    NroLinDR: adjustment.lineNumber,
    TpoMov: adjustment.kind === 'discount' ? 'D' : 'R',
    GlosaDR: adjustment.description,
    TpoValor: adjustment.valueType === 'percent' ? '%' : '$',
    ValorDR: adjustment.value,
    IndExeDR: adjustment.exemptIndicator,
  })

const toSiiReferencia = (reference: Reference): SiiReferencia =>
  compact({
    NroLinRef: reference.lineNumber,
    TpoDocRef: reference.documentType,
    IndGlobal: reference.global ? 1 : undefined,
    FolioRef: reference.folio,
    RUTOtr: reference.otherRut,
    FchRef: reference.date,
    CodRef: reference.code,
    RazonRef: reference.reason,
  })

const toSiiComisiones = (line: CommissionLine): SiiComisiones =>
  compact({
    NroLinCom: line.lineNumber,
    TipoMovim: line.kind === 'commission' ? 'C' : 'O',
    Glosa: line.description,
    TasaComision: line.rate,
    ValComNeto: line.netValue,
    ValComExe: line.exemptValue,
    ValComIVA: line.vatValue,
  })

const nonEmpty = <T>(list: readonly T[]): readonly T[] | undefined => (list.length > 0 ? list : undefined)

/**
 * EN: Maps a domain `Document` to the SII-shaped structure (official tags, schema order). This is the only place
 * that knows the tag names; the XML is always rendered from its output.
 * ES: Convierte un `Document` de dominio a la estructura SII (etiquetas oficiales, orden del esquema). Es el único
 * lugar que conoce los nombres de etiqueta; el XML siempre se renderiza desde su salida.
 */
export const toSiiDocument = (doc: Document): SiiDocumento => {
  const receipt = isReceipt(doc.header.type)
  return compact({
    Encabezado: compact({
      IdDoc: toSiiIdDoc(doc.header),
      Emisor: toSiiEmisor(doc.header.issuer, receipt),
      Receptor: toSiiReceptor(doc.header.receiver, receipt),
      Transporte: toSiiTransporte(doc.header.transport),
      Totales: toSiiTotales(doc.header.totals),
    }),
    Detalle: doc.items.map(toSiiDetalle),
    SubTotInfo: nonEmpty(doc.subtotals.map(toSiiSubTotInfo)),
    DscRcgGlobal: nonEmpty(doc.globalAdjustments.map(toSiiDscRcgGlobal)),
    Referencia: nonEmpty(doc.references.map(toSiiReferencia)),
    Comisiones: nonEmpty(doc.commissions.map(toSiiComisiones)),
  })
}

const fromSiiIdDoc = (idDoc: SiiIdDoc): HeaderOptions =>
  compact({
    noDebitReduction: idDoc.IndNoRebaja as 1 | undefined,
    dispatchType: idDoc.TipoDespacho as HeaderOptions['dispatchType'],
    transferType: idDoc.IndTraslado as HeaderOptions['transferType'],
    printFormat: idDoc.TpoImpresion as HeaderOptions['printFormat'],
    serviceIndicator: idDoc.IndServicio as HeaderOptions['serviceIndicator'],
    grossAmounts: idDoc.MntBruto as 1 | undefined,
    purchaseTransactionType: idDoc.TpoTranCompra,
    saleTransactionType: idDoc.TpoTranVenta,
    paymentTerms: idDoc.FmaPago as HeaderOptions['paymentTerms'],
    exportPaymentTerms: idDoc.FmaPagExp,
    settlementDate: idDoc.FchCancel,
    settledAmount: idDoc.MntCancel,
    outstandingBalance: idDoc.SaldoInsol,
    payments: idDoc.MntPagos?.map((p) => compact({ date: p.FchPago, amount: p.MntPago, note: p.GlosaPagos })),
    billingPeriod: idDoc.PeriodoDesde !== undefined && idDoc.PeriodoHasta !== undefined ? { from: idDoc.PeriodoDesde, to: idDoc.PeriodoHasta } : undefined,
    paymentMedium: idDoc.MedioPago,
    paymentAccountType: idDoc.TpoCtaPago,
    paymentAccountNumber: idDoc.NumCtaPago,
    paymentBank: idDoc.BcoPago,
    paymentTermsCode: idDoc.TermPagoCdg,
    paymentTermsNote: idDoc.TermPagoGlosa,
    paymentTermsDays: idDoc.TermPagoDias,
    dueDate: idDoc.FchVenc,
    netAmountsIndicator: idDoc.IndMntNeto,
  })

const fromSiiEmisor = (emisor: SiiEmisor): Issuer =>
  compact({
    rut: toSiiRut(emisor.RUTEmisor, 'Emisor.RUTEmisor'),
    businessName: emisor.RznSoc ?? emisor.RznSocEmisor ?? '',
    businessActivity: emisor.GiroEmis ?? emisor.GiroEmisor ?? '',
    activityCode: emisor.Acteco,
    phone: emisor.Telefono,
    email: emisor.CorreoEmisor,
    branch: emisor.Sucursal,
    siiBranchCode: emisor.CdgSIISucur,
    address: emisor.DirOrigen,
    commune: emisor.CmnaOrigen,
    city: emisor.CiudadOrigen,
    salespersonCode: emisor.CdgVendedor,
  })

const fromSiiReceptor = (receptor: SiiReceptor): Receiver =>
  compact({
    rut: toSiiRut(receptor.RUTRecep, 'Receptor.RUTRecep'),
    internalCode: receptor.CdgIntRecep,
    businessName: receptor.RznSocRecep,
    businessActivity: receptor.GiroRecep,
    contact: receptor.Contacto,
    email: receptor.CorreoRecep,
    address: receptor.DirRecep,
    commune: receptor.CmnaRecep,
    city: receptor.CiudadRecep,
    postalAddress: receptor.DirPostal,
    postalCommune: receptor.CmnaPostal,
    postalCity: receptor.CiudadPostal,
  })

const fromSiiTransporte = (transporte: SiiTransporte | undefined): Transport | undefined =>
  transporte === undefined
    ? undefined
    : compact({
        licensePlate: transporte.Patente,
        carrierRut: transporte.RUTTrans === undefined ? undefined : toSiiRut(transporte.RUTTrans, 'Transporte.RUTTrans'),
        driver: transporte.Chofer === undefined ? undefined : { rut: toSiiRut(transporte.Chofer.RUTChofer, 'Transporte.Chofer.RUTChofer'), name: transporte.Chofer.NombreChofer },
        destinationAddress: transporte.DirDest,
        destinationCommune: transporte.CmnaDest,
        destinationCity: transporte.CiudadDest,
      })

const fromSiiTotales = (totales: SiiTotales): Totals =>
  compact({
    netAmount: totales.MntNeto,
    exemptAmount: totales.MntExe,
    vatRate: totales.TasaIVA,
    vatAmount: totales.IVA,
    ownVatAmount: totales.IVAProp,
    thirdPartyVatAmount: totales.IVATerc,
    withholdings: totales.ImptoReten?.map((r) => ({ taxCode: r.TipoImp, rate: r.TasaImp, amount: r.MontoImp })),
    commissions:
      totales.Comisiones === undefined
        ? undefined
        : compact({ netValue: totales.Comisiones.ValComNeto, exemptValue: totales.Comisiones.ValComExe, vatValue: totales.Comisiones.ValComIVA }),
    totalAmount: totales.MntTotal,
    nonBillableAmount: totales.MontoNF,
    periodAmount: totales.MontoPeriodo,
    previousBalance: totales.SaldoAnterior,
    amountDue: totales.VlrPagar,
  })

const fromSiiDetalle = (detalle: SiiDetalle): LineItem =>
  compact({
    lineNumber: detalle.NroLinDet,
    codes: detalle.CdgItem?.map((code) => ({ type: code.TpoCodigo, value: code.VlrCodigo })),
    settledDocumentType: detalle.TpoDocLiq,
    exemptIndicator: detalle.IndExe as ExemptIndicator | undefined,
    name: detalle.NmbItem,
    description: detalle.DscItem,
    referenceQuantity: detalle.QtyRef,
    referenceUnit: detalle.UnmdRef,
    referencePrice: detalle.PrcRef,
    quantity: detalle.QtyItem,
    unit: detalle.UnmdItem,
    unitPrice: detalle.PrcItem,
    discountPercent: detalle.DescuentoPct,
    discountAmount: detalle.DescuentoMonto,
    surchargePercent: detalle.RecargoPct,
    surchargeAmount: detalle.RecargoMonto,
    additionalTaxCodes: detalle.CodImpAdic,
    amount: detalle.MontoItem,
  })

const fromSiiSubTotInfo = (subtotal: SiiSubTotInfo): SubtotalInfo =>
  compact({
    number: subtotal.NroSTI,
    description: subtotal.GlosaSTI,
    order: subtotal.OrdenSTI,
    netAmount: subtotal.SubTotNetoSTI,
    vatAmount: subtotal.SubTotIVASTI,
    additionalTaxAmount: subtotal.SubTotAdicSTI,
    exemptAmount: subtotal.SubTotExeSTI,
    totalAmount: subtotal.ValSubtotSTI,
    lines: subtotal.LineasDeta,
  })

const fromSiiDscRcgGlobal = (adjustment: SiiDscRcgGlobal): GlobalAdjustment =>
  compact({
    lineNumber: adjustment.NroLinDR,
    kind: adjustment.TpoMov === 'D' ? ('discount' as const) : ('surcharge' as const),
    valueType: adjustment.TpoValor === '%' ? ('percent' as const) : ('amount' as const),
    value: adjustment.ValorDR,
    description: adjustment.GlosaDR,
    exemptIndicator: adjustment.IndExeDR as 1 | 2 | undefined,
  })

const fromSiiReferencia = (reference: SiiReferencia): Reference =>
  compact({
    lineNumber: reference.NroLinRef,
    documentType: reference.TpoDocRef === 'SET' ? ('SET' as const) : Number(reference.TpoDocRef),
    global: reference.IndGlobal === 1 ? (true as const) : undefined,
    folio: String(reference.FolioRef),
    otherRut: reference.RUTOtr === undefined ? undefined : toSiiRut(reference.RUTOtr, 'Referencia.RUTOtr'),
    date: reference.FchRef,
    code: reference.CodRef as ReferenceCode | undefined,
    reason: reference.RazonRef,
  })

const fromSiiComisiones = (line: SiiComisiones): CommissionLine =>
  compact({
    lineNumber: line.NroLinCom,
    kind: line.TipoMovim === 'C' ? ('commission' as const) : ('otherCharge' as const),
    description: line.Glosa,
    rate: line.TasaComision,
    netValue: line.ValComNeto,
    exemptValue: line.ValComExe,
    vatValue: line.ValComIVA,
  })

/**
 * EN: Maps a SII-shaped document back to the domain model (for received DTEs and interop). RUTs are validated with
 * rut.ts on the way in.
 * ES: Convierte un documento en forma SII al modelo de dominio (para DTE recibidos e interoperabilidad). Los RUT se
 * validan con rut.ts al entrar.
 * @throws {DteError} EN: `INVALID_RUT` when a RUT in the document is not valid. ES: `INVALID_RUT` si un RUT del documento no es válido.
 */
export const fromSiiDocument = (sii: SiiDocumento): Document => {
  const idDoc = sii.Encabezado.IdDoc
  const type = idDoc.TipoDTE as DocumentType
  return {
    id: `DTE_T${type}F${idDoc.Folio}`,
    header: compact({
      type,
      folio: idDoc.Folio,
      issueDate: idDoc.FchEmis,
      options: fromSiiIdDoc(idDoc),
      issuer: fromSiiEmisor(sii.Encabezado.Emisor),
      receiver: fromSiiReceptor(sii.Encabezado.Receptor),
      transport: fromSiiTransporte(sii.Encabezado.Transporte),
      totals: fromSiiTotales(sii.Encabezado.Totales),
    }),
    items: sii.Detalle.map(fromSiiDetalle),
    subtotals: (sii.SubTotInfo ?? []).map(fromSiiSubTotInfo),
    globalAdjustments: (sii.DscRcgGlobal ?? []).map(fromSiiDscRcgGlobal),
    references: (sii.Referencia ?? []).map(fromSiiReferencia),
    commissions: (sii.Comisiones ?? []).map(fromSiiComisiones),
  }
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest tests/codec.test.ts`
Expected: PASS. Si el round-trip difiere en `city` (el emisor normalizado siempre trae `city`), es correcto: `createDocument` lo rellena y el codec lo conserva.

- [ ] **Step 5: Commit**

```bash
git add src/model/codec.ts tests/codec.test.ts
git commit -m "feat: codec between the domain model and the SII-shaped document

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Utilidades XML (`src/xml/escape.ts`, `src/xml/build.ts`, `src/xml/parse.ts`, `src/xml/format.ts`)

**Files:**
- Create: `src/xml/escape.ts`, `src/xml/build.ts`, `src/xml/parse.ts`, `src/xml/format.ts`
- Modify: `tsconfig.json` (`"lib": ["ES2020", "DOM"]`, porque los tipos de `@xmldom/xmldom` 0.8 usan `Document`/`Element` del lib DOM)
- Test: `tests/xml.test.ts`

- [ ] **Step 1: Test que falla**

`tests/xml.test.ts`:

```ts
import { escapeXmlText, escapeXmlAttribute } from '../src/xml/escape'
import { buildXml } from '../src/xml/build'
import { parseXml, parseXmlWithoutNamespaces, parseXmlDom, extractTagContent, decodeXmlEntities } from '../src/xml/parse'
import { wrapBase64, formatBase64Columns } from '../src/xml/format'
import { DteError } from '../src/errors'

describe('escape', () => {
  test('text escapes the five XML entities', () => {
    expect(escapeXmlText(`a & b < c > d "e" 'f'`)).toBe('a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;')
    expect(escapeXmlAttribute(`x"y<z&`)).toBe('x&quot;y&lt;z&amp;')
  })
})

describe('buildXml', () => {
  test('renders attributes, nested objects, arrays and escapes values in insertion order', () => {
    const xml = buildXml({
      DTE: {
        '@_xmlns': 'http://www.sii.cl/SiiDte',
        '@_version': '1.0',
        Documento: {
          '@_ID': 'DTE_T33F1',
          Encabezado: { IdDoc: { TipoDTE: 33, Folio: 1 } },
          Detalle: [{ NroLinDet: 1, NmbItem: "PLC'S & <X>" }, { NroLinDet: 2, NmbItem: 'B' }],
          TED: '__TED__',
        },
      },
    })
    expect(xml).toBe(
      '<DTE xmlns="http://www.sii.cl/SiiDte" version="1.0"><Documento ID="DTE_T33F1"><Encabezado><IdDoc><TipoDTE>33</TipoDTE><Folio>1</Folio></IdDoc></Encabezado><Detalle><NroLinDet>1</NroLinDet><NmbItem>PLC&apos;S &amp; &lt;X&gt;</NmbItem></Detalle><Detalle><NroLinDet>2</NroLinDet><NmbItem>B</NmbItem></Detalle><TED>__TED__</TED></Documento></DTE>',
    )
  })
})

describe('parseXml', () => {
  const caf = '<AUTORIZACION><CAF version="1.0"><DA><RE>76543210-3</RE><TD>33</TD><RNG><D>1</D><H>100</H></RNG><FA>2026-10-31</FA></DA></CAF><RSASK>x</RSASK></AUTORIZACION>'

  test('keeps every value as string and exposes attributes with @_', () => {
    expect(parseXml(caf)).toEqual({
      AUTORIZACION: { CAF: { '@_version': '1.0', DA: { RE: '76543210-3', TD: '33', RNG: { D: '1', H: '100' }, FA: '2026-10-31' } }, RSASK: 'x' },
    })
  })

  test('without namespaces strips SII: prefixes', () => {
    expect(parseXmlWithoutNamespaces('<SII:RESPUESTA xmlns:SII="x"><SII:RESP_BODY><TOKEN>abc</TOKEN></SII:RESP_BODY></SII:RESPUESTA>')).toEqual({
      RESPUESTA: { '@_xmlns:SII': 'x', RESP_BODY: { TOKEN: 'abc' } },
    })
  })

  test('throws XML_PARSE_FAILED on malformed input', () => {
    expect(() => parseXml('<a><b></a>')).toThrow(DteError)
    try {
      parseXml('<a><b></a>')
    } catch (err) {
      expect((err as DteError).code).toBe('XML_PARSE_FAILED')
    }
    expect(() => parseXmlDom('<a><b></a>')).toThrow(DteError)
  })

  test('parseXmlDom returns a DOM with attributes in source order', () => {
    const dom = parseXmlDom('<r xmlns="n"><e b="2" a="1">t&apos;s</e></r>')
    const element = dom.getElementsByTagName('e')[0]
    expect(element.attributes[0].name).toBe('b')
    expect(element.textContent).toBe("t's")
    expect(dom.documentElement.getAttribute('xmlns')).toBe('n')
  })

  test('extractTagContent and decodeXmlEntities', () => {
    expect(extractTagContent('<r><ESTADO>00</ESTADO><SEMILLA>123</SEMILLA></r>', 'SEMILLA')).toBe('123')
    expect(extractTagContent('<r/>', 'SEMILLA')).toBeNull()
    expect(decodeXmlEntities('&lt;a&gt;&quot;x&quot;&apos;y&apos;&amp;')).toBe(`<a>"x"'y'&`)
  })
})

describe('format', () => {
  test('wrapBase64 strips whitespace and wraps at 64', () => {
    const value = 'A'.repeat(130)
    expect(wrapBase64(`${value.slice(0, 10)}\n ${value.slice(10)}`)).toBe(`${'A'.repeat(64)}\n${'A'.repeat(64)}\n${'A'.repeat(2)}`)
    expect(wrapBase64('abc', 2)).toBe('ab\nc')
  })

  test('formatBase64Columns rewraps SignatureValue, Modulus and X509Certificate only', () => {
    const b64 = 'B'.repeat(70)
    const xml = `<Signature><SignatureValue>\n${b64}</SignatureValue><Modulus>${b64}</Modulus><X509Certificate>${b64}</X509Certificate><Other>${b64}</Other></Signature>`
    const out = formatBase64Columns(xml)
    expect(out).toContain(`<SignatureValue>${'B'.repeat(64)}\n${'B'.repeat(6)}</SignatureValue>`)
    expect(out).toContain(`<Modulus>${'B'.repeat(64)}\n${'B'.repeat(6)}</Modulus>`)
    expect(out).toContain(`<X509Certificate>${'B'.repeat(64)}\n${'B'.repeat(6)}</X509Certificate>`)
    expect(out).toContain(`<Other>${b64}</Other>`)
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest tests/xml.test.ts`
Expected: FAIL, módulos no encontrados.

- [ ] **Step 3: Implementación**

En `tsconfig.json`, cambiar `"lib": ["ES2020"]` por `"lib": ["ES2020", "DOM"]`.

`src/xml/escape.ts`:

```ts
/**
 * EN: Escapes a text node value with the five XML entities (`& < > " '`).
 * ES: Escapa el valor de un nodo de texto con las cinco entidades XML (`& < > " '`).
 */
export const escapeXmlText = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/**
 * EN: Escapes an attribute value quoted with double quotes.
 * ES: Escapa el valor de un atributo entre comillas dobles.
 */
export const escapeXmlAttribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
```

`src/xml/build.ts`:

```ts
import { XMLBuilder } from 'fast-xml-parser'

const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: false })

/**
 * EN: Serializes a plain object to compact XML. Keys become elements in insertion order, `@_name` keys become
 * attributes, arrays repeat the element and values are entity-escaped.
 * ES: Serializa un objeto plano a XML compacto. Las claves son elementos en orden de inserción, las claves `@_nombre`
 * son atributos, los arreglos repiten el elemento y los valores se escapan con entidades.
 */
export const buildXml = (value: Readonly<Record<string, unknown>>): string => builder.build(value) as string
```

`src/xml/parse.ts`:

```ts
import { DOMParser } from '@xmldom/xmldom'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { DteError } from '../errors'

/**
 * EN: Result of parsing XML into a plain object: elements become keys, repeated elements become arrays, attributes are
 * `@_name` keys and every value stays a string.
 * ES: Resultado de parsear XML a objeto plano: los elementos son claves, los repetidos son arreglos, los atributos son
 * claves `@_nombre` y todo valor queda como string.
 */
export type ParsedXml = Readonly<Record<string, unknown>>

/**
 * EN: DOM document type returned by `parseXmlDom`.
 * ES: Tipo del documento DOM que devuelve `parseXmlDom`.
 */
export type XmlDocument = ReturnType<DOMParser['parseFromString']>

const base = { ignoreAttributes: false, attributeNamePrefix: '@_', trimValues: true, parseTagValue: false } as const
const objectParser = new XMLParser(base)
const noNamespaceParser = new XMLParser({ ...base, removeNSPrefix: true })

const assertWellFormed = (xml: string): void => {
  const result = XMLValidator.validate(xml)
  if (result !== true) throw new DteError('XML_PARSE_FAILED', { line: result.err.line, column: result.err.col, reason: result.err.msg })
}

/**
 * EN: Parses XML into a plain object (values as strings). Throws `XML_PARSE_FAILED` when not well-formed.
 * ES: Parsea XML a objeto plano (valores como string). Lanza `XML_PARSE_FAILED` si no está bien formado.
 */
export const parseXml = (xml: string): ParsedXml => {
  assertWellFormed(xml)
  return objectParser.parse(xml) as ParsedXml
}

/**
 * EN: Like `parseXml` but drops namespace prefixes (`SII:RESPUESTA` → `RESPUESTA`), handy for SOAP responses.
 * ES: Como `parseXml` pero quita los prefijos de namespace (`SII:RESPUESTA` → `RESPUESTA`), útil para respuestas SOAP.
 */
export const parseXmlWithoutNamespaces = (xml: string): ParsedXml => {
  assertWellFormed(xml)
  return noNamespaceParser.parse(xml) as ParsedXml
}

const failDom = (message: string): never => {
  throw new DteError('XML_PARSE_FAILED', { reason: message })
}

const domParser = new DOMParser({
  locator: {},
  errorHandler: { warning: () => undefined, error: failDom, fatalError: failDom },
})

/**
 * EN: Parses XML into a DOM (needed by canonicalization and signature verification).
 * ES: Parsea XML a un DOM (lo necesitan la canonicalización y la verificación de firmas).
 */
export const parseXmlDom = (xml: string): XmlDocument => {
  assertWellFormed(xml)
  return domParser.parseFromString(xml, 'application/xml')
}

/**
 * EN: Text of the first `<tag>…</tag>` occurrence, or `null`. Regex-based, for flat SII responses.
 * ES: Texto de la primera ocurrencia de `<tag>…</tag>`, o `null`. Por regex, para respuestas planas del SII.
 */
export const extractTagContent = (xml: string, tag: string): string | null => {
  const match = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i').exec(xml)
  return match ? match[1] : null
}

/**
 * EN: Decodes the five XML entities (SOAP responses often embed escaped XML).
 * ES: Decodifica las cinco entidades XML (las respuestas SOAP suelen traer XML escapado).
 */
export const decodeXmlEntities = (xml: string): string =>
  xml.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
```

`src/xml/format.ts`:

```ts
/**
 * EN: Removes whitespace from a base64 string and wraps it at `width` columns.
 * ES: Quita los espacios de un base64 y lo corta en columnas de `width`.
 */
export const wrapBase64 = (value: string, width = 64): string =>
  value
    .replace(/\s+/g, '')
    .replace(new RegExp(`(.{${width}})`, 'g'), '$1\n')
    .trim()

const BASE64_TAGS = ['SignatureValue', 'Modulus', 'X509Certificate'] as const

/**
 * EN: Rewraps `SignatureValue`, `Modulus` and `X509Certificate` at 64 columns, the layout the SII expects.
 * ES: Recorta `SignatureValue`, `Modulus` y `X509Certificate` a 64 columnas, la disposición que espera el SII.
 */
export const formatBase64Columns = (xml: string): string =>
  BASE64_TAGS.reduce(
    (acc, tag) => acc.replace(new RegExp(`<${tag}>([^<]+)</${tag}>`, 'g'), (_match, b64: string) => `<${tag}>${wrapBase64(b64)}</${tag}>`),
    xml,
  )
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest tests/xml.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json src/xml/escape.ts src/xml/build.ts src/xml/parse.ts src/xml/format.ts tests/xml.test.ts
git commit -m "feat: XML build, parse, DOM and base64 formatting helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Canonicalización C14N del subconjunto SII (`src/xml/c14n.ts`)

**Files:**
- Create: `src/xml/c14n.ts`
- Test: `tests/c14n.test.ts`

Reglas de Canonical XML 1.0 que importan aquí: el elemento apex declara **todos** los namespaces en alcance (los hereda de sus ancestros); los hijos omiten un `xmlns` igual al heredado; atributos ordenados (`xmlns` primero, luego `xmlns:*`, luego el resto); en texto se escapan solo `& < >` y `\r` (**nunca** `'` ni `"`: escaparlos cambia el digest y el SII rechaza el sobre completo con `RFR`); los elementos vacíos salen como `<X></X>`; los comentarios se omiten; los saltos de línea entre elementos se conservan como texto.

- [ ] **Step 1: Test que falla**

`tests/c14n.test.ts`:

```ts
import { canonicalizeElement, findElement } from '../src/xml/c14n'
import { parseXmlDom } from '../src/xml/parse'
import { DteError } from '../src/errors'

const NS = 'http://www.sii.cl/SiiDte'
const XSI = 'http://www.w3.org/2001/XMLSchema-instance'
const DSIG = 'http://www.w3.org/2000/09/xmldsig#'

const c14n = (xml: string, tag: string) => canonicalizeElement(findElement(parseXmlDom(xml), tag))

describe('canonicalizeElement', () => {
  test('apex inherits xmlns and xmlns:xsi from the root, then its own attributes', () => {
    const xml = `<DTE xmlns="${NS}" xmlns:xsi="${XSI}" version="1.0"><Documento ID="F1T33"><A>1</A></Documento></DTE>`
    expect(c14n(xml, 'Documento')).toBe(`<Documento xmlns="${NS}" xmlns:xsi="${XSI}" ID="F1T33"><A>1</A></Documento>`)
  })

  test("apostrophe and double quote stay literal in text; & < > and CR are escaped", () => {
    const xml = `<DTE xmlns="${NS}" xmlns:xsi="${XSI}"><Documento ID="X"><NmbItem>CAPACITACION USO PLC&apos;s CNC</NmbItem><Nota>Cable de 3&quot; a &amp; b &lt; c &gt; d&#xD;</Nota></Documento></DTE>`
    const out = c14n(xml, 'Documento')
    expect(out).toContain("PLC's CNC")
    expect(out).toContain('Cable de 3" a &amp; b &lt; c &gt; d&#xD;')
    expect(out).not.toContain('&apos;')
    expect(out).not.toContain('&quot;')
  })

  test('children omit an xmlns equal to the inherited one and keep a different one', () => {
    const xml = `<EnvioDTE xmlns="${NS}" xmlns:xsi="${XSI}" version="1.0"><SetDTE ID="S"><DTE xmlns="${NS}" xmlns:xsi="${XSI}" version="1.0"><Documento ID="D"><A>1</A></Documento><Signature xmlns="${DSIG}"><SignedInfo><X/></SignedInfo></Signature></DTE></SetDTE></EnvioDTE>`
    expect(c14n(xml, 'SetDTE')).toBe(
      `<SetDTE xmlns="${NS}" xmlns:xsi="${XSI}" ID="S"><DTE version="1.0"><Documento ID="D"><A>1</A></Documento><Signature xmlns="${DSIG}"><SignedInfo><X></X></SignedInfo></Signature></DTE></SetDTE>`,
    )
  })

  test('nested SignedInfo gets dsig xmlns from Signature and xmlns:xsi from the root', () => {
    const xml = `<DTE xmlns="${NS}" xmlns:xsi="${XSI}"><Documento ID="D"/><Signature xmlns="${DSIG}"><SignedInfo><CanonicalizationMethod Algorithm="c"/></SignedInfo></Signature></DTE>`
    expect(c14n(xml, 'SignedInfo')).toBe(`<SignedInfo xmlns="${DSIG}" xmlns:xsi="${XSI}"><CanonicalizationMethod Algorithm="c"></CanonicalizationMethod></SignedInfo>`)
  })

  test('attributes are sorted: xmlns, xmlns:*, then by name; values are escaped', () => {
    const xml = `<r xmlns="n"><e z="1" a="x&quot;y&lt;" xmlns:b="B"><f xmlns:a="A" xmlns:b="B"/></e></r>`
    expect(c14n(xml, 'e')).toBe('<e xmlns="n" xmlns:b="B" a="x&quot;y&lt;" z="1"><f xmlns:a="A"></f></e>')
  })

  test('keeps newline text nodes, treats CDATA as text and drops comments', () => {
    const xml = `<r><d><![CDATA[a<b]]><!-- no -->\n<x/></d></r>`
    expect(c14n(xml, 'd')).toBe('<d>a&lt;b\n<x></x></d>')
  })

  test('digest-relevant output is stable for plain content', () => {
    const xml = `<DTE xmlns="${NS}" xmlns:xsi="${XSI}"><Documento ID="F2T33"><Detalle><NmbItem>Panuelo AFECTO</NmbItem><Extra>a &amp; b &lt; c</Extra></Detalle></Documento></DTE>`
    expect(c14n(xml, 'Documento')).toBe(`<Documento xmlns="${NS}" xmlns:xsi="${XSI}" ID="F2T33"><Detalle><NmbItem>Panuelo AFECTO</NmbItem><Extra>a &amp; b &lt; c</Extra></Detalle></Documento>`)
  })

  test('findElement throws when the tag is missing', () => {
    expect(() => findElement(parseXmlDom('<a/>'), 'b')).toThrow(DteError)
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest tests/c14n.test.ts`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementación**

`src/xml/c14n.ts`:

```ts
import { DteError } from '../errors'
import type { XmlDocument } from './parse'

const ELEMENT_NODE = 1
const TEXT_NODE = 3
const CDATA_NODE = 4

const canonicalText = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;')

const canonicalAttribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/\t/g, '&#x9;').replace(/\n/g, '&#xA;').replace(/\r/g, '&#xD;')

const isNamespaceDeclaration = (name: string): boolean => name === 'xmlns' || name.startsWith('xmlns:')

// xmlns first, then xmlns:* by name, then the rest by name (code point order).
const compareAttributeNames = (a: string, b: string): number => {
  if (a === b) return 0
  if (a === 'xmlns') return -1
  if (b === 'xmlns') return 1
  const aNs = a.startsWith('xmlns:')
  const bNs = b.startsWith('xmlns:')
  if (aNs !== bNs) return aNs ? -1 : 1
  return a < b ? -1 : 1
}

type NamespaceScope = ReadonlyMap<string, string>

const ownAttributes = (element: Element): readonly Attr[] => Array.from(element.attributes)

const renderAttributes = (attributes: readonly { readonly name: string; readonly value: string }[]): string =>
  [...attributes]
    .sort((a, b) => compareAttributeNames(a.name, b.name))
    .map((attribute) => ` ${attribute.name}="${canonicalAttribute(attribute.value)}"`)
    .join('')

const serializeNode = (node: Node, inherited: NamespaceScope): string => {
  if (node.nodeType === TEXT_NODE || node.nodeType === CDATA_NODE) return canonicalText(node.nodeValue ?? '')
  if (node.nodeType !== ELEMENT_NODE) return ''
  const element = node as Element
  const scope = new Map(inherited)
  const attributes = ownAttributes(element).filter((attribute) => {
    if (!isNamespaceDeclaration(attribute.name)) return true
    if (scope.get(attribute.name) === attribute.value) return false
    scope.set(attribute.name, attribute.value)
    return true
  })
  const children = Array.from(element.childNodes)
    .map((child) => serializeNode(child, scope))
    .join('')
  return `<${element.tagName}${renderAttributes(attributes)}>${children}</${element.tagName}>`
}

// Namespace declarations in scope at `element`, nearest ancestor winning, including the element's own.
const namespacesInScope = (element: Element): Map<string, string> => {
  const chain: Element[] = []
  for (let current: Node | null = element; current !== null && current.nodeType === ELEMENT_NODE; current = current.parentNode) {
    chain.unshift(current as Element)
  }
  const scope = new Map<string, string>()
  for (const ancestor of chain) {
    for (const attribute of ownAttributes(ancestor)) {
      if (isNamespaceDeclaration(attribute.name)) scope.set(attribute.name, attribute.value)
    }
  }
  return scope
}

/**
 * EN: First element with that tag name, or `XML_PARSE_FAILED` when absent.
 * ES: Primer elemento con ese nombre de etiqueta, o `XML_PARSE_FAILED` si no existe.
 */
export const findElement = (dom: XmlDocument, tagName: string): Element => {
  const element = dom.getElementsByTagName(tagName)[0]
  if (element === undefined) throw new DteError('XML_PARSE_FAILED', { field: tagName, reason: 'element not found' })
  return element
}

/**
 * EN: Canonical XML 1.0 (inclusive, without comments) of one element, restricted to what SII documents use: the apex
 * declares every namespace in scope, children drop redundant `xmlns`, attributes are sorted, text escapes only
 * `& < > CR`, empty elements render as `<X></X>`. This is the byte string whose SHA-1 goes into `DigestValue`.
 * ES: Canonical XML 1.0 (inclusivo, sin comentarios) de un elemento, acotado a lo que usan los documentos del SII:
 * el apex declara todos los namespaces en alcance, los hijos omiten `xmlns` redundantes, los atributos van ordenados,
 * el texto escapa solo `& < > CR` y los elementos vacíos salen como `<X></X>`. Es el string cuyo SHA-1 va en `DigestValue`.
 */
export const canonicalizeElement = (element: Element): string => {
  const scope = namespacesInScope(element)
  const namespaceAttributes = Array.from(scope, ([name, value]) => ({ name, value }))
  const plainAttributes = ownAttributes(element).filter((attribute) => !isNamespaceDeclaration(attribute.name))
  const children = Array.from(element.childNodes)
    .map((child) => serializeNode(child, scope))
    .join('')
  return `<${element.tagName}${renderAttributes([...namespaceAttributes, ...plainAttributes])}>${children}</${element.tagName}>`
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest tests/c14n.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/xml/c14n.ts tests/c14n.test.ts
git commit -m "feat: canonical XML for the SII signing subset

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Primitivas criptográficas y X.509 (`src/crypto/digest.ts`, `src/crypto/rsa.ts`, `src/crypto/x509.ts`)

**Files:**
- Create: `src/crypto/digest.ts`, `src/crypto/rsa.ts`, `src/crypto/x509.ts`
- Test: `tests/crypto.test.ts`

- [ ] **Step 1: Test que falla**

`tests/crypto.test.ts`:

```ts
import forge from 'node-forge'
import { sha1Base64, toBinaryString } from '../src/crypto/digest'
import { rsaSha1SignBase64, rsaSha1VerifyBase64, rsaPublicKeyParts, rsaPublicKeyPartsFromCertificatePem } from '../src/crypto/rsa'
import { parseCertificatePem, rutFromCertificate, certificateBase64 } from '../src/crypto/x509'
import { fixtureText } from './support/fixtures'
import { DteError } from '../src/errors'

const keyPem = fixtureText('cert.key.pem')
const certPem = fixtureText('cert.pem')

describe('digest', () => {
  test('sha1 over UTF-8 and over Latin-1 differ for non-ASCII input', () => {
    expect(sha1Base64('abc')).toBe('qZk+NkcGgWq6PiVxeFDCbJzQ2J0=')
    expect(sha1Base64('ñ', 'utf8')).not.toBe(sha1Base64('ñ', 'latin1'))
    expect(toBinaryString('ñ', 'latin1')).toBe('ñ')
    expect(toBinaryString('ñ', 'utf8')).toBe('Ã±')
  })

  test('latin1 rejects characters outside the charset', () => {
    expect(() => sha1Base64('—', 'latin1')).toThrow(DteError)
  })
})

describe('rsa', () => {
  test('sign and verify (utf8 and latin1), wrong data fails', () => {
    const parts = rsaPublicKeyParts(keyPem)
    expect(parts.exponent).toBe('AQAB')
    expect(parts.modulus).toMatch(/^[A-Za-z0-9+/]+=*$/)
    const signature = rsaSha1SignBase64(keyPem, '<DD>ñ</DD>', 'latin1')
    expect(rsaSha1VerifyBase64(parts, '<DD>ñ</DD>', 'latin1', signature)).toBe(true)
    expect(rsaSha1VerifyBase64(parts, '<DD>n</DD>', 'latin1', signature)).toBe(false)
    expect(rsaSha1VerifyBase64(parts, '<DD>ñ</DD>', 'utf8', signature)).toBe(false)
    expect(rsaSha1VerifyBase64(parts, '<DD>ñ</DD>', 'latin1', 'AAAA')).toBe(false)
  })

  test('public key parts from the certificate match the private key', () => {
    expect(rsaPublicKeyPartsFromCertificatePem(certPem)).toEqual(rsaPublicKeyParts(keyPem))
  })

  test('modulus has no sign byte and is 256 bytes for a 2048-bit key', () => {
    expect(forge.util.decode64(rsaPublicKeyParts(keyPem).modulus).length).toBe(256)
  })
})

describe('x509', () => {
  test('parses the fixture certificate', () => {
    const cert = parseCertificatePem(certPem)
    expect(cert.rut).toBe('76543210-3')
    expect(cert.commonName).toBe('JUAN PEREZ PRUEBA')
    expect(cert.subject.O).toBe('EMPRESA EJEMPLO SPA')
    expect(cert.subject.serialNumber).toBe('76543210-3')
    expect(cert.notBefore.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(cert.notAfter.toISOString()).toBe('2046-01-01T00:00:00.000Z')
    expect(cert.base64).toBe(certificateBase64(certPem))
    expect(cert.base64).not.toMatch(/\s|BEGIN/)
    expect(cert.publicKey).toEqual(rsaPublicKeyParts(keyPem))
  })

  const RUT_OID = '1.3.6.1.4.1.8321.1'
  const sanExtension = (rut: string) => {
    const otherName = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, forge.asn1.oidToDer(RUT_OID).getBytes()),
      forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.UTF8, false, rut)]),
    ])
    const generalNames = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [otherName])
    return { id: '2.5.29.17', name: 'subjectAltName', critical: false, value: generalNames }
  }

  const buildCert = (subject: forge.pki.CertificateField[], sanRut?: string): forge.pki.Certificate => {
    const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 })
    const cert = forge.pki.createCertificate()
    cert.publicKey = keys.publicKey
    cert.serialNumber = '01'
    cert.validity.notBefore = new Date('2026-01-01T00:00:00Z')
    cert.validity.notAfter = new Date('2027-01-01T00:00:00Z')
    cert.setSubject(subject)
    cert.setIssuer(subject)
    cert.setExtensions(sanRut ? [{ name: 'basicConstraints', cA: false }, sanExtension(sanRut)] : [{ name: 'basicConstraints', cA: false }])
    cert.sign(keys.privateKey, forge.md.sha256.create())
    // Round-trip through DER so extensions are parsed the way a real PFX certificate is.
    return forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()))
  }

  test('RUT sources in priority order: SAN, serialNumber, OU, CN, none', () => {
    expect(rutFromCertificate(buildCert([{ shortName: 'CN', value: 'Ana' }, { type: '2.5.4.5', value: '11111111-1' }], '12.345.678-5'))).toBe('12345678-5')
    expect(rutFromCertificate(buildCert([{ shortName: 'CN', value: 'Ana' }, { type: '2.5.4.5', value: '12345678-5' }]))).toBe('12345678-5')
    expect(rutFromCertificate(buildCert([{ shortName: 'CN', value: 'Maria' }, { shortName: 'OU', value: '7654321-6' }]))).toBe('7654321-6')
    expect(rutFromCertificate(buildCert([{ shortName: 'CN', value: 'Pedro Soto 14625621-k' }]))).toBe('14625621-K')
    expect(rutFromCertificate(buildCert([{ shortName: 'CN', value: 'Pedro Soto' }]))).toBeNull()
  })

  test('an invalid RUT in a higher-priority source falls through to the next one', () => {
    expect(rutFromCertificate(buildCert([{ shortName: 'CN', value: 'Ana 12345678-5' }, { type: '2.5.4.5', value: '12345678-9' }]))).toBe('12345678-5')
  })

  test('parseCertificatePem rejects garbage', () => {
    expect(() => parseCertificatePem('not a pem')).toThrow(DteError)
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest tests/crypto.test.ts`
Expected: FAIL, módulos no encontrados.

- [ ] **Step 3: Implementación**

`src/crypto/digest.ts`:

```ts
import forge from 'node-forge'
import { decodeLatin1, encodeLatin1 } from '../text/latin1'

/**
 * EN: How a JS string is turned into bytes before hashing or signing.
 * ES: Cómo se convierte un string JS a bytes antes de hashear o firmar.
 */
export type TextEncoding = 'utf8' | 'latin1'

/**
 * EN: Bytes of `data` as a "binary string" (one char per byte, what node-forge consumes). `latin1` throws on characters outside ISO-8859-1.
 * ES: Bytes de `data` como "binary string" (un carácter por byte, lo que consume node-forge). `latin1` lanza si hay caracteres fuera de ISO-8859-1.
 */
export const toBinaryString = (data: string, encoding: TextEncoding): string =>
  encoding === 'utf8' ? forge.util.encodeUtf8(data) : decodeLatin1(encodeLatin1(data))

/**
 * EN: Base64 SHA-1 of `data` encoded as `encoding` (default UTF-8). Used for XMLDSig `DigestValue`.
 * ES: SHA-1 en base64 de `data` codificado como `encoding` (por defecto UTF-8). Se usa en el `DigestValue` de XMLDSig.
 */
export const sha1Base64 = (data: string, encoding: TextEncoding = 'utf8'): string => {
  const md = forge.md.sha1.create()
  md.update(toBinaryString(data, encoding))
  return forge.util.encode64(md.digest().getBytes())
}
```

`src/crypto/rsa.ts`:

```ts
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

const base64ToBigInt = (value: string): forge.jsbn.BigInteger => new forge.jsbn.BigInteger(forge.util.bytesToHex(forge.util.decode64(value)), 16)

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
 * EN: Public modulus and exponent of a PEM certificate.
 * ES: Módulo y exponente públicos de un certificado PEM.
 */
export const rsaPublicKeyPartsFromCertificatePem = (certificatePem: string): RsaPublicKeyParts => {
  const publicKey = forge.pki.certificateFromPem(certificatePem).publicKey as forge.pki.rsa.PublicKey
  return { modulus: bigIntToBase64(publicKey.n), exponent: bigIntToBase64(publicKey.e) }
}

/**
 * EN: SHA1withRSA (PKCS#1 v1.5) signature of `data`, base64. Deterministic: same key and bytes, same signature.
 * ES: Firma SHA1withRSA (PKCS#1 v1.5) de `data`, en base64. Determinista: misma clave y bytes, misma firma.
 */
export const rsaSha1SignBase64 = (privateKeyPem: string, data: string, encoding: TextEncoding = 'utf8'): string => {
  const key = forge.pki.privateKeyFromPem(privateKeyPem)
  return forge.util.encode64(key.sign(sha1Of(data, encoding)))
}

/**
 * EN: Verifies a SHA1withRSA base64 signature against a public key given as modulus/exponent. Never throws: malformed input is `false`.
 * ES: Verifica una firma SHA1withRSA en base64 contra una clave pública dada como módulo/exponente. Nunca lanza: entrada malformada es `false`.
 */
export const rsaSha1VerifyBase64 = (publicKey: RsaPublicKeyParts, data: string, encoding: TextEncoding, signatureBase64: string): boolean => {
  try {
    const key = forge.pki.setRsaPublicKey(base64ToBigInt(publicKey.modulus), base64ToBigInt(publicKey.exponent))
    return key.verify(sha1Of(data, encoding).digest().getBytes(), forge.util.decode64(signatureBase64))
  } catch {
    return false
  }
}
```

`src/crypto/x509.ts`:

```ts
import forge from 'node-forge'
import { format } from 'rut.ts'
import { DteError } from '../errors'
import type { SiiRut } from '../model/rut'
import type { RsaPublicKeyParts } from './rsa'

const RUT_OID = '1.3.6.1.4.1.8321.1'

/**
 * EN: What dte-sdk reads from an X.509 certificate.
 * ES: Lo que dte-sdk lee de un certificado X.509.
 */
export type ParsedCertificate = {
  /** EN: Subject fields by short name (`CN`, `O`, `OU`, `serialNumber`…). ES: Campos del sujeto por nombre corto (`CN`, `O`, `OU`, `serialNumber`…). */
  readonly subject: Readonly<Record<string, string>>
  /** EN: Common name. ES: Nombre común (`CN`). */
  readonly commonName: string | null
  /** EN: Validity start. ES: Inicio de vigencia. */
  readonly notBefore: Date
  /** EN: Validity end. ES: Fin de vigencia. */
  readonly notAfter: Date
  /** EN: Holder RUT, SII shape, or null when the certificate carries none. ES: RUT del titular en forma SII, o null si el certificado no lo trae. */
  readonly rut: SiiRut | null
  /** EN: DER certificate in base64, no headers or whitespace (`X509Certificate`). ES: Certificado DER en base64, sin cabeceras ni espacios (`X509Certificate`). */
  readonly base64: string
  /** EN: Public key parts. ES: Partes de la clave pública. */
  readonly publicKey: RsaPublicKeyParts
}

const asSiiRut = (candidate: string | undefined): SiiRut | null => {
  if (candidate === undefined) return null
  const formatted = format(candidate.trim(), { dots: false, throwOnError: false })
  return formatted === null ? null : (formatted as SiiRut)
}

/**
 * EN: Subject attributes keyed by short name (falls back to the long name).
 * ES: Atributos del sujeto por nombre corto (o el nombre largo si no hay corto).
 */
export const subjectFields = (certificate: forge.pki.Certificate): Readonly<Record<string, string>> =>
  Object.fromEntries(
    certificate.subject.attributes
      .filter((attribute) => attribute.shortName !== undefined || attribute.name !== undefined)
      .map((attribute) => [attribute.shortName ?? attribute.name ?? '', String(attribute.value ?? '')]),
  )

// The RUT lives in SubjectAltName as otherName OID 1.3.6.1.4.1.8321.1 (Chilean e-signature law), the one source
// that is consistent across certification authorities.
const rutFromSubjectAltName = (certificate: forge.pki.Certificate): SiiRut | null => {
  const extension = certificate.getExtension('subjectAltName') as { altNames?: readonly { type: number; value: unknown }[] } | null
  for (const altName of extension?.altNames ?? []) {
    if (altName.type !== 0) continue
    try {
      const [oid, explicit] = altName.value as [forge.asn1.Asn1, forge.asn1.Asn1]
      if (forge.asn1.derToOid(oid.value as string) !== RUT_OID) continue
      const inner = (explicit.value as forge.asn1.Asn1[])[0]
      const rut = asSiiRut(typeof inner?.value === 'string' ? inner.value : undefined)
      if (rut !== null) return rut
    } catch {
      // Not the shape we expect: keep looking, then fall back to the subject.
    }
  }
  return null
}

/**
 * EN: Holder RUT from the certificate: SAN otherName first, then `serialNumber`, `OU` and a RUT-looking token in `CN`.
 * Each candidate must pass rut.ts; invalid ones fall through to the next source.
 * ES: RUT del titular desde el certificado: primero el otherName del SAN, luego `serialNumber`, `OU` y un token con forma
 * de RUT en `CN`. Cada candidato debe pasar rut.ts; los inválidos caen al siguiente origen.
 */
export const rutFromCertificate = (certificate: forge.pki.Certificate): SiiRut | null => {
  const fromSan = rutFromSubjectAltName(certificate)
  if (fromSan !== null) return fromSan
  const subject = subjectFields(certificate)
  const fromCn = /(\d{7,8}-[\dkK])/.exec(subject.CN ?? '')?.[1]
  return asSiiRut(subject.serialNumber) ?? asSiiRut(subject.OU) ?? asSiiRut(fromCn)
}

/**
 * EN: Base64 body of a PEM certificate (no headers, no whitespace).
 * ES: Cuerpo base64 de un certificado PEM (sin cabeceras ni espacios).
 */
export const certificateBase64 = (certificatePem: string): string => certificatePem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')

const bigIntToBase64 = (value: forge.jsbn.BigInteger): string => {
  const hex = value.toString(16)
  return forge.util.encode64(forge.util.hexToBytes(hex.length % 2 === 1 ? `0${hex}` : hex))
}

/**
 * EN: Parses a PEM certificate into the fields dte-sdk needs.
 * ES: Parsea un certificado PEM a los campos que dte-sdk necesita.
 * @throws {DteError} EN: `CERT_INVALID`. ES: `CERT_INVALID`.
 */
export const parseCertificatePem = (certificatePem: string): ParsedCertificate => {
  const certificate = (() => {
    try {
      return forge.pki.certificateFromPem(certificatePem)
    } catch (error) {
      throw new DteError('CERT_INVALID', { reason: error instanceof Error ? error.message : String(error) })
    }
  })()
  const subject = subjectFields(certificate)
  const publicKey = certificate.publicKey as forge.pki.rsa.PublicKey
  return {
    subject,
    commonName: subject.CN ?? null,
    notBefore: certificate.validity.notBefore,
    notAfter: certificate.validity.notAfter,
    rut: rutFromCertificate(certificate),
    base64: certificateBase64(forge.pki.certificateToPem(certificate)),
    publicKey: { modulus: bigIntToBase64(publicKey.n), exponent: bigIntToBase64(publicKey.e) },
  }
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest tests/crypto.test.ts`
Expected: PASS. Si `attribute.shortName`/`attribute.name` quedan tipados como `string | undefined` en `@types/node-forge`, el filtro de `subjectFields` ya lo cubre; si TypeScript se queja por `attribute.value` de tipo `any`, deja el `String(...)`.

- [ ] **Step 5: Commit**

```bash
git add src/crypto tests/crypto.test.ts
git commit -m "feat: SHA-1, RSA PKCS#1 v1.5 and X.509 helpers on node-forge

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Certificado desde PFX y PEM (`src/certificate/certificate.ts`, `src/certificate/pem.ts`, `src/certificate/pkcs12.ts`)

**Files:**
- Create: `src/certificate/certificate.ts`, `src/certificate/pem.ts`, `src/certificate/pkcs12.ts`
- Test: `tests/certificate.test.ts`

- [ ] **Step 1: Test que falla**

`tests/certificate.test.ts`:

```ts
import forge from 'node-forge'
import { isCertificateExpired, daysUntilExpiry } from '../src/certificate/certificate'
import { loadCertificateFromPem } from '../src/certificate/pem'
import { loadCertificateFromPkcs12 } from '../src/certificate/pkcs12'
import { DteError } from '../src/errors'
import { fixtureBytes, fixtureText, FIXED_NOW, FIXTURE_PASSWORD } from './support/fixtures'

const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn()
    throw new Error('expected DteError')
  } catch (err) {
    expect(err).toBeInstanceOf(DteError)
    expect((err as DteError).code).toBe(code)
  }
}

describe('loadCertificateFromPkcs12', () => {
  test.each(['cert.pfx', 'cert-aes.pfx'])('%s: legacy and modern PKCS#12 both load', (file) => {
    const cert = loadCertificateFromPkcs12(fixtureBytes(file), FIXTURE_PASSWORD, { now: FIXED_NOW })
    expect(cert.rut).toBe('76543210-3')
    expect(cert.commonName).toBe('JUAN PEREZ PRUEBA')
    expect(cert.subject.O).toBe('EMPRESA EJEMPLO SPA')
    expect(cert.notAfter.toISOString()).toBe('2046-01-01T00:00:00.000Z')
    expect(cert.privateKeyPem).toMatch(/^-----BEGIN RSA PRIVATE KEY-----/)
    expect(cert.certificatePem).toMatch(/^-----BEGIN CERTIFICATE-----/)
    expect(cert.chainPem).toBe(cert.certificatePem)
    expect(cert.certificateBase64).not.toMatch(/\s/)
    expect(cert.publicKey.exponent).toBe('AQAB')
  })

  test('wrong password', () => {
    expectCode(() => loadCertificateFromPkcs12(fixtureBytes('cert.pfx'), 'nope', { now: FIXED_NOW }), 'CERT_PASSWORD_WRONG')
  })

  test('garbage bytes', () => {
    expectCode(() => loadCertificateFromPkcs12(new Uint8Array([1, 2, 3]), 'x'), 'CERT_INVALID')
  })

  test('expired certificate is rejected unless allowExpired', () => {
    expectCode(() => loadCertificateFromPkcs12(fixtureBytes('cert-expired.pfx'), FIXTURE_PASSWORD, { now: FIXED_NOW }), 'CERT_EXPIRED')
    const cert = loadCertificateFromPkcs12(fixtureBytes('cert-expired.pfx'), FIXTURE_PASSWORD, { now: FIXED_NOW, allowExpired: true })
    expect(cert.notAfter.toISOString()).toBe('2021-01-01T00:00:00.000Z')
  })

  test('orders a chain leaf → intermediate → root whatever the bag order', () => {
    const makeKeyPair = () => forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 })
    const makeCert = (subject: string, keys: forge.pki.rsa.KeyPair, issuer: { name: string; keys: forge.pki.rsa.KeyPair } | null, ca: boolean) => {
      const cert = forge.pki.createCertificate()
      cert.publicKey = keys.publicKey
      cert.serialNumber = String(Math.floor(Math.random() * 1e6) + 1)
      cert.validity.notBefore = new Date('2026-01-01T00:00:00Z')
      cert.validity.notAfter = new Date('2036-01-01T00:00:00Z')
      cert.setSubject([{ name: 'commonName', value: subject }])
      cert.setIssuer([{ name: 'commonName', value: issuer ? issuer.name : subject }])
      cert.setExtensions([{ name: 'basicConstraints', cA: ca }])
      cert.sign(issuer ? issuer.keys.privateKey : keys.privateKey, forge.md.sha256.create())
      return cert
    }
    const rootKeys = makeKeyPair()
    const intermediateKeys = makeKeyPair()
    const leafKeys = makeKeyPair()
    const root = makeCert('Root CA', rootKeys, null, true)
    const intermediate = makeCert('Intermediate CA', intermediateKeys, { name: 'Root CA', keys: rootKeys }, true)
    const leaf = makeCert('Leaf', leafKeys, { name: 'Intermediate CA', keys: intermediateKeys }, false)
    const asn1 = forge.pkcs12.toPkcs12Asn1(leafKeys.privateKey, [root, leaf, intermediate], 'pw', { algorithm: '3des' })
    const bytes = new Uint8Array(Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary'))

    const cert = loadCertificateFromPkcs12(bytes, 'pw', { now: FIXED_NOW })
    expect(cert.commonName).toBe('Leaf')
    expect(cert.rut).toBeNull()
    const pems = cert.chainPem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? []
    expect(pems.length).toBe(3)
    expect(pems.map((pem) => forge.pki.certificateFromPem(pem).subject.getField('CN').value)).toEqual(['Leaf', 'Intermediate CA', 'Root CA'])
  })
})

describe('loadCertificateFromPem', () => {
  const privateKeyPem = fixtureText('cert.key.pem')
  const certificatePem = fixtureText('cert.pem')

  test('loads a matching key/cert pair', () => {
    const cert = loadCertificateFromPem({ privateKeyPem, certificatePem }, { now: FIXED_NOW })
    expect(cert.rut).toBe('76543210-3')
    expect(cert.chainPem).toBe(certificatePem)
    expect(loadCertificateFromPem({ privateKeyPem, certificatePem, chainPem: 'CHAIN' }, { now: FIXED_NOW }).chainPem).toBe('CHAIN')
  })

  test('rejects a key that does not match the certificate', () => {
    const other = forge.pki.privateKeyToPem(forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 }).privateKey)
    expectCode(() => loadCertificateFromPem({ privateKeyPem: other, certificatePem }, { now: FIXED_NOW }), 'CERT_INVALID')
    expectCode(() => loadCertificateFromPem({ privateKeyPem: 'not a key', certificatePem }, { now: FIXED_NOW }), 'CERT_INVALID')
  })

  test('expiry helpers', () => {
    const cert = loadCertificateFromPem({ privateKeyPem, certificatePem }, { now: FIXED_NOW })
    expect(isCertificateExpired(cert, { now: FIXED_NOW })).toBe(false)
    expect(isCertificateExpired(cert, { now: new Date('2046-01-02T00:00:00Z') })).toBe(true)
    expect(isCertificateExpired(cert, { now: new Date('2045-12-20T00:00:00Z'), marginDays: 30 })).toBe(true)
    expect(daysUntilExpiry(cert, { now: new Date('2045-12-22T00:00:00Z') })).toBe(10)
    expect(isCertificateExpired(cert)).toBe(false)
    expect(daysUntilExpiry(cert)).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest tests/certificate.test.ts`
Expected: FAIL, módulos no encontrados.

- [ ] **Step 3: Implementación**

`src/certificate/certificate.ts`:

```ts
import type { RsaPublicKeyParts } from '../crypto/rsa'
import type { SiiRut } from '../model/rut'

/**
 * EN: A signing certificate loaded from PKCS#12 or PEM: private key, leaf certificate, chain for mTLS and the
 * identity fields the SII cares about. Plain data; pass it to `signDocument`, `signEnvelope` and the SII client.
 * ES: Certificado de firma cargado desde PKCS#12 o PEM: llave privada, certificado hoja, cadena para mTLS y los campos
 * de identidad que le importan al SII. Datos planos; se pasa a `signDocument`, `signEnvelope` y al cliente del SII.
 */
export type Certificate = {
  /** EN: Private key PEM. ES: Llave privada en PEM. */
  readonly privateKeyPem: string
  /** EN: Leaf certificate PEM (XML signing). ES: Certificado hoja en PEM (firma XML). */
  readonly certificatePem: string
  /** EN: Leaf → intermediates → root PEM (TLS client auth); equals `certificatePem` when there is no chain. ES: Hoja → intermedios → raíz en PEM (autenticación TLS); igual a `certificatePem` si no hay cadena. */
  readonly chainPem: string
  /** EN: Leaf DER in base64 (`X509Certificate`). ES: Hoja en DER base64 (`X509Certificate`). */
  readonly certificateBase64: string
  /** EN: Public modulus/exponent (`RSAKeyValue`). ES: Módulo/exponente públicos (`RSAKeyValue`). */
  readonly publicKey: RsaPublicKeyParts
  /** EN: Holder RUT or null. ES: RUT del titular o null. */
  readonly rut: SiiRut | null
  /** EN: Common name. ES: Nombre común. */
  readonly commonName: string | null
  /** EN: Subject fields. ES: Campos del sujeto. */
  readonly subject: Readonly<Record<string, string>>
  /** EN: Validity start. ES: Inicio de vigencia. */
  readonly notBefore: Date
  /** EN: Validity end. ES: Fin de vigencia. */
  readonly notAfter: Date
}

/**
 * EN: Options shared by the certificate loaders.
 * ES: Opciones comunes a los cargadores de certificado.
 */
export type LoadCertificateOptions = {
  /** EN: Clock for the expiry check (tests). ES: Reloj para el chequeo de vigencia (tests). */
  readonly now?: Date
  /** EN: Load an expired certificate instead of throwing `CERT_EXPIRED`. ES: Cargar un certificado vencido en vez de lanzar `CERT_EXPIRED`. */
  readonly allowExpired?: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * EN: True when `now` is past `notAfter` minus `marginDays`.
 * ES: True cuando `now` pasó `notAfter` menos `marginDays`.
 */
export const isCertificateExpired = (certificate: Pick<Certificate, 'notAfter'>, options: { readonly now?: Date; readonly marginDays?: number } = {}): boolean =>
  (options.now ?? new Date()).getTime() > certificate.notAfter.getTime() - (options.marginDays ?? 0) * DAY_MS

/**
 * EN: Whole days until `notAfter` (negative once expired).
 * ES: Días enteros hasta `notAfter` (negativo una vez vencido).
 */
export const daysUntilExpiry = (certificate: Pick<Certificate, 'notAfter'>, options: { readonly now?: Date } = {}): number =>
  Math.floor((certificate.notAfter.getTime() - (options.now ?? new Date()).getTime()) / DAY_MS)
```

`src/certificate/pem.ts`:

```ts
import { rsaPublicKeyParts } from '../crypto/rsa'
import { parseCertificatePem } from '../crypto/x509'
import { DteError } from '../errors'
import { isCertificateExpired, type Certificate, type LoadCertificateOptions } from './certificate'

/**
 * EN: PEM material for `loadCertificateFromPem`.
 * ES: Material PEM para `loadCertificateFromPem`.
 */
export type PemCertificateInput = {
  /** EN: Private key PEM (PKCS#1 `RSA PRIVATE KEY` or PKCS#8 `PRIVATE KEY`, unencrypted). ES: Llave privada PEM (PKCS#1 o PKCS#8, sin cifrar). */
  readonly privateKeyPem: string
  /** EN: Leaf certificate PEM. ES: Certificado hoja PEM. */
  readonly certificatePem: string
  /** EN: Full chain PEM for TLS; defaults to the leaf. ES: Cadena completa PEM para TLS; por defecto la hoja. */
  readonly chainPem?: string
}

/**
 * EN: Builds a `Certificate` from PEM strings (e.g. after `openssl pkcs12 -nodes`). Verifies the key matches the
 * certificate and that it is still valid.
 * ES: Construye un `Certificate` desde strings PEM (p. ej. tras `openssl pkcs12 -nodes`). Verifica que la llave
 * corresponda al certificado y que esté vigente.
 * @throws {DteError} EN: `CERT_INVALID`, `CERT_EXPIRED`. ES: `CERT_INVALID`, `CERT_EXPIRED`.
 */
export const loadCertificateFromPem = (input: PemCertificateInput, options: LoadCertificateOptions = {}): Certificate => {
  const parsed = parseCertificatePem(input.certificatePem)
  const keyParts = (() => {
    try {
      return rsaPublicKeyParts(input.privateKeyPem)
    } catch (error) {
      throw new DteError('CERT_INVALID', { reason: `private key: ${error instanceof Error ? error.message : String(error)}` })
    }
  })()
  if (keyParts.modulus !== parsed.publicKey.modulus) throw new DteError('CERT_INVALID', { reason: 'private key does not match the certificate' })
  if (!options.allowExpired && isCertificateExpired(parsed, { now: options.now })) throw new DteError('CERT_EXPIRED', { expiresAt: parsed.notAfter })
  return {
    privateKeyPem: input.privateKeyPem,
    certificatePem: input.certificatePem,
    chainPem: input.chainPem ?? input.certificatePem,
    certificateBase64: parsed.base64,
    publicKey: parsed.publicKey,
    rut: parsed.rut,
    commonName: parsed.commonName,
    subject: parsed.subject,
    notBefore: parsed.notBefore,
    notAfter: parsed.notAfter,
  }
}
```

`src/certificate/pkcs12.ts`:

```ts
import forge from 'node-forge'
import { DteError } from '../errors'
import { decodeLatin1 } from '../text/latin1'
import type { Certificate, LoadCertificateOptions } from './certificate'
import { loadCertificateFromPem } from './pem'

type ForgeCertificate = forge.pki.Certificate
type ForgeRsaPrivateKey = forge.pki.rsa.PrivateKey

const bagsOf = (pfx: forge.pkcs12.Pkcs12Pfx, bagType: string): readonly forge.pkcs12.Bag[] => pfx.getBags({ bagType })[bagType] ?? []

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
  const byKey = certificates.find((certificate) => (certificate.publicKey as forge.pki.rsa.PublicKey).n.compareTo(privateKey.n) === 0)
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
export const loadCertificateFromPkcs12 = (bytes: Uint8Array, password: string, options: LoadCertificateOptions = {}): Certificate => {
  const pfx = decode(bytes, password)
  const privateKey = (bagsOf(pfx, forge.pki.oids.pkcs8ShroudedKeyBag)[0] ?? bagsOf(pfx, forge.pki.oids.keyBag)[0])?.key as ForgeRsaPrivateKey | undefined
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
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest tests/certificate.test.ts`
Expected: PASS. Si la cobertura marca sin cubrir la rama `nonCa ?? certificates[0]` o `no private key`, agrega en el test un PFX armado con `forge.pkcs12.toPkcs12Asn1` que contenga solo un certificado CA, y otro sin llave (`toPkcs12Asn1(null, [cert], 'pw')`).

- [ ] **Step 5: Commit**

```bash
git add src/certificate tests/certificate.test.ts
git commit -m "feat: load signing certificates from PKCS#12 and PEM

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: CAF (`src/caf/parse.ts`, `src/caf/validity.ts`, `src/caf/sign.ts`)

**Files:**
- Create: `src/caf/parse.ts`, `src/caf/validity.ts`, `src/caf/sign.ts`
- Test: `tests/caf.test.ts`

- [ ] **Step 1: Test que falla**

`tests/caf.test.ts`:

```ts
import { parseCaf } from '../src/caf/parse'
import { cafExpiresAt, isCafExpired, isFolioInRange, assertFolioInRange, availableFolios } from '../src/caf/validity'
import { signWithCaf, verifyWithCaf } from '../src/caf/sign'
import { DteError } from '../src/errors'
import { fixtureText } from './support/fixtures'

const caf33 = fixtureText('caf-33.xml')
const withFields = (xml: string, type: number, from: number, to: number, authorizationDate: string) =>
  xml
    .replace(/<TD>\d+<\/TD>/, `<TD>${type}</TD>`)
    .replace(/<RNG><D>\d+<\/D><H>\d+<\/H><\/RNG>/, `<RNG><D>${from}</D><H>${to}</H></RNG>`)
    .replace(/<FA>[^<]*<\/FA>/, `<FA>${authorizationDate}</FA>`)

const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn()
    throw new Error('expected DteError')
  } catch (err) {
    expect(err).toBeInstanceOf(DteError)
    expect((err as DteError).code).toBe(code)
  }
}

describe('parseCaf', () => {
  test('reads the authorization data and keeps the exact <CAF> block', () => {
    const caf = parseCaf(caf33)
    expect(caf.issuerRut).toBe('76543210-3')
    expect(caf.issuerName).toBe('EMPRESA EJEMPLO SPA')
    expect(caf.documentType).toBe(33)
    expect(caf.range).toEqual({ from: 1, to: 100 })
    expect(caf.authorizationDate).toBe('2026-10-31')
    expect(caf.keyId).toBe(100)
    expect(caf.publicKey.exponent).toBe('AQAB')
    expect(caf.siiSignature).toMatch(/^[A-Za-z0-9+/=]+$/)
    expect(caf.privateKeyPem).toMatch(/^-----BEGIN RSA PRIVATE KEY-----/)
    expect(caf.xml.startsWith('<CAF version="1.0"><DA><RE>76543210-3</RE>')).toBe(true)
    expect(caf.xml.endsWith('</FRMA></CAF>')).toBe(true)
    expect(caf.xml).not.toMatch(/>\s+</)
  })

  test('receipt CAF', () => {
    const caf = parseCaf(fixtureText('caf-39.xml'))
    expect(caf.documentType).toBe(39)
    expect(caf.range).toEqual({ from: 1, to: 1000 })
  })

  test.each([
    ['', 'CAF_INVALID'],
    ['<no-es-caf/>', 'CAF_INVALID'],
    ['<AUTORIZACION><CAF><DA><TD>33</TD></DA></CAF></AUTORIZACION>', 'CAF_INVALID'],
    [withFields(caf33, 99, 1, 10, '2026-10-31'), 'CAF_INVALID'],
    [caf33.replace(/<RNG>.*<\/RNG>/, '<RNG><D>x</D><H>y</H></RNG>'), 'CAF_INVALID'],
    [caf33.replace(/<RSASK>[\s\S]*<\/RSASK>/, '<RSASK>nope</RSASK>'), 'CAF_INVALID'],
    [caf33.replace(/<RSASK>[\s\S]*<\/RSASK>/, ''), 'CAF_INVALID'],
    [caf33.replace('76543210-3', '76543210-K'), 'INVALID_RUT'],
    ['<AUTORIZACION><CAF><DA>', 'CAF_INVALID'],
  ])('rejects %p → %s', (xml, code) => {
    expectCode(() => parseCaf(xml), code)
  })

  test('missing FA yields null authorization date', () => {
    expect(parseCaf(caf33.replace(/<FA>[^<]*<\/FA>/, '')).authorizationDate).toBeNull()
  })
})

describe('validity', () => {
  const now = new Date('2026-10-07T18:35:00Z')
  const caf = (type: number, authorizationDate: string) => parseCaf(withFields(caf33, type, 1, 30, authorizationDate))

  test('expires 6 months after authorization for 33/46/56/61 only', () => {
    expect(cafExpiresAt(caf(33, '2026-04-07'))?.toISOString()).toBe('2026-10-07T04:00:00.000Z')
    expect(isCafExpired(caf(33, '2026-04-07'), { now })).toBe(true)
    expect(isCafExpired(caf(33, '2026-04-09'), { now })).toBe(false)
    expect(isCafExpired(caf(33, '2026-04-08'), { now, marginMs: 0 })).toBe(false)
    expect(isCafExpired(caf(61, '2024-12-03'), { now })).toBe(true)
    expect(isCafExpired(caf(61, '2026-10-07'), { now })).toBe(false)
    expect(cafExpiresAt(caf(52, '2020-01-01'))).toBeNull()
    expect(isCafExpired(caf(39, '2020-01-01'), { now })).toBe(false)
    expect(cafExpiresAt(parseCaf(caf33.replace(/<FA>[^<]*<\/FA>/, '')))).toBeNull()
    expect(isCafExpired(parseCaf(fixtureText('caf-33-old.xml')))).toBe(true)
  })

  test('folio range', () => {
    const c = parseCaf(caf33)
    expect(isFolioInRange(c, 1)).toBe(true)
    expect(isFolioInRange(c, 100)).toBe(true)
    expect(isFolioInRange(c, 101)).toBe(false)
    expect(isFolioInRange(c, 0)).toBe(false)
    expect(isFolioInRange(c, 1.5)).toBe(false)
    expect(availableFolios(c)).toBe(100)
    expect(() => assertFolioInRange(c, 50)).not.toThrow()
    try {
      assertFolioInRange(c, 101)
    } catch (err) {
      expect((err as DteError).code).toBe('FOLIO_OUT_OF_RANGE')
      expect((err as DteError).details).toEqual({ folio: 101, from: 1, to: 100, type: 33 })
    }
  })
})

describe('sign', () => {
  test('signs Latin-1 bytes with the CAF key and verifies with RSAPK', () => {
    const caf = parseCaf(caf33)
    const signature = signWithCaf(caf, '<DD><RE>76543210-3</RE><RSR>Señor</RSR></DD>')
    expect(verifyWithCaf(caf, '<DD><RE>76543210-3</RE><RSR>Señor</RSR></DD>', signature)).toBe(true)
    expect(verifyWithCaf(caf, '<DD><RE>76543210-3</RE><RSR>Senor</RSR></DD>', signature)).toBe(false)
    expect(verifyWithCaf(parseCaf(fixtureText('caf-39.xml')), '<DD><RE>76543210-3</RE><RSR>Señor</RSR></DD>', signature)).toBe(false)
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest tests/caf.test.ts`
Expected: FAIL, módulos no encontrados.

- [ ] **Step 3: Implementación**

`src/caf/parse.ts`:

```ts
import forge from 'node-forge'
import { isDocumentType, type DocumentType } from '../catalogs/document-types'
import type { RsaPublicKeyParts } from '../crypto/rsa'
import { DteError } from '../errors'
import { toSiiRut, type SiiRut } from '../model/rut'
import { parseXml } from '../xml/parse'

/**
 * EN: A parsed CAF (Código de Autorización de Folios): the SII authorization of a folio range plus the private key that
 * signs each TED. Keep `privateKeyPem` secret.
 * ES: Un CAF (Código de Autorización de Folios) parseado: la autorización del SII de un rango de folios más la llave
 * privada que firma cada TED. `privateKeyPem` es secreto.
 */
export type Caf = {
  /** EN: Authorized issuer. ES: `DA/RE` — RUT del emisor autorizado. */
  readonly issuerRut: SiiRut
  /** EN: Issuer business name. ES: `DA/RS` — Razón social del emisor. */
  readonly issuerName: string
  /** EN: Document type the range is for. ES: `DA/TD` — Tipo de documento del rango. */
  readonly documentType: DocumentType
  /** EN: Inclusive folio range. ES: `DA/RNG` — Rango de folios, inclusivo (`D` desde, `H` hasta). */
  readonly range: { readonly from: number; readonly to: number }
  /** EN: Authorization date YYYY-MM-DD, or null when absent. ES: `DA/FA` — Fecha de autorización AAAA-MM-DD, o null si no viene. */
  readonly authorizationDate: string | null
  /** EN: Public key that verifies TED signatures. ES: `DA/RSAPK` — Clave pública que verifica las firmas del TED. */
  readonly publicKey: RsaPublicKeyParts
  /** EN: Key id; 100 marks the certification environment. ES: `DA/IDK` — Identificador de llave; 100 marca certificación. */
  readonly keyId: number
  /** EN: SII signature over the authorization data. ES: `FRMA` — Firma del SII sobre los datos de autorización. */
  readonly siiSignature: string
  /** EN: Private key PEM used to sign the TED. ES: `RSASK` — Llave privada PEM con la que se firma el TED. */
  readonly privateKeyPem: string
  /** EN: The `<CAF>…</CAF>` block exactly as the SII issued it (whitespace between tags removed), copied verbatim into every TED. ES: El bloque `<CAF>…</CAF>` tal como lo emitió el SII (sin espacios entre etiquetas), que va íntegro en cada TED. */
  readonly xml: string
}

type Tree = Readonly<Record<string, unknown>>

const node = (tree: unknown, key: string): Tree | undefined =>
  typeof tree === 'object' && tree !== null && typeof (tree as Tree)[key] === 'object' && (tree as Tree)[key] !== null ? ((tree as Tree)[key] as Tree) : undefined

const textOf = (tree: unknown, key: string): string | undefined => {
  const value = typeof tree === 'object' && tree !== null ? (tree as Tree)[key] : undefined
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null && typeof (value as Tree)['#text'] === 'string') return (value as Tree)['#text'] as string
  return undefined
}

const invalid = (reason: string): DteError => new DteError('CAF_INVALID', { reason })

const integer = (value: string | undefined, reason: string): number => {
  const parsed = Number(value)
  if (value === undefined || !Number.isInteger(parsed)) throw invalid(reason)
  return parsed
}

/**
 * EN: Parses a CAF XML file as downloaded from the SII. Validates structure, type, range and key.
 * ES: Parsea un archivo CAF XML tal como se descarga del SII. Valida estructura, tipo, rango y llave.
 * @throws {DteError} EN: `CAF_INVALID`, `INVALID_RUT`. ES: `CAF_INVALID`, `INVALID_RUT`.
 */
export const parseCaf = (xml: string): Caf => {
  if (typeof xml !== 'string' || xml.trim() === '') throw invalid('empty')
  const tree = (() => {
    try {
      return parseXml(xml)
    } catch {
      throw invalid('malformed XML')
    }
  })()
  const authorization = node(tree, 'AUTORIZACION')
  const caf = node(authorization, 'CAF')
  const data = node(caf, 'DA')
  if (authorization === undefined || caf === undefined || data === undefined) throw invalid('missing AUTORIZACION/CAF/DA')
  const type = integer(textOf(data, 'TD'), 'TD')
  if (!isDocumentType(type)) throw invalid('unsupported TD')
  const range = node(data, 'RNG')
  const from = integer(textOf(range, 'D'), 'RNG/D')
  const to = integer(textOf(range, 'H'), 'RNG/H')
  if (from <= 0 || to < from) throw invalid('RNG')
  const publicKey = node(data, 'RSAPK')
  const modulus = textOf(publicKey, 'M')
  const exponent = textOf(publicKey, 'E')
  if (modulus === undefined || exponent === undefined) throw invalid('RSAPK')
  const privateKeyPem = textOf(authorization, 'RSASK')?.trim()
  if (privateKeyPem === undefined) throw invalid('missing RSASK')
  try {
    forge.pki.privateKeyFromPem(privateKeyPem)
  } catch {
    throw invalid('RSASK is not a PEM private key')
  }
  const block = /<CAF[^>]*>[\s\S]*?<\/CAF>/.exec(xml)?.[0]
  if (block === undefined) throw invalid('missing <CAF> block')
  const authorizationDate = textOf(data, 'FA')?.trim() ?? ''
  return {
    issuerRut: toSiiRut(textOf(data, 'RE') ?? '', 'CAF.RE'),
    issuerName: textOf(data, 'RS') ?? '',
    documentType: type,
    range: { from, to },
    authorizationDate: /^\d{4}-\d{2}-\d{2}$/.test(authorizationDate) ? authorizationDate : null,
    publicKey: { modulus, exponent },
    keyId: integer(textOf(data, 'IDK'), 'IDK'),
    siiSignature: (textOf(caf, 'FRMA') ?? '').replace(/\s+/g, ''),
    privateKeyPem,
    xml: block.replace(/>\s+</g, '><'),
  }
}
```

`src/caf/validity.ts`:

```ts
import { DteError } from '../errors'
import type { Caf } from './parse'

const EXPIRING_TYPES: readonly number[] = [33, 46, 56, 61]
const VALIDITY_MONTHS = 6
const DEFAULT_MARGIN_MS = 24 * 60 * 60 * 1000

/**
 * EN: Expiry instant of a CAF: six months after `authorizationDate` (Res. Ex. SII 58/2017) for invoices and notes
 * (33, 46, 56, 61), at midnight continental Chile (UTC-4). `null` for types that never expire or without a date.
 * ES: Instante de vencimiento de un CAF: seis meses después de `authorizationDate` (Res. Ex. SII 58/2017) para facturas
 * y notas (33, 46, 56, 61), a medianoche de Chile continental (UTC-4). `null` para tipos que no vencen o sin fecha.
 */
export const cafExpiresAt = (caf: Pick<Caf, 'documentType' | 'authorizationDate'>): Date | null => {
  if (!EXPIRING_TYPES.includes(caf.documentType) || caf.authorizationDate === null) return null
  const [year, month, day] = caf.authorizationDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1 + VALIDITY_MONTHS, day, 4))
}

/**
 * EN: True when the CAF has expired or expires within `marginMs` (default one day: the SII rejects every document
 * stamped with an expired CAF with `CAF-3-517`, and the envelope may be received later than it was stamped).
 * ES: True si el CAF venció o vence dentro de `marginMs` (por defecto un día: el SII rechaza cada documento timbrado con
 * un CAF vencido con `CAF-3-517`, y el sobre puede recibirse después de timbrado).
 */
export const isCafExpired = (caf: Pick<Caf, 'documentType' | 'authorizationDate'>, options: { readonly now?: Date; readonly marginMs?: number } = {}): boolean => {
  const expiresAt = cafExpiresAt(caf)
  return expiresAt !== null && expiresAt.getTime() - (options.now ?? new Date()).getTime() < (options.marginMs ?? DEFAULT_MARGIN_MS)
}

/**
 * EN: True when `folio` is an integer inside the CAF range.
 * ES: True cuando `folio` es un entero dentro del rango del CAF.
 */
export const isFolioInRange = (caf: Pick<Caf, 'range'>, folio: number): boolean =>
  Number.isInteger(folio) && folio >= caf.range.from && folio <= caf.range.to

/**
 * EN: Throws `FOLIO_OUT_OF_RANGE` unless `folio` is inside the CAF range.
 * ES: Lanza `FOLIO_OUT_OF_RANGE` salvo que `folio` esté dentro del rango del CAF.
 */
export const assertFolioInRange = (caf: Pick<Caf, 'range' | 'documentType'>, folio: number): void => {
  if (!isFolioInRange(caf, folio)) throw new DteError('FOLIO_OUT_OF_RANGE', { folio, from: caf.range.from, to: caf.range.to, type: caf.documentType })
}

/**
 * EN: Number of folios the CAF authorizes.
 * ES: Cantidad de folios que autoriza el CAF.
 */
export const availableFolios = (caf: Pick<Caf, 'range'>): number => caf.range.to - caf.range.from + 1
```

`src/caf/sign.ts`:

```ts
import { rsaSha1SignBase64, rsaSha1VerifyBase64 } from '../crypto/rsa'
import type { Caf } from './parse'

/**
 * EN: SHA1withRSA signature (base64) of `data` with the CAF private key over its ISO-8859-1 bytes, the encoding the
 * TED is transmitted and printed in.
 * ES: Firma SHA1withRSA (base64) de `data` con la llave privada del CAF sobre sus bytes ISO-8859-1, la codificación en
 * que el TED se transmite e imprime.
 */
export const signWithCaf = (caf: Pick<Caf, 'privateKeyPem'>, data: string): string => rsaSha1SignBase64(caf.privateKeyPem, data, 'latin1')

/**
 * EN: Verifies a TED-style signature with the CAF public key (`RSAPK`).
 * ES: Verifica una firma tipo TED con la clave pública del CAF (`RSAPK`).
 */
export const verifyWithCaf = (caf: Pick<Caf, 'publicKey'>, data: string, signatureBase64: string): boolean =>
  rsaSha1VerifyBase64(caf.publicKey, data, 'latin1', signatureBase64)
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest tests/caf.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/caf tests/caf.test.ts
git commit -m "feat: parse, validate and sign with CAF folio authorizations

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: Timbre electrónico TED (`src/ted/build.ts`)

**Files:**
- Create: `src/ted/build.ts`
- Test: `tests/ted.test.ts`

El string `<DD>` es exacto y sin espacios: `RE, TD, F, FE, RR, RSR, MNT, IT1, <CAF>…</CAF>, TSTED`. `RSR` e `IT1` se pliegan a ASCII **y después** se truncan a 40 (el plegado puede alargar: ß→ss). El `<CAF>` va byte a byte como lo emitió el SII. `TSTED` en hora de Chile. La firma es SHA1withRSA sobre los bytes Latin-1 del `<DD>`.

- [ ] **Step 1: Test que falla**

`tests/ted.test.ts`:

```ts
import { parseCaf } from '../src/caf/parse'
import { createDocument } from '../src/document/create'
import { DteError } from '../src/errors'
import { buildDdString, buildTedXml, stampDocument, verifyTed, tedText } from '../src/ted/build'
import { fixtureText, FIXED_NOW, ISSUER_RUT, RECEIVER_RUT } from './support/fixtures'

const caf = parseCaf(fixtureText('caf-33.xml'))
const issuer = { rut: ISSUER_RUT, businessName: 'Empresa Ejemplo SpA', businessActivity: 'Software', address: 'Av. Ejemplo 123', commune: 'Santiago' }
const receiver = { rut: RECEIVER_RUT, businessName: 'Cliente Ñandú & Cía', businessActivity: 'Comercio', address: 'Calle 456', commune: 'Providencia' }
const invoice = (folio = 7) => createDocument({ type: 33, folio, issueDate: '2026-11-15', issuer, receiver, items: [{ name: 'Cajón de peras', quantity: 2, unitPrice: 1000 }] })

const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn()
    throw new Error('expected DteError')
  } catch (err) {
    expect(err).toBeInstanceOf(DteError)
    expect((err as DteError).code).toBe(code)
  }
}

describe('tedText', () => {
  test('folds to ASCII before truncating to 40', () => {
    expect(tedText('Cajón de peras')).toBe('Cajon de peras')
    expect(tedText('x'.repeat(39) + 'ß')).toBe('x'.repeat(39) + 's')
    expect(tedText('x'.repeat(50))).toBe('x'.repeat(40))
  })
})

describe('stampDocument', () => {
  test('builds the exact DD, signs it and verifies with the CAF public key', () => {
    const stamped = stampDocument(invoice(), caf, { now: FIXED_NOW })
    const { ted } = stamped
    expect(ted.issuerRut).toBe(ISSUER_RUT)
    expect(ted.documentType).toBe(33)
    expect(ted.folio).toBe(7)
    expect(ted.issueDate).toBe('2026-11-15')
    expect(ted.receiverRut).toBe(RECEIVER_RUT)
    expect(ted.receiverName).toBe('Cliente Nandu & Cia')
    expect(ted.totalAmount).toBe(2380)
    expect(ted.firstItemName).toBe('Cajon de peras')
    expect(ted.caf).toBe(caf.xml)
    expect(ted.stampedAt).toBe('2026-11-15T15:30:00')
    const dd = `<DD><RE>${ISSUER_RUT}</RE><TD>33</TD><F>7</F><FE>2026-11-15</FE><RR>${RECEIVER_RUT}</RR><RSR>Cliente Nandu &amp; Cia</RSR><MNT>2380</MNT><IT1>Cajon de peras</IT1>${caf.xml}<TSTED>2026-11-15T15:30:00</TSTED></DD>`
    expect(buildDdString(ted)).toBe(dd)
    expect(ted.xml).toBe(`<TED version="1.0">${dd}<FRMT algoritmo="SHA1withRSA">${ted.signature}</FRMT></TED>`)
    expect(buildTedXml(dd, ted.signature)).toBe(ted.xml)
    expect(verifyTed(ted.xml, caf)).toBe(true)
    expect(stamped.header).toEqual(invoice().header)
  })

  test('is deterministic for a fixed clock', () => {
    expect(stampDocument(invoice(), caf, { now: FIXED_NOW }).ted.signature).toBe(stampDocument(invoice(), caf, { now: FIXED_NOW }).ted.signature)
  })

  test('receipt without receiver stamps the final consumer', () => {
    const caf39 = parseCaf(fixtureText('caf-39.xml'))
    const receipt = createDocument({ type: 39, folio: 1, issueDate: '2026-11-15', issuer, items: [{ name: 'Café', unitPrice: 1000 }], pricesIncludeVat: true })
    const { ted } = stampDocument(receipt, caf39, { now: FIXED_NOW })
    expect(ted.receiverRut).toBe('66666666-6')
    expect(ted.receiverName).toBe('Consumidor Final')
    expect(ted.firstItemName).toBe('Cafe')
    expect(verifyTed(ted.xml, caf39)).toBe(true)
  })

  test('verifyTed fails on tampered DD, tampered signature or foreign CAF', () => {
    const { ted } = stampDocument(invoice(), caf, { now: FIXED_NOW })
    expect(verifyTed(ted.xml.replace('<MNT>2380</MNT>', '<MNT>2381</MNT>'), caf)).toBe(false)
    expect(verifyTed(ted.xml.replace(ted.signature, 'AAAA'), caf)).toBe(false)
    expect(verifyTed('<TED/>', caf)).toBe(false)
    expect(verifyTed(ted.xml, parseCaf(fixtureText('caf-39.xml')))).toBe(false)
  })

  test('rejects a CAF of another type, another issuer, an out-of-range folio and an expired CAF', () => {
    expectCode(() => stampDocument(invoice(), parseCaf(fixtureText('caf-39.xml')), { now: FIXED_NOW }), 'CAF_TYPE_MISMATCH')
    const foreign = parseCaf(fixtureText('caf-33.xml').replace(/<RE>[^<]*<\/RE>/, '<RE>12345678-5</RE>'))
    expectCode(() => stampDocument(invoice(), foreign, { now: FIXED_NOW }), 'CAF_ISSUER_MISMATCH')
    expectCode(() => stampDocument(invoice(101), caf, { now: FIXED_NOW }), 'FOLIO_OUT_OF_RANGE')
    const old = parseCaf(fixtureText('caf-33-old.xml'))
    expectCode(() => stampDocument(invoice(150), old, { now: FIXED_NOW }), 'CAF_EXPIRED')
    expect(verifyTed(stampDocument(invoice(150), old, { now: FIXED_NOW, checkExpiry: false }).ted.xml, old)).toBe(true)
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest tests/ted.test.ts`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementación**

`src/ted/build.ts`:

```ts
import type { Caf } from '../caf/parse'
import { signWithCaf, verifyWithCaf } from '../caf/sign'
import { assertFolioInRange, isCafExpired } from '../caf/validity'
import type { DocumentType } from '../catalogs/document-types'
import { DteError } from '../errors'
import type { Document } from '../model/document'
import type { SiiRut } from '../model/rut'
import { foldToAscii } from '../text/sanitize'
import { chileTimestamp } from '../time/chile'
import { escapeXmlText } from '../xml/escape'

const TED_TEXT_MAX_LENGTH = 40

/**
 * EN: The electronic stamp (`TED`): the `DD` fields, the CAF they embed and the signature made with the CAF key.
 * ES: `TED` — Timbre electrónico: los campos de `DD`, el CAF que incluyen y la firma hecha con la llave del CAF.
 */
export type Ted = {
  /** EN: Issuer RUT. ES: `RE` — RUT del emisor. */
  readonly issuerRut: SiiRut
  /** EN: Document type. ES: `TD` — Tipo de documento. */
  readonly documentType: DocumentType
  /** EN: Folio. ES: `F` — Folio. */
  readonly folio: number
  /** EN: Issue date. ES: `FE` — Fecha de emisión. */
  readonly issueDate: string
  /** EN: Receiver RUT. ES: `RR` — RUT del receptor. */
  readonly receiverRut: string
  /** EN: Receiver name folded to ASCII, max 40. ES: `RSR` — Razón social del receptor plegada a ASCII, máximo 40. */
  readonly receiverName: string
  /** EN: Document total. ES: `MNT` — Monto total. */
  readonly totalAmount: number
  /** EN: First item name folded to ASCII, max 40. ES: `IT1` — Nombre del primer ítem plegado a ASCII, máximo 40. */
  readonly firstItemName: string
  /** EN: Exact `<CAF>…</CAF>` block. ES: `CAF` — Bloque `<CAF>…</CAF>` exacto. */
  readonly caf: string
  /** EN: Stamp timestamp, Chile time. ES: `TSTED` — Marca de tiempo del timbre, hora de Chile. */
  readonly stampedAt: string
  /** EN: SHA1withRSA signature of `<DD>`, base64. ES: `FRMT` — Firma SHA1withRSA del `<DD>`, base64. */
  readonly signature: string
  /** EN: Full `<TED version="1.0">…</TED>` XML. ES: XML completo `<TED version="1.0">…</TED>`. */
  readonly xml: string
}

/**
 * EN: A document with its TED.
 * ES: Un documento con su TED.
 */
export type StampedDocument = Document & { readonly ted: Ted }

/**
 * EN: Options of `stampDocument`.
 * ES: Opciones de `stampDocument`.
 */
export type StampOptions = {
  /** EN: Clock for `TSTED` and the expiry check. ES: Reloj para `TSTED` y el chequeo de vencimiento. */
  readonly now?: Date
  /** EN: Check CAF expiry (default true). ES: Chequear el vencimiento del CAF (por defecto true). */
  readonly checkExpiry?: boolean
}

/**
 * EN: Folds text to ASCII and then cuts it to 40, the way `RSR` and `IT1` need it (folding may lengthen the text).
 * ES: Pliega el texto a ASCII y después lo corta a 40, como exigen `RSR` e `IT1` (el plegado puede alargar el texto).
 */
export const tedText = (text: string): string => foldToAscii(text).slice(0, TED_TEXT_MAX_LENGTH)

/**
 * EN: The exact `<DD>…</DD>` string that gets signed and printed in the PDF417.
 * ES: El string `<DD>…</DD>` exacto que se firma y se imprime en el PDF417.
 */
export const buildDdString = (fields: Omit<Ted, 'signature' | 'xml'>): string =>
  `<DD><RE>${fields.issuerRut}</RE><TD>${fields.documentType}</TD><F>${fields.folio}</F><FE>${fields.issueDate}</FE><RR>${fields.receiverRut}</RR><RSR>${escapeXmlText(fields.receiverName)}</RSR><MNT>${fields.totalAmount}</MNT><IT1>${escapeXmlText(fields.firstItemName)}</IT1>${fields.caf}<TSTED>${fields.stampedAt}</TSTED></DD>`

/**
 * EN: Wraps a `DD` and its signature in the `TED` element.
 * ES: Envuelve un `DD` y su firma en el elemento `TED`.
 */
export const buildTedXml = (dd: string, signature: string): string =>
  `<TED version="1.0">${dd}<FRMT algoritmo="SHA1withRSA">${signature}</FRMT></TED>`

/**
 * EN: Stamps a document with a CAF: checks type, issuer, folio range and expiry, builds the exact `DD` and signs it
 * with the CAF key (SHA1withRSA over Latin-1 bytes).
 * ES: Timbra un documento con un CAF: verifica tipo, emisor, rango de folios y vencimiento, arma el `DD` exacto y lo
 * firma con la llave del CAF (SHA1withRSA sobre bytes Latin-1).
 * @throws {DteError} EN: `CAF_TYPE_MISMATCH`, `CAF_ISSUER_MISMATCH`, `FOLIO_OUT_OF_RANGE`, `CAF_EXPIRED`. ES: los mismos códigos.
 */
export const stampDocument = (doc: Document, caf: Caf, options: StampOptions = {}): StampedDocument => {
  const { header } = doc
  if (caf.documentType !== header.type) throw new DteError('CAF_TYPE_MISMATCH', { type: header.type, cafType: caf.documentType })
  if (caf.issuerRut !== header.issuer.rut) throw new DteError('CAF_ISSUER_MISMATCH', { type: header.type })
  assertFolioInRange(caf, header.folio)
  if ((options.checkExpiry ?? true) && isCafExpired(caf, { now: options.now })) {
    throw new DteError('CAF_EXPIRED', { type: caf.documentType, authorizationDate: caf.authorizationDate })
  }
  const fields: Omit<Ted, 'signature' | 'xml'> = {
    issuerRut: header.issuer.rut,
    documentType: header.type,
    folio: header.folio,
    issueDate: header.issueDate,
    receiverRut: header.receiver.rut,
    receiverName: tedText(header.receiver.businessName),
    totalAmount: header.totals.totalAmount,
    firstItemName: tedText(doc.items[0].name),
    caf: caf.xml,
    stampedAt: chileTimestamp(options.now),
  }
  const dd = buildDdString(fields)
  const signature = signWithCaf(caf, dd)
  return { ...doc, ted: { ...fields, signature, xml: buildTedXml(dd, signature) } }
}

/**
 * EN: Verifies a `TED` XML against the CAF public key: true only when the `<DD>` bytes match the `FRMT` signature.
 * ES: Verifica un XML `TED` contra la clave pública del CAF: true solo si los bytes del `<DD>` coinciden con la firma `FRMT`.
 */
export const verifyTed = (tedXml: string, caf: Pick<Caf, 'publicKey'>): boolean => {
  const dd = /<DD>[\s\S]*?<\/DD>/.exec(tedXml)?.[0]
  const signature = /<FRMT[^>]*>([^<]*)<\/FRMT>/.exec(tedXml)?.[1]
  if (dd === undefined || signature === undefined) return false
  return verifyWithCaf(caf, dd, signature.replace(/\s+/g, ''))
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest tests/ted.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ted tests/ted.test.ts
git commit -m "feat: build, sign and verify the TED electronic stamp

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 18: Firma XMLDSig envuelta (`src/signature/xmldsig.ts`)

**Files:**
- Create: `src/signature/xmldsig.ts`
- Test: `tests/xmldsig.test.ts`

Detalles que el SII exige: `SignedInfo` canónico firmado con los namespaces heredados (`xmlns:xsi` del raíz incluido) y elementos vacíos expandidos; `SignedInfo` guardado en forma compacta (`<X/>`), con o sin `xmlns:xsi` según el documento (en el DTE no se escribe, en sobres y libros sí: ambas canonicalizan igual); `SignatureValue`, `Modulus` y `X509Certificate` a 64 columnas; `KeyInfo` con `RSAKeyValue` y `X509Data`; la `Signature` va justo después del elemento firmado, antes del cierre del raíz.

- [ ] **Step 1: Test que falla**

`tests/xmldsig.test.ts`:

```ts
import { loadCertificateFromPem } from '../src/certificate/pem'
import { sha1Base64 } from '../src/crypto/digest'
import { DteError } from '../src/errors'
import { buildSignedInfo, signEnveloped, verifyEnveloped } from '../src/signature/xmldsig'
import { canonicalizeElement, findElement } from '../src/xml/c14n'
import { parseXmlDom } from '../src/xml/parse'
import { fixtureText, FIXED_NOW } from './support/fixtures'

const NS = 'http://www.sii.cl/SiiDte'
const XSI = 'http://www.w3.org/2001/XMLSchema-instance'
const DSIG = 'http://www.w3.org/2000/09/xmldsig#'
const certificate = loadCertificateFromPem({ privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') }, { now: FIXED_NOW })
const xml = `<DTE xmlns="${NS}" xmlns:xsi="${XSI}" version="1.0"><Documento ID="DTE_T33F1"><A>it&apos;s "1"</A>\n<B/></Documento></DTE>`

describe('buildSignedInfo', () => {
  test('expanded form for signing and compact form for storing', () => {
    const digest = 'ZGlnZXN0'
    expect(buildSignedInfo('X', digest, { expandTags: true, includeXsi: true })).toBe(
      `<SignedInfo xmlns="${DSIG}" xmlns:xsi="${XSI}"><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod><Reference URI="#X"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod><DigestValue>${digest}</DigestValue></Reference></SignedInfo>`,
    )
    expect(buildSignedInfo('#X', digest, { expandTags: false, includeXsi: false })).toBe(
      `<SignedInfo xmlns="${DSIG}"><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/><Reference URI="#X"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><DigestValue>${digest}</DigestValue></Reference></SignedInfo>`,
    )
  })
})

describe('signEnveloped', () => {
  test('inserts a valid Signature after the signed element', () => {
    const { xml: signed, signature } = signEnveloped({ xml, elementTag: 'Documento', rootTag: 'DTE', certificate, includeXsiInStoredSignedInfo: false })
    expect(signed.startsWith(xml.replace('</Documento></DTE>', '</Documento>'))).toBe(true)
    expect(signed.endsWith('</Signature></DTE>')).toBe(true)
    expect(signed).toContain(`<Signature xmlns="${DSIG}"><SignedInfo xmlns="${DSIG}"><CanonicalizationMethod`)
    expect(signed).not.toContain(`<SignedInfo xmlns="${DSIG}" xmlns:xsi`)
    expect(signed).toContain(`<DigestValue>${signature.digestValue}</DigestValue>`)
    expect(signature.digestValue).toBe(sha1Base64(canonicalizeElement(findElement(parseXmlDom(xml), 'Documento'))))
    const signatureValue = /<SignatureValue>([^<]+)<\/SignatureValue>/.exec(signed)?.[1] ?? ''
    expect(signatureValue.split('\n').every((line) => line.length <= 64 && line.length > 0)).toBe(true)
    expect(signatureValue.replace(/\n/g, '')).toBe(signature.signatureValue)
    expect(/<Modulus>([^<]+)<\/Modulus>/.exec(signed)?.[1].split('\n')[0].length).toBe(64)
    expect(/<X509Certificate>([^<]+)<\/X509Certificate>/.exec(signed)?.[1].replace(/\n/g, '')).toBe(certificate.certificateBase64)
    expect(signed).toContain(`<Exponent>${certificate.publicKey.exponent}</Exponent>`)
    expect(verifyEnveloped(signed, { elementTag: 'Documento', rootTag: 'DTE' })).toEqual({ referenceId: 'DTE_T33F1', digestValid: true, signatureValid: true, valid: true })
  })

  test('stored SignedInfo with xmlns:xsi verifies too (envelopes and books)', () => {
    const envelope = `<EnvioDTE xmlns="${NS}" xmlns:xsi="${XSI}" version="1.0"><SetDTE ID="SET1"><Caratula version="1.0"><RutEmisor>76543210-3</RutEmisor></Caratula></SetDTE></EnvioDTE>`
    const { xml: signed } = signEnveloped({ xml: envelope, elementTag: 'SetDTE', rootTag: 'EnvioDTE', certificate })
    expect(signed).toContain(`<SignedInfo xmlns="${DSIG}" xmlns:xsi="${XSI}">`)
    expect(verifyEnveloped(signed, { elementTag: 'SetDTE', rootTag: 'EnvioDTE' }).valid).toBe(true)
  })

  test('is deterministic', () => {
    expect(signEnveloped({ xml, elementTag: 'Documento', rootTag: 'DTE', certificate }).xml).toBe(signEnveloped({ xml, elementTag: 'Documento', rootTag: 'DTE', certificate }).xml)
  })

  test('tampering is detected', () => {
    const { xml: signed } = signEnveloped({ xml, elementTag: 'Documento', rootTag: 'DTE', certificate })
    const content = verifyEnveloped(signed.replace('<B/>', '<B>x</B>'), { elementTag: 'Documento', rootTag: 'DTE' })
    expect(content.digestValid).toBe(false)
    expect(content.valid).toBe(false)
    const digestTampered = signed.replace(/<DigestValue>[^<]+<\/DigestValue>/, '<DigestValue>AAAA</DigestValue>')
    const both = verifyEnveloped(digestTampered, { elementTag: 'Documento', rootTag: 'DTE' })
    expect(both.digestValid).toBe(false)
    expect(both.signatureValid).toBe(false)
  })

  test('errors: no Signature, no ID, closing tags not adjacent, wrong root', () => {
    expect(() => verifyEnveloped(xml, { elementTag: 'Documento', rootTag: 'DTE' })).toThrow(DteError)
    expect(() => signEnveloped({ xml: xml.replace(' ID="DTE_T33F1"', ''), elementTag: 'Documento', rootTag: 'DTE', certificate })).toThrow(DteError)
    expect(() => signEnveloped({ xml: xml.replace('</Documento></DTE>', '</Documento>\n</DTE>'), elementTag: 'Documento', rootTag: 'DTE', certificate })).toThrow(DteError)
    expect(() => verifyEnveloped(signEnveloped({ xml, elementTag: 'Documento', rootTag: 'DTE', certificate }).xml, { elementTag: 'Documento', rootTag: 'EnvioDTE' })).toThrow(DteError)
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest tests/xmldsig.test.ts`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementación**

`src/signature/xmldsig.ts`:

```ts
import type { Certificate } from '../certificate/certificate'
import { sha1Base64 } from '../crypto/digest'
import { rsaPublicKeyPartsFromCertificatePem, rsaSha1SignBase64, rsaSha1VerifyBase64 } from '../crypto/rsa'
import { DteError } from '../errors'
import { canonicalizeElement, findElement } from '../xml/c14n'
import { wrapBase64 } from '../xml/format'
import { parseXmlDom } from '../xml/parse'

const XMLDSIG_NS = 'http://www.w3.org/2000/09/xmldsig#'
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'
const C14N_ALGORITHM = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
const RSA_SHA1_ALGORITHM = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1'
const SHA1_ALGORITHM = 'http://www.w3.org/2000/09/xmldsig#sha1'
const ENVELOPED_SIGNATURE = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature'

/**
 * EN: The two values that identify a signature.
 * ES: Los dos valores que identifican una firma.
 */
export type XmlSignature = {
  /** EN: Base64 SHA-1 of the canonical signed element. ES: `DigestValue` — SHA-1 en base64 del elemento firmado canónico. */
  readonly digestValue: string
  /** EN: Base64 RSA signature, single line. ES: `SignatureValue` — Firma RSA en base64, en una línea. */
  readonly signatureValue: string
}

/**
 * EN: Builds `SignedInfo`. `expandTags` renders empty elements as `<X></X>` (the canonical form that is signed);
 * `includeXsi` adds `xmlns:xsi`, which the canonical form inherits from the root anyway.
 * ES: Arma `SignedInfo`. `expandTags` escribe los elementos vacíos como `<X></X>` (la forma canónica que se firma);
 * `includeXsi` agrega `xmlns:xsi`, que la forma canónica hereda del raíz de todos modos.
 */
export const buildSignedInfo = (referenceId: string, digestValue: string, options: { readonly expandTags?: boolean; readonly includeXsi?: boolean } = {}): string => {
  const uri = referenceId.startsWith('#') ? referenceId : `#${referenceId}`
  const xsi = (options.includeXsi ?? true) ? ` xmlns:xsi="${XSI_NS}"` : ''
  const empty = (tag: string, algorithm: string): string =>
    options.expandTags ? `<${tag} Algorithm="${algorithm}"></${tag}>` : `<${tag} Algorithm="${algorithm}"/>`
  return (
    `<SignedInfo xmlns="${XMLDSIG_NS}"${xsi}>` +
    empty('CanonicalizationMethod', C14N_ALGORITHM) +
    empty('SignatureMethod', RSA_SHA1_ALGORITHM) +
    `<Reference URI="${uri}"><Transforms>${empty('Transform', ENVELOPED_SIGNATURE)}</Transforms>${empty('DigestMethod', SHA1_ALGORITHM)}<DigestValue>${digestValue}</DigestValue></Reference>` +
    '</SignedInfo>'
  )
}

/**
 * EN: Builds the `Signature` element from a stored `SignedInfo`, the wrapped signature and the key material.
 * ES: Arma el elemento `Signature` a partir del `SignedInfo` guardado, la firma recortada y el material de clave.
 */
export const buildSignatureXml = (signedInfo: string, signatureValue: string, keyInfo: { readonly modulus: string; readonly exponent: string; readonly certificate: string }): string =>
  `<Signature xmlns="${XMLDSIG_NS}">${signedInfo}<SignatureValue>${signatureValue}</SignatureValue><KeyInfo><KeyValue><RSAKeyValue><Modulus>${keyInfo.modulus}</Modulus><Exponent>${keyInfo.exponent}</Exponent></RSAKeyValue></KeyValue><X509Data><X509Certificate>${keyInfo.certificate}</X509Certificate></X509Data></KeyInfo></Signature>`

/**
 * EN: Input of `signEnveloped`.
 * ES: Entrada de `signEnveloped`.
 */
export type SignEnvelopedInput = {
  /** EN: Unsigned XML. ES: XML sin firma. */
  readonly xml: string
  /** EN: Tag of the element with the `ID` to sign (`Documento`, `SetDTE`, `EnvioLibro`…). ES: Etiqueta del elemento con `ID` a firmar. */
  readonly elementTag: string
  /** EN: Root tag whose closing tag follows the signed element (`DTE`, `EnvioDTE`…). ES: Etiqueta raíz cuyo cierre sigue al elemento firmado. */
  readonly rootTag: string
  /** EN: Signing certificate. ES: Certificado firmante. */
  readonly certificate: Pick<Certificate, 'privateKeyPem' | 'publicKey' | 'certificateBase64'>
  /** EN: Write `xmlns:xsi` in the stored `SignedInfo` (default true; false for the DTE). ES: Escribir `xmlns:xsi` en el `SignedInfo` guardado (por defecto true; false en el DTE). */
  readonly includeXsiInStoredSignedInfo?: boolean
}

/**
 * EN: Signs `elementTag` with an enveloped XMLDSig signature (C14N 1.0, RSA-SHA1) and returns the XML with the
 * `Signature` inserted right before `</rootTag>`.
 * ES: Firma `elementTag` con una firma XMLDSig envuelta (C14N 1.0, RSA-SHA1) y devuelve el XML con la `Signature`
 * insertada justo antes de `</rootTag>`.
 * @throws {DteError} EN: `XML_PARSE_FAILED` when the element, its `ID` or the adjacent closing tags are missing. ES: `XML_PARSE_FAILED` si faltan el elemento, su `ID` o los cierres adyacentes.
 */
export const signEnveloped = ({ xml, elementTag, rootTag, certificate, includeXsiInStoredSignedInfo = true }: SignEnvelopedInput): { readonly xml: string; readonly signature: XmlSignature } => {
  const element = findElement(parseXmlDom(xml), elementTag)
  const id = element.getAttribute('ID')
  if (!id) throw new DteError('XML_PARSE_FAILED', { field: elementTag, reason: 'missing ID attribute' })
  const closing = `</${elementTag}></${rootTag}>`
  if (!xml.includes(closing)) throw new DteError('XML_PARSE_FAILED', { field: rootTag, reason: `expected ${closing}` })
  const digestValue = sha1Base64(canonicalizeElement(element), 'utf8')
  const signedInfoToSign = buildSignedInfo(id, digestValue, { expandTags: true, includeXsi: true })
  const signedInfoToStore = buildSignedInfo(id, digestValue, { expandTags: false, includeXsi: includeXsiInStoredSignedInfo })
  const signatureValue = rsaSha1SignBase64(certificate.privateKeyPem, signedInfoToSign, 'utf8')
  const signatureXml = buildSignatureXml(signedInfoToStore, wrapBase64(signatureValue), {
    modulus: wrapBase64(certificate.publicKey.modulus),
    exponent: certificate.publicKey.exponent,
    certificate: wrapBase64(certificate.certificateBase64),
  })
  return { xml: xml.replace(closing, `</${elementTag}>${signatureXml}</${rootTag}>`), signature: { digestValue, signatureValue } }
}

/**
 * EN: Outcome of verifying an enveloped signature.
 * ES: Resultado de verificar una firma envuelta.
 */
export type SignatureVerification = {
  /** EN: `Reference/@URI` without `#`. ES: `Reference/@URI` sin `#`. */
  readonly referenceId: string | null
  /** EN: The signed element still hashes to `DigestValue`. ES: El elemento firmado sigue produciendo el `DigestValue`. */
  readonly digestValid: boolean
  /** EN: `SignatureValue` verifies with the embedded certificate. ES: `SignatureValue` verifica con el certificado embebido. */
  readonly signatureValid: boolean
  /** EN: Both checks passed. ES: Pasaron ambos chequeos. */
  readonly valid: boolean
}

const elementChildren = (parent: Element): readonly Element[] =>
  Array.from(parent.childNodes).filter((node): node is Element => node.nodeType === 1)

const textOf = (parent: Element, tag: string): string | null => parent.getElementsByTagName(tag)[0]?.textContent ?? null

/**
 * EN: Verifies the enveloped signature that is a direct child of `rootTag`: recomputes the digest of `elementTag` and
 * checks `SignatureValue` with the `X509Certificate` carried in `KeyInfo`.
 * ES: Verifica la firma envuelta que es hija directa de `rootTag`: recalcula el digest de `elementTag` y comprueba
 * `SignatureValue` con el `X509Certificate` que viene en `KeyInfo`.
 * @throws {DteError} EN: `XML_PARSE_FAILED`, `SIGNATURE_NOT_FOUND`. ES: `XML_PARSE_FAILED`, `SIGNATURE_NOT_FOUND`.
 */
export const verifyEnveloped = (xml: string, target: { readonly elementTag: string; readonly rootTag: string }): SignatureVerification => {
  const dom = parseXmlDom(xml)
  const root = dom.documentElement
  if (root.tagName !== target.rootTag) throw new DteError('XML_PARSE_FAILED', { field: target.rootTag, reason: `root is ${root.tagName}` })
  const signature = elementChildren(root).find((child) => child.tagName === 'Signature')
  if (signature === undefined) throw new DteError('SIGNATURE_NOT_FOUND', { field: target.rootTag })
  const signedInfo = signature.getElementsByTagName('SignedInfo')[0]
  if (signedInfo === undefined) throw new DteError('SIGNATURE_NOT_FOUND', { field: 'SignedInfo' })
  const storedDigest = (textOf(signedInfo, 'DigestValue') ?? '').replace(/\s+/g, '')
  const signatureValue = (textOf(signature, 'SignatureValue') ?? '').replace(/\s+/g, '')
  const certificateBase64 = (textOf(signature, 'X509Certificate') ?? '').replace(/\s+/g, '')
  const referenceUri = signedInfo.getElementsByTagName('Reference')[0]?.getAttribute('URI') ?? null
  const element = findElement(dom, target.elementTag)
  const digestValid = sha1Base64(canonicalizeElement(element), 'utf8') === storedDigest
  const certificatePem = `-----BEGIN CERTIFICATE-----\n${wrapBase64(certificateBase64)}\n-----END CERTIFICATE-----\n`
  const publicKey = (() => {
    try {
      return rsaPublicKeyPartsFromCertificatePem(certificatePem)
    } catch {
      return null
    }
  })()
  const signatureValid = publicKey !== null && rsaSha1VerifyBase64(publicKey, canonicalizeElement(signedInfo), 'utf8', signatureValue)
  return { referenceId: referenceUri === null ? null : referenceUri.replace(/^#/, ''), digestValid, signatureValid, valid: digestValid && signatureValid }
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest tests/xmldsig.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/signature tests/xmldsig.test.ts
git commit -m "feat: enveloped XMLDSig signing and verification for SII documents

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 19: XML del documento, firma y pipeline (`src/document/build-xml.ts`, `src/document/sign.ts`, `src/document/issue.ts`)

**Files:**
- Create: `src/document/build-xml.ts`, `src/document/sign.ts`, `src/document/issue.ts`
- Test: `tests/document.test.ts`

- [ ] **Step 1: Test que falla**

`tests/document.test.ts`:

```ts
import { parseCaf } from '../src/caf/parse'
import { loadCertificateFromPem } from '../src/certificate/pem'
import { buildDocumentXml, documentElementName } from '../src/document/build-xml'
import { createDocument } from '../src/document/create'
import { issueDocument } from '../src/document/issue'
import { signDocument, verifyDocumentSignature } from '../src/document/sign'
import { stampDocument, verifyTed } from '../src/ted/build'
import { encodeLatin1 } from '../src/text/latin1'
import { fixtureText, FIXED_NOW, ISSUER_RUT, RECEIVER_RUT } from './support/fixtures'

const NS = 'http://www.sii.cl/SiiDte'
const XSI = 'http://www.w3.org/2001/XMLSchema-instance'
const caf33 = parseCaf(fixtureText('caf-33.xml'))
const caf39 = parseCaf(fixtureText('caf-39.xml'))
const certificate = loadCertificateFromPem({ privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') }, { now: FIXED_NOW })
const issuer = { rut: ISSUER_RUT, businessName: 'Empresa Ejemplo SpA', businessActivity: 'Software', address: 'Av. Ejemplo 123', commune: 'Santiago', activityCode: 620200 }
const receiver = { rut: RECEIVER_RUT, businessName: 'Cliente SA', businessActivity: 'Comercio', address: 'Calle 456', commune: 'Providencia' }
const invoiceInput = { type: 33 as const, folio: 7, issueDate: '2026-11-15', issuer, receiver, items: [{ name: 'Licencia', quantity: 1, unitPrice: 100000 }, { name: 'Soporte', quantity: 3, unitPrice: 15000 }] }

describe('buildDocumentXml', () => {
  test('unsigned invoice: root, order and line breaks between sections', () => {
    const xml = buildDocumentXml(createDocument(invoiceInput))
    expect(xml.startsWith(`<DTE xmlns="${NS}" xmlns:xsi="${XSI}" version="1.0"><Documento ID="DTE_T33F7"><Encabezado><IdDoc><TipoDTE>33</TipoDTE><Folio>7</Folio><FchEmis>2026-11-15</FchEmis></IdDoc>`)).toBe(true)
    expect(xml).toContain('</Encabezado>\n<Detalle><NroLinDet>1</NroLinDet>')
    expect(xml).toContain('</Detalle>\n<Detalle><NroLinDet>2</NroLinDet>')
    expect(xml.endsWith('</Detalle></Documento></DTE>')).toBe(true)
    expect(xml).not.toContain('<TED')
    expect(xml).not.toContain('TmstFirma')
    expect(xml).toMatchSnapshot()
  })

  test('stamped document embeds the TED on its own line and TmstFirma when given', () => {
    const stamped = stampDocument(createDocument(invoiceInput), caf33, { now: FIXED_NOW })
    const xml = buildDocumentXml(stamped, { ted: stamped.ted, signedAt: '2026-11-15T15:30:00' })
    expect(xml).toContain(`</Detalle>\n${stamped.ted.xml}\n<TmstFirma>2026-11-15T15:30:00</TmstFirma></Documento></DTE>`)
  })

  test('a 60-line receipt never exceeds the 4090-character line limit', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ name: `Producto de nombre largo numero ${i + 1} (con detalle adicional del producto)`, quantity: 1, unitPrice: 1000 + i }))
    const stamped = stampDocument(createDocument({ type: 39, folio: 1, issueDate: '2026-11-15', issuer, items, pricesIncludeVat: true }), caf39, { now: FIXED_NOW })
    const xml = buildDocumentXml(stamped, { ted: stamped.ted, signedAt: '2026-11-15T15:30:00' })
    const longest = Math.max(...xml.split('\n').map((line) => line.length))
    expect(xml.replace(/\n/g, '').length).toBeGreaterThan(4090 * 2)
    expect(longest).toBeLessThan(4090)
    expect(xml.split('\n').filter((line) => line.startsWith('<Detalle>')).length).toBe(60)
  })

  test('settlement invoice uses the Liquidacion element', () => {
    expect(documentElementName(43)).toBe('Liquidacion')
    expect(documentElementName(33)).toBe('Documento')
    const doc = createDocument({ type: 43, folio: 1, issueDate: '2026-11-15', issuer, receiver, items: [{ name: 'Venta', unitPrice: 1000, settledDocumentType: '33' }], commissions: [{ kind: 'commission', description: 'Comisión', netValue: 100 }] })
    const xml = buildDocumentXml(doc)
    expect(xml).toContain('<Liquidacion ID="DTE_T43F1">')
    expect(xml).toContain('</Detalle>\n<Comisiones><NroLinCom>1</NroLinCom><TipoMovim>C</TipoMovim><Glosa>Comisión</Glosa><ValComNeto>100</ValComNeto></Comisiones></Liquidacion></DTE>')
  })
})

describe('signDocument / issueDocument', () => {
  test('signs a stamped document and the result verifies', () => {
    const stamped = stampDocument(createDocument(invoiceInput), caf33, { now: FIXED_NOW })
    const signed = signDocument(stamped, certificate, { now: FIXED_NOW })
    expect(signed.signedAt).toBe('2026-11-15T15:30:00')
    expect(signed.xml).toContain(`<TmstFirma>2026-11-15T15:30:00</TmstFirma></Documento><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><CanonicalizationMethod`)
    expect(signed.xml.endsWith('</Signature></DTE>')).toBe(true)
    expect(signed.signature.digestValue.length).toBe(28)
    expect(verifyDocumentSignature(signed.xml)).toMatchObject({ referenceId: 'DTE_T33F7', valid: true })
    expect(verifyTed(signed.ted.xml, caf33)).toBe(true)
    expect(() => encodeLatin1(signed.xml)).not.toThrow()
  })

  test('issueDocument accepts raw input or a created document and is deterministic', () => {
    const fromInput = issueDocument({ document: invoiceInput, caf: caf33, certificate, now: FIXED_NOW })
    const fromDocument = issueDocument({ document: createDocument(invoiceInput), caf: caf33, certificate, now: FIXED_NOW })
    expect(fromInput.xml).toBe(fromDocument.xml)
    expect(fromInput.id).toBe('DTE_T33F7')
  })

  test('issueDocument signs a settlement invoice and a receipt', () => {
    const settlement = issueDocument({
      document: { type: 43, folio: 1, issueDate: '2026-11-15', issuer, receiver, items: [{ name: 'Venta', unitPrice: 1000, settledDocumentType: '33' }] },
      caf: parseCaf(fixtureText('caf-33.xml').replace(/<TD>33<\/TD>/, '<TD>43</TD>')),
      certificate,
      now: FIXED_NOW,
      checkCafExpiry: false,
    })
    expect(settlement.xml).toContain('<Liquidacion ID="DTE_T43F1">')
    expect(verifyDocumentSignature(settlement.xml).valid).toBe(true)
    const receipt = issueDocument({ document: { type: 39, folio: 2, issueDate: '2026-11-15', issuer, items: [{ name: 'Café', unitPrice: 1000 }], pricesIncludeVat: true }, caf: caf39, certificate, now: FIXED_NOW })
    expect(receipt.xml).toContain('<IndServicio>3</IndServicio>')
    expect(verifyDocumentSignature(receipt.xml).valid).toBe(true)
  })

  test('tampered content fails verification', () => {
    const signed = issueDocument({ document: invoiceInput, caf: caf33, certificate, now: FIXED_NOW })
    expect(verifyDocumentSignature(signed.xml.replace('<MntTotal>172550</MntTotal>', '<MntTotal>1</MntTotal>')).valid).toBe(false)
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest tests/document.test.ts`
Expected: FAIL, módulos no encontrados.

- [ ] **Step 3: Implementación**

`src/document/build-xml.ts`:

```ts
import type { DocumentType } from '../catalogs/document-types'
import { toSiiDocument } from '../model/codec'
import type { Document } from '../model/document'
import type { Ted } from '../ted/build'
import { buildXml } from '../xml/build'

const SII_NS = 'http://www.sii.cl/SiiDte'
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'
const TED_PLACEHOLDER = '__DTE_SDK_TED__'

// The SII rejects any line longer than ~4090 characters (`CHR-00002`). Breaking the line after these sections keeps
// every line short no matter how many detail lines the document has. The breaks sit inside the signed element, so the
// digest covers them exactly as the SII will see them.
const LINE_BREAK_AFTER = /<\/(Encabezado|Detalle|SubTotInfo|DscRcgGlobal|Referencia|Comisiones|TED)><(?=[A-Za-z])/g

/**
 * EN: Name of the signed element: `Liquidacion` for settlement invoices (43), `Documento` otherwise.
 * ES: Nombre del elemento firmado: `Liquidacion` para liquidación factura (43), `Documento` para el resto.
 */
export const documentElementName = (type: DocumentType): 'Documento' | 'Liquidacion' => (type === 43 ? 'Liquidacion' : 'Documento')

/**
 * EN: Options of `buildDocumentXml`.
 * ES: Opciones de `buildDocumentXml`.
 */
export type BuildDocumentXmlOptions = {
  /** EN: TED to embed. ES: TED a incluir. */
  readonly ted?: Ted
  /** EN: `TmstFirma` value. ES: Valor de `TmstFirma`. */
  readonly signedAt?: string
}

/**
 * EN: Renders the unsigned `<DTE>` XML: namespaces on the root (the digest inherits them), `ID` on the signed element,
 * sections in schema order, the TED verbatim and a line break between sections.
 * ES: Renderiza el XML `<DTE>` sin firma: namespaces en el raíz (el digest los hereda), `ID` en el elemento firmado,
 * secciones en el orden del esquema, el TED textual y un salto de línea entre secciones.
 */
export const buildDocumentXml = (doc: Document, options: BuildDocumentXmlOptions = {}): string => {
  const element: Record<string, unknown> = { '@_ID': doc.id, ...toSiiDocument(doc) }
  if (options.ted !== undefined) element.TED = TED_PLACEHOLDER
  if (options.signedAt !== undefined) element.TmstFirma = options.signedAt
  const xml = buildXml({ DTE: { '@_xmlns': SII_NS, '@_xmlns:xsi': XSI_NS, '@_version': '1.0', [documentElementName(doc.header.type)]: element } })
  const withTed = options.ted === undefined ? xml : xml.replace(`<TED>${TED_PLACEHOLDER}</TED>`, options.ted.xml)
  return withTed.replace(LINE_BREAK_AFTER, '</$1>\n<')
}
```

`src/document/sign.ts`:

```ts
import type { Certificate } from '../certificate/certificate'
import { signEnveloped, verifyEnveloped, type SignatureVerification, type XmlSignature } from '../signature/xmldsig'
import type { StampedDocument } from '../ted/build'
import { chileTimestamp } from '../time/chile'
import { buildDocumentXml, documentElementName } from './build-xml'

/**
 * EN: A stamped document that has been signed: carries the final XML.
 * ES: Un documento timbrado y firmado: trae el XML final.
 */
export type SignedDocument = StampedDocument & {
  /** EN: Signed `<DTE>` XML (no prolog). ES: XML `<DTE>` firmado (sin prólogo). */
  readonly xml: string
  /** EN: `TmstFirma`, Chile time. ES: `TmstFirma`, hora de Chile. */
  readonly signedAt: string
  /** EN: Digest and signature values. ES: Valores de digest y firma. */
  readonly signature: XmlSignature
}

/**
 * EN: Signs a stamped document with the issuer certificate (enveloped XMLDSig over `Documento`/`Liquidacion`).
 * ES: Firma un documento timbrado con el certificado del emisor (XMLDSig envuelta sobre `Documento`/`Liquidacion`).
 */
export const signDocument = (doc: StampedDocument, certificate: Certificate, options: { readonly now?: Date } = {}): SignedDocument => {
  const signedAt = chileTimestamp(options.now)
  const unsigned = buildDocumentXml(doc, { ted: doc.ted, signedAt })
  const { xml, signature } = signEnveloped({
    xml: unsigned,
    elementTag: documentElementName(doc.header.type),
    rootTag: 'DTE',
    certificate,
    includeXsiInStoredSignedInfo: false,
  })
  return { ...doc, xml, signedAt, signature }
}

/**
 * EN: Verifies the signature of a `<DTE>` XML (own or received).
 * ES: Verifica la firma de un XML `<DTE>` (propio o recibido).
 */
export const verifyDocumentSignature = (xml: string): SignatureVerification =>
  verifyEnveloped(xml, { elementTag: xml.includes('<Liquidacion') ? 'Liquidacion' : 'Documento', rootTag: 'DTE' })
```

`src/document/issue.ts`:

```ts
import type { Caf } from '../caf/parse'
import type { Certificate } from '../certificate/certificate'
import type { Document, DocumentInput } from '../model/document'
import { stampDocument } from '../ted/build'
import { createDocument } from './create'
import { signDocument, type SignedDocument } from './sign'

/**
 * EN: Input of `issueDocument`.
 * ES: Entrada de `issueDocument`.
 */
export type IssueDocumentInput = {
  /** EN: Raw input or an already created document. ES: Entrada cruda o un documento ya creado. */
  readonly document: DocumentInput | Document
  /** EN: CAF covering the folio. ES: CAF que cubre el folio. */
  readonly caf: Caf
  /** EN: Issuer certificate. ES: Certificado del emisor. */
  readonly certificate: Certificate
  /** EN: Clock for dates and timestamps. ES: Reloj para fechas y marcas de tiempo. */
  readonly now?: Date
  /** EN: Check CAF expiry (default true). ES: Chequear vencimiento del CAF (por defecto true). */
  readonly checkCafExpiry?: boolean
}

const isDocument = (value: DocumentInput | Document): value is Document => 'header' in value

/**
 * EN: The whole pipeline: create (if needed) → stamp with the CAF → sign with the certificate.
 * ES: El flujo completo: crear (si hace falta) → timbrar con el CAF → firmar con el certificado.
 */
export const issueDocument = ({ document, caf, certificate, now, checkCafExpiry }: IssueDocumentInput): SignedDocument => {
  const doc = isDocument(document) ? document : createDocument(document, { now })
  return signDocument(stampDocument(doc, caf, { now, checkExpiry: checkCafExpiry }), certificate, { now })
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest tests/document.test.ts`
Expected: PASS; la primera corrida escribe `tests/__snapshots__/document.test.ts.snap`. Ábrelo y revisa que el XML sea el esperado antes de commitear.

- [ ] **Step 5: Commit**

```bash
git add src/document tests/document.test.ts tests/__snapshots__/document.test.ts.snap
git commit -m "feat: render, sign and issue DTE documents end to end

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 20: Sobres EnvioDTE / EnvioBOLETA (`src/envelope/create.ts`, `src/envelope/build-xml.ts`, `src/envelope/sign.ts`)

**Files:**
- Create: `src/envelope/create.ts`, `src/envelope/build-xml.ts`, `src/envelope/sign.ts`
- Test: `tests/envelope.test.ts`

- [ ] **Step 1: Test que falla**

`tests/envelope.test.ts`:

```ts
import { parseCaf } from '../src/caf/parse'
import { loadCertificateFromPem } from '../src/certificate/pem'
import { issueDocument } from '../src/document/issue'
import { verifyDocumentSignature } from '../src/document/sign'
import { buildEnvelopeXml } from '../src/envelope/build-xml'
import { createEnvelope, generateSetId } from '../src/envelope/create'
import { signEnvelope, verifyEnvelopeSignature } from '../src/envelope/sign'
import { DteError } from '../src/errors'
import { encodeLatin1 } from '../src/text/latin1'
import { fixtureText, FIXED_NOW, ISSUER_RUT, RECEIVER_RUT } from './support/fixtures'

const caf33 = parseCaf(fixtureText('caf-33.xml'))
const caf39 = parseCaf(fixtureText('caf-39.xml'))
const certificate = loadCertificateFromPem({ privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') }, { now: FIXED_NOW })
const issuer = { rut: ISSUER_RUT, businessName: 'Empresa Ejemplo SpA', businessActivity: 'Software', address: 'Av. Ejemplo 123', commune: 'Ñuñoa' }
const receiver = { rut: RECEIVER_RUT, businessName: 'Cliente SA', businessActivity: 'Comercio', address: 'Calle 456', commune: 'Providencia' }
const cafFor = (type: number) => parseCaf(fixtureText('caf-33.xml').replace(/<TD>33<\/TD>/, `<TD>${type}</TD>`))
const issue = (type: 33 | 56 | 61 | 52, folio: number) =>
  issueDocument({ document: { type, folio, issueDate: '2026-11-15', issuer, receiver, items: [{ name: 'Ítem', unitPrice: 1000 }], references: type === 33 || type === 52 ? [] : [{ documentType: 33, folio: 1, date: '2026-11-01', code: 1, reason: 'Anula' }] }, caf: type === 33 ? caf33 : cafFor(type), certificate, now: FIXED_NOW })
const receipt = (folio: number) => issueDocument({ document: { type: 39, folio, issueDate: '2026-11-15', issuer, items: [{ name: 'Café', unitPrice: 1000 }], pricesIncludeVat: true }, caf: caf39, certificate, now: FIXED_NOW })
const cover = { issuerRut: '76.543.210-3', senderRut: ISSUER_RUT, resolutionDate: '22-08-2014', resolutionNumber: 80 }

const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn()
    throw new Error('expected DteError')
  } catch (err) {
    expect(err).toBeInstanceOf(DteError)
    expect((err as DteError).code).toBe(code)
  }
}

describe('createEnvelope', () => {
  test('dte envelope: normalized cover, generated set id and subtotals with 33, 61, 56 first', () => {
    const envelope = createEnvelope({ kind: 'dte', documents: [issue(56, 1), issue(52, 2), issue(33, 3), issue(33, 4), issue(61, 5)], cover, now: FIXED_NOW })
    expect(envelope.setId).toBe('DTE_SetDoc_15_11_2026_15_30_00_000')
    expect(envelope.cover).toEqual({
      issuerRut: ISSUER_RUT,
      senderRut: ISSUER_RUT,
      receiverRut: '60803000-K',
      resolutionDate: '2014-08-22',
      resolutionNumber: 80,
      signedAt: '2026-11-15T15:30:00',
      subtotals: [{ type: 33, count: 2 }, { type: 61, count: 1 }, { type: 56, count: 1 }, { type: 52, count: 1 }],
    })
  })

  test('explicit receiver, set id and timestamp are respected', () => {
    const envelope = createEnvelope({ kind: 'dte', documents: [issue(33, 1)], cover: { ...cover, receiverRut: RECEIVER_RUT, setId: 'SET-X', signedAt: '2026-01-01T00:00:00' }, now: FIXED_NOW })
    expect(envelope.setId).toBe('SET-X')
    expect(envelope.cover.receiverRut).toBe(RECEIVER_RUT)
    expect(envelope.cover.signedAt).toBe('2026-01-01T00:00:00')
  })

  test('receipt envelope always targets the SII and uses the ENVIOBOLETA prefix', () => {
    const envelope = createEnvelope({ kind: 'receipt', documents: [receipt(1), receipt(2)], cover: { ...cover, receiverRut: RECEIVER_RUT }, now: FIXED_NOW })
    expect(envelope.setId).toBe('ENVIOBOLETA_15_11_2026_15_30_00_000')
    expect(envelope.cover.receiverRut).toBe('60803000-K')
    expect(envelope.cover.subtotals).toEqual([{ type: 39, count: 2 }])
  })

  test('rejects empty envelopes, mixed kinds and bad covers', () => {
    expectCode(() => createEnvelope({ kind: 'dte', documents: [], cover }), 'ENVELOPE_EMPTY')
    expectCode(() => createEnvelope({ kind: 'dte', documents: [receipt(1)], cover }), 'ENVELOPE_KIND_MISMATCH')
    expectCode(() => createEnvelope({ kind: 'receipt', documents: [issue(33, 1)], cover }), 'ENVELOPE_KIND_MISMATCH')
    expectCode(() => createEnvelope({ kind: 'dte', documents: [issue(33, 1)], cover: { ...cover, senderRut: 'x' } }), 'INVALID_RUT')
    expectCode(() => createEnvelope({ kind: 'dte', documents: [issue(33, 1)], cover: { ...cover, resolutionDate: 'ayer' } }), 'INVALID_DATE')
  })

  test('generateSetId pads milliseconds', () => {
    expect(generateSetId('X', new Date('2026-11-15T18:30:05.007Z'))).toBe('X_15_11_2026_15_30_05_007')
    expect(generateSetId('X')).toMatch(/^X_\d{2}_\d{2}_\d{4}_\d{2}_\d{2}_\d{2}_\d{3}$/)
  })
})

describe('buildEnvelopeXml / signEnvelope', () => {
  test('renders prolog, root, caratula and the documents joined by newlines without inner prologs', () => {
    const docs = [issue(33, 1), issue(33, 2)]
    const envelope = createEnvelope({ kind: 'dte', documents: docs, cover, now: FIXED_NOW })
    const xml = buildEnvelopeXml(envelope)
    expect(xml.startsWith('<?xml version="1.0" encoding="ISO-8859-1"?>\n<EnvioDTE xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte EnvioDTE_v10.xsd" version="1.0"><SetDTE ID="DTE_SetDoc_15_11_2026_15_30_00_000"><Caratula version="1.0">')).toBe(true)
    expect(xml).toContain(`<RutEmisor>${ISSUER_RUT}</RutEmisor><RutEnvia>${ISSUER_RUT}</RutEnvia><RutReceptor>60803000-K</RutReceptor><FchResol>2014-08-22</FchResol><NroResol>80</NroResol><TmstFirmaEnv>2026-11-15T15:30:00</TmstFirmaEnv><SubTotDTE><TpoDTE>33</TpoDTE><NroDTE>2</NroDTE></SubTotDTE></Caratula>`)
    expect(xml).toContain(`</Caratula>${docs[0].xml}\n${docs[1].xml}</SetDTE></EnvioDTE>`)
    expect(xml.indexOf('<?xml')).toBe(xml.lastIndexOf('<?xml'))
  })

  test('receipt envelope uses EnvioBOLETA and its schema', () => {
    const xml = buildEnvelopeXml(createEnvelope({ kind: 'receipt', documents: [receipt(1)], cover, now: FIXED_NOW }))
    expect(xml).toContain('<EnvioBOLETA xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte EnvioBOLETA_v11.xsd" version="1.0"><SetDTE ID="ENVIOBOLETA_')
    expect(xml.endsWith('</SetDTE></EnvioBOLETA>')).toBe(true)
  })

  test('signs the SetDTE; envelope and inner documents all verify; Latin-1 encodable', () => {
    const signed = signEnvelope(createEnvelope({ kind: 'dte', documents: [issue(33, 1), issue(61, 2)], cover, now: FIXED_NOW }), certificate)
    expect(signed.xml).toContain('</SetDTE><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">')
    expect(signed.xml.endsWith('</Signature></EnvioDTE>')).toBe(true)
    expect(verifyEnvelopeSignature(signed.xml)).toMatchObject({ referenceId: signed.setId, valid: true })
    for (const doc of signed.documents) expect(verifyDocumentSignature(doc.xml).valid).toBe(true)
    expect(encodeLatin1(signed.xml).length).toBe(signed.xml.length)
    expect(signed.xml).toContain('Ñuñoa')
  })

  test('receipt envelope signs and verifies', () => {
    const signed = signEnvelope(createEnvelope({ kind: 'receipt', documents: [receipt(1)], cover, now: FIXED_NOW }), certificate)
    expect(verifyEnvelopeSignature(signed.xml).valid).toBe(true)
  })

  test('tampering a cover value breaks the envelope signature', () => {
    const signed = signEnvelope(createEnvelope({ kind: 'dte', documents: [issue(33, 1)], cover, now: FIXED_NOW }), certificate)
    expect(verifyEnvelopeSignature(signed.xml.replace('<NroResol>80</NroResol>', '<NroResol>81</NroResol>')).valid).toBe(false)
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest tests/envelope.test.ts`
Expected: FAIL, módulos no encontrados.

- [ ] **Step 3: Implementación**

`src/envelope/create.ts`:

```ts
import { SII_RUT } from '../catalogs/codes'
import { isReceipt, type DocumentType } from '../catalogs/document-types'
import type { SignedDocument } from '../document/sign'
import { DteError } from '../errors'
import type { EnvelopeCover, EnvelopeCoverInput, EnvelopeSubtotal } from '../model/cover'
import { toSiiRut } from '../model/rut'
import { chileDateTimeParts, chileTimestamp, toIsoDate } from '../time/chile'

/**
 * EN: `dte` → `EnvioDTE` (invoices, guides, notes…); `receipt` → `EnvioBOLETA` (39, 41).
 * ES: `dte` → `EnvioDTE` (facturas, guías, notas…); `receipt` → `EnvioBOLETA` (boletas 39, 41).
 */
export type EnvelopeKind = 'dte' | 'receipt'

/**
 * EN: An envelope ready to render and sign.
 * ES: Un sobre listo para renderizar y firmar.
 */
export type Envelope = {
  readonly kind: EnvelopeKind
  /** EN: `SetDTE/@ID`. ES: `SetDTE/@ID` — Identificador del set. */
  readonly setId: string
  readonly cover: EnvelopeCover
  readonly documents: readonly SignedDocument[]
}

/**
 * EN: Input of `createEnvelope`.
 * ES: Entrada de `createEnvelope`.
 */
export type CreateEnvelopeInput = {
  readonly kind: EnvelopeKind
  readonly documents: readonly SignedDocument[]
  readonly cover: EnvelopeCoverInput
  /** EN: Clock for the set id and `TmstFirmaEnv`. ES: Reloj para el id del set y `TmstFirmaEnv`. */
  readonly now?: Date
}

// Convention for SetDTE ids: prefix + Chile-local date/time + milliseconds, unique within a process.
const SUBTOTAL_PRIORITY: readonly number[] = [33, 61, 56]

/**
 * EN: `PREFIX_dd_mm_yyyy_hh_mm_ss_mmm` in Chile time.
 * ES: `PREFIJO_dd_mm_aaaa_hh_mm_ss_mmm` en hora de Chile.
 */
export const generateSetId = (prefix: string, now: Date = new Date()): string => {
  const p = chileDateTimeParts(now)
  return `${prefix}_${p.day}_${p.month}_${p.year}_${p.hour}_${p.minute}_${p.second}_${String(now.getMilliseconds()).padStart(3, '0')}`
}

const countByType = (documents: readonly SignedDocument[]): readonly EnvelopeSubtotal[] => {
  const counts = new Map<DocumentType, number>()
  for (const document of documents) counts.set(document.header.type, (counts.get(document.header.type) ?? 0) + 1)
  return Array.from(counts, ([type, count]) => ({ type, count }))
}

const rank = (type: number): number => {
  const index = SUBTOTAL_PRIORITY.indexOf(type)
  return index === -1 ? SUBTOTAL_PRIORITY.length + type : index
}

/**
 * EN: Groups signed documents under a cover: validates the kind, normalizes RUTs and the resolution date, counts
 * documents per type (`SubTotDTE`, with 33/61/56 first on `EnvioDTE`) and generates the set id.
 * ES: Agrupa documentos firmados bajo una carátula: valida el tipo de sobre, normaliza RUT y fecha de resolución,
 * cuenta documentos por tipo (`SubTotDTE`, con 33/61/56 primero en `EnvioDTE`) y genera el id del set.
 * @throws {DteError} EN: `ENVELOPE_EMPTY`, `ENVELOPE_KIND_MISMATCH`, `INVALID_RUT`, `INVALID_DATE`. ES: los mismos códigos.
 */
export const createEnvelope = ({ kind, documents, cover, now }: CreateEnvelopeInput): Envelope => {
  if (documents.length === 0) throw new DteError('ENVELOPE_EMPTY', { kind })
  for (const document of documents) {
    if (isReceipt(document.header.type) !== (kind === 'receipt')) throw new DteError('ENVELOPE_KIND_MISMATCH', { kind, type: document.header.type })
  }
  const subtotals = countByType(documents)
  return {
    kind,
    setId: cover.setId ?? generateSetId(kind === 'receipt' ? 'ENVIOBOLETA' : 'DTE_SetDoc', now),
    cover: {
      issuerRut: toSiiRut(cover.issuerRut, 'cover.issuerRut'),
      senderRut: toSiiRut(cover.senderRut, 'cover.senderRut'),
      receiverRut: kind === 'receipt' ? toSiiRut(SII_RUT) : toSiiRut(cover.receiverRut ?? SII_RUT, 'cover.receiverRut'),
      resolutionDate: toIsoDate(cover.resolutionDate, 'cover.resolutionDate'),
      resolutionNumber: cover.resolutionNumber,
      signedAt: cover.signedAt ?? chileTimestamp(now),
      subtotals: kind === 'dte' ? [...subtotals].sort((a, b) => rank(a.type) - rank(b.type)) : subtotals,
    },
    documents,
  }
}
```

`src/envelope/build-xml.ts`:

```ts
import type { Envelope } from './create'

const SII_NS = 'http://www.sii.cl/SiiDte'
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'

/**
 * EN: Root element of an envelope kind.
 * ES: Elemento raíz de cada tipo de sobre.
 */
export const envelopeRootName = (kind: Envelope['kind']): 'EnvioDTE' | 'EnvioBOLETA' => (kind === 'receipt' ? 'EnvioBOLETA' : 'EnvioDTE')

const stripProlog = (xml: string): string => xml.replace(/^\s*<\?xml[^>]*\?>\s*/, '').trim()

/**
 * EN: Renders the unsigned envelope: ISO-8859-1 prolog, root with schema location, `SetDTE` with `Caratula` and the
 * signed documents one per line (their namespaces stay: the digests depend on them).
 * ES: Renderiza el sobre sin firma: prólogo ISO-8859-1, raíz con schemaLocation, `SetDTE` con `Caratula` y los
 * documentos firmados uno por línea (conservan sus namespaces: los digests dependen de ellos).
 */
export const buildEnvelopeXml = (envelope: Envelope): string => {
  const root = envelopeRootName(envelope.kind)
  const schema = envelope.kind === 'receipt' ? 'EnvioBOLETA_v11.xsd' : 'EnvioDTE_v10.xsd'
  const c = envelope.cover
  const subtotals = c.subtotals.map((s) => `<SubTotDTE><TpoDTE>${s.type}</TpoDTE><NroDTE>${s.count}</NroDTE></SubTotDTE>`).join('')
  const caratula = `<Caratula version="1.0"><RutEmisor>${c.issuerRut}</RutEmisor><RutEnvia>${c.senderRut}</RutEnvia><RutReceptor>${c.receiverRut}</RutReceptor><FchResol>${c.resolutionDate}</FchResol><NroResol>${c.resolutionNumber}</NroResol><TmstFirmaEnv>${c.signedAt}</TmstFirmaEnv>${subtotals}</Caratula>`
  const documents = envelope.documents.map((document) => stripProlog(document.xml)).join('\n')
  return `<?xml version="1.0" encoding="ISO-8859-1"?>\n<${root} xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}" xsi:schemaLocation="${SII_NS} ${schema}" version="1.0"><SetDTE ID="${envelope.setId}">${caratula}${documents}</SetDTE></${root}>`
}
```

`src/envelope/sign.ts`:

```ts
import type { Certificate } from '../certificate/certificate'
import { signEnveloped, verifyEnveloped, type SignatureVerification, type XmlSignature } from '../signature/xmldsig'
import { buildEnvelopeXml, envelopeRootName } from './build-xml'
import type { Envelope } from './create'

/**
 * EN: An envelope with its signed XML, ready to encode as ISO-8859-1 and upload.
 * ES: Un sobre con su XML firmado, listo para codificar en ISO-8859-1 y subir.
 */
export type SignedEnvelope = Envelope & {
  /** EN: Signed XML with prolog. ES: XML firmado con prólogo. */
  readonly xml: string
  readonly signature: XmlSignature
}

/**
 * EN: Signs the `SetDTE` with the sender certificate.
 * ES: Firma el `SetDTE` con el certificado de quien envía.
 */
export const signEnvelope = (envelope: Envelope, certificate: Certificate): SignedEnvelope => {
  const { xml, signature } = signEnveloped({ xml: buildEnvelopeXml(envelope), elementTag: 'SetDTE', rootTag: envelopeRootName(envelope.kind), certificate })
  return { ...envelope, xml, signature }
}

/**
 * EN: Verifies the `SetDTE` signature of an `EnvioDTE`/`EnvioBOLETA` XML.
 * ES: Verifica la firma del `SetDTE` de un XML `EnvioDTE`/`EnvioBOLETA`.
 */
export const verifyEnvelopeSignature = (xml: string): SignatureVerification =>
  verifyEnveloped(xml, { elementTag: 'SetDTE', rootTag: xml.includes('<EnvioBOLETA') ? 'EnvioBOLETA' : 'EnvioDTE' })
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest tests/envelope.test.ts`
Expected: PASS (incluido el sobre con dos DTE firmados: confirma el ajuste de `verifyEnveloped` de la Task 18).

- [ ] **Step 5: Commit**

```bash
git add src/envelope tests/envelope.test.ts
git commit -m "feat: EnvioDTE and EnvioBOLETA envelopes with signed SetDTE

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 21: API pública, tests de tipos, smoke de `dist/` y documentación

**Files:**
- Modify: `src/index.ts`, `tests/dist.smoke.test.ts`, `README.md`, `llms.txt`, `CHANGELOG.md`
- Create: `tests/types.test.ts`

- [ ] **Step 1: Tests que fallan**

`tests/types.test.ts`:

```ts
import { expectTypeOf } from 'expect-type'
import {
  createDocument,
  issueDocument,
  stampDocument,
  signDocument,
  toSiiRut,
  DOCUMENT_TYPES,
  classifyUploadStatus,
  parseCaf,
  loadCertificateFromPkcs12,
  createEnvelope,
  signEnvelope,
  DteError,
} from '../src'
import type { Document, SignedDocument, StampedDocument, SiiRut, DteErrorCode, UploadStatusClass, Caf, Certificate, Envelope, SignedEnvelope } from '../src'

const _typecheck = () => {
  expectTypeOf(createDocument).returns.toEqualTypeOf<Document>()
  expectTypeOf(stampDocument).returns.toEqualTypeOf<StampedDocument>()
  expectTypeOf(signDocument).returns.toEqualTypeOf<SignedDocument>()
  expectTypeOf(issueDocument).returns.toEqualTypeOf<SignedDocument>()
  expectTypeOf(toSiiRut).returns.toEqualTypeOf<SiiRut>()
  expectTypeOf<SiiRut>().toMatchTypeOf<string>()
  expectTypeOf<string>().not.toMatchTypeOf<SiiRut>()
  expectTypeOf(DOCUMENT_TYPES.invoice).toEqualTypeOf<33>()
  expectTypeOf(classifyUploadStatus).returns.toEqualTypeOf<UploadStatusClass>()
  expectTypeOf(parseCaf).returns.toEqualTypeOf<Caf>()
  expectTypeOf(loadCertificateFromPkcs12).returns.toEqualTypeOf<Certificate>()
  expectTypeOf(createEnvelope).returns.toEqualTypeOf<Envelope>()
  expectTypeOf(signEnvelope).returns.toEqualTypeOf<SignedEnvelope>()
  expectTypeOf<DteError['code']>().toEqualTypeOf<DteErrorCode>()
}

test('public API types compile', () => {
  expect(typeof _typecheck).toBe('function')
})
```

Reemplazar `tests/dist.smoke.test.ts` completo por:

```ts
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
    expect(execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }).trim()).toBe('ok')
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
    const certificate = sdk.loadCertificateFromPkcs12(new Uint8Array(readFileSync(join(fixtures, 'cert.pfx'))), 'secret')
    const signed = sdk.issueDocument({
      document: {
        type: 33,
        folio: 1,
        issuer: { rut: '76543210-3', businessName: 'Empresa Ejemplo SpA', businessActivity: 'Software', address: 'Av. 1', commune: 'Santiago' },
        receiver: { rut: '12345678-5', businessName: 'Cliente', businessActivity: 'Comercio', address: 'Calle 2', commune: 'Providencia' },
        items: [{ name: 'Servicio', unitPrice: 1000 }],
      },
      caf,
      certificate,
      checkCafExpiry: false,
    })
    expect(sdk.verifyDocumentSignature(signed.xml).valid).toBe(true)
  })
})
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx jest tests/types.test.ts`
Expected: FAIL (`../src` no exporta nada todavía).

- [ ] **Step 3: Implementación**

`src/index.ts`:

```ts
/**
 * EN: dte-sdk public API. Everything is exported from this single entry.
 * ES: API pública de dte-sdk. Todo se exporta desde esta única entrada.
 */
export { DteError, DTE_ERROR_CODES, isDteError } from './errors'
export type { DteErrorCode, DteErrorDetails } from './errors'

export {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_VALUES,
  isDocumentType,
  isReceipt,
  isExemptType,
  isNote,
  requiresReceiver,
  isTransferable,
  documentTypeName,
} from './catalogs/document-types'
export type { DocumentType } from './catalogs/document-types'
export {
  ENVIRONMENTS,
  isEnvironment,
  REFERENCE_CODES,
  TRANSFER_TYPES,
  DISPATCH_TYPES,
  SERVICE_INDICATORS,
  PAYMENT_TERMS,
  EXEMPT_INDICATORS,
  WITHHOLDING_TAX_CODES,
  VAT_RATE,
  SII_RUT,
  FINAL_CONSUMER_RUT,
  CERTIFICATION_KEY_ID,
} from './catalogs/codes'
export type { Environment, ReferenceCode, TransferType, DispatchType, ServiceIndicator, PaymentTerms, ExemptIndicator } from './catalogs/codes'
export { SII_HOSTS, SOAP_ENDPOINTS, REST_ENDPOINTS, CLAIM_WS_ENDPOINTS, UPLOAD_USER_AGENT } from './catalogs/endpoints'
export { classifyUploadStatus, uploadStatusMessage, isRetryableStatus, classifyDocumentStatus, documentStatusMessage } from './catalogs/upload-status'
export type { UploadStatusClass, UploadChannel, DocumentStatusClass } from './catalogs/upload-status'

export { toSiiRut, isSiiRut, splitSiiRut } from './model/rut'
export type { SiiRut } from './model/rut'
export type {
  Issuer,
  IssuerInput,
  Receiver,
  ReceiverInput,
  ItemCode,
  LineItem,
  LineItemInput,
  Withholding,
  CommissionTotals,
  Totals,
  Reference,
  ReferenceInput,
  GlobalAdjustment,
  GlobalAdjustmentInput,
  CommissionLine,
  CommissionLineInput,
  Driver,
  Transport,
  TransportInput,
  Payment,
  HeaderOptions,
  SubtotalInfo,
  Header,
  Document,
  DocumentInput,
} from './model/document'
export type {
  SiiDocumento,
  SiiEncabezado,
  SiiIdDoc,
  SiiMntPagos,
  SiiEmisor,
  SiiReceptor,
  SiiTransporte,
  SiiTotales,
  SiiImptoReten,
  SiiComisionesTotales,
  SiiDetalle,
  SiiCdgItem,
  SiiSubTotInfo,
  SiiDscRcgGlobal,
  SiiReferencia,
  SiiComisiones,
} from './model/sii'
export { toSiiDocument, fromSiiDocument } from './model/codec'
export type { EnvelopeCover, EnvelopeCoverInput, EnvelopeSubtotal } from './model/cover'

export { sanitizeText, foldToAscii, truncateText, assertMaxLength } from './text/sanitize'
export { encodeLatin1, decodeLatin1 } from './text/latin1'
export { chileDate, chileTimestamp, chileDateTimeParts, toIsoDate, isIsoDate } from './time/chile'
export type { ChileDateTimeParts } from './time/chile'
export { calculateLineAmount, calculateTotals } from './totals/calculate'
export type { LineAmountInput, LineAmount, TotalsOptions } from './totals/calculate'

export { createDocument, FIELD_LIMITS } from './document/create'
export type { CreateDocumentOptions } from './document/create'
export { buildDocumentXml, documentElementName } from './document/build-xml'
export type { BuildDocumentXmlOptions } from './document/build-xml'
export { signDocument, verifyDocumentSignature } from './document/sign'
export type { SignedDocument } from './document/sign'
export { issueDocument } from './document/issue'
export type { IssueDocumentInput } from './document/issue'

export { buildXml } from './xml/build'
export { parseXml, parseXmlWithoutNamespaces, extractTagContent, decodeXmlEntities } from './xml/parse'
export type { ParsedXml } from './xml/parse'
export { escapeXmlText, escapeXmlAttribute } from './xml/escape'
export { wrapBase64, formatBase64Columns } from './xml/format'

export { sha1Base64 } from './crypto/digest'
export type { TextEncoding } from './crypto/digest'
export { rsaSha1SignBase64, rsaSha1VerifyBase64, rsaPublicKeyParts, rsaPublicKeyPartsFromCertificatePem } from './crypto/rsa'
export type { RsaPublicKeyParts } from './crypto/rsa'
export { parseCertificatePem, certificateBase64 } from './crypto/x509'
export type { ParsedCertificate } from './crypto/x509'

export { isCertificateExpired, daysUntilExpiry } from './certificate/certificate'
export type { Certificate, LoadCertificateOptions } from './certificate/certificate'
export { loadCertificateFromPem } from './certificate/pem'
export type { PemCertificateInput } from './certificate/pem'
export { loadCertificateFromPkcs12 } from './certificate/pkcs12'

export { parseCaf } from './caf/parse'
export type { Caf } from './caf/parse'
export { cafExpiresAt, isCafExpired, isFolioInRange, assertFolioInRange, availableFolios } from './caf/validity'
export { signWithCaf, verifyWithCaf } from './caf/sign'

export { stampDocument, verifyTed, buildDdString, buildTedXml, tedText } from './ted/build'
export type { Ted, StampedDocument, StampOptions } from './ted/build'
export { buildSignedInfo, buildSignatureXml, signEnveloped, verifyEnveloped } from './signature/xmldsig'
export type { XmlSignature, SignEnvelopedInput, SignatureVerification } from './signature/xmldsig'

export { createEnvelope, generateSetId } from './envelope/create'
export type { Envelope, EnvelopeKind, CreateEnvelopeInput } from './envelope/create'
export { buildEnvelopeXml, envelopeRootName } from './envelope/build-xml'
export { signEnvelope, verifyEnvelopeSignature } from './envelope/sign'
export type { SignedEnvelope } from './envelope/sign'
```

`README.md` (reemplazar completo):

```md
<div align="center">
  <h1>dte-sdk: Chilean electronic tax documents (DTE) with TypeScript.</h1>

[![npm version](https://img.shields.io/npm/v/dte-sdk?color=000&label=npm)](https://www.npmjs.com/package/dte-sdk)
[![types included](https://img.shields.io/npm/types/dte-sdk?color=000)](https://www.npmjs.com/package/dte-sdk)
[![license](https://img.shields.io/npm/l/dte-sdk?color=000)](./LICENSE)

</div>

`dte-sdk` builds, stamps and signs Chilean **DTE** (Documento Tributario
Electrónico) the way the SII expects them, with a readable English API and
bilingual (EN/ES) documentation on every field.

- 🧾 **Document types** 33, 34, 39, 41, 43, 46, 52, 56 and 61.
- 🧮 **Totals done right** — per-line rounding, exempt and non-billable lines,
  VAT-included prices (`MntBruto`), global discounts, purchase-invoice withholding.
- 🔏 **TED + XMLDSig** — the electronic stamp signed with the CAF key and the
  enveloped signature the SII validates, byte for byte.
- ✉️ **Envelopes** — `EnvioDTE` and `EnvioBOLETA` with cover and signed `SetDTE`.
- 🪪 **Certificates** — PKCS#12 (`.pfx`/`.p12`, legacy and modern) or PEM; the
  holder RUT is read from the certificate.
- 🧠 **Fully typed** — a domain model in English (`totalAmount`, `issuer.businessName`)
  that maps to the official SII tags (`MntTotal`, `RznSoc`) through a codec.
- 🇨🇱 **Identity by [rut.ts](https://github.com/arrowsw/rut.ts)** — every RUT is
  validated and normalized by rut.ts; nothing is reimplemented here.
- 🛡️ **Typed errors** with stable codes and no personal data in messages.

## Installation

```bash
npm install dte-sdk
```

Node ≥ 20, ESM and CommonJS.

## Quick start

```typescript
import { readFileSync } from 'node:fs'
import { loadCertificateFromPkcs12, parseCaf, issueDocument, createEnvelope, signEnvelope, encodeLatin1 } from 'dte-sdk'

const certificate = loadCertificateFromPkcs12(readFileSync('empresa.pfx'), process.env.PFX_PASSWORD!)
const caf = parseCaf(readFileSync('caf-33.xml', 'utf8'))

const invoice = issueDocument({
  document: {
    type: 33,
    folio: 1,
    issuer: { rut: '76543210-3', businessName: 'Empresa Ejemplo SpA', businessActivity: 'Software', address: 'Av. Ejemplo 123', commune: 'Santiago', activityCode: 620200 },
    receiver: { rut: '12345678-5', businessName: 'Cliente SA', businessActivity: 'Comercio', address: 'Calle 456', commune: 'Providencia' },
    items: [{ name: 'Licencia anual', quantity: 1, unitPrice: 100000 }],
  },
  caf,
  certificate,
})

invoice.header.totals // { netAmount: 100000, vatRate: 19, vatAmount: 19000, totalAmount: 119000 }
invoice.xml // signed <DTE> with its TED

const envelope = signEnvelope(
  createEnvelope({
    kind: 'dte',
    documents: [invoice],
    cover: { issuerRut: '76543210-3', senderRut: certificate.rut!, resolutionDate: '2024-01-15', resolutionNumber: 123 },
  }),
  certificate,
)

encodeLatin1(envelope.xml) // ISO-8859-1 bytes, ready for the SII upload
```

Receipts (boletas) need no receiver and take VAT-included prices:

```typescript
const receipt = issueDocument({
  document: { type: 39, folio: 10, issuer, items: [{ name: 'Café', unitPrice: 1500 }], pricesIncludeVat: true },
  caf: parseCaf(readFileSync('caf-39.xml', 'utf8')),
  certificate,
})
```

## Step by step

```typescript
import { createDocument, stampDocument, signDocument, verifyTed, verifyDocumentSignature, toSiiDocument } from 'dte-sdk'

const doc = createDocument(input) // validates, sanitizes, numbers lines, computes totals
toSiiDocument(doc) // the same data with the official tags: MntTotal, RznSoc, NmbItem…
const stamped = stampDocument(doc, caf) // adds the TED (signed with the CAF key)
const signed = signDocument(stamped, certificate) // enveloped XMLDSig → signed.xml

verifyTed(signed.ted.xml, caf) // true
verifyDocumentSignature(signed.xml) // { digestValid: true, signatureValid: true, valid: true, … }
```

Every function that depends on "now" accepts `{ now: Date }`, so tests are deterministic.

## Errors

```typescript
import { DteError, isDteError } from 'dte-sdk'

try {
  createDocument({ ...input, items: [{ name: 'x'.repeat(81), unitPrice: 1 }] })
} catch (err) {
  if (isDteError(err)) err.code // 'FIELD_TOO_LONG'; err.details → { field: 'NmbItem', maxLength: 80, length: 81, value }
}
```

Messages never include RUTs, names or item text; the offending value lives in `details`.

## Status codes

`classifyUploadStatus('EPR')` → `'accepted'`, `classifyUploadStatus('RCT')` → `'rejected'`,
`classifyUploadStatus('-11')` → `'queryError'` (retry). `classifyDocumentStatus('FAU')` → `'notReceived'`.
Spanish glosses via `uploadStatusMessage` and `documentStatusMessage`.

## Development

```bash
npm install          # also builds via `prepare`
npm test             # unit, property, type-level and dist smoke tests
npm test -- --coverage
npm run build        # esbuild (ESM + CJS) + tsc declarations
npm run lint         # ESLint flat config + Prettier
npm run size         # bundle size guard (.size-limit.json)
npm run scan         # no real RUTs, local paths or secrets in tracked files
```

## License

MIT
```

`llms.txt` (reemplazar completo):

```md
# dte-sdk

> TypeScript SDK for Chilean electronic tax documents (DTE): build, stamp (TED), sign (XMLDSig) and envelope documents for the SII, with an English domain model, bilingual EN/ES JSDoc and RUT handling delegated to rut.ts.

dte-sdk covers document types 33, 34, 39, 41, 43, 46, 52, 56 and 61. `createDocument` validates and normalizes input (RUTs via rut.ts, text sanitized, schema lengths enforced, totals computed with per-line rounding, VAT-included prices via `MntBruto`, withholding for purchase invoices, receipt defaults). `toSiiDocument`/`fromSiiDocument` map the English model (`totalAmount`, `issuer.businessName`) to the official SII tags (`MntTotal`, `RznSoc`) in schema order. `stampDocument` builds the exact `<DD>` string and signs it with the CAF private key (SHA1withRSA over ISO-8859-1 bytes). `signDocument` applies the enveloped XMLDSig signature (C14N 1.0, RSA-SHA1) the SII validates. `createEnvelope`/`signEnvelope` produce `EnvioDTE`/`EnvioBOLETA`. Certificates load from PKCS#12 or PEM; CAF files are parsed and checked for range and the 6-month expiry of invoice/note CAFs. Status codes from the SII web services are classified (`accepted`, `pending`, `rejected`, `queryError`). Errors are `DteError` with stable codes and no personal data in messages. All clock-dependent functions accept `{ now }`.

- [README](https://github.com/arrowsw/dte-sdk/blob/canary/README.md): installation and quick start
- [Package on npm](https://www.npmjs.com/package/dte-sdk)
- [rut.ts](https://github.com/arrowsw/rut.ts): the RUT library dte-sdk depends on
- [Changelog](https://github.com/arrowsw/dte-sdk/blob/canary/CHANGELOG.md)
```

`CHANGELOG.md`: bajo `## [Unreleased]` agregar:

```md
### Added

- Core issuance: `createDocument`, `stampDocument` (TED), `signDocument` (enveloped XMLDSig),
  `issueDocument`, `createEnvelope`/`signEnvelope` (`EnvioDTE`, `EnvioBOLETA`), verification
  helpers (`verifyTed`, `verifyDocumentSignature`, `verifyEnvelopeSignature`).
- Domain model in English with bilingual (EN/ES) JSDoc, SII-shaped types and the
  `toSiiDocument`/`fromSiiDocument` codec.
- Certificates from PKCS#12 and PEM, CAF parsing and validity, Chile-local timestamps,
  text sanitization and ISO-8859-1 encoding, SII status code classification.
- Dependencies: `node-forge`, `@xmldom/xmldom`, `fast-xml-parser`, `rut.ts`.

### Removed

- The placeholder `hello()` export.
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest tests/types.test.ts && npm run build && npx jest tests/dist.smoke.test.ts`
Expected: PASS en los tres.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/types.test.ts tests/dist.smoke.test.ts README.md llms.txt CHANGELOG.md
git commit -m "feat: public API, type-level tests, dist smoke and docs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 22: Property tests y test diferencial

**Files:**
- Create: `tests/property.test.ts`, `tests/differential.test.ts`

El test diferencial compara, byte a byte, el `<DTE>` firmado y el sobre firmado contra un **harness externo** que no vive en el repositorio. El harness es cualquier ejecutable que lea por `stdin` un JSON con este contrato y escriba por `stdout` un JSON `{ "documentXml": string, "envelopeXml": string }`:

```json
{
  "kind": "dte" | "receipt",
  "siiDocument": { "Encabezado": {}, "Detalle": [], "DscRcgGlobal": [], "Referencia": [] },
  "cafXml": "<AUTORIZACION>…</AUTORIZACION>",
  "certificatePem": "-----BEGIN CERTIFICATE-----…",
  "privateKeyPem": "-----BEGIN RSA PRIVATE KEY-----…",
  "stampedAt": "2026-11-15T15:30:00",
  "cover": { "issuerRut": "…", "senderRut": "…", "receiverRut": "60803000-K", "resolutionDate": "2014-08-22", "resolutionNumber": 80, "signedAt": "2026-11-15T15:30:00", "setId": "DTE_SetDoc_TEST" }
}
```

Se ejecuta solo con `RUN_DIFFERENTIAL=1` y `DTE_REFERENCE_HARNESS=/ruta/al/harness`; sin esas variables la suite se salta.

- [ ] **Step 1: Property tests**

`tests/property.test.ts`:

```ts
import fc from 'fast-check'
import { generate } from 'rut.ts'
import { calculateTotals } from '../src/totals/calculate'
import { sanitizeText, foldToAscii } from '../src/text/sanitize'
import { encodeLatin1, decodeLatin1 } from '../src/text/latin1'
import { createDocument } from '../src/document/create'
import { toSiiDocument, fromSiiDocument } from '../src/model/codec'
import { toSiiRut, isSiiRut } from '../src/model/rut'
import { ISSUER_RUT, RECEIVER_RUT } from './support/fixtures'

const lineArb = fc.record({ amount: fc.integer({ min: 0, max: 10_000_000 }), exemptIndicator: fc.constantFrom(undefined, 1 as const) })
const linesArb = fc.array(lineArb, { minLength: 1, maxLength: 20 })

describe('totals invariants', () => {
  test('net prices: total = net + vat + exempt and vat = round(net × 19 %)', () => {
    fc.assert(
      fc.property(linesArb, (lines) => {
        const t = calculateTotals(lines, { type: 33 })
        expect(t.totalAmount).toBe((t.netAmount ?? 0) + (t.vatAmount ?? 0) + (t.exemptAmount ?? 0))
        if (t.netAmount) expect(t.vatAmount).toBe(Math.round((t.netAmount * 19) / 100))
      }),
    )
  })

  test('VAT-included prices: total = sum of lines and net + vat = affected', () => {
    fc.assert(
      fc.property(linesArb, (lines) => {
        const t = calculateTotals(lines, { type: 33, pricesIncludeVat: true })
        const affected = lines.filter((l) => l.exemptIndicator === undefined).reduce((s, l) => s + l.amount, 0)
        const exempt = lines.filter((l) => l.exemptIndicator === 1).reduce((s, l) => s + l.amount, 0)
        expect(t.totalAmount).toBe(affected + exempt)
        if (affected > 0) expect((t.netAmount ?? 0) + (t.vatAmount ?? 0)).toBe(affected)
      }),
    )
  })

  test('purchase invoice: total excludes the withheld VAT', () => {
    fc.assert(
      fc.property(linesArb, (lines) => {
        const t = calculateTotals(lines, { type: 46 })
        expect(t.totalAmount).toBe((t.netAmount ?? 0) + (t.exemptAmount ?? 0))
      }),
    )
  })
})

describe('text invariants', () => {
  test('sanitizeText is idempotent, Latin-1 only and quote-free', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (text) => {
        const once = sanitizeText(text)
        expect(sanitizeText(once)).toBe(once)
        expect([...once].every((c) => c.charCodeAt(0) <= 0xff)).toBe(true)
        expect(once).not.toMatch(/['"]/)
      }),
    )
  })

  test('foldToAscii yields printable ASCII', () => {
    fc.assert(fc.property(fc.string({ maxLength: 200 }), (text) => expect(foldToAscii(text)).toMatch(/^[\x20-\x7E]*$/)))
  })

  test('latin1 round-trips every Latin-1 string', () => {
    const latin1 = fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 500 }).map((codes) => String.fromCharCode(...codes))
    fc.assert(fc.property(latin1, (text) => expect(decodeLatin1(encodeLatin1(text))).toBe(text)))
  })
})

describe('codec round-trip', () => {
  const name = fc.stringMatching(/^[A-Za-z0-9 ]{1,40}$/).map((s) => s.trim()).filter((s) => s.length > 0)
  const item = fc.record({ name, quantity: fc.integer({ min: 1, max: 100 }), unitPrice: fc.integer({ min: 1, max: 1_000_000 }), exempt: fc.boolean() })
  const issuer = { rut: ISSUER_RUT, businessName: 'Empresa Ejemplo SpA', businessActivity: 'Software', address: 'Av. Ejemplo 123', commune: 'Santiago' }
  const receiver = { rut: RECEIVER_RUT, businessName: 'Cliente SA', businessActivity: 'Comercio', address: 'Calle 456', commune: 'Providencia' }

  test('fromSiiDocument(toSiiDocument(doc)) equals doc', () => {
    fc.assert(
      fc.property(fc.constantFrom(33 as const, 34 as const, 39 as const, 52 as const, 56 as const), fc.integer({ min: 1, max: 999 }), fc.array(item, { minLength: 1, maxLength: 10 }), fc.boolean(), (type, folio, items, gross) => {
        const doc = createDocument({ type, folio, issueDate: '2026-11-15', issuer, receiver: type === 39 ? undefined : receiver, items, pricesIncludeVat: gross })
        expect(fromSiiDocument(toSiiDocument(doc))).toEqual(doc)
      }),
    )
  })
})

describe('rut.ts integration', () => {
  test('any RUT generated by rut.ts normalizes to a stable SII shape', () => {
    for (const rut of generate({ count: 200 })) {
      const sii = toSiiRut(rut)
      expect(isSiiRut(sii)).toBe(true)
      expect(toSiiRut(sii)).toBe(sii)
      expect(sii).toMatch(/^\d{7,8}-[\dK]$/)
    }
  })
})
```

- [ ] **Step 2: Test diferencial (contrato genérico)**

`tests/differential.test.ts`:

```ts
import { execFileSync } from 'node:child_process'
import { parseCaf } from '../src/caf/parse'
import { loadCertificateFromPem } from '../src/certificate/pem'
import { createDocument } from '../src/document/create'
import { issueDocument } from '../src/document/issue'
import { createEnvelope } from '../src/envelope/create'
import { signEnvelope } from '../src/envelope/sign'
import { toSiiDocument } from '../src/model/codec'
import { chileTimestamp } from '../src/time/chile'
import type { DocumentInput } from '../src/model/document'
import { fixtureText, FIXED_NOW, ISSUER_RUT, RECEIVER_RUT } from './support/fixtures'

/**
 * Byte-for-byte comparison against an external reference harness (see the plan for the
 * stdin/stdout JSON contract). Opt-in: RUN_DIFFERENTIAL=1 DTE_REFERENCE_HARNESS=/path/to/harness.
 */
const harness = process.env.DTE_REFERENCE_HARNESS
const guarded = process.env.RUN_DIFFERENTIAL === '1' && harness ? describe : describe.skip

const issuer = { rut: ISSUER_RUT, businessName: 'Empresa Ejemplo SpA', businessActivity: 'Desarrollo de software', address: 'Av. Ejemplo 123', commune: 'Santiago', activityCode: 620200 }
const receiver = { rut: RECEIVER_RUT, businessName: 'Cliente Ñandú SA', businessActivity: 'Comercio', address: 'Calle 456', commune: 'Providencia' }
const stampedAt = chileTimestamp(FIXED_NOW)

const cases: readonly { name: string; kind: 'dte' | 'receipt'; caf: string; input: DocumentInput }[] = [
  {
    name: 'invoice 33 with exempt line and reference',
    kind: 'dte',
    caf: 'caf-33.xml',
    input: { type: 33, folio: 7, issueDate: '2026-11-15', issuer, receiver, items: [{ name: 'Licencia anual', quantity: 2, unitPrice: 1000 }, { name: 'Exento', unitPrice: 500, exempt: true }], references: [{ documentType: 801, folio: 'OC-77', date: '2026-11-01', reason: 'Orden de compra' }] },
  },
  {
    name: 'invoice 33 with VAT-included prices',
    kind: 'dte',
    caf: 'caf-33.xml',
    input: { type: 33, folio: 8, issueDate: '2026-11-15', issuer, receiver, items: [{ name: 'Producto', quantity: 2, unitPrice: 1000 }], pricesIncludeVat: true },
  },
  {
    name: 'receipt 39 for a final consumer',
    kind: 'receipt',
    caf: 'caf-39.xml',
    input: { type: 39, folio: 1, issueDate: '2026-11-15', issuer, items: [{ name: 'Café', quantity: 1, unitPrice: 1000 }], pricesIncludeVat: true },
  },
]

guarded('differential against the reference harness', () => {
  const certificate = loadCertificateFromPem({ privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') }, { now: FIXED_NOW })

  test.each(cases)('$name', ({ kind, caf: cafFile, input }) => {
    const cafXml = fixtureText(cafFile)
    const caf = parseCaf(cafXml)
    const doc = createDocument(input)
    const signed = issueDocument({ document: doc, caf, certificate, now: FIXED_NOW })
    const cover = { issuerRut: ISSUER_RUT, senderRut: ISSUER_RUT, receiverRut: '60803000-K', resolutionDate: '2014-08-22', resolutionNumber: 80, signedAt: stampedAt, setId: kind === 'receipt' ? 'ENVIOBOLETA_TEST' : 'DTE_SetDoc_TEST' }
    const envelope = signEnvelope(createEnvelope({ kind, documents: [signed], cover, now: FIXED_NOW }), certificate)

    const payload = { kind, siiDocument: toSiiDocument(doc), cafXml, certificatePem: fixtureText('cert.pem'), privateKeyPem: fixtureText('cert.key.pem'), stampedAt, cover }
    const output = JSON.parse(execFileSync(process.execPath, [harness as string], { input: JSON.stringify(payload), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })) as { documentXml: string; envelopeXml: string }

    expect(signed.xml).toBe(output.documentXml)
    expect(envelope.xml).toBe(output.envelopeXml)
  })
})
```

- [ ] **Step 3: Correr**

Run: `npx jest tests/property.test.ts tests/differential.test.ts`
Expected: property PASS; differential **skipped** (sin variables). Con el harness local configurado: `RUN_DIFFERENTIAL=1 DTE_REFERENCE_HARNESS=<ruta> npx jest tests/differential.test.ts` → PASS en los 3 casos. Si un caso difiere, imprime ambos XML con `diff <(echo "$A") <(echo "$B")` y corrige el codec/serializador hasta que coincidan: la referencia manda en este test.

- [ ] **Step 4: Commit**

```bash
git add tests/property.test.ts tests/differential.test.ts
git commit -m "test: property-based invariants and external differential harness contract

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 23: Verificación final

**Files:**
- Modify: `.size-limit.json`, `docs/superpowers/specs/2026-10-31-dte-sdk-architecture-and-phase-1-design.md` (estado)

- [ ] **Step 1: Formato, lint y tipos**

Run: `npm run prettier && npm run lint && npx tsc --noEmit`
Expected: sin errores. Si Prettier reescribió archivos, revísalos con `git diff` y continúa.

- [ ] **Step 2: Suite completa con cobertura**

Run: `npm test -- --coverage`
Expected: todos los tests pasan y la cobertura global es 100 % en statements, branches, functions y lines. Una rama sin cubrir se cubre con un test o se elimina si es inalcanzable; no se baja el umbral.

- [ ] **Step 3: Build, tamaño y smoke**

Run: `npm run build && npm run size && npx jest tests/dist.smoke.test.ts`
Expected: build OK; `size-limit` imprime el tamaño de cada bundle. Fijar en `.size-limit.json` cada `limit` al tamaño medido + 10 %, redondeado al kB superior (p. ej. medido 38.2 kB → `"42 kB"`), y volver a correr `npm run size`.

- [ ] **Step 4: Escaneo de datos y estado del árbol**

Run: `npm run scan && git status --short`
Expected: `Real-data scan ok`; sin archivos modificados fuera de los que se van a commitear (los `.snap`, fixtures y docs ya están versionados). `information.json` y `research_notes/` siguen sin trackear: no se agregan.

- [ ] **Step 5: Estado en la spec y commit final**

En la spec cambiar `Estado: **borrador para revisión**` por `Estado: **aprobado; fase 1 implementada en la rama feat/core-issuance**`.

```bash
git add .size-limit.json docs/superpowers/specs/2026-10-31-dte-sdk-architecture-and-phase-1-design.md
git commit -m "chore: size limits for the phase 1 bundles

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 6: Entrega**

La rama `feat/core-issuance` queda lista para abrir PR contra `canary` (es decisión de Hans abrirlo o integrarla de otro modo). Descripción sugerida del PR: el `### Added` del CHANGELOG más el enlace a la spec y al plan.
