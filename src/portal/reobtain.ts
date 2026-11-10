import { parseCaf } from '../caf/parse'
import { isDocumentType, type DocumentType } from '../catalogs/document-types'
import { cgiUrl } from '../catalogs/portal'
import { DteError } from '../errors'
import type { CallOverrides } from '../sii/client'
import { resolvePortalCompany, type PortalClient } from './client'
import {
  isRangeAnnulled,
  isReobtainListing,
  isReobtainPage,
  parseReobtainList,
  reobtainDownloadFields,
  reobtainFormFields,
} from './pages/reobtain'
import { hasCaf } from './pages/stamping'
import {
  assertNotRejected,
  companyFields,
  ensurePage,
  rejected,
  submitForm,
  withPortalSession,
  wrongPage,
  type PortalContext,
  type PortalPage,
} from './session'
import { asksForAuthentication, looksLikeLoginRedirect } from './pages/auth'
import type { ObtainedCaf } from './stamping'

/**
 * EN: An authorized range the SII lets download again. The list also holds ranges already issued, which the SII does not
 * mark at all: re-using one gets each document rejected with `DTE-3-101`.
 * ES: Un rango autorizado que el SII deja volver a descargar. La lista también trae rangos ya emitidos, que el SII no marca
 * de ninguna forma: reutilizar uno hace que cada documento se rechace con `DTE-3-101`.
 */
export type ReobtainableRange = {
  /** EN: First folio. ES: `FOLIO_INI` — Primer folio. */
  readonly from: number
  /** EN: Last folio. ES: `FOLIO_FIN` — Último folio. */
  readonly to: number
  /** EN: Folios in the range. ES: Folios del rango. */
  readonly quantity: number
  /** EN: The range is annulled; documents with these folios would be rejected. ES: El rango está anulado; los documentos con estos folios se rechazarían. */
  readonly annulled: boolean
  /** EN: Fields of the range in the list. ES: Campos del rango en la lista. */
  readonly formFields: Readonly<Record<string, string>>
  /** EN: Fields of the final form, or null when the SII gave none. ES: Campos del formulario final, o null si el SII no dio ninguno. */
  readonly downloadFields: Readonly<Record<string, string>> | null
}

const at = (context: PortalContext, page: string): string => cgiUrl(context.portal.environment, page)

// The referers of the reobtention are paths without a host, as field behaviour sends them.
const refererOf = (context: PortalContext, page: string): string => new URL(at(context, page)).pathname

const assertDocumentType = (type: unknown): void => {
  if (!isDocumentType(type)) throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type' })
}

// The procedure is entered like any other, logging in on demand and through the representation screen: with a plain
// request, a session that had expired in the certification environment gave an empty list and no error, and a range
// posted with it got the login page, which read as the SII refusing the download. A page that is not the procedure is
// a refusal, an expired session or unexpected.
const enterProcedure = async (context: PortalContext): Promise<PortalPage> => {
  const entry = await ensurePage(context, 'rf_reobtencion1', at(context, 'rf_reobtencion1_folios'))
  assertNotRejected(context, entry.html)
  if (!isReobtainPage(entry.html)) throw wrongPage(context, 'rf_reobtencion1', entry.html)
  return entry
}

// A step that did not give what it should: a login page means the session expired, anything else is the refusal.
const missing = (context: PortalContext, step: string, html: string, refusal: DteError): DteError =>
  asksForAuthentication(html) || looksLikeLoginRedirect(html) ? wrongPage(context, step, html) : refusal

/**
 * EN: `listReobtainableRanges` inside a session already held.
 * ES: `listReobtainableRanges` dentro de una sesión ya tomada.
 */
export const listReobtainableInSession = async (
  context: PortalContext,
  input: { readonly type: DocumentType; readonly companyRut?: string },
): Promise<readonly ReobtainableRange[]> => {
  assertDocumentType(input.type)
  const company = companyFields(resolvePortalCompany(context.portal, input.companyRut))
  // A page that is not the listing is never "no ranges" either.
  const entry = await enterProcedure(context)
  const list = await submitForm(
    context,
    'rf_reobtencion2',
    at(context, 'rf_reobtencion2_folios'),
    entry.url,
    { ...company, PAGINA: '1', COD_DOCTO: String(input.type), ACEPTAR: 'Consultar' },
    refererOf(context, 'rf_reobtencion1_folios'),
  )
  assertNotRejected(context, list.html)
  if (!isReobtainListing(list.html)) throw wrongPage(context, 'rf_reobtencion2', list.html)
  const ranges: ReobtainableRange[] = []
  for (const formFields of parseReobtainList(list.html)) {
    const detail = await submitForm(
      context,
      'rf_reobtencion3',
      at(context, 'rf_reobtencion3_folios'),
      list.url,
      formFields,
      refererOf(context, 'rf_reobtencion2_folios'),
    )
    const from = Number(formFields.FOLIO_INI)
    const to = Number(formFields.FOLIO_FIN)
    ranges.push({
      from,
      to,
      quantity: to - from + 1,
      annulled: isRangeAnnulled(detail.html),
      formFields,
      downloadFields: reobtainFormFields(detail.html),
    })
  }
  return ranges
}

/**
 * EN: `reobtainCaf` inside a session already held, right after the listing: the procedure is not entered again.
 * ES: `reobtainCaf` dentro de una sesión ya tomada, justo después del listado: no se vuelve a entrar al trámite.
 */
export const reobtainCafInSession = async (
  context: PortalContext,
  input: { readonly type: DocumentType; readonly range: ReobtainableRange },
): Promise<ObtainedCaf> => {
  assertDocumentType(input.type)
  const { type, range } = input
  const details = { type, range: { from: range.from, to: range.to } }
  if (range.annulled) throw rejected(context, 'rangeAnnulled', details)
  if (range.downloadFields === null) throw rejected(context, 'reobtainFormMissing', details)
  const resolution = await submitForm(
    context,
    'rf_genera_folio',
    at(context, 'rf_genera_folio'),
    at(context, 'rf_reobtencion3_folios'),
    { ...range.downloadFields, ACEPTAR: 'Solicitar Folios' },
    refererOf(context, 'rf_reobtencion3_folios'),
  )
  const downloadFields = reobtainDownloadFields(resolution.html)
  if (downloadFields === null)
    throw missing(context, 'rf_genera_folio', resolution.html, rejected(context, 'reobtainDownloadMissing', details))
  const answer = await submitForm(
    context,
    'rf_genera_archivo',
    at(context, 'rf_genera_archivo'),
    resolution.url,
    { ...downloadFields, ACEPTAR: 'AQUI' },
    refererOf(context, 'rf_genera_folio'),
  )
  if (!hasCaf(answer.html))
    throw missing(context, 'rf_genera_archivo', answer.html, rejected(context, 'reobtainCafMissing', details))
  const caf = parseCaf(answer.html)
  return {
    xml: answer.html,
    caf,
    granted: caf.range.to - caf.range.from + 1,
    maxAuthorized: null,
    availableFolios: null,
    recovered: true,
  }
}

/**
 * EN: Lists the authorized ranges the SII lets download again. Annulled ranges appear there unmarked, so learning which
 * are costs one request per range. The procedure is entered like the others, with a login on demand and the
 * representation screen. Only a listing gives a list, empty when it has no ranges: a page that states a refusal throws
 * `SII_PORTAL_REJECTED`, a login page `SII_PORTAL_SESSION_EXPIRED` and any other page `SII_PORTAL_UNEXPECTED_PAGE`.
 * ES: Lista los rangos autorizados que el SII deja volver a descargar. Los rangos anulados aparecen sin marcar, así que
 * saber cuáles lo son cuesta una petición por rango. Al trámite se entra como a los demás, con login a pedido y la
 * pantalla de representación. Solo un listado da una lista, vacía si no tiene rangos: una página que declara un rechazo
 * lanza `SII_PORTAL_REJECTED`, una de ingreso `SII_PORTAL_SESSION_EXPIRED` y cualquier otra `SII_PORTAL_UNEXPECTED_PAGE`.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: document type and company. ES: tipo de documento y empresa.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the ranges. ES: los rangos.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED`, `SII_PORTAL_UNEXPECTED_PAGE`, session, block and transport codes. ES: los mismos códigos.
 */
export const listReobtainableRanges = (
  portal: PortalClient,
  input: { readonly type: DocumentType; readonly companyRut?: string },
  overrides?: CallOverrides,
): Promise<readonly ReobtainableRange[]> =>
  withPortalSession(portal, 'listReobtainableRanges', overrides, (context) => listReobtainableInSession(context, input))

/**
 * EN: Downloads the CAF of an already authorized range. It costs no quota. The procedure is entered first, as
 * `listReobtainableRanges` enters it, with a login on demand: a cached session that expired since the listing logs in
 * again instead of posting the range with it. A page that states a refusal at the entry throws `SII_PORTAL_REJECTED`,
 * and a login page at any step `SII_PORTAL_SESSION_EXPIRED`, never the refusal of a step.
 * ES: Descarga el CAF de un rango ya autorizado. No gasta cupo. Primero se entra al trámite, como entra
 * `listReobtainableRanges`, con login a pedido: una sesión en caché que venció después del listado inicia sesión de
 * nuevo en vez de enviar el rango con ella. Una página que declara un rechazo en la entrada lanza `SII_PORTAL_REJECTED`,
 * y una de ingreso en cualquier paso `SII_PORTAL_SESSION_EXPIRED`, nunca el rechazo de un paso.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: type and a range from `listReobtainableRanges`. ES: tipo y un rango de `listReobtainableRanges`.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the CAF, with `recovered: true`; its XML holds a private key. ES: el CAF, con `recovered: true`; su XML contiene una llave privada.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes, `CAF_INVALID`. ES: los mismos códigos.
 */
export const reobtainCaf = (
  portal: PortalClient,
  input: { readonly type: DocumentType; readonly range: ReobtainableRange },
  overrides?: CallOverrides,
): Promise<ObtainedCaf> =>
  withPortalSession(portal, 'reobtainCaf', overrides, async (context) => {
    assertDocumentType(input.type)
    await enterProcedure(context)
    return reobtainCafInSession(context, input)
  })
