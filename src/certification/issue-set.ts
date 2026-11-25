import { TEST_SET_REFERENCE_TYPE } from '../catalogs/certification'
import { FOREIGN_RECEIVER_RUT, SII_RUT, type Currency, type DispatchType, type TransferType } from '../catalogs/codes'
import type { DocumentType } from '../catalogs/document-types'
import type { Certificate } from '../certificate/certificate'
import { createDocument, createDocumentWith } from '../document/create'
import { issueDocument } from '../document/issue'
import type { SignedDocument } from '../document/sign'
import { createEnvelope } from '../envelope/create'
import { signEnvelope, type SignedEnvelope } from '../envelope/sign'
import { DteError } from '../errors'
import type {
  CommissionLineInput,
  CustomsInput,
  DocumentInput,
  GlobalAdjustmentInput,
  IssuerInput,
  LineItemInput,
  ReceiverInput,
  ReferenceInput,
  TransportInput,
} from '../model/document'
import { sanitizeText } from '../text/sanitize'
import { chileDate } from '../time/chile'
import { calculateLineAmount, type LineAmount } from '../totals/calculate'
import { divide, toNumber, unitsOf } from '../totals/exact'
import { roundHalfAwayFromZero } from '../totals/export'
import { loadCustomsCodes, type CustomsCodes } from './export-codes'
import type { FolioSource } from './folios'
import type {
  BasicSetPlan,
  ExemptSetPlan,
  ExportSetPlan,
  GuideSetPlan,
  PlannedCommission,
  PlannedExport,
  PlannedExportItem,
  PlannedGuide,
  PlannedItem,
  PlannedNote,
  PlannedSettlement,
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
  /** EN: What an export set needs and its text does not give: the exchange rates, the foreign customer and how the tare is worked out. ES: Lo que necesita un set de exportación y su texto no da: los tipos de cambio, el cliente extranjero y cómo se calcula la tara. */
  readonly exportSets?: ExportSetOptions
}

/**
 * EN: The foreign customer of an export set as the caller gives it: its RUT is always `55555555-5`, the one the SII
 * gives a receiver abroad, and its nationality is the country each case names.
 * ES: El cliente extranjero de un set de exportación tal como lo da el llamador: su RUT es siempre `55555555-5`, el que
 * el SII da a un receptor en el extranjero, y su nacionalidad es el país que nombra cada caso.
 */
export type ExportReceiverInput = Partial<Omit<ReceiverInput, 'rut' | 'foreign'>>

/**
 * EN: What an export set needs and its text does not give.
 * ES: Lo que necesita un set de exportación y su texto no da.
 */
export type ExportSetOptions = {
  /** EN: Pesos per unit of each currency, by the name the set gives it (`DOLAR USA`, `YEN`, `FRANCO SZ`…): an export document carries its totals in pesos too (`OtraMoneda`, Formato DTE 2.5, fields 129 to 132), and the set gives no rate. The SII's review checks that the pesos agree with the rate, not the rate against the market. No default: a currency of the set without its rate stops the set before any folio is taken. ES: `TpoCambio` — Pesos por unidad de cada moneda, por el nombre que le da el set (`DOLAR USA`, `YEN`, `FRANCO SZ`…): un documento de exportación lleva también sus totales en pesos (`OtraMoneda`, Formato DTE 2.5, campos 129 a 132), y el set no da el tipo de cambio. La revisión del SII comprueba que los pesos concuerden con el tipo de cambio, no el tipo de cambio contra el mercado. Sin valor por defecto: una moneda del set sin su tipo de cambio detiene el set antes de tomar cualquier folio. */
  readonly exchangeRates?: Readonly<Record<string, number>>
  /** EN: The foreign customer every export document names; what it leaves out takes `DEFAULT_CERTIFICATION_FOREIGN_RECEIVER`, and its city, the name of the country of the case. ES: `Receptor` — El cliente extranjero que nombra cada documento de exportación; lo que omite se toma de `DEFAULT_CERTIFICATION_FOREIGN_RECEIVER`, y su ciudad, del nombre del país del caso. */
  readonly receiver?: ExportReceiverInput
  /** EN: The tare as a percent of the net weight, above 0 and at most 100; 2 by default. The set gives the units of the tare and of the weights and asks for their values to be worked out ("CALCULE LOS VALORES"): the net weight is the sum of the quantities of the lines, the tare this percent of it rounded up to a whole number of at least 1, and the gross weight the net weight plus the tare. ES: `Tara` — La tara como porcentaje del peso neto, mayor que 0 y hasta 100; 2 por defecto. El set da las unidades de la tara y de los pesos y pide calcular sus valores ("CALCULE LOS VALORES"): el peso neto es la suma de las cantidades de las líneas, la tara este porcentaje de él redondeado hacia arriba a un entero de al menos 1, y el peso bruto el neto más la tara. */
  readonly tarePercent?: number
}

/**
 * EN: The foreign customer an export set names when the run gives none: the RUT the SII gives a receiver abroad and
 * placeholder data; its city is the name of the country of each case.
 * ES: El cliente extranjero que nombra un set de exportación cuando la corrida no da uno: el RUT que el SII da a un
 * receptor en el extranjero y datos de relleno; su ciudad es el nombre del país de cada caso.
 */
export const DEFAULT_CERTIFICATION_FOREIGN_RECEIVER: ReceiverInput = Object.freeze({
  rut: FOREIGN_RECEIVER_RUT,
  businessName: 'IMPORTADOR EXTRANJERO',
  businessActivity: 'IMPORTACIONES',
  address: 'AVENIDA PRINCIPAL 123',
})

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
export type IssuableSetPlan =
  | BasicSetPlan
  | ExemptSetPlan
  | GuideSetPlan
  | PurchaseSetPlan
  | SettlementSetPlan
  | ExportSetPlan

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
  /** EN: A note of the simulation: issued with no reference when the case it refers to is not among the simulation's documents, as field behaviour does, where `createDocument` refuses one. ES: `Referencia` — Una nota de la simulación: se emite sin referencia cuando el caso al que se refiere no está entre los documentos de la simulación, como el comportamiento de campo, donde `createDocument` la rechaza. */
  readonly unreferencedNote?: boolean
  /** EN: Global adjustments written as given, in place of the global discount (an export document). ES: `DscRcgGlobal` — Ajustes globales escritos tal como vienen, en lugar del descuento global (un documento de exportación). */
  readonly globalAdjustments?: readonly GlobalAdjustmentInput[]
  /** EN: Currency of an export document. ES: `TpoMoneda` — Moneda de un documento de exportación. */
  readonly currency?: Currency
  /** EN: Exchange rate of an export document to pesos. ES: `TpoCambio` — Tipo de cambio a pesos de un documento de exportación. */
  readonly exchangeRate?: number
  /** EN: Transport, with the customs area of an export document. ES: `Transporte` — Transporte, con el área aduanera de un documento de exportación. */
  readonly transport?: TransportInput
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
        ? input.globalAdjustments
        : [
            compact({
              kind: 'discount',
              valueType: 'percent',
              value: input.globalDiscountPercent,
              description: input.globalDiscountDescription === false ? undefined : GLOBAL_DISCOUNT_DESCRIPTION,
            }),
          ],
    commissions: input.commissions,
    transport: input.transport,
    options: input.options,
    totals: input.totals,
    withholdVat: input.withholdVat,
    splitVat: input.splitVat,
    currency: input.currency,
    exchangeRate: input.exchangeRate,
  })
  const at = context.clock()
  const signed = issueDocument({
    document: createDocumentWith(document, { now: at }, { unreferencedNote: input.unreferencedNote }),
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

/**
 * EN: The settlement invoice of one case, with the references it is to carry: its lines carry their amount as the set
 * gives it, with no price, its commissions are taken off its total, and its VAT is split in the own VAT, that of the
 * commissions, and the third parties'. No note references it. Internal.
 * ES: La liquidación factura de un caso, con las referencias que debe llevar: sus líneas llevan el monto que da el
 * set, sin precio, sus comisiones se restan del total, y su IVA se separa en el propio, el de las comisiones, y el de
 * terceros. Ninguna nota la refiere. Interno.
 */
export const settlementDocument = (
  settlement: PlannedSettlement,
  references: readonly ReferenceInput[],
): IssueDocumentSpec => ({
  caseId: settlement.caseId,
  type: 43,
  items: [],
  lines: settlement.lines.map(settlementLine),
  commissions: settlement.commissions.map(commissionLine),
  splitVat: true,
  style: 'plain',
  references,
  record: false,
})

// A settlement invoice is issued to the run's customer, the principal it settles with.
const issueSettlements = async (context: IssueContext, plan: SettlementSetPlan): Promise<void> => {
  if (plan.settlements.length === 0) throw new DteError('MISSING_FIELD', { field: 'settlements', kind: plan.kind })
  for (const settlement of plan.settlements)
    await issueCertificationDocument(
      context,
      settlementDocument(settlement, [setReference(settlement.caseId, context.date)]),
    )
}

// The folio of a reference to a customs document: the set names the document and gives no number of it, and the SII's
// review of a conformant set did not look at it.
const CUSTOMS_REFERENCE_FOLIO = '1'
const DEFAULT_TARE_PERCENT = 2
const MAX_TARE = 9999999
// `FmaPagExp` 32, ANTICIPO: an export invoice paid in advance carries its settlement date (Formato DTE 2.5, field 15).
const ADVANCE_PAYMENT = 32
// The descriptions of the global surcharges of an export invoice: the commission abroad, the freight and the insurance.
const FOREIGN_COMMISSION = 'COMISIONES EN EL EXTRANJERO'
const FREIGHT = 'FLETE'
const INSURANCE = 'SEGURO'
// A container (codes 73 to 76, and 78 of Anexo 51-23) carries no marks; any other package `S/M`, without marks.
const CONTAINERS: readonly number[] = [73, 74, 75, 76, 78]
const NO_MARKS = 'S/M'
const CITY_LENGTH = 20

/**
 * EN: One export document worked out before any folio is taken: what `createDocument` gets, but the folio and the
 * folio of the document a note refers to. Internal.
 * ES: Un documento de exportación resuelto antes de tomar cualquier folio: lo que recibe `createDocument`, salvo el
 * folio y el del documento que refiere una nota. Interno.
 */
export type ExportDraft = {
  /** EN: The planned case. ES: El caso planificado. */
  readonly planned: PlannedExport
  /** EN: The lines, priced. ES: `Detalle` — Las líneas, con precio. */
  readonly lines: readonly LineItemInput[]
  /** EN: The currency. ES: `TpoMoneda` — La moneda. */
  readonly currency: Currency
  /** EN: The exchange rate to pesos. ES: `TpoCambio` — El tipo de cambio a pesos. */
  readonly exchangeRate: number
  /** EN: The foreign customer. ES: `Receptor` — El cliente extranjero. */
  readonly receiver: ReceiverInput
  /** EN: The customs area, on an invoice. ES: `Aduana` — El área aduanera, en una factura. */
  readonly transport?: TransportInput
  /** EN: The global surcharges, on an invoice. ES: `DscRcgGlobal` — Los recargos globales, en una factura. */
  readonly globalAdjustments?: readonly GlobalAdjustmentInput[]
  /** EN: The `IdDoc` options. ES: Las opciones de `IdDoc`. */
  readonly options?: DocumentInput['options']
  /** EN: The references to customs documents. ES: `Referencia` — Las referencias a documentos aduaneros. */
  readonly customsReferences: readonly ReferenceInput[]
}

/**
 * EN: What working out an export set takes of the options of a run: the issuer and the export options. Internal.
 * ES: Lo que toma de las opciones de una corrida resolver un set de exportación: el emisor y las opciones de
 * exportación. Interno.
 */
export type ExportIssueOptions = Pick<IssueSetOptions, 'issuer' | 'exportSets'>

type DraftContext = {
  readonly codes: CustomsCodes
  readonly options: ExportIssueOptions
  readonly date: string
  readonly drafts: Map<string, ExportDraft>
}

// A name of the case the customs tables must know, as its code.
const customsCodeOf = (
  name: string | undefined,
  lookup: (name: string) => number | null,
  field: string,
  caseId: string,
): number | undefined => {
  if (name === undefined) return undefined
  const code = lookup(name)
  if (code === null) throw new DteError('INVALID_OPTION', { field, value: name, caseId })
  return code
}

const tarePercentOf = (options: ExportIssueOptions): number => {
  const percent = options.exportSets?.tarePercent ?? DEFAULT_TARE_PERCENT
  if (!(typeof percent === 'number' && percent > 0 && percent <= 100))
    throw new DteError('INVALID_OPTION', { field: 'exportSets.tarePercent' })
  return percent
}

const toCents = (value: number): bigint => unitsOf(value, 2)

// The global surcharges of an export invoice, in the order of a conformant set: the commission abroad, a percent of
// the total of the sale clause rounded half away from zero to the cents `ValorDR` holds, then the freight and the
// insurance, which the set marks to go as surcharges too. Each is exempt (`IndExeDR` 1).
const exportSurcharges = (planned: PlannedExport): readonly GlobalAdjustmentInput[] => {
  const { customs, foreignCommissionPercent: percent } = planned
  const surcharge = (value: number, description: string): GlobalAdjustmentInput => ({
    kind: 'surcharge',
    valueType: 'amount',
    value,
    description,
    exemptIndicator: 1,
  })
  const surcharges: GlobalAdjustmentInput[] = []
  if (percent !== undefined) {
    if (customs.saleClauseTotal === undefined)
      throw new DteError('MISSING_FIELD', { field: 'transport.customs.saleClauseTotal', caseId: planned.caseId })
    const cents = divide(toCents(customs.saleClauseTotal) * toCents(percent), BigInt(10000))
    surcharges.push(surcharge(toNumber(cents, 2), FOREIGN_COMMISSION))
  }
  if (customs.freight !== undefined) surcharges.push(surcharge(customs.freight, FREIGHT))
  if (customs.insurance !== undefined) surcharges.push(surcharge(customs.insurance, INSURANCE))
  return surcharges
}

// The customs area of an export invoice: each name as its code, the weights worked out from the quantities of the
// lines, the total of the lines unless the invoice is lodging, and the packages with their marks.
const exportCustoms = (
  context: DraftContext,
  planned: PlannedExport,
  lines: readonly LineItemInput[],
): CustomsInput => {
  const { codes } = context
  const { customs, caseId } = planned
  const code = (name: string | undefined, lookup: (name: string) => number | null, field: string) =>
    customsCodeOf(name, lookup, `transport.customs.${field}`, caseId)
  const netWeight = roundHalfAwayFromZero(
    planned.items.reduce((sum, item) => sum + item.quantity, 0),
    2,
  )
  const tare = Math.min(MAX_TARE, Math.max(1, Math.ceil((netWeight * tarePercentOf(context.options)) / 100)))
  const tareUnit = code(customs.tareUnit, codes.unit, 'tareUnit')
  const grossWeightUnit = code(customs.grossWeightUnit, codes.unit, 'grossWeightUnit')
  const netWeightUnit = code(customs.netWeightUnit, codes.unit, 'netWeightUnit')
  const packageType = code(customs.packageType, codes.packageType, 'packages[0].code')
  return compact({
    saleModality: code(customs.saleModality, codes.saleModality, 'saleModality'),
    saleClause: code(customs.saleClause, codes.saleClause, 'saleClause'),
    saleClauseTotal: customs.saleClauseTotal,
    transportRoute: code(customs.transportRoute, codes.transportRoute, 'transportRoute'),
    loadingPort: code(customs.loadingPort, codes.loadingPort, 'loadingPort'),
    unloadingPort: code(
      customs.unloadingPort,
      (name) => codes.unloadingPort(name, customs.destinationCountry),
      'unloadingPort',
    ),
    tare: tareUnit === undefined ? undefined : tare,
    tareUnit,
    grossWeight: grossWeightUnit === undefined ? undefined : roundHalfAwayFromZero(netWeight + tare, 2),
    grossWeightUnit,
    netWeight: netWeightUnit === undefined ? undefined : netWeight,
    netWeightUnit,
    totalItems: planned.serviceIndicator === 4 ? undefined : lines.length,
    totalPackages: customs.totalPackages,
    packages:
      packageType === undefined
        ? undefined
        : [
            compact({
              code: packageType,
              count: customs.totalPackages,
              marks: CONTAINERS.includes(packageType) ? undefined : NO_MARKS,
            }),
          ],
    freight: customs.freight,
    insurance: customs.insurance,
    receiverCountry: code(customs.receiverCountry, codes.country, 'receiverCountry'),
    destinationCountry: code(customs.destinationCountry, codes.country, 'destinationCountry'),
  })
}

const exportLine = (item: PlannedExportItem): LineItemInput =>
  compact({
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice,
    discountPercent: item.discountPercent,
    surchargePercent: item.surchargePercent,
    // A discount in percent goes with its amount, a whole number, as the goods invoice of a conformant set wrote it;
    // the surcharge of its service invoice went in the line's amount alone, with its decimals.
    wholeShares: item.discountPercent === undefined ? undefined : true,
  })

// The lines of a note: those of the document it refers to when it names none, else its own, each priced, with its unit,
// discount and surcharge, as the line of that document of the same name when it gives no price of its own.
const noteLines = (planned: PlannedExport, referenced: ExportDraft): readonly LineItemInput[] =>
  planned.items.length === 0
    ? referenced.lines
    : planned.items.map((item) => {
        const original = referenced.lines.find((line) => sameName(line.name, item.name))
        return item.unitPrice !== undefined || original === undefined
          ? exportLine(item)
          : compact({ ...original, quantity: item.quantity, unit: item.unit ?? original.unit })
      })

const exchangeRateOf = (options: ExportIssueOptions, currency: string, caseId: string): number => {
  const rate = options.exportSets?.exchangeRates?.[currency]
  if (rate === undefined) throw new DteError('MISSING_FIELD', { field: 'exportSets.exchangeRates', currency, caseId })
  return rate
}

const foreignReceiver = (context: DraftContext, planned: PlannedExport): ReceiverInput => {
  const country = customsCodeOf(
    planned.customs.receiverCountry,
    context.codes.country,
    'transport.customs.receiverCountry',
    planned.caseId,
  )
  // The rates are asked for first, so the export options are there.
  const given = compact(context.options.exportSets!.receiver ?? {})
  if (country === undefined) return { ...DEFAULT_CERTIFICATION_FOREIGN_RECEIVER, ...given }
  // A code the table gave has its name.
  const city = context.codes.countryName(country)!.slice(0, CITY_LENGTH)
  return {
    ...DEFAULT_CERTIFICATION_FOREIGN_RECEIVER,
    city,
    ...given,
    foreign: { nationality: String(country) },
  }
}

const draftOf = (context: DraftContext, planned: PlannedExport): ExportDraft => {
  const { caseId } = planned
  const customsReferences = planned.customsReferences.map(
    (found): ReferenceInput => ({
      documentType: found.type,
      folio: CUSTOMS_REFERENCE_FOLIO,
      date: context.date,
      reason: found.name,
    }),
  )
  if (planned.type !== 110) {
    const referenced = planned.reference === undefined ? undefined : context.drafts.get(planned.reference.caseId)
    if (referenced === undefined) throw new DteError('MISSING_FIELD', { field: 'referencedCase', caseId })
    const currency = planned.currency ?? referenced.currency
    return {
      planned,
      lines: noteLines(planned, referenced),
      currency: currency as Currency,
      exchangeRate: exchangeRateOf(context.options, currency, caseId),
      receiver: referenced.receiver,
      customsReferences,
    }
  }
  if (planned.currency === undefined) throw new DteError('MISSING_FIELD', { field: 'currency', caseId })
  const lines = planned.items.map(exportLine)
  const exchangeRate = exchangeRateOf(context.options, planned.currency, caseId)
  const terms = customsCodeOf(planned.paymentTerms, context.codes.paymentTerms, 'options.exportPaymentTerms', caseId)
  const surcharges = exportSurcharges(planned)
  return {
    planned,
    lines,
    currency: planned.currency as Currency,
    exchangeRate,
    receiver: foreignReceiver(context, planned),
    transport: { customs: exportCustoms(context, planned, lines) },
    globalAdjustments: surcharges.length === 0 ? undefined : surcharges,
    options: compact({
      serviceIndicator: planned.serviceIndicator,
      exportPaymentTerms: terms === undefined ? undefined : String(terms),
      settlementDate: terms === ADVANCE_PAYMENT ? context.date : undefined,
    }),
    customsReferences,
  }
}

// The references of an export document: the SET reference, the document a note refers to, then the customs documents.
const exportReferences = (
  draft: ExportDraft,
  date: string,
  referenced: { readonly type: DocumentType; readonly folio: number; readonly date: string } | undefined,
): readonly ReferenceInput[] => {
  const { planned } = draft
  const note =
    referenced === undefined || planned.reference === undefined
      ? []
      : [
          {
            documentType: referenced.type,
            folio: referenced.folio,
            date: referenced.date,
            code: planned.reference.code,
            reason: planned.reference.reason,
          },
        ]
  return [setReference(planned.caseId, date), ...note, ...draft.customsReferences]
}

const exportDocumentInput = (
  options: ExportIssueOptions,
  draft: ExportDraft,
  date: string,
  folio: number,
  references: readonly ReferenceInput[],
): DocumentInput =>
  compact({
    type: draft.planned.type,
    folio,
    issueDate: date,
    issuer: options.issuer,
    receiver: withActivityCut(draft.receiver),
    items: draft.lines,
    references,
    globalAdjustments: draft.globalAdjustments,
    transport: draft.transport,
    options: draft.options,
    currency: draft.currency,
    exchangeRate: draft.exchangeRate,
  })

/**
 * EN: Works out every document of an export set without taking a folio: the customs tables are loaded, each name of
 * the set becomes its code, each currency its exchange rate, each note its lines and its customer, and each document
 * is built once with a stand-in folio, so whatever would refuse it stops the set before the first folio is taken.
 * Internal: the runner checks a set with it before it asks for folios.
 * ES: Resuelve cada documento de un set de exportación sin tomar folios: se cargan las tablas de Aduanas, cada nombre
 * del set pasa a ser su código, cada moneda su tipo de cambio, cada nota sus líneas y su cliente, y cada documento se
 * arma una vez con un folio provisional, así lo que lo rechazaría detiene el set antes de tomar el primer folio.
 * Interno: el ejecutor revisa un set con ella antes de pedir folios.
 * @throws {DteError} EN: `MISSING_FIELD` (`documents` on an empty plan, `exportSets.exchangeRates` with the currency, `currency`, `referencedCase`, `transport.customs.saleClauseTotal`), `INVALID_OPTION` (a name the customs tables do not know, with its field and value; `exportSets.tarePercent`), and the phase 1 codes, each with the case id. ES: los mismos códigos.
 */
export const prepareExportSet = async (
  plan: ExportSetPlan,
  options: ExportIssueOptions,
  date: string,
): Promise<readonly ExportDraft[]> => {
  if (plan.documents.length === 0) throw new DteError('MISSING_FIELD', { field: 'documents', kind: plan.kind })
  const context: DraftContext = { codes: await loadCustomsCodes(), options, date, drafts: new Map() }
  for (const planned of plan.documents) {
    const draft = draftOf(context, planned)
    context.drafts.set(planned.caseId, draft)
    const referenced = planned.reference === undefined ? undefined : context.drafts.get(planned.reference.caseId)
    const standIn = referenced === undefined ? undefined : { type: referenced.planned.type, folio: 1, date }
    createDocument(exportDocumentInput(options, draft, date, 1, exportReferences(draft, date, standIn)))
  }
  return [...context.drafts.values()]
}

/**
 * EN: Issues the documents of an export set: every one worked out first, then each in the set's order with its folio,
 * a note referring to the folio its document took. The simulation issues them without the reference of the test set,
 * which is the first of each. Internal.
 * ES: Emite los documentos de un set de exportación: primero se resuelven todos, luego cada uno en el orden del set
 * con su folio, y una nota refiere el folio que tomó su documento. La simulación los emite sin la referencia del set
 * de pruebas, que es la primera de cada uno. Interno.
 */
export const issueExports = async (context: IssueContext, plan: ExportSetPlan, simulated = false): Promise<void> => {
  const drafts = await prepareExportSet(plan, context.options, context.date)
  for (const draft of drafts) {
    const { planned } = draft
    const referenced = planned.reference === undefined ? undefined : context.records.get(planned.reference.caseId)
    const references = exportReferences(draft, context.date, referenced)
    await issueCertificationDocument(context, {
      caseId: planned.caseId,
      type: planned.type,
      items: [],
      lines: draft.lines,
      style: 'plain',
      receiver: draft.receiver,
      references: simulated ? references.slice(1) : references,
      globalAdjustments: draft.globalAdjustments,
      transport: draft.transport,
      options: draft.options,
      currency: draft.currency,
      exchangeRate: draft.exchangeRate,
      record: true,
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
 * third-party (`splitVat`). An export set issues one document per case in the set's order (`prepareExportSet` works
 * them all out first, so nothing is taken from the folio source when one of them cannot be issued): exempt, in the
 * currency of the case with its totals in pesos at the rate `exportSets` gives, naming the foreign customer; an invoice
 * with its customs area coded from the customs tables, its weights worked out from its lines, its commission abroad,
 * freight and insurance as global surcharges, its settlement date when paid in advance and the customs documents it
 * names as references; a note with the reference to its document and that document's prices, currency and customer.
 * With `receivers`, the invoices and the guides that do not name the issuer name those
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
 * terceros (`splitVat`). Un set de exportación emite un documento por caso en el orden del set (`prepareExportSet` los
 * resuelve todos primero, así nada se toma de la fuente de folios cuando uno no se puede emitir): exento, en la moneda
 * del caso con sus totales en pesos al tipo de cambio que da `exportSets`, nombrando al cliente extranjero; una factura
 * con su área aduanera codificada desde las tablas de Aduanas, sus pesos calculados desde sus líneas, su comisión en el
 * extranjero, flete y seguro como recargos globales, su fecha de cancelación cuando se paga por anticipado y los
 * documentos aduaneros que nombra como referencias; una nota con la referencia a su documento y los precios, la moneda
 * y el cliente de ese documento. Con `receivers`, las facturas y las guías que no nombran al emisor nombran a esos clientes
 * por turno, y una nota nombra al cliente del documento que refiere. La fecha de emisión es el día de Chile en que
 * parte la corrida, como piden las instrucciones del SII ("Agregue fecha del día"); `TSTED`, `TmstFirma` y
 * `TmstFirmaEnv` son instantes UTC con milisegundos.
 * @param plan EN: a set plan of `planCertificationSets`. ES: un plan de set de `planCertificationSets`.
 * @param options EN: issuer, receiver, certificate, folios, resolution, clock. ES: emisor, receptor, certificado, folios, resolución, reloj.
 * @throws {DteError} EN: `MISSING_FIELD` (`invoices`, `guides`, `settlements` or `documents` on an empty plan, `referencedCase` on a note whose case was not issued before it), the codes of `prepareExportSet` on an export set, `FOLIO_OUT_OF_RANGE` from the folio source, and the phase 1 codes. ES: `MISSING_FIELD` (`invoices`, `guides`, `settlements` o `documents` en un plan vacío, `referencedCase` en una nota cuyo caso no se emitió antes), los códigos de `prepareExportSet` en un set de exportación, `FOLIO_OUT_OF_RANGE` de la fuente de folios, y los códigos de la fase 1.
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
  else if (plan.kind === 'export') await issueExports(context, plan)
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
