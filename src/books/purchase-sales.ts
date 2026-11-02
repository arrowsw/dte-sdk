import type { Certificate } from '../certificate/certificate'
import { generateSetId } from '../envelope/create'
import { DteError } from '../errors'
import type {
  BookTotalMismatch,
  BookTotals,
  PurchaseSalesBook,
  PurchaseSalesBookInput,
  PurchaseSalesCover,
  PurchaseSalesCoverInput,
} from '../model/book'
import { toSiiPurchaseSalesBook } from '../model/book-codec'
import { signEnveloped, verifyEnveloped, type SignatureVerification, type XmlSignature } from '../signature/xmldsig'
import { chileTimestamp } from '../time/chile'
import { assertMaxLength, sanitizeText } from '../text/sanitize'
import { assertBookZones, buildBookXml, normalizeBookCover } from './common'
import { normalizeBookEntry } from './entry'
import { accumulateBookTotals, normalizeBookTotals, sumBookEntries } from './totals'

const ROOT_TAG = 'LibroCompraVenta'
const SIGNED_TAG = 'EnvioLibro'
const MAX_RECTIFICATION_CODE = 10
const MIN_COMMON_USE_FACTOR = 0.001
const MAX_COMMON_USE_FACTOR = 99.999
const MIN_ADDITIONAL_FACTOR = 0.001
const MAX_ADDITIONAL_FACTOR = 1

const normalizeCover = (cover: PurchaseSalesCoverInput): PurchaseSalesCover => {
  const kind = cover.kind ?? 'monthly'
  if (kind === 'special' && cover.notificationFolio === undefined)
    throw new DteError('MISSING_FIELD', { field: 'cover.notificationFolio' })
  if (kind === 'rectification' && cover.rectificationCode === undefined)
    throw new DteError('MISSING_FIELD', { field: 'cover.rectificationCode' })
  const rectificationCode = kind === 'rectification' ? sanitizeText(cover.rectificationCode) : undefined
  if (rectificationCode !== undefined) assertMaxLength(rectificationCode, MAX_RECTIFICATION_CODE, 'CodAutRec')
  return {
    ...normalizeBookCover(cover),
    operation: cover.operation,
    kind,
    ...(rectificationCode === undefined ? {} : { rectificationCode }),
  }
}

const hasDecimalsUpTo = (value: number, decimals: number): boolean => {
  const scale = 10 ** decimals
  return Math.round(value * scale) / scale === value
}

const assertFactors = (input: PurchaseSalesBookInput): void => {
  const { commonUseVatFactor: factor, additionalTaxFactors } = input
  if (
    factor !== undefined &&
    !(factor >= MIN_COMMON_USE_FACTOR && factor <= MAX_COMMON_USE_FACTOR && hasDecimalsUpTo(factor, 3))
  )
    throw new DteError('INVALID_OPTION', { field: 'commonUseVatFactor' })
  for (const value of Object.values(additionalTaxFactors ?? {}))
    if (!(value >= MIN_ADDITIONAL_FACTOR && value <= MAX_ADDITIONAL_FACTOR && hasDecimalsUpTo(value, 4)))
      throw new DteError('INVALID_OPTION', { field: 'additionalTaxFactors' })
}

const assertCommonUseFactor = (rows: readonly BookTotals[] | null, factor: number | undefined): void => {
  if (factor === undefined && (rows ?? []).some((row) => (row.commonUseVat ?? 0) > 0))
    throw new DteError('MISSING_FIELD', { field: 'commonUseVatFactor' })
}

/**
 * EN: Builds a purchase and sales book (IECV): validates the cover and the zones of its submission, normalizes the lines
 * and computes the summaries. An explicit line total that differs from the SII formula is kept and reported in
 * `totalMismatches`, because the SII accepts some of them; `strictTotals` throws instead.
 * ES: Arma un libro de compras y ventas (IECV): valida la carátula y las zonas de su envío, normaliza las líneas y calcula
 * los resúmenes. Un total explícito de línea que difiere de la fórmula del SII se conserva y se informa en
 * `totalMismatches`, porque el SII acepta algunos; `strictTotals` lanza en vez de eso.
 * @throws {DteError} EN: `BOOK_TOTAL_MISMATCH` with `strictTotals`; `MISSING_FIELD`, `INVALID_OPTION`, `INVALID_RUT`, `INVALID_DATE`, `INVALID_DOCUMENT_TYPE`, `INVALID_FOLIO`, `INVALID_AMOUNT`, `FIELD_TOO_LONG`. ES: `BOOK_TOTAL_MISMATCH` con `strictTotals`; y los demás códigos.
 */
export const createPurchaseSalesBook = (input: PurchaseSalesBookInput): PurchaseSalesBook => {
  const cover = normalizeCover(input.cover)
  const inputs = input.entries ?? []
  const summaryOnly = (input.summaryOnlyTotals ?? []).map(normalizeBookTotals)
  const previous = input.previousTotals ?? []
  assertBookZones({
    submission: cover.submission,
    entryCount: inputs.length,
    hasPreviousTotals: previous.length > 0,
    hasSummaryOnlyTotals: summaryOnly.length > 0,
  })
  assertFactors(input)
  const normalized = inputs.map((entry, index) =>
    normalizeBookEntry(entry, { operation: cover.operation, submission: cover.submission, index }),
  )
  const totalMismatches = normalized.flatMap(({ mismatch }): readonly BookTotalMismatch[] =>
    mismatch ? [mismatch] : [],
  )
  if (input.strictTotals && totalMismatches.length > 0) {
    const { index, expected, actual } = totalMismatches[0]
    throw new DteError('BOOK_TOTAL_MISMATCH', { index, expected, actual })
  }
  const entries = normalized.map(({ entry }) => entry)
  const lineTotals = sumBookEntries(entries)
  const period = accumulateBookTotals(previous, [...lineTotals, ...summaryOnly])
  const periodTotals = cover.submission === 'partial' || period.length === 0 ? null : period
  assertCommonUseFactor(periodTotals, input.commonUseVatFactor)
  return {
    id: input.id ?? generateSetId('LCV', input.now),
    cover,
    entries,
    segmentTotals:
      (cover.submission === 'partial' || cover.submission === 'adjustment') && entries.length > 0 ? lineTotals : null,
    periodTotals,
    ...(input.commonUseVatFactor === undefined ? {} : { commonUseVatFactor: input.commonUseVatFactor }),
    ...(input.additionalTaxFactors === undefined ? {} : { additionalTaxFactors: input.additionalTaxFactors }),
    totalMismatches,
    signedAt: chileTimestamp(input.now),
  }
}

/**
 * EN: Renders the unsigned `LibroCompraVenta` XML.
 * ES: Renderiza el XML `LibroCompraVenta` sin firma.
 */
export const buildPurchaseSalesBookXml = (book: PurchaseSalesBook): string =>
  buildBookXml({
    rootTag: ROOT_TAG,
    signedTag: SIGNED_TAG,
    schema: 'LibroCV_v10.xsd',
    id: book.id,
    content: toSiiPurchaseSalesBook(book),
  })

/**
 * EN: A purchase and sales book with its signed XML, ready for `uploadBook`.
 * ES: Un libro de compras y ventas con su XML firmado, listo para `uploadBook`.
 */
export type SignedPurchaseSalesBook = PurchaseSalesBook & {
  /** EN: Signed XML with prolog. ES: XML firmado con prólogo. */
  readonly xml: string
  /** EN: Digest and signature values. ES: Valores de digest y firma. */
  readonly signature: XmlSignature
}

/**
 * EN: Signs the `EnvioLibro` with the sender certificate (enveloped XMLDSig, `URI="#ID"`).
 * ES: Firma el `EnvioLibro` con el certificado de quien envía (XMLDSig envuelta, `URI="#ID"`).
 */
export const signPurchaseSalesBook = (book: PurchaseSalesBook, certificate: Certificate): SignedPurchaseSalesBook => {
  const { xml, signature } = signEnveloped({
    xml: buildPurchaseSalesBookXml(book),
    elementTag: SIGNED_TAG,
    rootTag: ROOT_TAG,
    certificate,
  })
  return { ...book, xml, signature }
}

/**
 * EN: Verifies the signature of a `LibroCompraVenta` XML.
 * ES: Verifica la firma de un XML `LibroCompraVenta`.
 */
export const verifyPurchaseSalesBookSignature = (xml: string): SignatureVerification =>
  verifyEnveloped(xml, { elementTag: SIGNED_TAG, rootTag: ROOT_TAG })
