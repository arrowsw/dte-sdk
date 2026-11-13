/**
 * EN: Converts the English domain model to the SII-shaped model and back. What each official tag means, and what
 * its abbreviation stands for, is documented once on the fields of `./sii`; the keys below follow the XSD order.
 * ES: Convierte el modelo de dominio en inglés al modelo con forma SII y viceversa. El significado de cada etiqueta
 * oficial, y la expansión de su abreviatura, está documentado una sola vez en los campos de `./sii`; las claves de
 * abajo siguen el orden del XSD.
 */
import { isReceipt, type DocumentType } from '../catalogs/document-types'
import type { ExemptIndicator, ReferenceCode } from '../catalogs/codes'
import type {
  CommissionLine,
  Document,
  GlobalAdjustment,
  Header,
  HeaderOptions,
  Issuer,
  LineItem,
  Receiver,
  ReceiptReference,
  Reference,
  SubtotalInfo,
  Totals,
  Transport,
} from './document'
import { toSiiRut } from './rut'
import type {
  SiiComisiones,
  SiiDetalle,
  SiiDocumento,
  SiiDscRcgGlobal,
  SiiEmisor,
  SiiIdDoc,
  SiiReceptor,
  SiiReferencia,
  SiiReferenciaBoleta,
  SiiSubTotInfo,
  SiiTotales,
  SiiTransporte,
} from './sii'

/**
 * EN: Drops undefined values while keeping insertion order, which is the XML element order.
 * ES: Quita los valores undefined conservando el orden de inserción, que es el orden de los elementos del XML.
 */
export const compact = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T

const toSiiIdDoc = (header: Header): SiiIdDoc => {
  const o = header.options
  return compact({
    TipoDTE: header.type,
    Folio: header.folio,
    FchEmis: header.issueDate,
    IndNoRebaja: o.noDebitReduction,
    TipoDespacho: o.dispatchType,
    IndTraslado: o.transferType,
    TpoImpresion: o.printFormat,
    IndServicio: o.serviceIndicator,
    MntBruto: o.grossAmounts,
    TpoTranCompra: o.purchaseTransactionType,
    TpoTranVenta: o.saleTransactionType,
    FmaPago: o.paymentTerms,
    FmaPagExp: o.exportPaymentTerms,
    FchCancel: o.settlementDate,
    MntCancel: o.settledAmount,
    SaldoInsol: o.outstandingBalance,
    MntPagos: o.payments?.map((payment) =>
      compact({ FchPago: payment.date, MntPago: payment.amount, GlosaPagos: payment.note }),
    ),
    PeriodoDesde: o.billingPeriod?.from,
    PeriodoHasta: o.billingPeriod?.to,
    MedioPago: o.paymentMedium,
    TpoCtaPago: o.paymentAccountType,
    NumCtaPago: o.paymentAccountNumber,
    BcoPago: o.paymentBank,
    TermPagoCdg: o.paymentTermsCode,
    TermPagoGlosa: o.paymentTermsNote,
    TermPagoDias: o.paymentTermsDays,
    FchVenc: o.dueDate,
    IndMntNeto: o.netAmountsIndicator,
  })
}

const toSiiEmisor = (issuer: Issuer, receipt: boolean): SiiEmisor =>
  receipt
    ? compact({
        RUTEmisor: issuer.rut,
        RznSocEmisor: issuer.businessName,
        GiroEmisor: issuer.businessActivity,
        Sucursal: issuer.branch,
        CdgSIISucur: issuer.siiBranchCode,
        DirOrigen: issuer.address,
        CmnaOrigen: issuer.commune,
        CiudadOrigen: issuer.city,
      })
    : compact({
        RUTEmisor: issuer.rut,
        RznSoc: issuer.businessName,
        GiroEmis: issuer.businessActivity,
        Telefono: issuer.phone,
        CorreoEmisor: issuer.email,
        Acteco: issuer.activityCode,
        Sucursal: issuer.branch,
        CdgSIISucur: issuer.siiBranchCode,
        DirOrigen: issuer.address,
        CmnaOrigen: issuer.commune,
        CiudadOrigen: issuer.city,
        CdgVendedor: issuer.salespersonCode,
      })

const toSiiReceptor = (receiver: Receiver, receipt: boolean): SiiReceptor =>
  receipt
    ? compact({
        RUTRecep: receiver.rut,
        CdgIntRecep: receiver.internalCode,
        RznSocRecep: receiver.businessName,
        Contacto: receiver.contact,
        DirRecep: receiver.address,
        CmnaRecep: receiver.commune,
        CiudadRecep: receiver.city,
      })
    : compact({
        RUTRecep: receiver.rut,
        CdgIntRecep: receiver.internalCode,
        RznSocRecep: receiver.businessName,
        GiroRecep: receiver.businessActivity,
        Contacto: receiver.contact,
        CorreoRecep: receiver.email,
        DirRecep: receiver.address,
        CmnaRecep: receiver.commune,
        CiudadRecep: receiver.city,
        DirPostal: receiver.postalAddress,
        CmnaPostal: receiver.postalCommune,
        CiudadPostal: receiver.postalCity,
      })

const toSiiTransporte = (transport: Transport | undefined): SiiTransporte | undefined =>
  transport === undefined
    ? undefined
    : compact({
        Patente: transport.licensePlate,
        PatenteCarro: transport.trailerLicensePlate,
        RUTTrans: transport.carrierRut,
        Chofer:
          transport.driver === undefined
            ? undefined
            : { RUTChofer: transport.driver.rut, NombreChofer: transport.driver.name },
        DirDest: transport.destinationAddress,
        CmnaDest: transport.destinationCommune,
        CiudadDest: transport.destinationCity,
        FchSalida: transport.departureDate,
        HraSalida: transport.departureTime,
        FchLlegada: transport.arrivalDate,
      })

const toSiiTotales = (totals: Totals): SiiTotales =>
  compact({
    MntNeto: totals.netAmount,
    MntExe: totals.exemptAmount,
    TasaIVA: totals.vatRate,
    IVA: totals.vatAmount,
    IVAProp: totals.ownVatAmount,
    IVATerc: totals.thirdPartyVatAmount,
    ImptoReten: totals.withholdings?.map((w) => ({ TipoImp: w.taxCode, TasaImp: w.rate, MontoImp: w.amount })),
    Comisiones:
      totals.commissions === undefined
        ? undefined
        : compact({
            ValComNeto: totals.commissions.netValue,
            ValComExe: totals.commissions.exemptValue,
            ValComIVA: totals.commissions.vatValue,
          }),
    MntTotal: totals.totalAmount,
    MontoNF: totals.nonBillableAmount,
    MontoPeriodo: totals.periodAmount,
    SaldoAnterior: totals.previousBalance,
    VlrPagar: totals.amountDue,
  })

const toSiiDetalle = (item: LineItem): SiiDetalle =>
  compact({
    NroLinDet: item.lineNumber,
    CdgItem: item.codes?.map((code) => ({ TpoCodigo: code.type, VlrCodigo: code.value })),
    TpoDocLiq: item.settledDocumentType,
    IndExe: item.exemptIndicator,
    NmbItem: item.name,
    DscItem: item.description,
    QtyRef: item.referenceQuantity,
    UnmdRef: item.referenceUnit,
    PrcRef: item.referencePrice,
    QtyItem: item.quantity,
    UnmdItem: item.unit,
    PrcItem:
      item.unitPrice === undefined || item.unitPriceDecimals === undefined
        ? item.unitPrice
        : item.unitPrice.toFixed(item.unitPriceDecimals),
    DescuentoPct: item.discountPercent,
    DescuentoMonto: item.discountAmount,
    RecargoPct: item.surchargePercent,
    RecargoMonto: item.surchargeAmount,
    CodImpAdic: item.additionalTaxCodes,
    MontoItem: item.amount,
  })

const toSiiSubTotInfo = (subtotal: SubtotalInfo): SiiSubTotInfo =>
  compact({
    NroSTI: subtotal.number,
    GlosaSTI: subtotal.description,
    OrdenSTI: subtotal.order,
    SubTotNetoSTI: subtotal.netAmount,
    SubTotIVASTI: subtotal.vatAmount,
    SubTotAdicSTI: subtotal.additionalTaxAmount,
    SubTotExeSTI: subtotal.exemptAmount,
    ValSubtotSTI: subtotal.totalAmount,
    LineasDeta: subtotal.lines,
  })

const toSiiDscRcgGlobal = (adjustment: GlobalAdjustment): SiiDscRcgGlobal =>
  compact({
    NroLinDR: adjustment.lineNumber,
    TpoMov: adjustment.kind === 'discount' ? 'D' : 'R',
    GlosaDR: adjustment.description,
    TpoValor: adjustment.valueType === 'percent' ? '%' : '$',
    ValorDR: adjustment.value,
    IndExeDR: adjustment.exemptIndicator,
  })

const toSiiReferencia = (reference: Reference): SiiReferencia =>
  compact({
    NroLinRef: reference.lineNumber,
    TpoDocRef: reference.documentType,
    IndGlobal: reference.global ? 1 : undefined,
    FolioRef: reference.folio,
    RUTOtr: reference.otherRut,
    FchRef: reference.date,
    CodRef: reference.code,
    RazonRef: reference.reason,
  })

// A receipt's `Referencia`, in the order of the receipts schema: no date, no global flag, no other issuer.
const toSiiReferenciaBoleta = (reference: ReceiptReference): SiiReferenciaBoleta =>
  compact({
    NroLinRef: reference.lineNumber,
    TpoDocRef: reference.documentType,
    FolioRef: reference.folio,
    CodRef: reference.code,
    RazonRef: reference.reason,
  })

const toSiiComisiones = (line: CommissionLine): SiiComisiones =>
  compact({
    NroLinCom: line.lineNumber,
    TipoMovim: line.kind === 'commission' ? 'C' : 'O',
    Glosa: line.description,
    TasaComision: line.rate,
    ValComNeto: line.netValue,
    ValComExe: line.exemptValue,
    ValComIVA: line.vatValue,
  })

const nonEmpty = <T>(list: readonly T[]): readonly T[] | undefined => (list.length > 0 ? list : undefined)

/**
 * EN: Maps a domain `Document` to the SII-shaped structure (official tags, schema order). This is the only place
 * that knows the tag names; the XML is always rendered from its output.
 * ES: Convierte un `Document` de dominio a la estructura SII (etiquetas oficiales, orden del esquema). Es el único
 * lugar que conoce los nombres de etiqueta; el XML siempre se renderiza desde su salida.
 */
export const toSiiDocument = (doc: Document): SiiDocumento => {
  const receipt = isReceipt(doc.header.type)
  return compact({
    Encabezado: compact({
      IdDoc: toSiiIdDoc(doc.header),
      Emisor: toSiiEmisor(doc.header.issuer, receipt),
      Receptor: toSiiReceptor(doc.header.receiver, receipt),
      Transporte: toSiiTransporte(doc.header.transport),
      Totales: toSiiTotales(doc.header.totals),
    }),
    Detalle: doc.items.map(toSiiDetalle),
    SubTotInfo: nonEmpty(doc.subtotals.map(toSiiSubTotInfo)),
    DscRcgGlobal: nonEmpty(doc.globalAdjustments.map(toSiiDscRcgGlobal)),
    Referencia: receipt
      ? nonEmpty(doc.receiptReferences.map(toSiiReferenciaBoleta))
      : nonEmpty(doc.references.map(toSiiReferencia)),
    Comisiones: nonEmpty(doc.commissions.map(toSiiComisiones)),
  })
}

const fromSiiIdDoc = (idDoc: SiiIdDoc): HeaderOptions =>
  compact({
    noDebitReduction: idDoc.IndNoRebaja as 1 | undefined,
    dispatchType: idDoc.TipoDespacho as HeaderOptions['dispatchType'],
    transferType: idDoc.IndTraslado as HeaderOptions['transferType'],
    printFormat: idDoc.TpoImpresion as HeaderOptions['printFormat'],
    serviceIndicator: idDoc.IndServicio as HeaderOptions['serviceIndicator'],
    grossAmounts: idDoc.MntBruto as 1 | undefined,
    purchaseTransactionType: idDoc.TpoTranCompra,
    saleTransactionType: idDoc.TpoTranVenta,
    paymentTerms: idDoc.FmaPago as HeaderOptions['paymentTerms'],
    exportPaymentTerms: idDoc.FmaPagExp,
    settlementDate: idDoc.FchCancel,
    settledAmount: idDoc.MntCancel,
    outstandingBalance: idDoc.SaldoInsol,
    payments: idDoc.MntPagos?.map((p) => compact({ date: p.FchPago, amount: p.MntPago, note: p.GlosaPagos })),
    billingPeriod:
      idDoc.PeriodoDesde !== undefined && idDoc.PeriodoHasta !== undefined
        ? { from: idDoc.PeriodoDesde, to: idDoc.PeriodoHasta }
        : undefined,
    paymentMedium: idDoc.MedioPago,
    paymentAccountType: idDoc.TpoCtaPago,
    paymentAccountNumber: idDoc.NumCtaPago,
    paymentBank: idDoc.BcoPago,
    paymentTermsCode: idDoc.TermPagoCdg,
    paymentTermsNote: idDoc.TermPagoGlosa,
    paymentTermsDays: idDoc.TermPagoDias,
    dueDate: idDoc.FchVenc,
    netAmountsIndicator: idDoc.IndMntNeto,
  })

const fromSiiEmisor = (emisor: SiiEmisor): Issuer =>
  compact({
    rut: toSiiRut(emisor.RUTEmisor, 'Emisor.RUTEmisor'),
    businessName: emisor.RznSoc ?? emisor.RznSocEmisor ?? '',
    businessActivity: emisor.GiroEmis ?? emisor.GiroEmisor ?? '',
    activityCode: emisor.Acteco,
    phone: emisor.Telefono,
    email: emisor.CorreoEmisor,
    branch: emisor.Sucursal,
    siiBranchCode: emisor.CdgSIISucur,
    address: emisor.DirOrigen,
    commune: emisor.CmnaOrigen,
    city: emisor.CiudadOrigen,
    salespersonCode: emisor.CdgVendedor,
  })

const fromSiiReceptor = (receptor: SiiReceptor): Receiver =>
  compact({
    rut: toSiiRut(receptor.RUTRecep, 'Receptor.RUTRecep'),
    internalCode: receptor.CdgIntRecep,
    businessName: receptor.RznSocRecep,
    businessActivity: receptor.GiroRecep,
    contact: receptor.Contacto,
    email: receptor.CorreoRecep,
    address: receptor.DirRecep,
    commune: receptor.CmnaRecep,
    city: receptor.CiudadRecep,
    postalAddress: receptor.DirPostal,
    postalCommune: receptor.CmnaPostal,
    postalCity: receptor.CiudadPostal,
  })

const fromSiiTransporte = (transporte: SiiTransporte | undefined): Transport | undefined =>
  transporte === undefined
    ? undefined
    : compact({
        licensePlate: transporte.Patente,
        trailerLicensePlate: transporte.PatenteCarro,
        carrierRut:
          transporte.RUTTrans === undefined ? undefined : toSiiRut(transporte.RUTTrans, 'Transporte.RUTTrans'),
        driver:
          transporte.Chofer === undefined
            ? undefined
            : {
                rut: toSiiRut(transporte.Chofer.RUTChofer, 'Transporte.Chofer.RUTChofer'),
                name: transporte.Chofer.NombreChofer,
              },
        destinationAddress: transporte.DirDest,
        destinationCommune: transporte.CmnaDest,
        destinationCity: transporte.CiudadDest,
        departureDate: transporte.FchSalida,
        departureTime: transporte.HraSalida,
        arrivalDate: transporte.FchLlegada,
      })

const fromSiiTotales = (totales: SiiTotales): Totals =>
  compact({
    netAmount: totales.MntNeto,
    exemptAmount: totales.MntExe,
    vatRate: totales.TasaIVA,
    vatAmount: totales.IVA,
    ownVatAmount: totales.IVAProp,
    thirdPartyVatAmount: totales.IVATerc,
    withholdings: totales.ImptoReten?.map((r) => ({ taxCode: r.TipoImp, rate: r.TasaImp, amount: r.MontoImp })),
    commissions:
      totales.Comisiones === undefined
        ? undefined
        : compact({
            netValue: totales.Comisiones.ValComNeto,
            exemptValue: totales.Comisiones.ValComExe,
            vatValue: totales.Comisiones.ValComIVA,
          }),
    totalAmount: totales.MntTotal,
    nonBillableAmount: totales.MontoNF,
    periodAmount: totales.MontoPeriodo,
    previousBalance: totales.SaldoAnterior,
    amountDue: totales.VlrPagar,
  })

const fromSiiDetalle = (detalle: SiiDetalle): LineItem =>
  compact({
    lineNumber: detalle.NroLinDet,
    codes: detalle.CdgItem?.map((code) => ({ type: code.TpoCodigo, value: code.VlrCodigo })),
    settledDocumentType: detalle.TpoDocLiq,
    exemptIndicator: detalle.IndExe as ExemptIndicator | undefined,
    name: detalle.NmbItem,
    description: detalle.DscItem,
    referenceQuantity: detalle.QtyRef,
    referenceUnit: detalle.UnmdRef,
    referencePrice: detalle.PrcRef,
    quantity: detalle.QtyItem,
    unit: detalle.UnmdItem,
    unitPrice: detalle.PrcItem === undefined ? undefined : Number(detalle.PrcItem),
    discountPercent: detalle.DescuentoPct,
    discountAmount: detalle.DescuentoMonto,
    surchargePercent: detalle.RecargoPct,
    surchargeAmount: detalle.RecargoMonto,
    additionalTaxCodes: detalle.CodImpAdic,
    amount: detalle.MontoItem,
  })

const fromSiiSubTotInfo = (subtotal: SiiSubTotInfo): SubtotalInfo =>
  compact({
    number: subtotal.NroSTI,
    description: subtotal.GlosaSTI,
    order: subtotal.OrdenSTI,
    netAmount: subtotal.SubTotNetoSTI,
    vatAmount: subtotal.SubTotIVASTI,
    additionalTaxAmount: subtotal.SubTotAdicSTI,
    exemptAmount: subtotal.SubTotExeSTI,
    totalAmount: subtotal.ValSubtotSTI,
    lines: subtotal.LineasDeta,
  })

const fromSiiDscRcgGlobal = (adjustment: SiiDscRcgGlobal): GlobalAdjustment =>
  compact({
    lineNumber: adjustment.NroLinDR,
    kind: adjustment.TpoMov === 'D' ? ('discount' as const) : ('surcharge' as const),
    valueType: adjustment.TpoValor === '%' ? ('percent' as const) : ('amount' as const),
    value: adjustment.ValorDR,
    description: adjustment.GlosaDR,
    exemptIndicator: adjustment.IndExeDR as 1 | 2 | undefined,
  })

const fromSiiReferencia = (reference: SiiReferencia): Reference =>
  compact({
    lineNumber: reference.NroLinRef,
    documentType: reference.TpoDocRef === 'SET' ? ('SET' as const) : Number(reference.TpoDocRef),
    global: reference.IndGlobal === 1 ? (true as const) : undefined,
    folio: String(reference.FolioRef),
    otherRut: reference.RUTOtr === undefined ? undefined : toSiiRut(reference.RUTOtr, 'Referencia.RUTOtr'),
    date: reference.FchRef,
    code: reference.CodRef as ReferenceCode | undefined,
    reason: reference.RazonRef,
  })

const fromSiiComisiones = (line: SiiComisiones): CommissionLine =>
  compact({
    lineNumber: line.NroLinCom,
    kind: line.TipoMovim === 'C' ? ('commission' as const) : ('otherCharge' as const),
    description: line.Glosa,
    rate: line.TasaComision,
    netValue: line.ValComNeto,
    exemptValue: line.ValComExe,
    vatValue: line.ValComIVA,
  })

const fromSiiReferenciaBoleta = (reference: SiiReferenciaBoleta): ReceiptReference =>
  compact({
    lineNumber: reference.NroLinRef,
    documentType: reference.TpoDocRef === undefined ? undefined : String(reference.TpoDocRef),
    folio: reference.FolioRef === undefined ? undefined : String(reference.FolioRef),
    code: reference.CodRef === undefined ? undefined : String(reference.CodRef),
    reason: reference.RazonRef,
  })

/**
 * EN: Maps a SII-shaped document back to the domain model (for received DTEs and interop). RUTs are validated with
 * rut.ts on the way in.
 * ES: Convierte un documento en forma SII al modelo de dominio (para DTE recibidos e interoperabilidad). Los RUT se
 * validan con rut.ts al entrar.
 * @throws {DteError} EN: `INVALID_RUT` when a RUT in the document is not valid. ES: `INVALID_RUT` si un RUT del documento no es válido.
 */
export const fromSiiDocument = (sii: SiiDocumento): Document => {
  const idDoc = sii.Encabezado.IdDoc
  const type = idDoc.TipoDTE as DocumentType
  const receipt = isReceipt(type)
  const referencia = sii.Referencia ?? []
  return {
    id: `DTE_T${type}F${idDoc.Folio}`,
    header: compact({
      type,
      folio: idDoc.Folio,
      issueDate: idDoc.FchEmis,
      options: fromSiiIdDoc(idDoc),
      issuer: fromSiiEmisor(sii.Encabezado.Emisor),
      receiver: fromSiiReceptor(sii.Encabezado.Receptor),
      transport: fromSiiTransporte(sii.Encabezado.Transporte),
      totals: fromSiiTotales(sii.Encabezado.Totales),
    }),
    items: sii.Detalle.map(fromSiiDetalle),
    subtotals: (sii.SubTotInfo ?? []).map(fromSiiSubTotInfo),
    globalAdjustments: (sii.DscRcgGlobal ?? []).map(fromSiiDscRcgGlobal),
    references: receipt ? [] : (referencia as readonly SiiReferencia[]).map(fromSiiReferencia),
    receiptReferences: receipt ? (referencia as readonly SiiReferenciaBoleta[]).map(fromSiiReferenciaBoleta) : [],
    commissions: (sii.Comisiones ?? []).map(fromSiiComisiones),
  }
}
