import { attribute, decodeEntities, inputValues, stripTags, bodyText } from '../html'

/**
 * EN: One row of the set table of `pe_generar1`: a set and whether the company obtained it.
 * ES: Una fila de la tabla de sets de `pe_generar1`: un set y si la empresa lo obtuvo.
 */
export type SetGenerationState = {
  /** EN: Set name as the portal writes it. ES: Nombre del set tal como lo escribe el portal. */
  readonly name: string
  /** EN: The second cell, as text. ES: La segunda celda, como texto. */
  readonly state: string
}

/**
 * EN: One optional set the page offers as a checkbox.
 * ES: Un set opcional que la página ofrece como casilla.
 */
export type OptionalSetOption = {
  /** EN: Field name, `SETnn`. ES: `SETnn` — Nombre del campo. */
  readonly code: string
  /** EN: Label next to the checkbox. ES: Etiqueta junto a la casilla. */
  readonly label: string
}

/**
 * EN: What `pe_generar1` shows before a set is generated.
 * ES: Lo que muestra `pe_generar1` antes de generar un set.
 */
export type SetGenerationPage = {
  /** EN: The set table. ES: La tabla de sets. */
  readonly states: readonly SetGenerationState[]
  /** EN: The optional sets offered. ES: Los sets opcionales ofrecidos. */
  readonly optionalSets: readonly OptionalSetOption[]
  /** EN: Hidden `AUTORIZADA`; `S` when absent. ES: `AUTORIZADA` oculto; `S` si falta. */
  readonly authorized: string
  /** EN: Hidden `TOTAL`; `15` when absent. ES: `TOTAL` oculto; `15` si falta. */
  readonly total: string
  /** EN: The page still asks to confirm the company (`pe_generar1`). ES: La página aún pide confirmar la empresa (`pe_generar1`). */
  readonly asksCompanyConfirmation: boolean
}

const DEFAULT_AUTHORIZED = 'S'
const DEFAULT_TOTAL = '15'
const HEADER_ROW = /set obtenido/i

/**
 * EN: Reads the set table, the optional-set checkboxes and the hidden fields of `pe_generar1`.
 * ES: Lee la tabla de sets, las casillas de sets opcionales y los campos ocultos de `pe_generar1`.
 */
export const parseSetGeneration = (html: string): SetGenerationPage => {
  const states = html.split(/<tr\b/i).flatMap((row) => {
    const fonts = [...row.matchAll(/<font\b[^>]*>([\s\S]*?)<\/font>/gi)].map((match) => stripTags(match[1]))
    if (fonts.length < 2 || fonts[0] === '' || HEADER_ROW.test(fonts[0]) || HEADER_ROW.test(fonts[1])) return []
    return [{ name: fonts[0], state: fonts[1] }]
  })
  const optionalSets = (html.match(/<input\b[^>]*>[^<]*/gi) ?? []).flatMap((fragment) => {
    const tag = fragment.slice(0, fragment.indexOf('>') + 1)
    const name = attribute(tag, 'name')
    if (name === null || !/^SET\d+$/i.test(name) || attribute(tag, 'type')?.toLowerCase() !== 'checkbox') return []
    return [{ code: name.toUpperCase(), label: stripTags(fragment.slice(tag.length)) }]
  })
  const fields = inputValues(html)
  return {
    states,
    optionalSets,
    authorized: fields.AUTORIZADA ?? DEFAULT_AUTHORIZED,
    total: fields.TOTAL ?? DEFAULT_TOTAL,
    asksCompanyConfirmation: html.includes('pe_generar1') || /Confirmar Empresa/i.test(html),
  }
}

/**
 * EN: The company is not enrolled in the application: the page says "no está inscrito", with or without the accent.
 * ES: La empresa no está inscrita en la postulación: la página dice "no está inscrito", con o sin tilde.
 */
export const isNotEnrolled = (html: string): boolean => /no est(?:á|a) inscrit[oa]/i.test(decodeEntities(html))

/**
 * EN: The portal dropped the session between two pages: it asks to authenticate, or shows the application's front
 * page with no case on it.
 * ES: El portal soltó la sesión entre dos páginas: pide autenticarse, o muestra la portada de la postulación sin caso.
 */
export const isSessionDropped = (html: string): boolean => {
  const text = bodyText(html)
  return (
    /no se encuentra autenticado/i.test(text) ||
    (/postulaci[oó]n factura electr[oó]nica/i.test(text) && !/caso/i.test(text))
  )
}

/**
 * EN: The test-set text of a downloaded page: scripts and styles dropped, every tag a line break, entities decoded,
 * lines trimmed, blank runs collapsed. It is what `parseTestSetText` reads.
 * ES: El texto del set de pruebas de una página descargada: sin scripts ni estilos, cada etiqueta un salto de línea,
 * entidades decodificadas, líneas recortadas, corridas en blanco colapsadas. Es lo que lee `parseTestSetText`.
 */
export const setTextOf = (html: string): string =>
  decodeEntities(
    html
      .replace(/<title[\s\S]*?<\/title>/gi, '\n')
      .replace(/<script[\s\S]*?<\/script>/gi, '\n')
      .replace(/<style[\s\S]*?<\/style>/gi, '\n')
      .replace(/<[^>]+>/g, '\n'),
  )
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{2,}/g, '\n\n')
    .trim()

/**
 * EN: The attention number a set text carries, or null.
 * ES: El número de atención que trae un texto de set, o null.
 */
export const attentionNumberOf = (text: string): string | null =>
  /NUMERO DE ATENCI[OÓ]N\s*:?\s*(\d+)/i.exec(decodeEntities(text))?.[1] ?? null

/**
 * EN: The portal generated a new set on this download: it says so, or the attention number changed. A run in progress
 * must then start over, because the SII assigns new cases.
 * ES: El portal generó un set nuevo en esta descarga: lo dice, o cambió el número de atención. Una corrida en curso
 * debe entonces partir de nuevo, porque el SII asigna casos nuevos.
 */
export const isSetRegenerated = (html: string, previousAttentionNumber: string | null): boolean => {
  const text = decodeEntities(html)
  if (/Set generado correctamente|nuevos folios asignados/i.test(text)) return true
  const attention = attentionNumberOf(text)
  return previousAttentionNumber !== null && attention !== null && attention !== previousAttentionNumber
}
