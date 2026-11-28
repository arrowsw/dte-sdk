import {
  CHILEAN_PESO,
  EXEMPT_INDICATORS,
  EXPORT_SERVICE_INDICATORS,
  FINAL_CONSUMER_RUT,
  FOREIGN_RECEIVER_RUT,
  isCurrency,
  SERVICE_INDICATORS,
  TRANSFER_TYPES,
  VAT_RATE,
  WITHHOLDING_TAX_CODES,
  type ExemptIndicator,
} from '../catalogs/codes'
import {
  carriesDepositGuarantee,
  isDocumentType,
  isExemptType,
  isExport,
  isReceipt,
  type DocumentType,
} from '../catalogs/document-types'
import { DteError } from '../errors'
import type {
  CommissionLine,
  CommissionLineInput,
  Customs,
  CustomsInput,
  Document,
  DocumentInput,
  DocumentWarning,
  GlobalAdjustment,
  GlobalAdjustmentInput,
  HeaderOptions,
  Issuer,
  IssuerInput,
  LineItem,
  LineItemInput,
  OtherCurrency,
  PackageType,
  Receiver,
  ReceiverInput,
  ReceiptReference,
  ReceiptReferenceInput,
  Reference,
  ReferenceInput,
  SubtotalInfo,
  Totals,
  Transport,
  TransportInput,
} from '../model/document'
import { toSiiRut } from '../model/rut'
import { assertMaxLength, sanitizeText } from '../text/sanitize'
import { chileDate, toIsoDate } from '../time/chile'
import { calculateLineAmount, calculateTotals, commissionVat } from '../totals/calculate'
import { calculateExportLineAmount, convertToPesos, roundHalfAwayFromZero } from '../totals/export'
import { assertExportTotals, assertTotals, totalsWarnings } from './content-rules'

/**
 * EN: `xs:maxLength` of the SII schema per element; `createDocument` enforces them on sanitized text.
 * ES: `xs:maxLength` del esquema del SII por elemento; `createDocument` los exige sobre el texto ya sanitizado.
 */
export const FIELD_LIMITS = {
  RznSoc: 100,
  GiroEmis: 80,
  DirOrigen: 70,
  CmnaOrigen: 20,
  CiudadOrigen: 20,
  Sucursal: 20,
  CdgVendedor: 60,
  RznSocRecep: 100,
  GiroRecep: 40,
  Contacto: 80,
  CorreoRecep: 80,
  DirRecep: 70,
  CmnaRecep: 20,
  CiudadRecep: 20,
  DirPostal: 70,
  CmnaPostal: 20,
  CiudadPostal: 20,
  CdgIntRecep: 20,
  NmbItem: 80,
  DscItem: 1000,
  UnmdItem: 4,
  UnmdRef: 4,
  TpoDocLiq: 3,
  RazonRef: 90,
  CodRef: 18,
  TpoDocRef: 3,
  FolioRef: 18,
  GlosaDR: 45,
  Glosa: 60,
  GlosaSTI: 40,
  Patente: 8,
  PatenteCarro: 8,
  NombreChofer: 30,
  DirDest: 70,
  CmnaDest: 20,
  CiudadDest: 20,
  CodAdicSucur: 20,
  IdAdicEmisor: 20,
  NumId: 20,
  Nacionalidad: 3,
  IdAdicRecep: 20,
  IdAdicOtr: 20,
  NombreTransp: 40,
  NomCiaTransp: 40,
  IdAdicTransp: 20,
  Booking: 20,
  Operador: 20,
  IdAdicPtoEmb: 20,
  IdAdicPtoDesemb: 20,
  Marcas: 255,
  IdContainer: 25,
  Sello: 20,
  EmisorSello: 70,
} as const

type LimitedField = keyof typeof FIELD_LIMITS

// `CdgSIISucur` is a positive integer of at most nine digits, and `Acteco` of at most six.
const MAX_SII_BRANCH_CODE = 999_999_999
const MAX_ACTIVITY_CODE = 999_999
// `maxOccurs` of the SII schemas: the detail lines, 60 in each root of `DTE_v10.xsd` and 1,000 in
// `EnvioBOLETA_v11.xsd`, the commission lines of any document, and the payment installments (`MntPagos`, "hasta 30
// repeticiones" in Formato DTE 2.5).
const MAX_LINES = 60
const MAX_RECEIPT_LINES = 1000
const MAX_COMMISSIONS = 20
// `DscRcgGlobal` repeats up to 20 times in `DTE_v10.xsd` and in `EnvioBOLETA_v11.xsd`.
const MAX_GLOBAL_ADJUSTMENTS = 20
const MAX_PAYMENTS = 30
// `Referencia` repeats up to 40 times under `Documento`, `Liquidacion` and `Exportaciones` in `DTE_v10.xsd`, and under
// a receipt's `Documento` in `EnvioBOLETA_v11.xsd`.
const MAX_REFERENCES = 40

// The `IdDoc` fields that `Documento` declares and `Liquidacion`, the root of a settlement invoice, does not.
const NOT_IN_SETTLEMENT = [
  'noDebitReduction',
  'dispatchType',
  'transferType',
  'printFormat',
  'exportPaymentTerms',
] as const

// `EnvioBOLETA_v11.xsd`, the schema of a receipt, declares five of the options of `IdDoc`, and not five fields of the
// totals and four of a line that the invoice's shape has. The codec leaves out of a receipt what its schema does not
// declare, so those are refused here instead of being dropped without a word.
const RECEIPT_OPTIONS = ['serviceIndicator', 'netAmountsIndicator', 'billingPeriod', 'dueDate', 'paymentMedium']
const NOT_IN_RECEIPT_TOTALS = ['vatRate', 'ownVatAmount', 'thirdPartyVatAmount', 'withholdings', 'commissions'] as const
const NOT_IN_RECEIPT_LINE = [
  'referenceQuantity',
  'referenceUnit',
  'referencePrice',
  'additionalTaxCodes',
  'withholdingAgent',
] as const
// A receipt's `IndExe` is 1, 2 or 6, and its `IndMntNeto` is 2.
const RECEIPT_EXEMPT_INDICATORS: readonly unknown[] = [undefined, 1, 2, 6]

// What `Exportaciones`, the root of an export document, does not declare and `Documento` does: six of the options of
// `IdDoc`, every total but the exempt amount and the total, four fields of the transport and two of a line.
const NOT_IN_EXPORT_OPTIONS = [
  'noDebitReduction',
  'transferType',
  'printFormat',
  'grossAmounts',
  'purchaseTransactionType',
  'saleTransactionType',
] as const
const NOT_IN_EXPORT_TOTALS = [
  'netAmount',
  'vatRate',
  'vatAmount',
  'ownVatAmount',
  'thirdPartyVatAmount',
  'withholdings',
  'commissions',
  'nonBillableAmount',
  'periodAmount',
  'previousBalance',
  'amountDue',
] as const
const NOT_IN_EXPORT_TRANSPORT = ['trailerLicensePlate', 'departureDate', 'departureTime', 'arrivalDate'] as const
const NOT_IN_EXPORT_LINE = ['withholdingAgent', 'additionalTaxCodes'] as const
const EXPORT_SERVICES: readonly unknown[] = Object.values(EXPORT_SERVICE_INDICATORS)
// `maxOccurs` of `TipoBultos`.
const MAX_PACKAGE_TYPES = 10
// Formato DTE 2.5: on an export invoice the quantity and unit of each line (fields 15 and 21 of the detail) and the
// sale modality, clause and clause total (fields 74 to 76 of the header) are required unless the service indicator is
// 3, 4 or 5, and the transport route (field 77) unless it is 4.
const SERVICES_WITHOUT_SALE: readonly unknown[] = [3, 4, 5]
const SERVICES_WITHOUT_ROUTE: readonly unknown[] = [4]
// `FmaPagExp` 21, an export without payment, makes the total zero (Formato DTE 2.5, field 124).
const WITHOUT_PAYMENT = 21
// `FmaPagExp` 32, the payment in advance of the shipment, which the customs table of payment terms abbreviates
// `ANTICIPO`: an export invoice that names it carries its settlement date (Formato DTE 2.5, field 15 of the header,
// "Campo Obligatorio para Factura de exportación cuando en Forma de Pago Exportación se indique anticipo").
const ADVANCE_PAYMENT = 32
// The package types of the customs table that are a container (73 to 76, and 78): the marks identify a package
// "cuando es distinto de contenedor" (Formato DTE 2.5, field 98), so any other package of an export invoice has them.
const CONTAINER_PACKAGES: readonly unknown[] = [73, 74, 75, 76, 78]

/**
 * EN: Options of `createDocument`.
 * ES: Opciones de `createDocument`.
 */
export type CreateDocumentOptions = {
  /** EN: Clock for the default issue date (tests). ES: Reloj para la fecha de emisión por defecto (tests). */
  readonly now?: Date
}

/**
 * EN: What `createDocumentWith` waives. Internal.
 * ES: Lo que `createDocumentWith` exime. Interno.
 */
export type CreateDocumentWaivers = {
  /** EN: Build a credit or a debit note that references no document: the simulation of the certification run issues one, as field behaviour does, when the case it refers to is not among its documents. ES: `Referencia` — Construir una nota de crédito o de débito que no refiere ningún documento: la simulación de la corrida de certificación emite una, como el comportamiento de campo, cuando el caso al que se refiere no está entre sus documentos. */
  readonly unreferencedNote?: boolean
}

// Sanitizes a text field, enforces its schema limit and returns undefined for empty optionals.
const text = (value: string | undefined, field: LimitedField): string | undefined => {
  if (value === undefined) return undefined
  const clean = sanitizeText(value, field)
  if (clean === '') return undefined
  assertMaxLength(clean, FIELD_LIMITS[field], field)
  return clean
}

const requiredText = (value: string | undefined, field: LimitedField, path: string): string => {
  const clean = text(value, field)
  if (clean === undefined) throw new DteError('MISSING_FIELD', { field: path })
  return clean
}

const finiteNumber = (value: number | undefined, path: string): number | undefined => {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new DteError('INVALID_AMOUNT', { field: path })
  return value
}

// The decimal types of the SII schema, as digits before the point and decimals after it: `Dec12_6Type` (`QtyItem`,
// `PrcItem`, `QtyRef`, `PrcRef`), `PctType` (`DescuentoPct`, `RecargoPct`, `TasaComision`) and `Dec16_2Type`
// (`ValorDR`). A number with more decimals fails the schema, and with it the whole envelope.
// On an export document, also `Dec14_4Type` (`MntFlete`, `MntSeguro`), `Dec6_4Type` (`TpoCambio`) and the
// `PesoBruto` and `PesoNeto` of `Aduana`, ten digits of which two are decimals.
const DECIMAL_TYPES = {
  quantity: { digits: 12, decimals: 6 },
  percent: { digits: 3, decimals: 2 },
  value: { digits: 16, decimals: 2 },
  amount: { digits: 14, decimals: 4 },
  rate: { digits: 6, decimals: 4 },
  weight: { digits: 8, decimals: 2 },
} as const

// Rounds a number to the decimals its type holds, half away from zero over its decimal digits as the amounts of a
// line are rounded, so what plain arithmetic gives (0.1 + 0.2) is written as the schema admits it and a percent of
// 1.005 is written 1.01, the percent the line's amounts are worked out with; a number that does not fit the digits is
// refused.
const rounded = (value: number, type: keyof typeof DECIMAL_TYPES, path: string): number => {
  const { digits, decimals } = DECIMAL_TYPES[type]
  const limit = 10 ** digits
  if (typeof value !== 'number' || !(Math.abs(value) < limit)) throw new DteError('INVALID_AMOUNT', { field: path })
  const fitted = roundHalfAwayFromZero(value, decimals)
  if (Math.abs(fitted) >= limit) throw new DteError('INVALID_AMOUNT', { field: path })
  return fitted
}

const decimal = (value: number | undefined, type: keyof typeof DECIMAL_TYPES, path: string): number | undefined =>
  value === undefined ? undefined : rounded(value, type, path)

// `FchSalida` and `FchLlegada` restrict the schema's `FechaType` to start on 2003-04-01.
const MIN_TRANSPORT_DATE = '2003-04-01'
const MAX_TRANSPORT_DATE = '2050-12-31'

const transportDate = (value: string | undefined, field: string): string | undefined => {
  if (value === undefined) return undefined
  const iso = toIsoDate(value, field)
  if (iso < MIN_TRANSPORT_DATE || iso > MAX_TRANSPORT_DATE) throw new DteError('INVALID_DATE', { field })
  return iso
}

// `HraSalida` is an `xs:time` from 00:00:00 to 23:59:59; a time without seconds is written with `:00`.
const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

const transportTime = (value: string | undefined, field: string): string | undefined => {
  if (value === undefined) return undefined
  const raw = String(value).trim()
  const match = TIME.exec(raw)
  if (match === null) throw new DteError('INVALID_TIME', { field })
  return match[2] === undefined ? `${raw}:00` : raw
}

const compact = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T

const refuse = (field: string): never => {
  throw new DteError('INVALID_OPTION', { field })
}

// Whether the caller gave a value that would be written: an empty list writes nothing.
const given = (value: unknown): boolean => value !== undefined && !(Array.isArray(value) && value.length === 0)

// An amount above zero of a decimal type, as written: freight, insurance, an exchange rate, a sale clause total, and a
// line's quantity, price, reference quantity and reference price.
const positive = (value: number | undefined, type: keyof typeof DECIMAL_TYPES, path: string): number | undefined => {
  const fitted = decimal(value, type, path)
  if (fitted !== undefined && !(fitted > 0)) throw new DteError('INVALID_AMOUNT', { field: path })
  return fitted
}

// A `positiveInteger` of the schema with at most `digits` digits: a code of a customs table or a count.
const whole = (value: number | undefined, digits: number, path: string): number | undefined => {
  if (value !== undefined && !(Number.isSafeInteger(value) && value >= 1 && value < 10 ** digits))
    throw new DteError('INVALID_OPTION', { field: path })
  return value
}

// An amount of `Exportaciones` is a decimal from zero up to 99999999999999.9999, with four decimals. One that is given
// is taken as the number says it; one worked out with more digits than a number holds is refused by the arithmetic.
const MAX_EXPORT_AMOUNT = 1e14

// `Liquidacion` declares less than `Documento`: no transport, no global or line discounts and surcharges, no `RUTOtr`
// in a reference, no `MontoNF`. Each of these would be written under it and fail the schema.
const assertSettlement = (input: DocumentInput): void => {
  if ((input.globalAdjustments ?? []).length > 0) refuse('globalAdjustments')
  if (input.transport !== undefined) refuse('transport')
  input.items.forEach((item, index) => {
    if (item.discountPercent !== undefined) refuse(`items[${index}].discountPercent`)
    if (item.surchargePercent !== undefined) refuse(`items[${index}].surchargePercent`)
    if (item.withholdingAgent !== undefined) refuse(`items[${index}].withholdingAgent`)
  })
  ;(input.references ?? []).forEach((reference, index) => {
    if (reference.otherRut !== undefined) refuse(`references[${index}].otherRut`)
  })
  for (const option of NOT_IN_SETTLEMENT) if (input.options?.[option] !== undefined) refuse(`options.${option}`)
  if (input.totals?.nonBillableAmount !== undefined) refuse('totals.nonBillableAmount')
}

// A receipt has a schema of its own, which declares no transport, no commissions, no withholding, and much less of
// `IdDoc`, of the totals and of a line than the invoice's. Its issuer and receiver are another matter: what the codec
// does not write of them on a receipt, as the branch name or the activity code, which a receipt has no element for,
// is left out, so the same issuer serves an invoice and a receipt.
const assertReceipt = (input: DocumentInput): void => {
  if (input.transport !== undefined) refuse('transport')
  if (given(input.commissions)) refuse('commissions')
  if (input.withholdVat) refuse('withholdVat')
  const { options, totals } = input
  for (const [option, value] of Object.entries(options ?? {}))
    if (!RECEIPT_OPTIONS.includes(option) && given(value)) refuse(`options.${option}`)
  if (![undefined, 2].includes(options?.netAmountsIndicator)) refuse('options.netAmountsIndicator')
  for (const total of NOT_IN_RECEIPT_TOTALS) if (given(totals?.[total])) refuse(`totals.${total}`)
  input.items.forEach((item, index) => {
    for (const field of NOT_IN_RECEIPT_LINE) if (given(item[field])) refuse(`items[${index}].${field}`)
    if (!RECEIPT_EXEMPT_INDICATORS.includes(item.exemptIndicator)) refuse(`items[${index}].exemptIndicator`)
  })
}

// `Exportaciones` declares less than `Documento` in `IdDoc`, the totals, the transport and a line, and nothing of the
// commissions or of a withholding; its service indicator is 3 to 6, and its global adjustments apply to the exempt
// amount, the only one it has, so each one says so (`IndExeDR` 1; Formato DTE 2.5, section D). Its `FmaPagExp` is a
// code of one or two digits.
const assertExport = (input: DocumentInput): void => {
  const { options, totals, transport } = input
  if (input.pricesIncludeVat) refuse('pricesIncludeVat')
  if (input.withholdVat) refuse('withholdVat')
  if (given(input.commissions)) refuse('commissions')
  for (const option of NOT_IN_EXPORT_OPTIONS) if (options?.[option] !== undefined) refuse(`options.${option}`)
  if (options?.serviceIndicator !== undefined && !EXPORT_SERVICES.includes(options.serviceIndicator))
    refuse('options.serviceIndicator')
  const terms = options?.exportPaymentTerms
  if (terms !== undefined && !(/^\d{1,2}$/.test(terms) && Number(terms) > 0)) refuse('options.exportPaymentTerms')
  if (input.type === 110 && Number(terms) === ADVANCE_PAYMENT && options?.settlementDate === undefined)
    throw new DteError('MISSING_FIELD', { field: 'options.settlementDate' })
  for (const total of NOT_IN_EXPORT_TOTALS) if (given(totals?.[total])) refuse(`totals.${total}`)
  for (const field of NOT_IN_EXPORT_TRANSPORT) if (transport?.[field] !== undefined) refuse(`transport.${field}`)
  input.items.forEach((item, index) => {
    for (const field of NOT_IN_EXPORT_LINE) if (given(item[field])) refuse(`items[${index}].${field}`)
  })
  ;(input.globalAdjustments ?? []).forEach((adjustment, index) => {
    if (adjustment.exemptIndicator !== 1) refuse(`globalAdjustments[${index}].exemptIndicator`)
  })
  if (input.currency === undefined) throw new DteError('MISSING_FIELD', { field: 'currency' })
  if (!isCurrency(input.currency)) refuse('currency')
  // Formato DTE 2.5, field 28: on an export document a payment terms code needs its description.
  if (options?.paymentTermsCode !== undefined && options.paymentTermsNote === undefined)
    throw new DteError('MISSING_FIELD', { field: 'options.paymentTermsNote' })
}

// What only `Exportaciones` declares, and the service indicators only it admits, are refused on any other type.
const assertNotExport = (input: DocumentInput): void => {
  if (input.currency !== undefined) refuse('currency')
  if (input.exchangeRate !== undefined) refuse('exchangeRate')
  if (input.issuer.additionalBranchCode !== undefined) refuse('issuer.additionalBranchCode')
  if (input.issuer.additionalId !== undefined) refuse('issuer.additionalId')
  if (input.receiver?.foreign !== undefined) refuse('receiver.foreign')
  if (input.transport?.customs !== undefined) refuse('transport.customs')
  ;(input.references ?? []).forEach((reference, index) => {
    if (reference.otherAdditionalId !== undefined) refuse(`references[${index}].otherAdditionalId`)
  })
  const service = input.options?.serviceIndicator
  if (service !== undefined && !(Object.values(SERVICE_INDICATORS) as readonly unknown[]).includes(service))
    refuse('options.serviceIndicator')
}

// The schemas admit `IndExe` 1 to 6 and no other value; `null` is not one of them, as a receipt's check already held.
// Formato DTE 2.5 gives `GrntDep`, the deposit guarantee for containers (field 120), to a 33, 34, 56 and 61 alone, and
// marks it 0, "no debe ir", on every other type. Its `IndExe` row admits the indicator on the other types too, without
// limiting the value 3 by type (on a settlement invoice "Sólo en caso de Liquidación-Factura que tenga ítems no
// facturables"). So on a dispatch guide (52) and a purchase invoice (46) a line with `IndExe` 3 keeps its amount and is
// in no total, as one with 4 or 5 is, and a given guarantee has no element to be written in. On a settlement invoice
// (43) and an export document this library refuses the value 3, though the format admits it there: that is a choice
// of dte-sdk, not a rule of the format. A receipt's own check refuses it before this one.
const EXEMPT_INDICATOR_VALUES: readonly unknown[] = [undefined, ...Object.values(EXEMPT_INDICATORS)]

const assertExemptIndicators = ({ type, items, totals }: DocumentInput): void => {
  const guarantee = totals?.depositGuarantee
  const refused: readonly unknown[] = type === 43 || isExport(type) ? [EXEMPT_INDICATORS.containerDeposit] : []
  items.forEach(({ exemptIndicator }, index) => {
    if (!EXEMPT_INDICATOR_VALUES.includes(exemptIndicator) || refused.includes(exemptIndicator))
      refuse(`items[${index}].exemptIndicator`)
  })
  // A guarantee of zero is none, as `calculateTotals` leaves it out. Anything else given is refused, a value that is
  // not a number too, since the checks of an export document's totals do not look at this one.
  if (guarantee !== undefined && guarantee !== 0 && !carriesDepositGuarantee(type)) refuse('totals.depositGuarantee')
}

// Formato DTE 2.5, field 118: `IVANoRet` is the VAT less the VAT withheld by product, "sólo en facturas de compra en
// que hay retención de IVA por el emisor y notas de crédito o débito que referencian facturas de compra", and "no se
// registra si es igual a 0". `DTE_v10.xsd` declares it in `Documento` alone, a whole number from one up.
const CARRIES_VAT_NOT_WITHHELD: readonly DocumentType[] = [46, 56, 61]

// Formato DTE 2.5, fields 113 and 114: a company that sells on behalf of a principal may split the VAT in its own and
// the third parties', each within the VAT ("< que IVA"). On a settlement invoice the own VAT is the VAT of the
// commissions and the rest is the third parties'. No VAT, or a commissions' VAT outside zero to the VAT, has no split.
const withVatSplit = (totals: Totals): Totals => {
  const vat = totals.vatAmount ?? 0
  const own = totals.commissions?.vatValue ?? 0
  return vat > 0 && own >= 0 && own <= vat ? { ...totals, ownVatAmount: own, thirdPartyVatAmount: vat - own } : totals
}

const assertVatNotWithheld = ({ type, totals }: DocumentInput): void => {
  const amount = totals?.vatNotWithheld
  if (amount === undefined || amount === 0) return
  if (!CARRIES_VAT_NOT_WITHHELD.includes(type)) refuse('totals.vatNotWithheld')
  if (!(Number.isInteger(amount) && amount > 0))
    throw new DteError('INVALID_AMOUNT', { field: 'totals.vatNotWithheld' })
}

// Formato DTE 2.5, field 7: `IndTraslado` is required on a dispatch guide (code 1), whose transfer is a sale (1) or
// another of the reasons the schema admits, 2 to 9.
const assertTransferType = (type: DocumentType, transferType: number | undefined): void => {
  if (type === 52 && transferType === undefined) throw new DteError('MISSING_FIELD', { field: 'options.transferType' })
  // The schema admits `IndTraslado` 1 to 9; the three types Res. Ex. 144/2026 names wait for a code it admits.
  if (transferType !== undefined && !(Object.values(TRANSFER_TYPES) as readonly number[]).includes(transferType))
    refuse('options.transferType')
}

const siiBranchCode = (value: number | undefined): number | undefined => {
  if (value !== undefined && !(Number.isSafeInteger(value) && value > 0 && value <= MAX_SII_BRANCH_CODE))
    throw new DteError('INVALID_OPTION', { field: 'issuer.siiBranchCode' })
  return value
}

// Every root of `DTE_v10.xsd` asks the issuer for one to four `Acteco` (Formato DTE 2.5, field 37). A receipt has no
// element for it, and the codec leaves out of a receipt whatever it brings.
const activityCode = (value: number | undefined, receipt: boolean): number | undefined => {
  if (receipt) return value
  if (value === undefined) throw new DteError('MISSING_FIELD', { field: 'issuer.activityCode' })
  if (!(Number.isSafeInteger(value) && value > 0 && value <= MAX_ACTIVITY_CODE))
    throw new DteError('INVALID_OPTION', { field: 'issuer.activityCode' })
  return value
}

const normalizeIssuer = (input: IssuerInput, receipt: boolean): Issuer => {
  const commune = requiredText(input.commune, 'CmnaOrigen', 'issuer.commune')
  return compact({
    rut: toSiiRut(input.rut, 'issuer.rut'),
    businessName: requiredText(input.businessName, 'RznSoc', 'issuer.businessName'),
    businessActivity: requiredText(input.businessActivity, 'GiroEmis', 'issuer.businessActivity'),
    activityCode: activityCode(input.activityCode, receipt),
    phone: input.phone,
    email: input.email,
    branch: text(input.branch, 'Sucursal'),
    siiBranchCode: siiBranchCode(input.siiBranchCode),
    address: requiredText(input.address, 'DirOrigen', 'issuer.address'),
    commune,
    city: text(input.city, 'CiudadOrigen') ?? commune,
    salespersonCode: text(input.salespersonCode, 'CdgVendedor'),
    additionalBranchCode: text(input.additionalBranchCode, 'CodAdicSucur'),
    additionalId: text(input.additionalId, 'IdAdicEmisor'),
  })
}

const FINAL_CONSUMER: Receiver = {
  rut: toSiiRut(FINAL_CONSUMER_RUT),
  businessName: 'Consumidor Final',
  address: 'Sin Direccion',
  commune: 'Santiago',
}

// The foreign receiver of an export document, left out when it brings nothing.
const normalizeForeign = (input: ReceiverInput['foreign']): Receiver['foreign'] => {
  if (input === undefined) return undefined
  const foreign = compact({
    id: text(input.id, 'NumId'),
    nationality: text(input.nationality, 'Nacionalidad'),
    additionalId: text(input.additionalId, 'IdAdicRecep'),
  })
  return Object.keys(foreign).length > 0 ? foreign : undefined
}

const normalizeReceiver = (input: ReceiverInput | undefined, type: DocumentType): Receiver => {
  const receipt = isReceipt(type)
  const exported = isExport(type)
  if (input === undefined) {
    if (receipt) return FINAL_CONSUMER
    throw new DteError('MISSING_FIELD', { field: 'receiver' })
  }
  const rut = toSiiRut(input.rut, 'receiver.rut')
  // Formato DTE 2.5, field 50: the receiver of an export document is 55.555.555-5.
  if (exported && rut !== FOREIGN_RECEIVER_RUT) refuse('receiver.rut')
  const address = text(input.address, 'DirRecep')
  const commune = text(input.commune, 'CmnaRecep')
  const city = text(input.city, 'CiudadRecep')
  if (!receipt && address === undefined) throw new DteError('MISSING_FIELD', { field: 'receiver.address' })
  // The receiver of an export document is abroad: no commune is asked of it (Formato DTE 2.5, field 61), and an export
  // invoice asks for its city (field 62).
  if (!receipt && !exported && commune === undefined) throw new DteError('MISSING_FIELD', { field: 'receiver.commune' })
  if (type === 110 && city === undefined) throw new DteError('MISSING_FIELD', { field: 'receiver.city' })
  return compact({
    rut,
    internalCode: text(input.internalCode, 'CdgIntRecep'),
    businessName: requiredText(input.businessName, 'RznSocRecep', 'receiver.businessName'),
    foreign: normalizeForeign(input.foreign),
    // `Liquidacion` asks the receiver for `GiroRecep`; `Documento` leaves it optional.
    businessActivity:
      type === 43
        ? requiredText(input.businessActivity, 'GiroRecep', 'receiver.businessActivity')
        : text(input.businessActivity, 'GiroRecep'),
    contact: text(input.contact, 'Contacto'),
    email: input.email,
    address,
    commune,
    city,
    postalAddress: text(input.postalAddress, 'DirPostal'),
    postalCommune: text(input.postalCommune, 'CmnaPostal'),
    postalCity: text(input.postalCity, 'CiudadPostal'),
  })
}

// `MntBaseFaena`, `MntMargComer` and `PrcConsFinal` are of the schema's `MontoType`: whole, from zero up.
const WITHHOLDING_AGENT_FIELDS = ['slaughterBase', 'marginBase', 'finalConsumerPrice'] as const

const withholdingAgentOf = (input: LineItemInput['withholdingAgent'], path: string): LineItem['withholdingAgent'] => {
  if (input === undefined) return undefined
  for (const field of WITHHOLDING_AGENT_FIELDS) {
    const value = input[field]
    if (value !== undefined && !(Number.isSafeInteger(value) && value >= 0))
      throw new DteError('INVALID_AMOUNT', { field: `${path}.withholdingAgent.${field}` })
  }
  return compact({
    slaughterBase: input.slaughterBase,
    marginBase: input.marginBase,
    finalConsumerPrice: input.finalConsumerPrice,
  })
}

type LineParts = {
  quantity?: number
  unitPrice?: number
  discountPercent?: number
  surchargePercent?: number
  wholeShares?: boolean
}
type LineShares = { readonly discountAmount: number; readonly surchargeAmount: number }

// What the document says of the amounts of its lines (Formato DTE 2.5, field 38 of the detail): `zero` when every line
// is written with an amount of zero, as on a credit note that corrects a text, and `zeroAdmitted` when a line with a
// price may be given an amount of zero, as on a dispatch guide that is not a sale. `counted` when an export invoice of
// goods asks each line for its quantity and its unit.
type LineContext = { readonly counted: boolean; readonly zero: boolean; readonly zeroAdmitted: boolean }

// `IndExe` 4, an item that is not a sale, and 5, an item a guide that is not a sale takes off an earlier one.
const ZERO_LINE_INDICATORS: readonly (ExemptIndicator | undefined)[] = [
  EXEMPT_INDICATORS.notASale,
  EXEMPT_INDICATORS.deduction,
]

// `CodRef` 2: the note corrects a text of the document it references.
const CORRECTS_TEXT = 2

// The `CodRef` row of Formato DTE 2.5: a credit note that cancels the document it references (`CodRef` 1) or corrects
// a text of it (2), and a debit note that cancels a credit note (1), "DEBEN TENER UN ÚNICO DOCUMENTO DE REFERENCIA".
// The reference of a certification set, `SET`, names no document and is not counted.
const SINGLE_REFERENCE_CODES: Partial<Record<DocumentType, readonly unknown[]>> = {
  56: [1],
  61: [1, CORRECTS_TEXT],
  111: [1],
  112: [1, CORRECTS_TEXT],
}

// Formato DTE 2.5, "OBLIGATORIEDAD DE LA ZONA SEGÚN TIPO DE DOCUMENTO": the zone "Información Referencia" is code 1,
// "Dato obligatorio. El dato debe estar en el documento siempre", on a credit note and a debit note, national and of
// export, the types of the table above. The schema leaves `Referencia` optional, as one root serves every type.
const assertNoteReferences = (type: DocumentType, references: readonly ReferenceInput[], waived: boolean): void => {
  const note = SINGLE_REFERENCE_CODES[type]
  const codes = note ?? []
  const documents = references.flatMap((reference, index) => (reference.documentType === 'SET' ? [] : [index]))
  if (note !== undefined && !waived && documents.length === 0)
    throw new DteError('MISSING_FIELD', { field: 'references' })
  const single = documents.find((index) => codes.includes(references[index].code))
  const other = documents.find((index) => index !== single)
  if (single !== undefined && other !== undefined) refuse(`references[${other}]`)
}

// `QtyItem`, `PrcItem`, `QtyRef` and `PrcRef` are each a `Dec12_6Type` of `SiiTypes_v10.xsd` in every root, and a
// receipt's `QtyItem` and `PrcItem` a `Dec5Type` of `EnvioBOLETA_v11.xsd` with the same limits; both start at 0.000001:
// a quantity, a reference quantity or a reference price at or below zero, or above zero and brought to zero by its six
// decimals, would fail the schema and is refused. Formato DTE 2.5 lets a transfer
// that is not a sale leave the unit price out (field 22 of the detail): a price of zero is no price and is left out, so
// the line is written as one without a price, and one below zero is refused as the others are.
const linePrice = (value: number | undefined, path: string): number | undefined =>
  value === 0 ? undefined : positive(value, 'quantity', path)

// `EnvioBOLETA_v11.xsd` restricts a receipt's `DescuentoPct` and `RecargoPct` to 100.00 at most.
const MAX_RECEIPT_PERCENT = 100

// A line percent is a `PctType`, which starts at 0.01 in `SiiTypes_v10.xsd`: a percent of zero is no discount or
// surcharge and is left out, and a negative one is refused, as is one above zero that its two decimals bring to zero,
// a percent asked for with no share of the line. `DTE_v10.xsd` takes one up to 999.99, and a receipt up to 100.
const linePercent = (value: number | undefined, path: string, receipt: boolean): number | undefined => {
  const percent = decimal(value, 'percent', path)
  if (percent === undefined || value === 0) return undefined
  if (percent <= 0 || (receipt && percent > MAX_RECEIPT_PERCENT)) throw new DteError('INVALID_AMOUNT', { field: path })
  return percent
}

// A discount or a surcharge in percent goes with its amount (Formato DTE 2.5, fields 30 and 34 of the detail), and
// `DTE_v10.xsd` takes that amount as a whole number from one up (`MntImpType`): a percent whose share of the line
// rounds to none would be written alone, a small percent of a cheap line. The receipts schema takes an amount of
// zero, and a receipt follows the same rule all the same, so a line is written one way whatever its type. On an export
// document the same fields leave the amount optional, and the share has the four decimals of the line's amount: only a
// share those four decimals bring to none is refused, a percent that changes nothing.
const assertSharesWritten = (parts: LineParts, shares: LineShares, path: string): void => {
  for (const [percent, share, field] of [
    [parts.discountPercent, shares.discountAmount, 'discountPercent'],
    [parts.surchargePercent, shares.surchargeAmount, 'surchargePercent'],
  ] as const)
    if (percent !== undefined && share === 0) throw new DteError('INVALID_AMOUNT', { field: `${path}.${field}` })
}

// Formato DTE 2.5, field 38 of the detail: `MontoItem` is "(Precio Unitario * Cantidad) – Monto Descuento + Monto
// Recargo", so a line with a price is written with the amount they give, and a given amount that is another one would
// sit beside a price, a discount and a surcharge it does not add up with. The same field admits a zero on a dispatch
// guide that is not a sale: there a zero is taken on a line that brings no percent, since the discount or the
// surcharge of a line written as zero would add up with nothing.
const assertAmountAddsUp = (
  parts: LineParts,
  given: number | undefined,
  expected: number,
  path: string,
  zeroAdmitted: boolean,
): void => {
  if (parts.unitPrice === undefined || given === undefined || given === expected) return
  if (zeroAdmitted && given === 0 && parts.discountPercent === undefined && parts.surchargePercent === undefined) return
  throw new DteError('TOTAL_MISMATCH', { field: `${path}.amount`, expected, actual: given })
}

// Formato DTE 2.5, field 38 of the detail: `MontoItem` "debe ser cero" on a line that is not a sale (`IndExe` 4 or 5)
// and on a credit note that corrects a text, whatever its price. Such a line is written with an amount of zero, a
// given amount that is not zero is refused with the zero it must be, and a percent is refused, since its discount or
// its surcharge would add up with nothing. An export line's given amount is compared as it is written, with four
// decimals.
const zeroLine = (
  input: LineItemInput,
  path: string,
  parts: LineParts,
  type: DocumentType,
): { readonly amount: number } & LineShares => {
  for (const [percent, field] of [
    [parts.discountPercent, 'discountPercent'],
    [parts.surchargePercent, 'surchargePercent'],
  ] as const)
    if (percent !== undefined) throw new DteError('INVALID_AMOUNT', { field: `${path}.${field}` })
  const given = finiteNumber(input.amount, `${path}.amount`)
  const written =
    given !== undefined && isExport(type) && Math.abs(given) < MAX_EXPORT_AMOUNT
      ? roundHalfAwayFromZero(given, 4)
      : given
  if (written !== undefined && written !== 0)
    throw new DteError('TOTAL_MISMATCH', { field: `${path}.amount`, expected: 0, actual: written })
  return { amount: 0, discountAmount: 0, surchargeAmount: 0 }
}

// The quantity, the price and the percents of a line were checked against their schema types before it is worked out,
// so the one refusal left is an amount with more digits than a number holds, which would be written as another one:
// it is refused on the line's amount, where it would be written, with its digits.
const workedOut = <T>(work: () => T, path: string): T => {
  try {
    return work()
  } catch (error) {
    throw new DteError('INVALID_AMOUNT', { ...(error as DteError).details, field: `${path}.amount` })
  }
}

// The amounts of a line: whole pesos, or, on an export document, its currency with four decimals and whole discount
// and surcharge amounts. A given amount is taken when the line has no price, and on an export document rounded to four
// decimals; on a line with a price it is the amount the price gives, or a zero on a dispatch guide that is not a sale.
// A line that must be zero is zero.
const lineAmounts = (
  input: LineItemInput,
  path: string,
  type: DocumentType,
  parts: LineParts,
  zero: boolean,
  zeroAdmitted: boolean,
): { readonly amount: number } & LineShares => {
  if (zero) return zeroLine(input, path, parts, type)
  if (isExport(type)) {
    const given = finiteNumber(input.amount, `${path}.amount`)
    const inRange = (amount: number): boolean => amount >= 0 && amount < MAX_EXPORT_AMOUNT
    if (given !== undefined && !inRange(given)) throw new DteError('INVALID_AMOUNT', { field: `${path}.amount` })
    const computed = workedOut(() => calculateExportLineAmount(parts), path)
    assertSharesWritten(parts, computed, path)
    const rounded = given === undefined ? undefined : roundHalfAwayFromZero(given, 4)
    const amount = rounded ?? computed.amount
    if (!inRange(amount)) throw new DteError('INVALID_AMOUNT', { field: `${path}.amount` })
    assertAmountAddsUp(parts, rounded, computed.amount, path, zeroAdmitted)
    return { ...computed, amount }
  }
  const computed = workedOut(() => calculateLineAmount(parts), path)
  assertSharesWritten(parts, computed, path)
  const given = finiteNumber(input.amount, `${path}.amount`)
  // `|| 0` writes a given -0 as 0, not as `-0`.
  const amount = given === undefined ? computed.amount : given || 0
  // `MontoItem` is a whole number from zero up in `Documento` and in a receipt, and of either sign only in
  // `Liquidacion`: a line discount above 100 % leaves a line below zero.
  if (!(Number.isInteger(amount) && (type === 43 || amount >= 0)))
    throw new DteError('INVALID_AMOUNT', { field: `${path}.amount` })
  assertAmountAddsUp(parts, given, computed.amount, path, zeroAdmitted)
  return { ...computed, amount }
}

// `DescuentoMonto` and `RecargoMonto` are whole numbers from one up in every root (`MntImpType`). In pesos a share is
// one already; on an export document a share with decimals is left to its percent, which Formato DTE 2.5 admits alone
// there (fields 30 and 34 of the detail, optional on the three export documents), and the line's amount carries it.
const writtenShare = (share: number): number | undefined => (share > 0 && Number.isInteger(share) ? share : undefined)

// A percent left without its amount is told to the caller: the format asks a percent for its amount (fields 30 and 34
// of the detail), and though it leaves that amount optional on an export document, what the SII makes of a line
// written this way has not been seen.
const percentWarnings = (items: readonly LineItem[]): readonly DocumentWarning[] =>
  items.flatMap((item, index) => [
    ...(item.discountPercent !== undefined && item.discountAmount === undefined
      ? [{ formatField: 30, field: `items[${index}].discountPercent` } as const]
      : []),
    ...(item.surchargePercent !== undefined && item.surchargeAmount === undefined
      ? [{ formatField: 34, field: `items[${index}].surchargePercent` } as const]
      : []),
  ])

// Formato DTE 2.5, field 4 of the references: `FolioRef` "Debe ser cero sólo si el documento tiene encendido el
// Indicador de referencia global". The format rejects a document only for what its header lacks, so a global
// reference with another folio is told to the caller, not refused.
const referenceWarnings = (references: readonly Reference[]): readonly DocumentWarning[] =>
  references.flatMap((reference, index) =>
    reference.global && !/^0+$/.test(reference.folio)
      ? [{ rule: 'globalReferenceFolio', field: `references[${index}].folio` } as const]
      : [],
  )

// The SII's instructions for the dispatch-guide test set: "cuando una Guía de Despacho Electrónica señala un Traslado
// Interno, los datos del receptor deben coincidir con los del emisor". Formato DTE 2.5 says nothing of it at
// `IndTraslado` (field 7), so a receiver with another RUT is told to the caller, not refused.
const transferWarnings = (
  type: DocumentType,
  transferType: number | undefined,
  issuer: Issuer,
  receiver: Receiver,
): readonly DocumentWarning[] =>
  type === 52 && transferType === TRANSFER_TYPES.internalTransfer && receiver.rut !== issuer.rut
    ? [{ rule: 'internalTransferReceiver', field: 'receiver.rut' }]
    : []

// Formato DTE 2.5 leaves `OtraMoneda` optional on the three export documents; as field behaviour, the SII has rejected
// an export document that came without it.
const EXPORT_WITHOUT_PESOS: DocumentWarning = { rule: 'exportWithoutPesos', field: 'exchangeRate' }

const normalizeItem = (input: LineItemInput, index: number, type: DocumentType, context: LineContext): LineItem => {
  const path = `items[${index}]`
  const { counted } = context
  const unitPrice = linePrice(input.unitPrice, `${path}.unitPrice`)
  // A priced line is computed with a quantity of 1 when it brings none, and is written with it; a price of zero is no
  // price. A dispatch guide needs the quantity on every line (Formato DTE 2.5, field 15), priced or not; an export
  // invoice of goods asks each line for its quantity and its unit (fields 15 and 21), which `counted` says.
  const quantity =
    positive(input.quantity, 'quantity', `${path}.quantity`) ?? (unitPrice !== undefined || type === 52 ? 1 : undefined)
  if (counted && quantity === undefined) throw new DteError('MISSING_FIELD', { field: `${path}.quantity` })
  if (counted && text(input.unit, 'UnmdItem') === undefined)
    throw new DteError('MISSING_FIELD', { field: `${path}.unit` })
  const receipt = isReceipt(type)
  const discountPercent = linePercent(input.discountPercent, `${path}.discountPercent`, receipt)
  // `PrcItem` is written with the decimals asked for: fewer than the price has would write another price than the one
  // the amount is worked out with, or a price of zero.
  const decimals = input.unitPriceDecimals
  if (
    decimals !== undefined &&
    !(
      Number.isInteger(decimals) &&
      decimals >= 0 &&
      decimals <= 6 &&
      (unitPrice === undefined || roundHalfAwayFromZero(unitPrice, decimals) === unitPrice)
    )
  )
    throw new DteError('INVALID_OPTION', { field: `${path}.unitPriceDecimals` })
  const surchargePercent = linePercent(input.surchargePercent, `${path}.surchargePercent`, receipt)
  const parts = { quantity, unitPrice, discountPercent, surchargePercent, wholeShares: input.wholeShares === true }
  const zero = context.zero || ZERO_LINE_INDICATORS.includes(input.exemptIndicator)
  const computed = lineAmounts(input, path, type, parts, zero, context.zeroAdmitted)
  const settledDocumentType = text(input.settledDocumentType, 'TpoDocLiq')
  // `TpoDocLiq` is a line of `Liquidacion`: required there, and declared nowhere else.
  if (type === 43 && settledDocumentType === undefined)
    throw new DteError('MISSING_FIELD', { field: `${path}.settledDocumentType` })
  if (type !== 43 && settledDocumentType !== undefined) refuse(`${path}.settledDocumentType`)
  const exemptIndicator = input.exemptIndicator ?? (input.exempt || isExemptType(type) ? 1 : undefined)
  return compact({
    lineNumber: index + 1,
    codes: input.codes,
    settledDocumentType,
    exemptIndicator,
    withholdingAgent: withholdingAgentOf(input.withholdingAgent, path),
    name: requiredText(input.name, 'NmbItem', `${path}.name`),
    description: text(input.description, 'DscItem'),
    referenceQuantity: positive(input.referenceQuantity, 'quantity', `${path}.referenceQuantity`),
    referenceUnit: text(input.referenceUnit, 'UnmdRef'),
    referencePrice: positive(input.referencePrice, 'quantity', `${path}.referencePrice`),
    quantity,
    unit: text(input.unit, 'UnmdItem'),
    unitPrice,
    unitPriceDecimals: unitPrice === undefined ? undefined : decimals,
    discountPercent,
    discountAmount: writtenShare(computed.discountAmount),
    surchargePercent,
    surchargeAmount: writtenShare(computed.surchargeAmount),
    additionalTaxCodes: input.additionalTaxCodes,
    amount: computed.amount,
  })
}

// The withheld amount is the rate by the sum of the lines that carry the code of the withholding (Formato DTE 2.5,
// field 117), so when the totals worked out here withhold the whole VAT, each line that VAT is charged on carries the
// code, unless it brings codes of its own. A line with an exempt indicator pays no VAT and gets none.
const withTotalWithholdingCode = (items: readonly LineItem[]): readonly LineItem[] =>
  items.map((item) =>
    item.exemptIndicator === undefined && item.additionalTaxCodes === undefined
      ? { ...item, additionalTaxCodes: [WITHHOLDING_TAX_CODES.totalVatWithholding] }
      : item,
  )

const normalizeReference = (input: ReferenceInput, index: number): Reference =>
  compact({
    lineNumber: index + 1,
    documentType: input.documentType,
    global: input.global ? (true as const) : undefined,
    folio: String(input.folio),
    otherRut: input.otherRut === undefined ? undefined : toSiiRut(input.otherRut, `references[${index}].otherRut`),
    otherAdditionalId: text(input.otherAdditionalId, 'IdAdicOtr'),
    date: toIsoDate(input.date, `references[${index}].date`),
    code: input.code,
    reason: text(input.reason, 'RazonRef'),
  })

// The receipts schema gives `Referencia` its own shape: a type and a folio that are optional texts, a free-text code
// and the reason; no date.
const normalizeReceiptReference = (input: ReceiptReferenceInput, index: number): ReceiptReference =>
  compact({
    lineNumber: index + 1,
    documentType: input.documentType === undefined ? undefined : text(String(input.documentType), 'TpoDocRef'),
    folio: input.folio === undefined ? undefined : text(String(input.folio), 'FolioRef'),
    code: text(input.code, 'CodRef'),
    reason: text(input.reason, 'RazonRef'),
  })

// `ValorDR` is a `Dec16_2Type` in `DTE_v10.xsd` and a `Dec1Type` in `EnvioBOLETA_v11.xsd`, both from 0.01 up: a value
// below it, or one its two decimals bring to zero, fails the schema, and a negative one would turn a discount into a
// surcharge, which is `TpoMov`'s to say.
const normalizeAdjustment = (input: GlobalAdjustmentInput, index: number): GlobalAdjustment => {
  const path = `globalAdjustments[${index}].value`
  const value = rounded(input.value, 'value', path)
  if (!(value > 0)) throw new DteError('INVALID_AMOUNT', { field: path })
  return compact({
    lineNumber: index + 1,
    kind: input.kind,
    valueType: input.valueType,
    value,
    description: text(input.description, 'GlosaDR'),
    exemptIndicator: input.exemptIndicator,
  })
}

// The schema asks every line for `ValComNeto` and `ValComExe`, so a line needs one of them and gets the other as
// zero. Its `ValComIVA` is the caller's or, without one, its net value by the VAT rate, left out when that is zero.
const normalizeCommission = (input: CommissionLineInput, index: number): CommissionLine => {
  const path = `commissions[${index}]`
  const netValue = finiteNumber(input.netValue, `${path}.netValue`)
  const exemptValue = finiteNumber(input.exemptValue, `${path}.exemptValue`)
  if (netValue === undefined && exemptValue === undefined)
    throw new DteError('MISSING_FIELD', { field: `${path}.netValue` })
  return compact({
    lineNumber: index + 1,
    kind: input.kind,
    description: requiredText(input.description, 'Glosa', `${path}.description`),
    rate: decimal(input.rate, 'percent', `${path}.rate`),
    netValue: netValue ?? 0,
    exemptValue: exemptValue ?? 0,
    vatValue: finiteNumber(input.vatValue, `${path}.vatValue`) ?? (commissionVat(netValue ?? 0) || undefined),
  })
}

// `DTE_v10.xsd` asks every informative subtotal for its `GlosaSTI`; `EnvioBOLETA_v11.xsd` leaves it optional.
const normalizeSubtotal = (input: SubtotalInfo, index: number, receipt: boolean): SubtotalInfo =>
  compact({
    ...input,
    description: receipt
      ? text(input.description, 'GlosaSTI')
      : requiredText(input.description, 'GlosaSTI', `subtotals[${index}].description`),
  })

const normalizePackage = (input: PackageType, index: number): PackageType => {
  const path = `transport.customs.packages[${index}]`
  return compact({
    code: whole(input.code, 3, `${path}.code`),
    count: whole(input.count, 10, `${path}.count`),
    marks: text(input.marks, 'Marcas'),
    containerId: text(input.containerId, 'IdContainer'),
    seal: text(input.seal, 'Sello'),
    sealIssuer: text(input.sealIssuer, 'EmisorSello'),
  })
}

// The customs area: codes of one to four digits, counts, weights with two decimals and amounts with four, and the
// texts with their limits. What Formato DTE 2.5 asks of an export invoice is checked by `assertCustoms`.
const normalizeCustoms = (input: CustomsInput | undefined): Customs | undefined => {
  if (input === undefined) return undefined
  const path = 'transport.customs'
  if ((input.packages ?? []).length > MAX_PACKAGE_TYPES) refuse(`${path}.packages`)
  return compact({
    saleModality: whole(input.saleModality, 2, `${path}.saleModality`),
    saleClause: whole(input.saleClause, 2, `${path}.saleClause`),
    saleClauseTotal: positive(input.saleClauseTotal, 'value', `${path}.saleClauseTotal`),
    transportRoute: whole(input.transportRoute, 2, `${path}.transportRoute`),
    transportName: text(input.transportName, 'NombreTransp'),
    carrierRut: input.carrierRut === undefined ? undefined : toSiiRut(input.carrierRut, `${path}.carrierRut`),
    carrierName: text(input.carrierName, 'NomCiaTransp'),
    carrierAdditionalId: text(input.carrierAdditionalId, 'IdAdicTransp'),
    booking: text(input.booking, 'Booking'),
    operator: text(input.operator, 'Operador'),
    loadingPort: whole(input.loadingPort, 4, `${path}.loadingPort`),
    loadingPortAdditionalId: text(input.loadingPortAdditionalId, 'IdAdicPtoEmb'),
    unloadingPort: whole(input.unloadingPort, 4, `${path}.unloadingPort`),
    unloadingPortAdditionalId: text(input.unloadingPortAdditionalId, 'IdAdicPtoDesemb'),
    tare: whole(input.tare, 7, `${path}.tare`),
    tareUnit: whole(input.tareUnit, 2, `${path}.tareUnit`),
    grossWeight: decimal(input.grossWeight, 'weight', `${path}.grossWeight`),
    grossWeightUnit: whole(input.grossWeightUnit, 2, `${path}.grossWeightUnit`),
    netWeight: decimal(input.netWeight, 'weight', `${path}.netWeight`),
    netWeightUnit: whole(input.netWeightUnit, 2, `${path}.netWeightUnit`),
    totalItems: whole(input.totalItems, 18, `${path}.totalItems`),
    totalPackages: whole(input.totalPackages, 18, `${path}.totalPackages`),
    packages: input.packages?.map(normalizePackage),
    freight: positive(input.freight, 'amount', `${path}.freight`),
    insurance: positive(input.insurance, 'amount', `${path}.insurance`),
    receiverCountry: whole(input.receiverCountry, 3, `${path}.receiverCountry`),
    destinationCountry: whole(input.destinationCountry, 3, `${path}.destinationCountry`),
  })
}

// What Formato DTE 2.5 asks of the customs area: package types only with their total (the table of package types,
// after field 95); and on an export invoice the receiver's country (field 104), each weight with its unit (fields 89,
// 91 and 93), the marks of each package that is not a container (field 98), and, unless its service indicator excuses
// them, the sale modality, clause and total and the route.
const assertCustoms = (customs: Customs | undefined, type: DocumentType, service: unknown): void => {
  const path = 'transport.customs'
  const missing = (field: string): never => {
    throw new DteError('MISSING_FIELD', { field: `${path}.${field}` })
  }
  if (given(customs?.packages) && customs?.totalPackages === undefined) missing('totalPackages')
  if (type !== 110) return
  if (customs?.receiverCountry === undefined) missing('receiverCountry')
  if (!SERVICES_WITHOUT_SALE.includes(service))
    for (const field of ['saleModality', 'saleClause', 'saleClauseTotal'] as const)
      if (customs?.[field] === undefined) missing(field)
  if (!SERVICES_WITHOUT_ROUTE.includes(service) && customs?.transportRoute === undefined) missing('transportRoute')
  for (const [measure, unit] of [
    ['tare', 'tareUnit'],
    ['grossWeight', 'grossWeightUnit'],
    ['netWeight', 'netWeightUnit'],
  ] as const)
    if (customs?.[measure] !== undefined && customs[unit] === undefined) missing(unit)
  customs?.packages?.forEach((pack, index) => {
    if (!CONTAINER_PACKAGES.includes(pack.code) && pack.marks === undefined) missing(`packages[${index}].marks`)
  })
}

const normalizeTransport = (input: TransportInput | undefined): Transport | undefined =>
  input === undefined
    ? undefined
    : compact({
        licensePlate: text(input.licensePlate, 'Patente'),
        trailerLicensePlate: text(input.trailerLicensePlate, 'PatenteCarro'),
        carrierRut: input.carrierRut === undefined ? undefined : toSiiRut(input.carrierRut, 'transport.carrierRut'),
        driver:
          input.driver === undefined
            ? undefined
            : {
                rut: toSiiRut(input.driver.rut, 'transport.driver.rut'),
                name: requiredText(input.driver.name, 'NombreChofer', 'transport.driver.name'),
              },
        destinationAddress: text(input.destinationAddress, 'DirDest'),
        destinationCommune: text(input.destinationCommune, 'CmnaDest'),
        destinationCity: text(input.destinationCity, 'CiudadDest'),
        departureDate: transportDate(input.departureDate, 'transport.departureDate'),
        departureTime: transportTime(input.departureTime, 'transport.departureTime'),
        arrivalDate: transportDate(input.arrivalDate, 'transport.arrivalDate'),
        customs: normalizeCustoms(input.customs),
      })

// An adjustment of an export document given as an amount carries that amount in pesos too, when the document brings
// its exchange rate: Formato DTE 2.5 marks `ValorDROtrMnda` required on the three export documents and says it applies
// to the amounts of discounts and surcharges (field 6 of the global discounts and surcharges). A percent is the same
// in any currency, and is written alone.
const adjustmentInPesos = (adjustment: GlobalAdjustment, rate: number | undefined): GlobalAdjustment =>
  rate === undefined || adjustment.valueType !== 'amount'
    ? adjustment
    : { ...adjustment, otherCurrencyValue: convertToPesos(adjustment.value, rate) }

// The totals of an export document in pesos, when it brings the exchange rate: `PESO CL`, as Formato DTE 2.5 asks
// (fields 129 to 132 and 138), each amount `convertToPesos` of the document's.
const otherCurrencyOf = (rate: number | undefined, totals: Totals): OtherCurrency | undefined =>
  rate === undefined
    ? undefined
    : {
        currency: CHILEAN_PESO,
        exchangeRate: rate,
        exemptAmount: convertToPesos(totals.exemptAmount ?? 0, rate),
        totalAmount: convertToPesos(totals.totalAmount, rate),
      }

/**
 * EN: `createDocument` with what a caller inside the library may waive. Internal.
 * ES: `createDocument` con lo que un llamador de dentro de la librería puede eximir. Interno.
 */
export const createDocumentWith = (
  input: DocumentInput,
  options: CreateDocumentOptions,
  waivers: CreateDocumentWaivers,
): Document => {
  if (!isDocumentType(input.type)) throw new DteError('INVALID_DOCUMENT_TYPE', { type: input.type })
  if (!Number.isInteger(input.folio) || input.folio <= 0) throw new DteError('INVALID_FOLIO', { folio: input.folio })
  const type = input.type
  const receipt = isReceipt(type)
  const exported = isExport(type)
  const issueDate = input.issueDate === undefined ? chileDate(options.now) : toIsoDate(input.issueDate, 'issueDate')
  const issuer = normalizeIssuer(input.issuer, receipt)
  const receiver = normalizeReceiver(input.receiver, type)
  if (input.items.length === 0) throw new DteError('MISSING_FIELD', { field: 'items' })
  if (input.items.length > (receipt ? MAX_RECEIPT_LINES : MAX_LINES)) refuse('items')
  if (type === 43) assertSettlement(input)
  if (exported) assertExport(input)
  else assertNotExport(input)
  if (receipt) assertReceipt(input)
  // `IndMntNeto` and `RUTProvSW` are a receipt's: no other document declares them.
  else if (input.options?.netAmountsIndicator !== undefined) refuse('options.netAmountsIndicator')
  else if (input.softwareProviderRut !== undefined) refuse('softwareProviderRut')
  const softwareProviderRut =
    input.softwareProviderRut === undefined ? undefined : toSiiRut(input.softwareProviderRut, 'softwareProviderRut')
  if ((input.commissions ?? []).length > MAX_COMMISSIONS) refuse('commissions')
  if ((input.globalAdjustments ?? []).length > MAX_GLOBAL_ADJUSTMENTS) refuse('globalAdjustments')
  if ((input.options?.payments ?? []).length > MAX_PAYMENTS) refuse('options.payments')
  if ((input.references ?? []).length > MAX_REFERENCES) refuse('references')
  if ((input.receiptReferences ?? []).length > MAX_REFERENCES) refuse('receiptReferences')
  const service = input.options?.serviceIndicator
  const counted = type === 110 && !SERVICES_WITHOUT_SALE.includes(service)
  const cited = input.references ?? []
  assertNoteReferences(type, cited, waivers.unreferencedNote === true)
  assertExemptIndicators(input)
  assertVatNotWithheld(input)
  if (input.splitVat && (type !== 43 || input.totals !== undefined)) refuse('splitVat')
  assertTransferType(type, input.options?.transferType)
  // Formato DTE 2.5, field 38 of the detail: every line of a credit note that corrects a text is zero, and a line of a
  // dispatch guide whose transfer is not a sale may be. Field 7 makes 1 the sale and every value above it a transfer
  // "por otros motivos que no corresponden a venta", so 9, whose label reads "Venta para exportación", is not a sale
  // here, as field 38 reads "Guía de despacho NO VENTA (Según campo Indicador Tipo de traslado de bienes del
  // encabezado)" and `IndExe` 4 calls a sale guide one "con Indicador Tipo de Traslado de Bienes igual a 1".
  // A `SET` reference names no document, so its code makes no note one that corrects a text, as it counts for no
  // reference above.
  const zero =
    (type === 61 || type === 112) &&
    cited.some(({ documentType, code }) => documentType !== 'SET' && code === CORRECTS_TEXT)
  const context: LineContext = {
    counted,
    zero,
    zeroAdmitted: type === 52 && input.options?.transferType !== TRANSFER_TYPES.sale,
  }
  // A note written at zero has nothing for a global adjustment to apply to nor a total to take a commission off.
  if (zero && given(input.globalAdjustments)) refuse('globalAdjustments[0]')
  if (zero && given(input.commissions)) refuse('commissions[0]')
  const lines = input.items.map((item, index) => normalizeItem(item, index, type, context))
  // A receipt's `Referencia` has no date: the invoice shape would fail the receipts schema, and the other way round.
  if (receipt && cited.length > 0) throw new DteError('INVALID_OPTION', { field: 'references' })
  if (!receipt && (input.receiptReferences ?? []).length > 0)
    throw new DteError('INVALID_OPTION', { field: 'receiptReferences' })
  const references = cited.map(normalizeReference)
  const receiptReferences = (input.receiptReferences ?? []).map(normalizeReceiptReference)
  const subtotals = (input.subtotals ?? []).map((subtotal, index) => normalizeSubtotal(subtotal, index, receipt))
  const globalAdjustments = (input.globalAdjustments ?? []).map(normalizeAdjustment)
  const commissions = (input.commissions ?? []).map(normalizeCommission)
  const transport = normalizeTransport(input.transport)
  if (exported) assertCustoms(transport?.customs, type, service)
  const exchangeRate = positive(input.exchangeRate, 'rate', 'exchangeRate')
  const withoutPayment = Number(input.options?.exportPaymentTerms) === WITHOUT_PAYMENT
  const computed =
    input.totals ??
    calculateTotals(lines, {
      type,
      pricesIncludeVat: input.pricesIncludeVat,
      vatRate: VAT_RATE,
      globalAdjustments,
      withholdVat: input.withholdVat,
      // The lines as the caller gave them, checked above: the summary's VAT depends on whether a line states its own.
      commissions: input.commissions,
      withoutPayment,
    })
  const totals = input.splitVat ? withVatSplit(computed) : computed
  // Totals the caller gave are the caller's to match with the lines; what the SII checks over the totals themselves is
  // checked here, on them and on the ones worked out.
  if (exported) assertExportTotals(totals, withoutPayment)
  else assertTotals(type, totals)
  const warnings = [
    ...totalsWarnings(type, totals),
    ...(exported ? percentWarnings(lines) : []),
    ...referenceWarnings(references),
    ...transferWarnings(type, input.options?.transferType, issuer, receiver),
    ...(exported && exchangeRate === undefined ? [EXPORT_WITHOUT_PESOS] : []),
  ]
  const withheld = input.totals === undefined && totals.withholdings !== undefined
  const items = withheld ? withTotalWithholdingCode(lines) : lines
  const headerOptions: HeaderOptions = compact({
    ...input.options,
    serviceIndicator: input.options?.serviceIndicator ?? (receipt ? SERVICE_INDICATORS.salesAndServices : undefined),
    grossAmounts:
      input.options?.grossAmounts ??
      (input.pricesIncludeVat && !receipt && (totals.netAmount ?? 0) > 0 ? 1 : undefined),
    // Without `IndMntNeto` Formato de Boletas 4.2 reads a receipt's lines as VAT included; an exempt receipt has none.
    netAmountsIndicator:
      input.options?.netAmountsIndicator ??
      (type === 39 && !input.pricesIncludeVat && (totals.netAmount ?? 0) > 0 ? 2 : undefined),
  })

  return {
    id: `DTE_T${type}F${input.folio}`,
    header: compact({
      type,
      folio: input.folio,
      issueDate,
      options: headerOptions,
      issuer,
      receiver,
      softwareProviderRut,
      transport,
      currency: input.currency,
      totals,
      otherCurrency: otherCurrencyOf(exchangeRate, totals),
    }),
    items,
    subtotals,
    globalAdjustments: globalAdjustments.map((adjustment) => adjustmentInPesos(adjustment, exchangeRate)),
    references,
    receiptReferences,
    commissions,
    ...(warnings.length > 0 ? { warnings } : {}),
  }
}

/**
 * EN: Builds a normalized `Document` from caller input: validates type, folio and dates, normalizes RUTs with rut.ts,
 * sanitizes text and enforces schema lengths (fails early instead of letting the SII reject the whole envelope),
 * numbers lines, computes amounts and totals, applies receipt defaults (final consumer, `IndServicio=3`) and sets
 * `MntBruto=1` when prices include VAT. Quantities and prices are rounded to the six decimals the schema holds, and
 * percentages, the value of a global adjustment and the rate of a commission to two, half away from zero over their
 * decimal digits, before anything is computed from them, so each amount is the one of the numbers written, and each
 * line's amounts are worked out the same way, exactly (`calculateLineAmount`); a price of zero is left out (Formato
 * DTE 2.5, field 22 of the detail), and a line with a price and no quantity is written with the quantity it is
 * computed with, 1, and so is every line of a dispatch guide (52) that brings none. A price is written with the
 * decimals asked for over its decimal digits, padded with zeros. When the totals worked out here withhold the whole VAT (a purchase invoice,
 * or `withholdVat`), each VAT-affected line that brings no additional tax code carries code 15, the one the
 * withholding is summed over. Commission lines are completed (the value a line lacks is zero, and its VAT
 * is its net value by the VAT rate when it brings none), summed into the totals, where their VAT is the VAT rate by
 * their total net value unless a line states its own, and taken off the total. A settlement
 * invoice (43) is held to what its root, `Liquidacion`, declares: no transport, no global or line discounts and
 * surcharges, no `otherRut` in a reference, no non-billable amount in its totals, none of the `IdDoc` options only
 * `Documento` declares and a receiver with its business activity. A receipt (39, 41) is held to
 * what its own schema, `EnvioBOLETA_v11.xsd`, declares: no transport, no commissions, no withholding, the `IdDoc`
 * options `serviceIndicator`, `netAmountsIndicator` (2), `billingPeriod`, `dueDate` and `paymentMedium` and no
 * other, totals without a rate, own or third-party VAT, withholdings or commissions, and lines without a reference
 * quantity, unit or price, without additional tax codes and with an exempt indicator of 1, 2 or 6. What its issuer
 * and receiver carry that is not written on a receipt is left out, not refused: the issuer's branch name, phone,
 * e-mail, activity code and salesperson and the receiver's business activity, which a receipt has no element for,
 * and the receiver's e-mail and postal address. `softwareProviderRut` (`RUTProvSW`) and `netAmountsIndicator`
 * (`IndMntNeto`) are a receipt's alone, and a receipt (39) issued without `pricesIncludeVat` whose totals carry a
 * net amount gets `IndMntNeto=2` by itself. An export document (110, 111, 112) is held to what its root,
 * `Exportaciones`, declares: its `currency` is required, its receiver is the generic 55555555-5 and needs no commune,
 * its amounts carry four decimals and its line discounts and surcharges whole numbers, its totals are its exempt amount
 * and the same total (zero without payment, `FmaPagExp` 21), and with an `exchangeRate` it carries them in pesos; it
 * refuses what `Exportaciones` does not declare, a service indicator outside 3 to 6 and a global adjustment that does
 * not apply to the exempt amount, and on a 110 it asks for what Formato DTE 2.5 asks of the receiver, the customs area
 * and the lines. Every other type refuses what only an export document carries. What the SII would reject in the
 * content is refused before anything is stamped: more than 60 lines, or 1,000 on a receipt; more than 40 references,
 * the `maxOccurs` of `Referencia` in `DTE_v10.xsd` and `EnvioBOLETA_v11.xsd`; on every type but a receipt, an issuer without its activity code
 * (`Acteco`) and an informative subtotal without its description (`GlosaSTI`), which the schema requires; a line
 * amount that is not a whole number, or is below zero on any type but a 43; a given line amount that is not the one
 * the line's price gives (Formato DTE 2.5, field 38 of the detail), which a dispatch guide that is not a sale may give
 * as zero; a line that is not a sale (`IndExe` 4 or 5), or of a credit note that corrects a text, that is not zero,
 * which the same field asks, and so a percent on it; a quantity, a reference quantity or a reference price at or
 * below zero, which their schema type does not admit, and a price written with fewer decimals than it has; a credit
 * note that cancels a document or corrects a text, or a debit note that cancels a credit note, with another document
 * reference than its one (the `CodRef` row), and a credit note that corrects a text with a global adjustment or a
 * commission; on a receipt a line percent above 100, where its schema stops; a dispatch guide (52) without its
 * transfer type (`IndTraslado`, Formato DTE 2.5, field 7); an `IndExe` outside 1 to 6, `null` included, which the
 * schemas do not admit; a line with `IndExe` 3 on a 43 or an export document, which this library refuses though the
 * format's `IndExe` row admits the indicator there (on a 46 or a 52 such a line keeps its amount and is in no total); a
 * `depositGuarantee` other than zero, a value that is not a number included, on a type other than 33, 34, 56 and 61,
 * which the format gives no `GrntDep` (field 120), where a given zero is none on every type; and, over the totals
 * worked out or given, the amounts their types do not admit, an invoice (33) without VAT (validation 55), an exempt
 * invoice (34) without an exempt amount above zero or with a net amount or a VAT (validation 57), and a total or a
 * period amount that does not add up. What the SII accepts with an objection is built and listed in `warnings`: a total
 * of zero on a 33, 34, 43 or 46 (validation 10), a net amount of zero on a 33, 43 or 46 (validation 12), and an invoice
 * (33) whose net amount is not above zero (validation 56); and, on an export document, each percent of a line written
 * without its amount, since the format asks a percent for its amount (fields 30 and 34 of the detail). Listed too, by
 * the rule each goes against: a global reference whose folio is not zero (Formato DTE 2.5, field 4 of the references),
 * a dispatch guide of an internal transfer (`transferType` 5) whose receiver's RUT is not the issuer's (the SII's
 * instructions for the dispatch-guide test set), and an export document without `exchangeRate`, which carries no
 * totals in pesos (`OtraMoneda`, optional in the format; field behaviour). Each check stops at the first fault it
 * finds. Pure: same input, same output.
 * ES: Construye un `Document` normalizado desde la entrada: valida tipo, folio y fechas, normaliza RUT con rut.ts,
 * sanitiza textos y exige los largos del esquema (falla temprano en vez de dejar que el SII rechace el sobre entero),
 * numera líneas, calcula montos y totales, aplica los defaults de boleta (consumidor final, `IndServicio=3`) y fija
 * `MntBruto=1` cuando los precios incluyen IVA. Las cantidades y los precios se redondean a los seis decimales que
 * admite el esquema, y los porcentajes, el valor de un ajuste global y la tasa de una comisión a dos, la mitad lejos
 * de cero sobre sus dígitos decimales, antes de calcular nada con ellos, así cada monto es el de los números
 * escritos, y los montos de cada línea se calculan igual, con exactitud (`calculateLineAmount`); un precio de cero
 * se omite (Formato DTE 2.5, campo 22 del detalle), y una línea con precio y sin cantidad se escribe con la cantidad
 * con que se calcula, 1, y también cada línea de una guía de
 * despacho (52) que no la trae. Un precio se escribe con los decimales pedidos sobre sus dígitos decimales, completado
 * con ceros.
 * Cuando los totales calculados aquí retienen todo el IVA (una
 * factura de compra, o `withholdVat`), cada línea afecta que no trae código de impuesto adicional lleva el código
 * 15, sobre el que se suma la retención. Las líneas de comisión se completan (el valor que falta va en cero, y
 * su IVA es su valor neto por la tasa de IVA cuando no lo trae), se suman en los totales, donde su IVA es la tasa de
 * IVA por su valor neto total salvo que una línea declare el suyo, y se restan del total. Una
 * liquidación factura (43) se atiene a lo que declara su raíz, `Liquidacion`: sin transporte, sin descuentos ni
 * recargos globales o por línea, sin `otherRut` en una referencia, sin monto no facturable en sus totales, sin las
 * opciones de `IdDoc` que solo declara `Documento` y con el giro del receptor. Una boleta
 * (39, 41) se atiene a lo que declara su propio esquema, `EnvioBOLETA_v11.xsd`: sin transporte, sin comisiones, sin
 * retención, con las opciones de `IdDoc` `serviceIndicator`, `netAmountsIndicator` (2), `billingPeriod`, `dueDate` y
 * `paymentMedium` y ninguna otra, con totales sin tasa, IVA propio o de terceros, retenciones ni comisiones, y con
 * líneas sin cantidad, unidad ni precio de referencia, sin códigos de impuesto adicional y con indicador de exención
 * 1, 2 o 6. Lo que su emisor y su receptor traen y no se escribe en una boleta queda fuera, sin rechazo: la
 * sucursal, el teléfono, el correo, el código de actividad y el vendedor del emisor y el giro del receptor, para los
 * que la boleta no tiene elemento, y el correo y la dirección postal del receptor. `softwareProviderRut`
 * (`RUTProvSW`) y `netAmountsIndicator` (`IndMntNeto`) son solo de la boleta, y una boleta (39) emitida sin
 * `pricesIncludeVat` cuyos totales traen monto neto recibe sola `IndMntNeto=2`. Un documento de exportación (110,
 * 111, 112) se atiene a lo que declara su raíz, `Exportaciones`: su `currency` es obligatoria, su receptor es el genérico
 * 55555555-5 y no se le pide comuna, sus montos llevan cuatro decimales y los descuentos y recargos de línea enteros,
 * sus totales son su monto exento y el mismo total (cero sin pago, `FmaPagExp` 21), y con un `exchangeRate` los lleva en
 * pesos; rechaza lo que `Exportaciones` no declara, un indicador de servicio fuera de 3 a 6 y un ajuste global que no
 * aplica al monto exento, y en un 110 pide lo que el Formato DTE 2.5 pide del receptor, del área aduanera y de las
 * líneas. Todo otro tipo rechaza lo que solo lleva un documento de exportación. Lo que el SII rechazaría en el
 * contenido se rechaza antes de timbrar nada: más de 60 líneas, o 1.000 en una boleta; más de 40 referencias, el
 * `maxOccurs` de `Referencia` en `DTE_v10.xsd` y `EnvioBOLETA_v11.xsd`; en todo tipo salvo la boleta,
 * un emisor sin código de actividad (`Acteco`) y un subtotal informativo sin glosa (`GlosaSTI`), que el esquema exige;
 * un monto de línea que no es entero, o que es negativo en cualquier tipo salvo el 43; un monto de línea entregado
 * que no es el que da el precio de la línea (Formato DTE 2.5, campo 38 del detalle), que una guía de despacho que no
 * es venta puede dar como cero; una línea que no es venta (`IndExe` 4 o 5), o de una nota de crédito que corrige un
 * texto, que no es cero, como pide el mismo campo, y con ello un porcentaje en ella; una cantidad, una cantidad de
 * referencia o un precio de referencia de cero o menos, que su tipo del esquema no admite, y un precio escrito con
 * menos decimales de los que tiene; una nota de crédito que anula un documento o corrige un texto, o una nota de débito
 * que anula una nota de crédito, con otro documento de referencia que el suyo (fila de `CodRef`), y una nota de
 * crédito que corrige un texto con un ajuste global o una comisión; en una boleta un porcentaje de línea mayor que
 * 100, donde se detiene su esquema; una guía de despacho (52) sin su tipo de traslado (`IndTraslado`, Formato DTE
 * 2.5, campo 7); un `IndExe` fuera de 1 a 6, `null` incluido, que los esquemas no admiten; una línea con `IndExe` 3 en
 * un 43 o un documento de exportación, que esta librería rechaza aunque la fila de `IndExe` del formato admite el
 * indicador ahí (en un 46 o un 52 esa línea conserva su monto y no entra en ningún total); un `depositGuarantee`
 * distinto de cero, también un valor que no es número, en un tipo distinto de 33, 34, 56 y 61, a los que el formato no
 * da `GrntDep` (campo 120), donde uno entregado en cero no cuenta en ningún tipo; y, sobre los totales calculados o
 * entregados, los montos que sus tipos no admiten, una factura (33) sin IVA (validación 55), una factura exenta (34)
 * sin monto exento mayor que cero o con monto neto o IVA (validación 57), y un monto total o del período que no cuadra.
 * Lo que el SII acepta con reparo se construye y se informa en `warnings`: un monto total en cero en un 33, 34, 43 o 46
 * (validación 10), un monto neto en cero en un 33, 43 o 46 (validación 12), y una factura (33) cuyo monto neto no es
 * mayor que cero (validación 56); y, en un documento de exportación, cada porcentaje de una línea escrito sin su
 * monto, porque el formato le pide a un porcentaje su monto (campos 30 y 34 del detalle). Se informan también, por la
 * regla contra la que va cada uno: una referencia global cuyo folio no es cero (Formato DTE 2.5, campo 4 de las
 * referencias), una guía de despacho de traslado interno (`transferType` 5) cuyo receptor no tiene el RUT del emisor
 * (instrucciones del SII para el set de guías de despacho), y un documento de exportación sin `exchangeRate`, que no
 * lleva sus totales en pesos (`OtraMoneda`, opcional en el formato; comportamiento visto en la práctica). Cada revisión
 * se detiene en la primera falla que encuentra. Pura: misma entrada, misma salida.
 * @throws {DteError} EN: `INVALID_DOCUMENT_TYPE`, `INVALID_FOLIO`, `INVALID_DATE`, `INVALID_RUT`, `MISSING_FIELD` (also a commission line with neither a net nor an exempt value, a settlement invoice whose receiver has no `businessActivity`, an `issuer.activityCode` or a `subtotals[i].description` missing on a type that is not a receipt, the `totals.vatAmount` of a 33 or the `totals.exemptAmount` of a 34, the `currency` of an export document and, on a 110, the receiver's `city`, a line's `quantity` and `unit`, the fields of `transport.customs` Formato DTE 2.5 asks for, the marks of each package that is not a container, and `options.settlementDate` when it is paid in advance (`exportPaymentTerms` 32), the `options.transferType` of a dispatch guide, and the `references` of a credit or a debit note (56, 61, 111, 112), which a `SET` reference alone does not give), `FIELD_TOO_LONG`, `INVALID_AMOUNT` (also a quantity, a price, a percentage, an adjustment value or a commission rate with more digits than its schema type holds, a `globalAdjustments[i].value` that is not above zero once rounded to its two decimals, an `items[i].amount` that is not a whole number, is negative outside a 43 or has more digits than a number holds, an `items[i].quantity`, `items[i].referenceQuantity` or `items[i].referencePrice` at or below zero, an `items[i].unitPrice` below zero, or any of them above zero and brought to zero by its six decimals, a total its schema type or validation 57 does not admit, a `totals.vatNotWithheld` that is not a whole number above zero, a line discount or surcharge in percent that is negative or whose amount rounds to zero, or above 100 on a receipt, or on a line written at zero, and on an export document an amount below zero or of 100 000 000 000 000 or more, a total given with more than four decimals (a line's amount, the exchange rate, the freight and the insurance are rounded to four), and an exchange rate, freight, insurance or clause total that is not above zero); `TOTAL_MISMATCH` for a `totals.totalAmount` or a `totals.periodAmount` that does not add up, and for an `items[i].amount` on a line with a price that is not the price by the quantity less the discount plus the surcharge (Formato DTE 2.5, field 38 of the detail) nor, on a dispatch guide whose `transferType` is not 1, a zero on a line with no percent, and for one other than zero on a line that is not a sale (`IndExe` 4 or 5) or of a credit note (61, 112) with a reference of `code` 2, with `expected` and `actual`; `INVALID_TIME` for a `transport.departureTime` that is not `HH:MM:SS` or `HH:MM`; `INVALID_OPTION` for `references` on a receipt, `receiptReferences` on any other type, an `items[i].unitPriceDecimals` fewer than the decimals of the price, a `references[i]` beside another document reference on a credit note (61, 112) with a reference of `code` 1 or 2 or on a debit note (56, 111) with one of `code` 1 (a `SET` reference is no document), a `globalAdjustments[0]` or a `commissions[0]` on a credit note that corrects a text, an `items[i].exemptIndicator` outside 1 to 6 (`null` included), or of 3 on a 43 or an export document, a `totals.depositGuarantee` other than zero (a value that is not a number included) on a type other than 33, 34, 56 and 61, a `totals.vatNotWithheld` other than zero on a type other than 46, 56 and 61, an `options.transferType` outside 1 to 9, more than 20 `commissions`, more than 20 `globalAdjustments`, more than 30 `options.payments`, more `items` than the type admits, more than 40 `references` or `receiptReferences`, an `issuer.activityCode` that is not a positive integer of at most six digits, a `settledDocumentType` on a type other than 43, on a 43 whatever `Liquidacion` does not declare, on a receipt whatever its schema does not declare, an `options.netAmountsIndicator` or a `softwareProviderRut` on a type that is not a receipt, on an export document whatever `Exportaciones` does not declare, a service indicator outside 3 to 6, an `exportPaymentTerms` that is not a code of one or two digits, a `currency` outside `CURRENCIES`, a receiver RUT other than 55555555-5, a global adjustment without `exemptIndicator` 1 and a customs code past its digits, and on any other type the fields only an export document carries and the service indicators 5 and 6, with the field in `details.field`. ES: los mismos códigos; `INVALID_AMOUNT` también por una cantidad, un precio, un porcentaje, el valor de un ajuste o la tasa de una comisión con más dígitos de los que admite su tipo del esquema, por un `globalAdjustments[i].value` que no es mayor que cero una vez redondeado a sus dos decimales, por un `items[i].amount` que no es entero, es negativo fuera de un 43 o tiene más dígitos de los que guarda un número, por un `items[i].quantity`, `items[i].referenceQuantity` o `items[i].referencePrice` de cero o menos, por un `items[i].unitPrice` menor que cero, o por cualquiera de ellos mayor que cero y llevado a cero por sus seis decimales, por un total que su tipo del esquema o la validación 57 no admite, por un `totals.vatNotWithheld` que no es un entero mayor que cero, por un descuento o recargo de línea en porcentaje negativo o cuyo monto redondea a cero, o mayor que 100 en una boleta, o en una línea que se escribe en cero, y en un documento de exportación por un monto negativo o de 100 000 000 000 000 o más, por un total dado con más de cuatro decimales (el monto de una línea, el tipo de cambio, el flete y el seguro se redondean a cuatro), y por un tipo de cambio, flete, seguro o total de cláusula que no es mayor que cero; `MISSING_FIELD` también por una línea de comisión sin valor neto ni exento, por una liquidación factura cuyo receptor no trae `businessActivity`, por un `issuer.activityCode` o un `subtotals[i].description` ausente en un tipo que no es boleta, por el `totals.vatAmount` de un 33 o el `totals.exemptAmount` de un 34, por la `currency` de un documento de exportación y, en un 110, por la `city` del receptor, la `quantity` y la `unit` de una línea, los campos de `transport.customs` que pide el Formato DTE 2.5, las marcas de cada bulto que no es un contenedor, y `options.settlementDate` cuando se paga por anticipado (`exportPaymentTerms` 32), por el `options.transferType` de una guía de despacho, y por las `references` de una nota de crédito o de débito (56, 61, 111, 112), que una referencia `SET` sola no da; `TOTAL_MISMATCH` por un `totals.totalAmount` o un `totals.periodAmount` que no cuadra, y por un `items[i].amount` en una línea con precio que no es el precio por la cantidad menos el descuento más el recargo (Formato DTE 2.5, campo 38 del detalle) ni, en una guía de despacho cuyo `transferType` no es 1, un cero en una línea sin porcentaje, y por uno distinto de cero en una línea que no es venta (`IndExe` 4 o 5) o de una nota de crédito (61, 112) con una referencia de `code` 2, con `expected` y `actual`; `INVALID_TIME` por un `transport.departureTime` que no es `HH:MM:SS` ni `HH:MM`; `INVALID_OPTION` por `references` en una boleta, `receiptReferences` en cualquier otro tipo, un `items[i].unitPriceDecimals` menor que los decimales del precio, una `references[i]` junto a otro documento de referencia en una nota de crédito (61, 112) con una referencia de `code` 1 o 2 o en una nota de débito (56, 111) con una de `code` 1 (una referencia `SET` no es un documento), un `globalAdjustments[0]` o un `commissions[0]` en una nota de crédito que corrige un texto, un `items[i].exemptIndicator` fuera de 1 a 6 (`null` incluido), o 3 en un 43 o un documento de exportación, un `totals.depositGuarantee` distinto de cero (también un valor que no es número) en un tipo distinto de 33, 34, 56 y 61, un `totals.vatNotWithheld` distinto de cero en un tipo distinto de 46, 56 y 61, un `options.transferType` fuera de 1 a 9, más de 20 `commissions`, más de 20 `globalAdjustments`, más de 30 `options.payments`, más `items` de los que admite el tipo, más de 40 `references` o `receiptReferences`, un `issuer.activityCode` que no es un entero positivo de hasta seis dígitos, un `settledDocumentType` en un tipo distinto del 43, en un 43 lo que `Liquidacion` no declara, en una boleta lo que su esquema no declara, un `options.netAmountsIndicator` o un `softwareProviderRut` en un tipo que no es boleta, en un documento de exportación lo que `Exportaciones` no declara, un indicador de servicio fuera de 3 a 6, un `exportPaymentTerms` que no es un código de uno o dos dígitos, una `currency` fuera de `CURRENCIES`, un RUT de receptor distinto de 55555555-5, un ajuste global sin `exemptIndicator` 1 y un código aduanero con más dígitos de los que admite, y en cualquier otro tipo los campos que solo lleva un documento de exportación y los indicadores de servicio 5 y 6, con el campo en `details.field`.
 */
export const createDocument = (input: DocumentInput, options: CreateDocumentOptions = {}): Document =>
  createDocumentWith(input, options, {})
