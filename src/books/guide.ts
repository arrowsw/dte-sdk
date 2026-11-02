import { isBookDocumentType, type BookSubmission } from '../catalogs/book-codes'
import type { Certificate } from '../certificate/certificate'
import { generateSetId } from '../envelope/create'
import { DteError } from '../errors'
import type {
  GuideBook,
  GuideBookCover,
  GuideBookCoverInput,
  GuideBookInput,
  GuideEntry,
  GuideEntryInput,
  GuideTotals,
  GuideTransferTotal,
} from '../model/book'
import { toSiiGuideBook } from '../model/book-codec'
import { compact } from '../model/codec'
import { toSiiRut } from '../model/rut'
import { signEnveloped, verifyEnveloped, type SignatureVerification, type XmlSignature } from '../signature/xmldsig'
import { assertMaxLength, sanitizeText } from '../text/sanitize'
import { chileTimestamp } from '../time/chile'
import {
  assertBookAmount,
  assertBookFolio,
  assertBookRate,
  assertBookZones,
  buildBookXml,
  normalizeBookCover,
  toBookDate,
} from './common'

const ROOT_TAG = 'LibroGuia'
const SIGNED_TAG = 'EnvioLibro'
const MAX_NAME = 50
const MIN_TRANSFER_TYPE = 1
// `TpoOper` stops at 7 in the schema, although `TotTraslado` admits 8 and 9.
const MAX_TRANSFER_TYPE = 7
const SALE: GuideEntry['transferType'] = 1

const EMPTY_TOTALS: GuideTotals = {
  voidedFolios: 0,
  voidedGuides: 0,
  saleGuides: 0,
  saleGuidesAmount: 0,
  modifiedAmount: 0,
  transfers: [],
}

const normalizeCover = (cover: GuideBookCoverInput): GuideBookCover => {
  if (cover.notificationFolio === undefined) throw new DteError('MISSING_FIELD', { field: 'cover.notificationFolio' })
  return { ...normalizeBookCover(cover), notificationFolio: cover.notificationFolio }
}

const validate = (input: GuideEntryInput, index: number): void => {
  assertBookFolio(input.folio, 'folio', index)
  const type = input.transferType
  if (type !== undefined && !(Number.isInteger(type) && type >= MIN_TRANSFER_TYPE && type <= MAX_TRANSFER_TYPE))
    throw new DteError('INVALID_OPTION', { field: 'transferType', index })
  if (input.referenceType !== undefined && !isBookDocumentType(input.referenceType))
    throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'referenceType', type: input.referenceType, index })
  if (input.referenceFolio !== undefined) assertBookFolio(input.referenceFolio, 'referenceFolio', index)
  for (const field of ['netAmount', 'vatAmount', 'totalAmount', 'modifiedAmount'] as const)
    assertBookAmount(input[field], { field, signed: false, index })
  assertBookRate(input.taxRate, 'taxRate', index)
}

const normalizeEntry = (input: GuideEntryInput, submission: BookSubmission, index: number): GuideEntry => {
  validate(input, index)
  const adjustment = input.adjustment ?? (submission === 'adjustment' ? 'add' : undefined)
  const shared = compact({
    folio: input.folio,
    voided: input.voided,
    adjustment,
    transferType: input.transferType,
    date: input.date === undefined ? undefined : toBookDate(input.date, 'date'),
  })
  if (input.voided === 'folio' || input.voided === 'guide')
    return { ...shared, taxRate: 0, vatAmount: 0, totalAmount: 0 }
  const name = input.receiverName === undefined ? undefined : sanitizeText(input.receiverName)
  if (name !== undefined) assertMaxLength(name, MAX_NAME, 'RznSoc')
  const net = input.netAmount ?? 0
  const taxRate = input.taxRate ?? 0
  const vatAmount = input.vatAmount || Math.round((net * taxRate) / 100)
  return compact({
    ...shared,
    receiverRut: input.receiverRut === undefined ? undefined : toSiiRut(input.receiverRut, 'receiverRut'),
    receiverName: name,
    netAmount: input.netAmount,
    taxRate,
    vatAmount,
    totalAmount: input.totalAmount ?? net + vatAmount,
    modifiedAmount: input.modifiedAmount,
    referenceType: input.referenceType,
    referenceFolio: input.referenceFolio,
    referenceDate: input.referenceDate === undefined ? undefined : toBookDate(input.referenceDate, 'referenceDate'),
  })
}

const mergeTransfers = (
  a: readonly GuideTransferTotal[],
  b: readonly GuideTransferTotal[],
): readonly GuideTransferTotal[] => {
  const merged = new Map<number, GuideTransferTotal>()
  for (const item of [...a, ...b]) {
    const seen = merged.get(item.type)
    merged.set(
      item.type,
      seen === undefined
        ? item
        : { type: item.type, count: seen.count + item.count, amount: seen.amount + item.amount },
    )
  }
  return [...merged.values()]
}

/**
 * EN: Adds two guide book summaries, the transfers by operation. Use it to carry the period totals of earlier submissions
 * forward.
 * ES: Suma dos resúmenes de libro de guías, los traslados por operación. Sirve para arrastrar los totales del período de
 * envíos anteriores.
 */
export const accumulateGuideTotals = (base: GuideTotals, delta: GuideTotals): GuideTotals => ({
  voidedFolios: base.voidedFolios + delta.voidedFolios,
  voidedGuides: base.voidedGuides + delta.voidedGuides,
  saleGuides: base.saleGuides + delta.saleGuides,
  saleGuidesAmount: base.saleGuidesAmount + delta.saleGuidesAmount,
  modifiedAmount: base.modifiedAmount + delta.modifiedAmount,
  transfers: mergeTransfers(base.transfers, delta.transfers),
})

const entryTotals = (entry: GuideEntry): GuideTotals => {
  const one = entry.adjustment === 'remove' ? -1 : 1
  if (entry.voided === 'folio') return { ...EMPTY_TOTALS, voidedFolios: one }
  if (entry.voided === 'guide') return { ...EMPTY_TOTALS, voidedGuides: one }
  const amount = 0 + one * entry.totalAmount
  const base = { ...EMPTY_TOTALS, modifiedAmount: 0 + one * (entry.modifiedAmount ?? 0) }
  if (entry.transferType === SALE) return { ...base, saleGuides: one, saleGuidesAmount: amount }
  return entry.transferType === undefined
    ? base
    : { ...base, transfers: [{ type: entry.transferType, count: one, amount }] }
}

const sumEntries = (entries: readonly GuideEntry[]): GuideTotals =>
  entries.map(entryTotals).reduce(accumulateGuideTotals, EMPTY_TOTALS)

/**
 * EN: Builds a guide book: validates the cover and the zones of its submission, normalizes the lines and computes the
 * summaries. `TasaImp` and `IVA` are always emitted, 0 when absent.
 * ES: Arma un libro de guías: valida la carátula y las zonas de su envío, normaliza las líneas y calcula los resúmenes.
 * `TasaImp` e `IVA` se emiten siempre, en 0 si faltan.
 * @throws {DteError} EN: `MISSING_FIELD`, `INVALID_OPTION`, `INVALID_RUT`, `INVALID_DATE`, `INVALID_DOCUMENT_TYPE`, `INVALID_FOLIO`, `INVALID_AMOUNT`, `FIELD_TOO_LONG`. ES: los mismos códigos.
 */
export const createGuideBook = (input: GuideBookInput): GuideBook => {
  const cover = normalizeCover(input.cover)
  const { submission } = cover
  const inputs = input.entries ?? []
  assertBookZones({
    submission,
    entryCount: inputs.length,
    hasPreviousTotals: input.previousTotals !== undefined,
    hasSummaryOnlyTotals: false,
  })
  const entries = inputs.map((entry, index) => normalizeEntry(entry, submission, index))
  const lineTotals = sumEntries(entries)
  const period = accumulateGuideTotals(input.previousTotals ?? EMPTY_TOTALS, lineTotals)
  const hasTotals = entries.length > 0 || input.previousTotals !== undefined
  return {
    id: input.id ?? generateSetId('LGD', input.now),
    cover,
    entries,
    segmentTotals: (submission === 'partial' || submission === 'adjustment') && entries.length > 0 ? lineTotals : null,
    periodTotals: submission === 'partial' || !hasTotals ? null : period,
    signedAt: chileTimestamp(input.now),
  }
}

/**
 * EN: Renders the unsigned `LibroGuia` XML.
 * ES: Renderiza el XML `LibroGuia` sin firma.
 */
export const buildGuideBookXml = (book: GuideBook): string =>
  buildBookXml({
    rootTag: ROOT_TAG,
    signedTag: SIGNED_TAG,
    schema: 'LibroGuia_v10.xsd',
    id: book.id,
    content: toSiiGuideBook(book),
  })

/**
 * EN: A guide book with its signed XML, ready for `uploadBook`.
 * ES: Un libro de guías con su XML firmado, listo para `uploadBook`.
 */
export type SignedGuideBook = GuideBook & {
  /** EN: Signed XML with prolog. ES: XML firmado con prólogo. */
  readonly xml: string
  /** EN: Digest and signature values. ES: Valores de digest y firma. */
  readonly signature: XmlSignature
}

/**
 * EN: Signs the `EnvioLibro` with the sender certificate (enveloped XMLDSig, `URI="#ID"`).
 * ES: Firma el `EnvioLibro` con el certificado de quien envía (XMLDSig envuelta, `URI="#ID"`).
 */
export const signGuideBook = (book: GuideBook, certificate: Certificate): SignedGuideBook => {
  const { xml, signature } = signEnveloped({
    xml: buildGuideBookXml(book),
    elementTag: SIGNED_TAG,
    rootTag: ROOT_TAG,
    certificate,
  })
  return { ...book, xml, signature }
}

/**
 * EN: Verifies the signature of a `LibroGuia` XML.
 * ES: Verifica la firma de un XML `LibroGuia`.
 */
export const verifyGuideBookSignature = (xml: string): SignatureVerification =>
  verifyEnveloped(xml, { elementTag: SIGNED_TAG, rootTag: ROOT_TAG })
