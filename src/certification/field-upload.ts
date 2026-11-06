import { receptionStatusMessage } from '../catalogs/reception-status'
import { DteError, isDteError } from '../errors'
import type { CallOverrides } from '../sii/client'
import type { RetryPolicy } from '../sii/retry'
import { parseReceptionResponse, type UploadReceipt } from '../sii/upload'

// The network failures an upload of the run is sent again for; a request that timed out on the client's own clock, a
// refused connection and every answer of the SII are not among them.
const FIELD_NETWORK_REASON = /UND_ERR_SOCKET|ECONNRESET|ETIMEDOUT|ENOTFOUND/

/**
 * EN: True for the network failures an upload of the certification run is sent again for: a transport failure whose
 * reason names a reset or closed socket, a connection that timed out or a host that did not resolve. Internal.
 * ES: True para las fallas de red por las que una subida de la corrida de certificación se vuelve a enviar: una falla
 * de transporte cuyo motivo nombra un socket cerrado o reiniciado, una conexión que expiró o un host que no resolvió.
 * Interno.
 */
export const isFieldNetworkError = (error: DteError): boolean =>
  error.code === 'TRANSPORT_FAILED' && FIELD_NETWORK_REASON.test(String(error.details.reason))

/**
 * EN: How the certification run retries an upload: eight attempts, 2 s growing ×1.8 and capped at 15 s, no jitter, and
 * only for the network failures of `isFieldNetworkError`. Internal.
 * ES: Cómo reintenta una subida la corrida de certificación: ocho intentos, 2 s creciendo ×1,8 con tope de 15 s, sin
 * jitter, y solo por las fallas de red de `isFieldNetworkError`. Interno.
 */
export const FIELD_UPLOAD_RETRY: Partial<RetryPolicy> = Object.freeze({
  maxAttempts: 8,
  initialDelayMs: 2000,
  maxDelayMs: 15000,
  backoffMultiplier: 1.8,
  jitterRatio: 0,
  retryOn: isFieldNetworkError,
})

/**
 * EN: What the certification run makes of the reception of a file: its track id, or null for a duplicate the SII
 * named no track id for. `duplicate` also marks a track id recovered from a duplicate reply. Internal.
 * ES: Lo que la corrida de certificación entiende de la recepción de un archivo: su track id, o null por un duplicado
 * para el que el SII no nombró track id. `duplicate` marca también un track id recuperado de una respuesta de
 * duplicado. Interno.
 */
export type FieldReception = {
  /** EN: The track id, or null for a duplicate without one. ES: `TRACKID` — El track id, o null en un duplicado sin él. */
  readonly trackId: string | null
  /** EN: The SII said it already had the file. ES: El SII dijo que ya tenía el archivo. */
  readonly duplicate: boolean
}

const TRACK_ID_ELEMENT = /<TRACKID>(\d+)<\/TRACKID>/i
// The first error line of a `STATUS` 7 says whether it is a real charset or schema refusal.
const REFUSAL_DETAIL = /CHR-00001|SCH-00001|cvc-/

// `STATUS` 7 is a duplicate unless its first error line names a refusal; with a `TRACKID` element the track id is
// recovered and the upload goes on as a sent one, without it the SII named none.
const readStatusSeven = (errors: readonly string[], trackId: string | undefined): FieldReception | null =>
  REFUSAL_DETAIL.test(errors[0] ?? '') ? null : { trackId: trackId ?? null, duplicate: true }

/**
 * EN: Uploads a file with the retries of the certification run and reads the reply as the run reads it: only `STATUS` 0
 * with a `TRACKID` element is a sent file; `STATUS` 7 is a duplicate (with its track id when the reply carries the
 * element) unless its first error line names a charset or schema refusal; `STATUS` 99 and anything else is a refusal.
 * The upload client reads more replies as duplicates than this, so the reply is read again here. Internal.
 * ES: Sube un archivo con los reintentos de la corrida de certificación y lee la respuesta como la lee la corrida: solo
 * `STATUS` 0 con un elemento `TRACKID` es un archivo enviado; `STATUS` 7 es un duplicado (con su track id si la
 * respuesta trae el elemento) salvo que su primera línea de error nombre un rechazo de charset o de esquema; `STATUS`
 * 99 y cualquier otra cosa es un rechazo. El cliente de subida lee más respuestas como duplicados, así que la respuesta
 * se vuelve a leer aquí. Interno.
 * @throws {DteError} EN: `SII_UPLOAD_REJECTED { status, errors }` for a refusal; the codes of the upload otherwise. ES: `SII_UPLOAD_REJECTED { status, errors }` por un rechazo; si no, los códigos de la subida.
 */
export const uploadAsField = async (
  upload: (overrides: CallOverrides) => Promise<UploadReceipt>,
  operation: string,
): Promise<FieldReception> => {
  let receipt: UploadReceipt
  try {
    receipt = await upload({ retry: FIELD_UPLOAD_RETRY })
  } catch (error) {
    // A `STATUS` 7 the client refused is still a duplicate, or a sent file, for the run, which reads only the first
    // error line and the `TRACKID` element.
    const reading =
      isDteError(error) && error.code === 'SII_UPLOAD_REJECTED' && error.details.status === 7
        ? readStatusSeven(
            error.details.errors as readonly string[],
            (error.details.trackIdElement as string | null) ?? undefined,
          )
        : null
    if (reading === null) throw error
    return reading
  }
  const { status, errors } = parseReceptionResponse(receipt.raw, operation)
  const trackId = TRACK_ID_ELEMENT.exec(receipt.raw)?.[1]
  const reading =
    status === '7'
      ? readStatusSeven(errors, trackId)
      : status === '0' && trackId !== undefined
        ? { trackId, duplicate: false }
        : null
  if (reading === null)
    throw new DteError('SII_UPLOAD_REJECTED', {
      status: Number(status),
      errors,
      fileName: receipt.fileName,
      operation,
      message: receptionStatusMessage(status),
    })
  return reading
}

/**
 * EN: `uploadAsField` for a file the run cannot go on without a track id for: a duplicate the SII named no track id
 * for is a refusal too. Internal.
 * ES: `uploadAsField` para un archivo sin cuyo track id la corrida no puede seguir: un duplicado para el que el SII no
 * nombró track id también es un rechazo. Interno.
 * @throws {DteError} EN: `SII_UPLOAD_REJECTED { status: 7, duplicate: true }` for that duplicate. ES: `SII_UPLOAD_REJECTED { status: 7, duplicate: true }` por ese duplicado.
 */
export const uploadForTrackId = async (
  upload: (overrides: CallOverrides) => Promise<UploadReceipt>,
  operation: string,
): Promise<string> => {
  const reception = await uploadAsField(upload, operation)
  if (reception.trackId === null)
    throw new DteError('SII_UPLOAD_REJECTED', {
      status: 7,
      duplicate: true,
      operation,
      message: receptionStatusMessage('7'),
    })
  return reception.trackId
}
