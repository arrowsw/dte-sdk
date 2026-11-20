import type { Environment } from '../catalogs/codes'
import { cgiUrl } from '../catalogs/portal'
import { DteError, errorMessage } from '../errors'
import { toSiiRut, type SiiRut } from '../model/rut'
import type { CallOverrides } from '../sii/client'
import { resolvePortalCompany, type PortalClient } from './client'
import { sessionRut } from './cookies'
import { portalMessageOf } from './pages/auth'
import {
  isCompanyNotAuthorized,
  parseCompanyResolution,
  parseTaxpayerData,
  type CompanyResolution,
  type TaxpayerData,
} from './pages/company'
import {
  isUnlistedIssuer,
  parseExchangeEmail,
  parseIssuerRegistry,
  type IssuerRegistryEntry,
} from './pages/issuer-registry'
import {
  companyFields,
  ensurePage,
  rejected,
  submitForm,
  unexpectedPage,
  withFreshSessionRetry,
  withPortalSession,
  type PortalContext,
} from './session'

/**
 * EN: What a company needs to fill an `Issuer` and an envelope cover.
 * ES: Lo que una empresa necesita para llenar un `Issuer` y una carátula.
 */
export type IssuerProfile = {
  /** EN: Company RUT. ES: `RUTEmisor` — RUT de la empresa. */
  readonly rut: SiiRut
  /** EN: Business name. ES: `RznSoc` — Razón social. */
  readonly businessName: string
  /** EN: Line of business: the first activity, else the description. ES: `GiroEmis` — Giro: la primera actividad, si no la glosa. */
  readonly businessActivity: string
  /** EN: Code of the first activity, or null. ES: `Acteco` — Código de la primera actividad, o null. */
  readonly activityCode: number | null
  /** EN: Street address. ES: `DirOrigen` — Dirección. */
  readonly address: string
  /** EN: Commune. ES: `CmnaOrigen` — Comuna. */
  readonly commune: string
  /** EN: City; the commune when absent. ES: `CiudadOrigen` — Ciudad; la comuna si falta. */
  readonly city: string
  /** EN: Resolution date of the environment asked for. ES: `FchResol` — Fecha de resolución del ambiente pedido. */
  readonly resolutionDate: string
  /** EN: Resolution number of the environment asked for. ES: `NroResol` — Número de resolución del ambiente pedido. */
  readonly resolutionNumber: number
}

const RESOLUTION_ENTRY = 'ad_empresa1'
const RESOLUTION_PAGE = 'ad_empresa2'
const TAXPAYER_PAGE = 'ce_consulta_muestra_e'
const REGISTRY_ENTRY = 'ce_consulta_rut'
const REGISTRY_PAGE = 'ce_consulta_e'

/**
 * EN: An authorized issuer as the registry answers a session, with the mailbox it registered for the exchange.
 * ES: Un emisor autorizado tal como el registro lo responde a una sesión, con la casilla que registró para el
 * intercambio.
 */
export type ExchangeMailbox = IssuerRegistryEntry & {
  /** EN: The RUT asked for. ES: `RUT_EMP` + `DV_EMP` — El RUT consultado. */
  readonly rut: SiiRut
  /** EN: Mailbox the issuer registered to exchange documents with other taxpayers, or null when it registered none. ES: `Mail de contacto` — Casilla que el emisor registró para intercambiar documentos con otros contribuyentes, o null si no registró ninguna. */
  readonly exchangeEmail: string | null
}

const readExchangeMailbox = async (
  context: PortalContext,
  rut: SiiRut,
  environment: Environment,
): Promise<ExchangeMailbox> => {
  const entry = await ensurePage(context, REGISTRY_ENTRY, cgiUrl(environment, REGISTRY_ENTRY))
  const page = await submitForm(context, REGISTRY_PAGE, cgiUrl(environment, REGISTRY_PAGE), entry.url, {
    ...companyFields(rut),
    ACEPTAR: 'Consultar',
  })
  if (isUnlistedIssuer(page.html))
    throw rejected(context, 'companyNotAuthorized', { portalMessage: portalMessageOf(page.html) })
  const listed = parseIssuerRegistry(page.html)
  if (listed.businessName === null && listed.documents.length === 0)
    throw unexpectedPage(context, REGISTRY_PAGE, page.html)
  return { rut, ...listed, exchangeEmail: parseExchangeEmail(page.html) }
}

const readResolution = async (
  context: PortalContext,
  rut: SiiRut,
  environment: Environment,
): Promise<CompanyResolution> => {
  const entry = await ensurePage(context, RESOLUTION_ENTRY, cgiUrl(environment, RESOLUTION_ENTRY))
  const page = await submitForm(context, RESOLUTION_PAGE, cgiUrl(environment, RESOLUTION_PAGE), entry.url, {
    ...companyFields(rut),
    ACEPTAR: 'Ingresar',
  })
  if (isCompanyNotAuthorized(page.html))
    throw rejected(context, 'companyNotAuthorized', { portalMessage: portalMessageOf(page.html) })
  const resolution = parseCompanyResolution(page.html)
  if (resolution === null) throw unexpectedPage(context, RESOLUTION_PAGE, page.html)
  return resolution
}

// The taxpayer page only answers on the certification host, whatever the environment. A `GET` first makes sure there is
// a session: a `POST` alone would only be redirected to the login.
const readTaxpayer = async (context: PortalContext, rut: SiiRut): Promise<TaxpayerData> => {
  const entry = await ensurePage(context, RESOLUTION_ENTRY, cgiUrl('certification', RESOLUTION_ENTRY))
  const page = await submitForm(context, TAXPAYER_PAGE, cgiUrl('certification', TAXPAYER_PAGE), entry.url, {
    ...companyFields(rut),
    ACEPTAR: 'CONSULTAR',
  })
  const data = parseTaxpayerData(page.html)
  if (data.rut === null && data.businessName === null) throw unexpectedPage(context, TAXPAYER_PAGE, page.html)
  return data
}

/**
 * EN: Reads the resolution of a company. It is per environment: certification and production answer different dates and
 * numbers for one RUT, and the wrong pair gets an envelope rejected with "Error en Carátula".
 * ES: Lee la resolución de una empresa. Es por ambiente: certificación y producción responden fechas y números distintos
 * para un mismo RUT, y el par equivocado hace que se rechace un envío con "Error en Carátula".
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: company and environment; the client's by default. ES: empresa y ambiente; por defecto los del cliente.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the resolution. ES: la resolución.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED { rejection: 'companyNotAuthorized' }`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const fetchCompanyResolution = (
  portal: PortalClient,
  input: { readonly companyRut?: string; readonly environment?: Environment } = {},
  overrides?: CallOverrides,
): Promise<CompanyResolution> =>
  withPortalSession(portal, 'fetchCompanyResolution', overrides, (context) => {
    const rut = resolvePortalCompany(portal, input.companyRut)
    return withFreshSessionRetry(context, () => readResolution(context, rut, input.environment ?? portal.environment))
  })

/**
 * EN: **Unstable**: its shape may change in any version, a patch included. The page it reads has not been read by this
 * library against the SII yet; once it has, in both environments, it becomes `fetchExchangeMailbox`.
 *
 * The mailbox an authorized issuer registered for the exchange of documents, which is where the answers to a received
 * document go (the reception answer, the commercial result and the receipt of goods). The message a document arrives
 * in does not name it: its sender is whatever system delivered it. The public registry does not show it either, so
 * this asks the registry with a session, in the client's environment, along with the issuer's name, resolution and
 * authorized document types. It changes nothing in the SII.
 * ES: **Inestable**: su forma puede cambiar en cualquier versión, incluso un patch. La página que lee aún no la ha leído
 * esta librería contra el SII; cuando lo haya hecho, en ambos ambientes, pasa a llamarse `fetchExchangeMailbox`.
 *
 * La casilla que un emisor autorizado registró para el intercambio de documentos, que es adonde van las respuestas a un
 * documento recibido (la respuesta de recepción, el resultado comercial y el recibo de mercaderías). El mensaje en que
 * llega un documento no la nombra: su remitente es el sistema que lo entregó. El registro público tampoco la muestra,
 * así que esta función consulta el registro con una sesión, en el ambiente del cliente, junto con el nombre, la
 * resolución y los tipos de documento autorizados del emisor. No cambia nada en el SII.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the RUT of the issuer to look up. ES: el RUT del emisor por consultar.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the registry entry with the mailbox. ES: la entrada del registro con la casilla.
 * @throws {DteError} EN: `INVALID_RUT`; `SII_PORTAL_REJECTED { rejection: 'companyNotAuthorized' }` when the SII says the RUT is not an authorized issuer; `SII_PORTAL_UNEXPECTED_PAGE` when the answer has neither a name nor document types; session and transport codes. ES: `INVALID_RUT`; `SII_PORTAL_REJECTED { rejection: 'companyNotAuthorized' }` si el SII dice que el RUT no es emisor autorizado; `SII_PORTAL_UNEXPECTED_PAGE` si la respuesta no trae nombre ni tipos de documento; códigos de sesión y de transporte.
 */
export const unstable_fetchExchangeMailbox = (
  portal: PortalClient,
  input: { readonly rut: string },
  overrides?: CallOverrides,
): Promise<ExchangeMailbox> =>
  withPortalSession(portal, 'fetchExchangeMailbox', overrides, (context) => {
    const rut = toSiiRut(input.rut, 'rut')
    return withFreshSessionRetry(context, () => readExchangeMailbox(context, rut, portal.environment))
  })

/**
 * EN: Reads taxpayer data: name, address split in its parts, activities and branches.
 * ES: Lee los datos del contribuyente: nombre, domicilio separado en sus partes, actividades y sucursales.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the company. ES: la empresa.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the data. ES: los datos.
 * @throws {DteError} EN: `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const fetchTaxpayerData = (
  portal: PortalClient,
  input: { readonly companyRut?: string } = {},
  overrides?: CallOverrides,
): Promise<TaxpayerData> =>
  withPortalSession(portal, 'fetchTaxpayerData', overrides, (context) => {
    const rut = resolvePortalCompany(portal, input.companyRut)
    return withFreshSessionRetry(context, () => readTaxpayer(context, rut))
  })

const profileCompany = async (
  context: PortalContext,
  companyRut: string | undefined,
  environment: Environment,
): Promise<SiiRut> => {
  const { portal } = context
  if (companyRut !== undefined || portal.companyRut !== null) return resolvePortalCompany(portal, companyRut)
  await ensurePage(context, RESOLUTION_ENTRY, cgiUrl(environment, RESOLUTION_ENTRY))
  const rut = sessionRut(context.state.cookies)
  if (rut === null) throw new DteError('MISSING_FIELD', { field: 'companyRut' })
  return rut
}

/**
 * EN: Reads the resolution and the taxpayer data in sequence and combines them. In parallel, one reply overwrites the
 * balancer cookie the other needs and `ad_empresa2` answers empty. A failing taxpayer read is logged and tolerated as long
 * as the resolution date arrived. Without a company on the input or the client, it uses the RUT of the session.
 * ES: Lee la resolución y los datos del contribuyente en secuencia y los combina. En paralelo, una respuesta pisa la cookie
 * del balanceador que la otra necesita y `ad_empresa2` responde vacío. Una lectura fallida del contribuyente se registra y
 * se tolera mientras haya llegado la fecha de resolución. Sin empresa en la entrada ni en el cliente, usa el RUT de la sesión.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: company and environment; the client's by default. ES: empresa y ambiente; por defecto los del cliente.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the profile. ES: el perfil.
 * @throws {DteError} EN: as `fetchCompanyResolution`, plus `MISSING_FIELD { field: 'companyRut' }`. ES: como `fetchCompanyResolution`, más `MISSING_FIELD { field: 'companyRut' }`.
 */
export const fetchIssuerProfile = (
  portal: PortalClient,
  input: { readonly companyRut?: string; readonly environment?: Environment } = {},
  overrides?: CallOverrides,
): Promise<IssuerProfile> =>
  withPortalSession(portal, 'fetchIssuerProfile', overrides, async (context) => {
    const environment = input.environment ?? portal.environment
    const rut = await profileCompany(context, input.companyRut, environment)
    const resolution = await withFreshSessionRetry(context, () => readResolution(context, rut, environment))
    if (resolution.resolutionDate === null)
      throw new DteError('SII_PORTAL_UNEXPECTED_PAGE', {
        operation: context.operation,
        step: RESOLUTION_PAGE,
        portalMessage: 'resolution date missing',
      })
    const taxpayer = await readTaxpayer(context, rut).catch((error: unknown) => {
      portal.logger.warn('sii portal taxpayer read failed', { reason: errorMessage(error) })
      return null
    })
    return {
      rut,
      businessName: taxpayer?.businessName ?? resolution.businessName ?? '',
      businessActivity: taxpayer?.businessActivity ?? taxpayer?.description ?? '',
      activityCode: taxpayer?.activityCode ?? null,
      address: taxpayer?.address ?? '',
      commune: taxpayer?.commune ?? '',
      city: taxpayer?.city ?? taxpayer?.commune ?? '',
      resolutionDate: resolution.resolutionDate,
      resolutionNumber: resolution.resolutionNumber ?? 0,
    }
  })
