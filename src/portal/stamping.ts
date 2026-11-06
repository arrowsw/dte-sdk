import { parseCaf, type Caf } from '../caf/parse'
import { isDocumentType, type DocumentType } from '../catalogs/document-types'
import { cgiUrl, type PortalRejection } from '../catalogs/portal'
import { DteError, isDteError } from '../errors'
import type { CallOverrides } from '../sii/client'
import { resolvePortalCompany, type PortalClient } from './client'
import { formAction, inputValues } from './html'
import { asksForAuthentication, looksLikeLoginRedirect, portalMessageOf } from './pages/auth'
import {
  authorizedRange,
  exceedsEffectiveMaximum,
  hardRejection,
  hasCaf,
  hasCaptcha,
  hasDownloadError,
  mentionsAuthorizedRange,
  offersDocumentType,
  quotaFields,
  stampableTypes,
  stampingBlockReason,
  type QuotaFields,
  type StampableType,
} from './pages/stamping'
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

const ENTRY = 'of_solicita_folios'
const SELECTOR = 'of_solicita_folios_dcto'
const CONFIRM = 'of_confirma_folio'
const GENERATE = 'of_genera_folio'
const DOWNLOAD = 'of_genera_archivo'
const PATH = '/cvc_cgi/dte/'
// Requests on one certificate stay this far apart, without keeping any state: the lock is held for this long afterwards.
const REQUEST_SPACING_MS = 1001
const DOWNLOAD_RETRY_STEP_MS = 3000
const DOWNLOAD_RETRIES = 3

/**
 * EN: A CAF obtained from the portal. `xml` holds the CAF private key: store it as a secret.
 * ES: Un CAF obtenido del portal. `xml` contiene la llave privada del CAF: guárdalo como un secreto.
 */
export type ObtainedCaf = {
  /** EN: The file as the SII served it. ES: `AUTORIZACION` — El archivo tal como lo entregó el SII. */
  readonly xml: string
  /** EN: The file parsed. ES: El archivo parseado. */
  readonly caf: Caf
  /** EN: Folios it covers. ES: Folios que cubre. */
  readonly granted: number
  /** EN: Most folios the SII authorized, or null when it was not rationing. ES: `MAX_AUTOR` — Máximo que autorizó el SII, o null si no estaba racionando. */
  readonly maxAuthorized: number | null
  /** EN: Stamped and unused folios, or null when it was not rationing. ES: `FOLIOS_DISP` — Folios timbrados sin usar, o null si no estaba racionando. */
  readonly availableFolios: number | null
  /** EN: It came back through "ya fue autorizado" or the re-download flow. ES: Volvió por "ya fue autorizado" o por la reobtención. */
  readonly recovered: boolean
}

/**
 * EN: The stamping quota of a document type.
 * ES: El cupo de timbraje de un tipo de documento.
 */
export type FolioQuota = QuotaFields & {
  /** EN: The SII is not rationing this type. ES: El SII no está racionando este tipo. */
  readonly unrestricted: boolean
  /** EN: The SII authorizes nothing: "NO SE AUTORIZA TIMBRAJE". ES: El SII no autoriza nada: "NO SE AUTORIZA TIMBRAJE". */
  readonly blocked: boolean
}

/**
 * EN: Input of `requestCaf`.
 * ES: Entrada de `requestCaf`.
 */
export type CafRequestInput = {
  /** EN: Document type. ES: `COD_DOCTO` — Tipo de documento. */
  readonly type: DocumentType
  /** EN: Folios wanted. ES: `CANTIDAD` — Folios pedidos. */
  readonly quantity: number
  /** EN: Least acceptable: below it nothing is stamped, because a short range goes unused and lowers the next maximum. ES: Mínimo aceptable: bajo él no se timbra, porque un rango corto queda sin usar y baja el próximo máximo. */
  readonly minQuantity?: number
  /** EN: Company RUT; the client's by default. ES: `RUT_EMP` + `DV_EMP` — RUT de la empresa; por defecto el del cliente. */
  readonly companyRut?: string
}

type Company = ReturnType<typeof companyFields>

const at = (context: PortalContext, page: string): string => cgiUrl(context.portal.environment, page)

const sessionExpired = (context: PortalContext, step: string): DteError => {
  forgetSession(context)
  return new DteError('SII_PORTAL_SESSION_EXPIRED', { operation: context.operation, step })
}

const mustAuthenticate = (html: string): boolean => asksForAuthentication(html) || looksLikeLoginRedirect(html)

const assertDocumentType = (type: unknown): void => {
  if (!isDocumentType(type)) throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type' })
}

const assertQuantity = (value: number, field: string): void => {
  if (!Number.isInteger(value) || value < 1) throw new DteError('INVALID_OPTION', { field })
}

const startRequest = async (
  context: PortalContext,
  type: number,
  quantity: number,
  company: Company,
): Promise<PortalPage> => {
  const form = await ensurePage(context, ENTRY, at(context, ENTRY))
  if (mustAuthenticate(form.html)) return form
  return submitForm(context, `${ENTRY}.post`, formAction(form.html) ?? `${PATH}${ENTRY}`, form.url, {
    ...inputValues(form.html),
    ...company,
    COD_DOCTO: String(type),
    CANTIDAD: String(quantity),
  })
}

type QuotaStep = { readonly page: PortalPage; readonly atQuota: boolean }

// The word `of_solicita_folios_dcto` may only be inside a script: the real form action is what says where to go. With
// the selector, `CANT_DOCTOS` goes empty: a number there makes the SII omit `MAX_AUTOR` and `CONTROL` and reject later.
const reachQuotaForm = async (
  context: PortalContext,
  page: PortalPage,
  type: number,
  company: Company,
): Promise<QuotaStep> => {
  if (hardRejection(page.html) !== null) return { page, atQuota: false }
  const action = formAction(page.html)
  if (action?.includes(CONFIRM)) return { page, atQuota: true }
  if (!page.html.includes(SELECTOR)) return { page, atQuota: false }
  const second = await submitForm(context, SELECTOR, action ?? `${PATH}${SELECTOR}`, page.url, {
    ...inputValues(page.html),
    ...company,
  })
  if (hardRejection(second.html) !== null) return { page: second, atQuota: false }
  if (!second.html.includes('COD_DOCTO')) return { page: second, atQuota: true }
  if (!offersDocumentType(second.html, type))
    throw rejected(context, 'typeNotEnabled', { type, portalMessage: portalMessageOf(second.html) })
  const third = await submitForm(context, `${SELECTOR}.type`, `${PATH}${SELECTOR}`, second.url, {
    ...inputValues(second.html),
    ...company,
    COD_DOCTO: String(type),
    CANT_DOCTOS: '',
  })
  return { page: third, atQuota: hardRejection(third.html) === null }
}

const retryDownload = async (
  context: PortalContext,
  page: PortalPage,
  action: string,
  fields: Readonly<Record<string, string>>,
  attempt: number,
): Promise<PortalPage> => {
  if (hasCaf(page.html) || !hasDownloadError(page.html) || attempt > DOWNLOAD_RETRIES) return page
  await context.portal.sleep(attempt * DOWNLOAD_RETRY_STEP_MS, context.overrides?.signal)
  const next = await submitForm(context, `${DOWNLOAD}.retry`, action, page.url, fields)
  return retryDownload(context, next, action, fields, attempt + 1)
}

const download = async (context: PortalContext, page: PortalPage): Promise<PortalPage> => {
  const action = formAction(page.html) ?? `${PATH}${DOWNLOAD}`
  const fields = { ...inputValues(page.html), ACEPTAR: 'AQUI' }
  const first = await submitForm(context, DOWNLOAD, action, page.url, fields)
  const settled = await retryDownload(context, first, action, fields, 1)
  if (hasCaf(settled.html) || !settled.html.includes(DOWNLOAD)) return settled
  return submitForm(context, `${DOWNLOAD}.extra`, formAction(settled.html) ?? `${PATH}${DOWNLOAD}`, settled.url, {
    ...inputValues(settled.html),
    ACEPTAR: 'AQUI',
  })
}

const generate = async (context: PortalContext, page: PortalPage): Promise<PortalPage> => {
  const fields = inputValues(page.html)
  const maximum = Number.parseInt(fields.MAX_AUTOR || '999', 10)
  const first = Number.parseInt(fields.FOLIO_INI || '1', 10)
  const quantity = Math.min(Number.parseInt(fields.CANT_DOCTOS || '1', 10), maximum)
  const answer = await submitForm(context, GENERATE, formAction(page.html) ?? `${PATH}${GENERATE}`, page.url, {
    ...fields,
    CANT_DOCTOS: String(quantity),
    FOLIO_FIN: String(first + quantity - 1),
    ACEPTAR: 'Obtener Folios',
  })
  if (mentionsAuthorizedRange(answer.html) || hasCaf(answer.html) || !answer.html.includes(DOWNLOAD)) return answer
  return download(context, answer)
}

const confirm = async (context: PortalContext, page: PortalPage): Promise<PortalPage> => {
  const fields = inputValues(page.html)
  const answer = await submitForm(
    context,
    `${CONFIRM}.initial`,
    formAction(page.html) ?? `${PATH}${CONFIRM}`,
    page.url,
    {
      ...fields,
      FOLIO_INICIAL: fields.FOLIO_INICIAL || '1',
      ACEPTAR: 'Confirmar Folio Inicial',
    },
  )
  return answer.html.includes(GENERATE) ? generate(context, answer) : answer
}

const stamp = async (
  context: PortalContext,
  page: PortalPage,
  input: { readonly type: number; readonly quantity: number },
  quota: QuotaFields,
  company: Company,
): Promise<PortalPage> => {
  const quantity = quota.maxAuthorized === null ? input.quantity : Math.min(input.quantity, quota.maxAuthorized)
  const answer = await submitForm(context, CONFIRM, formAction(page.html) ?? `${PATH}${CONFIRM}`, page.url, {
    ...inputValues(page.html),
    ...company,
    COD_DOCTO: String(input.type),
    CANT_DOCTOS: String(quantity),
    ACEPTAR: 'Solicitar Numeración',
  })
  if (answer.html.includes(CONFIRM)) return confirm(context, answer)
  return answer.html.includes(GENERATE) ? generate(context, answer) : answer
}

const obtained = (page: PortalPage, quota: QuotaFields, recovered: boolean): ObtainedCaf => {
  const caf = parseCaf(page.html)
  return {
    xml: page.html,
    caf,
    granted: caf.range.to - caf.range.from + 1,
    maxAuthorized: quota.maxAuthorized,
    availableFolios: quota.availableFolios,
    recovered,
  }
}

const rejectionDetails = (rejection: PortalRejection, html: string, type: number, quota: QuotaFields) => ({
  type,
  portalMessage: (rejection === 'stampingBlocked' ? stampingBlockReason(html) : null) ?? portalMessageOf(html),
  maxAuthorized: quota.maxAuthorized,
  availableFolios: quota.availableFolios,
})

// The SII has the range and only the file was lost: a late download often still answers it.
const recoverAuthorizedRange = async (
  context: PortalContext,
  page: PortalPage,
  type: number,
  quota: QuotaFields,
  company: Company,
): Promise<ObtainedCaf> => {
  const range = authorizedRange(page.html)
  const refusal = rejected(context, 'rangeAlreadyAuthorized', {
    type,
    range,
    portalMessage: portalMessageOf(page.html),
  })
  if (range === null) throw refusal
  const answer = await submitForm(context, `${DOWNLOAD}.recover`, at(context, DOWNLOAD), page.url, {
    ...company,
    COD_DOCTO: String(type),
    FOLIO_INI: String(range.from),
    FOLIO_FIN: String(range.to),
    // The day of the instant in UTC, not in Chile: it is what field behaviour sends and the SII accepts.
    FECHA: context.portal.now().toISOString().slice(0, 10),
    ACEPTAR: 'AQUI',
  }).catch((error: unknown) => {
    context.portal.logger.warn('sii portal could not recover an authorized range', { operation: context.operation })
    if (isDteError(error)) return null
    throw error
  })
  if (answer === null || !hasCaf(answer.html)) throw refusal
  return obtained(answer, quota, true)
}

const concludeRequest = async (
  context: PortalContext,
  page: PortalPage,
  input: CafRequestInput,
  quota: QuotaFields,
  company: Company,
): Promise<ObtainedCaf> => {
  const { html } = page
  if (hasCaptcha(html))
    throw new DteError('SII_PORTAL_BLOCKED', {
      operation: context.operation,
      step: CONFIRM,
      httpStatus: page.status,
      portalMessage: portalMessageOf(html),
    })
  if (hasCaf(html)) return obtained(page, quota, false)
  const rejection = hardRejection(html)
  if (rejection !== null) throw rejected(context, rejection, rejectionDetails(rejection, html, input.type, quota))
  if (asksForAuthentication(html)) throw sessionExpired(context, CONFIRM)
  if (exceedsEffectiveMaximum(html)) {
    if (input.minQuantity !== undefined && input.minQuantity > 1)
      throw rejected(context, 'quotaInsufficient', rejectionDetails('quotaInsufficient', html, input.type, quota))
    if (input.quantity > 1) return runRequest(context, { ...input, quantity: 1 }, company)
    throw rejected(context, 'quotaExceeded', rejectionDetails('quotaExceeded', html, input.type, quota))
  }
  if (mentionsAuthorizedRange(html)) return recoverAuthorizedRange(context, page, input.type, quota, company)
  if (looksLikeLoginRedirect(html)) throw sessionExpired(context, CONFIRM)
  throw unexpectedPage(context, CONFIRM, html)
}

const runRequest = async (context: PortalContext, input: CafRequestInput, company: Company): Promise<ObtainedCaf> => {
  const started = await startRequest(context, input.type, input.quantity, company)
  const { page, atQuota } = await reachQuotaForm(context, started, input.type, company)
  if (!atQuota) return concludeRequest(context, page, input, { maxAuthorized: null, availableFolios: null }, company)
  const quota = quotaFields(page.html)
  if (input.minQuantity !== undefined && quota.maxAuthorized !== null && quota.maxAuthorized < input.minQuantity)
    throw rejected(context, 'quotaInsufficient', rejectionDetails('quotaInsufficient', page.html, input.type, quota))
  return concludeRequest(context, await stamp(context, page, input, quota, company), input, quota, company)
}

/**
 * EN: `requestCaf` inside a session already held, for the composite flows.
 * ES: `requestCaf` dentro de una sesión ya tomada, para los flujos compuestos.
 */
export const requestCafInSession = async (context: PortalContext, input: CafRequestInput): Promise<ObtainedCaf> => {
  assertDocumentType(input.type)
  assertQuantity(input.quantity, 'quantity')
  if (input.minQuantity !== undefined) assertQuantity(input.minQuantity, 'minQuantity')
  const company = companyFields(resolvePortalCompany(context.portal, input.companyRut))
  try {
    return await runRequest(context, input, company)
  } finally {
    await context.portal.sleep(REQUEST_SPACING_MS, context.overrides?.signal)
  }
}

/**
 * EN: `queryFolioQuota` inside a session already held.
 * ES: `queryFolioQuota` dentro de una sesión ya tomada.
 */
export const queryFolioQuotaInSession = async (
  context: PortalContext,
  input: { readonly type: DocumentType; readonly companyRut?: string },
): Promise<FolioQuota> => {
  assertDocumentType(input.type)
  const company = companyFields(resolvePortalCompany(context.portal, input.companyRut))
  try {
    const started = await startRequest(context, input.type, 1, company)
    if (mustAuthenticate(started.html)) throw sessionExpired(context, ENTRY)
    const { page, atQuota } = await reachQuotaForm(context, started, input.type, company)
    const rejection = hardRejection(page.html)
    if (rejection === 'stampingBlocked')
      return { unrestricted: false, blocked: true, maxAuthorized: null, availableFolios: null }
    if (rejection !== null)
      throw rejected(context, rejection, { type: input.type, portalMessage: portalMessageOf(page.html) })
    if (!atQuota) throw unexpectedPage(context, ENTRY, page.html)
    const quota = quotaFields(page.html)
    return { unrestricted: quota.maxAuthorized === null, blocked: false, ...quota }
  } finally {
    await context.portal.sleep(REQUEST_SPACING_MS, context.overrides?.signal)
  }
}

/**
 * EN: Reads how many folios the SII authorizes for a type, stopping at the form that shows it: nothing is stamped and
 * the quota does not move. `MAX_AUTOR` and `FOLIOS_DISP` appear only while the SII rations the type.
 * ES: Lee cuántos folios autoriza el SII para un tipo, deteniéndose en el formulario que lo muestra: no se timbra nada y
 * el cupo no se mueve. `MAX_AUTOR` y `FOLIOS_DISP` aparecen solo mientras el SII raciona el tipo.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: document type and company. ES: tipo de documento y empresa.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the quota. ES: el cupo.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED` for any refusal but the stamping block, session and transport codes. ES: `SII_PORTAL_REJECTED` para cualquier rechazo salvo el bloqueo de timbraje, códigos de sesión y de transporte.
 */
export const queryFolioQuota = (
  portal: PortalClient,
  input: { readonly type: DocumentType; readonly companyRut?: string },
  overrides?: CallOverrides,
): Promise<FolioQuota> =>
  withPortalSession(portal, 'queryFolioQuota', overrides, (context) => queryFolioQuotaInSession(context, input))

/**
 * EN: Requests a range of folios and downloads its CAF through the five portal steps. A rejection can arrive at any
 * step. With the effective maximum exceeded and no `minQuantity`, it asks once more for one folio.
 * ES: Solicita un rango de folios y descarga su CAF por los cinco pasos del portal. Un rechazo puede llegar en cualquier
 * paso. Si se excede el máximo efectivo y no hay `minQuantity`, pide una vez más por un folio.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: type, quantity and company. ES: tipo, cantidad y empresa.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the CAF; its XML holds a private key. ES: el CAF; su XML contiene una llave privada.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes, `CAF_INVALID`. ES: los mismos códigos.
 */
export const requestCaf = (
  portal: PortalClient,
  input: CafRequestInput,
  overrides?: CallOverrides,
): Promise<ObtainedCaf> =>
  withPortalSession(portal, 'requestCaf', overrides, (context) => requestCafInSession(context, input))

/**
 * EN: Lists the document types the portal offers for stamping with this company. An error page is not "no types": a page
 * with no selector and no stated rejection throws.
 * ES: Lista los tipos de documento que el portal ofrece para timbraje con esta empresa. Una página de error no es "sin
 * tipos": una página sin selector y sin rechazo declarado lanza.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the company. ES: la empresa.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the types offered, possibly none. ES: los tipos ofrecidos, posiblemente ninguno.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const listStampableTypes = (
  portal: PortalClient,
  input: { readonly companyRut?: string } = {},
  overrides?: CallOverrides,
): Promise<readonly StampableType[]> =>
  withPortalSession(portal, 'listStampableTypes', overrides, async (context) => {
    const company = companyFields(resolvePortalCompany(portal, input.companyRut))
    const form = await ensurePage(context, ENTRY, at(context, ENTRY))
    if (mustAuthenticate(form.html)) throw sessionExpired(context, ENTRY)
    const page = await submitForm(context, `${ENTRY}.post`, formAction(form.html) ?? `${PATH}${SELECTOR}`, form.url, {
      ...inputValues(form.html),
      ...company,
    })
    assertNotRejected(context, page.html)
    const types = stampableTypes(page.html)
    if (types === null) throw unexpectedPage(context, SELECTOR, page.html)
    return types
  })
