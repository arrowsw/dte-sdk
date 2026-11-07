import { selectOptions } from '../html'

// Each form is chosen by its exact opening tag, as field behaviour does: double quotes, and the name right after
// `<form`, for the list and the final form; the `action` ending in the download page for the download form.
const LIST_FORM = /<form\s+name="frm\d+"[\s\S]*?<\/form>/gi
const FINAL_FORM = /<form\s+name="form1"[\s\S]*?<\/form>/i
const DOWNLOAD_FORM = /<form[^>]*action="[^"]*rf_genera_archivo"[\s\S]*?<\/form>/i

// Only an input whose double-quoted name is followed by a double-quoted value is a field: one without a `value` is
// not sent, as field behaviour does. A repeated name keeps the last value.
const NAME_THEN_VALUE = /<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"/gi

const inputValues = (html: string): Readonly<Record<string, string>> =>
  Object.fromEntries(Array.from(html.matchAll(NAME_THEN_VALUE), ([, name, value]) => [name, value]))

const hasRange = (fields: Readonly<Record<string, string>>): boolean => Boolean(fields.FOLIO_INI && fields.FOLIO_FIN)

/**
 * EN: The fields of each range of the list, one `<form name="frmN">` per range.
 * ES: Los campos de cada rango de la lista, un `<form name="frmN">` por rango.
 */
export const parseReobtainList = (html: string): readonly Readonly<Record<string, string>>[] =>
  Array.from(html.matchAll(LIST_FORM), ([block]) => inputValues(block)).filter(hasRange)

/**
 * EN: The detail page says the range is annulled: the list itself does not.
 * ES: La página de detalle dice que el rango está anulado: la lista no lo dice.
 */
export const isRangeAnnulled = (html: string): boolean => /ha sido anulado/i.test(html)

/**
 * EN: The fields of the final form of the detail page, or null.
 * ES: Los campos del formulario final de la página de detalle, o null.
 */
export const reobtainFormFields = (html: string): Readonly<Record<string, string>> | null => {
  const fields = inputValues(FINAL_FORM.exec(html)?.[0] ?? '')
  return fields.FOLIO_INI ? fields : null
}

/**
 * EN: The fields of the download form that follows the resolution, or null.
 * ES: Los campos del formulario de descarga que sigue a la resolución, o null.
 */
export const reobtainDownloadFields = (html: string): Readonly<Record<string, string>> | null => {
  const fields = inputValues(DOWNLOAD_FORM.exec(html)?.[0] ?? '')
  return fields.FOLIO_INI ? fields : null
}

/**
 * EN: The page belongs to the reobtention: every page of the procedure carries its heading.
 * ES: La página es de la reobtención: toda página del trámite trae su encabezado.
 */
export const isReobtainPage = (html: string): boolean => html.includes('REOBTENCION DE FOLIOS')

/**
 * EN: The page is a listing of ranges, possibly empty: a page of the procedure without the selector of the query form
 * that opens it.
 * ES: La página es un listado de rangos, posiblemente vacío: una página del trámite sin el selector del formulario de
 * consulta que lo abre.
 */
export const isReobtainListing = (html: string): boolean =>
  isReobtainPage(html) && selectOptions(html, 'COD_DOCTO') === null
