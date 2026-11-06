import { formBlocks, formWithAction, namedForm } from '../html'

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
  formBlocks(html)
    .filter((block) => /<form\b[^>]*\bname\s*=\s*["']?frm\d+/i.test(block))
    .map(inputValues)
    .filter(hasRange)

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
  const form = namedForm(html, 'form1')
  const fields = form === null ? {} : inputValues(form)
  return fields.FOLIO_INI ? fields : null
}

/**
 * EN: The fields of the download form that follows the resolution, or null.
 * ES: Los campos del formulario de descarga que sigue a la resolución, o null.
 */
export const reobtainDownloadFields = (html: string): Readonly<Record<string, string>> | null => {
  const form = formWithAction(html, 'rf_genera_archivo')
  const fields = form === null ? {} : inputValues(form)
  return fields.FOLIO_INI ? fields : null
}
