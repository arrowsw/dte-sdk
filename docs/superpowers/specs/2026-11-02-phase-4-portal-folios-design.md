# dte-sdk — Phase 4 design (SII portal and folios)

Date: 2026-11-02 · Status: **written on Hans's instruction to advance without him; decisions in section 5 await his review** · Author: Claude (with Hans)

Starting point: the architecture and phase 1 spec, the phase 2 spec (`2026-11-01-phase-2-sii-web-services-design.md`)
and the phase 3 spec. Decisions D1–D27 and the glossaries are the contract. SII facts come from a read-only probe run
against the real portal on 2026-11-02 and from field behaviour known to work against the SII; section 6 says which is
which. No third-party implementation is named in the repository; the SII behaviour is described directly.

---

## 1. Goal and scope

Phase 4 logs in to the certificate-authenticated SII portal and automates what the portal offers for folios: requesting
a CAF, reading the stamping quota, listing and annulling unused ranges and downloading already authorized ranges again.
It also reads the company data the portal holds and adds a local folio registry.

**In scope**

1. **Session:** certificate login through `herculesr.sii.cl`, cookie session reused between calls, one caller at a time
   per certificate, session limit handling, logout.
2. **Company data:** the resolution per environment (`ad_empresa2`), taxpayer data (`ce_consulta_muestra_e`), and an
   issuer profile combining both.
3. **Certification state (read only):** the status of each test set and book (`pe_avance2`).
4. **Folios at the portal:** document types the portal offers for stamping, stamping quota (`MAX_AUTOR`, `FOLIOS_DISP`),
   CAF request (`of_*`), unused range listing and annulment (`af_*`), re-download of authorized ranges (`rf_*`), and the
   "exact quantity", "in batches" and "reobtain" flows.
5. **Local folio registry:** reserve, mark as sent, mark as annulled, release, remaining and statistics.
6. **Phase 2 changes:** a third capture channel, `send` usable by the portal client, and redaction of session cookies
   found in bodies.

**Out of scope, in a phase 4b with its own spec**

- RCV (`consemitidosinternetui`, `consdcvinternetui`, `complementoscvui`, including purchase reclassification).
- The MIPYME backup (`www1.sii.cl/cgi-bin/Portal001`).

They only need the session, write to the real tax registry or read real data whatever the environment, and share no
code with the folio flows.

**Out of scope, in phase 5**

- Enrolment and certification steps that change state: `pe_generar*`, `pe_confirma`, `pe_avance3` onwards, user
  enrolment, the certification runner.
- Choosing folios across stored CAFs, and storing CAFs at all. Phase 4 returns the CAF XML; where it lives is the
  caller's business.

**Done when:** every flow is covered by tests against the fake SII with synthetic pages and coverage stays at 100 %; a
loopback test proves the client certificate reaches a TLS server; bundle sizes are measured and posted to
[arrowsw/dte-sdk#5](https://github.com/arrowsw/dte-sdk/issues/5) with the decision note it asks for; `npm run scan`
passes. The live portal is **not** part of this definition, because the certificate at hand is not yet enabled for
login (section 6).

---

## 2. Architecture decisions

D1–D27 stay in force. Phase 4 adds D28–D38.

### D28. The portal client is data; the operations are free functions

- ✅ `createPortalClient(options)` validates and completes the configuration and returns a frozen `PortalClient` with no
  methods. Every operation is `operation(portal, input, overrides?)`, exactly as D11 does for the web services.
- It is a separate value from `SiiClient` because the two differ in what matters: `SiiClient` defaults to `fetch`, which
  cannot present a client certificate, and holds tokens; `PortalClient` defaults to the Node adapter with the
  certificate and holds a cookie session.
- It reuses the phase 2 ports without new types: `HttpTransport`, `HttpCapture`, `Logger`, `RetryPolicy`, `TokenCache`.
  Where the portal needs a folio check against the web services it takes a callback, so the two clients stay uncoupled.
- Discarded: portal fields on `SiiClient`, which would make `createSiiClient` create a certificate-bearing agent nobody
  asked for; a session value threaded through every call, which hands the caller a resource the SII rations.

### D29. TLS: verification on, TLS 1.2 cap by default, no legacy flags

Measured on 2026-11-02 (Node 24.22.1) with a real certificate against `herculesr.sii.cl`:

| Handshake | Result |
|---|---|
| Client certificate, free negotiation (3 of 3) | TLS 1.3, server verified |
| Client certificate, `maxVersion: TLSv1.2`, no legacy flags (3 of 3) | TLS 1.2, ECDHE-RSA-AES256-GCM-SHA384, server verified |
| No client certificate | TLS 1.3, server verified (the certificate is requested, not required, at TLS level) |
| Login `POST` with client certificate, free negotiation | HTTP 200 from the login CGI, which then applied its business rule |

- ✅ The default transport is `createNodeHttpsTransport({ tls: { clientCertificate: certificate, maxVersion: 'TLSv1.2' } })`.
  Server verification stays on and `legacyRenegotiation` stays off: the server verifies and supports RFC 5746, and the
  handshake above needs neither.
- The TLS 1.2 cap is the field-proven configuration of authenticated portal sessions (D21). TLS 1.3 reached the login
  CGI, but no authenticated session has been seen on it yet. A caller passes its own `transport` to change this.
- The fetch adapter cannot present a client certificate. Passing it is allowed (a proxy may terminate TLS) and fails
  as `TRANSPORT_TLS` or as a login failure otherwise. The portal is documented as Node ≥ 20; other runtimes need their
  own transport.
- A PKCS#12 without intermediates works as far as measured: the leaf-only certificate above reached the login CGI.
  `Certificate.chainPem` is sent as it is.

### D30. One session per certificate, one caller at a time

The SII rations authenticated sessions per RUT, and its load balancer cookies break when two requests of one session
overlap.

- ✅ The session is stored in a `TokenCache` (the phase 2 port, no new one) under `portal:{certificate fingerprint}`, with
  the cookies serialized as JSON in `token` and a sliding 90-minute expiry. A failing cache is logged and never fails
  the operation.
- ✅ A new, one-function port `PortalLock` serializes use per certificate; `createMemoryPortalLock()` is the default and
  a shared lock (Redis, a database) is the consumer's adapter. This is the only new port: nothing else in the SDK can
  say "wait for the other replica".
- Every public operation takes the lock once. Internally the flows pass a context value, so a composite flow never
  re-enters the lock and no `AsyncLocalStorage` is needed.
- The context holds the current cookies in a small mutable object for the length of one operation, the same local
  mutation style as `progress` in the transports. It never escapes the operation.

### D31. A flat cookie jar

- ✅ One `name → value` map per session, sent to every SII host, ignoring `Domain` and `Path`. This is what is proven to
  work across `zeusr`, `herculesr`, `maullin` and `palena`.
- `D30` removes the race that made a flat jar dangerous. A scoped jar is measured by the probe when the certificate is
  enabled and can replace this without changing the public API.
- `Set-Cookie` values are read from the joined header the transports deliver (spec 3.3 of phase 2), split on a comma
  followed by `name=` so `Expires=Thu, 01 Jan…` stays whole. The transport port does not change.

### D32. HTML parsing lives in pure page modules

- ✅ `src/portal/pages/*.ts` are pure functions from HTML to data, and nothing else in `src/portal/` looks at markup. When
  the SII changes a page, one module and its synthetic fixture change.
- A page the code cannot interpret never becomes a silent default. It throws `SII_PORTAL_UNEXPECTED_PAGE` with the
  operation, the step and `portalMessage`, the first 400 characters of visible text.
- Detection runs on visible text with `<script>` and `<style>` removed and entities decoded, because the SII writes
  `&aacute;`. The two exceptions are deliberate: `alert()` messages, which is how the old portal reports errors, and
  form fields.
- The markup assumed: HTML 4.01 without closing `</tr>`, attributes with or without quotes (`value = 1`), Latin-1 unless
  the `Content-Type` says UTF-8.
- Discarded for now: a public override of the parsers. Adding one later breaks nothing; removing one would.

### D33. One rejection error with a stable reason

- ✅ `SII_PORTAL_REJECTED` carries `details.rejection`, a `PortalRejection` value, plus `portalMessage`, `type` and the
  quota figures when known. `PORTAL_REJECTIONS` holds a Spanish message and remedy per value, because telling the operator
  what to do is most of the value of detecting these pages.
- Single-step operations throw. The composite flows (`requestCafExact`, `requestCafInBatches`, `reobtainFolios`) return
  the rejection as data, because they may already hold CAFs that would otherwise be lost: a CAF cannot travel in
  `details`, since those get logged and a CAF contains a private key.

### D34. Retries follow the portal's own curve, and recovery replaces the no-re-send rule

- ✅ `DEFAULT_PORTAL_RETRY_POLICY`: 4 attempts at 2, 4 and 8 s, no jitter, retrying `TRANSPORT_FAILED`, `REQUEST_TIMEOUT`,
  `SII_HTTP_ERROR` with 502, 503 or 504, and `TRANSPORT_TLS` only with `EPROTO` or `ERR_SSL_PACKET_LENGTH_TOO_LONG`.
- `EPROTO` is included because the SII produces it intermittently when opening a TLS connection with a client
  certificate (`rsa_pss … last octet invalid`), and the same certificate works on the next attempt. It is not a sign of
  a bad certificate. Certificate errors (`CERT_HAS_EXPIRED`, `UNABLE_TO_*`) are not retried.
- D18 does not apply here: the steps that change state at the SII have a safe answer when repeated. `of_genera_folio`
  answers "ya fue autorizado el rango…", which the flow recovers from, and `af_anular` answers "ya anulado".
- The session limit, a block and a rejection are never retried: repeating them makes them worse.

### D35. Annulment is always explicit

Annulment cannot be undone, and annulled folios count against the stamping quota for six months. One unscoped clean-up
in the field annulled 296 folios before anyone stopped it.

- ✅ `annulFolios` needs `range`, `withinDays` or `all: true`; none of them is `INVALID_OPTION { field: 'range' }`.
- ✅ `requestCafExact` annuls only with `allowAnnul: true`.
- These add one explicit word and block nothing, so they respect D21.

### D36. Root entry only

- ✅ Phase 4 stays on the root entry (D3, D12). Separate bundles per subpath would each carry their own `DteError`, so
  `instanceof` would fail between entries, and the portal shares `send`, `withRetry` and the redaction with the
  web services client. The root entry is tree-shakable (`sideEffects: false`) and already loads no `node:` module at
  import. Phase 5 reopens this if the PDF dependencies justify it.
- The size limit rises to the measured size rounded up to the next 2 kB, and the note issue #5 asks for goes in
  `docs/decisions/entry-points.md`.

### D37. The registry is a port over a pure ledger

- ✅ `FolioRegistry` is six async functions. A service with its own database implements them with its own transactions. `createFolioRegistry(store)` builds one from a `load`/`save` pair plus a queue in the
  process, and `createMemoryFolioRegistry` and `createDirectoryFolioRegistry` are the bundled adapters. The state
  transitions are pure functions over a JSON ledger.
- The directory adapter writes atomically (temp file and rename) but is for a single process; several replicas need
  their own store.

### D38. The memory of annulled ranges travels as data

The portal keeps listing annulled ranges as unused forever, and repeating an annulment costs requests that can only
fail (in one field run: 87 attempts, none annulled).

- ✅ `annulFolios` takes `knownAnnulled` and returns the updated list. The caller persists it if it cares. No new port.

---

## 3. Phase 4 — detailed design

### 3.1 `src/` layout

```
src/
  catalogs/portal.ts        hosts, CGI paths, PORTAL_REJECTIONS, portalRejectionMessage, PortalRejection
  portal/
    client.ts               PortalClient, PortalClientOptions, createPortalClient, DEFAULT_PORTAL_RETRY_POLICY,
                            isRetryablePortalError
    lock.ts                 PortalLock, createMemoryPortalLock
    cookies.ts              CookieJar, splitSetCookie, mergeSetCookie, cookieHeader, session cookie checks
    html.ts                 visibleText, decodeEntities, inputValues, formAction, formBlock, selectOptions, alerts
    session.ts              context, requests, redirects, login, ensurePage, submitForm, withPortalSession,
                            openPortalSession, closePortalSession, companyFields
    company.ts              fetchCompanyResolution, fetchTaxpayerData, fetchIssuerProfile
    certification.ts        queryCertificationSets
    stamping.ts             listStampableTypes, queryFolioQuota, requestCaf
    annulment.ts            listFolioRanges, annulFolios
    reobtain.ts             listReobtainableRanges, reobtainCaf
    flows.ts                requestCafExact, requestCafInBatches, reobtainFolios
    pages/
      auth.ts               login answers, session limit, block, representation screen
      company.ts            ad_empresa2 and ce_consulta_muestra_e tables, address splitting
      certification.ts      pe_avance2 rows
      stamping.ts           rejection detectors, type selector, quota fields, already authorized range
      annulment.ts          unused ranges, next page button, annulment answer
      reobtain.ts           range forms, annulled marker, download form
  folios/
    ledger.ts               pure transitions, FolioLedger
    registry.ts             FolioRegistry, createFolioRegistry, createMemoryFolioRegistry, cafFingerprint
    node-registry.ts        createDirectoryFolioRegistry (lazy node:fs/promises)
```

Phase 1–3 files that change:

| File | Change |
|---|---|
| `src/errors.ts` | new codes (section 3.10); `SAFE_DETAIL_KEYS` gains `rejection` and `step` |
| `src/sii/capture.ts` | `HttpChannel = TokenChannel \| 'portal'` for `HttpExchange.channel`; `redactText` also redacts `NETSCAPE_LIVEWIRE*=` and `CSESSIONID=` assignments |
| `src/sii/send.ts` | `SendClient` narrows the first parameter to `transport`, `capture`, `logger`, `now`; `channel` is `HttpChannel`; `responseEncoding` may be a function of the response |
| `src/sii/operation.ts` | `httpError` takes an `HttpChannel` |
| `src/sii/client.ts` | `defaultSleep` and `assertPositive` are exported from the module, not from the root |
| `src/index.ts` | re-exports section 3.11 |
| `tests/public-api.test.ts`, `tests/dist.smoke.test.ts`, `.github/workflows/ci.yml` | new exports; `createPortalClient` in the Deno and Bun smokes |
| `.size-limit.json`, `README.md`, `llms.txt`, `CHANGELOG.md` | size, documentation |

### 3.2 Client

```ts
type PortalClientOptions = {
  /** Target environment: selects maullin or palena for the CGI pages. */
  readonly environment: Environment
  /** Certificate presented at login; its holder is the portal user. */
  readonly certificate: Certificate
  /** Company RUT used by every operation unless overridden per call. */
  readonly companyRut?: string
  /** HTTP transport; Node https with the client certificate and a TLS 1.2 cap by default. */
  readonly transport?: HttpTransport
  /** Where the session lives; in memory by default. */
  readonly sessionCache?: TokenCache
  /** Session lifetime in the cache; 90 min, refreshed on each use. */
  readonly sessionTtlMs?: number
  /** Who may use the session now; a mutex in the process by default. */
  readonly lock?: PortalLock
  /** Retry policy overrides, or `false`. */
  readonly retry?: Partial<RetryPolicy> | false
  /** Timeout per request, ms; 30 000 by default. */
  readonly timeoutMs?: number
  /** Close earlier sessions when the SII reports the limit and offers it; true by default. */
  readonly closePreviousSessions?: boolean
  readonly logger?: Logger
  readonly capture?: HttpCapture
  readonly now?: () => Date
  readonly sleep?: SleepFn
}

type PortalLock = <T>(key: string, run: () => Promise<T>) => Promise<T>
```

`createPortalClient` validates `environment` (`INVALID_OPTION`), `companyRut` through `toSiiRut`, positive numbers for
`sessionTtlMs` and `timeoutMs`, and fills in the defaults. `DEFAULT_PORTAL_RETRY_POLICY` carries `retryOn:
isRetryablePortalError`, so a partial override keeps the rule. Operations take `companyRut` from the input, then from
the client; neither is `MISSING_FIELD { field: 'companyRut' }`. `overrides` is the phase 2 `CallOverrides`.

Timeout: one value per request. A connection the SII never completes waits for it and then retries. A separate connect
timeout would need a new transport option, which no measurement here justifies.

### 3.3 Session

`withPortalSession(portal, operation, overrides, run)` takes the lock, loads the cookies from the cache, runs, and in
`finally` saves them with a fresh expiry, or deletes the entry when the session was forgotten.

**Request.** Every request is one `send` inside `withRetry`, with the channel `'portal'`, the operation
`{operation}.{step}`, browser-like headers (`User-Agent`, `Accept`, `Accept-Language`, `sec-ch-*`, `Sec-Fetch-*`,
`Upgrade-Insecure-Requests`, plus `Origin` and `Cache-Control` on POST) and `Cookie` when the jar has entries. Forms are
`application/x-www-form-urlencoded` with `encodeURIComponent`. A response with 502, 503 or 504 throws `SII_HTTP_ERROR`
inside the retry loop. Every other status is a page. `Set-Cookie` goes into the jar on every response. The body decodes
as UTF-8 when the `Content-Type` declares it and as Latin-1 otherwise, because SII hosts serve Latin-1 without declaring
it.

**Redirects.** The transports never follow them, so `followRedirects` does, up to 8 hops, keeping the last `Location`.

**Login.** `POST https://herculesr.sii.cl/cgi_AUT2000/CAutInicio.cgi?{referencia}` with the body `referencia={encoded}`,
then redirects. `openPortalSession` first does `GET https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoCertificado.html?{TARGET}`
for the load balancer cookies, with `TARGET = https://misiir.sii.cl/cgi_misii/siihome.cgi`. The page then decides:

| Page | Outcome |
|---|---|
| Session limit: "máximo de sesiones", "superado el m", code `01.01.215.500.709` | close earlier sessions if offered and allowed, retry once; otherwise `SII_PORTAL_SESSION_LIMIT`. Never retried beyond that |
| Certificate not enabled: `alert()` with "Cambiar clave" or code `01.01.215.500.473` (measured, also with `history.go(-2)`) | `SII_PORTAL_CERT_NOT_ENABLED` |
| No cookie named `NETSCAPE_LIVEWIRE*` in the jar | `SII_PORTAL_LOGIN_FAILED` |

**`ensurePage(context, step, url)`** is how every flow reaches a CGI page, because the SII binds a session to a `GET` of
the form before accepting a `POST`: 

1. `GET` the page and follow redirects. An expired session redirects to `zeus.sii.cl/…/IngresoRutClave.html?{target}` and
   then to `zeusr.sii.cl` (measured).
2. Session limit page: as in the table above.
3. A page containing "ESCOJA COMO DESEA INGRESAR" (a certificate that represents other RUTs) is not a failure: follow its
   "Continuar" link.
4. Otherwise, a page asking to authenticate after a redirect: log in with the `referencia` taken from the last
   `Location` query, once per operation. A second request for login within one operation is
   `SII_PORTAL_SESSION_EXPIRED`.
5. A body mentioning `/cvc_cgi/dte/af_anular1`: `GET` the target once more, which is how that page settles after a
   login.

Any page may also be a block: HTTP 403, "acceso restringido", reCAPTCHA or "Transaccion Rechazada" (measured, with a
support ID in the page) throw `SII_PORTAL_BLOCKED` at once.

**`submitForm(context, step, action, fields, referer)`** posts to an action resolved against the page host, follows
redirects and checks for a block.

**`openPortalSession(portal)`** reuses a cached session when `GET` of `ad_empresa1` on maullin shows the form, and
otherwise logs in. It returns `PortalSessionInfo { userRut, reused }`, reading the user from the `NETSCAPE_LIVEWIRE.rut`
and `.dv` cookies. The other operations do not call it: they log in on demand through `ensurePage`, which costs nothing
when the session is alive.

**`closePortalSession(portal)`** tries each of `PORTAL_LOGOUT_URLS` best-effort, in order, and always removes the cached
session. Which URL really ends a session is not confirmed yet (section 6). It never throws for a transport failure,
because the entry is gone either way and the SII expires the session on its own.

### 3.4 Company data

```ts
type CompanyResolution = {
  readonly rut: string | null                    // `Rut`
  readonly businessName: string | null           // `Razón Social`
  readonly resolutionDate: string | null         // `Fecha Resolución`, normalized to YYYY-MM-DD
  readonly resolutionNumber: number | null       // `Resolución`
  readonly authorizationDate: string | null      // `Fecha Autorización`, as sent
}
type TaxpayerData = {
  readonly rut: string | null                    // DATOS DEL CONTRIBUYENTE RUT
  readonly businessName: string | null           // NOMBRE O RAZÓN SOCIAL
  readonly businessActivity: string | null       // description of the first activity
  readonly activityCode: number | null           // code of the first activity
  readonly address: string | null                // the street part of the address
  readonly neighborhood: string | null           // `Villa/Pob.`
  readonly city: string | null                   // `Ciudad`
  readonly commune: string | null                // `Comuna`
  readonly portalAddress: string | null          // DIRECCIÓN DE LA EMPRESA, verbatim
  readonly regionalOffice: string | null         // DIRECCIÓN REGIONAL DEL CONTRIBUYENTE
  readonly activities: readonly TaxpayerActivity[]   // { code, description, vatAffected }
  readonly branches: readonly TaxpayerBranch[]       // { code, kind, address }
  readonly description: string | null            // GLOSA DESCRIPTIVA
}
type IssuerProfile = {                           // ready to fill an `Issuer` and an envelope cover
  readonly rut: SiiRut
  readonly businessName: string
  readonly businessActivity: string
  readonly activityCode: number | null
  readonly address: string
  readonly commune: string
  readonly city: string
  readonly resolutionDate: string
  readonly resolutionNumber: number
}

fetchCompanyResolution(portal, { companyRut?, environment? }, overrides?): Promise<CompanyResolution>
fetchTaxpayerData(portal, { companyRut? }, overrides?): Promise<TaxpayerData>
fetchIssuerProfile(portal, { companyRut?, environment? }, overrides?): Promise<IssuerProfile>
```

- **The resolution is per environment:** certification and production answer different dates and numbers for one RUT,
  and using the certification ones in production gets the envelope rejected with "Error en Carátula". `environment`
  defaults to the client's. The flow is `ensurePage(ad_empresa1)` then `POST ad_empresa2` with `RUT_EMP`, `DV_EMP`,
  `ACEPTAR=Ingresar`. The SII says the company is not authorized in two wordings ("la empresa no está autorizada", "el
  Contribuyente no está autorizado"): both are `companyNotAuthorized`. A page with neither a date nor a number is
  `SII_PORTAL_UNEXPECTED_PAGE`.
- **Taxpayer data only lives on maullin:** `POST ce_consulta_muestra_e` with `ACEPTAR=CONSULTAR` goes there whatever the
  environment. `pe_construccion_dte` only returns the form.
- **The address cell mixes labels with data** (`CALLE 123, Villa/Pob. X, Ciudad Y, Comuna Z`). The labels come off from
  the end, in any order, so `address` fits the 70 characters of `DirOrigen`; `portalAddress` keeps the original.
- Branches are read only between the `DIRECCIÓN SUCURSALES` title and `ACTIVIDADES ECON`, because activity codes are
  three-cell rows too.
- `fetchIssuerProfile` runs both reads **in sequence**. Sharing a jar in parallel makes one reply overwrite the balancer
  cookie the other needs, and `ad_empresa2` then answers empty. If the first read fails with an unexpected page or an
  expired session (a cached session can pass a form `GET` and still get "Actualización de Datos del Contribuyente"), the
  session is forgotten and the reads repeat once with a fresh login. A failing taxpayer read is logged and does not fail
  the profile, as long as the resolution date arrived.

### 3.5 Certification state

```ts
type CertificationSet = { readonly name: string; readonly status: string }   // SET BASICO, REVISADO CONFORME…
type CertificationSets = {
  readonly sets: readonly CertificationSet[]
  readonly allSetsApproved: boolean     // SET BASICO, SET GUIA DE DESPACHO, SET FACTURA EXENTA, SET CASO GENERAL FACTURA COMPRA
  readonly allBooksApproved: boolean    // LIBRO DE VENTAS, LIBRO DE COMPRAS, LIBRO DE GUIAS
}
queryCertificationSets(portal, { companyRut? }, overrides?): Promise<CertificationSets>
```

`ensurePage(pe_avance1)` then `POST pe_avance2` on maullin with `ACEPTAR=Continuar`. Rows are read one by one, splitting on
`</tr>`, because a page-wide match assigned one row's state to the next. A row without a bold status reads the hidden
`ESTn` value (`S01` not declared, `S21` declared). `pe_avance3` onwards declare and belong to phase 5.

### 3.6 Stamping

```ts
type StampableType = { readonly type: number; readonly name: string }
type FolioQuota = {
  readonly unrestricted: boolean        // the SII is not rationing this type
  readonly blocked: boolean             // "NO SE AUTORIZA TIMBRAJE"
  readonly maxAuthorized: number | null // `MAX_AUTOR`
  readonly availableFolios: number | null // `FOLIOS_DISP`, stamped and unused
}
type ObtainedCaf = {
  readonly xml: string                  // as served; holds the private key `RSASK`
  readonly caf: Caf
  readonly granted: number
  readonly maxAuthorized: number | null
  readonly availableFolios: number | null
  readonly recovered: boolean           // came back through "ya fue autorizado" or the re-download flow
}

listStampableTypes(portal, { companyRut? }, overrides?): Promise<readonly StampableType[]>
queryFolioQuota(portal, { type, companyRut? }, overrides?): Promise<FolioQuota>
requestCaf(portal, { type, quantity, minQuantity?, companyRut? }, overrides?): Promise<ObtainedCaf>
```

The flow on the environment's host, where a hard rejection can arrive at **any** step, so the same detector runs on
every page:

1. `ensurePage(of_solicita_folios)`, the fresh `GET` the session is bound to. Then `POST` to its form action with its
   hidden fields plus `RUT_EMP`, `DV_EMP`, `COD_DOCTO`, `CANTIDAD`.
2. If the page's real form already points to `of_confirma_folio`, the SII preselected the type: go to step 4. The bare
   text `of_solicita_folios_dcto` may just be inside a `<script>`.
3. Otherwise `POST of_solicita_folios_dcto` with the hidden fields; then, if the page has `COD_DOCTO`, check that the
   selector offers the type (`typeNotEnabled` if not, including the single `-1 SIN DOCUMENTOS` option) and `POST` it again
   with `COD_DOCTO` and an **empty** `CANT_DOCTOS`: a number there makes the SII omit `MAX_AUTOR` and `CONTROL=S` and
   reject in silence later. No `<select>` to inspect does not block.
4. Read `MAX_AUTOR` and `FOLIOS_DISP`. `queryFolioQuota` stops here and nothing is stamped. These fields appear **only
   while the SII rations that type**: their absence means unrestricted, unless the page is the block page, which lacks
   them too. With `minQuantity` above `MAX_AUTOR`, stop with `quotaInsufficient` before stamping, because a short range
   goes unused, raises `FOLIOS_DISP` and worsens the next attempt.
5. `POST` to the form action with `CANT_DOCTOS = min(quantity, MAX_AUTOR)` and `ACEPTAR=Solicitar Numeración`.
6. If the answer mentions `of_confirma_folio`: `POST` with `FOLIO_INICIAL` (`1` when empty) and `ACEPTAR=Confirmar Folio
   Inicial`.
7. If it mentions `of_genera_folio`: `POST` with `CANT_DOCTOS` capped at `MAX_AUTOR`, `FOLIO_FIN = FOLIO_INI + cantidad −
   1` and `ACEPTAR=Obtener Folios`.
8. If it mentions `of_genera_archivo` and has no `<AUTORIZACION`: `POST` with `ACEPTAR=AQUI`. On `DTE-OFGA`, an internal
   SII error with the range already registered, repeat with the fields of the page before, at 3, 6 and 9 s. A further
   `of_genera_archivo` form is submitted once more.

Then the final page decides, in this order:

| Page | Outcome |
|---|---|
| HTTP 403, "acceso restringido", reCAPTCHA, "Transaccion Rechazada" | `SII_PORTAL_BLOCKED` |
| `minQuantity` above `MAX_AUTOR` (step 4) | `quotaInsufficient` |
| `<AUTORIZACION` | `ObtainedCaf` |
| "NO [SE] AUTORIZA TIMBRAJE" | `stampingBlocked`, with the SII's reason in `portalMessage` |
| "presentarse en la oficina del SII", or "no cumple con los requisitos" with "asistencia de un funcionario" | `inPersonRequired` |
| "(la) empresa no está autorizada para operar" | `companyNotAuthorized` |
| "no está autorizado para ingresar a esta opción" | `optionNotAuthorized` |
| "no tiene permiso en (la) empresa", "usuario no autorizado para (la) empresa", "no está autorizado para operar en la empresa" | `userWithoutPermission` |
| "situaciones pendientes con el SII" | `personWithPendingIssues` |
| "no registra Verificación de Actividades" | `activityVerificationPending` |
| "Autenticaci" | `SII_PORTAL_SESSION_EXPIRED`; the session is forgotten |
| "menor o igual al m…" (the effective maximum, lower than the form's when the day's quota is partly used) | with `minQuantity` above 1, `quotaInsufficient`; with `quantity` above 1, repeat once for 1 folio on the same session; otherwise `quotaExceeded` |
| "ya fue autorizado el rango desde N hasta M" | `POST of_genera_archivo` with `RUT_EMP`, `DV_EMP`, `COD_DOCTO`, `FOLIO_INI`, `FOLIO_FIN`, `FECHA` (today), `ACEPTAR=AQUI`: a CAF is `recovered`; otherwise `rangeAlreadyAuthorized` with the range in details |
| `autInicioDTE.cgi`, `cgi_AUT2000`, "302 Found" | `SII_PORTAL_SESSION_EXPIRED`; the session is forgotten |
| Anything else | `SII_PORTAL_UNEXPECTED_PAGE` |

A CAF request holds the lock for 1 001 ms after it finishes, so requests on one certificate stay spaced without any
state. `queryFolioQuota` treats `stampingBlocked` as `blocked: true` and rethrows every other rejection, so a rejected
page is never reported as "unrestricted". `listStampableTypes` is steps 1 and 3 without a type; a page with no selector
and no rejection is `SII_PORTAL_UNEXPECTED_PAGE`, because reading an error page as "no types" once kept an authorized
company waiting.

### 3.7 Annulment and re-download

```ts
type UnusedFolioRange = {
  readonly from: number; readonly to: number; readonly quantity: number
  readonly date: string | null          // YYYY-MM-DD when the range was stamped
}
type FolioRanges = { readonly ranges: readonly UnusedFolioRange[]; readonly lastFolio: number | null }
type AnnulmentRejectionReason = 'alreadyAnnulled' | 'received' | 'refused' | 'siiError' | 'transport' | 'unknown'
type AnnulmentResult = {
  readonly annulled: readonly FolioSpan[]              // { from, to, count }
  readonly rejected: readonly (FolioSpan & { readonly reason: AnnulmentRejectionReason })[]
  readonly totalAnnulled: number
  readonly totalRejected: number
  readonly knownAnnulled: readonly string[]            // persist it and pass it back (D38)
}

listFolioRanges(portal, { type, companyRut? }, overrides?): Promise<FolioRanges>
annulFolios(portal, {
  type, range?, withinDays?, all?, reason?, maxRanges?, exclude?, knownAnnulled?, companyRut?,
}, overrides?): Promise<AnnulmentResult>
```

**Listing.** `ensurePage(af_anular1)`, which must show "ANULACION DE FOLIOS", then `POST af_anular2` with `PAGINA=1`,
`COD_DOCTO`, `ACEPTAR=Consultar`, following the "Ver siguiente" button (`cambiapag(n)`) for up to 20 more pages. Ranges
come from each row's `<form>` hidden fields (`FOLIO_INI`, `FOLIO_FIN`, `CANT_DOCTOS`, `DIA`, `MES`, `ANO`), deduplicated,
because nested tables break a read by columns. Rows without forms fall back to columns.

**Annulling.** Up to 4 passes, each listing again, with 1.5 s between them. A range is skipped when it falls outside
`range` or `withinDays` (a range with no readable date is skipped: when unsure, do not annul), overlaps `exclude` (CAFs
the caller still holds) or is in `knownAnnulled`. At most `maxRanges` (50), the last ones of the listing. Then per range:

1. `POST af_anular3` with `DIA`, `MES`, `ANO`, `COD_DOCTO`, `FOLIO_INI`, `FOLIO_FIN`, `CANT_DOCTOS`. "ya ha sido
   efectuado", "ya fue anulado", "efectuado anteriormente" or "anulado anteriormente" is `alreadyAnnulled`, without going
   further.
2. `POST af_anular` with the returned fields plus `FOLIO_INI_A`, `FOLIO_FIN_A`, `MOTIVO`. "ha autorizado la anulaci" or
   "SOLICITUD ANULACION DE FOLIOS" is success.
3. On a conflict ("ya ha sido efectuado", "ya fue anulado", "efectuado anteriormente", "recepcionad"), fall back to one
   folio at a time with the same fields.

Two real refusals in a row abandon the pass. `alreadyAnnulled` and `received` are **not** refusals: they are expected
results mixed in among successes, and counting them stopped a clean-up with ranges still annullable. Definitive results
join `knownAnnulled`; transient ones (`transport`, `siiError`, `unknown`) do not, so they are tried again next time.
`reason` defaults to "Folios no utilizados".

**Re-download.** `listReobtainableRanges(portal, { type })`: `GET rf_reobtencion1_folios`, `POST rf_reobtencion2_folios`,
one `<form name="frmN">` per range. The list includes annulled ranges without marking them, so each range needs `POST
rf_reobtencion3_folios` to learn it ("ha sido anulado"): one request per range. That page already holds the final form, so
its fields travel in the result and are not requested again. It also lists ranges already issued, which the SII does not
mark at all.

`reobtainCaf(portal, { type, range })`: an annulled range is `rangeAnnulled`; `POST rf_genera_folio` with
`ACEPTAR=Solicitar Folios`, which issues the resolution and offers the download form (`reobtainFormMissing` or
`reobtainDownloadMissing` when a form is absent); `POST rf_genera_archivo` with `ACEPTAR=AQUI`, which returns the CAF
(`reobtainCafMissing` otherwise). It costs no quota. The result is an `ObtainedCaf` with `recovered: true`.

### 3.8 Composite flows

```ts
type FolioFlowResult = {
  readonly complete: boolean
  readonly cafs: readonly ObtainedCaf[]
  readonly granted: number
  readonly maxAuthorized: number | null
  readonly availableFolios: number | null
  readonly rejection: PortalRejection | null
  readonly portalMessage: string | null
}
requestCafExact(portal, { type, quantity, allowAnnul?, companyRut? }, overrides?): Promise<FolioFlowResult>
requestCafInBatches(portal, { type, quantity, maxBatches?, initialQuota?, companyRut? }, overrides?): Promise<FolioFlowResult>
reobtainFolios(portal, { type, quantity, isIssued?, isFolioFree?, maxChecksPerRange?, companyRut? }, overrides?): Promise<ReobtainResult>
```

- **`requestCafExact`** needs one CAF that covers everything. On `quotaInsufficient` or `stampingBlocked`, with
  `allowAnnul` and unless `FOLIOS_DISP` is exactly 0, it annuls up to 20 ranges and asks once more; nothing annulled is
  `noAnnullableFolios`. `FOLIOS_DISP` is the annullable set, so with 0 an attempt only wastes requests; with the type
  blocked the field is absent, and that case does need the attempt. A short grant comes back with `complete: false` and
  `foliosShort`.
- **`requestCafInBatches`** is for the opposite case: `FOLIOS_DISP` 0 and a small `MAX_AUTOR`, because the SII rations by
  history and there is nothing to annul or re-download. Each batch reads the quota and asks for `min(MAX_AUTOR, missing)`,
  or everything when unrestricted. It stops at `maxBatches` (4), or as soon as a batch adds nothing, because every
  pointless grant counts against the next one. A rejection with no folios at all returns its own value; otherwise the
  result is `quotaCapReached`.
- **`reobtainFolios`** covers a quantity from authorized ranges, oldest folio first, without spending quota, and is what
  lifts a block, since the SII asks for folios to be issued. `isIssued(range)` is the caller's record of ranges already
  sent; `isFolioFree(folio)` confirms a folio at the SII (typically `folioReceived` from phase 2) with at most
  `maxChecksPerRange` (30) checks, because a re-used folio is rejected with `DTE-3-101`. A range with some received folios
  is not discarded: its free folios are used, because discarding a 100-folio range for one issued folio left that taxpayer
  with no way out. An expired CAF does not count and the walk moves on. Whatever was downloaded comes back even when it
  falls short, so the caller asks only for the difference.

The order among them (stored CAF, re-download, request in batches, annul last) is the caller's choice and phase 5's job.

### 3.9 Folio registry

```ts
type FolioScope = {
  readonly companyRut: string
  readonly type: number
  readonly range: { readonly from: number; readonly to: number }
  readonly environment: Environment
  readonly cafFingerprint?: string
}
type FolioRegistry = {
  readonly reserve: (scope: FolioScope) => Promise<number>
  readonly markSent: (scope: FolioScope, folio: number, sent?: { trackId?: string; sentAt?: string; extra?: Readonly<Record<string, unknown>> }) => Promise<void>
  readonly markAnnulled: (scope: FolioScope, folios: readonly number[]) => Promise<void>
  readonly release: (scope: FolioScope, folios: readonly number[]) => Promise<void>
  readonly remaining: (scope: FolioScope) => Promise<number>
  readonly stats: (query: { companyRut: string; type: number; environment?: Environment }) => Promise<FolioStats>
}
```

- An entry is keyed by company, type, range, environment and fingerprint.
- `reserve` starts at the lowest reserved-but-unsent folio, or after the last reserved, and walks past used and blocked
  folios; past the end is `FOLIO_OUT_OF_RANGE`. Blocked folios are the annulled ones of **every** entry of that company,
  type and environment.
- `markSent` outside the range is `FOLIO_OUT_OF_RANGE`. `release` also forgets the sent record. `remaining` is the range
  size minus the folios used.
- `cafFingerprint(xml)` is the first 12 hex characters of the SHA-256 of the file.

### 3.10 Errors

New `DTE_ERROR_CODES`. Messages stay generic; values live in `details`.

| Code | When | `details` |
|---|---|---|
| `SII_PORTAL_LOGIN_FAILED` | login answered without a session cookie | `{ operation, portalMessage }` |
| `SII_PORTAL_CERT_NOT_ENABLED` | the certificate is not enabled as a login method (manual step at sii.cl) | `{ operation, portalMessage }` |
| `SII_PORTAL_SESSION_LIMIT` | the SII reports the session limit; do not retry, wait about 30 minutes or close them at sii.cl | `{ operation }` |
| `SII_PORTAL_SESSION_EXPIRED` | the portal keeps asking to authenticate | `{ operation, step }` |
| `SII_PORTAL_BLOCKED` | firewall or captcha: HTTP 403, "acceso restringido", reCAPTCHA, "Transaccion Rechazada" | `{ operation, step, httpStatus, portalMessage }` |
| `SII_PORTAL_REJECTED` | the SII refused a business request | `{ rejection, operation, type?, portalMessage?, maxAuthorized?, availableFolios?, range? }` |
| `SII_PORTAL_UNEXPECTED_PAGE` | a page the code cannot interpret | `{ operation, step, portalMessage, body (capped, redacted) }` |

`isRetryablePortalError` is the rule of D34. `PortalRejection`: `stampingBlocked`, `inPersonRequired`,
`companyNotAuthorized`, `optionNotAuthorized`, `userWithoutPermission`, `personWithPendingIssues`,
`activityVerificationPending`, `typeNotEnabled`, `quotaInsufficient`, `quotaExceeded`, `quotaCapReached`, `foliosShort`,
`noAnnullableFolios`, `rangeAlreadyAuthorized`, `rangeAnnulled`, `reobtainFormMissing`, `reobtainDownloadMissing`,
`reobtainCafMissing`.

Secrets: cookies never reach a message, a detail or a capture (`Cookie` and `Set-Cookie` were already redacted; this phase
adds `NETSCAPE_LIVEWIRE*=` and `CSESSIONID=` inside bodies and URLs). `RSASK` stays redacted in captures, although the XML
returned to the caller keeps it. `portalMessage` is visible page text capped at 400 characters: it may hold a RUT, so it
stays in `details`, never in `message`, like the rest of the SDK.

### 3.11 Public API additions

Runtime exports added to the root and to `RUNTIME_EXPORTS`:

- **Client:** `createPortalClient`, `createMemoryPortalLock`, `DEFAULT_PORTAL_RETRY_POLICY`, `isRetryablePortalError`.
- **Session:** `openPortalSession`, `closePortalSession`.
- **Company:** `fetchCompanyResolution`, `fetchTaxpayerData`, `fetchIssuerProfile`, `queryCertificationSets`.
- **Folios:** `listStampableTypes`, `queryFolioQuota`, `requestCaf`, `requestCafExact`, `requestCafInBatches`,
  `listFolioRanges`, `annulFolios`, `listReobtainableRanges`, `reobtainCaf`, `reobtainFolios`.
- **Catalog:** `PORTAL_REJECTIONS`, `portalRejectionMessage`.
- **Registry:** `createFolioRegistry`, `createMemoryFolioRegistry`, `createDirectoryFolioRegistry`, `cafFingerprint`.

Types:

- **Client:** `PortalClient`, `PortalClientOptions`, `PortalLock`, `PortalSessionInfo`.
- **Company:** `CompanyResolution`, `TaxpayerData`, `TaxpayerActivity`, `TaxpayerBranch`, `IssuerProfile`,
  `CertificationSet`, `CertificationSets`.
- **Folios:** `StampableType`, `QuotaFields`, `FolioQuota`, `CafRequestInput`, `ObtainedCaf`, `UnusedFolioRange`, `FolioRanges`,
  `FolioSpan`, `AnnulFoliosInput`, `AnnulmentRejectionReason`, `AnnulmentResult`, `ReobtainableRange`, `RequestCafExactInput`,
  `RequestCafInBatchesInput`, `ReobtainFoliosInput`, `FolioFlowResult`, `ReobtainResult`, `PortalRejection`.
- **Registry:** `FolioScope`, `FolioRegistry`, `FolioEntry`, `FolioLedger`, `FolioLedgerStore`, `FolioSentRecord`, `FolioStats`,
  `DirectoryFolioRegistryOptions`.
- **Phase 2 widening:** `HttpChannel`.

### 3.12 Typical flows

```ts
const portal = createPortalClient({ environment: 'certification', certificate, companyRut: '76543210-3' })

// What the issuer needs for its documents and envelope covers
const issuer = await fetchIssuerProfile(portal)

// Is this type being rationed?
const quota = await queryFolioQuota(portal, { type: 33 })

// Request folios: the XML holds the CAF private key, store it as a secret
const { xml, caf } = await requestCaf(portal, { type: 33, quantity: 50 })

// A lost CAF costs no quota to get back
const ranges = await listReobtainableRanges(portal, { type: 33 })
const again = await reobtainCaf(portal, { type: 33, range: ranges.find((range) => !range.annulled)! })

// Annulment is explicit, and the memory of annulled ranges is the caller's
const result = await annulFolios(portal, { type: 33, range: { from: 50, to: 60 }, knownAnnulled })

// Done for now: give the session slot back
await closePortalSession(portal)
```

### 3.13 Tests

- **Page modules:** synthetic pages written by hand in `tests/support/portal-pages.ts` with the markup quirks of D32 and
  invented data: rows without `</tr>`, unquoted attributes, `&aacute;`, Latin-1 bytes, both wordings of each rejection, a
  page with a rejection and `COD_DOCTO` inside its JavaScript, an `alert()` commented out.
- **Flows:** the fake SII with queues per URL, asserting the order, the fields and the absence of forbidden requests
  (no `of_confirma_folio` in a quota read, no `CANT_DOCTOS` number in the selector post). `sleep` is injected.
- **Session:** login outcomes, on-demand login, one login per operation, session limit with and without the offer to close,
  lock serialization of two concurrent calls, the cache round trip, a failing cache, expiry and logout.
- **Transport:** a loopback `https` server with `requestCert: true` confirms the fixture certificate arrives through
  `tls.clientCertificate`.
- **Redaction:** no cookie value survives in a captured exchange, and no `RSASK` of a CAF.
- **Live smoke:** `tests/live/portal.live.test.ts` only runs with `SII_LIVE=1` and only reads. Mutating calls have no
  live test: they spend folios or quota.

The code of the plan was built and run before the plan was written: 1 626 tests pass with coverage at 100 % on the four
metrics, and the bundle measures ESM 44.14 kB and CJS 44.32 kB, so `.size-limit.json` goes to 46 kB.

---

## 4. Glossary additions (public contract)

**Login and session**
sesión del portal `PortalClient` + `openPortalSession` · `NETSCAPE_LIVEWIRE.rut`/`.dv` `userRut` · referencia
`referencia` (internal) · cerrar sesión `closePortalSession`.

**`ad_empresa2` → `CompanyResolution`**
Rut `rut` · Razón Social `businessName` · Fecha Resolución `resolutionDate` · Resolución `resolutionNumber` · Fecha
Autorización `authorizationDate`.

**`ce_consulta_muestra_e` → `TaxpayerData`**
DATOS DEL CONTRIBUYENTE RUT `rut` · NOMBRE O RAZÓN SOCIAL `businessName` · DIRECCIÓN DE LA EMPRESA `portalAddress`, split into
`address`, `neighborhood` (Villa/Pob.), `city` (Ciudad), `commune` (Comuna) · DIRECCIÓN REGIONAL DEL CONTRIBUYENTE
`regionalOffice` · ACTIVIDADES ECONÓMICAS `activities[] { code, description, vatAffected }` · DIRECCIÓN SUCURSALES
`branches[] { code, kind, address }` · GLOSA DESCRIPTIVA `description`.

**Timbraje → `ObtainedCaf`, `FolioQuota`**
COD_DOCTO `type` · CANTIDAD / CANT_DOCTOS `quantity` · MAX_AUTOR `maxAuthorized` · FOLIOS_DISP `availableFolios` · bloqueo de
timbraje `blocked` / `stampingBlocked` · sin tope `unrestricted`.

**Anulación → `AnnulmentResult`**
FOLIO_INI, FOLIO_FIN `from`, `to` · CANT_DOCTOS `quantity` · DIA, MES, ANO `date` · MOTIVO `reason` · ya anulado
`alreadyAnnulled` · recepcionado `received`.

**Reobtención → `ReobtainableRange`**
rango anulado `annulled` · campos del formulario `formFields`, `downloadFields`.

---

## 5. Decisions to review with Hans

Taken on 2026-11-02 under his instruction to advance on his own judgement while he is away ("avanza tu lo que mas puedas",
"quiero que funcione"). The first two are his; the rest are recommendations he has not seen yet.

| # | Decision | Taken by | What changes if overruled |
|---|---|---|---|
| 1 | Scope: portal base + folios + registry now; RCV and MIPYME in a phase 4b | Hans | Phase 4b merges in |
| 2 | Port field behaviour almost one to one; only the form changes (functional, no classes, English, bilingual JSDoc) | Hans | — |
| 3 | TLS: verification on, 1.2 cap, no legacy flags (D29) | Claude | One line in `client.ts` |
| 4 | Separate `PortalClient` (D28) | Claude | Public API |
| 5 | `TokenCache` for the session plus a `PortalLock` port (D30) | Claude | Two options |
| 6 | Flat cookie jar until a scoped one is measured (D31) | Claude | `cookies.ts` |
| 7 | No public parser override (D32) | Claude | One option, additive |
| 8 | Annulment needs an explicit scope; `allowAnnul` off by default (D35): **the one place the design asks for more than field behaviour does** | Claude | Two defaults |
| 9 | Composite flows return rejections as data; single steps throw (D33) | Claude | Three return types |
| 10 | Root entry only (D36) | Claude | Build, exports |

---

## 6. What is measured and what is not

**Measured against the real SII on 2026-11-02:**

- The TLS table of D29, and that `herculesr` serves the login CGI.
- The answer for a certificate not enabled: HTTP 200, `alert()` with code `01.01.215.500.473.33` and `history.go(-2)`.
- An expired session redirects to `zeus.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?{target}`, then to `zeusr`.
- `palena` answered "Transaccion Rechazada" with a support ID to a `GET` of a non-existent CGI, without a session.
- `autLogout.cgi` without a session: 404 with the certificate at `herculesr`, 404 at `www`, redirect to `Error404` at
  `maullin`. `autTermino.cgi` exists at `zeusr` (200).
- Cookies set by `zeusr`: one with `Domain=.zeusr.sii.cl`, one host-only.

**Not measured, because the certificate is not enabled for login yet:**

Nothing after the login has been seen by this project. Every page shape, field name and text of sections 3.4–3.8 comes
from behaviour known to work in the field, and the synthetic fixtures model that. To close this, Hans enables the
certificate at sii.cl (*Cambiar Clave y datos de autenticación*, section "¿Cómo se identificará…", option "Utilizando Clave
Tributaria o Certificado Digital", never "sólo Certificado Digital"), and then:

1. The private read-only probe runs again and its pages are compared with the fixtures.
2. It settles three open points: which logout URL ends a session (`PORTAL_LOGOUT_URLS` keeps the candidates until then),
   whether a scoped jar works (D31), and whether authenticated sessions work on TLS 1.3 (D29).
3. `tests/live/portal.live.test.ts` runs once and the outcome goes on the pull request or on issue 8.

This must happen **before the first release that ships phase 4**. Merging to `canary` publishes nothing.

| Point | Handling until measured |
|---|---|
| Real logout URL | Try all candidates, best-effort; the session expires by itself |
| `of_*`, `af_*`, `rf_*` markup | Field-known; `SII_PORTAL_UNEXPECTED_PAGE` says so if it differs, with the visible text |
| Rate of `EPROTO` with the Node adapter | Retried per D34 |
| Session limit value | Not assumed; the SII says when it is reached |
| Spacing across certificates | Per certificate only; the process-wide pacing a single static gave is not reproduced |
