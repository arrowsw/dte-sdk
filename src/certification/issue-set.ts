import { TEST_SET_REFERENCE_TYPE } from '../catalogs/certification'
import { SII_RUT, type DispatchType, type TransferType } from '../catalogs/codes'
import type { DocumentType } from '../catalogs/document-types'
import type { Certificate } from '../certificate/certificate'
import { issueDocument } from '../document/issue'
import type { SignedDocument } from '../document/sign'
import { createEnvelope } from '../envelope/create'
import { signEnvelope, type SignedEnvelope } from '../envelope/sign'
import { DteError } from '../errors'
import type {
  CommissionLineInput,
  DocumentInput,
  IssuerInput,
  LineItemInput,
  ReceiverInput,
  ReferenceInput,
} from '../model/document'
import { sanitizeText } from '../text/sanitize'
import { chileDate } from '../time/chile'
import { calculateLineAmount, type LineAmount } from '../totals/calculate'
import type { FolioSource } from './folios'
import type {
  BasicSetPlan,
  ExemptSetPlan,
  GuideSetPlan,
  PlannedCommission,
  PlannedGuide,
  PlannedItem,
  PlannedNote,
  PlannedSettlementLine,
  PurchaseSetPlan,
  SettlementSetPlan,
} from './set-plan'

/**
 * EN: What issuing a set needs.
 * ES: Lo que necesita emitir un set.
 */
export type IssueSetOptions = {
  /** EN: The issuer, as for phase 1. ES: El emisor, como en la fase 1. */
  readonly issuer: IssuerInput
  /** EN: The customer every document names; purchase invoices and internal transfers name the issuer instead. ES: El cliente que nombra cada documento; las facturas de compra y los traslados internos nombran al emisor. */
  readonly receiver: ReceiverInput
  /** EN: The customers the invoices and the guides of a set name in turn, the first again after the last, as the SII's instructions for the test set ask ("Utilice RUT distintos para las distintas facturas"); a note names the customer of the document it refers to. Without it, or empty, every document names `receiver`. ES: `Receptor` — Los clientes que las facturas y las guías de un set nombran por turno, el primero de nuevo tras el último, como piden las instrucciones del SII para el set de pruebas ("Utilice RUT distintos para las distintas facturas"); una nota nombra al cliente del documento que refiere. Sin ella, o vacía, cada documento nombra a `receiver`. */
  readonly receivers?: readonly ReceiverInput[]
  /** EN: The signing certificate. ES: El certificado de firma. */
  readonly certificate: Certificate
  /** EN: Where folios and their CAFs come from. ES: De dónde salen los folios y sus CAF. */
  readonly folios: FolioSource
  /** EN: The resolution of the certification environment: number 0 and its date. ES: La resolución del ambiente de certificación: número 0 y su fecha. */
  readonly resolution: { readonly number: number; readonly date: string }
  /** EN: Clock, read once per document and once for the envelope. ES: Reloj, leído una vez por documento y una vez para el sobre. */
  readonly now?: () => Date
}

/**
 * EN: One issued document of a set.
 * ES: Un documento emitido de un set.
 */
export type IssuedCase = {
  /** EN: Id of the case, for example `4256-1`. ES: Id del caso, por ejemplo `4256-1`. */
  readonly caseId: string
  /** EN: Document type. ES: `TipoDTE` — Tipo de documento. */
  readonly type: DocumentType
  /** EN: Folio taken for the document. ES: `Folio` — Folio tomado para el documento. */
  readonly folio: number
  /** EN: The issued and signed document. ES: El documento emitido y firmado. */
  readonly document: SignedDocument
}

/**
 * EN: An issued set: its documents in issue order and the signed envelope that carries them.
 * ES: Un set emitido: sus documentos en orden de emisión y el sobre firmado que los lleva.
 */
export type IssuedSet = {
  /** EN: Set kind. ES: Tipo de set. */
  readonly kind: IssuableSetPlan['kind']
  /** EN: `NUMERO DE ATENCION` of the set. ES: `NUMERO DE ATENCION` del set. */
  readonly attentionNumber: string
  /** EN: The issued documents, in issue order. ES: Los documentos emitidos, en orden de emisión. */
  readonly cases: readonly IssuedCase[]
  /** EN: The signed envelope that carries the documents. ES: `EnvioDTE` — El sobre firmado que lleva los documentos. */
  readonly envelope: SignedEnvelope
}

/** EN: The plans `issueTestSet` accepts. ES: Los planes que acepta `issueTestSet`. */
export type IssuableSetPlan = BasicSetPlan | ExemptSetPlan | GuideSetPlan | PurchaseSetPlan | SettlementSetPlan

/** EN: `SetDTE/@ID` of every certification envelope. ES: `SetDTE/@ID` de cada sobre de certificación. */
export const TEST_SET_ENVELOPE_ID = 'DTE_SetDoc'

const GLOBAL_DISCOUNT_DESCRIPTION = 'DESCUENTO GLOBAL ITEMES AFECTOS'

// The test sets are dated on the Chile day of the run ("Agregue fecha del día", the SII's instructions for the set) and
// stamped on the UTC clock: every stamp is the UTC instant with its milliseconds, without a zone.
const utcTimestamp = (at: Date): string => at.toISOString().replace('Z', '')
const NO_AMOUNT_LINE: PlannedItem = { name: 'SIN MONTO', quantity: 1, unitPrice: 0 }
const CORRECTION = 'CORRECCION'
const PURCHASE_TAX_CODE = 15
// The test sets write the price of a priced line with six decimals; guides and the simulation write the plain number.
const SET_PRICE_DECIMALS = 6
const INTERNAL_TRANSFER = 5

/**
 * EN: What one issued document leaves for the notes that reference its case. Internal.
 * ES: Lo que un documento emitido deja para las notas que refieren su caso. Interno.
 */
export type IssuedRecord = {
  /** EN: Document type. ES: `TipoDTE` — Tipo de documento. */
  readonly type: DocumentType
  /** EN: Folio of the document. ES: `Folio` — Folio del documento. */
  readonly folio: number
  /** EN: Issue date. ES: `FchEmis` — Fecha de emisión. */
  readonly date: string
  /** EN: The planned items the document was issued from. ES: Los ítems planificados con que se emitió el documento. */
  readonly items: readonly PlannedItem[]
  /** EN: The customer the document named, when it is not the one of the options. ES: `Receptor` — El cliente que nombró el documento, cuando no es el de las opciones. */
  readonly receiver?: ReceiverInput
}

/**
 * EN: The state of one issuing run: options, clock, the records of issued cases and the documents so far. Internal:
 * `issueTestSet` and `issueSimulation` share it.
 * ES: El estado de una corrida de emisión: opciones, reloj, los registros de casos emitidos y los documentos hasta
 * ahora. Interno: lo comparten `issueTestSet` e `issueSimulation`.
 */
export type IssueContext = {
  /** EN: The options of the run. ES: Las opciones de la corrida. */
  readonly options: IssueSetOptions
  /** EN: The clock of the run, read once per document. ES: El reloj de la corrida, leído una vez por documento. */
  readonly clock: () => Date
  /** EN: The issue date of every document of the run. ES: `FchEmis` — La fecha de emisión de cada documento de la corrida. */
  readonly date: string
  /** EN: How `TSTED` and `TmstFirma` are written from the instant of a document; the Chile time when absent. ES: Cómo se escriben `TSTED` y `TmstFirma` desde el instante de un documento; la hora de Chile si falta. */
  readonly stamp?: (at: Date) => string
  /** EN: The records of issued cases, by case id. ES: Los registros de los casos emitidos, por id de caso. */
  readonly records: Map<string, IssuedRecord>
  /** EN: The documents issued so far. ES: Los documentos emitidos hasta ahora. */
  readonly issued: IssuedCase[]
}

type LineStyle = 'plain' | 'guide' | 'purchase'

const compact = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T

const RECEIVER_ACTIVITY_LENGTH = 40

// The business activity of a receiver is cut at the 40 characters `GiroRecep` holds: an issuer's may be twice as long,
// and the issuer is the receiver of its own purchase documents and transfers.
const withActivityCut = (receiver: ReceiverInput): ReceiverInput =>
  receiver.businessActivity === undefined
    ? receiver
    : {
        ...receiver,
        businessActivity: sanitizeText(receiver.businessActivity, 'GiroRecep').slice(0, RECEIVER_ACTIVITY_LENGTH),
      }

/**
 * EN: The issuer written as the receiver of its own documents (purchase invoices, internal transfers).
 * ES: El emisor escrito como receptor de sus propios documentos (facturas de compra, traslados internos).
 */
export const issuerAsReceiver = (issuer: IssuerInput): ReceiverInput => ({
  rut: issuer.rut,
  businessName: issuer.businessName,
  businessActivity: issuer.businessActivity,
  address: issuer.address,
  commune: issuer.commune,
  city: issuer.city ?? issuer.commune,
})

/**
 * EN: The amounts of a planned line as `createDocument` writes them: a planned quantity of zero is no quantity, so a
 * priced line is worked out with 1. Internal: the runner and the simulation add their lines up with it.
 * ES: Los montos de una línea planificada tal como los escribe `createDocument`: una cantidad planificada de cero es
 * ninguna cantidad, así que una línea con precio se calcula con 1. Interno: el runner y la simulación suman sus líneas
 * con ella.
 */
export const plannedAmount = (item: PlannedItem): LineAmount =>
  calculateLineAmount({ ...item, quantity: item.quantity || 1 })

const line = (item: PlannedItem, style: LineStyle, priceDecimals: number | undefined): LineItemInput => {
  const priced = item.unitPrice > 0
  const unitPriceDecimals = priced ? priceDecimals : undefined
  // `QtyItem` starts above zero: a planned quantity of zero is left out, and `createDocument` writes a priced line and
  // a guide's with 1.
  const quantity = item.quantity || undefined
  if (style === 'purchase')
    return compact({
      name: item.name,
      quantity,
      unit: item.unit ?? 'UN',
      unitPrice: item.unitPrice,
      unitPriceDecimals,
      exempt: item.exempt,
      additionalTaxCodes: item.exempt ? undefined : [PURCHASE_TAX_CODE],
    })
  if (style === 'guide')
    return compact({
      name: item.name,
      quantity,
      unit: item.unit ?? 'UN',
      unitPrice: priced ? item.unitPrice : undefined,
      exempt: item.exempt,
    })
  // A discount whose share of the line rounds to no peso is left out, which changes no amount: `createDocument`
  // refuses a percent it cannot write with its amount, and a return of one unit of a cheap discounted line, at the
  // original's price and discount, comes to that.
  const discounted = priced && plannedAmount(item).discountAmount > 0
  return compact({
    name: item.name,
    quantity: priced ? quantity : undefined,
    unit: priced ? item.unit : undefined,
    unitPrice: priced ? item.unitPrice : undefined,
    unitPriceDecimals,
    discountPercent: discounted ? item.discountPercent : undefined,
    exempt: item.exempt,
  })
}

const setReference = (caseId: string, date: string): ReferenceInput => ({
  documentType: TEST_SET_REFERENCE_TYPE,
  folio: 1,
  date,
  reason: `CASO ${caseId}`,
})

const documentReference = (referenced: IssuedRecord, note: PlannedNote): ReferenceInput => ({
  documentType: referenced.type,
  folio: referenced.folio,
  date: referenced.date,
  code: note.referenceCode,
  reason: note.reasonText,
})

// The customer of the document at `turn` among those of a set that take one in turn; none without `receivers`, which
// leaves the customer of the options.
const receiverInTurn = (options: IssueSetOptions, turn: number): ReceiverInput | undefined =>
  options.receivers === undefined || options.receivers.length === 0
    ? undefined
    : options.receivers[turn % options.receivers.length]

const referencedRecord = (context: IssueContext, note: PlannedNote): IssuedRecord => {
  const record = note.referencedCase === null ? undefined : context.records.get(note.referencedCase)
  if (record === undefined) throw new DteError('MISSING_FIELD', { field: 'referencedCase', caseId: note.caseId })
  return record
}

/**
 * EN: Whether two names are equal compared upper-cased and trimmed. Internal.
 * ES: Si dos nombres son iguales comparados en mayúsculas y sin espacios. Interno.
 */
export const sameName = (a: string, b: string): boolean => a.toUpperCase().trim() === b.toUpperCase().trim()
/**
 * EN: The same items, every one marked exempt. Internal.
 * ES: Los mismos ítems, todos marcados exentos (`IndExe`). Interno.
 */
export const exemptAll = (items: readonly PlannedItem[]): readonly PlannedItem[] =>
  items.map((item) => ({ ...item, exempt: true }))

// The items of an exempt note taken as the case gives them: every one exempt, with the unit `UN` when it has none.
const exemptWithUnit = (items: readonly PlannedItem[]): readonly PlannedItem[] =>
  items.map((item) => ({ ...item, unit: item.unit ?? 'UN', exempt: true }))

/**
 * EN: The items a document's totals add up: none on a credit note that corrects a text (`CodRef` 2), whose every line
 * `createDocument` writes with an amount of zero (Formato DTE 2.5, field 38 of the detail), else every one. Internal.
 * ES: Los ítems que suman los totales de un documento: ninguno en una nota de crédito que corrige un texto (`CodRef`
 * 2), cuyas líneas `createDocument` escribe todas con monto cero (Formato DTE 2.5, campo 38 del detalle), si no todos.
 * Interno.
 */
export const totaledItems = (
  type: DocumentType,
  references: readonly ReferenceInput[],
  items: readonly PlannedItem[],
): readonly PlannedItem[] =>
  type === 61 && references.some(({ documentType, code }) => documentType !== 'SET' && code === 2) ? [] : items

// The totals of a document of the basic or the purchase set whose lines add up to nothing: the total alone, without a
// VAT rate. The exempt set and the guides keep the rate next to a zero total.
const zeroTotals = (items: readonly PlannedItem[]): DocumentInput['totals'] =>
  items.every((item) => plannedAmount(item).amount === 0) ? { totalAmount: 0 } : undefined

const basicCreditItems = (context: IssueContext, note: PlannedNote): readonly PlannedItem[] => {
  const referenced = referencedRecord(context, note)
  const base = note.itemsFromCase === null ? note.items : referenced.items
  const filled =
    note.referenceCode === 3
      ? base.map((item) => {
          if (item.unitPrice > 0) return item
          const original = referenced.items.find((candidate) => candidate.name === item.name)
          return original === undefined
            ? item
            : compact({ ...item, unitPrice: original.unitPrice, discountPercent: original.discountPercent })
        })
      : base
  return filled.length > 0 ? filled : [NO_AMOUNT_LINE]
}

const basicDebitItems = (note: PlannedNote): readonly PlannedItem[] =>
  note.items.length > 0 ? note.items : [NO_AMOUNT_LINE]

const newPriceItems = (note: PlannedNote, referenced: IssuedRecord): readonly PlannedItem[] =>
  note.items.map((item) => {
    const original = referenced.items.find((candidate) => sameName(candidate.name, item.name))
    return original === undefined || !original.quantity
      ? { ...item, exempt: true }
      : {
          name: item.name,
          quantity: original.quantity,
          unitPrice: item.unitPrice,
          unit: item.unit ?? original.unit ?? 'UN',
          exempt: true,
        }
  })

const correctionLine = (note: PlannedNote): PlannedItem => ({
  name: note.reasonText || CORRECTION,
  quantity: 1,
  unitPrice: 0,
  exempt: true,
})

const exemptCreditItems = (context: IssueContext, note: PlannedNote): readonly PlannedItem[] => {
  const referenced = referencedRecord(context, note)
  const upper = note.reasonText.toUpperCase()
  if (note.referenceCode === 2) return [correctionLine(note)]
  if (note.referenceCode === 3) {
    if ((upper.includes('DEVOLUCION') || upper.includes('DEVOLUCIÓN')) && referenced.items.length > 0)
      return exemptAll(referenced.items)
    if (upper.includes('MODIFICA MONTO') && note.items.length > 0 && referenced.items.length > 0)
      return newPriceItems(note, referenced)
    return note.items.length > 0 ? exemptWithUnit(note.items) : exemptAll(referenced.items)
  }
  return exemptAll(referenced.items)
}

const exemptDebitItems = (context: IssueContext, note: PlannedNote): readonly PlannedItem[] => {
  const referenced = referencedRecord(context, note)
  if (note.items.length === 0) return exemptAll(referenced.items)
  if (note.referenceCode === 3 && note.reasonText.toUpperCase().includes('MODIFICA MONTO'))
    return newPriceItems(note, referenced)
  return exemptWithUnit(note.items)
}

const purchaseNoteItems = (note: PlannedNote, referenced: IssuedRecord): readonly PlannedItem[] =>
  note.items.map((item) => {
    const original = referenced.items.find((candidate) => candidate.name === item.name)
    return compact({
      name: item.name,
      quantity: item.quantity || 1,
      unitPrice: item.unitPrice || original?.unitPrice || 0,
      unit: item.unit ?? original?.unit,
    })
  })

const purchaseCreditItems = (context: IssueContext, note: PlannedNote): readonly PlannedItem[] =>
  purchaseNoteItems(note, referencedRecord(context, note))

const purchaseDebitItems = (context: IssueContext, note: PlannedNote): readonly PlannedItem[] => {
  const referenced = referencedRecord(context, note)
  return note.items.length > 0 ? purchaseNoteItems(note, referenced) : referenced.items
}

/**
 * EN: One document to issue inside a run. Internal.
 * ES: Un documento a emitir dentro de una corrida. Interno.
 */
export type IssueDocumentSpec = {
  /** EN: Id of the case. ES: Id del caso. */
  readonly caseId: string
  /** EN: Document type. ES: `TipoDTE` — Tipo de documento. */
  readonly type: DocumentType
  /** EN: The planned items. ES: Los ítems planificados. */
  readonly items: readonly PlannedItem[]
  /** EN: How the lines are written: plain, guide or purchase. ES: Cómo se escriben las líneas: normal, guía o compra. */
  readonly style: LineStyle
  /** EN: Receiver, when it is not the one of the options. ES: `Receptor` — Receptor, cuando no es el de las opciones. */
  readonly receiver?: ReceiverInput
  /** EN: References of the document, SET reference first. ES: `Referencia` — Referencias del documento, la del SET primero. */
  readonly references: readonly ReferenceInput[]
  /** EN: Global discount, percent. ES: `DscRcgGlobal` — Descuento global, en porcentaje. */
  readonly globalDiscountPercent?: number
  /** EN: Write the field's description on the global discount; true by default, false in the simulation. ES: Escribir la glosa del campo en el descuento global; true por defecto, false en la simulación. */
  readonly globalDiscountDescription?: boolean
  /** EN: `IdDoc` options of the document. ES: Opciones de `IdDoc` del documento. */
  readonly options?: DocumentInput['options']
  /** EN: Totals given instead of computed. ES: `Totales` — Totales dados en vez de calculados. */
  readonly totals?: DocumentInput['totals']
  /** EN: Decimals `PrcItem` is written with on a priced line; the plain number when omitted. ES: `PrcItem` — Decimales con que se escribe el precio de una línea con precio; el número tal cual si se omite. */
  readonly priceDecimals?: number
  /** EN: Withhold the VAT (`ImptoReten`). ES: `ImptoReten` — Retener el IVA. */
  readonly withholdVat?: boolean
  /** EN: Lines written as given, in place of lines from `items` (a settlement invoice). ES: `Detalle` — Líneas escritas tal como vienen, en lugar de las que salen de `items` (una liquidación factura). */
  readonly lines?: readonly LineItemInput[]
  /** EN: Commission and other charge lines. ES: `Comisiones` — Líneas de comisiones y otros cargos. */
  readonly commissions?: readonly CommissionLineInput[]
  /** EN: Split the VAT of a settlement invoice in own and third-party. ES: `IVAProp`, `IVATerc` — Separar el IVA de una liquidación factura en propio y de terceros. */
  readonly splitVat?: boolean
  /** EN: Keep a record of the document for the notes that reference it. ES: Guardar un registro del documento para las notas que lo refieren. */
  readonly record: boolean
}

/**
 * EN: Takes a folio, builds the phase 1 input, issues the document and records it when asked. Internal.
 * ES: Toma un folio, arma la entrada de la fase 1, emite el documento y lo registra si se pide. Interno.
 */
export const issueCertificationDocument = async (
  context: IssueContext,
  input: IssueDocumentSpec,
): Promise<IssuedCase> => {
  const { caf, folio } = await context.options.folios.take(input.type)
  const document: DocumentInput = compact({
    type: input.type,
    folio,
    issueDate: context.date,
    issuer: context.options.issuer,
    receiver: withActivityCut(input.receiver ?? context.options.receiver),
    items: input.lines ?? input.items.map((item) => line(item, input.style, input.priceDecimals)),
    references: input.references,
    globalAdjustments:
      input.globalDiscountPercent === undefined
        ? undefined
        : [
            compact({
              kind: 'discount',
              valueType: 'percent',
              value: input.globalDiscountPercent,
              description: input.globalDiscountDescription === false ? undefined : GLOBAL_DISCOUNT_DESCRIPTION,
            }),
          ],
    commissions: input.commissions,
    options: input.options,
    totals: input.totals,
    withholdVat: input.withholdVat,
    splitVat: input.splitVat,
  })
  const at = context.clock()
  const signed = issueDocument({
    document,
    caf,
    certificate: context.options.certificate,
    now: at,
    timestamp: context.stamp?.(at),
  })
  const issued: IssuedCase = { caseId: input.caseId, type: input.type, folio, document: signed }
  context.issued.push(issued)
  if (input.record)
    context.records.set(
      input.caseId,
      compact({ type: input.type, folio, date: context.date, items: input.items, receiver: input.receiver }),
    )
  return issued
}

const issueInvoicesAndNotes = async (
  context: IssueContext,
  plan: BasicSetPlan | ExemptSetPlan | PurchaseSetPlan,
): Promise<void> => {
  const kind = plan.kind
  const style: LineStyle = kind === 'purchase' ? 'purchase' : 'plain'
  const receiver = kind === 'purchase' ? issuerAsReceiver(context.options.issuer) : undefined
  const invoices = kind === 'purchase' ? [plan.invoice] : plan.invoices
  const creditNotes = kind === 'purchase' ? (plan.creditNote === null ? [] : [plan.creditNote]) : plan.creditNotes
  const debitNotes = kind === 'purchase' ? (plan.debitNote === null ? [] : [plan.debitNote]) : plan.debitNotes
  const invoiceType: DocumentType = kind === 'basic' ? 33 : kind === 'exempt' ? 34 : 46
  const bareZero = kind !== 'exempt'
  if (invoices.length === 0) throw new DteError('MISSING_FIELD', { field: 'invoices', kind })

  for (const [turn, invoice] of invoices.entries()) {
    await issueCertificationDocument(context, {
      caseId: invoice.caseId,
      type: invoiceType,
      items: invoice.items,
      style,
      receiver: receiver ?? receiverInTurn(context.options, turn),
      references: [setReference(invoice.caseId, context.date)],
      globalDiscountPercent: invoice.globalDiscountPercent,
      options: kind === 'basic' ? { saleTransactionType: 1 } : undefined,
      totals: bareZero ? zeroTotals(invoice.items) : undefined,
      priceDecimals: SET_PRICE_DECIMALS,
      record: true,
    })
  }
  const creditItems = kind === 'basic' ? basicCreditItems : kind === 'exempt' ? exemptCreditItems : purchaseCreditItems
  for (const note of creditNotes) {
    const items = creditItems(context, note)
    const referenced = referencedRecord(context, note)
    const references = [setReference(note.caseId, context.date), documentReference(referenced, note)]
    await issueCertificationDocument(context, {
      caseId: note.caseId,
      type: 61,
      items,
      style,
      receiver: receiver ?? referenced.receiver,
      references,
      withholdVat: kind === 'purchase' ? true : undefined,
      totals: bareZero ? zeroTotals(totaledItems(61, references, items)) : undefined,
      priceDecimals: SET_PRICE_DECIMALS,
      record: true,
    })
  }
  for (const note of debitNotes) {
    const items =
      kind === 'basic'
        ? basicDebitItems(note)
        : kind === 'exempt'
          ? exemptDebitItems(context, note)
          : purchaseDebitItems(context, note)
    const referenced = referencedRecord(context, note)
    await issueCertificationDocument(context, {
      caseId: note.caseId,
      type: 56,
      items,
      style,
      receiver: receiver ?? referenced.receiver,
      references: [setReference(note.caseId, context.date), documentReference(referenced, note)],
      withholdVat: kind === 'purchase' ? true : undefined,
      totals: bareZero ? zeroTotals(items) : undefined,
      priceDecimals: SET_PRICE_DECIMALS,
      record: false,
    })
  }
}

/**
 * EN: The `IdDoc` options of a guide: its transfer reason and dispatch type. Internal.
 * ES: Las opciones de `IdDoc` de una guía: su tipo de traslado y de despacho. Interno.
 */
export const guideOptions = (guide: PlannedGuide): DocumentInput['options'] =>
  compact({
    transferType: guide.transferReason as TransferType,
    dispatchType: guide.dispatchType as DispatchType | undefined,
  })

/** EN: True for an internal transfer, which names the issuer and totals 0. ES: True para un traslado interno, que nombra al emisor y totaliza 0. Interno. */
export const isInternalTransfer = (guide: PlannedGuide): boolean => guide.transferReason === INTERNAL_TRANSFER

const issueGuides = async (context: IssueContext, plan: GuideSetPlan): Promise<void> => {
  if (plan.guides.length === 0) throw new DteError('MISSING_FIELD', { field: 'guides', kind: plan.kind })
  // An internal transfer names the issuer and takes no turn.
  const turnOf = (index: number): number =>
    plan.guides.slice(0, index).filter((guide) => !isInternalTransfer(guide)).length
  for (const [index, guide] of plan.guides.entries()) {
    const internal = isInternalTransfer(guide)
    await issueCertificationDocument(context, {
      caseId: guide.caseId,
      type: 52,
      items: guide.items,
      style: 'guide',
      receiver: internal ? issuerAsReceiver(context.options.issuer) : receiverInTurn(context.options, turnOf(index)),
      references: [setReference(guide.caseId, context.date)],
      options: guideOptions(guide),
      totals: internal ? { vatRate: 19, totalAmount: 0 } : undefined,
      record: false,
    })
  }
}

const settlementLine = (planned: PlannedSettlementLine): LineItemInput =>
  compact({
    name: planned.name,
    quantity: planned.quantity,
    amount: planned.amount,
    settledDocumentType: planned.settledDocumentType,
    exempt: planned.exempt,
  })

const commissionLine = (planned: PlannedCommission): CommissionLineInput =>
  compact({
    kind: planned.kind,
    description: planned.description,
    netValue: planned.netValue,
    exemptValue: planned.exemptValue,
  })

// A settlement invoice is issued to the run's customer, the principal it settles with: its lines carry their amount as
// the set gives it, with no price, its commissions are taken off its total, and its VAT is split in the own VAT, that
// of the commissions, and the third parties'. No note references it.
const issueSettlements = async (context: IssueContext, plan: SettlementSetPlan): Promise<void> => {
  if (plan.settlements.length === 0) throw new DteError('MISSING_FIELD', { field: 'settlements', kind: plan.kind })
  for (const settlement of plan.settlements) {
    await issueCertificationDocument(context, {
      caseId: settlement.caseId,
      type: 43,
      items: [],
      lines: settlement.lines.map(settlementLine),
      commissions: settlement.commissions.map(commissionLine),
      splitVat: true,
      style: 'plain',
      references: [setReference(settlement.caseId, context.date)],
      record: false,
    })
  }
}

/**
 * EN: Signs the envelope of a set or of the simulation: `EnvioDTE` with the issuer, the certificate holder as sender,
 * the SII as receiver and the certification resolution. Internal: `issueTestSet` and `issueSimulation` share it.
 * ES: Firma el sobre de un set o de la simulación: `EnvioDTE` con el emisor, el titular del certificado como enviador,
 * el SII como receptor y la resolución de certificación. Interno: lo comparten `issueTestSet` e `issueSimulation`.
 */
export const signCertificationEnvelope = (
  documents: readonly SignedDocument[],
  options: IssueSetOptions,
  now: Date,
  setId: string | undefined,
  signedAt?: string,
): SignedEnvelope =>
  signEnvelope(
    createEnvelope({
      kind: 'dte',
      documents,
      cover: compact({
        issuerRut: options.issuer.rut,
        senderRut: options.certificate.rut ?? options.issuer.rut,
        receiverRut: SII_RUT,
        resolutionDate: options.resolution.date,
        resolutionNumber: options.resolution.number,
        setId,
        signedAt,
      }),
      now,
    }),
    options.certificate,
  )

/**
 * EN: Issues every document of a set plan and signs its envelope. Invoices (or guides) go first, then credit notes,
 * then debit notes, each with the SET reference (`SET`, folio 1, the issue date, `CASO <id>`) and, on notes, a second
 * one, to the document of the case they refer to, with the code and reason of the set. Basic invoices carry
 * `TpoTranVenta` 1 and the global discount of the case; purchase documents name the issuer as receiver and carry the
 * withholding; an internal transfer names the issuer and totals 0. A settlement set issues one settlement invoice (43)
 * per case, in the set's order and in one envelope: it names the customer of the options, the principal it settles
 * with, and carries the SET reference, its lines with their quantity, amount, settled document type and exempt mark,
 * and its commissions, whose totals are worked out by phase 1 and taken off the total, with the VAT split in own and
 * third-party (`splitVat`). With `receivers`, the invoices and the guides that do not name the issuer name those
 * customers in turn, and a note names the customer of the document it refers to. The issue date is the Chile day the
 * run starts on, as the SII's instructions ask ("Agregue fecha del día"); `TSTED`, `TmstFirma` and `TmstFirmaEnv` are
 * UTC instants with milliseconds.
 * ES: Emite cada documento del plan de un set y firma su sobre. Primero las facturas (o guías), luego las notas de
 * crédito, luego las de débito, cada una con su referencia SET (`SET`, folio 1, la fecha de emisión, `CASO <id>`) y,
 * en las notas, otra al documento del caso referido con el código y la razón del set. Las facturas del set básico
 * llevan `TpoTranVenta` 1 y el descuento global del caso; los documentos de compra nombran al emisor como receptor y
 * llevan la retención; un traslado interno nombra al emisor y totaliza 0. Un set de liquidación emite una liquidación
 * factura (43) por caso, en el orden del set y en un solo sobre: nombra al cliente de las opciones, el mandante con
 * quien se liquida, y lleva su referencia SET, sus líneas con su cantidad, monto, tipo de documento liquidado y marca de
 * exenta, y sus comisiones, cuyos totales calcula la fase 1 y se restan del total, con el IVA separado en propio y de
 * terceros (`splitVat`). Con `receivers`, las facturas y las guías que no nombran al emisor nombran a esos clientes
 * por turno, y una nota nombra al cliente del documento que refiere. La fecha de emisión es el día de Chile en que
 * parte la corrida, como piden las instrucciones del SII ("Agregue fecha del día"); `TSTED`, `TmstFirma` y
 * `TmstFirmaEnv` son instantes UTC con milisegundos.
 * @param plan EN: a set plan of `planCertificationSets`. ES: un plan de set de `planCertificationSets`.
 * @param options EN: issuer, receiver, certificate, folios, resolution, clock. ES: emisor, receptor, certificado, folios, resolución, reloj.
 * @throws {DteError} EN: `MISSING_FIELD` (`invoices`, `guides` or `settlements` on an empty plan, `referencedCase` on a note whose case was not issued before it), `FOLIO_OUT_OF_RANGE` from the folio source, and the phase 1 codes. ES: `MISSING_FIELD` (`invoices`, `guides` o `settlements` en un plan vacío, `referencedCase` en una nota cuyo caso no se emitió antes), `FOLIO_OUT_OF_RANGE` de la fuente de folios, y los códigos de la fase 1.
 */
export const issueTestSet = async (plan: IssuableSetPlan, options: IssueSetOptions): Promise<IssuedSet> => {
  const clock = options.now ?? (() => new Date())
  const context: IssueContext = {
    options,
    clock,
    date: chileDate(clock()),
    stamp: utcTimestamp,
    records: new Map(),
    issued: [],
  }
  if (plan.kind === 'guide') await issueGuides(context, plan)
  else if (plan.kind === 'settlement') await issueSettlements(context, plan)
  else await issueInvoicesAndNotes(context, plan)
  const sealedAt = clock()
  const envelope = signCertificationEnvelope(
    context.issued.map((issued) => issued.document),
    options,
    sealedAt,
    TEST_SET_ENVELOPE_ID,
    utcTimestamp(sealedAt),
  )
  return { kind: plan.kind, attentionNumber: plan.attentionNumber, cases: context.issued, envelope }
}
