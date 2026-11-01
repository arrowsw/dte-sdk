/**
 * EN: Outcome class of an envelope status code (`QueryEstUp` ESTADO or the receipts REST `estado`).
 * ES: Clase de resultado de un código de estado de envío: aceptado, aceptado con reparos, intermedio, rechazado, error de consulta o desconocido.
 */
export type UploadStatusClass =
  | 'accepted'
  | 'acceptedWithObjections'
  | 'pending'
  | 'rejected'
  | 'queryError'
  | 'unknown'

/**
 * EN: Channel the status came from: `soap` (QueryEstUp / DTEUpload) or `rest` (receipts API). `RLV` means success on REST and rejection on SOAP.
 * ES: Canal del estado: `soap` (QueryEstUp / DTEUpload) o `rest` (API de boletas). `RLV` es éxito en REST y rechazo en SOAP.
 */
export type UploadChannel = 'soap' | 'rest'

type StatusEntry = { readonly cls: UploadStatusClass; readonly message: string }

const QUERY_ERROR_MESSAGE = 'Error de consulta del SII, reintentar más tarde'

const UPLOAD_STATUS: Readonly<Record<string, StatusEntry>> = {
  EPR: { cls: 'accepted', message: 'Envío procesado' },
  LOK: { cls: 'accepted', message: 'Envío de libro aceptado' },
  RPR: { cls: 'acceptedWithObjections', message: 'Aceptado con reparos' },
  REC: { cls: 'pending', message: 'Envío recibido, esperando validación' },
  SOK: { cls: 'pending', message: 'Schema validado, validando firma' },
  FOK: { cls: 'pending', message: 'Firma validada, procesando envío' },
  PRD: { cls: 'pending', message: 'Envío en proceso, validando carátula' },
  CRT: { cls: 'pending', message: 'Carátula validada, finalizando proceso' },
  DNK: { cls: 'pending', message: 'En proceso de revisión' },
  PDR: { cls: 'pending', message: 'Envío en proceso, validando' },
  LSO: { cls: 'pending', message: 'Schema de libro correcto, procesando contenido' },
  '0': { cls: 'pending', message: 'Enviado al SII, pendiente de validación' },
  RPT: { cls: 'rejected', message: 'Rechazado por schema' },
  RFR: { cls: 'rejected', message: 'Rechazado por error en firma' },
  VOF: { cls: 'rejected', message: 'Error interno del SII' },
  RCT: { cls: 'rejected', message: 'Rechazado por error en carátula' },
  RCH: { cls: 'rejected', message: 'Rechazado' },
  RSC: { cls: 'rejected', message: 'Rechazado por error en schema' },
  RLV: { cls: 'rejected', message: 'Rechazado, error en documento' },
  LNC: { cls: 'rejected', message: 'Tipo de envío de libro no corresponde' },
  LRH: { cls: 'rejected', message: 'Libro rechazado con historial' },
  '-1': { cls: 'queryError', message: 'Campo estado no retornado por el SII, reintentar más tarde' },
  '-2': { cls: 'queryError', message: QUERY_ERROR_MESSAGE },
  '-3': { cls: 'queryError', message: 'RUT de usuario no existe en el SII, verificar autenticación' },
  '-4': { cls: 'queryError', message: QUERY_ERROR_MESSAGE },
  '-5': { cls: 'queryError', message: QUERY_ERROR_MESSAGE },
  '-6': { cls: 'queryError', message: 'Usuario no autorizado para consultar' },
  '-7': { cls: 'queryError', message: QUERY_ERROR_MESSAGE },
  '-8': { cls: 'queryError', message: QUERY_ERROR_MESSAGE },
  '-9': { cls: 'queryError', message: QUERY_ERROR_MESSAGE },
  '-10': { cls: 'queryError', message: 'Error de validación del RUT de usuario' },
  '-11': { cls: 'queryError', message: QUERY_ERROR_MESSAGE },
  '-12': { cls: 'queryError', message: QUERY_ERROR_MESSAGE },
  '-13': { cls: 'queryError', message: 'RUT de usuario nulo, verificar autenticación' },
  '-14': { cls: 'queryError', message: 'Error en el XML de retorno del SII, reintentar más tarde' },
}

const REST_OVERRIDES: Readonly<Record<string, StatusEntry>> = {
  RLV: { cls: 'accepted', message: 'Aceptado, documentos válidos' },
}

const lookup = (code: string, channel: UploadChannel): StatusEntry | undefined =>
  channel === 'rest' ? (REST_OVERRIDES[code] ?? UPLOAD_STATUS[code]) : UPLOAD_STATUS[code]

/**
 * EN: Classifies an envelope status code. Negative codes are errors of the query service, not of the envelope.
 * ES: Clasifica un código de estado de envío. Los códigos negativos son errores del servicio de consulta, no del envío.
 * @param code EN: `ESTADO` as returned by the SII. ES: `ESTADO` tal como lo devuelve el SII.
 * @param channel EN: `soap` (default) or `rest`. ES: `soap` (por defecto) o `rest`.
 */
export const classifyUploadStatus = (code: string, channel: UploadChannel = 'soap'): UploadStatusClass =>
  lookup(code, channel)?.cls ?? 'unknown'

/**
 * EN: Spanish gloss of an envelope status code.
 * ES: Glosa en español de un código de estado de envío.
 */
export const uploadStatusMessage = (code: string, channel: UploadChannel = 'soap'): string =>
  lookup(code, channel)?.message ?? `Estado desconocido: ${code}`

/**
 * EN: True when the status is a transient query error (`-1` … `-14`) worth retrying.
 * ES: True cuando el estado es un error transitorio de consulta (`-1` … `-14`) que conviene reintentar.
 */
export const isRetryableStatus = (code: string): boolean => classifyUploadStatus(code) === 'queryError'

/**
 * EN: Outcome class of a single-document status (`QueryEstDte` ESTADO).
 * ES: Clase de resultado del estado de un documento (`QueryEstDte`): recibido, recibido con datos distintos, no recibido, no autorizado, modificado por nota, anulado por nota, error de consulta o desconocido.
 */
export type DocumentStatusClass =
  | 'received'
  | 'receivedWithMismatch'
  | 'notReceived'
  | 'notAuthorized'
  | 'modified'
  | 'cancelled'
  | 'queryError'
  | 'unknown'

type DocumentStatusEntry = { readonly cls: DocumentStatusClass; readonly message: string }

const DOCUMENT_STATUS: Readonly<Record<string, DocumentStatusEntry>> = {
  DOK: { cls: 'received', message: 'Documento recibido por el SII, datos coinciden' },
  DNK: { cls: 'receivedWithMismatch', message: 'Documento recibido por el SII, datos no coinciden' },
  FAU: { cls: 'notReceived', message: 'DTE no recibido por el SII' },
  FNA: { cls: 'notAuthorized', message: 'DTE no autorizado' },
  EMP: { cls: 'notAuthorized', message: 'Empresa no autorizada a emitir DTE' },
  TMD: { cls: 'modified', message: 'Existe nota de débito que modifica textos' },
  TMC: { cls: 'modified', message: 'Existe nota de crédito que modifica textos' },
  MMD: { cls: 'modified', message: 'Existe nota de débito que modifica montos' },
  MMC: { cls: 'modified', message: 'Existe nota de crédito que modifica montos' },
  AND: { cls: 'cancelled', message: 'Existe nota de débito que anula el documento' },
  ANC: { cls: 'cancelled', message: 'Existe nota de crédito que anula el documento' },
  FAN: { cls: 'cancelled', message: 'Folio anulado' },
}

/**
 * EN: Classifies a `QueryEstDte` status code.
 * ES: Clasifica un código de estado de `QueryEstDte` (DOK/DNK/FAU/FNA/EMP, notas que modifican o anulan, errores negativos).
 */
export const classifyDocumentStatus = (code: string): DocumentStatusClass => {
  const entry = DOCUMENT_STATUS[code]
  if (entry) return entry.cls
  return /^-\d+$/.test(code) ? 'queryError' : 'unknown'
}

/**
 * EN: Spanish gloss of a `QueryEstDte` status code.
 * ES: Glosa en español de un código de estado de `QueryEstDte`.
 */
export const documentStatusMessage = (code: string): string => {
  const entry = DOCUMENT_STATUS[code]
  if (entry) return entry.message
  return /^-\d+$/.test(code) ? QUERY_ERROR_MESSAGE : `Estado desconocido: ${code}`
}

// Statuses that mean the SII rejected the authentication token: `QueryEst*` -3/-13 and the 001/002/003 token errors.
const TOKEN_ERROR_STATUS: ReadonlySet<string> = new Set(['-3', '-13', '001', '002', '003'])

/**
 * EN: True when a `QueryEstUp`/`QueryEstDte` status means the token was rejected (renew it and retry once).
 * ES: True cuando un estado de `QueryEstUp`/`QueryEstDte` significa token rechazado (renovar y reintentar una vez).
 */
export const isTokenErrorStatus = (code: string): boolean => TOKEN_ERROR_STATUS.has(code)
