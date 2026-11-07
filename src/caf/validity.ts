import { DteError } from '../errors'
import type { Caf } from './parse'

const EXPIRING_TYPES: readonly number[] = [33, 46, 56, 61]
const VALIDITY_MONTHS = 6
const DEFAULT_MARGIN_MS = 24 * 60 * 60 * 1000

/**
 * EN: Expiry instant of a CAF: six months after `authorizationDate` (Res. Ex. SII 58/2017) for invoices and notes
 * (33, 46, 56, 61), at midnight continental Chile (UTC-4). A day the sixth month does not have is its last day: a CAF
 * authorized on 2026-08-31 expires on 2027-02-28, not in March. `null` for types that never expire or without a date.
 * ES: Instante de vencimiento de un CAF: seis meses después de `authorizationDate` (Res. Ex. SII 58/2017) para facturas
 * y notas (33, 46, 56, 61), a medianoche de Chile continental (UTC-4). Un día que el sexto mes no tiene es su último
 * día: un CAF autorizado el 31-08-2026 vence el 28-02-2027, no en marzo. `null` para tipos que no vencen o sin fecha.
 */
export const cafExpiresAt = (caf: Pick<Caf, 'documentType' | 'authorizationDate'>): Date | null => {
  if (!EXPIRING_TYPES.includes(caf.documentType) || caf.authorizationDate === null) return null
  const [year, month, day] = caf.authorizationDate.split('-').map(Number)
  const target = month - 1 + VALIDITY_MONTHS
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, target + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, target, Math.min(day, lastDay), 4))
}

/**
 * EN: True when the CAF has expired or expires within `marginMs` (default one day: the SII rejects every document
 * stamped with an expired CAF with `CAF-3-517`, and the envelope may be received later than it was stamped).
 * ES: True si el CAF venció o vence dentro de `marginMs` (por defecto un día: el SII rechaza cada documento timbrado con
 * un CAF vencido con `CAF-3-517`, y el sobre puede recibirse después de timbrado).
 */
export const isCafExpired = (
  caf: Pick<Caf, 'documentType' | 'authorizationDate'>,
  options: { readonly now?: Date; readonly marginMs?: number } = {},
): boolean => {
  const expiresAt = cafExpiresAt(caf)
  return (
    expiresAt !== null &&
    expiresAt.getTime() - (options.now ?? new Date()).getTime() < (options.marginMs ?? DEFAULT_MARGIN_MS)
  )
}

/**
 * EN: True when `folio` is an integer inside the CAF range.
 * ES: True cuando `folio` es un entero dentro del rango del CAF.
 */
export const isFolioInRange = (caf: Pick<Caf, 'range'>, folio: number): boolean =>
  Number.isInteger(folio) && folio >= caf.range.from && folio <= caf.range.to

/**
 * EN: Throws `FOLIO_OUT_OF_RANGE` unless `folio` is inside the CAF range.
 * ES: Lanza `FOLIO_OUT_OF_RANGE` salvo que `folio` esté dentro del rango del CAF.
 */
export const assertFolioInRange = (caf: Pick<Caf, 'range' | 'documentType'>, folio: number): void => {
  if (!isFolioInRange(caf, folio))
    throw new DteError('FOLIO_OUT_OF_RANGE', { folio, from: caf.range.from, to: caf.range.to, type: caf.documentType })
}

/**
 * EN: Number of folios the CAF authorizes.
 * ES: Cantidad de folios que autoriza el CAF.
 */
export const availableFolios = (caf: Pick<Caf, 'range'>): number => caf.range.to - caf.range.from + 1
