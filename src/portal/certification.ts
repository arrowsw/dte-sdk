import { DEFAULT_OPTIONAL_SETS, type CertificationStage, type DeclarationKey } from '../catalogs/certification'
import { SII_HOSTS } from '../catalogs/endpoints'
import { cgiUrl } from '../catalogs/portal'
import { DteError, errorMessage } from '../errors'
import type { CallOverrides } from '../sii/client'
import { resolvePortalCompany, type PortalClient } from './client'
import { hasSessionCookie } from './cookies'
import { hiddenInputs } from './html'
import { portalMessageOf } from './pages/auth'
import { parseCertificationSets, type CertificationSet } from './pages/certification'
import { isHistoryUnauthorized, parseBookHistory, type BookHistoryEntry } from './pages/certification-books'
import {
  complianceBlock,
  complianceForm,
  complianceMessage,
  hasOkMessage,
  isDeclared,
  isUnconfirmed,
} from './pages/certification-compliance'
import {
  classifyAdvanceAnswer,
  classifyDeclarationAnswer,
  offersSimulationConfirmation,
  parseDeclarationForm,
  parseProgressPage,
  SIMULATION_AWAITS_CONFIRMATION,
  verifyDeclaration,
  type AdvanceAnswer,
  type ItemState,
  type ReceiptsProgress,
} from './pages/certification-progress'
import {
  attentionNumberOf,
  isNotEnrolled,
  isNotEnrolledDownload,
  isNotEnrolledPlain,
  isSessionDropped,
  isSetRegenerated,
  parseSetGeneration,
  setTextOf,
  type OptionalSetOption,
  type SetGenerationState,
} from './pages/certification-set'
import {
  assertNotRejected,
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

const REQUIRED_SETS = ['SET BASICO', 'SET GUIA DE DESPACHO', 'SET FACTURA EXENTA', 'SET CASO GENERAL FACTURA COMPRA']
const REQUIRED_BOOKS = ['LIBRO DE VENTAS', 'LIBRO DE COMPRAS', 'LIBRO DE GUIAS']
const BASIC_SET_FIELD = 'SET01'
const COMPANY_CODE = '8'
const DEFAULT_TOTAL_ROWS = 10
const DEFAULT_STEP = 'P01'
const SIMULATION_STAGE_WORD = 'SIMULACION'
const MIN_YEAR = 1990
const MAX_YEAR = 2100
const UPL_URL = `https://${SII_HOSTS.certification}/cgi_dte/UPL/`

const at = (page: string): string => cgiUrl('certification', page)

type Company = ReturnType<typeof companyFields>

// A post that changes the application (generating a set, moving the stage, declaring compliance) is sent once: a
// retry after a timeout could repeat it. The declaration of progress is repeated safely, so it keeps the policy.
const once = (context: PortalContext): PortalContext => ({
  ...context,
  overrides: { ...context.overrides, retry: false },
})

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

/**
 * EN: Input of `downloadTestSet`.
 * ES: Entrada de `downloadTestSet`.
 */
export type DownloadTestSetInput = {
  /** EN: Company RUT; the client's by default. ES: `RUT_EMP` + `DV_EMP` — RUT de la empresa; por defecto el del cliente. */
  readonly companyRut?: string
  /** EN: Optional sets to tick, `SETnn`; `DEFAULT_OPTIONAL_SETS` by default. Only those the page offers are sent. ES: `SETnn` — Sets opcionales a marcar; por defecto `DEFAULT_OPTIONAL_SETS`. Solo se envían los que la página ofrece. */
  readonly optionalSets?: readonly string[]
  /** EN: False to read the state table only, without generating a set. ES: False para leer solo la tabla de estados, sin generar un set. */
  readonly download?: boolean
  /** EN: The attention number of the set in hand, to tell a regenerated set. ES: El número de atención del set en mano, para reconocer un set regenerado. */
  readonly previousAttentionNumber?: string
}

/**
 * EN: What `downloadTestSet` read. Downloading generates the set: the SII assigns the cases anew, so anything sent
 * for an earlier set is void.
 * ES: Lo que leyó `downloadTestSet`. Descargar genera el set: el SII asigna los casos de nuevo, así que lo enviado
 * para un set anterior queda sin efecto.
 */
export type DownloadedTestSet = {
  /** EN: The set table of `pe_generar1`. ES: La tabla de sets de `pe_generar1`. */
  readonly states: readonly SetGenerationState[]
  /** EN: The optional sets the page offered. ES: Los sets opcionales que ofreció la página. */
  readonly optionalSets: readonly OptionalSetOption[]
  /** EN: The `SETnn` ticked, the basic set included. ES: Los `SETnn` marcados, incluido el set básico. */
  readonly requested: readonly string[]
  /** EN: The set text, for `parseTestSetText`; null without `download`. ES: El texto del set, para `parseTestSetText`; null sin `download`. */
  readonly text: string | null
  /** EN: Its attention number, or null. ES: Su número de atención, o null. */
  readonly attentionNumber: string | null
  /** EN: The page said a new set was generated, or the attention number changed. ES: La página dijo que se generó un set nuevo, o cambió el número de atención. */
  readonly regenerated: boolean
}

/**
 * EN: One envelope to declare: its track id and the date it was sent, `YYYY-MM-DD` in Chile.
 * ES: Un envío por declarar: su track id y la fecha en que se envió, `AAAA-MM-DD` de Chile.
 */
export type DeclarationEntry = {
  /** EN: SII track id, digits. ES: `NUM_ENV` — Track id del SII, dígitos. */
  readonly trackId: string
  /** EN: Date sent, `YYYY-MM-DD`. ES: `FEC_ENV` — Fecha de envío, `AAAA-MM-DD`. */
  readonly date: string
}

/**
 * EN: The entries of one declaration, by row key.
 * ES: Las entradas de una declaración, por clave de fila.
 */
export type DeclarationEntries = Readonly<Partial<Record<DeclarationKey, DeclarationEntry>>>

/**
 * EN: Input of `declareProgress`.
 * ES: Entrada de `declareProgress`.
 */
export type DeclareProgressInput = {
  /** EN: The envelopes to declare. ES: Los envíos por declarar. */
  readonly entries: DeclarationEntries
  /** EN: Company RUT; the client's by default. ES: `RUT_EMP` + `DV_EMP` — RUT de la empresa; por defecto el del cliente. */
  readonly companyRut?: string
}

/**
 * EN: How a declaration ended, in a word. `accepted` and `inReview` are good; `contentErrors` names envelopes the SII
 * finds errors in (the declaration itself may still stand, see `success`); `allRejected` is every declared row back
 * empty; `notSaved` is some of them; `inconsistent` is a date or number the SII says does not match; `declined` is no
 * form to post; `failed` is a post the portal did not take.
 * ES: Cómo terminó una declaración, en una palabra. `accepted` e `inReview` están bien; `contentErrors` nombra envíos
 * en los que el SII encuentra errores (la declaración misma puede seguir en pie, ver `success`); `allRejected` es toda
 * fila declarada de vuelta vacía; `notSaved`, algunas; `inconsistent` es una fecha o número que el SII dice que no
 * corresponde; `declined`, que no hay formulario que enviar; `failed`, un envío que el portal no aceptó.
 */
export type DeclarationOutcome =
  | 'accepted'
  | 'inReview'
  | 'contentErrors'
  | 'allRejected'
  | 'notSaved'
  | 'inconsistent'
  | 'declined'
  | 'failed'

/**
 * EN: What `declareProgress` did and what the portal answered, with the facts the declaration loop decides on.
 * ES: Lo que hizo `declareProgress` y lo que respondió el portal, con los hechos sobre los que decide el ciclo de
 * declaración.
 */
export type DeclarationResult = {
  /** EN: The declaration stands: the post was taken and the re-read form kept it or shows it in review. ES: La declaración quedó en pie: el envío fue aceptado y el formulario releído la conservó o la muestra en revisión. */
  readonly success: boolean
  /** EN: The outcome, in a word. ES: El resultado, en una palabra. */
  readonly outcome: DeclarationOutcome
  /** EN: The rows actually declared: those with a field on the form. ES: Las filas efectivamente declaradas: las que tenían campo en el formulario. */
  readonly declared: readonly DeclarationKey[]
  /** EN: The re-read form kept the declaration; null when no re-read was made. ES: El formulario releído conservó la declaración; null si no hubo relectura. */
  readonly verified: boolean | null
  /** EN: Some declared row shows "EN REVISION". ES: Alguna fila declarada muestra "EN REVISION". */
  readonly inReview: boolean
  /** EN: Declared rows whose field came back empty. ES: Filas declaradas cuyo campo volvió vacío. */
  readonly emptyFields: readonly DeclarationKey[]
  /** EN: Rows the answer named with "ENVIO CON ERRORES O REPAROS". ES: Filas que la respuesta nombró con "ENVIO CON ERRORES O REPAROS". */
  readonly contentErrors: readonly DeclarationKey[]
  /** EN: Every declared row came back empty: the SII took none of them. ES: Toda fila declarada volvió vacía: el SII no tomó ninguna. */
  readonly allRejected: boolean
  /** EN: Why, in a word or a sentence, or null. ES: Por qué, en una palabra o una frase, o null. */
  readonly detail: string | null
  /** EN: The answer page, for the artefacts; empty when nothing was posted. ES: La página de respuesta, para los artefactos; vacía si no se envió nada. */
  readonly answerHtml: string
  /** EN: The form page, for the artefacts. ES: La página del formulario, para los artefactos. */
  readonly formHtml: string
  /** EN: The page a "not processed yet" wording is looked for on: the answer, or the form when nothing was posted. ES: La página en la que se busca un "aún no procesado": la respuesta, o el formulario si no se envió nada. */
  readonly judgedHtml: string
}

/**
 * EN: The progress of the application as `pe_avance6` shows it.
 * ES: El avance de la postulación como lo muestra `pe_avance6`.
 */
export type ProgressReport = {
  /** EN: The stage wording, upper case, or null. ES: El texto de la etapa, en mayúsculas, o null. */
  readonly stage: string | null
  /** EN: The stage as the runner names it. ES: La etapa como la nombra el ejecutor. */
  readonly stageKey: CertificationStage
  /** EN: The state of each set and book named on the page. ES: El estado de cada set y libro que nombra la página. */
  readonly states: Readonly<Partial<Record<DeclarationKey, { readonly text: string; readonly state: ItemState }>>>
  /** EN: An approved simulation awaits its confirmation. ES: Una simulación aprobada espera su confirmación. */
  readonly simulationAwaitsConfirmation: boolean
  /** EN: The rows of `pe_avance2`, read on the way. ES: Las filas de `pe_avance2`, leídas de paso. */
  readonly rows: readonly CertificationSet[]
  /** EN: The receipts row of the page, or null. ES: La fila de boletas de la página, o null. */
  readonly receipts: ReceiptsProgress | null
}

/**
 * EN: What `advanceStage` got.
 * ES: Lo que obtuvo `advanceStage`.
 */
export type AdvanceResult = AdvanceAnswer

/**
 * EN: What `listBookHistory` read for one year.
 * ES: Lo que leyó `listBookHistory` para un año.
 */
export type BookHistory = {
  /** EN: The year asked. ES: El año consultado. */
  readonly year: number
  /** EN: Every book listed. ES: Todos los libros listados. */
  readonly entries: readonly BookHistoryEntry[]
  /** EN: The periods with any entry, each once: none of them takes a new total submission. ES: Los períodos con alguna entrada, cada uno una vez: ninguno acepta un nuevo envío total. */
  readonly occupiedPeriods: readonly string[]
}

/**
 * EN: What `declareCompliance` did.
 * ES: Lo que hizo `declareCompliance`.
 */
export type ComplianceResult = {
  /** EN: Declared, blocked by the portal, or the final page did not confirm. ES: Declarada, bloqueada por el portal, o la página final no confirmó. */
  readonly outcome: 'declared' | 'blocked' | 'unconfirmed'
  /** EN: The sentence the portal gave. ES: La frase que dio el portal. */
  readonly message: string
}

const allApproved = (sets: readonly CertificationSet[], required: readonly string[]): boolean =>
  required.every((name) => sets.find((set) => set.name.includes(name))?.status.includes('REVISADO CONFORME') ?? false)

// The entry sequence of every progress page: a fresh pe_avance1, then the company posted to pe_avance2. The SII
// refreshes its state on the way; pe_avance5 answers nothing without it.
const enter = async (context: PortalContext, company: Company): Promise<PortalPage> => {
  const entry = await ensurePage(context, 'pe_avance1', at('pe_avance1'))
  const page = await submitForm(
    context,
    'pe_avance2',
    at('pe_avance2'),
    entry.url,
    { ...company, ACEPTAR: 'Continuar' },
    at('pe_avance1'),
  )
  return page
}

/**
 * EN: Reads the state of each test set and book, on the certification host. It only reads: declaring progress is
 * `declareProgress`.
 * ES: Lee el estado de cada set de pruebas y libro, en el host de certificación. Solo lee: declarar avance es
 * `declareProgress`.
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
    const page = await enter(context, companyFields(resolvePortalCompany(portal, input.companyRut)))
    const sets = parseCertificationSets(page.html)
    if (sets.length === 0) throw unexpectedPage(context, 'pe_avance2', page.html)
    return {
      sets,
      allSetsApproved: allApproved(sets, REQUIRED_SETS),
      allBooksApproved: allApproved(sets, REQUIRED_BOOKS),
    }
  })

const openSetPage = async (context: PortalContext): Promise<PortalPage> => {
  const first = await ensurePage(context, 'pe_generar', at('pe_generar'))
  if (!isNotEnrolledPlain(first.html)) return first
  // A cached session may carry a stale answer: once more, fresh, before believing it.
  forgetSession(context)
  return ensurePage(context, 'pe_generar', at('pe_generar'))
}

// The four requests that read the progress page. The SII refreshes the state of the application on the way.
const progressPages = async (
  context: PortalContext,
  company: Company,
): Promise<{ readonly form: PortalPage; readonly progress: PortalPage }> => {
  const entry = await ensurePage(context, 'pe_avance1', at('pe_avance1'))
  const form = await submitForm(
    context,
    'pe_avance2',
    at('pe_avance2'),
    entry.url,
    { ...company, ACEPTAR: 'Continuar' },
    at('pe_avance1'),
  )
  const progressEntry = await ensurePage(context, 'pe_avance5', at('pe_avance5'))
  const progress = await submitForm(
    context,
    'pe_avance6',
    at('pe_avance6'),
    progressEntry.url,
    { ...company, ACEPTAR: 'Continuar' },
    at('pe_avance5'),
  )
  return { form, progress }
}

/**
 * EN: Downloads the test set from `pe_generar`, as the reference does. Without a session in the cache the progress
 * page is read first, which logs in and lets the SII refresh the application; whatever that read answers, the
 * download goes on. Then: the landing page (asked once more with a fresh session when it says "no está inscrito"),
 * the company confirmed on `pe_generar1` when the page asks, and `pe_generar2` posted with the company, `AUTORIZADA`,
 * `TOTAL`, the optional sets ticked in page order and `SET01` last. No page on the way is searched for a refusal, and
 * a generation page that says the company is not enrolled is posted all the same and refused only afterwards. A
 * session the portal drops on the download is forgotten and the sequence repeated once. Generating the set assigns
 * the cases anew: call it once per certification.
 * ES: Descarga el set de pruebas desde `pe_generar`, como lo hace la referencia. Sin sesión en la caché se lee primero
 * la página de avance, lo que inicia sesión y deja que el SII refresque la postulación; responda lo que responda esa
 * lectura, la descarga sigue. Luego: la portada (pedida una vez más con sesión nueva si dice "no está inscrito"), la
 * empresa confirmada en `pe_generar1` cuando la página lo pide, y `pe_generar2` enviado con la empresa, `AUTORIZADA`,
 * `TOTAL`, los sets opcionales marcados en el orden de la página y `SET01` al final. En ninguna página del camino se
 * busca un rechazo, y una página de generación que dice que la empresa no está inscrita se envía igual y se rechaza
 * recién después. Una sesión que el portal suelta en la descarga se olvida y la secuencia se repite una vez. Generar
 * el set asigna los casos de nuevo: se llama una vez por certificación.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the company, the optional sets, whether to download. ES: la empresa, los sets opcionales, si descargar.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the table, the sets offered and ticked, the text. ES: la tabla, los sets ofrecidos y marcados, el texto.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED` with `notEnrolled`, `SII_PORTAL_SESSION_EXPIRED`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const downloadTestSet = (
  portal: PortalClient,
  input: DownloadTestSetInput = {},
  overrides?: CallOverrides,
): Promise<DownloadedTestSet> =>
  withPortalSession(portal, 'downloadTestSet', overrides, async (context) => {
    const company = companyFields(resolvePortalCompany(portal, input.companyRut))
    const wanted = input.optionalSets ?? DEFAULT_OPTIONAL_SETS
    if (!hasSessionCookie(context.state.cookies))
      await progressPages(context, company).catch((error: unknown) => {
        context.portal.logger.warn('certification progress read before the set failed', {
          reason: errorMessage(error),
        })
      })
    const attempt = async (retry: boolean): Promise<DownloadedTestSet> => {
      const landing = await openSetPage(context)
      const generation = parseSetGeneration(landing.html).asksCompanyConfirmation
        ? await submitForm(
            context,
            'pe_generar1',
            at('pe_generar1'),
            landing.url,
            { ...company, CODIGO: COMPANY_CODE, ACEPTAR: 'Confirmar Empresa' },
            at('pe_generar'),
          )
        : landing
      // A page that says "not enrolled" is believed only once the sequence is over: the set is asked for first.
      const refuseNotEnrolled = (): void => {
        if (isNotEnrolled(generation.html))
          throw rejected(context, 'notEnrolled', { portalMessage: portalMessageOf(generation.html) })
      }
      const page = parseSetGeneration(generation.html)
      const base = { states: page.states, optionalSets: page.optionalSets }
      if (input.download === false) {
        refuseNotEnrolled()
        return { ...base, requested: [], text: null, attentionNumber: null, regenerated: false }
      }
      const ticked = page.optionalSets.map((option) => option.code).filter((code) => wanted.includes(code))
      const sets = { ...Object.fromEntries(ticked.map((code) => [code, 'S'])), [BASIC_SET_FIELD]: 'S' }
      const downloaded = await submitForm(
        context,
        'pe_generar2',
        at('pe_generar2'),
        generation.url,
        { ...company, AUTORIZADA: page.authorized, TOTAL: page.total, ...sets },
        at('pe_generar1'),
      )
      refuseNotEnrolled()
      if (isSessionDropped(downloaded.html)) {
        if (isNotEnrolledDownload(downloaded.html))
          throw rejected(context, 'notEnrolled', { portalMessage: portalMessageOf(downloaded.html) })
        if (retry)
          throw new DteError('SII_PORTAL_SESSION_EXPIRED', { operation: context.operation, step: 'pe_generar2' })
        forgetSession(context)
        return attempt(true)
      }
      const text = setTextOf(downloaded.html)
      const attentionNumber = attentionNumberOf(text)
      if (attentionNumber === null && !/\bCASO\b/i.test(text))
        throw unexpectedPage(context, 'pe_generar2', downloaded.html)
      return {
        ...base,
        requested: Object.keys(sets),
        text,
        attentionNumber,
        regenerated: isSetRegenerated(downloaded.html, input.previousAttentionNumber ?? null),
      }
    }
    return attempt(false)
  })

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const portalDate = (date: string): string => {
  const match = DATE.exec(date)
  if (match === null) throw new DteError('INVALID_DATE', { field: 'date' })
  return `${match[3]}-${match[2]}-${match[1]}`
}

const portalTrackId = (trackId: string): string => {
  if (!/^\d+$/.test(trackId)) throw new DteError('INVALID_OPTION', { field: 'trackId' })
  return String(Number.parseInt(trackId, 10))
}

const unsuccessful = (
  outcome: DeclarationOutcome,
  detail: string | null,
  pages: { readonly formHtml: string; readonly answerHtml: string },
): DeclarationResult => ({
  success: false,
  outcome,
  declared: [],
  verified: null,
  inReview: false,
  emptyFields: [],
  contentErrors: [],
  allRejected: false,
  detail,
  ...pages,
  judgedHtml: pages.answerHtml === '' ? pages.formHtml : pages.answerHtml,
})

/**
 * EN: Declares the track id and date of envelopes on `pe_avance2`, posted to `pe_avance3`, as the reference does. The
 * form is read for its hidden fields and for the index of each row's field, found by the row's label (the indexes
 * move as sets are approved). A page without hidden fields has no form: nothing is posted. Otherwise every `NUM_ENV`,
 * `FEC_ENV`, `SET` and `EST` field up to `TOTREG` is posted in form order with the values already on the page, the
 * track id without leading zeros and the date as `dd-mm-yyyy`, then the company, `TOTREG` and the button; a row that
 * has no field (approved or in review) simply adds nothing, and the form is posted all the same. The answer is read
 * as it came: inconsistent data ends at once, a post the portal did not take is a failure. Then `pe_avance2` is
 * posted once more, without visiting `pe_avance1` again, to verify: the declaration stands when no declared field
 * came back empty or some row shows "EN REVISION". A failure of that re-read leaves the declaration as verified.
 * ES: Declara el track id y la fecha de envíos en `pe_avance2`, enviado a `pe_avance3`, como lo hace la referencia. Del
 * formulario se leen los campos ocultos y el índice del campo de cada fila, buscada por su etiqueta (los índices se
 * mueven al aprobarse sets). Una página sin campos ocultos no tiene formulario: no se envía nada. Si lo tiene, se
 * envían todos los campos `NUM_ENV`, `FEC_ENV`, `SET` y `EST` hasta `TOTREG` en el orden del formulario con los
 * valores que ya trae la página, el track id sin ceros a la izquierda y la fecha como `dd-mm-aaaa`, luego la empresa,
 * `TOTREG` y el botón; una fila sin campo (aprobada o en revisión) simplemente no agrega nada, y el formulario se
 * envía igual. La respuesta se lee tal como llegó: un dato inconsistente termina de inmediato, un envío que el portal
 * no aceptó es una falla. Luego se envía `pe_avance2` una vez más, sin volver a visitar `pe_avance1`, para verificar:
 * la declaración queda en pie si ningún campo declarado volvió vacío o alguna fila muestra "EN REVISION". Un fallo de
 * esa relectura deja la declaración como verificada.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the entries and the company. ES: las entradas y la empresa.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: whether the declaration stands, and the facts and pages behind it. ES: si la declaración quedó en pie, y los hechos y páginas que lo respaldan.
 * @throws {DteError} EN: `INVALID_OPTION { field: 'entries' | 'trackId' }`, `INVALID_DATE`, session and transport codes. ES: los mismos códigos.
 */
export const declareProgress = (
  portal: PortalClient,
  input: DeclareProgressInput,
  overrides?: CallOverrides,
): Promise<DeclarationResult> =>
  withPortalSession(portal, 'declareProgress', overrides, async (context) => {
    const entries = Object.entries(input.entries).filter(([, entry]) => entry !== undefined) as [
      DeclarationKey,
      DeclarationEntry,
    ][]
    if (entries.length === 0) throw new DteError('INVALID_OPTION', { field: 'entries' })
    const values = entries.map(([key, entry]) => [key, portalTrackId(entry.trackId), portalDate(entry.date)] as const)
    const company = companyFields(resolvePortalCompany(portal, input.companyRut))
    const formPage = await enter(context, company)
    const formHtml = formPage.html
    const form = parseDeclarationForm(formHtml)
    if (!form.hasForm)
      return unsuccessful('declined', form.hasErrorStates ? 'errorStates' : 'noForm', { formHtml, answerHtml: '' })
    if (values.some(([key]) => key === 'simulation') && form.indexes.simulation === undefined)
      return unsuccessful('declined', 'simulationUnavailable', { formHtml, answerHtml: '' })
    const mapped = values.flatMap(([key, trackId, date]) => {
      const index = form.indexes[key]
      return index === undefined ? [] : [{ key, index, trackId, date }]
    })
    const fields: Record<string, string> = {}
    const totalRows = Number.parseInt(form.hiddenFields.TOTREG ?? '', 10) || DEFAULT_TOTAL_ROWS
    for (let index = 1; index <= totalRows; index += 1) {
      const row = mapped.find((candidate) => candidate.index === index)
      fields[`NUM_ENV${index}`] = row?.trackId || form.currentValues[`NUM_ENV${index}`] || ''
      fields[`FEC_ENV${index}`] = row?.date || form.currentValues[`FEC_ENV${index}`] || ''
      fields[`SET${index}`] = form.hiddenFields[`SET${index}`] || ''
      fields[`EST${index}`] = form.hiddenFields[`EST${index}`] || ''
    }
    const answerPage = await submitForm(
      context,
      'pe_avance3',
      at('pe_avance3'),
      formPage.url,
      {
        ...fields,
        ...company,
        TOTREG: form.hiddenFields.TOTREG || String(DEFAULT_TOTAL_ROWS),
        ACEPTAR: 'Confirmar Revisión',
      },
      at('pe_avance2'),
    )
    const answerHtml = answerPage.html
    const pages = { formHtml, answerHtml }
    const answer = classifyDeclarationAnswer(answerHtml)
    if (answer.inconsistentData !== null) return unsuccessful('inconsistent', answer.inconsistentData, pages)
    if (!answer.taken) return unsuccessful('failed', answer.error, pages)
    const declared = mapped.map((row) => row.key)
    const reread = await submitForm(
      context,
      'pe_avance2.verify',
      at('pe_avance2'),
      formPage.url,
      { ...company, ACEPTAR: 'Continuar' },
      at('pe_avance1'),
    ).catch((error: unknown) => {
      context.portal.logger.warn('certification declaration could not be verified', { reason: errorMessage(error) })
      return null
    })
    const verification =
      reread === null
        ? { inReview: [], empty: [] }
        : verifyDeclaration(
            reread.html,
            mapped.map((row) => [row.key, row.index] as const),
          )
    const inReview = verification.inReview.length > 0
    const verified = verification.empty.length === 0 || inReview
    const hasContentErrors = answer.contentErrors.length > 0
    const allRejected =
      !inReview && !hasContentErrors && verification.empty.length > 0 && verification.empty.length >= declared.length
    return {
      success: verified,
      outcome: hasContentErrors
        ? 'contentErrors'
        : allRejected
          ? 'allRejected'
          : !verified
            ? 'notSaved'
            : inReview
              ? 'inReview'
              : 'accepted',
      declared,
      verified,
      inReview,
      emptyFields: verification.empty,
      contentErrors: answer.contentErrors,
      allRejected,
      detail: hasContentErrors
        ? `ENVIO CON ERRORES O REPAROS: ${answer.contentErrors.join(', ')}`
        : verified
          ? null
          : `notSaved: ${verification.empty.join(', ')}`,
      ...pages,
      judgedHtml: answerHtml,
    }
  })

/**
 * EN: Reads the progress page as the reference does: the entry sequence, `pe_avance5`, then `pe_avance6` with the
 * company. No page on the way is searched for a refusal, and a page that names no stage and no state is still an
 * answer. While the stage reads `SIMULACION` and the page does not offer to confirm the simulation, the declaration
 * form is asked for once more and the offer looked for there; a failure of that read is ignored.
 * ES: Lee la página de avance como lo hace la referencia: la secuencia de entrada, `pe_avance5` y luego `pe_avance6`
 * con la empresa. En ninguna página del camino se busca un rechazo, y una página que no nombra etapa ni estado sigue
 * siendo una respuesta. Mientras la etapa diga `SIMULACION` y la página no ofrezca confirmar la simulación, se pide
 * una vez más el formulario de declaración y la oferta se busca ahí; un fallo de esa lectura se ignora.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the company. ES: la empresa.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the stage, the states and the rows. ES: la etapa, los estados y las filas.
 * @throws {DteError} EN: session and transport codes. ES: los códigos de sesión y de transporte.
 */
export const readProgress = (
  portal: PortalClient,
  input: { readonly companyRut?: string } = {},
  overrides?: CallOverrides,
): Promise<ProgressReport> =>
  withPortalSession(portal, 'readProgress', overrides, async (context) => {
    const company = companyFields(resolvePortalCompany(portal, input.companyRut))
    const pages = await progressPages(context, company)
    const progress = parseProgressPage(pages.progress.html)
    const onForm =
      progress.stage === SIMULATION_STAGE_WORD && !progress.simulationAwaitsConfirmation
        ? await enter(context, company).then(
            (form) => offersSimulationConfirmation(form.html),
            () => false,
          )
        : false
    return {
      stage: progress.stage,
      stageKey: progress.stageKey,
      states:
        onForm && progress.states.simulation === undefined
          ? { ...progress.states, simulation: SIMULATION_AWAITS_CONFIRMATION }
          : progress.states,
      simulationAwaitsConfirmation: progress.simulationAwaitsConfirmation || onForm,
      rows: parseCertificationSets(pages.form.html),
      receipts: progress.receipts,
    }
  })

/**
 * EN: Asks the portal to move the application to its next stage: `pe_avance4` with `TOTREG` and `PASO` as `pe_avance2`
 * holds them (`PASO` changes with the stage; a fixed value makes the SII answer "ya se encuentra en el paso"). An
 * answer saying the stage was already there is `unchanged`, not a failure.
 * ES: Pide al portal pasar la postulación a su siguiente etapa: `pe_avance4` con `TOTREG` y `PASO` tal como los trae
 * `pe_avance2` (`PASO` cambia con la etapa; un valor fijo hace que el SII responda "ya se encuentra en el paso"). Una
 * respuesta que diga que ya estaba en la etapa es `unchanged`, no una falla.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the company. ES: la empresa.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: advanced, unchanged or failed, with the sentence. ES: avanzó, sin cambio o falló, con la frase.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED`, session and transport codes. ES: los mismos códigos.
 */
export const advanceStage = (
  portal: PortalClient,
  input: { readonly companyRut?: string } = {},
  overrides?: CallOverrides,
): Promise<AdvanceResult> =>
  withPortalSession(portal, 'advanceStage', overrides, async (context) => {
    const company = companyFields(resolvePortalCompany(portal, input.companyRut))
    const formPage = await enter(context, company)
    const hidden = hiddenInputs(formPage.html)
    const page = await submitForm(
      once(context),
      'pe_avance4',
      at('pe_avance4'),
      formPage.url,
      {
        ...company,
        TOTREG: hidden.TOTREG ?? '0',
        PASO: hidden.PASO ?? DEFAULT_STEP,
        ACEPTAR: 'Avanzar Siguiente Paso',
      },
      formPage.url,
    )
    assertNotRejected(context, page.html)
    return classifyAdvanceAnswer(page.html)
  })

/**
 * EN: Lists the books the SII holds for a year (`QEstLibro`, after `DTEauth?7` binds the session to that CGI).
 * Every period listed is occupied for a new total submission.
 * ES: Lista los libros que el SII tiene para un año (`QEstLibro`, después de que `DTEauth?7` liga la sesión a ese
 * CGI). Todo período listado está ocupado para un nuevo envío total.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the year and the company. ES: el año y la empresa.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the entries and the occupied periods. ES: las entradas y los períodos ocupados.
 * @throws {DteError} EN: `INVALID_OPTION { field: 'year' }`, `SII_PORTAL_SESSION_EXPIRED`, session and transport codes. ES: los mismos códigos.
 */
export const listBookHistory = (
  portal: PortalClient,
  input: { readonly year: number; readonly companyRut?: string },
  overrides?: CallOverrides,
): Promise<BookHistory> =>
  withPortalSession(portal, 'listBookHistory', overrides, async (context) => {
    if (!Number.isInteger(input.year) || input.year < MIN_YEAR || input.year > MAX_YEAR)
      throw new DteError('INVALID_OPTION', { field: 'year' })
    const company = companyFields(resolvePortalCompany(portal, input.companyRut))
    await ensurePage(context, 'DTEauth', `${UPL_URL}DTEauth?7`)
    const query = `${UPL_URL}QEstLibro?rutCompany=${company.RUT_EMP}&dvCompany=${company.DV_EMP}&TrackId=&year=${input.year}&month=00&tipo=TODOS`
    const page = await ensurePage(context, 'QEstLibro', query)
    if (isHistoryUnauthorized(page.html)) {
      forgetSession(context)
      throw new DteError('SII_PORTAL_SESSION_EXPIRED', { operation: context.operation, step: 'QEstLibro' })
    }
    const entries = parseBookHistory(page.html)
    return { year: input.year, entries, occupiedPeriods: [...new Set(entries.map((entry) => entry.period))] }
  })

/**
 * EN: The declaration of compliance: `pe_avance7`, `pe_avance8` with the company, once more with `OK_MSG` when the
 * portal asks to continue, then the `pe_avance9` form with every option at `S` and `CONFIRMAR`, never `Salir`. A
 * block ("no ha finalizado su certificación") at any screen is data. This is the sworn statement of the legal
 * representative and cannot be undone: call it when the samples are approved.
 * ES: La declaración de cumplimiento: `pe_avance7`, `pe_avance8` con la empresa, una vez más con `OK_MSG` cuando el
 * portal pide continuar, y luego el formulario de `pe_avance9` con cada opción en `S` y `CONFIRMAR`, nunca `Salir`.
 * Un bloqueo ("no ha finalizado su certificación") en cualquier pantalla es un dato. Es la declaración jurada del
 * representante legal y no se puede deshacer: se llama cuando las muestras están aprobadas.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the company. ES: la empresa.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: declared, blocked or unconfirmed, with the sentence. ES: declarada, bloqueada o sin confirmar, con la frase.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED`, `SII_PORTAL_UNEXPECTED_PAGE` without the `pe_avance9` form, session and transport codes. ES: los mismos códigos.
 */
export const declareCompliance = (
  portal: PortalClient,
  input: { readonly companyRut?: string } = {},
  overrides?: CallOverrides,
): Promise<ComplianceResult> =>
  withPortalSession(portal, 'declareCompliance', overrides, async (context) => {
    const company = companyFields(resolvePortalCompany(portal, input.companyRut))
    const blockedOn = (page: PortalPage): ComplianceResult | null => {
      assertNotRejected(context, page.html)
      const block = complianceBlock(page.html)
      return block === null ? null : { outcome: 'blocked', message: block }
    }
    const entry = await ensurePage(context, 'pe_avance7', at('pe_avance7'))
    const second = await submitForm(
      context,
      'pe_avance8',
      at('pe_avance8'),
      entry.url,
      { ...company, ACEPTAR: 'Continuar' },
      entry.url,
    )
    const blockedAtSecond = blockedOn(second)
    if (blockedAtSecond !== null) return blockedAtSecond
    const third = hasOkMessage(second.html)
      ? await submitForm(
          once(context),
          'pe_avance8.continue',
          at('pe_avance8'),
          second.url,
          { ...hiddenInputs(second.html), Aceptar: 'Continuar con la Declaración' },
          second.url,
        )
      : second
    const blockedAtThird = blockedOn(third)
    if (blockedAtThird !== null) return blockedAtThird
    const form = complianceForm(third.html)
    if (form === null) throw unexpectedPage(context, 'pe_avance9', third.html)
    const final = await submitForm(once(context), 'pe_avance9', form.action, third.url, form.fields, third.url)
    const blockedAtFinal = blockedOn(final)
    if (blockedAtFinal !== null) return blockedAtFinal
    const message = complianceMessage(final.html)
    return { outcome: isUnconfirmed(final.html) || !isDeclared(final.html) ? 'unconfirmed' : 'declared', message }
  })
