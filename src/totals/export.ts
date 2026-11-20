import { DteError } from '../errors'
import type { GlobalAdjustment, LineItem, Totals } from '../model/document'

// The amounts of an export document are in a foreign currency, with the decimals `Exportaciones` admits: four in a
// line's `MontoItem` and in `MntExe` and `MntTotal` (`totalDigits` 18, `fractionDigits` 4), none in a line's
// `DescuentoMonto` and `RecargoMonto` (`MntImpType`, a whole number). Each amount is worked out exactly, over the
// decimal digits of the numbers as they are written in the XML, and rounded half away from zero to the decimals of
// its element: binary floating point never decides a cent.

const TEN = BigInt(10)
const ZERO = BigInt(0)
const HUNDRED = BigInt(100)
const AMOUNT_DECIMALS = 4

const pow10 = (exponent: number): bigint => TEN ** BigInt(exponent)

// The decimal digits of a finite number as JavaScript writes it, the way the XML writes it, scaled to `decimals` and
// rounded half away from zero.
const unitsOf = (value: number, decimals: number): bigint => {
  // From 10^21 up JavaScript writes a number with an exponent whatever it is asked, and what is not finite has no
  // digits at all.
  if (!(Math.abs(value) < 1e21)) throw new DteError('INVALID_AMOUNT', { value: String(value) })
  const written = String(value)
  const plain = /e/i.test(written) ? value.toFixed(20) : written
  const negative = plain.startsWith('-')
  const [whole, fraction = ''] = (negative ? plain.slice(1) : plain).split('.')
  const kept = BigInt(whole + fraction.slice(0, decimals).padEnd(decimals, '0'))
  const rounded = Number(fraction.charAt(decimals) || '0') >= 5 ? kept + BigInt(1) : kept
  return negative ? ZERO - rounded : rounded
}

// `numerator / denominator`, rounded half away from zero; the denominator is above zero.
const divide = (numerator: bigint, denominator: bigint): bigint => {
  const negative = numerator < ZERO
  const magnitude = negative ? ZERO - numerator : numerator
  const quotient = (magnitude * BigInt(2) + denominator) / (denominator * BigInt(2))
  return negative ? ZERO - quotient : quotient
}

// A scaled amount in decimal digits.
const digitsOf = (units: bigint, decimals: number): string => {
  const negative = units < ZERO
  const digits = String(negative ? ZERO - units : units).padStart(decimals + 1, '0')
  const cut = digits.length - decimals
  return `${negative ? '-' : ''}${digits.slice(0, cut)}.${digits.slice(cut)}`
}

// The number a scaled amount writes, read from its decimal digits, so it is the one the same literal gives.
const toNumber = (units: bigint, decimals: number): number => Number(digitsOf(units, decimals))

// The number an amount worked out here is handed back as. A number holds some fifteen significant digits: an amount
// with more may have no number of its own, and the number it gets is written as another amount. That one is refused,
// with its digits; an amount whose number writes it back is taken, however many digits it has.
const held = (units: bigint, decimals: number): number => {
  const amount = toNumber(units, decimals)
  if (unitsOf(amount, decimals) !== units) throw new DteError('INVALID_AMOUNT', { value: digitsOf(units, decimals) })
  return amount
}

/**
 * EN: Rounds a number half away from zero to `decimals` decimals, over its decimal digits as JavaScript writes it, so
 * `1.00005` gives `1.0001` and `0.1 + 0.2` gives `0.3`.
 * ES: Redondea un número a `decimals` decimales, la mitad lejos de cero, sobre sus dígitos decimales tal como los
 * escribe JavaScript: `1.00005` da `1.0001` y `0.1 + 0.2` da `0.3`.
 * @param value EN: a finite number. ES: un número finito.
 * @param decimals EN: the decimals to keep, from 0. ES: los decimales que se conservan, desde 0.
 * @returns EN: the number rounded. ES: el número redondeado.
 * @throws {DteError} EN: `INVALID_AMOUNT` for a number that is not finite or is 10^21 or more, with it in `details.value`. ES: `INVALID_AMOUNT` ante un número que no es finito o es 10^21 o más, con él en `details.value`.
 */
export const roundHalfAwayFromZero = (value: number, decimals: number): number =>
  toNumber(unitsOf(value, decimals), decimals)

/**
 * EN: Inputs of the amount of a line of an export document. The quantity and the price are taken with the six decimals
 * the schema holds, and the percentages with two.
 * ES: Entradas del monto de una línea de un documento de exportación. La cantidad y el precio se toman con los seis
 * decimales que admite el esquema, y los porcentajes con dos.
 */
export type ExportLineAmountInput = {
  /** EN: Quantity (default 1). ES: `QtyItem` — Cantidad (por defecto 1). */
  readonly quantity?: number
  /** EN: Unit price in the document's currency (default 0). ES: `PrcItem` — Precio unitario en la moneda del documento (por defecto 0). */
  readonly unitPrice?: number
  /** EN: Discount percent. ES: `DescuentoPct` — Porcentaje de descuento. */
  readonly discountPercent?: number
  /** EN: Surcharge percent. ES: `RecargoPct` — Porcentaje de recargo. */
  readonly surchargePercent?: number
}

/**
 * EN: The amount of a line of an export document, in the document's currency.
 * ES: El monto de una línea de un documento de exportación, en la moneda del documento.
 */
export type ExportLineAmount = {
  /** EN: Quantity by price, rounded to four decimals. ES: Cantidad por precio, redondeada a cuatro decimales. */
  readonly base: number
  /** EN: The discount percent of the base, rounded to a whole number, since the schema's `DescuentoMonto` is one. ES: `DescuentoMonto` — El porcentaje de descuento de la base, redondeado a un entero, porque el `DescuentoMonto` del esquema es uno. */
  readonly discountAmount: number
  /** EN: The surcharge percent of the base, rounded to a whole number, since the schema's `RecargoMonto` is one. ES: `RecargoMonto` — El porcentaje de recargo de la base, redondeado a un entero, porque el `RecargoMonto` del esquema es uno. */
  readonly surchargeAmount: number
  /** EN: `base − discount + surcharge`, four decimals at most (Formato DTE 2.5, field 38 of the detail). ES: `MontoItem` — `base − descuento + recargo`, con cuatro decimales a lo más (Formato DTE 2.5, campo 38 del detalle). */
  readonly amount: number
}

/**
 * EN: Computes the amount of a line of an export document exactly: the quantity by the price rounded half away from
 * zero to the four decimals of `MontoItem`, less the discount and plus the surcharge, each its percent of that base
 * rounded half away from zero to a whole number, the only amount `DescuentoMonto` and `RecargoMonto` admit.
 * ES: Calcula con exactitud el monto de una línea de un documento de exportación: la cantidad por el precio redondeada,
 * la mitad lejos de cero, a los cuatro decimales de `MontoItem`, menos el descuento y más el recargo, cada uno su
 * porcentaje de esa base redondeado, la mitad lejos de cero, a un entero, el único monto que admiten `DescuentoMonto` y
 * `RecargoMonto`.
 * @param input EN: the quantity, the price and the percentages. ES: la cantidad, el precio y los porcentajes.
 * @returns EN: the base, the discount, the surcharge and the amount. ES: la base, el descuento, el recargo y el monto.
 * @throws {DteError} EN: `INVALID_AMOUNT` for an input that is not finite or is 10^21 or more, and for a base or an amount with more digits than a number holds, which would be written as another one, with it in `details.value`. ES: `INVALID_AMOUNT` ante una entrada que no es finita o es 10^21 o más, y ante una base o un monto con más dígitos de los que guarda un número, que se escribiría como otro, con él en `details.value`.
 */
export const calculateExportLineAmount = ({
  quantity = 1,
  unitPrice = 0,
  discountPercent = 0,
  surchargePercent = 0,
}: ExportLineAmountInput): ExportLineAmount => {
  // Quantity and price with six decimals each: their product has twelve, rounded to the four of the amount.
  const base = divide(unitsOf(quantity, 6) * unitsOf(unitPrice, 6), pow10(12 - AMOUNT_DECIMALS))
  // A base with four decimals by a percent with two, over 100: a whole number is that over 10^8.
  const share = (percent: number): bigint =>
    percent > 0 ? divide(base * unitsOf(percent, 2), pow10(AMOUNT_DECIMALS + 2) * HUNDRED) : ZERO
  const discount = share(discountPercent)
  const surcharge = share(surchargePercent)
  const scale = pow10(AMOUNT_DECIMALS)
  return {
    base: held(base, AMOUNT_DECIMALS),
    discountAmount: Number(discount),
    surchargeAmount: Number(surcharge),
    amount: held(base - discount * scale + surcharge * scale, AMOUNT_DECIMALS),
  }
}

/**
 * EN: Options of `calculateExportTotals`.
 * ES: Opciones de `calculateExportTotals`.
 */
export type ExportTotalsOptions = {
  /** EN: Global discounts and surcharges, each on the exempt amount. ES: `DscRcgGlobal` — Descuentos y recargos globales, cada uno sobre el monto exento. */
  readonly globalAdjustments?: readonly GlobalAdjustment[]
  /** EN: Export without payment (`FmaPagExp` 21): the total is zero (Formato DTE 2.5, field 124). ES: Exportación sin pago (`FmaPagExp` 21): el monto total es cero (Formato DTE 2.5, campo 124). */
  readonly withoutPayment?: boolean
}

/**
 * EN: Computes the `Totales` of an export document, in its currency: the exempt amount is the sum of the lines that
 * carry no exemption indicator or carry 1 (an export is exempt as a whole, Formato DTE 2.5, field 108), with each
 * global adjustment applied in order, a percent of the running amount rounded half away from zero to four decimals or
 * an amount with its two decimals; non-billable lines (2 to 6) are not totalled, since `Exportaciones` has no
 * `MontoNF`. The total is the exempt amount, or zero on an export without payment (field 124). Both are worked out
 * exactly and written with four decimals at most.
 * ES: Calcula los `Totales` de un documento de exportación, en su moneda: el monto exento es la suma de las líneas sin
 * indicador de exención o con indicador 1 (una exportación es exenta en su totalidad, Formato DTE 2.5, campo 108), con
 * cada descuento o recargo global aplicado en orden, un porcentaje del monto que va quedando redondeado, la mitad lejos
 * de cero, a cuatro decimales, o un monto con sus dos decimales; las líneas no facturables (2 a 6) no se totalizan,
 * porque `Exportaciones` no tiene `MontoNF`. El total es el monto exento, o cero en una exportación sin pago (campo
 * 124). Ambos se calculan con exactitud y se escriben con cuatro decimales a lo más.
 * @param items EN: the lines, with their amounts. ES: las líneas, con sus montos.
 * @param options EN: the global adjustments and whether the export is without payment. ES: los ajustes globales y si la exportación es sin pago.
 * @returns EN: the exempt amount and the total. ES: el monto exento y el total.
 * @throws {DteError} EN: `INVALID_AMOUNT` for an amount that is not finite or is 10^21 or more, and for an exempt amount with more digits than a number holds, which would be written as another one, with it in `details.value`. ES: `INVALID_AMOUNT` ante un monto que no es finito o es 10^21 o más, y ante un monto exento con más dígitos de los que guarda un número, que se escribiría como otro, con él en `details.value`.
 */
export const calculateExportTotals = (
  items: readonly Pick<LineItem, 'amount' | 'exemptIndicator'>[],
  options: ExportTotalsOptions = {},
): Totals => {
  const lines = items
    .filter((item) => item.exemptIndicator === undefined || item.exemptIndicator === 1)
    .reduce((sum, item) => sum + unitsOf(item.amount, AMOUNT_DECIMALS), ZERO)
  const exempt = (options.globalAdjustments ?? []).reduce((running, adjustment) => {
    const delta =
      adjustment.valueType === 'percent'
        ? divide(running * unitsOf(adjustment.value, 2), pow10(2) * HUNDRED)
        : unitsOf(adjustment.value, 2) * pow10(AMOUNT_DECIMALS - 2)
    return adjustment.kind === 'discount' ? running - delta : running + delta
  }, lines)
  const exemptAmount = held(exempt, AMOUNT_DECIMALS)
  return { exemptAmount, totalAmount: options.withoutPayment ? 0 : exemptAmount }
}

/**
 * EN: An amount of an export document in Chilean pesos (`OtraMoneda`): the amount by the exchange rate, worked out
 * exactly over the four decimals each holds and rounded half away from zero to a whole peso.
 * ES: Un monto de un documento de exportación en pesos chilenos (`OtraMoneda`): el monto por el tipo de cambio,
 * calculado con exactitud sobre los cuatro decimales de cada uno y redondeado, la mitad lejos de cero, a un peso entero.
 * @param amount EN: the amount in the document's currency. ES: el monto en la moneda del documento.
 * @param exchangeRate EN: pesos per unit of that currency. ES: pesos por unidad de esa moneda.
 * @returns EN: whole pesos. ES: pesos enteros.
 * @throws {DteError} EN: `INVALID_AMOUNT` for an amount or a rate that is not finite or is 10^21 or more. ES: `INVALID_AMOUNT` ante un monto o un tipo de cambio que no es finito o es 10^21 o más.
 */
export const convertToPesos = (amount: number, exchangeRate: number): number =>
  Number(divide(unitsOf(amount, AMOUNT_DECIMALS) * unitsOf(exchangeRate, 4), pow10(AMOUNT_DECIMALS + 4)))
