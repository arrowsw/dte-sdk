import type { BookSubmission } from '../catalogs/book-codes'
import { DteError } from '../errors'
import type { BookCover, BookCoverInput } from '../model/book'
import { toSiiRut } from '../model/rut'
import { toIsoDate } from '../time/chile'
import { buildXml } from '../xml/build'

const SII_NS = 'http://www.sii.cl/SiiDte'
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/
const MIN_BOOK_DATE = '2000-01-01'
const MAX_BOOK_DATE = '2050-12-31'
const MAX_RESOLUTION_NUMBER = 999_999
const MAX_FOLIO = 9_999_999_999

const isPositiveInteger = (value: number, max: number): boolean =>
  Number.isSafeInteger(value) && value > 0 && value <= max

/**
 * EN: Throws `INVALID_FOLIO` unless the folio is a positive integer of at most 10 digits.
 * ES: Lanza `INVALID_FOLIO` salvo que el folio sea un entero positivo de hasta 10 dígitos.
 */
export const assertBookFolio = (folio: number, field: string, index?: number): void => {
  if (!isPositiveInteger(folio, MAX_FOLIO)) throw new DteError('INVALID_FOLIO', { field, folio, index })
}

/**
 * EN: Throws `INVALID_AMOUNT` unless the value is absent or a safe integer; `signed: false` also rejects negatives,
 * as the fields the schema types as `MontoType` do.
 * ES: Lanza `INVALID_AMOUNT` salvo que el valor falte o sea un entero seguro; `signed: false` también rechaza negativos,
 * como los campos que el esquema tipa como `MontoType`.
 */
export const assertBookAmount = (
  value: number | undefined,
  options: { readonly field: string; readonly signed: boolean; readonly index?: number },
): void => {
  if (value === undefined) return
  if (!Number.isSafeInteger(value) || (!options.signed && value < 0))
    throw new DteError('INVALID_AMOUNT', { field: options.field, index: options.index })
}

/**
 * EN: Throws `INVALID_AMOUNT` unless the rate is absent or a percentage of at most 2 decimals (`PctType`).
 * ES: Lanza `INVALID_AMOUNT` salvo que la tasa falte o sea un porcentaje de hasta 2 decimales (`PctType`).
 */
export const assertBookRate = (rate: number | undefined, field: string, index?: number): void => {
  if (rate === undefined) return
  if (!(rate >= 0 && rate <= 100) || Math.round(rate * 100) / 100 !== rate)
    throw new DteError('INVALID_AMOUNT', { field, index })
}

/**
 * EN: Normalizes a document date of a book: `YYYY-MM-DD` within the 2000 to 2050 range of the schema.
 * ES: Normaliza una fecha de documento de un libro: `AAAA-MM-DD` dentro del rango 2000 a 2050 del esquema.
 * @throws {DteError} EN: `INVALID_DATE`. ES: `INVALID_DATE`.
 */
export const toBookDate = (value: string, field: string): string => {
  const iso = toIsoDate(value, field)
  if (iso < MIN_BOOK_DATE || iso > MAX_BOOK_DATE) throw new DteError('INVALID_DATE', { field })
  return iso
}

/**
 * EN: Throws `INVALID_OPTION` unless the resolution number is a non-negative integer of at most 6 digits.
 * ES: Lanza `INVALID_OPTION` salvo que el número de resolución sea un entero no negativo de hasta 6 dígitos.
 */
export const assertResolutionNumber = (value: number): void => {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_RESOLUTION_NUMBER)
    throw new DteError('INVALID_OPTION', { field: 'cover.resolutionNumber' })
}

/**
 * EN: Normalizes the cover fields both books share: RUTs through `toSiiRut`, the period as `YYYY-MM`, the resolution
 * date to ISO, `submission` to `total` by default, and the segment number required on `partial` and dropped elsewhere.
 * ES: Normaliza los campos de carátula que comparten ambos libros: RUT con `toSiiRut`, el período como `AAAA-MM`, la
 * fecha de resolución a ISO, `submission` en `total` por defecto, y el número de segmento obligatorio en `partial` y
 * descartado en los demás.
 * @throws {DteError} EN: `INVALID_RUT`, `INVALID_DATE`, `INVALID_OPTION`, `MISSING_FIELD`. ES: los mismos códigos.
 */
export const normalizeBookCover = (cover: BookCoverInput): BookCover => {
  if (!PERIOD.test(cover.period)) throw new DteError('INVALID_DATE', { field: 'cover.period' })
  assertResolutionNumber(cover.resolutionNumber)
  const submission = cover.submission ?? 'total'
  if (submission === 'partial' && cover.segmentNumber === undefined)
    throw new DteError('MISSING_FIELD', { field: 'cover.segmentNumber' })
  if (submission === 'partial' && !isPositiveInteger(cover.segmentNumber as number, MAX_RESOLUTION_NUMBER))
    throw new DteError('INVALID_OPTION', { field: 'cover.segmentNumber' })
  if (cover.notificationFolio !== undefined && !isPositiveInteger(cover.notificationFolio, MAX_FOLIO))
    throw new DteError('INVALID_OPTION', { field: 'cover.notificationFolio' })
  return {
    issuerRut: toSiiRut(cover.issuerRut, 'cover.issuerRut'),
    senderRut: toSiiRut(cover.senderRut, 'cover.senderRut'),
    period: cover.period,
    resolutionDate: toIsoDate(cover.resolutionDate, 'cover.resolutionDate'),
    resolutionNumber: cover.resolutionNumber,
    submission,
    ...(submission === 'partial' ? { segmentNumber: cover.segmentNumber } : {}),
    ...(cover.notificationFolio === undefined ? {} : { notificationFolio: cover.notificationFolio }),
  }
}

/**
 * EN: Enforces the zones of the format per submission (sections 1.2, 1.3 and 1.6): a `partial` needs lines and takes
 * neither previous nor summary-only totals, a `final` takes no lines and needs totals, and previous totals only belong to
 * `final` and `adjustment`.
 * ES: Exige las zonas del formato según el envío (secciones 1.2, 1.3 y 1.6): un `partial` necesita líneas y no acepta
 * totales previos ni de solo resumen, un `final` no acepta líneas y necesita totales, y los totales previos solo
 * corresponden a `final` y `adjustment`.
 * @throws {DteError} EN: `MISSING_FIELD`, `INVALID_OPTION`. ES: los mismos códigos.
 */
export const assertBookZones = (zones: {
  readonly submission: BookSubmission
  readonly entryCount: number
  readonly hasPreviousTotals: boolean
  readonly hasSummaryOnlyTotals: boolean
}): void => {
  const { submission, entryCount, hasPreviousTotals, hasSummaryOnlyTotals } = zones
  if (submission === 'partial' && entryCount === 0) throw new DteError('MISSING_FIELD', { field: 'entries' })
  if (submission === 'final' && entryCount > 0) throw new DteError('INVALID_OPTION', { field: 'entries' })
  if (hasPreviousTotals && submission !== 'final' && submission !== 'adjustment')
    throw new DteError('INVALID_OPTION', { field: 'previousTotals' })
  if (hasSummaryOnlyTotals && submission === 'partial')
    throw new DteError('INVALID_OPTION', { field: 'summaryOnlyTotals' })
  if (submission === 'final' && !hasPreviousTotals && !hasSummaryOnlyTotals)
    throw new DteError('MISSING_FIELD', { field: 'previousTotals' })
}

/**
 * EN: Input of `buildBookXml`.
 * ES: Entrada de `buildBookXml`.
 */
export type BookXmlInput = {
  /** EN: Root element. ES: Elemento raíz. */
  readonly rootTag: string
  /** EN: Element signed by `ID`. ES: Elemento que se firma por `ID`. */
  readonly signedTag: string
  /** EN: Schema file named in `xsi:schemaLocation`. ES: Archivo de esquema que nombra `xsi:schemaLocation`. */
  readonly schema: string
  /** EN: `ID` of the signed element. ES: `ID` del elemento firmado. */
  readonly id: string
  /** EN: Children of the signed element, in schema order. ES: Hijos del elemento firmado, en el orden del esquema. */
  readonly content: object
}

/**
 * EN: Renders a book: ISO-8859-1 prolog, root with its namespaces and a line break between every pair of adjacent tags,
 * because the SII rejects lines over about 4 090 characters (`CHR-00002`). The closing tag of the signed element stays
 * next to the closing root, where `signEnveloped` inserts the signature. Text cannot contain `><`: the builder escapes it.
 * ES: Renderiza un libro: prólogo ISO-8859-1, raíz con sus namespaces y un salto de línea entre cada par de etiquetas
 * adyacentes, porque el SII rechaza líneas de más de unos 4 090 caracteres (`CHR-00002`). El cierre del elemento firmado
 * queda junto al cierre del raíz, donde `signEnveloped` inserta la firma. El texto no puede contener `><`: el builder lo escapa.
 */
export const buildBookXml = ({ rootTag, signedTag, schema, id, content }: BookXmlInput): string => {
  const signed = buildXml({ [signedTag]: { '@_ID': id, ...content } })
  const root = `<?xml version="1.0" encoding="ISO-8859-1"?>\n<${rootTag} xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}" xsi:schemaLocation="${SII_NS} ${schema}" version="1.0">`
  return `${root}${signed}`.replace(/></g, '>\n<') + `</${rootTag}>`
}
