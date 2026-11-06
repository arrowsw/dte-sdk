/**
 * EN: The English domain model of the three SII books. `./sii-book` holds the official tags and `./book-codec` converts
 * from one to the other. Every `ES:` line names the SII tag the field produces.
 * ES: El modelo de dominio en inglés de los tres libros del SII. `./sii-book` tiene las etiquetas oficiales y
 * `./book-codec` convierte de uno a otro. Cada línea `ES:` nombra la etiqueta SII que produce el campo.
 */
import type {
  BookAdjustment,
  BookKind,
  BookOperation,
  BookSubmission,
  GuideVoidCode,
  NonRecoverableVatCode,
} from '../catalogs/book-codes'
import type { SiiRut } from './rut'

/**
 * EN: Cover fields common to the purchase and sales book and the guide book, as the caller provides them.
 * ES: `Caratula` — Campos comunes de la carátula del libro de compras y ventas y del libro de guías, tal como los entrega el llamador.
 */
export type BookCoverInput = {
  /** EN: Company the book belongs to. ES: `RutEmisorLibro` — RUT del contribuyente dueño del libro. */
  readonly issuerRut: string
  /** EN: Authorized sender, normally the certificate holder. ES: `RutEnvia` — RUT de quien envía, normalmente el titular del certificado. */
  readonly senderRut: string
  /** EN: Tax period, `YYYY-MM`. On a special book, the earliest period it covers. ES: `PeriodoTributario` — Período tributario, `AAAA-MM`. En un libro especial, el primero que incluye. */
  readonly period: string
  /** EN: Resolution date (YYYY-MM-DD or DD-MM-YYYY). ES: `FchResol` — Fecha de resolución (AAAA-MM-DD o DD-MM-AAAA). */
  readonly resolutionDate: string
  /** EN: Resolution number, 0 in certification. ES: `NroResol` — Número de resolución, 0 en certificación. */
  readonly resolutionNumber: number
  /** EN: Submission kind; `total` by default. ES: `TipoEnvio` — Tipo de envío; `total` por defecto. */
  readonly submission?: BookSubmission
  /** EN: Segment number; required on `partial` and emitted only there. ES: `NroSegmento` — Número de segmento; obligatorio en `partial` y se emite solo ahí. */
  readonly segmentNumber?: number
  /** EN: Folio of the SII notification; required on `special` books and on every guide book. ES: `FolioNotificacion` — Folio de la notificación del SII; obligatorio en libros `special` y en todo libro de guías. */
  readonly notificationFolio?: number
}

/**
 * EN: Normalized cover fields common to the purchase and sales book and the guide book.
 * ES: `Caratula` — Campos comunes normalizados de la carátula del libro de compras y ventas y del libro de guías.
 */
export type BookCover = Omit<BookCoverInput, 'issuerRut' | 'senderRut' | 'submission'> & {
  /** EN: Book owner. ES: `RutEmisorLibro` — RUT del dueño del libro. */
  readonly issuerRut: SiiRut
  /** EN: Sender. ES: `RutEnvia` — RUT de quien envía. */
  readonly senderRut: SiiRut
  /** EN: Submission kind. ES: `TipoEnvio` — Tipo de envío. */
  readonly submission: BookSubmission
}

/**
 * EN: Cover of a purchase and sales book, as the caller provides it.
 * ES: `Caratula` — Carátula de un libro de compras y ventas, tal como la entrega el llamador.
 */
export type PurchaseSalesCoverInput = BookCoverInput & {
  /** EN: Book side. ES: `TipoOperacion` — Lado del libro: `sale` (VENTA) o `purchase` (COMPRA). */
  readonly operation: BookOperation
  /** EN: Book kind; `monthly` by default. ES: `TipoLibro` — Tipo de libro; `monthly` por defecto. */
  readonly kind?: BookKind
  /** EN: Replacement authorization code (max 10); required on `rectification`. ES: `CodAutRec` — Código de autorización de reemplazo, máximo 10; obligatorio en `rectification`. */
  readonly rectificationCode?: string
}

/**
 * EN: Normalized cover of a purchase and sales book.
 * ES: `Caratula` — Carátula normalizada de un libro de compras y ventas.
 */
export type PurchaseSalesCover = BookCover & {
  /** EN: Book side. ES: `TipoOperacion` — Lado del libro. */
  readonly operation: BookOperation
  /** EN: Book kind. ES: `TipoLibro` — Tipo de libro. */
  readonly kind: BookKind
  /** EN: Replacement authorization code. ES: `CodAutRec` — Código de autorización de reemplazo. */
  readonly rectificationCode?: string
}

/**
 * EN: Non-recoverable VAT of a line.
 * ES: `IVANoRec` — IVA no recuperable de una línea.
 */
export type BookNonRecoverableVat = {
  /** EN: Reason code. ES: `CodIVANoRec` — Código del motivo. */
  readonly code: NonRecoverableVatCode
  /** EN: Amount. ES: `MntIVANoRec` — Monto. */
  readonly amount: number
}

/**
 * EN: Additional tax, retention or surcharge of a line.
 * ES: `OtrosImp` — Impuesto adicional, retención o recargo de una línea.
 */
export type BookOtherTax = {
  /** EN: Tax code. ES: `CodImp` — Código del impuesto. */
  readonly code: number
  /** EN: Rate, percent. ES: `TasaImp` — Tasa, en porcentaje. */
  readonly rate?: number
  /** EN: Amount; may be negative. ES: `MntImp` — Monto; puede ser negativo. */
  readonly amount: number
}

/**
 * EN: Foreign receiver of an export document.
 * ES: `Extranjero` — Receptor extranjero de un documento de exportación.
 */
export type BookForeignReceiver = {
  /** EN: Foreign identifier (max 20). ES: `NumId` — Identificador extranjero, máximo 20. */
  readonly id?: string
  /** EN: Nationality code (max 3). ES: `Nacionalidad` — Código de nacionalidad, máximo 3. */
  readonly nationality?: string
}

/**
 * EN: Commissions and other charges of a settlement invoice (40, 43, 103), as the caller provides them.
 * ES: `Liquidaciones` — Comisiones y otros cargos de una liquidación (40, 43, 103), tal como los entrega el llamador.
 */
export type BookSettlementInput = {
  /** EN: RUT of whoever issued the settlement. ES: `RutEmisor` — RUT del emisor de la liquidación. */
  readonly issuerRut: string
  /** EN: Net commissions; may be negative. ES: `ValComNeto` — Valor neto de comisiones; puede ser negativo. */
  readonly netValue?: number
  /** EN: Exempt commissions; may be negative. ES: `ValComExe` — Valor de comisiones exentas; puede ser negativo. */
  readonly exemptValue?: number
  /** EN: VAT on commissions; may be negative. ES: `ValComIVA` — IVA de comisiones; puede ser negativo. */
  readonly vatValue?: number
}

/**
 * EN: One line of the purchase and sales book, as the caller provides it. Each field says which book it applies to when
 * it is not both; the XSD has a single `Detalle`, so the SDK does not forbid a combination.
 * ES: `Detalle` — Una línea del libro de compras y ventas, tal como la entrega el llamador. Cada campo dice a qué libro
 * aplica cuando no es a ambos; el XSD tiene un solo `Detalle`, así que el SDK no prohíbe ninguna combinación.
 */
export type BookEntryInput = {
  /** EN: Document type. ES: `TpoDoc` — Tipo de documento. */
  readonly type: number
  /** EN: Folio. ES: `NroDoc` — Folio del documento. */
  readonly folio: number
  /** EN: Folio voided before reaching the SII: only type and folio travel, and it adds no amounts. ES: `Anulado` — Folio anulado antes de llegar al SII: solo viajan tipo y folio, y no suma montos. */
  readonly voided?: boolean
  /** EN: Adjustment operation; defaults to `add` on `adjustment` submissions, and `remove` subtracts in the totals. ES: `Operacion` — Operación del ajuste; por defecto `add` en envíos `adjustment`, y `remove` resta en los totales. */
  readonly adjustment?: BookAdjustment
  /** EN: Note issued by the book owner that affects a purchase invoice. ES: `Emisor` — Nota emitida por el dueño del libro que afecta a una factura de compra. */
  readonly issuedByBookOwner?: boolean
  /** EN: Purchase invoice indicator. ES: `IndFactCompra` — Indicador de factura de compra. */
  readonly purchaseInvoice?: boolean
  /** EN: Tax kind, purchases: `vat` or `freeZone` (Law 18.211). ES: `TpoImp` — Tipo de impuesto, compras: `vat` (IVA) o `freeZone` (Ley 18.211). */
  readonly taxKind?: BookTaxKind
  /** EN: VAT or Law 18.211 rate, percent; the VAT rate is used when a line has net and VAT without a rate. ES: `TasaImp` — Tasa de IVA o de la Ley 18.211, en porcentaje; se usa la tasa de IVA si una línea tiene neto e IVA sin tasa. */
  readonly taxRate?: number
  /** EN: Internal reference (max 10). ES: `NumInt` — Referencia interna, máximo 10. */
  readonly internalNumber?: string
  /** EN: Periodic service indicator, sales. ES: `IndServicio` — Indicador de servicio periódico, ventas. */
  readonly serviceIndicator?: 1 | 2 | 3
  /** EN: Free delivery, sales. ES: `IndSinCosto` — Entrega gratuita, ventas. */
  readonly freeOfCharge?: boolean
  /** EN: Document date (YYYY-MM-DD or DD-MM-YYYY), from 2000 to 2050. ES: `FchDoc` — Fecha del documento (AAAA-MM-DD o DD-MM-AAAA), de 2000 a 2050. */
  readonly date?: string
  /** EN: SII branch code. ES: `CdgSIISucur` — Código SII de la sucursal. */
  readonly branchCode?: number
  /** EN: Customer or supplier RUT. ES: `RUTDoc` — RUT del cliente o proveedor. */
  readonly counterpartyRut?: string
  /** EN: Customer or supplier name (max 50). ES: `RznSoc` — Razón social del cliente o proveedor, máximo 50. */
  readonly counterpartyName?: string
  /** EN: Foreign receiver, sales. ES: `Extranjero` — Receptor extranjero, ventas. */
  readonly foreignReceiver?: BookForeignReceiver
  /** EN: Type of the voided document, sales. ES: `TpoDocRef` — Tipo del documento anulado, ventas. */
  readonly referenceType?: number
  /** EN: Folio of the voided document, sales. ES: `FolioDocRef` — Folio del documento anulado, ventas. */
  readonly referenceFolio?: number
  /** EN: Exempt amount; 0 by default on sale books. ES: `MntExe` — Monto exento; 0 por defecto en libros de venta. */
  readonly exemptAmount?: number
  /** EN: Net amount; 0 by default on sale books. ES: `MntNeto` — Monto neto; 0 por defecto en libros de venta. */
  readonly netAmount?: number
  /** EN: VAT; on purchases, the recoverable part. 0 by default on sale books. ES: `MntIVA` — IVA; en compras, la parte recuperable. 0 por defecto en libros de venta. */
  readonly vatAmount?: number
  /** EN: Net of fixed assets, purchases; also included in `netAmount`. ES: `MntActivoFijo` — Neto de activo fijo, compras; también incluido en `netAmount`. */
  readonly fixedAssetNetAmount?: number
  /** EN: VAT of fixed assets, purchases. ES: `MntIVAActivoFijo` — IVA de activo fijo, compras. */
  readonly fixedAssetVatAmount?: number
  /** EN: Non-recoverable VAT, purchases (max 5). ES: `IVANoRec` — IVA no recuperable, compras, máximo 5. */
  readonly nonRecoverableVat?: readonly BookNonRecoverableVat[]
  /** EN: Common-use VAT, purchases. ES: `IVAUsoComun` — IVA de uso común, compras. */
  readonly commonUseVat?: number
  /** EN: VAT of a late credit note, sales. ES: `IVAFueraPlazo` — IVA de una nota de crédito fuera de plazo, ventas. */
  readonly lateVat?: number
  /** EN: Own VAT on sales for third parties. ES: `IVAPropio` — IVA propio en ventas por cuenta de terceros. */
  readonly ownVatAmount?: number
  /** EN: Third-party VAT on sales for third parties. ES: `IVATerceros` — IVA de terceros en ventas por cuenta de terceros. */
  readonly thirdPartyVatAmount?: number
  /** EN: Free zone tax. ES: `Ley18211` — Impuesto de zona franca. */
  readonly freeZoneTax?: number
  /** EN: Additional taxes and retentions (max 20). ES: `OtrosImp` — Impuestos adicionales y retenciones, máximo 20. */
  readonly otherTaxes?: readonly BookOtherTax[]
  /** EN: Tax without credit right, purchases. ES: `MntSinCred` — Impuesto sin derecho a crédito, compras. */
  readonly nonCreditableTax?: number
  /** EN: Fully withheld VAT. ES: `IVARetTotal` — IVA retenido total. */
  readonly totalVatWithheld?: number
  /** EN: Partly withheld VAT. ES: `IVARetParcial` — IVA retenido parcial. */
  readonly partialVatWithheld?: number
  /** EN: 65 % credit of construction companies, sales. ES: `CredEC` — Crédito 65 % de empresas constructoras, ventas. */
  readonly constructionCredit?: number
  /** EN: Container deposit. ES: `DepEnvase` — Garantía por depósito de envases. */
  readonly containerDeposit?: number
  /** EN: Settlement commissions, sales. ES: `Liquidaciones` — Comisiones de liquidaciones, ventas. */
  readonly settlement?: BookSettlementInput
  /** EN: Line total; computed with the SII formula when absent, kept and compared when present. ES: `MntTotal` — Total de la línea; se calcula con la fórmula del SII si falta, se conserva y se compara si viene. */
  readonly totalAmount?: number
  /** EN: VAT not withheld on purchase invoices. ES: `IVANoRetenido` — IVA no retenido en facturas de compra. */
  readonly vatNotWithheld?: number
  /** EN: Non-billable amount, sales. ES: `MntNoFact` — Monto no facturable, ventas. */
  readonly nonBillableAmount?: number
  /** EN: Period amount, sales. ES: `MntPeriodo` — Monto del período, ventas. */
  readonly periodAmount?: number
  /** EN: Domestic tickets, sales. ES: `PsjNac` — Pasajes nacionales, ventas. */
  readonly domesticTickets?: number
  /** EN: International tickets, sales. ES: `PsjInt` — Pasajes internacionales, ventas. */
  readonly internationalTickets?: number
  /** EN: Cigars tax, purchases. ES: `TabPuros` — Impuesto a los cigarros puros, compras. */
  readonly cigars?: number
  /** EN: Cigarettes tax, purchases. ES: `TabCigarrillos` — Impuesto a los cigarrillos, compras. */
  readonly cigarettes?: number
  /** EN: Processed tobacco tax, purchases. ES: `TabElaborado` — Impuesto al tabaco elaborado, compras. */
  readonly processedTobacco?: number
  /** EN: Vehicle tax, purchases. ES: `ImpVehiculo` — Impuesto a los vehículos, compras. */
  readonly vehicleTax?: number
}

/**
 * EN: Tax kind of a line: `vat` is `TpoImp` 1, `freeZone` (Law 18.211) is 2.
 * ES: `TpoImp` — Tipo de impuesto de una línea: `vat` (IVA) es 1, `freeZone` (Ley 18.211) es 2.
 */
export type BookTaxKind = 'vat' | 'freeZone'

/**
 * EN: A normalized line of the purchase and sales book. A voided line has only `type`, `folio`, `voided` and `adjustment`.
 * ES: `Detalle` — Línea normalizada del libro de compras y ventas. Una línea anulada solo tiene `type`, `folio`, `voided` y `adjustment`.
 */
export type BookEntry = Omit<BookEntryInput, 'counterpartyRut' | 'settlement'> & {
  /** EN: Customer or supplier RUT. ES: `RUTDoc` — RUT del cliente o proveedor. */
  readonly counterpartyRut?: SiiRut
  /** EN: Settlement commissions. ES: `Liquidaciones` — Comisiones de liquidaciones. */
  readonly settlement?: Omit<BookSettlementInput, 'issuerRut'> & { readonly issuerRut: SiiRut }
}

/**
 * EN: An explicit line total that differs from the SII formula. Reported, not thrown, unless `strictTotals` is set.
 * ES: Un total explícito de línea que difiere de la fórmula del SII. Se informa, no se lanza, salvo con `strictTotals`.
 */
export type BookTotalMismatch = {
  /** EN: Position of the line in `entries`. ES: Posición de la línea en `entries`. */
  readonly index: number
  /** EN: Document type. ES: `TpoDoc` — Tipo de documento. */
  readonly type: number
  /** EN: Folio. ES: `NroDoc` — Folio. */
  readonly folio: number
  /** EN: What the formula gives. ES: Lo que da la fórmula. */
  readonly expected: number
  /** EN: What the line says. ES: Lo que dice la línea. */
  readonly actual: number
}

/**
 * EN: Non-recoverable VAT of a document type in a summary.
 * ES: `TotIVANoRec` — IVA no recuperable de un tipo de documento en un resumen.
 */
export type BookNonRecoverableVatTotal = {
  /** EN: Reason code. ES: `CodIVANoRec` — Código del motivo. */
  readonly code: number
  /** EN: Lines with this code. ES: `TotOpIVANoRec` — Líneas con este código. */
  readonly count?: number
  /** EN: Amount. ES: `TotMntIVANoRec` — Monto. */
  readonly amount: number
}

/**
 * EN: Additional tax of a document type in a summary.
 * ES: `TotOtrosImp` — Impuesto adicional de un tipo de documento en un resumen.
 */
export type BookOtherTaxTotal = {
  /** EN: Tax code. ES: `CodImp` — Código del impuesto. */
  readonly code: number
  /** EN: Amount. ES: `TotMntImp` — Monto. */
  readonly amount: number
}

/**
 * EN: Settlement commissions of a document type in a summary.
 * ES: `TotLiquidaciones` — Comisiones de liquidaciones de un tipo de documento en un resumen.
 */
export type BookSettlementTotals = {
  /** EN: Net commissions. ES: `TotValComNeto` — Valor neto de comisiones. */
  readonly netValue?: number
  /** EN: Exempt commissions. ES: `TotValComExe` — Valor de comisiones exentas. */
  readonly exemptValue?: number
  /** EN: VAT on commissions. ES: `TotValComIVA` — IVA de comisiones. */
  readonly vatValue?: number
}

/**
 * EN: Totals of one document type in a summary. A plain JSON value: persist `book.periodTotals` and pass it back as
 * `previousTotals`.
 * ES: `TotalesSegmento` / `TotalesPeriodo` — Totales de un tipo de documento en un resumen. Es un valor JSON simple: se
 * puede guardar `book.periodTotals` y devolverlo como `previousTotals`.
 */
export type BookTotals = {
  /** EN: Document type. ES: `TpoDoc` — Tipo de documento. */
  readonly type: number
  /** EN: Tax kind. ES: `TpoImp` — Tipo de impuesto. */
  readonly taxKind?: BookTaxKind
  /** EN: Documents, voided ones included. ES: `TotDoc` — Documentos, incluidos los anulados. */
  readonly documentCount: number
  /** EN: Voided folios. ES: `TotAnulado` — Folios anulados. */
  readonly voidedCount?: number
  /** EN: Exempt amount. ES: `TotMntExe` — Monto exento. */
  readonly exemptAmount: number
  /** EN: Net amount. ES: `TotMntNeto` — Monto neto. */
  readonly netAmount: number
  /** EN: VAT. ES: `TotMntIVA` — IVA. */
  readonly vatAmount: number
  /** EN: Net of fixed assets. ES: `TotMntActivoFijo` — Neto de activo fijo. */
  readonly fixedAssetNetAmount?: number
  /** EN: VAT of fixed assets. ES: `TotMntIVAActivoFijo` — IVA de activo fijo. */
  readonly fixedAssetVatAmount?: number
  /** EN: Non-recoverable VAT per code. ES: `TotIVANoRec` — IVA no recuperable por código. */
  readonly nonRecoverableVat?: readonly BookNonRecoverableVatTotal[]
  /** EN: Lines with common-use VAT. ES: `TotOpIVAUsoComun` — Líneas con IVA de uso común. */
  readonly commonUseVatCount?: number
  /** EN: Common-use VAT. ES: `TotIVAUsoComun` — IVA de uso común. */
  readonly commonUseVat?: number
  /** EN: Credit of the common-use VAT as the caller rounded it document by document; when absent the period summary rounds the total. ES: `TotCredIVAUsoComun` — Crédito del IVA de uso común tal como el llamador lo redondeó documento a documento; si falta, el resumen del período redondea el total. */
  readonly commonUseCredit?: number
  /** EN: Late VAT. ES: `TotIVAFueraPlazo` — IVA fuera de plazo. */
  readonly lateVat?: number
  /** EN: Own VAT. ES: `TotIVAPropio` — IVA propio. */
  readonly ownVatAmount?: number
  /** EN: Third-party VAT. ES: `TotIVATerceros` — IVA de terceros. */
  readonly thirdPartyVatAmount?: number
  /** EN: Free zone tax. ES: `TotLey18211` — Impuesto de zona franca. */
  readonly freeZoneTax?: number
  /** EN: Additional taxes per code. ES: `TotOtrosImp` — Impuestos adicionales por código. */
  readonly otherTaxes?: readonly BookOtherTaxTotal[]
  /** EN: Tax without credit right. ES: `TotImpSinCredito` — Impuesto sin derecho a crédito. */
  readonly nonCreditableTax?: number
  /** EN: Fully withheld VAT. ES: `TotIVARetTotal` — IVA retenido total. */
  readonly totalVatWithheld?: number
  /** EN: Partly withheld VAT. ES: `TotIVARetParcial` — IVA retenido parcial. */
  readonly partialVatWithheld?: number
  /** EN: Construction companies credit. ES: `TotCredEC` — Crédito de empresas constructoras. */
  readonly constructionCredit?: number
  /** EN: Container deposit. ES: `TotDepEnvase` — Garantía por depósito de envases. */
  readonly containerDeposit?: number
  /** EN: Settlement commissions. ES: `TotLiquidaciones` — Comisiones de liquidaciones. */
  readonly settlement?: BookSettlementTotals
  /** EN: Total amount. ES: `TotMntTotal` — Monto total. */
  readonly totalAmount: number
  /** EN: VAT not withheld. ES: `TotIVANoRetenido` — IVA no retenido. */
  readonly vatNotWithheld?: number
  /** EN: Non-billable amount. ES: `TotMntNoFact` — Monto no facturable. */
  readonly nonBillableAmount?: number
  /** EN: Period amount. ES: `TotMntPeriodo` — Monto del período. */
  readonly periodAmount?: number
  /** EN: Domestic tickets. ES: `TotPsjNac` — Pasajes nacionales. */
  readonly domesticTickets?: number
  /** EN: International tickets. ES: `TotPsjInt` — Pasajes internacionales. */
  readonly internationalTickets?: number
  /** EN: Cigars tax. ES: `TotTabPuros` — Impuesto a los cigarros puros. */
  readonly cigars?: number
  /** EN: Cigarettes tax. ES: `TotTabCigarrillos` — Impuesto a los cigarrillos. */
  readonly cigarettes?: number
  /** EN: Processed tobacco tax. ES: `TotTabElaborado` — Impuesto al tabaco elaborado. */
  readonly processedTobacco?: number
  /** EN: Vehicle tax; period summaries only. ES: `TotImpVehiculo` — Impuesto a los vehículos; solo en resúmenes de período. */
  readonly vehicleTax?: number
}

/**
 * EN: Totals of a document type as the caller provides them: anything absent counts as 0.
 * ES: Totales de un tipo de documento tal como los entrega el llamador: lo que falte cuenta como 0.
 */
export type BookTotalsInput = Partial<Omit<BookTotals, 'type'>> & Pick<BookTotals, 'type'>

/**
 * EN: Input of `createPurchaseSalesBook`.
 * ES: Entrada de `createPurchaseSalesBook`.
 */
export type PurchaseSalesBookInput = {
  /** EN: Cover. ES: `Caratula` — Carátula. */
  readonly cover: PurchaseSalesCoverInput
  /** EN: One line per document. ES: `Detalle` — Una línea por documento. */
  readonly entries?: readonly BookEntryInput[]
  /** EN: Totals of types the format excludes from the detail (receipts, among others). Rejected on `partial`. ES: Totales de tipos que el formato excluye del detalle (boletas, entre otros). No se aceptan en `partial`. */
  readonly summaryOnlyTotals?: readonly BookTotalsInput[]
  /** EN: Period totals of earlier submissions; `final` and `adjustment` only. ES: Totales del período de envíos anteriores; solo en `final` y `adjustment`. */
  readonly previousTotals?: readonly BookTotals[]
  /** EN: Proportionality factor, one per book; required when a period summary has common-use VAT. ES: `FctProp` — Factor de proporcionalidad, uno por libro; obligatorio si un resumen de período tiene IVA de uso común. */
  readonly commonUseVatFactor?: number
  /** EN: Additional tax factor per tax code. ES: `FctImpAdic` — Factor de impuesto adicional por código. */
  readonly additionalTaxFactors?: Readonly<Record<number, number>>
  /** EN: Throw `BOOK_TOTAL_MISMATCH` instead of reporting in `totalMismatches`. ES: Lanzar `BOOK_TOTAL_MISMATCH` en vez de informar en `totalMismatches`. */
  readonly strictTotals?: boolean
  /** EN: Explicit `EnvioLibro/@ID`; generated when absent. ES: `ID` explícito del `EnvioLibro`; se genera si falta. */
  readonly id?: string
  /** EN: Clock for the id and `TmstFirma`. ES: Reloj para el id y `TmstFirma`. */
  readonly now?: Date
}

/**
 * EN: A normalized purchase and sales book, ready to render and sign.
 * ES: Un libro de compras y ventas normalizado, listo para renderizar y firmar.
 */
export type PurchaseSalesBook = {
  /** EN: `EnvioLibro/@ID`. ES: `EnvioLibro/@ID` — Identificador del envío. */
  readonly id: string
  /** EN: Cover. ES: `Caratula` — Carátula. */
  readonly cover: PurchaseSalesCover
  /** EN: Lines. ES: `Detalle` — Líneas. */
  readonly entries: readonly BookEntry[]
  /** EN: Segment summary, or null when the submission has none. ES: `ResumenSegmento` — Resumen del segmento, o null si el envío no lleva. */
  readonly segmentTotals: readonly BookTotals[] | null
  /** EN: Period summary, or null when the submission has none. ES: `ResumenPeriodo` — Resumen del período, o null si el envío no lleva. */
  readonly periodTotals: readonly BookTotals[] | null
  /** EN: Proportionality factor. ES: `FctProp` — Factor de proporcionalidad. */
  readonly commonUseVatFactor?: number
  /** EN: Additional tax factors. ES: `FctImpAdic` — Factores de impuesto adicional. */
  readonly additionalTaxFactors?: Readonly<Record<number, number>>
  /** EN: Explicit totals that differ from the formula. ES: Totales explícitos que difieren de la fórmula. */
  readonly totalMismatches: readonly BookTotalMismatch[]
  /** EN: Signing timestamp, Chile time. ES: `TmstFirma` — Marca de tiempo de la firma, hora de Chile. */
  readonly signedAt: string
}

/**
 * EN: Cover of a guide book, as the caller provides it. The schema only admits `TipoLibro` `ESPECIAL` and requires the
 * notification folio.
 * ES: `Caratula` — Carátula de un libro de guías, tal como la entrega el llamador. El esquema solo admite `TipoLibro`
 * `ESPECIAL` y exige el folio de notificación.
 */
export type GuideBookCoverInput = BookCoverInput & {
  /** EN: Folio of the SII notification. ES: `FolioNotificacion` — Folio de la notificación del SII. */
  readonly notificationFolio: number
}

/**
 * EN: Normalized cover of a guide book.
 * ES: `Caratula` — Carátula normalizada de un libro de guías.
 */
export type GuideBookCover = BookCover & {
  /** EN: Folio of the SII notification. ES: `FolioNotificacion` — Folio de la notificación del SII. */
  readonly notificationFolio: number
}

/**
 * EN: One line of the guide book, as the caller provides it.
 * ES: `Detalle` — Una línea del libro de guías, tal como la entrega el llamador.
 */
export type GuideEntryInput = {
  /** EN: Guide folio. ES: `Folio` — Folio de la guía. */
  readonly folio: number
  /** EN: `folio` and `guide` voids drop the amounts and the receiver; `partialReceipt` keeps them. ES: `Anulado` — `folio` y `guide` descartan montos y receptor; `partialReceipt` los conserva. */
  readonly voided?: GuideVoidCode
  /** EN: Adjustment operation; defaults to `add` on `adjustment` submissions, and `remove` subtracts in the totals. ES: `Operacion` — Operación del ajuste; por defecto `add` en envíos `adjustment`, y `remove` resta en los totales. */
  readonly adjustment?: BookAdjustment
  /** EN: Guide operation, 1 to 7 (see `GUIDE_TRANSFER_TYPES`). ES: `TpoOper` — Operación de la guía, 1 a 7 (ver `GUIDE_TRANSFER_TYPES`). */
  readonly transferType?: number
  /** EN: Guide date (YYYY-MM-DD or DD-MM-YYYY). ES: `FchDoc` — Fecha de la guía (AAAA-MM-DD o DD-MM-AAAA). */
  readonly date?: string
  /** EN: Receiver RUT, mandatory for the SII on sales. ES: `RUTDoc` — RUT del receptor, obligatorio para el SII en ventas. */
  readonly receiverRut?: string
  /** EN: Receiver name (max 50). ES: `RznSoc` — Razón social del receptor, máximo 50. */
  readonly receiverName?: string
  /** EN: Net amount. ES: `MntNeto` — Monto neto. */
  readonly netAmount?: number
  /** EN: VAT rate, percent; 0 by default. ES: `TasaImp` — Tasa de IVA, en porcentaje; 0 por defecto. */
  readonly taxRate?: number
  /** EN: VAT; computed from rate and net when absent or 0. ES: `IVA` — IVA; se calcula desde tasa y neto si falta o es 0. */
  readonly vatAmount?: number
  /** EN: Total; net + VAT when absent. ES: `MntTotal` — Total; neto + IVA si falta. */
  readonly totalAmount?: number
  /** EN: Corrected total of a `partialReceipt`. ES: `MntModificado` — Total corregido de una recepción parcial. */
  readonly modifiedAmount?: number
  /** EN: Type of the invoice issued for the guide. ES: `TpoDocRef` — Tipo de la factura emitida por la guía. */
  readonly referenceType?: number
  /** EN: Folio of the invoice issued for the guide. ES: `FolioDocRef` — Folio de la factura emitida por la guía. */
  readonly referenceFolio?: number
  /** EN: Date of the invoice issued for the guide. ES: `FchDocRef` — Fecha de la factura emitida por la guía. */
  readonly referenceDate?: string
}

/**
 * EN: A normalized line of the guide book.
 * ES: `Detalle` — Línea normalizada del libro de guías.
 */
export type GuideEntry = Omit<GuideEntryInput, 'receiverRut' | 'taxRate' | 'vatAmount' | 'totalAmount'> & {
  /** EN: Receiver RUT. ES: `RUTDoc` — RUT del receptor. */
  readonly receiverRut?: SiiRut
  /** EN: VAT rate. ES: `TasaImp` — Tasa de IVA. */
  readonly taxRate: number
  /** EN: VAT. ES: `IVA` — IVA. */
  readonly vatAmount: number
  /** EN: Total. ES: `MntTotal` — Total. */
  readonly totalAmount: number
}

/**
 * EN: Non-sale guides of one operation in a summary.
 * ES: `TotTraslado` — Guías no venta de una operación en un resumen.
 */
export type GuideTransferTotal = {
  /** EN: Operation, 2 to 7. ES: `TpoTraslado` — Operación, 2 a 7. */
  readonly type: number
  /** EN: Guides. ES: `CantGuia` — Cantidad de guías. */
  readonly count: number
  /** EN: Amount. ES: `MntGuia` — Monto. */
  readonly amount: number
}

/**
 * EN: Summary of a guide book. A plain JSON value: persist `book.periodTotals` and pass it back as `previousTotals`.
 * ES: `ResumenSegmento` / `ResumenPeriodo` — Resumen de un libro de guías. Es un valor JSON simple: se puede guardar
 * `book.periodTotals` y devolverlo como `previousTotals`.
 */
export type GuideTotals = {
  /** EN: Folios voided before reaching the SII. ES: `TotFolAnulado` — Folios anulados antes de llegar al SII. */
  readonly voidedFolios: number
  /** EN: Guides voided afterwards. ES: `TotGuiaAnulada` — Guías anuladas después. */
  readonly voidedGuides: number
  /** EN: Sale guides. ES: `TotGuiaVenta` — Guías de venta. */
  readonly saleGuides: number
  /** EN: Amount of the sale guides. ES: `TotMntGuiaVta` — Monto de las guías de venta. */
  readonly saleGuidesAmount: number
  /** EN: Sum of the corrected totals. ES: `TotMntModificado` — Suma de los totales corregidos. */
  readonly modifiedAmount: number
  /** EN: Non-sale guides per operation. ES: `TotTraslado` — Guías no venta por operación. */
  readonly transfers: readonly GuideTransferTotal[]
}

/**
 * EN: Input of `createGuideBook`.
 * ES: Entrada de `createGuideBook`.
 */
export type GuideBookInput = {
  /** EN: Cover. ES: `Caratula` — Carátula. */
  readonly cover: GuideBookCoverInput
  /** EN: One line per guide. ES: `Detalle` — Una línea por guía. */
  readonly entries?: readonly GuideEntryInput[]
  /** EN: Period totals of earlier submissions; `final` and `adjustment` only. ES: Totales del período de envíos anteriores; solo en `final` y `adjustment`. */
  readonly previousTotals?: GuideTotals
  /** EN: Explicit `EnvioLibro/@ID`; generated when absent. ES: `ID` explícito del `EnvioLibro`; se genera si falta. */
  readonly id?: string
  /** EN: Clock for the id and `TmstFirma`. ES: Reloj para el id y `TmstFirma`. */
  readonly now?: Date
}

/**
 * EN: A normalized guide book, ready to render and sign.
 * ES: Un libro de guías normalizado, listo para renderizar y firmar.
 */
export type GuideBook = {
  /** EN: `EnvioLibro/@ID`. ES: `EnvioLibro/@ID` — Identificador del envío. */
  readonly id: string
  /** EN: Cover. ES: `Caratula` — Carátula. */
  readonly cover: GuideBookCover
  /** EN: Lines. ES: `Detalle` — Líneas. */
  readonly entries: readonly GuideEntry[]
  /** EN: Segment summary, or null. ES: `ResumenSegmento` — Resumen del segmento, o null. */
  readonly segmentTotals: GuideTotals | null
  /** EN: Period summary, or null. ES: `ResumenPeriodo` — Resumen del período, o null. */
  readonly periodTotals: GuideTotals | null
  /** EN: Signing timestamp, Chile time. ES: `TmstFirma` — Marca de tiempo de la firma, hora de Chile. */
  readonly signedAt: string
}

/**
 * EN: Cover of a folio consumption report, as the caller provides it.
 * ES: `Caratula` — Carátula de un reporte de consumo de folios, tal como la entrega el llamador.
 */
export type FolioConsumptionCoverInput = {
  /** EN: Issuer company. ES: `RutEmisor` — RUT de la empresa emisora. */
  readonly issuerRut: string
  /** EN: Authorized sender. ES: `RutEnvia` — RUT de quien envía. */
  readonly senderRut: string
  /** EN: Resolution date. ES: `FchResol` — Fecha de resolución. */
  readonly resolutionDate: string
  /** EN: Resolution number. ES: `NroResol` — Número de resolución. */
  readonly resolutionNumber: number
  /** EN: First day; the earliest issue date when absent, required with no lines. ES: `FchInicio` — Primer día; la fecha de emisión más temprana si falta, obligatorio sin líneas. */
  readonly from?: string
  /** EN: Last day; the latest issue date when absent, required with no lines. ES: `FchFinal` — Último día; la fecha de emisión más tardía si falta, obligatorio sin líneas. */
  readonly to?: string
  /** EN: Submission sequence, 1 by default; raise it to correct a report. ES: `SecEnvio` — Secuencia de envío, 1 por defecto; se aumenta para corregir un reporte. */
  readonly sequence?: number
  /** EN: Correlative within the day. ES: `Correlativo` — Correlativo dentro del día. */
  readonly correlative?: number
}

/**
 * EN: Normalized cover of a folio consumption report.
 * ES: `Caratula` — Carátula normalizada de un reporte de consumo de folios.
 */
export type FolioConsumptionCover = {
  /** EN: Issuer company. ES: `RutEmisor` — RUT de la empresa emisora. */
  readonly issuerRut: SiiRut
  /** EN: Authorized sender. ES: `RutEnvia` — RUT de quien envía. */
  readonly senderRut: SiiRut
  /** EN: Resolution date. ES: `FchResol` — Fecha de resolución. */
  readonly resolutionDate: string
  /** EN: Resolution number. ES: `NroResol` — Número de resolución. */
  readonly resolutionNumber: number
  /** EN: First day. ES: `FchInicio` — Primer día. */
  readonly from: string
  /** EN: Last day. ES: `FchFinal` — Último día. */
  readonly to: string
  /** EN: Submission sequence. ES: `SecEnvio` — Secuencia de envío. */
  readonly sequence: number
  /** EN: Correlative within the day. ES: `Correlativo` — Correlativo dentro del día. */
  readonly correlative?: number
  /** EN: Signing timestamp, Chile time. ES: `TmstFirmaEnv` — Marca de tiempo de la firma, hora de Chile. */
  readonly signedAt: string
}

/**
 * EN: Document types of the report: 39 and 41, per the 2020 format.
 * ES: `TipoDocumento` — Tipos de documento del reporte: 39 y 41, según el formato de 2020.
 */
export type FolioConsumptionType = 39 | 41

/**
 * EN: One receipt issued.
 * ES: Una boleta emitida.
 */
export type FolioConsumptionEntry = {
  /** EN: Document type. ES: `TipoDocumento` — Tipo de documento. */
  readonly type: FolioConsumptionType
  /** EN: Folio. ES: Folio de la boleta. */
  readonly folio: number
  /** EN: Issue date; defines `from` and `to` when they are absent. ES: Fecha de emisión; define `from` y `to` si faltan. */
  readonly issueDate?: string
  /** EN: Net amount; ignored on type 41. ES: `MntNeto` — Monto neto; se ignora en el tipo 41. */
  readonly netAmount?: number
  /** EN: VAT; ignored on type 41. ES: `MntIva` — IVA; se ignora en el tipo 41. */
  readonly vatAmount?: number
  /** EN: Exempt amount. ES: `MntExento` — Monto exento. */
  readonly exemptAmount?: number
  /** EN: Total. ES: `MntTotal` — Total. */
  readonly totalAmount: number
}

/**
 * EN: A folio voided in the system before reaching the SII, not one voided through a credit note.
 * ES: Un folio anulado en el sistema antes de llegar al SII, no uno anulado con una nota de crédito.
 */
export type VoidedFolio = {
  /** EN: Document type. ES: `TipoDocumento` — Tipo de documento. */
  readonly type: FolioConsumptionType
  /** EN: Folio. ES: Folio anulado. */
  readonly folio: number
}

/**
 * EN: A range of consecutive folios; a single folio has `from` equal to `to`.
 * ES: `RangoUtilizados` / `RangoAnulados` — Un rango de folios consecutivos; un folio solo tiene `from` igual a `to`.
 */
export type FolioRange = {
  /** EN: First folio. ES: `Inicial` — Folio inicial. */
  readonly from: number
  /** EN: Last folio. ES: `Final` — Folio final. */
  readonly to: number
}

/**
 * EN: Summary of one document type in the report.
 * ES: `Resumen` — Resumen de un tipo de documento en el reporte.
 */
export type FolioConsumptionSummary = {
  /** EN: Document type. ES: `TipoDocumento` — Tipo de documento. */
  readonly type: FolioConsumptionType
  /** EN: Net amount. ES: `MntNeto` — Monto neto. */
  readonly netAmount: number
  /** EN: VAT. ES: `MntIva` — IVA. */
  readonly vatAmount: number
  /** EN: VAT rate; type 39 only. ES: `TasaIVA` — Tasa de IVA; solo tipo 39. */
  readonly vatRate?: number
  /** EN: Exempt amount. ES: `MntExento` — Monto exento. */
  readonly exemptAmount: number
  /** EN: Total. ES: `MntTotal` — Total. */
  readonly totalAmount: number
  /** EN: Documents issued. ES: `FoliosEmitidos` — Documentos emitidos. */
  readonly issuedCount: number
  /** EN: Folios voided. ES: `FoliosAnulados` — Folios anulados. */
  readonly voidedCount: number
  /** EN: Issued plus voided. ES: `FoliosUtilizados` — Emitidos más anulados. */
  readonly usedCount: number
  /** EN: Ranges of issued folios. ES: `RangoUtilizados` — Rangos de folios emitidos. */
  readonly usedRanges: readonly FolioRange[]
  /** EN: Ranges of voided folios. ES: `RangoAnulados` — Rangos de folios anulados. */
  readonly voidedRanges: readonly FolioRange[]
}

/**
 * EN: Input of `createFolioConsumption`.
 * ES: Entrada de `createFolioConsumption`.
 */
export type FolioConsumptionInput = {
  /** EN: Cover. ES: `Caratula` — Carátula. */
  readonly cover: FolioConsumptionCoverInput
  /** EN: One line per receipt issued. ES: Una línea por boleta emitida. */
  readonly entries?: readonly FolioConsumptionEntry[]
  /** EN: Folios voided in the system. ES: Folios anulados en el sistema. */
  readonly voidedFolios?: readonly VoidedFolio[]
  /** EN: Explicit `DocumentoConsumoFolios/@ID`; generated when absent. ES: `ID` explícito del `DocumentoConsumoFolios`; se genera si falta. */
  readonly id?: string
  /** EN: Clock for the id and `TmstFirmaEnv`. ES: Reloj para el id y `TmstFirmaEnv`. */
  readonly now?: Date
}

/**
 * EN: A normalized folio consumption report, ready to render and sign. Used today in the receipts certification; the SII
 * probably no longer requires it in production.
 * ES: Un reporte de consumo de folios normalizado, listo para renderizar y firmar. Hoy se usa en la certificación de
 * boletas; probablemente el SII ya no lo exige en producción.
 */
export type FolioConsumption = {
  /** EN: `DocumentoConsumoFolios/@ID`. ES: `DocumentoConsumoFolios/@ID` — Identificador del documento. */
  readonly id: string
  /** EN: Cover. ES: `Caratula` — Carátula. */
  readonly cover: FolioConsumptionCover
  /** EN: One summary per document type. ES: `Resumen` — Un resumen por tipo de documento. */
  readonly summaries: readonly FolioConsumptionSummary[]
}
