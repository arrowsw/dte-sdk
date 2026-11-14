import { WITHHOLDING_TAX_CODES } from '../catalogs/codes'
import type { DocumentType } from '../catalogs/document-types'
import { DteError } from '../errors'
import type { DocumentWarning, Totals } from '../model/document'

// The rules the SII checks over the totals of a document, whoever worked them out: `createDocument` or its caller. The
// numbered validations are those of the SII's "Nuevas validaciones a la IECV, DTE y DJ 3327 y 3328": 55 to 57 are the
// DTE's own, and reject it or object to it on reception; 10 and 12 are the purchase book's, and object to it there.

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0)

const AMOUNTS = ['netAmount', 'exemptAmount', 'vatAmount', 'totalAmount'] as const

// `MntNeto`, `MntExe`, `IVA` and `MntTotal` are a `MontoType`, a whole number from zero up, in `Documento` and in a
// receipt, and a `ValorType`, a whole number of either sign, only in `Liquidacion`, the root of a settlement invoice.
// Totals worked out from a global discount larger than the lines it applies to come out with a negative total.
const assertAmounts = (type: DocumentType, totals: Totals): void => {
  for (const field of AMOUNTS) {
    const amount = totals[field]
    if (amount !== undefined && !(Number.isInteger(amount) && (type === 43 || amount >= 0)))
      throw new DteError('INVALID_AMOUNT', { field: `totals.${field}` })
  }
}

// Validation 55, a rejection: an invoice declares its VAT. Totals worked out from lines of which none is subject to VAT
// carry none.
const assertInvoiceVat = ({ vatAmount }: Totals): void => {
  if (vatAmount === undefined) throw new DteError('MISSING_FIELD', { field: 'totals.vatAmount' })
}

// Validation 57, a rejection: an exempt invoice declares an exempt amount above zero, and a net amount and a VAT, when
// it declares them, of zero. Totals worked out from lines that add up to zero carry no exempt amount. The amounts are
// already whole numbers from zero up.
const assertExemptInvoice = (totals: Totals): void => {
  if (totals.exemptAmount === undefined) throw new DteError('MISSING_FIELD', { field: 'totals.exemptAmount' })
  if (totals.exemptAmount === 0) throw new DteError('INVALID_AMOUNT', { field: 'totals.exemptAmount' })
  for (const field of ['netAmount', 'vatAmount'] as const)
    if ((totals[field] ?? 0) !== 0) throw new DteError('INVALID_AMOUNT', { field: `totals.${field}` })
}

// Formato DTE 2.5, field 124: the total is the net amount, the exempt amount and the VAT, plus the additional and
// specific taxes, less the VAT withheld and the commissions and other charges with their VAT. Code 15, the whole VAT
// withheld, is the one tax code whose side of the sum dte-sdk knows; with any other in the totals there is no total to
// compare with.
const expectedTotal = (totals: Totals): number | undefined => {
  const withholdings = totals.withholdings ?? []
  if (withholdings.some(({ taxCode }) => taxCode !== WITHHOLDING_TAX_CODES.totalVatWithholding)) return undefined
  const { netValue = 0, exemptValue = 0, vatValue = 0 } = totals.commissions ?? {}
  const charged = (totals.netAmount ?? 0) + (totals.exemptAmount ?? 0) + (totals.vatAmount ?? 0)
  return charged - sum(withholdings.map(({ amount }) => amount)) - netValue - exemptValue - vatValue
}

const mismatch = (field: string, expected: number, actual: number): DteError =>
  new DteError('TOTAL_MISMATCH', { field, expected, actual })

/**
 * EN: Refuses totals the SII rejects, in this order: a net amount, an exempt amount, a VAT or a total that is not a
 * whole number, or is negative on any type but a settlement invoice (43); an invoice (33) without its VAT (validation
 * 55); an exempt invoice (34) without an exempt amount above zero, or with a net amount or a VAT other than zero
 * (validation 57); a total that is not the sum Formato DTE 2.5 defines (field 124), checked unless the totals carry a
 * tax code other than 15; and a period amount that is not the total plus the non-billable amount (field 126).
 * ES: Rechaza los totales que el SII rechaza, en este orden: un monto neto, un monto exento, un IVA o un monto total que
 * no es entero, o que es negativo en cualquier tipo salvo la liquidación factura (43); una factura (33) sin IVA
 * (validación 55); una factura exenta (34) sin monto exento mayor que cero, o con monto neto o IVA distintos de cero
 * (validación 57); un monto total que no es la suma que define el Formato DTE 2.5 (campo 124), revisado salvo que los
 * totales traigan un código de impuesto distinto del 15; y un monto del período que no es el total más el monto no
 * facturable (campo 126).
 * @throws {DteError} EN: `INVALID_AMOUNT` and `MISSING_FIELD`, `TOTAL_MISMATCH` with `expected` and `actual`, and the field in `details.field`. ES: `INVALID_AMOUNT` y `MISSING_FIELD`, `TOTAL_MISMATCH` con `expected` y `actual`, y el campo en `details.field`.
 */
export const assertTotals = (type: DocumentType, totals: Totals): void => {
  assertAmounts(type, totals)
  if (type === 33) assertInvoiceVat(totals)
  if (type === 34) assertExemptInvoice(totals)
  const expected = expectedTotal(totals)
  if (expected !== undefined && expected !== totals.totalAmount)
    throw mismatch('totals.totalAmount', expected, totals.totalAmount)
  if (totals.periodAmount === undefined) return
  const period = totals.totalAmount + (totals.nonBillableAmount ?? 0)
  if (totals.periodAmount !== period) throw mismatch('totals.periodAmount', period, totals.periodAmount)
}

// Validation 10 names invoices, exempt invoices, settlement invoices and purchase invoices; 12 leaves out the exempt.
const ZERO_TOTAL_TYPES: readonly DocumentType[] = [33, 34, 43, 46]
const ZERO_NET_TYPES: readonly DocumentType[] = [33, 43, 46]

/**
 * EN: What the SII accepts in totals with an objection: a total of zero on a 33, 34, 43 or 46 (validation 10), a net
 * amount of zero on a 33, 43 or 46 (validation 12), and an invoice (33) whose net amount is not above zero (validation
 * 56), in that order.
 * ES: Lo que el SII acepta con reparo en los totales: un monto total en cero en un 33, 34, 43 o 46 (validación 10), un
 * monto neto en cero en un 33, 43 o 46 (validación 12), y una factura (33) cuyo monto neto no es mayor que cero
 * (validación 56), en ese orden.
 */
export const totalsWarnings = (type: DocumentType, totals: Totals): readonly DocumentWarning[] => {
  const net = totals.netAmount ?? 0
  return [
    ...(ZERO_TOTAL_TYPES.includes(type) && totals.totalAmount === 0
      ? [{ validation: 10, field: 'totals.totalAmount' } as const]
      : []),
    ...(ZERO_NET_TYPES.includes(type) && net === 0 ? [{ validation: 12, field: 'totals.netAmount' } as const] : []),
    ...(type === 33 && !(net > 0) ? [{ validation: 56, field: 'totals.netAmount' } as const] : []),
  ]
}
