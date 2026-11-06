import { PORTAL_STAGE_WORDS, type CertificationStage, type DeclarationKey } from '../../catalogs/certification'
import { decodeEntities, stripTags, bodyText } from '../html'

/**
 * EN: The `pe_avance2` form as the declaration reads it: only what a quoted attribute gives.
 * ES: El formulario de `pe_avance2` tal como lo lee la declaración: solo lo que entrega un atributo entre comillas.
 */
export type DeclarationForm = {
  /** EN: Every hidden field with a quoted name. ES: Todos los campos ocultos con nombre entre comillas. */
  readonly hiddenFields: Readonly<Record<string, string>>
  /** EN: The text fields that already hold a value. ES: Los campos de texto que ya traen un valor. */
  readonly currentValues: Readonly<Record<string, string>>
  /** EN: Per row, the index of its `NUM_ENV{n}` field; a row without one is absent. ES: Por fila, el índice de su campo `NUM_ENV{n}`; una fila sin campo no aparece. */
  readonly indexes: Readonly<Partial<Record<DeclarationKey, number>>>
  /** EN: The page has hidden fields: it is a form, not a status page. ES: La página trae campos ocultos: es un formulario, no una página de estado. */
  readonly hasForm: boolean
  /** EN: A status page whose rows say errors or objections. ES: Una página de estado cuyas filas dicen errores o reparos. */
  readonly hasErrorStates: boolean
}

/**
 * EN: What a `pe_avance3` answer says, read on the page as it came.
 * ES: Lo que dice una respuesta de `pe_avance3`, leída sobre la página tal como llegó.
 */
export type DeclarationAnswer = {
  /** EN: The session is gone. ES: La sesión se perdió. */
  readonly sessionExpired: boolean
  /** EN: "contenido no corresponde". ES: "contenido no corresponde". */
  readonly contentMismatch: boolean
  /** EN: The sentence saying a date, RUT, folio or number does not match, or null. ES: La frase que dice que una fecha, RUT, folio o número no corresponde, o null. */
  readonly inconsistentData: string | null
  /** EN: The portal took the post. ES: El portal aceptó el envío del formulario. */
  readonly taken: boolean
  /** EN: Why it did not, in a word, or null. ES: Por qué no, en una palabra, o null. */
  readonly error: 'sessionExpired' | 'contentMismatch' | 'emptyAnswer' | 'invalidAnswer' | null
  /** EN: Rows named next to "ENVIO CON ERRORES O REPAROS". ES: Filas nombradas junto a "ENVIO CON ERRORES O REPAROS". */
  readonly contentErrors: readonly DeclarationKey[]
}

/**
 * EN: What the re-read form says of the rows just declared.
 * ES: Lo que dice el formulario releído de las filas recién declaradas.
 */
export type DeclarationVerification = {
  /** EN: Rows the portal shows in review. ES: Filas que el portal muestra en revisión. */
  readonly inReview: readonly DeclarationKey[]
  /** EN: Rows whose field came back empty. ES: Filas cuyo campo volvió vacío. */
  readonly empty: readonly DeclarationKey[]
}

/**
 * EN: What `pe_avance4` answered.
 * ES: Lo que respondió `pe_avance4`.
 */
export type AdvanceAnswer = {
  /** EN: The stage moved, was already there, or the portal refused. ES: La etapa avanzó, ya estaba ahí, o el portal se negó. */
  readonly outcome: 'advanced' | 'unchanged' | 'failed'
  /** EN: The sentence that decided it. ES: La frase que lo decidió. */
  readonly message: string
}

/**
 * EN: The state of one set or book on the progress page.
 * ES: El estado de un set o libro en la página de avance.
 */
export type ItemState = 'approved' | 'inReview' | 'rejected' | 'pending' | 'annulled' | 'inconsistent' | 'unknown'

/**
 * EN: The progress page (`pe_avance6`) read.
 * ES: La página de avance (`pe_avance6`) leída.
 */
export type ProgressPage = {
  /** EN: The stage wording, upper case, or null. ES: El texto de la etapa, en mayúsculas, o null. */
  readonly stage: string | null
  /** EN: The stage as the runner names it. ES: La etapa como la nombra el ejecutor. */
  readonly stageKey: CertificationStage
  /** EN: Per row, the bold text and its class. ES: Por fila, el texto en negrita y su clase. */
  readonly states: Readonly<Partial<Record<DeclarationKey, { readonly text: string; readonly state: ItemState }>>>
  /** EN: The page offers to confirm the review of an approved simulation. ES: La página ofrece confirmar la revisión de una simulación aprobada. */
  readonly simulationAwaitsConfirmation: boolean
  /** EN: The receipts row: its bold text and whether it says the company is authorised; null when the page has none. ES: La fila de boletas: su texto en negrita y si dice que la empresa está autorizada; null si la página no la trae. */
  readonly receipts: ReceiptsProgress | null
}

/**
 * EN: The receipts row of the progress page.
 * ES: La fila de boletas de la página de avance.
 */
export type ReceiptsProgress = {
  /** EN: The bold text of the row. ES: El texto en negrita de la fila. */
  readonly text: string
  /** EN: The text says conforming, approved or authorised, as a whole word and without a word that denies it. ES: El texto dice conforme, aprobado o autorizado, como palabra completa y sin una palabra que lo niegue. */
  readonly authorized: boolean
}

// The labels of `pe_avance2`, in the order they are looked for, matched on the row as it came. The lookaheads keep
// "LIBRO DE COMPRAS" and the first export set from matching inside their longer siblings.
const DECLARATION_LABELS: readonly { readonly key: DeclarationKey; readonly pattern: RegExp }[] = [
  { key: 'simulation', pattern: /SET DE SIMULACION/i },
  { key: 'salesBook', pattern: /LIBRO DE VENTAS/i },
  { key: 'purchaseBook', pattern: /LIBRO DE COMPRAS(?!\s+PARA EXENTOS)/i },
  { key: 'exemptPurchaseBook', pattern: /LIBRO DE COMPRAS PARA EXENTOS/i },
  { key: 'guideBook', pattern: /LIBRO DE GUIAS/i },
  { key: 'basic', pattern: /SET BASICO/i },
  { key: 'guide', pattern: /SET GUIA DE DESPACHO/i },
  { key: 'exempt', pattern: /SET FACTURA EXENTA/i },
  { key: 'export1', pattern: /SET DOCUMENTOS DE EXPORTACION(?!\(2\))/i },
  { key: 'export2', pattern: /SET DOCUMENTOS DE EXPORTACION\(2\)/i },
  { key: 'purchase', pattern: /SET CASO GENERAL FACTURA COMPRA/i },
  { key: 'settlement', pattern: /SET LIQUIDACION FACTURA/i },
]

// The labels of the progress page, looser: the portal abbreviates there.
const PROGRESS_LABELS: readonly { readonly key: DeclarationKey; readonly pattern: RegExp }[] = [
  { key: 'basic', pattern: /SET BASICO/i },
  { key: 'guide', pattern: /SET GUIA[\s\S]*?DESP/i },
  { key: 'exempt', pattern: /SET FACTURA EXENTA/i },
  { key: 'purchase', pattern: /SET CASO GENERAL FACTURA COMPRA/i },
  { key: 'simulation', pattern: /SET(?: DE)? SIMULACION/i },
  { key: 'salesBook', pattern: /LIBRO[\s\S]*?VENTA/i },
  { key: 'exemptPurchaseBook', pattern: /LIBRO DE COMPRAS PARA EXENTOS/i },
  { key: 'purchaseBook', pattern: /LIBRO DE COMPRAS(?!\s+PARA EXENTOS)/i },
  { key: 'guideBook', pattern: /LIBRO[\s\S]*?GUIA/i },
]

// The names the answer of `pe_avance3` is searched for next to "ENVIO CON ERRORES O REPAROS".
const CONTENT_ERROR_NAMES: readonly { readonly key: DeclarationKey; readonly name: string }[] = [
  { key: 'salesBook', name: 'LIBRO DE VENTAS' },
  { key: 'exemptPurchaseBook', name: 'LIBRO DE COMPRAS PARA EXENTOS' },
  { key: 'purchaseBook', name: 'LIBRO DE COMPRAS' },
  { key: 'guideBook', name: 'LIBRO DE GUIAS' },
  { key: 'basic', name: 'SET BASICO' },
  { key: 'guide', name: 'SET GUIA DE DESPACHO' },
  { key: 'exempt', name: 'SET FACTURA EXENTA' },
  { key: 'purchase', name: 'SET CASO GENERAL FACTURA COMPRA' },
  { key: 'simulation', name: 'SET DE SIMULACION' },
]

const spaced = (name: string): string => name.replace(/ /g, '\\s+')

// A name that begins a longer one must not be followed by what the longer one adds.
const contentErrorPattern = (name: string): RegExp => {
  const longer = CONTENT_ERROR_NAMES.map((entry) => entry.name).filter(
    (other) => other !== name && other.startsWith(name),
  )
  const guard =
    longer.length === 0 ? '' : `(?!\\s+(?:${longer.map((other) => spaced(other.slice(name.length)).trim()).join('|')}))`
  return new RegExp(`${spaced(name)}${guard}[\\s\\S]{0,200}?ENVIO CON ERRORES O REPAROS`, 'i')
}

const STAGE_PATTERNS: readonly RegExp[] = [
  /paso\s*<b>\s*([^<]+)<\/b>/i,
  /etapa[:\s]+<b>([^<]+)<\/b>/i,
  /etapa\s*<b>\s*([^<]+)<\/b>/i,
  /ETAPA\s+DE\s+([A-ZÁÉÍÓÚÑ\s]+)/,
]

const rowsOf = (html: string): readonly string[] => html.split(/<tr\b/i)

const boldText = (fragment: string): string | null => {
  const match = /<b>([^<]+)<\/b>/i.exec(fragment)
  return match === null ? null : stripTags(match[1]).toUpperCase()
}

const sentenceAround = (text: string, pattern: RegExp): string | null => {
  const match = pattern.exec(text)
  if (match === null) return null
  const start = text.lastIndexOf('.', match.index) + 1
  const end = text.indexOf('.', match.index + match[0].length)
  return text.slice(start, end === -1 ? text.length : end).trim()
}

const STATUS_ROW =
  /<tr[^>]*>\s*<td[^>]*>\s*<font[^>]*>([^<]+)<\/font>\s*<\/td>\s*<td[^>]*>\s*<font[^>]*><b>([^<]+)<\/b><\/font>/gi

/**
 * EN: Reads the `pe_avance2` form as the reference reads it. Only an input whose name is quoted counts: the hidden ones
 * give the hidden fields, the text ones that hold a quoted value give the values already declared. Each row is found
 * by its label on the row as it came (the SII reorders the indexes as sets are approved, so a row is never found by
 * position) and gives the index of its `NAME="NUM_ENV{n}"` field when it has one. A page without hidden fields is a
 * status page, read for rows that say errors or objections.
 * ES: Lee el formulario de `pe_avance2` como lo lee la referencia. Solo cuenta un input cuyo nombre va entre comillas:
 * los ocultos dan los campos ocultos, los de texto que traen un valor entre comillas dan los valores ya declarados.
 * Cada fila se busca por su etiqueta sobre la fila tal como llegó (el SII reordena los índices a medida que aprueba
 * sets, así que una fila nunca se busca por posición) y entrega el índice de su campo `NAME="NUM_ENV{n}"` cuando lo
 * tiene. Una página sin campos ocultos es una página de estado, y se lee por filas que digan errores o reparos.
 */
export const parseDeclarationForm = (html: string): DeclarationForm => {
  const hiddenFields: Record<string, string> = {}
  const currentValues: Record<string, string> = {}
  for (const tag of html.match(/<input[^>]+>/gi) ?? []) {
    const name = /name\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]
    if (name === undefined) continue
    const value = /value\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? ''
    if (/type\s*=\s*["']?HIDDEN["']?/i.test(tag)) hiddenFields[name] = value
    else if (/type\s*=\s*["']?text["']?/i.test(tag) && value !== '') currentValues[name] = value
  }
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1])
  const indexes: Partial<Record<DeclarationKey, number>> = {}
  for (const label of DECLARATION_LABELS) {
    const row = rows.find((candidate) => label.pattern.test(candidate))
    const field = row === undefined ? null : /NAME="NUM_ENV(\d+)"/i.exec(row)
    if (field !== null) indexes[label.key] = Number.parseInt(field[1], 10)
  }
  const hasForm = Object.keys(hiddenFields).length > 0
  return {
    hiddenFields,
    currentValues,
    indexes,
    hasForm,
    hasErrorStates: !hasForm && [...html.matchAll(STATUS_ROW)].some((row) => /REPAROS|ERRORES/i.test(row[2])),
  }
}

/**
 * EN: Classifies the body `pe_avance3` answers, on the page as it came and with the case the reference looks for: the
 * session, a content mismatch, inconsistent data (a date, RUT, folio or number that does not match: definitive),
 * whether the post was taken, and the rows named with "ENVIO CON ERRORES O REPAROS" within 200 characters. That
 * wording is a state of an envelope, never an error of the post.
 * ES: Clasifica el cuerpo que responde `pe_avance3`, sobre la página tal como llegó y con las mayúsculas que busca la
 * referencia: la sesión, contenido que no corresponde, dato inconsistente (fecha, RUT, folio o número que no
 * corresponde: definitivo), si el envío del formulario fue aceptado, y las filas nombradas con "ENVIO CON ERRORES O
 * REPAROS" a no más de 200 caracteres. Esa frase es un estado de un envío, nunca un error del formulario.
 */
export const classifyDeclarationAnswer = (html: string): DeclarationAnswer => {
  const lower = html.toLowerCase()
  const hasError =
    lower.replace(/errores o reparos/g, 'reparos_estado').includes('error') && !html.includes('Error de Sesión')
  const hasSuccess = html.includes('exitosamente') || html.includes('Avance declarado') || html.includes('actualizado')
  const contentMismatch = lower.includes('contenido no corresponde')
  const sessionExpired = lower.includes('no se encuentra autenticado') || lower.includes('error de sesi')
  const inconsistent =
    /((?:FECHA|RUT|FOLIO|NUMERO|N[UÚ]MERO)[^.<]{0,40}?NO\s+(?:CORRESPONDE|COINCIDE)[^.<]{0,40})/i.exec(
      html.replace(/<[^>]*>/g, ' '),
    )
  const error = sessionExpired
    ? 'sessionExpired'
    : contentMismatch
      ? 'contentMismatch'
      : html === ''
        ? 'emptyAnswer'
        : hasError && !hasSuccess
          ? 'invalidAnswer'
          : null
  return {
    sessionExpired,
    contentMismatch,
    inconsistentData: inconsistent === null ? null : inconsistent[1].replace(/\s+/g, ' ').trim(),
    taken: (!hasError || hasSuccess) && !sessionExpired && !contentMismatch,
    error,
    contentErrors: CONTENT_ERROR_NAMES.filter((entry) => contentErrorPattern(entry.name).test(html)).map(
      (entry) => entry.key,
    ),
  }
}

/**
 * EN: The answer says the SII has not processed the envelopes yet, in the wordings the reference looks for on the page
 * as it came. "No se encuentra" is one of them, so a lost session reads as "not yet" and is asked again.
 * ES: La respuesta dice que el SII aún no procesó los envíos, con las frases que busca la referencia sobre la página
 * tal como llegó. "No se encuentra" es una de ellas, así que una sesión perdida se lee como "todavía no" y se
 * pregunta de nuevo.
 */
export const saysNotProcessedYet = (html: string): boolean =>
  html.includes('no ha sido procesado') ||
  html.includes('aún no está disponible') ||
  html.includes('intente más tarde') ||
  html.includes('no se encuentra')

/**
 * EN: What the re-read `pe_avance2` says of each row just declared, as the reference verifies it. For each row, the
 * pieces of the page between `</tr>` are walked: the first one that holds the row's `NAME="NUM_ENV{n}"` field, or
 * that names the row without a field and shows a state, decides. "REVISADO CONFORME" in bold is fine, "EN REVISION" is
 * in review, a field with an empty value is empty; a field that holds any value, and a row that is nowhere, are fine.
 * ES: Lo que dice `pe_avance2` releído de cada fila recién declarada, como lo verifica la referencia. Por cada fila se
 * recorren los trozos de la página entre `</tr>`: decide el primero que trae el campo `NAME="NUM_ENV{n}"` de la fila,
 * o que nombra la fila sin campo y muestra un estado. "REVISADO CONFORME" en negrita está bien, "EN REVISION" es en
 * revisión, un campo con valor vacío es vacío; un campo que trae cualquier valor, y una fila que no está, están bien.
 */
export const verifyDeclaration = (
  html: string,
  declared: readonly (readonly [DeclarationKey, number])[],
): DeclarationVerification => {
  const pieces = html.split(/<\/tr>/i)
  const inReview: DeclarationKey[] = []
  const empty: DeclarationKey[] = []
  for (const [key, index] of declared) {
    const field = new RegExp(`NAME="NUM_ENV${index}"`, 'i')
    const label = DECLARATION_LABELS.find((candidate) => candidate.key === key)!.pattern
    for (const piece of pieces) {
      const hasField = field.test(piece)
      if (!hasField && !label.test(piece)) continue
      if (/<b>[^<]*REVISADO CONFORME[^<]*<\/b>/i.test(piece)) break
      if (/EN REVISION/i.test(piece)) {
        inReview.push(key)
        break
      }
      if (!hasField) continue
      const value = new RegExp(`NAME="NUM_ENV${index}"[^>]*value="([^"]*)"`, 'i').exec(piece)?.[1] ?? ''
      if (value.trim() === '') empty.push(key)
      break
    }
  }
  return { inReview, empty }
}

/**
 * EN: What `pe_avance4` answered, from its Spanish text only: HTTP is always 200 and the word "error" is in every
 * page's script. "Ya se encuentra en el paso" is not a failure.
 * ES: Lo que respondió `pe_avance4`, solo por su texto en español: HTTP siempre es 200 y la palabra "error" está en el
 * script de toda página. "Ya se encuentra en el paso" no es una falla.
 */
export const classifyAdvanceAnswer = (html: string): AdvanceAnswer => {
  const text = bodyText(html)
  const advanced = sentenceAround(text, /ha pasado al paso|ha finalizado con la certificaci/i)
  if (advanced !== null) return { outcome: 'advanced', message: advanced }
  const unchanged = sentenceAround(text, /ya se encuentra en el paso/i)
  if (unchanged !== null) return { outcome: 'unchanged', message: unchanged }
  return { outcome: 'failed', message: text.slice(0, 400) }
}

/**
 * EN: The class of a state wording.
 * ES: La clase de un texto de estado.
 */
export const classifyItemState = (text: string): ItemState => {
  const upper = decodeEntities(text).toUpperCase()
  if (/NO CORRESPONDE|NO COINCIDE|FECHA INVALIDA/.test(upper)) return 'inconsistent'
  if (upper.includes('REVISADO CONFORME')) return 'approved'
  if (upper.includes('EN REVISION')) return 'inReview'
  if (/RECHAZADO|ERRORES|REPARO/.test(upper)) return 'rejected'
  if (upper.includes('POR REALIZAR')) return 'pending'
  if (upper.includes('ANULADO')) return 'annulled'
  return 'unknown'
}

/**
 * EN: The runner's stage for a portal wording; the test sets when nothing later is named.
 * ES: La etapa del ejecutor para un texto del portal; los sets de prueba cuando no nombra nada posterior.
 */
export const portalStageOf = (stage: string | null): CertificationStage => {
  const upper = (stage ?? '').toUpperCase()
  return PORTAL_STAGE_WORDS.find((entry) => entry.words.some((word) => upper.includes(word)))?.stage ?? 'testSets'
}

const RECEIPTS_ROW = /BOLETA[^<]*<\/[^>]+>\s*<[^>]+><b>([^<]+)<\/b>/i
const RECEIPTS_AUTHORIZED = /\b(?:CONFORME|APROBAD[OA]|AUTORIZAD[OA])\b/i
const RECEIPTS_REFUSED = /\bNO\b|\bSIN\b|RECHAZ|REPARO|PENDIENTE/i

// The bold text after the cell that names the receipts. It reads as authorised only on a whole word that says so and
// no word that denies it: "NO AUTORIZADO" and "DESAUTORIZADA" are not authorisations, and anything unknown is not one.
const receiptsProgressOf = (html: string): ReceiptsProgress | null => {
  const row = RECEIPTS_ROW.exec(html)
  if (row === null) return null
  const text = row[1].trim()
  return { text, authorized: RECEIPTS_AUTHORIZED.test(text) && !RECEIPTS_REFUSED.test(text) }
}

/**
 * EN: Reads the progress page: the stage from the first pattern that matches, and per set or book the first bold text
 * after its label, row by row (a page-wide search once took the next row's state), plus whether an approved
 * simulation awaits its confirmation.
 * ES: Lee la página de avance: la etapa por el primer patrón que calza, y por set o libro el primer texto en negrita
 * después de su etiqueta, fila por fila (una búsqueda sobre toda la página ya tomó el estado de la fila siguiente),
 * más si una simulación aprobada espera su confirmación.
 */
export const parseProgressPage = (html: string): ProgressPage => {
  const stageMatch = STAGE_PATTERNS.map((pattern) => pattern.exec(html)).find((match) => match !== null)
  const stage = stageMatch === undefined ? null : stripTags(stageMatch[1]).toUpperCase()
  const states: Partial<Record<DeclarationKey, { readonly text: string; readonly state: ItemState }>> = {}
  for (const row of rowsOf(html)) {
    const text = stripTags(row)
    for (const label of PROGRESS_LABELS) {
      if (label.key in states) continue
      const at = label.pattern.exec(text)
      if (at === null) continue
      const bold = boldText(row.slice(Math.max(0, row.search(label.pattern))))
      if (bold !== null) states[label.key] = { text: bold, state: classifyItemState(bold) }
    }
  }
  return {
    stage,
    stageKey: portalStageOf(stage),
    states,
    simulationAwaitsConfirmation:
      html.includes('pe_avance3') && /SET DE SIMULACION/i.test(html) && /Confirmar Revisi/i.test(decodeEntities(html)),
    receipts: receiptsProgressOf(html),
  }
}
