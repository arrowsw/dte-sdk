# Phase 4 — SII portal and folios: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The certificate-authenticated SII portal of dte-sdk: a cookie session reused between calls, company data, certification state, CAF requests, the stamping quota, annulment, re-download of authorized ranges, plus a local folio registry.

**Architecture:** `createPortalClient` returns frozen data and every operation is a free function, as in phase 2. Pure page modules in `src/portal/pages/` turn HTML into data; nothing else looks at markup. `withPortalSession` takes a lock per certificate, loads the cookies from a `TokenCache` and hands a context to the flows. Every request is one `send` inside `withRetry`.

**Tech Stack:** TypeScript 5.9 (strict), Node ≥ 20, Jest 30 + ts-jest, expect-type, ESLint 9 + Prettier, esbuild, size-limit. No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-02-phase-4-portal-folios-design.md` (section 2 holds the decisions, section 3 the rules and the API, section 4 the glossary, section 6 what is and is not measured).

---

## This plan's code has already run

This plan was generated from a throwaway branch where the code was written and made to pass, with one commit per task. On that branch each task was checked in order: its tests alone fail on the previous commit (Task 14 excepted, since it tests what exists), and with the task applied `tsc` compiles and the tests pass. At the tip, on 2026-11-02: Prettier, ESLint, `tsc`, 1 626 tests with coverage at 100 % on the four metrics, build, size (ESM 44.14 kB, CJS 44.32 kB) and scan all pass.

So copy the code as it is. If a test fails, something around it changed since then, such as `canary`: investigate that before changing the code.

**Nothing here has met an authenticated portal session.** The page shapes come from behaviour known to work in the field and the fixtures model them. Section 6 of the spec says what stays open and what has to happen before the first release that ships this phase.

## Conventions that apply to EVERY task

1. **Branch:** work on a branch cut from `canary`. Commands run from the repository root. Run `npm ci` first: `node_modules` of an older worktree may miss `xmllint-wasm`.
2. **Commits:** one per task, with the message given, in English, with a prose body saying why, ending with the `Co-Authored-By` line your session prescribes.
3. **Diffs:** a modified file comes as a unified diff, relative to the repository root. Save it to a temporary file outside the repository and run `git apply <file>`. A new file comes whole.
4. **Bilingual JSDoc is mandatory** on every exported symbol and every type field, one `EN:` line and one `ES:` line, the `ES:` naming the SII tag. The code below already has it.
5. **No classes** (only `DteError`). `readonly` types everywhere. No module-level state. The mutable `state` of `PortalContext` lives for one operation, under the lock.
6. **No PII in error messages:** values go in `details`, never in `message`.
7. **Coverage** reaches 100 % at Task 15; before that it dips, which is why the per-task commands use `--coverage=false`.
8. **No real data:** fixture RUTs come from the allow-list in `scripts/scan-real-data.mjs`, names are invented, and `npm run scan` checks it.
9. **Nothing public names any other project:** not code, comments, tests, fixtures, commits or the pull request. Describe the SII behaviour directly.
10. **Nothing in this plan calls the SII,** and the default test run never does. `tests/live/portal.live.test.ts` only runs with `SII_LIVE=1`.
11. **You own the pull request.** The session that runs this plan is the sole owner of its PR and of every review note or post-merge follow-up on it. Run `gh pr list` before opening anything.

## File map

```
src/sii/capture.ts                           (modify) task 1
src/sii/send.ts                              (modify) task 1
src/sii/operation.ts                         (modify) task 1
src/sii/client.ts                            (modify) task 1
tests/sii/capture.test.ts                    (modify) task 1
tests/sii/send.test.ts                       (modify) task 1
src/errors.ts                                (modify) task 2
src/catalogs/portal.ts                       (create) task 2
tests/portal-catalog.test.ts                 (create) task 2
src/portal/lock.ts                           (create) task 3
src/portal/cookies.ts                        (create) task 3
tests/portal/lock.test.ts                    (create) task 3
tests/portal/cookies.test.ts                 (create) task 3
src/portal/html.ts                           (create) task 4
tests/portal/html.test.ts                    (create) task 4
src/portal/client.ts                         (create) task 5
tests/support/portal.ts                      (create) task 5
tests/portal/client.test.ts                  (create) task 5
src/portal/pages/auth.ts                     (create) task 6
src/portal/session.ts                        (create) task 6
tests/support/portal-pages.ts                (create) task 6
tests/portal/pages-auth.test.ts              (create) task 6
tests/portal/session.test.ts                 (create) task 6
src/portal/pages/stamping.ts                 (create) task 7
src/portal/stamping.ts                       (create) task 7
tests/portal/pages-stamping.test.ts          (create) task 7
tests/portal/stamping.test.ts                (create) task 7
src/portal/pages/company.ts                  (create) task 8
src/portal/company.ts                        (create) task 8
tests/portal/pages-company.test.ts           (create) task 8
tests/portal/company.test.ts                 (create) task 8
src/portal/pages/certification.ts            (create) task 9
src/portal/certification.ts                  (create) task 9
tests/portal/certification.test.ts           (create) task 9
src/portal/pages/annulment.ts                (create) task 10
src/portal/annulment.ts                      (create) task 10
tests/portal/pages-annulment.test.ts         (create) task 10
tests/portal/annulment.test.ts               (create) task 10
src/portal/pages/reobtain.ts                 (create) task 11
src/portal/reobtain.ts                       (create) task 11
tests/portal/reobtain.test.ts                (create) task 11
src/portal/flows.ts                          (create) task 12
tests/portal/flows.test.ts                   (create) task 12
src/folios/ledger.ts                         (create) task 13
src/folios/registry.ts                       (create) task 13
src/folios/node-registry.ts                  (create) task 13
tests/folios/ledger.test.ts                  (create) task 13
tests/folios/registry.test.ts                (create) task 13
tests/sii/node-transport.test.ts             (modify) task 14
tests/live/portal.live.test.ts               (create) task 14
src/index.ts                                 (modify) task 15
tests/public-api.test.ts                     (modify) task 15
tests/dist.smoke.test.ts                     (modify) task 15
tests/types.test.ts                          (modify) task 15
.github/workflows/ci.yml                     (modify) task 15
.size-limit.json                             (modify) task 15
README.md                                    (modify) task 15
llms.txt                                     (modify) task 15
CHANGELOG.md                                 (modify) task 15
docs/decisions/entry-points.md               (create) task 15
```

---

## Task 1: Make the SII request path usable by a second client

A third capture channel, `send` typed by what it uses, a charset that can depend on the response, and session cookies redacted in bodies and URLs. `defaultSleep` and `assertPositive` become importable from the module, not from the root.

**Files:**
- Modify: `src/sii/capture.ts`
- Modify: `src/sii/send.ts`
- Modify: `src/sii/operation.ts`
- Modify: `src/sii/client.ts`
- Modify: `tests/sii/capture.test.ts`
- Modify: `tests/sii/send.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/sii/capture.test.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/sii/capture.test.ts b/tests/sii/capture.test.ts
index a683c4b..47b72e8 100644
--- a/tests/sii/capture.test.ts
+++ b/tests/sii/capture.test.ts
@@ -329,3 +329,12 @@ describe('createMemoryCapture', () => {
     expect(memory.exchanges().map((e) => e.attempt)).toEqual([1, 2])
   })
 })
+
+describe('portal session cookies', () => {
+  test('are redacted when they show up in a body or a URL', () => {
+    const text = 'NETSCAPE_LIVEWIRE.rut=12345678; CSESSIONID="abc-def"; x=1 <a href="?NETSCAPE_LIVEWIRE=zz&y=2">'
+    expect(redactText(text)).toBe(
+      'NETSCAPE_LIVEWIRE.rut=[redacted]; CSESSIONID="[redacted]"; x=1 <a href="?NETSCAPE_LIVEWIRE=[redacted]&y=2">',
+    )
+  })
+})
```

`tests/sii/send.test.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/sii/send.test.ts b/tests/sii/send.test.ts
index 52f735b..9a24db6 100644
--- a/tests/sii/send.test.ts
+++ b/tests/sii/send.test.ts
@@ -295,3 +295,30 @@ describe('send', () => {
     expect(fake.requests[0].headers['content-length']).toBeUndefined()
   })
 })
+
+test('the charset of the capture can depend on the response', async () => {
+  const capture = createMemoryCapture()
+  const fake = createFakeSii([
+    {
+      url: 'https://x.test/a',
+      reply: { body: 'Ñuñoa', encoding: 'utf8', headers: { 'Content-Type': 'text/html; charset=utf-8' } },
+    },
+  ])
+  const sii = createSiiClient({
+    environment: 'certification',
+    certificate,
+    transport: fake.transport,
+    capture: capture.capture,
+  })
+  await send(sii, {
+    operation: 'x',
+    channel: 'soap',
+    method: 'GET',
+    url: 'https://x.test/a',
+    headers: {},
+    timeoutMs: 100,
+    attempt: 1,
+    responseEncoding: (response) => (response.headers['content-type']?.includes('utf-8') ? 'utf8' : 'latin1'),
+  })
+  expect(capture.exchanges()[0].response?.body).toBe('Ñuñoa')
+})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/sii/capture tests/sii/send tests/sii/client tests/sii/operation --coverage=false
```

Expected: FAIL, because the code below does not exist yet.

- [ ] **Step 3: Write the implementation**

`src/sii/capture.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/sii/capture.ts b/src/sii/capture.ts
index 733b60d..0e80c40 100644
--- a/src/sii/capture.ts
+++ b/src/sii/capture.ts
@@ -1,6 +1,12 @@
 import { errorMessage, isDteError } from '../errors'
 import type { TokenChannel } from './token-cache'
 
+/**
+ * EN: Channel of a captured exchange: the two token channels of the web services, or the certificate portal.
+ * ES: Canal de un intercambio capturado: los dos canales con token de los web services, o el portal con certificado.
+ */
+export type HttpChannel = TokenChannel | 'portal'
+
 /**
  * EN: The request half of a captured exchange, bodies already decoded to text.
  * ES: La mitad "petición" de un intercambio capturado, con los cuerpos ya decodificados a texto.
@@ -48,7 +54,7 @@ export type HttpExchange = {
   /** EN: Operation name (`getSeed`, `uploadEnvelope`, `registerClaim`…). ES: Nombre de la operación. */
   readonly operation: string
   /** EN: Channel of the call. ES: Canal de la llamada. */
-  readonly channel: TokenChannel
+  readonly channel: HttpChannel
   /** EN: Attempt number within the retry loop (1-based). ES: Número de intento dentro del ciclo de reintentos (desde 1). */
   readonly attempt: number
   /** EN: The request as sent, redacted. ES: La solicitud enviada, tachada. */
@@ -91,6 +97,7 @@ const SECRET_ELEMENT_WITH_CONTENT = new RegExp(
   'gi',
 )
 const TOKEN_ASSIGNMENT = /(TOKEN=)(["']?)[^;&\s"'<]+/gi
+const SESSION_COOKIE_ASSIGNMENT = /((?:NETSCAPE_LIVEWIRE[\w.]*|CSESSIONID)=)(["']?)[^;&\s"'<]+/gi
 const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g
 
 const utf8Encoder = new TextEncoder()
@@ -110,11 +117,11 @@ const capBytes = (text: string): string => {
 }
 
 /**
- * EN: Replaces tokens, seeds, `RSASK` and PEM private keys inside a text with `[redacted]` (as raw or XML-escaped
+ * EN: Replaces tokens, seeds, portal session cookies, `RSASK` and PEM private keys inside a text with `[redacted]` (as raw or XML-escaped
  * elements, in any case, with or without a namespace prefix, and also when the text was cut before the closing tag)
  * and cuts the result at 512 KiB of UTF-8, suffixed with the number of dropped bytes. RUTs and XML stay: SII support
  * needs them to diagnose an upload.
- * ES: Reemplaza tokens, semillas, `RSASK` y llaves privadas PEM dentro de un texto por `[redacted]` (como elementos
+ * ES: Reemplaza tokens, semillas, cookies de sesión del portal, `RSASK` y llaves privadas PEM dentro de un texto por `[redacted]` (como elementos
  * crudos o escapados en XML, en cualquier caja, con o sin prefijo de espacio de nombres, y también cuando el texto
  * quedó cortado antes de la etiqueta de cierre) y corta el resultado a 512 KiB de UTF-8, con el número de bytes
  * descartados como sufijo. Los RUT y el XML se conservan: el soporte del SII los necesita para diagnosticar un envío.
@@ -128,6 +135,7 @@ export const redactText = (text: string): string =>
           `${open}${name}${attributes}${close}${REDACTED}${open}/${name}${close}`,
       )
       .replace(TOKEN_ASSIGNMENT, `$1$2${REDACTED}`)
+      .replace(SESSION_COOKIE_ASSIGNMENT, `$1$2${REDACTED}`)
       .replace(PRIVATE_KEY_BLOCK, REDACTED),
   )
 
```

`src/sii/send.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/sii/send.ts b/src/sii/send.ts
index fb7d027..b829c84 100644
--- a/src/sii/send.ts
+++ b/src/sii/send.ts
@@ -1,9 +1,14 @@
 import { DteError, errorMessage, isDteError } from '../errors'
-import { exchangeError, redactExchange, redactText, type HttpExchange } from './capture'
+import { exchangeError, redactExchange, redactText, type HttpChannel, type HttpExchange } from './capture'
 import type { SiiClient } from './client'
-import type { TokenChannel } from './token-cache'
 import { decodeBody, type BodyEncoding, type HttpMethod, type HttpRequest, type HttpResponse } from './transport'
 
+/**
+ * EN: What `send` needs from a client; the portal client fits it too.
+ * ES: Lo que `send` necesita de un cliente; el cliente del portal también calza.
+ */
+export type SendClient = Pick<SiiClient, 'transport' | 'capture' | 'logger' | 'now'>
+
 /**
  * EN: One HTTP attempt as an operation describes it to `send`.
  * ES: Un intento HTTP tal como una operación se lo describe a `send`.
@@ -12,7 +17,7 @@ export type SendInput = {
   /** EN: Operation name for capture and logs. ES: Nombre de la operación para captura y logs. */
   readonly operation: string
   /** EN: Channel of the call; picks the default charsets. ES: Canal de la llamada; determina los charsets por defecto. */
-  readonly channel: TokenChannel
+  readonly channel: HttpChannel
   /** EN: HTTP method. ES: Método HTTP. */
   readonly method: HttpMethod
   /** EN: Absolute URL. ES: URL absoluta. */
@@ -29,20 +34,25 @@ export type SendInput = {
   readonly attempt: number
   /** EN: Charset of the request body for the capture; defaults by channel. ES: Charset del cuerpo enviado para la captura; por defecto según el canal. */
   readonly requestEncoding?: BodyEncoding
-  /** EN: Charset of the response body for the capture; defaults by channel. ES: Charset del cuerpo recibido para la captura; por defecto según el canal. */
-  readonly responseEncoding?: BodyEncoding
+  /** EN: Charset of the response body for the capture, fixed or read from the response; defaults by channel. ES: Charset del cuerpo recibido para la captura, fijo o leído de la respuesta; por defecto según el canal. */
+  readonly responseEncoding?: BodyEncoding | ((response: HttpResponse) => BodyEncoding)
 }
 
 type Outcome =
   | { readonly response: HttpResponse; readonly error: null }
   | { readonly response: null; readonly error: unknown }
 
-const defaultEncoding = (channel: TokenChannel): BodyEncoding => (channel === 'rest' ? 'utf8' : 'latin1')
+const defaultEncoding = (channel: HttpChannel): BodyEncoding => (channel === 'rest' ? 'utf8' : 'latin1')
 
 const hasHeader = (headers: Readonly<Record<string, string>>, name: string): boolean =>
   Object.keys(headers).some((key) => key.toLowerCase() === name)
 
 // The SII CGI dislikes chunked uploads: every body travels with an explicit Content-Length.
+const responseEncodingOf = (input: SendInput, response: HttpResponse): BodyEncoding =>
+  typeof input.responseEncoding === 'function'
+    ? input.responseEncoding(response)
+    : (input.responseEncoding ?? defaultEncoding(input.channel))
+
 const withContentLength = (
   headers: Readonly<Record<string, string>>,
   body: Uint8Array | undefined,
@@ -88,7 +98,7 @@ const toExchange = (
       : {
           status: outcome.response.status,
           headers: outcome.response.headers,
-          body: decodeBody(outcome.response.body, input.responseEncoding ?? defaultEncoding(input.channel)),
+          body: decodeBody(outcome.response.body, responseEncodingOf(input, outcome.response)),
         },
   error: outcome.response === null ? exchangeError(outcome.error) : null,
   startedAt: startedAt.toISOString(),
@@ -106,7 +116,7 @@ const toExchange = (
  * `REQUEST_TIMEOUT`, `timeoutMs`) agregadas a sus detalles. Los reintentos y la renovación de token viven por encima
  * de esta función.
  */
-export const send = async (sii: SiiClient, input: SendInput): Promise<HttpResponse> => {
+export const send = async (sii: SendClient, input: SendInput): Promise<HttpResponse> => {
   const request: HttpRequest = {
     method: input.method,
     url: input.url,
```

`src/sii/operation.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/sii/operation.ts b/src/sii/operation.ts
index 4943b4d..7b020aa 100644
--- a/src/sii/operation.ts
+++ b/src/sii/operation.ts
@@ -5,7 +5,7 @@ import { retryFor, timeoutFor, type CallOverrides, type SiiClient } from './clie
 import type { RetryOptions } from './retry'
 import { send } from './send'
 import { buildSoapEnvelope, parseSoapResponse, SOAP_HEADERS, type SoapParam } from './soap'
-import type { TokenChannel } from './token-cache'
+import type { HttpChannel } from './capture'
 import { decodeBody, encodeUtf8, type HttpMethod, type HttpResponse } from './transport'
 
 const EXCERPT_CHARS = 2000
@@ -47,7 +47,7 @@ export const httpError = (
   response: HttpResponse,
   text: string,
   operation: string,
-  channel: TokenChannel,
+  channel: HttpChannel,
   url: string,
 ): DteError =>
   new DteError('SII_HTTP_ERROR', {
```

`src/sii/client.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/sii/client.ts b/src/sii/client.ts
index 4e0d69b..697f361 100644
--- a/src/sii/client.ts
+++ b/src/sii/client.ts
@@ -147,7 +147,11 @@ export const DEFAULT_TIMEOUTS: SiiTimeouts = Object.freeze({ soap: 30000, rest:
 /** EN: Default token lifetime in the cache: 55 minutes. ES: Vigencia por defecto del token en caché: 55 minutos. */
 export const DEFAULT_TOKEN_TTL_MS = 55 * 60 * 1000
 
-const defaultSleep: SleepFn = (ms, signal) =>
+/**
+ * EN: Default wait: a timer that the caller's signal can cancel with `REQUEST_ABORTED`.
+ * ES: Espera por defecto: un temporizador que el signal del llamador puede cancelar con `REQUEST_ABORTED`.
+ */
+export const defaultSleep: SleepFn = (ms, signal) =>
   new Promise((resolve, reject) => {
     if (signal?.aborted) {
       reject(new DteError('REQUEST_ABORTED'))
@@ -164,7 +168,11 @@ const defaultSleep: SleepFn = (ms, signal) =>
     signal?.addEventListener('abort', onAbort, { once: true })
   })
 
-const assertPositive = (value: number | undefined, field: string): void => {
+/**
+ * EN: `INVALID_OPTION` unless the value is absent or a positive finite number.
+ * ES: `INVALID_OPTION` salvo que el valor falte o sea un número finito positivo.
+ */
+export const assertPositive = (value: number | undefined, field: string): void => {
   if (value !== undefined && !(Number.isFinite(value) && value > 0)) throw new DteError('INVALID_OPTION', { field })
 }
 
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/sii/capture tests/sii/send tests/sii/client tests/sii/operation --coverage=false
```

Expected: PASS, 139 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
git add src/sii/capture.ts src/sii/send.ts src/sii/operation.ts src/sii/client.ts tests/sii/capture.test.ts tests/sii/send.test.ts
git commit -m "feat: let the SII request path serve a second client"
```

---

## Task 2: Portal error codes and rejection catalog

The seven `SII_PORTAL_*` codes, `rejection` and `step` as safe detail keys, the portal URLs and the Spanish message of each rejection.

**Files:**
- Modify: `src/errors.ts`
- Create: `src/catalogs/portal.ts`
- Create: `tests/portal-catalog.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/portal-catalog.test.ts`:

```ts
import { cgiUrl, PORTAL_LOGOUT_URLS, PORTAL_REJECTIONS, portalRejectionMessage } from '../src/catalogs/portal'

test('CGI pages live on the host of the environment', () => {
  expect(cgiUrl('certification', 'ad_empresa1')).toBe('https://maullin.sii.cl/cvc_cgi/dte/ad_empresa1')
  expect(cgiUrl('production', 'ad_empresa1')).toBe('https://palena.sii.cl/cvc_cgi/dte/ad_empresa1')
})

test('every rejection tells the operator something in Spanish', () => {
  for (const [rejection, message] of Object.entries(PORTAL_REJECTIONS)) {
    expect(message.length).toBeGreaterThan(20)
    expect(portalRejectionMessage(rejection as keyof typeof PORTAL_REJECTIONS)).toBe(message)
  }
})

test('logout candidates are SII URLs', () => {
  for (const url of PORTAL_LOGOUT_URLS) expect(new URL(url).hostname.endsWith('.sii.cl')).toBe(true)
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal-catalog tests/errors --coverage=false
```

Expected: FAIL, because the code below does not exist yet.

- [ ] **Step 3: Write the implementation**

`src/errors.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/errors.ts b/src/errors.ts
index 3a4f381..9eaa3c4 100644
--- a/src/errors.ts
+++ b/src/errors.ts
@@ -39,6 +39,13 @@ export const DTE_ERROR_CODES = {
   SII_QUERY_ERROR: 'SII_QUERY_ERROR',
   WAIT_TIMEOUT: 'WAIT_TIMEOUT',
   BOOK_TOTAL_MISMATCH: 'BOOK_TOTAL_MISMATCH',
+  SII_PORTAL_LOGIN_FAILED: 'SII_PORTAL_LOGIN_FAILED',
+  SII_PORTAL_CERT_NOT_ENABLED: 'SII_PORTAL_CERT_NOT_ENABLED',
+  SII_PORTAL_SESSION_LIMIT: 'SII_PORTAL_SESSION_LIMIT',
+  SII_PORTAL_SESSION_EXPIRED: 'SII_PORTAL_SESSION_EXPIRED',
+  SII_PORTAL_BLOCKED: 'SII_PORTAL_BLOCKED',
+  SII_PORTAL_REJECTED: 'SII_PORTAL_REJECTED',
+  SII_PORTAL_UNEXPECTED_PAGE: 'SII_PORTAL_UNEXPECTED_PAGE',
 } as const
 
 /**
@@ -90,6 +97,13 @@ const MESSAGES: Readonly<Record<DteErrorCode, string>> = {
   SII_QUERY_ERROR: 'SII status query failed',
   WAIT_TIMEOUT: 'Timed out waiting for the SII status',
   BOOK_TOTAL_MISMATCH: 'Book line total does not match the SII formula',
+  SII_PORTAL_LOGIN_FAILED: 'SII portal login gave no session',
+  SII_PORTAL_CERT_NOT_ENABLED: 'Certificate is not enabled as a login method at the SII',
+  SII_PORTAL_SESSION_LIMIT: 'SII reports too many authenticated sessions for this RUT',
+  SII_PORTAL_SESSION_EXPIRED: 'SII portal keeps asking to authenticate',
+  SII_PORTAL_BLOCKED: 'SII firewall or captcha blocked the request',
+  SII_PORTAL_REJECTED: 'SII portal refused the request',
+  SII_PORTAL_UNEXPECTED_PAGE: 'SII portal answered a page that could not be interpreted',
 }
 
 // Only these detail keys are safe to show: field names, codes and numbers, never user text, URLs or bodies.
@@ -112,6 +126,8 @@ const SAFE_DETAIL_KEYS = [
   'trackId',
   'expected',
   'actual',
+  'rejection',
+  'step',
 ] as const
 
 const formatMessage = (code: DteErrorCode, details: DteErrorDetails): string => {
```

`src/catalogs/portal.ts`:

```ts
import type { Environment } from './codes'
import { SII_HOSTS } from './endpoints'

/**
 * EN: CGI that authenticates with the client certificate; `?{referencia}` says where to go next.
 * ES: CGI que autentica con el certificado cliente; `?{referencia}` indica adónde ir después.
 */
export const CERTIFICATE_LOGIN_URL = 'https://herculesr.sii.cl/cgi_AUT2000/CAutInicio.cgi'

/**
 * EN: Certificate entry page, visited first for the load balancer cookies; it does not ask for the certificate.
 * ES: Página de ingreso con certificado, que se visita primero por las cookies del balanceador; no pide el certificado.
 */
export const CERTIFICATE_ENTRY_URL = 'https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoCertificado.html'

/**
 * EN: Where an explicit login lands.
 * ES: Adónde llega un inicio de sesión explícito.
 */
export const PORTAL_LANDING_URL = 'https://misiir.sii.cl/cgi_misii/siihome.cgi'

/**
 * EN: Logout candidates, tried in order and best-effort: which one really ends a session is not confirmed yet.
 * ES: Candidatas para cerrar sesión, probadas en orden y sin garantía: aún no se confirma cuál la termina de verdad.
 */
export const PORTAL_LOGOUT_URLS: readonly string[] = [
  'https://zeusr.sii.cl/cgi_AUT2000/autTermino.cgi',
  'https://herculesr.sii.cl/cgi_AUT2000/autLogout.cgi',
  'https://www.sii.cl/AUT2000/autLogout.cgi',
]

/**
 * EN: URL of a DTE CGI page on the host of an environment.
 * ES: URL de una página CGI de DTE en el host de un ambiente.
 */
export const cgiUrl = (environment: Environment, page: string): string =>
  `https://${SII_HOSTS[environment]}/cvc_cgi/dte/${page}`

/**
 * EN: Why the SII refused a portal request.
 * ES: Por qué el SII rechazó una solicitud del portal.
 */
export type PortalRejection =
  | 'stampingBlocked'
  | 'inPersonRequired'
  | 'companyNotAuthorized'
  | 'optionNotAuthorized'
  | 'userWithoutPermission'
  | 'personWithPendingIssues'
  | 'activityVerificationPending'
  | 'typeNotEnabled'
  | 'quotaInsufficient'
  | 'quotaExceeded'
  | 'quotaCapReached'
  | 'foliosShort'
  | 'noAnnullableFolios'
  | 'rangeAlreadyAuthorized'
  | 'rangeAnnulled'
  | 'reobtainFormMissing'
  | 'reobtainDownloadMissing'
  | 'reobtainCafMissing'

/**
 * EN: What each rejection means and what to do about it, in Spanish, for the operator.
 * ES: Qué significa cada rechazo y qué hacer, en español, para el operador.
 */
export const PORTAL_REJECTIONS: Readonly<Record<PortalRejection, string>> = {
  stampingBlocked:
    'El SII no autoriza timbraje: hay folios suficientes sin usar. Se levanta emitiendo documentos con esos folios; anular suma en contra del cupo durante 6 meses.',
  inPersonRequired:
    'El SII exige completar la inscripción en persona: el representante legal debe ir a la oficina del SII del domicilio de la empresa.',
  companyNotAuthorized:
    'La empresa no está autorizada como emisor electrónico en este ambiente: falta completar la certificación o la postulación. No se arregla con permisos de usuario.',
  optionNotAuthorized:
    'El SII responde "no está autorizado para ingresar a esta opción" sin indicar la causa. Lo más frecuente es que la empresa aún no esté autorizada en este ambiente; en facturas, guías y notas revisar también la Verificación de Actividades.',
  userWithoutPermission:
    'El RUT del certificado no tiene permisos en la empresa en este ambiente: hay que reasignarle los permisos de firmar, enviar y obtener folios.',
  personWithPendingIssues:
    'La persona autenticada tiene situaciones pendientes con el SII y no puede hacer trámites de factura electrónica. No se resuelve reintentando: debe regularizarlas en el SII.',
  activityVerificationPending:
    'El RUT no registra Verificación de Actividades para este tipo de documento: se realiza en línea en sii.cl. No aplica a boletas.',
  typeNotEnabled:
    'El SII no ofrece este tipo de documento para timbraje con este RUT: falta certificarlo o habilitarlo. Reintentar no lo arregla.',
  quotaInsufficient:
    'El SII autoriza menos folios de los requeridos, porque hay folios timbrados sin usar. Hay que emitir con ellos o anularlos, o pedir en tandas.',
  quotaExceeded: 'La cantidad excede el máximo que el SII autoriza por solicitud para este tipo de documento.',
  quotaCapReached:
    'El SII autorizó menos folios de los requeridos y no hay más cupo en esta pasada: el tope lo fija según el historial de timbraje y emisión.',
  foliosShort: 'El SII otorgó menos folios de los requeridos.',
  noAnnullableFolios:
    'El timbraje está limitado y no quedan folios anulables: hay que emitir con los folios timbrados o esperar a que el SII recalcule el tope.',
  rangeAlreadyAuthorized:
    'El SII ya autorizó ese rango en una solicitud anterior y no devolvió el archivo: se puede reobtener desde el portal.',
  rangeAnnulled: 'El rango está anulado: el SII rechazaría cualquier documento emitido con esos folios.',
  reobtainFormMissing: 'El SII no devolvió el formulario de generación para este rango.',
  reobtainDownloadMissing: 'El SII autorizó la reobtención pero no ofreció la descarga del CAF.',
  reobtainCafMissing: 'El SII no devolvió el XML del CAF al reobtenerlo.',
}

/**
 * EN: The Spanish message of a rejection.
 * ES: El mensaje en español de un rechazo.
 */
export const portalRejectionMessage = (rejection: PortalRejection): string => PORTAL_REJECTIONS[rejection]
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal-catalog tests/errors --coverage=false
```

Expected: PASS, 53 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
git add src/errors.ts src/catalogs/portal.ts tests/portal-catalog.test.ts
git commit -m "feat: portal error codes and rejection catalog"
```

---

## Task 3: Portal lock and cookie jar

The one new port (D30) and the flat jar (D31), which reads the joined `Set-Cookie` header the transports deliver.

**Files:**
- Create: `src/portal/lock.ts`
- Create: `src/portal/cookies.ts`
- Create: `tests/portal/lock.test.ts`
- Create: `tests/portal/cookies.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/portal/lock.test.ts`:

```ts
import { createMemoryPortalLock } from '../../src/portal/lock'

const deferred = (): { readonly promise: Promise<void>; readonly resolve: () => void } => {
  const box: { resolve: () => void } = { resolve: () => undefined }
  const promise = new Promise<void>((resolve) => {
    box.resolve = resolve
  })
  return { promise, resolve: () => box.resolve() }
}

test('one holder at a time per key', async () => {
  const lock = createMemoryPortalLock()
  const gate = deferred()
  const order: string[] = []
  const first = lock('a', async () => {
    order.push('first start')
    await gate.promise
    order.push('first end')
    return 1
  })
  const second = lock('a', async () => {
    order.push('second')
    return 2
  })
  await Promise.resolve()
  expect(order).toEqual(['first start'])
  gate.resolve()
  await expect(Promise.all([first, second])).resolves.toEqual([1, 2])
  expect(order).toEqual(['first start', 'first end', 'second'])
})

test('another key does not wait', async () => {
  const lock = createMemoryPortalLock()
  const gate = deferred()
  const held = lock('a', () => gate.promise)
  await expect(lock('b', async () => 'free')).resolves.toBe('free')
  gate.resolve()
  await held
})

test('a failure hands the lock over and reaches its caller', async () => {
  const lock = createMemoryPortalLock()
  const failing = lock('a', async () => {
    throw new Error('boom')
  })
  const next = lock('a', async () => 'next')
  await expect(failing).rejects.toThrow('boom')
  await expect(next).resolves.toBe('next')
})
```

`tests/portal/cookies.test.ts`:

```ts
import {
  cookieHeader,
  hasSessionCookie,
  mergeSetCookie,
  parseCookies,
  serializeCookies,
  sessionRut,
  splitSetCookie,
} from '../../src/portal/cookies'

test('a comma splits cookies only when a name follows', () => {
  expect(splitSetCookie('a=1; Path=/, b=2; Expires=Thu, 01 Jan 2026 00:00:00 GMT; Secure, c=3')).toEqual([
    'a=1; Path=/',
    'b=2; Expires=Thu, 01 Jan 2026 00:00:00 GMT; Secure',
    'c=3',
  ])
})

test('merging replaces by name, keeps `=` in values and ignores nonsense', () => {
  expect(mergeSetCookie({ a: 'old', keep: 'x' }, 'a=new=er; Path=/, noequals, =novalue')).toEqual({
    a: 'new=er',
    keep: 'x',
  })
  expect(mergeSetCookie({}, 'noequals')).toEqual({})
  const jar = { a: '1' }
  expect(mergeSetCookie(jar, undefined)).toBe(jar)
})

test('the header joins the jar', () => {
  expect(cookieHeader({ a: '1', b: '2' })).toBe('a=1; b=2')
  expect(cookieHeader({})).toBe('')
})

test('a session cookie is what marks a session', () => {
  expect(hasSessionCookie({ 'NETSCAPE_LIVEWIRE.rut': '1' })).toBe(true)
  expect(hasSessionCookie({ TS01: 'x' })).toBe(false)
})

test('the RUT of the session prefers the represented one', () => {
  expect(sessionRut({ 'NETSCAPE_LIVEWIRE.rut': '12345678', 'NETSCAPE_LIVEWIRE.dv': '5' })).toBe('12345678-5')
  expect(
    sessionRut({
      'NETSCAPE_LIVEWIRE.rut': '12345678',
      'NETSCAPE_LIVEWIRE.dv': '5',
      'NETSCAPE_LIVEWIRE.rutm': '76543210',
      'NETSCAPE_LIVEWIRE.dvm': '3',
    }),
  ).toBe('76543210-3')
  expect(sessionRut({ 'NETSCAPE_LIVEWIRE.rut': '12345678', 'NETSCAPE_LIVEWIRE.dv': '9' })).toBeNull()
  expect(sessionRut({})).toBeNull()
})

test('the stored form round trips and unreadable text is an empty jar', () => {
  expect(parseCookies(serializeCookies({ a: '1' }))).toEqual({ a: '1' })
  expect(parseCookies('not json')).toEqual({})
  expect(parseCookies('[1]')).toEqual({})
  expect(parseCookies('null')).toEqual({})
  expect(parseCookies('3')).toEqual({})
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/lock tests/portal/cookies --coverage=false
```

Expected: FAIL, because the code below does not exist yet.

- [ ] **Step 3: Write the implementation**

`src/portal/lock.ts`:

```ts
/**
 * EN: Who may use a portal session now: `run` starts only when the lock is held and the lock is released when it
 * settles, even if it fails. The SII rations sessions per RUT and its balancer cookies break when two requests of one
 * session overlap, so several replicas need a shared implementation.
 * ES: Quién puede usar ahora una sesión del portal: `run` parte solo con el candado tomado y este se libera al
 * terminar, aunque falle. El SII raciona las sesiones por RUT y sus cookies de balanceador se rompen cuando dos
 * peticiones de una misma sesión se cruzan, así que varias réplicas necesitan una implementación compartida.
 */
export type PortalLock = <T>(key: string, run: () => Promise<T>) => Promise<T>

/**
 * EN: Mutex per key inside one process.
 * ES: Exclusión mutua por clave dentro de un proceso.
 */
export const createMemoryPortalLock = (): PortalLock => {
  const queues = new Map<string, Promise<void>>()
  return async <T>(key: string, run: () => Promise<T>): Promise<T> => {
    const turn = (queues.get(key) ?? Promise.resolve()).then(run)
    const settled = turn.then(
      () => undefined,
      () => undefined,
    )
    queues.set(key, settled)
    try {
      return await turn
    } finally {
      if (queues.get(key) === settled) queues.delete(key)
    }
  }
}
```

`src/portal/cookies.ts`:

```ts
import { isSiiRut, type SiiRut } from '../model/rut'

/**
 * EN: The session cookies: one `name → value` map sent to every SII host, as the portal is known to work.
 * ES: Las cookies de la sesión: un mapa `nombre → valor` que se envía a todos los hosts del SII, como se sabe que funciona.
 */
export type CookieJar = Readonly<Record<string, string>>

// A comma only separates cookies when a `name=` follows it: `Expires=Thu, 01 Jan…` stays whole.
const SET_COOKIE_SEPARATOR = /,\s*(?=[^;,=\s]+=)/

/**
 * EN: Splits the joined `Set-Cookie` header the transports deliver into one entry per cookie.
 * ES: Separa la cabecera `Set-Cookie` unida que entregan los transportes en una entrada por cookie.
 */
export const splitSetCookie = (header: string): readonly string[] => header.split(SET_COOKIE_SEPARATOR)

/**
 * EN: The jar after a response: each cookie of the header replaces the one with its name. A value may hold `=`.
 * ES: La bolsa tras una respuesta: cada cookie de la cabecera reemplaza a la de su nombre. Un valor puede traer `=`.
 */
export const mergeSetCookie = (jar: CookieJar, header: string | undefined): CookieJar => {
  if (header === undefined) return jar
  const entries = splitSetCookie(header).flatMap((line) => {
    const pair = line.split(';')[0]
    const equals = pair.indexOf('=')
    return equals > 0 ? [[pair.slice(0, equals).trim(), pair.slice(equals + 1).trim()] as const] : []
  })
  return { ...jar, ...Object.fromEntries(entries) }
}

/**
 * EN: The `Cookie` header of a jar; empty when the jar is.
 * ES: La cabecera `Cookie` de una bolsa; vacía si la bolsa lo está.
 */
export const cookieHeader = (jar: CookieJar): string =>
  Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')

/**
 * EN: True when the jar holds an authenticated session.
 * ES: True cuando la bolsa contiene una sesión autenticada.
 */
export const hasSessionCookie = (jar: CookieJar): boolean =>
  Object.keys(jar).some((name) => name.startsWith('NETSCAPE_LIVEWIRE'))

/**
 * EN: The RUT the session belongs to, from `NETSCAPE_LIVEWIRE.rutm`/`.dvm` or `.rut`/`.dv`; null when absent or invalid.
 * ES: El RUT al que pertenece la sesión, desde `NETSCAPE_LIVEWIRE.rutm`/`.dvm` o `.rut`/`.dv`; null si falta o es inválido.
 */
export const sessionRut = (jar: CookieJar): SiiRut | null => {
  const body = jar['NETSCAPE_LIVEWIRE.rutm'] ?? jar['NETSCAPE_LIVEWIRE.rut']
  const verifier = jar['NETSCAPE_LIVEWIRE.dvm'] ?? jar['NETSCAPE_LIVEWIRE.dv']
  const rut = `${body}-${String(verifier).toUpperCase()}`
  return isSiiRut(rut) ? rut : null
}

/**
 * EN: The jar as stored in the session cache.
 * ES: La bolsa tal como se guarda en la caché de sesiones.
 */
export const serializeCookies = (jar: CookieJar): string => JSON.stringify(jar)

/**
 * EN: A jar read back from the session cache; anything unreadable is an empty jar, which simply logs in again.
 * ES: Una bolsa leída de la caché de sesiones; lo ilegible es una bolsa vacía, que simplemente vuelve a iniciar sesión.
 */
export const parseCookies = (text: string): CookieJar => {
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as CookieJar) : {}
  } catch {
    return {}
  }
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/lock tests/portal/cookies --coverage=false
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
git add src/portal/lock.ts src/portal/cookies.ts tests/portal/lock.test.ts tests/portal/cookies.test.ts
git commit -m "feat: portal lock and cookie jar"
```

---

## Task 4: HTML helpers

Entities, visible text, attributes with or without quotes, inputs, forms, selects and `alert()` messages. No other portal module looks at markup except the page modules (D32).

**Files:**
- Create: `src/portal/html.ts`
- Create: `tests/portal/html.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/portal/html.test.ts`:

```ts
import {
  alertMessages,
  attribute,
  decodeEntities,
  formAction,
  formBlocks,
  formWithAction,
  inputTags,
  inputValues,
  namedForm,
  selectOptions,
  stripTags,
  visibleText,
} from '../../src/portal/html'

test('entities: named, decimal, hex and unknown', () => {
  expect(decodeEntities('Autenticaci&oacute;n &amp; &#241;&#xF1; &Ntilde; &bogus;!')).toBe('Autenticación & ññ Ñ  !')
})

test('tags become spaces and whitespace collapses', () => {
  expect(stripTags('<td>&nbsp;Hola <b>Mundo</b>\n</td>')).toBe('Hola Mundo')
})

test('visible text drops scripts and styles and cuts', () => {
  expect(visibleText('<style>x{}</style><script>alert("no")</script><p>sí</p>')).toBe('sí')
  expect(visibleText('<p>abcdef</p>', 3)).toBe('abc')
  expect(visibleText('x'.repeat(500))).toHaveLength(400)
})

test('attributes with double, single or no quotes; a handler is not an attribute', () => {
  expect(attribute('<input name="a">', 'name')).toBe('a')
  expect(attribute("<input name='a'>", 'name')).toBe('a')
  expect(attribute('<input name = a>', 'name')).toBe('a')
  expect(attribute('<input onblur="this.value=this.value.toUpperCase()" name=x>', 'value')).toBeNull()
})

test('inputs: unnamed ones are skipped, a repeated name keeps the last', () => {
  const html = '<input type=submit><INPUT name=a value = 1><input name="b"><input name=a value="2" onClick="go(1)">'
  expect(inputTags(html)).toEqual([
    { name: 'a', value: '1', onClick: null },
    { name: 'b', value: '', onClick: null },
    { name: 'a', value: '2', onClick: 'go(1)' },
  ])
  expect(inputValues(html)).toEqual({ a: '2', b: '' })
  expect(inputValues('')).toEqual({})
})

test('forms by position, name and action', () => {
  const html = '<form name=one action="/a"><input name=x></form><FORM name="frm2" action=/b></FORM><form></form>'
  expect(formBlocks(html)).toHaveLength(3)
  expect(formBlocks('')).toEqual([])
  expect(formAction(html)).toBe('/a')
  expect(formAction('<form></form>')).toBeNull()
  expect(formAction('nothing')).toBeNull()
  expect(namedForm(html, 'one')).toContain('name=x')
  expect(namedForm(html, /^frm\d$/)).toContain('frm2')
  expect(namedForm(html, 'absent')).toBeNull()
  expect(formWithAction(html, '/b')).toContain('frm2')
  expect(formWithAction(html, '/c')).toBeNull()
})

test('select options, or null without the select', () => {
  const html = `<SELECT name = COD onChange="x()"><option value="33">FACTURA</option><option value=39 selected>BOLETA<option>nada</select>`
  expect(selectOptions(html, 'COD')).toEqual([
    { value: '33', label: 'FACTURA' },
    { value: '39', label: 'BOLETA' },
  ])
  expect(selectOptions(html, 'OTHER')).toBeNull()
})

test('alerts: unescaped, without markup, ignoring the ones commented out', () => {
  const html = `<script>
alert('It\\'s <b>first</b>\\n&aacute;');
// alert("template branch");
var url = 'https://x'; alert("second");
alert('');
</script>`
  expect(alertMessages(html)).toEqual(["It's first á", 'second'])
  expect(alertMessages('nothing')).toEqual([])
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/html --coverage=false
```

Expected: FAIL, because the code below does not exist yet.

- [ ] **Step 3: Write the implementation**

`src/portal/html.ts`:

```ts
// The SII portal serves HTML 4.01: rows without `</tr>`, attributes with or without quotes, entities for accents. These
// helpers read exactly what the page modules need; nothing outside `src/portal/` looks at markup.

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  ntilde: 'ñ',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  Ntilde: 'Ñ',
}

/**
 * EN: Decodes named and numeric entities; one it does not know becomes a space.
 * ES: Decodifica entidades con nombre y numéricas; una desconocida se vuelve un espacio.
 */
export const decodeEntities = (text: string): string =>
  text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (_whole, entity: string) => {
    if (entity.startsWith('#')) {
      const hex = entity[1].toLowerCase() === 'x'
      return String.fromCodePoint(Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10))
    }
    return NAMED_ENTITIES[entity] ?? ' '
  })

/**
 * EN: Text of a fragment: tags become spaces, entities are decoded, whitespace collapses.
 * ES: Texto de un fragmento: las etiquetas se vuelven espacios, se decodifican las entidades y se colapsa el espacio.
 */
export const stripTags = (html: string): string =>
  decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()

/**
 * EN: Readable text of a page, without scripts or styles, cut at `max` characters (400 by default). Detection runs on
 * this, because the SII writes accents as entities.
 * ES: Texto legible de una página, sin scripts ni estilos, cortado en `max` caracteres (400 por defecto). La detección
 * corre sobre esto, porque el SII escribe los acentos como entidades.
 */
export const visibleText = (html: string, max = 400): string =>
  stripTags(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')).slice(0, max)

/**
 * EN: Value of an attribute inside a tag, with double, single or no quotes. It needs a separator before the name, so
 * `this.value=` inside a handler is not taken for it.
 * ES: Valor de un atributo dentro de una etiqueta, con comillas dobles, simples o sin ellas. Exige un separador antes del
 * nombre, para que `this.value=` dentro de un handler no se confunda con él.
 */
export const attribute = (tag: string, name: string): string | null => {
  const match =
    new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag) ??
    new RegExp(`\\s${name}\\s*=\\s*'([^']*)'`, 'i').exec(tag) ??
    new RegExp(`\\s${name}\\s*=\\s*([^\\s>"']+)`, 'i').exec(tag)
  return match === null ? null : match[1]
}

/**
 * EN: One `<input>` as the flows read it.
 * ES: Un `<input>` tal como lo leen los flujos.
 */
export type InputTag = {
  /** EN: Field name. ES: Nombre del campo. */
  readonly name: string
  /** EN: Value, empty when absent. ES: Valor, vacío si no viene. */
  readonly value: string
  /** EN: `onClick` handler, when there is one. ES: Handler `onClick`, si lo hay. */
  readonly onClick: string | null
}

/**
 * EN: Every named `<input>` of a fragment, in order.
 * ES: Todos los `<input>` con nombre de un fragmento, en orden.
 */
export const inputTags = (html: string): readonly InputTag[] =>
  (html.match(/<input\b[^>]*>/gi) ?? []).flatMap((tag) => {
    const name = attribute(tag, 'name')
    return name === null ? [] : [{ name, value: attribute(tag, 'value') ?? '', onClick: attribute(tag, 'onClick') }]
  })

/**
 * EN: The fields of a fragment as a map; a repeated name keeps the last value, as a form post would.
 * ES: Los campos de un fragmento como mapa; un nombre repetido conserva el último valor, como en un envío de formulario.
 */
export const inputValues = (html: string): Readonly<Record<string, string>> =>
  Object.fromEntries(inputTags(html).map((tag) => [tag.name, tag.value]))

/**
 * EN: Every `<form>…</form>` block of a page, in order.
 * ES: Todos los bloques `<form>…</form>` de una página, en orden.
 */
export const formBlocks = (html: string): readonly string[] => html.match(/<form\b[^>]*>[\s\S]*?<\/form>/gi) ?? []

/**
 * EN: The `action` of a form tag.
 * ES: El `action` de una etiqueta de formulario.
 */
const actionOfTag = (tag: string): string | null => attribute(tag, 'action')

/**
 * EN: The `action` of the first form of a page.
 * ES: El `action` del primer formulario de una página.
 */
export const formAction = (html: string): string | null => {
  const tag = /<form\b[^>]*>/i.exec(html)
  return tag === null ? null : actionOfTag(tag[0])
}

/**
 * EN: The block of the form with this `name`.
 * ES: El bloque del formulario con este `name`.
 */
export const namedForm = (html: string, name: string | RegExp): string | null =>
  formBlocks(html).find((block) => {
    const value = attribute(/<form\b[^>]*>/i.exec(block)![0], 'name')
    return value !== null && (typeof name === 'string' ? value === name : name.test(value))
  }) ?? null

/**
 * EN: The block of the first form whose `action` contains this text.
 * ES: El bloque del primer formulario cuyo `action` contiene este texto.
 */
export const formWithAction = (html: string, action: string): string | null =>
  formBlocks(html).find((block) => actionOfTag(/<form\b[^>]*>/i.exec(block)![0])?.includes(action)) ?? null

/**
 * EN: The options of a `<select>`, or null when the page has no such select.
 * ES: Las opciones de un `<select>`, o null si la página no tiene ese select.
 */
export const selectOptions = (
  html: string,
  name: string,
): readonly { readonly value: string; readonly label: string }[] | null => {
  const block = new RegExp(`<select\\b[^>]*name\\s*=\\s*["']?${name}\\b[^>]*>([\\s\\S]*?)</select>`, 'i').exec(html)
  if (block === null) return null
  return [...block[1].matchAll(/<option\b([^>]*)>([^<]*)/gi)].flatMap((match) => {
    const value = attribute(`<option ${match[1]}>`, 'value')
    return value === null ? [] : [{ value, label: stripTags(match[2]) }]
  })
}

/**
 * EN: The messages of `alert(...)` calls, which is how the old portal reports errors, whatever its title says. An alert
 * commented out on its own line belongs to the template and is ignored.
 * ES: Los mensajes de las llamadas a `alert(...)`, que es como el portal antiguo informa errores, diga lo que diga su
 * título. Un alert comentado en su propia línea es parte de la plantilla y se ignora.
 */
export const alertMessages = (html: string): readonly string[] =>
  [...html.matchAll(/alert\s*\(\s*(['"])([\s\S]*?)\1\s*\)/g)].flatMap((match) => {
    const lineStart = html.lastIndexOf('\n', match.index) + 1
    if (
      html
        .slice(lineStart, match.index)
        .replace(/[a-z]+:\/\//gi, '')
        .includes('//')
    )
      return []
    const text = stripTags(match[2].replace(/\\(['"\\])/g, '$1').replace(/\\[rnt]/g, ' '))
    return text === '' ? [] : [text]
  })
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/html --coverage=false
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
git add src/portal/html.ts tests/portal/html.test.ts
git commit -m "feat: helpers to read portal HTML"
```

---

## Task 5: Portal client

`createPortalClient` as frozen data (D28), its default transport (D29) and its retry rule (D34). The test support builds a client over the fake SII.

**Files:**
- Create: `src/portal/client.ts`
- Create: `tests/support/portal.ts`
- Create: `tests/portal/client.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/support/portal.ts`:

```ts
import { loadCertificateFromPem } from '../../src/certificate/pem'
import { createPortalClient, type PortalClient, type PortalClientOptions } from '../../src/portal/client'
import { certificateFingerprint } from '../../src/sii/token-cache'
import { createFakeSii, type FakeRoute, type FakeSii } from './fake-sii'
import { fixtureText, FIXED_NOW, ISSUER_RUT } from './fixtures'

export const certificate = loadCertificateFromPem(
  { privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') },
  { now: FIXED_NOW },
)

export const MAULLIN = 'https://maullin.sii.cl/cvc_cgi/dte'
export const PALENA = 'https://palena.sii.cl/cvc_cgi/dte'
export const HERCULES = 'https://herculesr.sii.cl/cgi_AUT2000/CAutInicio.cgi'
export const SESSION_KEY = `portal:${certificateFingerprint(certificate)}`
export const SESSION_COOKIES = {
  'NETSCAPE_LIVEWIRE.rut': '12345678',
  'NETSCAPE_LIVEWIRE.dv': '5',
  TS01ab: 'cookie-value',
}

export type PortalHarness = {
  readonly portal: PortalClient
  readonly fake: FakeSii
  readonly sleeps: number[]
  /** The forms posted to a page, named by the last segment of its path, with or without `.cgi`. */
  readonly posted: (page: string) => readonly Readonly<Record<string, string>>[]
  readonly urls: () => readonly string[]
}

const parseForm = (text: string): Readonly<Record<string, string>> =>
  Object.fromEntries(
    text
      .split('&')
      .filter((pair) => pair !== '')
      .map((pair) => {
        const [name, value = ''] = pair.split('=')
        return [decodeURIComponent(name), decodeURIComponent(value)]
      }),
  )

/** A client over the fake SII with instant waits and no retries unless a test asks for them. */
export const portalWith = (routes: readonly FakeRoute[], options: Partial<PortalClientOptions> = {}): PortalHarness => {
  const fake = createFakeSii(routes)
  const sleeps: number[] = []
  const portal = createPortalClient({
    environment: 'certification',
    certificate,
    companyRut: ISSUER_RUT,
    transport: fake.transport,
    now: () => FIXED_NOW,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    retry: false,
    ...options,
  })
  return {
    portal,
    fake,
    sleeps,
    posted: (page) =>
      fake.requests
        .filter(
          (request) =>
            request.method === 'POST' &&
            new URL(request.url).pathname
              .split('/')
              .pop()
              ?.replace(/\.cgi$/, '') === page,
        )
        .map((request) => parseForm(request.text)),
    urls: () => fake.requests.map((request) => request.url),
  }
}

/** Puts a live session in the client's cache, so the flow under test needs no login. */
export const seedSession = async (
  portal: PortalClient,
  cookies: Readonly<Record<string, string>> = SESSION_COOKIES,
): Promise<void> => {
  await portal.sessionCache.set(SESSION_KEY, {
    token: JSON.stringify(cookies),
    expiresAt: FIXED_NOW.getTime() + 60000,
  })
}

/** A client whose session is already in the cache. */
export const signedIn = async (
  routes: readonly FakeRoute[],
  options: Partial<PortalClientOptions> = {},
): Promise<PortalHarness> => {
  const harness = portalWith(routes, options)
  await seedSession(harness.portal)
  return harness
}

/** Awaits a rejection and returns the error. */
export const failure = async (
  promise: Promise<unknown>,
): Promise<{ code: string; details: Readonly<Record<string, unknown>> }> => {
  try {
    await promise
  } catch (error) {
    return error as { code: string; details: Readonly<Record<string, unknown>> }
  }
  throw new Error('expected a rejection')
}
```

`tests/portal/client.test.ts`:

```ts
import { DteError } from '../../src/errors'
import {
  createPortalClient,
  DEFAULT_PORTAL_RETRY_POLICY,
  isRetryablePortalError,
  resolvePortalCompany,
} from '../../src/portal/client'
import { certificate, failure } from '../support/portal'

const options = { environment: 'certification' as const, certificate }

test('defaults', () => {
  const portal = createPortalClient(options)
  expect(Object.isFrozen(portal)).toBe(true)
  expect(portal.companyRut).toBeNull()
  expect(portal.sessionTtlMs).toBe(90 * 60 * 1000)
  expect(portal.timeoutMs).toBe(30000)
  expect(portal.closePreviousSessions).toBe(true)
  expect(portal.capture).toBeNull()
  expect(portal.retry).toEqual(DEFAULT_PORTAL_RETRY_POLICY)
  expect(portal.now()).toBeInstanceOf(Date)
  expect(typeof portal.transport).toBe('function')
})

test('overrides', () => {
  const portal = createPortalClient({
    ...options,
    companyRut: '76.543.210-3',
    retry: false,
    timeoutMs: 5,
    sessionTtlMs: 7,
    closePreviousSessions: false,
  })
  expect(portal.companyRut).toBe('76543210-3')
  expect(portal.retry).toBe(false)
  expect(portal.timeoutMs).toBe(5)
  expect(portal.sessionTtlMs).toBe(7)
  expect(portal.closePreviousSessions).toBe(false)
  expect(createPortalClient({ ...options, retry: { maxAttempts: 2 } }).retry).toMatchObject({
    maxAttempts: 2,
    retryOn: isRetryablePortalError,
  })
})

test('validation', () => {
  expect(() => createPortalClient({ ...options, environment: 'nope' as never })).toThrow(
    expect.objectContaining({ code: 'INVALID_OPTION', details: { field: 'environment' } }),
  )
  expect(() => createPortalClient({ environment: 'production', certificate: undefined as never })).toThrow(
    expect.objectContaining({ code: 'MISSING_FIELD', details: { field: 'certificate' } }),
  )
  expect(() => createPortalClient({ ...options, timeoutMs: 0 })).toThrow(
    expect.objectContaining({ details: { field: 'timeoutMs' } }),
  )
  expect(() => createPortalClient({ ...options, sessionTtlMs: -1 })).toThrow(
    expect.objectContaining({ details: { field: 'sessionTtlMs' } }),
  )
  expect(() => createPortalClient({ ...options, companyRut: 'nope' })).toThrow(
    expect.objectContaining({ code: 'INVALID_RUT' }),
  )
})

test('the company comes from the call, else the client', () => {
  const portal = createPortalClient({ ...options, companyRut: '76543210-3' })
  expect(resolvePortalCompany(portal, '10000004-0')).toBe('10000004-0')
  expect(resolvePortalCompany(portal)).toBe('76543210-3')
  expect(() => resolvePortalCompany(createPortalClient(options))).toThrow(
    expect.objectContaining({ code: 'MISSING_FIELD', details: { field: 'companyRut' } }),
  )
})

test.each([
  ['TRANSPORT_FAILED', {}, true],
  ['REQUEST_TIMEOUT', {}, true],
  ['SII_HTTP_ERROR', { httpStatus: 502 }, true],
  ['SII_HTTP_ERROR', { httpStatus: 503 }, true],
  ['SII_HTTP_ERROR', { httpStatus: 504 }, true],
  ['SII_HTTP_ERROR', { httpStatus: 500 }, false],
  ['TRANSPORT_TLS', { reason: 'EPROTO' }, true],
  ['TRANSPORT_TLS', { reason: 'ERR_SSL_PACKET_LENGTH_TOO_LONG' }, true],
  ['TRANSPORT_TLS', { reason: 'CERT_HAS_EXPIRED' }, false],
  ['SII_PORTAL_SESSION_LIMIT', {}, false],
  ['SII_PORTAL_BLOCKED', {}, false],
  ['SII_PORTAL_REJECTED', {}, false],
] as const)('retry rule: %s %j', (code, details, expected) => {
  expect(isRetryablePortalError(new DteError(code, details))).toBe(expected)
})

test('anything else is not retried', () => {
  expect(isRetryablePortalError(new Error('x'))).toBe(false)
})

test('the failure helper needs a rejection', async () => {
  await expect(failure(Promise.resolve())).rejects.toThrow('expected a rejection')
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/client --coverage=false
```

Expected: FAIL, because the code below does not exist yet.

- [ ] **Step 3: Write the implementation**

`src/portal/client.ts`:

```ts
import { isEnvironment, type Environment } from '../catalogs/codes'
import type { Certificate } from '../certificate/certificate'
import { DteError, isDteError } from '../errors'
import { toSiiRut, type SiiRut } from '../model/rut'
import type { HttpCapture } from '../sii/capture'
import { assertPositive, defaultSleep, type SleepFn } from '../sii/client'
import { silentLogger, type Logger } from '../sii/logger'
import { createNodeHttpsTransport } from '../sii/node-transport'
import { mergeRetryPolicy, type RetryPolicy } from '../sii/retry'
import { createMemoryTokenCache, type TokenCache } from '../sii/token-cache'
import type { HttpTransport } from '../sii/transport'
import { createMemoryPortalLock, type PortalLock } from './lock'

const RETRYABLE_HTTP_STATUS: ReadonlySet<number> = new Set([502, 503, 504])
const RETRYABLE_TLS_REASONS: ReadonlySet<unknown> = new Set(['EPROTO', 'ERR_SSL_PACKET_LENGTH_TOO_LONG'])

/**
 * EN: True for what is worth repeating at the portal: transport failures, timeouts, HTTP 502/503/504, and the TLS
 * failures the SII produces intermittently with a client certificate (`EPROTO … rsa_pss`), which are not a sign of a bad
 * certificate. A session limit, a block or a rejection is never repeated: that makes them worse.
 * ES: True para lo que conviene repetir en el portal: fallas de transporte, timeouts, HTTP 502/503/504, y las fallas TLS
 * que el SII produce de forma intermitente con certificado cliente (`EPROTO … rsa_pss`), que no indican un certificado
 * malo. Un límite de sesiones, un bloqueo o un rechazo nunca se repite: eso los empeora.
 */
export const isRetryablePortalError = (error: unknown): boolean => {
  if (!isDteError(error)) return false
  if (error.code === 'TRANSPORT_FAILED' || error.code === 'REQUEST_TIMEOUT') return true
  if (error.code === 'SII_HTTP_ERROR') return RETRYABLE_HTTP_STATUS.has(Number(error.details.httpStatus))
  return error.code === 'TRANSPORT_TLS' && RETRYABLE_TLS_REASONS.has(error.details.reason)
}

/**
 * EN: Retry policy of the portal: 4 attempts at 2, 4 and 8 s, no jitter, repeating what `isRetryablePortalError` accepts.
 * ES: Política de reintentos del portal: 4 intentos a los 2, 4 y 8 s, sin jitter, repitiendo lo que acepta `isRetryablePortalError`.
 */
export const DEFAULT_PORTAL_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  initialDelayMs: 2000,
  maxDelayMs: 8000,
  backoffMultiplier: 2,
  jitterRatio: 0,
  retryOn: isRetryablePortalError,
}

/**
 * EN: Session lifetime in the cache, refreshed on each use; the SII tolerates about 2 hours of inactivity.
 * ES: Vigencia de la sesión en la caché, renovada en cada uso; el SII tolera cerca de 2 horas de inactividad.
 */
export const DEFAULT_PORTAL_SESSION_TTL_MS = 90 * 60 * 1000

/**
 * EN: Timeout per portal request, ms.
 * ES: Timeout por petición al portal, en ms.
 */
export const DEFAULT_PORTAL_TIMEOUT_MS = 30000

/**
 * EN: Options of `createPortalClient`.
 * ES: Opciones de `createPortalClient`.
 */
export type PortalClientOptions = {
  /** EN: Target environment: selects maullin or palena for the CGI pages. ES: Ambiente: elige maullin o palena para las páginas CGI. */
  readonly environment: Environment
  /** EN: Certificate presented at login; its holder is the portal user. ES: Certificado que se presenta al iniciar sesión; su titular es el usuario del portal. */
  readonly certificate: Certificate
  /** EN: Company RUT used by every operation unless overridden per call. ES: `RUT_EMP` + `DV_EMP` — RUT de la empresa, salvo que la llamada indique otro. */
  readonly companyRut?: string
  /** EN: HTTP transport; Node https with the client certificate and a TLS 1.2 cap by default. ES: Transporte HTTP; por defecto https de Node con el certificado cliente y tope TLS 1.2. */
  readonly transport?: HttpTransport
  /** EN: Where the session lives; in memory by default. ES: Dónde vive la sesión; en memoria por defecto. */
  readonly sessionCache?: TokenCache
  /** EN: Session lifetime in the cache; 90 min by default, refreshed on each use. ES: Vigencia de la sesión en la caché; 90 min por defecto, renovada en cada uso. */
  readonly sessionTtlMs?: number
  /** EN: Who may use the session now; a mutex in the process by default. ES: Quién puede usar la sesión ahora; por defecto una exclusión mutua en el proceso. */
  readonly lock?: PortalLock
  /** EN: Retry policy overrides, or `false` to disable retries. ES: Ajustes de la política de reintentos, o `false` para desactivarlos. */
  readonly retry?: Partial<RetryPolicy> | false
  /** EN: Timeout per request, ms; 30 000 by default. ES: Timeout por petición, en ms; 30 000 por defecto. */
  readonly timeoutMs?: number
  /** EN: Close earlier sessions when the SII reports the limit and offers it; true by default. ES: Cerrar sesiones anteriores cuando el SII informa el límite y lo ofrece; true por defecto. */
  readonly closePreviousSessions?: boolean
  /** EN: Logger; silent by default. ES: Logger; silencioso por defecto. */
  readonly logger?: Logger
  /** EN: HTTP capture port; off by default. ES: Puerto de captura HTTP; apagado por defecto. */
  readonly capture?: HttpCapture
  /** EN: Clock. ES: Reloj inyectable. */
  readonly now?: () => Date
  /** EN: Wait between retries and between steps. ES: Espera entre reintentos y entre pasos. */
  readonly sleep?: SleepFn
}

/**
 * EN: The portal client: plain frozen data, every field resolved. Pass it to the portal functions.
 * ES: El cliente del portal: datos planos congelados, con todos los campos resueltos. Se pasa a las funciones del portal.
 */
export type PortalClient = {
  /** EN: Target environment. ES: Ambiente. */
  readonly environment: Environment
  /** EN: Certificate presented at login. ES: Certificado que se presenta al iniciar sesión. */
  readonly certificate: Certificate
  /** EN: Default company RUT, or null. ES: `RUT_EMP` + `DV_EMP` — RUT de empresa por defecto, o null. */
  readonly companyRut: SiiRut | null
  /** EN: HTTP transport. ES: Transporte HTTP. */
  readonly transport: HttpTransport
  /** EN: Where the session lives. ES: Dónde vive la sesión. */
  readonly sessionCache: TokenCache
  /** EN: Session lifetime in the cache, ms. ES: Vigencia de la sesión en la caché, en ms. */
  readonly sessionTtlMs: number
  /** EN: Who may use the session now. ES: Quién puede usar la sesión ahora. */
  readonly lock: PortalLock
  /** EN: Resolved retry policy. ES: Política de reintentos resuelta. */
  readonly retry: RetryPolicy | false
  /** EN: Timeout per request, ms. ES: Timeout por petición, en ms. */
  readonly timeoutMs: number
  /** EN: Close earlier sessions when the SII offers it. ES: Cerrar sesiones anteriores cuando el SII lo ofrece. */
  readonly closePreviousSessions: boolean
  /** EN: Logger. ES: Logger. */
  readonly logger: Logger
  /** EN: HTTP capture port, or null. ES: Puerto de captura HTTP, o null. */
  readonly capture: HttpCapture | null
  /** EN: Clock. ES: Reloj. */
  readonly now: () => Date
  /** EN: Wait function. ES: Función de espera. */
  readonly sleep: SleepFn
}

/**
 * EN: Validates and completes the options into a frozen `PortalClient`. The default transport presents the certificate
 * through Node `https` (loaded on first use, so importing never touches `node:`), verifies the server, and stays on
 * TLS 1.2, the configuration proven for authenticated sessions. `fetch` cannot present a client certificate.
 * ES: Valida y completa las opciones en un `PortalClient` congelado. El transporte por defecto presenta el certificado por
 * `https` de Node (cargado en el primer uso, así que importar nunca toca `node:`), verifica el servidor y se queda en
 * TLS 1.2, la configuración probada para sesiones autenticadas. `fetch` no puede presentar un certificado cliente.
 * @param options EN: client options. ES: opciones del cliente.
 * @returns EN: the frozen client. ES: el cliente congelado.
 * @throws {DteError} EN: `INVALID_OPTION { field }`, `MISSING_FIELD { field }`, `INVALID_RUT { field }`. ES: los mismos códigos.
 */
export const createPortalClient = (options: PortalClientOptions): PortalClient => {
  if (!isEnvironment(options.environment)) throw new DteError('INVALID_OPTION', { field: 'environment' })
  if (!options.certificate) throw new DteError('MISSING_FIELD', { field: 'certificate' })
  assertPositive(options.sessionTtlMs, 'sessionTtlMs')
  assertPositive(options.timeoutMs, 'timeoutMs')
  const retry = mergeRetryPolicy(DEFAULT_PORTAL_RETRY_POLICY, options.retry)
  return Object.freeze({
    environment: options.environment,
    certificate: options.certificate,
    companyRut: options.companyRut === undefined ? null : toSiiRut(options.companyRut, 'companyRut'),
    transport:
      options.transport ??
      createNodeHttpsTransport({ tls: { clientCertificate: options.certificate, maxVersion: 'TLSv1.2' } }),
    sessionCache: options.sessionCache ?? createMemoryTokenCache(),
    sessionTtlMs: options.sessionTtlMs ?? DEFAULT_PORTAL_SESSION_TTL_MS,
    lock: options.lock ?? createMemoryPortalLock(),
    retry: retry === false ? false : Object.freeze({ ...retry }),
    timeoutMs: options.timeoutMs ?? DEFAULT_PORTAL_TIMEOUT_MS,
    closePreviousSessions: options.closePreviousSessions ?? true,
    logger: options.logger ?? silentLogger,
    capture: options.capture ?? null,
    now: options.now ?? (() => new Date()),
    sleep: options.sleep ?? defaultSleep,
  })
}

/**
 * EN: Company RUT for a call: the call's value, else the client's, else `MISSING_FIELD`.
 * ES: RUT de empresa de una llamada: el de la llamada, si no el del cliente, si no `MISSING_FIELD`.
 */
export const resolvePortalCompany = (portal: PortalClient, companyRut?: string): SiiRut => {
  if (companyRut !== undefined) return toSiiRut(companyRut, 'companyRut')
  if (portal.companyRut === null) throw new DteError('MISSING_FIELD', { field: 'companyRut' })
  return portal.companyRut
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/client --coverage=false
```

Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
git add src/portal/client.ts tests/support/portal.ts tests/portal/client.test.ts
git commit -m "feat: portal client and retry rule"
```

---

## Task 6: Session: login, on-demand login, session limit, logout

The heart of the phase: one request inside the retry loop, redirects, login, `ensurePage`, the session limit, the representation screen, the session in the cache, logout. `tests/support/portal-pages.ts` holds every synthetic page of the phase.

**Files:**
- Create: `src/portal/pages/auth.ts`
- Create: `src/portal/session.ts`
- Create: `tests/support/portal-pages.ts`
- Create: `tests/portal/pages-auth.test.ts`
- Create: `tests/portal/session.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/support/portal-pages.ts`:

```ts
// Synthetic portal pages with the markup of the old portal: HTML 4.01, rows without `</tr>` where the portal omits them,
// attributes with or without quotes, entities for accents. Every name and number here is invented.

export const page = (body: string, title = 'SII'): string =>
  `<html><head><title>${title}</title></head><body>${body}</body></html>`

export const ANNUL_ENTRY = page(
  `<h2>ANULACION DE FOLIOS</h2><form name=frm action="/cvc_cgi/dte/af_anular2" method=post><input type=hidden name=KEY value=abc><input name=RUT_EMP></form>`,
)

export const COMPANY_FORM = page(
  `<FORM action="/cvc_cgi/dte/ad_empresa2" method=post><input type=text name=RUT_EMP><input type=text name=DV_EMP><input type=submit name=ACEPTAR value=Ingresar></FORM>`,
)

export const companyResolutionPage = (date = '21-09-2026', number = '80'): string =>
  page(`<table>
<tr><td>Rut</td><td>&nbsp;76543210-3</td>
<tr><td>Raz&oacute;n Social</td><td>&nbsp;COMERCIAL ANDINA SPA</td>
<tr><td>Fecha Resoluci&oacute;n</td><td>&nbsp;${date}</td>
<tr><td>Resoluci&oacute;n</td><td>&nbsp;${number}</td>
<tr><td>Fecha Autorizaci&oacute;n</td><td>&nbsp;01-10-2026</td>
</table>`)

export const NOT_AUTHORIZED_COMPANY = page(
  '<p>el Contribuyente no est&aacute; autorizado para operar en esta modalidad</p>',
)

export const taxpayerPage = (
  address = 'AV. LOS ANDES 123, Villa/Pob. EL BOSQUE, Ciudad RANCAGUA, Comuna MACHALI',
): string =>
  page(`<table>
<tr><td>DATOS DEL CONTRIBUYENTE RUT</td><td>76543210-3</td></tr>
<tr><td>NOMBRE O RAZ&Oacute;N SOCIAL</td><td>COMERCIAL ANDINA SPA</td></tr>
<tr><td>DIRECCI&Oacute;N DE LA EMPRESA</td><td>${address}</td></tr>
<tr><td>DIRECCI&Oacute;N REGIONAL DEL CONTRIBUYENTE</td><td>RANCAGUA</td></tr>
</table>
<h3>DIRECCI&Oacute;N SUCURSALES</h3>
<table><tr><td>123456</td><td>SUCURSAL</td><td>CALLE UNO 45</td></tr><tr><td>abc</td><td>x</td><td>y</td></tr></table>
<h3>ACTIVIDADES ECON&Oacute;MICAS</h3>
<table>
<tr><td>631100</td><td>SERVICIOS DE SOPORTE ANDINOS</td><td>SI</td></tr>
<tr><td>x</td><td>not a code</td><td>NO</td></tr>
</table>
<table><tr><td>GLOSA DESCRIPTIVA</td><td>Desarrollo de sistemas</td></tr></table>`)

export const STAMP_ENTRY = page(
  `<FORM action="/cvc_cgi/dte/of_solicita_folios_dcto" method=post><input type=hidden name=KEY value = 7><input name=RUT_EMP><input name=DV_EMP></FORM>`,
)

export const typeSelector = (options: string, action = '/cvc_cgi/dte/of_confirma_folio'): string =>
  page(
    `<script>function changeRegregion(){ document.frm.action='/cvc_cgi/dte/of_solicita_folios_dcto' }</script>
<form name=frm action="${action}" method=post><input type=hidden name=CONTROL value=S>
<SELECT name = COD_DOCTO onChange="changeRegregion();">${options}</SELECT></form>`,
  )

export const FACTURA_OPTION = '<option value="33">FACTURA ELECTRONICA</option>'
export const BOLETA_OPTION = '<option value=39>BOLETA ELECTRONICA</option>'
export const NO_TYPES_OPTION = '<option value="-1">SIN DOCUMENTOS</option>'

export const quotaForm = (maxAuthorized?: number, available?: number): string =>
  page(`<form action="/cvc_cgi/dte/of_confirma_folio" method=post>
<input type=hidden name=RUT_EMP value=76543210><input type=hidden name=CONTROL value=S>
${maxAuthorized === undefined ? '' : `<input type=hidden name=MAX_AUTOR value=${maxAuthorized}>`}
${available === undefined ? '' : `<input type=hidden name=FOLIOS_DISP value="${available}">`}
<input name=CANT_DOCTOS></form>`)

export const CONFIRM_PAGE = page(
  `<form action="/cvc_cgi/dte/of_confirma_folio" method=post><input type=hidden name=FOLIO_INICIAL value=""><input type=hidden name=KEY value=c></form>`,
)

export const generatePage = (maxAuthorized = 50, quantity = 80): string =>
  page(
    `<form action="/cvc_cgi/dte/of_genera_folio" method=post><input type=hidden name=MAX_AUTOR value=${maxAuthorized}><input type=hidden name=FOLIO_INI value=11><input type=hidden name=CANT_DOCTOS value=${quantity}></form>`,
  )

export const DOWNLOAD_PAGE = page(
  `<p>El SII ha autorizado</p><form action="/cvc_cgi/dte/of_genera_archivo" method=post><input type=hidden name=FOLIO_INI value=11><input type=hidden name=FOLIO_FIN value=60></form>`,
)

export const REJECTION_PAGES = {
  stampingBlocked: page(
    '<h1>Solicitud de Timbraje</h1><p>En esta pagina podra solicitar rangos</p><p><b>NO AUTORIZA TIMBRAJE ELECTR&Oacute;NICA</b> - usted tiene folios suficientes.</p><p>Si necesita mas informacion comuniquese con la Mesa de ayuda</p>',
  ),
  inPersonRequired: page('<p>deber&aacute; presentarse en la oficina del SII correspondiente</p>'),
  companyNotAuthorized: page('<p>la empresa no est&aacute; autorizada para operar en esta modalidad</p>'),
  optionNotAuthorized: page('<p>No est&aacute; autorizado para ingresar a esta opci&oacute;n</p>'),
  userWithoutPermission: page('<p>usuario no autorizado para la empresa</p>'),
  personWithPendingIssues: page('<p>tiene situaciones pendientes con el SII</p>'),
  activityVerificationPending: page('<p>no registra Verificacion de Actividades</p>'),
} as const

export const AUTH_PAGE = page('<p>Ingrese su clave</p>', 'Autenticaci&oacute;n')
export const SESSION_LIMIT_PAGE = page('<p>Ha superado el m&aacute;ximo de sesiones autenticadas</p>')
export const NOT_ENABLED_PAGE = `<script type='text/javascript'>
alert('Si usted desea identificarse, debe ingresar a la opción Cambiar clave.\\n\\nEl código de este mensaje es 01.01.215.500.473.33.');
history.go(-2);
</script>`

export const unusedRangesPage = (rows: readonly (readonly [number, number, string?])[], next?: number): string =>
  page(
    `<form name=frm action="/cvc_cgi/dte/af_anular2" method=post><input type=hidden name=KEY value=frm-key></form>
${rows
  .map(([from, to, date = '15-11-2026']) => {
    const [day, month, year] = date.split('-')
    return `<form action="/cvc_cgi/dte/af_anular3" method=post><input type=hidden name=FOLIO_INI value=${from}><input type=hidden name=FOLIO_FIN value=${to}><input type=hidden name=CANT_DOCTOS value=${to - from + 1}><input type=hidden name=DIA value=${day}><input type=hidden name=MES value=${month}><input type=hidden name=ANO value=${year}></form>`
  })
  .join('\n')}
${next === undefined ? '' : `<input type=button name=BTN value="Ver siguiente" onClick="cambiapag(${next})">`}`,
  )

export const ANNUL_FORM = page(
  '<form action="/cvc_cgi/dte/af_anular" method=post><input type=hidden name=TOKEN_FORM value=z><input name=MOTIVO></form>',
)
export const ANNUL_OK = page('<p>SOLICITUD ANULACION DE FOLIOS. El SII ha autorizado la anulaci&oacute;n</p>')

export const reobtainListPage = (ranges: readonly (readonly [number, number])[]): string =>
  page(
    ranges
      .map(
        ([from, to], index) =>
          `<form name="frm${index}" action="/cvc_cgi/dte/rf_reobtencion3_folios"><input type=hidden name="FOLIO_INI" value="${from}"><input type=hidden name="FOLIO_FIN" value="${to}"><input type=hidden name="COD_DOCTO" value="33"></form>`,
      )
      .join('\n'),
  )

export const reobtainDetailPage = (from: number, annulled = false): string =>
  page(
    `${annulled ? '<p>el rango de folios que desea reobtener ha sido anulado completamente</p>' : ''}<form name="form1" action="/cvc_cgi/dte/rf_genera_folio"><input type=hidden name="FOLIO_INI" value="${from}"></form>`,
  )

export const REOBTAIN_RESOLUTION = page(
  '<p>el SII ha autorizado</p><form action="/cvc_cgi/dte/rf_genera_archivo"><input type=hidden name="FOLIO_INI" value="1"><input type=hidden name="FOLIO_FIN" value="9"></form>',
)

export const certificationPage = (basic = 'REVISADO CONFORME'): string =>
  page(`<table>
<tr><td><font>SET BASICO</font></td><td><b>${basic}</b></td></tr>
<tr><td><font>SET GUIA DE DESPACHO</font></td><td><b>revisado conforme</b></td></tr>
<tr><td><font>SET FACTURA EXENTA</font></td><td><b>REVISADO CONFORME</b></td></tr>
<tr><td><font>SET CASO GENERAL FACTURA COMPRA</font></td><td><b>REVISADO CONFORME</b></td></tr>
<tr><td><font>LIBRO DE VENTAS</font></td><td><input type=hidden name="EST5" value="S21"></td></tr>
<tr><td><font>LIBRO DE COMPRAS</font></td><td><b>EN REVISION</b></td></tr>
<tr><td><font>LIBRO DE GUIAS</font></td><td></td></tr>
</table>`)
```

`tests/portal/pages-auth.test.ts`:

```ts
import {
  asksForAuthentication,
  closeSessionsOffer,
  isBlockedPage,
  isCertificateNotEnabledPage,
  isRepresentationChoice,
  isSessionLimitPage,
  looksLikeLoginRedirect,
  portalMessageOf,
  representationContinueLink,
} from '../../src/portal/pages/auth'
import { AUTH_PAGE, NOT_ENABLED_PAGE, page, SESSION_LIMIT_PAGE } from '../support/portal-pages'

test.each([
  ['superado el m', SESSION_LIMIT_PAGE],
  ['máximo', 'el máximo de sesiones'],
  ['maximo', 'el maximo de sesiones'],
  ['code', 'código 01.01.215.500.709.3'],
])('session limit: %s', (_name, html) => {
  expect(isSessionLimitPage(html)).toBe(true)
})

test('other pages are not the limit', () => {
  expect(isSessionLimitPage(page('hola'))).toBe(false)
})

test('certificate not enabled, in the wording measured at the SII', () => {
  expect(isCertificateNotEnabledPage(NOT_ENABLED_PAGE)).toBe(true)
  expect(isCertificateNotEnabledPage('01.01.215.500.473')).toBe(true)
  expect(isCertificateNotEnabledPage(page('hola'))).toBe(false)
  expect(portalMessageOf(NOT_ENABLED_PAGE)).toContain('Cambiar clave')
})

test('authentication and login leftovers', () => {
  expect(asksForAuthentication(AUTH_PAGE)).toBe(true)
  expect(asksForAuthentication(page('hola'))).toBe(false)
  for (const text of ['autInicioDTE.cgi', '/cgi_AUT2000/x', '302 Found'])
    expect(looksLikeLoginRedirect(text)).toBe(true)
  expect(looksLikeLoginRedirect('hola')).toBe(false)
})

test('representation screen and its link', () => {
  const html = page('ESCOJA COMO DESEA INGRESAR <a href="/go?x=1" class=b> Continuar </a>')
  expect(isRepresentationChoice(html)).toBe(true)
  expect(representationContinueLink(html)).toBe('/go?x=1')
  expect(isRepresentationChoice(page('hola'))).toBe(false)
  expect(representationContinueLink(page('hola'))).toBeNull()
})

test('offers to close sessions', () => {
  expect(
    closeSessionsOffer(
      page('<form action="/x"></form><form action="/cgi/CierraAnt.cgi"><input type=hidden name=K value=1></form>'),
    ),
  ).toEqual({ kind: 'form', action: '/cgi/CierraAnt.cgi', fields: { K: '1' } })
  expect(closeSessionsOffer(page('<a href="/cgi/CierraAntSesion?a=1">cerrar</a>'))).toEqual({
    kind: 'link',
    href: '/cgi/CierraAntSesion?a=1',
  })
  expect(closeSessionsOffer(page('<form></form>'))).toBeNull()
})

test.each([
  [403, page('nada'), true],
  [200, page('acceso restringido'), true],
  [200, page('Transaccion Rechazada<br>ID: 980'), true],
  [200, page('hola'), false],
])('blocks: %s', (status, html, expected) => {
  expect(isBlockedPage(status, html)).toBe(expected)
})

test('the portal message prefers alerts, else visible text', () => {
  expect(portalMessageOf(page('Hola <b>mundo</b>'))).toBe('SII Hola mundo')
  expect(portalMessageOf(`<script>alert('uno');\nalert('dos');</script>`)).toBe('uno | dos')
})
```

`tests/portal/session.test.ts`:

```ts
import { DteError } from '../../src/errors'
import {
  closePortalSession,
  ensurePage,
  formEncode,
  companyFields,
  navigate,
  openPortalSession,
  portalRequest,
  withFreshSessionRetry,
  withPortalSession,
} from '../../src/portal/session'
import { createMemoryCapture } from '../../src/sii/capture'
import type { Logger } from '../../src/sii/logger'
import { FIXED_NOW, ISSUER_RUT } from '../support/fixtures'
import {
  failure,
  HERCULES,
  MAULLIN,
  portalWith,
  seedSession,
  SESSION_COOKIES,
  SESSION_KEY,
  signedIn,
} from '../support/portal'
import { AUTH_PAGE, COMPANY_FORM, NOT_ENABLED_PAGE, page, SESSION_LIMIT_PAGE } from '../support/portal-pages'

const ENTRY = 'https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoCertificado.html*'
const LOGIN_OK = {
  status: 302,
  headers: {
    Location: 'https://misiir.sii.cl/cgi_misii/siihome.cgi',
    'Set-Cookie': 'NETSCAPE_LIVEWIRE.rut=12345678; Domain=.sii.cl; Path=/, NETSCAPE_LIVEWIRE.dv=5; Path=/',
  },
}
const HOME = { url: 'https://misiir.sii.cl/cgi_misii/siihome.cgi', reply: { body: page('Mi SII') } }
const LOGIN_REDIRECT = {
  status: 302,
  headers: { Location: `https://zeus.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?${MAULLIN}/ad_empresa1` },
}
const ZEUS = { url: 'https://zeus.sii.cl/AUT2000/InicioAutenticacion/*', reply: { body: AUTH_PAGE } }

const logger = (): Logger & { readonly lines: string[] } => {
  const lines: string[] = []
  const log = (message: string): void => {
    lines.push(message)
  }
  return { debug: log, info: log, warn: log, error: log, lines }
}

const run = <T>(
  harness: { portal: Parameters<typeof withPortalSession>[0] },
  work: Parameters<typeof withPortalSession<T>>[3],
) => withPortalSession<T>(harness.portal, 'test', undefined, work)

describe('openPortalSession', () => {
  test('visits the entry page, then posts the certificate login', async () => {
    const harness = portalWith([
      { url: ENTRY, reply: { body: page('x'), headers: { 'Set-Cookie': 'TS01=abc; Path=/' } } },
      { url: `${HERCULES}*`, method: 'POST', reply: LOGIN_OK },
      HOME,
    ])
    await expect(openPortalSession(harness.portal)).resolves.toEqual({ userRut: '12345678-5', reused: false })
    const login = harness.fake.requests[1]
    expect(login.url).toBe(`${HERCULES}?https://misiir.sii.cl/cgi_misii/siihome.cgi`)
    expect(login.text).toBe('referencia=https%3A%2F%2Fmisiir.sii.cl%2Fcgi_misii%2Fsiihome.cgi')
    expect(login.headers['cookie']).toBe('TS01=abc')
    expect(login.headers['content-type']).toBe('application/x-www-form-urlencoded')
    expect(login.headers['origin']).toBe('https://herculesr.sii.cl')
    expect(login.headers['referer']).toBe(login.url)
    expect(login.timeoutMs).toBe(30000)
    expect(harness.fake.requests[0].headers['cookie']).toBeUndefined()
    const stored = await harness.portal.sessionCache.get(SESSION_KEY)
    expect(JSON.parse(stored!.token)).toMatchObject({ 'NETSCAPE_LIVEWIRE.rut': '12345678', TS01: 'abc' })
    expect(stored!.expiresAt).toBe(FIXED_NOW.getTime() + 90 * 60 * 1000)
  })

  test('reuses a cached session that still answers', async () => {
    const harness = await signedIn([{ url: `${MAULLIN}/ad_empresa1`, reply: { body: COMPANY_FORM } }])
    await expect(openPortalSession(harness.portal)).resolves.toEqual({ userRut: '12345678-5', reused: true })
    expect(harness.fake.requests).toHaveLength(1)
  })

  test.each([
    ['another page', { body: page('hola') }],
    ['another status', { status: 500, body: 'RUT_EMP' }],
    ['a transport failure', new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' })],
  ])('logs in again when the cached session meets %s', async (_name, reply) => {
    const harness = await signedIn([
      { url: `${MAULLIN}/ad_empresa1`, reply },
      { url: ENTRY, reply: { body: page('x') } },
      { url: `${HERCULES}*`, reply: LOGIN_OK },
      HOME,
    ])
    await expect(openPortalSession(harness.portal)).resolves.toMatchObject({ reused: false })
  })

  test('the page after login also counts when it holds `ad_empresa`', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/ad_empresa1`, reply: { body: page('ver /cvc_cgi/dte/ad_empresa2') } },
    ])
    await expect(openPortalSession(harness.portal)).resolves.toMatchObject({ reused: true })
  })

  test('a certificate not enabled is its own error, as measured at the SII', async () => {
    const harness = portalWith([
      { url: ENTRY, reply: { body: page('x') } },
      { url: `${HERCULES}*`, reply: { body: NOT_ENABLED_PAGE } },
    ])
    const error = await failure(openPortalSession(harness.portal))
    expect(error.code).toBe('SII_PORTAL_CERT_NOT_ENABLED')
    expect(error.details.portalMessage).toContain('Cambiar clave')
  })

  test('no session cookie is a failed login', async () => {
    const harness = portalWith([
      { url: ENTRY, reply: { body: page('x') } },
      { url: `${HERCULES}*`, reply: { body: page('algo') } },
    ])
    expect((await failure(openPortalSession(harness.portal))).code).toBe('SII_PORTAL_LOGIN_FAILED')
    expect(await harness.portal.sessionCache.get(SESSION_KEY)).toBeNull()
  })
})

describe('session limit', () => {
  const limitWith = (html: string) => ({ body: page(`${SESSION_LIMIT_PAGE}${html}`) })
  const entry = { url: ENTRY, reply: { body: page('x') } }

  test('no offer, no retry', async () => {
    const harness = portalWith([entry, { url: `${HERCULES}*`, reply: { body: SESSION_LIMIT_PAGE } }])
    expect((await failure(openPortalSession(harness.portal))).code).toBe('SII_PORTAL_SESSION_LIMIT')
    expect(harness.fake.requests).toHaveLength(2)
  })

  test('a form offer is submitted and the login repeated once', async () => {
    const harness = portalWith([
      entry,
      {
        url: `${HERCULES}*`,
        reply: [
          limitWith('<form action="/cgi_AUT2000/CierraAnt.cgi"><input type=hidden name=K value=1></form>'),
          LOGIN_OK,
        ],
      },
      { url: 'https://herculesr.sii.cl/cgi_AUT2000/CierraAnt.cgi', reply: { body: page('ok') } },
      HOME,
    ])
    await expect(openPortalSession(harness.portal)).resolves.toMatchObject({ userRut: '12345678-5' })
    expect(harness.posted('CierraAnt')).toEqual([{ K: '1', ACEPTAR: 'Aceptar' }])
  })

  test('a link offer is followed; if the limit stays, it throws', async () => {
    const limit = limitWith('<a href="/cgi_AUT2000/CierraAnt.cgi?x=1">cerrar</a>')
    const harness = portalWith([
      entry,
      { url: `${HERCULES}*`, reply: [limit, limit] },
      { url: 'https://herculesr.sii.cl/cgi_AUT2000/CierraAnt.cgi?x=1', method: 'GET', reply: { body: page('ok') } },
    ])
    expect((await failure(openPortalSession(harness.portal))).code).toBe('SII_PORTAL_SESSION_LIMIT')
    expect(harness.urls().filter((url) => url.startsWith(HERCULES))).toHaveLength(2)
  })

  test('closing can be turned off', async () => {
    const harness = portalWith(
      [entry, { url: `${HERCULES}*`, reply: limitWith('<a href="/cgi_AUT2000/CierraAnt.cgi">x</a>') }],
      { closePreviousSessions: false },
    )
    expect((await failure(openPortalSession(harness.portal))).code).toBe('SII_PORTAL_SESSION_LIMIT')
    expect(harness.fake.requests).toHaveLength(2)
  })

  test('closing that fails leaves the limit standing', async () => {
    const log = logger()
    const harness = portalWith(
      [
        entry,
        { url: `${HERCULES}*`, reply: limitWith('<a href="/cgi_AUT2000/CierraAnt.cgi">x</a>') },
        {
          url: 'https://herculesr.sii.cl/cgi_AUT2000/CierraAnt.cgi',
          reply: new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' }),
        },
      ],
      { logger: log },
    )
    expect((await failure(openPortalSession(harness.portal))).code).toBe('SII_PORTAL_SESSION_LIMIT')
    expect(log.lines).toContain('sii portal could not close earlier sessions')
  })

  test('a limit page while visiting a CGI page is handled the same way', async () => {
    const harness = await signedIn([{ url: `${MAULLIN}/ad_empresa1`, reply: { body: SESSION_LIMIT_PAGE } }])
    const error = await failure(run(harness, (context) => ensurePage(context, 'x', `${MAULLIN}/ad_empresa1`)))
    expect(error.code).toBe('SII_PORTAL_SESSION_LIMIT')
  })
})

describe('ensurePage', () => {
  test('a live session goes straight to the page', async () => {
    const harness = await signedIn([{ url: `${MAULLIN}/ad_empresa1`, reply: { body: COMPANY_FORM } }])
    const reached = await run(harness, (context) => ensurePage(context, 'x', `${MAULLIN}/ad_empresa1`))
    expect(reached.html).toBe(COMPANY_FORM)
    expect(harness.fake.requests[0].headers['cookie']).toContain('NETSCAPE_LIVEWIRE.rut=12345678')
  })

  test('an expired session logs in on demand with the target of the redirect', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/ad_empresa1`, reply: [LOGIN_REDIRECT, { body: COMPANY_FORM }] },
      ZEUS,
      {
        url: `${HERCULES}*`,
        reply: { status: 302, headers: { Location: `${MAULLIN}/ad_empresa1`, 'Set-Cookie': 'NETSCAPE_LIVEWIRE.x=1' } },
      },
    ])
    const reached = await run(harness, (context) => ensurePage(context, 'x', `${MAULLIN}/ad_empresa1`))
    expect(reached.html).toBe(COMPANY_FORM)
    expect(harness.urls()).toContain(`${HERCULES}?${MAULLIN}/ad_empresa1`)
    expect(harness.posted('CAutInicio')).toEqual([{ referencia: `${MAULLIN}/ad_empresa1` }])
  })

  test('a second request for login within one operation is an expired session', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/a`, reply: LOGIN_REDIRECT },
      { url: `${MAULLIN}/ad_empresa1`, reply: LOGIN_REDIRECT },
      ZEUS,
      { url: `${HERCULES}*`, reply: { body: page('ok') } },
    ])
    const error = await failure(
      run(harness, async (context) => {
        await ensurePage(context, 'first', `${MAULLIN}/a`)
        await ensurePage(context, 'second', `${MAULLIN}/a`)
      }),
    )
    expect(error.code).toBe('SII_PORTAL_SESSION_EXPIRED')
    expect(error.details).toMatchObject({ operation: 'test', step: 'second' })
  })

  test('an authentication page without a redirect target comes back as it is', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/a`, reply: { body: AUTH_PAGE } },
      {
        url: `${MAULLIN}/b`,
        reply: { status: 302, headers: { Location: 'https://zeus.sii.cl/AUT2000/InicioAutenticacion/x' } },
      },
      ZEUS,
    ])
    await run(harness, async (context) => {
      expect((await ensurePage(context, 'x', `${MAULLIN}/a`)).html).toBe(AUTH_PAGE)
      expect((await ensurePage(context, 'x', `${MAULLIN}/b`)).html).toBe(AUTH_PAGE)
    })
  })

  test('a query that does not decode is used raw', async () => {
    const harness = await signedIn([
      {
        url: `${MAULLIN}/a`,
        reply: { status: 302, headers: { Location: 'https://zeus.sii.cl/AUT2000/InicioAutenticacion/x?%zz' } },
      },
      ZEUS,
      { url: `${HERCULES}*`, reply: { body: page('ok') } },
    ])
    await run(harness, (context) => ensurePage(context, 'x', `${MAULLIN}/a`))
    expect(harness.posted('CAutInicio')).toEqual([{ referencia: '%zz' }])
  })

  test('the representation screen is not a failure: its link goes on', async () => {
    const choice = page('ESCOJA COMO DESEA INGRESAR <a href="/go">Continuar</a>', 'Autenticaci&oacute;n')
    const harness = await signedIn([
      {
        url: `${MAULLIN}/a`,
        reply: { status: 302, headers: { Location: 'https://maullin.sii.cl/choice?x=1' } },
      },
      { url: 'https://maullin.sii.cl/choice?x=1', reply: { body: choice } },
      { url: 'https://maullin.sii.cl/go', reply: { body: COMPANY_FORM } },
    ])
    const reached = await run(harness, (context) => ensurePage(context, 'x', `${MAULLIN}/a`))
    expect(reached.html).toBe(COMPANY_FORM)
    expect(harness.urls()).not.toContain(`${HERCULES}?x=1`)
  })

  test('without its link the representation screen comes back', async () => {
    const choice = page('ESCOJA COMO DESEA INGRESAR')
    const harness = await signedIn([{ url: `${MAULLIN}/a`, reply: { body: choice } }])
    expect((await run(harness, (context) => ensurePage(context, 'x', `${MAULLIN}/a`))).html).toBe(choice)
  })

  test('a page pointing at the annulment entry is visited once more', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/af_anular1`, reply: [{ body: page('ir a /cvc_cgi/dte/af_anular1') }, { body: page('real') }] },
    ])
    expect((await run(harness, (context) => ensurePage(context, 'x', `${MAULLIN}/af_anular1`))).html).toBe(page('real'))
  })
})

describe('requests', () => {
  test('a block stops at once, with what the page said', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/a`, reply: { status: 200, body: page('Transaccion Rechazada<br>ID: 980') } },
    ])
    const error = await failure(run(harness, (context) => portalRequest(context, 'x', 'GET', `${MAULLIN}/a`)))
    expect(error.code).toBe('SII_PORTAL_BLOCKED')
    expect(error.details).toMatchObject({ operation: 'test', step: 'x', httpStatus: 200 })
    expect(error.details.portalMessage).toContain('Transaccion Rechazada')
  })

  test('502, 503 and 504 repeat; the waits follow the policy', async () => {
    const harness = await signedIn(
      [{ url: `${MAULLIN}/a`, reply: [{ status: 502 }, { status: 503 }, { status: 504 }, { body: page('ok') }] }],
      { retry: { jitterRatio: 0 } },
    )
    expect((await run(harness, (context) => portalRequest(context, 'x', 'GET', `${MAULLIN}/a`))).html).toBe(page('ok'))
    expect(harness.sleeps).toEqual([2000, 4000, 8000])
  })

  test('the portal TLS hiccup repeats and the operator can see it', async () => {
    const log = logger()
    const harness = await signedIn(
      [{ url: `${MAULLIN}/a`, reply: [new DteError('TRANSPORT_TLS', { reason: 'EPROTO' }), { body: page('ok') }] }],
      { retry: {}, logger: log },
    )
    await run(harness, (context) => portalRequest(context, 'x', 'GET', `${MAULLIN}/a`))
    expect(log.lines).toContain('sii portal retrying')
  })

  test('with retries exhausted, the HTTP error reaches the caller', async () => {
    const harness = await signedIn([{ url: `${MAULLIN}/a`, reply: { status: 503, body: 'caido' } }])
    const error = await failure(run(harness, (context) => portalRequest(context, 'x', 'GET', `${MAULLIN}/a`)))
    expect(error.code).toBe('SII_HTTP_ERROR')
    expect(error.details).toMatchObject({ httpStatus: 503, channel: 'portal', operation: 'test.x' })
  })

  test('any other status is a page', async () => {
    const harness = await signedIn([{ url: `${MAULLIN}/a`, reply: { status: 500, body: 'Error 500' } }])
    const reached = await run(harness, (context) => portalRequest(context, 'x', 'GET', `${MAULLIN}/a`))
    expect(reached).toMatchObject({ status: 500, html: 'Error 500', lastLocation: null })
  })

  test('Latin-1 unless the page declares UTF-8', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/a`, reply: { body: 'Ñuñoa', encoding: 'latin1' } },
      {
        url: `${MAULLIN}/b`,
        reply: { body: 'Ñuñoa', encoding: 'utf8', headers: { 'Content-Type': 'text/html; charset=UTF-8' } },
      },
    ])
    await run(harness, async (context) => {
      expect((await portalRequest(context, 'x', 'GET', `${MAULLIN}/a`)).html).toBe('Ñuñoa')
      expect((await portalRequest(context, 'x', 'GET', `${MAULLIN}/b`)).html).toBe('Ñuñoa')
    })
  })

  test('redirects stop after eight hops and resolve relative targets', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/loop`, reply: { status: 302, headers: { Location: '/cvc_cgi/dte/loop' } } },
    ])
    const reached = await run(harness, (context) => navigate(context, 'x', 'GET', `${MAULLIN}/loop`))
    expect(harness.fake.requests).toHaveLength(9)
    expect(reached.lastLocation).toBe(`${MAULLIN}/loop`)
  })

  test('a redirect status without a target is a page', async () => {
    const harness = await signedIn([{ url: `${MAULLIN}/a`, reply: { status: 302 } }])
    const reached = await run(harness, (context) => navigate(context, 'x', 'GET', `${MAULLIN}/a`))
    expect(reached.status).toBe(302)
  })

  test('overrides reach the request', async () => {
    const harness = await signedIn([{ url: `${MAULLIN}/a`, reply: { body: 'x' } }])
    await withPortalSession(harness.portal, 'test', { timeoutMs: 5 }, (context) =>
      portalRequest(context, 'x', 'GET', `${MAULLIN}/a`),
    )
    expect(harness.fake.requests[0].timeoutMs).toBe(5)
  })

  test('the capture sees the portal channel, the step and no cookie value', async () => {
    const capture = createMemoryCapture()
    const harness = await signedIn(
      [
        {
          url: `${MAULLIN}/a`,
          reply: {
            body: page('NETSCAPE_LIVEWIRE.rut=99999999;'),
            headers: { 'Set-Cookie': 'CSESSIONID=secret-value' },
          },
        },
      ],
      { capture: capture.capture },
    )
    await run(harness, (context) => portalRequest(context, 'x', 'GET', `${MAULLIN}/a`))
    const [exchange] = capture.exchanges()
    expect(exchange.channel).toBe('portal')
    expect(exchange.operation).toBe('test.x')
    const text = JSON.stringify(exchange)
    expect(text).not.toContain('cookie-value')
    expect(text).not.toContain('secret-value')
    expect(text).not.toContain('99999999')
  })

  test('form helpers', () => {
    expect(formEncode({ a: 'ñ b', c: '' })).toBe('a=%C3%B1%20b&c=')
    expect(companyFields(ISSUER_RUT as never)).toEqual({ RUT_EMP: '76543210', DV_EMP: '3' })
  })
})

describe('the session in the cache', () => {
  test('an expired entry does not count', async () => {
    const harness = portalWith([{ url: `${MAULLIN}/a`, reply: { body: 'x' } }])
    await harness.portal.sessionCache.set(SESSION_KEY, { token: JSON.stringify(SESSION_COOKIES), expiresAt: 1 })
    await run(harness, (context) => portalRequest(context, 'x', 'GET', `${MAULLIN}/a`))
    expect(harness.fake.requests[0].headers['cookie']).toBeUndefined()
  })

  test('a failing cache is logged and never fails the operation', async () => {
    const log = logger()
    const boom = async (): Promise<never> => {
      throw new Error('cache down')
    }
    const harness = portalWith([{ url: `${MAULLIN}/a`, reply: { body: 'x' } }], {
      logger: log,
      sessionCache: { get: boom, set: boom, delete: boom },
    })
    await expect(run(harness, (context) => portalRequest(context, 'x', 'GET', `${MAULLIN}/a`))).resolves.toMatchObject({
      html: 'x',
    })
    expect(log.lines.filter((line) => line === 'sii portal session cache failed')).toHaveLength(2)
  })

  test('two operations on one certificate never overlap', async () => {
    const harness = await signedIn([{ url: `${MAULLIN}/a`, reply: { body: 'x' } }])
    const order: string[] = []
    const op = (name: string) =>
      run(harness, async (context) => {
        order.push(`${name} start`)
        await portalRequest(context, 'x', 'GET', `${MAULLIN}/a`)
        order.push(`${name} end`)
      })
    await Promise.all([op('one'), op('two')])
    expect(order).toEqual(['one start', 'one end', 'two start', 'two end'])
  })
})

describe('withFreshSessionRetry', () => {
  test.each(['SII_PORTAL_SESSION_EXPIRED', 'SII_PORTAL_UNEXPECTED_PAGE'] as const)(
    '%s repeats once with the session forgotten',
    async (code) => {
      const log = logger()
      const harness = await signedIn([], { logger: log })
      const seen: Readonly<Record<string, string>>[] = []
      const result = await run(harness, (context) =>
        withFreshSessionRetry(context, async () => {
          seen.push(context.state.cookies)
          if (seen.length === 1) throw new DteError(code)
          return 'done'
        }),
      )
      expect(result).toBe('done')
      expect(seen[1]).toEqual({})
      expect(log.lines).toContain('sii portal retrying with a fresh session')
    },
  )

  test('anything else goes straight through', async () => {
    const harness = await signedIn([])
    const calls = { count: 0 }
    const attempt = (thrown: unknown) =>
      run(harness, (context) =>
        withFreshSessionRetry(context, async () => {
          calls.count += 1
          throw thrown
        }),
      )
    expect((await failure(attempt(new DteError('SII_PORTAL_BLOCKED')))).code).toBe('SII_PORTAL_BLOCKED')
    await expect(attempt(new Error('boom'))).rejects.toThrow('boom')
    expect(calls.count).toBe(2)
  })
})

describe('closePortalSession', () => {
  test('tries every logout URL, once, and removes the session', async () => {
    const harness = await signedIn([
      { url: 'https://zeusr.sii.cl/cgi_AUT2000/autTermino.cgi', reply: new DteError('TRANSPORT_FAILED') },
      { url: 'https://herculesr.sii.cl/cgi_AUT2000/autLogout.cgi', reply: { status: 404 } },
      { url: 'https://www.sii.cl/AUT2000/autLogout.cgi', reply: { status: 503 } },
    ])
    await closePortalSession(harness.portal)
    expect(harness.fake.requests).toHaveLength(3)
    expect(await harness.portal.sessionCache.get(SESSION_KEY)).toBeNull()
  })

  test('with no session there is nothing to say to the SII', async () => {
    const harness = portalWith([])
    await closePortalSession(harness.portal)
    expect(harness.fake.requests).toHaveLength(0)
  })

  test('seeding helper accepts custom cookies', async () => {
    const harness = portalWith([])
    await seedSession(harness.portal, { 'NETSCAPE_LIVEWIRE.rut': '1' })
    expect((await harness.portal.sessionCache.get(SESSION_KEY))!.token).toContain('LIVEWIRE')
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/pages-auth tests/portal/session --coverage=false
```

Expected: FAIL, because the code below does not exist yet.

- [ ] **Step 3: Write the implementation**

`src/portal/pages/auth.ts`:

```ts
import { alertMessages, attribute, formBlocks, inputValues, visibleText } from '../html'

/**
 * EN: The SII reports too many authenticated sessions for the RUT.
 * ES: El SII informa demasiadas sesiones autenticadas para el RUT.
 */
export const isSessionLimitPage = (html: string): boolean =>
  /m[aá]ximo de sesiones|superado el m|01\.01\.215\.500\.709/i.test(html)

/**
 * EN: The certificate works at TLS level but was never enabled as a login method: a manual step at sii.cl.
 * ES: El certificado funciona a nivel TLS pero nunca se habilitó como método de ingreso: un trámite manual en sii.cl.
 */
export const isCertificateNotEnabledPage = (html: string): boolean =>
  html.includes('Cambiar clave') || html.includes('01.01.215.500.473')

/**
 * EN: The page asks to authenticate.
 * ES: La página pide autenticarse.
 */
export const asksForAuthentication = (html: string): boolean => html.includes('Autenticaci')

/**
 * EN: What a page left behind by an expired session looks like when no redirect carried it there.
 * ES: Cómo se ve una página dejada por una sesión vencida cuando ninguna redirección la trajo.
 */
export const looksLikeLoginRedirect = (html: string): boolean =>
  html.includes('autInicioDTE.cgi') || html.includes('cgi_AUT2000') || html.includes('302 Found')

/**
 * EN: The screen a certificate that represents other RUTs gets. It is not a failure, although its title says
 * "Autenticación": its "Continuar" link goes on to the requested page.
 * ES: La pantalla que recibe un certificado que representa a otros RUT. No es una falla, aunque su título diga
 * "Autenticación": su enlace "Continuar" sigue hacia la página pedida.
 */
export const isRepresentationChoice = (html: string): boolean => html.includes('ESCOJA COMO DESEA INGRESAR')

/**
 * EN: The target of the "Continuar" link of that screen.
 * ES: El destino del enlace "Continuar" de esa pantalla.
 */
export const representationContinueLink = (html: string): string | null =>
  /<a\s+href="([^"]+)"[^>]*>\s*Continuar\s*<\/a>/i.exec(html)?.[1] ?? null

/**
 * EN: What the session limit page offers for closing earlier sessions.
 * ES: Lo que ofrece la página de límite de sesiones para cerrar las anteriores.
 */
export type CloseSessionsOffer =
  | {
      /** EN: A form to submit. ES: Un formulario que enviar. */
      readonly kind: 'form'
      /** EN: Form action. ES: Acción del formulario. */
      readonly action: string
      /** EN: Its fields. ES: Sus campos. */
      readonly fields: Readonly<Record<string, string>>
    }
  | {
      /** EN: A link to follow. ES: Un enlace que seguir. */
      readonly kind: 'link'
      /** EN: Link target. ES: Destino del enlace. */
      readonly href: string
    }

/**
 * EN: The offer to close earlier sessions, or null when the page makes none.
 * ES: La oferta de cerrar sesiones anteriores, o null si la página no hace ninguna.
 */
export const closeSessionsOffer = (html: string): CloseSessionsOffer | null => {
  for (const block of formBlocks(html)) {
    const action = attribute(/<form\b[^>]*>/i.exec(block)![0], 'action')
    if (action !== null && /CierraAnt|cerrar|Logout|anular/i.test(action))
      return { kind: 'form', action, fields: inputValues(html) }
  }
  const link = /href=["']([^"']*CierraAnt[^"']*)/i.exec(html)
  return link === null ? null : { kind: 'link', href: link[1] }
}

/**
 * EN: The SII firewall or a captcha stopped the request: HTTP 403, "acceso restringido" or "Transaccion Rechazada" (a
 * page with a support ID). Waiting is the only remedy.
 * ES: El firewall del SII o un captcha detuvo la petición: HTTP 403, "acceso restringido" o "Transaccion Rechazada" (una
 * página con un ID de soporte). La única salida es esperar.
 */
export const isBlockedPage = (status: number, html: string): boolean =>
  status === 403 || html.includes('acceso restringido') || html.includes('Transaccion Rechazada')

/**
 * EN: What the portal said on a page, for `details.portalMessage`: its `alert()` messages, else its visible text.
 * ES: Lo que dijo el portal en una página, para `details.portalMessage`: sus mensajes `alert()`, si no su texto visible.
 */
export const portalMessageOf = (html: string): string => {
  const alerts = alertMessages(html)
  return alerts.length > 0 ? alerts.join(' | ').slice(0, 400) : visibleText(html)
}
```

`src/portal/session.ts`:

```ts
import {
  CERTIFICATE_ENTRY_URL,
  CERTIFICATE_LOGIN_URL,
  cgiUrl,
  PORTAL_LANDING_URL,
  PORTAL_LOGOUT_URLS,
  type PortalRejection,
} from '../catalogs/portal'
import { DteError, errorMessage, isDteError } from '../errors'
import { splitSiiRut, type SiiRut } from '../model/rut'
import type { CallOverrides } from '../sii/client'
import { bodyExcerpt, httpError } from '../sii/operation'
import { mergeRetryPolicy, withRetry } from '../sii/retry'
import { send } from '../sii/send'
import { certificateFingerprint } from '../sii/token-cache'
import { decodeBody, encodeUtf8, type BodyEncoding, type HttpMethod, type HttpResponse } from '../sii/transport'
import type { PortalClient } from './client'
import {
  cookieHeader,
  hasSessionCookie,
  mergeSetCookie,
  parseCookies,
  serializeCookies,
  sessionRut,
  type CookieJar,
} from './cookies'
import {
  asksForAuthentication,
  closeSessionsOffer,
  isBlockedPage,
  isCertificateNotEnabledPage,
  isRepresentationChoice,
  isSessionLimitPage,
  portalMessageOf,
  representationContinueLink,
} from './pages/auth'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'
const RETRYABLE_STATUS: ReadonlySet<number> = new Set([502, 503, 504])
const REDIRECT_STATUS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308])
const MAX_REDIRECTS = 8
const ANNULMENT_ENTRY_PATH = '/cvc_cgi/dte/af_anular1'

/**
 * EN: One operation's hold on the session. `state` is the one piece of mutable data: it lives as long as the operation,
 * under the lock, and never reaches the caller.
 * ES: El control de una operación sobre la sesión. `state` es el único dato mutable: vive lo que dura la operación, bajo el
 * candado, y nunca llega a quien llama.
 */
export type PortalContext = {
  /** EN: The client. ES: El cliente. */
  readonly portal: PortalClient
  /** EN: Operation name for capture, logs and errors. ES: Nombre de la operación para captura, logs y errores. */
  readonly operation: string
  /** EN: Per-call overrides. ES: Ajustes de la llamada. */
  readonly overrides?: CallOverrides
  /** EN: Current cookies and whether this operation already logged in. ES: Cookies actuales y si esta operación ya inició sesión. */
  readonly state: { cookies: CookieJar; loggedIn: boolean }
}

/**
 * EN: One portal answer, decoded.
 * ES: Una respuesta del portal, decodificada.
 */
export type PortalPage = {
  /** EN: HTTP status. ES: Estado HTTP. */
  readonly status: number
  /** EN: Response headers. ES: Cabeceras de la respuesta. */
  readonly headers: Readonly<Record<string, string>>
  /** EN: Decoded body. ES: Cuerpo decodificado. */
  readonly html: string
  /** EN: URL this answer came from. ES: URL de la que vino esta respuesta. */
  readonly url: string
  /** EN: Last redirect followed to get here, or null. ES: Última redirección seguida para llegar aquí, o null. */
  readonly lastLocation: string | null
}

/**
 * EN: The form fields that name a company.
 * ES: Los campos de formulario que nombran a una empresa.
 */
export const companyFields = (rut: SiiRut): { readonly RUT_EMP: string; readonly DV_EMP: string } => {
  const { body, verifier } = splitSiiRut(rut)
  return { RUT_EMP: body, DV_EMP: verifier }
}

/**
 * EN: The form body the portal expects.
 * ES: El cuerpo de formulario que espera el portal.
 */
export const formEncode = (fields: Readonly<Record<string, string>>): string =>
  Object.entries(fields)
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join('&')

const portalEncoding = (response: Pick<HttpResponse, 'headers'>): BodyEncoding =>
  /charset=utf-?8/i.test(response.headers['content-type'] ?? '') ? 'utf8' : 'latin1'

const requestHeaders = (
  url: string,
  method: HttpMethod,
  cookies: CookieJar,
  referer: string | undefined,
): Readonly<Record<string, string>> => ({
  'User-Agent': USER_AGENT,
  Accept: ACCEPT,
  'Accept-Language': 'es-419,es-US;q=0.9,es;q=0.8,en;q=0.7',
  'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  ...(method === 'POST'
    ? {
        'Cache-Control': 'max-age=0',
        Origin: new URL(url).origin,
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    : {}),
  ...(referer === undefined ? {} : { Referer: referer }),
  ...(Object.keys(cookies).length === 0 ? {} : { Cookie: cookieHeader(cookies) }),
})

/**
 * EN: The error for a page the code cannot interpret, with what the page said.
 * ES: El error para una página que el código no puede interpretar, con lo que dijo la página.
 */
export const unexpectedPage = (context: PortalContext, step: string, html: string): DteError =>
  new DteError('SII_PORTAL_UNEXPECTED_PAGE', {
    operation: context.operation,
    step,
    portalMessage: portalMessageOf(html),
    body: bodyExcerpt(html),
  })

/**
 * EN: The error for a business refusal, with what the portal said.
 * ES: El error para un rechazo de negocio, con lo que dijo el portal.
 */
export const rejected = (
  context: PortalContext,
  rejection: PortalRejection,
  details: Readonly<Record<string, unknown>>,
): DteError => new DteError('SII_PORTAL_REJECTED', { rejection, operation: context.operation, ...details })

/**
 * EN: One request and no redirects: one `send` inside the retry loop. Cookies go into the jar; a block throws. Any other
 * status is a page, except 502, 503 and 504, which are repeated.
 * ES: Una petición sin redirecciones: un `send` dentro del ciclo de reintentos. Las cookies entran a la bolsa; un bloqueo
 * lanza. Cualquier otro estado es una página, salvo 502, 503 y 504, que se repiten.
 */
export const portalRequest = async (
  context: PortalContext,
  step: string,
  method: HttpMethod,
  url: string,
  options: { readonly form?: Readonly<Record<string, string>>; readonly referer?: string } = {},
): Promise<PortalPage> => {
  const { portal, overrides, state } = context
  const operation = `${context.operation}.${step}`
  const body = options.form === undefined ? undefined : encodeUtf8(formEncode(options.form))
  const response = await withRetry(
    mergeRetryPolicy(portal.retry, overrides?.retry),
    async (attempt) => {
      const answer = await send(portal, {
        operation,
        channel: 'portal',
        method,
        url,
        headers: requestHeaders(url, method, state.cookies, options.referer),
        body,
        timeoutMs: overrides?.timeoutMs ?? portal.timeoutMs,
        signal: overrides?.signal,
        attempt,
        requestEncoding: 'utf8',
        responseEncoding: portalEncoding,
      })
      if (RETRYABLE_STATUS.has(answer.status))
        throw httpError(answer, decodeBody(answer.body, portalEncoding(answer)), operation, 'portal', url)
      return answer
    },
    {
      sleep: portal.sleep,
      signal: overrides?.signal,
      onRetry: (error, attempt, delayMs) =>
        portal.logger.warn('sii portal retrying', { operation, attempt, delayMs, code: error.code }),
    },
  )
  state.cookies = mergeSetCookie(state.cookies, response.headers['set-cookie'])
  const html = decodeBody(response.body, portalEncoding(response))
  if (isBlockedPage(response.status, html))
    throw new DteError('SII_PORTAL_BLOCKED', {
      operation: context.operation,
      step,
      httpStatus: response.status,
      portalMessage: portalMessageOf(html),
    })
  return { status: response.status, headers: response.headers, html, url, lastLocation: null }
}

const followRedirects = async (context: PortalContext, step: string, first: PortalPage): Promise<PortalPage> => {
  const hop = async (page: PortalPage, count: number): Promise<PortalPage> => {
    const location = page.headers['location']
    if (!REDIRECT_STATUS.has(page.status) || location === undefined || count >= MAX_REDIRECTS) return page
    const next = new URL(location, page.url).toString()
    return hop({ ...(await portalRequest(context, step, 'GET', next)), lastLocation: next }, count + 1)
  }
  return hop(first, 0)
}

/**
 * EN: A request plus the redirects it leads to.
 * ES: Una petición más las redirecciones a las que lleva.
 */
export const navigate = async (
  context: PortalContext,
  step: string,
  method: HttpMethod,
  url: string,
  options: { readonly form?: Readonly<Record<string, string>>; readonly referer?: string } = {},
): Promise<PortalPage> => followRedirects(context, step, await portalRequest(context, step, method, url, options))

const sessionLimit = (context: PortalContext): DteError =>
  new DteError('SII_PORTAL_SESSION_LIMIT', { operation: context.operation })

const closePreviousSessions = async (context: PortalContext, step: string, page: PortalPage): Promise<boolean> => {
  if (!context.portal.closePreviousSessions) return false
  const offer = closeSessionsOffer(page.html)
  if (offer === null) return false
  const closing =
    offer.kind === 'form'
      ? portalRequest(context, `${step}.closeSessions`, 'POST', new URL(offer.action, page.url).toString(), {
          form: { ...offer.fields, ACEPTAR: 'Aceptar' },
        })
      : portalRequest(context, `${step}.closeSessions`, 'GET', new URL(offer.href, page.url).toString())
  return closing.then(
    () => true,
    (error: unknown) => {
      context.portal.logger.warn('sii portal could not close earlier sessions', { reason: errorMessage(error) })
      return false
    },
  )
}

// The limit is never repeated on its own: only after the SII itself closed the earlier sessions, and only once.
const settleSessionLimit = async (
  context: PortalContext,
  step: string,
  page: PortalPage,
  again: () => Promise<PortalPage>,
): Promise<PortalPage> => {
  if (!isSessionLimitPage(page.html)) return page
  if (!(await closePreviousSessions(context, step, page))) throw sessionLimit(context)
  const next = await again()
  if (isSessionLimitPage(next.html)) throw sessionLimit(context)
  return next
}

const login = async (context: PortalContext, referencia: string): Promise<PortalPage> => {
  const url = `${CERTIFICATE_LOGIN_URL}?${referencia}`
  const post = (): Promise<PortalPage> =>
    navigate(context, 'login', 'POST', url, { form: { referencia }, referer: url })
  context.state.loggedIn = true
  const page = await settleSessionLimit(context, 'login', await post(), post)
  if (isCertificateNotEnabledPage(page.html))
    throw new DteError('SII_PORTAL_CERT_NOT_ENABLED', {
      operation: context.operation,
      portalMessage: portalMessageOf(page.html),
    })
  if (!hasSessionCookie(context.state.cookies))
    throw new DteError('SII_PORTAL_LOGIN_FAILED', {
      operation: context.operation,
      portalMessage: portalMessageOf(page.html),
    })
  return page
}

const referenciaOf = (location: string): string | null => {
  const query = new URL(location).search.slice(1)
  if (query === '') return null
  try {
    return decodeURIComponent(query)
  } catch {
    return query
  }
}

const authenticateIfAsked = async (context: PortalContext, step: string, page: PortalPage): Promise<PortalPage> => {
  if (!asksForAuthentication(page.html) || isRepresentationChoice(page.html) || page.lastLocation === null) return page
  const referencia = referenciaOf(page.lastLocation)
  if (referencia === null) return page
  if (context.state.loggedIn) throw new DteError('SII_PORTAL_SESSION_EXPIRED', { operation: context.operation, step })
  return login(context, referencia)
}

const continueRepresentation = async (context: PortalContext, step: string, page: PortalPage): Promise<PortalPage> => {
  const link = representationContinueLink(page.html)
  return link === null ? page : navigate(context, step, 'GET', new URL(link, page.url).toString())
}

/**
 * EN: Reaches a CGI page: a fresh `GET` (the SII binds a session to it before accepting a `POST`), redirects, the session
 * limit, a login on demand when the portal asks for one, and the representation screen.
 * ES: Llega a una página CGI: un `GET` fresco (el SII le liga la sesión antes de aceptar un `POST`), redirecciones, el
 * límite de sesiones, un inicio de sesión a pedido cuando el portal lo solicita y la pantalla de representación.
 * @throws {DteError} EN: `SII_PORTAL_SESSION_LIMIT`, `SII_PORTAL_CERT_NOT_ENABLED`, `SII_PORTAL_LOGIN_FAILED`, `SII_PORTAL_SESSION_EXPIRED`, `SII_PORTAL_BLOCKED`. ES: los mismos códigos.
 */
export const ensurePage = async (context: PortalContext, step: string, url: string): Promise<PortalPage> => {
  const visit = (): Promise<PortalPage> => navigate(context, step, 'GET', url)
  const reached = await settleSessionLimit(context, step, await visit(), visit)
  const authenticated = await authenticateIfAsked(context, step, reached)
  const settled = isRepresentationChoice(authenticated.html)
    ? await continueRepresentation(context, step, authenticated)
    : authenticated
  return settled.html.includes(ANNULMENT_ENTRY_PATH) ? visit() : settled
}

/**
 * EN: Submits a form to an action resolved against `base`, following redirects.
 * ES: Envía un formulario a una acción resuelta contra `base`, siguiendo redirecciones.
 */
export const submitForm = (
  context: PortalContext,
  step: string,
  action: string,
  base: string,
  fields: Readonly<Record<string, string>>,
  referer?: string,
): Promise<PortalPage> =>
  navigate(context, step, 'POST', new URL(action, base).toString(), {
    form: fields,
    ...(referer === undefined ? {} : { referer }),
  })

/**
 * EN: Throws away the session of this operation; the entry leaves the cache when the operation ends.
 * ES: Descarta la sesión de esta operación; la entrada sale de la caché cuando termina la operación.
 */
export const forgetSession = (context: PortalContext): void => {
  context.state.cookies = {}
  context.state.loggedIn = false
}

const cacheKey = (portal: PortalClient): string => `portal:${certificateFingerprint(portal.certificate)}`

const loadCookies = async (portal: PortalClient): Promise<CookieJar> => {
  try {
    const entry = await portal.sessionCache.get(cacheKey(portal))
    return entry === null || entry.expiresAt <= portal.now().getTime() ? {} : parseCookies(entry.token)
  } catch (error) {
    portal.logger.warn('sii portal session cache failed', { reason: errorMessage(error) })
    return {}
  }
}

const saveCookies = async (portal: PortalClient, cookies: CookieJar): Promise<void> => {
  try {
    if (hasSessionCookie(cookies))
      await portal.sessionCache.set(cacheKey(portal), {
        token: serializeCookies(cookies),
        expiresAt: portal.now().getTime() + portal.sessionTtlMs,
      })
    else await portal.sessionCache.delete(cacheKey(portal))
  } catch (error) {
    portal.logger.warn('sii portal session cache failed', { reason: errorMessage(error) })
  }
}

/**
 * EN: Runs one operation with the session: takes the lock of the certificate, loads the cookies, runs, and saves them
 * with a fresh expiry. Internal flows pass the context on, so they never re-enter the lock.
 * ES: Ejecuta una operación con la sesión: toma el candado del certificado, carga las cookies, ejecuta y las guarda con
 * una vigencia nueva. Los flujos internos pasan el contexto, así nunca vuelven a entrar al candado.
 */
export const withPortalSession = <T>(
  portal: PortalClient,
  operation: string,
  overrides: CallOverrides | undefined,
  run: (context: PortalContext) => Promise<T>,
): Promise<T> =>
  portal.lock(cacheKey(portal), async () => {
    const context: PortalContext = {
      portal,
      operation,
      ...(overrides === undefined ? {} : { overrides }),
      state: { cookies: await loadCookies(portal), loggedIn: false },
    }
    try {
      return await run(context)
    } finally {
      await saveCookies(portal, context.state.cookies)
    }
  })

/**
 * EN: Runs a read, and once more with a fresh session if the first try met an expired session or a page it cannot read:
 * a cached session can pass a form `GET` and still get an interstitial page.
 * ES: Ejecuta una lectura, y una vez más con una sesión nueva si el primer intento encontró una sesión vencida o una
 * página que no puede leer: una sesión en caché puede pasar el `GET` de un formulario y aun así recibir una página intermedia.
 */
export const withFreshSessionRetry = async <T>(context: PortalContext, read: () => Promise<T>): Promise<T> => {
  try {
    return await read()
  } catch (error) {
    if (
      !isDteError(error) ||
      (error.code !== 'SII_PORTAL_SESSION_EXPIRED' && error.code !== 'SII_PORTAL_UNEXPECTED_PAGE')
    )
      throw error
    context.portal.logger.warn('sii portal retrying with a fresh session', { operation: context.operation })
    forgetSession(context)
    return read()
  }
}

/**
 * EN: What `openPortalSession` learned.
 * ES: Lo que supo `openPortalSession`.
 */
export type PortalSessionInfo = {
  /** EN: RUT the session belongs to, when the cookies say. ES: `NETSCAPE_LIVEWIRE.rut` + `.dv` — RUT al que pertenece la sesión, si las cookies lo dicen. */
  readonly userRut: SiiRut | null
  /** EN: True when a cached session was still alive. ES: True si una sesión en caché seguía viva. */
  readonly reused: boolean
}

const cachedSessionAlive = async (context: PortalContext): Promise<boolean> => {
  if (!hasSessionCookie(context.state.cookies)) return false
  const page = await portalRequest(context, 'validate', 'GET', cgiUrl('certification', 'ad_empresa1')).catch(() => null)
  return page !== null && page.status === 200 && (page.html.includes('RUT_EMP') || page.html.includes('ad_empresa'))
}

/**
 * EN: Opens a session explicitly, reusing a cached one that is still alive. The other operations do not need this: they
 * log in on demand.
 * ES: Abre una sesión de forma explícita, reutilizando una en caché que siga viva. Las demás operaciones no lo necesitan:
 * inician sesión a pedido.
 * @param portal EN: the client. ES: el cliente.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: who the session belongs to and whether it was reused. ES: de quién es la sesión y si se reutilizó.
 * @throws {DteError} EN: `SII_PORTAL_CERT_NOT_ENABLED`, `SII_PORTAL_SESSION_LIMIT`, `SII_PORTAL_LOGIN_FAILED`, `SII_PORTAL_BLOCKED`, transport codes. ES: los mismos códigos.
 */
export const openPortalSession = (portal: PortalClient, overrides?: CallOverrides): Promise<PortalSessionInfo> =>
  withPortalSession(portal, 'openPortalSession', overrides, async (context) => {
    if (await cachedSessionAlive(context)) return { userRut: sessionRut(context.state.cookies), reused: true }
    forgetSession(context)
    await portalRequest(context, 'entry', 'GET', `${CERTIFICATE_ENTRY_URL}?${PORTAL_LANDING_URL}`)
    await login(context, PORTAL_LANDING_URL)
    return { userRut: sessionRut(context.state.cookies), reused: false }
  })

/**
 * EN: Closes the session to give its slot back: tries each logout URL best-effort and always removes the cached session.
 * Which URL really ends a session is not confirmed yet; the SII expires it on its own anyway.
 * ES: Cierra la sesión para devolver su cupo: prueba cada URL de cierre sin garantía y siempre borra la sesión en caché.
 * Aún no se confirma cuál URL termina la sesión de verdad; de todos modos el SII la vence por su cuenta.
 * @param portal EN: the client. ES: el cliente.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 */
export const closePortalSession = (portal: PortalClient, overrides?: CallOverrides): Promise<void> =>
  withPortalSession(portal, 'closePortalSession', { ...overrides, retry: false }, async (context) => {
    if (hasSessionCookie(context.state.cookies)) {
      for (const url of PORTAL_LOGOUT_URLS) {
        await portalRequest(context, 'logout', 'GET', url).catch((error: unknown) => {
          portal.logger.warn('sii portal logout failed', { reason: errorMessage(error) })
        })
      }
    }
    forgetSession(context)
  })
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/pages-auth tests/portal/session --coverage=false
```

Expected: PASS, 56 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
git add src/portal/pages/auth.ts src/portal/session.ts tests/support/portal-pages.ts tests/portal/pages-auth.test.ts tests/portal/session.test.ts
git commit -m "feat: portal session with certificate login"
```

---

## Task 7: Stamping: types, quota and CAF request

The five `of_*` steps with one rejection detector on every page, the final classification, and the recovery of an already authorized range.

**Files:**
- Create: `src/portal/pages/stamping.ts`
- Create: `src/portal/stamping.ts`
- Create: `tests/portal/pages-stamping.test.ts`
- Create: `tests/portal/stamping.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/portal/pages-stamping.test.ts`:

```ts
import {
  authorizedRange,
  exceedsEffectiveMaximum,
  hardRejection,
  hasCaf,
  hasCaptcha,
  hasDownloadError,
  mentionsAuthorizedRange,
  offersDocumentType,
  quotaFields,
  stampableTypes,
  stampingBlockReason,
} from '../../src/portal/pages/stamping'
import {
  BOLETA_OPTION,
  FACTURA_OPTION,
  NO_TYPES_OPTION,
  page,
  quotaForm,
  REJECTION_PAGES,
  typeSelector,
} from '../support/portal-pages'

test.each(Object.entries(REJECTION_PAGES))('%s is detected on visible text', (rejection, html) => {
  expect(hardRejection(html)).toBe(rejection)
})

test.each([
  ['stampingBlocked', 'NO SE AUTORIZA TIMBRAJE ELECTRONICO'],
  ['inPersonRequired', 'no cumple con los requisitos y requiere la asistencia de un funcionario'],
  ['userWithoutPermission', 'no tiene permiso en empresa'],
  ['userWithoutPermission', 'no est&aacute; autorizado para operar en la empresa'],
  ['activityVerificationPending', 'no registra Verificaci&oacute;n de Actividades'],
])('%s has more than one wording', (rejection, text) => {
  expect(hardRejection(page(text))).toBe(rejection)
})

test('half of a two-part wording, a script or a normal page are not rejections', () => {
  expect(hardRejection(page('no cumple con los requisitos'))).toBeNull()
  expect(hardRejection('<script>var a="NO SE AUTORIZA TIMBRAJE"</script>')).toBeNull()
  expect(hardRejection(typeSelector(FACTURA_OPTION))).toBeNull()
})

test('the reason of a block, without the boilerplate around it', () => {
  const reason = stampingBlockReason(REJECTION_PAGES.stampingBlocked)
  expect(reason).toBe('NO AUTORIZA TIMBRAJE ELECTRÓNICA - usted tiene folios suficientes.')
  expect(stampingBlockReason(page('NO AUTORIZA TIMBRAJE hasta el final'))).toContain('hasta el final')
  expect(stampingBlockReason(page('nada'))).toBeNull()
})

test('the selector offers what it lists, and nothing with the placeholder', () => {
  const html = typeSelector(`${FACTURA_OPTION}${BOLETA_OPTION}`)
  expect(stampableTypes(html)).toEqual([
    { type: 33, name: 'FACTURA ELECTRONICA' },
    { type: 39, name: 'BOLETA ELECTRONICA' },
  ])
  expect(offersDocumentType(html, 39)).toBe(true)
  expect(offersDocumentType(html, 61)).toBe(false)
  const none = typeSelector(NO_TYPES_OPTION)
  expect(stampableTypes(none)).toEqual([])
  expect(offersDocumentType(none, 33)).toBe(false)
})

test('a page with no selector has no list and does not block', () => {
  expect(stampableTypes(page('sin selector'))).toBeNull()
  expect(offersDocumentType(page('sin selector'), 39)).toBe(true)
})

test('the quota only exists while the SII rations', () => {
  expect(quotaFields(quotaForm(5, 2))).toEqual({ maxAuthorized: 5, availableFolios: 2 })
  expect(quotaFields(quotaForm())).toEqual({ maxAuthorized: null, availableFolios: null })
  expect(quotaFields(quotaForm(5))).toEqual({ maxAuthorized: 5, availableFolios: 0 })
  expect(quotaFields(page('<input name=MAX_AUTOR value="">'))).toEqual({ maxAuthorized: null, availableFolios: null })
})

test('smaller markers', () => {
  expect(hasCaf('<AUTORIZACION version="1.0">')).toBe(true)
  expect(hasCaf('nada')).toBe(false)
  expect(hasCaptcha('<div class="g-reCAPTCHA">')).toBe(true)
  expect(hasCaptcha('nada')).toBe(false)
  expect(exceedsEffectiveMaximum('debe ser menor o igual al m&aacute;ximo')).toBe(true)
  expect(exceedsEffectiveMaximum('nada')).toBe(false)
  expect(hasDownloadError('Error DTE-OFGA-1')).toBe(true)
  expect(hasDownloadError('nada')).toBe(false)
})

test('an already authorized range, with or without its numbers', () => {
  const html = page('ya fue autorizado el rango desde 11 hasta 60')
  expect(mentionsAuthorizedRange(html)).toBe(true)
  expect(authorizedRange(html)).toEqual({ from: 11, to: 60 })
  expect(mentionsAuthorizedRange(page('ya fue autorizado'))).toBe(true)
  expect(authorizedRange(page('ya fue autorizado'))).toBeNull()
  expect(mentionsAuthorizedRange('nada')).toBe(false)
})
```

`tests/portal/stamping.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { DteError } from '../../src/errors'
import { listStampableTypes, queryFolioQuota, requestCaf } from '../../src/portal/stamping'
import { createFakeSii } from '../support/fake-sii'
import { fixturePath } from '../support/fixtures'
import { failure, MAULLIN, PALENA, signedIn, portalWith, seedSession } from '../support/portal'
import {
  AUTH_PAGE,
  BOLETA_OPTION,
  CONFIRM_PAGE,
  DOWNLOAD_PAGE,
  FACTURA_OPTION,
  generatePage,
  NO_TYPES_OPTION,
  page,
  quotaForm,
  REJECTION_PAGES,
  STAMP_ENTRY,
  typeSelector,
} from '../support/portal-pages'

const CAF_XML = readFileSync(fixturePath('caf-33.xml'), 'latin1')
const entry = { url: `${MAULLIN}/of_solicita_folios`, method: 'GET' as const, reply: { body: STAMP_ENTRY } }
const route = (
  name: string,
  ...bodies: readonly (string | { readonly status?: number; readonly body?: string } | Error)[]
) => ({
  url: `${MAULLIN}/${name}`,
  method: 'POST' as const,
  reply: bodies.map((body) => (typeof body === 'string' ? { body } : body)),
})

// The path every field-known request takes: the entry form posts to the selector page, whose real form confirms.
const FULL_FLOW = (quota: string = quotaForm(100, 0)): readonly ReturnType<typeof route>[] => [
  route('of_solicita_folios_dcto', quota),
  route('of_confirma_folio', CONFIRM_PAGE, generatePage()),
  route('of_genera_folio', DOWNLOAD_PAGE),
  route('of_genera_archivo', CAF_XML),
]

describe('requestCaf', () => {
  test('walks the five steps with the fields each one needs', async () => {
    const harness = await signedIn([entry, ...FULL_FLOW()])
    const result = await requestCaf(harness.portal, { type: 33, quantity: 80 })
    expect(result).toMatchObject({ granted: 100, maxAuthorized: 100, availableFolios: 0, recovered: false })
    expect(result.xml).toBe(CAF_XML)
    expect(result.caf.documentType).toBe(33)
    expect(harness.posted('of_solicita_folios_dcto')[0]).toMatchObject({
      KEY: '7',
      RUT_EMP: '76543210',
      DV_EMP: '3',
      COD_DOCTO: '33',
      CANTIDAD: '80',
    })
    expect(harness.posted('of_confirma_folio')[0]).toMatchObject({
      CONTROL: 'S',
      COD_DOCTO: '33',
      CANT_DOCTOS: '80',
      ACEPTAR: 'Solicitar Numeración',
    })
    expect(harness.posted('of_confirma_folio')[1]).toMatchObject({
      KEY: 'c',
      FOLIO_INICIAL: '1',
      ACEPTAR: 'Confirmar Folio Inicial',
    })
    expect(harness.posted('of_genera_folio')[0]).toMatchObject({
      CANT_DOCTOS: '50',
      FOLIO_FIN: '60',
      ACEPTAR: 'Obtener Folios',
    })
    expect(harness.posted('of_genera_archivo')[0]).toMatchObject({ FOLIO_FIN: '60', ACEPTAR: 'AQUI' })
    expect(harness.sleeps).toEqual([1001])
  })

  test('the quantity is capped at MAX_AUTOR and an unrestricted form leaves it alone', async () => {
    const capped = await signedIn([
      entry,
      route('of_solicita_folios_dcto', quotaForm(5, 2)),
      route('of_confirma_folio', CAF_XML),
    ])
    await requestCaf(capped.portal, { type: 33, quantity: 80 })
    expect(capped.posted('of_confirma_folio')[0].CANT_DOCTOS).toBe('5')
    const free = await signedIn([
      entry,
      route('of_solicita_folios_dcto', quotaForm()),
      route('of_confirma_folio', CAF_XML),
    ])
    const result = await requestCaf(free.portal, { type: 33, quantity: 80 })
    expect(free.posted('of_confirma_folio')[0].CANT_DOCTOS).toBe('80')
    expect(result).toMatchObject({ maxAuthorized: null, availableFolios: null })
  })

  test('uses production hosts in production', async () => {
    const harness = await signedIn(
      [
        { url: `${PALENA}/of_solicita_folios`, reply: { body: STAMP_ENTRY } },
        { url: `${PALENA}/of_solicita_folios_dcto`, reply: { body: quotaForm() } },
        { url: `${PALENA}/of_confirma_folio`, reply: { body: CAF_XML } },
      ],
      { environment: 'production' },
    )
    await expect(requestCaf(harness.portal, { type: 33, quantity: 1 })).resolves.toMatchObject({ granted: 100 })
  })

  test('a form that goes to the selector page first needs a second post, with CANT_DOCTOS empty', async () => {
    const start = page(
      '<script>x="of_solicita_folios_dcto"</script><form action="/cvc_cgi/dte/of_solicita_folios_dcto"><input type=hidden name=A value=1></form>',
    )
    const harness = await signedIn([
      entry,
      route(
        'of_solicita_folios_dcto',
        start,
        typeSelector(`${FACTURA_OPTION}${BOLETA_OPTION}`, '/cvc_cgi/dte/of_solicita_folios_dcto'),
        quotaForm(10, 1),
      ),
      route('of_confirma_folio', CAF_XML),
    ])
    await requestCaf(harness.portal, { type: 33, quantity: 3 })
    const [, second, third] = harness.posted('of_solicita_folios_dcto')
    expect(second).toMatchObject({ A: '1', RUT_EMP: '76543210' })
    expect(second.COD_DOCTO).toBeUndefined()
    expect(third).toMatchObject({ COD_DOCTO: '33', CANT_DOCTOS: '', CONTROL: 'S' })
  })

  test('a selector page without a form action, and a page with no selector at all, still go on', async () => {
    const start = page('<script>x="of_solicita_folios_dcto"</script>')
    const noAction = await signedIn([
      entry,
      {
        url: `${MAULLIN}/of_solicita_folios_dcto`,
        reply: [{ body: start }, { body: page('sigue /cvc_cgi/dte/of_confirma_folio') }],
      },
      route('of_confirma_folio', CAF_XML),
    ])
    await expect(requestCaf(noAction.portal, { type: 33, quantity: 3 })).resolves.toMatchObject({ granted: 100 })
  })

  test('default actions apply when the portal omits them', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/of_solicita_folios`, method: 'GET', reply: { body: page('form sin action') } },
      route('of_solicita_folios', quotaForm(5, 0)),
      route('of_confirma_folio', page('of_confirma_folio'), page('of_genera_folio')),
      route('of_genera_folio', page('of_genera_archivo')),
      route('of_genera_archivo', page('of_genera_archivo'), CAF_XML),
    ])
    await expect(requestCaf(harness.portal, { type: 33, quantity: 3 })).resolves.toMatchObject({ granted: 100 })
    expect(harness.posted('of_confirma_folio')[1]).toMatchObject({ FOLIO_INICIAL: '1' })
    expect(harness.posted('of_genera_folio')[0]).toMatchObject({ CANT_DOCTOS: '1', FOLIO_FIN: '1' })
  })

  test('the form that goes to `of_genera_folio` directly, an empty confirmation and defaults in the generation', async () => {
    const direct = await signedIn([
      entry,
      route('of_solicita_folios_dcto', quotaForm(5, 0)),
      route('of_confirma_folio', generatePage(2, 9)),
      route('of_genera_folio', CAF_XML),
    ])
    await expect(requestCaf(direct.portal, { type: 33, quantity: 3 })).resolves.toMatchObject({ granted: 100 })
    expect(direct.posted('of_genera_folio')[0]).toMatchObject({ CANT_DOCTOS: '2', FOLIO_FIN: '12' })
    const notNeeded = await signedIn([
      entry,
      route('of_solicita_folios_dcto', quotaForm(5, 0)),
      route('of_confirma_folio', CONFIRM_PAGE, CAF_XML),
    ])
    await expect(requestCaf(notNeeded.portal, { type: 33, quantity: 3 })).resolves.toMatchObject({ granted: 100 })
  })

  test('the internal download error repeats with the same fields, at growing waits', async () => {
    const harness = await signedIn([
      entry,
      ...FULL_FLOW().slice(0, 3),
      route('of_genera_archivo', page('DTE-OFGA'), page('DTE-OFGA'), CAF_XML),
    ])
    await expect(requestCaf(harness.portal, { type: 33, quantity: 5 })).resolves.toMatchObject({ granted: 100 })
    expect(harness.sleeps).toEqual([3000, 6000, 1001])
    expect(harness.posted('of_genera_archivo')[2]).toEqual(harness.posted('of_genera_archivo')[0])
  })

  test('the download error gives up after three repeats', async () => {
    const harness = await signedIn([
      entry,
      ...FULL_FLOW().slice(0, 3),
      {
        url: `${MAULLIN}/of_genera_archivo`,
        reply: { body: page('DTE-OFGA') },
      },
    ])
    expect((await failure(requestCaf(harness.portal, { type: 33, quantity: 5 }))).code).toBe(
      'SII_PORTAL_UNEXPECTED_PAGE',
    )
    expect(harness.posted('of_genera_archivo')).toHaveLength(4)
  })

  test('below minQuantity nothing is stamped', async () => {
    const harness = await signedIn([entry, route('of_solicita_folios_dcto', quotaForm(2, 6))])
    const error = await failure(requestCaf(harness.portal, { type: 33, quantity: 5, minQuantity: 5 }))
    expect(error.details).toMatchObject({
      rejection: 'quotaInsufficient',
      maxAuthorized: 2,
      availableFolios: 6,
      type: 33,
    })
    expect(harness.posted('of_confirma_folio')).toEqual([])
  })

  test('minQuantity within the maximum goes on, and no maximum never stops it', async () => {
    const within = await signedIn([
      entry,
      route('of_solicita_folios_dcto', quotaForm(5, 0)),
      route('of_confirma_folio', CAF_XML),
    ])
    await expect(requestCaf(within.portal, { type: 33, quantity: 5, minQuantity: 5 })).resolves.toBeDefined()
    const free = await signedIn([
      entry,
      route('of_solicita_folios_dcto', quotaForm()),
      route('of_confirma_folio', CAF_XML),
    ])
    await expect(requestCaf(free.portal, { type: 33, quantity: 5, minQuantity: 5 })).resolves.toBeDefined()
  })

  test.each(Object.entries(REJECTION_PAGES))('%s at the first post', async (rejection, html) => {
    const harness = await signedIn([entry, route('of_solicita_folios_dcto', html)])
    const error = await failure(requestCaf(harness.portal, { type: 33, quantity: 5 }))
    expect(error.code).toBe('SII_PORTAL_REJECTED')
    expect(error.details).toMatchObject({ rejection, type: 33, operation: 'requestCaf' })
    expect(error.details.portalMessage).toEqual(expect.any(String))
  })

  test('a block keeps the reason the SII wrote', async () => {
    const harness = await signedIn([entry, route('of_solicita_folios_dcto', REJECTION_PAGES.stampingBlocked)])
    const error = await failure(requestCaf(harness.portal, { type: 33, quantity: 5 }))
    expect(error.details.portalMessage).toBe('NO AUTORIZA TIMBRAJE ELECTRÓNICA - usted tiene folios suficientes.')
  })

  test('a rejection can arrive at a later step, even with COD_DOCTO in its script', async () => {
    const start = page('<script>x="of_solicita_folios_dcto"</script>')
    const atSecond = await signedIn([
      entry,
      route('of_solicita_folios_dcto', start, REJECTION_PAGES.companyNotAuthorized),
    ])
    expect((await failure(requestCaf(atSecond.portal, { type: 33, quantity: 5 }))).details.rejection).toBe(
      'companyNotAuthorized',
    )
    const selector = typeSelector(FACTURA_OPTION, '/cvc_cgi/dte/of_solicita_folios_dcto')
    const atThird = await signedIn([
      entry,
      route('of_solicita_folios_dcto', start, selector, REJECTION_PAGES.optionNotAuthorized),
    ])
    expect((await failure(requestCaf(atThird.portal, { type: 33, quantity: 5 }))).details.rejection).toBe(
      'optionNotAuthorized',
    )
    const atEnd = await signedIn([
      entry,
      route('of_solicita_folios_dcto', quotaForm()),
      route('of_confirma_folio', REJECTION_PAGES.personWithPendingIssues),
    ])
    expect((await failure(requestCaf(atEnd.portal, { type: 33, quantity: 5 }))).details.rejection).toBe(
      'personWithPendingIssues',
    )
  })

  test('a type the selector does not offer is refused before asking, also with the placeholder', async () => {
    const start = page('<script>x="of_solicita_folios_dcto"</script>')
    const harness = await signedIn([
      entry,
      route('of_solicita_folios_dcto', start, typeSelector(NO_TYPES_OPTION, '/x')),
    ])
    const error = await failure(requestCaf(harness.portal, { type: 39, quantity: 5 }))
    expect(error.details).toMatchObject({ rejection: 'typeNotEnabled', type: 39 })
    expect(harness.posted('of_solicita_folios_dcto')).toHaveLength(2)
  })

  test('captcha and the firewall are blocks', async () => {
    const captcha = await signedIn([entry, route('of_solicita_folios_dcto', page('<div class="g-recaptcha"></div>'))])
    expect((await failure(requestCaf(captcha.portal, { type: 33, quantity: 5 }))).code).toBe('SII_PORTAL_BLOCKED')
    const firewall = await signedIn([entry, route('of_solicita_folios_dcto', { status: 403 })])
    expect((await failure(requestCaf(firewall.portal, { type: 33, quantity: 5 }))).code).toBe('SII_PORTAL_BLOCKED')
  })

  test('an authentication page at any point forgets the session', async () => {
    const atEntry = await signedIn([{ url: `${MAULLIN}/of_solicita_folios`, reply: { body: AUTH_PAGE } }])
    expect((await failure(requestCaf(atEntry.portal, { type: 33, quantity: 5 }))).code).toBe(
      'SII_PORTAL_SESSION_EXPIRED',
    )
    expect(await atEntry.portal.sessionCache.get(`portal:x`)).toBeNull()
    const later = await signedIn([entry, route('of_solicita_folios_dcto', AUTH_PAGE)])
    expect((await failure(requestCaf(later.portal, { type: 33, quantity: 5 }))).code).toBe('SII_PORTAL_SESSION_EXPIRED')
    const leftover = await signedIn([entry, route('of_solicita_folios_dcto', page('ir a autInicioDTE.cgi'))])
    expect((await failure(requestCaf(leftover.portal, { type: 33, quantity: 5 }))).code).toBe(
      'SII_PORTAL_SESSION_EXPIRED',
    )
  })

  describe('the effective maximum', () => {
    const exceeded = page('debe ser menor o igual al m&aacute;ximo autorizado')
    const upToConfirm = [entry, route('of_solicita_folios_dcto', quotaForm(10, 0))]

    test('asks once more for one folio', async () => {
      const harness = await signedIn([
        entry,
        route('of_solicita_folios_dcto', quotaForm(10, 0), quotaForm(10, 0)),
        route('of_confirma_folio', exceeded, CAF_XML),
      ])
      await expect(requestCaf(harness.portal, { type: 33, quantity: 8 })).resolves.toMatchObject({ granted: 100 })
      expect(harness.posted('of_confirma_folio')[1].CANT_DOCTOS).toBe('1')
    })

    test('with minQuantity above 1 it stops, and with 1 folio it says so', async () => {
      const strict = await signedIn([...upToConfirm, route('of_confirma_folio', exceeded)])
      expect(
        (await failure(requestCaf(strict.portal, { type: 33, quantity: 8, minQuantity: 8 }))).details.rejection,
      ).toBe('quotaInsufficient')
      const one = await signedIn([...upToConfirm, route('of_confirma_folio', exceeded)])
      expect((await failure(requestCaf(one.portal, { type: 33, quantity: 1 }))).details.rejection).toBe('quotaExceeded')
      const minOne = await signedIn([
        entry,
        route('of_solicita_folios_dcto', quotaForm(10, 0), quotaForm(10, 0)),
        route('of_confirma_folio', exceeded, CAF_XML),
      ])
      await expect(requestCaf(minOne.portal, { type: 33, quantity: 8, minQuantity: 1 })).resolves.toBeDefined()
    })
  })

  describe('a range already authorized', () => {
    const flowTo = (answer: string) => [
      entry,
      route('of_solicita_folios_dcto', quotaForm(10, 0)),
      route('of_confirma_folio', generatePage()),
      route('of_genera_folio', answer),
    ]
    const message = page('ya fue autorizado el rango desde 11 hasta 60')

    test('is downloaded again when the SII still answers', async () => {
      const harness = await signedIn([...flowTo(message), route('of_genera_archivo', CAF_XML)])
      await expect(requestCaf(harness.portal, { type: 33, quantity: 5 })).resolves.toMatchObject({ recovered: true })
      expect(harness.posted('of_genera_archivo')[0]).toMatchObject({
        RUT_EMP: '76543210',
        COD_DOCTO: '33',
        FOLIO_INI: '11',
        FOLIO_FIN: '60',
        FECHA: '2026-11-15',
        ACEPTAR: 'AQUI',
      })
    })

    test.each([
      ['another page', page('nada')],
      ['a transport failure', new DteError('TRANSPORT_FAILED')],
    ])('is a rejection with the range when the recovery meets %s', async (_name, answer) => {
      const harness = await signedIn([...flowTo(message), route('of_genera_archivo', answer)])
      const error = await failure(requestCaf(harness.portal, { type: 33, quantity: 5 }))
      expect(error.details).toMatchObject({ rejection: 'rangeAlreadyAuthorized', range: { from: 11, to: 60 } })
    })

    test('a failure of another kind in the recovery still reaches the caller', async () => {
      const harness = await signedIn([...flowTo(message), route('of_genera_archivo', new Error('bug'))])
      await expect(requestCaf(harness.portal, { type: 33, quantity: 5 })).rejects.toThrow('bug')
    })

    test('without its numbers there is nothing to recover', async () => {
      const harness = await signedIn(flowTo(page('ya fue autorizado')))
      const error = await failure(requestCaf(harness.portal, { type: 33, quantity: 5 }))
      expect(error.details).toMatchObject({ rejection: 'rangeAlreadyAuthorized', range: null })
    })
  })

  test('anything else is an unexpected page with what it said', async () => {
    const harness = await signedIn([entry, route('of_solicita_folios_dcto', page('Sistema en mantencion'))])
    const error = await failure(requestCaf(harness.portal, { type: 33, quantity: 5 }))
    expect(error.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect(error.details.portalMessage).toContain('Sistema en mantencion')
  })

  test('input validation', async () => {
    const harness = await signedIn([])
    expect((await failure(requestCaf(harness.portal, { type: 999 as never, quantity: 1 }))).code).toBe(
      'INVALID_DOCUMENT_TYPE',
    )
    expect((await failure(requestCaf(harness.portal, { type: 33, quantity: 0 }))).details).toEqual({
      field: 'quantity',
    })
    expect((await failure(requestCaf(harness.portal, { type: 33, quantity: 1, minQuantity: 0.5 }))).details).toEqual({
      field: 'minQuantity',
    })
    expect(harness.fake.requests).toHaveLength(0)
    expect((await failure(requestCaf({ ...harness.portal, companyRut: null }, { type: 33, quantity: 1 }))).code).toBe(
      'MISSING_FIELD',
    )
    expect(
      (
        await requestCaf(
          { ...harness.portal, transport: createFakeSii([entry, ...FULL_FLOW()]).transport },
          { type: 33, quantity: 1, companyRut: '10000004-0' },
        )
      ).granted,
    ).toBe(100)
  })
})

describe('queryFolioQuota', () => {
  test('reads the form and stops before stamping', async () => {
    const harness = await signedIn([entry, route('of_solicita_folios_dcto', quotaForm(3, 1))])
    await expect(queryFolioQuota(harness.portal, { type: 33 })).resolves.toEqual({
      unrestricted: false,
      blocked: false,
      maxAuthorized: 3,
      availableFolios: 1,
    })
    expect(harness.urls().some((url) => url.includes('of_confirma_folio'))).toBe(false)
    expect(harness.posted('of_solicita_folios_dcto')[0].CANTIDAD).toBe('1')
  })

  test('no fields means unrestricted, but the block page also has none', async () => {
    const free = await signedIn([entry, route('of_solicita_folios_dcto', quotaForm())])
    await expect(queryFolioQuota(free.portal, { type: 33 })).resolves.toMatchObject({
      unrestricted: true,
      blocked: false,
    })
    const blocked = await signedIn([entry, route('of_solicita_folios_dcto', REJECTION_PAGES.stampingBlocked)])
    await expect(queryFolioQuota(blocked.portal, { type: 33 })).resolves.toEqual({
      unrestricted: false,
      blocked: true,
      maxAuthorized: null,
      availableFolios: null,
    })
  })

  test('another rejection is never reported as unrestricted', async () => {
    const harness = await signedIn([entry, route('of_solicita_folios_dcto', REJECTION_PAGES.companyNotAuthorized)])
    expect((await failure(queryFolioQuota(harness.portal, { type: 33 }))).details.rejection).toBe(
      'companyNotAuthorized',
    )
  })

  test('a page that is no form, an expired session and a bad type', async () => {
    const lost = await signedIn([entry, route('of_solicita_folios_dcto', page('nada'))])
    expect((await failure(queryFolioQuota(lost.portal, { type: 33 }))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    const expired = await signedIn([{ url: `${MAULLIN}/of_solicita_folios`, reply: { body: AUTH_PAGE } }])
    expect((await failure(queryFolioQuota(expired.portal, { type: 33 }))).code).toBe('SII_PORTAL_SESSION_EXPIRED')
    expect((await failure(queryFolioQuota(expired.portal, { type: 1 as never }))).code).toBe('INVALID_DOCUMENT_TYPE')
  })
})

describe('listStampableTypes', () => {
  test('the entry form leads to the selector', async () => {
    const harness = await signedIn([
      entry,
      route('of_solicita_folios_dcto', typeSelector(`${FACTURA_OPTION}${BOLETA_OPTION}`)),
    ])
    await expect(listStampableTypes(harness.portal)).resolves.toEqual([
      { type: 33, name: 'FACTURA ELECTRONICA' },
      { type: 39, name: 'BOLETA ELECTRONICA' },
    ])
    expect(harness.posted('of_solicita_folios_dcto')[0]).toEqual({ KEY: '7', RUT_EMP: '76543210', DV_EMP: '3' })
  })

  test('nothing offered is an empty list; a form with no action goes to the selector page', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/of_solicita_folios`, reply: { body: page('sin form') } },
      route('of_solicita_folios_dcto', typeSelector(NO_TYPES_OPTION)),
    ])
    await expect(listStampableTypes(harness.portal, { companyRut: '10000004-0' })).resolves.toEqual([])
  })

  test('an error page is not "no types"', async () => {
    const harness = await signedIn([entry, route('of_solicita_folios_dcto', page('LIBRUD-OFSF-DTE-3-1-02'))])
    expect((await failure(listStampableTypes(harness.portal))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
  })

  test('rejections and expired sessions say so', async () => {
    const rejected = await signedIn([entry, route('of_solicita_folios_dcto', REJECTION_PAGES.optionNotAuthorized)])
    expect((await failure(listStampableTypes(rejected.portal))).details.rejection).toBe('optionNotAuthorized')
    const expired = await signedIn([{ url: `${MAULLIN}/of_solicita_folios`, reply: { body: AUTH_PAGE } }])
    expect((await failure(listStampableTypes(expired.portal))).code).toBe('SII_PORTAL_SESSION_EXPIRED')
  })

  test('a fresh client logs in on demand', async () => {
    const harness = portalWith([entry, route('of_solicita_folios_dcto', typeSelector(NO_TYPES_OPTION))])
    await seedSession(harness.portal)
    await expect(listStampableTypes(harness.portal)).resolves.toEqual([])
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/pages-stamping tests/portal/stamping --coverage=false
```

Expected: FAIL, because the code below does not exist yet.

- [ ] **Step 3: Write the implementation**

`src/portal/pages/stamping.ts`:

```ts
import type { PortalRejection } from '../../catalogs/portal'
import { inputValues, selectOptions, visibleText } from '../html'

// The rejection pages are long and the SII writes accents as entities: every detector reads the same decoded text. A
// rejection can arrive at any step of the flow, so there is one detector and every step runs it.
const pageText = (html: string): string => visibleText(html, 4000)

const STAMPING_BLOCK = /NO\s+(SE\s+)?AUTORIZA\s+TIMBRAJE/i
const REJECTIONS: readonly { readonly rejection: PortalRejection; readonly matches: (text: string) => boolean }[] = [
  { rejection: 'stampingBlocked', matches: (text) => STAMPING_BLOCK.test(text) },
  {
    rejection: 'inPersonRequired',
    matches: (text) =>
      /deber.{0,8}\s*presentarse\s+en\s+la\s+oficina\s+del\s+SII/i.test(text) ||
      (/no\s+cumple\s+con\s+los\s+requisitos/i.test(text) && /asistencia\s+de\s+un\s+funcionario/i.test(text)),
  },
  {
    rejection: 'companyNotAuthorized',
    matches: (text) => /(la\s+)?empresa\s+no\s+est.{0,8}\s*autorizada\s+para\s+operar/i.test(text),
  },
  {
    rejection: 'optionNotAuthorized',
    matches: (text) => /no\s+est.{0,8}\s*autorizado\s+para\s+ingresar\s+a\s+esta\s+opci.{0,8}n/i.test(text),
  },
  {
    rejection: 'userWithoutPermission',
    matches: (text) =>
      /no\s+tiene\s+permiso\s+en\s+(la\s+)?empresa|usuario\s+no\s+autorizado\s+para\s+(la\s+)?empresa|no\s+est.{0,8}\s*autorizado\s+para\s+operar\s+en\s+la\s+empresa/i.test(
        text,
      ),
  },
  { rejection: 'personWithPendingIssues', matches: (text) => /situaciones\s+pendientes\s+con\s+el\s+SII/i.test(text) },
  {
    rejection: 'activityVerificationPending',
    matches: (text) => /no\s+registra\s+Verificaci.{0,8}n\s+de\s+Actividades/i.test(text),
  },
]

/**
 * EN: The rejection a page states, or null. These pages make the rest of the flow pointless.
 * ES: El rechazo que declara una página, o null. Estas páginas vuelven inútil el resto del flujo.
 */
export const hardRejection = (html: string): PortalRejection | null => {
  const text = pageText(html)
  return REJECTIONS.find((entry) => entry.matches(text))?.rejection ?? null
}

/**
 * EN: The reason the SII writes on the block page, without its boilerplate; null when there is none.
 * ES: El motivo que el SII escribe en la página de bloqueo, sin su texto de relleno; null si no hay.
 */
export const stampingBlockReason = (html: string): string | null =>
  /(NO\s+(?:SE\s+)?AUTORIZA\s+TIMBRAJE[\s\S]{0,600}?)(?:\s+Si necesita mas informacion|$)/i
    .exec(pageText(html))?.[1]
    ?.trim() ?? null

/**
 * EN: A document type the portal offers for stamping.
 * ES: Un tipo de documento que el portal ofrece para timbraje.
 */
export type StampableType = {
  /** EN: SII document type. ES: `COD_DOCTO` — Código del tipo de documento. */
  readonly type: number
  /** EN: Name as the portal shows it. ES: Nombre tal como lo muestra el portal. */
  readonly name: string
}

/**
 * EN: The types of the `COD_DOCTO` selector, without the `-1 SIN DOCUMENTOS` placeholder; null when the page has no selector.
 * ES: Los tipos del selector `COD_DOCTO`, sin el relleno `-1 SIN DOCUMENTOS`; null si la página no tiene selector.
 */
export const stampableTypes = (html: string): readonly StampableType[] | null => {
  const options = selectOptions(html, 'COD_DOCTO')
  return options === null
    ? null
    : options
        .filter((option) => /^\d+$/.test(option.value))
        .map((option) => ({ type: Number(option.value), name: option.label }))
}

/**
 * EN: True when the selector offers the type. A page with no selector to inspect does not block: only a selector can
 * say a type is missing.
 * ES: True si el selector ofrece el tipo. Una página sin selector que inspeccionar no bloquea: solo un selector puede
 * decir que falta un tipo.
 */
export const offersDocumentType = (html: string, type: number): boolean =>
  stampableTypes(html)?.some((option) => option.type === type) ?? true

/**
 * EN: The quota of a form: both null when the SII is not rationing this type, because only then it publishes them.
 * ES: El cupo de un formulario: ambos null si el SII no está racionando este tipo, porque solo entonces los publica.
 */
export type QuotaFields = {
  /** EN: Most folios the SII authorizes now. ES: `MAX_AUTOR` — Máximo de folios que el SII autoriza ahora. */
  readonly maxAuthorized: number | null
  /** EN: Folios stamped and unused. ES: `FOLIOS_DISP` — Folios timbrados sin utilizar. */
  readonly availableFolios: number | null
}

const positiveInteger = (value: string | undefined): number | null => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * EN: Reads `MAX_AUTOR` and `FOLIOS_DISP`.
 * ES: Lee `MAX_AUTOR` y `FOLIOS_DISP`.
 */
export const quotaFields = (html: string): QuotaFields => {
  const fields = inputValues(html)
  const maxAuthorized = positiveInteger(fields.MAX_AUTOR)
  return { maxAuthorized, availableFolios: maxAuthorized === null ? null : (positiveInteger(fields.FOLIOS_DISP) ?? 0) }
}

/**
 * EN: The page holds a CAF.
 * ES: La página trae un CAF.
 */
export const hasCaf = (html: string): boolean => html.includes('<AUTORIZACION')

/**
 * EN: A captcha stands in the way of the flow.
 * ES: Un captcha se interpone en el flujo.
 */
export const hasCaptcha = (html: string): boolean => /recaptcha/i.test(html)

/**
 * EN: The effective maximum, lower than the form's when the day's quota is partly used, was exceeded.
 * ES: Se excedió el máximo efectivo, menor que el del formulario cuando el cupo del día está parcialmente usado.
 */
export const exceedsEffectiveMaximum = (html: string): boolean => html.includes('menor o igual al m')

/**
 * EN: The SII already authorized this range in an earlier request.
 * ES: El SII ya autorizó este rango en una solicitud anterior.
 */
export const mentionsAuthorizedRange = (html: string): boolean => html.includes('ya fue autorizado')

/**
 * EN: The range in that message, or null when it does not say.
 * ES: El rango de ese mensaje, o null si no lo dice.
 */
export const authorizedRange = (html: string): { readonly from: number; readonly to: number } | null => {
  const match = /ya fue autorizado el rango desde\s+(\d+)\s+hasta\s+(\d+)/i.exec(html)
  return match === null ? null : { from: Number(match[1]), to: Number(match[2]) }
}

/**
 * EN: The internal SII error of the download step, with the range already registered: it clears on its own.
 * ES: El error interno del SII en el paso de descarga, con el rango ya registrado: se resuelve solo.
 */
export const hasDownloadError = (html: string): boolean => html.includes('DTE-OFGA')
```

`src/portal/stamping.ts`:

```ts
import { parseCaf, type Caf } from '../caf/parse'
import { isDocumentType, type DocumentType } from '../catalogs/document-types'
import { cgiUrl, type PortalRejection } from '../catalogs/portal'
import { DteError, isDteError } from '../errors'
import type { CallOverrides } from '../sii/client'
import { chileDate } from '../time/chile'
import { resolvePortalCompany, type PortalClient } from './client'
import { formAction, inputValues } from './html'
import { asksForAuthentication, looksLikeLoginRedirect, portalMessageOf } from './pages/auth'
import {
  authorizedRange,
  exceedsEffectiveMaximum,
  hardRejection,
  hasCaf,
  hasCaptcha,
  hasDownloadError,
  mentionsAuthorizedRange,
  offersDocumentType,
  quotaFields,
  stampableTypes,
  stampingBlockReason,
  type QuotaFields,
  type StampableType,
} from './pages/stamping'
import {
  companyFields,
  ensurePage,
  forgetSession,
  rejected,
  submitForm,
  unexpectedPage,
  withPortalSession,
  type PortalContext,
  type PortalPage,
} from './session'

const ENTRY = 'of_solicita_folios'
const SELECTOR = 'of_solicita_folios_dcto'
const CONFIRM = 'of_confirma_folio'
const GENERATE = 'of_genera_folio'
const DOWNLOAD = 'of_genera_archivo'
const PATH = '/cvc_cgi/dte/'
// Requests on one certificate stay this far apart, without keeping any state: the lock is held for this long afterwards.
const REQUEST_SPACING_MS = 1001
const DOWNLOAD_RETRY_STEP_MS = 3000
const DOWNLOAD_RETRIES = 3

/**
 * EN: A CAF obtained from the portal. `xml` holds the CAF private key: store it as a secret.
 * ES: Un CAF obtenido del portal. `xml` contiene la llave privada del CAF: guárdalo como un secreto.
 */
export type ObtainedCaf = {
  /** EN: The file as the SII served it. ES: `AUTORIZACION` — El archivo tal como lo entregó el SII. */
  readonly xml: string
  /** EN: The file parsed. ES: El archivo parseado. */
  readonly caf: Caf
  /** EN: Folios it covers. ES: Folios que cubre. */
  readonly granted: number
  /** EN: Most folios the SII authorized, or null when it was not rationing. ES: `MAX_AUTOR` — Máximo que autorizó el SII, o null si no estaba racionando. */
  readonly maxAuthorized: number | null
  /** EN: Stamped and unused folios, or null when it was not rationing. ES: `FOLIOS_DISP` — Folios timbrados sin usar, o null si no estaba racionando. */
  readonly availableFolios: number | null
  /** EN: It came back through "ya fue autorizado" or the re-download flow. ES: Volvió por "ya fue autorizado" o por la reobtención. */
  readonly recovered: boolean
}

/**
 * EN: The stamping quota of a document type.
 * ES: El cupo de timbraje de un tipo de documento.
 */
export type FolioQuota = QuotaFields & {
  /** EN: The SII is not rationing this type. ES: El SII no está racionando este tipo. */
  readonly unrestricted: boolean
  /** EN: The SII authorizes nothing: "NO SE AUTORIZA TIMBRAJE". ES: El SII no autoriza nada: "NO SE AUTORIZA TIMBRAJE". */
  readonly blocked: boolean
}

/**
 * EN: Input of `requestCaf`.
 * ES: Entrada de `requestCaf`.
 */
export type CafRequestInput = {
  /** EN: Document type. ES: `COD_DOCTO` — Tipo de documento. */
  readonly type: DocumentType
  /** EN: Folios wanted. ES: `CANTIDAD` — Folios pedidos. */
  readonly quantity: number
  /** EN: Least acceptable: below it nothing is stamped, because a short range goes unused and lowers the next maximum. ES: Mínimo aceptable: bajo él no se timbra, porque un rango corto queda sin usar y baja el próximo máximo. */
  readonly minQuantity?: number
  /** EN: Company RUT; the client's by default. ES: `RUT_EMP` + `DV_EMP` — RUT de la empresa; por defecto el del cliente. */
  readonly companyRut?: string
}

type Company = ReturnType<typeof companyFields>

const at = (context: PortalContext, page: string): string => cgiUrl(context.portal.environment, page)

const sessionExpired = (context: PortalContext, step: string): DteError => {
  forgetSession(context)
  return new DteError('SII_PORTAL_SESSION_EXPIRED', { operation: context.operation, step })
}

const mustAuthenticate = (html: string): boolean => asksForAuthentication(html) || looksLikeLoginRedirect(html)

const assertDocumentType = (type: unknown): void => {
  if (!isDocumentType(type)) throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type' })
}

const assertQuantity = (value: number, field: string): void => {
  if (!Number.isInteger(value) || value < 1) throw new DteError('INVALID_OPTION', { field })
}

const startRequest = async (
  context: PortalContext,
  type: number,
  quantity: number,
  company: Company,
): Promise<PortalPage> => {
  const form = await ensurePage(context, ENTRY, at(context, ENTRY))
  if (mustAuthenticate(form.html)) return form
  return submitForm(context, `${ENTRY}.post`, formAction(form.html) ?? `${PATH}${ENTRY}`, form.url, {
    ...inputValues(form.html),
    ...company,
    COD_DOCTO: String(type),
    CANTIDAD: String(quantity),
  })
}

type QuotaStep = { readonly page: PortalPage; readonly atQuota: boolean }

// The word `of_solicita_folios_dcto` may only be inside a script: the real form action is what says where to go. With
// the selector, `CANT_DOCTOS` goes empty: a number there makes the SII omit `MAX_AUTOR` and `CONTROL` and reject later.
const reachQuotaForm = async (
  context: PortalContext,
  page: PortalPage,
  type: number,
  company: Company,
): Promise<QuotaStep> => {
  if (hardRejection(page.html) !== null) return { page, atQuota: false }
  const action = formAction(page.html)
  if (action?.includes(CONFIRM)) return { page, atQuota: true }
  if (!page.html.includes(SELECTOR)) return { page, atQuota: false }
  const second = await submitForm(context, SELECTOR, action ?? `${PATH}${SELECTOR}`, page.url, {
    ...inputValues(page.html),
    ...company,
  })
  if (hardRejection(second.html) !== null) return { page: second, atQuota: false }
  if (!second.html.includes('COD_DOCTO')) return { page: second, atQuota: true }
  if (!offersDocumentType(second.html, type))
    throw rejected(context, 'typeNotEnabled', { type, portalMessage: portalMessageOf(second.html) })
  const third = await submitForm(context, `${SELECTOR}.type`, `${PATH}${SELECTOR}`, second.url, {
    ...inputValues(second.html),
    ...company,
    COD_DOCTO: String(type),
    CANT_DOCTOS: '',
  })
  return { page: third, atQuota: hardRejection(third.html) === null }
}

const retryDownload = async (
  context: PortalContext,
  page: PortalPage,
  action: string,
  fields: Readonly<Record<string, string>>,
  attempt: number,
): Promise<PortalPage> => {
  if (hasCaf(page.html) || !hasDownloadError(page.html) || attempt > DOWNLOAD_RETRIES) return page
  await context.portal.sleep(attempt * DOWNLOAD_RETRY_STEP_MS, context.overrides?.signal)
  const next = await submitForm(context, `${DOWNLOAD}.retry`, action, page.url, fields)
  return retryDownload(context, next, action, fields, attempt + 1)
}

const download = async (context: PortalContext, page: PortalPage): Promise<PortalPage> => {
  const action = formAction(page.html) ?? `${PATH}${DOWNLOAD}`
  const fields = { ...inputValues(page.html), ACEPTAR: 'AQUI' }
  const first = await submitForm(context, DOWNLOAD, action, page.url, fields)
  const settled = await retryDownload(context, first, action, fields, 1)
  if (hasCaf(settled.html) || !settled.html.includes(DOWNLOAD)) return settled
  return submitForm(context, `${DOWNLOAD}.extra`, formAction(settled.html) ?? `${PATH}${DOWNLOAD}`, settled.url, {
    ...inputValues(settled.html),
    ACEPTAR: 'AQUI',
  })
}

const generate = async (context: PortalContext, page: PortalPage): Promise<PortalPage> => {
  const fields = inputValues(page.html)
  const maximum = Number.parseInt(fields.MAX_AUTOR || '999', 10)
  const first = Number.parseInt(fields.FOLIO_INI || '1', 10)
  const quantity = Math.min(Number.parseInt(fields.CANT_DOCTOS || '1', 10), maximum)
  const answer = await submitForm(context, GENERATE, formAction(page.html) ?? `${PATH}${GENERATE}`, page.url, {
    ...fields,
    CANT_DOCTOS: String(quantity),
    FOLIO_FIN: String(first + quantity - 1),
    ACEPTAR: 'Obtener Folios',
  })
  if (mentionsAuthorizedRange(answer.html) || hasCaf(answer.html) || !answer.html.includes(DOWNLOAD)) return answer
  return download(context, answer)
}

const confirm = async (context: PortalContext, page: PortalPage): Promise<PortalPage> => {
  const fields = inputValues(page.html)
  const answer = await submitForm(
    context,
    `${CONFIRM}.initial`,
    formAction(page.html) ?? `${PATH}${CONFIRM}`,
    page.url,
    {
      ...fields,
      FOLIO_INICIAL: fields.FOLIO_INICIAL || '1',
      ACEPTAR: 'Confirmar Folio Inicial',
    },
  )
  return answer.html.includes(GENERATE) ? generate(context, answer) : answer
}

const stamp = async (
  context: PortalContext,
  page: PortalPage,
  input: { readonly type: number; readonly quantity: number },
  quota: QuotaFields,
  company: Company,
): Promise<PortalPage> => {
  const quantity = quota.maxAuthorized === null ? input.quantity : Math.min(input.quantity, quota.maxAuthorized)
  const answer = await submitForm(context, CONFIRM, formAction(page.html) ?? `${PATH}${CONFIRM}`, page.url, {
    ...inputValues(page.html),
    ...company,
    COD_DOCTO: String(input.type),
    CANT_DOCTOS: String(quantity),
    ACEPTAR: 'Solicitar Numeración',
  })
  if (answer.html.includes(CONFIRM)) return confirm(context, answer)
  return answer.html.includes(GENERATE) ? generate(context, answer) : answer
}

const obtained = (page: PortalPage, quota: QuotaFields, recovered: boolean): ObtainedCaf => {
  const caf = parseCaf(page.html)
  return {
    xml: page.html,
    caf,
    granted: caf.range.to - caf.range.from + 1,
    maxAuthorized: quota.maxAuthorized,
    availableFolios: quota.availableFolios,
    recovered,
  }
}

const rejectionDetails = (rejection: PortalRejection, html: string, type: number, quota: QuotaFields) => ({
  type,
  portalMessage: (rejection === 'stampingBlocked' ? stampingBlockReason(html) : null) ?? portalMessageOf(html),
  maxAuthorized: quota.maxAuthorized,
  availableFolios: quota.availableFolios,
})

// The SII has the range and only the file was lost: a late download often still answers it.
const recoverAuthorizedRange = async (
  context: PortalContext,
  page: PortalPage,
  type: number,
  quota: QuotaFields,
  company: Company,
): Promise<ObtainedCaf> => {
  const range = authorizedRange(page.html)
  const refusal = rejected(context, 'rangeAlreadyAuthorized', {
    type,
    range,
    portalMessage: portalMessageOf(page.html),
  })
  if (range === null) throw refusal
  const answer = await submitForm(context, `${DOWNLOAD}.recover`, at(context, DOWNLOAD), page.url, {
    ...company,
    COD_DOCTO: String(type),
    FOLIO_INI: String(range.from),
    FOLIO_FIN: String(range.to),
    FECHA: chileDate(context.portal.now()),
    ACEPTAR: 'AQUI',
  }).catch((error: unknown) => {
    context.portal.logger.warn('sii portal could not recover an authorized range', { operation: context.operation })
    if (isDteError(error)) return null
    throw error
  })
  if (answer === null || !hasCaf(answer.html)) throw refusal
  return obtained(answer, quota, true)
}

const concludeRequest = async (
  context: PortalContext,
  page: PortalPage,
  input: CafRequestInput,
  quota: QuotaFields,
  company: Company,
): Promise<ObtainedCaf> => {
  const { html } = page
  if (hasCaptcha(html))
    throw new DteError('SII_PORTAL_BLOCKED', {
      operation: context.operation,
      step: CONFIRM,
      httpStatus: page.status,
      portalMessage: portalMessageOf(html),
    })
  if (hasCaf(html)) return obtained(page, quota, false)
  const rejection = hardRejection(html)
  if (rejection !== null) throw rejected(context, rejection, rejectionDetails(rejection, html, input.type, quota))
  if (asksForAuthentication(html)) throw sessionExpired(context, CONFIRM)
  if (exceedsEffectiveMaximum(html)) {
    if (input.minQuantity !== undefined && input.minQuantity > 1)
      throw rejected(context, 'quotaInsufficient', rejectionDetails('quotaInsufficient', html, input.type, quota))
    if (input.quantity > 1) return runRequest(context, { ...input, quantity: 1 }, company)
    throw rejected(context, 'quotaExceeded', rejectionDetails('quotaExceeded', html, input.type, quota))
  }
  if (mentionsAuthorizedRange(html)) return recoverAuthorizedRange(context, page, input.type, quota, company)
  if (looksLikeLoginRedirect(html)) throw sessionExpired(context, CONFIRM)
  throw unexpectedPage(context, CONFIRM, html)
}

const runRequest = async (context: PortalContext, input: CafRequestInput, company: Company): Promise<ObtainedCaf> => {
  const started = await startRequest(context, input.type, input.quantity, company)
  const { page, atQuota } = await reachQuotaForm(context, started, input.type, company)
  if (!atQuota) return concludeRequest(context, page, input, { maxAuthorized: null, availableFolios: null }, company)
  const quota = quotaFields(page.html)
  if (input.minQuantity !== undefined && quota.maxAuthorized !== null && quota.maxAuthorized < input.minQuantity)
    throw rejected(context, 'quotaInsufficient', rejectionDetails('quotaInsufficient', page.html, input.type, quota))
  return concludeRequest(context, await stamp(context, page, input, quota, company), input, quota, company)
}

/**
 * EN: `requestCaf` inside a session already held, for the composite flows.
 * ES: `requestCaf` dentro de una sesión ya tomada, para los flujos compuestos.
 */
export const requestCafInSession = async (context: PortalContext, input: CafRequestInput): Promise<ObtainedCaf> => {
  assertDocumentType(input.type)
  assertQuantity(input.quantity, 'quantity')
  if (input.minQuantity !== undefined) assertQuantity(input.minQuantity, 'minQuantity')
  const company = companyFields(resolvePortalCompany(context.portal, input.companyRut))
  try {
    return await runRequest(context, input, company)
  } finally {
    await context.portal.sleep(REQUEST_SPACING_MS, context.overrides?.signal)
  }
}

/**
 * EN: `queryFolioQuota` inside a session already held.
 * ES: `queryFolioQuota` dentro de una sesión ya tomada.
 */
export const queryFolioQuotaInSession = async (
  context: PortalContext,
  input: { readonly type: DocumentType; readonly companyRut?: string },
): Promise<FolioQuota> => {
  assertDocumentType(input.type)
  const company = companyFields(resolvePortalCompany(context.portal, input.companyRut))
  try {
    const started = await startRequest(context, input.type, 1, company)
    if (mustAuthenticate(started.html)) throw sessionExpired(context, ENTRY)
    const { page, atQuota } = await reachQuotaForm(context, started, input.type, company)
    const rejection = hardRejection(page.html)
    if (rejection === 'stampingBlocked')
      return { unrestricted: false, blocked: true, maxAuthorized: null, availableFolios: null }
    if (rejection !== null)
      throw rejected(context, rejection, { type: input.type, portalMessage: portalMessageOf(page.html) })
    if (!atQuota) throw unexpectedPage(context, ENTRY, page.html)
    const quota = quotaFields(page.html)
    return { unrestricted: quota.maxAuthorized === null, blocked: false, ...quota }
  } finally {
    await context.portal.sleep(REQUEST_SPACING_MS, context.overrides?.signal)
  }
}

/**
 * EN: Reads how many folios the SII authorizes for a type, stopping at the form that shows it: nothing is stamped and
 * the quota does not move. `MAX_AUTOR` and `FOLIOS_DISP` appear only while the SII rations the type.
 * ES: Lee cuántos folios autoriza el SII para un tipo, deteniéndose en el formulario que lo muestra: no se timbra nada y
 * el cupo no se mueve. `MAX_AUTOR` y `FOLIOS_DISP` aparecen solo mientras el SII raciona el tipo.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: document type and company. ES: tipo de documento y empresa.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the quota. ES: el cupo.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED` for any refusal but the stamping block, session and transport codes. ES: `SII_PORTAL_REJECTED` para cualquier rechazo salvo el bloqueo de timbraje, códigos de sesión y de transporte.
 */
export const queryFolioQuota = (
  portal: PortalClient,
  input: { readonly type: DocumentType; readonly companyRut?: string },
  overrides?: CallOverrides,
): Promise<FolioQuota> =>
  withPortalSession(portal, 'queryFolioQuota', overrides, (context) => queryFolioQuotaInSession(context, input))

/**
 * EN: Requests a range of folios and downloads its CAF through the five portal steps. A rejection can arrive at any
 * step. With the effective maximum exceeded and no `minQuantity`, it asks once more for one folio.
 * ES: Solicita un rango de folios y descarga su CAF por los cinco pasos del portal. Un rechazo puede llegar en cualquier
 * paso. Si se excede el máximo efectivo y no hay `minQuantity`, pide una vez más por un folio.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: type, quantity and company. ES: tipo, cantidad y empresa.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the CAF; its XML holds a private key. ES: el CAF; su XML contiene una llave privada.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes, `CAF_INVALID`. ES: los mismos códigos.
 */
export const requestCaf = (
  portal: PortalClient,
  input: CafRequestInput,
  overrides?: CallOverrides,
): Promise<ObtainedCaf> =>
  withPortalSession(portal, 'requestCaf', overrides, (context) => requestCafInSession(context, input))

/**
 * EN: Lists the document types the portal offers for stamping with this company. An error page is not "no types": a page
 * with no selector and no stated rejection throws.
 * ES: Lista los tipos de documento que el portal ofrece para timbraje con esta empresa. Una página de error no es "sin
 * tipos": una página sin selector y sin rechazo declarado lanza.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the company. ES: la empresa.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the types offered, possibly none. ES: los tipos ofrecidos, posiblemente ninguno.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const listStampableTypes = (
  portal: PortalClient,
  input: { readonly companyRut?: string } = {},
  overrides?: CallOverrides,
): Promise<readonly StampableType[]> =>
  withPortalSession(portal, 'listStampableTypes', overrides, async (context) => {
    const company = companyFields(resolvePortalCompany(portal, input.companyRut))
    const form = await ensurePage(context, ENTRY, at(context, ENTRY))
    if (mustAuthenticate(form.html)) throw sessionExpired(context, ENTRY)
    const page = await submitForm(context, `${ENTRY}.post`, formAction(form.html) ?? `${PATH}${SELECTOR}`, form.url, {
      ...inputValues(form.html),
      ...company,
    })
    const rejection = hardRejection(page.html)
    if (rejection !== null) throw rejected(context, rejection, { portalMessage: portalMessageOf(page.html) })
    const types = stampableTypes(page.html)
    if (types === null) throw unexpectedPage(context, SELECTOR, page.html)
    return types
  })
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/pages-stamping tests/portal/stamping --coverage=false
```

Expected: PASS, 60 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
git add src/portal/pages/stamping.ts src/portal/stamping.ts tests/portal/pages-stamping.test.ts tests/portal/stamping.test.ts
git commit -m "feat: request CAFs and read the stamping quota"
```

---

## Task 8: Company data

The resolution per environment, taxpayer data from maullin, and the issuer profile that reads both in sequence.

**Files:**
- Create: `src/portal/pages/company.ts`
- Create: `src/portal/company.ts`
- Create: `tests/portal/pages-company.test.ts`
- Create: `tests/portal/company.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/portal/pages-company.test.ts`:

```ts
import {
  isCompanyNotAuthorized,
  parseCompanyResolution,
  parseTaxpayerData,
  splitAddress,
} from '../../src/portal/pages/company'
import { companyResolutionPage, NOT_AUTHORIZED_COMPANY, page, taxpayerPage } from '../support/portal-pages'

test('the resolution table has rows without closing tags and accents as entities', () => {
  expect(parseCompanyResolution(companyResolutionPage())).toEqual({
    rut: '76543210-3',
    businessName: 'COMERCIAL ANDINA SPA',
    resolutionDate: '2026-09-21',
    resolutionNumber: 80,
    authorizationDate: '01-10-2026',
  })
})

test('a date in another shape stays; a number that does not read is null', () => {
  expect(parseCompanyResolution(companyResolutionPage('2026-09-21', 'x'))).toMatchObject({
    resolutionDate: '2026-09-21',
    resolutionNumber: null,
  })
})

test('labels survive a Latin-1 page and missing fields are null', () => {
  const html = page(
    '<table><tr><td>Resolución</td><td>0</td></tr><tr><td></td><td>x</td></tr><tr><td>solo</td></tr></table>',
  )
  expect(parseCompanyResolution(html)).toEqual({
    rut: null,
    businessName: null,
    resolutionDate: null,
    resolutionNumber: 0,
    authorizationDate: null,
  })
})

test('a page with neither date nor number is no resolution', () => {
  expect(parseCompanyResolution(page('<table><tr><td>Rut</td><td>1</td></tr></table>'))).toBeNull()
  expect(parseCompanyResolution(page('Actualización de Datos del Contribuyente'))).toBeNull()
})

test('both wordings of not authorized', () => {
  expect(isCompanyNotAuthorized(NOT_AUTHORIZED_COMPANY)).toBe(true)
  expect(isCompanyNotAuthorized(page('la empresa no est&aacute; autorizada para operar'))).toBe(true)
  expect(isCompanyNotAuthorized(page('todo bien'))).toBe(false)
})

test('taxpayer data: the address splits, branches and activities stay apart', () => {
  expect(parseTaxpayerData(taxpayerPage())).toEqual({
    rut: '76543210-3',
    businessName: 'COMERCIAL ANDINA SPA',
    businessActivity: 'SERVICIOS DE SOPORTE ANDINOS',
    activityCode: 631100,
    address: 'AV. LOS ANDES 123',
    neighborhood: 'EL BOSQUE',
    city: 'RANCAGUA',
    commune: 'MACHALI',
    portalAddress: 'AV. LOS ANDES 123, Villa/Pob. EL BOSQUE, Ciudad RANCAGUA, Comuna MACHALI',
    regionalOffice: 'RANCAGUA',
    activities: [{ code: 631100, description: 'SERVICIOS DE SOPORTE ANDINOS', vatAffected: 'SI' }],
    branches: [{ code: 123456, kind: 'SUCURSAL', address: 'CALLE UNO 45' }],
    description: 'Desarrollo de sistemas',
  })
})

test('a page without those tables gives nulls and empty lists', () => {
  expect(parseTaxpayerData(page('nada <table><tr><td>ETIQUETA</td><td></td></tr></table>'))).toEqual({
    rut: null,
    businessName: null,
    businessActivity: null,
    activityCode: null,
    address: null,
    neighborhood: null,
    city: null,
    commune: null,
    portalAddress: null,
    regionalOffice: null,
    activities: [],
    branches: [],
    description: null,
  })
})

test('the labels come off the end in any order', () => {
  expect(splitAddress('CALLE 1, Comuna SANTIAGO, Ciudad SANTIAGO')).toEqual({
    address: 'CALLE 1',
    neighborhood: null,
    city: 'SANTIAGO',
    commune: 'SANTIAGO',
  })
  expect(splitAddress('CALLE 1,')).toEqual({ address: 'CALLE 1', neighborhood: null, city: null, commune: null })
  expect(splitAddress('Comuna X')).toEqual({ address: null, neighborhood: null, city: null, commune: 'X' })
  expect(splitAddress(null)).toEqual({ address: null, neighborhood: null, city: null, commune: null })
})
```

`tests/portal/company.test.ts`:

```ts
import { fetchCompanyResolution, fetchIssuerProfile, fetchTaxpayerData } from '../../src/portal/company'
import type { Logger } from '../../src/sii/logger'
import { failure, MAULLIN, PALENA, portalWith, seedSession, signedIn } from '../support/portal'
import {
  COMPANY_FORM,
  companyResolutionPage,
  NOT_AUTHORIZED_COMPANY,
  page,
  taxpayerPage,
} from '../support/portal-pages'

const resolutionRoutes = (base: string, html = companyResolutionPage()) => [
  { url: `${base}/ad_empresa1`, reply: { body: COMPANY_FORM } },
  { url: `${base}/ad_empresa2`, method: 'POST' as const, reply: { body: html } },
]

describe('fetchCompanyResolution', () => {
  test('reads the resolution of the environment of the client', async () => {
    const harness = await signedIn(resolutionRoutes(MAULLIN))
    await expect(fetchCompanyResolution(harness.portal)).resolves.toMatchObject({ resolutionNumber: 80 })
    expect(harness.posted('ad_empresa2')).toEqual([{ RUT_EMP: '76543210', DV_EMP: '3', ACEPTAR: 'Ingresar' }])
  })

  test('the environment can be asked for, because the resolution differs per environment', async () => {
    const harness = await signedIn(resolutionRoutes(PALENA))
    await fetchCompanyResolution(harness.portal, { environment: 'production', companyRut: '10000004-0' })
    expect(harness.posted('ad_empresa2')).toEqual([{ RUT_EMP: '10000004', DV_EMP: '0', ACEPTAR: 'Ingresar' }])
  })

  test('a company the SII does not recognize is a rejection', async () => {
    const harness = await signedIn(resolutionRoutes(MAULLIN, NOT_AUTHORIZED_COMPANY))
    const error = await failure(fetchCompanyResolution(harness.portal))
    expect(error.details).toMatchObject({ rejection: 'companyNotAuthorized', operation: 'fetchCompanyResolution' })
  })

  test('an interstitial page repeats once with a fresh session, then gives up', async () => {
    const harness = await signedIn(resolutionRoutes(MAULLIN, page('Actualización de Datos')))
    const error = await failure(fetchCompanyResolution(harness.portal))
    expect(error.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect(error.details).toMatchObject({ step: 'ad_empresa2', portalMessage: 'SII Actualización de Datos' })
    expect(harness.posted('ad_empresa2')).toHaveLength(2)
    expect(harness.fake.requests[2].headers['cookie']).toBeUndefined()
  })
})

describe('fetchTaxpayerData', () => {
  test('goes to maullin whatever the environment', async () => {
    const harness = await signedIn(
      [
        { url: `${MAULLIN}/ad_empresa1`, reply: { body: COMPANY_FORM } },
        { url: `${MAULLIN}/ce_consulta_muestra_e`, reply: { body: taxpayerPage() } },
      ],
      { environment: 'production' },
    )
    await expect(fetchTaxpayerData(harness.portal)).resolves.toMatchObject({ commune: 'MACHALI' })
    expect(harness.posted('ce_consulta_muestra_e')).toEqual([
      { RUT_EMP: '76543210', DV_EMP: '3', ACEPTAR: 'CONSULTAR' },
    ])
  })

  test('a page with no taxpayer in it does not pass for empty data', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/ad_empresa1`, reply: { body: COMPANY_FORM } },
      { url: `${MAULLIN}/ce_consulta_muestra_e`, reply: { body: page('hola') } },
    ])
    expect((await failure(fetchTaxpayerData(harness.portal))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
  })

  test('a page with only the name still counts', async () => {
    const html = page('<table><tr><td>NOMBRE O RAZON SOCIAL</td><td>X</td></tr></table>')
    const harness = await signedIn([
      { url: `${MAULLIN}/ad_empresa1`, reply: { body: COMPANY_FORM } },
      { url: `${MAULLIN}/ce_consulta_muestra_e`, reply: { body: html } },
    ])
    await expect(fetchTaxpayerData(harness.portal)).resolves.toMatchObject({ businessName: 'X' })
  })
})

describe('fetchIssuerProfile', () => {
  const taxpayer = { url: `${MAULLIN}/ce_consulta_muestra_e`, reply: { body: taxpayerPage() } }

  test('combines both reads, in sequence', async () => {
    const harness = await signedIn([...resolutionRoutes(MAULLIN), taxpayer])
    await expect(fetchIssuerProfile(harness.portal)).resolves.toEqual({
      rut: '76543210-3',
      businessName: 'COMERCIAL ANDINA SPA',
      businessActivity: 'SERVICIOS DE SOPORTE ANDINOS',
      activityCode: 631100,
      address: 'AV. LOS ANDES 123',
      commune: 'MACHALI',
      city: 'RANCAGUA',
      resolutionDate: '2026-09-21',
      resolutionNumber: 80,
    })
    expect(harness.urls().map((url) => url.split('/').pop())).toEqual([
      'ad_empresa1',
      'ad_empresa2',
      'ad_empresa1',
      'ce_consulta_muestra_e',
    ])
  })

  test('a failing taxpayer read is tolerated and logged', async () => {
    const lines: string[] = []
    const log = (message: string): void => {
      lines.push(message)
    }
    const logger: Logger = { debug: log, info: log, warn: log, error: log }
    const harness = await signedIn(
      [...resolutionRoutes(MAULLIN), { url: `${MAULLIN}/ce_consulta_muestra_e`, reply: { body: page('nada') } }],
      { logger },
    )
    await expect(fetchIssuerProfile(harness.portal)).resolves.toEqual({
      rut: '76543210-3',
      businessName: 'COMERCIAL ANDINA SPA',
      businessActivity: '',
      activityCode: null,
      address: '',
      commune: '',
      city: '',
      resolutionDate: '2026-09-21',
      resolutionNumber: 80,
    })
    expect(lines).toContain('sii portal taxpayer read failed')
  })

  test('falls back along the way: description for the activity, commune for the city, 0 for the number', async () => {
    const html = page(`<table>
<tr><td>NOMBRE O RAZON SOCIAL</td><td>X</td></tr>
<tr><td>GLOSA DESCRIPTIVA</td><td>Sistemas</td></tr>
<tr><td>DIRECCION DE LA EMPRESA</td><td>CALLE 1, Comuna PUCON</td></tr>
</table>`)
    const resolution = page('<table><tr><td>Fecha Resoluci&oacute;n</td><td>21-09-2026</td></tr></table>')
    const harness = await signedIn([
      ...resolutionRoutes(MAULLIN, resolution),
      { url: `${MAULLIN}/ce_consulta_muestra_e`, reply: { body: html } },
    ])
    await expect(fetchIssuerProfile(harness.portal)).resolves.toMatchObject({
      businessName: 'X',
      businessActivity: 'Sistemas',
      commune: 'PUCON',
      city: 'PUCON',
      resolutionNumber: 0,
    })
  })

  test('with neither page naming the company the name stays empty', async () => {
    const resolution = page('<table><tr><td>Fecha Resoluci&oacute;n</td><td>21-09-2026</td></tr></table>')
    const harness = await signedIn([
      ...resolutionRoutes(MAULLIN, resolution),
      { url: `${MAULLIN}/ce_consulta_muestra_e`, reply: { body: page('nada') } },
    ])
    await expect(fetchIssuerProfile(harness.portal)).resolves.toMatchObject({ businessName: '' })
  })

  test('no resolution date is not a profile', async () => {
    const resolution = page('<table><tr><td>Resoluci&oacute;n</td><td>80</td></tr></table>')
    const harness = await signedIn(resolutionRoutes(MAULLIN, resolution))
    const error = await failure(fetchIssuerProfile(harness.portal))
    expect(error.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect(error.details).toMatchObject({ portalMessage: 'resolution date missing' })
  })

  test('without a company anywhere, it uses the RUT of the session', async () => {
    const harness = portalWith([...resolutionRoutes(MAULLIN), taxpayer])
    const portal = { ...harness.portal, companyRut: null }
    await seedSession(portal)
    await expect(fetchIssuerProfile(portal)).resolves.toMatchObject({ rut: '12345678-5' })
    expect(harness.posted('ad_empresa2')[0]).toMatchObject({ RUT_EMP: '12345678', DV_EMP: '5' })
  })

  test('and with no such RUT it says what is missing', async () => {
    const harness = portalWith(resolutionRoutes(MAULLIN))
    const portal = { ...harness.portal, companyRut: null }
    await seedSession(portal, { 'NETSCAPE_LIVEWIRE.other': '1' })
    const error = await failure(fetchIssuerProfile(portal))
    expect(error).toMatchObject({ code: 'MISSING_FIELD', details: { field: 'companyRut' } })
  })

  test('an explicit company and environment are honoured', async () => {
    const harness = await signedIn([...resolutionRoutes(PALENA), ...resolutionRoutes(MAULLIN), taxpayer])
    const profile = await fetchIssuerProfile(harness.portal, { companyRut: '10000004-0', environment: 'production' })
    expect(profile.rut).toBe('10000004-0')
    expect(harness.urls()[0]).toBe(`${PALENA}/ad_empresa1`)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/pages-company tests/portal/company --coverage=false
```

Expected: FAIL, because the code below does not exist yet.

- [ ] **Step 3: Write the implementation**

`src/portal/pages/company.ts`:

```ts
import { stripTags, visibleText } from '../html'

/**
 * EN: What `ad_empresa2` says about a company in one environment.
 * ES: Lo que `ad_empresa2` dice de una empresa en un ambiente.
 */
export type CompanyResolution = {
  /** EN: Company RUT as shown. ES: `Rut` — RUT de la empresa tal como aparece. */
  readonly rut: string | null
  /** EN: Business name. ES: `Razón Social` — Razón social. */
  readonly businessName: string | null
  /** EN: Resolution date, YYYY-MM-DD. ES: `Fecha Resolución` — Fecha de resolución, AAAA-MM-DD. */
  readonly resolutionDate: string | null
  /** EN: Resolution number. ES: `Resolución` — Número de resolución. */
  readonly resolutionNumber: number | null
  /** EN: Authorization date, as sent. ES: `Fecha Autorización` — Fecha de autorización, tal como viene. */
  readonly authorizationDate: string | null
}

/**
 * EN: One economic activity.
 * ES: Una actividad económica.
 */
export type TaxpayerActivity = {
  /** EN: SII activity code. ES: Código de actividad económica. */
  readonly code: number
  /** EN: Description. ES: Descripción de la actividad. */
  readonly description: string
  /** EN: VAT-affected cell, as sent. ES: Celda de afecto a IVA, tal como viene. */
  readonly vatAffected: string
}

/**
 * EN: One registered branch.
 * ES: Una sucursal inscrita.
 */
export type TaxpayerBranch = {
  /** EN: SII branch code. ES: `CdgSIISucur` — Código de sucursal. */
  readonly code: number
  /** EN: Address kind. ES: Tipo de dirección. */
  readonly kind: string
  /** EN: Address. ES: Dirección. */
  readonly address: string
}

/**
 * EN: What `ce_consulta_muestra_e` says about a taxpayer. It only answers on the certification host.
 * ES: Lo que `ce_consulta_muestra_e` dice de un contribuyente. Solo responde en el host de certificación.
 */
export type TaxpayerData = {
  /** EN: RUT. ES: `DATOS DEL CONTRIBUYENTE RUT` — RUT. */
  readonly rut: string | null
  /** EN: Business name. ES: `NOMBRE O RAZÓN SOCIAL` — Razón social. */
  readonly businessName: string | null
  /** EN: Description of the first activity. ES: `GiroEmis` — Descripción de la primera actividad. */
  readonly businessActivity: string | null
  /** EN: Code of the first activity. ES: `Acteco` — Código de la primera actividad. */
  readonly activityCode: number | null
  /** EN: Street part of the address. ES: `DirOrigen` — Parte de calle y número del domicilio. */
  readonly address: string | null
  /** EN: Neighbourhood. ES: `Villa/Pob.` — Villa o población. */
  readonly neighborhood: string | null
  /** EN: City. ES: `Ciudad` — Ciudad. */
  readonly city: string | null
  /** EN: Commune. ES: `Comuna` — Comuna. */
  readonly commune: string | null
  /** EN: Address cell, verbatim. ES: `DIRECCIÓN DE LA EMPRESA` — Celda del domicilio, sin cambios. */
  readonly portalAddress: string | null
  /** EN: SII regional office. ES: `DIRECCIÓN REGIONAL DEL CONTRIBUYENTE` — Dirección regional del SII. */
  readonly regionalOffice: string | null
  /** EN: Economic activities. ES: `ACTIVIDADES ECONÓMICAS` — Actividades económicas. */
  readonly activities: readonly TaxpayerActivity[]
  /** EN: Registered branches. ES: `DIRECCIÓN SUCURSALES` — Sucursales inscritas. */
  readonly branches: readonly TaxpayerBranch[]
  /** EN: Free description. ES: `GLOSA DESCRIPTIVA` — Glosa descriptiva. */
  readonly description: string | null
}

/**
 * EN: The SII does not recognize the company as an electronic issuer in this environment, in either of its two wordings.
 * ES: El SII no reconoce a la empresa como emisor electrónico en este ambiente, en cualquiera de sus dos redacciones.
 */
export const isCompanyNotAuthorized = (html: string): boolean =>
  /(empresa|contribuyente)\s+no\s+est.{0,8}\s*autorizad[oa]\s+para\s+operar/i.test(visibleText(html, 4000))

const cellsOf = (row: string): readonly string[] =>
  [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => stripTags(match[1]))

const dmyToIso = (value: string): string => value.replace(/^(\d{2})-(\d{2})-(\d{4})$/, '$3-$2-$1')

const integerOrNull = (value: string | null): number | null => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * EN: Reads the `ad_empresa2` table, row by row split on the opening tag because HTML 4.01 needs no `</tr>`; labels are
 * matched loosely to survive encoding changes. Null when the page has neither a date nor a number.
 * ES: Lee la tabla de `ad_empresa2`, fila por fila separando por la etiqueta de apertura porque HTML 4.01 no exige
 * `</tr>`; las etiquetas se comparan con holgura para resistir cambios de codificación. Null si la página no trae ni
 * fecha ni número.
 */
export const parseCompanyResolution = (html: string): CompanyResolution | null => {
  const rows = html.split(/<tr[^>]*>/i).flatMap((row) => {
    const cells = cellsOf(row)
    return cells.length >= 2 && cells[0] !== '' ? [[cells[0], cells[1]] as const] : []
  })
  const valueOf = (label: RegExp, exclude?: RegExp): string | null =>
    rows.find(([name]) => label.test(name) && !exclude?.test(name))?.[1] ?? null
  const date = valueOf(/fecha.*resol/i)
  const number = valueOf(/^resoluci/i, /fecha/i)
  if (date === null && number === null) return null
  return {
    rut: valueOf(/^rut$/i) || null,
    businessName: valueOf(/^raz.{1,8}n social/i) || null,
    resolutionDate: date === null ? null : dmyToIso(date),
    resolutionNumber: integerOrNull(number),
    authorizationDate: valueOf(/^fecha autorizaci/i) || null,
  }
}

/**
 * EN: Splits the address cell (`AV. UNO 45, Villa/Pob. X, Ciudad Y, Comuna Z`). The labels are SII text, not data: glued
 * into `DirOrigen` the field passes its 70 characters and the SII rejects the whole envelope. They come off from the end,
 * in any order.
 * ES: Separa la celda del domicilio (`AV. UNO 45, Villa/Pob. X, Ciudad Y, Comuna Z`). Las etiquetas son texto del SII, no
 * datos: pegadas en `DirOrigen` el campo pasa sus 70 caracteres y el SII rechaza el envío completo. Se quitan desde el
 * final, en cualquier orden.
 */
export const splitAddress = (
  raw: string | null,
): Pick<TaxpayerData, 'address' | 'neighborhood' | 'city' | 'commune'> => {
  if (raw === null) return { address: null, neighborhood: null, city: null, commune: null }
  const labels = [
    ['commune', /,?\s*Comuna\s+([^,]+)$/i],
    ['city', /,?\s*Ciudad\s+([^,]+)$/i],
    ['neighborhood', /,?\s*Villa\/Pob\.?\s+([^,]+)$/i],
  ] as const
  const peel = (
    rest: string,
    parts: Readonly<Record<string, string>>,
  ): { readonly rest: string; readonly parts: Readonly<Record<string, string>> } => {
    for (const [field, label] of labels) {
      const match = field in parts ? null : label.exec(rest)
      if (match !== null) return peel(rest.slice(0, match.index), { ...parts, [field]: match[1].trim() })
    }
    return { rest, parts }
  }
  const { rest, parts } = peel(raw, {})
  return {
    address: rest.replace(/,\s*$/, '').trim() || null,
    neighborhood: parts.neighborhood ?? null,
    city: parts.city ?? null,
    commune: parts.commune ?? null,
  }
}

const BRANCHES_SECTION = /DIRECCI(?:&Oacute;|Ó|O)N\s+SUCURSALES[\s\S]*?(?=ACTIVIDADES\s+ECON|$)/i
const rowsOf = (html: string): readonly string[] => [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[0])

/**
 * EN: Reads the `ce_consulta_muestra_e` tables. Activity codes are three-cell rows too, so branches are read only between
 * their title and the activities, and activities outside that stretch.
 * ES: Lee las tablas de `ce_consulta_muestra_e`. Los códigos de actividad también son filas de tres celdas, así que las
 * sucursales se leen solo entre su título y las actividades, y las actividades fuera de ese tramo.
 */
export const parseTaxpayerData = (html: string): TaxpayerData => {
  const section = BRANCHES_SECTION.exec(html)?.[0] ?? ''
  const rows = rowsOf(section === '' ? html : html.replace(section, '')).map(cellsOf)
  const labelled = new Map(
    rows.flatMap((cells) =>
      cells.length === 2 && cells[0] !== '' ? [[cells[0].toUpperCase(), cells[1]] as const] : [],
    ),
  )
  const valueOf = (...labels: readonly string[]): string | null =>
    labels.map((label) => labelled.get(label)).find((value) => value !== undefined && value !== '') ?? null
  const activities = rows.flatMap((cells) => {
    const code = cells.length === 3 ? cells[0].replace(/\s/g, '') : ''
    return /^\d{4,6}$/.test(code)
      ? [{ code: Number(code), description: cells[1], vatAffected: cells[2] } as TaxpayerActivity]
      : []
  })
  const branches = rowsOf(section)
    .map(cellsOf)
    .flatMap((cells) =>
      cells.length === 3 && /^\d{1,9}$/.test(cells[0])
        ? [{ code: Number(cells[0]), kind: cells[1], address: cells[2] } as TaxpayerBranch]
        : [],
    )
  const portalAddress = valueOf('DIRECCIÓN DE LA EMPRESA', 'DIRECCION DE LA EMPRESA')
  return {
    rut: valueOf('DATOS DEL CONTRIBUYENTE RUT'),
    businessName: valueOf('NOMBRE O RAZÓN SOCIAL', 'NOMBRE O RAZON SOCIAL'),
    businessActivity: activities[0]?.description ?? null,
    activityCode: activities[0]?.code ?? null,
    ...splitAddress(portalAddress),
    portalAddress,
    regionalOffice: valueOf('DIRECCIÓN REGIONAL DEL CONTRIBUYENTE', 'DIRECCION REGIONAL DEL CONTRIBUYENTE'),
    activities,
    branches,
    description: valueOf('GLOSA DESCRIPTIVA'),
  }
}
```

`src/portal/company.ts`:

```ts
import type { Environment } from '../catalogs/codes'
import { cgiUrl } from '../catalogs/portal'
import { DteError, errorMessage } from '../errors'
import type { SiiRut } from '../model/rut'
import type { CallOverrides } from '../sii/client'
import { resolvePortalCompany, type PortalClient } from './client'
import { sessionRut } from './cookies'
import { portalMessageOf } from './pages/auth'
import {
  isCompanyNotAuthorized,
  parseCompanyResolution,
  parseTaxpayerData,
  type CompanyResolution,
  type TaxpayerData,
} from './pages/company'
import {
  companyFields,
  ensurePage,
  rejected,
  submitForm,
  unexpectedPage,
  withFreshSessionRetry,
  withPortalSession,
  type PortalContext,
} from './session'

/**
 * EN: What a company needs to fill an `Issuer` and an envelope cover.
 * ES: Lo que una empresa necesita para llenar un `Issuer` y una carátula.
 */
export type IssuerProfile = {
  /** EN: Company RUT. ES: `RUTEmisor` — RUT de la empresa. */
  readonly rut: SiiRut
  /** EN: Business name. ES: `RznSoc` — Razón social. */
  readonly businessName: string
  /** EN: Line of business: the first activity, else the description. ES: `GiroEmis` — Giro: la primera actividad, si no la glosa. */
  readonly businessActivity: string
  /** EN: Code of the first activity, or null. ES: `Acteco` — Código de la primera actividad, o null. */
  readonly activityCode: number | null
  /** EN: Street address. ES: `DirOrigen` — Dirección. */
  readonly address: string
  /** EN: Commune. ES: `CmnaOrigen` — Comuna. */
  readonly commune: string
  /** EN: City; the commune when absent. ES: `CiudadOrigen` — Ciudad; la comuna si falta. */
  readonly city: string
  /** EN: Resolution date of the environment asked for. ES: `FchResol` — Fecha de resolución del ambiente pedido. */
  readonly resolutionDate: string
  /** EN: Resolution number of the environment asked for. ES: `NroResol` — Número de resolución del ambiente pedido. */
  readonly resolutionNumber: number
}

const RESOLUTION_ENTRY = 'ad_empresa1'
const RESOLUTION_PAGE = 'ad_empresa2'
const TAXPAYER_PAGE = 'ce_consulta_muestra_e'

const readResolution = async (
  context: PortalContext,
  rut: SiiRut,
  environment: Environment,
): Promise<CompanyResolution> => {
  const entry = await ensurePage(context, RESOLUTION_ENTRY, cgiUrl(environment, RESOLUTION_ENTRY))
  const page = await submitForm(context, RESOLUTION_PAGE, cgiUrl(environment, RESOLUTION_PAGE), entry.url, {
    ...companyFields(rut),
    ACEPTAR: 'Ingresar',
  })
  if (isCompanyNotAuthorized(page.html))
    throw rejected(context, 'companyNotAuthorized', { portalMessage: portalMessageOf(page.html) })
  const resolution = parseCompanyResolution(page.html)
  if (resolution === null) throw unexpectedPage(context, RESOLUTION_PAGE, page.html)
  return resolution
}

// The taxpayer page only answers on the certification host, whatever the environment. A `GET` first makes sure there is
// a session: a `POST` alone would only be redirected to the login.
const readTaxpayer = async (context: PortalContext, rut: SiiRut): Promise<TaxpayerData> => {
  const entry = await ensurePage(context, RESOLUTION_ENTRY, cgiUrl('certification', RESOLUTION_ENTRY))
  const page = await submitForm(context, TAXPAYER_PAGE, cgiUrl('certification', TAXPAYER_PAGE), entry.url, {
    ...companyFields(rut),
    ACEPTAR: 'CONSULTAR',
  })
  const data = parseTaxpayerData(page.html)
  if (data.rut === null && data.businessName === null) throw unexpectedPage(context, TAXPAYER_PAGE, page.html)
  return data
}

/**
 * EN: Reads the resolution of a company. It is per environment: certification and production answer different dates and
 * numbers for one RUT, and the wrong pair gets an envelope rejected with "Error en Carátula".
 * ES: Lee la resolución de una empresa. Es por ambiente: certificación y producción responden fechas y números distintos
 * para un mismo RUT, y el par equivocado hace que se rechace un envío con "Error en Carátula".
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: company and environment; the client's by default. ES: empresa y ambiente; por defecto los del cliente.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the resolution. ES: la resolución.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED { rejection: 'companyNotAuthorized' }`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const fetchCompanyResolution = (
  portal: PortalClient,
  input: { readonly companyRut?: string; readonly environment?: Environment } = {},
  overrides?: CallOverrides,
): Promise<CompanyResolution> =>
  withPortalSession(portal, 'fetchCompanyResolution', overrides, (context) => {
    const rut = resolvePortalCompany(portal, input.companyRut)
    return withFreshSessionRetry(context, () => readResolution(context, rut, input.environment ?? portal.environment))
  })

/**
 * EN: Reads taxpayer data: name, address split in its parts, activities and branches.
 * ES: Lee los datos del contribuyente: nombre, domicilio separado en sus partes, actividades y sucursales.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the company. ES: la empresa.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the data. ES: los datos.
 * @throws {DteError} EN: `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const fetchTaxpayerData = (
  portal: PortalClient,
  input: { readonly companyRut?: string } = {},
  overrides?: CallOverrides,
): Promise<TaxpayerData> =>
  withPortalSession(portal, 'fetchTaxpayerData', overrides, (context) => {
    const rut = resolvePortalCompany(portal, input.companyRut)
    return withFreshSessionRetry(context, () => readTaxpayer(context, rut))
  })

const profileCompany = async (
  context: PortalContext,
  companyRut: string | undefined,
  environment: Environment,
): Promise<SiiRut> => {
  const { portal } = context
  if (companyRut !== undefined || portal.companyRut !== null) return resolvePortalCompany(portal, companyRut)
  await ensurePage(context, RESOLUTION_ENTRY, cgiUrl(environment, RESOLUTION_ENTRY))
  const rut = sessionRut(context.state.cookies)
  if (rut === null) throw new DteError('MISSING_FIELD', { field: 'companyRut' })
  return rut
}

/**
 * EN: Reads the resolution and the taxpayer data in sequence and combines them. In parallel, one reply overwrites the
 * balancer cookie the other needs and `ad_empresa2` answers empty. A failing taxpayer read is logged and tolerated as long
 * as the resolution date arrived. Without a company on the input or the client, it uses the RUT of the session.
 * ES: Lee la resolución y los datos del contribuyente en secuencia y los combina. En paralelo, una respuesta pisa la cookie
 * del balanceador que la otra necesita y `ad_empresa2` responde vacío. Una lectura fallida del contribuyente se registra y
 * se tolera mientras haya llegado la fecha de resolución. Sin empresa en la entrada ni en el cliente, usa el RUT de la sesión.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: company and environment; the client's by default. ES: empresa y ambiente; por defecto los del cliente.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the profile. ES: el perfil.
 * @throws {DteError} EN: as `fetchCompanyResolution`, plus `MISSING_FIELD { field: 'companyRut' }`. ES: como `fetchCompanyResolution`, más `MISSING_FIELD { field: 'companyRut' }`.
 */
export const fetchIssuerProfile = (
  portal: PortalClient,
  input: { readonly companyRut?: string; readonly environment?: Environment } = {},
  overrides?: CallOverrides,
): Promise<IssuerProfile> =>
  withPortalSession(portal, 'fetchIssuerProfile', overrides, async (context) => {
    const environment = input.environment ?? portal.environment
    const rut = await profileCompany(context, input.companyRut, environment)
    const resolution = await withFreshSessionRetry(context, () => readResolution(context, rut, environment))
    if (resolution.resolutionDate === null)
      throw new DteError('SII_PORTAL_UNEXPECTED_PAGE', {
        operation: context.operation,
        step: RESOLUTION_PAGE,
        portalMessage: 'resolution date missing',
      })
    const taxpayer = await readTaxpayer(context, rut).catch((error: unknown) => {
      portal.logger.warn('sii portal taxpayer read failed', { reason: errorMessage(error) })
      return null
    })
    return {
      rut,
      businessName: taxpayer?.businessName ?? resolution.businessName ?? '',
      businessActivity: taxpayer?.businessActivity ?? taxpayer?.description ?? '',
      activityCode: taxpayer?.activityCode ?? null,
      address: taxpayer?.address ?? '',
      commune: taxpayer?.commune ?? '',
      city: taxpayer?.city ?? taxpayer?.commune ?? '',
      resolutionDate: resolution.resolutionDate,
      resolutionNumber: resolution.resolutionNumber ?? 0,
    }
  })
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/pages-company tests/portal/company --coverage=false
```

Expected: PASS, 23 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
git add src/portal/pages/company.ts src/portal/company.ts tests/portal/pages-company.test.ts tests/portal/company.test.ts
git commit -m "feat: read company data from the portal"
```

---

## Task 9: Certification state

Read only: `pe_avance1` and `pe_avance2`. Declaring progress belongs to phase 5.

**Files:**
- Create: `src/portal/pages/certification.ts`
- Create: `src/portal/certification.ts`
- Create: `tests/portal/certification.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/portal/certification.test.ts`:

```ts
import { queryCertificationSets } from '../../src/portal/certification'
import { parseCertificationSets } from '../../src/portal/pages/certification'
import { failure, MAULLIN, signedIn } from '../support/portal'
import { certificationPage, page, REJECTION_PAGES } from '../support/portal-pages'

const routes = (html: string) => [
  { url: `${MAULLIN}/pe_avance1`, reply: { body: page('form') } },
  { url: `${MAULLIN}/pe_avance2`, method: 'POST' as const, reply: { body: html } },
]

test('rows read one by one: bold state, hidden state, no state', () => {
  expect(parseCertificationSets(certificationPage())).toEqual([
    { name: 'SET BASICO', status: 'REVISADO CONFORME' },
    { name: 'SET GUIA DE DESPACHO', status: 'REVISADO CONFORME' },
    { name: 'SET FACTURA EXENTA', status: 'REVISADO CONFORME' },
    { name: 'SET CASO GENERAL FACTURA COMPRA', status: 'REVISADO CONFORME' },
    { name: 'LIBRO DE VENTAS', status: 'S21' },
    { name: 'LIBRO DE COMPRAS', status: 'EN REVISION' },
    { name: 'LIBRO DE GUIAS', status: 'S01' },
  ])
})

test('queries maullin whatever the environment and says what is approved', async () => {
  const harness = await signedIn(routes(certificationPage()), { environment: 'production' })
  const result = await queryCertificationSets(harness.portal)
  expect(result.allSetsApproved).toBe(true)
  expect(result.allBooksApproved).toBe(false)
  expect(result.sets).toHaveLength(7)
  expect(harness.posted('pe_avance2')).toEqual([{ RUT_EMP: '76543210', DV_EMP: '3', ACEPTAR: 'Continuar' }])
  expect(harness.urls().some((url) => /pe_avance[3-9]/.test(url))).toBe(false)
})

test('a set not approved, or missing, says so', async () => {
  const harness = await signedIn(routes(certificationPage('EN REVISION')))
  await expect(queryCertificationSets(harness.portal)).resolves.toMatchObject({ allSetsApproved: false })
  const missing = await signedIn(
    routes(page('<table><tr><td><font>SET BASICO</font></td><td><b>x</b></td></tr></table>')),
  )
  await expect(queryCertificationSets(missing.portal)).resolves.toMatchObject({ allSetsApproved: false })
})

test('a rejection is a rejection, and a page with no rows does not pass for empty', async () => {
  const rejected = await signedIn(routes(REJECTION_PAGES.companyNotAuthorized))
  expect((await failure(queryCertificationSets(rejected.portal))).details).toMatchObject({
    rejection: 'companyNotAuthorized',
  })
  const empty = await signedIn(routes(page('hola')))
  expect((await failure(queryCertificationSets(empty.portal))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/certification --coverage=false
```

Expected: FAIL, because the code below does not exist yet.

- [ ] **Step 3: Write the implementation**

`src/portal/pages/certification.ts`:

```ts
/**
 * EN: One test set or book of the certification, and its state.
 * ES: Un set de pruebas o libro de la certificación, y su estado.
 */
export type CertificationSet = {
  /** EN: Name as the portal shows it. ES: Nombre tal como lo muestra el portal (`SET BASICO`, `LIBRO DE VENTAS`…). */
  readonly name: string
  /** EN: State in upper case, or the hidden code (`S01` not declared, `S21` declared). ES: Estado en mayúsculas (`REVISADO CONFORME`, `EN REVISION`…) o el código oculto (`S01` sin declarar, `S21` declarado). */
  readonly status: string
}

/**
 * EN: The rows of `pe_avance2`, one by one: a match across the whole page once gave one row's state to the next.
 * ES: Las filas de `pe_avance2`, una por una: una búsqueda sobre toda la página ya le asignó el estado de una fila a la siguiente.
 */
export const parseCertificationSets = (html: string): readonly CertificationSet[] =>
  html.split(/<\/tr>/i).flatMap((row) => {
    const name = /(SET[^<\n\r]*|LIBRO[^<\n\r]*)<\/font><\/td>/i.exec(row)?.[1].trim()
    if (name === undefined) return []
    const status = /<b>([^<]+)<\/b>/i.exec(row)?.[1].trim().toUpperCase()
    return [{ name, status: status ?? /name="EST\d+"[^>]*value="([^"]+)"/i.exec(row)?.[1] ?? 'S01' }]
  })
```

`src/portal/certification.ts`:

```ts
import { cgiUrl } from '../catalogs/portal'
import type { CallOverrides } from '../sii/client'
import { resolvePortalCompany, type PortalClient } from './client'
import { portalMessageOf } from './pages/auth'
import { parseCertificationSets, type CertificationSet } from './pages/certification'
import { hardRejection } from './pages/stamping'
import { companyFields, ensurePage, rejected, submitForm, unexpectedPage, withPortalSession } from './session'

const REQUIRED_SETS = ['SET BASICO', 'SET GUIA DE DESPACHO', 'SET FACTURA EXENTA', 'SET CASO GENERAL FACTURA COMPRA']
const REQUIRED_BOOKS = ['LIBRO DE VENTAS', 'LIBRO DE COMPRAS', 'LIBRO DE GUIAS']

/**
 * EN: The certification state of a company.
 * ES: El estado de certificación de una empresa.
 */
export type CertificationSets = {
  /** EN: Every set and book the page lists. ES: Todos los sets y libros que lista la página. */
  readonly sets: readonly CertificationSet[]
  /** EN: The four required sets are approved. ES: Los cuatro sets obligatorios están `REVISADO CONFORME`. */
  readonly allSetsApproved: boolean
  /** EN: The three required books are approved. ES: Los tres libros obligatorios están `REVISADO CONFORME`. */
  readonly allBooksApproved: boolean
}

const allApproved = (sets: readonly CertificationSet[], required: readonly string[]): boolean =>
  required.every((name) => sets.find((set) => set.name.includes(name))?.status.includes('REVISADO CONFORME') ?? false)

/**
 * EN: Reads the state of each test set and book, on the certification host. It only reads: declaring progress belongs
 * to the certification runner.
 * ES: Lee el estado de cada set de pruebas y libro, en el host de certificación. Solo lee: declarar avance le corresponde
 * al ejecutor de la certificación.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the company. ES: la empresa.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the sets and whether the required ones are approved. ES: los sets y si los obligatorios están aprobados.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const queryCertificationSets = (
  portal: PortalClient,
  input: { readonly companyRut?: string } = {},
  overrides?: CallOverrides,
): Promise<CertificationSets> =>
  withPortalSession(portal, 'queryCertificationSets', overrides, async (context) => {
    const company = companyFields(resolvePortalCompany(portal, input.companyRut))
    const entry = await ensurePage(context, 'pe_avance1', cgiUrl('certification', 'pe_avance1'))
    const page = await submitForm(
      context,
      'pe_avance2',
      cgiUrl('certification', 'pe_avance2'),
      entry.url,
      { ...company, ACEPTAR: 'Continuar' },
      entry.url,
    )
    const rejection = hardRejection(page.html)
    if (rejection !== null) throw rejected(context, rejection, { portalMessage: portalMessageOf(page.html) })
    const sets = parseCertificationSets(page.html)
    if (sets.length === 0) throw unexpectedPage(context, 'pe_avance2', page.html)
    return {
      sets,
      allSetsApproved: allApproved(sets, REQUIRED_SETS),
      allBooksApproved: allApproved(sets, REQUIRED_BOOKS),
    }
  })
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/certification --coverage=false
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
git add src/portal/pages/certification.ts src/portal/certification.ts tests/portal/certification.test.ts
git commit -m "feat: read the certification state"
```

---

## Task 10: Folio listing and annulment

Up to four passes, by range and folio by folio on a conflict, with an explicit scope (D35) and the memory of annulled ranges as data (D38).

**Files:**
- Create: `src/portal/pages/annulment.ts`
- Create: `src/portal/annulment.ts`
- Create: `tests/portal/pages-annulment.test.ts`
- Create: `tests/portal/annulment.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/portal/pages-annulment.test.ts`:

```ts
import {
  annulmentRefusal,
  isAlreadyAnnulled,
  isAnnulmentAccepted,
  isAnnulmentConflict,
  nextPageButton,
  parseUnusedRanges,
  uniqueRanges,
} from '../../src/portal/pages/annulment'
import { ANNUL_OK, page, unusedRangesPage } from '../support/portal-pages'

test('ranges come from the hidden fields of each form, once each', () => {
  const html = unusedRangesPage([
    [1, 3],
    [1, 3],
    [4, 9, '01-02-2026'],
  ])
  expect(parseUnusedRanges(html)).toEqual([
    { from: 1, to: 3, quantity: 3, date: '2026-11-15' },
    { from: 4, to: 9, quantity: 6, date: '2026-02-01' },
  ])
})

test('missing quantity and date have sensible values', () => {
  const html = page(
    '<form><input name=FOLIO_INI value=5><input name=FOLIO_FIN value=6></form><form><input name=FOLIO_INI value=7></form>',
  )
  expect(parseUnusedRanges(html)).toEqual([{ from: 5, to: 6, quantity: 2, date: null }])
})

test('rows without forms fall back to columns', () => {
  const html = page(`<table>
<tr><td>15-11-2026</td><td>3</td><td>1</td><td>3</td><td>x</td></tr>
<tr><td>no fecha</td><td>--</td><td>7</td><td>9</td></tr>
<tr><td>a</td><td>b</td><td>c</td><td>d</td></tr>
<tr><td>cabecera</td></tr>
<tr><th>titulo</th></tr>
</table>`)
  expect(parseUnusedRanges(html)).toEqual([
    { from: 1, to: 3, quantity: 3, date: '2026-11-15' },
    { from: 7, to: 9, quantity: 3, date: null },
  ])
  expect(parseUnusedRanges(page('nada'))).toEqual([])
})

test('uniqueRanges keeps the first', () => {
  const range = { from: 1, to: 2, quantity: 2, date: null }
  expect(uniqueRanges([range, { ...range, quantity: 9 }])).toEqual([range])
})

test('the next page button, with or without its page', () => {
  expect(nextPageButton(unusedRangesPage([[1, 2]], 3))).toEqual({ page: 3 })
  expect(nextPageButton(page('<input type=button name=siguiente value=x>'))).toEqual({ page: null })
  expect(nextPageButton(page('<input type=button name=NEXT value=x onClick="other()">'))).toEqual({ page: null })
  expect(nextPageButton(page('<input name=a value=b>'))).toBeNull()
})

test.each([
  ['ya ha sido efectuado', true],
  ['ya fue anulado', true],
  ['efectuado anteriormente', true],
  ['fue anulado anteriormente', true],
  ['anulada anteriormente', true],
  ['otra cosa', false],
])('already annulled: %s', (text, expected) => {
  expect(isAlreadyAnnulled(page(text))).toBe(expected)
})

test('accepted and conflict', () => {
  expect(isAnnulmentAccepted(ANNUL_OK)).toBe(true)
  expect(isAnnulmentAccepted(page('ha autorizado la anulaci&oacute;n'))).toBe(true)
  expect(isAnnulmentAccepted(page('no'))).toBe(false)
  for (const text of ['ya ha sido efectuado', 'ya fue anulado', 'efectuado anteriormente', 'folio recepcionado'])
    expect(isAnnulmentConflict(page(text))).toBe(true)
  expect(isAnnulmentConflict(page('otra'))).toBe(false)
})

test.each([
  ['folio recepcionado', 'received'],
  ['YA FUE ANULADO', 'alreadyAnnulled'],
  ['anulado anteriormente', 'alreadyAnnulled'],
  ['ya ha sido efectuado anteriormente', 'alreadyAnnulled'],
  ['fue anulada y ya esta', 'alreadyAnnulled'],
  ['la anulacion no procede', 'refused'],
  ['Error 500', 'siiError'],
  ['Internal Server Error', 'siiError'],
  ['xxx', 'unknown'],
] as const)('refusal %s', (text, reason) => {
  expect(annulmentRefusal(text)).toBe(reason)
})
```

`tests/portal/annulment.test.ts`:

```ts
import { DteError } from '../../src/errors'
import { annulFolios, listFolioRanges } from '../../src/portal/annulment'
import type { Logger } from '../../src/sii/logger'
import { failure, MAULLIN, signedIn } from '../support/portal'
import { ANNUL_ENTRY, ANNUL_FORM, ANNUL_OK, page, unusedRangesPage } from '../support/portal-pages'

const entry = { url: `${MAULLIN}/af_anular1`, method: 'GET' as const, reply: { body: ANNUL_ENTRY } }
const list = (...bodies: readonly string[]) => ({
  url: `${MAULLIN}/af_anular2`,
  method: 'POST' as const,
  reply: bodies.map((body) => ({ body })),
})
const respond = (name: string, ...bodies: readonly (string | Error)[]) => ({
  url: `${MAULLIN}/${name}`,
  method: 'POST' as const,
  reply: bodies.map((body) => (typeof body === 'string' ? { body } : body)),
})

describe('listFolioRanges', () => {
  test('sends the query and returns the ranges', async () => {
    const harness = await signedIn([
      entry,
      list(
        unusedRangesPage([
          [1, 3],
          [4, 5],
        ]),
      ),
    ])
    await expect(listFolioRanges(harness.portal, { type: 33 })).resolves.toEqual({
      ranges: [
        { from: 1, to: 3, quantity: 3, date: '2026-11-15' },
        { from: 4, to: 5, quantity: 2, date: '2026-11-15' },
      ],
      lastFolio: 5,
    })
    expect(harness.posted('af_anular2')[0]).toEqual({
      KEY: 'abc',
      RUT_EMP: '76543210',
      PAGINA: '1',
      COD_DOCTO: '33',
      ACEPTAR: 'Consultar',
      DV_EMP: '3',
    })
  })

  test('follows the pages, merging, newest first', async () => {
    const harness = await signedIn([
      entry,
      list(
        unusedRangesPage([[1, 3]], 2),
        unusedRangesPage(
          [
            [1, 3],
            [10, 12],
          ],
          3,
        ),
        unusedRangesPage([[20, 21]]),
      ),
    ])
    const result = await listFolioRanges(harness.portal, { type: 33 })
    expect(result.ranges.map((range) => range.from)).toEqual([20, 10, 1])
    expect(result.lastFolio).toBe(21)
    expect(harness.posted('af_anular2')[1]).toMatchObject({ KEY: 'frm-key', PAGINA: '2' })
  })

  test('a next button with no form and no page still walks, and the walk is bounded', async () => {
    const endless = page(
      '<form><input name=FOLIO_INI value=1><input name=FOLIO_FIN value=2></form><input name=siguiente value=x>',
    )
    const harness = await signedIn([entry, { url: `${MAULLIN}/af_anular2`, reply: { body: endless } }])
    await listFolioRanges(harness.portal, { type: 33 })
    expect(harness.posted('af_anular2')).toHaveLength(21)
    expect(harness.posted('af_anular2')[1]).toEqual({})
  })

  test('nothing to list, the wrong page and a bad type', async () => {
    const empty = await signedIn([entry, list(page('sin rangos'))])
    await expect(listFolioRanges(empty.portal, { type: 33 })).resolves.toEqual({ ranges: [], lastFolio: null })
    const lost = await signedIn([{ url: `${MAULLIN}/af_anular1`, reply: { body: page('otra') } }])
    expect((await failure(listFolioRanges(lost.portal, { type: 33 }))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect((await failure(listFolioRanges(lost.portal, { type: 1 as never }))).code).toBe('INVALID_DOCUMENT_TYPE')
  })
})

describe('annulFolios', () => {
  // Once a range was tried in the first pass, the second pass finds nothing new and stops.
  const twice = (html: string) => list(html, html)

  test('annulment needs an explicit scope', async () => {
    const harness = await signedIn([])
    const error = await failure(annulFolios(harness.portal, { type: 33 }))
    expect(error).toMatchObject({ code: 'INVALID_OPTION', details: { field: 'range' } })
    expect((await failure(annulFolios(harness.portal, { type: 1 as never, all: true }))).code).toBe(
      'INVALID_DOCUMENT_TYPE',
    )
    expect(harness.fake.requests).toHaveLength(0)
  })

  test('annuls a range with the fields of the SII form', async () => {
    const harness = await signedIn([
      entry,
      twice(unusedRangesPage([[1, 3]])),
      respond('af_anular3', ANNUL_FORM),
      respond('af_anular', ANNUL_OK),
    ])
    const result = await annulFolios(harness.portal, { type: 33, all: true })
    expect(result).toEqual({
      annulled: [{ from: 1, to: 3, count: 3 }],
      rejected: [],
      totalAnnulled: 3,
      totalRejected: 0,
      knownAnnulled: ['1-3'],
    })
    expect(harness.posted('af_anular3')[0]).toEqual({
      RUT_EMP: '76543210',
      DV_EMP: '3',
      DIA: '15',
      MES: '11',
      ANO: '2026',
      COD_DOCTO: '33',
      FOLIO_INI: '1',
      FOLIO_FIN: '3',
      CANT_DOCTOS: '3',
    })
    expect(harness.posted('af_anular')[0]).toEqual({
      TOKEN_FORM: 'z',
      MOTIVO: 'Folios no utilizados',
      FOLIO_INI_A: '1',
      FOLIO_FIN_A: '3',
    })
    expect(harness.sleeps).toEqual([1500])
  })

  test('a range asks only for the folios inside it, and its reason goes along', async () => {
    const harness = await signedIn([
      entry,
      twice(
        unusedRangesPage([
          [1, 10],
          [20, 30],
        ]),
      ),
      respond('af_anular3', ANNUL_FORM),
      respond('af_anular', ANNUL_OK),
    ])
    const result = await annulFolios(harness.portal, { type: 33, range: { from: 4, to: 6 }, reason: 'Prueba' })
    expect(result.annulled).toEqual([{ from: 4, to: 6, count: 3 }])
    expect(harness.posted('af_anular')[0]).toMatchObject({ FOLIO_INI_A: '4', FOLIO_FIN_A: '6', MOTIVO: 'Prueba' })
    expect(harness.posted('af_anular3')[0]).toMatchObject({ FOLIO_INI: '1', FOLIO_FIN: '10' })
  })

  test('withinDays skips older ranges and those without a date: when unsure, do not annul', async () => {
    const html = page(
      `${unusedRangesPage([
        [1, 2, '15-11-2026'],
        [3, 4, '01-01-2020'],
      ])}<form><input name=FOLIO_INI value=5><input name=FOLIO_FIN value=6></form>`,
    )
    const harness = await signedIn([
      entry,
      twice(html),
      respond('af_anular3', ANNUL_FORM),
      respond('af_anular', ANNUL_OK),
    ])
    const result = await annulFolios(harness.portal, { type: 33, withinDays: 1 })
    expect(result.annulled).toEqual([{ from: 1, to: 2, count: 2 }])
  })

  test('exclude and knownAnnulled are left alone', async () => {
    const harness = await signedIn([
      entry,
      list(
        unusedRangesPage([
          [1, 2],
          [3, 4],
        ]),
      ),
    ])
    const result = await annulFolios(harness.portal, {
      type: 33,
      all: true,
      exclude: [{ from: 2, to: 2 }],
      knownAnnulled: ['3-4'],
    })
    expect(result).toMatchObject({ totalAnnulled: 0, knownAnnulled: ['3-4'] })
    expect(harness.posted('af_anular3')).toEqual([])
    expect(harness.sleeps).toEqual([])
  })

  test('maxRanges takes the last ones of the listing', async () => {
    const harness = await signedIn([
      entry,
      {
        url: `${MAULLIN}/af_anular2`,
        reply: {
          body: unusedRangesPage([
            [1, 2],
            [3, 4],
            [5, 6],
          ]),
        },
      },
      { url: `${MAULLIN}/af_anular3`, reply: { body: ANNUL_FORM } },
      { url: `${MAULLIN}/af_anular`, reply: { body: ANNUL_OK } },
    ])
    await annulFolios(harness.portal, { type: 33, all: true, maxRanges: 1 })
    expect(harness.posted('af_anular3')[0]).toMatchObject({ FOLIO_INI: '5' })
    expect(harness.posted('af_anular3')).toHaveLength(3)
  })

  test('a range annulled before is remembered, without going further', async () => {
    const harness = await signedIn([
      entry,
      twice(unusedRangesPage([[1, 3]])),
      respond('af_anular3', page('anulado anteriormente')),
    ])
    const result = await annulFolios(harness.portal, { type: 33, all: true })
    expect(result.rejected).toEqual([{ from: 1, to: 3, count: 3, reason: 'alreadyAnnulled' }])
    expect(result.knownAnnulled).toEqual(['1-3'])
    expect(harness.posted('af_anular')).toEqual([])
  })

  test('a conflict goes folio by folio; only what is final is remembered', async () => {
    const harness = await signedIn([
      entry,
      twice(unusedRangesPage([[1, 4]])),
      respond('af_anular3', ANNUL_FORM),
      respond(
        'af_anular',
        page('folio recepcionado'),
        ANNUL_OK,
        page('folio recepcionado'),
        page('Error 500'),
        new DteError('TRANSPORT_FAILED'),
      ),
    ])
    const result = await annulFolios(harness.portal, { type: 33, all: true })
    expect(result.annulled).toEqual([{ from: 1, to: 1, count: 1 }])
    expect(result.rejected).toEqual([
      { from: 2, to: 2, count: 1, reason: 'received' },
      { from: 3, to: 3, count: 1, reason: 'siiError' },
      { from: 4, to: 4, count: 1, reason: 'transport' },
    ])
    expect(result.knownAnnulled).toEqual(['1-1', '2-2'])
    expect(result).toMatchObject({ totalAnnulled: 1, totalRejected: 3 })
    expect(harness.posted('af_anular')[2]).toMatchObject({ FOLIO_INI_A: '2', FOLIO_FIN_A: '2' })
  })

  test('final answers are remembered and transient ones are not', async () => {
    const received = await signedIn([
      entry,
      twice(unusedRangesPage([[1, 2]])),
      respond('af_anular3', ANNUL_FORM),
      respond('af_anular', page('fue anulado y ya esta')),
    ])
    expect((await annulFolios(received.portal, { type: 33, all: true })).knownAnnulled).toEqual(['1-2'])
    const transient = await signedIn([
      entry,
      twice(unusedRangesPage([[1, 2]])),
      respond('af_anular3', ANNUL_FORM),
      respond('af_anular', page('xxx')),
    ])
    const result = await annulFolios(transient.portal, { type: 33, all: true })
    expect(result.rejected).toEqual([{ from: 1, to: 2, count: 2, reason: 'unknown' }])
    expect(result.knownAnnulled).toEqual([])
  })

  test('two real refusals in a row abandon the pass', async () => {
    const lines: string[] = []
    const log = (message: string): void => {
      lines.push(message)
    }
    const logger: Logger = { debug: log, info: log, warn: log, error: log }
    const harness = await signedIn(
      [
        entry,
        {
          url: `${MAULLIN}/af_anular2`,
          reply: {
            body: unusedRangesPage([
              [1, 2],
              [3, 4],
              [5, 6],
            ]),
          },
        },
        respond('af_anular3', ANNUL_FORM, new DteError('TRANSPORT_FAILED'), ANNUL_FORM),
        respond('af_anular', page('la anulacion no procede'), ANNUL_OK),
      ],
      { logger },
    )
    const result = await annulFolios(harness.portal, { type: 33, all: true })
    expect(result.rejected).toEqual([
      { from: 1, to: 2, count: 2, reason: 'refused' },
      { from: 3, to: 4, count: 2, reason: 'transport' },
    ])
    expect(lines).toContain('sii portal stopped annulling: the SII keeps refusing')
    // The next pass still reaches the range the first one abandoned.
    expect(result.annulled).toEqual([{ from: 5, to: 6, count: 2 }])
  })

  test('already annulled and received are not refusals, and a success resets the count', async () => {
    const harness = await signedIn([
      entry,
      list(
        unusedRangesPage([
          [1, 2],
          [3, 4],
          [5, 6],
          [7, 8],
        ]),
        unusedRangesPage([]),
      ),
      respond('af_anular3', ANNUL_FORM, page('ya fue anulado'), ANNUL_FORM, ANNUL_FORM),
      respond('af_anular', page('la anulacion no procede'), ANNUL_OK, page('la anulacion no procede')),
    ])
    const result = await annulFolios(harness.portal, { type: 33, all: true })
    expect(result.rejected.map((entryItem) => entryItem.reason)).toEqual(['refused', 'alreadyAnnulled', 'refused'])
    expect(result.annulled).toEqual([{ from: 5, to: 6, count: 2 }])
  })

  test('a transport failure at the last step counts as a refusal', async () => {
    const harness = await signedIn([
      entry,
      twice(unusedRangesPage([[1, 2]])),
      respond('af_anular3', ANNUL_FORM),
      respond('af_anular', new DteError('TRANSPORT_FAILED')),
    ])
    const result = await annulFolios(harness.portal, { type: 33, all: true })
    expect(result.rejected).toEqual([{ from: 1, to: 2, count: 2, reason: 'transport' }])
  })

  test('a block ends everything', async () => {
    const harness = await signedIn([
      entry,
      list(unusedRangesPage([[1, 2]])),
      { url: `${MAULLIN}/af_anular3`, reply: { status: 403 } },
    ])
    expect((await failure(annulFolios(harness.portal, { type: 33, all: true }))).code).toBe('SII_PORTAL_BLOCKED')
  })

  test('the passes end after four, however many ranges keep appearing', async () => {
    const queue = [1, 2, 3, 4].map((n) => unusedRangesPage([[n * 10, n * 10 + 1]]))
    const harness = await signedIn([
      entry,
      list(...queue),
      { url: `${MAULLIN}/af_anular3`, reply: { body: ANNUL_FORM } },
      { url: `${MAULLIN}/af_anular`, reply: { body: ANNUL_OK } },
    ])
    const result = await annulFolios(harness.portal, { type: 33, all: true })
    expect(result.annulled).toHaveLength(4)
    expect(harness.sleeps).toEqual([1500, 1500, 1500])
  })

  test('a range with no date sends empty date fields', async () => {
    const html = page('<form><input name=FOLIO_INI value=5><input name=FOLIO_FIN value=6></form>')
    const harness = await signedIn([
      entry,
      twice(html),
      respond('af_anular3', ANNUL_FORM),
      respond('af_anular', ANNUL_OK),
    ])
    await annulFolios(harness.portal, { type: 33, all: true, companyRut: '10000004-0' })
    expect(harness.posted('af_anular3')[0]).toMatchObject({ DIA: '', MES: '', ANO: '', RUT_EMP: '10000004' })
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/pages-annulment tests/portal/annulment --coverage=false
```

Expected: FAIL, because the code below does not exist yet.

- [ ] **Step 3: Write the implementation**

`src/portal/pages/annulment.ts`:

```ts
import { formBlocks, inputTags, inputValues, stripTags } from '../html'

/**
 * EN: A stamped range with unused folios, as the annulment page lists it. Annulled ranges stay on this list forever.
 * ES: Un rango timbrado con folios sin usar, tal como lo lista la página de anulación. Los rangos anulados siguen en esta lista para siempre.
 */
export type UnusedFolioRange = {
  /** EN: First folio. ES: `FOLIO_INI` — Primer folio. */
  readonly from: number
  /** EN: Last folio. ES: `FOLIO_FIN` — Último folio. */
  readonly to: number
  /** EN: Folios in the range. ES: `CANT_DOCTOS` — Folios del rango. */
  readonly quantity: number
  /** EN: Stamping date, YYYY-MM-DD, or null. ES: `DIA`, `MES`, `ANO` — Fecha de timbraje, AAAA-MM-DD, o null. */
  readonly date: string | null
}

/**
 * EN: How the SII answered an attempt to annul.
 * ES: Cómo respondió el SII un intento de anulación.
 */
export type AnnulmentRejectionReason = 'alreadyAnnulled' | 'received' | 'refused' | 'siiError' | 'transport' | 'unknown'

const firstInteger = (value: string | undefined): number | null => {
  const match = /(\d+)/.exec(value ?? '')
  return match === null ? null : Number(match[1])
}

const rangeFromForm = (block: string): UnusedFolioRange | null => {
  const fields = inputValues(block)
  const from = firstInteger(fields.FOLIO_INI)
  const to = firstInteger(fields.FOLIO_FIN)
  if (from === null || to === null) return null
  const day = (fields.DIA ?? '').padStart(2, '0')
  const month = (fields.MES ?? '').padStart(2, '0')
  const year = fields.ANO ?? ''
  return {
    from,
    to,
    quantity: firstInteger(fields.CANT_DOCTOS) ?? to - from + 1,
    date: day !== '00' && month !== '00' && year !== '' ? `${year}-${month}-${day}` : null,
  }
}

const dmyToIso = (value: string): string | null => {
  const match = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(value.replace(/\s/g, ''))
  return match === null ? null : `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
}

const rangeFromRow = (row: string): UnusedFolioRange | null => {
  const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? []).map(stripTags)
  if (cells.length < 4) return null
  const from = firstInteger(cells[2])
  const to = firstInteger(cells[3])
  if (from === null || to === null) return null
  return { from, to, quantity: firstInteger(cells[1]) ?? to - from + 1, date: dmyToIso(cells[0]) }
}

const present = <T>(value: T | null): value is T => value !== null

/**
 * EN: Keeps the first of each `from-to` pair; the SII may repeat a form.
 * ES: Conserva el primero de cada par `desde-hasta`; el SII puede repetir un formulario.
 */
export const uniqueRanges = (ranges: readonly UnusedFolioRange[]): readonly UnusedFolioRange[] => {
  const seen = new Set<string>()
  return ranges.filter((range) => {
    const key = `${range.from}-${range.to}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * EN: The ranges of a listing page. Each row's form carries them in hidden fields, which survives the nested tables that
 * break a read by columns; rows without forms fall back to columns.
 * ES: Los rangos de una página del listado. El formulario de cada fila los trae en campos ocultos, lo que resiste las
 * tablas anidadas que rompen una lectura por columnas; las filas sin formulario caen a columnas.
 */
export const parseUnusedRanges = (html: string): readonly UnusedFolioRange[] => {
  const fromForms = uniqueRanges(formBlocks(html).map(rangeFromForm).filter(present))
  return fromForms.length > 0
    ? fromForms
    : (html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []).map(rangeFromRow).filter(present)
}

/**
 * EN: The "Ver siguiente" button of the listing, with the page its `cambiapag(n)` handler asks for; null on the last page.
 * ES: El botón "Ver siguiente" del listado, con la página que pide su handler `cambiapag(n)`; null en la última página.
 */
export const nextPageButton = (html: string): { readonly page: number | null } | null => {
  const button = inputTags(html).find((tag) => /siguiente|next/i.test(tag.name) || /siguiente/i.test(tag.value))
  if (button === undefined) return null
  const page = /cambiapag\((\d+)\)/i.exec(button.onClick ?? '')
  return { page: page === null ? null : Number(page[1]) }
}

/**
 * EN: `af_anular3` says the range was annulled before. "anteriormente" comes in several wordings.
 * ES: `af_anular3` dice que el rango ya se anuló. "anteriormente" viene en varias redacciones.
 */
export const isAlreadyAnnulled = (html: string): boolean =>
  html.includes('ya ha sido efectuado') ||
  html.includes('ya fue anulado') ||
  html.includes('efectuado anteriormente') ||
  /anulad[oa]\s+anteriormente/i.test(html)

/**
 * EN: The SII authorized the annulment.
 * ES: El SII autorizó la anulación.
 */
export const isAnnulmentAccepted = (html: string): boolean =>
  html.includes('ha autorizado la anulaci') || html.includes('SOLICITUD ANULACION DE FOLIOS')

/**
 * EN: The whole range cannot go: part of it was annulled or received before, so it goes folio by folio.
 * ES: El rango completo no puede: parte de él ya se anuló o recibió, así que se sigue folio por folio.
 */
export const isAnnulmentConflict = (html: string): boolean =>
  html.includes('ya ha sido efectuado') ||
  html.includes('ya fue anulado') ||
  html.includes('efectuado anteriormente') ||
  html.includes('recepcionad')

/**
 * EN: Why an annulment was not accepted.
 * ES: Por qué una anulación no se aceptó.
 */
export const annulmentRefusal = (html: string): AnnulmentRejectionReason => {
  const text = html.toLowerCase()
  if (text.includes('recepcionad')) return 'received'
  if (
    text.includes('ya fue anulado') ||
    text.includes('anulado anteriormente') ||
    text.includes('ya ha sido efectuado anteriormente') ||
    (text.includes('anulad') && text.includes('ya'))
  )
    return 'alreadyAnnulled'
  if (text.includes('anulaci') && text.includes('no')) return 'refused'
  if (text.includes('error 500') || text.includes('internal server error')) return 'siiError'
  return 'unknown'
}
```

`src/portal/annulment.ts`:

```ts
import { isDocumentType, type DocumentType } from '../catalogs/document-types'
import { cgiUrl } from '../catalogs/portal'
import { DteError } from '../errors'
import type { CallOverrides } from '../sii/client'
import { isRetryablePortalError, resolvePortalCompany, type PortalClient } from './client'
import { formAction, inputValues, namedForm } from './html'
import {
  annulmentRefusal,
  isAlreadyAnnulled,
  isAnnulmentAccepted,
  isAnnulmentConflict,
  nextPageButton,
  parseUnusedRanges,
  uniqueRanges,
  type AnnulmentRejectionReason,
  type UnusedFolioRange,
} from './pages/annulment'
import {
  companyFields,
  ensurePage,
  submitForm,
  unexpectedPage,
  withPortalSession,
  type PortalContext,
  type PortalPage,
} from './session'

const MAX_EXTRA_PAGES = 20
const MAX_PASSES = 4
const PASS_PAUSE_MS = 1500
const DEFAULT_MAX_RANGES = 50
const MAX_REFUSALS_IN_A_ROW = 2
const DEFAULT_REASON = 'Folios no utilizados'
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * EN: The unused ranges of a document type.
 * ES: Los rangos sin usar de un tipo de documento.
 */
export type FolioRanges = {
  /** EN: Every unused range, annulled ones included: the SII does not tell them apart. ES: Todos los rangos sin usar, incluidos los anulados: el SII no los distingue. */
  readonly ranges: readonly UnusedFolioRange[]
  /** EN: Highest folio listed, or null. ES: Mayor folio listado, o null. */
  readonly lastFolio: number | null
}

/**
 * EN: Some folios and how many they are.
 * ES: Algunos folios y cuántos son.
 */
export type FolioSpan = {
  /** EN: First folio. ES: Primer folio. */
  readonly from: number
  /** EN: Last folio. ES: Último folio. */
  readonly to: number
  /** EN: Folios it covers. ES: Folios que cubre. */
  readonly count: number
}

/**
 * EN: Input of `annulFolios`. One of `range`, `withinDays` or `all` is required: annulment cannot be undone and annulled
 * folios count against the stamping quota for six months.
 * ES: Entrada de `annulFolios`. Se exige `range`, `withinDays` o `all`: la anulación no se puede deshacer y los folios
 * anulados pesan contra el cupo de timbraje durante seis meses.
 */
export type AnnulFoliosInput = {
  /** EN: Document type. ES: `COD_DOCTO` — Tipo de documento. */
  readonly type: DocumentType
  /** EN: Only these folios. ES: `FOLIO_INI_A`, `FOLIO_FIN_A` — Solo estos folios. */
  readonly range?: { readonly from: number; readonly to: number }
  /** EN: Only ranges stamped within these days; a range with no readable date is skipped. ES: Solo rangos timbrados en estos días; un rango sin fecha legible se omite. */
  readonly withinDays?: number
  /** EN: Every unused range, up to `maxRanges`. ES: Todos los rangos sin usar, hasta `maxRanges`. */
  readonly all?: boolean
  /** EN: Reason; "Folios no utilizados" by default. ES: `MOTIVO` — Motivo; "Folios no utilizados" por defecto. */
  readonly reason?: string
  /** EN: Most ranges per pass, the last ones of the listing; 50 by default. ES: Máximo de rangos por pasada, los últimos del listado; 50 por defecto. */
  readonly maxRanges?: number
  /** EN: Folios never to touch, such as a CAF still in use. ES: Folios que no se tocan, como un CAF todavía en uso. */
  readonly exclude?: readonly { readonly from: number; readonly to: number }[]
  /** EN: `knownAnnulled` of the previous run: these are not tried again. ES: `knownAnnulled` de la corrida anterior: estos no se vuelven a intentar. */
  readonly knownAnnulled?: readonly string[]
  /** EN: Company RUT; the client's by default. ES: `RUT_EMP` + `DV_EMP` — RUT de la empresa; por defecto el del cliente. */
  readonly companyRut?: string
}

/**
 * EN: What an annulment did.
 * ES: Lo que hizo una anulación.
 */
export type AnnulmentResult = {
  /** EN: Folios annulled. ES: Folios anulados. */
  readonly annulled: readonly FolioSpan[]
  /** EN: Folios not annulled, and why. `alreadyAnnulled` and `received` are expected results, not refusals. ES: Folios no anulados y por qué. `alreadyAnnulled` y `received` son resultados esperados, no negativas. */
  readonly rejected: readonly (FolioSpan & { readonly reason: AnnulmentRejectionReason })[]
  /** EN: Sum of `annulled`. ES: Suma de `annulled`. */
  readonly totalAnnulled: number
  /** EN: Sum of `rejected`. ES: Suma de `rejected`. */
  readonly totalRejected: number
  /** EN: `from-to` keys that are final: persist it and pass it back, because the portal keeps listing them forever. ES: Claves `desde-hasta` definitivas: guárdalas y devuélvelas, porque el portal las sigue listando para siempre. */
  readonly knownAnnulled: readonly string[]
}

const at = (context: PortalContext, page: string): string => cgiUrl(context.portal.environment, page)

const moreRanges = async (
  context: PortalContext,
  current: PortalPage,
  ranges: readonly UnusedFolioRange[],
  remaining: number,
): Promise<readonly UnusedFolioRange[]> => {
  const button = nextPageButton(current.html)
  if (button === null || remaining === 0) return ranges
  const form = namedForm(current.html, 'frm') ?? ''
  const action = formAction(form) ?? at(context, 'af_anular2')
  const next = await submitForm(
    context,
    'af_anular2.page',
    action,
    current.url,
    { ...inputValues(form), ...(button.page === null ? {} : { PAGINA: String(button.page) }) },
    at(context, 'af_anular2'),
  )
  const merged = uniqueRanges([...ranges, ...parseUnusedRanges(next.html)])
  return moreRanges(
    context,
    next,
    [...merged].sort((a, b) => b.to - a.to),
    remaining - 1,
  )
}

const listInSession = async (context: PortalContext, type: number, companyRut?: string): Promise<FolioRanges> => {
  const company = companyFields(resolvePortalCompany(context.portal, companyRut))
  const entry = await ensurePage(context, 'af_anular1', at(context, 'af_anular1'))
  if (!entry.html.includes('ANULACION DE FOLIOS')) throw unexpectedPage(context, 'af_anular1', entry.html)
  const first = await submitForm(
    context,
    'af_anular2',
    at(context, 'af_anular2'),
    entry.url,
    { ...inputValues(entry.html), ...company, PAGINA: '1', COD_DOCTO: String(type), ACEPTAR: 'Consultar' },
    at(context, 'af_anular1'),
  )
  const ranges = await moreRanges(context, first, parseUnusedRanges(first.html), MAX_EXTRA_PAGES)
  return { ranges, lastFolio: ranges.length === 0 ? null : Math.max(...ranges.map((range) => range.to)) }
}

const assertDocumentType = (type: unknown): void => {
  if (!isDocumentType(type)) throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type' })
}

/**
 * EN: Lists the unused ranges of a document type, following the pages of the listing. It changes nothing.
 * ES: Lista los rangos sin usar de un tipo de documento, siguiendo las páginas del listado. No cambia nada.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: document type and company. ES: tipo de documento y empresa.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the ranges and the highest folio. ES: los rangos y el mayor folio.
 * @throws {DteError} EN: `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const listFolioRanges = (
  portal: PortalClient,
  input: { readonly type: DocumentType; readonly companyRut?: string },
  overrides?: CallOverrides,
): Promise<FolioRanges> =>
  withPortalSession(portal, 'listFolioRanges', overrides, (context) => {
    assertDocumentType(input.type)
    return listInSession(context, input.type, input.companyRut)
  })

const overlaps = (range: UnusedFolioRange, span: { readonly from: number; readonly to: number }): boolean =>
  range.from <= span.to && range.to >= span.from

const inScope = (range: UnusedFolioRange, input: AnnulFoliosInput, earliestMs: number | null): boolean => {
  if (input.range !== undefined && !overlaps(range, input.range)) return false
  if (earliestMs !== null && (range.date === null || new Date(`${range.date}T00:00:00Z`).getTime() < earliestMs))
    return false
  return !(input.exclude ?? []).some((span) => overlaps(range, span))
}

// A transport failure on one range is recorded and the walk goes on; a block or a limit ends the whole operation.
const attempt = async (
  context: PortalContext,
  step: string,
  page: string,
  base: string,
  fields: Readonly<Record<string, string>>,
  referer: string,
): Promise<PortalPage | null> => {
  try {
    return await submitForm(context, step, at(context, page), base, fields, referer)
  } catch (error) {
    if (isRetryablePortalError(error)) return null
    throw error
  }
}

const isFinal = (reason: AnnulmentRejectionReason): boolean => reason === 'alreadyAnnulled' || reason === 'received'
const isRefusal = (reason: AnnulmentRejectionReason): boolean => !isFinal(reason)

type Tally = {
  readonly annulled: FolioSpan[]
  readonly rejected: (FolioSpan & { readonly reason: AnnulmentRejectionReason })[]
  readonly known: Set<string>
}

const annulOneByOne = async (
  context: PortalContext,
  span: FolioSpan,
  fields: Readonly<Record<string, string>>,
  base: string,
  tally: Tally,
): Promise<void> => {
  for (let folio = span.from; folio <= span.to; folio += 1) {
    const one = { from: folio, to: folio, count: 1 }
    const answer = await attempt(
      context,
      'af_anular.folio',
      'af_anular',
      base,
      { ...fields, FOLIO_INI_A: String(folio), FOLIO_FIN_A: String(folio) },
      at(context, 'af_anular3'),
    )
    if (answer === null) {
      tally.rejected.push({ ...one, reason: 'transport' })
    } else if (isAnnulmentAccepted(answer.html)) {
      tally.annulled.push(one)
      tally.known.add(`${folio}-${folio}`)
    } else {
      const reason = annulmentRefusal(answer.html)
      tally.rejected.push({ ...one, reason })
      if (isFinal(reason)) tally.known.add(`${folio}-${folio}`)
    }
  }
}

// Returns the refusals this range adds to the count; `null` resets it. Only real refusals count: `alreadyAnnulled` and
// `received` come mixed with successes, and counting them once stopped a clean-up with ranges still annullable.
const annulRange = async (
  context: PortalContext,
  range: UnusedFolioRange,
  input: AnnulFoliosInput,
  company: ReturnType<typeof companyFields>,
  tally: Tally,
): Promise<number | null> => {
  const from = input.range === undefined ? range.from : Math.max(range.from, input.range.from)
  const to = input.range === undefined ? range.to : Math.min(range.to, input.range.to)
  const span = { from, to, count: to - from + 1 }
  const [year, month = '', day = ''] = (range.date ?? '').split('-')
  const entryForm = await attempt(
    context,
    'af_anular3',
    'af_anular3',
    at(context, 'af_anular2'),
    {
      ...company,
      DIA: day,
      MES: month,
      ANO: year,
      COD_DOCTO: String(input.type),
      FOLIO_INI: String(range.from),
      FOLIO_FIN: String(range.to),
      CANT_DOCTOS: String(range.quantity),
    },
    at(context, 'af_anular2'),
  )
  if (entryForm === null) {
    tally.rejected.push({ ...span, reason: 'transport' })
    return 1
  }
  if (isAlreadyAnnulled(entryForm.html)) {
    tally.rejected.push({ ...span, reason: 'alreadyAnnulled' })
    tally.known.add(`${from}-${to}`)
    return 0
  }
  const fields = {
    ...inputValues(entryForm.html),
    FOLIO_INI_A: String(from),
    FOLIO_FIN_A: String(to),
    MOTIVO: input.reason ?? DEFAULT_REASON,
  }
  const answer = await attempt(context, 'af_anular', 'af_anular', entryForm.url, fields, at(context, 'af_anular3'))
  if (answer === null) {
    tally.rejected.push({ ...span, reason: 'transport' })
    return 1
  }
  if (isAnnulmentAccepted(answer.html)) {
    tally.annulled.push(span)
    tally.known.add(`${from}-${to}`)
    return null
  }
  if (isAnnulmentConflict(answer.html)) {
    await annulOneByOne(context, span, fields, entryForm.url, tally)
    return 0
  }
  const reason = annulmentRefusal(answer.html)
  tally.rejected.push({ ...span, reason })
  if (isFinal(reason)) tally.known.add(`${from}-${to}`)
  return isRefusal(reason) ? 1 : 0
}

const sum = (spans: readonly FolioSpan[]): number => spans.reduce((total, span) => total + span.count, 0)

/**
 * EN: `annulFolios` inside a session already held.
 * ES: `annulFolios` dentro de una sesión ya tomada.
 */
export const annulFoliosInSession = async (
  context: PortalContext,
  input: AnnulFoliosInput,
): Promise<AnnulmentResult> => {
  assertDocumentType(input.type)
  if (input.range === undefined && input.withinDays === undefined && input.all !== true)
    throw new DteError('INVALID_OPTION', { field: 'range' })
  const company = companyFields(resolvePortalCompany(context.portal, input.companyRut))
  const earliestMs = input.withinDays === undefined ? null : context.portal.now().getTime() - input.withinDays * DAY_MS
  const tally: Tally = { annulled: [], rejected: [], known: new Set(input.knownAnnulled ?? []) }
  const seen = new Set<string>()
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const { ranges } = await listInSession(context, input.type, input.companyRut)
    const candidates = ranges
      .filter((range) => inScope(range, input, earliestMs))
      .filter((range) => !tally.known.has(`${range.from}-${range.to}`) && !seen.has(`${range.from}-${range.to}`))
      .slice(-(input.maxRanges ?? DEFAULT_MAX_RANGES))
    if (candidates.length === 0) break
    const counter = { refusals: 0 }
    for (const range of candidates) {
      if (counter.refusals >= MAX_REFUSALS_IN_A_ROW) {
        context.portal.logger.warn('sii portal stopped annulling: the SII keeps refusing', {
          operation: context.operation,
          type: input.type,
        })
        break
      }
      seen.add(`${range.from}-${range.to}`)
      const added = await annulRange(context, range, input, company, tally)
      counter.refusals = added === null ? 0 : counter.refusals + added
    }
    if (pass < MAX_PASSES - 1) await context.portal.sleep(PASS_PAUSE_MS, context.overrides?.signal)
  }
  return {
    annulled: tally.annulled,
    rejected: tally.rejected,
    totalAnnulled: sum(tally.annulled),
    totalRejected: sum(tally.rejected),
    knownAnnulled: [...tally.known],
  }
}

/**
 * EN: Annuls unused folios: up to four passes over the listing, by range and folio by folio when the range conflicts,
 * stopping after two real refusals in a row. Annulment cannot be undone and counts against the quota for six months; to
 * lift a stamping block, issuing with the unused folios works and annulling makes it worse.
 * ES: Anula folios sin usar: hasta cuatro pasadas por el listado, por rango y folio por folio cuando el rango choca,
 * deteniéndose tras dos negativas reales seguidas. La anulación no se puede deshacer y pesa contra el cupo seis meses; para
 * levantar un bloqueo de timbraje, emitir con los folios sin usar sirve y anular lo empeora.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: type and an explicit scope. ES: tipo y un alcance explícito.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: what was annulled, what was not, and the memory to persist. ES: lo anulado, lo no anulado y la memoria que guardar.
 * @throws {DteError} EN: `INVALID_OPTION { field: 'range' }` without a scope, `SII_PORTAL_UNEXPECTED_PAGE`, session and block codes. ES: `INVALID_OPTION { field: 'range' }` sin alcance, `SII_PORTAL_UNEXPECTED_PAGE`, códigos de sesión y bloqueo.
 */
export const annulFolios = (
  portal: PortalClient,
  input: AnnulFoliosInput,
  overrides?: CallOverrides,
): Promise<AnnulmentResult> =>
  withPortalSession(portal, 'annulFolios', overrides, (context) => annulFoliosInSession(context, input))
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/pages-annulment tests/portal/annulment --coverage=false
```

Expected: PASS, 40 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
git add src/portal/pages/annulment.ts src/portal/annulment.ts tests/portal/pages-annulment.test.ts tests/portal/annulment.test.ts
git commit -m "feat: list and annul unused folio ranges"
```

---

## Task 11: Re-download of authorized ranges

`rf_*`: the list does not mark annulled ranges, so each one takes a request. It costs no quota.

**Files:**
- Create: `src/portal/pages/reobtain.ts`
- Create: `src/portal/reobtain.ts`
- Create: `tests/portal/reobtain.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/portal/reobtain.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import {
  isRangeAnnulled,
  parseReobtainList,
  reobtainDownloadFields,
  reobtainFormFields,
} from '../../src/portal/pages/reobtain'
import { listReobtainableRanges, reobtainCaf, type ReobtainableRange } from '../../src/portal/reobtain'
import { fixturePath } from '../support/fixtures'
import { failure, MAULLIN, signedIn } from '../support/portal'
import { page, REOBTAIN_RESOLUTION, reobtainDetailPage, reobtainListPage } from '../support/portal-pages'

const CAF_XML = readFileSync(fixturePath('caf-33.xml'), 'latin1')

test('page readers', () => {
  expect(parseReobtainList(reobtainListPage([[1, 9]]))).toEqual([{ FOLIO_INI: '1', FOLIO_FIN: '9', COD_DOCTO: '33' }])
  expect(
    parseReobtainList(page('<form name=other><input name=FOLIO_INI value=1></form><form name=frm1></form>')),
  ).toEqual([])
  expect(isRangeAnnulled(reobtainDetailPage(1, true))).toBe(true)
  expect(isRangeAnnulled(reobtainDetailPage(1))).toBe(false)
  expect(reobtainFormFields(reobtainDetailPage(1))).toEqual({ FOLIO_INI: '1' })
  expect(reobtainFormFields(page('nada'))).toBeNull()
  expect(reobtainFormFields(page('<form name=form1></form>'))).toBeNull()
  expect(reobtainDownloadFields(REOBTAIN_RESOLUTION)).toEqual({ FOLIO_INI: '1', FOLIO_FIN: '9' })
  expect(reobtainDownloadFields(page('nada'))).toBeNull()
  expect(reobtainDownloadFields(page('<form action="/rf_genera_archivo"></form>'))).toBeNull()
})

describe('listReobtainableRanges', () => {
  test('opens each range, because only its detail says it is annulled', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/rf_reobtencion1_folios`, reply: { body: page('form') } },
      {
        url: `${MAULLIN}/rf_reobtencion2_folios`,
        reply: {
          body: reobtainListPage([
            [1, 9],
            [20, 29],
          ]),
        },
      },
      {
        url: `${MAULLIN}/rf_reobtencion3_folios`,
        reply: [{ body: reobtainDetailPage(1) }, { body: reobtainDetailPage(20, true) }],
      },
    ])
    const ranges = await listReobtainableRanges(harness.portal, { type: 33 })
    expect(ranges).toEqual([
      {
        from: 1,
        to: 9,
        quantity: 9,
        annulled: false,
        formFields: { FOLIO_INI: '1', FOLIO_FIN: '9', COD_DOCTO: '33' },
        downloadFields: { FOLIO_INI: '1' },
      },
      {
        from: 20,
        to: 29,
        quantity: 10,
        annulled: true,
        formFields: { FOLIO_INI: '20', FOLIO_FIN: '29', COD_DOCTO: '33' },
        downloadFields: { FOLIO_INI: '20' },
      },
    ])
    expect(harness.posted('rf_reobtencion2_folios')).toEqual([
      { RUT_EMP: '76543210', DV_EMP: '3', PAGINA: '1', COD_DOCTO: '33', ACEPTAR: 'Consultar' },
    ])
  })

  test('a bad type stops it', async () => {
    const harness = await signedIn([])
    expect((await failure(listReobtainableRanges(harness.portal, { type: 1 as never }))).code).toBe(
      'INVALID_DOCUMENT_TYPE',
    )
  })
})

describe('reobtainCaf', () => {
  const range: ReobtainableRange = {
    from: 1,
    to: 9,
    quantity: 9,
    annulled: false,
    formFields: { FOLIO_INI: '1', FOLIO_FIN: '9' },
    downloadFields: { FOLIO_INI: '1' },
  }
  const routes = (resolution: string, file: string) => [
    { url: `${MAULLIN}/rf_genera_folio`, reply: { body: resolution } },
    { url: `${MAULLIN}/rf_genera_archivo`, reply: { body: file } },
  ]

  test('two steps: the resolution, then the file', async () => {
    const harness = await signedIn(routes(REOBTAIN_RESOLUTION, CAF_XML))
    await expect(reobtainCaf(harness.portal, { type: 33, range })).resolves.toMatchObject({
      recovered: true,
      granted: 100,
      maxAuthorized: null,
    })
    expect(harness.posted('rf_genera_folio')).toEqual([{ FOLIO_INI: '1', ACEPTAR: 'Solicitar Folios' }])
    expect(harness.posted('rf_genera_archivo')).toEqual([{ FOLIO_INI: '1', FOLIO_FIN: '9', ACEPTAR: 'AQUI' }])
  })

  test.each([
    ['rangeAnnulled', { ...range, annulled: true }, REOBTAIN_RESOLUTION, CAF_XML],
    ['reobtainFormMissing', { ...range, downloadFields: null }, REOBTAIN_RESOLUTION, CAF_XML],
    ['reobtainDownloadMissing', range, page('nada'), CAF_XML],
    ['reobtainCafMissing', range, REOBTAIN_RESOLUTION, page('nada')],
  ])('%s', async (rejection, input, resolution, file) => {
    const harness = await signedIn(routes(resolution, file))
    const error = await failure(reobtainCaf(harness.portal, { type: 33, range: input }))
    expect(error.details).toMatchObject({ rejection, type: 33, range: { from: 1, to: 9 } })
  })

  test('a bad type stops it', async () => {
    const harness = await signedIn([])
    expect((await failure(reobtainCaf(harness.portal, { type: 1 as never, range }))).code).toBe('INVALID_DOCUMENT_TYPE')
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/reobtain --coverage=false
```

Expected: FAIL, because the code below does not exist yet.

- [ ] **Step 3: Write the implementation**

`src/portal/pages/reobtain.ts`:

```ts
import { formBlocks, formWithAction, inputValues, namedForm } from '../html'

const hasRange = (fields: Readonly<Record<string, string>>): boolean => Boolean(fields.FOLIO_INI && fields.FOLIO_FIN)

/**
 * EN: The fields of each range of the list, one `<form name="frmN">` per range.
 * ES: Los campos de cada rango de la lista, un `<form name="frmN">` por rango.
 */
export const parseReobtainList = (html: string): readonly Readonly<Record<string, string>>[] =>
  formBlocks(html)
    .filter((block) => /<form\b[^>]*\bname\s*=\s*["']?frm\d+/i.test(block))
    .map(inputValues)
    .filter(hasRange)

/**
 * EN: The detail page says the range is annulled: the list itself does not.
 * ES: La página de detalle dice que el rango está anulado: la lista no lo dice.
 */
export const isRangeAnnulled = (html: string): boolean => /ha sido anulado/i.test(html)

/**
 * EN: The fields of the final form of the detail page, or null.
 * ES: Los campos del formulario final de la página de detalle, o null.
 */
export const reobtainFormFields = (html: string): Readonly<Record<string, string>> | null => {
  const form = namedForm(html, 'form1')
  const fields = form === null ? {} : inputValues(form)
  return fields.FOLIO_INI ? fields : null
}

/**
 * EN: The fields of the download form that follows the resolution, or null.
 * ES: Los campos del formulario de descarga que sigue a la resolución, o null.
 */
export const reobtainDownloadFields = (html: string): Readonly<Record<string, string>> | null => {
  const form = formWithAction(html, 'rf_genera_archivo')
  const fields = form === null ? {} : inputValues(form)
  return fields.FOLIO_INI ? fields : null
}
```

`src/portal/reobtain.ts`:

```ts
import { parseCaf } from '../caf/parse'
import { isDocumentType, type DocumentType } from '../catalogs/document-types'
import { cgiUrl } from '../catalogs/portal'
import { DteError } from '../errors'
import type { CallOverrides } from '../sii/client'
import { resolvePortalCompany, type PortalClient } from './client'
import { isRangeAnnulled, parseReobtainList, reobtainDownloadFields, reobtainFormFields } from './pages/reobtain'
import { hasCaf } from './pages/stamping'
import { companyFields, ensurePage, rejected, submitForm, withPortalSession, type PortalContext } from './session'
import type { ObtainedCaf } from './stamping'

/**
 * EN: An authorized range the SII lets download again. The list also holds ranges already issued, which the SII does not
 * mark at all: re-using one gets each document rejected with `DTE-3-101`.
 * ES: Un rango autorizado que el SII deja volver a descargar. La lista también trae rangos ya emitidos, que el SII no marca
 * de ninguna forma: reutilizar uno hace que cada documento se rechace con `DTE-3-101`.
 */
export type ReobtainableRange = {
  /** EN: First folio. ES: `FOLIO_INI` — Primer folio. */
  readonly from: number
  /** EN: Last folio. ES: `FOLIO_FIN` — Último folio. */
  readonly to: number
  /** EN: Folios in the range. ES: Folios del rango. */
  readonly quantity: number
  /** EN: The range is annulled; documents with these folios would be rejected. ES: El rango está anulado; los documentos con estos folios se rechazarían. */
  readonly annulled: boolean
  /** EN: Fields of the range in the list. ES: Campos del rango en la lista. */
  readonly formFields: Readonly<Record<string, string>>
  /** EN: Fields of the final form, or null when the SII gave none. ES: Campos del formulario final, o null si el SII no dio ninguno. */
  readonly downloadFields: Readonly<Record<string, string>> | null
}

const at = (context: PortalContext, page: string): string => cgiUrl(context.portal.environment, page)

const assertDocumentType = (type: unknown): void => {
  if (!isDocumentType(type)) throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type' })
}

/**
 * EN: `listReobtainableRanges` inside a session already held.
 * ES: `listReobtainableRanges` dentro de una sesión ya tomada.
 */
export const listReobtainableInSession = async (
  context: PortalContext,
  input: { readonly type: DocumentType; readonly companyRut?: string },
): Promise<readonly ReobtainableRange[]> => {
  assertDocumentType(input.type)
  const company = companyFields(resolvePortalCompany(context.portal, input.companyRut))
  const entry = await ensurePage(context, 'rf_reobtencion1', at(context, 'rf_reobtencion1_folios'))
  const list = await submitForm(
    context,
    'rf_reobtencion2',
    at(context, 'rf_reobtencion2_folios'),
    entry.url,
    { ...company, PAGINA: '1', COD_DOCTO: String(input.type), ACEPTAR: 'Consultar' },
    at(context, 'rf_reobtencion1_folios'),
  )
  const ranges: ReobtainableRange[] = []
  for (const formFields of parseReobtainList(list.html)) {
    const detail = await submitForm(
      context,
      'rf_reobtencion3',
      at(context, 'rf_reobtencion3_folios'),
      list.url,
      formFields,
      at(context, 'rf_reobtencion2_folios'),
    )
    const from = Number(formFields.FOLIO_INI)
    const to = Number(formFields.FOLIO_FIN)
    ranges.push({
      from,
      to,
      quantity: to - from + 1,
      annulled: isRangeAnnulled(detail.html),
      formFields,
      downloadFields: reobtainFormFields(detail.html),
    })
  }
  return ranges
}

/**
 * EN: `reobtainCaf` inside a session already held.
 * ES: `reobtainCaf` dentro de una sesión ya tomada.
 */
export const reobtainCafInSession = async (
  context: PortalContext,
  input: { readonly type: DocumentType; readonly range: ReobtainableRange },
): Promise<ObtainedCaf> => {
  assertDocumentType(input.type)
  const { type, range } = input
  const details = { type, range: { from: range.from, to: range.to } }
  if (range.annulled) throw rejected(context, 'rangeAnnulled', details)
  if (range.downloadFields === null) throw rejected(context, 'reobtainFormMissing', details)
  const resolution = await submitForm(
    context,
    'rf_genera_folio',
    at(context, 'rf_genera_folio'),
    at(context, 'rf_reobtencion3_folios'),
    { ...range.downloadFields, ACEPTAR: 'Solicitar Folios' },
    at(context, 'rf_reobtencion3_folios'),
  )
  const downloadFields = reobtainDownloadFields(resolution.html)
  if (downloadFields === null) throw rejected(context, 'reobtainDownloadMissing', details)
  const answer = await submitForm(
    context,
    'rf_genera_archivo',
    at(context, 'rf_genera_archivo'),
    resolution.url,
    { ...downloadFields, ACEPTAR: 'AQUI' },
    at(context, 'rf_genera_folio'),
  )
  if (!hasCaf(answer.html)) throw rejected(context, 'reobtainCafMissing', details)
  const caf = parseCaf(answer.html)
  return {
    xml: answer.html,
    caf,
    granted: caf.range.to - caf.range.from + 1,
    maxAuthorized: null,
    availableFolios: null,
    recovered: true,
  }
}

/**
 * EN: Lists the authorized ranges the SII lets download again. Annulled ranges appear there unmarked, so learning which
 * are costs one request per range.
 * ES: Lista los rangos autorizados que el SII deja volver a descargar. Los rangos anulados aparecen sin marcar, así que
 * saber cuáles lo son cuesta una petición por rango.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: document type and company. ES: tipo de documento y empresa.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the ranges. ES: los rangos.
 * @throws {DteError} EN: session and transport codes. ES: códigos de sesión y de transporte.
 */
export const listReobtainableRanges = (
  portal: PortalClient,
  input: { readonly type: DocumentType; readonly companyRut?: string },
  overrides?: CallOverrides,
): Promise<readonly ReobtainableRange[]> =>
  withPortalSession(portal, 'listReobtainableRanges', overrides, (context) => listReobtainableInSession(context, input))

/**
 * EN: Downloads the CAF of an already authorized range. It costs no quota.
 * ES: Descarga el CAF de un rango ya autorizado. No gasta cupo.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: type and a range from `listReobtainableRanges`. ES: tipo y un rango de `listReobtainableRanges`.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the CAF, with `recovered: true`; its XML holds a private key. ES: el CAF, con `recovered: true`; su XML contiene una llave privada.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED`, session and transport codes, `CAF_INVALID`. ES: los mismos códigos.
 */
export const reobtainCaf = (
  portal: PortalClient,
  input: { readonly type: DocumentType; readonly range: ReobtainableRange },
  overrides?: CallOverrides,
): Promise<ObtainedCaf> =>
  withPortalSession(portal, 'reobtainCaf', overrides, (context) => reobtainCafInSession(context, input))
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/reobtain --coverage=false
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
git add src/portal/pages/reobtain.ts src/portal/reobtain.ts tests/portal/reobtain.test.ts
git commit -m "feat: download authorized ranges again"
```

---

## Task 12: Composite flows

These return refusals as data (D33), so the CAFs already obtained reach the caller.

**Files:**
- Create: `src/portal/flows.ts`
- Create: `tests/portal/flows.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/portal/flows.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { DteError } from '../../src/errors'
import { reobtainFolios, requestCafExact, requestCafInBatches } from '../../src/portal/flows'
import type { Logger } from '../../src/sii/logger'
import { FIXED_NOW, fixturePath } from '../support/fixtures'
import { failure, MAULLIN, signedIn } from '../support/portal'
import {
  ANNUL_ENTRY,
  ANNUL_FORM,
  ANNUL_OK,
  page,
  quotaForm,
  REJECTION_PAGES,
  REOBTAIN_RESOLUTION,
  reobtainDetailPage,
  reobtainListPage,
  STAMP_ENTRY,
  unusedRangesPage,
} from '../support/portal-pages'

const CAF_XML = readFileSync(fixturePath('caf-33.xml'), 'latin1')
const OLD_CAF_XML = readFileSync(fixturePath('caf-33-old.xml'), 'latin1')
const entry = { url: `${MAULLIN}/of_solicita_folios`, method: 'GET' as const, reply: { body: STAMP_ENTRY } }
const replies = (name: string, ...bodies: readonly (string | Error | { status: number })[]) => ({
  url: `${MAULLIN}/${name}`,
  method: 'POST' as const,
  reply: bodies.map((body) => (typeof body === 'string' ? { body } : body)),
})
const annulRoutes = (ranges: string, form: string = ANNUL_FORM) => [
  { url: `${MAULLIN}/af_anular1`, reply: { body: ANNUL_ENTRY } },
  { url: `${MAULLIN}/af_anular2`, reply: { body: ranges } },
  { url: `${MAULLIN}/af_anular3`, reply: { body: form } },
  { url: `${MAULLIN}/af_anular`, reply: { body: ANNUL_OK } },
]

describe('requestCafExact', () => {
  test('one CAF that covers everything', async () => {
    const harness = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', quotaForm(100, 0)),
      replies('of_confirma_folio', CAF_XML),
    ])
    const result = await requestCafExact(harness.portal, { type: 33, quantity: 100 })
    expect(result).toMatchObject({
      complete: true,
      granted: 100,
      rejection: null,
      maxAuthorized: 100,
      availableFolios: 0,
    })
    expect(result.cafs).toHaveLength(1)
    expect(harness.posted('of_solicita_folios_dcto')[0].CANTIDAD).toBe('100')
  })

  test('a CAF shorter than asked still reaches the caller', async () => {
    const harness = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', quotaForm()),
      replies('of_confirma_folio', CAF_XML),
    ])
    const result = await requestCafExact(harness.portal, { type: 33, quantity: 500, companyRut: '10000004-0' })
    expect(result).toMatchObject({ complete: false, rejection: 'foliosShort', granted: 100 })
    expect(result.cafs).toHaveLength(1)
  })

  test('a refusal is data, and annulling stays off by default', async () => {
    const harness = await signedIn([entry, replies('of_solicita_folios_dcto', quotaForm(2, 6))])
    await expect(requestCafExact(harness.portal, { type: 33, quantity: 5 })).resolves.toEqual({
      complete: false,
      cafs: [],
      granted: 0,
      maxAuthorized: 2,
      availableFolios: 6,
      rejection: 'quotaInsufficient',
      portalMessage: expect.any(String),
    })
    expect(harness.urls().some((url) => url.includes('af_anular'))).toBe(false)
  })

  test('with allowAnnul it annuls and asks once more', async () => {
    const harness = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', quotaForm(2, 6), quotaForm(100, 0)),
      replies('of_confirma_folio', CAF_XML),
      ...annulRoutes(unusedRangesPage([[1, 6]])),
    ])
    const result = await requestCafExact(harness.portal, { type: 33, quantity: 5, allowAnnul: true })
    expect(result).toMatchObject({ complete: true, availableFolios: 0 })
    expect(harness.posted('af_anular')).not.toEqual([])
  })

  test('a blocked type has no FOLIOS_DISP, and that case does try', async () => {
    const harness = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', REJECTION_PAGES.stampingBlocked, quotaForm(100, 0)),
      replies('of_confirma_folio', CAF_XML),
      ...annulRoutes(unusedRangesPage([[1, 6]])),
    ])
    await expect(
      requestCafExact(harness.portal, { type: 33, quantity: 5, allowAnnul: true, companyRut: '76543210-3' }),
    ).resolves.toMatchObject({ complete: true })
  })

  test('FOLIOS_DISP 0 means nothing is annullable: no attempt', async () => {
    const harness = await signedIn([entry, replies('of_solicita_folios_dcto', quotaForm(2, 0))])
    const result = await requestCafExact(harness.portal, { type: 33, quantity: 5, allowAnnul: true })
    expect(result.rejection).toBe('quotaInsufficient')
    expect(harness.urls().some((url) => url.includes('af_anular'))).toBe(false)
  })

  test('nothing annulled is its own answer', async () => {
    const harness = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', quotaForm(2, 6)),
      ...annulRoutes(page('sin rangos')),
    ])
    const result = await requestCafExact(harness.portal, { type: 33, quantity: 5, allowAnnul: true })
    expect(result).toMatchObject({ complete: false, rejection: 'noAnnullableFolios', availableFolios: 6 })
  })

  test('a refusal annulling cannot help is returned as it is', async () => {
    const harness = await signedIn([entry, replies('of_solicita_folios_dcto', REJECTION_PAGES.companyNotAuthorized)])
    const result = await requestCafExact(harness.portal, { type: 33, quantity: 5, allowAnnul: true })
    expect(result).toMatchObject({ rejection: 'companyNotAuthorized', maxAuthorized: null })
  })

  test('other failures stay errors', async () => {
    const harness = await signedIn([entry, replies('of_solicita_folios_dcto', page('algo raro'))])
    expect((await failure(requestCafExact(harness.portal, { type: 33, quantity: 5 }))).code).toBe(
      'SII_PORTAL_UNEXPECTED_PAGE',
    )
    const buggy = await signedIn([entry, replies('of_solicita_folios_dcto', new Error('bug'))])
    await expect(requestCafExact(buggy.portal, { type: 33, quantity: 5 })).rejects.toThrow('bug')
  })
})

describe('requestCafInBatches', () => {
  test('reads the quota and asks for what fits, batch after batch', async () => {
    const harness = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', quotaForm(3, 0), quotaForm(3, 0)),
      replies('of_confirma_folio', CAF_XML),
    ])
    const result = await requestCafInBatches(harness.portal, { type: 33, quantity: 3 })
    expect(result).toMatchObject({ complete: true, granted: 100, maxAuthorized: 3, rejection: null })
    expect(harness.posted('of_confirma_folio')[0].CANT_DOCTOS).toBe('3')
  })

  test('an unrestricted type asks for everything, and a quota in hand skips the first reading', async () => {
    const harness = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', quotaForm()),
      replies('of_confirma_folio', CAF_XML),
    ])
    const result = await requestCafInBatches(harness.portal, {
      type: 33,
      quantity: 80,
      companyRut: '76543210-3',
      initialQuota: { unrestricted: true, blocked: false, maxAuthorized: null, availableFolios: null },
    })
    expect(result).toMatchObject({
      complete: true,
      cafs: [expect.anything()],
      maxAuthorized: null,
      availableFolios: null,
    })
    expect(harness.posted('of_solicita_folios_dcto')).toHaveLength(1)
  })

  test('no room at the first reading, then a block with nothing obtained', async () => {
    const empty = await signedIn([entry, replies('of_solicita_folios_dcto', quotaForm(0, 3))])
    await expect(requestCafInBatches(empty.portal, { type: 33, quantity: 3 })).resolves.toEqual({
      complete: false,
      cafs: [],
      granted: 0,
      maxAuthorized: 0,
      availableFolios: 3,
      rejection: 'quotaCapReached',
      portalMessage: null,
    })
    const blocked = await signedIn([entry, replies('of_solicita_folios_dcto', REJECTION_PAGES.stampingBlocked)])
    await expect(requestCafInBatches(blocked.portal, { type: 33, quantity: 3 })).resolves.toMatchObject({
      complete: false,
      rejection: 'quotaCapReached',
      maxAuthorized: null,
    })
  })

  test('a rejection at the reading keeps its own value', async () => {
    const harness = await signedIn([entry, replies('of_solicita_folios_dcto', REJECTION_PAGES.companyNotAuthorized)])
    await expect(requestCafInBatches(harness.portal, { type: 33, quantity: 3 })).resolves.toMatchObject({
      rejection: 'companyNotAuthorized',
      portalMessage: expect.any(String),
    })
  })

  test('a refusal with nothing obtained keeps its value; after a grant it is the cap', async () => {
    const nothing = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', quotaForm(3, 0), REJECTION_PAGES.optionNotAuthorized),
    ])
    await expect(requestCafInBatches(nothing.portal, { type: 33, quantity: 3 })).resolves.toMatchObject({
      rejection: 'optionNotAuthorized',
      maxAuthorized: 3,
      availableFolios: 0,
    })
    const some = await signedIn([
      entry,
      replies(
        'of_solicita_folios_dcto',
        quotaForm(3, 0),
        quotaForm(3, 0),
        quotaForm(3, 0),
        REJECTION_PAGES.optionNotAuthorized,
      ),
      replies('of_confirma_folio', CAF_XML),
    ])
    await expect(requestCafInBatches(some.portal, { type: 33, quantity: 200 })).resolves.toMatchObject({
      complete: false,
      granted: 100,
      rejection: 'quotaCapReached',
    })
  })

  test('a rejection at a later reading keeps what was obtained', async () => {
    const harness = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', quotaForm(3, 0), quotaForm(3, 0), REJECTION_PAGES.companyNotAuthorized),
      replies('of_confirma_folio', CAF_XML),
    ])
    const result = await requestCafInBatches(harness.portal, { type: 33, quantity: 200 })
    expect(result).toMatchObject({ complete: false, granted: 100, rejection: 'companyNotAuthorized' })
    expect(result.cafs).toHaveLength(1)
  })

  test('the batches are bounded', async () => {
    const harness = await signedIn([
      entry,
      { url: `${MAULLIN}/of_solicita_folios_dcto`, reply: { body: quotaForm(3, 0) } },
      { url: `${MAULLIN}/of_confirma_folio`, reply: { body: CAF_XML } },
    ])
    const result = await requestCafInBatches(harness.portal, { type: 33, quantity: 1000, maxBatches: 2 })
    expect(result).toMatchObject({ complete: false, granted: 200, rejection: 'quotaCapReached', maxAuthorized: 3 })
    expect(result.cafs).toHaveLength(2)
  })

  test('a failure of another kind stays an error', async () => {
    const harness = await signedIn([entry, replies('of_solicita_folios_dcto', page('raro'))])
    expect((await failure(requestCafInBatches(harness.portal, { type: 33, quantity: 3 }))).code).toBe(
      'SII_PORTAL_UNEXPECTED_PAGE',
    )
  })
})

describe('reobtainFolios', () => {
  const listRoutes = (ranges: readonly (readonly [number, number])[], annulled: readonly number[] = []) => [
    { url: `${MAULLIN}/rf_reobtencion1_folios`, reply: { body: page('form') } },
    { url: `${MAULLIN}/rf_reobtencion2_folios`, reply: { body: reobtainListPage(ranges) } },
    {
      url: `${MAULLIN}/rf_reobtencion3_folios`,
      reply: ranges.map(([from]) => ({ body: reobtainDetailPage(from, annulled.includes(from)) })),
    },
  ]
  const download = (...files: readonly string[]) => [
    { url: `${MAULLIN}/rf_genera_folio`, reply: { body: REOBTAIN_RESOLUTION } },
    replies('rf_genera_archivo', ...files),
  ]

  test('covers the quantity, oldest first, and stops there', async () => {
    const harness = await signedIn([
      ...listRoutes([
        [50, 59],
        [1, 9],
      ]),
      ...download(CAF_XML),
    ])
    const result = await reobtainFolios(harness.portal, { type: 33, quantity: 2 })
    expect(result).toMatchObject({
      complete: true,
      available: 2,
      reason: null,
      ranges: [{ from: 1, to: 9, freeFolios: [1, 2] }],
      expired: [],
    })
    expect(result.cafs).toHaveLength(1)
  })

  test('annulled and issued ranges do not count; too little comes back without downloading', async () => {
    const harness = await signedIn([
      ...listRoutes(
        [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
        [1],
      ),
    ])
    const result = await reobtainFolios(harness.portal, {
      type: 33,
      quantity: 5,
      isIssued: async (range) => range.from === 3,
      companyRut: '76543210-3',
    })
    expect(result).toMatchObject({ complete: false, cafs: [], available: 2 })
    expect(result.reason).toContain('2 of 5')
    expect(harness.posted('rf_genera_folio')).toEqual([])
  })

  test('free folios are confirmed; a range with some received is still used', async () => {
    const harness = await signedIn([...listRoutes([[1, 9]]), ...download(CAF_XML)])
    const result = await reobtainFolios(harness.portal, {
      type: 33,
      quantity: 2,
      isFolioFree: async (folio) => folio > 4,
    })
    expect(result.ranges).toEqual([{ from: 1, to: 9, freeFolios: [5, 6] }])
  })

  test('the checks per range are bounded and a range with no free folio is skipped', async () => {
    const checked: number[] = []
    const harness = await signedIn([...listRoutes([[1, 9]]), ...download(CAF_XML)])
    const result = await reobtainFolios(harness.portal, {
      type: 33,
      quantity: 2,
      maxChecksPerRange: 3,
      isFolioFree: (folio) => {
        checked.push(folio)
        return false
      },
    })
    expect(checked).toEqual([1, 2, 3])
    expect(result).toMatchObject({ complete: false, cafs: [], available: 0 })
    expect(result.reason).toContain('0 of 2')
  })

  test('an expired CAF does not count and the walk moves on', async () => {
    const harness = await signedIn([
      ...listRoutes([
        [1, 2],
        [3, 4],
      ]),
      ...download(OLD_CAF_XML, CAF_XML),
    ])
    const result = await reobtainFolios(harness.portal, { type: 33, quantity: 2 })
    expect(result.expired).toEqual([{ from: 1, to: 2, authorizationDate: expect.any(String) }])
    expect(result).toMatchObject({ complete: true, ranges: [{ from: 3, to: 4 }] })
    expect(FIXED_NOW.getFullYear()).toBe(2026)
  })

  test('a refused range is logged and what was downloaded comes back', async () => {
    const lines: string[] = []
    const log = (message: string): void => {
      lines.push(message)
    }
    const logger: Logger = { debug: log, info: log, warn: log, error: log }
    const harness = await signedIn(
      [
        ...listRoutes([
          [1, 2],
          [3, 4],
        ]),
        { url: `${MAULLIN}/rf_genera_folio`, reply: { body: REOBTAIN_RESOLUTION } },
        replies('rf_genera_archivo', CAF_XML, page('nada')),
      ],
      { logger },
    )
    const result = await reobtainFolios(harness.portal, { type: 33, quantity: 3 })
    expect(result).toMatchObject({ complete: false, available: 2 })
    expect(result.cafs).toHaveLength(1)
    expect(lines).toContain('sii portal could not reobtain a range')
  })

  test('a transport failure stays an error', async () => {
    const harness = await signedIn([
      ...listRoutes([[1, 2]]),
      { url: `${MAULLIN}/rf_genera_folio`, reply: new DteError('TRANSPORT_FAILED') },
    ])
    expect((await failure(reobtainFolios(harness.portal, { type: 33, quantity: 1 }))).code).toBe('TRANSPORT_FAILED')
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/flows --coverage=false
```

Expected: FAIL, because the code below does not exist yet.

- [ ] **Step 3: Write the implementation**

`src/portal/flows.ts`:

```ts
import { isCafExpired } from '../caf/validity'
import type { DocumentType } from '../catalogs/document-types'
import type { PortalRejection } from '../catalogs/portal'
import { isDteError } from '../errors'
import type { CallOverrides } from '../sii/client'
import { annulFoliosInSession } from './annulment'
import type { PortalClient } from './client'
import { listReobtainableInSession, reobtainCafInSession, type ReobtainableRange } from './reobtain'
import { withPortalSession, type PortalContext } from './session'
import { queryFolioQuotaInSession, requestCafInSession, type FolioQuota, type ObtainedCaf } from './stamping'

const DEFAULT_MAX_BATCHES = 4
const DEFAULT_MAX_CHECKS_PER_RANGE = 30
const MAX_RANGES_TO_ANNUL = 20

/**
 * EN: The outcome of a composite flow. Refusals come back as data, because the flow may already hold CAFs: those must
 * reach the caller, and a CAF cannot travel in an error's details, which get logged.
 * ES: El resultado de un flujo compuesto. Los rechazos vuelven como datos, porque el flujo puede tener ya CAF en la mano:
 * esos deben llegar a quien llama, y un CAF no puede viajar en los detalles de un error, que se registran.
 */
export type FolioFlowResult = {
  /** EN: The quantity asked for was covered. ES: Se cubrió la cantidad pedida. */
  readonly complete: boolean
  /** EN: Every CAF obtained, even when falling short. ES: Todos los CAF obtenidos, aunque no alcancen. */
  readonly cafs: readonly ObtainedCaf[]
  /** EN: Folios covered. ES: Folios cubiertos. */
  readonly granted: number
  /** EN: Last `MAX_AUTOR` seen, or null. ES: `MAX_AUTOR` — Último máximo visto, o null. */
  readonly maxAuthorized: number | null
  /** EN: Last `FOLIOS_DISP` seen, or null. ES: `FOLIOS_DISP` — Último valor visto, o null. */
  readonly availableFolios: number | null
  /** EN: Why it fell short, or null. ES: Por qué no alcanzó, o null. */
  readonly rejection: PortalRejection | null
  /** EN: What the portal said, or null. ES: Lo que dijo el portal, o null. */
  readonly portalMessage: string | null
}

// A refusal of the SII turns into data; a transport failure, a block or an expired session stays an error.
const asRefusal = (
  error: unknown,
): { readonly rejection: PortalRejection; readonly details: Readonly<Record<string, unknown>> } => {
  if (!isDteError(error) || error.code !== 'SII_PORTAL_REJECTED') throw error
  return { rejection: error.details.rejection as PortalRejection, details: error.details }
}

const refusalResult = (
  cafs: readonly ObtainedCaf[],
  rejection: PortalRejection,
  details: Readonly<Record<string, unknown>>,
): FolioFlowResult => ({
  complete: false,
  cafs,
  granted: cafs.reduce((total, caf) => total + caf.granted, 0),
  maxAuthorized: typeof details.maxAuthorized === 'number' ? details.maxAuthorized : null,
  availableFolios: typeof details.availableFolios === 'number' ? details.availableFolios : null,
  rejection,
  // Every refusal these flows can meet carries what the portal said.
  portalMessage: details.portalMessage as string,
})

/**
 * EN: Input of `requestCafExact`.
 * ES: Entrada de `requestCafExact`.
 */
export type RequestCafExactInput = {
  /** EN: Document type. ES: `COD_DOCTO` — Tipo de documento. */
  readonly type: DocumentType
  /** EN: Folios needed in one CAF. ES: Folios necesarios en un CAF. */
  readonly quantity: number
  /** EN: Annul unused folios to lift the limit, and ask once more. Off by default: it cannot be undone and counts against the quota for six months. ES: Anular folios sin usar para levantar el límite y pedir una vez más. Apagado por defecto: no se puede deshacer y pesa contra el cupo seis meses. */
  readonly allowAnnul?: boolean
  /** EN: Company RUT; the client's by default. ES: `RUT_EMP` + `DV_EMP` — RUT de la empresa; por defecto el del cliente. */
  readonly companyRut?: string
}

const fromCaf = (caf: ObtainedCaf, quantity: number): FolioFlowResult => ({
  complete: caf.granted >= quantity,
  cafs: [caf],
  granted: caf.granted,
  maxAuthorized: caf.maxAuthorized,
  availableFolios: caf.availableFolios,
  rejection: caf.granted >= quantity ? null : 'foliosShort',
  portalMessage: null,
})

/**
 * EN: Requests one CAF that covers the whole quantity; below it nothing is stamped. With `allowAnnul`, a limit caused by
 * unused folios is lifted by annulling up to 20 ranges and asking once more. `FOLIOS_DISP` 0 means nothing is annullable,
 * so that attempt is skipped; while blocked the field is absent, and that case does try.
 * ES: Solicita un CAF que cubra toda la cantidad; bajo ella no se timbra nada. Con `allowAnnul`, un límite causado por folios
 * sin usar se levanta anulando hasta 20 rangos y pidiendo una vez más. `FOLIOS_DISP` 0 significa que nada es anulable, así que
 * ese intento se omite; con el timbraje bloqueado el campo no viene, y ese caso sí lo intenta.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: type, quantity and whether annulling is allowed. ES: tipo, cantidad y si se permite anular.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the outcome; a refusal is data. ES: el resultado; un rechazo es un dato.
 * @throws {DteError} EN: session, block and transport codes. ES: códigos de sesión, bloqueo y transporte.
 */
export const requestCafExact = (
  portal: PortalClient,
  input: RequestCafExactInput,
  overrides?: CallOverrides,
): Promise<FolioFlowResult> =>
  withPortalSession(portal, 'requestCafExact', overrides, async (context) => {
    const ask = async (): Promise<FolioFlowResult> => {
      try {
        const caf = await requestCafInSession(context, {
          type: input.type,
          quantity: input.quantity,
          minQuantity: input.quantity,
          ...(input.companyRut === undefined ? {} : { companyRut: input.companyRut }),
        })
        return fromCaf(caf, input.quantity)
      } catch (error) {
        const refusal = asRefusal(error)
        return refusalResult([], refusal.rejection, refusal.details)
      }
    }
    const first = await ask()
    const recoverable = first.rejection === 'quotaInsufficient' || first.rejection === 'stampingBlocked'
    if (!recoverable || input.allowAnnul !== true || first.availableFolios === 0) return first
    const annulment = await annulFoliosInSession(context, {
      type: input.type,
      all: true,
      maxRanges: MAX_RANGES_TO_ANNUL,
      ...(input.companyRut === undefined ? {} : { companyRut: input.companyRut }),
    })
    if (annulment.totalAnnulled === 0)
      return { ...first, rejection: 'noAnnullableFolios', portalMessage: first.portalMessage }
    return ask()
  })

/**
 * EN: Input of `requestCafInBatches`.
 * ES: Entrada de `requestCafInBatches`.
 */
export type RequestCafInBatchesInput = {
  /** EN: Document type. ES: `COD_DOCTO` — Tipo de documento. */
  readonly type: DocumentType
  /** EN: Folios to cover in total. ES: Folios por cubrir en total. */
  readonly quantity: number
  /** EN: Most trips to the portal; 4 by default. ES: Máximo de viajes al portal; 4 por defecto. */
  readonly maxBatches?: number
  /** EN: A quota already read, to skip the first reading. ES: Un cupo ya leído, para omitir la primera lectura. */
  readonly initialQuota?: FolioQuota
  /** EN: Company RUT; the client's by default. ES: `RUT_EMP` + `DV_EMP` — RUT de la empresa; por defecto el del cliente. */
  readonly companyRut?: string
}

/**
 * EN: Covers a quantity across several CAFs, for when `FOLIOS_DISP` is 0 and `MAX_AUTOR` is small: the SII rations by
 * history, there is nothing to annul or download again, and waiting does not move it. It stops as soon as a batch adds
 * nothing, because every grant raises `FOLIOS_DISP` and can lower the next `MAX_AUTOR`.
 * ES: Cubre una cantidad con varios CAF, para cuando `FOLIOS_DISP` es 0 y `MAX_AUTOR` es chico: el SII raciona por historial,
 * no hay nada que anular ni reobtener, y esperar no lo mueve. Se detiene apenas una tanda no aporta, porque cada entrega sube
 * `FOLIOS_DISP` y puede bajar el próximo `MAX_AUTOR`.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: type, quantity and limits. ES: tipo, cantidad y límites.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the outcome, with whatever was obtained. ES: el resultado, con lo que se haya obtenido.
 * @throws {DteError} EN: session, block and transport codes. ES: códigos de sesión, bloqueo y transporte.
 */
export const requestCafInBatches = (
  portal: PortalClient,
  input: RequestCafInBatchesInput,
  overrides?: CallOverrides,
): Promise<FolioFlowResult> =>
  withPortalSession(portal, 'requestCafInBatches', overrides, async (context) => {
    const company = input.companyRut === undefined ? {} : { companyRut: input.companyRut }
    const maxBatches = input.maxBatches ?? DEFAULT_MAX_BATCHES
    const batch = async (
      number: number,
      cafs: readonly ObtainedCaf[],
      covered: number,
      lastQuota: FolioQuota | null,
    ): Promise<FolioFlowResult> => {
      const seen = {
        maxAuthorized: lastQuota?.maxAuthorized ?? null,
        availableFolios: lastQuota?.availableFolios ?? null,
      }
      const capReached = (): FolioFlowResult => ({
        complete: false,
        cafs,
        granted: covered,
        ...seen,
        rejection: 'quotaCapReached',
        portalMessage: null,
      })
      if (covered >= input.quantity)
        return { complete: true, cafs, granted: covered, ...seen, rejection: null, portalMessage: null }
      if (number > maxBatches) return capReached()
      const quota =
        number === 1 && input.initialQuota !== undefined
          ? input.initialQuota
          : await queryFolioQuotaInSession(context, { type: input.type, ...company }).catch((error: unknown) =>
              asRefusal(error),
            )
      if ('rejection' in quota) return refusalResult(cafs, quota.rejection, quota.details)
      const missing = input.quantity - covered
      const wanted = quota.unrestricted ? missing : Math.min(quota.maxAuthorized ?? 0, missing)
      const current = { maxAuthorized: quota.maxAuthorized, availableFolios: quota.availableFolios }
      if (wanted <= 0)
        return {
          complete: false,
          cafs,
          granted: covered,
          ...current,
          rejection: 'quotaCapReached',
          portalMessage: null,
        }
      const outcome = await requestCafInSession(context, {
        type: input.type,
        quantity: wanted,
        minQuantity: 1,
        ...company,
      }).catch((error: unknown) => asRefusal(error))
      if ('rejection' in outcome) {
        return covered === 0
          ? refusalResult(cafs, outcome.rejection, { ...outcome.details, ...current })
          : { complete: false, cafs, granted: covered, ...current, rejection: 'quotaCapReached', portalMessage: null }
      }
      return batch(number + 1, [...cafs, outcome], covered + outcome.granted, quota)
    }
    return batch(1, [], 0, null)
  })

/**
 * EN: Input of `reobtainFolios`.
 * ES: Entrada de `reobtainFolios`.
 */
export type ReobtainFoliosInput = {
  /** EN: Document type. ES: `COD_DOCTO` — Tipo de documento. */
  readonly type: DocumentType
  /** EN: Folios to cover. ES: Folios por cubrir. */
  readonly quantity: number
  /** EN: The caller's record of ranges already sent to the SII, which the portal does not mark. ES: El registro de quien llama de los rangos ya enviados al SII, que el portal no marca. */
  readonly isIssued?: (range: { readonly from: number; readonly to: number }) => boolean | Promise<boolean>
  /** EN: Confirms a folio at the SII, typically with `folioReceived`. ES: Confirma un folio en el SII, normalmente con `folioReceived`. */
  readonly isFolioFree?: (folio: number) => boolean | Promise<boolean>
  /** EN: Most checks per range; 30 by default. ES: Máximo de consultas por rango; 30 por defecto. */
  readonly maxChecksPerRange?: number
  /** EN: Company RUT; the client's by default. ES: `RUT_EMP` + `DV_EMP` — RUT de la empresa; por defecto el del cliente. */
  readonly companyRut?: string
}

/**
 * EN: What `reobtainFolios` obtained. What was downloaded comes back even when it falls short, so the caller asks only
 * for the difference.
 * ES: Lo que obtuvo `reobtainFolios`. Lo descargado vuelve aunque no alcance, así quien llama pide solo la diferencia.
 */
export type ReobtainResult = {
  /** EN: The quantity was covered. ES: Se cubrió la cantidad. */
  readonly complete: boolean
  /** EN: The CAFs downloaded. ES: Los CAF descargados. */
  readonly cafs: readonly ObtainedCaf[]
  /** EN: Each range used and its free folios. ES: Cada rango usado y sus folios libres. */
  readonly ranges: readonly { readonly from: number; readonly to: number; readonly freeFolios: readonly number[] }[]
  /** EN: Ranges whose CAF already expired: they do not count and should be annulled. ES: Rangos cuyo CAF ya venció: no cuentan y conviene anularlos. */
  readonly expired: readonly { readonly from: number; readonly to: number; readonly authorizationDate: string | null }[]
  /** EN: Free folios covered. ES: Folios libres cubiertos. */
  readonly available: number
  /** EN: Why it fell short, in words, or null. ES: Por qué no alcanzó, en palabras, o null. */
  readonly reason: string | null
}

const freeFoliosOf = async (
  range: ReobtainableRange,
  needed: number,
  input: ReobtainFoliosInput,
): Promise<readonly number[]> => {
  const free: number[] = []
  const counter = { checks: 0 }
  const maxChecks = input.maxChecksPerRange ?? DEFAULT_MAX_CHECKS_PER_RANGE
  for (let folio = range.from; folio <= range.to && free.length < needed; folio += 1) {
    if (input.isFolioFree === undefined) {
      free.push(folio)
    } else {
      if (counter.checks >= maxChecks) break
      counter.checks += 1
      if ((await input.isFolioFree(folio)) === true) free.push(folio)
    }
  }
  return free
}

const usableRanges = async (
  ranges: readonly ReobtainableRange[],
  input: ReobtainFoliosInput,
): Promise<readonly ReobtainableRange[]> => {
  const issued = await Promise.all(
    ranges.map((range) => (input.isIssued === undefined ? false : input.isIssued({ from: range.from, to: range.to }))),
  )
  return ranges.filter((range, index) => !range.annulled && !issued[index]).sort((a, b) => a.from - b.from)
}

const reobtainInSession = async (context: PortalContext, input: ReobtainFoliosInput): Promise<ReobtainResult> => {
  const company = input.companyRut === undefined ? {} : { companyRut: input.companyRut }
  const usable = await usableRanges(await listReobtainableInSession(context, { type: input.type, ...company }), input)
  const total = usable.reduce((sum, range) => sum + range.quantity, 0)
  if (total < input.quantity)
    return {
      complete: false,
      cafs: [],
      ranges: [],
      expired: [],
      available: total,
      reason: `usable ranges do not reach the quantity: ${total} of ${input.quantity}`,
    }
  const cafs: ObtainedCaf[] = []
  const used: { from: number; to: number; freeFolios: readonly number[] }[] = []
  const expired: { from: number; to: number; authorizationDate: string | null }[] = []
  const covered = { folios: 0 }
  for (const range of usable) {
    if (covered.folios >= input.quantity) break
    const freeFolios = await freeFoliosOf(range, input.quantity - covered.folios, input)
    if (freeFolios.length > 0) {
      const caf = await reobtainCafInSession(context, { type: input.type, range }).catch((error: unknown) => {
        const refusal = asRefusal(error)
        context.portal.logger.warn('sii portal could not reobtain a range', { rejection: refusal.rejection })
        return null
      })
      if (caf !== null) {
        if (isCafExpired(caf.caf, { now: context.portal.now() })) {
          expired.push({ from: range.from, to: range.to, authorizationDate: caf.caf.authorizationDate })
        } else {
          cafs.push(caf)
          used.push({ from: range.from, to: range.to, freeFolios })
          covered.folios += freeFolios.length
        }
      }
    }
  }
  const complete = covered.folios >= input.quantity
  return {
    complete,
    cafs,
    ranges: used,
    expired,
    available: covered.folios,
    reason: complete ? null : `usable ranges do not reach the quantity: ${covered.folios} of ${input.quantity}`,
  }
}

/**
 * EN: Covers a quantity from authorized ranges without spending quota, oldest folio first. It is what lifts a stamping
 * block, since the SII asks for folios to be issued. A range with some received folios is not discarded: its free folios
 * are used. An expired CAF does not count and the walk moves on.
 * ES: Cubre una cantidad con rangos autorizados sin gastar cupo, partiendo por el folio más antiguo. Es lo que levanta un
 * bloqueo de timbraje, porque el SII pide emitir folios. Un rango con algunos folios recibidos no se descarta: se usan sus
 * folios libres. Un CAF vencido no cuenta y se sigue con el siguiente.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: type, quantity and the checks the caller can make. ES: tipo, cantidad y las verificaciones que puede hacer quien llama.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: what was obtained, even when it falls short. ES: lo obtenido, aunque no alcance.
 * @throws {DteError} EN: session, block and transport codes. ES: códigos de sesión, bloqueo y transporte.
 */
export const reobtainFolios = (
  portal: PortalClient,
  input: ReobtainFoliosInput,
  overrides?: CallOverrides,
): Promise<ReobtainResult> =>
  withPortalSession(portal, 'reobtainFolios', overrides, (context) => reobtainInSession(context, input))
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/flows --coverage=false
```

Expected: PASS, 24 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
git add src/portal/flows.ts tests/portal/flows.test.ts
git commit -m "feat: exact, in batches and reobtain folio flows"
```

---

## Task 13: Local folio registry

A port over a pure ledger (D37), with memory and directory adapters.

**Files:**
- Create: `src/folios/ledger.ts`
- Create: `src/folios/registry.ts`
- Create: `src/folios/node-registry.ts`
- Create: `tests/folios/ledger.test.ts`
- Create: `tests/folios/registry.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/folios/ledger.test.ts`:

```ts
import {
  emptyLedger,
  markAnnulledInLedger,
  markSentInLedger,
  releaseInLedger,
  remainingInLedger,
  reserveInLedger,
  statsOfLedger,
  type FolioLedger,
  type FolioScope,
} from '../../src/folios/ledger'

const AT = '2026-11-15T18:30:00.000Z'
const scope: FolioScope = {
  companyRut: '76543210-3',
  type: 33,
  range: { from: 1, to: 3 },
  environment: 'certification',
}

const reserveMany = (ledger: FolioLedger, count: number, target = scope): { ledger: FolioLedger; folios: number[] } => {
  const folios: number[] = []
  const box = { ledger }
  for (let index = 0; index < count; index += 1) {
    const reserved = reserveInLedger(box.ledger, target, AT)
    box.ledger = reserved.ledger
    folios.push(reserved.folio)
  }
  return { ledger: box.ledger, folios }
}

test('folios go out in order, then the range ends', () => {
  const { ledger, folios } = reserveMany(emptyLedger(), 3)
  expect(folios).toEqual([1, 2, 3])
  expect(() => reserveInLedger(ledger, scope, AT)).toThrow(
    expect.objectContaining({ code: 'FOLIO_OUT_OF_RANGE', details: { folio: 4, from: 1, to: 3, type: 33 } }),
  )
})

test('the input is never changed', () => {
  const ledger = emptyLedger()
  reserveInLedger(ledger, scope, AT)
  expect(ledger).toEqual(emptyLedger())
})

test('a gap left by a release is reused while something stays unsent', () => {
  const { ledger } = reserveMany(emptyLedger(), 3)
  const released = releaseInLedger(ledger, scope, [2], AT)
  expect(reserveInLedger(released, scope, AT).folio).toBe(2)
})

test('after everything was sent a gap below stays a gap', () => {
  const big = { ...scope, range: { from: 1, to: 9 } }
  const { ledger } = reserveMany(emptyLedger(), 3, big)
  const sent = markSentInLedger(markSentInLedger(ledger, big, 1, {}, AT), big, 3, {}, AT)
  const released = releaseInLedger(sent, big, [2], AT)
  expect(reserveInLedger(released, big, AT).folio).toBe(4)
})

test('annulled folios of any entry of the company, type and environment are skipped', () => {
  const other = { ...scope, cafFingerprint: 'abc' }
  const annulled = markAnnulledInLedger(emptyLedger(), other, [1, 1, 2], AT)
  expect(reserveInLedger(annulled, scope, AT).folio).toBe(3)
  expect(reserveInLedger(annulled, { ...scope, type: 34 }, AT).folio).toBe(1)
  expect(reserveInLedger(annulled, { ...scope, environment: 'production' }, AT).folio).toBe(1)
  expect(reserveInLedger(annulled, { ...scope, companyRut: '10000004-0' }, AT).folio).toBe(1)
  expect(markAnnulledInLedger(annulled, other, [2, 3], AT).entries[Object.keys(annulled.entries)[0]].annulled).toEqual([
    1, 2, 3,
  ])
})

test('marking as sent records it, counts as used and keeps the order', () => {
  const ledger = markSentInLedger(
    emptyLedger(),
    scope,
    3,
    { trackId: '99', sentAt: 'then', extra: { kind: 'dte' } },
    AT,
  )
  const entry = Object.values(ledger.entries)[0]
  expect(entry.used).toEqual([3])
  expect(entry.lastReserved).toBe(3)
  expect(entry.sent['3']).toEqual({ trackId: '99', sentAt: 'then', extra: { kind: 'dte' } })
  const again = markSentInLedger(ledger, scope, 1, {}, AT)
  expect(Object.values(again.entries)[0].used).toEqual([1, 3])
  expect(Object.values(again.entries)[0].sent['1']).toEqual({ trackId: null, sentAt: AT })
  const same = markSentInLedger(again, scope, 1, { trackId: '1' }, AT)
  expect(Object.values(same.entries)[0].used).toEqual([1, 3])
  expect(() => markSentInLedger(emptyLedger(), scope, 4, {}, AT)).toThrow(
    expect.objectContaining({ code: 'FOLIO_OUT_OF_RANGE' }),
  )
})

test('a release also forgets the sent record; unknown entries stay unknown', () => {
  const sent = markSentInLedger(reserveMany(emptyLedger(), 1).ledger, scope, 1, {}, AT)
  const released = releaseInLedger(sent, scope, [1], AT)
  const entry = Object.values(released.entries)[0]
  expect(entry).toMatchObject({ used: [], sent: {}, lastReserved: null })
  const other = emptyLedger()
  expect(releaseInLedger(other, scope, [1], AT)).toBe(other)
})

test('remaining and statistics', () => {
  expect(remainingInLedger(emptyLedger(), scope)).toBe(3)
  const { ledger } = reserveMany(emptyLedger(), 2)
  expect(remainingInLedger(ledger, scope)).toBe(1)
  const sent = markSentInLedger(ledger, scope, 1, {}, AT)
  const production = reserveMany(sent, 1, { ...scope, environment: 'production' }).ledger
  expect(statsOfLedger(production, { companyRut: scope.companyRut, type: 33, environment: 'certification' })).toEqual({
    totalEntries: 1,
    totalUsed: 2,
    totalSent: 1,
    ranges: [{ from: 1, to: 3, used: 2, sent: 1, remaining: 1 }],
  })
  expect(statsOfLedger(production, { companyRut: scope.companyRut, type: 33 }).totalEntries).toBe(2)
  expect(statsOfLedger(production, { companyRut: scope.companyRut, type: 34 }).totalEntries).toBe(0)
  expect(statsOfLedger(production, { companyRut: '10000004-0', type: 33 }).totalEntries).toBe(0)
})
```

`tests/folios/registry.test.ts`:

```ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FolioScope } from '../../src/folios/ledger'
import { createDirectoryFolioRegistry } from '../../src/folios/node-registry'
import { cafFingerprint, createFolioRegistry, createMemoryFolioRegistry } from '../../src/folios/registry'
import { FIXED_NOW } from '../support/fixtures'
import { failure } from '../support/portal'

const scope: FolioScope = {
  companyRut: '76543210-3',
  type: 33,
  range: { from: 1, to: 5 },
  environment: 'certification',
}

test('the fingerprint tells two files apart', () => {
  expect(cafFingerprint('<AUTORIZACION/>')).toMatch(/^[0-9a-f]{12}$/)
  expect(cafFingerprint('a')).not.toBe(cafFingerprint('b'))
  expect(cafFingerprint('a')).toBe(cafFingerprint('a'))
})

test('the whole cycle', async () => {
  const registry = createMemoryFolioRegistry(() => FIXED_NOW)
  await expect(registry.reserve(scope)).resolves.toBe(1)
  await expect(registry.reserve(scope)).resolves.toBe(2)
  await registry.markSent(scope, 1, { trackId: '77' })
  await registry.markSent(scope, 2)
  await registry.markAnnulled(scope, [3])
  await expect(registry.reserve(scope)).resolves.toBe(4)
  await registry.release(scope, [4])
  await expect(registry.remaining(scope)).resolves.toBe(3)
  await expect(registry.stats({ companyRut: scope.companyRut, type: 33 })).resolves.toMatchObject({
    totalEntries: 1,
    totalUsed: 2,
    totalSent: 2,
  })
})

test('calls run one after another, so concurrent reservations never repeat', async () => {
  const registry = createMemoryFolioRegistry()
  const folios = await Promise.all([1, 2, 3, 4, 5].map(() => registry.reserve(scope)))
  expect(folios).toEqual([1, 2, 3, 4, 5])
})

test('a failed call does not stop the next one', async () => {
  const registry = createMemoryFolioRegistry()
  expect((await failure(registry.markSent(scope, 99))).code).toBe('FOLIO_OUT_OF_RANGE')
  await expect(registry.reserve(scope)).resolves.toBe(1)
})

test('a custom store sees every change', async () => {
  const saved: unknown[] = []
  const box: { ledger: Parameters<Parameters<typeof createFolioRegistry>[0]['save']>[0] | null } = { ledger: null }
  const registry = createFolioRegistry({
    load: async () => box.ledger,
    save: async (ledger) => {
      box.ledger = ledger
      saved.push(ledger)
    },
  })
  await registry.reserve(scope)
  await registry.remaining(scope)
  expect(saved).toHaveLength(1)
})

describe('createDirectoryFolioRegistry', () => {
  const dirs: string[] = []
  const tempDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'dte-sdk-folios-'))
    dirs.push(dir)
    return dir
  }
  afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

  test('survives a new instance, creating the directory and leaving no temp file', async () => {
    const dir = join(tempDir(), 'nested')
    const first = createDirectoryFolioRegistry({ dir, now: () => FIXED_NOW })
    await expect(first.remaining(scope)).resolves.toBe(5)
    await expect(first.reserve(scope)).resolves.toBe(1)
    const second = createDirectoryFolioRegistry({ dir })
    await expect(second.reserve(scope)).resolves.toBe(2)
    expect(JSON.parse(readFileSync(join(dir, 'folios.json'), 'utf8')).version).toBe(1)
    expect(() => readFileSync(join(dir, 'folios.json.tmp'))).toThrow()
  })

  test('a file that cannot be read is an error, never an empty registry that repeats folios', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'folios.json'), 'not json')
    await expect(createDirectoryFolioRegistry({ dir }).reserve(scope)).rejects.toThrow()
  })

  test('without node:fs it says so', async () => {
    const registry = createDirectoryFolioRegistry({ dir: 'x' }, async () => {
      throw new Error('no fs')
    })
    expect((await failure(registry.remaining(scope))).code).toBe('TRANSPORT_UNAVAILABLE')
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/folios --coverage=false
```

Expected: FAIL, because the code below does not exist yet.

- [ ] **Step 3: Write the implementation**

`src/folios/ledger.ts`:

```ts
import type { Environment } from '../catalogs/codes'
import { DteError } from '../errors'

/**
 * EN: The folios of one CAF for one company in one environment.
 * ES: Los folios de un CAF para una empresa en un ambiente.
 */
export type FolioScope = {
  /** EN: Company RUT. ES: `RE` — RUT de la empresa. */
  readonly companyRut: string
  /** EN: Document type. ES: `TD` — Tipo de documento. */
  readonly type: number
  /** EN: Inclusive folio range of the CAF. ES: `RNG` — Rango de folios del CAF, inclusivo. */
  readonly range: { readonly from: number; readonly to: number }
  /** EN: Environment. ES: Ambiente. */
  readonly environment: Environment
  /** EN: `cafFingerprint` of the file, so a re-downloaded range does not share an entry. ES: `cafFingerprint` del archivo, para que un rango reobtenido no comparta entrada. */
  readonly cafFingerprint?: string
}

/**
 * EN: What is recorded when a folio goes to the SII.
 * ES: Lo que se registra cuando un folio va al SII.
 */
export type FolioSentRecord = {
  /** EN: SII tracking id. ES: `TRACKID` — Identificador del envío. */
  readonly trackId: string | null
  /** EN: When it was sent, ISO 8601. ES: Cuándo se envió, ISO 8601. */
  readonly sentAt: string
  /** EN: Anything the caller wants to keep. ES: Lo que quien llama quiera conservar. */
  readonly extra?: Readonly<Record<string, unknown>>
}

/**
 * EN: One entry of the ledger.
 * ES: Una entrada del libro.
 */
export type FolioEntry = {
  /** EN: The scope it belongs to. ES: El alcance al que pertenece. */
  readonly scope: FolioScope
  /** EN: Reserved or sent folios, ascending. ES: Folios reservados o enviados, ascendente. */
  readonly used: readonly number[]
  /** EN: Highest folio in `used`, or null. ES: Mayor folio de `used`, o null. */
  readonly lastReserved: number | null
  /** EN: Sent folios by number. ES: Folios enviados por número. */
  readonly sent: Readonly<Record<string, FolioSentRecord>>
  /** EN: Annulled folios: no entry of this company, type and environment may reserve them. ES: Folios anulados: ninguna entrada de esta empresa, tipo y ambiente puede reservarlos. */
  readonly annulled: readonly number[]
  /** EN: Last change, ISO 8601. ES: Último cambio, ISO 8601. */
  readonly updatedAt: string
}

/**
 * EN: The whole registry as one JSON-friendly value.
 * ES: Todo el registro como un solo valor apto para JSON.
 */
export type FolioLedger = {
  /** EN: Format version. ES: Versión del formato. */
  readonly version: 1
  /** EN: Entries by key. ES: Entradas por clave. */
  readonly entries: Readonly<Record<string, FolioEntry>>
}

/**
 * EN: Totals of a company and document type.
 * ES: Totales de una empresa y tipo de documento.
 */
export type FolioStats = {
  /** EN: CAFs tracked. ES: CAF registrados. */
  readonly totalEntries: number
  /** EN: Folios used. ES: Folios usados. */
  readonly totalUsed: number
  /** EN: Folios sent. ES: Folios enviados. */
  readonly totalSent: number
  /** EN: Per CAF. ES: Por CAF. */
  readonly ranges: readonly {
    readonly from: number
    readonly to: number
    readonly used: number
    readonly sent: number
    readonly remaining: number
  }[]
}

/**
 * EN: A ledger with nothing in it.
 * ES: Un libro sin nada.
 */
export const emptyLedger = (): FolioLedger => ({ version: 1, entries: {} })

const keyOf = (scope: FolioScope): string =>
  [scope.companyRut, scope.type, scope.range.from, scope.range.to, scope.environment, scope.cafFingerprint ?? ''].join(
    '|',
  )

const freshEntry = (scope: FolioScope, at: string): FolioEntry => ({
  scope,
  used: [],
  lastReserved: null,
  sent: {},
  annulled: [],
  updatedAt: at,
})

const inRange = (scope: FolioScope, folio: number): boolean => folio >= scope.range.from && folio <= scope.range.to

const withEntry = (ledger: FolioLedger, entry: FolioEntry): FolioLedger => ({
  ...ledger,
  entries: { ...ledger.entries, [keyOf(entry.scope)]: entry },
})

const annulledFolios = (ledger: FolioLedger, scope: FolioScope): ReadonlySet<number> =>
  new Set(
    Object.values(ledger.entries)
      .filter(
        (entry) =>
          entry.scope.companyRut === scope.companyRut &&
          entry.scope.type === scope.type &&
          entry.scope.environment === scope.environment,
      )
      .flatMap((entry) => entry.annulled),
  )

const outOfRange = (scope: FolioScope, folio: number): DteError =>
  new DteError('FOLIO_OUT_OF_RANGE', { folio, from: scope.range.from, to: scope.range.to, type: scope.type })

/**
 * EN: The next free folio: it starts at the lowest reserved-but-unsent folio, or after the last reserved, and walks past
 * used and annulled folios.
 * ES: El siguiente folio libre: parte en el menor folio reservado y no enviado, o después del último reservado, y avanza
 * saltando los usados y los anulados.
 * @throws {DteError} EN: `FOLIO_OUT_OF_RANGE` past the end of the range. ES: `FOLIO_OUT_OF_RANGE` pasado el fin del rango.
 */
export const reserveInLedger = (
  ledger: FolioLedger,
  scope: FolioScope,
  at: string,
): { readonly ledger: FolioLedger; readonly folio: number } => {
  const entry = ledger.entries[keyOf(scope)] ?? freshEntry(scope, at)
  const annulled = annulledFolios(ledger, scope)
  const used = new Set(entry.used)
  const unsent = entry.used.filter((folio) => entry.sent[String(folio)] === undefined && !annulled.has(folio))
  const start = unsent[0] ?? (entry.lastReserved === null ? scope.range.from : entry.lastReserved + 1)
  const walk = (folio: number): number => (used.has(folio) || annulled.has(folio) ? walk(folio + 1) : folio)
  const folio = walk(Math.max(start, scope.range.from))
  if (folio > scope.range.to) throw outOfRange(scope, folio)
  const nextUsed = [...entry.used, folio].sort((a, b) => a - b)
  return {
    folio,
    ledger: withEntry(ledger, { ...entry, used: nextUsed, lastReserved: Math.max(...nextUsed), updatedAt: at }),
  }
}

/**
 * EN: Records a folio as sent; it counts as used even if it was never reserved here.
 * ES: Registra un folio como enviado; cuenta como usado aunque nunca se haya reservado aquí.
 * @throws {DteError} EN: `FOLIO_OUT_OF_RANGE`. ES: `FOLIO_OUT_OF_RANGE`.
 */
export const markSentInLedger = (
  ledger: FolioLedger,
  scope: FolioScope,
  folio: number,
  sent: { readonly trackId?: string; readonly sentAt?: string; readonly extra?: Readonly<Record<string, unknown>> },
  at: string,
): FolioLedger => {
  if (!inRange(scope, folio)) throw outOfRange(scope, folio)
  const entry = ledger.entries[keyOf(scope)] ?? freshEntry(scope, at)
  const used = entry.used.includes(folio) ? entry.used : [...entry.used, folio].sort((a, b) => a - b)
  const record: FolioSentRecord = {
    trackId: sent.trackId ?? null,
    sentAt: sent.sentAt ?? at,
    ...(sent.extra === undefined ? {} : { extra: sent.extra }),
  }
  return withEntry(ledger, {
    ...entry,
    used,
    lastReserved: Math.max(...used),
    sent: { ...entry.sent, [String(folio)]: record },
    updatedAt: at,
  })
}

/**
 * EN: Records folios as annulled at the SII, so no entry of this company, type and environment reserves them again.
 * ES: Registra folios como anulados en el SII, para que ninguna entrada de esta empresa, tipo y ambiente los vuelva a reservar.
 */
export const markAnnulledInLedger = (
  ledger: FolioLedger,
  scope: FolioScope,
  folios: readonly number[],
  at: string,
): FolioLedger => {
  const entry = ledger.entries[keyOf(scope)] ?? freshEntry(scope, at)
  return withEntry(ledger, { ...entry, annulled: [...new Set([...entry.annulled, ...folios])], updatedAt: at })
}

/**
 * EN: Gives folios back: they leave `used` and any sent record. An unknown entry stays unknown.
 * ES: Devuelve folios: salen de `used` y de cualquier registro de envío. Una entrada desconocida sigue desconocida.
 */
export const releaseInLedger = (
  ledger: FolioLedger,
  scope: FolioScope,
  folios: readonly number[],
  at: string,
): FolioLedger => {
  const entry = ledger.entries[keyOf(scope)]
  if (entry === undefined) return ledger
  const released = new Set(folios)
  const used = entry.used.filter((folio) => !released.has(folio))
  const sent = Object.fromEntries(Object.entries(entry.sent).filter(([folio]) => !released.has(Number(folio))))
  return withEntry(ledger, {
    ...entry,
    used,
    sent,
    lastReserved: used.length === 0 ? null : Math.max(...used),
    updatedAt: at,
  })
}

/**
 * EN: Folios of the range minus the ones used.
 * ES: Folios del rango menos los usados.
 */
export const remainingInLedger = (ledger: FolioLedger, scope: FolioScope): number =>
  scope.range.to - scope.range.from + 1 - (ledger.entries[keyOf(scope)]?.used.length ?? 0)

/**
 * EN: Totals of a company and type, optionally in one environment.
 * ES: Totales de una empresa y tipo, opcionalmente en un ambiente.
 */
export const statsOfLedger = (
  ledger: FolioLedger,
  query: { readonly companyRut: string; readonly type: number; readonly environment?: Environment },
): FolioStats => {
  const entries = Object.values(ledger.entries).filter(
    (entry) =>
      entry.scope.companyRut === query.companyRut &&
      entry.scope.type === query.type &&
      (query.environment === undefined || entry.scope.environment === query.environment),
  )
  const ranges = entries.map((entry) => ({
    from: entry.scope.range.from,
    to: entry.scope.range.to,
    used: entry.used.length,
    sent: Object.keys(entry.sent).length,
    remaining: entry.scope.range.to - entry.scope.range.from + 1 - entry.used.length,
  }))
  return {
    totalEntries: entries.length,
    totalUsed: ranges.reduce((total, range) => total + range.used, 0),
    totalSent: ranges.reduce((total, range) => total + range.sent, 0),
    ranges,
  }
}
```

`src/folios/registry.ts`:

```ts
import forge from 'node-forge'
import type { Environment } from '../catalogs/codes'
import {
  emptyLedger,
  markAnnulledInLedger,
  markSentInLedger,
  releaseInLedger,
  remainingInLedger,
  reserveInLedger,
  statsOfLedger,
  type FolioLedger,
  type FolioScope,
  type FolioStats,
} from './ledger'

/**
 * EN: Local control of folios: which were reserved, sent and annulled. A service with its own database implements these
 * functions with its own transactions; the rest build one with `createFolioRegistry`.
 * ES: Control local de folios: cuáles se reservaron, enviaron y anularon. Un servicio con su propia base implementa estas
 * funciones con sus propias transacciones; el resto arma una con `createFolioRegistry`.
 */
export type FolioRegistry = {
  /** EN: Reserves the next free folio. ES: Reserva el siguiente folio libre. */
  readonly reserve: (scope: FolioScope) => Promise<number>
  /** EN: Records a folio as sent. ES: Registra un folio como enviado. */
  readonly markSent: (
    scope: FolioScope,
    folio: number,
    sent?: { readonly trackId?: string; readonly sentAt?: string; readonly extra?: Readonly<Record<string, unknown>> },
  ) => Promise<void>
  /** EN: Records folios as annulled at the SII. ES: Registra folios como anulados en el SII. */
  readonly markAnnulled: (scope: FolioScope, folios: readonly number[]) => Promise<void>
  /** EN: Gives folios back. ES: Devuelve folios. */
  readonly release: (scope: FolioScope, folios: readonly number[]) => Promise<void>
  /** EN: Folios of the range still unused. ES: Folios del rango aún sin usar. */
  readonly remaining: (scope: FolioScope) => Promise<number>
  /** EN: Totals of a company and type. ES: Totales de una empresa y tipo. */
  readonly stats: (query: {
    readonly companyRut: string
    readonly type: number
    readonly environment?: Environment
  }) => Promise<FolioStats>
}

/**
 * EN: Where a ledger is kept.
 * ES: Dónde se guarda un libro.
 */
export type FolioLedgerStore = {
  /** EN: The stored ledger, or null. ES: El libro guardado, o null. */
  readonly load: () => Promise<FolioLedger | null>
  /** EN: Replaces the stored ledger. ES: Reemplaza el libro guardado. */
  readonly save: (ledger: FolioLedger) => Promise<void>
}

/**
 * EN: First 12 hex characters of the SHA-256 of a CAF file, to tell apart two files for one range.
 * ES: Primeros 12 caracteres hexadecimales del SHA-256 de un archivo CAF, para distinguir dos archivos de un mismo rango.
 */
export const cafFingerprint = (xml: string): string => {
  const md = forge.md.sha256.create()
  md.update(xml, 'utf8')
  return md.digest().toHex().slice(0, 12)
}

/**
 * EN: A registry over a store. Calls run one after another inside this process, each reading the ledger fresh; several
 * processes need a store or a registry of their own that takes care of it.
 * ES: Un registro sobre un almacén. Las llamadas corren una tras otra dentro de este proceso, cada una leyendo el libro de
 * nuevo; varios procesos necesitan un almacén o un registro propio que se haga cargo.
 * @param store EN: where the ledger lives. ES: dónde vive el libro.
 * @param now EN: clock. ES: reloj.
 */
export const createFolioRegistry = (store: FolioLedgerStore, now: () => Date = () => new Date()): FolioRegistry => {
  const queue = { tail: Promise.resolve() as Promise<unknown> }
  const exclusive = <T>(run: () => Promise<T>): Promise<T> => {
    const turn = queue.tail.then(run, run)
    queue.tail = turn
    return turn
  }
  const update = <T>(
    change: (ledger: FolioLedger, at: string) => { readonly ledger: FolioLedger; readonly value: T },
  ) =>
    exclusive(async () => {
      const { ledger, value } = change((await store.load()) ?? emptyLedger(), now().toISOString())
      await store.save(ledger)
      return value
    })
  const read = async (): Promise<FolioLedger> => (await store.load()) ?? emptyLedger()
  return {
    reserve: (scope) =>
      update((ledger, at) => {
        const reserved = reserveInLedger(ledger, scope, at)
        return { ledger: reserved.ledger, value: reserved.folio }
      }),
    markSent: (scope, folio, sent = {}) =>
      update((ledger, at) => ({ ledger: markSentInLedger(ledger, scope, folio, sent, at), value: undefined })),
    markAnnulled: (scope, folios) =>
      update((ledger, at) => ({ ledger: markAnnulledInLedger(ledger, scope, folios, at), value: undefined })),
    release: (scope, folios) =>
      update((ledger, at) => ({ ledger: releaseInLedger(ledger, scope, folios, at), value: undefined })),
    remaining: (scope) => exclusive(async () => remainingInLedger(await read(), scope)),
    stats: (query) => exclusive(async () => statsOfLedger(await read(), query)),
  }
}

/**
 * EN: A registry that lives in memory: for tests and short runs.
 * ES: Un registro que vive en memoria: para tests y corridas cortas.
 * @param now EN: clock. ES: reloj.
 */
export const createMemoryFolioRegistry = (now?: () => Date): FolioRegistry => {
  const box: { ledger: FolioLedger | null } = { ledger: null }
  return createFolioRegistry(
    {
      load: async () => box.ledger,
      save: async (ledger) => {
        box.ledger = ledger
      },
    },
    now,
  )
}
```

`src/folios/node-registry.ts`:

```ts
import { DteError, errorMessage } from '../errors'
import { memoize } from '../sii/lazy'
import { loadNodeFs, type NodeFsModules } from '../sii/node-fs'
import type { FolioLedger } from './ledger'
import { createFolioRegistry, type FolioRegistry } from './registry'

/**
 * EN: Options of `createDirectoryFolioRegistry`.
 * ES: Opciones de `createDirectoryFolioRegistry`.
 */
export type DirectoryFolioRegistryOptions = {
  /** EN: Directory of `folios.json`; created on first use. It must survive restarts: losing it repeats folios at the SII. ES: Directorio de `folios.json`; se crea en el primer uso. Debe sobrevivir a los reinicios: perderlo repite folios ante el SII. */
  readonly dir: string
  /** EN: Clock. ES: Reloj. */
  readonly now?: () => Date
}

const isMissingFile = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === 'ENOENT'

/**
 * EN: A registry in one JSON file, written atomically (temp file and rename), so a reader never sees half a ledger. It is
 * for a single process. `load` exists for tests only.
 * ES: Un registro en un archivo JSON, escrito de forma atómica (archivo temporal y renombre), así un lector nunca ve medio
 * libro. Es para un solo proceso. `load` existe solo para tests.
 * @param options EN: the directory and the clock. ES: el directorio y el reloj.
 * @throws {DteError} EN: `TRANSPORT_UNAVAILABLE` when `node:fs` cannot be loaded. ES: `TRANSPORT_UNAVAILABLE` si `node:fs` no se puede cargar.
 */
export const createDirectoryFolioRegistry = (
  options: DirectoryFolioRegistryOptions,
  load: () => Promise<NodeFsModules> = loadNodeFs,
): FolioRegistry => {
  const modules = memoize(async () =>
    load().catch((error: unknown) => {
      throw new DteError('TRANSPORT_UNAVAILABLE', { reason: errorMessage(error) })
    }),
  )
  const paths = async (): Promise<NodeFsModules & { readonly file: string }> => {
    const loaded = await modules()
    return { ...loaded, file: loaded.path.join(options.dir, 'folios.json') }
  }
  return createFolioRegistry(
    {
      load: async () => {
        const { fs, file } = await paths()
        try {
          return JSON.parse(await fs.readFile(file, 'utf8')) as FolioLedger
        } catch (error) {
          if (isMissingFile(error)) return null
          throw error
        }
      },
      save: async (ledger) => {
        const { fs, file } = await paths()
        await fs.mkdir(options.dir, { recursive: true })
        await fs.writeFile(`${file}.tmp`, JSON.stringify(ledger, null, 2), 'utf8')
        await fs.rename(`${file}.tmp`, file)
      },
    },
    options.now,
  )
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/folios --coverage=false
```

Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
git add src/folios/ledger.ts src/folios/registry.ts src/folios/node-registry.ts tests/folios/ledger.test.ts tests/folios/registry.test.ts
git commit -m "feat: local folio registry"
```

---

## Task 14: Client certificate over TLS, and the live smoke

A loopback server with `requestCert` proves the certificate arrives. The live smoke only reads and is skipped without `SII_LIVE=1`.

**Files:**
- Modify: `tests/sii/node-transport.test.ts`
- Create: `tests/live/portal.live.test.ts`

- [ ] **Step 1: Write the tests**

`tests/sii/node-transport.test.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/sii/node-transport.test.ts b/tests/sii/node-transport.test.ts
index 5870274..faaf7ff 100644
--- a/tests/sii/node-transport.test.ts
+++ b/tests/sii/node-transport.test.ts
@@ -353,3 +353,31 @@ describe('createNodeHttpsTransport', () => {
     await expectCode(broken(get('/echo')), 'TRANSPORT_UNAVAILABLE', 'no node here')
   })
 })
+
+describe('client certificate', () => {
+  const clientKey = fixtureText('cert.key.pem')
+  const clientCert = fixtureText('cert.pem')
+
+  test('the certificate reaches a server that asks for one, and only then', async () => {
+    const server = createServer({ key, cert, requestCert: true, rejectUnauthorized: false }, (req, res) => {
+      const peer = (req.socket as import('node:tls').TLSSocket).getPeerCertificate()
+      res.writeHead(200, { 'X-Client': peer.subject?.CN ?? 'none' })
+      res.end()
+    })
+    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
+    const base = `https://127.0.0.1:${(server.address() as AddressInfo).port}/`
+    const request = { method: 'GET' as const, url: base, headers: {}, timeoutMs: 5000 }
+    try {
+      const withCertificate = createNodeHttpsTransport({
+        tls: { ca: cert, clientCertificate: { privateKeyPem: clientKey, chainPem: clientCert }, maxVersion: 'TLSv1.2' },
+        keepAlive: false,
+      })
+      const answered = await withCertificate(request)
+      expect(answered.headers['x-client']).toBe('CAROLINA VALDES ROJAS')
+      const without = createNodeHttpsTransport({ tls: { ca: cert }, keepAlive: false })
+      expect((await without(request)).headers['x-client']).toBe('none')
+    } finally {
+      await new Promise((resolve) => server.close(resolve))
+    }
+  })
+})
```

`tests/live/portal.live.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { loadCertificateFromPkcs12 } from '../../src/certificate/pkcs12'
import { createPortalClient } from '../../src/portal/client'
import { fetchCompanyResolution, fetchTaxpayerData } from '../../src/portal/company'
import { listFolioRanges } from '../../src/portal/annulment'
import { closePortalSession, openPortalSession } from '../../src/portal/session'
import { listStampableTypes, queryFolioQuota } from '../../src/portal/stamping'

/**
 * Live smoke against the SII portal. Never runs in CI: it needs a real certificate enabled as a login method at sii.cl.
 *   SII_LIVE=1 SII_CERT_PFX=/path/to/cert.pfx SII_CERT_PASSWORD=… SII_COMPANY_RUT=… npx jest tests/live/portal
 * It only reads: nothing here stamps or annuls, because those spend folios and quota. Nothing from here is committed.
 */
const env = process.env
const enabled =
  env.SII_LIVE === '1' &&
  env.SII_CERT_PFX !== undefined &&
  env.SII_CERT_PASSWORD !== undefined &&
  env.SII_COMPANY_RUT !== undefined
const guarded = enabled ? describe : describe.skip

guarded('live: portal', () => {
  const portal = enabled
    ? createPortalClient({
        environment: 'certification',
        certificate: loadCertificateFromPkcs12(new Uint8Array(readFileSync(env.SII_CERT_PFX!)), env.SII_CERT_PASSWORD!),
        companyRut: env.SII_COMPANY_RUT,
      })
    : null

  afterAll(() => closePortalSession(portal!))

  test('login', async () => {
    await expect(openPortalSession(portal!)).resolves.toMatchObject({ reused: false })
  }, 120000)

  test('company data', async () => {
    await expect(fetchCompanyResolution(portal!)).resolves.toBeDefined()
    await expect(fetchTaxpayerData(portal!)).resolves.toBeDefined()
  }, 120000)

  test('folios, read only', async () => {
    const types = await listStampableTypes(portal!)
    expect(Array.isArray(types)).toBe(true)
    await expect(queryFolioQuota(portal!, { type: 33 })).resolves.toBeDefined()
    await expect(listFolioRanges(portal!, { type: 33 })).resolves.toBeDefined()
  }, 120000)
})
```

- [ ] **Step 2: Run them**

```bash
npx jest --config jest.config.cjs tests/sii/node-transport tests/live/portal --coverage=false
```

Expected: PASS, 22 tests, and 3 skipped without `SII_LIVE=1`. These test what already exists, so they pass from the start.

- [ ] **Step 3: Commit**

```bash
npm run prettier
git add tests/sii/node-transport.test.ts tests/live/portal.live.test.ts
git commit -m "test: client certificate over TLS and a read-only live smoke"
```

---

## Task 15: Public API, documentation and size

Every runtime export of spec 3.11 on the root and in `RUNTIME_EXPORTS`, `createPortalClient` in the smokes, the README, `llms.txt`, the CHANGELOG, the limit at 46 kB and the decision note of issue #5 (D36).

**Files:**
- Modify: `src/index.ts`
- Modify: `tests/public-api.test.ts`
- Modify: `tests/dist.smoke.test.ts`
- Modify: `tests/types.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `.size-limit.json`
- Modify: `README.md`
- Modify: `llms.txt`
- Modify: `CHANGELOG.md`
- Create: `docs/decisions/entry-points.md`

- [ ] **Step 1: Write the failing tests**

`tests/public-api.test.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/public-api.test.ts b/tests/public-api.test.ts
index a9051d8..046d29b 100644
--- a/tests/public-api.test.ts
+++ b/tests/public-api.test.ts
@@ -5,6 +5,32 @@ import * as sdk from '../src'
  * the CHANGELOG in the same commit.
  */
 const RUNTIME_EXPORTS = [
+  'DEFAULT_PORTAL_RETRY_POLICY',
+  'PORTAL_REJECTIONS',
+  'annulFolios',
+  'cafFingerprint',
+  'closePortalSession',
+  'createDirectoryFolioRegistry',
+  'createFolioRegistry',
+  'createMemoryFolioRegistry',
+  'createMemoryPortalLock',
+  'createPortalClient',
+  'fetchCompanyResolution',
+  'fetchIssuerProfile',
+  'fetchTaxpayerData',
+  'isRetryablePortalError',
+  'listFolioRanges',
+  'listReobtainableRanges',
+  'listStampableTypes',
+  'openPortalSession',
+  'portalRejectionMessage',
+  'queryCertificationSets',
+  'queryFolioQuota',
+  'reobtainCaf',
+  'reobtainFolios',
+  'requestCaf',
+  'requestCafExact',
+  'requestCafInBatches',
   'BOOK_DOCUMENT_TYPES',
   'BOOK_KINDS',
   'BOOK_OPERATIONS',
```

`tests/dist.smoke.test.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/dist.smoke.test.ts b/tests/dist.smoke.test.ts
index 0d3717d..87a98f9 100644
--- a/tests/dist.smoke.test.ts
+++ b/tests/dist.smoke.test.ts
@@ -41,6 +41,10 @@ const EXPECTED_FUNCTIONS = [
   'classifyUploadStatus',
   'classifyDocumentStatus',
   'createSiiClient',
+  'createPortalClient',
+  'requestCaf',
+  'annulFolios',
+  'createMemoryFolioRegistry',
   'createFetchTransport',
   'createNodeHttpsTransport',
   'createMemoryTokenCache',
```

`tests/types.test.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/types.test.ts b/tests/types.test.ts
index 52839fb..28efd08 100644
--- a/tests/types.test.ts
+++ b/tests/types.test.ts
@@ -1,4 +1,5 @@
 import { expectTypeOf } from 'expect-type'
+import type { PortalClient } from '../src/portal/client'
 import {
   createDocument,
   issueDocument,
@@ -183,3 +184,12 @@ test('public API types compile', () => {
   expect(names).toBeNull()
   expect(typeof _typecheck).toBe('function')
 })
+
+describe('portal client', () => {
+  test('is immutable data', () => {
+    expectTypeOf<PortalClient['companyRut']>().toEqualTypeOf<SiiRut | null>()
+    // @ts-expect-error every field is readonly
+    const write = (portal: PortalClient): void => void (portal.timeoutMs = 1)
+    expect(typeof write).toBe('function')
+  })
+})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/public-api tests/types --coverage=false
```

Expected: FAIL, because the code below does not exist yet.

- [ ] **Step 3: Write the implementation**

`src/index.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/index.ts b/src/index.ts
index 4083871..857eb73 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -73,6 +73,9 @@ export {
 } from './catalogs/claim-codes'
 export type { ClaimAction, ClaimActionCode } from './catalogs/claim-codes'
 
+export { PORTAL_REJECTIONS, portalRejectionMessage } from './catalogs/portal'
+export type { PortalRejection } from './catalogs/portal'
+
 export { toSiiRut, isSiiRut, splitSiiRut } from './model/rut'
 export type { SiiRut } from './model/rut'
 export type {
@@ -301,6 +304,7 @@ export { createNodeHttpsTransport } from './sii/node-transport'
 export type { NodeTlsOptions, NodeHttpsTransportOptions, TlsVersion } from './sii/node-transport'
 export { redactExchange, createMemoryCapture } from './sii/capture'
 export type {
+  HttpChannel,
   HttpExchange,
   HttpExchangeRequest,
   HttpExchangeResponse,
@@ -353,3 +357,38 @@ export type {
   ReceiverStatus,
   ReceiverStatusResult,
 } from './sii/claims'
+
+export { createPortalClient, DEFAULT_PORTAL_RETRY_POLICY, isRetryablePortalError } from './portal/client'
+export type { PortalClient, PortalClientOptions } from './portal/client'
+export { createMemoryPortalLock } from './portal/lock'
+export type { PortalLock } from './portal/lock'
+export { openPortalSession, closePortalSession } from './portal/session'
+export type { PortalSessionInfo } from './portal/session'
+export { fetchCompanyResolution, fetchTaxpayerData, fetchIssuerProfile } from './portal/company'
+export type { IssuerProfile } from './portal/company'
+export type { CompanyResolution, TaxpayerData, TaxpayerActivity, TaxpayerBranch } from './portal/pages/company'
+export { queryCertificationSets } from './portal/certification'
+export type { CertificationSets } from './portal/certification'
+export type { CertificationSet } from './portal/pages/certification'
+export { listStampableTypes, queryFolioQuota, requestCaf } from './portal/stamping'
+export type { CafRequestInput, FolioQuota, ObtainedCaf } from './portal/stamping'
+export type { QuotaFields, StampableType } from './portal/pages/stamping'
+export { listFolioRanges, annulFolios } from './portal/annulment'
+export type { AnnulFoliosInput, AnnulmentResult, FolioRanges, FolioSpan } from './portal/annulment'
+export type { AnnulmentRejectionReason, UnusedFolioRange } from './portal/pages/annulment'
+export { listReobtainableRanges, reobtainCaf } from './portal/reobtain'
+export type { ReobtainableRange } from './portal/reobtain'
+export { requestCafExact, requestCafInBatches, reobtainFolios } from './portal/flows'
+export type {
+  FolioFlowResult,
+  ReobtainFoliosInput,
+  ReobtainResult,
+  RequestCafExactInput,
+  RequestCafInBatchesInput,
+} from './portal/flows'
+
+export { cafFingerprint, createFolioRegistry, createMemoryFolioRegistry } from './folios/registry'
+export type { FolioLedgerStore, FolioRegistry } from './folios/registry'
+export { createDirectoryFolioRegistry } from './folios/node-registry'
+export type { DirectoryFolioRegistryOptions } from './folios/node-registry'
+export type { FolioEntry, FolioLedger, FolioScope, FolioSentRecord, FolioStats } from './folios/ledger'
```

`.github/workflows/ci.yml` (save the diff and run `git apply`):

```diff
diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml
index 6b2dc0f..d455879 100644
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -97,7 +97,7 @@ jobs:
       # Proves the README "runs in Deno" claim against the real ESM build.
       - name: Deno imports the ESM build
         run: |
-          deno eval "const m = await import('./dist/esm/index.min.js'); if (typeof m.createDocument !== 'function' || typeof m.createSiiClient !== 'function') { console.error('Deno smoke FAILED'); Deno.exit(1); } console.log('Deno smoke ok');"
+          deno eval "const m = await import('./dist/esm/index.min.js'); if (typeof m.createDocument !== 'function' || typeof m.createSiiClient !== 'function' || typeof m.createPortalClient !== 'function') { console.error('Deno smoke FAILED'); Deno.exit(1); } console.log('Deno smoke ok');"
 
   smoke-bun:
     name: smoke (Bun)
@@ -120,7 +120,7 @@ jobs:
       # Proves the README "runs in Bun" claim against the real ESM build.
       - name: Bun imports the ESM build
         run: |
-          bun -e "const m = await import('./dist/esm/index.min.js'); if (typeof m.createDocument !== 'function' || typeof m.createSiiClient !== 'function') { console.error('Bun smoke FAILED'); process.exit(1); } console.log('Bun smoke ok');"
+          bun -e "const m = await import('./dist/esm/index.min.js'); if (typeof m.createDocument !== 'function' || typeof m.createSiiClient !== 'function' || typeof m.createPortalClient !== 'function') { console.error('Bun smoke FAILED'); process.exit(1); } console.log('Bun smoke ok');"
 
   lint:
     name: lint
```

`.size-limit.json` (save the diff and run `git apply`):

```diff
diff --git a/.size-limit.json b/.size-limit.json
index 885aaf1..ae0fcd8 100644
--- a/.size-limit.json
+++ b/.size-limit.json
@@ -2,11 +2,11 @@
   {
     "name": "ESM (min + brotli)",
     "path": "dist/esm/index.min.js",
-    "limit": "34 kB"
+    "limit": "46 kB"
   },
   {
     "name": "CJS (min + brotli)",
     "path": "dist/cjs/index.min.js",
-    "limit": "34 kB"
+    "limit": "46 kB"
   }
 ]
```

`README.md` (save the diff and run `git apply`):

````diff
diff --git a/README.md b/README.md
index a4977bf..ad6b8d7 100644
--- a/README.md
+++ b/README.md
@@ -189,6 +189,44 @@ Their use today is narrow. The RCV replaced the purchase and sales book in produ
 certification test set. The folio consumption report (now Resumen de Ventas Diarias) is used in the
 receipts certification, and the SII probably no longer requires it in production.
 
+## SII portal and folios
+
+```typescript
+import { createPortalClient, fetchIssuerProfile, queryFolioQuota, requestCaf, closePortalSession } from 'dte-sdk'
+
+const portal = createPortalClient({ environment: 'certification', certificate, companyRut: '76543210-3' })
+
+const issuer = await fetchIssuerProfile(portal) // resolution of this environment, name, address, activity
+const quota = await queryFolioQuota(portal, { type: 33 }) // reads MAX_AUTOR and FOLIOS_DISP; stamps nothing
+const { xml, caf } = await requestCaf(portal, { type: 33, quantity: 50 })
+await closePortalSession(portal)
+```
+
+The portal is the certificate-authenticated site of the SII, read as HTML. The certificate must be enabled as a login
+method first, a manual step at sii.cl (*Cambiar Clave y datos de autenticación*, option "Utilizando Clave Tributaria o
+Certificado Digital"); otherwise the login throws `SII_PORTAL_CERT_NOT_ENABLED`. It needs Node ≥ 20: `fetch` cannot
+present a client certificate.
+
+- **CAF XML is a secret.** `xml` holds the private key of the CAF. Where you keep it is up to you.
+- **One session per certificate.** The SII rations sessions per RUT, so `sessionCache` and `lock` are ports: several
+  replicas need shared ones. Sessions are reused for 90 minutes and logged in on demand.
+- **Rationing.** `MAX_AUTOR` and `FOLIOS_DISP` appear only while the SII rations a type. Unused folios lower what it
+  authorizes and eventually block stamping.
+- **To lift a block, issue with the folios you have.** `reobtainFolios` gets lost CAFs back without spending quota.
+  `requestCafInBatches` is for a small `MAX_AUTOR` with nothing unused, and `requestCafExact` wants one CAF for the
+  whole quantity.
+- **Annulling cannot be undone** and counts against the quota for six months. `annulFolios` needs `range`,
+  `withinDays` or `all: true`, and `requestCafExact` annuls only with `allowAnnul: true`. Pass `knownAnnulled` back
+  between runs: the portal keeps listing annulled ranges forever.
+
+`createFolioRegistry`, `createMemoryFolioRegistry` and `createDirectoryFolioRegistry` keep local track of the folios of
+each CAF: reserve, mark as sent or annulled, release. A service with its own database implements `FolioRegistry` with
+its own transactions.
+
+A refusal of the SII is `SII_PORTAL_REJECTED`, with `details.rejection` and `portalRejectionMessage` saying what it means
+and what to do; the composite flows return it as data, so the CAFs already obtained are not lost. This module has not
+been run against an authenticated portal session yet: see the phase 4 design.
+
 ## Errors
 
 ```typescript
````

`llms.txt` (save the diff and run `git apply`):

```diff
diff --git a/llms.txt b/llms.txt
index 37e0111..d6061ad 100644
--- a/llms.txt
+++ b/llms.txt
@@ -8,6 +8,8 @@ The SII web services client is `createSiiClient({ environment, certificate, comp
 
 The SII books are `createPurchaseSalesBook` (IECV, `LibroCompraVenta`), `createGuideBook` (`LibroGuia`) and `createFolioConsumption` (RCOF, `ConsumoFolios`), each with `build*Xml`, `sign*`, `verify*Signature` and `toSii*`. All submission kinds of the schemas are covered, and the SDK computes the summaries from the lines; `summaryOnlyTotals` and `previousTotals` carry what cannot be derived. An explicit line total that differs from the SII formula is kept and reported in `totalMismatches`, and `strictTotals: true` throws `BOOK_TOTAL_MISMATCH` instead. `bookEntryFromDocument`, `guideEntryFromDocument` and `folioConsumptionEntryFromDocument` derive the lines from issued documents. The signed XML goes to `uploadBook` or `uploadFolioConsumption`. The RCV replaced the IECV in production from period 2017-08, the guide book is sent only on SII request, and the report is used in the receipts certification; the SII probably no longer requires it in production.
 
+The SII portal is `createPortalClient({ environment, certificate, companyRut })` plus free functions, on Node ≥ 20 (client certificate over `https`; TLS 1.2, server verified). The certificate must be enabled as a login method at sii.cl, or the login throws `SII_PORTAL_CERT_NOT_ENABLED`. Session: `openPortalSession`, `closePortalSession`, or on demand; `sessionCache` and `lock` are ports for several replicas. Company data: `fetchCompanyResolution` (per environment), `fetchTaxpayerData`, `fetchIssuerProfile`, `queryCertificationSets`. Folios: `listStampableTypes`, `queryFolioQuota` (`MAX_AUTOR`, `FOLIOS_DISP`; stamps nothing), `requestCaf`, `listFolioRanges`, `annulFolios` (explicit scope required; irreversible; counts against the quota for six months), `listReobtainableRanges`, `reobtainCaf`. Composite flows return refusals as data: `requestCafExact`, `requestCafInBatches`, `reobtainFolios`. Refusals are `SII_PORTAL_REJECTED` with `details.rejection` and `portalRejectionMessage`. `createFolioRegistry`, `createMemoryFolioRegistry` and `createDirectoryFolioRegistry` track folios locally. The CAF XML holds a private key: treat it as a secret.
+
 - [README](https://github.com/arrowsw/dte-sdk/blob/canary/README.md): installation and quick start
 - [Package on npm](https://www.npmjs.com/package/dte-sdk)
 - [rut.ts](https://github.com/arrowsw/rut.ts): the RUT library dte-sdk depends on
```

`CHANGELOG.md` (save the diff and run `git apply`):

```diff
diff --git a/CHANGELOG.md b/CHANGELOG.md
index 433ffc1..5870b21 100644
--- a/CHANGELOG.md
+++ b/CHANGELOG.md
@@ -67,6 +67,13 @@ and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0
 
 - The placeholder `hello()` export.
 
+- SII portal: `createPortalClient`, certificate login with reused sessions (`openPortalSession`, `closePortalSession`,
+  `createMemoryPortalLock`), company data (`fetchCompanyResolution`, `fetchTaxpayerData`, `fetchIssuerProfile`), certification
+  state (`queryCertificationSets`), folios (`listStampableTypes`, `queryFolioQuota`, `requestCaf`, `listFolioRanges`,
+  `annulFolios`, `listReobtainableRanges`, `reobtainCaf`) and composite flows (`requestCafExact`, `requestCafInBatches`,
+  `reobtainFolios`), with `SII_PORTAL_*` error codes, `PORTAL_REJECTIONS` and redaction of session cookies. Not yet run
+  against an authenticated portal session.
+- Local folio registry: `createFolioRegistry`, `createMemoryFolioRegistry`, `createDirectoryFolioRegistry`, `cafFingerprint`.
 ## [0.0.2] - 2026-10-26
 
 ### Changed
```

`docs/decisions/entry-points.md`:

```md
# Entry points

Status: decided on 2026-11-02, for phases 1 to 4. Tracks [issue #5](https://github.com/arrowsw/dte-sdk/issues/5).

**Decision: keep one root entry.** Phase 5 reopens this if the PDF dependencies justify a subpath.

## Measurements

Minified and brotli-compressed, whole bundle:

| After | ESM | CJS |
|---|---|---|
| Phase 1 | under 16 kB | under 16 kB |
| Phase 2 | 25.65 kB | 25.9 kB |
| Phase 3 | 31.85 kB | 32.07 kB |
| Phase 4 | 44.14 kB | 44.32 kB |

## Why not subpaths now

- **The errors would stop matching.** Each subpath bundle would carry its own copy of `DteError`, so `instanceof` fails
  between entries. Avoiding that means marking shared modules as external, and those are internal today.
- **The portal is not a separate layer.** It reuses `send`, `withRetry` and the redaction of the web services client.
- **The root entry already behaves.** `sideEffects` is `false`, so bundlers drop what a consumer does not import, and
  importing the root evaluates no `node:` module: the Node adapters load them on first use. A test guards this on both
  bundles.

## What this leaves open

Adding subpaths later while keeping the symbols on the root breaks nothing. Removing symbols from the root would be a
breaking change.
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/public-api tests/types --coverage=false
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
git add src/index.ts tests/public-api.test.ts tests/dist.smoke.test.ts tests/types.test.ts .github/workflows/ci.yml .size-limit.json README.md llms.txt CHANGELOG.md docs/decisions/entry-points.md
git commit -m "feat: export the portal and the folio registry"
```

---

## Task 16: Final gates and the pull request

No code, unless a gate finds something.

- [ ] **Step 1: Run every gate**

```bash
npm ci
npx prettier --check "{src,tests}/**/*.{js,ts}"
npm run lint
npx tsc --noEmit -p .
npm run build
npx jest --config jest.config.cjs --coverage
npx size-limit
npm run scan
```

Expected: all pass, 1 626 tests, 100 % on the four metrics, ESM about 44.14 kB and CJS about 44.32 kB against the 46 kB limit.

- [ ] **Step 2: Read the diff against `canary` once**

Nothing public may name any other project, and no RUT, certificate or local path may appear outside the allow-list. `npm run scan` covers the last part; the first is yours to check.

- [ ] **Step 3: Open the pull request against `canary`**

The body explains the portal and folio surface, lists the review points of spec section 5, and states plainly that nothing has run against an authenticated session. Squash-merge is how this repository integrates, and merging is Hans's call.

- [ ] **Step 4: Post the bundle sizes on [issue 5](https://github.com/arrowsw/dte-sdk/issues/5), linking `docs/decisions/entry-points.md`**

- [ ] **Step 5: Record what stays open**

Add to [issue 8](https://github.com/arrowsw/dte-sdk/issues/8), or to an issue of its own, the live proof the portal still needs before the first release that ships it: the certificate enabled at sii.cl, `tests/live/portal.live.test.ts` run once, and the three open points of spec section 6 (real logout URL, scoped cookie jar, TLS 1.3 on authenticated sessions).
