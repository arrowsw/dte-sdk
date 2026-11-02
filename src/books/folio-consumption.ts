import { VAT_RATE } from '../catalogs/codes'
import type { Certificate } from '../certificate/certificate'
import { generateSetId } from '../envelope/create'
import { DteError } from '../errors'
import type {
  FolioConsumption,
  FolioConsumptionCover,
  FolioConsumptionCoverInput,
  FolioConsumptionEntry,
  FolioConsumptionInput,
  FolioConsumptionSummary,
  FolioConsumptionType,
  FolioRange,
  VoidedFolio,
} from '../model/book'
import { toSiiFolioConsumption } from '../model/book-codec'
import { toSiiRut } from '../model/rut'
import { signEnveloped, verifyEnveloped, type SignatureVerification, type XmlSignature } from '../signature/xmldsig'
import { chileTimestamp, toIsoDate } from '../time/chile'
import { assertBookAmount, assertBookFolio, assertResolutionNumber, buildBookXml } from './common'

const ROOT_TAG = 'ConsumoFolios'
const SIGNED_TAG = 'DocumentoConsumoFolios'
const REPORT_TYPES: readonly FolioConsumptionType[] = [39, 41]
const MAX_SEQUENCE = 999

const isReportType = (type: number): type is FolioConsumptionType => (REPORT_TYPES as readonly number[]).includes(type)

/**
 * EN: Sorts folios and groups the consecutive ones into ranges; a lone folio has `from` equal to `to`.
 * ES: Ordena folios y agrupa los consecutivos en rangos; un folio solo tiene `from` igual a `to`.
 */
export const compactFolioRanges = (folios: readonly number[]): readonly FolioRange[] => {
  const ranges: FolioRange[] = []
  for (const folio of [...folios].sort((a, b) => a - b)) {
    const last = ranges[ranges.length - 1]
    if (last !== undefined && folio === last.to + 1) ranges[ranges.length - 1] = { from: last.from, to: folio }
    else ranges.push({ from: folio, to: folio })
  }
  return ranges
}

const assertCounter = (value: number | undefined, field: string): void => {
  if (value !== undefined && !(Number.isSafeInteger(value) && value >= 0 && value <= MAX_SEQUENCE))
    throw new DteError('INVALID_OPTION', { field })
}

const normalizeCover = (
  cover: FolioConsumptionCoverInput,
  entries: readonly FolioConsumptionEntry[],
  now: Date | undefined,
): FolioConsumptionCover => {
  const dates = entries
    .flatMap((entry) => (entry.issueDate === undefined ? [] : [toIsoDate(entry.issueDate, 'issueDate')]))
    .sort()
  const from = cover.from ?? dates[0]
  const to = cover.to ?? dates[dates.length - 1]
  if (from === undefined) throw new DteError('MISSING_FIELD', { field: 'cover.from' })
  if (to === undefined) throw new DteError('MISSING_FIELD', { field: 'cover.to' })
  assertResolutionNumber(cover.resolutionNumber)
  assertCounter(cover.sequence, 'cover.sequence')
  assertCounter(cover.correlative, 'cover.correlative')
  return {
    issuerRut: toSiiRut(cover.issuerRut, 'cover.issuerRut'),
    senderRut: toSiiRut(cover.senderRut, 'cover.senderRut'),
    resolutionDate: toIsoDate(cover.resolutionDate, 'cover.resolutionDate'),
    resolutionNumber: cover.resolutionNumber,
    from: toIsoDate(from, 'cover.from'),
    to: toIsoDate(to, 'cover.to'),
    sequence: cover.sequence ?? 1,
    ...(cover.correlative === undefined ? {} : { correlative: cover.correlative }),
    signedAt: chileTimestamp(now),
  }
}

const assertLines = (entries: readonly FolioConsumptionEntry[], voided: readonly VoidedFolio[]): void => {
  const seen = new Set<string>()
  for (const { type, folio } of [...entries, ...voided]) {
    if (!isReportType(type)) throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type', type })
    assertBookFolio(folio, 'folio')
    const key = `${type}:${folio}`
    if (seen.has(key)) throw new DteError('INVALID_FOLIO', { field: 'folio', folio, type })
    seen.add(key)
  }
  for (const entry of entries)
    for (const field of ['netAmount', 'vatAmount', 'exemptAmount', 'totalAmount'] as const)
      assertBookAmount(entry[field], { field, signed: false })
}

const summarize = (
  type: FolioConsumptionType,
  entries: readonly FolioConsumptionEntry[],
  voided: readonly VoidedFolio[],
): FolioConsumptionSummary => {
  const taxed = type === 39
  const add = (read: (entry: FolioConsumptionEntry) => number | undefined): number =>
    entries.reduce((total, entry) => total + (read(entry) ?? 0), 0)
  return {
    type,
    netAmount: taxed ? add((entry) => entry.netAmount) : 0,
    vatAmount: taxed ? add((entry) => entry.vatAmount) : 0,
    ...(taxed ? { vatRate: VAT_RATE } : {}),
    exemptAmount: add((entry) => entry.exemptAmount),
    totalAmount: add((entry) => entry.totalAmount),
    issuedCount: entries.length,
    voidedCount: voided.length,
    usedCount: entries.length + voided.length,
    usedRanges: compactFolioRanges(entries.map((entry) => entry.folio)),
    voidedRanges: compactFolioRanges(voided.map((item) => item.folio)),
  }
}

/**
 * EN: Builds a folio consumption report (RCOF, now Resumen de Ventas Diarias): one summary per receipt type present, 39
 * first, or one of type 39 in zeros for a day without sales. The ranges list issued folios and voided folios separately,
 * as the worked example of the format does. Used today in the receipts certification; the SII probably no longer requires
 * it in production.
 * ES: Arma un reporte de consumo de folios (RCOF, hoy Resumen de Ventas Diarias): un resumen por cada tipo de boleta
 * presente, primero el 39, o uno de tipo 39 en ceros para un día sin ventas. Los rangos listan por separado los folios
 * emitidos y los anulados, como el ejemplo del formato. Hoy se usa en la certificación de boletas; probablemente el SII ya
 * no lo exige en producción.
 * @throws {DteError} EN: `MISSING_FIELD`, `INVALID_OPTION`, `INVALID_RUT`, `INVALID_DATE`, `INVALID_DOCUMENT_TYPE`, `INVALID_FOLIO`, `INVALID_AMOUNT`. ES: los mismos códigos.
 */
export const createFolioConsumption = (input: FolioConsumptionInput): FolioConsumption => {
  const entries = input.entries ?? []
  const voided = input.voidedFolios ?? []
  assertLines(entries, voided)
  const cover = normalizeCover(input.cover, entries, input.now)
  const present = REPORT_TYPES.filter((type) => [...entries, ...voided].some((line) => line.type === type))
  const summaries = (present.length === 0 ? ([39] as const) : present).map((type) =>
    summarize(
      type,
      entries.filter((entry) => entry.type === type),
      voided.filter((item) => item.type === type),
    ),
  )
  return { id: input.id ?? generateSetId('RCOF', input.now), cover, summaries }
}

/**
 * EN: Renders the unsigned `ConsumoFolios` XML.
 * ES: Renderiza el XML `ConsumoFolios` sin firma.
 */
export const buildFolioConsumptionXml = (report: FolioConsumption): string => {
  const { Caratula, Resumen } = toSiiFolioConsumption(report)
  return buildBookXml({
    rootTag: ROOT_TAG,
    signedTag: SIGNED_TAG,
    schema: 'ConsumoFolio_v10.xsd',
    id: report.id,
    content: { Caratula: { '@_version': '1.0', ...Caratula }, Resumen },
  })
}

/**
 * EN: A folio consumption report with its signed XML, ready for `uploadFolioConsumption`.
 * ES: Un reporte de consumo de folios con su XML firmado, listo para `uploadFolioConsumption`.
 */
export type SignedFolioConsumption = FolioConsumption & {
  /** EN: Signed XML with prolog. ES: XML firmado con prólogo. */
  readonly xml: string
  /** EN: Digest and signature values. ES: Valores de digest y firma. */
  readonly signature: XmlSignature
}

/**
 * EN: Signs the `DocumentoConsumoFolios` with the sender certificate (enveloped XMLDSig, `URI="#ID"`).
 * ES: Firma el `DocumentoConsumoFolios` con el certificado de quien envía (XMLDSig envuelta, `URI="#ID"`).
 */
export const signFolioConsumption = (report: FolioConsumption, certificate: Certificate): SignedFolioConsumption => {
  const { xml, signature } = signEnveloped({
    xml: buildFolioConsumptionXml(report),
    elementTag: SIGNED_TAG,
    rootTag: ROOT_TAG,
    certificate,
  })
  return { ...report, xml, signature }
}

/**
 * EN: Verifies the signature of a `ConsumoFolios` XML.
 * ES: Verifica la firma de un XML `ConsumoFolios`.
 */
export const verifyFolioConsumptionSignature = (xml: string): SignatureVerification =>
  verifyEnveloped(xml, { elementTag: SIGNED_TAG, rootTag: ROOT_TAG })
