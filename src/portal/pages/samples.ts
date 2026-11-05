import { decodeEntities, stripTags } from '../html'
import { firstGwtLongIn, gwtLongToken, type GwtAnswer } from '../gwt'

/**
 * EN: The states a samples review can be in, as the portal writes them.
 * ES: Los estados en que puede estar una revisión de muestras, como los escribe el portal.
 */
export type ReviewState = 'APROBADO' | 'POR REVISAR' | 'EN REVISION' | 'RECHAZADO' | 'INGRESO' | 'ENVIADO AL SII'

/**
 * EN: One row of the rejection detail: how the SII filed one PDF.
 * ES: Una fila del detalle del rechazo: cómo clasificó el SII un PDF.
 */
export type SampleDetail = {
  /** EN: The PDF's file name. ES: El nombre de archivo del PDF. */
  readonly fileName: string
  /** EN: Filed as the test set or as the simulation. ES: Clasificado como set de pruebas o como simulación. */
  readonly kind: 'test' | 'simulation'
  /** EN: The document type the SII read. ES: El tipo de documento que leyó el SII. */
  readonly documentType: string
  /** EN: The folio the SII read. ES: El folio que leyó el SII. */
  readonly folio: number
  /** EN: The copy: `CEDIBLE` marks the transferable copy. ES: La copia: `CEDIBLE` marca la copia cedible. */
  readonly copy: string
  /** EN: The test-set case the SII matched, or null. ES: El caso del set de pruebas que el SII asoció, o null. */
  readonly caseId: string | null
}

const STATE_PATTERN = /"(APROBADO|POR REVISAR|EN REVISI[OÓ]N|RECHAZADO|INGRESO|ENVIADO AL SII)"/i
const MIN_REVIEW_ID = 10000
const MAX_REVIEW_ID = 9999999
const MIN_DETAIL_CELLS = 6
const SENT_AT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/

/**
 * EN: The review state quoted in the raw body, upper-cased without the accent, or null.
 * ES: El estado de la revisión entre comillas en el cuerpo crudo, en mayúsculas sin tilde, o null.
 */
export const reviewState = (body: string): ReviewState | null => {
  const match = STATE_PATTERN.exec(body)
  if (match === null) return null
  return match[1].toUpperCase().replace('Ó', 'O') as ReviewState
}

/**
 * EN: The review id of an answer: the first Long between 10 000 and 9 999 999, with the token the portal wrote
 * (the token goes back to the portal as it came; the number names the review in the upload form).
 * ES: El id de revisión de una respuesta: el primer Long entre 10 000 y 9 999 999, con el token que escribió el portal
 * (el token vuelve al portal tal como vino; el número nombra la revisión en el formulario de subida).
 */
export const reviewId = (answer: GwtAnswer): { readonly id: number; readonly token: string } | null => {
  const id = firstGwtLongIn(answer, MIN_REVIEW_ID, MAX_REVIEW_ID)
  if (id === null) return null
  return { id, token: gwtLongToken(answer, id)! }
}

/**
 * EN: The date the review was sent, the first table string shaped `YYYY-MM-DD HH:MM`, or null.
 * ES: La fecha en que se envió la revisión, el primer string de la tabla con forma `AAAA-MM-DD HH:MM`, o null.
 */
export const reviewSentAt = (answer: GwtAnswer): string | null =>
  answer.table.find((item) => SENT_AT.test(item)) ?? null

const unescapeHtml = (text: string): string =>
  text
    .replace(/\\x([0-9A-Fa-f]{2})/g, (_whole, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\u([0-9A-Fa-f]{4})/g, (_whole, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\')

/**
 * EN: The rows of the rejection detail: the HTML table inside the answer's string table, one row per `<tr>` with at
 * least six cells whose second cell ends in `.pdf`.
 * ES: Las filas del detalle del rechazo: la tabla HTML dentro de la tabla de strings de la respuesta, una fila por
 * `<tr>` con al menos seis celdas cuya segunda celda termina en `.pdf`.
 */
export const sampleDetails = (body: string): readonly SampleDetail[] => {
  const match = /"(\\x3Chtml[\s\S]*?)"\]/i.exec(body) ?? /"(<html[\s\S]*?)"\]/i.exec(body)
  if (match === null) return []
  const html = unescapeHtml(match[1])
  return (html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? []).flatMap((row) => {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => stripTags(cell[1]))
    if (cells.length < MIN_DETAIL_CELLS || !cells[1].toLowerCase().endsWith('.pdf')) return []
    return [
      {
        fileName: cells[1],
        kind: cells[2].toUpperCase().includes('SIMULACION') ? ('simulation' as const) : ('test' as const),
        documentType: cells[3],
        folio: Number(cells[4]),
        copy: cells[5],
        caseId: cells[6] === undefined || cells[6] === '' ? null : decodeEntities(cells[6]),
      },
    ]
  })
}

const countByType = (rows: readonly SampleDetail[]): string =>
  [
    ...rows.reduce(
      (map, row) => map.set(row.documentType, (map.get(row.documentType) ?? 0) + 1),
      new Map<string, number>(),
    ),
  ]
    .map(([type, count]) => `${type} ${count}`)
    .join(', ')

/**
 * EN: What the SII recognised, in one sentence: how many documents it filed as the test set (with their cases) and
 * how many as the simulation, by document type, the transferable copies left out. A set whose documents the SII
 * filed as simulation was not the envelope the SII registered for that set.
 * ES: Lo que reconoció el SII, en una frase: cuántos documentos clasificó como set de pruebas (con sus casos) y cuántos
 * como simulación, por tipo de documento, sin las copias cedibles. Un set cuyos documentos el SII clasificó como
 * simulación no era el sobre que el SII registró para ese set.
 */
export const summarizeSampleDetails = (rows: readonly SampleDetail[]): string => {
  const originals = rows.filter((row) => !row.copy.toUpperCase().includes('CEDIBLE'))
  const tests = originals.filter((row) => row.kind === 'test')
  const simulation = originals.filter((row) => row.kind === 'simulation')
  const cases = [...new Set(tests.flatMap((row) => (row.caseId === null ? [] : [row.caseId])))]
  return `The SII recognised ${tests.length} document(s) as the test set (cases ${cases.length === 0 ? 'none' : cases.join(', ')}: ${countByType(tests) || 'none'}) and ${simulation.length} as the simulation (${countByType(simulation) || 'none'}). A set missing from the cases was not the envelope the SII registered for it.`
}
