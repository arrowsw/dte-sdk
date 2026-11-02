import type { Environment } from '../catalogs/codes'
import { cgiUrl } from '../catalogs/portal'
import { DteError, errorMessage } from '../errors'
import type { SiiRut } from '../model/rut'
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
