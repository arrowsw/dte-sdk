import { createGuideBook, signGuideBook, type SignedGuideBook } from '../books/guide'
import { createPurchaseSalesBook, signPurchaseSalesBook, type SignedPurchaseSalesBook } from '../books/purchase-sales'
import { accumulateBookTotals, sumBookEntries } from '../books/totals'
import { CERTIFICATION_COUNTERPARTY } from '../catalogs/certification'
import type { Certificate } from '../certificate/certificate'
import { DteError } from '../errors'
import type { BookEntryInput, BookTotals, GuideEntryInput, PurchaseSalesBook } from '../model/book'
import type { IssuedSet } from './issue-set'
import type { PurchaseBookPlan } from './set-plan'
import { bookDocumentTypeOf, type TestBookDocument } from './set-text'

/**
 * EN: What every certification book needs.
 * ES: Lo que necesita cada libro de certificación.
 */
export type CertificationBookInput = {
  /** EN: Tax period `YYYY-MM`; the runner chooses it against the portal history. ES: `PeriodoTributario` — Período `AAAA-MM`; el runner lo elige contra el historial del portal. */
  readonly period: string
  /** EN: Company the book belongs to. ES: `RutEmisorLibro` — RUT del contribuyente dueño del libro. */
  readonly issuerRut: string
  /** EN: Authorized sender, normally the certificate holder. ES: `RutEnvia` — RUT de quien envía, normalmente el titular del certificado. */
  readonly senderRut: string
  /** EN: Resolution number (0 in certification) and date. ES: `NroResol` y `FchResol` — Número (0 en certificación) y fecha de la resolución. */
  readonly resolution: { readonly number: number; readonly date: string }
  /** EN: The signing certificate. ES: El certificado de firma. */
  readonly certificate: Certificate
  /** EN: Clock for the book id and signature timestamp. ES: Reloj para el id del libro y la marca de la firma. */
  readonly now?: () => Date
  /** EN: `total` (default) or `adjustment`, for a period the SII already holds; any of the three books can adjust. ES: `TipoEnvio` — `total` (por defecto) o `adjustment`, para un período que el SII ya tiene; cualquiera de los tres libros puede ajustar. */
  readonly submission?: 'total' | 'adjustment'
  /** EN: Period totals of the earlier submissions, carried forward on an adjustment of the sales or purchase book; the guide book ignores them. ES: Totales del período de los envíos anteriores, arrastrados en un ajuste del libro de ventas o de compras; el libro de guías los ignora. */
  readonly previousTotals?: readonly BookTotals[]
}

/**
 * EN: The totals of one issued document, as the books read them.
 * ES: Los totales de un documento emitido, como los leen los libros.
 */
export type BookCaseTotals = {
  readonly netAmount?: number
  readonly exemptAmount?: number
  readonly vatAmount?: number
  readonly totalAmount: number
}

/**
 * EN: One document of the sales book: the issued set's case, or what a run kept of it.
 * ES: Un documento del libro de ventas: el caso del set emitido, o lo que una corrida guardó de él.
 */
export type SalesBookCase = { readonly type: number; readonly folio: number; readonly totals: BookCaseTotals }

/**
 * EN: One guide of the guide book: the issued set's case, or what a run kept of it.
 * ES: Una guía del libro de guías: el caso del set emitido, o lo que una corrida guardó de él.
 */
export type GuideBookCase = {
  readonly folio: number
  readonly issueDate: string
  readonly transferType?: number
  readonly totals: BookCaseTotals
}

/**
 * EN: A sales-book source that is not the issued set itself: its kind and cases, as a resumed run holds them.
 * ES: Una fuente de libro de ventas que no es el set emitido: su tipo y sus casos, como los tiene una corrida retomada.
 */
export type SalesBookSource = { readonly kind: string; readonly cases: readonly SalesBookCase[] }

/**
 * EN: A guide-book source that is not the issued set itself.
 * ES: Una fuente de libro de guías que no es el set emitido.
 */
export type GuideBookSource = { readonly kind: string; readonly cases: readonly GuideBookCase[] }

const salesCases = (set: IssuedSet | SalesBookSource): readonly SalesBookCase[] =>
  'envelope' in set
    ? set.cases.map((issued) => ({ type: issued.type, folio: issued.folio, totals: issued.document.header.totals }))
    : set.cases

const guideCases = (set: IssuedSet | GuideBookSource): readonly GuideBookCase[] =>
  'envelope' in set
    ? set.cases.map((issued) => ({
        folio: issued.folio,
        issueDate: issued.document.header.issueDate,
        ...(issued.document.header.options.transferType === undefined
          ? {}
          : { transferType: issued.document.header.options.transferType }),
        totals: issued.document.header.totals,
      }))
    : set.cases

/**
 * EN: The customer written on the sales and guide books.
 * ES: El cliente escrito en los libros de ventas y de guías.
 */
export type BookReceiver = {
  /** EN: Customer RUT. ES: `RUTDoc` — RUT del cliente. */
  readonly rut: string
  /** EN: Customer name (max 50). ES: `RznSoc` — Razón social del cliente, máximo 50. */
  readonly name: string
}

/**
 * EN: Options of `createCertificationSalesBook`.
 * ES: Opciones de `createCertificationSalesBook`.
 */
export type CertificationSalesBookInput = CertificationBookInput & {
  /** EN: The customer written on every line. ES: El cliente que se escribe en cada línea (`RUTDoc`, `RznSoc`). */
  readonly receiver: BookReceiver
  /** EN: Credit notes as positive amounts (default) or negative. ES: Notas de crédito con montos positivos (por defecto) o negativos. */
  readonly creditNoteSign?: 'positive' | 'negative'
}

/** EN: How a guide enters the guide book. ES: Cómo entra una guía al libro de guías. */
export type GuideBookCaseFlag = 'normal' | 'modified' | 'voided'

/**
 * EN: Options of `createCertificationGuideBook`.
 * ES: Opciones de `createCertificationGuideBook`.
 */
export type CertificationGuideBookInput = CertificationBookInput & {
  /** EN: The customer written on every guide line. ES: El cliente que se escribe en cada línea de guía (`RUTDoc`, `RznSoc`). */
  readonly receiver: BookReceiver
  /** EN: `FolioNotificacion`; 3 by default. ES: `FolioNotificacion`; 3 por defecto. */
  readonly notificationFolio?: number
  /** EN: One flag per guide, by position; by default the second is `modified` and the third `voided`. ES: Un indicador por guía, por posición; por defecto la segunda es `modified` y la tercera `voided`. */
  readonly caseFlags?: readonly GuideBookCaseFlag[]
}

const VAT_RATE = 19
const PURCHASE_INVOICE = 46
const PAPER_EXEMPT_INVOICE = 32
const NOTE_TYPES: readonly number[] = [55, 56, 60, 61]
const DEFAULT_NOTIFICATION_FOLIO = 3

const vatOf = (affected: number): number => Math.round((affected * VAT_RATE) / 100)
const documentDate = (period: string): string => `${period}-15`

const compact = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T

/**
 * EN: The sales book of the certification: only the basic set's invoices and notes, dated the 15th of the period,
 * with the customer as counterparty, every amount present (0 when absent) and the VAT rate on every line, as the
 * field sends it. Book `MENSUAL`, submission `TOTAL`.
 * ES: El libro de ventas de la certificación: solo las facturas y notas del set básico, con fecha 15 del período, el
 * cliente como contraparte, todo monto presente (0 si falta) y la tasa de IVA en cada línea, como lo envía el campo.
 * Libro `MENSUAL`, envío `TOTAL`.
 * @throws {DteError} EN: `INVALID_OPTION` (field `set`) when the set is not the basic one; the phase 3 codes. ES: `INVALID_OPTION` (campo `set`) si el set no es el básico; los códigos de la fase 3.
 */
export const createCertificationSalesBook = (
  set: IssuedSet | SalesBookSource,
  input: CertificationSalesBookInput,
): SignedPurchaseSalesBook => {
  if (set.kind !== 'basic') throw new DteError('INVALID_OPTION', { field: 'set', kind: set.kind })
  const entries: BookEntryInput[] = salesCases(set).map((issued) => {
    const totals = issued.totals
    const sign = issued.type === 61 && input.creditNoteSign === 'negative' ? -1 : 1
    const amount = (value: number | undefined): number => Math.round((value ?? 0) * sign)
    return {
      type: issued.type,
      folio: issued.folio,
      date: documentDate(input.period),
      counterpartyRut: input.receiver.rut,
      counterpartyName: input.receiver.name,
      exemptAmount: amount(totals.exemptAmount),
      netAmount: amount(totals.netAmount),
      vatAmount: amount(totals.vatAmount),
      totalAmount: amount(totals.totalAmount),
      taxRate: VAT_RATE,
    }
  })
  const book = createPurchaseSalesBook({
    cover: {
      issuerRut: input.issuerRut,
      senderRut: input.senderRut,
      period: input.period,
      resolutionDate: input.resolution.date,
      resolutionNumber: input.resolution.number,
      operation: 'sale',
      kind: 'monthly',
      submission: input.submission ?? 'total',
    },
    entries,
    ...(input.previousTotals === undefined ? {} : { previousTotals: input.previousTotals }),
    now: input.now?.(),
  })
  return signPurchaseSalesBook(book, input.certificate)
}

// The retained VAT travels in `OtrosImp` as a fraction, as the field writes it, while every other rate is a percentage.
const WITHHOLDING_RATE = 0.19
const FREE_DELIVERY_CODE = 4 as const
const EXEMPT_BOOK_NON_RECOVERABLE_CODE = 1 as const

// The reference of a note is read with these patterns, in this order: the electronic invoice needs ELECTRONICA to come
// after FACTURA, which `includes` on both words would not ask for.
const referenceTypeOf = (observation: string, exemptBook: boolean): number | undefined => {
  if (/FACTURA EXENTA ELECTRONICA/i.test(observation)) return 34
  if (/FACTURA EXENTA/i.test(observation)) return exemptBook ? PAPER_EXEMPT_INVOICE : 30
  if (/FACTURA.*ELECTRONICA/i.test(observation)) return 33
  return /FACTURA/i.test(observation) ? 30 : undefined
}

const withoutKeys = (entry: BookEntryInput, keys: readonly (keyof BookEntryInput)[]): BookEntryInput =>
  Object.fromEntries(
    Object.entries(entry).filter(([key]) => !keys.includes(key as keyof BookEntryInput)),
  ) as BookEntryInput

const amountOf = (entry: BookEntryInput): number => entry.nonRecoverableVat?.[0].amount ?? 0

// Net, VAT and exempt amounts, plus the non-recoverable VAT on the exempt book, where it was paid but is not deducted.
const totalOf = (entry: BookEntryInput, exemptBook: boolean): number =>
  (entry.netAmount ?? 0) + (entry.vatAmount ?? 0) + (entry.exemptAmount ?? 0) + (exemptBook ? amountOf(entry) : 0)

// First pass, per document: what the supplier document says, the exempt book's rewrite of it and its total.
const purchaseLine = (document: TestBookDocument, period: string, exemptBook: boolean): BookEntryInput => {
  const detected = bookDocumentTypeOf(document.documentText) ?? 0
  const exempt = document.exemptAmount ?? 0
  const affected = document.affectedAmount ?? 0
  const pureExempt = affected === 0 && exempt > 0
  const paperExempt = exemptBook && detected === 30 && pureExempt
  const type = paperExempt ? PAPER_EXEMPT_INVOICE : detected
  const vat = vatOf(affected)
  const trailingFolio = /(\d+)\s*$/.exec(document.observation ?? '')
  const reference =
    NOTE_TYPES.includes(type) && document.observation !== null && trailingFolio !== null
      ? {
          referenceFolio: parseInt(trailingFolio[1], 10),
          referenceType: referenceTypeOf(document.observation, exemptBook),
        }
      : {}
  // The reference reads the common-use, free-delivery and withholding observations of the regular book only: the lines
  // of the exempt book never carry them, whatever their observation says.
  const commonUse = !exemptBook && document.commonUseVat
  const freeDelivery = !exemptBook && document.nonRecoverableVatCode !== null
  const withheld = !exemptBook && document.totalWithholding && type === PURCHASE_INVOICE
  const line: BookEntryInput = compact({
    type,
    folio: document.folio,
    date: documentDate(period),
    counterpartyRut: CERTIFICATION_COUNTERPARTY.rut,
    counterpartyName: CERTIFICATION_COUNTERPARTY.name,
    taxRate: VAT_RATE,
    exemptAmount: exempt > 0 ? exempt : undefined,
    netAmount: affected > 0 ? affected : undefined,
    vatAmount: affected > 0 ? vat : undefined,
    taxKind: commonUse ? ('vat' as const) : undefined,
    commonUseVat: commonUse ? vat : undefined,
    nonRecoverableVat: freeDelivery ? [{ code: FREE_DELIVERY_CODE, amount: vat }] : undefined,
    otherTaxes: withheld ? [{ code: 15, rate: WITHHOLDING_RATE, amount: vat }] : undefined,
    totalVatWithheld: withheld ? vat : undefined,
    ...reference,
  })
  let entry = line
  if (exemptBook && type !== PURCHASE_INVOICE && !pureExempt)
    entry = {
      ...entry,
      nonRecoverableVat: [{ code: EXEMPT_BOOK_NON_RECOVERABLE_CODE, amount: entry.vatAmount ?? 0 }],
      vatAmount: 0,
      netAmount: entry.netAmount ?? 0,
    }
  if (paperExempt) entry = withoutKeys(entry, ['taxRate', 'netAmount', 'vatAmount', 'nonRecoverableVat'])
  else if (exemptBook && pureExempt) entry = { ...entry, taxRate: VAT_RATE, netAmount: 0, vatAmount: 0 }
  return { ...entry, totalAmount: withheld ? (entry.netAmount ?? 0) : totalOf(entry, exemptBook) }
}

// Second pass, exempt book only: a note with no amounts of its own takes the exempt and net amounts of the first document
// with the folio it names, and that document's non-recoverable VAT when it has a net amount. Documents are read as they
// stand when the note comes, so a note naming an earlier note sees what that note inherited.
const inheritFromReferenced = (lines: readonly BookEntryInput[]): readonly BookEntryInput[] =>
  lines.reduce<readonly BookEntryInput[]>((done, line, index) => {
    if (!NOTE_TYPES.includes(line.type) || line.netAmount || line.exemptAmount || line.referenceFolio === undefined)
      return [...done, line]
    const referenced = [...done, ...lines.slice(index)].find((candidate) => candidate.folio === line.referenceFolio)
    if (referenced === undefined) return [...done, line]
    const inherited = compact({
      ...line,
      exemptAmount: referenced.exemptAmount || undefined,
      netAmount: referenced.netAmount || line.netAmount,
      nonRecoverableVat:
        referenced.netAmount && referenced.nonRecoverableVat !== undefined
          ? [{ code: EXEMPT_BOOK_NON_RECOVERABLE_CODE, amount: amountOf(referenced) }]
          : line.nonRecoverableVat,
    })
    return [...done, { ...inherited, totalAmount: totalOf(inherited, true) }]
  }, [])

// Last pass, the rules the SII applied to the lines the field sends: with common-use or non-recoverable VAT the rate and
// the recoverable VAT are 0, and a rate with no net amount goes with explicit zeros (omitting them was refused with
// `LBR-3`, zeros were accepted with `LBR-2`).
const settleRate = (entry: BookEntryInput): BookEntryInput => {
  if (entry.commonUseVat) return { ...entry, taxRate: 0, vatAmount: 0 }
  if (entry.nonRecoverableVat !== undefined)
    return { ...entry, taxRate: 0, vatAmount: 0, netAmount: entry.netAmount ?? 0 }
  if (entry.taxRate !== undefined && !((entry.netAmount ?? 0) > 0)) return { ...entry, netAmount: 0, vatAmount: 0 }
  return entry
}

// The summary rows as the field writes them: no tax kind (it stays on the line), and the credit of common-use VAT
// rounded document by document and summed, also across the rows of earlier submissions.
const fieldSummary = (
  book: PurchaseSalesBook,
  factor: number,
  previous: readonly BookTotals[],
): Pick<PurchaseSalesBook, 'segmentTotals' | 'periodTotals'> => {
  const creditOf = (type: number): number =>
    book.entries
      .filter((entry) => entry.type === type && entry.commonUseVat)
      .reduce((total, entry) => total + Math.round((entry.commonUseVat as number) * factor), 0)
  const lines = sumBookEntries(book.entries).map(({ taxKind, ...row }) => {
    void taxKind
    return (row.commonUseVat ?? 0) > 0 ? { ...row, commonUseCredit: creditOf(row.type) } : row
  })
  const carried = previous.map(({ taxKind, ...row }) => {
    void taxKind
    return row.commonUseCredit === undefined && (row.commonUseVat ?? 0) > 0
      ? { ...row, commonUseCredit: Math.round((row.commonUseVat as number) * factor) }
      : row
  })
  return {
    segmentTotals: book.segmentTotals === null ? null : lines,
    periodTotals: book.periodTotals === null ? null : accumulateBookTotals(carried, lines),
  }
}

/**
 * EN: A purchase book of the certification from a purchase-book set: one line per supplier document with the SII's
 * placeholder counterparty, the VAT at 19 % of the affected amount, common-use VAT, non-recoverable VAT for free
 * deliveries, the withholding of a purchase invoice, the referenced folio of a note from its observation, and, for the
 * exempt taxpayers' book, non-recoverable VAT on every affected line, the paper exempt invoice as type 32 and notes
 * inheriting the amounts of the document they reference. Totals follow the field formula. Book `MENSUAL`, submission
 * `TOTAL`, the proportionality factor of the set.
 * ES: Un libro de compras de la certificación desde un set de libro de compras: una línea por documento de proveedor
 * con la contraparte de relleno del SII, el IVA al 19 % del afecto, IVA de uso común, IVA no recuperable en entregas
 * gratuitas, la retención de una factura de compra, el folio referido de una nota tomado de su observación y, en el
 * libro para exentos, IVA no recuperable en toda línea afecta, la factura exenta en papel como tipo 32 y notas que
 * heredan los montos del documento que refieren. Los totales siguen la fórmula del campo. Libro `MENSUAL`, envío `TOTAL`,
 * el factor de proporcionalidad del set.
 * @throws {DteError} EN: the phase 3 codes (`INVALID_DOCUMENT_TYPE` for a document the detector does not know). ES: los códigos de la fase 3 (`INVALID_DOCUMENT_TYPE` para un documento que el detector no conoce).
 */
export const createCertificationPurchaseBook = (
  plan: PurchaseBookPlan,
  input: CertificationBookInput,
): SignedPurchaseSalesBook => {
  const exemptBook = plan.kind === 'exemptPurchaseBook'
  const lines = plan.documents.map((document) => purchaseLine(document, input.period, exemptBook))
  const entries = (exemptBook ? inheritFromReferenced(lines) : lines).map(settleRate)
  const book = createPurchaseSalesBook({
    cover: {
      issuerRut: input.issuerRut,
      senderRut: input.senderRut,
      period: input.period,
      resolutionDate: input.resolution.date,
      resolutionNumber: input.resolution.number,
      operation: 'purchase',
      kind: 'monthly',
      submission: input.submission ?? 'total',
    },
    entries,
    ...(input.previousTotals === undefined ? {} : { previousTotals: input.previousTotals }),
    commonUseVatFactor: plan.proportionalityFactor,
    now: input.now?.(),
  })
  return signPurchaseSalesBook(
    { ...book, ...fieldSummary(book, plan.proportionalityFactor, input.previousTotals ?? []) },
    input.certificate,
  )
}

const defaultFlag = (index: number): GuideBookCaseFlag => (index === 1 ? 'modified' : index === 2 ? 'voided' : 'normal')

/**
 * EN: The guide book of the certification: only the guide set's guides, with their transfer reason and issue date;
 * by position the second guide carries `Operacion` 1 and the third is voided (`Anulado` 2, total 0 and nothing else),
 * unless `caseFlags` says otherwise; a sale carries the customer, the net, the VAT rate and the VAT; every guide its
 * total. Notification folio 3 by default, book `ESPECIAL`, submission `TOTAL` unless it adjusts; an adjustment marks
 * only the modified guide with the operation and writes the line summary in both sections.
 * ES: El libro de guías de la certificación: solo las guías del set de guías, con su tipo de traslado y fecha de
 * emisión; por posición la segunda lleva `Operacion` 1 y la tercera va anulada (`Anulado` 2, total 0 y nada más), salvo
 * que `caseFlags` diga otra cosa; una venta lleva el cliente, el neto, la tasa y el IVA; toda guía su total. Folio de
 * notificación 3 por defecto, libro `ESPECIAL`, envío `TOTAL` salvo que ajuste; un ajuste marca con la operación solo la
 * guía modificada y escribe el resumen de las líneas en ambas secciones.
 * @throws {DteError} EN: `INVALID_OPTION` (field `set`) when the set is not the guide one; the phase 3 codes. ES: `INVALID_OPTION` (campo `set`) si el set no es el de guías; los códigos de la fase 3.
 */
export const createCertificationGuideBook = (
  set: IssuedSet | GuideBookSource,
  input: CertificationGuideBookInput,
): SignedGuideBook => {
  if (set.kind !== 'guide') throw new DteError('INVALID_OPTION', { field: 'set', kind: set.kind })
  const entries: GuideEntryInput[] = guideCases(set).map((issued, index) => {
    const flag = input.caseFlags?.[index] ?? defaultFlag(index)
    const transferType = issued.transferType ?? 1
    if (flag === 'voided')
      return { folio: issued.folio, transferType, date: issued.issueDate, voided: 'guide', totalAmount: 0 }
    const net = issued.totals.netAmount ?? 0
    const sale =
      transferType === 1
        ? compact({
            receiverRut: input.receiver.rut,
            receiverName: input.receiver.name,
            netAmount: net > 0 ? net : undefined,
            taxRate: net > 0 ? VAT_RATE : undefined,
            vatAmount: net > 0 ? issued.totals.vatAmount : undefined,
          })
        : {}
    return compact({
      folio: issued.folio,
      transferType,
      date: issued.issueDate,
      adjustment: flag === 'modified' ? ('add' as const) : undefined,
      ...sale,
      totalAmount: issued.totals.totalAmount,
    })
  })
  const book = createGuideBook({
    cover: {
      issuerRut: input.issuerRut,
      senderRut: input.senderRut,
      period: input.period,
      resolutionDate: input.resolution.date,
      resolutionNumber: input.resolution.number,
      notificationFolio: input.notificationFolio ?? DEFAULT_NOTIFICATION_FOLIO,
      submission: input.submission ?? 'total',
    },
    entries,
    now: input.now?.(),
  })
  // Phase 3 marks every line of an adjustment with the add operation; the field marks only the modified guide.
  const marked = book.entries.map((entry, index) => {
    if ((input.caseFlags?.[index] ?? defaultFlag(index)) === 'modified') return entry
    const { adjustment, ...rest } = entry
    void adjustment
    return rest
  })
  return signGuideBook({ ...book, entries: marked }, input.certificate)
}
