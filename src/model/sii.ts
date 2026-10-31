/**
 * EN: Payment installment, SII shape.
 * ES: `MntPagos` — Cuota de pago, forma SII.
 */
export type SiiMntPagos = { readonly FchPago: string; readonly MntPago: number; readonly GlosaPagos?: string }

/**
 * EN: `IdDoc` with the official tags, in schema order.
 * ES: `IdDoc` con las etiquetas oficiales, en el orden del esquema.
 */
export type SiiIdDoc = {
  readonly TipoDTE: number
  readonly Folio: number
  readonly FchEmis: string
  readonly IndNoRebaja?: number
  readonly TipoDespacho?: number
  readonly IndTraslado?: number
  readonly TpoImpresion?: string
  readonly IndServicio?: number
  readonly MntBruto?: number
  readonly TpoTranCompra?: number
  readonly TpoTranVenta?: number
  readonly FmaPago?: number
  readonly FmaPagExp?: string
  readonly FchCancel?: string
  readonly MntCancel?: number
  readonly SaldoInsol?: number
  readonly MntPagos?: readonly SiiMntPagos[]
  readonly PeriodoDesde?: string
  readonly PeriodoHasta?: string
  readonly MedioPago?: string
  readonly TpoCtaPago?: string
  readonly NumCtaPago?: string
  readonly BcoPago?: string
  readonly TermPagoCdg?: string
  readonly TermPagoGlosa?: string
  readonly TermPagoDias?: number
  readonly FchVenc?: string
  readonly IndMntNeto?: number
}

/** EN: `Emisor`, SII shape (receipts use `RznSocEmisor`/`GiroEmisor`). ES: `Emisor` en forma SII (las boletas usan `RznSocEmisor`/`GiroEmisor`). */
export type SiiEmisor = {
  readonly RUTEmisor: string
  readonly RznSoc?: string
  readonly RznSocEmisor?: string
  readonly GiroEmis?: string
  readonly GiroEmisor?: string
  readonly Telefono?: string
  readonly CorreoEmisor?: string
  readonly Acteco?: number
  readonly Sucursal?: string
  readonly CdgSIISucur?: number
  readonly DirOrigen: string
  readonly CmnaOrigen: string
  readonly CiudadOrigen?: string
  readonly CdgVendedor?: string
}

/** EN: `Receptor`, SII shape. ES: `Receptor` en forma SII. */
export type SiiReceptor = {
  readonly RUTRecep: string
  readonly CdgIntRecep?: string
  readonly RznSocRecep: string
  readonly GiroRecep?: string
  readonly Contacto?: string
  readonly CorreoRecep?: string
  readonly DirRecep?: string
  readonly CmnaRecep?: string
  readonly CiudadRecep?: string
  readonly DirPostal?: string
  readonly CmnaPostal?: string
  readonly CiudadPostal?: string
}

/** EN: `Transporte`, SII shape. ES: `Transporte` en forma SII. */
export type SiiTransporte = {
  readonly Patente?: string
  readonly RUTTrans?: string
  readonly Chofer?: { readonly RUTChofer: string; readonly NombreChofer: string }
  readonly DirDest?: string
  readonly CmnaDest?: string
  readonly CiudadDest?: string
}

/** EN: `ImptoReten`, SII shape. ES: `ImptoReten` en forma SII. */
export type SiiImptoReten = { readonly TipoImp: number; readonly TasaImp: number; readonly MontoImp: number }

/** EN: `Totales/Comisiones`, SII shape. ES: `Totales/Comisiones` en forma SII. */
export type SiiComisionesTotales = {
  readonly ValComNeto?: number
  readonly ValComExe?: number
  readonly ValComIVA?: number
}

/** EN: `Totales`, SII shape, schema order. ES: `Totales` en forma SII, orden del esquema. */
export type SiiTotales = {
  readonly MntNeto?: number
  readonly MntExe?: number
  readonly TasaIVA?: number
  readonly IVA?: number
  readonly IVAProp?: number
  readonly IVATerc?: number
  readonly ImptoReten?: readonly SiiImptoReten[]
  readonly Comisiones?: SiiComisionesTotales
  readonly MntTotal: number
  readonly MontoNF?: number
  readonly MontoPeriodo?: number
  readonly SaldoAnterior?: number
  readonly VlrPagar?: number
}

/** EN: `Encabezado`, SII shape. ES: `Encabezado` en forma SII. */
export type SiiEncabezado = {
  readonly IdDoc: SiiIdDoc
  readonly Emisor: SiiEmisor
  readonly Receptor: SiiReceptor
  readonly Transporte?: SiiTransporte
  readonly Totales: SiiTotales
}

/** EN: `CdgItem`, SII shape. ES: `CdgItem` en forma SII. */
export type SiiCdgItem = { readonly TpoCodigo: string; readonly VlrCodigo: string }

/** EN: `Detalle`, SII shape, schema order. ES: `Detalle` en forma SII, orden del esquema. */
export type SiiDetalle = {
  readonly NroLinDet: number
  readonly CdgItem?: readonly SiiCdgItem[]
  readonly TpoDocLiq?: string
  readonly IndExe?: number
  readonly NmbItem: string
  readonly DscItem?: string
  readonly QtyRef?: number
  readonly UnmdRef?: string
  readonly PrcRef?: number
  readonly QtyItem?: number
  readonly UnmdItem?: string
  readonly PrcItem?: number
  readonly DescuentoPct?: number
  readonly DescuentoMonto?: number
  readonly RecargoPct?: number
  readonly RecargoMonto?: number
  readonly CodImpAdic?: readonly number[]
  readonly MontoItem: number
}

/** EN: `SubTotInfo`, SII shape. ES: `SubTotInfo` en forma SII. */
export type SiiSubTotInfo = {
  readonly NroSTI: number
  readonly GlosaSTI?: string
  readonly OrdenSTI?: number
  readonly SubTotNetoSTI?: number
  readonly SubTotIVASTI?: number
  readonly SubTotAdicSTI?: number
  readonly SubTotExeSTI?: number
  readonly ValSubtotSTI: number
  readonly LineasDeta?: readonly number[]
}

/** EN: `DscRcgGlobal`, SII shape. ES: `DscRcgGlobal` en forma SII. */
export type SiiDscRcgGlobal = {
  readonly NroLinDR: number
  readonly TpoMov: 'D' | 'R'
  readonly GlosaDR?: string
  readonly TpoValor: '%' | '$'
  readonly ValorDR: number
  readonly IndExeDR?: number
}

/** EN: `Referencia`, SII shape. ES: `Referencia` en forma SII. */
export type SiiReferencia = {
  readonly NroLinRef: number
  readonly TpoDocRef: number | string
  readonly IndGlobal?: number
  readonly FolioRef: string
  readonly RUTOtr?: string
  readonly FchRef: string
  readonly CodRef?: number
  readonly RazonRef?: string
}

/** EN: `Comisiones` line (43), SII shape. ES: Línea de `Comisiones` (43) en forma SII. */
export type SiiComisiones = {
  readonly NroLinCom: number
  readonly TipoMovim: 'C' | 'O'
  readonly Glosa: string
  readonly TasaComision?: number
  readonly ValComNeto?: number
  readonly ValComExe?: number
  readonly ValComIVA?: number
}

/**
 * EN: The document body with official tags, in the order `Documento`/`Liquidacion` require. `TED` and `TmstFirma` are added when rendering.
 * ES: Cuerpo del documento con etiquetas oficiales, en el orden que exigen `Documento`/`Liquidacion`. `TED` y `TmstFirma` se agregan al renderizar.
 */
export type SiiDocumento = {
  readonly Encabezado: SiiEncabezado
  readonly Detalle: readonly SiiDetalle[]
  readonly SubTotInfo?: readonly SiiSubTotInfo[]
  readonly DscRcgGlobal?: readonly SiiDscRcgGlobal[]
  readonly Referencia?: readonly SiiReferencia[]
  readonly Comisiones?: readonly SiiComisiones[]
}
