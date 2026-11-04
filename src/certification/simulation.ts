import type { DocumentType } from '../catalogs/document-types'
import type { SignedEnvelope } from '../envelope/sign'
import { DteError } from '../errors'
import type { ReferenceInput } from '../model/document'
import { chileDate } from '../time/chile'
import {
  exemptAll,
  guideOptions,
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

const basicLikeItems = (
  context: IssueContext,
  kind: 'basic' | 'exempt',
  note: PlannedNote,
  referenced: IssuedRecord | undefined,
): readonly PlannedItem[] => {
  const exempt = kind === 'exempt'
  const mark = (items: readonly PlannedItem[]): readonly PlannedItem[] => (exempt ? exemptAll(items) : items)
  const upper = note.reasonText.toUpperCase()
  const fromCase = note.itemsFromCase === null ? undefined : context.records.get(note.itemsFromCase)
  if (fromCase !== undefined) return mark(fromCase.items)
  if (note.items.length === 0)
    return [
      exempt
        ? { name: note.reasonText || CORRECTION, quantity: 1, unitPrice: 0, exempt: true }
        : { name: note.reasonText || CORRECTION, quantity: 1, unitPrice: 0 },
    ]
  if (note.referenceCode === 3 && referenced !== undefined) {
    if (upper.includes('DEVOLUCION')) return mark(referenced.items)
    if (upper.includes('MODIFICA MONTO'))
      return mark(
        note.items.map((item) => {
          const original = referenced.items.find((candidate) => sameName(candidate.name, item.name))
          return original === undefined ? item : { ...item, quantity: original.quantity }
        }),
      )
  }
  return mark(note.items)
}

const purchaseItems = (note: PlannedNote, referenced: IssuedRecord | undefined): readonly PlannedItem[] =>
  note.items.map((item) => {
    const original = referenced?.items.find((candidate) => candidate.name === item.name)
    return { ...item, unitPrice: item.unitPrice || original?.unitPrice || 1 }
  })

/**
 * EN: Issues every case of the four set plans again with fresh folios, in the order basic, exempt, guide and purchase,
 * and signs one envelope with all of them. As the field does for the simulation: no SET reference; a note carries one
 * reference to its referenced document when that case is in the simulation; the global discount has no description;
 * the receiver is the issuer on purchase documents and internal transfers; a note with no items gets one line named
 * after its reason; a purchase note item without a price takes the original's price, or 1.
 * ES: Reemite cada caso de los cuatro planes con folios nuevos, en el orden básico, exento, guías y compra, y firma un
 * solo sobre con todos. Como el campo en la simulación: sin referencia SET; una nota lleva una referencia a su documento
 * referido cuando ese caso está en la simulación; el descuento global no lleva glosa; el receptor es el emisor en los
 * documentos de compra y los traslados internos; una nota sin ítems lleva una línea con su razón; un ítem de nota de
 * compra sin precio toma el del original, o 1.
 * @param plan EN: the plan of `planCertificationSets`. ES: el plan de `planCertificationSets`.
 * @param options EN: as for `issueTestSet`; the folio source should hold CAFs other than the sets'. ES: como en `issueTestSet`; la fuente de folios debería traer CAF distintos de los de los sets.
 * @throws {DteError} EN: `MISSING_FIELD` (`cases`) when the plan has no case, `FOLIO_OUT_OF_RANGE` from the folio source, and the phase 1 codes. ES: `MISSING_FIELD` (`cases`) si el plan no tiene casos, `FOLIO_OUT_OF_RANGE` de la fuente de folios, y los códigos de la fase 1.
 */
export const issueSimulation = async (plan: CertificationPlan, options: IssueSetOptions): Promise<IssuedSimulation> => {
  const now = options.now?.() ?? new Date()
  const context: IssueContext = { options, now, date: chileDate(now), records: new Map(), issued: [] }
  const issuer = issuerAsReceiver(options.issuer)

  for (const set of [plan.basic, plan.exempt]) {
    if (set === undefined) continue
    const invoiceType: DocumentType = set.kind === 'basic' ? 33 : 34
    for (const invoice of set.invoices)
      await issueCertificationDocument(context, {
        caseId: invoice.caseId,
        type: invoiceType,
        items: invoice.items,
        style: 'plain',
        references: [],
        globalDiscountPercent: invoice.globalDiscountPercent,
        globalDiscountDescription: false,
        options: set.kind === 'basic' ? { saleTransactionType: 1 } : undefined,
        record: true,
      })
    for (const [type, notes] of [
      [61, set.creditNotes],
      [56, set.debitNotes],
    ] as const)
      for (const note of notes) {
        const referenced = referencedOf(context, note)
        await issueCertificationDocument(context, {
          caseId: note.caseId,
          type,
          items: basicLikeItems(context, set.kind, note, referenced),
          style: 'plain',
          references: noteReference(referenced, note),
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
      options: guideOptions(guide),
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
      record: true,
    })
    for (const [type, note] of [
      [61, creditNote],
      [56, debitNote],
    ] as const) {
      if (note === null) continue
      const referenced = referencedOf(context, note)
      await issueCertificationDocument(context, {
        caseId: note.caseId,
        type,
        items: purchaseItems(note, referenced),
        style: 'purchase',
        receiver: issuer,
        references: noteReference(referenced, note),
        withholdVat: true,
        record: true,
      })
    }
  }
  if (context.issued.length === 0) throw new DteError('MISSING_FIELD', { field: 'cases' })
  const envelope = signCertificationEnvelope(
    context.issued.map((issued) => issued.document),
    options,
    now,
    undefined,
  )
  const types = [...new Set(context.issued.map((issued) => issued.type))]
  return { cases: context.issued, envelope, types, fewerThanRecommended: context.issued.length < RECOMMENDED_MINIMUM }
}
