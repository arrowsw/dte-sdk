// What the printed sample writes out for the reader: an amount in words, a date with its month in words and a quantity
// with its decimals. Formato DTE 2.5 lets the print differ from the format of the XML "to ease its reading" (section
// 2.2, column I).

const UNITS = [
  '',
  'uno',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
  'once',
  'doce',
  'trece',
  'catorce',
  'quince',
  'dieciséis',
  'diecisiete',
  'dieciocho',
  'diecinueve',
  'veinte',
  'veintiuno',
  'veintidós',
  'veintitrés',
  'veinticuatro',
  'veinticinco',
  'veintiséis',
  'veintisiete',
  'veintiocho',
  'veintinueve',
] as const
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'] as const
const HUNDREDS = [
  '',
  'ciento',
  'doscientos',
  'trescientos',
  'cuatrocientos',
  'quinientos',
  'seiscientos',
  'setecientos',
  'ochocientos',
  'novecientos',
] as const
// A million and a billion (a million millions), singular and plural: the groups of six digits above the first.
const GROUPS = [
  ['millón', 'millones'],
  ['billón', 'billones'],
] as const
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const

const joined = (words: readonly string[], separator = ' '): string => words.filter(Boolean).join(separator)

// 1 to 999.
const hundreds = (value: number): string => {
  if (value === 100) return 'cien'
  const rest = value % 100
  const tens = rest < 30 ? UNITS[rest] : joined([TENS[Math.floor(rest / 10)], UNITS[rest % 10]], ' y ')
  return joined([HUNDREDS[Math.floor(value / 100)], tens])
}

// "Uno" loses its ending before what it counts: veintiún mil, un millón, treinta y un pesos.
const shortened = (words: string): string => words.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un')

// 1 to 999 999.
const thousands = (value: number): string => {
  const high = Math.floor(value / 1000)
  const head = high === 0 ? '' : high === 1 ? 'mil' : `${shortened(hundreds(high))} mil`
  return joined([head, value % 1000 === 0 ? '' : hundreds(value % 1000)])
}

/**
 * EN: An amount of pesos in Spanish words, as a printed document writes its total out: `1235` is `mil doscientos
 * treinta y cinco pesos`, a round number of millions takes `de pesos`, and a negative amount starts with `menos`. Empty
 * for an amount that is not a whole number the words can say exactly (a fraction, or beyond 2^53 − 1).
 * ES: Un monto en pesos en palabras, como un documento impreso escribe su total: `1235` es `mil doscientos treinta y
 * cinco pesos`, un número cerrado de millones lleva `de pesos`, y un monto negativo parte con `menos`. Vacío ante un
 * monto que no es un entero que las palabras puedan decir exacto (una fracción, o sobre 2^53 − 1).
 */
export const amountInWords = (value: number): string => {
  if (!Number.isSafeInteger(value)) return ''
  if (value < 0) return `menos ${amountInWords(-value)}`
  if (value === 0) return 'cero pesos'
  if (value === 1) return 'un peso'
  const parts = [thousands(value % 1e6)]
  let rest = Math.floor(value / 1e6)
  for (const [one, many] of GROUPS) {
    const group = rest % 1e6
    parts.unshift(group === 0 ? '' : group === 1 ? `un ${one}` : `${shortened(thousands(group))} ${many}`)
    rest = Math.floor(rest / 1e6)
  }
  return `${shortened(joined(parts))} ${value % 1e6 === 0 ? 'de pesos' : 'pesos'}`
}

/**
 * EN: A date written `YYYY-MM-DD` with its month in words, `5 de noviembre de 2026`; anything else as written.
 * ES: Una fecha escrita `AAAA-MM-DD` con su mes en palabras, `5 de noviembre de 2026`; cualquier otra cosa tal como
 * viene.
 */
export const longDate = (date: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const month = match === null ? undefined : MONTHS[Number(match[2]) - 1]
  return match === null || month === undefined ? date : `${Number(match[3])} de ${month} de ${match[1]}`
}

/**
 * EN: A quantity or a unit price the Chilean way: a point between the thousands, a comma before the decimals, and up
 * to the six decimals the format admits.
 * ES: Una cantidad o un precio unitario a la chilena: punto entre los miles, coma antes de los decimales, y hasta los
 * seis decimales que admite el formato.
 */
export const formatQuantity = (value: number): string => value.toLocaleString('es-CL', { maximumFractionDigits: 6 })
