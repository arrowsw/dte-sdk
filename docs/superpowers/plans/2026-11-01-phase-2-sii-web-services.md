# Phase 2 — SII web services client: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The SII web services client of dte-sdk: authenticate (seed/token on the DTEWS SOAP channel and on the receipts REST channel), upload envelopes, books and folio consumption reports, query envelope and document status, register and query acceptance/claims, with an injectable transport, retry policy, HTTP capture and upload archive, all functional and in English with bilingual `EN:`/`ES:` JSDoc.

**Architecture:** `createSiiClient(options)` returns a frozen data value (no methods, no hidden state); every operation is a free function `operation(sii, input, overrides?)`. State lives behind ports (`TokenCache`, `HttpCapture`, `UploadArchive`) with bundled memory adapters and lazy-loaded Node directory adapters. The transport is bytes in / bytes out (`fetch` by default, Node `https` as an adapter with TLS verification on by default); each SII channel decodes its own charset (ISO-8859-1 for DTEWS and `DTEUpload`, UTF-8 for the REST API and WSRECLAMO). Retries use exponential backoff with jitter and never re-send an upload after the SII answered.

**Tech Stack:** TypeScript 5.9 (strict), Node ≥ 20 (global `fetch`, `node:https` lazily), Jest 30 + ts-jest, expect-type, fast-check, ESLint 9 + Prettier, esbuild (minified ESM + CJS), size-limit. No new runtime dependencies (`node-forge`, `@xmldom/xmldom`, `fast-xml-parser`, `rut.ts` already present).

**Spec:** `docs/superpowers/specs/2026-11-01-phase-2-sii-web-services-design.md` (sections 3 and 4 are the contract: layout, API, errors, glossary; appendix A holds the SII protocol facts).

---

## Conventions that apply to EVERY task

1. **Bilingual JSDoc is mandatory** on every exported symbol and every type field:
   ```ts
   /**
    * EN: What it is or does.
    * ES: `SiiTag` — Qué es o qué hace.
    */
   ```
   In `@param`/`@returns`/`@throws`: `EN: … ES: …` on the same line.
2. **No classes** (only `DteError`). No mutable `let` outside local loops; closures of adapters may hold a `Map` or a counter (they are ports), the client may not. `readonly` types everywhere.
3. **No PII in error messages**: never interpolate RUTs, tokens, URLs or XML into `message`; they go in `details`. `details.url` and `details.body` are never safe keys.
4. **Repository Prettier style**: single quotes, no semicolons, width 120, trailing commas. Run `npm run prettier` before each commit.
5. **Tests**: one file per module under `tests/sii/` (or `tests/` for catalogs and signature changes), `describe`/`test.each` as in rut.ts. 100 % coverage (`jest.config.cjs` enforces it). If a defensive branch is unreachable, remove it; do not lower the threshold. **No network in tests**: everything goes through the fake SII (`tests/support/fake-sii.ts`) or a loopback server.
6. **Commits** on the `feat/sii-web-services` branch (cut from `feat/core-issuance`), conventional message in English, ending with the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No real data (RUTs, certificates, local paths, tokens): `npm run scan` checks it. Fixture RUTs come from the allow-list in `scripts/scan-real-data.mjs` (`76543210-3`, `77111222-3`, `12345678-5`, `60803000-K`, `66666666-6`); invented names only (`Comercial Andina SpA`, `Comercializadora Rapel Ltda`).
7. Commands run from the repository root.
8. **Nothing public names any third-party implementation**: not code, comments, tests, fixtures or commits. Describe the SII behaviour directly.
9. **Encodings**: a request body is `Uint8Array`; text for the DTEWS/`DTEUpload` channel is `encodeLatin1`, for the REST and WSRECLAMO channels `new TextEncoder().encode`. Responses are decoded with `decodeBody(bytes, 'latin1' | 'utf8')` from `src/sii/transport.ts`, never with a guessed charset.
10. **Tokens** are never logged, never put in a capture unredacted and never part of an error message.

## File map

```
scripts/
  build.mjs                    (modify) `node:*` added to the esbuild externals
  make-tls-fixture.mjs         (create) self-signed `localhost` certificate for the Node adapter tests
src/
  errors.ts                    (modify) 15 new codes, 7 new safe detail keys
  catalogs/endpoints.ts        (modify) exported SoapEndpoints/RestEndpoints, REST documentStatus + statusCatalog,
                               CLAIM_WS_ENDPOINTS = service URLs, CLAIM_WSDL_ENDPOINTS = WSDL URLs
  catalogs/upload-status.ts    (modify) FAN, isTokenErrorStatus
  catalogs/reception-status.ts (create) DTEUpload RECEPCIONDTE STATUS table, classification, schema-error detection
  catalogs/claim-codes.ts      (create) CLAIM_ACTIONS, CLAIM_EVENT_CODES, CLAIM_RESPONSE_CODES, TRANSFERABILITY_CODES
  signature/xmldsig.ts         (modify) buildSignedInfo accepts '' (URI=""), signRootElement
  sii/logger.ts                (create) Logger, silentLogger
  sii/lazy.ts                  (create) memoize: load `node:` modules once, on first use, never at import
  sii/node-fs.ts               (create) lazy node:fs/promises + node:path loader shared by the directory adapters
  sii/operation.ts             (create) helpers shared by the operations: HTTP status check, Retry-After, body excerpts,
                               SII:RESPUESTA reading, JSON parsing, timestamps, soapCall / restCall / restText
  sii/token-cache.ts           (create) TokenChannel, CachedToken, TokenCache, tokenCacheKey, createMemoryTokenCache
  sii/retry.ts                 (create) RetryPolicy, DEFAULT_RETRY_POLICY, mergeRetryPolicy, isRetryableError,
                               retryDelayMs, withRetry
  sii/transport.ts             (create) HttpRequest/HttpResponse/HttpTransport, createRequestSignal, decodeBody,
                               encodeUtf8, mapTransportError, createFetchTransport
  sii/node-transport.ts        (create) NodeTlsOptions, agentOptions, createNodeHttpsTransport (lazy node:https)
  sii/capture.ts               (create) HttpExchange, HttpCapture, redactText, redactExchange, createMemoryCapture
  sii/archive.ts               (create) UploadKind, UploadRecord, UploadArchive, createMemoryUploadArchive
  sii/node-capture.ts          (create) createDirectoryCapture (lazy node:fs/promises)
  sii/node-archive.ts          (create) createDirectoryUploadArchive (lazy node:fs/promises)
  sii/client.ts                (create) SiiClientOptions, SiiClient, SiiTimeouts, SiiEndpoints, CallOverrides,
                               createSiiClient, resolveCompanyRut, resolveSenderRut, timeoutFor, retryFor
  sii/send.ts                  (create) send: one HTTP exchange with timeout, capture and logging
  sii/soap.ts                  (create) buildSoapEnvelope, SOAP_HEADERS, parseSoapResponse, stripNamespacePrefixes
  sii/multipart.ts             (create) generateBoundary, multipartContentType, buildMultipartBody
  sii/auth.ts                  (create) getSeed, signSeed, getToken, invalidateToken, withToken, readSiiResponse
  sii/upload.ts                (create) uploadEnvelope, uploadBook, uploadFolioConsumption, parseReceptionResponse
  sii/status.ts                (create) queryUploadStatus, waitForUploadStatus, queryDocumentStatus, folioReceived
  sii/claims.ts                (create) registerClaim, listClaimEvents, queryTransferable, queryReceptionDate,
                               receiverStatus
  index.ts                     (modify) re-exports
tests/
  support/fake-sii.ts          (create) route-based fake SII transport that records requests
  support/sii-client.ts        (create) fixture certificate, auth routes, test clock, recording logger, testSii()
  support/sii-samples.ts       (create) shared sample records
  fixtures/tls-localhost.pem, tls-localhost.key.pem   (generated by scripts/make-tls-fixture.mjs)
  fixtures/sii/*.xml, *.json   (create) recorded-shape SII replies with invented data
  errors.test.ts, endpoints.test.ts, upload-status.test.ts, xmldsig.test.ts (modify)
  reception-status.test.ts, claim-codes.test.ts (create)
  sii/*.test.ts                (create) one per module
  live/sii.live.test.ts        (create) opt-in smoke against maullin (`SII_LIVE=1`)
  public-api.test.ts, dist.smoke.test.ts, types.test.ts (modify)
README.md, CHANGELOG.md, llms.txt, package.json (description), .size-limit.json, .github/workflows/ci.yml (modify)
```

---

### Task 0: Scaffolding (branch, esbuild externals, TLS fixture)

**Files:**
- Modify: `scripts/build.mjs`, `package.json` (scripts), `tests/fixtures/README.md`
- Create: `scripts/make-tls-fixture.mjs`, `tests/fixtures/tls-localhost.pem`, `tests/fixtures/tls-localhost.key.pem`

- [ ] **Step 1: Branch**

```bash
git checkout feat/core-issuance
git pull --ff-only
git checkout -b feat/sii-web-services
npm ci
npm test
```

Expected: the phase 1 suite passes (100 % coverage) before any phase 2 change.

- [ ] **Step 2: esbuild keeps `node:` modules external**

`scripts/build.mjs`, replace the `EXTERNAL` line:

```js
// `node:*` stays external: the Node adapters import `node:https` and `node:fs/promises` lazily, inside the
// function that needs them, so the neutral bundle never evaluates them and Deno/Bun/browsers still load it.
const EXTERNAL = ['node-forge', '@xmldom/xmldom', 'fast-xml-parser', 'rut.ts', 'node:*']
```

- [ ] **Step 3: TLS fixture generator**

`scripts/make-tls-fixture.mjs`:

```js
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
```

`package.json`, in `"scripts"` add after `"fixtures"`:

```json
    "fixtures:tls": "node scripts/make-tls-fixture.mjs",
```

Run: `npm run fixtures:tls && openssl x509 -in tests/fixtures/tls-localhost.pem -noout -subject -ext subjectAltName`
Expected: `subject=CN=localhost, O=dte-sdk test server` and `DNS:localhost, IP Address:127.0.0.1`.

- [ ] **Step 4: Fixture README**

`tests/fixtures/README.md`, add two rows to the table:

```markdown
| `tls-localhost.pem`, `tls-localhost.key.pem` | self-signed server certificate (`CN=localhost`, SAN `DNS:localhost, IP:127.0.0.1`, valid 2026-2046) for the loopback HTTPS server of the Node transport tests; generated by `npm run fixtures:tls`, independent of the other fixtures |
| `sii/` | SII web service replies (SOAP, `DTEUpload`, REST, WSRECLAMO) with invented data, served by the fake SII in `tests/support/fake-sii.ts` |
```

- [ ] **Step 5: Verify and commit**

Run: `mkdir -p tests/fixtures/sii && npm run build && npm run scan && npm test -- tests/dist.smoke.test.ts`
Expected: build OK, `Real-data scan ok`, smoke PASS (the `.pem`/`.key.pem` files are allowed under `tests/fixtures/`).

```bash
git add scripts/build.mjs scripts/make-tls-fixture.mjs package.json tests/fixtures/README.md tests/fixtures/tls-localhost.pem tests/fixtures/tls-localhost.key.pem
git commit -m "chore: phase 2 scaffolding (node externals, loopback TLS fixture)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 1: Phase 2 error codes (`src/errors.ts`)

**Files:**
- Modify: `src/errors.ts`
- Test: `tests/errors.test.ts`

- [ ] **Step 1: Failing test**

Append to `tests/errors.test.ts` inside the top-level `describe('DteError', …)`:

```ts
  test('phase 2 codes exist with generic messages', () => {
    expect(new DteError('TRANSPORT_FAILED').message).toBe('HTTP request failed before a response arrived')
    expect(new DteError('TRANSPORT_TLS').message).toBe('TLS handshake or certificate verification failed')
    expect(new DteError('SII_UPLOAD_REJECTED').message).toBe('SII rejected the upload')
    expect(new DteError('WAIT_TIMEOUT').message).toBe('Timed out waiting for the SII status')
  })

  test('phase 2 safe keys appear in the message; url and body never do', () => {
    const err = new DteError('SII_HTTP_ERROR', {
      httpStatus: 503,
      operation: 'getSeed',
      attempts: 3,
      channel: 'soap',
      url: 'https://maullin.sii.cl/DTEWS/CrSeed.jws?rut=SECRET',
      body: '<html>SECRET</html>',
    })
    expect(err.message).toBe('SII answered with an HTTP error status (httpStatus=503, attempts=3, channel=soap, operation=getSeed)')
    expect(err.message).not.toContain('SECRET')
    expect(new DteError('SII_UPLOAD_REJECTED', { status: '7', trackId: '123', code: 'SCH-00001' }).message).toBe(
      'SII rejected the upload (status=7, code=SCH-00001, trackId=123)',
    )
  })
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/errors.test.ts`
Expected: FAIL, TypeScript rejects `'TRANSPORT_FAILED'` as a `DteErrorCode`.

- [ ] **Step 3: Implementation**

`src/errors.ts`: add the codes at the end of `DTE_ERROR_CODES` (before `} as const`):

```ts
  INVALID_OPTION: 'INVALID_OPTION',
  TRANSPORT_UNAVAILABLE: 'TRANSPORT_UNAVAILABLE',
  TRANSPORT_FAILED: 'TRANSPORT_FAILED',
  TRANSPORT_TLS: 'TRANSPORT_TLS',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  REQUEST_ABORTED: 'REQUEST_ABORTED',
  SII_HTTP_ERROR: 'SII_HTTP_ERROR',
  SII_RESPONSE_INVALID: 'SII_RESPONSE_INVALID',
  SII_SOAP_FAULT: 'SII_SOAP_FAULT',
  SII_SEED_FAILED: 'SII_SEED_FAILED',
  SII_TOKEN_FAILED: 'SII_TOKEN_FAILED',
  SII_TOKEN_INVALID: 'SII_TOKEN_INVALID',
  SII_UPLOAD_REJECTED: 'SII_UPLOAD_REJECTED',
  SII_QUERY_ERROR: 'SII_QUERY_ERROR',
  WAIT_TIMEOUT: 'WAIT_TIMEOUT',
```

Add the messages at the end of `MESSAGES`:

```ts
  INVALID_OPTION: 'Option value is not valid',
  TRANSPORT_UNAVAILABLE: 'No HTTP transport is available in this runtime',
  TRANSPORT_FAILED: 'HTTP request failed before a response arrived',
  TRANSPORT_TLS: 'TLS handshake or certificate verification failed',
  REQUEST_TIMEOUT: 'Request timed out',
  REQUEST_ABORTED: 'Request was aborted by the caller',
  SII_HTTP_ERROR: 'SII answered with an HTTP error status',
  SII_RESPONSE_INVALID: 'SII response could not be interpreted',
  SII_SOAP_FAULT: 'SII answered with a SOAP fault',
  SII_SEED_FAILED: 'SII refused to issue a seed',
  SII_TOKEN_FAILED: 'SII refused to issue a token',
  SII_TOKEN_INVALID: 'SII rejected the authentication token',
  SII_UPLOAD_REJECTED: 'SII rejected the upload',
  SII_QUERY_ERROR: 'SII status query failed',
  WAIT_TIMEOUT: 'Timed out waiting for the SII status',
```

Replace the `SAFE_DETAIL_KEYS` line:

```ts
// Only these detail keys are safe to show: field names, codes and numbers, never user text, URLs or bodies.
const SAFE_DETAIL_KEYS = [
  'field',
  'maxLength',
  'length',
  'type',
  'folio',
  'from',
  'to',
  'kind',
  'index',
  'status',
  'httpStatus',
  'code',
  'attempts',
  'channel',
  'operation',
  'trackId',
] as const
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest tests/errors.test.ts`
Expected: PASS (the `test.each` over every code now covers 35 codes).

- [ ] **Step 5: Commit**

```bash
git add src/errors.ts tests/errors.test.ts
git commit -m "feat: error codes for the SII web services client

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 2: Endpoint and status catalog updates (`src/catalogs/endpoints.ts`, `src/catalogs/upload-status.ts`)

**Files:**
- Modify: `src/catalogs/endpoints.ts`, `src/catalogs/upload-status.ts`
- Test: `tests/endpoints.test.ts`, `tests/upload-status.test.ts`

- [ ] **Step 1: Failing tests**

`tests/endpoints.test.ts` (replace entirely):

```ts
import {
  SII_HOSTS,
  SOAP_ENDPOINTS,
  REST_ENDPOINTS,
  CLAIM_WS_ENDPOINTS,
  CLAIM_WSDL_ENDPOINTS,
  UPLOAD_USER_AGENT,
} from '../src/catalogs/endpoints'

describe('endpoints', () => {
  test('hosts per environment', () => {
    expect(SII_HOSTS).toEqual({ certification: 'maullin.sii.cl', production: 'palena.sii.cl' })
  })

  test.each(['certification', 'production'] as const)('%s SOAP, REST and claim URLs are https', (env) => {
    for (const url of Object.values(SOAP_ENDPOINTS[env])) expect(url).toMatch(/^https:\/\/(maullin|palena)\.sii\.cl\//)
    for (const url of Object.values(REST_ENDPOINTS[env]))
      expect(url).toMatch(/^https:\/\/(apicert|api|pangal|rahue)\.sii\.cl\//)
    expect(CLAIM_WS_ENDPOINTS[env]).toMatch(
      /^https:\/\/ws[12]\.sii\.cl\/WSREGISTRORECLAMODTE(CERT)?\/registroreclamodteservice$/,
    )
    expect(CLAIM_WSDL_ENDPOINTS[env]).toBe(`${CLAIM_WS_ENDPOINTS[env]}?wsdl`)
  })

  test('upload endpoints', () => {
    expect(SOAP_ENDPOINTS.certification.upload).toBe('https://maullin.sii.cl/cgi_dte/UPL/DTEUpload')
    expect(REST_ENDPOINTS.production.upload).toBe('https://rahue.sii.cl/recursos/v1/boleta.electronica.envio')
    expect(UPLOAD_USER_AGENT).toBe('Mozilla/4.0 ( compatible; PROG 1.0; Windows NT)')
  })

  test('REST status endpoints are prefixes the client completes', () => {
    expect(REST_ENDPOINTS.certification.status).toBe('https://apicert.sii.cl/recursos/v1/boleta.electronica.envio/')
    expect(REST_ENDPOINTS.production.documentStatus).toBe('https://api.sii.cl/recursos/v1/boleta.electronica/')
    expect(REST_ENDPOINTS.production.statusCatalog).toBe(
      'https://api.sii.cl/recursos/v1/globales/boleta.electronica.envio.estado',
    )
  })
})
```

`tests/upload-status.test.ts`: in the `classifyDocumentStatus` `test.each` table (the one that ends with `['XYZ', 'unknown']`) add the row `['FAN', 'cancelled'],` right after the `ANC` row; extend the imports with `isTokenErrorStatus`; append at the end of the file:

```ts
describe('token error statuses', () => {
  test.each(['-3', '-13', '001', '002', '003'])('%s means the token was rejected', (code) => {
    expect(isTokenErrorStatus(code)).toBe(true)
  })

  test.each(['EPR', '-1', '-14', '0', 'FAN'])('%s is not a token error', (code) => {
    expect(isTokenErrorStatus(code)).toBe(false)
  })

  test('FAN has a gloss', () => {
    expect(documentStatusMessage('FAN')).toBe('Folio anulado')
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest tests/endpoints.test.ts tests/upload-status.test.ts`
Expected: FAIL (`CLAIM_WSDL_ENDPOINTS` and `isTokenErrorStatus` do not exist; `documentStatus` is undefined; `FAN` is `unknown`).

- [ ] **Step 3: Implementation**

`src/catalogs/endpoints.ts` (replace entirely):

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

/**
 * EN: SOAP / CGI endpoints of one environment.
 * ES: Endpoints SOAP / CGI de un ambiente.
 */
export type SoapEndpoints = {
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

/**
 * EN: REST endpoints of the receipts API for one environment.
 * ES: Endpoints REST de la API de boletas de un ambiente.
 */
export type RestEndpoints = {
  /** EN: GET seed for the receipts REST API. ES: Semilla de la API REST de boletas. */
  readonly seed: string
  /** EN: POST signed seed → token. ES: Token REST a partir de la semilla firmada. */
  readonly token: string
  /** EN: multipart upload of `EnvioBOLETA`. ES: Envío REST de boletas. */
  readonly upload: string
  /** EN: envelope status prefix; append `{rut}-{dv}-{trackId}`. ES: Prefijo de estado del envío; se completa con `{rut}-{dv}-{trackId}`. */
  readonly status: string
  /** EN: per-document status prefix; append `{rut}-{dv}-{type}-{folio}/estado`. ES: Prefijo de estado por documento; se completa con `{rut}-{dv}-{tipo}-{folio}/estado`. */
  readonly documentStatus: string
  /** EN: catalog of envelope states (no token needed). ES: Catálogo de estados de envío (sin token). */
  readonly statusCatalog: string
}

const restFor = (apiHost: string, uploadHost: string): RestEndpoints => ({
  seed: `https://${apiHost}/recursos/v1/boleta.electronica.semilla`,
  token: `https://${apiHost}/recursos/v1/boleta.electronica.token`,
  upload: `https://${uploadHost}/recursos/v1/boleta.electronica.envio`,
  status: `https://${apiHost}/recursos/v1/boleta.electronica.envio/`,
  documentStatus: `https://${apiHost}/recursos/v1/boleta.electronica/`,
  statusCatalog: `https://${apiHost}/recursos/v1/globales/boleta.electronica.envio.estado`,
})

/**
 * EN: REST endpoints of the receipts API per environment.
 * ES: Endpoints REST de boletas por ambiente (apicert/pangal en certificación, api/rahue en producción).
 */
export const REST_ENDPOINTS: Readonly<Record<Environment, RestEndpoints>> = {
  certification: restFor('apicert.sii.cl', 'pangal.sii.cl'),
  production: restFor('api.sii.cl', 'rahue.sii.cl'),
}

/**
 * EN: Service URLs of the acceptance/claim registry web service (WSRECLAMO v1.2); SOAP calls are POSTed here.
 * ES: URLs del servicio de Registro de Aceptación/Reclamo (WSRECLAMO v1.2); las llamadas SOAP se envían por POST aquí.
 */
export const CLAIM_WS_ENDPOINTS: Readonly<Record<Environment, string>> = {
  certification: 'https://ws2.sii.cl/WSREGISTRORECLAMODTECERT/registroreclamodteservice',
  production: 'https://ws1.sii.cl/WSREGISTRORECLAMODTE/registroreclamodteservice',
}

/**
 * EN: WSDL of the acceptance/claim registry web service.
 * ES: WSDL del web service de Registro de Aceptación/Reclamo.
 */
export const CLAIM_WSDL_ENDPOINTS: Readonly<Record<Environment, string>> = {
  certification: `${CLAIM_WS_ENDPOINTS.certification}?wsdl`,
  production: `${CLAIM_WS_ENDPOINTS.production}?wsdl`,
}

/**
 * EN: User-Agent the SII upload CGI expects (it rejects modern browser strings).
 * ES: User-Agent que espera el CGI de subida del SII (rechaza cadenas de navegador modernas).
 */
export const UPLOAD_USER_AGENT = 'Mozilla/4.0 ( compatible; PROG 1.0; Windows NT)'
```

`src/catalogs/upload-status.ts`: in `DOCUMENT_STATUS` add after the `ANC` row:

```ts
  FAN: { cls: 'cancelled', message: 'Folio anulado' },
```

and append at the end of the file:

```ts
// Statuses that mean the SII rejected the authentication token: `QueryEst*` -3/-13 and the 001/002/003 token errors.
const TOKEN_ERROR_STATUS: ReadonlySet<string> = new Set(['-3', '-13', '001', '002', '003'])

/**
 * EN: True when a `QueryEstUp`/`QueryEstDte` status means the token was rejected (renew it and retry once).
 * ES: True cuando un estado de `QueryEstUp`/`QueryEstDte` significa token rechazado (renovar y reintentar una vez).
 */
export const isTokenErrorStatus = (code: string): boolean => TOKEN_ERROR_STATUS.has(code)
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx jest tests/endpoints.test.ts tests/upload-status.test.ts tests/public-api.test.ts`
Expected: endpoints and upload-status PASS; `public-api` FAILS because `CLAIM_WSDL_ENDPOINTS` and `isTokenErrorStatus` are not exported yet. Add both to `src/index.ts` (the `endpoints` and `upload-status` export lines) and to `RUNTIME_EXPORTS` in `tests/public-api.test.ts`, then run the three files again: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/catalogs/endpoints.ts src/catalogs/upload-status.ts src/index.ts tests/endpoints.test.ts tests/upload-status.test.ts tests/public-api.test.ts
git commit -m "feat: REST status endpoints, claim service URLs, FAN status and token error detection

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Reception and claim catalogs (`src/catalogs/reception-status.ts`, `src/catalogs/claim-codes.ts`)

**Files:**
- Create: `src/catalogs/reception-status.ts`, `src/catalogs/claim-codes.ts`
- Test: `tests/reception-status.test.ts`, `tests/claim-codes.test.ts`

- [ ] **Step 1: Failing tests**

`tests/reception-status.test.ts`:

```ts
import {
  RECEPTION_STATUS,
  classifyReceptionStatus,
  receptionStatusMessage,
  isRetryableReceptionStatus,
  isSchemaRejection,
} from '../src/catalogs/reception-status'

describe('DTEUpload reception status', () => {
  test.each([
    ['0', 'received'],
    ['1', 'rejected'],
    ['2', 'rejected'],
    ['3', 'rejected'],
    ['5', 'notAuthenticated'],
    ['6', 'rejected'],
    ['7', 'schemaInvalid'],
    ['8', 'rejected'],
    ['9', 'rejected'],
    ['99', 'alreadyUploaded'],
    ['42', 'unknown'],
  ])('STATUS %s → %s', (code, expected) => {
    expect(classifyReceptionStatus(code)).toBe(expected)
  })

  test('messages', () => {
    expect(receptionStatusMessage('0')).toBe('Envío recibido, TrackID asignado')
    expect(receptionStatusMessage('5')).toBe('No autenticado: token ausente o vencido')
    expect(receptionStatusMessage('42')).toBe('Estado de recepción desconocido: 42')
    expect(Object.keys(RECEPTION_STATUS)).toHaveLength(10)
  })

  test('only a blocked system is worth retrying', () => {
    expect(isRetryableReceptionStatus('9')).toBe(true)
    expect(isRetryableReceptionStatus('7')).toBe(false)
    expect(isRetryableReceptionStatus('0')).toBe(false)
  })

  test.each([
    [['CHR-00001: Error de charset'], true],
    [['SCH-00001: Error de esquema'], true],
    [['cvc-complex-type.2.4.a: Invalid content was found'], true],
    [['Archivo ya fue enviado 2 veces con Trackid 1234567'], false],
    [[], false],
  ])('schema rejection %j → %s', (errors, expected) => {
    expect(isSchemaRejection(errors)).toBe(expected)
  })
})
```

`tests/claim-codes.test.ts`:

```ts
import {
  CLAIM_ACTIONS,
  CLAIM_EVENT_CODES,
  CLAIM_RESPONSE_CODES,
  TRANSFERABILITY_CODES,
  claimResponseMessage,
  isClaimAction,
  transferabilityMessage,
  transferabilityOf,
} from '../src/catalogs/claim-codes'

describe('claim catalogs', () => {
  test('actions map to the SII codes', () => {
    expect(CLAIM_ACTIONS).toEqual({
      acceptContent: 'ACD',
      claimContent: 'RCD',
      acknowledgeGoods: 'ERM',
      claimPartialShortfall: 'RFP',
      claimTotalShortfall: 'RFT',
    })
    expect(isClaimAction('acceptContent')).toBe(true)
    expect(isClaimAction('toString')).toBe(false)
    expect(isClaimAction(42)).toBe(false)
  })

  test('event codes include the credit-note events', () => {
    expect(Object.keys(CLAIM_EVENT_CODES).sort()).toEqual(['ACD', 'ENC', 'ERM', 'NCA', 'RCD', 'RFP', 'RFT'])
  })

  test('response codes 0 to 19 and -1 have a message', () => {
    expect(Object.keys(CLAIM_RESPONSE_CODES)).toHaveLength(21)
    expect(claimResponseMessage(0)).toBe('Acción completada OK')
    expect(claimResponseMessage(8)).toBe('Han pasado más de 8 días desde la recepción del documento')
    expect(claimResponseMessage(-1)).toBe('Error interno del SII, reintentar')
    expect(claimResponseMessage(77)).toBe('Código de respuesta desconocido: 77')
  })

  test.each([
    [20, false],
    [21, false],
    [22, null],
    [23, true],
    [24, false],
    [25, true],
    [18, null],
  ])('transferability of %s → %s', (code, expected) => {
    expect(transferabilityOf(code)).toBe(expected)
  })

  test('transferability messages fall back to the response codes', () => {
    expect(Object.keys(TRANSFERABILITY_CODES)).toHaveLength(6)
    expect(transferabilityMessage(23)).toBe('Cedible, sin reclamos registrados')
    expect(transferabilityMessage(18)).toBe('Documento no recibido en el SII')
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest tests/reception-status.test.ts tests/claim-codes.test.ts`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 3: Implementation**

`src/catalogs/reception-status.ts`:

```ts
/**
 * EN: Outcome class of a `DTEUpload` reception `STATUS`.
 * ES: Clase de resultado del `STATUS` de `RECEPCIONDTE` (respuesta del `DTEUpload`): recibido, rechazado, no
 * autenticado, esquema inválido (o duplicado: lo decide `DETAIL`), ya enviado o desconocido.
 */
export type ReceptionStatusClass =
  | 'received'
  | 'rejected'
  | 'notAuthenticated'
  | 'schemaInvalid'
  | 'alreadyUploaded'
  | 'unknown'

type ReceptionEntry = { readonly cls: ReceptionStatusClass; readonly message: string }

/**
 * EN: `RECEPCIONDTE/STATUS` codes of the `DTEUpload` CGI with their Spanish gloss.
 * ES: Códigos `STATUS` de `RECEPCIONDTE` del CGI `DTEUpload` con su glosa.
 */
export const RECEPTION_STATUS: Readonly<Record<string, ReceptionEntry>> = {
  '0': { cls: 'received', message: 'Envío recibido, TrackID asignado' },
  '1': { cls: 'rejected', message: 'El remitente no tiene permiso para enviar por esta empresa' },
  '2': { cls: 'rejected', message: 'Error en el tamaño del archivo (muy grande o muy chico)' },
  '3': { cls: 'rejected', message: 'Archivo cortado o incompleto' },
  '5': { cls: 'notAuthenticated', message: 'No autenticado: token ausente o vencido' },
  '6': { cls: 'rejected', message: 'Empresa no autorizada a enviar archivos' },
  '7': { cls: 'schemaInvalid', message: 'Esquema inválido o archivo ya enviado (ver DETAIL)' },
  '8': { cls: 'rejected', message: 'Error en la firma del documento' },
  '9': { cls: 'rejected', message: 'Sistema bloqueado, reintentar más tarde' },
  '99': { cls: 'alreadyUploaded', message: 'Archivo ya fue enviado anteriormente' },
}

/**
 * EN: Classifies a `RECEPCIONDTE/STATUS` code.
 * ES: Clasifica un código `STATUS` de `RECEPCIONDTE`.
 */
export const classifyReceptionStatus = (code: string): ReceptionStatusClass => RECEPTION_STATUS[code]?.cls ?? 'unknown'

/**
 * EN: Spanish gloss of a `RECEPCIONDTE/STATUS` code.
 * ES: Glosa en español de un código `STATUS` de `RECEPCIONDTE`.
 */
export const receptionStatusMessage = (code: string): string =>
  RECEPTION_STATUS[code]?.message ?? `Estado de recepción desconocido: ${code}`

/**
 * EN: True for `STATUS` 9 (system blocked), the only reception status that clears by itself.
 * ES: True para `STATUS` 9 (sistema bloqueado), el único estado de recepción que se resuelve solo.
 */
export const isRetryableReceptionStatus = (code: string): boolean => code === '9'

const SCHEMA_ERROR_PATTERN = /CHR-\d+|SCH-\d+|cvc-[\w.-]+/i

/**
 * EN: True when the `DETAIL/ERROR` lines of a `STATUS` 7 reply describe a real charset or schema rejection
 * (`CHR-00001`, `SCH-00001`, `cvc-…`) rather than a duplicate upload.
 * ES: True cuando las líneas `DETAIL/ERROR` de un `STATUS` 7 describen un rechazo real de charset o esquema
 * (`CHR-00001`, `SCH-00001`, `cvc-…`) y no un envío duplicado.
 */
export const isSchemaRejection = (errors: readonly string[]): boolean =>
  errors.some((line) => SCHEMA_ERROR_PATTERN.test(line))
```

`src/catalogs/claim-codes.ts`:

```ts
/**
 * EN: Actions of the acceptance/claim registry, English name → SII code (`accionDoc`).
 * ES: `accionDoc` — Acciones del Registro de Aceptación/Reclamo: ACD acepta contenido, RCD reclama contenido,
 * ERM otorga recibo de mercaderías, RFP reclama falta parcial, RFT reclama falta total.
 */
export const CLAIM_ACTIONS = {
  acceptContent: 'ACD',
  claimContent: 'RCD',
  acknowledgeGoods: 'ERM',
  claimPartialShortfall: 'RFP',
  claimTotalShortfall: 'RFT',
} as const

/** EN: English name of a claim action. ES: Nombre en inglés de una acción del registro. */
export type ClaimAction = keyof typeof CLAIM_ACTIONS

/** EN: SII code of a claim action. ES: Código SII de una acción (`ACD`, `RCD`, `ERM`, `RFP`, `RFT`). */
export type ClaimActionCode = (typeof CLAIM_ACTIONS)[ClaimAction]

/**
 * EN: Type guard for `ClaimAction`.
 * ES: Guarda de tipo para `ClaimAction`.
 */
export const isClaimAction = (value: unknown): value is ClaimAction =>
  typeof value === 'string' && Object.keys(CLAIM_ACTIONS).includes(value)

/**
 * EN: Event codes the registry reports (`codEvento`), including the credit-note events the receiver does not register.
 * ES: `codEvento` — Códigos de evento del registro, incluidos los de notas de crédito que no registra el receptor.
 */
export const CLAIM_EVENT_CODES: Readonly<Record<string, string>> = {
  ACD: 'Acepta contenido del documento',
  RCD: 'Reclamo al contenido del documento',
  ERM: 'Otorga recibo de mercaderías o servicios',
  RFP: 'Reclamo por falta parcial de mercaderías',
  RFT: 'Reclamo por falta total de mercaderías',
  NCA: 'Nota de crédito de anulación',
  ENC: 'Otra nota de crédito',
}

/**
 * EN: `codResp` of the registry operations (0 ok, 1–19 business answers, -1 internal error).
 * ES: `codResp` — Respuestas de las operaciones del registro (0 ok, 1–19 respuestas de negocio, -1 error interno).
 */
export const CLAIM_RESPONSE_CODES: Readonly<Record<string, string>> = {
  '0': 'Acción completada OK',
  '1': 'RUT del emisor erróneo',
  '2': 'Folio erróneo',
  '3': 'El tipo de documento no corresponde',
  '4': 'Acción inválida',
  '5': 'DTE ya reclamado',
  '6': 'No se puede otorgar recibo de mercaderías a un DTE reclamado',
  '7': 'Evento registrado previamente',
  '8': 'Han pasado más de 8 días desde la recepción del documento',
  '9': 'No existen registros para los parámetros indicados',
  '10': 'DTE no recibido en el SII desde el 14-01-2017',
  '11': 'No se puede reclamar un DTE aceptado previamente',
  '12': 'No se puede aceptar un DTE rechazado previamente',
  '13': 'No se puede reclamar un DTE con recibo de mercaderías',
  '14': 'Solo la empresa receptora o emisora puede consultar',
  '15': 'Lista de eventos del documento',
  '16': 'El documento no tiene eventos registrados',
  '17': 'Solo la empresa receptora puede registrar eventos',
  '18': 'Documento no recibido en el SII',
  '19': 'Reclamo por mercaderías ya realizado',
  '-1': 'Error interno del SII, reintentar',
}

/**
 * EN: Spanish gloss of a `codResp`.
 * ES: Glosa en español de un `codResp`.
 */
export const claimResponseMessage = (code: number): string =>
  CLAIM_RESPONSE_CODES[String(code)] ?? `Código de respuesta desconocido: ${code}`

/**
 * EN: `codResp` of `consultarDocDteCedible` with the transferability each one implies (`null` = undetermined).
 * ES: `codResp` de `consultarDocDteCedible` con la cedibilidad que implica cada uno (`null` = indeterminada).
 */
export const TRANSFERABILITY_CODES: Readonly<
  Record<string, { readonly message: string; readonly transferable: boolean | null }>
> = {
  '20': { message: 'Tipo de documento no cedible', transferable: false },
  '21': { message: 'No cedible: anulado por nota de crédito dentro de los 8 días', transferable: false },
  '22': { message: 'Sin registro de reclamo ni de recibo de mercaderías', transferable: null },
  '23': { message: 'Cedible, sin reclamos registrados', transferable: true },
  '24': { message: 'No cedible: reclamado por el receptor', transferable: false },
  '25': { message: 'Cedible: transcurridos 8 días sin reclamo, se presume recibido', transferable: true },
}

/**
 * EN: Transferability implied by a `consultarDocDteCedible` code: true (23, 25), false (20, 21, 24), null otherwise.
 * ES: Cedibilidad que implica un código de `consultarDocDteCedible`: true (23, 25), false (20, 21, 24), null en otro caso.
 */
export const transferabilityOf = (code: number): boolean | null =>
  TRANSFERABILITY_CODES[String(code)]?.transferable ?? null

/**
 * EN: Spanish gloss of a `consultarDocDteCedible` code; falls back to the generic response codes.
 * ES: Glosa en español de un código de `consultarDocDteCedible`; cae a los códigos de respuesta genéricos.
 */
export const transferabilityMessage = (code: number): string =>
  TRANSFERABILITY_CODES[String(code)]?.message ?? claimResponseMessage(code)
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx jest tests/reception-status.test.ts tests/claim-codes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/catalogs/reception-status.ts src/catalogs/claim-codes.ts tests/reception-status.test.ts tests/claim-codes.test.ts
git commit -m "feat: DTEUpload reception status and claim registry catalogs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 4: Whole-document XMLDSig signature for the seed (`src/signature/xmldsig.ts`)

**Files:**
- Modify: `src/signature/xmldsig.ts`
- Test: `tests/xmldsig.test.ts`

- [ ] **Step 1: Failing tests**

`tests/xmldsig.test.ts`: extend the imports (`rsaSha1VerifyBase64` from `'../src/crypto/rsa'`, `signRootElement` from `'../src/signature/xmldsig'`) and append:

```ts
describe('buildSignedInfo with an empty reference', () => {
  test('emits URI="" for whole-document signatures', () => {
    expect(buildSignedInfo('', 'ZGlnZXN0', { includeXsi: false })).toContain('<Reference URI="">')
    expect(buildSignedInfo('', 'ZGlnZXN0', { includeXsi: false })).not.toContain('xmlns:xsi')
  })
})

describe('signRootElement', () => {
  const body = '<getToken><item><Semilla>000000000078</Semilla></item></getToken>'
  const seedXml = `<?xml version="1.0" encoding="UTF-8"?>\n${body}`

  test('signs the canonical root and inserts the Signature before the closing tag', () => {
    const { xml: signed, signature } = signRootElement({ xml: seedXml, rootTag: 'getToken', certificate })
    expect(signature.digestValue).toBe(sha1Base64(body, 'utf8'))
    expect(
      signed.startsWith(
        `<?xml version="1.0" encoding="UTF-8"?>\n<getToken><item><Semilla>000000000078</Semilla></item><Signature xmlns="${DSIG}"><SignedInfo xmlns="${DSIG}"><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>`,
      ),
    ).toBe(true)
    expect(signed.endsWith('</X509Certificate></X509Data></KeyInfo></Signature></getToken>')).toBe(true)
    expect(signed).toContain('<Reference URI=""><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></Transforms>')
    expect(signed).not.toContain('xmlns:xsi')
    const canonicalSignedInfo = buildSignedInfo('', signature.digestValue, { expandTags: true, includeXsi: false })
    expect(rsaSha1VerifyBase64(certificate.publicKey, canonicalSignedInfo, 'utf8', signature.signatureValue)).toBe(true)
  })

  test('wraps SignatureValue, Modulus and X509Certificate at 64 columns', () => {
    const { xml: signed } = signRootElement({ xml: seedXml, rootTag: 'getToken', certificate })
    const modulus = /<Modulus>([\s\S]*?)<\/Modulus>/.exec(signed)![1]
    for (const line of modulus.split('\n')) expect(line.length).toBeLessThanOrEqual(64)
  })

  test('rejects a different root or a self-closing root', () => {
    const expectParseFailure = (xml: string) => {
      try {
        signRootElement({ xml, rootTag: 'getToken', certificate })
        throw new Error('expected DteError')
      } catch (err) {
        expect(err).toBeInstanceOf(DteError)
        expect((err as DteError).code).toBe('XML_PARSE_FAILED')
      }
    }
    expectParseFailure('<other><getToken/></other>')
    expectParseFailure('<getToken/>')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/xmldsig.test.ts`
Expected: FAIL (`signRootElement` is not exported; `URI="#"` instead of `URI=""`).

- [ ] **Step 3: Implementation**

`src/signature/xmldsig.ts`: in `buildSignedInfo` replace the `uri` line and the first JSDoc sentence:

```ts
/**
 * EN: Builds `SignedInfo`. `referenceId` is the `ID` of the signed element, or `''` for a whole-document reference
 * (`URI=""`). `expandTags` renders empty elements as `<X></X>` (the canonical form that is signed); `includeXsi`
 * adds `xmlns:xsi`, which the canonical form inherits from the root anyway.
 * ES: Arma `SignedInfo`. `referenceId` es el `ID` del elemento firmado, o `''` para referenciar el documento completo
 * (`URI=""`). `expandTags` escribe los elementos vacíos como `<X></X>` (la forma canónica que se firma); `includeXsi`
 * agrega `xmlns:xsi`, que la forma canónica hereda del raíz de todos modos.
 */
```

```ts
  const uri = referenceId === '' || referenceId.startsWith('#') ? referenceId : `#${referenceId}`
```

Append after `signEnveloped`:

```ts
/**
 * EN: Input of `signRootElement`.
 * ES: Entrada de `signRootElement`.
 */
export type SignRootElementInput = {
  /** EN: Unsigned XML whose root element is signed as a whole (`Reference URI=""`). ES: XML sin firma cuyo elemento raíz se firma completo (`Reference URI=""`). */
  readonly xml: string
  /** EN: Expected root tag (`getToken`). ES: Etiqueta raíz esperada (`getToken`). */
  readonly rootTag: string
  /** EN: Signing certificate. ES: Certificado firmante. */
  readonly certificate: Pick<Certificate, 'privateKeyPem' | 'publicKey' | 'certificateBase64'>
}

/**
 * EN: Signs the whole root element with an enveloped XMLDSig signature (`Reference URI=""`, enveloped-signature
 * transform, C14N 1.0, RSA-SHA1) and inserts `Signature` right before the closing root tag. `SignedInfo` carries only
 * the XMLDSig namespace, when signed and when stored, because the roots signed this way (`getToken`) declare no
 * `xmlns:xsi`. This is the signature the SII token services verify.
 * ES: Firma el elemento raíz completo con una firma XMLDSig envuelta (`Reference URI=""`, transformada
 * enveloped-signature, C14N 1.0, RSA-SHA1) e inserta `Signature` justo antes del cierre del raíz. `SignedInfo` lleva
 * solo el namespace XMLDSig, al firmar y al guardar, porque los raíces que se firman así (`getToken`) no declaran
 * `xmlns:xsi`. Es la firma que verifican los servicios de token del SII.
 * @throws {DteError} EN: `XML_PARSE_FAILED` when the root is not `rootTag` or has no closing tag. ES: `XML_PARSE_FAILED` si el raíz no es `rootTag` o no tiene etiqueta de cierre.
 */
export const signRootElement = ({
  xml,
  rootTag,
  certificate,
}: SignRootElementInput): { readonly xml: string; readonly signature: XmlSignature } => {
  const root = parseXmlDom(xml).documentElement
  if (root.tagName !== rootTag) throw new DteError('XML_PARSE_FAILED', { field: rootTag, reason: `root is ${root.tagName}` })
  const closing = `</${rootTag}>`
  const at = xml.lastIndexOf(closing)
  if (at === -1) throw new DteError('XML_PARSE_FAILED', { field: rootTag, reason: `expected ${closing}` })
  const digestValue = sha1Base64(canonicalizeElement(root), 'utf8')
  const signedInfoToSign = buildSignedInfo('', digestValue, { expandTags: true, includeXsi: false })
  const signedInfoToStore = buildSignedInfo('', digestValue, { expandTags: false, includeXsi: false })
  const signatureValue = rsaSha1SignBase64(certificate.privateKeyPem, signedInfoToSign, 'utf8')
  const signatureXml = buildSignatureXml(signedInfoToStore, wrapBase64(signatureValue), {
    modulus: wrapBase64(certificate.publicKey.modulus),
    exponent: certificate.publicKey.exponent,
    certificate: wrapBase64(certificate.certificateBase64),
  })
  return {
    xml: `${xml.slice(0, at)}${signatureXml}${xml.slice(at)}`,
    signature: { digestValue, signatureValue },
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest tests/xmldsig.test.ts tests/document.test.ts tests/envelope.test.ts`
Expected: PASS (the phase 1 signatures are unchanged: `'X'` still becomes `#X`).

- [ ] **Step 5: Commit**

```bash
git add src/signature/xmldsig.ts tests/xmldsig.test.ts
git commit -m "feat: whole-document XMLDSig signature (URI=\"\") for the SII seed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Logger, token cache and retry policy (`src/sii/logger.ts`, `src/sii/token-cache.ts`, `src/sii/retry.ts`)

**Files:**
- Create: `src/sii/logger.ts`, `src/sii/token-cache.ts`, `src/sii/retry.ts`
- Test: `tests/sii/logger.test.ts`, `tests/sii/token-cache.test.ts`, `tests/sii/retry.test.ts`

- [ ] **Step 1: Failing tests**

`tests/sii/logger.test.ts`:

```ts
import { silentLogger } from '../../src/sii/logger'

describe('silentLogger', () => {
  test.each(['debug', 'info', 'warn', 'error'] as const)('%s swallows the call', (level) => {
    expect(silentLogger[level]('message', { operation: 'getSeed' })).toBeUndefined()
    expect(silentLogger[level]('message')).toBeUndefined()
  })
})
```

`tests/sii/token-cache.test.ts`:

```ts
import { loadCertificateFromPem } from '../../src/certificate/pem'
import { certificateFingerprint, createMemoryTokenCache, tokenCacheKey } from '../../src/sii/token-cache'
import { fixtureText, FIXED_NOW } from '../support/fixtures'

const certificate = loadCertificateFromPem(
  { privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') },
  { now: FIXED_NOW },
)

describe('tokenCacheKey', () => {
  test('fingerprint is the SHA-1 of the DER certificate, in hex', () => {
    expect(certificateFingerprint(certificate)).toMatch(/^[0-9a-f]{40}$/)
    expect(certificateFingerprint(certificate)).toBe(certificateFingerprint({ certificateBase64: certificate.certificateBase64 }))
  })

  test('key separates environment, channel and certificate, and carries no RUT', () => {
    const key = tokenCacheKey('certification', 'soap', certificate)
    expect(key).toBe(`certification:soap:${certificateFingerprint(certificate)}`)
    expect(key).not.toBe(tokenCacheKey('production', 'soap', certificate))
    expect(key).not.toBe(tokenCacheKey('certification', 'rest', certificate))
    expect(key).not.toContain('76543210')
  })
})

describe('createMemoryTokenCache', () => {
  test('get, set and delete', async () => {
    const cache = createMemoryTokenCache()
    expect(await cache.get('k')).toBeNull()
    await cache.set('k', { token: 'ABC', expiresAt: 1000 })
    expect(await cache.get('k')).toEqual({ token: 'ABC', expiresAt: 1000 })
    await cache.delete('k')
    expect(await cache.get('k')).toBeNull()
  })

  test('two caches do not share entries', async () => {
    const a = createMemoryTokenCache()
    const b = createMemoryTokenCache()
    await a.set('k', { token: 'A', expiresAt: 1 })
    expect(await b.get('k')).toBeNull()
  })
})
```

`tests/sii/retry.test.ts`:

```ts
import { DteError } from '../../src/errors'
import {
  DEFAULT_RETRY_POLICY,
  isRetryableError,
  mergeRetryPolicy,
  retryDelayMs,
  withRetry,
  type RetryPolicy,
} from '../../src/sii/retry'

const sleeps = (): { readonly calls: number[]; readonly sleep: (ms: number) => Promise<void> } => {
  const calls: number[] = []
  return {
    calls,
    sleep: async (ms) => {
      calls.push(ms)
    },
  }
}
const fast: RetryPolicy = { ...DEFAULT_RETRY_POLICY, maxAttempts: 3, initialDelayMs: 100, maxDelayMs: 250, jitterRatio: 0 }
const failing =
  (errors: readonly unknown[], result = 'ok') =>
  async (attempt: number): Promise<string> => {
    const error = errors[attempt - 1]
    if (error !== undefined) throw error
    return result
  }

describe('isRetryableError', () => {
  test.each([
    [new DteError('TRANSPORT_FAILED'), true],
    [new DteError('REQUEST_TIMEOUT'), true],
    [new DteError('SII_RESPONSE_INVALID'), true],
    [new DteError('SII_QUERY_ERROR'), true],
    [new DteError('SII_HTTP_ERROR', { httpStatus: 503 }), true],
    [new DteError('SII_HTTP_ERROR', { httpStatus: 429 }), true],
    [new DteError('SII_HTTP_ERROR', { httpStatus: 405 }), true],
    [new DteError('SII_HTTP_ERROR', { httpStatus: 400 }), false],
    [new DteError('SII_UPLOAD_REJECTED', { status: '9' }), true],
    [new DteError('SII_UPLOAD_REJECTED', { status: '7' }), false],
    [new DteError('SII_TOKEN_INVALID'), false],
    [new DteError('REQUEST_ABORTED'), false],
    [new Error('plain'), false],
    [null, false],
  ])('%p → %s', (error, expected) => {
    expect(isRetryableError(error)).toBe(expected)
  })
})

describe('retryDelayMs', () => {
  test('exponential backoff capped at maxDelayMs, jitter around the base', () => {
    const half = () => 0.5
    expect(retryDelayMs(DEFAULT_RETRY_POLICY, 1, half)).toBe(2000)
    expect(retryDelayMs(DEFAULT_RETRY_POLICY, 2, half)).toBe(3600)
    expect(retryDelayMs(DEFAULT_RETRY_POLICY, 3, half)).toBe(6480)
    expect(retryDelayMs(DEFAULT_RETRY_POLICY, 10, half)).toBe(15000)
    expect(retryDelayMs(DEFAULT_RETRY_POLICY, 1, () => 0)).toBe(1600)
    expect(retryDelayMs(DEFAULT_RETRY_POLICY, 1, () => 1)).toBe(2400)
    expect(retryDelayMs(DEFAULT_RETRY_POLICY, 1)).toBeGreaterThanOrEqual(1600)
  })
})

describe('mergeRetryPolicy', () => {
  test('false disables, undefined keeps, partial merges over the base or the defaults', () => {
    expect(mergeRetryPolicy(DEFAULT_RETRY_POLICY, false)).toBe(false)
    expect(mergeRetryPolicy(fast, undefined)).toBe(fast)
    expect(mergeRetryPolicy(fast, { maxAttempts: 9 })).toEqual({ ...fast, maxAttempts: 9 })
    expect(mergeRetryPolicy(false, { maxAttempts: 2 })).toEqual({ ...DEFAULT_RETRY_POLICY, maxAttempts: 2 })
  })
})

describe('withRetry', () => {
  test('returns the first successful result without sleeping', async () => {
    const s = sleeps()
    expect(await withRetry(fast, failing([]), { sleep: s.sleep })).toBe('ok')
    expect(s.calls).toEqual([])
  })

  test('retries retryable errors with the policy delays and reports attempts', async () => {
    const s = sleeps()
    const seen: number[] = []
    const result = await withRetry(fast, failing([new DteError('TRANSPORT_FAILED'), new DteError('SII_HTTP_ERROR', { httpStatus: 503 })]), {
      sleep: s.sleep,
      onRetry: (_error, attempt) => seen.push(attempt),
    })
    expect(result).toBe('ok')
    expect(s.calls).toEqual([100, 180])
    expect(seen).toEqual([1, 2])
  })

  test('gives up after maxAttempts and annotates the error with the attempt count', async () => {
    const s = sleeps()
    const errors = [new DteError('TRANSPORT_FAILED'), new DteError('TRANSPORT_FAILED'), new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' })]
    await expect(withRetry(fast, failing(errors), { sleep: s.sleep })).rejects.toMatchObject({
      code: 'TRANSPORT_FAILED',
      details: { reason: 'ECONNRESET', attempts: 3 },
    })
    expect(s.calls).toEqual([100, 180])
  })

  test('non-retryable DteErrors and plain errors stop at once', async () => {
    const s = sleeps()
    await expect(withRetry(fast, failing([new DteError('SII_TOKEN_INVALID')]), { sleep: s.sleep })).rejects.toMatchObject({
      code: 'SII_TOKEN_INVALID',
      details: { attempts: 1 },
    })
    const plain = new Error('boom')
    await expect(withRetry(fast, failing([plain]), { sleep: s.sleep })).rejects.toBe(plain)
    expect(s.calls).toEqual([])
  })

  test('policy false means a single attempt', async () => {
    const s = sleeps()
    await expect(withRetry(false, failing([new DteError('TRANSPORT_FAILED')]), { sleep: s.sleep })).rejects.toMatchObject({
      details: { attempts: 1 },
    })
    expect(s.calls).toEqual([])
  })

  test('retryAfterMs from the error wins over the backoff, capped at maxDelayMs', async () => {
    const s = sleeps()
    const errors = [new DteError('SII_HTTP_ERROR', { httpStatus: 405, retryAfterMs: 50 }), new DteError('SII_HTTP_ERROR', { httpStatus: 405, retryAfterMs: 9000 })]
    expect(await withRetry(fast, failing(errors), { sleep: s.sleep })).toBe('ok')
    expect(s.calls).toEqual([50, 250])
  })

  test('custom retryOn on the call or on the policy', async () => {
    const s = sleeps()
    const onlyTimeouts = (error: DteError) => error.code === 'REQUEST_TIMEOUT'
    await expect(withRetry(fast, failing([new DteError('TRANSPORT_FAILED')]), { sleep: s.sleep, retryOn: onlyTimeouts })).rejects.toMatchObject({ details: { attempts: 1 } })
    expect(await withRetry({ ...fast, retryOn: onlyTimeouts }, failing([new DteError('REQUEST_TIMEOUT')]), { sleep: s.sleep })).toBe('ok')
    expect(s.calls).toEqual([100])
  })

  test('jitter uses the injected random', async () => {
    const s = sleeps()
    const jittery = { ...fast, jitterRatio: 0.5 }
    expect(await withRetry(jittery, failing([new DteError('TRANSPORT_FAILED')]), { sleep: s.sleep, random: () => 1 })).toBe('ok')
    expect(s.calls).toEqual([150])
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest tests/sii`
Expected: FAIL, `Cannot find module` for the three modules.

- [ ] **Step 3: Implementation**

`src/sii/logger.ts`:

```ts
/**
 * EN: Structured context attached to a log line. May carry RUTs or codes; the message itself never does.
 * ES: Contexto estructurado de una línea de log. Puede traer RUT o códigos; el mensaje nunca.
 */
export type LogContext = Readonly<Record<string, unknown>>

/**
 * EN: One log level.
 * ES: Una función de log por nivel.
 */
export type LogFn = (message: string, context?: LogContext) => void

/**
 * EN: Logger port. dte-sdk logs operation names, attempts, HTTP statuses, SII codes and durations; never tokens,
 * XML or RUTs in the message.
 * ES: Puerto de logger. dte-sdk registra operaciones, intentos, estados HTTP, códigos del SII y duraciones; nunca
 * tokens, XML ni RUT en el mensaje.
 */
export type Logger = {
  /** EN: Per-exchange detail. ES: Detalle por intercambio HTTP. */
  readonly debug: LogFn
  /** EN: Operation milestones. ES: Hitos de una operación. */
  readonly info: LogFn
  /** EN: Recoverable problems (a failed capture, a retry). ES: Problemas recuperables (captura fallida, reintento). */
  readonly warn: LogFn
  /** EN: Failures surfaced to the caller. ES: Fallas que llegan al llamador. */
  readonly error: LogFn
}

const noop: LogFn = () => undefined

/**
 * EN: Default logger: discards everything.
 * ES: Logger por defecto: descarta todo.
 */
export const silentLogger: Logger = { debug: noop, info: noop, warn: noop, error: noop }
```

`src/sii/token-cache.ts`:

```ts
import forge from 'node-forge'
import type { Environment } from '../catalogs/codes'
import type { Certificate } from '../certificate/certificate'

/**
 * EN: Authentication channel: `soap` (DTEWS seed/token: `DTEUpload`, `QueryEst*`, WSRECLAMO) or `rest` (receipts API).
 * ES: Canal de autenticación: `soap` (semilla/token DTEWS: `DTEUpload`, `QueryEst*`, WSRECLAMO) o `rest` (API de boletas).
 */
export type TokenChannel = 'soap' | 'rest'

/**
 * EN: A cached token with its expiry instant (epoch milliseconds).
 * ES: Un token en caché con su instante de expiración (milisegundos epoch).
 */
export type CachedToken = {
  /** EN: The SII token. ES: `TOKEN` — El token del SII. */
  readonly token: string
  /** EN: Expiry, epoch ms. ES: Expiración, ms epoch. */
  readonly expiresAt: number
}

/**
 * EN: Token cache port. Implement it over Redis or a file to share tokens between processes.
 * ES: Puerto de caché de tokens. Impleméntalo sobre Redis o un archivo para compartir tokens entre procesos.
 */
export type TokenCache = {
  /** EN: Cached entry or null. ES: Entrada en caché o null. */
  readonly get: (key: string) => Promise<CachedToken | null>
  /** EN: Stores an entry. ES: Guarda una entrada. */
  readonly set: (key: string, value: CachedToken) => Promise<void>
  /** EN: Removes an entry. ES: Elimina una entrada. */
  readonly delete: (key: string) => Promise<void>
}

/**
 * EN: SHA-1 of the DER certificate, hex. Identifies a certificate without exposing its holder.
 * ES: SHA-1 del certificado DER, en hexadecimal. Identifica un certificado sin exponer a su titular.
 */
export const certificateFingerprint = (certificate: Pick<Certificate, 'certificateBase64'>): string => {
  const md = forge.md.sha1.create()
  md.update(forge.util.decode64(certificate.certificateBase64))
  return md.digest().toHex()
}

/**
 * EN: Cache key `${environment}:${channel}:${fingerprint}`: two companies, two environments or two channels never share a token.
 * ES: Clave de caché `${ambiente}:${canal}:${huella}`: dos empresas, dos ambientes o dos canales nunca comparten token.
 */
export const tokenCacheKey = (
  environment: Environment,
  channel: TokenChannel,
  certificate: Pick<Certificate, 'certificateBase64'>,
): string => `${environment}:${channel}:${certificateFingerprint(certificate)}`

/**
 * EN: In-memory token cache (per process).
 * ES: Caché de tokens en memoria (por proceso).
 */
export const createMemoryTokenCache = (): TokenCache => {
  const store = new Map<string, CachedToken>()
  return {
    get: async (key) => store.get(key) ?? null,
    set: async (key, value) => {
      store.set(key, value)
    },
    delete: async (key) => {
      store.delete(key)
    },
  }
}
```

`src/sii/retry.ts`:

```ts
import { DteError, isDteError } from '../errors'

/**
 * EN: Retry policy: exponential backoff with jitter.
 * ES: Política de reintentos: backoff exponencial con jitter.
 */
export type RetryPolicy = {
  /** EN: Total attempts including the first (1 = no retry). ES: Intentos totales incluido el primero (1 = sin reintento). */
  readonly maxAttempts: number
  /** EN: Delay before the second attempt, ms. ES: Espera antes del segundo intento, ms. */
  readonly initialDelayMs: number
  /** EN: Cap for any delay, ms. ES: Tope de cualquier espera, ms. */
  readonly maxDelayMs: number
  /** EN: Growth factor between attempts. ES: Factor de crecimiento entre intentos. */
  readonly backoffMultiplier: number
  /** EN: Jitter as a fraction of the delay (0.2 → ±20 %). ES: Jitter como fracción de la espera (0,2 → ±20 %). */
  readonly jitterRatio: number
  /** EN: Which errors to retry; defaults to `isRetryableError`. ES: Qué errores reintentar; por defecto `isRetryableError`. */
  readonly retryOn?: (error: DteError) => boolean
}

/**
 * EN: Defaults measured against the SII: 6 attempts, 2 s growing ×1.8, capped at 15 s, ±20 % jitter.
 * ES: Valores por defecto medidos contra el SII: 6 intentos, 2 s creciendo ×1,8, tope 15 s, jitter ±20 %.
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 6,
  initialDelayMs: 2000,
  maxDelayMs: 15000,
  backoffMultiplier: 1.8,
  jitterRatio: 0.2,
}

/**
 * EN: Resolves a per-client or per-call override: `false` disables retries, `undefined` keeps the base, a partial
 * policy merges over the base (or over the defaults when the base is `false`).
 * ES: Resuelve una sobreescritura por cliente o por llamada: `false` desactiva, `undefined` conserva la base, una
 * política parcial se mezcla sobre la base (o sobre los valores por defecto si la base es `false`).
 */
export const mergeRetryPolicy = (
  base: RetryPolicy | false,
  override?: Partial<RetryPolicy> | false,
): RetryPolicy | false => {
  if (override === false) return false
  if (override === undefined) return base
  return { ...(base === false ? DEFAULT_RETRY_POLICY : base), ...override }
}

const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  'TRANSPORT_FAILED',
  'REQUEST_TIMEOUT',
  'SII_RESPONSE_INVALID',
  'SII_QUERY_ERROR',
])

const isRetryableHttpStatus = (status: number): boolean => status === 429 || status === 405 || status >= 500

/**
 * EN: True for errors worth retrying: transport failures, timeouts, unreadable SII pages, `QueryEst*` query errors,
 * HTTP 429/405/5xx and the "system blocked" upload status.
 * ES: True para errores que conviene reintentar: fallas de transporte, timeouts, páginas ilegibles del SII, errores de
 * consulta de `QueryEst*`, HTTP 429/405/5xx y el estado de subida "sistema bloqueado".
 */
export const isRetryableError = (error: unknown): boolean => {
  if (!isDteError(error)) return false
  if (RETRYABLE_CODES.has(error.code)) return true
  if (error.code === 'SII_HTTP_ERROR') return isRetryableHttpStatus(Number(error.details.httpStatus))
  if (error.code === 'SII_UPLOAD_REJECTED') return error.details.status === '9'
  return false
}

/**
 * EN: Delay before attempt `attempt + 1`: `min(max, initial × multiplier^(attempt − 1))` with symmetric jitter.
 * ES: Espera antes del intento `attempt + 1`: `min(max, inicial × factor^(attempt − 1))` con jitter simétrico.
 */
export const retryDelayMs = (policy: RetryPolicy, attempt: number, random: () => number = Math.random): number => {
  const base = Math.min(policy.maxDelayMs, policy.initialDelayMs * policy.backoffMultiplier ** (attempt - 1))
  const jitter = base * policy.jitterRatio * (2 * random() - 1)
  return Math.max(0, Math.round(base + jitter))
}

/**
 * EN: Runtime hooks of `withRetry`: the injectable `sleep`, the caller's `signal`, the jitter `random`, a per-call
 * `retryOn` and an `onRetry` observer.
 * ES: Ganchos de `withRetry`: el `sleep` inyectable, el `signal` del llamador, el `random` del jitter, un `retryOn` por
 * llamada y un observador `onRetry`.
 */
export type RetryOptions = {
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>
  readonly signal?: AbortSignal
  readonly random?: () => number
  readonly retryOn?: (error: DteError) => boolean
  readonly onRetry?: (error: DteError, attempt: number, delayMs: number) => void
}

const withAttempts = (error: DteError, attempts: number): DteError =>
  new DteError(error.code, { ...error.details, attempts })

const retryAfterOf = (error: DteError): number | null =>
  typeof error.details.retryAfterMs === 'number' ? error.details.retryAfterMs : null

/**
 * EN: Runs `run(attempt)` until it succeeds, a non-retryable error, `maxAttempts` or the signal. The thrown
 * `DteError` carries `details.attempts`; `details.retryAfterMs` on an error (SII `X-Retry-After`) overrides the
 * computed delay, still capped at `maxDelayMs`. Non-`DteError` values are rethrown untouched.
 * ES: Ejecuta `run(attempt)` hasta que tenga éxito, un error no reintentable, `maxAttempts` o el signal. El `DteError`
 * lanzado trae `details.attempts`; `details.retryAfterMs` en un error (`X-Retry-After` del SII) reemplaza la espera
 * calculada, siempre con tope `maxDelayMs`. Los valores que no son `DteError` se relanzan tal cual.
 */
export const withRetry = async <T>(
  policy: RetryPolicy | false,
  run: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> => {
  const shouldRetry: (error: DteError) => boolean =
    options.retryOn ?? (policy === false ? isRetryableError : (policy.retryOn ?? isRetryableError))
  const attempt = async (n: number): Promise<T> => {
    try {
      return await run(n)
    } catch (error) {
      if (!isDteError(error)) throw error
      if (policy === false || n >= policy.maxAttempts || !shouldRetry(error)) throw withAttempts(error, n)
      const delayMs = Math.min(policy.maxDelayMs, retryAfterOf(error) ?? retryDelayMs(policy, n, options.random))
      options.onRetry?.(error, n, delayMs)
      await options.sleep(delayMs, options.signal)
      return attempt(n + 1)
    }
  }
  return attempt(1)
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx jest tests/sii`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sii/logger.ts src/sii/token-cache.ts src/sii/retry.ts tests/sii/logger.test.ts tests/sii/token-cache.test.ts tests/sii/retry.test.ts
git commit -m "feat: logger port, token cache port and retry policy for the SII client

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 6: Transport port, `fetch` adapter and the fake SII (`src/sii/transport.ts`, `tests/support/fake-sii.ts`)

**Files:**
- Create: `src/sii/transport.ts`, `tests/support/fake-sii.ts`
- Test: `tests/sii/transport.test.ts`, `tests/sii/fake-sii.test.ts`

- [ ] **Step 1: Failing tests**

`tests/sii/transport.test.ts`:

```ts
import { DteError } from '../../src/errors'
import {
  createFetchTransport,
  createRequestSignal,
  decodeBody,
  encodeUtf8,
  mapTransportError,
  type FetchLike,
  type HttpRequest,
} from '../../src/sii/transport'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const request = (overrides: Partial<HttpRequest> = {}): HttpRequest => ({
  method: 'POST',
  url: 'https://maullin.sii.cl/DTEWS/CrSeed.jws',
  headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
  body: encodeUtf8('<x/>'),
  timeoutMs: 1000,
  ...overrides,
})
const response = (status: number, text: string, headers: Record<string, string> = {}) => ({
  status,
  headers: new Headers(headers),
  arrayBuffer: async () => new TextEncoder().encode(text).buffer as ArrayBuffer,
})
const reply =
  (status: number, text: string, headers: Record<string, string> = {}): FetchLike =>
  async () =>
    response(status, text, headers)
const failWith =
  (error: unknown): FetchLike =>
  async () => {
    throw error
  }
const expectCode = async (promise: Promise<unknown>, code: string, reason?: string) => {
  try {
    await promise
    throw new Error('expected DteError')
  } catch (err) {
    expect(err).toBeInstanceOf(DteError)
    expect((err as DteError).code).toBe(code)
    if (reason !== undefined) expect((err as DteError).details.reason).toBe(reason)
  }
}

describe('decodeBody / encodeUtf8', () => {
  test('latin1 maps one byte per char, utf8 decodes multi-byte sequences', () => {
    expect(decodeBody(new Uint8Array([0xe1, 0x41]), 'latin1')).toBe('áA')
    expect(decodeBody(new Uint8Array([0xc3, 0xa1, 0x41]), 'utf8')).toBe('áA')
    expect(Array.from(encodeUtf8('á'))).toEqual([0xc3, 0xa1])
  })
})

describe('createRequestSignal', () => {
  test('aborts after the timeout and reports it', async () => {
    const guard = createRequestSignal(10)
    expect(guard.signal.aborted).toBe(false)
    await wait(30)
    expect(guard.signal.aborted).toBe(true)
    expect(guard.timedOut()).toBe(true)
    guard.cleanup()
  })

  test('follows the caller signal, before and after creation', async () => {
    const pre = new AbortController()
    pre.abort()
    expect(createRequestSignal(1000, pre.signal).signal.aborted).toBe(true)
    const later = new AbortController()
    const guard = createRequestSignal(1000, later.signal)
    later.abort()
    expect(guard.signal.aborted).toBe(true)
    expect(guard.timedOut()).toBe(false)
    guard.cleanup()
  })

  test('cleanup stops the timer', async () => {
    const guard = createRequestSignal(10)
    guard.cleanup()
    await wait(30)
    expect(guard.signal.aborted).toBe(false)
  })
})

describe('mapTransportError', () => {
  test.each([
    [new Error('x'), true, false, 'REQUEST_TIMEOUT', 'x'],
    [new Error('x'), false, true, 'REQUEST_ABORTED', undefined],
    [Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } }), false, false, 'TRANSPORT_FAILED', 'ECONNREFUSED'],
    [Object.assign(new Error('read'), { code: 'ECONNRESET' }), false, false, 'TRANSPORT_FAILED', 'ECONNRESET'],
    [Object.assign(new Error('fetch failed'), { cause: { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' } }), false, false, 'TRANSPORT_TLS', 'DEPTH_ZERO_SELF_SIGNED_CERT'],
    [Object.assign(new Error('fetch failed'), { cause: { code: 'ERR_TLS_CERT_ALTNAME_INVALID' } }), false, false, 'TRANSPORT_TLS', 'ERR_TLS_CERT_ALTNAME_INVALID'],
    [Object.assign(new Error('fetch failed'), { cause: new Error('unable to verify the first certificate') }), false, false, 'TRANSPORT_TLS', 'fetch failed'],
    ['string failure', false, false, 'TRANSPORT_FAILED', 'string failure'],
  ])('%p (timedOut=%s, aborted=%s) → %s', (error, timedOut, aborted, code, reason) => {
    const mapped = mapTransportError(error, timedOut, aborted)
    expect(mapped.code).toBe(code)
    if (reason !== undefined) expect(mapped.details.reason).toBe(reason)
  })

  test('a DteError passes through untouched', () => {
    const original = new DteError('TRANSPORT_FAILED', { reason: 'kept' })
    expect(mapTransportError(original, true, true)).toBe(original)
  })
})

describe('createFetchTransport', () => {
  test('maps the request and the response, lower-casing header names', async () => {
    const calls: unknown[] = []
    const fetchFn: FetchLike = async (url, init) => {
      calls.push({ url, method: init.method, headers: init.headers, body: Array.from(init.body ?? []), redirect: init.redirect, hasSignal: init.signal instanceof AbortSignal })
      return response(200, '<r>é</r>', { 'Content-Type': 'text/xml', 'Set-Cookie': 'TOKEN=abc' })
    }
    const transport = createFetchTransport({ fetch: fetchFn })
    const response = await transport(request())
    expect(calls).toEqual([
      {
        url: 'https://maullin.sii.cl/DTEWS/CrSeed.jws',
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
        body: Array.from(encodeUtf8('<x/>')),
        redirect: 'manual',
        hasSignal: true,
      },
    ])
    expect(response.status).toBe(200)
    expect(response.headers).toEqual({ 'content-type': 'text/xml', 'set-cookie': 'TOKEN=abc' })
    expect(decodeBody(response.body, 'utf8')).toBe('<r>é</r>')
  })

  test('GET requests carry no body', async () => {
    const bodies: unknown[] = []
    const fetchFn: FetchLike = async (_url, init) => {
      bodies.push(init.body)
      return response(200, '{}')
    }
    await createFetchTransport({ fetch: fetchFn })(request({ method: 'GET', body: undefined }))
    expect(bodies).toEqual([undefined])
  })

  test('uses globalThis.fetch by default and fails clearly when it is missing', async () => {
    const original = globalThis.fetch
    Object.defineProperty(globalThis, 'fetch', { value: reply(204, ''), configurable: true, writable: true })
    try {
      expect((await createFetchTransport()(request())).status).toBe(204)
      Object.defineProperty(globalThis, 'fetch', { value: undefined, configurable: true, writable: true })
      await expectCode(createFetchTransport()(request()), 'TRANSPORT_UNAVAILABLE')
    } finally {
      Object.defineProperty(globalThis, 'fetch', { value: original, configurable: true, writable: true })
    }
  })

  test('timeout and caller abort', async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      })
    await expectCode(createFetchTransport({ fetch: hang })(request({ timeoutMs: 10 })), 'REQUEST_TIMEOUT')
    const controller = new AbortController()
    const pending = createFetchTransport({ fetch: hang })(request({ signal: controller.signal }))
    controller.abort()
    await expectCode(pending, 'REQUEST_ABORTED')
  })

  test('network and TLS failures are classified', async () => {
    await expectCode(
      createFetchTransport({ fetch: failWith(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } })) })(request()),
      'TRANSPORT_FAILED',
      'ENOTFOUND',
    )
    await expectCode(
      createFetchTransport({ fetch: failWith(Object.assign(new TypeError('fetch failed'), { cause: { code: 'CERT_HAS_EXPIRED' } })) })(request()),
      'TRANSPORT_TLS',
      'CERT_HAS_EXPIRED',
    )
  })
})
```

`tests/sii/fake-sii.test.ts`:

```ts
import { DteError } from '../../src/errors'
import { decodeLatin1, encodeLatin1 } from '../../src/text/latin1'
import { createFakeSii, parseMultipart } from '../support/fake-sii'

const boundary = '----WebKitFormBoundaryabc123'
const multipart = [
  `--${boundary}`,
  'Content-Disposition: form-data; name="rutSender"',
  '',
  '76543210',
  `--${boundary}`,
  'Content-Disposition: form-data; name="archivo"; filename="EnvioDTE.xml"',
  'Content-Type: text/xml',
  '',
  '<EnvioDTE>á</EnvioDTE>',
  `--${boundary}--`,
  '',
].join('\r\n')

describe('fake SII', () => {
  test('matches exact, prefix and regex routes and records decoded requests', async () => {
    const sii = createFakeSii([
      { method: 'GET', url: 'https://api.test/exact', reply: { status: 201, body: 'one' } },
      { url: 'https://api.test/prefix/*', reply: { body: 'two', headers: { 'X-Test': 'yes' } } },
      { url: /regex$/, reply: (request) => ({ body: `three:${request.text}` }) },
    ])
    const a = await sii.transport({ method: 'GET', url: 'https://api.test/exact', headers: {}, timeoutMs: 1 })
    const b = await sii.transport({ method: 'POST', url: 'https://api.test/prefix/anything', headers: {}, timeoutMs: 1 })
    const c = await sii.transport({ method: 'POST', url: 'https://x/regex', headers: {}, body: encodeLatin1('ping'), timeoutMs: 1 })
    expect([a.status, decodeLatin1(a.body)]).toEqual([201, 'one'])
    expect([b.status, b.headers, decodeLatin1(b.body)]).toEqual([200, { 'x-test': 'yes' }, 'two'])
    expect(decodeLatin1(c.body)).toBe('three:ping')
    expect(sii.requests.map((r) => r.url)).toEqual(['https://api.test/exact', 'https://api.test/prefix/anything', 'https://x/regex'])
  })

  test('sequences are consumed in order, errors are thrown, unknown routes fail the test', async () => {
    const sii = createFakeSii([
      { url: 'https://api.test/seq', reply: [{ status: 503, body: 'down' }, new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' }), { body: 'up' }] },
    ])
    const call = () => sii.transport({ method: 'GET', url: 'https://api.test/seq', headers: {}, timeoutMs: 1 })
    expect((await call()).status).toBe(503)
    await expect(call()).rejects.toMatchObject({ code: 'TRANSPORT_FAILED' })
    expect(decodeLatin1((await call()).body)).toBe('up')
    expect(sii.pending()).toBe(0)
    await expect(call()).rejects.toThrow('no replies left')
    await expect(sii.transport({ method: 'GET', url: 'https://api.test/none', headers: {}, timeoutMs: 1 })).rejects.toThrow('no route')
  })

  test('encodes utf8 or latin1 replies as asked', async () => {
    const sii = createFakeSii([
      { url: 'https://api.test/latin1', reply: { body: 'á' } },
      { url: 'https://api.test/utf8', reply: { body: 'á', encoding: 'utf8' } },
      { url: 'https://api.test/bytes', reply: { body: new Uint8Array([1, 2]) } },
    ])
    const get = (path: string) => sii.transport({ method: 'GET', url: `https://api.test/${path}`, headers: {}, timeoutMs: 1 })
    expect(Array.from((await get('latin1')).body)).toEqual([0xe1])
    expect(Array.from((await get('utf8')).body)).toEqual([0xc3, 0xa1])
    expect(Array.from((await get('bytes')).body)).toEqual([1, 2])
  })

  test('parses multipart bodies into parts', async () => {
    const parts = parseMultipart(multipart, `multipart/form-data; boundary=${boundary}`)
    expect(parts).toEqual([
      { name: 'rutSender', fileName: null, contentType: null, value: '76543210' },
      { name: 'archivo', fileName: 'EnvioDTE.xml', contentType: 'text/xml', value: '<EnvioDTE>á</EnvioDTE>' },
    ])
    expect(parseMultipart(multipart, 'text/plain')).toEqual([])
    const sii = createFakeSii([{ url: 'https://api.test/upload', reply: { body: 'ok' } }])
    await sii.transport({
      method: 'POST',
      url: 'https://api.test/upload',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: encodeLatin1(multipart),
      timeoutMs: 1,
    })
    expect(sii.requests[0].parts.map((p) => p.name)).toEqual(['rutSender', 'archivo'])
    expect(sii.requests[0].headers['content-type']).toBe(`multipart/form-data; boundary=${boundary}`)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest tests/sii/transport.test.ts tests/sii/fake-sii.test.ts`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 3: Implementation**

`src/sii/transport.ts`:

```ts
import { DteError, errorMessage, isDteError } from '../errors'
import { decodeLatin1 } from '../text/latin1'

/**
 * EN: HTTP methods the SII services use.
 * ES: Métodos HTTP que usan los servicios del SII.
 */
export type HttpMethod = 'GET' | 'POST'

/**
 * EN: One HTTP request as the client hands it to the transport: bytes, never text.
 * ES: Una petición HTTP tal como el cliente la entrega al transporte: bytes, nunca texto.
 */
export type HttpRequest = {
  readonly method: HttpMethod
  readonly url: string
  /** EN: Header names as the SII expects them (`User-Agent`, `Cookie`…). ES: Cabeceras tal como las espera el SII. */
  readonly headers: Readonly<Record<string, string>>
  /** EN: Body bytes (POST only). ES: Bytes del cuerpo (solo POST). */
  readonly body?: Uint8Array
  /** EN: Per-request timeout, ms. ES: Timeout de la petición, ms. */
  readonly timeoutMs: number
  /** EN: Caller cancellation. ES: Cancelación del llamador. */
  readonly signal?: AbortSignal
}

/**
 * EN: One HTTP response: status, lower-cased header names and body bytes. Any status is a response; only
 * network, TLS, timeout and abort failures are thrown.
 * ES: Una respuesta HTTP: estado, cabeceras en minúsculas y bytes del cuerpo. Cualquier estado es una respuesta; solo
 * las fallas de red, TLS, timeout y cancelación se lanzan.
 */
export type HttpResponse = {
  readonly status: number
  /** EN: Lower-cased names; repeated headers joined with `, `. ES: Nombres en minúsculas; cabeceras repetidas unidas con `, `. */
  readonly headers: Readonly<Record<string, string>>
  readonly body: Uint8Array
}

/**
 * EN: Transport port: `fetch` by default (`createFetchTransport`), Node `https` as an adapter
 * (`createNodeHttpsTransport`), or anything the consumer injects (tests use a route-based fake).
 * ES: Puerto de transporte: `fetch` por defecto (`createFetchTransport`), `https` de Node como adaptador
 * (`createNodeHttpsTransport`), o lo que inyecte el consumidor (los tests usan un falso por rutas).
 */
export type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>

/**
 * EN: Charset of a body: `latin1` for DTEWS SOAP and the `DTEUpload` CGI, `utf8` for the REST API and WSRECLAMO.
 * ES: Charset de un cuerpo: `latin1` para SOAP DTEWS y el CGI `DTEUpload`, `utf8` para la API REST y WSRECLAMO.
 */
export type BodyEncoding = 'latin1' | 'utf8'

/**
 * EN: Decodes response bytes with the charset of the channel; never guesses.
 * ES: Decodifica los bytes de una respuesta con el charset del canal; nunca adivina.
 */
export const decodeBody = (bytes: Uint8Array, encoding: BodyEncoding): string =>
  encoding === 'latin1' ? decodeLatin1(bytes) : new TextDecoder('utf-8').decode(bytes)

/**
 * EN: UTF-8 bytes of a text (REST and WSRECLAMO bodies).
 * ES: Bytes UTF-8 de un texto (cuerpos REST y WSRECLAMO).
 */
export const encodeUtf8 = (text: string): Uint8Array => new TextEncoder().encode(text)

/**
 * EN: An abort signal that fires on the timeout or when the caller's signal fires, and remembers which one it was.
 * ES: Un signal que se dispara al vencer el timeout o cuando se dispara el del llamador, y recuerda cuál fue.
 */
export type RequestSignal = {
  readonly signal: AbortSignal
  readonly timedOut: () => boolean
  readonly cleanup: () => void
}

/**
 * EN: Merges the timeout and the caller's signal (manual merge: `AbortSignal.any` needs Node 20.3).
 * ES: Combina el timeout y el signal del llamador (combinación manual: `AbortSignal.any` exige Node 20.3).
 */
export const createRequestSignal = (timeoutMs: number, signal?: AbortSignal): RequestSignal => {
  const controller = new AbortController()
  const state = { timedOut: false }
  const timer = setTimeout(() => {
    state.timedOut = true
    controller.abort()
  }, timeoutMs)
  const onAbort = (): void => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', onAbort, { once: true })
  return {
    signal: controller.signal,
    timedOut: () => state.timedOut,
    cleanup: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

const TLS_CODE = /^(ERR_TLS_|ERR_OSSL_|ERR_SSL_|CERT_|UNABLE_TO_|SELF_SIGNED_|DEPTH_ZERO_|HOSTNAME_MISMATCH)/

const errorCode = (error: unknown): string | null => {
  const direct = (error as { code?: unknown } | null)?.code
  if (typeof direct === 'string') return direct
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause?.code
  return typeof cause === 'string' ? cause : null
}

/**
 * EN: Classifies a failure thrown by `fetch` or `node:https` into `REQUEST_TIMEOUT`, `REQUEST_ABORTED`,
 * `TRANSPORT_TLS` or `TRANSPORT_FAILED`; a `DteError` passes through. `details.reason` is the OS/OpenSSL code when
 * there is one, so the operator sees `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` instead of a generic failure.
 * ES: Clasifica una falla lanzada por `fetch` o `node:https` en `REQUEST_TIMEOUT`, `REQUEST_ABORTED`, `TRANSPORT_TLS` o
 * `TRANSPORT_FAILED`; un `DteError` pasa tal cual. `details.reason` es el código del SO/OpenSSL cuando lo hay, así el
 * operador ve `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` en vez de una falla genérica.
 */
export const mapTransportError = (error: unknown, timedOut: boolean, aborted: boolean): DteError => {
  if (isDteError(error)) return error
  if (timedOut) return new DteError('REQUEST_TIMEOUT', { reason: errorMessage(error) })
  if (aborted) return new DteError('REQUEST_ABORTED')
  const code = errorCode(error)
  const cause = (error as { cause?: unknown } | null)?.cause
  const text = `${errorMessage(error)} ${cause === undefined ? '' : errorMessage(cause)}`
  const tls = (code !== null && TLS_CODE.test(code)) || /certificate|\btls\b|\bssl\b/i.test(text)
  return new DteError(tls ? 'TRANSPORT_TLS' : 'TRANSPORT_FAILED', { reason: code ?? errorMessage(error) })
}

/**
 * EN: The slice of `fetch` the transport uses, so consumers and tests can inject their own.
 * ES: La porción de `fetch` que usa el transporte, para que consumidores y tests inyecten la suya.
 */
export type FetchLike = (
  url: string,
  init: {
    readonly method: HttpMethod
    readonly headers: Record<string, string>
    readonly body?: Uint8Array<ArrayBuffer>
    readonly signal: AbortSignal
    readonly redirect: 'manual'
  },
) => Promise<{
  readonly status: number
  readonly headers: { forEach(callback: (value: string, key: string) => void): void }
  arrayBuffer(): Promise<ArrayBuffer>
}>

/**
 * EN: Default transport over `globalThis.fetch` (Node ≥ 20, Deno, Bun) or an injected `fetch`. Redirects are not
 * followed: the SII never redirects a well-formed call and following one would hide an error page.
 * ES: Transporte por defecto sobre `globalThis.fetch` (Node ≥ 20, Deno, Bun) o un `fetch` inyectado. No sigue
 * redirecciones: el SII nunca redirige una llamada bien formada y seguirla ocultaría una página de error.
 * @throws {DteError} EN: `TRANSPORT_UNAVAILABLE` when no `fetch` exists, then the codes of `mapTransportError`. ES: `TRANSPORT_UNAVAILABLE` si no hay `fetch`, luego los códigos de `mapTransportError`.
 */
export const createFetchTransport =
  (options: { readonly fetch?: FetchLike } = {}): HttpTransport =>
  async (request) => {
    const fetchFn = options.fetch ?? (globalThis as unknown as { fetch?: FetchLike }).fetch
    if (typeof fetchFn !== 'function')
      throw new DteError('TRANSPORT_UNAVAILABLE', { reason: 'globalThis.fetch is not defined' })
    const guard = createRequestSignal(request.timeoutMs, request.signal)
    try {
      const response = await fetchFn(request.url, {
        method: request.method,
        headers: { ...request.headers },
        body: request.body === undefined ? undefined : new Uint8Array(request.body),
        signal: guard.signal,
        redirect: 'manual',
      })
      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value
      })
      return { status: response.status, headers, body: new Uint8Array(await response.arrayBuffer()) }
    } catch (error) {
      throw mapTransportError(error, guard.timedOut(), request.signal?.aborted ?? false)
    } finally {
      guard.cleanup()
    }
  }
```

`tests/support/fake-sii.ts`:

```ts
import type { HttpRequest, HttpResponse, HttpTransport } from '../../src/sii/transport'
import { decodeLatin1, encodeLatin1 } from '../../src/text/latin1'

/** A scripted reply: a response description, or an Error the transport throws. */
export type FakeReply =
  | {
      readonly status?: number
      readonly headers?: Readonly<Record<string, string>>
      readonly body?: string | Uint8Array
      readonly encoding?: 'latin1' | 'utf8'
    }
  | Error

export type MultipartPart = {
  readonly name: string
  readonly fileName: string | null
  readonly contentType: string | null
  readonly value: string
}

export type RecordedRequest = {
  readonly method: string
  readonly url: string
  /** Lower-cased header names. */
  readonly headers: Readonly<Record<string, string>>
  readonly body: Uint8Array | null
  /** Body decoded as Latin-1 (lossless one char per byte). */
  readonly text: string
  /** Parsed multipart parts when the request is `multipart/form-data`, else `[]`. */
  readonly parts: readonly MultipartPart[]
}

export type FakeRoute = {
  readonly method?: 'GET' | 'POST'
  /** Exact URL, a prefix ending in `*`, or a RegExp. */
  readonly url: string | RegExp
  /** One reply, a function of the request, or a queue consumed in order. */
  readonly reply: FakeReply | FakeReply[] | ((request: RecordedRequest) => FakeReply)
}

export type FakeSii = {
  readonly transport: HttpTransport
  readonly requests: RecordedRequest[]
  /** Replies still queued across every route. */
  readonly pending: () => number
}

export const parseMultipart = (text: string, contentType: string): readonly MultipartPart[] => {
  const boundary = /boundary=(.+)$/.exec(contentType)?.[1]
  if (boundary === undefined) return []
  return text
    .split(`--${boundary}`)
    .slice(1)
    .filter((chunk) => !chunk.startsWith('--'))
    .map((chunk) => {
      const [rawHeaders, ...rest] = chunk.replace(/^\r\n/, '').split('\r\n\r\n')
      return {
        name: /name="([^"]*)"/.exec(rawHeaders)?.[1] ?? '',
        fileName: /filename="([^"]*)"/.exec(rawHeaders)?.[1] ?? null,
        contentType: /Content-Type: ([^\r\n]+)/i.exec(rawHeaders)?.[1] ?? null,
        value: rest.join('\r\n\r\n').replace(/\r\n$/, ''),
      }
    })
}

const lowerKeys = (headers: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))

const record = (request: HttpRequest): RecordedRequest => {
  const headers = lowerKeys(request.headers)
  const text = request.body === undefined ? '' : decodeLatin1(request.body)
  const contentType = headers['content-type'] ?? ''
  return {
    method: request.method,
    url: request.url,
    headers,
    body: request.body ?? null,
    text,
    parts: contentType.startsWith('multipart/form-data') ? parseMultipart(text, contentType) : [],
  }
}

const matches = (route: FakeRoute, request: HttpRequest): boolean => {
  if (route.method !== undefined && route.method !== request.method) return false
  if (route.url instanceof RegExp) return route.url.test(request.url)
  return route.url.endsWith('*') ? request.url.startsWith(route.url.slice(0, -1)) : request.url === route.url
}

const toResponse = (reply: Exclude<FakeReply, Error>): HttpResponse => {
  const body = reply.body ?? ''
  const bytes =
    typeof body === 'string' ? (reply.encoding === 'utf8' ? new TextEncoder().encode(body) : encodeLatin1(body)) : body
  return { status: reply.status ?? 200, headers: lowerKeys(reply.headers ?? {}), body: bytes }
}

/** A fake SII: routes map URLs to scripted replies; every request is recorded for assertions. */
export const createFakeSii = (routes: readonly FakeRoute[]): FakeSii => {
  const requests: RecordedRequest[] = []
  const queues = new Map<FakeRoute, FakeReply[]>()
  const next = (route: FakeRoute, request: RecordedRequest): FakeReply => {
    if (typeof route.reply === 'function') return route.reply(request)
    if (Array.isArray(route.reply)) {
      const queue = queues.get(route) ?? [...route.reply]
      queues.set(route, queue)
      const reply = queue.shift()
      if (reply === undefined) throw new Error(`fake SII: no replies left for ${request.method} ${request.url}`)
      return reply
    }
    return route.reply as FakeReply
  }
  const transport: HttpTransport = async (request) => {
    const recorded = record(request)
    requests.push(recorded)
    const route = routes.find((candidate) => matches(candidate, request))
    if (route === undefined) throw new Error(`fake SII: no route for ${request.method} ${request.url}`)
    const reply = next(route, recorded)
    if (reply instanceof Error) throw reply
    return toResponse(reply)
  }
  return {
    transport,
    requests,
    pending: () => Array.from(queues.values()).reduce((sum, queue) => sum + queue.length, 0),
  }
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx jest tests/sii/transport.test.ts tests/sii/fake-sii.test.ts`
Expected: PASS. (`tests/support/` is outside Jest discovery and coverage, so the fake has no coverage requirement; its own test file keeps it honest.)

- [ ] **Step 5: Commit**

```bash
git add src/sii/transport.ts tests/support/fake-sii.ts tests/sii/transport.test.ts tests/sii/fake-sii.test.ts
git commit -m "feat: byte-based HTTP transport port with a fetch adapter and a fake SII for tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 7: Node `https` transport (`src/sii/lazy.ts`, `src/sii/node-transport.ts`)

**Files:**
- Create: `src/sii/lazy.ts`, `src/sii/node-transport.ts`
- Test: `tests/sii/node-transport.test.ts`

- [ ] **Step 1: Failing test**

`tests/sii/node-transport.test.ts`:

```ts
import { createServer, type Server } from 'node:https'
import type { AddressInfo } from 'node:net'
import { DteError } from '../../src/errors'
import { agentOptions, createNodeHttpsTransport, type NodeModules } from '../../src/sii/node-transport'
import { decodeBody, type HttpRequest } from '../../src/sii/transport'
import { encodeLatin1 } from '../../src/text/latin1'
import { fixtureText } from '../support/fixtures'

const cert = fixtureText('tls-localhost.pem')
const key = fixtureText('tls-localhost.key.pem')
const constants = { SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION: 0x40000, SSL_OP_LEGACY_SERVER_CONNECT: 0x4 }
const loadReal = async (): Promise<NodeModules> => ({
  https: await import('node:https'),
  constants: (await import('node:crypto')).constants,
})

const state: { server: Server | null; base: string } = { server: null, base: '' }

beforeAll(async () => {
  const server = createServer({ key, cert }, (req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      if (req.url === '/latin1') {
        res.writeHead(200, { 'Content-Type': 'text/xml; charset=ISO-8859-1', 'X-Echo-Length': String(body.length) })
        res.end(Buffer.from([0xe1]))
      } else if (req.url === '/echo') {
        res.writeHead(201, { 'X-Method': req.method ?? '', 'X-Cookie': req.headers.cookie ?? '', 'Set-Cookie': ['a=1', 'b=2'] })
        res.end(body)
      } else if (req.url === '/half') {
        res.writeHead(200)
        res.write('partial') // never ends
      } else if (req.url !== '/slow') {
        res.writeHead(404)
        res.end()
      } // '/slow' never answers
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  state.server = server
  state.base = `https://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  state.server?.closeAllConnections()
  await new Promise<void>((resolve) => state.server?.close(() => resolve()))
})

const get = (path: string, overrides: Partial<HttpRequest> = {}): HttpRequest => ({
  method: 'GET',
  url: `${state.base}${path}`,
  headers: {},
  timeoutMs: 2000,
  ...overrides,
})
const expectCode = async (promise: Promise<unknown>, code: string, reason?: string) => {
  try {
    await promise
    throw new Error('expected DteError')
  } catch (err) {
    expect(err).toBeInstanceOf(DteError)
    expect((err as DteError).code).toBe(code)
    if (reason !== undefined) expect((err as DteError).details.reason).toBe(reason)
  }
}

describe('agentOptions', () => {
  test('verifies by default and negotiates the protocol freely', () => {
    expect(agentOptions({}, constants)).toEqual({ keepAlive: true, rejectUnauthorized: true })
  })

  test('every knob is opt-in', () => {
    expect(
      agentOptions(
        {
          keepAlive: false,
          tls: {
            ca: ['CA1', 'CA2'],
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2',
            maxVersion: 'TLSv1.2',
            legacyRenegotiation: true,
            clientCertificate: { privateKeyPem: 'KEY', chainPem: 'CHAIN' },
          },
        },
        constants,
      ),
    ).toEqual({
      keepAlive: false,
      rejectUnauthorized: false,
      ca: ['CA1', 'CA2'],
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.2',
      secureOptions: 0x40004,
      key: 'KEY',
      cert: 'CHAIN',
    })
    expect(agentOptions({ tls: { ca: 'ONE' } }, constants).ca).toBe('ONE')
  })
})

describe('createNodeHttpsTransport', () => {
  test('rejects a self-signed server by default with the OpenSSL code', async () => {
    await expectCode(createNodeHttpsTransport()(get('/latin1')), 'TRANSPORT_TLS', 'DEPTH_ZERO_SELF_SIGNED_CERT')
  })

  test('trusts the server through tls.ca and round-trips Latin-1 bytes', async () => {
    const transport = createNodeHttpsTransport({ tls: { ca: cert } })
    const response = await transport({
      method: 'POST',
      url: `${state.base}/latin1`,
      headers: { 'Content-Type': 'text/xml', 'Content-Length': '3' },
      body: encodeLatin1('áé!'),
      timeoutMs: 2000,
    })
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('text/xml; charset=ISO-8859-1')
    expect(response.headers['x-echo-length']).toBe('3')
    expect(Array.from(response.body)).toEqual([0xe1])
    expect(decodeBody(response.body, 'latin1')).toBe('á')
  })

  test('rejectUnauthorized: false also connects (opt-in escape hatch)', async () => {
    const response = await createNodeHttpsTransport({ tls: { rejectUnauthorized: false } })(get('/echo'))
    expect(response.status).toBe(201)
  })

  test('forwards headers, joins repeated response headers and echoes the body', async () => {
    const transport = createNodeHttpsTransport({ tls: { ca: cert }, keepAlive: false })
    const response = await transport({
      method: 'POST',
      url: `${state.base}/echo`,
      headers: { Cookie: 'TOKEN=abc', 'Content-Length': '2' },
      body: new Uint8Array([1, 2]),
      timeoutMs: 2000,
    })
    expect(response.headers['x-method']).toBe('POST')
    expect(response.headers['x-cookie']).toBe('TOKEN=abc')
    expect(response.headers['set-cookie']).toBe('a=1, b=2')
    expect(Array.from(response.body)).toEqual([1, 2])
  })

  test('times out before the headers and while the body streams', async () => {
    const transport = createNodeHttpsTransport({ tls: { ca: cert } })
    await expectCode(transport(get('/slow', { timeoutMs: 50 })), 'REQUEST_TIMEOUT')
    await expectCode(transport(get('/half', { timeoutMs: 50 })), 'REQUEST_TIMEOUT')
  })

  test('caller abort', async () => {
    const controller = new AbortController()
    const pending = createNodeHttpsTransport({ tls: { ca: cert } })(get('/slow', { signal: controller.signal }))
    controller.abort()
    await expectCode(pending, 'REQUEST_ABORTED')
  })

  test('connection refused is a transport failure with the OS code', async () => {
    const closed = createServer({ key, cert })
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve))
    const port = (closed.address() as AddressInfo).port
    await new Promise<void>((resolve) => closed.close(() => resolve()))
    await expectCode(
      createNodeHttpsTransport({ tls: { ca: cert } })(get('/', { url: `https://127.0.0.1:${port}/` })),
      'TRANSPORT_FAILED',
      'ECONNREFUSED',
    )
  })

  test('loads node:https once and reports a loader failure as TRANSPORT_UNAVAILABLE', async () => {
    const counter = { loads: 0 }
    const counting = async (): Promise<NodeModules> => {
      counter.loads += 1
      return loadReal()
    }
    const transport = createNodeHttpsTransport({ tls: { ca: cert } }, counting)
    await transport(get('/echo'))
    await transport(get('/echo'))
    expect(counter.loads).toBe(1)
    const broken = createNodeHttpsTransport({}, async () => {
      throw new Error('no node here')
    })
    await expectCode(broken(get('/echo')), 'TRANSPORT_UNAVAILABLE', 'no node here')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/sii/node-transport.test.ts`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 3: Implementation**

`src/sii/lazy.ts`:

```ts
/**
 * EN: Memoizes an async factory: the first call starts it, every call returns the same promise. Used by the Node
 * adapters to load `node:` modules once, on first use, never at import time.
 * ES: Memoriza una fábrica asíncrona: la primera llamada la inicia, todas devuelven la misma promesa. Lo usan los
 * adaptadores Node para cargar módulos `node:` una vez, en el primer uso, nunca al importar.
 */
export const memoize = <T>(factory: () => Promise<T>): (() => Promise<T>) => {
  const box: { promise: Promise<T> | null } = { promise: null }
  return () => {
    if (box.promise === null) box.promise = factory()
    return box.promise
  }
}
```

`src/sii/node-transport.ts`:

```ts
import type { Certificate } from '../certificate/certificate'
import { DteError, errorMessage } from '../errors'
import { memoize } from './lazy'
import { createRequestSignal, mapTransportError, type HttpResponse, type HttpTransport } from './transport'

/**
 * EN: TLS protocol versions the adapter can pin.
 * ES: Versiones de TLS que el adaptador puede fijar.
 */
export type TlsVersion = 'TLSv1.2' | 'TLSv1.3'

/**
 * EN: TLS knobs of the Node adapter. Verification is on by default; every other field is an opt-in escape hatch
 * (the SII hosts verify with the system trust store and negotiate TLS 1.2/1.3 without help, measured 2026-11-01).
 * ES: Ajustes TLS del adaptador Node. La verificación está activada por defecto; el resto son salidas opt-in (los
 * hosts del SII verifican con el almacén del sistema y negocian TLS 1.2/1.3 sin ayuda, medido el 2026-11-01).
 */
export type NodeTlsOptions = {
  /** EN: Extra trusted CA certificates (PEM): the right fix for a container without a CA bundle or a corporate proxy. ES: CA adicionales de confianza (PEM): la solución correcta para un contenedor sin CAs o un proxy corporativo. */
  readonly ca?: string | readonly string[]
  /** EN: Verify the server certificate (default true). ES: Verificar el certificado del servidor (por defecto true). */
  readonly rejectUnauthorized?: boolean
  /** EN: Lowest TLS version. ES: Versión mínima de TLS. */
  readonly minVersion?: TlsVersion
  /** EN: Highest TLS version. ES: Versión máxima de TLS. */
  readonly maxVersion?: TlsVersion
  /** EN: Allow unsafe legacy renegotiation (`SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION | SSL_OP_LEGACY_SERVER_CONNECT`); not needed by any SII host today. ES: Permitir renegociación legacy insegura; ningún host del SII lo necesita hoy. */
  readonly legacyRenegotiation?: boolean
  /** EN: Client certificate for mutual TLS (portal login, phase 4); the chain must be leaf → intermediates → root, which `Certificate.chainPem` is. ES: Certificado cliente para TLS mutuo (login al portal, fase 4); la cadena debe ir hoja → intermedios → raíz, como `Certificate.chainPem`. */
  readonly clientCertificate?: Pick<Certificate, 'privateKeyPem' | 'chainPem'>
}

/**
 * EN: Options of `createNodeHttpsTransport`.
 * ES: Opciones de `createNodeHttpsTransport`.
 */
export type NodeHttpsTransportOptions = {
  readonly tls?: NodeTlsOptions
  /** EN: Reuse sockets (default true). ES: Reutilizar sockets (por defecto true). */
  readonly keepAlive?: boolean
}

/** EN: The two OpenSSL flags behind `legacyRenegotiation`. ES: Los dos flags de OpenSSL detrás de `legacyRenegotiation`. */
export type SslConstants = {
  readonly SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION: number
  readonly SSL_OP_LEGACY_SERVER_CONNECT: number
}

/**
 * EN: What the adapter loads lazily from Node.
 * ES: Lo que el adaptador carga de Node de forma perezosa.
 */
export type NodeModules = {
  readonly https: typeof import('node:https')
  readonly constants: SslConstants
}

/**
 * EN: `https.Agent` options derived from the adapter options (pure; tests assert the flags here because a legacy
 * server cannot be emulated).
 * ES: Opciones del `https.Agent` derivadas de las del adaptador (pura; los tests verifican los flags aquí porque un
 * servidor legacy no se puede emular).
 */
export const agentOptions = (
  options: NodeHttpsTransportOptions,
  constants: SslConstants,
): {
  readonly keepAlive: boolean
  readonly rejectUnauthorized: boolean
  readonly ca?: string | string[]
  readonly minVersion?: TlsVersion
  readonly maxVersion?: TlsVersion
  readonly secureOptions?: number
  readonly key?: string
  readonly cert?: string
} => {
  const tls = options.tls ?? {}
  return {
    keepAlive: options.keepAlive ?? true,
    rejectUnauthorized: tls.rejectUnauthorized ?? true,
    ...(tls.ca === undefined ? {} : { ca: typeof tls.ca === 'string' ? tls.ca : [...tls.ca] }),
    ...(tls.minVersion === undefined ? {} : { minVersion: tls.minVersion }),
    ...(tls.maxVersion === undefined ? {} : { maxVersion: tls.maxVersion }),
    ...(tls.legacyRenegotiation
      ? { secureOptions: constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION | constants.SSL_OP_LEGACY_SERVER_CONNECT }
      : {}),
    ...(tls.clientCertificate === undefined
      ? {}
      : { key: tls.clientCertificate.privateKeyPem, cert: tls.clientCertificate.chainPem }),
  }
}

const loadNodeModules = async (): Promise<NodeModules> => {
  const [https, crypto] = await Promise.all([import('node:https'), import('node:crypto')])
  return { https, constants: crypto.constants }
}

const flattenHeaders = (headers: Readonly<Record<string, string | string[] | undefined>>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(headers).flatMap(([key, value]) =>
      value === undefined ? [] : [[key.toLowerCase(), Array.isArray(value) ? value.join(', ') : value]],
    ),
  )

/**
 * EN: Transport over `node:https`, loaded on first use (never at import). Verifies the server certificate by
 * default; see `NodeTlsOptions` for the opt-in knobs. `loadModules` exists for tests only.
 * ES: Transporte sobre `node:https`, cargado en el primer uso (nunca al importar). Verifica el certificado del
 * servidor por defecto; ver `NodeTlsOptions` para los ajustes opt-in. `loadModules` existe solo para tests.
 * @throws {DteError} EN: `TRANSPORT_UNAVAILABLE` when `node:https` cannot be loaded, then the codes of `mapTransportError`. ES: `TRANSPORT_UNAVAILABLE` si `node:https` no se puede cargar, luego los códigos de `mapTransportError`.
 */
export const createNodeHttpsTransport = (
  options: NodeHttpsTransportOptions = {},
  loadModules: () => Promise<NodeModules> = loadNodeModules,
): HttpTransport => {
  const ready = memoize(async () => {
    const modules = await loadModules().catch((error: unknown) => {
      throw new DteError('TRANSPORT_UNAVAILABLE', { reason: errorMessage(error) })
    })
    return { https: modules.https, agent: new modules.https.Agent(agentOptions(options, modules.constants)) }
  })
  return async (request) => {
    const { https, agent } = await ready()
    const guard = createRequestSignal(request.timeoutMs, request.signal)
    const url = new URL(request.url)
    return new Promise<HttpResponse>((resolve, reject) => {
      const fail = (error: unknown): void => {
        guard.cleanup()
        reject(mapTransportError(error, guard.timedOut(), request.signal?.aborted ?? false))
      }
      const req = https.request(
        {
          hostname: url.hostname,
          port: url.port === '' ? 443 : Number(url.port),
          path: `${url.pathname}${url.search}`,
          method: request.method,
          headers: request.headers,
          agent,
          signal: guard.signal,
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('error', fail)
          res.on('end', () => {
            guard.cleanup()
            resolve({
              status: Number(res.statusCode),
              headers: flattenHeaders(res.headers),
              body: new Uint8Array(Buffer.concat(chunks)),
            })
          })
        },
      )
      req.on('error', fail)
      if (request.body !== undefined) req.write(request.body)
      req.end()
    })
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest tests/sii/node-transport.test.ts`
Expected: PASS. If the self-signed rejection reports `SELF_SIGNED_CERT_IN_CHAIN` instead of `DEPTH_ZERO_SELF_SIGNED_CERT` on some OpenSSL build, accept both in the assertion with `expect(['DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN']).toContain(reason)`.

- [ ] **Step 5: Commit**

```bash
git add src/sii/lazy.ts src/sii/node-transport.ts tests/sii/node-transport.test.ts
git commit -m "feat: Node https transport with lazy loading and TLS verification on by default

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 8: HTTP capture with redaction and upload archive, memory adapters (`src/sii/capture.ts`, `src/sii/archive.ts`)

**Files:**
- Create: `src/sii/capture.ts`, `src/sii/archive.ts`, `tests/support/sii-samples.ts`
- Test: `tests/sii/capture.test.ts`, `tests/sii/archive.test.ts`

- [ ] **Step 1: Failing tests**

`tests/sii/capture.test.ts`:

```ts
import fc from 'fast-check'
import { DteError } from '../../src/errors'
import {
  createMemoryCapture,
  exchangeError,
  redactExchange,
  redactHeaders,
  redactText,
  type HttpExchange,
} from '../../src/sii/capture'

const exchange: HttpExchange = {
  operation: 'getToken',
  channel: 'soap',
  attempt: 1,
  request: {
    method: 'POST',
    url: 'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', Cookie: 'TOKEN=ABC123; other=1' },
    body: '<getToken><item><Semilla>000000000078</Semilla></item></getToken>',
  },
  response: {
    status: 200,
    headers: { 'set-cookie': 'TOKEN=XYZ; Path=/', 'content-type': 'text/xml' },
    body: '<SII:RESPUESTA><SII:RESP_HDR><ESTADO>00</ESTADO></SII:RESP_HDR><SII:RESP_BODY><TOKEN>XYZ789</TOKEN></SII:RESP_BODY></SII:RESPUESTA>',
  },
  error: null,
  startedAt: '2026-11-15T18:30:00.000Z',
  durationMs: 120,
}

describe('redactText', () => {
  test.each([
    ['<TOKEN>ABC</TOKEN>', '<TOKEN>[redacted]</TOKEN>'],
    ['<Token>ABC</Token>', '<Token>[redacted]</Token>'],
    ['<SEMILLA>000000000078</SEMILLA>', '<SEMILLA>[redacted]</SEMILLA>'],
    ['<Semilla>78</Semilla>', '<Semilla>[redacted]</Semilla>'],
    ['<RSASK>-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----</RSASK>', '<RSASK>[redacted]</RSASK>'],
    ['Cookie: TOKEN=ABC123; x=1', 'Cookie: TOKEN=[redacted]; x=1'],
    ['a=1&TOKEN=ABC&b=2', 'a=1&TOKEN=[redacted]&b=2'],
    ['-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----', '[redacted]'],
    ['<RutEmisor>76543210-3</RutEmisor><MntTotal>119000</MntTotal>', '<RutEmisor>76543210-3</RutEmisor><MntTotal>119000</MntTotal>'],
  ])('%s → %s', (input, expected) => {
    expect(redactText(input)).toBe(expected)
  })

  test('caps very large bodies', () => {
    const big = `<TOKEN>secret</TOKEN>${'x'.repeat(600 * 1024)}`
    const out = redactText(big)
    expect(out.startsWith('<TOKEN>[redacted]</TOKEN>')).toBe(true)
    expect(out.length).toBeLessThan(big.length)
    expect(out).toMatch(/…\[truncated \d+ chars\]$/)
  })

  test('no token or seed value survives (property)', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Z0-9]{8,20}$/), fc.string({ maxLength: 40 }), (secret, noise) => {
        const text = `${noise}<TOKEN>${secret}</TOKEN>${noise}TOKEN=${secret} <Semilla>${secret}</Semilla>`
        return !redactText(text).includes(secret)
      }),
    )
  })
})

describe('redactHeaders / redactExchange', () => {
  test('sensitive headers are replaced whatever their case', () => {
    expect(redactHeaders({ Cookie: 'TOKEN=1', 'Set-Cookie': 'x', AUTHORIZATION: 'b', 'Proxy-Authorization': 'c', Accept: '*/*' })).toEqual({
      Cookie: '[redacted]',
      'Set-Cookie': '[redacted]',
      AUTHORIZATION: '[redacted]',
      'Proxy-Authorization': '[redacted]',
      Accept: '*/*',
    })
  })

  test('redacts request and response, keeps structure and nulls', () => {
    const redacted = redactExchange(exchange)
    expect(redacted.request.headers.Cookie).toBe('[redacted]')
    expect(redacted.request.body).toBe('<getToken><item><Semilla>[redacted]</Semilla></item></getToken>')
    expect(redacted.response?.headers['set-cookie']).toBe('[redacted]')
    expect(redacted.response?.body).toContain('<TOKEN>[redacted]</TOKEN>')
    expect(redacted.operation).toBe('getToken')
    const failed = redactExchange({ ...exchange, request: { ...exchange.request, body: null }, response: null, error: { code: 'TRANSPORT_FAILED', reason: 'ECONNRESET' } })
    expect(failed.request.body).toBeNull()
    expect(failed.response).toBeNull()
    expect(failed.error).toEqual({ code: 'TRANSPORT_FAILED', reason: 'ECONNRESET' })
    const emptyResponseBody = redactExchange({ ...exchange, response: { status: 204, headers: {}, body: null } })
    expect(emptyResponseBody.response?.body).toBeNull()
  })
})

describe('exchangeError', () => {
  test('summarises DteErrors and anything else', () => {
    expect(exchangeError(new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' }))).toEqual({ code: 'TRANSPORT_FAILED', reason: 'ECONNRESET' })
    expect(exchangeError(new DteError('REQUEST_ABORTED'))).toEqual({ code: 'REQUEST_ABORTED', reason: 'Request was aborted by the caller' })
    expect(exchangeError(new Error('boom'))).toEqual({ code: 'UNKNOWN', reason: 'boom' })
  })
})

describe('createMemoryCapture', () => {
  test('stores exchanges and returns copies', async () => {
    const memory = createMemoryCapture()
    await memory.capture(exchange)
    const first = memory.exchanges()
    await memory.capture({ ...exchange, attempt: 2 })
    expect(first).toHaveLength(1)
    expect(memory.exchanges().map((e) => e.attempt)).toEqual([1, 2])
  })
})
```

`tests/support/sii-samples.ts` (shared sample data, outside Jest discovery):

```ts
import { toSiiRut } from '../../src/model/rut'
import type { UploadRecord } from '../../src/sii/archive'
import { encodeLatin1 } from '../../src/text/latin1'

/** An upload record with invented data, shared by the archive tests. */
export const sampleRecord: UploadRecord = {
  environment: 'certification',
  kind: 'dte',
  channel: 'soap',
  trackId: '1234567',
  duplicate: false,
  companyRut: toSiiRut('76543210-3'),
  senderRut: toSiiRut('12345678-5'),
  fileName: 'EnvioDTE.xml',
  sentAt: '2026-11-15T18:30:00.000Z',
  xml: encodeLatin1('<EnvioDTE/>'),
  response: { httpStatus: 200, code: '0', raw: '<RECEPCIONDTE><STATUS>0</STATUS></RECEPCIONDTE>' },
}
```

`tests/sii/archive.test.ts`:

```ts
import { createMemoryUploadArchive, uploadRecordName } from '../../src/sii/archive'
import { sampleRecord } from '../support/sii-samples'

describe('uploadRecordName', () => {
  test('uses the TrackID, or a timestamp for rejected uploads', () => {
    expect(uploadRecordName(sampleRecord)).toBe('1234567-dte')
    expect(uploadRecordName({ ...sampleRecord, trackId: null, kind: 'book' })).toBe('rejected-20261115183000-book')
  })
})

describe('createMemoryUploadArchive', () => {
  test('stores records and returns copies', async () => {
    const memory = createMemoryUploadArchive()
    await memory.archive(sampleRecord)
    const first = memory.records()
    await memory.archive({ ...sampleRecord, trackId: '2' })
    expect(first).toHaveLength(1)
    expect(memory.records().map((r) => r.trackId)).toEqual(['1234567', '2'])
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest tests/sii/capture.test.ts tests/sii/archive.test.ts`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 3: Implementation**

`src/sii/capture.ts`:

```ts
import { errorMessage, isDteError } from '../errors'
import type { TokenChannel } from './token-cache'

/**
 * EN: The request half of a captured exchange, bodies already decoded to text.
 * ES: La mitad "petición" de un intercambio capturado, con los cuerpos ya decodificados a texto.
 */
export type HttpExchangeRequest = {
  readonly method: string
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  /** EN: Decoded body or null (GET). ES: Cuerpo decodificado o null (GET). */
  readonly body: string | null
}

/**
 * EN: The response half of a captured exchange.
 * ES: La mitad "respuesta" de un intercambio capturado.
 */
export type HttpExchangeResponse = {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: string | null
}

/**
 * EN: Why an exchange produced no response.
 * ES: Por qué un intercambio no produjo respuesta.
 */
export type HttpExchangeError = {
  /** EN: `DteError.code` or `UNKNOWN`. ES: `DteError.code` o `UNKNOWN`. */
  readonly code: string
  readonly reason: string
}

/**
 * EN: One HTTP attempt as handed to the `capture` port, already redacted.
 * ES: Un intento HTTP tal como se entrega al puerto `capture`, ya con los secretos tachados.
 */
export type HttpExchange = {
  /** EN: Operation name (`getSeed`, `uploadEnvelope`, `registerClaim`…). ES: Nombre de la operación. */
  readonly operation: string
  readonly channel: TokenChannel
  /** EN: Attempt number within the retry loop (1-based). ES: Número de intento dentro del ciclo de reintentos (desde 1). */
  readonly attempt: number
  readonly request: HttpExchangeRequest
  readonly response: HttpExchangeResponse | null
  readonly error: HttpExchangeError | null
  /** EN: ISO 8601 UTC. ES: ISO 8601 UTC. */
  readonly startedAt: string
  readonly durationMs: number
}

/**
 * EN: Capture port: receives every attempt. Failures inside it are logged and never fail the operation.
 * ES: Puerto de captura: recibe cada intento. Sus fallas se registran y nunca hacen fallar la operación.
 */
export type HttpCapture = (exchange: HttpExchange) => Promise<void>

const REDACTED = '[redacted]'
const MAX_BODY_CHARS = 512 * 1024
const SENSITIVE_HEADERS: ReadonlySet<string> = new Set(['cookie', 'set-cookie', 'authorization', 'proxy-authorization'])

/**
 * EN: Replaces tokens, seeds, `RSASK` and PEM private keys inside a text with `[redacted]` and caps it at 512 KiB.
 * RUTs and XML stay: SII support needs them to diagnose an upload.
 * ES: Reemplaza tokens, semillas, `RSASK` y llaves privadas PEM dentro de un texto por `[redacted]` y lo limita a
 * 512 KiB. Los RUT y el XML se conservan: el soporte del SII los necesita para diagnosticar un envío.
 */
export const redactText = (text: string): string => {
  const redacted = text
    .replace(/<(TOKEN|Token|SEMILLA|Semilla|RSASK)>[\s\S]*?<\/\1>/g, `<$1>${REDACTED}</$1>`)
    .replace(/TOKEN=[^;&\s"'<]+/g, `TOKEN=${REDACTED}`)
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, REDACTED)
  return redacted.length > MAX_BODY_CHARS
    ? `${redacted.slice(0, MAX_BODY_CHARS)}…[truncated ${redacted.length - MAX_BODY_CHARS} chars]`
    : redacted
}

/**
 * EN: Replaces the values of `Cookie`, `Set-Cookie`, `Authorization` and `Proxy-Authorization` (any case) and
 * redacts the rest.
 * ES: Reemplaza los valores de `Cookie`, `Set-Cookie`, `Authorization` y `Proxy-Authorization` (en cualquier caja) y
 * tacha el resto.
 */
export const redactHeaders = (headers: Readonly<Record<string, string>>): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      SENSITIVE_HEADERS.has(name.toLowerCase()) ? REDACTED : redactText(value),
    ]),
  )

/**
 * EN: Pure redaction of a whole exchange; the client applies it before calling the port, and adapters may reuse it.
 * ES: Tachado puro de un intercambio completo; el cliente lo aplica antes de llamar al puerto y los adaptadores pueden reutilizarlo.
 */
export const redactExchange = (exchange: HttpExchange): HttpExchange => ({
  ...exchange,
  request: {
    ...exchange.request,
    url: redactText(exchange.request.url),
    headers: redactHeaders(exchange.request.headers),
    body: exchange.request.body === null ? null : redactText(exchange.request.body),
  },
  response:
    exchange.response === null
      ? null
      : {
          ...exchange.response,
          headers: redactHeaders(exchange.response.headers),
          body: exchange.response.body === null ? null : redactText(exchange.response.body),
        },
})

/**
 * EN: Summary of a thrown value for `HttpExchange.error`.
 * ES: Resumen de un valor lanzado para `HttpExchange.error`.
 */
export const exchangeError = (error: unknown): HttpExchangeError =>
  isDteError(error)
    ? { code: error.code, reason: typeof error.details.reason === 'string' ? error.details.reason : error.message }
    : { code: 'UNKNOWN', reason: errorMessage(error) }

/**
 * EN: In-memory capture: `exchanges()` returns a copy of everything captured so far.
 * ES: Captura en memoria: `exchanges()` devuelve una copia de lo capturado hasta ahora.
 */
export const createMemoryCapture = (): {
  readonly capture: HttpCapture
  readonly exchanges: () => readonly HttpExchange[]
} => {
  const list: HttpExchange[] = []
  return {
    capture: async (exchange) => {
      list.push(exchange)
    },
    exchanges: () => [...list],
  }
}
```

`src/sii/archive.ts`:

```ts
import type { Environment } from '../catalogs/codes'
import type { SiiRut } from '../model/rut'
import type { TokenChannel } from './token-cache'

/**
 * EN: What was uploaded: `EnvioDTE`, `EnvioBOLETA`, a book (IECV / guides) or the folio consumption report (RCOF).
 * ES: Qué se subió: `EnvioDTE` (`dte`), `EnvioBOLETA` (`receipt`), un libro (`book`) o el Reporte de Consumo de Folios (`folioConsumption`).
 */
export type UploadKind = 'dte' | 'receipt' | 'book' | 'folioConsumption'

/**
 * EN: One upload that got an SII answer, as handed to the `archive` port.
 * ES: Un envío que obtuvo respuesta del SII, tal como se entrega al puerto `archive`.
 */
export type UploadRecord = {
  readonly environment: Environment
  readonly kind: UploadKind
  readonly channel: TokenChannel
  /** EN: TrackID, or null when the SII rejected the upload. ES: `TRACKID`, o null si el SII rechazó el envío. */
  readonly trackId: string | null
  /** EN: The SII reported the file as already uploaded. ES: El SII reportó el archivo como ya enviado. */
  readonly duplicate: boolean
  /** EN: Company RUT. ES: `rutCompany` — RUT de la empresa. */
  readonly companyRut: SiiRut
  /** EN: Sender RUT. ES: `rutSender` — RUT de quien envía. */
  readonly senderRut: SiiRut
  /** EN: Multipart file name. ES: Nombre del archivo en el multipart. */
  readonly fileName: string
  /** EN: ISO 8601 UTC instant of the send. ES: Instante del envío, ISO 8601 UTC. */
  readonly sentAt: string
  /** EN: The exact bytes sent. ES: Los bytes exactos enviados. */
  readonly xml: Uint8Array
  /** EN: HTTP status, SII code and raw body of the answer. ES: Estado HTTP, código del SII y cuerpo crudo de la respuesta. */
  readonly response: { readonly httpStatus: number; readonly code: string; readonly raw: string }
}

/**
 * EN: Archive port.
 * ES: Puerto de archivo de envíos.
 */
export type UploadArchive = (record: UploadRecord) => Promise<void>

/**
 * EN: File-friendly name of a record: `<trackId>-<kind>`, or `rejected-<yyyymmddHHMMSS>-<kind>` without a TrackID.
 * ES: Nombre apto para archivo: `<trackId>-<kind>`, o `rejected-<aaaammddHHMMSS>-<kind>` sin TrackID.
 */
export const uploadRecordName = (record: Pick<UploadRecord, 'trackId' | 'kind' | 'sentAt'>): string =>
  record.trackId === null
    ? `rejected-${record.sentAt.replace(/\D/g, '').slice(0, 14)}-${record.kind}`
    : `${record.trackId}-${record.kind}`

/**
 * EN: In-memory archive: `records()` returns a copy of everything archived so far.
 * ES: Archivo en memoria: `records()` devuelve una copia de lo archivado hasta ahora.
 */
export const createMemoryUploadArchive = (): {
  readonly archive: UploadArchive
  readonly records: () => readonly UploadRecord[]
} => {
  const list: UploadRecord[] = []
  return {
    archive: async (record) => {
      list.push(record)
    },
    records: () => [...list],
  }
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx jest tests/sii/capture.test.ts tests/sii/archive.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sii/capture.ts src/sii/archive.ts tests/support/sii-samples.ts tests/sii/capture.test.ts tests/sii/archive.test.ts
git commit -m "feat: HTTP capture with redaction and upload archive ports with memory adapters

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Directory adapters for capture and archive (`src/sii/node-fs.ts`, `src/sii/node-capture.ts`, `src/sii/node-archive.ts`)

**Files:**
- Create: `src/sii/node-fs.ts`, `src/sii/node-capture.ts`, `src/sii/node-archive.ts`
- Test: `tests/sii/node-capture.test.ts`, `tests/sii/node-archive.test.ts`

- [ ] **Step 1: Failing tests**

`tests/sii/node-capture.test.ts`:

```ts
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { HttpExchange } from '../../src/sii/capture'
import type { Logger } from '../../src/sii/logger'
import { createDirectoryCapture } from '../../src/sii/node-capture'

const exchange: HttpExchange = {
  operation: 'getSeed',
  channel: 'soap',
  attempt: 1,
  request: { method: 'POST', url: 'https://maullin.sii.cl/DTEWS/CrSeed.jws', headers: {}, body: '<x/>' },
  response: { status: 200, headers: {}, body: '<y/>' },
  error: null,
  startedAt: '2026-11-15T18:30:00.000Z',
  durationMs: 10,
}
const recordingLogger = (): Logger & { readonly warnings: unknown[] } => {
  const warnings: unknown[] = []
  const noop = () => undefined
  return { debug: noop, info: noop, error: noop, warn: (message, context) => warnings.push([message, context]), warnings }
}

describe('createDirectoryCapture', () => {
  test('writes one JSON per exchange plus an index line, with prefix and sequence', async () => {
    const dir = join(await mkdtemp(join(tmpdir(), 'dte-sdk-capture-')), 'nested')
    const capture = createDirectoryCapture({ dir, prefix: 'r1-' })
    await capture(exchange)
    await capture({ ...exchange, operation: 'getToken', response: null, error: { code: 'TRANSPORT_FAILED', reason: 'ECONNRESET' } })
    expect((await readdir(dir)).sort()).toEqual(['index.jsonl', 'r1-0001-getSeed-200.json', 'r1-0002-getToken-ERR.json'])
    expect(JSON.parse(await readFile(join(dir, 'r1-0001-getSeed-200.json'), 'utf8'))).toEqual(exchange)
    const index = (await readFile(join(dir, 'index.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line))
    expect(index).toEqual([
      { seq: 1, startedAt: exchange.startedAt, operation: 'getSeed', method: 'POST', url: exchange.request.url, status: 200, durationMs: 10, file: 'r1-0001-getSeed-200.json' },
      { seq: 2, startedAt: exchange.startedAt, operation: 'getToken', method: 'POST', url: exchange.request.url, status: null, durationMs: 10, file: 'r1-0002-getToken-ERR.json' },
    ])
  })

  test('never throws: filesystem and loader failures go to logger.warn', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'dte-sdk-capture-')), 'a-file')
    await writeFile(file, 'x')
    const logger = recordingLogger()
    await createDirectoryCapture({ dir: join(file, 'sub'), logger })(exchange)
    expect(logger.warnings).toHaveLength(1)
    expect(logger.warnings[0]).toEqual(['HTTP capture failed', { operation: 'getSeed', reason: expect.stringMatching(/ENOTDIR|EEXIST/) }])
    const broken = createDirectoryCapture({ dir: file, logger }, async () => {
      throw new Error('no fs')
    })
    await broken(exchange)
    expect(logger.warnings[1]).toEqual(['HTTP capture failed', { operation: 'getSeed', reason: 'no fs' }])
  })
})
```

`tests/sii/node-archive.test.ts`:

```ts
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Logger } from '../../src/sii/logger'
import { createDirectoryUploadArchive } from '../../src/sii/node-archive'
import { decodeLatin1 } from '../../src/text/latin1'
import { sampleRecord } from '../support/sii-samples'

const recordingLogger = (): Logger & { readonly warnings: unknown[] } => {
  const warnings: unknown[] = []
  const noop = () => undefined
  return { debug: noop, info: noop, error: noop, warn: (message, context) => warnings.push([message, context]), warnings }
}

describe('createDirectoryUploadArchive', () => {
  test('writes <dir>/<environment>/<yyyy-mm>/<name>.xml and .json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dte-sdk-archive-'))
    const archive = createDirectoryUploadArchive({ dir })
    await archive(sampleRecord)
    await archive({ ...sampleRecord, trackId: null, kind: 'book' })
    const folder = join(dir, 'certification', '2026-11')
    expect((await readdir(folder)).sort()).toEqual([
      '1234567-dte.json',
      '1234567-dte.xml',
      'rejected-20261115183000-book.json',
      'rejected-20261115183000-book.xml',
    ])
    expect(decodeLatin1(new Uint8Array(await readFile(join(folder, '1234567-dte.xml'))))).toBe('<EnvioDTE/>')
    const metadata = JSON.parse(await readFile(join(folder, '1234567-dte.json'), 'utf8'))
    expect(metadata.xml).toBeUndefined()
    expect(metadata.trackId).toBe('1234567')
    expect(metadata.response.code).toBe('0')
  })

  test('never throws: failures go to logger.warn', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'dte-sdk-archive-')), 'a-file')
    await writeFile(file, 'x')
    const logger = recordingLogger()
    await createDirectoryUploadArchive({ dir: join(file, 'sub'), logger })(sampleRecord)
    expect(logger.warnings[0]).toEqual(['upload archive failed', { trackId: '1234567', reason: expect.stringMatching(/ENOTDIR|EEXIST/) }])
    await createDirectoryUploadArchive({ dir: file, logger }, async () => {
      throw new Error('no fs')
    })(sampleRecord)
    expect(logger.warnings[1]).toEqual(['upload archive failed', { trackId: '1234567', reason: 'no fs' }])
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest tests/sii/node-capture.test.ts tests/sii/node-archive.test.ts`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 3: Implementation**

`src/sii/node-fs.ts`:

```ts
/**
 * EN: The Node modules the directory adapters load lazily.
 * ES: Los módulos de Node que los adaptadores de directorio cargan de forma perezosa.
 */
export type NodeFsModules = {
  readonly fs: typeof import('node:fs/promises')
  readonly path: typeof import('node:path')
}

/**
 * EN: Loads `node:fs/promises` and `node:path` on first use.
 * ES: Carga `node:fs/promises` y `node:path` en el primer uso.
 */
export const loadNodeFs = async (): Promise<NodeFsModules> => {
  const [fs, path] = await Promise.all([import('node:fs/promises'), import('node:path')])
  return { fs, path }
}
```

`src/sii/node-capture.ts`:

```ts
import { errorMessage } from '../errors'
import type { HttpCapture } from './capture'
import { memoize } from './lazy'
import { silentLogger, type Logger } from './logger'
import { loadNodeFs, type NodeFsModules } from './node-fs'

/**
 * EN: Options of `createDirectoryCapture`.
 * ES: Opciones de `createDirectoryCapture`.
 */
export type DirectoryCaptureOptions = {
  /** EN: Target directory, created on first use. ES: Directorio destino, creado en el primer uso. */
  readonly dir: string
  /** EN: File name prefix that separates replicas sharing a volume. ES: Prefijo de nombre que separa réplicas que comparten volumen. */
  readonly prefix?: string
  /** EN: Where failures are reported (default silent). ES: Dónde se reportan las fallas (por defecto silencioso). */
  readonly logger?: Logger
}

/**
 * EN: Writes `<dir>/<prefix><seq>-<operation>-<status|ERR>.json` per exchange and appends a line to
 * `<dir>/index.jsonl`. Never throws: failures go to `logger.warn`. `loadModules` exists for tests only.
 * ES: Escribe `<dir>/<prefijo><seq>-<operación>-<estado|ERR>.json` por intercambio y agrega una línea a
 * `<dir>/index.jsonl`. Nunca lanza: las fallas van a `logger.warn`. `loadModules` existe solo para tests.
 */
export const createDirectoryCapture = (
  options: DirectoryCaptureOptions,
  loadModules: () => Promise<NodeFsModules> = loadNodeFs,
): HttpCapture => {
  const modules = memoize(loadModules)
  const logger = options.logger ?? silentLogger
  const prefix = options.prefix ?? ''
  const state = { seq: 0 }
  return async (exchange) => {
    try {
      const { fs, path } = await modules()
      state.seq += 1
      const status = exchange.response === null ? 'ERR' : String(exchange.response.status)
      const file = `${prefix}${String(state.seq).padStart(4, '0')}-${exchange.operation}-${status}.json`
      await fs.mkdir(options.dir, { recursive: true })
      await fs.writeFile(path.join(options.dir, file), JSON.stringify(exchange, null, 2))
      const line = JSON.stringify({
        seq: state.seq,
        startedAt: exchange.startedAt,
        operation: exchange.operation,
        method: exchange.request.method,
        url: exchange.request.url,
        status: exchange.response === null ? null : exchange.response.status,
        durationMs: exchange.durationMs,
        file,
      })
      await fs.appendFile(path.join(options.dir, 'index.jsonl'), `${line}\n`)
    } catch (error) {
      logger.warn('HTTP capture failed', { operation: exchange.operation, reason: errorMessage(error) })
    }
  }
}
```

`src/sii/node-archive.ts`:

```ts
import { errorMessage } from '../errors'
import { uploadRecordName, type UploadArchive } from './archive'
import { memoize } from './lazy'
import { silentLogger, type Logger } from './logger'
import { loadNodeFs, type NodeFsModules } from './node-fs'

/**
 * EN: Options of `createDirectoryUploadArchive`.
 * ES: Opciones de `createDirectoryUploadArchive`.
 */
export type DirectoryUploadArchiveOptions = {
  /** EN: Root directory; `<environment>/<yyyy-mm>/` is created under it. ES: Directorio raíz; debajo se crea `<ambiente>/<aaaa-mm>/`. */
  readonly dir: string
  /** EN: Where failures are reported (default silent). ES: Dónde se reportan las fallas (por defecto silencioso). */
  readonly logger?: Logger
}

/**
 * EN: Writes the bytes sent as `<name>.xml` and the record without them as `<name>.json` under
 * `<dir>/<environment>/<yyyy-mm>/` (`name` from `uploadRecordName`). Never throws. `loadModules` is for tests.
 * ES: Escribe los bytes enviados como `<nombre>.xml` y el registro sin ellos como `<nombre>.json` bajo
 * `<dir>/<ambiente>/<aaaa-mm>/` (`nombre` según `uploadRecordName`). Nunca lanza. `loadModules` es para tests.
 */
export const createDirectoryUploadArchive = (
  options: DirectoryUploadArchiveOptions,
  loadModules: () => Promise<NodeFsModules> = loadNodeFs,
): UploadArchive => {
  const modules = memoize(loadModules)
  const logger = options.logger ?? silentLogger
  return async (record) => {
    try {
      const { fs, path } = await modules()
      const folder = path.join(options.dir, record.environment, record.sentAt.slice(0, 7))
      const name = uploadRecordName(record)
      await fs.mkdir(folder, { recursive: true })
      await fs.writeFile(path.join(folder, `${name}.xml`), record.xml)
      const { xml: _xml, ...metadata } = record
      await fs.writeFile(path.join(folder, `${name}.json`), JSON.stringify(metadata, null, 2))
    } catch (error) {
      logger.warn('upload archive failed', { trackId: record.trackId, reason: errorMessage(error) })
    }
  }
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx jest tests/sii/node-capture.test.ts tests/sii/node-archive.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sii/node-fs.ts src/sii/node-capture.ts src/sii/node-archive.ts tests/sii/node-capture.test.ts tests/sii/node-archive.test.ts
git commit -m "feat: directory adapters for HTTP capture and upload archive (lazy node:fs)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 10: The client value and the `send` helper (`src/sii/client.ts`, `src/sii/send.ts`)

**Files:**
- Create: `src/sii/client.ts`, `src/sii/send.ts`
- Test: `tests/sii/client.test.ts`, `tests/sii/send.test.ts`

- [ ] **Step 1: Failing tests**

`tests/sii/client.test.ts`:

```ts
import { CLAIM_WS_ENDPOINTS, REST_ENDPOINTS, SOAP_ENDPOINTS } from '../../src/catalogs/endpoints'
import { loadCertificateFromPem } from '../../src/certificate/pem'
import { DteError } from '../../src/errors'
import {
  createSiiClient,
  DEFAULT_TIMEOUTS,
  DEFAULT_TOKEN_TTL_MS,
  resolveCompanyRut,
  resolveSenderRut,
  retryFor,
  timeoutFor,
  type SiiClientOptions,
} from '../../src/sii/client'
import { createMemoryCapture } from '../../src/sii/capture'
import { createMemoryUploadArchive } from '../../src/sii/archive'
import { silentLogger } from '../../src/sii/logger'
import { DEFAULT_RETRY_POLICY } from '../../src/sii/retry'
import { createMemoryTokenCache } from '../../src/sii/token-cache'
import type { HttpTransport } from '../../src/sii/transport'
import { fixtureText, FIXED_NOW, ISSUER_RUT } from '../support/fixtures'

const certificate = loadCertificateFromPem(
  { privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') },
  { now: FIXED_NOW },
)
const base: SiiClientOptions = { environment: 'certification', certificate }
const expectCode = (fn: () => unknown, code: string, field?: string) => {
  try {
    fn()
    throw new Error('expected DteError')
  } catch (err) {
    expect(err).toBeInstanceOf(DteError)
    expect((err as DteError).code).toBe(code)
    if (field !== undefined) expect((err as DteError).details.field).toBe(field)
  }
}

describe('createSiiClient', () => {
  test('defaults: certification uses DTEUpload for receipts, memory cache, silent logger, no capture', () => {
    const sii = createSiiClient(base)
    expect(Object.isFrozen(sii)).toBe(true)
    expect(sii.environment).toBe('certification')
    expect(sii.senderRut).toBe(ISSUER_RUT)
    expect(sii.companyRut).toBeNull()
    expect(sii.receiptsChannel).toBe('soap')
    expect(sii.tokenTtlMs).toBe(DEFAULT_TOKEN_TTL_MS)
    expect(DEFAULT_TOKEN_TTL_MS).toBe(55 * 60 * 1000)
    expect(sii.timeouts).toEqual(DEFAULT_TIMEOUTS)
    expect(DEFAULT_TIMEOUTS).toEqual({ soap: 30000, rest: 15000, upload: 60000 })
    expect(sii.retry).toEqual(DEFAULT_RETRY_POLICY)
    expect(sii.logger).toBe(silentLogger)
    expect(sii.capture).toBeNull()
    expect(sii.archive).toBeNull()
    expect(sii.endpoints).toEqual({
      soap: SOAP_ENDPOINTS.certification,
      rest: REST_ENDPOINTS.certification,
      claims: CLAIM_WS_ENDPOINTS.certification,
    })
    expect(typeof sii.transport).toBe('function')
    expect(typeof sii.tokenCache.get).toBe('function')
    expect(sii.now()).toBeInstanceOf(Date)
  })

  test('production uses the REST channel for receipts', () => {
    expect(createSiiClient({ ...base, environment: 'production' }).receiptsChannel).toBe('rest')
    expect(createSiiClient({ ...base, environment: 'production' }).endpoints.soap).toBe(SOAP_ENDPOINTS.production)
  })

  test('every option is applied', async () => {
    const transport: HttpTransport = async () => ({ status: 204, headers: {}, body: new Uint8Array() })
    const tokenCache = createMemoryTokenCache()
    const capture = createMemoryCapture().capture
    const archive = createMemoryUploadArchive().archive
    const now = () => FIXED_NOW
    const sleep = async () => undefined
    const sii = createSiiClient({
      ...base,
      companyRut: '77.111.222-3',
      senderRut: '12.345.678-5',
      transport,
      tokenCache,
      tokenTtlMs: 1000,
      retry: { maxAttempts: 2 },
      timeouts: { soap: 1, rest: 2, upload: 3 },
      receiptsChannel: 'rest',
      logger: console,
      capture,
      archive,
      endpoints: { soap: { ...SOAP_ENDPOINTS.production, seed: 'https://proxy.test/seed' }, rest: REST_ENDPOINTS.production, claims: 'https://proxy.test/claims' },
      now,
      sleep,
    })
    expect(sii.companyRut).toBe('77111222-3')
    expect(sii.senderRut).toBe('12345678-5')
    expect(sii.transport).toBe(transport)
    expect(sii.tokenCache).toBe(tokenCache)
    expect(sii.tokenTtlMs).toBe(1000)
    expect(sii.retry).toEqual({ ...DEFAULT_RETRY_POLICY, maxAttempts: 2 })
    expect(sii.timeouts).toEqual({ soap: 1, rest: 2, upload: 3 })
    expect(sii.receiptsChannel).toBe('rest')
    expect(sii.logger).toBe(console)
    expect(sii.capture).toBe(capture)
    expect(sii.archive).toBe(archive)
    expect(sii.endpoints.soap.seed).toBe('https://proxy.test/seed')
    expect(sii.endpoints.rest).toBe(REST_ENDPOINTS.production)
    expect(sii.endpoints.claims).toBe('https://proxy.test/claims')
    expect(sii.now).toBe(now)
    expect(sii.sleep).toBe(sleep)
    expect(createSiiClient({ ...base, retry: false }).retry).toBe(false)
    expect(createSiiClient({ ...base, timeouts: { rest: 7 } }).timeouts).toEqual({ ...DEFAULT_TIMEOUTS, rest: 7 })
  })

  test('validates its options without echoing values', () => {
    expectCode(() => createSiiClient({ ...base, environment: 'staging' as never }), 'INVALID_OPTION', 'environment')
    expectCode(() => createSiiClient({ ...base, certificate: undefined as never }), 'MISSING_FIELD', 'certificate')
    expectCode(() => createSiiClient({ ...base, certificate: { ...certificate, rut: null } }), 'MISSING_FIELD', 'senderRut')
    expect(createSiiClient({ ...base, certificate: { ...certificate, rut: null }, senderRut: ISSUER_RUT }).senderRut).toBe(ISSUER_RUT)
    expectCode(() => createSiiClient({ ...base, senderRut: '1-1' }), 'INVALID_RUT', 'senderRut')
    expectCode(() => createSiiClient({ ...base, companyRut: 'nope' }), 'INVALID_RUT', 'companyRut')
    expectCode(() => createSiiClient({ ...base, tokenTtlMs: 0 }), 'INVALID_OPTION', 'tokenTtlMs')
    expectCode(() => createSiiClient({ ...base, timeouts: { rest: -1 } }), 'INVALID_OPTION', 'timeouts.rest')
    expectCode(() => createSiiClient({ ...base, timeouts: { soap: Number.NaN } }), 'INVALID_OPTION', 'timeouts.soap')
    expectCode(() => createSiiClient({ ...base, timeouts: { upload: 0 } }), 'INVALID_OPTION', 'timeouts.upload')
    expectCode(() => createSiiClient({ ...base, retry: { maxAttempts: 0 } }), 'INVALID_OPTION', 'retry.maxAttempts')
    expectCode(() => createSiiClient({ ...base, retry: { maxAttempts: 1.5 } }), 'INVALID_OPTION', 'retry.maxAttempts')
    expectCode(() => createSiiClient({ ...base, retry: { initialDelayMs: 0 } }), 'INVALID_OPTION', 'retry.initialDelayMs')
    expectCode(() => createSiiClient({ ...base, retry: { maxDelayMs: -5 } }), 'INVALID_OPTION', 'retry.maxDelayMs')
    expectCode(() => createSiiClient({ ...base, retry: { backoffMultiplier: 0 } }), 'INVALID_OPTION', 'retry.backoffMultiplier')
    expectCode(() => createSiiClient({ ...base, retry: { jitterRatio: 2 } }), 'INVALID_OPTION', 'retry.jitterRatio')
    expectCode(() => createSiiClient({ ...base, receiptsChannel: 'ftp' as never }), 'INVALID_OPTION', 'receiptsChannel')
  })

  test('the default sleep waits and honours the signal', async () => {
    const sii = createSiiClient(base)
    const started = Date.now()
    await sii.sleep(20)
    expect(Date.now() - started).toBeGreaterThanOrEqual(15)
    const pre = new AbortController()
    pre.abort()
    await expect(sii.sleep(1000, pre.signal)).rejects.toMatchObject({ code: 'REQUEST_ABORTED' })
    const later = new AbortController()
    const pending = sii.sleep(1000, later.signal)
    later.abort()
    await expect(pending).rejects.toMatchObject({ code: 'REQUEST_ABORTED' })
  })
})

describe('per-call resolution helpers', () => {
  const sii = createSiiClient({ ...base, companyRut: '77111222-3' })

  test('resolveCompanyRut prefers the call, then the client, else MISSING_FIELD', () => {
    expect(resolveCompanyRut(sii, '12.345.678-5')).toBe('12345678-5')
    expect(resolveCompanyRut(sii)).toBe('77111222-3')
    expectCode(() => resolveCompanyRut(createSiiClient(base)), 'MISSING_FIELD', 'companyRut')
    expectCode(() => resolveCompanyRut(sii, 'bad'), 'INVALID_RUT', 'companyRut')
  })

  test('resolveSenderRut prefers the call, else the certificate holder', () => {
    expect(resolveSenderRut(sii)).toBe(ISSUER_RUT)
    expect(resolveSenderRut(sii, '12345678-5')).toBe('12345678-5')
  })

  test('timeoutFor and retryFor merge the overrides', () => {
    expect(timeoutFor(sii, 'upload')).toBe(60000)
    expect(timeoutFor(sii, 'soap', { timeoutMs: 5 })).toBe(5)
    expect(retryFor(sii)).toEqual(DEFAULT_RETRY_POLICY)
    expect(retryFor(sii, { retry: false })).toBe(false)
    expect(retryFor(sii, { retry: { maxAttempts: 1 } })).toEqual({ ...DEFAULT_RETRY_POLICY, maxAttempts: 1 })
  })
})
```

`tests/sii/send.test.ts`:

```ts
import { loadCertificateFromPem } from '../../src/certificate/pem'
import { DteError } from '../../src/errors'
import { createMemoryCapture } from '../../src/sii/capture'
import { createSiiClient } from '../../src/sii/client'
import type { Logger } from '../../src/sii/logger'
import { send } from '../../src/sii/send'
import { decodeBody, encodeUtf8 } from '../../src/sii/transport'
import { encodeLatin1 } from '../../src/text/latin1'
import { createFakeSii } from '../support/fake-sii'
import { fixtureText, FIXED_NOW } from '../support/fixtures'

const certificate = loadCertificateFromPem(
  { privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') },
  { now: FIXED_NOW },
)
const recordingLogger = (): Logger & { readonly lines: unknown[] } => {
  const lines: unknown[] = []
  const log = (level: string) => (message: string, context?: unknown) => lines.push([level, message, context])
  return { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error'), lines }
}
const ticking = () => {
  const state = { t: FIXED_NOW.getTime() }
  return () => new Date((state.t += 100))
}

describe('send', () => {
  test('performs the exchange, captures it redacted and decoded, logs it', async () => {
    const fake = createFakeSii([{ url: 'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws', reply: { body: '<r><TOKEN>XYZ</TOKEN><G>é</G></r>', headers: { 'Set-Cookie': 'TOKEN=XYZ' } } }])
    const memory = createMemoryCapture()
    const logger = recordingLogger()
    const sii = createSiiClient({ environment: 'certification', certificate, transport: fake.transport, capture: memory.capture, logger, now: ticking() })
    const body = encodeUtf8('<getToken><Semilla>1</Semilla>é</getToken>')
    const response = await send(sii, {
      operation: 'getToken',
      channel: 'soap',
      method: 'POST',
      url: 'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws',
      headers: { Cookie: 'TOKEN=OLD', 'Content-Type': 'text/xml; charset=utf-8' },
      body,
      timeoutMs: 100,
      attempt: 2,
      requestEncoding: 'utf8',
    })
    expect(response.status).toBe(200)
    expect(decodeBody(response.body, 'latin1')).toBe('<r><TOKEN>XYZ</TOKEN><G>é</G></r>')
    expect(fake.requests[0].headers.cookie).toBe('TOKEN=OLD')
    expect(fake.requests[0].headers['content-length']).toBe(String(body.length))
    expect(memory.exchanges()).toEqual([
      {
        operation: 'getToken',
        channel: 'soap',
        attempt: 2,
        request: {
          method: 'POST',
          url: 'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws',
          headers: { Cookie: '[redacted]', 'Content-Type': 'text/xml; charset=utf-8', 'Content-Length': String(body.length) },
          body: '<getToken><Semilla>[redacted]</Semilla>é</getToken>',
        },
        response: { status: 200, headers: { 'set-cookie': '[redacted]' }, body: '<r><TOKEN>[redacted]</TOKEN><G>é</G></r>' },
        error: null,
        startedAt: '2026-11-15T18:30:00.100Z',
        durationMs: 100,
      },
    ])
    expect(logger.lines).toEqual([['debug', 'sii http', { operation: 'getToken', attempt: 2, status: 200, durationMs: 100 }]])
  })

  test('REST channel decodes UTF-8 by default; GET has a null request body', async () => {
    const fake = createFakeSii([{ url: 'https://api.test/x', reply: { body: '{"a":"é"}', encoding: 'utf8' } }])
    const memory = createMemoryCapture()
    const sii = createSiiClient({ environment: 'production', certificate, transport: fake.transport, capture: memory.capture })
    await send(sii, { operation: 'queryUploadStatus', channel: 'rest', method: 'GET', url: 'https://api.test/x', headers: {}, timeoutMs: 100, attempt: 1 })
    expect(memory.exchanges()[0].request.body).toBeNull()
    expect(memory.exchanges()[0].response?.body).toBe('{"a":"é"}')
  })

  test('transport failures are captured with the error summary and rethrown', async () => {
    const fake = createFakeSii([{ url: 'https://api.test/x', reply: new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' }) }])
    const memory = createMemoryCapture()
    const logger = recordingLogger()
    const sii = createSiiClient({ environment: 'production', certificate, transport: fake.transport, capture: memory.capture, logger, now: ticking() })
    await expect(
      send(sii, { operation: 'getSeed', channel: 'rest', method: 'GET', url: 'https://api.test/x', headers: {}, timeoutMs: 100, attempt: 1 }),
    ).rejects.toMatchObject({ code: 'TRANSPORT_FAILED' })
    expect(memory.exchanges()[0].response).toBeNull()
    expect(memory.exchanges()[0].error).toEqual({ code: 'TRANSPORT_FAILED', reason: 'ECONNRESET' })
    expect(logger.lines).toEqual([['debug', 'sii http failed', { operation: 'getSeed', attempt: 1, durationMs: 100, error: { code: 'TRANSPORT_FAILED', reason: 'ECONNRESET' } }]])
  })

  test('a failing capture is logged and never fails the call; no capture is fine too', async () => {
    const fake = createFakeSii([{ url: 'https://api.test/x', reply: { body: 'ok' } }])
    const logger = recordingLogger()
    const failing = async () => {
      throw new Error('disk full')
    }
    const sii = createSiiClient({ environment: 'production', certificate, transport: fake.transport, capture: failing, logger })
    const input = { operation: 'getSeed', channel: 'rest' as const, method: 'GET' as const, url: 'https://api.test/x', headers: {}, timeoutMs: 100, attempt: 1 }
    expect((await send(sii, input)).status).toBe(200)
    expect(logger.lines[0]).toEqual(['warn', 'HTTP capture failed', { operation: 'getSeed', reason: 'disk full' }])
    const quiet = createSiiClient({ environment: 'production', certificate, transport: fake.transport })
    expect((await send(quiet, { ...input, body: encodeLatin1('x'), method: 'POST' })).status).toBe(200)
    expect(fake.requests[1].headers['content-length']).toBe('1')
    await send(quiet, { ...input, body: encodeLatin1('xy'), method: 'POST', headers: { 'content-length': '2' } })
    expect(fake.requests[2].headers['content-length']).toBe('2')
    expect(fake.requests[0].headers['content-length']).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest tests/sii/client.test.ts tests/sii/send.test.ts`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 3: Implementation**

`src/sii/client.ts`:

```ts
import { isEnvironment, type Environment } from '../catalogs/codes'
import {
  CLAIM_WS_ENDPOINTS,
  REST_ENDPOINTS,
  SOAP_ENDPOINTS,
  type RestEndpoints,
  type SoapEndpoints,
} from '../catalogs/endpoints'
import type { Certificate } from '../certificate/certificate'
import { DteError } from '../errors'
import { toSiiRut, type SiiRut } from '../model/rut'
import type { UploadArchive } from './archive'
import type { HttpCapture } from './capture'
import { silentLogger, type Logger } from './logger'
import { DEFAULT_RETRY_POLICY, mergeRetryPolicy, type RetryPolicy } from './retry'
import { createMemoryTokenCache, type TokenCache, type TokenChannel } from './token-cache'
import { createFetchTransport, type HttpTransport } from './transport'

/**
 * EN: Timeouts per channel, ms.
 * ES: Timeouts por canal, en ms.
 */
export type SiiTimeouts = {
  /** EN: DTEWS SOAP and WSRECLAMO calls (30 000). ES: Llamadas SOAP DTEWS y WSRECLAMO (30 000). */
  readonly soap: number
  /** EN: Receipts REST API calls (15 000). ES: Llamadas a la API REST de boletas (15 000). */
  readonly rest: number
  /** EN: Uploads on either channel (60 000). ES: Subidas por cualquier canal (60 000). */
  readonly upload: number
}

/**
 * EN: Resolved endpoints of a client.
 * ES: Endpoints resueltos de un cliente.
 */
export type SiiEndpoints = {
  readonly soap: SoapEndpoints
  readonly rest: RestEndpoints
  /** EN: WSRECLAMO service URL. ES: URL del servicio WSRECLAMO. */
  readonly claims: string
}

/**
 * EN: Injectable wait used between retries and status polls.
 * ES: Espera inyectable entre reintentos y sondeos de estado.
 */
export type SleepFn = (ms: number, signal?: AbortSignal) => Promise<void>

/**
 * EN: Options of `createSiiClient`.
 * ES: Opciones de `createSiiClient`.
 */
export type SiiClientOptions = {
  /** EN: Target environment. ES: Ambiente: `certification` (maullin) o `production` (palena). */
  readonly environment: Environment
  /** EN: Certificate that signs the seed; its holder is the default sender. ES: Certificado que firma la semilla; su titular es el `RutEnvia` por defecto. */
  readonly certificate: Certificate
  /** EN: Company RUT used by every operation unless overridden per call. ES: `rutCompany` / `RutCompania` — RUT de la empresa, salvo que la llamada indique otro. */
  readonly companyRut?: string
  /** EN: Sender RUT; defaults to the certificate holder. ES: `rutSender` — RUT de quien envía; por defecto el titular del certificado. */
  readonly senderRut?: string
  /** EN: HTTP transport; `createFetchTransport()` by default. ES: Transporte HTTP; `fetch` por defecto. */
  readonly transport?: HttpTransport
  /** EN: Token cache; memory by default. ES: Caché de tokens; en memoria por defecto. */
  readonly tokenCache?: TokenCache
  /** EN: Token lifetime in the cache; 55 min by default. ES: Vigencia del token en caché; 55 min por defecto. */
  readonly tokenTtlMs?: number
  /** EN: Retry policy overrides, or `false` to disable retries. ES: Ajustes de la política de reintentos, o `false` para desactivarlos. */
  readonly retry?: Partial<RetryPolicy> | false
  /** EN: Timeout overrides per channel. ES: Timeouts por canal. */
  readonly timeouts?: Partial<SiiTimeouts>
  /** EN: Channel for `EnvioBOLETA`; `rest` in production, `soap` (DTEUpload) in certification. ES: Canal para `EnvioBOLETA`; `rest` en producción, `soap` (DTEUpload) en certificación. */
  readonly receiptsChannel?: TokenChannel
  /** EN: Logger; silent by default. ES: Logger; silencioso por defecto. */
  readonly logger?: Logger
  /** EN: HTTP capture port; off by default. ES: Puerto de captura HTTP; apagado por defecto. */
  readonly capture?: HttpCapture
  /** EN: Upload archive port; off by default. ES: Puerto de archivo de envíos; apagado por defecto. */
  readonly archive?: UploadArchive
  /** EN: Endpoint overrides (tests, proxies). ES: URLs alternativas (tests, proxys). */
  readonly endpoints?: Partial<SiiEndpoints>
  /** EN: Clock. ES: Reloj inyectable. */
  readonly now?: () => Date
  /** EN: Wait function. ES: Función de espera inyectable. */
  readonly sleep?: SleepFn
}

/**
 * EN: A configured SII client: frozen data, no methods, no hidden state. Pass it as the first argument of every
 * operation (`uploadEnvelope(sii, …)`).
 * ES: Un cliente SII configurado: dato congelado, sin métodos ni estado oculto. Se pasa como primer argumento de cada
 * operación (`uploadEnvelope(sii, …)`).
 */
export type SiiClient = {
  readonly environment: Environment
  readonly certificate: Certificate
  /** EN: Default company RUT or null. ES: RUT de empresa por defecto o null. */
  readonly companyRut: SiiRut | null
  /** EN: Sender RUT. ES: `RutEnvia` — RUT de quien envía. */
  readonly senderRut: SiiRut
  readonly transport: HttpTransport
  readonly tokenCache: TokenCache
  readonly tokenTtlMs: number
  readonly retry: RetryPolicy | false
  readonly timeouts: SiiTimeouts
  readonly receiptsChannel: TokenChannel
  readonly logger: Logger
  readonly capture: HttpCapture | null
  readonly archive: UploadArchive | null
  readonly endpoints: SiiEndpoints
  readonly now: () => Date
  readonly sleep: SleepFn
}

/**
 * EN: Per-call overrides accepted by every operation.
 * ES: Sobreescrituras por llamada que acepta toda operación.
 */
export type CallOverrides = {
  /** EN: Cancellation. ES: Cancelación. */
  readonly signal?: AbortSignal
  /** EN: Timeout for this call, ms. ES: Timeout de esta llamada, ms. */
  readonly timeoutMs?: number
  /** EN: Retry policy for this call, or `false`. ES: Política de reintentos de esta llamada, o `false`. */
  readonly retry?: Partial<RetryPolicy> | false
}

/** EN: Default timeouts. ES: Timeouts por defecto. */
export const DEFAULT_TIMEOUTS: SiiTimeouts = { soap: 30000, rest: 15000, upload: 60000 }

/** EN: Default token lifetime in the cache: 55 minutes. ES: Vigencia por defecto del token en caché: 55 minutos. */
export const DEFAULT_TOKEN_TTL_MS = 55 * 60 * 1000

const defaultSleep: SleepFn = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DteError('REQUEST_ABORTED'))
      return
    }
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new DteError('REQUEST_ABORTED'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })

const assertPositive = (value: number | undefined, field: string): void => {
  if (value !== undefined && !(Number.isFinite(value) && value > 0)) throw new DteError('INVALID_OPTION', { field })
}

const assertRetry = (retry: Partial<RetryPolicy> | false | undefined): void => {
  if (retry === false || retry === undefined) return
  if (retry.maxAttempts !== undefined && !(Number.isInteger(retry.maxAttempts) && retry.maxAttempts >= 1))
    throw new DteError('INVALID_OPTION', { field: 'retry.maxAttempts' })
  assertPositive(retry.initialDelayMs, 'retry.initialDelayMs')
  assertPositive(retry.maxDelayMs, 'retry.maxDelayMs')
  assertPositive(retry.backoffMultiplier, 'retry.backoffMultiplier')
  if (retry.jitterRatio !== undefined && !(retry.jitterRatio >= 0 && retry.jitterRatio <= 1))
    throw new DteError('INVALID_OPTION', { field: 'retry.jitterRatio' })
}

/**
 * EN: Validates and completes the options into a frozen `SiiClient`. RUTs go through rut.ts; numbers must be
 * positive; the default transport is `fetch`, the default cache is in memory, the default logger is silent.
 * ES: Valida y completa las opciones en un `SiiClient` congelado. Los RUT pasan por rut.ts; los números deben ser
 * positivos; el transporte por defecto es `fetch`, la caché por defecto en memoria, el logger por defecto silencioso.
 * @throws {DteError} EN: `INVALID_OPTION { field }`, `MISSING_FIELD { field }`, `INVALID_RUT { field }`. ES: los mismos códigos.
 */
export const createSiiClient = (options: SiiClientOptions): SiiClient => {
  if (!isEnvironment(options.environment)) throw new DteError('INVALID_OPTION', { field: 'environment' })
  if (!options.certificate) throw new DteError('MISSING_FIELD', { field: 'certificate' })
  const senderRut = options.senderRut === undefined ? options.certificate.rut : toSiiRut(options.senderRut, 'senderRut')
  if (senderRut === null) throw new DteError('MISSING_FIELD', { field: 'senderRut' })
  const companyRut = options.companyRut === undefined ? null : toSiiRut(options.companyRut, 'companyRut')
  assertPositive(options.tokenTtlMs, 'tokenTtlMs')
  assertPositive(options.timeouts?.soap, 'timeouts.soap')
  assertPositive(options.timeouts?.rest, 'timeouts.rest')
  assertPositive(options.timeouts?.upload, 'timeouts.upload')
  assertRetry(options.retry)
  if (options.receiptsChannel !== undefined && options.receiptsChannel !== 'soap' && options.receiptsChannel !== 'rest')
    throw new DteError('INVALID_OPTION', { field: 'receiptsChannel' })
  const environment = options.environment
  return Object.freeze({
    environment,
    certificate: options.certificate,
    companyRut,
    senderRut,
    transport: options.transport ?? createFetchTransport(),
    tokenCache: options.tokenCache ?? createMemoryTokenCache(),
    tokenTtlMs: options.tokenTtlMs ?? DEFAULT_TOKEN_TTL_MS,
    retry: mergeRetryPolicy(DEFAULT_RETRY_POLICY, options.retry),
    timeouts: {
      soap: options.timeouts?.soap ?? DEFAULT_TIMEOUTS.soap,
      rest: options.timeouts?.rest ?? DEFAULT_TIMEOUTS.rest,
      upload: options.timeouts?.upload ?? DEFAULT_TIMEOUTS.upload,
    },
    receiptsChannel: options.receiptsChannel ?? (environment === 'production' ? 'rest' : 'soap'),
    logger: options.logger ?? silentLogger,
    capture: options.capture ?? null,
    archive: options.archive ?? null,
    endpoints: {
      soap: options.endpoints?.soap ?? SOAP_ENDPOINTS[environment],
      rest: options.endpoints?.rest ?? REST_ENDPOINTS[environment],
      claims: options.endpoints?.claims ?? CLAIM_WS_ENDPOINTS[environment],
    },
    now: options.now ?? (() => new Date()),
    sleep: options.sleep ?? defaultSleep,
  })
}

/**
 * EN: Company RUT for a call: the call's value, else the client's, else `MISSING_FIELD`.
 * ES: RUT de empresa de una llamada: el de la llamada, si no el del cliente, si no `MISSING_FIELD`.
 */
export const resolveCompanyRut = (sii: SiiClient, companyRut?: string): SiiRut => {
  if (companyRut !== undefined) return toSiiRut(companyRut, 'companyRut')
  if (sii.companyRut === null) throw new DteError('MISSING_FIELD', { field: 'companyRut' })
  return sii.companyRut
}

/**
 * EN: Sender RUT for a call: the call's value, else the client's.
 * ES: RUT de quien envía en una llamada: el de la llamada, si no el del cliente.
 */
export const resolveSenderRut = (sii: SiiClient, senderRut?: string): SiiRut =>
  senderRut === undefined ? sii.senderRut : toSiiRut(senderRut, 'senderRut')

/**
 * EN: Timeout for a call: the override, else the client's timeout for that channel kind.
 * ES: Timeout de una llamada: el indicado, si no el del cliente para ese tipo de canal.
 */
export const timeoutFor = (sii: SiiClient, kind: keyof SiiTimeouts, overrides?: CallOverrides): number =>
  overrides?.timeoutMs ?? sii.timeouts[kind]

/**
 * EN: Retry policy for a call: the client's policy merged with the override.
 * ES: Política de reintentos de una llamada: la del cliente mezclada con la indicada.
 */
export const retryFor = (sii: SiiClient, overrides?: CallOverrides): RetryPolicy | false =>
  mergeRetryPolicy(sii.retry, overrides?.retry)
```

`src/sii/send.ts`:

```ts
import { errorMessage } from '../errors'
import { exchangeError, redactExchange, type HttpExchange } from './capture'
import type { SiiClient } from './client'
import type { TokenChannel } from './token-cache'
import { decodeBody, type BodyEncoding, type HttpMethod, type HttpRequest, type HttpResponse } from './transport'

/**
 * EN: One HTTP attempt as an operation describes it to `send`.
 * ES: Un intento HTTP tal como una operación se lo describe a `send`.
 */
export type SendInput = {
  /** EN: Operation name for capture and logs. ES: Nombre de la operación para captura y logs. */
  readonly operation: string
  readonly channel: TokenChannel
  readonly method: HttpMethod
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly body?: Uint8Array
  readonly timeoutMs: number
  readonly signal?: AbortSignal
  /** EN: Attempt number (1-based). ES: Número de intento (desde 1). */
  readonly attempt: number
  /** EN: Charset of the request body for the capture; defaults by channel. ES: Charset del cuerpo enviado para la captura; por defecto según el canal. */
  readonly requestEncoding?: BodyEncoding
  /** EN: Charset of the response body for the capture; defaults by channel. ES: Charset del cuerpo recibido para la captura; por defecto según el canal. */
  readonly responseEncoding?: BodyEncoding
}

type Outcome = { readonly response: HttpResponse; readonly error: null } | { readonly response: null; readonly error: unknown }

const defaultEncoding = (channel: TokenChannel): BodyEncoding => (channel === 'rest' ? 'utf8' : 'latin1')

const hasHeader = (headers: Readonly<Record<string, string>>, name: string): boolean =>
  Object.keys(headers).some((key) => key.toLowerCase() === name)

// The SII CGI dislikes chunked uploads: every body travels with an explicit Content-Length.
const withContentLength = (
  headers: Readonly<Record<string, string>>,
  body: Uint8Array | undefined,
): Readonly<Record<string, string>> =>
  body === undefined || hasHeader(headers, 'content-length') ? headers : { ...headers, 'Content-Length': String(body.length) }

const toExchange = (input: SendInput, request: HttpRequest, outcome: Outcome, startedAt: Date, durationMs: number): HttpExchange => ({
  operation: input.operation,
  channel: input.channel,
  attempt: input.attempt,
  request: {
    method: request.method,
    url: request.url,
    headers: request.headers,
    body: request.body === undefined ? null : decodeBody(request.body, input.requestEncoding ?? defaultEncoding(input.channel)),
  },
  response:
    outcome.response === null
      ? null
      : {
          status: outcome.response.status,
          headers: outcome.response.headers,
          body: decodeBody(outcome.response.body, input.responseEncoding ?? defaultEncoding(input.channel)),
        },
  error: outcome.response === null ? exchangeError(outcome.error) : null,
  startedAt: startedAt.toISOString(),
  durationMs,
})

/**
 * EN: Performs one HTTP exchange through the client's transport: adds `Content-Length` to bodies, times the call,
 * hands the redacted exchange to the `capture` port (a failing capture is logged, never thrown), logs a `debug` line
 * and returns the response or rethrows the transport error. Retries and token renewal live above this function.
 * ES: Realiza un intercambio HTTP por el transporte del cliente: agrega `Content-Length` a los cuerpos, cronometra la
 * llamada, entrega el intercambio tachado al puerto `capture` (una captura que falla se registra, nunca se lanza),
 * escribe una línea `debug` y devuelve la respuesta o relanza el error de transporte. Los reintentos y la renovación
 * de token viven por encima de esta función.
 */
export const send = async (sii: SiiClient, input: SendInput): Promise<HttpResponse> => {
  const request: HttpRequest = {
    method: input.method,
    url: input.url,
    headers: withContentLength(input.headers, input.body),
    body: input.body,
    timeoutMs: input.timeoutMs,
    signal: input.signal,
  }
  const startedAt = sii.now()
  const outcome: Outcome = await sii.transport(request).then(
    (response) => ({ response, error: null }),
    (error: unknown) => ({ response: null, error }),
  )
  const durationMs = sii.now().getTime() - startedAt.getTime()
  const exchange = redactExchange(toExchange(input, request, outcome, startedAt, durationMs))
  if (sii.capture !== null) {
    try {
      await sii.capture(exchange)
    } catch (error) {
      sii.logger.warn('HTTP capture failed', { operation: input.operation, reason: errorMessage(error) })
    }
  }
  if (outcome.response === null) {
    sii.logger.debug('sii http failed', { operation: input.operation, attempt: input.attempt, durationMs, error: exchange.error })
    throw outcome.error
  }
  sii.logger.debug('sii http', { operation: input.operation, attempt: input.attempt, status: outcome.response.status, durationMs })
  return outcome.response
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx jest tests/sii/client.test.ts tests/sii/send.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sii/client.ts src/sii/send.ts tests/sii/client.test.ts tests/sii/send.test.ts
git commit -m "feat: createSiiClient (frozen client value) and the send helper with capture and logging

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 11: SOAP envelopes and multipart bodies (`src/sii/soap.ts`, `src/sii/multipart.ts`)

**Files:**
- Create: `src/sii/soap.ts`, `src/sii/multipart.ts`
- Test: `tests/sii/soap.test.ts`, `tests/sii/multipart.test.ts`

- [ ] **Step 1: Failing tests**

`tests/sii/soap.test.ts`:

```ts
import { buildSoapEnvelope, parseSoapResponse, SOAP_HEADERS, stripNamespacePrefixes } from '../../src/sii/soap'

const SOAPENV = 'http://schemas.xmlsoap.org/soap/envelope/'

describe('buildSoapEnvelope', () => {
  test('DTEWS style: unqualified operation, escaped parameter text', () => {
    expect(buildSoapEnvelope({ method: 'getSeed' })).toBe(
      `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="${SOAPENV}"><soapenv:Body><getSeed></getSeed></soapenv:Body></soapenv:Envelope>`,
    )
    expect(buildSoapEnvelope({ method: 'getToken', params: [{ name: 'pszXml', value: '<getToken>&</getToken>' }] })).toContain(
      '<getToken><pszXml>&lt;getToken&gt;&amp;&lt;/getToken&gt;</pszXml></getToken>',
    )
  })

  test('WSRECLAMO style: qualified operation, unqualified parameters in order', () => {
    const xml = buildSoapEnvelope({
      method: 'ingresarAceptacionReclamoDoc',
      namespace: 'http://ws.registroreclamodte.diii.sdi.sii.cl',
      params: [
        { name: 'rutEmisor', value: '77111222' },
        { name: 'dvEmisor', value: '3' },
        { name: 'tipoDoc', value: '33' },
        { name: 'folio', value: '45' },
        { name: 'accionDoc', value: 'ACD' },
      ],
    })
    expect(xml).toContain(`<soapenv:Envelope xmlns:soapenv="${SOAPENV}" xmlns:ws="http://ws.registroreclamodte.diii.sdi.sii.cl">`)
    expect(xml).toContain(
      '<ws:ingresarAceptacionReclamoDoc><rutEmisor>77111222</rutEmisor><dvEmisor>3</dvEmisor><tipoDoc>33</tipoDoc><folio>45</folio><accionDoc>ACD</accionDoc></ws:ingresarAceptacionReclamoDoc>',
    )
  })

  test('headers', () => {
    expect(SOAP_HEADERS).toEqual({ 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' })
  })
})

describe('stripNamespacePrefixes', () => {
  test('removes element prefixes only', () => {
    expect(stripNamespacePrefixes('<?xml version="1.0"?><ns1:a xsi:type="xsd:string"><b:c>1</b:c></ns1:a>')).toBe(
      '<?xml version="1.0"?><a xsi:type="xsd:string"><c>1</c></a>',
    )
  })
})

describe('parseSoapResponse', () => {
  test('DTEWS: unescapes the XML carried inside *Return, including numeric entities', () => {
    const reply =
      `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="${SOAPENV}"><soapenv:Body><ns1:getSeedResponse xmlns:ns1="http://DefaultNamespace"><ns1:getSeedReturn xsi:type="xsd:string">` +
      '&lt;?xml version=&quot;1.0&quot; encoding=&quot;UTF-8&quot;?&gt;&#xd;\n&lt;SII:RESPUESTA xmlns:SII=&quot;http://www.sii.cl/XMLSchema&quot;&gt;&lt;SII:RESP_HDR&gt;&lt;ESTADO&gt;00&lt;/ESTADO&gt;&lt;/SII:RESP_HDR&gt;&lt;SII:RESP_BODY&gt;&lt;SEMILLA&gt;000000000078&lt;/SEMILLA&gt;&lt;/SII:RESP_BODY&gt;&lt;/SII:RESPUESTA&gt;' +
      '</ns1:getSeedReturn></ns1:getSeedResponse></soapenv:Body></soapenv:Envelope>'
    const parsed = parseSoapResponse(reply)
    expect(parsed.fault).toBeNull()
    expect(parsed.returnXml).toBeNull()
    expect(parsed.returnValue).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\r\n<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema"><SII:RESP_HDR><ESTADO>00</ESTADO></SII:RESP_HDR><SII:RESP_BODY><SEMILLA>000000000078</SEMILLA></SII:RESP_BODY></SII:RESPUESTA>',
    )
  })

  test('WSRECLAMO: returns the inner XML of <return> with prefixes stripped', () => {
    const reply = `<soapenv:Envelope xmlns:soapenv="${SOAPENV}"><soapenv:Body><ns2:listarEventosHistDocResponse xmlns:ns2="http://ws.registroreclamodte.diii.sdi.sii.cl"><ns2:return><codResp>15</codResp><descResp>Lista</descResp><listaEventosDoc><codEvento>ACD</codEvento></listaEventosDoc></ns2:return></ns2:listarEventosHistDocResponse></soapenv:Body></soapenv:Envelope>`
    expect(parseSoapResponse(reply).returnXml).toBe('<codResp>15</codResp><descResp>Lista</descResp><listaEventosDoc><codEvento>ACD</codEvento></listaEventosDoc>')
    expect(parseSoapResponse(reply).returnValue).toBeNull()
  })

  test('faults', () => {
    const reply = `<soapenv:Envelope xmlns:soapenv="${SOAPENV}"><soapenv:Body><soapenv:Fault><faultcode>soapenv:Server</faultcode><faultstring>Error de Autenticacion: TOKEN invalido</faultstring></soapenv:Fault></soapenv:Body></soapenv:Envelope>`
    expect(parseSoapResponse(reply).fault).toEqual({ code: 'soapenv:Server', reason: 'Error de Autenticacion: TOKEN invalido' })
    expect(parseSoapResponse('<Envelope><Body><Fault/></Body></Envelope>').fault).toEqual({ code: 'Unknown', reason: '' })
  })

  test('anything else yields nulls', () => {
    expect(parseSoapResponse('<html><body>Mantencion</body></html>')).toEqual({ fault: null, returnValue: null, returnXml: null })
  })
})
```

`tests/sii/multipart.test.ts`:

```ts
import { buildMultipartBody, generateBoundary, multipartContentType } from '../../src/sii/multipart'
import { decodeLatin1, encodeLatin1 } from '../../src/text/latin1'

describe('generateBoundary', () => {
  test('browser-like prefix plus 16 alphanumerics from the injected random', () => {
    expect(generateBoundary(() => 0)).toBe('----WebKitFormBoundaryAAAAAAAAAAAAAAAA')
    expect(generateBoundary(() => 0.999999)).toBe('----WebKitFormBoundary9999999999999999')
    expect(generateBoundary()).toMatch(/^----WebKitFormBoundary[A-Za-z0-9]{16}$/)
    expect(multipartContentType('B')).toBe('multipart/form-data; boundary=B')
  })
})

describe('buildMultipartBody', () => {
  test('CRLF framing, fields in order, file part with filename and content type, Latin-1 bytes intact', () => {
    const body = buildMultipartBody({
      boundary: 'B',
      fields: [
        { name: 'rutSender', value: '12345678' },
        { name: 'dvSender', value: '5' },
      ],
      file: { name: 'archivo', fileName: 'EnvioDTE.xml', contentType: 'text/xml', bytes: encodeLatin1('<a>á</a>') },
    })
    expect(decodeLatin1(body)).toBe(
      [
        '--B',
        'Content-Disposition: form-data; name="rutSender"',
        '',
        '12345678',
        '--B',
        'Content-Disposition: form-data; name="dvSender"',
        '',
        '5',
        '--B',
        'Content-Disposition: form-data; name="archivo"; filename="EnvioDTE.xml"',
        'Content-Type: text/xml',
        '',
        '<a>á</a>',
        '--B--',
        '',
      ].join('\r\n'),
    )
    expect(Array.from(body).includes(0xe1)).toBe(true)
    expect(Array.from(body).includes(0xc3)).toBe(false)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest tests/sii/soap.test.ts tests/sii/multipart.test.ts`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 3: Implementation**

`src/sii/soap.ts`:

```ts
import { escapeXmlText } from '../xml/escape'
import { decodeXmlEntities, extractTagContent } from '../xml/parse'

const SOAP_ENVELOPE_NS = 'http://schemas.xmlsoap.org/soap/envelope/'

/**
 * EN: One rpc parameter, in the order the WSDL declares them (Axis matches by position).
 * ES: Un parámetro rpc, en el orden que declara el WSDL (Axis los asocia por posición).
 */
export type SoapParam = {
  readonly name: string
  readonly value: string
}

/**
 * EN: Input of `buildSoapEnvelope`.
 * ES: Entrada de `buildSoapEnvelope`.
 */
export type SoapEnvelopeInput = {
  /** EN: Operation name (`getSeed`, `getEstUp`, `ingresarAceptacionReclamoDoc`…). ES: Nombre de la operación. */
  readonly method: string
  /** EN: Parameters; text is XML-escaped. ES: Parámetros; el texto se escapa como XML. */
  readonly params?: readonly SoapParam[]
  /** EN: Operation namespace (WSRECLAMO, prefix `ws`); omitted for DTEWS, which accepts unqualified operations. ES: Namespace de la operación (WSRECLAMO, prefijo `ws`); se omite en DTEWS, que acepta operaciones sin calificar. */
  readonly namespace?: string
}

/**
 * EN: Headers of every SOAP 1.1 call to the SII.
 * ES: Cabeceras de toda llamada SOAP 1.1 al SII.
 */
export const SOAP_HEADERS: Readonly<Record<string, string>> = { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' }

/**
 * EN: Builds a SOAP 1.1 envelope (UTF-8 text) with one rpc operation and its parameters as unqualified children.
 * ES: Arma un sobre SOAP 1.1 (texto UTF-8) con una operación rpc y sus parámetros como hijos sin calificar.
 */
export const buildSoapEnvelope = ({ method, params = [], namespace }: SoapEnvelopeInput): string => {
  const body = params.map(({ name, value }) => `<${name}>${escapeXmlText(value)}</${name}>`).join('')
  const tag = namespace === undefined ? method : `ws:${method}`
  const declaration = namespace === undefined ? '' : ` xmlns:ws="${namespace}"`
  return (
    `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="${SOAP_ENVELOPE_NS}"${declaration}>` +
    `<soapenv:Body><${tag}>${body}</${tag}></soapenv:Body></soapenv:Envelope>`
  )
}

/**
 * EN: Removes element namespace prefixes (`<ns1:a>` → `<a>`); attributes and the XML declaration are untouched.
 * ES: Quita los prefijos de namespace de los elementos (`<ns1:a>` → `<a>`); atributos y declaración XML quedan igual.
 */
export const stripNamespacePrefixes = (xml: string): string => xml.replace(/<(\/?)[\w.-]+:(?=[\w.-]+[\s/>])/g, '<$1')

const decodeNumericEntities = (text: string): string =>
  text.replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, code: string) =>
    String.fromCodePoint(code.toLowerCase().startsWith('x') ? parseInt(code.slice(1), 16) : parseInt(code, 10)),
  )

/**
 * EN: A SOAP 1.1 fault.
 * ES: Un fault SOAP 1.1.
 */
export type SoapFault = {
  /** EN: `faultcode`. ES: `faultcode`. */
  readonly code: string
  /** EN: `faultstring`. ES: `faultstring`. */
  readonly reason: string
}

/**
 * EN: What a SOAP reply carried: a fault, the unescaped XML inside `<…Return>` (DTEWS) or the inner XML of
 * `<return>` (WSRECLAMO), prefixes stripped. Nulls when absent.
 * ES: Lo que trajo una respuesta SOAP: un fault, el XML des-escapado dentro de `<…Return>` (DTEWS) o el XML interior
 * de `<return>` (WSRECLAMO), sin prefijos. Null cuando no está.
 */
export type SoapResponse = {
  readonly fault: SoapFault | null
  readonly returnValue: string | null
  readonly returnXml: string | null
}

const RETURN_VALUE = /<([\w.-]+Return)\b[^>]*>([\s\S]*?)<\/\1>/
const RETURN_XML = /<return\b[^>]*>([\s\S]*?)<\/return>/

/**
 * EN: Parses a SOAP reply without a full XML parse: the SII answers are flat and sometimes carry stray entities.
 * ES: Interpreta una respuesta SOAP sin parseo XML completo: las respuestas del SII son planas y a veces traen
 * entidades sueltas.
 */
export const parseSoapResponse = (xml: string): SoapResponse => {
  const plain = stripNamespacePrefixes(xml)
  const fault = /<Fault[\s>/]/.test(plain)
    ? { code: extractTagContent(plain, 'faultcode') ?? 'Unknown', reason: extractTagContent(plain, 'faultstring') ?? '' }
    : null
  const value = RETURN_VALUE.exec(plain)
  const inner = RETURN_XML.exec(plain)
  return {
    fault,
    returnValue: value === null ? null : decodeNumericEntities(decodeXmlEntities(value[2])),
    returnXml: inner === null ? null : inner[1],
  }
}
```

`src/sii/multipart.ts`:

```ts
import { encodeLatin1 } from '../text/latin1'

/**
 * EN: A plain multipart field (`rutSender`, `dvSender`, `rutCompany`, `dvCompany`).
 * ES: Un campo multipart simple (`rutSender`, `dvSender`, `rutCompany`, `dvCompany`).
 */
export type MultipartField = {
  readonly name: string
  readonly value: string
}

/**
 * EN: The file part (`archivo`): bytes already encoded in the charset the XML declares.
 * ES: La parte archivo (`archivo`): bytes ya codificados en el charset que declara el XML.
 */
export type MultipartFile = {
  readonly name: string
  readonly fileName: string
  readonly contentType: string
  readonly bytes: Uint8Array
}

/**
 * EN: Input of `buildMultipartBody`.
 * ES: Entrada de `buildMultipartBody`.
 */
export type MultipartBodyInput = {
  readonly boundary: string
  readonly fields: readonly MultipartField[]
  readonly file: MultipartFile
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/**
 * EN: Browser-like boundary (`----WebKitFormBoundary` + 16 alphanumerics), the shape the SII CGI has accepted for years.
 * ES: Límite al estilo navegador (`----WebKitFormBoundary` + 16 alfanuméricos), la forma que el CGI del SII acepta hace años.
 */
export const generateBoundary = (random: () => number = Math.random): string =>
  `----WebKitFormBoundary${Array.from({ length: 16 }, () => ALPHABET[Math.min(ALPHABET.length - 1, Math.floor(random() * ALPHABET.length))]).join('')}`

/**
 * EN: `Content-Type` header value for a boundary.
 * ES: Valor de la cabecera `Content-Type` para un límite.
 */
export const multipartContentType = (boundary: string): string => `multipart/form-data; boundary=${boundary}`

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  parts.reduce((offset, part) => {
    out.set(part, offset)
    return offset + part.length
  }, 0)
  return out
}

/**
 * EN: `multipart/form-data` bytes: CRLF framing, the fields in order, then the file part. The framing is ASCII; the
 * file bytes are copied untouched (Latin-1 for the SII envelopes).
 * ES: Bytes `multipart/form-data`: delimitación CRLF, los campos en orden y luego la parte archivo. La delimitación es
 * ASCII; los bytes del archivo se copian tal cual (Latin-1 en los sobres del SII).
 */
export const buildMultipartBody = ({ boundary, fields, file }: MultipartBodyInput): Uint8Array => {
  const delimiter = `--${boundary}\r\n`
  const fieldParts = fields.map(({ name, value }) =>
    encodeLatin1(`${delimiter}Content-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`),
  )
  const fileHeader = encodeLatin1(
    `${delimiter}Content-Disposition: form-data; name="${file.name}"; filename="${file.fileName}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
  )
  const closing = encodeLatin1(`\r\n--${boundary}--\r\n`)
  return concat([...fieldParts, fileHeader, file.bytes, closing])
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx jest tests/sii/soap.test.ts tests/sii/multipart.test.ts`
Expected: PASS. (`escapeXmlText` lives in `src/xml/escape.ts` since phase 1 and escapes `&`, `<` and `>`.)

- [ ] **Step 5: Commit**

```bash
git add src/sii/soap.ts src/sii/multipart.ts tests/sii/soap.test.ts tests/sii/multipart.test.ts
git commit -m "feat: SOAP envelope builder/parser and multipart body builder for the SII CGI

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 12: Shared operation helpers and authentication (`src/sii/operation.ts`, `src/sii/auth.ts`)

**Files:**
- Create: `src/sii/operation.ts`, `src/sii/auth.ts`, `tests/fixtures/sii/soap-seed-ok.xml`, `tests/fixtures/sii/soap-seed-error.xml`, `tests/fixtures/sii/soap-token-ok.xml`, `tests/fixtures/sii/soap-token-error-05.xml`, `tests/fixtures/sii/soap-fault.xml`, `tests/fixtures/sii/rest-seed-ok.xml`, `tests/fixtures/sii/rest-token-ok.xml`, `tests/fixtures/sii/html-maintenance.html`, `tests/support/sii-client.ts`
- Test: `tests/sii/operation.test.ts`, `tests/sii/auth.test.ts`

- [ ] **Step 1: Fixtures and the shared test client**

`tests/fixtures/sii/soap-seed-ok.xml` (one line inside `getSeedReturn`; the escaped payload is what the SII really sends):

```xml
<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><soapenv:Body><ns1:getSeedResponse soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:ns1="http://DefaultNamespace"><getSeedReturn xsi:type="xsd:string">&lt;?xml version=&quot;1.0&quot; encoding=&quot;UTF-8&quot;?&gt;&#xd;
&lt;SII:RESPUESTA xmlns:SII=&quot;http://www.sii.cl/XMLSchema&quot;&gt;&lt;SII:RESP_HDR&gt;&lt;ESTADO&gt;00&lt;/ESTADO&gt;&lt;/SII:RESP_HDR&gt;&lt;SII:RESP_BODY&gt;&lt;SEMILLA&gt;000000000078&lt;/SEMILLA&gt;&lt;/SII:RESP_BODY&gt;&lt;/SII:RESPUESTA&gt;</getSeedReturn></ns1:getSeedResponse></soapenv:Body></soapenv:Envelope>
```

`tests/fixtures/sii/soap-seed-error.xml`: same envelope with the payload `…&lt;SII:RESP_HDR&gt;&lt;ESTADO&gt;-2&lt;/ESTADO&gt;&lt;GLOSA&gt;Error de base de datos&lt;/GLOSA&gt;&lt;/SII:RESP_HDR&gt;&lt;/SII:RESPUESTA&gt;` (no `RESP_BODY`).

`tests/fixtures/sii/soap-token-ok.xml`: same envelope shape with `ns1:getTokenResponse` / `getTokenReturn` and the payload
`&lt;SII:RESPUESTA xmlns:SII=&quot;http://www.sii.cl/XMLSchema&quot;&gt;&lt;SII:RESP_HDR&gt;&lt;ESTADO&gt;00&lt;/ESTADO&gt;&lt;GLOSA&gt;Token Creado&lt;/GLOSA&gt;&lt;/SII:RESP_HDR&gt;&lt;SII:RESP_BODY&gt;&lt;TOKEN&gt;ABCDEFGHIJKLM&lt;/TOKEN&gt;&lt;/SII:RESP_BODY&gt;&lt;/SII:RESPUESTA&gt;`.

`tests/fixtures/sii/soap-token-error-05.xml`: `getTokenReturn` payload with `&lt;ESTADO&gt;05&lt;/ESTADO&gt;&lt;GLOSA&gt;Firma invalida&lt;/GLOSA&gt;` and no body.

`tests/fixtures/sii/soap-fault.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><soapenv:Fault><faultcode>soapenv:Server</faultcode><faultstring>Error de Autenticacion: TOKEN invalido</faultstring></soapenv:Fault></soapenv:Body></soapenv:Envelope>
```

`tests/fixtures/sii/rest-seed-ok.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema"><SII:RESP_HDR><ESTADO>00</ESTADO></SII:RESP_HDR><SII:RESP_BODY><SEMILLA>000000000078</SEMILLA></SII:RESP_BODY></SII:RESPUESTA>
```

`tests/fixtures/sii/rest-token-ok.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema"><SII:RESP_HDR><ESTADO>00</ESTADO><GLOSA>Token Creado</GLOSA></SII:RESP_HDR><SII:RESP_BODY><TOKEN>RESTTOKEN1234</TOKEN></SII:RESP_BODY></SII:RESPUESTA>
```

`tests/fixtures/sii/html-maintenance.html`:

```html
<html><head><title>SII</title></head><body><h1>Sitio en mantención</h1><p>Intente más tarde.</p></body></html>
```

`tests/support/sii-client.ts` (shared by every operation test; outside Jest discovery):

```ts
import { loadCertificateFromPem } from '../../src/certificate/pem'
import { createSiiClient, type SiiClientOptions } from '../../src/sii/client'
import type { Logger } from '../../src/sii/logger'
import { createFakeSii, type FakeRoute, type FakeSii } from './fake-sii'
import { fixtureText, FIXED_NOW } from './fixtures'

export const certificate = loadCertificateFromPem(
  { privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') },
  { now: FIXED_NOW },
)
export const siiFixture = (name: string): string => fixtureText(`sii/${name}`)
export const COMPANY_RUT = '77111222-3'
export const SOAP_TOKEN = 'ABCDEFGHIJKLM'
export const REST_TOKEN = 'RESTTOKEN1234'

/** Routes that answer the SOAP and REST seed/token handshakes with the OK fixtures. */
export const authRoutes = (environment: 'certification' | 'production' = 'certification'): FakeRoute[] => {
  const soapHost = environment === 'production' ? 'palena' : 'maullin'
  const restHost = environment === 'production' ? 'api' : 'apicert'
  return [
    { url: `https://${soapHost}.sii.cl/DTEWS/CrSeed.jws`, reply: { body: siiFixture('soap-seed-ok.xml') } },
    { url: `https://${soapHost}.sii.cl/DTEWS/GetTokenFromSeed.jws`, reply: { body: siiFixture('soap-token-ok.xml') } },
    { url: `https://${restHost}.sii.cl/recursos/v1/boleta.electronica.semilla`, reply: { body: siiFixture('rest-seed-ok.xml'), encoding: 'utf8' } },
    { url: `https://${restHost}.sii.cl/recursos/v1/boleta.electronica.token`, reply: { body: siiFixture('rest-token-ok.xml'), encoding: 'utf8' } },
  ]
}

export type TestClock = { readonly now: () => Date; advance: (ms: number) => void }
export const testClock = (start: Date = FIXED_NOW): TestClock => {
  const state = { t: start.getTime() }
  return { now: () => new Date(state.t), advance: (ms) => void (state.t += ms) }
}

export type RecordingLogger = Logger & { readonly lines: readonly [string, string, unknown][] }
export const recordingLogger = (): RecordingLogger => {
  const lines: [string, string, unknown][] = []
  const log = (level: string) => (message: string, context?: unknown) => void lines.push([level, message, context])
  return { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error'), lines }
}

export type TestSii = { readonly fake: FakeSii; readonly clock: TestClock; readonly logger: RecordingLogger; readonly sleeps: number[]; readonly sii: ReturnType<typeof createSiiClient> }

/** A client wired to a fake SII, a controllable clock, a recording logger and a non-waiting sleep. */
export const testSii = (routes: FakeRoute[], options: Partial<SiiClientOptions> = {}): TestSii => {
  const fake = createFakeSii(routes)
  const clock = testClock()
  const logger = recordingLogger()
  const sleeps: number[] = []
  const { retry, ...rest } = options
  const sii = createSiiClient({
    environment: 'certification',
    certificate,
    companyRut: COMPANY_RUT,
    transport: fake.transport,
    logger,
    now: clock.now,
    sleep: async (ms) => void sleeps.push(ms),
    // No jitter in tests: delays are exact (2000, 3600, …) and the assertions stay deterministic.
    retry: retry === false ? false : { maxAttempts: 3, jitterRatio: 0, ...retry },
    ...rest,
  })
  return { fake, clock, logger, sleeps, sii }
}

export const expectCode = async (promise: Promise<unknown>, code: string, details?: Record<string, unknown>): Promise<void> => {
  const outcome = await promise.then(
    () => null,
    (error: unknown) => error,
  )
  if (outcome === null) throw new Error(`expected DteError ${code}`)
  expect(outcome).toMatchObject({ name: 'DteError', code, ...(details === undefined ? {} : { details: expect.objectContaining(details) }) })
}
```

- [ ] **Step 2: Failing tests**

`tests/sii/operation.test.ts`:

```ts
import { httpError, isSuccess, parseJson, readSiiResponse, retryAfterMs, siiTimestampToIso } from '../../src/sii/operation'

describe('operation helpers', () => {
  test('retryAfterMs reads X-Retry-After or Retry-After in seconds', () => {
    expect(retryAfterMs({ 'x-retry-after': '2' })).toBe(2000)
    expect(retryAfterMs({ 'retry-after': '0.5' })).toBe(500)
    expect(retryAfterMs({ 'retry-after': 'soon' })).toBeNull()
    expect(retryAfterMs({ 'retry-after': '-1' })).toBeNull()
    expect(retryAfterMs({})).toBeNull()
  })

  test('isSuccess and httpError', () => {
    expect(isSuccess(200)).toBe(true)
    expect(isSuccess(299)).toBe(true)
    expect(isSuccess(300)).toBe(false)
    expect(isSuccess(199)).toBe(false)
    const error = httpError({ status: 405, headers: { 'x-retry-after': '3' }, body: new Uint8Array() }, 'x'.repeat(3000), 'uploadEnvelope', 'rest')
    expect(error.code).toBe('SII_HTTP_ERROR')
    expect(error.details).toEqual({ httpStatus: 405, operation: 'uploadEnvelope', channel: 'rest', body: 'x'.repeat(2000), retryAfterMs: 3000 })
    expect(error.message).not.toContain('xxx')
  })

  test('readSiiResponse reads ESTADO and GLOSA or fails as invalid', () => {
    expect(readSiiResponse('<SII:RESPUESTA><SII:RESP_HDR><ESTADO> 00 </ESTADO><GLOSA>Ok</GLOSA></SII:RESP_HDR></SII:RESPUESTA>', 'getSeed')).toEqual({ code: '00', message: 'Ok' })
    expect(readSiiResponse('<R><ESTADO>-1</ESTADO></R>', 'getSeed')).toEqual({ code: '-1', message: null })
    expect(() => readSiiResponse('<html/>', 'getSeed')).toThrow(expect.objectContaining({ code: 'SII_RESPONSE_INVALID', details: { operation: 'getSeed', body: '<html/>' } }))
  })

  test('parseJson accepts objects only', () => {
    expect(parseJson('{"a":1}', 'x')).toEqual({ a: 1 })
    expect(() => parseJson('[1]', 'x')).toThrow(expect.objectContaining({ code: 'SII_RESPONSE_INVALID' }))
    expect(() => parseJson('null', 'x')).toThrow(expect.objectContaining({ code: 'SII_RESPONSE_INVALID' }))
    expect(() => parseJson('<html>', 'x')).toThrow(expect.objectContaining({ code: 'SII_RESPONSE_INVALID' }))
  })

  test('siiTimestampToIso normalises both SII layouts', () => {
    expect(siiTimestampToIso('2026-11-15 15:30:05')).toBe('2026-11-15T15:30:05')
    expect(siiTimestampToIso(' 15/11/2026 15:30:05 ')).toBe('2026-11-15T15:30:05')
    expect(siiTimestampToIso('15-11-2026 15:30:05')).toBe('2026-11-15T15:30:05')
    expect(siiTimestampToIso('yesterday')).toBeNull()
    expect(siiTimestampToIso(null)).toBeNull()
  })
})
```

`tests/sii/auth.test.ts`:

```ts
import { DteError } from '../../src/errors'
import { getSeed, getToken, invalidateToken, signSeed, withToken } from '../../src/sii/auth'
import { buildSoapEnvelope } from '../../src/sii/soap'
import { tokenCacheKey } from '../../src/sii/token-cache'
import { authRoutes, certificate, expectCode, siiFixture, SOAP_TOKEN, REST_TOKEN, testSii } from '../support/sii-client'

const SOAP_SEED = 'https://maullin.sii.cl/DTEWS/CrSeed.jws'
const SOAP_TOKEN_URL = 'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws'
const REST_SEED = 'https://apicert.sii.cl/recursos/v1/boleta.electronica.semilla'
const REST_TOKEN_URL = 'https://apicert.sii.cl/recursos/v1/boleta.electronica.token'

describe('signSeed', () => {
  test('declaration line, then the signed getToken on one logical line, no trailing newline', () => {
    const signed = signSeed('000000000078', certificate)
    const [first, ...rest] = signed.split('\n')
    expect(first).toBe('<?xml version="1.0" encoding="UTF-8"?>')
    expect(rest.join('\n').startsWith('<getToken><item><Semilla>000000000078</Semilla></item><Signature xmlns="http://www.w3.org/2000/09/xmldsig#">')).toBe(true)
    expect(signed.endsWith('</Signature></getToken>')).toBe(true)
    expect(signed).toContain('<Reference URI="">')
  })

  test('refuses anything that is not a digit string', () => {
    expect(() => signSeed('12<x/>', certificate)).toThrow(expect.objectContaining({ code: 'INVALID_OPTION', details: { field: 'seed' } }))
    expect(() => signSeed('', certificate)).toThrow(DteError)
  })
})

describe('getSeed', () => {
  test('SOAP: posts the getSeed envelope and reads SEMILLA from the escaped reply', async () => {
    const { sii, fake } = testSii(authRoutes())
    expect(await getSeed(sii, 'soap')).toBe('000000000078')
    expect(fake.requests).toHaveLength(1)
    expect(fake.requests[0].method).toBe('POST')
    expect(fake.requests[0].url).toBe(SOAP_SEED)
    expect(fake.requests[0].headers['content-type']).toBe('text/xml; charset=utf-8')
    expect(fake.requests[0].headers.soapaction).toBe('')
    expect(fake.requests[0].text).toBe(buildSoapEnvelope({ method: 'getSeed' }))
  })

  test('REST: GETs the seed with Accept application/xml', async () => {
    const { sii, fake } = testSii(authRoutes())
    expect(await getSeed(sii, 'rest')).toBe('000000000078')
    expect(fake.requests[0]).toMatchObject({ method: 'GET', url: REST_SEED, body: null })
    expect(fake.requests[0].headers.accept).toBe('application/xml')
  })

  test('ESTADO other than 00 is SII_SEED_FAILED with the code', async () => {
    const { sii } = testSii([{ url: SOAP_SEED, reply: { body: siiFixture('soap-seed-error.xml') } }])
    await expectCode(getSeed(sii, 'soap'), 'SII_SEED_FAILED', { code: '-2', channel: 'soap' })
  })

  test('an HTML page is SII_RESPONSE_INVALID and gets retried', async () => {
    const { sii, fake, sleeps } = testSii([{ url: SOAP_SEED, reply: [{ body: siiFixture('html-maintenance.html') }, { body: siiFixture('soap-seed-ok.xml') }] }])
    expect(await getSeed(sii, 'soap')).toBe('000000000078')
    expect(fake.requests).toHaveLength(2)
    expect(sleeps).toHaveLength(1)
    const dead = testSii([{ url: SOAP_SEED, reply: { body: siiFixture('html-maintenance.html') } }], { retry: { maxAttempts: 2 } })
    await expectCode(getSeed(dead.sii, 'soap'), 'SII_RESPONSE_INVALID', { operation: 'getSeed', attempts: 2 })
  })

  test('a SOAP fault, an HTTP error and a transport failure are classified', async () => {
    const fault = testSii([{ url: SOAP_SEED, reply: { body: siiFixture('soap-fault.xml') } }])
    await expectCode(getSeed(fault.sii, 'soap'), 'SII_SOAP_FAULT', { code: 'soapenv:Server', reason: 'Error de Autenticacion: TOKEN invalido' })
    const http = testSii([{ url: SOAP_SEED, reply: { status: 500, body: 'boom' } }], { retry: false })
    await expectCode(getSeed(http.sii, 'soap'), 'SII_HTTP_ERROR', { httpStatus: 500, operation: 'getSeed', channel: 'soap' })
    const down = testSii([{ url: SOAP_SEED, reply: new DteError('TRANSPORT_FAILED', { reason: 'ECONNREFUSED' }) }], { retry: { maxAttempts: 2 } })
    await expectCode(getSeed(down.sii, 'soap'), 'TRANSPORT_FAILED', { reason: 'ECONNREFUSED', attempts: 2 })
    expect(down.sleeps).toEqual([2000])
    expect(down.logger.lines.some(([level, message]) => level === 'warn' && message === 'sii retrying')).toBe(true)
  })

  test('a reply without SEMILLA is invalid', async () => {
    const noSeed = siiFixture('soap-seed-ok.xml').replace('&lt;SEMILLA&gt;000000000078&lt;/SEMILLA&gt;', '')
    const { sii } = testSii([{ url: SOAP_SEED, reply: { body: noSeed } }], { retry: false })
    await expectCode(getSeed(sii, 'soap'), 'SII_RESPONSE_INVALID', { operation: 'getSeed' })
  })
})

describe('getToken', () => {
  test('SOAP: seed → signed seed inside pszXml → token, cached with the TTL', async () => {
    const { sii, fake, clock, logger } = testSii(authRoutes())
    expect(await getToken(sii, 'soap')).toBe(SOAP_TOKEN)
    expect(fake.requests.map((r) => r.url)).toEqual([SOAP_SEED, SOAP_TOKEN_URL])
    const envelope = fake.requests[1].text
    expect(envelope).toContain('<getToken><pszXml>&lt;?xml version=&quot;1.0&quot; encoding=&quot;UTF-8&quot;?&gt;\n&lt;getToken&gt;&lt;item&gt;&lt;Semilla&gt;000000000078&lt;/Semilla&gt;&lt;/item&gt;&lt;Signature')
    const key = tokenCacheKey('certification', 'soap', certificate)
    expect(await sii.tokenCache.get(key)).toEqual({ token: SOAP_TOKEN, expiresAt: clock.now().getTime() + sii.tokenTtlMs })
    expect(logger.lines).toContainEqual(['info', 'sii token obtained', { channel: 'soap' }])
    expect(await getToken(sii, 'soap')).toBe(SOAP_TOKEN)
    expect(fake.requests).toHaveLength(2)
    clock.advance(sii.tokenTtlMs + 1)
    expect(await getToken(sii, 'soap')).toBe(SOAP_TOKEN)
    expect(fake.requests).toHaveLength(4)
  })

  test('REST: posts the signed seed as application/xml and caches under the rest key', async () => {
    const { sii, fake } = testSii(authRoutes())
    expect(await getToken(sii, 'rest')).toBe(REST_TOKEN)
    expect(fake.requests.map((r) => r.url)).toEqual([REST_SEED, REST_TOKEN_URL])
    expect(fake.requests[1].headers['content-type']).toBe('application/xml')
    expect(fake.requests[1].headers.accept).toBe('application/xml')
    expect(new TextDecoder().decode(fake.requests[1].body!)).toBe(signSeed('000000000078', certificate))
    expect(await sii.tokenCache.get(tokenCacheKey('certification', 'rest', certificate))).toMatchObject({ token: REST_TOKEN })
    expect(await sii.tokenCache.get(tokenCacheKey('certification', 'soap', certificate))).toBeNull()
  })

  test('token failures', async () => {
    const bad = testSii([...authRoutes().slice(0, 1), { url: SOAP_TOKEN_URL, reply: { body: siiFixture('soap-token-error-05.xml') } }])
    await expectCode(getToken(bad.sii, 'soap'), 'SII_TOKEN_FAILED', { code: '05', channel: 'soap' })
    const noToken = siiFixture('soap-token-ok.xml').replace('&lt;TOKEN&gt;ABCDEFGHIJKLM&lt;/TOKEN&gt;', '')
    const empty = testSii([...authRoutes().slice(0, 1), { url: SOAP_TOKEN_URL, reply: { body: noToken } }], { retry: false })
    await expectCode(getToken(empty.sii, 'soap'), 'SII_RESPONSE_INVALID', { operation: 'getToken' })
    const http = testSii([...authRoutes().slice(2, 3), { url: REST_TOKEN_URL, reply: { status: 500, body: 'x' } }], { retry: false })
    await expectCode(getToken(http.sii, 'rest'), 'SII_HTTP_ERROR', { httpStatus: 500, operation: 'getToken', channel: 'rest' })
  })

  test('invalidateToken removes the cached entry', async () => {
    const { sii, fake } = testSii(authRoutes())
    await getToken(sii, 'soap')
    await invalidateToken(sii, 'soap')
    await getToken(sii, 'soap')
    expect(fake.requests).toHaveLength(4)
  })
})

describe('withToken', () => {
  test('passes the token through and returns the result', async () => {
    const { sii } = testSii(authRoutes())
    expect(await withToken(sii, 'soap', undefined, async (token) => `used:${token}`)).toBe(`used:${SOAP_TOKEN}`)
  })

  test('renews once when the SII rejects the token, then gives up', async () => {
    const { sii, fake, logger } = testSii(authRoutes())
    const seen: string[] = []
    const result = await withToken(sii, 'soap', undefined, async (token) => {
      seen.push(token)
      if (seen.length === 1) throw new DteError('SII_TOKEN_INVALID', { operation: 'uploadEnvelope' })
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(seen).toEqual([SOAP_TOKEN, SOAP_TOKEN])
    expect(fake.requests).toHaveLength(4)
    expect(logger.lines).toContainEqual(['warn', 'sii token rejected, renewing once', { channel: 'soap', operation: 'uploadEnvelope' }])
    await expectCode(
      withToken(sii, 'soap', undefined, async () => {
        throw new DteError('SII_TOKEN_INVALID', { operation: 'queryUploadStatus' })
      }),
      'SII_TOKEN_INVALID',
      { operation: 'queryUploadStatus', channel: 'soap', attempts: 2 },
    )
  })

  test('other errors pass through untouched, with or without a renewal in between', async () => {
    const { sii } = testSii(authRoutes())
    const boom = new DteError('SII_UPLOAD_REJECTED', { status: '3' })
    await expect(withToken(sii, 'soap', undefined, async () => Promise.reject(boom))).rejects.toBe(boom)
    const calls = { n: 0 }
    await expect(
      withToken(sii, 'soap', undefined, async () => {
        calls.n += 1
        throw calls.n === 1 ? new DteError('SII_TOKEN_INVALID') : boom
      }),
    ).rejects.toBe(boom)
    await expect(withToken(sii, 'soap', undefined, async () => Promise.reject(new Error('plain')))).rejects.toThrow('plain')
  })
})
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npx jest tests/sii/operation.test.ts tests/sii/auth.test.ts`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 4: Implementation**

`src/sii/operation.ts`:

```ts
import { DteError } from '../errors'
import { extractTagContent } from '../xml/parse'
import { retryFor, timeoutFor, type CallOverrides, type SiiClient } from './client'
import type { RetryOptions } from './retry'
import { send } from './send'
import { buildSoapEnvelope, parseSoapResponse, SOAP_HEADERS, type SoapParam } from './soap'
import type { TokenChannel } from './token-cache'
import { decodeBody, encodeUtf8, type HttpMethod, type HttpResponse } from './transport'

const EXCERPT_CHARS = 2000

/**
 * EN: First 2 000 characters of a body, for `details.body` (never part of a message).
 * ES: Primeros 2 000 caracteres de un cuerpo, para `details.body` (nunca parte de un mensaje).
 */
export const bodyExcerpt = (text: string): string => text.slice(0, EXCERPT_CHARS)

/**
 * EN: `X-Retry-After` / `Retry-After` in seconds → ms, or null.
 * ES: `X-Retry-After` / `Retry-After` en segundos → ms, o null.
 */
export const retryAfterMs = (headers: Readonly<Record<string, string>>): number | null => {
  const raw = headers['x-retry-after'] ?? headers['retry-after']
  if (raw === undefined) return null
  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null
}

/**
 * EN: True for 2xx.
 * ES: True para 2xx.
 */
export const isSuccess = (status: number): boolean => status >= 200 && status < 300

/**
 * EN: `SII_HTTP_ERROR` for a non-2xx response; carries the status, an excerpt of the body and the SII retry hint.
 * ES: `SII_HTTP_ERROR` para una respuesta no 2xx; trae el estado, un extracto del cuerpo y la sugerencia de reintento del SII.
 */
export const httpError = (response: HttpResponse, text: string, operation: string, channel: TokenChannel): DteError =>
  new DteError('SII_HTTP_ERROR', {
    httpStatus: response.status,
    operation,
    channel,
    body: bodyExcerpt(text),
    retryAfterMs: retryAfterMs(response.headers),
  })

/**
 * EN: `RESP_HDR` of a `SII:RESPUESTA` document.
 * ES: `RESP_HDR` de un documento `SII:RESPUESTA`.
 */
export type SiiResponseHeader = {
  /** EN: `ESTADO`, trimmed. ES: `ESTADO`, sin espacios. */
  readonly code: string
  /** EN: `GLOSA` or null. ES: `GLOSA` o null. */
  readonly message: string | null
}

/**
 * EN: Reads `ESTADO` and `GLOSA`; a document without `ESTADO` is `SII_RESPONSE_INVALID`.
 * ES: Lee `ESTADO` y `GLOSA`; un documento sin `ESTADO` es `SII_RESPONSE_INVALID`.
 */
export const readSiiResponse = (xml: string, operation: string): SiiResponseHeader => {
  const code = extractTagContent(xml, 'ESTADO')
  if (code === null) throw new DteError('SII_RESPONSE_INVALID', { operation, body: bodyExcerpt(xml) })
  return { code: code.trim(), message: extractTagContent(xml, 'GLOSA') }
}

/**
 * EN: Parses a JSON object body; anything else is `SII_RESPONSE_INVALID`.
 * ES: Parsea un cuerpo JSON objeto; cualquier otra cosa es `SII_RESPONSE_INVALID`.
 */
export const parseJson = (text: string, operation: string): Readonly<Record<string, unknown>> => {
  const parsed: unknown = (() => {
    try {
      return JSON.parse(text)
    } catch {
      return undefined
    }
  })()
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new DteError('SII_RESPONSE_INVALID', { operation, body: bodyExcerpt(text) })
  return parsed as Readonly<Record<string, unknown>>
}

/**
 * EN: `YYYY-MM-DD HH:MM:SS` or `DD/MM/YYYY HH:MM:SS` (also with `-`) → `YYYY-MM-DDTHH:MM:SS`; null when it does not parse.
 * ES: `AAAA-MM-DD HH:MM:SS` o `DD/MM/AAAA HH:MM:SS` (también con `-`) → `AAAA-MM-DDTHH:MM:SS`; null si no calza.
 */
export const siiTimestampToIso = (value: string | null): string | null => {
  if (value === null) return null
  const text = value.trim()
  const ymd = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(text)
  if (ymd !== null) return `${ymd[1]}-${ymd[2]}-${ymd[3]}T${ymd[4]}`
  const dmy = /^(\d{2})[-/](\d{2})[-/](\d{4})[ T](\d{2}:\d{2}:\d{2})/.exec(text)
  return dmy === null ? null : `${dmy[3]}-${dmy[2]}-${dmy[1]}T${dmy[4]}`
}

/**
 * EN: `RetryOptions` for an operation: the client's sleep, the caller's signal and a `warn` line per retry.
 * ES: `RetryOptions` de una operación: el sleep del cliente, el signal del llamador y una línea `warn` por reintento.
 */
export const retryOptions = (sii: SiiClient, operation: string, overrides?: CallOverrides): RetryOptions => ({
  sleep: sii.sleep,
  signal: overrides?.signal,
  onRetry: (error, attempt, delayMs) => sii.logger.warn('sii retrying', { operation, attempt, delayMs, code: error.code }),
})

/**
 * EN: Input of `soapCall`.
 * ES: Entrada de `soapCall`.
 */
export type SoapCallInput = {
  readonly operation: string
  readonly url: string
  readonly method: string
  readonly params: readonly SoapParam[]
  readonly attempt: number
  readonly overrides?: CallOverrides
}

/**
 * EN: One DTEWS SOAP attempt: UTF-8 envelope out, Latin-1 reply in; returns the unescaped `<…Return>` payload.
 * ES: Un intento SOAP DTEWS: sobre UTF-8 de ida, respuesta Latin-1 de vuelta; devuelve el contenido des-escapado de `<…Return>`.
 * @throws {DteError} EN: `SII_HTTP_ERROR`, `SII_SOAP_FAULT`, `SII_RESPONSE_INVALID` plus the transport codes. ES: los mismos códigos.
 */
export const soapCall = async (sii: SiiClient, input: SoapCallInput): Promise<string> => {
  const response = await send(sii, {
    operation: input.operation,
    channel: 'soap',
    method: 'POST',
    url: input.url,
    headers: SOAP_HEADERS,
    body: encodeUtf8(buildSoapEnvelope({ method: input.method, params: input.params })),
    timeoutMs: timeoutFor(sii, 'soap', input.overrides),
    signal: input.overrides?.signal,
    attempt: input.attempt,
    requestEncoding: 'utf8',
  })
  const text = decodeBody(response.body, 'latin1')
  if (!isSuccess(response.status)) throw httpError(response, text, input.operation, 'soap')
  const parsed = parseSoapResponse(text)
  if (parsed.fault !== null)
    throw new DteError('SII_SOAP_FAULT', { code: parsed.fault.code, reason: parsed.fault.reason, operation: input.operation })
  if (parsed.returnValue === null) throw new DteError('SII_RESPONSE_INVALID', { operation: input.operation, body: bodyExcerpt(text) })
  return parsed.returnValue
}

/**
 * EN: Input of `restCall`.
 * ES: Entrada de `restCall`.
 */
export type RestCallInput = {
  readonly operation: string
  readonly method: HttpMethod
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly body?: Uint8Array
  readonly attempt: number
  readonly overrides?: CallOverrides
  /** EN: Which timeout applies (`rest` by default, `upload` for uploads). ES: Qué timeout aplica (`rest` por defecto, `upload` en subidas). */
  readonly timeoutKind?: 'rest' | 'upload'
  /** EN: Charset of the request body for the capture. ES: Charset del cuerpo enviado para la captura. */
  readonly requestEncoding?: 'latin1' | 'utf8'
}

/**
 * EN: One receipts-API attempt: returns the response and its UTF-8 text; the caller classifies the status.
 * ES: Un intento contra la API de boletas: devuelve la respuesta y su texto UTF-8; el llamador clasifica el estado.
 */
export const restCall = async (
  sii: SiiClient,
  input: RestCallInput,
): Promise<{ readonly response: HttpResponse; readonly text: string }> => {
  const response = await send(sii, {
    operation: input.operation,
    channel: 'rest',
    method: input.method,
    url: input.url,
    headers: input.headers,
    body: input.body,
    timeoutMs: timeoutFor(sii, input.timeoutKind ?? 'rest', input.overrides),
    signal: input.overrides?.signal,
    attempt: input.attempt,
    requestEncoding: input.requestEncoding,
  })
  return { response, text: decodeBody(response.body, 'utf8') }
}

/**
 * EN: `restCall` that must succeed (2xx), else `SII_HTTP_ERROR`.
 * ES: `restCall` que debe tener éxito (2xx), si no `SII_HTTP_ERROR`.
 */
export const restText = async (sii: SiiClient, input: RestCallInput): Promise<string> => {
  const { response, text } = await restCall(sii, input)
  if (!isSuccess(response.status)) throw httpError(response, text, input.operation, 'rest')
  return text
}

/** EN: Re-exported for the operations' convenience. ES: Re-exportado por comodidad de las operaciones. */
export { retryFor }
```

`src/sii/auth.ts`:

```ts
import type { Certificate } from '../certificate/certificate'
import { DteError, isDteError } from '../errors'
import { signRootElement } from '../signature/xmldsig'
import { extractTagContent } from '../xml/parse'
import type { CallOverrides, SiiClient } from './client'
import { bodyExcerpt, readSiiResponse, restText, retryFor, retryOptions, soapCall } from './operation'
import { withRetry } from './retry'
import { tokenCacheKey, type TokenChannel } from './token-cache'
import { encodeUtf8 } from './transport'

const SEED_PATTERN = /^\d{1,32}$/

/**
 * EN: Signs a seed for `GetTokenFromSeed` / the REST token endpoint: XML declaration, one newline, then
 * `<getToken><item><Semilla>…</Semilla></item><Signature…/></getToken>` with no trailing newline (the REST endpoint
 * is byte-strict about this layout). Pure and synchronous.
 * ES: Firma una semilla para `GetTokenFromSeed` / el endpoint REST de token: declaración XML, un salto de línea y
 * luego `<getToken><item><Semilla>…</Semilla></item><Signature…/></getToken>` sin salto final (el endpoint REST es
 * estricto con esta disposición). Pura y síncrona.
 * @throws {DteError} EN: `INVALID_OPTION { field: 'seed' }` when the seed is not a digit string. ES: `INVALID_OPTION { field: 'seed' }` si la semilla no es una cadena de dígitos.
 */
export const signSeed = (
  seed: string,
  certificate: Pick<Certificate, 'privateKeyPem' | 'publicKey' | 'certificateBase64'>,
): string => {
  if (!SEED_PATTERN.test(seed)) throw new DteError('INVALID_OPTION', { field: 'seed' })
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<getToken><item><Semilla>${seed}</Semilla></item></getToken>`
  return signRootElement({ xml, rootTag: 'getToken', certificate }).xml
}

const requireTag = (xml: string, tag: string, operation: string): string => {
  const value = extractTagContent(xml, tag)
  if (value === null) throw new DteError('SII_RESPONSE_INVALID', { operation, body: bodyExcerpt(xml) })
  return value.trim()
}

/**
 * EN: Asks the SII for a seed on the given channel (SOAP `CrSeed` or REST `boleta.electronica.semilla`). The seed is a
 * 12-digit string valid for two minutes; it is never cached.
 * ES: Pide una semilla al SII por el canal indicado (SOAP `CrSeed` o REST `boleta.electronica.semilla`). La semilla es
 * un string de 12 dígitos vigente dos minutos; nunca se cachea.
 * @throws {DteError} EN: `SII_SEED_FAILED { code }`, `SII_RESPONSE_INVALID`, `SII_HTTP_ERROR`, `SII_SOAP_FAULT`, transport codes. ES: los mismos códigos.
 */
export const getSeed = (sii: SiiClient, channel: TokenChannel, overrides?: CallOverrides): Promise<string> =>
  withRetry(
    retryFor(sii, overrides),
    async (attempt) => {
      const xml =
        channel === 'soap'
          ? await soapCall(sii, { operation: 'getSeed', url: sii.endpoints.soap.seed, method: 'getSeed', params: [], attempt, overrides })
          : await restText(sii, { operation: 'getSeed', method: 'GET', url: sii.endpoints.rest.seed, headers: { Accept: 'application/xml' }, attempt, overrides })
      const { code } = readSiiResponse(xml, 'getSeed')
      if (code !== '00') throw new DteError('SII_SEED_FAILED', { code, channel })
      return requireTag(xml, 'SEMILLA', 'getSeed')
    },
    retryOptions(sii, 'getSeed', overrides),
  )

const requestToken = (sii: SiiClient, channel: TokenChannel, signedSeed: string, overrides?: CallOverrides): Promise<string> =>
  withRetry(
    retryFor(sii, overrides),
    async (attempt) => {
      const xml =
        channel === 'soap'
          ? await soapCall(sii, {
              operation: 'getToken',
              url: sii.endpoints.soap.token,
              method: 'getToken',
              params: [{ name: 'pszXml', value: signedSeed }],
              attempt,
              overrides,
            })
          : await restText(sii, {
              operation: 'getToken',
              method: 'POST',
              url: sii.endpoints.rest.token,
              headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' },
              body: encodeUtf8(signedSeed),
              attempt,
              overrides,
            })
      const { code } = readSiiResponse(xml, 'getToken')
      if (code !== '00') throw new DteError('SII_TOKEN_FAILED', { code, channel })
      return requireTag(xml, 'TOKEN', 'getToken')
    },
    retryOptions(sii, 'getToken', overrides),
  )

/**
 * EN: Returns a valid token for the channel: the cached one while it has not expired, otherwise seed → signed seed →
 * token, stored in the cache for `tokenTtlMs`. The DTEWS token and the REST token are different things.
 * ES: Devuelve un token vigente para el canal: el de la caché mientras no venza, si no semilla → semilla firmada →
 * token, guardado en caché por `tokenTtlMs`. El token DTEWS y el token REST son cosas distintas.
 * @throws {DteError} EN: the codes of `getSeed` plus `SII_TOKEN_FAILED { code }`. ES: los códigos de `getSeed` más `SII_TOKEN_FAILED { code }`.
 */
export const getToken = async (sii: SiiClient, channel: TokenChannel, overrides?: CallOverrides): Promise<string> => {
  const key = tokenCacheKey(sii.environment, channel, sii.certificate)
  const cached = await sii.tokenCache.get(key)
  if (cached !== null && cached.expiresAt > sii.now().getTime()) return cached.token
  const seed = await getSeed(sii, channel, overrides)
  const token = await requestToken(sii, channel, signSeed(seed, sii.certificate), overrides)
  await sii.tokenCache.set(key, { token, expiresAt: sii.now().getTime() + sii.tokenTtlMs })
  sii.logger.info('sii token obtained', { channel })
  return token
}

/**
 * EN: Forgets the cached token of a channel (the next operation authenticates again).
 * ES: Olvida el token en caché de un canal (la próxima operación vuelve a autenticarse).
 */
export const invalidateToken = (sii: SiiClient, channel: TokenChannel): Promise<void> =>
  sii.tokenCache.delete(tokenCacheKey(sii.environment, channel, sii.certificate))

/**
 * EN: Runs `call(token)`; when it throws `SII_TOKEN_INVALID` (the SII rejected the token) the cached token is dropped,
 * a fresh one obtained and `call` run once more. A second rejection surfaces as `SII_TOKEN_INVALID` with
 * `attempts: 2`. Any other error passes through.
 * ES: Ejecuta `call(token)`; si lanza `SII_TOKEN_INVALID` (el SII rechazó el token) se descarta el token en caché, se
 * obtiene uno nuevo y `call` se ejecuta una vez más. Un segundo rechazo sale como `SII_TOKEN_INVALID` con
 * `attempts: 2`. Cualquier otro error pasa tal cual.
 */
export const withToken = async <T>(
  sii: SiiClient,
  channel: TokenChannel,
  overrides: CallOverrides | undefined,
  call: (token: string) => Promise<T>,
): Promise<T> => {
  const first = await getToken(sii, channel, overrides)
  try {
    return await call(first)
  } catch (error) {
    if (!isDteError(error) || error.code !== 'SII_TOKEN_INVALID') throw error
    sii.logger.warn('sii token rejected, renewing once', { channel, operation: error.details.operation })
    await invalidateToken(sii, channel)
    const fresh = await getToken(sii, channel, overrides)
    try {
      return await call(fresh)
    } catch (second) {
      if (isDteError(second) && second.code === 'SII_TOKEN_INVALID')
        throw new DteError('SII_TOKEN_INVALID', { ...second.details, channel, attempts: 2 })
      throw second
    }
  }
}
```

- [ ] **Step 5: Run them and watch them pass**

Run: `npx jest tests/sii/operation.test.ts tests/sii/auth.test.ts`
Expected: PASS. If `tests/support/sii-client.ts` is picked up as a test file, check `testPathIgnorePatterns` in `jest.config.cjs` still contains `<rootDir>/tests/support/`.

- [ ] **Step 6: Commit**

```bash
git add src/sii/operation.ts src/sii/auth.ts tests/fixtures/sii tests/support/sii-client.ts tests/sii/operation.test.ts tests/sii/auth.test.ts
git commit -m "feat: SII seed and token on the SOAP and REST channels with cache and renew-once

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 13: Uploads through `DTEUpload` and the receipts REST API (`src/sii/upload.ts`)

**Files:**
- Create: `src/sii/upload.ts`, `tests/fixtures/sii/reception-ok.xml`, `tests/fixtures/sii/reception-schema-error.xml`, `tests/fixtures/sii/reception-duplicate-7.xml`, `tests/fixtures/sii/reception-duplicate-99.xml`, `tests/fixtures/sii/reception-not-authenticated.xml`, `tests/fixtures/sii/rest-upload-ok.json`
- Test: `tests/sii/upload.test.ts`

- [ ] **Step 1: Fixtures**

`tests/fixtures/sii/reception-ok.xml`:

```xml
<?xml version="1.0" encoding="ISO-8859-1"?>
<RECEPCIONDTE>
<RUTSENDER>76543210-3</RUTSENDER>
<RUTCOMPANY>77111222-3</RUTCOMPANY>
<FILE>EnvioDTE.xml</FILE>
<TIMESTAMP>2026-11-15 15:30:05</TIMESTAMP>
<STATUS>0</STATUS>
<TRACKID>9876543210</TRACKID>
</RECEPCIONDTE>
```

`tests/fixtures/sii/reception-schema-error.xml`:

```xml
<?xml version="1.0" encoding="ISO-8859-1"?>
<RECEPCIONDTE>
<RUTSENDER>76543210-3</RUTSENDER>
<RUTCOMPANY>77111222-3</RUTCOMPANY>
<FILE>EnvioDTE.xml</FILE>
<TIMESTAMP>2026-11-15 15:30:05</TIMESTAMP>
<STATUS>7</STATUS>
<DETAIL>
<ERROR>SCH-00001: Error de Esquema</ERROR>
<ERROR>cvc-complex-type.2.4.a: Invalid content was found starting with element 'Detalle'.</ERROR>
</DETAIL>
</RECEPCIONDTE>
```

`tests/fixtures/sii/reception-duplicate-7.xml`:

```xml
<?xml version="1.0" encoding="ISO-8859-1"?>
<RECEPCIONDTE>
<RUTSENDER>76543210-3</RUTSENDER>
<RUTCOMPANY>77111222-3</RUTCOMPANY>
<FILE>EnvioDTE.xml</FILE>
<TIMESTAMP>2026-11-15 15:31:00</TIMESTAMP>
<STATUS>7</STATUS>
<TRACKID>9876543210</TRACKID>
<DETAIL>
<ERROR>Archivo ya fue enviado anteriormente</ERROR>
</DETAIL>
</RECEPCIONDTE>
```

`tests/fixtures/sii/reception-duplicate-99.xml`:

```xml
<?xml version="1.0" encoding="ISO-8859-1"?>
<RECEPCIONDTE>
<RUTSENDER>76543210-3</RUTSENDER>
<RUTCOMPANY>77111222-3</RUTCOMPANY>
<FILE>EnvioDTE.xml</FILE>
<TIMESTAMP>2026-11-15 15:32:00</TIMESTAMP>
<STATUS>99</STATUS>
<DETAIL>
<ERROR>Archivo ya fue enviado 2 veces con Trackid 9876543210</ERROR>
</DETAIL>
</RECEPCIONDTE>
```

`tests/fixtures/sii/reception-not-authenticated.xml`:

```xml
<?xml version="1.0" encoding="ISO-8859-1"?>
<RECEPCIONDTE>
<RUTSENDER>76543210-3</RUTSENDER>
<RUTCOMPANY>77111222-3</RUTCOMPANY>
<FILE>EnvioDTE.xml</FILE>
<TIMESTAMP>2026-11-15 15:33:00</TIMESTAMP>
<STATUS>5</STATUS>
</RECEPCIONDTE>
```

`tests/fixtures/sii/rest-upload-ok.json`:

```json
{"rut_emisor":"77111222-3","rut_envia":"76543210-3","trackid":1234567890,"fecha_recepcion":"2026-11-15 15:30:05","estado":"REC","file":"EnvioBOLETA.xml"}
```

- [ ] **Step 2: Failing test**

`tests/sii/upload.test.ts`:

```ts
import type { SignedEnvelope } from '../../src/envelope/sign'
import { DteError } from '../../src/errors'
import { createMemoryUploadArchive } from '../../src/sii/archive'
import { parseReceptionResponse, uploadBook, uploadEnvelope, uploadFolioConsumption } from '../../src/sii/upload'
import { decodeLatin1 } from '../../src/text/latin1'
import type { FakeRoute } from '../support/fake-sii'
import { ISSUER_RUT } from '../support/fixtures'
import { authRoutes, COMPANY_RUT, expectCode, REST_TOKEN, siiFixture, SOAP_TOKEN, testSii } from '../support/sii-client'

const CGI = 'https://maullin.sii.cl/cgi_dte/UPL/DTEUpload'
const REST_UPLOAD_CERT = 'https://pangal.sii.cl/recursos/v1/boleta.electronica.envio'
const REST_UPLOAD_PROD = 'https://rahue.sii.cl/recursos/v1/boleta.electronica.envio'
const dteXml = '<?xml version="1.0" encoding="ISO-8859-1"?>\n<EnvioDTE><SetDTE ID="SetDoc">Ñandú</SetDTE></EnvioDTE>'
const receiptXml = '<?xml version="1.0" encoding="ISO-8859-1"?>\n<EnvioBOLETA><SetDTE ID="SetDoc">Café</SetDTE></EnvioBOLETA>'
const reception = (name: string) => ({ body: siiFixture(name) })
const withStatus = (status: string) => ({ body: siiFixture('reception-ok.xml').replace('<STATUS>0</STATUS>', `<STATUS>${status}</STATUS>`) })
const cgi = (reply: FakeRoute['reply']): FakeRoute[] => [...authRoutes(), { url: CGI, reply }]
const fakeSigned = (count: number): SignedEnvelope =>
  ({
    kind: 'receipt',
    setId: 'ENVIOBOLETA_1',
    xml: receiptXml,
    signature: { digestValue: '', signatureValue: '' },
    documents: [],
    cover: { issuerRut: COMPANY_RUT, senderRut: ISSUER_RUT, receiverRut: '60803000-K', resolutionDate: '2026-01-01', resolutionNumber: 0, signedAt: '2026-11-15T15:30:00', subtotals: [{ type: 39, count }] },
  }) as unknown as SignedEnvelope

describe('uploadEnvelope through DTEUpload', () => {
  test('authenticates, posts the exact multipart and parses RECEPCIONDTE', async () => {
    const memory = createMemoryUploadArchive()
    const { sii, fake } = testSii(cgi(reception('reception-ok.xml')), { archive: memory.archive })
    const receipt = await uploadEnvelope(sii, { envelope: { kind: 'dte', xml: dteXml } })
    expect(fake.requests.map((r) => r.url)).toEqual([
      'https://maullin.sii.cl/DTEWS/CrSeed.jws',
      'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws',
      CGI,
    ])
    const upload = fake.requests[2]
    expect(upload.headers['user-agent']).toBe('Mozilla/4.0 ( compatible; PROG 1.0; Windows NT)')
    expect(upload.headers.cookie).toBe(`TOKEN=${SOAP_TOKEN}`)
    expect(upload.headers.accept).toBe('*/*')
    expect(upload.headers['content-type']).toMatch(/^multipart\/form-data; boundary=----WebKitFormBoundary[A-Za-z0-9]{16}$/)
    expect(upload.headers['content-length']).toBe(String(upload.body!.length))
    expect(upload.parts).toEqual([
      { name: 'rutSender', fileName: null, contentType: null, value: '76543210' },
      { name: 'dvSender', fileName: null, contentType: null, value: '3' },
      { name: 'rutCompany', fileName: null, contentType: null, value: '77111222' },
      { name: 'dvCompany', fileName: null, contentType: null, value: '3' },
      { name: 'archivo', fileName: 'EnvioDTE.xml', contentType: 'text/xml', value: dteXml },
    ])
    expect(Array.from(upload.body!).includes(0xd1)).toBe(true)
    expect(Array.from(upload.body!).includes(0xc3)).toBe(false)
    expect(receipt).toEqual({
      trackId: '9876543210',
      receivedAt: '2026-11-15T15:30:05',
      kind: 'dte',
      channel: 'soap',
      fileName: 'EnvioDTE.xml',
      duplicate: false,
      raw: expect.stringContaining('<RECEPCIONDTE>'),
    })
    expect(memory.records()).toHaveLength(1)
    expect(memory.records()[0]).toMatchObject({
      environment: 'certification',
      kind: 'dte',
      channel: 'soap',
      trackId: '9876543210',
      duplicate: false,
      companyRut: COMPANY_RUT,
      senderRut: ISSUER_RUT,
      fileName: 'EnvioDTE.xml',
      sentAt: '2026-11-15T18:30:00.000Z',
      response: { httpStatus: 200, code: '0', raw: expect.stringContaining('<TRACKID>9876543210</TRACKID>') },
    })
    expect(decodeLatin1(memory.records()[0].xml)).toBe(dteXml)
  })

  test('adds the ISO-8859-1 prolog when the XML has none and keeps an existing one', async () => {
    const { sii, fake } = testSii(cgi(reception('reception-ok.xml')))
    await uploadEnvelope(sii, { envelope: { kind: 'dte', xml: '<EnvioDTE/>' } })
    expect(fake.requests[2].parts[4].value).toBe('<?xml version="1.0" encoding="ISO-8859-1"?>\n<EnvioDTE/>')
    await uploadEnvelope(sii, { envelope: { kind: 'dte', xml: dteXml } })
    expect(fake.requests[3].parts[4].value).toBe(dteXml)
  })

  test('per-call RUTs override the client, and a client without company RUT needs one', async () => {
    const { sii, fake } = testSii(cgi(reception('reception-ok.xml')))
    await uploadEnvelope(sii, { envelope: { kind: 'dte', xml: dteXml }, companyRut: '12.345.678-5', senderRut: '77111222-3' })
    expect(fake.requests[2].parts.slice(0, 4).map((p) => p.value)).toEqual(['77111222', '3', '12345678', '5'])
    const bare = testSii(cgi(reception('reception-ok.xml')), { companyRut: undefined })
    await expectCode(uploadEnvelope(bare.sii, { envelope: { kind: 'dte', xml: dteXml } }), 'MISSING_FIELD', { field: 'companyRut' })
  })

  test.each(['1', '2', '3', '6', '8', '42'])('STATUS %s is a rejection, archived without TrackID', async (status) => {
    const memory = createMemoryUploadArchive()
    const { sii } = testSii(cgi(withStatus(status)), { archive: memory.archive })
    await expectCode(uploadEnvelope(sii, { envelope: { kind: 'dte', xml: dteXml } }), 'SII_UPLOAD_REJECTED', { status, fileName: 'EnvioDTE.xml', operation: 'uploadEnvelope' })
    expect(memory.records()[0]).toMatchObject({ trackId: null, duplicate: false, response: { code: status } })
  })

  test('STATUS 0 without a TrackID and STATUS 7 with schema errors are rejections', async () => {
    const noTrack = testSii(cgi({ body: siiFixture('reception-ok.xml').replace('<TRACKID>9876543210</TRACKID>', '') }))
    await expectCode(uploadEnvelope(noTrack.sii, { envelope: { kind: 'dte', xml: dteXml } }), 'SII_UPLOAD_REJECTED', { status: '0' })
    const schema = testSii(cgi(reception('reception-schema-error.xml')))
    await expectCode(uploadEnvelope(schema.sii, { envelope: { kind: 'dte', xml: dteXml } }), 'SII_UPLOAD_REJECTED', {
      status: '7',
      errors: ['SCH-00001: Error de Esquema', "cvc-complex-type.2.4.a: Invalid content was found starting with element 'Detalle'."],
    })
  })

  test('duplicates recover the original TrackID (STATUS 7 with TRACKID, STATUS 99 with the text)', async () => {
    const seven = testSii(cgi(reception('reception-duplicate-7.xml')))
    expect(await uploadEnvelope(seven.sii, { envelope: { kind: 'dte', xml: dteXml } })).toMatchObject({ trackId: '9876543210', duplicate: true, receivedAt: '2026-11-15T15:31:00' })
    const memory = createMemoryUploadArchive()
    const ninetyNine = testSii(cgi(reception('reception-duplicate-99.xml')), { archive: memory.archive })
    expect(await uploadEnvelope(ninetyNine.sii, { envelope: { kind: 'dte', xml: dteXml } })).toMatchObject({ trackId: '9876543210', duplicate: true })
    expect(memory.records()[0]).toMatchObject({ trackId: '9876543210', duplicate: true, response: { code: '99' } })
    const noTrack = testSii(cgi({ body: siiFixture('reception-duplicate-99.xml').replace(' con Trackid 9876543210', '') }))
    await expectCode(uploadEnvelope(noTrack.sii, { envelope: { kind: 'dte', xml: dteXml } }), 'SII_UPLOAD_REJECTED', { status: '99' })
  })

  test('STATUS 5 renews the token once; twice is SII_TOKEN_INVALID', async () => {
    const once = testSii(cgi([reception('reception-not-authenticated.xml'), reception('reception-ok.xml')]))
    expect(await uploadEnvelope(once.sii, { envelope: { kind: 'dte', xml: dteXml } })).toMatchObject({ trackId: '9876543210' })
    expect(once.fake.requests.map((r) => r.url.split('/').pop())).toEqual(['CrSeed.jws', 'GetTokenFromSeed.jws', 'DTEUpload', 'CrSeed.jws', 'GetTokenFromSeed.jws', 'DTEUpload'])
    const twice = testSii(cgi([reception('reception-not-authenticated.xml'), reception('reception-not-authenticated.xml')]))
    await expectCode(uploadEnvelope(twice.sii, { envelope: { kind: 'dte', xml: dteXml } }), 'SII_TOKEN_INVALID', { channel: 'soap', attempts: 2, status: '5' })
  })

  test('retries only when the SII did not answer, or answered "blocked" or rate-limited', async () => {
    const reset = testSii(cgi([new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' }), reception('reception-ok.xml')]))
    expect(await uploadEnvelope(reset.sii, { envelope: { kind: 'dte', xml: dteXml } })).toMatchObject({ trackId: '9876543210' })
    expect(reset.fake.requests.filter((r) => r.url === CGI)).toHaveLength(2)
    expect(reset.sleeps).toEqual([2000])
    const blocked = testSii(cgi([withStatus('9'), reception('reception-ok.xml')]))
    expect(await uploadEnvelope(blocked.sii, { envelope: { kind: 'dte', xml: dteXml } })).toMatchObject({ trackId: '9876543210' })
    const timeout = testSii(cgi(new DteError('REQUEST_TIMEOUT')))
    await expectCode(uploadEnvelope(timeout.sii, { envelope: { kind: 'dte', xml: dteXml } }), 'REQUEST_TIMEOUT', { attempts: 1 })
    const down = testSii(cgi({ status: 503, body: 'down' }))
    await expectCode(uploadEnvelope(down.sii, { envelope: { kind: 'dte', xml: dteXml } }), 'SII_HTTP_ERROR', { httpStatus: 503, attempts: 1 })
    expect(down.fake.requests.filter((r) => r.url === CGI)).toHaveLength(1)
    const html = testSii(cgi({ body: siiFixture('html-maintenance.html') }))
    await expectCode(uploadEnvelope(html.sii, { envelope: { kind: 'dte', xml: dteXml } }), 'SII_RESPONSE_INVALID', { attempts: 1 })
  })

  test('a failing archive is logged, never thrown', async () => {
    const { sii, logger } = testSii(cgi(reception('reception-ok.xml')), {
      archive: async () => {
        throw new Error('disk full')
      },
    })
    expect(await uploadEnvelope(sii, { envelope: { kind: 'dte', xml: dteXml } })).toMatchObject({ trackId: '9876543210' })
    expect(logger.lines).toContainEqual(['warn', 'upload archive failed', { operation: 'uploadEnvelope', reason: 'disk full' }])
  })

  test('falls back to the client clock when TIMESTAMP is missing', async () => {
    const { sii } = testSii(cgi({ body: siiFixture('reception-ok.xml').replace('<TIMESTAMP>2026-11-15 15:30:05</TIMESTAMP>', '') }))
    expect((await uploadEnvelope(sii, { envelope: { kind: 'dte', xml: dteXml } })).receivedAt).toBe('2026-11-15T15:30:00')
  })
})

describe('uploadEnvelope for receipts', () => {
  test('certification sends EnvioBOLETA through DTEUpload', async () => {
    const { sii, fake } = testSii(cgi(reception('reception-ok.xml')))
    const receipt = await uploadEnvelope(sii, { envelope: { kind: 'receipt', xml: receiptXml } })
    expect(receipt).toMatchObject({ kind: 'receipt', channel: 'soap', fileName: 'EnvioBOLETA.xml' })
    expect(fake.requests[2].parts[4].fileName).toBe('EnvioBOLETA.xml')
  })

  test('production sends EnvioBOLETA through the REST API', async () => {
    const memory = createMemoryUploadArchive()
    const { sii, fake } = testSii([...authRoutes('production'), { url: REST_UPLOAD_PROD, reply: { body: siiFixture('rest-upload-ok.json'), encoding: 'utf8' } }], { environment: 'production', archive: memory.archive })
    const receipt = await uploadEnvelope(sii, { envelope: { kind: 'receipt', xml: receiptXml } })
    expect(fake.requests.map((r) => r.url)).toEqual([
      'https://api.sii.cl/recursos/v1/boleta.electronica.semilla',
      'https://api.sii.cl/recursos/v1/boleta.electronica.token',
      REST_UPLOAD_PROD,
    ])
    const upload = fake.requests[2]
    expect(upload.headers.cookie).toBe(`TOKEN=${REST_TOKEN}`)
    expect(upload.headers.accept).toBe('application/json')
    expect(upload.headers['user-agent']).toBe('Mozilla/4.0 ( compatible; PROG 1.0; Windows NT)')
    expect(upload.parts[4]).toEqual({ name: 'archivo', fileName: 'EnvioBOLETA.xml', contentType: 'text/xml', value: receiptXml })
    expect(receipt).toEqual({
      trackId: '1234567890',
      receivedAt: '2026-11-15T15:30:05',
      kind: 'receipt',
      channel: 'rest',
      fileName: 'EnvioBOLETA.xml',
      duplicate: false,
      raw: siiFixture('rest-upload-ok.json'),
    })
    expect(memory.records()[0]).toMatchObject({ environment: 'production', channel: 'rest', trackId: '1234567890', response: { httpStatus: 200, code: 'REC' } })
  })

  test('channel override: REST on a certification client; REST refused for EnvioDTE', async () => {
    const { sii, fake } = testSii([...authRoutes(), { url: REST_UPLOAD_CERT, reply: { body: siiFixture('rest-upload-ok.json'), encoding: 'utf8' } }])
    expect(await uploadEnvelope(sii, { envelope: { kind: 'receipt', xml: receiptXml }, channel: 'rest' })).toMatchObject({ channel: 'rest' })
    expect(fake.requests[2].url).toBe(REST_UPLOAD_CERT)
    await expectCode(uploadEnvelope(sii, { envelope: { kind: 'dte', xml: dteXml }, channel: 'rest' }), 'INVALID_OPTION', { field: 'channel' })
  })

  test('more than 500 receipts are refused before anything is sent', async () => {
    const { sii, fake } = testSii(authRoutes('production'), { environment: 'production' })
    await expectCode(uploadEnvelope(sii, { envelope: fakeSigned(501) }), 'SII_UPLOAD_REJECTED', { status: 'TOO_MANY', count: 501 })
    expect(fake.requests).toHaveLength(0)
  })

  test('REST answers: 401 renews once, 405 waits for X-Retry-After, 500 fails, odd bodies are invalid', async () => {
    const routes = (reply: FakeRoute['reply']): FakeRoute[] => [...authRoutes('production'), { url: REST_UPLOAD_PROD, reply }]
    const ok = { body: siiFixture('rest-upload-ok.json'), encoding: 'utf8' as const }
    const renewed = testSii(routes([{ status: 401, body: 'no token' }, ok]), { environment: 'production' })
    expect(await uploadEnvelope(renewed.sii, { envelope: { kind: 'receipt', xml: receiptXml } })).toMatchObject({ trackId: '1234567890' })
    expect(renewed.fake.requests.filter((r) => r.url === REST_UPLOAD_PROD)).toHaveLength(2)
    const limited = testSii(routes([{ status: 405, headers: { 'X-Retry-After': '1' }, body: 'slow down' }, ok]), { environment: 'production' })
    expect(await uploadEnvelope(limited.sii, { envelope: { kind: 'receipt', xml: receiptXml } })).toMatchObject({ trackId: '1234567890' })
    expect(limited.sleeps).toEqual([1000])
    const broken = testSii(routes({ status: 500, body: 'error' }), { environment: 'production' })
    await expectCode(uploadEnvelope(broken.sii, { envelope: { kind: 'receipt', xml: receiptXml } }), 'SII_HTTP_ERROR', { httpStatus: 500, channel: 'rest', attempts: 1 })
    const noTrack = testSii(routes({ body: '{"estado":"REC"}', encoding: 'utf8' }), { environment: 'production' })
    await expectCode(uploadEnvelope(noTrack.sii, { envelope: { kind: 'receipt', xml: receiptXml } }), 'SII_RESPONSE_INVALID')
    const text = testSii(routes({ body: 'not json', encoding: 'utf8' }), { environment: 'production' })
    await expectCode(uploadEnvelope(text.sii, { envelope: { kind: 'receipt', xml: receiptXml } }), 'SII_RESPONSE_INVALID')
    const noState = testSii(routes({ body: '{"trackid":"77","fecha_recepcion":"garbage"}', encoding: 'utf8' }), { environment: 'production' })
    expect(await uploadEnvelope(noState.sii, { envelope: { kind: 'receipt', xml: receiptXml } })).toMatchObject({ trackId: '77', receivedAt: '2026-11-15T15:30:00' })
  })
})

describe('uploadBook / uploadFolioConsumption', () => {
  test('use DTEUpload with their file names and operation names', async () => {
    const memory = createMemoryUploadArchive()
    const { sii, fake } = testSii(cgi(reception('reception-ok.xml')), { archive: memory.archive })
    expect(await uploadBook(sii, { xml: '<LibroCompraVenta/>' })).toMatchObject({ kind: 'book', fileName: 'LibroCV.xml' })
    expect(await uploadFolioConsumption(sii, { xml: '<ConsumoFolios/>', companyRut: '12345678-5' })).toMatchObject({ kind: 'folioConsumption', fileName: 'ConsumoFolios.xml' })
    expect(fake.requests[2].parts[4].fileName).toBe('LibroCV.xml')
    expect(fake.requests[3].parts[4].fileName).toBe('ConsumoFolios.xml')
    expect(fake.requests[3].parts[2].value).toBe('12345678')
    expect(memory.records().map((r) => r.kind)).toEqual(['book', 'folioConsumption'])
  })
})

describe('parseReceptionResponse', () => {
  test('rejects anything that is not RECEPCIONDTE', () => {
    expect(() => parseReceptionResponse('<html/>')).toThrow(expect.objectContaining({ code: 'SII_RESPONSE_INVALID' }))
  })

  test('reads every field', () => {
    expect(parseReceptionResponse(siiFixture('reception-ok.xml'))).toEqual({
      status: '0',
      trackId: '9876543210',
      receivedAt: '2026-11-15T15:30:05',
      fileName: 'EnvioDTE.xml',
      errors: [],
      outcome: 'received',
    })
    expect(parseReceptionResponse(siiFixture('reception-not-authenticated.xml'))).toMatchObject({ outcome: 'notAuthenticated', trackId: null })
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx jest tests/sii/upload.test.ts`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 4: Implementation**

`src/sii/upload.ts`:

```ts
import { UPLOAD_USER_AGENT } from '../catalogs/endpoints'
import { classifyReceptionStatus, isSchemaRejection, receptionStatusMessage } from '../catalogs/reception-status'
import type { EnvelopeKind } from '../envelope/create'
import type { SignedEnvelope } from '../envelope/sign'
import { DteError, errorMessage } from '../errors'
import { splitSiiRut, type SiiRut } from '../model/rut'
import { encodeLatin1 } from '../text/latin1'
import { chileTimestamp } from '../time/chile'
import { extractTagContent } from '../xml/parse'
import type { UploadKind } from './archive'
import { withToken } from './auth'
import { resolveCompanyRut, resolveSenderRut, retryFor, timeoutFor, type CallOverrides, type SiiClient } from './client'
import { buildMultipartBody, generateBoundary, multipartContentType, type MultipartField } from './multipart'
import { bodyExcerpt, httpError, isSuccess, parseJson, restCall, retryOptions, siiTimestampToIso } from './operation'
import { withRetry } from './retry'
import { send } from './send'
import type { TokenChannel } from './token-cache'
import { decodeBody } from './transport'

/**
 * EN: What the SII returns when it takes a file.
 * ES: Lo que devuelve el SII cuando recibe un archivo.
 */
export type UploadReceipt = {
  /** EN: SII tracking id of the upload. ES: `TRACKID` / `trackid` — Identificador del envío en el SII. */
  readonly trackId: string
  /** EN: SII reception timestamp, `YYYY-MM-DDTHH:MM:SS` Chile time (client clock when the SII omits it). ES: `TIMESTAMP` / `fecha_recepcion` — Marca de recepción del SII (reloj del cliente si el SII la omite). */
  readonly receivedAt: string
  /** EN: What was uploaded. ES: Qué se subió. */
  readonly kind: UploadKind
  /** EN: Channel used. ES: Canal usado. */
  readonly channel: TokenChannel
  /** EN: File name sent in the multipart part. ES: `FILE` — Nombre del archivo enviado. */
  readonly fileName: string
  /** EN: true when the SII reported the file as already uploaded and returned the original TrackID. ES: true si el SII lo reportó como duplicado y devolvió el TrackID original. */
  readonly duplicate: boolean
  /** EN: Raw SII response. ES: Respuesta cruda del SII. */
  readonly raw: string
}

/**
 * EN: A signed envelope from phase 1, or just its kind and XML (for XML produced elsewhere).
 * ES: Un sobre firmado de la fase 1, o solo su tipo y XML (para XML generado en otra parte).
 */
export type UploadableEnvelope = SignedEnvelope | { readonly kind: EnvelopeKind; readonly xml: string }

/**
 * EN: Input of `uploadEnvelope`.
 * ES: Entrada de `uploadEnvelope`.
 */
export type UploadEnvelopeInput = {
  readonly envelope: UploadableEnvelope
  /** EN: Company RUT; defaults to the client's. ES: `rutCompany` — RUT de la empresa; por defecto el del cliente. */
  readonly companyRut?: string
  /** EN: Sender RUT; defaults to the client's. ES: `rutSender` — RUT de quien envía; por defecto el del cliente. */
  readonly senderRut?: string
  /** EN: Force a channel for receipts (`rest` or `soap`); `EnvioDTE` always uses `soap`. ES: Forzar el canal de boletas (`rest` o `soap`); `EnvioDTE` siempre usa `soap`. */
  readonly channel?: TokenChannel
}

/**
 * EN: Input of `uploadBook` and `uploadFolioConsumption`: the signed XML.
 * ES: Entrada de `uploadBook` y `uploadFolioConsumption`: el XML firmado.
 */
export type UploadXmlInput = {
  readonly xml: string
  readonly companyRut?: string
  readonly senderRut?: string
}

type ReceptionBase = {
  /** EN: `STATUS` as sent. ES: `STATUS` tal cual. */
  readonly status: string
  readonly receivedAt: string | null
  readonly fileName: string | null
  /** EN: `DETAIL/ERROR` lines. ES: Líneas `DETAIL/ERROR`. */
  readonly errors: readonly string[]
}

/**
 * EN: Interpreted `RECEPCIONDTE`: `received` and `duplicate` always carry a TrackID.
 * ES: `RECEPCIONDTE` interpretado: `received` y `duplicate` siempre traen TrackID.
 */
export type ReceptionOutcome =
  | (ReceptionBase & { readonly outcome: 'received' | 'duplicate'; readonly trackId: string })
  | (ReceptionBase & { readonly outcome: 'notAuthenticated' | 'rejected'; readonly trackId: string | null })

const TRACK_ID_IN_TEXT = /trackid\D{0,10}(\d{4,})/i

/**
 * EN: Reads a `DTEUpload` reply: `STATUS` 0 with `TRACKID` is `received`; 5 is `notAuthenticated`; 7 is a schema
 * rejection when `DETAIL/ERROR` names `CHR-`/`SCH-`/`cvc-` errors, otherwise a duplicate when a TrackID can be found;
 * 99 is a duplicate when the text names the TrackID; everything else is `rejected`.
 * ES: Lee una respuesta de `DTEUpload`: `STATUS` 0 con `TRACKID` es `received`; 5 es `notAuthenticated`; 7 es rechazo
 * de esquema cuando `DETAIL/ERROR` nombra errores `CHR-`/`SCH-`/`cvc-`, si no duplicado cuando se encuentra un TrackID;
 * 99 es duplicado cuando el texto nombra el TrackID; todo lo demás es `rejected`.
 * @throws {DteError} EN: `SII_RESPONSE_INVALID` when the body is not a `RECEPCIONDTE`. ES: `SII_RESPONSE_INVALID` si el cuerpo no es un `RECEPCIONDTE`.
 */
export const parseReceptionResponse = (text: string): ReceptionOutcome => {
  if (!/<RECEPCIONDTE>/i.test(text)) throw new DteError('SII_RESPONSE_INVALID', { operation: 'upload', body: bodyExcerpt(text) })
  const status = (extractTagContent(text, 'STATUS') ?? '').trim()
  const tagged = extractTagContent(text, 'TRACKID')?.trim()
  const trackId = tagged !== undefined && tagged !== '' ? tagged : (TRACK_ID_IN_TEXT.exec(text)?.[1] ?? null)
  const errors = Array.from(text.matchAll(/<ERROR>([^<]*)<\/ERROR>/gi), (match) => match[1].trim())
  const base: ReceptionBase = {
    status,
    receivedAt: siiTimestampToIso(extractTagContent(text, 'TIMESTAMP')),
    fileName: extractTagContent(text, 'FILE'),
    errors,
  }
  const cls = classifyReceptionStatus(status)
  if (cls === 'notAuthenticated') return { ...base, outcome: 'notAuthenticated', trackId }
  if (trackId !== null && cls === 'received') return { ...base, outcome: 'received', trackId }
  if (trackId !== null && (cls === 'alreadyUploaded' || (cls === 'schemaInvalid' && !isSchemaRejection(errors))))
    return { ...base, outcome: 'duplicate', trackId }
  return { ...base, outcome: 'rejected', trackId }
}

type UploadJob = {
  readonly kind: UploadKind
  readonly operation: string
  readonly fileName: string
  readonly bytes: Uint8Array
  readonly companyRut: SiiRut
  readonly senderRut: SiiRut
  readonly channel: TokenChannel
}

const FILE_NAMES: Readonly<Record<UploadKind, string>> = {
  dte: 'EnvioDTE.xml',
  receipt: 'EnvioBOLETA.xml',
  book: 'LibroCV.xml',
  folioConsumption: 'ConsumoFolios.xml',
}
const MAX_REST_RECEIPTS = 500

// Phase 1 envelopes carry the prolog; XML produced elsewhere may not, and the SII expects it.
const ensureProlog = (xml: string): string =>
  xml.trimStart().startsWith('<?xml') ? xml : `<?xml version="1.0" encoding="ISO-8859-1"?>\n${xml}`

const buildJob = (
  sii: SiiClient,
  kind: UploadKind,
  operation: string,
  xml: string,
  ruts: { readonly companyRut?: string; readonly senderRut?: string },
  channel: TokenChannel,
): UploadJob => ({
  kind,
  operation,
  fileName: FILE_NAMES[kind],
  bytes: encodeLatin1(ensureProlog(xml)),
  companyRut: resolveCompanyRut(sii, ruts.companyRut),
  senderRut: resolveSenderRut(sii, ruts.senderRut),
  channel,
})

const rutFields = (senderRut: SiiRut, companyRut: SiiRut): readonly MultipartField[] => {
  const sender = splitSiiRut(senderRut)
  const company = splitSiiRut(companyRut)
  return [
    { name: 'rutSender', value: sender.body },
    { name: 'dvSender', value: sender.verifier.toUpperCase() },
    { name: 'rutCompany', value: company.body },
    { name: 'dvCompany', value: company.verifier.toUpperCase() },
  ]
}

const multipart = (job: UploadJob): { readonly body: Uint8Array; readonly contentType: string } => {
  const boundary = generateBoundary()
  return {
    body: buildMultipartBody({
      boundary,
      fields: rutFields(job.senderRut, job.companyRut),
      file: { name: 'archivo', fileName: job.fileName, contentType: 'text/xml', bytes: job.bytes },
    }),
    contentType: multipartContentType(boundary),
  }
}

type UploadAnswer = {
  readonly sentAt: Date
  readonly trackId: string | null
  readonly duplicate: boolean
  readonly httpStatus: number
  readonly code: string
  readonly raw: string
}

const archiveUpload = async (sii: SiiClient, job: UploadJob, answer: UploadAnswer): Promise<void> => {
  if (sii.archive === null) return
  try {
    await sii.archive({
      environment: sii.environment,
      kind: job.kind,
      channel: job.channel,
      trackId: answer.trackId,
      duplicate: answer.duplicate,
      companyRut: job.companyRut,
      senderRut: job.senderRut,
      fileName: job.fileName,
      sentAt: answer.sentAt.toISOString(),
      xml: job.bytes,
      response: { httpStatus: answer.httpStatus, code: answer.code, raw: answer.raw },
    })
  } catch (error) {
    sii.logger.warn('upload archive failed', { operation: job.operation, reason: errorMessage(error) })
  }
}

const uploadCgi = async (sii: SiiClient, job: UploadJob, token: string, attempt: number, overrides?: CallOverrides): Promise<UploadReceipt> => {
  const { body, contentType } = multipart(job)
  const sentAt = sii.now()
  const response = await send(sii, {
    operation: job.operation,
    channel: 'soap',
    method: 'POST',
    url: sii.endpoints.soap.upload,
    headers: { 'User-Agent': UPLOAD_USER_AGENT, Cookie: `TOKEN=${token}`, Accept: '*/*', 'Content-Type': contentType },
    body,
    timeoutMs: timeoutFor(sii, 'upload', overrides),
    signal: overrides?.signal,
    attempt,
  })
  const text = decodeBody(response.body, 'latin1')
  if (!isSuccess(response.status)) throw httpError(response, text, job.operation, 'soap')
  const reception = parseReceptionResponse(text)
  if (reception.outcome === 'notAuthenticated')
    throw new DteError('SII_TOKEN_INVALID', { operation: job.operation, channel: 'soap', status: reception.status })
  await archiveUpload(sii, job, {
    sentAt,
    trackId: reception.trackId,
    duplicate: reception.outcome === 'duplicate',
    httpStatus: response.status,
    code: reception.status,
    raw: text,
  })
  if (reception.outcome === 'rejected')
    throw new DteError('SII_UPLOAD_REJECTED', {
      status: reception.status,
      errors: reception.errors,
      fileName: job.fileName,
      operation: job.operation,
      message: receptionStatusMessage(reception.status),
    })
  return {
    trackId: reception.trackId,
    receivedAt: reception.receivedAt ?? chileTimestamp(sentAt),
    kind: job.kind,
    channel: 'soap',
    fileName: job.fileName,
    duplicate: reception.outcome === 'duplicate',
    raw: text,
  }
}

const uploadRest = async (sii: SiiClient, job: UploadJob, token: string, attempt: number, overrides?: CallOverrides): Promise<UploadReceipt> => {
  const { body, contentType } = multipart(job)
  const sentAt = sii.now()
  const { response, text } = await restCall(sii, {
    operation: job.operation,
    method: 'POST',
    url: sii.endpoints.rest.upload,
    headers: { 'User-Agent': UPLOAD_USER_AGENT, Cookie: `TOKEN=${token}`, Accept: 'application/json', 'Content-Type': contentType },
    body,
    attempt,
    overrides,
    timeoutKind: 'upload',
    requestEncoding: 'latin1',
  })
  if (response.status === 401) throw new DteError('SII_TOKEN_INVALID', { operation: job.operation, channel: 'rest', httpStatus: 401 })
  if (!isSuccess(response.status)) throw httpError(response, text, job.operation, 'rest')
  const json = parseJson(text, job.operation)
  const trackId = json.trackid === undefined || json.trackid === null ? null : String(json.trackid)
  if (trackId === null) throw new DteError('SII_RESPONSE_INVALID', { operation: job.operation, body: bodyExcerpt(text) })
  const code = typeof json.estado === 'string' ? json.estado : 'REC'
  await archiveUpload(sii, job, { sentAt, trackId, duplicate: false, httpStatus: response.status, code, raw: text })
  const receivedAt = typeof json.fecha_recepcion === 'string' ? siiTimestampToIso(json.fecha_recepcion) : null
  return {
    trackId,
    receivedAt: receivedAt ?? chileTimestamp(sentAt),
    kind: job.kind,
    channel: 'rest',
    fileName: job.fileName,
    duplicate: false,
    raw: text,
  }
}

// Never re-send after the SII answered, except when the answer says the file was not taken: "system blocked"
// (STATUS 9) or the REST rate limit (405/429). Timeouts are not retried: the file may already be in.
const isUploadRetryable = (error: DteError): boolean =>
  error.code === 'TRANSPORT_FAILED' ||
  (error.code === 'SII_HTTP_ERROR' && (error.details.httpStatus === 405 || error.details.httpStatus === 429)) ||
  (error.code === 'SII_UPLOAD_REJECTED' && error.details.status === '9')

const performUpload = (sii: SiiClient, job: UploadJob, overrides?: CallOverrides): Promise<UploadReceipt> =>
  withToken(sii, job.channel, overrides, (token) =>
    withRetry(
      retryFor(sii, overrides),
      (attempt) => (job.channel === 'rest' ? uploadRest(sii, job, token, attempt, overrides) : uploadCgi(sii, job, token, attempt, overrides)),
      { ...retryOptions(sii, job.operation, overrides), retryOn: isUploadRetryable },
    ),
  )

/**
 * EN: Uploads a signed envelope: `EnvioDTE` through `DTEUpload` (ISO-8859-1 multipart), `EnvioBOLETA` through the
 * receipts REST API in production or `DTEUpload` in certification (`channel` overrides). Duplicate uploads are
 * recognised and return the original TrackID with `duplicate: true`. Every answer is handed to the archive port.
 * ES: Sube un sobre firmado: `EnvioDTE` por `DTEUpload` (multipart ISO-8859-1), `EnvioBOLETA` por la API REST de
 * boletas en producción o `DTEUpload` en certificación (`channel` lo fuerza). Los envíos duplicados se reconocen y
 * devuelven el TrackID original con `duplicate: true`. Toda respuesta se entrega al puerto de archivo.
 * @throws {DteError} EN: `SII_UPLOAD_REJECTED { status, errors }`, `SII_TOKEN_INVALID`, `SII_HTTP_ERROR`, `SII_RESPONSE_INVALID`, `INVALID_OPTION { field: 'channel' }`, `MISSING_FIELD`, transport codes. ES: los mismos códigos.
 */
export const uploadEnvelope = async (sii: SiiClient, input: UploadEnvelopeInput, overrides?: CallOverrides): Promise<UploadReceipt> => {
  const kind: UploadKind = input.envelope.kind === 'receipt' ? 'receipt' : 'dte'
  const channel = input.channel ?? (kind === 'receipt' ? sii.receiptsChannel : 'soap')
  if (channel === 'rest' && kind !== 'receipt') throw new DteError('INVALID_OPTION', { field: 'channel' })
  if (channel === 'rest' && 'cover' in input.envelope) {
    const count = input.envelope.cover.subtotals.reduce((sum, subtotal) => sum + subtotal.count, 0)
    if (count > MAX_REST_RECEIPTS) throw new DteError('SII_UPLOAD_REJECTED', { status: 'TOO_MANY', count, operation: 'uploadEnvelope' })
  }
  return performUpload(sii, buildJob(sii, kind, 'uploadEnvelope', input.envelope.xml, input, channel), overrides)
}

/**
 * EN: Uploads a signed book (`LibroCompraVenta`, `LibroGuia`) through `DTEUpload` as `LibroCV.xml`.
 * ES: Sube un libro firmado (`LibroCompraVenta`, `LibroGuia`) por `DTEUpload` como `LibroCV.xml`.
 */
export const uploadBook = async (sii: SiiClient, input: UploadXmlInput, overrides?: CallOverrides): Promise<UploadReceipt> =>
  performUpload(sii, buildJob(sii, 'book', 'uploadBook', input.xml, input, 'soap'), overrides)

/**
 * EN: Uploads a signed folio consumption report (RCOF, `ConsumoFolios`) through `DTEUpload` as `ConsumoFolios.xml`.
 * ES: Sube un Reporte de Consumo de Folios firmado (`ConsumoFolios`) por `DTEUpload` como `ConsumoFolios.xml`.
 */
export const uploadFolioConsumption = async (sii: SiiClient, input: UploadXmlInput, overrides?: CallOverrides): Promise<UploadReceipt> =>
  performUpload(sii, buildJob(sii, 'folioConsumption', 'uploadFolioConsumption', input.xml, input, 'soap'), overrides)
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx jest tests/sii/upload.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sii/upload.ts tests/fixtures/sii tests/sii/upload.test.ts
git commit -m "feat: envelope, book and RCOF uploads through DTEUpload and the receipts REST API

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 14: Status queries, polling and `folioReceived` (`src/sii/status.ts`)

**Files:**
- Create: `src/sii/status.ts`, `tests/fixtures/sii/soap-estup-epr.xml`, `tests/fixtures/sii/soap-estup-rec.xml`, `tests/fixtures/sii/soap-estup-error.xml`, `tests/fixtures/sii/soap-estup-token-error.xml`, `tests/fixtures/sii/soap-estdte-dok.xml`, `tests/fixtures/sii/soap-estdte-fau.xml`, `tests/fixtures/sii/rest-envelope-status.json`, `tests/fixtures/sii/rest-document-status.json`
- Test: `tests/sii/status.test.ts`

- [ ] **Step 1: Fixtures**

Every SOAP fixture below is the DTEWS envelope of Task 12 with the `Return` element renamed; the escaped payload is listed unescaped here for readability. Write the file with the payload escaped exactly as in `soap-seed-ok.xml` (`<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`).

`tests/fixtures/sii/soap-estup-epr.xml` (`ns1:getEstUpResponse` / `getEstUpReturn`):

```xml
<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema"><SII:RESP_HDR><TRACKID>9876543210</TRACKID><ESTADO>EPR</ESTADO><GLOSA>Envio Procesado</GLOSA><NUM_ATENCION>123456 ( 2026/11/15 15:35:00)</NUM_ATENCION></SII:RESP_HDR><SII:RESP_BODY><TIPO_DOCTO>33</TIPO_DOCTO><INFORMADOS>2</INFORMADOS><ACEPTADOS>1</ACEPTADOS><RECHAZADOS>1</RECHAZADOS><REPAROS>0</REPAROS></SII:RESP_BODY></SII:RESPUESTA>
```

`tests/fixtures/sii/soap-estup-rec.xml` (`getEstUpReturn`):

```xml
<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema"><SII:RESP_HDR><TRACKID>9876543210</TRACKID><ESTADO>REC</ESTADO><GLOSA>Envio Recibido</GLOSA></SII:RESP_HDR></SII:RESPUESTA>
```

`tests/fixtures/sii/soap-estup-error.xml` (`getEstUpReturn`):

```xml
<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema"><SII:RESP_HDR><ESTADO>-1</ESTADO><ERR_CODE>3</ERR_CODE><GLOSA>Error en Consulta</GLOSA></SII:RESP_HDR></SII:RESPUESTA>
```

`tests/fixtures/sii/soap-estup-token-error.xml` (`getEstUpReturn`):

```xml
<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema"><SII:RESP_HDR><ESTADO>001</ESTADO><GLOSA>Token no valido</GLOSA></SII:RESP_HDR></SII:RESPUESTA>
```

`tests/fixtures/sii/soap-estdte-dok.xml` (`ns1:getEstDteResponse` / `getEstDteReturn`):

```xml
<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema"><SII:RESP_HDR><ESTADO>DOK</ESTADO><GLOSA_ESTADO>Documento Recibido por el SII. Datos Coinciden con los Registrados.</GLOSA_ESTADO><ERR_CODE>0</ERR_CODE><GLOSA_ERR></GLOSA_ERR><NUM_ATENCION>123457 ( 2026/11/15 15:36:00)</NUM_ATENCION></SII:RESP_HDR></SII:RESPUESTA>
```

`tests/fixtures/sii/soap-estdte-fau.xml` (`getEstDteReturn`):

```xml
<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema"><SII:RESP_HDR><ESTADO>FAU</ESTADO><GLOSA_ESTADO>DTE No Recibido por el SII.</GLOSA_ESTADO><ERR_CODE>3</ERR_CODE></SII:RESP_HDR></SII:RESPUESTA>
```

`tests/fixtures/sii/rest-envelope-status.json`:

```json
{"rut_emisor":"77111222-3","rut_envia":"76543210-3","trackid":1234567890,"fecha_recepcion":"15/11/2026 15:30:05","estado":"RCH","estadistica":[{"tipo":39,"informados":3,"aceptados":2,"rechazados":1,"reparos":0},{"tipo":41,"informados":1}],"detalle_rep_rech":[{"tipo":39,"folio":7,"estado":"RCH","descripcion":"Rechazado","error":[{"seccion":"DTE","linea":12,"nivel":1,"codigo":"E001","descripcion":"Firma invalida","detalle":"SignatureValue"}]},{"tipo":"41","folio":null,"estado":"RLV","descripcion":"Aceptado con reparos leves"}]}
```

`tests/fixtures/sii/rest-document-status.json`:

```json
{"codigo":"DOK","descripcion":"Documento recibido por el SII, datos coinciden"}
```

- [ ] **Step 2: Failing test**

`tests/sii/status.test.ts`:

```ts
import { DteError } from '../../src/errors'
import { folioReceived, queryDocumentStatus, queryUploadStatus, waitForUploadStatus } from '../../src/sii/status'
import type { FakeRoute } from '../support/fake-sii'
import { authRoutes, expectCode, REST_TOKEN, siiFixture, SOAP_TOKEN, testClock, testSii } from '../support/sii-client'

const EST_UP = 'https://maullin.sii.cl/DTEWS/QueryEstUp.jws'
const EST_DTE = 'https://maullin.sii.cl/DTEWS/QueryEstDte.jws'
const REST_STATUS = 'https://apicert.sii.cl/recursos/v1/boleta.electronica.envio/77111222-3-1234567890'
const REST_DOC = 'https://apicert.sii.cl/recursos/v1/boleta.electronica/77111222-3-39-45/estado?rut_receptor=12345678&dv_receptor=5&monto=1500&fechaEmision=15-11-2026'
const fx = (name: string) => ({ body: siiFixture(name) })
const json = (name: string) => ({ body: siiFixture(name), encoding: 'utf8' as const })
const soapRoutes = (url: string, reply: FakeRoute['reply']): FakeRoute[] => [...authRoutes(), { url, reply }]
const restRoutes = (url: string, reply: FakeRoute['reply']): FakeRoute[] => [...authRoutes(), { url, reply }]
const params = (text: string) => Array.from(text.matchAll(/<(\w+)>([^<]*)<\/\1>/g), (m) => [m[1], m[2]])
const document = { receiverRut: '12.345.678-5', type: 33 as const, folio: 45, issueDate: '2026-11-15', totalAmount: 119000 }

describe('queryUploadStatus (SOAP)', () => {
  test('posts getEstUp with the WSDL parameter names in order and reads the counts', async () => {
    const { sii, fake } = testSii(soapRoutes(EST_UP, fx('soap-estup-epr.xml')))
    const status = await queryUploadStatus(sii, { trackId: '9876543210' })
    expect(fake.requests[2].url).toBe(EST_UP)
    expect(params(fake.requests[2].text)).toEqual([
      ['RutCompania', '77111222'],
      ['DvCompania', '3'],
      ['TrackId', '9876543210'],
      ['Token', SOAP_TOKEN],
    ])
    expect(status).toEqual({
      code: 'EPR',
      status: 'accepted',
      message: 'Envio Procesado',
      trackId: '9876543210',
      channel: 'soap',
      counts: { reported: 2, accepted: 1, rejected: 1, objections: 0 },
      documentType: '33',
      documents: [],
      raw: expect.stringContaining('<ESTADO>EPR</ESTADO>'),
    })
  })

  test('pending envelopes have no counts; partial counts default to zero', async () => {
    const rec = testSii(soapRoutes(EST_UP, fx('soap-estup-rec.xml')))
    expect(await queryUploadStatus(rec.sii, { trackId: '9876543210' })).toMatchObject({ code: 'REC', status: 'pending', counts: null, documentType: null })
    const partial = siiFixture('soap-estup-epr.xml').replace(/&lt;ACEPTADOS&gt;1&lt;\/ACEPTADOS&gt;&lt;RECHAZADOS&gt;1&lt;\/RECHAZADOS&gt;&lt;REPAROS&gt;0&lt;\/REPAROS&gt;/, '')
    const some = testSii(soapRoutes(EST_UP, { body: partial }))
    expect((await queryUploadStatus(some.sii, { trackId: '9876543210' })).counts).toEqual({ reported: 2, accepted: 0, rejected: 0, objections: 0 })
    const noGloss = siiFixture('soap-estup-rec.xml').replace('&lt;GLOSA&gt;Envio Recibido&lt;/GLOSA&gt;', '')
    const catalog = testSii(soapRoutes(EST_UP, { body: noGloss }))
    expect((await queryUploadStatus(catalog.sii, { trackId: '9876543210' })).message).toBe('Envío recibido, esperando validación')
  })

  test('query errors are retried, token errors renew once, odd replies are invalid', async () => {
    const retried = testSii(soapRoutes(EST_UP, [fx('soap-estup-error.xml'), fx('soap-estup-epr.xml')]))
    expect((await queryUploadStatus(retried.sii, { trackId: '9876543210' })).code).toBe('EPR')
    expect(retried.sleeps).toEqual([2000])
    const dead = testSii(soapRoutes(EST_UP, fx('soap-estup-error.xml')), { retry: { maxAttempts: 2 } })
    await expectCode(queryUploadStatus(dead.sii, { trackId: '9876543210' }), 'SII_QUERY_ERROR', { code: '-1', reason: '3', attempts: 2 })
    const renewed = testSii(soapRoutes(EST_UP, [fx('soap-estup-token-error.xml'), fx('soap-estup-epr.xml')]))
    expect((await queryUploadStatus(renewed.sii, { trackId: '9876543210' })).code).toBe('EPR')
    expect(renewed.fake.requests.filter((r) => r.url === EST_UP)).toHaveLength(2)
    const empty = testSii(soapRoutes(EST_UP, { body: siiFixture('soap-estup-rec.xml').replace('&lt;ESTADO&gt;REC&lt;/ESTADO&gt;', '') }), { retry: false })
    await expectCode(queryUploadStatus(empty.sii, { trackId: '9876543210' }), 'SII_RESPONSE_INVALID', { operation: 'queryUploadStatus' })
    await expectCode(queryUploadStatus(testSii(authRoutes(), { companyRut: undefined }).sii, { trackId: '1' }), 'MISSING_FIELD', { field: 'companyRut' })
  })
})

describe('queryUploadStatus (REST)', () => {
  test('GETs the envelope status with the REST token and maps counts and documents', async () => {
    const { sii, fake } = testSii(restRoutes(REST_STATUS, json('rest-envelope-status.json')))
    const status = await queryUploadStatus(sii, { trackId: '1234567890', channel: 'rest' })
    expect(fake.requests[2]).toMatchObject({ method: 'GET', url: REST_STATUS })
    expect(fake.requests[2].headers.cookie).toBe(`TOKEN=${REST_TOKEN}`)
    expect(fake.requests[2].headers.accept).toBe('application/json')
    expect(status).toEqual({
      code: 'RCH',
      status: 'rejected',
      message: 'Rechazado',
      trackId: '1234567890',
      channel: 'rest',
      counts: { reported: 4, accepted: 2, rejected: 1, objections: 0 },
      documentType: null,
      documents: [
        {
          type: '39',
          folio: 7,
          code: 'RCH',
          description: 'Rechazado',
          errors: [{ section: 'DTE', line: 12, level: 1, code: 'E001', description: 'Firma invalida', detail: 'SignatureValue' }],
        },
        { type: '41', folio: null, code: 'RLV', description: 'Aceptado con reparos leves', errors: [] },
      ],
      raw: siiFixture('rest-envelope-status.json'),
    })
  })

  test('RLV is accepted on REST; missing lists are empty; errors and odd bodies are classified', async () => {
    const minimal = testSii(restRoutes(REST_STATUS, { body: '{"estado":"RLV","detalle_rep_rech":[{"error":[{}]}]}', encoding: 'utf8' }))
    const status = await queryUploadStatus(minimal.sii, { trackId: '1234567890', channel: 'rest' })
    expect(status).toMatchObject({ code: 'RLV', status: 'accepted', counts: null })
    expect(status.documents).toEqual([{ type: '', folio: null, code: '', description: '', errors: [{ section: '', line: null, level: 0, code: '', description: '', detail: '' }] }])
    const renewed = testSii(restRoutes(REST_STATUS, [{ status: 401, body: 'x' }, json('rest-envelope-status.json')]))
    expect((await queryUploadStatus(renewed.sii, { trackId: '1234567890', channel: 'rest' })).code).toBe('RCH')
    const broken = testSii(restRoutes(REST_STATUS, { status: 500, body: 'x' }), { retry: false })
    await expectCode(queryUploadStatus(broken.sii, { trackId: '1234567890', channel: 'rest' }), 'SII_HTTP_ERROR', { httpStatus: 500 })
    const noState = testSii(restRoutes(REST_STATUS, { body: '{"trackid":1}', encoding: 'utf8' }), { retry: false })
    await expectCode(queryUploadStatus(noState.sii, { trackId: '1234567890', channel: 'rest' }), 'SII_RESPONSE_INVALID')
  })
})

describe('waitForUploadStatus', () => {
  const clockAndSleep = () => {
    const clock = testClock()
    const sleeps: number[] = []
    const sleep = async (ms: number): Promise<void> => {
      sleeps.push(ms)
      clock.advance(ms)
    }
    return { clock, sleeps, options: { now: clock.now, sleep } }
  }

  test('polls until a final state, treating query errors as pending', async () => {
    const { sleeps, options } = clockAndSleep()
    const { sii } = testSii(soapRoutes(EST_UP, [fx('soap-estup-rec.xml'), fx('soap-estup-error.xml'), fx('soap-estup-epr.xml')]), { ...options, retry: false })
    expect((await waitForUploadStatus(sii, { trackId: '9876543210' })).code).toBe('EPR')
    expect(sleeps).toEqual([5000, 5000])
  })

  test('times out with the last code seen', async () => {
    const { options } = clockAndSleep()
    const { sii } = testSii(soapRoutes(EST_UP, fx('soap-estup-rec.xml')), options)
    await expectCode(waitForUploadStatus(sii, { trackId: '9876543210', intervalMs: 1000, timeoutMs: 2500 }), 'WAIT_TIMEOUT', { trackId: '9876543210', attempts: 3, lastCode: 'REC' })
  })

  test('other errors propagate', async () => {
    const { options } = clockAndSleep()
    const { sii } = testSii(soapRoutes(EST_UP, { status: 500, body: 'x' }), { ...options, retry: false })
    await expectCode(waitForUploadStatus(sii, { trackId: '9876543210' }), 'SII_HTTP_ERROR')
  })
})

describe('queryDocumentStatus', () => {
  test('SOAP for invoices: consultant is the sender, date as DDMMYYYY, amount rounded', async () => {
    const { sii, fake } = testSii(soapRoutes(EST_DTE, fx('soap-estdte-dok.xml')))
    const status = await queryDocumentStatus(sii, { ...document, totalAmount: 119000.4 })
    expect(params(fake.requests[2].text)).toEqual([
      ['RutConsultante', '76543210'],
      ['DvConsultante', '3'],
      ['RutCompania', '77111222'],
      ['DvCompania', '3'],
      ['RutReceptor', '12345678'],
      ['DvReceptor', '5'],
      ['TipoDte', '33'],
      ['FolioDte', '45'],
      ['FechaEmisionDte', '15112026'],
      ['MontoDte', '119000'],
      ['Token', SOAP_TOKEN],
    ])
    expect(status).toEqual({
      code: 'DOK',
      status: 'received',
      message: 'Documento Recibido por el SII. Datos Coinciden con los Registrados.',
      raw: expect.stringContaining('<ESTADO>DOK</ESTADO>'),
    })
    expect((await queryDocumentStatus(testSii(soapRoutes(EST_DTE, fx('soap-estdte-fau.xml'))).sii, document)).status).toBe('notReceived')
    const noGloss = siiFixture('soap-estdte-dok.xml').replace(/&lt;GLOSA_ESTADO&gt;[^&]*&lt;\/GLOSA_ESTADO&gt;/, '')
    expect((await queryDocumentStatus(testSii(soapRoutes(EST_DTE, { body: noGloss })).sii, document)).message).toBe('Documento recibido por el SII, datos coinciden')
  })

  test('SOAP failures: query error, token error, invalid input', async () => {
    const errored = testSii(soapRoutes(EST_DTE, fx('soap-estup-error.xml')), { retry: false })
    await expectCode(queryDocumentStatus(errored.sii, document), 'SII_QUERY_ERROR', { code: '-1' })
    const renewed = testSii(soapRoutes(EST_DTE, [fx('soap-estup-token-error.xml'), fx('soap-estdte-dok.xml')]))
    expect((await queryDocumentStatus(renewed.sii, document)).code).toBe('DOK')
    const { sii } = testSii(authRoutes())
    await expectCode(queryDocumentStatus(sii, { ...document, folio: 0 }), 'INVALID_FOLIO', { field: 'folio' })
    await expectCode(queryDocumentStatus(sii, { ...document, totalAmount: Number.NaN }), 'INVALID_AMOUNT', { field: 'totalAmount' })
    await expectCode(queryDocumentStatus(sii, { ...document, issueDate: '15/11/26' }), 'INVALID_DATE', { field: 'issueDate' })
    await expectCode(queryDocumentStatus(sii, { ...document, receiverRut: 'bad' }), 'INVALID_RUT', { field: 'receiverRut' })
  })

  test('REST for receipts: per-document endpoint with the query string', async () => {
    const { sii, fake } = testSii(restRoutes(REST_DOC, json('rest-document-status.json')))
    const status = await queryDocumentStatus(sii, { ...document, type: 39, totalAmount: 1500 })
    expect(fake.requests[2].url).toBe(REST_DOC)
    expect(fake.requests[2].headers.cookie).toBe(`TOKEN=${REST_TOKEN}`)
    expect(status).toEqual({ code: 'DOK', status: 'received', message: 'Documento recibido por el SII, datos coinciden', raw: siiFixture('rest-document-status.json') })
    const catalogMessage = testSii(restRoutes(REST_DOC, { body: '{"codigo":"FAU"}', encoding: 'utf8' }))
    expect(await queryDocumentStatus(catalogMessage.sii, { ...document, type: 39, totalAmount: 1500 })).toMatchObject({ status: 'notReceived', message: 'DTE no recibido por el SII' })
    const renewed = testSii(restRoutes(REST_DOC, [{ status: 401, body: 'x' }, json('rest-document-status.json')]))
    expect((await queryDocumentStatus(renewed.sii, { ...document, type: 39, totalAmount: 1500 })).code).toBe('DOK')
    const broken = testSii(restRoutes(REST_DOC, { status: 500, body: 'x' }), { retry: false })
    await expectCode(queryDocumentStatus(broken.sii, { ...document, type: 39, totalAmount: 1500 }), 'SII_HTTP_ERROR', { httpStatus: 500 })
    const noCode = testSii(restRoutes(REST_DOC, { body: '{}', encoding: 'utf8' }), { retry: false })
    await expectCode(queryDocumentStatus(noCode.sii, { ...document, type: 39, totalAmount: 1500 }), 'SII_RESPONSE_INVALID')
    const forced = testSii(soapRoutes(EST_DTE, fx('soap-estdte-dok.xml')))
    expect((await queryDocumentStatus(forced.sii, { ...document, type: 39, channel: 'soap' })).code).toBe('DOK')
  })
})

describe('folioReceived', () => {
  const withEstado = (code: string, gloss: string) => ({
    body: siiFixture('soap-estdte-dok.xml')
      .replace('&lt;ESTADO&gt;DOK&lt;/ESTADO&gt;', `&lt;ESTADO&gt;${code}&lt;/ESTADO&gt;`)
      .replace(/&lt;GLOSA_ESTADO&gt;[^&]*&lt;\/GLOSA_ESTADO&gt;/, `&lt;GLOSA_ESTADO&gt;${gloss}&lt;/GLOSA_ESTADO&gt;`),
  })

  test('asks QueryEstDte with the generic receiver, today and amount 1', async () => {
    const { sii, fake } = testSii(soapRoutes(EST_DTE, fx('soap-estdte-dok.xml')))
    expect(await folioReceived(sii, { type: 33, folio: 45 })).toBe(true)
    expect(params(fake.requests[2].text)).toEqual(expect.arrayContaining([['RutReceptor', '66666666'], ['DvReceptor', '6'], ['FechaEmisionDte', '15112026'], ['MontoDte', '1']]))
  })

  test.each([
    ['FAU', 'DTE No Recibido por el SII.', false],
    ['DNK', 'Datos no coinciden', true],
    ['XYZ', 'Documento recibido con observaciones', true],
    ['XYZ', 'Documento no recibido', false],
    ['EMP', 'Empresa no autorizada', null],
  ])('%s / %s → %s', async (code, gloss, expected) => {
    const { sii } = testSii(soapRoutes(EST_DTE, withEstado(code, gloss)))
    expect(await folioReceived(sii, { type: 33, folio: 45 })).toBe(expected)
  })
})
```

(The `-1` reply used in the "SOAP failures" test is a `getEstUpReturn`; the parser only looks at the `SII:RESPUESTA` inside, so it serves `getEstDte` too.)

- [ ] **Step 3: Run it and watch it fail**

Run: `npx jest tests/sii/status.test.ts`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 4: Implementation**

`src/sii/status.ts`:

```ts
import { FINAL_CONSUMER_RUT } from '../catalogs/codes'
import { isReceipt, type DocumentType } from '../catalogs/document-types'
import {
  classifyDocumentStatus,
  classifyUploadStatus,
  documentStatusMessage,
  isTokenErrorStatus,
  uploadStatusMessage,
  type DocumentStatusClass,
  type UploadStatusClass,
} from '../catalogs/upload-status'
import { DteError, isDteError } from '../errors'
import { splitSiiRut, toSiiRut, type SiiRut } from '../model/rut'
import { chileDate, toIsoDate } from '../time/chile'
import { extractTagContent } from '../xml/parse'
import { withToken } from './auth'
import { resolveCompanyRut, retryFor, type CallOverrides, type SiiClient } from './client'
import { bodyExcerpt, httpError, isSuccess, parseJson, readSiiResponse, restCall, retryOptions, soapCall } from './operation'
import { withRetry } from './retry'
import type { TokenChannel } from './token-cache'

/**
 * EN: Document counts of an envelope.
 * ES: Cantidades de documentos de un envío.
 */
export type UploadStatusCounts = {
  /** EN: Documents reported. ES: `INFORMADOS` / `informados`. */
  readonly reported: number
  /** EN: Accepted. ES: `ACEPTADOS` / `aceptados`. */
  readonly accepted: number
  /** EN: Rejected. ES: `RECHAZADOS` / `rechazados`. */
  readonly rejected: number
  /** EN: Accepted with objections. ES: `REPAROS` / `reparos`. */
  readonly objections: number
}

/**
 * EN: One error of a document in the REST envelope status.
 * ES: Un error de un documento en el estado de envío REST (`detalle_rep_rech/error`).
 */
export type UploadStatusDocumentError = {
  /** EN: Section: ENV, CRT, TED, CAF, DTE, HED, DET, REF, DRG. ES: `seccion`. */
  readonly section: string
  /** EN: Line or null. ES: `linea`. */
  readonly line: number | null
  /** EN: Level 1–3. ES: `nivel`. */
  readonly level: number
  /** EN: Error code. ES: `codigo`. */
  readonly code: string
  /** EN: Description. ES: `descripcion`. */
  readonly description: string
  /** EN: Detail. ES: `detalle`. */
  readonly detail: string
}

/**
 * EN: Per-document result in the REST envelope status.
 * ES: Resultado por documento en el estado de envío REST (`detalle_rep_rech`).
 */
export type UploadStatusDocument = {
  /** EN: Document type. ES: `tipo`. */
  readonly type: string
  /** EN: Folio or null. ES: `folio`. */
  readonly folio: number | null
  /** EN: Document state (`DOK`, `RPR`, `RCH`, `RLV`). ES: `estado`. */
  readonly code: string
  /** EN: Description. ES: `descripcion`. */
  readonly description: string
  readonly errors: readonly UploadStatusDocumentError[]
}

/**
 * EN: Status of an upload.
 * ES: Estado de un envío.
 */
export type UploadStatus = {
  /** EN: SII status code. ES: `ESTADO` / `estado` — Código de estado del envío. */
  readonly code: string
  readonly status: UploadStatusClass
  /** EN: Spanish gloss from the SII, else from the catalog. ES: `GLOSA` — Glosa del SII, si no la del catálogo. */
  readonly message: string
  readonly trackId: string
  readonly channel: TokenChannel
  /** EN: Counts when the SII reports them. ES: Cantidades cuando el SII las informa. */
  readonly counts: UploadStatusCounts | null
  /** EN: Document type the counts refer to (SOAP). ES: `TIPO_DOCTO`. */
  readonly documentType: string | null
  /** EN: Per-document detail (REST only). ES: `detalle_rep_rech` — Detalle por documento (solo REST). */
  readonly documents: readonly UploadStatusDocument[]
  readonly raw: string
}

/**
 * EN: Input of `queryUploadStatus`.
 * ES: Entrada de `queryUploadStatus`.
 */
export type QueryUploadStatusInput = {
  readonly trackId: string
  readonly companyRut?: string
  /** EN: `soap` (default) or `rest` (receipts uploaded through the REST API). ES: `soap` (por defecto) o `rest` (boletas subidas por la API REST). */
  readonly channel?: TokenChannel
}

/**
 * EN: Input of `waitForUploadStatus`.
 * ES: Entrada de `waitForUploadStatus`.
 */
export type WaitForUploadStatusInput = QueryUploadStatusInput & {
  /** EN: Poll interval, ms (5 000). ES: Intervalo de sondeo, ms (5 000). */
  readonly intervalMs?: number
  /** EN: Give up after, ms (600 000). ES: Tiempo máximo, ms (600 000). */
  readonly timeoutMs?: number
}

/**
 * EN: Status of one document.
 * ES: Estado de un documento.
 */
export type DocumentStatus = {
  /** EN: `DOK`, `DNK`, `FAU`, `FNA`, `FAN`, `EMP`, `TMD`, `TMC`, `MMD`, `MMC`, `AND`, `ANC`. ES: `ESTADO` / `codigo`. */
  readonly code: string
  readonly status: DocumentStatusClass
  /** EN: Spanish gloss. ES: `GLOSA_ESTADO` / `descripcion`. */
  readonly message: string
  readonly raw: string
}

/**
 * EN: Input of `queryDocumentStatus`.
 * ES: Entrada de `queryDocumentStatus`.
 */
export type QueryDocumentStatusInput = {
  readonly companyRut?: string
  /** EN: Receiver RUT. ES: `RutReceptor` / `rut_receptor`. */
  readonly receiverRut: string
  /** EN: Document type. ES: `TipoDte` / `tipo`. */
  readonly type: DocumentType
  /** EN: Folio. ES: `FolioDte` / `folio`. */
  readonly folio: number
  /** EN: Issue date `YYYY-MM-DD`. ES: `FechaEmisionDte` / `fechaEmision` — Fecha de emisión `AAAA-MM-DD`. */
  readonly issueDate: string
  /** EN: Total amount. ES: `MontoDte` / `monto`. */
  readonly totalAmount: number
  /** EN: `soap` (default for invoices) or `rest` (default for receipts). ES: `soap` (facturas) o `rest` (boletas) por defecto. */
  readonly channel?: TokenChannel
}

/**
 * EN: Input of `folioReceived`.
 * ES: Entrada de `folioReceived`.
 */
export type FolioReceivedInput = {
  readonly companyRut?: string
  readonly type: DocumentType
  readonly folio: number
}

const DEFAULT_INTERVAL_MS = 5000
const DEFAULT_WAIT_MS = 600000
const NEGATIVE = /^-\d+$/

const numberOrNull = (value: string | null): number | null => {
  if (value === null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const asRecord = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : {}
const asArray = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : [])
const str = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '')
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

const toDocumentError = (value: unknown): UploadStatusDocumentError => {
  const error = asRecord(value)
  return {
    section: str(error.seccion),
    line: num(error.linea),
    level: num(error.nivel) ?? 0,
    code: str(error.codigo),
    description: str(error.descripcion),
    detail: str(error.detalle),
  }
}

const toDocument = (value: unknown): UploadStatusDocument => {
  const document = asRecord(value)
  return {
    type: str(document.tipo),
    folio: num(document.folio),
    code: str(document.estado),
    description: str(document.descripcion),
    errors: asArray(document.error).map(toDocumentError),
  }
}

const sumCounts = (stats: readonly unknown[]): UploadStatusCounts =>
  stats.reduce<UploadStatusCounts>(
    (acc, value) => {
      const entry = asRecord(value)
      return {
        reported: acc.reported + (num(entry.informados) ?? 0),
        accepted: acc.accepted + (num(entry.aceptados) ?? 0),
        rejected: acc.rejected + (num(entry.rechazados) ?? 0),
        objections: acc.objections + (num(entry.reparos) ?? 0),
      }
    },
    { reported: 0, accepted: 0, rejected: 0, objections: 0 },
  )

const assertStatusCode = (code: string, operation: string, xml: string): void => {
  if (isTokenErrorStatus(code)) throw new DteError('SII_TOKEN_INVALID', { operation, channel: 'soap', code })
  if (NEGATIVE.test(code))
    throw new DteError('SII_QUERY_ERROR', {
      operation,
      code,
      reason: extractTagContent(xml, 'ERR_CODE') ?? extractTagContent(xml, 'GLOSA_ERR') ?? '',
    })
}

const soapUploadStatus = async (
  sii: SiiClient,
  token: string,
  companyRut: SiiRut,
  trackId: string,
  attempt: number,
  overrides?: CallOverrides,
): Promise<UploadStatus> => {
  const company = splitSiiRut(companyRut)
  const xml = await soapCall(sii, {
    operation: 'queryUploadStatus',
    url: sii.endpoints.soap.uploadStatus,
    method: 'getEstUp',
    params: [
      { name: 'RutCompania', value: company.body },
      { name: 'DvCompania', value: company.verifier },
      { name: 'TrackId', value: trackId },
      { name: 'Token', value: token },
    ],
    attempt,
    overrides,
  })
  const { code, message } = readSiiResponse(xml, 'queryUploadStatus')
  assertStatusCode(code, 'queryUploadStatus', xml)
  const reported = numberOrNull(extractTagContent(xml, 'INFORMADOS'))
  return {
    code,
    status: classifyUploadStatus(code, 'soap'),
    message: message ?? uploadStatusMessage(code, 'soap'),
    trackId,
    channel: 'soap',
    counts:
      reported === null
        ? null
        : {
            reported,
            accepted: numberOrNull(extractTagContent(xml, 'ACEPTADOS')) ?? 0,
            rejected: numberOrNull(extractTagContent(xml, 'RECHAZADOS')) ?? 0,
            objections: numberOrNull(extractTagContent(xml, 'REPAROS')) ?? 0,
          },
    documentType: extractTagContent(xml, 'TIPO_DOCTO'),
    documents: [],
    raw: xml,
  }
}

const restHeaders = (token: string): Readonly<Record<string, string>> => ({ Cookie: `TOKEN=${token}`, Accept: 'application/json' })

const restJson = async (
  sii: SiiClient,
  operation: string,
  url: string,
  token: string,
  attempt: number,
  overrides?: CallOverrides,
): Promise<{ readonly json: Readonly<Record<string, unknown>>; readonly text: string }> => {
  const { response, text } = await restCall(sii, { operation, method: 'GET', url, headers: restHeaders(token), attempt, overrides })
  if (response.status === 401) throw new DteError('SII_TOKEN_INVALID', { operation, channel: 'rest', httpStatus: 401 })
  if (!isSuccess(response.status)) throw httpError(response, text, operation, 'rest')
  return { json: parseJson(text, operation), text }
}

const restUploadStatus = async (
  sii: SiiClient,
  token: string,
  companyRut: SiiRut,
  trackId: string,
  attempt: number,
  overrides?: CallOverrides,
): Promise<UploadStatus> => {
  const company = splitSiiRut(companyRut)
  const url = `${sii.endpoints.rest.status}${company.body}-${company.verifier}-${trackId}`
  const { json, text } = await restJson(sii, 'queryUploadStatus', url, token, attempt, overrides)
  const code = str(json.estado)
  if (code === '') throw new DteError('SII_RESPONSE_INVALID', { operation: 'queryUploadStatus', body: bodyExcerpt(text) })
  const stats = asArray(json.estadistica)
  return {
    code,
    status: classifyUploadStatus(code, 'rest'),
    message: uploadStatusMessage(code, 'rest'),
    trackId,
    channel: 'rest',
    counts: stats.length === 0 ? null : sumCounts(stats),
    documentType: null,
    documents: asArray(json.detalle_rep_rech).map(toDocument),
    raw: text,
  }
}

/**
 * EN: Status of an upload by TrackID: `QueryEstUp` on the `soap` channel (default) or the receipts REST envelope
 * status on `rest`. Query errors (`-1` … `-14`) are retried, token errors renew the token once.
 * ES: Estado de un envío por TrackID: `QueryEstUp` por el canal `soap` (por defecto) o el estado de envío REST de
 * boletas por `rest`. Los errores de consulta (`-1` … `-14`) se reintentan; los de token renuevan el token una vez.
 * @throws {DteError} EN: `SII_QUERY_ERROR { code }`, `SII_TOKEN_INVALID`, `SII_HTTP_ERROR`, `SII_RESPONSE_INVALID`, `MISSING_FIELD`, transport codes. ES: los mismos códigos.
 */
export const queryUploadStatus = async (
  sii: SiiClient,
  input: QueryUploadStatusInput,
  overrides?: CallOverrides,
): Promise<UploadStatus> => {
  const channel = input.channel ?? 'soap'
  const companyRut = resolveCompanyRut(sii, input.companyRut)
  return withToken(sii, channel, overrides, (token) =>
    withRetry(
      retryFor(sii, overrides),
      (attempt) =>
        channel === 'rest'
          ? restUploadStatus(sii, token, companyRut, input.trackId, attempt, overrides)
          : soapUploadStatus(sii, token, companyRut, input.trackId, attempt, overrides),
      retryOptions(sii, 'queryUploadStatus', overrides),
    ),
  )
}

/**
 * EN: Polls `queryUploadStatus` every `intervalMs` until the status is no longer `pending` (query errors count as
 * pending), up to `timeoutMs`.
 * ES: Sondea `queryUploadStatus` cada `intervalMs` hasta que el estado deje de ser `pending` (los errores de consulta
 * cuentan como pendiente), hasta `timeoutMs`.
 * @throws {DteError} EN: `WAIT_TIMEOUT { trackId, attempts, lastCode }` plus whatever `queryUploadStatus` throws. ES: `WAIT_TIMEOUT { trackId, attempts, lastCode }` más lo que lance `queryUploadStatus`.
 */
export const waitForUploadStatus = async (
  sii: SiiClient,
  input: WaitForUploadStatusInput,
  overrides?: CallOverrides,
): Promise<UploadStatus> => {
  const intervalMs = input.intervalMs ?? DEFAULT_INTERVAL_MS
  const deadline = sii.now().getTime() + (input.timeoutMs ?? DEFAULT_WAIT_MS)
  const poll = async (attempt: number): Promise<UploadStatus> => {
    const outcome = await queryUploadStatus(sii, input, overrides).then(
      (status) => ({ status, code: status.code }),
      (error: unknown) => {
        if (isDteError(error) && error.code === 'SII_QUERY_ERROR') return { status: null, code: String(error.details.code) }
        throw error
      },
    )
    if (outcome.status !== null && outcome.status.status !== 'pending') return outcome.status
    if (sii.now().getTime() + intervalMs > deadline)
      throw new DteError('WAIT_TIMEOUT', { trackId: input.trackId, attempts: attempt, lastCode: outcome.code })
    await sii.sleep(intervalMs, overrides?.signal)
    return poll(attempt + 1)
  }
  return poll(1)
}

type DocumentQuery = {
  readonly companyRut: SiiRut
  readonly receiverRut: SiiRut
  readonly type: DocumentType
  readonly folio: number
  readonly issueDate: string
  readonly totalAmount: number
}

const dateParts = (isoDate: string): { readonly day: string; readonly month: string; readonly year: string } => {
  const [year, month, day] = isoDate.split('-')
  return { day, month, year }
}

const soapDocumentStatus = async (
  sii: SiiClient,
  token: string,
  query: DocumentQuery,
  attempt: number,
  overrides?: CallOverrides,
): Promise<DocumentStatus> => {
  const consultant = splitSiiRut(sii.senderRut)
  const company = splitSiiRut(query.companyRut)
  const receiver = splitSiiRut(query.receiverRut)
  const { day, month, year } = dateParts(query.issueDate)
  const xml = await soapCall(sii, {
    operation: 'queryDocumentStatus',
    url: sii.endpoints.soap.documentStatus,
    method: 'getEstDte',
    params: [
      { name: 'RutConsultante', value: consultant.body },
      { name: 'DvConsultante', value: consultant.verifier },
      { name: 'RutCompania', value: company.body },
      { name: 'DvCompania', value: company.verifier },
      { name: 'RutReceptor', value: receiver.body },
      { name: 'DvReceptor', value: receiver.verifier },
      { name: 'TipoDte', value: String(query.type) },
      { name: 'FolioDte', value: String(query.folio) },
      { name: 'FechaEmisionDte', value: `${day}${month}${year}` },
      { name: 'MontoDte', value: String(Math.round(query.totalAmount)) },
      { name: 'Token', value: token },
    ],
    attempt,
    overrides,
  })
  const { code, message } = readSiiResponse(xml, 'queryDocumentStatus')
  assertStatusCode(code, 'queryDocumentStatus', xml)
  return {
    code,
    status: classifyDocumentStatus(code),
    message: extractTagContent(xml, 'GLOSA_ESTADO') ?? message ?? documentStatusMessage(code),
    raw: xml,
  }
}

const restDocumentStatus = async (
  sii: SiiClient,
  token: string,
  query: DocumentQuery,
  attempt: number,
  overrides?: CallOverrides,
): Promise<DocumentStatus> => {
  const company = splitSiiRut(query.companyRut)
  const receiver = splitSiiRut(query.receiverRut)
  const { day, month, year } = dateParts(query.issueDate)
  const url =
    `${sii.endpoints.rest.documentStatus}${company.body}-${company.verifier}-${query.type}-${query.folio}/estado` +
    `?rut_receptor=${receiver.body}&dv_receptor=${receiver.verifier}&monto=${Math.round(query.totalAmount)}&fechaEmision=${day}-${month}-${year}`
  const { json, text } = await restJson(sii, 'queryDocumentStatus', url, token, attempt, overrides)
  const code = str(json.codigo)
  if (code === '') throw new DteError('SII_RESPONSE_INVALID', { operation: 'queryDocumentStatus', body: bodyExcerpt(text) })
  return {
    code,
    status: classifyDocumentStatus(code),
    message: typeof json.descripcion === 'string' ? json.descripcion : documentStatusMessage(code),
    raw: text,
  }
}

/**
 * EN: Status of one document: `QueryEstDte` (SOAP, default for invoices and notes) or the receipts REST per-document
 * endpoint (default for 39/41; the REST API answers about ten minutes after the upload).
 * ES: Estado de un documento: `QueryEstDte` (SOAP, por defecto en facturas y notas) o el endpoint REST por documento
 * de boletas (por defecto en 39/41; la API REST responde unos diez minutos después del envío).
 * @throws {DteError} EN: `INVALID_RUT`, `INVALID_FOLIO`, `INVALID_AMOUNT`, `INVALID_DATE`, `MISSING_FIELD`, then the codes of `queryUploadStatus`. ES: los mismos códigos.
 */
export const queryDocumentStatus = async (
  sii: SiiClient,
  input: QueryDocumentStatusInput,
  overrides?: CallOverrides,
): Promise<DocumentStatus> => {
  const channel = input.channel ?? (isReceipt(input.type) ? 'rest' : 'soap')
  const query: DocumentQuery = {
    companyRut: resolveCompanyRut(sii, input.companyRut),
    receiverRut: toSiiRut(input.receiverRut, 'receiverRut'),
    type: input.type,
    folio: input.folio,
    issueDate: toIsoDate(input.issueDate, 'issueDate'),
    totalAmount: input.totalAmount,
  }
  if (!Number.isInteger(input.folio) || input.folio <= 0) throw new DteError('INVALID_FOLIO', { field: 'folio' })
  if (!Number.isFinite(input.totalAmount) || input.totalAmount < 0) throw new DteError('INVALID_AMOUNT', { field: 'totalAmount' })
  return withToken(sii, channel, overrides, (token) =>
    withRetry(
      retryFor(sii, overrides),
      (attempt) =>
        channel === 'rest'
          ? restDocumentStatus(sii, token, query, attempt, overrides)
          : soapDocumentStatus(sii, token, query, attempt, overrides),
      retryOptions(sii, 'queryDocumentStatus', overrides),
    ),
  )
}

/**
 * EN: Whether the SII already holds a document with this type and folio: `QueryEstDte` with the final-consumer
 * receiver, today's date and amount 1 answers by folio existence first. `false` = free, `true` = used, `null` =
 * undetermined (the caller decides). Prevents reusing a folio obtained again from a CAF, which the SII rejects.
 * ES: Si el SII ya tiene un documento con este tipo y folio: `QueryEstDte` con el receptor consumidor final, la fecha
 * de hoy y monto 1 responde primero por existencia del folio. `false` = libre, `true` = usado, `null` =
 * indeterminado (decide el llamador). Evita reutilizar un folio reobtenido de un CAF, que el SII rechaza.
 */
export const folioReceived = async (
  sii: SiiClient,
  input: FolioReceivedInput,
  overrides?: CallOverrides,
): Promise<boolean | null> => {
  const status = await queryDocumentStatus(
    sii,
    {
      companyRut: input.companyRut,
      receiverRut: FINAL_CONSUMER_RUT,
      type: input.type,
      folio: input.folio,
      issueDate: chileDate(sii.now()),
      totalAmount: 1,
      channel: 'soap',
    },
    overrides,
  )
  if (status.code === 'FAU') return false
  if (status.code === 'DOK' || status.code === 'DNK') return true
  if (/no recibido/i.test(status.message)) return false
  if (/recibido/i.test(status.message)) return true
  return null
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx jest tests/sii/status.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sii/status.ts tests/fixtures/sii tests/sii/status.test.ts
git commit -m "feat: envelope and document status queries, polling and folioReceived

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 15: Acceptance/claim registry (`src/sii/claims.ts`)

**Files:**
- Create: `src/sii/claims.ts`, `tests/fixtures/sii/claims-register-ok.xml`, `tests/fixtures/sii/claims-register-5.xml`, `tests/fixtures/sii/claims-events.xml`, `tests/fixtures/sii/claims-events-none.xml`, `tests/fixtures/sii/claims-cedible-23.xml`, `tests/fixtures/sii/claims-reception-date.xml`
- Test: `tests/sii/claims.test.ts`

- [ ] **Step 1: Fixtures**

All WSRECLAMO replies share this envelope (UTF-8, rpc/literal, prefixed `return`):

`tests/fixtures/sii/claims-register-ok.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><ns2:ingresarAceptacionReclamoDocResponse xmlns:ns2="http://ws.registroreclamodte.diii.sdi.sii.cl"><ns2:return><codResp>0</codResp><descResp>Accion completada OK</descResp><rutToken>76543210</rutToken></ns2:return></ns2:ingresarAceptacionReclamoDocResponse></soapenv:Body></soapenv:Envelope>
```

`tests/fixtures/sii/claims-register-5.xml`: same with `<codResp>5</codResp><descResp>DTE ya reclamado por 76543210-3</descResp>`.

`tests/fixtures/sii/claims-events.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><ns2:listarEventosHistDocResponse xmlns:ns2="http://ws.registroreclamodte.diii.sdi.sii.cl"><ns2:return><codResp>15</codResp><descResp>Lista de eventos del documento</descResp><listaEventosDoc><codEvento>ERM</codEvento><descEvento>Otorga Recibo de Mercaderías o Servicios</descEvento><rutResponsable>12345678</rutResponsable><dvResponsable>5</dvResponsable><fechaEvento>12-11-2026 09:30:00</fechaEvento></listaEventosDoc><listaEventosDoc><codEvento>ACD</codEvento><descEvento>Acepta Contenido del Documento</descEvento><rutResponsable>12345678</rutResponsable><dvResponsable>5</dvResponsable><fechaEvento>10-11-2026 10:00:00</fechaEvento></listaEventosDoc><rutToken>76543210</rutToken></ns2:return></ns2:listarEventosHistDocResponse></soapenv:Body></soapenv:Envelope>
```

`tests/fixtures/sii/claims-events-none.xml`: the `listarEventosHistDocResponse` envelope with `<ns2:return><codResp>16</codResp><descResp>El documento no tiene eventos registrados</descResp><rutToken>76543210</rutToken></ns2:return>`.

`tests/fixtures/sii/claims-cedible-23.xml`: a `consultarDocDteCedibleResponse` envelope with `<ns2:return><codResp>23</codResp><descResp>Documento cedible</descResp><rutToken>76543210</rutToken></ns2:return>`.

`tests/fixtures/sii/claims-reception-date.xml`: a `consultarFechaRecepcionSiiResponse` envelope with `<ns2:return>15-11-2026 15:30:05</ns2:return>`.

- [ ] **Step 2: Failing test**

`tests/sii/claims.test.ts`:

```ts
import { DteError } from '../../src/errors'
import { listClaimEvents, queryReceptionDate, queryTransferable, receiverStatus, registerClaim } from '../../src/sii/claims'
import type { FakeRoute } from '../support/fake-sii'
import { authRoutes, expectCode, siiFixture, SOAP_TOKEN, testSii } from '../support/sii-client'

const CLAIMS = 'https://ws2.sii.cl/WSREGISTRORECLAMODTECERT/registroreclamodteservice'
const fx = (name: string) => ({ body: siiFixture(name), encoding: 'utf8' as const })
const routes = (reply: FakeRoute['reply']): FakeRoute[] => [...authRoutes(), { url: CLAIMS, reply }]
const doc = { issuerRut: '12.345.678-5', type: 33 as const, folio: 45 }
const envelope = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><ns2:listarEventosHistDocResponse xmlns:ns2="http://ws.registroreclamodte.diii.sdi.sii.cl"><ns2:return>${inner}</ns2:return></ns2:listarEventosHistDocResponse></soapenv:Body></soapenv:Envelope>`

describe('registerClaim', () => {
  test('posts the qualified operation with the DTEWS token cookie and reads codResp', async () => {
    const { sii, fake } = testSii(routes(fx('claims-register-ok.xml')))
    const result = await registerClaim(sii, { ...doc, action: 'acceptContent' })
    const request = fake.requests[2]
    expect(request.url).toBe(CLAIMS)
    expect(request.headers['content-type']).toBe('text/xml; charset=utf-8')
    expect(request.headers.soapaction).toBe('')
    expect(request.headers.cookie).toBe(`TOKEN=${SOAP_TOKEN}`)
    expect(request.text).toContain('xmlns:ws="http://ws.registroreclamodte.diii.sdi.sii.cl"')
    expect(request.text).toContain(
      '<ws:ingresarAceptacionReclamoDoc><rutEmisor>12345678</rutEmisor><dvEmisor>5</dvEmisor><tipoDoc>33</tipoDoc><folio>45</folio><accionDoc>ACD</accionDoc></ws:ingresarAceptacionReclamoDoc>',
    )
    expect(result).toEqual({ code: 0, description: 'Accion completada OK', ok: true, raw: expect.stringContaining('<codResp>0</codResp>') })
  })

  test('business answers are returned, not thrown', async () => {
    const { sii } = testSii(routes(fx('claims-register-5.xml')))
    expect(await registerClaim(sii, { ...doc, action: 'claimContent' })).toMatchObject({ code: 5, ok: false, description: 'DTE ya reclamado por 76543210-3' })
  })

  test('validates the input before calling', async () => {
    const { sii, fake } = testSii(routes(fx('claims-register-ok.xml')))
    await expectCode(registerClaim(sii, { ...doc, action: 'approve' as never }), 'INVALID_OPTION', { field: 'action' })
    await expectCode(registerClaim(sii, { ...doc, type: 39 as never, action: 'acceptContent' }), 'INVALID_DOCUMENT_TYPE', { type: 39 })
    await expectCode(registerClaim(sii, { ...doc, folio: 0, action: 'acceptContent' }), 'INVALID_FOLIO', { field: 'folio' })
    await expectCode(registerClaim(sii, { ...doc, issuerRut: 'bad', action: 'acceptContent' }), 'INVALID_RUT', { field: 'issuerRut' })
    expect(fake.requests).toHaveLength(0)
  })

  test('401/403 renew the token once; faults, HTTP errors and odd replies are classified', async () => {
    const renewed = testSii(routes([{ status: 401, body: siiFixture('soap-fault.xml'), encoding: 'utf8' }, fx('claims-register-ok.xml')]))
    expect((await registerClaim(renewed.sii, { ...doc, action: 'acceptContent' })).ok).toBe(true)
    expect(renewed.fake.requests.filter((r) => r.url === CLAIMS)).toHaveLength(2)
    const forbidden = testSii(routes({ status: 403, body: 'denied' }))
    await expectCode(registerClaim(forbidden.sii, { ...doc, action: 'acceptContent' }), 'SII_TOKEN_INVALID', { attempts: 2 })
    const fault = testSii(routes({ status: 500, body: siiFixture('soap-fault.xml'), encoding: 'utf8' }))
    await expectCode(registerClaim(fault.sii, { ...doc, action: 'acceptContent' }), 'SII_SOAP_FAULT', { code: 'soapenv:Server', operation: 'registerClaim' })
    const down = testSii(routes({ status: 503, body: 'down' }), { retry: { maxAttempts: 2 } })
    await expectCode(registerClaim(down.sii, { ...doc, action: 'acceptContent' }), 'SII_HTTP_ERROR', { httpStatus: 503, attempts: 2 })
    const html = testSii(routes({ body: siiFixture('html-maintenance.html') }), { retry: false })
    await expectCode(registerClaim(html.sii, { ...doc, action: 'acceptContent' }), 'SII_RESPONSE_INVALID', { operation: 'registerClaim' })
    const noCode = testSii(routes({ body: envelope('<descResp>sin codigo</descResp>'), encoding: 'utf8' }), { retry: false })
    await expectCode(registerClaim(noCode.sii, { ...doc, action: 'acceptContent' }), 'SII_RESPONSE_INVALID')
  })
})

describe('listClaimEvents', () => {
  test('parses every event with the responsible RUT and an ISO date', async () => {
    const { sii } = testSii(routes(fx('claims-events.xml')))
    const result = await listClaimEvents(sii, doc)
    expect(result).toMatchObject({ code: 15, ok: false })
    expect(result.events).toEqual([
      { code: 'ERM', description: 'Otorga Recibo de Mercaderías o Servicios', responsibleRut: '12345678-5', date: '12-11-2026 09:30:00', dateIso: '2026-11-12T09:30:00' },
      { code: 'ACD', description: 'Acepta Contenido del Documento', responsibleRut: '12345678-5', date: '10-11-2026 10:00:00', dateIso: '2026-11-10T10:00:00' },
    ])
  })

  test('tolerates missing or invalid fields', async () => {
    const { sii } = testSii(routes({ body: envelope('<codResp>15</codResp><listaEventosDoc><codEvento>RCD</codEvento></listaEventosDoc><listaEventosDoc><rutResponsable>1</rutResponsable><dvResponsable>1</dvResponsable><fechaEvento>soon</fechaEvento></listaEventosDoc>'), encoding: 'utf8' }))
    const result = await listClaimEvents(sii, doc)
    expect(result.description).toBe('')
    expect(result.events).toEqual([
      { code: 'RCD', description: '', responsibleRut: null, date: '', dateIso: null },
      { code: '', description: '', responsibleRut: null, date: 'soon', dateIso: null },
    ])
    expect((await listClaimEvents(testSii(routes(fx('claims-events-none.xml'))).sii, doc)).events).toEqual([])
  })
})

describe('queryTransferable / queryReceptionDate', () => {
  test('transferability follows the catalog', async () => {
    expect(await queryTransferable(testSii(routes(fx('claims-cedible-23.xml'))).sii, doc)).toMatchObject({ code: 23, transferable: true })
    const notTransferable = fx('claims-cedible-23.xml').body.replace('<codResp>23</codResp>', '<codResp>24</codResp>')
    expect(await queryTransferable(testSii(routes({ body: notTransferable, encoding: 'utf8' })).sii, doc)).toMatchObject({ code: 24, transferable: false })
    const unknown = fx('claims-cedible-23.xml').body.replace('<codResp>23</codResp>', '<codResp>22</codResp>')
    expect(await queryTransferable(testSii(routes({ body: unknown, encoding: 'utf8' })).sii, doc)).toMatchObject({ code: 22, transferable: null })
  })

  test('reception date is returned raw and normalised', async () => {
    expect(await queryReceptionDate(testSii(routes(fx('claims-reception-date.xml'))).sii, doc)).toEqual({
      receivedAt: '15-11-2026 15:30:05',
      receivedAtIso: '2026-11-15T15:30:05',
      raw: expect.stringContaining('15-11-2026 15:30:05'),
    })
    const empty = fx('claims-reception-date.xml').body.replace('15-11-2026 15:30:05', ' ')
    expect(await queryReceptionDate(testSii(routes({ body: empty, encoding: 'utf8' })).sii, doc)).toMatchObject({ receivedAt: null, receivedAtIso: null })
  })
})

describe('receiverStatus', () => {
  test('derives the status from the latest event by date', async () => {
    const { sii } = testSii(routes(fx('claims-events.xml')))
    expect(await receiverStatus(sii, doc)).toMatchObject({ status: 'goodsReceived', code: 15, lastEvent: { code: 'ERM' } })
  })

  test.each([
    ['<codResp>15</codResp><listaEventosDoc><codEvento>ACD</codEvento><fechaEvento>10-11-2026 10:00:00</fechaEvento></listaEventosDoc><listaEventosDoc><codEvento>RFT</codEvento><fechaEvento>11-11-2026 10:00:00</fechaEvento></listaEventosDoc>', 'claimed'],
    ['<codResp>15</codResp><listaEventosDoc><codEvento>NCA</codEvento></listaEventosDoc>', 'none'],
    ['<codResp>15</codResp><listaEventosDoc><codEvento>ACD</codEvento></listaEventosDoc><listaEventosDoc><codEvento>XYZ</codEvento></listaEventosDoc>', 'unknown'],
    ['<codResp>16</codResp>', 'none'],
    ['<codResp>18</codResp>', 'none'],
    ['<codResp>9</codResp>', 'unknown'],
  ])('%s → %s', async (inner, expected) => {
    const { sii } = testSii(routes({ body: envelope(inner), encoding: 'utf8' }))
    expect((await receiverStatus(sii, doc)).status).toBe(expected)
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx jest tests/sii/claims.test.ts`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 4: Implementation**

`src/sii/claims.ts`:

```ts
import { CLAIM_ACTIONS, isClaimAction, transferabilityOf, type ClaimAction } from '../catalogs/claim-codes'
import { DteError } from '../errors'
import { splitSiiRut, toSiiRut, type SiiRut } from '../model/rut'
import { extractTagContent } from '../xml/parse'
import { withToken } from './auth'
import { retryFor, timeoutFor, type CallOverrides, type SiiClient } from './client'
import { bodyExcerpt, httpError, isSuccess, retryOptions, siiTimestampToIso } from './operation'
import { withRetry } from './retry'
import { send } from './send'
import { buildSoapEnvelope, parseSoapResponse, SOAP_HEADERS, type SoapParam } from './soap'
import { decodeBody, encodeUtf8 } from './transport'

const CLAIMS_NAMESPACE = 'http://ws.registroreclamodte.diii.sdi.sii.cl'
const CLAIM_DOCUMENT_TYPES: readonly number[] = [33, 34, 43]

/**
 * EN: Document types the registry accepts.
 * ES: `tipoDoc` — Tipos de documento que acepta el registro: 33, 34 y 43.
 */
export type ClaimDocumentType = 33 | 34 | 43

/**
 * EN: A received document identified for the registry.
 * ES: Un documento recibido identificado para el registro.
 */
export type ClaimDocumentInput = {
  /** EN: RUT of the document issuer (the supplier). ES: `rutEmisor`-`dvEmisor` — RUT del emisor del documento (el proveedor). */
  readonly issuerRut: string
  /** EN: 33, 34 or 43. ES: `tipoDoc` — 33, 34 o 43. */
  readonly type: ClaimDocumentType
  /** EN: Folio. ES: `folio`. */
  readonly folio: number
}

/**
 * EN: Input of `registerClaim`.
 * ES: Entrada de `registerClaim`.
 */
export type RegisterClaimInput = ClaimDocumentInput & {
  /** EN: Action to register. ES: `accionDoc` — Acción a registrar. */
  readonly action: ClaimAction
}

/**
 * EN: Outcome of a registry operation. The SII answers business situations with a code instead of an error.
 * ES: Resultado de una operación del registro. El SII responde situaciones de negocio con un código, no con un error.
 */
export type ClaimResult = {
  /** EN: SII response code (0 ok, 1–19 business, -1 internal). ES: `codResp`. */
  readonly code: number
  /** EN: SII description (≤ 70 chars). ES: `descResp`. */
  readonly description: string
  /** EN: true when `code` is 0. ES: true si `codResp` es 0. */
  readonly ok: boolean
  /** EN: Inner XML of `return`. ES: XML interior de `return`. */
  readonly raw: string
}

/**
 * EN: One registered event.
 * ES: Un evento registrado (`listaEventosDoc`).
 */
export type ClaimEvent = {
  /** EN: ACD, RCD, ERM, RFP, RFT, NCA, ENC. ES: `codEvento`. */
  readonly code: string
  /** EN: Description. ES: `descEvento`. */
  readonly description: string
  /** EN: RUT that registered the event, or null. ES: `rutResponsable`-`dvResponsable`. */
  readonly responsibleRut: SiiRut | null
  /** EN: Date as sent by the SII. ES: `fechaEvento`. */
  readonly date: string
  /** EN: `YYYY-MM-DDTHH:MM:SS` when the date parses. ES: `fechaEvento` normalizada cuando se puede. */
  readonly dateIso: string | null
}

/** EN: `listClaimEvents` result. ES: Resultado de `listClaimEvents`. */
export type ClaimEventsResult = ClaimResult & { readonly events: readonly ClaimEvent[] }

/** EN: `queryTransferable` result. ES: Resultado de `queryTransferable` (`cedible`). */
export type TransferabilityResult = ClaimResult & { readonly transferable: boolean | null }

/**
 * EN: `queryReceptionDate` result.
 * ES: Resultado de `queryReceptionDate` (`consultarFechaRecepcionSii`).
 */
export type ReceptionDateResult = {
  /** EN: The string the SII returned, or null when empty. ES: El string que devolvió el SII, o null si vacío. */
  readonly receivedAt: string | null
  /** EN: Normalised when it parses. ES: Normalizada cuando se puede. */
  readonly receivedAtIso: string | null
  readonly raw: string
}

/**
 * EN: Summary of what the receiver did with a document.
 * ES: Resumen de lo que hizo el receptor con un documento: aceptado, recibo de mercaderías, reclamado, nada, desconocido.
 */
export type ReceiverStatus = 'accepted' | 'goodsReceived' | 'claimed' | 'none' | 'unknown'

/** EN: `receiverStatus` result. ES: Resultado de `receiverStatus`. */
export type ReceiverStatusResult = {
  readonly status: ReceiverStatus
  readonly lastEvent: ClaimEvent | null
  readonly code: number
}

const documentParams = (input: ClaimDocumentInput): readonly SoapParam[] => {
  const issuer = splitSiiRut(toSiiRut(input.issuerRut, 'issuerRut'))
  if (!CLAIM_DOCUMENT_TYPES.includes(input.type)) throw new DteError('INVALID_DOCUMENT_TYPE', { type: input.type })
  if (!Number.isInteger(input.folio) || input.folio <= 0) throw new DteError('INVALID_FOLIO', { field: 'folio' })
  return [
    { name: 'rutEmisor', value: issuer.body },
    { name: 'dvEmisor', value: issuer.verifier },
    { name: 'tipoDoc', value: String(input.type) },
    { name: 'folio', value: String(input.folio) },
  ]
}

const callClaims = (
  sii: SiiClient,
  operation: string,
  method: string,
  params: readonly SoapParam[],
  overrides?: CallOverrides,
): Promise<string> =>
  withToken(sii, 'soap', overrides, (token) =>
    withRetry(
      retryFor(sii, overrides),
      async (attempt) => {
        const response = await send(sii, {
          operation,
          channel: 'soap',
          method: 'POST',
          url: sii.endpoints.claims,
          headers: { ...SOAP_HEADERS, Cookie: `TOKEN=${token}` },
          body: encodeUtf8(buildSoapEnvelope({ method, namespace: CLAIMS_NAMESPACE, params })),
          timeoutMs: timeoutFor(sii, 'soap', overrides),
          signal: overrides?.signal,
          attempt,
          requestEncoding: 'utf8',
          responseEncoding: 'utf8',
        })
        const text = decodeBody(response.body, 'utf8')
        if (response.status === 401 || response.status === 403)
          throw new DteError('SII_TOKEN_INVALID', { operation, channel: 'soap', httpStatus: response.status })
        const parsed = parseSoapResponse(text)
        if (parsed.fault !== null)
          throw new DteError('SII_SOAP_FAULT', { code: parsed.fault.code, reason: parsed.fault.reason, operation, httpStatus: response.status })
        if (!isSuccess(response.status)) throw httpError(response, text, operation, 'soap')
        if (parsed.returnXml === null) throw new DteError('SII_RESPONSE_INVALID', { operation, body: bodyExcerpt(text) })
        return parsed.returnXml
      },
      retryOptions(sii, operation, overrides),
    ),
  )

const readResult = (xml: string, operation: string): ClaimResult => {
  const code = extractTagContent(xml, 'codResp')?.trim()
  if (code === undefined || !/^-?\d+$/.test(code)) throw new DteError('SII_RESPONSE_INVALID', { operation, body: bodyExcerpt(xml) })
  const value = Number(code)
  return { code: value, description: extractTagContent(xml, 'descResp') ?? '', ok: value === 0, raw: xml }
}

const rutOrNull = (body: string | null, verifier: string | null): SiiRut | null => {
  if (body === null || verifier === null) return null
  try {
    return toSiiRut(`${body}-${verifier}`)
  } catch {
    return null
  }
}

const toEvent = (item: string): ClaimEvent => {
  const date = extractTagContent(item, 'fechaEvento') ?? ''
  return {
    code: extractTagContent(item, 'codEvento') ?? '',
    description: extractTagContent(item, 'descEvento') ?? '',
    responsibleRut: rutOrNull(extractTagContent(item, 'rutResponsable'), extractTagContent(item, 'dvResponsable')),
    date,
    dateIso: siiTimestampToIso(date),
  }
}

const readEvents = (xml: string): readonly ClaimEvent[] =>
  Array.from(xml.matchAll(/<listaEventosDoc>([\s\S]*?)<\/listaEventosDoc>/g), (match) => toEvent(match[1]))

/**
 * EN: Registers an action on a received document (`ingresarAceptacionReclamoDoc`): accept content, claim content,
 * acknowledge goods, claim partial or total shortfall. Business answers (already claimed, past 8 days…) come back as
 * `code`/`ok: false`, not as errors.
 * ES: Registra una acción sobre un documento recibido (`ingresarAceptacionReclamoDoc`): acepta contenido, reclama
 * contenido, otorga recibo de mercaderías, reclama falta parcial o total. Las respuestas de negocio (ya reclamado,
 * pasados 8 días…) vuelven como `code`/`ok: false`, no como errores.
 * @throws {DteError} EN: `INVALID_OPTION { field: 'action' }`, `INVALID_DOCUMENT_TYPE`, `INVALID_FOLIO`, `INVALID_RUT`, `SII_TOKEN_INVALID`, `SII_SOAP_FAULT`, `SII_HTTP_ERROR`, `SII_RESPONSE_INVALID`, transport codes. ES: los mismos códigos.
 */
export const registerClaim = async (sii: SiiClient, input: RegisterClaimInput, overrides?: CallOverrides): Promise<ClaimResult> => {
  if (!isClaimAction(input.action)) throw new DteError('INVALID_OPTION', { field: 'action' })
  const params = [...documentParams(input), { name: 'accionDoc', value: CLAIM_ACTIONS[input.action] }]
  return readResult(await callClaims(sii, 'registerClaim', 'ingresarAceptacionReclamoDoc', params, overrides), 'registerClaim')
}

/**
 * EN: Events registered on a document (`listarEventosHistDoc`).
 * ES: Eventos registrados sobre un documento (`listarEventosHistDoc`).
 */
export const listClaimEvents = async (sii: SiiClient, input: ClaimDocumentInput, overrides?: CallOverrides): Promise<ClaimEventsResult> => {
  const xml = await callClaims(sii, 'listClaimEvents', 'listarEventosHistDoc', documentParams(input), overrides)
  return { ...readResult(xml, 'listClaimEvents'), events: readEvents(xml) }
}

/**
 * EN: Whether a document is transferable (`consultarDocDteCedible`): `transferable` follows the 20–25 codes, null when undetermined.
 * ES: Si un documento es cedible (`consultarDocDteCedible`): `transferable` sigue los códigos 20–25, null si indeterminado.
 */
export const queryTransferable = async (sii: SiiClient, input: ClaimDocumentInput, overrides?: CallOverrides): Promise<TransferabilityResult> => {
  const result = readResult(await callClaims(sii, 'queryTransferable', 'consultarDocDteCedible', documentParams(input), overrides), 'queryTransferable')
  return { ...result, transferable: transferabilityOf(result.code) }
}

/**
 * EN: When the SII received a document (`consultarFechaRecepcionSii`), raw and normalised.
 * ES: Cuándo recibió el SII un documento (`consultarFechaRecepcionSii`), cruda y normalizada.
 */
export const queryReceptionDate = async (sii: SiiClient, input: ClaimDocumentInput, overrides?: CallOverrides): Promise<ReceptionDateResult> => {
  const xml = await callClaims(sii, 'queryReceptionDate', 'consultarFechaRecepcionSii', documentParams(input), overrides)
  const value = xml.trim()
  const receivedAt = value === '' ? null : value
  return { receivedAt, receivedAtIso: siiTimestampToIso(receivedAt), raw: xml }
}

const EVENT_STATUS: Readonly<Record<string, ReceiverStatus>> = {
  ACD: 'accepted',
  ERM: 'goodsReceived',
  RCD: 'claimed',
  RFP: 'claimed',
  RFT: 'claimed',
  NCA: 'none',
  ENC: 'none',
}
const NO_EVENT_CODES: readonly number[] = [15, 16, 18]

/**
 * EN: What the receiver did, derived from the latest event of `listClaimEvents` (by date, else by position):
 * `accepted` (ACD), `goodsReceived` (ERM), `claimed` (RCD/RFP/RFT), `none` (no events, NCA/ENC), `unknown` otherwise.
 * ES: Qué hizo el receptor, derivado del último evento de `listClaimEvents` (por fecha, si no por posición):
 * `accepted` (ACD), `goodsReceived` (ERM), `claimed` (RCD/RFP/RFT), `none` (sin eventos, NCA/ENC), `unknown` en otro caso.
 */
export const receiverStatus = async (sii: SiiClient, input: ClaimDocumentInput, overrides?: CallOverrides): Promise<ReceiverStatusResult> => {
  const result = await listClaimEvents(sii, input, overrides)
  if (result.events.length === 0)
    return { status: NO_EVENT_CODES.includes(result.code) ? 'none' : 'unknown', lastEvent: null, code: result.code }
  const ordered = [...result.events].sort((a, b) => (a.dateIso ?? '').localeCompare(b.dateIso ?? ''))
  const last = ordered[ordered.length - 1]
  return { status: EVENT_STATUS[last.code] ?? 'unknown', lastEvent: last, code: result.code }
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx jest tests/sii/claims.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sii/claims.ts tests/fixtures/sii tests/sii/claims.test.ts
git commit -m "feat: acceptance/claim registry operations and derived receiver status

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 16: Public API, type-level tests, `dist/` smoke and documentation

**Files:**
- Modify: `src/index.ts`, `tests/public-api.test.ts`, `tests/types.test.ts`, `tests/dist.smoke.test.ts`, `.github/workflows/ci.yml`, `README.md`, `CHANGELOG.md`, `llms.txt`, `package.json`

- [ ] **Step 1: Failing tests**

`tests/public-api.test.ts`: add these names to `RUNTIME_EXPORTS` (the test sorts both sides, so append them anywhere inside the array):

```ts
  'CLAIM_ACTIONS',
  'CLAIM_EVENT_CODES',
  'CLAIM_RESPONSE_CODES',
  'DEFAULT_RETRY_POLICY',
  'DEFAULT_TIMEOUTS',
  'DEFAULT_TOKEN_TTL_MS',
  'RECEPTION_STATUS',
  'SOAP_HEADERS',
  'TRANSFERABILITY_CODES',
  'buildMultipartBody',
  'buildSoapEnvelope',
  'certificateFingerprint',
  'claimResponseMessage',
  'classifyReceptionStatus',
  'createDirectoryCapture',
  'createDirectoryUploadArchive',
  'createFetchTransport',
  'createMemoryCapture',
  'createMemoryTokenCache',
  'createMemoryUploadArchive',
  'createNodeHttpsTransport',
  'createSiiClient',
  'decodeBody',
  'encodeUtf8',
  'folioReceived',
  'generateBoundary',
  'getSeed',
  'getToken',
  'invalidateToken',
  'isClaimAction',
  'isRetryableError',
  'isRetryableReceptionStatus',
  'isSchemaRejection',
  'listClaimEvents',
  'mergeRetryPolicy',
  'multipartContentType',
  'parseReceptionResponse',
  'parseSoapResponse',
  'queryDocumentStatus',
  'queryReceptionDate',
  'queryTransferable',
  'queryUploadStatus',
  'receiverStatus',
  'receptionStatusMessage',
  'redactExchange',
  'redactHeaders',
  'redactText',
  'registerClaim',
  'retryDelayMs',
  'signRootElement',
  'signSeed',
  'silentLogger',
  'stripNamespacePrefixes',
  'tokenCacheKey',
  'transferabilityMessage',
  'transferabilityOf',
  'uploadBook',
  'uploadEnvelope',
  'uploadFolioConsumption',
  'uploadRecordName',
  'waitForUploadStatus',
  'withRetry',
```

(`CLAIM_WSDL_ENDPOINTS` and `isTokenErrorStatus` were added in Task 2.)

`tests/types.test.ts`: extend the imports and append inside `_typecheck`:

```ts
import { createSiiClient, uploadEnvelope, queryUploadStatus, registerClaim, folioReceived, createFetchTransport } from '../src'
import type { SiiClient, SiiClientOptions, UploadReceipt, UploadStatus, ClaimResult, HttpTransport, HttpRequest, HttpResponse, RetryPolicy, ClaimAction } from '../src'
```

```ts
  expectTypeOf(createSiiClient).returns.toEqualTypeOf<SiiClient>()
  expectTypeOf(createSiiClient).parameter(0).toEqualTypeOf<SiiClientOptions>()
  expectTypeOf<SiiClient['retry']>().toEqualTypeOf<RetryPolicy | false>()
  expectTypeOf(uploadEnvelope).returns.resolves.toEqualTypeOf<UploadReceipt>()
  expectTypeOf(queryUploadStatus).returns.resolves.toEqualTypeOf<UploadStatus>()
  expectTypeOf(registerClaim).returns.resolves.toEqualTypeOf<ClaimResult>()
  expectTypeOf(folioReceived).returns.resolves.toEqualTypeOf<boolean | null>()
  expectTypeOf(createFetchTransport).returns.toEqualTypeOf<HttpTransport>()
  expectTypeOf<HttpTransport>().parameter(0).toEqualTypeOf<HttpRequest>()
  expectTypeOf<HttpTransport>().returns.resolves.toEqualTypeOf<HttpResponse>()
  expectTypeOf<ClaimAction>().toEqualTypeOf<'acceptContent' | 'claimContent' | 'acknowledgeGoods' | 'claimPartialShortfall' | 'claimTotalShortfall'>()
  // The client is data: no method may exist on it.
  expectTypeOf<SiiClient>().not.toHaveProperty('uploadEnvelope')
```

`tests/dist.smoke.test.ts`: add to `EXPECTED_FUNCTIONS`:

```ts
  'createSiiClient',
  'createFetchTransport',
  'createNodeHttpsTransport',
  'createMemoryTokenCache',
  'uploadEnvelope',
  'queryUploadStatus',
  'queryDocumentStatus',
  'registerClaim',
  'signSeed',
```

and append a test inside the guarded `describe`:

```ts
  test('the bundles build a client and sign a seed without touching the network or node:https', () => {
    const req = createRequire(__filename)
    const sdk = req(cjsEntry) as typeof import('../src')
    const { readFileSync } = req('node:fs') as typeof import('node:fs')
    const fixtures = join(__dirname, 'fixtures')
    const certificate = sdk.loadCertificateFromPem({
      privateKeyPem: readFileSync(join(fixtures, 'cert.key.pem'), 'utf8'),
      certificatePem: readFileSync(join(fixtures, 'cert.pem'), 'utf8'),
    })
    const sii = sdk.createSiiClient({ environment: 'certification', certificate, transport: sdk.createNodeHttpsTransport() })
    expect(sii.receiptsChannel).toBe('soap')
    expect(sdk.signSeed('000000000078', certificate)).toContain('<Reference URI="">')
    const source = readFileSync(esmEntry, 'utf8')
    expect(source).not.toMatch(/^import[^;]*"node:https"/m)
  })
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest tests/public-api.test.ts tests/types.test.ts`
Expected: FAIL (missing exports). `tests/dist.smoke.test.ts` is skipped until the next build.

- [ ] **Step 3: Exports**

`src/index.ts`: extend the existing `upload-status` and `endpoints` lines if Task 2 did not, then append:

```ts
export {
  RECEPTION_STATUS,
  classifyReceptionStatus,
  receptionStatusMessage,
  isRetryableReceptionStatus,
  isSchemaRejection,
} from './catalogs/reception-status'
export type { ReceptionStatusClass } from './catalogs/reception-status'
export {
  CLAIM_ACTIONS,
  isClaimAction,
  CLAIM_EVENT_CODES,
  CLAIM_RESPONSE_CODES,
  claimResponseMessage,
  TRANSFERABILITY_CODES,
  transferabilityOf,
  transferabilityMessage,
} from './catalogs/claim-codes'
export type { ClaimAction, ClaimActionCode } from './catalogs/claim-codes'
export { signRootElement } from './signature/xmldsig'
export type { SignRootElementInput } from './signature/xmldsig'

export { silentLogger } from './sii/logger'
export type { Logger, LogFn, LogContext } from './sii/logger'
export { certificateFingerprint, tokenCacheKey, createMemoryTokenCache } from './sii/token-cache'
export type { TokenChannel, CachedToken, TokenCache } from './sii/token-cache'
export { DEFAULT_RETRY_POLICY, mergeRetryPolicy, isRetryableError, retryDelayMs, withRetry } from './sii/retry'
export type { RetryPolicy, RetryOptions } from './sii/retry'
export { createFetchTransport, decodeBody, encodeUtf8 } from './sii/transport'
export type { HttpMethod, HttpRequest, HttpResponse, HttpTransport, BodyEncoding, FetchLike } from './sii/transport'
export { createNodeHttpsTransport } from './sii/node-transport'
export type { NodeTlsOptions, NodeHttpsTransportOptions, TlsVersion } from './sii/node-transport'
export { redactText, redactHeaders, redactExchange, createMemoryCapture } from './sii/capture'
export type { HttpExchange, HttpExchangeRequest, HttpExchangeResponse, HttpExchangeError, HttpCapture } from './sii/capture'
export { uploadRecordName, createMemoryUploadArchive } from './sii/archive'
export type { UploadKind, UploadRecord, UploadArchive } from './sii/archive'
export { createDirectoryCapture } from './sii/node-capture'
export type { DirectoryCaptureOptions } from './sii/node-capture'
export { createDirectoryUploadArchive } from './sii/node-archive'
export type { DirectoryUploadArchiveOptions } from './sii/node-archive'
export { createSiiClient, DEFAULT_TIMEOUTS, DEFAULT_TOKEN_TTL_MS } from './sii/client'
export type { SiiClient, SiiClientOptions, SiiTimeouts, SiiEndpoints, CallOverrides, SleepFn } from './sii/client'
export { buildSoapEnvelope, parseSoapResponse, stripNamespacePrefixes, SOAP_HEADERS } from './sii/soap'
export type { SoapParam, SoapEnvelopeInput, SoapFault, SoapResponse } from './sii/soap'
export { generateBoundary, multipartContentType, buildMultipartBody } from './sii/multipart'
export type { MultipartField, MultipartFile, MultipartBodyInput } from './sii/multipart'
export { getSeed, signSeed, getToken, invalidateToken } from './sii/auth'
export { uploadEnvelope, uploadBook, uploadFolioConsumption, parseReceptionResponse } from './sii/upload'
export type { UploadReceipt, UploadableEnvelope, UploadEnvelopeInput, UploadXmlInput, ReceptionOutcome } from './sii/upload'
export { queryUploadStatus, waitForUploadStatus, queryDocumentStatus, folioReceived } from './sii/status'
export type {
  UploadStatus,
  UploadStatusCounts,
  UploadStatusDocument,
  UploadStatusDocumentError,
  QueryUploadStatusInput,
  WaitForUploadStatusInput,
  DocumentStatus,
  QueryDocumentStatusInput,
  FolioReceivedInput,
} from './sii/status'
export { registerClaim, listClaimEvents, queryTransferable, queryReceptionDate, receiverStatus } from './sii/claims'
export type {
  ClaimDocumentType,
  ClaimDocumentInput,
  RegisterClaimInput,
  ClaimResult,
  ClaimEvent,
  ClaimEventsResult,
  TransferabilityResult,
  ReceptionDateResult,
  ReceiverStatus,
  ReceiverStatusResult,
} from './sii/claims'
```

Update the header comment of `src/index.ts` to mention the SII client; keep "everything is exported from this single entry".

`.github/workflows/ci.yml`: in the Deno and Bun smoke steps, extend the condition to
`if (typeof m.createDocument !== 'function' || typeof m.createSiiClient !== 'function')`.

- [ ] **Step 4: Documentation**

`package.json`: `"description": "TypeScript SDK for Chilean electronic tax documents (DTE): build, stamp (TED), sign and envelope DTEs for the SII, and talk to the SII web services (upload, status, acceptance/claims)."`.

`README.md`: in the feature list add, after the Certificates bullet:

```markdown
- 📡 **SII web services** — seed/token, `DTEUpload` and the receipts REST API, envelope and
  document status, polling, acceptance/claims; injectable transport, retries, HTTP capture
  with redaction and an upload archive. TLS verification stays on.
```

and insert a new section between "Step by step" and "Errors":

````markdown
## SII web services

```typescript
import { createSiiClient, uploadEnvelope, waitForUploadStatus, registerClaim, claimResponseMessage } from 'dte-sdk'

const sii = createSiiClient({ environment: 'certification', certificate, companyRut: '76543210-3' })

const receipt = await uploadEnvelope(sii, { envelope }) // EnvioDTE → DTEUpload; EnvioBOLETA → REST in production
const status = await waitForUploadStatus(sii, { trackId: receipt.trackId })
status.status // 'accepted' | 'acceptedWithObjections' | 'rejected' | …
status.message // Spanish gloss from the SII

const claim = await registerClaim(sii, { issuerRut: '77111222-3', type: 33, folio: 1234, action: 'acceptContent' })
if (!claim.ok) console.log(claimResponseMessage(claim.code)) // business answers are codes, not errors
```

The client is plain data: every operation is a free function that takes it first. Tokens are
obtained and renewed for you (one cache per environment, channel and certificate). Also
available: `getSeed`/`getToken`, `uploadBook`, `uploadFolioConsumption`, `queryUploadStatus`,
`queryDocumentStatus`, `folioReceived`, `listClaimEvents`, `queryTransferable`,
`queryReceptionDate`, `receiverStatus`.

Options worth knowing:

- `transport`: `fetch` by default; `createNodeHttpsTransport({ tls })` for a custom CA
  (`tls.ca`) or, only if you must, `rejectUnauthorized: false` / `legacyRenegotiation: true`.
  The SII hosts verify with the system trust store, so the defaults just work.
- `retry`: 6 attempts with exponential backoff by default; `false` disables it. Uploads are
  never re-sent once the SII answered.
- `capture: createDirectoryCapture({ dir })` writes every HTTP exchange, redacted (tokens,
  seeds, cookies, private keys), for SII support tickets. `archive:
  createDirectoryUploadArchive({ dir })` keeps the exact bytes of every upload with its TrackID.
- `logger`: silent by default; pass `console` or your own. Messages never carry tokens or RUTs.
- Every call accepts `{ signal, timeoutMs, retry }` as a last argument.
````

`CHANGELOG.md`: under `## [Unreleased]` → `### Added`, append:

```markdown
- SII web services client: `createSiiClient` (plain data, no methods) and free functions
  for seed/token on the DTEWS SOAP and receipts REST channels (`getSeed`, `getToken`),
  uploads (`uploadEnvelope`, `uploadBook`, `uploadFolioConsumption`) with duplicate
  recovery, status queries (`queryUploadStatus`, `waitForUploadStatus`,
  `queryDocumentStatus`, `folioReceived`) and the acceptance/claim registry
  (`registerClaim`, `listClaimEvents`, `queryTransferable`, `queryReceptionDate`,
  `receiverStatus`).
- Injectable HTTP transport (`createFetchTransport`, `createNodeHttpsTransport` with TLS
  verification on by default), token cache, retry policy with backoff, HTTP capture with
  redaction (`createMemoryCapture`, `createDirectoryCapture`) and upload archive
  (`createMemoryUploadArchive`, `createDirectoryUploadArchive`).
- Catalogs: `DTEUpload` reception statuses, claim actions/events/response codes,
  `FAN` document status, REST per-document status endpoint.

### Changed

- `CLAIM_WS_ENDPOINTS` now holds the WSRECLAMO service URLs; the WSDL URLs moved to
  `CLAIM_WSDL_ENDPOINTS`.
```

`llms.txt`: extend the description paragraph with:

```
The SII web services client is `createSiiClient({ environment, certificate, companyRut })` plus free functions: `uploadEnvelope`/`uploadBook`/`uploadFolioConsumption` (DTEUpload multipart in ISO-8859-1, or the receipts REST API in production; duplicates return the original TrackID), `queryUploadStatus`/`waitForUploadStatus`/`queryDocumentStatus`/`folioReceived`, and the acceptance/claim registry `registerClaim`/`listClaimEvents`/`queryTransferable`/`queryReceptionDate`/`receiverStatus`. Tokens are obtained and renewed automatically per environment, channel and certificate. Transport is injectable (`fetch` by default, `createNodeHttpsTransport` with TLS verification on), retries use exponential backoff and never re-send an upload after an SII answer, and `capture`/`archive` ports record redacted HTTP exchanges and the bytes of every upload.
```

- [ ] **Step 5: Run everything and watch it pass**

Run: `npm run prettier && npm run lint && npx tsc --noEmit && npm test && npm run build && npx jest tests/dist.smoke.test.ts`
Expected: all PASS; the build succeeds with `node:*` external.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts tests/public-api.test.ts tests/types.test.ts tests/dist.smoke.test.ts .github/workflows/ci.yml README.md CHANGELOG.md llms.txt package.json
git commit -m "feat: export the SII web services client and document it

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: Opt-in live smoke against maullin

**Files:**
- Create: `tests/live/sii.live.test.ts`
- Modify: `README.md` (Development section)

- [ ] **Step 1: The test**

`tests/live/sii.live.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { loadCertificateFromPkcs12 } from '../../src/certificate/pkcs12'
import { getSeed, getToken } from '../../src/sii/auth'
import { createSiiClient } from '../../src/sii/client'
import { createMemoryCapture } from '../../src/sii/capture'
import { createNodeHttpsTransport } from '../../src/sii/node-transport'
import { queryUploadStatus } from '../../src/sii/status'

/**
 * Live smoke against the SII certification environment. Never runs in CI: it needs a real certificate.
 *   SII_LIVE=1 SII_CERT_PFX=/path/to/cert.pfx SII_CERT_PASSWORD=… [SII_COMPANY_RUT=…] [SII_LIVE_TRACK_ID=…] npx jest tests/live
 * Nothing from here is committed: no output, no capture directory, no RUT.
 */
const env = process.env
const enabled = env.SII_LIVE === '1' && env.SII_CERT_PFX !== undefined && env.SII_CERT_PASSWORD !== undefined
const guarded = enabled ? describe : describe.skip

guarded('live: maullin', () => {
  const certificate = enabled ? loadCertificateFromPkcs12(new Uint8Array(readFileSync(env.SII_CERT_PFX!)), env.SII_CERT_PASSWORD!) : null
  const capture = createMemoryCapture()
  const sii = () =>
    createSiiClient({
      environment: 'certification',
      certificate: certificate!,
      companyRut: env.SII_COMPANY_RUT,
      transport: createNodeHttpsTransport(),
      capture: capture.capture,
      timeouts: { soap: 20000, rest: 20000, upload: 60000 },
    })

  test('DTEWS seed and token', async () => {
    const seed = await getSeed(sii(), 'soap')
    expect(seed).toMatch(/^\d{12}$/)
    expect(await getToken(sii(), 'soap')).toMatch(/^[A-Za-z0-9]{8,}$/)
  }, 60000)

  test('receipts REST seed and token', async () => {
    expect(await getSeed(sii(), 'rest')).toMatch(/^\d{12}$/)
    expect(await getToken(sii(), 'rest')).toMatch(/^[A-Za-z0-9]{8,}$/)
  }, 60000)

  const withTrackId = env.SII_LIVE_TRACK_ID !== undefined && env.SII_COMPANY_RUT !== undefined ? test : test.skip
  withTrackId('QueryEstUp of a known TrackID', async () => {
    const status = await queryUploadStatus(sii(), { trackId: env.SII_LIVE_TRACK_ID! })
    expect(status.code.length).toBeGreaterThan(0)
    expect(['accepted', 'acceptedWithObjections', 'pending', 'rejected', 'unknown']).toContain(status.status)
  }, 60000)

  afterAll(() => {
    // Captured exchanges are redacted; print only the operation summary so a failing run can be diagnosed.
    for (const exchange of capture.exchanges())
      console.log(`${exchange.operation} attempt ${exchange.attempt}: ${exchange.response?.status ?? exchange.error?.code} in ${exchange.durationMs} ms`)
  })
})
```

- [ ] **Step 2: Run both ways**

Run: `npx jest tests/live`
Expected: `skipped` (no variables).

Run (locally, with a real certificate; never in CI; do not paste the output anywhere public):
`SII_LIVE=1 SII_CERT_PFX=<path> SII_CERT_PASSWORD=<password> npx jest tests/live`
Expected: the two token tests PASS. Record "live smoke: seed/token OK on maullin (SOAP and REST), <date>" in the pull request description. If the REST token test fails with `SII_TOKEN_FAILED`, note the code: the certification REST endpoint is known to be less reliable (spec D17) and that result does not block the branch.

- [ ] **Step 3: README**

`README.md`, in the Development section after `npm run scan`:

```bash
SII_LIVE=1 SII_CERT_PFX=… SII_CERT_PASSWORD=… npx jest tests/live   # opt-in smoke against maullin (needs a real certificate)
```

- [ ] **Step 4: Commit**

```bash
git add tests/live/sii.live.test.ts README.md
git commit -m "test: opt-in live smoke of seed, token and status against maullin

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 18: Final verification, bundle size and hand-over

**Files:**
- Modify: `.size-limit.json`, `docs/superpowers/specs/2026-11-01-phase-2-sii-web-services-design.md` (status line)

- [ ] **Step 1: Format, lint and types**

Run: `npm run prettier && npm run lint && npx tsc --noEmit`
Expected: no errors. Review any Prettier rewrites with `git diff` and carry on.

- [ ] **Step 2: Full suite with coverage**

Run: `npm test -- --coverage`
Expected: every test passes and global coverage is 100 % in statements, branches, functions and lines. An uncovered branch gets a test, or is removed when unreachable; the threshold is never lowered. The usual suspects in this phase: the `?? 0`/`?? ''` fallbacks in `status.ts` (feed a JSON without that field), the `catch` of `rutOrNull` in `claims.ts` (an invalid RUT in `rutResponsable`), and the `error` branches of the Node adapters (already exercised by the loader-failure tests).

- [ ] **Step 3: Build, size and smoke**

Run: `npm run build && npm run size && npx jest tests/dist.smoke.test.ts`
Expected: build OK; `size-limit` fails because the bundles grew. Set each `limit` in `.size-limit.json` to the measured size rounded up to the next 2 kB (e.g. measured 25.3 kB → `"26 kB"`), run `npm run size` again (PASS), and post both numbers to [arrowsw/dte-sdk#5](https://github.com/arrowsw/dte-sdk/issues/5):

```bash
gh issue comment 5 --repo arrowsw/dte-sdk --body "Phase 2 (SII web services client) bundle sizes, min + brotli: ESM <measured> kB, CJS <measured> kB (phase 1 was under 16 kB). The Node adapters (https transport, directory capture and archive) load node:* lazily, so the root entry still evaluates in Deno and Bun. Input for the subpath decision in phase 4."
```

- [ ] **Step 4: Data scan and working tree**

Run: `npm run scan && git status --short`
Expected: `Real-data scan ok`; no stray files (`research_notes/`, `information.json` and any capture directory stay untracked: do not add them). Then re-read conventions item 8 and grep the branch for the name of any third-party implementation you consulted; nothing public may carry it.

- [ ] **Step 5: Spec status and final commit**

In `docs/superpowers/specs/2026-11-01-phase-2-sii-web-services-design.md` change `Status: **draft for Hans's review**` to `Status: **approved; phase 2 implemented on the feat/sii-web-services branch**`.

```bash
git add .size-limit.json docs/superpowers/specs/2026-11-01-phase-2-sii-web-services-design.md
git commit -m "chore: size limits for the phase 2 bundles

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 6: Delivery**

The `feat/sii-web-services` branch is ready for review. Whether it is merged into `feat/core-issuance`, opened as a PR against `canary` on its own or stacked on the phase 1 PR is Hans's call. Suggested PR description: the CHANGELOG `### Added`/`### Changed` entries, the links to the spec and this plan, the measured bundle sizes and the live smoke note from Task 17. The PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
