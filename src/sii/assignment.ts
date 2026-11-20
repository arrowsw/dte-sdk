import { DteError } from '../errors'
import { splitSiiRut } from '../model/rut'
import { encodeLatin1 } from '../text/latin1'
import { decodeXmlEntities, extractTagContent } from '../xml/parse'
import { withToken } from './auth'
import { resolveCompanyRut, resolveSenderRut, retryFor, type CallOverrides, type SiiClient } from './client'
import { httpError, isSuccess, readSiiResponse, retryOptions, siiTimestampToIso, soapCall } from './operation'
import { withRetry } from './retry'
import { stripNamespacePrefixes } from './soap'
import {
  assertCoverRut,
  COVER,
  invalidResponse,
  latin1Xml,
  performUpload,
  refuse,
  resolveFileName,
  type UploadJob,
  type UploadReceipt,
  type UploadVerdict,
} from './upload'
import type { HttpResponse } from './transport'

/**
 * EN: Input of `unstable_uploadAssignment`.
 * ES: Entrada de `unstable_uploadAssignment`.
 */
export type AssignmentUploadInput = {
  /** EN: The signed assignment file, opening with an XML declaration naming ISO-8859-1, as `createAssignment` writes it. ES: `AEC` — El archivo de cesión firmado, que abre con una declaración XML que nombra ISO-8859-1, como lo escribe `createAssignment`. */
  readonly xml: string
  /** EN: The address where the SII sends the result of the registration. ES: `emailNotif` — La dirección a la que el SII envía el resultado de la anotación. */
  readonly notificationEmail: string
  /** EN: The assignor's RUT; defaults to the client's company. It must be the `RutCedente` the cover of the file names. ES: `rutCompany` / `dvCompany` — RUT del cedente; por defecto la empresa del cliente. Debe ser el `RutCedente` que nombra la carátula del archivo. */
  readonly companyRut?: string
  /** EN: Name of the multipart file; letters, digits, `_`, `.` and `-`, ending in `.xml`; `AEC.xml` by default. ES: Nombre del archivo del multipart; letras, dígitos, `_`, `.` y `-`, terminado en `.xml`; por defecto `AEC.xml`. */
  readonly fileName?: string
}

/**
 * EN: Input of `unstable_queryAssignmentUploadStatus`.
 * ES: Entrada de `unstable_queryAssignmentUploadStatus`.
 */
export type AssignmentUploadStatusInput = {
  /** EN: TrackID of the upload, digits only. ES: `TrackId` — Identificador del envío, solo dígitos. */
  readonly trackId: string
}

/**
 * EN: The state of an assignment upload, as the SII answers it.
 * ES: El estado de un envío de cesión, como lo responde el SII.
 */
export type AssignmentUploadStatus = {
  /** EN: The SII's code, as sent; its values are not documented, so it is not classified. ES: `ESTADO` — El código del SII, tal cual; sus valores no están documentados, así que no se clasifica. */
  readonly code: string
  /** EN: The SII's gloss, or null. ES: `GLOSA` — La glosa del SII, o null. */
  readonly message: string | null
  /** EN: TrackID that was asked about. ES: `TrackId` — Identificador del envío consultado. */
  readonly trackId: string
  /** EN: The unescaped answer, prefixes removed. ES: La respuesta des-escapada, sin prefijos. */
  readonly raw: string
}

const OPERATION_UPLOAD = 'uploadAssignment'
const OPERATION_STATUS = 'queryAssignmentUploadStatus'
const STATUS_PATTERN = /^\d{1,3}$/
const TRACK_ID_PATTERN = /^\d{1,20}$/
// It travels as a form field, in ASCII, so it holds no space and no line break.
const EMAIL_PATTERN = /^[!-?A-~]{1,64}@[!-?A-~]{1,190}$/
const RPETC_NAMESPACE = 'http://DefaultNamespace'

// `RECEPCIONAEC`: `STATUS` 0 with a TrackID is the file received; any other `STATUS` is a refusal, whose codes the
// SII does not document, so none of them is read as a refused token or a duplicate, and the file is never sent again.
// The TrackID becomes a file name and a SOAP parameter, so it is digits only.
const readAssignmentAnswer = (job: UploadJob, response: HttpResponse, text: string): UploadVerdict => {
  if (!isSuccess(response.status)) throw httpError(response, text, job.operation, 'soap', job.url)
  if (!/<RECEPCIONAEC>/i.test(text)) throw invalidResponse(job.operation, text)
  const status = (extractTagContent(text, 'STATUS') ?? '').trim()
  if (!STATUS_PATTERN.test(status)) throw invalidResponse(job.operation, text)
  const errors = Array.from(text.matchAll(/<ERROR>([^<]*)<\/ERROR>/gi), (match) => decodeXmlEntities(match[1]).trim())
  const trackId = (extractTagContent(text, 'TRACKID') ?? '').trim()
  // A file the SII took always has its TrackID: without one, it was not taken.
  if (status !== '0' || trackId === '')
    return refuse(
      new DteError('SII_UPLOAD_REJECTED', {
        status: Number(status),
        errors,
        fileName: job.fileName,
        operation: job.operation,
      }),
      status,
    )
  if (!TRACK_ID_PATTERN.test(trackId)) throw invalidResponse(job.operation, text)
  return {
    ok: true,
    code: status,
    trackId,
    duplicate: false,
    receivedAt: siiTimestampToIso(extractTagContent(text, 'TIMESTAMP')),
  }
}

/**
 * EN: **Unstable**: it has not been run against the SII, so its shape may change in any release, a patch included. The
 * format of the file does not describe this service, so its address, the form's fields and the shape of the answer
 * have not been checked against an SII document, and the codes of a refusal are not documented.
 *
 * Registers a signed assignment file (AEC) in the SII's public registry of credit transfers (RPETC): a multipart
 * upload, ISO-8859-1 bytes, to `RTCAnotEnvio.cgi` with the SOAP token, the assignor's RUT and the address the SII
 * notifies. The assignor must be the `RutCedente` of the file's cover, checked before anything is sent. `STATUS` 0 with
 * a TrackID is a received file, not a registered assignment: ask `unstable_queryAssignmentUploadStatus`. Any other
 * `STATUS` is `SII_UPLOAD_REJECTED`. As every upload, it is retried only while no SII response has arrived; once the SII
 * answered it is never sent again, and every answer is handed to the archive port.
 * ES: **Inestable**: no se ha corrido contra el SII, así que su forma puede cambiar en cualquier versión, incluso un
 * patch. El formato del archivo no describe este servicio, así que su dirección, los campos del formulario y la forma
 * de la respuesta no se han contrastado con un documento del SII, y los códigos de un rechazo no están documentados.
 *
 * Anota un archivo de cesión firmado (AEC) en el Registro Público Electrónico de Transferencia de Créditos (RPETC) del
 * SII: una subida multipart, en bytes ISO-8859-1, a `RTCAnotEnvio.cgi` con el token SOAP, el RUT del cedente y la
 * dirección a la que el SII avisa. El cedente debe ser el `RutCedente` de la carátula del archivo, lo que se revisa
 * antes de enviar nada. `STATUS` 0 con un TrackID es un archivo recibido, no una cesión anotada: consulta
 * `unstable_queryAssignmentUploadStatus`. Cualquier otro `STATUS` es `SII_UPLOAD_REJECTED`. Como toda subida, se
 * reintenta solo mientras no haya llegado respuesta del SII; una vez que respondió no se vuelve a enviar, y toda
 * respuesta se entrega al puerto de archivo.
 * @param sii EN: the client. ES: el cliente.
 * @param input EN: the file, the notification address and the assignor. ES: el archivo, la dirección de aviso y el cedente.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the TrackID and the SII's raw answer. ES: el TrackID y la respuesta cruda del SII.
 * @throws {DteError} EN: `SII_UPLOAD_REJECTED { status (a number), errors }`, `SII_TOKEN_INVALID` (from the token), `SII_HTTP_ERROR`, `SII_RESPONSE_INVALID`, `INVALID_OPTION { field: 'xml' | 'fileName' | 'notificationEmail' }`, `INVALID_OPTION { field: 'companyRut' }` when the cover names another assignor (nothing is sent), `MISSING_FIELD`, `INVALID_RUT`, `ENCODING_UNSUPPORTED_CHAR`, transport codes. ES: los mismos códigos.
 */
export const unstable_uploadAssignment = async (
  sii: SiiClient,
  input: AssignmentUploadInput,
  overrides?: CallOverrides,
): Promise<UploadReceipt> => {
  const email = typeof input.notificationEmail === 'string' ? input.notificationEmail.trim() : ''
  if (!EMAIL_PATTERN.test(email)) throw new DteError('INVALID_OPTION', { field: 'notificationEmail' })
  const companyRut = resolveCompanyRut(sii, input.companyRut)
  const cover = COVER.exec(input.xml)?.[0]
  if (cover !== undefined) assertCoverRut(cover, ['RutCedente'], companyRut, 'companyRut', OPERATION_UPLOAD)
  const company = splitSiiRut(companyRut)
  return performUpload(
    sii,
    {
      kind: 'assignment',
      operation: OPERATION_UPLOAD,
      fileName: resolveFileName('assignment', input.xml, input.fileName),
      bytes: encodeLatin1(latin1Xml(input.xml)),
      companyRut,
      senderRut: resolveSenderRut(sii),
      channel: 'soap',
      url: sii.endpoints.assignments.upload,
      fields: [
        { name: 'emailNotif', value: email },
        { name: 'rutCompany', value: company.body },
        { name: 'dvCompany', value: company.verifier.toUpperCase() },
      ],
      read: readAssignmentAnswer,
    },
    overrides,
  )
}

/**
 * EN: **Unstable**: it has not been run against the SII, so its shape may change in any release, a patch included. The
 * operation and its parameters have not been checked against an SII document; the codes it answers are not
 * documented, so they come back as the SII sends them, unclassified.
 *
 * The state of an assignment upload by its TrackID: `getEstEnvio` of the registry's `wsRPETCConsulta` service, with the
 * SOAP token. A query can be repeated safely, so it follows the normal retry policy. The TrackID must be digits only.
 * ES: **Inestable**: no se ha corrido contra el SII, así que su forma puede cambiar en cualquier versión, incluso un
 * patch. La operación y sus parámetros no se han contrastado con un documento del SII; los códigos que responde no
 * están documentados, así que vuelven tal como los manda el SII, sin clasificar.
 *
 * El estado de un envío de cesión por su TrackID: `getEstEnvio` del servicio `wsRPETCConsulta` del registro, con el
 * token SOAP. Una consulta se puede repetir sin riesgo, así que sigue la política de reintentos normal. El TrackID debe
 * ser solo dígitos.
 * @param sii EN: the client. ES: el cliente.
 * @param input EN: the TrackID. ES: el TrackID.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the SII's code and gloss. ES: el código y la glosa del SII.
 * @throws {DteError} EN: `INVALID_OPTION { field: 'trackId' }`, `SII_RESPONSE_INVALID` for an answer without `ESTADO`, `SII_SOAP_FAULT`, `SII_HTTP_ERROR`, token and transport codes. ES: los mismos códigos.
 */
export const unstable_queryAssignmentUploadStatus = async (
  sii: SiiClient,
  input: AssignmentUploadStatusInput,
  overrides?: CallOverrides,
): Promise<AssignmentUploadStatus> => {
  const trackId = input.trackId
  if (typeof trackId !== 'string' || !TRACK_ID_PATTERN.test(trackId))
    throw new DteError('INVALID_OPTION', { field: 'trackId' })
  return withToken(sii, 'soap', overrides, (token) =>
    withRetry(
      retryFor(sii, overrides),
      async (attempt) => {
        const xml = stripNamespacePrefixes(
          await soapCall(sii, {
            operation: OPERATION_STATUS,
            url: sii.endpoints.assignments.uploadStatus,
            method: 'getEstEnvio',
            namespace: RPETC_NAMESPACE,
            params: [
              { name: 'Token', value: token },
              { name: 'TrackId', value: trackId },
            ],
            attempt,
            overrides,
          }),
        )
        const { code, message } = readSiiResponse(xml, OPERATION_STATUS)
        return { code, message: message?.trim() || null, trackId, raw: xml }
      },
      retryOptions(sii, OPERATION_STATUS, overrides),
    ),
  )
}
