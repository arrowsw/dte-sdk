# dte-sdk — Phase 4b design (RCV and MIPYME backup)

Date: 2026-11-04 · Status: **approved: reviewed by Hans on 2026-11-04; rows, downloads and writes not measured** · Author: Claude (with Hans)

Starting point: the architecture and phase 1 spec, and the phase 2, 3 and 4 specs. Decisions D1–D38 and the glossaries are
the contract. The phase 5a spec, on its own branch, already holds D39–D45, so this phase takes D46–D56 and the next free
number is D57. SII facts come from private read-only runs against the real portal on 2026-11-03, from the SII's public web
client code read as text, and from field behaviour known to work against the SII; section 6 says which is which. No
third-party implementation is named in the repository; the SII behaviour is described directly.

---

## 1. Goal and scope

Phase 4b reads the purchase and sales register of the SII portal (RCV), changes how a purchase is classified in it, and
downloads the XML of issued and received documents from the MIPYME backup. It adds no login of its own: everything runs on
the phase 4 session.

**In scope**

1. **RCV reads:** the documents of a period (`consemitidosinternetui`), the official summary by accounting status
   (`consdcvinternetui`), the catalogue of purchase types and one purchase document (`complementoscvui`).
2. **RCV writes:** change the purchase type of a document, and move its VAT between recoverable and common use.
3. **MIPYME backup:** split a date range until each piece fits the 20 documents the SII allows per download, then download
   the XML, keeping it in the result or handing it to a callback.
4. **Phase 2 and 4 changes:** JSON requests in `portalRequest`, no firewall text check on structured bodies, an injectable
   `randomId`, and redaction of `conversationId`.

**Out of scope**

- `getDetalleCompra`, `getDetalleVenta` and their exports in `consdcvinternetui`: they need a reCAPTCHA v3 token, which is
  never automated or evaded.
- The asynchronous CSV exports (`getDetalleAsync`, `getDetalleRecibidosAsync`).
- `ingresarAceptacionReclamoDocs`: the phase 2 `registerClaim` covers acceptance and claims.
- MIPYME emission.

**Done when:**

1. The eight public functions are exported from the root entry only, with bilingual JSDoc that names the SII label.
2. Every flow is covered by tests against the fake SII with invented data, and coverage stays at 100 %.
3. Prettier, ESLint, `tsc`, `npm run build`, `npm run scan` and the size limit pass.
4. No file of this phase names another project.
5. The implementation is in a pull request to `canary`, owned by the session that implements it.

The live portal is **not** part of this definition, because the company at hand has no documents yet (section 6). The read
of real documents happens before the first release, alongside the smoke of
[arrowsw/dte-sdk#8](https://github.com/arrowsw/dte-sdk/issues/8). The release policy does not change: `canary` accumulates
in `Unreleased`.

---

## 2. Architecture decisions

D1–D38 stay in force. Phase 4b adds D46–D56.

### D46. This phase ports field behaviour as it is

Hans's decision of 2026-11-04: everything is ported as field behaviour known to work does it, because that at least has run
in production, and what reading the code suggests has not been measured.

- ✅ Where the SII's own web client does something else, this phase still follows field behaviour. Section 6 records each
  difference.
- ✅ Ideas for doing better stay out of this phase, to be raised when there are real documents to measure them against.
- What stays from the SDK, because it is contract or a rule of the project: `environment` is required when creating the
  client; there is no per-call `environment`; the session of phase 4 (lock, cache, login on demand); a firewall block is
  never repeated (D34); error messages carry no RUT; functions and data, English names and bilingual JSDoc; the root entry
  only (D36); the 30 s timeout per request of phase 4, which `timeoutMs` changes.

### D47. The RCV is JSON over the portal session

- ✅ The RCV services run on `PortalClient`, under `withPortalSession`, in `src/portal/rcv.ts` and the pure
  `src/portal/pages/rcv.ts` (D28, D30, D32).
- ✅ Hosts follow the client: `www4.sii.cl` in production and `www4c.sii.cl` in certification. A certification client writes
  to certification.
- ✅ A query visits the service's app first, reads the token from the jar (`TOKEN`, else `CSESSIONID`) and posts an envelope
  with the token as `conversationId`.
- ✅ `conversationId` is the session token. It is redacted in requests and responses of a capture (production answers echo
  it, measured), and text from such an answer reaches `details` only after `redactText`.

### D48. RCV answers are read as data

- ✅ Response codes are not looked at. `respEstado` is ignored and no `status` field is returned, so a month the SII refuses
  to show reads as an empty month. The JSDoc says so.
- ✅ Each row has typed English fields plus `raw`, the row as the SII sent it. The names come from the SII's client code and
  are not measured, so an absent or unreadable field is `null` and its value stays in `raw`.
- A number may arrive as a number or as a numeric string. Anything else is `null`.

### D49. One `POST` per RCV call

- ✅ A derived context keeps the same `state` object and only changes the retry of the `POST`. Login and the visit to the app
  keep their D34 retries, because they use the original context.
- ✅ Reads: `{ ...context, overrides: { retry: false, ...context.overrides } }`, so one attempt unless the caller opts in.
  They run inside `withFreshSessionRetry`, which repeats the whole read once with a fresh session.
- ✅ Writes: `{ ...context, overrides: { ...context.overrides, retry: false } }`, always one attempt, with no fresh-session
  retry and no gate or extra word.
- ✅ The details of a period run concurrently under `Promise.all`, as in the field. D30 serializes callers, not the requests
  inside one operation.

### D50. Only `'OK'` confirms a write, and VAT amounts are the caller's

- ✅ A write resolves only when the answer's `data` is exactly `'OK'`. Anything else throws `SII_PORTAL_REJECTED` with
  `rejection: 'purchaseChangeNotConfirmed'`. The JSDoc warns that the change may have applied, so read the document again with
  `fetchPurchaseDocument` before retrying.
- ✅ `metaData.errors[0].descripcion` goes in `details.portalMessage` when present. The whole answer never goes in `details`,
  because it carries the token.
- ✅ `commonUseVat` and `recoverableVat` are sent as `String(amount ?? '')`, and the JSDoc documents them as the final amount
  of each bucket after the change, not a delta.

### D51. The detail of a period uses the calls known to work

- ✅ Issued 33 and 34 use `getDetalleEmitidos3334`. Everything else, including issued documents of other types, uses
  `getDetalleRecibidos`, with `operacion` 1 for issued and 2 for received.
- ✅ `refNCD` is always `'0'`.
- [arrowsw/dte-sdk#14](https://github.com/arrowsw/dte-sdk/issues/14) compares both against real documents.

### D52. The backup reads production, whatever the client's environment

The service exists only in production: `www1.sii.cl` answers, and `maullin` and `www4c` do not.

- ✅ `downloadMipymeBackup` always goes to `https://www1.sii.cl/cgi-bin/Portal001`, also from a certification client. It takes
  no extra word and logs no warning.
- ✅ The JSDoc and the README warn that it reads real documents even from a certification client, and that a development
  environment that stores them needs its own gate.

### D53. The backup has its own retry loop

- ✅ Each listing and each download is one loop: `attempts` tries, 3 by default, waiting 1 s, 2 s, 4 s and so on, with
  `withRetry` and `portal.sleep`.
- ✅ Every request inside it runs with `retry: false`, so the two loops do not multiply.
- ✅ Repeated: what `isRetryablePortalError` accepts, and `SII_PORTAL_UNEXPECTED_PAGE`. The rest ends the run: the rejections
  below, `SII_PORTAL_BLOCKED`, a non-transient TLS failure, and a cancellation by the caller.

### D54. One alert is a verdict, several are a template

The old portal reports through `alert()`, whatever the page title says.

- ✅ A listing's total wins over anything else in the page: a valid page has `recaptcha` in it and a commented-out alert
  (measured).
- ✅ Without a total or an XML answer, a pure function decides, in this order:

| Page | Result |
|---|---|
| `recaptcha` and no alerts | `backupCaptcha` |
| More than one alert | `backupIndeterminate`, with `details.portalMessages` |
| One alert with "no existe información" | `backupNoData`, with `details.portalMessage` |
| One alert with "captcha" | `backupCaptcha`, with `details.portalMessage` |
| Any other single alert | `backupRefused`, with `details.portalMessage` |
| No alert and "Seleccionar empresa" | `backupNoCompany` |
| Anything else | `SII_PORTAL_UNEXPECTED_PAGE`, which is repeated |

- The alert "Usuario no está autenticado" (measured, HTTP 200) therefore reads as `backupRefused`.
- No data is definitive. Indeterminate and captcha mean try later, never in a loop.

### D55. The range is split before anything is downloaded

The SII allows 20 documents per download: 20 answer XML, 21 answer an error page.

- ✅ The plan comes first, then the downloads, so a day that cannot be downloaded throws before any download.
- ✅ No `received` or `complete` fields are returned.
- ✅ **Known defect, kept and pinned by a test:** a two-day range with more than 20 documents has its midpoint on the first
  day, so it counts by type over both days but records the first day as the end. The second day is not downloaded and `total`
  still counts it. The README and the JSDoc say so.
- ✅ **Kept, and pinned by a test:** with a `type` from the caller, a day over 20 documents still splits across every type of
  the list.

### D56. A document is not a firewall page

- ✅ When the body starts with `<?xml`, `{` or `[`, the firewall's text check is skipped, so a document that says "acceso
  restringido" does not abort a download. HTTP 403 still blocks.

---

## 3. Phase 4b — detailed design

### 3.1 `src/` layout

```
src/
  catalogs/portal.ts        RCV hosts and app URLs, the three services, backup base URL, SII codes, new rejections
  portal/
    rcv.ts                  listPeriodDocuments, fetchRegisterSummary, listPurchaseTypes, fetchPurchaseDocument,
                            changePurchaseType, moveVatToCommonUse, moveVatToRecoverable
    backup.ts               downloadMipymeBackup
    pages/
      rcv.ts                row types and pure mappers from the SII's JSON
      backup.ts             the listing total, the XML check and the verdict of D54
```

Existing files that change:

| File | Change |
|---|---|
| `src/portal/session.ts` | `portalRequest` accepts `json`; structured bodies skip the firewall text (D56); the block's message goes through `redactText` |
| `src/portal/client.ts` | `randomId` option, `crypto.randomUUID` by default, read only on use; `siiCodeOf`, which turns a value of the caller into a code of the SII or `INVALID_OPTION { field }` |
| `src/catalogs/portal.ts` | see above |
| `src/sii/capture.ts` | `redactText` also hides `"conversationId":"..."` |
| `src/errors.ts` | `SAFE_DETAIL_KEYS` gains `day`, `listed`, `covered` |
| `src/time/chile.ts`, `src/books/common.ts` | `isPeriod` moves next to `isIsoDate`, and the books use it |
| `src/index.ts` | re-exports of section 3.7 |
| `tests/public-api.test.ts`, `tests/dist.smoke.test.ts`, `tests/live/portal.live.test.ts` | new exports; read-only live additions |
| `.size-limit.json`, `README.md`, `llms.txt`, `CHANGELOG.md`, `docs/decisions/entry-points.md` | size and documentation |

### 3.2 Request layer

`portalRequest` takes `json` as an alternative to `form`. The body is `JSON.stringify(json)` in UTF-8, and the headers are
`User-Agent`, `Accept: application/json, text/plain, */*`, `Accept-Language`, `Content-Type: application/json`, `Origin`,
`Referer` and `Cookie`, with no `Sec-Fetch-*`. These got good answers in both environments (measured).

The transports do not follow redirects and neither does the request of a query: an answer that is not JSON is
`SII_PORTAL_UNEXPECTED_PAGE`, with its text in `details`, after `redactText`.

Flow of a query:

1. `withPortalSession` (D30).
2. `ensurePage` on the app, with its trailing slash. Cold, that is a 302 to `zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?{query}`
   (measured), which `ensurePage` handles. The `consdcvinternetui` page contains "Autenticaci", which is harmless because no
   redirect led there.
3. The token is `TOKEN`, else `CSESSIONID`. Neither is `SII_PORTAL_UNEXPECTED_PAGE`.
4. `POST` the envelope `{ metaData: { namespace, conversationId, transactionId, page }, data }`, with `Referer` set to the app
   of the service called.

| Service | Visit first | `transactionId` | `page` | URL path |
|---|---|---|---|---|
| consemitidos | `consemitidosinternetui/` | UUID | `null` | `/consemitidosinternetui/services/data/facadeService/{method}` |
| consdcv | `consdcvinternetui/` | UUID | `null` | `/consdcvinternetui/services/data/facadeService/getResumen` |
| complementos | `consdcvinternetui/` | `'1'` | `{ pageSize: 1, pageIndex: 1 }` | `/complementoscvui/services/data/facadeServiceCompCompraService/{method}` |

Namespaces:

- `cl.sii.sdi.lob.diii.consemitidos.data.api.interfaces.FacadeService/{method}`
- `cl.sii.sdi.lob.diii.consdcv.data.api.interfaces.FacadeService/getResumen`
- `cl.sii.sdi.lob.diii.dcv.data.api.interfaces.compcompra.FacadeServiceCompCompra/{method}`

An answer that parses to something other than an object is treated like one that does not parse.

### 3.3 RCV reads

```ts
type DocumentDirection = 'issued' | 'received'
type RegisterOperation = 'purchase' | 'sale'
type AccountingStatus = 'registered' | 'pending' | 'notIncluded' | 'claimed'

listPeriodDocuments(portal, input: ListPeriodDocumentsInput, overrides?): Promise<PeriodDocuments>
fetchRegisterSummary(portal, input: RegisterSummaryInput, overrides?): Promise<RegisterSummary>
listPurchaseTypes(portal, overrides?): Promise<readonly PurchaseType[]>
fetchPurchaseDocument(portal, key: PurchaseDocumentKey, overrides?): Promise<PurchaseDocument | null>

type ListPeriodDocumentsInput = { readonly period: string; readonly direction?: DocumentDirection; readonly companyRut?: string }
type PeriodDocuments = { readonly summary: readonly PeriodSummaryRow[]; readonly documents: readonly PeriodDocument[] }
type RegisterSummaryInput = {
  readonly period: string
  readonly operation: RegisterOperation
  readonly accountingStatus?: AccountingStatus
  readonly companyRut?: string
}
type RegisterSummary = { readonly rows: readonly RegisterSummaryRow[]; readonly header: RegisterHeader | null }
type PurchaseDocumentKey = {
  readonly type: number
  readonly folio: number
  readonly period: string
  readonly counterpartyRut: string
  readonly companyRut?: string
}
```

Input rules:

- `period` is always `YYYY-MM`; otherwise `INVALID_DATE { field: 'period' }`. It converts to `AAAAMM` where the SII wants it.
- `direction` defaults to `'issued'`, and maps to `operacion` 1 or 2. Another value is `INVALID_OPTION { field: 'direction' }`.
- `operation` maps to `COMPRA` or `VENTA`. `accountingStatus` defaults to `'registered'` and maps to `REGISTRO`, `PENDIENTE`,
  `NO_INCLUIR` or `RECLAMADO`. Other values are `INVALID_OPTION { field }`.
- `counterpartyRut` goes through `toSiiRut(value, 'counterpartyRut')` and splits into `rutContraparte`, `dvContraparte`.
- The company comes from `resolvePortalCompany` and goes as body and verifier.

**`listPeriodDocuments`:**

1. `getResumen` with `{ periodo: 'YYYY-MM', rutContribuyente, dvContribuyente, operacion }`. Rows come from
   `data.resumenDte`.
2. No rows: `{ summary: [], documents: [] }`, with no more requests.
3. One detail per row, under `Promise.all`, with the method of D51 and the data
   `{ tipoDoc, rut, dv, periodo, operacion, derrCodigo, refNCD: '0' }`, where `tipoDoc` and `derrCodigo` are the row's type as
   text. Rows come from `dataResp.detalles`, and a missing list is empty.
4. Each document takes `type` from the summary row, and `typeDescription` from its own `descTipoDoc`, else from the row's
   `tipoDocDesc`.

The JSDoc says that this is not the official register and that a refused month reads as empty (D48).

**`fetchRegisterSummary`:** `getResumen` with
`{ rutEmisor, dvEmisor, ptributario: 'AAAAMM', estadoContab, operacion, busquedaInicial: true }`. Rows come from `data`, the
header from `dataCabecera`. Measured with no documents: `data: null`, which reads as `{ rows: [], header: null }`.

**`listPurchaseTypes`:** `obtieneTiposTransaccionCompra` with `data: null`; rows come from `data`. The JSDoc of
`interchangeable` says what the SII's client does: it offers moving VAT between recoverable and common use only when true.

**`fetchPurchaseDocument`:** `obtieneDetalleDocumento` with the data below; the document comes from `data`, or `null`.

Complement data, in this order: `{ rut, dv, operacion: 'COMPRA', tipoDocumento, numeroDocumento, periodoTributario: 'AAAAMM', rutContraparte, dvContraparte }`,
with `tipoCompra`, or `ivaComun` and `ivaRec`, after `periodoTributario`.

Row types, with `number | null` for amounts, counts and codes and `string | null` for text. Every row with `raw` keeps the
object the SII sent:

| Type | Fields |
|---|---|
| `PeriodSummaryRow` | `type` tipoDoc, `typeDescription` tipoDocDesc, `section` seccion, `documentCount` totalDoc, `exemptAmount` mntExento, `netAmount` mntNeto, `vatAmount` mntIVA, `totalAmount` mntTotal, `raw` |
| `PeriodDocument` | `type`, `typeDescription`, `folio`, `issueDate` fechaEmision, `receivedDate` fechaRecepcion, `counterpartyRut` rutReceptor + dvReceptor, `counterpartyName` rznSocRecep, `exemptAmount` mntExento, `netAmount` mntNeto, `vatAmount` mntIva, `totalAmount` mntTotal, `eventOrder` dehOrdenEvento, `eventDescription` dehDescripcion, `raw` |
| `RegisterSummaryRow` | `type` rsmnTipoDocInteger, `typeName` dcvNombreTipoDoc, `documentCount` rsmnTotDoc, `exemptAmount` rsmnMntExe, `netAmount` rsmnMntNeto, `vatAmount` rsmnMntIVA, `commonUseVat` rsmnIVAUsoComun, `nonRecoverableVat` rsmnMntIVANoRec, `totalAmount` rsmnMntTotal, `raw` |
| `RegisterHeader` | `updatedAt` dcvFecModificacion, `proportionalityFactor` dcvFctProp, `raw` |
| `PurchaseType` | `id`, `description` descripcion, `interchangeable` intercambiable |
| `PurchaseDocument` | `type` det_tipo_doc, `folio` det_nro_doc, `businessName` det_rzn_soc, `createdAt` det_fec_creacion, `exemptAmount` det_mnt_exe, `netAmount` det_mnt_neto, `vatAmount` det_mnt_iva, `commonUseVat` det_iva_uso_comun, `nonRecoverableVat` det_monto_iva_no_r, `totalAmount` det_mnt_total, `purchaseType` det_tipo_transaccion, `raw` |

- `counterpartyRut` joins `rutReceptor` and `dvReceptor` with a hyphen, with no validation, and is `null` when either is
  missing. In received documents it holds the issuer.
- `eventOrder`: 2 acknowledged, 3 accepted, 4 claimed. Not measured.
- `PurchaseType` is measured, so it has no `raw`: `id` is text and `interchangeable` is a boolean.

### 3.4 RCV writes

```ts
changePurchaseType(portal, input: ChangePurchaseTypeInput, overrides?): Promise<void>
moveVatToCommonUse(portal, input: MoveVatInput, overrides?): Promise<void>
moveVatToRecoverable(portal, input: MoveVatInput, overrides?): Promise<void>

type ChangePurchaseTypeInput = PurchaseDocumentKey & { readonly purchaseType: string }
type MoveVatInput = PurchaseDocumentKey & { readonly commonUseVat?: number; readonly recoverableVat?: number }
```

The methods are `cambiaTipoCompra`, `cambiaIvaRec2Comun` and `cambiaIvaComun2Recuperable`. `purchaseType` is an `id` from
`listPurchaseTypes`. D49 and D50 say the rest. The JSDoc of each write says that it changes the real register when the client
is in production.

### 3.5 MIPYME backup

```ts
downloadMipymeBackup(portal, input: MipymeBackupInput, overrides?): Promise<MipymeBackup>

type MipymeBackupInput = {
  readonly from: string
  readonly to: string
  readonly direction?: DocumentDirection
  readonly type?: number
  readonly attempts?: number
  readonly onChunk?: (chunk: MipymeDownloadedChunk) => Promise<void> | void
  readonly companyRut?: string
}
type MipymeDownloadedChunk = { readonly from: string; readonly to: string; readonly total: number; readonly xml: string }
type MipymeBackupChunk = {
  readonly from: string
  readonly to: string
  readonly total: number
  readonly type?: number
  readonly xml?: string
}
type MipymeBackup = { readonly total: number; readonly chunks: readonly MipymeBackupChunk[] }
```

The whole run is one `withPortalSession` (D30):

1. **Validate.** `from` and `to` with `isIsoDate`, otherwise `INVALID_DATE { field }`. `direction` defaults to `'issued'` and maps to `ENV` or `RCP`; another value is `INVALID_OPTION { field: 'direction' }`. `attempts` must be positive, otherwise `INVALID_OPTION { field: 'attempts' }`. `from` after `to` is not checked: the SII answers it.
2. **Company.** `resolvePortalCompany` and `companyFields`.
3. **Session check.** `ensurePage(context, 'session', cgiUrl('certification', 'ad_empresa1'))`, on maullin whatever the environment, keeping the retries of a login.
4. **Cookie.** Add `usa_firma_central=true` to the jar. It stays in the saved session.
5. **Plan**, then **download**.

**List.** `POST {base}/lista_documentos.cgi`, with `Origin` and `Referer` set to that URL, and these fields in this order:
`recaptcha-response: ''`, `ORIGEN`, `FEC_DESDE`, `FEC_HASTA`, `NUM_PAG: '1'`, `TPO_ARCHIVO: 'dte'`, `RUT_EMP`, `DV_EMP`,
`RUT_RECP: ''`, `FOLIO: ''`, `FOLIOHASTA: ''`, `RZN_SOC: ''`, `TPO_DOC`, `ESTADO: ''`, `ORDEN: ''`. The total is
`/total de documentos[^0-9]{0,40}(\d+)/i`. `FOLIO` and `FOLIOHASTA` stay empty, because third-party notes say they clear
`FEC_HASTA` silently.

**Download.** `GET {base}/download.cgi?RUT_EMP&DV_EMP&RUT_RECP&FOLIO&FOLIOHASTA&RZN_SOC&TPO_DOC&ESTADO&ORDEN&ORIGEN&FEC_DESDE&FEC_HASTA&DOWNLOAD=XML`,
with the listing as `Referer`. The body must `trimStart().startsWith('<?xml')`. It decodes as Latin-1 under the existing
charset rule. Neither request follows redirects.

`TPO_DOC` is the caller's `type` as text, empty when absent, or the type of a piece split by type.

**Plan.** The limit is 20. The types of a split are `[33, 34, 46, 56, 61, 52, 110, 111, 112]`. For a range `d..h`:

1. `n` is the count of the range. With 0, nothing. With `n <= 20`, the piece `{ from: d, to: h, total: n }`.
2. The midpoint is the mean of the two UTC midnights, as `toISOString().slice(0, 10)`.
3. When the midpoint is `d` or `h`, count by type over `d..h`:
   - A type with 0 is skipped.
   - A type over 20 throws `backupDayOverLimit { day, type, listed }`.
   - Otherwise it adds `{ from: d, to: d, total: nType, type }`.
   - When the types cover less than `n`, it throws `backupDayUnknownTypes { day, listed, covered }`.
4. Otherwise the plan continues with `d..midpoint`, then the day after the midpoint up to `h`.

**Download of the plan.** A stable sort by `from`, descending, so the newest documents come first. Then one by one:
`total` adds the piece's total, and with `onChunk` the callback is awaited with `{ from, to, total, xml }` and the chunk keeps
no `xml`. Without it, `xml` goes in the chunk. `onChunk` gets no `type`. An error thrown by `onChunk` ends the run and is not
repeated.

### 3.6 Errors

No new codes. `PortalRejection` gains these, with Spanish messages in `PORTAL_REJECTIONS`:

| Rejection | When | `details` beyond `rejection`, `operation` |
|---|---|---|
| `backupCaptcha` | the SII turned the captcha on | `portalMessage?` |
| `backupIndeterminate` | several alerts: no verdict | `portalMessages` |
| `backupNoData` | the SII says it has no information for that RUT | `portalMessage` |
| `backupRefused` | any other single alert | `portalMessage` |
| `backupNoCompany` | the entry page with no message: cause unknown | none |
| `backupDayOverLimit` | one day and one type over 20 | `day`, `type`, `listed` |
| `backupDayUnknownTypes` | one day over 20, with types outside the list | `day`, `listed`, `covered` |
| `purchaseChangeNotConfirmed` | a write that did not answer `'OK'` | `portalMessage?` |

`SAFE_DETAIL_KEYS` gains `day`, `listed` and `covered`: a date and two numbers. `portalMessage` may hold a RUT, so it stays in
`details`, never in `message`.

### 3.7 Public API additions

Runtime exports added to the root and to `RUNTIME_EXPORTS`:

- **RCV:** `listPeriodDocuments`, `fetchRegisterSummary`, `listPurchaseTypes`, `fetchPurchaseDocument`, `changePurchaseType`,
  `moveVatToCommonUse`, `moveVatToRecoverable`.
- **Backup:** `downloadMipymeBackup`.

Types:

- **RCV:** `DocumentDirection`, `RegisterOperation`, `AccountingStatus`, `ListPeriodDocumentsInput`, `PeriodDocuments`,
  `PeriodSummaryRow`, `PeriodDocument`, `RegisterSummaryInput`, `RegisterSummary`, `RegisterSummaryRow`, `RegisterHeader`,
  `PurchaseType`, `PurchaseDocumentKey`, `PurchaseDocument`, `ChangePurchaseTypeInput`, `MoveVatInput`, `RcvObject`.
- **Backup:** `MipymeBackupInput`, `MipymeBackup`, `MipymeBackupChunk`, `MipymeDownloadedChunk`.
- **Client:** `PortalClientOptions.randomId` and `PortalClient.randomId` are new fields.

### 3.8 Typical flows

```ts
const portal = createPortalClient({ environment: 'production', certificate, companyRut: '76543210-3' })

// Every document issued in a month, with no XML
const { summary, documents } = await listPeriodDocuments(portal, { period: '2026-10' })

// The official totals, by accounting status
const { rows, header } = await fetchRegisterSummary(portal, { period: '2026-10', operation: 'purchase' })

// Reclassify a purchase; on a failure the change may have applied, so read it again before retrying
const types = await listPurchaseTypes(portal)
const key = { type: 33, folio: 1234, period: '2026-10', counterpartyRut: '12345678-5' }
await changePurchaseType(portal, { ...key, purchaseType: '4' })
const document = await fetchPurchaseDocument(portal, key)

// Move all the VAT to common use: final amounts, not a delta
await moveVatToCommonUse(portal, { ...key, commonUseVat: 19000 })

// The XML of received documents, written as it arrives; this reads production from any client
await downloadMipymeBackup(portal, {
  from: '2026-10-01',
  to: '2026-10-31',
  direction: 'received',
  onChunk: async ({ from, to, xml }) => saveBackup(`${from}_${to}.xml`, xml),
})

await closePortalSession(portal)
```

### 3.9 Tests

With `signedIn`, `portalWith` and `failure` from `tests/support/portal.ts`, and invented data.

- **`tests/portal/pages-backup.test.ts`:** the verdict table of D54, the total, and the XML check. A commented-out alert does
  not count.
- **`tests/portal/pages-rcv.test.ts`:** each row mapper, with numeric strings, absent fields and values that stay in `raw`.
- **`tests/portal/backup.test.ts`:**
  - One piece when it fits. Several pieces when it does not, none over 20, with no gaps or overlaps, the same total as the XML.
  - A day over 20 for one type throws before any download, and types outside the list too.
  - A split by type. The two-day defect. A caller's `type` still splits across every type.
  - Transient failures recover, waiting 1 s and 2 s through the injected `sleep`. A rejection and a block are not repeated. An
    unreadable page is repeated.
  - Captcha, an alert that wins over the title, a commented-out alert, several alerts, indeterminate is not no-data, an
    unknown alert kept literally, and the entry page with no alert.
  - Newest first. `onChunk` keeps no `xml` and gets no `type`.
  - Invalid dates, direction and attempts. A certification client still goes to `www1`. The field order and the cookie.
- **`tests/portal/rcv.test.ts`:**
  - The envelope and URL of each service, and the host of each environment.
  - `refNCD: '0'`, `getDetalleRecibidos` for an issued 61, `getDetalleEmitidos3334` for 33 and 34, and an empty summary makes no
    more requests.
  - A `99` reads as empty. A token missing. A non-JSON answer, retried once with a fresh session on reads and never on writes.
  - Only `'OK'` confirms, with `portalMessage` when present and no token in `details`.
- **Request layer:** in `tests/portal/session.test.ts`, JSON headers, no `Sec-Fetch-*`, XML and JSON skip the text check, and a
  403 still blocks. In `tests/portal/rcv.test.ts`, reads can opt into retries, writes cannot, and the visit to the app keeps its
  retries, which is the context a login runs in.
- **Capture:** `conversationId` redacted in the request and the response.
- **Public surface:** `tests/public-api.test.ts` and `tests/dist.smoke.test.ts`.
- **Live smoke:** `tests/live/portal.live.test.ts`, guarded by `SII_LIVE=1`, gains reads only. A refusal counts as an answer.
  Never a write. The backup reads production even from the certification client that test uses, and nothing from it is
  committed.

### 3.10 Documentation and size

- `CHANGELOG.md` under `[Unreleased]`, a section in `README.md`, `llms.txt`, and the portal section of `src/index.ts`.
- The README and the JSDoc carry the production warning of D52, the known defect of D55, the final amounts of D50, and that a
  refused month reads as empty (D48).
- `.size-limit.json` follows the rule of D36: the measured size rounded up to the next 2 kB. `docs/decisions/entry-points.md`
  gains the measured row.
- The documentation site lives in its own repository and is delivered by hand, so it is not part of this work.

The code of the plan was built and run before the plan was written: 1 830 tests pass with coverage at 100 % on the four
metrics, and the bundle measures ESM 47.92 kB and CJS 48.11 kB, so `.size-limit.json` goes to 50 kB. Phase 5a raises that limit
too, so whichever lands second measures again.

---

## 4. Glossary additions (public contract)

**`consemitidosinternetui` → `PeriodSummaryRow`, `PeriodDocument`**
periodo `period` · operacion 1 emitidos, 2 recibidos `direction` · tipoDoc `type` · tipoDocDesc, descTipoDoc `typeDescription` ·
seccion `section` · totalDoc `documentCount` · mntExento `exemptAmount` · mntNeto `netAmount` · mntIVA, mntIva `vatAmount` ·
mntTotal `totalAmount` · folio `folio` · fechaEmision `issueDate` · fechaRecepcion `receivedDate` · rutReceptor, dvReceptor
`counterpartyRut` · rznSocRecep `counterpartyName` · dehOrdenEvento `eventOrder` · dehDescripcion `eventDescription`.

**`consdcvinternetui` → `RegisterSummaryRow`, `RegisterHeader`**
ptributario `period` · operacion COMPRA, VENTA `operation` · estadoContab REGISTRO, PENDIENTE, NO_INCLUIR, RECLAMADO
`accountingStatus` · rsmnTipoDocInteger `type` · dcvNombreTipoDoc `typeName` · rsmnTotDoc `documentCount` · rsmnMntExe
`exemptAmount` · rsmnMntNeto `netAmount` · rsmnMntIVA `vatAmount` · rsmnIVAUsoComun `commonUseVat` · rsmnMntIVANoRec
`nonRecoverableVat` · rsmnMntTotal `totalAmount` · dcvFecModificacion `updatedAt` · dcvFctProp `proportionalityFactor`.

**`complementoscvui` → `PurchaseType`, `PurchaseDocument`**
tipo de compra, tipoCompra, det_tipo_transaccion `purchaseType` · descripcion `description` · intercambiable `interchangeable` ·
det_rzn_soc `businessName` · det_fec_creacion `createdAt` · det_iva_uso_comun, ivaComun `commonUseVat` · det_monto_iva_no_r
`nonRecoverableVat` · ivaRec `recoverableVat` · rutContraparte, dvContraparte `counterpartyRut`.

**Respaldo MIPYME → `MipymeBackup`**
ORIGEN ENV, RCP `direction` · FEC_DESDE `from` · FEC_HASTA `to` · TPO_DOC `type` · tramo `chunk`.

---

## 5. Decisions reviewed with Hans

Sections 1 to 4 of the design were approved one by one on 2026-11-04. Every question stated what field behaviour does.

| # | Decision | Outcome |
|---|---|---|
| 1 | Everything is ported as field behaviour does it; improvements stay out (D46) | Hans's |
| 2 | Issued documents other than 33 and 34 use `getDetalleRecibidos` with `operacion: 1` (D51) | Decided; #14 verifies |
| 3 | `refNCD` is always `'0'` (D51) | Decided; #14 verifies |
| 4 | Only `'OK'` confirms a write, and the JSDoc warns the change may have applied (D50) | Decided |
| 5 | VAT amounts as the caller gives them, `''` when absent, documented as final (D50) | Decided |
| 6 | RCV response codes are not looked at, and there is no `status` field (D48) | Decided |
| 7 | A backup from a certification client runs against production; JSDoc and README warn, with no `logger.warn` (D52) | Decided |
| 8 | A day that cannot be downloaded throws before any download (D55) | Decided |
| 9 | The two-day behaviour is ported, kept as a known defect and pinned by a test (D55) | Decided |
| 10 | No `received` or `complete` fields (D55) | Decided |
| 11 | Writes: one attempt, no gate, no extra word (D49) | Decided |
| 12 | Rows are typed English fields plus `raw` (D48) | Decided |
| 13 | The retry rule, the date validation and the 30 s timeout stay as the SDK has them (D46, D53) | Approved with the backup section |
| 14 | Scope and API; request layer and RCV flows; backup and errors; tests, documentation and done when | Approved section by section |

Nothing is left open in the design. What remains is measuring it (section 6).

---

## 6. What is measured and what is not

**Measured against the real SII on 2026-11-03, with a real certificate and a company with no documents: 40 requests, no errors,
the default TLS 1.2 transport and the flat jar.**

- Login sets `TOKEN`, `CSESSIONID`, `RUT_NS`, `DV_NS`, `NETSCAPE_LIVEWIRE.*` and `X-SII-STATE-*`. The flat jar works across `www4`,
  `www4c`, `www1`, `maullin`, `misiir` and `zeusr`. `autTermino.cgi` clears them.
- An authenticated app shell answers 200 `text/html;charset=UTF-8`, and sets more cookies.
- A cold `lista_documentos.cgi` answers HTTP 200 in ISO-8859-1, titled "Error al contribuyente", with one alert "Usuario no está
  autenticado".
- A valid listing page is titled "RESPALDO DE ARCHIVOS MIPYME", has the total, has `recaptcha` and has a commented-out alert. Issued and
  received were 0 over 90 days.
- `consemitidos` `getResumen` in production: `{ data: { resumenDte: [], datosAsync: null }, metaData, respEstado: { codRespuesta: 0 } }`,
  `application/json;charset=utf-8`, for the 6 months tried, in both directions. `metaData` echoes the token.
- `consdcv` `getResumen` in production: `{ data: null, dataCabecera: null, metaData, respEstado: { codRespuesta: 3 } }` for all states.
- In certification, `www4c` answers `consemitidos` with `99` "Usuario no autorizado" and `consdcv` with `99` "Autenticado no esta
  autorizado para consultar", which holds a RUT.
- The catalogue of purchase types, the same in both environments, with no `respEstado`: 1 Del Giro false, 2 Supermercados true, 3
  Bienes Raíces true, 4 Activo Fijo true, 5 IVA Uso Común false, 6 IVA no Recuperable false, 7 No Corresp. Incluir false.

**Read from the SII's public web client code, not measured:** the names of every field of `resumenDte`, `detalles`, the `consdcv` `data` and
`dataCabecera`, and `obtieneDetalleDocumento`.

**Known from field behaviour, not measured:** that the backup exists only in production, the limit of 20 per download, the alerts of
`lista_documentos.cgi` other than the one above, `download.cgi`, every write, and the meaning of `eventOrder`.

**Where the SII's web client differs from this phase (D46):**

| Point | This phase | The SII's web client | Until measured |
|---|---|---|---|
| Detail of issued documents other than 33 and 34 | `getDetalleRecibidos` | `getDetalle` | #14 |
| `refNCD` | always `'0'` | the summary row's value | #14 |
| Write confirmation | `data === 'OK'` | any non-null `data`; errors with `data` present are a warning | the JSDoc warns the change may have applied |
| VAT amounts | as the caller gives them | the current amounts it read | the JSDoc documents final amounts |
| Response codes | ignored | shown to the user | a refused month reads as empty, and the JSDoc says so |

To close this, before the **first release that ships phase 4b** (merging to `canary` publishes nothing): with the first real document, the
private read-only probe runs again, alongside the smoke of #8, and #14 is answered. The verification of activities pending for the company
should not change this, since production answered "no data" and not a refusal.
