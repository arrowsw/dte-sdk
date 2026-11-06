import { VAT_RATE, type TransferType } from '../catalogs/codes'
import type { DocumentType } from '../catalogs/document-types'
import type { SignedEnvelope } from '../envelope/sign'
import { DteError } from '../errors'
import type { IssuerInput, ReceiverInput, ReferenceInput, Totals } from '../model/document'
import { calculateLineAmount } from '../totals/calculate'
import {
  exemptAll,
  isInternalTransfer,
  issueCertificationDocument,
  issuerAsReceiver,
  sameName,
  signCertificationEnvelope,
  type IssueContext,
  type IssueSetOptions,
  type IssuedCase,
  type IssuedRecord,
} from './issue-set'
import type { CertificationPlan, PlannedItem, PlannedNote } from './set-plan'

/**
 * EN: The simulation: every case of the four sets issued again, in one envelope.
 * ES: La simulación: cada caso de los cuatro sets reemitido, en un sobre.
 */
export type IssuedSimulation = {
  /** EN: Every issued document, in issue order. ES: Cada documento emitido, en orden de emisión. */
  readonly cases: readonly IssuedCase[]
  /** EN: The signed envelope with all the documents. ES: `EnvioDTE` — El sobre firmado con todos los documentos. */
  readonly envelope: SignedEnvelope
  /** EN: Document types in the envelope, in order of first appearance. ES: Tipos de documento del sobre, en orden de aparición. */
  readonly types: readonly DocumentType[]
  /** EN: True with fewer than the ten documents the SII asks for. ES: True con menos de los diez documentos que pide el SII. */
  readonly fewerThanRecommended: boolean
}

const RECOMMENDED_MINIMUM = 10
const CORRECTION = 'CORRECCION'

const pad = (value: number, width = 2): string => String(value).padStart(width, '0')

// The simulation runs on the clock of the process, as the reference does and unlike the test sets: the issue date is
// the day of the machine the run starts on, the stamps are the UTC instant to the second, and the envelope is named
// after the machine's clock when it is signed. Only `TmstFirmaEnv` is Chile time, written by the envelope itself.
const localDate = (at: Date): string => `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
const utcSeconds = (at: Date): string => at.toISOString().slice(0, 19)
const localSetId = (at: Date): string =>
  `DTE_SetDoc_${pad(at.getDate())}_${pad(at.getMonth() + 1)}_${at.getFullYear()}_${pad(at.getHours())}_${pad(at.getMinutes())}_${pad(at.getSeconds())}_${pad(at.getMilliseconds(), 3)}`

// The simulation writes a fixed list of party fields; whatever else the caller gave the run (phone, email, branch,
// contact) stays out of its documents.
const simulationIssuer = (issuer: IssuerInput): IssuerInput => ({
  rut: issuer.rut,
  businessName: issuer.businessName,
  businessActivity: issuer.businessActivity,
  ...(issuer.activityCode === undefined ? {} : { activityCode: issuer.activityCode }),
  address: issuer.address,
  commune: issuer.commune,
  ...(issuer.city === undefined ? {} : { city: issuer.city }),
})

const simulationReceiver = (receiver: ReceiverInput): ReceiverInput => ({
  rut: receiver.rut,
  businessName: receiver.businessName,
  ...(receiver.businessActivity === undefined ? {} : { businessActivity: receiver.businessActivity }),
  address: receiver.address,
  commune: receiver.commune,
  city: receiver.city ?? receiver.commune,
})

const referencedOf = (context: IssueContext, note: PlannedNote): IssuedRecord | undefined =>
  note.referencedCase === null ? undefined : context.records.get(note.referencedCase)

const noteReference = (referenced: IssuedRecord | undefined, note: PlannedNote): readonly ReferenceInput[] =>
  referenced === undefined
    ? []
    : [
        {
          documentType: referenced.type,
          folio: referenced.folio,
          date: referenced.date,
          code: note.referenceCode,
          reason: note.reasonText,
        },
      ]

const sameTrimmed = (a: string, b: string): boolean => a.trim() === b.trim()

const basicLikeItems = (
  kind: 'basic' | 'exempt',
  note: PlannedNote,
  referenced: IssuedRecord | undefined,
): readonly PlannedItem[] => {
  const exempt = kind === 'exempt'
  const mark = (items: readonly PlannedItem[]): readonly PlannedItem[] => (exempt ? exemptAll(items) : items)
  const upper = note.reasonText.toUpperCase()
  // A cancellation takes the items of the document it cancels. The field reads the word as the text gives it, in
  // capitals: a lower-case "anula" is not one.
  const own =
    referenced !== undefined && note.itemsFromCase !== null && note.reasonText.includes('ANULA')
      ? referenced.items
      : note.items
  const items: readonly PlannedItem[] =
    own.length > 0
      ? own
      : [
          exempt
            ? { name: note.reasonText || CORRECTION, quantity: 1, unitPrice: 0, exempt: true }
            : { name: note.reasonText || CORRECTION, quantity: 1, unitPrice: 0 },
        ]
  if (note.referenceCode === 3 && referenced !== undefined) {
    if (upper.includes('DEVOLUCION') || upper.includes('DEVOLUCIÓN')) return mark(referenced.items)
    if (upper.includes('MODIFICA MONTO'))
      return mark(
        items.map((item) => {
          const original = referenced.items.find((candidate) => sameName(candidate.name, item.name))
          return original?.quantity ? { ...item, quantity: original.quantity } : item
        }),
      )
  }
  return mark(items)
}

// A purchase note item with no price takes the price of the same-named item of the document it references, or 1. A
// note whose document is not in the simulation keeps its items as they are.
const purchaseItems = (note: PlannedNote, referenced: IssuedRecord | undefined): readonly PlannedItem[] =>
  referenced === undefined
    ? note.items
    : note.items.map((item) => {
        const original = referenced.items.find((candidate) => sameTrimmed(candidate.name, item.name))
        return { ...item, unitPrice: item.unitPrice || original?.unitPrice || 1 }
      })

// The totals of an invoice, credit note or debit note of the basic or the exempt set: the net after the global
// discount, the exempt, the VAT on the net. With nothing to add up the total stands alone, with no VAT rate.
const generalTotals = (items: readonly PlannedItem[], globalDiscountPercent: number | undefined): Totals => {
  const sums = items.reduce(
    (acc, item) => {
      const base = Math.round((item.quantity || 1) * item.unitPrice)
      const discountPercent = item.discountPercent ?? 0
      const line = base - (discountPercent > 0 ? Math.round(base * (discountPercent / 100)) : 0)
      return item.exempt === true ? { ...acc, exempt: acc.exempt + line } : { ...acc, net: acc.net + line }
    },
    { net: 0, exempt: 0 },
  )
  const net = globalDiscountPercent
    ? Math.max(0, sums.net - Math.round(sums.net * (globalDiscountPercent / 100)))
    : sums.net
  const vat = Math.round(net * (VAT_RATE / 100))
  return {
    ...(net > 0 ? { netAmount: net } : {}),
    ...(sums.exempt > 0 ? { exemptAmount: sums.exempt } : {}),
    ...(net > 0 ? { vatRate: VAT_RATE, vatAmount: vat } : {}),
    totalAmount: net + vat + sums.exempt,
  }
}

// A purchase note whose lines add up to nothing totals 0 with no VAT rate; any other total is the one computed.
const purchaseTotals = (items: readonly PlannedItem[]): Totals | undefined =>
  items.every((item) => calculateLineAmount(item).amount === 0) ? { totalAmount: 0 } : undefined

/**
 * EN: Issues every case of the four set plans again with fresh folios, in the order basic, exempt, guide and purchase,
 * and signs one envelope with all of them. As the field does for the simulation: no SET reference; a note carries one
 * reference to its referenced document when that case is in the simulation; the global discount has no description;
 * the receiver is the issuer on purchase documents and internal transfers; a note with no items gets one line named
 * after its reason; a purchase note item without a price takes the original's price, or 1; a guide carries the
 * transfer reason and no dispatch type; a document whose lines add up to nothing totals 0 with no VAT rate (a guide
 * keeps it). Unlike the test sets it runs on the clock of the process: the issue date is the local day, `TSTED` and
 * `TmstFirma` the UTC instant to the second, the envelope id the local time, and only `TmstFirmaEnv` is Chile time.
 * ES: Reemite cada caso de los cuatro planes con folios nuevos, en el orden básico, exento, guías y compra, y firma un
 * solo sobre con todos. Como el campo en la simulación: sin referencia SET; una nota lleva una referencia a su documento
 * referido cuando ese caso está en la simulación; el descuento global no lleva glosa; el receptor es el emisor en los
 * documentos de compra y los traslados internos; una nota sin ítems lleva una línea con su razón; un ítem de nota de
 * compra sin precio toma el del original, o 1; una guía lleva el `IndTraslado` y no el `TipoDespacho`; un documento
 * cuyas líneas suman cero totaliza `MntTotal` 0 sin `TasaIVA` (la guía la conserva). A diferencia de los sets de prueba
 * corre con el reloj del proceso: `FchEmis` es el día local, `TSTED` y `TmstFirma` el instante UTC al segundo, el id
 * del sobre la hora local, y solo `TmstFirmaEnv` es hora de Chile.
 * @param plan EN: the plan of `planCertificationSets`. ES: el plan de `planCertificationSets`.
 * @param options EN: as for `issueTestSet`; the folio source should hold CAFs other than the sets'. ES: como en `issueTestSet`; la fuente de folios debería traer CAF distintos de los de los sets.
 * @throws {DteError} EN: `MISSING_FIELD` (`cases`) when the plan has no case, `FOLIO_OUT_OF_RANGE` from the folio source, and the phase 1 codes. ES: `MISSING_FIELD` (`cases`) si el plan no tiene casos, `FOLIO_OUT_OF_RANGE` de la fuente de folios, y los códigos de la fase 1.
 */
export const issueSimulation = async (plan: CertificationPlan, options: IssueSetOptions): Promise<IssuedSimulation> => {
  const clock = options.now ?? (() => new Date())
  const given = { ...options, issuer: simulationIssuer(options.issuer), receiver: simulationReceiver(options.receiver) }
  const context: IssueContext = {
    options: given,
    clock,
    date: localDate(clock()),
    stamp: utcSeconds,
    records: new Map(),
    issued: [],
  }
  const issuer = issuerAsReceiver(given.issuer)

  for (const set of [plan.basic, plan.exempt]) {
    if (set === undefined) continue
    const invoiceType: DocumentType = set.kind === 'basic' ? 33 : 34
    for (const invoice of set.invoices) {
      const globalDiscountPercent = invoice.globalDiscountPercent || undefined
      await issueCertificationDocument(context, {
        caseId: invoice.caseId,
        type: invoiceType,
        items: invoice.items,
        style: 'plain',
        references: [],
        globalDiscountPercent,
        globalDiscountDescription: false,
        options: set.kind === 'basic' ? { saleTransactionType: 1 } : undefined,
        totals: generalTotals(invoice.items, globalDiscountPercent),
        record: true,
      })
    }
    for (const [type, notes] of [
      [61, set.creditNotes],
      [56, set.debitNotes],
    ] as const)
      for (const note of notes) {
        const referenced = referencedOf(context, note)
        const items = basicLikeItems(set.kind, note, referenced)
        await issueCertificationDocument(context, {
          caseId: note.caseId,
          type,
          items,
          style: 'plain',
          references: noteReference(referenced, note),
          totals: generalTotals(items, undefined),
          record: true,
        })
      }
  }
  for (const guide of plan.guide?.guides ?? [])
    await issueCertificationDocument(context, {
      caseId: guide.caseId,
      type: 52,
      items: guide.items,
      style: 'guide',
      receiver: isInternalTransfer(guide) ? issuer : undefined,
      references: [],
      // The dispatch type is not written: the field's guide carries the transfer reason alone.
      options: { transferType: guide.transferReason as TransferType },
      record: true,
    })
  if (plan.purchase !== undefined) {
    const { invoice, creditNote, debitNote } = plan.purchase
    await issueCertificationDocument(context, {
      caseId: invoice.caseId,
      type: 46,
      items: invoice.items,
      style: 'purchase',
      receiver: issuer,
      references: [],
      totals: purchaseTotals(invoice.items),
      record: true,
    })
    for (const [type, note] of [
      [61, creditNote],
      [56, debitNote],
    ] as const) {
      if (note === null) continue
      const referenced = referencedOf(context, note)
      const items = purchaseItems(note, referenced)
      await issueCertificationDocument(context, {
        caseId: note.caseId,
        type,
        items,
        style: 'purchase',
        receiver: issuer,
        references: noteReference(referenced, note),
        withholdVat: true,
        totals: purchaseTotals(items),
        record: true,
      })
    }
  }
  if (context.issued.length === 0) throw new DteError('MISSING_FIELD', { field: 'cases' })
  const sealedAt = clock()
  const envelope = signCertificationEnvelope(
    context.issued.map((issued) => issued.document),
    given,
    sealedAt,
    localSetId(sealedAt),
  )
  const types = [...new Set(context.issued.map((issued) => issued.type))]
  return { cases: context.issued, envelope, types, fewerThanRecommended: context.issued.length < RECOMMENDED_MINIMUM }
}
