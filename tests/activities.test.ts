import * as catalogs from '../src/catalogs'
import { BUSINESS_ACTIVITIES, businessActivity, isBusinessActivityCode } from '../src/catalogs/activities'
import type { BusinessActivity } from '../src/catalogs/activities'

// The SII's list of economic activity codes, sii.cl/ayudas/ayudas_por_servicios/1956-codigos-1959.html, "Todos los
// códigos de actividad económica", read on 2026-11-14: 674 codes in 21 sections, each with "Afecto a IVA",
// "Categoría Tributaria" and "Disponible Internet".
const count = <T>(values: readonly T[]): Record<string, number> =>
  values.reduce<Record<string, number>>(
    (tally, value) => ({ ...tally, [String(value)]: (tally[String(value)] ?? 0) + 1 }),
    {},
  )

test('the table holds the 674 codes of the list, sorted and unique', () => {
  const codes = BUSINESS_ACTIVITIES.map((activity) => activity.code)
  expect(codes).toHaveLength(674)
  expect(codes).toEqual([...new Set(codes)].sort((a, b) => a - b))
  expect(codes.every((code) => Number.isInteger(code) && code > 0 && code <= 999999)).toBe(true)
})

test('rows as the list writes them, one from each end and from the middle', () => {
  expect(businessActivity(11101)).toEqual({
    code: 11101,
    name: 'CULTIVO DE TRIGO',
    subjectToVat: 'SI',
    taxCategory: '1',
    availableOnline: true,
  })
  expect(businessActivity(620100)).toEqual({
    code: 620100,
    name: 'ACTIVIDADES DE PROGRAMACIÓN INFORMÁTICA',
    subjectToVat: 'G',
    taxCategory: 'G',
    availableOnline: true,
  })
  expect(businessActivity(960909)).toMatchObject({
    name: 'OTRAS ACTIVIDADES DE SERVICIOS PERSONALES N.C.P.',
    subjectToVat: 'NO',
    taxCategory: '2',
  })
  expect(businessActivity(843010)).toMatchObject({ name: 'FONDO NACIONAL DE SALUD (FONASA)', availableOnline: false })
  // The two rows whose columns read differently from their neighbours.
  expect(businessActivity(970000)).toMatchObject({ subjectToVat: 'NO', taxCategory: 'G', availableOnline: false })
  expect(businessActivity(990000)).toMatchObject({ subjectToVat: 'G', taxCategory: '1', availableOnline: false })
})

test('the columns hold the values the list writes, and as many', () => {
  expect(count(BUSINESS_ACTIVITIES.map((activity) => activity.subjectToVat))).toEqual({ SI: 574, NO: 46, G: 54 })
  expect(count(BUSINESS_ACTIVITIES.map((activity) => activity.taxCategory))).toEqual({ 1: 621, 2: 12, G: 41 })
  // 637 rows write `SI`, 2 write `S` (732000 and 771000) and 35 write `NO`.
  expect(count(BUSINESS_ACTIVITIES.map((activity) => activity.availableOnline))).toEqual({ true: 639, false: 35 })
  expect([businessActivity(732000)?.availableOnline, businessActivity(771000)?.availableOnline]).toEqual([true, true])
})

test('every name is uppercase text, trimmed and with single spaces', () => {
  const names = BUSINESS_ACTIVITIES.map((activity: BusinessActivity) => activity.name)
  expect(names.filter((name) => name !== name.trim() || /\s{2}/.test(name) || name !== name.toUpperCase())).toEqual([])
  expect(Math.max(...names.map((name) => name.length))).toBe(100)
})

test('businessActivity and isBusinessActivityCode', () => {
  expect(businessActivity(11102)?.name).toBe('CULTIVO DE MAÍZ')
  expect(businessActivity(999999)).toBeUndefined()
  expect(BUSINESS_ACTIVITIES.every((activity) => isBusinessActivityCode(activity.code))).toBe(true)
  expect([0, 11100, 999999, 620100.5].some(isBusinessActivityCode)).toBe(false)
  expect(isBusinessActivityCode('620100')).toBe(false)
  expect(isBusinessActivityCode(null)).toBe(false)
})

test('dte-sdk/catalogs exports the table, its lookup and its guard', () => {
  expect(catalogs.BUSINESS_ACTIVITIES).toBe(BUSINESS_ACTIVITIES)
  expect(catalogs.businessActivity).toBe(businessActivity)
  expect(catalogs.isBusinessActivityCode).toBe(isBusinessActivityCode)
})
