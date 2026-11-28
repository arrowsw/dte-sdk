import { VAT_RATE, type TransferType } from '../catalogs/codes'
import type { DocumentType } from '../catalogs/document-types'
import type { SignedEnvelope } from '../envelope/sign'
import { DteError } from '../errors'
import type { IssuerInput, ReceiverInput, ReferenceInput, Totals } from '../model/document'
import { adjustmentShare } from '../totals/calculate'
import {
  exemptAll,
  isInternalTransfer,
  issueCertificationDocument,
  issueExports,
  issuerAsReceiver,
  plannedAmount,
  sameName,
  settlementDocument,
  signCertificationEnvelope,
  totaledItems,
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
  /** EN: How many passes over the plan the envelope holds (`simulationPasses`). ES: Cuántas pasadas por el plan trae el sobre (`simulationPasses`). */
  readonly passes: number
  /** EN: True with fewer than the ten documents the SII asks for. ES: True con menos de los diez documentos que pide el SII. */
  readonly fewerThanRecommended: boolean
  /** EN: True when the envelope holds fewer than 20 or more than 100 documents (`outsideDeclarableSize`), which the passes still leave to happen with a `minimumDocuments` below 20 or a single pass of more than 100: the run still sends it, and says so in the portal client's logger before it asks for the folios of the simulation. ES: True cuando el sobre trae menos de 20 o más de 100 documentos (`outsideDeclarableSize`), lo que las pasadas aún dejan ocurrir con un `minimumDocuments` bajo 20 o con una sola pasada de más de 100: la corrida lo envía igual, y lo dice en el logger del cliente del portal antes de pedir los folios de la simulación. */
  readonly outsideDeclarableSize: boolean
}

const RECOMMENDED_MINIMUM = 10
const DECLARABLE_MINIMUM = 20
const DECLARABLE_MAXIMUM = 100

/**
 * EN: True when a simulation envelope of this many documents is outside 20 to 100. The 100 is the maximum the SII's
 * certification manual states for the simulation ("Manual para empresas usuarias, ambiente de certificación factura
 * electrónica", 2 February 2009, page 27: "con un máximo de 100 documentos"); the 20 is field behaviour: the "Declarar
 * avance" form asks of the simulation envelope for 20 to 100 documents, above the minimum of 10 the manual gives a
 * company with little billing (`fewerThanRecommended`). The simulation repeats its pass over the plan to reach 20 by
 * default (`simulationPasses`), so an envelope outside is one issued with a `minimumDocuments` below 20, or one whose
 * single pass holds more than 100. Internal.
 * ES: True cuando un sobre de simulación con esta cantidad de documentos queda fuera de 20 a 100. El 100 es el máximo
 * que el manual de certificación del SII da para la simulación ("Manual para empresas usuarias, ambiente de
 * certificación factura electrónica", 2 de febrero de 2009, página 27: "con un máximo de 100 documentos"); el 20 es
 * comportamiento del campo: el formulario "Declarar avance" pide del sobre de simulación de 20 a 100 documentos, sobre
 * el mínimo de 10 que el manual da a una empresa con poca facturación (`fewerThanRecommended`). La simulación repite su
 * pasada por el plan para llegar a 20 por defecto (`simulationPasses`), así que un sobre fuera es uno emitido con un
 * `minimumDocuments` bajo 20, o uno cuya única pasada trae más de 100. Interno.
 * @param documents EN: the documents in the envelope. ES: los documentos del sobre.
 */
export const outsideDeclarableSize = (documents: number): boolean =>
  documents < DECLARABLE_MINIMUM || documents > DECLARABLE_MAXIMUM

const CORRECTION = 'CORRECCION'

const pad = (value: number, width = 2): string => String(value).padStart(width, '0')

// The simulation runs on the clock of the process, unlike the test sets: the issue date is the day of the machine the
// run starts on, the stamps are the UTC instant to the second, and the envelope is named after the machine's clock when
// it is signed. Only `TmstFirmaEnv` is Chile time, written by the envelope itself.
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
// discount, the exempt, the VAT on the net. With nothing to add up the total stands alone, with no VAT rate. Each line
// is the amount `createDocument` writes for it, and the global discount and the VAT are worked out as `calculateTotals`
// works them out, so the totals are the ones of the lines.
const generalTotals = (items: readonly PlannedItem[], globalDiscountPercent: number | undefined): Totals => {
  const sums = items.reduce(
    (acc, item) => {
      const line = plannedAmount(item).amount
      return item.exempt === true ? { ...acc, exempt: acc.exempt + line } : { ...acc, net: acc.net + line }
    },
    { net: 0, exempt: 0 },
  )
  const net = globalDiscountPercent
    ? Math.max(0, sums.net - adjustmentShare(sums.net, { valueType: 'percent', value: globalDiscountPercent }))
    : sums.net
  const vat = Math.round((net * VAT_RATE) / 100)
  return {
    ...(net > 0 ? { netAmount: net } : {}),
    ...(sums.exempt > 0 ? { exemptAmount: sums.exempt } : {}),
    ...(net > 0 ? { vatRate: VAT_RATE, vatAmount: vat } : {}),
    totalAmount: net + vat + sums.exempt,
  }
}

// A purchase note whose lines add up to nothing totals 0 with no VAT rate; any other total is the one computed.
const purchaseTotals = (items: readonly PlannedItem[]): Totals | undefined =>
  items.every((item) => plannedAmount(item).amount === 0) ? { totalAmount: 0 } : undefined

// One pass over the plan: every case of every set it holds, in the order of the simulation. The records start empty, so
// a note of the pass refers to the document of its own pass.
const issuePass = async (context: IssueContext, plan: CertificationPlan, issuer: ReceiverInput): Promise<void> => {
  context.records.clear()
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
        const references = noteReference(referenced, note)
        await issueCertificationDocument(context, {
          caseId: note.caseId,
          type,
          items,
          style: 'plain',
          references,
          unreferencedNote: true,
          totals: generalTotals(totaledItems(type, references, items), undefined),
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
      const references = noteReference(referenced, note)
      await issueCertificationDocument(context, {
        caseId: note.caseId,
        type,
        items,
        style: 'purchase',
        receiver: issuer,
        references,
        unreferencedNote: true,
        withholdVat: true,
        totals: purchaseTotals(totaledItems(type, references, items)),
        record: true,
      })
    }
  }
  // The settlement set, when the run sent it: each settlement invoice as the set issued it, less the SET reference.
  for (const settlement of plan.settlement?.settlements ?? [])
    await issueCertificationDocument(context, settlementDocument(settlement, []))
  // The export sets, when the run sent them: each document as its set issued it, less the SET reference.
  for (const set of [plan.export1, plan.export2]) if (set !== undefined) await issueExports(context, set, true)
}

/**
 * EN: Options of `issueSimulation`: those of `issueTestSet`, and the fewest documents the envelope holds.
 * ES: Opciones de `issueSimulation`: las de `issueTestSet`, y la menor cantidad de documentos que trae el sobre.
 */
export type IssueSimulationOptions = IssueSetOptions & {
  /** EN: The fewest documents the envelope holds, a whole number from 0 to 100; 20 by default, what the "Declarar avance" form takes as field behaviour (`outsideDeclarableSize`). A pass over the plan that holds fewer is repeated whole until the envelope holds that many, never past 100 documents (`simulationPasses`); 0, or any number one pass already reaches, issues one pass. ES: La menor cantidad de documentos que trae el sobre, un entero de 0 a 100; 20 por defecto, lo que toma el formulario "Declarar avance" como comportamiento de campo (`outsideDeclarableSize`). Una pasada por el plan que trae menos se repite entera hasta que el sobre trae esa cantidad, nunca más de 100 documentos (`simulationPasses`); 0, o cualquier número que una pasada ya alcanza, emite una pasada. */
  readonly minimumDocuments?: number
}

/**
 * EN: How many passes over the plan the simulation issues when one pass holds this many documents: one when the pass
 * holds the minimum (20 by default) or nothing, else the fewest that reach it, cut to as many as fit in the 100
 * documents the SII's certification manual gives as the maximum (`outsideDeclarableSize`), and never fewer than one.
 * Internal: the simulation and its folio needs share it.
 * ES: Cuántas pasadas por el plan emite la simulación cuando una pasada trae esta cantidad de documentos: una cuando
 * la pasada trae el mínimo (20 por defecto) o nada, si no las menos que lo alcanzan, recortadas a las que caben en los
 * 100 documentos que el manual de certificación del SII da como máximo (`outsideDeclarableSize`), y nunca menos de una.
 * Interno: la simulación y sus necesidades de folios lo comparten.
 * @param documents EN: the documents of one pass. ES: los documentos de una pasada.
 * @param minimum EN: as `minimumDocuments`. ES: como `minimumDocuments`.
 * @throws {DteError} EN: `INVALID_OPTION { field: 'minimumDocuments' }` for a minimum that is not a whole number from 0 to 100. ES: `INVALID_OPTION { field: 'minimumDocuments' }` por un mínimo que no es un entero de 0 a 100.
 */
export const simulationPasses = (documents: number, minimum: number = DECLARABLE_MINIMUM): number => {
  if (!Number.isInteger(minimum) || minimum < 0 || minimum > DECLARABLE_MAXIMUM)
    throw new DteError('INVALID_OPTION', { field: 'minimumDocuments' })
  if (documents === 0 || documents >= minimum) return 1
  return Math.max(1, Math.min(Math.ceil(minimum / documents), Math.floor(DECLARABLE_MAXIMUM / documents)))
}

/**
 * EN: The issue date the documents of a simulation issued at this instant carry: the local day of the process.
 * Internal.
 * ES: `FchEmis` — La fecha de emisión que llevan los documentos de una simulación emitida en este instante: el día
 * local del proceso. Interno.
 */
export const simulationIssueDate = (at: Date): string => localDate(at)

/**
 * EN: Issues every case of the four set plans again with fresh folios, in the order basic, exempt, guide and purchase,
 * then the settlement invoices of the settlement set and the documents of the export sets when the plan holds them,
 * each as its set issues it less its SET reference, and signs one envelope with all of them. That is one pass: when it
 * holds fewer documents than `minimumDocuments` (20 by default) it is repeated whole, each pass with folios of its own
 * and each note referring to the document of its own pass, until the envelope holds that many, never past 100
 * (`simulationPasses`); a pass that holds the minimum is issued alone, as it was before passes. As the field does for
 * the simulation: no SET reference; a note carries one
 * reference to its referenced document when that case is in the simulation; the global discount has no description;
 * the receiver is the issuer on purchase documents and internal transfers; a note with no items gets one line named
 * after its reason; a purchase note item without a price takes the original's price, or 1; a guide carries the
 * transfer reason and no dispatch type; a document whose lines add up to nothing totals 0 with no VAT rate (a guide
 * keeps it). Unlike the test sets it runs on the clock of the process: the issue date is the local day, `TSTED` and
 * `TmstFirma` the UTC instant to the second, the envelope id the local time, and only `TmstFirmaEnv` is Chile time.
 * ES: Reemite cada caso de los cuatro planes con folios nuevos, en el orden básico, exento, guías y compra, luego las
 * liquidaciones factura del set de liquidación y los documentos de los sets de exportación cuando el plan los trae,
 * cada uno como lo emite su set menos su referencia SET, y firma un solo sobre con todos. Esa es una pasada: cuando
 * trae menos documentos que `minimumDocuments` (20 por defecto) se repite entera, cada pasada con folios propios y cada
 * nota refiriendo al documento de su propia pasada, hasta que el sobre trae esa cantidad, nunca más de 100
 * (`simulationPasses`); una pasada que trae el mínimo se emite sola, como antes de las pasadas. Como el campo en la
 * simulación: sin referencia SET; una nota lleva una referencia a su documento
 * referido cuando ese caso está en la simulación; el descuento global no lleva glosa; el receptor es el emisor en los
 * documentos de compra y los traslados internos; una nota sin ítems lleva una línea con su razón; un ítem de nota de
 * compra sin precio toma el del original, o 1; una guía lleva el `IndTraslado` y no el `TipoDespacho`; un documento
 * cuyas líneas suman cero totaliza `MntTotal` 0 sin `TasaIVA` (la guía la conserva). A diferencia de los sets de prueba
 * corre con el reloj del proceso: `FchEmis` es el día local, `TSTED` y `TmstFirma` el instante UTC al segundo, el id
 * del sobre la hora local, y solo `TmstFirmaEnv` es hora de Chile.
 * @param plan EN: the plan of `planCertificationSets`. ES: el plan de `planCertificationSets`.
 * @param options EN: as for `issueTestSet`, and `minimumDocuments`; the folio source should hold CAFs other than the sets'. ES: como en `issueTestSet`, y `minimumDocuments`; la fuente de folios debería traer CAF distintos de los de los sets.
 * @throws {DteError} EN: `MISSING_FIELD` (`cases`) when the plan has no case, `INVALID_OPTION { field: 'minimumDocuments' }` before any folio is taken, `FOLIO_OUT_OF_RANGE` from the folio source, and the phase 1 codes. ES: `MISSING_FIELD` (`cases`) si el plan no tiene casos, `INVALID_OPTION { field: 'minimumDocuments' }` antes de tomar cualquier folio, `FOLIO_OUT_OF_RANGE` de la fuente de folios, y los códigos de la fase 1.
 */
export const issueSimulation = async (
  plan: CertificationPlan,
  options: IssueSimulationOptions,
): Promise<IssuedSimulation> => {
  const { minimumDocuments, ...rest } = options
  // A minimum that is not one stops here, before any folio is taken.
  simulationPasses(0, minimumDocuments)
  const clock = rest.now ?? (() => new Date())
  const given = { ...rest, issuer: simulationIssuer(rest.issuer), receiver: simulationReceiver(rest.receiver) }
  const context: IssueContext = {
    options: given,
    clock,
    date: localDate(clock()),
    stamp: utcSeconds,
    records: new Map(),
    issued: [],
  }
  const issuer = issuerAsReceiver(given.issuer)
  await issuePass(context, plan, issuer)
  const perPass = context.issued.length
  if (perPass === 0) throw new DteError('MISSING_FIELD', { field: 'cases' })
  const passes = simulationPasses(perPass, minimumDocuments)
  for (let pass = 1; pass < passes; pass += 1) await issuePass(context, plan, issuer)
  const sealedAt = clock()
  const envelope = signCertificationEnvelope(
    context.issued.map((issued) => issued.document),
    given,
    sealedAt,
    localSetId(sealedAt),
  )
  const types = [...new Set(context.issued.map((issued) => issued.type))]
  return {
    cases: context.issued,
    envelope,
    types,
    passes,
    fewerThanRecommended: context.issued.length < RECOMMENDED_MINIMUM,
    outsideDeclarableSize: outsideDeclarableSize(context.issued.length),
  }
}
