/**
 * EN: Converts the domain model of the three books to the SII-shaped model. What each official tag means is documented
 * on `./book`; the keys below follow the XSD order, which is the element order of the XML.
 * ES: Convierte el modelo de dominio de los tres libros al modelo con forma SII. El significado de cada etiqueta oficial
 * está documentado en `./book`; las claves de abajo siguen el orden del XSD, que es el orden de los elementos del XML.
 */
import { BOOK_KINDS, BOOK_OPERATIONS, BOOK_SUBMISSIONS, GUIDE_VOID_CODES } from '../catalogs/book-codes'
import type {
  BookEntry,
  BookOtherTaxTotal,
  BookTotals,
  FolioConsumption,
  FolioConsumptionSummary,
  FolioRange,
  GuideBook,
  GuideEntry,
  GuideTotals,
  PurchaseSalesBook,
} from './book'
import { compact } from './codec'
import type {
  SiiDetalleLibro,
  SiiDetalleLibroGuia,
  SiiDocumentoConsumoFolios,
  SiiEnvioLibro,
  SiiEnvioLibroGuia,
  SiiResumenConsumoFolios,
  SiiResumenLibroGuia,
  SiiTotalesPeriodo,
  SiiTotalesSegmento,
  SiiTotOtrosImp,
} from './sii-book'

// In `TotalesPeriodo` counters are `positiveInteger`, so a 0 fails the schema, and every other optional amount is omitted
// when there is nothing to report.
const nonZero = (value: number | undefined): number | undefined => (value === 0 ? undefined : value)

const flag = (value: boolean | undefined): 1 | undefined => (value ? 1 : undefined)

const taxKindCode = (kind: BookEntry['taxKind']): 1 | 2 | undefined =>
  kind === undefined ? undefined : kind === 'vat' ? 1 : 2

const adjustmentCode = (adjustment: BookEntry['adjustment']): 1 | 2 | undefined =>
  adjustment === undefined ? undefined : adjustment === 'add' ? 1 : 2

const nonEmpty = <T>(items: readonly T[] | undefined): readonly T[] | undefined =>
  items === undefined || items.length === 0 ? undefined : items

const toSiiDetalleLibro = (entry: BookEntry): SiiDetalleLibro =>
  compact({
    TpoDoc: entry.type,
    Emisor: flag(entry.issuedByBookOwner),
    IndFactCompra: flag(entry.purchaseInvoice),
    NroDoc: entry.folio,
    Anulado: entry.voided ? 'A' : undefined,
    Operacion: adjustmentCode(entry.adjustment),
    TpoImp: taxKindCode(entry.taxKind),
    TasaImp: entry.taxRate,
    NumInt: entry.internalNumber,
    IndServicio: entry.serviceIndicator,
    IndSinCosto: flag(entry.freeOfCharge),
    FchDoc: entry.date,
    CdgSIISucur: entry.branchCode,
    RUTDoc: entry.counterpartyRut,
    RznSoc: entry.counterpartyName,
    Extranjero:
      entry.foreignReceiver &&
      compact({ NumId: entry.foreignReceiver.id, Nacionalidad: entry.foreignReceiver.nationality }),
    TpoDocRef: entry.referenceType,
    FolioDocRef: entry.referenceFolio,
    MntExe: entry.exemptAmount,
    MntNeto: entry.netAmount,
    MntIVA: entry.vatAmount,
    MntActivoFijo: entry.fixedAssetNetAmount,
    MntIVAActivoFijo: entry.fixedAssetVatAmount,
    IVANoRec: nonEmpty(entry.nonRecoverableVat)?.map((item) => ({ CodIVANoRec: item.code, MntIVANoRec: item.amount })),
    IVAUsoComun: entry.commonUseVat,
    IVAFueraPlazo: entry.lateVat,
    IVAPropio: entry.ownVatAmount,
    IVATerceros: entry.thirdPartyVatAmount,
    Ley18211: entry.freeZoneTax,
    OtrosImp: nonEmpty(entry.otherTaxes)?.map((item) =>
      compact({ CodImp: item.code, TasaImp: item.rate, MntImp: item.amount }),
    ),
    MntSinCred: entry.nonCreditableTax,
    IVARetTotal: entry.totalVatWithheld,
    IVARetParcial: entry.partialVatWithheld,
    CredEC: entry.constructionCredit,
    DepEnvase: entry.containerDeposit,
    Liquidaciones:
      entry.settlement &&
      compact({
        RutEmisor: entry.settlement.issuerRut,
        ValComNeto: entry.settlement.netValue,
        ValComExe: entry.settlement.exemptValue,
        ValComIVA: entry.settlement.vatValue,
      }),
    MntTotal: entry.totalAmount,
    IVANoRetenido: entry.vatNotWithheld,
    MntNoFact: entry.nonBillableAmount,
    MntPeriodo: entry.periodAmount,
    PsjNac: entry.domesticTickets,
    PsjInt: entry.internationalTickets,
    TabPuros: entry.cigars,
    TabCigarrillos: entry.cigarettes,
    TabElaborado: entry.processedTobacco,
    ImpVehiculo: entry.vehicleTax,
  })

const settlementTotals = (row: BookTotals): SiiTotalesSegmento['TotLiquidaciones'] => {
  const totals = compact({
    TotValComNeto: nonZero(row.settlement?.netValue),
    TotValComExe: nonZero(row.settlement?.exemptValue),
    TotValComIVA: nonZero(row.settlement?.vatValue),
  })
  return Object.keys(totals).length === 0 ? undefined : totals
}

type PeriodContext = Pick<PurchaseSalesBook, 'commonUseVatFactor' | 'additionalTaxFactors'>

const otherTaxTotal =
  (factors: PeriodContext['additionalTaxFactors']) =>
  (item: BookOtherTaxTotal): SiiTotOtrosImp => {
    const factor = factors?.[item.code]
    return compact({
      CodImp: item.code,
      TotMntImp: item.amount,
      FctImpAdic: factor,
      TotCredImp: factor === undefined ? undefined : Math.round(item.amount * factor),
    })
  }

// One function for both summaries, in the order of `TotalesPeriodo`. `TotalesSegmento` is the same sequence without the
// proportionality factor, the credits and the vehicle tax, so `period` is null for it.
const toSiiTotales = (row: BookTotals, period: PeriodContext | null): SiiTotalesPeriodo => {
  const commonUseVat = nonZero(row.commonUseVat)
  const factor = commonUseVat === undefined ? undefined : period?.commonUseVatFactor
  return compact({
    TpoDoc: row.type,
    TpoImp: taxKindCode(row.taxKind),
    TotDoc: row.documentCount,
    TotAnulado: nonZero(row.voidedCount),
    TotMntExe: row.exemptAmount,
    TotMntNeto: row.netAmount,
    TotMntIVA: row.vatAmount,
    TotMntActivoFijo: nonZero(row.fixedAssetNetAmount),
    TotMntIVAActivoFijo: nonZero(row.fixedAssetVatAmount),
    TotIVANoRec: nonEmpty(row.nonRecoverableVat)?.map((item) =>
      compact({ CodIVANoRec: item.code, TotOpIVANoRec: nonZero(item.count), TotMntIVANoRec: item.amount }),
    ),
    TotOpIVAUsoComun: nonZero(row.commonUseVatCount),
    TotIVAUsoComun: commonUseVat,
    FctProp: factor,
    TotCredIVAUsoComun: factor === undefined ? undefined : Math.round((commonUseVat as number) * factor),
    TotIVAFueraPlazo: nonZero(row.lateVat),
    TotIVAPropio: nonZero(row.ownVatAmount),
    TotIVATerceros: nonZero(row.thirdPartyVatAmount),
    TotLey18211: nonZero(row.freeZoneTax),
    TotOtrosImp: nonEmpty(row.otherTaxes)?.map(otherTaxTotal(period?.additionalTaxFactors)),
    TotImpSinCredito: nonZero(row.nonCreditableTax),
    TotIVARetTotal: nonZero(row.totalVatWithheld),
    TotIVARetParcial: nonZero(row.partialVatWithheld),
    TotCredEC: nonZero(row.constructionCredit),
    TotDepEnvase: nonZero(row.containerDeposit),
    TotLiquidaciones: settlementTotals(row),
    TotMntTotal: row.totalAmount,
    TotIVANoRetenido: nonZero(row.vatNotWithheld),
    TotMntNoFact: nonZero(row.nonBillableAmount),
    TotMntPeriodo: nonZero(row.periodAmount),
    TotPsjNac: nonZero(row.domesticTickets),
    TotPsjInt: nonZero(row.internationalTickets),
    TotTabPuros: nonZero(row.cigars),
    TotTabCigarrillos: nonZero(row.cigarettes),
    TotTabElaborado: nonZero(row.processedTobacco),
    TotImpVehiculo: period === null ? undefined : nonZero(row.vehicleTax),
  })
}

/**
 * EN: The `EnvioLibro` of a purchase and sales book with the official tags, in schema order.
 * ES: El `EnvioLibro` de un libro de compras y ventas con las etiquetas oficiales, en el orden del esquema.
 */
export const toSiiPurchaseSalesBook = (book: PurchaseSalesBook): SiiEnvioLibro => {
  const c = book.cover
  return compact({
    Caratula: compact({
      RutEmisorLibro: c.issuerRut,
      RutEnvia: c.senderRut,
      PeriodoTributario: c.period,
      FchResol: c.resolutionDate,
      NroResol: c.resolutionNumber,
      TipoOperacion: BOOK_OPERATIONS[c.operation],
      TipoLibro: BOOK_KINDS[c.kind],
      TipoEnvio: BOOK_SUBMISSIONS[c.submission],
      NroSegmento: c.segmentNumber,
      FolioNotificacion: c.notificationFolio,
      CodAutRec: c.rectificationCode,
    }),
    ResumenSegmento:
      book.segmentTotals === null
        ? undefined
        : { TotalesSegmento: book.segmentTotals.map((row): SiiTotalesSegmento => toSiiTotales(row, null)) },
    ResumenPeriodo:
      book.periodTotals === null
        ? undefined
        : { TotalesPeriodo: book.periodTotals.map((row) => toSiiTotales(row, book)) },
    Detalle: nonEmpty(book.entries)?.map(toSiiDetalleLibro),
    TmstFirma: book.signedAt,
  })
}

const toSiiResumenLibroGuia = (totals: GuideTotals): SiiResumenLibroGuia =>
  compact({
    TotFolAnulado: nonZero(totals.voidedFolios),
    TotGuiaAnulada: nonZero(totals.voidedGuides),
    TotGuiaVenta: totals.saleGuides,
    TotMntGuiaVta: totals.saleGuidesAmount,
    TotMntModificado: nonZero(totals.modifiedAmount),
    TotTraslado: nonEmpty(totals.transfers)?.map((item) => ({
      TpoTraslado: item.type,
      CantGuia: item.count,
      MntGuia: item.amount,
    })),
  })

const toSiiDetalleLibroGuia = (entry: GuideEntry): SiiDetalleLibroGuia =>
  compact({
    Folio: entry.folio,
    Anulado: entry.voided && GUIDE_VOID_CODES[entry.voided],
    Operacion: adjustmentCode(entry.adjustment),
    TpoOper: entry.transferType,
    FchDoc: entry.date,
    RUTDoc: entry.receiverRut,
    RznSoc: entry.receiverName,
    MntNeto: entry.netAmount,
    TasaImp: entry.taxRate,
    IVA: entry.vatAmount,
    MntTotal: entry.totalAmount,
    MntModificado: entry.modifiedAmount,
    TpoDocRef: entry.referenceType,
    FolioDocRef: entry.referenceFolio,
    FchDocRef: entry.referenceDate,
  })

/**
 * EN: The `EnvioLibro` of a guide book with the official tags, in schema order.
 * ES: El `EnvioLibro` de un libro de guías con las etiquetas oficiales, en el orden del esquema.
 */
export const toSiiGuideBook = (book: GuideBook): SiiEnvioLibroGuia => {
  const c = book.cover
  return compact({
    Caratula: compact({
      RutEmisorLibro: c.issuerRut,
      RutEnvia: c.senderRut,
      PeriodoTributario: c.period,
      FchResol: c.resolutionDate,
      NroResol: c.resolutionNumber,
      TipoLibro: 'ESPECIAL' as const,
      TipoEnvio: BOOK_SUBMISSIONS[c.submission],
      NroSegmento: c.segmentNumber,
      FolioNotificacion: c.notificationFolio,
    }),
    ResumenSegmento: book.segmentTotals === null ? undefined : toSiiResumenLibroGuia(book.segmentTotals),
    ResumenPeriodo: book.periodTotals === null ? undefined : toSiiResumenLibroGuia(book.periodTotals),
    Detalle: nonEmpty(book.entries)?.map(toSiiDetalleLibroGuia),
    TmstFirma: book.signedAt,
  })
}

const toSiiRanges = (ranges: readonly FolioRange[]): SiiResumenConsumoFolios['RangoUtilizados'] =>
  nonEmpty(ranges)?.map((range) => ({ Inicial: range.from, Final: range.to }))

const toSiiResumenConsumoFolios = (summary: FolioConsumptionSummary): SiiResumenConsumoFolios =>
  compact({
    TipoDocumento: summary.type,
    MntNeto: nonZero(summary.netAmount),
    MntIva: nonZero(summary.vatAmount),
    TasaIVA: summary.vatRate,
    MntExento: nonZero(summary.exemptAmount),
    MntTotal: summary.totalAmount,
    FoliosEmitidos: summary.issuedCount,
    FoliosAnulados: summary.voidedCount,
    FoliosUtilizados: summary.usedCount,
    RangoUtilizados: toSiiRanges(summary.usedRanges),
    RangoAnulados: toSiiRanges(summary.voidedRanges),
  })

/**
 * EN: The `DocumentoConsumoFolios` of a report with the official tags, in schema order.
 * ES: El `DocumentoConsumoFolios` de un reporte con las etiquetas oficiales, en el orden del esquema.
 */
export const toSiiFolioConsumption = (report: FolioConsumption): SiiDocumentoConsumoFolios => {
  const c = report.cover
  return {
    Caratula: compact({
      RutEmisor: c.issuerRut,
      RutEnvia: c.senderRut,
      FchResol: c.resolutionDate,
      NroResol: c.resolutionNumber,
      FchInicio: c.from,
      FchFinal: c.to,
      Correlativo: c.correlative,
      SecEnvio: c.sequence,
      TmstFirmaEnv: c.signedAt,
    }),
    Resumen: report.summaries.map(toSiiResumenConsumoFolios),
  }
}
