import { TEST_SET_REFERENCE_TYPE } from '../catalogs/certification'
import { SII_RUT, type DispatchType, type TransferType } from '../catalogs/codes'
import type { DocumentType } from '../catalogs/document-types'
import type { Certificate } from '../certificate/certificate'
import { issueDocument } from '../document/issue'
import type { SignedDocument } from '../document/sign'
import { createEnvelope } from '../envelope/create'
import { signEnvelope, type SignedEnvelope } from '../envelope/sign'
import { DteError } from '../errors'
import type { DocumentInput, IssuerInput, LineItemInput, ReceiverInput, ReferenceInput } from '../model/document'
import { sanitizeText } from '../text/sanitize'
import { calculateLineAmount } from '../totals/calculate'
import type { FolioSource } from './folios'
import type {
  BasicSetPlan,
  ExemptSetPlan,
  GuideSetPlan,
  PlannedGuide,
  PlannedItem,
  PlannedNote,
  PurchaseSetPlan,
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
  readonly kind: 'basic' | 'exempt' | 'guide' | 'purchase'
  /** EN: `NUMERO DE ATENCION` of the set. ES: `NUMERO DE ATENCION` del set. */
  readonly attentionNumber: string
  /** EN: The issued documents, in issue order. ES: Los documentos emitidos, en orden de emisión. */
  readonly cases: readonly IssuedCase[]
  /** EN: The signed envelope that carries the documents. ES: `EnvioDTE` — El sobre firmado que lleva los documentos. */
  readonly envelope: SignedEnvelope
}

/** EN: The plans `issueTestSet` accepts. ES: Los planes que acepta `issueTestSet`. */
export type IssuableSetPlan = BasicSetPlan | ExemptSetPlan | GuideSetPlan | PurchaseSetPlan

/** EN: `SetDTE/@ID` of every certification envelope. ES: `SetDTE/@ID` de cada sobre de certificación. */
export const TEST_SET_ENVELOPE_ID = 'DTE_SetDoc'

const GLOBAL_DISCOUNT_DESCRIPTION = 'DESCUENTO GLOBAL ITEMES AFECTOS'

// The test sets are dated and stamped on the UTC clock, as the reference does: the issue date is the UTC day of the
// run and every stamp is the UTC instant with its milliseconds, without a zone.
const utcDate = (at: Date): string => at.toISOString().slice(0, 10)
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

// The business activity of a receiver is cut at the 40 characters `GiroRecep` holds, as the reference cuts it: an
// issuer's may be twice as long, and the issuer is the receiver of its own purchase documents and transfers.
const withActivityCut = (receiver: ReceiverInput): ReceiverInput =>
  receiver.businessActivity === undefined
    ? receiver
    : { ...receiver, businessActivity: sanitizeText(receiver.businessActivity).slice(0, RECEIVER_ACTIVITY_LENGTH) }

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

const line = (item: PlannedItem, style: LineStyle, priceDecimals: number | undefined): LineItemInput => {
  const priced = item.unitPrice > 0
  const unitPriceDecimals = priced ? priceDecimals : undefined
  if (style === 'purchase')
    return compact({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit ?? 'UN',
      unitPrice: item.unitPrice,
      unitPriceDecimals,
      exempt: item.exempt,
      additionalTaxCodes: item.exempt ? undefined : [PURCHASE_TAX_CODE],
    })
  if (style === 'guide')
    return compact({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit ?? 'UN',
      unitPrice: priced ? item.unitPrice : undefined,
      exempt: item.exempt,
    })
  return compact({
    name: item.name,
    quantity: priced ? item.quantity : undefined,
    unit: priced ? item.unit : undefined,
    unitPrice: priced ? item.unitPrice : undefined,
    unitPriceDecimals,
    discountPercent: priced ? item.discountPercent : undefined,
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

// The totals of a document of the basic or the purchase set whose lines add up to nothing: the total alone, without a
// VAT rate. The exempt set and the guides keep the rate next to a zero total.
const zeroTotals = (items: readonly PlannedItem[]): DocumentInput['totals'] =>
  items.every((item) => calculateLineAmount(item).amount === 0) ? { totalAmount: 0 } : undefined

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
    items: input.items.map((item) => line(item, input.style, input.priceDecimals)),
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
    options: input.options,
    totals: input.totals,
    withholdVat: input.withholdVat,
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
    context.records.set(input.caseId, { type: input.type, folio, date: context.date, items: input.items })
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

  for (const invoice of invoices) {
    await issueCertificationDocument(context, {
      caseId: invoice.caseId,
      type: invoiceType,
      items: invoice.items,
      style,
      receiver,
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
    await issueCertificationDocument(context, {
      caseId: note.caseId,
      type: 61,
      items,
      style,
      receiver,
      references: [setReference(note.caseId, context.date), documentReference(referencedRecord(context, note), note)],
      withholdVat: kind === 'purchase' ? true : undefined,
      totals: bareZero ? zeroTotals(items) : undefined,
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
    await issueCertificationDocument(context, {
      caseId: note.caseId,
      type: 56,
      items,
      style,
      receiver,
      references: [setReference(note.caseId, context.date), documentReference(referencedRecord(context, note), note)],
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
  for (const guide of plan.guides) {
    const internal = isInternalTransfer(guide)
    await issueCertificationDocument(context, {
      caseId: guide.caseId,
      type: 52,
      items: guide.items,
      style: 'guide',
      receiver: internal ? issuerAsReceiver(context.options.issuer) : undefined,
      references: [setReference(guide.caseId, context.date)],
      options: guideOptions(guide),
      totals: internal ? { vatRate: 19, totalAmount: 0 } : undefined,
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
 * then debit notes, each with the SET reference (`SET`, folio 1, the issue date, `CASO <id>`) and, on notes, the
 * reference to the document of the referenced case with the code and reason of the set. Basic invoices carry
 * `TpoTranVenta` 1 and the global discount of the case; purchase documents name the issuer as receiver and carry the
 * withholding; an internal transfer names the issuer and totals 0. The set is dated and stamped on the UTC clock, as
 * the reference does: the issue date is the UTC day the run starts on, and `TSTED`, `TmstFirma` and `TmstFirmaEnv` are
 * UTC instants with milliseconds. Late in the Chilean evening that is already the next day.
 * ES: Emite cada documento del plan de un set y firma su sobre. Primero las facturas (o guías), luego las notas de
 * crédito, luego las de débito, cada una con la referencia SET (`SET`, folio 1, la fecha de emisión, `CASO <id>`) y, en
 * las notas, la referencia al documento del caso referido con el código y la razón del set. Las facturas del set
 * básico llevan `TpoTranVenta` 1 y el descuento global del caso; los documentos de compra nombran al emisor como
 * receptor y llevan la retención; un traslado interno nombra al emisor y totaliza 0. El set se fecha y se marca con
 * el reloj UTC, como lo hace la referencia: la fecha de emisión es el día UTC en que parte la corrida, y `TSTED`,
 * `TmstFirma` y `TmstFirmaEnv` son instantes UTC con milisegundos. Tarde en la noche de Chile eso ya es el día
 * siguiente.
 * @param plan EN: a set plan of `planCertificationSets`. ES: un plan de set de `planCertificationSets`.
 * @param options EN: issuer, receiver, certificate, folios, resolution, clock. ES: emisor, receptor, certificado, folios, resolución, reloj.
 * @throws {DteError} EN: `MISSING_FIELD` (`invoices` or `guides` on an empty plan, `referencedCase` on a note whose case was not issued before it), `FOLIO_OUT_OF_RANGE` from the folio source, and the phase 1 codes. ES: `MISSING_FIELD` (`invoices` o `guides` en un plan vacío, `referencedCase` en una nota cuyo caso no se emitió antes), `FOLIO_OUT_OF_RANGE` de la fuente de folios, y los códigos de la fase 1.
 */
export const issueTestSet = async (plan: IssuableSetPlan, options: IssueSetOptions): Promise<IssuedSet> => {
  const clock = options.now ?? (() => new Date())
  const context: IssueContext = {
    options,
    clock,
    date: utcDate(clock()),
    stamp: utcTimestamp,
    records: new Map(),
    issued: [],
  }
  if (plan.kind === 'guide') await issueGuides(context, plan)
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
