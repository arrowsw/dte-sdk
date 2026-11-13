import { VAT_RATE, WITHHOLDING_TAX_CODES } from '../catalogs/codes'
import { isReceipt, type DocumentType } from '../catalogs/document-types'
import type { CommissionLineInput, GlobalAdjustment, LineItem, Totals } from '../model/document'

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
 * EN: Computes a detail line amount with per-line rounding (the SII compares `MontoItem` against `QtyItem × PrcItem`).
 * ES: Calcula el monto de una línea con redondeo por línea (el SII compara `MontoItem` contra `QtyItem × PrcItem`).
 */
export const calculateLineAmount = ({
  quantity = 1,
  unitPrice = 0,
  discountPercent = 0,
  surchargePercent = 0,
}: LineAmountInput): LineAmount => {
  const base = Math.round(quantity * unitPrice)
  const discountAmount = discountPercent > 0 ? Math.round((base * discountPercent) / 100) : 0
  const surchargeAmount = surchargePercent > 0 ? Math.round((base * surchargePercent) / 100) : 0
  return { base, discountAmount, surchargeAmount, amount: base - discountAmount + surchargeAmount }
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
  /** EN: Global discounts/surcharges. ES: Descuentos/recargos globales. */
  readonly globalAdjustments?: readonly GlobalAdjustment[]
  /** EN: Withhold the whole VAT (default: true for purchase invoices). ES: Retener todo el IVA (por defecto: true en facturas de compra, 46). */
  readonly withholdVat?: boolean
  /** EN: Commission and other charge lines: summed into the summary and taken off the total; the summary's VAT is the VAT rate by their total net value, rounded once, unless a line states its `vatValue`, and then it is the sum of the lines' VAT. ES: `Comisiones` — Líneas de comisiones y otros cargos: se suman en `Totales/Comisiones` y se restan del total; el IVA del resumen es la tasa de IVA por su valor neto total, redondeado una vez, salvo que una línea declare su `vatValue`, y entonces es la suma del IVA de las líneas. */
  readonly commissions?: readonly Pick<CommissionLineInput, 'netValue' | 'exemptValue' | 'vatValue'>[]
}

type Bases = { readonly affected: number; readonly exempt: number; readonly nonBillable: number }

const sumBases = (items: readonly Pick<LineItem, 'amount' | 'exemptIndicator'>[]): Bases =>
  items.reduce<Bases>(
    (acc, item) => {
      if (item.exemptIndicator === undefined) return { ...acc, affected: acc.affected + item.amount }
      if (item.exemptIndicator === 1) return { ...acc, exempt: acc.exempt + item.amount }
      return { ...acc, nonBillable: acc.nonBillable + item.amount }
    },
    { affected: 0, exempt: 0, nonBillable: 0 },
  )

const applyAdjustments = (bases: Bases, adjustments: readonly GlobalAdjustment[]): Bases =>
  adjustments.reduce<Bases>((acc, adjustment) => {
    const key =
      adjustment.exemptIndicator === 1 ? 'exempt' : adjustment.exemptIndicator === 2 ? 'nonBillable' : 'affected'
    const delta =
      adjustment.valueType === 'percent'
        ? Math.round((acc[key] * adjustment.value) / 100)
        : Math.round(adjustment.value)
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
 * EN: Computes `Totales` from detail lines: net, exempt, VAT (derived from the gross when `pricesIncludeVat`),
 * non-billable, withholding for purchase invoices, the summary of commissions and other charges, and the total, which
 * is net + exempt + VAT (left out when withheld) less those charges (Formato DTE 2.5, field 124). Keys come out in
 * schema order and zero sections are omitted, exactly as the SII expects. On a settlement invoice (43) the net, the
 * exempt amount, the VAT and the total keep their sign, so the total may be zero or negative, and non-billable lines
 * are not totalled, because `Liquidacion` declares no `MontoNF`.
 * ES: Calcula `Totales` desde las líneas: neto, exento, IVA (derivado del bruto con `pricesIncludeVat`), no facturable,
 * retención en facturas de compra, el resumen de comisiones y otros cargos, y el total, que es neto + exento + IVA (sin
 * el IVA si está retenido) menos esos cargos (Formato DTE 2.5, campo 124). Las claves salen en el orden del esquema y
 * las secciones en cero se omiten, tal como espera el SII. En una liquidación factura (43) el neto, el exento, el IVA y
 * el total conservan su signo, así que el total puede ser cero o negativo, y las líneas no facturables no se totalizan,
 * porque `Liquidacion` no declara `MontoNF`.
 */
export const calculateTotals = (
  items: readonly Pick<LineItem, 'amount' | 'exemptIndicator'>[],
  options: TotalsOptions,
): Totals => {
  const vatRate = options.vatRate ?? VAT_RATE
  const receipt = isReceipt(options.type)
  const settlement = options.type === 43
  const withholdVat = options.withholdVat ?? options.type === 46
  const bases = applyAdjustments(sumBases(items), options.globalAdjustments ?? [])
  const { affected, exempt } = bases
  const nonBillable = settlement ? 0 : bases.nonBillable
  const charges = sumCommissions(options.commissions ?? [], vatRate)
  const chargesTotal = charges.netValue + charges.exemptValue + charges.vatValue
  const hasCharges = charges.netValue !== 0 || charges.exemptValue !== 0 || charges.vatValue !== 0
  // Only a settlement invoice admits negative amounts: there an amount shows unless it is zero, and a negative one
  // rounds away from zero. On any other type an amount shows when it is above zero.
  const shown = (amount: number): boolean => (settlement ? amount !== 0 : amount > 0)
  const round = settlement ? roundSigned : Math.round

  if (!shown(affected) && !shown(exempt) && nonBillable === 0 && !hasCharges) {
    return receipt ? { totalAmount: 0 } : { vatRate, totalAmount: 0 }
  }

  const net = options.pricesIncludeVat ? round(affected / (1 + vatRate / 100)) : affected
  const vat = options.pricesIncludeVat ? affected - net : round((net * vatRate) / 100)
  const total = (withholdVat ? net + exempt : net + vat + exempt) - chargesTotal

  return {
    ...(shown(net) ? { netAmount: net } : {}),
    ...(shown(exempt) ? { exemptAmount: exempt } : {}),
    ...(shown(net) && !receipt ? { vatRate } : {}),
    ...(shown(net) ? { vatAmount: vat } : {}),
    ...(withholdVat && vat > 0
      ? { withholdings: [{ taxCode: WITHHOLDING_TAX_CODES.totalVatWithholding, rate: vatRate, amount: vat }] }
      : {}),
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
