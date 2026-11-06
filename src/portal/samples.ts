import { SAMPLES_PORTAL } from '../catalogs/certification'
import { DteError, errorMessage, isDteError } from '../errors'
import { splitSiiRut } from '../model/rut'
import type { CallOverrides } from '../sii/client'
import { redactText } from '../sii/capture'
import { buildMultipartParts, multipartContentType } from '../sii/multipart'
import { bodyExcerpt } from '../sii/operation'
import { resolvePortalCompany, type PortalClient } from './client'
import { bodyText } from './html'
import {
  gwtBoolean,
  gwtLong,
  gwtString,
  inGwtStage,
  portalBoundary,
  postGwt,
  withGwtStage,
  type GwtHashes,
  type GwtStage,
  type GwtStageSpec,
} from './gwt'
import {
  reviewId,
  reviewSentAt,
  reviewState,
  sampleDetails,
  type ReviewState,
  type SampleDetail,
} from './pages/samples'
import { portalRequest, rejected, unexpectedPage, type PortalContext, type PortalPage } from './session'

const NO_CACHE: Readonly<Record<string, string>> = { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }
const FILE_FIELD = 'Filedata'
// The name travels as it comes in the multipart `filename`; only what would end the header or its quoted value early
// is refused.
const BREAKS_FILE_NAME = /[\r\n"]/
const FILE_CONTENT_TYPE = 'application/octet-stream'
const MAX_UPLOAD_ATTEMPTS = 4
const UPLOAD_WAIT_MS = 2000
const SERVER_ERROR = 500
const CLIENT_ERROR = 400

// What the samples portal gets from every request of the stage, and nothing besides what the call names: the field's
// browser line, its accept list, the keep-alive, and the origin and the referer of the portal itself.
const SAMPLES_STAGE: GwtStageSpec = {
  portal: SAMPLES_PORTAL,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    Accept: '*/*',
    Connection: 'keep-alive',
    Origin: 'https://www4.sii.cl',
    Referer: SAMPLES_PORTAL.base,
  },
  discoverHashes: true,
}

/**
 * EN: Runs `run` in one stage of the samples portal: the session made sure of, one warm-up, the hashes looked up once,
 * and every call that is given the stage sent once over it. The whole printed samples stage is one stage in the field:
 * the reading, the creation, every PDF, the submission, the re-reading and the detail.
 * ES: Ejecuta `run` en una etapa del portal de muestras: la sesión asegurada, un calentamiento, los hashes buscados una
 * vez, y cada llamada que recibe la etapa enviada una vez sobre ella. Toda la etapa de muestras impresas es una etapa en
 * el campo: la lectura, la creación, cada PDF, el envío, la relectura y el detalle.
 * @throws {DteError} EN: session, block and transport codes, and whatever `run` throws. ES: códigos de sesión, bloqueo y transporte, y lo que lance `run`.
 */
export const withSamplesStage = <T>(
  portal: PortalClient,
  operation: string,
  overrides: CallOverrides | undefined,
  run: (stage: GwtStage) => Promise<T>,
): Promise<T> => withGwtStage(portal, operation, overrides, SAMPLES_STAGE, undefined, run)

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
  /** EN: The stage to run in, from `withSamplesStage`; the call opens a stage of its own without one. ES: La etapa en que correr, de `withSamplesStage`; sin ella la llamada abre una etapa propia. */
  readonly stage?: GwtStage
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
  /** EN: The stage to run in, from `withSamplesStage`. ES: La etapa en que correr, de `withSamplesStage`. */
  readonly stage?: GwtStage
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
  /** EN: The stage to run in, from `withSamplesStage`. ES: La etapa en que correr, de `withSamplesStage`. */
  readonly stage?: GwtStage
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
export const readSamplesReview = async (
  portal: PortalClient,
  input: SamplesCompanyInput = {},
  overrides?: CallOverrides,
): Promise<SamplesReview> => {
  const company = resolvePortalCompany(portal, input.companyRut)
  return inGwtStage(portal, 'readSamplesReview', overrides, SAMPLES_STAGE, input, async ({ context, hashes }) => {
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
}

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
export const createSamplesReview = async (
  portal: PortalClient,
  input: SamplesCompanyInput = {},
  overrides?: CallOverrides,
): Promise<SamplesReviewCreated> => {
  const { body: digits, verifier } = splitSiiRut(resolvePortalCompany(portal, input.companyRut))
  return inGwtStage(portal, 'createSamplesReview', overrides, SAMPLES_STAGE, input, async ({ context, hashes }) => {
    const { page, answer } = await call(context, 'creaLista', hashes, [
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
}

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
 * @throws {DteError} EN: `INVALID_OPTION { field: 'fileName' }` when the name holds a CR, an LF or a double quote; `SII_PORTAL_REJECTED { rejection: 'sampleUploadRefused', file, httpStatus }` on a 4xx; `SII_HTTP_ERROR` on the last 5xx; `SII_PORTAL_UNEXPECTED_PAGE` on any other status; session, block and transport codes. ES: los mismos códigos.
 */
export const uploadSample = async (
  portal: PortalClient,
  input: UploadSampleInput,
  overrides?: CallOverrides,
): Promise<SampleUploaded> => {
  if (BREAKS_FILE_NAME.test(input.fileName)) throw new DteError('INVALID_OPTION', { field: 'fileName' })
  return inGwtStage(portal, 'uploadSample', overrides, SAMPLES_STAGE, input, async ({ context, hashes }) => {
    const boundary = portalBoundary(portal.now())
    // The field writes the part headers, the file name among them, as UTF-8.
    const body = buildMultipartParts({
      boundary,
      utf8Headers: true,
      parts: [
        { name: FILE_FIELD, fileName: input.fileName, contentType: FILE_CONTENT_TYPE, bytes: input.bytes },
        { name: 'id', value: String(input.revisionId) },
        { name: 'ambiente', value: 'false' },
      ],
    })
    return uploadOnce(context, input, hashes, body, boundary, 1)
  })
}

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
  inGwtStage(portal, 'submitSamplesReview', overrides, SAMPLES_STAGE, input, async ({ context, hashes }) => {
    const { page, answer } = await call(context, 'solicitaRevisionSII', hashes, [
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
export const readSamplesDetail = async (
  portal: PortalClient,
  input: SamplesReviewInput,
  overrides?: CallOverrides,
): Promise<SamplesDetail> => {
  try {
    return await inGwtStage(
      portal,
      'readSamplesDetail',
      overrides,
      SAMPLES_STAGE,
      input,
      async ({ context, hashes }) => {
        const { page } = await call(context, 'muestraMail', hashes, [gwtLong(input.revisionToken)])
        return { rows: sampleDetails(page.html), body: page.html }
      },
    )
  } catch (error) {
    portal.logger.warn('sii samples detail unavailable', { reason: errorMessage(error) })
    return { rows: [], body: '' }
  }
}
