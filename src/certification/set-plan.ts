import { dispatchTypeOf, referenceCodeOf, transferReasonOf } from './set-text'
import type { TestBookDocument, TestCase, TestCaseItem, TestSet } from './set-text'

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
  /** EN: Plan of the `purchaseBook` set, when the text has it. ES: Plan del set `purchaseBook`, cuando el texto lo trae. */
  readonly purchaseBook?: PurchaseBookPlan
  /** EN: Plan of the `exemptPurchaseBook` set, when the text has it. ES: Plan del set `exemptPurchaseBook`, cuando el texto lo trae. */
  readonly exemptPurchaseBook?: PurchaseBookPlan
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
    exempt: item.name.toUpperCase().includes('EXENTO') ? true : undefined,
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
    const cancels = cancelTakesItems && testCase.reasonText.toUpperCase().includes('ANULA')
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
  const guides = ofType(set, 52).map(
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
  const debitNote =
    debitCase === undefined
      ? null
      : note(debitCase, debitCase.items.length > 0 ? debitCase.items.map(plainItem) : (creditNote?.items ?? []), null)
  return {
    kind: 'purchase',
    attentionNumber: set.attentionNumber,
    invoice: { caseId: invoiceCase.id, items: invoiceCase.items.map(plainItem) },
    creditNote,
    debitNote,
    folios: { 46: 1, 61: creditNote === null ? 0 : 1, 56: debitNote === null ? 0 : 1 },
  }
}

const bookPlan = (set: TestSet, kind: PurchaseBookPlan['kind']): PurchaseBookPlan => ({
  kind,
  attentionNumber: set.attentionNumber,
  documents: set.bookDocuments,
  proportionalityFactor: set.proportionalityFactor ?? DEFAULT_PROPORTIONALITY_FACTOR,
})

/**
 * EN: The cases each set issues, with the folios every document type needs, from the parsed sets. For each kind the
 * last set of the text wins. Export and settlement sets, the sales-book and guide-book instructions and unknown sets
 * are left out: the first two are never issued, the books come from the issued sets.
 * ES: Los casos que emite cada set, con los folios que necesita cada tipo de documento, a partir de los sets parseados.
 * Por cada tipo gana el último set del texto. Los sets de exportación y liquidación, las instrucciones de libro de
 * ventas y de guías y los sets desconocidos quedan fuera: los dos primeros nunca se emiten, los libros salen de los
 * sets emitidos.
 * @param sets EN: the parsed sets. ES: los sets parseados.
 */
export const planCertificationSets = (sets: readonly TestSet[]): CertificationPlan => {
  const plan: {
    -readonly [K in keyof CertificationPlan]: CertificationPlan[K]
  } = {}
  for (const set of sets) {
    if (set.kind === 'basic') plan.basic = basicPlan(set, 'basic') as BasicSetPlan
    else if (set.kind === 'exempt') plan.exempt = basicPlan(set, 'exempt') as ExemptSetPlan
    else if (set.kind === 'guide') plan.guide = guidePlan(set)
    else if (set.kind === 'purchase') plan.purchase = purchasePlan(set) ?? plan.purchase
    else if (set.kind === 'purchaseBook') plan.purchaseBook = bookPlan(set, 'purchaseBook')
    else if (set.kind === 'exemptPurchaseBook') plan.exemptPurchaseBook = bookPlan(set, 'exemptPurchaseBook')
  }
  return plan
}
