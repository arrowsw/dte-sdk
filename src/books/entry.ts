import { VAT_RATE } from '../catalogs/codes'
import { isBookDocumentType, type BookOperation, type BookSubmission } from '../catalogs/book-codes'
import { DteError } from '../errors'
import type { BookEntry, BookEntryInput, BookTotalMismatch } from '../model/book'
import { compact } from '../model/codec'
import { toSiiRut } from '../model/rut'
import { assertMaxLength, sanitizeText } from '../text/sanitize'
import { assertBookAmount, assertBookFolio, assertBookRate, toBookDate } from './common'

const MAX_NAME = 50
const MAX_INTERNAL_NUMBER = 10
const MAX_FOREIGN_ID = 20
const MAX_NATIONALITY = 3
const MAX_NON_RECOVERABLE_VAT = 5
const MAX_OTHER_TAXES = 20
const MAX_BRANCH_CODE = 999_999_999

// Fields the schema types as `ValorType`, which admits negatives on settlements and adjustments.
const SIGNED_AMOUNTS = [
  'exemptAmount',
  'netAmount',
  'vatAmount',
  'ownVatAmount',
  'thirdPartyVatAmount',
  'totalAmount',
  'nonBillableAmount',
  'periodAmount',
] as const

// Fields the schema types as `MontoType`: never negative.
const UNSIGNED_AMOUNTS = [
  'fixedAssetNetAmount',
  'fixedAssetVatAmount',
  'commonUseVat',
  'lateVat',
  'freeZoneTax',
  'nonCreditableTax',
  'totalVatWithheld',
  'partialVatWithheld',
  'constructionCredit',
  'containerDeposit',
  'vatNotWithheld',
  'domesticTickets',
  'internationalTickets',
  'cigars',
  'cigarettes',
  'processedTobacco',
  'vehicleTax',
] as const

// The codes of withheld VAT (the format's table 7): 15 for a whole withholding that follows no change of subject, and
// the codes by product with their whole-withholding pairs. On a purchase book the withheld VAT travels under them in
// `OtrosImp` and the total leaves it out (section 3.4, fields 21 to 25). Code 35 is the gasoline tax, despite the
// "30 to 41" range the format mentions.
export const RETENTION_TAX_CODES: readonly number[] = [
  15, 30, 31, 32, 33, 34, 36, 37, 38, 39, 41, 47, 48, 49, 301, 321, 331, 341, 361, 371, 481,
]
const INITIAL_INVOICE_RETENTION = 60

// `IVARetTotal` and `IVARetParcial` are fields of the sales detail alone (the format, sections 2.4 and 3.4). A purchase
// line carries the withheld VAT in `otherTaxes`, under its code, and its total takes it off from there: one of these
// two on it would be written and leave the total as if nothing had been withheld.
const SALE_WITHHOLDINGS = ['totalVatWithheld', 'partialVatWithheld'] as const

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0)

/**
 * EN: The SII formula for a line total, per book side (sections 2.4 and 3.4 of the format). The withheld VAT of a
 * purchase invoice comes off the total on both sides, and each side carries it in its own fields: a sale line in
 * `totalVatWithheld` and `partialVatWithheld` (`IVARetTotal`, `IVARetParcial`, fields of the sales detail alone), and a
 * purchase line in `otherTaxes` under a withholding code, 15 when the whole VAT was withheld. The sales detail takes no
 * withholding code in `otherTaxes`, so one left there on a sale line is added like any other tax.
 * ES: La fórmula del SII para el total de una línea, según el lado del libro (secciones 2.4 y 3.4 del formato). El IVA
 * retenido de una factura de compra se resta del total en ambos lados, y cada lado lo lleva en sus propios campos: una
 * línea de venta en `totalVatWithheld` y `partialVatWithheld` (`IVARetTotal`, `IVARetParcial`, campos solo del detalle
 * de ventas), y una línea de compra en `otherTaxes` bajo un código de retención, 15 cuando se retuvo todo el IVA. El
 * detalle de ventas no admite códigos de retención en `otherTaxes`, así que uno dejado ahí en una línea de venta se
 * suma como cualquier otro impuesto.
 */
export const expectedBookEntryTotal = (entry: BookEntryInput, operation: BookOperation): number => {
  const subtracts = (code: number): boolean =>
    code === INITIAL_INVOICE_RETENTION || (operation === 'purchase' && RETENTION_TAX_CODES.includes(code))
  const taxes = sum((entry.otherTaxes ?? []).map((tax) => (subtracts(tax.code) ? -tax.amount : tax.amount)))
  const base =
    (entry.netAmount ?? 0) + (entry.exemptAmount ?? 0) + (entry.vatAmount ?? 0) + taxes + (entry.containerDeposit ?? 0)
  if (operation === 'sale')
    return (
      base -
      (entry.partialVatWithheld ?? 0) -
      (entry.totalVatWithheld ?? 0) -
      (entry.constructionCredit ?? 0) -
      (entry.settlement?.exemptValue ?? 0) -
      (entry.settlement?.netValue ?? 0) -
      (entry.settlement?.vatValue ?? 0)
    )
  return (
    base +
    (entry.commonUseVat ?? 0) +
    sum((entry.nonRecoverableVat ?? []).map((item) => item.amount)) +
    (entry.nonCreditableTax ?? 0)
  )
}

const validate = (input: BookEntryInput, index: number): void => {
  if (!isBookDocumentType(input.type))
    throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type', type: input.type, index })
  assertBookFolio(input.folio, 'folio', index)
  if (input.referenceType !== undefined && !isBookDocumentType(input.referenceType))
    throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'referenceType', type: input.referenceType, index })
  if (input.referenceFolio !== undefined) assertBookFolio(input.referenceFolio, 'referenceFolio', index)
  if (
    input.branchCode !== undefined &&
    !(Number.isSafeInteger(input.branchCode) && input.branchCode > 0 && input.branchCode <= MAX_BRANCH_CODE)
  )
    throw new DteError('INVALID_OPTION', { field: 'branchCode', index })
  if ((input.nonRecoverableVat ?? []).length > MAX_NON_RECOVERABLE_VAT)
    throw new DteError('INVALID_OPTION', { field: 'nonRecoverableVat', index })
  if ((input.otherTaxes ?? []).length > MAX_OTHER_TAXES)
    throw new DteError('INVALID_OPTION', { field: 'otherTaxes', index })
  for (const field of SIGNED_AMOUNTS) assertBookAmount(input[field], { field, signed: true, index })
  for (const field of UNSIGNED_AMOUNTS) assertBookAmount(input[field], { field, signed: false, index })
  for (const item of input.nonRecoverableVat ?? [])
    assertBookAmount(item.amount, { field: 'nonRecoverableVat.amount', signed: false, index })
  for (const tax of input.otherTaxes ?? []) {
    assertBookAmount(tax.amount, { field: 'otherTaxes.amount', signed: true, index })
    assertBookRate(tax.rate, 'otherTaxes.rate', index)
  }
  assertBookRate(input.taxRate, 'taxRate', index)
  for (const value of [input.settlement?.netValue, input.settlement?.exemptValue, input.settlement?.vatValue])
    assertBookAmount(value, { field: 'settlement', signed: true, index })
}

const text = (value: string | undefined, maxLength: number, field: string): string | undefined => {
  if (value === undefined) return undefined
  const sanitized = sanitizeText(value)
  assertMaxLength(sanitized, maxLength, field)
  return sanitized
}

// Field-observed SII rules on purchase books: with common-use or non-recoverable VAT, the rate and the recoverable VAT
// default to 0 and `MntNeto` must be present (a missing one produced `LBR-3`); with a rate and no net, net and VAT must be
// explicit zeros (omitting them produced `LRH` with `LBR-3`, zeros produced `LOK` with `LBR-2`).
const purchaseDefaults = (input: BookEntryInput): Partial<BookEntryInput> => {
  const noRecoverableVat = input.commonUseVat !== undefined || input.nonRecoverableVat !== undefined
  if (noRecoverableVat)
    return { netAmount: input.netAmount ?? 0, vatAmount: input.vatAmount ?? 0, taxRate: input.taxRate ?? 0 }
  if (input.taxRate !== undefined && input.netAmount === undefined)
    return { netAmount: 0, vatAmount: input.vatAmount ?? 0 }
  return {}
}

const saleDefaults = (input: BookEntryInput): Partial<BookEntryInput> => ({
  exemptAmount: input.exemptAmount ?? 0,
  netAmount: input.netAmount ?? 0,
  vatAmount: input.vatAmount ?? 0,
})

const withRate = (entry: BookEntryInput): BookEntryInput =>
  entry.taxRate === undefined && (entry.netAmount ?? 0) > 0 && (entry.vatAmount ?? 0) > 0
    ? { ...entry, taxRate: VAT_RATE }
    : entry

/**
 * EN: Result of `normalizeBookEntry`.
 * ES: Resultado de `normalizeBookEntry`.
 */
export type NormalizedBookEntry = {
  /** EN: The line, ready to serialize. ES: La línea, lista para serializar. */
  readonly entry: BookEntry
  /** EN: The difference with the formula, when the total was explicit and does not match. ES: La diferencia con la fórmula, si el total era explícito y no calza. */
  readonly mismatch: BookTotalMismatch | null
}

/**
 * EN: Validates and normalizes one line: voided lines keep only type and folio, and the defaults of each book side and
 * the total apply to the rest.
 * ES: Valida y normaliza una línea: las anuladas conservan solo tipo y folio, y al resto se le aplican los valores por
 * defecto de cada lado del libro y el total.
 * @throws {DteError} EN: `INVALID_DOCUMENT_TYPE`, `INVALID_FOLIO`, `INVALID_AMOUNT`, `INVALID_DATE`, `INVALID_RUT`, `INVALID_OPTION` (among others, a purchase line that brings `totalVatWithheld` or `partialVatWithheld`, with it in `details.field`), `FIELD_TOO_LONG`. ES: los mismos códigos; `INVALID_OPTION`, entre otros casos, ante una línea de compra que trae `totalVatWithheld` o `partialVatWithheld`, con él en `details.field`.
 */
export const normalizeBookEntry = (
  input: BookEntryInput,
  options: { readonly operation: BookOperation; readonly submission: BookSubmission; readonly index: number },
): NormalizedBookEntry => {
  const { operation, submission, index } = options
  validate(input, index)
  if (operation === 'purchase')
    for (const field of SALE_WITHHOLDINGS)
      if (input[field] !== undefined) throw new DteError('INVALID_OPTION', { field, index })
  const adjustment = input.adjustment ?? (submission === 'adjustment' ? 'add' : undefined)
  if (input.voided)
    return {
      entry: { type: input.type, folio: input.folio, voided: true, ...(adjustment ? { adjustment } : {}) },
      mismatch: null,
    }
  const defaults = operation === 'sale' ? saleDefaults(input) : purchaseDefaults(input)
  const filled = withRate({ ...input, ...defaults })
  const expected = expectedBookEntryTotal(filled, operation)
  const entry: BookEntry = compact({
    ...filled,
    adjustment,
    date: filled.date === undefined ? undefined : toBookDate(filled.date, 'date'),
    counterpartyRut:
      filled.counterpartyRut === undefined ? undefined : toSiiRut(filled.counterpartyRut, 'counterpartyRut'),
    counterpartyName: text(filled.counterpartyName, MAX_NAME, 'RznSoc'),
    internalNumber: text(filled.internalNumber, MAX_INTERNAL_NUMBER, 'NumInt'),
    foreignReceiver:
      filled.foreignReceiver &&
      compact({
        id: text(filled.foreignReceiver.id, MAX_FOREIGN_ID, 'NumId'),
        nationality: text(filled.foreignReceiver.nationality, MAX_NATIONALITY, 'Nacionalidad'),
      }),
    settlement: filled.settlement && {
      ...filled.settlement,
      issuerRut: toSiiRut(filled.settlement.issuerRut, 'settlement.issuerRut'),
    },
    totalAmount: filled.totalAmount ?? expected,
  })
  return {
    entry,
    mismatch:
      filled.totalAmount === undefined || filled.totalAmount === expected
        ? null
        : { index, type: input.type, folio: input.folio, expected, actual: filled.totalAmount },
  }
}
