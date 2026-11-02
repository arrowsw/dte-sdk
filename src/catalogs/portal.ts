import type { Environment } from './codes'
import { SII_HOSTS } from './endpoints'

/**
 * EN: CGI that authenticates with the client certificate; `?{referencia}` says where to go next.
 * ES: CGI que autentica con el certificado cliente; `?{referencia}` indica adónde ir después.
 */
export const CERTIFICATE_LOGIN_URL = 'https://herculesr.sii.cl/cgi_AUT2000/CAutInicio.cgi'

/**
 * EN: Certificate entry page, visited first for the load balancer cookies; it does not ask for the certificate.
 * ES: Página de ingreso con certificado, que se visita primero por las cookies del balanceador; no pide el certificado.
 */
export const CERTIFICATE_ENTRY_URL = 'https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoCertificado.html'

/**
 * EN: Where an explicit login lands.
 * ES: Adónde llega un inicio de sesión explícito.
 */
export const PORTAL_LANDING_URL = 'https://misiir.sii.cl/cgi_misii/siihome.cgi'

/**
 * EN: Where a session ends, as measured: after it, the portal asks to authenticate again.
 * ES: Dónde termina una sesión, según lo medido: después de ella, el portal vuelve a pedir autenticación.
 */
export const PORTAL_LOGOUT_URL = 'https://zeusr.sii.cl/cgi_AUT2000/autTermino.cgi'

/**
 * EN: URL of a DTE CGI page on the host of an environment.
 * ES: URL de una página CGI de DTE en el host de un ambiente.
 */
export const cgiUrl = (environment: Environment, page: string): string =>
  `https://${SII_HOSTS[environment]}/cvc_cgi/dte/${page}`

/**
 * EN: Why the SII refused a portal request.
 * ES: Por qué el SII rechazó una solicitud del portal.
 */
export type PortalRejection =
  | 'stampingBlocked'
  | 'inPersonRequired'
  | 'companyNotAuthorized'
  | 'optionNotAuthorized'
  | 'userWithoutPermission'
  | 'personWithPendingIssues'
  | 'activityVerificationPending'
  | 'typeNotEnabled'
  | 'quotaInsufficient'
  | 'quotaExceeded'
  | 'quotaCapReached'
  | 'foliosShort'
  | 'noAnnullableFolios'
  | 'rangeAlreadyAuthorized'
  | 'rangeAnnulled'
  | 'reobtainFormMissing'
  | 'reobtainDownloadMissing'
  | 'reobtainCafMissing'

/**
 * EN: What each rejection means and what to do about it, in Spanish, for the operator.
 * ES: Qué significa cada rechazo y qué hacer, en español, para el operador.
 */
export const PORTAL_REJECTIONS: Readonly<Record<PortalRejection, string>> = {
  stampingBlocked:
    'El SII no autoriza timbraje: hay folios suficientes sin usar. Se levanta emitiendo documentos con esos folios; anular suma en contra del cupo durante 6 meses.',
  inPersonRequired:
    'El SII exige completar la inscripción en persona: el representante legal debe ir a la oficina del SII del domicilio de la empresa.',
  companyNotAuthorized:
    'La empresa no está autorizada como emisor electrónico en este ambiente: falta completar la certificación o la postulación. No se arregla con permisos de usuario.',
  optionNotAuthorized:
    'El SII responde "no está autorizado para ingresar a esta opción" sin indicar la causa. Lo más frecuente es que la empresa aún no esté autorizada en este ambiente; en facturas, guías y notas revisar también la Verificación de Actividades.',
  userWithoutPermission:
    'El RUT del certificado no tiene permisos en la empresa en este ambiente: hay que reasignarle los permisos de firmar, enviar y obtener folios.',
  personWithPendingIssues:
    'La persona autenticada tiene situaciones pendientes con el SII y no puede hacer trámites de factura electrónica. No se resuelve reintentando: debe regularizarlas en el SII.',
  activityVerificationPending:
    'El RUT no registra Verificación de Actividades para este tipo de documento: se realiza en línea en sii.cl. No aplica a boletas.',
  typeNotEnabled:
    'El SII no ofrece este tipo de documento para timbraje con este RUT: falta certificarlo o habilitarlo. Reintentar no lo arregla.',
  quotaInsufficient:
    'El SII autoriza menos folios de los requeridos, porque hay folios timbrados sin usar. Hay que emitir con ellos o anularlos, o pedir en tandas.',
  quotaExceeded: 'La cantidad excede el máximo que el SII autoriza por solicitud para este tipo de documento.',
  quotaCapReached:
    'El SII autorizó menos folios de los requeridos y no hay más cupo en esta pasada: el tope lo fija según el historial de timbraje y emisión.',
  foliosShort: 'El SII otorgó menos folios de los requeridos.',
  noAnnullableFolios:
    'El timbraje está limitado y no quedan folios anulables: hay que emitir con los folios timbrados o esperar a que el SII recalcule el tope.',
  rangeAlreadyAuthorized:
    'El SII ya autorizó ese rango en una solicitud anterior y no devolvió el archivo: se puede reobtener desde el portal.',
  rangeAnnulled: 'El rango está anulado: el SII rechazaría cualquier documento emitido con esos folios.',
  reobtainFormMissing: 'El SII no devolvió el formulario de generación para este rango.',
  reobtainDownloadMissing: 'El SII autorizó la reobtención pero no ofreció la descarga del CAF.',
  reobtainCafMissing: 'El SII no devolvió el XML del CAF al reobtenerlo.',
}

/**
 * EN: The Spanish message of a rejection.
 * ES: El mensaje en español de un rechazo.
 */
export const portalRejectionMessage = (rejection: PortalRejection): string => PORTAL_REJECTIONS[rejection]
