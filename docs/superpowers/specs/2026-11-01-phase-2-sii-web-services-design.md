# dte-sdk — Phase 2 design (SII web services client)

Date: 2026-11-01 · Status: **draft for Hans's review** · Author: Claude (with Hans)

Starting point: the architecture and phase 1 spec
(`docs/superpowers/specs/2026-10-31-dte-sdk-architecture-and-phase-1-design.md`; decisions D1–D10, the phase table
and the glossary are the contract) and the SII protocol facts verified on 2026-11-01 against the live WSDLs, the
official PDFs and the receipts OpenAPI document (appendix A). No third-party implementation is named in the
repository; the SII behaviour is described directly.

---

## 1. Goal and scope

Phase 2 is the client of the SII web services: everything that takes the signed XML produced by phase 1 and talks
to maullin (certification) or palena (production), plus the receipts REST API and the acceptance/claim registry.

In scope (row 2 of the phase table, plus two extras decided with Hans on 2026-11-01):

1. **Transport port** with two adapters: native `fetch` (default) and Node `https` (lazy `node:https`, custom
   CA, opt-in legacy TLS flags, client certificate reserved for phase 4).
2. **Authentication**: seed and token for the DTEWS SOAP services and for the receipts REST API, signed seed,
   token cache port with a 55-minute TTL, automatic renewal when the SII reports the token as invalid.
3. **Uploads**: `EnvioDTE` through `DTEUpload` (ISO-8859-1 multipart), `EnvioBOLETA` through the receipts REST
   API or `DTEUpload` depending on the environment, books and the folio consumption report (RCOF) through
   `DTEUpload` (phase 2 takes the signed XML; the builders arrive in phase 3). Duplicate-upload recovery.
4. **Status**: envelope status (`QueryEstUp` and the REST envelope status), polling helper
   (`waitForUploadStatus`, extra), single-document status (`QueryEstDte` and the REST per-document status,
   extra), `folioReceived`.
5. **Acceptance/claim registry (WSRECLAMO)**: the four operations, the response-code catalog and a derived
   receiver status.
6. **Operations**: HTTP capture with redaction, upload archive, injectable logger, retry policy with backoff,
   per-call overrides (`signal`, `timeoutMs`, `retry`).

Out of scope: book and RCOF builders (phase 3), the certificate-authenticated portal and folio management
(phase 4), the certification runner and exchange e-mail (phase 5), `QueryEstDteAv` (noted as a possible
extension of `queryDocumentStatus`), browser support for the SII calls (the SII does not send CORS headers; the
client is documented as Node ≥ 20, Deno and Bun).

Done when: every operation is covered by tests against the fake SII (section 3.12) with the coverage threshold at
100 %; the opt-in live smoke (`SII_LIVE=1`) has been run once against maullin with a real certificate and its
outcome recorded in the pull request; the bundle size after phase 2 is measured and posted to
[arrowsw/dte-sdk#5](https://github.com/arrowsw/dte-sdk/issues/5).

---

## 2. Architecture decisions

The decisions of the phase 1 spec stay in force: functional style (D1), English domain with bilingual JSDoc (D2),
single root entry (D3), no new dependencies (D4), `async` only for the transport (D5), typed errors without PII
(D6), no global state (D7), Chile time with an injectable clock (D8), explicit ISO-8859-1 (D9), fixtures and
full coverage (D10). Phase 2 adds D11–D20.

### D11. The client is data; the operations are free functions (Hans, 2026-11-01)

- ✅ `createSiiClient(options)` validates and completes the configuration and returns a frozen `SiiClient`
  value with no methods and no hidden state. Every operation is a free function `operation(sii, input,
  overrides?)` exported from the root. Two companies, two environments or two transports coexist in one
  process as two values.
- Discarded: an object with methods (`sii.uploadEnvelope(...)`), because closures over a token or a cache are
  classes in disguise and clash with D1 and D7; a curried factory per operation, because per-call overrides
  become awkward and tree shaking gains nothing.
- The only state lives behind ports (`TokenCache`, `HttpCapture`, `UploadArchive`), which the consumer chooses,
  exactly as D1 prescribes.

### D12. Root entry with lazy `import()` for the Node adapters (Hans, 2026-11-01)

- ✅ `createNodeHttpsTransport`, `createDirectoryCapture` and `createDirectoryUploadArchive` are exported from
  the root, but the modules they need (`node:https`, `node:fs/promises`, `node:path`, `node:crypto`) are loaded
  with a dynamic `import()` the first time the adapter is used, never at module evaluation. The returned adapter
  keeps the pending module promise in its closure (adapters may hold state; the client may not).
- Build: `scripts/build.mjs` marks `node:*` as external; esbuild keeps `import()` in the ESM bundle and
  rewrites it to a deferred `require()` in the CJS bundle. The Deno and Bun smoke jobs keep passing because
  nothing evaluates a `node:` module on import.
- The subpath evaluation stays in issue #5; phase 2 adds the measured bundle sizes to it so the decision in
  phase 4 is made with numbers.

### D13. Bytes in, bytes out; decoding is the caller's business

- ✅ `HttpTransport = (request: HttpRequest) => Promise<HttpResponse>`; `body` on both sides is `Uint8Array`.
  Each SII channel decodes its own responses: DTEWS SOAP and the `DTEUpload` CGI reply in ISO-8859-1
  (`decodeLatin1`), the receipts REST API and WSRECLAMO in UTF-8 (`TextDecoder`). A transport that returned
  `string` would have to guess the charset, and `fetch().text()` guesses UTF-8.
- The transport never throws for an HTTP status: 4xx/5xx are returned and classified by the operation. It
  throws `DteError` only for network, TLS, timeout and abort failures (section 3.8).
- Discarded: wrapping `got`, `axios` or `undici` directly (D4: no transport dependency; the surface the SII needs
  is five headers and a byte body).

### D14. TLS verification on by default; legacy knobs opt-in

Measured on 2026-11-01 from a workstation (OpenSSL 4.1.0, Node 24.22.1) with `openssl s_client` and Node's
default `https.request`:

| Host | Protocol | Chain | Verifies with the default trust store | Secure renegotiation (RFC 5746) | Client certificate requested |
|---|---|---|---|---|---|
| maullin.sii.cl, palena.sii.cl, pangal.sii.cl, rahue.sii.cl | TLS 1.3 | DigiCert Global Root G2 → GeoTrust TLS RSA CA G1 → leaf | yes | not applicable | no |
| apicert.sii.cl, api.sii.cl, ws1.sii.cl, ws2.sii.cl | TLS 1.2 (1.3 refused with alert 70) | same | yes | supported | no |
| herculesr.sii.cl (portal login, phase 4) | TLS 1.3 | DigiCert, complete | yes | supported on 1.2 | **yes**, in the initial handshake |

- ✅ The Node adapter verifies the server certificate (`rejectUnauthorized: true`) and lets Node negotiate the
  protocol. No phase 2 endpoint needs a TLS 1.2 cap, legacy renegotiation or a client certificate; Node picks
  TLS 1.2 on the REST and WSRECLAMO hosts by itself.
- Escape hatches, all opt-in and documented as such: `tls.ca` (extra trusted CAs, the right fix for a
  container without a CA bundle or a corporate proxy), `tls.rejectUnauthorized: false`, `tls.minVersion` /
  `tls.maxVersion`, `tls.legacyRenegotiation: true` (sets `SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION |
  SSL_OP_LEGACY_SERVER_CONNECT`), `tls.clientCertificate` (phase 4 reuses the adapter for the portal, where the
  chain must be ordered leaf → intermediates → root, which `Certificate.chainPem` already is).
- A TLS failure surfaces as `DteError('TRANSPORT_TLS')` with the OpenSSL code in `details.reason`
  (`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `CERT_HAS_EXPIRED`, …) so the operator sees the real cause instead of
  silently downgrading. Background: the SII renews its server certificates periodically and clients with stale
  trust stores broke on each renewal, which is why "disable verification" switches are common in this
  ecosystem; the measurement above is the reason this SDK does not default to one.

### D15. One token per channel, cached behind a port

- ✅ Two authentication channels: `'soap'` (DTEWS seed/token; used by `DTEUpload`, `QueryEstUp`,
  `QueryEstDte` and WSRECLAMO) and `'rest'` (receipts API seed/token; used by the REST upload and the REST
  status queries). The DTEWS token is not valid on the REST API and vice versa.
- Cache key `${environment}:${channel}:${certificateFingerprint}` where the fingerprint is the SHA-1 of the
  leaf certificate DER (hex). It is not the RUT, so the key carries no PII and two certificates of the same
  holder do not collide. Default TTL 55 minutes (the REST token lives 1 hour and is renewed on use; the DTEWS
  lifetime is undocumented, so both use the shorter value). Seeds are never cached (2-minute validity).
- Renewal: when the SII reports the token as invalid (`DTEUpload` `STATUS` 5, `QueryEst*` `ESTADO` `-3`/`-13`
  or token error codes, REST HTTP 401, WSRECLAMO HTTP 401/403), the operation deletes the cached token, obtains
  a new one and repeats the call **once**. A second failure throws `SII_TOKEN_INVALID`.
- `createMemoryTokenCache()` is the bundled adapter. A shared store (Redis, file) is the consumer's adapter:
  three `async` functions.

### D16. The signed seed reuses the phase 1 signer, extended for whole-document references

- ✅ `signSeed(seed, certificate)` is pure and synchronous. `src/signature/xmldsig.ts` gains `signRootElement`
  (Reference `URI=""`, `enveloped-signature` transform, digest over the canonical root element) next to
  `signEnveloped`; `buildSignedInfo` learns to emit a verbatim `uri` and the transform. Same wrapping at 64
  columns, same expanded-for-signing / compact-for-storage rule.
- Byte-exact layout, which the REST token endpoint enforces: the XML declaration, one `\n`, then
  `<getToken><item><Semilla>…</Semilla></item><Signature …>…</Signature></getToken>` on one line, no trailing
  newline. The SOAP channel sends the same text XML-escaped inside `<pszXml>`.

### D17. Receipts channel by environment, overridable

- ✅ `EnvioBOLETA` goes to the receipts REST API in production and to `DTEUpload` in certification, because
  the certification REST endpoint has not reliably accepted test sets while `DTEUpload` has. `receiptsChannel:
  'rest' | 'soap'` on the client (or per call) overrides the default. `EnvioDTE`, books and RCOF always use
  `DTEUpload`.
- Bytes follow the XML declaration: phase 1 envelopes declare ISO-8859-1, so the file part is `encodeLatin1(xml)`
  on both channels; the multipart framing itself is ASCII.

### D18. Retry with backoff, never after an SII answer

- ✅ `RetryPolicy = { maxAttempts: 6, initialDelayMs: 2000, maxDelayMs: 15000, backoffMultiplier: 1.8,
  jitterRatio: 0.2 }` by default (values measured against maullin in the field; the SII drops connections and
  returns 5xx in bursts). Retryable: `TRANSPORT_FAILED`, `REQUEST_TIMEOUT`, `SII_HTTP_ERROR` with status 429,
  405 on the REST API (its rate limit; `X-Retry-After` is honoured, capped at `maxDelayMs`) or 5xx,
  `SII_RESPONSE_INVALID` (an HTML error page instead of XML/JSON) and `SII_QUERY_ERROR` (`-1` … `-14`).
- An upload is retried only while no SII response has arrived (connection refused, timeout before the first
  byte). Once the SII answered, whatever the `STATUS`, the envelope is not re-sent: re-sending produces the
  duplicate uploads that phase 2 then has to recover from.
- `sleep` is injected (`sleep(ms, signal)`), so tests advance a fake clock. `retry: false` disables retries on
  the client or per call.

### D19. Capture and archive are ports with redaction built in

- ✅ Every HTTP exchange (each attempt) is handed to the `capture` port as an `HttpExchange` already passed
  through `redactExchange`: cookies, `Set-Cookie`, `Authorization`, tokens and seeds inside bodies, `RSASK`
  and PEM private keys are replaced by `[redacted]`; bodies are capped at 512 KiB. RUTs and the XML stay, since
  that is what SII support needs to diagnose an upload. Capture failures are logged and never fail the
  operation.
- Every upload that got an SII answer is handed to the `archive` port as an `UploadRecord` (bytes sent,
  TrackID, response). Bundled adapters: memory (returns the list) and, for Node, a directory with a fixed
  layout (section 3.10).

### D20. No new dependencies in phase 2 (Hans allowed them; none is needed)

- ✅ Multipart bodies, SOAP envelopes and the redaction are a few dozen lines each; responses are parsed with
  `fast-xml-parser` (already a dependency) or `JSON.parse`. The door stays open: if a module grows past ~200
  lines of protocol plumbing, a library may replace it (Hans, 2026-11-01: "if you need external libraries, do
  not hold back").

---
## 3. Phase 2 — detailed design

### 3.1 `src/` layout

New files (every file < 300 lines; every module exports functions and types):

```
src/
  sii/
    client.ts              SiiClient, SiiClientOptions, CallOverrides, createSiiClient
    transport.ts           HttpRequest, HttpResponse, HttpTransport, createFetchTransport, request helpers
                           (timeout + signal merging)
    node-transport.ts      createNodeHttpsTransport (lazy node:https; TLS options; error mapping)
    soap.ts                buildSoapEnvelope, parseSoapResponse (DTEWS rpc/encoded and WSRECLAMO rpc/literal)
    multipart.ts           buildMultipartBody (ASCII framing + Latin-1 file part), boundary generation
    token-cache.ts         TokenCache, TokenChannel, createMemoryTokenCache, tokenCacheKey
    auth.ts                getSeed, signSeed, getToken, invalidateToken, withToken (renew-once wrapper)
    upload.ts              uploadEnvelope, uploadBook, uploadFolioConsumption, UploadReceipt, UploadKind,
                           parseReceptionResponse (DTEUpload) and parseRestUploadResponse
    status.ts              queryUploadStatus, waitForUploadStatus, UploadStatus, queryDocumentStatus,
                           DocumentStatus, folioReceived
    claims.ts              registerClaim, listClaimEvents, queryTransferable, queryReceptionDate,
                           receiverStatus and their types
    retry.ts               RetryPolicy, DEFAULT_RETRY_POLICY, isRetryableError, withRetry, backoffDelay
    capture.ts             HttpCapture, HttpExchange, redactExchange, createMemoryCapture
    node-capture.ts        createDirectoryCapture (lazy node:fs/promises)
    archive.ts             UploadArchive, UploadRecord, createMemoryUploadArchive
    node-archive.ts        createDirectoryUploadArchive (lazy node:fs/promises)
    logger.ts              Logger, silentLogger
    send.ts                one HTTP exchange: timeout, Content-Length, capture, logging
    operation.ts           helpers shared by the operations (HTTP status, Retry-After, SII:RESPUESTA, soapCall, restCall)
    lazy.ts                memoize: load `node:` modules once, on first use
    node-fs.ts             lazy node:fs/promises + node:path loader for the directory adapters
  catalogs/
    reception-status.ts    DTEUpload RECEPCIONDTE STATUS table: RECEPTION_STATUS, receptionStatusMessage,
                           classifyReceptionStatus
    claim-codes.ts         CLAIM_ACTIONS, CLAIM_EVENT_CODES, CLAIM_RESPONSE_CODES, TRANSFERABILITY_CODES,
                           claimResponseMessage, transferabilityMessage
```

Phase 1 files that change:

| File | Change |
|---|---|
| `src/errors.ts` | new codes (section 3.8); `SAFE_DETAIL_KEYS` gains `status`, `httpStatus`, `attempts`, `channel`, `operation`, `code`, `trackId` |
| `src/catalogs/upload-status.ts` | `DOCUMENT_STATUS` gains `FAN` (`cancelled`, "Folio anulado"); exports `isTokenErrorStatus` for `-3`/`-13` and the `001`/`002`/`003` token errors |
| `src/catalogs/endpoints.ts` | `REST_ENDPOINTS` gains `documentStatus` (`…/recursos/v1/boleta.electronica/` prefix) and `statusCatalog` (`…/recursos/v1/globales/boleta.electronica.envio.estado`); `CLAIM_WS_ENDPOINTS` entries drop the `?wsdl` suffix (the call goes to the service URL; the WSDL URL stays as `CLAIM_WSDL_ENDPOINTS`) |
| `src/signature/xmldsig.ts` | `buildSignedInfo` accepts `{ uri, enveloped }`; new `signRootElement` |
| `src/index.ts` | re-exports section 3.13 |
| `scripts/build.mjs` | `external: [...deps, 'node:*']` |
| `.size-limit.json` | limits raised to the measured size rounded up to the next 2 kB |
| `tests/public-api.test.ts`, `tests/dist.smoke.test.ts`, `.github/workflows/ci.yml` smoke scripts | new exports; `createSiiClient` checked in the Deno and Bun smokes |
| `scripts/make-fixtures.mjs` | generates `tests/fixtures/tls-localhost.pem` / `tls-localhost.key.pem` (self-signed, `CN=localhost`, SAN `DNS:localhost, IP:127.0.0.1`, valid 20 years) for the Node adapter tests |

### 3.2 Client configuration

```ts
type SiiClientOptions = {
  /** EN: Target environment. ES: Ambiente: `certification` (maullin) o `production` (palena). */
  readonly environment: Environment
  /** EN: Certificate that signs the seed; its holder is the default sender. ES: Certificado que firma la semilla (`RutEnvia` por defecto). */
  readonly certificate: Certificate
  /** EN: Company RUT (`rutCompany`, `RutCompania`) used by every operation unless overridden. ES: RUT de la empresa emisora. */
  readonly companyRut?: string
  /** EN: Sender RUT; defaults to the certificate holder. ES: `rutSender` — RUT de quien envía; por defecto el titular del certificado. */
  readonly senderRut?: string
  /** EN: HTTP transport; `createFetchTransport()` by default. ES: Transporte HTTP; `fetch` por defecto. */
  readonly transport?: HttpTransport
  /** EN: Token cache; memory by default. ES: Caché de tokens; en memoria por defecto. */
  readonly tokenCache?: TokenCache
  /** EN: Token lifetime in the cache; 55 min. ES: Vigencia del token en caché; 55 min. */
  readonly tokenTtlMs?: number
  /** EN: Retry policy or `false`. ES: Política de reintentos o `false`. */
  readonly retry?: Partial<RetryPolicy> | false
  /** EN: Timeouts per channel in ms: soap 30 000, rest 15 000, upload 60 000. ES: Timeouts por canal. */
  readonly timeouts?: Partial<SiiTimeouts>
  /** EN: Channel for `EnvioBOLETA`; `rest` in production, `soap` in certification. ES: Canal de boletas. */
  readonly receiptsChannel?: TokenChannel
  /** EN: Logger; silent by default. ES: Logger; silencioso por defecto. */
  readonly logger?: Logger
  /** EN: HTTP capture port; off by default. ES: Captura HTTP; apagada por defecto. */
  readonly capture?: HttpCapture
  /** EN: Upload archive port; off by default. ES: Archivo de envíos; apagado por defecto. */
  readonly archive?: UploadArchive
  /** EN: Endpoint overrides (tests, proxies). ES: URLs alternativas (tests, proxys). */
  readonly endpoints?: Partial<SiiEndpoints>
  /** EN: Clock. ES: Reloj inyectable. */
  readonly now?: () => Date
  /** EN: Sleep used between retries and polls. ES: Espera inyectable entre reintentos y sondeos. */
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

type SiiClient = {           // every field resolved and readonly; Object.freeze'd
  readonly environment: Environment
  readonly certificate: Certificate
  readonly companyRut: SiiRut | null
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
  readonly endpoints: SiiEndpoints       // { soap: SoapEndpoints; rest: RestEndpoints; claims: string }
  readonly now: () => Date
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>
}

type CallOverrides = {
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
  readonly retry?: Partial<RetryPolicy> | false
}
```

`createSiiClient` validates: `environment` through `isEnvironment` (`INVALID_OPTION { field: 'environment' }`),
RUTs through `toSiiRut` (`INVALID_RUT { field }`), a sender (certificate RUT or `senderRut`;
`MISSING_FIELD { field: 'senderRut' }`), positive numbers for `tokenTtlMs`, timeouts and retry fields
(`INVALID_OPTION { field }`). The default transport is created lazily: `createFetchTransport()` throws
`TRANSPORT_UNAVAILABLE` only when the first request finds no `globalThis.fetch`.

Operations take `companyRut` from the input, then from the client; neither → `MISSING_FIELD { field:
'companyRut' }`. The same rule applies to `senderRut`.

### 3.3 Transport

```ts
type HttpRequest = {
  readonly method: 'GET' | 'POST'
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly body?: Uint8Array
  readonly timeoutMs: number
  readonly signal?: AbortSignal
}
type HttpResponse = {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>   // lower-cased names; repeated headers joined with ', '
  readonly body: Uint8Array
}
type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>
```

- `createFetchTransport({ fetch? })`: uses `globalThis.fetch` (Node ≥ 20 ships it) or the injected one; sends
  `body` as-is; reads `arrayBuffer()`; maps `AbortError` to `REQUEST_ABORTED` (user signal) or `REQUEST_TIMEOUT`
  (internal timer), any other `TypeError`/`FetchError` to `TRANSPORT_FAILED { reason }`. `redirect: 'manual'`:
  the SII never redirects a well-formed call and a redirect would hide an error page.
- `createNodeHttpsTransport({ tls?, keepAlive? })`: `https.request` with an `https.Agent` (`keepAlive: true`
  by default; a stale keep-alive socket surfaces as `ECONNRESET` → `TRANSPORT_FAILED`, which the retry loop of
  section 3.9 handles). TLS options as in D14; `tls.clientCertificate`
  maps to `key`/`cert` with `chainPem`. Error mapping: `ERR_TLS_*`, `CERT_*`, `UNABLE_TO_*`, `SELF_SIGNED_*`,
  `DEPTH_ZERO_*`, `EPROTO` with an SSL text → `TRANSPORT_TLS { reason: code }`; `ECONNRESET`, `ECONNREFUSED`,
  `ENOTFOUND`, `EAI_AGAIN`, `ETIMEDOUT`, `EPIPE`, `EHOSTUNREACH`, `ENETUNREACH` → `TRANSPORT_FAILED { reason:
  code }`; the internal timer → `REQUEST_TIMEOUT`; the user signal → `REQUEST_ABORTED`.
- Both adapters implement the timeout with their own `AbortController` merged with the caller's `signal`
  (manual merge; `AbortSignal.any` needs Node 20.3) and destroy the socket on timeout.
- The transport is called by one helper, `send(sii, operation, request, overrides)`, which applies the
  timeout, runs the retry loop, times the attempt, calls `capture` with the redacted exchange and logs
  `{ operation, attempt, status, durationMs }` at `debug`.

### 3.4 Authentication

```ts
type TokenChannel = 'soap' | 'rest'
type TokenCache = {
  readonly get: (key: string) => Promise<CachedToken | null>   // { token, expiresAt: number }
  readonly set: (key: string, value: CachedToken) => Promise<void>
  readonly delete: (key: string) => Promise<void>
}

getSeed(sii, channel, overrides?): Promise<string>                 // 12-digit string, never a number
signSeed(seed: string, certificate: Certificate): string           // pure, synchronous
getToken(sii, channel, overrides?): Promise<string>                // cache → seed → sign → token → cache
invalidateToken(sii, channel): Promise<void>
```

- **SOAP seed**: `POST {soap.seed}` with `Content-Type: text/xml; charset=utf-8`, `SOAPAction: ""`, body
  `<soapenv:Envelope><soapenv:Body><getSeed/></soapenv:Body></soapenv:Envelope>` (DTEWS is rpc/encoded on Axis 1:
  unqualified operation elements are accepted and parameters match by position). The reply is decoded as
  Latin-1, `<getSeedReturn>` extracted, XML entities decoded, then `SII:RESPUESTA` parsed without namespaces:
  `RESP_HDR/ESTADO` must be `00`, `RESP_BODY/SEMILLA` is the seed. Any other `ESTADO` → `SII_SEED_FAILED
  { code }`; missing elements → `SII_RESPONSE_INVALID`.
- **SOAP token**: `POST {soap.token}` with `<getToken><pszXml>{escaped signed seed}</pszXml></getToken>`. Reply
  as above; `RESP_HDR/ESTADO` `00` and `RESP_BODY/TOKEN`; otherwise `SII_TOKEN_FAILED { code }` (codes in
  appendix A).
- **REST seed**: `GET {rest.seed}` with `Accept: application/xml`; same `SII:RESPUESTA` shape in UTF-8.
  **REST token**: `POST {rest.token}` with `Content-Type: application/xml`, `Accept: application/xml`, body =
  the signed seed exactly as produced by `signSeed`.
- `signSeed` digest: SHA-1 over the UTF-8 bytes of the canonical `<getToken><item><Semilla>S</Semilla></item></getToken>`
  (the text has no attributes or namespaces, so its canonical form is the text itself); `SignedInfo` with
  C14N 1.0, `rsa-sha1`, `Reference URI=""`, `Transforms/Transform enveloped-signature`, `DigestMethod sha1`;
  signature over the expanded `SignedInfo` carrying `xmlns="http://www.w3.org/2000/09/xmldsig#"`; the stored
  `SignedInfo` keeps that `xmlns` and uses compact empty tags; `SignatureValue`, `Modulus` and
  `X509Certificate` wrapped at 64 columns; `<Signature>` inserted before `</getToken>`.
- `withToken(sii, channel, call)` is the renew-once wrapper every authenticated operation uses: it fetches the
  token, runs `call(token)`, and if the result is classified as "token invalid" (D15) it deletes the cache
  entry, fetches a fresh token and runs `call` once more.
- The token travels as `Cookie: TOKEN={token}` on `DTEUpload`, the REST API and WSRECLAMO, and as the `Token`
  parameter on `QueryEstUp`/`QueryEstDte`.
### 3.5 Uploads

```ts
type UploadKind = 'dte' | 'receipt' | 'book' | 'folioConsumption'
type UploadReceipt = {
  /** EN: SII tracking id of the upload. ES: `TRACKID` / `trackid` — Identificador del envío en el SII. */
  readonly trackId: string
  /** EN: SII reception timestamp, `YYYY-MM-DDTHH:MM:SS` Chile time. ES: `TIMESTAMP` / `fecha_recepcion`. */
  readonly receivedAt: string
  readonly kind: UploadKind
  readonly channel: TokenChannel
  /** EN: File name sent in the multipart part. ES: `FILE` — Nombre del archivo enviado. */
  readonly fileName: string
  /** EN: true when the SII reported the file as already uploaded and returned the original TrackID. ES: true si el SII lo reportó como duplicado. */
  readonly duplicate: boolean
  /** EN: Raw SII response. ES: Respuesta cruda del SII. */
  readonly raw: string
}

uploadEnvelope(sii, { envelope: SignedEnvelope | { kind: EnvelopeKind; xml: string }, companyRut?, senderRut?, channel? }, overrides?): Promise<UploadReceipt>
uploadBook(sii, { xml: string, companyRut?, senderRut? }, overrides?): Promise<UploadReceipt>
uploadFolioConsumption(sii, { xml: string, companyRut?, senderRut? }, overrides?): Promise<UploadReceipt>
```

**`DTEUpload` (kinds `dte`, `book`, `folioConsumption`, and `receipt` on the `soap` channel)**

- `POST {soap.upload}` with `multipart/form-data; boundary=----WebKitFormBoundary{16 alphanumerics}`
  (browser-like, which the CGI has accepted for two decades). Parts in this order: `rutSender`, `dvSender`,
  `rutCompany`, `dvCompany` (body digits and verifier split with `splitSiiRut`; verifier upper-case) and
  `archivo` with `filename` `EnvioDTE.xml` / `EnvioBOLETA.xml` / `LibroCV.xml` / `ConsumoFolios.xml` and
  `Content-Type: text/xml`. The file bytes are `encodeLatin1(xml)` (D17). Headers: `User-Agent:
  UPLOAD_USER_AGENT` (the `PROG` token makes the CGI answer XML instead of HTML), `Cookie: TOKEN=…`,
  `Accept: */*`, `Content-Length`. Timeout `timeouts.upload`.
- Reply (Latin-1): `<RECEPCIONDTE>` with `RUTSENDER`, `RUTCOMPANY`, `FILE`, `TIMESTAMP`, `STATUS`, `TRACKID`
  (on success) and `DETAIL/ERROR` lines (on schema failures). Parsed with `extractTagContent` after entity
  decoding; a reply without `<RECEPCIONDTE>` (HTML login page, maintenance page) is `SII_RESPONSE_INVALID`
  and retryable.
- `STATUS` handling (`src/catalogs/reception-status.ts`):

  | `STATUS` | Meaning | Outcome |
  |---|---|---|
  | `0` | received, `TRACKID` present | `UploadReceipt` |
  | `1` | sender not authorized for the company | `SII_UPLOAD_REJECTED { status: 1 }` |
  | `2` | file size error | `SII_UPLOAD_REJECTED { status: 2 }` |
  | `3` | file truncated / incomplete | `SII_UPLOAD_REJECTED { status: 3 }` |
  | `5` | not authenticated | token invalid → renew once (D15); then `SII_TOKEN_INVALID` |
  | `6` | company not authorized | `SII_UPLOAD_REJECTED { status: 6 }` |
  | `7` | "invalid schema" — but the `DETAIL/ERROR` lines decide: `CHR-00001` (charset), `SCH-00001` or any `cvc-…` (XSD) are real rejections; otherwise, when the text carries a TrackID, the file was already uploaded | rejection → `SII_UPLOAD_REJECTED { status: 7, errors }`; duplicate → `UploadReceipt { duplicate: true }` |
  | `8` | document signature error | `SII_UPLOAD_REJECTED { status: 8 }` |
  | `9` | system blocked | `SII_UPLOAD_REJECTED { status: 9 }` (retryable: it clears in minutes) |
  | `99` | "file already uploaded N times with Trackid X" | `UploadReceipt { duplicate: true, trackId: X }` |
  | other | internal error | `SII_UPLOAD_REJECTED { status }` |

**Receipts REST upload (kind `receipt` on the `rest` channel)**

- `POST {rest.upload}` with the same five multipart parts, `User-Agent: UPLOAD_USER_AGENT` (required by the
  OpenAPI document), `Cookie: TOKEN=…`, `Accept: application/json`. Up to 500 receipts per envelope (checked
  from `envelope.cover.subtotals` when a `SignedEnvelope` is given; `SII_UPLOAD_REJECTED { status: 'TOO_MANY'
  }` before sending).
- 200: JSON `{ rut_emisor, rut_envia, trackid, fecha_recepcion, estado, file }` → `UploadReceipt` (`trackid`
  kept as a string; `fecha_recepcion` `YYYY-MM-DD HH:MM:SS` normalised). 401 → token invalid (D15). 405 →
  rate limit, retryable with `X-Retry-After`. 400/500 and non-JSON bodies → `SII_HTTP_ERROR { httpStatus }`.

After any SII answer (success, duplicate or rejection) the `archive` port receives the `UploadRecord`
(section 3.10). Rejections also reach the caller as the thrown `DteError`.

### 3.6 Status queries

```ts
type UploadStatus = {
  /** EN: SII status code. ES: `ESTADO` / `estado` — Código de estado del envío. */
  readonly code: string
  readonly status: UploadStatusClass            // classifyUploadStatus(code, channel)
  /** EN: Spanish gloss from the SII or the catalog. ES: `GLOSA` — Glosa del estado. */
  readonly message: string
  readonly trackId: string
  readonly channel: TokenChannel
  /** EN: Document counts when the SII reports them. ES: `INFORMADOS`/`ACEPTADOS`/`RECHAZADOS`/`REPAROS`. */
  readonly counts: { readonly reported: number; readonly accepted: number; readonly rejected: number; readonly objections: number } | null
  /** EN: Document type the counts refer to (SOAP). ES: `TIPO_DOCTO`. */
  readonly documentType: string | null
  /** EN: Per-document detail (REST only). ES: `detalle_rep_rech` — Detalle por documento (solo REST). */
  readonly documents: readonly UploadStatusDocument[]
  readonly raw: string
}
type UploadStatusDocument = {   // REST detalle_rep_rech
  readonly type: string; readonly folio: number | null; readonly code: string; readonly description: string
  readonly errors: readonly { section: string; line: number | null; level: 1 | 2 | 3; code: string; description: string; detail: string }[]
}

queryUploadStatus(sii, { trackId, companyRut?, channel? }, overrides?): Promise<UploadStatus>
waitForUploadStatus(sii, { trackId, companyRut?, channel?, intervalMs?, timeoutMs? }, overrides?): Promise<UploadStatus>
```

- SOAP: `POST {soap.uploadStatus}` with `<getEstUp><RutCompania/><DvCompania/><TrackId/><Token/></getEstUp>`
  (WSDL parameter names; Axis matches by position anyway). Reply inside `<getEstUpReturn>`: `RESP_HDR`
  `TRACKID`, `ESTADO`, `GLOSA`, `NUM_ATENCION`; `RESP_BODY` `TIPO_DOCTO`, `INFORMADOS`, `ACEPTADOS`,
  `RECHAZADOS`, `REPAROS`. `ESTADO` `-1` with `ERR_CODE` → `SII_QUERY_ERROR { code }` (retryable); token error
  codes → renew once.
- REST: `GET {rest.status}{rutBody}-{dv}-{trackId}` with the REST token. `estado` is the envelope state
  (`REC`, `EPR`, `RPR`, `RCH`, …; `RLV` only appears per document), `estadistica[]` sums into `counts`,
  `detalle_rep_rech[]` becomes `documents`.
- `channel` defaults to the channel the envelope kind would use (`soap` unless the caller says `rest`); the
  caller passes the channel it uploaded with when it differs from the client default.
- `waitForUploadStatus` polls every `intervalMs` (5 000) until `status` is not `pending`, up to `timeoutMs`
  (600 000) → `WAIT_TIMEOUT { trackId, attempts }`. Query errors (`-1` … `-14`) count as pending for the
  purpose of the wait; the final error is thrown only when `timeoutMs` elapses.

```ts
type DocumentStatus = {
  readonly code: string                        // DOK, DNK, FAU, FNA, FAN, EMP, TMD, TMC, MMD, MMC, AND, ANC
  readonly status: DocumentStatusClass         // classifyDocumentStatus(code)
  readonly message: string
  readonly raw: string
}

queryDocumentStatus(sii, { companyRut?, receiverRut, type, folio, issueDate, totalAmount, channel? }, overrides?): Promise<DocumentStatus>
folioReceived(sii, { companyRut?, type, folio }, overrides?): Promise<boolean | null>
```

- SOAP (`channel: 'soap'`, the default for non-receipt types): `POST {soap.documentStatus}` with
  `getEstDte(RutConsultante, DvConsultante, RutCompania, DvCompania, RutReceptor, DvReceptor, TipoDte,
  FolioDte, FechaEmisionDte, MontoDte, Token)`; the consultant is the sender; `FechaEmisionDte` is `DDMMYYYY`
  from the ISO `issueDate`. Reply `ESTADO`, `GLOSA` or `GLOSA_ESTADO`, `ERR_CODE`, `GLOSA_ERR`.
- REST (`channel: 'rest'`, the default for receipt types 39/41): `GET
  {rest.documentStatus}{rutBody}-{dv}-{type}-{folio}/estado?rut_receptor=&dv_receptor=&monto=&fechaEmision=DD-MM-YYYY`
  → `{ codigo, descripcion }`. The receipts API needs ~10 minutes after the upload before it answers.
- `folioReceived` is the pre-flight check before reusing a folio obtained again from a CAF: `QueryEstDte` with
  the final-consumer receiver (`FINAL_CONSUMER_RUT`), today's date in Chile and amount 1 answers by folio
  existence first. `FAU` → `false` (free), `DOK`/`DNK` (or a gloss containing "recibido") → `true`, anything
  else → `null` (unknown; the caller decides).
### 3.7 Acceptance/claim registry (WSRECLAMO)

```ts
type ClaimAction = 'acceptContent' | 'claimContent' | 'acknowledgeGoods' | 'claimPartialShortfall' | 'claimTotalShortfall'
//                  ACD               RCD              ERM                  RFP                        RFT
type ClaimResult = {
  /** EN: SII response code (0 ok, 1–19 business, -1 internal). ES: `codResp`. */
  readonly code: number
  /** EN: SII description (≤ 70 chars). ES: `descResp`. */
  readonly description: string
  /** EN: true when `code` is 0. ES: true si `codResp` es 0. */
  readonly ok: boolean
  readonly raw: string
}
type ClaimEvent = {
  /** EN: Event code: ACD, RCD, ERM, RFP, RFT, NCA, ENC. ES: `codEvento`. */
  readonly code: string
  /** EN: Event description. ES: `descEvento`. */
  readonly description: string
  /** EN: RUT that registered the event. ES: `rutResponsable`-`dvResponsable`. */
  readonly responsibleRut: SiiRut | null
  /** EN: Event date as sent by the SII (`DD-MM-YYYY HH:MM:SS`) and normalised ISO when it parses. ES: `fechaEvento`. */
  readonly date: string
  readonly dateIso: string | null
}
type ReceiverStatus = 'accepted' | 'goodsReceived' | 'claimed' | 'none' | 'unknown'

registerClaim(sii, { issuerRut, type: 33 | 34 | 43, folio, action: ClaimAction }, overrides?): Promise<ClaimResult>
listClaimEvents(sii, { issuerRut, type, folio }, overrides?): Promise<ClaimResult & { readonly events: readonly ClaimEvent[] }>
queryTransferable(sii, { issuerRut, type, folio }, overrides?): Promise<ClaimResult & { readonly transferable: boolean | null }>
queryReceptionDate(sii, { issuerRut, type, folio }, overrides?): Promise<{ readonly receivedAt: string | null; readonly raw: string }>
receiverStatus(sii, { issuerRut, type, folio }, overrides?): Promise<{ readonly status: ReceiverStatus; readonly lastEvent: ClaimEvent | null; readonly code: number }>
```

- SOAP 1.1 rpc/literal, `POST {endpoints.claims}` (service URL without `?wsdl`), `Content-Type: text/xml;
  charset=utf-8`, `SOAPAction: ""`, `Cookie: TOKEN={soap token}`. Body
  `<soapenv:Envelope xmlns:soapenv="…" xmlns:ws="http://ws.registroreclamodte.diii.sdi.sii.cl"><soapenv:Body><ws:ingresarAceptacionReclamoDoc><rutEmisor/><dvEmisor/><tipoDoc/><folio/><accionDoc/></ws:…></soapenv:Body></soapenv:Envelope>`
  (operation qualified, parameters unqualified, all strings). Reply (UTF-8) parsed without namespaces:
  `return/codResp`, `return/descResp`, `return/listaEventosDoc[]`; `consultarFechaRecepcionSii` returns a plain
  string inside `return`.
- HTTP 401/403 (fault "Error de Autenticacion: TOKEN invalido") → token invalid (D15). A SOAP `Fault` on 500 →
  `SII_SOAP_FAULT { code: faultcode }` with `faultstring` in `details.reason`.
- The operations return the SII code instead of throwing: `code` 5 ("already claimed"), 8 ("past 8 days") or 11
  are business answers the caller branches on. `claimResponseMessage(code)` gives the catalog text in Spanish.
- `queryTransferable` maps `codResp` 23 and 25 → `true`, 20, 21 and 24 → `false`, anything else → `null`
  (`transferabilityMessage(code)` explains it).
- `receiverStatus` is derived from `listClaimEvents`: the last event (highest `dateIso`, or the last element
  when dates do not parse) `ACD` → `accepted`, `ERM` → `goodsReceived`, `RCD`/`RFP`/`RFT` → `claimed`,
  `NCA`/`ENC` or no events (`codResp` 15 with an empty list, 16, 18) → `none`; any other code → `unknown`.

### 3.8 Errors

New `DTE_ERROR_CODES` (messages generic; values only in `details`):

| Code | When | `details` |
|---|---|---|
| `INVALID_OPTION` | `createSiiClient` or an operation receives an invalid option value | `{ field }` |
| `TRANSPORT_UNAVAILABLE` | no `fetch` and no injected transport; or the Node adapter cannot load `node:https` | `{ reason }` |
| `TRANSPORT_FAILED` | network failure before or during the exchange (DNS, refused, reset) | `{ reason: code, operation, attempts }` |
| `TRANSPORT_TLS` | TLS handshake or certificate verification failed | `{ reason: openssl code, operation }` |
| `REQUEST_TIMEOUT` | the channel timeout elapsed | `{ operation, timeoutMs, attempts }` |
| `REQUEST_ABORTED` | the caller's `signal` fired | `{ operation }` |
| `SII_HTTP_ERROR` | non-2xx HTTP status that is not a token failure | `{ httpStatus, operation, url, body (capped) }` |
| `SII_RESPONSE_INVALID` | 2xx with a body that is not the expected XML/JSON (HTML page, truncated XML) | `{ operation, body (capped) }` |
| `SII_SOAP_FAULT` | SOAP `Fault` element in the reply | `{ code, reason, operation }` |
| `SII_SEED_FAILED` | seed `ESTADO` ≠ `00` | `{ code, channel }` |
| `SII_TOKEN_FAILED` | token `ESTADO` ≠ `00` | `{ code, channel }` |
| `SII_TOKEN_INVALID` | the SII rejected the token twice in a row | `{ channel, operation }` |
| `SII_UPLOAD_REJECTED` | `DTEUpload` `STATUS` ≠ 0 and not a duplicate; REST pre-flight failure | `{ status, errors, fileName, trackId? }` |
| `SII_QUERY_ERROR` | `QueryEst*` `ESTADO` `-1` … `-14` (or `-1` + `ERR_CODE`) after the retries | `{ code, operation, attempts }` |
| `WAIT_TIMEOUT` | `waitForUploadStatus` exhausted `timeoutMs` | `{ trackId, attempts, lastCode }` |

`isRetryableError(error)` is exported (D6 mentioned `isRetryable`; the name follows the `isDteError` pattern):
true for `TRANSPORT_FAILED`, `REQUEST_TIMEOUT`, `SII_RESPONSE_INVALID`, `SII_QUERY_ERROR`, `SII_HTTP_ERROR`
with `httpStatus` 429, 405 (REST rate limit) or ≥ 500, and `SII_UPLOAD_REJECTED` with `status` 9.
`details.url` and `details.body` are never part of the message (a REST status URL carries a RUT).

### 3.9 Retry policy

```ts
type RetryPolicy = {
  readonly maxAttempts: number          // 6
  readonly initialDelayMs: number       // 2000
  readonly maxDelayMs: number           // 15000
  readonly backoffMultiplier: number    // 1.8
  readonly jitterRatio: number          // 0.2 → delay × (1 ± 0.2)
  readonly retryOn?: (error: DteError) => boolean   // defaults to isRetryableError
}
```

- `withRetry(sii, operation, attempt => Promise<T>, overrides)`: runs attempts until success, a non-retryable
  error, `maxAttempts`, or the signal. Delay `min(maxDelayMs, initialDelayMs × multiplier^(attempt-1))` with
  jitter from an injectable `random` (tests pass `() => 0.5`). `X-Retry-After` on 405/429 overrides the computed
  delay (still capped). The thrown error carries `details.attempts`.
- Upload rule (D18): the attempt callback reports whether a response was received; once it was, the loop
  stops retrying regardless of the error class.
- Per-call `overrides.retry` merges over the client policy; `false` means one attempt.

### 3.10 Capture, archive and logger

```ts
type HttpExchange = {
  readonly operation: string            // 'getSeed', 'uploadEnvelope', 'registerClaim', …
  readonly channel: TokenChannel
  readonly attempt: number
  readonly request: { readonly method: string; readonly url: string; readonly headers: Readonly<Record<string, string>>; readonly body: string | null }
  readonly response: { readonly status: number; readonly headers: Readonly<Record<string, string>>; readonly body: string | null } | null
  readonly error: { readonly code: string; readonly reason: string } | null
  readonly startedAt: string            // ISO 8601 UTC
  readonly durationMs: number
}
type HttpCapture = (exchange: HttpExchange) => Promise<void>
```

- `redactExchange(exchange)` is pure and exported (consumers can reuse it in their own adapters): header
  values of `cookie`, `set-cookie`, `authorization`, `proxy-authorization` → `[redacted]`; in bodies and URLs
  `<TOKEN>…</TOKEN>`, `<Token>…</Token>`, `<SEMILLA>…</SEMILLA>`, `<Semilla>…</Semilla>`, `TOKEN=…` up to the
  next `;`, `&` or whitespace, `<RSASK>…</RSASK>` and `-----BEGIN … PRIVATE KEY-----` blocks → `[redacted]`;
  multipart file parts and request bodies are decoded with the channel charset for readability; bodies over
  512 KiB are cut and suffixed with `…[truncated N bytes]`.
- `createMemoryCapture()` → `{ capture, exchanges(): readonly HttpExchange[] }`.
- `createDirectoryCapture({ dir, prefix? })` writes `<dir>/<prefix><seq 4 digits>-<operation>-<status|ERR>.json`
  and appends one line per exchange to `<dir>/index.jsonl` (`{ seq, startedAt, operation, method, url,
  status, durationMs, file }`); `prefix` separates replicas sharing a volume; directories are created on first
  use; any failure is reported through `logger.warn` and swallowed.

```ts
type UploadRecord = {
  readonly environment: Environment
  readonly kind: UploadKind
  readonly channel: TokenChannel
  readonly trackId: string | null
  readonly duplicate: boolean
  readonly companyRut: SiiRut
  readonly senderRut: SiiRut
  readonly fileName: string
  readonly sentAt: string                 // ISO 8601 UTC
  readonly xml: Uint8Array                // the exact bytes sent
  readonly response: { readonly httpStatus: number; readonly code: string; readonly raw: string }
}
type UploadArchive = (record: UploadRecord) => Promise<void>
```

- `createMemoryUploadArchive()` → `{ archive, records(): readonly UploadRecord[] }`.
- `createDirectoryUploadArchive({ dir })` writes `<dir>/<environment>/<yyyy-mm>/<name>.xml` and `<name>.json`
  (the record without `xml`), with `name` = `<trackId>-<kind>` or `rejected-<yyyymmddHHMMSS>-<kind>`; same
  failure policy as the capture.

```ts
type Logger = {
  readonly debug: (message: string, context?: Readonly<Record<string, unknown>>) => void
  readonly info: …; readonly warn: …; readonly error: …
}
```

`silentLogger` is the default. The SDK logs operation names, attempts, HTTP statuses, SII codes and durations.
Messages never contain a RUT, a token or XML; those may appear only in `context`, which the consumer decides
whether to print.

### 3.11 Typical flows

```ts
const sii = createSiiClient({ environment: 'certification', certificate, companyRut: '76543210-3' })

// Invoices: upload, wait, inspect
const receipt = await uploadEnvelope(sii, { envelope: signedEnvelope })
const status = await waitForUploadStatus(sii, { trackId: receipt.trackId })
if (status.status === 'rejected') console.log(status.code, status.message)

// Receipts in production go through the REST API automatically
const prod = createSiiClient({ environment: 'production', certificate, companyRut, transport: createNodeHttpsTransport() })
await uploadEnvelope(prod, { envelope: signedReceiptsEnvelope })

// Received invoice: accept content
const result = await registerClaim(sii, { issuerRut: '77111222-3', type: 33, folio: 1234, action: 'acceptContent' })
if (!result.ok) console.log(claimResponseMessage(result.code))

// Diagnostics
const capture = createMemoryCapture()
const debug = createSiiClient({ environment: 'certification', certificate, companyRut, capture: capture.capture, logger: console })
```

Internal flow of `uploadEnvelope` (`dte` kind): resolve RUTs → `withToken('soap')` → build multipart bytes →
`withRetry` around `send` (retry only before a response) → parse `RECEPCIONDTE` → classify `STATUS` → archive →
return `UploadReceipt` or throw.

### 3.12 Tests

- **Fake SII** (`tests/support/fake-sii.ts`, not published): `createFakeSii(routes)` returns `{ transport,
  requests }`. A route is `{ method, url (exact or prefix), reply }` where `reply` is a response description
  (`{ status, headers?, body: string | Uint8Array, encoding?: 'latin1' | 'utf8' }`), a function of the decoded
  request, or an array consumed in order (retry and renewal scenarios). Every request is recorded with its
  decoded body and multipart parts so tests assert field order, file name, charset and headers.
- **Fixtures** in `tests/fixtures/sii/`: SOAP seed and token replies (ok and error `ESTADO`s), `RECEPCIONDTE`
  replies for every `STATUS` row of section 3.5 including the `CHR`/`SCH`/`cvc` and duplicate variants,
  `getEstUpReturn` replies (`EPR`, `RPR`, `REC`, `RSC`, `-1` with `ERR_CODE`, token error), `getEstDteReturn`
  replies (`DOK`, `DNK`, `FAU`, `FAN`), REST JSON for seed/token/upload/envelope status/per-document status
  and the 401/405 bodies, WSRECLAMO replies for `codResp` 0, 5, 7, 8, 15 with events, 16, 18, 23, 24, a
  fault and the 401 page. All data invented (company "Comercial Andina SpA", RUTs from the scan allow-list);
  Latin-1 fixtures are stored as bytes (`.bin`) or with escapes so the charset round trip is real.
- **Unit tests per module** (`tests/sii/*.test.ts` and `tests/catalogs/*.test.ts`): multipart byte layout
  (boundary, CRLF, part order, Latin-1 bytes 0xE1 for `á`), SOAP envelope text, seed signature verified with
  `verifyEnveloped`-style checks against the fixture certificate, token cache key and TTL with `FIXED_NOW`,
  renew-once behaviour, every `STATUS` row, duplicate recovery, REST upload and statuses, `waitForUploadStatus`
  with a fake `sleep`, `folioReceived` three outcomes, the four WSRECLAMO operations and `receiverStatus`,
  retry delays (`random = () => 0.5`), `X-Retry-After`, the no-re-send rule, redaction (property test: no
  token or seed string survives `redactExchange`), memory and directory adapters (directory ones in a temp
  dir), `createSiiClient` validation, `isRetryableError`.
- **Node adapter** (`tests/sii/node-transport.test.ts`): a loopback `https.createServer` with
  `tls-localhost.pem`. Cases: default options reject the self-signed server with `TRANSPORT_TLS` and the
  OpenSSL code; `tls.ca` makes it pass; `tls.rejectUnauthorized: false` passes; timeout → `REQUEST_TIMEOUT`;
  abort → `REQUEST_ABORTED`; Latin-1 bytes round trip; `legacyRenegotiation` and version bounds are asserted
  on the options handed to `https.Agent` (a legacy server cannot be emulated).
- **Live smoke** (`tests/live/sii.live.test.ts`): runs only with `SII_LIVE=1`, `SII_CERT_PFX` and
  `SII_CERT_PASSWORD`; seed, token, `queryUploadStatus` of a known TrackID and WSRECLAMO `listClaimEvents` against maullin. Excluded from CI; its result is recorded in the pull request.
- Coverage threshold stays at 100 %; `tests/public-api.test.ts` and `tests/dist.smoke.test.ts` extended;
  `tests/types.test.ts` gains `expect-type` checks for `SiiClient` immutability and the operation signatures.

### 3.13 Public API additions and scaffolding

Runtime exports added to the root (and to `RUNTIME_EXPORTS`): `createSiiClient`, `createFetchTransport`,
`createNodeHttpsTransport`, `createMemoryTokenCache`, `tokenCacheKey`, `getSeed`, `signSeed`, `getToken`,
`invalidateToken`, `uploadEnvelope`, `uploadBook`, `uploadFolioConsumption`, `queryUploadStatus`,
`waitForUploadStatus`, `queryDocumentStatus`, `folioReceived`, `registerClaim`, `listClaimEvents`,
`queryTransferable`, `queryReceptionDate`, `receiverStatus`, `DEFAULT_RETRY_POLICY`, `isRetryableError`,
`redactExchange`, `createMemoryCapture`, `createDirectoryCapture`, `createMemoryUploadArchive`,
`createDirectoryUploadArchive`, `silentLogger`, `buildMultipartBody`, `buildSoapEnvelope`,
`parseSoapResponse`, `signRootElement`, `RECEPTION_STATUS`, `receptionStatusMessage`,
`classifyReceptionStatus`, `isTokenErrorStatus`, `CLAIM_ACTIONS`, `CLAIM_EVENT_CODES`, `CLAIM_RESPONSE_CODES`,
`TRANSFERABILITY_CODES`, `claimResponseMessage`, `transferabilityMessage`, `CLAIM_WSDL_ENDPOINTS`.
Types: every type named in this section.

Scaffolding: `scripts/build.mjs` externalises `node:*`; `.size-limit.json` limits are raised to the measured
post-phase-2 size rounded up to the next 2 kB and the numbers are posted to issue #5; CI is unchanged (no
network in tests); `npm run scan` keeps passing (fixture RUTs come from the allow-list; no local paths).

---
## 4. Glossary additions (public contract)

Same format as section 5 of the phase 1 spec: SII tag → `name` in the model.

**Authentication** (`getSeed`, `getToken`)
SEMILLA / Semilla `seed` · TOKEN `token` · RESP_HDR/ESTADO `code` · GLOSA `message` · canal SOAP (DTEWS)
`'soap'` · canal REST (boletas) `'rest'` (`TokenChannel`).

**`RECEPCIONDTE` → `UploadReceipt`**
TRACKID / trackid `trackId` · TIMESTAMP / fecha_recepcion `receivedAt` · FILE / file `fileName` · STATUS
`status` (catalog `RECEPTION_STATUS`) · RUTSENDER / rut_envia `senderRut` · RUTCOMPANY / rut_emisor
`companyRut` · envío duplicado `duplicate` · EnvioDTE `'dte'` · EnvioBOLETA `'receipt'` · Libro `'book'` ·
Reporte de Consumo de Folios (RCOF) `'folioConsumption'` (`UploadKind`).

**`QueryEstUp` / estado de envío REST → `UploadStatus`**
ESTADO / estado `code` · GLOSA `message` · NUM_ATENCION `attentionNumber` (in `raw` only) · TIPO_DOCTO
`documentType` · INFORMADOS / informados `counts.reported` · ACEPTADOS / aceptados `counts.accepted` ·
RECHAZADOS / rechazados `counts.rejected` · REPAROS / reparos `counts.objections` · detalle_rep_rech
`documents[] { tipo type, folio folio, estado code, descripcion description, error[] errors { seccion
section, linea line, nivel level, codigo code, descripcion description, detalle detail } }`.

**`QueryEstDte` / estado de documento REST → `DocumentStatus`**
RutConsultante `senderRut` · RutCompania `companyRut` · RutReceptor `receiverRut` · TipoDte `type` ·
FolioDte `folio` · FechaEmisionDte / fechaEmision `issueDate` (ISO in the API, `DDMMYYYY` / `DD-MM-YYYY` on
the wire) · MontoDte / monto `totalAmount` · ESTADO / codigo `code` · GLOSA_ESTADO / descripcion `message` ·
FAN `cancelled` ("folio anulado").

**Registro de Aceptación o Reclamo (WSRECLAMO) → `claims`**
rutEmisor `issuerRut` · tipoDoc `type` · folio `folio` · accionDoc `action` (`ClaimAction`: ACD
`acceptContent`, RCD `claimContent`, ERM `acknowledgeGoods`, RFP `claimPartialShortfall`, RFT
`claimTotalShortfall`) · codResp `code` · descResp `description` · listaEventosDoc `events[]` · codEvento
`code` · descEvento `description` · rutResponsable + dvResponsable `responsibleRut` · fechaEvento `date` /
`dateIso` · cedible `transferable` · fecha de recepción en el SII `receivedAt` · estado del receptor
`ReceiverStatus` (`accepted`, `goodsReceived`, `claimed`, `none`, `unknown`).

**Operations**
captura HTTP `HttpExchange` / `HttpCapture` · archivo de envíos `UploadRecord` / `UploadArchive` · política de
reintentos `RetryPolicy` · caché de token `TokenCache`.

---

## 5. Decisions taken with Hans (2026-11-01)

1. Client as immutable data plus free functions (D11).
2. Root entry with lazy `import()` for the Node adapters; subpaths deferred to phase 4 with measurements in
   issue #5 (D12).
3. The fake SII lives in `tests/support/` and is not published.
4. `waitForUploadStatus` and the REST per-document status are in scope.
5. External libraries are allowed when they pay for themselves; none is needed in phase 2 (D20).
6. TLS verification stays on by default after the measurement in D14; the legacy knobs are opt-in.
7. Retry defaults are the field-measured values of D18.
8. The implementation (phase 2 plan execution) runs in a separate session.

---

## 6. Open points and how the design handles them

| Point | Status | Handling |
|---|---|---|
| DTEWS token lifetime | undocumented | 55-minute TTL for both channels plus renew-once on rejection |
| Which `DTEUpload` headers are mandatory | only `PROG` in the `User-Agent` and the `TOKEN` cookie are confirmed | send the small browser-like set (`User-Agent`, `Cookie`, `Accept: */*`); the live smoke confirms |
| Books and RCOF through `DTEUpload` | not in the SII PDFs, universal in practice | implemented as such; file names `LibroCV.xml` and `ConsumoFolios.xml` |
| `getEstUp` parameter names (`RutCompania` in the WSDL, `RutEmpresa` in the PDF sample) | positional on Axis | WSDL names; the fake SII asserts order |
| `consultarFechaRecepcionSii` string format | unconfirmed | `receivedAt` returns the raw string plus an ISO normalisation when it matches `DD-MM-YYYY HH:MM:SS` |
| WSRECLAMO token transport (`Cookie: TOKEN`) | convention, not in the PDF | implemented as the cookie; the live smoke confirms |
| Receipts REST in certification | unreliable with test sets | D17 default to `DTEUpload` in certification; override available |
| Behaviour of the legacy TLS flags on Node | not needed by any host today | opt-in, asserted on the agent options only |

---

## Appendix A. SII protocol facts the implementation relies on (verified 2026-11-01)

**DTEWS SOAP (maullin / palena).** Live WSDLs: namespace `http://DefaultNamespace`, rpc/encoded, `soapAction
""`. `CrSeed.jws` `getSeed()` → `getSeedReturn` holds the escaped `<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema"><SII:RESP_HDR><ESTADO>00</ESTADO></SII:RESP_HDR><SII:RESP_BODY><SEMILLA>000000000078</SEMILLA></SII:RESP_BODY></SII:RESPUESTA>`;
the seed is a 12-digit zero-padded string valid 2 minutes. `GetTokenFromSeed.jws` `getToken(pszXml)` → `ESTADO`
`00`, `GLOSA` "Token Creado", `TOKEN` (~13 chars). `getToken` `ESTADO` codes: 00 ok; 01–03 invalid XML; 04
Signature missing; 05 invalid signature; 06 Semilla missing; 07/09/12 message exception; 08 seed timeout / not
found / wrong parameters; 10 token create/update error; 11 certificate missing; 21 public key ≠ certificate; -3
authentication error; -07 RUT not registered for certificate authentication. Responses are XML-escaped inside
`<…Return>` and may contain `&#xd;`.

**`DTEUpload` (`/cgi_dte/UPL/DTEUpload`).** Multipart fields `rutSender`, `dvSender`, `rutCompany`, `dvCompany`,
`archivo` (RUT bodies without verifier; verifier separate). `User-Agent` must contain `PROG 1.0` (official
sample `Mozilla/4.0 (compatible; PROG 1.0; Windows NT 5.0; YComp 5.0.2.4)`; the SDK sends the documented
`Mozilla/4.0 ( compatible; PROG 1.0; Windows NT)`), `Cookie: TOKEN=…`. Reply `<RECEPCIONDTE>` with
`RUTSENDER`, `RUTCOMPANY`, `FILE`, `TIMESTAMP` (`YYYY-MM-DD HH:MM:SS`), `STATUS`, `TRACKID` (only on 0) and
`DETAIL/ERROR` on 7. A `GET` returns HTTP 501 HTML.

**`QueryEstUp.jws`** `getEstUp(RutCompania, DvCompania, TrackId, Token)` → `RESP_HDR { TRACKID, ESTADO, GLOSA,
NUM_ATENCION }`, `RESP_BODY { TIPO_DOCTO, INFORMADOS, ACEPTADOS, RECHAZADOS, REPAROS }`; error envelope
`ESTADO -1` with `ERR_CODE`, `SQL_CODE`, `SRV_CODE`; token errors `001`/`002`/`003`.
**`QueryEstDte.jws`** `getEstDte(RutConsultante, DvConsultante, RutCompania, DvCompania, RutReceptor,
DvReceptor, TipoDte, FolioDte, FechaEmisionDte DDMMYYYY, MontoDte, Token)` → `ESTADO` ∈ DOK DNK FAU FNA FAN EMP
TMD TMC MMD MMC AND ANC with `GLOSA`/`GLOSA_ESTADO`, `ERR_CODE`, `GLOSA_ERR`, `NUM_ATENCION`.
**`QueryEstDteAv`** (`/DTEWS/services/QueryEstDteAv?wsdl`) adds `FirmaDte` (the DTE `SignatureValue`); out of
scope.

**Receipts REST API** (OpenAPI v1.0.5 at `www4c.sii.cl/bolcoreinternetui/api/openapi.yaml`). Hosts: certification
`apicert.sii.cl/recursos/v1` (upload on `pangal.sii.cl`), production `api.sii.cl/recursos/v1` (upload on
`rahue.sii.cl`). `GET /boleta.electronica.semilla` (`accept: application/xml`; `ESTADO` 00, -1 configuration, -2
database). `POST /boleta.electronica.token` (`Content-Type: application/xml`), body = the signed seed in the
exact two-line layout; token valid 1 hour, renewed on each use, ~13 chars (may grow to 500); the DTEWS token
is not accepted. `POST /boleta.electronica.envio`: `User-Agent` with `PROG 1.0` required, `Cookie: TOKEN`,
`accept: application/json`; ≤ 500 receipts; 200 → `{ rut_emisor, rut_envia, trackid (int64 ≤ 15 digits),
fecha_recepcion "YYYY-MM-DD HH:MM:SS", estado "REC", file }` plus `X-Location`, `X-Retry-After`,
`X-RateLimit-*`; errors 400, 401 (token missing), 405 (rate limit), 500 with text/plain bodies. `GET
/boleta.electronica.envio/{rut}-{dv}-{trackid}` → `{ rut_emisor, rut_envia, trackid, fecha_recepcion
"DD/MM/YYYY HH:MM:SS", estado, estadistica[] { tipo, informados, aceptados, rechazados, reparos },
detalle_rep_rech[] { tipo, folio|null, estado, descripcion, error[] { seccion ∈ ENV CRT TED CAF DTE HED DET
REF DRG, linea, nivel 1|2|3, codigo, descripcion, detalle } } }`. Envelope `estado` ∈ REC SOK FOK CRT PRD EPR RCH
RCO VOF RFR RPR RPT RSC RCT; `RLV` is a per-document state only. `GET /globales/boleta.electronica.envio.estado`
lists the catalog without a token. `GET /boleta.electronica/{rut}-{dv}-{tipo}-{folio}/estado?rut_receptor=&dv_receptor=&monto=&fechaEmision=DD-MM-YYYY`
→ `{ codigo, descripcion }` with the `QueryEstDte` codes; wait ~10 minutes after the upload.

**WSRECLAMO v1.2.** Certification `https://ws2.sii.cl/WSREGISTRORECLAMODTECERT/registroreclamodteservice`,
production `https://ws1.sii.cl/WSREGISTRORECLAMODTE/registroreclamodteservice`. SOAP 1.1 rpc/literal, target
namespace `http://ws.registroreclamodte.diii.sdi.sii.cl`, `soapAction ""`, request children unqualified. A
token-less call answers HTTP 401 with the fault "Error de Autenticacion: TOKEN invalido". Operations (all
`xsd:string` parameters in order): `ingresarAceptacionReclamoDoc(rutEmisor, dvEmisor, tipoDoc, folio,
accionDoc)`, `listarEventosHistDoc(rutEmisor, dvEmisor, tipoDoc, folio)`, `consultarDocDteCedible(…)`,
`consultarFechaRecepcionSii(…)`, `getVersion()`. `tipoDoc` ∈ 33, 34, 43. Returns `respuestaTo { codResp,
descResp (≤ 70 chars), listaEventosDoc[] { codEvento, descEvento, rutResponsable, dvResponsable, fechaEvento },
rutToken }`; `consultarFechaRecepcionSii` returns a plain string. Actions: ACD accept content, RCD claim
content, ERM acknowledge receipt of goods/services, RFP claim partial shortfall, RFT claim total shortfall;
window of 8 calendar days from SII reception; only the receiver company, its representatives or authorised
users; DTEs received since 2017-01-14. `codResp` for `ingresar`: 0 ok; 1 wrong issuer RUT; 2 wrong folio; 3
document type mismatch; 4 invalid action; 5 already claimed; 6 cannot acknowledge goods of a claimed DTE; 7
event already registered; 8 past 8 days; 9 no records; 10 not received since 2017-01-14; 11 cannot claim an
accepted DTE; 12 cannot accept a rejected DTE; 13 cannot claim a DTE registered as goods received; 14 only
receiver or issuer company; 15 event list (listar); 16 no events; 17 only receiver company; 18 document not
received; 19 goods claim already made; -1 internal error (retry). Event codes also include NCA (annulment
credit note) and ENC (other credit note). `consultarDocDteCedible`: 20 type not transferable; 21 not
transferable (annulled by a credit note within 8 days); 22 no claim or receipt record; 23 transferable, no
claims; 24 not transferable (claimed by the receiver); 25 transferable (8 days elapsed, deemed received); plus
1, 2, 10, 18.

**TLS.** See D14. The receipts instructions (2021) require TLS 1.2 or later. No phase 2 host requests a client
certificate; the certificate only signs the seed and the XML.
