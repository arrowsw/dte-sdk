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
