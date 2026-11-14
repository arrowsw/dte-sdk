import * as root from '../src'
import { DOCUMENT_TYPE_VALUES } from '../src/catalogs/document-types'
import {
  RECEIPT_REFERENCE_DOCUMENT_TYPES,
  REFERENCE_DOCUMENT_TYPES,
  isReceiptReferenceDocumentType,
  isReferenceDocumentType,
} from '../src/catalogs/reference-types'

// Formato DTE 2.5 (sii.cl/factura_electronica/factura_mercado/formato_dte_202602.pdf), field 2 of "Información de
// Referencia", "Tipo Documento de referencia", page 45, in the order it lists them.
const FIELD_LIST = [
  30, 32, 35, 38, 45, 48, 55, 60, 103, 40, 43, 33, 34, 39, 41, 46, 56, 61, 50, 52, 110, 111, 112, 801, 802, 803, 804,
  805, 806, 807, 808, 809, 810, 811, 812, 813, 814, 815, 820,
]
// Its change log of 2021-09-14, page 3.
const CHANGE_LOG = [821, 822, 823]

const codes = (): number[] => Object.keys(REFERENCE_DOCUMENT_TYPES).map(Number)

test('the table holds the 39 codes of the field and the 3 of the change log, sorted', () => {
  expect(FIELD_LIST).toHaveLength(39)
  expect(codes()).toEqual([...FIELD_LIST, ...CHANGE_LOG].sort((a, b) => a - b))
})

test('names as the SII writes them', () => {
  expect(REFERENCE_DOCUMENT_TYPES[32]).toBe('Factura de venta bienes y servicios no afectos o exentos de IVA')
  expect(REFERENCE_DOCUMENT_TYPES[43]).toBe('Liquidación-Factura Electrónica')
  expect(REFERENCE_DOCUMENT_TYPES[48]).toBe('Comprobante de pago electrónico')
  expect(REFERENCE_DOCUMENT_TYPES[103]).toBe('Liquidación')
  expect(REFERENCE_DOCUMENT_TYPES[801]).toBe('Orden de Compra')
  expect(REFERENCE_DOCUMENT_TYPES[812]).toBe('Resolución del SNA donde califica Servicios de Exportación')
  expect(REFERENCE_DOCUMENT_TYPES[820]).toBe(
    'Código de Inscripción en el Registro de Acuerdos con Plazo de Pago Excepcional',
  )
  expect(REFERENCE_DOCUMENT_TYPES[823]).toBe('Plan Manejo – CONAF')
})

test('every type dte-sdk issues can be referenced', () => {
  expect(DOCUMENT_TYPE_VALUES.every(isReferenceDocumentType)).toBe(true)
})

test("a receipt's reference names the 11 codes of Formato Boletas Electrónicas 4.2, page 18", () => {
  expect(RECEIPT_REFERENCE_DOCUMENT_TYPES).toEqual([39, 41, 50, 52, 801, 802, 803, 804, 805, 806, 813])
  expect(RECEIPT_REFERENCE_DOCUMENT_TYPES.every(isReferenceDocumentType)).toBe(true)
  expect(RECEIPT_REFERENCE_DOCUMENT_TYPES.every(isReceiptReferenceDocumentType)).toBe(true)
  expect([33, 61, 807, 820].some(isReceiptReferenceDocumentType)).toBe(false)
  expect(isReceiptReferenceDocumentType('39')).toBe(false)
})

test('isReferenceDocumentType takes numeric codes only: an alphabetic TpoDocRef is not checked', () => {
  expect([31, 0, 816, 824, 33.5].some(isReferenceDocumentType)).toBe(false)
  expect(isReferenceDocumentType('SET')).toBe(false)
  expect(isReferenceDocumentType('33')).toBe(false)
  expect(isReferenceDocumentType(undefined)).toBe(false)
})

test('the root entry exports the tables and their guards', () => {
  expect(root.REFERENCE_DOCUMENT_TYPES).toBe(REFERENCE_DOCUMENT_TYPES)
  expect(root.RECEIPT_REFERENCE_DOCUMENT_TYPES).toBe(RECEIPT_REFERENCE_DOCUMENT_TYPES)
  expect(root.isReferenceDocumentType).toBe(isReferenceDocumentType)
  expect(root.isReceiptReferenceDocumentType).toBe(isReceiptReferenceDocumentType)
})
