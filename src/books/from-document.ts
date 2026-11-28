import { CHILEAN_PESO, VAT_RATE, WITHHOLDING_TAX_CODES } from '../catalogs/codes'
import type { BookOperation } from '../catalogs/book-codes'
import { isExport } from '../catalogs/document-types'
import { DteError } from '../errors'
import type { BookEntryInput, FolioConsumptionEntry, GuideEntryInput } from '../model/book'
import { compact } from '../model/codec'
import type { Document, Totals, Withholding } from '../model/document'
import { toSiiRut } from '../model/rut'
import { truncateText } from '../text/sanitize'
import { convertToPesos, roundHalfAwayFromZero } from '../totals/export'
import { RETENTION_TAX_CODES } from './entry'

const MAX_NAME = 50
const GUIDE_TYPE = 52
const SALE_TRANSFER = 1
const CREDIT_NOTE_TYPE = 61

/**
 * EN: Options of `bookEntryFromDocument`.
 * ES: Opciones de `bookEntryFromDocument`.
 */
export type BookEntryFromDocumentOptions = {
  /** EN: RUT of the book owner: decides who the counterparty is. ES: RUT del dueño del libro: decide quién es la contraparte. */
  readonly bookRut: string
  /** EN: Book side. ES: Lado del libro. */
  readonly operation: BookOperation
  /** EN: `negative` negates exempt, net, VAT and total of a credit note (61), and refuses one with a deposit guarantee (`GrntDep`), since the book's `DepEnvase` holds no amount below zero. `positive` by default, as the format has it. ES: `negative` niega exento, neto, IVA y total de una nota de crédito (61), y rechaza una con garantía por depósito de envases (`GrntDep`), porque el `DepEnvase` del libro no admite montos bajo cero. `positive` por defecto, como dice el formato. */
  readonly creditNoteSign?: 'positive' | 'negative'
  /** EN: Pesos per unit of the currency of an export document (110, 111, 112) that does not carry its totals in pesos (`OtraMoneda`): its exempt amount and its total are each converted with it and rounded once, half away from zero, to a whole peso, as `convertToPesos` does. Rounded to four decimals, above zero and below 10^6, as the document's `TpoCambio`. Refused on a document that already carries its totals in pesos unless it is the rate the document carries. ES: `TpoCambio` — Pesos por unidad de la moneda de un documento de exportación (110, 111, 112) que no lleva sus totales en pesos (`OtraMoneda`): su monto exento y su total se convierten cada uno con él y se redondean una vez, la mitad lejos de cero, a un peso entero, como hace `convertToPesos`. Redondeado a cuatro decimales, sobre cero y bajo 10^6, como el `TpoCambio` del documento. Se rechaza en un documento que ya lleva sus totales en pesos, salvo que sea el tipo de cambio que el documento lleva. */
  readonly exchangeRate?: number
}

// `TpoCambio` of `DTE_v10.xsd`: six digits, four of them decimals.
const RATE_DECIMALS = 4
const RATE_LIMIT = 1_000_000

const rateOf = (value: number): number => {
  const rate = Number.isFinite(value) && Math.abs(value) < RATE_LIMIT ? roundHalfAwayFromZero(value, RATE_DECIMALS) : 0
  if (!(rate > 0)) throw new DteError('INVALID_AMOUNT', { field: 'exchangeRate' })
  return rate
}

// The book takes whole pesos (`ValorType`), and `MntExeOtrMnda` and `MntTotOtrMnda` admit four decimals.
const assertWholePesos = (value: number | undefined, field: string): void => {
  if (value !== undefined && !Number.isSafeInteger(value)) throw new DteError('INVALID_AMOUNT', { field })
}

// "Formato de Información de Compras y Ventas" 2.2, section 1.4: "Todos los valores de montos deben venir en pesos".
// An export document (110, 111, 112) carries its amounts in its own currency (`Totales/TpoMoneda`), exempt as a whole,
// and in pesos only in `OtraMoneda`, which Formato DTE 2.5 leaves optional. The book takes the document's own totals
// when its currency is the peso, those of `OtraMoneda` when they are in pesos and bring the exempt amount the document
// has, or the two converted with a rate the caller gives; a rate the document does not carry is refused, and nothing
// is guessed.
const exportTotalsInPesos = (document: Document, exchangeRate: number | undefined): Totals => {
  const { type, currency, totals, otherCurrency } = document.header
  const rate = exchangeRate === undefined ? undefined : rateOf(exchangeRate)
  const assertCarried = (carried: number | undefined): void => {
    if (rate !== undefined && rate !== carried) throw new DteError('INVALID_OPTION', { field: 'exchangeRate' })
  }
  if (currency === CHILEAN_PESO) {
    assertCarried(undefined)
    return totals
  }
  if (
    otherCurrency?.currency === CHILEAN_PESO &&
    (otherCurrency.exemptAmount !== undefined || totals.exemptAmount === undefined)
  ) {
    assertCarried(otherCurrency.exchangeRate)
    assertWholePesos(otherCurrency.exemptAmount, 'otherCurrency.exemptAmount')
    assertWholePesos(otherCurrency.totalAmount, 'otherCurrency.totalAmount')
    return { exemptAmount: otherCurrency.exemptAmount, totalAmount: otherCurrency.totalAmount }
  }
  if (rate === undefined) throw new DteError('MISSING_FIELD', { field: 'exchangeRate', type })
  return {
    exemptAmount: totals.exemptAmount === undefined ? undefined : convertToPesos(totals.exemptAmount, rate),
    totalAmount: convertToPesos(totals.totalAmount, rate),
  }
}

// A rate is of an export document alone: on any other it is a mistake, as `createDocument` has it.
const totalsInPesos = (document: Document, exchangeRate: number | undefined): Totals => {
  if (isExport(document.header.type)) return exportTotalsInPesos(document, exchangeRate)
  if (exchangeRate !== undefined) throw new DteError('INVALID_OPTION', { field: 'exchangeRate' })
  return document.header.totals
}

/**
 * EN: Derives a book line from a phase 1 document. The counterparty is the receiver when the book owner issued the
 * document and the issuer otherwise, which covers sales, purchases received and purchase invoices (46) on either side.
 * The VAT a purchase invoice withholds goes where each side carries it. A sale line has two fields for it and takes none
 * in `otherTaxes`: `totalVatWithheld` when the whole VAT was withheld (code 15, or a rate that is the rate of the tax)
 * and `partialVatWithheld` when less was. A purchase line takes it in `otherTaxes`, under its code and with its rate.
 * The other taxes of the document travel in `otherTaxes` on both sides, and its deposit guarantee for containers
 * (`GrntDep`), which its total includes, in `containerDeposit` (`DepEnvase`). The name is truncated to 50 because the
 * document admits 100 and the book field is optional on electronic documents. `Emisor`, `IndFactCompra` and the
 * voided-document reference are not inferred: spread them into the result when the case needs them. Every amount of
 * a book is in pesos ("Formato de Información de Compras y Ventas" 2.2, section 1.4), so an export document (110, 111,
 * 112) enters it with its exempt amount and its total in pesos: its own when its currency is the peso, those it carries
 * in `OtraMoneda` (written when it was issued with `exchangeRate`), or, when it carries none, its own converted with the
 * `exchangeRate` option. Its foreign receiver (`Extranjero`) is not inferred either.
 * ES: Deriva una línea del libro desde un documento de la fase 1. La contraparte es el receptor si el dueño del libro
 * emitió el documento y el emisor en caso contrario, lo que cubre ventas, compras recibidas y facturas de compra (46) en
 * cualquier lado. El IVA que retiene una factura de compra va donde lo lleva cada lado. Una línea de venta tiene dos
 * campos para él y no lo lleva en `otherTaxes`: `totalVatWithheld` si se retuvo todo el IVA (código 15, o una tasa igual
 * a la del impuesto) y `partialVatWithheld` si se retuvo menos. Una línea de compra lo lleva en `otherTaxes`, bajo su
 * código y con su tasa. Los demás impuestos del documento viajan en `otherTaxes` en ambos lados, y su garantía por
 * depósito de envases (`GrntDep`), que su total incluye, en `containerDeposit` (`DepEnvase`). El nombre se trunca a
 * 50 porque el documento admite 100 y el campo del libro es opcional en documentos electrónicos. `Emisor`,
 * `IndFactCompra` y la referencia al documento anulado no se infieren: se agregan al resultado si el caso los necesita.
 * Todos los montos de un libro van en pesos ("Formato de Información de Compras y Ventas" 2.2, sección 1.4), así que un
 * documento de exportación (110, 111, 112) entra con su monto exento y su total en pesos: los suyos si su moneda es el
 * peso, los que lleva en `OtraMoneda` (escritos si se emitió con `exchangeRate`) o, si no lleva, los suyos convertidos
 * con la opción `exchangeRate`. Su receptor extranjero (`Extranjero`) tampoco se infiere.
 * @throws {DteError} EN: `INVALID_RUT`; `INVALID_OPTION` with `creditNoteSign` in `details.field` for a `negative` sign on a credit note with a deposit guarantee, which `DepEnvase` (`MontoType`) cannot carry negated; `MISSING_FIELD` with `exchangeRate` in `details.field` and the type in `details.type` for an export document without its totals in pesos and without the option; `INVALID_AMOUNT` with `exchangeRate` in `details.field` for a rate that is not above zero and below 10^6 with four decimals, and with `otherCurrency.exemptAmount` or `otherCurrency.totalAmount` for totals in pesos that are not whole; `INVALID_OPTION` with `exchangeRate` in `details.field` for a rate on a document that is not an export one, or that differs from the one an export document carries. ES: `INVALID_RUT`; `INVALID_OPTION` con `creditNoteSign` en `details.field` ante un signo `negative` en una nota de crédito con garantía por depósito de envases, que `DepEnvase` (`MontoType`) no admite negada; `MISSING_FIELD` con `exchangeRate` en `details.field` y el tipo en `details.type` ante un documento de exportación sin sus totales en pesos y sin la opción; `INVALID_AMOUNT` con `exchangeRate` en `details.field` ante un tipo de cambio que no está sobre cero y bajo 10^6 con cuatro decimales, y con `otherCurrency.exemptAmount` u `otherCurrency.totalAmount` ante totales en pesos que no son enteros; `INVALID_OPTION` con `exchangeRate` en `details.field` ante un tipo de cambio en un documento que no es de exportación, o distinto del que lleva un documento de exportación.
 */
export const bookEntryFromDocument = (document: Document, options: BookEntryFromDocumentOptions): BookEntryInput => {
  const { type, folio, issueDate, issuer, receiver } = document.header
  const totals = totalsInPesos(document, options.exchangeRate)
  const counterparty = issuer.rut === toSiiRut(options.bookRut, 'bookRut') ? receiver : issuer
  const negate = options.creditNoteSign === 'negative' && type === CREDIT_NOTE_TYPE
  // `DepEnvase` is a `MontoType` of `LibroCV_v10.xsd`, from zero up: a negated guarantee has no field to go in.
  if (negate && totals.depositGuarantee) throw new DteError('INVALID_OPTION', { field: 'creditNoteSign' })
  const signed = (value: number): number => (negate ? 0 - value : value)
  // Zero amounts stay absent: the sale defaults put them back, and purchase books omit them.
  const amount = (value: number | undefined): number | undefined => (value ? signed(value) : undefined)
  const withholdings = totals.withholdings ?? []
  // A purchase line carries the VAT a purchase invoice withholds in `OtrosImp`, under its code and with its rate, as
  // every other tax (the format, section 3.4). A sale line must not (section 2.4): it has `IVARetTotal` for a
  // withholding of the whole VAT, which code 15 always is and any other code is at the rate of the tax, and
  // `IVARetParcial` for a lesser one.
  const ownField = (item: Withholding): boolean =>
    options.operation === 'sale' && RETENTION_TAX_CODES.includes(item.taxCode)
  const whole = (item: Withholding): boolean =>
    item.taxCode === WITHHOLDING_TAX_CODES.totalVatWithholding || item.rate >= (totals.vatRate ?? VAT_RATE)
  const withheld = (items: readonly Withholding[]): number | undefined =>
    items.reduce((total, item) => total + item.amount, 0) || undefined
  const own = withholdings.filter(ownField)
  const otherTaxes = withholdings
    .filter((item) => !ownField(item))
    .map((item) => ({ code: item.taxCode, rate: item.rate, amount: item.amount }))
  return compact({
    type,
    folio,
    taxRate: totals.vatRate,
    date: issueDate,
    counterpartyRut: counterparty.rut,
    counterpartyName: truncateText(counterparty.businessName, MAX_NAME),
    exemptAmount: amount(totals.exemptAmount),
    netAmount: amount(totals.netAmount),
    vatAmount: amount(totals.vatAmount),
    ownVatAmount: totals.ownVatAmount,
    thirdPartyVatAmount: totals.thirdPartyVatAmount,
    otherTaxes: otherTaxes.length === 0 ? undefined : otherTaxes,
    totalVatWithheld: withheld(own.filter(whole)),
    partialVatWithheld: withheld(own.filter((item) => !whole(item))),
    settlement: totals.commissions && { issuerRut: issuer.rut, ...totals.commissions },
    containerDeposit: amount(totals.depositGuarantee),
    totalAmount: signed(totals.totalAmount),
    nonBillableAmount: totals.nonBillableAmount,
    periodAmount: totals.periodAmount,
  })
}

/**
 * EN: Derives a guide book line from a dispatch guide (52). The transfer defaults to a sale, and the receiver and the
 * amounts travel only on sales; a non-sale guide reports its total alone.
 * ES: Deriva una línea del libro de guías desde una guía de despacho (52). El traslado es venta por defecto, y el receptor
 * y los montos viajan solo en ventas; una guía no venta informa únicamente su total.
 * @throws {DteError} EN: `INVALID_DOCUMENT_TYPE` when the document is not a guide. ES: `INVALID_DOCUMENT_TYPE` si el documento no es una guía.
 */
export const guideEntryFromDocument = (document: Document): GuideEntryInput => {
  const { type, folio, issueDate, receiver, totals, options } = document.header
  if (type !== GUIDE_TYPE) throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type', type })
  const transferType = options.transferType ?? SALE_TRANSFER
  const shared = { folio, transferType, date: issueDate, totalAmount: totals.totalAmount }
  if (transferType !== SALE_TRANSFER) return shared
  return compact({
    ...shared,
    receiverRut: receiver.rut,
    receiverName: truncateText(receiver.businessName, MAX_NAME),
    netAmount: totals.netAmount,
    taxRate: totals.vatRate,
    vatAmount: totals.vatAmount,
  })
}

/**
 * EN: Derives a folio consumption line from a receipt (39 or 41) or a credit note (61), the three types
 * `ConsumoFolio_v10.xsd` admits in a summary; the format of the report, of 2020, names the two receipts alone. A credit
 * note carries its net, its VAT and its exempt amount, as a receipt does. Which credit notes go in a report is the
 * caller's to say: the function does not look at the document the note changes. It refuses a note whose total is not the
 * sum of those three amounts, which is how field 6 of the format defines the total of a summary: one with withheld VAT,
 * another tax or a deposit guarantee, none of which a receipt carries.
 * ES: Deriva una línea del reporte de consumo de folios desde una boleta (39 o 41) o una nota de crédito (61), los tres
 * tipos que `ConsumoFolio_v10.xsd` admite en un resumen; el formato del reporte, de 2020, nombra solo las dos boletas.
 * Una nota de crédito lleva su neto, su IVA y su exento, como una boleta. Qué notas de crédito van en un reporte lo
 * decide quien llama: la función no mira el documento que la nota cambia. Rechaza una nota cuyo total no es la suma de
 * esos tres montos, que es como el campo 6 del formato define el total de un resumen: una con IVA retenido, otro
 * impuesto o una garantía por depósito de envases, que una boleta no lleva.
 * @throws {DteError} EN: `INVALID_DOCUMENT_TYPE` when the document is neither a receipt nor a credit note; `BOOK_TOTAL_MISMATCH` when the total of a credit note is not its net plus its VAT plus its exempt amount. ES: `INVALID_DOCUMENT_TYPE` si el documento no es una boleta ni una nota de crédito; `BOOK_TOTAL_MISMATCH` si el total de una nota de crédito no es su neto más su IVA más su exento.
 */
export const folioConsumptionEntryFromDocument = (document: Document): FolioConsumptionEntry => {
  const { type, folio, issueDate, totals } = document.header
  if (type !== 39 && type !== 41 && type !== CREDIT_NOTE_TYPE)
    throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type', type })
  const { netAmount, vatAmount, exemptAmount, totalAmount } = totals
  // A receipt's total is always the sum; `createDocument` refuses on a receipt what would make it something else.
  const expected = (netAmount ?? 0) + (vatAmount ?? 0) + (exemptAmount ?? 0)
  if (type === CREDIT_NOTE_TYPE && totalAmount !== expected)
    throw new DteError('BOOK_TOTAL_MISMATCH', { field: 'totalAmount', expected, actual: totalAmount })
  return compact({ type, folio, issueDate, netAmount, vatAmount, exemptAmount, totalAmount })
}
