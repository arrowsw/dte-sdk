import { createGuideBook, signGuideBook, type SignedGuideBook } from '../books/guide'
import { createPurchaseSalesBook, signPurchaseSalesBook, type SignedPurchaseSalesBook } from '../books/purchase-sales'
import { CERTIFICATION_COUNTERPARTY } from '../catalogs/certification'
import type { Certificate } from '../certificate/certificate'
import { DteError } from '../errors'
import type { BookEntryInput, GuideEntryInput } from '../model/book'
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
}

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
  set: IssuedSet,
  input: CertificationSalesBookInput,
): SignedPurchaseSalesBook => {
  if (set.kind !== 'basic') throw new DteError('INVALID_OPTION', { field: 'set', kind: set.kind })
  const entries: BookEntryInput[] = set.cases.map((issued) => {
    const totals = issued.document.header.totals
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
      submission: 'total',
    },
    entries,
    now: input.now?.(),
  })
  return signPurchaseSalesBook(book, input.certificate)
}

const referenceTypeOf = (observation: string, exemptBook: boolean): number | undefined => {
  const upper = observation.toUpperCase()
  if (upper.includes('FACTURA EXENTA ELECTRONICA')) return 34
  if (upper.includes('FACTURA EXENTA')) return exemptBook ? PAPER_EXEMPT_INVOICE : 30
  if (upper.includes('FACTURA') && upper.includes('ELECTRONICA')) return 33
  if (upper.includes('FACTURA')) return 30
  return undefined
}

type PurchaseEntry = BookEntryInput & { readonly nonRecoverableAmount: number }

const purchaseEntry = (document: TestBookDocument, period: string, exemptBook: boolean): PurchaseEntry => {
  const detected = bookDocumentTypeOf(document.documentText) ?? 0
  const exempt = document.exemptAmount ?? 0
  const affected = document.affectedAmount ?? 0
  const type = exemptBook && detected === 30 && exempt > 0 && affected === 0 ? PAPER_EXEMPT_INVOICE : detected
  const vat = vatOf(affected)
  const trailingFolio = /(\d+)\s*$/.exec(document.observation ?? '')
  const reference =
    NOTE_TYPES.includes(type) && document.observation !== null && trailingFolio !== null
      ? {
          referenceFolio: parseInt(trailingFolio[1], 10),
          referenceType: referenceTypeOf(document.observation, exemptBook),
        }
      : {}

  let entry: BookEntryInput = compact({
    type,
    folio: document.folio,
    date: documentDate(period),
    counterpartyRut: CERTIFICATION_COUNTERPARTY.rut,
    counterpartyName: CERTIFICATION_COUNTERPARTY.name,
    taxRate: VAT_RATE,
    exemptAmount: exempt > 0 ? exempt : undefined,
    netAmount: affected > 0 ? affected : undefined,
    vatAmount: affected > 0 ? vat : undefined,
    ...reference,
  })
  let nonRecoverableAmount = 0
  if (document.commonUseVat) entry = { ...entry, commonUseVat: vat, taxKind: 'vat' }
  if (document.nonRecoverableVatCode !== null) {
    entry = { ...entry, nonRecoverableVat: [{ code: 4, amount: vat }] }
    nonRecoverableAmount = vat
  }
  if (document.totalWithholding && type === PURCHASE_INVOICE)
    entry = { ...entry, otherTaxes: [{ code: 15, rate: VAT_RATE, amount: vat }], totalVatWithheld: vat }
  if (exemptBook) {
    if (type !== PURCHASE_INVOICE && affected > 0) {
      entry = { ...entry, nonRecoverableVat: [{ code: 1, amount: vat }], vatAmount: 0 }
      nonRecoverableAmount = vat
    } else if (type === PAPER_EXEMPT_INVOICE) {
      const { taxRate, netAmount, vatAmount, nonRecoverableVat, ...rest } = entry
      void taxRate
      void netAmount
      void vatAmount
      void nonRecoverableVat
      entry = rest
    } else if (affected === 0) {
      entry = { ...entry, taxRate: VAT_RATE, netAmount: 0, vatAmount: 0 }
    }
  }
  const total =
    document.totalWithholding && type === PURCHASE_INVOICE
      ? (entry.netAmount ?? 0)
      : (entry.netAmount ?? 0) +
        (entry.vatAmount ?? 0) +
        (entry.exemptAmount ?? 0) +
        (exemptBook ? nonRecoverableAmount : 0)
  return { ...entry, totalAmount: total, nonRecoverableAmount }
}

const inheritFromReferenced = (entries: readonly PurchaseEntry[]): readonly PurchaseEntry[] =>
  entries.map((entry) => {
    if (!NOTE_TYPES.includes(entry.type) || entry.netAmount || entry.exemptAmount || entry.referenceFolio === undefined)
      return entry
    const referenced = entries.find((candidate) => candidate.folio === entry.referenceFolio)
    if (referenced === undefined) return entry
    const nonRecoverable =
      referenced.nonRecoverableVat === undefined
        ? undefined
        : [{ code: 1 as const, amount: referenced.nonRecoverableAmount }]
    const inherited = compact({
      ...entry,
      exemptAmount: referenced.exemptAmount,
      netAmount: referenced.netAmount,
      nonRecoverableVat: nonRecoverable,
      nonRecoverableAmount: referenced.nonRecoverableAmount,
    })
    return {
      ...inherited,
      totalAmount: (inherited.netAmount ?? 0) + (inherited.exemptAmount ?? 0) + inherited.nonRecoverableAmount,
    }
  })

const settleRate = (entry: PurchaseEntry): BookEntryInput => {
  const { nonRecoverableAmount, ...fields } = entry
  void nonRecoverableAmount
  if (fields.commonUseVat !== undefined) return { ...fields, taxRate: 0, vatAmount: 0 }
  if (fields.nonRecoverableVat !== undefined)
    return { ...fields, taxRate: 0, vatAmount: 0, netAmount: fields.netAmount ?? 0 }
  if (fields.taxRate !== undefined && !((fields.netAmount ?? 0) > 0)) return { ...fields, netAmount: 0, vatAmount: 0 }
  return fields
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
  const raw = plan.documents.map((document) => purchaseEntry(document, input.period, exemptBook))
  const entries = (exemptBook ? inheritFromReferenced(raw) : raw).map(settleRate)
  const book = createPurchaseSalesBook({
    cover: {
      issuerRut: input.issuerRut,
      senderRut: input.senderRut,
      period: input.period,
      resolutionDate: input.resolution.date,
      resolutionNumber: input.resolution.number,
      operation: 'purchase',
      kind: 'monthly',
      submission: 'total',
    },
    entries,
    commonUseVatFactor: plan.proportionalityFactor,
    now: input.now?.(),
  })
  return signPurchaseSalesBook(book, input.certificate)
}

const defaultFlag = (index: number): GuideBookCaseFlag => (index === 1 ? 'modified' : index === 2 ? 'voided' : 'normal')

/**
 * EN: The guide book of the certification: only the guide set's guides, with their transfer reason and issue date;
 * by position the second guide carries `Operacion` 1 and the third is voided (`Anulado` 2, total 0 and nothing else),
 * unless `caseFlags` says otherwise; a sale carries the customer, the net, the VAT rate and the VAT; every guide its
 * total. Notification folio 3 by default, book `ESPECIAL`, submission `TOTAL`.
 * ES: El libro de guías de la certificación: solo las guías del set de guías, con su tipo de traslado y fecha de
 * emisión; por posición la segunda lleva `Operacion` 1 y la tercera va anulada (`Anulado` 2, total 0 y nada más), salvo
 * que `caseFlags` diga otra cosa; una venta lleva el cliente, el neto, la tasa y el IVA; toda guía su total. Folio de
 * notificación 3 por defecto, libro `ESPECIAL`, envío `TOTAL`.
 * @throws {DteError} EN: `INVALID_OPTION` (field `set`) when the set is not the guide one; the phase 3 codes. ES: `INVALID_OPTION` (campo `set`) si el set no es el de guías; los códigos de la fase 3.
 */
export const createCertificationGuideBook = (set: IssuedSet, input: CertificationGuideBookInput): SignedGuideBook => {
  if (set.kind !== 'guide') throw new DteError('INVALID_OPTION', { field: 'set', kind: set.kind })
  const entries: GuideEntryInput[] = set.cases.map((issued, index) => {
    const flag = input.caseFlags?.[index] ?? defaultFlag(index)
    const header = issued.document.header
    const transferType = header.options.transferType ?? 1
    if (flag === 'voided')
      return { folio: issued.folio, transferType, date: header.issueDate, voided: 'guide', totalAmount: 0 }
    const net = header.totals.netAmount ?? 0
    const sale =
      transferType === 1
        ? compact({
            receiverRut: input.receiver.rut,
            receiverName: input.receiver.name,
            netAmount: net > 0 ? net : undefined,
            taxRate: net > 0 ? VAT_RATE : undefined,
            vatAmount: net > 0 ? header.totals.vatAmount : undefined,
          })
        : {}
    return compact({
      folio: issued.folio,
      transferType,
      date: header.issueDate,
      adjustment: flag === 'modified' ? ('add' as const) : undefined,
      ...sale,
      totalAmount: header.totals.totalAmount,
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
      submission: 'total',
    },
    entries,
    now: input.now?.(),
  })
  return signGuideBook(book, input.certificate)
}
