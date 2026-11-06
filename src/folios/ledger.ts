import type { Environment } from '../catalogs/codes'
import { DteError } from '../errors'

/**
 * EN: The folios of one CAF for one company in one environment.
 * ES: Los folios de un CAF para una empresa en un ambiente.
 */
export type FolioScope = {
  /** EN: Company RUT. ES: `RE` — RUT de la empresa. */
  readonly companyRut: string
  /** EN: Document type. ES: `TD` — Tipo de documento. */
  readonly type: number
  /** EN: Inclusive folio range of the CAF. ES: `RNG` — Rango de folios del CAF, inclusivo. */
  readonly range: { readonly from: number; readonly to: number }
  /** EN: Environment. ES: Ambiente. */
  readonly environment: Environment
  /** EN: `cafFingerprint` of the file, so a re-downloaded range does not share an entry. ES: `cafFingerprint` del archivo, para que un rango reobtenido no comparta entrada. */
  readonly cafFingerprint?: string
}

/**
 * EN: What is recorded when a folio goes to the SII.
 * ES: Lo que se registra cuando un folio va al SII.
 */
export type FolioSentRecord = {
  /** EN: SII tracking id. ES: `TRACKID` — Identificador del envío. */
  readonly trackId: string | null
  /** EN: When it was sent, ISO 8601. ES: Cuándo se envió, ISO 8601. */
  readonly sentAt: string
  /** EN: Anything the caller wants to keep. ES: Lo que quien llama quiera conservar. */
  readonly extra?: Readonly<Record<string, unknown>>
}

/**
 * EN: One entry of the ledger.
 * ES: Una entrada del libro.
 */
export type FolioEntry = {
  /** EN: The scope it belongs to. ES: El alcance al que pertenece. */
  readonly scope: FolioScope
  /** EN: Reserved or sent folios, ascending. ES: Folios reservados o enviados, ascendente. */
  readonly used: readonly number[]
  /** EN: Highest folio in `used`, or null. ES: Mayor folio de `used`, o null. */
  readonly lastReserved: number | null
  /** EN: Sent folios by number. ES: Folios enviados por número. */
  readonly sent: Readonly<Record<string, FolioSentRecord>>
  /** EN: Annulled folios: no entry of this company, type and environment may reserve them. ES: Folios anulados: ninguna entrada de esta empresa, tipo y ambiente puede reservarlos. */
  readonly annulled: readonly number[]
  /** EN: Last change, ISO 8601. ES: Último cambio, ISO 8601. */
  readonly updatedAt: string
}

/**
 * EN: The whole registry as one JSON-friendly value.
 * ES: Todo el registro como un solo valor apto para JSON.
 */
export type FolioLedger = {
  /** EN: Format version. ES: Versión del formato. */
  readonly version: 1
  /** EN: Entries by key. ES: Entradas por clave. */
  readonly entries: Readonly<Record<string, FolioEntry>>
}

/**
 * EN: Totals of a company and document type.
 * ES: Totales de una empresa y tipo de documento.
 */
export type FolioStats = {
  /** EN: CAFs tracked. ES: CAF registrados. */
  readonly totalEntries: number
  /** EN: Folios used. ES: Folios usados. */
  readonly totalUsed: number
  /** EN: Folios sent. ES: Folios enviados. */
  readonly totalSent: number
  /** EN: Per CAF. ES: Por CAF. */
  readonly ranges: readonly {
    readonly from: number
    readonly to: number
    readonly used: number
    readonly sent: number
    readonly remaining: number
  }[]
}

/**
 * EN: A ledger with nothing in it.
 * ES: Un libro sin nada.
 */
export const emptyLedger = (): FolioLedger => ({ version: 1, entries: {} })

const keyOf = (scope: FolioScope): string =>
  [scope.companyRut, scope.type, scope.range.from, scope.range.to, scope.environment, scope.cafFingerprint ?? ''].join(
    '|',
  )

const freshEntry = (scope: FolioScope, at: string): FolioEntry => ({
  scope,
  used: [],
  lastReserved: null,
  sent: {},
  annulled: [],
  updatedAt: at,
})

const inRange = (scope: FolioScope, folio: number): boolean => folio >= scope.range.from && folio <= scope.range.to

const withEntry = (ledger: FolioLedger, entry: FolioEntry): FolioLedger => ({
  ...ledger,
  entries: { ...ledger.entries, [keyOf(entry.scope)]: entry },
})

const annulledFolios = (ledger: FolioLedger, scope: FolioScope): ReadonlySet<number> =>
  new Set(
    Object.values(ledger.entries)
      .filter(
        (entry) =>
          entry.scope.companyRut === scope.companyRut &&
          entry.scope.type === scope.type &&
          entry.scope.environment === scope.environment,
      )
      .flatMap((entry) => entry.annulled),
  )

const outOfRange = (scope: FolioScope, folio: number): DteError =>
  new DteError('FOLIO_OUT_OF_RANGE', { folio, from: scope.range.from, to: scope.range.to, type: scope.type })

/**
 * EN: How a folio is chosen.
 * ES: Cómo se elige un folio.
 */
export type ReserveOptions = {
  /** EN: Hand out the lowest folio of the range that is neither used nor annulled, wherever the used ones lie: a folio given back, or left free below a folio marked sent, goes out again. Without it the choice moves on from the last folio reserved and never goes back below it. The certification run asks for it, because it marks used the folios the SII did not show free; only for a ledger that records every folio the range has spent. ES: Entrega el menor folio del rango que no está usado ni anulado, estén donde estén los usados: un folio devuelto, o que quedó libre bajo un folio marcado como enviado, vuelve a salir. Sin esto la elección avanza desde el último folio reservado y nunca vuelve bajo él. La corrida de certificación lo pide, porque marca como usados los folios que el SII no mostró libres; solo para un libro que registra todo folio gastado del rango. */
  readonly lowestFree?: boolean
}

/**
 * EN: The next free folio: it starts at the lowest reserved-but-unsent folio, or after the last reserved, and walks past
 * used and annulled folios; a free folio below that start is not handed out. With `lowestFree` it starts at the first
 * folio of the range instead. Either way a folio that is used or annulled is never handed out.
 * ES: El siguiente folio libre: parte en el menor folio reservado y no enviado, o después del último reservado, y avanza
 * saltando los usados y los anulados; un folio libre bajo ese punto de partida no se entrega. Con `lowestFree` parte en
 * el primer folio del rango. En ambos casos nunca se entrega un folio usado o anulado.
 * @throws {DteError} EN: `FOLIO_OUT_OF_RANGE` past the end of the range. ES: `FOLIO_OUT_OF_RANGE` pasado el fin del rango.
 */
export const reserveInLedger = (
  ledger: FolioLedger,
  scope: FolioScope,
  at: string,
  options: ReserveOptions = {},
): { readonly ledger: FolioLedger; readonly folio: number } => {
  const entry = ledger.entries[keyOf(scope)] ?? freshEntry(scope, at)
  const annulled = annulledFolios(ledger, scope)
  const used = new Set(entry.used)
  const unsent = entry.used.filter((folio) => entry.sent[String(folio)] === undefined && !annulled.has(folio))
  const pointer = unsent[0] ?? (entry.lastReserved === null ? scope.range.from : entry.lastReserved + 1)
  let folio = options.lowestFree === true ? scope.range.from : Math.max(pointer, scope.range.from)
  while (used.has(folio) || annulled.has(folio)) folio += 1
  if (folio > scope.range.to) throw outOfRange(scope, folio)
  const nextUsed = [...entry.used, folio].sort((a, b) => a - b)
  return {
    folio,
    ledger: withEntry(ledger, { ...entry, used: nextUsed, lastReserved: Math.max(...nextUsed), updatedAt: at }),
  }
}

/**
 * EN: Records a folio as sent; it counts as used even if it was never reserved here.
 * ES: Registra un folio como enviado; cuenta como usado aunque nunca se haya reservado aquí.
 * @throws {DteError} EN: `FOLIO_OUT_OF_RANGE`. ES: `FOLIO_OUT_OF_RANGE`.
 */
export const markSentInLedger = (
  ledger: FolioLedger,
  scope: FolioScope,
  folio: number,
  sent: { readonly trackId?: string; readonly sentAt?: string; readonly extra?: Readonly<Record<string, unknown>> },
  at: string,
): FolioLedger => {
  if (!inRange(scope, folio)) throw outOfRange(scope, folio)
  const entry = ledger.entries[keyOf(scope)] ?? freshEntry(scope, at)
  const used = entry.used.includes(folio) ? entry.used : [...entry.used, folio].sort((a, b) => a - b)
  const record: FolioSentRecord = {
    trackId: sent.trackId ?? null,
    sentAt: sent.sentAt ?? at,
    ...(sent.extra === undefined ? {} : { extra: sent.extra }),
  }
  return withEntry(ledger, {
    ...entry,
    used,
    lastReserved: Math.max(...used),
    sent: { ...entry.sent, [String(folio)]: record },
    updatedAt: at,
  })
}

/**
 * EN: Records folios as annulled at the SII, so no entry of this company, type and environment reserves them again.
 * ES: Registra folios como anulados en el SII, para que ninguna entrada de esta empresa, tipo y ambiente los vuelva a reservar.
 */
export const markAnnulledInLedger = (
  ledger: FolioLedger,
  scope: FolioScope,
  folios: readonly number[],
  at: string,
): FolioLedger => {
  const entry = ledger.entries[keyOf(scope)] ?? freshEntry(scope, at)
  return withEntry(ledger, { ...entry, annulled: [...new Set([...entry.annulled, ...folios])], updatedAt: at })
}

/**
 * EN: Gives folios back: they leave `used` and any sent record. An unknown entry stays unknown.
 * ES: Devuelve folios: salen de `used` y de cualquier registro de envío. Una entrada desconocida sigue desconocida.
 */
export const releaseInLedger = (
  ledger: FolioLedger,
  scope: FolioScope,
  folios: readonly number[],
  at: string,
): FolioLedger => {
  const entry = ledger.entries[keyOf(scope)]
  if (entry === undefined) return ledger
  const released = new Set(folios)
  const used = entry.used.filter((folio) => !released.has(folio))
  const sent = Object.fromEntries(Object.entries(entry.sent).filter(([folio]) => !released.has(Number(folio))))
  return withEntry(ledger, {
    ...entry,
    used,
    sent,
    lastReserved: used.length === 0 ? null : Math.max(...used),
    updatedAt: at,
  })
}

/**
 * EN: Folios of the range minus the ones used.
 * ES: Folios del rango menos los usados.
 */
export const remainingInLedger = (ledger: FolioLedger, scope: FolioScope): number =>
  scope.range.to - scope.range.from + 1 - (ledger.entries[keyOf(scope)]?.used.length ?? 0)

/**
 * EN: Totals of a company and type, optionally in one environment.
 * ES: Totales de una empresa y tipo, opcionalmente en un ambiente.
 */
export const statsOfLedger = (
  ledger: FolioLedger,
  query: { readonly companyRut: string; readonly type: number; readonly environment?: Environment },
): FolioStats => {
  const entries = Object.values(ledger.entries).filter(
    (entry) =>
      entry.scope.companyRut === query.companyRut &&
      entry.scope.type === query.type &&
      (query.environment === undefined || entry.scope.environment === query.environment),
  )
  const ranges = entries.map((entry) => ({
    from: entry.scope.range.from,
    to: entry.scope.range.to,
    used: entry.used.length,
    sent: Object.keys(entry.sent).length,
    remaining: entry.scope.range.to - entry.scope.range.from + 1 - entry.used.length,
  }))
  return {
    totalEntries: entries.length,
    totalUsed: ranges.reduce((total, range) => total + range.used, 0),
    totalSent: ranges.reduce((total, range) => total + range.sent, 0),
    ranges,
  }
}
