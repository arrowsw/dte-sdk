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
  /** EN: Issue date, in one of the forms `reconcilePeriodDocuments` reads; not compared when absent. ES: `fechaEmision` — Fecha de emisión, en una de las formas que lee `reconcilePeriodDocuments`; no se compara si falta. */
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
  /** EN: The listed document's value: a date as `YYYY-MM-DD` when it reads as one, as the SII wrote it otherwise; null when the listing does not bring it. ES: El valor del documento listado: una fecha como `AAAA-MM-DD` si se lee como tal, como la escribió el SII si no; null si el listado no lo trae. */
  readonly listed: string | number | null
  /** EN: The caller's value, a date as `YYYY-MM-DD`. ES: El valor del llamador, una fecha como `AAAA-MM-DD`. */
  readonly record: string | number
}

/**
 * EN: A document found on both sides.
 * ES: Un documento que está en ambos lados.
 */
export type PeriodMatch = {
  /** EN: The listed document. ES: El documento listado. */
  readonly listed: PeriodDocument
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
  /** EN: The listed documents with the key, in their order. ES: Los documentos listados con la clave, en su orden. */
  readonly listed: readonly PeriodDocument[]
  /** EN: The caller's records with the key, in their order. ES: Los registros del llamador con la clave, en su orden. */
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
 * EN: The totals of the two sides of a reconciliation, over every entry of each: an amount the listing does not bring,
 * or the caller leaves out, adds nothing.
 * ES: Los totales de los dos lados de una conciliación, sobre todas las entradas de cada uno: un monto que el listado no
 * trae, o el llamador omite, no suma nada.
 */
export type PeriodReconciliationTotals = {
  /** EN: The totals of the listed documents, the unreadable ones included. ES: Los totales de los documentos listados, incluidos los ilegibles. */
  readonly listed: PeriodTotals
  /** EN: The totals of the caller's records. ES: Los totales de los registros del llamador. */
  readonly records: PeriodTotals
}

/**
 * EN: The documents `listPeriodDocuments` lists for a period, set against the caller's records of it. Every list keeps
 * the order of its entries: the keys of the listed documents in the order of the first document with each, then the
 * keys only the records have, in the order of the records; `unreadable` is in the order of the listing.
 * ES: Los documentos que `listPeriodDocuments` lista para un período, frente a los registros del llamador. Cada lista
 * conserva el orden de sus entradas: las claves de los documentos listados en el orden del primer documento con cada una,
 * luego las claves que solo tienen los registros, en el orden de los registros; `unreadable` va en el orden del listado.
 */
export type PeriodReconciliation = {
  /** EN: On both sides, every compared field agreeing. ES: En ambos lados, con todos los campos comparados de acuerdo. */
  readonly matching: readonly PeriodMatch[]
  /** EN: On both sides, with fields that differ. ES: En ambos lados, con campos que difieren. */
  readonly differing: readonly PeriodMismatch[]
  /** EN: In the listing alone. ES: Solo en el listado. */
  readonly listedOnly: readonly PeriodDocument[]
  /** EN: In the caller's records alone. ES: Solo en los registros del llamador. */
  readonly recordsOnly: readonly PeriodRecord[]
  /** EN: Keys held by more than one entry on a side. ES: Claves con más de una entrada en un lado. */
  readonly duplicates: readonly PeriodDuplicate[]
  /** EN: Listed documents without a type, a folio or a RUT that reads, so with no key. ES: Documentos listados sin un tipo, un folio o un RUT legible, así que sin clave. */
  readonly unreadable: readonly PeriodDocument[]
  /** EN: The totals of each side. ES: Los totales de cada lado. */
  readonly totals: PeriodReconciliationTotals
  /** EN: True when every entry of both sides is in `matching`: no list above holds anything else. ES: True cuando todas las entradas de ambos lados están en `matching`: ninguna otra lista trae nada. */
  readonly balanced: boolean
}

const AMOUNTS = ['exemptAmount', 'netAmount', 'vatAmount', 'totalAmount'] as const

type Amounts = { readonly [K in (typeof AMOUNTS)[number]]?: number | null }

type Group = {
  readonly type: number
  readonly folio: number
  readonly counterpartyRut: SiiRut
  readonly listed: PeriodDocument[]
  readonly records: PeriodRecord[]
}

// A day, `YYYY-MM-DD`, `DD-MM-YYYY` or `DD/MM/YYYY`, alone or followed by `T` or a space and a time `HH:MM`, `HH:MM:SS`
// or `HH:MM:SS.fff`, with no zone: a zone could move the day.
const DATE_TIME =
  /^(\d{4}-\d{2}-\d{2}|\d{2}[-/]\d{2}[-/]\d{4})(?:[T ](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?)?$/

// The day of a date in a form that reads, as `YYYY-MM-DD`, or null.
const dayOf = (value: string | null | undefined): string | null => {
  const match = DATE_TIME.exec(typeof value === 'string' ? value.trim() : '')
  try {
    return match && toIsoDate(match[1])
  } catch {
    return null
  }
}

const positive = (value: number): boolean => Number.isSafeInteger(value) && value > 0

// Refuses an argument that is not a list, and an entry of it that is not an object or is a hole of a sparse list.
const assertEntries = (list: readonly unknown[], field: string): void => {
  if (!Array.isArray(list)) throw new DteError('INVALID_OPTION', { field })
  for (let index = 0; index < list.length; index++) {
    const entry: unknown = list[index]
    if (typeof entry !== 'object' || entry === null) throw new DteError('INVALID_OPTION', { field, index })
  }
}

const assertRecord = (record: PeriodRecord, index: number): SiiRut => {
  if (!positive(record.type)) throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type', index })
  if (!positive(record.folio)) throw new DteError('INVALID_FOLIO', { field: 'folio', index })
  const rut = siiRutOrNull(record.counterpartyRut)
  if (rut === null) throw new DteError('INVALID_RUT', { field: 'counterpartyRut', index })
  if (record.issueDate !== undefined && dayOf(record.issueDate) === null)
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
    const own = dayOf(record.issueDate) as string
    const listed = dayOf(document.issueDate) ?? document.issueDate
    if (listed !== own) differences.push({ field: 'issueDate', listed, record: own })
  }
  for (const field of AMOUNTS) {
    const own = record[field]
    if (own !== undefined && document[field] !== own) differences.push({ field, listed: document[field], record: own })
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
 * EN: Reconciles the documents of a period, the `documents` `listPeriodDocuments` returns, with the caller's own records
 * of the same period and the same direction. Those documents are not the official register: `listPeriodDocuments`
 * reads another page than the one the register's summary comes from, and the names of their fields are not measured.
 *
 * A document is the same on both sides when its type, the RUT of the other party and its folio agree; the RUTs are
 * compared in the SII's shape, so dots, the case of a K and the hyphen do not matter. Of a document on both sides the
 * issue date and the four amounts are compared, each only when the caller gives it; a zero the caller gives differs
 * from an amount the listing does not bring (null). A date is read as its day when it is `YYYY-MM-DD`, `DD-MM-YYYY` or
 * `DD/MM/YYYY`, alone or followed by `T` or a space and a time `HH:MM`, `HH:MM:SS` or `HH:MM:SS.fff` with no zone; a
 * listed date in any other form is compared as the SII wrote it, and a record's is refused. A key held by more than
 * one entry on a side is listed in `duplicates` with every entry of it and is matched with nothing; a listed document
 * without a key that reads is listed in `unreadable`.
 *
 * Documents issued and documents received must not be mixed in one call: a document carries no direction, so an
 * issued 33 with folio 7 to a RUT and a received 33 with folio 7 from it share a key and land in `duplicates`. The
 * received side rests on a mapping nobody has measured: the other party's RUT is read from the same two fields on both
 * sides (`rutReceptor`, `dvReceptor`), and if the SII gives the issuer of a received document under another name, all
 * of them land in `unreadable`. The sign the listing gives a credit note is not measured either, so a caller that keeps
 * credit notes negative may see every one as a difference. Pure: no network and no clock.
 * ES: Concilia los documentos de un período, los `documents` que devuelve `listPeriodDocuments`, con los registros
 * propios del llamador del mismo período y la misma dirección. Esos documentos no son el registro oficial:
 * `listPeriodDocuments` lee otra página que aquella de la que viene el resumen del registro, y los nombres de sus campos
 * no están medidos.
 *
 * Un documento es el mismo en ambos lados cuando coinciden su tipo, el RUT de la contraparte y su folio; los RUT se
 * comparan en la forma del SII, así que los puntos, la mayúscula de la K y el guion no importan. De un documento que
 * está en ambos lados se comparan la fecha de emisión y los cuatro montos, cada uno solo si el llamador lo da; un cero
 * que da el llamador difiere de un monto que el listado no trae (null). Una fecha se lee como su día cuando es
 * `AAAA-MM-DD`, `DD-MM-AAAA` o `DD/MM/AAAA`, sola o seguida de `T` o un espacio y una hora `HH:MM`, `HH:MM:SS` o
 * `HH:MM:SS.fff` sin zona; una fecha listada en otra forma se compara tal como la escribió el SII, y la de un registro se
 * rechaza. Una clave con más de una entrada en un lado va en `duplicates` con todas sus entradas y no se calza con nada;
 * un documento listado sin una clave legible va en `unreadable`.
 *
 * No se deben mezclar documentos emitidos y recibidos en una llamada: un documento no lleva dirección, así que una 33
 * emitida con folio 7 a un RUT y una 33 recibida con folio 7 de ese RUT comparten clave y caen en `duplicates`. El lado
 * de los recibidos descansa en una correspondencia que nadie ha medido: el RUT de la contraparte se lee de los mismos
 * dos campos en ambos lados (`rutReceptor`, `dvReceptor`), y si el SII da el emisor de un documento recibido con otro
 * nombre, todos caen en `unreadable`. Tampoco está medido el signo que el listado da a una nota de crédito, así que un
 * llamador que guarda las notas de crédito negativas puede ver cada una como una diferencia. Pura: sin red y sin reloj.
 * @param documents EN: the documents of the period, as `listPeriodDocuments` returns them. ES: los documentos del período, tal como los devuelve `listPeriodDocuments`.
 * @param records EN: the caller's records of the period, in the same direction. ES: los registros del llamador del período, en la misma dirección.
 * @returns EN: the reconciliation. ES: la conciliación.
 * @throws {DteError} EN: `INVALID_OPTION` with `documents` or `records` in `details.field` for an argument that is not a list, and with the position in `details.index` for an entry that is not an object or a hole of a sparse list; for a record, with its position in `details.index` and the field in `details.field`: `INVALID_DOCUMENT_TYPE` and `INVALID_FOLIO` for one that is not a whole number above zero, `INVALID_RUT`, `INVALID_DATE` for a date in no form it reads, and `INVALID_AMOUNT` for an amount that is not a whole number. ES: `INVALID_OPTION` con `documents` o `records` en `details.field` ante un argumento que no es una lista, y con la posición en `details.index` ante una entrada que no es un objeto o un hueco de una lista dispersa; ante un registro, con su posición en `details.index` y el campo en `details.field`: `INVALID_DOCUMENT_TYPE` e `INVALID_FOLIO` ante uno que no es un entero sobre cero, `INVALID_RUT`, `INVALID_DATE` ante una fecha en ninguna forma que lee, e `INVALID_AMOUNT` ante un monto que no es entero.
 */
export const reconcilePeriodDocuments = (
  documents: readonly PeriodDocument[],
  records: readonly PeriodRecord[],
): PeriodReconciliation => {
  assertEntries(documents, 'documents')
  assertEntries(records, 'records')
  const groups = new Map<string, Group>()
  const groupOf = (type: number, folio: number, counterpartyRut: SiiRut): Group => {
    const key = `${type} ${counterpartyRut} ${folio}`
    const found = groups.get(key)
    if (found) return found
    const group: Group = { type, folio, counterpartyRut, listed: [], records: [] }
    groups.set(key, group)
    return group
  }
  const unreadable: PeriodDocument[] = []
  for (const document of documents) {
    const rut = siiRutOrNull(document.counterpartyRut)
    if (document.type === null || document.folio === null || rut === null) unreadable.push(document)
    else groupOf(document.type, document.folio, rut).listed.push(document)
  }
  records.forEach((record, index) => {
    groupOf(record.type, record.folio, assertRecord(record, index)).records.push(record)
  })
  const matching: PeriodMatch[] = []
  const differing: PeriodMismatch[] = []
  const listedOnly: PeriodDocument[] = []
  const recordsOnly: PeriodRecord[] = []
  const duplicates: PeriodDuplicate[] = []
  for (const group of groups.values()) {
    const [document] = group.listed
    const [record] = group.records
    if (group.listed.length > 1 || group.records.length > 1) duplicates.push(group)
    else if (record === undefined) listedOnly.push(document)
    else if (document === undefined) recordsOnly.push(record)
    else {
      const differences = differencesOf(document, record)
      if (differences.length === 0) matching.push({ listed: document, record })
      else differing.push({ listed: document, record, differences })
    }
  }
  return {
    matching,
    differing,
    listedOnly,
    recordsOnly,
    duplicates,
    unreadable,
    totals: { listed: totalsOf(documents), records: totalsOf(records) },
    balanced: matching.length === documents.length && matching.length === records.length,
  }
}
