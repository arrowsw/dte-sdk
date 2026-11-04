# dte-sdk — Phase 5b-2 design (certification: declarations, books and the runner)

Date: 2026-11-04 · Status: **written on Hans's go-ahead after section 1 was approved in chat; the API shape (D65) and the size cap (D74) were his decisions; amended the same day by what the plan's code settled (sections 3, 6 and 7)** · Author: Claude (with Hans)

Starting point: the phase 5b-1 spec (D57–D64) and the phase 2, 3 and 4 specs. Decisions continue at D65. SII facts come
from the public "Manual para empresas usuarias, ambiente de certificación factura electrónica" (2009) and from field
behaviour known to carry a certification from the test sets to the declaration of compliance; section 6 says which is
which and what has never been seen by this SDK.

---

## 1. Goal and scope

Phase 5b-1 generates the documents, envelopes and books of the certification in memory. Phase 5b-2 does the rest of
the HTML side of the certification portal: it obtains the test set, gets the folios, sends what 5b-1 built through
phase 2, declares each envelope on the portal, waits for the SII's review, chooses and retries the book period,
advances the stage, runs the simulation, and finally declares compliance. Everything that goes through the SII's
GWT portals (the exchange, the printed-samples upload, the receipts certification) is phase 5c.

**In scope**

1. **Page modules:** pure parsers of `pe_generar1`, `pe_avance2`, the answers of `pe_avance3` and `pe_avance4`,
   `pe_avance6`, `QEstLibro`, and the three screens of the compliance wizard.
2. **Portal operations:** `downloadTestSet`, `declareProgress`, `readProgress`, `advanceStage`, `listBookHistory`,
   `declareCompliance`, on the phase 4 session.
3. **State:** `CertificationState` and the `CertificationStore` port with memory and directory adapters.
4. **Steps:** obtain the set, prepare folios, send a set, declare the sets, wait for their approval, run the books,
   advance, send, declare and confirm the simulation, declare compliance; progress events.
5. **Runner:** `runCertification`, the chain with resume.
6. **Tests:** synthetic portal pages and a fake SII; the size cap to 80 kB.

**Out of scope** (and where it goes)

- The exchange (`pfeInternet`), the printed-samples upload (`pdfdteInternet`) and the receipts certification
  (`certBolElectDteInternet`): phase 5c. The runner stops when the simulation is confirmed and resumes for the
  compliance declaration once 5c has done its part (D75).
- Generating the PDFs of the printed samples: phase 5a reads the envelope artefacts this phase leaves.
- Verifying a receipts authorization on production pages: phase 5c, with the receipts track.
- Improvements over field behaviour (section 7).

---

## 2. Architecture decisions

### D65. Steps plus a runner that resumes from saved state

Every phase of the certification is a free function over a dependency object and the `CertificationState`; it reads
what it needs from the state and returns a new state. `runCertification` chains them in the field order, stops where
the field stops (a rejection, a block, a time-out) and starts again from the saved state, skipping what is done. The
field exposes the phases as methods and leaves the chain to a script; here both are in the library.

### D66. Pages are pure; operations go through the phase 4 session

Every `pe_*` and `QEstLibro` page becomes data in `src/portal/pages/` (D32 of phase 4): regexes, wordings and field
names live there and are tested on synthetic HTML. The operations use `withPortalSession`, `ensurePage`, `submitForm`
and the refusal detection of phase 4, including the "ESCOJA COMO DESEA INGRESAR" page and the login on demand.

### D67. One declaration operation for sets, books and the simulation

The portal declares sets, books and the simulation on the same `pe_avance2` form, posted to `pe_avance3`. The row of
each set or book is found by its label, never by position: the index of `NUM_ENV{n}` moves when a set is approved. One
operation, `declareProgress`, takes the entries by key and does the mapping, the post, the response classification and
the verification re-read.

### D68. State and artefacts through a port

`CertificationStore` keeps one JSON document, the `CertificationState`, and the XML artefacts (envelopes, books, the
simulation, the set text). Memory and directory adapters ship; a service may back it with its own storage. The artefact
names are the field's, so phase 5a's batch and phase 5c's steps find them where they expect them.

### D69. Progress as typed events, never stdout

`onProgress` receives `{ step, ...payload }` with the field's step names and payloads (3.5). The library writes
nothing to the console.

### D70. Chile dates

The declaration date (`FEC_ENV`) and the base book period come from `chileDate(now)`: the day and month in
America/Santiago. The field takes the local date for the declaration and the UTC month for the period and requires
`TZ=America/Santiago`; between 21:00 and midnight in Chile a process in UTC declared the next day and the SII answered
"FECHA NO CORRESPONDE AL ENVIO".

### D71. Folios through phase 4 and the registry

`prepareFolios` reuses the CAFs the state holds, reads the quota, re-obtains lost ranges, requests the missing folios
exactly or in batches, and annuls unused ranges only as a last resort and within a window, with `requestCafExact`,
`requestCafInBatches`, `reobtainFolios`, `annulFolios` and `queryFolioQuota` of phase 4; it never annuls a CAF the run
holds, the sets' included, even when the simulation asks for fresh ones. The registry is the folio source: every folio
is reserved there when taken and marked sent right after the send is attempted, whatever the outcome; on the next
preparation the folios of this run the SII never received (`folioReceived`, at most 30 checks per CAF) are given
back. The field learnt both the hard way: unused authorized folios trigger rationing, and a reused folio rejects the
next envelope with "Error en Firma".

### D72. Waits and retries as the field, with the clock injected

The counts and delays of section 3.6 are the field's. `sleep` and `now` are injectable so the tests run in no time.
A definitive refusal ("FECHA/RUT/FOLIO NO CORRESPONDE") stops at once: waiting never fixes it.

### D73. Field defects not reproduced

Section 7 lists what the field does that this phase does not reproduce: a wait that advanced without checking
because it read a field that did not exist, a "no change" answer reported as an unknown error, an empty list of sets
counted as approved, a progress page fetched without the company post.

### D74. Root entry; the size cap goes to 80 kB

The root stands at 53.6 kB with phase 4b and about 60 kB with 5b-1; this phase adds the pages, the operations and the
runner, about 15 to 20 kB. The cap goes to 80 kB for both formats. Subpath entry points stay the question of issue 5
before 0.1.0.

**Pending, from issue 5 (2026-11-04):** the package is going ESM-only with subpath entry points (`dte-sdk`,
`dte-sdk/node`, `dte-sdk/portal`, `dte-sdk/pdf`), the portal, the folios and the certification leaving the root for
`dte-sdk/portal`, in a pull request of its own. When that lands first, this phase's exports go in
`src/portal/index.ts` instead of `src/index.ts` (3.9), the 80 kB cap becomes the raise of the `dte-sdk/portal` limit
(3.12), and the CJS figures of section 6 no longer apply. No module of this phase moves or is renamed. Whoever lands
second rebases and measures again.

### D75. The GWT steps stay in 5c; the runner stops and resumes around them

After the simulation is confirmed the stage is `INTERCAMBIO`. The runner returns with `stopped: 'exchange'`; phase 5c
runs the exchange and the printed-samples upload; the runner, called again, finds the portal past the exchange and
stops in front of the declaration of compliance (`stopped: 'compliance'`), which it makes only with
`declareCompliance: true`: the sworn statement of the legal representative cannot be undone, so it needs an explicit
go (settled by the code's review).

---

## 3. Phase 5b-2 — detailed design

### 3.1 `src/` layout

```
src/catalogs/certification.ts                     (modify) stage names, states, step names of the progress events
src/portal/pages/certification-set.ts             pe_generar1: state table, optional-set checkboxes, hidden AUTORIZADA and TOTAL;
                                                  pe_generar2: HTML to set text; "no inscrito" detection
src/portal/pages/certification-progress.ts        pe_avance2 form (rows, indexes, hidden fields, current values, states);
                                                  pe_avance3 answer classification; pe_avance4 answer; pe_avance6 stage and states
src/portal/pages/certification-books.ts           QEstLibro rows
src/portal/pages/certification-compliance.ts      pe_avance8 screens: OK_MSG, the pe_avance9 form, the block wording, the final check
src/portal/certification.ts                       (modify) downloadTestSet, declareProgress, readProgress, advanceStage,
                                                  listBookHistory, declareCompliance (queryCertificationSets stays)
src/portal/html.ts                                (modify) bodyText (the page text without its title), hiddenInputs
src/certification/state.ts                        CertificationState, CertificationStore, memory adapter
src/certification/node-store.ts                   directory adapter (node:fs on first use)
src/certification/runtime.ts                      the dependency object, the progress events, StepResult, runtime, saveState
src/certification/folios-step.ts                  prepareFolios and the folio source over the registry
src/certification/steps.ts                        the steps of the sets, the simulation and the compliance
src/certification/books-step.ts                   runBooks
src/certification/runner.ts                       runCertification
src/certification/books.ts                        (modify) the books accept the cases a run keeps and an adjustment
```

Also touched: `src/index.ts`, `tests/public-api.test.ts`, `tests/types.test.ts`, `.size-limit.json`, `README.md`,
`CHANGELOG.md`, `llms.txt`.

### 3.2 Page modules

All matching is on the HTML the portal sends, Latin-1 entities decoded (`&aacute;` and friends, `&nbsp;`, `&amp;`,
`&quot;`, `&#NNN;`) with the phase 4 helpers. "Text" below means the page with `<script>`, `<style>` and every tag
removed and whitespace collapsed.

**`certification-set.ts`**

- `parseSetGeneration(html)`: the state table (`<tr><td><font>name</font></td><td><font>state</font></td></tr>`,
  rows whose name contains `Set Obtenido` are headers), the optional-set checkboxes
  (`<input … name="SETnn" … type="checkbox" …> label`), the hidden `AUTORIZADA` (default `S`) and `TOTAL` (default
  `15`), and whether the page offers `pe_generar1` or `Confirmar Empresa`.
- `isNotEnrolled(html)`: `no está inscrito`, `no esta inscrito`, `no est&aacute; inscrito` or the Latin-1 byte form.
- `setTextOf(html)`: `<script>` and `<style>` blocks removed, every tag turned into a line break, the entities decoded,
  blank lines collapsed, trimmed. This is what `parseTestSetText` of 5b-1 reads.
- `isSetRegenerated(html, previousAttentionNumber)`: `Set generado correctamente`, `nuevos folios asignados`, or an
  attention number (`attentionNumberOf`: `NUMERO DE ATENCI…: n`) different from the previous one.
- `isSessionDropped(html)`: `no se encuentra autenticado`, or the application's front page without a case.

**`certification-progress.ts`**

- `parseDeclarationForm(html)`: every `<input>`; `type=HIDDEN` into `hiddenFields`, `type=text` with a value into
  `currentValues` (the `NUM_ENV`/`FEC_ENV` already declared); `totalRows` from the hidden `TOTREG` (10 when absent);
  the rows, split on `<tr>`, each mapped to a key by its label and to its index by `NAME="NUM_ENV(\d+)"`: `SET DE
  SIMULACION` → `simulation`, `LIBRO DE VENTAS` → `salesBook`, `LIBRO DE COMPRAS` not followed by ` PARA EXENTOS` →
  `purchaseBook`, `LIBRO DE COMPRAS PARA EXENTOS` → `exemptPurchaseBook`, `LIBRO DE GUIAS` → `guideBook`, `SET BASICO`
  → `basic`, `SET GUIA DE DESPACHO` → `guide`, `SET FACTURA EXENTA` → `exempt`, `SET DOCUMENTOS DE EXPORTACION` not
  followed by `(2)` → `export1`, `SET DOCUMENTOS DE EXPORTACION(2)` → `export2`, `SET CASO GENERAL FACTURA COMPRA` →
  `purchase`, `SET LIQUIDACION FACTURA` → `settlement`. A row without a `NUM_ENV` input (already reviewed or in review)
  has no index. `isStatusPage` is true when there is no hidden field at all; then `hasErrorStates` says whether any
  row state matches `REPAROS|ERRORES`.
- `classifyDeclarationAnswer(html)` on the `pe_avance3` body: `sessionExpired` (`no se encuentra autenticado`, `error
  de sesi`); `contentMismatch` (`contenido no corresponde`); `notProcessed` (`no ha sido procesado`, `aún no está
  disponible`, `intente más tarde`, `no se encuentra`); `inconsistentData` with its detail when the text matches
  `(FECHA|RUT|FOLIO|NUMERO|NÚMERO)[^.<]{0,40}?NO\s+(CORRESPONDE|COINCIDE)[^.<]{0,40}`; `hasSuccess` (`exitosamente`,
  `Avance declarado`, `actualizado`); `hasError` when the lower-cased body, with `errores o reparos` replaced first
  (it is a state, not an error), contains `error` and not `Error de Sesión`; `contentErrors`, the keys of `LIBRO DE
  VENTAS`, `LIBRO DE COMPRAS PARA EXENTOS`, `LIBRO DE COMPRAS`, `LIBRO DE GUIAS`, `SET BASICO`, `SET GUIA DE DESPACHO`,
  `SET FACTURA EXENTA`, `SET CASO GENERAL FACTURA COMPRA`, `SET DE SIMULACION` followed within 200 characters by
  `ENVIO CON ERRORES O REPAROS` (with the lookahead that keeps `LIBRO DE COMPRAS` from matching inside `… PARA
  EXENTOS`); `accepted` = `(!hasError || hasSuccess) && !sessionExpired && !contentMismatch`.
- `verifyDeclaration(html, declared)` on the re-read `pe_avance2`, `declared` the track ids by key: per key, by its
  row: no `NUM_ENV` input and `<b>…REVISADO CONFORME…</b>` → `approved`; `EN REVISION` → `inReview`; an input still
  there with an empty value → `empty`; with the track id declared → `kept`; with another → `mismatch`; no row →
  `missing`. `inReview` means accepted and processing; `empty` without any `inReview` means the declaration was not
  saved; `mismatch` and `missing` are not saved either (settled by the code's review: a page that does not show the
  declaration never passes for one that does).
- `classifyAdvanceAnswer(text)`: `advanced` on `ha pasado al paso` or `ha finalizado con la certificaci`; `unchanged`
  on `ya se encuentra en el paso`; otherwise `failed`; `message` is the first sentence that matched. HTTP is always
  200 and the word "error" is in every page's script, so only the Spanish text counts.
- `parseProgressPage(html)`: `stage` from the first of `paso\s*<b>…</b>`, `etapa[:\s]+<b>…</b>`, `etapa\s*<b>…</b>`,
  `ETAPA\s+DE\s+([A-ZÁÉÍÓÚÑ\s]+)`, upper-cased; per key the first `<b>…</b>` after its label (`SET BASICO`, `SET
  GUIA…DESP`, `SET FACTURA EXENTA`, `SET CASO GENERAL FACTURA COMPRA`, `SET(?: DE)? SIMULACION`, `LIBRO…VENTA`, `LIBRO
  DE COMPRAS` not `PARA EXENTOS`, `LIBRO DE COMPRAS PARA EXENTOS`, `LIBRO…GUIA`) read row by row, never across rows
  (the field's page-wide regexes once took the next row's state); each state classified: `inconsistent` (`NO
  CORRESPONDE`, `NO COINCIDE`, `FECHA INVALIDA`), `approved` (`REVISADO CONFORME`), `inReview` (`EN REVISION`),
  `rejected` (`RECHAZADO`, `ERRORES`, `REPARO`: the field treats observations as a rejection), `pending` (`POR
  REALIZAR`), `annulled` (`ANULADO`), else `unknown`; the stage key through `portalStageOf` (`PORTAL_STAGE_WORDS`:
  `INTERCAMBIO` → `exchange`, `SIMULACION` → `simulation`, `LIBRO` → `books`, and every wording past the exchange,
  `DOCUMENTOS IMPRESOS`, `MUESTRAS IMPRESAS`, `BOLETA`, `AUTORIZADO`, `COMPLETADO`, → `printedSamples`, because the
  compliance declaration tells whether the samples are approved); and `simulationAwaitsConfirmation` when the page
  holds `pe_avance3`, `SET DE SIMULACION` and `Confirmar Revisi`.
- The row states of `pe_avance2` keep phase 4's `parseCertificationSets` (`S01` not declared, `S21` declared, `S25`
  approved, `LNC` book closed, `LRH`, `REVISADO CONFORME`, `EN REVISION`…).

**`certification-books.ts`**

- `parseBookHistory(html)`: rows of six cells (period, operation, state, book kind, periodicity, count with a
  `QDetEstLibro?Codigo=` link) into `{ period: 'YYYY-MM', operation: 'purchase' | 'sale', periodicity: 'monthly' |
  'rectification', state, code }`, periods not `YYYY-MM` ignored; `isUnauthorized(html)` on `NO ESTA AUTORIZADO` or
  `SESION HA EXPIRADO`.

**`certification-compliance.ts`**

- `isBlocked(text)`: `no ha finalizado su certificaci` or `no podr[aá] efectuar la Declaraci`, with the sentence.
- `hasOkMessage(html)`: a hidden `OK_MSG`. `complianceForm(html)`: the form action when it names `pe_avance9`, its
  inputs without the `Salir` button (a browser sends only the clicked button; sending `Salir=No Confirmar` could read
  as cancelling), every `OPC\d+` set to `S`, plus `CONFIRMAR=Confirmar Declaración`.
- `isUnconfirmed(html)`: the final body still shows `NAME="OPC1"` or a text input named `RUT_EMP`.
- `isDeclared(html)`: the positive wording that alone turns the irreversible post into `declared`: `declaración de
  cumplimiento` followed by `efectuad`, `registrad`, `realizad`, `aceptad`, `recibid` or `exitos`, or `ha finalizado …
  certificaci` (settled by the code's review).
- `complianceMessage(text)`: the first sentence matching `declaraci[oó]n de cumplimiento`, `ha finalizado`,
  `certificad[ao]` or `efectuada`.

All of them classify `bodyText(html)`: the whole readable text without the page title, which is the same on every
page and whose words would leak into the sentences read.

### 3.3 Portal operations (`src/portal/certification.ts`)

All on the certification host, with phase 4's `withPortalSession` (login on demand, one caller per certificate, the
refusal pages of D33), `ensurePage` for GETs and `submitForm` for POSTs with the referer of the previous page. The
company fields are `RUT_EMP` (digits) and `DV_EMP` (upper case) from `companyFields`.

- **Entry sequence** (shared): `GET pe_avance1`, then `POST pe_avance2` with `ACEPTAR=Continuar`, referer
  `pe_avance1`. The SII refreshes its state through it; `readProgress` needs it before `pe_avance5`.
- `downloadTestSet(portal, { optionalSets?, download?: true, previousAttentionNumber? })`: `GET pe_generar`; if the
  page says "no inscrito" with a stored session, forget the session and `GET pe_generar` again; still "no inscrito" →
  `SII_PORTAL_REJECTED` with rejection `notEnrolled` (new in `PORTAL_REJECTIONS`); if the page offers `pe_generar1`
  or `Confirmar Empresa`: `POST pe_generar1` with `CODIGO=8`, `ACEPTAR=Confirmar Empresa`, referer `pe_generar`; parse
  the state table and the checkboxes; with `download`: `POST pe_generar2` with `AUTORIZADA` and `TOTAL` as read,
  `SETnn=S` for each requested optional set that the page offers (`DEFAULT_OPTIONAL_SETS`: `SET03` guide, `SET06`
  exempt, `SET07` sales book, `SET08` purchase book, `SET09` guide book, `SET15` purchase book for exempt taxpayers,
  `SET72` purchase set; export `SET11` and settlement `SET84` never by default), always `SET01=S`, referer
  `pe_generar1`, and this post is never retried. A downloaded page that says `no se encuentra autenticado`, or the
  application's front page without a case, means the portal dropped the session: forget it and repeat the whole
  sequence once; twice is `SII_PORTAL_SESSION_EXPIRED`. Result: `{ states, optionalSets, requested, text,
  attentionNumber, regenerated }` where `text` is `setTextOf(html)`. Downloading generates the set anew at the SII:
  the cases change and everything sent for the earlier set is void, so the runner downloads once per certification;
  `regenerated` reports the page's own wording or a changed attention number.
- `declareProgress(portal, { entries })`, `entries` a record by key (`basic`, `guide`, `exempt`, `purchase`,
  `salesBook`, `purchaseBook`, `exemptPurchaseBook`, `guideBook`, `simulation`, `export1`, `export2`, `settlement`) of
  `{ trackId, date }` (`INVALID_OPTION` without entries or with a track id that is not digits, `INVALID_DATE` for a
  date that is not `YYYY-MM-DD`): entry sequence; `parseDeclarationForm`; a status page → `declined` with reason
  `errorStates` or `noForm`; a row without an input (approved or in review) is left out, `simulation` requested but
  unmapped → `declined` with `simulationUnavailable`, no row mapped at all → `declined` with `noRows`; then the form:
  for every index `1..totalRows`, `NUM_ENV{i}`, `FEC_ENV{i}`, `SET{i}` and `EST{i}` (the hidden values; an empty
  string when absent; the current values for rows not declared now), the declared ones with the track id without
  leading zeros (`String(parseInt(trackId, 10))`) and the date as `dd-mm-yyyy`; then `RUT_EMP`, `DV_EMP`, `TOTREG`
  (`10` when the page has none), `ACEPTAR=Confirmar Revisión`, in that order; `POST pe_avance3`, referer `pe_avance2`,
  redirects followed, with the normal retry policy because declaring the same track id twice is harmless;
  `classifyDeclarationAnswer`; a session the answer says is gone is forgotten and thrown as
  `SII_PORTAL_SESSION_EXPIRED`; `inconsistentData` → result `inconsistent` with the sentence; not `accepted` → `failed`
  with `contentMismatch` or what the portal said; then the verification re-read (`POST pe_avance2` with
  `ACEPTAR=Continuar`; a status page there is `SII_PORTAL_UNEXPECTED_PAGE`) and `verifyDeclaration` with the track ids
  declared. The outcome, in the field's order: `contentErrors` when the answer names rows; `notSaved` when any row is
  `missing` or holds another track id; `inReview` or `accepted` when no row is empty (or one is in review) and the
  answer is not "not processed"; `notProcessed`; `allRejected` when every declared row came back empty and none is in
  review (the wrong period: waiting does not fix it); else `notSaved`. Result: `{ outcome, declared, contentErrors,
  verification, detail, answer, answerHtml, formHtml }`, the two pages for the artefacts.
- `readProgress(portal)`: entry sequence, `GET pe_avance5`, `POST pe_avance6` with the company and
  `ACEPTAR=Continuar`, referer `pe_avance5`; `parseProgressPage` (a page with neither stage nor state is
  `SII_PORTAL_UNEXPECTED_PAGE`); when the stage is `SIMULACION` and the page lacks the confirmation indicator, the
  `pe_avance2` page read on the way is tested the same way. Result `{ stage, stageKey, states,
  simulationAwaitsConfirmation, rows }`, `rows` being `pe_avance2` as `queryCertificationSets` reads it.
- `advanceStage(portal)`: entry sequence; `TOTREG` and `PASO` read from the `pe_avance2` hidden inputs (`0` and
  `P01` when absent; `PASO` changes with the stage and a hard-coded value makes the SII answer "ya se encuentra en el
  paso"); `POST pe_avance4` with `RUT_EMP`, `DV_EMP`, `TOTREG`, `PASO`, `ACEPTAR=Avanzar Siguiente Paso`, referer
  `pe_avance2`, never retried; `classifyAdvanceAnswer`. Result `{ outcome: 'advanced' | 'unchanged' | 'failed',
  message }`; `unchanged` is not an error.
- `listBookHistory(portal, { year })` (`INVALID_OPTION` outside 1990–2100): `GET /cgi_dte/UPL/DTEauth?7`, then `GET
  /cgi_dte/UPL/QEstLibro?rutCompany=<digits>&dvCompany=<dv>&TrackId=&year=<year>&month=00&tipo=TODOS` on the
  certification host; `isHistoryUnauthorized` → the session forgotten and `SII_PORTAL_SESSION_EXPIRED`;
  `parseBookHistory`. Result `{ year, entries, occupiedPeriods }`: every period with any entry counts as occupied, as
  the page always says "Recibido" and does not tell a closed book from a received one.
- `declareCompliance(portal)`: `GET pe_avance7`; `POST pe_avance8` with `ACEPTAR=Continuar`, referer `pe_avance7`;
  blocked text → `{ outcome: 'blocked', message }`; with `OK_MSG`: `POST pe_avance8` with every hidden input plus
  `Aceptar=Continuar con la Declaración`, referer `pe_avance8`; blocked → the same; the form naming `pe_avance9`:
  `POST` its action with `complianceForm`, referer `pe_avance8`; blocked → the same; `isUnconfirmed`, or no positive
  wording (`isDeclared`) → `{ outcome: 'unconfirmed', message }`; else `{ outcome: 'declared', message }`. The
  continue post and the final post are never retried. This is the sworn statement the legal representative makes; it
  is irreversible, and the runner makes it only with an explicit go (D75).

### 3.4 State and store

```ts
export type CertificationStage = 'testSets' | 'books' | 'simulation' | 'exchange' | 'printedSamples' | 'compliance' | 'done'
export type SentEnvelope = { readonly trackId: string; readonly date: string; readonly sentAt: string }
export type SentCase = { readonly caseId: string; readonly type: number; readonly folio: number; readonly issueDate: string; readonly transferType?: number; readonly totals: { netAmount?: number; exemptAmount?: number; vatAmount?: number; totalAmount: number } }  // what the books need, so a resumed run rebuilds them
export type SentSet = SentEnvelope & { readonly cases: readonly SentCase[] }
export type SentBook = { readonly trackId: string | null; readonly date: string | null; readonly sentAt: string | null; readonly period: string; readonly submission: 'total' | 'adjustment'; readonly approved?: boolean }  // null for a book the portal already had approved
export type CertificationState = {
  readonly version: 1
  readonly companyRut: string
  readonly setText?: string                      // the downloaded text, also kept as the artefact set-texto.txt
  readonly attentionNumber?: string
  readonly plan?: CertificationPlan              // of planCertificationSets, also kept as estructuras.json
  readonly cafs: readonly string[]               // CAF XML the run holds: private keys, so the store is a secret
  readonly usedFolios: readonly { type: number; folio: number }[]
  readonly sets: Readonly<Partial<Record<'basic' | 'exempt' | 'guide' | 'purchase', SentSet>>>
  readonly setsApproved: boolean
  readonly books: { readonly period?: string; readonly occupiedPeriods: readonly string[]; readonly adjustmentTried: readonly string[]; readonly accumulated: Readonly<Record<string, { purchase?: readonly BookTotals[]; sale?: readonly BookTotals[] }>>; readonly results: Readonly<Partial<Record<'salesBook' | 'purchaseBook' | 'exemptPurchaseBook' | 'guideBook', SentBook>>> }
  readonly simulation?: SentEnvelope & { readonly confirmed?: boolean }
  readonly lastDeclaration?: { readonly scope: 'sets' | 'books' | 'simulation'; readonly outcome: DeclarationOutcome; readonly detail: string | null; readonly at: string }
  readonly diagnosis?: Readonly<Record<string, { code: string; status: string; message: string }>>  // by track id, 3.6.1
  readonly blocked?: string                      // the wording of a compliance block, step 11
  readonly stage: CertificationStage
  readonly updatedAt: string
}
// BookTotals is phase 3's TotalesPeriodo row; `accumulated` keeps the totals of the last total submission of the sales
// and purchase books per period, for an adjustment of the same period.
export type CertificationStore = {
  readonly load: () => Promise<CertificationState | null>
  readonly save: (state: CertificationState) => Promise<void>
  readonly writeArtefact: (name: string, content: string) => Promise<void>
  readonly readArtefact: (name: string) => Promise<string | null>
  readonly listArtefacts: () => Promise<readonly string[]>
}
export const createMemoryCertificationStore = (): CertificationStore
export const createDirectoryCertificationStore = (options: { readonly dir: string }, load?: () => Promise<NodeFsModules>): CertificationStore
```

`createCertificationState(companyRut, now)` starts one. The directory adapter keeps `state.json` (written atomically,
temp file and rename, as the folio registry) and the artefacts as files under `dir`, names with `/` as
sub-directories, each segment `[A-Za-z0-9._-]`, no `.`, no `..`, no absolute paths (`assertArtefactName`,
`INVALID_OPTION { field: 'name' }`); the directories it creates are private to the user (0700) and the files
unreadable by others (0600), because the state holds CAF private keys (settled by the code's review). Artefact
names, the field's: `set-texto.txt`, `estructuras.json` (the plan), `sets-prueba/envio-set-{basico|guia|exenta|compra}.xml`,
`sets-prueba/dtes/dte-{TT}-{FFFFFF}.xml`, `libro-ventas.xml`, `libro-compras.xml`, `libro-compras-exentos.xml`,
`libro-guias.xml`, `simulacion/envio-simulacion.xml`, `simulacion/dtes/dte-{TT}-{FFFFFF}.xml`, and the portal
answers of each declaration attempt (`declaracion-{sets|libros|simulacion}-{n}.html`) for diagnosis.

### 3.5 Dependencies and progress

```ts
export type CertificationDependencies = {
  readonly portal: PortalClient            // phase 4, certification environment
  readonly sii: SiiClient                  // phase 2, certification environment
  readonly store: CertificationStore
  readonly registry: FolioRegistry         // phase 4
  readonly issuer: IssuerInput
  readonly receiver: ReceiverInput
  readonly certificate: Certificate
  readonly resolution: { readonly number: number; readonly date: string }
  readonly now?: () => Date
  readonly sleep?: (ms: number) => Promise<void>
  readonly onProgress?: (event: CertificationProgressEvent) => void
}
export type CertificationProgressEvent =
  | { step: 'SETS_DOWNLOADING' } | { step: 'SETS_LOADED' } | { step: 'SETS_REGENERATED' }
  | { step: 'CAF_REQUESTING'; type: number } | { step: 'CAF_OK'; type: number }
  | { step: 'SET_START'; set: SetKey } | { step: 'SET_OK'; set: SetKey; trackId: string } | { step: 'SET_ERROR'; set: SetKey; error: string }
  | { step: 'SETS_DECLARING' } | { step: 'SETS_DECLARED' }
  | { step: 'POLLING'; attempt: number; max: number; label: 'sets' | 'declaration' | 'books' | 'simulation' }
  | { step: 'SETS_APPROVED' } | { step: 'SETS_REJECTED' }
  | { step: 'BOOKS_START' } | { step: 'BOOK_SKIPPED'; book: BookKey } | { step: 'BOOK_SENDING'; book: BookKey }
  | { step: 'BOOK_OK'; book: BookKey; trackId: string } | { step: 'BOOK_ERROR'; book: BookKey; error: string }
  | { step: 'BOOK_PERIOD_RETRY'; period: string; attempt: number } | { step: 'BOOKS_DECLARING' }
  | { step: 'BOOKS_DONE'; books: readonly BookKey[]; success: boolean }
  | { step: 'ADVANCE_WAITING' } | { step: 'ADVANCE_DONE'; stage: string }
  | { step: 'SIM_START' } | { step: 'SIM_SENDING' } | { step: 'SIM_OK'; trackId: string } | { step: 'SIM_DECLARING' } | { step: 'SIM_DONE' }
  | { step: 'CERT_DONE' } | { step: 'CERT_ERROR'; error: string }
```

The step names are the field's (`CERTIFICATION_STEPS`); the payload keys are English. `SetKey` is `'basic' | 'exempt'
| 'guide' | 'purchase'`, `BookKey` is `'salesBook' | 'purchaseBook' | 'exemptPurchaseBook' | 'guideBook'`; `POLLING`'s
label is `'sets' | 'declaration' | 'books' | 'simulation'`. These live in `src/certification/runtime.ts` with
`StepResult<Outcome> = { state, outcome, detail? }`, what every step returns: the state it saved, how it ended, and
a word or sentence on why. `runtime(deps)` resolves the clock, the sleep (a real `setTimeout` wait by default) and the
emitter; `saveState` writes a changed state through the store with a fresh `updatedAt`.

### 3.6 Steps (`src/certification/steps.ts`)

Each step is `(deps, state, options?) => Promise<StepResult<…>>`; it saves the new state through the store before
returning and keeps the artefacts it produced. Errors of the portal and of phase 2 propagate as the `DteError` they
are; what the field reports as data (a rejection, a time-out) comes back as the outcome and the runner decides.

1. **`obtainTestSet`.** `SETS_DOWNLOADING`; `downloadTestSet`; the text to `set-texto.txt`; `parseTestSetText` and
   `planCertificationSets` of 5b-1; the plan to `estructuras.json`; `attentionNumber` from the first set; state
   `stage: 'testSets'`. A run that already had a plan starts over (outcome `regenerated`, `SETS_REGENERATED`): the SII
   assigns new cases, so the sets, the books and the simulation are cleared and only the CAFs and the used folios
   stay. Otherwise `loaded`; then `SETS_LOADED`. A text with no set → `SII_PORTAL_UNEXPECTED_PAGE`.
2. **`prepareFolios(deps, state, { needs?, fresh? })`.** The folios each type needs are `setFolioNeeds(plan, sent)`,
   the sum of each unsent set plan's `folios` (never more: unused authorized folios make the SII ration the next
   request), or the `needs` given (`simulationFolioNeeds(plan)`: one per case, by type); `fresh` ignores the CAFs in
   hand (the simulation never reuses the sets' CAFs). Per type, in numeric order: `CAF_REQUESTING`; the folios of
   this run inside the CAFs in hand that the SII never received are given back (`folioReceived`, at most 30 checks
   per CAF, a failed check keeps the folio); a CAF older than six months is skipped (the SII refuses its folios); the
   registry's `remaining` over the CAFs in hand counts what is available; missing folios → `queryFolioQuota`; when
   stamping is blocked, or the quota is not unrestricted and its maximum is below the missing, and `FOLIOS_DISP` is
   positive, `reobtainFolios` (a range the registry knows as sent is skipped, a folio is free when the SII has not
   received it); then `requestCafExact` when the quota is unrestricted or its maximum covers the missing,
   `requestCafInBatches` otherwise, the exact request falling back to batches for the rest on `quotaInsufficient`,
   `foliosShort` or `quotaExceeded`; as a last resort, when the refusal is rationing (`quotaInsufficient`,
   `stampingBlocked`, `quotaCapReached`, `personWithPendingIssues`) and `FOLIOS_DISP` is unknown or above the unused
   folios in hand, `annulFolios` within 180 days, at most 10 ranges, never a range of a CAF the run holds (the sets'
   included, whatever `fresh` says), then the request again; `CAF_OK`. The CAF XML obtained joins the state's `cafs`;
   the result's `cafs` are the ones to issue with (in hand plus new, or only new with `fresh`). Still short →
   `FOLIO_OUT_OF_RANGE { type, required, available, maxAuthorized, availableFolios, rejection, reason }` where `reason`
   is `noUnusedFolios` when `FOLIOS_DISP` is 0, else `unusedFoliosBlock`.
3. **`sendTestSet(deps, state, { kind })`.** `SET_START`; `issueTestSet` of 5b-1 with the folio source over the
   state's CAFs and the registry (`registryFolioSource`: the first CAF of the type with a folio left in the registry,
   `reserve` on every take, `FOLIO_OUT_OF_RANGE { type }` when the type is exhausted); the envelope to
   `sets-prueba/envio-set-<name>.xml` and each document to `sets-prueba/dtes/dte-<TT>-<FFFFFF>.xml` before sending
   (phase 5a reads them); `uploadEnvelope`; whatever the outcome, the folios are marked sent in the registry and
   recorded in `usedFolios`; on success the state's `sets[kind] = { trackId, date: chileDate(now), sentAt, cases }`,
   each case with its issue date, transfer type and totals (what the books need on a resumed run), and `SET_OK`; on
   a `DteError` `SET_ERROR` and the error propagates. Without the set's plan, `MISSING_FIELD { field: 'plan', kind }`.
4. **`declareTestSets`.** `SETS_DECLARING`; entries from `state.sets` (`MISSING_FIELD { field: 'sets' }` with none);
   the declaration loop of 3.6.1 with label `declaration` and prefix `declaracion-sets`; `SETS_DECLARED` when accepted
   or in review; the outcome as the step's, and in `lastDeclaration` with any diagnosis.
5. **`waitForTestSetsApproval`.** 5 attempts, 10 s apart, sleeping first: `POLLING` (`sets`), `readProgress`, the
   states of the sent sets; every one `approved` → `setsApproved: true`, `stage: 'books'`, `SETS_APPROVED`, outcome
   `approved`; any `rejected` or `inconsistent` → `SETS_REJECTED`, outcome `rejected` with the wordings; an empty
   list of sets is not approval (D73). After the attempts, `timedOut`.
6. **`runBooks`** (`src/certification/books-step.ts`; `MISSING_FIELD { field: 'plan' }` without a plan). `BOOKS_START`.
   (a) History: `listBookHistory` from the current Chile year down to 1990, each year under a 12 s timeout, stopping
   after two consecutive empty years; a year that cannot be read is logged and counted as empty, so a failing portal
   does not take the scan to 1990 (the field would); every period with an entry is occupied, with the ones the state
   already had. (b) Period: the one the state kept, else the month of the basic set's send date in Chile (the set is
   dated the day it is issued and the period must match: one month earlier gives "ENVIO CON ERRORES O REPAROS"), else
   this month; then down month by month while occupied (`nextFreePeriod`, at most 400 steps). (c) Books already
   `REVISADO CONFORME` on `pe_avance2` are skipped (`BOOK_SKIPPED`, a result with `trackId: null` and `approved`).
   (d) Each book, in the order purchase, sales, guide, purchase for exempt taxpayers (only with a plan): `BOOK_SENDING`;
   built with 5b-1 for the period (the purchase books from the plan, the sales and guide books from the cases the
   sent sets kept; a missing plan or set is a `BOOK_ERROR`); the XML to its artefact; `uploadBook` with the field file
   names (`LibroCV.xml`, `LibroCVExentos.xml`, `LibroGuia.xml`); a purchase book the SII calls a duplicate
   (`duplicado` or `cvc-` in the refusal) goes again as an adjustment submission with the totals kept for the period;
   `BOOK_OK`, or `BOOK_ERROR` and the book out of the results; after a total submission of the sales or purchase book
   its period totals are kept in the state. (e) When a mandatory book is neither sent nor skipped, `BOOKS_DONE
   { success: false }` and outcome `incomplete` naming it; when every wanted book is already approved, `approved` at
   once. (f) SOAP look: 15 s, then up to 3 polls 15 s apart of `queryUploadStatus` per sent book (10 consecutive
   failures give it up); a terminal answer is kept as a diagnosis; the declaration never waits for it (the SII leaves
   books in `LSO` far longer than worth waiting; only an immediate schema rejection shows here). (g)
   `BOOKS_DECLARING`; `declareProgress` with the sent books **and** the four sets (the portal resets to `S01` any row
   the declaration leaves empty); the loop of 3.6.1 with label `books` and prefix `declaracion-libros`; no book to
   declare is `declined`/`noBooks`. (h) While the outcome is `allRejected` (the period is wrong), at most 24 times:
   with totals kept for the period and no adjustment tried yet there, `BOOK_PERIOD_RETRY` with the same period and
   the sales and purchase books resent as adjustments, the others as total submissions; else the period marked
   occupied, the next free month below it taken (`BOOK_PERIOD_RETRY` with it) and every book not approved resent as a
   total submission; after each resend 15 s and up to 20 polls 15 s apart of `queryUploadStatus`: a rejection takes
   the book out of the results and, when it is a closed book (`LNC`), marks the period occupied; declare again. A
   declaration that is neither accepted nor in review after that ends the phase as `rejected`. (i) Approval wait: 40
   attempts, 15 s apart, sleeping first, `POLLING` (`books`), `queryCertificationSets`, each book by its exact row
   name: `REVISADO CONFORME` or `S25` is approved (the result marked); `LNC`, `LRH`, `RECHAZADO` or `ERROR` is
   rejected; anything else keeps waiting; every second attempt `queryUploadStatus` of the pending books ends the
   wait on a rejection (the portal shows `S21` forever for a closed book); a rejection ends the wait at once; after
   the attempts the books still pending count as rejected uploads. (j) While not every wanted book is approved and
   the wait named failed books, at most 24 times: they are resent as in (h), declared again (a declaration that is not
   accepted or in review stops), waited again. (k) `BOOKS_DONE { books, success }` where `success` means every wanted
   book is approved; the outcome is `approved`, `timedOut` when the last wait ran out, else `rejected`, with the
   books it gave up on.
7. **`advanceToNextStage`** (the step; `advanceStage` is the operation). `ADVANCE_WAITING`; the operation; `advanced`
   or `unchanged` both fine (`unchanged` is the portal saying the stage was already there, D73); `failed` →
   `SII_PORTAL_REJECTED` with rejection `advanceRefused` and the message in details; then `readProgress`,
   `ADVANCE_DONE { stage }`, and the state's stage moved to the portal's when that is later.
8. **`sendSimulation`.** `SIM_START`; `prepareFolios` for `simulationFolioNeeds(plan)` with `fresh` (never the sets'
   CAFs); `issueSimulation` of 5b-1 over the folio source of those CAFs; artefacts `simulacion/envio-simulacion.xml`
   and `simulacion/dtes/…`; `SIM_SENDING`; `uploadEnvelope`; folios marked sent whatever the outcome; `simulation =
   { trackId, date, sentAt }`; `SIM_OK`.
9. **`declareSimulation`.** If `readProgress` already stands at the exchange or later, outcome `skipped` with the
   stage moved; else `SIM_DECLARING` and the loop of 3.6.1 with the `simulation` entry, label `simulation`, prefix
   `declaracion-simulacion`, retrying also on `allRejected` (the portal shows `S21` while it is still processing the
   track id); the outcome in `lastDeclaration`.
10. **`waitForSimulationApproval`.** 30 attempts, 10 s apart, polling first and sleeping after each: `readProgress`;
    the exchange or a stage past it → `done`; `simulationAwaitsConfirmation` → declare the simulation again (the
    portal's "Confirmar Revisión" of an approved simulation), re-read, and the exchange, an approved simulation or no
    offer left → `confirmed`, else keep polling; the simulation state `approved` → `done`, `rejected` → `rejected`
    with the wording. `done` and `confirmed` mark the simulation confirmed, move the stage to the exchange and emit
    `SIM_DONE`. After the attempts, `queryUploadStatus` of the simulation track id: a rejection is the answer
    (`rejected`, with the SII code and gloss kept as a diagnosis: a time-out often hides an envelope the SII rejected,
    as a signature error once did), else `timedOut`.
11. **`declareComplianceFinal`.** `advanceToNextStage` first (an `unchanged` with "DOCUMENTOS IMPRESOS" means the
    samples are still under review); then `declareCompliance`; `blocked` → `stage: 'compliance'` with the sentence in
    `blocked`, outcome `blocked`; `unconfirmed` → `SII_PORTAL_UNEXPECTED_PAGE`; `declared` → `stage: 'done'`, a
    previous block forgotten, `CERT_DONE`.

**3.6.1 The declaration loop** (`declareWithRetries`). Shared by sets, books and the simulation: 10 s first; then up
to 10 attempts, 5 s apart, each `POLLING` with the label: `declareProgress`; the answer and the form of each attempt
to the artefacts `<prefix>-<n>.html` and `<prefix>-pe_avance2-<n>.html`; `notProcessed` and `notSaved` → retry;
`contentErrors` → retry while the verification shows an empty row (the track ids were not available yet), else
diagnose (below) and stop with `contentErrors`; `allRejected` → stop (retry only with `retryOnAllRejected`, the
simulation); `accepted` or `inReview` → stop with it; `inconsistent`, `declined`, `failed` → stop at once. Diagnosis:
for every declared entry, `queryUploadStatus` by track id on the SOAP channel (never the receipts REST endpoint: it
answers for another kind of track id) and its code, class and gloss into the state's `diagnosis` and its raw answer
into `<prefix>-estado-<key>-<trackId>.xml`; a failed query only warns on the portal's logger.

### 3.7 Runner

```ts
export type RunCertificationOptions = { readonly until?: CertificationStage; readonly optionalSets?: readonly string[]; readonly declareCompliance?: boolean }
export type RunStop = 'done' | 'exchange' | 'compliance' | 'until' | 'blocked' | 'rejected' | 'timedOut' | 'incomplete'
export type RunCertificationResult = { readonly state: CertificationState; readonly stopped: RunStop; readonly detail?: string }
export const runCertification = (deps: CertificationDependencies, options?: RunCertificationOptions): Promise<RunCertificationResult>
```

The runner loads the state (or starts one for the portal client's company, else the issuer's), then, by stage:
`testSets` → `obtainTestSet` (unless the plan is there), `prepareFolios`, `sendTestSet` for each of basic, guide,
exempt, purchase planned and not yet sent, `declareTestSets` (not accepted or in review → `rejected`),
`waitForTestSetsApproval` (`rejected` or `timedOut` as it says); `books` → `runBooks` (`incomplete`, `rejected` or
`timedOut` as it says), then `advanceToNextStage`, the stage forced to `simulation` when the portal's wording is not
one the page module knows (the field goes on); `simulation` → `sendSimulation` unless sent, and unless confirmed
`declareSimulation` (not skipped, accepted or in review → `rejected`) and `waitForSimulationApproval` (`rejected` or
`timedOut`), then the stage `exchange`. At `exchange` or `printedSamples` the runner reads the portal: past the
exchange moves the state to `compliance`; anything else returns `stopped: 'exchange'` for phase 5c. At `compliance`
it stops with `stopped: 'compliance'` unless `declareCompliance: true`, then `declareComplianceFinal` (`blocked`, or
`done`). `until` returns `stopped: 'until'` once the state stands past that stage, checked after every phase, the
compliance included. A `DteError` of any step propagates after the state is saved, with a `CERT_ERROR` event. Nothing
is repeated: a set with a track id is not sent again, a book approved is skipped, a regenerated set clears everything
but the CAFs.

### 3.8 Errors

- `SII_PORTAL_REJECTED` with new rejections in `PORTAL_REJECTIONS`: `notEnrolled` ("no está inscrito en Postulación"),
  `advanceRefused`, `declarationDeclined` (status page, no form, simulation unavailable), `complianceBlocked` is not
  an error (data).
- `SII_PORTAL_SESSION_EXPIRED` from `QEstLibro`, from a declaration answer that says so, and from a set download the
  portal drops twice.
- `SII_PORTAL_UNEXPECTED_PAGE` when a page has none of the expected markers (no set table, no set text, a re-read
  that is no form, no stage, no `pe_avance9` form, a final page that does not confirm).
- `FOLIO_OUT_OF_RANGE` with the shortage details of step 2, or `{ type }` from the folio source.
- `INVALID_OPTION` for no entries, a track id that is not digits, a year outside 1990–2100, an unsafe artefact name;
  `INVALID_DATE` for a declaration date that is not `YYYY-MM-DD`; `MISSING_FIELD` for a missing plan, set or
  simulation.
- Phase 2 codes pass through from the uploads and status queries; phase 4 codes from the session and the folio flows.
- Messages carry codes and keys; the HTML and the SII glosses live in `details` and in the artefacts.

### 3.9 Public API additions

Runtime exports added to the root and to `RUNTIME_EXPORTS`:

- **Portal:** `downloadTestSet`, `declareProgress`, `readProgress`, `advanceStage`, `listBookHistory`,
  `declareCompliance`.
- **State:** `createMemoryCertificationStore`, `createDirectoryCertificationStore`.
- **State:** also `createCertificationState`, `assertArtefactName`.
- **Steps:** `obtainTestSet`, `prepareFolios`, `setFolioNeeds`, `simulationFolioNeeds`, `sendTestSet`,
  `declareTestSets`, `waitForTestSetsApproval`, `runBooks`, `previousPeriod`, `nextFreePeriod`, `advanceToNextStage`,
  `sendSimulation`, `declareSimulation`, `waitForSimulationApproval`, `declareComplianceFinal`.
- **Runner:** `runCertification`.
- **Catalog:** `SET_KEYS`, `BOOK_KEYS`, `MANDATORY_BOOK_KEYS`, `BOOK_FILE_NAMES`, `BOOK_ARTEFACT_NAMES`,
  `SET_ARTEFACT_NAMES`, `DEFAULT_OPTIONAL_SETS`, `CERTIFICATION_STAGES`, `PORTAL_STAGE_WORDS`, `CERTIFICATION_STEPS`.

Types: `CertificationState`, `CertificationStage`, `CertificationStep`, `CertificationStore`,
`CertificationDependencies`, `CertificationProgressEvent`, `PollingLabel`, `StepResult`, `SentEnvelope`, `SentCase`,
`SentSet`, `SentBook`, `BooksState`, `AccumulatedTotals`, `EnvelopeDiagnosis`, `SetKey`, `BookKey`,
`DeclarationKey`, `DownloadTestSetInput`, `DownloadedTestSet`, `DeclarationEntry`, `DeclarationEntries`,
`DeclareProgressInput`, `DeclarationOutcome`, `DeclarationResult`, `ProgressReport`, `AdvanceResult`, `BookHistory`,
`BookHistoryEntry`, `ComplianceResult`, `PrepareFoliosOptions`, `PrepareFoliosResult`, `BooksOutcome`,
`RunCertificationOptions`, `RunCertificationResult`, `RunStop`, `DirectoryCertificationStoreOptions`, the page types,
and from 5b-1 `BookCaseTotals`, `SalesBookCase`, `GuideBookCase`, `SalesBookSource`, `GuideBookSource`.

### 3.10 Typical flows

```ts
const deps = {
  portal: createPortalClient({ environment: 'certification', certificate, companyRut }),
  sii: createSiiClient({ environment: 'certification', certificate, companyRut }),
  store: createDirectoryCertificationStore({ dir: './certification' }),
  registry: createDirectoryFolioRegistry({ dir: './folios' }),
  issuer, receiver, certificate, resolution: { number: 0, date: resolutionDate },
  onProgress: (event) => console.log(event.step),
}

// The whole HTML side, resumable: run it again after a fix or after phase 5c
const first = await runCertification(deps)            // stops at 'exchange' when the simulation is confirmed
// … phase 5c: exchange and printed samples …
const second = await runCertification(deps, { declareCompliance: true }) // the sworn statement, with an explicit go

// One step alone, after the SII rejected a set with observations
let state = (await deps.store.load())!
state = (await sendTestSet(deps, state, { kind: 'basic' })).state
state = (await declareTestSets(deps, state)).state
```

### 3.11 Tests

- **Pages:** synthetic HTML in `tests/support/certification-pages.ts` with invented data and the portal's quirks:
  Latin-1 entities, rows without `</tr>`, unquoted attributes, the hidden `TOTREG`, `PASO` and `EST` fields, a
  `pe_avance2` before and after a set is approved (the indexes move), a status page without a form, a `pe_avance3`
  answer for each class (success, not processed, inconsistent data with its sentence, session expired, content
  mismatch, content errors naming two rows), a `pe_avance4` answer for each class, a `pe_avance6` with every state and
  with the simulation awaiting confirmation, a `QEstLibro` table with the three states, the compliance screens
  (blocked, `OK_MSG`, the `pe_avance9` form with `Salir` and eight `OPC`, the unconfirmed final page). Every parser is
  table-driven.
- **Operations:** the phase 4 fake portal (`portalWith`), asserting the order of requests, every field and its order
  (`NUM_ENV1, FEC_ENV1, SET1, EST1, … RUT_EMP, DV_EMP, TOTREG, ACEPTAR`), referers, the track id without leading
  zeros, the date as `dd-mm-yyyy`, the absence of `Salir`, the `SETnn` ticked, `SET01` always, the forgotten session
  on "no inscrito".
- **Steps and runner:** one fake transport behind the portal client and the SII client
  (`tests/support/certification-harness.ts`: the tokens and the session seeded, `sleep` recorded, `now` fixed, the
  events recorded, a memory store and a memory registry), the plan from the 5b-1 synthetic set text; each step's
  state transitions, events, artefacts and retries (every branch of the declaration loop, the period search with
  occupied periods and adjustments, the closed book seen through SOAP, the 24 rounds, the book wait with the SOAP
  cross-check, the simulation confirmation, the compliance block and the explicit go); the runner's resume from every
  stage and its stop reasons; the directory store round trip in a temporary directory with its file modes;
  `node:fs` failing → `TRANSPORT_UNAVAILABLE`.
- **Folios:** `prepareFolios` against the quota, request, reobtain and annul pages of phase 4's harness: reuse,
  the unreceived folios given back, exact, batches and the fallback, re-obtaining, the annul last resort that never
  touches a CAF in hand, the shortage error.
- **Live:** none. Nothing in this phase can be measured until the company is enrolled (section 6).
- Coverage stays at 100 % on the four metrics.

### 3.12 Build and docs

- `.size-limit.json`: both limits to 80 kB (D74). Measured at the plan's tip: ESM 70.41 kB, CJS 70.67 kB.
- No new dependency.
- `README.md`: a "Certification: the runner" section with the flows of 3.10 and what 5c adds; `CHANGELOG.md` entry;
  `llms.txt` paragraph.

---

## 4. Glossary additions (public contract)

| Term | Meaning |
|---|---|
| Declaring progress (declarar avance) | Telling the portal the track id and date of each envelope so the SII reviews it against the set; the same form serves the sets, the books and the simulation |
| Stage (etapa, paso) | Where the application stands: test sets, simulation, exchange, printed samples, compliance; the portal moves it with "Avanzar Siguiente Paso" |
| Book history (QEstLibro) | The page listing the books the SII holds per period; any entry makes the period unusable for a new total submission |
| Closed book (LNC) | The SII's answer to a book sent for a period it already holds; the cure is another period or an adjustment |
| Accumulated totals (totales acumulados) | The period totals of a sent book, kept so an adjustment submission can carry them |
| Confirmation of the simulation | The second declaration of the simulation once the SII approved it, which moves the stage to the exchange |
| Declaration of compliance (declaración de cumplimiento) | The sworn statement of the legal representative that closes the certification; irreversible |

---

## 5. Decisions reviewed with Hans

| # | Decision | Outcome |
|---|---|---|
| 1 | Steps plus a resumable runner, a store port, typed progress (D65, D68, D69) | Hans's, 2026-11-04 |
| 2 | The size cap to 80 kB instead of the first subpath entry (D74) | Hans's, 2026-11-04 |
| 3 | Section 1 (layers, files, data flow, Chile dates) | Approved in chat, 2026-11-04 |
| 4 | Sections 3.2 to 3.12 | Written on his go-ahead; amended by what the plan's code settled; pending his review of this file |
| 5 | The declaration of compliance needs `declareCompliance: true`; annulling never touches a CAF the run holds; a compliance post is `declared` only on a positive wording; a re-read that does not show the declaration is not saved; the posts that change the application are never retried; the store's files are private (the review of the plan's code) | Claude's, 2026-11-04; to confirm with Hans |

---

## 6. What is measured and what is not

**From the public SII manual (2009):** the six steps of the certification, "Declarar Avance de la Postulación" as the
way to tell the SII the date and number of each envelope, the two-month validity of a set, the simulation of 10 to
100 documents, the exchange by e-mail in the manual's time (the field uses `pfeInternet` today), the samples by
e-mail then (`pdfdteInternet` today), the declaration of compliance by the legal representative.

**Field behaviour known to carry a certification to its end (the rules of section 3):** the page shapes, field
names and wordings; the moving indexes; the declaration loop and its stop conditions; the period search and the
closed-book retries; the approval waits; the simulation confirmation; the compliance wizard and its block.

**Measured on the plan's code (2026-11-04, a throwaway branch cut from `canary` at `524eebc`, one commit per task):**
each task's tests fail on the previous commit and pass with it; at the tip Prettier, ESLint, `tsc`, 2 231 tests with
coverage at 100 % on the four metrics, build, size (ESM 70.41 kB, CJS 70.67 kB against the 80 kB limit) and the
real-data scan pass. The books step suite alone takes about two minutes: it builds and signs dozens of books. Every
rule of section 3 is exercised on synthetic pages and a fake SII with the clock and the sleep injected.

**Not measured, and not measurable until the company is enrolled:** every page of this phase. The phase 4 probe saw
`pe_avance1`/`pe_avance2` refuse the company as not authorized; nothing else has been seen by this SDK. The first
enrolled run must keep every portal answer as an artefact and turn them into fixtures.

---

## 7. Deferred improvements and field defects not reproduced

Kept as the field does them (to be reconsidered after a real run):

1. The waits and retries (5 × 10 s for sets, 40 × 15 s for books, 30 × 10 s for the simulation, 24 period retries,
   400 skips), measured in the field, not here.
2. The book history scan down the years, one page per year, until two empty years.
3. The diagnosis of a content error through the SOAP status of every declared envelope.

Field defects not reproduced (D73):

1. A wait for the books that advanced at once because it read a field the progress result did not have.
2. "Ya se encuentra en el paso" reported as an unknown error.
3. An empty list of sets counted as approved.
4. The declaration date from the process clock in UTC; here the Chile date (D70).
5. A production folio page fetched without its first step, mistaken for a refusal (phase 5c's receipts track).

Settled by the plan's code and its review, beyond the field (section 5, row 5):

1. The declaration of compliance needs `declareCompliance: true`; the runner stops in front of it otherwise.
2. Annulling never touches a CAF the run holds, the sets' included, even when the simulation asks for fresh ones.
3. A compliance post is `declared` only on a positive wording of the final page; a re-read of the declaration form
   that lacks the row or holds another track id is "not saved"; a re-read that is no form is an unexpected page.
4. The posts that change the application (generating the set, advancing, the compliance screens) are never retried.
5. The directory store creates private directories and files, because the state holds CAF private keys.
6. A year of the book history that cannot be read counts as empty, so a failing portal does not take the scan to
   1990 (the field scans on).
7. An observation (`REPAROS`) on the progress page is a rejection, as the field's own wait treats it; there is no
   separate `observed` state.
8. The totals kept for an adjustment are those of the last total submission of the period, not a running sum: a
   second total submission in the same period never happens (an adjustment goes instead).

---

## Appendix A. Facts from the SII manual used

- "Manual para empresas usuarias, ambiente de certificación factura electrónica" (sii.cl, February 2009), pages 26 to
  29: the test set and the books (step 1), the simulation (step 2), the exchange (step 3), the printed samples
  (step 4), the declaration of compliance (step 5) and the authorization (step 6); envelopes of the set are evaluated
  against the last set downloaded and must arrive within two months; "Declarar Avance de la Postulación" names the
  date and number of each envelope.
