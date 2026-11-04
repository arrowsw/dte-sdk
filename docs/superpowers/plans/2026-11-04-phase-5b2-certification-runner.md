# Phase 5b-2 — certification: declarations, books and the runner: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The HTML side of the certification portal, as the field runs it: obtain the test set, get the folios, send what phase 5b-1 builds through phase 2, declare each envelope on the portal, wait for the SII's review, choose and retry the book period, advance the stage, run the simulation, and declare compliance; everything resumable from a saved state, with typed progress events. The GWT portals (exchange, printed samples, receipts) stay in phase 5c.

**Architecture:** Four layers of free functions over `readonly` data. Pure page modules in `src/portal/pages/` turn the portal's HTML into data. Six operations in `src/portal/certification.ts` run on the phase 4 session (`withPortalSession`, `ensurePage`, `submitForm`). The steps in `src/certification/` (`steps.ts`, `folios-step.ts`, `books-step.ts`) take a dependency object (`portal`, `sii`, `store`, `registry`, the company, the clock, `sleep`, `onProgress`) and the `CertificationState`, and return the saved state with an outcome. `runCertification` chains them in the field's order and resumes from the `CertificationStore` (memory and directory adapters). Phase 5b-1 builds the documents, envelopes and books; phase 2 uploads and queries the status; phase 4 gets the folios.

**Tech Stack:** TypeScript 5.9 (strict), Node ≥ 20, Jest 30 + ts-jest, expect-type, ESLint 9 + Prettier, esbuild, size-limit. No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-04-phase-5b2-certification-runner-design.md` (section 2 holds the decisions D65–D75, section 3 the rules and the API, section 6 what is and is not measured, section 7 what is deferred on purpose and the field defects not copied).

---

## This plan's code has already run

This plan was generated from a throwaway branch cut from `canary` at `524eebc` (with phase 5b-1 merged), where the code was written and made to pass, with one commit per task. On that branch each task was checked in order: its tests alone fail on the previous commit, and with the task applied `tsc` compiles and the tests pass. At the tip, on 2026-11-04: Prettier, ESLint, `tsc`, 2 231 tests with coverage at 100 % on the four metrics, build, size (ESM 70.41 kB, CJS 70.67 kB against the 80 kB limit) and scan all pass.

So copy the code as it is. If a test fails, something around it changed since then, such as `canary`: investigate that before changing the code.

**Nothing here has met the SII.** Every page shape, wording and wait reproduces field behaviour known to carry a certification from the test sets to the declaration of compliance; none of it has been seen by this SDK, because the company is not enrolled (spec section 6). The first enrolled run must keep every portal answer the store writes as an artefact and turn them into fixtures.

## Conventions that apply to EVERY task

1. **Branch:** work on a branch cut from `canary`. Commands run from the repository root. Run `npm ci` first.
2. **Commits:** one per task, with the message given, in English, with a prose body saying why, ending with the `Co-Authored-By` line your session prescribes.
3. **Diffs:** a modified file comes as a unified diff, relative to the repository root. Save it to a temporary file outside the repository and run `git apply <file>`. A new file comes whole.
4. **Bilingual JSDoc is mandatory** on every exported symbol and every type field, one `EN:` line and one `ES:` line, the `ES:` naming the SII tag. The code below already has it.
5. **No classes** (only `DteError`). `readonly` types everywhere. No module-level state; the counters of a loop live in its closure.
6. **No PII in error messages:** values go in `details`, never in `message`.
7. **Coverage** reaches 100 % at Task 7; before that it dips, which is why the per-task commands use `--coverage=false`. The books step suite takes about two minutes: it builds and signs dozens of books.
8. **No real data:** fixture RUTs come from the allow-list in `scripts/scan-real-data.mjs`, the pages, texts and names are invented, and `npm run scan` checks it.
9. **Nothing public names any third-party implementation:** not code, comments, tests, fixtures, commits or the pull request. Describe the SII behaviour directly.
10. **Nothing in this plan calls the SII,** and the default test run never does.
11. **You own the pull request.** The session that runs this plan is the sole owner of its PR and of every review note or post-merge follow-up on it. Run `gh pr list` before opening anything.

## File map

```
src/catalogs/certification.ts                     (modify) task 1   set, book and declaration keys; stage words; step names
src/catalogs/portal.ts                            (modify) task 1   rejections notEnrolled, advanceRefused, declarationDeclined
src/portal/html.ts                                (modify) task 1   bodyText, hiddenInputs
src/portal/pages/certification-set.ts             (create) task 1   pe_generar1/2
src/portal/pages/certification-progress.ts        (create) task 1   pe_avance2/3/4/6
src/portal/pages/certification-books.ts           (create) task 1   QEstLibro
src/portal/pages/certification-compliance.ts      (create) task 1   pe_avance7/8/9
tests/support/certification-pages.ts              (create) task 1   synthetic portal pages
tests/portal/pages-certification-*.test.ts        (create) task 1
tests/portal/html.test.ts                         (modify) task 1
src/portal/certification.ts                       (modify) task 2   the six operations
tests/portal/certification-operations.test.ts     (create) task 2
src/certification/state.ts                        (create) task 3   CertificationState, CertificationStore, memory adapter
src/certification/node-store.ts                   (create) task 3   directory adapter
tests/certification/state.test.ts                 (create) task 3
src/certification/runtime.ts                      (create) task 4   dependencies, events, StepResult, runtime, saveState
src/certification/folios-step.ts                  (create) task 4   prepareFolios, the folio source over the registry
src/certification/steps.ts                        (create) task 4   obtain, send, declare, wait, advance (the simulation in task 6)
src/certification/books.ts                        (modify) task 4   SalesBookSource, GuideBookSource, submission, previousTotals
tests/support/certification-harness.ts            (create) task 4   one fake transport behind both clients
tests/certification/steps-sets.test.ts            (create) task 4
tests/certification/books.test.ts                 (modify) task 4
src/certification/books-step.ts                   (create) task 5   runBooks
tests/certification/books-step.test.ts            (create) task 5
src/certification/steps.ts                        (modify) task 6   the simulation and compliance steps
src/certification/runner.ts                       (create) task 6   runCertification
tests/certification/steps-simulation.test.ts      (create) task 6
tests/certification/runner.test.ts                (create) task 6
src/index.ts                                      (modify) task 7
tests/public-api.test.ts                          (modify) task 7
tests/types.test.ts                               (modify) task 7
.size-limit.json                                  (modify) task 7   80 kB
README.md / CHANGELOG.md / llms.txt               (modify) task 7
```

---

## Task 1: The certification portal pages

The pure parsers of the certification portal (spec 3.2): `pe_generar1`/`pe_generar2` (the set table, the optional sets, the set text, "no está inscrito", a regenerated set), `pe_avance2` (the rows by label with the index of their `NUM_ENV` input, the hidden fields, the current values, `TOTREG`), the classification of a `pe_avance3` answer, the verification of the re-read form, the `pe_avance4` answer, the progress page (`pe_avance6`) read row by row, `QEstLibro`, and the compliance wizard screens (the block, `OK_MSG`, the `pe_avance9` form without `Salir`, the positive confirmation wording). `src/portal/html.ts` gains `bodyText` (the page text without its title) and `hiddenInputs`; the catalog gains the set, book and declaration keys, the stage words, the step names, and the portal catalog three rejections. Every parser runs on synthetic pages with the old portal's quirks.

**Files:**

- Create: `src/portal/pages/certification-set.ts`
- Create: `src/portal/pages/certification-progress.ts`
- Create: `src/portal/pages/certification-books.ts`
- Create: `src/portal/pages/certification-compliance.ts`
- Modify: `src/catalogs/certification.ts`
- Modify: `src/catalogs/portal.ts`
- Modify: `src/portal/html.ts`
- Test (create): `tests/support/certification-pages.ts`
- Test (create): `tests/portal/pages-certification-set.test.ts`
- Test (create): `tests/portal/pages-certification-progress.test.ts`
- Test (create): `tests/portal/pages-certification-books.test.ts`
- Test (create): `tests/portal/pages-certification-compliance.test.ts`
- Test (modify): `tests/portal/html.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/support/certification-pages.ts` (new file, whole):

```ts
// Synthetic pages of the certification portal (`pe_generar*`, `pe_avance*`, `QEstLibro`), with the quirks of the old
// portal: HTML 4.01, attributes with or without quotes, entities for accents, rows without `</tr>`. Nothing here was
// copied from the SII: the shapes follow the field, the data is invented.
import { page } from './portal-pages'
import { FULL_SET_TEXT } from './test-set-samples'

export const SET_ENTRY = page(
  `<form action="/cvc_cgi/dte/pe_generar1" method=post><input type=text name=RUT_EMP><input type=text name=DV_EMP><input type=hidden name=CODIGO value=8><input type=submit name=ACEPTAR value="Confirmar Empresa"></form>`,
)

export const NOT_ENROLLED = page(
  '<p>El contribuyente no est&aacute; inscrito en Postulaci&oacute;n Factura Electr&oacute;nica</p>',
)

export const SESSION_DROPPED = page('<p>Usted no se encuentra autenticado. Ingrese nuevamente.</p>')

export const FRONT_PAGE = page('<h1>Postulaci&oacute;n Factura Electr&oacute;nica</h1><p>Bienvenido</p>')

export const setGenerationForm = (options = ['SET03', 'SET06', 'SET07', 'SET08', 'SET09', 'SET11', 'SET15', 'SET72']) =>
  page(`<table>
<tr><td><font>Set</font></td><td><font>Set Obtenido</font></td></tr>
<tr><td><font>SET BASICO</font></td><td><font>SI</font></td></tr>
<tr><td><font>SET GUIA DE DESPACHO</font></td><td><font>NO</font></td>
<tr><td><font></font></td><td><font>x</font></td></tr>
</table>
<form action="/cvc_cgi/dte/pe_generar2" method=post>
<input type=hidden name=AUTORIZADA value=S><input type=hidden name="TOTAL" value="15">
${options.map((code, index) => (index % 2 === 0 ? `<input type=checkbox name=${code}> Set ${code}<br>` : `<input type="checkbox" name="${code}"> Set ${code}<br>`)).join('\n')}
<input type=text name=OTRO value=1>
<input type=submit name=ACEPTAR value=Generar></form>`)

export const setDownloadPage = (text = FULL_SET_TEXT, banner = ''): string =>
  page(`${banner}<pre>${text.replace(/á/g, '&aacute;')}</pre><script>var error = 0;</script>`)

export type DeclarationRowSpec = {
  readonly label: string
  readonly index?: number
  readonly state?: string
  readonly value?: string
  readonly date?: string
  readonly est?: string
}

/** The `pe_avance2` form: rows with an input carry `NUM_ENV{index}`, rows without one show only their state. */
export const declarationFormPage = (
  rows: readonly DeclarationRowSpec[],
  options: { readonly totreg?: number; readonly paso?: string } = {},
): string =>
  page(`<form name=form1 action="/cvc_cgi/dte/pe_avance3" method=post>
<input type=hidden name=TOTREG value=${options.totreg ?? rows.length}><input type=hidden name=PASO value=${options.paso ?? 'P01'}>
<table>
${rows
  .map((row) =>
    row.index === undefined
      ? `<tr><td><font>${row.label}</font></td><td><b>${row.state ?? 'REVISADO CONFORME'}</b></td></tr>`
      : `<tr><td><font>${row.label}</font></td><td><input type=text name=NUM_ENV${row.index} value="${row.value ?? ''}"><input type="text" name="FEC_ENV${row.index}" value='${row.date ?? ''}'><input type=hidden name=SET${row.index} value=S0${row.index}><input type=hidden name=EST${row.index} value=${row.est ?? 'S01'}>${row.state === undefined ? '' : `<b>${row.state}</b>`}</td></tr>`,
  )
  .join('\n')}
</table><input type=submit name=ACEPTAR value="Confirmar Revisi&oacute;n"></form>`)

export const STANDARD_ROWS: readonly DeclarationRowSpec[] = [
  { label: 'SET BASICO', index: 1 },
  { label: 'SET GUIA DE DESPACHO', index: 2 },
  { label: 'SET FACTURA EXENTA', index: 3 },
  { label: 'SET CASO GENERAL FACTURA COMPRA', index: 4 },
  { label: 'LIBRO DE VENTAS', index: 5 },
  { label: 'LIBRO DE COMPRAS', index: 6 },
  { label: 'LIBRO DE GUIAS', index: 7 },
]

export const STATUS_PAGE = page(
  '<table><tr><td><font>SET BASICO</font></td><td><b>ENVIO CON ERRORES O REPAROS</b></td></tr></table><input type=submit value=Volver>',
)

export const DECLARATION_ANSWERS = {
  success: page('<p>Avance declarado exitosamente.</p><script>var error = 1;</script>'),
  updated: page('<p>Registro actualizado. Se produjo un error menor.</p>'),
  notProcessed: page('<p>El env&iacute;o no ha sido procesado a&uacute;n. Intente m&aacute;s tarde.</p>'),
  inconsistent: page('<p>Hubo un problema. LA FECHA DE ENVIO NO CORRESPONDE AL ENVIO 123. Verifique los datos.</p>'),
  sessionExpired: page('<p>Error de Sesi&oacute;n: usted no se encuentra autenticado.</p>'),
  contentMismatch: page('<p>El contenido no corresponde al set asignado.</p>'),
  contentErrors: page(
    '<table><tr><td>SET BASICO</td><td>ENVIO CON ERRORES O REPAROS</td></tr><tr><td>LIBRO DE COMPRAS PARA EXENTOS</td><td>ENVIO CON ERRORES O REPAROS</td></tr><tr><td>LIBRO DE COMPRAS</td><td>EN REVISION</td></tr></table>',
  ),
  plainError: page('<p>Se produjo un error al registrar el avance.</p>'),
} as const

export const ADVANCE_ANSWERS = {
  advanced: page('<p>Atenci&oacute;n. La empresa ha pasado al paso de SIMULACION. Contin&uacute;e.</p>'),
  finished: page('<p>La empresa ha finalizado con la certificaci&oacute;n.</p>'),
  unchanged: page('<p>La empresa ya se encuentra en el paso SIMULACION.</p>'),
  failed: page('<p>No es posible avanzar: faltan sets por revisar.</p>'),
} as const

export type ProgressStates = Readonly<Partial<Record<string, string>>>

/** The `pe_avance6` page: the stage in bold after "paso", one row per set or book with its state in bold. */
export const progressPage = (
  stage: string,
  states: ProgressStates = {},
  options: { readonly confirm?: boolean; readonly wording?: 'paso' | 'etapa' | 'etapaColon' | 'etapaDe' } = {},
): string => {
  const rows = Object.entries(states)
    .map(([label, state]) => `<tr><td>${label}</td><td><b>${state}</b></td></tr>`)
    .join('\n')
  const heading =
    options.wording === 'etapa'
      ? `<p>Etapa <b>${stage}</b></p>`
      : options.wording === 'etapaColon'
        ? `<p>Etapa: <b>${stage}</b></p>`
        : options.wording === 'etapaDe'
          ? `<p>ETAPA DE ${stage}</p>`
          : `<p>La empresa se encuentra en el paso <b>${stage}</b></p>`
  const confirm = options.confirm
    ? `<form action="/cvc_cgi/dte/pe_avance3" method=post><table><tr><td>SET DE SIMULACION</td><td><b>REVISADO CONFORME</b></td></tr></table><input type=submit name=ACEPTAR value="Confirmar Revisi&oacute;n"></form>`
    : ''
  return page(`${heading}<table>${rows}</table>${confirm}`)
}

export const bookHistoryPage = (
  rows: readonly (readonly [string, string, string, string, string, string | null])[],
): string =>
  page(`<table>
<tr><th>Periodo</th><th>Operacion</th><th>Estado</th><th>Tipo</th><th>Periodicidad</th><th>Cantidad</th></tr>
${rows
  .map(
    ([period, operation, state, kind, periodicity, code]) =>
      `<tr><td>${period}</td><td>${operation}</td><td>${state}</td><td>${kind}</td><td>${periodicity}</td><td>${code === null ? '1' : `<a href="QDetEstLibro?Codigo=${code}&x=1">1</a>`}</td></tr>`,
  )
  .join('\n')}
</table>`)

export const HISTORY_UNAUTHORIZED = page('<p>NO ESTA AUTORIZADO PARA ESTA CONSULTA</p>')
export const HISTORY_EXPIRED = page('<p>SU SESION HA EXPIRADO</p>')

export const COMPLIANCE_ENTRY = page(
  `<form action="/cvc_cgi/dte/pe_avance8" method=post><input type=text name=RUT_EMP><input type=text name=DV_EMP><input type=submit name=ACEPTAR value=Continuar></form>`,
)
export const COMPLIANCE_BLOCKED = page(
  '<p>Estimado contribuyente. Usted no podr&aacute; efectuar la Declaraci&oacute;n de Cumplimiento porque no ha finalizado su certificaci&oacute;n. Vuelva m&aacute;s tarde.</p>',
)
export const COMPLIANCE_OK_MSG = page(
  `<form action="/cvc_cgi/dte/pe_avance8" method=post><input type=hidden name=OK_MSG value=1><input type=hidden name=RUT_EMP value=76543210><input type=hidden name=DV_EMP value=3><input type=submit name=Aceptar value="Continuar con la Declaraci&oacute;n"></form>`,
)
export const COMPLIANCE_FORM = page(
  `<form name=frm action="/cvc_cgi/dte/pe_avance9" method=post><input type=hidden name=RUT_EMP value=76543210><input type=hidden name=DV_EMP value=3>
${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<input type=radio name=OPC${n} value=S> Si <input type="radio" name="OPC${n}" value=N> No<br>`).join('\n')}
<input type=submit name=CONFIRMAR value="Confirmar Declaraci&oacute;n"><input type=submit name=Salir value="No Confirmar"></form>`,
)
export const COMPLIANCE_DECLARED = page(
  '<p>Su Declaraci&oacute;n de Cumplimiento ha sido efectuada. La empresa ha finalizado el proceso de certificaci&oacute;n.</p>',
)
export const COMPLIANCE_UNCONFIRMED = page(
  '<form action="/cvc_cgi/dte/pe_avance9"><input type=radio name="OPC1" value=S></form>',
)
```

`tests/portal/pages-certification-set.test.ts` (new file, whole):

```ts
import {
  attentionNumberOf,
  isNotEnrolled,
  isSessionDropped,
  isSetRegenerated,
  parseSetGeneration,
  setTextOf,
} from '../../src/portal/pages/certification-set'
import { parseTestSetText } from '../../src/certification/set-text'
import {
  FRONT_PAGE,
  NOT_ENROLLED,
  SESSION_DROPPED,
  SET_ENTRY,
  setDownloadPage,
  setGenerationForm,
} from '../support/certification-pages'
import { page } from '../support/portal-pages'
import { ATTENTION, FULL_SET_TEXT } from '../support/test-set-samples'

test('the generation page: states without the header row, the checkboxes, the hidden fields', () => {
  const parsed = parseSetGeneration(setGenerationForm())
  expect(parsed.states).toEqual([
    { name: 'SET BASICO', state: 'SI' },
    { name: 'SET GUIA DE DESPACHO', state: 'NO' },
  ])
  expect(parsed.optionalSets.map((option) => option.code)).toEqual([
    'SET03',
    'SET06',
    'SET07',
    'SET08',
    'SET09',
    'SET11',
    'SET15',
    'SET72',
  ])
  expect(parsed.optionalSets[0]).toEqual({ code: 'SET03', label: 'Set SET03' })
  expect(parsed).toMatchObject({ authorized: 'S', total: '15', asksCompanyConfirmation: false })
})

test('the entry page asks to confirm the company and defaults the hidden fields', () => {
  expect(parseSetGeneration(SET_ENTRY)).toMatchObject({
    states: [],
    optionalSets: [],
    authorized: 'S',
    total: '15',
    asksCompanyConfirmation: true,
  })
  expect(parseSetGeneration(page('<p>Confirmar Empresa</p>')).asksCompanyConfirmation).toBe(true)
})

test('"no está inscrito" with or without the accent, as an entity or a byte', () => {
  expect(isNotEnrolled(NOT_ENROLLED)).toBe(true)
  expect(isNotEnrolled(page('no esta inscrito'))).toBe(true)
  expect(isNotEnrolled(page('no está inscrita'))).toBe(true)
  expect(isNotEnrolled(page('inscrito'))).toBe(false)
})

test('a dropped session: the authentication message, or the front page without a case', () => {
  expect(isSessionDropped(SESSION_DROPPED)).toBe(true)
  expect(isSessionDropped(FRONT_PAGE)).toBe(true)
  expect(isSessionDropped(page('<h1>Postulaci&oacute;n Factura Electr&oacute;nica</h1><p>CASO 1</p>'))).toBe(false)
  expect(isSessionDropped(setDownloadPage())).toBe(false)
})

test('the set text survives the trip through the page and parses as before', () => {
  const text = setTextOf(setDownloadPage(FULL_SET_TEXT, '<h3>Set generado correctamente</h3><style>b{}</style>'))
  expect(text.startsWith('Set generado correctamente')).toBe(true)
  expect(text).not.toContain('<')
  expect(text).not.toContain('var error')
  expect(text).not.toMatch(/\n{3}/)
  expect(parseTestSetText(text).map((set) => set.kind)).toEqual(parseTestSetText(FULL_SET_TEXT).map((set) => set.kind))
})

test('the attention number and the regeneration signals', () => {
  expect(attentionNumberOf(FULL_SET_TEXT)).toBe(ATTENTION)
  expect(attentionNumberOf('sin numero')).toBeNull()
  expect(isSetRegenerated(setDownloadPage(FULL_SET_TEXT, '<p>Set generado correctamente</p>'), ATTENTION)).toBe(true)
  expect(isSetRegenerated(page('<p>nuevos folios asignados</p>'), null)).toBe(true)
  expect(isSetRegenerated(setDownloadPage(), ATTENTION)).toBe(false)
  expect(isSetRegenerated(setDownloadPage(), null)).toBe(false)
  expect(isSetRegenerated(setDownloadPage(), '999')).toBe(true)
  expect(isSetRegenerated(page('<p>sin atencion</p>'), '999')).toBe(false)
})
```

`tests/portal/pages-certification-progress.test.ts` (new file, whole):

```ts
import {
  classifyAdvanceAnswer,
  classifyDeclarationAnswer,
  classifyItemState,
  parseDeclarationForm,
  parseProgressPage,
  portalStageOf,
  verifyDeclaration,
} from '../../src/portal/pages/certification-progress'
import {
  ADVANCE_ANSWERS,
  DECLARATION_ANSWERS,
  declarationFormPage,
  progressPage,
  STATUS_PAGE,
} from '../support/certification-pages'
import { page } from '../support/portal-pages'

describe('parseDeclarationForm', () => {
  test('rows by label with their input index, hidden fields, current values and TOTREG', () => {
    const form = parseDeclarationForm(
      declarationFormPage(
        [
          { label: 'SET BASICO', state: 'REVISADO CONFORME' },
          { label: 'SET GUIA DE DESPACHO', index: 1, value: '77', date: '04-11-2026', est: 'S21' },
          { label: 'SET FACTURA EXENTA', index: 2 },
          { label: 'SET CASO GENERAL FACTURA COMPRA', index: 3, state: 'EN REVISION' },
          { label: 'LIBRO DE VENTAS', index: 4 },
          { label: 'LIBRO DE COMPRAS', index: 5 },
          { label: 'LIBRO DE COMPRAS PARA EXENTOS', index: 6 },
          { label: 'LIBRO DE GUIAS', index: 7 },
          { label: 'SET DOCUMENTOS DE EXPORTACION', index: 8 },
          { label: 'SET DOCUMENTOS DE EXPORTACION(2)', index: 9 },
          { label: 'SET LIQUIDACION FACTURA', index: 10 },
          { label: 'SET DE SIMULACION', index: 11 },
          { label: 'OTRA FILA', index: 12 },
        ],
        { totreg: 12, paso: 'P02' },
      ),
    )
    expect(form.rows.map((row) => [row.key, row.index, row.value, row.state])).toEqual([
      ['basic', null, null, 'REVISADO CONFORME'],
      ['guide', 1, '77', 'S21'],
      ['exempt', 2, '', 'S01'],
      ['purchase', 3, '', 'EN REVISION'],
      ['salesBook', 4, '', 'S01'],
      ['purchaseBook', 5, '', 'S01'],
      ['exemptPurchaseBook', 6, '', 'S01'],
      ['guideBook', 7, '', 'S01'],
      ['export1', 8, '', 'S01'],
      ['export2', 9, '', 'S01'],
      ['settlement', 10, '', 'S01'],
      ['simulation', 11, '', 'S01'],
    ])
    expect(form.hiddenFields).toMatchObject({ TOTREG: '12', PASO: 'P02', SET1: 'S01', EST1: 'S21' })
    expect(form.currentValues).toEqual({ NUM_ENV1: '77', FEC_ENV1: '04-11-2026' })
    expect(form.totalRows).toBe(12)
    expect(form.isStatusPage).toBe(false)
    expect(form.hasErrorStates).toBe(false)
  })

  test('a status page has no hidden field; error states are seen', () => {
    const status = parseDeclarationForm(STATUS_PAGE)
    expect(status.isStatusPage).toBe(true)
    expect(parseDeclarationForm(page('<p>nada</p>'))).toMatchObject({ rows: [], isStatusPage: true, totalRows: 10 })
    expect(status.hasErrorStates).toBe(true)
    expect(status.totalRows).toBe(10)
    expect(status.rows[0]).toMatchObject({ key: 'basic', index: null, state: 'ENVIO CON ERRORES O REPAROS' })
  })

  test('a row without state and without index reads null, and verifies as kept', () => {
    const html = page('<input type=hidden name=TOTREG value=x><tr><td>LIBRO DE GUIAS</td></tr>')
    const form = parseDeclarationForm(html)
    expect(form.rows).toEqual([{ key: 'guideBook', label: 'LIBRO DE GUIAS', index: null, value: null, state: null }])
    expect(form.totalRows).toBe(10)
    expect(verifyDeclaration(html, { guideBook: '1' })).toEqual({ guideBook: 'kept' })
    const bare = parseDeclarationForm(
      page('<input type=hidden name=X><tr><td>LIBRO DE GUIAS<input name=NUM_ENV3></td></tr>'),
    )
    expect(bare.rows[0]).toMatchObject({ index: 3, value: '', state: null })
  })
})

describe('classifyDeclarationAnswer', () => {
  test.each([
    ['success', { accepted: true, hasSuccess: true, hasError: false, notProcessed: false }],
    ['updated', { accepted: true, hasSuccess: true, hasError: true }],
    ['notProcessed', { accepted: true, notProcessed: true, hasError: false }],
    ['sessionExpired', { accepted: false, sessionExpired: true }],
    ['contentMismatch', { accepted: false, contentMismatch: true }],
    ['plainError', { accepted: false, hasError: true, hasSuccess: false }],
  ] as const)('%s', (name, expected) => {
    expect(classifyDeclarationAnswer(DECLARATION_ANSWERS[name])).toMatchObject(expected)
  })

  test('inconsistent data carries its sentence, and is definitive', () => {
    const answer = classifyDeclarationAnswer(DECLARATION_ANSWERS.inconsistent)
    expect(answer.inconsistentData).toBe('LA FECHA DE ENVIO NO CORRESPONDE AL ENVIO 123')
    expect(classifyDeclarationAnswer(page('EL RUT NO COINCIDE')).inconsistentData).toBe('EL RUT NO COINCIDE')
    expect(classifyDeclarationAnswer(DECLARATION_ANSWERS.success).inconsistentData).toBeNull()
  })

  test('content errors name their rows; "errores o reparos" is a state, not an error', () => {
    const answer = classifyDeclarationAnswer(DECLARATION_ANSWERS.contentErrors)
    expect(answer.contentErrors).toEqual(['exemptPurchaseBook', 'basic'])
    expect(answer.hasError).toBe(false)
    expect(answer.accepted).toBe(true)
  })
})

describe('verifyDeclaration', () => {
  test('approved, in review, empty, kept and missing', () => {
    const html = declarationFormPage([
      { label: 'SET BASICO', state: 'REVISADO CONFORME' },
      { label: 'SET GUIA DE DESPACHO', state: 'EN REVISION' },
      { label: 'SET FACTURA EXENTA', index: 1 },
      { label: 'SET CASO GENERAL FACTURA COMPRA', index: 2, value: '0055' },
      { label: 'LIBRO DE VENTAS', state: 'POR REALIZAR' },
      { label: 'LIBRO DE COMPRAS', index: 3, value: '77' },
    ])
    expect(
      verifyDeclaration(html, {
        basic: '1',
        guide: '2',
        exempt: '3',
        purchase: '55',
        salesBook: '5',
        purchaseBook: '6',
        guideBook: '7',
      }),
    ).toEqual({
      basic: 'approved',
      guide: 'inReview',
      exempt: 'empty',
      purchase: 'kept',
      salesBook: 'kept',
      purchaseBook: 'mismatch',
      guideBook: 'missing',
    })
  })
})

describe('classifyAdvanceAnswer', () => {
  test.each([
    ['advanced', 'advanced', 'La empresa ha pasado al paso de SIMULACION'],
    ['finished', 'advanced', 'La empresa ha finalizado con la certificación'],
    ['unchanged', 'unchanged', 'La empresa ya se encuentra en el paso SIMULACION'],
    ['failed', 'failed', 'No es posible avanzar: faltan sets por revisar.'],
  ] as const)('%s', (name, outcome, message) => {
    expect(classifyAdvanceAnswer(ADVANCE_ANSWERS[name])).toEqual({ outcome, message })
  })
})

describe('parseProgressPage', () => {
  test('the stage, each row by its own bold, the confirmation offer', () => {
    const parsed = parseProgressPage(
      progressPage(
        'SIMULACION',
        {
          'SET BASICO': 'REVISADO CONFORME',
          'SET GUIA DESP.': 'EN REVISION',
          'SET FACTURA EXENTA': 'RECHAZADO',
          'SET CASO GENERAL FACTURA COMPRA': 'POR REALIZAR',
          'SET SIMULACION': 'ANULADO',
          'LIBRO VENTAS': 'FECHA NO CORRESPONDE',
          'LIBRO DE COMPRAS': 'ENVIO CON ERRORES O REPAROS',
          'LIBRO DE COMPRAS PARA EXENTOS': 'lo que sea',
          'LIBRO GUIAS': 'REVISADO CONFORME',
        },
        { confirm: true },
      ),
    )
    expect(parsed.stage).toBe('SIMULACION')
    expect(parsed.stageKey).toBe('simulation')
    expect(parsed.simulationAwaitsConfirmation).toBe(true)
    expect(Object.fromEntries(Object.entries(parsed.states).map(([key, value]) => [key, value.state]))).toEqual({
      basic: 'approved',
      guide: 'inReview',
      exempt: 'rejected',
      purchase: 'pending',
      simulation: 'annulled',
      salesBook: 'inconsistent',
      purchaseBook: 'rejected',
      exemptPurchaseBook: 'unknown',
      guideBook: 'approved',
    })
  })

  test('a row without bold leaves no state; a label is read once; a label split by a tag still reads', () => {
    const parsed = parseProgressPage(
      page(
        '<p>paso <b>INTERCAMBIO</b></p><tr><td>SET BASICO</td><td>x</td></tr><tr><td>SET BASICO</td><td><b>EN REVISION</b></td></tr><tr><td>LIBRO DE <i>GUIAS</i></td><td><b>POR REALIZAR</b></td></tr>',
      ),
    )
    expect(parsed.states).toEqual({
      basic: { text: 'EN REVISION', state: 'inReview' },
      guideBook: { text: 'POR REALIZAR', state: 'pending' },
    })
    expect(parsed.simulationAwaitsConfirmation).toBe(false)
  })

  test.each([
    ['etapa', 'INTERCAMBIO', 'exchange'],
    ['etapaColon', 'DOCUMENTOS IMPRESOS', 'printedSamples'],
    ['etapaDe', 'LIBROS', 'books'],
    ['paso', 'SET DE PRUEBAS', 'testSets'],
  ] as const)('the stage through the "%s" wording', (wording, stage, key) => {
    const parsed = parseProgressPage(progressPage(stage, {}, { wording }))
    expect(parsed.stage).toBe(stage)
    expect(parsed.stageKey).toBe(key)
  })

  test('no stage at all', () => {
    expect(parseProgressPage(page('<p>nada</p>'))).toEqual({
      stage: null,
      stageKey: 'testSets',
      states: {},
      simulationAwaitsConfirmation: false,
    })
  })
})

test('portalStageOf and classifyItemState on the wordings of the field', () => {
  expect(portalStageOf('ETAPA DE MUESTRAS IMPRESAS')).toBe('printedSamples')
  expect(portalStageOf('AUTORIZADO')).toBe('printedSamples')
  expect(portalStageOf(null)).toBe('testSets')
  expect(classifyItemState('revisado conforme')).toBe('approved')
  expect(classifyItemState('FECHA INV&Aacute;LIDA')).toBe('unknown')
  expect(classifyItemState('FECHA INVALIDA')).toBe('inconsistent')
})
```

`tests/portal/pages-certification-books.test.ts` (new file, whole):

```ts
import { isHistoryUnauthorized, parseBookHistory } from '../../src/portal/pages/certification-books'
import { bookHistoryPage, HISTORY_EXPIRED, HISTORY_UNAUTHORIZED } from '../support/certification-pages'
import { page } from '../support/portal-pages'

test('six-cell rows become entries; headers and odd periods are ignored', () => {
  const entries = parseBookHistory(
    bookHistoryPage([
      ['2026-10', 'COMPRA', 'Recibido', 'LIBRO', 'MENSUAL', 'AB12'],
      ['2026-09', 'VENTA', 'Recibido', 'LIBRO', 'RECTIFICA', null],
      ['Total', 'x', 'y', 'z', 'w', null],
    ]),
  )
  expect(entries).toEqual([
    {
      period: '2026-10',
      operation: 'purchase',
      state: 'Recibido',
      kind: 'LIBRO',
      periodicity: 'monthly',
      code: 'AB12',
    },
    {
      period: '2026-09',
      operation: 'sale',
      state: 'Recibido',
      kind: 'LIBRO',
      periodicity: 'rectification',
      code: null,
    },
  ])
})

test('rows without `</tr>`, a link without Codigo, and short rows', () => {
  const html = page(
    '<table><tr><td>2026-08<td>COMPRA<td>Recibido<td>LIBRO<td>MENSUAL<td><a href="QDetEstLibro?x=1">1</a><tr><td>2026-07<td>VENTA</table>',
  )
  expect(parseBookHistory(html)).toEqual([
    { period: '2026-08', operation: 'purchase', state: 'Recibido', kind: 'LIBRO', periodicity: 'monthly', code: null },
  ])
})

test('the unauthorized and expired wordings', () => {
  expect(isHistoryUnauthorized(HISTORY_UNAUTHORIZED)).toBe(true)
  expect(isHistoryUnauthorized(HISTORY_EXPIRED)).toBe(true)
  expect(isHistoryUnauthorized(bookHistoryPage([]))).toBe(false)
})
```

`tests/portal/pages-certification-compliance.test.ts` (new file, whole):

```ts
import {
  complianceBlock,
  complianceForm,
  complianceMessage,
  hasOkMessage,
  isDeclared,
  isUnconfirmed,
} from '../../src/portal/pages/certification-compliance'
import {
  COMPLIANCE_BLOCKED,
  COMPLIANCE_DECLARED,
  COMPLIANCE_ENTRY,
  COMPLIANCE_FORM,
  COMPLIANCE_OK_MSG,
  COMPLIANCE_UNCONFIRMED,
} from '../support/certification-pages'
import { page } from '../support/portal-pages'

test('the block sentence, or null', () => {
  expect(complianceBlock(COMPLIANCE_BLOCKED)).toBe(
    'Usted no podrá efectuar la Declaración de Cumplimiento porque no ha finalizado su certificación',
  )
  expect(complianceBlock(page('no ha finalizado su certificacion'))).toBe('no ha finalizado su certificacion')
  expect(complianceBlock(COMPLIANCE_OK_MSG)).toBeNull()
})

test('OK_MSG is a hidden field', () => {
  expect(hasOkMessage(COMPLIANCE_OK_MSG)).toBe(true)
  expect(hasOkMessage(COMPLIANCE_ENTRY)).toBe(false)
})

test('the pe_avance9 form: no Salir, every OPC at S, CONFIRMAR added, hidden values kept', () => {
  const form = complianceForm(COMPLIANCE_FORM)
  expect(form?.action).toBe('/cvc_cgi/dte/pe_avance9')
  expect(form?.fields).toEqual({
    RUT_EMP: '76543210',
    DV_EMP: '3',
    OPC1: 'S',
    OPC2: 'S',
    OPC3: 'S',
    OPC4: 'S',
    OPC5: 'S',
    OPC6: 'S',
    OPC7: 'S',
    OPC8: 'S',
    CONFIRMAR: 'Confirmar Declaración',
  })
  expect(complianceForm(COMPLIANCE_OK_MSG)).toBeNull()
  expect(
    complianceForm(page('<form action=pe_avance9><input type=checkbox name=OPC1><input name=X></form>'))?.fields,
  ).toEqual({
    OPC1: 'S',
    X: '',
    CONFIRMAR: 'Confirmar Declaración',
  })
  expect(
    complianceForm(page('<form name=f><input type=hidden name=A value=1></form><form action="/pe_avance9"></form>'))
      ?.action,
  ).toBe('/pe_avance9')
})

test('unconfirmed: the options or the company input still there', () => {
  expect(isUnconfirmed(COMPLIANCE_UNCONFIRMED)).toBe(true)
  expect(isUnconfirmed(COMPLIANCE_ENTRY)).toBe(true)
  expect(isUnconfirmed(COMPLIANCE_DECLARED)).toBe(false)
})

test('declared only on a positive wording', () => {
  expect(isDeclared(COMPLIANCE_DECLARED)).toBe(true)
  expect(isDeclared(page('La empresa ha finalizado con la certificaci&oacute;n.'))).toBe(true)
  expect(isDeclared(page('Declaraci&oacute;n de Cumplimiento registrada'))).toBe(true)
  expect(isDeclared(page('<p>Proceso terminado sin novedad</p>'))).toBe(false)
  expect(isDeclared(COMPLIANCE_FORM)).toBe(false)
})

test('the message sentence, or the first words', () => {
  expect(complianceMessage(COMPLIANCE_DECLARED)).toBe('Su Declaración de Cumplimiento ha sido efectuada')
  expect(complianceMessage(page('<p>Proceso terminado sin novedad</p>'))).toBe('Proceso terminado sin novedad')
})
```

`tests/portal/html.test.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/portal/html.test.ts b/tests/portal/html.test.ts
index ca7979c..9424b51 100644
--- a/tests/portal/html.test.ts
+++ b/tests/portal/html.test.ts
@@ -11,6 +11,8 @@ import {
   selectOptions,
   stripTags,
   visibleText,
+  bodyText,
+  hiddenInputs,
 } from '../../src/portal/html'
 
 test('entities: named, decimal, hex and unknown', () => {
@@ -82,3 +84,18 @@ alert('');
   expect(alertMessages(html)).toEqual(["It's first á", 'second'])
   expect(alertMessages('nothing')).toEqual([])
 })
+
+test('bodyText drops the title and keeps the whole body', () => {
+  expect(bodyText('<html><head><title>SII</title></head><body><p>Hola</p><script>x</script> mundo</body></html>')).toBe(
+    'Hola mundo',
+  )
+})
+
+test('hiddenInputs keeps only the hidden fields that have a name', () => {
+  expect(
+    hiddenInputs(
+      '<input type=hidden name=A value=1><input type=HIDDEN value=2><input type=text name=B value=3><input type="hidden" name="C">',
+    ),
+  ).toEqual({ A: '1', C: '' })
+  expect(hiddenInputs('<p>no inputs</p>')).toEqual({})
+})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/pages-certification tests/portal/html --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/portal/pages/certification-set'` and the three siblings; `bodyText` and `hiddenInputs` are not exported by `src/portal/html.ts`.

- [ ] **Step 3: Write the implementation**

`src/portal/pages/certification-set.ts` (new file, whole):

```ts
import { attribute, decodeEntities, inputValues, stripTags, bodyText } from '../html'

/**
 * EN: One row of the set table of `pe_generar1`: a set and whether the company obtained it.
 * ES: Una fila de la tabla de sets de `pe_generar1`: un set y si la empresa lo obtuvo.
 */
export type SetGenerationState = {
  /** EN: Set name as the portal writes it. ES: Nombre del set tal como lo escribe el portal. */
  readonly name: string
  /** EN: The second cell, as text. ES: La segunda celda, como texto. */
  readonly state: string
}

/**
 * EN: One optional set the page offers as a checkbox.
 * ES: Un set opcional que la página ofrece como casilla.
 */
export type OptionalSetOption = {
  /** EN: Field name, `SETnn`. ES: `SETnn` — Nombre del campo. */
  readonly code: string
  /** EN: Label next to the checkbox. ES: Etiqueta junto a la casilla. */
  readonly label: string
}

/**
 * EN: What `pe_generar1` shows before a set is generated.
 * ES: Lo que muestra `pe_generar1` antes de generar un set.
 */
export type SetGenerationPage = {
  /** EN: The set table. ES: La tabla de sets. */
  readonly states: readonly SetGenerationState[]
  /** EN: The optional sets offered. ES: Los sets opcionales ofrecidos. */
  readonly optionalSets: readonly OptionalSetOption[]
  /** EN: Hidden `AUTORIZADA`; `S` when absent. ES: `AUTORIZADA` oculto; `S` si falta. */
  readonly authorized: string
  /** EN: Hidden `TOTAL`; `15` when absent. ES: `TOTAL` oculto; `15` si falta. */
  readonly total: string
  /** EN: The page still asks to confirm the company (`pe_generar1`). ES: La página aún pide confirmar la empresa (`pe_generar1`). */
  readonly asksCompanyConfirmation: boolean
}

const DEFAULT_AUTHORIZED = 'S'
const DEFAULT_TOTAL = '15'
const HEADER_ROW = /set obtenido/i

/**
 * EN: Reads the set table, the optional-set checkboxes and the hidden fields of `pe_generar1`.
 * ES: Lee la tabla de sets, las casillas de sets opcionales y los campos ocultos de `pe_generar1`.
 */
export const parseSetGeneration = (html: string): SetGenerationPage => {
  const states = html.split(/<tr\b/i).flatMap((row) => {
    const fonts = [...row.matchAll(/<font\b[^>]*>([\s\S]*?)<\/font>/gi)].map((match) => stripTags(match[1]))
    if (fonts.length < 2 || fonts[0] === '' || HEADER_ROW.test(fonts[0]) || HEADER_ROW.test(fonts[1])) return []
    return [{ name: fonts[0], state: fonts[1] }]
  })
  const optionalSets = (html.match(/<input\b[^>]*>[^<]*/gi) ?? []).flatMap((fragment) => {
    const tag = fragment.slice(0, fragment.indexOf('>') + 1)
    const name = attribute(tag, 'name')
    if (name === null || !/^SET\d+$/i.test(name) || attribute(tag, 'type')?.toLowerCase() !== 'checkbox') return []
    return [{ code: name.toUpperCase(), label: stripTags(fragment.slice(tag.length)) }]
  })
  const fields = inputValues(html)
  return {
    states,
    optionalSets,
    authorized: fields.AUTORIZADA ?? DEFAULT_AUTHORIZED,
    total: fields.TOTAL ?? DEFAULT_TOTAL,
    asksCompanyConfirmation: html.includes('pe_generar1') || /Confirmar Empresa/i.test(html),
  }
}

/**
 * EN: The company is not enrolled in the application: the page says "no está inscrito", with or without the accent.
 * ES: La empresa no está inscrita en la postulación: la página dice "no está inscrito", con o sin tilde.
 */
export const isNotEnrolled = (html: string): boolean => /no est(?:á|a) inscrit[oa]/i.test(decodeEntities(html))

/**
 * EN: The portal dropped the session between two pages: it asks to authenticate, or shows the application's front
 * page with no case on it.
 * ES: El portal soltó la sesión entre dos páginas: pide autenticarse, o muestra la portada de la postulación sin caso.
 */
export const isSessionDropped = (html: string): boolean => {
  const text = bodyText(html)
  return (
    /no se encuentra autenticado/i.test(text) ||
    (/postulaci[oó]n factura electr[oó]nica/i.test(text) && !/caso/i.test(text))
  )
}

/**
 * EN: The test-set text of a downloaded page: scripts and styles dropped, every tag a line break, entities decoded,
 * lines trimmed, blank runs collapsed. It is what `parseTestSetText` reads.
 * ES: El texto del set de pruebas de una página descargada: sin scripts ni estilos, cada etiqueta un salto de línea,
 * entidades decodificadas, líneas recortadas, corridas en blanco colapsadas. Es lo que lee `parseTestSetText`.
 */
export const setTextOf = (html: string): string =>
  decodeEntities(
    html
      .replace(/<title[\s\S]*?<\/title>/gi, '\n')
      .replace(/<script[\s\S]*?<\/script>/gi, '\n')
      .replace(/<style[\s\S]*?<\/style>/gi, '\n')
      .replace(/<[^>]+>/g, '\n'),
  )
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{2,}/g, '\n\n')
    .trim()

/**
 * EN: The attention number a set text carries, or null.
 * ES: El número de atención que trae un texto de set, o null.
 */
export const attentionNumberOf = (text: string): string | null =>
  /NUMERO DE ATENCI[OÓ]N\s*:?\s*(\d+)/i.exec(decodeEntities(text))?.[1] ?? null

/**
 * EN: The portal generated a new set on this download: it says so, or the attention number changed. A run in progress
 * must then start over, because the SII assigns new cases.
 * ES: El portal generó un set nuevo en esta descarga: lo dice, o cambió el número de atención. Una corrida en curso
 * debe entonces partir de nuevo, porque el SII asigna casos nuevos.
 */
export const isSetRegenerated = (html: string, previousAttentionNumber: string | null): boolean => {
  const text = decodeEntities(html)
  if (/Set generado correctamente|nuevos folios asignados/i.test(text)) return true
  const attention = attentionNumberOf(text)
  return previousAttentionNumber !== null && attention !== null && attention !== previousAttentionNumber
}
```

`src/portal/pages/certification-progress.ts` (new file, whole):

```ts
import { PORTAL_STAGE_WORDS, type CertificationStage, type DeclarationKey } from '../../catalogs/certification'
import { attribute, decodeEntities, stripTags, bodyText } from '../html'

/**
 * EN: One row of the declaration form, mapped by its label.
 * ES: Una fila del formulario de declaración, identificada por su etiqueta.
 */
export type DeclarationRow = {
  /** EN: The row's key. ES: La clave de la fila. */
  readonly key: DeclarationKey
  /** EN: Label as the portal writes it. ES: Etiqueta tal como la escribe el portal. */
  readonly label: string
  /** EN: Index of its `NUM_ENV{n}` input, or null when the row has no input (already reviewed or in review). ES: Índice de su `NUM_ENV{n}`, o null si la fila no tiene campo (ya revisada o en revisión). */
  readonly index: number | null
  /** EN: Current value of `NUM_ENV{n}`, or null without an input. ES: Valor actual de `NUM_ENV{n}`, o null sin campo. */
  readonly value: string | null
  /** EN: The bold state, upper case, or the hidden `EST{n}` code, or null. ES: El estado en negrita, en mayúsculas, o el código oculto `EST{n}`, o null. */
  readonly state: string | null
}

/**
 * EN: The `pe_avance2` form as the declaration needs it.
 * ES: El formulario de `pe_avance2` tal como lo necesita la declaración.
 */
export type DeclarationForm = {
  /** EN: The rows the page maps. ES: Las filas que la página identifica. */
  readonly rows: readonly DeclarationRow[]
  /** EN: Every hidden field. ES: Todos los campos ocultos. */
  readonly hiddenFields: Readonly<Record<string, string>>
  /** EN: `NUM_ENV`/`FEC_ENV` values already on the page. ES: Valores de `NUM_ENV`/`FEC_ENV` que ya trae la página. */
  readonly currentValues: Readonly<Record<string, string>>
  /** EN: Hidden `TOTREG`, 10 when absent. ES: `TOTREG` oculto, 10 si falta. */
  readonly totalRows: number
  /** EN: No hidden field at all: a status page, not a form. ES: Ningún campo oculto: una página de estado, no un formulario. */
  readonly isStatusPage: boolean
  /** EN: Some row says errors or objections. ES: Alguna fila dice errores o reparos. */
  readonly hasErrorStates: boolean
}

/**
 * EN: What a `pe_avance3` answer says.
 * ES: Lo que dice una respuesta de `pe_avance3`.
 */
export type DeclarationAnswer = {
  /** EN: The session is gone. ES: La sesión se perdió. */
  readonly sessionExpired: boolean
  /** EN: "contenido no corresponde". ES: "contenido no corresponde". */
  readonly contentMismatch: boolean
  /** EN: The SII has not processed the envelope yet. ES: El SII aún no procesó el envío. */
  readonly notProcessed: boolean
  /** EN: The sentence saying a date, RUT, folio or number does not match, or null. ES: La frase que dice que una fecha, RUT, folio o número no corresponde, o null. */
  readonly inconsistentData: string | null
  /** EN: A success wording. ES: Una frase de éxito. */
  readonly hasSuccess: boolean
  /** EN: The word "error" outside "errores o reparos" and the session error. ES: La palabra "error" fuera de "errores o reparos" y del error de sesión. */
  readonly hasError: boolean
  /** EN: Rows named next to "ENVIO CON ERRORES O REPAROS". ES: Filas nombradas junto a "ENVIO CON ERRORES O REPAROS". */
  readonly contentErrors: readonly DeclarationKey[]
  /** EN: The portal took the declaration. ES: El portal aceptó la declaración. */
  readonly accepted: boolean
}

/**
 * EN: What the re-read form says of a row just declared.
 * ES: Lo que dice el formulario releído de una fila recién declarada.
 */
export type VerificationState = 'approved' | 'inReview' | 'empty' | 'kept' | 'mismatch' | 'missing'

/**
 * EN: What `pe_avance4` answered.
 * ES: Lo que respondió `pe_avance4`.
 */
export type AdvanceAnswer = {
  /** EN: The stage moved, was already there, or the portal refused. ES: La etapa avanzó, ya estaba ahí, o el portal se negó. */
  readonly outcome: 'advanced' | 'unchanged' | 'failed'
  /** EN: The sentence that decided it. ES: La frase que lo decidió. */
  readonly message: string
}

/**
 * EN: The state of one set or book on the progress page.
 * ES: El estado de un set o libro en la página de avance.
 */
export type ItemState = 'approved' | 'inReview' | 'rejected' | 'pending' | 'annulled' | 'inconsistent' | 'unknown'

/**
 * EN: The progress page (`pe_avance6`) read.
 * ES: La página de avance (`pe_avance6`) leída.
 */
export type ProgressPage = {
  /** EN: The stage wording, upper case, or null. ES: El texto de la etapa, en mayúsculas, o null. */
  readonly stage: string | null
  /** EN: The stage as the runner names it. ES: La etapa como la nombra el ejecutor. */
  readonly stageKey: CertificationStage
  /** EN: Per row, the bold text and its class. ES: Por fila, el texto en negrita y su clase. */
  readonly states: Readonly<Partial<Record<DeclarationKey, { readonly text: string; readonly state: ItemState }>>>
  /** EN: The page offers to confirm the review of an approved simulation. ES: La página ofrece confirmar la revisión de una simulación aprobada. */
  readonly simulationAwaitsConfirmation: boolean
}

const DEFAULT_TOTAL_ROWS = 10

// The labels of `pe_avance2`, matched on the row's text. The lookaheads keep "LIBRO DE COMPRAS" and "SET DOCUMENTOS DE
// EXPORTACION" from matching inside their longer siblings.
const DECLARATION_LABELS: readonly { readonly key: DeclarationKey; readonly pattern: RegExp }[] = [
  { key: 'simulation', pattern: /SET DE SIMULACION/i },
  { key: 'salesBook', pattern: /LIBRO DE VENTAS/i },
  { key: 'exemptPurchaseBook', pattern: /LIBRO DE COMPRAS PARA EXENTOS/i },
  { key: 'purchaseBook', pattern: /LIBRO DE COMPRAS(?!\s+PARA EXENTOS)/i },
  { key: 'guideBook', pattern: /LIBRO DE GUIAS/i },
  { key: 'basic', pattern: /SET BASICO/i },
  { key: 'guide', pattern: /SET GUIA DE DESPACHO/i },
  { key: 'exempt', pattern: /SET FACTURA EXENTA/i },
  { key: 'export2', pattern: /SET DOCUMENTOS DE EXPORTACION\s*\(2\)/i },
  { key: 'export1', pattern: /SET DOCUMENTOS DE EXPORTACION(?!\s*\(2\))/i },
  { key: 'purchase', pattern: /SET CASO GENERAL FACTURA COMPRA/i },
  { key: 'settlement', pattern: /SET LIQUIDACION FACTURA/i },
]

// The labels of the progress page, looser: the portal abbreviates there.
const PROGRESS_LABELS: readonly { readonly key: DeclarationKey; readonly pattern: RegExp }[] = [
  { key: 'basic', pattern: /SET BASICO/i },
  { key: 'guide', pattern: /SET GUIA[\s\S]*?DESP/i },
  { key: 'exempt', pattern: /SET FACTURA EXENTA/i },
  { key: 'purchase', pattern: /SET CASO GENERAL FACTURA COMPRA/i },
  { key: 'simulation', pattern: /SET(?: DE)? SIMULACION/i },
  { key: 'salesBook', pattern: /LIBRO[\s\S]*?VENTA/i },
  { key: 'exemptPurchaseBook', pattern: /LIBRO DE COMPRAS PARA EXENTOS/i },
  { key: 'purchaseBook', pattern: /LIBRO DE COMPRAS(?!\s+PARA EXENTOS)/i },
  { key: 'guideBook', pattern: /LIBRO[\s\S]*?GUIA/i },
]

const CONTENT_ERROR_LABELS: readonly { readonly key: DeclarationKey; readonly pattern: string }[] = [
  { key: 'salesBook', pattern: 'LIBRO DE VENTAS' },
  { key: 'exemptPurchaseBook', pattern: 'LIBRO DE COMPRAS PARA EXENTOS' },
  { key: 'purchaseBook', pattern: 'LIBRO DE COMPRAS(?!\\s+PARA EXENTOS)' },
  { key: 'guideBook', pattern: 'LIBRO DE GUIAS' },
  { key: 'basic', pattern: 'SET BASICO' },
  { key: 'guide', pattern: 'SET GUIA DE DESPACHO' },
  { key: 'exempt', pattern: 'SET FACTURA EXENTA' },
  { key: 'purchase', pattern: 'SET CASO GENERAL FACTURA COMPRA' },
  { key: 'simulation', pattern: 'SET DE SIMULACION' },
]

const STAGE_PATTERNS: readonly RegExp[] = [
  /paso\s*<b>\s*([^<]+)<\/b>/i,
  /etapa[:\s]+<b>([^<]+)<\/b>/i,
  /etapa\s*<b>\s*([^<]+)<\/b>/i,
  /ETAPA\s+DE\s+([A-ZÁÉÍÓÚÑ\s]+)/,
]

const rowsOf = (html: string): readonly string[] => html.split(/<tr\b/i)

const inputTagsWithType = (
  html: string,
): readonly { readonly type: string; readonly name: string; readonly value: string }[] =>
  (html.match(/<input\b[^>]*>/gi) ?? []).flatMap((tag) => {
    const name = attribute(tag, 'name')
    if (name === null) return []
    return [{ type: (attribute(tag, 'type') ?? 'text').toLowerCase(), name, value: attribute(tag, 'value') ?? '' }]
  })

const boldText = (fragment: string): string | null => {
  const match = /<b>([^<]+)<\/b>/i.exec(fragment)
  return match === null ? null : stripTags(match[1]).toUpperCase()
}

const sentenceAround = (text: string, pattern: RegExp): string | null => {
  const match = pattern.exec(text)
  if (match === null) return null
  const start = text.lastIndexOf('.', match.index) + 1
  const end = text.indexOf('.', match.index + match[0].length)
  return text.slice(start, end === -1 ? text.length : end).trim()
}

/**
 * EN: Reads the `pe_avance2` form: the rows by label, each with the index of its `NUM_ENV` input (the SII reorders
 * the indexes as sets are approved, so a row is never found by position), the hidden fields, the values already
 * declared and `TOTREG`.
 * ES: Lee el formulario de `pe_avance2`: las filas por etiqueta, cada una con el índice de su `NUM_ENV` (el SII
 * reordena los índices a medida que aprueba sets, así que una fila nunca se busca por posición), los campos ocultos,
 * los valores ya declarados y `TOTREG`.
 */
export const parseDeclarationForm = (html: string): DeclarationForm => {
  const inputs = inputTagsWithType(html)
  const hiddenFields = Object.fromEntries(
    inputs.filter((input) => input.type === 'hidden').map((i) => [i.name, i.value]),
  )
  const currentValues = Object.fromEntries(
    inputs
      .filter((input) => input.type !== 'hidden' && /^(NUM_ENV|FEC_ENV)\d+$/i.test(input.name) && input.value !== '')
      .map((input) => [input.name, input.value]),
  )
  const rows = rowsOf(html).flatMap((row) => {
    const text = stripTags(row)
    const label = DECLARATION_LABELS.find((candidate) => candidate.pattern.test(text))
    if (label === undefined) return []
    const input = /name\s*=\s*["']?NUM_ENV(\d+)/i.exec(row)
    const index = input === null ? null : Number.parseInt(input[1], 10)
    const value = index === null ? null : inputs.find((i) => i.name === `NUM_ENV${index}`)!.value
    const state = boldText(row) ?? (index === null ? null : (hiddenFields[`EST${index}`] ?? null))
    return [{ key: label.key, label: label.pattern.exec(text)![0].toUpperCase(), index, value, state }]
  })
  const total = Number.parseInt(hiddenFields.TOTREG ?? '', 10)
  return {
    rows,
    hiddenFields,
    currentValues,
    totalRows: Number.isNaN(total) ? DEFAULT_TOTAL_ROWS : total,
    isStatusPage: Object.keys(hiddenFields).length === 0,
    hasErrorStates: rows.some((row) => /REPAROS|ERRORES/i.test(row.state ?? '')),
  }
}

/**
 * EN: Classifies the body `pe_avance3` answers: the session, a content mismatch, "not processed yet", inconsistent
 * data (a date, RUT, folio or number that does not match: definitive), success, error, and the rows named with
 * "ENVIO CON ERRORES O REPAROS". That wording is a state, not an error.
 * ES: Clasifica el cuerpo que responde `pe_avance3`: la sesión, contenido que no corresponde, "aún no procesado", dato
 * inconsistente (fecha, RUT, folio o número que no corresponde: definitivo), éxito, error, y las filas nombradas con
 * "ENVIO CON ERRORES O REPAROS". Esa frase es un estado, no un error.
 */
export const classifyDeclarationAnswer = (html: string): DeclarationAnswer => {
  const text = bodyText(html)
  const lower = text.toLowerCase()
  const sessionExpired = /no se encuentra autenticado|error de sesi/i.test(text)
  const contentMismatch = /contenido no corresponde/i.test(text)
  const inconsistentData = sentenceAround(text, /(FECHA|RUT|FOLIO|N[UÚ]MERO)[^.]{0,40}?NO\s+(CORRESPONDE|COINCIDE)/i)
  const hasSuccess = /exitosamente|avance declarado|actualizado/i.test(text)
  const hasError = lower
    .replace(/errores o reparos/g, '')
    .replace(/error de sesi[oó]n/g, '')
    .includes('error')
  const contentErrors = CONTENT_ERROR_LABELS.filter((label) =>
    new RegExp(`${label.pattern}[\\s\\S]{0,200}?ENVIO CON ERRORES O REPAROS`, 'i').test(text),
  ).map((label) => label.key)
  return {
    sessionExpired,
    contentMismatch,
    notProcessed: /no ha sido procesado|a[uú]n no est[aá] disponible|intente m[aá]s tarde|no se encuentra/i.test(text),
    inconsistentData,
    hasSuccess,
    hasError,
    contentErrors,
    accepted: (!hasError || hasSuccess) && !sessionExpired && !contentMismatch,
  }
}

/**
 * EN: What the re-read `pe_avance2` says of each declared row: approved or in review when its input is gone, empty
 * when the input is still there and blank (the declaration was not saved), kept when it holds the track id declared,
 * mismatch when it holds another, missing when the row is not on the page.
 * ES: Lo que dice `pe_avance2` releído de cada fila declarada: aprobada o en revisión si su campo desapareció, vacía si
 * el campo sigue ahí en blanco (la declaración no se guardó), conservada si trae el track id declarado, distinta si
 * trae otro, ausente si la fila no está en la página.
 */
export const verifyDeclaration = (
  html: string,
  declared: Readonly<Partial<Record<DeclarationKey, string>>>,
): Readonly<Partial<Record<DeclarationKey, VerificationState>>> => {
  const { rows } = parseDeclarationForm(html)
  return Object.fromEntries(
    Object.entries(declared).map(([key, trackId]) => {
      const row = rows.find((candidate) => candidate.key === key)
      if (row === undefined) return [key, 'missing']
      if (row.index === null) {
        if ((row.state ?? '').includes('REVISADO CONFORME')) return [key, 'approved']
        if ((row.state ?? '').includes('EN REVISION')) return [key, 'inReview']
        return [key, 'kept']
      }
      if (row.value === '') return [key, 'empty']
      return [key, row.value!.replace(/^0+(?=\d)/, '') === trackId ? 'kept' : 'mismatch']
    }),
  )
}

/**
 * EN: What `pe_avance4` answered, from its Spanish text only: HTTP is always 200 and the word "error" is in every
 * page's script. "Ya se encuentra en el paso" is not a failure.
 * ES: Lo que respondió `pe_avance4`, solo por su texto en español: HTTP siempre es 200 y la palabra "error" está en el
 * script de toda página. "Ya se encuentra en el paso" no es una falla.
 */
export const classifyAdvanceAnswer = (html: string): AdvanceAnswer => {
  const text = bodyText(html)
  const advanced = sentenceAround(text, /ha pasado al paso|ha finalizado con la certificaci/i)
  if (advanced !== null) return { outcome: 'advanced', message: advanced }
  const unchanged = sentenceAround(text, /ya se encuentra en el paso/i)
  if (unchanged !== null) return { outcome: 'unchanged', message: unchanged }
  return { outcome: 'failed', message: text.slice(0, 400) }
}

/**
 * EN: The class of a state wording.
 * ES: La clase de un texto de estado.
 */
export const classifyItemState = (text: string): ItemState => {
  const upper = decodeEntities(text).toUpperCase()
  if (/NO CORRESPONDE|NO COINCIDE|FECHA INVALIDA/.test(upper)) return 'inconsistent'
  if (upper.includes('REVISADO CONFORME')) return 'approved'
  if (upper.includes('EN REVISION')) return 'inReview'
  if (/RECHAZADO|ERRORES|REPARO/.test(upper)) return 'rejected'
  if (upper.includes('POR REALIZAR')) return 'pending'
  if (upper.includes('ANULADO')) return 'annulled'
  return 'unknown'
}

/**
 * EN: The runner's stage for a portal wording; the test sets when nothing later is named.
 * ES: La etapa del ejecutor para un texto del portal; los sets de prueba cuando no nombra nada posterior.
 */
export const portalStageOf = (stage: string | null): CertificationStage => {
  const upper = (stage ?? '').toUpperCase()
  return PORTAL_STAGE_WORDS.find((entry) => entry.words.some((word) => upper.includes(word)))?.stage ?? 'testSets'
}

/**
 * EN: Reads the progress page: the stage from the first pattern that matches, and per set or book the first bold text
 * after its label, row by row (a page-wide search once took the next row's state), plus whether an approved
 * simulation awaits its confirmation.
 * ES: Lee la página de avance: la etapa por el primer patrón que calza, y por set o libro el primer texto en negrita
 * después de su etiqueta, fila por fila (una búsqueda sobre toda la página ya tomó el estado de la fila siguiente),
 * más si una simulación aprobada espera su confirmación.
 */
export const parseProgressPage = (html: string): ProgressPage => {
  const stageMatch = STAGE_PATTERNS.map((pattern) => pattern.exec(html)).find((match) => match !== null)
  const stage = stageMatch === undefined ? null : stripTags(stageMatch[1]).toUpperCase()
  const states: Partial<Record<DeclarationKey, { readonly text: string; readonly state: ItemState }>> = {}
  for (const row of rowsOf(html)) {
    const text = stripTags(row)
    for (const label of PROGRESS_LABELS) {
      if (label.key in states) continue
      const at = label.pattern.exec(text)
      if (at === null) continue
      const bold = boldText(row.slice(Math.max(0, row.search(label.pattern))))
      if (bold !== null) states[label.key] = { text: bold, state: classifyItemState(bold) }
    }
  }
  return {
    stage,
    stageKey: portalStageOf(stage),
    states,
    simulationAwaitsConfirmation:
      html.includes('pe_avance3') && /SET DE SIMULACION/i.test(html) && /Confirmar Revisi/i.test(decodeEntities(html)),
  }
}
```

`src/portal/pages/certification-books.ts` (new file, whole):

```ts
import { attribute, stripTags } from '../html'

/**
 * EN: One book the SII holds, as `QEstLibro` lists it.
 * ES: Un libro que el SII tiene, tal como lo lista `QEstLibro`.
 */
export type BookHistoryEntry = {
  /** EN: Period `YYYY-MM`. ES: Período `AAAA-MM`. */
  readonly period: string
  /** EN: Purchase or sale. ES: `COMPRA` / `VENTA` — Compra o venta. */
  readonly operation: 'purchase' | 'sale'
  /** EN: State as listed, always "Recibido" in practice. ES: Estado tal como se lista, en la práctica siempre "Recibido". */
  readonly state: string
  /** EN: Book kind as listed. ES: Tipo de libro tal como se lista. */
  readonly kind: string
  /** EN: Monthly or rectification. ES: `MENSUAL` / `RECTIFICA` — Mensual o rectificación. */
  readonly periodicity: 'monthly' | 'rectification'
  /** EN: The `Codigo` of its detail link, or null. ES: El `Codigo` de su enlace de detalle, o null. */
  readonly code: string | null
}

const PERIOD = /^\d{4}-\d{2}$/
const MIN_CELLS = 6

const cellsOf = (row: string): readonly string[] =>
  [...row.matchAll(/<td\b[^>]*>([\s\S]*?)(?=<td\b|<\/tr\b|$)/gi)].map((match) => match[1])

/**
 * EN: The rows of `QEstLibro`: six cells (period, operation, state, kind, periodicity, count with a detail link);
 * rows whose period is not `YYYY-MM` are ignored. Every period listed is occupied: the page always says "Recibido"
 * and does not tell a closed book from a received one.
 * ES: Las filas de `QEstLibro`: seis celdas (período, operación, estado, tipo, periodicidad, cantidad con enlace al
 * detalle); se ignoran las filas cuyo período no es `AAAA-MM`. Todo período listado está ocupado: la página siempre
 * dice "Recibido" y no distingue un libro cerrado de uno recibido.
 */
export const parseBookHistory = (html: string): readonly BookHistoryEntry[] =>
  html.split(/<tr\b/i).flatMap((row) => {
    const cells = cellsOf(row)
    if (cells.length < MIN_CELLS) return []
    const texts = cells.map((cell) => stripTags(cell))
    if (!PERIOD.test(texts[0])) return []
    const link = /<a\b[^>]*>/i.exec(cells[5])
    const href = link === null ? null : attribute(link[0], 'href')
    return [
      {
        period: texts[0],
        operation: /VENTA/i.test(texts[1]) ? 'sale' : 'purchase',
        state: texts[2],
        kind: texts[3],
        periodicity: /RECTIF/i.test(texts[4]) ? 'rectification' : 'monthly',
        code: href === null ? null : (/Codigo=([^&\s]+)/i.exec(href)?.[1] ?? null),
      },
    ]
  })

/**
 * EN: `QEstLibro` refused the session.
 * ES: `QEstLibro` rechazó la sesión.
 */
export const isHistoryUnauthorized = (html: string): boolean =>
  html.includes('NO ESTA AUTORIZADO') || html.includes('SESION HA EXPIRADO')
```

`src/portal/pages/certification-compliance.ts` (new file, whole):

```ts
import { attribute, decodeEntities, formWithAction, inputValues, bodyText } from '../html'

/**
 * EN: The `pe_avance9` form, ready to post: its action and its fields.
 * ES: El formulario de `pe_avance9`, listo para enviar: su acción y sus campos.
 */
export type ComplianceForm = {
  /** EN: The form action. ES: La acción del formulario. */
  readonly action: string
  /** EN: Every field but `Salir`, with each `OPCn` set to `S` and `CONFIRMAR` added. ES: Todo campo salvo `Salir`, con cada `OPCn` en `S` y `CONFIRMAR` agregado. */
  readonly fields: Readonly<Record<string, string>>
}

const CONFIRM_FIELD = 'CONFIRMAR'
const CONFIRM_VALUE = 'Confirmar Declaración'
const EXIT_FIELD = 'salir'
const BUTTON_TYPES: ReadonlySet<string> = new Set(['submit', 'button', 'image', 'reset'])

const sentenceAround = (text: string, pattern: RegExp): string | null => {
  const match = pattern.exec(text)
  if (match === null) return null
  const start = text.lastIndexOf('.', match.index) + 1
  const end = text.indexOf('.', match.index + match[0].length)
  return text.slice(start, end === -1 ? text.length : end).trim()
}

/**
 * EN: The sentence that blocks the declaration (the certification is not finished), or null.
 * ES: La frase que bloquea la declaración (la certificación no ha terminado), o null.
 */
export const complianceBlock = (html: string): string | null =>
  sentenceAround(bodyText(html), /no ha finalizado su certificaci|no podr[aá] efectuar la Declaraci/i)

/**
 * EN: The second screen carries a hidden `OK_MSG` and asks to continue.
 * ES: La segunda pantalla trae un `OK_MSG` oculto y pide continuar.
 */
export const hasOkMessage = (html: string): boolean => 'OK_MSG' in inputValues(html)

/**
 * EN: The form that posts to `pe_avance9`, without the `Salir` button (a browser sends only the clicked button, and
 * `Salir=No Confirmar` could read as cancelling), every `OPCn` set to `S`, plus `CONFIRMAR`. Null when the page has
 * no such form.
 * ES: El formulario que envía a `pe_avance9`, sin el botón `Salir` (un navegador manda solo el botón pulsado, y
 * `Salir=No Confirmar` podría leerse como cancelar), cada `OPCn` en `S`, más `CONFIRMAR`. Null si la página no lo trae.
 */
export const complianceForm = (html: string): ComplianceForm | null => {
  const block = formWithAction(html, 'pe_avance9')
  if (block === null) return null
  const action = attribute(/<form\b[^>]*>/i.exec(block)![0], 'action')!
  const fields: Record<string, string> = {}
  for (const tag of block.match(/<input\b[^>]*>/gi) ?? []) {
    const name = attribute(tag, 'name')
    const type = (attribute(tag, 'type') ?? 'text').toLowerCase()
    if (name === null || name.toLowerCase() === EXIT_FIELD || BUTTON_TYPES.has(type)) continue
    fields[name] = /^OPC\d+$/i.test(name) ? 'S' : (attribute(tag, 'value') ?? '')
  }
  return { action, fields: { ...fields, [CONFIRM_FIELD]: CONFIRM_VALUE } }
}

/**
 * EN: The final page still shows the options or the company input: nothing was confirmed.
 * ES: La página final aún muestra las opciones o el campo de la empresa: no se confirmó nada.
 */
export const isUnconfirmed = (html: string): boolean =>
  /name\s*=\s*["']?OPC1\b/i.test(html) ||
  /<input\b[^>]*type\s*=\s*["']?text["']?[^>]*name\s*=\s*["']?RUT_EMP/i.test(html)

/**
 * EN: The final page says in so many words that the declaration was made. Only this wording turns an irreversible
 * post into `declared`; anything else stays `unconfirmed`.
 * ES: La página final dice con todas sus letras que la declaración se hizo. Solo este texto convierte un envío
 * irreversible en `declared`; cualquier otra cosa queda `unconfirmed`.
 */
export const isDeclared = (html: string): boolean =>
  /declaraci[oó]n de cumplimiento[^.]{0,80}?(efectuad|registrad|realizad|aceptad|recibid|exitos)|ha finalizado (?:con )?(?:el proceso de |su |la )?certificaci/i.test(
    decodeEntities(bodyText(html)),
  )

/**
 * EN: The sentence that reports the declaration, or the page's first words.
 * ES: La frase que informa la declaración, o las primeras palabras de la página.
 */
export const complianceMessage = (html: string): string => {
  const text = decodeEntities(bodyText(html))
  return (
    sentenceAround(text, /declaraci[oó]n de cumplimiento|ha finalizado|certificad[ao]|efectuada/i) ?? text.slice(0, 400)
  )
}
```

`src/catalogs/certification.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/catalogs/certification.ts b/src/catalogs/certification.ts
index cd82404..8a47c10 100644
--- a/src/catalogs/certification.ts
+++ b/src/catalogs/certification.ts
@@ -62,3 +62,136 @@ export const TEST_SET_REFERENCE_TYPE = 'SET'
  * relleno. El SII lo acepta, existe como contribuyente y no es dato personal de nadie.
  */
 export const CERTIFICATION_COUNTERPARTY = { rut: SII_RUT, name: 'Razon Social' } as const
+
+/** EN: The four sets the certification issues. ES: Los cuatro sets que emite la certificación. */
+export type SetKey = 'basic' | 'exempt' | 'guide' | 'purchase'
+
+/** EN: The books of the certification. ES: Los libros de la certificación. */
+export type BookKey = 'salesBook' | 'purchaseBook' | 'exemptPurchaseBook' | 'guideBook'
+
+/**
+ * EN: Every row the declaration form (`pe_avance2`) can hold, by key.
+ * ES: Cada fila que puede traer el formulario de declaración de avance (`pe_avance2`), por clave.
+ */
+export type DeclarationKey = SetKey | BookKey | 'simulation' | 'export1' | 'export2' | 'settlement'
+
+/** EN: The sets in the order they are sent. ES: Los sets en el orden en que se envían. */
+export const SET_KEYS: readonly SetKey[] = ['basic', 'guide', 'exempt', 'purchase']
+
+/** EN: The books in the order they are sent. ES: Los libros en el orden en que se envían. */
+export const BOOK_KEYS: readonly BookKey[] = ['purchaseBook', 'salesBook', 'guideBook', 'exemptPurchaseBook']
+
+/** EN: The books every certification must get approved. ES: Los libros que toda certificación debe tener aprobados. */
+export const MANDATORY_BOOK_KEYS: readonly BookKey[] = ['purchaseBook', 'salesBook', 'guideBook']
+
+/**
+ * EN: The file name each book travels under in the upload, as the SII expects it.
+ * ES: `FILE` — El nombre de archivo con que viaja cada libro en el envío, como lo espera el SII.
+ */
+export const BOOK_FILE_NAMES: Readonly<Record<BookKey, string>> = {
+  salesBook: 'LibroCV.xml',
+  purchaseBook: 'LibroCV.xml',
+  exemptPurchaseBook: 'LibroCVExentos.xml',
+  guideBook: 'LibroGuia.xml',
+}
+
+/** EN: The artefact name of each book. ES: El nombre de artefacto de cada libro. */
+export const BOOK_ARTEFACT_NAMES: Readonly<Record<BookKey, string>> = {
+  salesBook: 'libro-ventas.xml',
+  purchaseBook: 'libro-compras.xml',
+  exemptPurchaseBook: 'libro-compras-exentos.xml',
+  guideBook: 'libro-guias.xml',
+}
+
+/** EN: The artefact name of each set envelope. ES: El nombre de artefacto del sobre de cada set. */
+export const SET_ARTEFACT_NAMES: Readonly<Record<SetKey, string>> = {
+  basic: 'sets-prueba/envio-set-basico.xml',
+  guide: 'sets-prueba/envio-set-guia.xml',
+  exempt: 'sets-prueba/envio-set-exenta.xml',
+  purchase: 'sets-prueba/envio-set-compra.xml',
+}
+
+/**
+ * EN: The optional sets ticked when downloading the test set: guides (03), exempt invoices (06), the sales (07),
+ * purchase (08) and guide (09) books, the purchase book for exempt taxpayers (15) and the purchase set (72). Export
+ * (11) and settlement (84) are never ticked by default. The basic set (01) is always requested.
+ * ES: `SETnn` — Los sets opcionales marcados al descargar el set de pruebas: guías (03), facturas exentas (06), los
+ * libros de ventas (07), compras (08) y guías (09), el libro de compras para exentos (15) y el set de factura de compra
+ * (72). Exportación (11) y liquidación (84) nunca van por defecto. El set básico (01) siempre se pide.
+ */
+export const DEFAULT_OPTIONAL_SETS: readonly string[] = ['SET03', 'SET06', 'SET07', 'SET08', 'SET09', 'SET15', 'SET72']
+
+/**
+ * EN: The stages of a certification, in order, as the runner keeps them.
+ * ES: Las etapas de una certificación, en orden, como las lleva el ejecutor.
+ */
+export const CERTIFICATION_STAGES = [
+  'testSets',
+  'books',
+  'simulation',
+  'exchange',
+  'printedSamples',
+  'compliance',
+  'done',
+] as const
+
+/** EN: Union of the stages. ES: Unión de las etapas. */
+export type CertificationStage = (typeof CERTIFICATION_STAGES)[number]
+
+/**
+ * EN: The words the portal uses for a stage (`pe_avance6`, "paso <b>…</b>"), from the latest stage down. Any wording
+ * past the exchange lands in `printedSamples`: the compliance declaration tells whether the samples are approved.
+ * ES: Las palabras con que el portal nombra una etapa (`pe_avance6`, "paso <b>…</b>"), de la última hacia atrás.
+ * Cualquier texto posterior al intercambio cae en `printedSamples`: la declaración de cumplimiento dice si las
+ * muestras ya están aprobadas.
+ */
+export const PORTAL_STAGE_WORDS: readonly { readonly stage: CertificationStage; readonly words: readonly string[] }[] =
+  [
+    {
+      stage: 'printedSamples',
+      words: ['DOCUMENTOS IMPRESOS', 'MUESTRAS IMPRESAS', 'BOLETA', 'AUTORIZADO', 'COMPLETADO'],
+    },
+    { stage: 'exchange', words: ['INTERCAMBIO'] },
+    { stage: 'simulation', words: ['SIMULACION'] },
+    { stage: 'books', words: ['LIBRO'] },
+  ]
+
+/**
+ * EN: The names of the progress events the steps emit.
+ * ES: Los nombres de los eventos de progreso que emiten los pasos.
+ */
+export const CERTIFICATION_STEPS = [
+  'SETS_DOWNLOADING',
+  'SETS_LOADED',
+  'SETS_REGENERATED',
+  'CAF_REQUESTING',
+  'CAF_OK',
+  'SET_START',
+  'SET_OK',
+  'SET_ERROR',
+  'SETS_DECLARING',
+  'SETS_DECLARED',
+  'POLLING',
+  'SETS_APPROVED',
+  'SETS_REJECTED',
+  'BOOKS_START',
+  'BOOK_SKIPPED',
+  'BOOK_SENDING',
+  'BOOK_OK',
+  'BOOK_ERROR',
+  'BOOK_PERIOD_RETRY',
+  'BOOKS_DECLARING',
+  'BOOKS_DONE',
+  'ADVANCE_WAITING',
+  'ADVANCE_DONE',
+  'SIM_START',
+  'SIM_SENDING',
+  'SIM_OK',
+  'SIM_DECLARING',
+  'SIM_DONE',
+  'CERT_DONE',
+  'CERT_ERROR',
+] as const
+
+/** EN: Union of the progress event names. ES: Unión de los nombres de evento de progreso. */
+export type CertificationStep = (typeof CERTIFICATION_STEPS)[number]
```

`src/catalogs/portal.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/catalogs/portal.ts b/src/catalogs/portal.ts
index baeebea..bd56b28 100644
--- a/src/catalogs/portal.ts
+++ b/src/catalogs/portal.ts
@@ -168,6 +168,9 @@ export type PortalRejection =
   | 'reobtainFormMissing'
   | 'reobtainDownloadMissing'
   | 'reobtainCafMissing'
+  | 'notEnrolled'
+  | 'advanceRefused'
+  | 'declarationDeclined'
   | 'backupCaptcha'
   | 'backupIndeterminate'
   | 'backupNoData'
@@ -227,6 +230,12 @@ export const PORTAL_REJECTIONS: Readonly<Record<PortalRejection, string>> = {
     'Un solo día supera los 20 documentos por descarga y tiene documentos de tipos que no se saben separar: no se pudo cubrir completo, y por eso no se descargó nada.',
   purchaseChangeNotConfirmed:
     'El SII no confirmó el cambio en el registro de compras, pero pudo haberse aplicado: hay que releer el documento antes de reintentar.',
+  notEnrolled:
+    'La empresa no está inscrita en la Postulación a Factura Electrónica: el representante legal debe inscribirla en el ambiente de certificación antes de descargar el set de pruebas.',
+  advanceRefused:
+    'El portal no avanzó la postulación al paso siguiente: revisa el estado de los sets y libros en "Ver Avance de la Postulación".',
+  declarationDeclined:
+    'El portal no ofreció el formulario de declaración de avance: la fila pedida no existe en esta etapa, o la página muestra envíos con errores o reparos.',
 }
 
 /**
```

`src/portal/html.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/portal/html.ts b/src/portal/html.ts
index 96718dd..3de8d07 100644
--- a/src/portal/html.ts
+++ b/src/portal/html.ts
@@ -55,6 +55,15 @@ export const stripTags = (html: string): string =>
 export const visibleText = (html: string, max = 400): string =>
   stripTags(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')).slice(0, max)
 
+/**
+ * EN: The whole readable text of a page, title excluded: what the certification pages are classified on, because the
+ * title is the same on every one of them and its words would leak into the sentences read.
+ * ES: Todo el texto legible de una página, sin el título: sobre esto se clasifican las páginas de certificación, porque
+ * el título es el mismo en todas y sus palabras se colarían en las frases leídas.
+ */
+export const bodyText = (html: string): string =>
+  visibleText(html.replace(/<title[\s\S]*?<\/title>/gi, ' '), Number.MAX_SAFE_INTEGER)
+
 /**
  * EN: Value of an attribute inside a tag, with double, single or no quotes. It needs a separator before the name, so
  * `this.value=` inside a handler is not taken for it.
@@ -99,6 +108,20 @@ export const inputTags = (html: string): readonly InputTag[] =>
 export const inputValues = (html: string): Readonly<Record<string, string>> =>
   Object.fromEntries(inputTags(html).map((tag) => [tag.name, tag.value]))
 
+/**
+ * EN: The hidden fields of a fragment, as a map: what a page carries forward to its next post.
+ * ES: Los campos ocultos de un fragmento, como mapa: lo que una página arrastra a su siguiente envío.
+ */
+export const hiddenInputs = (html: string): Readonly<Record<string, string>> =>
+  Object.fromEntries(
+    (html.match(/<input\b[^>]*>/gi) ?? [])
+      .filter((tag) => attribute(tag, 'type')?.toLowerCase() === 'hidden')
+      .flatMap((tag) => {
+        const name = attribute(tag, 'name')
+        return name === null ? [] : [[name, attribute(tag, 'value') ?? '']]
+      }),
+  )
+
 /**
  * EN: Every `<form>…</form>` block of a page, in order.
  * ES: Todos los bloques `<form>…</form>` de una página, en orden.
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/pages-certification tests/portal/html --coverage=false
```

Expected: PASS, 50 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/portal/pages/certification-set.ts src/portal/pages/certification-progress.ts src/portal/pages/certification-books.ts src/portal/pages/certification-compliance.ts src/catalogs/certification.ts src/catalogs/portal.ts src/portal/html.ts tests/support/certification-pages.ts tests/portal/pages-certification-set.test.ts tests/portal/pages-certification-progress.test.ts tests/portal/pages-certification-books.test.ts tests/portal/pages-certification-compliance.test.ts tests/portal/html.test.ts
```

```bash
git commit -F - <<'MSG'
feat: the certification portal pages (set download, progress and declaration, book history, compliance)

Pure parsers of pe_generar1/2, pe_avance2/3/4/6, QEstLibro and the compliance wizard screens, on synthetic HTML with the old portal's quirks: the rows of the declaration form by label with the index of their input, the classification of the portal's answers, the re-read verification that reports a missing row or another track id, the positive wording that alone confirms a compliance declaration. The catalog gains the set, book and declaration keys, the stage words, the step names and three portal rejections; the HTML helpers gain the page text without its title and the hidden fields.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 2: The certification portal operations

Six operations on the phase 4 session (spec 3.3): `downloadTestSet` (the company confirmation, the optional sets, a dropped session repeated once, `notEnrolled`), `declareProgress` (every `NUM_ENV`, `FEC_ENV`, `SET`, `EST` field in form order, the track id without leading zeros, the date as `dd-mm-yyyy`, the verification re-read, the outcomes in the field's order), `readProgress`, `advanceStage` (`TOTREG` and `PASO` from the form), `listBookHistory` (`DTEauth?7` then `QEstLibro`) and `declareCompliance` (the three screens, never `Salir`, `declared` only on a positive wording). The posts that change the application are never retried. `queryCertificationSets` shares the entry sequence.

**Files:**

- Modify: `src/portal/certification.ts`
- Test (create): `tests/portal/certification-operations.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/portal/certification-operations.test.ts` (new file, whole):

```ts
import {
  advanceStage,
  declareCompliance,
  declareProgress,
  downloadTestSet,
  listBookHistory,
  readProgress,
} from '../../src/portal/certification'
import { parseTestSetText } from '../../src/certification/set-text'
import {
  ADVANCE_ANSWERS,
  bookHistoryPage,
  COMPLIANCE_BLOCKED,
  COMPLIANCE_DECLARED,
  COMPLIANCE_ENTRY,
  COMPLIANCE_FORM,
  COMPLIANCE_OK_MSG,
  COMPLIANCE_UNCONFIRMED,
  DECLARATION_ANSWERS,
  declarationFormPage,
  HISTORY_UNAUTHORIZED,
  NOT_ENROLLED,
  progressPage,
  SESSION_DROPPED,
  SET_ENTRY,
  setDownloadPage,
  setGenerationForm,
  STANDARD_ROWS,
  STATUS_PAGE,
  type DeclarationRowSpec,
} from '../support/certification-pages'
import { failure, MAULLIN, signedIn, type PortalHarness } from '../support/portal'
import { certificationPage, page, REJECTION_PAGES } from '../support/portal-pages'
import { ATTENTION, FULL_SET_TEXT } from '../support/test-set-samples'

const UPL = 'https://maullin.sii.cl/cgi_dte/UPL'
const get = (name: string, ...bodies: readonly string[]) => ({
  url: `${MAULLIN}/${name}`,
  method: 'GET' as const,
  reply: bodies.map((body) => ({ body })),
})
const post = (name: string, ...bodies: readonly string[]) => ({
  url: `${MAULLIN}/${name}`,
  method: 'POST' as const,
  reply: bodies.map((body) => ({ body })),
})
const entry = get('pe_avance1', page('entry'), page('entry'), page('entry'))
const COMPANY = { RUT_EMP: '76543210', DV_EMP: '3' }

describe('downloadTestSet', () => {
  const routes = (download = setDownloadPage(), ...more: readonly string[]) => [
    get('pe_generar', SET_ENTRY, SET_ENTRY),
    post('pe_generar1', setGenerationForm(), setGenerationForm()),
    post('pe_generar2', download, ...more),
  ]

  test('confirms the company, ticks the default optional sets the page offers, and returns the text', async () => {
    const harness = await signedIn(routes())
    const result = await downloadTestSet(harness.portal)
    expect(harness.posted('pe_generar1')).toEqual([{ ...COMPANY, CODIGO: '8', ACEPTAR: 'Confirmar Empresa' }])
    expect(harness.posted('pe_generar2')).toEqual([
      {
        AUTORIZADA: 'S',
        TOTAL: '15',
        SET01: 'S',
        SET03: 'S',
        SET06: 'S',
        SET07: 'S',
        SET08: 'S',
        SET09: 'S',
        SET15: 'S',
        SET72: 'S',
      },
    ])
    expect(result.requested).toEqual(['SET01', 'SET03', 'SET06', 'SET07', 'SET08', 'SET09', 'SET15', 'SET72'])
    expect(result.states.map((state) => state.name)).toEqual(['SET BASICO', 'SET GUIA DE DESPACHO'])
    expect(result.optionalSets).toHaveLength(8)
    expect(result.attentionNumber).toBe(ATTENTION)
    expect(result.regenerated).toBe(false)
    expect(parseTestSetText(result.text!).length).toBe(parseTestSetText(FULL_SET_TEXT).length)
  })

  test('custom optional sets, only those offered; a regenerated set is reported', async () => {
    const harness = await signedIn(routes(setDownloadPage(FULL_SET_TEXT, '<p>Set generado correctamente</p>')))
    const result = await downloadTestSet(harness.portal, {
      optionalSets: ['SET11', 'SET99'],
      previousAttentionNumber: '1',
    })
    expect(harness.posted('pe_generar2')).toEqual([{ AUTORIZADA: 'S', TOTAL: '15', SET01: 'S', SET11: 'S' }])
    expect(result.regenerated).toBe(true)
  })

  test('download: false reads the table and generates nothing', async () => {
    const harness = await signedIn(routes())
    const result = await downloadTestSet(harness.portal, { download: false })
    expect(result).toMatchObject({ requested: [], text: null, attentionNumber: null, regenerated: false })
    expect(harness.posted('pe_generar2')).toEqual([])
  })

  test('a landing page that already shows the form skips pe_generar1', async () => {
    const harness = await signedIn([get('pe_generar', setGenerationForm()), post('pe_generar2', setDownloadPage())])
    await downloadTestSet(harness.portal)
    expect(harness.posted('pe_generar1')).toEqual([])
  })

  test('"no está inscrito" once is retried with a fresh session; twice is notEnrolled', async () => {
    const once = await signedIn([
      get('pe_generar', NOT_ENROLLED, SET_ENTRY),
      post('pe_generar1', setGenerationForm()),
      post('pe_generar2', setDownloadPage()),
    ])
    await expect(downloadTestSet(once.portal)).resolves.toMatchObject({ attentionNumber: ATTENTION })
    expect(once.urls().filter((url) => url.endsWith('pe_generar'))).toHaveLength(2)
    const twice = await signedIn([get('pe_generar', NOT_ENROLLED, NOT_ENROLLED)])
    expect((await failure(downloadTestSet(twice.portal))).details).toMatchObject({ rejection: 'notEnrolled' })
  })

  test('a refusal and an unreadable generation page', async () => {
    const refused = await signedIn([get('pe_generar', REJECTION_PAGES.companyNotAuthorized)])
    expect((await failure(downloadTestSet(refused.portal))).details).toMatchObject({
      rejection: 'companyNotAuthorized',
    })
    const blank = await signedIn([get('pe_generar', SET_ENTRY), post('pe_generar1', page('<p>nada</p>'))])
    expect((await failure(downloadTestSet(blank.portal))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    const refusedLater = await signedIn([
      get('pe_generar', SET_ENTRY),
      post('pe_generar1', REJECTION_PAGES.optionNotAuthorized),
    ])
    expect((await failure(downloadTestSet(refusedLater.portal))).details).toMatchObject({
      rejection: 'optionNotAuthorized',
    })
  })

  test('a session dropped on the download is forgotten and the sequence repeated once', async () => {
    const harness = await signedIn(routes(SESSION_DROPPED, setDownloadPage()))
    await expect(downloadTestSet(harness.portal)).resolves.toMatchObject({ attentionNumber: ATTENTION })
    expect(harness.posted('pe_generar2')).toHaveLength(2)
    const twice = await signedIn([
      get('pe_generar', SET_ENTRY, SET_ENTRY),
      post('pe_generar1', setGenerationForm(), setGenerationForm()),
      post('pe_generar2', SESSION_DROPPED, SESSION_DROPPED),
    ])
    expect((await failure(downloadTestSet(twice.portal))).code).toBe('SII_PORTAL_SESSION_EXPIRED')
  })

  test('a downloaded page that is no set, a refused one, and one with cases but no attention number', async () => {
    const empty = await signedIn(routes(page('<p>Sin contenido</p>')))
    expect((await failure(downloadTestSet(empty.portal))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    const refused = await signedIn(routes(REJECTION_PAGES.userWithoutPermission))
    expect((await failure(downloadTestSet(refused.portal))).details).toMatchObject({
      rejection: 'userWithoutPermission',
    })
    const bare = await signedIn(routes(page('<pre>CASO 1\nDOCUMENTO FACTURA</pre>')))
    await expect(downloadTestSet(bare.portal)).resolves.toMatchObject({
      attentionNumber: null,
      text: 'CASO 1\nDOCUMENTO FACTURA',
    })
  })
})

describe('declareProgress', () => {
  const declaring = (form: string, answer: string, reread: string = form) =>
    signedIn([entry, post('pe_avance2', form, reread), post('pe_avance3', answer)])
  const basic = { basic: { trackId: '0001234', date: '2026-11-04' } }

  test('posts every field in form order with the current values, the track id without zeros, the date reversed', async () => {
    const rows: DeclarationRowSpec[] = [
      { label: 'SET BASICO', state: 'REVISADO CONFORME' },
      { label: 'SET GUIA DE DESPACHO', index: 1, value: '77', date: '01-11-2026', est: 'S21' },
      { label: 'SET FACTURA EXENTA', index: 2 },
      { label: 'LIBRO DE VENTAS', index: 3 },
    ]
    const reread = declarationFormPage([rows[0], rows[1], { ...rows[2], value: '9' }, rows[3]], { totreg: 4 })
    const harness = await declaring(declarationFormPage(rows, { totreg: 4 }), DECLARATION_ANSWERS.success, reread)
    const result = await declareProgress(harness.portal, {
      entries: {
        exempt: { trackId: '0009', date: '2026-11-04' },
        basic: { trackId: '1', date: '2026-11-04' },
        guideBook: undefined,
      },
    })
    expect(result.outcome).toBe('accepted')
    expect(result.declared).toEqual(['exempt'])
    const [posted] = harness.posted('pe_avance3')
    expect(Object.keys(posted)).toEqual([
      'NUM_ENV1',
      'FEC_ENV1',
      'SET1',
      'EST1',
      'NUM_ENV2',
      'FEC_ENV2',
      'SET2',
      'EST2',
      'NUM_ENV3',
      'FEC_ENV3',
      'SET3',
      'EST3',
      'NUM_ENV4',
      'FEC_ENV4',
      'SET4',
      'EST4',
      'RUT_EMP',
      'DV_EMP',
      'TOTREG',
      'ACEPTAR',
    ])
    expect(posted).toMatchObject({
      NUM_ENV1: '77',
      FEC_ENV1: '01-11-2026',
      SET1: 'S01',
      EST1: 'S21',
      NUM_ENV2: '9',
      FEC_ENV2: '04-11-2026',
      SET2: 'S02',
      EST2: 'S01',
      NUM_ENV3: '',
      FEC_ENV3: '',
      SET3: 'S03',
      EST3: 'S01',
      NUM_ENV4: '',
      FEC_ENV4: '',
      SET4: '',
      EST4: '',
      RUT_EMP: '76543210',
      DV_EMP: '3',
      TOTREG: '4',
      ACEPTAR: 'Confirmar Revisión',
    })
    expect(result.verification).toEqual({ exempt: 'kept' })
  })

  test('TOTREG falls back to 10 without the hidden field', async () => {
    const form = page(
      '<input type=hidden name=PASO value=P01><tr><td>SET BASICO</td><td><input name=NUM_ENV1></td></tr>',
    )
    const harness = await declaring(form, DECLARATION_ANSWERS.success)
    await declareProgress(harness.portal, { entries: basic })
    const [posted] = harness.posted('pe_avance3')
    expect(posted.TOTREG).toBe('10')
    expect(Object.keys(posted)).toHaveLength(44)
  })

  test.each([
    ['contentErrors', DECLARATION_ANSWERS.contentErrors, STANDARD_ROWS, ['exemptPurchaseBook', 'basic']],
    ['notProcessed', DECLARATION_ANSWERS.notProcessed, STANDARD_ROWS, []],
    ['allRejected', DECLARATION_ANSWERS.success, STANDARD_ROWS, []],
    [
      'inReview',
      DECLARATION_ANSWERS.success,
      [{ label: 'SET BASICO', state: 'EN REVISION' }, ...STANDARD_ROWS.slice(1)],
      [],
    ],
    [
      'accepted',
      DECLARATION_ANSWERS.success,
      [{ label: 'SET BASICO', index: 1, value: '1234' }, ...STANDARD_ROWS.slice(1)],
      [],
    ],
  ] as const)('outcome %s from the answer and the re-read', async (outcome, answer, reread, contentErrors) => {
    const harness = await declaring(declarationFormPage(STANDARD_ROWS), answer, declarationFormPage(reread))
    const result = await declareProgress(harness.portal, { entries: basic })
    expect(result.outcome).toBe(outcome)
    expect(result.contentErrors).toEqual(contentErrors)
    expect(result.answerHtml).toBe(answer)
    expect(harness.posted('pe_avance2')).toHaveLength(2)
  })

  test('allRejected when every declared row came back empty; notSaved when only some did', async () => {
    const two = { basic: { trackId: '1', date: '2026-11-04' }, guide: { trackId: '2', date: '2026-11-04' } }
    const all = await declaring(declarationFormPage(STANDARD_ROWS), DECLARATION_ANSWERS.success)
    const rejected = await declareProgress(all.portal, { entries: two })
    expect(rejected.outcome).toBe('allRejected')
    expect(rejected.verification).toEqual({ basic: 'empty', guide: 'empty' })
    const some = await declaring(
      declarationFormPage(STANDARD_ROWS),
      DECLARATION_ANSWERS.success,
      declarationFormPage([STANDARD_ROWS[0], { ...STANDARD_ROWS[1], value: '2' }, ...STANDARD_ROWS.slice(2)]),
    )
    await expect(declareProgress(some.portal, { entries: two })).resolves.toMatchObject({
      outcome: 'notSaved',
      verification: { basic: 'empty', guide: 'kept' },
    })
  })

  test('inconsistent data and failures stop before the re-read', async () => {
    const inconsistent = await declaring(declarationFormPage(STANDARD_ROWS), DECLARATION_ANSWERS.inconsistent)
    await expect(declareProgress(inconsistent.portal, { entries: basic })).resolves.toMatchObject({
      outcome: 'inconsistent',
      detail: 'LA FECHA DE ENVIO NO CORRESPONDE AL ENVIO 123',
    })
    expect(inconsistent.posted('pe_avance2')).toHaveLength(1)
    const mismatch = await declaring(declarationFormPage(STANDARD_ROWS), DECLARATION_ANSWERS.contentMismatch)
    await expect(declareProgress(mismatch.portal, { entries: basic })).resolves.toMatchObject({
      outcome: 'failed',
      detail: 'contentMismatch',
    })
    const error = await declaring(declarationFormPage(STANDARD_ROWS), DECLARATION_ANSWERS.plainError)
    await expect(declareProgress(error.portal, { entries: basic })).resolves.toMatchObject({
      outcome: 'failed',
      detail: 'SII Se produjo un error al registrar el avance.',
    })
  })

  test('a re-read that holds another track id, lacks the row, or is no form at all', async () => {
    const other = await declaring(
      declarationFormPage(STANDARD_ROWS),
      DECLARATION_ANSWERS.success,
      declarationFormPage([{ label: 'SET BASICO', index: 1, value: '999' }, ...STANDARD_ROWS.slice(1)]),
    )
    await expect(declareProgress(other.portal, { entries: basic })).resolves.toMatchObject({
      outcome: 'notSaved',
      verification: { basic: 'mismatch' },
    })
    const gone = await declaring(
      declarationFormPage(STANDARD_ROWS),
      DECLARATION_ANSWERS.success,
      declarationFormPage(STANDARD_ROWS.slice(1)),
    )
    await expect(declareProgress(gone.portal, { entries: basic })).resolves.toMatchObject({
      outcome: 'notSaved',
      verification: { basic: 'missing' },
    })
    const status = await declaring(declarationFormPage(STANDARD_ROWS), DECLARATION_ANSWERS.success, page('<p>nada</p>'))
    expect((await failure(declareProgress(status.portal, { entries: basic }))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
  })

  test('an expired session is thrown and forgotten', async () => {
    const harness = await declaring(declarationFormPage(STANDARD_ROWS), DECLARATION_ANSWERS.sessionExpired)
    expect((await failure(declareProgress(harness.portal, { entries: basic }))).code).toBe('SII_PORTAL_SESSION_EXPIRED')
  })

  test('declined: a status page, error states, a missing simulation row, no row at all', async () => {
    const status = await declaring(page('<p>nada</p>'), '')
    await expect(declareProgress(status.portal, { entries: basic })).resolves.toMatchObject({
      outcome: 'declined',
      detail: 'noForm',
    })
    const errors = await declaring(STATUS_PAGE, '')
    await expect(declareProgress(errors.portal, { entries: basic })).resolves.toMatchObject({
      outcome: 'declined',
      detail: 'errorStates',
    })
    const simulation = await declaring(declarationFormPage(STANDARD_ROWS), '')
    await expect(
      declareProgress(simulation.portal, {
        entries: { simulation: { trackId: '1', date: '2026-11-04' }, basic: basic.basic },
      }),
    ).resolves.toMatchObject({ outcome: 'declined', detail: 'simulationUnavailable' })
    const approved = await declaring(declarationFormPage([{ label: 'SET BASICO', state: 'REVISADO CONFORME' }]), '')
    await expect(declareProgress(approved.portal, { entries: basic })).resolves.toMatchObject({
      outcome: 'declined',
      detail: 'noRows',
    })
    expect(approved.posted('pe_avance3')).toEqual([])
  })

  test('invalid input is refused before any request', async () => {
    const harness = await declaring(declarationFormPage(STANDARD_ROWS), '')
    expect((await failure(declareProgress(harness.portal, { entries: {} }))).details).toEqual({ field: 'entries' })
    expect(
      (await failure(declareProgress(harness.portal, { entries: { basic: { trackId: 'x1', date: '2026-11-04' } } })))
        .details,
    ).toEqual({ field: 'trackId' })
    expect(
      (await failure(declareProgress(harness.portal, { entries: { basic: { trackId: '1', date: '04-11-2026' } } })))
        .code,
    ).toBe('INVALID_DATE')
    expect(harness.urls()).toEqual([])
  })
})

describe('posts that change the application are never retried', () => {
  const unavailable = { status: 503, body: 'down' }
  const retrying = { retry: { maxAttempts: 2, jitterRatio: 0, baseDelayMs: 1 } }

  test('pe_generar2 is sent once; pe_avance3 keeps the retry policy', async () => {
    const generate = await signedIn(
      [
        get('pe_generar', SET_ENTRY),
        post('pe_generar1', setGenerationForm()),
        { url: `${MAULLIN}/pe_generar2`, method: 'POST' as const, reply: [unavailable, { body: setDownloadPage() }] },
      ],
      retrying,
    )
    expect((await failure(downloadTestSet(generate.portal))).code).toBe('SII_HTTP_ERROR')
    expect(generate.posted('pe_generar2')).toHaveLength(1)
    const declare = await signedIn(
      [
        entry,
        post('pe_avance2', declarationFormPage(STANDARD_ROWS), declarationFormPage(STANDARD_ROWS)),
        {
          url: `${MAULLIN}/pe_avance3`,
          method: 'POST' as const,
          reply: [unavailable, { body: DECLARATION_ANSWERS.success }],
        },
      ],
      retrying,
    )
    await expect(
      declareProgress(declare.portal, { entries: { basic: { trackId: '1', date: '2026-11-04' } } }),
    ).resolves.toMatchObject({ outcome: 'allRejected' })
    expect(declare.posted('pe_avance3')).toHaveLength(2)
  })

  test('pe_avance4, the OK_MSG continue and pe_avance9 are sent once', async () => {
    const advance = await signedIn(
      [
        entry,
        post('pe_avance2', certificationPage()),
        {
          url: `${MAULLIN}/pe_avance4`,
          method: 'POST' as const,
          reply: [unavailable, { body: ADVANCE_ANSWERS.advanced }],
        },
      ],
      retrying,
    )
    expect((await failure(advanceStage(advance.portal))).code).toBe('SII_HTTP_ERROR')
    expect(advance.posted('pe_avance4')).toHaveLength(1)
    const cont = await signedIn(
      [
        get('pe_avance7', COMPLIANCE_ENTRY),
        {
          url: `${MAULLIN}/pe_avance8`,
          method: 'POST' as const,
          reply: [{ body: COMPLIANCE_OK_MSG }, unavailable, { body: COMPLIANCE_FORM }],
        },
      ],
      retrying,
    )
    expect((await failure(declareCompliance(cont.portal))).code).toBe('SII_HTTP_ERROR')
    expect(cont.posted('pe_avance8')).toHaveLength(2)
    const final = await signedIn(
      [
        get('pe_avance7', COMPLIANCE_ENTRY),
        post('pe_avance8', COMPLIANCE_FORM),
        { url: `${MAULLIN}/pe_avance9`, method: 'POST' as const, reply: [unavailable, { body: COMPLIANCE_DECLARED }] },
      ],
      retrying,
    )
    expect((await failure(declareCompliance(final.portal))).code).toBe('SII_HTTP_ERROR')
    expect(final.posted('pe_avance9')).toHaveLength(1)
  })
})

describe('readProgress', () => {
  const reading = (form: string, progress: string): Promise<PortalHarness> =>
    signedIn([entry, post('pe_avance2', form), get('pe_avance5', page('p5')), post('pe_avance6', progress)])

  test('the entry sequence, pe_avance5, pe_avance6 with the company, the rows on the way', async () => {
    const harness = await reading(
      certificationPage(),
      progressPage('INTERCAMBIO', { 'SET BASICO': 'REVISADO CONFORME' }),
    )
    const report = await readProgress(harness.portal)
    expect(report).toMatchObject({ stage: 'INTERCAMBIO', stageKey: 'exchange', simulationAwaitsConfirmation: false })
    expect(report.states.basic).toEqual({ text: 'REVISADO CONFORME', state: 'approved' })
    expect(report.rows).toHaveLength(7)
    expect(harness.posted('pe_avance6')).toEqual([{ ...COMPANY, ACEPTAR: 'Continuar' }])
    expect(harness.urls().map((url) => url.split('/').pop())).toEqual([
      'pe_avance1',
      'pe_avance2',
      'pe_avance5',
      'pe_avance6',
    ])
  })

  test('in the simulation stage the confirmation offer is also looked for on pe_avance2', async () => {
    const offer = progressPage('SIMULACION', {}, { confirm: true })
    const onForm = await reading(offer, progressPage('SIMULACION', { 'SET SIMULACION': 'EN REVISION' }))
    await expect(readProgress(onForm.portal)).resolves.toMatchObject({ simulationAwaitsConfirmation: true })
    const elsewhere = await reading(offer, progressPage('INTERCAMBIO', { 'SET SIMULACION': 'REVISADO CONFORME' }))
    await expect(readProgress(elsewhere.portal)).resolves.toMatchObject({ simulationAwaitsConfirmation: false })
  })

  test('a page with no stage and no state is unexpected; a refusal is a refusal', async () => {
    const blank = await reading(certificationPage(), page('<p>nada</p>'))
    expect((await failure(readProgress(blank.portal))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    const refused = await reading(certificationPage(), REJECTION_PAGES.optionNotAuthorized)
    expect((await failure(readProgress(refused.portal))).details).toMatchObject({ rejection: 'optionNotAuthorized' })
  })
})

describe('advanceStage', () => {
  test.each([
    ['advanced', 'advanced'],
    ['finished', 'advanced'],
    ['unchanged', 'unchanged'],
    ['failed', 'failed'],
  ] as const)('%s → %s, with TOTREG and PASO from the form', async (name, outcome) => {
    const harness = await signedIn([
      entry,
      post('pe_avance2', declarationFormPage(STANDARD_ROWS, { totreg: 7, paso: 'P03' })),
      post('pe_avance4', ADVANCE_ANSWERS[name]),
    ])
    await expect(advanceStage(harness.portal)).resolves.toMatchObject({ outcome })
    expect(harness.posted('pe_avance4')).toEqual([
      { ...COMPANY, TOTREG: '7', PASO: 'P03', ACEPTAR: 'Avanzar Siguiente Paso' },
    ])
  })

  test('defaults without hidden fields, and a refusal', async () => {
    const harness = await signedIn([
      entry,
      post('pe_avance2', certificationPage()),
      post('pe_avance4', ADVANCE_ANSWERS.advanced),
    ])
    await advanceStage(harness.portal)
    expect(harness.posted('pe_avance4')[0]).toMatchObject({ TOTREG: '0', PASO: 'P01' })
    const refused = await signedIn([
      entry,
      post('pe_avance2', certificationPage()),
      post('pe_avance4', REJECTION_PAGES.companyNotAuthorized),
    ])
    expect((await failure(advanceStage(refused.portal))).details).toMatchObject({ rejection: 'companyNotAuthorized' })
  })
})

describe('listBookHistory', () => {
  const history = (body: string) => [
    { url: `${UPL}/DTEauth?7`, reply: { body: page('auth') } },
    { url: `${UPL}/QEstLibro*`, reply: { body } },
  ]

  test('binds the session, queries the year and lists the occupied periods once each', async () => {
    const harness = await signedIn(
      history(
        bookHistoryPage([
          ['2026-10', 'COMPRA', 'Recibido', 'LIBRO', 'MENSUAL', 'A1'],
          ['2026-10', 'VENTA', 'Recibido', 'LIBRO', 'MENSUAL', 'A2'],
          ['2026-08', 'VENTA', 'Recibido', 'LIBRO', 'MENSUAL', null],
        ]),
      ),
    )
    const result = await listBookHistory(harness.portal, { year: 2026 })
    expect(result.year).toBe(2026)
    expect(result.entries).toHaveLength(3)
    expect(result.occupiedPeriods).toEqual(['2026-10', '2026-08'])
    expect(harness.urls()).toEqual([
      `${UPL}/DTEauth?7`,
      `${UPL}/QEstLibro?rutCompany=76543210&dvCompany=3&TrackId=&year=2026&month=00&tipo=TODOS`,
    ])
  })

  test('an unauthorized answer expires the session; an invalid year is refused first', async () => {
    const harness = await signedIn(history(HISTORY_UNAUTHORIZED))
    expect((await failure(listBookHistory(harness.portal, { year: 2026 }))).code).toBe('SII_PORTAL_SESSION_EXPIRED')
    expect((await failure(listBookHistory(harness.portal, { year: 1 }))).details).toEqual({ field: 'year' })
    expect((await failure(listBookHistory(harness.portal, { year: 2026.5 }))).details).toEqual({ field: 'year' })
  })
})

describe('declareCompliance', () => {
  const wizard = (second: string, third?: string, final?: string) => [
    get('pe_avance7', COMPLIANCE_ENTRY),
    post('pe_avance8', second, ...(third === undefined ? [] : [third])),
    ...(final === undefined ? [] : [post('pe_avance9', final)]),
  ]

  test('the three screens: company, OK_MSG, the options at S without Salir', async () => {
    const harness = await signedIn(wizard(COMPLIANCE_OK_MSG, COMPLIANCE_FORM, COMPLIANCE_DECLARED))
    const result = await declareCompliance(harness.portal)
    expect(result).toEqual({ outcome: 'declared', message: 'Su Declaración de Cumplimiento ha sido efectuada' })
    expect(harness.posted('pe_avance8')).toEqual([
      { ...COMPANY, ACEPTAR: 'Continuar' },
      { OK_MSG: '1', ...COMPANY, Aceptar: 'Continuar con la Declaración' },
    ])
    const [final] = harness.posted('pe_avance9')
    expect(final.Salir).toBeUndefined()
    expect(final).toMatchObject({ ...COMPANY, OPC1: 'S', OPC8: 'S', CONFIRMAR: 'Confirmar Declaración' })
  })

  test('without OK_MSG the form comes on the second screen', async () => {
    const harness = await signedIn(wizard(COMPLIANCE_FORM, undefined, COMPLIANCE_DECLARED))
    await expect(declareCompliance(harness.portal)).resolves.toMatchObject({ outcome: 'declared' })
    expect(harness.posted('pe_avance8')).toHaveLength(1)
  })

  test('a block on any screen is data', async () => {
    const message = 'Usted no podrá efectuar la Declaración de Cumplimiento porque no ha finalizado su certificación'
    const second = await signedIn(wizard(COMPLIANCE_BLOCKED))
    await expect(declareCompliance(second.portal)).resolves.toEqual({ outcome: 'blocked', message })
    const third = await signedIn(wizard(COMPLIANCE_OK_MSG, COMPLIANCE_BLOCKED))
    await expect(declareCompliance(third.portal)).resolves.toEqual({ outcome: 'blocked', message })
    const final = await signedIn(wizard(COMPLIANCE_FORM, undefined, COMPLIANCE_BLOCKED))
    await expect(declareCompliance(final.portal)).resolves.toEqual({ outcome: 'blocked', message })
  })

  test('no form, an unconfirmed final page, a refusal', async () => {
    const noForm = await signedIn(wizard(COMPLIANCE_OK_MSG, page('<p>sin formulario</p>')))
    expect((await failure(declareCompliance(noForm.portal))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    const unconfirmed = await signedIn(wizard(COMPLIANCE_FORM, undefined, COMPLIANCE_UNCONFIRMED))
    await expect(declareCompliance(unconfirmed.portal)).resolves.toMatchObject({ outcome: 'unconfirmed' })
    const vague = await signedIn(wizard(COMPLIANCE_FORM, undefined, page('<p>Gracias por su visita.</p>')))
    await expect(declareCompliance(vague.portal)).resolves.toEqual({
      outcome: 'unconfirmed',
      message: 'Gracias por su visita.',
    })
    const refused = await signedIn(wizard(REJECTION_PAGES.personWithPendingIssues))
    expect((await failure(declareCompliance(refused.portal))).details).toMatchObject({
      rejection: 'personWithPendingIssues',
    })
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/certification --coverage=false
```

Expected: FAIL: `downloadTestSet`, `declareProgress`, `readProgress`, `advanceStage`, `listBookHistory` and `declareCompliance` are not exported by `src/portal/certification.ts`.

- [ ] **Step 3: Write the implementation**

`src/portal/certification.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/portal/certification.ts b/src/portal/certification.ts
index 23ce658..281e170 100644
--- a/src/portal/certification.ts
+++ b/src/portal/certification.ts
@@ -1,11 +1,75 @@
+import { DEFAULT_OPTIONAL_SETS, type CertificationStage, type DeclarationKey } from '../catalogs/certification'
+import { SII_HOSTS } from '../catalogs/endpoints'
 import { cgiUrl } from '../catalogs/portal'
+import { DteError } from '../errors'
 import type { CallOverrides } from '../sii/client'
 import { resolvePortalCompany, type PortalClient } from './client'
+import { hiddenInputs } from './html'
+import { portalMessageOf } from './pages/auth'
 import { parseCertificationSets, type CertificationSet } from './pages/certification'
-import { assertNotRejected, companyFields, ensurePage, submitForm, unexpectedPage, withPortalSession } from './session'
+import { isHistoryUnauthorized, parseBookHistory, type BookHistoryEntry } from './pages/certification-books'
+import {
+  complianceBlock,
+  complianceForm,
+  complianceMessage,
+  hasOkMessage,
+  isDeclared,
+  isUnconfirmed,
+} from './pages/certification-compliance'
+import {
+  classifyAdvanceAnswer,
+  classifyDeclarationAnswer,
+  parseDeclarationForm,
+  parseProgressPage,
+  verifyDeclaration,
+  type AdvanceAnswer,
+  type DeclarationAnswer,
+  type ItemState,
+  type VerificationState,
+} from './pages/certification-progress'
+import {
+  attentionNumberOf,
+  isNotEnrolled,
+  isSessionDropped,
+  isSetRegenerated,
+  parseSetGeneration,
+  setTextOf,
+  type OptionalSetOption,
+  type SetGenerationState,
+} from './pages/certification-set'
+import {
+  assertNotRejected,
+  companyFields,
+  ensurePage,
+  forgetSession,
+  rejected,
+  submitForm,
+  unexpectedPage,
+  withPortalSession,
+  type PortalContext,
+  type PortalPage,
+} from './session'
 
 const REQUIRED_SETS = ['SET BASICO', 'SET GUIA DE DESPACHO', 'SET FACTURA EXENTA', 'SET CASO GENERAL FACTURA COMPRA']
 const REQUIRED_BOOKS = ['LIBRO DE VENTAS', 'LIBRO DE COMPRAS', 'LIBRO DE GUIAS']
+const BASIC_SET_FIELD = 'SET01'
+const COMPANY_CODE = '8'
+const DEFAULT_TOTAL_ROWS = '10'
+const DEFAULT_STEP = 'P01'
+const MIN_YEAR = 1990
+const MAX_YEAR = 2100
+const UPL_URL = `https://${SII_HOSTS.certification}/cgi_dte/UPL/`
+
+const at = (page: string): string => cgiUrl('certification', page)
+
+type Company = ReturnType<typeof companyFields>
+
+// A post that changes the application (generating a set, moving the stage, declaring compliance) is sent once: a
+// retry after a timeout could repeat it. The declaration of progress is repeated safely, so it keeps the policy.
+const once = (context: PortalContext): PortalContext => ({
+  ...context,
+  overrides: { ...context.overrides, retry: false },
+})
 
 /**
  * EN: The certification state of a company.
@@ -20,14 +84,182 @@ export type CertificationSets = {
   readonly allBooksApproved: boolean
 }
 
+/**
+ * EN: Input of `downloadTestSet`.
+ * ES: Entrada de `downloadTestSet`.
+ */
+export type DownloadTestSetInput = {
+  /** EN: Company RUT; the client's by default. ES: `RUT_EMP` + `DV_EMP` — RUT de la empresa; por defecto el del cliente. */
+  readonly companyRut?: string
+  /** EN: Optional sets to tick, `SETnn`; `DEFAULT_OPTIONAL_SETS` by default. Only those the page offers are sent. ES: `SETnn` — Sets opcionales a marcar; por defecto `DEFAULT_OPTIONAL_SETS`. Solo se envían los que la página ofrece. */
+  readonly optionalSets?: readonly string[]
+  /** EN: False to read the state table only, without generating a set. ES: False para leer solo la tabla de estados, sin generar un set. */
+  readonly download?: boolean
+  /** EN: The attention number of the set in hand, to tell a regenerated set. ES: El número de atención del set en mano, para reconocer un set regenerado. */
+  readonly previousAttentionNumber?: string
+}
+
+/**
+ * EN: What `downloadTestSet` read. Downloading generates the set: the SII assigns the cases anew, so anything sent
+ * for an earlier set is void.
+ * ES: Lo que leyó `downloadTestSet`. Descargar genera el set: el SII asigna los casos de nuevo, así que lo enviado
+ * para un set anterior queda sin efecto.
+ */
+export type DownloadedTestSet = {
+  /** EN: The set table of `pe_generar1`. ES: La tabla de sets de `pe_generar1`. */
+  readonly states: readonly SetGenerationState[]
+  /** EN: The optional sets the page offered. ES: Los sets opcionales que ofreció la página. */
+  readonly optionalSets: readonly OptionalSetOption[]
+  /** EN: The `SETnn` ticked, the basic set included. ES: Los `SETnn` marcados, incluido el set básico. */
+  readonly requested: readonly string[]
+  /** EN: The set text, for `parseTestSetText`; null without `download`. ES: El texto del set, para `parseTestSetText`; null sin `download`. */
+  readonly text: string | null
+  /** EN: Its attention number, or null. ES: Su número de atención, o null. */
+  readonly attentionNumber: string | null
+  /** EN: The page said a new set was generated, or the attention number changed. ES: La página dijo que se generó un set nuevo, o cambió el número de atención. */
+  readonly regenerated: boolean
+}
+
+/**
+ * EN: One envelope to declare: its track id and the date it was sent, `YYYY-MM-DD` in Chile.
+ * ES: Un envío por declarar: su track id y la fecha en que se envió, `AAAA-MM-DD` de Chile.
+ */
+export type DeclarationEntry = {
+  /** EN: SII track id, digits. ES: `NUM_ENV` — Track id del SII, dígitos. */
+  readonly trackId: string
+  /** EN: Date sent, `YYYY-MM-DD`. ES: `FEC_ENV` — Fecha de envío, `AAAA-MM-DD`. */
+  readonly date: string
+}
+
+/**
+ * EN: The entries of one declaration, by row key.
+ * ES: Las entradas de una declaración, por clave de fila.
+ */
+export type DeclarationEntries = Readonly<Partial<Record<DeclarationKey, DeclarationEntry>>>
+
+/**
+ * EN: Input of `declareProgress`.
+ * ES: Entrada de `declareProgress`.
+ */
+export type DeclareProgressInput = {
+  /** EN: The envelopes to declare. ES: Los envíos por declarar. */
+  readonly entries: DeclarationEntries
+  /** EN: Company RUT; the client's by default. ES: `RUT_EMP` + `DV_EMP` — RUT de la empresa; por defecto el del cliente. */
+  readonly companyRut?: string
+}
+
+/**
+ * EN: How a declaration ended. `accepted` and `inReview` are good; `notProcessed` and `notSaved` ask for another try
+ * later; `contentErrors`, `allRejected` and `inconsistent` are the SII's verdicts; `declined` and `failed` are the
+ * portal's.
+ * ES: Cómo terminó una declaración. `accepted` e `inReview` están bien; `notProcessed` y `notSaved` piden otro intento
+ * después; `contentErrors`, `allRejected` e `inconsistent` son veredictos del SII; `declined` y `failed`, del portal.
+ */
+export type DeclarationOutcome =
+  | 'accepted'
+  | 'inReview'
+  | 'notProcessed'
+  | 'contentErrors'
+  | 'allRejected'
+  | 'notSaved'
+  | 'inconsistent'
+  | 'declined'
+  | 'failed'
+
+/**
+ * EN: What `declareProgress` did and what the portal answered.
+ * ES: Lo que hizo `declareProgress` y lo que respondió el portal.
+ */
+export type DeclarationResult = {
+  /** EN: The outcome. ES: El resultado. */
+  readonly outcome: DeclarationOutcome
+  /** EN: The rows actually declared: those with an input on the form. ES: Las filas efectivamente declaradas: las que tenían campo en el formulario. */
+  readonly declared: readonly DeclarationKey[]
+  /** EN: Rows the answer named with "ENVIO CON ERRORES O REPAROS". ES: Filas que la respuesta nombró con "ENVIO CON ERRORES O REPAROS". */
+  readonly contentErrors: readonly DeclarationKey[]
+  /** EN: What the re-read form said of each declared row; empty without a re-read. ES: Lo que dijo el formulario releído de cada fila declarada; vacío sin relectura. */
+  readonly verification: Readonly<Partial<Record<DeclarationKey, VerificationState>>>
+  /** EN: Why, in a word or a sentence, or null. ES: Por qué, en una palabra o una frase, o null. */
+  readonly detail: string | null
+  /** EN: The classified answer, or null when no post was made. ES: La respuesta clasificada, o null si no se envió nada. */
+  readonly answer: DeclarationAnswer | null
+  /** EN: The answer page, for the artefacts. ES: La página de respuesta, para los artefactos. */
+  readonly answerHtml: string
+  /** EN: The form page, for the artefacts. ES: La página del formulario, para los artefactos. */
+  readonly formHtml: string
+}
+
+/**
+ * EN: The progress of the application as `pe_avance6` shows it.
+ * ES: El avance de la postulación como lo muestra `pe_avance6`.
+ */
+export type ProgressReport = {
+  /** EN: The stage wording, upper case, or null. ES: El texto de la etapa, en mayúsculas, o null. */
+  readonly stage: string | null
+  /** EN: The stage as the runner names it. ES: La etapa como la nombra el ejecutor. */
+  readonly stageKey: CertificationStage
+  /** EN: The state of each set and book named on the page. ES: El estado de cada set y libro que nombra la página. */
+  readonly states: Readonly<Partial<Record<DeclarationKey, { readonly text: string; readonly state: ItemState }>>>
+  /** EN: An approved simulation awaits its confirmation. ES: Una simulación aprobada espera su confirmación. */
+  readonly simulationAwaitsConfirmation: boolean
+  /** EN: The rows of `pe_avance2`, read on the way. ES: Las filas de `pe_avance2`, leídas de paso. */
+  readonly rows: readonly CertificationSet[]
+}
+
+/**
+ * EN: What `advanceStage` got.
+ * ES: Lo que obtuvo `advanceStage`.
+ */
+export type AdvanceResult = AdvanceAnswer
+
+/**
+ * EN: What `listBookHistory` read for one year.
+ * ES: Lo que leyó `listBookHistory` para un año.
+ */
+export type BookHistory = {
+  /** EN: The year asked. ES: El año consultado. */
+  readonly year: number
+  /** EN: Every book listed. ES: Todos los libros listados. */
+  readonly entries: readonly BookHistoryEntry[]
+  /** EN: The periods with any entry, each once: none of them takes a new total submission. ES: Los períodos con alguna entrada, cada uno una vez: ninguno acepta un nuevo envío total. */
+  readonly occupiedPeriods: readonly string[]
+}
+
+/**
+ * EN: What `declareCompliance` did.
+ * ES: Lo que hizo `declareCompliance`.
+ */
+export type ComplianceResult = {
+  /** EN: Declared, blocked by the portal, or the final page did not confirm. ES: Declarada, bloqueada por el portal, o la página final no confirmó. */
+  readonly outcome: 'declared' | 'blocked' | 'unconfirmed'
+  /** EN: The sentence the portal gave. ES: La frase que dio el portal. */
+  readonly message: string
+}
+
 const allApproved = (sets: readonly CertificationSet[], required: readonly string[]): boolean =>
   required.every((name) => sets.find((set) => set.name.includes(name))?.status.includes('REVISADO CONFORME') ?? false)
 
+// The entry sequence of every progress page: a fresh pe_avance1, then the company posted to pe_avance2. The SII
+// refreshes its state on the way; pe_avance5 answers nothing without it.
+const enter = async (context: PortalContext, company: Company): Promise<PortalPage> => {
+  const entry = await ensurePage(context, 'pe_avance1', at('pe_avance1'))
+  const page = await submitForm(
+    context,
+    'pe_avance2',
+    at('pe_avance2'),
+    entry.url,
+    { ...company, ACEPTAR: 'Continuar' },
+    entry.url,
+  )
+  assertNotRejected(context, page.html)
+  return page
+}
+
 /**
- * EN: Reads the state of each test set and book, on the certification host. It only reads: declaring progress belongs
- * to the certification runner.
- * ES: Lee el estado de cada set de pruebas y libro, en el host de certificación. Solo lee: declarar avance le corresponde
- * al ejecutor de la certificación.
+ * EN: Reads the state of each test set and book, on the certification host. It only reads: declaring progress is
+ * `declareProgress`.
+ * ES: Lee el estado de cada set de pruebas y libro, en el host de certificación. Solo lee: declarar avance es
+ * `declareProgress`.
  * @param portal EN: the client. ES: el cliente.
  * @param input EN: the company. ES: la empresa.
  * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
@@ -40,22 +272,411 @@ export const queryCertificationSets = (
   overrides?: CallOverrides,
 ): Promise<CertificationSets> =>
   withPortalSession(portal, 'queryCertificationSets', overrides, async (context) => {
+    const page = await enter(context, companyFields(resolvePortalCompany(portal, input.companyRut)))
+    const sets = parseCertificationSets(page.html)
+    if (sets.length === 0) throw unexpectedPage(context, 'pe_avance2', page.html)
+    return {
+      sets,
+      allSetsApproved: allApproved(sets, REQUIRED_SETS),
+      allBooksApproved: allApproved(sets, REQUIRED_BOOKS),
+    }
+  })
+
+const openSetPage = async (context: PortalContext): Promise<PortalPage> => {
+  const first = await ensurePage(context, 'pe_generar', at('pe_generar'))
+  if (!isNotEnrolled(first.html)) return first
+  // A cached session may carry a stale answer: once more, fresh, before believing it.
+  forgetSession(context)
+  return ensurePage(context, 'pe_generar', at('pe_generar'))
+}
+
+/**
+ * EN: Downloads the test set from `pe_generar`: confirms the company on `pe_generar1` when asked, reads the set table
+ * and the optional sets, and posts `pe_generar2` with `AUTORIZADA`, `TOTAL`, `SET01` and the optional sets ticked.
+ * A session the portal drops on the way is forgotten and the sequence repeated once. "No está inscrito" is
+ * `notEnrolled`. Generating the set assigns the cases anew: call it once per certification.
+ * ES: Descarga el set de pruebas desde `pe_generar`: confirma la empresa en `pe_generar1` cuando lo pide, lee la tabla
+ * de sets y los opcionales, y envía `pe_generar2` con `AUTORIZADA`, `TOTAL`, `SET01` y los opcionales marcados. Una
+ * sesión que el portal suelta en el camino se olvida y la secuencia se repite una vez. "No está inscrito" es
+ * `notEnrolled`. Generar el set asigna los casos de nuevo: se llama una vez por certificación.
+ * @param portal EN: the client. ES: el cliente.
+ * @param input EN: the company, the optional sets, whether to download. ES: la empresa, los sets opcionales, si descargar.
+ * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
+ * @returns EN: the table, the sets offered and ticked, the text. ES: la tabla, los sets ofrecidos y marcados, el texto.
+ * @throws {DteError} EN: `SII_PORTAL_REJECTED` (`notEnrolled` among others), `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
+ */
+export const downloadTestSet = (
+  portal: PortalClient,
+  input: DownloadTestSetInput = {},
+  overrides?: CallOverrides,
+): Promise<DownloadedTestSet> =>
+  withPortalSession(portal, 'downloadTestSet', overrides, async (context) => {
     const company = companyFields(resolvePortalCompany(portal, input.companyRut))
-    const entry = await ensurePage(context, 'pe_avance1', cgiUrl('certification', 'pe_avance1'))
+    const wanted = input.optionalSets ?? DEFAULT_OPTIONAL_SETS
+    const attempt = async (retry: boolean): Promise<DownloadedTestSet> => {
+      const landing = await openSetPage(context)
+      if (isNotEnrolled(landing.html))
+        throw rejected(context, 'notEnrolled', { portalMessage: portalMessageOf(landing.html) })
+      assertNotRejected(context, landing.html)
+      const generation = parseSetGeneration(landing.html).asksCompanyConfirmation
+        ? await submitForm(
+            context,
+            'pe_generar1',
+            at('pe_generar1'),
+            landing.url,
+            { ...company, CODIGO: COMPANY_CODE, ACEPTAR: 'Confirmar Empresa' },
+            landing.url,
+          )
+        : landing
+      assertNotRejected(context, generation.html)
+      const page = parseSetGeneration(generation.html)
+      if (page.states.length === 0 && page.optionalSets.length === 0)
+        throw unexpectedPage(context, 'pe_generar1', generation.html)
+      const base = { states: page.states, optionalSets: page.optionalSets }
+      if (input.download === false)
+        return { ...base, requested: [], text: null, attentionNumber: null, regenerated: false }
+      const ticked = page.optionalSets.map((option) => option.code).filter((code) => wanted.includes(code))
+      const requested = [BASIC_SET_FIELD, ...ticked]
+      const downloaded = await submitForm(
+        once(context),
+        'pe_generar2',
+        at('pe_generar2'),
+        generation.url,
+        {
+          AUTORIZADA: page.authorized,
+          TOTAL: page.total,
+          ...Object.fromEntries(requested.map((code) => [code, 'S'])),
+        },
+        generation.url,
+      )
+      if (isSessionDropped(downloaded.html)) {
+        if (retry)
+          throw new DteError('SII_PORTAL_SESSION_EXPIRED', { operation: context.operation, step: 'pe_generar2' })
+        forgetSession(context)
+        return attempt(true)
+      }
+      assertNotRejected(context, downloaded.html)
+      const text = setTextOf(downloaded.html)
+      const attentionNumber = attentionNumberOf(text)
+      if (attentionNumber === null && !/\bCASO\b/i.test(text))
+        throw unexpectedPage(context, 'pe_generar2', downloaded.html)
+      return {
+        ...base,
+        requested,
+        text,
+        attentionNumber,
+        regenerated: isSetRegenerated(downloaded.html, input.previousAttentionNumber ?? null),
+      }
+    }
+    return attempt(false)
+  })
+
+const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
+
+const portalDate = (date: string): string => {
+  const match = DATE.exec(date)
+  if (match === null) throw new DteError('INVALID_DATE', { field: 'date' })
+  return `${match[3]}-${match[2]}-${match[1]}`
+}
+
+const portalTrackId = (trackId: string): string => {
+  if (!/^\d+$/.test(trackId)) throw new DteError('INVALID_OPTION', { field: 'trackId' })
+  return String(Number.parseInt(trackId, 10))
+}
+
+const declined = (detail: string, formHtml: string, declared: readonly DeclarationKey[] = []): DeclarationResult => ({
+  outcome: 'declined',
+  declared,
+  contentErrors: [],
+  verification: {},
+  detail,
+  answer: null,
+  answerHtml: '',
+  formHtml,
+})
+
+// The order of the field: a reviewed answer first, then "not processed yet", then every declared row empty (the
+// wrong period: waiting does not fix it), then some rows empty (the declaration was not saved: try again).
+const outcomeOf = (
+  answer: DeclarationAnswer,
+  declared: readonly DeclarationKey[],
+  verification: Readonly<Partial<Record<DeclarationKey, VerificationState>>>,
+): DeclarationOutcome => {
+  const states = declared.map((key) => verification[key])
+  const inReview = states.includes('inReview')
+  const empties = states.filter((state) => state === 'empty').length
+  if (answer.contentErrors.length > 0) return 'contentErrors'
+  if (states.some((state) => state === 'missing' || state === 'mismatch')) return 'notSaved'
+  if ((empties === 0 || inReview) && !answer.notProcessed) return inReview ? 'inReview' : 'accepted'
+  if (answer.notProcessed) return 'notProcessed'
+  if (!inReview && empties >= declared.length) return 'allRejected'
+  return 'notSaved'
+}
+
+/**
+ * EN: Declares the track id and date of envelopes on `pe_avance2`, posted to `pe_avance3`: the row of each entry is
+ * found by its label (the indexes move as sets are approved), every `NUM_ENV`, `FEC_ENV`, `SET` and `EST` field is sent
+ * in form order with the values already on the page, the track id without leading zeros and the date as
+ * `dd-mm-yyyy`; then the form is read again to verify. A row that has no input (approved or in review) is left out;
+ * a simulation row that is missing declines, as does a status page. A session the portal says is gone throws.
+ * ES: Declara el track id y la fecha de envíos en `pe_avance2`, enviado a `pe_avance3`: la fila de cada entrada se
+ * busca por su etiqueta (los índices se mueven al aprobarse sets), se envían todos los campos `NUM_ENV`, `FEC_ENV`,
+ * `SET` y `EST` en el orden del formulario con los valores que ya trae la página, el track id sin ceros a la
+ * izquierda y la fecha como `dd-mm-aaaa`; luego se relee el formulario para verificar. Una fila sin campo (aprobada o
+ * en revisión) se omite; una fila de simulación ausente declina, igual que una página de estado. Una sesión que el
+ * portal da por perdida lanza.
+ * @param portal EN: the client. ES: el cliente.
+ * @param input EN: the entries and the company. ES: las entradas y la empresa.
+ * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
+ * @returns EN: the outcome, the rows declared, the verification and the pages. ES: el resultado, las filas declaradas, la verificación y las páginas.
+ * @throws {DteError} EN: `INVALID_OPTION { field: 'entries' | 'trackId' }`, `INVALID_DATE`, `SII_PORTAL_SESSION_EXPIRED`, `SII_PORTAL_REJECTED`, transport codes. ES: los mismos códigos.
+ */
+export const declareProgress = (
+  portal: PortalClient,
+  input: DeclareProgressInput,
+  overrides?: CallOverrides,
+): Promise<DeclarationResult> =>
+  withPortalSession(portal, 'declareProgress', overrides, async (context) => {
+    const entries = Object.entries(input.entries).filter(([, entry]) => entry !== undefined) as [
+      DeclarationKey,
+      DeclarationEntry,
+    ][]
+    if (entries.length === 0) throw new DteError('INVALID_OPTION', { field: 'entries' })
+    const values = entries.map(([key, entry]) => [key, portalTrackId(entry.trackId), portalDate(entry.date)] as const)
+    const company = companyFields(resolvePortalCompany(portal, input.companyRut))
+    const formPage = await enter(context, company)
+    const form = parseDeclarationForm(formPage.html)
+    if (form.isStatusPage) return declined(form.hasErrorStates ? 'errorStates' : 'noForm', formPage.html)
+    const mapped = values.flatMap(([key, trackId, date]) => {
+      const row = form.rows.find((candidate) => candidate.key === key && candidate.index !== null)
+      return row === undefined ? [] : [{ key, index: row.index as number, trackId, date }]
+    })
+    if (values.some(([key]) => key === 'simulation') && !mapped.some((row) => row.key === 'simulation'))
+      return declined('simulationUnavailable', formPage.html)
+    if (mapped.length === 0) return declined('noRows', formPage.html)
+    const declared = mapped.map((row) => row.key)
+    const fields: Record<string, string> = {}
+    for (let index = 1; index <= form.totalRows; index += 1) {
+      const row = mapped.find((candidate) => candidate.index === index)
+      fields[`NUM_ENV${index}`] = row?.trackId ?? form.currentValues[`NUM_ENV${index}`] ?? ''
+      fields[`FEC_ENV${index}`] = row?.date ?? form.currentValues[`FEC_ENV${index}`] ?? ''
+      fields[`SET${index}`] = form.hiddenFields[`SET${index}`] ?? ''
+      fields[`EST${index}`] = form.hiddenFields[`EST${index}`] ?? ''
+    }
+    const answerPage = await submitForm(
+      context,
+      'pe_avance3',
+      at('pe_avance3'),
+      formPage.url,
+      {
+        ...fields,
+        ...company,
+        TOTREG: form.hiddenFields.TOTREG ?? DEFAULT_TOTAL_ROWS,
+        ACEPTAR: 'Confirmar Revisión',
+      },
+      formPage.url,
+    )
+    const answer = classifyDeclarationAnswer(answerPage.html)
+    const result = { declared, answer, answerHtml: answerPage.html, formHtml: formPage.html }
+    if (answer.sessionExpired) {
+      forgetSession(context)
+      throw new DteError('SII_PORTAL_SESSION_EXPIRED', { operation: context.operation, step: 'pe_avance3' })
+    }
+    if (answer.inconsistentData !== null)
+      return {
+        ...result,
+        outcome: 'inconsistent',
+        contentErrors: [],
+        verification: {},
+        detail: answer.inconsistentData,
+      }
+    if (!answer.accepted)
+      return {
+        ...result,
+        outcome: 'failed',
+        contentErrors: [],
+        verification: {},
+        detail: answer.contentMismatch ? 'contentMismatch' : portalMessageOf(answerPage.html),
+      }
+    const reread = await enter(context, company)
+    if (parseDeclarationForm(reread.html).isStatusPage) throw unexpectedPage(context, 'pe_avance2.verify', reread.html)
+    const verification = verifyDeclaration(reread.html, Object.fromEntries(mapped.map((row) => [row.key, row.trackId])))
+    return {
+      ...result,
+      outcome: outcomeOf(answer, declared, verification),
+      contentErrors: answer.contentErrors,
+      verification,
+      detail: null,
+    }
+  })
+
+/**
+ * EN: Reads the progress page: the entry sequence, `pe_avance5`, then `pe_avance6` with the company. In the
+ * simulation stage the confirmation offer is looked for on `pe_avance2` as well.
+ * ES: Lee la página de avance: la secuencia de entrada, `pe_avance5` y luego `pe_avance6` con la empresa. En la etapa
+ * de simulación la oferta de confirmación se busca también en `pe_avance2`.
+ * @param portal EN: the client. ES: el cliente.
+ * @param input EN: the company. ES: la empresa.
+ * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
+ * @returns EN: the stage, the states and the rows. ES: la etapa, los estados y las filas.
+ * @throws {DteError} EN: `SII_PORTAL_REJECTED`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
+ */
+export const readProgress = (
+  portal: PortalClient,
+  input: { readonly companyRut?: string } = {},
+  overrides?: CallOverrides,
+): Promise<ProgressReport> =>
+  withPortalSession(portal, 'readProgress', overrides, async (context) => {
+    const company = companyFields(resolvePortalCompany(portal, input.companyRut))
+    const formPage = await enter(context, company)
+    const entry = await ensurePage(context, 'pe_avance5', at('pe_avance5'))
     const page = await submitForm(
       context,
-      'pe_avance2',
-      cgiUrl('certification', 'pe_avance2'),
+      'pe_avance6',
+      at('pe_avance6'),
       entry.url,
       { ...company, ACEPTAR: 'Continuar' },
       entry.url,
     )
     assertNotRejected(context, page.html)
-    const sets = parseCertificationSets(page.html)
-    if (sets.length === 0) throw unexpectedPage(context, 'pe_avance2', page.html)
+    const progress = parseProgressPage(page.html)
+    if (progress.stage === null && Object.keys(progress.states).length === 0)
+      throw unexpectedPage(context, 'pe_avance6', page.html)
+    const onForm = progress.stageKey === 'simulation' && parseProgressPage(formPage.html).simulationAwaitsConfirmation
     return {
-      sets,
-      allSetsApproved: allApproved(sets, REQUIRED_SETS),
-      allBooksApproved: allApproved(sets, REQUIRED_BOOKS),
+      stage: progress.stage,
+      stageKey: progress.stageKey,
+      states: progress.states,
+      simulationAwaitsConfirmation: progress.simulationAwaitsConfirmation || onForm,
+      rows: parseCertificationSets(formPage.html),
+    }
+  })
+
+/**
+ * EN: Asks the portal to move the application to its next stage: `pe_avance4` with `TOTREG` and `PASO` as `pe_avance2`
+ * holds them (`PASO` changes with the stage; a fixed value makes the SII answer "ya se encuentra en el paso"). An
+ * answer saying the stage was already there is `unchanged`, not a failure.
+ * ES: Pide al portal pasar la postulación a su siguiente etapa: `pe_avance4` con `TOTREG` y `PASO` tal como los trae
+ * `pe_avance2` (`PASO` cambia con la etapa; un valor fijo hace que el SII responda "ya se encuentra en el paso"). Una
+ * respuesta que diga que ya estaba en la etapa es `unchanged`, no una falla.
+ * @param portal EN: the client. ES: el cliente.
+ * @param input EN: the company. ES: la empresa.
+ * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
+ * @returns EN: advanced, unchanged or failed, with the sentence. ES: avanzó, sin cambio o falló, con la frase.
+ * @throws {DteError} EN: `SII_PORTAL_REJECTED`, session and transport codes. ES: los mismos códigos.
+ */
+export const advanceStage = (
+  portal: PortalClient,
+  input: { readonly companyRut?: string } = {},
+  overrides?: CallOverrides,
+): Promise<AdvanceResult> =>
+  withPortalSession(portal, 'advanceStage', overrides, async (context) => {
+    const company = companyFields(resolvePortalCompany(portal, input.companyRut))
+    const formPage = await enter(context, company)
+    const hidden = hiddenInputs(formPage.html)
+    const page = await submitForm(
+      once(context),
+      'pe_avance4',
+      at('pe_avance4'),
+      formPage.url,
+      {
+        ...company,
+        TOTREG: hidden.TOTREG ?? '0',
+        PASO: hidden.PASO ?? DEFAULT_STEP,
+        ACEPTAR: 'Avanzar Siguiente Paso',
+      },
+      formPage.url,
+    )
+    assertNotRejected(context, page.html)
+    return classifyAdvanceAnswer(page.html)
+  })
+
+/**
+ * EN: Lists the books the SII holds for a year (`QEstLibro`, after `DTEauth?7` binds the session to that CGI).
+ * Every period listed is occupied for a new total submission.
+ * ES: Lista los libros que el SII tiene para un año (`QEstLibro`, después de que `DTEauth?7` liga la sesión a ese
+ * CGI). Todo período listado está ocupado para un nuevo envío total.
+ * @param portal EN: the client. ES: el cliente.
+ * @param input EN: the year and the company. ES: el año y la empresa.
+ * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
+ * @returns EN: the entries and the occupied periods. ES: las entradas y los períodos ocupados.
+ * @throws {DteError} EN: `INVALID_OPTION { field: 'year' }`, `SII_PORTAL_SESSION_EXPIRED`, session and transport codes. ES: los mismos códigos.
+ */
+export const listBookHistory = (
+  portal: PortalClient,
+  input: { readonly year: number; readonly companyRut?: string },
+  overrides?: CallOverrides,
+): Promise<BookHistory> =>
+  withPortalSession(portal, 'listBookHistory', overrides, async (context) => {
+    if (!Number.isInteger(input.year) || input.year < MIN_YEAR || input.year > MAX_YEAR)
+      throw new DteError('INVALID_OPTION', { field: 'year' })
+    const company = companyFields(resolvePortalCompany(portal, input.companyRut))
+    await ensurePage(context, 'DTEauth', `${UPL_URL}DTEauth?7`)
+    const query = `${UPL_URL}QEstLibro?rutCompany=${company.RUT_EMP}&dvCompany=${company.DV_EMP}&TrackId=&year=${input.year}&month=00&tipo=TODOS`
+    const page = await ensurePage(context, 'QEstLibro', query)
+    if (isHistoryUnauthorized(page.html)) {
+      forgetSession(context)
+      throw new DteError('SII_PORTAL_SESSION_EXPIRED', { operation: context.operation, step: 'QEstLibro' })
+    }
+    const entries = parseBookHistory(page.html)
+    return { year: input.year, entries, occupiedPeriods: [...new Set(entries.map((entry) => entry.period))] }
+  })
+
+/**
+ * EN: The declaration of compliance: `pe_avance7`, `pe_avance8` with the company, once more with `OK_MSG` when the
+ * portal asks to continue, then the `pe_avance9` form with every option at `S` and `CONFIRMAR`, never `Salir`. A
+ * block ("no ha finalizado su certificación") at any screen is data. This is the sworn statement of the legal
+ * representative and cannot be undone: call it when the samples are approved.
+ * ES: La declaración de cumplimiento: `pe_avance7`, `pe_avance8` con la empresa, una vez más con `OK_MSG` cuando el
+ * portal pide continuar, y luego el formulario de `pe_avance9` con cada opción en `S` y `CONFIRMAR`, nunca `Salir`.
+ * Un bloqueo ("no ha finalizado su certificación") en cualquier pantalla es un dato. Es la declaración jurada del
+ * representante legal y no se puede deshacer: se llama cuando las muestras están aprobadas.
+ * @param portal EN: the client. ES: el cliente.
+ * @param input EN: the company. ES: la empresa.
+ * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
+ * @returns EN: declared, blocked or unconfirmed, with the sentence. ES: declarada, bloqueada o sin confirmar, con la frase.
+ * @throws {DteError} EN: `SII_PORTAL_REJECTED`, `SII_PORTAL_UNEXPECTED_PAGE` without the `pe_avance9` form, session and transport codes. ES: los mismos códigos.
+ */
+export const declareCompliance = (
+  portal: PortalClient,
+  input: { readonly companyRut?: string } = {},
+  overrides?: CallOverrides,
+): Promise<ComplianceResult> =>
+  withPortalSession(portal, 'declareCompliance', overrides, async (context) => {
+    const company = companyFields(resolvePortalCompany(portal, input.companyRut))
+    const blockedOn = (page: PortalPage): ComplianceResult | null => {
+      assertNotRejected(context, page.html)
+      const block = complianceBlock(page.html)
+      return block === null ? null : { outcome: 'blocked', message: block }
     }
+    const entry = await ensurePage(context, 'pe_avance7', at('pe_avance7'))
+    const second = await submitForm(
+      context,
+      'pe_avance8',
+      at('pe_avance8'),
+      entry.url,
+      { ...company, ACEPTAR: 'Continuar' },
+      entry.url,
+    )
+    const blockedAtSecond = blockedOn(second)
+    if (blockedAtSecond !== null) return blockedAtSecond
+    const third = hasOkMessage(second.html)
+      ? await submitForm(
+          once(context),
+          'pe_avance8.continue',
+          at('pe_avance8'),
+          second.url,
+          { ...hiddenInputs(second.html), Aceptar: 'Continuar con la Declaración' },
+          second.url,
+        )
+      : second
+    const blockedAtThird = blockedOn(third)
+    if (blockedAtThird !== null) return blockedAtThird
+    const form = complianceForm(third.html)
+    if (form === null) throw unexpectedPage(context, 'pe_avance9', third.html)
+    const final = await submitForm(once(context), 'pe_avance9', form.action, third.url, form.fields, third.url)
+    const blockedAtFinal = blockedOn(final)
+    if (blockedAtFinal !== null) return blockedAtFinal
+    const message = complianceMessage(final.html)
+    return { outcome: isUnconfirmed(final.html) || !isDeclared(final.html) ? 'unconfirmed' : 'declared', message }
   })
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/certification --coverage=false
```

Expected: PASS, 41 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/portal/certification.ts tests/portal/certification-operations.test.ts
```

```bash
git commit -F - <<'MSG'
feat: the certification portal operations (download the set, declare progress, read progress, advance, book history, compliance)

Six operations on the phase 4 session, each against the fake portal: the entry sequence, the set download with the company confirmation and the optional sets, the declaration with every field in form order and the verification re-read, the progress page, the stage advance, the book history and the compliance wizard without the Salir button. The posts that change the application (generating a set, advancing, the compliance screens) are sent once, never retried: a retry after a timeout could repeat them.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 3: The certification state and its store

`CertificationState`, the `CertificationStore` port with safe artefact names, the memory adapter and the directory adapter (spec 3.4): `state.json` written atomically, the artefacts as files under sub-directories, directories private to the user and files unreadable by others because the state holds CAF private keys, `TRANSPORT_UNAVAILABLE` without `node:fs`.

**Files:**

- Create: `src/certification/state.ts`
- Create: `src/certification/node-store.ts`
- Test (create): `tests/certification/state.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/certification/state.test.ts` (new file, whole):

```ts
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createDirectoryCertificationStore } from '../../src/certification/node-store'
import {
  assertArtefactName,
  createCertificationState,
  createMemoryCertificationStore,
  type CertificationStore,
} from '../../src/certification/state'
import { FIXED_NOW, ISSUER_RUT } from '../support/fixtures'
import { failure } from '../support/portal'
import { createTempDirs } from '../support/temp-dir'

const temp = createTempDirs()
afterAll(temp.cleanup)

test('a fresh state', () => {
  expect(createCertificationState(ISSUER_RUT, FIXED_NOW)).toEqual({
    version: 1,
    companyRut: ISSUER_RUT,
    cafs: [],
    usedFolios: [],
    sets: {},
    setsApproved: false,
    books: { occupiedPeriods: [], adjustmentTried: [], accumulated: {}, results: {} },
    stage: 'testSets',
    updatedAt: '2026-11-15T18:30:00.000Z',
  })
  expect(createCertificationState(ISSUER_RUT).version).toBe(1)
})

test.each(['../x', 'a/../b', '/abs', 'a//b', '.', 'a/./b', 'con espacio', ''])('unsafe artefact name %j', (name) => {
  expect(() => assertArtefactName(name)).toThrow(
    expect.objectContaining({ code: 'INVALID_OPTION', details: { field: 'name', name } }),
  )
})

const roundTrip = async (store: CertificationStore): Promise<void> => {
  expect(await store.load()).toBeNull()
  expect(await store.listArtefacts()).toEqual([])
  expect(await store.readArtefact('missing.txt')).toBeNull()
  const state = createCertificationState(ISSUER_RUT, FIXED_NOW)
  await store.save(state)
  await store.save({ ...state, stage: 'books' })
  expect(await store.load()).toEqual({ ...state, stage: 'books' })
  await store.writeArtefact('set-texto.txt', 'SET BASICO')
  await store.writeArtefact('sets-prueba/dtes/dte-33-000001.xml', '<DTE/>')
  await store.writeArtefact('set-texto.txt', 'SET BASICO v2')
  expect(await store.readArtefact('set-texto.txt')).toBe('SET BASICO v2')
  expect(await store.readArtefact('sets-prueba/dtes/dte-33-000001.xml')).toBe('<DTE/>')
  expect(await store.listArtefacts()).toEqual(['set-texto.txt', 'sets-prueba/dtes/dte-33-000001.xml'])
  expect((await failure(store.writeArtefact('../x', ''))).details).toMatchObject({ field: 'name' })
  expect((await failure(store.readArtefact('../x'))).details).toMatchObject({ field: 'name' })
}

test('the memory store', () => roundTrip(createMemoryCertificationStore()))

test('the directory store: state.json atomic, artefacts as files under sub-directories', async () => {
  const dir = await temp.make('dte-sdk-cert-')
  const store = createDirectoryCertificationStore({ dir })
  await roundTrip(store)
  expect(JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'))).toMatchObject({ stage: 'books' })
  expect(await readFile(join(dir, 'sets-prueba', 'dtes', 'dte-33-000001.xml'), 'utf8')).toBe('<DTE/>')
  if (process.platform !== 'win32') {
    expect((await stat(join(dir, 'sets-prueba', 'dtes'))).mode & 0o777).toBe(0o700)
    expect((await stat(join(dir, 'state.json'))).mode & 0o777).toBe(0o600)
    expect((await stat(join(dir, 'sets-prueba', 'dtes', 'dte-33-000001.xml'))).mode & 0o777).toBe(0o600)
  }
  expect(await createDirectoryCertificationStore({ dir: join(dir, 'nope') }).listArtefacts()).toEqual([])
  const again = createDirectoryCertificationStore({ dir })
  expect(await again.load()).toMatchObject({ companyRut: ISSUER_RUT })
  expect(await again.listArtefacts()).toEqual(['set-texto.txt', 'sets-prueba/dtes/dte-33-000001.xml'])
})

test('the directory store: a read failure that is not a missing file propagates', async () => {
  const dir = await temp.make('dte-sdk-cert-')
  const store = createDirectoryCertificationStore({ dir })
  await store.writeArtefact('dir-like/inner.txt', 'x')
  const error = await failure(store.readArtefact('dir-like'))
  expect((error as unknown as { code: string }).code).toBe('EISDIR')
  const listing = createDirectoryCertificationStore({ dir: join(dir, 'dir-like', 'inner.txt') })
  await expect(listing.listArtefacts()).rejects.toMatchObject({ code: 'ENOTDIR' })
})

test('the directory store without node:fs', async () => {
  const store = createDirectoryCertificationStore({ dir: 'x' }, () => Promise.reject(new Error('no fs')))
  const error = await failure(store.load())
  expect(error.code).toBe('TRANSPORT_UNAVAILABLE')
  expect(error.details).toEqual({ reason: 'no fs' })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/certification/state --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/certification/state'`.

- [ ] **Step 3: Write the implementation**

`src/certification/state.ts` (new file, whole):

```ts
import type { BookKey, CertificationStage, SetKey } from '../catalogs/certification'
import { DteError } from '../errors'
import type { BookTotals } from '../model/book'
import type { DeclarationOutcome } from '../portal/certification'
import type { CertificationPlan } from './set-plan'

/**
 * EN: An envelope sent to the SII: its track id, the Chile date it was sent (what the declaration takes), the instant.
 * ES: Un envío hecho al SII: su track id, la fecha de Chile en que se envió (lo que toma la declaración), el instante.
 */
export type SentEnvelope = {
  /** EN: SII track id. ES: `TRACKID` — Track id del SII. */
  readonly trackId: string
  /** EN: Date sent, `YYYY-MM-DD` in Chile. ES: Fecha de envío, `AAAA-MM-DD` de Chile. */
  readonly date: string
  /** EN: Instant sent, ISO. ES: Instante del envío, ISO. */
  readonly sentAt: string
}

/**
 * EN: One case of a sent set.
 * ES: Un caso de un set enviado.
 */
export type SentCase = {
  readonly caseId: string
  readonly type: number
  readonly folio: number
  /** EN: Issue date, `YYYY-MM-DD`. ES: `FchEmis` — Fecha de emisión. */
  readonly issueDate: string
  /** EN: Transfer type of a guide. ES: `IndTraslado` — Tipo de traslado de una guía. */
  readonly transferType?: number
  /** EN: The totals the books need. ES: Los totales que necesitan los libros. */
  readonly totals: {
    readonly netAmount?: number
    readonly exemptAmount?: number
    readonly vatAmount?: number
    readonly totalAmount: number
  }
}

/**
 * EN: A set sent, with its cases.
 * ES: Un set enviado, con sus casos.
 */
export type SentSet = SentEnvelope & {
  readonly cases: readonly SentCase[]
}

/**
 * EN: A book sent: its period, its submission kind, and whether the portal approved it.
 * ES: Un libro enviado: su período, su tipo de envío, y si el portal lo aprobó.
 */
export type SentBook = {
  /** EN: Track id, or null for a book the portal already had approved. ES: Track id, o null para un libro que el portal ya tenía aprobado. */
  readonly trackId: string | null
  readonly date: string | null
  readonly sentAt: string | null
  readonly period: string
  readonly submission: 'total' | 'adjustment'
  readonly approved?: boolean
}

/**
 * EN: The period totals accumulated per period and operation, for adjustment submissions.
 * ES: Los totales de período acumulados por período y operación, para los envíos de ajuste.
 */
export type AccumulatedTotals = Readonly<
  Record<string, { readonly purchase?: readonly BookTotals[]; readonly sale?: readonly BookTotals[] }>
>

/**
 * EN: What the books phase keeps.
 * ES: Lo que guarda la fase de libros.
 */
export type BooksState = {
  /** EN: The period in use, or undefined before the search. ES: El período en uso, o undefined antes de la búsqueda. */
  readonly period?: string
  /** EN: Periods the SII already holds or refused. ES: Períodos que el SII ya tiene o rechazó. */
  readonly occupiedPeriods: readonly string[]
  /** EN: Periods where an adjustment was already tried. ES: Períodos donde ya se intentó un ajuste. */
  readonly adjustmentTried: readonly string[]
  /** EN: Totals of the sent sales and purchase books, by period. ES: Totales de los libros de ventas y compras enviados, por período. */
  readonly accumulated: AccumulatedTotals
  /** EN: Each book sent, by key. ES: Cada libro enviado, por clave. */
  readonly results: Readonly<Partial<Record<BookKey, SentBook>>>
}

/**
 * EN: What the SOAP status of an envelope said, kept for diagnosis.
 * ES: Lo que dijo el estado SOAP de un envío, guardado para diagnóstico.
 */
export type EnvelopeDiagnosis = {
  /** EN: SII status code. ES: `ESTADO` — Código de estado. */
  readonly code: string
  /** EN: Its class. ES: Su clase. */
  readonly status: string
  /** EN: The SII gloss. ES: `GLOSA` — La glosa del SII. */
  readonly message: string
}

/**
 * EN: The whole state of a certification run: what was downloaded, obtained, sent, declared and approved. A plain
 * JSON value the store keeps between runs; the runner resumes from it.
 * ES: Todo el estado de una corrida de certificación: lo descargado, obtenido, enviado, declarado y aprobado. Un valor
 * JSON simple que el almacén guarda entre corridas; el ejecutor retoma desde él.
 */
export type CertificationState = {
  /** EN: Format version. ES: Versión del formato. */
  readonly version: 1
  /** EN: Company RUT. ES: RUT de la empresa. */
  readonly companyRut: string
  /** EN: The set text downloaded, also kept as `set-texto.txt`. ES: El texto del set descargado, también guardado como `set-texto.txt`. */
  readonly setText?: string
  /** EN: The attention number of the set. ES: El número de atención del set. */
  readonly attentionNumber?: string
  /** EN: The plan of `planCertificationSets`. ES: El plan de `planCertificationSets`. */
  readonly plan?: CertificationPlan
  /** EN: The CAF files the run holds; each holds a private key, so the store is a secret. ES: Los CAF que tiene la corrida; cada uno trae una llave privada, así que el almacén es un secreto. */
  readonly cafs: readonly string[]
  /** EN: Every folio used by this run. ES: Cada folio usado por esta corrida. */
  readonly usedFolios: readonly { readonly type: number; readonly folio: number }[]
  /** EN: The sets sent. ES: Los sets enviados. */
  readonly sets: Readonly<Partial<Record<SetKey, SentSet>>>
  /** EN: The four sets are approved. ES: Los cuatro sets están aprobados. */
  readonly setsApproved: boolean
  /** EN: The books phase. ES: La fase de libros. */
  readonly books: BooksState
  /** EN: The simulation sent, and whether it was confirmed. ES: La simulación enviada, y si se confirmó. */
  readonly simulation?: SentEnvelope & { readonly confirmed?: boolean }
  /** EN: The last declaration made and how it ended. ES: La última declaración hecha y cómo terminó. */
  readonly lastDeclaration?: {
    readonly scope: 'sets' | 'books' | 'simulation'
    readonly outcome: DeclarationOutcome
    readonly detail: string | null
    readonly at: string
  }
  /** EN: SOAP diagnoses by track id. ES: Diagnósticos SOAP por track id. */
  readonly diagnosis?: Readonly<Record<string, EnvelopeDiagnosis>>
  /** EN: The sentence that blocked the compliance declaration. ES: La frase que bloqueó la declaración de cumplimiento. */
  readonly blocked?: string
  /** EN: Where the run stands. ES: Dónde está la corrida. */
  readonly stage: CertificationStage
  /** EN: Last change, ISO. ES: Último cambio, ISO. */
  readonly updatedAt: string
}

/**
 * EN: Where the state and the artefacts of a run live. The names are relative paths with `/` as separator; a service
 * may back this with its own storage.
 * ES: Dónde viven el estado y los artefactos de una corrida. Los nombres son rutas relativas con `/` de separador; un
 * servicio puede respaldarlo con su propio almacenamiento.
 */
export type CertificationStore = {
  /** EN: The stored state, or null. ES: El estado guardado, o null. */
  readonly load: () => Promise<CertificationState | null>
  /** EN: Replaces the stored state. ES: Reemplaza el estado guardado. */
  readonly save: (state: CertificationState) => Promise<void>
  /** EN: Writes an artefact, replacing it. ES: Escribe un artefacto, reemplazándolo. */
  readonly writeArtefact: (name: string, content: string) => Promise<void>
  /** EN: Reads an artefact, or null. ES: Lee un artefacto, o null. */
  readonly readArtefact: (name: string) => Promise<string | null>
  /** EN: Every artefact name, sorted. ES: Todos los nombres de artefacto, ordenados. */
  readonly listArtefacts: () => Promise<readonly string[]>
}

const SEGMENT = /^[A-Za-z0-9._-]+$/

/**
 * EN: Throws unless the name is a relative path of safe segments: no empty segment, no `.`, no `..`, no absolute
 * path, nothing outside `[A-Za-z0-9._-]`.
 * ES: Lanza salvo que el nombre sea una ruta relativa de segmentos seguros: sin segmento vacío, sin `.`, sin `..`,
 * sin ruta absoluta, nada fuera de `[A-Za-z0-9._-]`.
 */
export const assertArtefactName = (name: string): void => {
  const segments = name.split('/')
  if (segments.some((segment) => !SEGMENT.test(segment) || segment === '.' || segment === '..'))
    throw new DteError('INVALID_OPTION', { field: 'name', name })
}

/**
 * EN: A fresh state for a company.
 * ES: Un estado nuevo para una empresa.
 */
export const createCertificationState = (companyRut: string, now: Date = new Date()): CertificationState => ({
  version: 1,
  companyRut,
  cafs: [],
  usedFolios: [],
  sets: {},
  setsApproved: false,
  books: { occupiedPeriods: [], adjustmentTried: [], accumulated: {}, results: {} },
  stage: 'testSets',
  updatedAt: now.toISOString(),
})

/**
 * EN: A store in memory: for tests and short runs.
 * ES: Un almacén en memoria: para tests y corridas cortas.
 */
export const createMemoryCertificationStore = (): CertificationStore => {
  const box: { state: CertificationState | null } = { state: null }
  const artefacts = new Map<string, string>()
  return {
    load: async () => box.state,
    save: async (state) => {
      box.state = state
    },
    writeArtefact: async (name, content) => {
      assertArtefactName(name)
      artefacts.set(name, content)
    },
    readArtefact: async (name) => {
      assertArtefactName(name)
      return artefacts.get(name) ?? null
    },
    listArtefacts: async () => [...artefacts.keys()].sort(),
  }
}
```

`src/certification/node-store.ts` (new file, whole):

```ts
import { DteError, errorMessage } from '../errors'
import { memoize } from '../sii/lazy'
import { loadNodeFs, type NodeFsModules } from '../sii/node-fs'
import { assertArtefactName, type CertificationState, type CertificationStore } from './state'

/**
 * EN: Options of `createDirectoryCertificationStore`.
 * ES: Opciones de `createDirectoryCertificationStore`.
 */
export type DirectoryCertificationStoreOptions = {
  /** EN: The directory of `state.json` and the artefacts; created on first use. It holds CAF private keys: keep it out of version control. ES: El directorio de `state.json` y los artefactos; se crea en el primer uso. Contiene llaves privadas de CAF: fuera del control de versiones. */
  readonly dir: string
}

const STATE_FILE = 'state.json'
// The directory holds CAF private keys: directories are created private to the user and files unreadable by others.
// An existing directory keeps its mode.
const DIRECTORY_MODE = 0o700
const FILE_MODE = 0o600
const isMissingFile = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === 'ENOENT'

/**
 * EN: A store in a directory: `state.json` written atomically (temp file and rename), the artefacts as files, a `/`
 * in a name as a sub-directory. Directories it creates are private to the user (0700) and files unreadable by others
 * (0600), because the state holds CAF private keys; a directory that already exists keeps its mode. For a single
 * process.
 * ES: Un almacén en un directorio: `state.json` escrito de forma atómica (archivo temporal y renombre), los artefactos
 * como archivos, una `/` en un nombre como subdirectorio. Los directorios que crea son privados del usuario (0700) y
 * los archivos ilegibles para otros (0600), porque el estado contiene llaves privadas de CAF; un directorio que ya
 * existe conserva su modo. Para un solo proceso.
 * @param options EN: the directory. ES: el directorio.
 * @throws {DteError} EN: `TRANSPORT_UNAVAILABLE` when `node:fs` cannot be loaded, `INVALID_OPTION { field: 'name' }` for an unsafe artefact name. ES: `TRANSPORT_UNAVAILABLE` si `node:fs` no se puede cargar, `INVALID_OPTION { field: 'name' }` por un nombre de artefacto inseguro.
 */
export const createDirectoryCertificationStore = (
  options: DirectoryCertificationStoreOptions,
  load: () => Promise<NodeFsModules> = loadNodeFs,
): CertificationStore => {
  const modules = memoize(async () =>
    load().catch((error: unknown) => {
      throw new DteError('TRANSPORT_UNAVAILABLE', { reason: errorMessage(error) })
    }),
  )
  const fileOf = async (name: string): Promise<NodeFsModules & { readonly file: string }> => {
    const loaded = await modules()
    return { ...loaded, file: loaded.path.join(options.dir, ...name.split('/')) }
  }
  const write = async (name: string, content: string): Promise<void> => {
    const { fs, path, file } = await fileOf(name)
    await fs.mkdir(path.dirname(file), { recursive: true, mode: DIRECTORY_MODE })
    await fs.writeFile(`${file}.tmp`, content, { encoding: 'utf8', mode: FILE_MODE })
    await fs.rename(`${file}.tmp`, file)
  }
  const read = async (name: string): Promise<string | null> => {
    const { fs, file } = await fileOf(name)
    try {
      return await fs.readFile(file, 'utf8')
    } catch (error) {
      if (isMissingFile(error)) return null
      throw error
    }
  }
  const walk = async (dir: string, prefix: string): Promise<readonly string[]> => {
    const { fs, path } = await modules()
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch((error: unknown) => {
      if (isMissingFile(error)) return []
      throw error
    })
    const names: string[] = []
    for (const entry of entries) {
      const name = `${prefix}${entry.name}`
      if (entry.isDirectory()) names.push(...(await walk(path.join(dir, entry.name), `${name}/`)))
      else if (name !== STATE_FILE && !name.endsWith('.tmp')) names.push(name)
    }
    return names
  }
  return {
    load: async () => {
      const text = await read(STATE_FILE)
      return text === null ? null : (JSON.parse(text) as CertificationState)
    },
    save: (state) => write(STATE_FILE, JSON.stringify(state, null, 2)),
    writeArtefact: async (name, content) => {
      assertArtefactName(name)
      await write(name, content)
    },
    readArtefact: async (name) => {
      assertArtefactName(name)
      return read(name)
    },
    listArtefacts: async () => [...(await walk(options.dir, ''))].sort(),
  }
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/certification/state --coverage=false
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/certification/state.ts src/certification/node-store.ts tests/certification/state.test.ts
```

```bash
git commit -F - <<'MSG'
feat: the certification state and its store (memory and directory)

The resumable state of a run, the store port with safe artefact names, a memory adapter and a directory adapter that writes state.json atomically and keeps artefacts as files, private to the user because the state holds CAF private keys.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 4: The steps of the test sets

The dependency object, the typed progress events and the shared runtime (spec 3.5); the steps of the test sets (spec 3.6, 1 to 5 and 7): `obtainTestSet`, `prepareFolios` as the field does it (the CAFs in hand, unreceived folios given back, the quota, re-obtaining, exact or batches, annulling as a last resort within 180 days and never the CAFs in hand), `sendTestSet` through the registry with its artefacts, the declaration loop with its retries and SOAP diagnosis, `declareTestSets`, `waitForTestSetsApproval` and `advanceToNextStage`. The 5b-1 books accept the cases a run keeps (`SalesBookSource`, `GuideBookSource`) and an adjustment submission with `previousTotals`. The harness wires one fake transport behind the portal and SII clients, a memory store and registry, a fixed clock and recorded sleeps and events.

**Files:**

- Create: `src/certification/runtime.ts`
- Create: `src/certification/folios-step.ts`
- Create: `src/certification/steps.ts`
- Modify: `src/certification/books.ts`
- Test (create): `tests/support/certification-harness.ts`
- Test (create): `tests/certification/steps-sets.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/support/certification-harness.ts` (new file, whole):

```ts
// A harness for the certification steps: one fake transport behind the portal client and the SII client, a memory
// store, a memory registry, a fixed clock, a recorded sleep and recorded progress events.
import {
  createCertificationState,
  createMemoryCertificationStore,
  type CertificationState,
  type CertificationStore,
} from '../../src/certification/state'
import type { CertificationDependencies, CertificationProgressEvent } from '../../src/certification/steps'
import { createMemoryFolioRegistry, type FolioRegistry } from '../../src/folios/registry'
import { createPortalClient } from '../../src/portal/client'
import { createSiiClient } from '../../src/sii/client'
import { certificate, issuer, receiver, resolution } from './certification-fixtures'
import { createFakeSii, type FakeReply, type FakeRoute, type FakeSii, type RecordedRequest } from './fake-sii'
import { FIXED_NOW, fixtureText, ISSUER_RUT } from './fixtures'
import { seedSession } from './portal'
import { quotaForm, STAMP_ENTRY } from './portal-pages'
import { seededTokenCache, siiFixture } from './sii-client'

export const MAULLIN = 'https://maullin.sii.cl/cvc_cgi/dte'
export const UPL = 'https://maullin.sii.cl/cgi_dte/UPL'
export const UPLOAD = `${UPL}/DTEUpload`
export const EST_UP = 'https://maullin.sii.cl/DTEWS/QueryEstUp.jws'
export const EST_DTE = 'https://maullin.sii.cl/DTEWS/QueryEstDte.jws'
export const TRACK_ID = '9876543210'
/** The Chile date of FIXED_NOW. */
export const TODAY = '2026-11-15'

export const cafXml = (
  type = 33,
  range: { readonly from: number; readonly to: number } = { from: 1, to: 100 },
): string =>
  fixtureText('caf-33.xml')
    .replace(/<TD>33<\/TD>/, `<TD>${type}</TD>`)
    .replace('<D>1</D><H>100</H>', `<D>${range.from}</D><H>${range.to}</H>`)

/** One CAF per type the sets and the simulation use. */
export const certificationCafXmls = (): readonly string[] => [33, 61, 56, 34, 52, 46].map((type) => cafXml(type))

export const get = (name: string, ...bodies: readonly string[]): FakeRoute => ({
  url: `${MAULLIN}/${name}`,
  method: 'GET',
  reply: bodies.map((body) => ({ body })),
})
export const post = (name: string, ...replies: readonly (string | FakeReply)[]): FakeRoute => ({
  url: `${MAULLIN}/${name}`,
  method: 'POST',
  reply: replies.map((reply) => (typeof reply === 'string' ? { body: reply } : reply)),
})
export const repeat = <T>(value: T, times: number): T[] => Array.from({ length: times }, () => value)

/** A RECEPCIONDTE with this track id. */
export const reception = (trackId = TRACK_ID): FakeReply => ({
  body: siiFixture('reception-ok.xml').replace('9876543210', trackId),
})
export const uploadRoute = (...replies: readonly FakeReply[]): FakeRoute => ({
  url: UPLOAD,
  method: 'POST',
  reply: [...replies],
})
/** A QueryEstUp answer with this state. */
export const estUp = (code = 'EPR', trackId = TRACK_ID): FakeReply => ({
  body: siiFixture('soap-estup-epr.xml').replace('EPR', code).replace('9876543210', trackId),
})
export const estUpRoute = (...replies: readonly FakeReply[]): FakeRoute => ({
  url: EST_UP,
  method: 'POST',
  reply: [...replies],
})
/** A QueryEstDte answer: `received` for DOK, else FAU. */
export const estDteRoute = (...received: readonly boolean[]): FakeRoute => ({
  url: EST_DTE,
  method: 'POST',
  reply: received.map((ok) => ({ body: siiFixture(ok ? 'soap-estdte-dok.xml' : 'soap-estdte-fau.xml') })),
})

export type CertificationHarness = {
  readonly fake: FakeSii
  readonly deps: CertificationDependencies
  readonly store: CertificationStore
  readonly registry: FolioRegistry
  readonly sleeps: number[]
  readonly events: CertificationProgressEvent[]
  readonly steps: () => readonly string[]
  readonly posted: (page: string) => readonly Readonly<Record<string, string>>[]
  readonly urls: () => readonly string[]
  readonly warnings: () => readonly string[]
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

export const certificationHarness = async (routes: readonly FakeRoute[]): Promise<CertificationHarness> => {
  const fake = createFakeSii(routes)
  const sleeps: number[] = []
  const events: CertificationProgressEvent[] = []
  const warnings: string[] = []
  const logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: (message: string) => void warnings.push(message),
    error: () => undefined,
  }
  const portal = createPortalClient({
    environment: 'certification',
    certificate,
    companyRut: ISSUER_RUT,
    transport: fake.transport,
    now: () => FIXED_NOW,
    sleep: async () => undefined,
    retry: false,
    logger,
  })
  await seedSession(portal)
  const sii = createSiiClient({
    environment: 'certification',
    certificate,
    companyRut: ISSUER_RUT,
    transport: fake.transport,
    tokenCache: seededTokenCache('certification'),
    now: () => FIXED_NOW,
    sleep: async () => undefined,
    retry: false,
    logger,
  })
  const store = createMemoryCertificationStore()
  const registry = createMemoryFolioRegistry(() => FIXED_NOW)
  const deps: CertificationDependencies = {
    portal,
    sii,
    store,
    registry,
    issuer,
    receiver,
    certificate,
    resolution,
    now: () => FIXED_NOW,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    onProgress: (event) => {
      events.push(event)
    },
  }
  return {
    fake,
    deps,
    store,
    registry,
    sleeps,
    events,
    steps: () => events.map((event) => event.step),
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
    warnings: () => warnings,
  }
}

export const stateWith = (patch: Partial<CertificationState> = {}): CertificationState => ({
  ...createCertificationState(ISSUER_RUT, FIXED_NOW),
  ...patch,
})

/** A reply that walks a list of pages and then asks `fallback` for the rest, by call number. */
export const sequence = (
  pages: readonly string[],
  fallback: (call: number) => string,
): ((request: RecordedRequest) => FakeReply) => {
  const box = { calls: 0 }
  return () => {
    box.calls += 1
    return { body: pages[box.calls - 1] ?? fallback(box.calls) }
  }
}

/**
 * The stamping pages for any document type: an unrestricted quota, and a CAF of the type last asked for. Each type
 * costs one quota reading and one exact request.
 */
export const stampingRoutes = (): FakeRoute[] => {
  const box = { type: 33 }
  return [
    { url: `${MAULLIN}/of_solicita_folios`, method: 'GET', reply: () => ({ body: STAMP_ENTRY }) },
    {
      url: `${MAULLIN}/of_solicita_folios_dcto`,
      method: 'POST',
      reply: (request) => {
        const type = /COD_DOCTO=(\d+)/.exec(request.text)
        if (type !== null) box.type = Number(type[1])
        return { body: quotaForm() }
      },
    },
    { url: `${MAULLIN}/of_confirma_folio`, method: 'POST', reply: () => ({ body: cafXml(box.type) }) },
  ]
}
```

`tests/certification/steps-sets.test.ts` (new file, whole):

```ts
import { readFileSync } from 'node:fs'
import { prepareFolios, setFolioNeeds, simulationFolioNeeds } from '../../src/certification/folios-step'
import {
  advanceToNextStage,
  declareTestSets,
  declareWithRetries,
  obtainTestSet,
  runtime,
  sendTestSet,
  waitForTestSetsApproval,
} from '../../src/certification/steps'
import { cafFingerprint } from '../../src/folios/registry'
import { fullPlan } from '../support/certification-fixtures'
import {
  cafXml,
  certificationCafXmls,
  certificationHarness,
  EST_DTE,
  estDteRoute,
  estUp,
  estUpRoute,
  get,
  post,
  reception,
  repeat,
  stateWith,
  TODAY,
  TRACK_ID,
  UPLOAD,
  uploadRoute,
} from '../support/certification-harness'
import {
  ADVANCE_ANSWERS,
  DECLARATION_ANSWERS,
  declarationFormPage,
  progressPage,
  SET_ENTRY,
  setDownloadPage,
  setGenerationForm,
  STANDARD_ROWS,
} from '../support/certification-pages'
import { fixturePath } from '../support/fixtures'
import { siiFixture } from '../support/sii-client'
import { failure } from '../support/portal'
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
import { ATTENTION, FULL_SET_TEXT } from '../support/test-set-samples'

const plan = fullPlan()
const CAF_XML = readFileSync(fixturePath('caf-33.xml'), 'latin1')
const OLD_CAF_XML = readFileSync(fixturePath('caf-33-old.xml'), 'latin1')
const entry = get('pe_avance1', ...repeat(page('entry'), 40))
const stampEntry = {
  url: `https://maullin.sii.cl/cvc_cgi/dte/of_solicita_folios`,
  method: 'GET' as const,
  reply: repeat({ body: STAMP_ENTRY }, 8),
}

describe('obtainTestSet', () => {
  const routes = () => [
    get('pe_generar', SET_ENTRY),
    post('pe_generar1', setGenerationForm()),
    post('pe_generar2', setDownloadPage(FULL_SET_TEXT, '<p>Set generado correctamente</p>')),
  ]

  test('downloads, plans and keeps the text and the plan as artefacts', async () => {
    const harness = await certificationHarness(routes())
    const result = await obtainTestSet(harness.deps, stateWith(), { optionalSets: ['SET03'] })
    expect(result.outcome).toBe('loaded')
    expect(result.state).toMatchObject({ attentionNumber: ATTENTION, stage: 'testSets' })
    expect(result.state.plan?.basic?.kind).toBe('basic')
    expect(result.state.setText).toContain('SET BASICO')
    expect(await harness.store.listArtefacts()).toEqual(['estructuras.json', 'set-texto.txt'])
    expect(JSON.parse((await harness.store.readArtefact('estructuras.json'))!)).toEqual(result.state.plan)
    expect(harness.steps()).toEqual(['SETS_DOWNLOADING', 'SETS_LOADED'])
    expect(harness.posted('pe_generar2')[0]).toEqual({ AUTORIZADA: 'S', TOTAL: '15', SET01: 'S', SET03: 'S' })
    expect(await harness.store.load()).toEqual(result.state)
  })

  test('a run that already had a plan starts over: the sets are void, the CAFs stay', async () => {
    const harness = await certificationHarness(routes())
    const before = stateWith({
      plan,
      attentionNumber: '1',
      cafs: [cafXml()],
      usedFolios: [{ type: 33, folio: 1 }],
      sets: { basic: { trackId: '1', date: TODAY, sentAt: 'x', cases: [] } },
      setsApproved: true,
      stage: 'books',
    })
    const result = await obtainTestSet(harness.deps, before)
    expect(result.outcome).toBe('regenerated')
    expect(result.state).toMatchObject({ sets: {}, setsApproved: false, stage: 'testSets', cafs: [cafXml()] })
    expect(result.state.usedFolios).toEqual([{ type: 33, folio: 1 }])
    expect(harness.steps()).toEqual(['SETS_DOWNLOADING', 'SETS_REGENERATED', 'SETS_LOADED'])
    expect(harness.posted('pe_generar2')[0]).toMatchObject({ SET72: 'S' })
  })

  test('a text with no set is an unexpected page', async () => {
    const harness = await certificationHarness([
      get('pe_generar', SET_ENTRY),
      post('pe_generar1', setGenerationForm()),
      post('pe_generar2', setDownloadPage('CASO 1\nDOCUMENTO FACTURA')),
    ])
    const error = await failure(obtainTestSet(harness.deps, stateWith()))
    expect(error.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect(error.details).toMatchObject({ step: 'set-text' })
  })
})

describe('folio needs', () => {
  test('the sets not yet sent, and the simulation', () => {
    const all = setFolioNeeds(plan, [])
    expect(all[33]).toBe(plan.basic!.folios[33])
    expect(all[61]).toBe(plan.basic!.folios[61] + plan.exempt!.folios[61] + plan.purchase!.folios[61])
    expect(setFolioNeeds(plan, ['basic', 'guide', 'exempt', 'purchase'])).toEqual({})
    const simulation = simulationFolioNeeds(plan)
    expect(simulation[33]).toBe(plan.basic!.invoices.length)
    expect(simulation[52]).toBe(plan.guide!.guides.length)
    expect(simulation[46]).toBe(1)
    expect(simulationFolioNeeds({})).toEqual({})
    expect(simulationFolioNeeds({ purchase: { ...plan.purchase!, creditNote: null, debitNote: null } })).toEqual({
      46: 1,
    })
  })
})

describe('prepareFolios', () => {
  const quota = (...bodies: readonly string[]) => post('of_solicita_folios_dcto', ...bodies)
  const confirm = (...bodies: readonly string[]) => post('of_confirma_folio', ...bodies)

  test('CAFs in hand that cover the needs ask the portal nothing', async () => {
    const harness = await certificationHarness([])
    const state = stateWith({ plan, cafs: certificationCafXmls() })
    const result = await prepareFolios(harness.deps, state)
    expect(result.outcome).toBe('ready')
    expect(result.cafs).toEqual(certificationCafXmls())
    expect(harness.urls()).toEqual([])
    expect(harness.steps().filter((step) => step === 'CAF_OK')).toHaveLength(6)
    expect(result.state.cafs).toEqual(certificationCafXmls())
  })

  test('an unrestricted quota gets one exact request; the new CAF joins the state', async () => {
    const harness = await certificationHarness([stampEntry, quota(quotaForm(), quotaForm()), confirm(CAF_XML)])
    const result = await prepareFolios(harness.deps, stateWith(), { needs: { 33: 5 } })
    expect(result.cafs).toEqual([CAF_XML])
    expect(result.state.cafs).toEqual([CAF_XML])
    expect(harness.posted('of_solicita_folios_dcto')[1].CANTIDAD).toBe('5')
    expect(harness.steps()).toEqual(['CAF_REQUESTING', 'CAF_OK'])
  })

  test('with `fresh` the CAFs in hand are ignored and only the new ones come back', async () => {
    const harness = await certificationHarness([stampEntry, quota(quotaForm(), quotaForm()), confirm(CAF_XML)])
    const result = await prepareFolios(harness.deps, stateWith({ cafs: [cafXml(33, { from: 200, to: 300 })] }), {
      needs: { 33: 2 },
      fresh: true,
    })
    expect(result.cafs).toEqual([CAF_XML])
    expect(result.state.cafs).toEqual([cafXml(33, { from: 200, to: 300 }), CAF_XML])
  })

  test('a maximum below the need asks in batches', async () => {
    const harness = await certificationHarness([
      stampEntry,
      quota(quotaForm(3, 0), quotaForm(3, 0), quotaForm(3, 0)),
      confirm(CAF_XML, CAF_XML),
    ])
    const result = await prepareFolios(harness.deps, stateWith(), { needs: { 33: 3 } })
    expect(result.cafs.length).toBeGreaterThan(0)
    expect(result.outcome).toBe('ready')
  })

  test('an exact request that falls short falls back to batches for the rest', async () => {
    const harness = await certificationHarness([
      stampEntry,
      quota(quotaForm(), quotaForm(), ...repeat(quotaForm(100, 0), 4)),
      confirm(cafXml(33, { from: 1, to: 1 }), cafXml(33, { from: 2, to: 2 })),
    ])
    const result = await prepareFolios(harness.deps, stateWith(), { needs: { 33: 2 } })
    expect(result.cafs).toEqual([cafXml(33, { from: 1, to: 1 }), cafXml(33, { from: 2, to: 2 })])
    expect(harness.posted('of_confirma_folio')).toHaveLength(2)
    const refused = await certificationHarness([stampEntry, quota(quotaForm(), REJECTION_PAGES.companyNotAuthorized)])
    const error = await failure(prepareFolios(refused.deps, stateWith(), { needs: { 33: 2 } }))
    expect(error.details).toMatchObject({ rejection: 'companyNotAuthorized' })
  })

  test('a short quota with unused folios at the SII re-obtains them first', async () => {
    const harness = await certificationHarness([
      stampEntry,
      quota(quotaForm(1, 9)),
      get('rf_reobtencion1_folios', page('form')),
      post('rf_reobtencion2_folios', reobtainListPage([[1, 100]])),
      post('rf_reobtencion3_folios', reobtainDetailPage(1)),
      post('rf_genera_folio', REOBTAIN_RESOLUTION),
      post('rf_genera_archivo', CAF_XML),
      estDteRoute(false, false),
    ])
    // A range reserved but never sent is still re-obtainable: the registry is asked about every listed range.
    await harness.registry.reserve({
      companyRut: '76543210-3',
      type: 33,
      range: { from: 1, to: 100 },
      environment: 'certification',
    })
    const result = await prepareFolios(harness.deps, stateWith(), { needs: { 33: 2 } })
    expect(result.cafs).toEqual([CAF_XML])
    expect(harness.posted('of_confirma_folio')).toEqual([])
  })

  test('rationing with nothing else to do annuls the last 180 days and asks again', async () => {
    const harness = await certificationHarness([
      stampEntry,
      quota(REJECTION_PAGES.stampingBlocked, REJECTION_PAGES.stampingBlocked, quotaForm()),
      get('af_anular1', ...repeat(ANNUL_ENTRY, 4)),
      post('af_anular2', ...repeat(unusedRangesPage([[1, 9, '01-11-2026']]), 4)),
      post('af_anular3', ...repeat(ANNUL_FORM, 4)),
      post('af_anular', ...repeat(ANNUL_OK, 4)),
      confirm(CAF_XML),
    ])
    const result = await prepareFolios(harness.deps, stateWith({ cafs: [cafXml(33, { from: 500, to: 500 })] }), {
      needs: { 33: 2 },
    })
    expect(result.cafs).toEqual([cafXml(33, { from: 500, to: 500 }), CAF_XML])
    expect(harness.posted('af_anular')).toHaveLength(1)
  })

  test('annulling never touches a CAF the run holds, even when the simulation asks for fresh ones', async () => {
    const harness = await certificationHarness([
      stampEntry,
      quota(REJECTION_PAGES.stampingBlocked, REJECTION_PAGES.stampingBlocked, quotaForm()),
      get('af_anular1', ...repeat(ANNUL_ENTRY, 4)),
      post(
        'af_anular2',
        ...repeat(
          unusedRangesPage([
            [500, 500, '01-11-2026'],
            [1, 9, '01-11-2026'],
          ]),
          4,
        ),
      ),
      post('af_anular3', ...repeat(ANNUL_FORM, 4)),
      post('af_anular', ...repeat(ANNUL_OK, 4)),
      confirm(CAF_XML),
    ])
    const inHand = cafXml(33, { from: 500, to: 500 })
    const result = await prepareFolios(harness.deps, stateWith({ cafs: [inHand] }), { needs: { 33: 2 }, fresh: true })
    expect(result.cafs).toEqual([CAF_XML])
    expect(harness.posted('af_anular')).toHaveLength(1)
    expect(JSON.stringify(harness.posted('af_anular'))).not.toContain('500')
  })

  test('still short: the error carries the numbers and the reason', async () => {
    const harness = await certificationHarness([
      stampEntry,
      quota(...repeat(quotaForm(1, 0), 4)),
      confirm(cafXml(33, { from: 1, to: 1 }), REJECTION_PAGES.personWithPendingIssues),
    ])
    const error = await failure(prepareFolios(harness.deps, stateWith(), { needs: { 33: 2 } }))
    expect(error.code).toBe('FOLIO_OUT_OF_RANGE')
    expect(error.details).toMatchObject({
      type: 33,
      required: 2,
      available: 1,
      availableFolios: 0,
      rejection: 'quotaCapReached',
      reason: 'noUnusedFolios',
    })
    const refused = await certificationHarness([
      stampEntry,
      quota(quotaForm(5, 3), REJECTION_PAGES.companyNotAuthorized),
    ])
    const capped = await failure(prepareFolios(refused.deps, stateWith(), { needs: { 33: 2 } }))
    expect(capped.details).toMatchObject({ reason: 'unusedFoliosBlock', rejection: 'companyNotAuthorized' })
  })

  test('folios of this run the SII never received come back; received ones stay used; an expired CAF is skipped', async () => {
    const harness = await certificationHarness([
      {
        url: EST_DTE,
        method: 'POST',
        reply: [
          { body: siiFixture('soap-estdte-fau.xml') },
          { status: 500, body: 'down' },
          { body: siiFixture('soap-estdte-dok.xml') },
        ],
      },
    ])
    const held = cafXml(33, { from: 1, to: 3 })
    const other = cafXml(33, { from: 10, to: 12 })
    const otherScope = {
      companyRut: '76543210-3',
      type: 33,
      range: { from: 10, to: 12 },
      environment: 'certification' as const,
      cafFingerprint: cafFingerprint(other),
    }
    await harness.registry.reserve(otherScope)
    await harness.registry.markSent(otherScope, 10)
    const scope = {
      companyRut: '76543210-3',
      type: 33,
      range: { from: 1, to: 3 },
      environment: 'certification' as const,
      cafFingerprint: cafFingerprint(held),
    }
    await harness.registry.reserve(scope)
    await harness.registry.reserve(scope)
    await harness.registry.markSent(scope, 1)
    await harness.registry.markSent(scope, 2)
    const state = stateWith({
      cafs: [held, OLD_CAF_XML, other],
      usedFolios: [
        { type: 33, folio: 1 },
        { type: 33, folio: 2 },
        { type: 61, folio: 7 },
        { type: 33, folio: 10 },
      ],
    })
    const result = await prepareFolios(harness.deps, state, { needs: { 33: 2 } })
    expect(result.state.usedFolios).toEqual([
      { type: 33, folio: 2 },
      { type: 61, folio: 7 },
      { type: 33, folio: 10 },
    ])
    expect(await harness.registry.remaining(scope)).toBe(2)
    expect(await harness.registry.remaining(otherScope)).toBe(2)
    expect(harness.urls().every((url) => url.endsWith('QueryEstDte.jws'))).toBe(true)
  })

  test('without a plan and without needs there is nothing to prepare', async () => {
    const harness = await certificationHarness([])
    expect((await failure(prepareFolios(harness.deps, stateWith()))).details).toEqual({ field: 'plan' })
  })
})

describe('sendTestSet', () => {
  test('issues, keeps the artefacts, uploads, marks the folios and records the send', async () => {
    const harness = await certificationHarness([uploadRoute(reception())])
    const state = stateWith({ plan, cafs: certificationCafXmls() })
    const result = await sendTestSet(harness.deps, state, { kind: 'basic' })
    expect(result.outcome).toBe('sent')
    const sent = result.state.sets.basic!
    expect(sent).toMatchObject({ trackId: TRACK_ID, date: TODAY, sentAt: '2026-11-15T18:30:00.000Z' })
    expect(sent.cases).toHaveLength(
      plan.basic!.invoices.length + plan.basic!.creditNotes.length + plan.basic!.debitNotes.length,
    )
    expect(sent.cases[0]).toMatchObject({ type: 33, folio: 1, issueDate: TODAY })
    expect(sent.cases[0].totals.totalAmount).toBeGreaterThan(0)
    expect(result.state.usedFolios).toHaveLength(sent.cases.length)
    const names = await harness.store.listArtefacts()
    expect(names).toContain('sets-prueba/envio-set-basico.xml')
    expect(names).toContain('sets-prueba/dtes/dte-33-000001.xml')
    expect((await harness.store.readArtefact('sets-prueba/envio-set-basico.xml'))!.startsWith('<?xml')).toBe(true)
    const stats = await harness.registry.stats({ companyRut: '76543210-3', type: 33, environment: 'certification' })
    expect(stats.totalSent).toBe(plan.basic!.invoices.length)
    expect(harness.steps()).toEqual(['SET_START', 'SET_OK'])
    expect(harness.urls()).toEqual([UPLOAD])
  })

  test('a failed upload still marks the folios as sent, then throws', async () => {
    const harness = await certificationHarness([uploadRoute({ status: 500, body: 'down' })])
    const state = stateWith({ plan, cafs: certificationCafXmls() })
    const error = await failure(sendTestSet(harness.deps, state, { kind: 'guide' }))
    expect(error.code).toBe('SII_HTTP_ERROR')
    expect(harness.steps()).toEqual(['SET_START', 'SET_ERROR'])
    const stats = await harness.registry.stats({ companyRut: '76543210-3', type: 52, environment: 'certification' })
    expect(stats.totalSent).toBe(plan.guide!.guides.length)
    expect((await harness.store.load())?.usedFolios).toHaveLength(plan.guide!.guides.length)
    expect((await harness.store.load())?.sets).toEqual({})
  })

  test('a type with no CAF in hand, or with every CAF exhausted, cannot issue', async () => {
    const harness = await certificationHarness([])
    const error = await failure(sendTestSet(harness.deps, stateWith({ plan, cafs: [cafXml(33)] }), { kind: 'guide' }))
    expect(error.code).toBe('FOLIO_OUT_OF_RANGE')
    expect(error.details).toEqual({ type: 52 })
    const short = stateWith({ plan, cafs: [cafXml(52, { from: 1, to: 1 }), cafXml(52, { from: 5, to: 5 })] })
    expect((await failure(sendTestSet(harness.deps, short, { kind: 'guide' }))).details).toEqual({ type: 52 })
  })

  test('a guide set keeps the transfer type of each case', async () => {
    const harness = await certificationHarness([uploadRoute(reception('55'))])
    const result = await sendTestSet(harness.deps, stateWith({ plan, cafs: certificationCafXmls() }), { kind: 'guide' })
    expect(result.state.sets.guide?.trackId).toBe('55')
    expect(result.state.sets.guide?.cases.every((c) => c.type === 52 && c.transferType !== undefined)).toBe(true)
  })

  test('a set without a plan', async () => {
    const harness = await certificationHarness([])
    expect((await failure(sendTestSet(harness.deps, stateWith(), { kind: 'exempt' }))).details).toEqual({
      field: 'plan',
      kind: 'exempt',
    })
  })
})

describe('declareTestSets', () => {
  const sent = { basic: { trackId: '1234', date: TODAY, sentAt: 'x', cases: [] } }
  const form = declarationFormPage(STANDARD_ROWS)
  const kept = declarationFormPage([{ label: 'SET BASICO', index: 1, value: '1234' }, ...STANDARD_ROWS.slice(1)])

  test('ten seconds, one declaration, the pages as artefacts, the outcome in the state', async () => {
    const harness = await certificationHarness([
      entry,
      post('pe_avance2', form, kept),
      post('pe_avance3', DECLARATION_ANSWERS.success),
    ])
    const result = await declareTestSets(harness.deps, stateWith({ sets: sent }))
    expect(result.outcome).toBe('accepted')
    expect(harness.sleeps).toEqual([10000])
    expect(harness.steps()).toEqual(['SETS_DECLARING', 'POLLING', 'SETS_DECLARED'])
    expect(harness.events[1]).toEqual({ step: 'POLLING', attempt: 1, max: 10, label: 'declaration' })
    expect(await harness.store.listArtefacts()).toEqual([
      'declaracion-sets-1.html',
      'declaracion-sets-pe_avance2-1.html',
    ])
    expect(result.state.lastDeclaration).toEqual({
      scope: 'sets',
      outcome: 'accepted',
      detail: null,
      at: '2026-11-15T18:30:00.000Z',
    })
    expect(harness.posted('pe_avance3')[0]).toMatchObject({ NUM_ENV1: '1234', FEC_ENV1: '15-11-2026' })
  })

  test('"not processed" and "not saved" are retried five seconds apart', async () => {
    const partial = declarationFormPage([
      STANDARD_ROWS[0],
      { ...STANDARD_ROWS[1], value: '5' },
      ...STANDARD_ROWS.slice(2),
    ])
    const final = declarationFormPage([
      { label: 'SET BASICO', index: 1, value: '1234' },
      { label: 'SET GUIA DE DESPACHO', state: 'EN REVISION' },
      ...STANDARD_ROWS.slice(2),
    ])
    const harness = await certificationHarness([
      entry,
      post('pe_avance2', form, form, form, partial, form, final),
      post('pe_avance3', DECLARATION_ANSWERS.notProcessed, DECLARATION_ANSWERS.success, DECLARATION_ANSWERS.success),
    ])
    const two = { basic: sent.basic, guide: { trackId: '5', date: TODAY, sentAt: 'x', cases: [] } }
    const result = await declareTestSets(harness.deps, stateWith({ sets: two }))
    expect(result.outcome).toBe('inReview')
    expect(harness.sleeps).toEqual([10000, 5000, 5000])
  })

  test('content errors with the fields present are diagnosed through the SOAP status', async () => {
    const harness = await certificationHarness([
      entry,
      post('pe_avance2', form, kept),
      post('pe_avance3', DECLARATION_ANSWERS.contentErrors),
      estUpRoute(estUp('RPR', '1234')),
    ])
    const result = await declareTestSets(harness.deps, stateWith({ sets: sent }))
    expect(result.outcome).toBe('contentErrors')
    expect(result.state.diagnosis?.['1234']).toMatchObject({ code: 'RPR', status: 'acceptedWithObjections' })
    expect(await harness.store.readArtefact('declaracion-sets-estado-basic-1234.xml')).toContain('RPR')
    expect(harness.steps()).toEqual(['SETS_DECLARING', 'POLLING'])
  })

  test('content errors with empty fields are retried; a failed diagnosis only warns', async () => {
    const harness = await certificationHarness([
      entry,
      post('pe_avance2', form, form, form, kept),
      post('pe_avance3', DECLARATION_ANSWERS.contentErrors, DECLARATION_ANSWERS.contentErrors),
      estUpRoute({ status: 500, body: 'down' }),
    ])
    const result = await declareTestSets(harness.deps, stateWith({ sets: sent }))
    expect(result.outcome).toBe('contentErrors')
    expect(harness.sleeps).toEqual([10000, 5000])
    expect(result.state.diagnosis).toEqual({})
    expect(harness.warnings()).toContain('certification diagnosis failed')
  })

  test('every row empty stops at once; inconsistent data too', async () => {
    const rejected = await certificationHarness([
      entry,
      post('pe_avance2', form, form),
      post('pe_avance3', DECLARATION_ANSWERS.success),
    ])
    await expect(declareTestSets(rejected.deps, stateWith({ sets: sent }))).resolves.toMatchObject({
      outcome: 'allRejected',
    })
    expect(rejected.sleeps).toEqual([10000])
    const inconsistent = await certificationHarness([
      entry,
      post('pe_avance2', form),
      post('pe_avance3', DECLARATION_ANSWERS.inconsistent),
    ])
    const result = await declareTestSets(inconsistent.deps, stateWith({ sets: sent }))
    expect(result).toMatchObject({ outcome: 'inconsistent', detail: 'LA FECHA DE ENVIO NO CORRESPONDE AL ENVIO 123' })
    expect(result.state.lastDeclaration?.detail).toBe('LA FECHA DE ENVIO NO CORRESPONDE AL ENVIO 123')
  })

  test('ten attempts at most', async () => {
    const harness = await certificationHarness([
      entry,
      post('pe_avance2', ...repeat(form, 20)),
      post('pe_avance3', ...repeat(DECLARATION_ANSWERS.notProcessed, 10)),
    ])
    const result = await declareTestSets(harness.deps, stateWith({ sets: sent }))
    expect(result.outcome).toBe('notProcessed')
    expect(harness.sleeps).toHaveLength(10)
    expect(harness.posted('pe_avance3')).toHaveLength(10)
  })

  test('the simulation flag retries "every row empty"', async () => {
    const rows = [{ label: 'SET DE SIMULACION', index: 1 }, ...STANDARD_ROWS.slice(1)]
    const empty = declarationFormPage(rows)
    const done = declarationFormPage([{ label: 'SET DE SIMULACION', index: 1, value: '77' }, ...STANDARD_ROWS.slice(1)])
    const harness = await certificationHarness([
      entry,
      post('pe_avance2', empty, empty, empty, done),
      post('pe_avance3', DECLARATION_ANSWERS.success, DECLARATION_ANSWERS.success),
    ])
    const loop = await declareWithRetries(
      runtime(harness.deps),
      { simulation: { trackId: '77', date: TODAY } },
      { label: 'simulation', prefix: 'x', retryOnAllRejected: true },
    )
    expect(loop.result.outcome).toBe('accepted')
    expect(loop.attempts).toBe(2)
    expect(harness.sleeps).toEqual([10000, 5000])
  })

  test('nothing sent, nothing to declare', async () => {
    const harness = await certificationHarness([])
    expect((await failure(declareTestSets(harness.deps, stateWith()))).details).toEqual({ field: 'sets' })
  })
})

describe('waitForTestSetsApproval', () => {
  const sent = {
    basic: { trackId: '1', date: TODAY, sentAt: 'x', cases: [] },
    guide: { trackId: '2', date: TODAY, sentAt: 'x', cases: [] },
  }
  const progressRoutes = (...pages: readonly string[]) => [
    entry,
    post('pe_avance2', ...repeat(page('<tr><td><font>SET BASICO</font></td><td><b>x</b></td></tr>'), pages.length)),
    get('pe_avance5', ...repeat(page('p5'), pages.length)),
    post('pe_avance6', ...pages),
  ]

  test('approved on the second poll, sleeping first each time', async () => {
    const harness = await certificationHarness(
      progressRoutes(
        progressPage('SET', { 'SET BASICO': 'REVISADO CONFORME', 'SET GUIA DESP.': 'EN REVISION' }),
        progressPage('SET', {
          'SET BASICO': 'REVISADO CONFORME',
          'SET GUIA DESP.': 'REVISADO CONFORME',
          'SET FACTURA EXENTA': 'RECHAZADO',
        }),
      ),
    )
    const result = await waitForTestSetsApproval(harness.deps, stateWith({ sets: sent }))
    expect(result.outcome).toBe('approved')
    expect(result.state).toMatchObject({ setsApproved: true, stage: 'books' })
    expect(harness.sleeps).toEqual([10000, 10000])
    expect(harness.steps()).toEqual(['POLLING', 'POLLING', 'SETS_APPROVED'])
  })

  test('a rejected or inconsistent set stops with the wording', async () => {
    const harness = await certificationHarness(
      progressRoutes(
        progressPage('SET', { 'SET BASICO': 'ENVIO CON ERRORES O REPAROS', 'SET GUIA DESP.': 'FECHA NO CORRESPONDE' }),
      ),
    )
    const result = await waitForTestSetsApproval(harness.deps, stateWith({ sets: sent }))
    expect(result).toMatchObject({ outcome: 'rejected', detail: 'ENVIO CON ERRORES O REPAROS | FECHA NO CORRESPONDE' })
    expect(harness.steps()).toEqual(['POLLING', 'SETS_REJECTED'])
  })

  test('five polls, then a time-out; no set at all is never approval', async () => {
    const pending = progressPage('SET', { 'SET BASICO': 'EN REVISION', 'SET GUIA DESP.': 'REVISADO CONFORME' })
    const harness = await certificationHarness(progressRoutes(...repeat(pending, 5)))
    await expect(waitForTestSetsApproval(harness.deps, stateWith({ sets: sent }))).resolves.toMatchObject({
      outcome: 'timedOut',
    })
    expect(harness.sleeps).toHaveLength(5)
    const none = await certificationHarness(progressRoutes(...repeat(progressPage('SET', {}), 5)))
    await expect(waitForTestSetsApproval(none.deps, stateWith())).resolves.toMatchObject({ outcome: 'timedOut' })
  })
})

test('the runtime defaults: a real clock, a real sleep, no listener', async () => {
  const harness = await certificationHarness([])
  const rt = runtime({ ...harness.deps, now: undefined, sleep: undefined, onProgress: undefined })
  expect(rt.now()).toBeInstanceOf(Date)
  await rt.sleep(1)
  expect(() => rt.emit({ step: 'CERT_DONE' })).not.toThrow()
})

describe('advanceToNextStage', () => {
  const routes = (answer: string, stage: string) => [
    entry,
    post('pe_avance2', declarationFormPage(STANDARD_ROWS), declarationFormPage(STANDARD_ROWS)),
    post('pe_avance4', answer),
    get('pe_avance5', page('p5')),
    post('pe_avance6', progressPage(stage, { 'SET BASICO': 'REVISADO CONFORME' })),
  ]

  test('advanced, and the stage read from the portal', async () => {
    const harness = await certificationHarness(routes(ADVANCE_ANSWERS.advanced, 'SIMULACION'))
    const result = await advanceToNextStage(harness.deps, stateWith({ stage: 'books' }))
    expect(result).toMatchObject({ outcome: 'advanced', detail: 'La empresa ha pasado al paso de SIMULACION' })
    expect(result.state.stage).toBe('simulation')
    expect(harness.steps()).toEqual(['ADVANCE_WAITING', 'ADVANCE_DONE'])
    expect(harness.events[1]).toEqual({ step: 'ADVANCE_DONE', stage: 'SIMULACION' })
  })

  test('"already there" is fine and never moves the stage back', async () => {
    const harness = await certificationHarness(routes(ADVANCE_ANSWERS.unchanged, 'SET DE PRUEBAS'))
    const result = await advanceToNextStage(harness.deps, stateWith({ stage: 'exchange' }))
    expect(result.outcome).toBe('unchanged')
    expect(result.state.stage).toBe('exchange')
    const noStage = await certificationHarness([
      entry,
      post('pe_avance2', declarationFormPage(STANDARD_ROWS), declarationFormPage(STANDARD_ROWS)),
      post('pe_avance4', ADVANCE_ANSWERS.advanced),
      get('pe_avance5', page('p5')),
      post('pe_avance6', page('<tr><td>SET BASICO</td><td><b>EN REVISION</b></td></tr>')),
    ])
    await advanceToNextStage(noStage.deps, stateWith())
    expect(noStage.events[1]).toEqual({ step: 'ADVANCE_DONE', stage: '' })
  })

  test('a refusal throws with the portal sentence', async () => {
    const harness = await certificationHarness(routes(ADVANCE_ANSWERS.failed, 'SIMULACION'))
    const error = await failure(advanceToNextStage(harness.deps, stateWith()))
    expect(error.code).toBe('SII_PORTAL_REJECTED')
    expect(error.details).toMatchObject({
      rejection: 'advanceRefused',
      portalMessage: 'No es posible avanzar: faltan sets por revisar.',
    })
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/certification/steps-sets tests/certification/books.test --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/certification/steps'` and `'../../src/certification/folios-step'`.

- [ ] **Step 3: Write the implementation**

`src/certification/runtime.ts` (new file, whole):

```ts
import type { BookKey, SetKey } from '../catalogs/certification'
import type { Certificate } from '../certificate/certificate'
import type { FolioRegistry } from '../folios/registry'
import type { IssuerInput, ReceiverInput } from '../model/document'
import type { PortalClient } from '../portal/client'
import type { SiiClient } from '../sii/client'
import type { CertificationState, CertificationStore } from './state'

/**
 * EN: What every step needs: the clients, the store, the registry, the company and the clock.
 * ES: Lo que necesita cada paso: los clientes, el almacén, el registro, la empresa y el reloj.
 */
export type CertificationDependencies = {
  /** EN: The phase 4 client on the certification environment. ES: El cliente de la fase 4 en el ambiente de certificación. */
  readonly portal: PortalClient
  /** EN: The phase 2 client on the certification environment. ES: El cliente de la fase 2 en el ambiente de certificación. */
  readonly sii: SiiClient
  /** EN: Where the state and the artefacts live. ES: Dónde viven el estado y los artefactos. */
  readonly store: CertificationStore
  /** EN: The folio registry. ES: El registro de folios. */
  readonly registry: FolioRegistry
  readonly issuer: IssuerInput
  readonly receiver: ReceiverInput
  readonly certificate: Certificate
  /** EN: The resolution of the certification environment: number 0 and its date. ES: La resolución del ambiente de certificación: número 0 y su fecha. */
  readonly resolution: { readonly number: number; readonly date: string }
  /** EN: Clock; dates are Chile dates of it. ES: Reloj; las fechas son fechas de Chile de él. */
  readonly now?: () => Date
  /** EN: Wait function; the waits of the field by default. ES: Función de espera; por defecto las esperas del campo. */
  readonly sleep?: (ms: number) => Promise<void>
  /** EN: Progress events. ES: Eventos de progreso. */
  readonly onProgress?: (event: CertificationProgressEvent) => void
}

/**
 * EN: The progress events the steps emit, with the field's step names.
 * ES: Los eventos de progreso que emiten los pasos, con los nombres de paso del campo.
 */
export type CertificationProgressEvent =
  | { readonly step: 'SETS_DOWNLOADING' }
  | { readonly step: 'SETS_LOADED' }
  | { readonly step: 'SETS_REGENERATED' }
  | { readonly step: 'CAF_REQUESTING'; readonly type: number }
  | { readonly step: 'CAF_OK'; readonly type: number }
  | { readonly step: 'SET_START'; readonly set: SetKey }
  | { readonly step: 'SET_OK'; readonly set: SetKey; readonly trackId: string }
  | { readonly step: 'SET_ERROR'; readonly set: SetKey; readonly error: string }
  | { readonly step: 'SETS_DECLARING' }
  | { readonly step: 'SETS_DECLARED' }
  | { readonly step: 'POLLING'; readonly attempt: number; readonly max: number; readonly label: PollingLabel }
  | { readonly step: 'SETS_APPROVED' }
  | { readonly step: 'SETS_REJECTED' }
  | { readonly step: 'BOOKS_START' }
  | { readonly step: 'BOOK_SKIPPED'; readonly book: BookKey }
  | { readonly step: 'BOOK_SENDING'; readonly book: BookKey }
  | { readonly step: 'BOOK_OK'; readonly book: BookKey; readonly trackId: string }
  | { readonly step: 'BOOK_ERROR'; readonly book: BookKey; readonly error: string }
  | { readonly step: 'BOOK_PERIOD_RETRY'; readonly period: string; readonly attempt: number }
  | { readonly step: 'BOOKS_DECLARING' }
  | { readonly step: 'BOOKS_DONE'; readonly books: readonly BookKey[]; readonly success: boolean }
  | { readonly step: 'ADVANCE_WAITING' }
  | { readonly step: 'ADVANCE_DONE'; readonly stage: string }
  | { readonly step: 'SIM_START' }
  | { readonly step: 'SIM_SENDING' }
  | { readonly step: 'SIM_OK'; readonly trackId: string }
  | { readonly step: 'SIM_DECLARING' }
  | { readonly step: 'SIM_DONE' }
  | { readonly step: 'CERT_DONE' }
  | { readonly step: 'CERT_ERROR'; readonly error: string }

/** EN: What a `POLLING` event waits for. ES: Lo que espera un evento `POLLING`. */
export type PollingLabel = 'sets' | 'declaration' | 'books' | 'simulation'

/**
 * EN: What a step returns: the state it saved, how it ended, and a word or sentence on why.
 * ES: Lo que devuelve un paso: el estado que guardó, cómo terminó, y una palabra o frase sobre el porqué.
 */
export type StepResult<Outcome extends string> = {
  readonly state: CertificationState
  readonly outcome: Outcome
  readonly detail?: string
}

/**
 * EN: The dependencies with their defaults resolved. Internal to the steps.
 * ES: Las dependencias con sus valores por defecto resueltos. Interno de los pasos.
 */
export type Runtime = CertificationDependencies & {
  readonly now: () => Date
  readonly sleep: (ms: number) => Promise<void>
  readonly emit: (event: CertificationProgressEvent) => void
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * EN: Resolves the defaults of the dependencies.
 * ES: Resuelve los valores por defecto de las dependencias.
 */
export const runtime = (deps: CertificationDependencies): Runtime => ({
  ...deps,
  now: deps.now ?? (() => new Date()),
  sleep: deps.sleep ?? defaultSleep,
  emit: (event) => deps.onProgress?.(event),
})

/**
 * EN: Saves a changed state through the store and returns it.
 * ES: Guarda un estado cambiado a través del almacén y lo devuelve.
 */
export const saveState = async (
  rt: Runtime,
  state: CertificationState,
  patch: Partial<CertificationState>,
): Promise<CertificationState> => {
  const next = { ...state, ...patch, updatedAt: rt.now().toISOString() }
  await rt.store.save(next)
  return next
}
```

`src/certification/folios-step.ts` (new file, whole):

```ts
import { parseCaf, type Caf } from '../caf/parse'
import { isCafExpired } from '../caf/validity'
import type { DocumentType } from '../catalogs/document-types'
import type { PortalRejection } from '../catalogs/portal'
import { DteError } from '../errors'
import type { FolioScope } from '../folios/ledger'
import { cafFingerprint, type FolioRegistry } from '../folios/registry'
import { annulFolios } from '../portal/annulment'
import { reobtainFolios, requestCafExact, requestCafInBatches, type FolioFlowResult } from '../portal/flows'
import { queryFolioQuota, type FolioQuota, type ObtainedCaf } from '../portal/stamping'
import { folioReceived } from '../sii/status'
import type { FolioSource } from './folios'
import type { CertificationPlan } from './set-plan'
import type { CertificationState } from './state'
import { runtime, saveState, type CertificationDependencies, type Runtime, type StepResult } from './runtime'

/**
 * EN: A CAF the run holds, parsed, with its registry scope.
 * ES: Un CAF que tiene la corrida, parseado, con su alcance en el registro.
 */
export type HeldCaf = {
  readonly xml: string
  readonly caf: Caf
  readonly scope: FolioScope
}

const ANNUL_WINDOW_DAYS = 180
const ANNUL_MAX_RANGES = 10
const MAX_RECEIPT_CHECKS = 30
// The refusals that come from unused folios: annulling may lift them.
const RATIONING: ReadonlySet<PortalRejection> = new Set([
  'quotaInsufficient',
  'stampingBlocked',
  'quotaCapReached',
  'personWithPendingIssues',
])
// After an exact request these mean "less than asked": a run of batches may still cover it.
const BATCH_FALLBACK: ReadonlySet<PortalRejection> = new Set(['quotaInsufficient', 'foliosShort', 'quotaExceeded'])

/**
 * EN: The CAFs of a run, parsed; an expired one is left out, because the SII refuses its folios.
 * ES: Los CAF de una corrida, parseados; uno vencido se deja fuera, porque el SII rechaza sus folios.
 */
export const heldCafs = (xmls: readonly string[], now: Date): readonly HeldCaf[] =>
  xmls.flatMap((xml) => {
    const caf = parseCaf(xml)
    if (isCafExpired(caf, { now })) return []
    return [
      {
        xml,
        caf,
        scope: {
          companyRut: caf.issuerRut,
          type: caf.documentType,
          range: caf.range,
          environment: 'certification',
          cafFingerprint: cafFingerprint(xml),
        },
      },
    ]
  })

/**
 * EN: The scope of the CAF whose range holds a folio. The folio came out of these CAFs, so one of them holds it.
 * ES: El alcance del CAF cuyo rango contiene un folio. El folio salió de estos CAF, así que uno de ellos lo contiene.
 */
export const scopeFor = (held: readonly HeldCaf[], type: number, folio: number): FolioScope =>
  held.find((h) => h.caf.documentType === type && folio >= h.caf.range.from && folio <= h.caf.range.to)!.scope

/**
 * EN: A folio source over the held CAFs through the registry: the first CAF of the type with a folio left gives the
 * next one, reserved in the registry, so two runs never take the same folio.
 * ES: Una fuente de folios sobre los CAF en mano a través del registro: el primer CAF del tipo con un folio libre da
 * el siguiente, reservado en el registro, así dos corridas nunca toman el mismo folio.
 */
export const registryFolioSource = (registry: FolioRegistry, held: readonly HeldCaf[]): FolioSource => ({
  take: async (type: DocumentType) => {
    for (const h of held) {
      if (h.caf.documentType !== type) continue
      if ((await registry.remaining(h.scope)) > 0) return { caf: h.caf, folio: await registry.reserve(h.scope) }
    }
    throw new DteError('FOLIO_OUT_OF_RANGE', { type })
  },
})

const addNeed = (needs: Record<number, number>, type: number, count: number): void => {
  if (count > 0) needs[type] = (needs[type] ?? 0) + count
}

/**
 * EN: The folios each type needs for the sets not yet sent: the sum of each set plan's `folios`, never more, because
 * unused authorized folios make the SII ration the next request.
 * ES: Los folios que necesita cada tipo para los sets aún no enviados: la suma de los `folios` de cada plan de set,
 * nunca más, porque folios autorizados sin usar hacen que el SII racione la próxima solicitud.
 */
export const setFolioNeeds = (plan: CertificationPlan, sent: readonly string[]): Readonly<Record<number, number>> => {
  const needs: Record<number, number> = {}
  for (const kind of ['basic', 'guide', 'exempt', 'purchase'] as const) {
    const set = plan[kind]
    if (set === undefined || sent.includes(kind)) continue
    for (const [type, count] of Object.entries(set.folios)) addNeed(needs, Number(type), count)
  }
  return needs
}

/**
 * EN: The folios the simulation needs: one per case, by type.
 * ES: Los folios que necesita la simulación: uno por caso, por tipo.
 */
export const simulationFolioNeeds = (plan: CertificationPlan): Readonly<Record<number, number>> => {
  const needs: Record<number, number> = {}
  for (const set of [plan.basic, plan.exempt]) {
    if (set === undefined) continue
    addNeed(needs, set.kind === 'basic' ? 33 : 34, set.invoices.length)
    addNeed(needs, 61, set.creditNotes.length)
    addNeed(needs, 56, set.debitNotes.length)
  }
  addNeed(needs, 52, plan.guide?.guides.length ?? 0)
  if (plan.purchase !== undefined) {
    addNeed(needs, 46, 1)
    addNeed(needs, 61, plan.purchase.creditNote === null ? 0 : 1)
    addNeed(needs, 56, plan.purchase.debitNote === null ? 0 : 1)
  }
  return needs
}

/**
 * EN: Options of `prepareFolios`.
 * ES: Opciones de `prepareFolios`.
 */
export type PrepareFoliosOptions = {
  /** EN: Folios needed per type; the sets not yet sent by default. ES: Folios necesarios por tipo; por defecto los sets aún no enviados. */
  readonly needs?: Readonly<Record<number, number>>
  /** EN: Ignore the CAFs in hand and request new ones (the simulation never reuses the sets' CAFs). ES: Ignorar los CAF en mano y pedir nuevos (la simulación nunca reutiliza los CAF de los sets). */
  readonly fresh?: boolean
}

/**
 * EN: What `prepareFolios` returns: the state, and the CAFs that cover the needs.
 * ES: Lo que devuelve `prepareFolios`: el estado, y los CAF que cubren las necesidades.
 */
export type PrepareFoliosResult = StepResult<'ready'> & {
  /** EN: The CAF files to issue with: the ones in hand plus the new ones, or only the new ones with `fresh`. ES: Los CAF con que emitir: los en mano más los nuevos, o solo los nuevos con `fresh`. */
  readonly cafs: readonly string[]
}

type Used = readonly { readonly type: number; readonly folio: number }[]

// Folios this run marked sent whose envelope the SII never received (a failed send) come back: the field learnt it after
// six retries burned 66 folios. At most 30 checks per CAF.
const recoverUnreceived = async (rt: Runtime, held: readonly HeldCaf[], used: Used): Promise<Used> => {
  const released = new Set<string>()
  for (const h of held) {
    const candidates = used
      .filter((u) => u.type === h.caf.documentType && u.folio >= h.caf.range.from && u.folio <= h.caf.range.to)
      .slice(0, MAX_RECEIPT_CHECKS)
    const free: number[] = []
    for (const candidate of candidates) {
      const received = await folioReceived(rt.sii, { type: h.caf.documentType, folio: candidate.folio }).catch(
        () => null,
      )
      if (received === false) free.push(candidate.folio)
    }
    if (free.length === 0) continue
    await rt.registry.release(h.scope, free)
    for (const folio of free) released.add(`${h.caf.documentType}-${folio}`)
  }
  return used.filter((u) => !released.has(`${u.type}-${u.folio}`))
}

const shortage = (type: number, required: number, available: number, result: FolioFlowResult): DteError =>
  new DteError('FOLIO_OUT_OF_RANGE', {
    type,
    required,
    available,
    maxAuthorized: result.maxAuthorized,
    availableFolios: result.availableFolios,
    rejection: result.rejection,
    reason: result.availableFolios === 0 ? 'noUnusedFolios' : 'unusedFoliosBlock',
  })

/**
 * EN: Makes sure the run holds the folios each type needs, as the field does it: the CAFs in hand first (an expired
 * one is skipped; folios of this run the SII never received are given back), then the quota; a blocked or short quota
 * with unused folios at the SII re-obtains them; then one exact request, or batches when the maximum is below the
 * need, falling back to batches when the exact request falls short; as a last resort, when the refusal is rationing
 * and the SII shows more unused folios than the run holds, unused ranges of the last 180 days (at most 10, never the
 * CAFs in hand) are annulled and the request repeated. Still short throws `FOLIO_OUT_OF_RANGE` with the numbers.
 * ES: Asegura que la corrida tenga los folios que necesita cada tipo, como lo hace el campo: primero los CAF en mano
 * (uno vencido se omite; los folios de esta corrida que el SII nunca recibió se devuelven), luego el cupo; un cupo
 * bloqueado o corto con folios sin usar en el SII los reobtiene; luego una solicitud exacta, o por tandas cuando el
 * máximo está bajo la necesidad, cayendo a tandas cuando la exacta queda corta; como último recurso, cuando la negativa
 * es racionamiento y el SII muestra más folios sin usar que los en mano, se anulan rangos sin usar de los últimos 180
 * días (máximo 10, nunca los CAF en mano) y se repite la solicitud. Si aún falta, lanza `FOLIO_OUT_OF_RANGE` con los
 * números.
 * @throws {DteError} EN: `MISSING_FIELD { field: 'plan' }` without a plan and without `needs`; `FOLIO_OUT_OF_RANGE { type, required, available, maxAuthorized, availableFolios, rejection, reason }`; the portal codes. ES: los mismos códigos.
 */
export const prepareFolios = async (
  deps: CertificationDependencies,
  state: CertificationState,
  options: PrepareFoliosOptions = {},
): Promise<PrepareFoliosResult> => {
  const rt = runtime(deps)
  if (options.needs === undefined && state.plan === undefined) throw new DteError('MISSING_FIELD', { field: 'plan' })
  const needs = options.needs ?? setFolioNeeds(state.plan!, Object.keys(state.sets))
  const inHand: string[] = options.fresh ? [] : [...state.cafs]
  const obtained: string[] = []
  let usedFolios = state.usedFolios
  const add = (cafs: readonly ObtainedCaf[]): void => {
    for (const caf of cafs) {
      inHand.push(caf.xml)
      obtained.push(caf.xml)
    }
  }
  for (const type of Object.keys(needs)
    .map(Number)
    .sort((a, b) => a - b)) {
    const required = needs[type]
    rt.emit({ step: 'CAF_REQUESTING', type })
    const held = (): readonly HeldCaf[] => heldCafs(inHand, rt.now()).filter((h) => h.caf.documentType === type)
    // Annulling never touches a CAF the run holds, the sets' included, whatever `fresh` says.
    const everyHeld = (): readonly HeldCaf[] =>
      heldCafs([...state.cafs, ...obtained], rt.now()).filter((h) => h.caf.documentType === type)
    const available = async (): Promise<number> => {
      let sum = 0
      for (const h of held()) sum += await rt.registry.remaining(h.scope)
      return sum
    }
    usedFolios = await recoverUnreceived(rt, held(), usedFolios)
    let missing = required - (await available())
    let last: FolioFlowResult | null = null
    if (missing > 0) {
      const quota: FolioQuota = await queryFolioQuota(rt.portal, { type: type as DocumentType })
      // A quota that is not unrestricted always carries its maximum.
      const short = quota.blocked || (!quota.unrestricted && quota.maxAuthorized! < missing)
      if (short && (quota.availableFolios ?? 0) > 0) {
        const reobtained = await reobtainFolios(rt.portal, {
          type: type as DocumentType,
          quantity: missing,
          isIssued: async (range) =>
            (await rt.registry.stats({ companyRut: state.companyRut, type, environment: 'certification' })).ranges.some(
              (r) => r.from === range.from && r.to === range.to && r.sent > 0,
            ),
          isFolioFree: async (folio) => (await folioReceived(rt.sii, { type: type as DocumentType, folio })) === false,
        })
        add(reobtained.cafs)
        missing = required - (await available())
      }
      if (missing > 0) {
        const exactFirst = quota.unrestricted || quota.maxAuthorized === null || quota.maxAuthorized >= missing
        last = exactFirst
          ? await requestCafExact(rt.portal, { type: type as DocumentType, quantity: missing })
          : await requestCafInBatches(rt.portal, { type: type as DocumentType, quantity: missing, initialQuota: quota })
        add(last.cafs)
        if (!last.complete && exactFirst && last.rejection !== null && BATCH_FALLBACK.has(last.rejection)) {
          last = await requestCafInBatches(rt.portal, { type: type as DocumentType, quantity: missing - last.granted })
          add(last.cafs)
        }
        missing = required - (await available())
      }
      if (missing > 0 && last !== null && last.rejection !== null && RATIONING.has(last.rejection)) {
        const unusedInHand = await available()
        if (last.availableFolios === null || last.availableFolios > unusedInHand) {
          await annulFolios(rt.portal, {
            type: type as DocumentType,
            withinDays: ANNUL_WINDOW_DAYS,
            maxRanges: ANNUL_MAX_RANGES,
            exclude: everyHeld().map((h) => h.caf.range),
          })
          last = await requestCafExact(rt.portal, { type: type as DocumentType, quantity: missing })
          add(last.cafs)
          missing = required - (await available())
        }
      }
      // Still missing after the quota means a request was made, so `last` holds its outcome.
      if (missing > 0) throw shortage(type, required, required - missing, last!)
    }
    rt.emit({ step: 'CAF_OK', type })
  }
  const next = await saveState(rt, state, { cafs: [...state.cafs, ...obtained], usedFolios })
  return { state: next, outcome: 'ready', cafs: options.fresh ? obtained : inHand }
}
```

`src/certification/steps.ts` (new file, whole):

```ts
import { SET_KEYS, type CertificationStage, type SetKey } from '../catalogs/certification'
import { DteError, errorMessage } from '../errors'
import {
  advanceStage,
  declareProgress,
  downloadTestSet,
  readProgress,
  type DeclarationEntries,
  type DeclarationEntry,
  type DeclarationOutcome,
  type DeclarationResult,
} from '../portal/certification'
import { queryUploadStatus } from '../sii/status'
import { uploadEnvelope } from '../sii/upload'
import { chileDate } from '../time/chile'
import { heldCafs, registryFolioSource, scopeFor, type HeldCaf } from './folios-step'
import { issueTestSet, type IssuableSetPlan, type IssuedCase } from './issue-set'
import { planCertificationSets } from './set-plan'
import { parseTestSetText } from './set-text'
import {
  runtime,
  saveState,
  type CertificationDependencies,
  type PollingLabel,
  type Runtime,
  type StepResult,
} from './runtime'
import {
  createCertificationState,
  type CertificationState,
  type EnvelopeDiagnosis,
  type SentCase,
  type SentEnvelope,
} from './state'

export type {
  CertificationDependencies,
  CertificationProgressEvent,
  PollingLabel,
  Runtime,
  StepResult,
} from './runtime'
export { runtime, saveState } from './runtime'

const DECLARATION_INITIAL_WAIT_MS = 10000
const DECLARATION_ATTEMPTS = 10
const DECLARATION_INTERVAL_MS = 5000
const SETS_APPROVAL_ATTEMPTS = 5
const SETS_APPROVAL_INTERVAL_MS = 10000
const STAGE_ORDER: readonly CertificationStage[] = [
  'testSets',
  'books',
  'simulation',
  'exchange',
  'printedSamples',
  'compliance',
  'done',
]

const pad = (folio: number): string => String(folio).padStart(6, '0')

/**
 * EN: Downloads the test set, parses it, plans the sets and keeps the text and the plan as artefacts. Downloading
 * generates the set anew at the SII, so a run that already had a plan starts over: everything sent is void.
 * ES: Descarga el set de pruebas, lo parsea, planifica los sets y guarda el texto y el plan como artefactos. Descargar
 * genera el set de nuevo en el SII, así que una corrida que ya tenía plan parte de cero: todo lo enviado queda sin
 * efecto.
 * @throws {DteError} EN: `SII_PORTAL_UNEXPECTED_PAGE` when the text holds no set; the portal codes. ES: `SII_PORTAL_UNEXPECTED_PAGE` si el texto no trae ningún set; los códigos del portal.
 */
export const obtainTestSet = async (
  deps: CertificationDependencies,
  state: CertificationState,
  options: { readonly optionalSets?: readonly string[] } = {},
): Promise<StepResult<'loaded' | 'regenerated'>> => {
  const rt = runtime(deps)
  rt.emit({ step: 'SETS_DOWNLOADING' })
  const downloaded = await downloadTestSet(rt.portal, {
    ...(options.optionalSets === undefined ? {} : { optionalSets: options.optionalSets }),
    ...(state.attentionNumber === undefined ? {} : { previousAttentionNumber: state.attentionNumber }),
  })
  const text = downloaded.text!
  await rt.store.writeArtefact('set-texto.txt', text)
  const sets = parseTestSetText(text)
  if (sets.length === 0)
    throw new DteError('SII_PORTAL_UNEXPECTED_PAGE', {
      operation: 'obtainTestSet',
      step: 'set-text',
      body: text.slice(0, 400),
    })
  const plan = planCertificationSets(sets)
  await rt.store.writeArtefact('estructuras.json', JSON.stringify(plan, null, 2))
  const restart = state.plan !== undefined
  if (restart) rt.emit({ step: 'SETS_REGENERATED' })
  const fresh = createCertificationState(state.companyRut, rt.now())
  const next = await saveState(rt, restart ? { ...fresh, cafs: state.cafs, usedFolios: state.usedFolios } : state, {
    setText: text,
    attentionNumber: sets[0].attentionNumber,
    plan,
    stage: 'testSets',
  })
  rt.emit({ step: 'SETS_LOADED' })
  return { state: next, outcome: restart ? 'regenerated' : 'loaded' }
}

/**
 * EN: The artefact name of one document: `dte-<type>-<folio>.xml` under a directory.
 * ES: El nombre de artefacto de un documento: `dte-<tipo>-<folio>.xml` bajo un directorio.
 */
export const documentArtefactName = (directory: string, type: number, folio: number): string =>
  `${directory}/dtes/dte-${type}-${pad(folio)}.xml`

const sentCase = (issued: IssuedCase): SentCase => {
  const header = issued.document.header
  return {
    caseId: issued.caseId,
    type: issued.type,
    folio: issued.folio,
    issueDate: header.issueDate,
    ...(header.options.transferType === undefined ? {} : { transferType: header.options.transferType }),
    totals: {
      ...(header.totals.netAmount === undefined ? {} : { netAmount: header.totals.netAmount }),
      ...(header.totals.exemptAmount === undefined ? {} : { exemptAmount: header.totals.exemptAmount }),
      ...(header.totals.vatAmount === undefined ? {} : { vatAmount: header.totals.vatAmount }),
      totalAmount: header.totals.totalAmount,
    },
  }
}

/**
 * EN: Marks the folios of issued documents as sent in the registry, whatever the outcome of the send: a time-out may
 * have delivered the envelope, and a folio sent twice rejects the next envelope.
 * ES: Marca los folios de documentos emitidos como enviados en el registro, cualquiera sea el resultado del envío: un
 * timeout pudo haber entregado el sobre, y un folio enviado dos veces rechaza el siguiente sobre.
 */
export const markSent = async (
  rt: Runtime,
  held: readonly HeldCaf[],
  cases: readonly IssuedCase[],
  sent: { readonly trackId?: string; readonly sentAt: string },
): Promise<void> => {
  for (const issued of cases) await rt.registry.markSent(scopeFor(held, issued.type, issued.folio), issued.folio, sent)
}

/**
 * EN: Sends one test set: issues it with the folios of the state's CAFs through the registry, keeps the envelope and
 * every document as artefacts (phase 5a reads them), uploads it, marks the folios sent whatever happened, and records
 * the track id and the Chile date of the send.
 * ES: Envía un set de pruebas: lo emite con los folios de los CAF del estado a través del registro, guarda el sobre y
 * cada documento como artefactos (la fase 5a los lee), lo sube, marca los folios enviados pase lo que pase, y registra
 * el track id y la fecha de Chile del envío.
 * @throws {DteError} EN: `MISSING_FIELD { field: 'plan', kind }` without the set's plan; the 5b-1, folio and upload codes. ES: `MISSING_FIELD { field: 'plan', kind }` sin el plan del set; los códigos de 5b-1, de folios y de envío.
 */
export const sendTestSet = async (
  deps: CertificationDependencies,
  state: CertificationState,
  options: { readonly kind: SetKey },
): Promise<StepResult<'sent'>> => {
  const rt = runtime(deps)
  const plan = state.plan?.[options.kind] as IssuableSetPlan | undefined
  if (plan === undefined) throw new DteError('MISSING_FIELD', { field: 'plan', kind: options.kind })
  rt.emit({ step: 'SET_START', set: options.kind })
  const held = heldCafs(state.cafs, rt.now())
  const issued = await issueTestSet(plan, {
    issuer: rt.issuer,
    receiver: rt.receiver,
    certificate: rt.certificate,
    folios: registryFolioSource(rt.registry, held),
    resolution: rt.resolution,
    now: rt.now,
  })
  await rt.store.writeArtefact(`sets-prueba/envio-set-${SET_FILE_NAMES[options.kind]}.xml`, issued.envelope.xml)
  for (const document of issued.cases)
    await rt.store.writeArtefact(
      documentArtefactName('sets-prueba', document.type, document.folio),
      document.document.xml,
    )
  const sentAt = rt.now().toISOString()
  const usedFolios = [...state.usedFolios, ...issued.cases.map((c) => ({ type: c.type, folio: c.folio }))]
  try {
    const receipt = await uploadEnvelope(rt.sii, { envelope: issued.envelope })
    await markSent(rt, held, issued.cases, { trackId: receipt.trackId, sentAt })
    const sent = { trackId: receipt.trackId, date: chileDate(rt.now()), sentAt, cases: issued.cases.map(sentCase) }
    const next = await saveState(rt, state, { usedFolios, sets: { ...state.sets, [options.kind]: sent } })
    rt.emit({ step: 'SET_OK', set: options.kind, trackId: receipt.trackId })
    return { state: next, outcome: 'sent' }
  } catch (error) {
    await markSent(rt, held, issued.cases, { sentAt })
    await saveState(rt, state, { usedFolios })
    rt.emit({ step: 'SET_ERROR', set: options.kind, error: errorMessage(error) })
    throw error
  }
}

const SET_FILE_NAMES: Readonly<Record<SetKey, string>> = {
  basic: 'basico',
  guide: 'guia',
  exempt: 'exenta',
  purchase: 'compra',
}

const entryOf = (sent: SentEnvelope): { readonly trackId: string; readonly date: string } => ({
  trackId: sent.trackId,
  date: sent.date,
})

/**
 * EN: The SOAP status of every declared envelope, for the diagnosis of a content error: never fatal.
 * ES: El estado SOAP de cada envío declarado, para el diagnóstico de un error de contenido: nunca fatal.
 */
export const diagnose = async (
  rt: Runtime,
  entries: DeclarationEntries,
  prefix: string,
): Promise<Readonly<Record<string, EnvelopeDiagnosis>>> => {
  const diagnosis: Record<string, EnvelopeDiagnosis> = {}
  // The steps build the entries without holes, so every value is an entry.
  for (const [key, entry] of Object.entries(entries) as [string, DeclarationEntry][]) {
    try {
      const status = await queryUploadStatus(rt.sii, { trackId: entry.trackId })
      await rt.store.writeArtefact(`${prefix}-estado-${key}-${entry.trackId}.xml`, status.raw)
      diagnosis[entry.trackId] = { code: status.code, status: status.status, message: status.message }
    } catch (error) {
      rt.portal.logger.warn('certification diagnosis failed', { trackId: entry.trackId, reason: errorMessage(error) })
    }
  }
  return diagnosis
}

/**
 * EN: What the declaration loop ended with.
 * ES: Con qué terminó el ciclo de declaración.
 */
export type DeclarationLoopResult = {
  readonly result: DeclarationResult
  readonly attempts: number
  readonly diagnosis: Readonly<Record<string, EnvelopeDiagnosis>>
}

const hasEmpty = (result: DeclarationResult): boolean =>
  Object.values(result.verification).some((state) => state === 'empty')

/**
 * EN: Declares envelopes as the field does: 10 s first, then up to 10 attempts 5 s apart. "Not processed yet", an
 * unsaved declaration and content errors with empty fields (the SII has not seen the track ids yet) are retried;
 * every declared row empty (the wrong period) stops, unless `retryOnAllRejected` (the simulation, which the portal
 * shows as not declared while it processes); content errors with the fields present are diagnosed through the SOAP
 * status; inconsistent data, a declined or failed declaration stop at once. Every page goes to the artefacts.
 * ES: Declara envíos como lo hace el campo: 10 s primero, luego hasta 10 intentos cada 5 s. "Aún no procesado", una
 * declaración no guardada y errores de contenido con campos vacíos (el SII aún no vio los track id) se reintentan;
 * toda fila declarada vacía (el período equivocado) detiene, salvo `retryOnAllRejected` (la simulación, que el portal
 * muestra sin declarar mientras la procesa); errores de contenido con los campos presentes se diagnostican por el
 * estado SOAP; un dato inconsistente, una declaración declinada o fallida detienen de inmediato. Toda página va a los
 * artefactos.
 */
export const declareWithRetries = async (
  rt: Runtime,
  entries: DeclarationEntries,
  options: { readonly label: PollingLabel; readonly prefix: string; readonly retryOnAllRejected?: boolean },
): Promise<DeclarationLoopResult> => {
  await rt.sleep(DECLARATION_INITIAL_WAIT_MS)
  const attempt = async (n: number): Promise<DeclarationLoopResult> => {
    rt.emit({ step: 'POLLING', attempt: n, max: DECLARATION_ATTEMPTS, label: options.label })
    const result = await declareProgress(rt.portal, { entries })
    await rt.store.writeArtefact(`${options.prefix}-${n}.html`, result.answerHtml)
    await rt.store.writeArtefact(`${options.prefix}-pe_avance2-${n}.html`, result.formHtml)
    const again = async (): Promise<DeclarationLoopResult> => {
      if (n >= DECLARATION_ATTEMPTS) return { result, attempts: n, diagnosis: {} }
      await rt.sleep(DECLARATION_INTERVAL_MS)
      return attempt(n + 1)
    }
    switch (result.outcome) {
      case 'notProcessed':
      case 'notSaved':
        return again()
      case 'contentErrors':
        return hasEmpty(result)
          ? again()
          : { result, attempts: n, diagnosis: await diagnose(rt, entries, options.prefix) }
      case 'allRejected':
        return options.retryOnAllRejected ? again() : { result, attempts: n, diagnosis: {} }
      default:
        return { result, attempts: n, diagnosis: {} }
    }
  }
  return attempt(1)
}

const isGood = (outcome: DeclarationOutcome): boolean => outcome === 'accepted' || outcome === 'inReview'

/**
 * EN: Declares the sets sent so far, with the declaration loop; the outcome and any diagnosis go to the state.
 * ES: Declara los sets enviados hasta ahora, con el ciclo de declaración; el resultado y cualquier diagnóstico van al
 * estado.
 * @throws {DteError} EN: `MISSING_FIELD { field: 'sets' }` with nothing sent; the portal codes. ES: `MISSING_FIELD { field: 'sets' }` sin nada enviado; los códigos del portal.
 */
export const declareTestSets = async (
  deps: CertificationDependencies,
  state: CertificationState,
): Promise<StepResult<DeclarationOutcome>> => {
  const rt = runtime(deps)
  const entries: DeclarationEntries = Object.fromEntries(
    SET_KEYS.flatMap((key) => (state.sets[key] === undefined ? [] : [[key, entryOf(state.sets[key]!)]])),
  )
  if (Object.keys(entries).length === 0) throw new DteError('MISSING_FIELD', { field: 'sets' })
  rt.emit({ step: 'SETS_DECLARING' })
  const { result, diagnosis } = await declareWithRetries(rt, entries, {
    label: 'declaration',
    prefix: 'declaracion-sets',
  })
  if (isGood(result.outcome)) rt.emit({ step: 'SETS_DECLARED' })
  const next = await saveState(rt, state, {
    lastDeclaration: { scope: 'sets', outcome: result.outcome, detail: result.detail, at: rt.now().toISOString() },
    diagnosis: { ...state.diagnosis, ...diagnosis },
  })
  return { state: next, outcome: result.outcome, ...(result.detail === null ? {} : { detail: result.detail }) }
}

/**
 * EN: Waits for the sent sets to be approved: 5 attempts 10 s apart, sleeping first, reading the progress page. Every
 * set approved is approval; a rejected or inconsistent one stops; no set at all is not approval.
 * ES: Espera la aprobación de los sets enviados: 5 intentos cada 10 s, durmiendo primero, leyendo la página de avance.
 * Todos los sets aprobados es aprobación; uno rechazado o inconsistente detiene; ningún set no es aprobación.
 */
export const waitForTestSetsApproval = async (
  deps: CertificationDependencies,
  state: CertificationState,
): Promise<StepResult<'approved' | 'rejected' | 'timedOut'>> => {
  const rt = runtime(deps)
  const wanted = SET_KEYS.filter((key) => state.sets[key] !== undefined)
  for (let attempt = 1; attempt <= SETS_APPROVAL_ATTEMPTS; attempt += 1) {
    await rt.sleep(SETS_APPROVAL_INTERVAL_MS)
    rt.emit({ step: 'POLLING', attempt, max: SETS_APPROVAL_ATTEMPTS, label: 'sets' })
    const report = await readProgress(rt.portal)
    const states = wanted.map((key) => report.states[key])
    const rejected = states.filter((item) => item?.state === 'rejected' || item?.state === 'inconsistent')
    if (rejected.length > 0) {
      rt.emit({ step: 'SETS_REJECTED' })
      return { state, outcome: 'rejected', detail: rejected.map((item) => item!.text).join(' | ') }
    }
    if (wanted.length > 0 && states.every((item) => item?.state === 'approved')) {
      rt.emit({ step: 'SETS_APPROVED' })
      return { state: await saveState(rt, state, { setsApproved: true, stage: 'books' }), outcome: 'approved' }
    }
  }
  return { state, outcome: 'timedOut' }
}

/**
 * EN: The later of the state's stage and the portal's.
 * ES: La más avanzada entre la etapa del estado y la del portal.
 */
export const laterStage = (current: CertificationStage, portal: CertificationStage): CertificationStage =>
  STAGE_ORDER.indexOf(portal) > STAGE_ORDER.indexOf(current) ? portal : current

/**
 * EN: Asks the portal to advance the application and reads where it stands. "Already in that step" is fine; a
 * refusal throws `SII_PORTAL_REJECTED` with `advanceRefused`.
 * ES: Pide al portal avanzar la postulación y lee dónde quedó. "Ya está en ese paso" está bien; una negativa lanza
 * `SII_PORTAL_REJECTED` con `advanceRefused`.
 */
export const advanceToNextStage = async (
  deps: CertificationDependencies,
  state: CertificationState,
): Promise<StepResult<'advanced' | 'unchanged'>> => {
  const rt = runtime(deps)
  rt.emit({ step: 'ADVANCE_WAITING' })
  const answer = await advanceStage(rt.portal)
  if (answer.outcome === 'failed')
    throw new DteError('SII_PORTAL_REJECTED', {
      rejection: 'advanceRefused',
      operation: 'advanceToNextStage',
      portalMessage: answer.message,
    })
  const report = await readProgress(rt.portal)
  rt.emit({ step: 'ADVANCE_DONE', stage: report.stage ?? '' })
  const next = await saveState(rt, state, { stage: laterStage(state.stage, report.stageKey) })
  return { state: next, outcome: answer.outcome, detail: answer.message }
}
```

`src/certification/books.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/certification/books.ts b/src/certification/books.ts
index 938d6c1..240f4d2 100644
--- a/src/certification/books.ts
+++ b/src/certification/books.ts
@@ -3,7 +3,7 @@ import { createPurchaseSalesBook, signPurchaseSalesBook, type SignedPurchaseSale
 import { CERTIFICATION_COUNTERPARTY } from '../catalogs/certification'
 import type { Certificate } from '../certificate/certificate'
 import { DteError } from '../errors'
-import type { BookEntryInput, GuideEntryInput } from '../model/book'
+import type { BookEntryInput, BookTotals, GuideEntryInput } from '../model/book'
 import type { IssuedSet } from './issue-set'
 import type { PurchaseBookPlan } from './set-plan'
 import { bookDocumentTypeOf, type TestBookDocument } from './set-text'
@@ -25,8 +25,69 @@ export type CertificationBookInput = {
   readonly certificate: Certificate
   /** EN: Clock for the book id and signature timestamp. ES: Reloj para el id del libro y la marca de la firma. */
   readonly now?: () => Date
+  /** EN: `total` (default) or `adjustment`, for a period the SII already holds; the guide book is always total. ES: `TipoEnvio` — `total` (por defecto) o `adjustment`, para un período que el SII ya tiene; el libro de guías siempre es total. */
+  readonly submission?: 'total' | 'adjustment'
+  /** EN: Period totals of the earlier submissions, carried forward on an adjustment. ES: Totales del período de los envíos anteriores, arrastrados en un ajuste. */
+  readonly previousTotals?: readonly BookTotals[]
 }
 
+/**
+ * EN: The totals of one issued document, as the books read them.
+ * ES: Los totales de un documento emitido, como los leen los libros.
+ */
+export type BookCaseTotals = {
+  readonly netAmount?: number
+  readonly exemptAmount?: number
+  readonly vatAmount?: number
+  readonly totalAmount: number
+}
+
+/**
+ * EN: One document of the sales book: the issued set's case, or what a run kept of it.
+ * ES: Un documento del libro de ventas: el caso del set emitido, o lo que una corrida guardó de él.
+ */
+export type SalesBookCase = { readonly type: number; readonly folio: number; readonly totals: BookCaseTotals }
+
+/**
+ * EN: One guide of the guide book: the issued set's case, or what a run kept of it.
+ * ES: Una guía del libro de guías: el caso del set emitido, o lo que una corrida guardó de él.
+ */
+export type GuideBookCase = {
+  readonly folio: number
+  readonly issueDate: string
+  readonly transferType?: number
+  readonly totals: BookCaseTotals
+}
+
+/**
+ * EN: A sales-book source that is not the issued set itself: its kind and cases, as a resumed run holds them.
+ * ES: Una fuente de libro de ventas que no es el set emitido: su tipo y sus casos, como los tiene una corrida retomada.
+ */
+export type SalesBookSource = { readonly kind: string; readonly cases: readonly SalesBookCase[] }
+
+/**
+ * EN: A guide-book source that is not the issued set itself.
+ * ES: Una fuente de libro de guías que no es el set emitido.
+ */
+export type GuideBookSource = { readonly kind: string; readonly cases: readonly GuideBookCase[] }
+
+const salesCases = (set: IssuedSet | SalesBookSource): readonly SalesBookCase[] =>
+  'envelope' in set
+    ? set.cases.map((issued) => ({ type: issued.type, folio: issued.folio, totals: issued.document.header.totals }))
+    : set.cases
+
+const guideCases = (set: IssuedSet | GuideBookSource): readonly GuideBookCase[] =>
+  'envelope' in set
+    ? set.cases.map((issued) => ({
+        folio: issued.folio,
+        issueDate: issued.document.header.issueDate,
+        ...(issued.document.header.options.transferType === undefined
+          ? {}
+          : { transferType: issued.document.header.options.transferType }),
+        totals: issued.document.header.totals,
+      }))
+    : set.cases
+
 /**
  * EN: The customer written on the sales and guide books.
  * ES: El cliente escrito en los libros de ventas y de guías.
@@ -87,12 +148,12 @@ const compact = <T extends object>(value: T): T =>
  * @throws {DteError} EN: `INVALID_OPTION` (field `set`) when the set is not the basic one; the phase 3 codes. ES: `INVALID_OPTION` (campo `set`) si el set no es el básico; los códigos de la fase 3.
  */
 export const createCertificationSalesBook = (
-  set: IssuedSet,
+  set: IssuedSet | SalesBookSource,
   input: CertificationSalesBookInput,
 ): SignedPurchaseSalesBook => {
   if (set.kind !== 'basic') throw new DteError('INVALID_OPTION', { field: 'set', kind: set.kind })
-  const entries: BookEntryInput[] = set.cases.map((issued) => {
-    const totals = issued.document.header.totals
+  const entries: BookEntryInput[] = salesCases(set).map((issued) => {
+    const totals = issued.totals
     const sign = issued.type === 61 && input.creditNoteSign === 'negative' ? -1 : 1
     const amount = (value: number | undefined): number => Math.round((value ?? 0) * sign)
     return {
@@ -117,9 +178,10 @@ export const createCertificationSalesBook = (
       resolutionNumber: input.resolution.number,
       operation: 'sale',
       kind: 'monthly',
-      submission: 'total',
+      submission: input.submission ?? 'total',
     },
     entries,
+    ...(input.previousTotals === undefined ? {} : { previousTotals: input.previousTotals }),
     now: input.now?.(),
   })
   return signPurchaseSalesBook(book, input.certificate)
@@ -260,9 +322,10 @@ export const createCertificationPurchaseBook = (
       resolutionNumber: input.resolution.number,
       operation: 'purchase',
       kind: 'monthly',
-      submission: 'total',
+      submission: input.submission ?? 'total',
     },
     entries,
+    ...(input.previousTotals === undefined ? {} : { previousTotals: input.previousTotals }),
     commonUseVatFactor: plan.proportionalityFactor,
     now: input.now?.(),
   })
@@ -282,15 +345,17 @@ const defaultFlag = (index: number): GuideBookCaseFlag => (index === 1 ? 'modifi
  * notificación 3 por defecto, libro `ESPECIAL`, envío `TOTAL`.
  * @throws {DteError} EN: `INVALID_OPTION` (field `set`) when the set is not the guide one; the phase 3 codes. ES: `INVALID_OPTION` (campo `set`) si el set no es el de guías; los códigos de la fase 3.
  */
-export const createCertificationGuideBook = (set: IssuedSet, input: CertificationGuideBookInput): SignedGuideBook => {
+export const createCertificationGuideBook = (
+  set: IssuedSet | GuideBookSource,
+  input: CertificationGuideBookInput,
+): SignedGuideBook => {
   if (set.kind !== 'guide') throw new DteError('INVALID_OPTION', { field: 'set', kind: set.kind })
-  const entries: GuideEntryInput[] = set.cases.map((issued, index) => {
+  const entries: GuideEntryInput[] = guideCases(set).map((issued, index) => {
     const flag = input.caseFlags?.[index] ?? defaultFlag(index)
-    const header = issued.document.header
-    const transferType = header.options.transferType ?? 1
+    const transferType = issued.transferType ?? 1
     if (flag === 'voided')
-      return { folio: issued.folio, transferType, date: header.issueDate, voided: 'guide', totalAmount: 0 }
-    const net = header.totals.netAmount ?? 0
+      return { folio: issued.folio, transferType, date: issued.issueDate, voided: 'guide', totalAmount: 0 }
+    const net = issued.totals.netAmount ?? 0
     const sale =
       transferType === 1
         ? compact({
@@ -298,16 +363,16 @@ export const createCertificationGuideBook = (set: IssuedSet, input: Certificatio
             receiverName: input.receiver.name,
             netAmount: net > 0 ? net : undefined,
             taxRate: net > 0 ? VAT_RATE : undefined,
-            vatAmount: net > 0 ? header.totals.vatAmount : undefined,
+            vatAmount: net > 0 ? issued.totals.vatAmount : undefined,
           })
         : {}
     return compact({
       folio: issued.folio,
       transferType,
-      date: header.issueDate,
+      date: issued.issueDate,
       adjustment: flag === 'modified' ? ('add' as const) : undefined,
       ...sale,
-      totalAmount: header.totals.totalAmount,
+      totalAmount: issued.totals.totalAmount,
     })
   })
   const book = createGuideBook({
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/certification/steps-sets tests/certification/books.test --coverage=false
```

Expected: PASS, 46 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/certification/runtime.ts src/certification/folios-step.ts src/certification/steps.ts src/certification/books.ts tests/support/certification-harness.ts tests/certification/steps-sets.test.ts
```

```bash
git commit -F - <<'MSG'
feat: the certification steps of the test sets (obtain the set, prepare folios, send, declare, wait, advance)

The dependency object and the typed progress events in their own module; obtaining the set and planning it; the folio preparation as the field does it (CAFs in hand, unreceived folios given back, quota, re-obtain, exact or batches, annul as a last resort and never a CAF the run holds); sending a set through the registry with its artefacts; the declaration loop with its retries and SOAP diagnosis; the approval wait; the stage advance. The 5b-1 books accept the cases a run keeps and an adjustment submission.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 5: The books step

`runBooks` (spec 3.6, step 6): the history of the books the SII holds, the period and the first free month below it, the books the portal already shows approved, the four books built from the plan and the sent sets and uploaded with the field's file names, a purchase book the SII already holds resent as an adjustment, the SOAP look that blocks nothing, the declaration together with the four sets, the "every row empty" retries (an adjustment with the totals kept, or the next free period, at most 24 times), the approval wait with the SOAP cross-check every second poll, and the resend of the books the SII refuses.

**Files:**

- Create: `src/certification/books-step.ts`
- Test (create): `tests/certification/books-step.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/certification/books-step.test.ts` (new file, whole):

```ts
import { nextFreePeriod, previousPeriod, runBooks } from '../../src/certification/books-step'
import type { CertificationState, SentCase } from '../../src/certification/state'
import { fullPlan } from '../support/certification-fixtures'
import {
  certificationHarness,
  estUp,
  get,
  MAULLIN,
  post,
  reception,
  repeat,
  sequence,
  stateWith,
  TODAY,
  UPL,
  UPLOAD,
} from '../support/certification-harness'
import {
  bookHistoryPage,
  DECLARATION_ANSWERS,
  declarationFormPage,
  type DeclarationRowSpec,
} from '../support/certification-pages'
import type { FakeReply, FakeRoute, RecordedRequest } from '../support/fake-sii'
import { failure } from '../support/portal'
import { page } from '../support/portal-pages'
import { siiFixture } from '../support/sii-client'

const plan = fullPlan()
const totals = (net: number) => ({
  netAmount: net,
  vatAmount: Math.round(net * 0.19),
  totalAmount: net + Math.round(net * 0.19),
})
const basicCases: SentCase[] = [
  { caseId: 'c-1', type: 33, folio: 1, issueDate: TODAY, totals: totals(1000) },
  { caseId: 'c-2', type: 61, folio: 1, issueDate: TODAY, totals: totals(500) },
]
const guideCases: SentCase[] = [1, 2, 3].map((folio) => ({
  caseId: `g-${folio}`,
  type: 52,
  folio,
  issueDate: TODAY,
  transferType: 1,
  totals: totals(100),
}))
const sets = {
  basic: { trackId: '11', date: TODAY, sentAt: 'x', cases: basicCases },
  guide: { trackId: '12', date: TODAY, sentAt: 'x', cases: guideCases },
}
const BOOK_LABELS = {
  purchaseBook: 'LIBRO DE COMPRAS',
  salesBook: 'LIBRO DE VENTAS',
  guideBook: 'LIBRO DE GUIAS',
  exemptPurchaseBook: 'LIBRO DE COMPRAS PARA EXENTOS',
} as const
type BookLabel = keyof typeof BOOK_LABELS

/** The pe_avance2 rows as `queryCertificationSets` reads them: a bold state, or a hidden `S01`. */
const rowsPage = (states: Partial<Record<BookLabel, string>> = {}): string =>
  page(
    `<table><tr><td><font>SET BASICO</font></td><td><b>REVISADO CONFORME</b></td></tr><tr><td><font>SET GUIA DE DESPACHO</font></td><td><b>REVISADO CONFORME</b></td></tr>${(
      Object.keys(BOOK_LABELS) as BookLabel[]
    )
      .map((key, index) => {
        const state = states[key]
        return `<tr><td><font>${BOOK_LABELS[key]}</font></td><td>${state === undefined ? `<input type=hidden name="EST${index + 5}" value="S01">` : `<b>${state}</b>`}</td></tr>`
      })
      .join('')}</table>`,
  )
/** The pe_avance2 declaration form: approved sets without an input, the books with one (values when given). */
const booksForm = (values: Partial<Record<BookLabel, string>> = {}): string =>
  declarationFormPage([
    { label: 'SET BASICO', state: 'REVISADO CONFORME' },
    { label: 'SET GUIA DE DESPACHO', state: 'REVISADO CONFORME' },
    ...(Object.keys(BOOK_LABELS) as BookLabel[]).map(
      (key, index): DeclarationRowSpec => ({ label: BOOK_LABELS[key], index: index + 1, value: values[key] ?? '' }),
    ),
  ])
const ALL_APPROVED = rowsPage({
  purchaseBook: 'REVISADO CONFORME',
  salesBook: 'REVISADO CONFORME',
  guideBook: 'REVISADO CONFORME',
  exemptPurchaseBook: 'REVISADO CONFORME',
})
const KEPT = booksForm({ purchaseBook: '101', salesBook: '102', guideBook: '103', exemptPurchaseBook: '104' })

const history = (...pages: readonly (string | FakeReply)[]): FakeRoute[] => [
  { url: `${UPL}/DTEauth?7`, reply: repeat({ body: page('auth') }, 10) },
  { url: `${UPL}/QEstLibro*`, reply: pages.map((reply) => (typeof reply === 'string' ? { body: reply } : reply)) },
]
const EMPTY_HISTORY = history(bookHistoryPage([]), bookHistoryPage([]))
const entry = get('pe_avance1', ...repeat(page('entry'), 400))
const avance2 = (pages: readonly string[], fallback: (call: number) => string = () => ALL_APPROVED): FakeRoute => ({
  url: `${MAULLIN}/pe_avance2`,
  method: 'POST',
  reply: sequence(pages, fallback),
})
const uploads = (...replies: readonly FakeReply[]): FakeRoute => ({ url: UPLOAD, method: 'POST', reply: [...replies] })
const fourReceipts = () => uploads(reception('101'), reception('102'), reception('103'), reception('104'))
const estUpAlways = (code: string): FakeRoute => ({
  url: 'https://maullin.sii.cl/DTEWS/QueryEstUp.jws',
  method: 'POST',
  reply: () => estUp(code),
})
const uploadedXml = (request: RecordedRequest): string =>
  request.parts.find((part) => part.fileName !== null)?.value ?? ''
const booksState = (patch: Partial<CertificationState> = {}): CertificationState => stateWith({ plan, sets, ...patch })

test('periods: the month before, and the first free month below an occupied one', () => {
  expect(previousPeriod('2026-01')).toBe('2025-12')
  expect(previousPeriod('2026-11')).toBe('2026-10')
  expect(nextFreePeriod('2026-11', new Set(['2026-11', '2026-10']))).toBe('2026-09')
  expect(nextFreePeriod('2026-11', new Set())).toBe('2026-11')
  const everything = new Set(
    Array.from({ length: 500 }, (_, i) => {
      let p = '2026-11'
      for (let k = 0; k < i; k += 1) p = previousPeriod(p)
      return p
    }),
  )
  expect(nextFreePeriod('2026-11', everything)).toBe('1993-07')
})

test('the happy path: history, period, four books sent and kept, the SOAP look, one declaration with the sets, approval', async () => {
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage(), booksForm(), KEPT, ALL_APPROVED]),
    post('pe_avance3', DECLARATION_ANSWERS.success),
    fourReceipts(),
    estUpAlways('LSO'),
  ])
  const result = await runBooks(harness.deps, booksState())
  expect(result.outcome).toBe('approved')
  const books = result.state.books
  expect(books.period).toBe('2026-11')
  expect(
    Object.fromEntries(
      Object.entries(books.results).map(([key, book]) => [
        key,
        [book.trackId, book.period, book.submission, book.approved],
      ]),
    ),
  ).toEqual({
    purchaseBook: ['101', '2026-11', 'total', true],
    salesBook: ['102', '2026-11', 'total', true],
    guideBook: ['103', '2026-11', 'total', true],
    exemptPurchaseBook: ['104', '2026-11', 'total', true],
  })
  expect(books.accumulated['2026-11'].purchase?.length).toBeGreaterThan(0)
  expect(books.accumulated['2026-11'].sale?.map((row) => row.type)).toEqual([33, 61])
  expect(await harness.store.listArtefacts()).toEqual([
    'declaracion-libros-1.html',
    'declaracion-libros-pe_avance2-1.html',
    'libro-compras-exentos.xml',
    'libro-compras.xml',
    'libro-guias.xml',
    'libro-ventas.xml',
  ])
  const sent = harness.fake.requests.filter((request) => request.url === UPLOAD)
  expect(sent.map((request) => request.parts.find((part) => part.fileName !== null)?.fileName)).toEqual([
    'LibroCV.xml',
    'LibroCV.xml',
    'LibroGuia.xml',
    'LibroCVExentos.xml',
  ])
  expect(uploadedXml(sent[1])).toContain('<TipoOperacion>VENTA')
  expect(harness.posted('pe_avance3')[0]).toMatchObject({
    NUM_ENV1: '101',
    NUM_ENV2: '102',
    NUM_ENV3: '103',
    NUM_ENV4: '104',
  })
  expect(harness.sleeps).toEqual([15000, 15000, 15000, 10000, 15000])
  expect(harness.steps()).toEqual([
    'BOOKS_START',
    'BOOK_SENDING',
    'BOOK_OK',
    'BOOK_SENDING',
    'BOOK_OK',
    'BOOK_SENDING',
    'BOOK_OK',
    'BOOK_SENDING',
    'BOOK_OK',
    'BOOKS_DECLARING',
    'POLLING',
    'POLLING',
    'BOOKS_DONE',
  ])
  expect(harness.events[harness.events.length - 1]).toEqual({
    step: 'BOOKS_DONE',
    books: ['purchaseBook', 'salesBook', 'guideBook', 'exemptPurchaseBook'],
    success: true,
  })
  expect(
    harness
      .urls()
      .filter((url) => url.includes('QEstLibro'))
      .map((url) => /year=(\d+)/.exec(url)![1]),
  ).toEqual(['2026', '2025'])
})

test('a book the portal shows approved is skipped; without an exempt plan there are three books; all approved is done at once', async () => {
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage({ salesBook: 'REVISADO CONFORME' }), booksForm(), KEPT]),
    post('pe_avance3', DECLARATION_ANSWERS.success),
    uploads(reception('101'), reception('103')),
    estUpAlways('EPR'),
  ])
  const { exemptPurchaseBook, ...rest } = plan
  void exemptPurchaseBook
  const result = await runBooks(harness.deps, booksState({ plan: rest }))
  expect(result.outcome).toBe('approved')
  expect(Object.keys(result.state.books.results).sort()).toEqual(['guideBook', 'purchaseBook', 'salesBook'])
  expect(result.state.books.results.salesBook).toEqual({
    trackId: null,
    date: null,
    sentAt: null,
    period: '2026-11',
    submission: 'total',
    approved: true,
  })
  expect(harness.steps().filter((step) => step === 'BOOK_SKIPPED')).toHaveLength(1)
  expect(harness.sleeps).toEqual([15000, 10000, 15000])
  const done = await certificationHarness([
    ...history(
      bookHistoryPage([['2026-11', 'COMPRA', 'Recibido', 'LIBRO', 'MENSUAL', 'a']]),
      new Error('socket hang up'),
      bookHistoryPage([]),
      bookHistoryPage([]),
    ),
    entry,
    avance2([ALL_APPROVED]),
  ])
  const finished = await runBooks(done.deps, booksState())
  expect(finished).toMatchObject({ outcome: 'approved' })
  expect(finished.state.books).toMatchObject({ period: '2026-10', occupiedPeriods: ['2026-11'] })
  expect(done.urls().filter((url) => url === UPLOAD)).toEqual([])
  expect(
    done
      .urls()
      .filter((url) => url.includes('QEstLibro'))
      .map((url) => /year=(\d+)/.exec(url)![1]),
  ).toEqual(['2026', '2025', '2024'])
  expect(done.warnings()).toContain('certification book history failed')
})

test('a book that cannot be built or that the SII refuses leaves the phase incomplete', async () => {
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage()]),
    uploads(reception('102'), reception('104')),
  ])
  const { guide, ...basicOnly } = sets
  void guide
  const { purchaseBook, ...noPurchasePlan } = plan
  void purchaseBook
  const result = await runBooks(harness.deps, booksState({ sets: basicOnly, plan: noPurchasePlan }))
  expect(result).toMatchObject({ outcome: 'incomplete', detail: 'purchaseBook, guideBook' })
  expect(harness.steps().filter((step) => step === 'BOOK_ERROR')).toHaveLength(2)
  expect(result.state.books.results.purchaseBook).toBeUndefined()
  expect(harness.events[harness.events.length - 1]).toEqual({
    step: 'BOOKS_DONE',
    books: ['purchaseBook', 'salesBook', 'guideBook', 'exemptPurchaseBook'],
    success: false,
  })
  const refused = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage()]),
    uploads(
      reception('101'),
      { body: siiFixture('reception-schema-error.xml').replace('cvc-', 'xyz-') },
      reception('103'),
      reception('104'),
    ),
  ])
  const noSets = await runBooks(refused.deps, booksState({ sets: {} }))
  expect(noSets).toMatchObject({ outcome: 'incomplete', detail: 'salesBook, guideBook' })
  expect(noSets.state.books.period).toBe('2026-11')
})

test('nothing left to declare when the only book not approved could not be sent', async () => {
  const threeApproved = page(
    '<table><tr><td><font>LIBRO DE COMPRAS</font></td><td><b>REVISADO CONFORME</b></td></tr><tr><td><font>LIBRO DE VENTAS</font></td><td><b>REVISADO CONFORME</b></td></tr><tr><td><font>LIBRO DE GUIAS</font></td><td><b>REVISADO CONFORME</b></td></tr></table>',
  )
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([threeApproved]),
    uploads({ body: siiFixture('reception-schema-error.xml').replace('cvc-', 'xyz-') }),
  ])
  const result = await runBooks(harness.deps, booksState())
  expect(result).toMatchObject({ outcome: 'rejected', detail: 'noBooks' })
  expect(harness.steps().filter((step) => step === 'BOOK_SKIPPED')).toHaveLength(3)
  expect(harness.sleeps).toEqual([15000])
})

test('a purchase book the SII already holds goes again as an adjustment', async () => {
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([
      rowsPage(),
      booksForm(),
      booksForm(),
      booksForm(),
      booksForm({ purchaseBook: '111', salesBook: '112', guideBook: '113', exemptPurchaseBook: '114' }),
    ]),
    post('pe_avance3', DECLARATION_ANSWERS.success, DECLARATION_ANSWERS.success),
    uploads(
      { body: siiFixture('reception-schema-error.xml') },
      ...[101, 102, 103, 104, 111, 112, 113, 114].map((id) => reception(String(id))),
    ),
    estUpAlways('EPR'),
  ])
  const result = await runBooks(harness.deps, booksState())
  expect(result.outcome).toBe('approved')
  expect(result.state.books.results.purchaseBook).toMatchObject({ trackId: '111', submission: 'adjustment' })
  const sent = harness.fake.requests.filter((request) => request.url === UPLOAD)
  expect(uploadedXml(sent[0])).toContain('<TipoEnvio>TOTAL')
  expect(uploadedXml(sent[1])).toContain('<TipoEnvio>AJUSTE')
  expect(result.state.books.accumulated['2026-11'].purchase).toBeUndefined()
  expect(result.state.books.accumulated['2026-11'].sale).toBeDefined()
  // With only the sales totals kept, the first retry is still an adjustment in the same period.
  expect(harness.events.filter((event) => event.step === 'BOOK_PERIOD_RETRY')).toEqual([
    { step: 'BOOK_PERIOD_RETRY', period: '2026-11', attempt: 1 },
  ])
  expect(uploadedXml(sent[5])).toContain('<TipoEnvio>AJUSTE')
})

test('every row empty: the books go again as adjustments in the same period, then in the next free one', async () => {
  const resent = booksForm({ purchaseBook: '201', salesBook: '202', guideBook: '203', exemptPurchaseBook: '204' })
  const harness = await certificationHarness([
    ...history(
      bookHistoryPage([['2026-10', 'COMPRA', 'Recibido', 'LIBRO', 'MENSUAL', 'a']]),
      bookHistoryPage([]),
      bookHistoryPage([]),
    ),
    entry,
    avance2([rowsPage(), booksForm(), booksForm(), booksForm(), booksForm(), booksForm(), resent]),
    post('pe_avance3', ...repeat(DECLARATION_ANSWERS.success, 3)),
    uploads(...[101, 102, 103, 104, 111, 112, 113, 114, 201, 202, 203, 204].map((id) => reception(String(id)))),
    estUpAlways('EPR'),
  ])
  const result = await runBooks(harness.deps, booksState())
  expect(result.outcome).toBe('approved')
  const retries = harness.events.filter((event) => event.step === 'BOOK_PERIOD_RETRY')
  expect(retries).toEqual([
    { step: 'BOOK_PERIOD_RETRY', period: '2026-11', attempt: 1 },
    { step: 'BOOK_PERIOD_RETRY', period: '2026-09', attempt: 2 },
  ])
  expect(result.state.books).toMatchObject({
    period: '2026-09',
    adjustmentTried: ['2026-11'],
    occupiedPeriods: ['2026-10', '2026-11'],
  })
  const sent = harness.fake.requests.filter((request) => request.url === UPLOAD)
  expect(sent).toHaveLength(12)
  expect(uploadedXml(sent[4])).toContain('<TipoEnvio>AJUSTE')
  expect(uploadedXml(sent[5])).toContain('<TipoEnvio>AJUSTE')
  expect(uploadedXml(sent[6])).toContain('<TipoEnvio>TOTAL')
  expect(uploadedXml(sent[8])).toContain('<PeriodoTributario>2026-09')
  expect(Object.values(result.state.books.results).every((book) => book.period === '2026-09' && book.approved)).toBe(
    true,
  )
})

test('a closed book seen through SOAP after a resend leaves the period and the book behind; the wait resends it later', async () => {
  const state = booksState({ books: { ...booksState().books, adjustmentTried: ['2026-11'] } })
  const pendingGuide = rowsPage({
    purchaseBook: 'REVISADO CONFORME',
    salesBook: 'REVISADO CONFORME',
    exemptPurchaseBook: 'REVISADO CONFORME',
  })
  const after = booksForm({ purchaseBook: '111', salesBook: '112', exemptPurchaseBook: '114' })
  const final = booksForm({ purchaseBook: '111', salesBook: '112', guideBook: '301', exemptPurchaseBook: '114' })
  const soap = {
    url: 'https://maullin.sii.cl/DTEWS/QueryEstUp.jws',
    method: 'POST' as const,
    reply: (request: RecordedRequest) => estUp(request.text.includes('<TrackId>113</TrackId>') ? 'LNC' : 'EPR'),
  }
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage(), booksForm(), booksForm(), booksForm(), after], (call) =>
      call <= 5 + 40 ? pendingGuide : call <= 5 + 40 + 2 ? final : ALL_APPROVED,
    ),
    post('pe_avance3', ...repeat(DECLARATION_ANSWERS.success, 3)),
    uploads(...[101, 102, 103, 104, 111, 112, 113, 114, 301].map((id) => reception(String(id)))),
    soap,
  ])
  const result = await runBooks(harness.deps, state)
  expect(result.outcome).toBe('approved')
  expect(harness.events.filter((event) => event.step === 'BOOK_PERIOD_RETRY')).toEqual([
    { step: 'BOOK_PERIOD_RETRY', period: '2026-10', attempt: 1 },
    { step: 'BOOK_PERIOD_RETRY', period: '2026-10', attempt: 1 },
  ])
  expect(result.state.books.occupiedPeriods).toEqual(['2026-11', '2026-10'])
  expect(result.state.diagnosis?.['113']).toMatchObject({ code: 'LNC', status: 'rejected' })
  expect(result.state.books.results.guideBook).toMatchObject({ trackId: '301', period: '2026-10', approved: true })
  expect(harness.steps().filter((step) => step === 'POLLING').length).toBeGreaterThan(40)
})

test('the SOAP cross-check of the wait: a book the SII rejected while the portal does not even list it', async () => {
  const pending = page(
    '<table><tr><td><font>LIBRO DE VENTAS</font></td><td><b>REVISADO CONFORME</b></td></tr><tr><td><font>LIBRO DE GUIAS</font></td><td><b>REVISADO CONFORME</b></td></tr><tr><td><font>LIBRO DE COMPRAS PARA EXENTOS</font></td><td><b>REVISADO CONFORME</b></td></tr></table>',
  )
  const seen: Record<string, number> = {}
  const soap = {
    url: 'https://maullin.sii.cl/DTEWS/QueryEstUp.jws',
    method: 'POST' as const,
    reply: (request: RecordedRequest) => {
      const id = /<TrackId>(\d+)/.exec(request.text)![1]
      seen[id] = (seen[id] ?? 0) + 1
      return estUp(id === '101' && seen[id] > 3 ? 'LNC' : 'LSO', id)
    },
  }
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage(), booksForm(), KEPT, pending, pending, booksForm()]),
    post('pe_avance3', DECLARATION_ANSWERS.success, DECLARATION_ANSWERS.inconsistent),
    uploads(...[101, 102, 103, 104, 201].map((id) => reception(String(id)))),
    soap,
  ])
  const result = await runBooks(harness.deps, booksState())
  expect(result).toMatchObject({ outcome: 'rejected', detail: 'purchaseBook' })
  expect(result.state.diagnosis?.['101']).toMatchObject({ code: 'LNC', status: 'rejected' })
  expect(harness.steps().filter((step) => step === 'POLLING')).toHaveLength(4)
})

test('a resend in a period with no totals kept goes to the next free period; a resumed run keeps its period', async () => {
  const twoApproved = rowsPage({ purchaseBook: 'REVISADO CONFORME', salesBook: 'REVISADO CONFORME' })
  const guideClosed = rowsPage({
    purchaseBook: 'REVISADO CONFORME',
    salesBook: 'REVISADO CONFORME',
    guideBook: 'LNC',
    exemptPurchaseBook: 'REVISADO CONFORME',
  })
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([
      twoApproved,
      booksForm(),
      booksForm({ guideBook: '103', exemptPurchaseBook: '104' }),
      guideClosed,
      booksForm(),
    ]),
    post('pe_avance3', DECLARATION_ANSWERS.success, DECLARATION_ANSWERS.inconsistent),
    uploads(reception('103'), reception('104'), reception('203')),
    estUpAlways('EPR'),
  ])
  const result = await runBooks(harness.deps, booksState({ books: { ...booksState().books, period: '2026-08' } }))
  expect(result).toMatchObject({ outcome: 'rejected', detail: 'guideBook' })
  expect(harness.events.filter((event) => event.step === 'BOOK_PERIOD_RETRY')).toEqual([
    { step: 'BOOK_PERIOD_RETRY', period: '2026-07', attempt: 1 },
  ])
  expect(result.state.books.results.guideBook).toMatchObject({ trackId: '203', period: '2026-07', submission: 'total' })
  expect(result.state.books.occupiedPeriods).toEqual(['2026-08'])
})

test('the period retries stop after 24 rounds of "every row empty"', async () => {
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage()], () => booksForm()),
    post('pe_avance3', ...repeat(DECLARATION_ANSWERS.success, 25)),
    uploads(...repeat(reception('9'), 4 + 24 * 4)),
    estUpAlways('EPR'),
  ])
  const result = await runBooks(harness.deps, booksState())
  expect(result).toMatchObject({ outcome: 'rejected', detail: 'allRejected' })
  // Each period is tried twice: an adjustment, then the next free period as a total submission.
  expect(harness.events.filter((event) => event.step === 'BOOK_PERIOD_RETRY')).toHaveLength(24)
  expect(result.state.books.adjustmentTried).toHaveLength(12)
  expect(result.state.books.period).toBe('2025-11')
})

test('a SOAP service that keeps failing is given up after ten errors, and the declaration goes on', async () => {
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage(), booksForm(), KEPT, ALL_APPROVED]),
    post('pe_avance3', DECLARATION_ANSWERS.success),
    fourReceipts(),
    {
      url: 'https://maullin.sii.cl/DTEWS/QueryEstUp.jws',
      method: 'POST' as const,
      reply: () => new Error('socket hang up'),
    },
  ])
  const result = await runBooks(harness.deps, booksState())
  expect(result.outcome).toBe('approved')
  expect(harness.warnings().filter((message) => message === 'certification book status failed')).toHaveLength(10)
  expect(harness.sleeps).toEqual([15000, 15000, 15000, 10000, 15000])
})

test('a declaration the portal refuses after the retries ends the phase as rejected', async () => {
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage(), booksForm()]),
    post('pe_avance3', DECLARATION_ANSWERS.contentMismatch),
    fourReceipts(),
    estUpAlways('LSO'),
  ])
  const result = await runBooks(harness.deps, booksState())
  expect(result).toMatchObject({ outcome: 'rejected', detail: 'contentMismatch' })
  expect(harness.events[harness.events.length - 1]).toEqual({
    step: 'BOOKS_DONE',
    books: ['purchaseBook', 'salesBook', 'guideBook', 'exemptPurchaseBook'],
    success: false,
  })
})

test('the approval wait: a refusal on the portal resends the book; a refusal of the second declaration stops; the wait can time out', async () => {
  const lnc = rowsPage({
    purchaseBook: 'LNC',
    salesBook: 'REVISADO CONFORME',
    guideBook: 'REVISADO CONFORME',
    exemptPurchaseBook: 'S25',
  })
  const harness = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage(), booksForm(), KEPT, lnc, booksForm()]),
    post('pe_avance3', DECLARATION_ANSWERS.success, DECLARATION_ANSWERS.inconsistent),
    uploads(...[101, 102, 103, 104, 201].map((id) => reception(String(id)))),
    estUpAlways('EPR'),
  ])
  const result = await runBooks(harness.deps, booksState())
  expect(result).toMatchObject({ outcome: 'rejected', detail: 'purchaseBook' })
  expect(result.state.books.results.purchaseBook).toMatchObject({
    trackId: '201',
    submission: 'adjustment',
    period: '2026-11',
  })
  expect(result.state.lastDeclaration?.outcome).toBe('inconsistent')
  const pending = rowsPage({
    salesBook: 'REVISADO CONFORME',
    guideBook: 'REVISADO CONFORME',
    exemptPurchaseBook: 'REVISADO CONFORME',
  })
  const slow = await certificationHarness([
    ...EMPTY_HISTORY,
    entry,
    avance2([rowsPage(), booksForm(), KEPT], (call) => (call <= 3 + 40 ? pending : booksForm())),
    post('pe_avance3', DECLARATION_ANSWERS.success, DECLARATION_ANSWERS.contentMismatch),
    uploads(...[101, 102, 103, 104, 201].map((id) => reception(String(id)))),
    {
      url: 'https://maullin.sii.cl/DTEWS/QueryEstUp.jws',
      method: 'POST' as const,
      // The look before the declaration takes twelve answers; the first cross-check of the wait then fails.
      reply: [...repeat(estUp('LSO'), 12), { status: 500, body: 'down' }, ...repeat(estUp('LSO'), 200)],
    },
  ])
  const timed = await runBooks(slow.deps, booksState())
  expect(timed).toMatchObject({ outcome: 'timedOut', detail: 'purchaseBook' })
  expect(slow.steps().filter((step) => step === 'POLLING')).toHaveLength(1 + 40 + 1)
})

test('without a plan there is nothing to run', async () => {
  const harness = await certificationHarness([])
  expect((await failure(runBooks(harness.deps, stateWith()))).details).toEqual({ field: 'plan' })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/certification/books-step --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/certification/books-step'`.

- [ ] **Step 3: Write the implementation**

`src/certification/books-step.ts` (new file, whole):

```ts
import {
  BOOK_ARTEFACT_NAMES,
  BOOK_FILE_NAMES,
  BOOK_KEYS,
  MANDATORY_BOOK_KEYS,
  SET_KEYS,
  TEST_SET_PORTAL_NAMES,
  type BookKey,
} from '../catalogs/certification'
import { DteError, errorMessage } from '../errors'
import type { BookTotals } from '../model/book'
import {
  listBookHistory,
  queryCertificationSets,
  type DeclarationEntries,
  type DeclarationOutcome,
} from '../portal/certification'
import type { CertificationSet } from '../portal/pages/certification'
import { queryUploadStatus } from '../sii/status'
import { uploadBook } from '../sii/upload'
import { chileDate } from '../time/chile'
import {
  createCertificationGuideBook,
  createCertificationPurchaseBook,
  createCertificationSalesBook,
  type CertificationBookInput,
} from './books'
import type { BooksState, CertificationState, EnvelopeDiagnosis, SentBook } from './state'
import {
  declareWithRetries,
  runtime,
  saveState,
  type CertificationDependencies,
  type Runtime,
  type StepResult,
} from './steps'

const HISTORY_TIMEOUT_MS = 12000
const HISTORY_EMPTY_YEARS = 2
const HISTORY_FIRST_YEAR = 1990
const MAX_PERIOD_SKIPS = 400
const MAX_PERIOD_RETRIES = 24
const SOAP_WAIT_MS = 15000
const SOAP_PRECHECK_POLLS = 3
const SOAP_RESEND_POLLS = 20
const SOAP_MAX_ERRORS = 10
const APPROVAL_ATTEMPTS = 40
const APPROVAL_INTERVAL_MS = 15000
const CROSS_CHECK_EVERY = 2
// A purchase book the SII already holds for the period: "duplicado", or the schema error it answers instead.
const DUPLICATE = /duplicado|cvc-/i
const APPROVED = /REVISADO CONFORME|S25/
const REJECTED = /LNC|LRH|RECHAZADO|ERROR/
const CLOSED_BOOK = 'LNC'
const ADJUSTABLE: readonly BookKey[] = ['purchaseBook', 'salesBook']

/**
 * EN: How the books phase ended: every wanted book approved; a mandatory book never sent; a declaration or a book the
 * SII refused; the approval wait exhausted.
 * ES: Cómo terminó la fase de libros: todos los libros pedidos aprobados; un libro obligatorio nunca enviado; una
 * declaración o un libro que el SII rechazó; la espera de aprobación agotada.
 */
export type BooksOutcome = 'approved' | 'incomplete' | 'rejected' | 'timedOut'

/**
 * EN: The month before a `YYYY-MM` period.
 * ES: El mes anterior a un período `AAAA-MM`.
 */
export const previousPeriod = (period: string): string => {
  const [year, month] = period.split('-').map(Number)
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`
}

/**
 * EN: The first period at or below `period` the SII does not hold, stepping down month by month, at most 400 times.
 * ES: El primer período en o bajo `period` que el SII no tiene, bajando mes a mes, a lo más 400 veces.
 */
export const nextFreePeriod = (period: string, occupied: ReadonlySet<string>): string => {
  let candidate = period
  for (let skips = 0; occupied.has(candidate) && skips < MAX_PERIOD_SKIPS; skips += 1)
    candidate = previousPeriod(candidate)
  return candidate
}

const monthOf = (date: string): string => date.slice(0, 7)

const rowOf = (rows: readonly CertificationSet[], key: BookKey): CertificationSet | undefined => {
  const name = TEST_SET_PORTAL_NAMES[key]
  return rows.find((row) => row.name.toUpperCase().trim() === name)
}

const withBooks = (state: CertificationState, patch: Partial<BooksState>): Partial<CertificationState> => ({
  books: { ...state.books, ...patch },
})

const sentKeys = (state: CertificationState, wanted: readonly BookKey[]): readonly BookKey[] =>
  wanted.filter((key) => {
    const result = state.books.results[key]
    return result !== undefined && result.trackId !== null && result.approved !== true
  })

const operationOf = (key: BookKey): 'purchase' | 'sale' => (key === 'salesBook' ? 'sale' : 'purchase')

const buildBook = (
  rt: Runtime,
  state: CertificationState,
  key: BookKey,
  period: string,
  submission: 'total' | 'adjustment',
): { readonly xml: string; readonly periodTotals: readonly BookTotals[] | null } => {
  const previous = state.books.accumulated[period]?.[operationOf(key)]
  const input: CertificationBookInput = {
    period,
    issuerRut: rt.issuer.rut,
    senderRut: rt.sii.senderRut,
    resolution: rt.resolution,
    certificate: rt.certificate,
    now: rt.now,
    submission,
    ...(submission === 'adjustment' && previous !== undefined ? { previousTotals: previous } : {}),
  }
  const receiver = { rut: rt.receiver.rut, name: rt.receiver.businessName }
  switch (key) {
    case 'purchaseBook':
    case 'exemptPurchaseBook': {
      const plan = state.plan?.[key]
      if (plan === undefined) throw new DteError('MISSING_FIELD', { field: 'plan', kind: key })
      const book = createCertificationPurchaseBook(plan, input)
      return { xml: book.xml, periodTotals: book.periodTotals }
    }
    case 'salesBook': {
      const set = state.sets.basic
      if (set === undefined) throw new DteError('MISSING_FIELD', { field: 'sets', kind: 'basic' })
      const book = createCertificationSalesBook({ kind: 'basic', cases: set.cases }, { ...input, receiver })
      return { xml: book.xml, periodTotals: book.periodTotals }
    }
    default: {
      const set = state.sets.guide
      if (set === undefined) throw new DteError('MISSING_FIELD', { field: 'sets', kind: 'guide' })
      const book = createCertificationGuideBook({ kind: 'guide', cases: set.cases }, { ...input, receiver })
      return { xml: book.xml, periodTotals: null }
    }
  }
}

const isDuplicate = (error: unknown): boolean =>
  error instanceof DteError && (DUPLICATE.test(error.message) || DUPLICATE.test(JSON.stringify(error.details)))

// Builds, keeps, uploads and records one book. A purchase book the SII already holds for the period goes again as an
// adjustment. A book that cannot be built or that the SII refuses is reported and left out of the results.
const sendBook = async (
  rt: Runtime,
  state: CertificationState,
  key: BookKey,
  period: string,
  submission: 'total' | 'adjustment',
): Promise<CertificationState> => {
  rt.emit({ step: 'BOOK_SENDING', book: key })
  let built: ReturnType<typeof buildBook>
  try {
    built = buildBook(rt, state, key, period, submission)
  } catch (error) {
    rt.emit({ step: 'BOOK_ERROR', book: key, error: errorMessage(error) })
    return state
  }
  await rt.store.writeArtefact(BOOK_ARTEFACT_NAMES[key], built.xml)
  try {
    const receipt = await uploadBook(rt.sii, { xml: built.xml, fileName: BOOK_FILE_NAMES[key] })
    const sent: SentBook = {
      trackId: receipt.trackId,
      date: chileDate(rt.now()),
      sentAt: rt.now().toISOString(),
      period,
      submission,
    }
    // The totals of a total submission of the sales or purchase book are kept for an adjustment of the same period;
    // these two books always have entries, so their totals are never null.
    const accumulated =
      submission === 'total' && ADJUSTABLE.includes(key)
        ? {
            ...state.books.accumulated,
            [period]: { ...state.books.accumulated[period], [operationOf(key)]: built.periodTotals! },
          }
        : state.books.accumulated
    const next = await saveState(
      rt,
      state,
      withBooks(state, { results: { ...state.books.results, [key]: sent }, accumulated }),
    )
    rt.emit({ step: 'BOOK_OK', book: key, trackId: receipt.trackId })
    return next
  } catch (error) {
    if (key === 'purchaseBook' && submission === 'total' && isDuplicate(error))
      return sendBook(rt, state, key, period, 'adjustment')
    rt.emit({ step: 'BOOK_ERROR', book: key, error: errorMessage(error) })
    const { [key]: dropped, ...rest } = state.books.results
    void dropped
    return saveState(rt, state, withBooks(state, { results: rest }))
  }
}

// The SOAP status of the sent books: a wait, then polls 15 s apart. A terminal answer is kept as a diagnosis; with
// `drop`, a rejection takes the book out of the results and, when it is a closed book, marks the period occupied. The
// SII leaves books in LSO far longer than worth waiting, so nothing here blocks the declaration.
const soapCheck = async (
  rt: Runtime,
  state: CertificationState,
  keys: readonly BookKey[],
  polls: number,
  drop: boolean,
): Promise<CertificationState> => {
  let current = state
  const terminal = new Map<BookKey, EnvelopeDiagnosis>()
  let errors = 0
  await rt.sleep(SOAP_WAIT_MS)
  for (let poll = 1; poll <= polls && errors < SOAP_MAX_ERRORS; poll += 1) {
    for (const key of keys) {
      if (terminal.has(key) || errors >= SOAP_MAX_ERRORS) continue
      // Only sent books reach here, so each has a track id.
      const trackId = current.books.results[key]!.trackId!
      try {
        const status = await queryUploadStatus(rt.sii, { trackId })
        errors = 0
        if (status.status === 'pending' || status.status === 'queryError') continue
        terminal.set(key, { code: status.code, status: status.status, message: status.message })
      } catch (error) {
        errors += 1
        rt.portal.logger.warn('certification book status failed', { book: key, reason: errorMessage(error) })
      }
    }
    if (keys.every((key) => terminal.has(key))) break
    if (poll < polls) await rt.sleep(SOAP_WAIT_MS)
  }
  for (const [key, diagnosis] of terminal) {
    const result = current.books.results[key]!
    const rejected = drop && diagnosis.status === 'rejected'
    const { [key]: dropped, ...rest } = current.books.results
    void dropped
    current = await saveState(rt, current, {
      diagnosis: { ...current.diagnosis, [result.trackId!]: diagnosis },
      ...withBooks(current, {
        results: rejected ? rest : current.books.results,
        occupiedPeriods:
          rejected && diagnosis.code === CLOSED_BOOK && !current.books.occupiedPeriods.includes(result.period)
            ? [...current.books.occupiedPeriods, result.period]
            : current.books.occupiedPeriods,
      }),
    })
  }
  return current
}

const declareBooks = async (
  rt: Runtime,
  state: CertificationState,
  wanted: readonly BookKey[],
): Promise<{
  readonly state: CertificationState
  readonly outcome: DeclarationOutcome
  readonly detail: string | null
}> => {
  const entries: Record<string, { trackId: string; date: string }> = {}
  for (const key of sentKeys(state, wanted)) {
    const result = state.books.results[key]!
    entries[key] = { trackId: result.trackId!, date: result.date! }
  }
  if (Object.keys(entries).length === 0) return { state, outcome: 'declined', detail: 'noBooks' }
  // The four sets go with the books: the portal resets to S01 any row the declaration leaves empty.
  for (const key of SET_KEYS) {
    const set = state.sets[key]
    if (set !== undefined) entries[key] = { trackId: set.trackId, date: set.date }
  }
  rt.emit({ step: 'BOOKS_DECLARING' })
  const { result, diagnosis } = await declareWithRetries(rt, entries as DeclarationEntries, {
    label: 'books',
    prefix: 'declaracion-libros',
  })
  const next = await saveState(rt, state, {
    lastDeclaration: { scope: 'books', outcome: result.outcome, detail: result.detail, at: rt.now().toISOString() },
    diagnosis: { ...state.diagnosis, ...diagnosis },
  })
  return { state: next, outcome: result.outcome, detail: result.detail }
}

const isGood = (outcome: DeclarationOutcome): boolean => outcome === 'accepted' || outcome === 'inReview'

type Wait = {
  readonly state: CertificationState
  readonly approved: boolean
  readonly failed: readonly BookKey[]
  readonly timedOut: boolean
}

// 40 polls of the portal 15 s apart, sleeping first; every second poll the SOAP status of the pending books, because
// the portal shows S21 forever for a closed book. A rejection ends the wait; the books still pending after the last
// poll count as rejected uploads.
const waitForBooksApproval = async (
  rt: Runtime,
  state: CertificationState,
  wanted: readonly BookKey[],
): Promise<Wait> => {
  let current = state
  const pending = new Set(wanted.filter((key) => current.books.results[key]?.approved !== true))
  const failed: BookKey[] = []
  for (let attempt = 1; attempt <= APPROVAL_ATTEMPTS; attempt += 1) {
    await rt.sleep(APPROVAL_INTERVAL_MS)
    rt.emit({ step: 'POLLING', attempt, max: APPROVAL_ATTEMPTS, label: 'books' })
    const rows = (await queryCertificationSets(rt.portal)).sets
    for (const key of [...pending]) {
      const status = rowOf(rows, key)?.status ?? ''
      if (APPROVED.test(status)) {
        pending.delete(key)
        current = await saveState(
          rt,
          current,
          withBooks(current, {
            results: { ...current.books.results, [key]: { ...current.books.results[key]!, approved: true } },
          }),
        )
      } else if (REJECTED.test(status)) {
        pending.delete(key)
        failed.push(key)
      }
    }
    if (attempt % CROSS_CHECK_EVERY === 0)
      for (const key of [...pending]) {
        const trackId = current.books.results[key]?.trackId
        if (trackId === undefined || trackId === null) continue
        const status = await queryUploadStatus(rt.sii, { trackId }).catch(() => null)
        if (status?.status === 'rejected') {
          pending.delete(key)
          failed.push(key)
          current = await saveState(rt, current, {
            diagnosis: {
              ...current.diagnosis,
              [trackId]: { code: status.code, status: status.status, message: status.message },
            },
          })
        }
      }
    if (failed.length > 0) return { state: current, approved: false, failed, timedOut: false }
    if (pending.size === 0) return { state: current, approved: true, failed: [], timedOut: false }
  }
  return { state: current, approved: false, failed: [...pending], timedOut: true }
}

// Resends books in the period they failed as adjustments (the sales and purchase books, once per period, when their
// totals are kept) or in the next free period as total submissions; then the SOAP status, which may close a period.
const resendBooks = async (
  rt: Runtime,
  state: CertificationState,
  keys: readonly BookKey[],
  attempt: number,
): Promise<CertificationState> => {
  const period = state.books.period!
  const totals = state.books.accumulated[period]
  const adjust =
    totals !== undefined &&
    (totals.purchase !== undefined || totals.sale !== undefined) &&
    !state.books.adjustmentTried.includes(period)
  let current = state
  if (adjust) {
    rt.emit({ step: 'BOOK_PERIOD_RETRY', period, attempt })
    current = await saveState(
      rt,
      current,
      withBooks(current, { adjustmentTried: [...current.books.adjustmentTried, period] }),
    )
    for (const key of keys)
      current = await sendBook(rt, current, key, period, ADJUSTABLE.includes(key) ? 'adjustment' : 'total')
  } else {
    const occupied = new Set([...current.books.occupiedPeriods, period])
    const next = nextFreePeriod(previousPeriod(period), occupied)
    rt.emit({ step: 'BOOK_PERIOD_RETRY', period: next, attempt })
    current = await saveState(rt, current, withBooks(current, { period: next, occupiedPeriods: [...occupied] }))
    for (const key of keys) current = await sendBook(rt, current, key, next, 'total')
  }
  return soapCheck(rt, current, sentKeys(current, keys), SOAP_RESEND_POLLS, true)
}

/**
 * EN: The books phase, as the field runs it. The history of books the SII holds (year by year, until two empty
 * years) marks the occupied periods; the period is the month the sets were issued in, or the first free month below
 * it. A book the portal already shows approved is skipped. The purchase, sales, guide and (with a plan) exempt
 * purchase books are built from the plan and the sent sets, kept as artefacts and uploaded; a purchase book the SII
 * already holds goes again as an adjustment. With the three mandatory books sent or skipped: the SOAP status is read
 * for 45 s without blocking anything, the books are declared together with the four sets, and while every row comes
 * back empty (the wrong period) the books are resent, as adjustments with the totals kept or in the next free
 * period, at most 24 times. Then the approval wait: 40 polls 15 s apart with the SOAP status every second poll; the
 * books the SII refuses are resent the same way, at most 24 times. The result says whether every wanted book is
 * approved; each book's approval is in the state.
 * ES: La fase de libros, como la corre el campo. El historial de libros que tiene el SII (año a año, hasta dos años
 * vacíos) marca los períodos ocupados; el período es el mes en que se emitieron los sets, o el primer mes libre bajo
 * él. Un libro que el portal ya muestra aprobado se omite. Los libros de compras, ventas, guías y (con plan) compras
 * para exentos se arman desde el plan y los sets enviados, se guardan como artefactos y se suben; un libro de compras
 * que el SII ya tiene va de nuevo como ajuste. Con los tres libros obligatorios enviados u omitidos: se lee el estado
 * SOAP por 45 s sin bloquear nada, los libros se declaran junto con los cuatro sets, y mientras toda fila vuelva vacía
 * (el período equivocado) los libros se reenvían, como ajuste con los totales guardados o en el siguiente período
 * libre, a lo más 24 veces. Luego la espera de aprobación: 40 consultas cada 15 s con el estado SOAP cada dos; los
 * libros que el SII rechaza se reenvían del mismo modo, a lo más 24 veces. El resultado dice si todo libro pedido está
 * aprobado; la aprobación de cada libro queda en el estado.
 * @throws {DteError} EN: `MISSING_FIELD { field: 'plan' }` without a plan; the portal and upload codes that are not a book's refusal. ES: `MISSING_FIELD { field: 'plan' }` sin plan; los códigos del portal y de envío que no sean el rechazo de un libro.
 */
export const runBooks = async (
  deps: CertificationDependencies,
  state: CertificationState,
): Promise<StepResult<BooksOutcome>> => {
  const rt = runtime(deps)
  if (state.plan === undefined) throw new DteError('MISSING_FIELD', { field: 'plan' })
  rt.emit({ step: 'BOOKS_START' })
  const wanted = BOOK_KEYS.filter((key) => key !== 'exemptPurchaseBook' || state.plan?.exemptPurchaseBook !== undefined)
  const occupied = new Set(state.books.occupiedPeriods)
  const thisYear = Number(chileDate(rt.now()).slice(0, 4))
  let emptyYears = 0
  for (let year = thisYear; year >= HISTORY_FIRST_YEAR && emptyYears < HISTORY_EMPTY_YEARS; year -= 1) {
    try {
      const history = await listBookHistory(rt.portal, { year }, { timeoutMs: HISTORY_TIMEOUT_MS })
      for (const period of history.occupiedPeriods) occupied.add(period)
      emptyYears = history.entries.length === 0 ? emptyYears + 1 : 0
    } catch (error) {
      // A year that cannot be read is skipped; it counts as empty so a failing portal does not take the scan to 1990.
      rt.portal.logger.warn('certification book history failed', { year, reason: errorMessage(error) })
      emptyYears += 1
    }
  }
  const base = state.books.period ?? monthOf(state.sets.basic?.date ?? chileDate(rt.now()))
  const period = nextFreePeriod(base, occupied)
  let current = await saveState(rt, state, withBooks(state, { period, occupiedPeriods: [...occupied] }))
  const rows = (await queryCertificationSets(rt.portal)).sets
  for (const key of wanted) {
    if (!(rowOf(rows, key)?.status.includes('REVISADO CONFORME') ?? false)) continue
    rt.emit({ step: 'BOOK_SKIPPED', book: key })
    const kept = current.books.results[key] ?? {
      trackId: null,
      date: null,
      sentAt: null,
      period,
      submission: 'total' as const,
    }
    current = await saveState(
      rt,
      current,
      withBooks(current, { results: { ...current.books.results, [key]: { ...kept, approved: true } } }),
    )
  }
  for (const key of wanted) {
    if (current.books.results[key]?.approved === true) continue
    current = await sendBook(rt, current, key, period, 'total')
  }
  const covered = (key: BookKey): boolean => {
    const result = current.books.results[key]
    return result !== undefined && (result.approved === true || result.trackId !== null)
  }
  if (!MANDATORY_BOOK_KEYS.every(covered)) {
    rt.emit({ step: 'BOOKS_DONE', books: wanted, success: false })
    return {
      state: current,
      outcome: 'incomplete',
      detail: MANDATORY_BOOK_KEYS.filter((key) => !covered(key)).join(', '),
    }
  }
  if (wanted.every((key) => current.books.results[key]?.approved === true)) {
    rt.emit({ step: 'BOOKS_DONE', books: wanted, success: true })
    return { state: current, outcome: 'approved' }
  }
  current = await soapCheck(rt, current, sentKeys(current, wanted), SOAP_PRECHECK_POLLS, false)
  let declaration = await declareBooks(rt, current, wanted)
  current = declaration.state
  for (let retry = 1; declaration.outcome === 'allRejected' && retry <= MAX_PERIOD_RETRIES; retry += 1) {
    current = await resendBooks(
      rt,
      current,
      wanted.filter((key) => current.books.results[key]?.approved !== true),
      retry,
    )
    declaration = await declareBooks(rt, current, wanted)
    current = declaration.state
  }
  if (!isGood(declaration.outcome)) {
    rt.emit({ step: 'BOOKS_DONE', books: wanted, success: false })
    return { state: current, outcome: 'rejected', detail: declaration.detail ?? declaration.outcome }
  }
  let wait = await waitForBooksApproval(rt, current, wanted)
  current = wait.state
  for (let retry = 1; !wait.approved && wait.failed.length > 0 && retry <= MAX_PERIOD_RETRIES; retry += 1) {
    current = await resendBooks(rt, current, wait.failed, retry)
    declaration = await declareBooks(rt, current, wanted)
    current = declaration.state
    if (!isGood(declaration.outcome)) break
    wait = await waitForBooksApproval(rt, current, wanted)
    current = wait.state
  }
  const approved = wanted.every((key) => current.books.results[key]?.approved === true)
  rt.emit({ step: 'BOOKS_DONE', books: wanted, success: approved })
  if (approved) return { state: current, outcome: 'approved' }
  // Not approved means the last wait named the books it gave up on.
  return { state: current, outcome: wait.timedOut ? 'timedOut' : 'rejected', detail: wait.failed.join(', ') }
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/certification/books-step --coverage=false
```

Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/certification/books-step.ts tests/certification/books-step.test.ts
```

```bash
git commit -F - <<'MSG'
feat: the certification books step (history, period, books, adjustment and closed-book retries, approval wait)

The books phase as the field runs it: the history of the books the SII holds marks the occupied periods, the period is the month the sets were issued in or the first free month below it, the books the portal already shows approved are skipped, the four books are built from the plan and the sent sets and uploaded, a purchase book the SII already holds goes again as an adjustment, the SOAP status is read without blocking anything, the books are declared together with the sets, every row empty resends them as adjustments or in the next free period, and the approval wait cross-checks the SOAP status every second poll.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 6: The simulation, the compliance and the runner

`sendSimulation` (fresh CAFs, every case again, the artefacts), `declareSimulation` (skipped at the exchange, "every row empty" retried), `waitForSimulationApproval` (30 polls, the confirmation of an approved simulation, the SOAP verdict after the polls) and `declareComplianceFinal` (spec 3.6, 8 to 11); `runCertification` (spec 3.7), which chains every step in the field's order from the saved state, stops at the exchange for phase 5c, and makes the irreversible declaration of compliance only with `declareCompliance: true`.

**Files:**

- Create: `src/certification/runner.ts`
- Modify: `src/certification/steps.ts`
- Test (create): `tests/certification/steps-simulation.test.ts`
- Test (create): `tests/certification/runner.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/certification/steps-simulation.test.ts` (new file, whole):

```ts
import {
  declareComplianceFinal,
  declareSimulation,
  sendSimulation,
  waitForSimulationApproval,
} from '../../src/certification/steps'
import { fullPlan } from '../support/certification-fixtures'
import {
  certificationHarness,
  estUp,
  estUpRoute,
  get,
  MAULLIN,
  post,
  reception,
  repeat,
  sequence,
  stampingRoutes,
  stateWith,
  TODAY,
  uploadRoute,
} from '../support/certification-harness'
import {
  ADVANCE_ANSWERS,
  COMPLIANCE_BLOCKED,
  COMPLIANCE_DECLARED,
  COMPLIANCE_ENTRY,
  COMPLIANCE_FORM,
  COMPLIANCE_UNCONFIRMED,
  DECLARATION_ANSWERS,
  declarationFormPage,
  progressPage,
  STANDARD_ROWS,
} from '../support/certification-pages'
import { failure } from '../support/portal'
import { page } from '../support/portal-pages'

const plan = fullPlan()
const entry = get('pe_avance1', ...repeat(page('entry'), 200))
const avance5 = get('pe_avance5', ...repeat(page('p5'), 100))
const simulation = { trackId: '777', date: TODAY, sentAt: 'x' }
const simRow = (value = '') => [{ label: 'SET DE SIMULACION', index: 1, value }, ...STANDARD_ROWS.slice(1)]
const SIM_FORM = declarationFormPage(simRow())
const SIM_KEPT = declarationFormPage(simRow('777'))
const avance2 = (pages: readonly string[], fallback: (call: number) => string = () => SIM_KEPT) => ({
  url: `${MAULLIN}/pe_avance2`,
  method: 'POST' as const,
  reply: sequence(pages, fallback),
})
const avance6 = (pages: readonly string[], fallback: (call: number) => string) => ({
  url: `${MAULLIN}/pe_avance6`,
  method: 'POST' as const,
  reply: sequence(pages, fallback),
})
const AT_EXCHANGE = progressPage('INTERCAMBIO', { 'SET SIMULACION': 'REVISADO CONFORME' })
const IN_SIMULATION = progressPage('SIMULACION', { 'SET SIMULACION': 'EN REVISION' })

describe('sendSimulation', () => {
  test('fresh CAFs for every type, one envelope with every case, the artefacts, the send', async () => {
    const harness = await certificationHarness([...stampingRoutes(), uploadRoute(reception('777'))])
    const result = await sendSimulation(harness.deps, stateWith({ plan, cafs: [] }))
    expect(result.outcome).toBe('sent')
    expect(result.state.simulation).toEqual({ trackId: '777', date: TODAY, sentAt: '2026-11-15T18:30:00.000Z' })
    expect(result.state.cafs).toHaveLength(6)
    expect(result.state.usedFolios.length).toBeGreaterThan(10)
    const names = await harness.store.listArtefacts()
    expect(names).toContain('simulacion/envio-simulacion.xml')
    expect(names).toContain('simulacion/dtes/dte-33-000001.xml')
    expect(harness.steps().filter((step) => step === 'CAF_OK')).toHaveLength(6)
    expect(harness.steps().slice(-2)).toEqual(['SIM_SENDING', 'SIM_OK'])
    expect(harness.events[0]).toEqual({ step: 'SIM_START' })
  })

  test('the sets’ CAFs are never reused, and a failed send still marks the folios', async () => {
    const harness = await certificationHarness([...stampingRoutes(), uploadRoute({ status: 500, body: 'down' })])
    const before = stateWith({ plan, cafs: [] })
    const error = await failure(sendSimulation(harness.deps, before))
    expect(error.code).toBe('SII_HTTP_ERROR')
    const saved = (await harness.store.load())!
    expect(saved.simulation).toBeUndefined()
    expect(saved.cafs).toHaveLength(6)
    expect(saved.usedFolios.length).toBeGreaterThan(10)
    const stats = await harness.registry.stats({ companyRut: '76543210-3', type: 33, environment: 'certification' })
    expect(stats.totalSent).toBe(plan.basic!.invoices.length)
    expect((await failure(sendSimulation(harness.deps, stateWith()))).details).toEqual({ field: 'plan' })
  })
})

describe('declareSimulation', () => {
  test('already at the exchange: nothing to declare', async () => {
    const harness = await certificationHarness([
      entry,
      avance2([page('x')]),
      avance5,
      avance6([AT_EXCHANGE], () => AT_EXCHANGE),
    ])
    const result = await declareSimulation(harness.deps, stateWith({ simulation, stage: 'simulation' }))
    expect(result).toMatchObject({ outcome: 'skipped', detail: 'INTERCAMBIO' })
    expect(result.state.stage).toBe('exchange')
    expect(harness.steps()).toEqual([])
  })

  test('declared with the simulation flag: every row empty is retried', async () => {
    const harness = await certificationHarness([
      entry,
      avance2([page('x'), SIM_FORM, SIM_FORM, SIM_FORM, SIM_KEPT]),
      avance5,
      avance6([IN_SIMULATION], () => IN_SIMULATION),
      post('pe_avance3', DECLARATION_ANSWERS.success, DECLARATION_ANSWERS.success),
    ])
    const result = await declareSimulation(harness.deps, stateWith({ simulation }))
    expect(result.outcome).toBe('accepted')
    expect(result.state.lastDeclaration).toMatchObject({ scope: 'simulation', outcome: 'accepted' })
    expect(harness.sleeps).toEqual([10000, 5000])
    expect(harness.steps()).toEqual(['SIM_DECLARING', 'POLLING', 'POLLING'])
    expect(await harness.store.listArtefacts()).toContain('declaracion-simulacion-2.html')
    expect((await failure(declareSimulation(harness.deps, stateWith()))).details).toEqual({ field: 'simulation' })
  })
})

describe('waitForSimulationApproval', () => {
  const reading = (
    progress: readonly string[],
    fallback: string,
    more: readonly string[] = [],
    extra: Parameters<typeof certificationHarness>[0] = [],
  ) =>
    certificationHarness([
      entry,
      avance2([page('x'), ...more], () => page('x')),
      avance5,
      avance6(progress, () => fallback),
      ...extra,
    ])

  test('the exchange reached on the first poll: done at once', async () => {
    const harness = await reading([AT_EXCHANGE], AT_EXCHANGE)
    const result = await waitForSimulationApproval(harness.deps, stateWith({ simulation, stage: 'simulation' }))
    expect(result.outcome).toBe('done')
    expect(result.state).toMatchObject({ stage: 'exchange', simulation: { ...simulation, confirmed: true } })
    expect(harness.sleeps).toEqual([])
    expect(harness.steps()).toEqual(['POLLING', 'SIM_DONE'])
  })

  test('an approved simulation awaiting its confirmation is declared once more', async () => {
    const offer = progressPage('SIMULACION', { 'SET SIMULACION': 'REVISADO CONFORME' }, { confirm: true })
    const harness = await certificationHarness([
      entry,
      avance2([page('x'), SIM_FORM, SIM_KEPT, page('x')], () => page('x')),
      avance5,
      avance6([offer, AT_EXCHANGE], () => AT_EXCHANGE),
      post('pe_avance3', DECLARATION_ANSWERS.success),
    ])
    const result = await waitForSimulationApproval(harness.deps, stateWith({ simulation }))
    expect(result.outcome).toBe('confirmed')
    expect(result.state).toMatchObject({ stage: 'exchange', simulation: { confirmed: true } })
    expect(harness.posted('pe_avance3')[0]).toMatchObject({ NUM_ENV1: '777' })
    expect(harness.sleeps).toEqual([])
  })

  test('a confirmation the portal does not take yet is polled again', async () => {
    const offer = progressPage('SIMULACION', { 'SET SIMULACION': 'EN REVISION' }, { confirm: true })
    const harness = await certificationHarness([
      entry,
      avance2([page('x'), SIM_FORM, SIM_KEPT, page('x'), page('x')], () => page('x')),
      avance5,
      avance6([offer, offer, AT_EXCHANGE], () => AT_EXCHANGE),
      post('pe_avance3', DECLARATION_ANSWERS.success),
    ])
    const result = await waitForSimulationApproval(harness.deps, stateWith({ simulation }))
    expect(result.outcome).toBe('done')
    expect(harness.sleeps).toEqual([10000])
  })

  test('the state of the simulation row: approved is done, rejected stops', async () => {
    const approved = await reading([progressPage('SIMULACION', { 'SET SIMULACION': 'REVISADO CONFORME' })], AT_EXCHANGE)
    await expect(waitForSimulationApproval(approved.deps, stateWith({ simulation }))).resolves.toMatchObject({
      outcome: 'done',
    })
    const rejected = await reading(
      [progressPage('SIMULACION', { 'SET SIMULACION': 'ENVIO CON ERRORES O REPAROS' })],
      AT_EXCHANGE,
    )
    await expect(waitForSimulationApproval(rejected.deps, stateWith({ simulation }))).resolves.toMatchObject({
      outcome: 'rejected',
      detail: 'ENVIO CON ERRORES O REPAROS',
    })
  })

  test('thirty polls, then the SOAP status decides: rejected, pending, or unreachable', async () => {
    const rejected = await reading([], IN_SIMULATION, [], [estUpRoute(estUp('RFR', '777'))])
    const result = await waitForSimulationApproval(rejected.deps, stateWith({ simulation }))
    expect(result).toMatchObject({ outcome: 'rejected', detail: 'RFR: Envio Procesado' })
    expect(result.state.diagnosis?.['777']).toMatchObject({ code: 'RFR', status: 'rejected' })
    expect(rejected.sleeps).toHaveLength(30)
    expect(rejected.steps().filter((step) => step === 'POLLING')).toHaveLength(30)
    const pending = await reading([], IN_SIMULATION, [], [estUpRoute(estUp('LSO', '777'))])
    await expect(waitForSimulationApproval(pending.deps, stateWith({ simulation }))).resolves.toMatchObject({
      outcome: 'timedOut',
    })
    const down = await reading([], IN_SIMULATION, [], [estUpRoute({ status: 500, body: 'down' })])
    await expect(waitForSimulationApproval(down.deps, stateWith({ simulation }))).resolves.toMatchObject({
      outcome: 'timedOut',
    })
    expect((await failure(waitForSimulationApproval(down.deps, stateWith()))).details).toEqual({ field: 'simulation' })
  })
})

describe('declareComplianceFinal', () => {
  const routes = (second: string, third?: string, final?: string) => [
    entry,
    avance2([], () => declarationFormPage(STANDARD_ROWS)),
    post('pe_avance4', ADVANCE_ANSWERS.unchanged),
    avance5,
    avance6([], () => progressPage('DOCUMENTOS IMPRESOS', {})),
    get('pe_avance7', COMPLIANCE_ENTRY),
    post('pe_avance8', second, ...(third === undefined ? [] : [third])),
    ...(final === undefined ? [] : [post('pe_avance9', final)]),
  ]

  test('declared: the run is done and a previous block is forgotten', async () => {
    const harness = await certificationHarness(routes(COMPLIANCE_FORM, undefined, COMPLIANCE_DECLARED))
    const result = await declareComplianceFinal(harness.deps, stateWith({ stage: 'printedSamples', blocked: 'antes' }))
    expect(result).toMatchObject({ outcome: 'declared', detail: 'Su Declaración de Cumplimiento ha sido efectuada' })
    expect(result.state.stage).toBe('done')
    expect(result.state.blocked).toBeUndefined()
    expect(harness.steps()).toEqual(['ADVANCE_WAITING', 'ADVANCE_DONE', 'CERT_DONE'])
    expect(await harness.store.load()).toEqual(result.state)
  })

  test('blocked: the sentence stays in the state', async () => {
    const harness = await certificationHarness(routes(COMPLIANCE_BLOCKED))
    const result = await declareComplianceFinal(harness.deps, stateWith({ stage: 'printedSamples' }))
    expect(result.outcome).toBe('blocked')
    expect(result.state).toMatchObject({ stage: 'compliance', blocked: expect.stringContaining('no ha finalizado') })
  })

  test('a final page that does not confirm is unexpected', async () => {
    const harness = await certificationHarness(routes(COMPLIANCE_FORM, undefined, COMPLIANCE_UNCONFIRMED))
    const error = await failure(declareComplianceFinal(harness.deps, stateWith({ stage: 'printedSamples' })))
    expect(error.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect(error.details).toMatchObject({ step: 'pe_avance9' })
  })
})
```

`tests/certification/runner.test.ts` (new file, whole):

```ts
import { runCertification } from '../../src/certification/runner'
import type { CertificationState } from '../../src/certification/state'
import { fullPlan } from '../support/certification-fixtures'
import {
  certificationCafXmls,
  certificationHarness,
  get,
  MAULLIN,
  post,
  reception,
  repeat,
  sequence,
  stampingRoutes,
  stateWith,
  TODAY,
  UPL,
  uploadRoute,
} from '../support/certification-harness'
import {
  ADVANCE_ANSWERS,
  bookHistoryPage,
  COMPLIANCE_BLOCKED,
  COMPLIANCE_DECLARED,
  COMPLIANCE_ENTRY,
  COMPLIANCE_FORM,
  DECLARATION_ANSWERS,
  declarationFormPage,
  NOT_ENROLLED,
  progressPage,
  SET_ENTRY,
  setDownloadPage,
  setGenerationForm,
  STANDARD_ROWS,
} from '../support/certification-pages'
import { failure } from '../support/portal'
import { page } from '../support/portal-pages'
import { ISSUER_RUT } from '../support/fixtures'

const plan = fullPlan()
const entry = get('pe_avance1', ...repeat(page('entry'), 400))
const avance5 = get('pe_avance5', ...repeat(page('p5'), 100))
const avance2 = (pages: readonly string[], fallback: (call: number) => string = () => page('x')) => ({
  url: `${MAULLIN}/pe_avance2`,
  method: 'POST' as const,
  reply: sequence(pages, fallback),
})
const avance6 = (pages: readonly string[], fallback: (call: number) => string) => ({
  url: `${MAULLIN}/pe_avance6`,
  method: 'POST' as const,
  reply: sequence(pages, fallback),
})
const setRoutes = () => [
  get('pe_generar', SET_ENTRY),
  post('pe_generar1', setGenerationForm()),
  post('pe_generar2', setDownloadPage()),
]
const history = () => [
  { url: `${UPL}/DTEauth?7`, reply: repeat({ body: page('auth') }, 10) },
  { url: `${UPL}/QEstLibro*`, reply: repeat({ body: bookHistoryPage([]) }, 4) },
]
const SETS_FORM = declarationFormPage(STANDARD_ROWS.slice(0, 4))
const SETS_KEPT = declarationFormPage(
  STANDARD_ROWS.slice(0, 4).map((row, index) => ({ ...row, value: String(index + 1) })),
)
const SETS_APPROVED = progressPage('SET', {
  'SET BASICO': 'REVISADO CONFORME',
  'SET GUIA DESP.': 'REVISADO CONFORME',
  'SET FACTURA EXENTA': 'REVISADO CONFORME',
  'SET CASO GENERAL FACTURA COMPRA': 'REVISADO CONFORME',
})
const BOOKS_APPROVED = page(
  `<table>${[
    'SET BASICO',
    'SET GUIA DE DESPACHO',
    'SET FACTURA EXENTA',
    'SET CASO GENERAL FACTURA COMPRA',
    'LIBRO DE COMPRAS',
    'LIBRO DE VENTAS',
    'LIBRO DE GUIAS',
    'LIBRO DE COMPRAS PARA EXENTOS',
  ]
    .map((name) => `<tr><td><font>${name}</font></td><td><b>REVISADO CONFORME</b></td></tr>`)
    .join('')}</table>`,
)
const simRow = (value = '') => [{ label: 'SET DE SIMULACION', index: 1, value }, ...STANDARD_ROWS.slice(1)]
const SIM_FORM = declarationFormPage(simRow())
const SIM_KEPT = declarationFormPage(simRow('777'))
const AT_EXCHANGE = progressPage('INTERCAMBIO', { 'SET SIMULACION': 'REVISADO CONFORME' })
const IN_SIMULATION = progressPage('SIMULACION', { 'SET SIMULACION': 'EN REVISION' })
const AT_SAMPLES = progressPage('DOCUMENTOS IMPRESOS', {})
const sent = (trackId: string) => ({ trackId, date: TODAY, sentAt: 'x', cases: [] })
const allSets = { basic: sent('1'), guide: sent('2'), exempt: sent('3'), purchase: sent('4') }
const compliance = (second: string, final?: string) => [
  get('pe_avance7', COMPLIANCE_ENTRY),
  post('pe_avance8', second),
  ...(final === undefined ? [] : [post('pe_avance9', final)]),
]
const seeded = async (routes: Parameters<typeof certificationHarness>[0], state: CertificationState) => {
  const harness = await certificationHarness(routes)
  await harness.store.save(state)
  return harness
}

test('a fresh run: the set, the folios, four sets sent, declared and approved, then it stops where asked', async () => {
  const harness = await certificationHarness([
    ...setRoutes(),
    ...stampingRoutes(),
    uploadRoute(reception('1'), reception('2'), reception('3'), reception('4')),
    entry,
    avance2([SETS_FORM, SETS_KEPT]),
    post('pe_avance3', DECLARATION_ANSWERS.success),
    avance5,
    avance6([], () => SETS_APPROVED),
  ])
  const result = await runCertification(harness.deps, { until: 'testSets', optionalSets: ['SET03', 'SET06', 'SET72'] })
  expect(result.stopped).toBe('until')
  expect(result.state).toMatchObject({ companyRut: ISSUER_RUT, stage: 'books', setsApproved: true })
  expect(Object.keys(result.state.sets).sort()).toEqual(['basic', 'exempt', 'guide', 'purchase'])
  expect(result.state.cafs).toHaveLength(6)
  expect(await harness.store.load()).toEqual(result.state)
  const steps = harness.steps()
  expect(steps.slice(0, 2)).toEqual(['SETS_DOWNLOADING', 'SETS_LOADED'])
  expect(steps.filter((step) => step === 'SET_OK')).toHaveLength(4)
  expect(steps.slice(-3)).toEqual(['SETS_DECLARED', 'POLLING', 'SETS_APPROVED'])
  expect(harness.posted('pe_generar2')[0]).toEqual({
    AUTORIZADA: 'S',
    TOTAL: '15',
    SET01: 'S',
    SET03: 'S',
    SET06: 'S',
    SET72: 'S',
  })
})

test('resumed at the books: approved books, the advance, the simulation sent, declared and confirmed, then the exchange is phase 5c’s', async () => {
  const harness = await seeded(
    [
      ...history(),
      entry,
      avance2([BOOKS_APPROVED, page('x'), page('x'), page('x'), SIM_FORM, SIM_KEPT]),
      post('pe_avance4', ADVANCE_ANSWERS.advanced),
      avance5,
      avance6([progressPage('SIMULACION', {}), IN_SIMULATION], () => AT_EXCHANGE),
      ...stampingRoutes(),
      uploadRoute(reception('777')),
      post('pe_avance3', DECLARATION_ANSWERS.success),
    ],
    stateWith({ plan, sets: allSets, setsApproved: true, stage: 'books', cafs: certificationCafXmls() }),
  )
  const result = await runCertification(harness.deps)
  expect(result.stopped).toBe('exchange')
  expect(result.state).toMatchObject({ stage: 'exchange', simulation: { trackId: '777', confirmed: true } })
  expect(result.state.books.results.guideBook?.approved).toBe(true)
  const steps = harness.steps()
  expect(steps).toContain('BOOKS_DONE')
  expect(steps).toContain('ADVANCE_DONE')
  expect(steps.slice(-3)).toEqual(['POLLING', 'POLLING', 'SIM_DONE'])
  expect(harness.urls().filter((url) => url.endsWith('DTEUpload'))).toHaveLength(1)
})

test('past the exchange the portal decides: compliance blocked, or declared', async () => {
  const beyond = stateWith({
    plan,
    sets: allSets,
    stage: 'exchange',
    simulation: { trackId: '777', date: TODAY, sentAt: 'x', confirmed: true },
  })
  const blocked = await seeded(
    [
      entry,
      avance2([], () => declarationFormPage(STANDARD_ROWS)),
      post('pe_avance4', ADVANCE_ANSWERS.unchanged),
      avance5,
      avance6([], () => AT_SAMPLES),
      ...compliance(COMPLIANCE_BLOCKED),
    ],
    beyond,
  )
  const first = await runCertification(blocked.deps, { declareCompliance: true })
  expect(first.stopped).toBe('blocked')
  expect(first.state).toMatchObject({ stage: 'compliance', blocked: expect.stringContaining('no ha finalizado') })
  const declared = await seeded(
    [
      entry,
      avance2([], () => declarationFormPage(STANDARD_ROWS)),
      post('pe_avance4', ADVANCE_ANSWERS.unchanged),
      avance5,
      avance6([], () => AT_SAMPLES),
      ...compliance(COMPLIANCE_FORM, COMPLIANCE_DECLARED),
    ],
    { ...beyond, stage: 'printedSamples' },
  )
  const second = await runCertification(declared.deps, { declareCompliance: true })
  expect(second.stopped).toBe('done')
  expect(second.state.stage).toBe('done')
  expect(declared.steps().slice(-1)).toEqual(['CERT_DONE'])
  const still = await seeded([entry, avance2([]), avance5, avance6([], () => AT_EXCHANGE)], beyond)
  await expect(runCertification(still.deps)).resolves.toMatchObject({ stopped: 'exchange' })
  // The declaration cannot be undone: without the explicit go the runner stops in front of it.
  const waiting = await seeded([entry, avance2([]), avance5, avance6([], () => AT_SAMPLES)], beyond)
  const held = await runCertification(waiting.deps)
  expect(held).toMatchObject({ stopped: 'compliance', state: { stage: 'compliance' } })
  expect(waiting.urls().some((url) => url.endsWith('pe_avance7'))).toBe(false)
  const asked = await seeded([entry, avance2([]), avance5, avance6([], () => AT_SAMPLES)], beyond)
  await expect(
    runCertification(asked.deps, { until: 'printedSamples', declareCompliance: true }),
  ).resolves.toMatchObject({ stopped: 'until' })
})

test('what stops a run: a refused declaration, a wait that times out, incomplete books', async () => {
  const sentState = stateWith({ plan, sets: allSets, cafs: certificationCafXmls() })
  const refused = await seeded(
    [entry, avance2([SETS_FORM]), post('pe_avance3', DECLARATION_ANSWERS.contentMismatch)],
    sentState,
  )
  await expect(runCertification(refused.deps)).resolves.toMatchObject({
    stopped: 'rejected',
    detail: 'contentMismatch',
  })
  const pending = progressPage('SET', { 'SET BASICO': 'EN REVISION' })
  const slow = await seeded(
    [
      entry,
      avance2([SETS_FORM, SETS_KEPT]),
      post('pe_avance3', DECLARATION_ANSWERS.success),
      avance5,
      avance6([], () => pending),
    ],
    sentState,
  )
  await expect(runCertification(slow.deps)).resolves.toMatchObject({ stopped: 'timedOut' })
  const { purchaseBook, ...noPurchase } = plan
  void purchaseBook
  const books = await seeded(
    [...history(), entry, avance2([], () => page('<tr><td><font>SET BASICO</font></td><td><b>x</b></td></tr>'))],
    stateWith({ plan: noPurchase, sets: {}, stage: 'books' }),
  )
  await expect(runCertification(books.deps)).resolves.toMatchObject({ stopped: 'incomplete' })
})

test('the simulation: a refused declaration, a rejected wait, a confirmed one skipped, and an unknown stage wording', async () => {
  const simulated = stateWith({
    plan,
    sets: allSets,
    stage: 'simulation',
    simulation: { trackId: '777', date: TODAY, sentAt: 'x' },
  })
  const refused = await seeded(
    [
      entry,
      avance2([page('x'), SIM_FORM]),
      avance5,
      avance6([], () => IN_SIMULATION),
      post('pe_avance3', DECLARATION_ANSWERS.contentMismatch),
    ],
    simulated,
  )
  await expect(runCertification(refused.deps)).resolves.toMatchObject({
    stopped: 'rejected',
    detail: 'contentMismatch',
  })
  const rejected = await seeded(
    [
      entry,
      avance2([page('x'), SIM_FORM, SIM_KEPT]),
      avance5,
      avance6([IN_SIMULATION], () => progressPage('SIMULACION', { 'SET SIMULACION': 'RECHAZADO' })),
      post('pe_avance3', DECLARATION_ANSWERS.success),
    ],
    simulated,
  )
  await expect(runCertification(rejected.deps)).resolves.toMatchObject({ stopped: 'rejected', detail: 'RECHAZADO' })
  const confirmed = await seeded([entry, avance2([]), avance5, avance6([], () => AT_EXCHANGE)], {
    ...simulated,
    simulation: { ...simulated.simulation!, confirmed: true },
  })
  const skipped = await runCertification(confirmed.deps)
  expect(skipped).toMatchObject({ stopped: 'exchange' })
  expect(skipped.state.stage).toBe('exchange')
  const unknown = await seeded(
    [
      ...history(),
      entry,
      avance2([BOOKS_APPROVED]),
      post('pe_avance4', ADVANCE_ANSWERS.advanced),
      avance5,
      avance6([], () => progressPage('ALGO NUEVO', {})),
    ],
    stateWith({ plan, sets: allSets, stage: 'books' }),
  )
  const forced = await runCertification(unknown.deps, { until: 'books' })
  expect(forced).toMatchObject({ stopped: 'until' })
  expect(forced.state.stage).toBe('simulation')
})

test('an error of a step is reported and rethrown; the company comes from the issuer when the client names none', async () => {
  const harness = await certificationHarness([get('pe_generar', NOT_ENROLLED, NOT_ENROLLED)])
  const error = await failure(runCertification(harness.deps))
  expect(error.details).toMatchObject({ rejection: 'notEnrolled' })
  expect(harness.steps()).toEqual(['SETS_DOWNLOADING', 'CERT_ERROR'])
  expect(await harness.store.load()).toBeNull()
  const nameless = { ...harness.deps, portal: { ...harness.deps.portal, companyRut: null } }
  expect((await failure(runCertification(nameless))).details).toEqual({ field: 'companyRut' })
})

test('a refusal without a sentence stops with the outcome itself; a run already done or at compliance', async () => {
  const sentState = stateWith({ plan, sets: allSets, cafs: certificationCafXmls() })
  const empty = await seeded(
    [entry, avance2([SETS_FORM, SETS_FORM]), post('pe_avance3', DECLARATION_ANSWERS.success)],
    sentState,
  )
  await expect(runCertification(empty.deps)).resolves.toMatchObject({ stopped: 'rejected', detail: 'allRejected' })
  const simulated = stateWith({
    plan,
    sets: allSets,
    stage: 'simulation',
    simulation: { trackId: '777', date: TODAY, sentAt: 'x' },
  })
  const never = await seeded(
    [
      entry,
      avance2([page('x')], () => SIM_FORM),
      avance5,
      avance6([], () => IN_SIMULATION),
      post('pe_avance3', ...repeat(DECLARATION_ANSWERS.notProcessed, 10)),
    ],
    simulated,
  )
  await expect(runCertification(never.deps)).resolves.toMatchObject({ stopped: 'rejected', detail: 'notProcessed' })
  const confirmed = await seeded([entry, avance2([]), avance5, avance6([], () => AT_EXCHANGE)], {
    ...simulated,
    simulation: { ...simulated.simulation!, confirmed: true },
  })
  await expect(runCertification(confirmed.deps, { until: 'simulation' })).resolves.toMatchObject({
    stopped: 'until',
    state: { stage: 'exchange' },
  })
  const done = await seeded([], stateWith({ stage: 'done' }))
  await expect(runCertification(done.deps)).resolves.toMatchObject({ stopped: 'done' })
  expect(done.urls()).toEqual([])
  const atCompliance = await seeded(
    [
      entry,
      avance2([], () => declarationFormPage(STANDARD_ROWS)),
      post('pe_avance4', ADVANCE_ANSWERS.unchanged),
      avance5,
      avance6([], () => AT_SAMPLES),
      ...compliance(COMPLIANCE_FORM, COMPLIANCE_DECLARED),
    ],
    stateWith({ stage: 'compliance', blocked: 'antes' }),
  )
  const finished = await runCertification(atCompliance.deps, { declareCompliance: true })
  expect(finished.stopped).toBe('done')
  expect(finished.state.blocked).toBeUndefined()
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/certification/steps-simulation tests/certification/runner --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/certification/runner'`; `sendSimulation`, `declareSimulation`, `waitForSimulationApproval` and `declareComplianceFinal` are not exported by `src/certification/steps.ts`.

- [ ] **Step 3: Write the implementation**

`src/certification/runner.ts` (new file, whole):

```ts
import { SET_KEYS, type CertificationStage } from '../catalogs/certification'
import { errorMessage } from '../errors'
import { readProgress } from '../portal/certification'
import { runBooks } from './books-step'
import { prepareFolios } from './folios-step'
import { runtime, saveState, type CertificationDependencies } from './runtime'
import { createCertificationState, type CertificationState } from './state'
import {
  advanceToNextStage,
  declareComplianceFinal,
  declareSimulation,
  declareTestSets,
  obtainTestSet,
  sendSimulation,
  sendTestSet,
  waitForSimulationApproval,
  waitForTestSetsApproval,
} from './steps'

/**
 * EN: Options of `runCertification`.
 * ES: Opciones de `runCertification`.
 */
export type RunCertificationOptions = {
  /** EN: Stop once this stage is complete. ES: Detenerse al completar esta etapa. */
  readonly until?: CertificationStage
  /** EN: The optional sets to tick when downloading; the field's by default. ES: Los sets opcionales a marcar al descargar; por defecto los del campo. */
  readonly optionalSets?: readonly string[]
  /** EN: Make the declaration of compliance, the sworn statement of the legal representative, which cannot be undone. Off by default: the runner stops at `compliance` instead. ES: Hacer la declaración de cumplimiento, la declaración jurada del representante legal, que no se puede deshacer. Apagado por defecto: el ejecutor se detiene en `compliance`. */
  readonly declareCompliance?: boolean
}

/**
 * EN: Why the runner stopped. `done` is the declaration of compliance made; `exchange` is where phase 5c takes over;
 * `compliance` is the declaration waiting for `declareCompliance: true`; `until` is the stage asked for; the rest name
 * what the SII or the portal refused, left incomplete or never answered.
 * ES: Por qué se detuvo el ejecutor. `done` es la declaración de cumplimiento hecha; `exchange` es donde toma la fase
 * 5c; `compliance` es la declaración a la espera de `declareCompliance: true`; `until` es la etapa pedida; el resto
 * nombra lo que el SII o el portal rechazó, dejó incompleto o nunca respondió.
 */
export type RunStop = 'done' | 'exchange' | 'compliance' | 'until' | 'blocked' | 'rejected' | 'timedOut' | 'incomplete'

/**
 * EN: What `runCertification` returns.
 * ES: Lo que devuelve `runCertification`.
 */
export type RunCertificationResult = {
  /** EN: The state as saved. ES: El estado tal como quedó guardado. */
  readonly state: CertificationState
  /** EN: Why it stopped. ES: Por qué se detuvo. */
  readonly stopped: RunStop
  /** EN: A word or sentence on why, when there is one. ES: Una palabra o frase sobre el porqué, cuando la hay. */
  readonly detail?: string
}

const ORDER: readonly CertificationStage[] = [
  'testSets',
  'books',
  'simulation',
  'exchange',
  'printedSamples',
  'compliance',
  'done',
]

const past = (stage: CertificationStage, other: CertificationStage): boolean =>
  ORDER.indexOf(stage) > ORDER.indexOf(other)

/**
 * EN: The HTML side of the certification, in the field's order, resumed from the saved state: the test set (downloaded
 * once), the folios, each set not yet sent, their declaration and approval; the books; the advance; the simulation
 * sent, declared and confirmed; then it stops at the exchange for phase 5c, and once the portal stands past the
 * exchange it declares compliance, only with `declareCompliance: true`, because that declaration cannot be undone.
 * Nothing is repeated: a set with a track id is not sent again, a book approved is skipped. A refusal, a block or a time-out comes back as data with the state saved; a `DteError` of the portal, of
 * the SII or of the folios propagates after the state is saved, with a `CERT_ERROR` event.
 * ES: El lado HTML de la certificación, en el orden del campo, retomado desde el estado guardado: el set de pruebas
 * (descargado una vez), los folios, cada set aún no enviado, su declaración y aprobación; los libros; el avance; la
 * simulación enviada, declarada y confirmada; luego se detiene en el intercambio para la fase 5c, y cuando el portal
 * ya pasó el intercambio declara cumplimiento, solo con `declareCompliance: true`, porque esa declaración no se puede
 * deshacer. Nada se repite: un set con track id no se vuelve a enviar, un libro aprobado se omite. Un rechazo, un bloqueo o un timeout vuelven como datos con el estado guardado; un `DteError` del
 * portal, del SII o de los folios se propaga después de guardar el estado, con un evento `CERT_ERROR`.
 * @param deps EN: the dependencies. ES: las dependencias.
 * @param options EN: where to stop and which optional sets. ES: dónde detenerse y qué sets opcionales.
 * @returns EN: the state and why it stopped. ES: el estado y por qué se detuvo.
 * @throws {DteError} EN: the codes of every step. ES: los códigos de cada paso.
 */
export const runCertification = async (
  deps: CertificationDependencies,
  options: RunCertificationOptions = {},
): Promise<RunCertificationResult> => {
  const rt = runtime(deps)
  const companyRut = rt.portal.companyRut ?? rt.issuer.rut
  let state = (await rt.store.load()) ?? createCertificationState(companyRut, rt.now())
  const stop = (stopped: RunStop, detail?: string): RunCertificationResult => ({
    state,
    stopped,
    ...(detail === undefined ? {} : { detail }),
  })
  const reachedUntil = (): boolean => options.until !== undefined && past(state.stage, options.until)
  try {
    if (state.stage === 'testSets') {
      if (state.plan === undefined)
        state = (
          await obtainTestSet(
            deps,
            state,
            options.optionalSets === undefined ? {} : { optionalSets: options.optionalSets },
          )
        ).state
      state = (await prepareFolios(deps, state)).state
      for (const kind of SET_KEYS) {
        if (state.plan![kind] === undefined || state.sets[kind] !== undefined) continue
        state = (await sendTestSet(deps, state, { kind })).state
      }
      const declared = await declareTestSets(deps, state)
      state = declared.state
      if (declared.outcome !== 'accepted' && declared.outcome !== 'inReview')
        return stop('rejected', declared.detail ?? declared.outcome)
      const approval = await waitForTestSetsApproval(deps, state)
      state = approval.state
      if (approval.outcome !== 'approved') return stop(approval.outcome, approval.detail)
    }
    if (reachedUntil()) return stop('until')
    if (state.stage === 'books') {
      const books = await runBooks(deps, state)
      state = books.state
      if (books.outcome !== 'approved') return stop(books.outcome, books.detail)
      state = (await advanceToNextStage(deps, state)).state
      // A wording the page module does not know leaves the stage where it was: the field goes on to the simulation.
      if (state.stage === 'books') state = await saveState(rt, state, { stage: 'simulation' })
    }
    if (reachedUntil()) return stop('until')
    if (state.stage === 'simulation') {
      if (state.simulation === undefined) state = (await sendSimulation(deps, state)).state
      if (state.simulation!.confirmed !== true) {
        const declared = await declareSimulation(deps, state)
        state = declared.state
        if (declared.outcome !== 'skipped' && declared.outcome !== 'accepted' && declared.outcome !== 'inReview')
          return stop('rejected', declared.detail ?? declared.outcome)
        const approval = await waitForSimulationApproval(deps, state)
        state = approval.state
        if (approval.outcome === 'rejected' || approval.outcome === 'timedOut')
          return stop(approval.outcome, approval.detail)
      }
      if (state.stage === 'simulation') state = await saveState(rt, state, { stage: 'exchange' })
    }
    if (reachedUntil()) return stop('until')
    if (state.stage === 'exchange' || state.stage === 'printedSamples') {
      const report = await readProgress(rt.portal)
      if (!past(report.stageKey, 'exchange')) return stop('exchange')
      state = await saveState(rt, state, { stage: 'compliance' })
    }
    if (reachedUntil()) return stop('until')
    if (state.stage === 'compliance') {
      if (options.declareCompliance !== true) return stop('compliance')
      const compliance = await declareComplianceFinal(deps, state)
      state = compliance.state
      if (compliance.outcome === 'blocked') return stop('blocked', compliance.detail)
    }
    return stop('done')
  } catch (error) {
    rt.emit({ step: 'CERT_ERROR', error: errorMessage(error) })
    throw error
  }
}
```

`src/certification/steps.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/certification/steps.ts b/src/certification/steps.ts
index d009042..e866619 100644
--- a/src/certification/steps.ts
+++ b/src/certification/steps.ts
@@ -2,6 +2,7 @@ import { SET_KEYS, type CertificationStage, type SetKey } from '../catalogs/cert
 import { DteError, errorMessage } from '../errors'
 import {
   advanceStage,
+  declareCompliance,
   declareProgress,
   downloadTestSet,
   readProgress,
@@ -13,8 +14,16 @@ import {
 import { queryUploadStatus } from '../sii/status'
 import { uploadEnvelope } from '../sii/upload'
 import { chileDate } from '../time/chile'
-import { heldCafs, registryFolioSource, scopeFor, type HeldCaf } from './folios-step'
+import {
+  heldCafs,
+  prepareFolios,
+  registryFolioSource,
+  scopeFor,
+  simulationFolioNeeds,
+  type HeldCaf,
+} from './folios-step'
 import { issueTestSet, type IssuableSetPlan, type IssuedCase } from './issue-set'
+import { issueSimulation } from './simulation'
 import { planCertificationSets } from './set-plan'
 import { parseTestSetText } from './set-text'
 import {
@@ -47,6 +56,9 @@ const DECLARATION_ATTEMPTS = 10
 const DECLARATION_INTERVAL_MS = 5000
 const SETS_APPROVAL_ATTEMPTS = 5
 const SETS_APPROVAL_INTERVAL_MS = 10000
+const SIMULATION_APPROVAL_ATTEMPTS = 30
+const SIMULATION_APPROVAL_INTERVAL_MS = 10000
+const SIMULATION_ARTEFACT = 'simulacion/envio-simulacion.xml'
 const STAGE_ORDER: readonly CertificationStage[] = [
   'testSets',
   'books',
@@ -376,3 +388,194 @@ export const advanceToNextStage = async (
   const next = await saveState(rt, state, { stage: laterStage(state.stage, report.stageKey) })
   return { state: next, outcome: answer.outcome, detail: answer.message }
 }
+
+const atLeast = (stage: CertificationStage, floor: CertificationStage): boolean =>
+  STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(floor)
+
+/**
+ * EN: Sends the simulation: fresh CAFs for one folio per case (never the sets' CAFs), every case of the four sets
+ * issued again in one envelope, the envelope and the documents kept as artefacts, the upload, the folios marked sent
+ * whatever happened, and the track id with the Chile date of the send.
+ * ES: Envía la simulación: CAF nuevos para un folio por caso (nunca los CAF de los sets), cada caso de los cuatro sets
+ * reemitido en un sobre, el sobre y los documentos guardados como artefactos, el envío, los folios marcados enviados
+ * pase lo que pase, y el track id con la fecha de Chile del envío.
+ * @throws {DteError} EN: `MISSING_FIELD { field: 'plan' }` without a plan; the folio, 5b-1 and upload codes. ES: `MISSING_FIELD { field: 'plan' }` sin plan; los códigos de folios, de 5b-1 y de envío.
+ */
+export const sendSimulation = async (
+  deps: CertificationDependencies,
+  state: CertificationState,
+): Promise<StepResult<'sent'>> => {
+  const rt = runtime(deps)
+  if (state.plan === undefined) throw new DteError('MISSING_FIELD', { field: 'plan' })
+  rt.emit({ step: 'SIM_START' })
+  const prepared = await prepareFolios(deps, state, { needs: simulationFolioNeeds(state.plan), fresh: true })
+  const held = heldCafs(prepared.cafs, rt.now())
+  const issued = await issueSimulation(state.plan, {
+    issuer: rt.issuer,
+    receiver: rt.receiver,
+    certificate: rt.certificate,
+    folios: registryFolioSource(rt.registry, held),
+    resolution: rt.resolution,
+    now: rt.now,
+  })
+  await rt.store.writeArtefact(SIMULATION_ARTEFACT, issued.envelope.xml)
+  for (const document of issued.cases)
+    await rt.store.writeArtefact(
+      documentArtefactName('simulacion', document.type, document.folio),
+      document.document.xml,
+    )
+  rt.emit({ step: 'SIM_SENDING' })
+  const sentAt = rt.now().toISOString()
+  const usedFolios = [...prepared.state.usedFolios, ...issued.cases.map((c) => ({ type: c.type, folio: c.folio }))]
+  try {
+    const receipt = await uploadEnvelope(rt.sii, { envelope: issued.envelope })
+    await markSent(rt, held, issued.cases, { trackId: receipt.trackId, sentAt })
+    const next = await saveState(rt, prepared.state, {
+      usedFolios,
+      simulation: { trackId: receipt.trackId, date: chileDate(rt.now()), sentAt },
+    })
+    rt.emit({ step: 'SIM_OK', trackId: receipt.trackId })
+    return { state: next, outcome: 'sent' }
+  } catch (error) {
+    await markSent(rt, held, issued.cases, { sentAt })
+    await saveState(rt, prepared.state, { usedFolios })
+    throw error
+  }
+}
+
+/**
+ * EN: Declares the simulation, unless the portal already stands at the exchange or later. "Every row empty" is
+ * retried here: the portal shows the simulation as not declared while it still processes the track id.
+ * ES: Declara la simulación, salvo que el portal ya esté en el intercambio o después. "Toda fila vacía" aquí se
+ * reintenta: el portal muestra la simulación sin declarar mientras aún procesa el track id.
+ * @throws {DteError} EN: `MISSING_FIELD { field: 'simulation' }` before the send; the portal codes. ES: `MISSING_FIELD { field: 'simulation' }` antes del envío; los códigos del portal.
+ */
+export const declareSimulation = async (
+  deps: CertificationDependencies,
+  state: CertificationState,
+): Promise<StepResult<DeclarationOutcome | 'skipped'>> => {
+  const rt = runtime(deps)
+  if (state.simulation === undefined) throw new DteError('MISSING_FIELD', { field: 'simulation' })
+  const report = await readProgress(rt.portal)
+  if (atLeast(report.stageKey, 'exchange'))
+    return {
+      state: await saveState(rt, state, { stage: laterStage(state.stage, report.stageKey) }),
+      outcome: 'skipped',
+      // A stage key at the exchange or past it always comes from a wording on the page.
+      detail: report.stage!,
+    }
+  rt.emit({ step: 'SIM_DECLARING' })
+  const { result, diagnosis } = await declareWithRetries(
+    rt,
+    { simulation: entryOf(state.simulation) },
+    { label: 'simulation', prefix: 'declaracion-simulacion', retryOnAllRejected: true },
+  )
+  const next = await saveState(rt, state, {
+    lastDeclaration: {
+      scope: 'simulation',
+      outcome: result.outcome,
+      detail: result.detail,
+      at: rt.now().toISOString(),
+    },
+    diagnosis: { ...state.diagnosis, ...diagnosis },
+  })
+  return { state: next, outcome: result.outcome, ...(result.detail === null ? {} : { detail: result.detail }) }
+}
+
+/**
+ * EN: Waits for the simulation: 30 polls 10 s apart of the progress page, polling first. The exchange or a later
+ * stage is done; an approved simulation that awaits its confirmation is declared once more (the portal's "Confirmar
+ * Revisión") and the page read again; an approved state is done; a rejected one stops. After the polls the SOAP
+ * status decides: a rejected envelope is the answer (a time-out often hides one), else the wait timed out.
+ * ES: Espera la simulación: 30 consultas cada 10 s a la página de avance, consultando primero. El intercambio o una
+ * etapa posterior es listo; una simulación aprobada que espera su confirmación se declara una vez más (el "Confirmar
+ * Revisión" del portal) y se relee la página; un estado aprobado es listo; uno rechazado detiene. Tras las consultas
+ * decide el estado SOAP: un envío rechazado es la respuesta (un timeout suele esconder uno), si no, la espera venció.
+ * @throws {DteError} EN: `MISSING_FIELD { field: 'simulation' }` before the send; the portal codes. ES: `MISSING_FIELD { field: 'simulation' }` antes del envío; los códigos del portal.
+ */
+export const waitForSimulationApproval = async (
+  deps: CertificationDependencies,
+  state: CertificationState,
+): Promise<StepResult<'done' | 'confirmed' | 'rejected' | 'timedOut'>> => {
+  const rt = runtime(deps)
+  if (state.simulation === undefined) throw new DteError('MISSING_FIELD', { field: 'simulation' })
+  const simulation = state.simulation
+  const finish = async (
+    outcome: 'done' | 'confirmed',
+    stage: CertificationStage,
+  ): Promise<StepResult<'done' | 'confirmed'>> => {
+    const next = await saveState(rt, state, {
+      stage: laterStage(state.stage, stage),
+      simulation: { ...simulation, confirmed: true },
+    })
+    rt.emit({ step: 'SIM_DONE' })
+    return { state: next, outcome }
+  }
+  for (let attempt = 1; attempt <= SIMULATION_APPROVAL_ATTEMPTS; attempt += 1) {
+    rt.emit({ step: 'POLLING', attempt, max: SIMULATION_APPROVAL_ATTEMPTS, label: 'simulation' })
+    const report = await readProgress(rt.portal)
+    if (atLeast(report.stageKey, 'exchange')) return finish('done', report.stageKey)
+    if (report.simulationAwaitsConfirmation) {
+      await declareProgress(rt.portal, { entries: { simulation: entryOf(simulation) } })
+      const after = await readProgress(rt.portal)
+      if (
+        atLeast(after.stageKey, 'exchange') ||
+        after.states.simulation?.state === 'approved' ||
+        !after.simulationAwaitsConfirmation
+      )
+        return finish('confirmed', 'exchange')
+    } else {
+      const item = report.states.simulation
+      if (item?.state === 'approved') return finish('done', 'exchange')
+      if (item?.state === 'rejected') return { state, outcome: 'rejected', detail: item.text }
+    }
+    await rt.sleep(SIMULATION_APPROVAL_INTERVAL_MS)
+  }
+  const status = await queryUploadStatus(rt.sii, { trackId: simulation.trackId }).catch(() => null)
+  if (status?.status === 'rejected') {
+    const next = await saveState(rt, state, {
+      diagnosis: {
+        ...state.diagnosis,
+        [simulation.trackId]: { code: status.code, status: status.status, message: status.message },
+      },
+    })
+    return { state: next, outcome: 'rejected', detail: `${status.code}: ${status.message}` }
+  }
+  return { state, outcome: 'timedOut' }
+}
+
+/**
+ * EN: The end of the certification: one more advance (an "already there" with the printed samples means they are
+ * still under review), then the declaration of compliance. A block leaves its sentence in the state; a final page
+ * that does not confirm throws; a declaration ends the run.
+ * ES: El cierre de la certificación: un avance más (un "ya está ahí" con los documentos impresos significa que siguen
+ * en revisión), luego la declaración de cumplimiento. Un bloqueo deja su frase en el estado; una página final que no
+ * confirma lanza; una declaración termina la corrida.
+ * @throws {DteError} EN: `SII_PORTAL_UNEXPECTED_PAGE` when the final page does not confirm; the portal codes. ES: `SII_PORTAL_UNEXPECTED_PAGE` si la página final no confirma; los códigos del portal.
+ */
+export const declareComplianceFinal = async (
+  deps: CertificationDependencies,
+  state: CertificationState,
+): Promise<StepResult<'declared' | 'blocked'>> => {
+  const rt = runtime(deps)
+  const advanced = await advanceToNextStage(deps, state)
+  const result = await declareCompliance(rt.portal)
+  if (result.outcome === 'blocked') {
+    const next = await saveState(rt, advanced.state, {
+      blocked: result.message,
+      stage: laterStage(advanced.state.stage, 'compliance'),
+    })
+    return { state: next, outcome: 'blocked', detail: result.message }
+  }
+  if (result.outcome === 'unconfirmed')
+    throw new DteError('SII_PORTAL_UNEXPECTED_PAGE', {
+      operation: 'declareComplianceFinal',
+      step: 'pe_avance9',
+      portalMessage: result.message,
+    })
+  const { blocked, ...rest } = advanced.state
+  void blocked
+  const next = await saveState(rt, rest as CertificationState, { stage: 'done' })
+  rt.emit({ step: 'CERT_DONE' })
+  return { state: next, outcome: 'declared', detail: result.message }
+}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/certification/steps-simulation tests/certification/runner --coverage=false
```

Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/certification/runner.ts src/certification/steps.ts tests/certification/steps-simulation.test.ts tests/certification/runner.test.ts
```

```bash
git commit -F - <<'MSG'
feat: the simulation and compliance steps and the certification runner

The simulation sent with fresh CAFs, declared with the simulation flag and confirmed through the progress page; the final advance and the declaration of compliance; the runner that chains every step in the field's order and resumes from the saved state, stopping at the exchange for phase 5c and making the irreversible declaration of compliance only with an explicit go.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 7: Public API, size cap and documentation

The runtime names and the types on the root entry and in `RUNTIME_EXPORTS` (spec 3.9), the type tests, the bundle limit at 80 kB (D74), the README section, `llms.txt` and the changelog (spec 3.12).

**Files:**

- Modify: `src/index.ts`
- Modify: `.size-limit.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `llms.txt`
- Test (modify): `tests/public-api.test.ts`
- Test (modify): `tests/types.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/public-api.test.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/public-api.test.ts b/tests/public-api.test.ts
index a222699..eebc57f 100644
--- a/tests/public-api.test.ts
+++ b/tests/public-api.test.ts
@@ -5,6 +5,42 @@ import * as sdk from '../src'
  * the CHANGELOG in the same commit.
  */
 const RUNTIME_EXPORTS = [
+  'SET_KEYS',
+  'BOOK_KEYS',
+  'MANDATORY_BOOK_KEYS',
+  'BOOK_FILE_NAMES',
+  'BOOK_ARTEFACT_NAMES',
+  'SET_ARTEFACT_NAMES',
+  'DEFAULT_OPTIONAL_SETS',
+  'CERTIFICATION_STAGES',
+  'PORTAL_STAGE_WORDS',
+  'CERTIFICATION_STEPS',
+  'downloadTestSet',
+  'declareProgress',
+  'readProgress',
+  'advanceStage',
+  'listBookHistory',
+  'declareCompliance',
+  'createCertificationState',
+  'createMemoryCertificationStore',
+  'assertArtefactName',
+  'createDirectoryCertificationStore',
+  'obtainTestSet',
+  'sendTestSet',
+  'declareTestSets',
+  'waitForTestSetsApproval',
+  'advanceToNextStage',
+  'sendSimulation',
+  'declareSimulation',
+  'waitForSimulationApproval',
+  'declareComplianceFinal',
+  'prepareFolios',
+  'setFolioNeeds',
+  'simulationFolioNeeds',
+  'runBooks',
+  'previousPeriod',
+  'nextFreePeriod',
+  'runCertification',
   'CERTIFICATION_COUNTERPARTY',
   'TEST_SET_ENVELOPE_ID',
   'TEST_SET_KINDS',
```

`tests/types.test.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/types.test.ts b/tests/types.test.ts
index e3affcd..48af969 100644
--- a/tests/types.test.ts
+++ b/tests/types.test.ts
@@ -42,8 +42,20 @@ import {
   issueSimulation,
   createCertificationSalesBook,
   createCertificationGuideBook,
+  runCertification,
+  runBooks,
+  declareProgress,
+  createMemoryCertificationStore,
+  createDirectoryCertificationStore,
 } from '../src'
 import type {
+  RunCertificationResult,
+  BooksOutcome,
+  StepResult,
+  DeclarationResult,
+  CertificationStore,
+  CertificationProgressEvent,
+  CertificationStep,
   TestSet,
   CertificationPlan,
   FolioSource,
@@ -206,6 +218,12 @@ const _typecheck = () => {
   expectTypeOf(createCertificationGuideBook).returns.toEqualTypeOf<SignedGuideBook>()
   expectTypeOf<PurchaseSalesBook['periodTotals']>().toEqualTypeOf<readonly BookTotals[] | null>()
   expectTypeOf<GuideBook['periodTotals']>().toEqualTypeOf<GuideTotals | null>()
+  expectTypeOf(runCertification).returns.resolves.toEqualTypeOf<RunCertificationResult>()
+  expectTypeOf(runBooks).returns.resolves.toEqualTypeOf<StepResult<BooksOutcome>>()
+  expectTypeOf(declareProgress).returns.resolves.toEqualTypeOf<DeclarationResult>()
+  expectTypeOf(createMemoryCertificationStore).returns.toEqualTypeOf<CertificationStore>()
+  expectTypeOf(createDirectoryCertificationStore).returns.toEqualTypeOf<CertificationStore>()
+  expectTypeOf<CertificationProgressEvent['step']>().toEqualTypeOf<CertificationStep>()
 
   // The client is frozen data: its fields cannot be assigned.
   const sii = createSiiClient({} as SiiClientOptions)
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/public-api tests/types --coverage=false
```

Expected: FAIL: `the public API exports exactly the documented runtime names` lists the names missing from the root, and the type test does not compile.

- [ ] **Step 3: Write the implementation**

`src/index.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/index.ts b/src/index.ts
index b19417b..06f5841 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -488,4 +488,94 @@ export type {
   CertificationGuideBookInput,
   BookReceiver,
   GuideBookCaseFlag,
+  BookCaseTotals,
+  SalesBookCase,
+  GuideBookCase,
+  SalesBookSource,
+  GuideBookSource,
 } from './certification/books'
+
+// Phase 5b-2: the certification portal (declarations, books, the runner).
+export {
+  SET_KEYS,
+  BOOK_KEYS,
+  MANDATORY_BOOK_KEYS,
+  BOOK_FILE_NAMES,
+  BOOK_ARTEFACT_NAMES,
+  SET_ARTEFACT_NAMES,
+  DEFAULT_OPTIONAL_SETS,
+  CERTIFICATION_STAGES,
+  PORTAL_STAGE_WORDS,
+  CERTIFICATION_STEPS,
+} from './catalogs/certification'
+export type { SetKey, BookKey, DeclarationKey, CertificationStage, CertificationStep } from './catalogs/certification'
+export {
+  downloadTestSet,
+  declareProgress,
+  readProgress,
+  advanceStage,
+  listBookHistory,
+  declareCompliance,
+} from './portal/certification'
+export type {
+  DownloadTestSetInput,
+  DownloadedTestSet,
+  DeclarationEntry,
+  DeclarationEntries,
+  DeclareProgressInput,
+  DeclarationOutcome,
+  DeclarationResult,
+  ProgressReport,
+  AdvanceResult,
+  BookHistory,
+  ComplianceResult,
+} from './portal/certification'
+export type { SetGenerationState, OptionalSetOption, SetGenerationPage } from './portal/pages/certification-set'
+export type {
+  DeclarationRow,
+  DeclarationForm,
+  DeclarationAnswer,
+  VerificationState,
+  AdvanceAnswer,
+  ItemState,
+  ProgressPage,
+} from './portal/pages/certification-progress'
+export type { BookHistoryEntry } from './portal/pages/certification-books'
+export type { ComplianceForm } from './portal/pages/certification-compliance'
+export { createCertificationState, createMemoryCertificationStore, assertArtefactName } from './certification/state'
+export type {
+  CertificationState,
+  CertificationStore,
+  SentEnvelope,
+  SentCase,
+  SentSet,
+  SentBook,
+  BooksState,
+  AccumulatedTotals,
+  EnvelopeDiagnosis,
+} from './certification/state'
+export { createDirectoryCertificationStore } from './certification/node-store'
+export type { DirectoryCertificationStoreOptions } from './certification/node-store'
+export type {
+  CertificationDependencies,
+  CertificationProgressEvent,
+  PollingLabel,
+  StepResult,
+} from './certification/runtime'
+export {
+  obtainTestSet,
+  sendTestSet,
+  declareTestSets,
+  waitForTestSetsApproval,
+  advanceToNextStage,
+  sendSimulation,
+  declareSimulation,
+  waitForSimulationApproval,
+  declareComplianceFinal,
+} from './certification/steps'
+export { prepareFolios, setFolioNeeds, simulationFolioNeeds } from './certification/folios-step'
+export type { PrepareFoliosOptions, PrepareFoliosResult } from './certification/folios-step'
+export { runBooks, previousPeriod, nextFreePeriod } from './certification/books-step'
+export type { BooksOutcome } from './certification/books-step'
+export { runCertification } from './certification/runner'
+export type { RunCertificationOptions, RunCertificationResult, RunStop } from './certification/runner'
```

`.size-limit.json` (save the diff and run `git apply`):

```diff
diff --git a/.size-limit.json b/.size-limit.json
index 2367a49..101a54e 100644
--- a/.size-limit.json
+++ b/.size-limit.json
@@ -2,11 +2,11 @@
   {
     "name": "ESM (min + brotli)",
     "path": "dist/esm/index.min.js",
-    "limit": "64 kB"
+    "limit": "80 kB"
   },
   {
     "name": "CJS (min + brotli)",
     "path": "dist/cjs/index.min.js",
-    "limit": "64 kB"
+    "limit": "80 kB"
   }
 ]
```

`README.md` (save the diff and run `git apply`):

```diff
diff --git a/README.md b/README.md
index e5d2509..050de5c 100644
--- a/README.md
+++ b/README.md
@@ -307,6 +307,67 @@ build and sign the sales, purchase and guide books. Everything is data: sending,
 belong to the certification runner. No real test-set text was available while writing this: the grammar follows the
 sets the SII delivers in the field, and the first download should be kept as a fixture.
 
+## Certification: the runner
+
+```typescript
+import {
+  createPortalClient,
+  createSiiClient,
+  createDirectoryCertificationStore,
+  createDirectoryFolioRegistry,
+  runCertification,
+  sendTestSet,
+  declareTestSets,
+} from 'dte-sdk'
+
+const deps = {
+  portal: createPortalClient({ environment: 'certification', certificate, companyRut }),
+  sii: createSiiClient({ environment: 'certification', certificate, companyRut }),
+  store: createDirectoryCertificationStore({ dir: './certification' }), // state.json and the artefacts; holds CAF keys
+  registry: createDirectoryFolioRegistry({ dir: './folios' }),
+  issuer,
+  receiver,
+  certificate,
+  resolution: { number: 0, date: resolutionDate },
+  onProgress: (event) => console.log(event.step),
+}
+
+// The whole HTML side, resumable: run it again after a fix, or after phase 5c did the exchange and the samples
+const first = await runCertification(deps) // stops with `exchange` once the simulation is confirmed
+// Once the portal stands past the printed samples, the sworn statement needs an explicit go
+const second = await runCertification(deps, { declareCompliance: true })
+
+// One step alone, after the SII rejected a set with observations
+let state = (await deps.store.load())!
+state = (await sendTestSet(deps, state, { kind: 'basic' })).state
+state = (await declareTestSets(deps, state)).state
+```
+
+The runner does what the field does, in its order: it downloads the test set once (downloading again regenerates it
+at the SII, so a run with a plan starts over), gets the folios through the registry (CAFs in hand first, then the
+quota, re-obtaining and annulling only as a last resort), sends each set and keeps its envelope and documents as
+artefacts for the printed samples, declares the track ids on `pe_avance2` with every field in form order and reads
+the page again to verify, waits for the approval, runs the books (the history of books the SII holds marks the
+occupied periods; a closed book is resent as an adjustment or in the next free month, at most 24 times), advances the
+stage, sends and declares the simulation and confirms it, and stops at the exchange, which is phase 5c's. Once the
+portal stands past the printed samples it stops again, at `compliance`: the declaration of compliance is the sworn
+statement of the legal representative, it cannot be undone, and the runner makes it only with
+`declareCompliance: true`.
+
+- **Everything is a step.** `obtainTestSet`, `prepareFolios`, `sendTestSet`, `declareTestSets`,
+  `waitForTestSetsApproval`, `runBooks`, `advanceToNextStage`, `sendSimulation`, `declareSimulation`,
+  `waitForSimulationApproval` and `declareComplianceFinal` take the dependencies and the state and return the saved
+  state with an outcome; the portal operations beneath them (`downloadTestSet`, `declareProgress`, `readProgress`,
+  `advanceStage`, `listBookHistory`, `declareCompliance`) are exported too.
+- **The state is a secret.** It holds the CAF files, each with a private key; the directory store writes them readable
+  by the user only. A service may implement `CertificationStore` over its own storage.
+- **Dates are Chile dates.** The declaration date and the base book period come from the clock in `America/Santiago`;
+  a process in UTC once declared the next day and the SII answered that the date did not match.
+- **The waits are the field's:** 5 polls of 10 s for the sets, 40 of 15 s for the books, 30 of 10 s for the
+  simulation, 10 declaration attempts 5 s apart after 10 s. Inject `sleep` and `now` to test without waiting.
+- **Nothing here has been run against the portal yet.** Every page shape comes from field behaviour; the first
+  enrolled run should keep the artefacts the store writes (every portal answer is there) as fixtures.
+
 ## Printed samples (Node)
 
 ```typescript
```

`CHANGELOG.md` (save the diff and run `git apply`):

```diff
diff --git a/CHANGELOG.md b/CHANGELOG.md
index 661b7eb..9b90553 100644
--- a/CHANGELOG.md
+++ b/CHANGELOG.md
@@ -91,6 +91,17 @@ and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0
   `createCertificationGuideBook` through phase 3. Catalog `TEST_SET_KINDS`, `TEST_SET_PORTAL_NAMES`,
   `TEST_SET_REFERENCE_TYPE`, `TEST_SET_ENVELOPE_ID`, `CERTIFICATION_COUNTERPARTY`. `DocumentInput.withholdVat` withholds
   the VAT on the notes of a purchase invoice. Bundle limit to 64 kB.
+- Certification, the portal half: `downloadTestSet`, `declareProgress`, `readProgress`, `advanceStage`,
+  `listBookHistory`, `declareCompliance` on the phase 4 session, with pure page modules; `CertificationState` and the
+  `CertificationStore` port (`createMemoryCertificationStore`, `createDirectoryCertificationStore`, private files);
+  the steps `obtainTestSet`, `prepareFolios`, `sendTestSet`, `declareTestSets`, `waitForTestSetsApproval`, `runBooks`,
+  `advanceToNextStage`, `sendSimulation`, `declareSimulation`, `waitForSimulationApproval`, `declareComplianceFinal`,
+  each returning the saved state with an outcome, with typed progress events; and `runCertification`, which chains
+  them in the field's order, resumes from the saved state, stops at the exchange for phase 5c and makes the
+  irreversible declaration of compliance only with `declareCompliance: true`. Catalog `SET_KEYS`,
+  `BOOK_KEYS`, `CERTIFICATION_STAGES`, `CERTIFICATION_STEPS`, `DEFAULT_OPTIONAL_SETS`; portal rejections
+  `notEnrolled`, `advanceRefused`, `declarationDeclined`. The 5b-1 books accept the cases a run keeps and an
+  adjustment submission. Bundle limit to 80 kB.
 
 ### Removed
```

`llms.txt` (save the diff and run `git apply`):

```diff
diff --git a/llms.txt b/llms.txt
index 39ef0ca..079ccc6 100644
--- a/llms.txt
+++ b/llms.txt
@@ -10,6 +10,8 @@ The SII books are `createPurchaseSalesBook` (IECV, `LibroCompraVenta`), `createG
 
 Certification (deterministic half): `parseTestSetText` parses the SII test-set text into sets and cases; `planCertificationSets` gives what each set issues and the folios per type; `createFolioAllocator` hands out folios with the CAF that stamps them; `issueTestSet` issues the basic, exempt, guide and purchase sets through phase 1 with the `SET` reference (`CASO <id>`) and the field rules; `issueSimulation` re-issues every case in one envelope; `createCertificationSalesBook`, `createCertificationPurchaseBook` and `createCertificationGuideBook` build and sign the books through phase 3. Nothing sends: the runner does.
 
+Certification (portal half): `runCertification` runs the HTML side in the field's order from a `CertificationStore` (`createMemoryCertificationStore`, `createDirectoryCertificationStore`; the state holds CAF private keys) and stops at the exchange, which is phase 5c's; once the portal stands past the printed samples it stops at `compliance`, and makes the irreversible declaration of compliance only with `declareCompliance: true`. Each phase is a step over the dependencies and the state (`obtainTestSet`, `prepareFolios`, `sendTestSet`, `declareTestSets`, `waitForTestSetsApproval`, `runBooks`, `advanceToNextStage`, `sendSimulation`, `declareSimulation`, `waitForSimulationApproval`, `declareComplianceFinal`), with typed progress events through `onProgress`; beneath them the portal operations `downloadTestSet` (generates the set anew at the SII), `declareProgress` (every field in form order, the page read again to verify), `readProgress`, `advanceStage`, `listBookHistory` and `declareCompliance`. Dates are Chile dates; the waits are the field's and `sleep` and `now` are injectable. None of it has been run against the portal yet.
+
 Printed samples (Node only): `parsePrintableDocuments` turns any `EnvioDTE`, `EnvioBOLETA`, bare `SetDTE` or bare `DTE` XML into printable documents with each `TED` copied verbatim; `renderPrintedSample` draws one single-page PDF per the SII printed-samples manual (21.5 cm wide, 11 to 33 cm tall, red type box, acknowledgement box and `CEDIBLE` mark on the transferable copy of 33, 34, 43, 46 and sale guides, PDF417 stamp with the signed bytes and its legends); `renderTedBarcode` gives the stamp PNG alone; `renderPrintedSamples` batches envelopes in memory into the test and simulation sets with failures as data; `writePrintedSamples` and `findEnvelopeFiles` do the same over files (`SET-PRUEBAS`, `SET-SIMULACION`). `pdf-lib` and `bwip-js` load on first use.
 
 The SII portal is `createPortalClient({ environment, certificate, companyRut })` plus free functions, on Node ≥ 20 (client certificate over `https`; TLS 1.2, server verified). The certificate must be enabled as a login method at sii.cl, or the login throws `SII_PORTAL_CERT_NOT_ENABLED`. Session: `openPortalSession`, `closePortalSession`, or on demand; `sessionCache` and `lock` are ports for several replicas. Company data: `fetchCompanyResolution` (per environment), `fetchTaxpayerData`, `fetchIssuerProfile`, `queryCertificationSets`. Folios: `listStampableTypes`, `queryFolioQuota` (`MAX_AUTOR`, `FOLIOS_DISP`; stamps nothing), `requestCaf` (may grant less than asked; read `granted`), `listFolioRanges`, `annulFolios` (explicit scope required; `maxRanges` limits one call; irreversible; counts against the quota for six months), `listReobtainableRanges`, `reobtainCaf`. Composite flows return refusals as data: `requestCafExact`, `requestCafInBatches`, `reobtainFolios`. Refusals are `SII_PORTAL_REJECTED` with `details.rejection` and `portalRejectionMessage`. `createFolioRegistry`, `createMemoryFolioRegistry` and `createDirectoryFolioRegistry` track folios locally. The CAF XML holds a private key: treat it as a secret.
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/public-api tests/types --coverage=false
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/index.ts .size-limit.json README.md CHANGELOG.md llms.txt tests/public-api.test.ts tests/types.test.ts
```

```bash
git commit -F - <<'MSG'
feat: export the certification runner, raise the bundle cap to 80 kB and document it

The runtime names and the types on the root entry and in the public API test, the type tests, the bundle limit at 80 kB, the README section on the runner, the changelog and llms.txt.

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
| Phase 4b | 53.6 kB | 53.6 kB |
| Phase 5b-1 | 59.54 kB | 59.75 kB |
| Phase 5b-2 | 70.41 kB | 70.67 kB |

## What this leaves open

- **The portal itself.** Nothing of this phase has been seen by this SDK: the company is not enrolled, and the phase 4
  probe saw `pe_avance1`/`pe_avance2` refuse it. The store keeps every portal answer as an artefact so the first
  enrolled run turns them into fixtures of the page modules.
- **The GWT portals** (the exchange, the printed-samples upload, the receipts): phase 5c. The runner stops at the
  exchange and resumes once the portal stands past the printed samples.
- **Deferred on purpose** (spec section 7): the waits and retries as the field measured them, the history scan down the
  years, the diagnosis through the SOAP status, the declaration date and base period as Chile dates (D70).
- **Field defects not copied** (spec 7): a wait that advanced without checking, "already in that step" reported as an
  error, an empty list of sets counted as approved, the declaration date from a UTC clock.

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

Expected: all pass, 2 231 tests, 100 % on the four metrics, ESM about 70.41 kB and CJS about 70.67 kB against the 80 kB limit.

- [ ] **Step 2: Read the diff against `canary` once**

Nothing public may name a third-party implementation, and no RUT, certificate or local path may appear outside the allow-list. `npm run scan` covers the last part; the first is yours to check.

- [ ] **Step 3: Open the pull request against `canary`**

The body explains the four layers (pages, operations, steps, runner), the store port and its adapters, what the runner does and where it stops for phase 5c, the explicit `declareCompliance: true` the irreversible declaration needs, the 80 kB cap, lists the decisions of spec section 5 and the deferred items and field defects not copied of section 7, and states plainly that nothing has been run against the portal. Squash-merge is how this repository integrates, and merging is Hans's call.

- [ ] **Step 4: Record what stays open**

Add to [issue 8](https://github.com/arrowsw/dte-sdk/issues/8) the live proof this phase needs before the first release that ships it: the company enrolled, a full run through the runner with its artefacts kept as fixtures, and the exchange and samples of phase 5c. Post the bundle sizes on [issue 5](https://github.com/arrowsw/dte-sdk/issues/5).
