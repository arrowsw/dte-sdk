import { SII_HOSTS, UPLOAD_USER_AGENT } from '../catalogs/endpoints'
import { DteError } from '../errors'
import { splitSiiRut, toSiiRut, type SiiRut } from '../model/rut'
import { visibleText } from '../portal/html'
import { isUnlistedIssuer, parseIssuerRegistry, type IssuerRegistryEntry } from '../portal/pages/issuer-registry'
import { encodeLatin1 } from '../text/latin1'
import type { CallOverrides, SiiClient } from './client'
import { bodyExcerpt, httpError, isSuccess } from './operation'
import { mergeRetryPolicy, withRetry } from './retry'
import { send } from './send'
import { decodeBody } from './transport'

const OPERATION = 'queryAuthorizedIssuer'
const PAGE = 'ee_empresa_rut'
const TIMEOUT_MS = 20000

/**
 * EN: What `queryAuthorizedIssuer` needs: an environment and the means to send. A `SiiClient` or a portal client fits,
 * and so does a plain object, since the registry asks for no certificate.
 * ES: Lo que necesita `queryAuthorizedIssuer`: un ambiente y con qué enviar. Calza un `SiiClient` o un cliente del
 * portal, y también un objeto simple, porque el registro no pide certificado.
 */
export type IssuerRegistryClient = Pick<
  SiiClient,
  'environment' | 'transport' | 'capture' | 'logger' | 'now' | 'retry' | 'sleep'
>

/**
 * EN: An authorized issuer as the public registry of the SII lists it.
 * ES: Un emisor autorizado tal como lo lista el registro público del SII.
 */
export type AuthorizedIssuer = IssuerRegistryEntry & {
  /** EN: The RUT asked for. ES: `RUT_EMP` + `DV_EMP` — El RUT consultado. */
  readonly rut: SiiRut
}

/**
 * EN: Asks the public registry of authorized electronic issuers (`ee_empresa_rut`) about a RUT: its business name, the
 * resolution that authorizes it in this environment (the cover's `NroResol` and `FchResol`; number 0 in certification)
 * and the document types it may issue. It asks for no certificate and no session, and changes nothing, so it follows the
 * retry policy. Its markup is an old CGI table: a label that moved leaves its field null.
 * ES: Consulta al registro público de emisores electrónicos autorizados (`ee_empresa_rut`) por un RUT: su razón social,
 * la resolución que lo autoriza en este ambiente (el `NroResol` y el `FchResol` de la carátula; número 0 en
 * certificación) y los tipos de documento que puede emitir. No pide certificado ni sesión, y no cambia nada, así que
 * sigue la política de reintentos. Su marcado es una tabla de un CGI antiguo: una etiqueta que se movió deja su campo
 * en null.
 * @param sii EN: a client, or the fields of one it needs. ES: un cliente, o los campos de uno que necesita.
 * @param input EN: the RUT to look up. ES: el RUT por consultar.
 * @param overrides EN: per-call overrides; the timeout is 20 s by default. ES: ajustes de la llamada; el timeout es de 20 s por defecto.
 * @returns EN: the registry entry. ES: la entrada del registro.
 * @throws {DteError} EN: `INVALID_RUT`; `SII_PORTAL_REJECTED` with `rejection: 'companyNotAuthorized'` when the SII says the RUT is not an authorized issuer; `SII_PORTAL_UNEXPECTED_PAGE` when the answer has neither a name nor document types; `SII_HTTP_ERROR` and transport codes. ES: `INVALID_RUT`; `SII_PORTAL_REJECTED` con `rejection: 'companyNotAuthorized'` cuando el SII dice que el RUT no es emisor autorizado; `SII_PORTAL_UNEXPECTED_PAGE` cuando la respuesta no trae ni nombre ni tipos de documento; `SII_HTTP_ERROR` y códigos de transporte.
 */
export const queryAuthorizedIssuer = async (
  sii: IssuerRegistryClient,
  input: { readonly rut: string },
  overrides?: CallOverrides,
): Promise<AuthorizedIssuer> => {
  const rut = toSiiRut(input.rut, 'rut')
  const { body, verifier } = splitSiiRut(rut)
  const url = `https://${SII_HOSTS[sii.environment]}/cvc_cgi/dte/${PAGE}`
  const html = await withRetry(
    mergeRetryPolicy(sii.retry, overrides?.retry),
    async (attempt) => {
      const response = await send(sii, {
        operation: OPERATION,
        channel: 'portal',
        method: 'POST',
        url,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UPLOAD_USER_AGENT },
        body: encodeLatin1(`RUT_EMP=${body}&DV_EMP=${verifier}&ACEPTAR=Consultar`),
        timeoutMs: overrides?.timeoutMs ?? TIMEOUT_MS,
        signal: overrides?.signal,
        attempt,
        requestEncoding: 'latin1',
        responseEncoding: 'latin1',
      })
      const text = decodeBody(response.body, 'latin1')
      if (!isSuccess(response.status)) throw httpError(response, text, OPERATION, 'portal', url)
      return text
    },
    {
      sleep: sii.sleep,
      signal: overrides?.signal,
      onRetry: (error, attempt, delayMs) =>
        sii.logger.warn('sii retrying', { operation: OPERATION, attempt, delayMs, code: error.code }),
    },
  )
  if (isUnlistedIssuer(html))
    throw new DteError('SII_PORTAL_REJECTED', {
      rejection: 'companyNotAuthorized',
      operation: OPERATION,
      portalMessage: visibleText(html),
    })
  const entry = parseIssuerRegistry(html)
  if (entry.businessName === null && entry.documents.length === 0)
    throw new DteError('SII_PORTAL_UNEXPECTED_PAGE', {
      operation: OPERATION,
      step: PAGE,
      portalMessage: visibleText(html),
      body: bodyExcerpt(html),
    })
  return { rut, ...entry }
}
