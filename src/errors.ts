/**
 * EN: Stable error codes thrown by dte-sdk. Branch on `error.code`, never on the message text.
 * ES: Códigos de error estables que lanza dte-sdk. Discrimina por `error.code`, nunca por el texto del mensaje.
 */
export const DTE_ERROR_CODES = {
  INVALID_RUT: 'INVALID_RUT',
  INVALID_DOCUMENT_TYPE: 'INVALID_DOCUMENT_TYPE',
  INVALID_FOLIO: 'INVALID_FOLIO',
  INVALID_DATE: 'INVALID_DATE',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  MISSING_FIELD: 'MISSING_FIELD',
  FIELD_TOO_LONG: 'FIELD_TOO_LONG',
  CAF_INVALID: 'CAF_INVALID',
  CAF_EXPIRED: 'CAF_EXPIRED',
  CAF_TYPE_MISMATCH: 'CAF_TYPE_MISMATCH',
  CAF_ISSUER_MISMATCH: 'CAF_ISSUER_MISMATCH',
  FOLIO_OUT_OF_RANGE: 'FOLIO_OUT_OF_RANGE',
  CERT_INVALID: 'CERT_INVALID',
  CERT_PASSWORD_WRONG: 'CERT_PASSWORD_WRONG',
  CERT_EXPIRED: 'CERT_EXPIRED',
  XML_PARSE_FAILED: 'XML_PARSE_FAILED',
  SIGNATURE_NOT_FOUND: 'SIGNATURE_NOT_FOUND',
  ENCODING_UNSUPPORTED_CHAR: 'ENCODING_UNSUPPORTED_CHAR',
  ENVELOPE_EMPTY: 'ENVELOPE_EMPTY',
  ENVELOPE_KIND_MISMATCH: 'ENVELOPE_KIND_MISMATCH',
} as const

/**
 * EN: Union of every `DTE_ERROR_CODES` value.
 * ES: Unión de todos los valores de `DTE_ERROR_CODES`.
 */
export type DteErrorCode = (typeof DTE_ERROR_CODES)[keyof typeof DTE_ERROR_CODES]

/**
 * EN: Structured context of an error. May hold the offending value; it is never copied into `message`.
 * ES: Contexto estructurado de un error. Puede traer el valor ofensivo; nunca se copia al `message`.
 */
export type DteErrorDetails = Readonly<Record<string, unknown>>

const MESSAGES: Readonly<Record<DteErrorCode, string>> = {
  INVALID_RUT: 'Invalid RUT',
  INVALID_DOCUMENT_TYPE: 'Unsupported document type',
  INVALID_FOLIO: 'Folio must be a positive integer',
  INVALID_DATE: 'Date must be YYYY-MM-DD',
  INVALID_AMOUNT: 'Amount must be a finite number',
  MISSING_FIELD: 'Required field is missing',
  FIELD_TOO_LONG: 'Field exceeds the maximum length allowed by the SII schema',
  CAF_INVALID: 'CAF is not valid',
  CAF_EXPIRED: 'CAF has expired (6 months after its authorization date)',
  CAF_TYPE_MISMATCH: 'CAF document type does not match the document',
  CAF_ISSUER_MISMATCH: 'CAF issuer RUT does not match the document issuer',
  FOLIO_OUT_OF_RANGE: 'Folio is outside the CAF range',
  CERT_INVALID: 'Certificate is not valid',
  CERT_PASSWORD_WRONG: 'Certificate password is wrong',
  CERT_EXPIRED: 'Certificate has expired',
  XML_PARSE_FAILED: 'XML could not be parsed',
  SIGNATURE_NOT_FOUND: 'XML has no Signature element',
  ENCODING_UNSUPPORTED_CHAR: 'Text contains a character outside ISO-8859-1',
  ENVELOPE_EMPTY: 'Envelope has no documents',
  ENVELOPE_KIND_MISMATCH: 'Document type does not belong in this envelope kind',
}

// Only these detail keys are safe to show: field names and numbers, never user text.
const SAFE_DETAIL_KEYS = ['field', 'maxLength', 'length', 'type', 'folio', 'from', 'to', 'kind', 'index'] as const

const formatMessage = (code: DteErrorCode, details: DteErrorDetails): string => {
  const shown = SAFE_DETAIL_KEYS.filter((key) => details[key] !== undefined).map(
    (key) => `${key}=${String(details[key])}`,
  )
  return shown.length === 0 ? MESSAGES[code] : `${MESSAGES[code]} (${shown.join(', ')})`
}

/**
 * EN: Typed error thrown by dte-sdk. The message is generic (code + safe keys such as the field name); the
 * offending value, if any, lives in `details` so no RUT or free text leaks into logs.
 * ES: Error tipado que lanza dte-sdk. El mensaje es genérico (código + claves seguras como el nombre del campo);
 * el valor ofensivo, si lo hay, va en `details`, así ningún RUT ni texto libre llega a los logs.
 */
export class DteError extends Error {
  /** EN: Stable error code. ES: Código de error estable. */
  readonly code: DteErrorCode
  /** EN: Structured context. ES: Contexto estructurado. */
  readonly details: DteErrorDetails

  constructor(code: DteErrorCode, details: DteErrorDetails = {}) {
    super(formatMessage(code, details))
    this.name = 'DteError'
    this.code = code
    this.details = details
  }
}

/**
 * EN: Type guard for `DteError`.
 * ES: Guarda de tipo para `DteError`.
 * @param value EN: anything. ES: cualquier valor.
 * @returns EN: true when `value` is a `DteError`. ES: true cuando `value` es un `DteError`.
 */
export const isDteError = (value: unknown): value is DteError => value instanceof DteError

/**
 * EN: Message of an unknown thrown value: `Error.message`, or its string form for anything else. Fills
 * `DteError.details.reason` when wrapping errors from the underlying libraries.
 * ES: Mensaje de un valor lanzado desconocido: `Error.message`, o su forma de string para cualquier otra cosa. Llena
 * `DteError.details.reason` al envolver errores de las bibliotecas subyacentes.
 */
export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))
