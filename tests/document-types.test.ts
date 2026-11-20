import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_VALUES,
  documentTypeName,
  isDocumentType,
  isExemptType,
  isExport,
  isNote,
  isReceipt,
  requiresReceiver,
  isTransferable,
} from '../src/catalogs/document-types'
import type { DocumentType } from '../src/catalogs/document-types'

const types = (...values: DocumentType[]): DocumentType[] => values

describe('document types', () => {
  test('maps English names to SII codes', () => {
    expect(DOCUMENT_TYPES).toEqual({
      invoice: 33,
      exemptInvoice: 34,
      receipt: 39,
      exemptReceipt: 41,
      settlementInvoice: 43,
      purchaseInvoice: 46,
      dispatchGuide: 52,
      debitNote: 56,
      creditNote: 61,
      exportInvoice: 110,
      exportDebitNote: 111,
      exportCreditNote: 112,
    })
    expect(DOCUMENT_TYPE_VALUES).toEqual([33, 34, 39, 41, 43, 46, 52, 56, 61, 110, 111, 112])
  })

  test.each([33, 34, 39, 41, 43, 46, 52, 56, 61, 110, 111, 112])('isDocumentType accepts %i', (type) => {
    expect(isDocumentType(type)).toBe(true)
  })

  test.each([0, 113, '33', '110', null, undefined, 33.5, NaN])('isDocumentType rejects %p', (value) => {
    expect(isDocumentType(value)).toBe(false)
  })

  test('predicates', () => {
    expect(types(39, 41).every(isReceipt)).toBe(true)
    expect(types(33, 34, 43, 46, 52, 56, 61).some(isReceipt)).toBe(false)
    expect(types(34, 41).every(isExemptType)).toBe(true)
    expect(isExemptType(33)).toBe(false)
    expect(types(56, 61, 111, 112).every(isNote)).toBe(true)
    expect(types(33, 110).some(isNote)).toBe(false)
    expect(types(110, 111, 112).every(isExport)).toBe(true)
    expect(types(33, 34, 39, 41, 43, 46, 52, 56, 61).some(isExport)).toBe(false)
    expect(types(110, 111, 112).some(isExemptType)).toBe(false)
    expect(types(33, 34, 43, 46, 52, 56, 61, 110, 111, 112).every(requiresReceiver)).toBe(true)
    expect(types(39, 41).some(requiresReceiver)).toBe(false)
    expect(types(33, 34, 43, 46, 52).every(isTransferable)).toBe(true)
    expect(types(39, 41, 56, 61, 110, 111, 112).some(isTransferable)).toBe(false)
  })

  test('names in the three variants', () => {
    expect(documentTypeName(33)).toBe('Factura Electrónica')
    expect(documentTypeName(33, 'short')).toBe('FACTURA')
    expect(documentTypeName(33, 'printed')).toBe('FACTURA ELECTRÓNICA')
    expect(documentTypeName(43, 'printed')).toBe('LIQUIDACIÓN FACTURA ELECTRÓNICA')
    expect(documentTypeName(34, 'printed')).toBe('FACTURA NO AFECTA O EXENTA ELECTRÓNICA')
    expect(documentTypeName(110)).toBe('Factura de Exportación Electrónica')
    expect(documentTypeName(111, 'short')).toBe('NOTA DEBITO EXPORTACION')
    expect(documentTypeName(112, 'printed')).toBe('NOTA DE CRÉDITO DE EXPORTACIÓN ELECTRÓNICA')
  })
})
