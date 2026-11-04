import {
  ACCOUNTING_STATES,
  DOCUMENT_OPERATIONS,
  RCV_SERVICES,
  rcvAppUrl,
  REGISTER_OPERATIONS,
  type AccountingStatus,
  type DocumentDirection,
  type RcvService,
  type RegisterOperation,
} from '../catalogs/portal'
import { DteError } from '../errors'
import { splitSiiRut, toSiiRut } from '../model/rut'
import { redactText } from '../sii/capture'
import type { CallOverrides } from '../sii/client'
import { isPeriod } from '../time/chile'
import { resolvePortalCompany, siiCodeOf, type PortalClient } from './client'
import {
  changeMessageOf,
  parseRcvAnswer,
  periodDocumentsOf,
  periodSummaryOf,
  purchaseDocumentOf,
  purchaseTypesOf,
  registerSummaryOf,
  type PeriodDocuments,
  type PurchaseDocument,
  type PurchaseType,
  type RcvObject,
  type RegisterSummary,
} from './pages/rcv'
import {
  ensurePage,
  portalRequest,
  rejected,
  unexpectedPage,
  withFreshSessionRetry,
  withPortalSession,
  type PortalContext,
} from './session'

/**
 * EN: What `listPeriodDocuments` needs.
 * ES: Lo que necesita `listPeriodDocuments`.
 */
export type ListPeriodDocumentsInput = {
  /** EN: Period, `YYYY-MM`. ES: `periodo` — Período, `AAAA-MM`. */
  readonly period: string
  /** EN: Issued or received documents; issued by default. ES: `operacion` — Documentos emitidos o recibidos; por defecto emitidos. */
  readonly direction?: DocumentDirection
  /** EN: Company, when it is not the client's. ES: `rutContribuyente` + `dvContribuyente` — Empresa, si no es la del cliente. */
  readonly companyRut?: string
}

/**
 * EN: What `fetchRegisterSummary` needs.
 * ES: Lo que necesita `fetchRegisterSummary`.
 */
export type RegisterSummaryInput = {
  /** EN: Period, `YYYY-MM`. ES: `ptributario` — Período, `AAAA-MM`. */
  readonly period: string
  /** EN: Purchases or sales. ES: `operacion` — Compras o ventas. */
  readonly operation: RegisterOperation
  /** EN: Accounting status; registered by default. ES: `estadoContab` — Estado contable; por defecto registrado. */
  readonly accountingStatus?: AccountingStatus
  /** EN: Company, when it is not the client's. ES: `rutEmisor` + `dvEmisor` — Empresa, si no es la del cliente. */
  readonly companyRut?: string
}

/**
 * EN: Which purchase of the register.
 * ES: Qué compra del registro.
 */
export type PurchaseDocumentKey = {
  /** EN: Document type. ES: `tipoDocumento` — Tipo de documento. */
  readonly type: number
  /** EN: Folio. ES: `numeroDocumento` — Folio. */
  readonly folio: number
  /** EN: Tax period, `YYYY-MM`. ES: `periodoTributario` — Período tributario, `AAAA-MM`. */
  readonly period: string
  /** EN: RUT of the issuer. ES: `rutContraparte` + `dvContraparte` — RUT del emisor. */
  readonly counterpartyRut: string
  /** EN: Company, when it is not the client's. ES: `rut` + `dv` — Empresa, si no es la del cliente. */
  readonly companyRut?: string
}

/**
 * EN: What `changePurchaseType` needs.
 * ES: Lo que necesita `changePurchaseType`.
 */
export type ChangePurchaseTypeInput = PurchaseDocumentKey & {
  /** EN: An `id` from `listPurchaseTypes`. ES: `tipoCompra` — Un `id` de `listPurchaseTypes`. */
  readonly purchaseType: string
}

/**
 * EN: What the functions that move VAT need: the final amount of each bucket after the change, not a delta. An absent amount goes empty.
 * ES: Lo que necesitan las funciones que mueven IVA: el monto final de cada casilla tras el cambio, no una diferencia. Un monto ausente va vacío.
 */
export type MoveVatInput = PurchaseDocumentKey & {
  /** EN: Final common use VAT. ES: `ivaComun` — IVA de uso común final. */
  readonly commonUseVat?: number
  /** EN: Final recoverable VAT. ES: `ivaRec` — IVA recuperable final. */
  readonly recoverableVat?: number
}

const assertPeriod = (period: string): void => {
  if (!isPeriod(period)) throw new DteError('INVALID_DATE', { field: 'period' })
}

const periodDigits = (period: string): string => period.replace('-', '')

const companyOf = (portal: PortalClient, companyRut?: string): { readonly body: string; readonly verifier: string } =>
  splitSiiRut(resolvePortalCompany(portal, companyRut))

// The app leaves the token in the jar; the phase 4 session handles the login it may ask for.
const openService = async (context: PortalContext, service: RcvService): Promise<string> => {
  const page = await ensurePage(context, service.entryApp, rcvAppUrl(context.portal.environment, service.entryApp))
  const { TOKEN, CSESSIONID } = context.state.cookies
  const token = TOKEN || CSESSIONID
  if (!token) throw unexpectedPage(context, 'token', page.html)
  return token
}

const callService = async (
  context: PortalContext,
  token: string,
  service: RcvService,
  method: string,
  data: unknown,
): Promise<RcvObject> => {
  const appUrl = rcvAppUrl(context.portal.environment, service.app)
  const page = await portalRequest(context, method, 'POST', `${appUrl}${service.facade}/${method}`, {
    json: {
      metaData: {
        namespace: `${service.namespace}/${method}`,
        conversationId: token,
        transactionId: service.paged ? '1' : context.portal.randomId(),
        page: service.paged ? { pageSize: 1, pageIndex: 1 } : null,
      },
      data,
    },
    referer: appUrl,
  })
  const answer = parseRcvAnswer(page.html)
  if (answer === null) throw unexpectedPage(context, method, redactText(page.html))
  return answer
}

type ServiceCall = (method: string, data: unknown) => Promise<RcvObject>

// One POST per call unless the caller opts in, while the login and the visit to the app keep their retries. A read that
// meets an expired session or an unreadable page starts over once with a fresh session.
const readService = <T>(
  context: PortalContext,
  service: RcvService,
  read: (call: ServiceCall) => Promise<T>,
): Promise<T> =>
  withFreshSessionRetry(context, async () => {
    const token = await openService(context, service)
    const once: PortalContext = { ...context, overrides: { retry: false, ...context.overrides } }
    return read((method, data) => callService(once, token, service, method, data))
  })

const complementFields = (
  portal: PortalClient,
  key: PurchaseDocumentKey,
  change: Readonly<Record<string, string>> = {},
): RcvObject => {
  assertPeriod(key.period)
  const company = companyOf(portal, key.companyRut)
  const counterparty = splitSiiRut(toSiiRut(key.counterpartyRut, 'counterpartyRut'))
  return {
    rut: company.body,
    dv: company.verifier,
    operacion: 'COMPRA',
    tipoDocumento: String(key.type),
    numeroDocumento: String(key.folio),
    periodoTributario: periodDigits(key.period),
    ...change,
    rutContraparte: counterparty.body,
    dvContraparte: counterparty.verifier,
  }
}

/**
 * EN: Every document of a period, with no XML: the summary per type, then one detail call per row, at the same time. This
 * is not the official register. Response codes are not looked at, so a month the SII refuses to show reads as an empty one.
 * ES: Todos los documentos de un período, sin XML: el resumen por tipo y luego una llamada de detalle por fila, al mismo
 * tiempo. Este no es el registro oficial. No se miran los códigos de respuesta, así que un mes que el SII se niega a mostrar
 * se lee como uno vacío.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the period and the direction. ES: el período y la dirección.
 * @param overrides EN: per-call overrides; `retry` opts into repeating each call. ES: ajustes de la llamada; `retry` activa la repetición de cada llamada.
 * @returns EN: the summary and the documents. ES: el resumen y los documentos.
 * @throws {DteError} EN: `INVALID_DATE`, `INVALID_OPTION`, `MISSING_FIELD`, `INVALID_RUT`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const listPeriodDocuments = (
  portal: PortalClient,
  input: ListPeriodDocumentsInput,
  overrides?: CallOverrides,
): Promise<PeriodDocuments> =>
  withPortalSession(portal, 'listPeriodDocuments', overrides, async (context) => {
    assertPeriod(input.period)
    const direction = input.direction ?? 'issued'
    const operacion = siiCodeOf(DOCUMENT_OPERATIONS, direction, 'direction')
    const { body: rut, verifier: dv } = companyOf(portal, input.companyRut)
    return readService(context, RCV_SERVICES.documents, async (call) => {
      const summary = periodSummaryOf(
        await call('getResumen', {
          periodo: input.period,
          rutContribuyente: rut,
          dvContribuyente: dv,
          operacion,
        }),
      )
      if (summary.length === 0) return { summary: [], documents: [] }
      const details = await Promise.all(
        summary.map(async (row) => {
          const method =
            direction === 'issued' && (row.type === 33 || row.type === 34)
              ? 'getDetalleEmitidos3334'
              : 'getDetalleRecibidos'
          const type = String(row.raw.tipoDoc)
          const answer = await call(method, {
            tipoDoc: type,
            rut,
            dv,
            periodo: input.period,
            operacion,
            derrCodigo: type,
            refNCD: '0',
          })
          return periodDocumentsOf(answer, row)
        }),
      )
      return { summary, documents: details.flat() }
    })
  })

/**
 * EN: The official totals of a period by document type and accounting status, including what the SII aggregates, such as
 * receipts. Response codes are not looked at, so a month the SII refuses to show reads as an empty one.
 * ES: Los totales oficiales de un período por tipo de documento y estado contable, incluido lo que el SII agrega, como las
 * boletas. No se miran los códigos de respuesta, así que un mes que el SII se niega a mostrar se lee como uno vacío.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: the period, the operation and the status. ES: el período, la operación y el estado.
 * @param overrides EN: per-call overrides; `retry` opts into repeating the call. ES: ajustes de la llamada; `retry` activa la repetición de la llamada.
 * @returns EN: the rows and the header. ES: las filas y la cabecera.
 * @throws {DteError} EN: `INVALID_DATE`, `INVALID_OPTION`, `MISSING_FIELD`, `INVALID_RUT`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const fetchRegisterSummary = (
  portal: PortalClient,
  input: RegisterSummaryInput,
  overrides?: CallOverrides,
): Promise<RegisterSummary> =>
  withPortalSession(portal, 'fetchRegisterSummary', overrides, async (context) => {
    assertPeriod(input.period)
    const operacion = siiCodeOf(REGISTER_OPERATIONS, input.operation, 'operation')
    const estadoContab = siiCodeOf(ACCOUNTING_STATES, input.accountingStatus ?? 'registered', 'accountingStatus')
    const { body, verifier } = companyOf(portal, input.companyRut)
    return readService(context, RCV_SERVICES.register, async (call) =>
      registerSummaryOf(
        await call('getResumen', {
          rutEmisor: body,
          dvEmisor: verifier,
          ptributario: periodDigits(input.period),
          estadoContab,
          operacion,
          busquedaInicial: true,
        }),
      ),
    )
  })

/**
 * EN: The types of purchase the SII lets a document have.
 * ES: Los tipos de compra que el SII permite darle a un documento.
 * @param portal EN: the client. ES: el cliente.
 * @param overrides EN: per-call overrides; `retry` opts into repeating the call. ES: ajustes de la llamada; `retry` activa la repetición de la llamada.
 * @returns EN: the catalogue. ES: el catálogo.
 * @throws {DteError} EN: `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const listPurchaseTypes = (portal: PortalClient, overrides?: CallOverrides): Promise<readonly PurchaseType[]> =>
  withPortalSession(portal, 'listPurchaseTypes', overrides, (context) =>
    readService(context, RCV_SERVICES.complements, async (call) =>
      purchaseTypesOf(await call('obtieneTiposTransaccionCompra', null)),
    ),
  )

/**
 * EN: One purchase as the register holds it, including its current type of purchase.
 * ES: Una compra tal como la tiene el registro, incluido su tipo de compra vigente.
 * @param portal EN: the client. ES: el cliente.
 * @param key EN: which purchase. ES: qué compra.
 * @param overrides EN: per-call overrides; `retry` opts into repeating the call. ES: ajustes de la llamada; `retry` activa la repetición de la llamada.
 * @returns EN: the document, or null when the SII has no data for that key. ES: el documento, o null si el SII no tiene datos para esa clave.
 * @throws {DteError} EN: `INVALID_DATE`, `MISSING_FIELD`, `INVALID_RUT`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const fetchPurchaseDocument = (
  portal: PortalClient,
  key: PurchaseDocumentKey,
  overrides?: CallOverrides,
): Promise<PurchaseDocument | null> =>
  withPortalSession(portal, 'fetchPurchaseDocument', overrides, async (context) => {
    const data = complementFields(portal, key)
    return readService(context, RCV_SERVICES.complements, async (call) =>
      purchaseDocumentOf(await call('obtieneDetalleDocumento', data)),
    )
  })

// One attempt, always: nothing here can tell whether a lost answer means the change was applied.
const writeComplement = (
  portal: PortalClient,
  operation: string,
  overrides: CallOverrides | undefined,
  method: string,
  fields: () => RcvObject,
): Promise<void> =>
  withPortalSession(portal, operation, overrides, async (context) => {
    const data = fields()
    const token = await openService(context, RCV_SERVICES.complements)
    const once: PortalContext = { ...context, overrides: { ...context.overrides, retry: false } }
    const answer = await callService(once, token, RCV_SERVICES.complements, method, data)
    if (answer.data === 'OK') return
    const portalMessage = changeMessageOf(answer)
    throw rejected(context, 'purchaseChangeNotConfirmed', portalMessage === null ? {} : { portalMessage })
  })

const vatFields = (input: MoveVatInput): Readonly<Record<string, string>> => ({
  ivaComun: String(input.commonUseVat ?? ''),
  ivaRec: String(input.recoverableVat ?? ''),
})

/**
 * EN: Changes the type of purchase of a document. In production this changes the real register. One attempt; anything other
 * than the SII's `OK` throws, and then the change may have applied, so read the document again with `fetchPurchaseDocument`
 * before retrying.
 * ES: Cambia el tipo de compra de un documento. En producción esto cambia el registro real. Un solo intento; cualquier cosa
 * distinta del `OK` del SII lanza, y entonces el cambio pudo aplicarse, así que hay que releer el documento con
 * `fetchPurchaseDocument` antes de reintentar.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: which purchase and its new type. ES: qué compra y su nuevo tipo.
 * @param overrides EN: per-call overrides; `retry` does not reach the change. ES: ajustes de la llamada; `retry` no alcanza al cambio.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED { rejection: 'purchaseChangeNotConfirmed' }`, `INVALID_DATE`, `MISSING_FIELD`, `INVALID_RUT`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const changePurchaseType = (
  portal: PortalClient,
  input: ChangePurchaseTypeInput,
  overrides?: CallOverrides,
): Promise<void> =>
  writeComplement(portal, 'changePurchaseType', overrides, 'cambiaTipoCompra', () =>
    complementFields(portal, input, { tipoCompra: String(input.purchaseType) }),
  )

/**
 * EN: Moves the VAT of a document from recoverable to common use. In production this changes the real register. The amounts
 * are the final amount of each bucket after the change, not a delta: moving it all leaves `commonUseVat` with the total and
 * `recoverableVat` absent. One attempt; anything other than the SII's `OK` throws, and then the change may have applied, so
 * read the document again with `fetchPurchaseDocument` before retrying.
 * ES: Mueve el IVA de un documento de recuperable a uso común. En producción esto cambia el registro real. Los montos son el
 * monto final de cada casilla tras el cambio, no una diferencia: al mover todo, `commonUseVat` lleva el total y
 * `recoverableVat` queda ausente. Un solo intento; cualquier cosa distinta del `OK` del SII lanza, y entonces el cambio pudo
 * aplicarse, así que hay que releer el documento con `fetchPurchaseDocument` antes de reintentar.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: which purchase and the final amounts. ES: qué compra y los montos finales.
 * @param overrides EN: per-call overrides; `retry` does not reach the change. ES: ajustes de la llamada; `retry` no alcanza al cambio.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED { rejection: 'purchaseChangeNotConfirmed' }`, `INVALID_DATE`, `MISSING_FIELD`, `INVALID_RUT`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const moveVatToCommonUse = (
  portal: PortalClient,
  input: MoveVatInput,
  overrides?: CallOverrides,
): Promise<void> =>
  writeComplement(portal, 'moveVatToCommonUse', overrides, 'cambiaIvaRec2Comun', () =>
    complementFields(portal, input, vatFields(input)),
  )

/**
 * EN: Moves the VAT of a document from common use back to recoverable: the inverse of `moveVatToCommonUse`, with the same
 * rules. Moving it all back leaves `commonUseVat` at 0 and `recoverableVat` with the total.
 * ES: Mueve el IVA de un documento de uso común de vuelta a recuperable: lo inverso de `moveVatToCommonUse`, con las mismas
 * reglas. Al devolver todo, `commonUseVat` queda en 0 y `recoverableVat` lleva el total.
 * @param portal EN: the client. ES: el cliente.
 * @param input EN: which purchase and the final amounts. ES: qué compra y los montos finales.
 * @param overrides EN: per-call overrides; `retry` does not reach the change. ES: ajustes de la llamada; `retry` no alcanza al cambio.
 * @throws {DteError} EN: `SII_PORTAL_REJECTED { rejection: 'purchaseChangeNotConfirmed' }`, `INVALID_DATE`, `MISSING_FIELD`, `INVALID_RUT`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const moveVatToRecoverable = (
  portal: PortalClient,
  input: MoveVatInput,
  overrides?: CallOverrides,
): Promise<void> =>
  writeComplement(portal, 'moveVatToRecoverable', overrides, 'cambiaIvaComun2Recuperable', () =>
    complementFields(portal, input, vatFields(input)),
  )
