import type { Environment } from './codes'

/**
 * EN: Base hosts of the DTE web services per environment.
 * ES: Hosts base de los web services DTE por ambiente: maullin (certificación) y palena (producción).
 */
export const SII_HOSTS: Readonly<Record<Environment, string>> = {
  certification: 'maullin.sii.cl',
  production: 'palena.sii.cl',
}

/**
 * EN: SOAP / CGI endpoints of one environment.
 * ES: Endpoints SOAP / CGI de un ambiente.
 */
export type SoapEndpoints = {
  /** EN: `CrSeed.jws`, seed for the SOAP token. ES: Semilla del token SOAP. */
  readonly seed: string
  /** EN: `GetTokenFromSeed.jws`. ES: Token a partir de la semilla firmada. */
  readonly token: string
  /** EN: `DTEUpload` multipart endpoint. ES: Subida de sobres, libros y RCOF. */
  readonly upload: string
  /** EN: `QueryEstUp.jws`, envelope status. ES: Estado de un envío por TrackID. */
  readonly uploadStatus: string
  /** EN: `QueryEstDte.jws`, single document status. ES: Estado de un documento puntual. */
  readonly documentStatus: string
}

const soapFor = (host: string): SoapEndpoints => ({
  seed: `https://${host}/DTEWS/CrSeed.jws`,
  token: `https://${host}/DTEWS/GetTokenFromSeed.jws`,
  upload: `https://${host}/cgi_dte/UPL/DTEUpload`,
  uploadStatus: `https://${host}/DTEWS/QueryEstUp.jws`,
  documentStatus: `https://${host}/DTEWS/QueryEstDte.jws`,
})

/**
 * EN: SOAP / CGI endpoints per environment (seed, token, upload, status).
 * ES: Endpoints SOAP / CGI por ambiente (semilla, token, DTEUpload, estados).
 */
export const SOAP_ENDPOINTS: Readonly<Record<Environment, SoapEndpoints>> = {
  certification: soapFor(SII_HOSTS.certification),
  production: soapFor(SII_HOSTS.production),
}

/**
 * EN: REST endpoints of the receipts API for one environment.
 * ES: Endpoints REST de la API de boletas de un ambiente.
 */
export type RestEndpoints = {
  /** EN: GET seed for the receipts REST API. ES: Semilla de la API REST de boletas. */
  readonly seed: string
  /** EN: POST signed seed → token. ES: Token REST a partir de la semilla firmada. */
  readonly token: string
  /** EN: multipart upload of `EnvioBOLETA`. ES: Envío REST de boletas. */
  readonly upload: string
  /** EN: envelope status prefix; append `{rut}-{dv}-{trackId}`. ES: Prefijo de estado del envío; se completa con `{rut}-{dv}-{trackId}`. */
  readonly status: string
  /** EN: per-document status prefix; append `{rut}-{dv}-{type}-{folio}/estado`. ES: Prefijo de estado por documento; se completa con `{rut}-{dv}-{tipo}-{folio}/estado`. */
  readonly documentStatus: string
}

const restFor = (apiHost: string, uploadHost: string): RestEndpoints => ({
  seed: `https://${apiHost}/recursos/v1/boleta.electronica.semilla`,
  token: `https://${apiHost}/recursos/v1/boleta.electronica.token`,
  upload: `https://${uploadHost}/recursos/v1/boleta.electronica.envio`,
  status: `https://${apiHost}/recursos/v1/boleta.electronica.envio/`,
  documentStatus: `https://${apiHost}/recursos/v1/boleta.electronica/`,
})

/**
 * EN: REST endpoints of the receipts API per environment.
 * ES: Endpoints REST de boletas por ambiente (apicert/pangal en certificación, api/rahue en producción).
 */
export const REST_ENDPOINTS: Readonly<Record<Environment, RestEndpoints>> = {
  certification: restFor('apicert.sii.cl', 'pangal.sii.cl'),
  production: restFor('api.sii.cl', 'rahue.sii.cl'),
}

/**
 * EN: Service URLs of the acceptance/claim registry web service (WSRECLAMO v1.2); SOAP calls are POSTed here.
 * ES: URLs del servicio de Registro de Aceptación/Reclamo (WSRECLAMO v1.2); las llamadas SOAP se envían por POST aquí.
 */
export const CLAIM_WS_ENDPOINTS: Readonly<Record<Environment, string>> = {
  certification: 'https://ws2.sii.cl/WSREGISTRORECLAMODTECERT/registroreclamodteservice',
  production: 'https://ws1.sii.cl/WSREGISTRORECLAMODTE/registroreclamodteservice',
}

/**
 * EN: WSDL of the acceptance/claim registry web service.
 * ES: WSDL del web service de Registro de Aceptación/Reclamo.
 */
export const CLAIM_WSDL_ENDPOINTS: Readonly<Record<Environment, string>> = {
  certification: `${CLAIM_WS_ENDPOINTS.certification}?wsdl`,
  production: `${CLAIM_WS_ENDPOINTS.production}?wsdl`,
}

/**
 * EN: User-Agent the SII upload CGI expects (it rejects modern browser strings).
 * ES: User-Agent que espera el CGI de subida del SII (rechaza cadenas de navegador modernas).
 */
export const UPLOAD_USER_AGENT = 'Mozilla/4.0 ( compatible; PROG 1.0; Windows NT)'
