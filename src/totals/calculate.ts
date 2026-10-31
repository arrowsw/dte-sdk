import { VAT_RATE, WITHHOLDING_TAX_CODES } from '../catalogs/codes'
import { isReceipt, type DocumentType } from '../catalogs/document-types'
import type { GlobalAdjustment, LineItem, Totals } from '../model/document'

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

/**
 * EN: Computes `Totales` from detail lines: net, exempt, VAT (derived from the gross when `pricesIncludeVat`),
 * non-billable, withholding for purchase invoices and the total. Keys come out in schema order and zero
 * sections are omitted, exactly as the SII expects.
 * ES: Calcula `Totales` desde las líneas: neto, exento, IVA (derivado del bruto con `pricesIncludeVat`), no facturable,
 * retención en facturas de compra y el total. Las claves salen en el orden del esquema y las secciones en cero se omiten,
 * tal como espera el SII.
 */
export const calculateTotals = (
  items: readonly Pick<LineItem, 'amount' | 'exemptIndicator'>[],
  options: TotalsOptions,
): Totals => {
  const vatRate = options.vatRate ?? VAT_RATE
  const receipt = isReceipt(options.type)
  const withholdVat = options.withholdVat ?? options.type === 46
  const { affected, exempt, nonBillable } = applyAdjustments(sumBases(items), options.globalAdjustments ?? [])

  if (affected <= 0 && exempt <= 0 && nonBillable === 0) {
    return receipt ? { totalAmount: 0 } : { vatRate, totalAmount: 0 }
  }

  const net = options.pricesIncludeVat ? Math.round(affected / (1 + vatRate / 100)) : affected
  const vat = options.pricesIncludeVat ? affected - net : Math.round((net * vatRate) / 100)
  const total = withholdVat ? net + exempt : net + vat + exempt

  return {
    ...(net > 0 ? { netAmount: net } : {}),
    ...(exempt > 0 ? { exemptAmount: exempt } : {}),
    ...(net > 0 && !receipt ? { vatRate } : {}),
    ...(net > 0 ? { vatAmount: vat } : {}),
    ...(withholdVat && vat > 0
      ? { withholdings: [{ taxCode: WITHHOLDING_TAX_CODES.totalVatWithholding, rate: vatRate, amount: vat }] }
      : {}),
    totalAmount: total,
    ...(nonBillable !== 0 ? { nonBillableAmount: nonBillable } : {}),
  }
}
