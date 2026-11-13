/**
 * EN: Stable error codes thrown by dte-sdk. Branch on `error.code`, never on the message text.
 * ES: Códigos de error estables que lanza dte-sdk. Discrimina por `error.code`, nunca por el texto del mensaje.
 */
export const DTE_ERROR_CODES = {
  INVALID_RUT: 'INVALID_RUT',
  INVALID_DOCUMENT_TYPE: 'INVALID_DOCUMENT_TYPE',
  INVALID_FOLIO: 'INVALID_FOLIO',
  INVALID_DATE: 'INVALID_DATE',
  INVALID_TIME: 'INVALID_TIME',
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
  CERT_NOT_YET_VALID: 'CERT_NOT_YET_VALID',
  XML_PARSE_FAILED: 'XML_PARSE_FAILED',
  SIGNATURE_NOT_FOUND: 'SIGNATURE_NOT_FOUND',
  ENCODING_UNSUPPORTED_CHAR: 'ENCODING_UNSUPPORTED_CHAR',
  ENVELOPE_EMPTY: 'ENVELOPE_EMPTY',
  ENVELOPE_KIND_MISMATCH: 'ENVELOPE_KIND_MISMATCH',
  INVALID_OPTION: 'INVALID_OPTION',
  TRANSPORT_UNAVAILABLE: 'TRANSPORT_UNAVAILABLE',
  TRANSPORT_FAILED: 'TRANSPORT_FAILED',
  TRANSPORT_TLS: 'TRANSPORT_TLS',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  REQUEST_ABORTED: 'REQUEST_ABORTED',
  SII_HTTP_ERROR: 'SII_HTTP_ERROR',
  SII_RESPONSE_INVALID: 'SII_RESPONSE_INVALID',
  SII_SOAP_FAULT: 'SII_SOAP_FAULT',
  SII_SEED_FAILED: 'SII_SEED_FAILED',
  SII_TOKEN_FAILED: 'SII_TOKEN_FAILED',
  SII_TOKEN_INVALID: 'SII_TOKEN_INVALID',
  SII_UPLOAD_REJECTED: 'SII_UPLOAD_REJECTED',
  SII_QUERY_ERROR: 'SII_QUERY_ERROR',
  WAIT_TIMEOUT: 'WAIT_TIMEOUT',
  BOOK_TOTAL_MISMATCH: 'BOOK_TOTAL_MISMATCH',
  SII_PORTAL_LOGIN_FAILED: 'SII_PORTAL_LOGIN_FAILED',
  SII_PORTAL_CERT_NOT_ENABLED: 'SII_PORTAL_CERT_NOT_ENABLED',
  SII_PORTAL_SESSION_LIMIT: 'SII_PORTAL_SESSION_LIMIT',
  SII_PORTAL_SESSION_EXPIRED: 'SII_PORTAL_SESSION_EXPIRED',
  SII_PORTAL_BLOCKED: 'SII_PORTAL_BLOCKED',
  SII_PORTAL_REJECTED: 'SII_PORTAL_REJECTED',
  SII_PORTAL_UNEXPECTED_PAGE: 'SII_PORTAL_UNEXPECTED_PAGE',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
  PDF_RENDER_FAILED: 'PDF_RENDER_FAILED',
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
  INVALID_TIME: 'Time must be HH:MM:SS or HH:MM',
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
  CERT_NOT_YET_VALID: 'Certificate is not valid yet',
  XML_PARSE_FAILED: 'XML could not be parsed',
  SIGNATURE_NOT_FOUND: 'XML has no Signature element',
  ENCODING_UNSUPPORTED_CHAR: 'Text contains a character outside ISO-8859-1',
  ENVELOPE_EMPTY: 'Envelope has no documents',
  ENVELOPE_KIND_MISMATCH: 'Document type does not belong in this envelope kind',
  INVALID_OPTION: 'Option value is not valid',
  TRANSPORT_UNAVAILABLE: 'No HTTP transport is available in this runtime',
  TRANSPORT_FAILED: 'HTTP request failed before a response arrived',
  TRANSPORT_TLS: 'TLS handshake or certificate verification failed',
  REQUEST_TIMEOUT: 'Request timed out',
  REQUEST_ABORTED: 'Request was aborted by the caller',
  SII_HTTP_ERROR: 'SII answered with an HTTP error status',
  SII_RESPONSE_INVALID: 'SII response could not be interpreted',
  SII_SOAP_FAULT: 'SII answered with a SOAP fault',
  SII_SEED_FAILED: 'SII refused to issue a seed',
  SII_TOKEN_FAILED: 'SII refused to issue a token',
  SII_TOKEN_INVALID: 'SII rejected the authentication token',
  SII_UPLOAD_REJECTED: 'SII rejected the upload',
  SII_QUERY_ERROR: 'SII status query failed',
  WAIT_TIMEOUT: 'Timed out waiting for the SII status',
  BOOK_TOTAL_MISMATCH: 'Book line total does not match the SII formula',
  SII_PORTAL_LOGIN_FAILED: 'SII portal login gave no session',
  SII_PORTAL_CERT_NOT_ENABLED: 'Certificate is not enabled as a login method at the SII',
  SII_PORTAL_SESSION_LIMIT: 'SII reports too many authenticated sessions for this RUT',
  SII_PORTAL_SESSION_EXPIRED: 'SII portal keeps asking to authenticate',
  SII_PORTAL_BLOCKED: 'SII firewall or captcha blocked the request',
  SII_PORTAL_REJECTED: 'SII portal refused the request',
  SII_PORTAL_UNEXPECTED_PAGE: 'SII portal answered a page that could not be interpreted',
  DEPENDENCY_UNAVAILABLE: 'A library this function needs could not be loaded',
  PDF_RENDER_FAILED: 'The PDF library failed while drawing the printed sample',
}

// Only these detail keys are safe to show: field names, codes and numbers, never user text, URLs or bodies.
const SAFE_DETAIL_KEYS = [
  'field',
  'maxLength',
  'length',
  'type',
  'folio',
  'from',
  'to',
  'kind',
  'index',
  'status',
  'httpStatus',
  'code',
  'attempts',
  'channel',
  'operation',
  'trackId',
  'expected',
  'actual',
  'rejection',
  'step',
  'module',
  'day',
  'listed',
  'covered',
] as const

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
 * EN: The code of a thrown value when it is a `DteError`, else undefined. For results that report failures as data.
 * ES: El código de un valor lanzado cuando es un `DteError`, si no undefined. Para resultados que reportan fallas como datos.
 */
export const errorCode = (error: unknown): DteErrorCode | undefined => (isDteError(error) ? error.code : undefined)

/**
 * EN: Message of an unknown thrown value: `Error.message`, or its string form for anything else. Fills
 * `DteError.details.reason` when wrapping errors from the underlying libraries.
 * ES: Mensaje de un valor lanzado desconocido: `Error.message`, o su forma de string para cualquier otra cosa. Llena
 * `DteError.details.reason` al envolver errores de las bibliotecas subyacentes.
 */
export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))
