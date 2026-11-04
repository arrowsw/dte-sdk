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
 * EN: Hosts of the RCV services per environment.
 * ES: Hosts de los servicios del RCV por ambiente.
 */
export const RCV_HOSTS: Readonly<Record<Environment, string>> = {
  certification: 'www4c.sii.cl',
  production: 'www4.sii.cl',
}

/**
 * EN: URL of an RCV app on the host of an environment, with the trailing slash its login redirect needs.
 * ES: URL de una app del RCV en el host de un ambiente, con la barra final que necesita su redirección de ingreso.
 */
export const rcvAppUrl = (environment: Environment, app: string): string => `https://${RCV_HOSTS[environment]}/${app}/`

/**
 * EN: One JSON service of the RCV.
 * ES: Un servicio JSON del RCV.
 */
export type RcvService = {
  /** EN: App visited first, which leaves the session token in the jar. ES: App que se visita primero, y que deja el token de sesión en la bolsa. */
  readonly entryApp: string
  /** EN: App the calls belong to. ES: App a la que pertenecen las llamadas. */
  readonly app: string
  /** EN: Path of the facade inside the app. ES: Ruta de la fachada dentro de la app. */
  readonly facade: string
  /** EN: Namespace of the envelope, without the method. ES: `namespace` del sobre, sin el método. */
  readonly namespace: string
  /** EN: The envelope carries a fixed `transactionId` and a `page`, instead of a UUID and null. ES: El sobre lleva `transactionId` fijo y `page`, en vez de un UUID y null. */
  readonly paged: boolean
}

/**
 * EN: The three RCV services: the documents of a period, the official register and the purchase complements.
 * ES: Los tres servicios del RCV: los documentos de un período, el registro oficial y los complementos de compra.
 */
export const RCV_SERVICES: Readonly<Record<'documents' | 'register' | 'complements', RcvService>> = {
  documents: {
    entryApp: 'consemitidosinternetui',
    app: 'consemitidosinternetui',
    facade: 'services/data/facadeService',
    namespace: 'cl.sii.sdi.lob.diii.consemitidos.data.api.interfaces.FacadeService',
    paged: false,
  },
  register: {
    entryApp: 'consdcvinternetui',
    app: 'consdcvinternetui',
    facade: 'services/data/facadeService',
    namespace: 'cl.sii.sdi.lob.diii.consdcv.data.api.interfaces.FacadeService',
    paged: false,
  },
  complements: {
    entryApp: 'consdcvinternetui',
    app: 'complementoscvui',
    facade: 'services/data/facadeServiceCompCompraService',
    namespace: 'cl.sii.sdi.lob.diii.dcv.data.api.interfaces.compcompra.FacadeServiceCompCompra',
    paged: true,
  },
}

/**
 * EN: Base of the MIPYME backup pages. It exists only in production: there is no certification host.
 * ES: Base de las páginas del respaldo MIPYME. Existe solo en producción: no hay host de certificación.
 */
export const MIPYME_BACKUP_BASE_URL = 'https://www1.sii.cl/cgi-bin/Portal001'

/**
 * EN: Which side of a document the taxpayer is on.
 * ES: En qué lado de un documento está el contribuyente.
 */
export type DocumentDirection = 'issued' | 'received'

/**
 * EN: Which book of the register.
 * ES: Qué libro del registro.
 */
export type RegisterOperation = 'purchase' | 'sale'

/**
 * EN: Accounting status of a document in the register.
 * ES: Estado contable de un documento en el registro.
 */
export type AccountingStatus = 'registered' | 'pending' | 'notIncluded' | 'claimed'

/**
 * EN: `operacion` of the period documents per direction.
 * ES: `operacion` de los documentos de un período según la dirección: 1 emitidos, 2 recibidos.
 */
export const DOCUMENT_OPERATIONS: Readonly<Record<DocumentDirection, number>> = { issued: 1, received: 2 }

/**
 * EN: `ORIGEN` of the backup per direction.
 * ES: `ORIGEN` del respaldo según la dirección: ENV emitidos, RCP recibidos.
 */
export const BACKUP_ORIGINS: Readonly<Record<DocumentDirection, string>> = { issued: 'ENV', received: 'RCP' }

/**
 * EN: `operacion` of the register.
 * ES: `operacion` del registro: COMPRA o VENTA.
 */
export const REGISTER_OPERATIONS: Readonly<Record<RegisterOperation, string>> = { purchase: 'COMPRA', sale: 'VENTA' }

/**
 * EN: `estadoContab` of the register.
 * ES: `estadoContab` del registro: REGISTRO, PENDIENTE, NO_INCLUIR o RECLAMADO.
 */
export const ACCOUNTING_STATES: Readonly<Record<AccountingStatus, string>> = {
  registered: 'REGISTRO',
  pending: 'PENDIENTE',
  notIncluded: 'NO_INCLUIR',
  claimed: 'RECLAMADO',
}

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
  | 'backupCaptcha'
  | 'backupIndeterminate'
  | 'backupNoData'
  | 'backupRefused'
  | 'backupNoCompany'
  | 'backupDayOverLimit'
  | 'backupDayUnknownTypes'
  | 'purchaseChangeNotConfirmed'

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
  backupCaptcha:
    'El SII activó el captcha en el respaldo MIPYME: no se puede automatizar mientras esté encendido. No se resuelve reintentando en un loop: hay que intentar más tarde.',
  backupIndeterminate:
    'El portal devolvió varios mensajes de su plantilla, sin un veredicto único: no se puede concluir nada, tampoco que no haya datos. Hay que intentar más tarde.',
  backupNoData:
    'El SII informa que no existe información en MIPYME para este RUT. Es un veredicto definitivo: no hay nada que descargar.',
  backupRefused: 'El portal rechazó el respaldo MIPYME: el motivo es el mensaje del SII, en `details.portalMessage`.',
  backupNoCompany:
    'El portal devolvió la página de ingreso ("Seleccionar empresa") sin ningún mensaje. No se pudo determinar la causa.',
  backupDayOverLimit:
    'Un solo día y tipo de documento supera los 20 documentos por descarga que permite el SII: no se puede dividir más, y por eso no se descargó nada.',
  backupDayUnknownTypes:
    'Un solo día supera los 20 documentos por descarga y tiene documentos de tipos que no se saben separar: no se pudo cubrir completo, y por eso no se descargó nada.',
  purchaseChangeNotConfirmed:
    'El SII no confirmó el cambio en el registro de compras, pero pudo haberse aplicado: hay que releer el documento antes de reintentar.',
}

/**
 * EN: The Spanish message of a rejection.
 * ES: El mensaje en español de un rechazo.
 */
export const portalRejectionMessage = (rejection: PortalRejection): string => PORTAL_REJECTIONS[rejection]
