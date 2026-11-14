import { FINAL_CONSUMER_RUT, SERVICE_INDICATORS, TRANSFER_TYPES, VAT_RATE } from '../catalogs/codes'
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
import { calculateLineAmount, calculateTotals, commissionVat } from '../totals/calculate'

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
} as const

type LimitedField = keyof typeof FIELD_LIMITS

// `maxOccurs` of the SII schema: the detail lines of a settlement invoice, and the commission lines of any document.
const MAX_SETTLEMENT_LINES = 60
const MAX_COMMISSIONS = 20

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
const NOT_IN_RECEIPT_LINE = ['referenceQuantity', 'referenceUnit', 'referencePrice', 'additionalTaxCodes'] as const
// A receipt's `IndExe` is 1, 2 or 6, and its `IndMntNeto` is 2.
const RECEIPT_EXEMPT_INDICATORS: readonly unknown[] = [undefined, 1, 2, 6]

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

// `Liquidacion` declares less than `Documento`: no transport, no global or line discounts and surcharges, no `RUTOtr`
// in a reference, no `MontoNF`. Each of these would be written under it and fail the schema.
const assertSettlement = (input: DocumentInput): void => {
  if (input.items.length > MAX_SETTLEMENT_LINES) refuse('items')
  if ((input.globalAdjustments ?? []).length > 0) refuse('globalAdjustments')
  if (input.transport !== undefined) refuse('transport')
  input.items.forEach((item, index) => {
    if (item.discountPercent !== undefined) refuse(`items[${index}].discountPercent`)
    if (item.surchargePercent !== undefined) refuse(`items[${index}].surchargePercent`)
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

const normalizeReceiver = (input: ReceiverInput | undefined, type: DocumentType): Receiver => {
  const receipt = isReceipt(type)
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
    // `Liquidacion` asks the receiver for `GiroRecep`; `Documento` leaves it optional.
    businessActivity:
      type === 43
        ? requiredText(input.businessActivity, 'GiroRecep', 'receiver.businessActivity')
        : text(input.businessActivity, 'GiroRecep'),
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
    rate: input.rate,
    netValue: netValue ?? 0,
    exemptValue: exemptValue ?? 0,
    vatValue: finiteNumber(input.vatValue, `${path}.vatValue`) ?? (commissionVat(netValue ?? 0) || undefined),
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
      })

/**
 * EN: Builds a normalized `Document` from caller input: validates type, folio and dates, normalizes RUTs with rut.ts,
 * sanitizes text and enforces schema lengths (fails early instead of letting the SII reject the whole envelope),
 * numbers lines, computes amounts and totals, applies receipt defaults (final consumer, `IndServicio=3`) and sets
 * `MntBruto=1` when prices include VAT. Commission lines are completed (the value a line lacks is zero, and its VAT
 * is its net value by the VAT rate when it brings none), summed into the totals, where their VAT is the VAT rate by
 * their total net value unless a line states its own, and taken off the total. A settlement
 * invoice (43) is held to what its root, `Liquidacion`, declares: no transport, no global or line discounts and
 * surcharges, no `otherRut` in a reference, no non-billable amount in its totals, none of the `IdDoc` options only
 * `Documento` declares, a receiver with its business activity and at most 60 lines. A receipt (39, 41) is held to
 * what its own schema, `EnvioBOLETA_v11.xsd`, declares: no transport, no commissions, no withholding, the `IdDoc`
 * options `serviceIndicator`, `netAmountsIndicator` (2), `billingPeriod`, `dueDate` and `paymentMedium` and no
 * other, totals without a rate, own or third-party VAT, withholdings or commissions, and lines without a reference
 * quantity, unit or price, without additional tax codes and with an exempt indicator of 1, 2 or 6. What its issuer
 * and receiver carry that is not written on a receipt is left out, not refused: the issuer's branch name, phone,
 * e-mail, activity code and salesperson and the receiver's business activity, which a receipt has no element for,
 * and the receiver's e-mail and postal address. `softwareProviderRut` (`RUTProvSW`) and `netAmountsIndicator`
 * (`IndMntNeto`) are a receipt's alone. Pure: same input, same output.
 * ES: Construye un `Document` normalizado desde la entrada: valida tipo, folio y fechas, normaliza RUT con rut.ts,
 * sanitiza textos y exige los largos del esquema (falla temprano en vez de dejar que el SII rechace el sobre entero),
 * numera líneas, calcula montos y totales, aplica los defaults de boleta (consumidor final, `IndServicio=3`) y fija
 * `MntBruto=1` cuando los precios incluyen IVA. Las líneas de comisión se completan (el valor que falta va en cero, y
 * su IVA es su valor neto por la tasa de IVA cuando no lo trae), se suman en los totales, donde su IVA es la tasa de
 * IVA por su valor neto total salvo que una línea declare el suyo, y se restan del total. Una
 * liquidación factura (43) se atiene a lo que declara su raíz, `Liquidacion`: sin transporte, sin descuentos ni
 * recargos globales o por línea, sin `otherRut` en una referencia, sin monto no facturable en sus totales, sin las
 * opciones de `IdDoc` que solo declara `Documento`, con el giro del receptor y con 60 líneas como máximo. Una boleta
 * (39, 41) se atiene a lo que declara su propio esquema, `EnvioBOLETA_v11.xsd`: sin transporte, sin comisiones, sin
 * retención, con las opciones de `IdDoc` `serviceIndicator`, `netAmountsIndicator` (2), `billingPeriod`, `dueDate` y
 * `paymentMedium` y ninguna otra, con totales sin tasa, IVA propio o de terceros, retenciones ni comisiones, y con
 * líneas sin cantidad, unidad ni precio de referencia, sin códigos de impuesto adicional y con indicador de exención
 * 1, 2 o 6. Lo que su emisor y su receptor traen y no se escribe en una boleta queda fuera, sin rechazo: la
 * sucursal, el teléfono, el correo, el código de actividad y el vendedor del emisor y el giro del receptor, para los
 * que la boleta no tiene elemento, y el correo y la dirección postal del receptor. `softwareProviderRut`
 * (`RUTProvSW`) y `netAmountsIndicator` (`IndMntNeto`) son solo de la boleta. Pura: misma entrada, misma salida.
 * @throws {DteError} EN: `INVALID_DOCUMENT_TYPE`, `INVALID_FOLIO`, `INVALID_DATE`, `INVALID_RUT`, `MISSING_FIELD` (also a commission line with neither a net nor an exempt value, and a settlement invoice whose receiver has no `businessActivity`), `FIELD_TOO_LONG`, `INVALID_AMOUNT`; `INVALID_TIME` for a `transport.departureTime` that is not `HH:MM:SS` or `HH:MM`; `INVALID_OPTION` for `references` on a receipt, `receiptReferences` on any other type, an `options.transferType` outside 1 to 9, more than 20 `commissions`, a `settledDocumentType` on a type other than 43, on a 43 whatever `Liquidacion` does not declare, on a receipt whatever its schema does not declare, and an `options.netAmountsIndicator` or a `softwareProviderRut` on a type that is not a receipt, with the field in `details.field`. ES: los mismos códigos; `MISSING_FIELD` también por una línea de comisión sin valor neto ni exento y por una liquidación factura cuyo receptor no trae `businessActivity`; `INVALID_TIME` por un `transport.departureTime` que no es `HH:MM:SS` ni `HH:MM`; `INVALID_OPTION` por `references` en una boleta, `receiptReferences` en cualquier otro tipo, un `options.transferType` fuera de 1 a 9, más de 20 `commissions`, un `settledDocumentType` en un tipo distinto del 43, en un 43 lo que `Liquidacion` no declara, en una boleta lo que su esquema no declara, y un `options.netAmountsIndicator` o un `softwareProviderRut` en un tipo que no es boleta, con el campo en `details.field`.
 */
export const createDocument = (input: DocumentInput, options: CreateDocumentOptions = {}): Document => {
  if (!isDocumentType(input.type)) throw new DteError('INVALID_DOCUMENT_TYPE', { type: input.type })
  if (!Number.isInteger(input.folio) || input.folio <= 0) throw new DteError('INVALID_FOLIO', { folio: input.folio })
  const type = input.type
  const receipt = isReceipt(type)
  const issueDate = input.issueDate === undefined ? chileDate(options.now) : toIsoDate(input.issueDate, 'issueDate')
  const issuer = normalizeIssuer(input.issuer)
  const receiver = normalizeReceiver(input.receiver, type)
  if (input.items.length === 0) throw new DteError('MISSING_FIELD', { field: 'items' })
  if (type === 43) assertSettlement(input)
  if (receipt) assertReceipt(input)
  // `IndMntNeto` and `RUTProvSW` are a receipt's: no other document declares them.
  else if (input.options?.netAmountsIndicator !== undefined) refuse('options.netAmountsIndicator')
  else if (input.softwareProviderRut !== undefined) refuse('softwareProviderRut')
  const softwareProviderRut =
    input.softwareProviderRut === undefined ? undefined : toSiiRut(input.softwareProviderRut, 'softwareProviderRut')
  if ((input.commissions ?? []).length > MAX_COMMISSIONS) refuse('commissions')
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
  // The schema admits `IndTraslado` 1 to 9; the three types Res. Ex. 144/2026 names wait for a code it admits.
  const transferType = input.options?.transferType
  if (transferType !== undefined && !Object.values(TRANSFER_TYPES).includes(transferType))
    throw new DteError('INVALID_OPTION', { field: 'options.transferType' })
  const totals =
    input.totals ??
    calculateTotals(items, {
      type,
      pricesIncludeVat: input.pricesIncludeVat,
      vatRate: VAT_RATE,
      globalAdjustments,
      withholdVat: input.withholdVat,
      // The lines as the caller gave them, checked above: the summary's VAT depends on whether a line states its own.
      commissions: input.commissions,
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
      softwareProviderRut,
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
