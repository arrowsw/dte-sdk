import { calculateVerifier, decompose, format } from 'rut.ts'
import { DteError } from '../errors'

declare const SII_RUT_BRAND: unique symbol

/**
 * EN: A RUT already validated with rut.ts and formatted the way the SII schemas expect: no dots, hyphen, uppercase K
 * (`12345678-5`). The brand is phantom: the only way to mint one is `toSiiRut`.
 * ES: Un RUT ya validado con rut.ts y en la forma que exigen los esquemas del SII: sin puntos, con guión, K mayúscula
 * (`12345678-5`). La marca es fantasma: la única forma de obtener uno es `toSiiRut`.
 */
export type SiiRut = string & { readonly [SII_RUT_BRAND]: true }

// rut.ts formats '' as '' instead of rejecting it, so emptiness is checked here before delegating.
const normalize = (value: unknown): SiiRut | null => {
  if (typeof value !== 'string' || value.trim() === '') return null
  const formatted = format(value.trim(), { dots: false, throwOnError: false })
  return formatted === null || formatted === '' ? null : (formatted as SiiRut)
}

/**
 * EN: Validates a RUT with rut.ts (Modulo 11) and returns it in SII shape. Accepts dotted, hyphenated or compact input.
 * ES: Valida un RUT con rut.ts (módulo 11) y lo devuelve en forma SII. Acepta entrada con puntos, con guión o compacta.
 * @param value EN: the RUT in any shape. ES: el RUT en cualquier forma.
 * @param field EN: field name for the error details (default `rut`). ES: nombre del campo para los detalles del error (por defecto `rut`).
 * @throws {DteError} EN: `INVALID_RUT`; the value is never echoed in the message. ES: `INVALID_RUT`; el valor nunca va en el mensaje.
 */
export const toSiiRut = (value: string, field = 'rut'): SiiRut => {
  const formatted = normalize(value)
  if (formatted === null) throw new DteError('INVALID_RUT', { field })
  return formatted
}

/**
 * EN: Type guard: true when `value` is already a valid RUT in SII shape.
 * ES: Guarda de tipo: true cuando `value` ya es un RUT válido en forma SII.
 */
export const isSiiRut = (value: unknown): value is SiiRut => typeof value === 'string' && normalize(value) === value

/**
 * EN: Splits a SII RUT into body and verifier (what the SII multipart fields `rutSender`/`dvSender` need).
 * ES: Separa un RUT SII en cuerpo y dígito verificador (lo que piden los campos `rutSender`/`dvSender` del SII).
 */
export const splitSiiRut = (rut: SiiRut): { readonly body: string; readonly verifier: string } => {
  const { body, verifier } = decompose(rut)
  return { body, verifier }
}

/**
 * EN: A SII RUT from its body alone: rut.ts computes the verifier (Modulo 11).
 * ES: Un RUT SII a partir de solo su cuerpo: rut.ts calcula el dígito verificador (módulo 11).
 * @param body EN: the 7 or 8 digits. ES: los 7 u 8 dígitos.
 * @param field EN: field name for the error details (default `rut`). ES: nombre del campo para los detalles del error (por defecto `rut`).
 * @throws {DteError} EN: `INVALID_RUT` when the body is not 7 or 8 digits. ES: `INVALID_RUT` si el cuerpo no son 7 u 8 dígitos.
 */
export const siiRutOfBody = (body: string, field = 'rut'): SiiRut => {
  const verifier = calculateVerifier(body, { throwOnError: false })
  if (verifier === null) throw new DteError('INVALID_RUT', { field })
  return toSiiRut(`${body}-${verifier}`, field)
}
