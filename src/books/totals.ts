import { DteError } from '../errors'
import { isBookDocumentType } from '../catalogs/book-codes'
import type { BookEntry, BookSettlementTotals, BookTotals, BookTotalsInput } from '../model/book'
import { compact } from '../model/codec'
import { assertBookAmount } from './common'

// Amounts added field by field, whichever row they come from.
const OPTIONAL_FIELDS = [
  'voidedCount',
  'fixedAssetNetAmount',
  'fixedAssetVatAmount',
  'commonUseVatCount',
  'commonUseVat',
  'commonUseCredit',
  'lateVat',
  'ownVatAmount',
  'thirdPartyVatAmount',
  'freeZoneTax',
  'nonCreditableTax',
  'totalVatWithheld',
  'partialVatWithheld',
  'constructionCredit',
  'containerDeposit',
  'vatNotWithheld',
  'nonBillableAmount',
  'periodAmount',
  'domesticTickets',
  'internationalTickets',
  'cigars',
  'cigarettes',
  'processedTobacco',
  'vehicleTax',
] as const

const REQUIRED_FIELDS = ['documentCount', 'exemptAmount', 'netAmount', 'vatAmount', 'totalAmount'] as const

const SETTLEMENT_FIELDS = ['netValue', 'exemptValue', 'vatValue'] as const

const addOptional = (a: number | undefined, b: number | undefined): number | undefined =>
  a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0)

const mergeByCode = <T extends { readonly code: number }>(
  a: readonly T[] | undefined,
  b: readonly T[] | undefined,
  add: (left: T, right: T) => T,
): readonly T[] | undefined => {
  if (a === undefined && b === undefined) return undefined
  const merged = new Map<number, T>()
  for (const item of [...(a ?? []), ...(b ?? [])]) {
    const seen = merged.get(item.code)
    merged.set(item.code, seen === undefined ? item : add(seen, item))
  }
  return [...merged.values()]
}

const addSettlements = (
  a: BookSettlementTotals | undefined,
  b: BookSettlementTotals | undefined,
): BookSettlementTotals | undefined => {
  if (a === undefined && b === undefined) return undefined
  return compact(Object.fromEntries(SETTLEMENT_FIELDS.map((field) => [field, addOptional(a?.[field], b?.[field])])))
}

const addRows = (a: BookTotals, b: BookTotals): BookTotals =>
  compact({
    type: a.type,
    taxKind: a.taxKind ?? b.taxKind,
    ...Object.fromEntries(REQUIRED_FIELDS.map((field) => [field, a[field] + b[field]])),
    ...Object.fromEntries(OPTIONAL_FIELDS.map((field) => [field, addOptional(a[field], b[field])])),
    nonRecoverableVat: mergeByCode(a.nonRecoverableVat, b.nonRecoverableVat, (left, right) =>
      compact({ code: left.code, count: addOptional(left.count, right.count), amount: left.amount + right.amount }),
    ),
    otherTaxes: mergeByCode(a.otherTaxes, b.otherTaxes, (left, right) => ({
      code: left.code,
      amount: left.amount + right.amount,
    })),
    settlement: addSettlements(a.settlement, b.settlement),
  }) as BookTotals

/**
 * EN: Adds summaries by document type, and inside each type adds non-recoverable VAT and other taxes by code. Rows keep
 * the order of their first appearance, and a row present on one side only is kept. Use it to carry the period totals of
 * earlier submissions forward.
 * ES: Suma resúmenes por tipo de documento y, dentro de cada tipo, suma IVA no recuperable y otros impuestos por código.
 * Las filas conservan el orden en que aparecen por primera vez, y una fila presente en un solo lado se conserva. Sirve
 * para arrastrar los totales del período de envíos anteriores.
 */
export const accumulateBookTotals = (
  base: readonly BookTotals[],
  delta: readonly BookTotals[],
): readonly BookTotals[] => {
  const rows = new Map<number, BookTotals>()
  for (const row of [...base, ...delta]) {
    const seen = rows.get(row.type)
    rows.set(row.type, seen === undefined ? row : addRows(seen, row))
  }
  return [...rows.values()]
}

// `0 - value` rather than `-value`: a negated 0 would be -0, which prints the same but compares differently.
const signed =
  (remove: boolean) =>
  (value: number): number =>
    remove ? 0 - value : value

const signedOptional = (sign: (value: number) => number, value: number | undefined): number | undefined =>
  value === undefined ? undefined : sign(value)

const entryTotals = (entry: BookEntry): BookTotals => {
  const remove = entry.adjustment === 'remove'
  const sign = signed(remove)
  if (entry.voided)
    return {
      type: entry.type,
      documentCount: sign(1),
      voidedCount: sign(1),
      exemptAmount: 0,
      netAmount: 0,
      vatAmount: 0,
      totalAmount: 0,
    }
  const amount = (value: number | undefined): number | undefined => signedOptional(sign, value)
  return compact({
    type: entry.type,
    taxKind: entry.taxKind,
    documentCount: sign(1),
    exemptAmount: sign(entry.exemptAmount ?? 0),
    netAmount: sign(entry.netAmount ?? 0),
    vatAmount: sign(entry.vatAmount ?? 0),
    fixedAssetNetAmount: amount(entry.fixedAssetNetAmount),
    fixedAssetVatAmount: amount(entry.fixedAssetVatAmount),
    nonRecoverableVat: entry.nonRecoverableVat?.map((item) => ({
      code: item.code,
      count: sign(1),
      amount: sign(item.amount),
    })),
    commonUseVatCount: entry.commonUseVat === undefined ? undefined : sign(1),
    commonUseVat: amount(entry.commonUseVat),
    lateVat: amount(entry.lateVat),
    ownVatAmount: amount(entry.ownVatAmount),
    thirdPartyVatAmount: amount(entry.thirdPartyVatAmount),
    freeZoneTax: amount(entry.freeZoneTax),
    otherTaxes: entry.otherTaxes?.map((tax) => ({ code: tax.code, amount: sign(tax.amount) })),
    nonCreditableTax: amount(entry.nonCreditableTax),
    totalVatWithheld: amount(entry.totalVatWithheld),
    partialVatWithheld: amount(entry.partialVatWithheld),
    constructionCredit: amount(entry.constructionCredit),
    containerDeposit: amount(entry.containerDeposit),
    settlement:
      entry.settlement &&
      compact({
        netValue: amount(entry.settlement.netValue),
        exemptValue: amount(entry.settlement.exemptValue),
        vatValue: amount(entry.settlement.vatValue),
      }),
    totalAmount: sign(entry.totalAmount as number),
    vatNotWithheld: amount(entry.vatNotWithheld),
    nonBillableAmount: amount(entry.nonBillableAmount),
    periodAmount: amount(entry.periodAmount),
    domesticTickets: amount(entry.domesticTickets),
    internationalTickets: amount(entry.internationalTickets),
    cigars: amount(entry.cigars),
    cigarettes: amount(entry.cigarettes),
    processedTobacco: amount(entry.processedTobacco),
    vehicleTax: amount(entry.vehicleTax),
  })
}

/**
 * EN: The summary of a list of lines: one row per document type, `remove` lines with a negative sign.
 * ES: El resumen de una lista de líneas: una fila por tipo de documento, las líneas `remove` con signo negativo.
 */
export const sumBookEntries = (entries: readonly BookEntry[]): readonly BookTotals[] =>
  accumulateBookTotals([], entries.map(entryTotals))

/**
 * EN: Completes a row the caller provides: anything absent counts as 0.
 * ES: Completa una fila que entrega el llamador: lo que falte cuenta como 0.
 * @throws {DteError} EN: `INVALID_DOCUMENT_TYPE`, `INVALID_AMOUNT`. ES: los mismos códigos.
 */
export const normalizeBookTotals = (input: BookTotalsInput): BookTotals => {
  if (!isBookDocumentType(input.type)) throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type', type: input.type })
  for (const field of [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]) assertBookAmount(input[field], { field, signed: true })
  return {
    ...input,
    documentCount: input.documentCount ?? 0,
    exemptAmount: input.exemptAmount ?? 0,
    netAmount: input.netAmount ?? 0,
    vatAmount: input.vatAmount ?? 0,
    totalAmount: input.totalAmount ?? 0,
  }
}
