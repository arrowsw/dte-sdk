import { cgiUrl } from '../catalogs/portal'
import type { CallOverrides } from '../sii/client'
import { resolvePortalCompany, type PortalClient } from './client'
import { portalMessageOf } from './pages/auth'
import { parseCertificationSets, type CertificationSet } from './pages/certification'
import { hardRejection } from './pages/stamping'
import { companyFields, ensurePage, rejected, submitForm, unexpectedPage, withPortalSession } from './session'

const REQUIRED_SETS = ['SET BASICO', 'SET GUIA DE DESPACHO', 'SET FACTURA EXENTA', 'SET CASO GENERAL FACTURA COMPRA']
const REQUIRED_BOOKS = ['LIBRO DE VENTAS', 'LIBRO DE COMPRAS', 'LIBRO DE GUIAS']

/**
 * EN: The certification state of a company.
 * ES: El estado de certificación de una empresa.
 */
export type CertificationSets = {
  /** EN: Every set and book the page lists. ES: Todos los sets y libros que lista la página. */
  readonly sets: readonly CertificationSet[]
  /** EN: The four required sets are approved. ES: Los cuatro sets obligatorios están `REVISADO CONFORME`. */
  readonly allSetsApproved: boolean
  /** EN: The three required books are approved. ES: Los tres libros obligatorios están `REVISADO CONFORME`. */
  readonly allBooksApproved: boolean
}

const allApproved = (sets: readonly CertificationSet[], required: readonly string[]): boolean =>
  required.every((name) => sets.find((set) => set.name.includes(name))?.status.includes('REVISADO CONFORME') ?? false)

/**
 * EN: Reads the state of each test set and book, on the certification host. It only reads: declaring progress belongs
 * to the certification runner.
 * ES: Lee el estado de cada set de pruebas y libro, en el host de certificación. Solo lee: declarar avance le corresponde
 * al ejecutor de la certificación.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the company. ES: la empresa.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the sets and whether the required ones are approved. ES: los sets y si los obligatorios están aprobados.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const queryCertificationSets = (
  portal: PortalClient,
  input: { readonly companyRut?: string } = {},
  overrides?: CallOverrides,
): Promise<CertificationSets> =>
  withPortalSession(portal, 'queryCertificationSets', overrides, async (context) => {
    const company = companyFields(resolvePortalCompany(portal, input.companyRut))
    const entry = await ensurePage(context, 'pe_avance1', cgiUrl('certification', 'pe_avance1'))
    const page = await submitForm(
      context,
      'pe_avance2',
      cgiUrl('certification', 'pe_avance2'),
      entry.url,
      { ...company, ACEPTAR: 'Continuar' },
      entry.url,
    )
    const rejection = hardRejection(page.html)
    if (rejection !== null) throw rejected(context, rejection, { portalMessage: portalMessageOf(page.html) })
    const sets = parseCertificationSets(page.html)
    if (sets.length === 0) throw unexpectedPage(context, 'pe_avance2', page.html)
    return {
      sets,
      allSetsApproved: allApproved(sets, REQUIRED_SETS),
      allBooksApproved: allApproved(sets, REQUIRED_BOOKS),
    }
  })
