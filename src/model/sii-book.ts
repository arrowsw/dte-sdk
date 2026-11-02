/**
 * EN: The SII-shaped model of the three books: the official tags of `LibroCV_v10.xsd`, `LibroGuia_v10.xsd` and
 * `ConsumoFolio_v10.xsd`, verbatim, in schema order. The English domain model in `./book` documents what each one means;
 * `./book-codec` produces these values.
 * ES: El modelo con forma SII de los tres libros: las etiquetas oficiales de `LibroCV_v10.xsd`, `LibroGuia_v10.xsd` y
 * `ConsumoFolio_v10.xsd`, tal cual y en el orden del esquema. El modelo de dominio en inglés de `./book` documenta qué
 * significa cada una; `./book-codec` produce estos valores.
 */

/**
 * EN: Cover of a purchase and sales book.
 * ES: `Caratula` del libro de compras y ventas.
 */
export type SiiCaratulaLibro = {
  /** EN: Book owner. ES: `RutEmisorLibro` — RUT del dueño del libro. */
  readonly RutEmisorLibro: string
  /** EN: Sender. ES: `RutEnvia` — RUT de quien envía. */
  readonly RutEnvia: string
  /** EN: Tax period. ES: `PeriodoTributario` — Período tributario. */
  readonly PeriodoTributario: string
  /** EN: Resolution date. ES: `FchResol` — Fecha de resolución. */
  readonly FchResol: string
  /** EN: Resolution number. ES: `NroResol` — Número de resolución. */
  readonly NroResol: number
  /** EN: Book side. ES: `TipoOperacion` — COMPRA o VENTA. */
  readonly TipoOperacion: string
  /** EN: Book kind. ES: `TipoLibro` — MENSUAL, ESPECIAL o RECTIFICA. */
  readonly TipoLibro: string
  /** EN: Submission kind. ES: `TipoEnvio` — TOTAL, PARCIAL, FINAL o AJUSTE. */
  readonly TipoEnvio: string
  /** EN: Segment number. ES: `NroSegmento` — Número de segmento. */
  readonly NroSegmento?: number
  /** EN: Notification folio. ES: `FolioNotificacion` — Folio de la notificación. */
  readonly FolioNotificacion?: number
  /** EN: Replacement authorization code. ES: `CodAutRec` — Código de autorización de reemplazo. */
  readonly CodAutRec?: string
}

/**
 * EN: Non-recoverable VAT in a summary row.
 * ES: `TotIVANoRec` — IVA no recuperable en una fila del resumen.
 */
export type SiiTotIVANoRec = {
  /** EN: Reason code. ES: `CodIVANoRec` — Código del motivo. */
  readonly CodIVANoRec: number
  /** EN: Lines. ES: `TotOpIVANoRec` — Líneas con este código. */
  readonly TotOpIVANoRec?: number
  /** EN: Amount. ES: `TotMntIVANoRec` — Monto. */
  readonly TotMntIVANoRec: number
}

/**
 * EN: Additional tax in a summary row. `FctImpAdic` and `TotCredImp` exist only in `TotalesPeriodo`.
 * ES: `TotOtrosImp` — Impuesto adicional en una fila del resumen. `FctImpAdic` y `TotCredImp` existen solo en `TotalesPeriodo`.
 */
export type SiiTotOtrosImp = {
  /** EN: Tax code. ES: `CodImp` — Código del impuesto. */
  readonly CodImp: number
  /** EN: Amount. ES: `TotMntImp` — Monto. */
  readonly TotMntImp: number
  /** EN: Additional tax factor. ES: `FctImpAdic` — Factor de impuesto adicional. */
  readonly FctImpAdic?: number
  /** EN: Tax credit: factor × amount. ES: `TotCredImp` — Crédito: factor × monto. */
  readonly TotCredImp?: number
}

/**
 * EN: Settlement commissions in a summary row.
 * ES: `TotLiquidaciones` — Comisiones de liquidaciones en una fila del resumen.
 */
export type SiiTotLiquidaciones = {
  /** EN: Net commissions. ES: `TotValComNeto` — Valor neto de comisiones. */
  readonly TotValComNeto?: number
  /** EN: Exempt commissions. ES: `TotValComExe` — Valor de comisiones exentas. */
  readonly TotValComExe?: number
  /** EN: VAT on commissions. ES: `TotValComIVA` — IVA de comisiones. */
  readonly TotValComIVA?: number
}

/**
 * EN: Summary row of a segment, in schema order. Values may be negative.
 * ES: `TotalesSegmento` — Fila del resumen de un segmento, en el orden del esquema. Los valores pueden ser negativos.
 */
export type SiiTotalesSegmento = {
  /** EN: Document type. ES: `TpoDoc` — Tipo de documento. */
  readonly TpoDoc: number
  /** EN: Tax kind. ES: `TpoImp` — Tipo de impuesto. */
  readonly TpoImp?: number
  /** EN: Documents. ES: `TotDoc` — Documentos. */
  readonly TotDoc: number
  /** EN: Voided folios. ES: `TotAnulado` — Folios anulados. */
  readonly TotAnulado?: number
  /** EN: Exempt amount. ES: `TotMntExe` — Monto exento. */
  readonly TotMntExe: number
  /** EN: Net amount. ES: `TotMntNeto` — Monto neto. */
  readonly TotMntNeto: number
  /** EN: VAT. ES: `TotMntIVA` — IVA. */
  readonly TotMntIVA: number
  /** EN: Net of fixed assets. ES: `TotMntActivoFijo` — Neto de activo fijo. */
  readonly TotMntActivoFijo?: number
  /** EN: VAT of fixed assets. ES: `TotMntIVAActivoFijo` — IVA de activo fijo. */
  readonly TotMntIVAActivoFijo?: number
  /** EN: Non-recoverable VAT. ES: `TotIVANoRec` — IVA no recuperable. */
  readonly TotIVANoRec?: readonly SiiTotIVANoRec[]
  /** EN: Lines with common-use VAT. ES: `TotOpIVAUsoComun` — Líneas con IVA de uso común. */
  readonly TotOpIVAUsoComun?: number
  /** EN: Common-use VAT. ES: `TotIVAUsoComun` — IVA de uso común. */
  readonly TotIVAUsoComun?: number
  /** EN: Late VAT. ES: `TotIVAFueraPlazo` — IVA fuera de plazo. */
  readonly TotIVAFueraPlazo?: number
  /** EN: Own VAT. ES: `TotIVAPropio` — IVA propio. */
  readonly TotIVAPropio?: number
  /** EN: Third-party VAT. ES: `TotIVATerceros` — IVA de terceros. */
  readonly TotIVATerceros?: number
  /** EN: Free zone tax. ES: `TotLey18211` — Impuesto de zona franca. */
  readonly TotLey18211?: number
  /** EN: Additional taxes. ES: `TotOtrosImp` — Impuestos adicionales. */
  readonly TotOtrosImp?: readonly SiiTotOtrosImp[]
  /** EN: Tax without credit right. ES: `TotImpSinCredito` — Impuesto sin derecho a crédito. */
  readonly TotImpSinCredito?: number
  /** EN: Fully withheld VAT. ES: `TotIVARetTotal` — IVA retenido total. */
  readonly TotIVARetTotal?: number
  /** EN: Partly withheld VAT. ES: `TotIVARetParcial` — IVA retenido parcial. */
  readonly TotIVARetParcial?: number
  /** EN: Construction companies credit. ES: `TotCredEC` — Crédito de empresas constructoras. */
  readonly TotCredEC?: number
  /** EN: Container deposit. ES: `TotDepEnvase` — Garantía por depósito de envases. */
  readonly TotDepEnvase?: number
  /** EN: Settlement commissions. ES: `TotLiquidaciones` — Comisiones de liquidaciones. */
  readonly TotLiquidaciones?: SiiTotLiquidaciones
  /** EN: Total amount. ES: `TotMntTotal` — Monto total. */
  readonly TotMntTotal: number
  /** EN: VAT not withheld. ES: `TotIVANoRetenido` — IVA no retenido. */
  readonly TotIVANoRetenido?: number
  /** EN: Non-billable amount. ES: `TotMntNoFact` — Monto no facturable. */
  readonly TotMntNoFact?: number
  /** EN: Period amount. ES: `TotMntPeriodo` — Monto del período. */
  readonly TotMntPeriodo?: number
  /** EN: Domestic tickets. ES: `TotPsjNac` — Pasajes nacionales. */
  readonly TotPsjNac?: number
  /** EN: International tickets. ES: `TotPsjInt` — Pasajes internacionales. */
  readonly TotPsjInt?: number
  /** EN: Cigars tax. ES: `TotTabPuros` — Impuesto a los cigarros puros. */
  readonly TotTabPuros?: number
  /** EN: Cigarettes tax. ES: `TotTabCigarrillos` — Impuesto a los cigarrillos. */
  readonly TotTabCigarrillos?: number
  /** EN: Processed tobacco tax. ES: `TotTabElaborado` — Impuesto al tabaco elaborado. */
  readonly TotTabElaborado?: number
}

/**
 * EN: Summary row of a period. Adds to the segment row the proportionality factor, the credit and the vehicle tax.
 * ES: `TotalesPeriodo` — Fila del resumen de un período. Agrega a la del segmento el factor de proporcionalidad, el crédito y el impuesto a los vehículos.
 */
export type SiiTotalesPeriodo = SiiTotalesSegmento & {
  /** EN: Proportionality factor. ES: `FctProp` — Factor de proporcionalidad. */
  readonly FctProp?: number
  /** EN: Credit: factor × common-use VAT. ES: `TotCredIVAUsoComun` — Crédito: factor × IVA de uso común. */
  readonly TotCredIVAUsoComun?: number
  /** EN: Vehicle tax. ES: `TotImpVehiculo` — Impuesto a los vehículos. */
  readonly TotImpVehiculo?: number
}

/**
 * EN: One line of the purchase and sales book, in schema order.
 * ES: `Detalle` — Una línea del libro de compras y ventas, en el orden del esquema.
 */
export type SiiDetalleLibro = {
  /** EN: Document type. ES: `TpoDoc` — Tipo de documento. */
  readonly TpoDoc: number
  /** EN: Note issued by the book owner. ES: `Emisor` — Nota emitida por el dueño del libro (1). */
  readonly Emisor?: number
  /** EN: Purchase invoice indicator. ES: `IndFactCompra` — Indicador de factura de compra (1). */
  readonly IndFactCompra?: number
  /** EN: Folio. ES: `NroDoc` — Folio. */
  readonly NroDoc: number
  /** EN: Voided folio. ES: `Anulado` — Folio anulado (A). */
  readonly Anulado?: string
  /** EN: Adjustment operation. ES: `Operacion` — 1 agrega, 2 elimina. */
  readonly Operacion?: number
  /** EN: Tax kind. ES: `TpoImp` — 1 IVA, 2 Ley 18.211. */
  readonly TpoImp?: number
  /** EN: Tax rate. ES: `TasaImp` — Tasa del impuesto. */
  readonly TasaImp?: number
  /** EN: Internal reference. ES: `NumInt` — Referencia interna. */
  readonly NumInt?: string
  /** EN: Periodic service indicator. ES: `IndServicio` — Indicador de servicio periódico. */
  readonly IndServicio?: number
  /** EN: Free delivery. ES: `IndSinCosto` — Entrega gratuita (1). */
  readonly IndSinCosto?: number
  /** EN: Document date. ES: `FchDoc` — Fecha del documento. */
  readonly FchDoc?: string
  /** EN: SII branch code. ES: `CdgSIISucur` — Código SII de la sucursal. */
  readonly CdgSIISucur?: number
  /** EN: Customer or supplier RUT. ES: `RUTDoc` — RUT del cliente o proveedor. */
  readonly RUTDoc?: string
  /** EN: Customer or supplier name. ES: `RznSoc` — Razón social. */
  readonly RznSoc?: string
  /** EN: Foreign receiver. ES: `Extranjero` — Receptor extranjero. */
  readonly Extranjero?: { readonly NumId?: string; readonly Nacionalidad?: string }
  /** EN: Type of the voided document. ES: `TpoDocRef` — Tipo del documento anulado. */
  readonly TpoDocRef?: number
  /** EN: Folio of the voided document. ES: `FolioDocRef` — Folio del documento anulado. */
  readonly FolioDocRef?: number
  /** EN: Exempt amount. ES: `MntExe` — Monto exento. */
  readonly MntExe?: number
  /** EN: Net amount. ES: `MntNeto` — Monto neto. */
  readonly MntNeto?: number
  /** EN: VAT. ES: `MntIVA` — IVA. */
  readonly MntIVA?: number
  /** EN: Net of fixed assets. ES: `MntActivoFijo` — Neto de activo fijo. */
  readonly MntActivoFijo?: number
  /** EN: VAT of fixed assets. ES: `MntIVAActivoFijo` — IVA de activo fijo. */
  readonly MntIVAActivoFijo?: number
  /** EN: Non-recoverable VAT. ES: `IVANoRec` — IVA no recuperable. */
  readonly IVANoRec?: readonly { readonly CodIVANoRec: number; readonly MntIVANoRec: number }[]
  /** EN: Common-use VAT. ES: `IVAUsoComun` — IVA de uso común. */
  readonly IVAUsoComun?: number
  /** EN: Late VAT. ES: `IVAFueraPlazo` — IVA fuera de plazo. */
  readonly IVAFueraPlazo?: number
  /** EN: Own VAT. ES: `IVAPropio` — IVA propio. */
  readonly IVAPropio?: number
  /** EN: Third-party VAT. ES: `IVATerceros` — IVA de terceros. */
  readonly IVATerceros?: number
  /** EN: Free zone tax. ES: `Ley18211` — Impuesto de zona franca. */
  readonly Ley18211?: number
  /** EN: Additional taxes. ES: `OtrosImp` — Impuestos adicionales. */
  readonly OtrosImp?: readonly { readonly CodImp: number; readonly TasaImp?: number; readonly MntImp: number }[]
  /** EN: Tax without credit right. ES: `MntSinCred` — Impuesto sin derecho a crédito. */
  readonly MntSinCred?: number
  /** EN: Fully withheld VAT. ES: `IVARetTotal` — IVA retenido total. */
  readonly IVARetTotal?: number
  /** EN: Partly withheld VAT. ES: `IVARetParcial` — IVA retenido parcial. */
  readonly IVARetParcial?: number
  /** EN: Construction companies credit. ES: `CredEC` — Crédito de empresas constructoras. */
  readonly CredEC?: number
  /** EN: Container deposit. ES: `DepEnvase` — Garantía por depósito de envases. */
  readonly DepEnvase?: number
  /** EN: Settlement commissions. ES: `Liquidaciones` — Comisiones de liquidaciones. */
  readonly Liquidaciones?: {
    readonly RutEmisor: string
    readonly ValComNeto?: number
    readonly ValComExe?: number
    readonly ValComIVA?: number
  }
  /** EN: Line total. ES: `MntTotal` — Total de la línea. */
  readonly MntTotal?: number
  /** EN: VAT not withheld. ES: `IVANoRetenido` — IVA no retenido. */
  readonly IVANoRetenido?: number
  /** EN: Non-billable amount. ES: `MntNoFact` — Monto no facturable. */
  readonly MntNoFact?: number
  /** EN: Period amount. ES: `MntPeriodo` — Monto del período. */
  readonly MntPeriodo?: number
  /** EN: Domestic tickets. ES: `PsjNac` — Pasajes nacionales. */
  readonly PsjNac?: number
  /** EN: International tickets. ES: `PsjInt` — Pasajes internacionales. */
  readonly PsjInt?: number
  /** EN: Cigars tax. ES: `TabPuros` — Impuesto a los cigarros puros. */
  readonly TabPuros?: number
  /** EN: Cigarettes tax. ES: `TabCigarrillos` — Impuesto a los cigarrillos. */
  readonly TabCigarrillos?: number
  /** EN: Processed tobacco tax. ES: `TabElaborado` — Impuesto al tabaco elaborado. */
  readonly TabElaborado?: number
  /** EN: Vehicle tax. ES: `ImpVehiculo` — Impuesto a los vehículos. */
  readonly ImpVehiculo?: number
}

/**
 * EN: The signed part of a purchase and sales book, in schema order.
 * ES: `EnvioLibro` — La parte firmada de un libro de compras y ventas, en el orden del esquema.
 */
export type SiiEnvioLibro = {
  /** EN: Cover. ES: `Caratula` — Carátula. */
  readonly Caratula: SiiCaratulaLibro
  /** EN: Segment summary. ES: `ResumenSegmento` — Resumen del segmento. */
  readonly ResumenSegmento?: { readonly TotalesSegmento: readonly SiiTotalesSegmento[] }
  /** EN: Period summary. ES: `ResumenPeriodo` — Resumen del período. */
  readonly ResumenPeriodo?: { readonly TotalesPeriodo: readonly SiiTotalesPeriodo[] }
  /** EN: Lines. ES: `Detalle` — Líneas. */
  readonly Detalle?: readonly SiiDetalleLibro[]
  /** EN: Signing timestamp. ES: `TmstFirma` — Marca de tiempo de la firma. */
  readonly TmstFirma: string
}

/**
 * EN: Cover of a guide book.
 * ES: `Caratula` del libro de guías.
 */
export type SiiCaratulaLibroGuia = {
  /** EN: Book owner. ES: `RutEmisorLibro` — RUT del dueño del libro. */
  readonly RutEmisorLibro: string
  /** EN: Sender. ES: `RutEnvia` — RUT de quien envía. */
  readonly RutEnvia: string
  /** EN: Tax period. ES: `PeriodoTributario` — Período tributario. */
  readonly PeriodoTributario: string
  /** EN: Resolution date. ES: `FchResol` — Fecha de resolución. */
  readonly FchResol: string
  /** EN: Resolution number. ES: `NroResol` — Número de resolución. */
  readonly NroResol: number
  /** EN: Book kind: the schema admits only ESPECIAL. ES: `TipoLibro` — El esquema solo admite ESPECIAL. */
  readonly TipoLibro: 'ESPECIAL'
  /** EN: Submission kind. ES: `TipoEnvio` — TOTAL, PARCIAL, FINAL o AJUSTE. */
  readonly TipoEnvio: string
  /** EN: Segment number. ES: `NroSegmento` — Número de segmento. */
  readonly NroSegmento?: number
  /** EN: Notification folio. ES: `FolioNotificacion` — Folio de la notificación. */
  readonly FolioNotificacion: number
}

/**
 * EN: Summary of a guide book, in schema order.
 * ES: `ResumenSegmento` / `ResumenPeriodo` — Resumen de un libro de guías, en el orden del esquema.
 */
export type SiiResumenLibroGuia = {
  /** EN: Folios voided before reaching the SII. ES: `TotFolAnulado` — Folios anulados antes de llegar al SII. */
  readonly TotFolAnulado?: number
  /** EN: Guides voided afterwards. ES: `TotGuiaAnulada` — Guías anuladas después. */
  readonly TotGuiaAnulada?: number
  /** EN: Sale guides. ES: `TotGuiaVenta` — Guías de venta. */
  readonly TotGuiaVenta: number
  /** EN: Amount of the sale guides. ES: `TotMntGuiaVta` — Monto de las guías de venta. */
  readonly TotMntGuiaVta: number
  /** EN: Sum of the corrected totals. ES: `TotMntModificado` — Suma de los totales corregidos. */
  readonly TotMntModificado?: number
  /** EN: Non-sale guides. ES: `TotTraslado` — Guías no venta. */
  readonly TotTraslado?: readonly {
    readonly TpoTraslado: number
    readonly CantGuia: number
    readonly MntGuia: number
  }[]
}

/**
 * EN: One line of the guide book, in schema order.
 * ES: `Detalle` — Una línea del libro de guías, en el orden del esquema.
 */
export type SiiDetalleLibroGuia = {
  /** EN: Folio. ES: `Folio` — Folio de la guía. */
  readonly Folio: number
  /** EN: Void reason. ES: `Anulado` — 1 folio anulado, 2 guía anulada, 3 recepción parcial. */
  readonly Anulado?: number
  /** EN: Adjustment operation. ES: `Operacion` — 1 agrega, 2 elimina. */
  readonly Operacion?: number
  /** EN: Guide operation. ES: `TpoOper` — Operación de la guía. */
  readonly TpoOper?: number
  /** EN: Guide date. ES: `FchDoc` — Fecha de la guía. */
  readonly FchDoc?: string
  /** EN: Receiver RUT. ES: `RUTDoc` — RUT del receptor. */
  readonly RUTDoc?: string
  /** EN: Receiver name. ES: `RznSoc` — Razón social del receptor. */
  readonly RznSoc?: string
  /** EN: Net amount. ES: `MntNeto` — Monto neto. */
  readonly MntNeto?: number
  /** EN: VAT rate. ES: `TasaImp` — Tasa de IVA. */
  readonly TasaImp: number
  /** EN: VAT. ES: `IVA` — IVA. */
  readonly IVA: number
  /** EN: Total. ES: `MntTotal` — Total. */
  readonly MntTotal: number
  /** EN: Corrected total. ES: `MntModificado` — Total corregido. */
  readonly MntModificado?: number
  /** EN: Type of the invoice issued. ES: `TpoDocRef` — Tipo de la factura emitida. */
  readonly TpoDocRef?: number
  /** EN: Folio of the invoice issued. ES: `FolioDocRef` — Folio de la factura emitida. */
  readonly FolioDocRef?: number
  /** EN: Date of the invoice issued. ES: `FchDocRef` — Fecha de la factura emitida. */
  readonly FchDocRef?: string
}

/**
 * EN: The signed part of a guide book, in schema order.
 * ES: `EnvioLibro` — La parte firmada de un libro de guías, en el orden del esquema.
 */
export type SiiEnvioLibroGuia = {
  /** EN: Cover. ES: `Caratula` — Carátula. */
  readonly Caratula: SiiCaratulaLibroGuia
  /** EN: Segment summary. ES: `ResumenSegmento` — Resumen del segmento. */
  readonly ResumenSegmento?: SiiResumenLibroGuia
  /** EN: Period summary. ES: `ResumenPeriodo` — Resumen del período. */
  readonly ResumenPeriodo?: SiiResumenLibroGuia
  /** EN: Lines. ES: `Detalle` — Líneas. */
  readonly Detalle?: readonly SiiDetalleLibroGuia[]
  /** EN: Signing timestamp. ES: `TmstFirma` — Marca de tiempo de la firma. */
  readonly TmstFirma: string
}

/**
 * EN: Cover of a folio consumption report. The `version` attribute travels as `@_version` when it is serialized.
 * ES: `Caratula` del reporte de consumo de folios. El atributo `version` viaja como `@_version` al serializar.
 */
export type SiiCaratulaConsumoFolios = {
  /** EN: Issuer company. ES: `RutEmisor` — RUT de la empresa emisora. */
  readonly RutEmisor: string
  /** EN: Sender. ES: `RutEnvia` — RUT de quien envía. */
  readonly RutEnvia: string
  /** EN: Resolution date. ES: `FchResol` — Fecha de resolución. */
  readonly FchResol: string
  /** EN: Resolution number. ES: `NroResol` — Número de resolución. */
  readonly NroResol: number
  /** EN: First day. ES: `FchInicio` — Primer día. */
  readonly FchInicio: string
  /** EN: Last day. ES: `FchFinal` — Último día. */
  readonly FchFinal: string
  /** EN: Correlative within the day. ES: `Correlativo` — Correlativo dentro del día. */
  readonly Correlativo?: number
  /** EN: Submission sequence. ES: `SecEnvio` — Secuencia de envío. */
  readonly SecEnvio: number
  /** EN: Signing timestamp. ES: `TmstFirmaEnv` — Marca de tiempo de la firma. */
  readonly TmstFirmaEnv: string
}

/**
 * EN: Summary of one document type of the report, in schema order.
 * ES: `Resumen` — Resumen de un tipo de documento del reporte, en el orden del esquema.
 */
export type SiiResumenConsumoFolios = {
  /** EN: Document type. ES: `TipoDocumento` — Tipo de documento. */
  readonly TipoDocumento: number
  /** EN: Net amount. ES: `MntNeto` — Monto neto. */
  readonly MntNeto?: number
  /** EN: VAT. ES: `MntIva` — IVA. */
  readonly MntIva?: number
  /** EN: VAT rate. ES: `TasaIVA` — Tasa de IVA. */
  readonly TasaIVA?: number
  /** EN: Exempt amount. ES: `MntExento` — Monto exento. */
  readonly MntExento?: number
  /** EN: Total. ES: `MntTotal` — Total. */
  readonly MntTotal: number
  /** EN: Documents issued. ES: `FoliosEmitidos` — Documentos emitidos. */
  readonly FoliosEmitidos: number
  /** EN: Folios voided. ES: `FoliosAnulados` — Folios anulados. */
  readonly FoliosAnulados: number
  /** EN: Issued plus voided. ES: `FoliosUtilizados` — Emitidos más anulados. */
  readonly FoliosUtilizados: number
  /** EN: Ranges of issued folios. ES: `RangoUtilizados` — Rangos de folios emitidos. */
  readonly RangoUtilizados?: readonly { readonly Inicial: number; readonly Final: number }[]
  /** EN: Ranges of voided folios. ES: `RangoAnulados` — Rangos de folios anulados. */
  readonly RangoAnulados?: readonly { readonly Inicial: number; readonly Final: number }[]
}

/**
 * EN: The signed part of a folio consumption report, in schema order.
 * ES: `DocumentoConsumoFolios` — La parte firmada de un reporte de consumo de folios, en el orden del esquema.
 */
export type SiiDocumentoConsumoFolios = {
  /** EN: Cover. ES: `Caratula` — Carátula. */
  readonly Caratula: SiiCaratulaConsumoFolios
  /** EN: One summary per document type. ES: `Resumen` — Un resumen por tipo de documento. */
  readonly Resumen: readonly SiiResumenConsumoFolios[]
}
