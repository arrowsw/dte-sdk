import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as root from '../src'
import { ADDITIONAL_TAXES, isAdditionalTaxCode } from '../src/catalogs/additional-taxes'
import type { AdditionalTaxCode } from '../src/catalogs/additional-taxes'
import { WITHHOLDING_TAX_CODES } from '../src/catalogs/codes'

// Formato DTE 2.5 (sii.cl/factura_electronica/factura_mercado/formato_dte_202602.pdf), section 4, "Codificación tipos
// de impuestos y recargos", pages 51 to 54: 33 rows, 7 of them with a code of total withholding in the second column.
const ROWS = [
  14, 15, 17, 18, 19, 23, 24, 25, 26, 27, 271, 28, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 41, 44, 45, 46, 47, 48, 49,
  50, 51, 52, 53,
]
const TOTAL_WITHHOLDING = { 30: 301, 32: 321, 33: 331, 34: 341, 36: 361, 37: 371, 48: 481 }

const codes = (): number[] => Object.keys(ADDITIONAL_TAXES).map(Number)
const tax = (code: AdditionalTaxCode) => ADDITIONAL_TAXES[code]

// The enumerated values of a simple type of an SII schema, which is written in ISO-8859-1.
const enumeration = (file: string, type: string): string[] => {
  const xsd = readFileSync(join(__dirname, 'fixtures/xsd', file), 'latin1')
  const body = xsd.split(`<xs:simpleType name="${type}">`)[1].split('</xs:simpleType>')[0]
  return [...body.matchAll(/<xs:enumeration value="([^"]+)"/g)].map((match) => match[1])
}

test('the table holds the 33 rows of section 4 and the 7 codes of total withholding, 40 codes', () => {
  expect(codes()).toHaveLength(40)
  expect(codes().sort((a, b) => a - b)).toEqual([...ROWS, ...Object.values(TOTAL_WITHHOLDING)].sort((a, b) => a - b))
})

test('every code is one ImpAdicDTEType admits, and the schema admits four more the table does not describe', () => {
  const schema = enumeration('SiiTypes_v10.xsd', 'ImpAdicDTEType').map(Number)
  expect(codes().filter((code) => !schema.includes(code))).toEqual([])
  expect(schema.filter((code) => !codes().includes(code))).toEqual([16, 40, 54, 55])
})

test('rates, names and documents as the pages write them', () => {
  // Page 51.
  expect(tax(14)).toEqual({ name: 'IVA de margen de comercialización', kind: 'margin', documents: [33, 56, 61] })
  expect(tax(15)).toEqual({ name: 'IVA retenido total', kind: 'withholding', documents: [46, 56, 61] })
  expect(tax(19)).toMatchObject({ name: 'IVA ANTICIPADO HARINA', kind: 'advance', rate: 12 })
  expect(tax(24)).toMatchObject({ name: 'DL 825/74, ART. 42, letra b)', kind: 'additional', rate: 31.5 })
  expect([tax(25).rate, tax(26).rate, tax(25).name === tax(26).name]).toEqual([20.5, 20.5, true])
  // Page 52.
  expect(tax(271)).toMatchObject({ name: 'DL 825/74, ART. 42, letra a) Inciso Segundo', rate: 18 })
  expect(tax(28)).toEqual({ name: 'Impuesto específico diésel', kind: 'specific', documents: [33] })
  expect(tax(30)).toEqual({
    name: 'IVA RETENIDO LEGUMBRES',
    kind: 'withholding',
    rate: 10,
    documents: [46, 56, 61],
    totalWithholdingCode: 301,
  })
  expect(tax(34).rate).toBe(4)
  // Page 53.
  expect(tax(41)).toEqual({ name: 'IVA RETENIDO CONSTRUCCION', kind: 'withholding', documents: [46, 56, 61] })
  expect(tax(45)).toMatchObject({ name: 'IMPUESTO ADICIONAL Art 37 Letras j', kind: 'additional', rate: 50 })
  expect(tax(46)).toEqual({ name: 'IVA RETENIDO ORO', kind: 'withholding', documents: [33, 56, 61] })
  expect(tax(48)).toMatchObject({ rate: 14, totalWithholdingCode: 481 })
  expect(tax(49)).toMatchObject({ name: 'FACTURA DE COMPRA SIN RETENCIÓN', rate: 0, documents: [46, 56, 61] })
  // Page 54.
  expect(tax(52).name).toBe('Impuesto gas licuado de petróleo; 1,40 UTM/M3, Art 1°, Ley N° 20.052')
  expect(tax(53)).toMatchObject({ kind: 'withholding', rate: 0.5, documents: [33, 56, 61] })
})

test('code 15 is the total VAT withholding dte-sdk already writes', () => {
  expect(tax(WITHHOLDING_TAX_CODES.totalVatWithholding).name).toBe('IVA retenido total')
})

test('a code of total withholding has the name, the class and the documents of its row, and no rate', () => {
  for (const [row, total] of Object.entries(TOTAL_WITHHOLDING)) {
    const partial = tax(Number(row) as AdditionalTaxCode)
    expect(partial.totalWithholdingCode).toBe(total)
    expect(tax(total as AdditionalTaxCode)).toEqual({
      name: partial.name,
      kind: 'withholding',
      documents: partial.documents,
    })
  }
  const linked = codes().filter((code) => tax(code as AdditionalTaxCode).totalWithholdingCode !== undefined)
  expect(linked).toEqual(Object.keys(TOTAL_WITHHOLDING).map(Number))
})

test('a withholding is a code whose name says it withholds, and no other', () => {
  const withholdings = codes().filter((code) => tax(code as AdditionalTaxCode).kind === 'withholding')
  const named = codes().filter((code) => /retenid|retenci/i.test(tax(code as AdditionalTaxCode).name))
  expect(withholdings).toEqual(named)
  const kinds = (kind: string): number[] => codes().filter((code) => tax(code as AdditionalTaxCode).kind === kind)
  expect(kinds('margin')).toEqual([14, 50])
  expect(kinds('advance')).toEqual([17, 18, 19])
  expect(kinds('specific')).toEqual([28, 35, 51, 52])
  expect(kinds('additional')).toEqual([23, 24, 25, 26, 27, 44, 45, 271])
})

test('isAdditionalTaxCode', () => {
  expect(codes().every(isAdditionalTaxCode)).toBe(true)
  expect([16, 40, 54, 55, 29, 0, 24.5, -14].some(isAdditionalTaxCode)).toBe(false)
  expect(isAdditionalTaxCode('24')).toBe(false)
  expect(isAdditionalTaxCode(null)).toBe(false)
})

test('the root entry exports the table and its guard', () => {
  expect(root.ADDITIONAL_TAXES).toBe(ADDITIONAL_TAXES)
  expect(root.isAdditionalTaxCode).toBe(isAdditionalTaxCode)
})
