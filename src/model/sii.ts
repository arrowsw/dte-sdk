/**
 * EN: The SII-shaped model: the official tags of `DTE_v10.xsd` / `EnvioBOLETA_v11.xsd`, verbatim, in schema order.
 * Every field says what its abbreviation stands for; the English domain model in `./document` is what consumers
 * normally use, and `./codec` converts between the two.
 * ES: El modelo con forma SII: las etiquetas oficiales de `DTE_v10.xsd` / `EnvioBOLETA_v11.xsd`, tal cual y en el
 * orden del esquema. Cada campo dice qué significa su abreviatura; el modelo de dominio en inglés de `./document`
 * es el que usan normalmente los consumidores, y `./codec` convierte entre ambos.
 */

/**
 * EN: Payment installment, SII shape.
 * ES: `MntPagos` — Cuota de pago, forma SII.
 */
export type SiiMntPagos = {
  /** EN: Installment date YYYY-MM-DD. ES: `FchPago` — Fecha de pago, AAAA-MM-DD. */
  readonly FchPago: string
  /** EN: Installment amount. ES: `MntPago` — Monto del pago. */
  readonly MntPago: number
  /** EN: Free-text note for the installment. ES: `GlosaPagos` — Glosa del pago. */
  readonly GlosaPagos?: string
}

/**
 * EN: `IdDoc` with the official tags, in schema order.
 * ES: `IdDoc` con las etiquetas oficiales, en el orden del esquema.
 */
export type SiiIdDoc = {
  /** EN: Document type (33, 34, 39, 41, 43, 46, 52, 56, 61). ES: `TipoDTE` — Tipo de DTE. */
  readonly TipoDTE: number
  /** EN: Sequential number authorized by the CAF. ES: `Folio` — Folio del documento. */
  readonly Folio: number
  /** EN: Issue date YYYY-MM-DD. ES: `FchEmis` — Fecha de emisión. */
  readonly FchEmis: string
  /** EN: 1 when a credit note does not reduce the debit. ES: `IndNoRebaja` — Indicador "no rebaja" (nota de crédito que no rebaja el débito). */
  readonly IndNoRebaja?: number
  /** EN: Dispatch type on guides: 1 receiver picks up, 2 issuer delivers to the customer, 3 issuer delivers elsewhere. ES: `TipoDespacho` — Tipo de despacho. */
  readonly TipoDespacho?: number
  /** EN: Transfer reason on guides (1 sale … 9 export sale). ES: `IndTraslado` — Indicador de traslado. */
  readonly IndTraslado?: number
  /** EN: Print format: N normal, T ticket. ES: `TpoImpresion` — Tipo de impresión. */
  readonly TpoImpresion?: string
  /** EN: Service indicator (3 = goods and services on receipts, 1/2 periodic services). ES: `IndServicio` — Indicador de servicio. */
  readonly IndServicio?: number
  /** EN: 1 when the line amounts already include VAT. ES: `MntBruto` — Indicador de montos brutos. */
  readonly MntBruto?: number
  /** EN: Purchase transaction type (1 ordinary purchases…). ES: `TpoTranCompra` — Tipo de transacción de compra. */
  readonly TpoTranCompra?: number
  /** EN: Sale transaction type (1 ordinary sales, 2 fixed assets, 3 real estate). ES: `TpoTranVenta` — Tipo de transacción de venta. */
  readonly TpoTranVenta?: number
  /** EN: Payment terms: 1 cash, 2 credit, 3 free of charge. ES: `FmaPago` — Forma de pago. */
  readonly FmaPago?: number
  /** EN: Export payment terms (customs code). ES: `FmaPagExp` — Forma de pago de exportación. */
  readonly FmaPagExp?: string
  /** EN: Settlement (full payment) date. ES: `FchCancel` — Fecha de cancelación. */
  readonly FchCancel?: string
  /** EN: Amount settled. ES: `MntCancel` — Monto cancelado. */
  readonly MntCancel?: number
  /** EN: Outstanding balance. ES: `SaldoInsol` — Saldo insoluto. */
  readonly SaldoInsol?: number
  /** EN: Payment installments. ES: `MntPagos` — Montos de los pagos (cuotas). */
  readonly MntPagos?: readonly SiiMntPagos[]
  /** EN: Billing period start. ES: `PeriodoDesde` — Período de facturación, desde. */
  readonly PeriodoDesde?: string
  /** EN: Billing period end. ES: `PeriodoHasta` — Período de facturación, hasta. */
  readonly PeriodoHasta?: string
  /** EN: Payment medium (CH cheque, LT bill, EF cash, PE account transfer, TC credit card, OT other). ES: `MedioPago` — Medio de pago. */
  readonly MedioPago?: string
  /** EN: Payment account type (AHORRO, CORRIENTE, VISTA). ES: `TpoCtaPago` — Tipo de cuenta de pago. */
  readonly TpoCtaPago?: string
  /** EN: Payment account number. ES: `NumCtaPago` — Número de cuenta de pago. */
  readonly NumCtaPago?: string
  /** EN: Payment bank. ES: `BcoPago` — Banco de pago. */
  readonly BcoPago?: string
  /** EN: Payment terms code. ES: `TermPagoCdg` — Código de los términos de pago. */
  readonly TermPagoCdg?: string
  /** EN: Payment terms note. ES: `TermPagoGlosa` — Glosa de los términos de pago. */
  readonly TermPagoGlosa?: string
  /** EN: Payment terms in days. ES: `TermPagoDias` — Días de los términos de pago. */
  readonly TermPagoDias?: number
  /** EN: Due date YYYY-MM-DD. ES: `FchVenc` — Fecha de vencimiento. */
  readonly FchVenc?: string
  /** EN: 2 when receipt amounts are net. ES: `IndMntNeto` — Indicador de montos netos (boletas). */
  readonly IndMntNeto?: number
}

/** EN: `Emisor`, SII shape (receipts use `RznSocEmisor`/`GiroEmisor`). ES: `Emisor` en forma SII (las boletas usan `RznSocEmisor`/`GiroEmisor`). */
export type SiiEmisor = {
  /** EN: Issuer RUT. ES: `RUTEmisor` — RUT del emisor. */
  readonly RUTEmisor: string
  /** EN: Issuer business name (DTE). ES: `RznSoc` — Razón social del emisor. */
  readonly RznSoc?: string
  /** EN: Issuer business name (receipts). ES: `RznSocEmisor` — Razón social del emisor, variante de boletas. */
  readonly RznSocEmisor?: string
  /** EN: Issuer line of business (DTE). ES: `GiroEmis` — Giro del emisor. */
  readonly GiroEmis?: string
  /** EN: Issuer line of business (receipts). ES: `GiroEmisor` — Giro del emisor, variante de boletas. */
  readonly GiroEmisor?: string
  /** EN: Phone. ES: `Telefono` — Teléfono del emisor. */
  readonly Telefono?: string
  /** EN: Issuer e-mail. ES: `CorreoEmisor` — Correo electrónico del emisor. */
  readonly CorreoEmisor?: string
  /** EN: SII economic activity code. ES: `Acteco` — Código de actividad económica. */
  readonly Acteco?: number
  /** EN: Branch name. ES: `Sucursal` — Nombre de la sucursal. */
  readonly Sucursal?: string
  /** EN: SII branch code. ES: `CdgSIISucur` — Código de sucursal registrado en el SII. */
  readonly CdgSIISucur?: number
  /** EN: Issuer street address. ES: `DirOrigen` — Dirección de origen. */
  readonly DirOrigen: string
  /** EN: Issuer commune. ES: `CmnaOrigen` — Comuna de origen. */
  readonly CmnaOrigen: string
  /** EN: Issuer city. ES: `CiudadOrigen` — Ciudad de origen. */
  readonly CiudadOrigen?: string
  /** EN: Salesperson code. ES: `CdgVendedor` — Código del vendedor. */
  readonly CdgVendedor?: string
}

/** EN: `Receptor`, SII shape. ES: `Receptor` en forma SII. */
export type SiiReceptor = {
  /** EN: Receiver RUT. ES: `RUTRecep` — RUT del receptor. */
  readonly RUTRecep: string
  /** EN: Issuer's internal customer code. ES: `CdgIntRecep` — Código interno del receptor. */
  readonly CdgIntRecep?: string
  /** EN: Receiver business name. ES: `RznSocRecep` — Razón social del receptor. */
  readonly RznSocRecep: string
  /** EN: Receiver line of business. ES: `GiroRecep` — Giro del receptor. */
  readonly GiroRecep?: string
  /** EN: Contact person. ES: `Contacto` — Persona de contacto. */
  readonly Contacto?: string
  /** EN: Receiver e-mail. ES: `CorreoRecep` — Correo electrónico del receptor. */
  readonly CorreoRecep?: string
  /** EN: Receiver street address. ES: `DirRecep` — Dirección del receptor. */
  readonly DirRecep?: string
  /** EN: Receiver commune. ES: `CmnaRecep` — Comuna del receptor. */
  readonly CmnaRecep?: string
  /** EN: Receiver city. ES: `CiudadRecep` — Ciudad del receptor. */
  readonly CiudadRecep?: string
  /** EN: Postal address. ES: `DirPostal` — Dirección postal. */
  readonly DirPostal?: string
  /** EN: Postal commune. ES: `CmnaPostal` — Comuna postal. */
  readonly CmnaPostal?: string
  /** EN: Postal city. ES: `CiudadPostal` — Ciudad postal. */
  readonly CiudadPostal?: string
}

/** EN: `Transporte`, SII shape. ES: `Transporte` en forma SII. */
export type SiiTransporte = {
  /** EN: Vehicle licence plate. ES: `Patente` — Patente del vehículo. */
  readonly Patente?: string
  /** EN: Trailer or semi-trailer licence plate. ES: `PatenteCarro` — Patente del carro o remolque. */
  readonly PatenteCarro?: string
  /** EN: Carrier RUT. ES: `RUTTrans` — RUT del transportista. */
  readonly RUTTrans?: string
  /** EN: Driver: RUT and name. ES: `Chofer` — Chofer: `RUTChofer` (RUT del chofer) y `NombreChofer` (nombre del chofer). */
  readonly Chofer?: { readonly RUTChofer: string; readonly NombreChofer: string }
  /** EN: Destination street address. ES: `DirDest` — Dirección de destino. */
  readonly DirDest?: string
  /** EN: Destination commune. ES: `CmnaDest` — Comuna de destino. */
  readonly CmnaDest?: string
  /** EN: Destination city. ES: `CiudadDest` — Ciudad de destino. */
  readonly CiudadDest?: string
  /** EN: Departure date, `YYYY-MM-DD`. ES: `FchSalida` — Fecha de salida. */
  readonly FchSalida?: string
  /** EN: Departure time, `HH:MM:SS`. ES: `HraSalida` — Hora de salida. */
  readonly HraSalida?: string
  /** EN: Arrival date, `YYYY-MM-DD`. ES: `FchLlegada` — Fecha de llegada. */
  readonly FchLlegada?: string
}

/** EN: `ImptoReten`, SII shape. ES: `ImptoReten` en forma SII. */
export type SiiImptoReten = {
  /** EN: Additional tax or withholding code (15 = full VAT withholding). ES: `TipoImp` — Tipo de impuesto adicional o retención. */
  readonly TipoImp: number
  /** EN: Tax rate, percent. ES: `TasaImp` — Tasa del impuesto. */
  readonly TasaImp: number
  /** EN: Tax amount. ES: `MontoImp` — Monto del impuesto. */
  readonly MontoImp: number
}

/** EN: `Totales/Comisiones`, SII shape. ES: `Totales/Comisiones` en forma SII. */
export type SiiComisionesTotales = {
  /** EN: Net value of commissions and other charges. ES: `ValComNeto` — Valor neto de comisiones y otros cargos. */
  readonly ValComNeto?: number
  /** EN: Exempt value of commissions. ES: `ValComExe` — Valor exento de comisiones. */
  readonly ValComExe?: number
  /** EN: VAT on commissions. ES: `ValComIVA` — IVA de las comisiones. */
  readonly ValComIVA?: number
}

/** EN: `Totales`, SII shape, schema order. ES: `Totales` en forma SII, orden del esquema. */
export type SiiTotales = {
  /** EN: Net amount. ES: `MntNeto` — Monto neto. */
  readonly MntNeto?: number
  /** EN: Exempt amount. ES: `MntExe` — Monto exento. */
  readonly MntExe?: number
  /** EN: VAT rate, percent. ES: `TasaIVA` — Tasa de IVA. */
  readonly TasaIVA?: number
  /** EN: VAT amount. ES: `IVA` — Monto del IVA. */
  readonly IVA?: number
  /** EN: Issuer's own VAT (partial withholding). ES: `IVAProp` — IVA propio. */
  readonly IVAProp?: number
  /** EN: Third-party VAT (partial withholding). ES: `IVATerc` — IVA de terceros. */
  readonly IVATerc?: number
  /** EN: Additional taxes and withholdings. ES: `ImptoReten` — Impuestos adicionales y retenciones. */
  readonly ImptoReten?: readonly SiiImptoReten[]
  /** EN: Commission totals (settlement invoices). ES: `Comisiones` — Totales de comisiones (liquidación factura). */
  readonly Comisiones?: SiiComisionesTotales
  /** EN: Document total. ES: `MntTotal` — Monto total. */
  readonly MntTotal: number
  /** EN: Non-billable amount. ES: `MontoNF` — Monto no facturable. */
  readonly MontoNF?: number
  /** EN: Amount for the period. ES: `MontoPeriodo` — Monto del período. */
  readonly MontoPeriodo?: number
  /** EN: Previous balance. ES: `SaldoAnterior` — Saldo anterior. */
  readonly SaldoAnterior?: number
  /** EN: Amount due. ES: `VlrPagar` — Valor a pagar. */
  readonly VlrPagar?: number
}

/** EN: `Encabezado`, SII shape. ES: `Encabezado` en forma SII. */
export type SiiEncabezado = {
  /** EN: Document identification. ES: `IdDoc` — Identificación del documento. */
  readonly IdDoc: SiiIdDoc
  /** EN: Issuer. ES: `Emisor` — Emisor. */
  readonly Emisor: SiiEmisor
  /** EN: Receiver. ES: `Receptor` — Receptor. */
  readonly Receptor: SiiReceptor
  /** EN: Transport data (dispatch guides). ES: `Transporte` — Datos de transporte (guías de despacho). */
  readonly Transporte?: SiiTransporte
  /** EN: Totals. ES: `Totales` — Totales. */
  readonly Totales: SiiTotales
}

/** EN: `CdgItem`, SII shape. ES: `CdgItem` en forma SII. */
export type SiiCdgItem = {
  /** EN: Code system (EAN, INT1…). ES: `TpoCodigo` — Tipo de codificación. */
  readonly TpoCodigo: string
  /** EN: Code value. ES: `VlrCodigo` — Valor del código. */
  readonly VlrCodigo: string
}

/** EN: `Detalle`, SII shape, schema order. ES: `Detalle` en forma SII, orden del esquema. */
export type SiiDetalle = {
  /** EN: Line number. ES: `NroLinDet` — Número de línea de detalle. */
  readonly NroLinDet: number
  /** EN: Item codes. ES: `CdgItem` — Códigos del ítem. */
  readonly CdgItem?: readonly SiiCdgItem[]
  /** EN: Type of the document settled by this line (settlement invoices, 43). ES: `TpoDocLiq` — Tipo de documento liquidado. */
  readonly TpoDocLiq?: string
  /** EN: Exemption indicator (1 exempt, 2–6 non-billable variants). ES: `IndExe` — Indicador de exención. */
  readonly IndExe?: number
  /** EN: Item name. ES: `NmbItem` — Nombre del ítem. */
  readonly NmbItem: string
  /** EN: Item description. ES: `DscItem` — Descripción del ítem. */
  readonly DscItem?: string
  /** EN: Reference quantity. ES: `QtyRef` — Cantidad de referencia. */
  readonly QtyRef?: number
  /** EN: Reference unit of measure. ES: `UnmdRef` — Unidad de medida de referencia. */
  readonly UnmdRef?: string
  /** EN: Reference price. ES: `PrcRef` — Precio de referencia. */
  readonly PrcRef?: number
  /** EN: Quantity. ES: `QtyItem` — Cantidad del ítem. */
  readonly QtyItem?: number
  /** EN: Unit of measure. ES: `UnmdItem` — Unidad de medida del ítem. */
  readonly UnmdItem?: string
  /** EN: Unit price; a text when it is written with fixed decimals. ES: `PrcItem` — Precio unitario del ítem; un texto cuando se escribe con decimales fijos. */
  readonly PrcItem?: number | string
  /** EN: Discount percent. ES: `DescuentoPct` — Porcentaje de descuento. */
  readonly DescuentoPct?: number
  /** EN: Discount amount. ES: `DescuentoMonto` — Monto del descuento. */
  readonly DescuentoMonto?: number
  /** EN: Surcharge percent. ES: `RecargoPct` — Porcentaje de recargo. */
  readonly RecargoPct?: number
  /** EN: Surcharge amount. ES: `RecargoMonto` — Monto del recargo. */
  readonly RecargoMonto?: number
  /** EN: Additional tax codes. ES: `CodImpAdic` — Códigos de impuesto adicional. */
  readonly CodImpAdic?: readonly number[]
  /** EN: Line amount. ES: `MontoItem` — Monto del ítem. */
  readonly MontoItem: number
}

/** EN: `SubTotInfo`, SII shape. ES: `SubTotInfo` en forma SII. */
export type SiiSubTotInfo = {
  /** EN: Informative subtotal number. ES: `NroSTI` — Número del subtotal informativo. */
  readonly NroSTI: number
  /** EN: Subtotal label. ES: `GlosaSTI` — Glosa del subtotal. */
  readonly GlosaSTI?: string
  /** EN: Display order. ES: `OrdenSTI` — Orden del subtotal. */
  readonly OrdenSTI?: number
  /** EN: Net subtotal. ES: `SubTotNetoSTI` — Subtotal neto. */
  readonly SubTotNetoSTI?: number
  /** EN: VAT subtotal. ES: `SubTotIVASTI` — Subtotal de IVA. */
  readonly SubTotIVASTI?: number
  /** EN: Additional tax subtotal. ES: `SubTotAdicSTI` — Subtotal de impuestos adicionales. */
  readonly SubTotAdicSTI?: number
  /** EN: Exempt subtotal. ES: `SubTotExeSTI` — Subtotal exento. */
  readonly SubTotExeSTI?: number
  /** EN: Subtotal value. ES: `ValSubtotSTI` — Valor del subtotal. */
  readonly ValSubtotSTI: number
  /** EN: Detail lines the subtotal covers. ES: `LineasDeta` — Líneas de detalle que abarca. */
  readonly LineasDeta?: readonly number[]
}

/** EN: `DscRcgGlobal`, SII shape. ES: `DscRcgGlobal` en forma SII. */
export type SiiDscRcgGlobal = {
  /** EN: Line number. ES: `NroLinDR` — Número de línea del descuento o recargo. */
  readonly NroLinDR: number
  /** EN: Movement type: D discount, R surcharge. ES: `TpoMov` — Tipo de movimiento (D descuento, R recargo). */
  readonly TpoMov: 'D' | 'R'
  /** EN: Label. ES: `GlosaDR` — Glosa del descuento o recargo. */
  readonly GlosaDR?: string
  /** EN: Value type: % percent, $ amount. ES: `TpoValor` — Tipo de valor (% porcentaje, $ monto). */
  readonly TpoValor: '%' | '$'
  /** EN: Value. ES: `ValorDR` — Valor del descuento o recargo. */
  readonly ValorDR: number
  /** EN: Exemption indicator: 1 exempt base, 2 non-billable base. ES: `IndExeDR` — Indicador de exención del descuento o recargo. */
  readonly IndExeDR?: number
}

/** EN: `Referencia`, SII shape. ES: `Referencia` en forma SII. */
export type SiiReferencia = {
  /** EN: Line number. ES: `NroLinRef` — Número de línea de referencia. */
  readonly NroLinRef: number
  /** EN: Referenced document type (number, or `SET` in certification). ES: `TpoDocRef` — Tipo de documento de referencia. */
  readonly TpoDocRef: number | string
  /** EN: 1 when the reference covers a set of documents. ES: `IndGlobal` — Indicador global (la referencia abarca un conjunto). */
  readonly IndGlobal?: number
  /** EN: Referenced folio. ES: `FolioRef` — Folio del documento de referencia. */
  readonly FolioRef: string
  /** EN: RUT of the other issuer, when the referenced document is not ours. ES: `RUTOtr` — RUT de otro contribuyente emisor. */
  readonly RUTOtr?: string
  /** EN: Referenced document date. ES: `FchRef` — Fecha de referencia. */
  readonly FchRef: string
  /** EN: Reference code: 1 voids, 2 corrects text, 3 corrects amounts. ES: `CodRef` — Código de referencia. */
  readonly CodRef?: number
  /** EN: Reason. ES: `RazonRef` — Razón de la referencia. */
  readonly RazonRef?: string
}

/** EN: `Referencia` of a receipt (39, 41), SII shape: the receipts schema has no date and a free-text code. ES: `Referencia` de una boleta (39, 41) en forma SII: el esquema de boletas no trae fecha y su código es texto libre. */
export type SiiReferenciaBoleta = {
  /** EN: Line number. ES: `NroLinRef` — Número de línea de referencia. */
  readonly NroLinRef: number
  /** EN: Referenced document type. ES: `TpoDocRef` — Tipo de documento de referencia. */
  readonly TpoDocRef?: string
  /** EN: Referenced folio. ES: `FolioRef` — Folio de referencia. */
  readonly FolioRef?: string
  /** EN: The company's own reference code. ES: `CodRef` — Código interno del tipo de referencia. */
  readonly CodRef?: string
  /** EN: Reason. ES: `RazonRef` — Razón de la referencia. */
  readonly RazonRef?: string
}

/** EN: `Comisiones` line (43), SII shape. ES: Línea de `Comisiones` (43) en forma SII. */
export type SiiComisiones = {
  /** EN: Line number. ES: `NroLinCom` — Número de línea de comisión. */
  readonly NroLinCom: number
  /** EN: Movement type: C commission, O other charges. ES: `TipoMovim` — Tipo de movimiento (C comisión, O otros cargos). */
  readonly TipoMovim: 'C' | 'O'
  /** EN: Label. ES: `Glosa` — Glosa de la comisión. */
  readonly Glosa: string
  /** EN: Commission rate, percent. ES: `TasaComision` — Tasa de comisión. */
  readonly TasaComision?: number
  /** EN: Net value; the schema requires it, zero included. ES: `ValComNeto` — Valor neto de la comisión; el esquema lo exige, también en cero. */
  readonly ValComNeto: number
  /** EN: Exempt value; the schema requires it, zero included. ES: `ValComExe` — Valor exento de la comisión; el esquema lo exige, también en cero. */
  readonly ValComExe: number
  /** EN: VAT. ES: `ValComIVA` — IVA de la comisión. */
  readonly ValComIVA?: number
}

/**
 * EN: The document body with official tags, in the order `Documento`/`Liquidacion` require. `TED` and `TmstFirma` are added when rendering.
 * ES: Cuerpo del documento con etiquetas oficiales, en el orden que exigen `Documento`/`Liquidacion`. `TED` y `TmstFirma` se agregan al renderizar.
 */
export type SiiDocumento = {
  /** EN: Header. ES: `Encabezado` — Encabezado. */
  readonly Encabezado: SiiEncabezado
  /** EN: Detail lines. ES: `Detalle` — Líneas de detalle. */
  readonly Detalle: readonly SiiDetalle[]
  /** EN: Informative subtotals. ES: `SubTotInfo` — Subtotales informativos. */
  readonly SubTotInfo?: readonly SiiSubTotInfo[]
  /** EN: Global discounts and surcharges. ES: `DscRcgGlobal` — Descuentos y recargos globales. */
  readonly DscRcgGlobal?: readonly SiiDscRcgGlobal[]
  /** EN: References to other documents; receipts (39, 41) carry their own shape. ES: `Referencia` — Referencias a otros documentos; las boletas (39, 41) llevan su propia forma. */
  readonly Referencia?: readonly SiiReferencia[] | readonly SiiReferenciaBoleta[]
  /** EN: Commission lines (settlement invoices). ES: `Comisiones` — Líneas de comisiones (liquidación factura). */
  readonly Comisiones?: readonly SiiComisiones[]
}
