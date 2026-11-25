/**
 * EN: Outcome class of an upload: accepted, accepted with objections, partially rejected, pending, rejected, query
 * error or unknown. `classifyUploadStatus` gives the class of a status code alone (`QueryEstUp` ESTADO or the receipts
 * REST `estado`) and never answers `partiallyRejected`; `uploadVerdict` settles it with the document counts.
 * ES: Clase de resultado de un envío: aceptado, aceptado con reparos, rechazado en parte, intermedio, rechazado, error
 * de consulta o desconocido. `classifyUploadStatus` da la clase de un código de estado solo (`ESTADO` de `QueryEstUp` o
 * `estado` del REST de boletas) y nunca responde `partiallyRejected`; `uploadVerdict` la zanja con las cantidades de
 * documentos.
 */
export type UploadStatusClass =
  | 'accepted'
  | 'acceptedWithObjections'
  | 'partiallyRejected'
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

// `RPT`, `VOF` and `RCO` are glossed as the SII's OpenAPI of its receipts API lists the states of an upload ("API SII -
// V1", 1.0.5): "Envio Repetido Rechazado", "No se encontro el archivo .xml" and "Rechazado por consistencia".
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
  RPT: { cls: 'rejected', message: 'Envío repetido rechazado' },
  RFR: { cls: 'rejected', message: 'Rechazado por error en firma' },
  VOF: { cls: 'rejected', message: 'No se encontró el archivo .xml' },
  RCT: { cls: 'rejected', message: 'Rechazado por error en carátula' },
  RCH: { cls: 'rejected', message: 'Rechazado' },
  RCO: { cls: 'rejected', message: 'Rechazado por consistencia' },
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
 * EN: The document counts a verdict is settled with.
 * ES: Las cantidades de documentos con que se zanja un veredicto.
 */
export type UploadVerdictCounts = {
  /** EN: Documents accepted. ES: `ACEPTADOS` / `aceptados` — Documentos aceptados. */
  readonly accepted: number
  /** EN: Documents rejected. ES: `RECHAZADOS` / `rechazados` — Documentos rechazados. */
  readonly rejected: number
  /** EN: Documents accepted with objections. ES: `REPAROS` / `reparos` — Documentos aceptados con reparos. */
  readonly objections: number
}

/**
 * EN: The verdict of an upload: the class of its status code, settled with the counts of its documents. A code that
 * says the envelope was processed (`EPR`) says nothing of the documents inside, which the SII accepts or rejects one by
 * one, so the counts only ever lower an accepted class: with rejected documents it is `rejected` when none was accepted
 * and `partiallyRejected` otherwise, and with objections and no rejection it is `acceptedWithObjections`. Without
 * counts, or with a class that is not an acceptance, the class of the code stands: counts never raise a pending or a
 * rejected envelope.
 * ES: El veredicto de un envío: la clase de su código de estado, zanjada con las cantidades de sus documentos. Un
 * código que dice que el sobre se procesó (`EPR`) no dice nada de los documentos que trae, que el SII acepta o rechaza
 * uno por uno, así que las cantidades solo bajan una clase de aceptación: con documentos rechazados es `rejected` si
 * ninguno se aceptó y `partiallyRejected` si alguno sí, y con reparos y sin rechazos es `acceptedWithObjections`. Sin
 * cantidades, o con una clase que no es de aceptación, queda la clase del código: las cantidades nunca suben un envío
 * pendiente o rechazado.
 * @param cls EN: class of the status code, from `classifyUploadStatus`. ES: clase del código de estado, de `classifyUploadStatus`.
 * @param counts EN: document counts, or null when the SII reported none. ES: cantidades de documentos, o null si el SII no las informó.
 * @returns EN: the settled class. ES: la clase zanjada.
 */
export const uploadVerdict = (cls: UploadStatusClass, counts: UploadVerdictCounts | null): UploadStatusClass => {
  if (counts === null || (cls !== 'accepted' && cls !== 'acceptedWithObjections')) return cls
  if (counts.rejected > 0) return counts.accepted + counts.objections > 0 ? 'partiallyRejected' : 'rejected'
  return counts.objections > 0 ? 'acceptedWithObjections' : cls
}

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
