import {
  CUSTOMS_COUNTRIES,
  CUSTOMS_PACKAGE_TYPES,
  CUSTOMS_PAYMENT_TERMS,
  CUSTOMS_PORTS,
  CUSTOMS_SALE_CLAUSES,
  CUSTOMS_SALE_MODES,
  CUSTOMS_TRANSPORT_ROUTES,
  CUSTOMS_UNITS,
  customsCode,
  customsName,
  type CustomsEntry,
} from '../src/catalogs/customs'
import * as catalogs from '../src/catalogs'
import { createDocument } from '../src/document/create'
import { exportInput } from './support/received-fixtures'

const TABLES: Readonly<Record<string, readonly CustomsEntry[]>> = {
  countries: CUSTOMS_COUNTRIES,
  ports: CUSTOMS_PORTS,
  routes: CUSTOMS_TRANSPORT_ROUTES,
  clauses: CUSTOMS_SALE_CLAUSES,
  payments: CUSTOMS_PAYMENT_TERMS,
  packages: CUSTOMS_PACKAGE_TYPES,
  units: CUSTOMS_UNITS,
  modes: CUSTOMS_SALE_MODES,
}

// Anexo 51 of the Compendio de Normas Aduaneras, as read on 2026-11-25.
describe('the customs tables', () => {
  test('each holds the rows of its annex', () => {
    expect(Object.fromEntries(Object.entries(TABLES).map(([name, table]) => [name, table.length]))).toEqual({
      countries: 243,
      ports: 354,
      routes: 9,
      clauses: 9,
      payments: 38,
      packages: 67,
      units: 11,
      modes: 5,
    })
  })

  test('every row has a whole code from 1 to 999 and a name, written once', () => {
    for (const table of Object.values(TABLES)) {
      for (const entry of table) {
        expect(Number.isInteger(entry.code) && entry.code >= 1 && entry.code <= 999).toBe(true)
        expect(entry.name.trim()).toBe(entry.name)
        expect(entry.name).not.toBe('')
        expect(entry.name).not.toMatch(/\||Abreviatura/)
      }
      expect(new Set(table.map((entry) => `${entry.code} ${entry.name} ${entry.group}`)).size).toBe(table.length)
    }
  })

  test('the codes an export document of Chile uses most are the ones of the annex', () => {
    expect(customsName(CUSTOMS_COUNTRIES, 225)).toBe('ESTADOS UNIDOS DE AMÉRICA')
    expect(customsName(CUSTOMS_COUNTRIES, 997)).toBe('CHILE')
    expect(customsName(CUSTOMS_PORTS, 905)).toBe('VALPARAÍSO')
    expect(customsName(CUSTOMS_PORTS, 906)).toBe('SAN ANTONIO')
    expect(customsName(CUSTOMS_TRANSPORT_ROUTES, 1)).toBe('MARÍTIMA, FLUVIAL Y LACUSTRE')
    expect(CUSTOMS_SALE_CLAUSES.map((entry) => [entry.code, entry.abbreviation])).toEqual([
      [1, 'CIF'],
      [2, 'CFR'],
      [3, 'EXW'],
      [4, 'FAS'],
      [5, 'FOB'],
      [6, 'S/CL'],
      [7, 'FCA'],
      [9, 'DDP'],
      [8, 'OTRA'],
    ])
    expect(CUSTOMS_SALE_MODES.map((entry) => entry.code)).toEqual([1, 2, 3, 4, 9])
    expect(customsName(CUSTOMS_PAYMENT_TERMS, 21)).toBe('Sin pago')
    expect(customsName(CUSTOMS_PAYMENT_TERMS, 32)).toBe('Pago anticipado a la fecha de embarque')
    expect(customsName(CUSTOMS_PACKAGE_TYPES, 80)).toBe('PALLETS')
    expect(CUSTOMS_UNITS[0]).toEqual({ code: 6, name: 'kilogramo', abbreviation: 'KN' })
  })

  test('a footnote mark is no part of a name, and a code written with one is the code alone', () => {
    expect(customsName(CUSTOMS_COUNTRIES, 544)).toBe('REPUBLICA CHECA')
    expect(customsName(CUSTOMS_COUNTRIES, 562)).toBe('RUSIA')
    expect(customsName(CUSTOMS_COUNTRIES, 561)).toBe('MONTENEGRO')
    expect(customsName(CUSTOMS_COUNTRIES, 326)).toBe('MYANMAR (EX BIRMANIA)')
    expect(customsName(CUSTOMS_PORTS, 538)).toBe('RIJEKA')
  })

  test('a port carries the heading the annex lists it under', () => {
    const groupOf = (code: number) => CUSTOMS_PORTS.find((entry) => entry.code === code)?.group
    expect(groupOf(111)).toBe('CANADÁ')
    expect(groupOf(131)).toBe('ESTADOS UNIDOS')
    expect(groupOf(421)).toBe('COREA DEL NORTE')
    expect(groupOf(952)).toBe('ZONAS FRANCAS')
    expect(groupOf(905)).toBe('PUERTOS MARÍTIMOS')
    expect(groupOf(965)).toBe('AVANZADAS O PASOS FRONTERIZOS')
    expect(groupOf(987)).toBe('AEROPUERTOS')
    expect(groupOf(994)).toBe('ESTACIÓN DE FERROCARRIL')
    expect(new Set(CUSTOMS_PORTS.map((entry) => entry.group)).has(undefined)).toBe(false)
    expect(CUSTOMS_COUNTRIES.every((entry) => entry.group === undefined)).toBe(true)
  })

  test('the annex gives one code to two rows three times, and the first row names it', () => {
    const repeated = (table: readonly CustomsEntry[]) =>
      [...new Set(table.map((entry) => entry.code))].filter(
        (code) => table.filter((entry) => entry.code === code).length > 1,
      )
    expect(repeated(CUSTOMS_COUNTRIES)).toEqual([902])
    expect(repeated(CUSTOMS_PORTS)).toEqual([824, 900])
    expect(customsName(CUSTOMS_PORTS, 824)).toBe('TERMINAL GRÁNELES DEL NORTE')
    for (const table of [CUSTOMS_TRANSPORT_ROUTES, CUSTOMS_SALE_CLAUSES, CUSTOMS_PAYMENT_TERMS, CUSTOMS_PACKAGE_TYPES])
      expect(repeated(table)).toEqual([])
  })
})

describe('customsCode', () => {
  test('finds a name whole, by its letters and digits alone', () => {
    expect(customsCode(CUSTOMS_PORTS, 'VALPARAÍSO')).toBe(905)
    expect(customsCode(CUSTOMS_PORTS, 'valparaiso')).toBe(905)
    expect(customsCode(CUSTOMS_PORTS, '  Villa OHiggins ')).toBe(986)
    expect(customsCode(CUSTOMS_COUNTRIES, 'Estados Unidos de America')).toBe(225)
    expect(customsCode(CUSTOMS_COUNTRIES, 'guinea-bissau')).toBe(103)
    expect(customsCode(CUSTOMS_TRANSPORT_ROUTES, 'aereo')).toBe(4)
    expect(customsCode(CUSTOMS_PACKAGE_TYPES, 'Pallets')).toBe(80)
  })

  test('finds a row by the abbreviation of the annex', () => {
    expect(customsCode(CUSTOMS_SALE_CLAUSES, 'FOB')).toBe(5)
    expect(customsCode(CUSTOMS_SALE_CLAUSES, 'cif')).toBe(1)
    expect(customsCode(CUSTOMS_COUNTRIES, 'U.S.A.')).toBe(225)
    expect(customsCode(CUSTOMS_COUNTRIES, 'usa')).toBe(225)
    expect(customsCode(CUSTOMS_UNITS, 'KN')).toBe(6)
    expect(customsCode(CUSTOMS_SALE_MODES, 'FIRME')).toBe(1)
    expect(customsCode(CUSTOMS_PACKAGE_TYPES, 'CONT40')).toBe(74)
    expect(customsCode(CUSTOMS_PAYMENT_TERMS, 'ANTICIPO')).toBe(32)
  })

  test('a part of a name matches nothing', () => {
    expect(customsCode(CUSTOMS_COUNTRIES, 'COREA')).toBeNull()
    expect(customsCode(CUSTOMS_COUNTRIES, 'GUINEA')).toBe(104)
    expect(customsCode(CUSTOMS_PORTS, 'SAN')).toBeNull()
    expect(customsCode(CUSTOMS_PORTS, 'Atlantis')).toBeNull()
    expect(customsCode(CUSTOMS_PORTS, '')).toBeNull()
    expect(customsCode(CUSTOMS_PORTS, ' - ')).toBeNull()
    expect(customsCode(CUSTOMS_COUNTRIES, null as unknown as string)).toBeNull()
  })

  test('a name of rows of different codes is null, and the heading of the port tells them apart', () => {
    expect(customsCode(CUSTOMS_PORTS, 'SAN FRANCISCO')).toBeNull()
    expect(customsCode(CUSTOMS_PORTS, 'SAN FRANCISCO', 'Estados Unidos')).toBe(173)
    expect(customsCode(CUSTOMS_PORTS, 'SAN FRANCISCO', 'avanzadas o pasos fronterizos')).toBe(964)
    expect(customsCode(CUSTOMS_PORTS, 'SAN FRANCISCO', 'CANADÁ')).toBeNull()
    expect(customsCode(CUSTOMS_PORTS, 'COSTA DEL PACÍFICO, OTROS NO ESPECIFICADOS')).toBeNull()
    expect(customsCode(CUSTOMS_PORTS, 'COSTA DEL PACÍFICO, OTROS NO ESPECIFICADOS', 'CANADÁ')).toBe(112)
    // An abbreviation several codes share.
    expect(customsCode(CUSTOMS_PAYMENT_TERMS, 'ANT/COB')).toBeNull()
    // The annex lists one terminal twice, with and without its accent, under two codes.
    expect(customsCode(CUSTOMS_PORTS, 'TERMINAL GRANELES DEL NORTE')).toBeNull()
    // A table without headings has no row under any.
    expect(customsCode(CUSTOMS_COUNTRIES, 'CHILE', 'CHILE')).toBeNull()
  })
})

describe('customsName', () => {
  test('names a code, and a code the table does not list is null', () => {
    expect(customsName(CUSTOMS_PORTS, 912)).toBe('PUNTA ARENAS')
    expect(customsName(CUSTOMS_PORTS, '912' as unknown as number)).toBe('PUNTA ARENAS')
    expect(customsName(CUSTOMS_PORTS, 1)).toBeNull()
    expect(customsName(CUSTOMS_UNITS, 99)).toBeNull()
  })
})

test('the codes found go into an export document as they are', () => {
  const doc = createDocument(
    exportInput(5, {
      transport: {
        customs: {
          saleModality: customsCode(CUSTOMS_SALE_MODES, 'A firme')!,
          saleClause: customsCode(CUSTOMS_SALE_CLAUSES, 'FOB')!,
          saleClauseTotal: 1234.5,
          transportRoute: customsCode(CUSTOMS_TRANSPORT_ROUTES, 'Marítima, fluvial y lacustre')!,
          loadingPort: customsCode(CUSTOMS_PORTS, 'Valparaíso')!,
          unloadingPort: customsCode(CUSTOMS_PORTS, 'Rotterdam')!,
          receiverCountry: customsCode(CUSTOMS_COUNTRIES, 'Países Bajos')!,
          destinationCountry: customsCode(CUSTOMS_COUNTRIES, 'Países Bajos')!,
        },
      },
    }),
  )
  expect(doc.header.transport?.customs).toMatchObject({
    saleModality: 1,
    saleClause: 5,
    transportRoute: 1,
    loadingPort: 905,
    unloadingPort: 622,
    receiverCountry: 515,
    destinationCountry: 515,
  })
})

test('dte-sdk/catalogs exports the tables and their two lookups', () => {
  expect(catalogs.CUSTOMS_COUNTRIES).toBe(CUSTOMS_COUNTRIES)
  expect(catalogs.CUSTOMS_PORTS).toBe(CUSTOMS_PORTS)
  expect(catalogs.CUSTOMS_TRANSPORT_ROUTES).toBe(CUSTOMS_TRANSPORT_ROUTES)
  expect(catalogs.CUSTOMS_SALE_CLAUSES).toBe(CUSTOMS_SALE_CLAUSES)
  expect(catalogs.CUSTOMS_PAYMENT_TERMS).toBe(CUSTOMS_PAYMENT_TERMS)
  expect(catalogs.CUSTOMS_PACKAGE_TYPES).toBe(CUSTOMS_PACKAGE_TYPES)
  expect(catalogs.CUSTOMS_UNITS).toBe(CUSTOMS_UNITS)
  expect(catalogs.CUSTOMS_SALE_MODES).toBe(CUSTOMS_SALE_MODES)
  expect(catalogs.customsCode).toBe(customsCode)
  expect(catalogs.customsName).toBe(customsName)
})
