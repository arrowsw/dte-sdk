import { VAT_RATE, WITHHOLDING_TAX_CODES } from '../catalogs/codes'
import { carriesDepositGuarantee, isExport, isReceipt, type DocumentType } from '../catalogs/document-types'
import type { CommissionLineInput, GlobalAdjustment, LineItem, Totals } from '../model/document'
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
  /** EN: Document type (drives receipts, withholding). ES: Tipo de documento (decide boletas y retención). */
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

const applyAdjustments = (bases: Bases, adjustments: readonly GlobalAdjustment[]): Bases =>
  adjustments.reduce<Bases>((acc, adjustment) => {
    const key =
      adjustment.exemptIndicator === 1 ? 'exempt' : adjustment.exemptIndicator === 2 ? 'nonBillable' : 'affected'
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
 * of 0.004 is 0.00 and takes off nothing. Keys come out in
 * schema order and zero sections are omitted, exactly as the SII expects. On a settlement invoice (43) the net, the
 * exempt amount, the VAT and the total keep their sign, so the total may be zero or negative, and non-billable lines
 * are not totalled, because `Liquidacion` declares no `MontoNF`. An export document (110, 111, 112) has the totals of
 * `calculateExportTotals`: its exempt amount and its total, in its currency with four decimals.
 * ES: Calcula `Totales` desde las líneas: neto, exento, IVA (derivado del bruto con `pricesIncludeVat`), el monto no
 * facturable, que son las líneas con `IndExe` 2 menos las líneas con `IndExe` 6 y puede ser negativo (Formato DTE 2.5,
 * campo 125), la garantía por depósito de envases, las líneas con `IndExe` 3 (campo 120), la retención en facturas de
 * compra, el resumen de comisiones y otros cargos, y el total, que es neto + exento + IVA (sin el IVA si está retenido)
 * + la garantía por depósito de envases menos esos cargos (campo 124). Una línea con `IndExe` 4 o 5 no entra en ningún
 * total, y la garantía se totaliza solo en un 33, 34, 56 o 61, los tipos a los que el formato da `GrntDep`. Cada
 * ajuste global se aplica a su base en
 * orden, como lo escribe `createDocument`: su valor se toma con los dos decimales que admite `ValorDR` y el monto al que
 * se aplica como un peso entero, cada uno redondeado la mitad lejos de cero sobre sus dígitos decimales, y su parte, su
 * porcentaje de ese monto o su valor, se redondea la mitad lejos de cero a un peso entero. Así el 9,2 % de 375 es 35,
 * donde el punto flotante binario da 34, un valor de 0,495 es 0,50 y resta 1, y un porcentaje de 0,004 es 0,00 y no
 * resta nada. Las claves salen en el orden del esquema y
 * las secciones en cero se omiten, tal como espera el SII. En una liquidación factura (43) el neto, el exento, el IVA y
 * el total conservan su signo, así que el total puede ser cero o negativo, y las líneas no facturables no se totalizan,
 * porque `Liquidacion` no declara `MontoNF`. Un documento de exportación (110, 111, 112) tiene los totales de
 * `calculateExportTotals`: su monto exento y su total, en su moneda con cuatro decimales.
 * @throws {DteError} EN: `INVALID_AMOUNT` for a global adjustment value, or an amount it applies to, that is not finite or is 10^21 or more, and for a share with more digits than a number holds, with it in `details.value`; on an export document, what `calculateExportTotals` throws. ES: `INVALID_AMOUNT` ante el valor de un ajuste global, o un monto al que se aplica, que no es finito o es 10^21 o más, y ante una parte con más dígitos de los que guarda un número, con él en `details.value`; en un documento de exportación, lo que lanza `calculateExportTotals`.
 */
export const calculateTotals = (
  items: readonly Pick<LineItem, 'amount' | 'exemptIndicator'>[],
  options: TotalsOptions,
): Totals => {
  if (isExport(options.type))
    return calculateExportTotals(items, {
      globalAdjustments: options.globalAdjustments,
      withoutPayment: options.withoutPayment,
    })
  const vatRate = options.vatRate ?? VAT_RATE
  const receipt = isReceipt(options.type)
  const settlement = options.type === 43
  const withholdVat = options.withholdVat ?? options.type === 46
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

  if (!shown(affected) && !shown(exempt) && nonBillable === 0 && guarantee === 0 && !hasCharges) {
    return receipt ? { totalAmount: 0 } : { vatRate, totalAmount: 0 }
  }

  const net = options.pricesIncludeVat ? round(affected / (1 + vatRate / 100)) : affected
  const vat = options.pricesIncludeVat ? affected - net : round((net * vatRate) / 100)
  const total = (withholdVat ? net + exempt : net + vat + exempt) + guarantee - chargesTotal

  return {
    ...(shown(net) ? { netAmount: net } : {}),
    ...(shown(exempt) ? { exemptAmount: exempt } : {}),
    ...(shown(net) && !receipt ? { vatRate } : {}),
    ...(shown(net) ? { vatAmount: vat } : {}),
    ...(withholdVat && vat > 0
      ? { withholdings: [{ taxCode: WITHHOLDING_TAX_CODES.totalVatWithholding, rate: vatRate, amount: vat }] }
      : {}),
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
