import { DteError, errorMessage } from '../errors'
import type { PrintedSampleFile } from '../pdf/samples'
import type { GwtHashes } from '../portal/gwt'
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

// The review was sent: not being able to read its state again does not undo that, so the state is left unknown.
const readStateAfterSubmission = async (
  rt: Runtime,
  companyRut: string,
  gwt: GwtHashes,
): Promise<SamplesReview | null> => {
  try {
    return await readSamplesReview(rt.portal, { companyRut, gwt })
  } catch (error) {
    rt.portal.logger.warn('sii samples state unreadable after the submission', { reason: errorMessage(error) })
    return null
  }
}

/**
 * EN: The printed samples stage: the review read (a block or a review already sent end here; none yet is created), resumed when it stands
 * in `INGRESO` with a readable id or created otherwise, every PDF uploaded in order (each name saved as it goes), the
 * review submitted, and its state read again (a failed reading is warned about and leaves the state unknown): `RECHAZADO` brings the detail and its summary. Every portal answer is
 * kept under `muestras/`.
 * ES: La etapa de muestras impresas: la revisión leída (un bloqueo o una revisión ya enviada terminan aquí), retomada
 * cuando está en `INGRESO` con un id legible o creada si no, cada PDF subido en orden (cada nombre guardado sobre la
 * marcha), la revisión enviada, y su estado leído de nuevo (una lectura fallida se advierte y deja el estado desconocido): `RECHAZADO` trae el detalle y su resumen. Cada respuesta
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
  const after = await readStateAfterSubmission(rt, companyRut, gwt)
  if (after !== null) await rt.store.writeArtefact(artefact('pdfte-estado-post-envio.html'), after.body)
  const sent: SamplesState = { ...opened, uploaded: current.uploaded, submittedAt: rt.now().toISOString() }
  const afterState = after === null ? null : after.state
  if (afterState === REJECTED) {
    const detail = await readSamplesDetail(rt.portal, { revisionToken: target.revisionToken, gwt })
    if (detail.body !== '') await rt.store.writeArtefact(artefact('pdfte-detalle-revision.html'), detail.body)
    const summary = detail.rows.length === 0 ? NO_DETAIL : summarizeSampleDetails(detail.rows)
    const next = await saveState(rt, current.state, {
      samples: { ...sent, state: REJECTED, detail: detail.rows, summary },
    })
    return finish(rt, next, 'rejected', false, summary)
  }
  const next = await saveState(rt, current.state, {
    samples: { ...sent, state: afterState },
    stage: laterStage(current.state.stage, 'compliance'),
  })
  return finish(rt, next, 'submitted', true, afterState ?? 'submitted')
}
