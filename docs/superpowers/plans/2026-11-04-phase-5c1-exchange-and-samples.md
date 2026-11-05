# Phase 5c-1 — certification: the exchange and the printed samples: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The two GWT portals of the certification, as the field runs them: the exchange set downloaded from the exchange portal, answered with the reception response, the receipts and the commercial approval, uploaded and confirmed; then the printed samples uploaded to the samples portal, the review submitted and its verdict read; both as steps of the runner, which no longer stops at the exchange. The receipts certification track stays in phase 5c-2.

**Architecture:** The same four layers as phase 5b-2, over `readonly` data. A GWT-RPC codec (`src/portal/gwt.ts`) turns a call description into the wire body and an answer into its table, message and Long tokens, and discovers the portals' hashes. Pure page modules in `src/portal/pages/` read the two portals' answers. Nine operations in `src/portal/exchange.ts` and `src/portal/samples.ts` run on the phase 4 session, which now takes raw bodies. `src/certification/exchange.ts` builds and signs the three answers with phase 1. Two steps (`src/certification/exchange-step.ts`, `src/certification/samples-step.ts`) take the dependencies and the state; `runCertification` chains them at `exchange` and `printedSamples`. `readPrintedSamples` in `dte-sdk/pdf` reads the PDFs `writePrintedSamples` wrote.

**Tech Stack:** TypeScript 5.9 (strict), Node ≥ 22.12, Jest 30 + ts-jest, expect-type, xmllint-wasm (tests), ESLint 9 + Prettier, esbuild, size-limit. No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-04-phase-5c1-exchange-and-samples-design.md` (section 2 holds the decisions D76–D86, section 3 the rules and the API, section 6 what is and is not measured, section 7 what is deferred on purpose and the field defects not reproduced, the appendix the official sources of the exchange answers).

---

## This plan's code has already run

This plan was generated from a throwaway branch cut from `canary` at `ad1936e` (with phase 5b-2 and the four entry points merged), where the code was written and made to pass, with one commit per task. On that branch each task was checked in order: its tests alone fail on the previous commit, and with the task applied `tsc` compiles and the tests pass. At the tip, on 2026-11-04: Prettier, ESLint, `tsc`, 2 342 tests with coverage at 100 % on the four metrics, build, size (`dte-sdk/portal` 62.47 kB against 64 kB, `dte-sdk/pdf` 8.45 kB against 10 kB, `dte-sdk` 30.16 kB, `dte-sdk/node` 4.19 kB) and scan all pass.

So copy the code as it is. If a test fails, something around it changed since then, such as `canary`: investigate that before changing the code.

**Nothing here has met the SII.** Every wire, wording and rule reproduces field behaviour known to carry a certification through the exchange and the printed samples; none of it has been seen by this SDK, because the company is not enrolled and not past the simulation (spec section 6). The first enrolled run must keep every portal answer the store writes under `intercambio/` and `muestras/` and turn them into fixtures. The three exchange answers do validate against the official SII schemas, which are in the fixtures.

## Conventions that apply to EVERY task

1. **Branch:** work on a branch cut from `canary`. Commands run from the repository root. Run `npm ci` first.
2. **Commits:** one per task, with the message given, in English, with a prose body saying why, ending with the `Co-Authored-By` line your session prescribes.
3. **Diffs:** a modified file comes as a unified diff, relative to the repository root. Save it to a temporary file outside the repository and run `git apply <file>`. A new file comes whole.
4. **Bilingual JSDoc is mandatory** on every exported symbol and every type field, one `EN:` line and one `ES:` line, the `ES:` naming the SII tag. The code below already has it.
5. **No classes** (only `DteError`). `readonly` types everywhere. No module-level state; the counters of a loop live in its closure.
6. **No PII in error messages:** values go in `details`, never in `message`.
7. **Coverage** reaches 100 % at Task 7; before that it dips, which is why the per-task commands use `--coverage=false`. The runner suite takes about a minute and the exchange suites sign several XMLs each.
8. **No real data:** fixture RUTs come from the allow-list in `scripts/scan-real-data.mjs`, the pages, texts and names are invented, and `npm run scan` checks it.
9. **Nothing public names any other project:** not code, comments, tests, fixtures, commits or the pull request. Describe the SII behaviour directly.
10. **Nothing in this plan calls the SII,** and the default test run never does.
11. **You own the pull request.** The session that runs this plan is the sole owner of its PR and of every review note or post-merge follow-up on it. Run `gh pr list` before opening anything.

## File map

```
src/portal/gwt.ts                                 (create) task 1   the GWT-RPC codec, the hash discovery; (modify) task 3: warm-up, hashes, one call, parameter helpers
tests/portal/gwt.test.ts                          (create) task 1
src/portal/session.ts                             (modify) task 2   raw bodies; (modify) task 3: ensureSession
src/portal/pages/exchange.ts                      (create) task 2   the exchange portal's answers
src/portal/pages/samples.ts                       (create) task 2   the samples portal's answers
tests/support/gwt-answers.ts                      (create) task 2   synthetic GWT answers
tests/portal/pages-exchange.test.ts               (create) task 2
tests/portal/pages-samples.test.ts                (create) task 2
tests/portal/session.test.ts                      (modify) task 2
src/catalogs/certification.ts                     (modify) task 3   EXCHANGE_PORTAL, SAMPLES_PORTAL, the answer files; (modify) task 6: the five events
src/catalogs/portal.ts                            (modify) task 3   rejections exchangeUploadRefused, samplesReviewRefused, sampleUploadRefused
src/portal/exchange.ts                            (create) task 3   downloadExchangeSet, validateExchangeUser, uploadExchangeAnswers, confirmExchange
tests/portal/exchange.test.ts                     (create) task 3
src/portal/samples.ts                             (create) task 4   readSamplesReview, createSamplesReview, uploadSample, submitSamplesReview, readSamplesDetail
src/sii/multipart.ts                              (modify) task 4   buildMultipartParts
tests/portal/samples.test.ts                      (create) task 4
tests/sii/multipart.test.ts                       (modify) task 4
src/certification/exchange.ts                     (create) task 5   parseExchangeSet, createExchangeAnswers
tests/fixtures/xsd/{RespuestaEnvioDTE,EnvioRecibos,Recibos}_v10.xsd (create) task 5   the official schemas
tests/support/xsd.ts                              (modify) task 5   the two schema entries
tests/certification/exchange.test.ts              (create) task 5
src/certification/exchange-step.ts                (create) task 6   runExchange
src/certification/samples-step.ts                 (create) task 6   uploadPrintedSamples
src/certification/runtime.ts                      (modify) task 6   contact, the five events
src/certification/state.ts                        (modify) task 6   ExchangeState, SamplesState
src/certification/runner.ts                       (modify) task 6   the two stages, exchangeSetXml, samples, RunStop printedSamples
src/pdf/samples.ts                                (modify) task 6   PrintedSampleFile
src/pdf/node-samples.ts                           (modify) task 6   readPrintedSamples
tests/support/exchange-fixtures.ts                (create) task 6   synthetic sets and the two portals' routes
tests/certification/steps-exchange.test.ts        (create) task 6
tests/certification/steps-samples.test.ts         (create) task 6
tests/certification/runner.test.ts                (modify) task 6
tests/pdf/node-samples.test.ts                    (modify) task 6
src/portal/index.ts, src/pdf/index.ts             (modify) task 7
tests/public-api.test.ts, tests/types.test.ts, tests/dist.smoke.test.ts (modify) task 7
.size-limit.json                                  (modify) task 7   dte-sdk/portal 64 kB
README.md / CHANGELOG.md / llms.txt               (modify) task 7
```

---

## Task 1: The GWT-RPC codec and the discovery of the hashes

The wire format the SII's GWT portals speak (spec 3.2): `gwtBody` interns the strings in order of first use and writes `7|0|N|…` with boxed integers and longs, primitive booleans and objects with their fields; `gwtAnswer` reads `//OK`, the string table (with `\\xHH` turned into `\\u00HH` before `JSON.parse`), the message a user would read and every single-quoted Long token; `encodeGwtLong`/`decodeGwtLong` in the GWT base-64 alphabet (`'BAqo'` is 264872); `firstGwtLongIn` and `gwtLongToken`; `discoverGwtHashes` reads `<module>.nocache.js` and `<permutation>.cache.html` on the session and keeps the known pair on any failure. Everything table-driven on the wires of spec 3.5 and 3.7.

**Files:**

- Create: `src/portal/gwt.ts`
- Test (create): `tests/portal/gwt.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/portal/gwt.test.ts` (new file, whole):

```ts
import {
  decodeGwtLong,
  discoverGwtHashes,
  encodeGwtLong,
  firstGwtLongIn,
  gwtAnswer,
  gwtBody,
  gwtHeaders,
  gwtLongToken,
  gwtMessage,
  GWT_INTEGER,
  GWT_LONG,
  GWT_STRING,
  type GwtCall,
} from '../../src/portal/gwt'
import { withPortalSession } from '../../src/portal/session'
import { signedIn } from '../support/portal'
import { page } from '../support/portal-pages'

const PFE = 'https://www4.sii.cl/pfeInternet/'
const PDF = 'https://www4.sii.cl/pdfdteInternet/'
const POLICY = '4EB230A83E74980F353E4FCC209543CB'
const FACADE = 'cl.sii.sdi.dim.pfe.web.client.service.Facade'
const PDF_SERVICE = 'cl.sii.sdi.dim.validaPdfDte.web.client.service.ServicePdfDte'
const call = (moduleBase: string, service: string, method: string, parameters: GwtCall['parameters']): GwtCall => ({
  moduleBase,
  policy: POLICY,
  service,
  method,
  parameters,
})
const string = (value: string | null) => ({ kind: 'string' as const, value })
const integer = (value: number) => ({ kind: 'integer' as const, value })
const nothing = { kind: 'null' as const }

describe('gwtBody writes the wire format of the SII portals', () => {
  test('validarUsuario: one object with nulls, strings and boxed integers, interned as written', () => {
    const body = gwtBody(
      call(PFE, FACADE, 'validarUsuario', [
        {
          kind: 'object',
          type: 'cl.sii.sdi.dim.pfe.to.UsuarioTo/3723336533',
          fields: [
            nothing,
            nothing,
            nothing,
            nothing,
            string('5'),
            string('3'),
            integer(76543210),
            nothing,
            nothing,
            nothing,
            nothing,
            nothing,
            integer(12345678),
          ],
        },
      ]),
    )
    expect(body).toBe(
      `7|0|8|${PFE}|${POLICY}|${FACADE}|validarUsuario|cl.sii.sdi.dim.pfe.to.UsuarioTo/3723336533|5|3|${GWT_INTEGER}|1|2|3|4|1|5|5|0|0|0|0|6|7|8|76543210|0|0|0|0|0|8|12345678|`,
    )
  })

  test('validarSetContriPostSeguimiento: a boxed integer and a string', () => {
    expect(gwtBody(call(PFE, FACADE, 'validarSetContriPostSeguimiento', [integer(76543210), string('3')]))).toBe(
      `7|0|7|${PFE}|${POLICY}|${FACADE}|validarSetContriPostSeguimiento|${GWT_INTEGER}|${GWT_STRING}|3|1|2|3|4|2|5|6|5|76543210|7|`,
    )
  })

  test('updatePostulacionSeguimiento: the id first inside the object', () => {
    const body = gwtBody(
      call(PFE, FACADE, 'updatePostulacionSeguimiento', [
        {
          kind: 'object',
          type: 'cl.sii.sdi.dim.pfe.to.PostulacionSeguimientoTo/3921005560',
          fields: [integer(40), nothing, nothing, nothing, nothing, string('3'), integer(76543210)],
        },
      ]),
    )
    expect(body).toBe(
      `7|0|7|${PFE}|${POLICY}|${FACADE}|updatePostulacionSeguimiento|cl.sii.sdi.dim.pfe.to.PostulacionSeguimientoTo/3921005560|${GWT_INTEGER}|3|1|2|3|4|1|5|5|6|40|0|0|0|0|7|6|76543210|`,
    )
  })

  test('leeImpreso, creaLista and solicitaRevisionSII: strings, the empty string, booleans and longs', () => {
    expect(gwtBody(call(PDF, PDF_SERVICE, 'leeImpreso', [string('76543210-3')]))).toBe(
      `7|0|6|${PDF}|${POLICY}|${PDF_SERVICE}|leeImpreso|${GWT_STRING}|76543210-3|1|2|3|4|1|5|6|`,
    )
    expect(
      gwtBody(
        call(PDF, PDF_SERVICE, 'creaLista', [
          string('76543210'),
          string('3'),
          string(''),
          string('76543210'),
          string('3'),
          { kind: 'boolean', value: false },
        ]),
      ),
    ).toBe(
      `7|0|9|${PDF}|${POLICY}|${PDF_SERVICE}|creaLista|${GWT_STRING}|Z|76543210|3||1|2|3|4|6|5|5|5|5|5|6|7|8|9|7|8|0|`,
    )
    expect(
      gwtBody(
        call(PDF, PDF_SERVICE, 'solicitaRevisionSII', [
          { kind: 'long', value: 'BAqo' },
          { kind: 'boolean', value: true },
        ]),
      ),
    ).toBe(`7|0|6|${PDF}|${POLICY}|${PDF_SERVICE}|solicitaRevisionSII|${GWT_LONG}|Z|1|2|3|4|2|5|6|5|BAqo|1|`)
    expect(gwtBody(call(PDF, PDF_SERVICE, 'muestraMail', [{ kind: 'long', value: 264872 }]))).toBe(
      `7|0|5|${PDF}|${POLICY}|${PDF_SERVICE}|muestraMail|${GWT_LONG}|1|2|3|4|1|5|5|BAqo|`,
    )
  })

  test('a null string is 0, and pipes and backslashes in a table string are escaped', () => {
    expect(gwtBody(call(PFE, FACADE, 'm', [string(null), string('a|b\\c')]))).toBe(
      `7|0|6|${PFE}|${POLICY}|${FACADE}|m|${GWT_STRING}|a\\!b\\\\c|1|2|3|4|2|5|5|0|6|`,
    )
  })

  test('the headers of a call', () => {
    expect(gwtHeaders(PFE, 'E487C7488217509D4EDCE9D341782C20')).toEqual({
      'Content-Type': 'text/x-gwt-rpc; charset=UTF-8',
      'X-GWT-Module-Base': PFE,
      'X-GWT-Permutation': 'E487C7488217509D4EDCE9D341782C20',
      Origin: 'https://www4.sii.cl',
      Referer: PFE,
    })
  })
})

describe('GWT longs', () => {
  test('encode and decode in the GWT base-64 alphabet', () => {
    expect(encodeGwtLong(264872)).toBe('BAqo')
    expect(decodeGwtLong('BAqo')).toBe(264872)
    expect(encodeGwtLong(0)).toBe('A')
    expect(decodeGwtLong('A')).toBe(0)
    expect(encodeGwtLong(63)).toBe('_')
    expect(decodeGwtLong('$_')).toBe(62 * 64 + 63)
    expect(decodeGwtLong('B-q')).toBeNull()
    for (const value of [1, 64, 4095, 9999999, 123456789]) expect(decodeGwtLong(encodeGwtLong(value))).toBe(value)
  })
})

describe('gwtAnswer', () => {
  test('//OK, the table with \\x escapes, the longs and the first in a range', () => {
    const answer = gwtAnswer(`//OK[1,'BAqo',2,'abc',["La revisi\\x27on 'BAqo' est\\xe1 en","INGRESO","3"],0,7]`)
    expect(answer.ok).toBe(true)
    expect(answer.table).toEqual(["La revisi'on 'BAqo' está en", 'INGRESO', '3'])
    expect(answer.longs).toEqual([264872, decodeGwtLong('abc'), 264872])
    expect(firstGwtLongIn(answer, 10000, 9999999)).toBe(264872)
    expect(firstGwtLongIn(answer, 1, 5)).toBeNull()
    expect(gwtLongToken(answer, 264872)).toBe('BAqo')
    expect(gwtLongToken(answer, 7)).toBeNull()
    expect(answer.message).toBeNull()
  })

  test('no //OK, an empty table, an unreadable table, a table that is no array', () => {
    expect(gwtAnswer('//EX[2,1,["java.lang.RuntimeException/515124647","boom"],0,7]')).toMatchObject({
      ok: false,
      table: ['java.lang.RuntimeException/515124647', 'boom'],
    })
    expect(gwtAnswer('//OK[0,[],0,7]')).toMatchObject({ ok: true, table: [], longs: [], message: null })
    expect(gwtAnswer('//OK[1,["unterminated],0,7]').table).toEqual([])
    expect(gwtAnswer('//OK[1,["a",{"b":1}],0,7]').table).toEqual(['a'])
    expect(gwtAnswer('<html>error</html>').table).toEqual([])
    expect(gwtAnswer(`//OK[,[{"x":1}],0,7]`).table).toEqual([])
  })

  test('the message: a sentence with the words the SII uses, never a type name or a class path', () => {
    expect(
      gwtMessage([
        'cl.sii.sdi.dim.pfe.to.UsuarioTo/3723336533',
        'java.util.ArrayList/4159755760',
        'cl.sii.sdi algo que no corresponde en absoluto',
        "El estado de la postulacion NO es: 'DOCUMENTOS IMPRESOS'",
      ]),
    ).toBe("El estado de la postulacion NO es: 'DOCUMENTOS IMPRESOS'")
    expect(gwtMessage(['El contribuyente 76543210-3 no ha solicitado Set de pruebas.'])).toBe(
      'El contribuyente 76543210-3 no ha solicitado Set de pruebas.',
    )
    expect(gwtMessage(['short error', 'Una frase larga sin las palabras esperadas aqui', 'APROBADO'])).toBeNull()
  })
})

describe('discoverGwtHashes', () => {
  const known = { permutation: 'D86ACF99AE5C17F0B0F673A9872EF6CB', policy: '5459B93B9D030A67564300FBD346270F' }
  const fresh = { permutation: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1', policy: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB2' }
  const nocache = (...permutations: readonly string[]) => page(`var x=['${permutations.join("','")}'],y=1;`)
  const discover = async (routes: Parameters<typeof signedIn>[0], override?: typeof known) => {
    const harness = await signedIn(routes)
    const hashes = await withPortalSession(harness.portal, 'test', undefined, (context) =>
      discoverGwtHashes(context, {
        moduleBase: PDF,
        moduleName: 'pdfdte',
        known,
        ...(override === undefined ? {} : { override }),
      }),
    )
    return { hashes, harness }
  }

  test('the known pair stands when the portal still lists it', async () => {
    const { hashes, harness } = await discover([
      {
        url: `${PDF}pdfdte.nocache.js`,
        reply: { body: nocache('0000000000000000000000000000000f', known.permutation) },
      },
    ])
    expect(hashes).toEqual(known)
    expect(harness.urls()).toEqual([`${PDF}pdfdte.nocache.js`])
  })

  test('a new permutation takes the first listed and its policy from the cache page', async () => {
    const { hashes, harness } = await discover([
      {
        url: `${PDF}pdfdte.nocache.js`,
        reply: { body: nocache(fresh.permutation.toLowerCase(), 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC3') },
      },
      {
        url: `${PDF}${fresh.permutation}.cache.html`,
        reply: { body: page(`var p='${fresh.permutation}', q="${fresh.policy}";`) },
      },
    ])
    expect(hashes).toEqual(fresh)
    expect(harness.fake.requests[1].headers.referer).toBe(PDF)
  })

  test('the known pair stays when the portal cannot be read, lists nothing, or hides the policy', async () => {
    const { hashes: down, harness } = await discover([
      { url: `${PDF}pdfdte.nocache.js`, reply: { status: 500, body: 'down' } },
    ])
    expect(down).toEqual(known)
    expect(harness.portal.logger).toBeDefined()
    const { hashes: empty } = await discover([
      { url: `${PDF}pdfdte.nocache.js`, reply: { body: page('nothing here') } },
    ])
    expect(empty).toEqual(known)
    const { hashes: blank } = await discover([{ url: `${PDF}pdfdte.nocache.js`, reply: { body: '' } }])
    expect(blank).toEqual(known)
    const { hashes: noPolicy } = await discover([
      { url: `${PDF}pdfdte.nocache.js`, reply: { body: nocache(fresh.permutation) } },
      { url: `${PDF}${fresh.permutation}.cache.html`, reply: { body: page(`'${fresh.permutation}'`) } },
    ])
    expect(noPolicy).toEqual(known)
    const { hashes: thrown } = await discover([{ url: `${PDF}pdfdte.nocache.js`, reply: new Error('socket hang up') }])
    expect(thrown).toEqual(known)
  })

  test('a pair from the caller is taken without a request', async () => {
    const { hashes, harness } = await discover([], fresh)
    expect(hashes).toEqual(fresh)
    expect(harness.urls()).toEqual([])
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/gwt --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/portal/gwt'`.

- [ ] **Step 3: Write the implementation**

`src/portal/gwt.ts` (new file, whole):

```ts
import { errorMessage } from '../errors'
import { portalRequest, type PortalContext } from './session'

/**
 * EN: One parameter of a GWT-RPC call, as the SII's portals serialize it: a string (interned in the table, `0` when
 * null), a boxed `java.lang.Integer`, a boxed `java.lang.Long` (a number, or a token already in the GWT base-64
 * alphabet), a primitive boolean (`Z`), null, or an object with its fields in serialization order.
 * ES: Un parámetro de una llamada GWT-RPC, como lo serializan los portales del SII: un string (en la tabla, `0` si es
 * null), un `java.lang.Integer` encajonado, un `java.lang.Long` encajonado (un número, o un token ya en el alfabeto
 * base 64 de GWT), un booleano primitivo (`Z`), null, o un objeto con sus campos en orden de serialización.
 */
export type GwtParameter =
  | { readonly kind: 'string'; readonly value: string | null }
  | { readonly kind: 'integer'; readonly value: number }
  | { readonly kind: 'long'; readonly value: number | string }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'null' }
  | { readonly kind: 'object'; readonly type: string; readonly fields: readonly GwtParameter[] }

/**
 * EN: One GWT-RPC call: where it goes and what it carries.
 * ES: Una llamada GWT-RPC: adónde va y qué lleva.
 */
export type GwtCall = {
  /** EN: The module base URL, with its trailing slash. ES: La URL base del módulo, con su barra final. */
  readonly moduleBase: string
  /** EN: The serialization policy hash. ES: El hash de la política de serialización. */
  readonly policy: string
  /** EN: The service interface name. ES: El nombre de la interfaz del servicio. */
  readonly service: string
  /** EN: The method. ES: El método. */
  readonly method: string
  /** EN: The parameters, in order. ES: Los parámetros, en orden. */
  readonly parameters: readonly GwtParameter[]
}

/**
 * EN: A GWT-RPC answer, read.
 * ES: Una respuesta GWT-RPC, leída.
 */
export type GwtAnswer = {
  /** EN: The body starts with `//OK`. ES: El cuerpo empieza con `//OK`. */
  readonly ok: boolean
  /** EN: The string table of the answer, empty when none can be read. ES: La tabla de strings de la respuesta, vacía si no se puede leer. */
  readonly table: readonly string[]
  /** EN: The first sentence of the table that reads as a message to the user, or null. ES: La primera frase de la tabla que se lee como mensaje al usuario, o null. */
  readonly message: string | null
  /** EN: Every single-quoted token of the body decoded as a GWT Long. ES: Cada token entre comillas simples del cuerpo decodificado como Long de GWT. */
  readonly longs: readonly number[]
  /** EN: The raw body. ES: El cuerpo crudo. */
  readonly body: string
}

/**
 * EN: The two hashes a GWT portal requires on every call.
 * ES: Los dos hashes que un portal GWT exige en cada llamada.
 */
export type GwtHashes = {
  /** EN: `X-GWT-Permutation`, the name of the compiled module. ES: `X-GWT-Permutation`, el nombre del módulo compilado. */
  readonly permutation: string
  /** EN: The serialization policy, the second string of every body. ES: La política de serialización, el segundo string de cada cuerpo. */
  readonly policy: string
}

/** EN: GWT signature of `java.lang.String`. ES: Firma GWT de `java.lang.String`. */
export const GWT_STRING = 'java.lang.String/2004016611'
/** EN: GWT signature of `java.lang.Integer`. ES: Firma GWT de `java.lang.Integer`. */
export const GWT_INTEGER = 'java.lang.Integer/3438268394'
/** EN: GWT signature of `java.lang.Long`. ES: Firma GWT de `java.lang.Long`. */
export const GWT_LONG = 'java.lang.Long/4227064769'
/** EN: GWT signature of a primitive boolean. ES: Firma GWT de un booleano primitivo. */
export const GWT_BOOLEAN = 'Z'
/** EN: The `Content-Type` of a GWT-RPC body. ES: El `Content-Type` de un cuerpo GWT-RPC. */
export const GWT_CONTENT_TYPE = 'text/x-gwt-rpc; charset=UTF-8'

const PROTOCOL_VERSION = '7'
const FLAGS = '0'
const NULL = '0'
const LONG_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$_'
const LONG_RADIX = 64
const MESSAGE_MIN_LENGTH = 15
const MESSAGE_WORDS = /(no ha|no est|no se|no corresp|debe |error|inv[aá]lid|rechaz|El estado|El contribuyente)/i
const TYPE_NAME = /^[\w.$]+\/\d+$/

/**
 * EN: A number in the GWT base-64 alphabet, most significant digit first (`264872` is `BAqo`).
 * ES: Un número en el alfabeto base 64 de GWT, el dígito más significativo primero (`264872` es `BAqo`).
 */
export const encodeGwtLong = (value: number): string => {
  let rest = Math.trunc(value)
  let out = ''
  do {
    out = LONG_ALPHABET[rest % LONG_RADIX] + out
    rest = Math.trunc(rest / LONG_RADIX)
  } while (rest > 0)
  return out
}

/**
 * EN: The number a GWT base-64 token holds, or null when a character is not in the alphabet.
 * ES: El número que contiene un token base 64 de GWT, o null si un carácter no está en el alfabeto.
 */
export const decodeGwtLong = (token: string): number | null => {
  let value = 0
  for (const char of token) {
    const digit = LONG_ALPHABET.indexOf(char)
    if (digit === -1) return null
    value = value * LONG_RADIX + digit
  }
  return value
}

const escapeTableString = (value: string): string => value.replace(/\\/g, '\\\\').replace(/\|/g, '\\!')

// One pass that interns strings as it writes them: the four header slots, then the parameter types, then the values.
const serialize = (call: GwtCall): { readonly table: string[]; readonly body: string[] } => {
  const table: string[] = []
  const intern = (value: string): string => {
    const at = table.indexOf(value)
    if (at !== -1) return String(at + 1)
    table.push(value)
    return String(table.length)
  }
  const typeOf = (parameter: GwtParameter): string => {
    switch (parameter.kind) {
      case 'string':
      case 'null':
        return GWT_STRING
      case 'integer':
        return GWT_INTEGER
      case 'long':
        return GWT_LONG
      case 'boolean':
        return GWT_BOOLEAN
      default:
        return parameter.type
    }
  }
  const body: string[] = [intern(call.moduleBase), intern(call.policy), intern(call.service), intern(call.method)]
  const write = (parameter: GwtParameter): void => {
    switch (parameter.kind) {
      case 'string':
        body.push(parameter.value === null ? NULL : intern(parameter.value))
        return
      case 'null':
        body.push(NULL)
        return
      case 'integer':
        body.push(intern(GWT_INTEGER), String(parameter.value))
        return
      case 'long':
        body.push(
          intern(GWT_LONG),
          typeof parameter.value === 'string' ? parameter.value : encodeGwtLong(parameter.value),
        )
        return
      case 'boolean':
        body.push(parameter.value ? '1' : '0')
        return
      default:
        body.push(intern(parameter.type))
        for (const field of parameter.fields) write(field)
    }
  }
  body.push(String(call.parameters.length))
  for (const parameter of call.parameters) body.push(intern(typeOf(parameter)))
  for (const parameter of call.parameters) write(parameter)
  return { table, body }
}

/**
 * EN: The request body of a call: `7|0|N|` + the string table + the body, every item followed by `|`.
 * ES: El cuerpo de petición de una llamada: `7|0|N|` + la tabla de strings + el cuerpo, cada ítem seguido de `|`.
 */
export const gwtBody = (call: GwtCall): string => {
  const { table, body } = serialize(call)
  return [PROTOCOL_VERSION, FLAGS, String(table.length), ...table.map(escapeTableString), ...body].join('|') + '|'
}

/**
 * EN: The headers of a call: the GWT content type, the module base and the permutation, the origin and the referer.
 * ES: Las cabeceras de una llamada: el content type GWT, la base del módulo y la permutación, el origen y el referer.
 */
export const gwtHeaders = (moduleBase: string, permutation: string): Readonly<Record<string, string>> => ({
  'Content-Type': GWT_CONTENT_TYPE,
  'X-GWT-Module-Base': moduleBase,
  'X-GWT-Permutation': permutation,
  Origin: new URL(moduleBase).origin,
  Referer: moduleBase,
})

const tableOf = (body: string): readonly string[] => {
  const start = body.lastIndexOf(',["')
  const end = body.lastIndexOf('],')
  if (start === -1 || end <= start) return []
  // GWT writes `\x27` for a quote, which JSON refuses.
  const raw = body.slice(start + 1, end + 1).replace(/\\x([0-9A-Fa-f]{2})/g, '\\u00$1')
  try {
    // The slice opens with `[` and closes with `]`, so a parse that succeeds gives an array.
    return (JSON.parse(raw) as unknown[]).filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

/**
 * EN: The first string of a table that reads as a message to the user: a sentence with whitespace, longer than 15
 * characters, not a type name, not a class path, with one of the words the SII uses to refuse.
 * ES: El primer string de una tabla que se lee como mensaje al usuario: una frase con espacios, de más de 15
 * caracteres, que no es un nombre de tipo ni una ruta de clase, con una de las palabras con que el SII rechaza.
 */
export const gwtMessage = (table: readonly string[]): string | null =>
  table.find(
    (item) =>
      item.length > MESSAGE_MIN_LENGTH &&
      /\s/.test(item) &&
      !TYPE_NAME.test(item) &&
      !item.includes('cl.sii.sdi') &&
      MESSAGE_WORDS.test(item),
  ) ?? null

/**
 * EN: Reads an answer: `//OK`, the string table, the message, the Long tokens.
 * ES: Lee una respuesta: `//OK`, la tabla de strings, el mensaje, los tokens Long.
 */
export const gwtAnswer = (body: string): GwtAnswer => {
  const table = tableOf(body)
  return {
    ok: body.startsWith('//OK'),
    table,
    message: gwtMessage(table),
    // The pattern only admits the alphabet, so every token decodes.
    longs: [...body.matchAll(/'([A-Za-z0-9$_]{3,7})'/g)].map((match) => decodeGwtLong(match[1])!),
    body,
  }
}

/**
 * EN: The first Long of an answer inside a range, or null.
 * ES: El primer Long de una respuesta dentro de un rango, o null.
 */
export const firstGwtLongIn = (answer: GwtAnswer, min: number, max: number): number | null =>
  answer.longs.find((value) => value >= min && value <= max) ?? null

/**
 * EN: The single-quoted token of an answer whose value is `value`, as the portal wrote it, or null.
 * ES: El token entre comillas simples de una respuesta cuyo valor es `value`, tal como lo escribió el portal, o null.
 */
export const gwtLongToken = (answer: GwtAnswer, value: number): string | null =>
  [...answer.body.matchAll(/'([A-Za-z0-9$_]{3,7})'/g)].find((match) => decodeGwtLong(match[1]) === value)?.[1] ?? null

/**
 * EN: What `discoverGwtHashes` needs: the module, the pair known to work, and a pair from the caller that wins.
 * ES: Lo que necesita `discoverGwtHashes`: el módulo, el par que se sabe que funciona, y un par del llamador que gana.
 */
export type GwtDiscoveryInput = {
  /** EN: The module base URL, with its trailing slash. ES: La URL base del módulo, con su barra final. */
  readonly moduleBase: string
  /** EN: The module name (`<name>.nocache.js`). ES: El nombre del módulo (`<name>.nocache.js`). */
  readonly moduleName: string
  /** EN: The pair known to work. ES: El par que se sabe que funciona. */
  readonly known: GwtHashes
  /** EN: A pair the caller knows better; nothing is fetched then. ES: Un par que el llamador conoce mejor; entonces no se consulta nada. */
  readonly override?: GwtHashes
}

const uniqueUpper = (matches: Iterable<RegExpMatchArray>): readonly string[] => [
  ...new Set([...matches].map((match) => match[1].toUpperCase())),
]

/**
 * EN: The hashes of a GWT portal: the caller's pair when given; else the module's `nocache.js` is read (the 32-hex
 * strings delimited by `=`, `'` or `,`): the known pair stands when its permutation is listed, else the first one listed
 * is the permutation and its `cache.html` gives the policy, the first quoted 32-hex string that differs from it; any
 * failure, empty page or missing candidate keeps the known pair. The SII changes both when it redeploys a portal.
 * ES: Los hashes de un portal GWT: el par del llamador si lo da; si no, se lee el `nocache.js` del módulo (los strings
 * de 32 hexadecimales entre `=`, `'` o `,`): el par conocido vale si su permutación está listada, si no, la primera
 * listada es la permutación y su `cache.html` da la política, el primer string de 32 hexadecimales entre comillas que
 * no sea ella; cualquier falla, página vacía o candidato ausente deja el par conocido. El SII cambia ambos al
 * redesplegar un portal.
 */
export const discoverGwtHashes = async (context: PortalContext, input: GwtDiscoveryInput): Promise<GwtHashes> => {
  if (input.override !== undefined) return input.override
  const warn = (reason: string): GwtHashes => {
    context.portal.logger.warn('gwt hashes kept', { module: input.moduleName, reason })
    return input.known
  }
  try {
    const page = await portalRequest(context, 'gwt.nocache', 'GET', `${input.moduleBase}${input.moduleName}.nocache.js`)
    if (page.status !== 200 || page.html === '') return warn('nocache unavailable')
    const candidates = uniqueUpper(page.html.matchAll(/[=',]([0-9A-Fa-f]{32})[',]/g))
    if (candidates.includes(input.known.permutation)) return input.known
    const permutation = candidates[0]
    if (permutation === undefined) return warn('no permutation listed')
    const cache = await portalRequest(context, 'gwt.cache', 'GET', `${input.moduleBase}${permutation}.cache.html`, {
      referer: input.moduleBase,
    })
    const policy = uniqueUpper(cache.html.matchAll(/["']([0-9A-Fa-f]{32})["']/g)).find(
      (candidate) => candidate !== permutation,
    )
    if (policy === undefined) return warn('no policy in cache.html')
    return { permutation, policy }
  } catch (error) {
    return warn(errorMessage(error))
  }
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/gwt --coverage=false
```

Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/portal/gwt.ts tests/portal/gwt.test.ts
```

```bash
git commit -F - <<'MSG'
feat: the GWT-RPC codec of the SII portals and the discovery of their hashes

The wire format of protocol 7 built from a typed call description with
the strings interned as they are written, the answer read back (the OK
prefix, the string table with its escapes, the message to the user, the
Long tokens in the GWT alphabet), and the permutation and policy
discovered from the module's nocache.js and cache.html with the pair
known to work as the fallback.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 2: Raw requests on the session and the pages of the two portals

`portalRequest` and `navigate` take raw bytes with their content type and extra headers beside a form or a JSON value (spec 3.3), with the cookies, the retry policy, the block detection and the decoding of phase 4 untouched. The pure pages: the exchange portal's (spec 3.4: the set download, the user validation with its state and `P90`, a refused upload page at HTTP 200, a confirmation) and the samples portal's (spec 3.6: the six review states quoted in the raw body, the review id and token in the 10 000 to 9 999 999 range, the date sent, the rejection detail table and its English summary).

**Files:**

- Create: `src/portal/pages/exchange.ts`
- Create: `src/portal/pages/samples.ts`
- Modify: `src/portal/session.ts`
- Test (create): `tests/support/gwt-answers.ts`
- Test (create): `tests/portal/pages-exchange.test.ts`
- Test (create): `tests/portal/pages-samples.test.ts`
- Test (modify): `tests/portal/session.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/support/gwt-answers.ts` (new file, whole):

```ts
// Synthetic answers of the SII's GWT portals. The shapes follow the field; every value is invented.

/** A `//OK` answer: the values, then the string table, then the trailer `0,7`. */
export const okAnswer = (values: readonly (string | number)[], table: readonly string[]): string =>
  `//OK[${values.join(',')},[${table.map((item) => JSON.stringify(item)).join(',')}],0,7]`

/** The answer of a call that returns nothing. */
export const EMPTY_OK = '//OK[0,[],0,7]'

/** A server-side exception. */
export const EXCEPTION = '//EX[2,1,["java.lang.RuntimeException/515124647","The call failed on the server"],0,7]'

/** An HTML detail table as the samples portal embeds it: `\x3C` for `<`, inside the string table. */
export const detailAnswer = (rows: readonly (readonly string[])[]): string => {
  const html = `\\x3Chtml\\x3E\\x3Ctable\\x3E${rows
    .map((cells) => `\\x3Ctr\\x3E${cells.map((cell) => `\\x3Ctd\\x3E${cell}\\x3C/td\\x3E`).join('')}\\x3C/tr\\x3E`)
    .join('')}\\x3C/table\\x3E\\x3C/html\\x3E`
  return `//OK[1,["${html}"],0,7]`
}
```

`tests/portal/pages-exchange.test.ts` (new file, whole):

```ts
import { gwtAnswer } from '../../src/portal/gwt'
import {
  exchangeUserState,
  isConfirmed,
  isExchangeSet,
  isUploadRefused,
  uploadMessage,
} from '../../src/portal/pages/exchange'
import { EMPTY_OK, okAnswer } from '../support/gwt-answers'
import { page } from '../support/portal-pages'

test('the exchange set: an envelope, a bare set or any XML, on HTTP 200', () => {
  expect(isExchangeSet(200, '<?xml version="1.0"?><EnvioDTE/>')).toBe(true)
  expect(isExchangeSet(200, '<SetDTE ID="x"/>')).toBe(true)
  expect(isExchangeSet(200, '<EnvioDTE>')).toBe(true)
  expect(isExchangeSet(500, '<EnvioDTE/>')).toBe(false)
  expect(isExchangeSet(200, page('<p>no hay set</p>'))).toBe(false)
})

test('the user validation: in the exchange, not in it with its state, already completed', () => {
  expect(
    exchangeUserState(gwtAnswer(okAnswer([1], ['cl.sii.sdi.dim.pfe.to.UsuarioTo/3723336533', '76543210']))),
  ).toEqual({
    inExchange: true,
    state: null,
    completed: false,
    message: '76543210',
  })
  expect(exchangeUserState(gwtAnswer(EMPTY_OK))).toEqual({
    inExchange: true,
    state: null,
    completed: false,
    message: null,
  })
  const refused = exchangeUserState(
    gwtAnswer(okAnswer([1], ['java.lang.String/2004016611', 'La empresa no esta en estado: P90 para esta operacion'])),
  )
  expect(refused).toEqual({
    inExchange: false,
    state: 'P90',
    completed: true,
    message: 'La empresa no esta en estado: P90 para esta operacion',
  })
  expect(exchangeUserState(gwtAnswer(okAnswer([1], ['Error de validacion'])))).toEqual({
    inExchange: false,
    state: null,
    completed: false,
    message: 'Error de validacion',
  })
})

test('a refused upload: the parameters, the error title, a rejection, or the status', () => {
  expect(isUploadRefused(200, page('<p>No vienen los parametros necesarios</p>'))).toBe(true)
  expect(isUploadRefused(200, '<html><head><title>ERROR</title></head></html>')).toBe(true)
  expect(isUploadRefused(200, page('<p>Archivo rechazado</p>'))).toBe(true)
  expect(isUploadRefused(400, page('<p>ok</p>'))).toBe(true)
  expect(isUploadRefused(200, page('<p>Archivo recibido</p>'))).toBe(false)
  expect(uploadMessage(page('<p>No vienen los parametros necesarios</p>'))).toBe('No vienen los parametros necesarios')
})

test('a confirmation', () => {
  expect(isConfirmed(EMPTY_OK)).toBe(true)
  expect(isConfirmed('<html>//OK inside</html>')).toBe(true)
  expect(isConfirmed('//EX[...]')).toBe(false)
})
```

`tests/portal/pages-samples.test.ts` (new file, whole):

```ts
import { encodeGwtLong, gwtAnswer } from '../../src/portal/gwt'
import {
  reviewId,
  reviewSentAt,
  reviewState,
  sampleDetails,
  summarizeSampleDetails,
} from '../../src/portal/pages/samples'
import { detailAnswer, EMPTY_OK, okAnswer } from '../support/gwt-answers'

test('the review state quoted in the body, with or without the accent', () => {
  expect(reviewState('//OK[1,["x","INGRESO"],0,7]')).toBe('INGRESO')
  expect(reviewState('//OK[1,["En revisión"],0,7]')).toBe('EN REVISION')
  expect(reviewState('//OK[1,["EN REVISION"],0,7]')).toBe('EN REVISION')
  expect(reviewState('//OK[1,["enviado al sii"],0,7]')).toBe('ENVIADO AL SII')
  expect(reviewState('//OK[1,["RECHAZADO"],0,7]')).toBe('RECHAZADO')
  expect(reviewState('//OK[1,["3"],0,7]')).toBeNull()
  expect(reviewState("//OK[1,'APROBADO',[],0,7]")).toBeNull()
})

test('the review id: the first Long in range, with its token; the verifier digit is never one', () => {
  const answer = gwtAnswer(
    `//OK[1,'D',2,'${encodeGwtLong(264872)}',3,'${encodeGwtLong(99)}',["2026-11-04 10:15:00","3"],0,7]`,
  )
  expect(reviewId(answer)).toEqual({ id: 264872, token: 'BAqo' })
  expect(reviewSentAt(answer)).toBe('2026-11-04 10:15:00')
  expect(reviewId(gwtAnswer(EMPTY_OK))).toBeNull()
  expect(reviewSentAt(gwtAnswer(okAnswer([1], ['3', 'INGRESO'])))).toBeNull()
  expect(reviewId(gwtAnswer(`//OK[1,'${encodeGwtLong(99999999)}',[],0,7]`))).toBeNull()
})

test('the rejection detail: rows with a PDF, the kind, the copy and the case', () => {
  const answer = detailAnswer([
    ['Archivo', 'Tipo', 'Documento', 'Folio', 'Copia', 'Caso'],
    ['1', 'muestra_33_1.pdf', 'PRUEBA', 'FACTURA ELECTRONICA', '1', 'ORIGINAL', '4256-1'],
    ['2', 'muestra_33_1_cedible.pdf', 'PRUEBA', 'FACTURA ELECTRONICA', '1', 'CEDIBLE', '4256-1'],
    ['3', 'muestra_61_7.pdf', 'SIMULACION', 'NOTA DE CREDITO', '7', 'ORIGINAL', ''],
    ['4', 'muestra_56_2.pdf', 'SIMULACION', 'NOTA DE DEBITO', '2', 'ORIGINAL'],
    ['5', 'readme.txt', 'PRUEBA', 'x', '1', 'ORIGINAL', ''],
  ])
  const rows = sampleDetails(answer)
  expect(rows).toEqual([
    {
      fileName: 'muestra_33_1.pdf',
      kind: 'test',
      documentType: 'FACTURA ELECTRONICA',
      folio: 1,
      copy: 'ORIGINAL',
      caseId: '4256-1',
    },
    {
      fileName: 'muestra_33_1_cedible.pdf',
      kind: 'test',
      documentType: 'FACTURA ELECTRONICA',
      folio: 1,
      copy: 'CEDIBLE',
      caseId: '4256-1',
    },
    {
      fileName: 'muestra_61_7.pdf',
      kind: 'simulation',
      documentType: 'NOTA DE CREDITO',
      folio: 7,
      copy: 'ORIGINAL',
      caseId: null,
    },
    {
      fileName: 'muestra_56_2.pdf',
      kind: 'simulation',
      documentType: 'NOTA DE DEBITO',
      folio: 2,
      copy: 'ORIGINAL',
      caseId: null,
    },
  ])
  expect(summarizeSampleDetails(rows)).toBe(
    'The SII recognised 1 document(s) as the test set (cases 4256-1: FACTURA ELECTRONICA 1) and 2 as the simulation (NOTA DE CREDITO 1, NOTA DE DEBITO 1). A set missing from the cases was not the envelope the SII registered for it.',
  )
  const onlyTests = rows.filter((row) => row.kind === 'test').map((row) => ({ ...row, caseId: null }))
  expect(summarizeSampleDetails(onlyTests)).toBe(
    'The SII recognised 1 document(s) as the test set (cases none: FACTURA ELECTRONICA 1) and 0 as the simulation (none). A set missing from the cases was not the envelope the SII registered for it.',
  )
  expect(summarizeSampleDetails(rows.filter((row) => row.kind === 'simulation'))).toBe(
    'The SII recognised 0 document(s) as the test set (cases none: none) and 2 as the simulation (NOTA DE CREDITO 1, NOTA DE DEBITO 1). A set missing from the cases was not the envelope the SII registered for it.',
  )
  expect(summarizeSampleDetails([])).toBe(
    'The SII recognised 0 document(s) as the test set (cases none: none) and 0 as the simulation (none). A set missing from the cases was not the envelope the SII registered for it.',
  )
})

test('the detail as plain html with escapes, and no detail at all', () => {
  const plain = `//OK[1,["<html><table><tr><td>1</td><td>a \\"b\\" \\'c\\' \\\\ \\u00e9.pdf</td><td>PRUEBA</td><td>T</td><td>5</td><td>ORIGINAL</td><td>&nbsp;</td></tr></table></html>"],0,7]`
  expect(sampleDetails(plain)).toEqual([
    { fileName: 'a "b" \'c\' \\ é.pdf', kind: 'test', documentType: 'T', folio: 5, copy: 'ORIGINAL', caseId: null },
  ])
  expect(sampleDetails(EMPTY_OK)).toEqual([])
  expect(sampleDetails(detailAnswer([]))).toEqual([])
  expect(sampleDetails('//OK[1,["sin tabla"],0,7]')).toEqual([])
})
```

`tests/portal/session.test.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/portal/session.test.ts b/tests/portal/session.test.ts
index 44528e9..8ce4788 100644
--- a/tests/portal/session.test.ts
+++ b/tests/portal/session.test.ts
@@ -709,3 +709,33 @@ describe('stale cookies end in the representation page', () => {
     expect(harness.fake.requests.filter((request) => request.url.startsWith(HERCULES))).toHaveLength(1)
   })
 })
+
+describe('raw bodies', () => {
+  test('a raw body goes with its content type, the extra headers and the cookies; the form and JSON paths take extra headers too', async () => {
+    const harness = await signedIn([
+      { url: `${MAULLIN}/raw`, method: 'POST', reply: { body: 'ok' } },
+      { url: `${MAULLIN}/form`, method: 'POST', reply: { body: 'ok' } },
+    ])
+    await withPortalSession(harness.portal, 'raw', undefined, async (context) => {
+      await portalRequest(context, 'raw', 'POST', `${MAULLIN}/raw`, {
+        body: new Uint8Array([1, 2, 3]),
+        contentType: 'text/x-gwt-rpc; charset=UTF-8',
+        referer: `${MAULLIN}/`,
+        headers: { 'X-GWT-Permutation': 'abc' },
+      })
+      await portalRequest(context, 'bytes', 'POST', `${MAULLIN}/raw`, { body: new Uint8Array([4]) })
+      await portalRequest(context, 'form', 'POST', `${MAULLIN}/form`, { form: { a: '1' }, headers: { 'X-Extra': 'y' } })
+    })
+    const [raw, bytes, form] = harness.fake.requests
+    expect(raw.headers['content-type']).toBe('text/x-gwt-rpc; charset=UTF-8')
+    expect(raw.headers['x-gwt-permutation']).toBe('abc')
+    expect(raw.headers.referer).toBe(`${MAULLIN}/`)
+    expect(raw.headers.origin).toBe('https://maullin.sii.cl')
+    expect(raw.headers.cookie).toContain('NETSCAPE_LIVEWIRE.rut=')
+    expect([...raw.body!]).toEqual([1, 2, 3])
+    expect(bytes.headers['content-type']).toBe('application/octet-stream')
+    expect(form.headers['content-type']).toBe('application/x-www-form-urlencoded')
+    expect(form.headers['x-extra']).toBe('y')
+    expect(form.text).toBe('a=1')
+  })
+})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/pages-exchange tests/portal/pages-samples tests/portal/session --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/portal/pages/exchange'` and `'../../src/portal/pages/samples'`; the session test's `raw bodies` block does not compile (`body` is not an option of `portalRequest`).

- [ ] **Step 3: Write the implementation**

`src/portal/pages/exchange.ts` (new file, whole):

```ts
import type { GwtAnswer } from '../gwt'
import { bodyText } from '../html'

/**
 * EN: What the exchange portal said when the user was validated.
 * ES: Lo que dijo el portal de intercambio al validar al usuario.
 */
export type ExchangeUserState = {
  /** EN: The company stands in the exchange stage (P06). ES: La empresa está en la etapa de intercambio (P06). */
  readonly inExchange: boolean
  /** EN: The state the portal named, or null when it named none. ES: El estado que nombró el portal, o null si no nombró ninguno. */
  readonly state: string | null
  /** EN: The exchange was already completed (P90). ES: El intercambio ya se completó (P90). */
  readonly completed: boolean
  /** EN: The portal's sentence, or null. ES: La frase del portal, o null. */
  readonly message: string | null
}

const COMPLETED_STATE = 'P90'
const REFUSED_STATUS = 400
const MIN_MESSAGE_LENGTH = 5

/**
 * EN: The download gave the exchange set: the body holds an envelope or at least an XML declaration.
 * ES: La descarga entregó el set de intercambio: el cuerpo trae un sobre o al menos una declaración XML.
 */
export const isExchangeSet = (status: number, body: string): boolean =>
  status === 200 && (body.includes('<EnvioDTE') || body.includes('<SetDTE') || body.includes('<?xml'))

/**
 * EN: Reads the user validation: the first string of the table longer than five characters that is not a class name
 * says whether the company is in the exchange; "no esta en estado" or "error" means it is not, and the word after
 * "estado:" is the state it is in. The exchange portal answers nothing else that this phase reads.
 * ES: Lee la validación del usuario: el primer string de la tabla de más de cinco caracteres que no es un nombre de
 * clase dice si la empresa está en el intercambio; "no esta en estado" o "error" significa que no, y la palabra tras
 * "estado:" es el estado en que está. El portal de intercambio no responde nada más que esta fase lea.
 */
export const exchangeUserState = (answer: GwtAnswer): ExchangeUserState => {
  const message = answer.table.find((item) => item.length > MIN_MESSAGE_LENGTH && !/^(cl\.|java\.)/.test(item)) ?? null
  if (message === null || !/no esta en estado|error/i.test(message))
    return { inExchange: true, state: null, completed: false, message }
  const state = /estado:\s*(\w+)/i.exec(message)?.[1] ?? null
  return { inExchange: false, state, completed: state === COMPLETED_STATE, message }
}

/**
 * EN: The upload page refused: the portal answers HTTP 200 with "no vienen los parametros necesarios" when the query
 * lacks the company, an error title, or a rejection; a status of 400 or more refuses too.
 * ES: La página de subida rechazó: el portal responde HTTP 200 con "no vienen los parametros necesarios" cuando la
 * query no trae la empresa, un título de error, o un rechazo; un estado 400 o mayor también rechaza.
 */
export const isUploadRefused = (status: number, html: string): boolean => {
  const lower = html.toLowerCase()
  return (
    status >= REFUSED_STATUS ||
    lower.includes('no vienen los parametros') ||
    lower.includes('<title>error') ||
    lower.includes('rechaz')
  )
}

/**
 * EN: A confirmation answered `//OK` somewhere in its body.
 * ES: Una confirmación respondió `//OK` en alguna parte de su cuerpo.
 */
export const isConfirmed = (body: string): boolean => body.includes('//OK')

/**
 * EN: What a refused upload page said, for the error details.
 * ES: Lo que dijo una página de subida rechazada, para los detalles del error.
 */
export const uploadMessage = (html: string): string => bodyText(html).slice(0, 200)
```

`src/portal/pages/samples.ts` (new file, whole):

```ts
import { decodeEntities, stripTags } from '../html'
import { firstGwtLongIn, gwtLongToken, type GwtAnswer } from '../gwt'

/**
 * EN: The states a samples review can be in, as the portal writes them.
 * ES: Los estados en que puede estar una revisión de muestras, como los escribe el portal.
 */
export type ReviewState = 'APROBADO' | 'POR REVISAR' | 'EN REVISION' | 'RECHAZADO' | 'INGRESO' | 'ENVIADO AL SII'

/**
 * EN: One row of the rejection detail: how the SII filed one PDF.
 * ES: Una fila del detalle del rechazo: cómo clasificó el SII un PDF.
 */
export type SampleDetail = {
  /** EN: The PDF's file name. ES: El nombre de archivo del PDF. */
  readonly fileName: string
  /** EN: Filed as the test set or as the simulation. ES: Clasificado como set de pruebas o como simulación. */
  readonly kind: 'test' | 'simulation'
  /** EN: The document type the SII read. ES: El tipo de documento que leyó el SII. */
  readonly documentType: string
  /** EN: The folio the SII read. ES: El folio que leyó el SII. */
  readonly folio: number
  /** EN: The copy: `CEDIBLE` marks the transferable copy. ES: La copia: `CEDIBLE` marca la copia cedible. */
  readonly copy: string
  /** EN: The test-set case the SII matched, or null. ES: El caso del set de pruebas que el SII asoció, o null. */
  readonly caseId: string | null
}

const STATE_PATTERN = /"(APROBADO|POR REVISAR|EN REVISI[OÓ]N|RECHAZADO|INGRESO|ENVIADO AL SII)"/i
const MIN_REVIEW_ID = 10000
const MAX_REVIEW_ID = 9999999
const MIN_DETAIL_CELLS = 6
const SENT_AT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/

/**
 * EN: The review state quoted in the raw body, upper-cased without the accent, or null.
 * ES: El estado de la revisión entre comillas en el cuerpo crudo, en mayúsculas sin tilde, o null.
 */
export const reviewState = (body: string): ReviewState | null => {
  const match = STATE_PATTERN.exec(body)
  if (match === null) return null
  return match[1].toUpperCase().replace('Ó', 'O') as ReviewState
}

/**
 * EN: The review id of an answer: the first Long between 10 000 and 9 999 999, with the token the portal wrote
 * (the token goes back to the portal as it came; the number names the review in the upload form).
 * ES: El id de revisión de una respuesta: el primer Long entre 10 000 y 9 999 999, con el token que escribió el portal
 * (el token vuelve al portal tal como vino; el número nombra la revisión en el formulario de subida).
 */
export const reviewId = (answer: GwtAnswer): { readonly id: number; readonly token: string } | null => {
  const id = firstGwtLongIn(answer, MIN_REVIEW_ID, MAX_REVIEW_ID)
  if (id === null) return null
  return { id, token: gwtLongToken(answer, id)! }
}

/**
 * EN: The date the review was sent, the first table string shaped `YYYY-MM-DD HH:MM`, or null.
 * ES: La fecha en que se envió la revisión, el primer string de la tabla con forma `AAAA-MM-DD HH:MM`, o null.
 */
export const reviewSentAt = (answer: GwtAnswer): string | null =>
  answer.table.find((item) => SENT_AT.test(item)) ?? null

const unescapeHtml = (text: string): string =>
  text
    .replace(/\\x([0-9A-Fa-f]{2})/g, (_whole, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\u([0-9A-Fa-f]{4})/g, (_whole, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\')

/**
 * EN: The rows of the rejection detail: the HTML table inside the answer's string table, one row per `<tr>` with at
 * least six cells whose second cell ends in `.pdf`.
 * ES: Las filas del detalle del rechazo: la tabla HTML dentro de la tabla de strings de la respuesta, una fila por
 * `<tr>` con al menos seis celdas cuya segunda celda termina en `.pdf`.
 */
export const sampleDetails = (body: string): readonly SampleDetail[] => {
  const match = /"(\\x3Chtml[\s\S]*?)"\]/i.exec(body) ?? /"(<html[\s\S]*?)"\]/i.exec(body)
  if (match === null) return []
  const html = unescapeHtml(match[1])
  return (html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? []).flatMap((row) => {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => stripTags(cell[1]))
    if (cells.length < MIN_DETAIL_CELLS || !cells[1].toLowerCase().endsWith('.pdf')) return []
    return [
      {
        fileName: cells[1],
        kind: cells[2].toUpperCase().includes('SIMULACION') ? ('simulation' as const) : ('test' as const),
        documentType: cells[3],
        folio: Number(cells[4]),
        copy: cells[5],
        caseId: cells[6] === undefined || cells[6] === '' ? null : decodeEntities(cells[6]),
      },
    ]
  })
}

const countByType = (rows: readonly SampleDetail[]): string =>
  [
    ...rows.reduce(
      (map, row) => map.set(row.documentType, (map.get(row.documentType) ?? 0) + 1),
      new Map<string, number>(),
    ),
  ]
    .map(([type, count]) => `${type} ${count}`)
    .join(', ')

/**
 * EN: What the SII recognised, in one sentence: how many documents it filed as the test set (with their cases) and
 * how many as the simulation, by document type, the transferable copies left out. A set whose documents the SII
 * filed as simulation was not the envelope the SII registered for that set.
 * ES: Lo que reconoció el SII, en una frase: cuántos documentos clasificó como set de pruebas (con sus casos) y cuántos
 * como simulación, por tipo de documento, sin las copias cedibles. Un set cuyos documentos el SII clasificó como
 * simulación no era el sobre que el SII registró para ese set.
 */
export const summarizeSampleDetails = (rows: readonly SampleDetail[]): string => {
  const originals = rows.filter((row) => !row.copy.toUpperCase().includes('CEDIBLE'))
  const tests = originals.filter((row) => row.kind === 'test')
  const simulation = originals.filter((row) => row.kind === 'simulation')
  const cases = [...new Set(tests.flatMap((row) => (row.caseId === null ? [] : [row.caseId])))]
  return `The SII recognised ${tests.length} document(s) as the test set (cases ${cases.length === 0 ? 'none' : cases.join(', ')}: ${countByType(tests) || 'none'}) and ${simulation.length} as the simulation (${countByType(simulation) || 'none'}). A set missing from the cases was not the envelope the SII registered for it.`
}
```

`src/portal/session.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/portal/session.ts b/src/portal/session.ts
index 33de075..f97977d 100644
--- a/src/portal/session.ts
+++ b/src/portal/session.ts
@@ -161,6 +161,39 @@ const jsonHeaders = (
   ...contextHeaders(url, cookies, referer),
 })
 
+// The headers of a raw post (a multipart body, a GWT-RPC body): the browser's, with the given content type and
+// whatever the caller adds.
+const rawHeaders = (
+  url: string,
+  cookies: CookieJar,
+  referer: string | undefined,
+  contentType: string,
+  extra: Readonly<Record<string, string>>,
+): Readonly<Record<string, string>> => ({
+  'User-Agent': USER_AGENT,
+  Accept: '*/*',
+  'Accept-Language': ACCEPT_LANGUAGE,
+  'Content-Type': contentType,
+  Origin: new URL(url).origin,
+  ...contextHeaders(url, cookies, referer),
+  ...extra,
+})
+
+/**
+ * EN: What a request may carry: a form, a JSON value, or raw bytes with their content type, plus the referer and any
+ * header the page expects.
+ * ES: Lo que puede llevar una petición: un formulario, un valor JSON, o bytes crudos con su tipo de contenido, más el
+ * referer y cualquier cabecera que la página espere.
+ */
+export type PortalRequestOptions = {
+  readonly form?: Readonly<Record<string, string>>
+  readonly json?: unknown
+  readonly body?: Uint8Array
+  readonly contentType?: string
+  readonly referer?: string
+  readonly headers?: Readonly<Record<string, string>>
+}
+
 // A document or a JSON answer may say anything: only a page can be the firewall's.
 const isStructuredBody = (text: string): boolean => /^\s*(?:<\?xml|[{[])/.test(text)
 
@@ -208,16 +241,24 @@ export const portalRequest = async (
   step: string,
   method: HttpMethod,
   url: string,
-  options: {
-    readonly form?: Readonly<Record<string, string>>
-    readonly json?: unknown
-    readonly referer?: string
-  } = {},
+  options: PortalRequestOptions = {},
 ): Promise<PortalPage> => {
   const { portal, overrides, state } = context
   const operation = `${context.operation}.${step}`
   const text = options.json === undefined ? options.form && formEncode(options.form) : JSON.stringify(options.json)
-  const body = text === undefined ? undefined : encodeUtf8(text)
+  const body = options.body ?? (text === undefined ? undefined : encodeUtf8(text))
+  const headersOf = (): Readonly<Record<string, string>> => {
+    if (options.body !== undefined)
+      return rawHeaders(
+        url,
+        state.cookies,
+        options.referer,
+        options.contentType ?? 'application/octet-stream',
+        options.headers ?? {},
+      )
+    if (options.json !== undefined) return { ...jsonHeaders(url, state.cookies, options.referer), ...options.headers }
+    return { ...requestHeaders(url, method, state.cookies, options.referer), ...options.headers }
+  }
   const response = await withRetry(
     mergeRetryPolicy(portal.retry, overrides?.retry),
     async (attempt) => {
@@ -226,10 +267,7 @@ export const portalRequest = async (
         channel: 'portal',
         method,
         url,
-        headers:
-          options.json === undefined
-            ? requestHeaders(url, method, state.cookies, options.referer)
-            : jsonHeaders(url, state.cookies, options.referer),
+        headers: headersOf(),
         body,
         timeoutMs: overrides?.timeoutMs ?? portal.timeoutMs,
         signal: overrides?.signal,
@@ -279,7 +317,7 @@ export const navigate = async (
   step: string,
   method: HttpMethod,
   url: string,
-  options: { readonly form?: Readonly<Record<string, string>>; readonly referer?: string } = {},
+  options: PortalRequestOptions = {},
 ): Promise<PortalPage> => followRedirects(context, step, await portalRequest(context, step, method, url, options))
 
 const sessionLimit = (context: PortalContext): DteError =>
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/pages-exchange tests/portal/pages-samples tests/portal/session --coverage=false
```

Expected: PASS, 67 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/portal/pages/exchange.ts src/portal/pages/samples.ts src/portal/session.ts tests/support/gwt-answers.ts tests/portal/pages-exchange.test.ts tests/portal/pages-samples.test.ts tests/portal/session.test.ts
```

```bash
git commit -F - <<'MSG'
feat: raw bodies on the portal session and the pages of the exchange and samples portals

portalRequest takes raw bytes with their content type and extra headers
beside a form or a JSON value, for the multipart and GWT-RPC posts; the
exchange pages read the set download, the user validation with its
state, a refused upload and a confirmation; the samples pages read the
review state, its id and token, the date, the rejection detail table
and its summary.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 3: The exchange portal operations

The four operations on the exchange portal (spec 3.5): `downloadExchangeSet` (the warm-up, `downloadFile` with the company in the query and an empty multipart body; a page that is no set is `SII_PORTAL_UNEXPECTED_PAGE` with the redacted page in `details.page`), `validateExchangeUser` (`validarUsuario` with the certificate holder and the company, the wire of spec 3.5, the hashes discovered once and returned for the next calls), `uploadExchangeAnswers` (`uploadFile1`, `2`, `3` in the portal's order, one `uploadFormElement` part each, a refused page stops the sequence, never retried by the transport) and `confirmExchange` (`validarSetContriPostSeguimiento`, then `updatePostulacionSeguimiento` for 40, 41 and 43, each needing `//OK`). The catalog names the two GWT portals with their known hashes and the answer files; the session gains `ensureSession` (the GWT portals never ask for a login); the GWT module gains the warm-up with one redirect, the choice of hashes, the posting of one call and the parameter helpers; the portal catalog gains three rejections.

**Files:**

- Create: `src/portal/exchange.ts`
- Modify: `src/catalogs/certification.ts`
- Modify: `src/catalogs/portal.ts`
- Modify: `src/portal/gwt.ts`
- Modify: `src/portal/session.ts`
- Test (create): `tests/portal/exchange.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/portal/exchange.test.ts` (new file, whole):

```ts
import { EXCHANGE_PORTAL } from '../../src/catalogs/certification'
import {
  confirmExchange,
  downloadExchangeSet,
  uploadExchangeAnswers,
  validateExchangeUser,
} from '../../src/portal/exchange'
import type { Logger } from '../../src/sii/logger'
import type { FakeReply, FakeRoute, RecordedRequest } from '../support/fake-sii'
import { FIXED_NOW, RECEIVER_RUT } from '../support/fixtures'
import { EMPTY_OK, EXCEPTION, okAnswer } from '../support/gwt-answers'
import { certificate, failure, HERCULES, portalWith, signedIn, type PortalHarness } from '../support/portal'
import { page } from '../support/portal-pages'

const BASE = EXCHANGE_PORTAL.base
const FACADE = `${BASE}facade`
const KNOWN = EXCHANGE_PORTAL.known
const SERVICE = EXCHANGE_PORTAL.serviceInterface
const BOUNDARY = `----WebKitFormBoundary${FIXED_NOW.getTime().toString(16)}`
const COMPANY_QUERY = '?re=76543210&dve=3'
const SET_XML = '<?xml version="1.0" encoding="ISO-8859-1"?><EnvioDTE><SetDTE ID="SetDoc"></SetDTE></EnvioDTE>'
const REFUSED_PAGE = '<html><head><title>ERROR</title></head><body>no vienen los parametros necesarios</body></html>'
const INTEGER = 'java.lang.Integer/3438268394'
const STRING = 'java.lang.String/2004016611'
const USER_TYPE = 'cl.sii.sdi.dim.pfe.to.UsuarioTo/3723336533'
const FOLLOW_UP_TYPE = 'cl.sii.sdi.dim.pfe.to.PostulacionSeguimientoTo/3921005560'
const ENTRY = 'https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoCertificado.html*'
const LOGIN_OK = {
  status: 302,
  headers: {
    Location: 'https://misiir.sii.cl/cgi_misii/siihome.cgi',
    'Set-Cookie': 'NETSCAPE_LIVEWIRE.rut=12345678; Domain=.sii.cl; Path=/, NETSCAPE_LIVEWIRE.dv=5; Path=/',
  },
}
const HOME = { url: 'https://misiir.sii.cl/cgi_misii/siihome.cgi', reply: { body: page('Mi SII') } }

const warmUp: readonly FakeRoute[] = [
  {
    method: 'GET',
    url: BASE,
    reply: { status: 302, headers: { location: '/pfeInternet/index.html', 'set-cookie': 'PFE=warm; Path=/' } },
  },
  {
    method: 'GET',
    url: `${BASE}index.html`,
    reply: { body: '<html>portal</html>', headers: { 'set-cookie': 'JSESSIONID=abc; Path=/pfeInternet' } },
  },
]
const nocache: FakeRoute = {
  method: 'GET',
  url: `${BASE}pfe.nocache.js`,
  reply: { body: `var p='${KNOWN.permutation}';` },
}
const facade = (reply: FakeReply | ((request: RecordedRequest) => FakeReply)): FakeRoute => ({
  method: 'POST',
  url: FACADE,
  reply,
})
const download = (reply: FakeReply, query = COMPANY_QUERY): FakeRoute => ({
  method: 'POST',
  url: `${BASE}downloadFile${query}`,
  reply,
})
const upload = (index: number, ...replies: FakeReply[]): FakeRoute => ({
  method: 'POST',
  url: `${BASE}uploadFile${index}${COMPANY_QUERY}`,
  reply: replies,
})
const methodOf = (request: RecordedRequest): string => request.text.split('|')[6]
const facadePosts = (harness: PortalHarness): readonly RecordedRequest[] =>
  harness.fake.requests.filter((request) => request.url === FACADE)
const logger = (): Logger & { readonly lines: string[] } => {
  const lines: string[] = []
  const log = (message: string): void => {
    lines.push(message)
  }
  return { debug: log, info: log, warn: log, error: log, lines }
}
const ANSWERS = {
  reception: '<RespuestaDTE>1</RespuestaDTE>',
  receipts: '<EnvioRecibos/>',
  approval: '<RespuestaDTE>3</RespuestaDTE>',
}

describe('downloadExchangeSet', () => {
  test('warms the portal up through one redirect, merges its cookies and posts the empty multipart with the company in the query', async () => {
    const harness = await signedIn([...warmUp, download({ body: SET_XML })])
    await expect(downloadExchangeSet(harness.portal)).resolves.toEqual({ xml: SET_XML })
    expect(harness.urls()).toEqual([BASE, `${BASE}index.html`, `${BASE}downloadFile${COMPANY_QUERY}`])
    const [, redirected, request] = harness.fake.requests
    expect(redirected.headers['referer']).toBe(BASE)
    expect(request.headers['content-type']).toBe(`multipart/form-data; boundary=${BOUNDARY}`)
    expect(request.text).toBe(`--${BOUNDARY}--\r\n`)
    expect(request.headers['referer']).toBe(BASE)
    expect(request.headers['origin']).toBe('https://www4.sii.cl')
    expect(request.headers['cookie']).toContain('NETSCAPE_LIVEWIRE.rut=12345678')
    expect(request.headers['cookie']).toContain('PFE=warm')
    expect(request.headers['cookie']).toContain('JSESSIONID=abc')
  })

  test('logs a failed warm-up and goes on', async () => {
    const log = logger()
    const harness = await signedIn(
      [{ method: 'GET', url: BASE, reply: new Error('socket hang up') }, download({ body: SET_XML })],
      {
        logger: log,
      },
    )
    await expect(downloadExchangeSet(harness.portal)).resolves.toEqual({ xml: SET_XML })
    expect(log.lines).toContain('gwt portal warm-up failed')
    expect(harness.urls()).toHaveLength(2)
  })

  test('a page that is no set is unexpected, with the whole page in the details', async () => {
    const harness = await signedIn([
      { method: 'GET', url: BASE, reply: { body: '<html>portal</html>' } },
      download({ body: REFUSED_PAGE }),
    ])
    const error = await failure(downloadExchangeSet(harness.portal))
    expect(error.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect(error.details).toMatchObject({ step: 'downloadFile', httpStatus: 200, page: REFUSED_PAGE })
    expect(harness.urls()).toEqual([BASE, `${BASE}downloadFile${COMPANY_QUERY}`])
  })

  test('logs in first when the jar holds no session, and takes the company from the call', async () => {
    const harness = portalWith([
      { url: ENTRY, reply: { body: page('x'), headers: { 'Set-Cookie': 'TS01=abc; Path=/' } } },
      { url: `${HERCULES}*`, method: 'POST', reply: LOGIN_OK },
      HOME,
      ...warmUp,
      download({ body: SET_XML }, '?re=12345678&dve=5'),
    ])
    await expect(downloadExchangeSet(harness.portal, { companyRut: '12.345.678-5' })).resolves.toEqual({ xml: SET_XML })
    expect(harness.urls().slice(0, 3)).toEqual([
      `https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoCertificado.html?${HOME.url}`,
      `${HERCULES}?${HOME.url}`,
      HOME.url,
    ])
    const request = harness.fake.requests[harness.fake.requests.length - 1]
    expect(request.url).toBe(`${BASE}downloadFile?re=12345678&dve=5`)
    expect(request.headers['cookie']).toContain('NETSCAPE_LIVEWIRE.rut=12345678')
  })
})

describe('validateExchangeUser', () => {
  test('posts validarUsuario with the certificate holder and the company, over the discovered hashes', async () => {
    const harness = await signedIn([...warmUp, nocache, facade({ body: EMPTY_OK })])
    const result = await validateExchangeUser(harness.portal, { companyRut: RECEIVER_RUT })
    expect(result).toEqual({
      inExchange: true,
      state: null,
      completed: false,
      message: null,
      hashes: KNOWN,
      body: EMPTY_OK,
    })
    expect(harness.urls()).toEqual([BASE, `${BASE}index.html`, `${BASE}pfe.nocache.js`, FACADE])
    const [request] = facadePosts(harness)
    expect(request.text).toBe(
      `7|0|8|${BASE}|${KNOWN.policy}|${SERVICE}|validarUsuario|${USER_TYPE}|3|5|${INTEGER}|1|2|3|4|1|5|5|0|0|0|0|6|7|8|12345678|0|0|0|0|0|8|76543210|`,
    )
    expect(request.headers).toMatchObject({
      'content-type': 'text/x-gwt-rpc; charset=UTF-8',
      'x-gwt-module-base': BASE,
      'x-gwt-permutation': KNOWN.permutation,
      origin: 'https://www4.sii.cl',
      referer: BASE,
    })
    expect(request.headers['cookie']).toContain('JSESSIONID=abc')
  })

  test('reads the state the portal names when the company is not in the exchange, with the hashes given', async () => {
    const gwt = { permutation: 'A'.repeat(32), policy: 'B'.repeat(32) }
    const message = 'La empresa no esta en estado P06, estado: P90'
    const harness = await signedIn([...warmUp, facade({ body: okAnswer([0], [USER_TYPE, message]) })])
    const result = await validateExchangeUser(harness.portal, { gwt })
    expect(result).toMatchObject({ inExchange: false, state: 'P90', completed: true, message, hashes: gwt })
    const [request] = facadePosts(harness)
    expect(request.text).toContain(`|${gwt.policy}|`)
    expect(request.headers['x-gwt-permutation']).toBe(gwt.permutation)
    expect(harness.urls()).not.toContain(`${BASE}pfe.nocache.js`)
  })

  test('refuses a certificate that names no holder before touching the portal', async () => {
    const harness = await signedIn([], { certificate: { ...certificate, rut: null } })
    const error = await failure(validateExchangeUser(harness.portal))
    expect(error.code).toBe('MISSING_FIELD')
    expect(error.details).toEqual({ field: 'certificate.rut' })
    expect(harness.urls()).toEqual([])
  })
})

describe('uploadExchangeAnswers', () => {
  test('posts the three answers in the portal order, each as one text/xml part named uploadFormElement', async () => {
    const harness = await signedIn([
      ...warmUp,
      upload(1, { body: 'uno' }),
      upload(2, { body: 'dos' }),
      upload(3, { body: 'tres' }),
    ])
    const result = await uploadExchangeAnswers(harness.portal, ANSWERS)
    expect(result.answers).toEqual([
      { fileName: 'respuesta-recepcion-envio.xml', body: 'uno' },
      { fileName: 'envio-recibos.xml', body: 'dos' },
      { fileName: 'respuesta-aprobacion-comercial.xml', body: 'tres' },
    ])
    const uploads = harness.fake.requests.slice(2)
    expect(uploads.map((request) => request.url)).toEqual([1, 2, 3].map((n) => `${BASE}uploadFile${n}${COMPANY_QUERY}`))
    expect(uploads.map((request) => request.parts)).toEqual([
      [
        {
          name: 'uploadFormElement',
          fileName: 'respuesta-recepcion-envio.xml',
          contentType: 'text/xml',
          value: ANSWERS.reception,
        },
      ],
      [{ name: 'uploadFormElement', fileName: 'envio-recibos.xml', contentType: 'text/xml', value: ANSWERS.receipts }],
      [
        {
          name: 'uploadFormElement',
          fileName: 'respuesta-aprobacion-comercial.xml',
          contentType: 'text/xml',
          value: ANSWERS.approval,
        },
      ],
    ])
    for (const request of uploads) {
      expect(request.headers['content-type']).toBe(`multipart/form-data; boundary=${BOUNDARY}`)
      expect(request.headers['referer']).toBe(BASE)
      expect(request.headers['origin']).toBe('https://www4.sii.cl')
    }
  })

  test('a refused page at HTTP 200 stops the sequence and names the file', async () => {
    const harness = await signedIn([...warmUp, upload(1, { body: 'uno' }), upload(2, { body: REFUSED_PAGE })])
    const error = await failure(uploadExchangeAnswers(harness.portal, ANSWERS))
    expect(error.code).toBe('SII_PORTAL_REJECTED')
    expect(error.details).toMatchObject({
      rejection: 'exchangeUploadRefused',
      file: 'envio-recibos.xml',
      httpStatus: 200,
    })
    expect(error.details['portalMessage']).toContain('no vienen los parametros')
    expect(harness.urls()).toHaveLength(4)
  })

  test('never retries an upload, even when the client retries', async () => {
    const harness = await signedIn([...warmUp, upload(1, { status: 503, body: 'busy' }, { body: 'uno' })], {
      retry: { maxAttempts: 3, initialDelayMs: 1 },
    })
    const error = await failure(uploadExchangeAnswers(harness.portal, ANSWERS))
    expect(error.code).toBe('SII_HTTP_ERROR')
    expect(error.details['httpStatus']).toBe(503)
    expect(harness.urls()).toHaveLength(3)
    expect(harness.sleeps).toEqual([])
  })
})

describe('confirmExchange', () => {
  const confirming = (failing?: number) =>
    facade((request) => {
      if (methodOf(request) === 'validarSetContriPostSeguimiento') return { body: okAnswer([1], ['validado']) }
      return { body: request.text.includes(`|${failing}|`) ? EXCEPTION : EMPTY_OK }
    })

  test('validates the set, then confirms the follow-up ids 40, 41 and 43 in order', async () => {
    const harness = await signedIn([...warmUp, nocache, confirming()])
    const result = await confirmExchange(harness.portal)
    expect(result).toEqual({
      validation: okAnswer([1], ['validado']),
      confirmations: [40, 41, 43].map((id) => ({ id, body: EMPTY_OK })),
    })
    const posts = facadePosts(harness)
    expect(posts.map((request) => request.text)).toEqual([
      `7|0|7|${BASE}|${KNOWN.policy}|${SERVICE}|validarSetContriPostSeguimiento|${INTEGER}|${STRING}|3|1|2|3|4|2|5|6|5|76543210|7|`,
      ...[40, 41, 43].map(
        (id) =>
          `7|0|7|${BASE}|${KNOWN.policy}|${SERVICE}|updatePostulacionSeguimiento|${FOLLOW_UP_TYPE}|${INTEGER}|3|1|2|3|4|1|5|5|6|${id}|0|0|0|0|7|6|76543210|`,
      ),
    ])
    expect(posts.every((request) => request.headers['x-gwt-permutation'] === KNOWN.permutation)).toBe(true)
  })

  test('a confirmation without //OK is unexpected, named by its id, and stops the sequence', async () => {
    const harness = await signedIn([...warmUp, nocache, confirming(41)])
    const error = await failure(confirmExchange(harness.portal, { gwt: KNOWN }))
    expect(error.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect(error.details['step']).toBe('updatePostulacionSeguimiento.41')
    expect(facadePosts(harness).map(methodOf)).toEqual([
      'validarSetContriPostSeguimiento',
      'updatePostulacionSeguimiento',
      'updatePostulacionSeguimiento',
    ])
  })

  test('never retries a confirmation call, even when the client retries', async () => {
    const harness = await signedIn([...warmUp, nocache, facade({ status: 503, body: 'busy' })], {
      retry: { maxAttempts: 3, initialDelayMs: 1 },
    })
    const error = await failure(confirmExchange(harness.portal))
    expect(error.code).toBe('SII_HTTP_ERROR')
    expect(facadePosts(harness)).toHaveLength(1)
    expect(harness.sleeps).toEqual([])
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/exchange --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/portal/exchange'`; `EXCHANGE_PORTAL` is not exported by `src/catalogs/certification.ts`.

- [ ] **Step 3: Write the implementation**

`src/portal/exchange.ts` (new file, whole):

```ts
import {
  EXCHANGE_ANSWER_FILES,
  EXCHANGE_ANSWER_KEYS,
  EXCHANGE_PORTAL,
  type ExchangeAnswerKey,
} from '../catalogs/certification'
import { DteError } from '../errors'
import { splitSiiRut } from '../model/rut'
import type { CallOverrides } from '../sii/client'
import { redactText } from '../sii/capture'
import { buildMultipartBody, multipartContentType } from '../sii/multipart'
import { encodeUtf8 } from '../sii/transport'
import { encodeLatin1 } from '../text/latin1'
import { resolvePortalCompany, type PortalClient } from './client'
import {
  GWT_NULL,
  gwtHashesOf,
  gwtInteger,
  gwtString,
  portalBoundary,
  postGwt,
  warmUpGwtPortal,
  type GwtHashes,
  type GwtParameter,
} from './gwt'
import {
  exchangeUserState,
  isConfirmed,
  isExchangeSet,
  isUploadRefused,
  uploadMessage,
  type ExchangeUserState,
} from './pages/exchange'
import {
  ensureSession,
  portalRequest,
  rejected,
  unexpectedPage,
  withPortalSession,
  type PortalContext,
} from './session'

const USER_TYPE = 'cl.sii.sdi.dim.pfe.to.UsuarioTo/3723336533'
const FOLLOW_UP_TYPE = 'cl.sii.sdi.dim.pfe.to.PostulacionSeguimientoTo/3921005560'
const FOLLOW_UP_IDS: readonly number[] = [40, 41, 43]
const UPLOAD_FIELD = 'uploadFormElement'
const XML_CONTENT_TYPE = 'text/xml'

type Party = { readonly digits: string; readonly verifier: string }

// The company and the certificate holder as the portal wants them: the digits and the upper-cased verifier, whatever
// the input's dots or case. The holder's RUT comes from the parsed certificate, never from a file name.
const partyOf = (rut: Parameters<typeof splitSiiRut>[0]): Party => {
  const { body, verifier } = splitSiiRut(rut)
  return { digits: body, verifier }
}

const companyOf = (portal: PortalClient, companyRut?: string): Party =>
  partyOf(resolvePortalCompany(portal, companyRut))

const holderOf = (portal: PortalClient): Party => {
  if (portal.certificate.rut === null) throw new DteError('MISSING_FIELD', { field: 'certificate.rut' })
  return partyOf(portal.certificate.rut)
}

const query = (company: Party): string => `?re=${company.digits}&dve=${company.verifier}`

const enter = async (context: PortalContext): Promise<void> => {
  await ensureSession(context)
  await warmUpGwtPortal(context, EXCHANGE_PORTAL)
}

// A post that changes the application (an upload, a confirmation) is sent once: a retry after a timeout could repeat it.
const once = (context: PortalContext): PortalContext => ({
  ...context,
  overrides: { ...context.overrides, retry: false },
})

/**
 * EN: Input of the exchange operations that only name the company.
 * ES: Entrada de las operaciones del intercambio que solo nombran a la empresa.
 */
export type ExchangeCompanyInput = {
  /** EN: Company RUT; the client's by default. ES: `re` + `dve` — RUT de la empresa; por defecto el del cliente. */
  readonly companyRut?: string
}

/**
 * EN: Input of the exchange operations that call the portal's service.
 * ES: Entrada de las operaciones del intercambio que llaman al servicio del portal.
 */
export type ExchangeGwtInput = ExchangeCompanyInput & {
  /** EN: The portal's hashes, when the caller knows them; discovered otherwise. ES: Los hashes del portal, si el llamador los conoce; si no, se descubren. */
  readonly gwt?: GwtHashes
}

/**
 * EN: What `downloadExchangeSet` read.
 * ES: Lo que leyó `downloadExchangeSet`.
 */
export type ExchangeSetDownload = {
  /** EN: The exchange set, as the portal served it. ES: El set de intercambio, como lo sirvió el portal. */
  readonly xml: string
}

/**
 * EN: What `validateExchangeUser` read: the state and the raw answer, with the hashes used, for the next calls.
 * ES: Lo que leyó `validateExchangeUser`: el estado y la respuesta cruda, con los hashes usados, para las llamadas siguientes.
 */
export type ExchangeUserValidation = ExchangeUserState & {
  /** EN: The hashes the call used. ES: Los hashes que usó la llamada. */
  readonly hashes: GwtHashes
  /** EN: The raw answer, for the artefacts. ES: La respuesta cruda, para los artefactos. */
  readonly body: string
}

/**
 * EN: Input of `uploadExchangeAnswers`: the three answers as XML, signed.
 * ES: Entrada de `uploadExchangeAnswers`: las tres respuestas en XML, firmadas.
 */
export type UploadExchangeAnswersInput = ExchangeCompanyInput & {
  /** EN: The reception response (`respuesta-recepcion-envio.xml`). ES: `RespuestaDTE/Resultado/RecepcionEnvio` — La respuesta de recepción. */
  readonly reception: string
  /** EN: The receipts (`envio-recibos.xml`). ES: `EnvioRecibos` — Los recibos. */
  readonly receipts: string
  /** EN: The commercial approval (`respuesta-aprobacion-comercial.xml`). ES: `RespuestaDTE/Resultado/ResultadoDTE` — La aprobación comercial. */
  readonly approval: string
}

/**
 * EN: What one upload page answered.
 * ES: Lo que respondió una página de subida.
 */
export type ExchangeUploadAnswer = {
  /** EN: The file name sent. ES: El nombre de archivo enviado. */
  readonly fileName: string
  /** EN: The page, for the artefacts; its success wording has never been recorded. ES: La página, para los artefactos; su texto de éxito nunca se ha registrado. */
  readonly body: string
}

/**
 * EN: What `uploadExchangeAnswers` did.
 * ES: Lo que hizo `uploadExchangeAnswers`.
 */
export type ExchangeUploadResult = {
  /** EN: The three upload pages, in upload order. ES: Las tres páginas de subida, en orden de subida. */
  readonly answers: readonly ExchangeUploadAnswer[]
}

/**
 * EN: What one follow-up confirmation answered.
 * ES: Lo que respondió una confirmación de seguimiento.
 */
export type ExchangeConfirmationAnswer = {
  /** EN: The follow-up id confirmed (40, 41 or 43). ES: El id de seguimiento confirmado (40, 41 o 43). */
  readonly id: number
  /** EN: The raw answer. ES: La respuesta cruda. */
  readonly body: string
}

/**
 * EN: What `confirmExchange` did.
 * ES: Lo que hizo `confirmExchange`.
 */
export type ExchangeConfirmation = {
  /** EN: The raw answer of the set validation, kept, not judged. ES: La respuesta cruda de la validación del set, guardada, no juzgada. */
  readonly validation: string
  /** EN: The three confirmations, in order. ES: Las tres confirmaciones, en orden. */
  readonly confirmations: readonly ExchangeConfirmationAnswer[]
}

/**
 * EN: Downloads the exchange set from the exchange portal: the warm-up, then `downloadFile` with the company in the
 * query and an empty multipart body. The download does not change the application.
 * ES: Descarga el set de intercambio del portal de intercambio: el calentamiento y luego `downloadFile` con la empresa
 * en la query y un cuerpo multipart vacío. La descarga no cambia la postulación.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the company. ES: la empresa.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the set XML. ES: el XML del set.
 * @throws {DteError} EN: `SII_PORTAL_UNEXPECTED_PAGE` with the page in `details.page` when the answer is no set, redacted as every capture (the set can be saved by hand from the portal); `MISSING_FIELD`; session, block and transport codes. ES: los mismos códigos.
 */
export const downloadExchangeSet = (
  portal: PortalClient,
  input: ExchangeCompanyInput = {},
  overrides?: CallOverrides,
): Promise<ExchangeSetDownload> =>
  withPortalSession(portal, 'downloadExchangeSet', overrides, async (context) => {
    const company = companyOf(portal, input.companyRut)
    await enter(context)
    const boundary = portalBoundary(portal.now())
    const page = await portalRequest(
      context,
      'downloadFile',
      'POST',
      `${EXCHANGE_PORTAL.base}downloadFile${query(company)}`,
      {
        body: encodeLatin1(`--${boundary}--\r\n`),
        contentType: multipartContentType(boundary),
        referer: EXCHANGE_PORTAL.base,
      },
    )
    if (!isExchangeSet(page.status, page.html))
      throw new DteError('SII_PORTAL_UNEXPECTED_PAGE', {
        ...unexpectedPage(context, 'downloadFile', page.html).details,
        httpStatus: page.status,
        page: redactText(page.html),
      })
    return { xml: page.html }
  })

/**
 * EN: Validates the user on the exchange portal: the warm-up, the hashes, then `validarUsuario` with the company and
 * the certificate holder. The answer says whether the company stands in the exchange stage; `//OK` is not required.
 * ES: Valida al usuario en el portal de intercambio: el calentamiento, los hashes y luego `validarUsuario` con la
 * empresa y el titular del certificado. La respuesta dice si la empresa está en la etapa de intercambio; no se exige `//OK`.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the company and the hashes. ES: la empresa y los hashes.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the state, the hashes used and the raw answer. ES: el estado, los hashes usados y la respuesta cruda.
 * @throws {DteError} EN: `MISSING_FIELD { field: 'certificate.rut' }` when the certificate names no holder; session, block and transport codes. ES: los mismos códigos.
 */
export const validateExchangeUser = (
  portal: PortalClient,
  input: ExchangeGwtInput = {},
  overrides?: CallOverrides,
): Promise<ExchangeUserValidation> =>
  withPortalSession(portal, 'validateExchangeUser', overrides, async (context) => {
    const company = companyOf(portal, input.companyRut)
    const holder = holderOf(portal)
    await enter(context)
    const hashes = await gwtHashesOf(context, EXCHANGE_PORTAL, input.gwt)
    const user: GwtParameter = {
      kind: 'object',
      type: USER_TYPE,
      fields: [
        GWT_NULL,
        GWT_NULL,
        GWT_NULL,
        GWT_NULL,
        gwtString(holder.verifier),
        gwtString(company.verifier),
        gwtInteger(Number(company.digits)),
        GWT_NULL,
        GWT_NULL,
        GWT_NULL,
        GWT_NULL,
        GWT_NULL,
        gwtInteger(Number(holder.digits)),
      ],
    }
    const { page, answer } = await postGwt(context, 'validarUsuario', EXCHANGE_PORTAL, hashes, 'validarUsuario', [user])
    return { ...exchangeUserState(answer), hashes, body: page.html }
  })

const uploadAll = async (
  context: PortalContext,
  company: Party,
  input: UploadExchangeAnswersInput,
  keys: readonly ExchangeAnswerKey[],
  done: readonly ExchangeUploadAnswer[],
): Promise<readonly ExchangeUploadAnswer[]> => {
  const [key, ...rest] = keys
  if (key === undefined) return done
  const fileName = EXCHANGE_ANSWER_FILES[key]
  const step = `uploadFile${done.length + 1}`
  const boundary = portalBoundary(context.portal.now())
  const page = await portalRequest(context, step, 'POST', `${EXCHANGE_PORTAL.base}${step}${query(company)}`, {
    body: buildMultipartBody({
      boundary,
      fields: [],
      file: { name: UPLOAD_FIELD, fileName, contentType: XML_CONTENT_TYPE, bytes: encodeUtf8(input[key]) },
    }),
    contentType: multipartContentType(boundary),
    referer: EXCHANGE_PORTAL.base,
  })
  if (isUploadRefused(page.status, page.html))
    throw rejected(context, 'exchangeUploadRefused', {
      file: fileName,
      httpStatus: page.status,
      portalMessage: uploadMessage(redactText(page.html)),
    })
  return uploadAll(context, company, input, rest, [...done, { fileName, body: page.html }])
}

/**
 * EN: Uploads the three exchange answers, in the portal's order: the reception response to `uploadFile1`, the receipts
 * to `uploadFile2`, the commercial approval to `uploadFile3`, each a single `uploadFormElement` part. A refused page
 * stops the sequence; anything not refused counts as uploaded (the success page has never been recorded). No retries.
 * ES: Sube las tres respuestas del intercambio, en el orden del portal: la respuesta de recepción a `uploadFile1`, los
 * recibos a `uploadFile2`, la aprobación comercial a `uploadFile3`, cada una como una sola parte `uploadFormElement`.
 * Una página que rechaza detiene la secuencia; todo lo no rechazado cuenta como subido (la página de éxito nunca se ha
 * registrado). Sin reintentos.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the three answers and the company. ES: las tres respuestas y la empresa.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the three upload pages. ES: las tres páginas de subida.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED { rejection: 'exchangeUploadRefused', file }`; `MISSING_FIELD`; session, block and transport codes. ES: los mismos códigos.
 */
export const uploadExchangeAnswers = (
  portal: PortalClient,
  input: UploadExchangeAnswersInput,
  overrides?: CallOverrides,
): Promise<ExchangeUploadResult> =>
  withPortalSession(portal, 'uploadExchangeAnswers', overrides, async (context) => {
    const company = companyOf(portal, input.companyRut)
    await enter(context)
    return { answers: await uploadAll(once(context), company, input, EXCHANGE_ANSWER_KEYS, []) }
  })

const confirmAll = async (
  context: PortalContext,
  hashes: GwtHashes,
  company: Party,
  ids: readonly number[],
  done: readonly ExchangeConfirmationAnswer[],
): Promise<readonly ExchangeConfirmationAnswer[]> => {
  const [id, ...rest] = ids
  if (id === undefined) return done
  const step = `updatePostulacionSeguimiento.${id}`
  const followUp: GwtParameter = {
    kind: 'object',
    type: FOLLOW_UP_TYPE,
    fields: [
      gwtInteger(id),
      GWT_NULL,
      GWT_NULL,
      GWT_NULL,
      GWT_NULL,
      gwtString(company.verifier),
      gwtInteger(Number(company.digits)),
    ],
  }
  const { page } = await postGwt(context, step, EXCHANGE_PORTAL, hashes, 'updatePostulacionSeguimiento', [followUp])
  if (!isConfirmed(page.html)) throw unexpectedPage(context, step, page.html)
  return confirmAll(context, hashes, company, rest, [...done, { id, body: page.html }])
}

/**
 * EN: Confirms the exchange on the portal: `validarSetContriPostSeguimiento` with the company (its answer is kept, not
 * judged), then `updatePostulacionSeguimiento` for the follow-up ids 40, 41 and 43, one per uploaded answer, each of
 * which must answer `//OK`. The three confirmations are what moves the application to the printed samples stage. No retries.
 * ES: Confirma el intercambio en el portal: `validarSetContriPostSeguimiento` con la empresa (su respuesta se guarda,
 * no se juzga) y luego `updatePostulacionSeguimiento` para los ids de seguimiento 40, 41 y 43, uno por respuesta subida,
 * cada uno de los cuales debe responder `//OK`. Las tres confirmaciones son lo que mueve la postulación a la etapa de
 * muestras impresas. Sin reintentos.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the company and the hashes. ES: la empresa y los hashes.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the validation answer and the three confirmations. ES: la respuesta de la validación y las tres confirmaciones.
 * @throws {DteError} EN: `SII_PORTAL_UNEXPECTED_PAGE` whose `details.step` names the id that did not confirm; `MISSING_FIELD`; session, block and transport codes. ES: los mismos códigos.
 */
export const confirmExchange = (
  portal: PortalClient,
  input: ExchangeGwtInput = {},
  overrides?: CallOverrides,
): Promise<ExchangeConfirmation> =>
  withPortalSession(portal, 'confirmExchange', overrides, async (context) => {
    const company = companyOf(portal, input.companyRut)
    await enter(context)
    const hashes = await gwtHashesOf(context, EXCHANGE_PORTAL, input.gwt)
    const sent = once(context)
    const { page } = await postGwt(
      sent,
      'validarSetContriPostSeguimiento',
      EXCHANGE_PORTAL,
      hashes,
      'validarSetContriPostSeguimiento',
      [gwtInteger(Number(company.digits)), gwtString(company.verifier)],
    )
    return { validation: page.html, confirmations: await confirmAll(sent, hashes, company, FOLLOW_UP_IDS, []) }
  })
```

`src/catalogs/certification.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/catalogs/certification.ts b/src/catalogs/certification.ts
index 8a47c10..69dd1c4 100644
--- a/src/catalogs/certification.ts
+++ b/src/catalogs/certification.ts
@@ -195,3 +195,64 @@ export const CERTIFICATION_STEPS = [
 
 /** EN: Union of the progress event names. ES: Unión de los nombres de evento de progreso. */
 export type CertificationStep = (typeof CERTIFICATION_STEPS)[number]
+
+/**
+ * EN: A GWT portal of the SII: its module base, its RPC service path and interface, its module name and the hash pair
+ * known to work (captured in June 2026; the SII changes both when it redeploys the portal).
+ * ES: Un portal GWT del SII: la base de su módulo, la ruta e interfaz de su servicio RPC, el nombre de su módulo y el
+ * par de hashes que se sabe que funciona (capturado en junio de 2026; el SII cambia ambos al redesplegar el portal).
+ */
+export type GwtPortal = {
+  /** EN: The module base URL, with its trailing slash. ES: La URL base del módulo, con su barra final. */
+  readonly base: string
+  /** EN: The RPC service path under the base. ES: La ruta del servicio RPC bajo la base. */
+  readonly service: string
+  /** EN: The service interface name, the third string of every call. ES: El nombre de la interfaz del servicio, el tercer string de cada llamada. */
+  readonly serviceInterface: string
+  /** EN: The module name (`<name>.nocache.js`). ES: El nombre del módulo (`<name>.nocache.js`). */
+  readonly moduleName: string
+  /** EN: The permutation and policy hashes known to work. ES: Los hashes de permutación y política que se sabe que funcionan. */
+  readonly known: { readonly permutation: string; readonly policy: string }
+}
+
+/**
+ * EN: The exchange portal (`pfeInternet`): the certification's exchange set is downloaded there and its answers uploaded.
+ * ES: El portal de intercambio (`pfeInternet`): ahí se descarga el set de intercambio de la certificación y se suben sus respuestas.
+ */
+export const EXCHANGE_PORTAL: GwtPortal = {
+  base: 'https://www4.sii.cl/pfeInternet/',
+  service: 'facade',
+  serviceInterface: 'cl.sii.sdi.dim.pfe.web.client.service.Facade',
+  moduleName: 'pfe',
+  known: { permutation: 'E487C7488217509D4EDCE9D341782C20', policy: '4EB230A83E74980F353E4FCC209543CB' },
+}
+
+/**
+ * EN: The printed samples portal (`pdfdteInternet`), the SII's automatic validator of the printed documents.
+ * ES: El portal de muestras impresas (`pdfdteInternet`), el validador automático del SII de los documentos impresos.
+ */
+export const SAMPLES_PORTAL: GwtPortal = {
+  base: 'https://www4.sii.cl/pdfdteInternet/',
+  service: 'ServicePdfDte',
+  serviceInterface: 'cl.sii.sdi.dim.validaPdfDte.web.client.service.ServicePdfDte',
+  moduleName: 'pdfdte',
+  known: { permutation: 'D86ACF99AE5C17F0B0F673A9872EF6CB', policy: '5459B93B9D030A67564300FBD346270F' },
+}
+
+/** EN: The keys of the three exchange answers. ES: Las claves de las tres respuestas del intercambio. */
+export type ExchangeAnswerKey = 'reception' | 'receipts' | 'approval'
+
+/** EN: The exchange answers in upload order. ES: Las respuestas del intercambio en orden de subida. */
+export const EXCHANGE_ANSWER_KEYS: readonly ExchangeAnswerKey[] = ['reception', 'receipts', 'approval']
+
+/**
+ * EN: The file names of the exchange answers, as the portal's uploads name them: the reception response, the receipts
+ * and the commercial approval.
+ * ES: Los nombres de archivo de las respuestas del intercambio, como los nombran las subidas del portal: la respuesta
+ * de recepción, los recibos y la aprobación comercial.
+ */
+export const EXCHANGE_ANSWER_FILES: Readonly<Record<ExchangeAnswerKey, string>> = {
+  reception: 'respuesta-recepcion-envio.xml',
+  receipts: 'envio-recibos.xml',
+  approval: 'respuesta-aprobacion-comercial.xml',
+}
```

`src/catalogs/portal.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/catalogs/portal.ts b/src/catalogs/portal.ts
index bd56b28..e77306b 100644
--- a/src/catalogs/portal.ts
+++ b/src/catalogs/portal.ts
@@ -179,6 +179,9 @@ export type PortalRejection =
   | 'backupDayOverLimit'
   | 'backupDayUnknownTypes'
   | 'purchaseChangeNotConfirmed'
+  | 'exchangeUploadRefused'
+  | 'samplesReviewRefused'
+  | 'sampleUploadRefused'
 
 /**
  * EN: What each rejection means and what to do about it, in Spanish, for the operator.
@@ -236,6 +239,12 @@ export const PORTAL_REJECTIONS: Readonly<Record<PortalRejection, string>> = {
     'El portal no avanzó la postulación al paso siguiente: revisa el estado de los sets y libros en "Ver Avance de la Postulación".',
   declarationDeclined:
     'El portal no ofreció el formulario de declaración de avance: la fila pedida no existe en esta etapa, o la página muestra envíos con errores o reparos.',
+  exchangeUploadRefused:
+    'El portal de intercambio rechazó la subida de una respuesta: el archivo va en `details.file` y lo que dijo la página en `details.portalMessage`.',
+  samplesReviewRefused:
+    'El portal de muestras impresas no creó la revisión: el motivo es la frase del SII, en `details.portalMessage`.',
+  sampleUploadRefused:
+    'El portal de muestras impresas rechazó un PDF con un estado 4xx: el archivo va en `details.file` y el estado en `details.httpStatus`.',
 }
 
 /**
```

`src/portal/gwt.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/portal/gwt.ts b/src/portal/gwt.ts
index 31cd935..7699c92 100644
--- a/src/portal/gwt.ts
+++ b/src/portal/gwt.ts
@@ -1,5 +1,7 @@
+import type { GwtPortal } from '../catalogs/certification'
 import { errorMessage } from '../errors'
-import { portalRequest, type PortalContext } from './session'
+import { encodeUtf8 } from '../sii/transport'
+import { portalRequest, type PortalContext, type PortalPage } from './session'
 
 /**
  * EN: One parameter of a GWT-RPC call, as the SII's portals serialize it: a string (interned in the table, `0` when
@@ -304,3 +306,83 @@ export const discoverGwtHashes = async (context: PortalContext, input: GwtDiscov
     return warn(errorMessage(error))
   }
 }
+
+/** EN: A String parameter. ES: Un parámetro String. */
+export const gwtString = (value: string | null): GwtParameter => ({ kind: 'string', value })
+/** EN: A boxed Integer parameter. ES: Un parámetro Integer encajonado. */
+export const gwtInteger = (value: number): GwtParameter => ({ kind: 'integer', value })
+/** EN: A boxed Long parameter: a number, or a token as the portal wrote it. ES: Un parámetro Long encajonado: un número, o un token como lo escribió el portal. */
+export const gwtLong = (value: number | string): GwtParameter => ({ kind: 'long', value })
+/** EN: A primitive boolean parameter. ES: Un parámetro booleano primitivo. */
+export const gwtBoolean = (value: boolean): GwtParameter => ({ kind: 'boolean', value })
+/** EN: A null parameter or field. ES: Un parámetro o campo nulo. */
+export const GWT_NULL: GwtParameter = { kind: 'null' }
+
+const REDIRECT_STATUS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308])
+
+/**
+ * EN: The warm-up of a GWT portal: `GET` of its base with the session and one redirect followed, so the server opens
+ * the portal's context as it would for a browser; every cookie it sets joins the jar. A failure is logged and ignored.
+ * ES: El calentamiento de un portal GWT: `GET` de su base con la sesión y una redirección seguida, para que el servidor
+ * abra el contexto del portal como lo haría para un navegador; cada cookie que fija entra a la bolsa. Una falla se
+ * registra y se ignora.
+ */
+export const warmUpGwtPortal = async (context: PortalContext, portal: GwtPortal): Promise<void> => {
+  try {
+    const first = await portalRequest(context, 'warm-up', 'GET', portal.base)
+    const location = first.headers['location']
+    if (location !== undefined && REDIRECT_STATUS.has(first.status))
+      await portalRequest(context, 'warm-up', 'GET', new URL(location, portal.base).toString(), {
+        referer: portal.base,
+      })
+  } catch (error) {
+    context.portal.logger.warn('gwt portal warm-up failed', { module: portal.moduleName, reason: errorMessage(error) })
+  }
+}
+
+/**
+ * EN: The hashes of a portal for one operation: the caller's pair, else the discovery from the portal's known pair.
+ * ES: Los hashes de un portal para una operación: el par del llamador, si no el descubrimiento desde el par conocido del portal.
+ */
+export const gwtHashesOf = (context: PortalContext, portal: GwtPortal, override?: GwtHashes): Promise<GwtHashes> =>
+  discoverGwtHashes(context, {
+    moduleBase: portal.base,
+    moduleName: portal.moduleName,
+    known: portal.known,
+    ...(override === undefined ? {} : { override }),
+  })
+
+/**
+ * EN: One GWT-RPC call posted to a portal's service: the page and the answer read from it.
+ * ES: Una llamada GWT-RPC enviada al servicio de un portal: la página y la respuesta leída de ella.
+ */
+export const postGwt = async (
+  context: PortalContext,
+  step: string,
+  portal: GwtPortal,
+  hashes: GwtHashes,
+  method: string,
+  parameters: readonly GwtParameter[],
+  headers: Readonly<Record<string, string>> = {},
+): Promise<{ readonly page: PortalPage; readonly answer: GwtAnswer }> => {
+  const body = gwtBody({
+    moduleBase: portal.base,
+    policy: hashes.policy,
+    service: portal.serviceInterface,
+    method,
+    parameters,
+  })
+  const page = await portalRequest(context, step, 'POST', `${portal.base}${portal.service}`, {
+    body: encodeUtf8(body),
+    contentType: GWT_CONTENT_TYPE,
+    referer: portal.base,
+    headers: { ...gwtHeaders(portal.base, hashes.permutation), ...headers },
+  })
+  return { page, answer: gwtAnswer(page.html) }
+}
+
+/**
+ * EN: The multipart boundary of the portals' uploads: the browser's prefix and the clock in hexadecimal.
+ * ES: El límite multipart de las subidas de los portales: el prefijo del navegador y el reloj en hexadecimal.
+ */
+export const portalBoundary = (now: Date): string => `----WebKitFormBoundary${now.getTime().toString(16)}`
```

`src/portal/session.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/portal/session.ts b/src/portal/session.ts
index f97977d..a2755e9 100644
--- a/src/portal/session.ts
+++ b/src/portal/session.ts
@@ -548,6 +548,19 @@ const cachedSessionAlive = async (context: PortalContext): Promise<boolean> => {
   return page !== null && page.status === 200 && (page.html.includes('RUT_EMP') || page.html.includes('ad_empresa'))
 }
 
+/**
+ * EN: Makes sure the jar holds a session, logging in through the portal landing when it does not. The GWT portals
+ * never ask for a login themselves: a visitor without a session gets their pages all the same.
+ * ES: Se asegura de que la bolsa tenga una sesión, iniciándola por la portada del portal cuando no la tiene. Los
+ * portales GWT nunca piden iniciar sesión por sí mismos: un visitante sin sesión recibe sus páginas igual.
+ * @throws {DteError} EN: `SII_PORTAL_CERT_NOT_ENABLED`, `SII_PORTAL_SESSION_LIMIT`, `SII_PORTAL_LOGIN_FAILED`, `SII_PORTAL_BLOCKED`, transport codes. ES: los mismos códigos.
+ */
+export const ensureSession = async (context: PortalContext): Promise<void> => {
+  if (hasSessionCookie(context.state.cookies)) return
+  await portalRequest(context, 'entry', 'GET', `${CERTIFICATE_ENTRY_URL}?${PORTAL_LANDING_URL}`)
+  await login(context, PORTAL_LANDING_URL)
+}
+
 /**
  * EN: Opens a session explicitly, reusing a cached one that is still alive. The other operations do not need this: they
  * log in on demand.
@@ -562,8 +575,7 @@ export const openPortalSession = (portal: PortalClient, overrides?: CallOverride
   withPortalSession(portal, 'openPortalSession', overrides, async (context) => {
     if (await cachedSessionAlive(context)) return { userRut: sessionRut(context.state.cookies), reused: true }
     forgetSession(context)
-    await portalRequest(context, 'entry', 'GET', `${CERTIFICATE_ENTRY_URL}?${PORTAL_LANDING_URL}`)
-    await login(context, PORTAL_LANDING_URL)
+    await ensureSession(context)
     return { userRut: sessionRut(context.state.cookies), reused: false }
   })
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/exchange --coverage=false
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/portal/exchange.ts src/catalogs/certification.ts src/catalogs/portal.ts src/portal/gwt.ts src/portal/session.ts tests/portal/exchange.test.ts
```

```bash
git commit -F - <<'MSG'
feat: the exchange portal operations: set download, user validation, answer uploads and confirmation

The catalogs name the two GWT portals with their known hashes and the
exchange answer files; the session gains ensureSession for portals that
never ask for a login; the GWT module gains the warm-up, the hash choice,
the posting of one call and the parameter helpers. The uploads and the
confirmations are sent once; a refused upload page stops the sequence.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 4: The samples portal operations

The five operations on the samples portal (spec 3.7), every call with `Cache-Control: no-cache` and `Pragma: no-cache`: `readSamplesReview` (`leeImpreso` with the company RUT; HTTP 200 required; the state, the sentence that blocks, the id, the token and the date), `createSamplesReview` (`creaLista` with the company twice and the flag off; `//OK` and a readable id required; the SII's sentence is `samplesReviewRefused`), `uploadSample` (`POST upload` with the parts `Filedata`, `id` and `ambiente` in that order, the referer the permutation's `cache.html`; a 5xx retried up to four attempts with the same body, waiting 2, 4 and 6 s; a 4xx refused at once; the file name validated before any request), `submitSamplesReview` (`solicitaRevisionSII` with the Long token and the flag off) and `readSamplesDetail` (`muestraMail`; a failure is a warning and an empty detail). The multipart helper gains `buildMultipartParts`, which keeps the parts in the given order and refuses a CR, LF or quote in a part header.

**Files:**

- Create: `src/portal/samples.ts`
- Modify: `src/sii/multipart.ts`
- Test (create): `tests/portal/samples.test.ts`
- Test (modify): `tests/sii/multipart.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/portal/samples.test.ts` (new file, whole):

```ts
import { SAMPLES_PORTAL } from '../../src/catalogs/certification'
import {
  createSamplesReview,
  readSamplesDetail,
  readSamplesReview,
  submitSamplesReview,
  uploadSample,
} from '../../src/portal/samples'
import type { Logger } from '../../src/sii/logger'
import type { FakeReply, FakeRoute, RecordedRequest } from '../support/fake-sii'
import { FIXED_NOW } from '../support/fixtures'
import { detailAnswer, EMPTY_OK, EXCEPTION, okAnswer } from '../support/gwt-answers'
import { failure, signedIn, type PortalHarness } from '../support/portal'

const BASE = SAMPLES_PORTAL.base
const SERVICE_URL = `${BASE}ServicePdfDte`
const UPLOAD_URL = `${BASE}upload`
const KNOWN = SAMPLES_PORTAL.known
const SERVICE = SAMPLES_PORTAL.serviceInterface
const BOUNDARY = `----WebKitFormBoundary${FIXED_NOW.getTime().toString(16)}`
const STRING = 'java.lang.String/2004016611'
const LONG = 'java.lang.Long/4227064769'
const TOKEN = 'BAqo'
const REVIEW_ID = 264872
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46])

const warmUp: FakeRoute = { method: 'GET', url: BASE, reply: { body: '<html>portal</html>' } }
const nocache: FakeRoute = { method: 'GET', url: `${BASE}pdfdte.nocache.js`, reply: { body: `'${KNOWN.permutation}'` } }
const service = (reply: FakeReply | FakeReply[]): FakeRoute => ({ method: 'POST', url: SERVICE_URL, reply })
const upload = (...replies: FakeReply[]): FakeRoute => ({ method: 'POST', url: UPLOAD_URL, reply: replies })
const reviewAnswer = (state: string): string =>
  `//OK[7,6,'${TOKEN}',5,4,["java.util.ArrayList/4159755760","cl.sii.sdi.dim.validaPdfDte.to.ImpresoTo/1","${state}","2026-11-01 10:20","3"],0,7]`
const servicePosts = (harness: PortalHarness): readonly RecordedRequest[] =>
  harness.fake.requests.filter((request) => request.url === SERVICE_URL)
const uploads = (harness: PortalHarness): readonly RecordedRequest[] =>
  harness.fake.requests.filter((request) => request.url === UPLOAD_URL)
const logger = (): Logger & { readonly lines: string[] } => {
  const lines: string[] = []
  const log = (message: string): void => {
    lines.push(message)
  }
  return { debug: log, info: log, warn: log, error: log, lines }
}
const retrying = { retry: { maxAttempts: 3, initialDelayMs: 1 } }

describe('readSamplesReview', () => {
  test('posts leeImpreso with the company RUT, without caching, and reads the state, the id, the token and the date', async () => {
    const harness = await signedIn([warmUp, nocache, service({ body: reviewAnswer('INGRESO') })])
    const result = await readSamplesReview(harness.portal)
    expect(result).toEqual({
      state: 'INGRESO',
      blocked: null,
      revisionId: REVIEW_ID,
      revisionToken: TOKEN,
      sentAt: '2026-11-01 10:20',
      hashes: KNOWN,
      body: reviewAnswer('INGRESO'),
    })
    expect(harness.urls()).toEqual([BASE, `${BASE}pdfdte.nocache.js`, SERVICE_URL])
    const [request] = servicePosts(harness)
    expect(request.text).toBe(`7|0|6|${BASE}|${KNOWN.policy}|${SERVICE}|leeImpreso|${STRING}|76543210-3|1|2|3|4|1|5|6|`)
    expect(request.headers).toMatchObject({
      'content-type': 'text/x-gwt-rpc; charset=UTF-8',
      'x-gwt-module-base': BASE,
      'x-gwt-permutation': KNOWN.permutation,
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      origin: 'https://www4.sii.cl',
      referer: BASE,
    })
  })

  test('reads the sentence that blocks when the portal names no state', async () => {
    const message = "El estado de la postulacion NO es: 'DOCUMENTOS IMPRESOS'"
    const harness = await signedIn([
      warmUp,
      service({ body: okAnswer([0], ['cl.sii.sdi.dim.validaPdfDte.to.ImpresoTo/1', message]) }),
    ])
    const result = await readSamplesReview(harness.portal, { gwt: KNOWN })
    expect(result).toMatchObject({ state: null, blocked: message, revisionId: null, revisionToken: null, sentAt: null })
  })

  test('any status but 200 is unexpected', async () => {
    const harness = await signedIn([warmUp, service({ status: 500, body: 'down' })])
    const error = await failure(readSamplesReview(harness.portal, { gwt: KNOWN }))
    expect(error.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect(error.details['step']).toBe('leeImpreso')
  })
})

describe('createSamplesReview', () => {
  const created = okAnswer([`'${TOKEN}'`], ['cl.sii.sdi.dim.validaPdfDte.to.ListaTo/1'])

  test('posts creaLista with the company twice and the environment flag off, and reads the review id and token', async () => {
    const harness = await signedIn([warmUp, nocache, service({ body: created })])
    await expect(createSamplesReview(harness.portal)).resolves.toEqual({
      revisionId: REVIEW_ID,
      revisionToken: TOKEN,
      hashes: KNOWN,
      body: created,
    })
    const [request] = servicePosts(harness)
    expect(request.text).toBe(
      `7|0|9|${BASE}|${KNOWN.policy}|${SERVICE}|creaLista|${STRING}|Z|76543210|3||1|2|3|4|6|5|5|5|5|5|6|7|8|9|7|8|0|`,
    )
  })

  test('the SII sentence that refuses the review is a rejection', async () => {
    const message = 'El contribuyente 76543210-3 no ha solicitado Set de pruebas.'
    const harness = await signedIn([warmUp, service({ body: okAnswer([0], [message]) })])
    const error = await failure(createSamplesReview(harness.portal, { gwt: KNOWN }))
    expect(error.code).toBe('SII_PORTAL_REJECTED')
    expect(error.details).toMatchObject({ rejection: 'samplesReviewRefused', portalMessage: message })
  })

  test('an exception, or an answer without a readable id, is unexpected', async () => {
    const exception = await signedIn([warmUp, service({ body: EXCEPTION })])
    expect((await failure(createSamplesReview(exception.portal, { gwt: KNOWN }))).code).toBe(
      'SII_PORTAL_UNEXPECTED_PAGE',
    )
    const noId = await signedIn([warmUp, service({ body: EMPTY_OK })])
    expect((await failure(createSamplesReview(noId.portal, { gwt: KNOWN }))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
  })

  test('is never retried by the transport, even when the client retries', async () => {
    const harness = await signedIn([warmUp, service({ status: 503, body: 'busy' })], retrying)
    expect((await failure(createSamplesReview(harness.portal, { gwt: KNOWN }))).code).toBe('SII_HTTP_ERROR')
    expect(servicePosts(harness)).toHaveLength(1)
    expect(harness.sleeps).toEqual([])
  })
})

describe('uploadSample', () => {
  const input = { revisionId: REVIEW_ID, fileName: 'muestra_33_1.pdf', bytes: PDF, gwt: KNOWN }

  test('posts the file, the review id and the environment flag as three parts, the referer the permutation page', async () => {
    const harness = await signedIn([warmUp, upload({ body: 'ok' })])
    await expect(uploadSample(harness.portal, input)).resolves.toEqual({ body: 'ok', attempts: 1 })
    const [request] = uploads(harness)
    expect(request.parts).toEqual([
      { name: 'Filedata', fileName: 'muestra_33_1.pdf', contentType: 'application/octet-stream', value: '%PDF' },
      { name: 'id', fileName: null, contentType: null, value: '264872' },
      { name: 'ambiente', fileName: null, contentType: null, value: 'false' },
    ])
    expect(request.headers).toMatchObject({
      'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
      referer: `${BASE}${KNOWN.permutation}.cache.html`,
      'x-dtreferer': BASE,
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      origin: 'https://www4.sii.cl',
    })
  })

  test('retries a 5xx up to four attempts with the same body, waiting 2, 4 and 6 s', async () => {
    const log = logger()
    const harness = await signedIn(
      [
        warmUp,
        upload(
          { status: 503, body: 'busy' },
          { status: 500, body: 'oops' },
          { status: 502, body: 'bad' },
          { body: 'ok' },
        ),
      ],
      { logger: log },
    )
    await expect(uploadSample(harness.portal, input)).resolves.toEqual({ body: 'ok', attempts: 4 })
    expect(harness.sleeps).toEqual([2000, 4000, 6000])
    const sent = uploads(harness)
    expect(sent).toHaveLength(4)
    expect(new Set(sent.map((request) => request.text)).size).toBe(1)
    expect(log.lines.filter((line) => line === 'sii samples upload retrying')).toHaveLength(3)
  })

  test('the fourth 5xx is the error', async () => {
    const harness = await signedIn([
      warmUp,
      upload(
        { status: 503, body: '1' },
        { status: 503, body: '2' },
        { status: 503, body: '3' },
        { status: 504, body: '4' },
      ),
    ])
    const error = await failure(uploadSample(harness.portal, input))
    expect(error.code).toBe('SII_HTTP_ERROR')
    expect(error.details['httpStatus']).toBe(504)
    expect(harness.sleeps).toEqual([2000, 4000, 6000])
    expect(uploads(harness)).toHaveLength(4)
  })

  test('a 4xx is refused at once, naming the file', async () => {
    const harness = await signedIn([warmUp, upload({ status: 413, body: '<html>too large</html>' })])
    const error = await failure(uploadSample(harness.portal, input))
    expect(error.code).toBe('SII_PORTAL_REJECTED')
    expect(error.details).toMatchObject({ rejection: 'sampleUploadRefused', file: 'muestra_33_1.pdf', httpStatus: 413 })
    expect(error.details['portalMessage']).toBe('too large')
    expect(harness.sleeps).toEqual([])
    expect(uploads(harness)).toHaveLength(1)
  })

  test('a file name that cannot travel in a part header is refused before any request', async () => {
    const harness = await signedIn([])
    for (const fileName of ['muestra"; name="id', 'muestra.xml', 'a/b.pdf', 'x\r\n.pdf']) {
      const error = await failure(uploadSample(harness.portal, { ...input, fileName }))
      expect(error.code).toBe('INVALID_OPTION')
      expect(error.details).toEqual({ field: 'fileName' })
    }
    expect(harness.urls()).toEqual([])
  })

  test('any other status is unexpected', async () => {
    const harness = await signedIn([warmUp, upload({ status: 204 })])
    expect((await failure(uploadSample(harness.portal, input))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
  })
})

describe('submitSamplesReview', () => {
  test('posts solicitaRevisionSII with the review token and the flag off', async () => {
    const harness = await signedIn([warmUp, nocache, service({ body: EMPTY_OK })])
    await expect(submitSamplesReview(harness.portal, { revisionToken: TOKEN })).resolves.toEqual({ body: EMPTY_OK })
    const [request] = servicePosts(harness)
    expect(request.text).toBe(
      `7|0|6|${BASE}|${KNOWN.policy}|${SERVICE}|solicitaRevisionSII|${LONG}|Z|1|2|3|4|2|5|6|5|${TOKEN}|0|`,
    )
  })

  test('an answer without //OK is unexpected', async () => {
    const harness = await signedIn([warmUp, service({ body: EXCEPTION })])
    const error = await failure(submitSamplesReview(harness.portal, { revisionToken: TOKEN, gwt: KNOWN }))
    expect(error.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect(error.details['step']).toBe('solicitaRevisionSII')
  })
})

describe('readSamplesDetail', () => {
  const rows = [['1', 'muestra_33_1.pdf', 'PRUEBA', 'FACTURA ELECTRONICA', '1', 'ORIGINAL', 'CASO-1']]

  test('posts muestraMail with the review token and reads the rows', async () => {
    const harness = await signedIn([warmUp, nocache, service({ body: detailAnswer(rows) })])
    await expect(readSamplesDetail(harness.portal, { revisionToken: TOKEN })).resolves.toEqual({
      rows: [
        {
          fileName: 'muestra_33_1.pdf',
          kind: 'test',
          documentType: 'FACTURA ELECTRONICA',
          folio: 1,
          copy: 'ORIGINAL',
          caseId: 'CASO-1',
        },
      ],
      body: detailAnswer(rows),
    })
    const [request] = servicePosts(harness)
    expect(request.text).toBe(`7|0|5|${BASE}|${KNOWN.policy}|${SERVICE}|muestraMail|${LONG}|1|2|3|4|1|5|5|${TOKEN}|`)
  })

  test('a failure is logged and gives an empty detail', async () => {
    const log = logger()
    const harness = await signedIn([warmUp, service(new Error('socket hang up'))], { logger: log })
    await expect(readSamplesDetail(harness.portal, { revisionToken: TOKEN, gwt: KNOWN })).resolves.toEqual({
      rows: [],
      body: '',
    })
    expect(log.lines).toContain('sii samples detail unavailable')
  })
})
```

`tests/sii/multipart.test.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/sii/multipart.test.ts b/tests/sii/multipart.test.ts
index 7e7717c..5104b3c 100644
--- a/tests/sii/multipart.test.ts
+++ b/tests/sii/multipart.test.ts
@@ -1,4 +1,9 @@
-import { buildMultipartBody, generateBoundary, multipartContentType } from '../../src/sii/multipart'
+import {
+  buildMultipartBody,
+  buildMultipartParts,
+  generateBoundary,
+  multipartContentType,
+} from '../../src/sii/multipart'
 import { DteError } from '../../src/errors'
 import { decodeLatin1, encodeLatin1 } from '../../src/text/latin1'
 
@@ -148,3 +153,60 @@ describe('buildMultipartBody', () => {
     ).not.toThrow()
   })
 })
+
+describe('buildMultipartParts', () => {
+  test('keeps the parts in the given order, a file first when asked, and frames every part the same way', () => {
+    const body = buildMultipartParts({
+      boundary: 'B',
+      parts: [
+        {
+          name: 'Filedata',
+          fileName: 'muestra.pdf',
+          contentType: 'application/octet-stream',
+          bytes: encodeLatin1('%PDF'),
+        },
+        { name: 'id', value: '264872' },
+        { name: 'ambiente', value: 'false' },
+      ],
+    })
+    expect(decodeLatin1(body)).toBe(
+      [
+        '--B',
+        'Content-Disposition: form-data; name="Filedata"; filename="muestra.pdf"',
+        'Content-Type: application/octet-stream',
+        '',
+        '%PDF',
+        '--B',
+        'Content-Disposition: form-data; name="id"',
+        '',
+        '264872',
+        '--B',
+        'Content-Disposition: form-data; name="ambiente"',
+        '',
+        'false',
+        '--B--',
+        '',
+      ].join('\r\n'),
+    )
+  })
+
+  test('a CR, LF or quote in a name, file name or content type is refused: it would break the part header', () => {
+    const bytes = encodeLatin1('x')
+    const build = (part: Parameters<typeof buildMultipartParts>[0]['parts'][number]) => () =>
+      buildMultipartParts({ boundary: 'B', parts: [part] })
+    expect(build({ name: 'f', fileName: 'a"; name="b', contentType: 'text/plain', bytes })).toThrow(DteError)
+    expect(build({ name: 'f', fileName: 'a.pdf', contentType: 'text/plain\r\nX: y', bytes })).toThrow(DteError)
+    expect(build({ name: 'id\n', value: '1' })).toThrow(DteError)
+    expect(build({ name: 'f', fileName: 'B', contentType: 'text/plain', bytes })).toThrow(DteError)
+  })
+
+  test('no parts gives the closing line alone, and a boundary inside a part is refused', () => {
+    expect(decodeLatin1(buildMultipartParts({ boundary: 'B', parts: [] }))).toBe('--B--\r\n')
+    expect(() =>
+      buildMultipartParts({
+        boundary: 'B',
+        parts: [{ name: 'f', fileName: 'x', contentType: 'text/plain', bytes: encodeLatin1('--B--') }],
+      }),
+    ).toThrow(DteError)
+  })
+})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/portal/samples tests/sii/multipart --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/portal/samples'`; `buildMultipartParts` is not exported by `src/sii/multipart.ts`.

- [ ] **Step 3: Write the implementation**

`src/portal/samples.ts` (new file, whole):

```ts
import { SAMPLES_PORTAL } from '../catalogs/certification'
import { DteError, errorMessage, isDteError } from '../errors'
import type { CallOverrides } from '../sii/client'
import { redactText } from '../sii/capture'
import { buildMultipartParts, multipartContentType } from '../sii/multipart'
import { bodyExcerpt } from '../sii/operation'
import { resolvePortalCompany, type PortalClient } from './client'
import { bodyText } from './html'
import {
  gwtBoolean,
  gwtHashesOf,
  gwtLong,
  gwtString,
  portalBoundary,
  postGwt,
  warmUpGwtPortal,
  type GwtHashes,
} from './gwt'
import {
  reviewId,
  reviewSentAt,
  reviewState,
  sampleDetails,
  type ReviewState,
  type SampleDetail,
} from './pages/samples'
import {
  ensureSession,
  portalRequest,
  rejected,
  unexpectedPage,
  withPortalSession,
  type PortalContext,
  type PortalPage,
} from './session'

const NO_CACHE: Readonly<Record<string, string>> = { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }
const FILE_FIELD = 'Filedata'
// It travels in the multipart `filename`, so it cannot be free text.
const SAFE_FILE_NAME = /^[\w.-]+\.pdf$/i
const FILE_CONTENT_TYPE = 'application/octet-stream'
const MAX_UPLOAD_ATTEMPTS = 4
const UPLOAD_WAIT_MS = 2000
const SERVER_ERROR = 500
const CLIENT_ERROR = 400

const enter = async (context: PortalContext): Promise<void> => {
  await ensureSession(context)
  await warmUpGwtPortal(context, SAMPLES_PORTAL)
}

// A post that changes the review (its creation, a PDF, the submission) is sent once by the transport: the upload has
// its own retry, for the portal's 5xx only.
const once = (context: PortalContext): PortalContext => ({
  ...context,
  overrides: { ...context.overrides, retry: false },
})

const call = (
  context: PortalContext,
  step: string,
  hashes: GwtHashes,
  parameters: Parameters<typeof postGwt>[5],
): ReturnType<typeof postGwt> => postGwt(context, step, SAMPLES_PORTAL, hashes, step, parameters, NO_CACHE)

/**
 * EN: Input of the samples operations that name the company.
 * ES: Entrada de las operaciones de muestras que nombran a la empresa.
 */
export type SamplesCompanyInput = {
  /** EN: Company RUT; the client's by default. ES: RUT de la empresa; por defecto el del cliente. */
  readonly companyRut?: string
  /** EN: The portal's hashes, when the caller knows them; discovered otherwise. ES: Los hashes del portal, si el llamador los conoce; si no, se descubren. */
  readonly gwt?: GwtHashes
}

/**
 * EN: Input of the samples operations that name a review by its token.
 * ES: Entrada de las operaciones de muestras que nombran una revisión por su token.
 */
export type SamplesReviewInput = {
  /** EN: The review's Long token, as the portal wrote it. ES: El token Long de la revisión, como lo escribió el portal. */
  readonly revisionToken: string
  /** EN: The portal's hashes, when the caller knows them. ES: Los hashes del portal, si el llamador los conoce. */
  readonly gwt?: GwtHashes
}

/**
 * EN: What `readSamplesReview` read.
 * ES: Lo que leyó `readSamplesReview`.
 */
export type SamplesReview = {
  /** EN: The review state, or null when the portal named none. ES: El estado de la revisión, o null si el portal no nombró ninguno. */
  readonly state: ReviewState | null
  /** EN: The portal's sentence when it names no state: the application is not in the printed samples stage, or no test set was requested. ES: La frase del portal cuando no nombra un estado: la postulación no está en la etapa de muestras impresas, o no se pidió set de pruebas. */
  readonly blocked: string | null
  /** EN: The review id, or null. ES: El id de la revisión, o null. */
  readonly revisionId: number | null
  /** EN: The review's Long token, or null. ES: El token Long de la revisión, o null. */
  readonly revisionToken: string | null
  /** EN: When the review was sent, `YYYY-MM-DD HH:MM`, or null. ES: Cuándo se envió la revisión, `AAAA-MM-DD HH:MM`, o null. */
  readonly sentAt: string | null
  /** EN: The hashes the call used. ES: Los hashes que usó la llamada. */
  readonly hashes: GwtHashes
  /** EN: The raw answer, for the artefacts. ES: La respuesta cruda, para los artefactos. */
  readonly body: string
}

/**
 * EN: What `createSamplesReview` did.
 * ES: Lo que hizo `createSamplesReview`.
 */
export type SamplesReviewCreated = {
  /** EN: The review id, in decimal, for the uploads. ES: El id de la revisión, en decimal, para las subidas. */
  readonly revisionId: number
  /** EN: The review's Long token, for the submission and the detail. ES: El token Long de la revisión, para el envío y el detalle. */
  readonly revisionToken: string
  /** EN: The hashes the call used. ES: Los hashes que usó la llamada. */
  readonly hashes: GwtHashes
  /** EN: The raw answer. ES: La respuesta cruda. */
  readonly body: string
}

/**
 * EN: Input of `uploadSample`.
 * ES: Entrada de `uploadSample`.
 */
export type UploadSampleInput = {
  /** EN: The review id, in decimal. ES: El id de la revisión, en decimal. */
  readonly revisionId: number
  /** EN: The PDF's file name, sent as is. ES: El nombre de archivo del PDF, enviado tal cual. */
  readonly fileName: string
  /** EN: The PDF bytes. ES: Los bytes del PDF. */
  readonly bytes: Uint8Array
  /** EN: The portal's hashes, when the caller knows them. ES: Los hashes del portal, si el llamador los conoce. */
  readonly gwt?: GwtHashes
}

/**
 * EN: What `uploadSample` did.
 * ES: Lo que hizo `uploadSample`.
 */
export type SampleUploaded = {
  /** EN: The portal's answer; its format is unknown. ES: La respuesta del portal; su formato se desconoce. */
  readonly body: string
  /** EN: Attempts made, 1 to 4. ES: Intentos hechos, de 1 a 4. */
  readonly attempts: number
}

/**
 * EN: What `readSamplesDetail` read.
 * ES: Lo que leyó `readSamplesDetail`.
 */
export type SamplesDetail = {
  /** EN: One row per PDF the SII filed; empty when the detail could not be read. ES: Una fila por PDF que clasificó el SII; vacío si el detalle no se pudo leer. */
  readonly rows: readonly SampleDetail[]
  /** EN: The raw answer, empty when it could not be read. ES: La respuesta cruda, vacía si no se pudo leer. */
  readonly body: string
}

/**
 * EN: Reads the company's printed samples review: `leeImpreso` with the company RUT. The portal answers HTTP 200 with a
 * state, or with a sentence when the application is not in the printed samples stage (before it, and after it too).
 * ES: Lee la revisión de muestras impresas de la empresa: `leeImpreso` con el RUT de la empresa. El portal responde
 * HTTP 200 con un estado, o con una frase cuando la postulación no está en la etapa de muestras impresas (antes de
 * ella, y también después).
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the company and the hashes. ES: la empresa y los hashes.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the state, the blocking sentence, the review id and token, the date, the hashes and the raw answer. ES: el estado, la frase que bloquea, el id y token de la revisión, la fecha, los hashes y la respuesta cruda.
 * @throws {DteError} EN: `SII_PORTAL_UNEXPECTED_PAGE` when the status is not 200; `MISSING_FIELD`; session, block and transport codes. ES: los mismos códigos.
 */
export const readSamplesReview = (
  portal: PortalClient,
  input: SamplesCompanyInput = {},
  overrides?: CallOverrides,
): Promise<SamplesReview> =>
  withPortalSession(portal, 'readSamplesReview', overrides, async (context) => {
    const company = resolvePortalCompany(portal, input.companyRut)
    await enter(context)
    const hashes = await gwtHashesOf(context, SAMPLES_PORTAL, input.gwt)
    const { page, answer } = await call(context, 'leeImpreso', hashes, [gwtString(company)])
    if (page.status !== 200) throw unexpectedPage(context, 'leeImpreso', page.html)
    const state = reviewState(page.html)
    const review = reviewId(answer)
    return {
      state,
      blocked: state === null ? answer.message : null,
      revisionId: review === null ? null : review.id,
      revisionToken: review === null ? null : review.token,
      sentAt: reviewSentAt(answer),
      hashes,
      body: page.html,
    }
  })

/**
 * EN: Creates a printed samples review: `creaLista` with the company as sender and provider. The portal only creates
 * one when the current review is `RECHAZADO` or `APROBADO`, or there is none; a review in `INGRESO` is resumed instead.
 * ES: Crea una revisión de muestras impresas: `creaLista` con la empresa como remitente y proveedor. El portal solo
 * crea una cuando la revisión actual está `RECHAZADO` o `APROBADO`, o no hay ninguna; una revisión en `INGRESO` se retoma.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the company and the hashes. ES: la empresa y los hashes.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the review id and token. ES: el id y el token de la revisión.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED { rejection: 'samplesReviewRefused' }` with the SII's sentence; `SII_PORTAL_UNEXPECTED_PAGE` without HTTP 200, `//OK` or a readable id; `MISSING_FIELD`; session, block and transport codes. ES: los mismos códigos.
 */
export const createSamplesReview = (
  portal: PortalClient,
  input: SamplesCompanyInput = {},
  overrides?: CallOverrides,
): Promise<SamplesReviewCreated> =>
  withPortalSession(portal, 'createSamplesReview', overrides, async (context) => {
    const [digits, verifier] = resolvePortalCompany(portal, input.companyRut).split('-')
    await enter(context)
    const hashes = await gwtHashesOf(context, SAMPLES_PORTAL, input.gwt)
    const { page, answer } = await call(once(context), 'creaLista', hashes, [
      gwtString(digits),
      gwtString(verifier),
      gwtString(''),
      gwtString(digits),
      gwtString(verifier),
      gwtBoolean(false),
    ])
    if (page.status !== 200 || !answer.ok) throw unexpectedPage(context, 'creaLista', page.html)
    if (answer.message !== null) throw rejected(context, 'samplesReviewRefused', { portalMessage: answer.message })
    const review = reviewId(answer)
    if (review === null) throw unexpectedPage(context, 'creaLista', page.html)
    return { revisionId: review.id, revisionToken: review.token, hashes, body: page.html }
  })

const isServerError = (error: unknown): boolean =>
  isDteError(error) &&
  error.code === 'SII_HTTP_ERROR' &&
  typeof error.details['httpStatus'] === 'number' &&
  error.details['httpStatus'] >= SERVER_ERROR

const uploadOnce = async (
  context: PortalContext,
  input: UploadSampleInput,
  hashes: GwtHashes,
  body: Uint8Array,
  boundary: string,
  attempt: number,
): Promise<SampleUploaded> => {
  const url = `${SAMPLES_PORTAL.base}upload`
  const attemptOnce = async (): Promise<PortalPage> => {
    const page = await portalRequest(context, 'upload', 'POST', url, {
      body,
      contentType: multipartContentType(boundary),
      referer: `${SAMPLES_PORTAL.base}${hashes.permutation}.cache.html`,
      headers: { ...NO_CACHE, 'x-dtreferer': SAMPLES_PORTAL.base },
    })
    if (page.status >= SERVER_ERROR)
      throw new DteError('SII_HTTP_ERROR', {
        httpStatus: page.status,
        operation: `${context.operation}.upload`,
        url,
        channel: 'portal',
        body: bodyExcerpt(page.html),
      })
    return page
  }
  try {
    const page = await attemptOnce()
    if (page.status >= CLIENT_ERROR)
      throw rejected(context, 'sampleUploadRefused', {
        file: input.fileName,
        httpStatus: page.status,
        portalMessage: bodyText(redactText(page.html)).slice(0, 150),
      })
    if (page.status !== 200) throw unexpectedPage(context, 'upload', page.html)
    return { body: page.html, attempts: attempt }
  } catch (error) {
    if (attempt >= MAX_UPLOAD_ATTEMPTS || !isServerError(error)) throw error
    const delayMs = UPLOAD_WAIT_MS * attempt
    context.portal.logger.warn('sii samples upload retrying', { file: input.fileName, attempt, delayMs })
    await context.portal.sleep(delayMs)
    return uploadOnce(context, input, hashes, body, boundary, attempt + 1)
  }
}

/**
 * EN: Uploads one PDF to a review: `POST upload` with the parts `Filedata` (the file), `id` (the review id in decimal)
 * and `ambiente` (`false`), the referer the permutation's `cache.html`. HTTP 200 is success. A 5xx is retried up to four
 * attempts in all, the same body and boundary, waiting 2, 4 and 6 s: a 503 on one file once left a review in `INGRESO`.
 * A 4xx is refused at once.
 * ES: Sube un PDF a una revisión: `POST upload` con las partes `Filedata` (el archivo), `id` (el id de la revisión en
 * decimal) y `ambiente` (`false`), el referer el `cache.html` de la permutación. HTTP 200 es éxito. Un 5xx se reintenta
 * hasta cuatro intentos en total, el mismo cuerpo y límite, esperando 2, 4 y 6 s: un 503 en un archivo dejó una vez una
 * revisión en `INGRESO`. Un 4xx se rechaza de inmediato.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the review, the file and the hashes. ES: la revisión, el archivo y los hashes.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the answer and the attempts made. ES: la respuesta y los intentos hechos.
 * @throws {DteError} EN: `INVALID_OPTION { field: 'fileName' }` unless the name is `[\w.-]+.pdf`; `SII_PORTAL_REJECTED { rejection: 'sampleUploadRefused', file, httpStatus }` on a 4xx; `SII_HTTP_ERROR` on the last 5xx; `SII_PORTAL_UNEXPECTED_PAGE` on any other status; session, block and transport codes. ES: los mismos códigos.
 */
export const uploadSample = (
  portal: PortalClient,
  input: UploadSampleInput,
  overrides?: CallOverrides,
): Promise<SampleUploaded> =>
  withPortalSession(portal, 'uploadSample', overrides, async (context) => {
    if (!SAFE_FILE_NAME.test(input.fileName)) throw new DteError('INVALID_OPTION', { field: 'fileName' })
    await enter(context)
    const hashes = await gwtHashesOf(context, SAMPLES_PORTAL, input.gwt)
    const boundary = portalBoundary(portal.now())
    const body = buildMultipartParts({
      boundary,
      parts: [
        { name: FILE_FIELD, fileName: input.fileName, contentType: FILE_CONTENT_TYPE, bytes: input.bytes },
        { name: 'id', value: String(input.revisionId) },
        { name: 'ambiente', value: 'false' },
      ],
    })
    return uploadOnce(once(context), input, hashes, body, boundary, 1)
  })

/**
 * EN: Submits a review to the SII: `solicitaRevisionSII` with the review token. The answer is `//OK[0,[],0,7]` whether
 * the SII accepts or rejects the samples: the state is read again afterwards.
 * ES: Envía una revisión al SII: `solicitaRevisionSII` con el token de la revisión. La respuesta es `//OK[0,[],0,7]`
 * tanto si el SII acepta como si rechaza las muestras: el estado se lee de nuevo después.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the review token and the hashes. ES: el token de la revisión y los hashes.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the raw answer. ES: la respuesta cruda.
 * @throws {DteError} EN: `SII_PORTAL_UNEXPECTED_PAGE` without HTTP 200 and `//OK`; session, block and transport codes. ES: los mismos códigos.
 */
export const submitSamplesReview = (
  portal: PortalClient,
  input: SamplesReviewInput,
  overrides?: CallOverrides,
): Promise<{ readonly body: string }> =>
  withPortalSession(portal, 'submitSamplesReview', overrides, async (context) => {
    await enter(context)
    const hashes = await gwtHashesOf(context, SAMPLES_PORTAL, input.gwt)
    const { page, answer } = await call(once(context), 'solicitaRevisionSII', hashes, [
      gwtLong(input.revisionToken),
      gwtBoolean(false),
    ])
    if (page.status !== 200 || !answer.ok) throw unexpectedPage(context, 'solicitaRevisionSII', page.html)
    return { body: page.html }
  })

/**
 * EN: Reads how the SII filed each PDF of a rejected review: `muestraMail` with the review token. A failure is logged
 * and gives an empty detail: the rejection stands without it.
 * ES: Lee cómo clasificó el SII cada PDF de una revisión rechazada: `muestraMail` con el token de la revisión. Una
 * falla se registra y entrega un detalle vacío: el rechazo se mantiene sin él.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the review token and the hashes. ES: el token de la revisión y los hashes.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the rows and the raw answer. ES: las filas y la respuesta cruda.
 */
export const readSamplesDetail = (
  portal: PortalClient,
  input: SamplesReviewInput,
  overrides?: CallOverrides,
): Promise<SamplesDetail> =>
  withPortalSession(portal, 'readSamplesDetail', overrides, async (context) => {
    try {
      await enter(context)
      const hashes = await gwtHashesOf(context, SAMPLES_PORTAL, input.gwt)
      const { page } = await call(context, 'muestraMail', hashes, [gwtLong(input.revisionToken)])
      return { rows: sampleDetails(page.html), body: page.html }
    } catch (error) {
      portal.logger.warn('sii samples detail unavailable', { reason: errorMessage(error) })
      return { rows: [], body: '' }
    }
  })
```

`src/sii/multipart.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/sii/multipart.ts b/src/sii/multipart.ts
index 0a5bfd3..69f6e95 100644
--- a/src/sii/multipart.ts
+++ b/src/sii/multipart.ts
@@ -65,25 +65,63 @@ const concat = (parts: readonly Uint8Array[]): Uint8Array => {
 }
 
 /**
- * EN: `multipart/form-data` bytes: CRLF framing, the fields in order, then the file part. The framing is ASCII; the
- * file bytes are copied untouched (Latin-1 for the SII envelopes). The boundary must not occur in any field value or
- * in the file, or a receiver would cut the body there.
- * ES: Bytes `multipart/form-data`: delimitación CRLF, los campos en orden y luego la parte archivo. La delimitación es
- * ASCII; los bytes del archivo se copian tal cual (Latin-1 en los sobres del SII). El límite no debe aparecer en el
- * valor de un campo ni en el archivo, o el receptor cortaría el cuerpo ahí.
- * @throws {DteError} EN: `INVALID_OPTION { field: 'boundary' }` when the boundary occurs in the content. ES: `INVALID_OPTION { field: 'boundary' }` si el límite aparece en el contenido.
+ * EN: A part of a multipart body: a text field or a file.
+ * ES: Una parte de un cuerpo multipart: un campo de texto o un archivo.
  */
-export const buildMultipartBody = ({ boundary, fields, file }: MultipartBodyInput): Uint8Array => {
+export type MultipartPart = MultipartField | MultipartFile
+
+/**
+ * EN: Input of `buildMultipartParts`.
+ * ES: Entrada de `buildMultipartParts`.
+ */
+export type MultipartPartsInput = {
+  /** EN: Boundary; must not occur in any part. ES: Separador; no debe aparecer en ninguna parte. */
+  readonly boundary: string
+  /** EN: The parts, in the order they are sent. ES: Las partes, en el orden en que se envían. */
+  readonly parts: readonly MultipartPart[]
+}
+
+const isFile = (part: MultipartPart): part is MultipartFile => 'bytes' in part
+
+const partText = (part: MultipartPart): string => (isFile(part) ? decodeLatin1(part.bytes) : part.value)
+
+// What goes into a part's headers: a CR, LF or quote there would end the header or the quoted name early.
+const headerTexts = (part: MultipartPart): readonly string[] =>
+  isFile(part) ? [part.name, part.fileName, part.contentType] : [part.name]
+const BREAKS_HEADER = /[\r\n"]/
+
+/**
+ * EN: `multipart/form-data` bytes with the parts in the given order: CRLF framing in ASCII, every file's bytes copied
+ * untouched. The boundary must not occur in any part, or a receiver would cut the body there.
+ * ES: Bytes `multipart/form-data` con las partes en el orden dado: delimitación CRLF en ASCII, los bytes de cada
+ * archivo copiados tal cual. El límite no debe aparecer en ninguna parte, o el receptor cortaría el cuerpo ahí.
+ * @throws {DteError} EN: `INVALID_OPTION { field: 'parts' }` when a name, file name or content type holds a CR, LF or quote; `INVALID_OPTION { field: 'boundary' }` when the boundary occurs in the content. ES: `INVALID_OPTION { field: 'parts' }` si un nombre, nombre de archivo o tipo de contenido trae CR, LF o comillas; `INVALID_OPTION { field: 'boundary' }` si el límite aparece en el contenido.
+ */
+export const buildMultipartParts = ({ boundary, parts }: MultipartPartsInput): Uint8Array => {
+  if (parts.some((part) => headerTexts(part).some((text) => BREAKS_HEADER.test(text))))
+    throw new DteError('INVALID_OPTION', { field: 'parts' })
   // Latin-1 decoding is one character per byte, so an ASCII boundary is in the string exactly when it is in the bytes.
-  if ([...fields.map(({ value }) => value), decodeLatin1(file.bytes)].some((text) => text.includes(boundary)))
+  if (parts.some((part) => [...headerTexts(part), partText(part)].some((text) => text.includes(boundary))))
     throw new DteError('INVALID_OPTION', { field: 'boundary' })
   const delimiter = `--${boundary}\r\n`
-  const fieldParts = fields.map(({ name, value }) =>
-    encodeLatin1(`${delimiter}Content-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`),
-  )
-  const fileHeader = encodeLatin1(
-    `${delimiter}Content-Disposition: form-data; name="${file.name}"; filename="${file.fileName}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
+  const encoded = parts.flatMap((part) =>
+    isFile(part)
+      ? [
+          encodeLatin1(
+            `${delimiter}Content-Disposition: form-data; name="${part.name}"; filename="${part.fileName}"\r\nContent-Type: ${part.contentType}\r\n\r\n`,
+          ),
+          part.bytes,
+          encodeLatin1('\r\n'),
+        ]
+      : [encodeLatin1(`${delimiter}Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value}\r\n`)],
   )
-  const closing = encodeLatin1(`\r\n--${boundary}--\r\n`)
-  return concat([...fieldParts, fileHeader, file.bytes, closing])
+  return concat([...encoded, encodeLatin1(`--${boundary}--\r\n`)])
 }
+
+/**
+ * EN: `multipart/form-data` bytes: the fields in order, then the file part, as the SII's upload CGI expects them.
+ * ES: Bytes `multipart/form-data`: los campos en orden y luego la parte archivo, como los espera el CGI de subida del SII.
+ * @throws {DteError} EN: `INVALID_OPTION { field: 'boundary' }` when the boundary occurs in the content. ES: `INVALID_OPTION { field: 'boundary' }` si el límite aparece en el contenido.
+ */
+export const buildMultipartBody = ({ boundary, fields, file }: MultipartBodyInput): Uint8Array =>
+  buildMultipartParts({ boundary, parts: [...fields, file] })
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/portal/samples tests/sii/multipart --coverage=false
```

Expected: PASS, 26 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/portal/samples.ts src/sii/multipart.ts tests/portal/samples.test.ts tests/sii/multipart.test.ts
```

```bash
git commit -F - <<'MSG'
feat: the samples portal operations: review reading and creation, PDF upload with its retry, submission and detail

The multipart helper gains a builder that keeps the parts in the given
order, since the samples upload sends the file first. The PDF upload
retries the portal's 5xx up to four attempts with the same body, waiting
2, 4 and 6 s; a 4xx is refused at once; the review creation and the
submission are sent once.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 5: The exchange answers

`parseExchangeSet` (spec 3.8: the four roots, the set id, the cover's RUTs, every document with the cover filling what it leaves out, `ENVELOPE_EMPTY`) and `createExchangeAnswers`: the reception response, the receipts of Ley 19.983 and the commercial approval, one line each without a declaration, the ids with the clock in milliseconds, every timestamp Chile's local time, the contact sanitized, the rules of acceptance by receiver; each receipt signed on its own with the envelope's namespaces in scope and then stripped of them, the set of receipts and each `Resultado` signed enveloped. The official schemas `RespuestaEnvioDTE_v10.xsd`, `EnvioRecibos_v10.xsd` and `Recibos_v10.xsd` (from the SII's `schema_ic.zip` and `schema19983.zip`) join the fixtures and the three answers validate against them in the tests.

**Files:**

- Create: `src/certification/exchange.ts`
- Test (create): `tests/certification/exchange.test.ts`
- Test (create): `tests/fixtures/xsd/RespuestaEnvioDTE_v10.xsd`
- Test (create): `tests/fixtures/xsd/EnvioRecibos_v10.xsd`
- Test (create): `tests/fixtures/xsd/Recibos_v10.xsd`
- Test (modify): `tests/support/xsd.ts`

- [ ] **Step 1: Write the failing tests**

`tests/certification/exchange.test.ts` (new file, whole):

```ts
import { EXCHANGE_ANSWER_FILES } from '../../src/catalogs/certification'
import { createExchangeAnswers, parseExchangeSet } from '../../src/certification/exchange'
import { DteError } from '../../src/errors'
import { verifyEnveloped } from '../../src/signature/xmldsig'
import { chileTimestamp } from '../../src/time/chile'
import { parseXml } from '../../src/xml/parse'
import { FIXED_NOW, ISSUER_RUT, RECEIVER_RUT } from '../support/fixtures'
import { certificate } from '../support/portal'
import { validateAgainstXsd } from '../support/xsd'

// The SII issues the exchange set; the company under certification receives it.
const SET_ISSUER = RECEIVER_RUT
const COMPANY = ISSUER_RUT
const OTHER_RECEIVER = '66666666-6'
const MS = FIXED_NOW.getTime()
const STAMP = chileTimestamp(FIXED_NOW)
const SII_NS = 'http://www.sii.cl/SiiDte'
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'

const document = (type: number, folio: number, receiver?: string, total?: number): string =>
  `<DTE version="1.0"><Documento ID="F${folio}T${type}"><Encabezado><IdDoc><TipoDTE>${type}</TipoDTE><Folio>${folio}</Folio><FchEmis>2026-11-0${folio}</FchEmis></IdDoc><Emisor><RUTEmisor>${SET_ISSUER}</RUTEmisor><RznSoc>SII</RznSoc></Emisor>${
    receiver === undefined ? '' : `<Receptor><RUTRecep>${receiver}</RUTRecep></Receptor>`
  }${total === undefined ? '' : `<Totales><MntTotal>${total}</MntTotal></Totales>`}</Encabezado></Documento></DTE>`
const envelope = (root: string, documents: string, setId = ' ID="SetDoc"'): string =>
  `<?xml version="1.0" encoding="ISO-8859-1"?><${root} xmlns="${SII_NS}" version="1.0"><SetDTE${setId}><Caratula version="1.0"><RutEmisor>${SET_ISSUER}</RutEmisor><RutEnvia>${SET_ISSUER}</RutEnvia><RutReceptor>${COMPANY}</RutReceptor><FchResol>2026-01-01</FchResol><NroResol>0</NroResol><TmstFirmaEnv>2026-11-01T10:00:00</TmstFirmaEnv></Caratula>${documents}</SetDTE></${root}>`
const SET = envelope(
  'EnvioDTE',
  document(33, 1, COMPANY, 119000) + document(61, 2, OTHER_RECEIVER, 5000) + document(56, 3),
)
const input = { companyRut: '76.543.210-3', certificate, now: FIXED_NOW }
const contact = { name: "María O'Higgins", mail: 'maria@example.test', phone: '+56 2 2345 6789' }

const node = (value: unknown): Record<string, unknown> => value as Record<string, unknown>
const list = (value: unknown): readonly Record<string, unknown>[] =>
  (Array.isArray(value) ? value : [value]) as readonly Record<string, unknown>[]
const thrown = (work: () => unknown): DteError => {
  try {
    work()
  } catch (error) {
    return error as DteError
  }
  throw new Error('expected a throw')
}
const receipts = (xml: string): readonly string[] => xml.match(/<Recibo version="1.0">[\s\S]*?<\/Recibo>/g) ?? []
const standalone = (receipt: string): string =>
  receipt.replace('<Recibo version="1.0">', `<Recibo xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}" version="1.0">`)

describe('parseExchangeSet', () => {
  test('reads the id, the cover and every document, the cover filling what a document leaves out', () => {
    expect(parseExchangeSet(SET)).toEqual({
      setId: 'SetDoc',
      issuerRut: SET_ISSUER,
      senderRut: SET_ISSUER,
      receiverRut: COMPANY,
      documents: [
        { type: 33, folio: 1, issueDate: '2026-11-01', issuerRut: SET_ISSUER, receiverRut: COMPANY, total: 119000 },
        {
          type: 61,
          folio: 2,
          issueDate: '2026-11-02',
          issuerRut: SET_ISSUER,
          receiverRut: OTHER_RECEIVER,
          total: 5000,
        },
        { type: 56, folio: 3, issueDate: '2026-11-03', issuerRut: SET_ISSUER, receiverRut: COMPANY, total: 0 },
      ],
    })
  })

  test('accepts the other roots, a set without id, one document and TpoDoc', () => {
    const one = document(39, 7, COMPANY, 1000).replace('<TipoDTE>39</TipoDTE>', '<TpoDoc>39</TpoDoc>')
    const set = parseExchangeSet(envelope('EnvioBOLETA', one, ''))
    expect(set.setId).toBe('SetDTE')
    expect(set.documents).toEqual([
      { type: 39, folio: 7, issueDate: '2026-11-07', issuerRut: SET_ISSUER, receiverRut: COMPANY, total: 1000 },
    ])
    expect(parseExchangeSet(envelope('EnvioDTEB', one)).documents).toHaveLength(1)
    expect(parseExchangeSet(envelope('EnvioDTETraslado', one)).documents).toHaveLength(1)
  })

  test('reads export and settlement documents, the lower-case RUT tags, and the cover issuer of a document without one', () => {
    const exportDocument = `<DTE version="1.0"><Exportaciones ID="E1"><Encabezado><IdDoc><TipoDTE>110</TipoDTE><Folio>4</Folio><FchEmis>2026-11-04</FchEmis></IdDoc><Emisor><RutEmisor>${SET_ISSUER}</RutEmisor></Emisor><Receptor><RutRecep>${OTHER_RECEIVER}</RutRecep></Receptor><Totales><MntTotal>10</MntTotal></Totales></Encabezado></Exportaciones></DTE>`
    const settlement = `<DTE version="1.0"><Liquidacion ID="L1"><Encabezado><IdDoc><TipoDTE>43</TipoDTE><Folio>5</Folio><FchEmis>2026-11-05</FchEmis></IdDoc></Encabezado></Liquidacion></DTE>`
    expect(parseExchangeSet(envelope('EnvioDTE', exportDocument + settlement)).documents).toEqual([
      { type: 110, folio: 4, issueDate: '2026-11-04', issuerRut: SET_ISSUER, receiverRut: OTHER_RECEIVER, total: 10 },
      { type: 43, folio: 5, issueDate: '2026-11-05', issuerRut: SET_ISSUER, receiverRut: COMPANY, total: 0 },
    ])
  })

  test('a set without documents, without an envelope root, or with a document that lacks its fields', () => {
    expect(thrown(() => parseExchangeSet(envelope('EnvioDTE', ''))).code).toBe('ENVELOPE_EMPTY')
    expect(thrown(() => parseExchangeSet('<Other><SetDTE/></Other>')).details).toEqual({
      field: 'SetDTE',
      reason: 'no envelope root',
    })
    const noType = envelope('EnvioDTE', document(33, 1, COMPANY).replace('<TipoDTE>33</TipoDTE>', ''))
    expect(thrown(() => parseExchangeSet(noType)).details).toEqual({ field: 'TipoDTE' })
    const badFolio = envelope('EnvioDTE', document(33, 1, COMPANY).replace('<Folio>1</Folio>', '<Folio>A1</Folio>'))
    expect(thrown(() => parseExchangeSet(badFolio)).details).toEqual({ field: 'Folio', reason: 'not a number' })
    const noReceiver = envelope('EnvioDTE', document(33, 1)).replace(`<RutReceptor>${COMPANY}</RutReceptor>`, '')
    expect(thrown(() => parseExchangeSet(noReceiver)).details).toEqual({ field: 'RUTRecep' })
    const noIssuer = envelope('EnvioDTE', document(33, 1, COMPANY)).replace(`<RutEmisor>${SET_ISSUER}</RutEmisor>`, '')
    expect(thrown(() => parseExchangeSet(noIssuer)).details).toEqual({ field: 'RutEmisor' })
  })
})

describe('createExchangeAnswers', () => {
  const answers = createExchangeAnswers(SET, { ...input, contact })

  test('names the three files and writes each answer as one line without a declaration', () => {
    expect(answers.reception.fileName).toBe(EXCHANGE_ANSWER_FILES.reception)
    expect(answers.receipts.fileName).toBe(EXCHANGE_ANSWER_FILES.receipts)
    expect(answers.approval.fileName).toBe(EXCHANGE_ANSWER_FILES.approval)
    expect(answers.set).toEqual(parseExchangeSet(SET))
    for (const answer of [answers.reception, answers.receipts, answers.approval]) {
      expect(answer.xml.startsWith('<')).toBe(true)
      expect(answer.xml.startsWith('<?xml')).toBe(false)
      // The signatures wrap their base64 at 76 columns, as every signature of the SDK; the document itself is one line.
      expect(answer.xml.replace(/<Signature[\s\S]*?<\/Signature>/g, '')).not.toContain('\n')
    }
  })

  test('the reception response receives the envelope and each document addressed to the company', () => {
    const root = node(parseXml(answers.reception.xml)['RespuestaDTE'])
    expect(root).toMatchObject({
      '@_xmlns': SII_NS,
      '@_xmlns:xsi': XSI_NS,
      '@_xsi:schemaLocation': `${SII_NS} RespuestaEnvioDTE_v10.xsd`,
      '@_version': '1.0',
    })
    const resultado = node(root['Resultado'])
    expect(resultado['@_ID']).toBe(`R_ENVIO_${MS}`)
    expect(resultado['Caratula']).toEqual({
      '@_version': '1.0',
      RutResponde: COMPANY,
      RutRecibe: SET_ISSUER,
      IdRespuesta: '1',
      NroDetalles: '1',
      NmbContacto: 'María OHiggins',
      MailContacto: 'maria@example.test',
      TmstFirmaResp: STAMP,
    })
    const envio = node(resultado['RecepcionEnvio'])
    expect(envio).toMatchObject({
      NmbEnvio: `ENVIO_DTE_${MS}`,
      FchRecep: STAMP,
      CodEnvio: '1',
      EnvioDTEID: 'SetDoc',
      RutEmisor: SET_ISSUER,
      RutReceptor: COMPANY,
      EstadoRecepEnv: '0',
      RecepEnvGlosa: 'Envío recibido conforme.',
      NroDTE: '3',
    })
    expect(Object.keys(envio)).toEqual([
      'NmbEnvio',
      'FchRecep',
      'CodEnvio',
      'EnvioDTEID',
      'RutEmisor',
      'RutReceptor',
      'EstadoRecepEnv',
      'RecepEnvGlosa',
      'NroDTE',
      'RecepcionDTE',
    ])
    expect(list(envio['RecepcionDTE'])).toEqual([
      {
        TipoDTE: '33',
        Folio: '1',
        FchEmis: '2026-11-01',
        RUTEmisor: SET_ISSUER,
        RUTRecep: COMPANY,
        MntTotal: '119000',
        EstadoRecepDTE: '0',
        RecepDTEGlosa: 'DTE Recibido OK.',
      },
      {
        TipoDTE: '61',
        Folio: '2',
        FchEmis: '2026-11-02',
        RUTEmisor: SET_ISSUER,
        RUTRecep: OTHER_RECEIVER,
        MntTotal: '5000',
        EstadoRecepDTE: '3',
        RecepDTEGlosa: 'DTE No Recibido - Error en RUT Receptor.',
      },
      {
        TipoDTE: '56',
        Folio: '3',
        FchEmis: '2026-11-03',
        RUTEmisor: SET_ISSUER,
        RUTRecep: COMPANY,
        MntTotal: '0',
        EstadoRecepDTE: '0',
        RecepDTEGlosa: 'DTE Recibido OK.',
      },
    ])
    expect(verifyEnveloped(answers.reception.xml, { elementTag: 'Resultado', rootTag: 'RespuestaDTE' })).toMatchObject({
      referenceId: `R_ENVIO_${MS}`,
      valid: true,
    })
  })

  test('the commercial approval accepts the documents addressed to the company and rejects the others', () => {
    const resultado = node(node(parseXml(answers.approval.xml)['RespuestaDTE'])['Resultado'])
    expect(resultado['@_ID']).toBe(`R_DTE_${MS}`)
    expect(node(resultado['Caratula'])['NroDetalles']).toBe('3')
    expect(list(resultado['ResultadoDTE'])).toEqual([
      {
        TipoDTE: '33',
        Folio: '1',
        FchEmis: '2026-11-01',
        RUTEmisor: SET_ISSUER,
        RUTRecep: COMPANY,
        MntTotal: '119000',
        CodEnvio: '1',
        EstadoDTE: '0',
        EstadoDTEGlosa: 'DTE Aceptado OK',
      },
      {
        TipoDTE: '61',
        Folio: '2',
        FchEmis: '2026-11-02',
        RUTEmisor: SET_ISSUER,
        RUTRecep: OTHER_RECEIVER,
        MntTotal: '5000',
        CodEnvio: '2',
        EstadoDTE: '2',
        EstadoDTEGlosa: 'DTE Rechazado',
        CodRchDsc: '-1',
      },
      {
        TipoDTE: '56',
        Folio: '3',
        FchEmis: '2026-11-03',
        RUTEmisor: SET_ISSUER,
        RUTRecep: COMPANY,
        MntTotal: '0',
        CodEnvio: '3',
        EstadoDTE: '0',
        EstadoDTEGlosa: 'DTE Aceptado OK',
      },
    ])
    expect(verifyEnveloped(answers.approval.xml, { elementTag: 'Resultado', rootTag: 'RespuestaDTE' })).toMatchObject({
      referenceId: `R_DTE_${MS}`,
      valid: true,
    })
  })

  test('the receipts carry one signed receipt per document, every document, and the set signature over them', () => {
    const root = node(parseXml(answers.receipts.xml)['EnvioRecibos'])
    expect(root['@_xsi:schemaLocation']).toBe(`${SII_NS} EnvioRecibos_v10.xsd`)
    const set = node(root['SetRecibos'])
    expect(set['@_ID']).toBe(`SetRecibos_${MS}`)
    expect(set['Caratula']).toEqual({
      '@_version': '1.0',
      RutResponde: COMPANY,
      RutRecibe: SET_ISSUER,
      NmbContacto: 'María OHiggins',
      FonoContacto: '+56 2 2345 6789',
      MailContacto: 'maria@example.test',
      TmstFirmaEnv: STAMP,
    })
    const recibos = list(set['Recibo'])
    expect(recibos).toHaveLength(3)
    expect(recibos.map((recibo) => node(recibo['DocumentoRecibo']))).toEqual([
      {
        '@_ID': 'REC-1',
        TipoDoc: '33',
        Folio: '1',
        FchEmis: '2026-11-01',
        RUTEmisor: SET_ISSUER,
        RUTRecep: COMPANY,
        MntTotal: '119000',
        Recinto: 'Oficina central',
        RutFirma: certificate.rut,
        Declaracion:
          'El acuse de recibo que se declara en este acto, de acuerdo a lo dispuesto en la letra b) del Art. 4, y la letra c) del Art. 5 de la Ley 19.983, acredita que la entrega de mercaderias o servicio(s) prestado(s) ha(n) sido recibido(s).',
        TmstFirmaRecibo: STAMP,
      },
      expect.objectContaining({ '@_ID': 'REC-2', TipoDoc: '61', RUTRecep: OTHER_RECEIVER }),
      expect.objectContaining({ '@_ID': 'REC-3', TipoDoc: '56', MntTotal: '0' }),
    ])
    expect(recibos.every((recibo) => recibo['@_version'] === '1.0' && 'Signature' in recibo)).toBe(true)
    expect(verifyEnveloped(answers.receipts.xml, { elementTag: 'SetRecibos', rootTag: 'EnvioRecibos' })).toMatchObject({
      referenceId: `SetRecibos_${MS}`,
      valid: true,
    })
    const fragments = receipts(answers.receipts.xml)
    expect(fragments).toHaveLength(3)
    fragments.forEach((fragment, index) => {
      expect(verifyEnveloped(standalone(fragment), { elementTag: 'DocumentoRecibo', rootTag: 'Recibo' })).toMatchObject(
        {
          referenceId: `REC-${index + 1}`,
          valid: true,
        },
      )
    })
  })

  test('without a contact the covers name none, and the responses never carry the phone', () => {
    const plain = createExchangeAnswers(SET, input)
    const cover = (xml: string, root: string, set: string) => node(node(node(parseXml(xml)[root])[set])['Caratula'])
    expect(cover(plain.reception.xml, 'RespuestaDTE', 'Resultado')).toEqual({
      '@_version': '1.0',
      RutResponde: COMPANY,
      RutRecibe: SET_ISSUER,
      IdRespuesta: '1',
      NroDetalles: '1',
      TmstFirmaResp: STAMP,
    })
    expect(cover(plain.receipts.xml, 'EnvioRecibos', 'SetRecibos')).toEqual({
      '@_version': '1.0',
      RutResponde: COMPANY,
      RutRecibe: SET_ISSUER,
      TmstFirmaEnv: STAMP,
    })
    const phoneOnly = createExchangeAnswers(SET, { ...input, contact: { phone: '123' } })
    expect(cover(phoneOnly.reception.xml, 'RespuestaDTE', 'Resultado')).not.toHaveProperty('FonoContacto')
    expect(cover(phoneOnly.receipts.xml, 'EnvioRecibos', 'SetRecibos')['FonoContacto']).toBe('123')
  })

  test('the clock defaults to now, and the receipts are signed by the company when the certificate names no holder', () => {
    const before = Date.now()
    const timed = createExchangeAnswers(SET, { companyRut: COMPANY, certificate: { ...certificate, rut: null } })
    const id = node(node(parseXml(timed.reception.xml)['RespuestaDTE'])['Resultado'])['@_ID'] as string
    expect(Number(id.replace('R_ENVIO_', ''))).toBeGreaterThanOrEqual(before)
    const recibo = list(node(node(parseXml(timed.receipts.xml)['EnvioRecibos'])['SetRecibos'])['Recibo'])[0]
    expect(node(recibo['DocumentoRecibo'])['RutFirma']).toBe(COMPANY)
  })

  test('the three answers validate against the official schemas', async () => {
    await expect(validateAgainstXsd(answers.reception.xml, 'RespuestaEnvioDTE')).resolves.toEqual([])
    await expect(validateAgainstXsd(answers.approval.xml, 'RespuestaEnvioDTE')).resolves.toEqual([])
    await expect(validateAgainstXsd(answers.receipts.xml, 'EnvioRecibos')).resolves.toEqual([])
  })
})
```

`tests/fixtures/xsd/RespuestaEnvioDTE_v10.xsd` (new file, an official SII schema, not reproduced here): download `schema_ic.zip` from the SII page "Formato XML de documentos electrónicos" (`https://www.sii.cl/servicios_online/3532-formato_xml-3811.html`, the file lives under `https://www.sii.cl/factura_electronica/factura_mercado/`), extract `ic/RespuestaEnvioDTE_v10.xsd` and save it as `tests/fixtures/xsd/RespuestaEnvioDTE_v10.xsd` byte for byte (ISO-8859-1, CRLF line ends, 17918 bytes, SHA-256 `89d1102d2d78133af077651c574a4386299d2a3c3b406f8fe9f16884f27f4f68`). The `SiiTypes_v10.xsd` and `xmldsignature_v10.xsd` it includes are already in the fixtures.

`tests/fixtures/xsd/EnvioRecibos_v10.xsd` (new file, an official SII schema, not reproduced here): download `schema19983.zip` from the SII page "Formato XML de documentos electrónicos" (`https://www.sii.cl/servicios_online/3532-formato_xml-3811.html`, the file lives under `https://www.sii.cl/factura_electronica/factura_mercado/`), extract `recibos/EnvioRecibos_v10.xsd` and save it as `tests/fixtures/xsd/EnvioRecibos_v10.xsd` byte for byte (ISO-8859-1, CRLF line ends, 3776 bytes, SHA-256 `876865a1eb60def5c0109f9568ef4b6dca9301143efcbc727ab4ccc001f604e3`). The `SiiTypes_v10.xsd` and `xmldsignature_v10.xsd` it includes are already in the fixtures.

`tests/fixtures/xsd/Recibos_v10.xsd` (new file, an official SII schema, not reproduced here): download `schema19983.zip` from the SII page "Formato XML de documentos electrónicos" (`https://www.sii.cl/servicios_online/3532-formato_xml-3811.html`, the file lives under `https://www.sii.cl/factura_electronica/factura_mercado/`), extract `recibos/Recibos_v10.xsd` and save it as `tests/fixtures/xsd/Recibos_v10.xsd` byte for byte (ISO-8859-1, CRLF line ends, 4202 bytes, SHA-256 `20eaf6f76fa966b90bf2a7bd17f8b373a7fcb6c60f97aae11377cb2999c57605`). The `SiiTypes_v10.xsd` and `xmldsignature_v10.xsd` it includes are already in the fixtures.

`tests/support/xsd.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/support/xsd.ts b/tests/support/xsd.ts
index 3b98f59..b69870c 100644
--- a/tests/support/xsd.ts
+++ b/tests/support/xsd.ts
@@ -11,17 +11,22 @@ const SCHEMAS = {
   },
   LibroGuia: { main: 'LibroGuia_v10.xsd', imports: ['xmldsignature_v10.xsd'] },
   ConsumoFolio: { main: 'ConsumoFolio_v10.xsd', imports: ['SiiTypes_v10.xsd', 'xmldsignature_v10.xsd'] },
+  RespuestaEnvioDTE: { main: 'RespuestaEnvioDTE_v10.xsd', imports: ['SiiTypes_v10.xsd', 'xmldsignature_v10.xsd'] },
+  EnvioRecibos: {
+    main: 'EnvioRecibos_v10.xsd',
+    imports: ['Recibos_v10.xsd', 'SiiTypes_v10.xsd', 'xmldsignature_v10.xsd'],
+  },
 } as const
 
-export type BookSchema = keyof typeof SCHEMAS
+export type SiiSchema = keyof typeof SCHEMAS
 
 const schemaFile = (fileName: string) => ({ fileName, contents: readFileSync(join(XSD_DIR, fileName), 'latin1') })
 
 /**
  * Validates against an official SII schema and returns the errors, none when the XML is valid. The text reaches the
- * validator as UTF-8, so the prolog says so.
+ * validator as UTF-8, so a prolog that names ISO-8859-1 is made to say so.
  */
-export const validateAgainstXsd = async (xml: string, schema: BookSchema): Promise<readonly string[]> => {
+export const validateAgainstXsd = async (xml: string, schema: SiiSchema): Promise<readonly string[]> => {
   const contents = xml.replace('encoding="ISO-8859-1"', 'encoding="UTF-8"')
   const { main, imports } = SCHEMAS[schema]
   const result = await validateXML({
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/certification/exchange --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/certification/exchange'`.

- [ ] **Step 3: Write the implementation**

`src/certification/exchange.ts` (new file, whole):

```ts
import { EXCHANGE_ANSWER_FILES } from '../catalogs/certification'
import type { Certificate } from '../certificate/certificate'
import { DteError } from '../errors'
import { toSiiRut, type SiiRut } from '../model/rut'
import { signEnveloped } from '../signature/xmldsig'
import { sanitizeText } from '../text/sanitize'
import { chileTimestamp } from '../time/chile'
import { buildXml } from '../xml/build'
import { parseXmlWithoutNamespaces } from '../xml/parse'

const SII_NS = 'http://www.sii.cl/SiiDte'
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'
const RESPONSE_SCHEMA = 'RespuestaEnvioDTE_v10.xsd'
const RECEIPTS_SCHEMA = 'EnvioRecibos_v10.xsd'
const ENVELOPE_ROOTS = ['EnvioDTE', 'EnvioDTEB', 'EnvioDTETraslado', 'EnvioBOLETA'] as const
const DEFAULT_SET_ID = 'SetDTE'
const ENVELOPE_RECEIVED = { code: 0, gloss: 'Envío recibido conforme.' } as const
const DOCUMENT_RECEIVED = { code: 0, gloss: 'DTE Recibido OK.' } as const
const DOCUMENT_WRONG_RECEIVER = { code: 3, gloss: 'DTE No Recibido - Error en RUT Receptor.' } as const
const DOCUMENT_ACCEPTED = { code: 0, gloss: 'DTE Aceptado OK' } as const
const DOCUMENT_REJECTED = { code: 2, gloss: 'DTE Rechazado', reason: -1 } as const
const RECEIPT_PLACE = 'Oficina central'
const RECEIPT_DECLARATION =
  'El acuse de recibo que se declara en este acto, de acuerdo a lo dispuesto en la letra b) del Art. 4, y la letra c) del Art. 5 de la Ley 19.983, acredita que la entrega de mercaderias o servicio(s) prestado(s) ha(n) sido recibido(s).'

/**
 * EN: One document of the exchange set, as the answers describe it.
 * ES: Un documento del set de intercambio, como lo describen las respuestas.
 */
export type ExchangeDocument = {
  /** EN: Document type. ES: `TipoDTE` — Tipo de documento. */
  readonly type: number
  /** EN: Folio. ES: `Folio` — Folio. */
  readonly folio: number
  /** EN: Issue date, `YYYY-MM-DD`. ES: `FchEmis` — Fecha de emisión, `AAAA-MM-DD`. */
  readonly issueDate: string
  /** EN: The issuer, the document's or the cover's. ES: `RUTEmisor` — El emisor, el del documento o el de la carátula. */
  readonly issuerRut: SiiRut
  /** EN: The receiver, the document's or the cover's. ES: `RUTRecep` — El receptor, el del documento o el de la carátula. */
  readonly receiverRut: SiiRut
  /** EN: The total, 0 when the document has none. ES: `MntTotal` — El total, 0 si el documento no trae. */
  readonly total: number
}

/**
 * EN: The exchange set the SII sends: its id, its cover and its documents.
 * ES: El set de intercambio que envía el SII: su id, su carátula y sus documentos.
 */
export type ExchangeSet = {
  /** EN: `SetDTE/@ID`, `SetDTE` when absent. ES: `SetDTE/@ID`, `SetDTE` si falta. */
  readonly setId: string
  /** EN: The cover's issuer. ES: `RutEmisor` — El emisor de la carátula. */
  readonly issuerRut: SiiRut
  /** EN: The cover's sender, or null. ES: `RutEnvia` — El enviador de la carátula, o null. */
  readonly senderRut: SiiRut | null
  /** EN: The cover's receiver, or null. ES: `RutReceptor` — El receptor de la carátula, o null. */
  readonly receiverRut: SiiRut | null
  /** EN: The documents, in set order. ES: Los documentos, en el orden del set. */
  readonly documents: readonly ExchangeDocument[]
}

/**
 * EN: The contact the answers name, every field optional.
 * ES: El contacto que nombran las respuestas, cada campo opcional.
 */
export type ExchangeContact = {
  /** EN: Contact name. ES: `NmbContacto` — Nombre del contacto. */
  readonly name?: string
  /** EN: Contact mail. ES: `MailContacto` — Correo del contacto. */
  readonly mail?: string
  /** EN: Contact phone, in the receipts only. ES: `FonoContacto` — Teléfono del contacto, solo en los recibos. */
  readonly phone?: string
}

/**
 * EN: Input of `createExchangeAnswers`.
 * ES: Entrada de `createExchangeAnswers`.
 */
export type CreateExchangeAnswersInput = {
  /** EN: The company that answers: the receiver the SII expects on every document. ES: `RutResponde` — La empresa que responde: el receptor que el SII espera en cada documento. */
  readonly companyRut: string
  /** EN: The signing certificate; its holder signs the receipts. ES: `RutFirma` — El certificado firmante; su titular firma los recibos. */
  readonly certificate: Pick<Certificate, 'privateKeyPem' | 'publicKey' | 'certificateBase64' | 'rut'>
  /** EN: The contact, when any. ES: El contacto, si hay. */
  readonly contact?: ExchangeContact
  /** EN: The clock; now by default. ES: El reloj; por defecto ahora. */
  readonly now?: Date
}

/**
 * EN: One answer, ready to upload.
 * ES: Una respuesta, lista para subir.
 */
export type ExchangeAnswer = {
  /** EN: The file name the portal's upload expects. ES: El nombre de archivo que espera la subida del portal. */
  readonly fileName: string
  /** EN: The signed XML, one line, UTF-8, no declaration. ES: El XML firmado, una línea, UTF-8, sin declaración. */
  readonly xml: string
}

/**
 * EN: The three answers of the exchange and the set they answer.
 * ES: Las tres respuestas del intercambio y el set que responden.
 */
export type ExchangeAnswers = {
  /** EN: The reception response. ES: `RespuestaDTE/Resultado/RecepcionEnvio` — La respuesta de recepción. */
  readonly reception: ExchangeAnswer
  /** EN: The receipts. ES: `EnvioRecibos` — Los recibos. */
  readonly receipts: ExchangeAnswer
  /** EN: The commercial approval. ES: `RespuestaDTE/Resultado/ResultadoDTE` — La aprobación comercial. */
  readonly approval: ExchangeAnswer
  /** EN: The set as parsed. ES: El set tal como se leyó. */
  readonly set: ExchangeSet
}

type Node = Readonly<Record<string, unknown>>

const nodeOf = (value: unknown): Node | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Node) : null

const textOf = (node: Node | null, key: string): string | null => {
  const value = node?.[key]
  return typeof value === 'string' ? value : null
}

const listOf = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : value === undefined ? [] : [value]

const required = (value: string | null, field: string): string => {
  if (value === null) throw new DteError('MISSING_FIELD', { field })
  return value
}

const integerOf = (value: string, field: string): number => {
  if (!/^\d+$/.test(value)) throw new DteError('XML_PARSE_FAILED', { field, reason: 'not a number' })
  return Number(value)
}

const optionalRut = (value: string | null, field: string): SiiRut | null =>
  value === null ? null : toSiiRut(value, field)

const documentOf = (dte: Node | null, coverIssuer: SiiRut, coverReceiver: SiiRut | null): ExchangeDocument => {
  const document = nodeOf(dte?.['Documento']) ?? nodeOf(dte?.['Exportaciones']) ?? nodeOf(dte?.['Liquidacion'])
  const header = nodeOf(document?.['Encabezado'])
  const idDoc = nodeOf(header?.['IdDoc'])
  const issuer = nodeOf(header?.['Emisor'])
  const receiver = nodeOf(header?.['Receptor'])
  const issuerRut = textOf(issuer, 'RUTEmisor') ?? textOf(issuer, 'RutEmisor')
  const receiverRut = textOf(receiver, 'RUTRecep') ?? textOf(receiver, 'RutRecep')
  return {
    type: integerOf(required(textOf(idDoc, 'TipoDTE') ?? textOf(idDoc, 'TpoDoc'), 'TipoDTE'), 'TipoDTE'),
    folio: integerOf(required(textOf(idDoc, 'Folio'), 'Folio'), 'Folio'),
    issueDate: required(textOf(idDoc, 'FchEmis'), 'FchEmis'),
    issuerRut: issuerRut === null ? coverIssuer : toSiiRut(issuerRut, 'RUTEmisor'),
    receiverRut:
      receiverRut === null
        ? (coverReceiver ??
          (() => {
            throw new DteError('MISSING_FIELD', { field: 'RUTRecep' })
          })())
        : toSiiRut(receiverRut, 'RUTRecep'),
    total: integerOf(textOf(nodeOf(header?.['Totales']), 'MntTotal') ?? '0', 'MntTotal'),
  }
}

/**
 * EN: Reads the exchange set: the root is `EnvioDTE`, `EnvioDTEB`, `EnvioDTETraslado` or `EnvioBOLETA`; the set id,
 * the cover's RUTs and, per document, its type (`TipoDTE` or `TpoDoc`), folio, issue date, issuer and receiver (the
 * cover's when the document names none) and total (0 when none). Every RUT goes through `rut.ts`.
 * ES: Lee el set de intercambio: la raíz es `EnvioDTE`, `EnvioDTEB`, `EnvioDTETraslado` o `EnvioBOLETA`; el id del set,
 * los RUT de la carátula y, por documento, su tipo (`TipoDTE` o `TpoDoc`), folio, fecha de emisión, emisor y receptor
 * (los de la carátula cuando el documento no los nombra) y total (0 si no trae). Cada RUT pasa por `rut.ts`.
 * @throws {DteError} EN: `XML_PARSE_FAILED` (malformed, no envelope root, a number that is none), `MISSING_FIELD` (the cover's issuer, a document's type, folio, date or receiver), `INVALID_RUT`, `ENVELOPE_EMPTY`. ES: los mismos códigos.
 */
export const parseExchangeSet = (setXml: string): ExchangeSet => {
  const parsed = parseXmlWithoutNamespaces(setXml)
  const root = ENVELOPE_ROOTS.map((name) => nodeOf(parsed[name])).find((node) => node !== null) ?? null
  const set = nodeOf(root?.['SetDTE']) ?? nodeOf(parsed['SetDTE'])
  if (set === null) throw new DteError('XML_PARSE_FAILED', { field: 'SetDTE', reason: 'no envelope root' })
  const cover = nodeOf(set['Caratula'])
  const issuerRut = toSiiRut(required(textOf(cover, 'RutEmisor'), 'RutEmisor'), 'RutEmisor')
  const receiverRut = optionalRut(textOf(cover, 'RutReceptor'), 'RutReceptor')
  const documents = listOf(set['DTE']).map((dte) => documentOf(nodeOf(dte), issuerRut, receiverRut))
  if (documents.length === 0) throw new DteError('ENVELOPE_EMPTY', { field: 'DTE' })
  return {
    setId: textOf(set, '@_ID') ?? DEFAULT_SET_ID,
    issuerRut,
    senderRut: optionalRut(textOf(cover, 'RutEnvia'), 'RutEnvia'),
    receiverRut,
    documents,
  }
}

const compact = (fields: Readonly<Record<string, string>>): Readonly<Record<string, string>> =>
  Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== ''))

const documentFields = (document: ExchangeDocument): Readonly<Record<string, string | number>> => ({
  TipoDTE: document.type,
  Folio: document.folio,
  FchEmis: document.issueDate,
  RUTEmisor: document.issuerRut,
  RUTRecep: document.receiverRut,
  MntTotal: document.total,
})

const rootAttributes = (schema: string): Readonly<Record<string, string>> => ({
  '@_xmlns': SII_NS,
  '@_xmlns:xsi': XSI_NS,
  '@_xsi:schemaLocation': `${SII_NS} ${schema}`,
  '@_version': '1.0',
})

const signedResponse = (resultado: Node, certificate: CreateExchangeAnswersInput['certificate']): string =>
  signEnveloped({
    xml: buildXml({ RespuestaDTE: { ...rootAttributes(RESPONSE_SCHEMA), Resultado: resultado } }),
    elementTag: 'Resultado',
    rootTag: 'RespuestaDTE',
    certificate,
  }).xml

// A receipt is signed on its own, with the namespaces the envelope will put in scope declared on it, so its digest
// is the one a verifier computes inside the envelope; the declarations then leave the start tag, as redundant.
const STANDALONE_RECEIPT = `<Recibo xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}" version="1.0">`

const signedReceipt = (
  document: ExchangeDocument,
  position: number,
  signer: SiiRut,
  stamp: string,
  certificate: CreateExchangeAnswersInput['certificate'],
): string =>
  signEnveloped({
    xml: buildXml({
      Recibo: {
        '@_xmlns': SII_NS,
        '@_xmlns:xsi': XSI_NS,
        '@_version': '1.0',
        DocumentoRecibo: {
          '@_ID': `REC-${position}`,
          TipoDoc: document.type,
          Folio: document.folio,
          FchEmis: document.issueDate,
          RUTEmisor: document.issuerRut,
          RUTRecep: document.receiverRut,
          MntTotal: document.total,
          Recinto: RECEIPT_PLACE,
          RutFirma: signer,
          Declaracion: RECEIPT_DECLARATION,
          TmstFirmaRecibo: stamp,
        },
      },
    }),
    elementTag: 'DocumentoRecibo',
    rootTag: 'Recibo',
    certificate,
  }).xml.replace(STANDALONE_RECEIPT, '<Recibo version="1.0">')

/**
 * EN: Builds and signs the three answers to an exchange set, as the certification expects them: the reception
 * response (the envelope received, every document received when its receiver is the company, else "error en RUT
 * receptor"), the receipts of Ley 19.983 (one per document, signed by the certificate holder) and the commercial
 * approval (accepted when the receiver is the company, else rejected with `CodRchDsc` -1). One line each, UTF-8, no
 * declaration; the ids carry the clock in milliseconds and every timestamp is Chile's local time.
 * ES: Arma y firma las tres respuestas a un set de intercambio, como las espera la certificación: la respuesta de
 * recepción (el sobre recibido, cada documento recibido cuando su receptor es la empresa, si no "error en RUT
 * receptor"), los recibos de la Ley 19.983 (uno por documento, firmados por el titular del certificado) y la
 * aprobación comercial (aceptado cuando el receptor es la empresa, si no rechazado con `CodRchDsc` -1). Una línea cada
 * una, UTF-8, sin declaración; los ids llevan el reloj en milisegundos y cada marca de tiempo es la hora local de Chile.
 * @param setXml EN: the set as the portal served it. ES: el set como lo sirvió el portal.
 * @param input EN: the company, the certificate, the contact and the clock. ES: la empresa, el certificado, el contacto y el reloj.
 * @returns EN: the three answers and the set read. ES: las tres respuestas y el set leído.
 * @throws {DteError} EN: the codes of `parseExchangeSet`; `INVALID_RUT { field: 'companyRut' }`. ES: los mismos códigos.
 */
export const createExchangeAnswers = (setXml: string, input: CreateExchangeAnswersInput): ExchangeAnswers => {
  const set = parseExchangeSet(setXml)
  const company = toSiiRut(input.companyRut, 'companyRut')
  const now = input.now ?? new Date()
  const ms = now.getTime()
  const stamp = chileTimestamp(now)
  const contact = compact({
    NmbContacto: sanitizeText(input.contact?.name),
    FonoContacto: sanitizeText(input.contact?.phone),
    MailContacto: sanitizeText(input.contact?.mail),
  })
  const { FonoContacto: _phone, ...responseContact } = contact
  const isCompany = (document: ExchangeDocument): boolean => document.receiverRut === company
  const cover = (details: number): Node => ({
    '@_version': '1.0',
    RutResponde: company,
    RutRecibe: set.issuerRut,
    IdRespuesta: 1,
    NroDetalles: details,
    ...responseContact,
    TmstFirmaResp: stamp,
  })
  const reception = signedResponse(
    {
      '@_ID': `R_ENVIO_${ms}`,
      Caratula: cover(1),
      RecepcionEnvio: {
        NmbEnvio: `ENVIO_DTE_${ms}`,
        FchRecep: stamp,
        CodEnvio: 1,
        EnvioDTEID: set.setId,
        RutEmisor: set.issuerRut,
        RutReceptor: company,
        EstadoRecepEnv: ENVELOPE_RECEIVED.code,
        RecepEnvGlosa: ENVELOPE_RECEIVED.gloss,
        NroDTE: set.documents.length,
        RecepcionDTE: set.documents.map((document) => {
          const state = isCompany(document) ? DOCUMENT_RECEIVED : DOCUMENT_WRONG_RECEIVER
          return { ...documentFields(document), EstadoRecepDTE: state.code, RecepDTEGlosa: state.gloss }
        }),
      },
    },
    input.certificate,
  )
  const approval = signedResponse(
    {
      '@_ID': `R_DTE_${ms}`,
      Caratula: cover(set.documents.length),
      ResultadoDTE: set.documents.map((document, index) =>
        isCompany(document)
          ? {
              ...documentFields(document),
              CodEnvio: index + 1,
              EstadoDTE: DOCUMENT_ACCEPTED.code,
              EstadoDTEGlosa: DOCUMENT_ACCEPTED.gloss,
            }
          : {
              ...documentFields(document),
              CodEnvio: index + 1,
              EstadoDTE: DOCUMENT_REJECTED.code,
              EstadoDTEGlosa: DOCUMENT_REJECTED.gloss,
              CodRchDsc: DOCUMENT_REJECTED.reason,
            },
      ),
    },
    input.certificate,
  )
  const signer = input.certificate.rut ?? company
  const receipts = set.documents
    .map((document, index) => signedReceipt(document, index + 1, signer, stamp, input.certificate))
    .join('')
  const unsignedReceipts = buildXml({
    EnvioRecibos: {
      ...rootAttributes(RECEIPTS_SCHEMA),
      SetRecibos: {
        '@_ID': `SetRecibos_${ms}`,
        Caratula: {
          '@_version': '1.0',
          RutResponde: company,
          RutRecibe: set.issuerRut,
          ...contact,
          TmstFirmaEnv: stamp,
        },
      },
    },
  }).replace('</SetRecibos>', () => `${receipts}</SetRecibos>`)
  const signedReceipts = signEnveloped({
    xml: unsignedReceipts,
    elementTag: 'SetRecibos',
    rootTag: 'EnvioRecibos',
    certificate: input.certificate,
  }).xml
  return {
    reception: { fileName: EXCHANGE_ANSWER_FILES.reception, xml: reception },
    receipts: { fileName: EXCHANGE_ANSWER_FILES.receipts, xml: signedReceipts },
    approval: { fileName: EXCHANGE_ANSWER_FILES.approval, xml: approval },
    set,
  }
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/certification/exchange --coverage=false
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/certification/exchange.ts tests/certification/exchange.test.ts tests/fixtures/xsd/RespuestaEnvioDTE_v10.xsd tests/fixtures/xsd/EnvioRecibos_v10.xsd tests/fixtures/xsd/Recibos_v10.xsd tests/support/xsd.ts
```

```bash
git commit -F - <<'MSG'
feat: the exchange answers: the set parsed and the reception response, receipts and commercial approval signed

The three answers follow the official RespuestaEnvioDTE and EnvioRecibos
schemas, now among the test fixtures and validated in the tests; each
receipt is signed with the envelope's namespaces in scope, then the set
of receipts and each response's Resultado are signed enveloped.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 6: The two steps, the runner and readPrintedSamples

`runExchange` (spec 3.10: the set given, kept or downloaded, the answers generated and kept under `intercambio/`, the user validated, the uploads and the confirmations, the stage moved; `setUnavailable`, `notInExchange` and `alreadyDone` as data) and `uploadPrintedSamples` (the review read, resumed in `INGRESO` or created, every PDF uploaded with its name saved as it goes, the review submitted and read again, `RECHAZADO` with its detail and summary; `blocked`, `alreadySubmitted` and `rejected` as data). The state gains `exchange` and `samples`, the dependencies `contact`, the events the field's five names. `runCertification` (spec 3.11) runs the exchange at `exchange` and the samples at `printedSamples` when the `samples` option gives them, and stops with `exchange`, `printedSamples`, `blocked` or `rejected` in front of what it lacks; `exchangeSetXml` takes a set downloaded by hand. `readPrintedSamples` reads every `.pdf` under a directory, in name order, the test set's folder first.

**Files:**

- Create: `src/certification/exchange-step.ts`
- Create: `src/certification/samples-step.ts`
- Modify: `src/catalogs/certification.ts`
- Modify: `src/certification/runtime.ts`
- Modify: `src/certification/state.ts`
- Modify: `src/certification/runner.ts`
- Modify: `src/pdf/samples.ts`
- Modify: `src/pdf/node-samples.ts`
- Test (create): `tests/support/exchange-fixtures.ts`
- Test (create): `tests/certification/steps-exchange.test.ts`
- Test (create): `tests/certification/steps-samples.test.ts`
- Test (modify): `tests/certification/runner.test.ts`
- Test (modify): `tests/pdf/node-samples.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/support/exchange-fixtures.ts` (new file, whole):

```ts
// Synthetic exchange sets and the fake routes of the two GWT portals, for the step and runner tests. Every value is
// invented; the GWT answers follow the field's shapes.
import { EXCHANGE_PORTAL, SAMPLES_PORTAL, type GwtPortal } from '../../src/catalogs/certification'
import type { FakeReply, FakeRoute, RecordedRequest } from './fake-sii'
import { ISSUER_RUT, RECEIVER_RUT } from './fixtures'
import { EMPTY_OK, okAnswer } from './gwt-answers'

/** The SII issues the exchange set; the company under certification receives it. */
export const SET_ISSUER = RECEIVER_RUT
const SII_NS = 'http://www.sii.cl/SiiDte'

const exchangeDocument = (type: number, folio: number, receiver: string): string =>
  `<DTE version="1.0"><Documento ID="F${folio}T${type}"><Encabezado><IdDoc><TipoDTE>${type}</TipoDTE><Folio>${folio}</Folio><FchEmis>2026-11-0${folio}</FchEmis></IdDoc><Emisor><RUTEmisor>${SET_ISSUER}</RUTEmisor></Emisor><Receptor><RUTRecep>${receiver}</RUTRecep></Receptor><Totales><MntTotal>${folio * 1000}</MntTotal></Totales></Encabezado></Documento></DTE>`

/** An exchange set of `count` documents addressed to the company. */
export const exchangeSetXml = (count = 2): string =>
  `<?xml version="1.0" encoding="ISO-8859-1"?><EnvioDTE xmlns="${SII_NS}" version="1.0"><SetDTE ID="SetDoc"><Caratula version="1.0"><RutEmisor>${SET_ISSUER}</RutEmisor><RutEnvia>${SET_ISSUER}</RutEnvia><RutReceptor>${ISSUER_RUT}</RutReceptor><FchResol>2026-01-01</FchResol><NroResol>0</NroResol><TmstFirmaEnv>2026-11-01T10:00:00</TmstFirmaEnv></Caratula>${Array.from(
    { length: count },
    (_, index) => exchangeDocument(index === 0 ? 33 : 61, index + 1, ISSUER_RUT),
  ).join('')}</SetDTE></EnvioDTE>`

/** The method of a GWT-RPC body: the fourth string of its table. */
export const gwtMethodOf = (request: RecordedRequest): string => request.text.split('|')[6]

/** The warm-up page and the module script that confirms the known permutation. */
export const gwtWarmUpRoutes = (portal: GwtPortal): FakeRoute[] => [
  { method: 'GET', url: portal.base, reply: { body: '<html>portal</html>' } },
  {
    method: 'GET',
    url: `${portal.base}${portal.moduleName}.nocache.js`,
    reply: { body: `'${portal.known.permutation}'` },
  },
]

export const USER_TYPE = 'cl.sii.sdi.dim.pfe.to.UsuarioTo/3723336533'
/** The user validation when the company stands in an earlier stage. */
export const NOT_IN_EXCHANGE = okAnswer([0], [USER_TYPE, 'La empresa no esta en estado P06, estado: P05'])
/** The user validation once the exchange was completed. */
export const EXCHANGE_COMPLETED = okAnswer([0], [USER_TYPE, 'La empresa no esta en estado P06, estado: P90'])
export const REFUSED_UPLOAD =
  '<html><head><title>ERROR</title></head><body>no vienen los parametros necesarios</body></html>'

export type ExchangeRouteOptions = {
  /** The answer of each facade method; `EMPTY_OK` for the rest. */
  readonly facade?: Readonly<Record<string, FakeReply>>
  /** The download answer; the two-document set by default. */
  readonly download?: FakeReply
  /** The three upload answers; `ok` by default. */
  readonly uploads?: readonly FakeReply[]
}

/** The exchange portal: warm-up, hashes, the download, the three uploads and the facade. */
export const exchangeRoutes = (options: ExchangeRouteOptions = {}): FakeRoute[] => [
  ...gwtWarmUpRoutes(EXCHANGE_PORTAL),
  {
    method: 'POST',
    url: `${EXCHANGE_PORTAL.base}downloadFile*`,
    reply: options.download ?? { body: exchangeSetXml() },
  },
  ...[1, 2, 3].map(
    (n): FakeRoute => ({
      method: 'POST',
      url: `${EXCHANGE_PORTAL.base}uploadFile${n}*`,
      reply: options.uploads?.[n - 1] ?? { body: `ok${n}` },
    }),
  ),
  {
    method: 'POST',
    url: `${EXCHANGE_PORTAL.base}facade`,
    reply: (request) => options.facade?.[gwtMethodOf(request)] ?? { body: EMPTY_OK },
  },
]

export const SAMPLES_SERVICE_URL = `${SAMPLES_PORTAL.base}ServicePdfDte`
export const SAMPLES_UPLOAD_URL = `${SAMPLES_PORTAL.base}upload`
export const REVIEW_TOKEN = 'BAqo'
export const REVIEW_ID = 264872

/** A `leeImpreso` answer with a state, the review token and the date sent. */
export const reviewAnswer = (state: string, token = REVIEW_TOKEN): string =>
  `//OK[7,6,'${token}',5,4,["java.util.ArrayList/4159755760","cl.sii.sdi.dim.validaPdfDte.to.ImpresoTo/1","${state}","2026-11-01 10:20","3"],0,7]`
/** A `creaLista` answer with the review token. */
export const CREATED_REVIEW = okAnswer([`'${REVIEW_TOKEN}'`], ['cl.sii.sdi.dim.validaPdfDte.to.ListaTo/1'])
/** A `leeImpreso` answer that names no state: the application is not in the printed samples stage. */
export const SAMPLES_BLOCKED = okAnswer(
  [0],
  ['cl.sii.sdi.dim.validaPdfDte.to.ImpresoTo/1', "El estado de la postulacion NO es: 'DOCUMENTOS IMPRESOS'"],
)

export type SamplesRouteOptions = {
  /** The answer of each service method, or a function of the call number for `leeImpreso`. */
  readonly service?: Readonly<Record<string, FakeReply | ((call: number) => FakeReply)>>
  /** The upload answers in order, the last one repeated; `ok` by default. */
  readonly uploads?: readonly FakeReply[]
}

/** The samples portal: warm-up, hashes, the service and the upload. Each method counts its own calls. */
export const samplesRoutes = (options: SamplesRouteOptions = {}): FakeRoute[] => {
  const calls = new Map<string, number>()
  const uploads = { count: 0 }
  return [
    ...gwtWarmUpRoutes(SAMPLES_PORTAL),
    {
      method: 'POST',
      url: SAMPLES_SERVICE_URL,
      reply: (request) => {
        const method = gwtMethodOf(request)
        const call = (calls.get(method) ?? 0) + 1
        calls.set(method, call)
        const answer = options.service?.[method]
        if (answer === undefined) return { body: EMPTY_OK }
        return typeof answer === 'function' ? answer(call) : answer
      },
    },
    {
      method: 'POST',
      url: SAMPLES_UPLOAD_URL,
      reply: () => {
        uploads.count += 1
        const replies = options.uploads ?? [{ body: 'ok' }]
        return replies[Math.min(uploads.count, replies.length) - 1]
      },
    },
  ]
}
```

`tests/certification/steps-exchange.test.ts` (new file, whole):

```ts
import { EXCHANGE_PORTAL } from '../../src/catalogs/certification'
import { EXCHANGE_SET_ARTEFACT, runExchange } from '../../src/certification/exchange-step'
import { encodeUtf8 } from '../../src/sii/transport'
import { decodeLatin1 } from '../../src/text/latin1'
import { parseXml } from '../../src/xml/parse'
import { certificationHarness, stateWith } from '../support/certification-harness'
import {
  EXCHANGE_COMPLETED,
  exchangeRoutes,
  exchangeSetXml,
  gwtMethodOf,
  NOT_IN_EXCHANGE,
  REFUSED_UPLOAD,
  USER_TYPE,
} from '../support/exchange-fixtures'
import { EXCEPTION, okAnswer } from '../support/gwt-answers'
import { failure } from '../support/portal'

const BASE = EXCHANGE_PORTAL.base
const FACADE = `${BASE}facade`
const atExchange = () => stateWith({ stage: 'exchange' })
const facadeMethods = (harness: Awaited<ReturnType<typeof certificationHarness>>) =>
  harness.fake.requests.filter((request) => request.url === FACADE).map(gwtMethodOf)

describe('runExchange', () => {
  test('the set given: the answers generated and kept, the user validated, the uploads and the confirmations, the stage moved', async () => {
    const harness = await certificationHarness(exchangeRoutes())
    const result = await runExchange(harness.deps, atExchange(), { setXml: exchangeSetXml(3) })
    expect(result.outcome).toBe('done')
    expect(result.state.stage).toBe('printedSamples')
    expect(result.state.exchange).toEqual({
      setId: 'SetDoc',
      issuerRut: '12345678-5',
      documents: 3,
      generatedAt: '2026-11-15T18:30:00.000Z',
      uploaded: true,
      confirmed: true,
    })
    expect(await harness.store.listArtefacts()).toEqual([
      'intercambio/envio-recibos.xml',
      'intercambio/pfe-seguimiento-40.html',
      'intercambio/pfe-seguimiento-41.html',
      'intercambio/pfe-seguimiento-43.html',
      'intercambio/pfe-upload-1.html',
      'intercambio/pfe-upload-2.html',
      'intercambio/pfe-upload-3.html',
      'intercambio/pfe-validar.html',
      'intercambio/pfe-validarset.html',
      'intercambio/respuesta-aprobacion-comercial.xml',
      'intercambio/respuesta-recepcion-envio.xml',
      EXCHANGE_SET_ARTEFACT,
    ])
    expect(await harness.store.readArtefact(EXCHANGE_SET_ARTEFACT)).toBe(exchangeSetXml(3))
    expect(await harness.store.readArtefact('intercambio/pfe-upload-2.html')).toBe('ok2')
    expect(harness.steps()).toEqual(['INTERCAMBIO_START', 'INTERCAMBIO_DESCARGADO', 'INTERCAMBIO_DONE'])
    expect(harness.events[2]).toEqual({ step: 'INTERCAMBIO_DONE', uploaded: true })
    expect(facadeMethods(harness)).toEqual([
      'validarUsuario',
      'validarSetContriPostSeguimiento',
      'updatePostulacionSeguimiento',
      'updatePostulacionSeguimiento',
      'updatePostulacionSeguimiento',
    ])
    // The uploads carry the artefacts, and the hashes found once serve the confirmation too.
    const uploads = harness.fake.requests.filter((request) => request.url.includes('/uploadFile'))
    // The fake reads every part as Latin-1; the answers travel as UTF-8.
    const asSent = async (name: string) => decodeLatin1(encodeUtf8((await harness.store.readArtefact(name))!))
    expect(uploads.map((request) => request.parts[0].value)).toEqual([
      await asSent('intercambio/respuesta-recepcion-envio.xml'),
      await asSent('intercambio/envio-recibos.xml'),
      await asSent('intercambio/respuesta-aprobacion-comercial.xml'),
    ])
    expect(harness.urls().filter((url) => url.endsWith('nocache.js'))).toHaveLength(1)
    expect(harness.urls().some((url) => url.includes('downloadFile'))).toBe(false)
  })

  test('not in the exchange: the state the portal names is kept, nothing is uploaded, and the next run finds the set kept', async () => {
    const answers = { validarUsuario: { body: NOT_IN_EXCHANGE } }
    const harness = await certificationHarness(exchangeRoutes({ facade: answers }))
    const first = await runExchange(harness.deps, atExchange())
    expect(first.outcome).toBe('notInExchange')
    expect(first.detail).toBe('La empresa no esta en estado P06, estado: P05')
    expect(first.state.stage).toBe('exchange')
    expect(first.state.exchange).toMatchObject({ uploaded: false, confirmed: false, portalState: 'P05' })
    expect(await harness.store.readArtefact('intercambio/pfe-download.html')).toBe(exchangeSetXml())
    expect(await harness.store.readArtefact(EXCHANGE_SET_ARTEFACT)).toBe(exchangeSetXml())
    expect(harness.urls().some((url) => url.includes('/uploadFile'))).toBe(false)
    expect(harness.steps()).toEqual(['INTERCAMBIO_START', 'INTERCAMBIO_DESCARGADO'])
    // The second run reads the artefact: one download in all.
    const second = await runExchange(harness.deps, first.state)
    expect(second.outcome).toBe('notInExchange')
    expect(harness.urls().filter((url) => url.includes('/downloadFile'))).toHaveLength(1)
    // A sentence without the state word leaves the portal state out.
    const vague = await certificationHarness(
      exchangeRoutes({
        facade: { validarUsuario: { body: okAnswer([0], [USER_TYPE, 'Error: usuario no autorizado']) } },
      }),
    )
    const refused = await runExchange(vague.deps, atExchange(), { setXml: exchangeSetXml() })
    expect(refused).toMatchObject({ outcome: 'notInExchange', detail: 'Error: usuario no autorizado' })
    expect(refused.state.exchange).not.toHaveProperty('portalState')
  })

  test('the download gives no set: the page is kept, the artefact to fill is named, and nothing else changes', async () => {
    const harness = await certificationHarness(exchangeRoutes({ download: { body: REFUSED_UPLOAD } }))
    const result = await runExchange(harness.deps, atExchange())
    expect(result).toEqual({ state: atExchange(), outcome: 'setUnavailable', detail: EXCHANGE_SET_ARTEFACT })
    expect(await harness.store.listArtefacts()).toEqual(['intercambio/pfe-download-error.html'])
    expect(await harness.store.readArtefact('intercambio/pfe-download-error.html')).toBe(REFUSED_UPLOAD)
    expect(harness.steps()).toEqual(['INTERCAMBIO_START'])
    const failing = await certificationHarness(exchangeRoutes({ download: new Error('socket hang up') }))
    await expect(runExchange(failing.deps, atExchange())).rejects.toThrow('socket hang up')
  })

  test('the exchange already completed at the portal, or confirmed in the state, is done without uploading', async () => {
    const harness = await certificationHarness(
      exchangeRoutes({ facade: { validarUsuario: { body: EXCHANGE_COMPLETED } } }),
    )
    const result = await runExchange(harness.deps, atExchange(), { setXml: exchangeSetXml() })
    expect(result.outcome).toBe('alreadyDone')
    expect(result.state.stage).toBe('printedSamples')
    expect(result.state.exchange).toMatchObject({ uploaded: false, confirmed: false, portalState: 'P90' })
    expect(harness.urls().some((url) => url.includes('/uploadFile'))).toBe(false)
    const confirmed = stateWith({
      stage: 'printedSamples',
      exchange: {
        setId: 'S',
        issuerRut: '12345678-5',
        documents: 1,
        generatedAt: 'x',
        uploaded: true,
        confirmed: true,
      },
    })
    const quiet = await certificationHarness([])
    await expect(runExchange(quiet.deps, confirmed)).resolves.toEqual({
      state: confirmed,
      outcome: 'alreadyDone',
      detail: 'confirmed',
    })
    expect(quiet.urls()).toEqual([])
  })

  test('a refused upload or a confirmation without //OK propagates after the uploaded flag is saved as it stands', async () => {
    const refused = await certificationHarness(exchangeRoutes({ uploads: [{ body: 'ok1' }, { body: REFUSED_UPLOAD }] }))
    const error = await failure(runExchange(refused.deps, atExchange(), { setXml: exchangeSetXml() }))
    expect(error.code).toBe('SII_PORTAL_REJECTED')
    expect(await refused.store.load()).toBeNull()
    const unconfirmed = await certificationHarness(
      exchangeRoutes({ facade: { updatePostulacionSeguimiento: { body: EXCEPTION } } }),
    )
    const failed = await failure(runExchange(unconfirmed.deps, atExchange(), { setXml: exchangeSetXml() }))
    expect(failed.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect((await unconfirmed.store.load())?.exchange).toMatchObject({ uploaded: true, confirmed: false })
    expect(await unconfirmed.store.readArtefact('intercambio/pfe-upload-3.html')).toBe('ok3')
  })

  test('the contact of the dependencies names the answers', async () => {
    const harness = await certificationHarness(exchangeRoutes())
    const deps = { ...harness.deps, contact: { name: 'Contacto', mail: 'contacto@example.test', phone: '123' } }
    await runExchange(deps, atExchange(), { setXml: exchangeSetXml() })
    const reception = parseXml((await harness.store.readArtefact('intercambio/respuesta-recepcion-envio.xml'))!)
    const cover = (reception['RespuestaDTE'] as { Resultado: { Caratula: Record<string, string> } }).Resultado.Caratula
    expect(cover).toMatchObject({ NmbContacto: 'Contacto', MailContacto: 'contacto@example.test' })
    expect(cover).not.toHaveProperty('FonoContacto')
    const receipts = parseXml((await harness.store.readArtefact('intercambio/envio-recibos.xml'))!)
    const setCover = (receipts['EnvioRecibos'] as { SetRecibos: { Caratula: Record<string, string> } }).SetRecibos
      .Caratula
    expect(setCover['FonoContacto']).toBe('123')
  })
})
```

`tests/certification/steps-samples.test.ts` (new file, whole):

```ts
import { uploadPrintedSamples } from '../../src/certification/samples-step'
import { certificationHarness, stateWith } from '../support/certification-harness'
import {
  CREATED_REVIEW,
  gwtMethodOf,
  REVIEW_ID,
  REVIEW_TOKEN,
  reviewAnswer,
  SAMPLES_BLOCKED,
  SAMPLES_SERVICE_URL,
  SAMPLES_UPLOAD_URL,
  samplesRoutes,
} from '../support/exchange-fixtures'
import { detailAnswer, EMPTY_OK, EXCEPTION, okAnswer } from '../support/gwt-answers'
import { failure } from '../support/portal'

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46])
const samples = [
  { fileName: 'muestra_33_1.pdf', bytes: PDF },
  { fileName: 'muestra_61_2.pdf', bytes: PDF },
]
const atSamples = () => stateWith({ stage: 'printedSamples' })
const DETAIL_ROWS = [
  ['1', 'muestra_33_1.pdf', 'PRUEBA', 'FACTURA ELECTRONICA', '1', 'ORIGINAL', 'CASO-1'],
  ['2', 'muestra_61_2.pdf', 'SIMULACION', 'NOTA DE CREDITO ELECTRONICA', '2', 'ORIGINAL', ''],
]
type Harness = Awaited<ReturnType<typeof certificationHarness>>
const methods = (harness: Harness) =>
  harness.fake.requests.filter((request) => request.url === SAMPLES_SERVICE_URL).map(gwtMethodOf)
const uploads = (harness: Harness) => harness.fake.requests.filter((request) => request.url === SAMPLES_UPLOAD_URL)

describe('uploadPrintedSamples', () => {
  test('no review yet: one is created, every PDF uploaded in order, the review submitted and read again', async () => {
    const harness = await certificationHarness(
      samplesRoutes({
        service: {
          leeImpreso: (call) => ({ body: call === 1 ? EMPTY_OK : reviewAnswer('ENVIADO AL SII') }),
          creaLista: { body: CREATED_REVIEW },
        },
      }),
    )
    const result = await uploadPrintedSamples(harness.deps, atSamples(), { samples })
    expect(result.outcome).toBe('submitted')
    expect(result.detail).toBe('ENVIADO AL SII')
    expect(result.state.stage).toBe('compliance')
    expect(result.state.samples).toEqual({
      revisionId: REVIEW_ID,
      revisionToken: REVIEW_TOKEN,
      state: 'ENVIADO AL SII',
      uploaded: ['muestra_33_1.pdf', 'muestra_61_2.pdf'],
      submittedAt: '2026-11-15T18:30:00.000Z',
    })
    expect(methods(harness)).toEqual(['leeImpreso', 'creaLista', 'solicitaRevisionSII', 'leeImpreso'])
    expect(uploads(harness).map((request) => request.parts.map((part) => part.value))).toEqual([
      ['%PDF', String(REVIEW_ID), 'false'],
      ['%PDF', String(REVIEW_ID), 'false'],
    ])
    expect(uploads(harness).map((request) => request.parts[0].fileName)).toEqual(samples.map((s) => s.fileName))
    expect(await harness.store.listArtefacts()).toEqual([
      'muestras/pdfte-crea-lista.html',
      'muestras/pdfte-enviar-sii.html',
      'muestras/pdfte-estado-post-envio.html',
      'muestras/pdfte-lee-impreso.html',
      'muestras/upload-1.html',
      'muestras/upload-2.html',
    ])
    expect(harness.events).toEqual([
      { step: 'MUESTRAS_UPLOADING', count: 2 },
      { step: 'MUESTRAS_DONE', success: true },
    ])
    expect(harness.urls().filter((url) => url.endsWith('nocache.js'))).toHaveLength(1)
  })

  test('a review in INGRESO with a readable id is resumed; one without an id is replaced by a new review', async () => {
    const resumed = await certificationHarness(
      samplesRoutes({
        service: {
          leeImpreso: (call) => ({ body: call === 1 ? reviewAnswer('INGRESO') : reviewAnswer('POR REVISAR') }),
        },
      }),
    )
    const result = await uploadPrintedSamples(resumed.deps, atSamples(), { samples: samples.slice(0, 1) })
    expect(result.outcome).toBe('submitted')
    expect(result.state.samples).toMatchObject({
      revisionId: REVIEW_ID,
      state: 'POR REVISAR',
      uploaded: ['muestra_33_1.pdf'],
    })
    expect(methods(resumed)).toEqual(['leeImpreso', 'solicitaRevisionSII', 'leeImpreso'])
    expect(await resumed.store.readArtefact('muestras/pdfte-crea-lista.html')).toBeNull()
    const noId = await certificationHarness(
      samplesRoutes({
        service: {
          leeImpreso: (call) => ({
            body: call === 1 ? okAnswer([0], ['cl.sii.x/1', 'INGRESO']) : reviewAnswer('POR REVISAR'),
          }),
          creaLista: { body: CREATED_REVIEW },
        },
      }),
    )
    await uploadPrintedSamples(noId.deps, atSamples(), { samples: samples.slice(0, 1) })
    expect(methods(noId)).toEqual(['leeImpreso', 'creaLista', 'solicitaRevisionSII', 'leeImpreso'])
  })

  test('a review already sent ends at once with its state and date, the stage moved on', async () => {
    const harness = await certificationHarness(
      samplesRoutes({ service: { leeImpreso: { body: reviewAnswer('EN REVISION') } } }),
    )
    const before = stateWith({
      stage: 'printedSamples',
      samples: { revisionId: 1, revisionToken: 'x', state: 'INGRESO', uploaded: ['a.pdf'] },
    })
    const result = await uploadPrintedSamples(harness.deps, before, { samples })
    expect(result).toMatchObject({ outcome: 'alreadySubmitted', detail: 'EN REVISION' })
    expect(result.state.stage).toBe('compliance')
    expect(result.state.samples).toEqual({
      revisionId: REVIEW_ID,
      revisionToken: REVIEW_TOKEN,
      state: 'EN REVISION',
      uploaded: ['a.pdf'],
      submittedAt: '2026-11-01 10:20',
    })
    expect(uploads(harness)).toHaveLength(0)
    expect(harness.events[1]).toEqual({ step: 'MUESTRAS_DONE', success: true })
    const fresh = await uploadPrintedSamples(harness.deps, atSamples(), { samples })
    expect(fresh.state.samples?.uploaded).toEqual([])
  })

  test('a portal that names no state after the submission: submitted all the same', async () => {
    const harness = await certificationHarness(
      samplesRoutes({
        service: {
          leeImpreso: (call) => ({ body: call === 1 ? reviewAnswer('APROBADO') : EMPTY_OK }),
          creaLista: { body: CREATED_REVIEW },
        },
      }),
    )
    const result = await uploadPrintedSamples(harness.deps, atSamples(), { samples: samples.slice(0, 1) })
    expect(result).toMatchObject({ outcome: 'submitted', detail: 'submitted' })
    expect(result.state.samples).toMatchObject({ state: null, uploaded: ['muestra_33_1.pdf'] })
    expect(result.state.stage).toBe('compliance')
  })

  test('blocked: the sentence of the portal, nothing uploaded, the stage kept', async () => {
    const harness = await certificationHarness(samplesRoutes({ service: { leeImpreso: { body: SAMPLES_BLOCKED } } }))
    const result = await uploadPrintedSamples(harness.deps, atSamples(), { samples })
    expect(result.outcome).toBe('blocked')
    expect(result.detail).toBe("El estado de la postulacion NO es: 'DOCUMENTOS IMPRESOS'")
    expect(result.state.stage).toBe('printedSamples')
    expect(result.state.samples).toEqual({ revisionId: null, revisionToken: null, state: null, uploaded: [] })
    expect(methods(harness)).toEqual(['leeImpreso'])
    expect(harness.events[1]).toEqual({ step: 'MUESTRAS_DONE', success: false })
  })

  test('rejected at once: the detail read and summed up; a detail that cannot be read leaves the summary generic', async () => {
    const service = {
      leeImpreso: (call: number) => ({ body: call === 1 ? reviewAnswer('RECHAZADO') : reviewAnswer('RECHAZADO') }),
      creaLista: { body: CREATED_REVIEW },
    }
    const detailed = await certificationHarness(
      samplesRoutes({ service: { ...service, muestraMail: { body: detailAnswer(DETAIL_ROWS) } } }),
    )
    const result = await uploadPrintedSamples(detailed.deps, atSamples(), { samples })
    expect(result.outcome).toBe('rejected')
    expect(result.detail).toBe(
      'The SII recognised 1 document(s) as the test set (cases CASO-1: FACTURA ELECTRONICA 1) and 1 as the simulation (NOTA DE CREDITO ELECTRONICA 1). A set missing from the cases was not the envelope the SII registered for it.',
    )
    expect(result.state.stage).toBe('printedSamples')
    expect(result.state.samples).toMatchObject({
      state: 'RECHAZADO',
      summary: result.detail,
      uploaded: samples.map((s) => s.fileName),
    })
    expect(result.state.samples?.detail).toHaveLength(2)
    expect(await detailed.store.readArtefact('muestras/pdfte-detalle-revision.html')).toBe(detailAnswer(DETAIL_ROWS))
    expect(methods(detailed)).toEqual(['leeImpreso', 'creaLista', 'solicitaRevisionSII', 'leeImpreso', 'muestraMail'])
    expect(detailed.events[1]).toEqual({ step: 'MUESTRAS_DONE', success: false })
    const unreadable = await certificationHarness(
      samplesRoutes({ service: { ...service, muestraMail: new Error('socket hang up') } }),
    )
    const generic = await uploadPrintedSamples(unreadable.deps, atSamples(), { samples })
    expect(generic.outcome).toBe('rejected')
    expect(generic.detail).toBe('The SII rejected the printed samples; the detail is in the portal.')
    expect(generic.state.samples?.detail).toEqual([])
    expect(await unreadable.store.readArtefact('muestras/pdfte-detalle-revision.html')).toBeNull()
  })

  test('no samples is a missing field; an upload that fails leaves the names uploaded so far in the state', async () => {
    const quiet = await certificationHarness([])
    const error = await failure(uploadPrintedSamples(quiet.deps, atSamples(), { samples: [] }))
    expect(error.code).toBe('MISSING_FIELD')
    expect(error.details).toEqual({ field: 'samples' })
    expect(quiet.urls()).toEqual([])
    const failing = await certificationHarness(
      samplesRoutes({
        service: { leeImpreso: { body: reviewAnswer('INGRESO') } },
        uploads: [{ body: 'ok' }, { status: 413, body: 'too large' }],
      }),
    )
    const refused = await failure(uploadPrintedSamples(failing.deps, atSamples(), { samples }))
    expect(refused.code).toBe('SII_PORTAL_REJECTED')
    expect((await failing.store.load())?.samples).toMatchObject({
      revisionId: REVIEW_ID,
      uploaded: ['muestra_33_1.pdf'],
    })
    const broken = await certificationHarness(
      samplesRoutes({ service: { leeImpreso: { body: reviewAnswer('APROBADO') }, creaLista: { body: EXCEPTION } } }),
    )
    expect((await failure(uploadPrintedSamples(broken.deps, atSamples(), { samples }))).code).toBe(
      'SII_PORTAL_UNEXPECTED_PAGE',
    )
  })
})
```

`tests/certification/runner.test.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/certification/runner.test.ts b/tests/certification/runner.test.ts
index e58f7d7..163766d 100644
--- a/tests/certification/runner.test.ts
+++ b/tests/certification/runner.test.ts
@@ -32,6 +32,16 @@ import {
   setGenerationForm,
   STANDARD_ROWS,
 } from '../support/certification-pages'
+import {
+  CREATED_REVIEW,
+  exchangeRoutes,
+  exchangeSetXml,
+  NOT_IN_EXCHANGE,
+  reviewAnswer,
+  SAMPLES_BLOCKED,
+  samplesRoutes,
+} from '../support/exchange-fixtures'
+import { detailAnswer, EMPTY_OK } from '../support/gwt-answers'
 import { failure } from '../support/portal'
 import { page } from '../support/portal-pages'
 import { ISSUER_RUT } from '../support/fixtures'
@@ -132,7 +142,7 @@ test('a fresh run: the set, the folios, four sets sent, declared and approved, t
   })
 })
 
-test('resumed at the books: approved books, the advance, the simulation sent, declared and confirmed, then the exchange is phase 5c’s', async () => {
+test('resumed at the books: approved books, the advance, the simulation sent, declared and confirmed, then the exchange stops when the portal says the company is not in it', async () => {
   const harness = await seeded(
     [
       ...history(),
@@ -144,25 +154,31 @@ test('resumed at the books: approved books, the advance, the simulation sent, de
       ...stampingRoutes(),
       uploadRoute(reception('777')),
       post('pe_avance3', DECLARATION_ANSWERS.success),
+      ...exchangeRoutes({ facade: { validarUsuario: { body: NOT_IN_EXCHANGE } } }),
     ],
     stateWith({ plan, sets: allSets, setsApproved: true, stage: 'books', cafs: certificationCafXmls() }),
   )
   const result = await runCertification(harness.deps)
   expect(result.stopped).toBe('exchange')
-  expect(result.state).toMatchObject({ stage: 'exchange', simulation: { trackId: '777', confirmed: true } })
+  expect(result.detail).toContain('estado: P05')
+  expect(result.state).toMatchObject({
+    stage: 'exchange',
+    simulation: { trackId: '777', confirmed: true },
+    exchange: { portalState: 'P05', uploaded: false },
+  })
   expect(result.state.books.results.guideBook?.approved).toBe(true)
   const steps = harness.steps()
   expect(steps).toContain('BOOKS_DONE')
   expect(steps).toContain('ADVANCE_DONE')
-  expect(steps.slice(-3)).toEqual(['POLLING', 'POLLING', 'SIM_DONE'])
+  expect(steps.slice(-5)).toEqual(['POLLING', 'POLLING', 'SIM_DONE', 'INTERCAMBIO_START', 'INTERCAMBIO_DESCARGADO'])
   expect(harness.urls().filter((url) => url.endsWith('DTEUpload'))).toHaveLength(1)
 })
 
-test('past the exchange the portal decides: compliance blocked, or declared', async () => {
+test('at the compliance the portal decides: blocked, or declared; the exchange stops when the company is not in it', async () => {
   const beyond = stateWith({
     plan,
     sets: allSets,
-    stage: 'exchange',
+    stage: 'compliance',
     simulation: { trackId: '777', date: TODAY, sentAt: 'x', confirmed: true },
   })
   const blocked = await seeded(
@@ -188,13 +204,16 @@ test('past the exchange the portal decides: compliance blocked, or declared', as
       avance6([], () => AT_SAMPLES),
       ...compliance(COMPLIANCE_FORM, COMPLIANCE_DECLARED),
     ],
-    { ...beyond, stage: 'printedSamples' },
+    beyond,
   )
   const second = await runCertification(declared.deps, { declareCompliance: true })
   expect(second.stopped).toBe('done')
   expect(second.state.stage).toBe('done')
   expect(declared.steps().slice(-1)).toEqual(['CERT_DONE'])
-  const still = await seeded([entry, avance2([]), avance5, avance6([], () => AT_EXCHANGE)], beyond)
+  const still = await seeded(exchangeRoutes({ facade: { validarUsuario: { body: NOT_IN_EXCHANGE } } }), {
+    ...beyond,
+    stage: 'exchange',
+  })
   await expect(runCertification(still.deps)).resolves.toMatchObject({ stopped: 'exchange' })
   // The declaration cannot be undone: without the explicit go the runner stops in front of it.
   const waiting = await seeded([entry, avance2([]), avance5, avance6([], () => AT_SAMPLES)], beyond)
@@ -270,7 +289,7 @@ test('the simulation: a refused declaration, a rejected wait, a confirmed one sk
     simulated,
   )
   await expect(runCertification(rejected.deps)).resolves.toMatchObject({ stopped: 'rejected', detail: 'RECHAZADO' })
-  const confirmed = await seeded([entry, avance2([]), avance5, avance6([], () => AT_EXCHANGE)], {
+  const confirmed = await seeded(exchangeRoutes({ facade: { validarUsuario: { body: NOT_IN_EXCHANGE } } }), {
     ...simulated,
     simulation: { ...simulated.simulation!, confirmed: true },
   })
@@ -353,3 +372,74 @@ test('a refusal without a sentence stops with the outcome itself; a run already
   expect(finished.stopped).toBe('done')
   expect(finished.state.blocked).toBeUndefined()
 })
+
+test('the exchange answered and confirmed, then the samples: none stops the run, a list or a function submits them, a block or a rejection stops', async () => {
+  const confirmedSimulation = stateWith({
+    plan,
+    sets: allSets,
+    stage: 'exchange',
+    simulation: { trackId: '777', date: TODAY, sentAt: 'x', confirmed: true },
+  })
+  const review = (first: string, second: string) => ({
+    leeImpreso: (call: number) => ({ body: call === 1 ? first : second }),
+    creaLista: { body: CREATED_REVIEW },
+  })
+  const none = await seeded(exchangeRoutes(), confirmedSimulation)
+  const atSamples = await runCertification(none.deps)
+  expect(atSamples).toMatchObject({
+    stopped: 'printedSamples',
+    state: { stage: 'printedSamples', exchange: { confirmed: true, documents: 2 } },
+  })
+  expect(none.steps().slice(-1)).toEqual(['INTERCAMBIO_DONE'])
+  const pdf = { fileName: 'muestra_33_1.pdf', bytes: new Uint8Array([0x25]) }
+  const listed = await seeded(
+    samplesRoutes({ service: review(EMPTY_OK, reviewAnswer('ENVIADO AL SII')) }),
+    atSamples.state,
+  )
+  await expect(runCertification(listed.deps, { samples: [pdf] })).resolves.toMatchObject({
+    stopped: 'compliance',
+    state: { stage: 'compliance', samples: { state: 'ENVIADO AL SII', uploaded: ['muestra_33_1.pdf'] } },
+  })
+  const byFunction = await seeded(
+    samplesRoutes({ service: review(reviewAnswer('INGRESO'), reviewAnswer('POR REVISAR')) }),
+    atSamples.state,
+  )
+  await expect(
+    runCertification(byFunction.deps, { samples: async () => [pdf], until: 'printedSamples' }),
+  ).resolves.toMatchObject({ stopped: 'until', state: { stage: 'compliance' } })
+  const blocked = await seeded(samplesRoutes({ service: { leeImpreso: { body: SAMPLES_BLOCKED } } }), atSamples.state)
+  await expect(runCertification(blocked.deps, { samples: [pdf] })).resolves.toMatchObject({
+    stopped: 'blocked',
+    detail: expect.stringContaining('DOCUMENTOS IMPRESOS'),
+  })
+  const rejected = await seeded(
+    samplesRoutes({
+      service: {
+        ...review(reviewAnswer('RECHAZADO'), reviewAnswer('RECHAZADO')),
+        muestraMail: { body: detailAnswer([]) },
+      },
+    }),
+    atSamples.state,
+  )
+  await expect(runCertification(rejected.deps, { samples: [pdf] })).resolves.toMatchObject({
+    stopped: 'rejected',
+    detail: expect.stringContaining('rejected the printed samples'),
+  })
+  // The set given by hand skips the download; a set that cannot be downloaded names the artefact to fill.
+  const given = await seeded(exchangeRoutes({ download: new Error('never') }), confirmedSimulation)
+  await expect(
+    runCertification(given.deps, { exchangeSetXml: exchangeSetXml(), until: 'exchange' }),
+  ).resolves.toMatchObject({ stopped: 'until', state: { stage: 'printedSamples' } })
+  const unavailable = await seeded(exchangeRoutes({ download: { body: '<html>ERROR</html>' } }), confirmedSimulation)
+  await expect(runCertification(unavailable.deps)).resolves.toMatchObject({
+    stopped: 'exchange',
+    detail: 'intercambio/set-intercambio.xml',
+  })
+  // An exchange confirmed in a state still at the exchange moves on without the portal.
+  const edited = await seeded([], { ...confirmedSimulation, exchange: atSamples.state.exchange })
+  await expect(runCertification(edited.deps)).resolves.toMatchObject({
+    stopped: 'printedSamples',
+    state: { stage: 'printedSamples' },
+  })
+  expect(edited.urls()).toEqual([])
+})
```

`tests/pdf/node-samples.test.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/pdf/node-samples.test.ts b/tests/pdf/node-samples.test.ts
index afb3608..0f9db6f 100644
--- a/tests/pdf/node-samples.test.ts
+++ b/tests/pdf/node-samples.test.ts
@@ -1,7 +1,7 @@
 import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
 import { join } from 'node:path'
 import { PNG } from 'pngjs'
-import { findEnvelopeFiles, samplePath, writePrintedSamples } from '../../src/pdf/node-samples'
+import { findEnvelopeFiles, readPrintedSamples, samplePath, writePrintedSamples } from '../../src/pdf/node-samples'
 import { loadNodeFs, type NodeFsModules } from '../../src/sii/node-fs'
 import { FIXED_NOW } from '../support/fixtures'
 import { pdfImages } from '../support/pdf'
@@ -178,3 +178,48 @@ describe('samplePath', () => {
     }
   })
 })
+
+describe('readPrintedSamples', () => {
+  const samplesDir = async (): Promise<string> => {
+    const dir = await dirs.make('dte-sdk-read-samples-')
+    await mkdir(join(dir, 'SET-SIMULACION'), { recursive: true })
+    await mkdir(join(dir, 'SET-PRUEBAS', 'nested'), { recursive: true })
+    await writeFile(join(dir, 'SET-SIMULACION', 'muestra_61_2.pdf'), '%PDF-sim')
+    await writeFile(join(dir, 'SET-PRUEBAS', 'muestra_33_1.pdf'), '%PDF-test')
+    await writeFile(join(dir, 'SET-PRUEBAS', 'nested', 'muestra_33_9.pdf'), '%PDF-nested')
+    await writeFile(join(dir, 'SET-PRUEBAS', 'OTRA.PDF'), 'upper')
+    await writeFile(join(dir, 'SET-PRUEBAS', 'notes.txt'), 'text')
+    await writeFile(join(dir, 'aaa.pdf'), '%PDF-root')
+    return dir
+  }
+
+  test('every .pdf under the directory, in name order at each level, the test set folder before the simulation', async () => {
+    const dir = await samplesDir()
+    const samples = await readPrintedSamples(dir)
+    expect(samples.map((sample) => [sample.fileName, new TextDecoder().decode(sample.bytes)])).toEqual([
+      ['aaa.pdf', '%PDF-root'],
+      ['muestra_33_1.pdf', '%PDF-test'],
+      ['muestra_33_9.pdf', '%PDF-nested'],
+      ['muestra_61_2.pdf', '%PDF-sim'],
+    ])
+  })
+
+  test('no PDF, or no directory, is a missing field naming the directory', async () => {
+    const empty = await dirs.make('dte-sdk-no-samples-')
+    const none = await failure(readPrintedSamples(empty))
+    expect(none.code).toBe('MISSING_FIELD')
+    expect(none.details).toEqual({ field: 'samples', dir: empty })
+    expect((await failure(readPrintedSamples(join(empty, 'missing')))).code).toBe('MISSING_FIELD')
+  })
+
+  test('an error other than a missing directory propagates, and without node:fs it says so', async () => {
+    const dir = await samplesDir()
+    const denied = withFs({
+      readdir: (async () => {
+        throw Object.assign(new Error('denied'), { code: 'EACCES' })
+      }) as unknown as NodeFsModules['fs']['readdir'],
+    })
+    await expect(readPrintedSamples(dir, denied)).rejects.toThrow('denied')
+    expect((await failure(readPrintedSamples(dir, failingLoad))).code).toBe('TRANSPORT_UNAVAILABLE')
+  })
+})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/certification/steps-exchange tests/certification/steps-samples tests/certification/runner tests/pdf/node-samples --coverage=false
```

Expected: FAIL: `Cannot find module '../../src/certification/exchange-step'` and `'../../src/certification/samples-step'`; `readPrintedSamples` is not exported by `src/pdf/node-samples.ts`; the runner test does not compile (`samples` and `exchangeSetXml` are not options).

- [ ] **Step 3: Write the implementation**

`src/certification/exchange-step.ts` (new file, whole):

```ts
import { EXCHANGE_ANSWER_KEYS } from '../catalogs/certification'
import { isDteError } from '../errors'
import { confirmExchange, downloadExchangeSet, uploadExchangeAnswers, validateExchangeUser } from '../portal/exchange'
import { createExchangeAnswers } from './exchange'
import { runtime, saveState, type CertificationDependencies, type Runtime, type StepResult } from './runtime'
import type { CertificationState, ExchangeState } from './state'
import { laterStage } from './steps'

const DIRECTORY = 'intercambio'
/** EN: The artefact that holds the exchange set; the caller fills it by hand when the download fails. ES: El artefacto que guarda el set de intercambio; el llamador lo llena a mano cuando falla la descarga. */
export const EXCHANGE_SET_ARTEFACT = `${DIRECTORY}/set-intercambio.xml`
const COMPLETED_STATE = 'P90'

/**
 * EN: Input of `runExchange`.
 * ES: Entrada de `runExchange`.
 */
export type RunExchangeInput = {
  /** EN: The exchange set, when the caller has it (downloaded by hand from the portal). ES: El set de intercambio, cuando el llamador lo tiene (descargado a mano del portal). */
  readonly setXml?: string
}

/**
 * EN: How `runExchange` ended: `done` with the answers uploaded and confirmed; `alreadyDone` when the state or the
 * portal says the exchange was completed; `setUnavailable` when the set could not be downloaded (the artefact named
 * in the detail must be filled by hand); `notInExchange` when the portal says the company is not in the stage.
 * ES: Cómo terminó `runExchange`: `done` con las respuestas subidas y confirmadas; `alreadyDone` cuando el estado o
 * el portal dicen que el intercambio ya se completó; `setUnavailable` cuando el set no se pudo descargar (el artefacto
 * que nombra el detalle debe llenarse a mano); `notInExchange` cuando el portal dice que la empresa no está en la etapa.
 */
export type ExchangeOutcome = 'done' | 'alreadyDone' | 'setUnavailable' | 'notInExchange'

const artefact = (name: string): string => `${DIRECTORY}/${name}`

const obtainSet = async (rt: Runtime, companyRut: string, given: string | undefined): Promise<string | null> => {
  if (given !== undefined) {
    await rt.store.writeArtefact(EXCHANGE_SET_ARTEFACT, given)
    return given
  }
  const kept = await rt.store.readArtefact(EXCHANGE_SET_ARTEFACT)
  if (kept !== null) return kept
  try {
    const { xml } = await downloadExchangeSet(rt.portal, { companyRut })
    await rt.store.writeArtefact(artefact('pfe-download.html'), xml)
    await rt.store.writeArtefact(EXCHANGE_SET_ARTEFACT, xml)
    return xml
  } catch (error) {
    if (!isDteError(error) || error.code !== 'SII_PORTAL_UNEXPECTED_PAGE') throw error
    // `downloadExchangeSet` always puts the page in its details.
    await rt.store.writeArtefact(artefact('pfe-download-error.html'), String(error.details['page']))
    return null
  }
}

/**
 * EN: The exchange stage: the set (given, kept from an earlier run, or downloaded), the three answers generated and
 * kept as artefacts, the user validated on the portal, the answers uploaded and the exchange confirmed, which moves
 * the application to the printed samples. The answers are generated and uploaded again on every run that reaches the
 * portal; only the set is kept. Every portal answer is kept under `intercambio/`.
 * ES: La etapa de intercambio: el set (dado, guardado de una corrida anterior, o descargado), las tres respuestas
 * generadas y guardadas como artefactos, el usuario validado en el portal, las respuestas subidas y el intercambio
 * confirmado, que mueve la postulación a las muestras impresas. Las respuestas se generan y suben de nuevo en cada
 * corrida que llega al portal; solo el set se guarda. Cada respuesta del portal queda bajo `intercambio/`.
 * @param deps EN: the dependencies; `contact` names the answers' contact. ES: las dependencias; `contact` nombra el contacto de las respuestas.
 * @param state EN: the current state. ES: el estado actual.
 * @param input EN: the set, when the caller has it. ES: el set, si el llamador lo tiene.
 * @throws {DteError} EN: the codes of `createExchangeAnswers` and of the exchange operations. ES: los códigos de `createExchangeAnswers` y de las operaciones del intercambio.
 */
export const runExchange = async (
  deps: CertificationDependencies,
  state: CertificationState,
  input: RunExchangeInput = {},
): Promise<StepResult<ExchangeOutcome>> => {
  const rt = runtime(deps)
  if (state.exchange?.confirmed === true) return { state, outcome: 'alreadyDone', detail: 'confirmed' }
  rt.emit({ step: 'INTERCAMBIO_START' })
  const setXml = await obtainSet(rt, state.companyRut, input.setXml)
  if (setXml === null) return { state, outcome: 'setUnavailable', detail: EXCHANGE_SET_ARTEFACT }
  rt.emit({ step: 'INTERCAMBIO_DESCARGADO' })
  const answers = createExchangeAnswers(setXml, {
    companyRut: state.companyRut,
    certificate: rt.certificate,
    ...(rt.contact === undefined ? {} : { contact: rt.contact }),
    now: rt.now(),
  })
  for (const key of EXCHANGE_ANSWER_KEYS)
    await rt.store.writeArtefact(artefact(answers[key].fileName), answers[key].xml)
  const exchange: ExchangeState = {
    setId: answers.set.setId,
    issuerRut: answers.set.issuerRut,
    documents: answers.set.documents.length,
    generatedAt: rt.now().toISOString(),
    uploaded: false,
    confirmed: false,
  }
  const validation = await validateExchangeUser(rt.portal, { companyRut: state.companyRut })
  await rt.store.writeArtefact(artefact('pfe-validar.html'), validation.body)
  if (!validation.inExchange) {
    // The company is out of the exchange only when the portal's sentence said so: the message is there.
    const message = validation.message!
    const portalState = validation.state === null ? {} : { portalState: validation.state }
    if (validation.completed) {
      const next = await saveState(rt, state, {
        exchange: { ...exchange, portalState: COMPLETED_STATE },
        stage: laterStage(state.stage, 'printedSamples'),
      })
      return { state: next, outcome: 'alreadyDone', detail: message }
    }
    const next = await saveState(rt, state, { exchange: { ...exchange, ...portalState } })
    return { state: next, outcome: 'notInExchange', detail: message }
  }
  const uploaded = await uploadExchangeAnswers(rt.portal, {
    companyRut: state.companyRut,
    reception: answers.reception.xml,
    receipts: answers.receipts.xml,
    approval: answers.approval.xml,
  })
  for (const [index, answer] of uploaded.answers.entries())
    await rt.store.writeArtefact(artefact(`pfe-upload-${index + 1}.html`), answer.body)
  const sent = await saveState(rt, state, { exchange: { ...exchange, uploaded: true } })
  const confirmation = await confirmExchange(rt.portal, { companyRut: state.companyRut, gwt: validation.hashes })
  await rt.store.writeArtefact(artefact('pfe-validarset.html'), confirmation.validation)
  for (const { id, body } of confirmation.confirmations)
    await rt.store.writeArtefact(artefact(`pfe-seguimiento-${id}.html`), body)
  const next = await saveState(rt, sent, {
    exchange: { ...exchange, uploaded: true, confirmed: true },
    stage: laterStage(sent.stage, 'printedSamples'),
  })
  rt.emit({ step: 'INTERCAMBIO_DONE', uploaded: true })
  return { state: next, outcome: 'done' }
}
```

`src/certification/samples-step.ts` (new file, whole):

```ts
import { DteError } from '../errors'
import type { PrintedSampleFile } from '../pdf/samples'
import { summarizeSampleDetails } from '../portal/pages/samples'
import {
  createSamplesReview,
  readSamplesDetail,
  readSamplesReview,
  submitSamplesReview,
  uploadSample,
  type SamplesReview,
} from '../portal/samples'
import { runtime, saveState, type CertificationDependencies, type Runtime, type StepResult } from './runtime'
import type { CertificationState, SamplesState } from './state'
import { laterStage } from './steps'

const DIRECTORY = 'muestras'
const REJECTED = 'RECHAZADO'
const RESUMABLE = 'INGRESO'
const CREATABLE: readonly string[] = ['RECHAZADO', 'APROBADO']
const NO_DETAIL = 'The SII rejected the printed samples; the detail is in the portal.'

/**
 * EN: Input of `uploadPrintedSamples`.
 * ES: Entrada de `uploadPrintedSamples`.
 */
export type UploadPrintedSamplesInput = {
  /** EN: The PDFs to upload, in order; `readPrintedSamples` reads them from a directory. ES: Los PDF a subir, en orden; `readPrintedSamples` los lee de un directorio. */
  readonly samples: readonly PrintedSampleFile[]
}

/**
 * EN: How `uploadPrintedSamples` ended: `submitted` with the review sent to the SII; `alreadySubmitted` when a review
 * was already sent (its state in the detail); `blocked` when the portal says the application is not in the stage;
 * `rejected` when the SII rejected the review at once (the summary in the detail).
 * ES: Cómo terminó `uploadPrintedSamples`: `submitted` con la revisión enviada al SII; `alreadySubmitted` cuando ya
 * se había enviado una revisión (su estado en el detalle); `blocked` cuando el portal dice que la postulación no está
 * en la etapa; `rejected` cuando el SII rechazó la revisión de inmediato (el resumen en el detalle).
 */
export type SamplesOutcome = 'submitted' | 'alreadySubmitted' | 'blocked' | 'rejected'

const artefact = (name: string): string => `${DIRECTORY}/${name}`

const samplesOf = (review: SamplesReview, uploaded: readonly string[]): SamplesState => ({
  revisionId: review.revisionId,
  revisionToken: review.revisionToken,
  state: review.state,
  uploaded,
  ...(review.sentAt === null ? {} : { submittedAt: review.sentAt }),
})

const finish = <Outcome extends SamplesOutcome>(
  rt: Runtime,
  state: CertificationState,
  outcome: Outcome,
  success: boolean,
  detail: string,
): StepResult<Outcome> => {
  rt.emit({ step: 'MUESTRAS_DONE', success })
  return { state, outcome, detail }
}

/**
 * EN: The printed samples stage: the review read (a block or a review already sent end here; none yet is created), resumed when it stands
 * in `INGRESO` with a readable id or created otherwise, every PDF uploaded in order (each name saved as it goes), the
 * review submitted, and its state read again: `RECHAZADO` brings the detail and its summary. Every portal answer is
 * kept under `muestras/`.
 * ES: La etapa de muestras impresas: la revisión leída (un bloqueo o una revisión ya enviada terminan aquí), retomada
 * cuando está en `INGRESO` con un id legible o creada si no, cada PDF subido en orden (cada nombre guardado sobre la
 * marcha), la revisión enviada, y su estado leído de nuevo: `RECHAZADO` trae el detalle y su resumen. Cada respuesta
 * del portal queda bajo `muestras/`.
 * @param deps EN: the dependencies. ES: las dependencias.
 * @param state EN: the current state. ES: el estado actual.
 * @param input EN: the PDFs. ES: los PDF.
 * @throws {DteError} EN: `MISSING_FIELD { field: 'samples' }` without PDFs; the codes of the samples operations. ES: `MISSING_FIELD { field: 'samples' }` sin PDF; los códigos de las operaciones de muestras.
 */
export const uploadPrintedSamples = async (
  deps: CertificationDependencies,
  state: CertificationState,
  input: UploadPrintedSamplesInput,
): Promise<StepResult<SamplesOutcome>> => {
  const rt = runtime(deps)
  if (input.samples.length === 0) throw new DteError('MISSING_FIELD', { field: 'samples' })
  rt.emit({ step: 'MUESTRAS_UPLOADING', count: input.samples.length })
  const companyRut = state.companyRut
  const review = await readSamplesReview(rt.portal, { companyRut })
  await rt.store.writeArtefact(artefact('pdfte-lee-impreso.html'), review.body)
  if (review.blocked !== null) {
    const next = await saveState(rt, state, { samples: samplesOf(review, []) })
    return finish(rt, next, 'blocked', false, review.blocked)
  }
  // No state is no review yet: the first one is created. Only `INGRESO` resumes; `RECHAZADO` and `APROBADO` allow a new one.
  if (review.state !== null && review.state !== RESUMABLE && !CREATABLE.includes(review.state)) {
    const next = await saveState(rt, state, {
      samples: samplesOf(review, state.samples?.uploaded ?? []),
      stage: laterStage(state.stage, 'compliance'),
    })
    return finish(rt, next, 'alreadySubmitted', true, review.state)
  }
  const gwt = review.hashes
  const resumed = review.state === RESUMABLE && review.revisionId !== null && review.revisionToken !== null
  const created = resumed ? null : await createSamplesReview(rt.portal, { companyRut, gwt })
  if (created !== null) await rt.store.writeArtefact(artefact('pdfte-crea-lista.html'), created.body)
  // A resumed review has both its id and its token: that is what `resumed` checks.
  const target =
    created === null
      ? { revisionId: review.revisionId!, revisionToken: review.revisionToken! }
      : { revisionId: created.revisionId, revisionToken: created.revisionToken }
  const opened: SamplesState = { ...samplesOf(review, []), ...target, state: review.state }
  const current = { state: await saveState(rt, state, { samples: opened }), uploaded: [] as readonly string[] }
  for (const [index, sample] of input.samples.entries()) {
    const result = await uploadSample(rt.portal, { revisionId: target.revisionId, ...sample, gwt })
    await rt.store.writeArtefact(artefact(`upload-${index + 1}.html`), result.body)
    current.uploaded = [...current.uploaded, sample.fileName]
    current.state = await saveState(rt, current.state, { samples: { ...opened, uploaded: current.uploaded } })
  }
  const submitted = await submitSamplesReview(rt.portal, { revisionToken: target.revisionToken, gwt })
  await rt.store.writeArtefact(artefact('pdfte-enviar-sii.html'), submitted.body)
  const after = await readSamplesReview(rt.portal, { companyRut, gwt })
  await rt.store.writeArtefact(artefact('pdfte-estado-post-envio.html'), after.body)
  const sent: SamplesState = { ...opened, uploaded: current.uploaded, submittedAt: rt.now().toISOString() }
  if (after.state === REJECTED) {
    const detail = await readSamplesDetail(rt.portal, { revisionToken: target.revisionToken, gwt })
    if (detail.body !== '') await rt.store.writeArtefact(artefact('pdfte-detalle-revision.html'), detail.body)
    const summary = detail.rows.length === 0 ? NO_DETAIL : summarizeSampleDetails(detail.rows)
    const next = await saveState(rt, current.state, {
      samples: { ...sent, state: REJECTED, detail: detail.rows, summary },
    })
    return finish(rt, next, 'rejected', false, summary)
  }
  const next = await saveState(rt, current.state, {
    samples: { ...sent, state: after.state },
    stage: laterStage(current.state.stage, 'compliance'),
  })
  return finish(rt, next, 'submitted', true, after.state ?? 'submitted')
}
```

`src/catalogs/certification.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/catalogs/certification.ts b/src/catalogs/certification.ts
index 69dd1c4..d2f8145 100644
--- a/src/catalogs/certification.ts
+++ b/src/catalogs/certification.ts
@@ -189,6 +189,11 @@ export const CERTIFICATION_STEPS = [
   'SIM_OK',
   'SIM_DECLARING',
   'SIM_DONE',
+  'INTERCAMBIO_START',
+  'INTERCAMBIO_DESCARGADO',
+  'INTERCAMBIO_DONE',
+  'MUESTRAS_UPLOADING',
+  'MUESTRAS_DONE',
   'CERT_DONE',
   'CERT_ERROR',
 ] as const
```

`src/certification/runtime.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/certification/runtime.ts b/src/certification/runtime.ts
index 2215e16..bd72b12 100644
--- a/src/certification/runtime.ts
+++ b/src/certification/runtime.ts
@@ -4,6 +4,7 @@ import type { FolioRegistry } from '../folios/registry'
 import type { IssuerInput, ReceiverInput } from '../model/document'
 import type { PortalClient } from '../portal/client'
 import type { SiiClient } from '../sii/client'
+import type { ExchangeContact } from './exchange'
 import type { CertificationState, CertificationStore } from './state'
 
 /**
@@ -30,6 +31,8 @@ export type CertificationDependencies = {
   readonly sleep?: (ms: number) => Promise<void>
   /** EN: Progress events. ES: Eventos de progreso. */
   readonly onProgress?: (event: CertificationProgressEvent) => void
+  /** EN: The contact the exchange answers name, when any. ES: `NmbContacto`, `MailContacto`, `FonoContacto` — El contacto que nombran las respuestas del intercambio, si hay. */
+  readonly contact?: ExchangeContact
 }
 
 /**
@@ -65,6 +68,11 @@ export type CertificationProgressEvent =
   | { readonly step: 'SIM_OK'; readonly trackId: string }
   | { readonly step: 'SIM_DECLARING' }
   | { readonly step: 'SIM_DONE' }
+  | { readonly step: 'INTERCAMBIO_START' }
+  | { readonly step: 'INTERCAMBIO_DESCARGADO' }
+  | { readonly step: 'INTERCAMBIO_DONE'; readonly uploaded: boolean }
+  | { readonly step: 'MUESTRAS_UPLOADING'; readonly count: number }
+  | { readonly step: 'MUESTRAS_DONE'; readonly success: boolean }
   | { readonly step: 'CERT_DONE' }
   | { readonly step: 'CERT_ERROR'; readonly error: string }
```

`src/certification/state.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/certification/state.ts b/src/certification/state.ts
index 81ad38a..4f6dbc3 100644
--- a/src/certification/state.ts
+++ b/src/certification/state.ts
@@ -2,6 +2,7 @@ import type { BookKey, CertificationStage, SetKey } from '../catalogs/certificat
 import { DteError } from '../errors'
 import type { BookTotals } from '../model/book'
 import type { DeclarationOutcome } from '../portal/certification'
+import type { SampleDetail } from '../portal/pages/samples'
 import type { CertificationPlan } from './set-plan'
 
 /**
@@ -98,6 +99,48 @@ export type EnvelopeDiagnosis = {
   readonly message: string
 }
 
+/**
+ * EN: The exchange stage: the set answered and how far the answers got.
+ * ES: La etapa de intercambio: el set respondido y hasta dónde llegaron las respuestas.
+ */
+export type ExchangeState = {
+  /** EN: The set id answered. ES: `EnvioDTEID` — El id del set respondido. */
+  readonly setId: string
+  /** EN: The set's issuer. ES: `RutRecibe` — El emisor del set. */
+  readonly issuerRut: string
+  /** EN: How many documents the set held. ES: Cuántos documentos traía el set. */
+  readonly documents: number
+  /** EN: When the answers were generated, ISO. ES: Cuándo se generaron las respuestas, ISO. */
+  readonly generatedAt: string
+  /** EN: The three answers were uploaded. ES: Las tres respuestas se subieron. */
+  readonly uploaded: boolean
+  /** EN: The three confirmations were accepted. ES: Las tres confirmaciones se aceptaron. */
+  readonly confirmed: boolean
+  /** EN: The state the user validation reported when the company was not in the exchange. ES: El estado que informó la validación del usuario cuando la empresa no estaba en el intercambio. */
+  readonly portalState?: string
+}
+
+/**
+ * EN: The printed samples stage: the review and what was uploaded to it.
+ * ES: La etapa de muestras impresas: la revisión y lo que se subió a ella.
+ */
+export type SamplesState = {
+  /** EN: The review id, or null. ES: El id de la revisión, o null. */
+  readonly revisionId: number | null
+  /** EN: The review's token, or null. ES: El token de la revisión, o null. */
+  readonly revisionToken: string | null
+  /** EN: The review state last read, or null when the portal named none. ES: El último estado leído de la revisión, o null si el portal no nombró ninguno. */
+  readonly state: string | null
+  /** EN: The file names uploaded in this run, in order. ES: Los nombres de archivo subidos en esta corrida, en orden. */
+  readonly uploaded: readonly string[]
+  /** EN: When the review was submitted, when it was. ES: Cuándo se envió la revisión, si se envió. */
+  readonly submittedAt?: string
+  /** EN: How the SII filed each PDF of a rejected review. ES: Cómo clasificó el SII cada PDF de una revisión rechazada. */
+  readonly detail?: readonly SampleDetail[]
+  /** EN: The sentence that sums a rejection up. ES: La frase que resume un rechazo. */
+  readonly summary?: string
+}
+
 /**
  * EN: The whole state of a certification run: what was downloaded, obtained, sent, declared and approved. A plain
  * JSON value the store keeps between runs; the runner resumes from it.
@@ -136,6 +179,10 @@ export type CertificationState = {
   }
   /** EN: SOAP diagnoses by track id. ES: Diagnósticos SOAP por track id. */
   readonly diagnosis?: Readonly<Record<string, EnvelopeDiagnosis>>
+  /** EN: The exchange stage. ES: La etapa de intercambio. */
+  readonly exchange?: ExchangeState
+  /** EN: The printed samples stage. ES: La etapa de muestras impresas. */
+  readonly samples?: SamplesState
   /** EN: The sentence that blocked the compliance declaration. ES: La frase que bloqueó la declaración de cumplimiento. */
   readonly blocked?: string
   /** EN: Where the run stands. ES: Dónde está la corrida. */
```

`src/certification/runner.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/certification/runner.ts b/src/certification/runner.ts
index 40b3f61..9733b01 100644
--- a/src/certification/runner.ts
+++ b/src/certification/runner.ts
@@ -1,8 +1,10 @@
 import { SET_KEYS, type CertificationStage } from '../catalogs/certification'
 import { errorMessage } from '../errors'
-import { readProgress } from '../portal/certification'
+import type { PrintedSampleFile } from '../pdf/samples'
 import { runBooks } from './books-step'
+import { runExchange } from './exchange-step'
 import { prepareFolios } from './folios-step'
+import { uploadPrintedSamples } from './samples-step'
 import { runtime, saveState, type CertificationDependencies } from './runtime'
 import { createCertificationState, type CertificationState } from './state'
 import {
@@ -28,17 +30,32 @@ export type RunCertificationOptions = {
   readonly optionalSets?: readonly string[]
   /** EN: Make the declaration of compliance, the sworn statement of the legal representative, which cannot be undone. Off by default: the runner stops at `compliance` instead. ES: Hacer la declaración de cumplimiento, la declaración jurada del representante legal, que no se puede deshacer. Apagado por defecto: el ejecutor se detiene en `compliance`. */
   readonly declareCompliance?: boolean
+  /** EN: The exchange set, when it was downloaded by hand from the portal. ES: El set de intercambio, cuando se descargó a mano del portal. */
+  readonly exchangeSetXml?: string
+  /** EN: The printed samples to upload, or a function that reads them (`readPrintedSamples`); without them the runner stops at `printedSamples`. ES: Las muestras impresas a subir, o una función que las lee (`readPrintedSamples`); sin ellas el ejecutor se detiene en `printedSamples`. */
+  readonly samples?: readonly PrintedSampleFile[] | (() => Promise<readonly PrintedSampleFile[]>)
 }
 
 /**
- * EN: Why the runner stopped. `done` is the declaration of compliance made; `exchange` is where phase 5c takes over;
- * `compliance` is the declaration waiting for `declareCompliance: true`; `until` is the stage asked for; the rest name
- * what the SII or the portal refused, left incomplete or never answered.
- * ES: Por qué se detuvo el ejecutor. `done` es la declaración de cumplimiento hecha; `exchange` es donde toma la fase
- * 5c; `compliance` es la declaración a la espera de `declareCompliance: true`; `until` es la etapa pedida; el resto
- * nombra lo que el SII o el portal rechazó, dejó incompleto o nunca respondió.
+ * EN: Why the runner stopped. `done` is the declaration of compliance made; `exchange` is the set unavailable or the
+ * company not in the exchange (the detail says which); `printedSamples` is the samples waiting for the `samples`
+ * option; `compliance` is the declaration waiting for `declareCompliance: true`; `until` is the stage asked for; the
+ * rest name what the SII or the portal refused, left incomplete or never answered.
+ * ES: Por qué se detuvo el ejecutor. `done` es la declaración de cumplimiento hecha; `exchange` es el set no disponible
+ * o la empresa fuera del intercambio (el detalle dice cuál); `printedSamples` son las muestras a la espera de la
+ * opción `samples`; `compliance` es la declaración a la espera de `declareCompliance: true`; `until` es la etapa
+ * pedida; el resto nombra lo que el SII o el portal rechazó, dejó incompleto o nunca respondió.
  */
-export type RunStop = 'done' | 'exchange' | 'compliance' | 'until' | 'blocked' | 'rejected' | 'timedOut' | 'incomplete'
+export type RunStop =
+  | 'done'
+  | 'exchange'
+  | 'printedSamples'
+  | 'compliance'
+  | 'until'
+  | 'blocked'
+  | 'rejected'
+  | 'timedOut'
+  | 'incomplete'
 
 /**
  * EN: What `runCertification` returns.
@@ -69,18 +86,22 @@ const past = (stage: CertificationStage, other: CertificationStage): boolean =>
 /**
  * EN: The HTML side of the certification, in the field's order, resumed from the saved state: the test set (downloaded
  * once), the folios, each set not yet sent, their declaration and approval; the books; the advance; the simulation
- * sent, declared and confirmed; then it stops at the exchange for phase 5c, and once the portal stands past the
- * exchange it declares compliance, only with `declareCompliance: true`, because that declaration cannot be undone.
- * Nothing is repeated: a set with a track id is not sent again, a book approved is skipped. A refusal, a block or a time-out comes back as data with the state saved; a `DteError` of the portal, of
- * the SII or of the folios propagates after the state is saved, with a `CERT_ERROR` event.
+ * sent, declared and confirmed; the exchange set answered, uploaded and confirmed; the printed samples uploaded and
+ * submitted when the `samples` option gives them (else it stops there); and then it declares compliance, only with
+ * `declareCompliance: true`, because that declaration cannot be undone. Nothing is repeated: a set with a track id is
+ * not sent again, a book approved is skipped, a confirmed exchange is not answered again. A refusal, a block or a
+ * time-out comes back as data with the state saved; a `DteError` of the portal, of the SII or of the folios propagates
+ * after the state is saved, with a `CERT_ERROR` event.
  * ES: El lado HTML de la certificación, en el orden del campo, retomado desde el estado guardado: el set de pruebas
  * (descargado una vez), los folios, cada set aún no enviado, su declaración y aprobación; los libros; el avance; la
- * simulación enviada, declarada y confirmada; luego se detiene en el intercambio para la fase 5c, y cuando el portal
- * ya pasó el intercambio declara cumplimiento, solo con `declareCompliance: true`, porque esa declaración no se puede
- * deshacer. Nada se repite: un set con track id no se vuelve a enviar, un libro aprobado se omite. Un rechazo, un bloqueo o un timeout vuelven como datos con el estado guardado; un `DteError` del
- * portal, del SII o de los folios se propaga después de guardar el estado, con un evento `CERT_ERROR`.
+ * simulación enviada, declarada y confirmada; el set de intercambio respondido, subido y confirmado; las muestras
+ * impresas subidas y enviadas cuando la opción `samples` las da (si no, se detiene ahí); y luego declara cumplimiento,
+ * solo con `declareCompliance: true`, porque esa declaración no se puede deshacer. Nada se repite: un set con track id
+ * no se vuelve a enviar, un libro aprobado se omite, un intercambio confirmado no se responde de nuevo. Un rechazo, un
+ * bloqueo o un timeout vuelven como datos con el estado guardado; un `DteError` del portal, del SII o de los folios se
+ * propaga después de guardar el estado, con un evento `CERT_ERROR`.
  * @param deps EN: the dependencies. ES: las dependencias.
- * @param options EN: where to stop and which optional sets. ES: dónde detenerse y qué sets opcionales.
+ * @param options EN: where to stop, which optional sets, the exchange set and the samples. ES: dónde detenerse, qué sets opcionales, el set de intercambio y las muestras.
  * @returns EN: the state and why it stopped. ES: el estado y por qué se detuvo.
  * @throws {DteError} EN: the codes of every step. ES: los códigos de cada paso.
  */
@@ -145,10 +166,26 @@ export const runCertification = async (
       if (state.stage === 'simulation') state = await saveState(rt, state, { stage: 'exchange' })
     }
     if (reachedUntil()) return stop('until')
-    if (state.stage === 'exchange' || state.stage === 'printedSamples') {
-      const report = await readProgress(rt.portal)
-      if (!past(report.stageKey, 'exchange')) return stop('exchange')
-      state = await saveState(rt, state, { stage: 'compliance' })
+    if (state.stage === 'exchange') {
+      const exchange = await runExchange(
+        deps,
+        state,
+        options.exchangeSetXml === undefined ? {} : { setXml: options.exchangeSetXml },
+      )
+      state = exchange.state
+      if (exchange.outcome === 'setUnavailable' || exchange.outcome === 'notInExchange')
+        return stop('exchange', exchange.detail)
+      if (state.stage === 'exchange') state = await saveState(rt, state, { stage: 'printedSamples' })
+    }
+    if (reachedUntil()) return stop('until')
+    if (state.stage === 'printedSamples') {
+      if (options.samples === undefined) return stop('printedSamples')
+      const samples = typeof options.samples === 'function' ? await options.samples() : options.samples
+      const uploaded = await uploadPrintedSamples(deps, state, { samples })
+      state = uploaded.state
+      if (uploaded.outcome === 'blocked' || uploaded.outcome === 'rejected')
+        return stop(uploaded.outcome, uploaded.detail)
+      // A submitted review, now or earlier, leaves the stage at the compliance.
     }
     if (reachedUntil()) return stop('until')
     if (state.stage === 'compliance') {
```

`src/pdf/samples.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/pdf/samples.ts b/src/pdf/samples.ts
index 5bbe8e6..35bdda4 100644
--- a/src/pdf/samples.ts
+++ b/src/pdf/samples.ts
@@ -53,6 +53,17 @@ export type PrintedSample = {
   readonly bytes: Uint8Array
 }
 
+/**
+ * EN: A sample file as the certification uploads it: its base name and its bytes.
+ * ES: Un archivo de muestra como lo sube la certificación: su nombre base y sus bytes.
+ */
+export type PrintedSampleFile = {
+  /** EN: The file name, `[A-Za-z0-9_.-]+.pdf`. ES: El nombre de archivo, `[A-Za-z0-9_.-]+.pdf`. */
+  readonly fileName: string
+  /** EN: The PDF bytes. ES: Los bytes del PDF. */
+  readonly bytes: Uint8Array
+}
+
 /**
  * EN: One envelope or document that could not be rendered.
  * ES: Un envío o documento que no se pudo generar.
```

`src/pdf/node-samples.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/pdf/node-samples.ts b/src/pdf/node-samples.ts
index b0bce50..6c3ab92 100644
--- a/src/pdf/node-samples.ts
+++ b/src/pdf/node-samples.ts
@@ -5,6 +5,7 @@ import {
   renderPrintedSamples,
   type PrintedSample,
   type PrintedSampleFailure,
+  type PrintedSampleFile,
   type PrintedSamplesResult,
 } from './samples'
 
@@ -210,3 +211,46 @@ export const writePrintedSamples = async (
     simulation: samples.filter((sample) => sample.set === 'simulation').length,
   }
 }
+
+const isPdfFileName = (name: string): boolean => name.endsWith('.pdf')
+
+/**
+ * EN: Every `.pdf` under a directory, recursively, in name order at every level, so the test set's folder
+ * (`SET-PRUEBAS`) comes before the simulation's (`SET-SIMULACION`) as `writePrintedSamples` lays them out; each with
+ * its base name and its bytes, ready for the printed samples step. A directory that does not exist holds none.
+ * ES: Todo `.pdf` bajo un directorio, recursivo, en orden de nombre en cada nivel, así la carpeta del set de pruebas
+ * (`SET-PRUEBAS`) va antes que la de la simulación (`SET-SIMULACION`) como las deja `writePrintedSamples`; cada uno con
+ * su nombre base y sus bytes, listos para el paso de muestras impresas. Un directorio que no existe no tiene ninguno.
+ * @param dir EN: the directory. ES: el directorio.
+ * @param load EN: loader of `node:fs`, for tests. ES: cargador de `node:fs`, para tests.
+ * @throws {DteError} EN: `MISSING_FIELD { field: 'samples', dir }` when there is no PDF; `TRANSPORT_UNAVAILABLE` when `node:fs` cannot be loaded. ES: `MISSING_FIELD { field: 'samples', dir }` si no hay ningún PDF; `TRANSPORT_UNAVAILABLE` si `node:fs` no se puede cargar.
+ */
+export const readPrintedSamples = async (
+  dir: string,
+  load: () => Promise<NodeFsModules> = loadNodeFs,
+): Promise<readonly PrintedSampleFile[]> => {
+  const { fs, path } = await modulesOrThrow(load)
+  type Entry = { readonly name: string; readonly isDirectory: () => boolean }
+  const entriesOf = async (directory: string): Promise<readonly Entry[]> => {
+    try {
+      return (await fs.readdir(directory, { withFileTypes: true })) as readonly Entry[]
+    } catch (error) {
+      if (isMissingFile(error)) return []
+      throw error
+    }
+  }
+  const scan = async (directory: string): Promise<readonly PrintedSampleFile[]> => {
+    const entries = [...(await entriesOf(directory))].sort((a, b) => a.name.localeCompare(b.name))
+    const found: PrintedSampleFile[] = []
+    for (const entry of entries) {
+      const full = path.join(directory, entry.name)
+      if (entry.isDirectory()) found.push(...(await scan(full)))
+      else if (isPdfFileName(entry.name))
+        found.push({ fileName: entry.name, bytes: new Uint8Array(await fs.readFile(full)) })
+    }
+    return found
+  }
+  const samples = await scan(path.resolve(dir))
+  if (samples.length === 0) throw new DteError('MISSING_FIELD', { field: 'samples', dir })
+  return samples
+}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/certification/steps-exchange tests/certification/steps-samples tests/certification/runner tests/pdf/node-samples --coverage=false
```

Expected: PASS, 34 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/certification/exchange-step.ts src/certification/samples-step.ts src/catalogs/certification.ts src/certification/runtime.ts src/certification/state.ts src/certification/runner.ts src/pdf/samples.ts src/pdf/node-samples.ts tests/support/exchange-fixtures.ts tests/certification/steps-exchange.test.ts tests/certification/steps-samples.test.ts tests/certification/runner.test.ts tests/pdf/node-samples.test.ts
```

```bash
git commit -F - <<'MSG'
feat: the exchange and printed samples steps, the runner's two stages and readPrintedSamples

The runner answers the exchange set and uploads the printed samples
given by the samples option, stopping in front of what it lacks: the
set, the company's place in the exchange, or the samples. The state
keeps the exchange and the review; the events follow the field's names.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Task 7: Public API, size limits and documentation

The runtime names and the types on `dte-sdk/portal` and `dte-sdk/pdf` (spec 3.13), the public API lists, the type tests, the dist smoke expectations, the `dte-sdk/portal` limit at 64 kB (D85: measured 62.47 kB, rounded up to the next 2 kB; `dte-sdk/pdf` stays at 10 kB with 8.45 kB measured), the README section, `llms.txt` and the changelog (spec 3.16).

**Files:**

- Modify: `src/portal/index.ts`
- Modify: `src/pdf/index.ts`
- Modify: `.size-limit.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `llms.txt`
- Test (modify): `tests/public-api.test.ts`
- Test (modify): `tests/types.test.ts`
- Test (modify): `tests/dist.smoke.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/public-api.test.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/public-api.test.ts b/tests/public-api.test.ts
index b28abf3..02ef297 100644
--- a/tests/public-api.test.ts
+++ b/tests/public-api.test.ts
@@ -229,6 +229,29 @@ const PORTAL_EXPORTS = [
   'previousPeriod',
   'nextFreePeriod',
   'runCertification',
+  'EXCHANGE_PORTAL',
+  'SAMPLES_PORTAL',
+  'EXCHANGE_ANSWER_FILES',
+  'EXCHANGE_ANSWER_KEYS',
+  'gwtBody',
+  'gwtAnswer',
+  'encodeGwtLong',
+  'decodeGwtLong',
+  'discoverGwtHashes',
+  'downloadExchangeSet',
+  'validateExchangeUser',
+  'uploadExchangeAnswers',
+  'confirmExchange',
+  'readSamplesReview',
+  'createSamplesReview',
+  'uploadSample',
+  'submitSamplesReview',
+  'readSamplesDetail',
+  'createExchangeAnswers',
+  'parseExchangeSet',
+  'runExchange',
+  'EXCHANGE_SET_ARTEFACT',
+  'uploadPrintedSamples',
   'CERTIFICATION_COUNTERPARTY',
   'TEST_SET_ENVELOPE_ID',
   'TEST_SET_KINDS',
@@ -281,6 +304,7 @@ const PDF_EXPORTS = [
   'findEnvelopeFiles',
   'needsTransferableCopy',
   'parsePrintableDocuments',
+  'readPrintedSamples',
   'renderPrintedSample',
   'renderPrintedSamples',
   'renderTedBarcode',
```

`tests/types.test.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/types.test.ts b/tests/types.test.ts
index a8b0f92..691723f 100644
--- a/tests/types.test.ts
+++ b/tests/types.test.ts
@@ -43,6 +43,12 @@ import {
   declareProgress,
   createMemoryCertificationStore,
   createDirectoryCertificationStore,
+  runExchange,
+  uploadPrintedSamples,
+  createExchangeAnswers,
+  gwtBody,
+  gwtAnswer,
+  readSamplesReview,
 } from '../src/portal'
 import {
   parsePrintableDocuments,
@@ -50,6 +56,7 @@ import {
   renderTedBarcode,
   renderPrintedSamples,
   writePrintedSamples,
+  readPrintedSamples,
   needsTransferableCopy,
 } from '../src/pdf'
 import type {
@@ -108,6 +115,14 @@ import type {
   RunCertificationResult,
   BooksOutcome,
   StepResult,
+  ExchangeOutcome,
+  SamplesOutcome,
+  ExchangeAnswers,
+  GwtAnswer,
+  SamplesReview,
+  RunStop,
+  CertificationState,
+  ExchangeState,
   DeclarationResult,
   CertificationStore,
   CertificationProgressEvent,
@@ -118,7 +133,7 @@ import type {
   IssuedSet,
   IssuedSimulation,
 } from '../src/portal'
-import type { PrintableDocument, PrintedSamplesResult, WritePrintedSamplesResult } from '../src/pdf'
+import type { PrintableDocument, PrintedSampleFile, PrintedSamplesResult, WritePrintedSamplesResult } from '../src/pdf'
 
 // Every type the SII web services design names is exported: a missing one fails the import above, and this tuple
 // keeps each import in use.
@@ -228,6 +243,17 @@ const _typecheck = () => {
   expectTypeOf(createMemoryCertificationStore).returns.toEqualTypeOf<CertificationStore>()
   expectTypeOf(createDirectoryCertificationStore).returns.toEqualTypeOf<CertificationStore>()
   expectTypeOf<CertificationProgressEvent['step']>().toEqualTypeOf<CertificationStep>()
+  expectTypeOf(runExchange).returns.resolves.toEqualTypeOf<StepResult<ExchangeOutcome>>()
+  expectTypeOf(uploadPrintedSamples).returns.resolves.toEqualTypeOf<StepResult<SamplesOutcome>>()
+  expectTypeOf(createExchangeAnswers).returns.toEqualTypeOf<ExchangeAnswers>()
+  expectTypeOf(gwtBody).returns.toEqualTypeOf<string>()
+  expectTypeOf(gwtAnswer).returns.toEqualTypeOf<GwtAnswer>()
+  expectTypeOf(readSamplesReview).returns.resolves.toEqualTypeOf<SamplesReview>()
+  expectTypeOf(readPrintedSamples).returns.resolves.toEqualTypeOf<readonly PrintedSampleFile[]>()
+  expectTypeOf<RunStop>().toEqualTypeOf<
+    'done' | 'exchange' | 'printedSamples' | 'compliance' | 'until' | 'blocked' | 'rejected' | 'timedOut' | 'incomplete'
+  >()
+  expectTypeOf<CertificationState['exchange']>().toEqualTypeOf<ExchangeState | undefined>()
 
   // The client is frozen data: its fields cannot be assigned.
   const sii = createSiiClient({} as SiiClientOptions)
```

`tests/dist.smoke.test.ts` (save the diff and run `git apply`):

```diff
diff --git a/tests/dist.smoke.test.ts b/tests/dist.smoke.test.ts
index d60249d..e35da76 100644
--- a/tests/dist.smoke.test.ts
+++ b/tests/dist.smoke.test.ts
@@ -87,8 +87,18 @@ const EXPECTED_FUNCTIONS: Record<string, readonly string[]> = {
     'createMemoryCertificationStore',
     'createDirectoryCertificationStore',
     'runCertification',
+    'gwtBody',
+    'createExchangeAnswers',
+    'runExchange',
+    'uploadPrintedSamples',
+  ],
+  pdf: [
+    'parsePrintableDocuments',
+    'renderPrintedSample',
+    'renderPrintedSamples',
+    'writePrintedSamples',
+    'readPrintedSamples',
   ],
-  pdf: ['parsePrintableDocuments', 'renderPrintedSample', 'renderPrintedSamples', 'writePrintedSamples'],
 }
 const ENTRIES = Object.keys(EXPECTED_FUNCTIONS)
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest --config jest.config.cjs tests/public-api tests/types --coverage=false
```

Expected: FAIL: `dte-sdk/portal exports exactly the documented runtime names` lists the names missing from the entry, and the type test does not compile.

- [ ] **Step 3: Write the implementation**

`src/portal/index.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/portal/index.ts b/src/portal/index.ts
index adfddac..c6bdfe3 100644
--- a/src/portal/index.ts
+++ b/src/portal/index.ts
@@ -198,5 +198,50 @@ export { prepareFolios, setFolioNeeds, simulationFolioNeeds } from '../certifica
 export type { PrepareFoliosOptions, PrepareFoliosResult } from '../certification/folios-step'
 export { runBooks, previousPeriod, nextFreePeriod } from '../certification/books-step'
 export type { BooksOutcome } from '../certification/books-step'
+
+// Phase 5c-1: the exchange and the printed samples (the two GWT portals).
+export { EXCHANGE_PORTAL, SAMPLES_PORTAL, EXCHANGE_ANSWER_FILES, EXCHANGE_ANSWER_KEYS } from '../catalogs/certification'
+export type { GwtPortal, ExchangeAnswerKey } from '../catalogs/certification'
+export { gwtBody, gwtAnswer, encodeGwtLong, decodeGwtLong, discoverGwtHashes } from './gwt'
+export type { GwtCall, GwtParameter, GwtAnswer, GwtHashes, GwtDiscoveryInput } from './gwt'
+export { downloadExchangeSet, validateExchangeUser, uploadExchangeAnswers, confirmExchange } from './exchange'
+export type {
+  ExchangeCompanyInput,
+  ExchangeGwtInput,
+  ExchangeSetDownload,
+  ExchangeUserValidation,
+  UploadExchangeAnswersInput,
+  ExchangeUploadAnswer,
+  ExchangeUploadResult,
+  ExchangeConfirmationAnswer,
+  ExchangeConfirmation,
+} from './exchange'
+export type { ExchangeUserState } from './pages/exchange'
+export { readSamplesReview, createSamplesReview, uploadSample, submitSamplesReview, readSamplesDetail } from './samples'
+export type {
+  SamplesCompanyInput,
+  SamplesReviewInput,
+  SamplesReview,
+  SamplesReviewCreated,
+  UploadSampleInput,
+  SampleUploaded,
+  SamplesDetail,
+} from './samples'
+export type { ReviewState, SampleDetail } from './pages/samples'
+export { createExchangeAnswers, parseExchangeSet } from '../certification/exchange'
+export type {
+  ExchangeDocument,
+  ExchangeSet,
+  ExchangeContact,
+  CreateExchangeAnswersInput,
+  ExchangeAnswer,
+  ExchangeAnswers,
+} from '../certification/exchange'
+export type { ExchangeState, SamplesState } from '../certification/state'
+export { runExchange, EXCHANGE_SET_ARTEFACT } from '../certification/exchange-step'
+export type { RunExchangeInput, ExchangeOutcome } from '../certification/exchange-step'
+export { uploadPrintedSamples } from '../certification/samples-step'
+export type { UploadPrintedSamplesInput, SamplesOutcome } from '../certification/samples-step'
+export type { PrintedSampleFile } from '../pdf/samples'
 export { runCertification } from '../certification/runner'
 export type { RunCertificationOptions, RunCertificationResult, RunStop } from '../certification/runner'
```

`src/pdf/index.ts` (save the diff and run `git apply`):

```diff
diff --git a/src/pdf/index.ts b/src/pdf/index.ts
index 82453de..0b64845 100644
--- a/src/pdf/index.ts
+++ b/src/pdf/index.ts
@@ -24,9 +24,10 @@ export type {
   PrintedEnvelope,
   PrintedSample,
   PrintedSampleFailure,
+  PrintedSampleFile,
   PrintedSampleSet,
   PrintedSamplesInput,
   PrintedSamplesResult,
 } from './samples'
-export { findEnvelopeFiles, writePrintedSamples } from './node-samples'
+export { findEnvelopeFiles, readPrintedSamples, writePrintedSamples } from './node-samples'
 export type { WritePrintedSamplesInput, WritePrintedSamplesResult, WrittenPrintedSample } from './node-samples'
```

`.size-limit.json` (save the diff and run `git apply`):

```diff
diff --git a/.size-limit.json b/.size-limit.json
index 7521550..76df15b 100644
--- a/.size-limit.json
+++ b/.size-limit.json
@@ -15,7 +15,7 @@
     "name": "dte-sdk/portal (min + brotli)",
     "path": "dist/portal.min.js",
     "ignore": ["node-forge", "@xmldom/xmldom", "fast-xml-parser", "rut.ts", "pdf-lib", "bwip-js", "node:*"],
-    "limit": "56 kB"
+    "limit": "64 kB"
   },
   {
     "name": "dte-sdk/pdf (min + brotli)",
```

`README.md` (save the diff and run `git apply`):

```diff
diff --git a/README.md b/README.md
index 49120b1..00d7cc9 100644
--- a/README.md
+++ b/README.md
@@ -44,12 +44,12 @@ npm install pdf-lib bwip-js
 
 ## Entry points
 
-| Import from | What it holds | Runs on |
-|---|---|---|
-| `dte-sdk` | Documents, stamps, signatures, envelopes, books and the SII web services client over `fetch` | Node, Bun, Deno; bundles for the browser with no configuration |
-| `dte-sdk/node` | `createNodeHttpsTransport`, `createDirectoryCapture`, `createDirectoryUploadArchive`, `createDirectoryFolioRegistry` | Node |
-| `dte-sdk/portal` | SII portal, folios and CAF requests, purchase and sales register, MIPYME backup, certification sets and runner | Node |
-| `dte-sdk/pdf` | Printed samples | Node, with `pdf-lib` and `bwip-js` installed |
+| Import from      | What it holds                                                                                                        | Runs on                                                        |
+| ---------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
+| `dte-sdk`        | Documents, stamps, signatures, envelopes, books and the SII web services client over `fetch`                         | Node, Bun, Deno; bundles for the browser with no configuration |
+| `dte-sdk/node`   | `createNodeHttpsTransport`, `createDirectoryCapture`, `createDirectoryUploadArchive`, `createDirectoryFolioRegistry` | Node                                                           |
+| `dte-sdk/portal` | SII portal, folios and CAF requests, purchase and sales register, MIPYME backup, certification sets and runner       | Node                                                           |
+| `dte-sdk/pdf`    | Printed samples                                                                                                      | Node, with `pdf-lib` and `bwip-js` installed                   |
 
 `DteError` and `isDteError` come from `dte-sdk` and recognize what every entry throws.
 
@@ -69,8 +69,21 @@ const invoice = issueDocument({
   document: {
     type: 33,
     folio: 1,
-    issuer: { rut: '76543210-3', businessName: 'Comercial Andina SpA', businessActivity: 'Software', address: 'Av. Los Aromos 1540', commune: 'Santiago', activityCode: 620200 },
-    receiver: { rut: '12345678-5', businessName: 'Comercializadora Rapel Ltda', businessActivity: 'Comercio', address: 'Pasaje Los Olmos 88', commune: 'Providencia' },
+    issuer: {
+      rut: '76543210-3',
+      businessName: 'Comercial Andina SpA',
+      businessActivity: 'Software',
+      address: 'Av. Los Aromos 1540',
+      commune: 'Santiago',
+      activityCode: 620200,
+    },
+    receiver: {
+      rut: '12345678-5',
+      businessName: 'Comercializadora Rapel Ltda',
+      businessActivity: 'Comercio',
+      address: 'Pasaje Los Olmos 88',
+      commune: 'Providencia',
+    },
     items: [{ name: 'Plan anual', quantity: 1, unitPrice: 100000 }],
   },
   caf,
@@ -84,7 +97,12 @@ const envelope = signEnvelope(
   createEnvelope({
     kind: 'dte',
     documents: [invoice],
-    cover: { issuerRut: '76543210-3', senderRut: certificate.rut!, resolutionDate: '2024-01-15', resolutionNumber: 123 },
+    cover: {
+      issuerRut: '76543210-3',
+      senderRut: certificate.rut!,
+      resolutionDate: '2024-01-15',
+      resolutionNumber: 123,
+    },
   }),
   certificate,
 )
@@ -165,7 +183,7 @@ Options worth knowing:
   `timeoutMs` is a budget: each poll and each sleep is cut to the time that remains.
 - `capture: createDirectoryCapture({ dir })` from `dte-sdk/node` writes every HTTP exchange, redacted (tokens,
   seeds, cookies, private keys), for SII support tickets. `archive:
-  createDirectoryUploadArchive({ dir })` keeps the exact bytes of every upload the SII answered,
+createDirectoryUploadArchive({ dir })` keeps the exact bytes of every upload the SII answered,
   with its TrackID and the SII's reply (tokens redacted). A duplicate answer is kept as
   `<trackId>-<kind>-duplicate-<yyyymmddHHMMSS>` and never replaces the record of the original.
 - `logger`: silent by default; pass `console` or your own. Messages never carry tokens, RUTs
@@ -222,7 +240,7 @@ await closePortalSession(portal)
 ```
 
 The portal is the certificate-authenticated site of the SII, read as HTML. The certificate must be enabled as a login
-method first, a manual step at sii.cl (*Cambiar Clave y datos de autenticación*, option "Utilizando Clave Tributaria o
+method first, a manual step at sii.cl (_Cambiar Clave y datos de autenticación_, option "Utilizando Clave Tributaria o
 Certificado Digital"); otherwise the login throws `SII_PORTAL_CERT_NOT_ENABLED`. It needs Node: `fetch` cannot
 present a client certificate.
 
@@ -282,12 +300,12 @@ await downloadMipymeBackup(portal, {
 })
 ```
 
-| I need | Function | SII service |
-|---|---|---|
-| Each document of a period (folio, date, amounts), with no receipts and no XML | `listPeriodDocuments` | `consemitidosinternetui` |
-| Official totals per document type and accounting status, with receipts aggregated | `fetchRegisterSummary` | `consdcvinternetui` |
-| How a purchase is classified, and changing it | `fetchPurchaseDocument` and the writes | `complementoscvui` |
-| The full XML of a document | `downloadMipymeBackup` | MIPYME backup |
+| I need                                                                            | Function                               | SII service              |
+| --------------------------------------------------------------------------------- | -------------------------------------- | ------------------------ |
+| Each document of a period (folio, date, amounts), with no receipts and no XML     | `listPeriodDocuments`                  | `consemitidosinternetui` |
+| Official totals per document type and accounting status, with receipts aggregated | `fetchRegisterSummary`                 | `consdcvinternetui`      |
+| How a purchase is classified, and changing it                                     | `fetchPurchaseDocument` and the writes | `complementoscvui`       |
+| The full XML of a document                                                        | `downloadMipymeBackup`                 | MIPYME backup            |
 
 - **A refused month reads as empty.** Response codes are not looked at, so `listPeriodDocuments` and
   `fetchRegisterSummary` cannot tell a month the SII refuses to show from one with no movement. `raw` holds each row as the
@@ -308,12 +326,32 @@ await downloadMipymeBackup(portal, {
 ## Certification: test sets, simulation and books
 
 ```typescript
-import { parseTestSetText, planCertificationSets, createFolioAllocator, issueTestSet, issueSimulation, createCertificationSalesBook } from 'dte-sdk/portal'
+import {
+  parseTestSetText,
+  planCertificationSets,
+  createFolioAllocator,
+  issueTestSet,
+  issueSimulation,
+  createCertificationSalesBook,
+} from 'dte-sdk/portal'
 
 const plan = planCertificationSets(parseTestSetText(setText)) // the text the SII generated for the applicant
-const options = { issuer, receiver, certificate, folios: createFolioAllocator(cafs), resolution: { number: 0, date: '2026-01-01' } }
+const options = {
+  issuer,
+  receiver,
+  certificate,
+  folios: createFolioAllocator(cafs),
+  resolution: { number: 0, date: '2026-01-01' },
+}
 const basic = await issueTestSet(plan.basic!, options) // documents and the signed envelope, with the SET references
-const sales = createCertificationSalesBook(basic, { period: '2026-11', issuerRut, senderRut, resolution, certificate, receiver: { rut, name } })
+const sales = createCertificationSalesBook(basic, {
+  period: '2026-11',
+  issuerRut,
+  senderRut,
+  resolution,
+  certificate,
+  receiver: { rut, name },
+})
 const simulation = await issueSimulation(plan, { ...options, folios: createFolioAllocator(freshCafs) })
 ```
 
@@ -351,10 +389,13 @@ const deps = {
   onProgress: (event) => console.log(event.step),
 }
 
-// The whole HTML side, resumable: run it again after a fix, or after phase 5c did the exchange and the samples
-const first = await runCertification(deps) // stops with `exchange` once the simulation is confirmed
-// Once the portal stands past the printed samples, the sworn statement needs an explicit go
-const second = await runCertification(deps, { declareCompliance: true })
+// The whole HTML side, resumable: run it again after a fix
+const first = await runCertification(deps) // answers the exchange set, then stops with `printedSamples` until the samples are given
+// The samples uploaded and submitted, it stops at `compliance`: the sworn statement needs an explicit go
+const second = await runCertification(deps, {
+  samples: () => readPrintedSamples('./certification/samples'),
+  declareCompliance: true,
+})
 
 // One step alone, after the SII rejected a set with observations
 let state = (await deps.store.load())!
@@ -368,16 +409,17 @@ quota, re-obtaining and annulling only as a last resort), sends each set and kee
 artefacts for the printed samples, declares the track ids on `pe_avance2` with every field in form order and reads
 the page again to verify, waits for the approval, runs the books (the history of books the SII holds marks the
 occupied periods; a closed book is resent as an adjustment or in the next free month, at most 24 times), advances the
-stage, sends and declares the simulation and confirms it, and stops at the exchange, which is phase 5c's. Once the
-portal stands past the printed samples it stops again, at `compliance`: the declaration of compliance is the sworn
-statement of the legal representative, it cannot be undone, and the runner makes it only with
-`declareCompliance: true`.
+stage, sends and declares the simulation and confirms it, answers the exchange set and confirms the exchange, uploads
+the printed samples when the `samples` option gives them (without them it stops at `printedSamples`), and stops at
+`compliance`: the declaration of compliance is the sworn statement of the legal representative, it cannot be undone,
+and the runner makes it only with `declareCompliance: true`.
 
 - **Everything is a step.** `obtainTestSet`, `prepareFolios`, `sendTestSet`, `declareTestSets`,
   `waitForTestSetsApproval`, `runBooks`, `advanceToNextStage`, `sendSimulation`, `declareSimulation`,
-  `waitForSimulationApproval` and `declareComplianceFinal` take the dependencies and the state and return the saved
-  state with an outcome; the portal operations beneath them (`downloadTestSet`, `declareProgress`, `readProgress`,
-  `advanceStage`, `listBookHistory`, `declareCompliance`) are exported too.
+  `waitForSimulationApproval`, `runExchange`, `uploadPrintedSamples` and `declareComplianceFinal` take the dependencies
+  and the state and return the saved state with an outcome; the portal operations beneath them (`downloadTestSet`,
+  `declareProgress`, `readProgress`, `advanceStage`, `listBookHistory`, `declareCompliance`, and those of the next
+  section) are exported too.
 - **The state is a secret.** It holds the CAF files, each with a private key; the directory store writes them readable
   by the user only. A service may implement `CertificationStore` over its own storage.
 - **Dates are Chile dates.** The declaration date and the base book period come from the clock in `America/Santiago`;
@@ -387,22 +429,89 @@ statement of the legal representative, it cannot be undone, and the runner makes
 - **Nothing here has been run against the portal yet.** Every page shape comes from field behaviour; the first
   enrolled run should keep the artefacts the store writes (every portal answer is there) as fixtures.
 
+## Certification: the exchange and the printed samples
+
+```typescript
+import { runCertification, createExchangeAnswers } from 'dte-sdk/portal'
+import { readPrintedSamples, writePrintedSamples, findEnvelopeFiles } from 'dte-sdk/pdf'
+
+// After the simulation: the exchange set is downloaded from the exchange portal, answered and confirmed; then the
+// samples are rendered from the envelopes the store kept and uploaded to the samples portal
+const samplesDir = './certification/samples'
+await writePrintedSamples({
+  xmlFiles: await findEnvelopeFiles('./certification'),
+  outDir: samplesDir,
+  transferable: true,
+})
+const run = await runCertification(deps, { samples: () => readPrintedSamples(samplesDir) })
+// run.stopped: `compliance` once the samples are submitted; `rejected` with the SII's reasons in `run.detail`
+
+// The set could not be downloaded (run.stopped `exchange`, run.detail names `intercambio/set-intercambio.xml`):
+// save it by hand from the exchange portal into that artefact of the store, or pass it
+await runCertification(deps, { exchangeSetXml: await readFile('set-intercambio.xml', 'utf8') })
+
+// The answers alone, for a set in hand
+const answers = createExchangeAnswers(setXml, {
+  companyRut,
+  certificate,
+  contact: { name: 'Contacto', mail: 'contacto@example.test' },
+})
+```
+
+The exchange is the SII's set of documents addressed to the company; the answers are the reception response
+(`respuesta-recepcion-envio.xml`), the receipts of Ley 19.983 (`envio-recibos.xml`) and the commercial approval
+(`respuesta-aprobacion-comercial.xml`), each signed, and valid against the official schemas in the tests. The runner
+downloads the set once (it stays as an artefact), validates the user on the exchange portal, uploads the three answers
+and confirms the exchange, which moves the application to the printed samples. The printed samples are the PDFs of
+every document the sets and the simulation issued, as `writePrintedSamples` lays them out: the runner creates a review
+on the samples portal (or resumes one left in `INGRESO`), uploads every PDF, submits the review and reads its state
+again; a review the SII rejects at once comes back as `rejected` with a summary of how the SII filed each PDF. The
+portal operations beneath (`downloadExchangeSet`, `validateExchangeUser`, `uploadExchangeAnswers`, `confirmExchange`;
+`readSamplesReview`, `createSamplesReview`, `uploadSample`, `submitSamplesReview`, `readSamplesDetail`) and the
+GWT-RPC codec (`gwtBody`, `gwtAnswer`) are exported too. The portals' hashes are discovered on the way in, with the
+pair known to work as the fallback; `gwt: { permutation, policy }` overrides them.
+
+- **Nothing here has been run against the two portals yet.** Every wire and wording comes from field behaviour; the
+  first enrolled run should keep every artefact the store writes under `intercambio/` and `muestras/` as fixtures.
+- **The exchange answers are regenerated and uploaded on every run that reaches the portal;** only the set is kept.
+- **A review left in `INGRESO`** (a run cut off while uploading) is resumed, every PDF uploaded again.
+
 ## Printed samples (Node)
 
 ```typescript
-import { parsePrintableDocuments, renderPrintedSample, renderPrintedSamples, writePrintedSamples, findEnvelopeFiles } from 'dte-sdk/pdf'
+import {
+  parsePrintableDocuments,
+  renderPrintedSample,
+  renderPrintedSamples,
+  writePrintedSamples,
+  findEnvelopeFiles,
+  readPrintedSamples,
+} from 'dte-sdk/pdf'
 
 // The signed XML is the input: one document the SDK issued, or any EnvioDTE/EnvioBOLETA
 const [doc] = parsePrintableDocuments(signed.xml)
-const pdf = await renderPrintedSample(doc, { siiOffice: 'S.I.I. - SANTIAGO ORIENTE', resolution: 'Res. Ex. SII N° 80 del 2014' })
+const pdf = await renderPrintedSample(doc, {
+  siiOffice: 'S.I.I. - SANTIAGO ORIENTE',
+  resolution: 'Res. Ex. SII N° 80 del 2014',
+})
 const transferableCopy = await renderPrintedSample(doc, { transferable: true }) // adds the acknowledgement box and CEDIBLE
 
 // Every document of every envelope, in memory, classified into the test and simulation sets
-const result = await renderPrintedSamples({ envelopes: [{ name: 'envio-set-basico.xml', xml: envelope.xml }], transferable: true })
+const result = await renderPrintedSamples({
+  envelopes: [{ name: 'envio-set-basico.xml', xml: envelope.xml }],
+  transferable: true,
+})
 
 // From the files of a certification run into SET-PRUEBAS and SET-SIMULACION
 const files = await findEnvelopeFiles('./certification/envelopes')
-const written = await writePrintedSamples({ xmlFiles: files, outDir: './certification/samples', logoPath: './logo.png', transferable: true })
+const written = await writePrintedSamples({
+  xmlFiles: files,
+  outDir: './certification/samples',
+  logoPath: './logo.png',
+  transferable: true,
+})
+// Back from disk, for the certification runner: every .pdf under the directory, the test set folder first
+const samples = await readPrintedSamples('./certification/samples')
 ```
 
 The printed sample follows the SII printed-samples manual: one page 21.5 cm wide and as tall as its content between 11
```

`CHANGELOG.md` (save the diff and run `git apply`):

```diff
diff --git a/CHANGELOG.md b/CHANGELOG.md
index 67a9c26..5b8406c 100644
--- a/CHANGELOG.md
+++ b/CHANGELOG.md
@@ -98,11 +98,25 @@ and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0
   `createDirectoryCertificationStore`, private files); the steps `obtainTestSet`, `prepareFolios`, `sendTestSet`,
   `declareTestSets`, `waitForTestSetsApproval`, `runBooks`, `advanceToNextStage`, `sendSimulation`, `declareSimulation`,
   `waitForSimulationApproval`, `declareComplianceFinal`, each returning the saved state with an outcome, with typed
-  progress events; and `runCertification`, which chains them in the field's order, resumes from the saved state, stops
-  at the exchange for phase 5c and makes the irreversible declaration of compliance only with
-  `declareCompliance: true`. Catalog `SET_KEYS`, `BOOK_KEYS`, `CERTIFICATION_STAGES`, `CERTIFICATION_STEPS`,
+  progress events; and `runCertification`, which chains them in the field's order, resumes from the saved state and
+  makes the irreversible declaration of compliance only with `declareCompliance: true`. Catalog `SET_KEYS`, `BOOK_KEYS`, `CERTIFICATION_STAGES`, `CERTIFICATION_STEPS`,
   `DEFAULT_OPTIONAL_SETS`; portal rejections `notEnrolled`, `advanceRefused`, `declarationDeclined`. The 5b-1 books
   accept the cases a run keeps and an adjustment submission. `dte-sdk/portal` limit to 56 kB.
+- Certification, the exchange and the printed samples (`dte-sdk/portal`): the GWT-RPC codec of the SII's portals
+  (`gwtBody`, `gwtAnswer`, `encodeGwtLong`, `decodeGwtLong`) and the discovery of their hashes (`discoverGwtHashes`,
+  with the pairs known to work as the fallback and `gwt` as the override); the exchange portal operations
+  `downloadExchangeSet`, `validateExchangeUser`, `uploadExchangeAnswers`, `confirmExchange`; the samples portal
+  operations `readSamplesReview`, `createSamplesReview`, `uploadSample` (a 5xx retried up to four attempts, 2, 4 and
+  6 s apart), `submitSamplesReview`, `readSamplesDetail`; `createExchangeAnswers` and `parseExchangeSet`, the three
+  answers to an exchange set (the reception response, the receipts of Ley 19.983 and the commercial approval) signed and
+  valid against the official `RespuestaEnvioDTE_v10.xsd` and `EnvioRecibos_v10.xsd`; the steps `runExchange` and
+  `uploadPrintedSamples`; `runCertification` now answers the exchange and uploads the samples given by the `samples`
+  option (`readPrintedSamples` from `dte-sdk/pdf` reads them from a directory), stopping with `exchange`,
+  `printedSamples` or `rejected` in front of what it lacks, and `exchangeSetXml` takes a set downloaded by hand;
+  `CertificationState` gains `exchange` and `samples`; progress events `INTERCAMBIO_START`, `INTERCAMBIO_DESCARGADO`,
+  `INTERCAMBIO_DONE`, `MUESTRAS_UPLOADING`, `MUESTRAS_DONE`; the portal session takes raw bodies; catalog
+  `EXCHANGE_PORTAL`, `SAMPLES_PORTAL`, `EXCHANGE_ANSWER_FILES`; portal rejections `exchangeUploadRefused`,
+  `samplesReviewRefused`, `sampleUploadRefused`. `dte-sdk/portal` limit to 64 kB.
 
 ### Changed
```

`llms.txt` (save the diff and run `git apply`):

```diff
diff --git a/llms.txt b/llms.txt
index bf2beed..c6f6888 100644
--- a/llms.txt
+++ b/llms.txt
@@ -12,7 +12,7 @@ The SII books are `createPurchaseSalesBook` (IECV, `LibroCompraVenta`), `createG
 
 Certification (deterministic half, from `dte-sdk/portal`): `parseTestSetText` parses the SII test-set text into sets and cases; `planCertificationSets` gives what each set issues and the folios per type; `createFolioAllocator` hands out folios with the CAF that stamps them; `issueTestSet` issues the basic, exempt, guide and purchase sets through phase 1 with the `SET` reference (`CASO <id>`) and the field rules; `issueSimulation` re-issues every case in one envelope; `createCertificationSalesBook`, `createCertificationPurchaseBook` and `createCertificationGuideBook` build and sign the books through phase 3. Nothing sends: the runner does.
 
-Certification (portal half, from `dte-sdk/portal`): `runCertification` runs the HTML side in the field's order from a `CertificationStore` (`createMemoryCertificationStore`, `createDirectoryCertificationStore`; the state holds CAF private keys) and stops at the exchange, which is phase 5c's; once the portal stands past the printed samples it stops at `compliance`, and makes the irreversible declaration of compliance only with `declareCompliance: true`. Each phase is a step over the dependencies and the state (`obtainTestSet`, `prepareFolios`, `sendTestSet`, `declareTestSets`, `waitForTestSetsApproval`, `runBooks`, `advanceToNextStage`, `sendSimulation`, `declareSimulation`, `waitForSimulationApproval`, `declareComplianceFinal`), with typed progress events through `onProgress`; beneath them the portal operations `downloadTestSet` (generates the set anew at the SII), `declareProgress` (every field in form order, the page read again to verify), `readProgress`, `advanceStage`, `listBookHistory` and `declareCompliance`. Dates are Chile dates; the waits are the field's and `sleep` and `now` are injectable. None of it has been run against the portal yet.
+Certification (portal half, from `dte-sdk/portal`): `runCertification` runs the HTML side in the field's order from a `CertificationStore` (`createMemoryCertificationStore`, `createDirectoryCertificationStore`; the state holds CAF private keys): the test sets, the books, the simulation, the exchange set answered on the exchange portal (`downloadExchangeSet`, `validateExchangeUser`, `uploadExchangeAnswers`, `confirmExchange`; the answers from `createExchangeAnswers`, signed and schema-valid), the printed samples uploaded to the samples portal when the `samples` option gives them (`readPrintedSamples` from `dte-sdk/pdf`; `readSamplesReview`, `createSamplesReview`, `uploadSample`, `submitSamplesReview`, `readSamplesDetail`), and the declaration of compliance, irreversible, only with `declareCompliance: true`; it stops with `exchange` (the set unavailable or the company not in the exchange), `printedSamples` (no samples given), `rejected` (the SII's reasons in the detail) or `compliance`. Each phase is a step over the dependencies and the state (`obtainTestSet`, `prepareFolios`, `sendTestSet`, `declareTestSets`, `waitForTestSetsApproval`, `runBooks`, `advanceToNextStage`, `sendSimulation`, `declareSimulation`, `waitForSimulationApproval`, `runExchange`, `uploadPrintedSamples`, `declareComplianceFinal`), with typed progress events through `onProgress`; beneath them the portal operations `downloadTestSet` (generates the set anew at the SII), `declareProgress` (every field in form order, the page read again to verify), `readProgress`, `advanceStage`, `listBookHistory` and `declareCompliance`. The two GWT portals speak GWT-RPC (`gwtBody`, `gwtAnswer`); their hashes are discovered on the way in with the pair known to work as the fallback. Dates are Chile dates; the waits are the field's and `sleep` and `now` are injectable. None of it has been run against the portal yet.
 
 Printed samples (Node only, from `dte-sdk/pdf`): `parsePrintableDocuments` turns any `EnvioDTE`, `EnvioBOLETA`, bare `SetDTE` or bare `DTE` XML into printable documents with each `TED` copied verbatim; `renderPrintedSample` draws one single-page PDF per the SII printed-samples manual (21.5 cm wide, 11 to 33 cm tall, red type box, acknowledgement box and `CEDIBLE` mark on the transferable copy of 33, 34, 43, 46 and sale guides, PDF417 stamp with the signed bytes and its legends); `renderTedBarcode` gives the stamp PNG alone; `renderPrintedSamples` batches envelopes in memory into the test and simulation sets with failures as data; `writePrintedSamples` and `findEnvelopeFiles` do the same over files (`SET-PRUEBAS`, `SET-SIMULACION`). `pdf-lib` and `bwip-js` load on first use.
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest --config jest.config.cjs tests/public-api tests/types --coverage=false
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
npm run prettier
```

```bash
git add src/portal/index.ts src/pdf/index.ts .size-limit.json README.md CHANGELOG.md llms.txt tests/public-api.test.ts tests/types.test.ts tests/dist.smoke.test.ts
```

```bash
git commit -F - <<'MSG'
feat: the 5c-1 exports, the public API lists, the limits and the docs of the exchange and the printed samples

The portal entry exports the GWT codec, the two portals' operations, the
exchange answers and the two steps; the pdf entry exports readPrintedSamples.
The portal limit goes to 64 kB (measured 62.47 kB). README, CHANGELOG and
llms.txt describe the runner's two new stages and the manual download of the set.

Co-Authored-By: <the line your session prescribes>
MSG
```

---

## Measurements

Minified and brotli-compressed, per entry (the four entry points of issue 5 replaced the single root bundle):

| Entry | Before this phase | After | Limit |
|---|---|---|---|
| `dte-sdk` | 30.16 kB | 30.16 kB | 32 kB |
| `dte-sdk/node` | 4.19 kB | 4.19 kB | 6 kB |
| `dte-sdk/portal` | about 56 kB | 62.47 kB | 64 kB |
| `dte-sdk/pdf` | 8.45 kB | 8.45 kB | 10 kB |

## What this leaves open

- **The two portals themselves.** Nothing of this phase has been seen by this SDK: the company is not enrolled and not
  past the simulation. The store keeps every portal answer as an artefact so the first enrolled run turns them into
  fixtures of the page modules; the success pages of the exchange uploads are not recorded even in the field.
- **The receipts certification track** (the third GWT portal): phase 5c-2, from D87.
- **Deferred on purpose** (spec section 7): the answers regenerated on every run, no wait after the samples are
  submitted, the hashes of June 2026 as the fallback.
- **Field defects not reproduced** (spec 7, D84): the RUT split on `-`, the exchange reported as a success with nothing
  uploaded, local-time timestamps, the server verification disabled, two review-id ranges, instructions printed instead
  of data.

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

Expected: all pass, 2 342 tests, 100 % on the four metrics, `dte-sdk/portal` about 62.47 kB against 64 kB and `dte-sdk/pdf` about 8.45 kB against 10 kB.

- [ ] **Step 2: Read the diff against `canary` once**

Nothing public may name any other project, and no RUT, certificate or local path may appear outside the allow-list. `npm run scan` covers the last part; the first is yours to check.

- [ ] **Step 3: Open the pull request against `canary`**

The body explains the codec, the pages, the nine operations, the answers and the two steps, where the runner now stops (`exchange`, `printedSamples`, `rejected`, `compliance`), the manual download of the set, the 64 kB limit of `dte-sdk/portal`, lists the decisions of spec section 5 and the deferred items and field defects not reproduced of section 7, and states plainly that nothing has been run against the two portals. Squash-merge is how this repository integrates, and merging is Hans's call.

- [ ] **Step 4: Record what stays open**

Add to [issue 8](https://github.com/arrowsw/dte-sdk/issues/8) the live proof this phase needs before the first release that ships it: the company enrolled and past the simulation, the exchange answered through the runner and the samples submitted, with every artefact under `intercambio/` and `muestras/` kept as fixtures. Post the entry sizes on [issue 5](https://github.com/arrowsw/dte-sdk/issues/5).
