import { SII_RUT } from '../catalogs/codes'
import { isReceipt, type DocumentType } from '../catalogs/document-types'
import type { SignedDocument } from '../document/sign'
import { DteError } from '../errors'
import type { EnvelopeCover, EnvelopeCoverInput, EnvelopeSubtotal } from '../model/cover'
import { toSiiRut } from '../model/rut'
import { chileDateTimeParts, chileTimestamp, toIsoDate } from '../time/chile'

/**
 * EN: `dte` → `EnvioDTE` (invoices, guides, notes…); `receipt` → `EnvioBOLETA` (39, 41).
 * ES: `dte` → `EnvioDTE` (facturas, guías, notas…); `receipt` → `EnvioBOLETA` (boletas 39, 41).
 */
export type EnvelopeKind = 'dte' | 'receipt'

/**
 * EN: An envelope ready to render and sign.
 * ES: Un sobre listo para renderizar y firmar.
 */
export type Envelope = {
  readonly kind: EnvelopeKind
  /** EN: `SetDTE/@ID`. ES: `SetDTE/@ID` — Identificador del set. */
  readonly setId: string
  readonly cover: EnvelopeCover
  readonly documents: readonly SignedDocument[]
}

/**
 * EN: Input of `createEnvelope`.
 * ES: Entrada de `createEnvelope`.
 */
export type CreateEnvelopeInput = {
  readonly kind: EnvelopeKind
  readonly documents: readonly SignedDocument[]
  readonly cover: EnvelopeCoverInput
  /** EN: Clock for the set id and `TmstFirmaEnv`. ES: Reloj para el id del set y `TmstFirmaEnv`. */
  readonly now?: Date
}

// Convention for SetDTE ids: prefix + Chile-local date/time + milliseconds, unique within a process.
const SUBTOTAL_PRIORITY: readonly number[] = [33, 61, 56]

/**
 * EN: `PREFIX_dd_mm_yyyy_hh_mm_ss_mmm` in Chile time.
 * ES: `PREFIJO_dd_mm_aaaa_hh_mm_ss_mmm` en hora de Chile.
 */
export const generateSetId = (prefix: string, now: Date = new Date()): string => {
  const p = chileDateTimeParts(now)
  return `${prefix}_${p.day}_${p.month}_${p.year}_${p.hour}_${p.minute}_${p.second}_${String(now.getMilliseconds()).padStart(3, '0')}`
}

const countByType = (documents: readonly SignedDocument[]): readonly EnvelopeSubtotal[] => {
  const counts = new Map<DocumentType, number>()
  for (const document of documents) counts.set(document.header.type, (counts.get(document.header.type) ?? 0) + 1)
  return Array.from(counts, ([type, count]) => ({ type, count }))
}

const rank = (type: number): number => {
  const index = SUBTOTAL_PRIORITY.indexOf(type)
  return index === -1 ? SUBTOTAL_PRIORITY.length + type : index
}

/**
 * EN: Groups signed documents under a cover: validates the kind, normalizes RUTs and the resolution date, counts
 * documents per type (`SubTotDTE`, with 33/61/56 first on `EnvioDTE`) and generates the set id.
 * ES: Agrupa documentos firmados bajo una carátula: valida el tipo de sobre, normaliza RUT y fecha de resolución,
 * cuenta documentos por tipo (`SubTotDTE`, con 33/61/56 primero en `EnvioDTE`) y genera el id del set.
 * @throws {DteError} EN: `ENVELOPE_EMPTY`, `ENVELOPE_KIND_MISMATCH`, `INVALID_RUT`, `INVALID_DATE`. ES: los mismos códigos.
 */
export const createEnvelope = ({ kind, documents, cover, now }: CreateEnvelopeInput): Envelope => {
  if (documents.length === 0) throw new DteError('ENVELOPE_EMPTY', { kind })
  for (const document of documents) {
    if (isReceipt(document.header.type) !== (kind === 'receipt'))
      throw new DteError('ENVELOPE_KIND_MISMATCH', { kind, type: document.header.type })
  }
  const subtotals = countByType(documents)
  return {
    kind,
    setId: cover.setId ?? generateSetId(kind === 'receipt' ? 'ENVIOBOLETA' : 'DTE_SetDoc', now),
    cover: {
      issuerRut: toSiiRut(cover.issuerRut, 'cover.issuerRut'),
      senderRut: toSiiRut(cover.senderRut, 'cover.senderRut'),
      receiverRut: kind === 'receipt' ? toSiiRut(SII_RUT) : toSiiRut(cover.receiverRut ?? SII_RUT, 'cover.receiverRut'),
      resolutionDate: toIsoDate(cover.resolutionDate, 'cover.resolutionDate'),
      resolutionNumber: cover.resolutionNumber,
      signedAt: cover.signedAt ?? chileTimestamp(now),
      subtotals: kind === 'dte' ? [...subtotals].sort((a, b) => rank(a.type) - rank(b.type)) : subtotals,
    },
    documents,
  }
}
