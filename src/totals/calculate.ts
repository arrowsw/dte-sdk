import { ADDITIONAL_TAXES, isAdditionalTaxCode, type AdditionalTaxCode } from '../catalogs/additional-taxes'
import { VAT_RATE, WITHHOLDING_TAX_CODES, type ExemptIndicator } from '../catalogs/codes'
import { carriesDepositGuarantee, isExport, isReceipt, type DocumentType } from '../catalogs/document-types'
import { DteError } from '../errors'
import type {
  AdditionalTaxInput,
  CommissionLineInput,
  GlobalAdjustment,
  LineItem,
  Totals,
  Withholding,
} from '../model/document'
import { divide, held, pow10, unitsOf, ZERO } from './exact'
import { calculateExportTotals } from './export'

/**
 * EN: Inputs of a line amount.
 * ES: Entradas del monto de una línea.
 */
export type LineAmountInput = {
  /** EN: Quantity (default 1). ES: `QtyItem` — Cantidad (por defecto 1). */
  readonly quantity?: number
  /** EN: Unit price (default 0). ES: `PrcItem` — Precio unitario (por defecto 0). */
  readonly unitPrice?: number
  /** EN: Discount percent. ES: `DescuentoPct` — Porcentaje de descuento. */
  readonly discountPercent?: number
  /** EN: Surcharge percent. ES: `RecargoPct` — Porcentaje de recargo. */
  readonly surchargePercent?: number
}

/**
 * EN: Result of a line amount computation, integer pesos.
 * ES: Resultado del cálculo del monto de una línea, enteros en pesos.
 */
export type LineAmount = {
  /** EN: `round(quantity × unitPrice)`. ES: `round(cantidad × precio)`. */
  readonly base: number
  /** EN: Discount in pesos. ES: `DescuentoMonto` — Descuento en pesos. */
  readonly discountAmount: number
  /** EN: Surcharge in pesos. ES: `RecargoMonto` — Recargo en pesos. */
  readonly surchargeAmount: number
  /** EN: `base − discount + surcharge`. ES: `MontoItem` — `base − descuento + recargo`. */
  readonly amount: number
}

/**
 * EN: Computes a detail line amount with per-line rounding (the SII compares `MontoItem` against `QtyItem × PrcItem`),
 * exactly: the quantity and the price are taken with the six decimals the schema holds and the percentages with two,
 * the base is their product rounded half away from zero to a whole peso, and the discount and the surcharge are each
 * their percent of that base rounded the same way. Formato DTE 2.5 does not say how a line is rounded: each percent is
 * taken of the base already rounded to a whole peso, not of the unrounded product. The arithmetic is over decimal
 * digits, so 9.2 % of 375 is 34.5 and rounds to 35, where binary floating point makes it 34.49999999999999. It works
 * out a line from its numbers alone: `createDocument` writes a line that is not a sale (`IndExe` 4 or 5), and every
 * line of a credit note that corrects a text, with an amount of zero (Formato DTE 2.5, field 38 of the detail), which
 * this function does not know.
 * ES: Calcula el monto de una línea con redondeo por línea (el SII compara `MontoItem` contra `QtyItem × PrcItem`), con
 * exactitud: la cantidad y el precio se toman con los seis decimales que admite el esquema y los porcentajes con dos,
 * la base es su producto redondeado, la mitad lejos de cero, a un peso entero, y el descuento y el recargo son cada uno
 * su porcentaje de esa base redondeado igual. El Formato DTE 2.5 no dice cómo se redondea una línea: cada porcentaje
 * se toma de la base ya redondeada a un peso entero, no del producto sin redondear. La aritmética es sobre dígitos
 * decimales, así que el 9,2 % de 375 es 34,5 y redondea a 35, donde el punto flotante binario da 34,49999999999999.
 * Calcula una línea solo con sus números: `createDocument` escribe una línea que no es venta (`IndExe` 4 o 5), y cada
 * línea de una nota de crédito que corrige un texto, con monto cero (Formato DTE 2.5, campo 38 del detalle), lo que
 * esta función no sabe.
 * @param input EN: the quantity, the price and the percentages. ES: la cantidad, el precio y los porcentajes.
 * @returns EN: the base, the discount, the surcharge and the amount, in whole pesos. ES: la base, el descuento, el recargo y el monto, en pesos enteros.
 * @throws {DteError} EN: `INVALID_AMOUNT` for an input that is not finite or is 10^21 or more, and for an amount with more digits than a number holds, which would be written as another one, with it in `details.value`. ES: `INVALID_AMOUNT` ante una entrada que no es finita o es 10^21 o más, y ante un monto con más dígitos de los que guarda un número, que se escribiría como otro, con él en `details.value`.
 */
export const calculateLineAmount = ({
  quantity = 1,
  unitPrice = 0,
  discountPercent = 0,
  surchargePercent = 0,
}: LineAmountInput): LineAmount => {
  // Quantity and price with six decimals each: their product has twelve, rounded to a whole peso.
  const base = divide(unitsOf(quantity, 6) * unitsOf(unitPrice, 6), pow10(12))
  // A whole base by a percent with two decimals, over 100: a whole peso is that over 10^4.
  const share = (percent: number): bigint => (percent > 0 ? divide(base * unitsOf(percent, 2), pow10(4)) : ZERO)
  const discount = share(discountPercent)
  const surcharge = share(surchargePercent)
  return {
    base: held(base, 0),
    discountAmount: held(discount, 0),
    surchargeAmount: held(surcharge, 0),
    amount: held(base - discount + surcharge, 0),
  }
}

/**
 * EN: Options of `calculateTotals`.
 * ES: Opciones de `calculateTotals`.
 */
export type TotalsOptions = {
  /** EN: Document type (drives receipts, withholding and the deposit guarantee). ES: Tipo de documento (decide boletas, retención y la garantía por depósito de envases, `GrntDep`). */
  readonly type: DocumentType
  /** EN: Line amounts include VAT. ES: Los montos de línea incluyen IVA. */
  readonly pricesIncludeVat?: boolean
  /** EN: VAT rate percent (default 19). ES: Tasa de IVA en porcentaje (por defecto 19). */
  readonly vatRate?: number
  /** EN: Global discounts and surcharges, applied in order, each value taken with two decimals: one in percent is its percent of the running amount, taken as a whole peso, and one in pesos its value, rounded half away from zero to a whole peso over decimal digits. ES: `DscRcgGlobal` — Descuentos y recargos globales, aplicados en orden, cada valor tomado con dos decimales: uno en porcentaje es su porcentaje del monto que va quedando, tomado como un peso entero, y uno en pesos su valor, redondeados la mitad lejos de cero a un peso entero sobre dígitos decimales. */
  readonly globalAdjustments?: readonly GlobalAdjustment[]
  /** EN: Withhold the whole VAT (default: true for purchase invoices). ES: Retener todo el IVA (por defecto: true en facturas de compra, 46). */
  readonly withholdVat?: boolean
  /** EN: Commission and other charge lines: summed into the summary and taken off the total; the summary's VAT is the VAT rate by their total net value, rounded once, unless a line states its `vatValue`, and then it is the sum of the lines' VAT. ES: `Comisiones` — Líneas de comisiones y otros cargos: se suman en `Totales/Comisiones` y se restan del total; el IVA del resumen es la tasa de IVA por su valor neto total, redondeado una vez, salvo que una línea declare su `vatValue`, y entonces es la suma del IVA de las líneas. */
  readonly commissions?: readonly Pick<CommissionLineInput, 'netValue' | 'exemptValue' | 'vatValue'>[]
  /** EN: An export document without payment (`FmaPagExp` 21), whose total is zero; read only on an export document. ES: Un documento de exportación sin pago (`FmaPagExp` 21), cuyo total es cero; solo se lee en un documento de exportación. */
  readonly withoutPayment?: boolean
  /** EN: The rate or the amount of an additional tax or withholding the lines carry (`CodImpAdic`), at most one entry per code, each for a code a line carries. A code is worked out as Formato DTE 2.5 defines `MontoImp` (field 117): its rate by the sum of the lines that carry it, rounded once, half away from zero, over decimal digits; the rate is the caller's or, without one, the one the table of codes gives (`ADDITIONAL_TAXES`). The caller gives the amount of a code whose amount is not the rate by its lines (the VAT on a trading margin, 14 and 50, the specific taxes on diesel and gasoline, 28 and 35, and the advance VAT on slaughter, 17, over its own base) and of one whose rate neither gives; with an amount, a rate is needed too, written as `TasaImp`, except on a specific tax (28, 35, 51, 52), whose rate field 116 lets out ("En el caso de impuesto específicos se puede omitir"). A tax that works out to zero is not written (field 117 c, "Valor numérico en otros casos > 0"), and a code whose lines add up to zero needs neither rate nor amount; its lines keep the code. Code 15 is not given while the whole VAT is withheld (`withholdVat`), which works it out. ES: `ImptoReten` — La tasa o el monto de un impuesto adicional o retención que llevan las líneas (`CodImpAdic`), a lo más una entrada por código, cada una de un código que lleva una línea. Un código se calcula como define `MontoImp` el Formato DTE 2.5 (campo 117): su tasa por la suma de las líneas que lo llevan, redondeada una vez, la mitad lejos de cero, sobre dígitos decimales; la tasa es la del llamador o, sin ella, la que da la tabla de códigos (`ADDITIONAL_TAXES`). El llamador entrega el monto de un código cuyo monto no es la tasa por sus líneas (el IVA de margen de comercialización, 14 y 50, los impuestos específicos al diésel y a la gasolina, 28 y 35, y el IVA anticipado faenamiento carne, 17, sobre su propia base) y el de uno cuya tasa ninguno da; con un monto hace falta también una tasa, que se escribe como `TasaImp`, salvo en un impuesto específico (28, 35, 51, 52), cuya tasa el campo 116 permite omitir ("En el caso de impuesto específicos se puede omitir"). Un impuesto que resulta cero no se escribe (campo 117 c, "Valor numérico en otros casos > 0"), y un código cuyas líneas suman cero no necesita tasa ni monto; sus líneas conservan el código. El código 15 no se entrega mientras se retiene todo el IVA (`withholdVat`), que lo calcula. */
  readonly additionalTaxes?: readonly AdditionalTaxInput[]
}

type Bases = {
  readonly affected: number
  readonly exempt: number
  readonly nonBillable: number
  readonly guarantee: number
}

// Formato DTE 2.5: `MontoNF` is the lines with `IndExe` 2 less the lines with `IndExe` 6 (field 125), and `GrntDep` the
// lines with `IndExe` 3 (field 120). A line that is not a sale (4) or is to be deducted (5) is in no total.
const sumBases = (items: readonly Pick<LineItem, 'amount' | 'exemptIndicator'>[]): Bases =>
  items.reduce<Bases>(
    (acc, item) => {
      switch (item.exemptIndicator) {
        case undefined:
          return { ...acc, affected: acc.affected + item.amount }
        case 1:
          return { ...acc, exempt: acc.exempt + item.amount }
        case 2:
          return { ...acc, nonBillable: acc.nonBillable + item.amount }
        case 3:
          return { ...acc, guarantee: acc.guarantee + item.amount }
        case 6:
          return { ...acc, nonBillable: acc.nonBillable - item.amount }
        default:
          return acc
      }
    },
    { affected: 0, exempt: 0, nonBillable: 0, guarantee: 0 },
  )

/**
 * EN: The share of a global adjustment, in whole pesos: its percent, with two decimals, of the amount it applies to,
 * or its value, rounded half away from zero over decimal digits, as a line's share is, so 9.2 % of 375 is 34.5 and
 * rounds to 35. Internal: `calculateTotals` and the certification simulation share it.
 * ES: La parte de un ajuste global, en pesos enteros: su porcentaje, con dos decimales, del monto al que se aplica, o
 * su valor, redondeados la mitad lejos de cero sobre dígitos decimales, como la parte de una línea, así que el 9,2 % de
 * 375 es 34,5 y redondea a 35. Interno: lo comparten `calculateTotals` y la simulación de certificación.
 * @throws {DteError} EN: `INVALID_AMOUNT` for an amount or a value that is not finite or is 10^21 or more, and for a share with more digits than a number holds, with it in `details.value`. ES: `INVALID_AMOUNT` ante un monto o un valor que no es finito o es 10^21 o más, y ante una parte con más dígitos de los que guarda un número, con ella en `details.value`.
 */
export const adjustmentShare = (amount: number, adjustment: Pick<GlobalAdjustment, 'valueType' | 'value'>): number =>
  held(
    adjustment.valueType === 'percent'
      ? divide(unitsOf(amount, 0) * unitsOf(adjustment.value, 2), pow10(4))
      : divide(unitsOf(adjustment.value, 2), pow10(2)),
    0,
  )

// The base a global adjustment applies to, by its `IndExeDR`.
type AdjustedBase = 'affected' | 'exempt' | 'nonBillable'
const adjustedBaseOf = (adjustment: GlobalAdjustment): AdjustedBase =>
  adjustment.exemptIndicator === 1 ? 'exempt' : adjustment.exemptIndicator === 2 ? 'nonBillable' : 'affected'

const applyAdjustments = (bases: Bases, adjustments: readonly GlobalAdjustment[]): Bases =>
  adjustments.reduce<Bases>((acc, adjustment) => {
    const key = adjustedBaseOf(adjustment)
    const delta = adjustmentShare(acc[key], adjustment)
    const signed = adjustment.kind === 'discount' ? -delta : delta
    return { ...acc, [key]: acc[key] + signed }
  }, bases)

// Rounds half away from zero, so the VAT of a negative amount mirrors the VAT of the same amount when positive.
const roundSigned = (value: number): number => (value < 0 ? 0 - Math.round(-value) : Math.round(value))

/**
 * EN: VAT of a commission or other charge that carries none of its own: its net value by the VAT rate, rounded.
 * ES: `ValComIVA` — IVA de una comisión u otro cargo que no trae el suyo: su valor neto por la tasa de IVA, redondeado.
 */
export const commissionVat = (netValue: number, vatRate: number = VAT_RATE): number =>
  roundSigned((netValue * vatRate) / 100)

type CommissionSums = { readonly netValue: number; readonly exemptValue: number; readonly vatValue: number }

// The SII checks the VAT of the summary against the VAT rate by the summary's net value (validation 38 of its "Nuevas
// validaciones a la IECV, DTE y DJ 3327 y 3328"), so it is rounded once, over the total, and may be a peso off the sum
// of the lines' VAT. Lines that state their VAT are added up instead: they state what the rate does not give.
const sumCommissions = (lines: NonNullable<TotalsOptions['commissions']>, vatRate: number): CommissionSums => {
  const netValue = lines.reduce((sum, line) => sum + (line.netValue ?? 0), 0)
  const exemptValue = lines.reduce((sum, line) => sum + (line.exemptValue ?? 0), 0)
  const stated = lines.some((line) => line.vatValue !== undefined)
  const vatValue = stated
    ? lines.reduce((sum, line) => sum + (line.vatValue ?? commissionVat(line.netValue ?? 0, vatRate)), 0)
    : commissionVat(netValue, vatRate)
  return { netValue, exemptValue, vatValue }
}

type TaxedItem = Pick<LineItem, 'amount' | 'exemptIndicator' | 'additionalTaxCodes'>

// The lines a global adjustment applies to, by its `IndExeDR` (Formato DTE 2.5, section D): the affected lines, the
// exempt ones (1), or the non-billable ones (2), which `MontoNF` sums with those of `IndExe` 6.
const ADJUSTED_LINES: Readonly<Record<AdjustedBase, readonly (ExemptIndicator | undefined)[]>> = {
  affected: [undefined],
  exempt: [1],
  nonBillable: [2, 6],
}

// Formato DTE 2.5, field 117: `MontoImp` is the rate by the sum of the lines with the code "excepto Diesel, Gasolina,
// margen de comercialización e 'Iva anticipado faenamiento carne'", the last over the slaughter base instead.
const NOT_FROM_LINES: readonly number[] = [14, 17, 28, 35, 50]
// `TasaImp` is a `PctType` of `SiiTypes_v10.xsd`, from 0.01 to 999.99, here in hundredths.
const MIN_RATE = BigInt(1)
const MAX_RATE = BigInt(99999)

type LineTax = {
  readonly taxCode: AdditionalTaxCode
  readonly firstLine: number
  readonly base: number
  readonly indicators: readonly (ExemptIndicator | undefined)[]
}

// The type whose codes a document takes. The table of codes (Formato DTE 2.5, section 4, "Documentos en que se aplica")
// names the invoices, purchase invoices and their notes; the field table marks `CodImpAdic` (page 41) and `ImptoReten`
// (page 30) conditional on an exempt invoice (34) and optional on a dispatch guide (52), which take the codes of a sale
// invoice (33). It marks `CodImpAdic` 0, not applicable, on a settlement invoice (43), which the table does not name
// either, and neither names a receipt or an export document.
const tableTypeOf = (type: DocumentType): DocumentType => (type === 34 || type === 52 ? 33 : type)

// The codes the lines carry, in the order they first appear, each with the sum of the lines that carry it. Code 15 is
// the withholding of the whole VAT when the totals withhold it, on any type, as the lines that bring none get it; beside
// it no other code is taken.
const lineTaxes = (items: readonly TaxedItem[], type: DocumentType, withholdVat: boolean): readonly LineTax[] => {
  const found = new Map<number, LineTax>()
  const tableType = tableTypeOf(type)
  items.forEach((item, index) => {
    for (const taxCode of item.additionalTaxCodes ?? []) {
      const refuse = (field: string): never => {
        throw new DteError('INVALID_OPTION', { field, taxCode })
      }
      const line = `items[${index}].additionalTaxCodes`
      if (withholdVat && taxCode === WITHHOLDING_TAX_CODES.totalVatWithholding) continue
      if (!isAdditionalTaxCode(taxCode) || !ADDITIONAL_TAXES[taxCode].documents.includes(tableType)) return refuse(line)
      if (withholdVat) refuse('withholdVat')
      const tax = ADDITIONAL_TAXES[taxCode]
      // Field 124 takes off the total the VAT withheld "en caso de facturas de compra": a withholding on a sale (codes
      // 46 and 53, which the table gives a 33) has no side of the total the format states.
      if (tax.kind === 'withholding' && !tax.documents.includes(46)) refuse(line)
      const known = found.get(taxCode)
      found.set(taxCode, {
        taxCode,
        firstLine: known?.firstLine ?? index,
        base: (known?.base ?? 0) + item.amount,
        indicators: [...(known?.indicators ?? []), item.exemptIndicator],
      })
    }
  })
  return [...found.values()]
}

type GivenTax = { readonly entry: AdditionalTaxInput; readonly index: number }

const givenTaxes = (
  given: unknown,
  carried: readonly LineTax[],
  withholdVat: boolean,
): ReadonlyMap<number, GivenTax> => {
  if (!Array.isArray(given)) throw new DteError('INVALID_OPTION', { field: 'additionalTaxes' })
  return (given as readonly unknown[]).reduce<Map<number, GivenTax>>((acc, value, index) => {
    const path = `additionalTaxes[${index}]`
    if (typeof value !== 'object' || value === null) throw new DteError('INVALID_OPTION', { field: path })
    const entry = value as AdditionalTaxInput
    const { taxCode, rate, amount } = entry
    if (withholdVat && taxCode === WITHHOLDING_TAX_CODES.totalVatWithholding)
      throw new DteError('INVALID_OPTION', { field: 'withholdVat', taxCode })
    if (acc.has(taxCode) || !carried.some((tax) => tax.taxCode === taxCode))
      throw new DteError('INVALID_OPTION', { field: `${path}.taxCode`, taxCode })
    if (rate !== undefined && !(typeof rate === 'number' && Number.isFinite(rate)))
      throw new DteError('INVALID_AMOUNT', { field: `${path}.rate`, taxCode })
    if (amount !== undefined && !(Number.isSafeInteger(amount) && amount > 0))
      throw new DteError('INVALID_AMOUNT', { field: `${path}.amount`, taxCode })
    return new Map([...acc, [taxCode, { entry, index }]])
  }, new Map<number, GivenTax>())
}

// Each code as `ImptoReten`: the amount given, or its rate by the sum of its lines, rounded once (field 117). A tax that
// works out to zero is none: field 117 c) asks for a value "> 0", and the line keeps its code. A specific tax given by
// its amount may leave out its rate (field 116, "En el caso de impuesto específicos se puede omitir"); every other code
// is written with it.
//
// Section D of the format says of the global discounts and surcharges that "Estos aumentan o disminuyen la base del
// impuesto", and that when "en la Zona de Detalle hayan ítems con distintos códigos de impuesto o retenciones, el campo
// 'tipo de valor' del descuento debe ser %". It says the base of a code changes, and how an adjustment must be written
// then, but not how a code's share of the adjustment is taken nor rounded: a tax is not worked out beside an adjustment
// that applies to one of its lines, and its amount is given instead.
const resolveTaxes = (
  carried: readonly LineTax[],
  options: TotalsOptions,
  withholdVat: boolean,
): readonly Withholding[] => {
  const given = givenTaxes(options.additionalTaxes ?? [], carried, withholdVat)
  // Formato DTE 2.5, field 10 of the header: `MntBruto` is "sólo para documentos sin impuestos adicionales".
  if (carried.length > 0 && options.pricesIncludeVat)
    throw new DteError('INVALID_OPTION', { field: 'pricesIncludeVat', taxCode: carried[0].taxCode })
  return carried.flatMap(({ taxCode, firstLine, base, indicators }): readonly Withholding[] => {
    const { entry, index } = given.get(taxCode) ?? {}
    const touching = (options.globalAdjustments ?? []).findIndex((adjustment) =>
      ADJUSTED_LINES[adjustedBaseOf(adjustment)].some((indicator) => indicators.includes(indicator)),
    )
    // Lines that add up to nothing, with no adjustment on them, give no tax whatever its rate.
    if (entry?.amount === undefined && base === 0 && touching < 0) return []
    const tax = ADDITIONAL_TAXES[taxCode]
    const rate = entry?.rate ?? tax.rate
    const units = rate === undefined ? undefined : unitsOf(rate, 2)
    if (units !== undefined && !(units >= MIN_RATE && units <= MAX_RATE))
      throw new DteError('INVALID_AMOUNT', {
        field: entry?.rate === undefined ? `items[${firstLine}].additionalTaxCodes` : `additionalTaxes[${index}].rate`,
        taxCode,
      })
    if (entry?.amount !== undefined) {
      if (units !== undefined) return [{ taxCode, rate: held(units, 2), amount: entry.amount }]
      if (tax.kind === 'specific') return [{ taxCode, amount: entry.amount }]
      throw new DteError('MISSING_FIELD', { field: `additionalTaxes[${index}].rate`, taxCode })
    }
    if (units === undefined || NOT_FROM_LINES.includes(taxCode))
      throw new DteError('MISSING_FIELD', { field: 'additionalTaxes', taxCode })
    if (touching >= 0) throw new DteError('INVALID_OPTION', { field: `globalAdjustments[${touching}]`, taxCode })
    const amount = held(divide(unitsOf(base, 0) * units, pow10(4)), 0)
    return amount === 0 ? [] : [{ taxCode, rate: held(units, 2), amount }]
  })
}

// Formato DTE 2.5, field 124: the additional, specific and advance taxes and the VAT on a margin add to the total; the
// VAT withheld comes off it.
const taxesTotal = (taxes: readonly Withholding[]): number =>
  taxes.reduce(
    (sum, { taxCode, amount }) =>
      ADDITIONAL_TAXES[taxCode as AdditionalTaxCode].kind === 'withholding' ? sum - amount : sum + amount,
    0,
  )

/**
 * EN: Computes `Totales` from detail lines: net, exempt, VAT (derived from the gross when `pricesIncludeVat`), the
 * non-billable amount, which is the lines with `IndExe` 2 less the lines with `IndExe` 6 and may be negative (Formato
 * DTE 2.5, field 125), the deposit guarantee for containers, the lines with `IndExe` 3 (field 120), withholding for
 * purchase invoices, the summary of commissions and other charges, and the total, which is net + exempt + VAT (left out
 * when withheld) + the deposit guarantee less those charges (field 124). A line with `IndExe` 4 or 5 is in no total,
 * and the guarantee is totalled only on a 33, 34, 56 or 61, the types the format gives `GrntDep` to. Each global
 * adjustment is applied to its base in order, as `createDocument` writes it: its value is taken with the two decimals
 * `ValorDR` holds and the amount it applies to as a whole peso, each rounded half away from zero over its decimal
 * digits, and its share, its percent of that amount or its value, is rounded half away from zero to a whole peso. So
 * 9.2 % of 375 is 35, where binary floating point makes it 34, a value of 0.495 is 0.50 and takes off 1, and a percent
 * of 0.004 is 0.00 and takes off nothing. Keys come out in schema order and zero sections are omitted, exactly as the
 * SII expects. On a settlement invoice (43) the net, the exempt amount, the VAT and the total keep their sign, so the
 * total may be zero or negative, and non-billable lines are not totalled, because `Liquidacion` declares no `MontoNF`.
 * An export document (110, 111, 112) has the totals of `calculateExportTotals`: its exempt amount and its total, in
 * its currency with four decimals. Each code of additional tax or withholding the lines carry (`CodImpAdic`) becomes
 * one `ImptoReten` in the order the codes first appear, worked out or given as `additionalTaxes` says (Formato DTE 2.5,
 * field 117), and the total adds the additional, specific and advance taxes and the VAT on a margin and takes off the
 * withholdings (field 124); a tax that works out to zero is not written. Code 15 on a document that withholds the whole
 * VAT is that withholding, on any type, whether the line brings it or gets it. Which codes a type takes rests on two
 * tables of the format: the table of codes (section 4, "Documentos en que se aplica") gives each code to invoices,
 * purchase invoices and their notes (33, 46, 56, 61); the field table marks `CodImpAdic` (page 41) and `ImptoReten`
 * (page 30) conditional on an exempt invoice (34) and optional on a dispatch guide (52), which take the codes the table
 * gives a 33, and marks `CodImpAdic` not applicable on a settlement invoice (43), where a code is refused as on a
 * receipt and an export document. A code is refused, besides, when it is a withholding on a sale (46, 53), whose side
 * of the total field 124 does not state, beside the whole VAT withheld, beside VAT-included prices (`MntBruto`, field
 * 10 of the header, "sólo para documentos sin impuestos adicionales"), and, when it is worked out from its lines,
 * beside a global adjustment that applies to one of them: section D says the adjustments "aumentan o disminuyen la
 * base del impuesto" and that, with "ítems con distintos códigos de impuesto o retenciones", their value "debe ser %",
 * but not how a code's share of one is taken nor rounded, so the caller gives that tax's amount.
 * ES: Calcula `Totales` desde las líneas: neto, exento, IVA (derivado del bruto con `pricesIncludeVat`), el monto no
 * facturable, que son las líneas con `IndExe` 2 menos las líneas con `IndExe` 6 y puede ser negativo (Formato DTE 2.5,
 * campo 125), la garantía por depósito de envases, las líneas con `IndExe` 3 (campo 120), la retención en facturas de
 * compra, el resumen de comisiones y otros cargos, y el total, que es neto + exento + IVA (sin el IVA si está retenido)
 * + la garantía por depósito de envases menos esos cargos (campo 124). Una línea con `IndExe` 4 o 5 no entra en ningún
 * total, y la garantía se totaliza solo en un 33, 34, 56 o 61, los tipos a los que el formato da `GrntDep`. Cada
 * ajuste global se aplica a su base en orden, como lo escribe `createDocument`: su valor se toma con los dos decimales
 * que admite `ValorDR` y el monto al que se aplica como un peso entero, cada uno redondeado la mitad lejos de cero
 * sobre sus dígitos decimales, y su parte, su porcentaje de ese monto o su valor, se redondea la mitad lejos de cero a
 * un peso entero. Así el 9,2 % de 375 es 35, donde el punto flotante binario da 34, un valor de 0,495 es 0,50 y resta
 * 1, y un porcentaje de 0,004 es 0,00 y no resta nada. Las claves salen en el orden del esquema y las secciones en cero
 * se omiten, tal como espera el SII. En una liquidación factura (43) el neto, el exento, el IVA y el total conservan
 * su signo, así que el total puede ser cero o negativo, y las líneas no facturables no se totalizan, porque
 * `Liquidacion` no declara `MontoNF`. Un documento de exportación (110, 111, 112) tiene los totales de
 * `calculateExportTotals`: su monto exento y su total, en su moneda con cuatro decimales. Cada código de impuesto
 * adicional o retención que llevan las líneas (`CodImpAdic`) pasa a ser un `ImptoReten`, en el orden en que aparecen
 * los códigos, calculado o entregado según `additionalTaxes` (Formato DTE 2.5, campo 117), y el total suma los
 * impuestos adicionales, específicos y anticipados y el IVA de margen y resta las retenciones (campo 124); un impuesto
 * que resulta cero no se escribe. El código 15 en un documento que retiene todo el IVA es esa retención, en cualquier
 * tipo, lo traiga la línea o lo reciba. Qué códigos lleva un tipo descansa en dos tablas del formato: la tabla de
 * códigos (punto 4, "Documentos en que se aplica") da cada código a facturas, facturas de compra y sus notas (33, 46,
 * 56, 61); la tabla de campos marca `CodImpAdic` (página 41) e `ImptoReten` (página 30) condicionales en una factura
 * exenta (34) y opcionales en una guía de despacho (52), que llevan los códigos que la tabla da a un 33, y marca
 * `CodImpAdic` no aplicable en una liquidación factura (43), donde un código se rechaza como en una boleta y en un
 * documento de exportación. Se rechaza además una retención en una venta (46, 53), cuyo lado del total el campo 124
 * no dice, un código junto a la retención de todo el IVA, junto a precios con IVA incluido (`MntBruto`, campo 10 del
 * encabezado, "sólo para documentos sin impuestos adicionales") y, si se calcula desde sus líneas, junto a un ajuste
 * global que se aplica a una de ellas: la sección D dice que los ajustes "aumentan o disminuyen la base del impuesto"
 * y que, con "ítems con distintos códigos de impuesto o retenciones", su valor "debe ser %", pero no cómo se toma ni se
 * redondea la parte de un código, así que el llamador entrega el monto de ese impuesto.
 * @throws {DteError} EN: `INVALID_AMOUNT` for a global adjustment value, or an amount it applies to, that is not finite or is 10^21 or more, and for a share with more digits than a number holds, with it in `details.value`; on an export document, what `calculateExportTotals` throws. For the codes of the lines, with the code in `details.taxCode` and the field in `details.field`: `INVALID_OPTION` for a code refused on `items[i].additionalTaxCodes`, `withholdVat` (code 15 given in `additionalTaxes` included), `pricesIncludeVat` or `globalAdjustments[i]`, and for an `additionalTaxes[i].taxCode` no line carries or given twice; `INVALID_OPTION` also, without a code, for `additionalTaxes` that is not a list and for an `additionalTaxes[i]` that is not an object; `MISSING_FIELD` on `additionalTaxes` for a code whose amount is not worked out from its lines or whose rate neither the caller nor the table gives, and on `additionalTaxes[i].rate` for an amount without any rate on a code that is not a specific tax; `INVALID_AMOUNT` for a rate that is not a finite number or is outside 0.01 to 999.99 (`TasaImp`; the table's 0 % of code 49 included) and for an `additionalTaxes[i].amount` that is not a whole number above zero. ES: `INVALID_AMOUNT` ante el valor de un ajuste global, o un monto al que se aplica, que no es finito o es 10^21 o más, y ante una parte con más dígitos de los que guarda un número, con él en `details.value`; en un documento de exportación, lo que lanza `calculateExportTotals`. Por los códigos de las líneas, con el código en `details.taxCode` y el campo en `details.field`: `INVALID_OPTION` por un código rechazado en `items[i].additionalTaxCodes`, `withholdVat` (incluido el código 15 entregado en `additionalTaxes`), `pricesIncludeVat` o `globalAdjustments[i]`, y por un `additionalTaxes[i].taxCode` que no lleva ninguna línea o que viene dos veces; `INVALID_OPTION` también, sin código, por `additionalTaxes` que no es una lista y por un `additionalTaxes[i]` que no es un objeto; `MISSING_FIELD` en `additionalTaxes` por un código cuyo monto no se calcula desde sus líneas o cuya tasa no dan ni el llamador ni la tabla, y en `additionalTaxes[i].rate` por un monto sin tasa alguna en un código que no es impuesto específico; `INVALID_AMOUNT` por una tasa que no es un número finito o está fuera de 0,01 a 999,99 (`TasaImp`; incluido el 0 % que da la tabla al código 49) y por un `additionalTaxes[i].amount` que no es un entero mayor que cero.
 */
export const calculateTotals = (items: readonly TaxedItem[], options: TotalsOptions): Totals => {
  const withholdVat = options.withholdVat ?? options.type === 46
  const taxes = resolveTaxes(lineTaxes(items, options.type, withholdVat), options, withholdVat)
  if (isExport(options.type))
    return calculateExportTotals(items, {
      globalAdjustments: options.globalAdjustments,
      withoutPayment: options.withoutPayment,
    })
  const vatRate = options.vatRate ?? VAT_RATE
  const receipt = isReceipt(options.type)
  const settlement = options.type === 43
  const bases = applyAdjustments(sumBases(items), options.globalAdjustments ?? [])
  const { affected, exempt } = bases
  const nonBillable = settlement ? 0 : bases.nonBillable
  const guarantee = carriesDepositGuarantee(options.type) ? bases.guarantee : 0
  const charges = sumCommissions(options.commissions ?? [], vatRate)
  const chargesTotal = charges.netValue + charges.exemptValue + charges.vatValue
  const hasCharges = charges.netValue !== 0 || charges.exemptValue !== 0 || charges.vatValue !== 0
  // Only a settlement invoice admits negative amounts: there an amount shows unless it is zero, and a negative one
  // rounds away from zero. On any other type an amount shows when it is above zero.
  const shown = (amount: number): boolean => (settlement ? amount !== 0 : amount > 0)
  const round = settlement ? roundSigned : Math.round

  const taxed = taxes.length > 0
  if (!shown(affected) && !shown(exempt) && nonBillable === 0 && guarantee === 0 && !hasCharges && !taxed) {
    return receipt ? { totalAmount: 0 } : { vatRate, totalAmount: 0 }
  }

  const net = options.pricesIncludeVat ? round(affected / (1 + vatRate / 100)) : affected
  const vat = options.pricesIncludeVat ? affected - net : round((net * vatRate) / 100)
  const total = (withholdVat ? net + exempt : net + vat + exempt) + guarantee - chargesTotal + taxesTotal(taxes)

  return {
    ...(shown(net) ? { netAmount: net } : {}),
    ...(shown(exempt) ? { exemptAmount: exempt } : {}),
    ...(shown(net) && !receipt ? { vatRate } : {}),
    ...(shown(net) ? { vatAmount: vat } : {}),
    ...(withholdVat && vat > 0
      ? { withholdings: [{ taxCode: WITHHOLDING_TAX_CODES.totalVatWithholding, rate: vatRate, amount: vat }] }
      : {}),
    // Beside the whole VAT withheld no other code is taken, so the two never meet.
    ...(taxed ? { withholdings: taxes } : {}),
    ...(guarantee > 0 ? { depositGuarantee: guarantee } : {}),
    ...(hasCharges
      ? {
          commissions: {
            ...(charges.netValue !== 0 ? { netValue: charges.netValue } : {}),
            ...(charges.exemptValue !== 0 ? { exemptValue: charges.exemptValue } : {}),
            ...(charges.vatValue !== 0 ? { vatValue: charges.vatValue } : {}),
          },
        }
      : {}),
    totalAmount: total,
    ...(nonBillable !== 0 ? { nonBillableAmount: nonBillable } : {}),
  }
}
