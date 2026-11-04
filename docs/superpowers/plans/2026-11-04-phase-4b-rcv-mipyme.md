# Phase 4b — RCV and MIPYME backup: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read the purchase and sales register of the SII portal (RCV), change how a purchase is classified in it, and download the XML of issued and received documents from the MIPYME backup, all on the phase 4 session.

**Architecture:** Every operation is a free function over `PortalClient`, under `withPortalSession`, as in phase 4. Pure page modules in `src/portal/pages/` turn the SII's JSON and HTML into data; nothing else looks at their shape. The RCV posts JSON envelopes with the session token as `conversationId`. The backup plans its pieces first and then downloads them, on `www1.sii.cl` whatever the client's environment.

**Tech Stack:** TypeScript 5.9 (strict), Node ≥ 20, Jest 30 + ts-jest, expect-type, ESLint 9 + Prettier, esbuild, size-limit. No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-04-phase-4b-rcv-mipyme-design.md` (section 2 holds the decisions D46–D56, section 3 the rules and the API, section 4 the glossary, section 5 what Hans decided, section 6 what is and is not measured).

---

## This plan's code has already run

This plan was generated from a throwaway branch where the code was written and made to pass, with one commit per task, on top of `f320b54`. On that branch each task was checked in order: its tests alone fail on the previous commit, and with the task applied `tsc` compiles and the tests pass. At the tip, on 2026-11-04: Prettier, ESLint, `tsc`, 1 830 tests with 18 skipped and coverage at 100 % on the four metrics, build, size (ESM 47.92 kB, CJS 48.11 kB) and scan all pass. The blocks of this plan were then applied to a clean checkout of `f320b54`, and they give exactly that tree.

So copy the code as it is. If a test fails, something around it changed since then, such as `canary`: investigate that before changing the code.

**Nothing here has met a real document.** The company at hand has none, so the rows, `download.cgi` and every write come from the SII's client code and from field behaviour, and the fixtures model them. Section 6 of the spec says what stays open and what has to happen before the first release that ships this phase.

## Conventions that apply to EVERY task

1. **Branch:** work on the branch that holds this plan, cut from `canary`. Commands run from the repository root. Run `npm ci` first.
2. **Commits:** one per task, with the message given, in English, with a prose body saying why, ending with the `Co-Authored-By` line your session prescribes.
3. **Diffs:** a modified file comes as a unified diff, relative to the repository root. Save it to a temporary file outside the repository and run `git apply <file>`. A new file comes whole. If a diff does not apply, `canary` moved: place the change by hand and say so in the pull request.
4. **Bilingual JSDoc is mandatory** on every exported symbol and every type field, one `EN:` line and one `ES:` line, the `ES:` naming the SII label. The code below already has it.
5. **No classes** (only `DteError`). `readonly` types everywhere. No module-level state. All RUT handling goes through `rut.ts`, by way of `src/model/rut.ts`.
6. **No PII in error messages:** values go in `details`, never in `message`. The answer of an RCV service never goes whole in `details`, because it carries the session token.
7. **Coverage** reaches 100 % at Task 9; before that it dips, which is why the per-task commands use `--coverage=false`.
8. **No real data:** fixture RUTs come from the allow-list in `scripts/scan-real-data.mjs`, names are invented, and `npm run scan` checks it.
9. **Nothing public names any third-party implementation:** not code, comments, tests, fixtures, commits or the pull request. Describe the SII behaviour directly.
10. **This phase ports field behaviour as it is (D46).** What looks like a bug or an improvement in the tasks below was decided by Hans: it is listed in section 5 of the spec. Raise it, do not change it. That includes reading response codes, `refNCD`, the detail method, the two-day defect and the amounts of the VAT moves.
11. **Nothing in this plan calls the SII,** and the default test run never does. `tests/live/portal.live.test.ts` only runs with `SII_LIVE=1`, and the certificate and its password never enter the repository.
12. **You own the pull request.** The session that runs this plan is the sole owner of its PR and of every review note or post-merge follow-up on it. Run `gh pr list` before opening anything.

## File map

```
src/books/common.ts                 (modify) task 1
src/errors.ts                       (modify) task 1
src/sii/capture.ts                  (modify) task 1
src/time/chile.ts                   (modify) task 1
tests/chile.test.ts                 (modify) task 1
tests/errors.test.ts                (modify) task 1
tests/sii/capture.test.ts           (modify) task 1
src/catalogs/portal.ts              (modify) task 2
tests/portal-catalog.test.ts        (modify) task 2
src/portal/client.ts                (modify) task 3
src/portal/session.ts               (modify) task 3
tests/portal/client.test.ts         (modify) task 3
tests/portal/session.test.ts        (modify) task 3
src/portal/pages/rcv.ts             (create) task 4
tests/portal/pages-rcv.test.ts      (create) task 4
src/portal/rcv.ts                   (create) task 5
tests/portal/rcv.test.ts            (create) task 5
src/portal/rcv.ts                   (modify) task 6
tests/portal/rcv.test.ts            (modify) task 6
src/portal/pages/backup.ts          (create) task 7
tests/portal/pages-backup.test.ts   (create) task 7
src/portal/backup.ts                (create) task 8
tests/portal/backup.test.ts         (create) task 8
.size-limit.json                    (modify) task 9
CHANGELOG.md                        (modify) task 9
README.md                           (modify) task 9
docs/decisions/entry-points.md      (modify) task 9
llms.txt                            (modify) task 9
src/index.ts                        (modify) task 9
tests/dist.smoke.test.ts            (modify) task 9
tests/live/portal.live.test.ts      (modify) task 9
tests/public-api.test.ts            (modify) task 9
tests/types.test.ts                 (modify) task 9
```

---

## Task 1: Tax period check, token redaction and safe figures

Three small things the later tasks lean on. `isPeriod` moves next to `isIsoDate`, so the RCV and the books share one rule. `redactText` hides `conversationId`, because that is the session token and production answers echo it (D47). `SAFE_DETAIL_KEYS` gains `day`, `listed` and `covered`: a date and two numbers, so a day the backup cannot download says which one in the message.

**Files:**
- Modify: `src/books/common.ts`
- Modify: `src/errors.ts`
- Modify: `src/sii/capture.ts`
- Modify: `src/time/chile.ts`
- Modify: `tests/chile.test.ts`
- Modify: `tests/errors.test.ts`
- Modify: `tests/sii/capture.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/chile.test.ts`, as a diff:

```diff
diff --git a/tests/chile.test.ts b/tests/chile.test.ts
index 39add8e..f6e7bbe 100644
--- a/tests/chile.test.ts
+++ b/tests/chile.test.ts
@@ -1,4 +1,4 @@
-import { chileDate, chileTimestamp, chileDateTimeParts, toIsoDate, isIsoDate } from '../src/time/chile'
+import { chileDate, chileTimestamp, chileDateTimeParts, toIsoDate, isIsoDate, isPeriod } from '../src/time/chile'
 import { DteError } from '../src/errors'
 
 describe('Chile time', () => {
@@ -64,4 +64,13 @@ describe('toIsoDate', () => {
     expect(isIsoDate('2024-02-29')).toBe(true)
     expect(isIsoDate('2026-2-2')).toBe(false)
   })
+
+  test('isPeriod', () => {
+    expect(isPeriod('2026-10')).toBe(true)
+    expect(isPeriod('2026-12')).toBe(true)
+    expect(isPeriod('2026-00')).toBe(false)
+    expect(isPeriod('2026-13')).toBe(false)
+    expect(isPeriod('202610')).toBe(false)
+    expect(isPeriod('2026-10-01')).toBe(false)
+  })
 })
```

`tests/errors.test.ts`, as a diff:

```diff
diff --git a/tests/errors.test.ts b/tests/errors.test.ts
index 5661cc8..1016025 100644
--- a/tests/errors.test.ts
+++ b/tests/errors.test.ts
@@ -34,6 +34,20 @@ describe('DteError', () => {
     expect(new DteError('WAIT_TIMEOUT').message).toBe('Timed out waiting for the SII status')
   })
 
+  test('the figures of a day the backup cannot download appear in the message; what the portal said never does', () => {
+    const error = new DteError('SII_PORTAL_REJECTED', {
+      rejection: 'backupDayUnknownTypes',
+      day: '2026-10-05',
+      listed: 30,
+      covered: 25,
+      portalMessage: 'texto del portal',
+    })
+    expect(error.message).toContain('day=2026-10-05')
+    expect(error.message).toContain('listed=30')
+    expect(error.message).toContain('covered=25')
+    expect(error.message).not.toContain('texto del portal')
+  })
+
   test('phase 2 safe keys appear in the message; url and body never do', () => {
     const err = new DteError('SII_HTTP_ERROR', {
       httpStatus: 503,
```

`tests/sii/capture.test.ts`, as a diff:

```diff
diff --git a/tests/sii/capture.test.ts b/tests/sii/capture.test.ts
index 47b72e8..ec484fa 100644
--- a/tests/sii/capture.test.ts
+++ b/tests/sii/capture.test.ts
@@ -30,6 +30,14 @@ const exchange: HttpExchange = {
 }
 
 describe('redactText', () => {
+  test('hides the session token of an RCV envelope, in a request and in an answer', () => {
+    expect(redactText('{"metaData":{"namespace":"x","conversationId":"TOKEN-ABC","page":null},"data":null}')).toBe(
+      '{"metaData":{"namespace":"x","conversationId":"[redacted]","page":null},"data":null}',
+    )
+    expect(redactText('{ "conversationId" : "TOKEN-ABC" }')).toBe('{ "conversationId" : "[redacted]" }')
+    expect(redactText('{"conversationId":null}')).toBe('{"conversationId":null}')
+  })
+
   test.each([
     ['<TOKEN>ABC</TOKEN>', '<TOKEN>[redacted]</TOKEN>'],
     ['<Token>ABC</Token>', '<Token>[redacted]</Token>'],
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/chile.test.ts tests/errors.test.ts tests/sii/capture.test.ts --coverage=false
```

Expected: FAIL: `isPeriod` does not exist yet, the token survives `redactText`, and the figures are not in the message.

- [ ] **Step 3: Write the implementation**

`src/books/common.ts`, as a diff:

```diff
diff --git a/src/books/common.ts b/src/books/common.ts
index b243971..fa6d327 100644
--- a/src/books/common.ts
+++ b/src/books/common.ts
@@ -2,12 +2,11 @@ import type { BookSubmission } from '../catalogs/book-codes'
 import { DteError } from '../errors'
 import type { BookCover, BookCoverInput } from '../model/book'
 import { toSiiRut } from '../model/rut'
-import { toIsoDate } from '../time/chile'
+import { isPeriod, toIsoDate } from '../time/chile'
 import { buildXml } from '../xml/build'
 
 const SII_NS = 'http://www.sii.cl/SiiDte'
 const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'
-const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/
 const MIN_BOOK_DATE = '2000-01-01'
 const MAX_BOOK_DATE = '2050-12-31'
 const MAX_RESOLUTION_NUMBER = 999_999
@@ -78,7 +77,7 @@ export const assertResolutionNumber = (value: number): void => {
  * @throws {DteError} EN: `INVALID_RUT`, `INVALID_DATE`, `INVALID_OPTION`, `MISSING_FIELD`. ES: los mismos códigos.
  */
 export const normalizeBookCover = (cover: BookCoverInput): BookCover => {
-  if (!PERIOD.test(cover.period)) throw new DteError('INVALID_DATE', { field: 'cover.period' })
+  if (!isPeriod(cover.period)) throw new DteError('INVALID_DATE', { field: 'cover.period' })
   assertResolutionNumber(cover.resolutionNumber)
   const submission = cover.submission ?? 'total'
   if (submission === 'partial' && cover.segmentNumber === undefined)
```

`src/errors.ts`, as a diff:

```diff
diff --git a/src/errors.ts b/src/errors.ts
index 9eaa3c4..5a81942 100644
--- a/src/errors.ts
+++ b/src/errors.ts
@@ -128,6 +128,9 @@ const SAFE_DETAIL_KEYS = [
   'actual',
   'rejection',
   'step',
+  'day',
+  'listed',
+  'covered',
 ] as const
 
 const formatMessage = (code: DteErrorCode, details: DteErrorDetails): string => {
```

`src/sii/capture.ts`, as a diff:

```diff
diff --git a/src/sii/capture.ts b/src/sii/capture.ts
index 0e80c40..a078864 100644
--- a/src/sii/capture.ts
+++ b/src/sii/capture.ts
@@ -98,6 +98,7 @@ const SECRET_ELEMENT_WITH_CONTENT = new RegExp(
 )
 const TOKEN_ASSIGNMENT = /(TOKEN=)(["']?)[^;&\s"'<]+/gi
 const SESSION_COOKIE_ASSIGNMENT = /((?:NETSCAPE_LIVEWIRE[\w.]*|CSESSIONID)=)(["']?)[^;&\s"'<]+/gi
+const CONVERSATION_ID = /("conversationId"\s*:\s*")[^"]*/g
 const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g
 
 const utf8Encoder = new TextEncoder()
@@ -117,11 +118,11 @@ const capBytes = (text: string): string => {
 }
 
 /**
- * EN: Replaces tokens, seeds, portal session cookies, `RSASK` and PEM private keys inside a text with `[redacted]` (as raw or XML-escaped
+ * EN: Replaces tokens, seeds, portal session cookies, `conversationId`, `RSASK` and PEM private keys inside a text with `[redacted]` (as raw or XML-escaped
  * elements, in any case, with or without a namespace prefix, and also when the text was cut before the closing tag)
  * and cuts the result at 512 KiB of UTF-8, suffixed with the number of dropped bytes. RUTs and XML stay: SII support
  * needs them to diagnose an upload.
- * ES: Reemplaza tokens, semillas, cookies de sesión del portal, `RSASK` y llaves privadas PEM dentro de un texto por `[redacted]` (como elementos
+ * ES: Reemplaza tokens, semillas, cookies de sesión del portal, `conversationId`, `RSASK` y llaves privadas PEM dentro de un texto por `[redacted]` (como elementos
  * crudos o escapados en XML, en cualquier caja, con o sin prefijo de espacio de nombres, y también cuando el texto
  * quedó cortado antes de la etiqueta de cierre) y corta el resultado a 512 KiB de UTF-8, con el número de bytes
  * descartados como sufijo. Los RUT y el XML se conservan: el soporte del SII los necesita para diagnosticar un envío.
@@ -136,6 +137,7 @@ export const redactText = (text: string): string =>
       )
       .replace(TOKEN_ASSIGNMENT, `$1$2${REDACTED}`)
       .replace(SESSION_COOKIE_ASSIGNMENT, `$1$2${REDACTED}`)
+      .replace(CONVERSATION_ID, `$1${REDACTED}`)
       .replace(PRIVATE_KEY_BLOCK, REDACTED),
   )
 
```

`src/time/chile.ts`, as a diff:

```diff
diff --git a/src/time/chile.ts b/src/time/chile.ts
index f682a6d..0737def 100644
--- a/src/time/chile.ts
+++ b/src/time/chile.ts
@@ -68,6 +68,7 @@ export const chileTimestamp = (now: Date = new Date()): string => {
 }
 
 const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
+const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/
 
 /**
  * EN: True when `value` is a real calendar date in `YYYY-MM-DD`.
@@ -85,6 +86,12 @@ export const isIsoDate = (value: string): boolean => {
   )
 }
 
+/**
+ * EN: True when `value` is a tax period, `YYYY-MM`.
+ * ES: True cuando `value` es un período tributario, `AAAA-MM`.
+ */
+export const isPeriod = (value: string): boolean => PERIOD.test(value)
+
 /**
  * EN: Normalizes `DD-MM-YYYY`, `DD/MM/YYYY` or `YYYY-MM-DD` (as the SII portal and resolutions show dates) to ISO.
  * ES: Normaliza `DD-MM-AAAA`, `DD/MM/AAAA` o `AAAA-MM-DD` (como muestran las fechas el portal y las resoluciones del SII) a ISO.
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/chile.test.ts tests/errors.test.ts tests/sii/capture.test.ts tests/books --coverage=false
npx tsc --noEmit -p .
```

Expected: PASS, 427 tests and 5 skipped. The books still pass, now through `isPeriod`. `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
npm run prettier
git add src/books/common.ts src/errors.ts src/sii/capture.ts src/time/chile.ts tests/chile.test.ts tests/errors.test.ts tests/sii/capture.test.ts
git commit -m "feat: tax period check, conversationId redaction and safe backup figures"
```

The body says why: The RCV needs the period rule the books already have, the token must not reach a capture, and these figures are safe to show.

---

## Task 2: RCV and backup catalog, and the new rejections

Data only, in the existing catalog: the hosts and app URLs of the RCV, its three JSON services, the base URL of the backup, the SII's codes for direction, operation and accounting status, and eight new rejections with their Spanish messages (spec 3.2 and 3.6). The complements are visited through `consdcvinternetui`, although their calls go to `complementoscvui`: that app is where the session token shows up.

**Files:**
- Modify: `src/catalogs/portal.ts`
- Modify: `tests/portal-catalog.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/portal-catalog.test.ts`, as a diff:

```diff
diff --git a/tests/portal-catalog.test.ts b/tests/portal-catalog.test.ts
index c594f42..d57da6b 100644
--- a/tests/portal-catalog.test.ts
+++ b/tests/portal-catalog.test.ts
@@ -1,4 +1,12 @@
-import { cgiUrl, PORTAL_LOGOUT_URL, PORTAL_REJECTIONS, portalRejectionMessage } from '../src/catalogs/portal'
+import {
+  cgiUrl,
+  MIPYME_BACKUP_BASE_URL,
+  PORTAL_LOGOUT_URL,
+  PORTAL_REJECTIONS,
+  portalRejectionMessage,
+  RCV_SERVICES,
+  rcvAppUrl,
+} from '../src/catalogs/portal'
 
 test('CGI pages live on the host of the environment', () => {
   expect(cgiUrl('certification', 'ad_empresa1')).toBe('https://maullin.sii.cl/cvc_cgi/dte/ad_empresa1')
@@ -15,3 +23,22 @@ test('every rejection tells the operator something in Spanish', () => {
 test('the logout URL is the one measured to end a session', () => {
   expect(PORTAL_LOGOUT_URL).toBe('https://zeusr.sii.cl/cgi_AUT2000/autTermino.cgi')
 })
+
+test('RCV apps live on the host of the environment, with their trailing slash', () => {
+  expect(rcvAppUrl('production', 'consdcvinternetui')).toBe('https://www4.sii.cl/consdcvinternetui/')
+  expect(rcvAppUrl('certification', 'consdcvinternetui')).toBe('https://www4c.sii.cl/consdcvinternetui/')
+})
+
+test('the complements are visited through the register app and carry a page', () => {
+  expect(RCV_SERVICES.complements).toMatchObject({
+    entryApp: 'consdcvinternetui',
+    app: 'complementoscvui',
+    paged: true,
+  })
+  expect(RCV_SERVICES.documents.paged).toBe(false)
+  expect(RCV_SERVICES.register.paged).toBe(false)
+})
+
+test('the backup has one host, in production', () => {
+  expect(MIPYME_BACKUP_BASE_URL).toBe('https://www1.sii.cl/cgi-bin/Portal001')
+})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal-catalog.test.ts --coverage=false
```

Expected: FAIL, because the names imported do not exist yet.

- [ ] **Step 3: Write the implementation**

`src/catalogs/portal.ts`, as a diff:

```diff
diff --git a/src/catalogs/portal.ts b/src/catalogs/portal.ts
index 5a96e76..baeebea 100644
--- a/src/catalogs/portal.ts
+++ b/src/catalogs/portal.ts
@@ -32,6 +32,119 @@ export const PORTAL_LOGOUT_URL = 'https://zeusr.sii.cl/cgi_AUT2000/autTermino.cg
 export const cgiUrl = (environment: Environment, page: string): string =>
   `https://${SII_HOSTS[environment]}/cvc_cgi/dte/${page}`
 
+/**
+ * EN: Hosts of the RCV services per environment.
+ * ES: Hosts de los servicios del RCV por ambiente.
+ */
+export const RCV_HOSTS: Readonly<Record<Environment, string>> = {
+  certification: 'www4c.sii.cl',
+  production: 'www4.sii.cl',
+}
+
+/**
+ * EN: URL of an RCV app on the host of an environment, with the trailing slash its login redirect needs.
+ * ES: URL de una app del RCV en el host de un ambiente, con la barra final que necesita su redirección de ingreso.
+ */
+export const rcvAppUrl = (environment: Environment, app: string): string => `https://${RCV_HOSTS[environment]}/${app}/`
+
+/**
+ * EN: One JSON service of the RCV.
+ * ES: Un servicio JSON del RCV.
+ */
+export type RcvService = {
+  /** EN: App visited first, which leaves the session token in the jar. ES: App que se visita primero, y que deja el token de sesión en la bolsa. */
+  readonly entryApp: string
+  /** EN: App the calls belong to. ES: App a la que pertenecen las llamadas. */
+  readonly app: string
+  /** EN: Path of the facade inside the app. ES: Ruta de la fachada dentro de la app. */
+  readonly facade: string
+  /** EN: Namespace of the envelope, without the method. ES: `namespace` del sobre, sin el método. */
+  readonly namespace: string
+  /** EN: The envelope carries a fixed `transactionId` and a `page`, instead of a UUID and null. ES: El sobre lleva `transactionId` fijo y `page`, en vez de un UUID y null. */
+  readonly paged: boolean
+}
+
+/**
+ * EN: The three RCV services: the documents of a period, the official register and the purchase complements.
+ * ES: Los tres servicios del RCV: los documentos de un período, el registro oficial y los complementos de compra.
+ */
+export const RCV_SERVICES: Readonly<Record<'documents' | 'register' | 'complements', RcvService>> = {
+  documents: {
+    entryApp: 'consemitidosinternetui',
+    app: 'consemitidosinternetui',
+    facade: 'services/data/facadeService',
+    namespace: 'cl.sii.sdi.lob.diii.consemitidos.data.api.interfaces.FacadeService',
+    paged: false,
+  },
+  register: {
+    entryApp: 'consdcvinternetui',
+    app: 'consdcvinternetui',
+    facade: 'services/data/facadeService',
+    namespace: 'cl.sii.sdi.lob.diii.consdcv.data.api.interfaces.FacadeService',
+    paged: false,
+  },
+  complements: {
+    entryApp: 'consdcvinternetui',
+    app: 'complementoscvui',
+    facade: 'services/data/facadeServiceCompCompraService',
+    namespace: 'cl.sii.sdi.lob.diii.dcv.data.api.interfaces.compcompra.FacadeServiceCompCompra',
+    paged: true,
+  },
+}
+
+/**
+ * EN: Base of the MIPYME backup pages. It exists only in production: there is no certification host.
+ * ES: Base de las páginas del respaldo MIPYME. Existe solo en producción: no hay host de certificación.
+ */
+export const MIPYME_BACKUP_BASE_URL = 'https://www1.sii.cl/cgi-bin/Portal001'
+
+/**
+ * EN: Which side of a document the taxpayer is on.
+ * ES: En qué lado de un documento está el contribuyente.
+ */
+export type DocumentDirection = 'issued' | 'received'
+
+/**
+ * EN: Which book of the register.
+ * ES: Qué libro del registro.
+ */
+export type RegisterOperation = 'purchase' | 'sale'
+
+/**
+ * EN: Accounting status of a document in the register.
+ * ES: Estado contable de un documento en el registro.
+ */
+export type AccountingStatus = 'registered' | 'pending' | 'notIncluded' | 'claimed'
+
+/**
+ * EN: `operacion` of the period documents per direction.
+ * ES: `operacion` de los documentos de un período según la dirección: 1 emitidos, 2 recibidos.
+ */
+export const DOCUMENT_OPERATIONS: Readonly<Record<DocumentDirection, number>> = { issued: 1, received: 2 }
+
+/**
+ * EN: `ORIGEN` of the backup per direction.
+ * ES: `ORIGEN` del respaldo según la dirección: ENV emitidos, RCP recibidos.
+ */
+export const BACKUP_ORIGINS: Readonly<Record<DocumentDirection, string>> = { issued: 'ENV', received: 'RCP' }
+
+/**
+ * EN: `operacion` of the register.
+ * ES: `operacion` del registro: COMPRA o VENTA.
+ */
+export const REGISTER_OPERATIONS: Readonly<Record<RegisterOperation, string>> = { purchase: 'COMPRA', sale: 'VENTA' }
+
+/**
+ * EN: `estadoContab` of the register.
+ * ES: `estadoContab` del registro: REGISTRO, PENDIENTE, NO_INCLUIR o RECLAMADO.
+ */
+export const ACCOUNTING_STATES: Readonly<Record<AccountingStatus, string>> = {
+  registered: 'REGISTRO',
+  pending: 'PENDIENTE',
+  notIncluded: 'NO_INCLUIR',
+  claimed: 'RECLAMADO',
+}
+
 /**
  * EN: Why the SII refused a portal request.
  * ES: Por qué el SII rechazó una solicitud del portal.
@@ -55,6 +168,14 @@ export type PortalRejection =
   | 'reobtainFormMissing'
   | 'reobtainDownloadMissing'
   | 'reobtainCafMissing'
+  | 'backupCaptcha'
+  | 'backupIndeterminate'
+  | 'backupNoData'
+  | 'backupRefused'
+  | 'backupNoCompany'
+  | 'backupDayOverLimit'
+  | 'backupDayUnknownTypes'
+  | 'purchaseChangeNotConfirmed'
 
 /**
  * EN: What each rejection means and what to do about it, in Spanish, for the operator.
@@ -91,6 +212,21 @@ export const PORTAL_REJECTIONS: Readonly<Record<PortalRejection, string>> = {
   reobtainFormMissing: 'El SII no devolvió el formulario de generación para este rango.',
   reobtainDownloadMissing: 'El SII autorizó la reobtención pero no ofreció la descarga del CAF.',
   reobtainCafMissing: 'El SII no devolvió el XML del CAF al reobtenerlo.',
+  backupCaptcha:
+    'El SII activó el captcha en el respaldo MIPYME: no se puede automatizar mientras esté encendido. No se resuelve reintentando en un loop: hay que intentar más tarde.',
+  backupIndeterminate:
+    'El portal devolvió varios mensajes de su plantilla, sin un veredicto único: no se puede concluir nada, tampoco que no haya datos. Hay que intentar más tarde.',
+  backupNoData:
+    'El SII informa que no existe información en MIPYME para este RUT. Es un veredicto definitivo: no hay nada que descargar.',
+  backupRefused: 'El portal rechazó el respaldo MIPYME: el motivo es el mensaje del SII, en `details.portalMessage`.',
+  backupNoCompany:
+    'El portal devolvió la página de ingreso ("Seleccionar empresa") sin ningún mensaje. No se pudo determinar la causa.',
+  backupDayOverLimit:
+    'Un solo día y tipo de documento supera los 20 documentos por descarga que permite el SII: no se puede dividir más, y por eso no se descargó nada.',
+  backupDayUnknownTypes:
+    'Un solo día supera los 20 documentos por descarga y tiene documentos de tipos que no se saben separar: no se pudo cubrir completo, y por eso no se descargó nada.',
+  purchaseChangeNotConfirmed:
+    'El SII no confirmó el cambio en el registro de compras, pero pudo haberse aplicado: hay que releer el documento antes de reintentar.',
 }
 
 /**
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal-catalog.test.ts --coverage=false
npx tsc --noEmit -p .
```

Expected: PASS, 6 tests. `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
npm run prettier
git add src/catalogs/portal.ts tests/portal-catalog.test.ts
git commit -m "feat: RCV and backup catalog, new portal rejections"
```

The body says why: What the RCV and the backup need to know about the SII, in one place, and what each refusal means for the operator.

---

## Task 3: JSON requests, and structured bodies are not firewall pages

The two changes to the request layer (spec 3.2, D56) and two helpers on the client. `portalRequest` takes `json`, with the headers that got good answers in both environments and no `Sec-Fetch-*`. A body that starts with `<?xml`, `{` or `[` skips the firewall's text check, so a document that says "acceso restringido" does not abort a download; HTTP 403 still blocks. What a blocked page said goes through `redactText`, because a JSON body can echo the token. `randomId` makes the transaction ids injectable, read only on use, and `siiCodeOf` turns a value of the caller into a code of the SII.

**Files:**
- Modify: `src/portal/client.ts`
- Modify: `src/portal/session.ts`
- Modify: `tests/portal/client.test.ts`
- Modify: `tests/portal/session.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/portal/client.test.ts`, as a diff:

```diff
diff --git a/tests/portal/client.test.ts b/tests/portal/client.test.ts
index f046aef..bb2fbed 100644
--- a/tests/portal/client.test.ts
+++ b/tests/portal/client.test.ts
@@ -1,9 +1,11 @@
+import { BACKUP_ORIGINS, DOCUMENT_OPERATIONS } from '../../src/catalogs/portal'
 import { DteError } from '../../src/errors'
 import {
   createPortalClient,
   DEFAULT_PORTAL_RETRY_POLICY,
   isRetryablePortalError,
   resolvePortalCompany,
+  siiCodeOf,
 } from '../../src/portal/client'
 import { certificate, failure } from '../support/portal'
 
@@ -93,3 +95,18 @@ test('anything else is not retried', () => {
 test('the failure helper needs a rejection', async () => {
   await expect(failure(Promise.resolve())).rejects.toThrow('expected a rejection')
 })
+
+test('transaction ids are UUIDs by default, and can be injected', () => {
+  expect(createPortalClient(options).randomId()).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/)
+  expect(createPortalClient({ ...options, randomId: () => 'tx-1' }).randomId()).toBe('tx-1')
+})
+
+test('values of the caller become codes of the SII, and an unknown one is refused', () => {
+  expect(siiCodeOf(DOCUMENT_OPERATIONS, 'received', 'direction')).toBe(2)
+  expect(siiCodeOf(BACKUP_ORIGINS, 'issued', 'direction')).toBe('ENV')
+  for (const value of ['sideways', 'toString']) {
+    expect(() => siiCodeOf(BACKUP_ORIGINS, value as 'issued', 'direction')).toThrow(
+      expect.objectContaining({ code: 'INVALID_OPTION', details: { field: 'direction' } }),
+    )
+  }
+})
```

`tests/portal/session.test.ts`, as a diff:

```diff
diff --git a/tests/portal/session.test.ts b/tests/portal/session.test.ts
index 0a268a8..44528e9 100644
--- a/tests/portal/session.test.ts
+++ b/tests/portal/session.test.ts
@@ -338,6 +338,53 @@ describe('requests', () => {
     expect(error.details).toMatchObject({ httpStatus: 503, channel: 'portal', operation: 'test.x' })
   })
 
+  test('a document or a JSON answer may say the words of the firewall', async () => {
+    const harness = await signedIn([
+      { url: `${MAULLIN}/xml`, reply: { body: '\n<?xml version="1.0"?><Glosa>acceso restringido</Glosa>' } },
+      { url: `${MAULLIN}/object`, reply: { body: '{"glosa":"Transaccion Rechazada"}' } },
+      { url: `${MAULLIN}/list`, reply: { body: '["acceso restringido"]' } },
+    ])
+    for (const path of ['xml', 'object', 'list']) {
+      const reached = await run(harness, (context) => portalRequest(context, 'x', 'GET', `${MAULLIN}/${path}`))
+      expect(reached.status).toBe(200)
+    }
+  })
+
+  test('HTTP 403 blocks whatever the body is, and a token in it does not reach the details', async () => {
+    const harness = await signedIn([
+      { url: `${MAULLIN}/a`, reply: { status: 403, body: '{"metaData":{"conversationId":"TOKEN-ABC"}}' } },
+    ])
+    const error = await failure(run(harness, (context) => portalRequest(context, 'x', 'GET', `${MAULLIN}/a`)))
+    expect(error.code).toBe('SII_PORTAL_BLOCKED')
+    expect(error.details.portalMessage).not.toContain('TOKEN-ABC')
+  })
+
+  test('JSON goes as JSON, with the headers of a JSON service and no browser navigation headers', async () => {
+    const harness = await signedIn([{ url: `${MAULLIN}/a`, method: 'POST', reply: { body: '{}' } }])
+    await run(harness, (context) =>
+      portalRequest(context, 'x', 'POST', `${MAULLIN}/a`, { json: { data: null }, referer: `${MAULLIN}/` }),
+    )
+    const [request] = harness.fake.requests
+    expect(request.text).toBe('{"data":null}')
+    expect(request.headers).toMatchObject({
+      accept: 'application/json, text/plain, */*',
+      'content-type': 'application/json',
+      origin: 'https://maullin.sii.cl',
+      referer: `${MAULLIN}/`,
+    })
+    expect(request.headers.cookie).toContain('NETSCAPE_LIVEWIRE.rut=12345678')
+    expect(request.headers['user-agent']).toContain('Mozilla')
+    expect(request.headers['accept-language']).toContain('es-419')
+    expect(Object.keys(request.headers).filter((name) => name.startsWith('sec-'))).toEqual([])
+  })
+
+  test('without a referer or cookies, a JSON request says nothing of them', async () => {
+    const harness = portalWith([{ url: `${MAULLIN}/a`, method: 'POST', reply: { body: '{}' } }])
+    await run(harness, (context) => portalRequest(context, 'x', 'POST', `${MAULLIN}/a`, { json: {} }))
+    expect(harness.fake.requests[0].headers.referer).toBeUndefined()
+    expect(harness.fake.requests[0].headers.cookie).toBeUndefined()
+  })
+
   test('any other status is a page', async () => {
     const harness = await signedIn([{ url: `${MAULLIN}/a`, reply: { status: 500, body: 'Error 500' } }])
     const reached = await run(harness, (context) => portalRequest(context, 'x', 'GET', `${MAULLIN}/a`))
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/client.test.ts tests/portal/session.test.ts --coverage=false
```

Expected: FAIL: `siiCodeOf` and `randomId` do not exist, and `portalRequest` takes no `json`.

- [ ] **Step 3: Write the implementation**

`src/portal/client.ts`, as a diff:

```diff
diff --git a/src/portal/client.ts b/src/portal/client.ts
index 6d8b276..73402b8 100644
--- a/src/portal/client.ts
+++ b/src/portal/client.ts
@@ -87,6 +87,8 @@ export type PortalClientOptions = {
   readonly now?: () => Date
   /** EN: Wait between retries and between steps. ES: Espera entre reintentos y entre pasos. */
   readonly sleep?: SleepFn
+  /** EN: Source of the transaction ids of the RCV; `crypto.randomUUID` by default. ES: `transactionId` — Fuente de los identificadores de transacción del RCV; por defecto `crypto.randomUUID`. */
+  readonly randomId?: () => string
 }
 
 /**
@@ -122,6 +124,8 @@ export type PortalClient = {
   readonly now: () => Date
   /** EN: Wait function. ES: Función de espera. */
   readonly sleep: SleepFn
+  /** EN: Source of transaction ids. ES: `transactionId` — Fuente de identificadores de transacción. */
+  readonly randomId: () => string
 }
 
 /**
@@ -158,6 +162,7 @@ export const createPortalClient = (options: PortalClientOptions): PortalClient =
     capture: options.capture ?? null,
     now: options.now ?? (() => new Date()),
     sleep: options.sleep ?? defaultSleep,
+    randomId: options.randomId ?? (() => crypto.randomUUID()),
   })
 }
 
@@ -170,3 +175,13 @@ export const resolvePortalCompany = (portal: PortalClient, companyRut?: string):
   if (portal.companyRut === null) throw new DteError('MISSING_FIELD', { field: 'companyRut' })
   return portal.companyRut
 }
+
+/**
+ * EN: The SII's code for a value of the caller.
+ * ES: El código del SII para un valor de quien llama.
+ * @throws {DteError} EN: `INVALID_OPTION { field }` when the table has no such value. ES: `INVALID_OPTION { field }` si la tabla no tiene ese valor.
+ */
+export const siiCodeOf = <K extends string, V>(table: Readonly<Record<K, V>>, value: K, field: string): V => {
+  if (!Object.prototype.hasOwnProperty.call(table, value)) throw new DteError('INVALID_OPTION', { field })
+  return table[value]
+}
```

`src/portal/session.ts`, as a diff:

```diff
diff --git a/src/portal/session.ts b/src/portal/session.ts
index 2ff6394..33de075 100644
--- a/src/portal/session.ts
+++ b/src/portal/session.ts
@@ -9,6 +9,7 @@ import {
 import { DteError, errorMessage, isDteError } from '../errors'
 import { splitSiiRut, type SiiRut } from '../model/rut'
 import type { CallOverrides } from '../sii/client'
+import { redactText } from '../sii/capture'
 import { bodyExcerpt, httpError } from '../sii/operation'
 import { mergeRetryPolicy, withRetry } from '../sii/retry'
 import { send } from '../sii/send'
@@ -42,6 +43,7 @@ const USER_AGENT =
   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
 const ACCEPT =
   'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'
+const ACCEPT_LANGUAGE = 'es-419,es-US;q=0.9,es;q=0.8,en;q=0.7'
 const RETRYABLE_STATUS: ReadonlySet<number> = new Set([502, 503, 504])
 const REDIRECT_STATUS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308])
 const MAX_REDIRECTS = 8
@@ -109,6 +111,15 @@ const isSiiUrl = (url: string): boolean => {
   return protocol === 'https:' && hostname.endsWith('.sii.cl')
 }
 
+const contextHeaders = (
+  url: string,
+  cookies: CookieJar,
+  referer: string | undefined,
+): Readonly<Record<string, string>> => ({
+  ...(referer === undefined ? {} : { Referer: referer }),
+  ...(Object.keys(cookies).length === 0 || !isSiiUrl(url) ? {} : { Cookie: cookieHeader(cookies) }),
+})
+
 const requestHeaders = (
   url: string,
   method: HttpMethod,
@@ -117,7 +128,7 @@ const requestHeaders = (
 ): Readonly<Record<string, string>> => ({
   'User-Agent': USER_AGENT,
   Accept: ACCEPT,
-  'Accept-Language': 'es-419,es-US;q=0.9,es;q=0.8,en;q=0.7',
+  'Accept-Language': ACCEPT_LANGUAGE,
   'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
   'sec-ch-ua-mobile': '?0',
   'sec-ch-ua-platform': '"Windows"',
@@ -133,10 +144,26 @@ const requestHeaders = (
         'Content-Type': 'application/x-www-form-urlencoded',
       }
     : {}),
-  ...(referer === undefined ? {} : { Referer: referer }),
-  ...(Object.keys(cookies).length === 0 || !isSiiUrl(url) ? {} : { Cookie: cookieHeader(cookies) }),
+  ...contextHeaders(url, cookies, referer),
 })
 
+// The headers of a JSON service: these got good answers in both environments.
+const jsonHeaders = (
+  url: string,
+  cookies: CookieJar,
+  referer: string | undefined,
+): Readonly<Record<string, string>> => ({
+  'User-Agent': USER_AGENT,
+  Accept: 'application/json, text/plain, */*',
+  'Accept-Language': ACCEPT_LANGUAGE,
+  'Content-Type': 'application/json',
+  Origin: new URL(url).origin,
+  ...contextHeaders(url, cookies, referer),
+})
+
+// A document or a JSON answer may say anything: only a page can be the firewall's.
+const isStructuredBody = (text: string): boolean => /^\s*(?:<\?xml|[{[])/.test(text)
+
 /**
  * EN: The error for a page the code cannot interpret, with what the page said.
  * ES: El error para una página que el código no puede interpretar, con lo que dijo la página.
@@ -170,20 +197,27 @@ export const assertNotRejected = (context: PortalContext, html: string): void =>
 
 /**
  * EN: One request and no redirects: one `send` inside the retry loop. Cookies go into the jar; a block throws. Any other
- * status is a page, except 502, 503 and 504, which are repeated.
+ * status is a page, except 502, 503 and 504, which are repeated. A body that is a document or JSON is not read for the
+ * firewall's words, although HTTP 403 still blocks.
  * ES: Una petición sin redirecciones: un `send` dentro del ciclo de reintentos. Las cookies entran a la bolsa; un bloqueo
- * lanza. Cualquier otro estado es una página, salvo 502, 503 y 504, que se repiten.
+ * lanza. Cualquier otro estado es una página, salvo 502, 503 y 504, que se repiten. Un cuerpo que sea un documento o JSON
+ * no se revisa en busca de las palabras del firewall, aunque un HTTP 403 igual bloquea.
  */
 export const portalRequest = async (
   context: PortalContext,
   step: string,
   method: HttpMethod,
   url: string,
-  options: { readonly form?: Readonly<Record<string, string>>; readonly referer?: string } = {},
+  options: {
+    readonly form?: Readonly<Record<string, string>>
+    readonly json?: unknown
+    readonly referer?: string
+  } = {},
 ): Promise<PortalPage> => {
   const { portal, overrides, state } = context
   const operation = `${context.operation}.${step}`
-  const body = options.form === undefined ? undefined : encodeUtf8(formEncode(options.form))
+  const text = options.json === undefined ? options.form && formEncode(options.form) : JSON.stringify(options.json)
+  const body = text === undefined ? undefined : encodeUtf8(text)
   const response = await withRetry(
     mergeRetryPolicy(portal.retry, overrides?.retry),
     async (attempt) => {
@@ -192,7 +226,10 @@ export const portalRequest = async (
         channel: 'portal',
         method,
         url,
-        headers: requestHeaders(url, method, state.cookies, options.referer),
+        headers:
+          options.json === undefined
+            ? requestHeaders(url, method, state.cookies, options.referer)
+            : jsonHeaders(url, state.cookies, options.referer),
         body,
         timeoutMs: overrides?.timeoutMs ?? portal.timeoutMs,
         signal: overrides?.signal,
@@ -213,12 +250,12 @@ export const portalRequest = async (
   )
   if (isSiiUrl(url)) state.cookies = mergeSetCookie(state.cookies, response.headers['set-cookie'])
   const html = decodeBody(response.body, portalEncoding(response))
-  if (isBlockedPage(response.status, html))
+  if (isBlockedPage(response.status, isStructuredBody(html) ? '' : html))
     throw new DteError('SII_PORTAL_BLOCKED', {
       operation: context.operation,
       step,
       httpStatus: response.status,
-      portalMessage: portalMessageOf(html),
+      portalMessage: portalMessageOf(redactText(html)),
     })
   return { status: response.status, headers: response.headers, html, url, lastLocation: null }
 }
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/client.test.ts tests/portal/session.test.ts --coverage=false
npx tsc --noEmit -p .
```

Expected: PASS, 78 tests. `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
npm run prettier
git add src/portal/client.ts src/portal/session.ts tests/portal/client.test.ts tests/portal/session.test.ts
git commit -m "feat: JSON portal requests, and structured bodies are not firewall pages"
```

The body says why: The RCV speaks JSON, and the backup downloads documents that may hold the words the firewall check looks for.

---

## Task 4: The rows of the RCV answers

A pure module (D32, D48), with no requests: the row types and the functions from the SII's JSON to them. Response codes are not looked at. The names come from the SII's client code and are not measured, so an absent or unreadable field is `null` and its value stays in `raw`. A number may come as a number or as a numeric string. `PurchaseType` is measured, so it has no `raw`.

**Files:**
- Create: `src/portal/pages/rcv.ts`
- Create: `tests/portal/pages-rcv.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/portal/pages-rcv.test.ts`:

```ts
import {
  changeMessageOf,
  parseRcvAnswer,
  periodDocumentsOf,
  periodSummaryOf,
  purchaseDocumentOf,
  purchaseTypesOf,
  registerSummaryOf,
} from '../../src/portal/pages/rcv'

const SUMMARY_ROW = {
  tipoDoc: 33,
  tipoDocDesc: 'Factura Electronica',
  seccion: 'S1',
  totalDoc: 2,
  mntExento: 0,
  mntNeto: 10000,
  mntIVA: 1900,
  mntTotal: 11900,
  totalReparos: 0,
}

const row = periodSummaryOf({ data: { resumenDte: [SUMMARY_ROW] } })[0]

describe('parseRcvAnswer', () => {
  test('an object is an answer', () => {
    expect(parseRcvAnswer('{"data":null}')).toEqual({ data: null })
  })

  test.each(['<html>no</html>', '{"data":', '', 'null', '[]', '"texto"', '3'])('%s is not', (text) => {
    expect(parseRcvAnswer(text)).toBeNull()
  })
})

describe('periodSummaryOf', () => {
  test('typed fields, and the row as it came', () => {
    expect(row).toEqual({
      type: 33,
      typeDescription: 'Factura Electronica',
      section: 'S1',
      documentCount: 2,
      exemptAmount: 0,
      netAmount: 10000,
      vatAmount: 1900,
      totalAmount: 11900,
      raw: SUMMARY_ROW,
    })
  })

  test('a number may come as text; anything else is null and stays in raw', () => {
    const [read] = periodSummaryOf({
      data: { resumenDte: [{ tipoDoc: '61', mntNeto: 'mucho', mntTotal: '', totalDoc: true }] },
    })
    expect(read).toMatchObject({ type: 61, netAmount: null, totalAmount: null, documentCount: null, section: null })
    expect(read.raw.mntNeto).toBe('mucho')
  })

  test('text may come as a number', () => {
    const [read] = periodSummaryOf({ data: { resumenDte: [{ seccion: 1 }] } })
    expect(read.section).toBe('1')
  })

  test.each([
    ['measured, with no documents', { data: { resumenDte: [], datosAsync: null } }],
    ['no list', { data: { resumenDte: null } }],
    ['no data', { data: null }],
    ['nothing', {}],
  ])('%s reads as empty', (_name, answer) => {
    expect(periodSummaryOf(answer)).toEqual([])
  })

  test('an entry that is not an object is ignored', () => {
    expect(periodSummaryOf({ data: { resumenDte: [null, 'x', [1]] } })).toEqual([])
  })
})

describe('periodDocumentsOf', () => {
  const DETAIL = {
    folio: 1234,
    fechaEmision: '05/10/2026',
    fechaRecepcion: '06/10/2026',
    rutReceptor: 12345678,
    dvReceptor: '5',
    rznSocRecep: 'COMERCIAL ANDINA SPA',
    mntExento: 0,
    mntNeto: 5000,
    mntIva: 950,
    mntTotal: 5950,
    dehOrdenEvento: 3,
    dehDescripcion: 'Aceptado',
  }

  test('typed fields, with the type from the summary row', () => {
    const [document] = periodDocumentsOf({ dataResp: { detalles: [DETAIL] } }, row)
    expect(document).toEqual({
      type: 33,
      typeDescription: 'Factura Electronica',
      folio: 1234,
      issueDate: '05/10/2026',
      receivedDate: '06/10/2026',
      counterpartyRut: '12345678-5',
      counterpartyName: 'COMERCIAL ANDINA SPA',
      exemptAmount: 0,
      netAmount: 5000,
      vatAmount: 950,
      totalAmount: 5950,
      eventOrder: 3,
      eventDescription: 'Aceptado',
      raw: DETAIL,
    })
  })

  test('its own name of the type wins, unless it is empty', () => {
    const name = (descTipoDoc: unknown) =>
      periodDocumentsOf({ dataResp: { detalles: [{ descTipoDoc }] } }, row)[0].typeDescription
    expect(name('Factura propia')).toBe('Factura propia')
    expect(name('')).toBe('Factura Electronica')
    expect(name(undefined)).toBe('Factura Electronica')
  })

  test('half a RUT is no RUT', () => {
    const rut = (fields: Record<string, unknown>) =>
      periodDocumentsOf({ dataResp: { detalles: [fields] } }, row)[0].counterpartyRut
    expect(rut({ rutReceptor: '12345678' })).toBeNull()
    expect(rut({ dvReceptor: '5' })).toBeNull()
    expect(rut({ rutReceptor: '', dvReceptor: '5' })).toBeNull()
  })

  test.each([
    ['no list', { dataResp: { detalles: null } }],
    ['no data', { dataResp: null }],
    ['nothing', {}],
  ])('%s reads as empty', (_name, answer) => {
    expect(periodDocumentsOf(answer, row)).toEqual([])
  })
})

describe('registerSummaryOf', () => {
  const REGISTER_ROW = {
    rsmnTipoDocInteger: 33,
    dcvNombreTipoDoc: 'Factura Electronica',
    rsmnTotDoc: 4,
    rsmnMntExe: 0,
    rsmnMntNeto: 20000,
    rsmnMntIVA: 3800,
    rsmnIVAUsoComun: 100,
    rsmnMntIVANoRec: 200,
    rsmnMntTotal: 23800,
    rsmnLink: true,
  }

  test('rows and header', () => {
    const header = { dcvFecModificacion: '01/10/2026', dcvFctProp: '0.5' }
    expect(registerSummaryOf({ data: [REGISTER_ROW], dataCabecera: header })).toEqual({
      rows: [
        {
          type: 33,
          typeName: 'Factura Electronica',
          documentCount: 4,
          exemptAmount: 0,
          netAmount: 20000,
          vatAmount: 3800,
          commonUseVat: 100,
          nonRecoverableVat: 200,
          totalAmount: 23800,
          raw: REGISTER_ROW,
        },
      ],
      header: { updatedAt: '01/10/2026', proportionalityFactor: 0.5, raw: header },
    })
  })

  test('as measured with no documents', () => {
    expect(registerSummaryOf({ data: null, dataCabecera: null, respEstado: { codRespuesta: 3 } })).toEqual({
      rows: [],
      header: null,
    })
  })
})

describe('purchaseTypesOf', () => {
  test('as measured', () => {
    expect(
      purchaseTypesOf({
        data: [
          { id: '1', descripcion: 'Del Giro', intercambiable: false },
          { id: '2', descripcion: 'Supermercados', intercambiable: true },
        ],
      }),
    ).toEqual([
      { id: '1', description: 'Del Giro', interchangeable: false },
      { id: '2', description: 'Supermercados', interchangeable: true },
    ])
  })

  test('no data is an empty catalogue', () => {
    expect(purchaseTypesOf({ data: null })).toEqual([])
  })
})

describe('purchaseDocumentOf', () => {
  test('typed fields, and the document as it came', () => {
    const raw = {
      det_tipo_doc: 33,
      det_nro_doc: '1234',
      det_rzn_soc: 'COMERCIAL ANDINA SPA',
      det_fec_creacion: '06/10/2026',
      det_mnt_exe: 0,
      det_mnt_neto: 5000,
      det_mnt_iva: 950,
      det_iva_uso_comun: 0,
      det_monto_iva_no_r: 0,
      det_mnt_total: 5950,
      det_tipo_transaccion: '4',
      det_tpo_imp: '1',
    }
    expect(purchaseDocumentOf({ data: raw })).toEqual({
      type: 33,
      folio: 1234,
      businessName: 'COMERCIAL ANDINA SPA',
      createdAt: '06/10/2026',
      exemptAmount: 0,
      netAmount: 5000,
      vatAmount: 950,
      commonUseVat: 0,
      nonRecoverableVat: 0,
      totalAmount: 5950,
      purchaseType: '4',
      raw,
    })
  })

  test('no data is null', () => {
    expect(purchaseDocumentOf({ data: null })).toBeNull()
    expect(purchaseDocumentOf({})).toBeNull()
  })
})

describe('changeMessageOf', () => {
  test('the first error, when there is one', () => {
    expect(changeMessageOf({ metaData: { errors: [{ descripcion: 'No se pudo' }, { descripcion: 'Otro' }] } })).toBe(
      'No se pudo',
    )
  })

  test.each([
    ['no errors', { metaData: { errors: [] } }],
    ['errors with no text', { metaData: { errors: [{}] } }],
    ['no metadata', {}],
  ])('%s', (_name, answer) => {
    expect(changeMessageOf(answer)).toBeNull()
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/pages-rcv.test.ts --coverage=false
```

Expected: FAIL, because the code below does not exist yet.

- [ ] **Step 3: Write the implementation**

`src/portal/pages/rcv.ts`:

```ts
/**
 * EN: An object of an RCV answer, as the SII sent it.
 * ES: Un objeto de una respuesta del RCV, tal como lo envió el SII.
 */
export type RcvObject = Readonly<Record<string, unknown>>

/**
 * EN: One row of the summary of a period, per document type and section. The field names come from the SII's client code
 * and are not measured: an absent or unreadable field is null, and its value stays in `raw`.
 * ES: Una fila del resumen de un período, por tipo de documento y sección. Los nombres de campo vienen del código del
 * cliente del SII y no están medidos: un campo ausente o ilegible es null, y su valor queda en `raw`.
 */
export type PeriodSummaryRow = {
  /** EN: Document type. ES: `tipoDoc` — Tipo de documento. */
  readonly type: number | null
  /** EN: Name of the type. ES: `tipoDocDesc` — Nombre del tipo. */
  readonly typeDescription: string | null
  /** EN: Section: S1 sales, S2 purchase invoices, S3 settlements, S4 exports, S5 dispatch guides. ES: `seccion` — Sección: S1 ventas, S2 facturas de compra, S3 liquidaciones, S4 exportaciones, S5 guías de despacho. */
  readonly section: string | null
  /** EN: Number of documents. ES: `totalDoc` — Cantidad de documentos. */
  readonly documentCount: number | null
  /** EN: Exempt amount. ES: `mntExento` — Monto exento. */
  readonly exemptAmount: number | null
  /** EN: Net amount. ES: `mntNeto` — Monto neto. */
  readonly netAmount: number | null
  /** EN: VAT amount. ES: `mntIVA` — Monto de IVA. */
  readonly vatAmount: number | null
  /** EN: Total amount. ES: `mntTotal` — Monto total. */
  readonly totalAmount: number | null
  /** EN: The row as the SII sent it. ES: La fila tal como la envió el SII. */
  readonly raw: RcvObject
}

/**
 * EN: One document of a period: no time of day and no XML. The field names are not measured, as in `PeriodSummaryRow`.
 * ES: Un documento de un período: sin hora ni XML. Los nombres de campo no están medidos, como en `PeriodSummaryRow`.
 */
export type PeriodDocument = {
  /** EN: Document type, from the summary row. ES: `tipoDoc` — Tipo de documento, de la fila del resumen. */
  readonly type: number | null
  /** EN: Name of the type. ES: `descTipoDoc`, si no `tipoDocDesc` — Nombre del tipo. */
  readonly typeDescription: string | null
  /** EN: Folio. ES: `folio` — Folio. */
  readonly folio: number | null
  /** EN: Issue date, as the SII writes it. ES: `fechaEmision` — Fecha de emisión, como la escribe el SII. */
  readonly issueDate: string | null
  /** EN: Reception date, as the SII writes it. ES: `fechaRecepcion` — Fecha de recepción, como la escribe el SII. */
  readonly receivedDate: string | null
  /** EN: RUT of the other party, not validated; in received documents it holds the issuer. ES: `rutReceptor` + `dvReceptor` — RUT de la contraparte, sin validar; en documentos recibidos trae al emisor. */
  readonly counterpartyRut: string | null
  /** EN: Name of the other party. ES: `rznSocRecep` — Razón social de la contraparte. */
  readonly counterpartyName: string | null
  /** EN: Exempt amount. ES: `mntExento` — Monto exento. */
  readonly exemptAmount: number | null
  /** EN: Net amount. ES: `mntNeto` — Monto neto. */
  readonly netAmount: number | null
  /** EN: VAT amount. ES: `mntIva` — Monto de IVA. */
  readonly vatAmount: number | null
  /** EN: Total amount. ES: `mntTotal` — Monto total. */
  readonly totalAmount: number | null
  /** EN: Last event: 2 acknowledged, 3 accepted, 4 claimed; not measured. ES: `dehOrdenEvento` — Último evento: 2 acuse, 3 aceptado, 4 reclamado; sin medir. */
  readonly eventOrder: number | null
  /** EN: Text of the last event. ES: `dehDescripcion` — Texto del último evento. */
  readonly eventDescription: string | null
  /** EN: The row as the SII sent it. ES: La fila tal como la envió el SII. */
  readonly raw: RcvObject
}

/**
 * EN: The documents of a period.
 * ES: Los documentos de un período.
 */
export type PeriodDocuments = {
  /** EN: The summary per type. ES: `resumenDte` — El resumen por tipo. */
  readonly summary: readonly PeriodSummaryRow[]
  /** EN: Every document of the summary's types. ES: `detalles` — Todos los documentos de los tipos del resumen. */
  readonly documents: readonly PeriodDocument[]
}

/**
 * EN: One row of the official register. The field names are not measured, as in `PeriodSummaryRow`.
 * ES: Una fila del registro oficial. Los nombres de campo no están medidos, como en `PeriodSummaryRow`.
 */
export type RegisterSummaryRow = {
  /** EN: Document type. ES: `rsmnTipoDocInteger` — Tipo de documento. */
  readonly type: number | null
  /** EN: Name of the type. ES: `dcvNombreTipoDoc` — Nombre del tipo. */
  readonly typeName: string | null
  /** EN: Number of documents. ES: `rsmnTotDoc` — Cantidad de documentos. */
  readonly documentCount: number | null
  /** EN: Exempt amount. ES: `rsmnMntExe` — Monto exento. */
  readonly exemptAmount: number | null
  /** EN: Net amount. ES: `rsmnMntNeto` — Monto neto. */
  readonly netAmount: number | null
  /** EN: VAT amount. ES: `rsmnMntIVA` — Monto de IVA. */
  readonly vatAmount: number | null
  /** EN: Common use VAT. ES: `rsmnIVAUsoComun` — IVA de uso común. */
  readonly commonUseVat: number | null
  /** EN: Non recoverable VAT. ES: `rsmnMntIVANoRec` — IVA no recuperable. */
  readonly nonRecoverableVat: number | null
  /** EN: Total amount. ES: `rsmnMntTotal` — Monto total. */
  readonly totalAmount: number | null
  /** EN: The row as the SII sent it. ES: La fila tal como la envió el SII. */
  readonly raw: RcvObject
}

/**
 * EN: The header of the official register. The field names are not measured, as in `PeriodSummaryRow`.
 * ES: La cabecera del registro oficial. Los nombres de campo no están medidos, como en `PeriodSummaryRow`.
 */
export type RegisterHeader = {
  /** EN: When the register last changed, as the SII writes it. ES: `dcvFecModificacion` — Cuándo cambió el registro por última vez, como lo escribe el SII. */
  readonly updatedAt: string | null
  /** EN: Proportionality factor. ES: `dcvFctProp` — Factor de proporcionalidad. */
  readonly proportionalityFactor: number | null
  /** EN: The header as the SII sent it. ES: La cabecera tal como la envió el SII. */
  readonly raw: RcvObject
}

/**
 * EN: The official register of a period.
 * ES: El registro oficial de un período.
 */
export type RegisterSummary = {
  /** EN: The rows, per document type. ES: `data` — Las filas, por tipo de documento. */
  readonly rows: readonly RegisterSummaryRow[]
  /** EN: The header, or null. ES: `dataCabecera` — La cabecera, o null. */
  readonly header: RegisterHeader | null
}

/**
 * EN: A type of purchase the SII lets a document have. Measured.
 * ES: Un tipo de compra que el SII permite darle a un documento. Medido.
 */
export type PurchaseType = {
  /** EN: Id to pass to `changePurchaseType`. ES: `id` — Identificador para `changePurchaseType`. */
  readonly id: string
  /** EN: Name of the type. ES: `descripcion` — Nombre del tipo. */
  readonly description: string
  /** EN: The SII's client offers moving VAT between recoverable and common use only when true; it does not mean the type can be changed. ES: `intercambiable` — El cliente del SII ofrece mover el IVA entre recuperable y uso común solo cuando es true; no significa que el tipo se pueda cambiar. */
  readonly interchangeable: boolean
}

/**
 * EN: A purchase as the register holds it. The field names are not measured, as in `PeriodSummaryRow`.
 * ES: Una compra tal como la tiene el registro. Los nombres de campo no están medidos, como en `PeriodSummaryRow`.
 */
export type PurchaseDocument = {
  /** EN: Document type. ES: `det_tipo_doc` — Tipo de documento. */
  readonly type: number | null
  /** EN: Folio. ES: `det_nro_doc` — Folio. */
  readonly folio: number | null
  /** EN: Name of the issuer. ES: `det_rzn_soc` — Razón social del emisor. */
  readonly businessName: string | null
  /** EN: When the register created it, as the SII writes it. ES: `det_fec_creacion` — Cuándo lo creó el registro, como lo escribe el SII. */
  readonly createdAt: string | null
  /** EN: Exempt amount. ES: `det_mnt_exe` — Monto exento. */
  readonly exemptAmount: number | null
  /** EN: Net amount. ES: `det_mnt_neto` — Monto neto. */
  readonly netAmount: number | null
  /** EN: VAT amount. ES: `det_mnt_iva` — Monto de IVA. */
  readonly vatAmount: number | null
  /** EN: Common use VAT. ES: `det_iva_uso_comun` — IVA de uso común. */
  readonly commonUseVat: number | null
  /** EN: Non recoverable VAT. ES: `det_monto_iva_no_r` — IVA no recuperable. */
  readonly nonRecoverableVat: number | null
  /** EN: Total amount. ES: `det_mnt_total` — Monto total. */
  readonly totalAmount: number | null
  /** EN: Current type of purchase. ES: `det_tipo_transaccion` — Tipo de compra vigente. */
  readonly purchaseType: string | null
  /** EN: The document as the SII sent it. ES: El documento tal como lo envió el SII. */
  readonly raw: RcvObject
}

const isObject = (value: unknown): value is RcvObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const objectsOf = (value: unknown): readonly RcvObject[] => (Array.isArray(value) ? value.filter(isObject) : [])

// A number may arrive as a number or as a numeric string; the names are not measured, so neither are their types.
const numberOf = (value: unknown): number | null => {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
}

const textOf = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  return typeof value === 'number' ? String(value) : null
}

const childOf = (answer: RcvObject, name: string): RcvObject => {
  const child = answer[name]
  return isObject(child) ? child : {}
}

/**
 * EN: The answer of an RCV service, or null when it is not a JSON object.
 * ES: La respuesta de un servicio del RCV, o null si no es un objeto JSON.
 */
export const parseRcvAnswer = (text: string): RcvObject | null => {
  try {
    const value: unknown = JSON.parse(text)
    return isObject(value) ? value : null
  } catch {
    return null
  }
}

/**
 * EN: The summary rows of a `getResumen` of the period documents. Response codes are not looked at: a month the SII refuses
 * to show reads as an empty one.
 * ES: Las filas del resumen de un `getResumen` de los documentos de un período. No se miran los códigos de respuesta: un mes
 * que el SII se niega a mostrar se lee como uno vacío.
 */
export const periodSummaryOf = (answer: RcvObject): readonly PeriodSummaryRow[] =>
  objectsOf(childOf(answer, 'data').resumenDte).map((raw) => ({
    type: numberOf(raw.tipoDoc),
    typeDescription: textOf(raw.tipoDocDesc),
    section: textOf(raw.seccion),
    documentCount: numberOf(raw.totalDoc),
    exemptAmount: numberOf(raw.mntExento),
    netAmount: numberOf(raw.mntNeto),
    vatAmount: numberOf(raw.mntIVA),
    totalAmount: numberOf(raw.mntTotal),
    raw,
  }))

const counterpartyOf = (raw: RcvObject): string | null => {
  const body = textOf(raw.rutReceptor)
  const verifier = textOf(raw.dvReceptor)
  return body && verifier ? `${body}-${verifier}` : null
}

/**
 * EN: The documents of a detail answer, each taking its type from the summary row.
 * ES: Los documentos de una respuesta de detalle, cada uno con el tipo de la fila del resumen.
 */
export const periodDocumentsOf = (answer: RcvObject, row: PeriodSummaryRow): readonly PeriodDocument[] =>
  objectsOf(childOf(answer, 'dataResp').detalles).map((raw) => ({
    type: row.type,
    typeDescription: textOf(raw.descTipoDoc) || row.typeDescription,
    folio: numberOf(raw.folio),
    issueDate: textOf(raw.fechaEmision),
    receivedDate: textOf(raw.fechaRecepcion),
    counterpartyRut: counterpartyOf(raw),
    counterpartyName: textOf(raw.rznSocRecep),
    exemptAmount: numberOf(raw.mntExento),
    netAmount: numberOf(raw.mntNeto),
    vatAmount: numberOf(raw.mntIva),
    totalAmount: numberOf(raw.mntTotal),
    eventOrder: numberOf(raw.dehOrdenEvento),
    eventDescription: textOf(raw.dehDescripcion),
    raw,
  }))

/**
 * EN: The rows and the header of a `getResumen` of the register.
 * ES: Las filas y la cabecera de un `getResumen` del registro.
 */
export const registerSummaryOf = (answer: RcvObject): RegisterSummary => ({
  rows: objectsOf(answer.data).map((raw) => ({
    type: numberOf(raw.rsmnTipoDocInteger),
    typeName: textOf(raw.dcvNombreTipoDoc),
    documentCount: numberOf(raw.rsmnTotDoc),
    exemptAmount: numberOf(raw.rsmnMntExe),
    netAmount: numberOf(raw.rsmnMntNeto),
    vatAmount: numberOf(raw.rsmnMntIVA),
    commonUseVat: numberOf(raw.rsmnIVAUsoComun),
    nonRecoverableVat: numberOf(raw.rsmnMntIVANoRec),
    totalAmount: numberOf(raw.rsmnMntTotal),
    raw,
  })),
  header: isObject(answer.dataCabecera)
    ? {
        updatedAt: textOf(answer.dataCabecera.dcvFecModificacion),
        proportionalityFactor: numberOf(answer.dataCabecera.dcvFctProp),
        raw: answer.dataCabecera,
      }
    : null,
})

/**
 * EN: The catalogue of purchase types.
 * ES: El catálogo de tipos de compra.
 */
export const purchaseTypesOf = (answer: RcvObject): readonly PurchaseType[] =>
  objectsOf(answer.data).map((raw) => ({
    id: String(raw.id),
    description: String(raw.descripcion),
    interchangeable: raw.intercambiable === true,
  }))

/**
 * EN: One purchase, or null when the SII has no data for that key.
 * ES: Una compra, o null si el SII no tiene datos para esa clave.
 */
export const purchaseDocumentOf = (answer: RcvObject): PurchaseDocument | null => {
  const raw = answer.data
  return isObject(raw)
    ? {
        type: numberOf(raw.det_tipo_doc),
        folio: numberOf(raw.det_nro_doc),
        businessName: textOf(raw.det_rzn_soc),
        createdAt: textOf(raw.det_fec_creacion),
        exemptAmount: numberOf(raw.det_mnt_exe),
        netAmount: numberOf(raw.det_mnt_neto),
        vatAmount: numberOf(raw.det_mnt_iva),
        commonUseVat: numberOf(raw.det_iva_uso_comun),
        nonRecoverableVat: numberOf(raw.det_monto_iva_no_r),
        totalAmount: numberOf(raw.det_mnt_total),
        purchaseType: textOf(raw.det_tipo_transaccion),
        raw,
      }
    : null
}

/**
 * EN: What the SII said about a change: the first of `metaData.errors`, when there is one.
 * ES: Lo que dijo el SII sobre un cambio: el primero de `metaData.errors`, si lo hay.
 */
export const changeMessageOf = (answer: RcvObject): string | null => {
  const [first] = objectsOf(childOf(answer, 'metaData').errors)
  return first === undefined ? null : textOf(first.descripcion)
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/pages-rcv.test.ts --coverage=false
npx tsc --noEmit -p .
```

Expected: PASS, 32 tests. `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
npm run prettier
git add src/portal/pages/rcv.ts tests/portal/pages-rcv.test.ts
git commit -m "feat: read the rows of the RCV answers"
```

The body says why: Nothing else in the portal looks at the shape of these answers, and rows not yet seen with real documents must not fail on a name that changed.

---

## Task 5: RCV reads

`listPeriodDocuments`, `fetchRegisterSummary`, `listPurchaseTypes` and `fetchPurchaseDocument` (spec 3.3). A query visits the app, reads the token and posts the envelope (D47). One POST per call unless the caller opts in, and one fresh-session retry for the whole read (D49). The detail of a period uses the calls known to work (D51): `getDetalleRecibidos` for everything but issued 33 and 34, with `refNCD` always `'0'`. Those details run at the same time. Issue arrowsw/dte-sdk#14 verifies the method and `refNCD` against real documents: do not change them here.

**Files:**
- Create: `src/portal/rcv.ts`
- Create: `tests/portal/rcv.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/portal/rcv.test.ts`:

```ts
import { RCV_SERVICES } from '../../src/catalogs/portal'
import {
  fetchPurchaseDocument,
  fetchRegisterSummary,
  listPeriodDocuments,
  listPurchaseTypes,
} from '../../src/portal/rcv'
import { createMemoryCapture } from '../../src/sii/capture'
import { DteError } from '../../src/errors'
import { ISSUER_RUT, RECEIVER_RUT } from '../support/fixtures'
import type { FakeReply, FakeRoute, RecordedRequest } from '../support/fake-sii'
import {
  failure,
  HERCULES,
  portalWith,
  seedSession,
  SESSION_COOKIES,
  signedIn,
  type PortalHarness,
} from '../support/portal'
import { AUTH_PAGE, page } from '../support/portal-pages'

const CERTIFICATION = 'https://www4c.sii.cl'
const PRODUCTION = 'https://www4.sii.cl'
const TOKEN = 'token-de-prueba'
const COOKIE = { 'Set-Cookie': `TOKEN=${TOKEN}; Path=/` }
const DOCUMENTS_API = `${CERTIFICATION}/consemitidosinternetui/services/data/facadeService`
const REGISTER_API = `${CERTIFICATION}/consdcvinternetui/services/data/facadeService`
const COMPLEMENTS_API = `${CERTIFICATION}/complementoscvui/services/data/facadeServiceCompCompraService`

const json = (value: unknown): FakeReply => ({ body: JSON.stringify(value), encoding: 'utf8' })
const app = (name: string, host = CERTIFICATION): FakeRoute => ({
  url: `${host}/${name}/`,
  reply: { headers: COOKIE, body: page('app') },
})
const api = (url: string, reply: FakeRoute['reply']): FakeRoute => ({ url, method: 'POST', reply })
const posts = (harness: PortalHarness): readonly RecordedRequest[] =>
  harness.fake.requests.filter((request) => request.method === 'POST')
const sent = (request: RecordedRequest): { metaData: Record<string, unknown>; data: Record<string, unknown> } =>
  JSON.parse(request.text)

const options = { randomId: () => 'tx-1' }
const SUMMARY = (...rows: readonly Record<string, unknown>[]): FakeReply =>
  json({ data: { resumenDte: rows, datosAsync: null }, metaData: {}, respEstado: { codRespuesta: 0 } })
const DETAILS = (...rows: readonly Record<string, unknown>[]): FakeReply => json({ dataResp: { detalles: rows } })

describe('listPeriodDocuments', () => {
  const routes = (rows: readonly Record<string, unknown>[], details: FakeRoute['reply'] = DETAILS({ folio: 7 })) => [
    app('consemitidosinternetui'),
    api(`${DOCUMENTS_API}/getResumen`, SUMMARY(...rows)),
    api(`${DOCUMENTS_API}/getDetalleEmitidos3334`, details),
    api(`${DOCUMENTS_API}/getDetalleRecibidos`, details),
  ]

  test('visits the app, and posts the envelope with the token as the conversation', async () => {
    const harness = await signedIn(routes([{ tipoDoc: 33, tipoDocDesc: 'Factura' }]), options)
    const result = await listPeriodDocuments(harness.portal, { period: '2026-10' })
    expect(harness.urls()[0]).toBe(`${CERTIFICATION}/consemitidosinternetui/`)
    const [summary, detail] = posts(harness)
    expect(sent(summary)).toEqual({
      metaData: {
        namespace: `${RCV_SERVICES.documents.namespace}/getResumen`,
        conversationId: TOKEN,
        transactionId: 'tx-1',
        page: null,
      },
      data: { periodo: '2026-10', rutContribuyente: '76543210', dvContribuyente: '3', operacion: 1 },
    })
    expect(summary.headers.referer).toBe(`${CERTIFICATION}/consemitidosinternetui/`)
    expect(detail.url).toBe(`${DOCUMENTS_API}/getDetalleEmitidos3334`)
    expect(sent(detail).data).toEqual({
      tipoDoc: '33',
      rut: '76543210',
      dv: '3',
      periodo: '2026-10',
      operacion: 1,
      derrCodigo: '33',
      refNCD: '0',
    })
    expect(result.documents).toMatchObject([{ type: 33, typeDescription: 'Factura', folio: 7 }])
    expect(result.summary).toHaveLength(1)
  })

  test('an issued 61 is asked through getDetalleRecibidos, with refNCD 0', async () => {
    const harness = await signedIn(routes([{ tipoDoc: 61, refNCD: '1' }]), options)
    await listPeriodDocuments(harness.portal, { period: '2026-10', direction: 'issued' })
    const [, detail] = posts(harness)
    expect(detail.url).toBe(`${DOCUMENTS_API}/getDetalleRecibidos`)
    expect(sent(detail).data).toMatchObject({ tipoDoc: '61', operacion: 1, refNCD: '0' })
  })

  test('a received 33 is asked through getDetalleRecibidos too, with operation 2', async () => {
    const harness = await signedIn(routes([{ tipoDoc: 34 }]), options)
    await listPeriodDocuments(harness.portal, { period: '2026-10', direction: 'received' })
    const [summary, detail] = posts(harness)
    expect(sent(summary).data.operacion).toBe(2)
    expect(detail.url).toBe(`${DOCUMENTS_API}/getDetalleRecibidos`)
  })

  test('one detail per row, all of them flattened in the order of the summary', async () => {
    const replies: Readonly<Record<string, FakeReply>> = {
      '33': DETAILS({ folio: 1 }, { folio: 2 }),
      '61': DETAILS({ folio: 3 }),
    }
    const harness = await signedIn(
      routes([{ tipoDoc: 33 }, { tipoDoc: 61 }], (request) => replies[sent(request).data.tipoDoc as string]),
      options,
    )
    const { documents } = await listPeriodDocuments(harness.portal, { period: '2026-10' })
    expect(documents.map((document) => [document.type, document.folio])).toEqual([
      [33, 1],
      [33, 2],
      [61, 3],
    ])
  })

  test('an empty summary, as measured, makes no more requests', async () => {
    const harness = await signedIn(routes([]), options)
    await expect(listPeriodDocuments(harness.portal, { period: '2026-10' })).resolves.toEqual({
      summary: [],
      documents: [],
    })
    expect(posts(harness)).toHaveLength(1)
  })

  test('a 99 of the SII reads as an empty month: response codes are not looked at', async () => {
    const harness = await signedIn(
      [
        app('consemitidosinternetui'),
        api(
          `${DOCUMENTS_API}/getResumen`,
          json({ data: null, respEstado: { codRespuesta: 99, msgeRespuesta: 'Usuario no autorizado' } }),
        ),
      ],
      options,
    )
    await expect(listPeriodDocuments(harness.portal, { period: '2026-10' })).resolves.toEqual({
      summary: [],
      documents: [],
    })
  })

  test('production goes to its own host', async () => {
    const harness = await signedIn(
      [
        app('consemitidosinternetui', PRODUCTION),
        api(`${PRODUCTION}/consemitidosinternetui/services/data/facadeService/getResumen`, SUMMARY()),
      ],
      { ...options, environment: 'production' },
    )
    await listPeriodDocuments(harness.portal, { period: '2026-10' })
    expect(harness.urls()[0]).toBe(`${PRODUCTION}/consemitidosinternetui/`)
  })

  test('the transaction id is a UUID unless injected', async () => {
    const harness = await signedIn(routes([]))
    await listPeriodDocuments(harness.portal, { period: '2026-10' })
    expect(sent(posts(harness)[0]).metaData.transactionId).toMatch(/^[0-9a-f-]{36}$/)
  })

  test('the company of the call wins over the one of the client', async () => {
    const harness = await signedIn(routes([]), options)
    await listPeriodDocuments(harness.portal, { period: '2026-10', companyRut: RECEIVER_RUT })
    expect(sent(posts(harness)[0]).data).toMatchObject({ rutContribuyente: '12345678', dvContribuyente: '5' })
  })

  test.each([
    ['a period that is not one', { period: '202610' }, 'INVALID_DATE', 'period'],
    ['a direction that is not one', { period: '2026-10', direction: 'sideways' }, 'INVALID_OPTION', 'direction'],
  ])('%s is refused before any request', async (_name, input, code, field) => {
    const harness = await signedIn(routes([]), options)
    const error = await failure(listPeriodDocuments(harness.portal, input as { period: string }))
    expect(error).toMatchObject({ code, details: { field } })
    expect(harness.fake.requests).toHaveLength(0)
  })

  test('no company at all is a missing field', async () => {
    const harness = await signedIn(routes([]), { ...options, companyRut: undefined })
    const error = await failure(listPeriodDocuments(harness.portal, { period: '2026-10' }))
    expect(error).toMatchObject({ code: 'MISSING_FIELD', details: { field: 'companyRut' } })
  })
})

describe('the session of a read', () => {
  const summaryRoute = (reply: FakeRoute['reply']) => api(`${DOCUMENTS_API}/getResumen`, reply)
  const entry = (cookies: Readonly<Record<string, string>> = COOKIE) => ({
    url: `${CERTIFICATION}/consemitidosinternetui/`,
    reply: { headers: cookies, body: page('app') },
  })

  test('CSESSIONID serves as the token when TOKEN is absent', async () => {
    const harness = await signedIn([entry({ 'Set-Cookie': 'CSESSIONID=otro-token; Path=/' }), summaryRoute(SUMMARY())])
    await listPeriodDocuments(harness.portal, { period: '2026-10' })
    expect(sent(posts(harness)[0]).metaData.conversationId).toBe('otro-token')
  })

  test('a token already in the jar is enough', async () => {
    const harness = portalWith([entry({}), summaryRoute(SUMMARY())])
    await seedSession(harness.portal, { ...SESSION_COOKIES, TOKEN: 'guardado' })
    await listPeriodDocuments(harness.portal, { period: '2026-10' })
    expect(sent(posts(harness)[0]).metaData.conversationId).toBe('guardado')
  })

  test('no token even with a fresh session is a page it cannot read', async () => {
    const harness = await signedIn([entry({})])
    const error = await failure(listPeriodDocuments(harness.portal, { period: '2026-10' }))
    expect(error).toMatchObject({ code: 'SII_PORTAL_UNEXPECTED_PAGE', details: { step: 'token' } })
    expect(posts(harness)).toHaveLength(0)
  })

  test('a cold session logs in on the way to the app, as measured', async () => {
    const appUrl = `${CERTIFICATION}/consemitidosinternetui/`
    const harness = portalWith([
      {
        url: appUrl,
        reply: [
          {
            status: 302,
            headers: { Location: `https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?${appUrl}` },
          },
          { headers: COOKIE, body: page('app') },
        ],
      },
      { url: 'https://zeusr.sii.cl/AUT2000/InicioAutenticacion/*', reply: { body: AUTH_PAGE } },
      {
        url: `${HERCULES}*`,
        method: 'POST',
        reply: { status: 302, headers: { Location: appUrl, 'Set-Cookie': 'NETSCAPE_LIVEWIRE.rut=12345678; Path=/' } },
      },
      summaryRoute(SUMMARY()),
    ])
    await listPeriodDocuments(harness.portal, { period: '2026-10' })
    expect(sent(posts(harness)[1]).metaData.conversationId).toBe(TOKEN)
  })

  test('an answer that is not JSON is repeated once with a fresh session, and its token stays out of the details', async () => {
    const cut = '{"metaData":{"conversationId":"token-de-prueba","page":null'
    const harness = await signedIn([entry(), summaryRoute({ body: cut })])
    const error = await failure(listPeriodDocuments(harness.portal, { period: '2026-10' }))
    expect(error).toMatchObject({ code: 'SII_PORTAL_UNEXPECTED_PAGE', details: { step: 'getResumen' } })
    expect(JSON.stringify(error.details)).not.toContain(TOKEN)
    expect(posts(harness)).toHaveLength(2)
  })

  test('the second try can succeed', async () => {
    const harness = await signedIn([entry(), summaryRoute([{ body: page('Intermedia') }, SUMMARY()])])
    await expect(listPeriodDocuments(harness.portal, { period: '2026-10' })).resolves.toEqual({
      summary: [],
      documents: [],
    })
  })

  test('one POST per call by default, also on a transient failure', async () => {
    const harness = await signedIn([entry(), summaryRoute([new DteError('TRANSPORT_FAILED', {}), SUMMARY()])], {
      retry: {},
    })
    const error = await failure(listPeriodDocuments(harness.portal, { period: '2026-10' }))
    expect(error.code).toBe('TRANSPORT_FAILED')
    expect(posts(harness)).toHaveLength(1)
  })

  test('a caller can opt into repeating the call', async () => {
    const harness = await signedIn([entry(), summaryRoute([new DteError('TRANSPORT_FAILED', {}), SUMMARY()])], {
      retry: {},
    })
    await expect(
      listPeriodDocuments(harness.portal, { period: '2026-10' }, { retry: { maxAttempts: 2 } }),
    ).resolves.toEqual({ summary: [], documents: [] })
    expect(posts(harness)).toHaveLength(2)
    expect(harness.sleeps).toEqual([2000])
  })

  test('the visit to the app keeps its retries', async () => {
    const harness = await signedIn(
      [
        {
          url: `${CERTIFICATION}/consemitidosinternetui/`,
          reply: [new DteError('TRANSPORT_FAILED', {}), { headers: COOKIE, body: page('app') }],
        },
        summaryRoute(SUMMARY()),
      ],
      { retry: {} },
    )
    await listPeriodDocuments(harness.portal, { period: '2026-10' })
    expect(harness.sleeps).toEqual([2000])
  })

  test('a capture never holds the token, in the request or in the echo of the answer', async () => {
    const memory = createMemoryCapture()
    const harness = await signedIn(
      [entry(), summaryRoute(json({ data: { resumenDte: [] }, metaData: { conversationId: TOKEN } }))],
      { capture: memory.capture },
    )
    await listPeriodDocuments(harness.portal, { period: '2026-10' })
    expect(JSON.stringify(memory.exchanges())).not.toContain(TOKEN)
    expect(memory.exchanges().map((exchange) => exchange.operation)).toContain('listPeriodDocuments.getResumen')
  })
})

describe('fetchRegisterSummary', () => {
  const routes = (reply: FakeRoute['reply']) => [app('consdcvinternetui'), api(`${REGISTER_API}/getResumen`, reply)]

  test('posts the period in digits, and defaults to the registered status', async () => {
    const harness = await signedIn(
      routes(json({ data: [{ rsmnTipoDocInteger: 33 }], dataCabecera: { dcvFctProp: 1 } })),
      options,
    )
    const result = await fetchRegisterSummary(harness.portal, { period: '2026-10', operation: 'purchase' })
    const [post] = posts(harness)
    expect(harness.urls()[0]).toBe(`${CERTIFICATION}/consdcvinternetui/`)
    expect(sent(post)).toEqual({
      metaData: {
        namespace: `${RCV_SERVICES.register.namespace}/getResumen`,
        conversationId: TOKEN,
        transactionId: 'tx-1',
        page: null,
      },
      data: {
        rutEmisor: '76543210',
        dvEmisor: '3',
        ptributario: '202610',
        estadoContab: 'REGISTRO',
        operacion: 'COMPRA',
        busquedaInicial: true,
      },
    })
    expect(post.headers.referer).toBe(`${CERTIFICATION}/consdcvinternetui/`)
    expect(result).toMatchObject({ rows: [{ type: 33 }], header: { proportionalityFactor: 1 } })
  })

  test.each([
    ['pending', 'PENDIENTE'],
    ['notIncluded', 'NO_INCLUIR'],
    ['claimed', 'RECLAMADO'],
  ] as const)('%s is %s', async (accountingStatus, code) => {
    const harness = await signedIn(routes(json({ data: null })), options)
    await fetchRegisterSummary(harness.portal, { period: '2026-10', operation: 'sale', accountingStatus })
    expect(sent(posts(harness)[0]).data).toMatchObject({ estadoContab: code, operacion: 'VENTA' })
  })

  test('as measured with no documents', async () => {
    const harness = await signedIn(
      routes(json({ data: null, dataCabecera: null, respEstado: { codRespuesta: 3 } })),
      options,
    )
    await expect(fetchRegisterSummary(harness.portal, { period: '2026-10', operation: 'purchase' })).resolves.toEqual({
      rows: [],
      header: null,
    })
  })

  test.each([
    ['operation', { period: '2026-10', operation: 'gift' }, 'INVALID_OPTION'],
    ['accountingStatus', { period: '2026-10', operation: 'sale', accountingStatus: 'lost' }, 'INVALID_OPTION'],
    ['period', { period: 'octubre', operation: 'sale' }, 'INVALID_DATE'],
  ])('a bad %s is refused before any request', async (field, input, code) => {
    const harness = await signedIn(routes(json({})), options)
    const error = await failure(fetchRegisterSummary(harness.portal, input as never))
    expect(error).toMatchObject({ code, details: { field } })
    expect(harness.fake.requests).toHaveLength(0)
  })
})

describe('complements', () => {
  const KEY = { type: 33, folio: 1234, period: '2026-10', counterpartyRut: RECEIVER_RUT }

  test('the catalogue is asked through the register app, with a fixed transaction and a page', async () => {
    const harness = await signedIn(
      [
        app('consdcvinternetui'),
        api(
          `${COMPLEMENTS_API}/obtieneTiposTransaccionCompra`,
          json({ data: [{ id: '2', descripcion: 'Supermercados', intercambiable: true }] }),
        ),
      ],
      options,
    )
    await expect(listPurchaseTypes(harness.portal)).resolves.toEqual([
      { id: '2', description: 'Supermercados', interchangeable: true },
    ])
    expect(harness.urls()[0]).toBe(`${CERTIFICATION}/consdcvinternetui/`)
    const [post] = posts(harness)
    expect(sent(post)).toEqual({
      metaData: {
        namespace: `${RCV_SERVICES.complements.namespace}/obtieneTiposTransaccionCompra`,
        conversationId: TOKEN,
        transactionId: '1',
        page: { pageSize: 1, pageIndex: 1 },
      },
      data: null,
    })
    expect(post.headers.referer).toBe(`${CERTIFICATION}/complementoscvui/`)
  })

  test('one purchase is asked by its key, with the fields in the order of the SII', async () => {
    const harness = await signedIn(
      [
        app('consdcvinternetui'),
        api(`${COMPLEMENTS_API}/obtieneDetalleDocumento`, json({ data: { det_nro_doc: 1234 } })),
      ],
      options,
    )
    await expect(fetchPurchaseDocument(harness.portal, KEY)).resolves.toMatchObject({ folio: 1234 })
    const data = sent(posts(harness)[0]).data
    expect(Object.entries(data)).toEqual([
      ['rut', '76543210'],
      ['dv', '3'],
      ['operacion', 'COMPRA'],
      ['tipoDocumento', '33'],
      ['numeroDocumento', '1234'],
      ['periodoTributario', '202610'],
      ['rutContraparte', '12345678'],
      ['dvContraparte', '5'],
    ])
  })

  test('no data is null', async () => {
    const harness = await signedIn(
      [app('consdcvinternetui'), api(`${COMPLEMENTS_API}/obtieneDetalleDocumento`, json({ data: null }))],
      options,
    )
    await expect(fetchPurchaseDocument(harness.portal, KEY)).resolves.toBeNull()
  })

  test.each([
    ['period', { ...KEY, period: '2026-13' }, 'INVALID_DATE'],
    ['counterpartyRut', { ...KEY, counterpartyRut: 'nadie' }, 'INVALID_RUT'],
  ])('a bad %s is refused before any request', async (field, key, code) => {
    const harness = await signedIn([], options)
    const error = await failure(fetchPurchaseDocument(harness.portal, key))
    expect(error).toMatchObject({ code, details: { field } })
    expect(harness.fake.requests).toHaveLength(0)
  })

  test('the company of the key wins over the one of the client', async () => {
    const harness = await signedIn(
      [app('consdcvinternetui'), api(`${COMPLEMENTS_API}/obtieneDetalleDocumento`, json({ data: null }))],
      { ...options, companyRut: RECEIVER_RUT },
    )
    await fetchPurchaseDocument(harness.portal, { ...KEY, companyRut: ISSUER_RUT })
    expect(sent(posts(harness)[0]).data).toMatchObject({ rut: '76543210', dv: '3' })
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/rcv.test.ts --coverage=false
```

Expected: FAIL, because the code below does not exist yet.

- [ ] **Step 3: Write the implementation**

`src/portal/rcv.ts`:

```ts
import {
  ACCOUNTING_STATES,
  DOCUMENT_OPERATIONS,
  RCV_SERVICES,
  rcvAppUrl,
  REGISTER_OPERATIONS,
  type AccountingStatus,
  type DocumentDirection,
  type RcvService,
  type RegisterOperation,
} from '../catalogs/portal'
import { DteError } from '../errors'
import { splitSiiRut, toSiiRut } from '../model/rut'
import { redactText } from '../sii/capture'
import type { CallOverrides } from '../sii/client'
import { isPeriod } from '../time/chile'
import { resolvePortalCompany, siiCodeOf, type PortalClient } from './client'
import {
  parseRcvAnswer,
  periodDocumentsOf,
  periodSummaryOf,
  purchaseDocumentOf,
  purchaseTypesOf,
  registerSummaryOf,
  type PeriodDocuments,
  type PurchaseDocument,
  type PurchaseType,
  type RcvObject,
  type RegisterSummary,
} from './pages/rcv'
import {
  ensurePage,
  portalRequest,
  unexpectedPage,
  withFreshSessionRetry,
  withPortalSession,
  type PortalContext,
} from './session'

/**
 * EN: What `listPeriodDocuments` needs.
 * ES: Lo que necesita `listPeriodDocuments`.
 */
export type ListPeriodDocumentsInput = {
  /** EN: Period, `YYYY-MM`. ES: `periodo` — Período, `AAAA-MM`. */
  readonly period: string
  /** EN: Issued or received documents; issued by default. ES: `operacion` — Documentos emitidos o recibidos; por defecto emitidos. */
  readonly direction?: DocumentDirection
  /** EN: Company, when it is not the client's. ES: `rutContribuyente` + `dvContribuyente` — Empresa, si no es la del cliente. */
  readonly companyRut?: string
}

/**
 * EN: What `fetchRegisterSummary` needs.
 * ES: Lo que necesita `fetchRegisterSummary`.
 */
export type RegisterSummaryInput = {
  /** EN: Period, `YYYY-MM`. ES: `ptributario` — Período, `AAAA-MM`. */
  readonly period: string
  /** EN: Purchases or sales. ES: `operacion` — Compras o ventas. */
  readonly operation: RegisterOperation
  /** EN: Accounting status; registered by default. ES: `estadoContab` — Estado contable; por defecto registrado. */
  readonly accountingStatus?: AccountingStatus
  /** EN: Company, when it is not the client's. ES: `rutEmisor` + `dvEmisor` — Empresa, si no es la del cliente. */
  readonly companyRut?: string
}

/**
 * EN: Which purchase of the register.
 * ES: Qué compra del registro.
 */
export type PurchaseDocumentKey = {
  /** EN: Document type. ES: `tipoDocumento` — Tipo de documento. */
  readonly type: number
  /** EN: Folio. ES: `numeroDocumento` — Folio. */
  readonly folio: number
  /** EN: Tax period, `YYYY-MM`. ES: `periodoTributario` — Período tributario, `AAAA-MM`. */
  readonly period: string
  /** EN: RUT of the issuer. ES: `rutContraparte` + `dvContraparte` — RUT del emisor. */
  readonly counterpartyRut: string
  /** EN: Company, when it is not the client's. ES: `rut` + `dv` — Empresa, si no es la del cliente. */
  readonly companyRut?: string
}

const assertPeriod = (period: string): void => {
  if (!isPeriod(period)) throw new DteError('INVALID_DATE', { field: 'period' })
}

const periodDigits = (period: string): string => period.replace('-', '')

const companyOf = (portal: PortalClient, companyRut?: string): { readonly body: string; readonly verifier: string } =>
  splitSiiRut(resolvePortalCompany(portal, companyRut))

// The app leaves the token in the jar; the phase 4 session handles the login it may ask for.
const openService = async (context: PortalContext, service: RcvService): Promise<string> => {
  const page = await ensurePage(context, service.entryApp, rcvAppUrl(context.portal.environment, service.entryApp))
  const { TOKEN, CSESSIONID } = context.state.cookies
  const token = TOKEN || CSESSIONID
  if (!token) throw unexpectedPage(context, 'token', page.html)
  return token
}

const callService = async (
  context: PortalContext,
  token: string,
  service: RcvService,
  method: string,
  data: unknown,
): Promise<RcvObject> => {
  const appUrl = rcvAppUrl(context.portal.environment, service.app)
  const page = await portalRequest(context, method, 'POST', `${appUrl}${service.facade}/${method}`, {
    json: {
      metaData: {
        namespace: `${service.namespace}/${method}`,
        conversationId: token,
        transactionId: service.paged ? '1' : context.portal.randomId(),
        page: service.paged ? { pageSize: 1, pageIndex: 1 } : null,
      },
      data,
    },
    referer: appUrl,
  })
  const answer = parseRcvAnswer(page.html)
  if (answer === null) throw unexpectedPage(context, method, redactText(page.html))
  return answer
}

type ServiceCall = (method: string, data: unknown) => Promise<RcvObject>

// One POST per call unless the caller opts in, while the login and the visit to the app keep their retries. A read that
// meets an expired session or an unreadable page starts over once with a fresh session.
const readService = <T>(
  context: PortalContext,
  service: RcvService,
  read: (call: ServiceCall) => Promise<T>,
): Promise<T> =>
  withFreshSessionRetry(context, async () => {
    const token = await openService(context, service)
    const once: PortalContext = { ...context, overrides: { retry: false, ...context.overrides } }
    return read((method, data) => callService(once, token, service, method, data))
  })

const complementFields = (
  portal: PortalClient,
  key: PurchaseDocumentKey,
  change: Readonly<Record<string, string>> = {},
): RcvObject => {
  assertPeriod(key.period)
  const company = companyOf(portal, key.companyRut)
  const counterparty = splitSiiRut(toSiiRut(key.counterpartyRut, 'counterpartyRut'))
  return {
    rut: company.body,
    dv: company.verifier,
    operacion: 'COMPRA',
    tipoDocumento: String(key.type),
    numeroDocumento: String(key.folio),
    periodoTributario: periodDigits(key.period),
    ...change,
    rutContraparte: counterparty.body,
    dvContraparte: counterparty.verifier,
  }
}

/**
 * EN: Every document of a period, with no XML: the summary per type, then one detail call per row, at the same time. This
 * is not the official register. Response codes are not looked at, so a month the SII refuses to show reads as an empty one.
 * ES: Todos los documentos de un período, sin XML: el resumen por tipo y luego una llamada de detalle por fila, al mismo
 * tiempo. Este no es el registro oficial. No se miran los códigos de respuesta, así que un mes que el SII se niega a mostrar
 * se lee como uno vacío.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the period and the direction. ES: el período y la dirección.
 * @param overrides EN: per-call overrides; `retry` opts into repeating each call. ES: ajustes de la llamada; `retry` activa la repetición de cada llamada.
 * @returns EN: the summary and the documents. ES: el resumen y los documentos.
 * @throws {DteError} EN: `INVALID_DATE`, `INVALID_OPTION`, `MISSING_FIELD`, `INVALID_RUT`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const listPeriodDocuments = (
  portal: PortalClient,
  input: ListPeriodDocumentsInput,
  overrides?: CallOverrides,
): Promise<PeriodDocuments> =>
  withPortalSession(portal, 'listPeriodDocuments', overrides, async (context) => {
    assertPeriod(input.period)
    const direction = input.direction ?? 'issued'
    const operacion = siiCodeOf(DOCUMENT_OPERATIONS, direction, 'direction')
    const { body: rut, verifier: dv } = companyOf(portal, input.companyRut)
    return readService(context, RCV_SERVICES.documents, async (call) => {
      const summary = periodSummaryOf(
        await call('getResumen', {
          periodo: input.period,
          rutContribuyente: rut,
          dvContribuyente: dv,
          operacion,
        }),
      )
      if (summary.length === 0) return { summary: [], documents: [] }
      const details = await Promise.all(
        summary.map(async (row) => {
          const method =
            direction === 'issued' && (row.type === 33 || row.type === 34)
              ? 'getDetalleEmitidos3334'
              : 'getDetalleRecibidos'
          const type = String(row.raw.tipoDoc)
          const answer = await call(method, {
            tipoDoc: type,
            rut,
            dv,
            periodo: input.period,
            operacion,
            derrCodigo: type,
            refNCD: '0',
          })
          return periodDocumentsOf(answer, row)
        }),
      )
      return { summary, documents: details.flat() }
    })
  })

/**
 * EN: The official totals of a period by document type and accounting status, including what the SII aggregates, such as
 * receipts. Response codes are not looked at, so a month the SII refuses to show reads as an empty one.
 * ES: Los totales oficiales de un período por tipo de documento y estado contable, incluido lo que el SII agrega, como las
 * boletas. No se miran los códigos de respuesta, así que un mes que el SII se niega a mostrar se lee como uno vacío.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the period, the operation and the status. ES: el período, la operación y el estado.
 * @param overrides EN: per-call overrides; `retry` opts into repeating the call. ES: ajustes de la llamada; `retry` activa la repetición de la llamada.
 * @returns EN: the rows and the header. ES: las filas y la cabecera.
 * @throws {DteError} EN: `INVALID_DATE`, `INVALID_OPTION`, `MISSING_FIELD`, `INVALID_RUT`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const fetchRegisterSummary = (
  portal: PortalClient,
  input: RegisterSummaryInput,
  overrides?: CallOverrides,
): Promise<RegisterSummary> =>
  withPortalSession(portal, 'fetchRegisterSummary', overrides, async (context) => {
    assertPeriod(input.period)
    const operacion = siiCodeOf(REGISTER_OPERATIONS, input.operation, 'operation')
    const estadoContab = siiCodeOf(ACCOUNTING_STATES, input.accountingStatus ?? 'registered', 'accountingStatus')
    const { body, verifier } = companyOf(portal, input.companyRut)
    return readService(context, RCV_SERVICES.register, async (call) =>
      registerSummaryOf(
        await call('getResumen', {
          rutEmisor: body,
          dvEmisor: verifier,
          ptributario: periodDigits(input.period),
          estadoContab,
          operacion,
          busquedaInicial: true,
        }),
      ),
    )
  })

/**
 * EN: The types of purchase the SII lets a document have.
 * ES: Los tipos de compra que el SII permite darle a un documento.
 * @param portal EN: the client. ES: el cliente.
 * @param overrides EN: per-call overrides; `retry` opts into repeating the call. ES: ajustes de la llamada; `retry` activa la repetición de la llamada.
 * @returns EN: the catalogue. ES: el catálogo.
 * @throws {DteError} EN: `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const listPurchaseTypes = (portal: PortalClient, overrides?: CallOverrides): Promise<readonly PurchaseType[]> =>
  withPortalSession(portal, 'listPurchaseTypes', overrides, (context) =>
    readService(context, RCV_SERVICES.complements, async (call) =>
      purchaseTypesOf(await call('obtieneTiposTransaccionCompra', null)),
    ),
  )

/**
 * EN: One purchase as the register holds it, including its current type of purchase.
 * ES: Una compra tal como la tiene el registro, incluido su tipo de compra vigente.
 * @param portal EN: the client. ES: el cliente.
 * @param key EN: which purchase. ES: qué compra.
 * @param overrides EN: per-call overrides; `retry` opts into repeating the call. ES: ajustes de la llamada; `retry` activa la repetición de la llamada.
 * @returns EN: the document, or null when the SII has no data for that key. ES: el documento, o null si el SII no tiene datos para esa clave.
 * @throws {DteError} EN: `INVALID_DATE`, `MISSING_FIELD`, `INVALID_RUT`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const fetchPurchaseDocument = (
  portal: PortalClient,
  key: PurchaseDocumentKey,
  overrides?: CallOverrides,
): Promise<PurchaseDocument | null> =>
  withPortalSession(portal, 'fetchPurchaseDocument', overrides, async (context) => {
    const data = complementFields(portal, key)
    return readService(context, RCV_SERVICES.complements, async (call) =>
      purchaseDocumentOf(await call('obtieneDetalleDocumento', data)),
    )
  })
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/rcv.test.ts --coverage=false
npx tsc --noEmit -p .
```

Expected: PASS, 36 tests. `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
npm run prettier
git add src/portal/rcv.ts tests/portal/rcv.test.ts
git commit -m "feat: RCV reads (documents of a period, official register, purchase types and documents)"
```

The body says why: The documents of a period, the official register, and how a purchase is classified, on the phase 4 session.

---

## Task 6: RCV writes

`changePurchaseType`, `moveVatToCommonUse` and `moveVatToRecoverable` (spec 3.4). Always one attempt: `retry` does not reach the change, and there is no fresh-session retry (D49). Only `data === 'OK'` confirms, and anything else throws `purchaseChangeNotConfirmed`, whose JSDoc warns the change may have applied (D50). VAT amounts go as the caller gives them, `''` when absent, documented as final amounts. The whole answer never goes in `details`, because it carries the token.

**Files:**
- Modify: `src/portal/rcv.ts`
- Modify: `tests/portal/rcv.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/portal/rcv.test.ts`, as a diff:

```diff
diff --git a/tests/portal/rcv.test.ts b/tests/portal/rcv.test.ts
index 304be61..7afea2c 100644
--- a/tests/portal/rcv.test.ts
+++ b/tests/portal/rcv.test.ts
@@ -1,9 +1,12 @@
 import { RCV_SERVICES } from '../../src/catalogs/portal'
 import {
+  changePurchaseType,
   fetchPurchaseDocument,
   fetchRegisterSummary,
   listPeriodDocuments,
   listPurchaseTypes,
+  moveVatToCommonUse,
+  moveVatToRecoverable,
 } from '../../src/portal/rcv'
 import { createMemoryCapture } from '../../src/sii/capture'
 import { DteError } from '../../src/errors'
@@ -441,3 +444,132 @@ describe('complements', () => {
     expect(sent(posts(harness)[0]).data).toMatchObject({ rut: '76543210', dv: '3' })
   })
 })
+
+describe('writes', () => {
+  const KEY = { type: 33, folio: 1234, period: '2026-10', counterpartyRut: RECEIVER_RUT }
+  const write = (method: string, reply: FakeRoute['reply']) => [
+    app('consdcvinternetui'),
+    api(`${COMPLEMENTS_API}/${method}`, reply),
+  ]
+
+  test('changing the type sends it after the period, and only OK confirms', async () => {
+    const harness = await signedIn(write('cambiaTipoCompra', json({ data: 'OK' })), options)
+    await expect(changePurchaseType(harness.portal, { ...KEY, purchaseType: '4' })).resolves.toBeUndefined()
+    const [post] = posts(harness)
+    expect(sent(post).metaData).toMatchObject({
+      namespace: `${RCV_SERVICES.complements.namespace}/cambiaTipoCompra`,
+      transactionId: '1',
+      page: { pageSize: 1, pageIndex: 1 },
+    })
+    expect(Object.entries(sent(post).data)).toEqual([
+      ['rut', '76543210'],
+      ['dv', '3'],
+      ['operacion', 'COMPRA'],
+      ['tipoDocumento', '33'],
+      ['numeroDocumento', '1234'],
+      ['periodoTributario', '202610'],
+      ['tipoCompra', '4'],
+      ['rutContraparte', '12345678'],
+      ['dvContraparte', '5'],
+    ])
+  })
+
+  test('moving to common use sends final amounts, and an absent one goes empty', async () => {
+    const harness = await signedIn(write('cambiaIvaRec2Comun', json({ data: 'OK' })), options)
+    await moveVatToCommonUse(harness.portal, { ...KEY, commonUseVat: 19000 })
+    expect(sent(posts(harness)[0]).data).toMatchObject({ ivaComun: '19000', ivaRec: '' })
+  })
+
+  test('moving back to recoverable sends a zero as a zero', async () => {
+    const harness = await signedIn(write('cambiaIvaComun2Recuperable', json({ data: 'OK' })), options)
+    await moveVatToRecoverable(harness.portal, { ...KEY, commonUseVat: 0, recoverableVat: 19000 })
+    expect(sent(posts(harness)[0]).data).toMatchObject({ ivaComun: '0', ivaRec: '19000' })
+  })
+
+  test('an amount left out on that side goes empty too', async () => {
+    const harness = await signedIn(write('cambiaIvaComun2Recuperable', json({ data: 'OK' })), options)
+    await moveVatToRecoverable(harness.portal, { ...KEY, recoverableVat: 19000 })
+    expect(sent(posts(harness)[0]).data).toMatchObject({ ivaComun: '', ivaRec: '19000' })
+  })
+
+  test.each([
+    ['another word', { data: 'CONFIRMADO' }],
+    ['no data', { data: null }],
+    ['nothing', {}],
+  ])('%s does not confirm', async (_name, answer) => {
+    const harness = await signedIn(write('cambiaTipoCompra', json(answer)), options)
+    const error = await failure(changePurchaseType(harness.portal, { ...KEY, purchaseType: '4' }))
+    expect(error).toMatchObject({
+      code: 'SII_PORTAL_REJECTED',
+      details: { rejection: 'purchaseChangeNotConfirmed', operation: 'changePurchaseType' },
+    })
+    expect(error.details.portalMessage).toBeUndefined()
+  })
+
+  test('the message of the SII goes along, and the rest of the answer does not', async () => {
+    const harness = await signedIn(
+      write(
+        'cambiaIvaRec2Comun',
+        json({
+          data: null,
+          metaData: { conversationId: TOKEN, errors: [{ descripcion: 'Documento no modificable' }] },
+        }),
+      ),
+      options,
+    )
+    const error = await failure(moveVatToCommonUse(harness.portal, { ...KEY, commonUseVat: 19000 }))
+    expect(error.details).toMatchObject({
+      rejection: 'purchaseChangeNotConfirmed',
+      portalMessage: 'Documento no modificable',
+    })
+    expect(JSON.stringify(error.details)).not.toContain(TOKEN)
+  })
+
+  test('a lost answer is never repeated, even when the caller asks for retries', async () => {
+    const harness = await signedIn(
+      write('cambiaTipoCompra', [new DteError('TRANSPORT_FAILED', {}), json({ data: 'OK' })]),
+      { ...options, retry: {} },
+    )
+    const error = await failure(
+      changePurchaseType(harness.portal, { ...KEY, purchaseType: '4' }, { retry: { maxAttempts: 4 } }),
+    )
+    expect(error.code).toBe('TRANSPORT_FAILED')
+    expect(posts(harness)).toHaveLength(1)
+    expect(harness.sleeps).toEqual([])
+  })
+
+  test('an unreadable answer is not repeated with a fresh session either', async () => {
+    const harness = await signedIn(write('cambiaTipoCompra', { body: page('Intermedia') }), options)
+    const error = await failure(changePurchaseType(harness.portal, { ...KEY, purchaseType: '4' }))
+    expect(error.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
+    expect(posts(harness)).toHaveLength(1)
+  })
+
+  test('the visit to the app keeps its retries, because repeating it changes nothing', async () => {
+    const harness = await signedIn(
+      [
+        {
+          url: `${CERTIFICATION}/consdcvinternetui/`,
+          reply: [new DteError('TRANSPORT_FAILED', {}), { headers: COOKIE, body: page('app') }],
+        },
+        api(`${COMPLEMENTS_API}/cambiaTipoCompra`, json({ data: 'OK' })),
+      ],
+      { ...options, retry: {} },
+    )
+    await changePurchaseType(harness.portal, { ...KEY, purchaseType: '4' })
+    expect(harness.sleeps).toEqual([2000])
+  })
+
+  test('a bad key is refused before any request', async () => {
+    const harness = await signedIn([], options)
+    const error = await failure(changePurchaseType(harness.portal, { ...KEY, period: '10-2026', purchaseType: '4' }))
+    expect(error).toMatchObject({ code: 'INVALID_DATE', details: { field: 'period' } })
+    expect(harness.fake.requests).toHaveLength(0)
+  })
+
+  test('a certification client writes to certification', async () => {
+    const harness = await signedIn(write('cambiaTipoCompra', json({ data: 'OK' })), options)
+    await changePurchaseType(harness.portal, { ...KEY, purchaseType: '4' })
+    expect(harness.urls().every((url) => url.startsWith(`${CERTIFICATION}/`))).toBe(true)
+  })
+})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/rcv.test.ts --coverage=false
```

Expected: FAIL, because the three writes do not exist yet.

- [ ] **Step 3: Write the implementation**

`src/portal/rcv.ts`, as a diff:

```diff
diff --git a/src/portal/rcv.ts b/src/portal/rcv.ts
index f628708..211c38b 100644
--- a/src/portal/rcv.ts
+++ b/src/portal/rcv.ts
@@ -16,6 +16,7 @@ import type { CallOverrides } from '../sii/client'
 import { isPeriod } from '../time/chile'
 import { resolvePortalCompany, siiCodeOf, type PortalClient } from './client'
 import {
+  changeMessageOf,
   parseRcvAnswer,
   periodDocumentsOf,
   periodSummaryOf,
@@ -31,6 +32,7 @@ import {
 import {
   ensurePage,
   portalRequest,
+  rejected,
   unexpectedPage,
   withFreshSessionRetry,
   withPortalSession,
@@ -82,6 +84,26 @@ export type PurchaseDocumentKey = {
   readonly companyRut?: string
 }
 
+/**
+ * EN: What `changePurchaseType` needs.
+ * ES: Lo que necesita `changePurchaseType`.
+ */
+export type ChangePurchaseTypeInput = PurchaseDocumentKey & {
+  /** EN: An `id` from `listPurchaseTypes`. ES: `tipoCompra` — Un `id` de `listPurchaseTypes`. */
+  readonly purchaseType: string
+}
+
+/**
+ * EN: What the functions that move VAT need: the final amount of each bucket after the change, not a delta. An absent amount goes empty.
+ * ES: Lo que necesitan las funciones que mueven IVA: el monto final de cada casilla tras el cambio, no una diferencia. Un monto ausente va vacío.
+ */
+export type MoveVatInput = PurchaseDocumentKey & {
+  /** EN: Final common use VAT. ES: `ivaComun` — IVA de uso común final. */
+  readonly commonUseVat?: number
+  /** EN: Final recoverable VAT. ES: `ivaRec` — IVA recuperable final. */
+  readonly recoverableVat?: number
+}
+
 const assertPeriod = (period: string): void => {
   if (!isPeriod(period)) throw new DteError('INVALID_DATE', { field: 'period' })
 }
@@ -286,3 +308,89 @@ export const fetchPurchaseDocument = (
       purchaseDocumentOf(await call('obtieneDetalleDocumento', data)),
     )
   })
+
+// One attempt, always: nothing here can tell whether a lost answer means the change was applied.
+const writeComplement = (
+  portal: PortalClient,
+  operation: string,
+  overrides: CallOverrides | undefined,
+  method: string,
+  fields: () => RcvObject,
+): Promise<void> =>
+  withPortalSession(portal, operation, overrides, async (context) => {
+    const data = fields()
+    const token = await openService(context, RCV_SERVICES.complements)
+    const once: PortalContext = { ...context, overrides: { ...context.overrides, retry: false } }
+    const answer = await callService(once, token, RCV_SERVICES.complements, method, data)
+    if (answer.data === 'OK') return
+    const portalMessage = changeMessageOf(answer)
+    throw rejected(context, 'purchaseChangeNotConfirmed', portalMessage === null ? {} : { portalMessage })
+  })
+
+const vatFields = (input: MoveVatInput): Readonly<Record<string, string>> => ({
+  ivaComun: String(input.commonUseVat ?? ''),
+  ivaRec: String(input.recoverableVat ?? ''),
+})
+
+/**
+ * EN: Changes the type of purchase of a document. In production this changes the real register. One attempt; anything other
+ * than the SII's `OK` throws, and then the change may have applied, so read the document again with `fetchPurchaseDocument`
+ * before retrying.
+ * ES: Cambia el tipo de compra de un documento. En producción esto cambia el registro real. Un solo intento; cualquier cosa
+ * distinta del `OK` del SII lanza, y entonces el cambio pudo aplicarse, así que hay que releer el documento con
+ * `fetchPurchaseDocument` antes de reintentar.
+ * @param portal EN: the client. ES: el cliente.
+ * @param input EN: which purchase and its new type. ES: qué compra y su nuevo tipo.
+ * @param overrides EN: per-call overrides; `retry` does not reach the change. ES: ajustes de la llamada; `retry` no alcanza al cambio.
+ * @throws {DteError} EN: `SII_PORTAL_REJECTED { rejection: 'purchaseChangeNotConfirmed' }`, `INVALID_DATE`, `MISSING_FIELD`, `INVALID_RUT`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
+ */
+export const changePurchaseType = (
+  portal: PortalClient,
+  input: ChangePurchaseTypeInput,
+  overrides?: CallOverrides,
+): Promise<void> =>
+  writeComplement(portal, 'changePurchaseType', overrides, 'cambiaTipoCompra', () =>
+    complementFields(portal, input, { tipoCompra: String(input.purchaseType) }),
+  )
+
+/**
+ * EN: Moves the VAT of a document from recoverable to common use. In production this changes the real register. The amounts
+ * are the final amount of each bucket after the change, not a delta: moving it all leaves `commonUseVat` with the total and
+ * `recoverableVat` absent. One attempt; anything other than the SII's `OK` throws, and then the change may have applied, so
+ * read the document again with `fetchPurchaseDocument` before retrying.
+ * ES: Mueve el IVA de un documento de recuperable a uso común. En producción esto cambia el registro real. Los montos son el
+ * monto final de cada casilla tras el cambio, no una diferencia: al mover todo, `commonUseVat` lleva el total y
+ * `recoverableVat` queda ausente. Un solo intento; cualquier cosa distinta del `OK` del SII lanza, y entonces el cambio pudo
+ * aplicarse, así que hay que releer el documento con `fetchPurchaseDocument` antes de reintentar.
+ * @param portal EN: the client. ES: el cliente.
+ * @param input EN: which purchase and the final amounts. ES: qué compra y los montos finales.
+ * @param overrides EN: per-call overrides; `retry` does not reach the change. ES: ajustes de la llamada; `retry` no alcanza al cambio.
+ * @throws {DteError} EN: `SII_PORTAL_REJECTED { rejection: 'purchaseChangeNotConfirmed' }`, `INVALID_DATE`, `MISSING_FIELD`, `INVALID_RUT`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
+ */
+export const moveVatToCommonUse = (
+  portal: PortalClient,
+  input: MoveVatInput,
+  overrides?: CallOverrides,
+): Promise<void> =>
+  writeComplement(portal, 'moveVatToCommonUse', overrides, 'cambiaIvaRec2Comun', () =>
+    complementFields(portal, input, vatFields(input)),
+  )
+
+/**
+ * EN: Moves the VAT of a document from common use back to recoverable: the inverse of `moveVatToCommonUse`, with the same
+ * rules. Moving it all back leaves `commonUseVat` at 0 and `recoverableVat` with the total.
+ * ES: Mueve el IVA de un documento de uso común de vuelta a recuperable: lo inverso de `moveVatToCommonUse`, con las mismas
+ * reglas. Al devolver todo, `commonUseVat` queda en 0 y `recoverableVat` lleva el total.
+ * @param portal EN: the client. ES: el cliente.
+ * @param input EN: which purchase and the final amounts. ES: qué compra y los montos finales.
+ * @param overrides EN: per-call overrides; `retry` does not reach the change. ES: ajustes de la llamada; `retry` no alcanza al cambio.
+ * @throws {DteError} EN: `SII_PORTAL_REJECTED { rejection: 'purchaseChangeNotConfirmed' }`, `INVALID_DATE`, `MISSING_FIELD`, `INVALID_RUT`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
+ */
+export const moveVatToRecoverable = (
+  portal: PortalClient,
+  input: MoveVatInput,
+  overrides?: CallOverrides,
+): Promise<void> =>
+  writeComplement(portal, 'moveVatToRecoverable', overrides, 'cambiaIvaComun2Recuperable', () =>
+    complementFields(portal, input, vatFields(input)),
+  )
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/rcv.test.ts --coverage=false
npx tsc --noEmit -p .
```

Expected: PASS, 49 tests. `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
npm run prettier
git add src/portal/rcv.ts tests/portal/rcv.test.ts
git commit -m "feat: RCV writes (purchase type and VAT moves), one attempt, confirmed only by OK"
```

The body says why: A write changes the real register on a production client, and nothing here can tell whether a lost answer means it applied.

---

## Task 7: The pages of the backup

A pure module (D32, D54): the total of a listing, the check that a download is a document, and the verdict of any other page. One alert is a verdict; several are the catalogue of the template. It reuses `alertMessages`, which already ignores an alert commented out on its own line. The alert "Usuario no está autenticado" (measured, HTTP 200) reads as `backupRefused`, as D54 says.

**Files:**
- Create: `src/portal/pages/backup.ts`
- Create: `tests/portal/pages-backup.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/portal/pages-backup.test.ts`:

```ts
import { backupTotal, backupVerdict, isBackupXml } from '../../src/portal/pages/backup'
import { page } from '../support/portal-pages'

const alerts = (...messages: readonly string[]): string =>
  page(
    `<script language="JavaScript">${messages.map((message) => `alert('${message}');`).join('\n')}history.back();</script>`,
    'Seleccionar empresa',
  )

describe('backupTotal', () => {
  test.each([
    ['Número total de documentos : 12 ', 12],
    ['N&uacute;mero total de documentos:<b> 0</b>', 0],
    ['TOTAL DE DOCUMENTOS 20', 20],
  ])('%s', (html, total) => {
    expect(backupTotal(page(html))).toBe(total)
  })

  test('a page with no total has none', () => {
    expect(backupTotal(page('Seleccione un rango'))).toBeNull()
  })

  test('a number too far from the words is not the total', () => {
    expect(backupTotal(page(`total de documentos ${'x'.repeat(41)} 12`))).toBeNull()
  })
})

describe('isBackupXml', () => {
  test('a document, also after blank lines', () => {
    expect(isBackupXml('<?xml version="1.0"?><SetDTE/>')).toBe(true)
    expect(isBackupXml('\r\n  <?xml version="1.0"?><SetDTE/>')).toBe(true)
  })

  test('anything else is not', () => {
    expect(isBackupXml(page('<?xml'))).toBe(false)
    expect(isBackupXml('')).toBe(false)
  })
})

describe('backupVerdict', () => {
  test('the captcha shows up with no message', () => {
    expect(backupVerdict(page('<div class="g-recaptcha"></div>'))).toEqual({ rejection: 'backupCaptcha' })
  })

  test('several alerts are the catalogue of the template, whatever they say', () => {
    const messages = [
      'Rut sin autorizacion en la empresa',
      'No existe informacion en MIPYME para el rut ingresado',
      'tres',
    ]
    expect(backupVerdict(alerts(...messages))).toEqual({ rejection: 'backupIndeterminate', portalMessages: messages })
  })

  test.each([
    ['No existe información en MIPYME para el rut ingresado'],
    ['No existe informacion en MIPYME para el rut indicado'],
    ['NO EXISTE INFORMACION'],
  ])('one alert: %s is no data', (message) => {
    expect(backupVerdict(alerts(message))).toEqual({ rejection: 'backupNoData', portalMessage: message })
  })

  test('one alert about the captcha', () => {
    const message = 'Captcha no valido'
    expect(backupVerdict(alerts(message))).toEqual({ rejection: 'backupCaptcha', portalMessage: message })
  })

  test('any other alert is reported as it came, with no cause made up', () => {
    const message = 'Un mensaje que nadie ha visto antes'
    expect(backupVerdict(alerts(message))).toEqual({ rejection: 'backupRefused', portalMessage: message })
  })

  test('an alert wins over the title and over a recaptcha in the page', () => {
    const html = page(`<div class="g-recaptcha"></div><script>alert('Rechazado');</script>`, 'Seleccionar empresa')
    expect(backupVerdict(html)).toEqual({ rejection: 'backupRefused', portalMessage: 'Rechazado' })
  })

  test('"not authenticated", as measured with HTTP 200, reads as a refusal', () => {
    const message = 'Usuario no está autenticado'
    expect(backupVerdict(alerts(message))).toMatchObject({ rejection: 'backupRefused' })
  })

  test('the entry page with no message says no cause', () => {
    expect(backupVerdict(page('', 'Seleccionar empresa'))).toEqual({ rejection: 'backupNoCompany' })
  })

  test('a commented-out alert is not a message', () => {
    const html = page(`<script>
      if (cant_reg > 20) { //alert("Maximo numero de documentos: 20.");
      }
    </script>`)
    expect(backupVerdict(html)).toBeNull()
  })

  test('nothing readable is no verdict', () => {
    expect(backupVerdict(page('Hola'))).toBeNull()
    expect(backupVerdict('')).toBeNull()
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/pages-backup.test.ts --coverage=false
```

Expected: FAIL, because the code below does not exist yet.

- [ ] **Step 3: Write the implementation**

`src/portal/pages/backup.ts`:

```ts
import type { PortalRejection } from '../../catalogs/portal'
import { alertMessages } from '../html'

/**
 * EN: What a backup page says when it holds neither a total nor a document.
 * ES: Lo que dice una página del respaldo cuando no trae ni un total ni un documento.
 */
export type BackupVerdict = {
  /** EN: Why the portal refused. ES: Por qué rechazó el portal. */
  readonly rejection: PortalRejection
  /** EN: The one message of the page. ES: El único mensaje de la página. */
  readonly portalMessage?: string
  /** EN: The messages of a page with several. ES: Los mensajes de una página con varios. */
  readonly portalMessages?: readonly string[]
}

/**
 * EN: The total of a listing, or null when the page has none. It wins over anything else in the page: a valid listing holds
 * `recaptcha` and a commented-out alert.
 * ES: El total de un listado, o null si la página no lo trae. Gana sobre cualquier otra cosa de la página: un listado válido
 * contiene `recaptcha` y un alert comentado.
 */
export const backupTotal = (html: string): number | null => {
  const match = /total de documentos[^0-9]{0,40}(\d+)/i.exec(html)
  return match === null ? null : Number(match[1])
}

/**
 * EN: True when a download answered with a document.
 * ES: True cuando una descarga respondió con un documento.
 */
export const isBackupXml = (body: string): boolean => body.trimStart().startsWith('<?xml')

/**
 * EN: The verdict of a page that is neither a listing nor a document, or null when it says nothing readable. One alert is a
 * verdict; several are the catalogue of the template, and no branch of it ran, so nothing can be concluded from them.
 * ES: El veredicto de una página que no es un listado ni un documento, o null si no dice nada legible. Un alert es un
 * veredicto; varios son el catálogo de la plantilla, sin que corriera ninguna de sus ramas, así que de ellos no se concluye nada.
 */
export const backupVerdict = (html: string): BackupVerdict | null => {
  const [first, ...others] = alertMessages(html)
  if (first === undefined) {
    if (/recaptcha/i.test(html)) return { rejection: 'backupCaptcha' }
    return /Seleccionar empresa/i.test(html) ? { rejection: 'backupNoCompany' } : null
  }
  if (others.length > 0) return { rejection: 'backupIndeterminate', portalMessages: [first, ...others] }
  if (/no existe informaci[oó]n/i.test(first)) return { rejection: 'backupNoData', portalMessage: first }
  if (/captcha/i.test(first)) return { rejection: 'backupCaptcha', portalMessage: first }
  return { rejection: 'backupRefused', portalMessage: first }
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/pages-backup.test.ts --coverage=false
npx tsc --noEmit -p .
```

Expected: PASS, 19 tests. `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
npm run prettier
git add src/portal/pages/backup.ts tests/portal/pages-backup.test.ts
git commit -m "feat: read the pages of the MIPYME backup"
```

The body says why: The old portal reports through `alert()`, whatever the page title says, so the verdict is worth testing on its own.

---

## Task 8: The MIPYME backup

`downloadMipymeBackup` (spec 3.5). It always goes to `www1.sii.cl`, also from a certification client (D52). Each listing and each download is its own loop at 1 s and 2 s, and every request inside it has `retry: false`, so the loops do not multiply (D53). The plan comes first, so a day that cannot be downloaded throws before any download (D55).

**Two tests pin behaviour that is kept on purpose (D55):** the two-day range that downloads only its first day while `total` counts both, and a caller's `type` still splitting across every type. Both tests say so in their names. Do not fix them here.

**Files:**
- Create: `src/portal/backup.ts`
- Create: `tests/portal/backup.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/portal/backup.test.ts`:

```ts
import { downloadMipymeBackup } from '../../src/portal/backup'
import { DteError } from '../../src/errors'
import { encodeLatin1 } from '../../src/text/latin1'
import { RECEIVER_RUT } from '../support/fixtures'
import type { FakeReply, FakeRoute, RecordedRequest } from '../support/fake-sii'
import { failure, HERCULES, MAULLIN, portalWith, signedIn, type PortalHarness } from '../support/portal'
import { AUTH_PAGE, COMPANY_FORM, page } from '../support/portal-pages'

const BASE = 'https://www1.sii.cl/cgi-bin/Portal001'
const LIST = `${BASE}/lista_documentos.cgi`
const DOWNLOAD = `${BASE}/download.cgi`
const SESSION: FakeRoute = { url: `${MAULLIN}/ad_empresa1`, reply: { body: COMPANY_FORM } }
const RANGE = { from: '2026-09-01', to: '2026-09-10' }
const REFUSAL = (...messages: readonly string[]): string =>
  page(
    `<script language="JavaScript">${messages.map((message) => `alert('${message}');`).join('\n')}history.back();</script>`,
    'Seleccionar empresa',
  )

const dayOf = (time: number): string => new Date(time).toISOString().slice(0, 10)
const daysBetween = (from: string, to: string): readonly string[] => {
  const days: string[] = []
  for (let time = Date.parse(from); time <= Date.parse(to); time += 86400000) days.push(dayOf(time))
  return days
}
const listing = (total: number, extra = ''): string => page(`Numero total de documentos : ${total} ${extra}`)
const documentsXml = (count: number): string =>
  `<?xml version="1.0" encoding="ISO-8859-1"?><SetDTE>${'<TipoDTE>33</TipoDTE>'.repeat(count)}</SetDTE>`

type DayCounts = Readonly<Record<string, number>>
type Inventory = (day: string) => DayCounts

const countIn = (inventory: Inventory, from: string, to: string, type: string): number =>
  daysBetween(from, to).reduce(
    (sum, day) =>
      sum +
      Object.entries(inventory(day))
        .filter(([documentType]) => type === '' || documentType === type)
        .reduce((subtotal, [, count]) => subtotal + count, 0),
    0,
  )

/** An SII whose documents per day and type come from `inventory`. It counts and downloads as the filters say. */
const backupRoutes = (inventory: Inventory): readonly FakeRoute[] => [
  SESSION,
  {
    url: LIST,
    method: 'POST',
    reply: (request) => {
      const form = new URLSearchParams(request.text)
      return {
        body: listing(countIn(inventory, form.get('FEC_DESDE')!, form.get('FEC_HASTA')!, form.get('TPO_DOC')!)),
      }
    },
  },
  {
    url: `${DOWNLOAD}*`,
    method: 'GET',
    reply: (request) => {
      const query = new URL(request.url).searchParams
      return {
        body: documentsXml(countIn(inventory, query.get('FEC_DESDE')!, query.get('FEC_HASTA')!, query.get('TPO_DOC')!)),
      }
    },
  },
]

const downloads = (harness: PortalHarness): readonly URLSearchParams[] =>
  harness.fake.requests
    .filter((request) => request.url.startsWith(DOWNLOAD))
    .map((request) => new URL(request.url).searchParams)
const lists = (harness: PortalHarness): readonly RecordedRequest[] =>
  harness.fake.requests.filter((request) => request.url === LIST)
const tagCount = (xml: string | undefined): number => (xml?.match(/<TipoDTE>/g) ?? []).length

describe('splitting the range', () => {
  test('it fits: one piece and one download', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 1 })))
    const result = await downloadMipymeBackup(harness.portal, RANGE)
    expect(result.total).toBe(10)
    expect(result.chunks).toEqual([{ ...RANGE, total: 10, xml: documentsXml(10) }])
    expect(downloads(harness)).toHaveLength(1)
  })

  test('it does not fit: no piece goes over 20 and every document arrives once', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 5 })))
    const result = await downloadMipymeBackup(harness.portal, RANGE)
    expect(result.chunks.length).toBeGreaterThan(1)
    expect(result.total).toBe(50)
    for (const chunk of result.chunks) expect(chunk.total).toBeLessThanOrEqual(20)
    expect(result.chunks.reduce((sum, chunk) => sum + tagCount(chunk.xml), 0)).toBe(50)
  })

  test('the pieces leave no gaps and no overlaps', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 5 })))
    const { chunks } = await downloadMipymeBackup(harness.portal, RANGE)
    const ascending = [...chunks].sort((a, b) => a.from.localeCompare(b.from))
    expect(ascending[0].from).toBe(RANGE.from)
    expect(ascending[ascending.length - 1].to).toBe(RANGE.to)
    ascending.slice(1).forEach((chunk, index) => {
      expect(Date.parse(chunk.from) - Date.parse(ascending[index].to)).toBe(86400000)
    })
  })

  test('nothing in the range: no download', async () => {
    const harness = await signedIn(backupRoutes(() => ({})))
    await expect(downloadMipymeBackup(harness.portal, RANGE)).resolves.toEqual({ total: 0, chunks: [] })
    expect(downloads(harness)).toHaveLength(0)
  })

  test('one empty half adds nothing', async () => {
    const inventory: Inventory = (day) => ({ '33': day >= '2026-09-06' ? 5 : 0 })
    const harness = await signedIn(backupRoutes(inventory))
    const { chunks, total } = await downloadMipymeBackup(harness.portal, RANGE)
    expect(total).toBe(25)
    expect(chunks.every((chunk) => chunk.from >= '2026-09-06')).toBe(true)
  })

  test('a day over 20 splits by type, in the order of the list', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '61': 10, '33': 15 })))
    const { chunks, total } = await downloadMipymeBackup(harness.portal, { from: '2026-09-05', to: '2026-09-05' })
    expect(total).toBe(25)
    expect(chunks.map(({ type, total: count }) => [type, count])).toEqual([
      [33, 15],
      [61, 10],
    ])
    expect(chunks[0]).toMatchObject({ from: '2026-09-05', to: '2026-09-05' })
    expect(downloads(harness).map((query) => query.get('TPO_DOC'))).toEqual(['33', '61'])
  })

  test('one type over 20 in a day cannot be divided, and nothing is downloaded', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 30 })))
    const error = await failure(downloadMipymeBackup(harness.portal, { from: '2026-09-05', to: '2026-09-05' }))
    expect(error).toMatchObject({
      code: 'SII_PORTAL_REJECTED',
      details: { rejection: 'backupDayOverLimit', day: '2026-09-05', type: 33, listed: 30 },
    })
    expect(downloads(harness)).toHaveLength(0)
  })

  test('that holds when the impossible day is the last one of a range that could start downloading', async () => {
    const inventory: Inventory = (day) => (day === '2026-09-03' ? { '33': 25 } : { '33': 1 })
    const harness = await signedIn(backupRoutes(inventory))
    const error = await failure(downloadMipymeBackup(harness.portal, { from: '2026-09-01', to: '2026-09-03' }))
    expect(error.details).toMatchObject({ rejection: 'backupDayOverLimit', day: '2026-09-03' })
    expect(downloads(harness)).toHaveLength(0)
  })

  test('types outside the list that leave the day short are declared, not lost', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 5, '43': 20 })))
    const error = await failure(downloadMipymeBackup(harness.portal, { from: '2026-09-05', to: '2026-09-05' }))
    expect(error).toMatchObject({
      code: 'SII_PORTAL_REJECTED',
      details: { rejection: 'backupDayUnknownTypes', day: '2026-09-05', listed: 25, covered: 5 },
    })
    expect(downloads(harness)).toHaveLength(0)
  })

  test('KNOWN DEFECT, kept on purpose: two days over 20 download only the first day, and the total counts both', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 6, '61': 6 })))
    const result = await downloadMipymeBackup(harness.portal, { from: '2026-09-05', to: '2026-09-06' })
    expect(result.total).toBe(24)
    expect(result.chunks.map(({ from, to, type, total }) => ({ from, to, type, total }))).toEqual([
      { from: '2026-09-05', to: '2026-09-05', type: 33, total: 12 },
      { from: '2026-09-05', to: '2026-09-05', type: 61, total: 12 },
    ])
    expect(downloads(harness).every((query) => query.get('FEC_HASTA') === '2026-09-05')).toBe(true)
    expect(result.chunks.reduce((sum, chunk) => sum + tagCount(chunk.xml), 0)).toBe(12)
  })

  test('KEPT ON PURPOSE: with a type of the caller, a day over 20 still splits across the types of the list', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '43': 25, '33': 10, '61': 15 })))
    const { chunks } = await downloadMipymeBackup(harness.portal, { from: '2026-09-05', to: '2026-09-05', type: 43 })
    expect(chunks.map((chunk) => chunk.type)).toEqual([33, 61])
  })

  test('a type of the caller filters listings and downloads', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 1, '61': 1 })))
    const { total, chunks } = await downloadMipymeBackup(harness.portal, { ...RANGE, type: 61 })
    expect(total).toBe(10)
    expect(chunks[0].type).toBeUndefined()
    expect(harness.posted('lista_documentos')[0].TPO_DOC).toBe('61')
    expect(downloads(harness)[0].get('TPO_DOC')).toBe('61')
  })
})

describe('what is sent', () => {
  test('the session is checked on maullin, and then every request goes to www1, even from a certification client', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 1 })))
    await downloadMipymeBackup(harness.portal, RANGE)
    expect(harness.portal.environment).toBe('certification')
    expect(harness.urls()[0]).toBe(`${MAULLIN}/ad_empresa1`)
    expect(
      harness
        .urls()
        .slice(1)
        .every((url) => url.startsWith(`${BASE}/`)),
    ).toBe(true)
  })

  test('a production client checks the session in the same place', async () => {
    const harness = await signedIn(
      backupRoutes(() => ({})),
      { environment: 'production' },
    )
    await downloadMipymeBackup(harness.portal, RANGE)
    expect(harness.urls()).toEqual([`${MAULLIN}/ad_empresa1`, LIST])
  })

  test('the listing fields, in the order of the form', async () => {
    const harness = await signedIn(backupRoutes(() => ({})))
    await downloadMipymeBackup(harness.portal, { ...RANGE, direction: 'received' })
    expect(Object.entries(harness.posted('lista_documentos')[0])).toEqual([
      ['recaptcha-response', ''],
      ['ORIGEN', 'RCP'],
      ['FEC_DESDE', RANGE.from],
      ['FEC_HASTA', RANGE.to],
      ['NUM_PAG', '1'],
      ['TPO_ARCHIVO', 'dte'],
      ['RUT_EMP', '76543210'],
      ['DV_EMP', '3'],
      ['RUT_RECP', ''],
      ['FOLIO', ''],
      ['FOLIOHASTA', ''],
      ['RZN_SOC', ''],
      ['TPO_DOC', ''],
      ['ESTADO', ''],
      ['ORDEN', ''],
    ])
    const [request] = lists(harness)
    expect(request.headers).toMatchObject({ origin: 'https://www1.sii.cl', referer: LIST })
  })

  test('the download query, in the order of the form, with the listing as the referer', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 1 })))
    await downloadMipymeBackup(harness.portal, RANGE)
    const request = harness.fake.requests.find((candidate) => candidate.url.startsWith(DOWNLOAD))!
    expect(request.url).toBe(
      `${DOWNLOAD}?RUT_EMP=76543210&DV_EMP=3&RUT_RECP=&FOLIO=&FOLIOHASTA=&RZN_SOC=&TPO_DOC=&ESTADO=&ORDEN=&ORIGEN=ENV&FEC_DESDE=${RANGE.from}&FEC_HASTA=${RANGE.to}&DOWNLOAD=XML`,
    )
    expect(request.headers.referer).toBe(LIST)
  })

  test('the cookie the old portal expects goes in the listing and the download, but not in the session check', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 1 })))
    await downloadMipymeBackup(harness.portal, RANGE)
    const cookies = harness.fake.requests.map((request) => request.headers.cookie)
    expect(cookies[0]).not.toContain('usa_firma_central')
    expect(cookies[1]).toContain('usa_firma_central=true')
    expect(cookies[2]).toContain('usa_firma_central=true')
  })

  test('the company of the call wins over the one of the client', async () => {
    const harness = await signedIn(backupRoutes(() => ({})))
    await downloadMipymeBackup(harness.portal, { ...RANGE, companyRut: RECEIVER_RUT })
    expect(harness.posted('lista_documentos')[0]).toMatchObject({ RUT_EMP: '12345678', DV_EMP: '5' })
  })

  test('with no session, the session check logs in, and the listing goes with that session', async () => {
    const check = `${MAULLIN}/ad_empresa1`
    const harness = portalWith([
      {
        url: check,
        reply: [
          {
            status: 302,
            headers: { Location: `https://zeus.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?${check}` },
          },
          { body: COMPANY_FORM },
        ],
      },
      { url: 'https://zeus.sii.cl/AUT2000/InicioAutenticacion/*', reply: { body: AUTH_PAGE } },
      {
        url: `${HERCULES}*`,
        method: 'POST',
        reply: { status: 302, headers: { Location: check, 'Set-Cookie': 'NETSCAPE_LIVEWIRE.rut=12345678; Path=/' } },
      },
      { url: LIST, method: 'POST', reply: { body: listing(0) } },
    ])
    await downloadMipymeBackup(harness.portal, RANGE)
    expect(harness.urls().filter((url) => url.startsWith(HERCULES))).toHaveLength(1)
    expect(lists(harness)[0].headers.cookie).toContain('NETSCAPE_LIVEWIRE.rut=12345678')
  })

  test('overrides reach the requests', async () => {
    const harness = await signedIn(backupRoutes(() => ({})))
    await downloadMipymeBackup(harness.portal, RANGE, { timeoutMs: 1234 })
    expect(lists(harness)[0].timeoutMs).toBe(1234)
  })

  test.each([
    ['from', { ...RANGE, from: '2026-13-01' }, 'INVALID_DATE'],
    ['to', { ...RANGE, to: '01-09-2026' }, 'INVALID_DATE'],
    ['direction', { ...RANGE, direction: 'sideways' }, 'INVALID_OPTION'],
    ['attempts', { ...RANGE, attempts: 0 }, 'INVALID_OPTION'],
  ])('a bad %s is refused before any request', async (field, input, code) => {
    const harness = await signedIn(backupRoutes(() => ({})))
    const error = await failure(downloadMipymeBackup(harness.portal, input as never))
    expect(error).toMatchObject({ code, details: { field } })
    expect(harness.fake.requests).toHaveLength(0)
  })

  test('no company at all is a missing field', async () => {
    const harness = await signedIn(
      backupRoutes(() => ({})),
      { companyRut: undefined },
    )
    const error = await failure(downloadMipymeBackup(harness.portal, RANGE))
    expect(error).toMatchObject({ code: 'MISSING_FIELD', details: { field: 'companyRut' } })
  })
})

describe('what the portal answers', () => {
  const answering = (list: FakeRoute['reply'], download: FakeRoute['reply'] = { body: documentsXml(1) }) => [
    SESSION,
    { url: LIST, method: 'POST' as const, reply: list },
    { url: `${DOWNLOAD}*`, method: 'GET' as const, reply: download },
  ]

  test('the total wins over the recaptcha and the commented-out alert of a valid page', async () => {
    const valid = listing(
      1,
      `<div class="g-recaptcha"></div><script>
      if (cant_reg > 20) { //alert("Maximo numero de documentos: 20.");
      }
    </script>`,
    )
    const harness = await signedIn(answering({ body: valid }))
    await expect(downloadMipymeBackup(harness.portal, RANGE)).resolves.toMatchObject({ total: 1 })
  })

  test.each([
    ['backupCaptcha', page('<div class="g-recaptcha"></div>')],
    ['backupNoData', REFUSAL('No existe información en MIPYME para el rut ingresado')],
    ['backupRefused', REFUSAL('Mensaje que nadie ha visto')],
    ['backupIndeterminate', REFUSAL('uno', 'dos', 'tres')],
    ['backupNoCompany', page('', 'Seleccionar empresa')],
  ])('%s in a listing is not repeated', async (rejection, body) => {
    const harness = await signedIn(answering({ body }))
    const error = await failure(downloadMipymeBackup(harness.portal, RANGE))
    expect(error).toMatchObject({ code: 'SII_PORTAL_REJECTED', details: { rejection } })
    expect(lists(harness)).toHaveLength(1)
    expect(harness.sleeps).toEqual([])
  })

  test('what the portal said travels with the refusal', async () => {
    const harness = await signedIn(answering({ body: REFUSAL('uno', 'dos') }))
    const several = await failure(downloadMipymeBackup(harness.portal, RANGE))
    expect(several.details.portalMessages).toEqual(['uno', 'dos'])
    const single = await signedIn(answering({ body: REFUSAL('Mensaje que nadie ha visto') }))
    const one = await failure(downloadMipymeBackup(single.portal, RANGE))
    expect(one.details.portalMessage).toBe('Mensaje que nadie ha visto')
  })

  test('a refusal in a download is not repeated either', async () => {
    const harness = await signedIn(answering({ body: listing(1) }, { body: page('recaptcha requerido') }))
    const error = await failure(downloadMipymeBackup(harness.portal, RANGE))
    expect(error.details).toMatchObject({ rejection: 'backupCaptcha' })
    expect(harness.sleeps).toEqual([])
  })

  test('an XML that says the words of the firewall is still a document, and it decodes as Latin-1', async () => {
    const xml = '<?xml version="1.0"?><RznSoc>ACCESO ANDINO Ñ</RznSoc><!-- acceso restringido -->'
    const harness = await signedIn(answering({ body: listing(1) }, { body: encodeLatin1(xml) }))
    const { chunks } = await downloadMipymeBackup(harness.portal, RANGE)
    expect(chunks[0].xml).toBe(xml)
  })

  test('a firewall page is never repeated', async () => {
    const harness = await signedIn(answering({ body: page('Transaccion Rechazada<br>ID: 980') }))
    const error = await failure(downloadMipymeBackup(harness.portal, RANGE))
    expect(error.code).toBe('SII_PORTAL_BLOCKED')
    expect(lists(harness)).toHaveLength(1)
  })
})

describe('retries', () => {
  const slow = new DteError('TRANSPORT_FAILED', {})
  const routes = (list: readonly FakeReply[], download: FakeRoute['reply'] = { body: documentsXml(1) }) => [
    SESSION,
    { url: LIST, method: 'POST' as const, reply: [...list] },
    { url: `${DOWNLOAD}*`, method: 'GET' as const, reply: download },
  ]

  test('a listing recovers from two failures, waiting 1 and 2 seconds', async () => {
    const harness = await signedIn(routes([slow, slow, { body: listing(1) }]))
    await expect(downloadMipymeBackup(harness.portal, RANGE)).resolves.toMatchObject({ total: 1 })
    expect(harness.sleeps).toEqual([1000, 2000])
  })

  test('a download has its own loop', async () => {
    const harness = await signedIn(routes([{ body: listing(1) }], [slow, { body: documentsXml(1) }]))
    await expect(downloadMipymeBackup(harness.portal, RANGE)).resolves.toMatchObject({ total: 1 })
    expect(harness.sleeps).toEqual([1000])
  })

  test('the retries of the client do not multiply with the loop', async () => {
    const harness = await signedIn(routes([slow, slow, { body: listing(0) }]), { retry: {} })
    await downloadMipymeBackup(harness.portal, RANGE)
    expect(lists(harness)).toHaveLength(3)
    expect(harness.sleeps).toEqual([1000, 2000])
  })

  test('nor do those the caller asks for: they reach only the login', async () => {
    const harness = await signedIn(routes([slow, { body: listing(0) }]))
    await downloadMipymeBackup(harness.portal, RANGE, { retry: { maxAttempts: 5 } })
    expect(lists(harness)).toHaveLength(2)
  })

  test('with attempts spent, the failure reaches the caller with how many there were', async () => {
    const harness = await signedIn(routes([slow, slow, { body: listing(0) }]))
    const error = await failure(downloadMipymeBackup(harness.portal, { ...RANGE, attempts: 2 }))
    expect(error).toMatchObject({ code: 'TRANSPORT_FAILED', details: { attempts: 2 } })
    expect(lists(harness)).toHaveLength(2)
  })

  test('attempts: 1 is one try', async () => {
    const harness = await signedIn(routes([slow, { body: listing(0) }]))
    await failure(downloadMipymeBackup(harness.portal, { ...RANGE, attempts: 1 }))
    expect(lists(harness)).toHaveLength(1)
    expect(harness.sleeps).toEqual([])
  })

  test('a page it cannot read is repeated, and then reported with what it said', async () => {
    const harness = await signedIn(routes([{ body: page('Hola') }, { body: page('Hola') }, { body: page('Hola') }]))
    const error = await failure(downloadMipymeBackup(harness.portal, RANGE))
    expect(error).toMatchObject({ code: 'SII_PORTAL_UNEXPECTED_PAGE', details: { step: 'list', attempts: 3 } })
    expect(harness.sleeps).toEqual([1000, 2000])
  })

  test('a download that is not a document is repeated in the same way', async () => {
    const harness = await signedIn(routes([{ body: listing(1) }], { body: page('Hola') }))
    const error = await failure(downloadMipymeBackup(harness.portal, RANGE))
    expect(error).toMatchObject({ code: 'SII_PORTAL_UNEXPECTED_PAGE', details: { step: 'download' } })
  })

  test('an HTTP 503 is repeated', async () => {
    const harness = await signedIn(routes([{ status: 503, body: 'caido' }, { body: listing(0) }]))
    await downloadMipymeBackup(harness.portal, RANGE)
    expect(harness.sleeps).toEqual([1000])
  })

  test('a TLS failure that is not transient is not', async () => {
    const harness = await signedIn(routes([new DteError('TRANSPORT_TLS', { reason: 'CERT_HAS_EXPIRED' })]))
    const error = await failure(downloadMipymeBackup(harness.portal, RANGE))
    expect(error.code).toBe('TRANSPORT_TLS')
    expect(harness.sleeps).toEqual([])
  })
})

describe('delivery', () => {
  test('newest first, without changing the order inside a day', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 5 })))
    const { chunks } = await downloadMipymeBackup(harness.portal, RANGE)
    const days = chunks.map((chunk) => chunk.from)
    expect(days).toEqual([...days].sort((a, b) => b.localeCompare(a)))
    expect(downloads(harness).map((query) => query.get('FEC_DESDE'))).toEqual(days)
  })

  test('onChunk receives each XML, awaited and in order, and the result keeps none', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 5 })))
    const received: { from: string; xml: string }[] = []
    const result = await downloadMipymeBackup(harness.portal, {
      ...RANGE,
      onChunk: async ({ from, xml }) => {
        await Promise.resolve()
        received.push({ from, xml })
      },
    })
    expect(result.total).toBe(50)
    expect(result.chunks.every((chunk) => chunk.xml === undefined)).toBe(true)
    expect(received.reduce((sum, chunk) => sum + tagCount(chunk.xml), 0)).toBe(50)
    expect(received.map((chunk) => chunk.from)).toEqual(result.chunks.map((chunk) => chunk.from))
  })

  test('onChunk gets no type, although the piece has one', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 15, '61': 10 })))
    const received: object[] = []
    const { chunks } = await downloadMipymeBackup(harness.portal, {
      from: '2026-09-05',
      to: '2026-09-05',
      onChunk: (chunk) => {
        received.push(chunk)
      },
    })
    expect(Object.keys(received[0]).sort()).toEqual(['from', 'to', 'total', 'xml'])
    expect(chunks[0].type).toBe(33)
  })

  test('an error of onChunk ends the run, with no retry', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 5 })))
    await expect(
      downloadMipymeBackup(harness.portal, {
        ...RANGE,
        onChunk: () => {
          throw new DteError('TRANSPORT_FAILED', {})
        },
      }),
    ).rejects.toMatchObject({ code: 'TRANSPORT_FAILED' })
    expect(downloads(harness)).toHaveLength(1)
    expect(harness.sleeps).toEqual([])
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/backup.test.ts --coverage=false
```

Expected: FAIL, because the code below does not exist yet.

- [ ] **Step 3: Write the implementation**

`src/portal/backup.ts`:

```ts
import { BACKUP_ORIGINS, cgiUrl, MIPYME_BACKUP_BASE_URL, type DocumentDirection } from '../catalogs/portal'
import { DteError } from '../errors'
import { assertPositive, type CallOverrides } from '../sii/client'
import { withRetry, type RetryPolicy } from '../sii/retry'
import { isIsoDate } from '../time/chile'
import { isRetryablePortalError, resolvePortalCompany, siiCodeOf, type PortalClient } from './client'
import { backupTotal, backupVerdict, isBackupXml } from './pages/backup'
import {
  companyFields,
  ensurePage,
  formEncode,
  portalRequest,
  rejected,
  unexpectedPage,
  withPortalSession,
  type PortalContext,
} from './session'

const LIST_URL = `${MIPYME_BACKUP_BASE_URL}/lista_documentos.cgi`
const DOWNLOAD_URL = `${MIPYME_BACKUP_BASE_URL}/download.cgi`
// The SII's cap per download: 20 documents answer XML, 21 answer an error page.
const MAX_DOCUMENTS = 20
const SPLIT_TYPES: readonly number[] = [33, 34, 46, 56, 61, 52, 110, 111, 112]
const DAY_MS = 86400000
const DEFAULT_ATTEMPTS = 3

/**
 * EN: What `downloadMipymeBackup` needs.
 * ES: Lo que necesita `downloadMipymeBackup`.
 */
export type MipymeBackupInput = {
  /** EN: First day, `YYYY-MM-DD`. ES: `FEC_DESDE` — Primer día, `AAAA-MM-DD`. */
  readonly from: string
  /** EN: Last day, `YYYY-MM-DD`. ES: `FEC_HASTA` — Último día, `AAAA-MM-DD`. */
  readonly to: string
  /** EN: Issued or received documents; issued by default. ES: `ORIGEN` — Documentos emitidos o recibidos; por defecto emitidos. */
  readonly direction?: DocumentDirection
  /** EN: Only this document type; all by default. ES: `TPO_DOC` — Solo este tipo de documento; por defecto todos. */
  readonly type?: number
  /** EN: Tries per listing and per download; 3 by default. ES: Intentos por listado y por descarga; por defecto 3. */
  readonly attempts?: number
  /** EN: Receives each piece as it arrives, so a long history does not stay in memory: then the result holds no `xml`. ES: Recibe cada tramo a medida que llega, para que un histórico largo no quede en memoria: entonces el resultado no trae `xml`. */
  readonly onChunk?: (chunk: MipymeDownloadedChunk) => Promise<void> | void
  /** EN: Company, when it is not the client's. ES: `RUT_EMP` + `DV_EMP` — Empresa, si no es la del cliente. */
  readonly companyRut?: string
}

/**
 * EN: One downloaded piece, as `onChunk` receives it.
 * ES: Un tramo descargado, tal como lo recibe `onChunk`.
 */
export type MipymeDownloadedChunk = {
  /** EN: First day. ES: `FEC_DESDE` — Primer día. */
  readonly from: string
  /** EN: Last day. ES: `FEC_HASTA` — Último día. */
  readonly to: string
  /** EN: Documents the listing counted. ES: Documentos que contó el listado. */
  readonly total: number
  /** EN: The XML of the piece. ES: El XML del tramo. */
  readonly xml: string
}

/**
 * EN: One piece of a backup.
 * ES: Un tramo de un respaldo.
 */
export type MipymeBackupChunk = {
  /** EN: First day. ES: `FEC_DESDE` — Primer día. */
  readonly from: string
  /** EN: Last day. ES: `FEC_HASTA` — Último día. */
  readonly to: string
  /** EN: Documents the listing counted. ES: Documentos que contó el listado. */
  readonly total: number
  /** EN: Document type, when a day had to be split by type. ES: `TPO_DOC` — Tipo de documento, si hubo que separar un día por tipo. */
  readonly type?: number
  /** EN: The XML of the piece; absent with `onChunk`. ES: El XML del tramo; ausente con `onChunk`. */
  readonly xml?: string
}

/**
 * EN: What a backup downloaded.
 * ES: Lo que descargó un respaldo.
 */
export type MipymeBackup = {
  /** EN: Sum of the pieces' totals. ES: Suma de los totales de los tramos. */
  readonly total: number
  /** EN: The pieces, newest first. ES: Los tramos, del más nuevo al más viejo. */
  readonly chunks: readonly MipymeBackupChunk[]
}

type Piece = Pick<MipymeBackupChunk, 'from' | 'to' | 'total' | 'type'>

type BackupRun = {
  /** One attempt per request: the loop of `repeated` is the only one. */
  readonly context: PortalContext
  readonly policy: RetryPolicy
  readonly origin: string
  readonly company: { readonly RUT_EMP: string; readonly DV_EMP: string }
  readonly type: number | undefined
}

const backupPolicy = (attempts: number): RetryPolicy => ({
  maxAttempts: attempts,
  initialDelayMs: 1000,
  maxDelayMs: 1000 * 2 ** attempts,
  backoffMultiplier: 2,
  jitterRatio: 0,
  retryOn: (error) => isRetryablePortalError(error) || error.code === 'SII_PORTAL_UNEXPECTED_PAGE',
})

const repeated = <T>(run: BackupRun, attempt: () => Promise<T>): Promise<T> => {
  const { portal, operation, overrides } = run.context
  return withRetry(run.policy, attempt, {
    sleep: portal.sleep,
    signal: overrides?.signal,
    onRetry: (error, attemptNumber, delayMs) =>
      portal.logger.warn('sii portal retrying', { operation, attempt: attemptNumber, delayMs, code: error.code }),
  })
}

const pageFailure = (context: PortalContext, step: string, html: string): DteError => {
  const verdict = backupVerdict(html)
  if (verdict === null) return unexpectedPage(context, step, html)
  const { rejection, ...details } = verdict
  return rejected(context, rejection, details)
}

const commonFields = (run: BackupRun, type: number | undefined): Readonly<Record<string, string>> => ({
  ...run.company,
  RUT_RECP: '',
  FOLIO: '',
  FOLIOHASTA: '',
  RZN_SOC: '',
  TPO_DOC: type === undefined ? '' : String(type),
  ESTADO: '',
  ORDEN: '',
})

const countDocuments = (run: BackupRun, from: string, to: string, type = run.type): Promise<number> =>
  repeated(run, async () => {
    const page = await portalRequest(run.context, 'list', 'POST', LIST_URL, {
      form: {
        'recaptcha-response': '',
        ORIGEN: run.origin,
        FEC_DESDE: from,
        FEC_HASTA: to,
        NUM_PAG: '1',
        TPO_ARCHIVO: 'dte',
        ...commonFields(run, type),
      },
      referer: LIST_URL,
    })
    const total = backupTotal(page.html)
    if (total === null) throw pageFailure(run.context, 'list', page.html)
    return total
  })

const downloadPiece = (run: BackupRun, piece: Piece): Promise<string> =>
  repeated(run, async () => {
    const query = formEncode({
      ...commonFields(run, piece.type ?? run.type),
      ORIGEN: run.origin,
      FEC_DESDE: piece.from,
      FEC_HASTA: piece.to,
      DOWNLOAD: 'XML',
    })
    const page = await portalRequest(run.context, 'download', 'GET', `${DOWNLOAD_URL}?${query}`, { referer: LIST_URL })
    if (!isBackupXml(page.html)) throw pageFailure(run.context, 'download', page.html)
    return page.html
  })

const midnight = (day: string): number => Date.parse(`${day}T00:00:00Z`)
const isoDay = (time: number): string => new Date(time).toISOString().slice(0, 10)

const planByType = async (run: BackupRun, from: string, to: string, listed: number): Promise<readonly Piece[]> => {
  const pieces: Piece[] = []
  for (const type of SPLIT_TYPES) {
    const total = await countDocuments(run, from, to, type)
    if (total > MAX_DOCUMENTS) throw rejected(run.context, 'backupDayOverLimit', { day: from, type, listed: total })
    if (total > 0) pieces.push({ from, to: from, total, type })
  }
  const covered = pieces.reduce((sum, piece) => sum + piece.total, 0)
  if (covered < listed) throw rejected(run.context, 'backupDayUnknownTypes', { day: from, listed, covered })
  return pieces
}

const planRange = async (run: BackupRun, from: string, to: string): Promise<readonly Piece[]> => {
  const listed = await countDocuments(run, from, to)
  if (listed === 0) return []
  if (listed <= MAX_DOCUMENTS) return [{ from, to, total: listed }]
  const middle = isoDay((midnight(from) + midnight(to)) / 2)
  if (middle === from || middle === to) return planByType(run, from, to, listed)
  return [...(await planRange(run, from, middle)), ...(await planRange(run, isoDay(midnight(middle) + DAY_MS), to))]
}

/**
 * EN: Downloads the XML of the issued or received documents of a date range from the MIPYME backup, splitting the range until
 * each piece fits the 20 documents the SII allows per download. It needs only the certificate, not being enrolled as an issuer.
 * This reads production whatever the client's environment, because the service exists only there: it reads real documents even
 * from a certification client, and a development environment that stores them needs its own gate.
 *
 * The whole plan comes first, so a day that cannot be downloaded throws before any download. Known defect: a two-day range
 * with more than 20 documents downloads only its first day, split by type, while `total` still counts both.
 *
 * A captcha or an indeterminate page means try later, never in a loop. No data is definitive.
 * ES: Descarga desde el respaldo MIPYME el XML de los documentos emitidos o recibidos de un rango de fechas, partiendo el rango
 * hasta que cada tramo quepa en los 20 documentos por descarga que permite el SII. Solo necesita el certificado, no estar
 * inscrito como emisor. Esto lee producción sea cual sea el ambiente del cliente, porque el servicio existe solo ahí: lee
 * documentos reales incluso desde un cliente de certificación, y un entorno de desarrollo que los guarde necesita su propia puerta.
 *
 * El plan completo va primero, así que un día que no se puede descargar lanza antes de cualquier descarga. Defecto conocido: un
 * rango de dos días con más de 20 documentos baja solo su primer día, separado por tipo, mientras `total` sigue contando ambos.
 *
 * Un captcha o una página indeterminada significan intentar más tarde, nunca en un loop. Sin datos es definitivo.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the range and how to receive it. ES: el rango y cómo recibirlo.
 * @param overrides EN: per-call overrides; `retry` reaches only the login. ES: ajustes de la llamada; `retry` solo alcanza al inicio de sesión.
 * @returns EN: the pieces, newest first, and their total. ES: los tramos, del más nuevo al más viejo, y su total.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED` with `backupCaptcha`, `backupIndeterminate`, `backupNoData`, `backupRefused`, `backupNoCompany`, `backupDayOverLimit` or `backupDayUnknownTypes`; `INVALID_DATE`, `INVALID_OPTION`, `MISSING_FIELD`, `INVALID_RUT`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const downloadMipymeBackup = (
  portal: PortalClient,
  input: MipymeBackupInput,
  overrides?: CallOverrides,
): Promise<MipymeBackup> =>
  withPortalSession(portal, 'downloadMipymeBackup', overrides, async (context) => {
    if (!isIsoDate(input.from)) throw new DteError('INVALID_DATE', { field: 'from' })
    if (!isIsoDate(input.to)) throw new DteError('INVALID_DATE', { field: 'to' })
    const origin = siiCodeOf(BACKUP_ORIGINS, input.direction ?? 'issued', 'direction')
    assertPositive(input.attempts, 'attempts')
    const company = companyFields(resolvePortalCompany(portal, input.companyRut))
    await ensurePage(context, 'session', cgiUrl('certification', 'ad_empresa1'))
    context.state.cookies = { ...context.state.cookies, usa_firma_central: 'true' }
    const run: BackupRun = {
      context: { ...context, overrides: { ...overrides, retry: false } },
      policy: backupPolicy(input.attempts ?? DEFAULT_ATTEMPTS),
      origin,
      company,
      type: input.type,
    }
    const pieces = await planRange(run, input.from, input.to)
    const chunks: MipymeBackupChunk[] = []
    for (const piece of [...pieces].sort((a, b) => b.from.localeCompare(a.from))) {
      const xml = await downloadPiece(run, piece)
      if (input.onChunk === undefined) chunks.push({ ...piece, xml })
      else {
        await input.onChunk({ from: piece.from, to: piece.to, total: piece.total, xml })
        chunks.push(piece)
      }
    }
    return { total: chunks.reduce((sum, chunk) => sum + chunk.total, 0), chunks }
  })
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/backup.test.ts --coverage=false
npx tsc --noEmit -p .
```

Expected: PASS, 49 tests. `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
npm run prettier
git add src/portal/backup.ts tests/portal/backup.test.ts
git commit -m "feat: MIPYME backup download"
```

The body says why: The XML of issued and received documents, split to fit what the SII allows per download.

---

## Task 9: Public API, live smoke, documentation and size

Spec 3.7 and 3.10. Adding an export is a deliberate API change, so `tests/public-api.test.ts` changes in the same commit. The live smoke gains reads only, never a write, and only runs with `SII_LIVE=1`. `.size-limit.json` goes to 50 kB by the rule of D36: the measured size, ESM 47.92 kB and CJS 48.11 kB, rounded up to the next 2 kB.

**Files:**
- Modify: `.size-limit.json`
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `docs/decisions/entry-points.md`
- Modify: `llms.txt`
- Modify: `src/index.ts`
- Modify: `tests/dist.smoke.test.ts`
- Modify: `tests/live/portal.live.test.ts`
- Modify: `tests/public-api.test.ts`
- Modify: `tests/types.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/dist.smoke.test.ts`, as a diff:

```diff
diff --git a/tests/dist.smoke.test.ts b/tests/dist.smoke.test.ts
index 87a98f9..01e8770 100644
--- a/tests/dist.smoke.test.ts
+++ b/tests/dist.smoke.test.ts
@@ -45,6 +45,9 @@ const EXPECTED_FUNCTIONS = [
   'requestCaf',
   'annulFolios',
   'createMemoryFolioRegistry',
+  'listPeriodDocuments',
+  'changePurchaseType',
+  'downloadMipymeBackup',
   'createFetchTransport',
   'createNodeHttpsTransport',
   'createMemoryTokenCache',
```

`tests/live/portal.live.test.ts`, as a diff:

```diff
diff --git a/tests/live/portal.live.test.ts b/tests/live/portal.live.test.ts
index 70770dd..577472e 100644
--- a/tests/live/portal.live.test.ts
+++ b/tests/live/portal.live.test.ts
@@ -4,13 +4,16 @@ import { isDteError } from '../../src/errors'
 import { createPortalClient } from '../../src/portal/client'
 import { fetchCompanyResolution, fetchTaxpayerData } from '../../src/portal/company'
 import { listFolioRanges } from '../../src/portal/annulment'
+import { downloadMipymeBackup } from '../../src/portal/backup'
+import { fetchRegisterSummary, listPeriodDocuments, listPurchaseTypes } from '../../src/portal/rcv'
 import { closePortalSession, openPortalSession } from '../../src/portal/session'
 import { listStampableTypes, queryFolioQuota } from '../../src/portal/stamping'
 
 /**
  * Live smoke against the SII portal. Never runs in CI: it needs a real certificate enabled as a login method at sii.cl.
  *   SII_LIVE=1 SII_CERT_PFX=/path/to/cert.pfx SII_CERT_PASSWORD=… SII_COMPANY_RUT=… npx jest tests/live/portal
- * It only reads: nothing here stamps or annuls, because those spend folios and quota. Nothing from here is committed.
+ * It only reads: nothing here stamps or annuls, because those spend folios and quota, and nothing changes the register.
+ * The MIPYME backup reads production even from this certification client. Nothing from here is committed.
  */
 const env = process.env
 const enabled =
@@ -56,6 +59,19 @@ guarded('live: portal', () => {
     await answered(listFolioRanges(portal!, { type: 33 }))
   }, 120000)
 
+  test('RCV, read only', async () => {
+    const period = new Date().toISOString().slice(0, 7)
+    await answered(listPeriodDocuments(portal!, { period }))
+    await answered(listPeriodDocuments(portal!, { period, direction: 'received' }))
+    await answered(fetchRegisterSummary(portal!, { period, operation: 'purchase' }))
+    await answered(listPurchaseTypes(portal!))
+  }, 120000)
+
+  test('MIPYME backup of one day, keeping nothing', async () => {
+    const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
+    await answered(downloadMipymeBackup(portal!, { from: day, to: day, onChunk: () => undefined }))
+  }, 120000)
+
   test('a closed session logs in again on demand', async () => {
     await closePortalSession(portal!)
     await expect(fetchTaxpayerData(portal!)).resolves.toBeDefined()
```

`tests/public-api.test.ts`, as a diff:

```diff
diff --git a/tests/public-api.test.ts b/tests/public-api.test.ts
index 046d29b..5fa4560 100644
--- a/tests/public-api.test.ts
+++ b/tests/public-api.test.ts
@@ -9,19 +9,27 @@ const RUNTIME_EXPORTS = [
   'PORTAL_REJECTIONS',
   'annulFolios',
   'cafFingerprint',
+  'changePurchaseType',
   'closePortalSession',
   'createDirectoryFolioRegistry',
   'createFolioRegistry',
   'createMemoryFolioRegistry',
   'createMemoryPortalLock',
   'createPortalClient',
+  'downloadMipymeBackup',
   'fetchCompanyResolution',
   'fetchIssuerProfile',
+  'fetchPurchaseDocument',
+  'fetchRegisterSummary',
   'fetchTaxpayerData',
   'isRetryablePortalError',
   'listFolioRanges',
+  'listPeriodDocuments',
+  'listPurchaseTypes',
   'listReobtainableRanges',
   'listStampableTypes',
+  'moveVatToCommonUse',
+  'moveVatToRecoverable',
   'openPortalSession',
   'portalRejectionMessage',
   'queryCertificationSets',
```

`tests/types.test.ts`, as a diff:

```diff
diff --git a/tests/types.test.ts b/tests/types.test.ts
index 28efd08..9eb3d51 100644
--- a/tests/types.test.ts
+++ b/tests/types.test.ts
@@ -188,6 +188,7 @@ test('public API types compile', () => {
 describe('portal client', () => {
   test('is immutable data', () => {
     expectTypeOf<PortalClient['companyRut']>().toEqualTypeOf<SiiRut | null>()
+    expectTypeOf<PortalClient['randomId']>().toEqualTypeOf<() => string>()
     // @ts-expect-error every field is readonly
     const write = (portal: PortalClient): void => void (portal.timeoutMs = 1)
     expect(typeof write).toBe('function')
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/public-api.test.ts tests/types.test.ts --coverage=false
```

Expected: FAIL: the exports are missing from the root, and `PortalClient['randomId']` is already there, so only the public API suite fails.

- [ ] **Step 3: Write the implementation**

`.size-limit.json`, as a diff:

```diff
diff --git a/.size-limit.json b/.size-limit.json
index ae0fcd8..2a173f2 100644
--- a/.size-limit.json
+++ b/.size-limit.json
@@ -2,11 +2,11 @@
   {
     "name": "ESM (min + brotli)",
     "path": "dist/esm/index.min.js",
-    "limit": "46 kB"
+    "limit": "50 kB"
   },
   {
     "name": "CJS (min + brotli)",
     "path": "dist/cjs/index.min.js",
-    "limit": "46 kB"
+    "limit": "50 kB"
   }
 ]
```

`CHANGELOG.md`, as a diff:

```diff
diff --git a/CHANGELOG.md b/CHANGELOG.md
index 0896021..5612548 100644
--- a/CHANGELOG.md
+++ b/CHANGELOG.md
@@ -68,6 +68,13 @@ and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0
   `annulFolios`, `listReobtainableRanges`, `reobtainCaf`) and composite flows (`requestCafExact`, `requestCafInBatches`,
   `reobtainFolios`), with `SII_PORTAL_*` error codes, `PORTAL_REJECTIONS` and redaction of session cookies. Measured
   against the real SII up to the login, the logout and the refusal pages; the pages of an enrolled company are not.
+- SII purchase and sales register (RCV) on the portal session: `listPeriodDocuments`, `fetchRegisterSummary`,
+  `listPurchaseTypes`, `fetchPurchaseDocument`, and the writes `changePurchaseType`, `moveVatToCommonUse` and
+  `moveVatToRecoverable`, one attempt each and confirmed only by the SII's `OK`. Response codes are not looked at, so a
+  month the SII refuses to show reads as an empty one. `PortalClientOptions.randomId` is new.
+- MIPYME backup: `downloadMipymeBackup` splits a date range to fit the 20 documents the SII allows per download and
+  downloads the XML, in the result or through `onChunk`. It reads production whatever the client's environment. Known
+  defect: a two-day range with more than 20 documents downloads only its first day, while `total` counts both.
 - Local folio registry: `createFolioRegistry`, `createMemoryFolioRegistry`, `createDirectoryFolioRegistry`, `cafFingerprint`.
 
 ### Removed
```

`README.md`, as a diff:

```diff
diff --git a/README.md b/README.md
index 38cc12e..a852fc9 100644
--- a/README.md
+++ b/README.md
@@ -231,6 +231,61 @@ and what to do; the composite flows return it as data, so the CAFs already obtai
 refusal pages were measured against the real SII, but the pages of an enrolled company (quota, CAF, folio ranges) have not
 been seen yet: see the phase 4 design.
 
+## Purchase and sales register and MIPYME backup
+
+These run on the same session as the rest of the portal.
+
+```typescript
+import {
+  listPeriodDocuments,
+  fetchRegisterSummary,
+  listPurchaseTypes,
+  changePurchaseType,
+  fetchPurchaseDocument,
+  moveVatToCommonUse,
+  downloadMipymeBackup,
+} from 'dte-sdk'
+
+const { summary, documents } = await listPeriodDocuments(portal, { period: '2026-10', direction: 'received' })
+const { rows, header } = await fetchRegisterSummary(portal, { period: '2026-10', operation: 'purchase' })
+
+const types = await listPurchaseTypes(portal)
+const key = { type: 33, folio: 1234, period: '2026-10', counterpartyRut: '12345678-5' }
+await changePurchaseType(portal, { ...key, purchaseType: '4' })
+const purchase = await fetchPurchaseDocument(portal, key)
+await moveVatToCommonUse(portal, { ...key, commonUseVat: 19000 })
+
+await downloadMipymeBackup(portal, {
+  from: '2026-10-01',
+  to: '2026-10-31',
+  direction: 'received',
+  onChunk: async ({ from, to, xml }) => saveBackup(`${from}_${to}.xml`, xml),
+})
+```
+
+| I need | Function | SII service |
+|---|---|---|
+| Each document of a period (folio, date, amounts), with no receipts and no XML | `listPeriodDocuments` | `consemitidosinternetui` |
+| Official totals per document type and accounting status, with receipts aggregated | `fetchRegisterSummary` | `consdcvinternetui` |
+| How a purchase is classified, and changing it | `fetchPurchaseDocument` and the writes | `complementoscvui` |
+| The full XML of a document | `downloadMipymeBackup` | MIPYME backup |
+
+- **A refused month reads as empty.** Response codes are not looked at, so `listPeriodDocuments` and
+  `fetchRegisterSummary` cannot tell a month the SII refuses to show from one with no movement. `raw` holds each row as the
+  SII sent it. The row names come from the SII's client code and have not been seen with real documents: an absent field is
+  `null`.
+- **A write changes the real register** on a production client. Each one is a single attempt and only the SII's `OK` confirms it.
+  Anything else throws `purchaseChangeNotConfirmed`, and the change may have applied, so read the document again before retrying.
+- **VAT amounts are final amounts,** the value of each bucket after the change and not a delta.
+- **The backup reads production from any client,** because the service exists only there. It reads real documents even from a
+  certification client, and a development environment that stores them needs its own gate. It needs only the certificate, not
+  being enrolled as an issuer.
+- **The backup downloads at most 20 documents at a time,** so it splits the range, and by document type within a day. The whole plan
+  comes first: a day that cannot be downloaded throws `backupDayOverLimit` or `backupDayUnknownTypes` before any download. Use
+  `onChunk` for long histories, so the XML does not stay in memory.
+- **Known defect:** a two-day range with more than 20 documents downloads only its first day, while `total` counts both.
+- **`backupNoData` is definitive.** `backupCaptcha` and `backupIndeterminate` mean try later, never in a loop.
+
 ## Errors
 
 ```typescript
```

`docs/decisions/entry-points.md`, as a diff:

```diff
diff --git a/docs/decisions/entry-points.md b/docs/decisions/entry-points.md
index bb7327b..08259ba 100644
--- a/docs/decisions/entry-points.md
+++ b/docs/decisions/entry-points.md
@@ -1,6 +1,6 @@
 # Entry points
 
-Status: decided on 2026-11-02, for phases 1 to 4. Tracks [issue #5](https://github.com/arrowsw/dte-sdk/issues/5).
+Status: decided on 2026-11-02, for phases 1 to 4 and 4b. Tracks [issue #5](https://github.com/arrowsw/dte-sdk/issues/5).
 
 **Decision: keep one root entry.** Phase 5 reopens this if the PDF dependencies justify a subpath.
 
@@ -14,6 +14,7 @@ Minified and brotli-compressed, whole bundle:
 | Phase 2 | 25.65 kB | 25.9 kB |
 | Phase 3 | 31.85 kB | 32.07 kB |
 | Phase 4 | 44.45 kB | 44.64 kB |
+| Phase 4b | 47.92 kB | 48.11 kB |
 
 ## Why not subpaths now
 
```

`llms.txt`, as a diff:

```diff
diff --git a/llms.txt b/llms.txt
index 09b7ed5..76f36a3 100644
--- a/llms.txt
+++ b/llms.txt
@@ -10,6 +10,8 @@ The SII books are `createPurchaseSalesBook` (IECV, `LibroCompraVenta`), `createG
 
 The SII portal is `createPortalClient({ environment, certificate, companyRut })` plus free functions, on Node ≥ 20 (client certificate over `https`; TLS 1.2, server verified). The certificate must be enabled as a login method at sii.cl, or the login throws `SII_PORTAL_CERT_NOT_ENABLED`. Session: `openPortalSession`, `closePortalSession`, or on demand; `sessionCache` and `lock` are ports for several replicas. Company data: `fetchCompanyResolution` (per environment), `fetchTaxpayerData`, `fetchIssuerProfile`, `queryCertificationSets`. Folios: `listStampableTypes`, `queryFolioQuota` (`MAX_AUTOR`, `FOLIOS_DISP`; stamps nothing), `requestCaf` (may grant less than asked; read `granted`), `listFolioRanges`, `annulFolios` (explicit scope required; `maxRanges` limits one call; irreversible; counts against the quota for six months), `listReobtainableRanges`, `reobtainCaf`. Composite flows return refusals as data: `requestCafExact`, `requestCafInBatches`, `reobtainFolios`. Refusals are `SII_PORTAL_REJECTED` with `details.rejection` and `portalRejectionMessage`. `createFolioRegistry`, `createMemoryFolioRegistry` and `createDirectoryFolioRegistry` track folios locally. The CAF XML holds a private key: treat it as a secret.
 
+The purchase and sales register runs on the portal session: `listPeriodDocuments`, `fetchRegisterSummary`, `listPurchaseTypes`, `fetchPurchaseDocument`. Response codes are not looked at, so a refused month reads as empty; rows have typed fields, `null` when absent, and `raw`. Writes on a production client change the real register: `changePurchaseType`, `moveVatToCommonUse`, `moveVatToRecoverable` are one attempt each, confirmed only by the SII's `OK`; on `purchaseChangeNotConfirmed` the change may have applied, so read the document again before retrying, and VAT amounts are final amounts, not a delta. `downloadMipymeBackup` reads the XML from production whatever the client's environment, in pieces of at most 20 documents, newest first, in the result or through `onChunk`. A day that cannot be downloaded throws before any download. Known defect: a two-day range over 20 documents downloads only its first day, while `total` counts both.
+
 - [README](https://github.com/arrowsw/dte-sdk/blob/canary/README.md): installation and quick start
 - [Package on npm](https://www.npmjs.com/package/dte-sdk)
 - [rut.ts](https://github.com/arrowsw/rut.ts): the RUT library dte-sdk depends on
```

`src/index.ts`, as a diff:

```diff
diff --git a/src/index.ts b/src/index.ts
index 629fd73..b91724d 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -74,7 +74,7 @@ export {
 export type { ClaimAction, ClaimActionCode } from './catalogs/claim-codes'
 
 export { PORTAL_REJECTIONS, portalRejectionMessage } from './catalogs/portal'
-export type { PortalRejection } from './catalogs/portal'
+export type { AccountingStatus, DocumentDirection, PortalRejection, RegisterOperation } from './catalogs/portal'
 
 export { toSiiRut, isSiiRut, splitSiiRut } from './model/rut'
 export type { SiiRut } from './model/rut'
@@ -387,6 +387,35 @@ export type {
   RequestCafExactResult,
   RequestCafInBatchesInput,
 } from './portal/flows'
+export {
+  changePurchaseType,
+  fetchPurchaseDocument,
+  fetchRegisterSummary,
+  listPeriodDocuments,
+  listPurchaseTypes,
+  moveVatToCommonUse,
+  moveVatToRecoverable,
+} from './portal/rcv'
+export type {
+  ChangePurchaseTypeInput,
+  ListPeriodDocumentsInput,
+  MoveVatInput,
+  PurchaseDocumentKey,
+  RegisterSummaryInput,
+} from './portal/rcv'
+export type {
+  PeriodDocument,
+  PeriodDocuments,
+  PeriodSummaryRow,
+  PurchaseDocument,
+  PurchaseType,
+  RcvObject,
+  RegisterHeader,
+  RegisterSummary,
+  RegisterSummaryRow,
+} from './portal/pages/rcv'
+export { downloadMipymeBackup } from './portal/backup'
+export type { MipymeBackup, MipymeBackupChunk, MipymeBackupInput, MipymeDownloadedChunk } from './portal/backup'
 
 export { cafFingerprint, createFolioRegistry, createMemoryFolioRegistry } from './folios/registry'
 export type { FolioLedgerStore, FolioRegistry } from './folios/registry'
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/public-api.test.ts tests/types.test.ts --coverage=false
npx tsc --noEmit -p .
```

Expected: PASS, 4 tests. `tsc` prints nothing.

- [ ] **Step 4b: Build and measure**

```bash
npm run build
npx jest --config jest.config.cjs tests/dist.smoke --coverage=false
npx size-limit
```

Expected: the smoke passes on both bundles, ESM about 47.92 kB and CJS about 48.11 kB against the 50 kB limit.

- [ ] **Step 5: Commit**

```bash
npm run prettier
git add .size-limit.json CHANGELOG.md README.md docs/decisions/entry-points.md llms.txt src/index.ts tests/dist.smoke.test.ts tests/live/portal.live.test.ts tests/public-api.test.ts tests/types.test.ts
git commit -m "feat: public API, live smoke, documentation and size for the RCV and the MIPYME backup"
```

The body says why: The new functions reach consumers only through the root entry (D36), with the warnings they need.

---

## Task 10: Final gates and the pull request

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

Expected: all pass, 1 830 tests with 18 skipped, 100 % on the four metrics, ESM about 47.92 kB and CJS about 48.11 kB against the 50 kB limit. If phase 5a landed first, it has already raised the limit: measure again and keep the rule of D36.

- [ ] **Step 2: Read the diff against `canary` once**

Nothing public may name a third-party implementation, and no RUT, certificate or local path may appear outside the allow-list. `npm run scan` covers the last part; the first is yours to check, with the names your brief gives you.

- [ ] **Step 3: Open the pull request against `canary`**

The body explains the RCV and the backup, lists the decisions of spec section 5, names the two behaviours kept on purpose (D55), and states plainly that nothing has met a real document. Squash-merge is how this repository integrates, and merging is Hans's call.

- [ ] **Step 4: Post the bundle sizes on [issue 5](https://github.com/arrowsw/dte-sdk/issues/5), linking `docs/decisions/entry-points.md`**

- [ ] **Step 5: Record what stays open**

Add to [issue 8](https://github.com/arrowsw/dte-sdk/issues/8) what this phase still needs before the first release that ships it: the read-only check with the first real document, comparing the rows, the listing and `download.cgi` with the fixtures, and [issue 14](https://github.com/arrowsw/dte-sdk/issues/14) answered. Section 6 of the spec has the list.
