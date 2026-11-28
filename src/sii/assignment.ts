import { isAssignableDocumentType, type AssignableDocumentType } from '../assignment/build'
import { DteError } from '../errors'
import { splitSiiRut, toSiiRut } from '../model/rut'
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
  /** EN: The signed assignment file, opening with an XML declaration naming ISO-8859-1, as `unstable_createAssignment` writes it. ES: `AEC` — El archivo de cesión firmado, que abre con una declaración XML que nombra ISO-8859-1, como lo escribe `unstable_createAssignment`. */
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
 * EN: Where an assignment upload stands, read from its state in the registry: `accepted` (`EOK`), `rejected` (`RSC`,
 * `RFS`, `RCR`, `RDC`, `RCS`), `annulled` (`EAN`), `pending` while the registry works through it (`UPL`, `RCP`, `SOK`,
 * `FSO`, `COK`, `VDC`, `VCS`) and `unknown` for a state the SII's manual does not list or an answer without one.
 * ES: En qué está un envío de cesión, leído de su estado en el registro: `accepted` (`EOK`), `rejected` (`RSC`, `RFS`,
 * `RCR`, `RDC`, `RCS`), `annulled` (`EAN`), `pending` mientras el registro lo procesa (`UPL`, `RCP`, `SOK`, `FSO`,
 * `COK`, `VDC`, `VCS`) y `unknown` para un estado que el manual del SII no lista o una respuesta sin estado.
 */
export type AssignmentUploadStatusClass = 'pending' | 'accepted' | 'rejected' | 'annulled' | 'unknown'

/**
 * EN: The state of an assignment upload, as the SII answers it.
 * ES: El estado de un envío de cesión, como lo responde el SII.
 */
export type AssignmentUploadStatus = {
  /** EN: The result of the query, as sent: `0` is a query the registry took; it is not the state of the upload. ES: `ESTADO` — El resultado de la consulta, tal cual: `0` es una consulta que el registro recibió; no es el estado del envío. */
  readonly code: string
  /** EN: The SII's gloss of the result, or null. ES: `GLOSA` — La glosa del resultado, o null. */
  readonly message: string | null
  /** EN: TrackID that was asked about. ES: `TrackId` — Identificador del envío consultado. */
  readonly trackId: string
  /** EN: The state of the upload, as sent, or null when the answer brings none. ES: `ESTADO_ENVIO` — El estado del envío, tal cual, o null si la respuesta no lo trae. */
  readonly uploadState: string | null
  /** EN: The SII's description of that state, or null. ES: `DESC_ESTADO` — La descripción de ese estado, o null. */
  readonly description: string | null
  /** EN: Where the upload stands, by its state. ES: En qué está el envío, según su estado. */
  readonly status: AssignmentUploadStatusClass
  /** EN: The unescaped answer, prefixes removed. ES: La respuesta des-escapada, sin prefijos. */
  readonly raw: string
}

/**
 * EN: The document `unstable_queryAssignmentState` and `unstable_queryRelatedAssignmentState` ask about.
 * ES: El documento por el que preguntan `unstable_queryAssignmentState` y `unstable_queryRelatedAssignmentState`.
 */
export type AssignedDocumentQuery = {
  /** EN: RUT of the issuer of the document. ES: `RutEmisor` / `DVEmisor` — RUT del emisor del documento. */
  readonly issuerRut: string
  /** EN: Type of the document: 33, 34, 46 or 43. ES: `TipoDoc` — Tipo del documento: 33, 34, 46 o 43. */
  readonly type: AssignableDocumentType
  /** EN: Folio of the document. ES: `FolioDoc` — Folio del documento. */
  readonly folio: number
}

/**
 * EN: Input of `unstable_queryAssignmentState`.
 * ES: Entrada de `unstable_queryAssignmentState`.
 */
export type AssignmentStateInput = AssignedDocumentQuery & {
  /** EN: The key that opens the data of the assignment, up to 20 characters with no space; without it the registry only says whether the document is assigned. ES: `IdCesion` — La clave de acceso a la información de la cesión, hasta 20 caracteres sin espacios; sin ella el registro solo dice si el documento está cedido. */
  readonly accessKey?: string
}

/**
 * EN: Input of `unstable_queryRelatedAssignmentState`.
 * ES: Entrada de `unstable_queryRelatedAssignmentState`.
 */
export type RelatedAssignmentStateInput = AssignedDocumentQuery & {
  /** EN: RUT of the company linked to the document, as its holder or its receiver; defaults to the client's company. ES: `RutEmpresa` / `DVEmpresa` — RUT de la empresa vinculada con el documento, como tenedor o como receptor; por defecto la empresa del cliente. */
  readonly companyRut?: string
}

/**
 * EN: What the registry says of the assignment of a document.
 * ES: Lo que el registro dice de la cesión de un documento.
 */
export type AssignmentState = {
  /** EN: True when the registry answers `0`: the document is assigned. Any other result comes back in `code` and `message`. ES: Verdadero cuando el registro responde `0`: el documento está cedido. Cualquier otro resultado vuelve en `code` y `message`. */
  readonly assigned: boolean
  /** EN: The result of the query, as sent. ES: `ESTADO` — El resultado de la consulta, tal cual. */
  readonly code: string
  /** EN: The SII's gloss of the result, or null. ES: `GLOSA` — La glosa del resultado, o null. */
  readonly message: string | null
  /** EN: RUT of who holds the document now, as sent, or null. ES: `RUT_TENEDOR` — RUT del tenedor actual del documento, tal cual, o null. */
  readonly holderRut: string | null
  /** EN: When the registry last wrote an entry on the document, `YYYY-MM-DDTHH:MM:SS`, or null. ES: `FECHA_ULT_ANOT` — Fecha de la última anotación en el registro, `AAAA-MM-DDTHH:MM:SS`, o null. */
  readonly lastAnnotationAt: string | null
  /** EN: RUT of who collects the document, when it is in collection, as sent, or null. ES: `RUT_COBRANZA` — RUT del cobrador, si el documento está en cobro, tal cual, o null. */
  readonly collectorRut: string | null
  /** EN: The collection address, when the document is in collection, or null. ES: `DIR_COBRANZA` — La dirección de cobranza, si el documento está en cobro, o null. */
  readonly collectionAddress: string | null
  /** EN: Whether a sworn statement goes with the assignment, as sent (`EXISTE` in the SII's manual), or null. ES: `DEC_JURADA` — Si existe una declaración jurada asociada, tal cual (`EXISTE` en el manual del SII), o null. */
  readonly swornStatement: string | null
  /** EN: The unescaped answer, prefixes removed. ES: La respuesta des-escapada, sin prefijos. */
  readonly raw: string
}

const OPERATION_UPLOAD = 'uploadAssignment'
const OPERATION_STATUS = 'queryAssignmentUploadStatus'
const OPERATION_STATE = 'queryAssignmentState'
const OPERATION_RELATED = 'queryRelatedAssignmentState'
const STATUS_PATTERN = /^\d{1,3}$/
const TRACK_ID_PATTERN = /^\d{1,20}$/
// It travels as a form field, in ASCII, so it holds no space and no line break.
const EMAIL_PATTERN = /^[!-?A-~]{1,64}@[!-?A-~]{1,190}$/
const RPETC_NAMESPACE = 'http://DefaultNamespace'
// The manual gives a folio one to ten digits and the key of an assignment one to twenty characters.
const FOLIO_MAX = 9_999_999_999
const ACCESS_KEY_PATTERN = /^[!-~]{1,20}$/
// The results the manual lists for a query (its section 3.3): 3, 4 and 5 are a token the registry does not take, and
// 6, 7 and 8 an internal error of the service.
const TOKEN_REFUSED = /^[345]$/
const INTERNAL_ERROR = /^[678]$/
const PENDING_STATE = /^(UPL|RCP|SOK|FSO|COK|VDC|VCS)$/
const REJECTED_STATE = /^R(SC|FS|CR|DC|CS)$/

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

type SoapParam = { readonly name: string; readonly value: string }
type RegistryHeader = { readonly code: string; readonly message: string | null }

const field = (xml: string, tag: string): string | null => {
  const value = extractTagContent(xml, tag)
  return (value === null ? '' : decodeXmlEntities(value).trim()) || null
}

// One question to the registry's query service, `wsRPETCConsulta`, with the SOAP token first, as its WSDL orders the
// parameters. A token the registry refuses renews once in `withToken`, and an internal error of the service is a
// failure the retry policy repeats; every other result is the caller's to read.
const askRegistry = <T>(
  sii: SiiClient,
  operation: string,
  method: string,
  params: readonly SoapParam[],
  overrides: CallOverrides | undefined,
  read: (xml: string, header: RegistryHeader) => T,
): Promise<T> =>
  withToken(sii, 'soap', overrides, (token) =>
    withRetry(
      retryFor(sii, overrides),
      async (attempt) => {
        const xml = stripNamespacePrefixes(
          await soapCall(sii, {
            operation,
            url: sii.endpoints.assignments.uploadStatus,
            method,
            namespace: RPETC_NAMESPACE,
            params: [{ name: 'Token', value: token }, ...params],
            attempt,
            overrides,
          }),
        )
        const { code } = readSiiResponse(xml, operation)
        const message = field(xml, 'GLOSA')
        if (TOKEN_REFUSED.test(code)) throw new DteError('SII_TOKEN_INVALID', { operation, channel: 'soap', code })
        if (INTERNAL_ERROR.test(code)) throw new DteError('SII_QUERY_ERROR', { operation, code, reason: message ?? '' })
        return read(xml, { code, message })
      },
      retryOptions(sii, operation, overrides),
    ),
  )

const uploadClass = (state: string | null): AssignmentUploadStatusClass => {
  if (state === 'EOK') return 'accepted'
  if (state === 'EAN') return 'annulled'
  if (state !== null && REJECTED_STATE.test(state)) return 'rejected'
  return state !== null && PENDING_STATE.test(state) ? 'pending' : 'unknown'
}

/**
 * EN: **Unstable**: it has not been run against the SII, so its shape may change in any release, a patch included. The
 * function, its parameters, the answer and its states are the ones of the SII's manual of the service (WS Consulta de
 * Estado – RPETC, version 1.2 of 2008-02-05) and of its WSDL.
 *
 * The state of an assignment upload by its TrackID: `getEstEnvio` of the registry's `wsRPETCConsulta` service, with the
 * SOAP token. `code` is the result of the query, `0` when the registry took it; the state of the upload is
 * `uploadState`, with the SII's description, and `status` says where it stands: an `EOK` is an accepted upload. A
 * query can be repeated safely, so it follows the normal retry policy; a token the registry refuses (results 3, 4 and
 * 5) is renewed once, and an internal error of the service (6, 7 and 8) is repeated as any failure of a query is. The
 * TrackID must be digits only.
 * ES: **Inestable**: no se ha corrido contra el SII, así que su forma puede cambiar en cualquier versión, incluso un
 * patch. La función, sus parámetros, la respuesta y sus estados son los del manual del servicio que publica el SII (WS
 * Consulta de Estado – RPETC, versión 1.2 del 05-02-2008) y los de su WSDL.
 *
 * El estado de un envío de cesión por su TrackID: `getEstEnvio` del servicio `wsRPETCConsulta` del registro, con el
 * token SOAP. `code` es el resultado de la consulta, `0` cuando el registro la recibió; el estado del envío es
 * `uploadState`, con la descripción del SII, y `status` dice en qué está: un `EOK` es un envío aceptado. Una consulta
 * se puede repetir sin riesgo, así que sigue la política de reintentos normal; un token que el registro rechaza
 * (resultados 3, 4 y 5) se renueva una vez, y un error interno del servicio (6, 7 y 8) se repite como toda falla de
 * una consulta. El TrackID debe ser solo dígitos.
 * @param sii EN: the client. ES: el cliente.
 * @param input EN: the TrackID. ES: el TrackID.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the result of the query and the state of the upload. ES: el resultado de la consulta y el estado del envío.
 * @throws {DteError} EN: `INVALID_OPTION { field: 'trackId' }`, `SII_RESPONSE_INVALID` for an answer without `ESTADO`, `SII_TOKEN_INVALID` for a token refused twice, `SII_QUERY_ERROR { code, reason }` for an internal error that stays, `SII_SOAP_FAULT`, `SII_HTTP_ERROR`, token and transport codes. ES: los mismos códigos.
 */
export const unstable_queryAssignmentUploadStatus = async (
  sii: SiiClient,
  input: AssignmentUploadStatusInput,
  overrides?: CallOverrides,
): Promise<AssignmentUploadStatus> => {
  const trackId = input.trackId
  if (typeof trackId !== 'string' || !TRACK_ID_PATTERN.test(trackId))
    throw new DteError('INVALID_OPTION', { field: 'trackId' })
  return askRegistry(
    sii,
    OPERATION_STATUS,
    'getEstEnvio',
    [{ name: 'TrackId', value: trackId }],
    overrides,
    (xml, { code, message }) => {
      const uploadState = field(xml, 'ESTADO_ENVIO')
      return {
        code,
        message,
        trackId,
        uploadState,
        description: field(xml, 'DESC_ESTADO'),
        status: uploadClass(uploadState),
        raw: xml,
      }
    },
  )
}

const documentParams = (input: AssignedDocumentQuery): readonly SoapParam[] => {
  const issuer = splitSiiRut(toSiiRut(input.issuerRut, 'issuerRut'))
  if (!isAssignableDocumentType(input.type)) throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type' })
  if (!(Number.isSafeInteger(input.folio) && input.folio >= 1 && input.folio <= FOLIO_MAX))
    throw new DteError('INVALID_FOLIO', { field: 'folio' })
  return [
    { name: 'RutEmisor', value: issuer.body },
    { name: 'DVEmisor', value: issuer.verifier.toUpperCase() },
    { name: 'TipoDoc', value: String(input.type) },
    { name: 'FolioDoc', value: String(input.folio) },
  ]
}

const assignmentState = (xml: string, { code, message }: RegistryHeader): AssignmentState => ({
  assigned: code === '0',
  code,
  message,
  holderRut: field(xml, 'RUT_TENEDOR'),
  lastAnnotationAt: siiTimestampToIso(extractTagContent(xml, 'FECHA_ULT_ANOT')),
  collectorRut: field(xml, 'RUT_COBRANZA'),
  collectionAddress: field(xml, 'DIR_COBRANZA'),
  swornStatement: field(xml, 'DEC_JURADA'),
  raw: xml,
})

/**
 * EN: **Unstable**: it has not been run against the SII, so its shape may change in any release, a patch included. The
 * function, its parameters, the answer and its results are the ones of the SII's manual of the service (WS Consulta de
 * Estado – RPETC, version 1.2 of 2008-02-05) and of its WSDL; the manual names the types 33 and 34, and this takes the
 * four an assignment file can carry.
 *
 * Whether a document is assigned in the SII's public registry of credit transfers (RPETC): `getEstCesion` of the
 * registry's `wsRPETCConsulta` service, with the SOAP token. Without `accessKey` the registry only says whether the
 * document is assigned, and the key travels empty; with the key of the assignment it also says who holds the document,
 * when its last entry was written, who collects it and where, and whether a sworn statement goes with it. `assigned` is
 * true when the registry answers `0`; any other result is returned in `code` and `message`, and the manual gives it as a
 * document that does not exist or is not assigned (2 is no information found, 1 an error in the data, 9 and 10 a user
 * without permission). A token the registry refuses (3, 4 and 5) is renewed once, and an internal error (6, 7 and 8) is
 * repeated by the retry policy.
 * ES: **Inestable**: no se ha corrido contra el SII, así que su forma puede cambiar en cualquier versión, incluso un
 * patch. La función, sus parámetros, la respuesta y sus resultados son los del manual del servicio que publica el SII
 * (WS Consulta de Estado – RPETC, versión 1.2 del 05-02-2008) y los de su WSDL; el manual nombra los tipos 33 y 34, y
 * aquí se aceptan los cuatro que un archivo de cesión puede llevar.
 *
 * Si un documento está cedido en el Registro Público Electrónico de Transferencia de Créditos (RPETC) del SII:
 * `getEstCesion` del servicio `wsRPETCConsulta` del registro, con el token SOAP. Sin `accessKey` el registro solo dice
 * si el documento está cedido, y la clave viaja vacía; con la clave de la cesión dice además quién es el tenedor del
 * documento, cuándo se escribió su última anotación, quién lo cobra y dónde, y si lo acompaña una declaración jurada.
 * `assigned` es verdadero cuando el registro responde `0`; cualquier otro resultado vuelve en `code` y `message`, y el
 * manual lo da como un documento que no existe o no está cedido (2 es que no se encontró información, 1 un error en
 * los datos, 9 y 10 un usuario sin permiso). Un token que el registro rechaza (3, 4 y 5) se renueva una vez, y un
 * error interno (6, 7 y 8) lo repite la política de reintentos.
 * @param sii EN: the client. ES: el cliente.
 * @param input EN: the document and, to read its data, the key of the assignment. ES: el documento y, para leer sus datos, la clave de la cesión.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: whether the document is assigned and what the registry says of it. ES: si el documento está cedido y lo que el registro dice de él.
 * @throws {DteError} EN: `INVALID_RUT { field: 'issuerRut' }`, `INVALID_DOCUMENT_TYPE { field: 'type' }`, `INVALID_FOLIO { field: 'folio' }`, `INVALID_OPTION { field: 'accessKey' }`, `SII_RESPONSE_INVALID` for an answer without `ESTADO`, `SII_TOKEN_INVALID` for a token refused twice, `SII_QUERY_ERROR { code, reason }` for an internal error that stays, `SII_SOAP_FAULT`, `SII_HTTP_ERROR`, token and transport codes. ES: los mismos códigos.
 */
export const unstable_queryAssignmentState = async (
  sii: SiiClient,
  input: AssignmentStateInput,
  overrides?: CallOverrides,
): Promise<AssignmentState> => {
  const document = documentParams(input)
  const key = input.accessKey
  if (key !== undefined && (typeof key !== 'string' || !ACCESS_KEY_PATTERN.test(key)))
    throw new DteError('INVALID_OPTION', { field: 'accessKey' })
  // The parameters of an operation are matched by their place, so a query without a key still sends its element.
  const params = [...document, { name: 'IdCesion', value: key ?? '' }]
  return askRegistry(sii, OPERATION_STATE, 'getEstCesion', params, overrides, assignmentState)
}

/**
 * EN: **Unstable**: it has not been run against the SII, so its shape may change in any release, a patch included. The
 * function, its parameters, the answer and its results are the ones of the SII's manual of the service (WS Consulta de
 * Estado – RPETC, version 1.2 of 2008-02-05) and of its WSDL; the manual names the types 33 and 34, and this takes the
 * four an assignment file can carry.
 *
 * What the registry says of the assignment of a document to a company linked to it, as its holder or its receiver:
 * `getEstCesionRelac` of the registry's `wsRPETCConsulta` service, with the SOAP token, which needs no key of the
 * assignment. The company defaults to the client's, and the user that authenticates must be authorized in it. The
 * answer is the one of `unstable_queryAssignmentState` with a key; the result -15 is a company the registry does not
 * link to the document, and 10 a user without permission in the company, both returned in `code` and `message` with
 * `assigned` false.
 * ES: **Inestable**: no se ha corrido contra el SII, así que su forma puede cambiar en cualquier versión, incluso un
 * patch. La función, sus parámetros, la respuesta y sus resultados son los del manual del servicio que publica el SII
 * (WS Consulta de Estado – RPETC, versión 1.2 del 05-02-2008) y los de su WSDL; el manual nombra los tipos 33 y 34, y
 * aquí se aceptan los cuatro que un archivo de cesión puede llevar.
 *
 * Lo que el registro dice de la cesión de un documento a una empresa vinculada con él, como tenedor o como receptor:
 * `getEstCesionRelac` del servicio `wsRPETCConsulta` del registro, con el token SOAP, que no pide la clave de la
 * cesión. La empresa es por defecto la del cliente, y el usuario que se autentica debe estar autorizado en ella. La
 * respuesta es la de `unstable_queryAssignmentState` con clave; el resultado -15 es una empresa que el registro no
 * vincula con el documento, y 10 un usuario sin permiso en la empresa, ambos devueltos en `code` y `message` con
 * `assigned` en falso.
 * @param sii EN: the client. ES: el cliente.
 * @param input EN: the document and the company linked to it. ES: el documento y la empresa vinculada con él.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: whether the document is assigned and what the registry says of it. ES: si el documento está cedido y lo que el registro dice de él.
 * @throws {DteError} EN: `INVALID_RUT { field: 'issuerRut' | 'companyRut' }`, `INVALID_DOCUMENT_TYPE { field: 'type' }`, `INVALID_FOLIO { field: 'folio' }`, `MISSING_FIELD` when neither the input nor the client names a company, `SII_RESPONSE_INVALID` for an answer without `ESTADO`, `SII_TOKEN_INVALID` for a token refused twice, `SII_QUERY_ERROR { code, reason }` for an internal error that stays, `SII_SOAP_FAULT`, `SII_HTTP_ERROR`, token and transport codes. ES: los mismos códigos.
 */
export const unstable_queryRelatedAssignmentState = async (
  sii: SiiClient,
  input: RelatedAssignmentStateInput,
  overrides?: CallOverrides,
): Promise<AssignmentState> => {
  const document = documentParams(input)
  const company = splitSiiRut(resolveCompanyRut(sii, input.companyRut))
  const params = [
    ...document,
    { name: 'RutEmpresa', value: company.body },
    { name: 'DVEmpresa', value: company.verifier.toUpperCase() },
  ]
  return askRegistry(sii, OPERATION_RELATED, 'getEstCesionRelac', params, overrides, assignmentState)
}
