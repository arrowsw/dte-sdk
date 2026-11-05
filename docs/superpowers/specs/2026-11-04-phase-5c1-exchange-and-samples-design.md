# dte-sdk — Phase 5c-1 design (certification: the exchange and the printed samples)

Date: 2026-11-04 · Status: **written on Hans's go-ahead after the five design sections were approved in chat; the split (D76), the certification-only exchange documents (D77) and the samples handed in by the caller (D78) were his decisions; amended the same day by what the plan's code settled (sections 3, 5 row 5, 6 and the appendix)** · Author: Claude (with Hans)

Starting point: the phase 5b-2 spec (D65–D75), the phase 4 spec (the portal session) and the phase 5a spec (the printed
samples). Decisions continue at D76. SII facts come from the public "Manual para empresas usuarias, ambiente de
certificación factura electrónica" (2009) and from field behaviour known to carry a certification through the exchange
and the printed samples on the SII's GWT portals; section 6 says which is which and what this SDK has never seen. No
third-party implementation is named in the repository; the SII behaviour is described directly.

---

## 1. Goal and scope

Phase 5b-2 runs the HTML side of the certification portal and stops at the exchange. Phase 5c-1 does the two steps the
SII moved to its GWT portals: the exchange of information (download the exchange set, answer it with the reception
response, the receipts and the commercial approval, upload the three and confirm) and the upload of the printed samples
for the SII's automatic format validator. With them, `runCertification` reaches the declaration of compliance on its own.
The receipts certification track (phase 5c-2) is a separate portal and a separate spec.

**In scope**

1. **A GWT-RPC codec** (`src/portal/gwt.ts`): the wire format of the SII's GWT portals, built from a typed description
   of each call and parsed back; the discovery of the permutation and policy hashes.
2. **Raw requests on the phase 4 session:** multipart bodies and `text/x-gwt-rpc` posts with the session cookies, the
   server verified.
3. **Page modules** for the two portals' answers (`src/portal/pages/exchange.ts`, `src/portal/pages/samples.ts`).
4. **Portal operations** (`src/portal/exchange.ts`, `src/portal/samples.ts`): the exchange set download, the user
   validation, the three uploads, the confirmation; the samples review (read, create or resume, upload each PDF,
   submit, re-read, detail).
5. **The exchange generator** (`src/certification/exchange.ts`): the three signed XML answers from the downloaded set,
   with the field's rules.
6. **Steps and runner:** `runExchange`, `uploadPrintedSamples`; `runCertification` runs the `exchange` and
   `printedSamples` stages and stops in front of the samples when it has none.
7. **`readPrintedSamples(dir)`** in `dte-sdk/pdf`: what `writePrintedSamples` wrote, as the samples the step takes.
8. **Tests** on a synthetic GWT portal; the `dte-sdk/portal` size limit raised by the D36 rule.

**Out of scope** (and where it goes)

- The receipts certification (`certBolElectDteInternet`, the production folio page check, the receipts set and RCOF):
  phase 5c-2.
- Answering received DTEs in production (a general `RespuestaDTE`/`EnvioRecibos` builder): a later phase; here the
  documents are the certification's (D77).
- Rendering the samples: phase 5a (`dte-sdk/pdf`); this phase only uploads what the caller rendered (D78).
- The exchange by e-mail the 2009 manual describes: the field uses the portal.
- Improvements over field behaviour (section 7).

---

## 2. Architecture decisions

### D76. Two phases: 5c-1 exchange and samples, 5c-2 receipts

The exchange and the printed samples finish the DTE certification the runner of 5b-2 carries; the receipts
certification is another track on another portal, with its own set, folios, RCOF and declaration. Each gets a spec and
a plan a reviewer can hold. (Hans's choice, 2026-11-04.)

### D77. The exchange documents are the certification's

`createExchangeAnswers` builds the reception response, the receipts envelope and the commercial approval from the
downloaded set with fixed rules: a document is received and accepted when its receiver is the company, otherwise
refused; every document gets a receipt. The field has only this generator; a general builder for production waits for
a phase of its own. (Hans's choice.)

### D78. The samples come from the caller

`uploadPrintedSamples` takes the PDFs as data (`{ fileName, bytes }`), rendered before with `renderPrintedSamples` or
`writePrintedSamples` of `dte-sdk/pdf`; `readPrintedSamples(dir)` reads a directory those wrote. `dte-sdk/portal` never
touches `pdf-lib` or `bwip-js`, and the runner stays pure. The field walks a directory of PDFs in a phase of its own.
(Hans's choice.)

### D79. One GWT-RPC codec, on the phase 4 session, with the server verified

The two portals share the session cookies of the certificate login (`NETSCAPE_LIVEWIRE.*`), so their operations run
inside `withPortalSession` with the phase 4 transport: TLS 1.2 and the server verified, as every portal call today. One
module builds every request body from a typed call description and parses every answer; the field writes each body as a
literal string and copies the answer parser four times, and disables the server verification for the GWT hosts. The
bytes on the wire are the same.

### D80. The GWT hashes are discovered at run time, with the known pair as fallback and an override

A GWT portal only answers a request that names its current permutation (`X-GWT-Permutation`) and serialization policy
(the second string of every body). Both change when the SII redeploys the portal. For both portals the module reads
`<module>.nocache.js` and `<permutation>.cache.html` on the way in, keeps the pair known to work when the discovery
fails, and takes a pair from the options when the caller knows better. The field discovers only for the samples portal
and hard-codes the exchange portal's pair.

### D81. The exchange XML as the field writes it

The three answers are single-line XML without an XML declaration, encoded as UTF-8, signed with rsa-sha1 and sha1
through the enveloped transform only, `KeyValue` and `X509Data` in `KeyInfo`, the signature as the next sibling of
the signed element. That is what passed the SII's exchange review; the rest of the SDK's documents open with an
ISO-8859-1 declaration, but this upload does not go through `uploadEnvelope`, and the content is Latin-1 safe either
way. The signatures wrap their base64 at 76 columns, as every signature of the SDK does; the document around them is
one line.

### D82. Chile dates and times

`FchRecep`, `TmstFirmaResp`, `TmstFirmaRecibo` and `TmstFirmaEnv` come from `chileTimestamp(now)`. The field takes the
process clock in local time.

### D83. The runner runs both stages and stops only in front of what it lacks

At `exchange` the runner runs `runExchange` and moves to `printedSamples`; there it uploads the samples when the options
give them and moves to `compliance`, or stops with `stopped: 'printedSamples'`. The declaration of compliance keeps
needing `declareCompliance: true` (D75). A set the portal does not deliver, a company the portal says is not in the
exchange, a review the portal blocks or rejects, come back as data with the state saved.

### D84. Field defects not copied

Section 7 lists them: the RUT normalisation that differs from call to call (here every RUT goes through `rut.ts`), a
phase reported as a success with nothing uploaded, timestamps in local time, the server verification disabled, the
long-id range that differs between code paths.

### D85. Size: the `dte-sdk/portal` limit by the D36 rule

The entry stands at 39.35 kB with phase 5b-1 and grows with the 5b-2 runner; this phase adds the codec, two page
modules, two operation modules, the generator and two steps. The limit is set from the measurement at the plan's tip,
and `dte-sdk/pdf` grows by the reader only. Measured: `dte-sdk/portal` 62.47 kB, so the limit goes to 64 kB (the next
2 kB); `dte-sdk/pdf` 8.45 kB, the 10 kB limit unchanged.

### D86. Entries

Everything of this phase is exported from `dte-sdk/portal`, except `readPrintedSamples`, which lives next to
`writePrintedSamples` in `dte-sdk/pdf` (Node, the optional peers untouched: it only reads files).

---

## 3. Phase 5c-1 — detailed design

### 3.1 `src/` layout

```
src/portal/gwt.ts                                 the GWT-RPC codec: call description → body, answer → table and values; hash discovery
src/portal/session.ts                             (modify) portalRequest takes a raw body and its content type
src/portal/pages/exchange.ts                      the exchange portal's answers: set download, user validation, upload pages, confirmation
src/portal/pages/samples.ts                       the samples portal's answers: review state and id, blocking message, detail table
src/portal/exchange.ts                            downloadExchangeSet, validateExchangeUser, uploadExchangeAnswers, confirmExchange
src/portal/samples.ts                             readSamplesReview, createSamplesReview, uploadSample, submitSamplesReview, readSamplesDetail
src/certification/exchange.ts                     createExchangeAnswers and the set parsing
src/certification/exchange-step.ts                runExchange
src/certification/samples-step.ts                 uploadPrintedSamples
src/certification/runner.ts                       (modify) the exchange and printedSamples stages
src/certification/state.ts                        (modify) exchange and samples in the state
src/certification/runtime.ts                      (modify) the new progress events
src/catalogs/certification.ts                     (modify) the step names, the GWT constants
src/catalogs/portal.ts                            (modify) rejections exchangeUploadRefused, sampleUploadRefused
src/pdf/node-samples.ts                           (modify) readPrintedSamples
```

Also touched: `src/portal/index.ts`, `src/pdf/index.ts`, `tests/public-api.test.ts`, `tests/types.test.ts`,
`tests/dist.smoke.test.ts`, `.size-limit.json`, `README.md`, `CHANGELOG.md`, `llms.txt`.

### 3.2 The GWT-RPC codec (`src/portal/gwt.ts`)

**The wire format**, as the SII's portals speak it (protocol 7):

```
7|0|N|s1|s2|…|sN|body|
```

`7` is the protocol version, `0` the flags, `N` the size of the string table, then the N strings, then the body. Every
string of the body is a 1-based index into the table; `0` is null. The body opens with `1|2|3|4` (the module base URL,
the policy hash, the service interface name, the method name: slots 1 to 4), then the parameter count, then one table
index per parameter type, then the values in order. A boxed `java.lang.Integer` or `java.lang.Long` is `<typeIndex>|<value>`;
a `java.lang.String` is its table index; a primitive boolean is the type name `Z` and the value `0` or `1`; an object
is its type index followed by its fields in serialization order, nested the same way. A Long travels in the GWT base-64
alphabet (`A`–`Z`, `a`–`z`, `0`–`9`, `$`, `_`; each character a digit, most significant first). Inside a table string
`\!` escapes `|` and `\\` escapes a backslash.

**Building.** `gwtBody(call)` takes `{ moduleBase, policy, service, method, parameters }` where each parameter is one
of `{ kind: 'string', value }`, `{ kind: 'integer', value }`, `{ kind: 'long', value }` (a number or an already encoded
token), `{ kind: 'boolean', value }`, `{ kind: 'null' }` or `{ kind: 'object', type, fields: parameter[] }`; strings
are interned in the table in order of first use (the four header slots first), types named by their GWT signature
(`java.lang.String/2004016611`, `java.lang.Integer/3438268394`, `java.lang.Long/4227064769`, `Z`, and the portal
objects of 3.5). The headers of every call: `Content-Type: text/x-gwt-rpc; charset=UTF-8`, `X-GWT-Module-Base`, the
module base, `X-GWT-Permutation`, the permutation, `Origin: https://www4.sii.cl`, `Referer` the module base.

**Parsing.** `gwtAnswer(body)`: `ok` when the body starts with `//OK` (an `//EX` prefix or anything else is not ok);
`table`, the string table found between the last `,["` and the last `],` of the body, with every `\xHH` turned into
`\u00HH` before `JSON.parse` (GWT writes `\x27` for a quote, which JSON refuses), an empty table when none;
`message`, the first string of the table that is a sentence (longer than 15 characters, with whitespace, not a type
name `name/digits`, not containing `cl.sii.sdi`) and matches `no ha|no est|no se|no corresp|debe |error|inv[aá]lid|rechaz|El estado|El contribuyente`,
or null; `longs`, every single-quoted token of 3 to 7 base-64 characters decoded; `firstLongIn(min, max)`.

**Hash discovery.** `discoverGwtHashes(context, { moduleBase, moduleName, known })`: `GET <moduleBase><moduleName>.nocache.js`
with the session; the candidates are the 32-hex-character strings delimited by `=`, `'` or `,` in it, upper-cased; when
the known permutation is among them the known pair stands; else the first candidate is the permutation and
`GET <moduleBase><permutation>.cache.html` gives the policy, the first 32-hex-character string in quotes that differs
from the permutation; any failure, an empty page or no candidate keeps the known pair. The pairs known to work:
exchange portal permutation `E487C7488217509D4EDCE9D341782C20` and policy `4EB230A83E74980F353E4FCC209543CB`; samples
portal permutation `D86ACF99AE5C17F0B0F673A9872EF6CB` and policy `5459B93B9D030A67564300FBD346270F` (both captured in
June 2026). An operation takes `gwt?: { permutation, policy }` to skip the discovery.

**Settled by the code.** The two portals are described by `GwtPortal` in `src/catalogs/certification.ts`
(`EXCHANGE_PORTAL`, `SAMPLES_PORTAL`: base, service path, interface, module name, known hashes), next to
`EXCHANGE_ANSWER_FILES` and `EXCHANGE_ANSWER_KEYS`. `src/portal/gwt.ts` also holds the parameter helpers (`gwtString`,
`gwtInteger`, `gwtLong`, `gwtBoolean`, `GWT_NULL`), `warmUpGwtPortal` (the warm-up of 3.3), `gwtHashesOf` (the caller's
pair, else the discovery from the portal's known pair), `postGwt` (one call posted to a portal's service, with the page
and the answer) and `portalBoundary`. `firstGwtLongIn` and `gwtLongToken` stay internal to the pages.

### 3.3 Raw requests on the session

`portalRequest` and `navigate` of phase 4 gain `body: Uint8Array` and `contentType` next to `form`: the cookies, the
retry policy, the block detection and the Latin-1 decoding stay. Multipart bodies are built with the phase 2
`multipart` helpers and a boundary `----WebKitFormBoundary<hex of now>`. The warm-up of a portal is `GET` of its base
with the session, one redirect followed, every `Set-Cookie` merged into the jar; a warm-up that fails is logged and
ignored. The posts that change the portal (the three uploads, the confirmation, the review creation, the submission,
each PDF upload) are never retried by the transport; the samples uploads have their own retry (3.7).

**Settled by the code.** The GWT portals never ask for a login: before the warm-up, `ensureSession` logs in through the
portal landing when the jar holds no session (the phase 4 operations log in on demand instead). The samples upload
sends the file part first, so the phase 2 helper gained `buildMultipartParts`, which keeps the parts in the given order
and refuses a CR, LF or quote in a part's name, file name or content type; `buildMultipartBody` now delegates to it.

### 3.4 Exchange pages (`src/portal/pages/exchange.ts`)

- `isExchangeSet(html)`: HTTP 200 and the body holds `<EnvioDTE`, `<SetDTE` or `<?xml`.
- `exchangeUserState(answer)`: from the parsed table, the first string longer than 5 characters that does not start
  with `cl.` or `java.`; when it matches `no esta en estado|error` the company is not in the exchange, and the state is
  the word after `estado:` (`desconocido` when none); `P90` means the exchange was already completed.
- `isUploadRefused(html)`: the lower-cased body holds `no vienen los parametros`, `<title>error` or `rechaz`, or the
  status is 400 or more. The portal answers HTTP 200 with "no vienen los parametros necesarios" when the query lacks
  `re` and `dve`.
- `isConfirmed(body)`: `//OK` anywhere in the body.

### 3.5 Exchange operations (`src/portal/exchange.ts`), base `https://www4.sii.cl/pfeInternet/`, service `facade`, interface `cl.sii.sdi.dim.pfe.web.client.service.Facade`

Company fields from `rut.ts`: digits and the upper-cased verifier, whatever the input's dots or case. The
certificate holder's RUT comes from the parsed certificate, never from a file name (a temporary file once made the
portal answer "No hay usuario a validar").

- `downloadExchangeSet(portal)`: warm-up; `POST downloadFile?re=<digits>&dve=<dv>` with an empty multipart body (only
  the closing boundary line), referer the base; `isExchangeSet` → `{ xml }`; else `SII_PORTAL_UNEXPECTED_PAGE` with the
  page in details (the caller keeps it as an artefact).
- `validateExchangeUser(portal, { gwt? })`: warm-up, the hashes, then `validarUsuario` with one object
  `cl.sii.sdi.dim.pfe.to.UsuarioTo/3723336533` whose fields are, in order: null, null, null, null, the certificate
  verifier (string), the company verifier (string), the company digits (boxed Integer), null, null, null, null, null,
  the certificate digits (boxed Integer). Wire: `1|2|3|4|1|5|5|0|0|0|0|6|7|8|<empRut>|0|0|0|0|0|8|<certRut>|` over the
  table `base, policy, service, validarUsuario, UsuarioTo, <certDv>, <empDv>, java.lang.Integer`. Result
  `{ inExchange: boolean, state: string | null, message: string | null }` through `exchangeUserState`; the answer's
  `//OK` is not required (the field does not check it here).
- `uploadExchangeAnswers(portal, { reception, receipts, approval, gwt? })`: three posts in this order, each
  `POST uploadFile<n>?re=<digits>&dve=<dv>` with one multipart part `uploadFormElement`, `Content-Type: text/xml`, the
  file names `respuesta-recepcion-envio.xml` (1), `envio-recibos.xml` (2), `respuesta-aprobacion-comercial.xml` (3),
  `Origin` and the referer the base; `isUploadRefused` → `SII_PORTAL_REJECTED` with rejection `exchangeUploadRefused`,
  the file and the page. The success page of an upload has never been recorded: anything not refused counts.
- `confirmExchange(portal, { gwt? })`: `validarSetContriPostSeguimiento` with (boxed Integer company digits, String
  company verifier): wire `1|2|3|4|2|5|6|5|<empRut>|7|` over `…, java.lang.Integer, java.lang.String, <empDv>`; its answer
  is kept, not judged; then `updatePostulacionSeguimiento` three times, for the ids 40, 41 and 43, each with one object
  `cl.sii.sdi.dim.pfe.to.PostulacionSeguimientoTo/3921005560` whose fields are: the id (boxed Integer), null, null, null,
  null, the company verifier (String), the company digits (boxed Integer): wire `1|2|3|4|1|5|5|6|<id>|0|0|0|0|7|6|<empRut>|`
  over `…, PostulacionSeguimientoTo, java.lang.Integer, <empDv>`; an answer without `//OK` → `SII_PORTAL_UNEXPECTED_PAGE`
  naming the id. The three confirmations are what moves the application to `DOCUMENTOS IMPRESOS`; before the third was
  added the uploads alone did nothing.

No retries and no waits in any of these; every answer goes to the artefacts through the step.

**Settled by the code.** Every operation takes `companyRut?` (the client's by default) and holds the session on its own.
`downloadExchangeSet` redacts the page it keeps in `details.page` as every capture; `validateExchangeUser` returns the
`ExchangeUserState` plus the `hashes` used and the raw `body`, so the step keeps the answer and hands the hashes to
`confirmExchange`; `uploadExchangeAnswers` returns the three pages (`answers[].fileName`, `body`); `confirmExchange`
returns the validation answer and the three confirmations (`id`, `body`); a certificate without a holder RUT is
`MISSING_FIELD { field: 'certificate.rut' }` before any request.

### 3.6 Samples pages (`src/portal/pages/samples.ts`)

- `reviewState(body)`: the first of `APROBADO`, `POR REVISAR`, `EN REVISION` (with or without the accent),
  `RECHAZADO`, `INGRESO`, `ENVIADO AL SII` found between double quotes in the raw body, upper-cased, or null.
- The sentence that blocks (`readSamplesReview` sets `blocked` to `gwtAnswer(body).message` when no state is found;
  there is no `reviewBlock` function); the wordings seen: "El estado de la
  postulacion NO es: 'DOCUMENTOS IMPRESOS'" (both before the stage and after it) and "El contribuyente <rut> no ha
  solicitado Set de pruebas.".
- `reviewId(answer, range)`: the first decoded Long of the answer within the range; the range is 10 000 to 9 999 999
  everywhere (the field uses two ranges). The short numeric string of the table is the RUT's verifier, never a count.
- `reviewSentAt(answer)`: the first table string matching `YYYY-MM-DD HH:MM`.
- `sampleDetails(answer)`: the HTML inside the table (the string starting with `<html` or `\x3Chtml`, unescaped), one
  row per `<tr>` with at least six cells whose second cell ends in `.pdf`: `{ fileName, kind: 'test' | 'simulation'
  (PRUEBA | SIMULACION), documentType, folio, copy (CEDIBLE marks the transferable copy), caseId | null }`.
- `summarizeSampleDetails(rows)`: the sentence the field gives, in English: how many documents the SII counted as the
  test set (with their case ids) and how many as the simulation, by document type, transferable copies left out; a
  document the SII filed as simulation was not in the envelope it registered for that set.

### 3.7 Samples operations (`src/portal/samples.ts`), base `https://www4.sii.cl/pdfdteInternet/`, service `ServicePdfDte`, interface `cl.sii.sdi.dim.validaPdfDte.web.client.service.ServicePdfDte`, module `pdfdte`

The headers of this portal's calls add `Cache-Control: no-cache` and `Pragma: no-cache`; the upload's referer is
`<base><permutation>.cache.html` with `x-dtreferer: <base>`.

- `readSamplesReview(portal, { gwt? })`: `leeImpreso` with one String `<digits>-<dv>`: wire `1|2|3|4|1|5|6|`; HTTP 200
  required (else `SII_PORTAL_UNEXPECTED_PAGE`), `//OK` not required; result `{ state, blocked: message | null, revisionId,
  revisionToken, sentAt }`.
- `createSamplesReview(portal, { gwt? })`: `creaLista` with six parameters: five Strings and one boolean: the digits,
  the verifier, an empty string, the digits again, the verifier again, `false`: wire `1|2|3|4|6|5|5|5|5|5|6|7|8|9|7|8|0|`
  over `…, java.lang.String, Z, <digits>, <dv>, ""`; HTTP 200 and `//OK` required; a message in the answer →
  `SII_PORTAL_REJECTED` with rejection `samplesReviewRefused` and the message; the review id from the answer, none →
  `SII_PORTAL_UNEXPECTED_PAGE`. Result `{ revisionId, revisionToken }`.
- `uploadSample(portal, { revisionId, fileName, bytes, gwt? })`: `POST upload` with three multipart parts: `Filedata`
  (the file name, `application/octet-stream`, the bytes), `id` (the decimal review id), `ambiente` (`false`); HTTP 200
  is success (the body is kept, its format unknown); HTTP 500 or more is retried up to 4 attempts in all, waiting 2, 4
  and 6 s, the same body and boundary; a 4xx → `SII_PORTAL_REJECTED` with rejection `sampleUploadRefused`; the last 5xx
  → `SII_HTTP_ERROR`. A 503 on the 47th of 64 files once left a review in `INGRESO` and a run stuck.
- `submitSamplesReview(portal, { revisionToken, gwt? })`: `solicitaRevisionSII` with (Long, boolean false): wire
  `1|2|3|4|2|5|6|5|<token>|0|`; HTTP 200 and `//OK` required. The answer is `//OK[0,[],0,7]` whether the SII accepts or
  rejects: the state is read again afterwards.
- `readSamplesDetail(portal, { revisionToken, gwt? })`: `muestraMail` with one Long: wire `1|2|3|4|1|5|5|<token>|`;
  result the rows of `sampleDetails`; a failure is a warning and an empty detail.

**Settled by the code.** A `leeImpreso` answer with neither a state nor a sentence is no review yet: the step creates
the first one. `uploadSample` validates the file name against `[\w.-]+\.pdf` before any request
(`INVALID_OPTION { field: 'fileName' }`), treats a status other than 200, 4xx or 5xx as `SII_PORTAL_UNEXPECTED_PAGE`,
and returns the `attempts` made with the body. The read results carry the `hashes` used and the raw `body`, as the
exchange ones do.

### 3.8 The exchange generator (`src/certification/exchange.ts`)

`createExchangeAnswers(setXml, { companyRut, certificate, contact?, now? })` → `{ reception, receipts, approval, set }`,
each answer `{ fileName, xml }`, `set = { setId, issuerRut, senderRut, receiverRut, documents: [{ type, folio, issueDate,
issuerRut, receiverRut, total }] }`.

**The set** (`parseExchangeSet(setXml)`, exported on its own). The root is `EnvioDTE`, `EnvioDTEB`, `EnvioDTETraslado` or `EnvioBOLETA`; `SetDTE/@ID` (`SetDTE` when
absent); the cover's `RutEmisor`, `RutEnvia`, `RutReceptor`; per `DTE`, the `Documento`'s `IdDoc/TipoDTE` (or `TpoDoc`),
`Folio`, `FchEmis`, `Emisor/RUTEmisor` (or the cover's), `Receptor/RUTRecep` (or the cover's receiver), `Totales/MntTotal`
(0 when absent). No document → `ENVELOPE_EMPTY`. Every RUT through `rut.ts`; "the company" is the receiver whose RUT
equals `companyRut`.

**The reception response**, `respuesta-recepcion-envio.xml`: `RespuestaDTE version="1.0"` with the SII namespace,
`xmlns:xsi` and `xsi:schemaLocation="http://www.sii.cl/SiiDte RespuestaEnvioDTE_v10.xsd"`; `Resultado ID="R_ENVIO_<ms>"`;
`Caratula version="1.0"`: `RutResponde` the company, `RutRecibe` the set's issuer, `IdRespuesta` 1, `NroDetalles` 1,
`NmbContacto` and `MailContacto` when given (sanitized as every SII text), `TmstFirmaResp`; `RecepcionEnvio`: `NmbEnvio`
`ENVIO_DTE_<ms>`, `FchRecep`, `CodEnvio` 1, `EnvioDTEID` the set id, `RutEmisor` the set's issuer, `RutReceptor` the
company, `EstadoRecepEnv` 0 and `RecepEnvGlosa` "Envío recibido conforme." always, `NroDTE`, then one `RecepcionDTE` per
document (`TipoDTE`, `Folio`, `FchEmis`, `RUTEmisor`, `RUTRecep`, `MntTotal`, `EstadoRecepDTE`, `RecepDTEGlosa`): 0 and
"DTE Recibido OK." when the receiver is the company, else 3 and "DTE No Recibido - Error en RUT Receptor.".

**The commercial approval**, `respuesta-aprobacion-comercial.xml`: the same root and cover, `Resultado ID="R_DTE_<ms>"`,
`NroDetalles` the number of documents, one `ResultadoDTE` per document (`TipoDTE`, `Folio`, `FchEmis`, `RUTEmisor`,
`RUTRecep`, `MntTotal`, `CodEnvio` the 1-based position, `EstadoDTE`, `EstadoDTEGlosa`, and `CodRchDsc` only when
refused): 0 and "DTE Aceptado OK" for the company, else 2, "DTE Rechazado" and `CodRchDsc` -1.

**The receipts**, `envio-recibos.xml`: `EnvioRecibos version="1.0"` with the namespaces and
`xsi:schemaLocation="http://www.sii.cl/SiiDte EnvioRecibos_v10.xsd"`; `SetRecibos ID="SetRecibos_<ms>"`; `Caratula
version="1.0"` with `RutResponde`, `RutRecibe`, `NmbContacto`, `FonoContacto` and `MailContacto` when given,
`TmstFirmaEnv`; one `Recibo version="1.0"` per document, every document, with `DocumentoRecibo ID="REC-<n>"`: `TipoDoc`,
`Folio`, `FchEmis`, `RUTEmisor`, `RUTRecep`, `MntTotal`, `Recinto` "Oficina central", `RutFirma` the certificate's RUT,
`Declaracion` the sentence of the law, verbatim: "El acuse de recibo que se declara en este acto, de acuerdo a lo
dispuesto en la letra b) del Art. 4, y la letra c) del Art. 5 de la Ley 19.983, acredita que la entrega de mercaderias o
servicio(s) prestado(s) ha(n) sido recibido(s).", `TmstFirmaRecibo`.

`<ms>` is the clock in milliseconds, the same value for the three ids of one call; every timestamp is
`chileTimestamp(now)` (D82). The XML is one line, no declaration, UTF-8 (D81), elements in the order above.

**Signing** with the phase 1 `signEnveloped`: each `DocumentoRecibo` inside its `Recibo`, then `SetRecibos` inside
`EnvioRecibos`, and `Resultado` inside `RespuestaDTE` for the two responses; rsa-sha1, sha1, the enveloped transform
only, `KeyValue` plus `X509Data`, the `Signature` after the signed element. `verifyEnveloped` checks them in the tests.

**Settled by the code.** `ExchangeSet.issuerRut` is required (`MISSING_FIELD { field: 'RutEmisor' }`); `senderRut` and
`receiverRut` are null when the cover lacks them; a document without a receiver and no cover receiver is
`MISSING_FIELD { field: 'RUTRecep' }`; a type, folio or total that is not a run of digits is
`XML_PARSE_FAILED { field, reason: 'not a number' }`; `Documento`, `Exportaciones` or `Liquidacion` is the document
element; a set without an envelope root is `XML_PARSE_FAILED { field: 'SetDTE' }`. Each receipt is signed on its own with
`xmlns` and `xmlns:xsi` declared on its `Recibo`, so its digest is the one a verifier computes inside the envelope, and
the declarations then leave the start tag; `RutFirma` is the certificate's `rut`, or the company when it has none; the
contact's name, mail and phone all go through the SII text sanitizer, and the two responses never carry the phone.

### 3.9 State and artefacts

`CertificationState` gains:

```ts
readonly exchange?: {
  readonly setId: string; readonly issuerRut: string; readonly documents: number
  readonly generatedAt: string; readonly uploaded: boolean; readonly confirmed: boolean
  readonly portalState?: string         // the state the user validation reported when not in the exchange
}
readonly samples?: {
  readonly revisionId: number | null; readonly revisionToken: string | null
  readonly state: string | null; readonly uploaded: readonly string[]
  readonly submittedAt?: string; readonly detail?: readonly SampleDetail[]; readonly summary?: string
}
```

Artefacts: `intercambio/set-intercambio.xml` (the set as downloaded, or as given), `intercambio/respuesta-recepcion-envio.xml`,
`intercambio/envio-recibos.xml`, `intercambio/respuesta-aprobacion-comercial.xml`, and every portal answer:
`intercambio/pfe-download.html` (also `pfe-download-error.html` on failure), `pfe-validar.html`, `pfe-upload-1.html`
to `-3`, `pfe-validarset.html`, `pfe-seguimiento-40.html`, `-41`, `-43`; `muestras/pdfte-lee-impreso.html`,
`pdfte-crea-lista.html`, `muestras/upload-<n>.html` per PDF, `pdfte-enviar-sii.html`, `pdfte-estado-post-envio.html`,
`pdfte-detalle-revision.html`.

Progress events (the field's names): `INTERCAMBIO_START`, `INTERCAMBIO_DESCARGADO`, `INTERCAMBIO_DONE { uploaded }`,
`MUESTRAS_UPLOADING { count }`, `MUESTRAS_DONE { success }`.

### 3.10 Steps

- **`runExchange(deps, state, { setXml? })`** → `StepResult<'done' | 'alreadyDone' | 'setUnavailable' | 'notInExchange'>`.
  `INTERCAMBIO_START`; the set from the option, else the artefact `intercambio/set-intercambio.xml`, else
  `downloadExchangeSet` (kept as that artefact; a failure keeps the page as `pfe-download-error.html` and returns
  `setUnavailable` with the artefact name the caller must fill by hand); `INTERCAMBIO_DESCARGADO`;
  `createExchangeAnswers` with the company RUT, the certificate and `deps.contact` (3.11), the three answers kept as
  artefacts; `validateExchangeUser`: not in the exchange → `portalState` in the state and `notInExchange` with the
  message, or `alreadyDone` when the state is `P90` (the stage moves to `printedSamples`); then `uploadExchangeAnswers`,
  `confirmExchange`, `exchange.uploaded` and `confirmed` true, stage `printedSamples`, `INTERCAMBIO_DONE { uploaded:
  true }`, `done`. A run with `exchange.confirmed` already true returns `alreadyDone` without touching the portal.
  The answers are generated and uploaded again on every run that reaches the portal, as the field does; only the set is
  kept.
- **`uploadPrintedSamples(deps, state, { samples })`** → `StepResult<'submitted' | 'alreadySubmitted' | 'blocked' | 'rejected'>`,
  `samples` a non-empty list of `{ fileName, bytes }` (`MISSING_FIELD { field: 'samples' }` otherwise).
  `MUESTRAS_UPLOADING { count }`; `readSamplesReview`: a block → `blocked` with the message; a state other than
  `INGRESO`, `RECHAZADO` or `APROBADO` → `alreadySubmitted` with the state, id and date in the state; `INGRESO` with a
  readable id → the review is resumed, else `createSamplesReview`; `uploadSample` for every PDF in order (each name
  into `samples.uploaded`); `submitSamplesReview`; `readSamplesReview` again: `RECHAZADO` → `readSamplesDetail`, the
  rows and the summary into the state, `rejected` with the summary; else `submitted` with the state, `submittedAt`,
  stage `compliance`; `MUESTRAS_DONE { success }`.

**Settled by the code.** `runExchange` answers `alreadyDone` (detail `confirmed`) before any request when the state says
the exchange is confirmed; `notInExchange` and the portal's `alreadyDone` carry the portal's sentence as the detail and
`portalState` only when the sentence names a state; a download that fails for any reason other than an unexpected page
propagates; the set given through the option is kept as the artefact too. `uploadPrintedSamples` is `blocked` only on a
sentence; no state and no sentence creates the first review; `MUESTRAS_DONE` is emitted on every end, `success` false on
`blocked` and `rejected`; a rejection whose detail cannot be read sums up as "The SII rejected the printed samples; the
detail is in the portal."; `samples.uploaded` restarts on every run that uploads. `readPrintedSamples` throws
`MISSING_FIELD { field: 'samples', dir }` and treats a directory that does not exist as empty. The exchange set artefact
name is exported as `EXCHANGE_SET_ARTEFACT`.

### 3.11 Runner

`CertificationDependencies` gains `contact?: { name?, mail?, phone? }` (the exchange answers' contact).
`RunCertificationOptions` gains `exchangeSetXml?: string` and `samples?: readonly PrintedSample[] | (() => Promise<readonly PrintedSample[]>)`;
`RunStop` gains `printedSamples`.

At `exchange`: `runExchange`; `done` or `alreadyDone` go on; `setUnavailable` and `notInExchange` return
`stopped: 'exchange'` with the detail. At `printedSamples`: without `samples`, `stopped: 'printedSamples'`; with them,
`uploadPrintedSamples`: `submitted` or `alreadySubmitted` go on to `compliance`; `blocked` → `stopped: 'blocked'`;
`rejected` → `stopped: 'rejected'` with the summary. At `compliance`, as in 5b-2: `stopped: 'compliance'` unless
`declareCompliance: true`. The portal's own stage is no longer read at `exchange` (the exchange step tells); the
`until` option keeps working after every stage. A confirmed exchange in a state still at `exchange` (a hand-edited
state) moves on to `printedSamples` without the portal.

### 3.12 Errors

- `SII_PORTAL_REJECTED` with the new rejections `exchangeUploadRefused` (the upload page said no), `samplesReviewRefused`
  (the review could not be created: the SII's sentence), `sampleUploadRefused` (a PDF refused with a 4xx); the glosses
  in `PORTAL_REJECTIONS`.
- `SII_PORTAL_UNEXPECTED_PAGE` for a set page that is no set, a confirmation without `//OK`, a review answer without
  `//OK` or without a readable id, a GWT answer that is no answer.
- `SII_HTTP_ERROR` for the last 5xx of a PDF upload.
- `ENVELOPE_EMPTY` for a set without documents; `MISSING_FIELD` for no samples, no plan or no state field a step needs;
  `INVALID_RUT` from `rut.ts`.
- Session, block and transport codes as in phase 4.

### 3.13 Public API additions

`dte-sdk/portal`: `gwtBody`, `gwtAnswer`, `decodeGwtLong`, `encodeGwtLong`, `discoverGwtHashes`; `downloadExchangeSet`,
`validateExchangeUser`, `uploadExchangeAnswers`, `confirmExchange`; `readSamplesReview`, `createSamplesReview`,
`uploadSample`, `submitSamplesReview`, `readSamplesDetail`; `createExchangeAnswers`, `parseExchangeSet`; `runExchange`,
`uploadPrintedSamples`; the catalog `EXCHANGE_PORTAL`, `SAMPLES_PORTAL` (bases, services, modules, known hashes). Types:
`GwtCall`, `GwtParameter`, `GwtAnswer`, `GwtHashes`, `ExchangeUserState`, `ExchangeAnswers`, `ExchangeSet`,
`ExchangeDocument`, `SamplesReview`, `SampleDetail`, `PrintedSampleFile`, `ExchangeState`, `SamplesState`, and the step
outcomes.

`dte-sdk/pdf`: `readPrintedSamples(dir)` → `readonly PrintedSample[]`, every `.pdf` under `dir` recursively, the test
set's folder before the simulation's, each with its base name and bytes; none → `MISSING_FIELD { field: 'samples' }`.

**Settled by the code.** The sample file type is `PrintedSampleFile { fileName, bytes }`, declared in `dte-sdk/pdf` and
re-exported by `dte-sdk/portal` (`PrintedSample` is phase 5a's rendered sample). Also exported: `GwtPortal`,
`GwtDiscoveryInput`, the input and result types of every operation (`ExchangeCompanyInput`, `ExchangeGwtInput`,
`ExchangeSetDownload`, `ExchangeUserValidation`, `UploadExchangeAnswersInput`, `ExchangeUploadAnswer`,
`ExchangeUploadResult`, `ExchangeConfirmationAnswer`, `ExchangeConfirmation`, `SamplesCompanyInput`,
`SamplesReviewInput`, `SamplesReviewCreated`, `UploadSampleInput`, `SampleUploaded`, `SamplesDetail`, `ReviewState`),
`ExchangeContact`, `CreateExchangeAnswersInput`, `ExchangeAnswer`, `RunExchangeInput`, `ExchangeOutcome`,
`UploadPrintedSamplesInput`, `SamplesOutcome`, and the constants `EXCHANGE_ANSWER_FILES`, `EXCHANGE_ANSWER_KEYS`,
`EXCHANGE_SET_ARTEFACT`.

### 3.14 Typical flows

```ts
import { runCertification } from 'dte-sdk/portal'
import { readPrintedSamples, writePrintedSamples } from 'dte-sdk/pdf'

// After 5b-2 stopped at the exchange: the exchange runs, then the samples are rendered from the artefacts and uploaded
const samplesDir = './certification/muestras'
await writePrintedSamples({ /* the envelopes the store kept under sets-prueba/ and simulacion/ */ })
const run = await runCertification(deps, { samples: () => readPrintedSamples(samplesDir) })
// run.stopped: 'compliance' once the samples are submitted; later, { declareCompliance: true }

// The set could not be downloaded: it was saved by hand from the portal
await runCertification(deps, { exchangeSetXml: await readFile('set-intercambio.xml', 'utf8') })
```

### 3.15 Tests

- **Codec:** table-driven, the wire bodies of 3.5 and 3.7 built from their descriptions and compared character by
  character; answers `//OK[…]` with `\x27` and nested tables, `//EX`, no prefix; the message extraction on the SII's
  sentences; `'BAqo'` → 264872 and back; the ranges; the discovery on a synthetic `nocache.js` and `cache.html`, the
  known pair confirmed, replaced, and kept when the files fail or hold nothing.
- **Pages:** every wording of 3.4 and 3.6, the six review states, the detail table with transferable copies and a
  missing case id.
- **Operations** on the fake portal: the warm-up with one redirect and the cookies merged, the empty multipart of the
  download, the `re`/`dve` query, the order and parts of the three uploads, the refused page at HTTP 200, the three
  confirmation ids in order and a missing `//OK`, the samples calls' headers, the upload retries on 5xx with the
  sleeps 2, 4 and 6 s and none on 4xx, the resumed `INGRESO` review, the rejected review and its detail.
- **Generator:** a synthetic set of three documents (one with another receiver); each answer parsed and checked field
  by field, the signatures verified with `verifyEnveloped`, the file names, the contact fields, the empty set. The
  public SII schemas `RespuestaEnvioDTE_v10.xsd` and `EnvioRecibos_v10.xsd` are added to the fixtures and the answers
  validated with `xmllint-wasm` (the plan fetched them: appendix).
- **Steps and runner** with the 5b-2 harness: the set from the option, the artefact and the portal; `P06`, `P90` and
  another state; a resumed exchange; the samples absent and present, as a list and as a function; `readPrintedSamples`
  on a temporary directory; every stop reason.
- Coverage stays at 100 % on the four metrics.

### 3.16 Build and docs

- `.size-limit.json`: `dte-sdk/portal` to 64 kB (62.47 kB measured); `dte-sdk/pdf` unchanged at 10 kB (8.45 kB measured) (D85).
- No new dependency.
- `README.md`: a "Certification: the exchange and the printed samples" section with the flows of 3.14 and the manual
  download of the set; `CHANGELOG.md` entry; `llms.txt` paragraph.

---

## 4. Glossary additions (public contract)

| Term | Meaning |
|---|---|
| Exchange set (set de intercambio) | The envelope the SII delivers on its exchange portal for the applicant to answer |
| Reception response (respuesta de recepción) | `RespuestaDTE` with `RecepcionEnvio`: whether the envelope and each document were received |
| Commercial approval (aprobación comercial) | `RespuestaDTE` with `ResultadoDTE`: whether each document is accepted or refused |
| Receipts (recibos) | `EnvioRecibos`: the acknowledgement of receipt of goods or services of the law 19.983, one per document |
| Confirmation of the exchange | The three follow-up updates (40, 41, 43) that move the application to the printed samples |
| Samples review (revisión de muestras) | One submission of PDFs to the SII's automatic format validator; `INGRESO` created, then submitted, then approved or rejected |
| GWT permutation and policy | The two hashes a GWT portal requires on every call; they change when the SII redeploys the portal |

---

## 5. Decisions reviewed with Hans

| # | Decision | Outcome |
|---|---|---|
| 1 | Two phases, 5c-1 and 5c-2 (D76) | Hans's, 2026-11-04 |
| 2 | The exchange documents only for the certification (D77) | Hans's, 2026-11-04 |
| 3 | The samples handed in by the caller (D78) | Hans's, 2026-11-04 |
| 4 | Sections 1 to 5 of the design (codec, session, protocol, generator, state, runner, tests) | Approved in chat, 2026-11-04 |
| 5 | Sections 3.2 to 3.16 as written | Written on his go-ahead; amended by the plan's code the same day; pending his review of this file |

---

## 6. What is measured and what is not

**From the public SII manual (2009):** the exchange and the printed samples as steps 3 and 4 of the certification, in
that order, after the simulation and before the declaration of compliance; the samples reviewed by the SII against its
printed-representation rules.

**Field behaviour known to carry a certification through these two steps (the rules of section 3):** the portals, the
wire format, the hashes, the wordings, the rules of the three answers, the review states and the rejection detail.

**Not measured, and not measurable until the company is enrolled and past the simulation:** every call of this phase.
Nothing of the two GWT portals has been seen by this SDK; the success pages of the uploads are not recorded even in the
field. The first run must keep every answer the store writes and turn them into fixtures.

**Measured at the plan's tip (2026-11-04):** 2 342 tests, coverage 100 % on the four metrics; `dte-sdk/portal`
62.47 kB (limit 64 kB), `dte-sdk/pdf` 8.45 kB (10 kB), `dte-sdk` 30.16 kB (32 kB), `dte-sdk/node` 4.19 kB (6 kB). The
official SII schemas of the three answers are in the fixtures and the answers validate against them (appendix).

---

## 7. Deferred improvements and field defects not copied

Kept as the field does them (to be reconsidered after a real run):

1. The answers regenerated and uploaded again on every run that reaches the portal; only the set is kept.
2. No wait after the submission of the samples: the SII's validator decides in minutes and the compliance step finds
   the block or the way through.
3. The hashes known to work, captured in June 2026, as the fallback of the discovery.

Field defects not reproduced (D84):

1. The RUT split on `-` without removing dots or upper-casing the verifier in some calls and not in others; here every
   RUT goes through `rut.ts`.
2. The exchange reported as a success with nothing uploaded when the company is not in the exchange; here
   `notInExchange` is the outcome.
3. Timestamps from the process clock in local time; here Chile time (D82).
4. The server verification disabled and the legacy renegotiation forced on the GWT hosts; here the phase 4 transport.
5. Two different ranges for the review id depending on the code path; here one.
6. Instructions printed for the user when the set cannot be downloaded or the upload is refused; here data, and the
   README says what to do by hand.

---

## Appendix: official sources of the exchange answers

The SII publishes the formats on its page "Formato XML de documentos electrónicos"
(`https://www.sii.cl/servicios_online/3532-formato_xml-3811.html`, files under
`https://www.sii.cl/factura_electronica/factura_mercado/`):

- `schema_ic.zip` → `RespuestaEnvioDTE_v10.xsd` (the reception response and the commercial approval; includes
  `SiiTypes_v10.xsd`, imports `xmldsignature_v10.xsd`), last updated 10-03-05.
- `schema19983.zip` → `EnvioRecibos_v10.xsd` (includes `Recibos_v10.xsd`, which includes `SiiTypes_v10.xsd`), the
  receipts of the law 19.983.
- `formato_ic.pdf`, "Formato de Intercambio de Información entre Contribuyentes", the prose of the same formats.

What the schemas fix, and the code follows:

- `RespuestaDTE/Resultado/Caratula`: `RutResponde`, `RutRecibe`, `IdRespuesta`, `NroDetalles`, `NmbContacto?`,
  `FonoContacto?`, `MailContacto?`, `TmstFirmaResp`; then a choice of `RecepcionEnvio*` or `ResultadoDTE*`.
- `RecepcionEnvio`: `NmbEnvio`, `FchRecep`, `CodEnvio`, `EnvioDTEID`, `Digest?`, `RutEmisor?`, `RutReceptor?`,
  `EstadoRecepEnv` (0 received conforming, 1 schema, 2 signature, 3 RUT receiver, 90 envelope repeated, 91 incomplete,
  99 other), `RecepEnvGlosa`, `NroDTE?`, `RecepcionDTE*` (`TipoDTE`, `Folio`, `FchEmis`, `RUTEmisor`, `RUTRecep`,
  `MntTotal`, `EstadoRecepDTE` 0 received, 1 signature, 2 RUT issuer, 3 RUT receiver, 4 repeated, 99 other,
  `RecepDTEGlosa`).
- `ResultadoDTE`: `TipoDTE`, `Folio`, `FchEmis`, `RUTEmisor`, `RUTRecep`, `MntTotal`, `CodEnvio`, `EstadoDTE` (0
  accepted, 1 accepted with discrepancies, 2 rejected), `EstadoDTEGlosa`, `CodRchDsc?`.
- `EnvioRecibos/SetRecibos/Caratula`: `RutResponde`, `RutRecibe`, `NmbContacto?`, `FonoContacto?`, `MailContacto?`,
  `TmstFirmaEnv`; then `Recibo+`, each `DocumentoRecibo` with `TipoDoc`, `Folio`, `FchEmis`, `RUTEmisor`, `RUTRecep`,
  `MntTotal`, `Recinto` (at most 80 characters), `RutFirma`, `Declaracion` (fixed by the schema to the sentence of 3.8,
  at most 256 characters), `TmstFirmaRecibo`.

The `SiiTypes_v10.xsd` of these zips is the 2005 edition; the one already in the fixtures (used by `ConsumoFolio`) is the
2026 edition, a superset, and validates the answers as well, so the fixtures keep one copy.
