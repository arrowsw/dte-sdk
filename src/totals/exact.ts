import { DteError } from '../errors'

// Exact arithmetic over the decimal digits of a number as JavaScript writes it, the way the XML writes it: each amount
// is worked out over those digits and rounded half away from zero, so binary floating point never decides a peso or a
// cent. 375 × 9.2 / 100 is 34.49999999999999 in floating point; here it is 34.5, and rounds to 35.

const TEN = BigInt(10)

/**
 * EN: Zero, as a `bigint`. Internal.
 * ES: Cero, como `bigint`. Interno.
 */
export const ZERO = BigInt(0)

/**
 * EN: A hundred, as a `bigint`: what a percent is over. Internal.
 * ES: Cien, como `bigint`: sobre lo que se toma un porcentaje. Interno.
 */
export const HUNDRED = BigInt(100)

/**
 * EN: Ten to `exponent`, as a `bigint`. Internal.
 * ES: Diez elevado a `exponent`, como `bigint`. Interno.
 */
export const pow10 = (exponent: number): bigint => TEN ** BigInt(exponent)

/**
 * EN: The decimal digits of a finite number as JavaScript writes it, scaled to `decimals` and rounded half away from
 * zero. Internal.
 * ES: Los dígitos decimales de un número finito tal como lo escribe JavaScript, escalados a `decimals` y redondeados,
 * la mitad lejos de cero. Interno.
 * @throws {DteError} EN: `INVALID_AMOUNT` for a number that is not finite or is 10^21 or more, with it in `details.value`. ES: `INVALID_AMOUNT` ante un número que no es finito o es 10^21 o más, con él en `details.value`.
 */
export const unitsOf = (value: number, decimals: number): bigint => {
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

/**
 * EN: `numerator / denominator`, rounded half away from zero; the denominator is above zero. Internal.
 * ES: `numerator / denominator`, redondeado la mitad lejos de cero; el denominador es mayor que cero. Interno.
 */
export const divide = (numerator: bigint, denominator: bigint): bigint => {
  const negative = numerator < ZERO
  const magnitude = negative ? ZERO - numerator : numerator
  const quotient = (magnitude * BigInt(2) + denominator) / (denominator * BigInt(2))
  return negative ? ZERO - quotient : quotient
}

// A scaled amount in decimal digits, with no point when it is whole.
const digitsOf = (units: bigint, decimals: number): string => {
  const negative = units < ZERO
  const digits = String(negative ? ZERO - units : units).padStart(decimals + 1, '0')
  const cut = digits.length - decimals
  const fraction = decimals > 0 ? `.${digits.slice(cut)}` : ''
  return `${negative ? '-' : ''}${digits.slice(0, cut)}${fraction}`
}

/**
 * EN: A finite number written with `decimals` decimals, rounded half away from zero over its decimal digits and padded
 * with zeros, where `toFixed` rounds its binary value: 1.005 is written `'1.01'` with two. Internal.
 * ES: Un número finito escrito con `decimals` decimales, redondeado la mitad lejos de cero sobre sus dígitos decimales
 * y completado con ceros, donde `toFixed` redondea su valor binario: 1.005 se escribe `'1.01'` con dos. Interno.
 * @throws {DteError} EN: `INVALID_AMOUNT` for a number that is not finite or is 10^21 or more, with it in `details.value`. ES: `INVALID_AMOUNT` ante un número que no es finito o es 10^21 o más, con él en `details.value`.
 */
export const toFixedDigits = (value: number, decimals: number): string => digitsOf(unitsOf(value, decimals), decimals)

/**
 * EN: The number a scaled amount writes, read from its decimal digits, so it is the one the same literal gives.
 * Internal.
 * ES: El número que escribe un monto escalado, leído de sus dígitos decimales, así que es el que da el mismo literal.
 * Interno.
 */
export const toNumber = (units: bigint, decimals: number): number => Number(digitsOf(units, decimals))

/**
 * EN: The number an amount worked out exactly is handed back as. A number holds some fifteen significant digits: an
 * amount with more may have no number of its own, and the number it gets is written as another amount. That one is
 * refused, with its digits; an amount whose number writes it back is taken, however many digits it has. Internal.
 * ES: El número con que se entrega un monto calculado con exactitud. Un número guarda unos quince dígitos
 * significativos: un monto con más puede no tener número propio, y el que recibe se escribe como otro monto. Ese se
 * rechaza, con sus dígitos; un monto cuyo número lo vuelve a escribir se acepta, tenga los dígitos que tenga. Interno.
 * @throws {DteError} EN: `INVALID_AMOUNT` for an amount its number would write as another one, with its digits in `details.value`. ES: `INVALID_AMOUNT` ante un monto que su número escribiría como otro, con sus dígitos en `details.value`.
 */
export const held = (units: bigint, decimals: number): number => {
  const amount = toNumber(units, decimals)
  if (unitsOf(amount, decimals) !== units) throw new DteError('INVALID_AMOUNT', { value: digitsOf(units, decimals) })
  return amount
}
