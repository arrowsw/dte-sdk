import type { DocumentType } from '../catalogs/document-types'
import type {
  DispatchType,
  ExemptIndicator,
  PaymentTerms,
  ReferenceCode,
  ServiceIndicator,
  TransferType,
} from '../catalogs/codes'
import type { SiiRut } from './rut'

/**
 * EN: Party that issues the document (`Emisor`).
 * ES: `Emisor` — Quien emite el documento.
 */
export type Issuer = {
  /** EN: Issuer RUT, SII shape. ES: `RUTEmisor` — RUT del emisor, sin puntos y con guión. */
  readonly rut: SiiRut
  /** EN: Legal/business name (max 100). ES: `RznSoc` (`RznSocEmisor` en boletas) — Razón social, máximo 100 caracteres. */
  readonly businessName: string
  /** EN: Line of business (max 80). ES: `GiroEmis` (`GiroEmisor` en boletas) — Giro comercial, máximo 80. */
  readonly businessActivity: string
  /** EN: SII economic activity code. ES: `Acteco` — Código de actividad económica del SII. */
  readonly activityCode?: number
  /** EN: Phone. ES: `Telefono` — Teléfono. */
  readonly phone?: string
  /** EN: Email. ES: `CorreoEmisor` — Correo electrónico del emisor. */
  readonly email?: string
  /** EN: Branch name (max 20). ES: `Sucursal` — Nombre de la sucursal, máximo 20. */
  readonly branch?: string
  /** EN: SII branch code (1-999999999). ES: `CdgSIISucur` — Código de sucursal inscrito en el SII, entero de 1 a 999999999. */
  readonly siiBranchCode?: number
  /** EN: Street address (max 70). ES: `DirOrigen` — Dirección de origen, máximo 70. */
  readonly address: string
  /** EN: Commune (max 20). ES: `CmnaOrigen` — Comuna de origen, máximo 20. */
  readonly commune: string
  /** EN: City (max 20); defaults to the commune. ES: `CiudadOrigen` — Ciudad de origen, máximo 20; por defecto la comuna. */
  readonly city?: string
  /** EN: Salesperson code. ES: `CdgVendedor` — Código del vendedor. */
  readonly salespersonCode?: string
}

/**
 * EN: Issuer as the caller provides it: the RUT may come in any shape.
 * ES: Emisor tal como lo entrega el llamador: el RUT puede venir en cualquier forma.
 */
export type IssuerInput = Omit<Issuer, 'rut'> & { readonly rut: string }

/**
 * EN: Party that receives the document (`Receptor`).
 * ES: `Receptor` — Quien recibe el documento.
 */
export type Receiver = {
  /** EN: Receiver RUT (66666666-6 for an anonymous final consumer on receipts). ES: `RUTRecep` — RUT del receptor (66666666-6 para consumidor final en boletas). */
  readonly rut: SiiRut
  /** EN: Internal customer code (max 20). ES: `CdgIntRecep` — Código interno del receptor, máximo 20. */
  readonly internalCode?: string
  /** EN: Legal/business name (max 100). ES: `RznSocRecep` — Razón social del receptor, máximo 100. */
  readonly businessName: string
  /** EN: Line of business (max 40). ES: `GiroRecep` — Giro del receptor, máximo 40. */
  readonly businessActivity?: string
  /** EN: Contact person (max 80). ES: `Contacto` — Persona de contacto, máximo 80. */
  readonly contact?: string
  /** EN: Email (max 80). ES: `CorreoRecep` — Correo del receptor, máximo 80. */
  readonly email?: string
  /** EN: Street address (max 70); required except on receipts. ES: `DirRecep` — Dirección del receptor, máximo 70; obligatoria salvo en boletas. */
  readonly address?: string
  /** EN: Commune (max 20); required except on receipts. ES: `CmnaRecep` — Comuna del receptor, máximo 20; obligatoria salvo en boletas. */
  readonly commune?: string
  /** EN: City (max 20). ES: `CiudadRecep` — Ciudad del receptor, máximo 20. */
  readonly city?: string
  /** EN: Postal address (max 70). ES: `DirPostal` — Dirección postal, máximo 70. */
  readonly postalAddress?: string
  /** EN: Postal commune (max 20). ES: `CmnaPostal` — Comuna postal, máximo 20. */
  readonly postalCommune?: string
  /** EN: Postal city (max 20). ES: `CiudadPostal` — Ciudad postal, máximo 20. */
  readonly postalCity?: string
}

/**
 * EN: Receiver as the caller provides it.
 * ES: Receptor tal como lo entrega el llamador.
 */
export type ReceiverInput = Omit<Receiver, 'rut'> & { readonly rut: string }

/**
 * EN: Item code (`CdgItem`): a code system and the code itself.
 * ES: `CdgItem` — Código del ítem: sistema (`TpoCodigo`, p. ej. EAN, INT1) y valor (`VlrCodigo`).
 */
export type ItemCode = {
  /** EN: Code system (max 10). ES: `TpoCodigo` — Tipo de codificación, máximo 10. */
  readonly type: string
  /** EN: Code value (max 35). ES: `VlrCodigo` — Valor del código, máximo 35. */
  readonly value: string
}

/**
 * EN: A detail line as the caller provides it; amounts are computed unless `amount` is given.
 * ES: Línea de detalle tal como la entrega el llamador; los montos se calculan salvo que venga `amount`.
 */
export type LineItemInput = {
  /** EN: Item name (max 80). ES: `NmbItem` — Nombre del ítem, máximo 80. */
  readonly name: string
  /** EN: Description (max 1000). ES: `DscItem` — Descripción, máximo 1000. */
  readonly description?: string
  /** EN: Quantity (default 1). ES: `QtyItem` — Cantidad, por defecto 1. */
  readonly quantity?: number
  /** EN: Unit of measure (max 4). ES: `UnmdItem` — Unidad de medida, máximo 4. */
  readonly unit?: string
  /** EN: Unit price, net or VAT-included according to `pricesIncludeVat`. ES: `PrcItem` — Precio unitario, neto o con IVA según `pricesIncludeVat`. */
  readonly unitPrice?: number
  /** EN: Shorthand for `exemptIndicator: 1`. ES: Atajo para `exemptIndicator: 1` (`IndExe=1`). */
  readonly exempt?: boolean
  /** EN: Explicit exemption indicator. ES: `IndExe` — Indicador de exención explícito (1 a 6). */
  readonly exemptIndicator?: ExemptIndicator
  /** EN: Line discount percent. ES: `DescuentoPct` — Porcentaje de descuento de la línea. */
  readonly discountPercent?: number
  /** EN: Line surcharge percent. ES: `RecargoPct` — Porcentaje de recargo de la línea. */
  readonly surchargePercent?: number
  /** EN: Item codes. ES: `CdgItem` — Códigos del ítem (hasta 5). */
  readonly codes?: readonly ItemCode[]
  /** EN: Additional tax codes. ES: `CodImpAdic` — Códigos de impuesto adicional (hasta 2). */
  readonly additionalTaxCodes?: readonly number[]
  /** EN: Settled document type, settlement invoices only. ES: `TpoDocLiq` — Tipo del documento liquidado; obligatorio en liquidación factura (43). */
  readonly settledDocumentType?: string
  /** EN: Reference quantity. ES: `QtyRef` — Cantidad de referencia. */
  readonly referenceQuantity?: number
  /** EN: Reference unit (max 4). ES: `UnmdRef` — Unidad de referencia, máximo 4. */
  readonly referenceUnit?: string
  /** EN: Reference price. ES: `PrcRef` — Precio de referencia. */
  readonly referencePrice?: number
  /** EN: Explicit line amount; skips the quantity × price computation. ES: `MontoItem` — Monto explícito de la línea; omite el cálculo cantidad × precio. */
  readonly amount?: number
}

/**
 * EN: A normalized detail line (`Detalle`).
 * ES: `Detalle` — Línea de detalle normalizada.
 */
export type LineItem = {
  /** EN: 1-based line number. ES: `NroLinDet` — Número de línea, desde 1. */
  readonly lineNumber: number
  /** EN: Item codes. ES: `CdgItem` — Códigos del ítem. */
  readonly codes?: readonly ItemCode[]
  /** EN: Settled document type (43 only). ES: `TpoDocLiq` — Tipo del documento liquidado (solo 43). */
  readonly settledDocumentType?: string
  /** EN: Exemption indicator; absent on VAT-affected lines. ES: `IndExe` — Indicador de exención; ausente en líneas afectas. */
  readonly exemptIndicator?: ExemptIndicator
  /** EN: Item name. ES: `NmbItem` — Nombre del ítem. */
  readonly name: string
  /** EN: Description. ES: `DscItem` — Descripción. */
  readonly description?: string
  /** EN: Reference quantity. ES: `QtyRef` — Cantidad de referencia. */
  readonly referenceQuantity?: number
  /** EN: Reference unit. ES: `UnmdRef` — Unidad de referencia. */
  readonly referenceUnit?: string
  /** EN: Reference price. ES: `PrcRef` — Precio de referencia. */
  readonly referencePrice?: number
  /** EN: Quantity. ES: `QtyItem` — Cantidad. */
  readonly quantity?: number
  /** EN: Unit of measure. ES: `UnmdItem` — Unidad de medida. */
  readonly unit?: string
  /** EN: Unit price as declared. ES: `PrcItem` — Precio unitario tal como se declara. */
  readonly unitPrice?: number
  /** EN: Discount percent. ES: `DescuentoPct` — Porcentaje de descuento. */
  readonly discountPercent?: number
  /** EN: Discount amount. ES: `DescuentoMonto` — Monto del descuento. */
  readonly discountAmount?: number
  /** EN: Surcharge percent. ES: `RecargoPct` — Porcentaje de recargo. */
  readonly surchargePercent?: number
  /** EN: Surcharge amount. ES: `RecargoMonto` — Monto del recargo. */
  readonly surchargeAmount?: number
  /** EN: Additional tax codes. ES: `CodImpAdic` — Códigos de impuesto adicional. */
  readonly additionalTaxCodes?: readonly number[]
  /** EN: Line amount, integer pesos. ES: `MontoItem` — Monto de la línea, entero en pesos. */
  readonly amount: number
}

/**
 * EN: Withholding tax entry (`ImptoReten`), e.g. total VAT withholding on purchase invoices.
 * ES: `ImptoReten` — Impuesto de retención, p. ej. IVA retenido total en facturas de compra (46).
 */
export type Withholding = {
  /** EN: Tax code. ES: `TipoImp` — Código del impuesto (15 = IVA retenido total). */
  readonly taxCode: number
  /** EN: Rate percent. ES: `TasaImp` — Tasa en porcentaje. */
  readonly rate: number
  /** EN: Withheld amount. ES: `MontoImp` — Monto retenido. */
  readonly amount: number
}

/**
 * EN: Commission totals of a settlement invoice (`Totales/Comisiones`).
 * ES: `Comisiones` (dentro de `Totales`) — Totales de comisiones de una liquidación factura.
 */
export type CommissionTotals = {
  /** EN: Net commission value. ES: `ValComNeto` — Valor neto de las comisiones. */
  readonly netValue?: number
  /** EN: Exempt commission value. ES: `ValComExe` — Valor exento de las comisiones. */
  readonly exemptValue?: number
  /** EN: VAT on commissions. ES: `ValComIVA` — IVA de las comisiones. */
  readonly vatValue?: number
}

/**
 * EN: Document totals (`Totales`). Integer pesos.
 * ES: `Totales` — Totales del documento. Enteros en pesos.
 */
export type Totals = {
  /** EN: Net amount: VAT-affected lines before tax; omitted when 0. ES: `MntNeto` — Monto neto: líneas afectas sin IVA; se omite si es 0. */
  readonly netAmount?: number
  /** EN: Exempt amount (`IndExe=1` lines). ES: `MntExe` — Monto exento (líneas con `IndExe=1`). */
  readonly exemptAmount?: number
  /** EN: VAT rate percent (19); never on receipts. ES: `TasaIVA` — Tasa de IVA (19); nunca en boletas. */
  readonly vatRate?: number
  /** EN: VAT amount. ES: `IVA` — Monto del IVA. */
  readonly vatAmount?: number
  /** EN: Own VAT (settlement invoices). ES: `IVAProp` — IVA propio (liquidaciones). */
  readonly ownVatAmount?: number
  /** EN: Third-party VAT (settlement invoices). ES: `IVATerc` — IVA de terceros (liquidaciones). */
  readonly thirdPartyVatAmount?: number
  /** EN: Withholdings. ES: `ImptoReten` — Retenciones. */
  readonly withholdings?: readonly Withholding[]
  /** EN: Commission totals (43). ES: `Comisiones` — Totales de comisiones (43). */
  readonly commissions?: CommissionTotals
  /** EN: Document total: net + VAT + exempt (VAT excluded when withheld). ES: `MntTotal` — Monto total: neto + IVA + exento (sin IVA si está retenido). */
  readonly totalAmount: number
  /** EN: Non-billable amount (lines with `IndExe` 2-6). ES: `MontoNF` — Monto no facturable (líneas con `IndExe` 2 a 6). */
  readonly nonBillableAmount?: number
  /** EN: Period amount. ES: `MontoPeriodo` — Monto del período. */
  readonly periodAmount?: number
  /** EN: Previous balance. ES: `SaldoAnterior` — Saldo anterior. */
  readonly previousBalance?: number
  /** EN: Amount due. ES: `VlrPagar` — Valor a pagar. */
  readonly amountDue?: number
}

/**
 * EN: Reference to another document as the caller provides it (`Referencia`).
 * ES: `Referencia` — Referencia a otro documento tal como la entrega el llamador.
 */
export type ReferenceInput = {
  /** EN: Referenced document type, or `'SET'` for certification test sets. ES: `TpoDocRef` — Tipo del documento referenciado, o `'SET'` en los sets de certificación. */
  readonly documentType: number | 'SET'
  /** EN: Referenced folio. ES: `FolioRef` — Folio del documento referenciado. */
  readonly folio: number | string
  /** EN: Referenced document date YYYY-MM-DD. ES: `FchRef` — Fecha del documento referenciado, AAAA-MM-DD. */
  readonly date: string
  /** EN: Reference code (1 cancels, 2 corrects text, 3 corrects amounts). ES: `CodRef` — Código de referencia (1 anula, 2 corrige texto, 3 corrige montos). */
  readonly code?: ReferenceCode
  /** EN: Reason (max 90). ES: `RazonRef` — Razón de la referencia, máximo 90. */
  readonly reason?: string
  /** EN: Global reference (`IndGlobal=1`). ES: `IndGlobal` — Referencia global. */
  readonly global?: boolean
  /** EN: RUT of another issuer. ES: `RUTOtr` — RUT de otro contribuyente. */
  readonly otherRut?: string
}

/**
 * EN: Normalized reference.
 * ES: `Referencia` — Referencia normalizada.
 */
export type Reference = {
  /** EN: 1-based line number. ES: `NroLinRef` — Número de línea, desde 1. */
  readonly lineNumber: number
  /** EN: Referenced document type or `'SET'`. ES: `TpoDocRef` — Tipo del documento referenciado o `'SET'`. */
  readonly documentType: number | 'SET'
  /** EN: Global reference. ES: `IndGlobal` — Referencia global. */
  readonly global?: true
  /** EN: Referenced folio. ES: `FolioRef` — Folio referenciado. */
  readonly folio: string
  /** EN: RUT of another issuer. ES: `RUTOtr` — RUT de otro contribuyente. */
  readonly otherRut?: SiiRut
  /** EN: Referenced document date. ES: `FchRef` — Fecha del documento referenciado. */
  readonly date: string
  /** EN: Reference code. ES: `CodRef` — Código de referencia. */
  readonly code?: ReferenceCode
  /** EN: Reason. ES: `RazonRef` — Razón. */
  readonly reason?: string
}

/**
 * EN: Reference on a receipt (39, 41) as the caller provides it. The receipts schema gives `Referencia` its own
 * shape: no date, and a code that is the company's own text.
 * ES: `Referencia` de una boleta (39, 41) tal como la entrega el llamador. El esquema de boletas le da a `Referencia`
 * su propia forma: sin fecha, y con un código que es texto propio de la empresa.
 */
export type ReceiptReferenceInput = {
  /** EN: The company's own reference code (max 18); `SET` in the certification test set. ES: `CodRef` — Código interno del tipo de referencia, máximo 18; `SET` en el set de pruebas de certificación. */
  readonly code?: string
  /** EN: Reason (max 90). ES: `RazonRef` — Razón de la referencia, máximo 90. */
  readonly reason?: string
  /** EN: Referenced document type (max 3). ES: `TpoDocRef` — Tipo del documento referenciado, máximo 3. */
  readonly documentType?: number | string
  /** EN: Referenced folio (max 18). ES: `FolioRef` — Folio del documento referenciado, máximo 18. */
  readonly folio?: number | string
}

/**
 * EN: Normalized reference of a receipt.
 * ES: `Referencia` de una boleta, normalizada.
 */
export type ReceiptReference = {
  /** EN: 1-based line number. ES: `NroLinRef` — Número de línea, desde 1. */
  readonly lineNumber: number
  /** EN: Referenced document type. ES: `TpoDocRef` — Tipo del documento referenciado. */
  readonly documentType?: string
  /** EN: Referenced folio. ES: `FolioRef` — Folio referenciado. */
  readonly folio?: string
  /** EN: The company's own reference code. ES: `CodRef` — Código interno del tipo de referencia. */
  readonly code?: string
  /** EN: Reason. ES: `RazonRef` — Razón. */
  readonly reason?: string
}

/**
 * EN: Global discount or surcharge as the caller provides it (`DscRcgGlobal`).
 * ES: `DscRcgGlobal` — Descuento o recargo global tal como lo entrega el llamador.
 */
export type GlobalAdjustmentInput = {
  /** EN: `discount` (D) or `surcharge` (R). ES: `TpoMov` — `discount` (D, descuento) o `surcharge` (R, recargo). */
  readonly kind: 'discount' | 'surcharge'
  /** EN: `percent` (%) or `amount` ($). ES: `TpoValor` — `percent` (%) o `amount` ($). */
  readonly valueType: 'percent' | 'amount'
  /** EN: Value in the unit of `valueType`. ES: `ValorDR` — Valor en la unidad de `valueType`. */
  readonly value: number
  /** EN: Description (max 45). ES: `GlosaDR` — Glosa, máximo 45. */
  readonly description?: string
  /** EN: Applies to exempt (1) or non-billable (2) amounts instead of affected ones. ES: `IndExeDR` — Aplica a montos exentos (1) o no facturables (2) en vez de afectos. */
  readonly exemptIndicator?: 1 | 2
}

/**
 * EN: Normalized global adjustment.
 * ES: `DscRcgGlobal` — Descuento o recargo global normalizado.
 */
export type GlobalAdjustment = GlobalAdjustmentInput & {
  /** EN: 1-based line number. ES: `NroLinDR` — Número de línea, desde 1. */
  readonly lineNumber: number
}

/**
 * EN: Commission or other charge line of a settlement invoice (`Comisiones`).
 * ES: `Comisiones` — Línea de comisión u otro cargo de una liquidación factura (43).
 */
export type CommissionLine = {
  /** EN: 1-based line number. ES: `NroLinCom` — Número de línea, desde 1. */
  readonly lineNumber: number
  /** EN: `commission` (C) or `otherCharge` (O). ES: `TipoMovim` — `commission` (C, comisión) u `otherCharge` (O, otro cargo). */
  readonly kind: 'commission' | 'otherCharge'
  /** EN: Description (max 60). ES: `Glosa` — Glosa, máximo 60. */
  readonly description: string
  /** EN: Commission rate percent. ES: `TasaComision` — Tasa de la comisión en porcentaje. */
  readonly rate?: number
  /** EN: Net value. ES: `ValComNeto` — Valor neto. */
  readonly netValue?: number
  /** EN: Exempt value. ES: `ValComExe` — Valor exento. */
  readonly exemptValue?: number
  /** EN: VAT value. ES: `ValComIVA` — IVA de la comisión. */
  readonly vatValue?: number
}

/** EN: Commission line as the caller provides it. ES: Línea de comisión tal como la entrega el llamador. */
export type CommissionLineInput = Omit<CommissionLine, 'lineNumber'>

/**
 * EN: Driver of the transport (`Chofer`).
 * ES: `Chofer` — Conductor del transporte.
 */
export type Driver = {
  /** EN: Driver RUT. ES: `RUTChofer` — RUT del chofer. */
  readonly rut: SiiRut
  /** EN: Driver name (max 30). ES: `NombreChofer` — Nombre del chofer, máximo 30. */
  readonly name: string
}

/**
 * EN: Transport data of a dispatch guide (`Transporte`).
 * ES: `Transporte` — Datos de transporte de una guía de despacho (52).
 */
export type Transport = {
  /** EN: License plate (max 8). ES: `Patente` — Patente del vehículo, máximo 8. */
  readonly licensePlate?: string
  /** EN: Carrier RUT. ES: `RUTTrans` — RUT del transportista. */
  readonly carrierRut?: SiiRut
  /** EN: Driver. ES: `Chofer` — Chofer. */
  readonly driver?: Driver
  /** EN: Destination address (max 70). ES: `DirDest` — Dirección de destino, máximo 70. */
  readonly destinationAddress?: string
  /** EN: Destination commune (max 20). ES: `CmnaDest` — Comuna de destino, máximo 20. */
  readonly destinationCommune?: string
  /** EN: Destination city (max 20). ES: `CiudadDest` — Ciudad de destino, máximo 20. */
  readonly destinationCity?: string
}

/** EN: Transport as the caller provides it. ES: Transporte tal como lo entrega el llamador. */
export type TransportInput = Omit<Transport, 'carrierRut' | 'driver'> & {
  readonly carrierRut?: string
  readonly driver?: { readonly rut: string; readonly name: string }
}

/**
 * EN: A payment installment (`MntPagos`).
 * ES: `MntPagos` — Una cuota de pago.
 */
export type Payment = {
  /** EN: Payment date. ES: `FchPago` — Fecha de pago. */
  readonly date: string
  /** EN: Payment amount. ES: `MntPago` — Monto del pago. */
  readonly amount: number
  /** EN: Note (max 40). ES: `GlosaPagos` — Glosa, máximo 40. */
  readonly note?: string
}

/**
 * EN: Optional `IdDoc` fields. Only the ones you set are emitted, in schema order.
 * ES: Campos opcionales de `IdDoc`. Solo se emiten los que se fijan, en el orden del esquema.
 */
export type HeaderOptions = {
  /** EN: Credit note that does not reduce the debit (`IndNoRebaja=1`). ES: `IndNoRebaja` — Nota de crédito sin derecho a descontar débito (1). */
  readonly noDebitReduction?: 1
  /** EN: Dispatch type. ES: `TipoDespacho` — Tipo de despacho (1-3). */
  readonly dispatchType?: DispatchType
  /** EN: Transfer reason. ES: `IndTraslado` — Tipo de traslado (1-9). */
  readonly transferType?: TransferType
  /** EN: Print format: `N` normal, `T` ticket. ES: `TpoImpresion` — Formato de impresión: `N` normal, `T` ticket. */
  readonly printFormat?: 'N' | 'T'
  /** EN: Service indicator. ES: `IndServicio` — Indicador de servicio (1-4; 3 por defecto en boletas). */
  readonly serviceIndicator?: ServiceIndicator
  /** EN: Line amounts include VAT (`MntBruto=1`); set automatically with `pricesIncludeVat`. ES: `MntBruto` — Montos de las líneas con IVA incluido (1); se fija solo con `pricesIncludeVat`. */
  readonly grossAmounts?: 1
  /** EN: Purchase transaction type. ES: `TpoTranCompra` — Tipo de transacción de compra (1-7). */
  readonly purchaseTransactionType?: number
  /** EN: Sale transaction type. ES: `TpoTranVenta` — Tipo de transacción de venta (1-4). */
  readonly saleTransactionType?: number
  /** EN: Payment terms. ES: `FmaPago` — Forma de pago (1 contado, 2 crédito, 3 sin costo). */
  readonly paymentTerms?: PaymentTerms
  /** EN: Export payment terms. ES: `FmaPagExp` — Forma de pago de exportación. */
  readonly exportPaymentTerms?: string
  /** EN: Settlement date. ES: `FchCancel` — Fecha de cancelación. */
  readonly settlementDate?: string
  /** EN: Settled amount. ES: `MntCancel` — Monto cancelado. */
  readonly settledAmount?: number
  /** EN: Outstanding balance. ES: `SaldoInsol` — Saldo insoluto. */
  readonly outstandingBalance?: number
  /** EN: Payment installments. ES: `MntPagos` — Cuotas de pago. */
  readonly payments?: readonly Payment[]
  /** EN: Billing period. ES: `PeriodoDesde`/`PeriodoHasta` — Período de facturación. */
  readonly billingPeriod?: { readonly from: string; readonly to: string }
  /** EN: Payment medium. ES: `MedioPago` — Medio de pago. */
  readonly paymentMedium?: string
  /** EN: Payment account type. ES: `TpoCtaPago` — Tipo de cuenta de pago. */
  readonly paymentAccountType?: string
  /** EN: Payment account number. ES: `NumCtaPago` — Número de cuenta de pago. */
  readonly paymentAccountNumber?: string
  /** EN: Payment bank. ES: `BcoPago` — Banco de pago. */
  readonly paymentBank?: string
  /** EN: Payment terms code. ES: `TermPagoCdg` — Código de términos de pago. */
  readonly paymentTermsCode?: string
  /** EN: Payment terms note (max 100). ES: `TermPagoGlosa` — Glosa de términos de pago, máximo 100. */
  readonly paymentTermsNote?: string
  /** EN: Payment terms days. ES: `TermPagoDias` — Días de los términos de pago. */
  readonly paymentTermsDays?: number
  /** EN: Due date. ES: `FchVenc` — Fecha de vencimiento. */
  readonly dueDate?: string
  /** EN: Net amounts indicator. ES: `IndMntNeto` — Indicador de montos netos. */
  readonly netAmountsIndicator?: number
}

/**
 * EN: Informative subtotal (`SubTotInfo`).
 * ES: `SubTotInfo` — Subtotal informativo.
 */
export type SubtotalInfo = {
  /** EN: Subtotal number. ES: `NroSTI` — Número del subtotal. */
  readonly number: number
  /** EN: Description (max 40). ES: `GlosaSTI` — Glosa, máximo 40. */
  readonly description?: string
  /** EN: Print order. ES: `OrdenSTI` — Orden de impresión. */
  readonly order?: number
  /** EN: Net subtotal. ES: `SubTotNetoSTI` — Subtotal neto. */
  readonly netAmount?: number
  /** EN: VAT subtotal. ES: `SubTotIVASTI` — Subtotal IVA. */
  readonly vatAmount?: number
  /** EN: Additional taxes subtotal. ES: `SubTotAdicSTI` — Subtotal impuestos adicionales. */
  readonly additionalTaxAmount?: number
  /** EN: Exempt subtotal. ES: `SubTotExeSTI` — Subtotal exento. */
  readonly exemptAmount?: number
  /** EN: Subtotal value. ES: `ValSubtotSTI` — Valor del subtotal. */
  readonly totalAmount: number
  /** EN: Detail line numbers included. ES: `LineasDeta` — Líneas de detalle incluidas. */
  readonly lines?: readonly number[]
}

/**
 * EN: Document header (`Encabezado`).
 * ES: `Encabezado` — Encabezado del documento.
 */
export type Header = {
  /** EN: Document type. ES: `TipoDTE` — Tipo de documento. */
  readonly type: DocumentType
  /** EN: Folio. ES: `Folio` — Folio. */
  readonly folio: number
  /** EN: Issue date YYYY-MM-DD. ES: `FchEmis` — Fecha de emisión AAAA-MM-DD. */
  readonly issueDate: string
  /** EN: Optional `IdDoc` fields. ES: Campos opcionales de `IdDoc`. */
  readonly options: HeaderOptions
  readonly issuer: Issuer
  readonly receiver: Receiver
  readonly transport?: Transport
  readonly totals: Totals
}

/**
 * EN: A normalized document, ready to be rendered, stamped and signed. Produced by `createDocument`.
 * ES: Documento normalizado, listo para renderizar, timbrar y firmar. Lo produce `createDocument`.
 */
export type Document = {
  /** EN: `ID` attribute of the signed element: `DTE_T{type}F{folio}`. ES: Atributo `ID` del elemento firmado: `DTE_T{tipo}F{folio}`. */
  readonly id: string
  readonly header: Header
  readonly items: readonly LineItem[]
  readonly subtotals: readonly SubtotalInfo[]
  readonly globalAdjustments: readonly GlobalAdjustment[]
  readonly references: readonly Reference[]
  /** EN: References of a receipt (39, 41), which has its own shape; empty on every other type. ES: `Referencia` — Referencias de una boleta (39, 41), que tiene forma propia; vacío en los demás tipos. */
  readonly receiptReferences: readonly ReceiptReference[]
  /** EN: Commission lines (settlement invoices only). ES: `Comisiones` — Líneas de comisión (solo 43). */
  readonly commissions: readonly CommissionLine[]
}

/**
 * EN: What the caller passes to `createDocument`.
 * ES: Lo que el llamador entrega a `createDocument`.
 */
export type DocumentInput = {
  /** EN: Document type. ES: `TipoDTE` — Tipo de documento. */
  readonly type: DocumentType
  /** EN: Folio authorized by the CAF. ES: `Folio` — Folio autorizado por el CAF. */
  readonly folio: number
  /** EN: Issue date YYYY-MM-DD; defaults to today in Chile. ES: `FchEmis` — Fecha de emisión AAAA-MM-DD; por defecto hoy en hora de Chile. */
  readonly issueDate?: string
  readonly issuer: IssuerInput
  /** EN: Receiver; optional on receipts (anonymous final consumer). ES: Receptor; opcional en boletas (consumidor final anónimo). */
  readonly receiver?: ReceiverInput
  readonly items: readonly LineItemInput[]
  readonly references?: readonly ReferenceInput[]
  /** EN: References of a receipt (39, 41); `references` is for every other type. ES: `Referencia` — Referencias de una boleta (39, 41); `references` es para los demás tipos. */
  readonly receiptReferences?: readonly ReceiptReferenceInput[]
  readonly globalAdjustments?: readonly GlobalAdjustmentInput[]
  readonly subtotals?: readonly SubtotalInfo[]
  readonly commissions?: readonly CommissionLineInput[]
  readonly transport?: TransportInput
  readonly options?: HeaderOptions
  /** EN: Unit prices already include VAT: emits `MntBruto=1` and derives net/VAT from the gross. ES: Los precios unitarios ya incluyen IVA: emite `MntBruto=1` y deriva neto/IVA del bruto. */
  readonly pricesIncludeVat?: boolean
  /** EN: Withhold the whole VAT (`ImptoReten` 15, total without VAT); true by default on purchase invoices, settable on the notes that affect one. ES: `ImptoReten` — Retener todo el IVA (código 15, total sin IVA); true por defecto en facturas de compra (46), se puede fijar en las notas que las afectan. */
  readonly withholdVat?: boolean
  /** EN: Explicit totals (advanced); computed when omitted. ES: Totales explícitos (uso avanzado); se calculan si se omiten. */
  readonly totals?: Totals
}
