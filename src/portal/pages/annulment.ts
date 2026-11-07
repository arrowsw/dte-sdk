import { bodyText, formBlocks, inputTags, inputValues, stripTags } from '../html'

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
 * EN: Why folios were not annulled: `alreadyAnnulled` and `received` are what the SII said about them and are final;
 * `siiError`, `transport` and `unknown` (an answer that is none of those) are not, since the SII may have annulled them
 * all the same.
 * ES: Por qué no se anularon unos folios: `alreadyAnnulled` y `received` son lo que el SII dijo de ellos y son
 * definitivos; `siiError`, `transport` y `unknown` (una respuesta que no es ninguna de esas) no lo son, porque el SII
 * pudo haberlos anulado igual.
 */
export type AnnulmentRejectionReason = 'alreadyAnnulled' | 'received' | 'siiError' | 'transport' | 'unknown'

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

// Every page of the procedure describes it: "folios que no han sido recepcionados por el SII", "siempre y cuando no
// hayan sido recepcionados", "siempre y cuando ningún folio haya sido recepcionado". Read as an answer, any page would
// say "recepcionado", so these sentences go before anything is classified.
const PROCEDURE_SENTENCES =
  /(?:no\s+(?:han|hayan)\s+sido|ningun\s+folio\s+haya\s+sido)\s+recepcionad[oa]s?\s+por\s+el\s+sii/g

// What a page of the procedure answers: its readable text, lowercase and without accents, without those sentences.
const answerText = (html: string): string =>
  bodyText(html).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(PROCEDURE_SENTENCES, ' ')

const saysAlreadyAnnulled = (text: string): boolean =>
  text.includes('ya ha sido efectuado') ||
  text.includes('ya fue anulado') ||
  text.includes('efectuado anteriormente') ||
  /anulad[oa]\s+anteriormente/.test(text)

/**
 * EN: `af_anular3` says the range was annulled before, with no form to send. "anteriormente" comes in several wordings;
 * the certification environment said "ha sido anulado anteriormente" on 2026-11-07.
 * ES: `af_anular3` dice que el rango ya se anuló, sin formulario que enviar. "anteriormente" viene en varias
 * redacciones; el ambiente de certificación dijo "ha sido anulado anteriormente" el 07-11-2026.
 */
export const isAlreadyAnnulled = (html: string): boolean => saysAlreadyAnnulled(answerText(html))

/**
 * EN: The folios that page says were annulled before ("Folio Inicial Anulado", "Folio Final Anulado"); empty when it
 * does not list them.
 * ES: Los folios que esa página dice que se anularon antes ("Folio Inicial Anulado", "Folio Final Anulado"); vacío si
 * no los lista.
 */
export const annulledBefore = (html: string): readonly { readonly from: number; readonly to: number }[] =>
  Array.from(answerText(html).matchAll(/folio inicial anulado (\d+) folio final anulado (\d+)/g), ([, from, to]) => ({
    from: Number(from),
    to: Number(to),
  }))

/**
 * EN: What the SII answered to an annulment: only a concrete sentence counts, and anything else is `unknown`.
 * ES: Lo que respondió el SII a una anulación: solo cuenta una frase concreta, y cualquier otra cosa es `unknown`.
 */
export type AnnulmentAnswer = 'accepted' | Exclude<AnnulmentRejectionReason, 'transport'>

/**
 * EN: Classifies the answer of `af_anular`. An annulment is "ha autorizado la anulación" or the heading `SOLICITUD
 * ANULACION DE FOLIOS`, as the certification environment answered on 2026-11-07; the heading is compared as is, in
 * uppercase and without accents, so the title of another page of the procedure cannot pass for it.
 * ES: Clasifica la respuesta de `af_anular`. Una anulación es "ha autorizado la anulación" o el encabezado `SOLICITUD
 * ANULACION DE FOLIOS`, como respondió el ambiente de certificación el 07-11-2026; el encabezado se compara tal cual, en
 * mayúsculas y sin tilde, para que el título de otra página del trámite no pase por él.
 */
export const annulmentAnswer = (html: string): AnnulmentAnswer => {
  const text = answerText(html)
  if (text.includes('ha autorizado la anulacion') || html.includes('SOLICITUD ANULACION DE FOLIOS')) return 'accepted'
  if (text.includes('recepcionad')) return 'received'
  if (saysAlreadyAnnulled(text)) return 'alreadyAnnulled'
  if (text.includes('error 500') || text.includes('internal server error')) return 'siiError'
  return 'unknown'
}
