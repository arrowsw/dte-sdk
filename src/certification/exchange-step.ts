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
