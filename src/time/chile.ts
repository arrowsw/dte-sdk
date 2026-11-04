import { DteError } from '../errors'

const CHILE_TIME_ZONE = 'America/Santiago'

const FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: CHILE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/**
 * EN: Zero-padded date and time components of an instant in Chile (`America/Santiago`, DST-aware).
 * ES: Componentes de fecha y hora de un instante en Chile (`America/Santiago`, con horario de verano), con ceros a la izquierda.
 */
export type ChileDateTimeParts = {
  readonly year: string
  readonly month: string
  readonly day: string
  readonly hour: string
  readonly minute: string
  readonly second: string
}

/**
 * EN: Breaks an instant (default: now) into Chile-local components using `Intl`, never the process time zone.
 * ES: Descompone un instante (por defecto: ahora) en componentes de hora de Chile con `Intl`, nunca con la zona del proceso.
 */
export const chileDateTimeParts = (now: Date = new Date()): ChileDateTimeParts => {
  const parts = FORMATTER.formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts
      .filter((part) => part.type === type)
      .map((part) => part.value)
      .join('')
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

/**
 * EN: Today's date in Chile as `YYYY-MM-DD` (the SII `FchEmis`/`FchResol` format).
 * ES: La fecha de hoy en Chile como `AAAA-MM-DD` (formato de `FchEmis`/`FchResol` del SII).
 */
export const chileDate = (now: Date = new Date()): string => {
  const { year, month, day } = chileDateTimeParts(now)
  return `${year}-${month}-${day}`
}

/**
 * EN: Chile-local timestamp `YYYY-MM-DDTHH:MM:SS` without zone or milliseconds (`TmstFirma`, `TmstFirmaEnv`, `TSTED`).
 * Never built with `toISOString()`, which is always UTC and put envelopes ~3 h in the future ("Error en Carátula").
 * ES: Marca de tiempo en hora de Chile `AAAA-MM-DDTHH:MM:SS` sin zona ni milisegundos (`TmstFirma`, `TmstFirmaEnv`, `TSTED`).
 * Nunca se arma con `toISOString()`, que siempre es UTC y dejaba los sobres ~3 h en el futuro ("Error en Carátula").
 */
export const chileTimestamp = (now: Date = new Date()): string => {
  const { year, month, day, hour, minute, second } = chileDateTimeParts(now)
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * EN: True when `value` is a real calendar date in `YYYY-MM-DD`.
 * ES: True cuando `value` es una fecha de calendario real en `AAAA-MM-DD`.
 */
export const isIsoDate = (value: string): boolean => {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  )
}

/**
 * EN: True when `value` is a tax period, `YYYY-MM`.
 * ES: True cuando `value` es un período tributario, `AAAA-MM`.
 */
export const isPeriod = (value: string): boolean => PERIOD.test(value)

/**
 * EN: Normalizes `DD-MM-YYYY`, `DD/MM/YYYY` or `YYYY-MM-DD` (as the SII portal and resolutions show dates) to ISO.
 * ES: Normaliza `DD-MM-AAAA`, `DD/MM/AAAA` o `AAAA-MM-DD` (como muestran las fechas el portal y las resoluciones del SII) a ISO.
 * @throws {DteError} EN: `INVALID_DATE` with `{ field }`. ES: `INVALID_DATE` con `{ field }`.
 */
export const toIsoDate = (value: string, field = 'date'): string => {
  const raw = String(value ?? '').trim()
  const dmy = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(raw)
  const iso = dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : raw
  if (!isIsoDate(iso)) throw new DteError('INVALID_DATE', { field })
  return iso
}
