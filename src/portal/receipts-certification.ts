import { RECEIPTS_PORTAL } from '../catalogs/certification'
import { cgiUrl } from '../catalogs/portal'
import { DteError, errorCode, errorMessage } from '../errors'
import { splitSiiRut, toSiiRut, type SiiRut } from '../model/rut'
import type { CallOverrides } from '../sii/client'
import { bodyExcerpt } from '../sii/operation'
import { encodeUtf8 } from '../sii/transport'
import { chileDate } from '../time/chile'
import { resolvePortalCompany, type PortalClient } from './client'
import { declarationRepresentative, downloadRepresentative, type CookieRepresentative } from './cookies'
import {
  GWT_CONTENT_TYPE,
  GWT_INTEGER,
  gwtHeaders,
  gwtInteger,
  gwtNull,
  gwtString,
  postGwt,
  type GwtHashes,
  type GwtParameter,
} from './gwt'
import {
  hasSelector,
  inputFieldsOf,
  isDeclaredState,
  isEmptyList,
  isReadyState,
  isReceiptsSet,
  offeredTypes,
  postulationOf,
  receiptsComplianceBody,
  receiptsProgressRow,
  representativeDigitsOf,
  stampingAction,
  stateNamedIn,
} from './pages/receipts-certification'
import {
  companyFields,
  ensureSession,
  portalRequest,
  rejected,
  unexpectedPage,
  withPortalSession,
  type PortalContext,
} from './session'

const RECEIPT_TYPE = 39
const READY_STATE = 90
const DECLARED_STATE = 91
const READY = 'P90'
const DECLARED = 'P91'
const DEFAULT_LINK = 'www.sii.cl'
const SERVICE_URL = `${RECEIPTS_PORTAL.base}${RECEIPTS_PORTAL.service}`

type Party = { readonly digits: string; readonly verifier: string }

const partyOf = (rut: SiiRut): Party => {
  const { body, verifier } = splitSiiRut(rut)
  return { digits: body, verifier }
}

// The posts that change the application (the track id, the declaration) are sent once: a retry could repeat them.
const once = (context: PortalContext): PortalContext => ({
  ...context,
  overrides: { ...context.overrides, retry: false },
})

const call = (
  context: PortalContext,
  hashes: GwtHashes,
  method: string,
  parameters: readonly GwtParameter[],
): ReturnType<typeof postGwt> => postGwt(context, method, RECEIPTS_PORTAL, hashes, method, parameters)

const companyParameters = (company: Party): readonly GwtParameter[] => [
  gwtInteger(Number(company.digits)),
  gwtString(company.verifier),
]

const REPRESENTATIVES_METHOD = 'recuperarRepresentantesVigentesUsuariosAutorizados'
const POSTULATION_METHOD = 'obtenerPostulacionSeg'

const postulationParameters = (company: Party): readonly GwtParameter[] => [
  ...companyParameters(company),
  gwtString(String(READY_STATE)),
  gwtString(READY),
]

// The representative of the declaration is the owner of the session: with two people enrolled for a company, any other
// choice makes the SII answer the declaration with a bare HTTP 500. The portal's list is read again only when the
// cookies name nobody.
const declarationRepresentativeOf = async (
  context: PortalContext,
  hashes: GwtHashes,
  company: Party,
): Promise<CookieRepresentative> => {
  const owner = declarationRepresentative(context.state.cookies)
  const digits =
    owner.digits !== ''
      ? owner.digits
      : (representativeDigitsOf(
          (await call(context, hashes, REPRESENTATIVES_METHOD, companyParameters(company))).answer,
        ) ?? '')
  if (digits === '') throw new DteError('MISSING_FIELD', { field: 'representative' })
  return { digits, verifier: owner.verifier }
}

/**
 * EN: What every operation of the receipts portal takes.
 * ES: Lo que recibe cada operación del portal de boletas.
 */
export type ReceiptsPortalInput = {
  /** EN: Company RUT; the client's by default. ES: RUT de la empresa; por defecto el del cliente. */
  readonly companyRut?: string
  /** EN: The portal's hashes, when the pair known to work has gone stale. ES: Los hashes del portal, cuando el par que se sabe que funciona quedó obsoleto. */
  readonly gwt?: GwtHashes
}

/**
 * EN: Input of `downloadReceiptsTestSet`.
 * ES: Entrada de `downloadReceiptsTestSet`.
 */
export type DownloadReceiptsTestSetInput = ReceiptsPortalInput & {
  /** EN: The software provider's mail the portal asks for with the set. ES: `mailProvSw` — El correo del proveedor de software que el portal pide con el set. */
  readonly providerMail?: string
}

/**
 * EN: What `downloadReceiptsTestSet` read.
 * ES: Lo que leyó `downloadReceiptsTestSet`.
 */
export type ReceiptsTestSetDownload = {
  /** EN: The set text, for `parseReceiptsTestSet`. ES: El texto del set, para `parseReceiptsTestSet`. */
  readonly text: string
  /** EN: The representative the download named, as `<digits>-<verifier>` from the session cookies; the verifier may be empty. ES: `rutRepre` + `dvRepre` — El representante que nombró la descarga, como `<dígitos>-<verificador>` desde las cookies de la sesión; el verificador puede venir vacío. */
  readonly representativeRut: string
}

/**
 * EN: The state of the receipts application.
 * ES: El estado de la postulación de boletas.
 */
export type ReceiptsStatus = {
  /** EN: The company has valid representatives on the receipts portal. ES: La empresa tiene representantes vigentes en el portal de boletas. */
  readonly enrolled: boolean
  /** EN: The SII approved the set: the declaration can be made (`P90`). ES: El SII aprobó el set: se puede declarar (`P90`). */
  readonly readyToDeclare: boolean
  /** EN: The declaration was already made (`P91`). ES: La declaración ya se hizo (`P91`). */
  readonly declared: boolean
  /** EN: The state the portal named, or null. ES: El estado que nombró el portal, o null. */
  readonly state: string | null
}

/**
 * EN: The software provider the declaration names.
 * ES: El proveedor de software que nombra la declaración.
 */
export type ReceiptsProvider = {
  /** EN: The provider's RUT. ES: RUT del proveedor. */
  readonly rut: string
  /** EN: The provider's name. ES: Nombre del proveedor. */
  readonly name: string
  /** EN: The provider's mail. ES: Correo del proveedor. */
  readonly mail: string
}

/**
 * EN: Input of `declareReceiptsCompliance`.
 * ES: Entrada de `declareReceiptsCompliance`.
 */
export type DeclareReceiptsComplianceInput = ReceiptsPortalInput & {
  /** EN: The software provider; a company that is its own provider passes itself. ES: El proveedor de software; una empresa que es su propio proveedor se pasa a sí misma. */
  readonly provider: ReceiptsProvider
  /** EN: The company's business name. ES: La razón social de la empresa. */
  readonly businessName: string
  /** EN: The query link; `www.sii.cl` by default. ES: El link de consulta; por defecto `www.sii.cl`. */
  readonly link?: string
}

/**
 * EN: How `declareReceiptsCompliance` ended.
 * ES: Cómo terminó `declareReceiptsCompliance`.
 */
export type ReceiptsComplianceResult = {
  /** EN: `declared` now, `alreadyDeclared` earlier, or `notReady`: the SII has not approved the set yet and nothing was sent. ES: `declared` ahora, `alreadyDeclared` antes, o `notReady`: el SII aún no aprueba el set y no se envió nada. */
  readonly outcome: 'declared' | 'alreadyDeclared' | 'notReady'
  /** EN: The state of the application. ES: El estado de la postulación. */
  readonly state: string | null
}

/**
 * EN: Input of `verifyReceiptsAuthorization`.
 * ES: Entrada de `verifyReceiptsAuthorization`.
 */
export type VerifyReceiptsAuthorizationInput = {
  /** EN: A client on production, to read the stamping form. ES: Un cliente en producción, para leer el formulario de timbraje. */
  readonly production?: PortalClient
  /** EN: A client on certification, to read the progress page. ES: Un cliente en certificación, para leer la página de avance (`pe_avance6`). */
  readonly certification?: PortalClient
  /** EN: Company RUT; each client's by default. ES: RUT de la empresa; por defecto el de cada cliente. */
  readonly companyRut?: string
}

/**
 * EN: One side of `verifyReceiptsAuthorization`. `queryFailed` means the portal did not answer the question: it is
 * never "not authorised".
 * ES: Un lado de `verifyReceiptsAuthorization`. `queryFailed` significa que el portal no respondió la pregunta: nunca
 * es "no autorizada".
 */
export type ReceiptsAuthorizationCheck = {
  /** EN: The company may issue receipts there. ES: La empresa puede emitir boletas ahí. */
  readonly authorized: boolean
  /** EN: The query could not be answered. ES: La consulta no se pudo responder. */
  readonly queryFailed: boolean
  /** EN: The error code, when the query failed. ES: El código del error, si la consulta falló. */
  readonly errorCode?: string
  /** EN: The error message, when the query failed. ES: El mensaje del error, si la consulta falló. */
  readonly error?: string
}

/**
 * EN: What `verifyReceiptsAuthorization` read; a side is null when its client was not given.
 * ES: Lo que leyó `verifyReceiptsAuthorization`; un lado es null cuando no se entregó su cliente.
 */
export type ReceiptsAuthorization = {
  /** EN: Production: authorised when type 39 can be stamped. ES: Producción: autorizada cuando el tipo 39 se puede timbrar. */
  readonly production: (ReceiptsAuthorizationCheck & { readonly types: readonly number[] }) | null
  /** EN: Certification: the receipts row of the progress page. ES: Certificación: la fila de boletas de la página de avance. */
  readonly certification: (ReceiptsAuthorizationCheck & { readonly state: string | null }) | null
}

/**
 * EN: Downloads the receipts test set. The representatives list and the application record are read first (the portal
 * wants them before the download; their answers are not judged), then `DownloadFileServlet` with the company, the
 * representative from the `rut` and `dv` session cookies and the provider's mail. The HTTP status of the download is
 * not looked at: any body of ten characters or more is the set.
 * ES: Descarga el set de pruebas de boletas. Primero se leen la lista de representantes y el registro de la
 * postulación (el portal los quiere antes de la descarga; sus respuestas no se juzgan), y luego `DownloadFileServlet`
 * con la empresa, el representante de las cookies de sesión `rut` y `dv` y el correo del proveedor. No se mira el
 * estado HTTP de la descarga: cualquier cuerpo de diez caracteres o más es el set.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the company, the provider's mail, the hashes. ES: la empresa, el correo del proveedor, los hashes.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the set text and the representative named. ES: el texto del set y el representante nombrado.
 * @throws {DteError} EN: `SII_PORTAL_UNEXPECTED_PAGE` when the download is no set; `MISSING_FIELD { field: 'representative' }` when the session cookies name none; session, block and transport codes. ES: los mismos códigos.
 */
export const downloadReceiptsTestSet = (
  portal: PortalClient,
  input: DownloadReceiptsTestSetInput = {},
  overrides?: CallOverrides,
): Promise<ReceiptsTestSetDownload> =>
  withPortalSession(portal, 'downloadReceiptsTestSet', overrides, async (context) => {
    const company = partyOf(resolvePortalCompany(portal, input.companyRut))
    const hashes = input.gwt ?? RECEIPTS_PORTAL.known
    await ensureSession(context)
    // The portal wants both calls before the download; their answers are not judged.
    await call(context, hashes, REPRESENTATIVES_METHOD, companyParameters(company))
    const representative = downloadRepresentative(context.state.cookies)
    if (representative.digits === '') throw new DteError('MISSING_FIELD', { field: 'representative' })
    await call(context, hashes, POSTULATION_METHOD, postulationParameters(company))
    const query = `rutEmpresa=${company.digits}&dvEmpresa=${company.verifier}&rutRepre=${representative.digits}&dvRepre=${representative.verifier}&mailProvSw=${encodeURIComponent(input.providerMail ?? '')}`
    const page = await portalRequest(
      context,
      'DownloadFileServlet',
      'GET',
      `${RECEIPTS_PORTAL.base}DownloadFileServlet?${query}`,
      { referer: `${RECEIPTS_PORTAL.base}?SET=1`, headers: { Accept: 'text/plain,text/html,*/*' } },
    )
    if (!isReceiptsSet(page.html)) throw unexpectedPage(context, 'DownloadFileServlet', page.html)
    return { text: page.html, representativeRut: `${representative.digits}-${representative.verifier}` }
  })

/**
 * EN: Declares the track id of the receipts envelope, so the SII validates the set (`ingresarTrackId`). Sent once. The
 * SII validates on its own and reports by mail; `readReceiptsStatus` tells when the declaration can be made.
 * ES: Declara el track id del sobre de boletas, para que el SII valide el set (`ingresarTrackId`). Se envía una vez. El
 * SII valida por su cuenta y avisa por correo; `readReceiptsStatus` dice cuándo se puede declarar.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the track id, the company, the hashes. ES: el track id, la empresa, los hashes.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the raw answer. ES: la respuesta cruda.
 * @throws {DteError} EN: `MISSING_FIELD { field: 'trackId' }`; `SII_PORTAL_REJECTED { rejection: 'receiptsTrackIdRefused' }` when the answer is not `//OK`; session, block and transport codes. ES: los mismos códigos.
 */
export const declareReceiptsTrackId = (
  portal: PortalClient,
  input: ReceiptsPortalInput & { readonly trackId: string },
  overrides?: CallOverrides,
): Promise<{ readonly body: string }> =>
  withPortalSession(portal, 'declareReceiptsTrackId', overrides, async (context) => {
    if (input.trackId.trim() === '') throw new DteError('MISSING_FIELD', { field: 'trackId' })
    const company = partyOf(resolvePortalCompany(portal, input.companyRut))
    await ensureSession(context)
    const { page, answer } = await call(once(context), input.gwt ?? RECEIPTS_PORTAL.known, 'ingresarTrackId', [
      ...companyParameters(company),
      gwtString(null),
      gwtString(String(READY_STATE)),
      gwtNull(GWT_INTEGER),
      gwtString(null),
      gwtString(input.trackId.trim()),
    ])
    if (!answer.ok)
      throw rejected(context, 'receiptsTrackIdRefused', {
        httpStatus: page.status,
        portalMessage: bodyExcerpt(page.html),
      })
    return { body: page.html }
  })

const NOT_ENROLLED: ReceiptsStatus = { enrolled: false, readyToDeclare: false, declared: false, state: null }

const statusIn = async (context: PortalContext, hashes: GwtHashes, company: Party): Promise<ReceiptsStatus> => {
  const { answer: list } = await call(context, hashes, REPRESENTATIVES_METHOD, companyParameters(company))
  if (representativeDigitsOf(list) === null) return NOT_ENROLLED
  const bodyFor = async (state: number): Promise<string> =>
    (
      await call(context, hashes, 'obtenerEstadoAutorizaEmp', [
        ...companyParameters(company),
        gwtInteger(state),
        gwtString(null),
      ])
    ).page.html
  const asked = await bodyFor(READY_STATE)
  const readyToDeclare = isReadyState(asked)
  const state = readyToDeclare ? READY : stateNamedIn(asked)
  if (state !== null || !isEmptyList(asked)) return { enrolled: true, readyToDeclare, declared: false, state }
  // An empty list for 90 is "not approved yet" or "already declared": the state 91 tells them apart.
  const declared = await bodyFor(DECLARED_STATE).then(isDeclaredState, (error: unknown) => {
    context.portal.logger.warn('receipts declared state unavailable', { reason: errorMessage(error) })
    return false
  })
  return { enrolled: true, readyToDeclare: false, declared, state: declared ? DECLARED : null }
}

/**
 * EN: Reads the state of the receipts application: whether the company is enrolled (it has valid representatives),
 * whether the SII approved the set (`P90`, ready to declare) and whether the declaration was made (`P91`). The portal
 * answers an empty list for the state 90 both before the approval and after the declaration, so the state 91 is asked
 * for too.
 * ES: Lee el estado de la postulación de boletas: si la empresa está inscrita (tiene representantes vigentes), si el
 * SII aprobó el set (`P90`, lista para declarar) y si la declaración ya se hizo (`P91`). El portal responde una lista
 * vacía para el estado 90 tanto antes de la aprobación como después de la declaración, así que también se consulta el
 * estado 91.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the company, the hashes. ES: la empresa, los hashes.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @throws {DteError} EN: session, block and transport codes. ES: códigos de sesión, bloqueo y transporte.
 */
export const readReceiptsStatus = (
  portal: PortalClient,
  input: ReceiptsPortalInput = {},
  overrides?: CallOverrides,
): Promise<ReceiptsStatus> =>
  withPortalSession(portal, 'readReceiptsStatus', overrides, async (context) => {
    const company = partyOf(resolvePortalCompany(portal, input.companyRut))
    await ensureSession(context)
    return statusIn(context, input.gwt ?? RECEIPTS_PORTAL.known, company)
  })

const requiredText = (value: string | undefined, field: string): string => {
  const text = (value ?? '').trim()
  if (text === '') throw new DteError('MISSING_FIELD', { field })
  return text
}

const declarationDate = (now: Date): string => {
  const [year, month, day] = chileDate(now).split('-')
  return `${day}-${month}-${year}`
}

/**
 * EN: Makes the declaration of compliance of the receipts application, which authorises the company to issue receipts
 * in production (`autorizarEmpresaBolProd`). It cannot be undone. The status is read first: a declaration already made
 * and an application the SII has not approved yet are outcomes, and nothing is sent. The representative is the owner
 * of the session, from the `rutm`/`dvm` cookies before `rut`/`dv`, with the verifier 8 when none has one; the software provider is mandatory, because the SII refused some companies that declared
 * themselves as their own provider by default. Sent once.
 * ES: Hace la declaración de cumplimiento de la postulación de boletas, que autoriza a la empresa a emitir boletas en
 * producción (`autorizarEmpresaBolProd`). No se puede deshacer. Primero se lee el estado: una declaración ya hecha y
 * una postulación que el SII aún no aprueba son resultados, y no se envía nada. El representante es el dueño de la
 * sesión, de las cookies `rutm`/`dvm` antes que `rut`/`dv`, con verificador 8 cuando ninguna lo trae; el proveedor de software es obligatorio, porque el SII rechazó a algunas empresas que se declararon por
 * defecto como su propio proveedor. Se envía una vez.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the provider, the business name, the link, the company, the hashes. ES: el proveedor, la razón social, el link, la empresa, los hashes.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @throws {DteError} EN: `MISSING_FIELD` (`provider`, `provider.rut`, `provider.name`, `provider.mail`, `businessName`, `representative`), `INVALID_RUT`; `SII_PORTAL_REJECTED` with `receiptsNotEnrolled` or `receiptsComplianceRefused`; `SII_PORTAL_UNEXPECTED_PAGE` when the application record is not an `//OK` answer or lacks its Long, before anything is sent; session, block and transport codes. ES: los mismos códigos.
 */
export const declareReceiptsCompliance = (
  portal: PortalClient,
  input: DeclareReceiptsComplianceInput,
  overrides?: CallOverrides,
): Promise<ReceiptsComplianceResult> =>
  withPortalSession(portal, 'declareReceiptsCompliance', overrides, async (context) => {
    if (input.provider === undefined) throw new DteError('MISSING_FIELD', { field: 'provider' })
    const provider = partyOf(toSiiRut(requiredText(input.provider.rut, 'provider.rut'), 'provider.rut'))
    const providerName = requiredText(input.provider.name, 'provider.name')
    const providerMail = requiredText(input.provider.mail, 'provider.mail')
    const businessName = requiredText(input.businessName, 'businessName')
    const company = partyOf(resolvePortalCompany(portal, input.companyRut))
    const hashes = input.gwt ?? RECEIPTS_PORTAL.known
    await ensureSession(context)
    const status = await statusIn(context, hashes, company)
    if (!status.enrolled) throw rejected(context, 'receiptsNotEnrolled', {})
    if (status.declared) return { outcome: 'alreadyDeclared', state: status.state }
    if (!status.readyToDeclare) return { outcome: 'notReady', state: status.state }
    const representative = await declarationRepresentativeOf(context, hashes, company)
    // The declaration cannot be undone: without the application's own Long, nothing is sent.
    const application = await call(context, hashes, POSTULATION_METHOD, postulationParameters(company))
    const record = postulationOf(application.answer)
    if (record === null) throw unexpectedPage(context, POSTULATION_METHOD, application.page.html)
    const body = receiptsComplianceBody({
      moduleBase: RECEIPTS_PORTAL.base,
      policy: hashes.policy,
      serviceInterface: RECEIPTS_PORTAL.serviceInterface,
      company,
      provider,
      representative,
      date: declarationDate(portal.now()),
      providerMail,
      providerName,
      link: input.link ?? DEFAULT_LINK,
      authorizationDate: record.authorizationDate,
      token: record.token,
      businessName,
    })
    const page = await portalRequest(once(context), 'autorizarEmpresaBolProd', 'POST', SERVICE_URL, {
      body: encodeUtf8(body),
      contentType: GWT_CONTENT_TYPE,
      referer: RECEIPTS_PORTAL.base,
      headers: gwtHeaders(RECEIPTS_PORTAL.base, hashes.permutation),
    })
    if (!page.html.startsWith('//OK'))
      throw rejected(context, 'receiptsComplianceRefused', {
        httpStatus: page.status,
        portalMessage: bodyExcerpt(page.html),
      })
    return { outcome: 'declared', state: DECLARED }
  })

const failed = (error: unknown): ReceiptsAuthorizationCheck => ({
  authorized: false,
  queryFailed: true,
  errorCode: errorCode(error),
  error: errorMessage(error),
})

// The types the stamping form offers: the entry page is read, its form posted with the company, and every option with
// a quoted value read from the answer, which must have a selector to be the form.
const stampingTypes = (portal: PortalClient, companyRut: string | undefined): Promise<readonly number[]> =>
  withPortalSession(portal, 'verifyReceiptsAuthorization', undefined, async (context) => {
    const resolved = resolvePortalCompany(portal, companyRut)
    // The field posts the RUT as it was written, split on the hyphen: its verifier is not put in capitals.
    const [digits, verifier] = (companyRut ?? resolved).replace(/\./g, '').split('-')
    const company = companyRut === undefined ? companyFields(resolved) : { RUT_EMP: digits, DV_EMP: verifier }
    await ensureSession(context)
    const entryUrl = cgiUrl(portal.environment, 'of_solicita_folios')
    const entry = await portalRequest(context, 'of_solicita_folios', 'GET', entryUrl)
    const form = await portalRequest(
      context,
      'of_solicita_folios_dcto',
      'POST',
      stampingAction(entry.html, new URL(entryUrl).origin),
      { form: { ...inputFieldsOf(entry.html), ...company } },
    )
    if (!hasSelector(form.html)) throw unexpectedPage(context, 'of_solicita_folios_dcto', form.html)
    return offeredTypes(form.html)
  })

// The receipts row of the progress page, which is one GET: the status of the answer is not looked at.
const progressRow = (portal: PortalClient): Promise<ReturnType<typeof receiptsProgressRow>> =>
  withPortalSession(portal, 'verifyReceiptsAuthorization', undefined, async (context) => {
    await ensureSession(context)
    const page = await portalRequest(context, 'pe_avance6', 'GET', cgiUrl(portal.environment, 'pe_avance6'))
    return receiptsProgressRow(page.html)
  })

/**
 * EN: Reads whether the company may issue receipts, with the requests of the field. In production, a GET of the
 * stamping entry page and a POST of its form with the company, and type 39 among the quoted option values of the answer
 * (which must have a selector). In certification, one GET of the progress page: its receipts row says conform, approved
 * or authorised, or a line of the page says the receipts are authorised. A query the portal does not answer is
 * `queryFailed`, never "not authorised": a missing stamping form was once read as a refusal. Neither side throws.
 * ES: Lee si la empresa puede emitir boletas, con las peticiones del campo. En producción, un GET de la página de
 * entrada del timbraje y un POST de su formulario con la empresa, y el tipo 39 entre los valores de opción entre
 * comillas de la respuesta (que debe tener un selector). En certificación, un GET de la página de avance: su fila de
 * boletas dice conforme, aprobado o autorizado, o una línea de la página dice que las boletas están autorizadas. Una
 * consulta que el portal no responde es `queryFailed`, nunca "no autorizada": un formulario de timbraje ausente se leyó
 * una vez como rechazo. Ningún lado lanza.
 * @param input EN: the two clients and the company. ES: los dos clientes y la empresa.
 */
export const verifyReceiptsAuthorization = async (
  input: VerifyReceiptsAuthorizationInput,
): Promise<ReceiptsAuthorization> => {
  const production =
    input.production === undefined
      ? null
      : await stampingTypes(input.production, input.companyRut).then(
          (types) => ({ authorized: types.includes(RECEIPT_TYPE), queryFailed: false, types }),
          (error: unknown) => ({ ...failed(error), types: [] }),
        )
  const certification =
    input.certification === undefined
      ? null
      : await progressRow(input.certification).then(
          (row) => ({ authorized: row.authorized, queryFailed: false, state: row.state }),
          (error: unknown) => ({ ...failed(error), state: null }),
        )
  return { production, certification }
}
