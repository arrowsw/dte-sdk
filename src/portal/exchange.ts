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
  gwtDistinctString,
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
  /** EN: The portal's hashes, when the caller knows better than the pair known to work, which is the default; they are never looked up. ES: Los hashes del portal, si el llamador conoce otros mejores que el par que se sabe que funciona, que es el de por defecto; nunca se buscan. */
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
 * EN: Validates the user on the exchange portal: the warm-up, then `validarUsuario` with the company and
 * the certificate holder over the known hashes. The answer says whether the company stands in the exchange stage; `//OK` is not required.
 * ES: Valida al usuario en el portal de intercambio: el calentamiento y luego `validarUsuario` con la
 * empresa y el titular del certificado, sobre los hashes conocidos. La respuesta dice si la empresa está en la etapa de intercambio; no se exige `//OK`.
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
    const hashes = input.gwt ?? EXCHANGE_PORTAL.known
    const user: GwtParameter = {
      kind: 'object',
      type: USER_TYPE,
      fields: [
        GWT_NULL,
        GWT_NULL,
        GWT_NULL,
        GWT_NULL,
        gwtDistinctString(holder.verifier),
        gwtDistinctString(company.verifier),
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
    const hashes = input.gwt ?? EXCHANGE_PORTAL.known
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
