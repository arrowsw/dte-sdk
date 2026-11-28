import { VAT_RATE, WITHHOLDING_TAX_CODES } from '../catalogs/codes'
import type { BookOperation } from '../catalogs/book-codes'
import { DteError } from '../errors'
import type { BookEntryInput, FolioConsumptionEntry, GuideEntryInput } from '../model/book'
import { compact } from '../model/codec'
import type { Document, Withholding } from '../model/document'
import { toSiiRut } from '../model/rut'
import { truncateText } from '../text/sanitize'
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
  /** EN: `negative` negates exempt, net, VAT, the other taxes and total of a credit note (61), and refuses one with a deposit guarantee (`GrntDep`) or with a VAT withholding booked in its own field of a sale line, since the book's `DepEnvase`, `IVARetTotal` and `IVARetParcial` hold no amount below zero. `positive` by default, as the format has it. ES: `negative` niega exento, neto, IVA, los otros impuestos y total de una nota de crédito (61), y rechaza una con garantía por depósito de envases (`GrntDep`) o con una retención de IVA que va en su propio campo de una línea de venta, porque `DepEnvase`, `IVARetTotal` e `IVARetParcial` del libro no admiten montos bajo cero. `positive` por defecto, como dice el formato. */
  readonly creditNoteSign?: 'positive' | 'negative'
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
 * voided-document reference are not inferred: spread them into the result when the case needs them. A tax without a
 * rate, as a specific tax may come (Formato DTE 2.5, field 116), travels without one (`TasaImp` is optional in
 * `OtrosImp`).
 * ES: Deriva una línea del libro desde un documento de la fase 1. La contraparte es el receptor si el dueño del libro
 * emitió el documento y el emisor en caso contrario, lo que cubre ventas, compras recibidas y facturas de compra (46) en
 * cualquier lado. El IVA que retiene una factura de compra va donde lo lleva cada lado. Una línea de venta tiene dos
 * campos para él y no lo lleva en `otherTaxes`: `totalVatWithheld` si se retuvo todo el IVA (código 15, o una tasa igual
 * a la del impuesto) y `partialVatWithheld` si se retuvo menos. Una línea de compra lo lleva en `otherTaxes`, bajo su
 * código y con su tasa. Los demás impuestos del documento viajan en `otherTaxes` en ambos lados, y su garantía por
 * depósito de envases (`GrntDep`), que su total incluye, en `containerDeposit` (`DepEnvase`). El nombre se trunca a
 * 50 porque el documento admite 100 y el campo del libro es opcional en documentos electrónicos. `Emisor`,
 * `IndFactCompra` y la referencia al documento anulado no se infieren: se agregan al resultado si el caso los necesita.
 * Un impuesto sin tasa, como puede venir un impuesto específico (Formato DTE 2.5, campo 116), viaja sin ella
 * (`TasaImp` es opcional en `OtrosImp`).
 * @throws {DteError} EN: `INVALID_RUT`; `INVALID_OPTION` with `creditNoteSign` in `details.field` for a `negative` sign on a credit note with a deposit guarantee or with a VAT withholding of a sale line, which `DepEnvase`, `IVARetTotal` and `IVARetParcial` (`MontoType`) cannot carry negated; `MISSING_FIELD` on `totals.withholdings`, with the code in `details.taxCode`, for a VAT withholding of a sale line other than code 15 without its rate, which cannot be told whole or partial. ES: `INVALID_RUT`; `INVALID_OPTION` con `creditNoteSign` en `details.field` ante un signo `negative` en una nota de crédito con garantía por depósito de envases o con una retención de IVA de una línea de venta, que `DepEnvase`, `IVARetTotal` e `IVARetParcial` (`MontoType`) no admiten negadas; `MISSING_FIELD` en `totals.withholdings`, con el código en `details.taxCode`, ante una retención de IVA de una línea de venta distinta del código 15 sin su tasa, que no se puede decir total ni parcial.
 */
export const bookEntryFromDocument = (document: Document, options: BookEntryFromDocumentOptions): BookEntryInput => {
  const { type, folio, issueDate, issuer, receiver, totals } = document.header
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
  // A withholding without its rate cannot be told whole or partial, and each goes in a field of its own: it is refused
  // rather than booked in the wrong one. Only code 15 is whole by its code.
  const whole = (item: Withholding): boolean => {
    if (item.taxCode === WITHHOLDING_TAX_CODES.totalVatWithholding) return true
    if (item.rate === undefined)
      throw new DteError('MISSING_FIELD', { field: 'totals.withholdings', taxCode: item.taxCode })
    return item.rate >= (totals.vatRate ?? VAT_RATE)
  }
  const withheld = (items: readonly Withholding[]): number | undefined =>
    items.reduce((total, item) => total + item.amount, 0) || undefined
  const own = withholdings.filter(ownField)
  // `IVARetTotal` and `IVARetParcial` are a `MontoType`, from zero up, as `DepEnvase` is: a negated withholding has no
  // field to go in. The other taxes (`MntImp`, a `ValorType`) take the sign of the line.
  if (negate && own.length > 0) throw new DteError('INVALID_OPTION', { field: 'creditNoteSign' })
  const otherTaxes = withholdings
    .filter((item) => !ownField(item))
    .map((item) => compact({ code: item.taxCode, rate: item.rate, amount: signed(item.amount) }))
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
 * EN: Derives a folio consumption line from a receipt (39 or 41).
 * ES: Deriva una línea del reporte de consumo de folios desde una boleta (39 o 41).
 * @throws {DteError} EN: `INVALID_DOCUMENT_TYPE` when the document is not a receipt. ES: `INVALID_DOCUMENT_TYPE` si el documento no es una boleta.
 */
export const folioConsumptionEntryFromDocument = (document: Document): FolioConsumptionEntry => {
  const { type, folio, issueDate, totals } = document.header
  if (type !== 39 && type !== 41) throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type', type })
  return compact({
    type,
    folio,
    issueDate,
    netAmount: totals.netAmount,
    vatAmount: totals.vatAmount,
    exemptAmount: totals.exemptAmount,
    totalAmount: totals.totalAmount,
  })
}
