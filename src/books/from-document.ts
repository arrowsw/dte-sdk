import { WITHHOLDING_TAX_CODES } from '../catalogs/codes'
import type { BookOperation } from '../catalogs/book-codes'
import { DteError } from '../errors'
import type { BookEntryInput, FolioConsumptionEntry, GuideEntryInput } from '../model/book'
import { compact } from '../model/codec'
import type { Document } from '../model/document'
import { toSiiRut } from '../model/rut'
import { truncateText } from '../text/sanitize'

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
  /** EN: `negative` negates exempt, net, VAT and total of a credit note (61). `positive` by default, as the format has it. ES: `negative` niega exento, neto, IVA y total de una nota de crédito (61). `positive` por defecto, como dice el formato. */
  readonly creditNoteSign?: 'positive' | 'negative'
}

/**
 * EN: Derives a book line from a phase 1 document. The counterparty is the receiver when the book owner issued the
 * document and the issuer otherwise, which covers sales, purchases received and purchase invoices (46) on either side. The
 * name is truncated to 50 because the document admits 100 and the book field is optional on electronic documents. `Emisor`,
 * `IndFactCompra` and the voided-document reference are not inferred: spread them into the result when the case needs them.
 * ES: Deriva una línea del libro desde un documento de la fase 1. La contraparte es el receptor si el dueño del libro
 * emitió el documento y el emisor en caso contrario, lo que cubre ventas, compras recibidas y facturas de compra (46) en
 * cualquier lado. El nombre se trunca a 50 porque el documento admite 100 y el campo del libro es opcional en documentos
 * electrónicos. `Emisor`, `IndFactCompra` y la referencia al documento anulado no se infieren: se agregan al resultado si
 * el caso los necesita.
 * @throws {DteError} EN: `INVALID_RUT`. ES: `INVALID_RUT`.
 */
export const bookEntryFromDocument = (document: Document, options: BookEntryFromDocumentOptions): BookEntryInput => {
  const { type, folio, issueDate, issuer, receiver, totals } = document.header
  const counterparty = issuer.rut === toSiiRut(options.bookRut, 'bookRut') ? receiver : issuer
  const negate = options.creditNoteSign === 'negative' && type === CREDIT_NOTE_TYPE
  const signed = (value: number): number => (negate ? 0 - value : value)
  // Zero amounts stay absent: the sale defaults put them back, and purchase books omit them.
  const amount = (value: number | undefined): number | undefined => (value ? signed(value) : undefined)
  const withholdings = totals.withholdings ?? []
  const withheld = withholdings
    .filter((item) => item.taxCode === WITHHOLDING_TAX_CODES.totalVatWithholding)
    .reduce((total, item) => total + item.amount, 0)
  const otherTaxes = withholdings
    .filter((item) => item.taxCode !== WITHHOLDING_TAX_CODES.totalVatWithholding)
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
    totalVatWithheld: withheld === 0 ? undefined : withheld,
    settlement: totals.commissions && { issuerRut: issuer.rut, ...totals.commissions },
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
