import { PORTAL_STAGE_WORDS, type CertificationStage, type DeclarationKey } from '../../catalogs/certification'
import { attribute, decodeEntities, stripTags, bodyText } from '../html'

/**
 * EN: One row of the declaration form, mapped by its label.
 * ES: Una fila del formulario de declaración, identificada por su etiqueta.
 */
export type DeclarationRow = {
  /** EN: The row's key. ES: La clave de la fila. */
  readonly key: DeclarationKey
  /** EN: Label as the portal writes it. ES: Etiqueta tal como la escribe el portal. */
  readonly label: string
  /** EN: Index of its `NUM_ENV{n}` input, or null when the row has no input (already reviewed or in review). ES: Índice de su `NUM_ENV{n}`, o null si la fila no tiene campo (ya revisada o en revisión). */
  readonly index: number | null
  /** EN: Current value of `NUM_ENV{n}`, or null without an input. ES: Valor actual de `NUM_ENV{n}`, o null sin campo. */
  readonly value: string | null
  /** EN: The bold state, upper case, or the hidden `EST{n}` code, or null. ES: El estado en negrita, en mayúsculas, o el código oculto `EST{n}`, o null. */
  readonly state: string | null
}

/**
 * EN: The `pe_avance2` form as the declaration needs it.
 * ES: El formulario de `pe_avance2` tal como lo necesita la declaración.
 */
export type DeclarationForm = {
  /** EN: The rows the page maps. ES: Las filas que la página identifica. */
  readonly rows: readonly DeclarationRow[]
  /** EN: Every hidden field. ES: Todos los campos ocultos. */
  readonly hiddenFields: Readonly<Record<string, string>>
  /** EN: `NUM_ENV`/`FEC_ENV` values already on the page. ES: Valores de `NUM_ENV`/`FEC_ENV` que ya trae la página. */
  readonly currentValues: Readonly<Record<string, string>>
  /** EN: Hidden `TOTREG`, 10 when absent. ES: `TOTREG` oculto, 10 si falta. */
  readonly totalRows: number
  /** EN: No hidden field at all: a status page, not a form. ES: Ningún campo oculto: una página de estado, no un formulario. */
  readonly isStatusPage: boolean
  /** EN: Some row says errors or objections. ES: Alguna fila dice errores o reparos. */
  readonly hasErrorStates: boolean
}

/**
 * EN: What a `pe_avance3` answer says.
 * ES: Lo que dice una respuesta de `pe_avance3`.
 */
export type DeclarationAnswer = {
  /** EN: The session is gone. ES: La sesión se perdió. */
  readonly sessionExpired: boolean
  /** EN: "contenido no corresponde". ES: "contenido no corresponde". */
  readonly contentMismatch: boolean
  /** EN: The SII has not processed the envelope yet. ES: El SII aún no procesó el envío. */
  readonly notProcessed: boolean
  /** EN: The sentence saying a date, RUT, folio or number does not match, or null. ES: La frase que dice que una fecha, RUT, folio o número no corresponde, o null. */
  readonly inconsistentData: string | null
  /** EN: A success wording. ES: Una frase de éxito. */
  readonly hasSuccess: boolean
  /** EN: The word "error" outside "errores o reparos" and the session error. ES: La palabra "error" fuera de "errores o reparos" y del error de sesión. */
  readonly hasError: boolean
  /** EN: Rows named next to "ENVIO CON ERRORES O REPAROS". ES: Filas nombradas junto a "ENVIO CON ERRORES O REPAROS". */
  readonly contentErrors: readonly DeclarationKey[]
  /** EN: The portal took the declaration. ES: El portal aceptó la declaración. */
  readonly accepted: boolean
}

/**
 * EN: What the re-read form says of a row just declared.
 * ES: Lo que dice el formulario releído de una fila recién declarada.
 */
export type VerificationState = 'approved' | 'inReview' | 'empty' | 'kept' | 'mismatch' | 'missing'

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

const DEFAULT_TOTAL_ROWS = 10

// The labels of `pe_avance2`, matched on the row's text. The lookaheads keep "LIBRO DE COMPRAS" and "SET DOCUMENTOS DE
// EXPORTACION" from matching inside their longer siblings.
const DECLARATION_LABELS: readonly { readonly key: DeclarationKey; readonly pattern: RegExp }[] = [
  { key: 'simulation', pattern: /SET DE SIMULACION/i },
  { key: 'salesBook', pattern: /LIBRO DE VENTAS/i },
  { key: 'exemptPurchaseBook', pattern: /LIBRO DE COMPRAS PARA EXENTOS/i },
  { key: 'purchaseBook', pattern: /LIBRO DE COMPRAS(?!\s+PARA EXENTOS)/i },
  { key: 'guideBook', pattern: /LIBRO DE GUIAS/i },
  { key: 'basic', pattern: /SET BASICO/i },
  { key: 'guide', pattern: /SET GUIA DE DESPACHO/i },
  { key: 'exempt', pattern: /SET FACTURA EXENTA/i },
  { key: 'export2', pattern: /SET DOCUMENTOS DE EXPORTACION\s*\(2\)/i },
  { key: 'export1', pattern: /SET DOCUMENTOS DE EXPORTACION(?!\s*\(2\))/i },
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

const CONTENT_ERROR_LABELS: readonly { readonly key: DeclarationKey; readonly pattern: string }[] = [
  { key: 'salesBook', pattern: 'LIBRO DE VENTAS' },
  { key: 'exemptPurchaseBook', pattern: 'LIBRO DE COMPRAS PARA EXENTOS' },
  { key: 'purchaseBook', pattern: 'LIBRO DE COMPRAS(?!\\s+PARA EXENTOS)' },
  { key: 'guideBook', pattern: 'LIBRO DE GUIAS' },
  { key: 'basic', pattern: 'SET BASICO' },
  { key: 'guide', pattern: 'SET GUIA DE DESPACHO' },
  { key: 'exempt', pattern: 'SET FACTURA EXENTA' },
  { key: 'purchase', pattern: 'SET CASO GENERAL FACTURA COMPRA' },
  { key: 'simulation', pattern: 'SET DE SIMULACION' },
]

const STAGE_PATTERNS: readonly RegExp[] = [
  /paso\s*<b>\s*([^<]+)<\/b>/i,
  /etapa[:\s]+<b>([^<]+)<\/b>/i,
  /etapa\s*<b>\s*([^<]+)<\/b>/i,
  /ETAPA\s+DE\s+([A-ZÁÉÍÓÚÑ\s]+)/,
]

const rowsOf = (html: string): readonly string[] => html.split(/<tr\b/i)

const inputTagsWithType = (
  html: string,
): readonly { readonly type: string; readonly name: string; readonly value: string }[] =>
  (html.match(/<input\b[^>]*>/gi) ?? []).flatMap((tag) => {
    const name = attribute(tag, 'name')
    if (name === null) return []
    return [{ type: (attribute(tag, 'type') ?? 'text').toLowerCase(), name, value: attribute(tag, 'value') ?? '' }]
  })

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

/**
 * EN: Reads the `pe_avance2` form: the rows by label, each with the index of its `NUM_ENV` input (the SII reorders
 * the indexes as sets are approved, so a row is never found by position), the hidden fields, the values already
 * declared and `TOTREG`.
 * ES: Lee el formulario de `pe_avance2`: las filas por etiqueta, cada una con el índice de su `NUM_ENV` (el SII
 * reordena los índices a medida que aprueba sets, así que una fila nunca se busca por posición), los campos ocultos,
 * los valores ya declarados y `TOTREG`.
 */
export const parseDeclarationForm = (html: string): DeclarationForm => {
  const inputs = inputTagsWithType(html)
  const hiddenFields = Object.fromEntries(
    inputs.filter((input) => input.type === 'hidden').map((i) => [i.name, i.value]),
  )
  const currentValues = Object.fromEntries(
    inputs
      .filter((input) => input.type !== 'hidden' && /^(NUM_ENV|FEC_ENV)\d+$/i.test(input.name) && input.value !== '')
      .map((input) => [input.name, input.value]),
  )
  const rows = rowsOf(html).flatMap((row) => {
    const text = stripTags(row)
    const label = DECLARATION_LABELS.find((candidate) => candidate.pattern.test(text))
    if (label === undefined) return []
    const input = /name\s*=\s*["']?NUM_ENV(\d+)/i.exec(row)
    const index = input === null ? null : Number.parseInt(input[1], 10)
    const value = index === null ? null : inputs.find((i) => i.name === `NUM_ENV${index}`)!.value
    const state = boldText(row) ?? (index === null ? null : (hiddenFields[`EST${index}`] ?? null))
    return [{ key: label.key, label: label.pattern.exec(text)![0].toUpperCase(), index, value, state }]
  })
  const total = Number.parseInt(hiddenFields.TOTREG ?? '', 10)
  return {
    rows,
    hiddenFields,
    currentValues,
    totalRows: Number.isNaN(total) ? DEFAULT_TOTAL_ROWS : total,
    isStatusPage: Object.keys(hiddenFields).length === 0,
    hasErrorStates: rows.some((row) => /REPAROS|ERRORES/i.test(row.state ?? '')),
  }
}

/**
 * EN: Classifies the body `pe_avance3` answers: the session, a content mismatch, "not processed yet", inconsistent
 * data (a date, RUT, folio or number that does not match: definitive), success, error, and the rows named with
 * "ENVIO CON ERRORES O REPAROS". That wording is a state, not an error.
 * ES: Clasifica el cuerpo que responde `pe_avance3`: la sesión, contenido que no corresponde, "aún no procesado", dato
 * inconsistente (fecha, RUT, folio o número que no corresponde: definitivo), éxito, error, y las filas nombradas con
 * "ENVIO CON ERRORES O REPAROS". Esa frase es un estado, no un error.
 */
export const classifyDeclarationAnswer = (html: string): DeclarationAnswer => {
  const text = bodyText(html)
  const lower = text.toLowerCase()
  const sessionExpired = /no se encuentra autenticado|error de sesi/i.test(text)
  const contentMismatch = /contenido no corresponde/i.test(text)
  const inconsistentData = sentenceAround(text, /(FECHA|RUT|FOLIO|N[UÚ]MERO)[^.]{0,40}?NO\s+(CORRESPONDE|COINCIDE)/i)
  const hasSuccess = /exitosamente|avance declarado|actualizado/i.test(text)
  const hasError = lower
    .replace(/errores o reparos/g, '')
    .replace(/error de sesi[oó]n/g, '')
    .includes('error')
  const contentErrors = CONTENT_ERROR_LABELS.filter((label) =>
    new RegExp(`${label.pattern}[\\s\\S]{0,200}?ENVIO CON ERRORES O REPAROS`, 'i').test(text),
  ).map((label) => label.key)
  return {
    sessionExpired,
    contentMismatch,
    notProcessed: /no ha sido procesado|a[uú]n no est[aá] disponible|intente m[aá]s tarde|no se encuentra/i.test(text),
    inconsistentData,
    hasSuccess,
    hasError,
    contentErrors,
    accepted: (!hasError || hasSuccess) && !sessionExpired && !contentMismatch,
  }
}

/**
 * EN: What the re-read `pe_avance2` says of each declared row: approved or in review when its input is gone, empty
 * when the input is still there and blank (the declaration was not saved), kept when it holds the track id declared,
 * mismatch when it holds another, missing when the row is not on the page.
 * ES: Lo que dice `pe_avance2` releído de cada fila declarada: aprobada o en revisión si su campo desapareció, vacía si
 * el campo sigue ahí en blanco (la declaración no se guardó), conservada si trae el track id declarado, distinta si
 * trae otro, ausente si la fila no está en la página.
 */
export const verifyDeclaration = (
  html: string,
  declared: Readonly<Partial<Record<DeclarationKey, string>>>,
): Readonly<Partial<Record<DeclarationKey, VerificationState>>> => {
  const { rows } = parseDeclarationForm(html)
  return Object.fromEntries(
    Object.entries(declared).map(([key, trackId]) => {
      const row = rows.find((candidate) => candidate.key === key)
      if (row === undefined) return [key, 'missing']
      if (row.index === null) {
        if ((row.state ?? '').includes('REVISADO CONFORME')) return [key, 'approved']
        if ((row.state ?? '').includes('EN REVISION')) return [key, 'inReview']
        return [key, 'kept']
      }
      if (row.value === '') return [key, 'empty']
      return [key, row.value!.replace(/^0+(?=\d)/, '') === trackId ? 'kept' : 'mismatch']
    }),
  )
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
