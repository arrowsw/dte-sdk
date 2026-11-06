import forge from 'node-forge'
import type { Environment } from '../catalogs/codes'
import {
  emptyLedger,
  markAnnulledInLedger,
  markSentInLedger,
  releaseInLedger,
  remainingInLedger,
  reserveInLedger,
  statsOfLedger,
  type FolioLedger,
  type FolioScope,
  type FolioStats,
  type ReserveOptions,
} from './ledger'

/**
 * EN: Local control of folios: which were reserved, sent and annulled. A service with its own database implements these
 * functions with its own transactions; the rest build one with `createFolioRegistry`.
 * ES: Control local de folios: cuáles se reservaron, enviaron y anularon. Un servicio con su propia base implementa estas
 * funciones con sus propias transacciones; el resto arma una con `createFolioRegistry`.
 */
export type FolioRegistry = {
  /** EN: Reserves the next free folio: after the last one reserved, or from the lowest reserved and not sent; never one that is used or annulled. With `lowestFree` it is the lowest free folio of the whole range, which the certification run asks for: an implementation of its own must honour the option to be used in a run. ES: Reserva el siguiente folio libre: después del último reservado, o desde el menor reservado y no enviado; nunca uno usado o anulado. Con `lowestFree` es el menor folio libre de todo el rango, que es lo que pide la corrida de certificación: una implementación propia debe respetar la opción para usarse en una corrida. */
  readonly reserve: (scope: FolioScope, options?: ReserveOptions) => Promise<number>
  /** EN: Records a folio as sent. ES: Registra un folio como enviado. */
  readonly markSent: (
    scope: FolioScope,
    folio: number,
    sent?: { readonly trackId?: string; readonly sentAt?: string; readonly extra?: Readonly<Record<string, unknown>> },
  ) => Promise<void>
  /** EN: Records folios as annulled at the SII. ES: Registra folios como anulados en el SII. */
  readonly markAnnulled: (scope: FolioScope, folios: readonly number[]) => Promise<void>
  /** EN: Gives folios back. ES: Devuelve folios. */
  readonly release: (scope: FolioScope, folios: readonly number[]) => Promise<void>
  /** EN: Folios of the range still unused. ES: Folios del rango aún sin usar. */
  readonly remaining: (scope: FolioScope) => Promise<number>
  /** EN: Totals of a company and type. ES: Totales de una empresa y tipo. */
  readonly stats: (query: {
    readonly companyRut: string
    readonly type: number
    readonly environment?: Environment
  }) => Promise<FolioStats>
}

/**
 * EN: Where a ledger is kept.
 * ES: Dónde se guarda un libro.
 */
export type FolioLedgerStore = {
  /** EN: The stored ledger, or null. ES: El libro guardado, o null. */
  readonly load: () => Promise<FolioLedger | null>
  /** EN: Replaces the stored ledger. ES: Reemplaza el libro guardado. */
  readonly save: (ledger: FolioLedger) => Promise<void>
}

/**
 * EN: First 12 hex characters of the SHA-256 of a CAF file, to tell apart two files for one range.
 * ES: Primeros 12 caracteres hexadecimales del SHA-256 de un archivo CAF, para distinguir dos archivos de un mismo rango.
 */
export const cafFingerprint = (xml: string): string => {
  const md = forge.md.sha256.create()
  md.update(xml, 'utf8')
  return md.digest().toHex().slice(0, 12)
}

/**
 * EN: A registry over a store. Calls run one after another inside this process, each reading the ledger fresh; several
 * processes need a store or a registry of their own that takes care of it.
 * ES: Un registro sobre un almacén. Las llamadas corren una tras otra dentro de este proceso, cada una leyendo el libro de
 * nuevo; varios procesos necesitan un almacén o un registro propio que se haga cargo.
 * @param store EN: where the ledger lives. ES: dónde vive el libro.
 * @param now EN: clock. ES: reloj.
 */
export const createFolioRegistry = (store: FolioLedgerStore, now: () => Date = () => new Date()): FolioRegistry => {
  const queue = { tail: Promise.resolve() as Promise<unknown> }
  const exclusive = <T>(run: () => Promise<T>): Promise<T> => {
    const turn = queue.tail.then(run, run)
    queue.tail = turn
    return turn
  }
  const update = <T>(
    change: (ledger: FolioLedger, at: string) => { readonly ledger: FolioLedger; readonly value: T },
  ) =>
    exclusive(async () => {
      const { ledger, value } = change((await store.load()) ?? emptyLedger(), now().toISOString())
      await store.save(ledger)
      return value
    })
  const read = async (): Promise<FolioLedger> => (await store.load()) ?? emptyLedger()
  return {
    reserve: (scope, options) =>
      update((ledger, at) => {
        const reserved = reserveInLedger(ledger, scope, at, options)
        return { ledger: reserved.ledger, value: reserved.folio }
      }),
    markSent: (scope, folio, sent = {}) =>
      update((ledger, at) => ({ ledger: markSentInLedger(ledger, scope, folio, sent, at), value: undefined })),
    markAnnulled: (scope, folios) =>
      update((ledger, at) => ({ ledger: markAnnulledInLedger(ledger, scope, folios, at), value: undefined })),
    release: (scope, folios) =>
      update((ledger, at) => ({ ledger: releaseInLedger(ledger, scope, folios, at), value: undefined })),
    remaining: (scope) => exclusive(async () => remainingInLedger(await read(), scope)),
    stats: (query) => exclusive(async () => statsOfLedger(await read(), query)),
  }
}

/**
 * EN: A registry that lives in memory: for tests and short runs.
 * ES: Un registro que vive en memoria: para tests y corridas cortas.
 * @param now EN: clock. ES: reloj.
 */
export const createMemoryFolioRegistry = (now?: () => Date): FolioRegistry => {
  const box: { ledger: FolioLedger | null } = { ledger: null }
  return createFolioRegistry(
    {
      load: async () => box.ledger,
      save: async (ledger) => {
        box.ledger = ledger
      },
    },
    now,
  )
}
