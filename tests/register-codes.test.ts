import { REGISTER_ACCOUNTING_STATUSES } from '../src/catalogs/portal'
import { REGISTER_DOCUMENT_CODES, registerDocumentCode } from '../src/catalogs/register-codes'
import type { RegisterDocumentCode } from '../src/catalogs/register-codes'

const codesWhere = (predicate: (entry: RegisterDocumentCode) => boolean): number[] =>
  REGISTER_DOCUMENT_CODES.filter(predicate).map((entry) => entry.code)

const BOTH = [29, 30, 32, 33, 34, 40, 43, 45, 46, 55, 56, 60, 61, 108, 901, 904]
const SALE_ONLY = [
  35, 38, 39, 41, 47, 48, 101, 102, 103, 104, 105, 106, 109, 110, 111, 112, 500, 501, 902, 903, 905, 906, 907, 919, 920,
  922, 924,
]
const PURCHASE_ONLY = [909, 910, 911, 914]
const NOT_IN_REGISTER = [50, 52]

test('the catalog has 49 codes, sorted and unique', () => {
  const codes = REGISTER_DOCUMENT_CODES.map((entry) => entry.code)
  expect(codes).toHaveLength(49)
  expect(codes).toEqual([...new Set(codes)].sort((a, b) => a - b))
})

test('every code has its official name', () => {
  for (const entry of REGISTER_DOCUMENT_CODES) expect(entry.name.length).toBeGreaterThan(3)
  expect(registerDocumentCode(33)?.name).toBe('Factura Electrónica')
  expect(registerDocumentCode(29)?.name).toBe('Factura de Inicio')
  expect(registerDocumentCode(108)?.name).toBe('Solicitud Registro de Factura (SRF)')
  expect(registerDocumentCode(906)?.name).toBe('Boletas Venta Módulos ZF (todas)')
  expect(registerDocumentCode(924)?.name).toBe('Resumen Ventas Internacionales Pasajes sin Factura')
})

test('the operations of each code', () => {
  expect(codesWhere((e) => e.operations.join() === 'purchase,sale')).toEqual(BOTH)
  expect(codesWhere((e) => e.operations.join() === 'sale')).toEqual(SALE_ONLY)
  expect(codesWhere((e) => e.operations.join() === 'purchase')).toEqual(PURCHASE_ONLY)
  expect(codesWhere((e) => e.operations.length === 0)).toEqual(NOT_IN_REGISTER)
})

test('only the dispatch guides never reach the register', () => {
  expect(codesWhere((e) => !e.inRegister)).toEqual([50, 52])
  for (const entry of REGISTER_DOCUMENT_CODES) if (!entry.inRegister) expect(entry.operations).toEqual([])
  expect(codesWhere((e) => e.inRegister && e.operations.length === 0)).toEqual([])
})

test('the codes that subtract from the totals', () => {
  expect(codesWhere((e) => e.sign === -1)).toEqual([60, 61, 106, 112, 501, 922])
  expect(codesWhere((e) => e.sign === 1)).toHaveLength(43)
})

test('the codes the register shows only as a monthly summary line', () => {
  const summaryOnly = [35, 38, 39, 41, 47, 48, 105, 500, 501, 906, 919, 920, 922, 924]
  expect(codesWhere((e) => !e.perDocument)).toEqual(summaryOnly)
  for (const entry of REGISTER_DOCUMENT_CODES) if (!entry.perDocument) expect(entry.operations).toEqual(['sale'])
})

test('the codes whose buyer withholds the VAT', () => {
  expect(codesWhere((e) => e.buyerWithholdsVat)).toEqual([29, 45, 46])
})

test('the codes issued as a DTE', () => {
  expect(codesWhere((e) => e.electronic)).toEqual([33, 34, 39, 41, 43, 46, 52, 56, 61, 110, 111, 112])
})

test('registerDocumentCode finds a code and answers undefined for the rest', () => {
  expect(registerDocumentCode(61)).toEqual({
    code: 61,
    name: 'Nota de Crédito Electrónica',
    operations: ['purchase', 'sale'],
    electronic: true,
    inRegister: true,
    sign: -1,
    perDocument: true,
    buyerWithholdsVat: false,
  })
  expect(registerDocumentCode(71)).toBeUndefined()
  expect(registerDocumentCode(900)).toBeUndefined()
})

test('the accounting statuses of each operation', () => {
  expect(REGISTER_ACCOUNTING_STATUSES).toEqual({
    purchase: ['registered', 'pending', 'notIncluded', 'claimed'],
    sale: ['registered'],
  })
})
