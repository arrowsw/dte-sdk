import { DteError } from '../errors'
import { siiRutOrNull, type SiiRut } from '../model/rut'
import { toIsoDate } from '../time/chile'
import type { PeriodDocument } from './pages/rcv'

/**
 * EN: The caller's own record of a document of a period, with what `reconcilePeriodDocuments` compares. The type, the
 * RUT of the other party and the folio identify it; an amount or a date left out is not compared.
 * ES: El registro propio del llamador de un documento de un período, con lo que compara `reconcilePeriodDocuments`. El
 * tipo, el RUT de la contraparte y el folio lo identifican; un monto o una fecha que se omite no se compara.
 */
export type PeriodRecord = {
  /** EN: Document type. ES: `tipoDoc` — Tipo de documento. */
  readonly type: number
  /** EN: Folio. ES: `folio` — Folio. */
  readonly folio: number
  /** EN: RUT of the other party, in any shape: the receiver of an issued document, the issuer of a received one. ES: `rutReceptor` + `dvReceptor` — RUT de la contraparte, en cualquier forma: el receptor de un documento emitido, el emisor de uno recibido. */
  readonly counterpartyRut: string
  /** EN: Issue date, `YYYY-MM-DD` (or `DD-MM-YYYY`, `DD/MM/YYYY`); not compared when absent. ES: `fechaEmision` — Fecha de emisión, `AAAA-MM-DD` (o `DD-MM-AAAA`, `DD/MM/AAAA`); no se compara si falta. */
  readonly issueDate?: string
  /** EN: Exempt amount, whole pesos; not compared when absent. ES: `mntExento` — Monto exento, en pesos enteros; no se compara si falta. */
  readonly exemptAmount?: number
  /** EN: Net amount, whole pesos; not compared when absent. ES: `mntNeto` — Monto neto, en pesos enteros; no se compara si falta. */
  readonly netAmount?: number
  /** EN: VAT amount, whole pesos; not compared when absent. ES: `mntIva` — Monto de IVA, en pesos enteros; no se compara si falta. */
  readonly vatAmount?: number
  /** EN: Total amount, whole pesos; not compared when absent. ES: `mntTotal` — Monto total, en pesos enteros; no se compara si falta. */
  readonly totalAmount?: number
}

/**
 * EN: A field compared by `reconcilePeriodDocuments`.
 * ES: Un campo que compara `reconcilePeriodDocuments`.
 */
export type PeriodRecordField = 'issueDate' | 'exemptAmount' | 'netAmount' | 'vatAmount' | 'totalAmount'

/**
 * EN: A field whose two sides differ.
 * ES: Un campo cuyos dos lados difieren.
 */
export type PeriodDifference = {
  /** EN: The field. ES: El campo. */
  readonly field: PeriodRecordField
  /** EN: The register's value: a date in ISO form when it reads as one, as the SII wrote it otherwise; null when the register does not bring it. ES: El valor del registro: una fecha en forma ISO si se lee como tal, como la escribió el SII si no; null si el registro no lo trae. */
  readonly register: string | number | null
  /** EN: The caller's value, a date in ISO form. ES: El valor del llamador, una fecha en forma ISO. */
  readonly record: string | number
}

/**
 * EN: A document found on both sides.
 * ES: Un documento que está en ambos lados.
 */
export type PeriodMatch = {
  /** EN: The register's document. ES: El documento del registro. */
  readonly register: PeriodDocument
  /** EN: The caller's record. ES: El registro del llamador. */
  readonly record: PeriodRecord
}

/**
 * EN: A document found on both sides with fields that differ.
 * ES: Un documento que está en ambos lados con campos que difieren.
 */
export type PeriodMismatch = PeriodMatch & {
  /** EN: Every field that differs, in the order of `PeriodRecordField`. ES: Cada campo que difiere, en el orden de `PeriodRecordField`. */
  readonly differences: readonly PeriodDifference[]
}

/**
 * EN: A key held by more than one entry on a side: every entry of the key, on both sides, and none of them in the other
 * lists.
 * ES: Una clave que tiene más de una entrada en un lado: todas las entradas de la clave, en ambos lados, y ninguna de
 * ellas en las demás listas.
 */
export type PeriodDuplicate = {
  /** EN: Document type. ES: `tipoDoc` — Tipo de documento. */
  readonly type: number
  /** EN: Folio. ES: `folio` — Folio. */
  readonly folio: number
  /** EN: RUT of the other party. ES: `rutReceptor` + `dvReceptor` — RUT de la contraparte. */
  readonly counterpartyRut: SiiRut
  /** EN: The register's documents with the key. ES: Los documentos del registro con la clave. */
  readonly register: readonly PeriodDocument[]
  /** EN: The caller's records with the key. ES: Los registros del llamador con la clave. */
  readonly records: readonly PeriodRecord[]
}

/**
 * EN: The totals of a side.
 * ES: Los totales de un lado.
 */
export type PeriodTotals = {
  /** EN: Number of entries. ES: Cantidad de entradas. */
  readonly documentCount: number
  /** EN: Sum of the exempt amounts. ES: Suma de los montos exentos. */
  readonly exemptAmount: number
  /** EN: Sum of the net amounts. ES: Suma de los montos netos. */
  readonly netAmount: number
  /** EN: Sum of the VAT amounts. ES: Suma de los montos de IVA. */
  readonly vatAmount: number
  /** EN: Sum of the totals. ES: Suma de los montos totales. */
  readonly totalAmount: number
}

/**
 * EN: The register's documents of a period set against the caller's records of it.
 * ES: Los documentos del registro de un período frente a los registros del llamador.
 */
export type PeriodReconciliation = {
  /** EN: On both sides, every compared field agreeing. ES: En ambos lados, con todos los campos comparados de acuerdo. */
  readonly matching: readonly PeriodMatch[]
  /** EN: On both sides, with fields that differ. ES: En ambos lados, con campos que difieren. */
  readonly differing: readonly PeriodMismatch[]
  /** EN: In the register alone. ES: Solo en el registro. */
  readonly registerOnly: readonly PeriodDocument[]
  /** EN: In the caller's records alone. ES: Solo en los registros del llamador. */
  readonly recordsOnly: readonly PeriodRecord[]
  /** EN: Keys held by more than one entry on a side. ES: Claves con más de una entrada en un lado. */
  readonly duplicates: readonly PeriodDuplicate[]
  /** EN: Documents of the register without a type, a folio or a RUT that reads, so with no key. ES: Documentos del registro sin un tipo, un folio o un RUT legible, así que sin clave. */
  readonly unreadable: readonly PeriodDocument[]
  /** EN: The totals of each side, over every entry: an amount the register does not bring, or the caller leaves out, adds nothing. ES: Los totales de cada lado, sobre todas las entradas: un monto que el registro no trae, o el llamador omite, no suma nada. */
  readonly totals: { readonly register: PeriodTotals; readonly records: PeriodTotals }
  /** EN: True when every entry is in `matching`: no list above holds anything else. ES: True cuando todas las entradas están en `matching`: ninguna otra lista trae nada. */
  readonly balanced: boolean
}

const AMOUNTS = ['exemptAmount', 'netAmount', 'vatAmount', 'totalAmount'] as const

type Amounts = { readonly [K in (typeof AMOUNTS)[number]]?: number | null }

type Group = {
  readonly type: number
  readonly folio: number
  readonly counterpartyRut: SiiRut
  readonly register: PeriodDocument[]
  readonly records: PeriodRecord[]
}

// A date in ISO form, or null when the value does not read as one.
const isoOrNull = (value: string | null | undefined): string | null => {
  try {
    return toIsoDate(value as string)
  } catch {
    return null
  }
}

const positive = (value: number): boolean => Number.isSafeInteger(value) && value > 0

const assertRecord = (record: PeriodRecord, index: number): SiiRut => {
  if (!positive(record.type)) throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type', index })
  if (!positive(record.folio)) throw new DteError('INVALID_FOLIO', { field: 'folio', index })
  const rut = siiRutOrNull(record.counterpartyRut)
  if (rut === null) throw new DteError('INVALID_RUT', { field: 'counterpartyRut', index })
  if (record.issueDate !== undefined && isoOrNull(record.issueDate) === null)
    throw new DteError('INVALID_DATE', { field: 'issueDate', index })
  for (const field of AMOUNTS) {
    const amount = record[field]
    if (amount !== undefined && !Number.isSafeInteger(amount)) throw new DteError('INVALID_AMOUNT', { field, index })
  }
  return rut
}

const differencesOf = (document: PeriodDocument, record: PeriodRecord): readonly PeriodDifference[] => {
  const differences: PeriodDifference[] = []
  if (record.issueDate !== undefined) {
    const own = isoOrNull(record.issueDate) as string
    const registered = isoOrNull(document.issueDate) ?? document.issueDate
    if (registered !== own) differences.push({ field: 'issueDate', register: registered, record: own })
  }
  for (const field of AMOUNTS) {
    const own = record[field]
    if (own !== undefined && document[field] !== own)
      differences.push({ field, register: document[field], record: own })
  }
  return differences
}

const totalsOf = (entries: readonly Amounts[]): PeriodTotals => {
  const sum = (field: (typeof AMOUNTS)[number]): number =>
    entries.reduce((total, entry) => total + (entry[field] ?? 0), 0)
  return {
    documentCount: entries.length,
    exemptAmount: sum('exemptAmount'),
    netAmount: sum('netAmount'),
    vatAmount: sum('vatAmount'),
    totalAmount: sum('totalAmount'),
  }
}

/**
 * EN: Reconciles the register's documents of a period, the `documents` `listPeriodDocuments` returns, with the caller's
 * own records of the same period and direction. A document is the same on both sides when its type, the RUT of the
 * other party and its folio agree; the RUTs are compared in the SII's shape, so dots, the case of a K and the hyphen do
 * not matter. Of a document on both sides, the issue date and the four amounts are compared, each only when the caller
 * gives it, and the dates as days, however the SII writes them. A key held by more than one entry on a side is listed
 * in `duplicates` with every entry of it and is matched with nothing; a document of the register without a key that
 * reads is listed in `unreadable`. Pure: no network and no clock.
 * ES: Concilia los documentos del registro de un período, los `documents` que devuelve `listPeriodDocuments`, con los
 * registros propios del llamador del mismo período y dirección. Un documento es el mismo en ambos lados cuando
 * coinciden su tipo, el RUT de la contraparte y su folio; los RUT se comparan en la forma del SII, así que los puntos,
 * la mayúscula de la K y el guion no importan. De un documento que está en ambos lados se comparan la fecha de emisión
 * y los cuatro montos, cada uno solo si el llamador lo da, y las fechas como días, escriba el SII como las escriba. Una
 * clave con más de una entrada en un lado va en `duplicates` con todas sus entradas y no se calza con nada; un documento
 * del registro sin una clave legible va en `unreadable`. Pura: sin red y sin reloj.
 * @param documents EN: the register's documents, as `listPeriodDocuments` returns them. ES: los documentos del registro, tal como los devuelve `listPeriodDocuments`.
 * @param records EN: the caller's records of the period. ES: los registros del llamador del período.
 * @returns EN: the reconciliation. ES: la conciliación.
 * @throws {DteError} EN: for a record, with its position in `details.index` and the field in `details.field`: `INVALID_DOCUMENT_TYPE` and `INVALID_FOLIO` for one that is not a whole number above zero, `INVALID_RUT`, `INVALID_DATE`, and `INVALID_AMOUNT` for an amount that is not a whole number. ES: ante un registro, con su posición en `details.index` y el campo en `details.field`: `INVALID_DOCUMENT_TYPE` e `INVALID_FOLIO` ante uno que no es un entero sobre cero, `INVALID_RUT`, `INVALID_DATE`, e `INVALID_AMOUNT` ante un monto que no es entero.
 */
export const reconcilePeriodDocuments = (
  documents: readonly PeriodDocument[],
  records: readonly PeriodRecord[],
): PeriodReconciliation => {
  const groups = new Map<string, Group>()
  const groupOf = (type: number, folio: number, counterpartyRut: SiiRut): Group => {
    const key = `${type} ${counterpartyRut} ${folio}`
    const found = groups.get(key)
    if (found) return found
    const group: Group = { type, folio, counterpartyRut, register: [], records: [] }
    groups.set(key, group)
    return group
  }
  const unreadable: PeriodDocument[] = []
  for (const document of documents) {
    const rut = siiRutOrNull(document.counterpartyRut)
    if (document.type === null || document.folio === null || rut === null) unreadable.push(document)
    else groupOf(document.type, document.folio, rut).register.push(document)
  }
  records.forEach((record, index) => {
    groupOf(record.type, record.folio, assertRecord(record, index)).records.push(record)
  })
  const matching: PeriodMatch[] = []
  const differing: PeriodMismatch[] = []
  const registerOnly: PeriodDocument[] = []
  const recordsOnly: PeriodRecord[] = []
  const duplicates: PeriodDuplicate[] = []
  for (const group of groups.values()) {
    const [document] = group.register
    const [record] = group.records
    if (group.register.length > 1 || group.records.length > 1) duplicates.push(group)
    else if (record === undefined) registerOnly.push(document)
    else if (document === undefined) recordsOnly.push(record)
    else {
      const differences = differencesOf(document, record)
      if (differences.length === 0) matching.push({ register: document, record })
      else differing.push({ register: document, record, differences })
    }
  }
  return {
    matching,
    differing,
    registerOnly,
    recordsOnly,
    duplicates,
    unreadable,
    totals: { register: totalsOf(documents), records: totalsOf(records) },
    balanced: matching.length === documents.length && matching.length === records.length,
  }
}
