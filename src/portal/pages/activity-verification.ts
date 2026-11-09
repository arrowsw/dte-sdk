import { toSiiRut, type SiiRut } from '../../model/rut'
import { toIsoDate } from '../../time/chile'
import type { RcvObject } from './rcv'

/**
 * EN: One request for the verification of the company's activities. Unstable, as `unstable_fetchActivityVerification`.
 * ES: Una solicitud de verificación de las actividades de la empresa. Inestable, como `unstable_fetchActivityVerification`.
 */
export type ActivityVerificationRequest = {
  /** EN: Number of the verification. ES: `verNumVerificacion` — Número de la verificación. */
  readonly number: number | null
  /** EN: Kind of verification, such as `VIA`. ES: `tipo` — Tipo de verificación, como `VIA`. */
  readonly kind: string | null
  /** EN: Why it was opened, as the SII words it. ES: `motivo` — Motivo, como lo escribe el SII. */
  readonly reason: string | null
  /** EN: Preliminary result, such as `CONDICIONADA`. ES: `resultadoVia` — Resultado preliminar, como `CONDICIONADA`. */
  readonly preliminaryResult: string | null
  /** EN: Final result; null while there is none. ES: `resultadoFinal` — Resultado final; null mientras no lo hay. */
  readonly finalResult: string | null
  /** EN: Status code, such as `PAC`. ES: `verEstadoVerificacion` — Código del estado, como `PAC`. */
  readonly status: string | null
  /** EN: What the status means, such as `PENDIENTE DE ACREDITACIÓN`. ES: `descEstadoVerificacion` — Qué significa el estado, como `PENDIENTE DE ACREDITACIÓN`. */
  readonly statusDescription: string | null
  /** EN: Date of the request, YYYY-MM-DD. ES: `fechaSolicitud` — Fecha de la solicitud, AAAA-MM-DD. */
  readonly requestedOn: string | null
  /** EN: Last day to accredit the activity, YYYY-MM-DD; null when there is none. ES: `fechaLimiteAcreditacion` — Último día para acreditar la actividad, AAAA-MM-DD; null si no hay. */
  readonly accreditationDeadline: string | null
  /** EN: Status of the accreditation procedure, as the SII words it. ES: `descEstadoTramite` — Estado del trámite de acreditación, como lo escribe el SII. */
  readonly procedureStatus: string | null
  /** EN: True when the SII has issued the verification's certificate. ES: `idCertificado` — True cuando el SII emitió el certificado de la verificación. */
  readonly hasCertificate: boolean
}

/**
 * EN: A message the SII adds to the verification.
 * ES: Un mensaje que el SII agrega a la verificación.
 */
export type ActivityVerificationMessage = {
  /** EN: The message. ES: `mensaje` — El mensaje. */
  readonly text: string
  /** EN: True when the SII's own page stops at it. ES: `puedeContinuar` en false — True cuando la página del propio SII se detiene en él. */
  readonly blocking: boolean
}

/**
 * EN: The verification of a company's activities, the SII's "Consulta estado de verificación y acreditación". Officials,
 * comments, the address and the procedure's internals are left out on purpose. Unstable, as
 * `unstable_fetchActivityVerification`.
 * ES: La verificación de actividades de una empresa, la "Consulta estado de verificación y acreditación" del SII. Los
 * funcionarios, los comentarios, el domicilio y lo interno del trámite quedan fuera a propósito. Inestable, como
 * `unstable_fetchActivityVerification`.
 */
export type ActivityVerification = {
  /** EN: The requests; empty when the company never asked for the verification. ES: `converiBO` — Las solicitudes; vacía si la empresa nunca pidió la verificación. */
  readonly requests: readonly ActivityVerificationRequest[]
  /** EN: The SII's messages. ES: `arrMensajeBO` — Los mensajes del SII. */
  readonly messages: readonly ActivityVerificationMessage[]
}

/**
 * EN: Which list a document that accredits an activity belongs to.
 * ES: A qué lista pertenece un documento que acredita una actividad: GRAL general, ESPEC específico.
 */
export type AccreditationDocumentCategory = 'general' | 'specific'

/**
 * EN: A kind of document the SII takes to accredit an activity. The code repeats across categories: the pair is the key.
 * ES: Un tipo de documento que el SII acepta para acreditar una actividad. El código se repite entre categorías: la clave es el par.
 */
export type AccreditationDocument = {
  /** EN: The category; null for one dte-sdk does not know. ES: `docaCategoria` — La categoría; null si dte-sdk no la conoce. */
  readonly category: AccreditationDocumentCategory | null
  /** EN: Code within the category. ES: `docaCodigo` — Código dentro de la categoría. */
  readonly code: number | null
  /** EN: Name of the document. ES: `docaDescripcion` — Nombre del documento. */
  readonly description: string | null
}

/**
 * EN: What an answer of `consultarVerificacionInternet` says: the verification, a refusal with the SII's words, requests of
 * someone other than the company, or nothing readable.
 * ES: Lo que dice una respuesta de `consultarVerificacionInternet`: la verificación, un rechazo con las palabras del SII,
 * solicitudes de alguien distinto de la empresa, o nada legible.
 */
export type ActivityVerificationReading =
  | { readonly outcome: 'read'; readonly verification: ActivityVerification }
  | { readonly outcome: 'refused'; readonly message: string | null }
  | { readonly outcome: 'otherTaxpayer' }
  | { readonly outcome: 'unreadable' }

const CATEGORIES: Readonly<Record<string, AccreditationDocumentCategory>> = { GRAL: 'general', ESPEC: 'specific' }

const isObject = (value: unknown): value is RcvObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const objectsOf = (value: unknown): readonly RcvObject[] => (Array.isArray(value) ? value.filter(isObject) : [])

const numberOf = (value: unknown): number | null => {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
}

// The SII writes an empty value as `""` or `null` alike.
const filled = (value: unknown): string | null => {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : null
  return text === null || text.trim() === '' ? null : text
}

const dateOf = (value: unknown): string | null => {
  const text = filled(value)
  if (text === null) return null
  try {
    return toIsoDate(text)
  } catch {
    return null
  }
}

const rutOf = (entry: RcvObject): SiiRut | null => {
  const body = filled(entry.rut)
  const verifier = filled(entry.dv)
  if (body === null || verifier === null) return null
  try {
    return toSiiRut(`${body}-${verifier}`)
  } catch {
    return null
  }
}

const requestOf = (entry: RcvObject): ActivityVerificationRequest => ({
  number: numberOf(entry.verNumVerificacion),
  kind: filled(entry.tipo),
  reason: filled(entry.motivo),
  preliminaryResult: filled(entry.resultadoVia),
  finalResult: filled(entry.resultadoFinal),
  status: filled(entry.verEstadoVerificacion),
  statusDescription: filled(entry.descEstadoVerificacion),
  requestedOn: dateOf(entry.fechaSolicitud),
  accreditationDeadline: dateOf(entry.fechaLimiteAcreditacion),
  procedureStatus: filled(entry.descEstadoTramite),
  hasCertificate: filled(entry.idCertificado) !== null,
})

// The SII's page reads the slots up to `index` and stops at the first one that cannot go on.
const messagesOf = (data: RcvObject): readonly ActivityVerificationMessage[] => {
  const slots = Array.isArray(data.arrMensajeBO) ? data.arrMensajeBO : []
  const index = numberOf(data.index)
  return (index === null ? slots : slots.slice(0, index + 1)).filter(isObject).flatMap((slot) => {
    const text = filled(slot.mensaje)
    return text === null ? [] : [{ text, blocking: slot.puedeContinuar === false }]
  })
}

/**
 * EN: Reads an answer of `consultarVerificacionInternet` for `company`. An error code other than 0 is a refusal; a request
 * whose RUT is not the company's means the SII answered for someone else, and nothing of it is returned.
 * ES: Lee una respuesta de `consultarVerificacionInternet` para `company`. Un código de error distinto de 0 es un rechazo;
 * una solicitud cuyo RUT no es el de la empresa significa que el SII respondió por otra persona, y no se devuelve nada de ella.
 */
export const activityVerificationOf = (answer: RcvObject, company: SiiRut): ActivityVerificationReading => {
  const data = answer.data
  if (!isObject(data)) return { outcome: 'unreadable' }
  const code = numberOf(data.codigoError)
  if (code !== null && code !== 0) return { outcome: 'refused', message: filled(data.descripcionError) }
  const entries = objectsOf(data.converiBO)
  if (entries.some((entry) => rutOf(entry) !== company)) return { outcome: 'otherTaxpayer' }
  return { outcome: 'read', verification: { requests: entries.map(requestOf), messages: messagesOf(data) } }
}

/**
 * EN: Reads the catalog of `recuperarDocAcreditar`, or null when the answer carries no list.
 * ES: Lee el catálogo de `recuperarDocAcreditar`, o null si la respuesta no trae una lista.
 */
export const accreditationDocumentsOf = (answer: RcvObject): readonly AccreditationDocument[] | null => {
  if (!Array.isArray(answer.data)) return null
  return objectsOf(answer.data).map((row) => ({
    category: CATEGORIES[String(row.docaCategoria)] ?? null,
    code: numberOf(row.docaCodigo),
    description: filled(row.docaDescripcion),
  }))
}
