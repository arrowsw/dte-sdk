import { formBlocks, inputTags, inputValues, stripTags } from '../html'

/**
 * EN: A stamped range with unused folios, as the annulment page lists it. Annulled ranges stay on this list forever.
 * ES: Un rango timbrado con folios sin usar, tal como lo lista la página de anulación. Los rangos anulados siguen en esta lista para siempre.
 */
export type UnusedFolioRange = {
  /** EN: First folio. ES: `FOLIO_INI` — Primer folio. */
  readonly from: number
  /** EN: Last folio. ES: `FOLIO_FIN` — Último folio. */
  readonly to: number
  /** EN: Folios in the range. ES: `CANT_DOCTOS` — Folios del rango. */
  readonly quantity: number
  /** EN: Stamping date, YYYY-MM-DD, or null. ES: `DIA`, `MES`, `ANO` — Fecha de timbraje, AAAA-MM-DD, o null. */
  readonly date: string | null
}

/**
 * EN: How the SII answered an attempt to annul.
 * ES: Cómo respondió el SII un intento de anulación.
 */
export type AnnulmentRejectionReason = 'alreadyAnnulled' | 'received' | 'refused' | 'siiError' | 'transport' | 'unknown'

const firstInteger = (value: string | undefined): number | null => {
  const match = /(\d+)/.exec(value ?? '')
  return match === null ? null : Number(match[1])
}

const rangeFromForm = (block: string): UnusedFolioRange | null => {
  const fields = inputValues(block)
  const from = firstInteger(fields.FOLIO_INI)
  const to = firstInteger(fields.FOLIO_FIN)
  if (from === null || to === null) return null
  const day = (fields.DIA ?? '').padStart(2, '0')
  const month = (fields.MES ?? '').padStart(2, '0')
  const year = fields.ANO ?? ''
  return {
    from,
    to,
    quantity: firstInteger(fields.CANT_DOCTOS) ?? to - from + 1,
    date: day !== '00' && month !== '00' && year !== '' ? `${year}-${month}-${day}` : null,
  }
}

const dmyToIso = (value: string): string | null => {
  const match = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(value.replace(/\s/g, ''))
  return match === null ? null : `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
}

const rangeFromRow = (row: string): UnusedFolioRange | null => {
  const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? []).map(stripTags)
  if (cells.length < 4) return null
  const from = firstInteger(cells[2])
  const to = firstInteger(cells[3])
  if (from === null || to === null) return null
  return { from, to, quantity: firstInteger(cells[1]) ?? to - from + 1, date: dmyToIso(cells[0]) }
}

const present = <T>(value: T | null): value is T => value !== null

/**
 * EN: Keeps the first of each `from-to` pair; the SII may repeat a form.
 * ES: Conserva el primero de cada par `desde-hasta`; el SII puede repetir un formulario.
 */
export const uniqueRanges = (ranges: readonly UnusedFolioRange[]): readonly UnusedFolioRange[] => {
  const seen = new Set<string>()
  return ranges.filter((range) => {
    const key = `${range.from}-${range.to}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * EN: The ranges of a listing page. Each row's form carries them in hidden fields, which survives the nested tables that
 * break a read by columns; rows without forms fall back to columns.
 * ES: Los rangos de una página del listado. El formulario de cada fila los trae en campos ocultos, lo que resiste las
 * tablas anidadas que rompen una lectura por columnas; las filas sin formulario caen a columnas.
 */
export const parseUnusedRanges = (html: string): readonly UnusedFolioRange[] => {
  const fromForms = uniqueRanges(formBlocks(html).map(rangeFromForm).filter(present))
  return fromForms.length > 0
    ? fromForms
    : (html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []).map(rangeFromRow).filter(present)
}

/**
 * EN: The "Ver siguiente" button of the listing, with the page its `cambiapag(n)` handler asks for; null on the last page.
 * ES: El botón "Ver siguiente" del listado, con la página que pide su handler `cambiapag(n)`; null en la última página.
 */
export const nextPageButton = (html: string): { readonly page: number | null } | null => {
  const button = inputTags(html).find((tag) => /siguiente|next/i.test(tag.name) || /siguiente/i.test(tag.value))
  if (button === undefined) return null
  const page = /cambiapag\((\d+)\)/i.exec(button.onClick ?? '')
  return { page: page === null ? null : Number(page[1]) }
}

/**
 * EN: `af_anular3` says the range was annulled before. "anteriormente" comes in several wordings.
 * ES: `af_anular3` dice que el rango ya se anuló. "anteriormente" viene en varias redacciones.
 */
export const isAlreadyAnnulled = (html: string): boolean =>
  html.includes('ya ha sido efectuado') ||
  html.includes('ya fue anulado') ||
  html.includes('efectuado anteriormente') ||
  /anulad[oa]\s+anteriormente/i.test(html)

/**
 * EN: The SII authorized the annulment.
 * ES: El SII autorizó la anulación.
 */
export const isAnnulmentAccepted = (html: string): boolean =>
  html.includes('ha autorizado la anulaci') || html.includes('SOLICITUD ANULACION DE FOLIOS')

/**
 * EN: The whole range cannot go: part of it was annulled or received before, so it goes folio by folio.
 * ES: El rango completo no puede: parte de él ya se anuló o recibió, así que se sigue folio por folio.
 */
export const isAnnulmentConflict = (html: string): boolean =>
  html.includes('ya ha sido efectuado') ||
  html.includes('ya fue anulado') ||
  html.includes('efectuado anteriormente') ||
  html.includes('recepcionad')

/**
 * EN: Why an annulment was not accepted.
 * ES: Por qué una anulación no se aceptó.
 */
export const annulmentRefusal = (html: string): AnnulmentRejectionReason => {
  const text = html.toLowerCase()
  if (text.includes('recepcionad')) return 'received'
  if (
    text.includes('ya fue anulado') ||
    text.includes('anulado anteriormente') ||
    text.includes('ya ha sido efectuado anteriormente') ||
    (text.includes('anulad') && text.includes('ya'))
  )
    return 'alreadyAnnulled'
  if (text.includes('anulaci') && text.includes('no')) return 'refused'
  if (text.includes('error 500') || text.includes('internal server error')) return 'siiError'
  return 'unknown'
}
