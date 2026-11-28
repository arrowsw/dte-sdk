import {
  customsDocumentsOf,
  dispatchTypeOf,
  referenceCodeOf,
  settledDocumentTypeOf,
  transferReasonOf,
} from './set-text'
import type { CustomsDocument, TestBookDocument, TestCase, TestCaseCommission, TestCaseItem, TestSet } from './set-text'

/**
 * EN: An item of a case, ready to become a phase 1 line.
 * ES: Un ítem de un caso, listo para ser una línea de la fase 1.
 */
export type PlannedItem = {
  /** EN: `NmbItem` item name. ES: `NmbItem` — Nombre del ítem. */
  readonly name: string
  /** EN: `QtyItem` quantity. ES: `QtyItem` — Cantidad. */
  readonly quantity: number
  /** EN: `PrcItem` unit price; 0 when the case gives none. ES: `PrcItem` — Precio unitario; 0 cuando el caso no trae. */
  readonly unitPrice: number
  /** EN: `UnmdItem` unit of measure. ES: `UnmdItem` — Unidad de medida. */
  readonly unit?: string
  /** EN: Line discount, percent. ES: `DescuentoPct` — Descuento de la línea, en porcentaje. */
  readonly discountPercent?: number
  /** EN: Exempt line. ES: `IndExe` — Línea exenta. */
  readonly exempt?: boolean
}

/**
 * EN: An invoice case (33, 34 or 46).
 * ES: Un caso de factura (33, 34 o 46).
 */
export type PlannedInvoice = {
  /** EN: Id of the case, for example `4256-1`. ES: Id del caso, por ejemplo `4256-1`. */
  readonly caseId: string
  /** EN: Items of the case. ES: Ítems del caso. */
  readonly items: readonly PlannedItem[]
  /** EN: `DESCUENTO GLOBAL` of the case, percent. ES: `DESCUENTO GLOBAL` del caso, en porcentaje. */
  readonly globalDiscountPercent?: number
}

/**
 * EN: A credit or debit note case.
 * ES: Un caso de nota de crédito o débito.
 */
export type PlannedNote = {
  /** EN: Id of the case, for example `4256-1`. ES: Id del caso, por ejemplo `4256-1`. */
  readonly caseId: string
  /** EN: The case this note refers to, or null. ES: El caso al que refiere esta nota, o null. */
  readonly referencedCase: string | null
  /** EN: `CodRef` derived from the reason text. ES: `CodRef` derivado del texto de la razón. */
  readonly referenceCode: 1 | 2 | 3
  /** EN: `RAZON REFERENCIA` verbatim. ES: `RAZON REFERENCIA` textual. */
  readonly reasonText: string
  /** EN: Items of the case. ES: Ítems del caso. */
  readonly items: readonly PlannedItem[]
  /** EN: The case whose items the note takes (an `ANULA` note of the basic set), or null. ES: El caso cuyos ítems toma la nota (una nota `ANULA` del set básico), o null. */
  readonly itemsFromCase: string | null
}

/**
 * EN: A dispatch guide case.
 * ES: Un caso de guía de despacho.
 */
export type PlannedGuide = {
  /** EN: Id of the case, for example `4256-1`. ES: Id del caso, por ejemplo `4256-1`. */
  readonly caseId: string
  /** EN: `IndTraslado` from the motive. ES: `IndTraslado` según el motivo. */
  readonly transferReason: number
  /** EN: `TipoDespacho` from `TRASLADO POR`, when it says. ES: `TipoDespacho` según `TRASLADO POR`, cuando lo dice. */
  readonly dispatchType?: 1 | 2
  /** EN: Items of the case. ES: Ítems del caso. */
  readonly items: readonly PlannedItem[]
}

/**
 * EN: A line of a settlement case: what the settlement invoice settles, with the total the set gives it.
 * ES: Una línea de un caso de liquidación: lo que liquida la liquidación factura, con el total que le da el set.
 */
export type PlannedSettlementLine = {
  /** EN: `NmbItem` item name, as the set writes it. ES: `NmbItem` — Nombre del ítem, tal como lo escribe el set. */
  readonly name: string
  /** EN: `QtyItem` quantity, the `CANTIDAD` column. ES: `QtyItem` — Cantidad, la columna `CANTIDAD`. */
  readonly quantity: number
  /** EN: `MontoItem` line amount, the `TOTAL LINEA` column: negative for a credit note or an earlier settlement. ES: `MontoItem` — Monto de la línea, la columna `TOTAL LINEA`: negativo para una nota de crédito o una liquidación anterior. */
  readonly amount: number
  /** EN: `TpoDocLiq` type of the settled document, from the item name. ES: `TpoDocLiq` — Tipo del documento liquidado, según el nombre del ítem. */
  readonly settledDocumentType: string
  /** EN: Exempt line: the name starts with `EXENTO`. ES: `IndExe` — Línea exenta: el nombre empieza con `EXENTO`. */
  readonly exempt?: boolean
}

/**
 * EN: A commission or other charge of a settlement case.
 * ES: Una comisión u otro cargo de un caso de liquidación.
 */
export type PlannedCommission = {
  /** EN: `commission` when the name says `COMISION`, else `otherCharge`. ES: `TipoMovim` — `commission` (C) cuando el nombre dice `COMISION`, si no `otherCharge` (O). */
  readonly kind: 'commission' | 'otherCharge'
  /** EN: `Glosa` description, the row name as the set writes it. ES: `Glosa` — Glosa, el nombre de la fila tal como lo escribe el set. */
  readonly description: string
  /** EN: `ValComNeto` net value: the line total of a row whose name does not start with `EXENTO`. ES: `ValComNeto` — Valor neto: el total de línea de una fila cuyo nombre no empieza con `EXENTO`. */
  readonly netValue?: number
  /** EN: `ValComExe` exempt value: the line total of a row whose name starts with `EXENTO`. ES: `ValComExe` — Valor exento: el total de línea de una fila cuyo nombre empieza con `EXENTO`. */
  readonly exemptValue?: number
}

/**
 * EN: A settlement invoice case (43).
 * ES: Un caso de liquidación factura (43).
 */
export type PlannedSettlement = {
  /** EN: Id of the case, for example `4256-1`. ES: Id del caso, por ejemplo `4256-1`. */
  readonly caseId: string
  /** EN: The lines of the case, in order. ES: `Detalle` — Las líneas del caso, en orden. */
  readonly lines: readonly PlannedSettlementLine[]
  /** EN: The commissions and other charges of the case, in order; often none. ES: `Comisiones` — Las comisiones y otros cargos del caso, en orden; a menudo ninguno. */
  readonly commissions: readonly PlannedCommission[]
}

/**
 * EN: An item of an export case, in the currency of the case, with its decimals.
 * ES: Un ítem de un caso de exportación, en la moneda del caso, con sus decimales.
 */
export type PlannedExportItem = {
  /** EN: `NmbItem` item name, as the set writes it. ES: `NmbItem` — Nombre del ítem, tal como lo escribe el set. */
  readonly name: string
  /** EN: `QtyItem` quantity; 1 on a row that gives a line value and no quantity. ES: `QtyItem` — Cantidad; 1 en una fila que da un valor de línea y no una cantidad. */
  readonly quantity: number
  /** EN: `UnmdItem` unit of measure, as the set writes it. ES: `UnmdItem` — Unidad de medida, tal como la escribe el set. */
  readonly unit?: string
  /** EN: `PrcItem` unit price, or the line value; absent on a note row that names only a quantity, whose price is the one of the document it refers to. ES: `PrcItem` — Precio unitario, o el valor de la línea; ausente en una fila de nota que solo nombra una cantidad, cuyo precio es el del documento que refiere. */
  readonly unitPrice?: number
  /** EN: `DescuentoPct` line discount, percent. ES: `DescuentoPct` — Descuento de la línea, en porcentaje. */
  readonly discountPercent?: number
  /** EN: `RecargoPct` line surcharge, percent: the surcharge the case asks for on the line of the item. ES: `RecargoPct` — Recargo de la línea, en porcentaje: el recargo que el caso pide en la línea del ítem. */
  readonly surchargePercent?: number
}

/**
 * EN: The customs area of an export case, each name as the set writes it in words; issuing turns the names into the
 * codes of the customs tables (Anexo 51).
 * ES: El área aduanera de un caso de exportación, cada nombre tal como el set lo escribe en palabras; al emitir los
 * nombres pasan a ser los códigos de las tablas de Aduanas (Anexo 51).
 */
export type PlannedExportCustoms = {
  /** EN: `MODALIDAD DE VENTA`, for `CodModVenta`. ES: `CodModVenta` — `MODALIDAD DE VENTA`. */
  readonly saleModality?: string
  /** EN: `CLAUSULA DE VENTA`, for `CodClauVenta`. ES: `CodClauVenta` — `CLAUSULA DE VENTA`. */
  readonly saleClause?: string
  /** EN: `TOTAL CLAUSULA DE VENTA`, in the currency of the case. ES: `TotClauVenta` — `TOTAL CLAUSULA DE VENTA`, en la moneda del caso. */
  readonly saleClauseTotal?: number
  /** EN: `VIA DE TRANSPORTE`, for `CodViaTransp`. ES: `CodViaTransp` — `VIA DE TRANSPORTE`. */
  readonly transportRoute?: string
  /** EN: `PUERTO DE EMBARQUE`, for `CodPtoEmbarque`. ES: `CodPtoEmbarque` — `PUERTO DE EMBARQUE`. */
  readonly loadingPort?: string
  /** EN: `PUERTO DE DESEMBARQUE`, for `CodPtoDesemb`. ES: `CodPtoDesemb` — `PUERTO DE DESEMBARQUE`. */
  readonly unloadingPort?: string
  /** EN: The unit of the tare, for `CodUnidMedTara`; the set gives the unit and asks for the value to be worked out. ES: `CodUnidMedTara` — La unidad de la tara; el set da la unidad y pide calcular el valor. */
  readonly tareUnit?: string
  /** EN: The unit of the gross weight, for `CodUnidPesoBruto`. ES: `CodUnidPesoBruto` — La unidad del peso bruto. */
  readonly grossWeightUnit?: string
  /** EN: The unit of the net weight, for `CodUnidPesoNeto`. ES: `CodUnidPesoNeto` — La unidad del peso neto. */
  readonly netWeightUnit?: string
  /** EN: `TIPO DE BULTO`, for `CodTpoBultos`. ES: `CodTpoBultos` — `TIPO DE BULTO`. */
  readonly packageType?: string
  /** EN: `TOTAL BULTOS`. ES: `TotBultos` — `TOTAL BULTOS`. */
  readonly totalPackages?: number
  /** EN: `FLETE`, in the currency of the case. ES: `MntFlete` — `FLETE`, en la moneda del caso. */
  readonly freight?: number
  /** EN: `SEGURO`, in the currency of the case. ES: `MntSeguro` — `SEGURO`, en la moneda del caso. */
  readonly insurance?: number
  /** EN: `PAIS RECEPTOR`, for `CodPaisRecep`; the one of an earlier case of the set when the case names none. ES: `CodPaisRecep` — `PAIS RECEPTOR`; el de un caso anterior del set cuando el caso no nombra ninguno. */
  readonly receiverCountry?: string
  /** EN: The country of destination, for `CodPaisDestin`; the receiver's country when the case names none of its own. ES: `CodPaisDestin` — El país de destino; el del receptor cuando el caso no nombra uno propio. */
  readonly destinationCountry?: string
}

/**
 * EN: A note of an export case: the case it refers to, the code and the reason.
 * ES: Una nota de un caso de exportación: el caso que refiere, el código y la razón.
 */
export type PlannedExportReference = {
  /** EN: The case the note refers to. ES: El caso que refiere la nota. */
  readonly caseId: string
  /** EN: `CodRef` derived from the reason text. ES: `CodRef` — Derivado del texto de la razón. */
  readonly code: 1 | 2 | 3
  /** EN: `RAZON REFERENCIA` verbatim. ES: `RazonRef` — `RAZON REFERENCIA` textual. */
  readonly reason: string
}

/**
 * EN: An export case (110, 111 or 112).
 * ES: Un caso de exportación (110, 111 o 112).
 */
export type PlannedExport = {
  /** EN: Id of the case, for example `4256-1`. ES: Id del caso, por ejemplo `4256-1`. */
  readonly caseId: string
  /** EN: Document type: export invoice 110, debit note 111, credit note 112. ES: `TipoDTE` — Factura de exportación 110, nota de débito 111, nota de crédito 112. */
  readonly type: 110 | 111 | 112
  /** EN: `MONEDA DE LA OPERACION`; absent on a note that names none, which takes the currency of the document it refers to. ES: `TpoMoneda` — `MONEDA DE LA OPERACION`; ausente en una nota que no la nombra, que toma la moneda del documento que refiere. */
  readonly currency?: string
  /** EN: The items of the case. ES: `Detalle` — Los ítems del caso. */
  readonly items: readonly PlannedExportItem[]
  /** EN: `FORMA DE PAGO EXPORTACION`, for `FmaPagExp`. ES: `FmaPagExp` — `FORMA DE PAGO EXPORTACION`. */
  readonly paymentTerms?: string
  /** EN: Service indicator of an export of services: 4 for lodging, 3 for any other invoice whose case names no sale modality, the one thing Formato DTE 2.5 excuses only a service from. ES: `IndServicio` — Indicador de servicio de una exportación de servicios: 4 para alojamiento, 3 para cualquier otra factura cuyo caso no nombra modalidad de venta, lo único de lo que el Formato DTE 2.5 excusa solo a un servicio. */
  readonly serviceIndicator?: 3 | 4
  /** EN: The customs area of the case, in words. ES: `Aduana` — El área aduanera del caso, en palabras. */
  readonly customs: PlannedExportCustoms
  /** EN: `COMISIONES EN EL EXTRANJERO`, a percent of the total of the sale clause, issued as a global surcharge. ES: `COMISIONES EN EL EXTRANJERO`, un porcentaje del total de la cláusula de venta, que se emite como recargo global. */
  readonly foreignCommissionPercent?: number
  /** EN: The customs documents the case names, each a reference line of the document. ES: `Referencia` — Los documentos aduaneros que nombra el caso, cada uno una línea de referencia del documento. */
  readonly customsReferences: readonly CustomsDocument[]
  /** EN: The document a note refers to; absent on an invoice. ES: `Referencia` — El documento que refiere una nota; ausente en una factura. */
  readonly reference?: PlannedExportReference
}

/** EN: Folios each document type needs. ES: Folios que necesita cada tipo de documento. */
export type SetFolios = Readonly<Record<number, number>>

/**
 * EN: The basic set: invoices 33, credit notes 61, debit notes 56.
 * ES: El set básico: facturas 33, notas de crédito 61, notas de débito 56.
 */
export type BasicSetPlan = {
  /** EN: Set kind: `basic`. ES: Tipo de set: `basic`. */
  readonly kind: 'basic'
  /** EN: `NUMERO DE ATENCION` of the set. ES: `NUMERO DE ATENCION` del set. */
  readonly attentionNumber: string
  /** EN: Invoice cases (33). ES: Casos de factura (33). */
  readonly invoices: readonly PlannedInvoice[]
  /** EN: Credit note cases (61). ES: Casos de nota de crédito (61). */
  readonly creditNotes: readonly PlannedNote[]
  /** EN: Debit note cases (56). ES: Casos de nota de débito (56). */
  readonly debitNotes: readonly PlannedNote[]
  /** EN: Folios needed per document type. ES: Folios que se necesitan por tipo de documento. */
  readonly folios: SetFolios
}

/**
 * EN: The exempt set: invoices 34, credit notes 61, debit notes 56; every line exempt.
 * ES: El set exento: facturas 34, notas de crédito 61, notas de débito 56; toda línea exenta.
 */
export type ExemptSetPlan = Omit<BasicSetPlan, 'kind'> & { readonly kind: 'exempt' }

/**
 * EN: The guide set: one 52 per case.
 * ES: El set de guías: una 52 por caso.
 */
export type GuideSetPlan = {
  /** EN: Set kind: `guide`. ES: Tipo de set: `guide`. */
  readonly kind: 'guide'
  /** EN: `NUMERO DE ATENCION` of the set. ES: `NUMERO DE ATENCION` del set. */
  readonly attentionNumber: string
  /** EN: Guide cases (52). ES: Casos de guía de despacho (52). */
  readonly guides: readonly PlannedGuide[]
  /** EN: Folios needed per document type. ES: Folios que se necesitan por tipo de documento. */
  readonly folios: SetFolios
}

/**
 * EN: The purchase set: one 46, at most one 61 and one 56.
 * ES: El set de factura de compra: una 46, a lo más una 61 y una 56.
 */
export type PurchaseSetPlan = {
  /** EN: Set kind: `purchase`. ES: Tipo de set: `purchase`. */
  readonly kind: 'purchase'
  /** EN: `NUMERO DE ATENCION` of the set. ES: `NUMERO DE ATENCION` del set. */
  readonly attentionNumber: string
  /** EN: The purchase invoice case (46). ES: El caso de factura de compra (46). */
  readonly invoice: PlannedInvoice
  /** EN: The credit note case (61), or null. ES: El caso de nota de crédito (61), o null. */
  readonly creditNote: PlannedNote | null
  /** EN: The debit note case (56), or null. ES: El caso de nota de débito (56), o null. */
  readonly debitNote: PlannedNote | null
  /** EN: Folios needed per document type. ES: Folios que se necesitan por tipo de documento. */
  readonly folios: SetFolios
}

/**
 * EN: The settlement set: one settlement invoice (43) per case.
 * ES: El set de liquidación factura: una 43 por caso.
 */
export type SettlementSetPlan = {
  /** EN: Set kind: `settlement`. ES: Tipo de set: `settlement`. */
  readonly kind: 'settlement'
  /** EN: `NUMERO DE ATENCION` of the set. ES: `NUMERO DE ATENCION` del set. */
  readonly attentionNumber: string
  /** EN: Settlement invoice cases (43). ES: Casos de liquidación factura (43). */
  readonly settlements: readonly PlannedSettlement[]
  /** EN: Folios needed per document type. ES: Folios que se necesitan por tipo de documento. */
  readonly folios: SetFolios
}

/**
 * EN: An export set: its cases in the order of the set, each issued as an export invoice (110), debit note (111) or
 * credit note (112), all in one envelope.
 * ES: Un set de exportación: sus casos en el orden del set, cada uno emitido como factura de exportación (110), nota de
 * débito (111) o nota de crédito (112), todos en un sobre.
 */
export type ExportSetPlan = {
  /** EN: Set kind: `export`. ES: Tipo de set: `export`. */
  readonly kind: 'export'
  /** EN: `NUMERO DE ATENCION` of the set. ES: `NUMERO DE ATENCION` del set. */
  readonly attentionNumber: string
  /** EN: The export cases, in the order of the set. ES: Los casos de exportación, en el orden del set. */
  readonly documents: readonly PlannedExport[]
  /** EN: Folios needed per document type. ES: Folios que se necesitan por tipo de documento. */
  readonly folios: SetFolios
}

/**
 * EN: A purchase-book set: the supplier documents and the proportionality factor (0.6 when the set gives none).
 * ES: Un set de libro de compras: los documentos de proveedor y el factor de proporcionalidad (0,6 si el set no lo trae).
 */
export type PurchaseBookPlan = {
  /** EN: Set kind: `purchaseBook` or `exemptPurchaseBook`. ES: Tipo de set: `purchaseBook` o `exemptPurchaseBook`. */
  readonly kind: 'purchaseBook' | 'exemptPurchaseBook'
  /** EN: `NUMERO DE ATENCION` of the set. ES: `NUMERO DE ATENCION` del set. */
  readonly attentionNumber: string
  /** EN: Supplier documents to register. ES: Documentos de proveedor a registrar. */
  readonly documents: readonly TestBookDocument[]
  /** EN: `FctProp` proportionality factor; 0.6 when the set gives none. ES: `FctProp` — Factor de proporcionalidad; 0,6 si el set no lo trae. */
  readonly proportionalityFactor: number
}

/**
 * EN: The lines a case of an issued set left unread (`TestCase.unread`).
 * ES: Las líneas que un caso de un set que se emite dejó sin leer (`TestCase.unread`).
 */
export type UnreadCaseLines = {
  /** EN: The plan of the set the case belongs to. ES: El plan del set al que pertenece el caso. */
  readonly set: 'basic' | 'exempt' | 'guide' | 'purchase' | 'settlement' | 'export1' | 'export2'
  /** EN: Id of the case, for example `4256-1`. ES: Id del caso, por ejemplo `4256-1`. */
  readonly caseId: string
  /** EN: The unread lines, in order and as the set writes them. ES: Las líneas sin leer, en orden y tal como las escribe el set. */
  readonly lines: readonly string[]
}

/**
 * EN: What the certification issues, per set kind; a kind the text lacks is absent. The sales and guide books have no
 * plan: they come from the issued basic and guide sets.
 * ES: Lo que la certificación emite, por tipo de set; un tipo que el texto no trae está ausente. Los libros de ventas
 * y de guías no tienen plan: salen de los sets básico y de guías emitidos.
 */
export type CertificationPlan = {
  /** EN: Plan of the `basic` set, when the text has it. ES: Plan del set `basic`, cuando el texto lo trae. */
  readonly basic?: BasicSetPlan
  /** EN: Plan of the `exempt` set, when the text has it. ES: Plan del set `exempt`, cuando el texto lo trae. */
  readonly exempt?: ExemptSetPlan
  /** EN: Plan of the `guide` set, when the text has it. ES: Plan del set `guide`, cuando el texto lo trae. */
  readonly guide?: GuideSetPlan
  /** EN: Plan of the `purchase` set, when the text has it. ES: Plan del set `purchase`, cuando el texto lo trae. */
  readonly purchase?: PurchaseSetPlan
  /** EN: Plan of the `settlement` set, when the text has it: it is there only when the set was asked for on download. ES: Plan del set `settlement`, cuando el texto lo trae: solo está si el set se pidió al descargar. */
  readonly settlement?: SettlementSetPlan
  /** EN: Plan of the first export set, when the text has it: one whose name says `(1)`, or else the first export set of the text. ES: Plan del primer set de exportación, cuando el texto lo trae: uno cuyo nombre dice `(1)`, o si no el primer set de exportación del texto. */
  readonly export1?: ExportSetPlan
  /** EN: Plan of the second export set, when the text has it: one whose name says `(2)`, or else the next export set of the text. ES: Plan del segundo set de exportación, cuando el texto lo trae: uno cuyo nombre dice `(2)`, o si no el siguiente set de exportación del texto. */
  readonly export2?: ExportSetPlan
  /** EN: Plan of the `purchaseBook` set, when the text has it. ES: Plan del set `purchaseBook`, cuando el texto lo trae. */
  readonly purchaseBook?: PurchaseBookPlan
  /** EN: Plan of the `exemptPurchaseBook` set, when the text has it. ES: Plan del set `exemptPurchaseBook`, cuando el texto lo trae. */
  readonly exemptPurchaseBook?: PurchaseBookPlan
  /** EN: The lines the cases of the sets above left unread, in the order of the sets and of their cases; absent when every line was read. ES: Las líneas que los casos de los sets de arriba dejaron sin leer, en el orden de los sets y de sus casos; ausente cuando se leyó cada línea. */
  readonly unread?: readonly UnreadCaseLines[]
}

const DEFAULT_PROPORTIONALITY_FACTOR = 0.6

const percent = (discount: string | undefined): number | undefined => {
  if (discount === undefined) return undefined
  const value = parseInt(discount, 10)
  return Number.isNaN(value) ? undefined : value
}

const compact = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T

const invoiceItem = (item: TestCaseItem): PlannedItem =>
  compact({
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice ?? 0,
    discountPercent: percent(item.discount),
    // The field reads the word as the text gives it, in capitals: "Servicio exento" is not exempt.
    exempt: item.name.includes('EXENTO') ? true : undefined,
  })

const exemptItem = (item: TestCaseItem, withUnit: boolean): PlannedItem =>
  compact({
    name: item.name,
    quantity: item.quantity || 1,
    unitPrice: item.unitPrice ?? 0,
    unit: withUnit ? (item.unit ?? 'UN') : undefined,
    exempt: true,
  })

const plainItem = (item: TestCaseItem): PlannedItem => ({
  name: item.name,
  quantity: item.quantity,
  unitPrice: item.unitPrice ?? 0,
})

const note = (testCase: TestCase, items: readonly PlannedItem[], itemsFromCase: string | null): PlannedNote => ({
  caseId: testCase.id,
  referencedCase: testCase.referencedCase,
  referenceCode: referenceCodeOf(testCase.reasonText),
  reasonText: testCase.reasonText,
  items,
  itemsFromCase,
})

const reasonLine = (testCase: TestCase): PlannedItem => ({ name: testCase.reasonText, quantity: 1, unitPrice: 0 })

const ofType = (set: TestSet, type: number): readonly TestCase[] =>
  set.cases.filter((item) => item.documentType === type)

const basicPlan = (set: TestSet, kind: 'basic' | 'exempt'): BasicSetPlan | ExemptSetPlan => {
  const exempt = kind === 'exempt'
  const invoiceType = exempt ? 34 : 33
  const invoices = ofType(set, invoiceType).map(
    (testCase): PlannedInvoice =>
      compact({
        caseId: testCase.id,
        items: testCase.items.map((item) => (exempt ? exemptItem(item, true) : invoiceItem(item))),
        globalDiscountPercent: exempt ? undefined : (testCase.globalDiscountPercent ?? undefined),
      }),
  )
  const noteOf = (testCase: TestCase, cancelTakesItems: boolean): PlannedNote => {
    const items = exempt
      ? testCase.items.map((item) => exemptItem(item, false))
      : testCase.items.length > 0
        ? testCase.items.map(plainItem)
        : [reasonLine(testCase)]
    // As in the simulation, a cancellation counts in capitals only: a lower-case "anula" keeps the note's own items.
    const cancels = cancelTakesItems && testCase.reasonText.includes('ANULA')
    return note(testCase, items, cancels ? testCase.referencedCase : null)
  }
  const creditNotes = ofType(set, 61).map((testCase) => noteOf(testCase, !exempt))
  const debitNotes = ofType(set, 56).map((testCase) => noteOf(testCase, false))
  return {
    kind,
    attentionNumber: set.attentionNumber,
    invoices,
    creditNotes,
    debitNotes,
    folios: { [invoiceType]: invoices.length, 61: creditNotes.length, 56: debitNotes.length },
  }
}

const guidePlan = (set: TestSet): GuideSetPlan => {
  // Every case of the guide set is a guide, whatever its text was read as.
  const guides = set.cases.map(
    (testCase): PlannedGuide =>
      compact({
        caseId: testCase.id,
        transferReason: transferReasonOf(testCase.motive),
        dispatchType: dispatchTypeOf(testCase.transferBy) ?? undefined,
        items: testCase.items.map(plainItem),
      }),
  )
  return { kind: 'guide', attentionNumber: set.attentionNumber, guides, folios: { 52: guides.length } }
}

const last = <T>(items: readonly T[]): T | undefined => items[items.length - 1]

const purchasePlan = (set: TestSet): PurchaseSetPlan | undefined => {
  const invoiceCase = last(ofType(set, 46))
  if (invoiceCase === undefined) return undefined
  const creditCase = last(ofType(set, 61))
  const debitCase = last(ofType(set, 56))
  const creditNote = creditCase === undefined ? null : note(creditCase, creditCase.items.map(plainItem), null)
  // The debit note takes the items of the credit note the text gave before it, never its own; none when the text
  // gives no credit note first.
  const creditBefore =
    debitCase === undefined
      ? undefined
      : last(ofType({ ...set, cases: set.cases.slice(0, set.cases.indexOf(debitCase)) }, 61))
  const debitNote = debitCase === undefined ? null : note(debitCase, (creditBefore?.items ?? []).map(plainItem), null)
  return {
    kind: 'purchase',
    attentionNumber: set.attentionNumber,
    invoice: { caseId: invoiceCase.id, items: invoiceCase.items.map(plainItem) },
    creditNote,
    debitNote,
    folios: { 46: 1, 61: creditNote === null ? 0 : 1, 56: debitNote === null ? 0 : 1 },
  }
}

// The set names an exempt line or charge by its first word, `EXENTO`, and a taxed one by `NETO`.
const EXEMPT_ROW = /^EXENTO\b/i
const COMMISSION_ROW = /COMISI[OÓ]N/i

const settlementLine = (item: TestCaseItem): PlannedSettlementLine =>
  compact({
    name: item.name,
    quantity: item.quantity,
    amount: item.lineTotal ?? 0,
    settledDocumentType: settledDocumentTypeOf(item.name),
    exempt: EXEMPT_ROW.test(item.name) ? true : undefined,
  })

const commission = (row: TestCaseCommission): PlannedCommission => ({
  kind: COMMISSION_ROW.test(row.name) ? 'commission' : 'otherCharge',
  description: row.name,
  ...(EXEMPT_ROW.test(row.name) ? { exemptValue: row.lineTotal } : { netValue: row.lineTotal }),
})

const settlementPlan = (set: TestSet): SettlementSetPlan => {
  // Every case of the settlement set is a settlement invoice, whatever its text was read as.
  const settlements = set.cases.map(
    (testCase): PlannedSettlement => ({
      caseId: testCase.id,
      lines: testCase.items.map(settlementLine),
      commissions: (testCase.commissions ?? []).map(commission),
    }),
  )
  return { kind: 'settlement', attentionNumber: set.attentionNumber, settlements, folios: { 43: settlements.length } }
}

// A number as an export set writes it: the first one of the text, its decimals after a point or a comma.
const EXPORT_AMOUNT = /\d+(?:[.,]\d+)?/
const LODGING = /ALOJAMIENTO|HOSPEDAJE|HOTEL/

const exportAmount = (text: string | undefined): number | undefined => {
  const found = text === undefined ? null : EXPORT_AMOUNT.exec(text)
  return found === null ? undefined : Number(found[0].replace(',', '.'))
}

// A line takes its discount from its own row, or from the line of the case that states one for its number.
const exportItem = (
  item: TestCaseItem,
  surchargePercent: number | undefined,
  discount: string | undefined,
): PlannedExportItem =>
  compact({
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice,
    discountPercent: exportAmount(item.discount) ?? exportAmount(discount),
    surchargePercent,
  })

// The document of a lodging invoice that names none: the passport of the guest, 813 among the documents Formato DTE
// 2.5 lets a reference name (812 is the resolution that qualifies a service as an export). Beside the reference of
// the set it is the second line of the case, which field behaviour shows the review asks for.
const LODGING_DOCUMENT: CustomsDocument = { type: 813, name: 'PASAPORTE' }

// An invoice that names no sale modality is a service, since Formato DTE 2.5 excuses only a service from it: 4 when
// it is lodging, 3 otherwise. An invoice that names one sells goods, whatever its items are called.
const serviceIndicatorOf = (testCase: TestCase): 3 | 4 | undefined => {
  if (testCase.documentType !== 110 || testCase.exportFields['MODALIDAD DE VENTA'] !== undefined) return undefined
  const words = plainUpper([testCase.documentText, ...testCase.items.map((item) => item.name)].join(' '))
  return LODGING.test(words) ? 4 : 3
}

const plainUpper = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

const EXPORT_TYPES: readonly number[] = [110, 111, 112]

const exportPlan = (set: TestSet): ExportSetPlan => {
  // A case that names no country takes the one an earlier case of the set named: the set has one foreign customer.
  let country: string | undefined
  const documents = set.cases
    .filter((testCase) => EXPORT_TYPES.includes(testCase.documentType ?? 0))
    .map((testCase): PlannedExport => {
      const fields = testCase.exportFields
      country = fields['PAIS RECEPTOR'] ?? fields.NACIONALIDAD ?? country
      const surcharge = exportAmount(fields['RECARGO EN LA LINEA'])
      const type = testCase.documentType as PlannedExport['type']
      const note = type !== 110 && testCase.referencedCase !== null
      const serviceIndicator = serviceIndicatorOf(testCase)
      const named = [
        ...new Map(
          (testCase.customsReferences ?? []).flatMap(customsDocumentsOf).map((found) => [found.type, found]),
        ).values(),
      ]
      return compact({
        caseId: testCase.id,
        type,
        currency: testCase.currency || undefined,
        items: testCase.items.map((item, index) => exportItem(item, surcharge, fields[`DESCUENTO LINEA ${index + 1}`])),
        paymentTerms: fields['FORMA DE PAGO EXPORTACION'],
        serviceIndicator,
        customs: compact({
          saleModality: fields['MODALIDAD DE VENTA'],
          saleClause: fields['CLAUSULA DE VENTA'],
          saleClauseTotal: exportAmount(fields['TOTAL CLAUSULA DE VENTA']),
          transportRoute: fields['VIA DE TRANSPORTE'],
          loadingPort: fields['PUERTO DE EMBARQUE'],
          unloadingPort: fields['PUERTO DE DESEMBARQUE'],
          tareUnit: fields['UNIDAD DE MEDIDA DE TARA'],
          grossWeightUnit: fields['UNIDAD DE PESO BRUTO'],
          netWeightUnit: fields['UNIDAD DE PESO NETO'],
          packageType: fields['TIPO DE BULTO'],
          totalPackages: exportAmount(fields['TOTAL BULTOS']),
          freight: exportAmount(fields.FLETE),
          insurance: exportAmount(fields.SEGURO),
          receiverCountry: country,
          destinationCountry: fields['PAIS DESTINO'] ?? country,
        }),
        foreignCommissionPercent: exportAmount(fields['COMISIONES EN EL EXTRANJERO']),
        customsReferences: named.length === 0 && serviceIndicator === 4 ? [LODGING_DOCUMENT] : named,
        reference: note
          ? {
              caseId: testCase.referencedCase!,
              code: referenceCodeOf(testCase.reasonText),
              reason: testCase.reasonText,
            }
          : undefined,
      })
    })
  const folios: Record<number, number> = {}
  for (const document of documents) folios[document.type] = (folios[document.type] ?? 0) + 1
  return { kind: 'export', attentionNumber: set.attentionNumber, documents, folios }
}

// The slot of an export set: the number its name gives in parentheses, else the first one still free. The set names
// them `SET BASICO DOCUMENTOS DE EXPORTACION (1)` and `(2)`. A set with a number always
// takes the slot of that number, since its slot is the row it is declared on: of two sets with the same number the
// last one wins, as for every other kind.
const EXPORT_SLOT = /\(\s*([12])\s*\)/
const exportSlot = (
  set: TestSet,
  plan: { readonly export1?: ExportSetPlan; readonly export2?: ExportSetPlan },
): 'export1' | 'export2' | null => {
  const named = EXPORT_SLOT.exec(set.name)?.[1]
  if (named !== undefined) return named === '1' ? 'export1' : 'export2'
  if (plan.export1 === undefined) return 'export1'
  return plan.export2 === undefined ? 'export2' : null
}

const bookPlan = (set: TestSet, kind: PurchaseBookPlan['kind']): PurchaseBookPlan => ({
  kind,
  attentionNumber: set.attentionNumber,
  documents: set.bookDocuments,
  proportionalityFactor: set.proportionalityFactor || DEFAULT_PROPORTIONALITY_FACTOR,
})

/**
 * EN: The cases each set issues, with the folios every document type needs, from the parsed sets. For each kind the
 * last set of the text wins. Each case of the settlement set is a settlement invoice (43): its items become lines with
 * their quantity, their line total as the amount (sign included), the type of the settled document from the item name
 * (`settledDocumentTypeOf`) and the exempt mark when the name starts with `EXENTO`; its commissions and other charges
 * keep their name as the description, take the line total as their exempt value when the name starts with `EXENTO`
 * and as their net value otherwise, and are commissions when the name says `COMISION` and other charges when it does
 * not. Each export set gets a plan of its own, `export1` or `export2` by the number its name gives in parentheses, else
 * the first slot still free (a third export set is left out): one document per case of type 110, 111 or 112, in the
 * set's order, with its currency, its items (decimals, the discount of the row and the surcharge the case asks for on
 * the line), its payment form, its customs area in words, its commission abroad as a percent of the sale clause, the
 * customs documents it names (`customsDocumentsOf`), on a note the case it refers to with the code of its reason, and
 * the service indicator of an export of services (4 for lodging, 3 for an invoice that names no sale modality); a case
 * that names no country takes the one of an earlier case of the set. The sales-book and guide-book instructions and
 * unknown sets are left out: the books come from the issued sets. The lines the cases of an issued set left unread
 * (`TestCase.unread`) go in `unread`, by set and case, for the run to show before it asks for folios.
 * ES: Los casos que emite cada set, con los folios que necesita cada tipo de documento, a partir de los sets parseados.
 * Por cada tipo gana el último set del texto. Cada caso del set de liquidación es una liquidación factura (43): sus
 * ítems pasan a ser líneas con su cantidad, su total de línea como monto (con su signo), el tipo del documento
 * liquidado según el nombre del ítem (`settledDocumentTypeOf`) y la marca de exenta cuando el nombre empieza con
 * `EXENTO`; sus comisiones y otros cargos conservan su nombre como glosa, toman el total de línea como valor exento
 * cuando el nombre empieza con `EXENTO` y como valor neto si no, y son comisiones cuando el nombre dice `COMISION` y
 * otros cargos cuando no. Cada set de exportación tiene su propio plan, `export1` o `export2` según el número que da su
 * nombre entre paréntesis, si no el primer lugar libre (un tercer set de exportación queda fuera): un documento por
 * caso de tipo 110, 111 o 112, en el orden del set, con su moneda, sus ítems (decimales, el descuento de la fila y el
 * recargo que el caso pide en la línea), su forma de pago, su área aduanera en palabras, su comisión en el extranjero
 * como porcentaje de la cláusula de venta, los documentos aduaneros que nombra (`customsDocumentsOf`), en una nota el
 * caso que refiere con el código de su razón, y el indicador de servicio de una exportación de servicios (4 para
 * alojamiento, 3 para una factura que no nombra modalidad de venta); un caso que no nombra país toma el de un caso
 * anterior del set. Las instrucciones de libro de ventas y de guías y los sets desconocidos quedan fuera: los libros
 * salen de los sets emitidos. Las líneas que los casos de un set emitido dejaron sin leer (`TestCase.unread`) van en
 * `unread`, por set y caso, para que la corrida las muestre antes de pedir folios.
 * @param sets EN: the parsed sets. ES: los sets parseados.
 */
export const planCertificationSets = (sets: readonly TestSet[]): CertificationPlan => {
  const plan: {
    -readonly [K in keyof CertificationPlan]: CertificationPlan[K]
  } = {}
  // The set each issued plan was made from, for the lines its cases left unread.
  const planned: Partial<Record<UnreadCaseLines['set'], TestSet>> = {}
  for (const set of sets) {
    if (set.kind === 'basic') {
      plan.basic = basicPlan(set, 'basic') as BasicSetPlan
      planned.basic = set
    } else if (set.kind === 'exempt') {
      plan.exempt = basicPlan(set, 'exempt') as ExemptSetPlan
      planned.exempt = set
    } else if (set.kind === 'guide') {
      plan.guide = guidePlan(set)
      planned.guide = set
    } else if (set.kind === 'purchase') {
      const purchase = purchasePlan(set)
      if (purchase !== undefined) {
        plan.purchase = purchase
        planned.purchase = set
      }
    } else if (set.kind === 'settlement') {
      plan.settlement = settlementPlan(set)
      planned.settlement = set
    } else if (set.kind === 'export') {
      const slot = exportSlot(set, plan)
      if (slot !== null) {
        plan[slot] = exportPlan(set)
        planned[slot] = set
      }
    } else if (set.kind === 'purchaseBook') plan.purchaseBook = bookPlan(set, 'purchaseBook')
    else if (set.kind === 'exemptPurchaseBook') plan.exemptPurchaseBook = bookPlan(set, 'exemptPurchaseBook')
  }
  const unread = UNREAD_ORDER.flatMap((key) =>
    (planned[key]?.cases ?? [])
      .filter((testCase) => testCase.unread.length > 0)
      .map((testCase): UnreadCaseLines => ({ set: key, caseId: testCase.id, lines: testCase.unread })),
  )
  if (unread.length > 0) plan.unread = unread
  return plan
}

const UNREAD_ORDER: readonly UnreadCaseLines['set'][] = [
  'basic',
  'exempt',
  'guide',
  'purchase',
  'settlement',
  'export1',
  'export2',
]
