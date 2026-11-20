import { cgiUrl, MIPYME_BACKUP_BASE_URL } from '../catalogs/portal'
import { DteError, isDteError } from '../errors'
import { splitSiiRut, toSiiRut, type SiiRut } from '../model/rut'
import type { CallOverrides } from '../sii/client'
import { encodeUtf8 } from '../sii/transport'
import { encodeLatin1 } from '../text/latin1'
import { chileDate, isIsoDate } from '../time/chile'
import { resolvePortalCompany, type PortalClient } from './client'
import { sessionRut } from './cookies'
import { alertMessages } from './html'
import { asksForAuthentication, looksLikeLoginRedirect, portalMessageOf } from './pages/auth'
import {
  firstValues,
  folioOf,
  formFields,
  isFirewallRejection,
  isSignatureRefused,
  sendOutcome,
  signedDocumentOf,
  signForm,
  signingTimeOf,
  siiCodeOf,
  type FormField,
} from './pages/free-system'
import {
  ensurePage,
  navigate,
  portalRequest,
  rejected,
  withPortalSession,
  wrongPage,
  type PortalContext,
  type PortalPage,
} from './session'

const BASE = MIPYME_BACKUP_BASE_URL
const ISSUING_MENU = 'OPCION=34&TIPO=4'
const SELECTOR_URL = `${BASE}/mipeSelEmpresa.cgi?DESDE_DONDE_URL=${encodeURIComponent(ISSUING_MENU)}`
const INVOICE_FORM_URL = `${BASE}/mipeGenFacEx.cgi?IGUAL=ULT_FAC&PTDC_CODIGO=34&ES_BORR=FALSE&esCRED_EC=FALSE&esFACT_TUR=FALSE`
const PREVIEW_URL = `${BASE}/mipeDisplayPreView.cgi`
const GENERATE_URL = `${BASE}/mipeGenXMLFirma.cgi`
const SIGN_URL = `${BASE}/postFirmaDigital.cgi`
const SII_NAMESPACE = 'http://www.sii.cl/SiiDte'
const ANNULMENT_REASON = 'ANULA DOCUMENTO DE LA REFERENCIA'
// What the portal's script puts before `<Documento` when it signs a note centrally, as the field's signed notes carry it.
const CENTRAL_SIGNATURE_MARK = '<!-- O MacIntel Chrome 154 central VERSION: v20170209 -->'

const ITEM_COLUMNS = ['TPO_COD', 'COD', 'NMB', 'QTY', 'UNMD', 'PRC', 'OTRO_IMP', 'PCTD', 'SUBT', 'DSC_ITEM'] as const
const REFERENCE_COLUMNS = ['TPO_DOC_REF', 'IND_GLOBAL', 'FOLIO_REF', 'FCH_REF', 'CODIGO_REF', 'RAZON_REF'] as const
const two = (index: number): string => String(index).padStart(2, '0')
const three = (index: number): string => String(index).padStart(3, '0')
const range = (count: number): readonly number[] => Array.from({ length: count }, (_, index) => index + 1)
const ITEM_FIELDS = range(10).flatMap((index) => ITEM_COLUMNS.map((column) => `EFXP_${column}_${two(index)}`))
const REFERENCE_FIELDS = range(3).flatMap((index) =>
  REFERENCE_COLUMNS.map((column) => `EFXP_${column}_${three(index)}`),
)

// The 243 fields the portal's script posts to the folio step, in its order.
const GENERATE_FIELDS: readonly string[] = [
  'INDICA_PRIMERA_EJECUCION',
  'ES_BORR',
  'EHDR_CODIGO',
  'AGENTE_RETENEDOR',
  'PTES_ESTADO',
  'TIPO_PLANTILLA',
  'MNT_TOTAL_ORI',
  'PTDC_CODIGO',
  'EFXP_FMA_PAGO',
  ...['FCH_PAGO', 'MNT_PAGO', 'GLOSA_PAGOS'].flatMap((column) =>
    range(3).map((index) => `EFXP_${column}_${three(index)}`),
  ),
  ...[
    'FCH_VENC',
    'IND_VENTA',
    'RZN_SOC',
    'GIRO_EMIS',
    'ACTECO',
    'CDG_SII_SUCUR',
    'DIR_ORIGEN',
    'CMNA_ORIGEN',
    'CIUDAD_ORIGEN',
    'TIPOVENTA_SELECT',
    'TIPOCOMPRA_SELECT',
    'DOC_REF_RAIZ',
    'COMUNA_ROL_ORIGEN',
    'MAN_ROL_ORIGEN',
    'PRED_ROL_ORIGEN',
    'SIST_REF_GEO',
    'LAT_ORIG_MADERA',
    'LONG_ORIG_MADERA',
    'COD_PLAN_CONAF',
  ].map((name) => `EFXP_${name}`),
  'UBIC_MADERA_SI_NO',
  ...[
    'EMAIL_EMISOR',
    'FONO_EMISOR',
    'RUT_RECEP',
    'DV_RECEP',
    'FCH_EMIS',
    'RZN_SOC_RECEP',
    'GIRO_RECEP',
    'DIR_RECEP',
    'CIUDAD_RECEP',
    'CMNA_RECEP',
    'CONTACTO',
    'RUT_SOLICITA',
    'DV_SOLICITA',
  ].map((name) => `EFXP_${name}`),
  ...ITEM_FIELDS,
  ...['SUBTOTAL', 'PCT_DESC', 'MNT_DESC', 'MNT_NETO', 'TASA_IVA', 'IVA', 'MNT_TOTAL', 'OTRO_IMP_TOTAL'].map(
    (name) => `EFXP_${name}`,
  ),
  ...REFERENCE_FIELDS,
  'EMP_MENOR_TAMANO',
  ...range(10).map((index) => `EDL_PRC_EXE_${two(index)}`),
  ...range(10).map((index) => `EDL_TPO_DOC_LIQ_${two(index)}`),
  ...['MNT_NET_TRAN', 'MNT_EXE_TRAN', 'TASA_IVA_TRAN', 'IVA_TRAN', 'SUBTOTAL_TRAN'].map((name) => `EDL_${name}`),
  ...range(3).flatMap((index) =>
    ['TIP_MOV', 'GLOSA', 'ITM_EXENTO', 'VAL'].map((column) => `EDL_COM_${column}_${two(index)}`),
  ),
  ...['MNT_NET_COM', 'MNT_EXE_COM', 'TASA_IVA_COM', 'IVA_COM', 'SUBTOTAL_COM'].map((name) => `EDL_${name}`),
  'EFXP_CRED_EC',
  'esCRED_EC',
  'esFACT_TUR',
  'EFXP_TPO_DOC_TURISTA',
  'EFXP_NUM_ID',
  'EFXP_NACIONALIDAD',
  ...[
    'PAIS_DEST',
    'TPO_MON',
    'PTO_EMBAR',
    'PTO_DESEM',
    'TOT_BOLT',
    'MOD_VTA',
    'TPO_EXPO',
    'PTO_EMBAR_TXT',
    'PTO_DESEM_TXT',
    'TAX_ID',
    'TPO_CAMBIO',
  ].map((name) => `EDFE_${name}`),
  ...['RUT_TRANSPORTE', 'DV_TRANSPORTE', 'PATENTE', 'RUT_CHOFER', 'DV_CHOFER', 'NOMBRE_CHOFER'].map(
    (name) => `EFXP_${name}`,
  ),
]
const GENERATE_SET: ReadonlySet<string> = new Set(GENERATE_FIELDS)

// The 54 fields the "Validar y visualizar" button of the invoice posts, in its order.
const PREVIEW_FIELDS: readonly string[] = [
  'CANT_DET',
  'DESCRIP_01',
  'EFXP_ACTECO',
  'EFXP_ACTECO_SELECT',
  'EFXP_CDG_SII_SUCUR',
  'EFXP_CIUDAD_ORIGEN',
  'EFXP_CIUDAD_RECEP',
  'EFXP_CMNA_ORIGEN',
  'EFXP_CMNA_RECEP',
  'EFXP_CONTACTO',
  'EFXP_DIR_ORIGEN',
  'EFXP_DIR_ORIGEN_DEFUALT',
  'EFXP_DIR_RECEP',
  'EFXP_DIR_RECEP_DEFUALT',
  'EFXP_DSC_ITEM_01',
  'EFXP_DV_CHOFER',
  'EFXP_DV_RECEP',
  'EFXP_DV_SOLICITA',
  'EFXP_DV_TRANSPORTE',
  'EFXP_EMAIL_EMISOR',
  'EFXP_FCH_EMIS',
  'EFXP_FMA_PAGO',
  'EFXP_FONO_EMISOR',
  'EFXP_GIRO_EMIS',
  'EFXP_GIRO_RECEP',
  'EFXP_GIRO_RECEP_DEFUALT',
  'EFXP_MNT_DESC',
  'EFXP_MNT_NETO',
  'EFXP_MNT_TOTAL',
  'EFXP_NMB_01',
  'EFXP_NOMBRE_CHOFER',
  'EFXP_PATENTE',
  'EFXP_PCTD_01',
  'EFXP_PCT_DESC',
  'EFXP_PRC_01',
  'EFXP_QTY_01',
  'EFXP_RUT_CHOFER',
  'EFXP_RUT_RECEP',
  'EFXP_RUT_SOLICITA',
  'EFXP_RUT_TRANSPORTE',
  'EFXP_RZN_SOC',
  'EFXP_RZN_SOC_RECEP',
  'EFXP_SUBTOTAL',
  'EFXP_SUBT_01',
  'EFXP_TIPOCOMPRA_SELECT',
  'EFXP_TIPOVENTA_SELECT',
  'EFXP_UNMD_01',
  'EHDR_CODIGO',
  'ES_BORR',
  'IVA_TEMP',
  'MNT_NETO_TEMP',
  'PTDC_CODIGO',
  'esCRED_EC',
  'esFACT_TUR',
]

// Inputs the pages carry that their script never posts: they are no change of the form.
const HELPER_FIELDS: ReadonlySet<string> = new Set([
  'CANT_DET',
  'COD_SI_NO',
  'REF_SI_NO',
  'PAGO_SI_NO',
  'IVA_TEMP',
  'MNT_NETO_TEMP',
  'btnSign',
  'btnVolver',
  'btnCorregir',
])
const NOTE_BUTTONS: ReadonlySet<string> = new Set(['btnSign', 'btnVolver'])
// What the page's script writes into the signing form, so the copies the page carries do not go.
const SIGNING_FIELDS: ReadonlySet<string> = new Set([
  'btnSign',
  'btnVolver',
  'txtSignText',
  'nombre',
  'clave',
  'nodo',
  'nodoId',
  'nameSpace',
])

/**
 * EN: The receiver of a document issued through the SII's free invoicing system.
 * ES: El receptor de un documento emitido por el sistema de facturación gratuito del SII.
 */
export type FreeSystemReceiver = {
  /** EN: Receiver RUT. ES: `EFXP_RUT_RECEP` + `EFXP_DV_RECEP` — RUT del receptor. */
  readonly rut: string
  /** EN: Legal or business name. ES: `EFXP_RZN_SOC_RECEP` — Razón social del receptor. */
  readonly businessName: string
  /** EN: Line of business. ES: `EFXP_GIRO_RECEP` — Giro del receptor. */
  readonly businessActivity: string
  /** EN: Street address. ES: `EFXP_DIR_RECEP` — Dirección del receptor. */
  readonly address: string
  /** EN: Commune. ES: `EFXP_CMNA_RECEP` — Comuna del receptor. */
  readonly commune: string
  /** EN: City. ES: `EFXP_CIUDAD_RECEP` — Ciudad del receptor. */
  readonly city: string
}

/**
 * EN: The one line of a document issued through the SII's free invoicing system.
 * ES: La única línea de un documento emitido por el sistema de facturación gratuito del SII.
 */
export type FreeSystemItem = {
  /** EN: Item name. ES: `EFXP_NMB_01` — Nombre del ítem. */
  readonly name: string
  /** EN: Unit price in whole pesos. ES: `EFXP_PRC_01` — Precio unitario en pesos enteros. */
  readonly unitPrice: number
  /** EN: Whole quantity; 1 by default. ES: `EFXP_QTY_01` — Cantidad entera; 1 por defecto. */
  readonly quantity?: number
  /** EN: Description. ES: `EFXP_DSC_ITEM_01` — Descripción del ítem. */
  readonly description?: string
}

/**
 * EN: The exempt invoice (34) a credit note annuls, as the portal lists it.
 * ES: La factura exenta (34) que anula una nota de crédito, tal como la lista el portal.
 */
export type FreeSystemAnnulledDocument = {
  /** EN: The SII's id of the document in the portal, the number of its links and of its PDF. ES: `EHDR_CODIGO` — Id del documento en el portal, el número de sus enlaces y de su PDF (`DHDR_CODIGO`). */
  readonly documentId: string
  /** EN: Its type: only 34. ES: `EFXP_TPO_DOC_REF_001` — Su tipo: solo 34. */
  readonly type: 34
  /** EN: Its folio. ES: `EFXP_FOLIO_REF_001` — Su folio. */
  readonly folio: number
  /** EN: Its issue date, `YYYY-MM-DD`. ES: `EFXP_FCH_REF_001` — Su fecha de emisión, `AAAA-MM-DD`. */
  readonly issueDate: string
}

/**
 * EN: A document for the SII's free invoicing system: an exempt invoice (34), or a credit note (61) that annuls one.
 * ES: Un documento para el sistema de facturación gratuito del SII: una factura exenta (34), o una nota de crédito (61)
 * que anula una.
 */
export type FreeSystemDocumentInput = {
  /** EN: 34, an exempt invoice like the company's last one, or 61, a credit note that annuls `annuls`. ES: `PTDC_CODIGO` — 34, una factura exenta igual a la última de la empresa, o 61, una nota de crédito que anula `annuls`. */
  readonly type: 34 | 61
  /** EN: Who receives it. ES: El receptor. */
  readonly receiver: FreeSystemReceiver
  /** EN: Exactly one line. ES: Exactamente una línea. */
  readonly items: readonly FreeSystemItem[]
  /** EN: Issue date, `YYYY-MM-DD`; today in Chile by default. ES: `EFXP_FCH_EMIS` — Fecha de emisión, `AAAA-MM-DD`; por defecto hoy en Chile. */
  readonly issueDate?: string
  /** EN: The invoice a credit note annuls; required on a 61 and refused on a 34. ES: La factura que anula una nota de crédito; obligatoria en una 61 y rechazada en una 34. */
  readonly annuls?: FreeSystemAnnulledDocument
  /** EN: Company RUT; the client's by default. ES: `RUT_EMP` — RUT de la empresa; por defecto el del cliente. */
  readonly companyRut?: string
}

/**
 * EN: What `unstable_issueFreeSystemDocument` takes: the document, the explicit flag and the second secret.
 * ES: Lo que recibe `unstable_issueFreeSystemDocument`: el documento, la marca explícita y el segundo secreto.
 */
export type FreeSystemIssueInput = FreeSystemDocumentInput & {
  /** EN: Must be `true` on every call: the run issues a real tax document and spends a real folio in production. ES: Debe ser `true` en cada llamada: la corrida emite un documento tributario real y gasta un folio real en producción. */
  readonly issueRealDocument: true
  /** EN: Gives the password of the certificate the SII keeps for the taxpayer, asked for once, at the signing step, and kept nowhere; it is not the tax password. ES: `clave` — Entrega la clave del certificado que el SII guarda para el contribuyente, pedida una vez, en el paso de firma, y guardada en ninguna parte; no es la clave tributaria. */
  readonly centralSignaturePassword: () => string | Promise<string>
}

/**
 * EN: What the SII would issue, read from its own preview, with nothing spent.
 * ES: Lo que emitiría el SII, leído de su propia vista previa, sin gastar nada.
 */
export type FreeSystemPreview = {
  /** EN: Document type. ES: `PTDC_CODIGO` — Tipo de documento. */
  readonly type: 34 | 61
  /** EN: Company RUT. ES: `RUT_EMP` — RUT de la empresa. */
  readonly companyRut: SiiRut
  /** EN: The fields of the SII's preview page, the first value of a repeated name. ES: Los campos de la página de vista previa del SII, el primer valor de un nombre repetido. */
  readonly fields: Readonly<Record<string, string>>
  /** EN: The fields an issue would post to the step that assigns the folio, in order. ES: Los campos que una emisión enviaría al paso que asigna el folio, en orden. */
  readonly issueFields: readonly FormField[]
  /** EN: Fields of the invoice's preview that dte-sdk does not know; with any, an issue is refused before the folio. ES: Campos de la vista previa de la factura que dte-sdk no conoce; con alguno, una emisión se rechaza antes del folio. */
  readonly unknownFields: readonly string[]
}

/**
 * EN: A document the SII's free invoicing system said it signed and sent.
 * ES: Un documento que el sistema de facturación gratuito del SII dijo haber firmado y enviado.
 */
export type FreeSystemIssued = {
  /** EN: Document type. ES: `PTDC_CODIGO` — Tipo de documento. */
  readonly type: 34 | 61
  /** EN: Folio the SII assigned. ES: `Folio` — Folio que asignó el SII. */
  readonly folio: number
  /** EN: The SII's id of the document in the portal, or null when the page confirmed without it. ES: `DHDR_CODIGO` — Id del documento en el portal, o null si la página confirmó sin darlo. */
  readonly documentId: string | null
  /** EN: The document as the SII signed it. ES: `txtSignText` — El documento tal como lo firmó el SII. */
  readonly signedXml: string
}

type Document = {
  readonly type: 34 | 61
  readonly company: SiiRut
  readonly receiver: SiiRut
  readonly text: FreeSystemReceiver
  readonly item: {
    readonly name: string
    readonly quantity: number
    readonly unitPrice: number
    readonly description: string
  }
  readonly total: number
  readonly issueDate: string
  readonly annuls: FreeSystemAnnulledDocument | null
}

type Prepared = {
  readonly fields: Readonly<Record<string, string>>
  readonly issueFields: readonly FormField[]
  readonly unknownFields: readonly string[]
  readonly referer: string
}

const isWhole = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0

const assertText = (value: unknown, field: string, optional = false): string => {
  if (optional && value === undefined) return ''
  if (typeof value !== 'string' || (!optional && value.trim() === '')) throw new DteError('MISSING_FIELD', { field })
  try {
    encodeLatin1(value)
  } catch (error) {
    throw new DteError('ENCODING_UNSUPPORTED_CHAR', { field, ...(error as DteError).details })
  }
  return value
}

const assertDate = (value: string, field: string): string => {
  if (!isIsoDate(value)) throw new DteError('INVALID_DATE', { field })
  return value
}

const assertAnnulled = (annuls: FreeSystemAnnulledDocument): FreeSystemAnnulledDocument => {
  if (typeof annuls.documentId !== 'string' || !/^\d+$/.test(annuls.documentId))
    throw new DteError('INVALID_OPTION', { field: 'annuls.documentId' })
  if (annuls.type !== 34) throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'annuls.type' })
  if (!isWhole(annuls.folio)) throw new DteError('INVALID_OPTION', { field: 'annuls.folio' })
  assertDate(annuls.issueDate, 'annuls.issueDate')
  return annuls
}

// Everything the caller gives is checked before the first request: a document the chain was not seen to complete, or a
// value it could not post, is refused here.
const documentOf = (portal: PortalClient, input: FreeSystemDocumentInput): Document => {
  if (portal.environment !== 'production') throw new DteError('INVALID_OPTION', { field: 'environment' })
  if (input.type !== 34 && input.type !== 61) throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type' })
  if (input.type === 61 && input.annuls === undefined) throw new DteError('MISSING_FIELD', { field: 'annuls' })
  if (input.type === 34 && input.annuls !== undefined) throw new DteError('INVALID_OPTION', { field: 'annuls' })
  if (!Array.isArray(input.items) || input.items.length !== 1) throw new DteError('INVALID_OPTION', { field: 'items' })
  const [line] = input.items as readonly FreeSystemItem[]
  const quantity = line.quantity ?? 1
  if (!isWhole(line.unitPrice)) throw new DteError('INVALID_OPTION', { field: 'items.unitPrice' })
  if (!isWhole(quantity) || !Number.isSafeInteger(quantity * line.unitPrice))
    throw new DteError('INVALID_OPTION', { field: 'items.quantity' })
  const { receiver } = input
  if (typeof receiver !== 'object' || receiver === null) throw new DteError('MISSING_FIELD', { field: 'receiver' })
  return {
    type: input.type,
    company: resolvePortalCompany(portal, input.companyRut),
    receiver: toSiiRut(receiver.rut, 'receiver.rut'),
    text: {
      rut: receiver.rut,
      businessName: assertText(receiver.businessName, 'receiver.businessName'),
      businessActivity: assertText(receiver.businessActivity, 'receiver.businessActivity'),
      address: assertText(receiver.address, 'receiver.address'),
      commune: assertText(receiver.commune, 'receiver.commune'),
      city: assertText(receiver.city, 'receiver.city'),
    },
    item: {
      name: assertText(line.name, 'items.name'),
      quantity,
      unitPrice: line.unitPrice,
      description: assertText(line.description, 'items.description', true),
    },
    total: quantity * line.unitPrice,
    issueDate: assertDate(input.issueDate ?? chileDate(portal.now()), 'issueDate'),
    annuls: input.annuls === undefined ? null : assertAnnulled(input.annuls),
  }
}

// `application/x-www-form-urlencoded` of the bytes of each value in the page's charset: letters, digits and `_.-~` as
// they are, a space as `+`, everything else as `%XX`, as the form bodies the chain completed with were written.
const encodeForm = (fields: readonly FormField[], charset: 'latin1' | 'utf8'): Uint8Array => {
  const part = (text: string): string =>
    [...(charset === 'latin1' ? encodeLatin1(text) : encodeUtf8(text))]
      .map((byte) => {
        if (byte === 0x20) return '+'
        const char = String.fromCharCode(byte)
        return /[A-Za-z0-9_.~-]/.test(char) ? char : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
      })
      .join('')
  return encodeLatin1(fields.map(([name, value]) => `${part(name)}=${part(value)}`).join('&'))
}

const mustAuthenticate = (html: string): boolean => asksForAuthentication(html) || looksLikeLoginRedirect(html)

const blocked = (context: PortalContext, step: string, page: PortalPage): DteError =>
  new DteError('SII_PORTAL_BLOCKED', {
    operation: context.operation,
    step,
    httpStatus: page.status,
    portalMessage: portalMessageOf(page.html),
  })

// A page of a step before the folio: the firewall's page blocks, a login page means the session expired, a page that
// alerts is the portal's refusal, and any other page that is not the one expected cannot be read.
const expectPage = (
  context: PortalContext,
  step: string,
  page: PortalPage,
  good: (html: string) => boolean,
): PortalPage => {
  if (isFirewallRejection(page.html)) throw blocked(context, step, page)
  if (page.status === 200 && good(page.html)) return page
  if (!mustAuthenticate(page.html) && alertMessages(page.html).length > 0)
    throw rejected(context, 'freeSystemRefused', {
      step,
      portalMessage: portalMessageOf(page.html),
      siiCode: siiCodeOf(page.html),
    })
  throw wrongPage(context, step, page.html)
}

const hasFields =
  (...names: readonly string[]) =>
  (html: string): boolean => {
    const values = firstValues(formFields(html))
    return names.every((name) => Object.prototype.hasOwnProperty.call(values, name))
  }

// The session as the backup gets it, then the issuing menu and the company, chosen with its RUT whole: the portal's
// firewall refused the RUT without its verifier.
const chooseCompany = async (context: PortalContext, company: SiiRut): Promise<void> => {
  await ensurePage(context, 'session', cgiUrl('certification', 'ad_empresa1'))
  for (const [step, url] of [
    ['mipeLaunchPage', `${BASE}/mipeLaunchPage.cgi?${ISSUING_MENU}`],
    ['mipeSelEmpresa.form', SELECTOR_URL],
  ] as const)
    expectPage(context, step, await navigate(context, step, 'GET', url), () => true)
  const chosen = await navigate(context, 'mipeSelEmpresa', 'POST', `${BASE}/mipeSelEmpresa.cgi`, {
    form: { DESDE_DONDE_URL: ISSUING_MENU, RUT_EMP: company },
    referer: SELECTOR_URL,
  })
  expectPage(context, 'mipeSelEmpresa', chosen, (html) => !mustAuthenticate(html) && alertMessages(html).length === 0)
}

const receiverFields = (document: Document, address: string): Readonly<Record<string, string>> => {
  const { body, verifier } = splitSiiRut(document.receiver)
  return {
    EFXP_FCH_EMIS: document.issueDate,
    EFXP_RUT_RECEP: body,
    EFXP_DV_RECEP: verifier,
    EFXP_RZN_SOC_RECEP: document.text.businessName,
    EFXP_GIRO_RECEP: document.text.businessActivity,
    EFXP_DIR_RECEP: address,
    EFXP_CIUDAD_RECEP: document.text.city,
    EFXP_CMNA_RECEP: document.text.commune,
  }
}

const lineFields = (document: Document): Readonly<Record<string, string>> => ({
  EFXP_NMB_01: document.item.name,
  EFXP_QTY_01: String(document.item.quantity),
  EFXP_PRC_01: String(document.item.unitPrice),
  EFXP_SUBT_01: String(document.total),
  EFXP_DSC_ITEM_01: document.item.description,
})

// The five amounts always move together: an item that disagrees with its totals got the SII's repair HED-2-220.
const totalFields = (document: Document): Readonly<Record<string, string>> => ({
  EFXP_SUBTOTAL: String(document.total),
  EFXP_MNT_NETO: String(document.total),
  EFXP_MNT_TOTAL: String(document.total),
})

const cleared = (names: readonly string[]): Readonly<Record<string, string>> =>
  Object.fromEntries(names.map((name) => [name, '']))

// A value the page carries wins over the default, as the page's script leaves it.
const asThePageHasIt = (
  page: Readonly<Record<string, string>>,
  defaults: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(defaults).map(([name, value]) => [
      name,
      Object.prototype.hasOwnProperty.call(page, name) ? page[name] : value,
    ]),
  )

const pick = (values: Readonly<Record<string, string>>, name: string, fallback = ''): string =>
  Object.prototype.hasOwnProperty.call(values, name) ? values[name] : fallback

// The invoice: the form "same as the last one", its "Validar y visualizar", which the portal needs before it generates a
// document, and the 243 fields of the preview with the caller's document over them.
const prepareInvoice = async (context: PortalContext, document: Document): Promise<Prepared> => {
  const formPage = expectPage(
    context,
    'mipeGenFacEx',
    await navigate(context, 'mipeGenFacEx', 'GET', INVOICE_FORM_URL, { referer: `${BASE}/mipeSelEmpresa.cgi` }),
    hasFields('EFXP_RZN_SOC'),
  )
  const form = firstValues(formFields(formPage.html))
  const total = String(document.total)
  const ours: Readonly<Record<string, string>> = {
    ...receiverFields(document, `${document.text.address.trimEnd()}    `),
    ...lineFields(document),
    ...totalFields(document),
    CANT_DET: '1',
    DESCRIP_01: 'DESCRIP_01',
    EHDR_CODIGO: '',
    ES_BORR: 'FALSE',
    PTDC_CODIGO: '34',
    esCRED_EC: 'FALSE',
    esFACT_TUR: 'FALSE',
    EFXP_ACTECO_SELECT: pick(form, 'EFXP_ACTECO'),
    EFXP_TIPOCOMPRA_SELECT: '1',
    EFXP_TIPOVENTA_SELECT: '1',
    EFXP_FMA_PAGO: '1',
    EFXP_GIRO_RECEP_DEFUALT: document.text.businessActivity,
    // The page's script copies the address of its helper field and leaves four spaces after it.
    EFXP_DIR_ORIGEN: `${(pick(form, 'EFXP_DIR_ORIGEN') || pick(form, 'EFXP_DIR_ORIGEN_DEFUALT')).trimEnd()}    `,
    EFXP_DIR_RECEP_DEFUALT: document.text.address,
    EFXP_CONTACTO: '',
    EFXP_UNMD_01: '',
    EFXP_PCTD_01: '',
    EFXP_PCT_DESC: '0',
    EFXP_MNT_DESC: '0',
    IVA_TEMP: '',
    MNT_NETO_TEMP: total,
  }
  const validation = PREVIEW_FIELDS.map((name): FormField => [name, pick(ours, name, pick(form, name))])
  const preview = expectPage(
    context,
    'mipeDisplayPreView',
    await portalRequest(context, 'mipeDisplayPreView', 'POST', PREVIEW_URL, {
      encodedForm: encodeForm(validation, 'latin1'),
      referer: INVOICE_FORM_URL,
    }),
    (html) => html.includes('PreViewDTE'),
  )
  const fields = firstValues(formFields(preview.html))
  const values: Readonly<Record<string, string>> = {
    ...asThePageHasIt(fields, { INDICA_PRIMERA_EJECUCION: '1', ES_BORR: 'FALSE' }),
    PTDC_CODIGO: '34',
    EFXP_FMA_PAGO: '1',
    ...receiverFields(document, document.text.address),
    ...cleared(ITEM_FIELDS),
    ...cleared(REFERENCE_FIELDS),
    EFXP_PCT_DESC: '0',
    EFXP_MNT_DESC: '0',
    ...lineFields(document),
    ...totalFields(document),
  }
  return {
    fields,
    issueFields: GENERATE_FIELDS.map((name): FormField => [name, pick(values, name, pick(fields, name))]),
    unknownFields: Object.keys(fields)
      .filter((name) => !GENERATE_SET.has(name) && !HELPER_FIELDS.has(name) && !name.endsWith('_DEFUALT'))
      .sort(),
    referer: PREVIEW_URL,
  }
}

// The credit note: the portal builds it from the invoice; its fields go in the page's order with the caller's document
// over them, and the fields of the 243 the page lacks go after them.
const prepareAnnulment = async (
  context: PortalContext,
  document: Document,
  annuls: FreeSystemAnnulledDocument,
): Promise<Prepared> => {
  const url = `${PREVIEW_URL}?EHDR_CODIGO=${annuls.documentId}&TIPO_NOTA=61`
  const note = expectPage(
    context,
    'mipeDisplayPreView',
    await navigate(context, 'mipeDisplayPreView', 'GET', url, {
      referer: `${BASE}/mipeGesDocEmi.cgi?CODIGO=${annuls.documentId}`,
    }),
    hasFields('btnSign', 'EFXP_RZN_SOC'),
  )
  const fields = firstValues(formFields(note.html))
  const pageTotal = pick(fields, 'EFXP_MNT_TOTAL')
  // A note that does not take back the invoice's whole total got the SII's repair REF-2-780.
  if (/^\d+$/.test(pageTotal) && Number(pageTotal) !== document.total)
    throw new DteError('INVALID_OPTION', { field: 'items', pageTotal: Number(pageTotal), total: document.total })
  const values: Readonly<Record<string, string>> = {
    ...asThePageHasIt(fields, { INDICA_PRIMERA_EJECUCION: '1', ES_BORR: 'FALSE', EFXP_FMA_PAGO: '' }),
    PTDC_CODIGO: '61',
    ...receiverFields(document, document.text.address),
    ...cleared(ITEM_FIELDS),
    ...lineFields(document),
    ...totalFields(document),
    EFXP_TPO_DOC_REF_001: '34',
    EFXP_FOLIO_REF_001: String(annuls.folio),
    EFXP_FCH_REF_001: annuls.issueDate,
    EFXP_CODIGO_REF_001: '1',
    EFXP_RAZON_REF_001: ANNULMENT_REASON,
  }
  const names = [
    ...Object.keys(fields).filter((name) => !NOTE_BUTTONS.has(name)),
    ...GENERATE_FIELDS.filter((name) => !Object.prototype.hasOwnProperty.call(fields, name)),
  ]
  return {
    fields,
    issueFields: names.map((name): FormField => [name, pick(values, name, pick(fields, name))]),
    unknownFields: [],
    referer: url,
  }
}

const prepare = async (context: PortalContext, document: Document): Promise<Prepared> => {
  await chooseCompany(context, document.company)
  return document.annuls === null
    ? prepareInvoice(context, document)
    : prepareAnnulment(context, document, document.annuls)
}

/**
 * EN: **Unstable**, and **production only**: the SII's free invoicing system exists nowhere else. This call has not been
 * run by dte-sdk against the SII; its tests answer with pages written by hand from the described markup, so they prove
 * the requests dte-sdk sends, not that the SII accepts them.
 *
 * Goes as far as the SII's own "Validar y visualizar" of an exempt invoice (34), or the credit note (61) the portal builds
 * to annul one, and returns what the SII would issue. It spends nothing: the folio is assigned at the next step, which
 * this call never requests. It opens a real session, which counts toward the SII's limit of sessions per RUT.
 * ES: **Inestable**, y **solo producción**: el sistema de facturación gratuito del SII no existe en otro ambiente. dte-sdk
 * no ha corrido esta llamada contra el SII; sus tests responden con páginas escritas a mano a partir del marcado descrito,
 * así que prueban las peticiones que envía dte-sdk, no que el SII las acepte.
 *
 * Llega hasta el "Validar y visualizar" del propio SII de una factura exenta (34), o hasta la nota de crédito (61) que el
 * portal arma para anular una, y devuelve lo que emitiría el SII. No gasta nada: el folio se asigna en el paso siguiente,
 * que esta llamada nunca pide. Abre una sesión real, que cuenta para el límite de sesiones por RUT del SII.
 * @param portal EN: a production client, with a certificate or a tax password. ES: un cliente de producción, con certificado o clave tributaria.
 * @param input EN: the document. ES: el documento.
 * @param overrides EN: per-call overrides. ES: ajustes de la llamada.
 * @returns EN: the SII's preview and the fields an issue would post. ES: la vista previa del SII y los campos que enviaría una emisión.
 * @throws {DteError} EN: `INVALID_DOCUMENT_TYPE`, `INVALID_OPTION`, `MISSING_FIELD`, `INVALID_RUT`, `INVALID_DATE` or `ENCODING_UNSUPPORTED_CHAR` before any request; `SII_PORTAL_BLOCKED`, `SII_PORTAL_REJECTED` with `freeSystemRefused`, `SII_PORTAL_UNEXPECTED_PAGE`, session and transport codes. ES: los mismos códigos.
 */
export const unstable_previewFreeSystemDocument = async (
  portal: PortalClient,
  input: FreeSystemDocumentInput,
  overrides?: CallOverrides,
): Promise<FreeSystemPreview> => {
  const document = documentOf(portal, input)
  return withPortalSession(portal, 'unstable_previewFreeSystemDocument', overrides, async (context) => {
    const { fields, issueFields, unknownFields } = await prepare(context, document)
    return { type: document.type, companyRut: document.company, fields, issueFields, unknownFields }
  })
}

type Known = { folio: number | null; documentId: string | null; signedXml: string | null }

// Thrown inside the steps from the folio on, with why; the catch turns it into the one error those steps throw.
class Stop extends Error {
  constructor(
    readonly reason: string,
    readonly httpStatus: number | null = null,
  ) {
    super(reason)
  }
}

const uncertain = (
  context: PortalContext,
  step: string,
  known: Known,
  error: unknown,
  secret: string | null,
): DteError => {
  const cause = error instanceof Stop ? null : isDteError(error) ? error.code : 'UNKNOWN'
  const reason = error instanceof Stop ? error.reason : cause === 'SII_PORTAL_BLOCKED' ? 'blocked' : 'failed'
  const details: Record<string, unknown> = {
    step,
    reason,
    folio: known.folio,
    documentId: known.documentId,
    ...(cause === null ? {} : { cause }),
    ...(error instanceof Stop && error.httpStatus !== null ? { httpStatus: error.httpStatus } : {}),
    ...(known.signedXml === null ? {} : { signedXml: known.signedXml }),
  }
  context.portal.logger.warn('sii portal free system stopped after the folio step', {
    operation: context.operation,
    step,
    reason,
    folio: known.folio,
  })
  const scrubbed = Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key,
      secret !== null && typeof value === 'string' && value.includes(secret) ? '[redacted]' : value,
    ]),
  )
  return rejected(context, 'freeSystemIssueUncertain', scrubbed)
}

const askPassword = async (give: () => string | Promise<string>): Promise<string> => {
  const password = await give()
  if (typeof password !== 'string' || password === '') throw new Stop('passwordMissing')
  return password
}

// The XML the central signature receives for a note: `&` escaped once more and the mark before `<Documento`, as the
// page's script sends it. An invoice goes as the page gives it.
const signatureData = (type: 34 | 61, xml: string): string =>
  type === 34 ? xml : xml.replace(/&/g, '&amp;').replace('<Documento ', `${CENTRAL_SIGNATURE_MARK}\n<Documento `)

const crlf = (text: string): string => text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')

// The last post is the whole signing form, a repeated name repeated, with what the page's script adds, sorted by name in
// code-unit order, and its two documents with the line ends a textarea posts.
const sendFields = (
  form: { readonly fields: readonly FormField[] },
  signedXml: string,
  password: string,
): readonly FormField[] => {
  const page = firstValues(form.fields)
  const kept = form.fields.filter(([name]) => !SIGNING_FIELDS.has(name))
  const stamped: readonly FormField[] = kept.some(([name, value]) => name === 'TMST_SIGN' && value !== '')
    ? kept
    : [...kept.filter(([name]) => name !== 'TMST_SIGN'), ['TMST_SIGN', signingTimeOf(signedXml) ?? '']]
  return [
    ...stamped,
    ['txtSignText', signedXml] as const,
    ['nombre', pick(page, 'nombre') || '1'] as const,
    ['clave', password] as const,
    ['nodo', pick(page, 'nodo') || 'dte:DTE'] as const,
    ['nodoId', pick(page, 'nodoId') || 'dte:Documento'] as const,
    ['nameSpace', pick(page, 'nameSpace') || SII_NAMESPACE] as const,
  ]
    .map(([name, value]): FormField => [name, name === 'txtPlainText' || name === 'txtSignText' ? crlf(value) : value])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

const assertNoFirewall = (page: PortalPage): void => {
  if (isFirewallRejection(page.html)) throw new Stop('blocked', page.status)
}

// From the folio on: one request per step, no retry, nothing repeated. Every failure is the same error, which says a folio
// may have been spent and carries what is known of it.
const issuePrepared = async (
  context: PortalContext,
  document: Document,
  prepared: Prepared,
  give: () => string | Promise<string>,
): Promise<FreeSystemIssued> => {
  const once: PortalContext = { ...context, overrides: { ...context.overrides, retry: false } }
  const signer = sessionRut(context.state.cookies) ?? context.portal.passwordSignIn?.rut ?? null
  if (signer === null) throw new DteError('MISSING_FIELD', { field: 'sessionRut' })
  const generateBody = encodeForm(prepared.issueFields, 'latin1')
  const known: Known = { folio: null, documentId: null, signedXml: null }
  let step = 'mipeGenXMLFirma'
  let secret: string | null = null
  try {
    const generated = await portalRequest(once, step, 'POST', GENERATE_URL, {
      encodedForm: generateBody,
      referer: prepared.referer,
    })
    assertNoFirewall(generated)
    const form = signForm(generated.html)
    const plain = form === null ? '' : pick(firstValues(form.fields), 'txtPlainText')
    known.folio = folioOf(plain)
    if (generated.status !== 200 || form === null || !plain.includes('<DTE') || known.folio === null)
      throw new Stop('noDocument', generated.status)
    step = 'postFirmaDigital'
    const password = await askPassword(give)
    secret = password
    context.state.cookies = { ...context.state.cookies, usa_firma_central: 'true' }
    const { body, verifier } = splitSiiRut(signer)
    const signed = await portalRequest(once, step, 'POST', SIGN_URL, {
      encodedForm: encodeForm(
        [
          ['nombre', '1'],
          ['dato', signatureData(document.type, plain)],
          ['rut', body],
          ['dv', verifier],
          ['clave', password],
          ['nodo', 'dte:DTE'],
          ['nodoId', 'dte:Documento'],
          ['nameSpace', SII_NAMESPACE],
        ],
        'utf8',
      ),
      referer: GENERATE_URL,
      // What the page's script sets on its own request to the signature.
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'text/plain, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
    })
    assertNoFirewall(signed)
    if (isSignatureRefused(signed.html)) throw new Stop('signatureRefused', signed.status)
    known.signedXml = signed.status === 200 ? signedDocumentOf(signed.html) : null
    if (known.signedXml === null) throw new Stop('noSignature', signed.status)
    step = 'mipeSendXML'
    const action = new URL(form.action || 'mipeSendXML.cgi', GENERATE_URL)
    // The password goes in this post: never to a host that is not the portal's.
    if (action.protocol !== 'https:' || action.hostname !== new URL(BASE).hostname) throw new Stop('foreignAction')
    const sent = await portalRequest(once, step, 'POST', action.toString(), {
      encodedForm: encodeForm(sendFields(form, known.signedXml, password), 'latin1'),
      referer: GENERATE_URL,
    })
    assertNoFirewall(sent)
    const outcome = sendOutcome(sent.html, sent.headers['location'] ?? '')
    known.documentId = outcome.documentId
    if ((sent.status !== 200 && sent.status !== 302) || !outcome.confirmed) throw new Stop('notConfirmed', sent.status)
    return { type: document.type, folio: known.folio, documentId: outcome.documentId, signedXml: known.signedXml }
  } catch (error) {
    throw uncertain(context, step, known, error, secret)
  }
}

/**
 * EN: **Unstable**, and **production only**: every complete run issues a real tax document of a real company and spends
 * a real folio. dte-sdk has not run this call against the SII; its tests answer with pages written by hand from the
 * described markup, so they prove the requests dte-sdk sends, not that the SII accepts them.
 *
 * Issues an exempt invoice (34), "same as the last one" of the company, or the credit note (61) that annuls one, through
 * the SII's free invoicing system, in which the SII assigns the folio, holds the CAF and signs with the certificate it
 * keeps for the taxpayer. Those are the only chains seen to complete against the SII, each with one line; any other
 * type, a second line or a note that does more than annul is refused before any request. `issueRealDocument: true` is
 * demanded on every call, and without it nothing is requested.
 *
 * It runs the preview of `unstable_previewFreeSystemDocument` and then the step that assigns the folio, the central
 * signature and the post that sends the document. From the folio step on, each request is made once, with no retry, and
 * nothing is repeated: any failure there throws `SII_PORTAL_REJECTED` with `freeSystemIssueUncertain`, naming the step
 * and carrying the folio and the signed XML when they are known, because a folio may have been spent. Look for the
 * document among the portal's issued documents before issuing again. `centralSignaturePassword` is asked for once, at
 * the signing step, and is kept nowhere; neither it nor the tax password reaches an error, the logger or the capture port.
 * ES: **Inestable**, y **solo producción**: cada corrida completa emite un documento tributario real de una empresa real y
 * gasta un folio real. dte-sdk no ha corrido esta llamada contra el SII; sus tests responden con páginas escritas a mano a
 * partir del marcado descrito, así que prueban las peticiones que envía dte-sdk, no que el SII las acepte.
 *
 * Emite una factura exenta (34), "igual a la última" de la empresa, o la nota de crédito (61) que anula una, por el
 * sistema de facturación gratuito del SII, en que el SII asigna el folio, guarda el CAF y firma con el certificado que
 * guarda para el contribuyente. Son las únicas cadenas que se vieron completar contra el SII, cada una con una línea;
 * cualquier otro tipo, una segunda línea o una nota que haga algo más que anular se rechaza antes de cualquier petición.
 * Se exige `issueRealDocument: true` en cada llamada, y sin él no se pide nada.
 *
 * Corre la vista previa de `unstable_previewFreeSystemDocument` y luego el paso que asigna el folio, la firma central y
 * el envío del documento. Desde el paso del folio, cada petición se hace una vez, sin reintento, y nada se repite:
 * cualquier falla ahí lanza `SII_PORTAL_REJECTED` con `freeSystemIssueUncertain`, con el paso y con el folio y el XML
 * firmado cuando se conocen, porque pudo gastarse un folio. Busca el documento entre los emitidos del portal antes de
 * volver a emitir. `centralSignaturePassword` se pide una vez, en el paso de firma, y no se guarda; ni ella ni la clave
 * tributaria llegan a un error, al logger ni al puerto de captura.
 * @param portal EN: a production client, with a certificate or a tax password. ES: un cliente de producción, con certificado o clave tributaria.
 * @param input EN: the document, `issueRealDocument: true` and the password of the central signature. ES: el documento, `issueRealDocument: true` y la clave de la firma central.
 * @param overrides EN: per-call overrides; `retry` reaches only the steps before the folio. ES: ajustes de la llamada; `retry` solo alcanza a los pasos previos al folio.
 * @returns EN: the folio, the SII's id of the document and the signed XML. ES: el folio, el id del documento en el SII y el XML firmado.
 * @throws {DteError} EN: `INVALID_OPTION { field: 'issueRealDocument' }` and the input codes of the preview before any request; before the folio, the codes of the preview and `SII_PORTAL_REJECTED` with `freeSystemFormChanged`; from the folio on, only `SII_PORTAL_REJECTED` with `freeSystemIssueUncertain`. ES: `INVALID_OPTION { field: 'issueRealDocument' }` y los códigos de entrada de la vista previa antes de cualquier petición; antes del folio, los códigos de la vista previa y `SII_PORTAL_REJECTED` con `freeSystemFormChanged`; desde el folio, solo `SII_PORTAL_REJECTED` con `freeSystemIssueUncertain`.
 */
export const unstable_issueFreeSystemDocument = async (
  portal: PortalClient,
  input: FreeSystemIssueInput,
  overrides?: CallOverrides,
): Promise<FreeSystemIssued> => {
  if (input.issueRealDocument !== true) throw new DteError('INVALID_OPTION', { field: 'issueRealDocument' })
  if (typeof input.centralSignaturePassword !== 'function')
    throw new DteError('MISSING_FIELD', { field: 'centralSignaturePassword' })
  const document = documentOf(portal, input)
  return withPortalSession(portal, 'unstable_issueFreeSystemDocument', overrides, async (context) => {
    const prepared = await prepare(context, document)
    if (prepared.unknownFields.length > 0)
      throw rejected(context, 'freeSystemFormChanged', { unknownFields: prepared.unknownFields })
    portal.logger.warn('sii portal issuing a real document through the free system', {
      operation: context.operation,
      type: document.type,
    })
    return issuePrepared(context, document, prepared, input.centralSignaturePassword)
  })
}
