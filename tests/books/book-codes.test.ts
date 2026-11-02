import {
  BOOK_DOCUMENT_TYPES,
  BOOK_KINDS,
  BOOK_OPERATIONS,
  BOOK_SUBMISSIONS,
  GUIDE_TRANSFER_TYPES,
  GUIDE_VOID_CODES,
  isBookDocumentType,
  NON_RECOVERABLE_VAT_CODES,
  SUMMARY_ONLY_DOCUMENT_TYPES,
} from '../../src/catalogs/book-codes'

describe('book catalogs', () => {
  test('carry the SII values of the cover', () => {
    expect(BOOK_OPERATIONS).toEqual({ sale: 'VENTA', purchase: 'COMPRA' })
    expect(BOOK_KINDS).toEqual({ monthly: 'MENSUAL', special: 'ESPECIAL', rectification: 'RECTIFICA' })
    expect(BOOK_SUBMISSIONS).toEqual({ total: 'TOTAL', partial: 'PARCIAL', final: 'FINAL', adjustment: 'AJUSTE' })
  })

  test('list the codes of the schema', () => {
    expect(Object.values(NON_RECOVERABLE_VAT_CODES)).toEqual([1, 2, 3, 4, 9])
    expect(Object.values(GUIDE_TRANSFER_TYPES)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(GUIDE_VOID_CODES).toEqual({ folio: 1, guide: 2, partialReceipt: 3 })
  })

  test('document types are the DoctoType enumeration, summary-only ones included', () => {
    expect(BOOK_DOCUMENT_TYPES).toHaveLength(53)
    for (const type of SUMMARY_ONLY_DOCUMENT_TYPES) expect(BOOK_DOCUMENT_TYPES).toContain(type)
  })

  test.each([
    [33, true],
    [46, true],
    [501, true],
    [47, false],
    [48, true],
    [52, false],
    ['33', false],
    [undefined, false],
  ])('isBookDocumentType(%p) is %p', (value, expected) => {
    expect(isBookDocumentType(value)).toBe(expected)
  })
})
