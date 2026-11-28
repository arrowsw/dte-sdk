import { CHILEAN_PESO, VAT_RATE, WITHHOLDING_TAX_CODES } from '../catalogs/codes'
import type { BookOperation } from '../catalogs/book-codes'
import { isExport } from '../catalogs/document-types'
import { DteError } from '../errors'
import type { BookEntryInput, FolioConsumptionEntry, GuideEntryInput } from '../model/book'
import { compact } from '../model/codec'
import type { Document, Totals, Withholding } from '../model/document'
import { toSiiRut } from '../model/rut'
import { truncateText } from '../text/sanitize'
import { exchangeRateOf } from '../document/create'
import { convertToPesos } from '../totals/export'
import { RETENTION_TAX_CODES } from './entry'

const MAX_NAME = 50
const GUIDE_TYPE = 52
const SALE_TRANSFER = 1
const CREDIT_NOTE_TYPE = 61
// The credit note and the export credit note: `creditNoteSign` treats both alike.
const CREDIT_NOTE_TYPES: readonly number[] = [CREDIT_NOTE_TYPE, 112]

/**
 * EN: Options of `bookEntryFromDocument`.
 * ES: Opciones de `bookEntryFromDocument`.
 */
export type BookEntryFromDocumentOptions = {
  /** EN: RUT of the book owner: decides who the counterparty is. ES: RUT del dueño del libro: decide quién es la contraparte. */
  readonly bookRut: string
  /** EN: Book side. ES: Lado del libro. */
  readonly operation: BookOperation
  /** EN: `negative` negates exempt, net, VAT, the other taxes and total of a credit note, national (61) or of export (112), and refuses one with a deposit guarantee (`GrntDep`) or with a VAT withholding booked in its own field of a sale line, since the book's `DepEnvase`, `IVARetTotal` and `IVARetParcial` hold no amount below zero. `positive` by default, as the format has it. ES: `negative` niega exento, neto, IVA, los otros impuestos y total de una nota de crédito, nacional (61) o de exportación (112), y rechaza una con garantía por depósito de envases (`GrntDep`) o con una retención de IVA que va en su propio campo de una línea de venta, porque `DepEnvase`, `IVARetTotal` e `IVARetParcial` del libro no admiten montos bajo cero. `positive` por defecto, como dice el formato. */
  readonly creditNoteSign?: 'positive' | 'negative'
  /** EN: For an export document (110, 111, 112) that does not carry its totals in pesos (`OtraMoneda`), the rate its `TpoCambio` would have held: by Formato DTE 2.5, field 130, the exchange rate of the issue date of the document published by the Banco Central de Chile, in pesos per unit of its currency. It is checked as `createDocument` checks its `exchangeRate`: rounded half away from zero to four decimals, and refused unless it is above zero and, rounded, below 10^6. The exempt amount and the total are each converted with it and rounded once, half away from zero, to a whole peso, as `convertToPesos` does. On a document that carries its totals in pesos it is refused unless, rounded, it is the rate the document carries. ES: `TpoCambio` — Para un documento de exportación (110, 111, 112) que no lleva sus totales en pesos (`OtraMoneda`), el tipo de cambio que habría llevado su `TpoCambio`: según el Formato DTE 2.5, campo 130, el tipo de cambio de la fecha de emisión del documento publicado por el Banco Central de Chile, en pesos por unidad de su moneda. Se revisa como `createDocument` revisa su `exchangeRate`: redondeado, la mitad lejos de cero, a cuatro decimales, y rechazado salvo que esté sobre cero y, redondeado, bajo 10^6. El monto exento y el total se convierten cada uno con él y se redondean una vez, la mitad lejos de cero, a un peso entero, como hace `convertToPesos`. En un documento que lleva sus totales en pesos se rechaza salvo que, redondeado, sea el tipo de cambio que el documento lleva. */
  readonly exchangeRate?: number
}

// The book takes whole pesos (`ValorType`, written as a safe integer), and `MntExeOtrMnda` and `MntTotOtrMnda` admit
// four decimals.
const assertWholePesos = (value: number | undefined, details: { readonly field: string; readonly kind?: string }) => {
  if (value !== undefined && !Number.isSafeInteger(value)) throw new DteError('INVALID_AMOUNT', details)
}

const pesosOf = (totals: Pick<Totals, 'exemptAmount' | 'totalAmount'>, prefix: string, kind?: string): Totals => {
  assertWholePesos(totals.exemptAmount, { field: `${prefix}exemptAmount`, kind })
  assertWholePesos(totals.totalAmount, { field: `${prefix}totalAmount`, kind })
  return { exemptAmount: totals.exemptAmount, totalAmount: totals.totalAmount }
}

// "Formato de Información de Compras y Ventas" 2.2, section 1.4: "Todos los valores de montos deben venir en pesos".
// An export document (110, 111, 112) carries its amounts in its own currency (`Totales/TpoMoneda`), exempt as a whole,
// and in pesos in `OtraMoneda`: Formato DTE 2.5, in its changes of 2017-05-31, says that in an export document "es
// obligatorio informar la conversión a pesos chilenos", and fields 129, 130 and 132 ask `PESO CL`, the rate and the
// exempt amount in pesos. `DTE_v10.xsd` still lets a document go without it. The book takes the document's own totals
// when its currency is the peso, those of `OtraMoneda` when they are in pesos and bring the exempt amount the document
// has, or the two converted with a rate the caller gives; a rate the document does not carry is refused, and nothing
// is guessed. Each way, an amount that is not a whole number of pesos is refused, naming it.
const exportTotalsInPesos = (document: Document, exchangeRate: number | undefined): Totals => {
  const { type, currency, totals, otherCurrency } = document.header
  const rate = exchangeRate === undefined ? undefined : exchangeRateOf(exchangeRate)
  const assertCarried = (carried: number | undefined): void => {
    if (rate !== undefined && rate !== carried) throw new DteError('INVALID_OPTION', { field: 'exchangeRate' })
  }
  if (currency === CHILEAN_PESO) {
    assertCarried(undefined)
    return pesosOf(totals, 'totals.')
  }
  if (
    otherCurrency?.currency === CHILEAN_PESO &&
    (otherCurrency.exemptAmount !== undefined || totals.exemptAmount === undefined)
  ) {
    assertCarried(otherCurrency.exchangeRate)
    return pesosOf(otherCurrency, 'otherCurrency.')
  }
  if (rate === undefined) throw new DteError('MISSING_FIELD', { field: 'exchangeRate', type })
  const converted = {
    exemptAmount: totals.exemptAmount === undefined ? undefined : convertToPesos(totals.exemptAmount, rate),
    totalAmount: convertToPesos(totals.totalAmount, rate),
  }
  return pesosOf(converted, '', 'converted')
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
 * voided-document reference are not inferred: spread them into the result when the case needs them. A tax without a
 * rate, as a specific tax may come (Formato DTE 2.5, field 116), travels without one (`TasaImp` is optional in
 * `OtrosImp`). Every amount of a book is in pesos ("Formato de Información de Compras y Ventas" 2.2, section 1.4),
 * so an export document (110, 111, 112) enters it with its exempt amount and its total in pesos: its own when its
 * currency is the peso, those it carries in `OtraMoneda` (written when it was issued with `exchangeRate`), or, when
 * it carries none, its own converted with the `exchangeRate` option. An amount in pesos that is not whole is
 * refused: a document issued elsewhere whose `OtraMoneda` brings decimals is booked with a line written by hand. An
 * export without payment (`FmaPagExp` 21) enters with its exempt amount and a total of zero, which the book reports
 * as a total that does not match its formula (and refuses under `strictTotals`). Its foreign receiver (`Extranjero`)
 * is not inferred either.
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
 * (`TasaImp` es opcional en `OtrosImp`). Todos los montos de un libro van en pesos ("Formato de Información de
 * Compras y Ventas" 2.2, sección 1.4), así que un documento de exportación (110, 111, 112) entra con su monto exento
 * y su total en pesos: los suyos si su moneda es el peso, los que lleva en `OtraMoneda` (escritos si se emitió con
 * `exchangeRate`) o, si no lleva, los suyos convertidos con la opción `exchangeRate`. Un monto en pesos que no es
 * entero se rechaza: un documento emitido en otra parte cuyo `OtraMoneda` trae decimales se lleva al libro con una
 * línea escrita a mano. Una exportación sin pago (`FmaPagExp` 21) entra con su monto exento y un total de cero, que
 * el libro informa como un total que no calza con su fórmula (y rechaza con `strictTotals`). Su receptor extranjero
 * (`Extranjero`) tampoco se infiere.
 * @throws {DteError} EN: `INVALID_RUT`; `INVALID_OPTION` with `creditNoteSign` in `details.field` for a `negative` sign on a credit note with a deposit guarantee or with a VAT withholding of a sale line, which `DepEnvase`, `IVARetTotal` and `IVARetParcial` (`MontoType`) cannot carry negated; `MISSING_FIELD` on `totals.withholdings`, with the code in `details.taxCode`, for a VAT withholding of a sale line other than code 15 without its rate, which cannot be told whole or partial; `MISSING_FIELD` with `exchangeRate` in `details.field` and the type in `details.type` for an export document without its totals in pesos and without the option; `INVALID_AMOUNT` with `exchangeRate` in `details.field` for a rate `createDocument` would refuse, and, for an amount in pesos that is not a whole safe integer, with the amount in `details.field`: `totals.exemptAmount` or `totals.totalAmount` for a document in pesos, `otherCurrency.exemptAmount` or `otherCurrency.totalAmount` for its `OtraMoneda`, and `exemptAmount` or `totalAmount` with `converted` in `details.kind` for one converted with the option; `INVALID_OPTION` with `exchangeRate` in `details.field` for a rate on a document that is not an export one, or that, rounded, differs from the one an export document carries. The book RUT is checked first. ES: `INVALID_RUT`; `INVALID_OPTION` con `creditNoteSign` en `details.field` ante un signo `negative` en una nota de crédito con garantía por depósito de envases o con una retención de IVA de una línea de venta, que `DepEnvase`, `IVARetTotal` e `IVARetParcial` (`MontoType`) no admiten negadas; `MISSING_FIELD` en `totals.withholdings`, con el código en `details.taxCode`, ante una retención de IVA de una línea de venta distinta del código 15 sin su tasa, que no se puede decir total ni parcial; `MISSING_FIELD` con `exchangeRate` en `details.field` y el tipo en `details.type` ante un documento de exportación sin sus totales en pesos y sin la opción; `INVALID_AMOUNT` con `exchangeRate` en `details.field` ante un tipo de cambio que `createDocument` rechazaría, y, ante un monto en pesos que no es un entero seguro, con el monto en `details.field`: `totals.exemptAmount` o `totals.totalAmount` en un documento en pesos, `otherCurrency.exemptAmount` u `otherCurrency.totalAmount` en su `OtraMoneda`, y `exemptAmount` o `totalAmount` con `converted` en `details.kind` en uno convertido con la opción; `INVALID_OPTION` con `exchangeRate` en `details.field` ante un tipo de cambio en un documento que no es de exportación, o que, redondeado, difiere del que lleva un documento de exportación. El RUT del libro se revisa primero.
 */
export const bookEntryFromDocument = (document: Document, options: BookEntryFromDocumentOptions): BookEntryInput => {
  const { type, folio, issueDate, issuer, receiver } = document.header
  const counterparty = issuer.rut === toSiiRut(options.bookRut, 'bookRut') ? receiver : issuer
  const totals = totalsInPesos(document, options.exchangeRate)
  const negate = options.creditNoteSign === 'negative' && CREDIT_NOTE_TYPES.includes(type)
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
