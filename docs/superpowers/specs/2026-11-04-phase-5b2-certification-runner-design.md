# dte-sdk — Phase 5b-2 design (certification: declarations, books and the runner)

Date: 2026-11-04 · Status: **written on Hans's go-ahead after section 1 was approved in chat; the API shape (D65) and the size cap (D74) were his decisions** · Author: Claude (with Hans)

Starting point: the phase 5b-1 spec (D57–D64) and the phase 2, 3 and 4 specs. Decisions continue at D65. SII facts come
from the public "Manual para empresas usuarias, ambiente de certificación factura electrónica" (2009) and from field
behaviour known to carry a certification from the test sets to the declaration of compliance; section 6 says which is
which and what has never been seen by this SDK. No third-party implementation is named in the repository; the SII
behaviour is described directly.

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
simulation, the set text). Memory and directory adapters ship; a service may back it with its own storage. The
artefact names are the field's, so phase 5a's batch and phase 5c's steps find them where they expect them. The field
keeps the same facts in object fields, in a state store and in a debug directory.

### D69. Progress as typed events, never stdout

`onProgress` receives `{ step, ...payload }` with the field's step names and payloads (3.5). The library writes
nothing to the console.

### D70. Chile dates

The declaration date (`FEC_ENV`) and the base book period come from `chileDate(now)`: the day and month in
America/Santiago. The field takes the local date for the declaration and the UTC month for the period and requires
`TZ=America/Santiago`; between 21:00 and midnight in Chile a process in UTC declared the next day and the SII answered
"FECHA NO CORRESPONDE AL ENVIO".

### D71. Folios through phase 4 and the registry

`prepareFolios` reuses the CAFs the store holds, reads the quota, re-obtains lost ranges, requests the missing folios
exactly or in batches, and annuls unused ranges only as a last resort and within a window, with `requestCafExact`,
`requestCafInBatches`, `reobtainFolios`, `annulFolios` and `queryFolioQuota` of phase 4. Every folio a set or the
simulation uses is marked sent in the registry right after the send is attempted, whatever the outcome; a whole
envelope the SII rejects with `RCT`, `RFR` or `RSC` gives its folios back. The field learnt both the hard way: unused
authorized folios trigger rationing, and a reused folio rejects the next envelope with "Error en Firma".

### D72. Waits and retries as the field, with the clock injected

The counts and delays of section 3.6 are the field's. `sleep` and `now` are injectable so the tests run in no time.
A definitive refusal ("FECHA/RUT/FOLIO NO CORRESPONDE") stops at once: waiting never fixes it.

### D73. Field defects not copied

Section 7 lists what the field does that this phase does not reproduce: a wait that advanced without checking
because it read a field that did not exist, a "no change" answer reported as an unknown error, an empty list of sets
counted as approved, a progress page fetched without the company post.

### D74. Root entry; the size cap goes to 80 kB

The root stands at 53.6 kB with phase 4b and about 60 kB with 5b-1; this phase adds the pages, the operations and the
runner, about 15 to 20 kB. The cap goes to 80 kB for both formats. Subpath entry points stay the question of issue 5
before 0.1.0.

### D75. The GWT steps stay in 5c; the runner stops and resumes around them

After the simulation is confirmed the stage is `INTERCAMBIO`. The runner returns with `stage: 'exchange'`; phase 5c
runs the exchange and the printed-samples upload; the runner, called again, finds the stage past `DOCUMENTOS
IMPRESOS` and declares compliance.

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
src/certification/state.ts                        CertificationState, CertificationStore, memory adapter
src/certification/node-store.ts                   directory adapter (node:fs on first use)
src/certification/steps.ts                        the steps of 3.6 and the dependency object
src/certification/runner.ts                       runCertification
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
  attention number (`NUMERO DE ATENCI…: n`) different from the previous one.

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
- `verifyDeclaration(html, declared)` on the re-read `pe_avance2`: per declared key, by its row: no `NUM_ENV` input
  and `<b>…REVISADO CONFORME…</b>` → `approved`; `EN REVISION` → `inReview`; an input still there with an empty value →
  `empty`; else `kept`. `inReview` means accepted and processing; `empty` without any `inReview` means the declaration
  was not saved.
- `classifyAdvanceAnswer(text)`: `advanced` on `ha pasado al paso` or `ha finalizado con la certificaci`; `unchanged`
  on `ya se encuentra en el paso`; otherwise `failed`; `message` is the first sentence that matched. HTTP is always
  200 and the word "error" is in every page's script, so only the Spanish text counts.
- `parseProgressPage(html)`: `stage` from the first of `paso\s*<b>…</b>`, `etapa[:\s]+<b>…</b>`, `etapa\s*<b>…</b>`,
  `ETAPA\s+DE\s+([A-ZÁÉÍÓÚÑ\s]+)`, upper-cased; per key the first `<b>…</b>` after its label (`SET BASICO`, `SET
  GUIA…DESP`, `SET FACTURA EXENTA`, `SET CASO GENERAL FACTURA COMPRA`, `SET(?: DE)? SIMULACION`, `LIBRO…VENTA`, `LIBRO
  DE COMPRAS` not `PARA EXENTOS`, `LIBRO DE COMPRAS PARA EXENTOS`, `LIBRO…GUIA`) read row by row, never across rows
  (the field's page-wide regexes once took the next row's state); each state classified: `approved` (`REVISADO
  CONFORME`), `inReview` (`EN REVISION`), `rejected` (`RECHAZADO`, `ERRORES`), `observed` (`REPAROS`), `pending` (`POR
  REALIZAR`), `annulled` (`ANULADO`), `inconsistent` (`NO CORRESPONDE`, `NO COINCIDE`, `FECHA INVALIDA`); and
  `simulationAwaitsConfirmation` when the page holds `pe_avance3`, `SET DE SIMULACION` and `Confirmar Revisi`.
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
- `complianceMessage(text)`: the first sentence matching `declaraci[oó]n de cumplimiento`, `ha finalizado`,
  `certificad[ao]` or `efectuada`.

### 3.3 Portal operations (`src/portal/certification.ts`)

All on the certification host, with phase 4's `withPortalSession` (login on demand, one caller per certificate, the
refusal pages of D33), `ensurePage` for GETs and `submitForm` for POSTs with the referer of the previous page. The
company fields are `RUT_EMP` (digits) and `DV_EMP` (upper case) from `companyFields`.

- **Entry sequence** (shared): `GET pe_avance1`, then `POST pe_avance2` with `ACEPTAR=Continuar`, referer
  `pe_avance1`. The SII refreshes its state through it; `readProgress` needs it before `pe_avance5`.
- `downloadTestSet(portal, { optionalSets?, download?: true })`: `GET pe_generar`; if the page says "no inscrito"
  with a stored session, forget the session and `GET pe_generar` again; still "no inscrito" → `SII_PORTAL_REJECTED`
  with rejection `notEnrolled` (new in `PORTAL_REJECTIONS`); if the page offers `pe_generar1` or `Confirmar
  Empresa`: `POST pe_generar1` with `CODIGO=8`, `ACEPTAR=Confirmar Empresa`, referer `pe_generar`; parse the state
  table and the checkboxes; with `download`: `POST pe_generar2` with `AUTORIZADA` and `TOTAL` as read, `SETnn=S` for
  each requested optional set that the page offers (defaults `SET03` guide, `SET06` exempt, `SET07` sales book, `SET08`
  purchase book, `SET09` guide book, `SET15` purchase book for exempt taxpayers, `SET72` purchase set; export `SET11`
  and settlement `SET84` never by default), always `SET01=S`, referer `pe_generar1`. A downloaded page that says `no se
  encuentra autenticado`, or `postulacion factura electronica` without `caso`, means the portal dropped the session:
  forget it and repeat once. Result: `{ states, optionalSets, text, attentionNumber, regenerated }` where `text` is
  `setTextOf(html)`. The page also says when the set was just generated: `regenerated` is true and a run in progress
  must start over.
- `declareProgress(portal, { entries })`, `entries` a record by key (`basic`, `guide`, `exempt`, `purchase`,
  `salesBook`, `purchaseBook`, `exemptPurchaseBook`, `guideBook`, `simulation`) of `{ trackId, date }`: entry
  sequence; `parseDeclarationForm`; a status page with entries → `declined` with reason `errorStates` or
  `noForm`; `simulation` requested but unmapped → `declined` with `simulationUnavailable`; then the form: for every
  index `1..totalRows`, `NUM_ENV{i}`, `FEC_ENV{i}`, `SET{i}` and `EST{i}` (the hidden values; an empty string when
  absent; the current values for rows not declared now), the declared ones with the track id without leading zeros
  (`String(parseInt(trackId, 10))`) and the date as `dd-mm-yyyy`; then `RUT_EMP`, `DV_EMP`, `TOTREG`, `ACEPTAR=Confirmar
  Revisión`, in that order; `POST pe_avance3`, referer `pe_avance2`, redirects followed; `classifyDeclarationAnswer`;
  `inconsistentData` → result `inconsistent` with the detail; not `accepted` → `failed` with the reason (session,
  content mismatch, empty, invalid); then the verification re-read (`POST pe_avance2` with `ACEPTAR=Continuar`) and
  `verifyDeclaration`; `allRejected` when nothing is in review, no content error, and every declared row came back
  empty (the wrong period); `contentErrors` from the answer. Result:
  `{ outcome: 'accepted' | 'inReview' | 'notProcessed' | 'contentErrors' | 'allRejected' | 'notSaved' | 'inconsistent' | 'declined' | 'failed', declared, contentErrors, verification, detail? }`.
- `readProgress(portal)`: entry sequence, `GET pe_avance5`, `POST pe_avance6` with `ACEPTAR=Continuar`, referer
  `pe_avance5`; `parseProgressPage`; when the stage is `SIMULACION` and the page lacks the confirmation indicator, the
  `pe_avance2` page is read too and tested the same way. Result `{ stage, states, simulationAwaitsConfirmation }`.
- `advanceStage(portal)`: entry sequence; `TOTREG` and `PASO` read from the `pe_avance2` hidden inputs (`0` and
  `P01` when absent; `PASO` changes with the stage and a hard-coded value makes the SII answer "ya se encuentra en el
  paso"); `POST pe_avance4` with `ACEPTAR=Avanzar Siguiente Paso`, referer `pe_avance2`, redirects followed;
  `classifyAdvanceAnswer`. Result `{ outcome: 'advanced' | 'unchanged' | 'failed', message }`; `unchanged` is not an
  error.
- `listBookHistory(portal, { year })`: `GET /cgi_dte/UPL/DTEauth?7`, then `GET /cgi_dte/UPL/QEstLibro?rutCompany=
  <digits>&dvCompany=<dv>&TrackId=&year=<year>&month=00&tipo=TODOS` on the certification host; `isUnauthorized` →
  `SII_PORTAL_SESSION_EXPIRED`; `parseBookHistory`. Every period with any entry counts as occupied: the page always
  says "Recibido" and does not tell a closed book from a received one.
- `declareCompliance(portal)`: `GET pe_avance7`; `POST pe_avance8` with `ACEPTAR=Continuar`, referer `pe_avance7`;
  blocked text → `{ outcome: 'blocked', message }`; with `OK_MSG`: `POST pe_avance8` with every hidden input plus
  `Aceptar=Continuar con la Declaración`, referer `pe_avance8`; blocked → the same; the form naming `pe_avance9`:
  `POST` its action with `complianceForm`, referer `pe_avance8`; blocked → the same; `isUnconfirmed` → `{ outcome:
  'unconfirmed' }`; else `{ outcome: 'declared', message }`. This is the sworn statement the legal representative
  makes; it is irreversible, and the runner reaches it only when the stage says the samples were approved.

### 3.4 State and store

```ts
export type CertificationStage = 'testSets' | 'books' | 'simulation' | 'exchange' | 'printedSamples' | 'compliance' | 'done'
export type SentEnvelope = { readonly trackId: string; readonly date: string; readonly sentAt: string; readonly status?: string }
export type CertificationState = {
  readonly version: 1
  readonly companyRut: string
  readonly environment: 'certification'
  readonly setText?: string                      // the downloaded text, also kept as the artefact set-texto.txt
  readonly attentionNumber?: string
  readonly plan?: CertificationPlan              // of planCertificationSets
  readonly cafs: readonly string[]               // CAF XML the run holds, by type order
  readonly usedFolios: readonly { type: number; folio: number }[]
  readonly sets: Readonly<Partial<Record<'basic' | 'exempt' | 'guide' | 'purchase', SentEnvelope & { cases: readonly { caseId: string; type: number; folio: number }[] }>>>
  readonly setsApproved: boolean
  readonly books: { readonly period?: string; readonly occupiedPeriods: readonly string[]; readonly adjustmentTried: readonly string[]; readonly accumulated: Readonly<Record<string, { purchase?: BookTotals[]; sale?: BookTotals[] }>>; readonly results: Readonly<Partial<Record<'salesBook' | 'purchaseBook' | 'exemptPurchaseBook' | 'guideBook', SentEnvelope & { approved?: boolean }>>> }
  readonly simulation?: SentEnvelope & { readonly confirmed?: boolean }
  readonly diagnosis?: Readonly<Record<string, { status: string; gloss?: string; errors: readonly string[] }>>  // by track id, 3.6.1
  readonly blocked?: string                      // the wording of a compliance block, step 11
  readonly stage: CertificationStage
  readonly updatedAt: string
}
export type BookTotals = { readonly type: number; readonly count: number; readonly net: number; readonly exempt: number; readonly vat: number; readonly total: number }  // one TotalesPeriodo row, as phase 3 computes it
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

The directory adapter keeps `state.json` (written atomically, temp file and rename, as the folio registry) and the
artefacts as files under `dir`, names with `/` as sub-directories, no `..`, no absolute paths. Artefact names, the
field's: `set-texto.txt`, `estructuras.json` (the plan), `sets-prueba/envio-set-{basico|guia|exenta|compra}.xml`,
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

The step names are the field's; the payload keys are English. `SetKey` is `'basic' | 'exempt' | 'guide' |
'purchase'`, `BookKey` is `'salesBook' | 'purchaseBook' | 'exemptPurchaseBook' | 'guideBook'`.

### 3.6 Steps (`src/certification/steps.ts`)

Each step is `(deps, state, options?) => Promise<CertificationState>`; it saves the new state through the store
before returning and keeps the artefacts it produced. Errors of the portal and of phase 2 propagate as the `DteError`
they are; a step that the field reports as data (a rejection, a time-out) returns it in the state and the runner
decides.

1. **`obtainTestSet`.** `SETS_DOWNLOADING`; `downloadTestSet`; the text to `set-texto.txt`; `parseTestSetText` and
   `planCertificationSets` of 5b-1; the plan to `estructuras.json`; `attentionNumber` from the first set; state
   `stage: 'testSets'`, sets cleared when the set was regenerated (`SETS_REGENERATED`: the SII assigns new cases and
   everything sent so far is void); `SETS_LOADED`. A text with no set → `SII_PORTAL_UNEXPECTED_PAGE`.
2. **`prepareFolios`.** The folios each type needs are the sum over the sets that will run (never more: unused
   authorized folios make the SII ration the next request) plus, for the simulation, one per case. Per type:
   `CAF_REQUESTING`; CAFs the store already holds for the type whose range still has folios the registry has not
   used are reused, except those older than six months (the SII refuses their folios); else `queryFolioQuota`; when stamping is blocked or the quota is short and `FOLIOS_DISP` is
   positive, `reobtainFolios`; then `requestCafExact` when `MAX_AUTOR` covers the missing folios, `requestCafInBatches`
   otherwise, falling back to batches on `MAX_AUTOR_INSUFICIENTE` or `FOLIOS_INSUFICIENTES`; as a last resort, and only
   when the refusal is rationing (`MAX_AUTOR_INSUFICIENTE`, `TIMBRAJE_BLOQUEADO`, `TOPE_SII_INSUFICIENTE`,
   `PERSONA_CON_SITUACIONES_PENDIENTES`) and the quota shows unused folios, `annulFolios` within 180 days in
   certification, at most 10 ranges, excluding the CAFs in hand, then the quota and the request again; `CAF_OK`. The
   obtained CAF XML goes to the state (`cafs`). Still short → `FOLIO_OUT_OF_RANGE` with `{ type, required, available,
   maxAuthorized, remainingQuota, reason }` where `reason` is `noUnusedFolios` when the quota shows none left to
   annul or recover, else `unusedFoliosBlock`.
3. **`sendTestSet(kind)`.** `SET_START`; `issueTestSet` of 5b-1 with a `FolioSource` over the state's CAFs and the
   registry (every `take` reserves in the registry); the envelope to `sets-prueba/envio-set-<name>.xml` and each
   document to `sets-prueba/dtes/dte-<TT>-<FFFFFF>.xml` before sending (phase 5a reads them); `uploadEnvelope`;
   whatever the outcome, the folios are marked sent in the registry and recorded in `usedFolios`; on success the
   state's `sets[kind] = { trackId, date: chileDate(now), sentAt, cases }` and `SET_OK`; on a `DteError` `SET_ERROR`
   and the error propagates.
4. **`declareTestSets`.** `SETS_DECLARING`; entries from `state.sets`; the declaration loop of 3.6.1 with label
   `declaration`; `SETS_DECLARED` when accepted or in review; the outcome in the state.
5. **`waitForTestSetsApproval`.** 5 attempts, 10 s apart, sleeping first: `POLLING` (`sets`), `readProgress`, the
   states of the sent sets; every one `approved` → `setsApproved: true`, `SETS_APPROVED`; any `rejected` or
   `inconsistent` → `SETS_REJECTED` and the states in the result; `observed` keeps waiting; an empty list of sets is
   not approval (D73). After the attempts, `timedOut`.
6. **`runBooks`.** `BOOKS_START`. (a) History: `listBookHistory` from the current year down, each year under a 12 s
   timeout (a year that fails is skipped), stopping after two consecutive empty years; every period with an entry is
   occupied. (b) Period: the month of the first document of the purchase-book plan, in Chile time (the set is dated
   the day it is issued and the period must match: one month earlier gives "ENVIO CON ERRORES O REPAROS"), then
   down month by month while occupied (at most 400 steps). (c) Books already
   `REVISADO CONFORME` on `pe_avance2` are skipped (`BOOK_SKIPPED`). (d) Each book, in the order purchase, sales,
   guide, purchase for exempt taxpayers (only with a plan): `BOOK_SENDING`; built with 5b-1 (`createCertification*`)
   for the period; a purchase book the SII calls a duplicate (`duplicado` or `cvc-`) is rebuilt as an adjustment
   submission with the accumulated totals and sent again; the XML to its artefact; `uploadBook` with the field file
   names (`LibroCV.xml`, `LibroCVExentos.xml`, `LibroGuia.xml`); `BOOK_OK` or `BOOK_ERROR`; after a successful total
   submission of the sales or purchase book its period totals are accumulated in the state. (e) When the three
   mandatory books are not sent or skipped, stop here. (f) SOAP pre-check: 15 s, then up to 3 polls 15 s apart of
   `queryUploadStatus` per book; a terminal rejection is noted; the declaration never waits for it (the SII leaves
   books in `LSO` far longer than worth waiting; only an immediate schema rejection shows here). (g)
   `BOOKS_DECLARING`; `declareProgress` with the books **and** the four sets (the portal resets to `S01` any row the
   declaration leaves empty); the loop of 3.6.1 with label `books`. (h) While the outcome is `allRejected` (the period
   is wrong), at most 24 times: with accumulated totals for the period and no adjustment tried yet, resend the sales
   and purchase books as adjustments (`BOOK_PERIOD_RETRY` with the same period); else mark the period occupied, step
   down to the next free month (`BOOK_PERIOD_RETRY` with it) and resend every book not yet approved as a total
   submission; after each resend, 15 s and up to 20 polls 15 s apart of `queryUploadStatus`: a rejection names a
   closed book (`LNC`) and marks the period occupied; declare again. (i) Approval wait: 40 attempts, 15 s apart,
   sleeping first, `POLLING` (`books`), `queryCertificationSets`: `REVISADO CONFORME` or `S25` is approved; `LNC`,
   `LRH`, `RECHAZADO` or `ERROR` is rejected; `S21` keeps waiting; every second attempt `queryUploadStatus` of the
   pending books ends the wait early on a rejection (the portal shows `S21` forever for a closed book). On success
   `BOOKS_DONE { success: true }`. (j) While not approved, at most 24 times: the failed books (`LNC`, `LRH`,
   `RECHAZADO`, or `S21` after the wait) are resent as in (h), the sales and purchase books as adjustments when
   their period has accumulated totals, every other as a total submission in the next free period; declared again;
   waited again. (k) `BOOKS_DONE { books, success }` where `success` means the three mandatory books were sent or
   skipped, not approved; the approval is in the state per book.
7. **`advanceStage`.** `ADVANCE_WAITING`; the operation; `advanced` or `unchanged` both fine (`unchanged` is the
   portal saying the stage was already there, D73); `failed` → `SII_PORTAL_REJECTED` with rejection `advanceRefused`
   and the message in details; then `readProgress` and `ADVANCE_DONE { stage }`.
8. **`sendSimulation`.** `SIM_START`; `prepareFolios` for the simulation's needs with fresh CAFs (never the sets');
   `issueSimulation` of 5b-1; artefacts `simulacion/envio-simulacion.xml` and `simulacion/dtes/…`; `SIM_SENDING`;
   `uploadEnvelope`; folios marked sent; `simulation = { trackId, date, sentAt }`; `SIM_OK`.
9. **`declareSimulation`.** If `readProgress` already says stage `INTERCAMBIO`, nothing to do; else `SIM_DECLARING`
   and the loop of 3.6.1 with the `simulation` entry, label `simulation`, retrying also on `allRejected` (the portal
   shows `S21` while it is still processing the track id).
10. **`waitForSimulationApproval`.** 30 attempts, 10 s apart, polling first: `readProgress`; stage `INTERCAMBIO` →
    done; a stage past it (`DOCUMENTOS IMPRESOS`, `MUESTRAS IMPRESAS`, `BOLETA`, `AUTORIZADO`, `COMPLETADO`) → done;
    `simulationAwaitsConfirmation` → declare the simulation again (the portal's "Confirmar Revisión" of an approved
    simulation), re-read, `INTERCAMBIO` or no form left → `confirmed`; the simulation state `approved` → done,
    `rejected` → `rejected`; else sleep. After the attempts, `queryUploadStatus` of the simulation track id: a
    rejection is the answer (`rejected`, with the SII code and gloss: a time-out often hides an envelope the SII
    rejected, as a signature error once did), else `timedOut`. `SIM_DONE` on done or confirmed.
11. **`declareComplianceFinal`.** `advanceStage` first (an `unchanged` with "DOCUMENTOS IMPRESOS" means the samples
    are still under review); then `declareCompliance`; `blocked` → the state keeps `stage: 'compliance'` with
    `blocked: true` and the message; `unconfirmed` → `SII_PORTAL_UNEXPECTED_PAGE`; `declared` → `stage: 'done'`,
    `CERT_DONE`.

**3.6.1 The declaration loop.** Shared by sets, books and the simulation: 10 s first; then up to 10 attempts, 5 s
apart, each `POLLING` with the label: `declareProgress`; the portal answer of each attempt to its artefact;
`notProcessed` → retry; `contentErrors` → retry only while the verification says `notSaved` (the track ids were not
available yet), else diagnose (below) and stop with `contentErrors`; `allRejected` → stop (retry only for the
simulation); `notSaved` → retry; `accepted` or `inReview` → stop with it; `inconsistent`, `declined`, `failed` →
stop at once. Diagnosis: for every declared entry, `queryUploadStatus` by track id on the SOAP channel (never the
receipts REST endpoint: it answers for another kind of track id) and the status, gloss and document errors into the
state's `diagnosis` and the artefacts; never fatal.

### 3.7 Runner

```ts
export type RunCertificationOptions = { readonly until?: CertificationStage; readonly optionalSets?: readonly string[] }
export type RunCertificationResult = { readonly state: CertificationState; readonly stopped: 'done' | 'exchange' | 'blocked' | 'rejected' | 'timedOut'; readonly detail?: string }
export const runCertification = (deps: CertificationDependencies, options?: RunCertificationOptions): Promise<RunCertificationResult>
```

The runner loads the state (or starts one), then, by stage: `testSets` → `obtainTestSet` (unless the plan is there),
`prepareFolios`, `sendTestSet` for each of basic, guide, exempt, purchase not yet sent, `declareTestSets`,
`waitForTestSetsApproval`; approved → `books` → `runBooks`, then `advanceStage` → `simulation` → `sendSimulation`,
`declareSimulation`, `waitForSimulationApproval`; done → `exchange`. At `exchange` or `printedSamples` the runner reads the portal
progress: a stage past `DOCUMENTOS IMPRESOS` moves the state to `compliance`; anything else returns `stopped:
'exchange'` for phase 5c. `compliance` → `declareComplianceFinal`. A rejection, a block or a time-out returns with
the matching `stopped` and the state saved; a `DteError` of the portal, of phase 2 or of the folio preparation
propagates after the state is saved. `until` stops after that stage. Nothing is repeated: a set with a track id is not sent again,
a book approved is skipped, a regenerated set clears everything.

### 3.8 Errors

- `SII_PORTAL_REJECTED` with new rejections in `PORTAL_REJECTIONS`: `notEnrolled` ("no está inscrito en Postulación"),
  `advanceRefused`, `declarationDeclined` (status page, no form, simulation unavailable), `complianceBlocked` is not
  an error (data).
- `SII_PORTAL_SESSION_EXPIRED` from `QEstLibro` and from a declaration answer that says so.
- `SII_PORTAL_UNEXPECTED_PAGE` when a page has none of the expected markers (no set text, no stage, no `pe_avance9`
  form, an unconfirmed compliance).
- `FOLIO_OUT_OF_RANGE` with the shortage details of step 2.
- `INVALID_OPTION` for an unknown set key or an invalid year.
- Phase 2 codes pass through from the uploads and status queries; phase 4 codes from the session and the folio flows.
- Messages carry codes and keys; the HTML and the SII glosses live in `details` and in the artefacts.

### 3.9 Public API additions

Runtime exports added to the root and to `RUNTIME_EXPORTS`:

- **Portal:** `downloadTestSet`, `declareProgress`, `readProgress`, `advanceStage`, `listBookHistory`,
  `declareCompliance`.
- **State:** `createMemoryCertificationStore`, `createDirectoryCertificationStore`.
- **Steps:** `obtainTestSet`, `prepareFolios`, `sendTestSet`, `declareTestSets`, `waitForTestSetsApproval`,
  `runBooks`, `sendSimulation`, `declareSimulation`, `waitForSimulationApproval`, `declareComplianceFinal`
  (`advanceStage` is the portal operation and the step).
- **Runner:** `runCertification`.
- **Catalog:** `CERTIFICATION_STAGES` (the portal stage wordings and their keys), `CERTIFICATION_STEPS` (the progress
  step names).

Types: `CertificationState`, `CertificationStage`, `CertificationStore`, `CertificationDependencies`,
`CertificationProgressEvent`, `SentEnvelope`, `DownloadedTestSet`, `DeclarationEntries`, `DeclarationResult`,
`ProgressReport`, `AdvanceResult`, `BookHistoryEntry`, `ComplianceResult`, `RunCertificationOptions`,
`RunCertificationResult`, and the page types.

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
const second = await runCertification(deps)           // declares compliance once the samples are approved

// One step alone, after the SII rejected a set with observations
let state = (await deps.store.load())!
state = await sendTestSet(deps, state, { kind: 'basic' })
state = await declareTestSets(deps, state)
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
- **Steps and runner:** the fake portal plus the phase 2 fake SII (`createFakeSii`) for uploads and status,
  `sleep` injected and counted, `now` fixed, a memory store and a memory registry; the plan from the 5b-1 synthetic
  set text; each step's state transitions, events, artefacts and retries (every branch of the declaration loop, the
  period search with occupied periods and adjustments, the book wait with the SOAP cross-check, the simulation
  confirmation, the compliance block); the runner's resume from every stage and its stop reasons; the directory
  store round trip in a temporary directory; `node:fs` failing → `TRANSPORT_UNAVAILABLE`.
- **Folios:** `prepareFolios` against fake quota, request, reobtain and annul pages of phase 4's harness: reuse,
  exact, batches, the rationing refusals, the annul window, the shortage error.
- **Live:** none. Nothing in this phase can be measured until the company is enrolled (section 6).
- Coverage stays at 100 % on the four metrics.

### 3.12 Build and docs

- `.size-limit.json`: both limits to 80 kB (D74). The plan records the measured sizes.
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
| 4 | Sections 3.2 to 3.12 | Written on his go-ahead; pending his review of this file |

---

## 6. What is measured and what is not

**From the public SII manual (2009):** the six steps of the certification, "Declarar Avance de la Postulación" as the
way to tell the SII the date and number of each envelope, the two-month validity of a set, the simulation of 10 to
100 documents, the exchange by e-mail in the manual's time (the field uses `pfeInternet` today), the samples by
e-mail then (`pdfdteInternet` today), the declaration of compliance by the legal representative.

**Field behaviour known to carry a certification to its end (the rules of section 3):** the page shapes, field
names and wordings; the moving indexes; the declaration loop and its stop conditions; the period search and the
closed-book retries; the approval waits; the simulation confirmation; the compliance wizard and its block.

**Not measured, and not measurable until the company is enrolled:** every page of this phase. The phase 4 probe saw
`pe_avance1`/`pe_avance2` refuse the company as not authorized; nothing else has been seen by this SDK. The first
enrolled run must keep every portal answer as an artefact and turn them into fixtures.

---

## 7. Deferred improvements and field defects not copied

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

---

## Appendix A. Facts from the SII manual used

- "Manual para empresas usuarias, ambiente de certificación factura electrónica" (sii.cl, February 2009), pages 26 to
  29: the test set and the books (step 1), the simulation (step 2), the exchange (step 3), the printed samples
  (step 4), the declaration of compliance (step 5) and the authorization (step 6); envelopes of the set are evaluated
  against the last set downloaded and must arrive within two months; "Declarar Avance de la Postulación" names the
  date and number of each envelope.
