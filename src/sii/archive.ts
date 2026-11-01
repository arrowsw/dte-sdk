import type { Environment } from '../catalogs/codes'
import type { SiiRut } from '../model/rut'
import type { TokenChannel } from './token-cache'

/**
 * EN: What was uploaded: `EnvioDTE`, `EnvioBOLETA`, a book (IECV / guides) or the folio consumption report (RCOF).
 * ES: Qué se subió: `EnvioDTE` (`dte`), `EnvioBOLETA` (`receipt`), un libro (`book`) o el Reporte de Consumo de Folios (`folioConsumption`).
 */
export type UploadKind = 'dte' | 'receipt' | 'book' | 'folioConsumption'

/**
 * EN: One upload that got an SII answer, as handed to the `archive` port.
 * ES: Un envío que obtuvo respuesta del SII, tal como se entrega al puerto `archive`.
 */
export type UploadRecord = {
  /** EN: Environment the upload went to. ES: Ambiente al que se subió el envío. */
  readonly environment: Environment
  /** EN: What was uploaded. ES: Qué se subió: `dte`, `receipt`, `book` o `folioConsumption`. */
  readonly kind: UploadKind
  /** EN: Channel used for the upload. ES: Canal usado para la subida. */
  readonly channel: TokenChannel
  /** EN: TrackID, or null when the SII rejected the upload. ES: `TRACKID`, o null si el SII rechazó el envío. */
  readonly trackId: string | null
  /** EN: The SII reported the file as already uploaded. ES: El SII reportó el archivo como ya enviado. */
  readonly duplicate: boolean
  /** EN: Company RUT. ES: `rutCompany` — RUT de la empresa. */
  readonly companyRut: SiiRut
  /** EN: Sender RUT. ES: `rutSender` — RUT de quien envía. */
  readonly senderRut: SiiRut
  /** EN: Multipart file name. ES: Nombre del archivo en el multipart. */
  readonly fileName: string
  /** EN: ISO 8601 UTC instant of the send. ES: Instante del envío, ISO 8601 UTC. */
  readonly sentAt: string
  /** EN: The exact bytes sent. ES: Los bytes exactos enviados. */
  readonly xml: Uint8Array
  /** EN: HTTP status, SII code and body of the answer, with tokens and seeds redacted (`redactText`). ES: Estado HTTP, código del SII y cuerpo de la respuesta, con tokens y semillas tachados (`redactText`). */
  readonly response: { readonly httpStatus: number; readonly code: string; readonly raw: string }
}

/**
 * EN: Archive port.
 * ES: Puerto de archivo de envíos.
 */
export type UploadArchive = (record: UploadRecord) => Promise<void>

/**
 * EN: File-friendly name of a record: `<trackId>-<kind>`, `<trackId>-<kind>-duplicate-<yyyymmddHHMMSS>` for a duplicate
 * answer (it names the TrackID of the original upload and must not replace that upload's record), or
 * `rejected-<yyyymmddHHMMSS>-<kind>` without a TrackID. The timestamp is the UTC send instant.
 * ES: Nombre apto para archivo: `<trackId>-<kind>`, `<trackId>-<kind>-duplicate-<aaaammddHHMMSS>` para una respuesta de
 * duplicado (nombra el TrackID del envío original y no debe reemplazar el registro de ese envío), o
 * `rejected-<aaaammddHHMMSS>-<kind>` sin TrackID. La marca de tiempo es el instante de envío en UTC.
 */
export const uploadRecordName = (record: Pick<UploadRecord, 'trackId' | 'kind' | 'sentAt' | 'duplicate'>): string => {
  const stamp = record.sentAt.replace(/\D/g, '').slice(0, 14)
  if (record.trackId === null) return `rejected-${stamp}-${record.kind}`
  return record.duplicate ? `${record.trackId}-${record.kind}-duplicate-${stamp}` : `${record.trackId}-${record.kind}`
}

/**
 * EN: In-memory archive: `records()` returns a copy of everything archived so far.
 * ES: Archivo en memoria: `records()` devuelve una copia de lo archivado hasta ahora.
 */
export const createMemoryUploadArchive = (): {
  readonly archive: UploadArchive
  readonly records: () => readonly UploadRecord[]
} => {
  const list: UploadRecord[] = []
  return {
    archive: async (record) => {
      list.push(record)
    },
    records: () => [...list],
  }
}
