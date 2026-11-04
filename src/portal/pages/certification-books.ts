import { attribute, stripTags } from '../html'

/**
 * EN: One book the SII holds, as `QEstLibro` lists it.
 * ES: Un libro que el SII tiene, tal como lo lista `QEstLibro`.
 */
export type BookHistoryEntry = {
  /** EN: Period `YYYY-MM`. ES: Período `AAAA-MM`. */
  readonly period: string
  /** EN: Purchase or sale. ES: `COMPRA` / `VENTA` — Compra o venta. */
  readonly operation: 'purchase' | 'sale'
  /** EN: State as listed, always "Recibido" in practice. ES: Estado tal como se lista, en la práctica siempre "Recibido". */
  readonly state: string
  /** EN: Book kind as listed. ES: Tipo de libro tal como se lista. */
  readonly kind: string
  /** EN: Monthly or rectification. ES: `MENSUAL` / `RECTIFICA` — Mensual o rectificación. */
  readonly periodicity: 'monthly' | 'rectification'
  /** EN: The `Codigo` of its detail link, or null. ES: El `Codigo` de su enlace de detalle, o null. */
  readonly code: string | null
}

const PERIOD = /^\d{4}-\d{2}$/
const MIN_CELLS = 6

const cellsOf = (row: string): readonly string[] =>
  [...row.matchAll(/<td\b[^>]*>([\s\S]*?)(?=<td\b|<\/tr\b|$)/gi)].map((match) => match[1])

/**
 * EN: The rows of `QEstLibro`: six cells (period, operation, state, kind, periodicity, count with a detail link);
 * rows whose period is not `YYYY-MM` are ignored. Every period listed is occupied: the page always says "Recibido"
 * and does not tell a closed book from a received one.
 * ES: Las filas de `QEstLibro`: seis celdas (período, operación, estado, tipo, periodicidad, cantidad con enlace al
 * detalle); se ignoran las filas cuyo período no es `AAAA-MM`. Todo período listado está ocupado: la página siempre
 * dice "Recibido" y no distingue un libro cerrado de uno recibido.
 */
export const parseBookHistory = (html: string): readonly BookHistoryEntry[] =>
  html.split(/<tr\b/i).flatMap((row) => {
    const cells = cellsOf(row)
    if (cells.length < MIN_CELLS) return []
    const texts = cells.map((cell) => stripTags(cell))
    if (!PERIOD.test(texts[0])) return []
    const link = /<a\b[^>]*>/i.exec(cells[5])
    const href = link === null ? null : attribute(link[0], 'href')
    return [
      {
        period: texts[0],
        operation: /VENTA/i.test(texts[1]) ? 'sale' : 'purchase',
        state: texts[2],
        kind: texts[3],
        periodicity: /RECTIF/i.test(texts[4]) ? 'rectification' : 'monthly',
        code: href === null ? null : (/Codigo=([^&\s]+)/i.exec(href)?.[1] ?? null),
      },
    ]
  })

/**
 * EN: `QEstLibro` refused the session.
 * ES: `QEstLibro` rechazó la sesión.
 */
export const isHistoryUnauthorized = (html: string): boolean =>
  html.includes('NO ESTA AUTORIZADO') || html.includes('SESION HA EXPIRADO')
