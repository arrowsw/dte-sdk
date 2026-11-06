import { SET_KEYS, type CertificationStage, type SetKey } from '../catalogs/certification'
import { DteError, errorMessage } from '../errors'
import {
  advanceStage,
  declareCompliance,
  declareProgress,
  downloadTestSet,
  readProgress,
  type DeclarationEntries,
  type DeclarationEntry,
  type DeclarationOutcome,
  type DeclarationResult,
} from '../portal/certification'
import { saysNotProcessedYet } from '../portal/pages/certification-progress'
import { queryUploadStatus } from '../sii/status'
import { uploadEnvelope } from '../sii/upload'
import { chileDate } from '../time/chile'
import {
  heldCafs,
  prepareFolios,
  registryFolioSource,
  scopeFor,
  simulationFolioNeeds,
  type HeldCaf,
} from './folios-step'
import { queryFieldUploadState, type FieldUploadState } from './field-status'
import { issueTestSet, type IssuableSetPlan, type IssuedCase } from './issue-set'
import { issueSimulation } from './simulation'
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
import { createCertificationState, type CertificationState, type EnvelopeDiagnosis, type SentCase } from './state'

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
const SIMULATION_APPROVAL_ATTEMPTS = 30
const SIMULATION_APPROVAL_INTERVAL_MS = 10000
const SIMULATION_ARTEFACT = 'simulacion/envio-simulacion.xml'
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

/**
 * EN: The entry that declares an envelope: its track id with today's Chile date, whatever day it was sent on. Internal.
 * ES: La entrada que declara un envío: su track id con la fecha de hoy en Chile, sea cual sea el día en que se envió.
 * Interno.
 */
export const entryOf = (trackId: string, now: Date): { readonly trackId: string; readonly date: string } => ({
  trackId,
  date: chileDate(now),
})

const DIAGNOSIS_CLASS = (state: FieldUploadState): string =>
  state.rejected ? 'rejected' : state.successful ? 'accepted' : state.intermediate ? 'pending' : 'unknown'

/**
 * EN: The SOAP status of every declared envelope, asked once each, for the diagnosis of a content error: never fatal.
 * The answer as it came goes to the artefacts.
 * ES: El estado SOAP de cada envío declarado, preguntado una vez por cada uno, para el diagnóstico de un error de
 * contenido: nunca fatal. La respuesta tal como llegó va a los artefactos.
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
      const state = await queryFieldUploadState(rt.sii, entry.trackId)
      if (state.raw !== null) await rt.store.writeArtefact(`${prefix}-estado-${key}-${entry.trackId}.xml`, state.raw)
      if (state.code !== null)
        diagnosis[entry.trackId] = { code: state.code, status: DIAGNOSIS_CLASS(state), message: state.message ?? '' }
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

/**
 * EN: Declares envelopes with the loop of the reference: 10 s first, then up to 10 attempts 5 s apart. A declaration
 * that stands ends the loop, unless its answer says the SII has not processed the envelopes yet. "Not processed yet"
 * is asked again (a lost session reads that way, and the next attempt logs in again). Content errors are asked again
 * while the declared fields come back empty (the SII has not seen the track ids yet); with the fields in place they
 * are diagnosed through the SOAP status and the loop ends. Every declared row empty ends the loop, unless
 * `retryOnAllRejected`. A declaration that was not saved is asked again. Anything else that failed ends the loop. The
 * last attempt returns whatever it got. Every page goes to the artefacts.
 * ES: Declara envíos con el ciclo de la referencia: 10 s primero, luego hasta 10 intentos cada 5 s. Una declaración
 * que queda en pie termina el ciclo, salvo que su respuesta diga que el SII aún no procesó los envíos. "Aún no
 * procesado" se pregunta de nuevo (una sesión perdida se lee así, y el intento siguiente vuelve a iniciar sesión).
 * Los errores de contenido se preguntan de nuevo mientras los campos declarados vuelvan vacíos (el SII aún no vio los
 * track id); con los campos en su lugar se diagnostican por el estado SOAP y el ciclo termina. Toda fila declarada
 * vacía termina el ciclo, salvo `retryOnAllRejected`. Una declaración que no se guardó se pregunta de nuevo. Cualquier
 * otra cosa que falló termina el ciclo. El último intento devuelve lo que obtuvo. Toda página va a los artefactos.
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
    await rt.store.writeArtefact(`${options.prefix}-${n}.html`, result.judgedHtml)
    await rt.store.writeArtefact(`${options.prefix}-pe_avance2-${n}.html`, result.formHtml)
    const notProcessed = saysNotProcessedYet(result.judgedHtml)
    const ended: DeclarationLoopResult = { result, attempts: n, diagnosis: {} }
    if (result.success && !notProcessed) return ended
    const more = n < DECLARATION_ATTEMPTS
    const again = async (): Promise<DeclarationLoopResult> => {
      await rt.sleep(DECLARATION_INTERVAL_MS)
      return attempt(n + 1)
    }
    if (notProcessed && more) return again()
    if (result.contentErrors.length > 0)
      return result.verified === false && more
        ? again()
        : { ...ended, diagnosis: await diagnose(rt, entries, options.prefix) }
    if (result.allRejected) return options.retryOnAllRejected === true && more ? again() : ended
    return result.verified === false && more ? again() : ended
  }
  return attempt(1)
}

/**
 * EN: What a declaration step returns: the state, the outcome in a word, and whether the declaration stands.
 * ES: Lo que devuelve un paso de declaración: el estado, el resultado en una palabra, y si la declaración quedó en pie.
 */
export type DeclarationStepResult<Outcome extends string = DeclarationOutcome> = StepResult<Outcome> & {
  /** EN: The declaration stands and the run goes on. ES: La declaración quedó en pie y la corrida sigue. */
  readonly success: boolean
}

/**
 * EN: Declares the sets sent so far with today's date, with the declaration loop; the outcome and any diagnosis go to
 * the state.
 * ES: Declara los sets enviados hasta ahora con la fecha de hoy, con el ciclo de declaración; el resultado y cualquier
 * diagnóstico van al estado.
 * @throws {DteError} EN: `MISSING_FIELD { field: 'sets' }` with nothing sent; the portal codes. ES: `MISSING_FIELD { field: 'sets' }` sin nada enviado; los códigos del portal.
 */
export const declareTestSets = async (
  deps: CertificationDependencies,
  state: CertificationState,
): Promise<DeclarationStepResult> => {
  const rt = runtime(deps)
  const today = rt.now()
  const entries: DeclarationEntries = Object.fromEntries(
    SET_KEYS.flatMap((key) => (state.sets[key] === undefined ? [] : [[key, entryOf(state.sets[key]!.trackId, today)]])),
  )
  if (Object.keys(entries).length === 0) throw new DteError('MISSING_FIELD', { field: 'sets' })
  rt.emit({ step: 'SETS_DECLARING' })
  const { result, diagnosis } = await declareWithRetries(rt, entries, {
    label: 'declaration',
    prefix: 'declaracion-sets',
  })
  if (result.success) rt.emit({ step: 'SETS_DECLARED' })
  const next = await saveState(rt, state, {
    lastDeclaration: { scope: 'sets', outcome: result.outcome, detail: result.detail, at: rt.now().toISOString() },
    diagnosis: { ...state.diagnosis, ...diagnosis },
  })
  return {
    state: next,
    outcome: result.outcome,
    success: result.success,
    ...(result.detail === null ? {} : { detail: result.detail }),
  }
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

const atLeast = (stage: CertificationStage, floor: CertificationStage): boolean =>
  STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(floor)

/**
 * EN: Sends the simulation: fresh CAFs for one folio per case (never the sets' CAFs), every case of the four sets
 * issued again in one envelope, the envelope and the documents kept as artefacts, the upload, the folios marked sent
 * whatever happened, and the track id with the Chile date of the send.
 * ES: Envía la simulación: CAF nuevos para un folio por caso (nunca los CAF de los sets), cada caso de los cuatro sets
 * reemitido en un sobre, el sobre y los documentos guardados como artefactos, el envío, los folios marcados enviados
 * pase lo que pase, y el track id con la fecha de Chile del envío.
 * @throws {DteError} EN: `MISSING_FIELD { field: 'plan' }` without a plan; the folio, 5b-1 and upload codes. ES: `MISSING_FIELD { field: 'plan' }` sin plan; los códigos de folios, de 5b-1 y de envío.
 */
export const sendSimulation = async (
  deps: CertificationDependencies,
  state: CertificationState,
): Promise<StepResult<'sent'>> => {
  const rt = runtime(deps)
  if (state.plan === undefined) throw new DteError('MISSING_FIELD', { field: 'plan' })
  rt.emit({ step: 'SIM_START' })
  const prepared = await prepareFolios(deps, state, { needs: simulationFolioNeeds(state.plan), fresh: true })
  const held = heldCafs(prepared.cafs, rt.now())
  const issued = await issueSimulation(state.plan, {
    issuer: rt.issuer,
    receiver: rt.receiver,
    certificate: rt.certificate,
    folios: registryFolioSource(rt.registry, held),
    resolution: rt.resolution,
    now: rt.now,
  })
  await rt.store.writeArtefact(SIMULATION_ARTEFACT, issued.envelope.xml)
  for (const document of issued.cases)
    await rt.store.writeArtefact(
      documentArtefactName('simulacion', document.type, document.folio),
      document.document.xml,
    )
  rt.emit({ step: 'SIM_SENDING' })
  const sentAt = rt.now().toISOString()
  const usedFolios = [...prepared.state.usedFolios, ...issued.cases.map((c) => ({ type: c.type, folio: c.folio }))]
  try {
    const receipt = await uploadEnvelope(rt.sii, { envelope: issued.envelope })
    await markSent(rt, held, issued.cases, { trackId: receipt.trackId, sentAt })
    const next = await saveState(rt, prepared.state, {
      usedFolios,
      simulation: { trackId: receipt.trackId, date: chileDate(rt.now()), sentAt },
    })
    rt.emit({ step: 'SIM_OK', trackId: receipt.trackId })
    return { state: next, outcome: 'sent' }
  } catch (error) {
    await markSent(rt, held, issued.cases, { sentAt })
    await saveState(rt, prepared.state, { usedFolios })
    throw error
  }
}

/**
 * EN: Declares the simulation, unless the portal already stands at the exchange or later. "Every row empty" is
 * retried here: the portal shows the simulation as not declared while it still processes the track id.
 * ES: Declara la simulación, salvo que el portal ya esté en el intercambio o después. "Toda fila vacía" aquí se
 * reintenta: el portal muestra la simulación sin declarar mientras aún procesa el track id.
 * @throws {DteError} EN: `MISSING_FIELD { field: 'simulation' }` before the send; the portal codes. ES: `MISSING_FIELD { field: 'simulation' }` antes del envío; los códigos del portal.
 */
export const declareSimulation = async (
  deps: CertificationDependencies,
  state: CertificationState,
): Promise<DeclarationStepResult<DeclarationOutcome | 'skipped'>> => {
  const rt = runtime(deps)
  if (state.simulation === undefined) throw new DteError('MISSING_FIELD', { field: 'simulation' })
  const report = await readProgress(rt.portal)
  if (atLeast(report.stageKey, 'exchange'))
    return {
      state: await saveState(rt, state, { stage: laterStage(state.stage, report.stageKey) }),
      outcome: 'skipped',
      success: true,
      // A stage key at the exchange or past it always comes from a wording on the page.
      detail: report.stage!,
    }
  rt.emit({ step: 'SIM_DECLARING' })
  const { result, diagnosis } = await declareWithRetries(
    rt,
    { simulation: entryOf(state.simulation.trackId, rt.now()) },
    { label: 'simulation', prefix: 'declaracion-simulacion', retryOnAllRejected: true },
  )
  const next = await saveState(rt, state, {
    lastDeclaration: {
      scope: 'simulation',
      outcome: result.outcome,
      detail: result.detail,
      at: rt.now().toISOString(),
    },
    diagnosis: { ...state.diagnosis, ...diagnosis },
  })
  return {
    state: next,
    outcome: result.outcome,
    success: result.success,
    ...(result.detail === null ? {} : { detail: result.detail }),
  }
}

/**
 * EN: Waits for the simulation: 30 polls 10 s apart of the progress page, polling first. The exchange or a later
 * stage is done; an approved simulation that awaits its confirmation is declared once more (the portal's "Confirmar
 * Revisión") and the page read again; an approved state is done; a rejected one stops. After the polls the SOAP
 * status decides: a rejected envelope is the answer (a time-out often hides one), else the wait timed out.
 * ES: Espera la simulación: 30 consultas cada 10 s a la página de avance, consultando primero. El intercambio o una
 * etapa posterior es listo; una simulación aprobada que espera su confirmación se declara una vez más (el "Confirmar
 * Revisión" del portal) y se relee la página; un estado aprobado es listo; uno rechazado detiene. Tras las consultas
 * decide el estado SOAP: un envío rechazado es la respuesta (un timeout suele esconder uno), si no, la espera venció.
 * @throws {DteError} EN: `MISSING_FIELD { field: 'simulation' }` before the send; the portal codes. ES: `MISSING_FIELD { field: 'simulation' }` antes del envío; los códigos del portal.
 */
export const waitForSimulationApproval = async (
  deps: CertificationDependencies,
  state: CertificationState,
): Promise<StepResult<'done' | 'confirmed' | 'rejected' | 'timedOut'>> => {
  const rt = runtime(deps)
  if (state.simulation === undefined) throw new DteError('MISSING_FIELD', { field: 'simulation' })
  const simulation = state.simulation
  const finish = async (
    outcome: 'done' | 'confirmed',
    stage: CertificationStage,
  ): Promise<StepResult<'done' | 'confirmed'>> => {
    const next = await saveState(rt, state, {
      stage: laterStage(state.stage, stage),
      simulation: { ...simulation, confirmed: true },
    })
    rt.emit({ step: 'SIM_DONE' })
    return { state: next, outcome }
  }
  for (let attempt = 1; attempt <= SIMULATION_APPROVAL_ATTEMPTS; attempt += 1) {
    rt.emit({ step: 'POLLING', attempt, max: SIMULATION_APPROVAL_ATTEMPTS, label: 'simulation' })
    const report = await readProgress(rt.portal)
    if (atLeast(report.stageKey, 'exchange')) return finish('done', report.stageKey)
    if (report.simulationAwaitsConfirmation) {
      await declareProgress(rt.portal, { entries: { simulation: entryOf(simulation.trackId, rt.now()) } })
      const after = await readProgress(rt.portal)
      if (
        atLeast(after.stageKey, 'exchange') ||
        after.states.simulation?.state === 'approved' ||
        !after.simulationAwaitsConfirmation
      )
        return finish('confirmed', 'exchange')
    } else {
      const item = report.states.simulation
      if (item?.state === 'approved') return finish('done', 'exchange')
      if (item?.state === 'rejected') return { state, outcome: 'rejected', detail: item.text }
    }
    await rt.sleep(SIMULATION_APPROVAL_INTERVAL_MS)
  }
  const status = await queryUploadStatus(rt.sii, { trackId: simulation.trackId }).catch(() => null)
  if (status?.status === 'rejected') {
    const next = await saveState(rt, state, {
      diagnosis: {
        ...state.diagnosis,
        [simulation.trackId]: { code: status.code, status: status.status, message: status.message },
      },
    })
    return { state: next, outcome: 'rejected', detail: `${status.code}: ${status.message}` }
  }
  return { state, outcome: 'timedOut' }
}

/**
 * EN: The end of the certification: one more advance (an "already there" with the printed samples means they are
 * still under review), then the declaration of compliance. A block leaves its sentence in the state; a final page
 * that does not confirm throws; a declaration ends the run.
 * ES: El cierre de la certificación: un avance más (un "ya está ahí" con los documentos impresos significa que siguen
 * en revisión), luego la declaración de cumplimiento. Un bloqueo deja su frase en el estado; una página final que no
 * confirma lanza; una declaración termina la corrida.
 * @throws {DteError} EN: `SII_PORTAL_UNEXPECTED_PAGE` when the final page does not confirm; the portal codes. ES: `SII_PORTAL_UNEXPECTED_PAGE` si la página final no confirma; los códigos del portal.
 */
export const declareComplianceFinal = async (
  deps: CertificationDependencies,
  state: CertificationState,
): Promise<StepResult<'declared' | 'blocked'>> => {
  const rt = runtime(deps)
  const advanced = await advanceToNextStage(deps, state)
  const result = await declareCompliance(rt.portal)
  if (result.outcome === 'blocked') {
    const next = await saveState(rt, advanced.state, {
      blocked: result.message,
      stage: laterStage(advanced.state.stage, 'compliance'),
    })
    return { state: next, outcome: 'blocked', detail: result.message }
  }
  if (result.outcome === 'unconfirmed')
    throw new DteError('SII_PORTAL_UNEXPECTED_PAGE', {
      operation: 'declareComplianceFinal',
      step: 'pe_avance9',
      portalMessage: result.message,
    })
  const { blocked, ...rest } = advanced.state
  void blocked
  const next = await saveState(rt, rest as CertificationState, { stage: 'done' })
  rt.emit({ step: 'CERT_DONE' })
  return { state: next, outcome: 'declared', detail: result.message }
}
