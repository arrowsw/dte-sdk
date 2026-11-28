import type { CertificationStage } from '../catalogs/certification'
import { errorMessage, isDteError } from '../errors'
import type { PrintedSampleFile } from '../pdf/samples'
import { fetchCompanyResolution } from '../portal/company'
import { toIsoDate } from '../time/chile'
import { runBooks } from './books-step'
import { runExchange } from './exchange-step'
import { prepareFolios } from './folios-step'
import { uploadPrintedSamples } from './samples-step'
import { runtime, saveState, type CertificationDependencies, type Runtime } from './runtime'
import { createCertificationState, SENT_SET_KEYS, type CertificationState } from './state'
import {
  advanceToNextStage,
  checkExportSets,
  checkTestSetText,
  declareComplianceFinal,
  declareSimulation,
  declareTestSets,
  obtainTestSet,
  sendSimulation,
  sendTestSet,
  settleUnansweredSets,
  waitForSimulationApproval,
  waitForTestSetsApproval,
  type UnreadLinesPolicy,
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
  /** EN: The exchange set, when it was downloaded by hand from the portal. ES: El set de intercambio, cuando se descargó a mano del portal. */
  readonly exchangeSetXml?: string
  /** EN: The printed samples to upload, or a function that reads them (`readPrintedSamples`); without them the runner stops at `printedSamples`. ES: Las muestras impresas a subir, o una función que las lee (`readPrintedSamples`); sin ellas el ejecutor se detiene en `printedSamples`. */
  readonly samples?: readonly PrintedSampleFile[] | (() => Promise<readonly PrintedSampleFile[]>)
  /** EN: What the run does, before any folio is asked for, with a line of a case of a set not yet sent that the reader of the test set did not use (`checkTestSetText`, `UnreadLinesPolicy`): every such line is logged, and the run stops on any of them (`stop`), on one shaped like a row of items (`stopOnRows`, the default), or never (`warn`). ES: Qué hace la corrida, antes de pedir cualquier folio, con una línea de un caso de un set aún no enviado que el lector del set de pruebas no usó (`checkTestSetText`, `UnreadLinesPolicy`): cada línea así se registra, y la corrida se detiene ante cualquiera (`stop`), ante una con forma de fila de ítems (`stopOnRows`, por defecto), o nunca (`warn`). */
  readonly unreadLines?: UnreadLinesPolicy
  /** EN: Send again an envelope of a set or of the simulation whose upload request left for the SII in an earlier run and got no answer that could be read (`CertificationState.unanswered`), in place of issuing it anew with new folios; true by default. Before any folio is asked for, its folios are held in the folio registry for it (`FolioRegistry.hold`), and it is sent again only when they all could be, its artefact is there, its documents carry the date a document issued now would, the simulation's holds as many documents as `simulationMinimum` now asks for, the certificate of its own signature is the run's, its cover names the run's resolution, and it still verifies as the SII reads it; otherwise it is issued anew, and the portal client's logger says why (`IssuedAnewReason`). False issues anew every time, as before. ES: Enviar de nuevo un sobre de un set o de la simulación cuya petición de subida salió hacia el SII en una corrida anterior y no tuvo una respuesta legible (`CertificationState.unanswered`), en vez de emitirlo otra vez con folios nuevos; true por defecto. Antes de pedir cualquier folio, sus folios se retienen para él en el registro de folios (`FolioRegistry.hold`), y se envía de nuevo solo cuando todos se pudieron retener, su artefacto está, sus documentos llevan la fecha que llevaría un documento emitido ahora, el de la simulación trae tantos documentos como pide ahora `simulationMinimum`, el certificado de su propia firma es el de la corrida, su carátula nombra la resolución de la corrida, y aún verifica como lo lee el SII; si no, se emite otra vez, y el logger del cliente del portal dice por qué (`IssuedAnewReason`). False emite otra vez cada vez, como antes. */
  readonly resendUnanswered?: boolean
  /** EN: The fewest documents the envelope of the simulation holds: a pass over the plan that holds fewer is repeated whole until it does, never past 100 (`issueSimulation`, `minimumDocuments`); 20 by default, what the "Declarar avance" form takes as field behaviour, and 0 issues one pass. ES: La menor cantidad de documentos que trae el sobre de la simulación: una pasada por el plan que trae menos se repite entera hasta alcanzarla, nunca más de 100 (`issueSimulation`, `minimumDocuments`); 20 por defecto, lo que toma el formulario "Declarar avance" como comportamiento de campo, y 0 emite una pasada. */
  readonly simulationMinimum?: number
  /** EN: Send the books of the test set as regular ones, as the run did before: the sales and purchase books `MENSUAL` with no notification folio, the guide book with folio 3 (`runBooks`). By default each book is `ESPECIAL` with the attention number of its own set as its notification folio, as the SII's review takes them. ES: `TipoLibro`, `FolioNotificacion` — Enviar los libros del set de pruebas como regulares, como lo hacía la corrida antes: los de ventas y de compras `MENSUAL` sin folio de notificación, el de guías con folio 3 (`runBooks`). Por defecto cada libro es `ESPECIAL` con el número de atención de su propio set como folio de notificación, como los toma la revisión del SII. */
  readonly monthlyBooks?: boolean
  /** EN: Answer the exchange set with a receipt of goods for every document, the ones addressed to another RUT included, as the run did before; by default only the documents addressed to the company get one, as field behaviour passes the stage. ES: `Recibo` — Responder el set de intercambio con un recibo de mercaderías por cada documento, también los dirigidos a otro RUT, como lo hacía la corrida antes; por defecto solo los documentos dirigidos a la empresa llevan uno, como el comportamiento de campo supera la etapa. */
  readonly receiptsForEveryDocument?: boolean
}

/**
 * EN: Why the runner stopped. `done` is the declaration of compliance made; `exchange` is the set unavailable or the
 * company not in the exchange (the detail says which); `printedSamples` is the samples waiting for the `samples`
 * option; `compliance` is the declaration waiting for `declareCompliance: true`; `until` is the stage asked for; the
 * rest name what the SII or the portal refused, left incomplete or never answered.
 * ES: Por qué se detuvo el ejecutor. `done` es la declaración de cumplimiento hecha; `exchange` es el set no disponible
 * o la empresa fuera del intercambio (el detalle dice cuál); `printedSamples` son las muestras a la espera de la
 * opción `samples`; `compliance` es la declaración a la espera de `declareCompliance: true`; `until` es la etapa
 * pedida; el resto nombra lo que el SII o el portal rechazó, dejó incompleto o nunca respondió.
 */
export type RunStop =
  | 'done'
  | 'exchange'
  | 'printedSamples'
  | 'compliance'
  | 'until'
  | 'blocked'
  | 'rejected'
  | 'timedOut'
  | 'incomplete'

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

// The stages that still send an envelope, and so write a cover.
const WRITES_COVER: readonly CertificationStage[] = ['testSets', 'books', 'simulation']
const NOT_READ = 'certification resolution not read from the SII'
const SELF_SIGNED = 'certification certificate is self-signed: the SII takes no seed it signs'

// The cover of an envelope names the resolution of the company in the environment it goes to, and the SII refuses an
// envelope that names another ("Error en Carátula"). The portal shows the date of the one of the certification
// environment, so a run that is given no date reads it there; its number is the caller's, or 0, which is the number
// of that environment whatever the page shows. When the portal shows no date, shows one that is not a date, or its
// page cannot be read, the run goes on as it did, with the UTC day it starts on, and says so in the client's logger:
// the reading never stops a run. An error that is not the portal's is no unreadable page, and is not swallowed.
const resolutionOf = async (
  rt: Runtime,
  resolution: CertificationDependencies['resolution'],
  companyRut: string,
): Promise<Runtime['resolution']> => {
  if (resolution?.date) return rt.resolution
  try {
    const shown = await fetchCompanyResolution(rt.portal, { companyRut, environment: 'certification' })
    if (shown.resolutionDate !== null)
      return { number: rt.resolution.number, date: toIsoDate(shown.resolutionDate, 'resolution.date') }
    rt.portal.logger.warn(NOT_READ, { reason: 'the page shows no date' })
  } catch (error) {
    if (!isDteError(error)) throw error
    rt.portal.logger.warn(NOT_READ, { error: errorMessage(error) })
  }
  return rt.resolution
}

/**
 * EN: The HTML side of the certification, in the field's order, resumed from the saved state: the test set (downloaded
 * once), the lines of the set the reader did not use, logged or, by `unreadLines`, a stop (`checkTestSetText`), the
 * check of the export sets the text holds (`checkExportSets`), the folios, each set not yet sent (the
 * settlement and the two export sets last, each export set in an envelope of its own), their declaration and approval;
 * the books; the advance; the simulation
 * sent, declared and confirmed; the exchange set answered, uploaded and confirmed; the printed samples uploaded and
 * submitted when the `samples` option gives them (else it stops there); and then it declares compliance, only with
 * `declareCompliance: true`, because that declaration cannot be undone. Nothing is repeated: a set with a track id is
 * not sent again, a book approved is skipped, a confirmed exchange is not answered again. A refusal, a block or a
 * time-out comes back as data with the state saved; a `DteError` of the portal, of the SII or of the folios propagates
 * after the state is saved, with a `CERT_ERROR` event. Every envelope of documents is checked as the SII reads it
 * (`verifyTransmittedEnvelope`) before it is handed to `beforeUpload` and sent. An envelope of a set or of the
 * simulation that an earlier run kept with no track id from the SII is sent again, asking for no folio, when it is safe
 * (`resendUnanswered`); the envelopes of the sets that will not be are dropped before the folios of the sets are asked
 * for, so their sets get folios to be issued anew with. A self-signed signing certificate is said once, when the run
 * starts, in the portal client's logger.
 * ES: El lado HTML de la certificación, en el orden del campo, retomado desde el estado guardado: el set de pruebas
 * (descargado una vez), las líneas del set que el lector no usó, registradas o, según `unreadLines`, una detención
 * (`checkTestSetText`), la revisión de los sets de exportación que trae el texto (`checkExportSets`), los folios, cada
 * set aún no enviado (el de liquidación y los dos de exportación al final, cada set de exportación en su propio sobre),
 * su declaración y aprobación; los libros; el avance; la
 * simulación enviada, declarada y confirmada; el set de intercambio respondido, subido y confirmado; las muestras
 * impresas subidas y enviadas cuando la opción `samples` las da (si no, se detiene ahí); y luego declara cumplimiento,
 * solo con `declareCompliance: true`, porque esa declaración no se puede deshacer. Nada se repite: un set con track id
 * no se vuelve a enviar, un libro aprobado se omite, un intercambio confirmado no se responde de nuevo. Un rechazo, un
 * bloqueo o un timeout vuelven como datos con el estado guardado; un `DteError` del portal, del SII o de los folios se
 * propaga después de guardar el estado, con un evento `CERT_ERROR`. Cada sobre de documentos se chequea como lo lee el
 * SII (`verifyTransmittedEnvelope`) antes de entregarlo a `beforeUpload` y enviarlo. Un sobre de un set o de la
 * simulación que una corrida anterior guardó sin track id del SII se envía de nuevo, sin pedir folios, cuando es
 * seguro (`resendUnanswered`); los sobres de los sets que no se enviarán se quitan antes de pedir los folios de los
 * sets, así sus sets reciben folios con que emitirse otra vez. Un certificado de firma autofirmado se dice una vez, al
 * empezar la corrida, en el logger del cliente del portal.
 * @param dependencies EN: the dependencies. ES: las dependencias.
 * @param options EN: where to stop, which optional sets, the exchange set and the samples. ES: dónde detenerse, qué sets opcionales, el set de intercambio y las muestras.
 * @returns EN: the state and why it stopped. ES: el estado y por qué se detuvo.
 * @throws {DteError} EN: the codes of every step. ES: los códigos de cada paso.
 */
export const runCertification = async (
  dependencies: CertificationDependencies,
  options: RunCertificationOptions = {},
): Promise<RunCertificationResult> => {
  const rt = runtime(dependencies)
  // Field behaviour: the SII takes no seed signed with a certificate no authority it knows issued. It is said, not
  // refused: whether the SII knows the authority is the SII's to say.
  if (rt.certificate.selfSigned) rt.portal.logger.warn(SELF_SIGNED)
  const companyRut = rt.portal.companyRut ?? rt.issuer.rut
  let state = (await rt.store.load()) ?? createCertificationState(companyRut, rt.now())
  // A resolution left out is settled once, when the run starts: every envelope of the run carries it, whatever day its
  // step begins on. A run resumed where no envelope is left to send asks the portal for nothing.
  const resolution = WRITES_COVER.includes(state.stage)
    ? await resolutionOf(rt, dependencies.resolution, companyRut)
    : rt.resolution
  const deps: CertificationDependencies = { ...dependencies, resolution }
  const stop = (stopped: RunStop, detail?: string): RunCertificationResult => ({
    state,
    stopped,
    ...(detail === undefined ? {} : { detail }),
  })
  const resendOption = options.resendUnanswered === undefined ? {} : { resendUnanswered: options.resendUnanswered }
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
      // A line of the set the reader did not use is shown, and by `unreadLines` stops the run, before any folio.
      await checkTestSetText(deps, state, options.unreadLines === undefined ? {} : { unreadLines: options.unreadLines })
      // An export set that cannot be issued stops the run before its folios are asked for.
      await checkExportSets(deps, state)
      // An envelope kept from an earlier run is settled before the folios: one sent again needs none. With
      // `resendUnanswered` false the settling drops them all, so the sends below find none to send again.
      state = await settleUnansweredSets(deps, state, resendOption)
      state = (await prepareFolios(deps, state)).state
      for (const kind of SENT_SET_KEYS) {
        if (state.plan![kind] === undefined || state.sets[kind] !== undefined) continue
        state = (await sendTestSet(deps, state, { kind })).state
      }
      const declared = await declareTestSets(deps, state)
      state = declared.state
      if (!declared.success) return stop('rejected', declared.detail)
      const approval = await waitForTestSetsApproval(deps, state)
      state = approval.state
      if (approval.outcome !== 'approved') return stop(approval.outcome, approval.detail)
    }
    if (reachedUntil()) return stop('until')
    if (state.stage === 'books') {
      const books = await runBooks(
        deps,
        state,
        options.monthlyBooks === undefined ? {} : { monthlyBooks: options.monthlyBooks },
      )
      state = books.state
      // With the three mandatory books sent the next stage is asked for, approved or not: the portal decides.
      if (books.outcome === 'incomplete') return stop('incomplete', books.detail)
      const advance = await advanceToNextStage(deps, state)
      state = advance.state
      if (advance.outcome === 'timedOut') return stop('timedOut', advance.detail)
      // An advance the portal made with a wording the page module does not know leaves the stage where it was.
      if (advance.outcome === 'advanced' && state.stage === 'books')
        state = await saveState(rt, state, { stage: 'simulation' })
      // The portal did not move and does not stand past the books: the simulation would find no row to declare.
      if (state.stage === 'books') return stop('rejected', advance.detail)
    }
    if (reachedUntil()) return stop('until')
    if (state.stage === 'simulation') {
      if (state.simulation === undefined)
        state = (
          await sendSimulation(deps, state, {
            ...resendOption,
            ...(options.simulationMinimum === undefined ? {} : { simulationMinimum: options.simulationMinimum }),
          })
        ).state
      if (state.simulation!.confirmed !== true) {
        const declared = await declareSimulation(deps, state)
        state = declared.state
        if (!declared.success) return stop('rejected', declared.detail)
        const approval = await waitForSimulationApproval(deps, state)
        state = approval.state
        if (approval.outcome === 'rejected' || approval.outcome === 'timedOut')
          return stop(approval.outcome, approval.detail)
      }
      if (state.stage === 'simulation') state = await saveState(rt, state, { stage: 'exchange' })
    }
    if (reachedUntil()) return stop('until')
    if (state.stage === 'exchange') {
      const exchange = await runExchange(deps, state, {
        ...(options.exchangeSetXml === undefined ? {} : { setXml: options.exchangeSetXml }),
        ...(options.receiptsForEveryDocument === undefined
          ? {}
          : { receiptsForEveryDocument: options.receiptsForEveryDocument }),
      })
      state = exchange.state
      if (exchange.outcome === 'setUnavailable' || exchange.outcome === 'notInExchange')
        return stop('exchange', exchange.detail)
      if (state.stage === 'exchange') state = await saveState(rt, state, { stage: 'printedSamples' })
    }
    if (reachedUntil()) return stop('until')
    if (state.stage === 'printedSamples') {
      if (options.samples === undefined) return stop('printedSamples')
      const samples = typeof options.samples === 'function' ? await options.samples() : options.samples
      const uploaded = await uploadPrintedSamples(deps, state, { samples })
      state = uploaded.state
      if (uploaded.outcome === 'blocked' || uploaded.outcome === 'rejected')
        return stop(uploaded.outcome, uploaded.detail)
      // A submitted review, now or earlier, leaves the stage at the compliance.
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
