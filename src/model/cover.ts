import type { DocumentType } from '../catalogs/document-types'
import type { SiiRut } from './rut'

/**
 * EN: Count of documents per type inside an envelope (`SubTotDTE`).
 * ES: `SubTotDTE` — Cantidad de documentos por tipo dentro del sobre.
 */
export type EnvelopeSubtotal = {
  /** EN: Document type. ES: `TpoDTE` — Tipo de documento. */
  readonly type: DocumentType
  /** EN: How many. ES: `NroDTE` — Cuántos. */
  readonly count: number
}

/**
 * EN: Envelope cover as the caller provides it (`Caratula`).
 * ES: `Caratula` — Carátula del sobre tal como la entrega el llamador.
 */
export type EnvelopeCoverInput = {
  /** EN: Issuer company RUT. ES: `RutEmisor` — RUT de la empresa emisora. */
  readonly issuerRut: string
  /** EN: RUT of the certificate holder who signs the envelope. ES: `RutEnvia` — RUT del firmante autorizado (dueño del certificado). */
  readonly senderRut: string
  /** EN: Receiver RUT; defaults to the SII (always the SII on receipt envelopes). ES: `RutReceptor` — RUT del receptor; por defecto el SII (siempre el SII en sobres de boletas). */
  readonly receiverRut?: string
  /** EN: SII resolution date (YYYY-MM-DD or DD-MM-YYYY). ES: `FchResol` — Fecha de la resolución del SII (AAAA-MM-DD o DD-MM-AAAA). */
  readonly resolutionDate: string
  /** EN: Resolution number (0 in certification). ES: `NroResol` — Número de resolución (0 en certificación). */
  readonly resolutionNumber: number
  /** EN: Explicit signing timestamp; defaults to now in Chile. ES: `TmstFirmaEnv` — Marca de tiempo explícita; por defecto ahora en hora de Chile. */
  readonly signedAt?: string
  /** EN: Explicit `SetDTE` ID; generated when omitted. ES: ID explícito del `SetDTE`; se genera si se omite. */
  readonly setId?: string
}

/**
 * EN: Normalized envelope cover.
 * ES: `Caratula` — Carátula normalizada.
 */
export type EnvelopeCover = {
  /** EN: Issuer RUT. ES: `RutEmisor` — RUT del emisor. */
  readonly issuerRut: SiiRut
  /** EN: Sender RUT. ES: `RutEnvia` — RUT de quien envía. */
  readonly senderRut: SiiRut
  /** EN: Receiver RUT. ES: `RutReceptor` — RUT del receptor. */
  readonly receiverRut: SiiRut
  /** EN: Resolution date YYYY-MM-DD. ES: `FchResol` — Fecha de resolución AAAA-MM-DD. */
  readonly resolutionDate: string
  /** EN: Resolution number. ES: `NroResol` — Número de resolución. */
  readonly resolutionNumber: number
  /** EN: Signing timestamp, Chile time. ES: `TmstFirmaEnv` — Marca de tiempo de la firma, hora de Chile. */
  readonly signedAt: string
  /** EN: Documents per type. ES: `SubTotDTE` — Documentos por tipo. */
  readonly subtotals: readonly EnvelopeSubtotal[]
}
