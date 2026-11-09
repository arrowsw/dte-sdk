import { ACTIVITY_VERIFICATION_SERVICE } from '../catalogs/portal'
import { DteError } from '../errors'
import { splitSiiRut } from '../model/rut'
import type { CallOverrides } from '../sii/client'
import { resolvePortalCompany, type PortalClient } from './client'
import { readService } from './facade'
import {
  accreditationDocumentsOf,
  activityVerificationOf,
  type AccreditationDocument,
  type ActivityVerification,
} from './pages/activity-verification'
import { rejected, withPortalSession, type PortalContext } from './session'

/**
 * EN: What `unstable_fetchActivityVerification` needs.
 * ES: Lo que necesita `unstable_fetchActivityVerification`.
 */
export type ActivityVerificationInput = {
  /** EN: Company, when it is not the client's. ES: `contribuyenteBO.rut` + `contribuyenteBO.dv` — Empresa, si no es la del cliente. */
  readonly companyRut?: string
}

const CONSULT = 'consultarVerificacionInternet'
const CATALOG = 'recuperarDocAcreditar'

// An answer without the expected data names nothing, so the error carries no body.
const unreadable = (context: PortalContext, step: string): DteError =>
  new DteError('SII_PORTAL_UNEXPECTED_PAGE', { operation: context.operation, step })

/**
 * EN: **Unstable**: its shape may change in any release, a patch included. It was measured once, on 2026-11-08, for one
 * company whose verification was pending, and the SII's codes for an approved one are not known yet; once one has been
 * read it becomes `fetchActivityVerification`.
 *
 * The company's activity verification, the SII's "Consulta estado de verificación y acreditación", which the SII requires
 * before a company issues documents with VAT. The SII's own page shows the RUT of the session; this asks for the company,
 * and the SII answered a session of its legal representative. A request of another RUT throws instead of passing as the
 * company's. It reads production whatever the client's environment, because the app exists only there. Officials,
 * comments and the address never come out.
 * ES: **Inestable**: su forma puede cambiar en cualquier versión, incluso un patch. Se midió una vez, el 2026-11-08, para
 * una empresa con la verificación pendiente, y aún no se conocen los códigos del SII para una aprobada; cuando se lea una,
 * pasa a llamarse `fetchActivityVerification`.
 *
 * La verificación de actividades de la empresa, la "Consulta estado de verificación y acreditación" del SII, que el SII
 * exige antes de que una empresa emita documentos con IVA. La página del propio SII muestra el RUT de la sesión; esta
 * función pide la empresa, y el SII respondió a una sesión de su representante legal. Una solicitud de otro RUT lanza en
 * vez de pasar como de la empresa. Lee producción sea cual sea el ambiente del cliente, porque la app existe solo ahí. Los
 * funcionarios, los comentarios y el domicilio nunca salen.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the company, when it is not the client's. ES: la empresa, si no es la del cliente.
 * @param overrides EN: per-call overrides; `retry` opts into repeating the call. ES: ajustes de la llamada; `retry` activa la repetición de la llamada.
 * @returns EN: the requests and the SII's messages. ES: las solicitudes y los mensajes del SII.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED { rejection: 'activityVerificationRefused' }`, `SII_PORTAL_UNEXPECTED_PAGE { step: 'otherTaxpayer' }`, `MISSING_FIELD`, `INVALID_RUT`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const unstable_fetchActivityVerification = (
  portal: PortalClient,
  input: ActivityVerificationInput = {},
  overrides?: CallOverrides,
): Promise<ActivityVerification> =>
  withPortalSession(portal, 'fetchActivityVerification', overrides, async (context) => {
    const company = resolvePortalCompany(portal, input.companyRut)
    const { body, verifier } = splitSiiRut(company)
    const reading = await readService(context, ACTIVITY_VERIFICATION_SERVICE, async (call) => {
      const read = activityVerificationOf(
        await call(CONSULT, { contribuyenteBO: { rut: Number(body), dv: verifier } }),
        company,
      )
      if (read.outcome === 'unreadable') throw unreadable(context, CONSULT)
      return read
    })
    if (reading.outcome === 'refused')
      throw rejected(
        context,
        'activityVerificationRefused',
        reading.message === null ? {} : { portalMessage: reading.message },
      )
    if (reading.outcome === 'otherTaxpayer') throw unreadable(context, 'otherTaxpayer')
    return reading.verification
  })

/**
 * EN: The kinds of document the SII takes to accredit an activity, from the activity verification app: a general list and
 * a specific one, whose codes repeat. It reads production whatever the client's environment, because the app exists only
 * there.
 * ES: Los tipos de documento que el SII acepta para acreditar una actividad, desde la app de verificación de actividades:
 * una lista general y una específica, cuyos códigos se repiten. Lee producción sea cual sea el ambiente del cliente, porque
 * la app existe solo ahí.
 * @param portal EN: the client. ES: el cliente.
 * @param overrides EN: per-call overrides; `retry` opts into repeating the call. ES: ajustes de la llamada; `retry` activa la repetición de la llamada.
 * @returns EN: the catalog, as the SII orders it. ES: el catálogo, en el orden del SII.
 * @throws {DteError} EN: `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const listAccreditationDocuments = (
  portal: PortalClient,
  overrides?: CallOverrides,
): Promise<readonly AccreditationDocument[]> =>
  withPortalSession(portal, 'listAccreditationDocuments', overrides, (context) =>
    readService(context, ACTIVITY_VERIFICATION_SERVICE, async (call) => {
      const documents = accreditationDocumentsOf(await call(CATALOG, null))
      if (documents === null) throw unreadable(context, CATALOG)
      return documents
    }),
  )
