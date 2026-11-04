# Phase 5a — printed samples: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The printed representation of dte-sdk: any DTE envelope XML becomes one single-page PDF per document laid out per the SII printed-samples manual, with the PDF417 stamp of the TED, the transferable copy, an in-memory batch and a Node adapter over files.

**Architecture:** `src/pdf/` holds six modules of free functions over `readonly` data: the layout constants, the stamp (`bwip-js`), the parser (XML to `PrintableDocument`), the renderer (`pdf-lib`, a measuring pass then a drawing pass, one function per block), the in-memory batch and the Node adapter. `pdf-lib` and `bwip-js` are regular dependencies loaded with `import()` inside the functions that need them, so importing the root entry still evaluates nothing, and they stay external to the bundle.

**Tech Stack:** TypeScript 5.9 (strict), Node ≥ 20, Jest 30 + ts-jest, fast-check, expect-type, ESLint 9 + Prettier, esbuild, size-limit. New dependencies `pdf-lib` 1.17.1 and `bwip-js` 4.11.4; new dev dependencies `@zxing/library` 0.23.0 (an independent PDF417 reader), `pngjs` 7.0.0 and `@types/pngjs` 6.0.5.

**Spec:** `docs/superpowers/specs/2026-11-04-phase-5a-printed-samples-design.md` (section 2 holds the decisions D39–D45, section 3 the rules and the API, section 6 what is and is not measured, section 7 what is deferred on purpose).

---

## This plan's code has already run

This plan was generated from a throwaway branch cut from `canary` at `f320b54`, where the code was written and made to pass, with one commit per task. On that branch each task was checked in order: its tests alone fail on the previous commit, and with the task applied `tsc` compiles and the tests pass. At the tip, on 2026-11-04: Prettier, ESLint, `tsc`, 1 758 tests with coverage at 100 % on the four metrics, build, size (ESM 50.15 kB, CJS 50.26 kB against the 54 kB limit) and scan all pass.

So copy the code as it is. If a test fails, something around it changed since then, such as `canary`: investigate that before changing the code.

**Nothing here has met the SII.** The layout reproduces output known to pass the SII review of printed samples (D44); whether the SII accepts these PDFs needs the company enrolled and the upload of phase 5c. Section 7 of the spec lists what is deliberately left as it is.

## Conventions that apply to EVERY task

1. **Branch:** work on a branch cut from `canary`. Commands run from the repository root. Run `npm ci` first.
2. **Commits:** one per task, with the message given, in English, with a prose body saying why, ending with the `Co-Authored-By` line your session prescribes.
3. **Diffs:** a modified file comes as a unified diff, relative to the repository root. Save it to a temporary file outside the repository and run `git apply <file>`. A new file comes whole.
4. **Bilingual JSDoc is mandatory** on every exported symbol and every type field, one `EN:` line and one `ES:` line, the `ES:` naming the SII tag. The code below already has it.
5. **No classes** (only `DteError`). `readonly` types everywhere. No module-level state: the libraries are loaded with `import()` inside the functions, and the runtime caches the module.
6. **No PII in error messages:** values go in `details`, never in `message`. The `reason` of a failure entry is the library's message and may quote an offending character; it never reaches a `DteError` message.
7. **Coverage** reaches 100 % at Task 7; before that it dips, which is why the per-task commands use `--coverage=false`.
8. **No real data:** fixture RUTs come from the allow-list in `scripts/scan-real-data.mjs`, names are invented, and `npm run scan` checks it.
9. **Nothing public names any third-party implementation:** not code, comments, tests, fixtures, commits or the pull request. Describe the SII behaviour directly.
10. **Nothing in this plan calls the SII,** and the default test run never does.
11. **Node only:** the stamp needs the Node entry of `bwip-js`; the parser and `needsTransferableCopy` run anywhere.
12. **You own the pull request.** The session that runs this plan is the sole owner of its PR and of every review note or post-merge follow-up on it. Run `gh pr list` before opening anything.

## File map

```
package.json / package-lock.json                     (modify) task 1   two dependencies, three dev dependencies
scripts/build.mjs                                    (modify) task 1   externals
.size-limit.json                                     (modify) task 1   54 kB
src/errors.ts                                        (modify) task 1   two codes, `module` key, errorCode
tests/errors.test.ts                                 (modify) task 1
src/pdf/layout.ts                                    (create) task 2   the constants of the manual
src/pdf/stamp.ts                                     (create) task 2   renderTedBarcode, loadBarcodeModule
tests/support/printed-fixtures.ts                    (create) task 2   documents issued with the fixtures
tests/support/pdf417.ts                              (create) task 2   PNG to luminance, PDF417 decoding
tests/pdf/stamp.test.ts                              (create) task 2
src/pdf/parse.ts                                     (create) task 3   parsePrintableDocuments and the types
tests/pdf/parse.test.ts                              (create) task 3
src/pdf/render.ts                                    (create) task 4   renderPrintedSample, needsTransferableCopy
tests/support/pdf.ts                                 (create) task 4   page size, drawn text, images, stamp decoding
tests/pdf/render.test.ts                             (create) task 4
src/pdf/samples.ts                                   (create) task 5   renderPrintedSamples
tests/pdf/samples.test.ts                            (create) task 5
src/pdf/node-samples.ts                              (create) task 6   writePrintedSamples, findEnvelopeFiles
tests/pdf/node-samples.test.ts                       (create) task 6
src/index.ts                                         (modify) task 7
tests/public-api.test.ts                             (modify) task 7
tests/types.test.ts                                  (modify) task 7
tests/dist.smoke.test.ts                             (modify) task 7
README.md / CHANGELOG.md / llms.txt                  (modify) task 7
docs/superpowers/specs/2026-10-31-…-phase-1-design.md (modify) task 7   one note under D3
```

---

## Task 1: Dependencies, bundle externals, size cap and the two PDF error codes

`pdf-lib` and `bwip-js` become exact dependencies that stay external to the bundle (D40), the size cap goes to 54 kB (D41), `DEPENDENCY_UNAVAILABLE` and `PDF_RENDER_FAILED` join `DTE_ERROR_CODES` with `module` as a safe detail key, and `errorCode` reads the code of a thrown value for results that report failures as data (spec 3.7, 3.11).

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `scripts/build.mjs`
- Modify: `.size-limit.json`
- Modify: `src/errors.ts`
- Test (modify): `tests/errors.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/errors.test.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/errors.test.ts b/tests/errors.test.ts
index 5661cc8..dc033c3 100644
--- a/tests/errors.test.ts
+++ b/tests/errors.test.ts
@@ -1,4 +1,4 @@
-import { DteError, DTE_ERROR_CODES, errorMessage, isDteError } from '../src/errors'
+import { DteError, DTE_ERROR_CODES, errorCode, errorMessage, isDteError } from '../src/errors'
 
 describe('DteError', () => {
   test('carries a stable code, generic message and details', () => {
@@ -66,3 +66,9 @@ describe('errorMessage', () => {
     expect(errorMessage(42)).toBe('42')
   })
 })
+
+test('errorCode is the code of a DteError and undefined for anything else', () => {
+  expect(errorCode(new DteError('INVALID_RUT'))).toBe('INVALID_RUT')
+  expect(errorCode(new Error('plain'))).toBeUndefined()
+  expect(errorCode('text')).toBeUndefined()
+})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/errors --coverage=false
```

Expected: FAIL: `TS2305: Module '../src/errors' has no exported member 'errorCode'`.

- [ ] **Step 3: Write the implementation**

Install the libraries with exact versions (this rewrites `package.json` and `package-lock.json`; no diff is given for them):

```bash
npm install --save-exact pdf-lib@1.17.1 bwip-js@4.11.4
```

```bash
npm install --save-dev --save-exact @zxing/library@0.23.0 pngjs@7.0.0 @types/pngjs@6.0.5
```

`package.json` must then list `"bwip-js": "4.11.4"` and `"pdf-lib": "1.17.1"` under `dependencies`, and `"@types/pngjs": "6.0.5"`, `"@zxing/library": "0.23.0"` and `"pngjs": "7.0.0"` under `devDependencies`.

`scripts/build.mjs` (save the diff and run `git apply`):

```diff
diff --git a/scripts/build.mjs b/scripts/build.mjs
index ea1ce11..1bca500 100644
--- a/scripts/build.mjs
+++ b/scripts/build.mjs
@@ -6,7 +6,7 @@ import { build } from 'esbuild'
 
 // `node:*` stays external: the Node adapters import `node:https` and `node:fs/promises` lazily, inside the
 // function that needs them, so the neutral bundle never evaluates them and Deno/Bun/browsers still load it.
-const EXTERNAL = ['node-forge', '@xmldom/xmldom', 'fast-xml-parser', 'rut.ts', 'node:*']
+const EXTERNAL = ['node-forge', '@xmldom/xmldom', 'fast-xml-parser', 'rut.ts', 'pdf-lib', 'bwip-js', 'node:*']
 
 const TARGETS = [
   { format: 'esm', outfile: 'dist/esm/index.min.js' },
```

`.size-limit.json` (save the diff and run `git apply`):

```diff
diff --git a/.size-limit.json b/.size-limit.json
index ae0fcd8..dfbd7f6 100644
--- a/.size-limit.json
+++ b/.size-limit.json
@@ -2,11 +2,11 @@
   {
     "name": "ESM (min + brotli)",
     "path": "dist/esm/index.min.js",
-    "limit": "46 kB"
+    "limit": "54 kB"
   },
   {
     "name": "CJS (min + brotli)",
     "path": "dist/cjs/index.min.js",
-    "limit": "46 kB"
+    "limit": "54 kB"
   }
 ]
```

`src/errors.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/errors.ts b/src/errors.ts
index 9eaa3c4..a4170a1 100644
--- a/src/errors.ts
+++ b/src/errors.ts
@@ -46,6 +46,8 @@ export const DTE_ERROR_CODES = {
   SII_PORTAL_BLOCKED: 'SII_PORTAL_BLOCKED',
   SII_PORTAL_REJECTED: 'SII_PORTAL_REJECTED',
   SII_PORTAL_UNEXPECTED_PAGE: 'SII_PORTAL_UNEXPECTED_PAGE',
+  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
+  PDF_RENDER_FAILED: 'PDF_RENDER_FAILED',
 } as const
 
 /**
@@ -104,6 +106,8 @@ const MESSAGES: Readonly<Record<DteErrorCode, string>> = {
   SII_PORTAL_BLOCKED: 'SII firewall or captcha blocked the request',
   SII_PORTAL_REJECTED: 'SII portal refused the request',
   SII_PORTAL_UNEXPECTED_PAGE: 'SII portal answered a page that could not be interpreted',
+  DEPENDENCY_UNAVAILABLE: 'A library this function needs could not be loaded',
+  PDF_RENDER_FAILED: 'The PDF library failed while drawing the printed sample',
 }
 
 // Only these detail keys are safe to show: field names, codes and numbers, never user text, URLs or bodies.
@@ -128,6 +132,7 @@ const SAFE_DETAIL_KEYS = [
   'actual',
   'rejection',
   'step',
+  'module',
 ] as const
 
 const formatMessage = (code: DteErrorCode, details: DteErrorDetails): string => {
@@ -165,6 +170,12 @@ export class DteError extends Error {
  */
 export const isDteError = (value: unknown): value is DteError => value instanceof DteError
 
+/**
+ * EN: The code of a thrown value when it is a `DteError`, else undefined. For results that report failures as data.
+ * ES: El código de un valor lanzado cuando es un `DteError`, si no undefined. Para resultados que reportan fallas como datos.
+ */
+export const errorCode = (error: unknown): DteErrorCode | undefined => (isDteError(error) ? error.code : undefined)
+
 /**
  * EN: Message of an unknown thrown value: `Error.message`, or its string form for anything else. Fills
  * `DteError.details.reason` when wrapping errors from the underlying libraries.
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/errors --coverage=false
```

Expected: PASS, 53 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add package.json package-lock.json scripts/build.mjs .size-limit.json src/errors.ts tests/errors.test.ts
```

```bash
git commit -F - <<'MSG'
chore: PDF dependencies, bundle externals, size cap and the two PDF error codes

pdf-lib and bwip-js enter as exact dependencies and stay external to the bundle, which may now
reach 54 kB. DEPENDENCY_UNAVAILABLE and PDF_RENDER_FAILED join the error codes, with module as a
safe detail key, and errorCode reads the code of a thrown value for results that report failures
as data.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 2: Layout constants and the PDF417 stamp

The constants of the SII printed-samples manual (spec 3.3, `src/pdf/layout.ts`) and `renderTedBarcode` (spec 3.4): the TED handed to `bwip-js` as bytes, so the symbol carries exactly what was signed. The test support issues real documents with the fixture certificate and CAFs and decodes the PNG with an independent PDF417 reader.

**Files:**

- Create: `src/pdf/layout.ts`
- Create: `src/pdf/stamp.ts`
- Test (create): `tests/support/printed-fixtures.ts`
- Test (create): `tests/support/pdf417.ts`
- Test (create): `tests/pdf/stamp.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/support/printed-fixtures.ts` (new file, whole):

```ts
import { parseCaf } from '../../src/caf/parse'
import { loadCertificateFromPem } from '../../src/certificate/pem'
import { issueDocument } from '../../src/document/issue'
import type { SignedDocument } from '../../src/document/sign'
import { createEnvelope, type EnvelopeKind } from '../../src/envelope/create'
import { signEnvelope } from '../../src/envelope/sign'
import type { DocumentInput } from '../../src/model/document'
import { FIXED_NOW, ISSUER_RUT, RECEIVER_RUT, fixtureText } from './fixtures'

/** Documents issued by the SDK itself over the fixture certificate and CAFs, so every TED is real and signed. */
export const certificate = loadCertificateFromPem(
  { privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') },
  { now: FIXED_NOW },
)
const caf33 = parseCaf(fixtureText('caf-33.xml'))
const caf39 = parseCaf(fixtureText('caf-39.xml'))
const cafFor = (type: number) =>
  type === 33
    ? caf33
    : type === 39
      ? caf39
      : parseCaf(fixtureText('caf-33.xml').replace(/<TD>33<\/TD>/, `<TD>${type}</TD>`))

export const issuer = {
  rut: ISSUER_RUT,
  businessName: 'Comercial Andina SpA',
  businessActivity: 'Desarrollo de software',
  address: 'Av. Los Aromos 1540',
  commune: 'Ñuñoa',
}
export const receiver = {
  rut: RECEIVER_RUT,
  businessName: 'Comercializadora Rapel Ltda',
  businessActivity: 'Comercio al por menor',
  address: 'Pasaje Los Olmos 88',
  commune: 'Providencia',
}

export const issue = (document: DocumentInput): SignedDocument =>
  issueDocument({ document, caf: cafFor(document.type), certificate, now: FIXED_NOW })

export const envelopeXml = (documents: readonly SignedDocument[], kind: EnvelopeKind = 'dte'): string =>
  signEnvelope(
    createEnvelope({
      kind,
      documents,
      cover: { issuerRut: ISSUER_RUT, senderRut: ISSUER_RUT, resolutionDate: '2026-01-01', resolutionNumber: 0 },
      now: FIXED_NOW,
    }),
    certificate,
  ).xml

export const invoice = issue({
  type: 33,
  folio: 7,
  issueDate: '2026-11-15',
  issuer,
  receiver,
  items: [
    {
      name: 'Licencia anual de software de gestión para pequeñas empresas',
      quantity: 2,
      unitPrice: 100000,
      discountPercent: 10,
      codes: [{ type: 'INT1', value: 'LIC-01' }],
    },
    { name: 'Soporte', quantity: 3, unit: 'HR', unitPrice: 15000 },
  ],
  globalAdjustments: [{ kind: 'discount', valueType: 'percent', value: 5 }],
})

export const exemptInvoice = issue({
  type: 34,
  folio: 3,
  issueDate: '2026-11-15',
  issuer,
  receiver,
  items: [{ name: 'Asesoría exenta', unitPrice: 50000, exempt: true }],
})

export const receipt = issue({
  type: 39,
  folio: 11,
  issueDate: '2026-11-15',
  issuer,
  items: [{ name: 'Café', quantity: 2, unitPrice: 1500 }],
  pricesIncludeVat: true,
})

export const guide = (transferType: 1 | 5 | 9): SignedDocument =>
  issue({
    type: 52,
    folio: 20 + transferType,
    issueDate: '2026-11-15',
    issuer,
    receiver,
    items: [{ name: 'Cajón de manzanas', quantity: 10, unitPrice: 8000 }],
    options: { transferType },
  })

export const creditNote = issue({
  type: 61,
  folio: 5,
  issueDate: '2026-11-15',
  issuer,
  receiver,
  items: [{ name: 'Licencia', unitPrice: 100000 }],
  references: [
    { documentType: 33, folio: 7, date: '2026-11-15', code: 1, reason: 'Anula factura' },
    { documentType: 'SET', folio: 'CASO-1', date: '2026-11-15', reason: 'Set de pruebas' },
  ],
})

export const debitNote = issue({
  type: 56,
  folio: 8,
  issueDate: '2026-11-15',
  issuer,
  receiver,
  items: [{ name: 'Interés por mora', unitPrice: 10000 }],
  globalAdjustments: [{ kind: 'surcharge', valueType: 'amount', value: 2500 }],
  references: [{ documentType: 33, folio: 7, date: '2026-11-15', code: 3, reason: 'Corrige monto' }],
})

export const basicSetXml = envelopeXml([invoice, creditNote, debitNote])
export const receiptsXml = envelopeXml([receipt], 'receipt')

export const withoutTed = (xml: string): string => xml.replace(/<TED[^>]*>[\s\S]*?<\/TED>/g, '')
export const bareSetDte = (xml: string): string =>
  xml.slice(xml.indexOf('<SetDTE'), xml.indexOf('</SetDTE>') + '</SetDTE>'.length)

/** A third-party envelope with the shapes the SDK never emits: gross amounts, a branch, several codes, a surcharge. */
export const thirdPartyXml = `<?xml version="1.0" encoding="ISO-8859-1"?>
<EnvioDTE xmlns="http://www.sii.cl/SiiDte" version="1.0"><SetDTE ID="SetDoc"><Caratula version="1.0"><RutEmisor>${ISSUER_RUT}</RutEmisor></Caratula>
<DTE version="1.0"><Documento ID="F100T33"><Encabezado><IdDoc><TipoDTE>33</TipoDTE><Folio>100</Folio><FchEmis>2026-10-01</FchEmis><MntBruto>1</MntBruto></IdDoc>
<Emisor><RUTEmisor>${ISSUER_RUT}</RUTEmisor><RznSocEmisor>Distribuidora Lican SpA</RznSocEmisor><GiroEmis>Distribución</GiroEmis><Sucursal>Casa 2</Sucursal><DirOrigen>Camino Real 12</DirOrigen><CmnaOrigen>Temuco</CmnaOrigen></Emisor>
<Receptor><RUTRecep>${RECEIVER_RUT}</RUTRecep><RznSocRecep>Óptica Muñoz Ltda</RznSocRecep><GiroRecep>Óptica</GiroRecep><DirRecep>Calle Larga 1</DirRecep><CmnaRecep>Valdivia</CmnaRecep></Receptor>
<Totales><MntNeto>10000</MntNeto><TasaIVA>19</TasaIVA><IVA>1900</IVA><MntTotal>11900</MntTotal></Totales></Encabezado>
<Detalle><NroLinDet>1</NroLinDet><CdgItem><TpoCodigo>EAN</TpoCodigo><VlrCodigo>7800000000001</VlrCodigo></CdgItem><CdgItem><TpoCodigo>INT1</TpoCodigo><VlrCodigo>A-1</VlrCodigo></CdgItem><NmbItem>Lentes</NmbItem><QtyItem>2.000</QtyItem><UnmdItem>PAR</UnmdItem><PrcItem>5950</PrcItem><DescuentoMonto>100</DescuentoMonto><MontoItem>11800</MontoItem></Detalle>
<DscRcgGlobal><NroLinDR>1</NroLinDR><TpoMov>R</TpoMov><TpoValor>$</TpoValor><ValorDR>100</ValorDR></DscRcgGlobal>
<Referencia><NroLinRef>1</NroLinRef><TpoDocRef>801</TpoDocRef><FolioRef>OC-55</FolioRef><FchRef>2026-09-30</FchRef><RazonRef>Orden de compra</RazonRef></Referencia>
<TED version="1.0"><DD><RE>${ISSUER_RUT}</RE><TD>33</TD><F>100</F><FE>2026-10-01</FE><RR>${RECEIVER_RUT}</RR><RSR>Optica Munoz Ltda</RSR><MNT>11900</MNT><IT1>Lentes</IT1><CAF version="1.0"><DA><RE>${ISSUER_RUT}</RE><RS>DISTRIBUIDORA LICAN SPA</RS><TD>33</TD><RNG><D>1</D><H>500</H></RNG><FA>2026-01-01</FA><RSAPK><M>AA==</M><E>AQAB</E></RSAPK><IDK>100</IDK></DA><FRMA algoritmo="SHA1withRSA">AA==</FRMA></CAF><TSTED>2026-10-01T10:00:00</TSTED></DD><FRMT algoritmo="SHA1withRSA">AA==</FRMT></TED>
</Documento></DTE></SetDTE></EnvioDTE>`

/** A settlement invoice uses `Liquidacion` instead of `Documento`. */
export const settlementXml = `<DTE version="1.0"><Liquidacion ID="F9T43"><Encabezado><IdDoc><TipoDTE>43</TipoDTE><Folio>9</Folio><FchEmis>2026-10-02</FchEmis></IdDoc>
<Emisor><RUTEmisor>${ISSUER_RUT}</RUTEmisor><RznSoc>Comercial Andina SpA</RznSoc><GiroEmis>Comisionista</GiroEmis><DirOrigen>Av. Los Aromos 1540</DirOrigen><CmnaOrigen>Ñuñoa</CmnaOrigen></Emisor>
<Receptor><RUTRecep>${RECEIVER_RUT}</RUTRecep><RznSocRecep>Mandante Ltda</RznSocRecep></Receptor>
<Totales><MntNeto>1000</MntNeto><IVA>190</IVA><MntTotal>1190</MntTotal></Totales></Encabezado>
<Detalle><NroLinDet>1</NroLinDet><NmbItem>Venta por cuenta de terceros</NmbItem><MontoItem>1000</MontoItem></Detalle></Liquidacion></DTE>`
```

`tests/support/pdf417.ts` (new file, whole):

```ts
import { BinaryBitmap, HybridBinarizer, PDF417Reader, RGBLuminanceSource } from '@zxing/library'
import { PNG } from 'pngjs'

export type Luminance = { readonly width: number; readonly height: number; readonly luminance: Uint8ClampedArray }

/** Greyscale of RGBA pixels composited over white, which is how a transparent PNG prints. */
export const luminanceOf = (rgba: Uint8Array, width: number, height: number, alpha: Uint8Array | null): Luminance => {
  const luminance = new Uint8ClampedArray(width * height)
  for (let index = 0; index < luminance.length; index += 1) {
    const opacity = alpha ? alpha[index] / 255 : rgba.length === luminance.length * 4 ? rgba[index * 4 + 3] / 255 : 1
    const channels = rgba.length === luminance.length ? 1 : rgba.length === luminance.length * 3 ? 3 : 4
    const grey =
      channels === 1
        ? rgba[index]
        : (rgba[index * channels] + rgba[index * channels + 1] + rgba[index * channels + 2]) / 3
    luminance[index] = Math.round(grey * opacity + 255 * (1 - opacity))
  }
  return { width, height, luminance }
}

export const pngLuminance = (png: Uint8Array): Luminance => {
  const image = PNG.sync.read(Buffer.from(png))
  return luminanceOf(new Uint8Array(image.data), image.width, image.height, null)
}

/** Decodes a PDF417 symbol with an independent reader; throws when none is found. */
export const decodePdf417 = ({ width, height, luminance }: Luminance): string =>
  new PDF417Reader()
    .decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, width, height))))
    .getText()

export const decodePdf417Png = (png: Uint8Array): string => decodePdf417(pngLuminance(png))
```

`tests/pdf/stamp.test.ts` (new file, whole):

```ts
import { renderTedBarcode } from '../../src/pdf/stamp'
import { decodePdf417Png, pngLuminance } from '../support/pdf417'
import { failure } from '../support/portal'
import { invoice } from '../support/printed-fixtures'

const ted = invoice.ted.xml

test('the stamp decodes to the exact TED, including its signature', async () => {
  const png = await renderTedBarcode(ted)
  expect(decodePdf417Png(png)).toBe(ted)
})

test('an accented name reaches the symbol as the single ISO-8859-1 bytes that were signed', async () => {
  const accented = ted.replace(/<RSR>[^<]*<\/RSR>/, '<RSR>SEÑORA MUÑOZ ÓPTICA</RSR>')
  expect(decodePdf417Png(await renderTedBarcode(accented))).toBe(accented)
})

test('the symbol keeps the field geometry: 3 px modules, 6 modules of quiet zone, rows as tall as modules', async () => {
  const { width, height } = pngLuminance(await renderTedBarcode(ted))
  expect((width - 36) % 3).toBe(0)
  expect((height - 36) % 3).toBe(0)
  const rows = (height - 36) / 3
  expect(rows).toBeGreaterThanOrEqual(3)
  expect(rows).toBeLessThanOrEqual(90)
  expect(width).toBeGreaterThan(height * 4)
})

test('without a <TED it is MISSING_FIELD', async () => {
  const error = await failure(renderTedBarcode('<DD></DD>'))
  expect(error.code).toBe('MISSING_FIELD')
  expect(error.details).toEqual({ field: 'TED' })
})

test('a code point above U+00FF cannot be a byte: ENCODING_UNSUPPORTED_CHAR', async () => {
  const error = await failure(renderTedBarcode(ted.replace('<RSR>', '<RSR>€')))
  expect(error.code).toBe('ENCODING_UNSUPPORTED_CHAR')
})

test('a loader for tests replaces the library', async () => {
  const calls: unknown[] = []
  const png = await renderTedBarcode(ted, async () => ({
    toBuffer: async (options) => {
      calls.push(options)
      return new Uint8Array([1, 2, 3])
    },
  }))
  expect(png).toEqual(new Uint8Array([1, 2, 3]))
  expect(calls).toEqual([
    { bcid: 'pdf417', text: ted, scale: 3, height: 10, padding: 6, includetext: false, binarytext: true },
  ])
})

test('when the library cannot be loaded it is DEPENDENCY_UNAVAILABLE', async () => {
  jest.doMock('bwip-js', () => {
    throw new Error('not installed')
  })
  try {
    await jest.isolateModulesAsync(async () => {
      const { loadBarcodeModule: load } = await import('../../src/pdf/stamp')
      const error = await failure(load())
      expect(error.code).toBe('DEPENDENCY_UNAVAILABLE')
      expect(error.details).toEqual({ module: 'bwip-js', reason: 'not installed' })
    })
  } finally {
    jest.dontMock('bwip-js')
  }
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/pdf/stamp --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/pdf/stamp'`.

- [ ] **Step 3: Write the implementation**

`src/pdf/layout.ts` (new file, whole):

```ts
/**
 * EN: Layout of the printed sample in typographic points (1 cm = 28.3465 pt), following the SII printed-samples
 * manual: sheet width, height bounds, margins, the type box, the stamp box, fonts, line heights, tables, colours and
 * the fixed texts. None of this is a parameter: the layout is the SII's.
 * ES: Diagramación de la muestra impresa en puntos tipográficos (1 cm = 28,3465 pt), según el manual de muestras
 * impresas del SII: ancho de hoja, límites del alto, márgenes, recuadro del tipo, caja del timbre, fuentes, altos de
 * línea, tablas, colores y los textos fijos. Nada de esto es parámetro: la diagramación es la del SII.
 */

/** EN: Sheet width (21.5 cm) and height bounds (11 to 33 cm). ES: Ancho de la hoja (21,5 cm) y límites del alto (11 a 33 cm). */
export const PAGE = { width: 609.45, minHeight: 311.81, maxHeight: 935.43 } as const

/** EN: Blank border on the four sides (0.5 cm). ES: Margen en blanco en los cuatro bordes (0,5 cm). */
export const MARGIN = 14.17

/** EN: Vertical gaps between and inside blocks. ES: Espacios verticales entre bloques y dentro de ellos. */
export const GAP = { section: 10, small: 6, tiny: 4 } as const

/** EN: The red type box at the top right (5.5 cm wide, 1.5 to 4 cm high). ES: Recuadro rojo del tipo de documento, arriba a la derecha (5,5 cm de ancho, 1,5 a 4 cm de alto). */
export const TYPE_BOX = { width: 155.91, minHeight: 42.52, maxHeight: 113.39, border: 1.5, padX: 8, padY: 6 } as const

/** EN: The stamp box: 5 to 9 cm wide, 2 to 4 cm high, 2 cm from the left margin. ES: Caja del timbre: 5 a 9 cm de ancho, 2 a 4 cm de alto, a 2 cm del margen izquierdo. */
export const STAMP = {
  minWidth: 141.73,
  minHeight: 56.69,
  maxWidth: 255.12,
  maxHeight: 113.39,
  marginLeft: 56.69,
  legendGap: 5,
} as const

/** EN: Font sizes. ES: Tamaños de fuente. */
export const FONT = { name: 11, normal: 10, small: 9, tiny: 8, legal: 7, legend: 7 } as const

/** EN: Line heights. ES: Altos de línea. */
export const LINE = { normal: 13, small: 11, tiny: 10, legal: 9 } as const

/** EN: Table rows and cell padding. ES: Filas de tabla y relleno de celda. */
export const TABLE = { rowHeight: 12, headerHeight: 14, padX: 3, padY: 2 } as const

/** EN: Padding of the receiver and acknowledgement boxes and the height of an acknowledgement field. ES: Relleno de las cajas de receptor y acuse, y alto de un campo del acuse. */
export const BOX = { padX: 8, padY: 8, fieldHeight: 14 } as const

/** EN: Colours as RGB fractions. ES: Colores como fracciones RGB. */
export const COLOURS = {
  black: [0, 0, 0],
  red: [0.75, 0, 0],
  darkGrey: [0.4, 0.4, 0.4],
  midGrey: [0.5, 0.5, 0.5],
  lightGrey: [0.88, 0.88, 0.88],
} as const

/** EN: SII office printed under the type box when none is given. ES: Oficina del SII impresa bajo el recuadro cuando no se indica otra. */
export const DEFAULT_SII_OFFICE = 'S.I.I. - SANTIAGO CENTRO'

/**
 * EN: Resolution line printed under the stamp when none is given, for a year.
 * ES: Línea de resolución impresa bajo el timbre cuando no se indica otra, para un año.
 */
export const defaultResolution = (year: number): string => `Res. Ex. SII N° 0 del ${year}`

/** EN: Text of the acknowledgement box (Res. Ex. 51 of 2005, Ley 19.983). ES: Texto del acuse de recibo (Res. Ex. 51 de 2005, Ley 19.983). */
export const ACKNOWLEDGEMENT_TEXT =
  'El acuse de recibo que se declara en este acto, de acuerdo a lo dispuesto en la letra b) del Art. 4°, y la letra c) del Art. 5° de la Ley 19.983, acredita que la entrega de mercaderías o servicio(s) prestado(s) ha(n) sido recibido(s).'

/** EN: Printed names of the transfer reasons of a dispatch guide. ES: `IndTraslado` — Nombres impresos de los tipos de traslado de una guía. */
export const TRANSFER_REASON_NAMES: Readonly<Record<number, string>> = {
  1: 'Operación constituye venta',
  2: 'Ventas por efectuar',
  3: 'Consignaciones',
  4: 'Entrega gratuita',
  5: 'Traslados internos',
  6: 'Otros traslados no venta',
  7: 'Guía de devolución',
  8: 'Traslado para exportación (no venta)',
  9: 'Venta para exportación',
}
```

`src/pdf/stamp.ts` (new file, whole):

```ts
import { DteError, errorMessage } from '../errors'
import { encodeLatin1 } from '../text/latin1'

/**
 * EN: The part of the barcode library the stamp uses: `toBuffer` of its Node entry, which renders a PNG.
 * ES: La parte de la librería de códigos de barras que usa el timbre: `toBuffer` de su entrada Node, que genera un PNG.
 */
export type BarcodeModule = {
  /** EN: Renders a symbol to PNG bytes. ES: Genera un símbolo como bytes PNG. */
  readonly toBuffer: (options: {
    readonly bcid: string
    readonly text: string
    readonly scale: number
    readonly height: number
    readonly padding: number
    readonly includetext: boolean
    readonly binarytext: boolean
  }) => Promise<Uint8Array>
}

/**
 * EN: Loads `bwip-js` on first use, never at import time.
 * ES: Carga `bwip-js` en el primer uso, nunca al importar.
 * @throws {DteError} EN: `DEPENDENCY_UNAVAILABLE` with `module: 'bwip-js'`. ES: `DEPENDENCY_UNAVAILABLE` con `module: 'bwip-js'`.
 */
export const loadBarcodeModule = async (): Promise<BarcodeModule> => {
  try {
    return (await import('bwip-js')) as unknown as BarcodeModule
  } catch (error) {
    throw new DteError('DEPENDENCY_UNAVAILABLE', { module: 'bwip-js', reason: errorMessage(error) })
  }
}

// PDF417 as the SII reads it: the text is handed over as bytes (`binarytext`), so an `ñ` reaches the symbol as the
// single ISO-8859-1 byte that was signed, never as two UTF-8 bytes. Scale, height and padding are those of the field.
const STAMP_OPTIONS = {
  bcid: 'pdf417',
  scale: 3,
  height: 10,
  padding: 6,
  includetext: false,
  binarytext: true,
} as const

/**
 * EN: Renders the stamp with an already loaded barcode module. Internal: `renderPrintedSample` shares it.
 * ES: Genera el timbre con un módulo de códigos de barras ya cargado. Interno: lo comparte `renderPrintedSample`.
 */
export const renderTedBarcodeWith = async (barcode: BarcodeModule, tedXml: string): Promise<Uint8Array> => {
  if (!tedXml.includes('<TED')) throw new DteError('MISSING_FIELD', { field: 'TED' })
  encodeLatin1(tedXml)
  return new Uint8Array(await barcode.toBuffer({ ...STAMP_OPTIONS, text: tedXml }))
}

/**
 * EN: The PDF417 stamp of a TED as a PNG: error correction level 5, the TED bytes exactly as they were signed. The
 * renderer embeds it under the totals; callers with a layout of their own use it directly.
 * ES: El timbre PDF417 de un TED como PNG: nivel de corrección 5, los bytes del TED exactamente como se firmaron. El
 * renderizador lo incrusta bajo los totales; quien arma su propia diagramación lo usa directo.
 * @param tedXml EN: the `<TED>…</TED>` XML, verbatim from the signed document. ES: el XML `<TED>…</TED>`, textual del documento firmado.
 * @param load EN: loader of the barcode library, for tests. ES: cargador de la librería de códigos de barras, para tests.
 * @throws {DteError} EN: `MISSING_FIELD` (field `TED`) without a `<TED`, `ENCODING_UNSUPPORTED_CHAR` for a code point above U+00FF, `DEPENDENCY_UNAVAILABLE` when the library cannot be loaded. ES: `MISSING_FIELD` (campo `TED`) sin `<TED`, `ENCODING_UNSUPPORTED_CHAR` ante un code point mayor a U+00FF, `DEPENDENCY_UNAVAILABLE` si la librería no se puede cargar.
 */
export const renderTedBarcode = async (
  tedXml: string,
  load: () => Promise<BarcodeModule> = loadBarcodeModule,
): Promise<Uint8Array> => renderTedBarcodeWith(await load(), tedXml)
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/pdf/stamp --coverage=false
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/pdf/layout.ts src/pdf/stamp.ts tests/support/printed-fixtures.ts tests/support/pdf417.ts tests/pdf/stamp.test.ts
```

```bash
git commit -F - <<'MSG'
feat: PDF417 stamp of the TED

The layout constants of the SII printed-samples manual and renderTedBarcode, which hands the TED to
bwip-js as bytes so the symbol carries exactly what was signed. The tests decode the PNG with an
independent PDF417 reader.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 3: Printable documents from any DTE envelope

`parsePrintableDocuments` (spec 3.2): an `EnvioDTE`, `EnvioDTEB`, `EnvioDTETraslado`, `EnvioBOLETA`, bare `SetDTE` or bare `DTE` becomes a list of `PrintableDocument`, each `<TED>` copied verbatim from the input and matched to its document by folio and type.

**Files:**

- Create: `src/pdf/parse.ts`
- Test (create): `tests/pdf/parse.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/pdf/parse.test.ts` (new file, whole):

```ts
import { parsePrintableDocuments } from '../../src/pdf/parse'
import { extractTagContent } from '../../src/xml/parse'
import { ISSUER_RUT, RECEIVER_RUT } from '../support/fixtures'
import {
  bareSetDte,
  basicSetXml,
  creditNote,
  debitNote,
  invoice,
  receiptsXml,
  settlementXml,
  thirdPartyXml,
  withoutTed,
} from '../support/printed-fixtures'

const tag = (xml: string, name: string): number => Number(extractTagContent(xml, name))

describe('an envelope the SDK signed', () => {
  const [first, second, third] = parsePrintableDocuments(basicSetXml)

  test('yields one printable document per DTE, in order', () => {
    expect(parsePrintableDocuments(basicSetXml)).toHaveLength(3)
    expect([first.type, second.type, third.type]).toEqual([33, 61, 56])
    expect([first.folio, second.folio, third.folio]).toEqual(['7', '5', '8'])
  })

  test('copies every TED verbatim from the input and matches it by folio and type', () => {
    expect(first.tedXml).toBe(invoice.ted.xml)
    expect(second.tedXml).toBe(creditNote.ted.xml)
    expect(third.tedXml).toBe(debitNote.ted.xml)
    expect(basicSetXml).toContain(first.tedXml)
  })

  test('maps the header', () => {
    expect(first).toMatchObject({
      issueDate: '2026-11-15',
      transferReason: null,
      grossAmounts: false,
      issuer: {
        rut: ISSUER_RUT,
        name: 'Comercial Andina SpA',
        activity: 'Desarrollo de software',
        address: 'Av. Los Aromos 1540',
        commune: 'Ñuñoa',
        branch: '',
      },
      receiver: {
        rut: RECEIVER_RUT,
        name: 'Comercializadora Rapel Ltda',
        activity: 'Comercio al por menor',
        address: 'Pasaje Los Olmos 88',
        commune: 'Providencia',
      },
    })
  })

  test('maps the totals as numbers and leaves absent ones undefined', () => {
    expect(first.totals).toEqual({
      net: tag(invoice.xml, 'MntNeto'),
      exempt: undefined,
      vat: tag(invoice.xml, 'IVA'),
      vatRate: 19,
      total: tag(invoice.xml, 'MntTotal'),
    })
  })

  test('maps global adjustments, items and references', () => {
    expect(first.globalAdjustments).toEqual([{ kind: 'D', valueType: '%', value: 5 }])
    expect(first.items).toEqual([
      {
        code: 'LIC-01',
        name: 'Licencia anual de software de gestión para pequeñas empresas',
        quantity: 2,
        unit: undefined,
        unitPrice: 100000,
        amount: tag(invoice.xml, 'MontoItem'),
        discountAmount: 20000,
        discountPercent: 10,
      },
      {
        code: '',
        name: 'Soporte',
        quantity: 3,
        unit: 'HR',
        unitPrice: 15000,
        amount: 45000,
        discountAmount: undefined,
        discountPercent: undefined,
      },
    ])
    expect(first.references).toEqual([])
    expect(second.references).toEqual([
      { documentType: '33', folio: '7', date: '2026-11-15', reason: 'Anula factura' },
      { documentType: 'SET', folio: 'CASO-1', date: '2026-11-15', reason: 'Set de pruebas' },
    ])
    expect(third.globalAdjustments).toEqual([{ kind: 'R', valueType: '$', value: 2500 }])
  })
})

describe('other roots', () => {
  test('an EnvioBOLETA', () => {
    const [doc] = parsePrintableDocuments(receiptsXml)
    expect(doc).toMatchObject({ type: 39, folio: '11', grossAmounts: false, receiver: { rut: '66666666-6' } })
    expect(doc.items[0]).toMatchObject({ name: 'Café', quantity: 2 })
    expect(doc.tedXml).toContain('<TD>39</TD>')
  })

  test('a bare SetDTE and a bare DTE', () => {
    expect(parsePrintableDocuments(bareSetDte(basicSetXml))).toHaveLength(3)
    const [doc] = parsePrintableDocuments(invoice.xml)
    expect(doc.folio).toBe('7')
    expect(doc.tedXml).toBe(invoice.ted.xml)
  })

  test.each(['EnvioDTEB', 'EnvioDTETraslado'])('an %s envelope', (root) => {
    const xml = thirdPartyXml.replace('<EnvioDTE ', `<${root} `).replace('</EnvioDTE>', `</${root}>`)
    expect(parsePrintableDocuments(xml)[0].folio).toBe('100')
  })

  test('a settlement invoice lives under Liquidacion', () => {
    const [doc] = parsePrintableDocuments(settlementXml)
    expect(doc).toMatchObject({ type: 43, folio: '9', issuer: { activity: 'Comisionista' }, tedXml: '' })
  })

  test('any other root, or an envelope without documents, is an empty list', () => {
    expect(parsePrintableDocuments('<Foo><Bar/></Foo>')).toEqual([])
    expect(parsePrintableDocuments('<EnvioDTE><SetDTE/></EnvioDTE>')).toEqual([])
  })

  test('malformed XML is XML_PARSE_FAILED', () => {
    expect(() => parsePrintableDocuments('<EnvioDTE><SetDTE>')).toThrow(
      expect.objectContaining({ code: 'XML_PARSE_FAILED' }),
    )
  })
})

describe('third-party shapes', () => {
  const [doc] = parsePrintableDocuments(thirdPartyXml)

  test('issuer name from RznSocEmisor, branch, gross amounts, first of several codes, coerced quantity', () => {
    expect(doc).toMatchObject({
      grossAmounts: true,
      issuer: { name: 'Distribuidora Lican SpA', branch: 'Casa 2' },
      receiver: { name: 'Óptica Muñoz Ltda' },
    })
    expect(doc.items[0]).toEqual({
      code: '7800000000001',
      name: 'Lentes',
      quantity: 2,
      unit: 'PAR',
      unitPrice: 5950,
      amount: 11800,
      discountAmount: 100,
      discountPercent: undefined,
    })
    expect(doc.globalAdjustments).toEqual([{ kind: 'R', valueType: '$', value: 100 }])
    expect(doc.references).toEqual([
      { documentType: '801', folio: 'OC-55', date: '2026-09-30', reason: 'Orden de compra' },
    ])
  })

  test('type, folio and date fall back to the TED when IdDoc lacks them', () => {
    const xml = thirdPartyXml.replace(/<IdDoc>[\s\S]*?<\/IdDoc>/, '<IdDoc><MntBruto>1</MntBruto></IdDoc>')
    const [fallback] = parsePrintableDocuments(xml)
    expect(fallback).toMatchObject({ type: 33, folio: '100', issueDate: '2026-10-01' })
    expect(fallback.tedXml).toContain('<F>100</F>')
  })

  test('a TED that matches nothing is taken by position, and none at all is empty', () => {
    const [unmatched] = parsePrintableDocuments(
      thirdPartyXml.replace('<TipoDTE>33</TipoDTE>', '<TipoDTE>110</TipoDTE>'),
    )
    expect(unmatched.type).toBe(110)
    expect(unmatched.tedXml).toContain('<TD>33</TD>')
    const [none] = parsePrintableDocuments(withoutTed(thirdPartyXml))
    expect(none.tedXml).toBe('')
    expect(none.type).toBe(33)
  })

  test('a document with neither type nor TED is type 0', () => {
    const xml = withoutTed(thirdPartyXml).replace(/<IdDoc>[\s\S]*?<\/IdDoc>/, '<IdDoc><Folio>1</Folio></IdDoc>')
    expect(parsePrintableDocuments(xml)[0]).toMatchObject({ type: 0, folio: '1', issueDate: '' })
  })
})

describe('coercion and document elements', () => {
  test('a value that is not a number is undefined', () => {
    const [doc] = parsePrintableDocuments(thirdPartyXml.replace('<QtyItem>2.000</QtyItem>', '<QtyItem>dos</QtyItem>'))
    expect(doc.items[0].quantity).toBeUndefined()
  })

  test('an export document lives under Exportaciones', () => {
    const xml = settlementXml
      .replace(/Liquidacion/g, 'Exportaciones')
      .replace('<TipoDTE>43</TipoDTE>', '<TipoDTE>110</TipoDTE>')
    expect(parsePrintableDocuments(xml)[0]).toMatchObject({ type: 110, folio: '9' })
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/pdf/parse --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/pdf/parse'`.

- [ ] **Step 3: Write the implementation**

`src/pdf/parse.ts` (new file, whole):

```ts
import { extractTagContent, parseXml, type ParsedXml } from '../xml/parse'

/**
 * EN: A party of the printed document, as written in the XML.
 * ES: Una parte del documento impreso, tal como viene en el XML.
 */
export type PrintableParty = {
  /** EN: RUT as written. ES: `RUTEmisor` / `RUTRecep` — RUT tal como viene. */
  readonly rut: string
  /** EN: Legal name. ES: `RznSoc` (o `RznSocEmisor`) / `RznSocRecep` — Razón social. */
  readonly name: string
  /** EN: Line of business. ES: `GiroEmis` / `GiroRecep` — Giro. */
  readonly activity: string
  /** EN: Street address. ES: `DirOrigen` / `DirRecep` — Dirección. */
  readonly address: string
  /** EN: Commune. ES: `CmnaOrigen` / `CmnaRecep` — Comuna. */
  readonly commune: string
}

/**
 * EN: The issuer of the printed document.
 * ES: El emisor del documento impreso.
 */
export type PrintableIssuer = PrintableParty & {
  /** EN: Branch, empty when none. ES: `Sucursal` — Sucursal, vacía si no hay. */
  readonly branch: string
}

/**
 * EN: The totals that print; absent ones are undefined.
 * ES: Los totales que se imprimen; los ausentes quedan undefined.
 */
export type PrintableTotals = {
  /** EN: Net amount. ES: `MntNeto` — Monto neto. */
  readonly net?: number
  /** EN: Exempt amount. ES: `MntExe` — Monto exento. */
  readonly exempt?: number
  /** EN: VAT. ES: `IVA` — IVA. */
  readonly vat?: number
  /** EN: VAT rate. ES: `TasaIVA` — Tasa del IVA. */
  readonly vatRate?: number
  /** EN: Total. ES: `MntTotal` — Monto total. */
  readonly total?: number
}

/**
 * EN: A global discount or surcharge.
 * ES: `DscRcgGlobal` — Descuento o recargo global.
 */
export type PrintableAdjustment = {
  /** EN: `D` discount or `R` surcharge. ES: `TpoMov` — `D` descuento o `R` recargo. */
  readonly kind: 'D' | 'R'
  /** EN: `%` or `$`. ES: `TpoValor` — `%` o `$`. */
  readonly valueType: '%' | '$'
  /** EN: Value in that unit. ES: `ValorDR` — Valor en esa unidad. */
  readonly value?: number
}

/**
 * EN: A detail line.
 * ES: `Detalle` — Línea de detalle.
 */
export type PrintableItem = {
  /** EN: Item code (the first when there are several). ES: `CdgItem/VlrCodigo` — Código del ítem (el primero si hay varios). */
  readonly code: string
  /** EN: Item name. ES: `NmbItem` — Nombre del ítem. */
  readonly name: string
  /** EN: Quantity. ES: `QtyItem` — Cantidad. */
  readonly quantity?: number
  /** EN: Unit of measure. ES: `UnmdItem` — Unidad de medida. */
  readonly unit?: string
  /** EN: Unit price. ES: `PrcItem` — Precio unitario. */
  readonly unitPrice?: number
  /** EN: Line amount. ES: `MontoItem` — Monto de la línea. */
  readonly amount?: number
  /** EN: Line discount amount. ES: `DescuentoMonto` — Monto del descuento de la línea. */
  readonly discountAmount?: number
  /** EN: Line discount percent. ES: `DescuentoPct` — Porcentaje de descuento de la línea. */
  readonly discountPercent?: number
}

/**
 * EN: A reference to another document.
 * ES: `Referencia` — Referencia a otro documento.
 */
export type PrintableReference = {
  /** EN: Referenced document type, as written (`SET` and non-DTE codes included). ES: `TpoDocRef` — Tipo del documento referenciado, tal como viene (`SET` y códigos no DTE incluidos). */
  readonly documentType: string
  /** EN: Referenced folio. ES: `FolioRef` — Folio referenciado. */
  readonly folio: string
  /** EN: Referenced date. ES: `FchRef` — Fecha referenciada. */
  readonly date: string
  /** EN: Reason. ES: `RazonRef` — Razón de la referencia. */
  readonly reason: string
}

/**
 * EN: What the printed sample needs of a document, parsed from its XML. Strings are empty and numbers undefined when the
 * tag is absent.
 * ES: Lo que la muestra impresa necesita de un documento, parseado de su XML. Los strings quedan vacíos y los números
 * undefined cuando falta la etiqueta.
 */
export type PrintableDocument = {
  /** EN: Document type; `TD` of the TED when `IdDoc` lacks it; 0 when neither has it. ES: `TipoDTE` — Tipo de documento; `TD` del TED si falta en `IdDoc`; 0 si no está en ninguno. */
  readonly type: number
  /** EN: Folio; `F` of the TED as fallback. ES: `Folio` — Folio; `F` del TED como respaldo. */
  readonly folio: string
  /** EN: Issue date as written (YYYY-MM-DD); `FE` of the TED as fallback. ES: `FchEmis` — Fecha de emisión tal como viene (AAAA-MM-DD); `FE` del TED como respaldo. */
  readonly issueDate: string
  /** EN: Transfer reason of a dispatch guide, null when absent. ES: `IndTraslado` — Tipo de traslado de una guía, null si falta. */
  readonly transferReason: number | null
  /** EN: Line amounts include VAT. ES: `MntBruto` — Montos de las líneas con IVA incluido (1). */
  readonly grossAmounts: boolean
  readonly issuer: PrintableIssuer
  readonly receiver: PrintableParty
  readonly totals: PrintableTotals
  readonly globalAdjustments: readonly PrintableAdjustment[]
  readonly items: readonly PrintableItem[]
  readonly references: readonly PrintableReference[]
  /** EN: The `<TED>…</TED>` substring of the input, verbatim; empty when none. ES: `TED` — El trozo `<TED>…</TED>` del XML de entrada, textual; vacío si no hay. */
  readonly tedXml: string
}

const TED_PATTERN = /<TED[^>]*>[\s\S]*?<\/TED>/g

const toArray = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]

const record = (value: unknown): ParsedXml =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as ParsedXml) : {}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const number = (value: unknown): number | undefined => {
  const raw = text(value)
  if (raw === '') return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

const party = (node: ParsedXml, tags: Readonly<Record<keyof PrintableParty, string>>): PrintableParty => ({
  rut: text(node[tags.rut]),
  name: text(node[tags.name]),
  activity: text(node[tags.activity]),
  address: text(node[tags.address]),
  commune: text(node[tags.commune]),
})

const RECEIVER_TAGS = {
  rut: 'RUTRecep',
  name: 'RznSocRecep',
  activity: 'GiroRecep',
  address: 'DirRecep',
  commune: 'CmnaRecep',
} as const

const item = (node: ParsedXml): PrintableItem => ({
  code: text(record(toArray(node.CdgItem)[0]).VlrCodigo),
  name: text(node.NmbItem),
  quantity: number(node.QtyItem),
  unit: text(node.UnmdItem) || undefined,
  unitPrice: number(node.PrcItem),
  amount: number(node.MontoItem),
  discountAmount: number(node.DescuentoMonto),
  discountPercent: number(node.DescuentoPct),
})

const reference = (node: ParsedXml): PrintableReference => ({
  documentType: text(node.TpoDocRef),
  folio: text(node.FolioRef),
  date: text(node.FchRef),
  reason: text(node.RazonRef),
})

const adjustment = (node: ParsedXml): PrintableAdjustment => ({
  kind: text(node.TpoMov) === 'D' ? 'D' : 'R',
  valueType: text(node.TpoValor) === '%' ? '%' : '$',
  value: number(node.ValorDR),
})

const documentNodes = (parsed: ParsedXml): readonly ParsedXml[] => {
  const envelope = record(parsed.EnvioDTE ?? parsed.EnvioDTEB ?? parsed.EnvioDTETraslado ?? parsed.EnvioBOLETA)
  const set = record(envelope.SetDTE ?? parsed.SetDTE)
  const fromSet = toArray(set.DTE).map(record)
  return fromSet.length > 0 ? fromSet : parsed.DTE === undefined ? [] : [record(parsed.DTE)]
}

const printable = (dte: ParsedXml, teds: readonly string[], index: number): PrintableDocument => {
  const document = record(dte.Documento ?? dte.Liquidacion ?? dte.Exportaciones)
  const header = record(document.Encabezado)
  const idDoc = record(header.IdDoc)
  const issuer = record(header.Emisor)
  const totals = record(header.Totales)
  const folio = text(idDoc.Folio)
  const type = text(idDoc.TipoDTE)
  const matching = teds.find(
    (candidate) => extractTagContent(candidate, 'F') === folio && extractTagContent(candidate, 'TD') === type,
  )
  const tedXml = matching ?? (index < teds.length ? teds[index] : '')
  return {
    type: number(idDoc.TipoDTE) ?? number(extractTagContent(tedXml, 'TD')) ?? 0,
    folio: folio || text(extractTagContent(tedXml, 'F')),
    issueDate: text(idDoc.FchEmis) || text(extractTagContent(tedXml, 'FE')),
    transferReason: number(idDoc.IndTraslado) ?? null,
    grossAmounts: number(idDoc.MntBruto) === 1,
    issuer: {
      ...party(issuer, {
        rut: 'RUTEmisor',
        name: 'RznSoc',
        activity: 'GiroEmis',
        address: 'DirOrigen',
        commune: 'CmnaOrigen',
      }),
      name: text(issuer.RznSoc) || text(issuer.RznSocEmisor),
      branch: text(issuer.Sucursal),
    },
    receiver: party(record(header.Receptor), RECEIVER_TAGS),
    totals: {
      net: number(totals.MntNeto),
      exempt: number(totals.MntExe),
      vat: number(totals.IVA),
      vatRate: number(totals.TasaIVA),
      total: number(totals.MntTotal),
    },
    globalAdjustments: toArray(document.DscRcgGlobal).map(record).map(adjustment),
    items: toArray(document.Detalle).map(record).map(item),
    references: toArray(document.Referencia).map(record).map(reference),
    tedXml,
  }
}

/**
 * EN: The printable documents of an XML: an `EnvioDTE`, `EnvioDTEB`, `EnvioDTETraslado` or `EnvioBOLETA` envelope, a
 * bare `SetDTE`, or a bare `DTE` (what `SignedDocument.xml` holds). Any other root yields an empty list. Each `<TED>` is
 * copied verbatim from the input text and matched to its document by folio and type, or by position when nothing
 * matches, so the stamp carries the bytes that were signed. Numbers are coerced as the schema defines them.
 * ES: Los documentos imprimibles de un XML: un sobre `EnvioDTE`, `EnvioDTEB`, `EnvioDTETraslado` o `EnvioBOLETA`, un
 * `SetDTE` suelto o un `DTE` suelto (lo que trae `SignedDocument.xml`). Cualquier otra raíz devuelve lista vacía. Cada
 * `<TED>` se copia textual del texto de entrada y se asigna a su documento por folio y tipo, o por posición si nada
 * coincide, para que el timbre lleve los bytes que se firmaron. Los números se convierten como define el esquema.
 * @param xml EN: the XML text. ES: el texto XML.
 * @throws {DteError} EN: `XML_PARSE_FAILED` when the XML is not well-formed. ES: `XML_PARSE_FAILED` si el XML no está bien formado.
 */
export const parsePrintableDocuments = (xml: string): readonly PrintableDocument[] => {
  const parsed = parseXml(xml)
  const teds = xml.match(TED_PATTERN) ?? []
  return documentNodes(parsed).map((dte, index) => printable(dte, teds, index))
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/pdf/parse --coverage=false
```

Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/pdf/parse.ts tests/pdf/parse.test.ts
```

```bash
git commit -F - <<'MSG'
feat: printable documents from any DTE envelope

parsePrintableDocuments reads an EnvioDTE, EnvioBOLETA, SetDTE or bare DTE and copies each TED
verbatim from the input, matched to its document by folio and type.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 4: The printed sample PDF

`renderPrintedSample` and `needsTransferableCopy` (spec 3.3): one page per the manual, drawn in two passes, measure then draw, with the transferable copy and the stamp. The test support loads the PDF back, inflates the page content to read the drawn strings, and rebuilds the embedded stamp image to decode it.

**Files:**

- Create: `src/pdf/render.ts`
- Test (create): `tests/support/pdf.ts`
- Test (create): `tests/pdf/render.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/support/pdf.ts` (new file, whole):

```ts
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream, type PDFObject } from 'pdf-lib'
import { decodePdf417, luminanceOf, type Luminance } from './pdf417'

export type PdfPageInfo = { readonly pages: number; readonly width: number; readonly height: number }

export const pdfPage = async (bytes: Uint8Array): Promise<PdfPageInfo> => {
  const document = await PDFDocument.load(bytes)
  const { width, height } = document.getPage(0).getSize()
  return { pages: document.getPageCount(), width, height }
}

const rawStream = (document: PDFDocument, object: PDFObject): PDFRawStream => {
  const stream = document.context.lookup(object)
  if (!(stream instanceof PDFRawStream)) throw new Error('expected a raw stream')
  return stream
}

/** Every string drawn on the first page, in drawing order, one per line (WinAnsi read as Latin-1). */
export const pdfText = async (bytes: Uint8Array): Promise<string> => {
  const document = await PDFDocument.load(bytes)
  const contents = document.getPage(0).node.Contents()
  const parts = contents instanceof PDFArray ? contents.asArray() : contents === undefined ? [] : [contents]
  const strings: string[] = []
  for (const part of parts) {
    const text = Buffer.from(decodePDFRawStream(rawStream(document, part)).decode()).toString('latin1')
    for (const match of text.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g))
      strings.push(Buffer.from(match[1], 'hex').toString('latin1'))
  }
  return strings.join('\n')
}

export type PdfImage = { readonly width: number; readonly height: number; readonly pixels: Luminance | null }

const numberOf = (dict: PDFDict, key: string): number => Number(dict.get(PDFName.of(key))?.toString())

/** The image objects of the first page; `pixels` is null for an encoding the test helper cannot decode (JPEG). */
export const pdfImages = async (bytes: Uint8Array): Promise<readonly PdfImage[]> => {
  const document = await PDFDocument.load(bytes)
  const xobjects = document.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'))
  if (!(xobjects instanceof PDFDict)) return []
  const images: PdfImage[] = []
  for (const [, value] of xobjects.entries()) {
    const stream = rawStream(document, value)
    if (stream.dict.get(PDFName.of('Subtype'))?.toString() !== '/Image') continue
    const width = numberOf(stream.dict, 'Width')
    const height = numberOf(stream.dict, 'Height')
    try {
      const data = decodePDFRawStream(stream).decode()
      const mask = stream.dict.get(PDFName.of('SMask'))
      const alpha = mask === undefined ? null : decodePDFRawStream(rawStream(document, mask)).decode()
      images.push({ width, height, pixels: luminanceOf(data, width, height, alpha) })
    } catch {
      images.push({ width, height, pixels: null })
    }
  }
  return images
}

/** The TED decoded from the stamp embedded in the PDF, by an independent PDF417 reader. */
export const decodeStampInPdf = async (bytes: Uint8Array): Promise<string> => {
  for (const image of await pdfImages(bytes)) {
    if (image.pixels === null) continue
    try {
      return decodePdf417(image.pixels)
    } catch {
      // not the stamp (a logo): try the next image
    }
  }
  throw new Error('no decodable stamp in the PDF')
}
```

`tests/pdf/render.test.ts` (new file, whole):

```ts
import fc from 'fast-check'
import { PNG } from 'pngjs'
import { parsePrintableDocuments, type PrintableDocument } from '../../src/pdf/parse'
import { needsTransferableCopy, renderPrintedSample } from '../../src/pdf/render'
import { FIXED_NOW } from '../support/fixtures'
import { decodeStampInPdf, pdfImages, pdfPage, pdfText } from '../support/pdf'
import { failure } from '../support/portal'
import {
  basicSetXml,
  creditNote,
  exemptInvoice,
  guide,
  invoice,
  receiptsXml,
  settlementXml,
  thirdPartyXml,
  withoutTed,
} from '../support/printed-fixtures'

const first = (xml: string): PrintableDocument => parsePrintableDocuments(xml)[0]
const invoiceDoc = first(invoice.xml)
const render = (doc: PrintableDocument, options = {}) => renderPrintedSample(doc, { now: () => FIXED_NOW, ...options })

const smallPng = (): Uint8Array => {
  const png = new PNG({ width: 4, height: 4 })
  png.data.fill(200)
  return new Uint8Array(PNG.sync.write(png))
}

describe('an invoice', () => {
  let pdf: Uint8Array
  let text: string
  beforeAll(async () => {
    pdf = await render(invoiceDoc)
    text = await pdfText(pdf)
  })

  test('is one page, 21.5 cm wide, between 11 and 33 cm tall', async () => {
    const page = await pdfPage(pdf)
    expect(page.pages).toBe(1)
    expect(page.width).toBeCloseTo(609.45)
    expect(page.height).toBeGreaterThanOrEqual(311.81)
    expect(page.height).toBeLessThanOrEqual(935.43)
    expect(pdf.length).toBeLessThanOrEqual(500 * 1024)
  })

  test('prints the type box, the issuer, the date, the receiver, the detail and the totals', () => {
    expect(text).toContain('R.U.T.: 76.543.210-3')
    expect(text).toContain('FACTURA ELECTRÓNICA')
    expect(text).toContain('N° 7')
    expect(text).toContain('S.I.I. - SANTIAGO CENTRO')
    expect(text).toContain('Comercial Andina SpA')
    expect(text).toContain('Casa Matriz: Av. Los Aromos 1540, Ñuñoa')
    expect(text).toContain('Fecha Emisión: 2026-11-15')
    expect(text).toContain('Comercializadora Rapel Ltda')
    expect(text).toContain('12345678-5')
    expect(text).toContain('Detalle')
    expect(text).toContain('LIC-01')
    expect(text).toContain('Dcto: $20.000')
    expect(text).toContain('HR')
    expect(text).toContain('$100.000')
    expect(text).toContain('Descuento Global')
    expect(text).toContain('5%')
    expect(text).toContain('Monto Neto')
    expect(text).toContain('IVA (19%)')
    expect(text).toContain('Monto Total')
    expect(text).not.toContain('Sucursal:')
    expect(text).not.toContain('Referencias')
    expect(text).not.toContain('Tipo de Traslado')
  })

  test('carries the stamp with its legends, and the stamp decodes to the signed TED', async () => {
    expect(text).toContain('Timbre Electrónico SII')
    expect(text).toContain('Res. Ex. SII N° 0 del 2026')
    expect(text).toContain('Verifique documento: www.sii.cl')
    expect(await pdfImages(pdf)).toHaveLength(1)
    expect(await decodeStampInPdf(pdf)).toBe(invoice.ted.xml)
  })

  test('has no acknowledgement box nor CEDIBLE mark on the plain copy', () => {
    expect(text).not.toContain('Acuse de Recibo')
    expect(text).not.toContain('CEDIBLE')
  })

  test('the transferable copy adds the acknowledgement box and the CEDIBLE mark', async () => {
    const copy = await pdfText(await render(invoiceDoc, { transferable: true }))
    expect(copy).toContain('Acuse de Recibo')
    expect(copy).toContain('Nombre: ____________________________')
    expect(copy).toContain('Recinto: __________________')
    expect(copy).toContain(
      'El acuse de recibo que se declara en este acto, de acuerdo a lo dispuesto en la letra b) del Art.',
    )
    expect(copy).toContain('CEDIBLE')
    expect(copy).not.toContain('CEDIBLE CON SU FACTURA')
  })

  test('office and resolution come from the options', async () => {
    const custom = await pdfText(
      await render(invoiceDoc, { siiOffice: 'S.I.I. - SANTIAGO ORIENTE', resolution: 'Res. Ex. SII N° 80 del 2014' }),
    )
    expect(custom).toContain('S.I.I. - SANTIAGO ORIENTE')
    expect(custom).toContain('Res. Ex. SII N° 80 del 2014')
    expect(custom).not.toContain('SANTIAGO CENTRO')
  })

  test('the default resolution takes the year from the system clock when no clock is given', async () => {
    const year = new Date().getFullYear()
    expect(await pdfText(await renderPrintedSample(invoiceDoc))).toContain(`Res. Ex. SII N° 0 del ${year}`)
  })
})

describe('the other types', () => {
  test('a dispatch guide prints the transfer reason; a sale gets CEDIBLE CON SU FACTURA', async () => {
    const sale = await pdfText(await render(first(guide(1).xml), { transferable: true }))
    expect(sale).toContain('GUÍA DE DESPACHO\nELECTRÓNICA')
    expect(sale).toContain('Tipo de Traslado: 1 - Operación constituye venta')
    expect(sale).toContain('CEDIBLE CON SU FACTURA')
    expect(sale).toContain('Acuse de Recibo')
    const internal = await pdfText(await render(first(guide(5).xml), { transferable: true }))
    expect(internal).toContain('Tipo de Traslado: 5 - Traslados internos')
    expect(internal).not.toContain('CEDIBLE')
    expect(internal).not.toContain('Acuse de Recibo')
  })

  test('a credit note prints its references and never a transferable copy', async () => {
    const note = await pdfText(await render(first(creditNote.xml), { transferable: true }))
    expect(note).toContain('NOTA DE CRÉDITO')
    expect(note).toContain('Referencias a otros documentos')
    expect(note).toContain('Razón Referencia')
    expect(note).toContain('Anula factura')
    expect(note).toContain('Tipo SET')
    expect(note).toContain('CASO-1')
    expect(note).not.toContain('CEDIBLE')
    expect(note).not.toContain('Acuse de Recibo')
  })

  test('an exempt invoice prints only the exempt amount and the total', async () => {
    const exempt = await pdfText(await render(first(exemptInvoice.xml)))
    expect(exempt).toContain('FACTURA NO AFECTA O\nEXENTA ELECTRÓNICA') // the type name wraps inside the box
    expect(exempt).toContain('Monto Exento')
    expect(exempt).toContain('Monto Total')
    expect(exempt).not.toContain('Monto Neto')
    expect(exempt).not.toContain('IVA (')
  })

  test('a receipt prints with the same layout', async () => {
    const receipt = await pdfText(await render(first(receiptsXml)))
    expect(receipt).toContain('BOLETA ELECTRÓNICA')
    expect(receipt).toContain('Café')
    expect(receipt).toContain('Monto Total')
  })

  test('third-party shapes: branch, gross labels, a surcharge, an amount discount and a non-DTE reference', async () => {
    const third = await pdfText(await render(first(thirdPartyXml)))
    expect(third).toContain('Sucursal: Casa 2')
    expect(third).toContain('Distribuidora Lican SpA')
    expect(third).toContain('P.Unit. c/IVA')
    expect(third).toContain('Valor c/IVA')
    expect(third).toContain('Recargo Global')
    expect(third).toContain('$100')
    expect(third).toContain('Dcto: $100')
    expect(third).toContain('Tipo 801')
    expect(third).toContain('PAR')
    expect(third).toContain('Óptica Muñoz Ltda')
  })

  test('a type outside the catalog prints as DTE {type} and a settlement invoice under Liquidacion prints', async () => {
    const unknown = await pdfText(
      await render(first(thirdPartyXml.replace('<TipoDTE>33</TipoDTE>', '<TipoDTE>110</TipoDTE>'))),
    )
    expect(unknown).toContain('DTE 110')
    const settlement = await pdfText(await render(first(settlementXml)))
    expect(settlement).toContain('LIQUIDACIÓN FACTURA')
    expect(settlement).toContain('Comisionista')
  })
})

describe('page height', () => {
  test('a document without TED has no image and no stamp legends', async () => {
    const pdf = await render(first(withoutTed(thirdPartyXml)))
    expect(await pdfImages(pdf)).toHaveLength(0)
    expect(await pdfText(pdf)).not.toContain('Timbre Electrónico SII')
  })

  test('a tiny document gets the minimum height', async () => {
    const tiny = { ...invoiceDoc, tedXml: '', items: [], references: [], globalAdjustments: [], totals: {} }
    expect((await pdfPage(await render(tiny))).height).toBeCloseTo(311.81)
  })

  test('a long detail stops at the maximum height', async () => {
    const items = Array.from({ length: 80 }, (_, index) => ({
      code: '',
      name: `Producto ${index + 1}`,
      quantity: 1,
      unitPrice: 1000,
      amount: 1000,
    }))
    expect((await pdfPage(await render({ ...invoiceDoc, items }))).height).toBeCloseTo(935.43)
  })

  test('a word wider than the column is split by characters and the row grows', async () => {
    const short = await pdfPage(await render({ ...invoiceDoc, tedXml: '' }))
    const long = await pdfPage(
      await render({ ...invoiceDoc, tedXml: '', items: [{ ...invoiceDoc.items[0], name: 'X'.repeat(160) }] }),
    )
    expect(long.height).toBeGreaterThan(short.height)
  })

  test('stays within the bounds for any detail', async () => {
    const letters = 'abcdefghijklmnopqrstuvwxyz ÁÉÍÓÚñ'.split('')
    const name = fc.array(fc.constantFrom(...letters), { minLength: 1, maxLength: 120 }).map((chars) => chars.join(''))
    await fc.assert(
      fc.asyncProperty(fc.array(name, { minLength: 1, maxLength: 40 }), async (names) => {
        const items = names.map((itemName, index) => ({ code: '', name: itemName, quantity: index + 1, amount: 100 }))
        const page = await pdfPage(await render({ ...invoiceDoc, tedXml: '', items }))
        expect(page.pages).toBe(1)
        expect(page.height).toBeGreaterThanOrEqual(311.81)
        expect(page.height).toBeLessThanOrEqual(935.43)
      }),
      { numRuns: 8 },
    )
  })
})

describe('the logo', () => {
  test('a PNG logo is embedded next to the stamp', async () => {
    expect(await pdfImages(await render(invoiceDoc, { logo: { bytes: smallPng(), format: 'png' } }))).toHaveLength(2)
  })

  test('a JPEG logo is embedded as JPEG', async () => {
    // The smallest valid JPEG: a 1×1 grey pixel.
    const jpeg = Buffer.from(
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
      'base64',
    )
    const images = await pdfImages(await render(invoiceDoc, { logo: { bytes: new Uint8Array(jpeg), format: 'jpeg' } }))
    expect(images).toHaveLength(2)
    expect(images.some((image) => image.pixels === null)).toBe(true)
  })

  test('bytes the library cannot embed are ignored', async () => {
    const pdf = await render(invoiceDoc, { logo: { bytes: new Uint8Array([1, 2, 3]), format: 'png' } })
    expect(await pdfImages(pdf)).toHaveLength(1)
  })
})

describe('needsTransferableCopy', () => {
  test.each([
    [33, null, true],
    [34, null, true],
    [43, null, true],
    [46, null, true],
    [52, null, true],
    [52, 1, true],
    [52, 9, true],
    [52, 5, false],
    [52, 3, false],
    [56, null, false],
    [61, null, false],
    [39, null, false],
    [110, null, false],
    [0, null, false],
  ])('type %s with transfer reason %s → %s', (type, transferReason, expected) => {
    expect(needsTransferableCopy({ ...invoiceDoc, type, transferReason })).toBe(expected)
  })
})

describe('errors', () => {
  test('a document without type is MISSING_FIELD', async () => {
    const error = await failure(render({ ...invoiceDoc, type: 0 }))
    expect(error.code).toBe('MISSING_FIELD')
    expect(error.details).toEqual({ field: 'TipoDTE' })
  })

  test('a character outside WinAnsi is PDF_RENDER_FAILED with the type and folio', async () => {
    const error = await failure(render({ ...invoiceDoc, items: [{ ...invoiceDoc.items[0], name: '你好' }] }))
    expect(error.code).toBe('PDF_RENDER_FAILED')
    expect(error.details).toMatchObject({ type: 33, folio: '7' })
    expect(typeof error.details.reason).toBe('string')
  })

  test('a TED with a code point above U+00FF keeps its own code', async () => {
    const error = await failure(render({ ...invoiceDoc, tedXml: invoiceDoc.tedXml.replace('<RSR>', '<RSR>€') }))
    expect(error.code).toBe('ENCODING_UNSUPPORTED_CHAR')
  })

  test('a loader that fails propagates its error', async () => {
    await expect(
      renderPrintedSample(invoiceDoc, {}, async () => {
        throw new Error('no libraries')
      }),
    ).rejects.toThrow('no libraries')
  })

  test.each(['pdf-lib', 'bwip-js'])('when %s cannot be loaded it is DEPENDENCY_UNAVAILABLE', async (module) => {
    jest.doMock(module, () => {
      throw new Error('not installed')
    })
    try {
      await jest.isolateModulesAsync(async () => {
        const { loadPdfModules: load } = await import('../../src/pdf/render')
        const error = await failure(load())
        expect(error.code).toBe('DEPENDENCY_UNAVAILABLE')
        expect(error.details).toEqual({ module, reason: 'not installed' })
      })
    } finally {
      jest.dontMock(module)
    }
  })
})

test('every sample of the basic set weighs at most 500 KB', async () => {
  for (const doc of parsePrintableDocuments(basicSetXml)) {
    expect((await render(doc, { transferable: true })).length).toBeLessThanOrEqual(500 * 1024)
  }
})

describe('sparse data', () => {
  test('empty names, items without amounts, a percent-only discount and an adjustment without value still print', async () => {
    const sparse: PrintableDocument = {
      ...invoiceDoc,
      tedXml: '',
      issuer: { ...invoiceDoc.issuer, commune: '' },
      items: [
        { code: '', name: '' },
        { code: 'A', name: 'Con descuento', discountPercent: 15 },
      ],
      globalAdjustments: [{ kind: 'D', valueType: '%' }],
      references: [{ documentType: '', folio: 'X-1', date: '', reason: '' }],
      totals: { net: 100, exempt: 50, vat: 19, total: 169 },
    }
    const text = await pdfText(await render(sparse))
    expect(text).toContain('Casa Matriz: Av. Los Aromos 1540\n')
    expect(text).toContain('Dcto: 15%')
    expect(text).toContain('Descuento Global')
    expect(text).toContain('Monto Exento')
    expect(text).toContain('$50')
    expect(text).toContain('X-1')
  })

  test('an exempt invoice without amounts prints no total rows, and an issuer RUT that is not valid prints as it came', async () => {
    const text = await pdfText(
      await render({
        ...first(exemptInvoice.xml),
        tedXml: '',
        totals: {},
        issuer: { ...invoiceDoc.issuer, rut: 'sin-rut' },
      }),
    )
    expect(text).not.toContain('Monto')
    expect(text).toContain('R.U.T.: sin-rut')
  })

  test('a transfer reason outside the table prints its number alone', async () => {
    const text = await pdfText(await render({ ...first(guide(1).xml), transferReason: 12 }))
    expect(text).toContain('Tipo de Traslado: 12 - ')
  })

  test('a description wider than two columns is split by characters more than once', async () => {
    const wide = { ...invoiceDoc, tedXml: '', items: [{ code: '', name: 'W'.repeat(400) }] }
    expect((await pdfPage(await render(wide))).height).toBeGreaterThan(400)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/pdf/render --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/pdf/render'`.

- [ ] **Step 3: Write the implementation**

`src/pdf/render.ts` (new file, whole):

```ts
import type { PDFDocument, PDFFont, PDFImage, PDFPage, RGB } from 'pdf-lib'
import { format } from 'rut.ts'
import { documentTypeName, isDocumentType, isTransferable } from '../catalogs/document-types'
import { DteError, errorMessage, isDteError } from '../errors'
import {
  ACKNOWLEDGEMENT_TEXT,
  BOX,
  COLOURS,
  DEFAULT_SII_OFFICE,
  FONT,
  GAP,
  LINE,
  MARGIN,
  PAGE,
  STAMP,
  TABLE,
  TRANSFER_REASON_NAMES,
  TYPE_BOX,
  defaultResolution,
} from './layout'
import type { PrintableDocument, PrintableItem } from './parse'
import { loadBarcodeModule, renderTedBarcodeWith, type BarcodeModule } from './stamp'

/**
 * EN: A logo for the top left of the sample.
 * ES: Un logo para la esquina superior izquierda de la muestra.
 */
export type PrintedLogo = {
  /** EN: PNG or JPEG bytes. ES: Bytes PNG o JPEG. */
  readonly bytes: Uint8Array
  /** EN: Image format. ES: Formato de la imagen. */
  readonly format: 'png' | 'jpeg'
}

/**
 * EN: Options shared by every printed sample.
 * ES: Opciones comunes a todas las muestras impresas.
 */
export type PrintedSampleOptions = {
  /** EN: SII office under the type box; default `S.I.I. - SANTIAGO CENTRO`. ES: Oficina del SII bajo el recuadro; por defecto `S.I.I. - SANTIAGO CENTRO`. */
  readonly siiOffice?: string
  /** EN: Resolution line under the stamp; default `Res. Ex. SII N° 0 del {year}`. ES: Línea de resolución bajo el timbre; por defecto `Res. Ex. SII N° 0 del {año}`. */
  readonly resolution?: string
  /** EN: Logo at the top left; one the library cannot embed is ignored. ES: Logo arriba a la izquierda; uno que la librería no pueda incrustar se ignora. */
  readonly logo?: PrintedLogo
  /** EN: Clock for the year of the default resolution. ES: Reloj para el año de la resolución por defecto. */
  readonly now?: () => Date
}

/**
 * EN: Options of `renderPrintedSample`.
 * ES: Opciones de `renderPrintedSample`.
 */
export type RenderPrintedSampleOptions = PrintedSampleOptions & {
  /** EN: Draw the transferable copy (acknowledgement box and `CEDIBLE` mark) when the document admits one; default false. ES: Dibujar la copia cedible (acuse de recibo y marca `CEDIBLE`) cuando el documento la admite; por defecto false. */
  readonly transferable?: boolean
}

/**
 * EN: The part of the PDF library the renderer uses.
 * ES: La parte de la librería PDF que usa el renderizador.
 */
export type PdfModule = Pick<typeof import('pdf-lib'), 'PDFDocument' | 'StandardFonts' | 'rgb'>

/**
 * EN: The two libraries the renderer loads on first use.
 * ES: Las dos librerías que el renderizador carga en el primer uso.
 */
export type PdfModules = {
  /** EN: `pdf-lib`. ES: `pdf-lib`. */
  readonly pdf: PdfModule
  /** EN: `bwip-js`. ES: `bwip-js`. */
  readonly barcode: BarcodeModule
}

/**
 * EN: Loads `pdf-lib` and `bwip-js` on first use, never at import time.
 * ES: Carga `pdf-lib` y `bwip-js` en el primer uso, nunca al importar.
 * @throws {DteError} EN: `DEPENDENCY_UNAVAILABLE` with the `module` that failed. ES: `DEPENDENCY_UNAVAILABLE` con el `module` que falló.
 */
export const loadPdfModules = async (): Promise<PdfModules> => {
  const pdf = await import('pdf-lib').catch((error: unknown) => {
    throw new DteError('DEPENDENCY_UNAVAILABLE', { module: 'pdf-lib', reason: errorMessage(error) })
  })
  return { pdf, barcode: await loadBarcodeModule() }
}

/**
 * EN: True when the printed document carries a transferable copy: 33, 34, 43 and 46 always; 52 only when the transfer
 * is a sale (reason 1 or 9, 1 assumed when absent), as the manual excludes transfers that are not sales; never for
 * notes or receipts. The acknowledgement box and the `CEDIBLE` mark are drawn only when this is true and the caller
 * asks for the copy.
 * ES: True cuando el documento impreso lleva copia cedible: 33, 34, 43 y 46 siempre; 52 solo cuando el traslado es
 * venta (tipo 1 o 9, 1 si falta), porque el manual excluye los traslados que no son venta; nunca notas ni boletas. El
 * acuse de recibo y la marca `CEDIBLE` se dibujan solo cuando esto es true y el llamador pide la copia.
 */
export const needsTransferableCopy = (doc: PrintableDocument): boolean =>
  isDocumentType(doc.type) && isTransferable(doc.type) && (doc.type !== 52 || [1, 9].includes(doc.transferReason ?? 1))

type Fonts = { readonly normal: PDFFont; readonly bold: PDFFont }
type Rgb = readonly [number, number, number]
type Canvas = {
  readonly page: PDFPage
  readonly fonts: Fonts
  readonly height: number
  readonly paint: (colour: Rgb) => RGB
}
type RectStyle = { readonly fill: RGB } | { readonly stroke: RGB; readonly strokeWidth: number }
type TotalRow = readonly [label: string, value: string, bold: boolean]

const TABLE_WIDTH = PAGE.width - 2 * MARGIN
const RECEIVER_HEIGHT = BOX.padY * 2 + LINE.small * 3 + GAP.tiny * 2
const DETAIL_COLUMNS = (() => {
  const num = Math.round(TABLE_WIDTH * 0.05)
  const code = Math.round(TABLE_WIDTH * 0.1)
  const quantity = Math.round(TABLE_WIDTH * 0.09)
  const unit = Math.round(TABLE_WIDTH * 0.07)
  const unitPrice = Math.round(TABLE_WIDTH * 0.13)
  const amount = Math.round(TABLE_WIDTH * 0.14)
  const description = TABLE_WIDTH - num - code - quantity - unit - unitPrice - amount
  return { num, code, description, quantity, unit, unitPrice, amount } as const
})()
// The measuring pass wraps descriptions at 37 % of the table, narrower than the column drawn, so the page is never short.
const MEASURED_DESCRIPTION_WIDTH = Math.round(TABLE_WIDTH * 0.37) - TABLE.padX * 2
const REFERENCE_COLUMNS = (() => {
  const type = Math.round(TABLE_WIDTH * 0.3)
  const folio = Math.round(TABLE_WIDTH * 0.15)
  const date = Math.round(TABLE_WIDTH * 0.2)
  return [type, folio, date, TABLE_WIDTH - type - folio - date] as const
})()

const formatAmount = (value: number): string => value.toLocaleString('es-CL')
const dottedRut = (rut: string): string => format(rut, { dots: true, throwOnError: false }) ?? rut
const printedTypeName = (type: number): string =>
  isDocumentType(type) ? documentTypeName(type, 'printed') : `DTE ${type}`
const referenceTypeName = (code: string): string => {
  if (code === '') return ''
  const type = Number(code)
  return isDocumentType(type) ? documentTypeName(type, 'printed') : `Tipo ${code}`
}

const wrapText = (text: string, font: PDFFont, size: number, maxWidth: number): readonly string[] => {
  const fits = (candidate: string): boolean => font.widthOfTextAtSize(candidate, size) <= maxWidth
  const lines: string[] = []
  let line = ''
  for (const word of text.trim().split(' ')) {
    const candidate = line ? `${line} ${word}` : word
    if (fits(candidate)) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    // The word starts a new line; one wider than the column is split by characters.
    line = ''
    for (const char of word) {
      if (fits(line + char)) line += char
      else {
        lines.push(line)
        line = char
      }
    }
  }
  lines.push(line)
  return lines
}

const drawText = (
  canvas: Canvas,
  text: string,
  x: number,
  yFromTop: number,
  font: PDFFont,
  size: number,
  colour: RGB,
): void => {
  const y = canvas.height - yFromTop - size
  if (y < -size || y > canvas.height + size) return
  canvas.page.drawText(text, { x: Math.round(x), y: Math.round(y), font, size, color: colour })
}

const drawTextCentered = (
  canvas: Canvas,
  text: string,
  x: number,
  width: number,
  yFromTop: number,
  font: PDFFont,
  size: number,
  colour: RGB,
): void => {
  const textWidth = font.widthOfTextAtSize(text, size)
  drawText(canvas, text, x + Math.max(0, (width - textWidth) / 2), yFromTop, font, size, colour)
}

const drawRect = (
  canvas: Canvas,
  x: number,
  yFromTop: number,
  width: number,
  height: number,
  style: RectStyle,
): void => {
  canvas.page.drawRectangle({
    x: Math.round(x),
    y: Math.round(canvas.height - yFromTop - height),
    width: Math.round(width),
    height: Math.round(height),
    ...('fill' in style ? { color: style.fill } : { borderColor: style.stroke, borderWidth: style.strokeWidth }),
  })
}

const drawRule = (canvas: Canvas, x1: number, x2: number, yFromTop: number, colour: RGB): void => {
  const y = Math.round(canvas.height - yFromTop)
  canvas.page.drawLine({
    start: { x: Math.round(x1), y },
    end: { x: Math.round(x2), y },
    thickness: 0.5,
    color: colour,
  })
}

// ── Measuring pass ───────────────────────────────────────────────────────────

const measureTypeBox = (doc: PrintableDocument, fonts: Fonts): number => {
  const innerWidth = TYPE_BOX.width - TYPE_BOX.padX * 2
  const typeLines = wrapText(printedTypeName(doc.type), fonts.bold, FONT.normal, innerWidth)
  const content =
    TYPE_BOX.padY + LINE.small + GAP.tiny + typeLines.length * LINE.small + GAP.tiny + LINE.small + TYPE_BOX.padY
  return Math.min(TYPE_BOX.maxHeight, Math.max(TYPE_BOX.minHeight, content))
}

const measureHeader = (doc: PrintableDocument, fonts: Fonts, logo: PDFImage | null): number => {
  const left =
    (logo ? 25 + GAP.small : 0) + LINE.normal + LINE.small + LINE.small + (doc.issuer.branch ? LINE.small : 0)
  const right = measureTypeBox(doc, fonts) + GAP.small + LINE.small
  return Math.max(left, right)
}

const measureReferences = (doc: PrintableDocument): number =>
  doc.references.length === 0
    ? 0
    : LINE.normal + GAP.small + TABLE.headerHeight + doc.references.length * TABLE.rowHeight + GAP.section

const itemRow = (item: PrintableItem, fonts: Fonts, descriptionWidth: number) => {
  const lines = wrapText(item.name, fonts.normal, FONT.tiny, descriptionWidth)
  const hasDiscount = Boolean(item.discountAmount || item.discountPercent)
  const height = Math.max(TABLE.rowHeight, lines.length * LINE.tiny + TABLE.padY * 2 + (hasDiscount ? LINE.tiny : 0))
  return { lines, hasDiscount, height }
}

const measureDetail = (doc: PrintableDocument, fonts: Fonts): number =>
  LINE.normal +
  GAP.small +
  TABLE.headerHeight +
  doc.items.reduce((sum, item) => sum + itemRow(item, fonts, MEASURED_DESCRIPTION_WIDTH).height, 0)

const totalRows = (doc: PrintableDocument): readonly TotalRow[] => {
  const { totals } = doc
  const rows: TotalRow[] = []
  if (doc.type === 34) {
    if (totals.exempt) rows.push(['Monto Exento', `$${formatAmount(totals.exempt)}`, false])
    if (totals.total) rows.push(['Monto Total', `$${formatAmount(totals.total)}`, true])
    return rows
  }
  for (const adjustment of doc.globalAdjustments) {
    const label = adjustment.kind === 'D' ? 'Descuento Global' : 'Recargo Global'
    const value = !adjustment.value
      ? ''
      : adjustment.valueType === '%'
        ? `${adjustment.value}%`
        : `$${formatAmount(adjustment.value)}`
    rows.push([label, value, false])
  }
  if (totals.net) rows.push(['Monto Neto', `$${formatAmount(totals.net)}`, false])
  if (totals.exempt) rows.push(['Monto Exento', `$${formatAmount(totals.exempt)}`, false])
  if (totals.vat) rows.push([`IVA (${totals.vatRate || 19}%)`, `$${formatAmount(totals.vat)}`, false])
  if (totals.total) rows.push(['Monto Total', `$${formatAmount(totals.total)}`, true])
  return rows
}

const measureTotals = (doc: PrintableDocument): number => totalRows(doc).length * (TABLE.rowHeight + 2) + 8

const measureAcknowledgement = (legendLines: number): number => {
  const fields = BOX.fieldHeight * 4 + GAP.small * 3
  return BOX.padY * 2 + fields + GAP.small + legendLines * LINE.legal + GAP.small
}

// ── Drawing pass ─────────────────────────────────────────────────────────────

const drawHeader = (
  canvas: Canvas,
  doc: PrintableDocument,
  logo: PDFImage | null,
  y: number,
  siiOffice: string,
): number => {
  const { fonts } = canvas
  const black = canvas.paint(COLOURS.black)
  const red = canvas.paint(COLOURS.red)
  const boxHeight = measureTypeBox(doc, fonts)
  const boxX = PAGE.width - MARGIN - TYPE_BOX.width
  const { issuer } = doc
  let ly = y
  if (logo) {
    const maxWidth = Math.min((boxX - MARGIN - GAP.section) * 0.4, 120)
    const scale = Math.min(maxWidth / logo.width, 25 / logo.height)
    const width = logo.width * scale
    const height = logo.height * scale
    canvas.page.drawImage(logo, { x: MARGIN, y: canvas.height - ly - height, width, height })
    ly += height + GAP.small
  }
  drawText(canvas, issuer.name, MARGIN, ly, fonts.bold, FONT.name, black)
  ly += LINE.normal
  drawText(canvas, issuer.activity, MARGIN, ly, fonts.normal, FONT.small, black)
  ly += LINE.small
  const address = `Casa Matriz: ${issuer.address}${issuer.commune ? `, ${issuer.commune}` : ''}`
  drawText(canvas, address, MARGIN, ly, fonts.normal, FONT.small, black)
  ly += LINE.small
  if (issuer.branch) drawText(canvas, `Sucursal: ${issuer.branch}`, MARGIN, ly, fonts.normal, FONT.small, black)

  drawRect(canvas, boxX, y, TYPE_BOX.width, boxHeight, { stroke: red, strokeWidth: TYPE_BOX.border })
  const innerWidth = TYPE_BOX.width - TYPE_BOX.padX * 2
  let ry = y + TYPE_BOX.padY
  drawTextCentered(canvas, `R.U.T.: ${dottedRut(issuer.rut)}`, boxX, TYPE_BOX.width, ry, fonts.bold, FONT.small, red)
  ry += LINE.small + GAP.tiny
  for (const line of wrapText(printedTypeName(doc.type), fonts.bold, FONT.normal, innerWidth)) {
    drawTextCentered(canvas, line, boxX, TYPE_BOX.width, ry, fonts.bold, FONT.normal, red)
    ry += LINE.small
  }
  ry += GAP.tiny
  drawTextCentered(canvas, `N° ${doc.folio}`, boxX, TYPE_BOX.width, ry, fonts.bold, FONT.small, red)
  drawTextCentered(canvas, siiOffice, boxX, TYPE_BOX.width, y + boxHeight + GAP.small, fonts.normal, FONT.tiny, black)
  return Math.max(ly, y + boxHeight + GAP.small + LINE.small)
}

const drawIssueDate = (canvas: Canvas, doc: PrintableDocument, y: number): number => {
  drawText(
    canvas,
    `Fecha Emisión: ${doc.issueDate}`,
    MARGIN,
    y,
    canvas.fonts.bold,
    FONT.normal,
    canvas.paint(COLOURS.black),
  )
  return y + LINE.normal
}

const drawReceiver = (canvas: Canvas, doc: PrintableDocument, y: number): number => {
  const { fonts } = canvas
  const { receiver } = doc
  const black = canvas.paint(COLOURS.black)
  const size = FONT.small
  const left = MARGIN + BOX.padX
  const labelled = (label: string, value: string, x: number, yy: number): void => {
    drawText(canvas, label, x, yy, fonts.bold, size, black)
    drawText(canvas, value, x + fonts.bold.widthOfTextAtSize(label, size), yy, fonts.normal, size, black)
  }
  const rightAligned = (label: string, value: string, yy: number): void =>
    labelled(
      label,
      value,
      PAGE.width - MARGIN - BOX.padX - fonts.normal.widthOfTextAtSize(`${label}${value}`, size),
      yy,
    )
  drawRect(canvas, MARGIN, y, TABLE_WIDTH, RECEIVER_HEIGHT, { stroke: canvas.paint(COLOURS.midGrey), strokeWidth: 0.5 })
  let py = y + BOX.padY
  labelled('Señor(es): ', receiver.name, left, py)
  rightAligned('RUT: ', receiver.rut, py)
  py += LINE.small + GAP.tiny
  labelled('Dirección: ', receiver.address, left, py)
  rightAligned('Comuna: ', receiver.commune, py)
  py += LINE.small + GAP.tiny
  labelled('Giro: ', receiver.activity, left, py)
  return y + RECEIVER_HEIGHT
}

const drawTransferReason = (canvas: Canvas, reason: number, y: number): number => {
  const name = TRANSFER_REASON_NAMES[reason] ?? ''
  drawText(
    canvas,
    `Tipo de Traslado: ${reason} - ${name}`,
    MARGIN,
    y,
    canvas.fonts.normal,
    FONT.small,
    canvas.paint(COLOURS.black),
  )
  return y + LINE.small
}

const drawTableHeader = (
  canvas: Canvas,
  y: number,
  labels: readonly string[],
  widths: readonly number[],
  aligns: readonly ('left' | 'center' | 'right')[],
): number => {
  const { fonts } = canvas
  const black = canvas.paint(COLOURS.black)
  const dark = canvas.paint(COLOURS.darkGrey)
  drawRect(canvas, MARGIN, y, TABLE_WIDTH, TABLE.headerHeight, { fill: canvas.paint(COLOURS.lightGrey) })
  let cx = MARGIN
  labels.forEach((label, index) => {
    const width = widths[index]
    drawRect(canvas, cx, y, width, TABLE.headerHeight, { stroke: dark, strokeWidth: 0.5 })
    const labelWidth = fonts.bold.widthOfTextAtSize(label, FONT.tiny)
    const x =
      aligns[index] === 'center'
        ? cx + (width - labelWidth) / 2
        : aligns[index] === 'right'
          ? cx + width - labelWidth - TABLE.padX
          : cx + TABLE.padX
    drawText(canvas, label, x, y + TABLE.padY, fonts.bold, FONT.tiny, black)
    cx += width
  })
  return y + TABLE.headerHeight
}

const drawReferences = (canvas: Canvas, doc: PrintableDocument, y: number): number => {
  const { fonts } = canvas
  const black = canvas.paint(COLOURS.black)
  const dark = canvas.paint(COLOURS.darkGrey)
  drawText(canvas, 'Referencias a otros documentos', MARGIN, y, fonts.bold, FONT.normal, black)
  y += LINE.normal + GAP.small
  y = drawTableHeader(canvas, y, ['Tipo Documento', 'Folio', 'Fecha', 'Razón Referencia'], REFERENCE_COLUMNS, [
    'left',
    'left',
    'left',
    'left',
  ])
  for (const reference of doc.references) {
    const values = [referenceTypeName(reference.documentType), reference.folio, reference.date, reference.reason]
    let cx = MARGIN
    values.forEach((value, index) => {
      drawRect(canvas, cx, y, REFERENCE_COLUMNS[index], TABLE.rowHeight, { stroke: dark, strokeWidth: 0.5 })
      drawText(canvas, value, cx + TABLE.padX, y + TABLE.padY, fonts.normal, FONT.tiny, black)
      cx += REFERENCE_COLUMNS[index]
    })
    y += TABLE.rowHeight
  }
  return y
}

const drawDetail = (canvas: Canvas, doc: PrintableDocument, y: number): number => {
  const { fonts } = canvas
  const black = canvas.paint(COLOURS.black)
  const dark = canvas.paint(COLOURS.darkGrey)
  const columns = [
    { key: 'num', width: DETAIL_COLUMNS.num, label: '#', align: 'center' },
    { key: 'code', width: DETAIL_COLUMNS.code, label: 'Código', align: 'left' },
    { key: 'description', width: DETAIL_COLUMNS.description, label: 'Descripción', align: 'left' },
    { key: 'quantity', width: DETAIL_COLUMNS.quantity, label: 'Cant.', align: 'right' },
    { key: 'unit', width: DETAIL_COLUMNS.unit, label: 'Unid.', align: 'center' },
    {
      key: 'unitPrice',
      width: DETAIL_COLUMNS.unitPrice,
      label: doc.grossAmounts ? 'P.Unit. c/IVA' : 'P.Unit.',
      align: 'right',
    },
    { key: 'amount', width: DETAIL_COLUMNS.amount, label: doc.grossAmounts ? 'Valor c/IVA' : 'Valor', align: 'right' },
  ] as const
  drawText(canvas, 'Detalle', MARGIN, y, fonts.bold, FONT.normal, black)
  y += LINE.normal + GAP.small
  y = drawTableHeader(
    canvas,
    y,
    columns.map((column) => column.label),
    columns.map((column) => column.width),
    columns.map((column) => column.align),
  )
  doc.items.forEach((item, index) => {
    const row = itemRow(item, fonts, DETAIL_COLUMNS.description - TABLE.padX * 2)
    const values: Readonly<Record<(typeof columns)[number]['key'], string>> = {
      num: String(index + 1),
      code: item.code,
      description: '',
      quantity: item.quantity === undefined ? '' : String(item.quantity),
      unit: item.unit ?? 'UN',
      unitPrice: item.unitPrice === undefined ? '' : `$${formatAmount(item.unitPrice)}`,
      amount: item.amount === undefined ? '' : `$${formatAmount(item.amount)}`,
    }
    let cx = MARGIN
    for (const column of columns) {
      drawRect(canvas, cx, y, column.width, row.height, { stroke: dark, strokeWidth: 0.5 })
      if (column.key === 'description') {
        let ty = y + TABLE.padY
        for (const line of row.lines) {
          drawText(canvas, line, cx + TABLE.padX, ty, fonts.normal, FONT.tiny, black)
          ty += LINE.tiny
        }
        if (row.hasDiscount) {
          const discount = item.discountAmount
            ? `Dcto: $${formatAmount(item.discountAmount)}`
            : `Dcto: ${item.discountPercent}%`
          drawText(canvas, discount, cx + TABLE.padX, ty, fonts.normal, FONT.legal, canvas.paint(COLOURS.darkGrey))
        }
      } else {
        const value = values[column.key]
        const valueWidth = fonts.normal.widthOfTextAtSize(value, FONT.tiny)
        const x =
          column.align === 'center'
            ? cx + (column.width - valueWidth) / 2
            : column.align === 'right'
              ? cx + column.width - valueWidth - TABLE.padX
              : cx + TABLE.padX
        drawText(canvas, value, x, y + (row.height - FONT.tiny) / 2, fonts.normal, FONT.tiny, black)
      }
      cx += column.width
    }
    y += row.height
  })
  return y
}

const drawTotals = (canvas: Canvas, doc: PrintableDocument, y: number): number => {
  const { fonts } = canvas
  const black = canvas.paint(COLOURS.black)
  const dark = canvas.paint(COLOURS.darkGrey)
  const boxWidth = Math.round(PAGE.width * 0.45)
  const boxX = PAGE.width - MARGIN - boxWidth
  const rowHeight = TABLE.rowHeight + 2
  const labelWidth = Math.round(boxWidth * 0.55)
  const valueWidth = boxWidth - labelWidth
  const rows = totalRows(doc)
  let ry = y + 2
  for (const [label, value, bold] of rows) {
    const font = bold ? fonts.bold : fonts.normal
    drawRect(canvas, boxX, ry, labelWidth, rowHeight, { stroke: dark, strokeWidth: 0.5 })
    drawRect(canvas, boxX + labelWidth, ry, valueWidth, rowHeight, { stroke: dark, strokeWidth: 0.5 })
    drawText(canvas, label, boxX + TABLE.padX, ry + TABLE.padY, font, FONT.normal, black)
    const width = font.widthOfTextAtSize(value, FONT.normal)
    drawText(
      canvas,
      value,
      boxX + labelWidth + valueWidth - width - TABLE.padX,
      ry + TABLE.padY,
      font,
      FONT.normal,
      black,
    )
    ry += rowHeight
  }
  return y + rows.length * rowHeight + 8
}

const drawAcknowledgement = (canvas: Canvas, legendLines: readonly string[], y: number): number => {
  const { fonts } = canvas
  const black = canvas.paint(COLOURS.black)
  const size = FONT.small
  const left = MARGIN + BOX.padX
  const half = left + (TABLE_WIDTH - BOX.padX * 2) * 0.5
  const boxHeight = measureAcknowledgement(legendLines.length)
  drawRect(canvas, MARGIN, y, TABLE_WIDTH, boxHeight, { stroke: black, strokeWidth: 0.5 })
  let py = y + BOX.padY
  drawText(canvas, 'Acuse de Recibo', left, py, fonts.bold, size, black)
  py += BOX.fieldHeight
  drawText(canvas, 'Nombre: ____________________________', left, py, fonts.normal, size, black)
  drawText(canvas, 'R.U.T.: ___________________', half, py, fonts.normal, size, black)
  py += BOX.fieldHeight
  drawText(canvas, 'Fecha: ___________________', left, py, fonts.normal, size, black)
  drawText(canvas, 'Recinto: __________________', half, py, fonts.normal, size, black)
  py += BOX.fieldHeight
  drawText(canvas, 'Firma: ____________________________', left, py, fonts.normal, size, black)
  py += BOX.fieldHeight + GAP.small
  drawRule(canvas, left, MARGIN + TABLE_WIDTH - BOX.padX, py, canvas.paint(COLOURS.midGrey))
  py += GAP.tiny + 2
  for (const line of legendLines) {
    drawText(canvas, line, left, py, fonts.normal, FONT.legal, black)
    py += LINE.legal
  }
  return y + boxHeight
}

const drawStamp = (canvas: Canvas, image: PDFImage, y: number, resolution: string): number => {
  const black = canvas.paint(COLOURS.black)
  const natural = image.scale(1)
  const targetWidth = Math.max(STAMP.minWidth, Math.min(STAMP.maxWidth, natural.width))
  const scale = targetWidth / natural.width
  const width = Math.round(targetWidth)
  const height = Math.max(STAMP.minHeight, Math.min(STAMP.maxHeight, Math.round(natural.height * scale)))
  const x = MARGIN + STAMP.marginLeft
  let yy = y + GAP.section
  canvas.page.drawImage(image, { x, y: canvas.height - yy - height, width, height })
  yy += height + STAMP.legendGap
  drawText(canvas, 'Timbre Electrónico SII', x, yy, canvas.fonts.bold, FONT.legend, black)
  yy += LINE.legal
  drawText(canvas, resolution, x, yy, canvas.fonts.normal, FONT.legend, black)
  yy += LINE.legal
  drawText(canvas, 'Verifique documento: www.sii.cl', x, yy, canvas.fonts.normal, FONT.legend, black)
  return yy + LINE.legal
}

const drawTransferableMark = (canvas: Canvas, doc: PrintableDocument): void => {
  const text = doc.type === 52 ? 'CEDIBLE CON SU FACTURA' : 'CEDIBLE'
  const width = canvas.fonts.bold.widthOfTextAtSize(text, FONT.name)
  drawText(
    canvas,
    text,
    PAGE.width - MARGIN - width,
    canvas.height - MARGIN - FONT.name - LINE.normal,
    canvas.fonts.bold,
    FONT.name,
    canvas.paint(COLOURS.black),
  )
}

const embedLogo = async (document: PDFDocument, logo: PrintedLogo | undefined): Promise<PDFImage | null> => {
  if (!logo) return null
  try {
    return logo.format === 'jpeg' ? await document.embedJpg(logo.bytes) : await document.embedPng(logo.bytes)
  } catch {
    return null
  }
}

const draw = async (
  modules: PdfModules,
  doc: PrintableDocument,
  options: RenderPrintedSampleOptions,
): Promise<Uint8Array> => {
  const { pdf } = modules
  const document = await pdf.PDFDocument.create()
  const fonts: Fonts = {
    normal: await document.embedFont(pdf.StandardFonts.Helvetica),
    bold: await document.embedFont(pdf.StandardFonts.HelveticaBold),
  }
  const logo = await embedLogo(document, options.logo)
  const stamp =
    doc.tedXml === '' ? null : await document.embedPng(await renderTedBarcodeWith(modules.barcode, doc.tedXml))
  const transferable = options.transferable === true && needsTransferableCopy(doc)
  const legendWidth = TABLE_WIDTH - BOX.padX * 2
  const legendLines = transferable ? wrapText(ACKNOWLEDGEMENT_TEXT, fonts.normal, FONT.legal, legendWidth) : []
  const transferReason = doc.type === 52 ? doc.transferReason : null

  const total =
    MARGIN +
    measureHeader(doc, fonts, logo) +
    GAP.section +
    LINE.normal +
    GAP.small +
    RECEIVER_HEIGHT +
    GAP.section +
    (transferReason === null ? 0 : LINE.small + GAP.small) +
    measureReferences(doc) +
    measureDetail(doc, fonts) +
    GAP.section +
    measureTotals(doc) +
    GAP.section +
    (transferable ? measureAcknowledgement(legendLines.length) + GAP.section : 0) +
    (stamp ? GAP.section + STAMP.maxHeight + STAMP.legendGap + LINE.legal * 3 + MARGIN : MARGIN)
  const height = Math.min(PAGE.maxHeight, Math.max(PAGE.minHeight, Math.ceil(total)))

  const page = document.addPage([PAGE.width, height])
  const canvas: Canvas = { page, fonts, height, paint: ([r, g, b]) => pdf.rgb(r, g, b) }
  let y = MARGIN
  y = drawHeader(canvas, doc, logo, y, options.siiOffice ?? DEFAULT_SII_OFFICE) + GAP.section
  y = drawIssueDate(canvas, doc, y) + GAP.small
  y = drawReceiver(canvas, doc, y) + GAP.section
  if (transferReason !== null) y = drawTransferReason(canvas, transferReason, y) + GAP.small
  if (doc.references.length > 0) y = drawReferences(canvas, doc, y) + GAP.section
  y = drawDetail(canvas, doc, y) + GAP.section
  y = drawTotals(canvas, doc, y) + GAP.section
  if (transferable) y = drawAcknowledgement(canvas, legendLines, y) + GAP.section
  if (stamp) {
    const resolution = options.resolution ?? defaultResolution((options.now ?? (() => new Date()))().getFullYear())
    drawStamp(canvas, stamp, y, resolution)
  }
  if (transferable) drawTransferableMark(canvas, doc)
  return document.save()
}

/**
 * EN: The printed sample of one document as a single-page PDF per the SII printed-samples manual: issuer and the red
 * type box, issue date, receiver, transfer reason (guides), references, detail, totals, the acknowledgement box and
 * the `CEDIBLE` mark on a transferable copy, and the PDF417 stamp with its legends. The page is 21.5 cm wide and as
 * tall as its content between 11 and 33 cm; what falls past 33 cm is not drawn. Node only (D45).
 * ES: La muestra impresa de un documento como PDF de una página según el manual de muestras impresas del SII: emisor y
 * recuadro rojo del tipo, fecha de emisión, receptor, tipo de traslado (guías), referencias, detalle, totales, el acuse
 * de recibo y la marca `CEDIBLE` en una copia cedible, y el timbre PDF417 con sus leyendas. La página mide 21,5 cm de
 * ancho y tan alto como su contenido entre 11 y 33 cm; lo que cae más allá de 33 cm no se dibuja. Solo Node (D45).
 * @param doc EN: a document of `parsePrintableDocuments`. ES: un documento de `parsePrintableDocuments`.
 * @param options EN: office, resolution, logo, clock and `transferable`. ES: oficina, resolución, logo, reloj y `transferable`.
 * @param load EN: loader of the two libraries, for tests. ES: cargador de las dos librerías, para tests.
 * @returns EN: the PDF bytes. ES: los bytes del PDF.
 * @throws {DteError} EN: `MISSING_FIELD` (field `TipoDTE`) when the type is 0, `ENCODING_UNSUPPORTED_CHAR` for a TED with a code point above U+00FF, `DEPENDENCY_UNAVAILABLE` when a library cannot be loaded, `PDF_RENDER_FAILED` (with `type` and `folio`) when a library throws while drawing, for example on a character outside WinAnsi. ES: `MISSING_FIELD` (campo `TipoDTE`) cuando el tipo es 0, `ENCODING_UNSUPPORTED_CHAR` ante un TED con un code point mayor a U+00FF, `DEPENDENCY_UNAVAILABLE` si una librería no se puede cargar, `PDF_RENDER_FAILED` (con `type` y `folio`) si una librería lanza al dibujar, por ejemplo ante un carácter fuera de WinAnsi.
 */
export const renderPrintedSample = async (
  doc: PrintableDocument,
  options: RenderPrintedSampleOptions = {},
  load: () => Promise<PdfModules> = loadPdfModules,
): Promise<Uint8Array> => {
  if (!doc.type) throw new DteError('MISSING_FIELD', { field: 'TipoDTE' })
  const modules = await load()
  try {
    return await draw(modules, doc, options)
  } catch (error) {
    if (isDteError(error)) throw error
    throw new DteError('PDF_RENDER_FAILED', { reason: errorMessage(error), type: doc.type, folio: doc.folio })
  }
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/pdf/render --coverage=false
```

Expected: PASS, 46 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/pdf/render.ts tests/support/pdf.ts tests/pdf/render.test.ts
```

```bash
git commit -F - <<'MSG'
feat: the printed sample PDF

renderPrintedSample draws one page per the SII printed-samples manual in two passes, measure and
draw, with the transferable copy and the stamp. The tests read the page back, inflate its content
and decode the embedded stamp.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 5: In-memory batch of printed samples

`renderPrintedSamples` (spec 3.5): every document of every envelope, the set decided by the envelope name, the transferable copies where they apply, failures as data.

**Files:**

- Create: `src/pdf/samples.ts`
- Test (create): `tests/pdf/samples.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/pdf/samples.test.ts` (new file, whole):

```ts
import { renderPrintedSamples, sampleName, sampleSetOf } from '../../src/pdf/samples'
import { FIXED_NOW } from '../support/fixtures'
import { pdfText } from '../support/pdf'
import { basicSetXml, receiptsXml, thirdPartyXml, withoutTed } from '../support/printed-fixtures'

const options = { now: () => FIXED_NOW }

test('the set of an envelope comes from its name', () => {
  expect(sampleSetOf('envio-set-basico.xml')).toBe('tests')
  expect(sampleSetOf('ENVIO-SET-GUIA.XML')).toBe('tests')
  expect(sampleSetOf('envio-set-exenta.xml')).toBe('tests')
  expect(sampleSetOf('envio-set-compra.xml')).toBe('tests')
  expect(sampleSetOf('envio-set-boleta.xml')).toBe('simulation')
  expect(sampleSetOf('envio-simulacion.xml')).toBe('simulation')
  expect(sampleSetOf('artefact:basic')).toBe('simulation')
})

test('a sample is named by type and folio, with _cedible on the transferable copy', () => {
  const doc = { type: 33, folio: '7' } as Parameters<typeof sampleName>[0]
  expect(sampleName(doc, false)).toBe('muestra_33_7.pdf')
  expect(sampleName(doc, true)).toBe('muestra_33_7_cedible.pdf')
})

test('renders every document of every envelope, with the transferable copies that apply', async () => {
  const result = await renderPrintedSamples({
    envelopes: [
      { name: 'envio-set-basico.xml', xml: basicSetXml },
      { name: 'envio-simulacion.xml', xml: receiptsXml },
    ],
    options,
    transferable: true,
  })
  expect(result.success).toBe(true)
  expect(result.failures).toEqual([])
  expect(result).toMatchObject({ documents: 4, tests: 4, simulation: 1 })
  expect(
    result.samples.map((sample) => [
      sample.name,
      sample.set,
      sample.source,
      sample.type,
      sample.folio,
      sample.transferable,
    ]),
  ).toEqual([
    ['muestra_33_7.pdf', 'tests', 'envio-set-basico.xml', 33, '7', false],
    ['muestra_33_7_cedible.pdf', 'tests', 'envio-set-basico.xml', 33, '7', true],
    ['muestra_61_5.pdf', 'tests', 'envio-set-basico.xml', 61, '5', false],
    ['muestra_56_8.pdf', 'tests', 'envio-set-basico.xml', 56, '8', false],
    ['muestra_39_11.pdf', 'simulation', 'envio-simulacion.xml', 39, '11', false],
  ])
  expect(await pdfText(result.samples[1].bytes)).toContain('CEDIBLE')
  expect(await pdfText(result.samples[0].bytes)).not.toContain('CEDIBLE')
})

test('without transferable only the plain copies come out', async () => {
  const result = await renderPrintedSamples({
    envelopes: [{ name: 'envio-set-basico.xml', xml: basicSetXml }],
    options,
  })
  expect(result.samples.map((sample) => sample.name)).toEqual([
    'muestra_33_7.pdf',
    'muestra_61_5.pdf',
    'muestra_56_8.pdf',
  ])
})

test('an envelope that cannot be parsed and a document that cannot be rendered are failures, and the rest goes on', async () => {
  const typeless = withoutTed(thirdPartyXml).replace(/<IdDoc>[\s\S]*?<\/IdDoc>/, '<IdDoc><Folio>1</Folio></IdDoc>')
  const result = await renderPrintedSamples({
    envelopes: [
      { name: 'broken.xml', xml: '<EnvioDTE><SetDTE>' },
      { name: 'typeless.xml', xml: typeless },
      { name: 'envio-set-exenta.xml', xml: thirdPartyXml },
    ],
    options,
    transferable: true,
  })
  expect(result.success).toBe(false)
  expect(result.failures).toEqual([
    { source: 'broken.xml', code: 'XML_PARSE_FAILED', reason: expect.stringContaining('XML could not be parsed') },
    {
      source: 'typeless.xml',
      type: 0,
      folio: '1',
      transferable: false,
      code: 'MISSING_FIELD',
      reason: 'Required field is missing (field=TipoDTE)',
    },
  ])
  expect(result).toMatchObject({ documents: 2, tests: 2, simulation: 0 })
  expect(result.samples.map((sample) => sample.name)).toEqual(['muestra_33_100.pdf', 'muestra_33_100_cedible.pdf'])
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/pdf/samples --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/pdf/samples'`.

- [ ] **Step 3: Write the implementation**

`src/pdf/samples.ts` (new file, whole):

```ts
import { errorCode, errorMessage, type DteErrorCode } from '../errors'
import { parsePrintableDocuments, type PrintableDocument } from './parse'
import { needsTransferableCopy, renderPrintedSample, type PrintedSampleOptions } from './render'

/**
 * EN: An envelope to print: a name (the file name, the artefact key) and its XML.
 * ES: Un envío a imprimir: un nombre (el del archivo, la clave del artefacto) y su XML.
 */
export type PrintedEnvelope = {
  /** EN: Name; it decides the set (3.5 of the phase 5a spec). ES: Nombre; decide el conjunto. */
  readonly name: string
  /** EN: The envelope XML. ES: El XML del envío. */
  readonly xml: string
}

/**
 * EN: The two sets of printed samples the certification asks for.
 * ES: Los dos conjuntos de muestras impresas que pide la certificación.
 */
export type PrintedSampleSet = 'tests' | 'simulation'

/**
 * EN: Input of `renderPrintedSamples`.
 * ES: Entrada de `renderPrintedSamples`.
 */
export type PrintedSamplesInput = {
  readonly envelopes: readonly PrintedEnvelope[]
  readonly options?: PrintedSampleOptions
  /** EN: Also produce the transferable copy of every document that admits one; default false. ES: Producir además la copia cedible de cada documento que la admite; por defecto false. */
  readonly transferable?: boolean
}

/**
 * EN: One rendered sample.
 * ES: Una muestra generada.
 */
export type PrintedSample = {
  /** EN: `muestra_{type}_{folio}.pdf`, with `_cedible` before the extension on a transferable copy. ES: `muestra_{tipo}_{folio}.pdf`, con `_cedible` antes de la extensión en una copia cedible. */
  readonly name: string
  readonly set: PrintedSampleSet
  /** EN: The envelope name. ES: El nombre del envío. */
  readonly source: string
  readonly type: number
  readonly folio: string
  /** EN: True on the transferable copy. ES: True en la copia cedible. */
  readonly transferable: boolean
  readonly bytes: Uint8Array
}

/**
 * EN: One envelope or document that could not be rendered.
 * ES: Un envío o documento que no se pudo generar.
 */
export type PrintedSampleFailure = {
  readonly source: string
  /** EN: Absent when the envelope itself failed to parse. ES: Ausente cuando el envío mismo no se pudo parsear. */
  readonly type?: number
  readonly folio?: string
  readonly transferable?: boolean
  /** EN: The `DteError` code, when it was one. ES: El código del `DteError`, cuando lo fue. */
  readonly code?: DteErrorCode
  /** EN: The error message. ES: El mensaje del error. */
  readonly reason: string
}

/**
 * EN: Result of `renderPrintedSamples`.
 * ES: Resultado de `renderPrintedSamples`.
 */
export type PrintedSamplesResult = {
  /** EN: True when nothing failed. ES: True cuando nada falló. */
  readonly success: boolean
  readonly samples: readonly PrintedSample[]
  readonly failures: readonly PrintedSampleFailure[]
  /** EN: Documents parsed. ES: Documentos parseados. */
  readonly documents: number
  /** EN: Samples in the test set. ES: Muestras del conjunto de pruebas. */
  readonly tests: number
  /** EN: Samples in the simulation set. ES: Muestras del conjunto de simulación. */
  readonly simulation: number
}

const TEST_SET_PATTERN = /envio-set-(basico|guia|exenta|compra)\.xml/

/**
 * EN: The set an envelope belongs to by its name: the basic, guide, exempt and purchase set envelopes go to the test
 * set, everything else to the simulation set.
 * ES: El conjunto al que pertenece un envío por su nombre: los envíos de los sets básico, guía, exento y compra van al
 * conjunto de pruebas, todo lo demás al de simulación.
 */
export const sampleSetOf = (name: string): PrintedSampleSet =>
  TEST_SET_PATTERN.test(name.toLowerCase()) ? 'tests' : 'simulation'

/**
 * EN: File name of a sample.
 * ES: Nombre de archivo de una muestra.
 */
export const sampleName = (doc: PrintableDocument, transferable: boolean): string =>
  `muestra_${doc.type}_${doc.folio}${transferable ? '_cedible' : ''}.pdf`

const failure = (
  source: string,
  error: unknown,
  doc?: PrintableDocument,
  transferable?: boolean,
): PrintedSampleFailure => ({
  source,
  ...(doc ? { type: doc.type, folio: doc.folio, transferable } : {}),
  code: errorCode(error),
  reason: errorMessage(error),
})

/**
 * EN: Renders every document of every envelope, in memory: one sample per document and, with `transferable`, a second
 * one for each document that admits a transferable copy. A parse failure skips the envelope and a render failure skips
 * the document; both are reported as data and the batch goes on. Nothing is logged.
 * ES: Genera cada documento de cada envío, en memoria: una muestra por documento y, con `transferable`, una segunda
 * por cada documento que admite copia cedible. Una falla de parseo salta el envío y una de dibujo salta el documento;
 * ambas se reportan como datos y el lote sigue. No se escribe nada en consola.
 * @param input EN: envelopes, options and `transferable`. ES: envíos, opciones y `transferable`.
 */
export const renderPrintedSamples = async (input: PrintedSamplesInput): Promise<PrintedSamplesResult> => {
  const samples: PrintedSample[] = []
  const failures: PrintedSampleFailure[] = []
  let documents = 0
  for (const envelope of input.envelopes) {
    let parsed: readonly PrintableDocument[]
    try {
      parsed = parsePrintableDocuments(envelope.xml)
    } catch (error) {
      failures.push(failure(envelope.name, error))
      continue
    }
    const set = sampleSetOf(envelope.name)
    for (const doc of parsed) {
      documents += 1
      const copies = input.transferable && needsTransferableCopy(doc) ? [false, true] : [false]
      for (const transferable of copies) {
        try {
          const bytes = await renderPrintedSample(doc, { ...input.options, transferable })
          samples.push({
            name: sampleName(doc, transferable),
            set,
            source: envelope.name,
            type: doc.type,
            folio: doc.folio,
            transferable,
            bytes,
          })
        } catch (error) {
          failures.push(failure(envelope.name, error, doc, transferable))
        }
      }
    }
  }
  return {
    success: failures.length === 0,
    samples,
    failures,
    documents,
    tests: samples.filter((sample) => sample.set === 'tests').length,
    simulation: samples.filter((sample) => sample.set === 'simulation').length,
  }
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/pdf/samples --coverage=false
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/pdf/samples.ts tests/pdf/samples.test.ts
```

```bash
git commit -F - <<'MSG'
feat: in-memory batch of printed samples

renderPrintedSamples renders every document of every envelope, classifies the samples into the
test and simulation sets by the envelope name and reports failures as data.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 6: Printed samples over files

`writePrintedSamples` and `findEnvelopeFiles` (spec 3.6): the batch on disk under `SET-PRUEBAS` and `SET-SIMULACION`, the directory scan, the logo from a path, `node:fs` loaded on first use as in `createDirectoryFolioRegistry`.

**Files:**

- Create: `src/pdf/node-samples.ts`
- Test (create): `tests/pdf/node-samples.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/pdf/node-samples.test.ts` (new file, whole):

```ts
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { findEnvelopeFiles, writePrintedSamples } from '../../src/pdf/node-samples'
import { loadNodeFs, type NodeFsModules } from '../../src/sii/node-fs'
import { FIXED_NOW } from '../support/fixtures'
import { pdfImages } from '../support/pdf'
import { failure } from '../support/portal'
import { basicSetXml, receiptsXml } from '../support/printed-fixtures'
import { createTempDirs } from '../support/temp-dir'

const dirs = createTempDirs()
afterAll(() => dirs.cleanup())

const options = { now: () => FIXED_NOW }

const envelopesDir = async (): Promise<string> => {
  const dir = await dirs.make('dte-sdk-samples-')
  await mkdir(join(dir, 'nested'), { recursive: true })
  await writeFile(join(dir, 'envio-set-basico.xml'), basicSetXml)
  await writeFile(join(dir, 'nested', 'EnvioBOLETA.xml'), receiptsXml)
  await writeFile(join(dir, 'respuesta-1.xml'), '<RespuestaDTE/>')
  await writeFile(join(dir, 'envio-recibos.xml'), '<EnvioRecibos/>')
  await writeFile(join(dir, 'notes.txt'), 'envio-set-basico')
  return dir
}

const failingLoad = async (): Promise<NodeFsModules> => {
  throw new Error('no fs')
}

const withFs = (patch: Partial<NodeFsModules['fs']>) => async (): Promise<NodeFsModules> => {
  const modules = await loadNodeFs()
  return { ...modules, fs: { ...modules.fs, ...patch } as NodeFsModules['fs'] }
}

describe('findEnvelopeFiles', () => {
  test('a directory yields the envelope files under it, recursively, and nothing else', async () => {
    const dir = await envelopesDir()
    const files = await findEnvelopeFiles(dir)
    expect(files.map((file) => file.slice(dir.length + 1)).sort()).toEqual([
      'envio-set-basico.xml',
      join('nested', 'EnvioBOLETA.xml'),
    ])
  })

  test('a file yields itself, a missing path nothing, and anything else nothing', async () => {
    const dir = await envelopesDir()
    expect(await findEnvelopeFiles(join(dir, 'notes.txt'))).toEqual([join(dir, 'notes.txt')])
    expect(await findEnvelopeFiles(join(dir, 'missing'))).toEqual([])
    const neither = withFs({
      stat: (async () => ({ isFile: () => false, isDirectory: () => false })) as unknown as NodeFsModules['fs']['stat'],
    })
    expect(await findEnvelopeFiles(dir, neither)).toEqual([])
  })

  test('an error other than a missing path propagates', async () => {
    const denied = withFs({
      stat: async () => {
        throw Object.assign(new Error('denied'), { code: 'EACCES' })
      },
    })
    await expect(findEnvelopeFiles('x', denied)).rejects.toThrow('denied')
  })

  test('without node:fs it says so', async () => {
    expect((await failure(findEnvelopeFiles('x', failingLoad))).code).toBe('TRANSPORT_UNAVAILABLE')
  })
})

describe('writePrintedSamples', () => {
  test('writes every sample into the folder of its set', async () => {
    const dir = await envelopesDir()
    const outDir = join(dir, 'out')
    const xmlFiles = await findEnvelopeFiles(dir)
    const result = await writePrintedSamples({ xmlFiles, outDir, options, transferable: true })
    expect(result.success).toBe(true)
    expect(result).toMatchObject({ documents: 4, tests: 4, simulation: 1, failures: [] })
    expect(result.samples.map((sample) => sample.path.slice(outDir.length + 1)).sort()).toEqual([
      join('SET-PRUEBAS', 'muestra_33_7.pdf'),
      join('SET-PRUEBAS', 'muestra_33_7_cedible.pdf'),
      join('SET-PRUEBAS', 'muestra_56_8.pdf'),
      join('SET-PRUEBAS', 'muestra_61_5.pdf'),
      join('SET-SIMULACION', 'muestra_39_11.pdf'),
    ])
    for (const sample of result.samples) {
      expect((await stat(sample.path)).size).toBe(sample.size)
      expect(sample.size).toBeGreaterThan(1000)
      expect((await readFile(sample.path)).subarray(0, 5).toString()).toBe('%PDF-')
    }
  })

  test('reads the logo from a path; a missing file or another extension means no logo', async () => {
    const dir = await envelopesDir()
    const png = new PNG({ width: 4, height: 4 })
    png.data.fill(120)
    await writeFile(join(dir, 'logo.PNG'), PNG.sync.write(png))
    await writeFile(join(dir, 'logo.gif'), 'GIF89a')
    const files = [join(dir, 'nested', 'EnvioBOLETA.xml')]
    const withLogo = await writePrintedSamples({
      xmlFiles: files,
      outDir: join(dir, 'a'),
      options,
      logoPath: join(dir, 'logo.PNG'),
    })
    expect(await pdfImages(await readFile(withLogo.samples[0].path))).toHaveLength(2)
    const otherExtension = await writePrintedSamples({
      xmlFiles: files,
      outDir: join(dir, 'b'),
      options,
      logoPath: join(dir, 'logo.gif'),
    })
    expect(await pdfImages(await readFile(otherExtension.samples[0].path))).toHaveLength(1)
    const missing = await writePrintedSamples({
      xmlFiles: files,
      outDir: join(dir, 'c'),
      options,
      logoPath: join(dir, 'none.jpg'),
    })
    expect(await pdfImages(await readFile(missing.samples[0].path))).toHaveLength(1)
  })

  test('a logo that cannot be read for another reason propagates', async () => {
    const dir = await envelopesDir()
    const denied = withFs({
      readFile: (async () => {
        throw Object.assign(new Error('denied'), { code: 'EACCES' })
      }) as NodeFsModules['fs']['readFile'],
    })
    await expect(
      writePrintedSamples({ xmlFiles: [], outDir: join(dir, 'd'), logoPath: 'logo.jpeg' }, denied),
    ).rejects.toThrow('denied')
  })

  test('a file that cannot be read, an envelope that cannot be parsed and a PDF that cannot be written are failures', async () => {
    const dir = await envelopesDir()
    await writeFile(join(dir, 'broken.xml'), '<EnvioDTE><SetDTE>')
    const cannotWrite = withFs({
      writeFile: (async () => {
        throw new Error('disk full')
      }) as NodeFsModules['fs']['writeFile'],
    })
    const result = await writePrintedSamples(
      {
        xmlFiles: [join(dir, 'missing.xml'), join(dir, 'broken.xml'), join(dir, 'nested', 'EnvioBOLETA.xml')],
        outDir: join(dir, 'e'),
        options,
      },
      cannotWrite,
    )
    expect(result.success).toBe(false)
    expect(result.samples).toEqual([])
    expect(result.failures).toEqual([
      { source: 'missing.xml', reason: expect.stringContaining('ENOENT') },
      { source: 'broken.xml', code: 'XML_PARSE_FAILED', reason: expect.stringContaining('XML could not be parsed') },
      { source: 'EnvioBOLETA.xml', type: 39, folio: '11', transferable: false, reason: 'disk full' },
    ])
    expect(result).toMatchObject({ documents: 1, tests: 0, simulation: 0 })
  })

  test('without node:fs it says so', async () => {
    expect((await failure(writePrintedSamples({ xmlFiles: [], outDir: 'x' }, failingLoad))).code).toBe(
      'TRANSPORT_UNAVAILABLE',
    )
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/pdf/node-samples --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/pdf/node-samples'`.

- [ ] **Step 3: Write the implementation**

`src/pdf/node-samples.ts` (new file, whole):

```ts
import { DteError, errorCode, errorMessage } from '../errors'
import { loadNodeFs, type NodeFsModules } from '../sii/node-fs'
import type { PrintedLogo, PrintedSampleOptions } from './render'
import {
  renderPrintedSamples,
  type PrintedSample,
  type PrintedSampleFailure,
  type PrintedSamplesResult,
} from './samples'

/**
 * EN: Input of `writePrintedSamples`.
 * ES: Entrada de `writePrintedSamples`.
 */
export type WritePrintedSamplesInput = {
  /** EN: Envelope XML files. ES: Archivos XML de envíos. */
  readonly xmlFiles: readonly string[]
  /** EN: Output directory; `SET-PRUEBAS` and `SET-SIMULACION` are created inside it. ES: Directorio de salida; dentro se crean `SET-PRUEBAS` y `SET-SIMULACION`. */
  readonly outDir: string
  readonly options?: PrintedSampleOptions
  /** EN: Logo file, read once; replaces `options.logo`. A missing file or an extension other than png, jpg or jpeg means no logo. ES: Archivo del logo, leído una vez; reemplaza `options.logo`. Un archivo que falta o una extensión distinta de png, jpg o jpeg significa sin logo. */
  readonly logoPath?: string
  /** EN: Also write the transferable copies; default false. ES: Escribir también las copias cedibles; por defecto false. */
  readonly transferable?: boolean
}

/**
 * EN: A sample written to disk.
 * ES: Una muestra escrita en disco.
 */
export type WrittenPrintedSample = Omit<PrintedSample, 'bytes'> & {
  /** EN: Path of the PDF. ES: Ruta del PDF. */
  readonly path: string
  /** EN: Size in bytes. ES: Tamaño en bytes. */
  readonly size: number
}

/**
 * EN: Result of `writePrintedSamples`.
 * ES: Resultado de `writePrintedSamples`.
 */
export type WritePrintedSamplesResult = Omit<PrintedSamplesResult, 'samples'> & {
  readonly samples: readonly WrittenPrintedSample[]
}

const SET_DIRECTORIES = { tests: 'SET-PRUEBAS', simulation: 'SET-SIMULACION' } as const
const LOGO_FORMATS: Readonly<Record<string, PrintedLogo['format']>> = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg' }

const isMissingFile = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === 'ENOENT'

const modulesOrThrow = async (load: () => Promise<NodeFsModules>): Promise<NodeFsModules> => {
  try {
    return await load()
  } catch (error) {
    throw new DteError('TRANSPORT_UNAVAILABLE', { reason: errorMessage(error) })
  }
}

const readLogo = async (
  { fs, path }: NodeFsModules,
  logoPath: string | undefined,
): Promise<PrintedLogo | undefined> => {
  if (logoPath === undefined) return undefined
  const format = LOGO_FORMATS[path.extname(logoPath).toLowerCase()]
  if (format === undefined) return undefined
  try {
    return { bytes: new Uint8Array(await fs.readFile(path.resolve(logoPath))), format }
  } catch (error) {
    if (isMissingFile(error)) return undefined
    throw error
  }
}

const isEnvelopeFileName = (name: string): boolean => {
  const lower = name.toLowerCase()
  return (
    lower.endsWith('.xml') &&
    (lower.includes('envio-set-') || lower.includes('envio-simulacion') || lower.includes('envioboleta'))
  )
}

/**
 * EN: The envelope files under a path: the file itself, or every `.xml` under a directory (recursively) whose name
 * contains `envio-set-`, `envio-simulacion` or `envioboleta`, so the responses and receipt envelopes of the exchange,
 * which carry no DTE, are skipped. A path that does not exist yields an empty list.
 * ES: Los archivos de envío bajo una ruta: el archivo mismo, o todo `.xml` bajo un directorio (recursivo) cuyo nombre
 * contenga `envio-set-`, `envio-simulacion` o `envioboleta`, así se saltan las respuestas y los envíos de recibos del
 * intercambio, que no traen DTE. Una ruta que no existe devuelve lista vacía.
 * @param inputPath EN: a file or a directory. ES: un archivo o un directorio.
 * @param load EN: loader of `node:fs`, for tests. ES: cargador de `node:fs`, para tests.
 * @throws {DteError} EN: `TRANSPORT_UNAVAILABLE` when `node:fs` cannot be loaded. ES: `TRANSPORT_UNAVAILABLE` si `node:fs` no se puede cargar.
 */
export const findEnvelopeFiles = async (
  inputPath: string,
  load: () => Promise<NodeFsModules> = loadNodeFs,
): Promise<readonly string[]> => {
  const { fs, path } = await modulesOrThrow(load)
  const resolved = path.resolve(inputPath)
  let stats: Awaited<ReturnType<typeof fs.stat>>
  try {
    stats = await fs.stat(resolved)
  } catch (error) {
    if (isMissingFile(error)) return []
    throw error
  }
  if (stats.isFile()) return [resolved]
  if (!stats.isDirectory()) return []
  const files: string[] = []
  const scan = async (directory: string): Promise<void> => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) await scan(full)
      else if (isEnvelopeFileName(entry.name)) files.push(full)
    }
  }
  await scan(resolved)
  return files
}

/**
 * EN: Renders the samples of every file into `{outDir}/SET-PRUEBAS` and `{outDir}/SET-SIMULACION`, one PDF per sample
 * under its sample name. A file that cannot be read, parsed or rendered is a failure entry and the rest goes on.
 * ES: Genera las muestras de cada archivo en `{outDir}/SET-PRUEBAS` y `{outDir}/SET-SIMULACION`, un PDF por muestra
 * con su nombre de muestra. Un archivo que no se puede leer, parsear o dibujar es una entrada de falla y el resto sigue.
 * @param input EN: files, output directory, options, logo path and `transferable`. ES: archivos, directorio de salida, opciones, ruta del logo y `transferable`.
 * @param load EN: loader of `node:fs`, for tests. ES: cargador de `node:fs`, para tests.
 * @throws {DteError} EN: `TRANSPORT_UNAVAILABLE` when `node:fs` cannot be loaded. ES: `TRANSPORT_UNAVAILABLE` si `node:fs` no se puede cargar.
 */
export const writePrintedSamples = async (
  input: WritePrintedSamplesInput,
  load: () => Promise<NodeFsModules> = loadNodeFs,
): Promise<WritePrintedSamplesResult> => {
  const modules = await modulesOrThrow(load)
  const { fs, path } = modules
  const directories = {
    tests: path.join(input.outDir, SET_DIRECTORIES.tests),
    simulation: path.join(input.outDir, SET_DIRECTORIES.simulation),
  }
  await fs.mkdir(directories.tests, { recursive: true })
  await fs.mkdir(directories.simulation, { recursive: true })
  const logo = await readLogo(modules, input.logoPath)
  const options = logo ? { ...input.options, logo } : input.options
  const samples: WrittenPrintedSample[] = []
  const failures: PrintedSampleFailure[] = []
  let documents = 0
  for (const file of input.xmlFiles) {
    const source = path.basename(file)
    let xml: string
    try {
      xml = await fs.readFile(file, 'utf8')
    } catch (error) {
      failures.push({ source, code: errorCode(error), reason: errorMessage(error) })
      continue
    }
    const result = await renderPrintedSamples({
      envelopes: [{ name: source, xml }],
      options,
      transferable: input.transferable,
    })
    documents += result.documents
    failures.push(...result.failures)
    for (const { bytes, ...sample } of result.samples) {
      const target = path.join(directories[sample.set], sample.name)
      try {
        await fs.writeFile(target, bytes)
        samples.push({ ...sample, path: target, size: bytes.length })
      } catch (error) {
        failures.push({
          source,
          type: sample.type,
          folio: sample.folio,
          transferable: sample.transferable,
          code: errorCode(error),
          reason: errorMessage(error),
        })
      }
    }
  }
  return {
    success: failures.length === 0,
    samples,
    failures,
    documents,
    tests: samples.filter((sample) => sample.set === 'tests').length,
    simulation: samples.filter((sample) => sample.set === 'simulation').length,
  }
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/pdf/node-samples --coverage=false
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/pdf/node-samples.ts tests/pdf/node-samples.test.ts
```

```bash
git commit -F - <<'MSG'
feat: printed samples over files

writePrintedSamples and findEnvelopeFiles put the batch on disk under SET-PRUEBAS and
SET-SIMULACION with node:fs loaded on first use, and read the logo from a path.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 7: Public API, documentation and the dist smoke

The seven functions, `errorCode` and the types on the root entry and in `RUNTIME_EXPORTS` (spec 3.8), the type tests, a dist smoke that renders a sample through both bundles (so the lazy `import()` of the libraries is proven inside the minified code), the README section, `llms.txt`, the changelog and the note in the architecture spec (spec 3.11).

**Files:**

- Modify: `src/index.ts`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `llms.txt`
- Modify: `docs/superpowers/specs/2026-10-31-dte-sdk-architecture-and-phase-1-design.md`
- Test (modify): `tests/public-api.test.ts`
- Test (modify): `tests/types.test.ts`
- Test (modify): `tests/dist.smoke.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/public-api.test.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/public-api.test.ts b/tests/public-api.test.ts
index 046d29b..a295866 100644
--- a/tests/public-api.test.ts
+++ b/tests/public-api.test.ts
@@ -5,6 +5,14 @@ import * as sdk from '../src'
  * the CHANGELOG in the same commit.
  */
 const RUNTIME_EXPORTS = [
+  'errorCode',
+  'findEnvelopeFiles',
+  'needsTransferableCopy',
+  'parsePrintableDocuments',
+  'renderPrintedSample',
+  'renderPrintedSamples',
+  'renderTedBarcode',
+  'writePrintedSamples',
   'DEFAULT_PORTAL_RETRY_POLICY',
   'PORTAL_REJECTIONS',
   'annulFolios',
```

`tests/types.test.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/types.test.ts b/tests/types.test.ts
index 28efd08..41fb4e7 100644
--- a/tests/types.test.ts
+++ b/tests/types.test.ts
@@ -29,8 +29,17 @@ import {
   createFolioConsumption,
   signFolioConsumption,
   bookEntryFromDocument,
+  parsePrintableDocuments,
+  renderPrintedSample,
+  renderTedBarcode,
+  renderPrintedSamples,
+  writePrintedSamples,
+  needsTransferableCopy,
 } from '../src'
 import type {
+  PrintableDocument,
+  PrintedSamplesResult,
+  WritePrintedSamplesResult,
   BookEntryInput,
   BookTotals,
   FolioConsumption,
@@ -170,6 +179,12 @@ const _typecheck = () => {
   expectTypeOf(createFolioConsumption).returns.toEqualTypeOf<FolioConsumption>()
   expectTypeOf(signFolioConsumption).returns.toEqualTypeOf<SignedFolioConsumption>()
   expectTypeOf(bookEntryFromDocument).returns.toEqualTypeOf<BookEntryInput>()
+  expectTypeOf(parsePrintableDocuments).returns.toEqualTypeOf<readonly PrintableDocument[]>()
+  expectTypeOf(needsTransferableCopy).returns.toEqualTypeOf<boolean>()
+  expectTypeOf(renderPrintedSample).returns.resolves.toEqualTypeOf<Uint8Array>()
+  expectTypeOf(renderTedBarcode).returns.resolves.toEqualTypeOf<Uint8Array>()
+  expectTypeOf(renderPrintedSamples).returns.resolves.toEqualTypeOf<PrintedSamplesResult>()
+  expectTypeOf(writePrintedSamples).returns.resolves.toEqualTypeOf<WritePrintedSamplesResult>()
   expectTypeOf<PurchaseSalesBook['periodTotals']>().toEqualTypeOf<readonly BookTotals[] | null>()
   expectTypeOf<GuideBook['periodTotals']>().toEqualTypeOf<GuideTotals | null>()
```

`tests/dist.smoke.test.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/dist.smoke.test.ts b/tests/dist.smoke.test.ts
index 87a98f9..4bdd117 100644
--- a/tests/dist.smoke.test.ts
+++ b/tests/dist.smoke.test.ts
@@ -60,6 +60,8 @@ const EXPECTED_FUNCTIONS = [
   'createFolioConsumption',
   'signFolioConsumption',
   'DteError',
+  'parsePrintableDocuments',
+  'renderPrintedSample',
 ] as const
 
 const nodeImportGuard = pathToFileURL(join(__dirname, 'support', 'node-import-guard.mjs')).href
@@ -228,3 +230,32 @@ guarded('dist smoke (dual ESM + CJS package)', () => {
     ])
   })
 })
+
+/** Issues an invoice with the fixtures and renders its printed sample through a loaded bundle. */
+const renderScript = (loadBundle: string): string => `
+const fs = require('node:fs')
+${loadBundle}.then(async (sdk) => {
+  const caf = sdk.parseCaf(fs.readFileSync(${JSON.stringify(join(fixtures, 'caf-33.xml'))}, 'utf8'))
+  const certificate = sdk.loadCertificateFromPkcs12(new Uint8Array(fs.readFileSync(${JSON.stringify(join(fixtures, 'cert.pfx'))})), 'secret')
+  const signed = sdk.issueDocument({
+    document: {
+      type: 33, folio: 1,
+      issuer: { rut: '76543210-3', businessName: 'Comercial Andina SpA', businessActivity: 'Software', address: 'Av. 1', commune: 'Santiago' },
+      receiver: { rut: '12345678-5', businessName: 'Cliente', businessActivity: 'Comercio', address: 'Calle 2', commune: 'Providencia' },
+      items: [{ name: 'Servicio', unitPrice: 1000 }],
+    },
+    caf, certificate, checkCafExpiry: false,
+  })
+  const [doc] = sdk.parsePrintableDocuments(signed.xml)
+  const pdf = await sdk.renderPrintedSample(doc, { transferable: true })
+  console.log(Buffer.from(pdf.subarray(0, 5)).toString() + ' ' + (pdf.length > 10000))
+}).catch((error) => { console.error(error); process.exit(1) })`
+
+guarded('dist smoke: printed samples', () => {
+  test('the bundles load pdf-lib and bwip-js on first use and render a printed sample', () => {
+    const esm = runNode(['-e', renderScript(`import(${JSON.stringify(pathToFileURL(esmEntry).href)})`)])
+    const cjs = runNode(['-e', renderScript(`Promise.resolve(require(${JSON.stringify(cjsEntry)}))`)])
+    expect(esm).toEqual({ ok: true, output: '%PDF- true\n' })
+    expect(cjs).toEqual({ ok: true, output: '%PDF- true\n' })
+  })
+})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/public-api tests/types --coverage=false
```

Expected: FAIL: `the public API exports exactly the documented runtime names` lists the eight names missing from the root, and the type test does not compile.

- [ ] **Step 3: Write the implementation**

`src/index.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/index.ts b/src/index.ts
index 629fd73..3500e1e 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -4,7 +4,7 @@
  * ES: API pública de dte-sdk: documentos, timbres, firmas y sobres, los libros del SII y el cliente de los servicios web
  * del SII (semilla y token, envíos, consultas de estado, aceptación y reclamos). Todo se exporta desde esta única entrada.
  */
-export { DteError, DTE_ERROR_CODES, isDteError } from './errors'
+export { DteError, DTE_ERROR_CODES, errorCode, isDteError } from './errors'
 export type { DteErrorCode, DteErrorDetails } from './errors'
 
 export {
@@ -393,3 +393,28 @@ export type { FolioLedgerStore, FolioRegistry } from './folios/registry'
 export { createDirectoryFolioRegistry } from './folios/node-registry'
 export type { DirectoryFolioRegistryOptions } from './folios/node-registry'
 export type { FolioEntry, FolioLedger, FolioScope, FolioSentRecord, FolioStats } from './folios/ledger'
+
+export { parsePrintableDocuments } from './pdf/parse'
+export type {
+  PrintableAdjustment,
+  PrintableDocument,
+  PrintableIssuer,
+  PrintableItem,
+  PrintableParty,
+  PrintableReference,
+  PrintableTotals,
+} from './pdf/parse'
+export { renderTedBarcode } from './pdf/stamp'
+export { needsTransferableCopy, renderPrintedSample } from './pdf/render'
+export type { PrintedLogo, PrintedSampleOptions, RenderPrintedSampleOptions } from './pdf/render'
+export { renderPrintedSamples } from './pdf/samples'
+export type {
+  PrintedEnvelope,
+  PrintedSample,
+  PrintedSampleFailure,
+  PrintedSampleSet,
+  PrintedSamplesInput,
+  PrintedSamplesResult,
+} from './pdf/samples'
+export { findEnvelopeFiles, writePrintedSamples } from './pdf/node-samples'
+export type { WritePrintedSamplesInput, WritePrintedSamplesResult, WrittenPrintedSample } from './pdf/node-samples'
```

`README.md` (save the diff and run `git apply`):

```diff
diff --git a/README.md b/README.md
index 38cc12e..99fb772 100644
--- a/README.md
+++ b/README.md
@@ -231,6 +231,32 @@ and what to do; the composite flows return it as data, so the CAFs already obtai
 refusal pages were measured against the real SII, but the pages of an enrolled company (quota, CAF, folio ranges) have not
 been seen yet: see the phase 4 design.
 
+## Printed samples (Node)
+
+```typescript
+import { parsePrintableDocuments, renderPrintedSample, renderPrintedSamples, writePrintedSamples, findEnvelopeFiles } from 'dte-sdk'
+
+// The signed XML is the input: one document the SDK issued, or any EnvioDTE/EnvioBOLETA
+const [doc] = parsePrintableDocuments(signed.xml)
+const pdf = await renderPrintedSample(doc, { siiOffice: 'S.I.I. - SANTIAGO ORIENTE', resolution: 'Res. Ex. SII N° 80 del 2014' })
+const transferableCopy = await renderPrintedSample(doc, { transferable: true }) // adds the acknowledgement box and CEDIBLE
+
+// Every document of every envelope, in memory, classified into the test and simulation sets
+const result = await renderPrintedSamples({ envelopes: [{ name: 'envio-set-basico.xml', xml: envelope.xml }], transferable: true })
+
+// From the files of a certification run into SET-PRUEBAS and SET-SIMULACION
+const files = await findEnvelopeFiles('./certification/envelopes')
+const written = await writePrintedSamples({ xmlFiles: files, outDir: './certification/samples', logoPath: './logo.png', transferable: true })
+```
+
+The printed sample follows the SII printed-samples manual: one page 21.5 cm wide and as tall as its content between 11
+and 33 cm, the red type box with the RUT, the type name and the folio, issuer, date, receiver, references, detail,
+totals, the acknowledgement box and `CEDIBLE` mark on the transferable copy (33, 34, 43, 46 and sale guides), and the
+PDF417 stamp of the TED with its legends. The stamp encodes the signed bytes exactly (`renderTedBarcode` gives the PNG
+alone). It needs Node: `pdf-lib` and `bwip-js` are loaded on first use, so importing the package still evaluates
+nothing. Failures of a batch come back as data (`failures[].code`), never as thrown errors. Retentions, the commission
+block of settlement invoices and a stamp raster above 300 DPI are not printed yet: see the phase 5a design.
+
 ## Errors
 
 ```typescript
```

`CHANGELOG.md` (save the diff and run `git apply`):

```diff
diff --git a/CHANGELOG.md b/CHANGELOG.md
index 0896021..22bd64f 100644
--- a/CHANGELOG.md
+++ b/CHANGELOG.md
@@ -16,7 +16,7 @@ and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0
   `toSiiDocument`/`fromSiiDocument` codec.
 - Certificates from PKCS#12 and PEM, CAF parsing and validity, Chile-local timestamps,
   text sanitization and ISO-8859-1 encoding, SII status code classification.
-- Dependencies: `node-forge`, `@xmldom/xmldom`, `fast-xml-parser`, `rut.ts`.
+- Dependencies: `node-forge`, `@xmldom/xmldom`, `fast-xml-parser`, `rut.ts`, `pdf-lib`, `bwip-js`.
 - SII web services client: `createSiiClient` (plain data, no methods) and free functions
   for seed/token on the DTEWS SOAP and receipts REST channels (`getSeed`, `getToken`),
   uploads (`uploadEnvelope`, `uploadBook`, `uploadFolioConsumption`) with duplicate
@@ -69,6 +69,12 @@ and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0
   `reobtainFolios`), with `SII_PORTAL_*` error codes, `PORTAL_REJECTIONS` and redaction of session cookies. Measured
   against the real SII up to the login, the logout and the refusal pages; the pages of an enrolled company are not.
 - Local folio registry: `createFolioRegistry`, `createMemoryFolioRegistry`, `createDirectoryFolioRegistry`, `cafFingerprint`.
+- Printed samples (Node): `parsePrintableDocuments` (any `EnvioDTE`, `EnvioBOLETA`, `SetDTE` or `DTE` XML, with each
+  `TED` verbatim), `renderPrintedSample` (one single-page PDF per the SII printed-samples manual, with the transferable
+  copy and acknowledgement box), `renderTedBarcode` (the PDF417 stamp as PNG with the signed bytes), `needsTransferableCopy`,
+  `renderPrintedSamples` (in-memory batch classified into the test and simulation sets, failures as data) and the Node
+  adapter `writePrintedSamples`/`findEnvelopeFiles` (`SET-PRUEBAS` and `SET-SIMULACION` on disk). Dependencies `pdf-lib`
+  and `bwip-js`, loaded on first use. Error codes `DEPENDENCY_UNAVAILABLE` and `PDF_RENDER_FAILED`, and `errorCode`.
 
 ### Removed
```

`llms.txt` (save the diff and run `git apply`):

```diff
diff --git a/llms.txt b/llms.txt
index 09b7ed5..0e34ec9 100644
--- a/llms.txt
+++ b/llms.txt
@@ -8,6 +8,8 @@ The SII web services client is `createSiiClient({ environment, certificate, comp
 
 The SII books are `createPurchaseSalesBook` (IECV, `LibroCompraVenta`), `createGuideBook` (`LibroGuia`) and `createFolioConsumption` (RCOF, `ConsumoFolios`), each with `build*Xml`, `sign*`, `verify*Signature` and `toSii*`. All submission kinds of the schemas are covered, and the SDK computes the summaries from the lines; `summaryOnlyTotals` and `previousTotals` carry what cannot be derived. An explicit line total that differs from the SII formula is kept and reported in `totalMismatches`, and `strictTotals: true` throws `BOOK_TOTAL_MISMATCH` instead. `bookEntryFromDocument`, `guideEntryFromDocument` and `folioConsumptionEntryFromDocument` derive the lines from issued documents. The signed XML goes to `uploadBook` or `uploadFolioConsumption`. The RCV replaced the IECV in production from period 2017-08, the guide book is sent only on SII request, and the report is used in the receipts certification; the SII probably no longer requires it in production.
 
+Printed samples (Node only): `parsePrintableDocuments` turns any `EnvioDTE`, `EnvioBOLETA`, bare `SetDTE` or bare `DTE` XML into printable documents with each `TED` copied verbatim; `renderPrintedSample` draws one single-page PDF per the SII printed-samples manual (21.5 cm wide, 11 to 33 cm tall, red type box, acknowledgement box and `CEDIBLE` mark on the transferable copy of 33, 34, 43, 46 and sale guides, PDF417 stamp with the signed bytes and its legends); `renderTedBarcode` gives the stamp PNG alone; `renderPrintedSamples` batches envelopes in memory into the test and simulation sets with failures as data; `writePrintedSamples` and `findEnvelopeFiles` do the same over files (`SET-PRUEBAS`, `SET-SIMULACION`). `pdf-lib` and `bwip-js` load on first use.
+
 The SII portal is `createPortalClient({ environment, certificate, companyRut })` plus free functions, on Node ≥ 20 (client certificate over `https`; TLS 1.2, server verified). The certificate must be enabled as a login method at sii.cl, or the login throws `SII_PORTAL_CERT_NOT_ENABLED`. Session: `openPortalSession`, `closePortalSession`, or on demand; `sessionCache` and `lock` are ports for several replicas. Company data: `fetchCompanyResolution` (per environment), `fetchTaxpayerData`, `fetchIssuerProfile`, `queryCertificationSets`. Folios: `listStampableTypes`, `queryFolioQuota` (`MAX_AUTOR`, `FOLIOS_DISP`; stamps nothing), `requestCaf` (may grant less than asked; read `granted`), `listFolioRanges`, `annulFolios` (explicit scope required; `maxRanges` limits one call; irreversible; counts against the quota for six months), `listReobtainableRanges`, `reobtainCaf`. Composite flows return refusals as data: `requestCafExact`, `requestCafInBatches`, `reobtainFolios`. Refusals are `SII_PORTAL_REJECTED` with `details.rejection` and `portalRejectionMessage`. `createFolioRegistry`, `createMemoryFolioRegistry` and `createDirectoryFolioRegistry` track folios locally. The CAF XML holds a private key: treat it as a secret.
 
 - [README](https://github.com/arrowsw/dte-sdk/blob/canary/README.md): installation and quick start
```

`docs/superpowers/specs/2026-10-31-dte-sdk-architecture-and-phase-1-design.md` (save the diff and run `git apply`):

```diff
diff --git a/docs/superpowers/specs/2026-10-31-dte-sdk-architecture-and-phase-1-design.md b/docs/superpowers/specs/2026-10-31-dte-sdk-architecture-and-phase-1-design.md
index 0a25735..a4099e6 100644
--- a/docs/superpowers/specs/2026-10-31-dte-sdk-architecture-and-phase-1-design.md
+++ b/docs/superpowers/specs/2026-10-31-dte-sdk-architecture-and-phase-1-design.md
@@ -125,6 +125,8 @@ dte-sdk/node      Node adapters: `https` transport with mTLS and the SII legacy
 dte-sdk/portal    certificate-authenticated portal: session, company data, RCV, MIPYME backup,
                   folios (query/void), CAF request, automated certification.
 dte-sdk/pdf       printed representations (PDF417 + PDF). Optional peer deps at first.
+                  (Superseded by the phase 5a spec: the PDF functions ship from the root entry with
+                  `pdf-lib` and `bwip-js` as regular dependencies loaded on first use, D40 and D41.)
 ```
 
 - What a subpath is: **the same npm package with more than one entry point**, declared in
```

- [ ] **Step 4: Run them and watch them pass** (`npm run build` first: the dist smoke loads the bundles)

```bash
npm run build && npx jest --config jest.config.cjs tests/public-api tests/types tests/dist.smoke --coverage=false
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/index.ts README.md CHANGELOG.md llms.txt docs/superpowers/specs/2026-10-31-dte-sdk-architecture-and-phase-1-design.md tests/public-api.test.ts tests/types.test.ts tests/dist.smoke.test.ts
```

```bash
git commit -F - <<'MSG'
feat: export the printed samples

The seven functions and their types on the root entry, in the public API list, the type tests and
the dist smoke, which now renders a sample through both bundles. README, llms.txt and the changelog
describe them; the architecture spec notes that the PDF module ships from the root.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Measurements

Minified and brotli-compressed, whole bundle:

| After | ESM | CJS |
|---|---|---|
| Phase 1 | under 16 kB | under 16 kB |
| Phase 2 | 25.65 kB | 25.9 kB |
| Phase 3 | 31.85 kB | 32.07 kB |
| Phase 4 | 44.45 kB | 44.64 kB |
| Phase 5a | 50.15 kB | 50.26 kB |

The libraries themselves stay outside: `pdf-lib` would add 175 kB brotli and `bwip-js` 186 kB if bundled.

## What this leaves open

- **The SII's acceptance.** The PDFs follow the layout known to pass the SII review of printed samples; the proof with
  these PDFs needs the company enrolled as an issuer and the `pdfdteInternet` upload of phase 5c.
- **Deferred on purpose** (spec section 7): withholdings in the totals of 46 and 43, the commission block of 43, the
  stamp raster at 300 DPI or more with 3:1 rows, `MontoNF`, the independent clamp of the stamp height, the silent
  logo failure, the silent cut past 33 cm. None changes until a real certification passes with the output as it is.
- **Issue 5 (subpath entry points)** stays open: the PDF functions ship from the root (D41).

---

## Task 8: Final gates and the pull request

No code, unless a gate finds something.

- [ ] **Step 1: Run every gate**

```bash
npm ci
```

```bash
npx prettier --check "{src,tests}/**/*.{js,ts}"
```

```bash
npm run lint
```

```bash
npx tsc --noEmit -p .
```

```bash
npm run build
```

```bash
npx jest --config jest.config.cjs --coverage
```

```bash
npx size-limit
```

```bash
npm run scan
```

Expected: all pass, 1 758 tests, 100 % on the four metrics, ESM about 50.15 kB and CJS about 50.26 kB against the 54 kB limit.

- [ ] **Step 2: Read the diff against `canary` once**

Nothing public may name a third-party implementation, and no RUT, certificate or local path may appear outside the allow-list. `npm run scan` covers the last part; the first is yours to check.

- [ ] **Step 3: Open the pull request against `canary`**

The body explains the printed-samples surface (parser, renderer, stamp, batch, Node adapter), the two dependencies and why they are loaded on first use, the 54 kB cap, lists the decisions of spec section 5 and the deferred items of section 7, and states plainly that no PDF has been submitted to the SII yet. Squash-merge is how this repository integrates, and merging is Hans's call.

- [ ] **Step 4: Record what stays open**

Add to [issue 8](https://github.com/arrowsw/dte-sdk/issues/8) the live proof the printed samples still need before the first release that ships them: the company enrolled, one `pdfdteInternet` submission (phase 5c) reviewed by the SII. Post the bundle sizes on [issue 5](https://github.com/arrowsw/dte-sdk/issues/5).
