/**
 * EN: Outcome class of a `DTEUpload` reception `STATUS`.
 * ES: Clase de resultado del `STATUS` de `RECEPCIONDTE` (respuesta del `DTEUpload`): recibido, rechazado, no
 * autenticado, esquema inválido (o duplicado: lo decide `DETAIL`), ya enviado o desconocido.
 */
export type ReceptionStatusClass =
  | 'received'
  | 'rejected'
  | 'notAuthenticated'
  | 'schemaInvalid'
  | 'alreadyUploaded'
  | 'unknown'

type ReceptionEntry = { readonly cls: ReceptionStatusClass; readonly message: string }

/**
 * EN: `RECEPCIONDTE/STATUS` codes of the `DTEUpload` CGI with their Spanish gloss.
 * ES: Códigos `STATUS` de `RECEPCIONDTE` del CGI `DTEUpload` con su glosa.
 */
export const RECEPTION_STATUS: Readonly<Record<string, ReceptionEntry>> = {
  '0': { cls: 'received', message: 'Envío recibido, TrackID asignado' },
  '1': { cls: 'rejected', message: 'El remitente no tiene permiso para enviar por esta empresa' },
  '2': { cls: 'rejected', message: 'Error en el tamaño del archivo (muy grande o muy chico)' },
  '3': { cls: 'rejected', message: 'Archivo cortado o incompleto' },
  '5': { cls: 'notAuthenticated', message: 'No autenticado: token ausente o vencido' },
  '6': { cls: 'rejected', message: 'Empresa no autorizada a enviar archivos' },
  '7': { cls: 'schemaInvalid', message: 'Esquema inválido o archivo ya enviado (ver DETAIL)' },
  '8': { cls: 'rejected', message: 'Error en la firma del documento' },
  '9': { cls: 'rejected', message: 'Sistema bloqueado, reintentar más tarde' },
  '99': { cls: 'alreadyUploaded', message: 'Archivo ya fue enviado anteriormente' },
}

/**
 * EN: Classifies a `RECEPCIONDTE/STATUS` code.
 * ES: Clasifica un código `STATUS` de `RECEPCIONDTE`.
 */
export const classifyReceptionStatus = (code: string): ReceptionStatusClass => RECEPTION_STATUS[code]?.cls ?? 'unknown'

/**
 * EN: Spanish gloss of a `RECEPCIONDTE/STATUS` code.
 * ES: Glosa en español de un código `STATUS` de `RECEPCIONDTE`.
 */
export const receptionStatusMessage = (code: string): string =>
  RECEPTION_STATUS[code]?.message ?? `Estado de recepción desconocido: ${code}`

/**
 * EN: True for `STATUS` 9 (system blocked), the only reception status that clears by itself.
 * ES: True para `STATUS` 9 (sistema bloqueado), el único estado de recepción que se resuelve solo.
 */
export const isRetryableReceptionStatus = (code: string): boolean => code === '9'

const SCHEMA_ERROR_PATTERN = /CHR-\d+|SCH-\d+|cvc-[\w.-]+/i

/**
 * EN: True when the `DETAIL/ERROR` lines of a `STATUS` 7 reply describe a real charset or schema rejection
 * (`CHR-00001`, `SCH-00001`, `cvc-…`) rather than a duplicate upload.
 * ES: True cuando las líneas `DETAIL/ERROR` de un `STATUS` 7 describen un rechazo real de charset o esquema
 * (`CHR-00001`, `SCH-00001`, `cvc-…`) y no un envío duplicado.
 */
export const isSchemaRejection = (errors: readonly string[]): boolean =>
  errors.some((line) => SCHEMA_ERROR_PATTERN.test(line))
