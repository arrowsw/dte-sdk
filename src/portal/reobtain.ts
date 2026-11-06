import { parseCaf } from '../caf/parse'
import { isDocumentType, type DocumentType } from '../catalogs/document-types'
import { cgiUrl } from '../catalogs/portal'
import { DteError } from '../errors'
import type { CallOverrides } from '../sii/client'
import { resolvePortalCompany, type PortalClient } from './client'
import { isRangeAnnulled, parseReobtainList, reobtainDownloadFields, reobtainFormFields } from './pages/reobtain'
import { hasCaf } from './pages/stamping'
import { companyFields, portalRequest, rejected, submitForm, withPortalSession, type PortalContext } from './session'
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
  // A plain request: no login on demand, no representation flow and no check for a refusal, here or on the listing
  // that follows. With an expired session, or a page that states a refusal, the listing has no forms and the list
  // comes back empty, as field behaviour does; a page that lists ranges gives them whatever else it says.
  const entry = await portalRequest(context, 'rf_reobtencion1', 'GET', at(context, 'rf_reobtencion1_folios'))
  const list = await submitForm(
    context,
    'rf_reobtencion2',
    at(context, 'rf_reobtencion2_folios'),
    entry.url,
    { ...company, PAGINA: '1', COD_DOCTO: String(input.type), ACEPTAR: 'Consultar' },
    refererOf(context, 'rf_reobtencion1_folios'),
  )
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
 * EN: `reobtainCaf` inside a session already held.
 * ES: `reobtainCaf` dentro de una sesión ya tomada.
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
  if (downloadFields === null) throw rejected(context, 'reobtainDownloadMissing', details)
  const answer = await submitForm(
    context,
    'rf_genera_archivo',
    at(context, 'rf_genera_archivo'),
    resolution.url,
    { ...downloadFields, ACEPTAR: 'AQUI' },
    refererOf(context, 'rf_genera_folio'),
  )
  if (!hasCaf(answer.html)) throw rejected(context, 'reobtainCafMissing', details)
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
 * are costs one request per range. The requests are the reference's: the listing is asked for with no session handling
 * on the way in (no login on demand, no choice of the company to represent) and its answer is read for ranges and
 * nothing else, so a session that expired, or a page that states a refusal, gives an empty list and not an error.
 * ES: Lista los rangos autorizados que el SII deja volver a descargar. Los rangos anulados aparecen sin marcar, así que
 * saber cuáles lo son cuesta una petición por rango. Las peticiones son las de la referencia: el listado se pide sin
 * manejo de sesión al entrar (sin login a pedido, sin elegir la empresa a representar) y su respuesta se lee buscando
 * rangos y nada más, así que una sesión vencida, o una página que declara un rechazo, da una lista vacía y no un error.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: document type and company. ES: tipo de documento y empresa.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the ranges. ES: los rangos.
 * @throws {DteError} EN: block and transport codes. ES: códigos de bloqueo y de transporte.
 */
export const listReobtainableRanges = (
  portal: PortalClient,
  input: { readonly type: DocumentType; readonly companyRut?: string },
  overrides?: CallOverrides,
): Promise<readonly ReobtainableRange[]> =>
  withPortalSession(portal, 'listReobtainableRanges', overrides, (context) => listReobtainableInSession(context, input))

/**
 * EN: Downloads the CAF of an already authorized range. It costs no quota.
 * ES: Descarga el CAF de un rango ya autorizado. No gasta cupo.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: type and a range from `listReobtainableRanges`. ES: tipo y un rango de `listReobtainableRanges`.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the CAF, with `recovered: true`; its XML holds a private key. ES: el CAF, con `recovered: true`; su XML contiene una llave privada.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED`, session and transport codes, `CAF_INVALID`. ES: los mismos códigos.
 */
export const reobtainCaf = (
  portal: PortalClient,
  input: { readonly type: DocumentType; readonly range: ReobtainableRange },
  overrides?: CallOverrides,
): Promise<ObtainedCaf> =>
  withPortalSession(portal, 'reobtainCaf', overrides, (context) => reobtainCafInSession(context, input))
