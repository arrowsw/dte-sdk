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

// The states that the SII's "Manual de Desarrollador Externo - Consulta de Estado de Upload Dte" (OI2004_CEUPDTE_MDE
// 1.10, estado_envio.pdf of factura_mercado on sii.cl), 3.3 "Estados de Salida", lists are glossed as it glosses them:
// "RSC Rechazado por Error en Schema", "SOK Schema Validado", "CRT Carátula OK", "RFR Rechazado por Error en Firma",
// "FOK Firma de Envió Validada", "PDR Envió en Proceso", "RCT Rechazado por Error en Carátula" and "EPR Envió
// Procesado", spelled in sentence case and with their accents. Those eight glosses rest on that table; the other
// states are not in it. No document of the SII that lists the states of a book has been found, so the gloss and the
// class of every state of a book rest on field behaviour: `LOK`, `LSO`, `LRH` and `LNC`, and `LRS`, `LRC` and `LRF`,
// which the SII has answered to the upload of a book that does not validate against its schema, whose cover it
// refuses, and whose signature does not verify, each a rejection.
const UPLOAD_STATUS: Readonly<Record<string, StatusEntry>> = {
  EPR: { cls: 'accepted', message: 'Envío procesado' },
  LOK: { cls: 'accepted', message: 'Envío de libro aceptado' },
  RPR: { cls: 'acceptedWithObjections', message: 'Aceptado con reparos' },
  REC: { cls: 'pending', message: 'Envío recibido, esperando validación' },
  SOK: { cls: 'pending', message: 'Schema validado' },
  FOK: { cls: 'pending', message: 'Firma de envío validada' },
  PRD: { cls: 'pending', message: 'Envío en proceso, validando carátula' },
  CRT: { cls: 'pending', message: 'Carátula OK' },
  DNK: { cls: 'pending', message: 'En proceso de revisión' },
  PDR: { cls: 'pending', message: 'Envío en proceso' },
  LSO: { cls: 'pending', message: 'Schema de libro correcto, procesando contenido' },
  '0': { cls: 'pending', message: 'Enviado al SII, pendiente de validación' },
  RPT: { cls: 'rejected', message: 'Rechazado por schema' },
  RFR: { cls: 'rejected', message: 'Rechazado por error en firma' },
  VOF: { cls: 'rejected', message: 'Error interno del SII' },
  RCT: { cls: 'rejected', message: 'Rechazado por error en carátula' },
  RCH: { cls: 'rejected', message: 'Rechazado' },
  RCO: { cls: 'rejected', message: 'Envío rechazado' },
  RSC: { cls: 'rejected', message: 'Rechazado por error en schema' },
  RLV: { cls: 'rejected', message: 'Rechazado, error en documento' },
  LNC: { cls: 'rejected', message: 'Tipo de envío de libro no corresponde' },
  LRH: { cls: 'rejected', message: 'Libro rechazado con historial' },
  LRS: { cls: 'rejected', message: 'Libro rechazado por error en schema' },
  LRC: { cls: 'rejected', message: 'Libro rechazado por error en carátula' },
  LRF: { cls: 'rejected', message: 'Libro rechazado por error en firma' },
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

// The receipts REST API answers a state with no gloss, so the gloss of a state on that channel is the one the SII's
// OpenAPI of that API gives it ("API SII - V1", 1.0.5): "RCH - Rechazado por errores en informacion", "RCO - Rechazado
// por consistencia", "VOF - No se encontro el archivo .xml" and "RPT - Envio Repetido Rechazado", spelled here with
// their accents as the table above is. That file describes the REST channel alone; on SOAP the SII sends its own
// gloss, and the table above stands for a state without one.
const REST_OVERRIDES: Readonly<Record<string, StatusEntry>> = {
  RLV: { cls: 'accepted', message: 'Aceptado, documentos válidos' },
  RCH: { cls: 'rejected', message: 'Rechazado por errores en información' },
  RCO: { cls: 'rejected', message: 'Rechazado por consistencia' },
  VOF: { cls: 'rejected', message: 'No se encontró el archivo .xml' },
  RPT: { cls: 'rejected', message: 'Envío repetido rechazado' },
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
 * EN: Where a check of `uploadStatusChecks` rests: a document of the SII, or field behaviour (what the SII has been seen
 * to do, which no document found says).
 * ES: En qué se apoya una revisión de `uploadStatusChecks`: un documento del SII, o el comportamiento de campo (lo que
 * se ha visto hacer al SII, que ningún documento encontrado dice).
 */
export type UploadStatusCheckBasis = 'siiDocument' | 'fieldBehaviour'

/**
 * EN: One thing to look at when the SII answers a state to an upload.
 * ES: Una cosa que revisar cuando el SII responde un estado a un envío.
 */
export type UploadStatusCheck = {
  /** EN: What to check, in Spanish, as the glosses are. ES: Qué revisar, en español, como las glosas. */
  readonly check: string
  /** EN: Where the check rests. ES: En qué se apoya la revisión. */
  readonly basis: UploadStatusCheckBasis
  /** EN: The document of the SII it rests on, or null for field behaviour. ES: El documento del SII en que se apoya, o null si es comportamiento de campo. */
  readonly source: string | null
}

const ESTADO_ENVIO = 'Consulta de Estado de Upload Dte (OI2004_CEUPDTE_MDE 1.10), 3.3'
const ESTADO_ENVIO_EPR = 'Consulta de Estado de Upload Dte (OI2004_CEUPDTE_MDE 1.10), 3.4.1 y capítulo 5'
const FORMATO_IECV = 'Formato de Información de Compras y Ventas 2.2'
const BOOK_TYPES = 'LceSiiTypes_v10.xsd, DoctoType'
const sii = (check: string, source: string): UploadStatusCheck => ({ check, basis: 'siiDocument', source })
const field = (check: string): UploadStatusCheck => ({ check, basis: 'fieldBehaviour', source: null })

const SIGNATURE_CHECKS: readonly UploadStatusCheck[] = [
  field(
    'A menudo no es la firma: el RUT que firma el envío necesita permiso para enviar documentos en ese ambiente, y ' +
      'certificación y producción llevan registros de usuarios separados, así que un permiso dado en uno no vale en el otro.',
  ),
  field('Después, la firma del archivo.'),
]
const VALIDATE =
  'Validar el archivo contra su esquema del SII antes de enviarlo: validateBeforeUpload de dte-sdk/schemas detiene ' +
  'la subida (validateAgainstSchema solo valida).'

// What to look at for each state. A state's own gloss rests where the table above says; each check here says where it
// rests. The manual of `QueryEstUp` gives the counts of the documents with `EPR` alone, in the test steps of its
// chapter 5 ("ACEPTADOS (Solo si Estado es EPR)"), and its example of an `EPR` (3.4.1) reports one document rejected
// and none accepted. The schema of the purchase and sales book (`DoctoType` of `LceSiiTypes_v10.xsd`) lists no
// type 52, so a dispatch guide has no place there. The format of the books says what a
// special book is ("Archivos ESPECIALES: corresponden a archivos requeridos por el SII vía una notificación", "Un
// archivo especial se distingue de los libros regulares, en que indica el folio de la notificación en la carátula")
// and lists `RECTIFICA` among the values of `TipoLibro`, not of `TipoEnvio`.
const UPLOAD_STATUS_CHECKS: Readonly<Record<string, readonly UploadStatusCheck[]>> = {
  RFR: SIGNATURE_CHECKS,
  LRF: SIGNATURE_CHECKS,
  EPR: [
    sii(
      'Procesado no es aceptado: leer las cantidades de documentos aceptados, con reparos y rechazados.',
      ESTADO_ENVIO_EPR,
    ),
  ],
  RSC: [sii(VALIDATE, ESTADO_ENVIO)],
  LRS: [
    field(VALIDATE),
    sii('Que cada tipo de documento sea de ese libro: una guía de despacho va en el libro de guías.', BOOK_TYPES),
  ],
  RCT: [
    sii('La carátula del envío.', ESTADO_ENVIO),
    field('El número y la fecha de resolución de la carátula deben ser los de la empresa en ese ambiente.'),
  ],
  LRC: [
    field('La carátula del libro: su tipo (TipoLibro) y su folio de notificación (FolioNotificacion).'),
    sii(
      'Un libro que pide el SII por una notificación es un libro especial (TipoLibro ESPECIAL) y lleva el folio de ' +
        'la notificación en la carátula (FolioNotificacion).',
      FORMATO_IECV,
    ),
    sii(
      'La rectificación de un período es un tipo de libro (TipoLibro RECTIFICA, con CodAutRec), no un tipo de envío.',
      FORMATO_IECV,
    ),
  ],
  LRH: [
    field('Visto en un libro cuyos totales no cuadran con sus líneas.'),
    field('Visto en un libro de ventas que trae un campo propio del libro de compras.'),
    field('Visto en un libro que deja fuera de la línea de una liquidación factura sus comisiones.'),
  ],
  LNC: [field('Visto al enviar de nuevo un período que ya tiene un libro aceptado.')],
}

/**
 * EN: What to look at when the SII answers a state to an upload: a few short checks, each with the basis it rests on.
 * It lists `RFR`, `EPR`, `RSC`, `RCT` and the states of a book `LRF`, `LRS`, `LRC`, `LRH` and `LNC`; any other state
 * has none. The glosses say what the SII answered; these say where to start.
 * ES: Qué revisar cuando el SII responde un estado a un envío: unas pocas revisiones cortas, cada una con aquello en que
 * se apoya. Trae `RFR`, `EPR`, `RSC`, `RCT` y los estados de un libro `LRF`, `LRS`, `LRC`, `LRH` y `LNC`; cualquier
 * otro estado no tiene ninguna. Las glosas dicen qué respondió el SII; estas dicen por dónde empezar.
 * @param code EN: `ESTADO` as returned by the SII. ES: `ESTADO` tal como lo devuelve el SII.
 * @returns EN: the checks, in the order to make them; empty when none is listed. ES: las revisiones, en el orden en que hacerlas; vacío si no hay ninguna.
 */
export const uploadStatusChecks = (code: string): readonly UploadStatusCheck[] =>
  Object.prototype.hasOwnProperty.call(UPLOAD_STATUS_CHECKS, code) ? UPLOAD_STATUS_CHECKS[code] : []

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
