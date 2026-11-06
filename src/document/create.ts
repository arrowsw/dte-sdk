import { FINAL_CONSUMER_RUT, SERVICE_INDICATORS, VAT_RATE } from '../catalogs/codes'
import { isDocumentType, isExemptType, isReceipt, type DocumentType } from '../catalogs/document-types'
import { DteError } from '../errors'
import type {
  CommissionLine,
  CommissionLineInput,
  Document,
  DocumentInput,
  GlobalAdjustment,
  GlobalAdjustmentInput,
  HeaderOptions,
  Issuer,
  IssuerInput,
  LineItem,
  LineItemInput,
  Receiver,
  ReceiverInput,
  ReceiptReference,
  ReceiptReferenceInput,
  Reference,
  ReferenceInput,
  Transport,
  TransportInput,
} from '../model/document'
import { toSiiRut } from '../model/rut'
import { assertMaxLength, sanitizeText } from '../text/sanitize'
import { chileDate, toIsoDate } from '../time/chile'
import { calculateLineAmount, calculateTotals } from '../totals/calculate'

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
  NombreChofer: 30,
  DirDest: 70,
  CmnaDest: 20,
  CiudadDest: 20,
} as const

type LimitedField = keyof typeof FIELD_LIMITS

/**
 * EN: Options of `createDocument`.
 * ES: Opciones de `createDocument`.
 */
export type CreateDocumentOptions = {
  /** EN: Clock for the default issue date (tests). ES: Reloj para la fecha de emisión por defecto (tests). */
  readonly now?: Date
}

// Sanitizes a text field, enforces its schema limit and returns undefined for empty optionals.
const text = (value: string | undefined, field: LimitedField): string | undefined => {
  if (value === undefined) return undefined
  const clean = sanitizeText(value)
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

const compact = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T

const normalizeIssuer = (input: IssuerInput): Issuer => {
  const commune = requiredText(input.commune, 'CmnaOrigen', 'issuer.commune')
  return compact({
    rut: toSiiRut(input.rut, 'issuer.rut'),
    businessName: requiredText(input.businessName, 'RznSoc', 'issuer.businessName'),
    businessActivity: requiredText(input.businessActivity, 'GiroEmis', 'issuer.businessActivity'),
    activityCode: input.activityCode,
    phone: input.phone,
    email: input.email,
    branch: text(input.branch, 'Sucursal'),
    siiBranchCode: input.siiBranchCode,
    address: requiredText(input.address, 'DirOrigen', 'issuer.address'),
    commune,
    city: text(input.city, 'CiudadOrigen') ?? commune,
    salespersonCode: text(input.salespersonCode, 'CdgVendedor'),
  })
}

const FINAL_CONSUMER: Receiver = {
  rut: toSiiRut(FINAL_CONSUMER_RUT),
  businessName: 'Consumidor Final',
  address: 'Sin Direccion',
  commune: 'Santiago',
}

const normalizeReceiver = (input: ReceiverInput | undefined, receipt: boolean): Receiver => {
  if (input === undefined) {
    if (receipt) return FINAL_CONSUMER
    throw new DteError('MISSING_FIELD', { field: 'receiver' })
  }
  const address = text(input.address, 'DirRecep')
  const commune = text(input.commune, 'CmnaRecep')
  if (!receipt && address === undefined) throw new DteError('MISSING_FIELD', { field: 'receiver.address' })
  if (!receipt && commune === undefined) throw new DteError('MISSING_FIELD', { field: 'receiver.commune' })
  return compact({
    rut: toSiiRut(input.rut, 'receiver.rut'),
    internalCode: text(input.internalCode, 'CdgIntRecep'),
    businessName: requiredText(input.businessName, 'RznSocRecep', 'receiver.businessName'),
    businessActivity: text(input.businessActivity, 'GiroRecep'),
    contact: text(input.contact, 'Contacto'),
    email: input.email,
    address,
    commune,
    city: text(input.city, 'CiudadRecep'),
    postalAddress: text(input.postalAddress, 'DirPostal'),
    postalCommune: text(input.postalCommune, 'CmnaPostal'),
    postalCity: text(input.postalCity, 'CiudadPostal'),
  })
}

const normalizeItem = (input: LineItemInput, index: number, type: DocumentType): LineItem => {
  const path = `items[${index}]`
  const quantity = finiteNumber(input.quantity, `${path}.quantity`)
  const unitPrice = finiteNumber(input.unitPrice, `${path}.unitPrice`)
  const discountPercent = finiteNumber(input.discountPercent, `${path}.discountPercent`)
  const decimals = input.unitPriceDecimals
  if (decimals !== undefined && !(Number.isInteger(decimals) && decimals >= 0 && decimals <= 6))
    throw new DteError('INVALID_OPTION', { field: `${path}.unitPriceDecimals` })
  const surchargePercent = finiteNumber(input.surchargePercent, `${path}.surchargePercent`)
  const computed = calculateLineAmount({ quantity, unitPrice, discountPercent, surchargePercent })
  const settledDocumentType = text(input.settledDocumentType, 'TpoDocLiq')
  if (type === 43 && settledDocumentType === undefined)
    throw new DteError('MISSING_FIELD', { field: `${path}.settledDocumentType` })
  const exemptIndicator = input.exemptIndicator ?? (input.exempt || isExemptType(type) ? 1 : undefined)
  return compact({
    lineNumber: index + 1,
    codes: input.codes,
    settledDocumentType,
    exemptIndicator,
    name: requiredText(input.name, 'NmbItem', `${path}.name`),
    description: text(input.description, 'DscItem'),
    referenceQuantity: finiteNumber(input.referenceQuantity, `${path}.referenceQuantity`),
    referenceUnit: text(input.referenceUnit, 'UnmdRef'),
    referencePrice: finiteNumber(input.referencePrice, `${path}.referencePrice`),
    quantity,
    unit: text(input.unit, 'UnmdItem'),
    unitPrice,
    unitPriceDecimals: unitPrice === undefined ? undefined : decimals,
    discountPercent,
    discountAmount: computed.discountAmount > 0 ? computed.discountAmount : undefined,
    surchargePercent,
    surchargeAmount: computed.surchargeAmount > 0 ? computed.surchargeAmount : undefined,
    additionalTaxCodes: input.additionalTaxCodes,
    amount: finiteNumber(input.amount, `${path}.amount`) ?? computed.amount,
  })
}

const normalizeReference = (input: ReferenceInput, index: number): Reference =>
  compact({
    lineNumber: index + 1,
    documentType: input.documentType,
    global: input.global ? (true as const) : undefined,
    folio: String(input.folio),
    otherRut: input.otherRut === undefined ? undefined : toSiiRut(input.otherRut, `references[${index}].otherRut`),
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

const normalizeAdjustment = (input: GlobalAdjustmentInput, index: number): GlobalAdjustment =>
  compact({
    lineNumber: index + 1,
    kind: input.kind,
    valueType: input.valueType,
    value: input.value,
    description: text(input.description, 'GlosaDR'),
    exemptIndicator: input.exemptIndicator,
  })

const normalizeCommission = (input: CommissionLineInput, index: number): CommissionLine =>
  compact({
    lineNumber: index + 1,
    kind: input.kind,
    description: requiredText(input.description, 'Glosa', `commissions[${index}].description`),
    rate: input.rate,
    netValue: input.netValue,
    exemptValue: input.exemptValue,
    vatValue: input.vatValue,
  })

const normalizeTransport = (input: TransportInput | undefined): Transport | undefined =>
  input === undefined
    ? undefined
    : compact({
        licensePlate: text(input.licensePlate, 'Patente'),
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
      })

/**
 * EN: Builds a normalized `Document` from caller input: validates type, folio and dates, normalizes RUTs with rut.ts,
 * sanitizes text and enforces schema lengths (fails early instead of letting the SII reject the whole envelope),
 * numbers lines, computes amounts and totals, applies receipt defaults (final consumer, `IndServicio=3`) and sets
 * `MntBruto=1` when prices include VAT. Pure: same input, same output.
 * ES: Construye un `Document` normalizado desde la entrada: valida tipo, folio y fechas, normaliza RUT con rut.ts,
 * sanitiza textos y exige los largos del esquema (falla temprano en vez de dejar que el SII rechace el sobre entero),
 * numera líneas, calcula montos y totales, aplica los defaults de boleta (consumidor final, `IndServicio=3`) y fija
 * `MntBruto=1` cuando los precios incluyen IVA. Pura: misma entrada, misma salida.
 * @throws {DteError} EN: `INVALID_DOCUMENT_TYPE`, `INVALID_FOLIO`, `INVALID_DATE`, `INVALID_RUT`, `MISSING_FIELD`, `FIELD_TOO_LONG`, `INVALID_AMOUNT`; `INVALID_OPTION` for `references` on a receipt or `receiptReferences` on any other type. ES: los mismos códigos; `INVALID_OPTION` por `references` en una boleta o `receiptReferences` en cualquier otro tipo.
 */
export const createDocument = (input: DocumentInput, options: CreateDocumentOptions = {}): Document => {
  if (!isDocumentType(input.type)) throw new DteError('INVALID_DOCUMENT_TYPE', { type: input.type })
  if (!Number.isInteger(input.folio) || input.folio <= 0) throw new DteError('INVALID_FOLIO', { folio: input.folio })
  const type = input.type
  const receipt = isReceipt(type)
  const issueDate = input.issueDate === undefined ? chileDate(options.now) : toIsoDate(input.issueDate, 'issueDate')
  const issuer = normalizeIssuer(input.issuer)
  const receiver = normalizeReceiver(input.receiver, receipt)
  if (input.items.length === 0) throw new DteError('MISSING_FIELD', { field: 'items' })
  const items = input.items.map((item, index) => normalizeItem(item, index, type))
  // A receipt's `Referencia` has no date: the invoice shape would fail the receipts schema, and the other way round.
  if (receipt && (input.references ?? []).length > 0) throw new DteError('INVALID_OPTION', { field: 'references' })
  if (!receipt && (input.receiptReferences ?? []).length > 0)
    throw new DteError('INVALID_OPTION', { field: 'receiptReferences' })
  const references = (input.references ?? []).map(normalizeReference)
  const receiptReferences = (input.receiptReferences ?? []).map(normalizeReceiptReference)
  const globalAdjustments = (input.globalAdjustments ?? []).map(normalizeAdjustment)
  const commissions = (input.commissions ?? []).map(normalizeCommission)
  const transport = normalizeTransport(input.transport)
  const totals =
    input.totals ??
    calculateTotals(items, {
      type,
      pricesIncludeVat: input.pricesIncludeVat,
      vatRate: VAT_RATE,
      globalAdjustments,
      withholdVat: input.withholdVat,
    })
  const headerOptions: HeaderOptions = compact({
    ...input.options,
    serviceIndicator: input.options?.serviceIndicator ?? (receipt ? SERVICE_INDICATORS.salesAndServices : undefined),
    grossAmounts:
      input.options?.grossAmounts ??
      (input.pricesIncludeVat && !receipt && (totals.netAmount ?? 0) > 0 ? 1 : undefined),
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
      transport,
      totals,
    }),
    items,
    subtotals: input.subtotals ?? [],
    globalAdjustments,
    references,
    receiptReferences,
    commissions,
  }
}
