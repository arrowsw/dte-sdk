import { isDteError } from '../errors'
import type { SiiClient } from '../sii/client'
import { queryUploadStatus } from '../sii/status'

/**
 * EN: The state of an envelope as the certification run reads it from one status query: whether the SII answered with
 * a state, and whether that state is a success, an intermediate one or a rejection. A state the table does not know is
 * none of the three.
 * ES: El estado de un envío tal como lo lee la corrida de certificación desde una consulta de estado: si el SII
 * respondió con un estado, y si ese estado es un éxito, uno intermedio o un rechazo. Un estado que la tabla no conoce
 * no es ninguno de los tres.
 */
export type FieldUploadState = {
  /** EN: The SII answered with a state. ES: El SII respondió con un estado. */
  readonly answered: boolean
  /** EN: The state code, or null without an answer. ES: `ESTADO` — El código de estado, o null sin respuesta. */
  readonly code: string | null
  /** EN: The gloss of the state, or why there is no answer. ES: `GLOSA` — La glosa del estado, o por qué no hay respuesta. */
  readonly message: string | null
  /** EN: Processed, accepted with objections or a book accepted. ES: Procesado, aceptado con reparos o libro aceptado. */
  readonly successful: boolean
  /** EN: Still being processed, or an error of the query service. ES: Aún en proceso, o un error del servicio de consulta. */
  readonly intermediate: boolean
  /** EN: Rejected. ES: Rechazado. */
  readonly rejected: boolean
  /** EN: The answer as received, or null. ES: La respuesta tal como llegó, o null. */
  readonly raw: string | null
}

const SUCCESSFUL: ReadonlySet<string> = new Set(['EPR', 'RPR', 'LOK'])
const INTERMEDIATE: ReadonlySet<string> = new Set(['REC', 'SOK', 'FOK', 'PRD', 'CRT', 'DNK', 'PDR', 'LSO', '0'])
const REJECTED: ReadonlySet<string> = new Set(['RPT', 'RFR', 'VOF', 'RCT', 'RCH', 'RLV', 'RSC', 'LNC', 'LRH'])
// The errors of the query service itself, `-1` to `-14`: the envelope may be fine, so they read as "ask again".
const QUERY_SERVICE_ERROR = /^-(?:[1-9]|1[0-4])$/
// What stands for "the SII did not answer with a state": an HTTP error, a fault, a page without a state.
const UNANSWERED: ReadonlySet<string> = new Set(['SII_HTTP_ERROR', 'SII_RESPONSE_INVALID', 'SII_SOAP_FAULT'])
const QUERY_CODE: ReadonlySet<string> = new Set(['SII_QUERY_ERROR', 'SII_TOKEN_INVALID'])

/**
 * EN: Classifies a state code with the table the certification run uses.
 * ES: Clasifica un código de estado con la tabla que usa la corrida de certificación.
 * @param code EN: the state code. ES: `ESTADO` — el código de estado.
 * @returns EN: which of the three it is, if any. ES: cuál de los tres es, si alguno.
 */
export const classifyFieldUploadState = (
  code: string,
): Pick<FieldUploadState, 'successful' | 'intermediate' | 'rejected'> => ({
  successful: SUCCESSFUL.has(code),
  intermediate: INTERMEDIATE.has(code) || QUERY_SERVICE_ERROR.test(code),
  rejected: REJECTED.has(code),
})

const answered = (code: string, message: string | null, raw: string | null): FieldUploadState => ({
  answered: true,
  code,
  message,
  ...classifyFieldUploadState(code),
  raw,
})

const unanswered = (message: string | null, raw: string | null): FieldUploadState => ({
  answered: false,
  code: null,
  message,
  successful: false,
  intermediate: false,
  rejected: false,
  raw,
})

/**
 * EN: Asks the SII once for the state of an envelope, as the certification run does: one request on the SOAP channel,
 * never retried (the client still renews a token the SII refuses and asks once more). An HTTP error or an answer
 * without a state, or with an empty one, is "no answer", not a failure; a query-service error code is an intermediate
 * state; only a request that never got through throws.
 * ES: Pregunta una vez al SII por el estado de un envío, como lo hace la corrida de certificación: una petición por el
 * canal SOAP, sin reintentos (el cliente igual renueva un token que el SII rechaza y pregunta una vez más). Un error
 * HTTP o una respuesta sin estado, o con uno vacío, es "sin respuesta", no una falla; un código de error del servicio
 * de consulta es un estado intermedio; solo lanza una petición que nunca llegó.
 * @param sii EN: the client. ES: el cliente.
 * @param trackId EN: the track id of the envelope. ES: `TrackId` — el track id del envío.
 * @returns EN: the state as the run reads it. ES: el estado tal como lo lee la corrida.
 * @throws {DteError} EN: the transport codes; `INVALID_OPTION { field: 'trackId' }`. ES: los códigos de transporte; `INVALID_OPTION { field: 'trackId' }`.
 */
export const queryFieldUploadState = async (sii: SiiClient, trackId: string): Promise<FieldUploadState> => {
  try {
    const status = await queryUploadStatus(sii, { trackId, channel: 'soap' }, { retry: false })
    // A state element with nothing in it is not a state.
    return status.code === ''
      ? unanswered(status.message, status.raw)
      : answered(status.code, status.message, status.raw)
  } catch (error) {
    if (!isDteError(error)) throw error
    if (QUERY_CODE.has(error.code) && typeof error.details.code === 'string')
      return answered(error.details.code, null, null)
    if (!UNANSWERED.has(error.code)) throw error
    return unanswered(error.message, null)
  }
}
