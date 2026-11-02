import {
  buildPurchaseSalesBookXml,
  createPurchaseSalesBook,
  signPurchaseSalesBook,
  verifyPurchaseSalesBookSignature,
} from '../../src/books/purchase-sales'
import type { DteError } from '../../src/errors'
import type { PurchaseSalesBookInput } from '../../src/model/book'
import { encodeLatin1 } from '../../src/text/latin1'
import { BOOK_ID, certificate, exemptInvoice, invoice, purchaseCover, saleCover } from '../support/book-fixtures'
import { PURCHASE_SALES_SAMPLES } from '../support/purchase-sales-samples'
import { FIXED_NOW, fixtureText } from '../support/fixtures'
import { validateAgainstXsd } from '../support/xsd'

jest.setTimeout(30_000)

const failure = (input: PurchaseSalesBookInput): { code: string; details: unknown } => {
  try {
    createPurchaseSalesBook(input)
  } catch (error) {
    return { code: (error as DteError).code, details: (error as DteError).details }
  }
  throw new Error('expected a DteError')
}

const previous = [{ type: 33, documentCount: 1, exemptAmount: 0, netAmount: 10, vatAmount: 2, totalAmount: 12 }]

describe.each([
  'sale-total',
  'purchase-special',
  'sale-partial',
  'sale-final',
  'sale-adjustment',
  'sale-rectification',
] as const)('sample %s', (name) => {
  const { book, xml } = PURCHASE_SALES_SAMPLES[name]

  test('matches its golden XML byte for byte', () => {
    expect(xml).toBe(fixtureText(`books/${name}.xml`).trimEnd())
  })

  test('signed, it validates against the official schema and verifies', async () => {
    const signed = signPurchaseSalesBook(book, certificate)
    expect(await validateAgainstXsd(signed.xml, 'LibroCV')).toEqual([])
    expect(verifyPurchaseSalesBookSignature(signed.xml)).toMatchObject({ referenceId: BOOK_ID, valid: true })
  })
})

describe('createPurchaseSalesBook', () => {
  test('defaults to a monthly total and generates the id and timestamp in Chile time', () => {
    const book = createPurchaseSalesBook({ cover: saleCover, entries: [invoice], now: FIXED_NOW })
    expect(book.cover).toMatchObject({ kind: 'monthly', submission: 'total', operation: 'sale' })
    expect(book.id).toBe('LCV_15_11_2026_15_30_00_000')
    expect(book.signedAt).toBe('2026-11-15T15:30:00')
    expect(book.totalMismatches).toEqual([])
    expect(book).not.toHaveProperty('commonUseVatFactor')
    expect(book).not.toHaveProperty('additionalTaxFactors')
  })

  test('a period without movement is the cover alone', () => {
    const book = createPurchaseSalesBook({ cover: saleCover, id: BOOK_ID, now: FIXED_NOW })
    expect(book).toMatchObject({ entries: [], segmentTotals: null, periodTotals: null })
    const xml = buildPurchaseSalesBookXml(book)
    expect(xml).not.toContain('Resumen')
    expect(xml).not.toContain('Detalle')
    expect(xml).toContain('</Caratula>\n<TmstFirma>')
  })

  test('a total has a period summary and no segment summary', () => {
    const book = createPurchaseSalesBook({ cover: saleCover, entries: [invoice, exemptInvoice] })
    expect(book.segmentTotals).toBeNull()
    expect(book.periodTotals?.map((row) => row.type)).toEqual([33, 34])
  })

  test('a partial has a segment summary and no period summary', () => {
    const { book } = PURCHASE_SALES_SAMPLES['sale-partial']
    expect(book.periodTotals).toBeNull()
    expect(book.segmentTotals?.map((row) => row.type)).toEqual([33, 61])
    expect(buildPurchaseSalesBookXml(book)).toContain('<NroSegmento>1</NroSegmento>')
  })

  test('a final adds previous and summary-only totals and has no segment summary', () => {
    const { book } = PURCHASE_SALES_SAMPLES['sale-final']
    expect(book.segmentTotals).toBeNull()
    expect(book.periodTotals?.map((row) => [row.type, row.totalAmount])).toEqual([
      [33, 476000],
      [61, 11900],
      [39, 999600],
    ])
  })

  test('an adjustment signs its segment and carries it to the period', () => {
    const { book } = PURCHASE_SALES_SAMPLES['sale-adjustment']
    expect(book.segmentTotals).toEqual([
      { type: 33, documentCount: 0, exemptAmount: 0, netAmount: -10000, vatAmount: -1900, totalAmount: -11900 },
    ])
    expect(book.periodTotals?.[0]).toEqual({
      type: 33,
      documentCount: 4,
      exemptAmount: 0,
      netAmount: 390000,
      vatAmount: 74100,
      totalAmount: 464100,
    })
  })

  test('an adjustment without lines has no segment summary, and without previous totals the period equals the segment', () => {
    const noLines = createPurchaseSalesBook({
      cover: { ...saleCover, submission: 'adjustment' },
      previousTotals: previous,
      summaryOnlyTotals: [{ type: 39, documentCount: 1, totalAmount: 5 }],
    })
    expect(noLines.segmentTotals).toBeNull()
    expect(noLines.periodTotals?.map((row) => row.type)).toEqual([33, 39])
    const noPrevious = createPurchaseSalesBook({
      cover: { ...saleCover, submission: 'adjustment' },
      entries: [invoice],
    })
    expect(noPrevious.periodTotals).toEqual(noPrevious.segmentTotals)
  })

  test('the book kinds reach the cover', () => {
    const { xml } = PURCHASE_SALES_SAMPLES['sale-rectification']
    expect(xml).toContain('<TipoLibro>RECTIFICA</TipoLibro>')
    expect(xml).toContain('<CodAutRec>AUT123</CodAutRec>')
    const special = PURCHASE_SALES_SAMPLES['purchase-special'].xml
    expect(special).toContain('<TipoOperacion>COMPRA</TipoOperacion>')
    expect(special).toContain('<FolioNotificacion>2</FolioNotificacion>')
  })

  test('the proportionality factor reaches only the period summary, with its credit on the total', () => {
    const entry = { type: 33, folio: 1, netAmount: 10, commonUseVat: 1 } as const
    const period = createPurchaseSalesBook({
      cover: purchaseCover,
      entries: [entry, { ...entry, folio: 2 }, { ...entry, folio: 3 }],
      commonUseVatFactor: 0.5,
    })
    expect(period.commonUseVatFactor).toBe(0.5)
    const xml = buildPurchaseSalesBookXml(period)
    expect(xml).toContain(
      '<TotIVAUsoComun>3</TotIVAUsoComun>\n<FctProp>0.5</FctProp>\n<TotCredIVAUsoComun>2</TotCredIVAUsoComun>',
    )
    const segment = buildPurchaseSalesBookXml(
      createPurchaseSalesBook({
        cover: { ...purchaseCover, submission: 'partial', segmentNumber: 1 },
        entries: [entry],
      }),
    )
    expect(segment).toContain('<TotIVAUsoComun>1</TotIVAUsoComun>')
    expect(segment).not.toContain('FctProp')
  })

  test('additional tax factors produce the credit of each code', () => {
    const book = createPurchaseSalesBook({
      cover: purchaseCover,
      entries: [
        {
          type: 33,
          folio: 1,
          netAmount: 100,
          vatAmount: 19,
          otherTaxes: [
            { code: 24, rate: 31.5, amount: 31 },
            { code: 28, rate: 1, amount: 5 },
          ],
        },
      ],
      additionalTaxFactors: { 24: 0.5 },
    })
    expect(book.additionalTaxFactors).toEqual({ 24: 0.5 })
    const xml = buildPurchaseSalesBookXml(book)
    expect(xml).toContain(
      '<CodImp>24</CodImp>\n<TotMntImp>31</TotMntImp>\n<FctImpAdic>0.5</FctImpAdic>\n<TotCredImp>16</TotCredImp>',
    )
    expect(xml).toContain('<CodImp>28</CodImp>\n<TotMntImp>5</TotMntImp>\n</TotOtrosImp>')
  })

  test('total mismatches are reported by default and thrown with strictTotals', () => {
    const entries = [{ ...invoice, totalAmount: 1 }]
    expect(createPurchaseSalesBook({ cover: saleCover, entries }).totalMismatches).toEqual([
      { index: 0, type: 33, folio: 101, expected: 119000, actual: 1 },
    ])
    expect(failure({ cover: saleCover, entries, strictTotals: true })).toEqual({
      code: 'BOOK_TOTAL_MISMATCH',
      details: { index: 0, expected: 119000, actual: 1 },
    })
    expect(
      createPurchaseSalesBook({ cover: saleCover, entries: [invoice], strictTotals: true }).totalMismatches,
    ).toEqual([])
  })

  test.each([
    [{ cover: { ...saleCover, kind: 'special' } }, 'MISSING_FIELD', { field: 'cover.notificationFolio' }],
    [{ cover: { ...saleCover, kind: 'rectification' } }, 'MISSING_FIELD', { field: 'cover.rectificationCode' }],
    [{ cover: { ...saleCover, submission: 'partial', segmentNumber: 1 } }, 'MISSING_FIELD', { field: 'entries' }],
    [{ cover: { ...saleCover, submission: 'final' } }, 'MISSING_FIELD', { field: 'previousTotals' }],
    [
      { cover: { ...saleCover, submission: 'final' }, previousTotals: [] },
      'MISSING_FIELD',
      { field: 'previousTotals' },
    ],
    [
      { cover: { ...saleCover, submission: 'final' }, previousTotals: previous, entries: [invoice] },
      'INVALID_OPTION',
      { field: 'entries' },
    ],
    [{ cover: saleCover, previousTotals: previous }, 'INVALID_OPTION', { field: 'previousTotals' }],
    [
      {
        cover: { ...saleCover, submission: 'partial', segmentNumber: 1 },
        entries: [invoice],
        summaryOnlyTotals: [{ type: 39 }],
      },
      'INVALID_OPTION',
      { field: 'summaryOnlyTotals' },
    ],
    [
      { cover: purchaseCover, entries: [{ type: 33, folio: 1, commonUseVat: 1 }] },
      'MISSING_FIELD',
      { field: 'commonUseVatFactor' },
    ],
    [{ cover: saleCover, commonUseVatFactor: 0 }, 'INVALID_OPTION', { field: 'commonUseVatFactor' }],
    [{ cover: saleCover, commonUseVatFactor: 100 }, 'INVALID_OPTION', { field: 'commonUseVatFactor' }],
    [{ cover: saleCover, commonUseVatFactor: 0.1234 }, 'INVALID_OPTION', { field: 'commonUseVatFactor' }],
    [{ cover: saleCover, additionalTaxFactors: { 24: 0 } }, 'INVALID_OPTION', { field: 'additionalTaxFactors' }],
    [{ cover: saleCover, additionalTaxFactors: { 24: 1.5 } }, 'INVALID_OPTION', { field: 'additionalTaxFactors' }],
    [{ cover: saleCover, additionalTaxFactors: { 24: 0.12345 } }, 'INVALID_OPTION', { field: 'additionalTaxFactors' }],
  ] as const)('rejects %j', (input, code, details) => {
    expect(failure(input as PurchaseSalesBookInput)).toEqual({ code, details })
  })

  test('rejects a rectification code over the limit', () => {
    expect(
      failure({ cover: { ...saleCover, kind: 'rectification', rectificationCode: 'x'.repeat(11) } }),
    ).toMatchObject({ code: 'FIELD_TOO_LONG', details: { field: 'CodAutRec' } })
  })

  test('a rectification code outside a rectification book does not travel', () => {
    const book = createPurchaseSalesBook({ cover: { ...saleCover, rectificationCode: 'AUT123' } })
    expect(book.cover).not.toHaveProperty('rectificationCode')
  })
})

describe('signPurchaseSalesBook', () => {
  const { book } = PURCHASE_SALES_SAMPLES['sale-total']
  const signed = signPurchaseSalesBook(book, certificate)

  test('inserts the signature between the closing tags, referencing the ID', () => {
    expect(
      signed.xml.startsWith(PURCHASE_SALES_SAMPLES['sale-total'].xml.slice(0, -'</LibroCompraVenta>'.length)),
    ).toBe(true)
    expect(signed.xml).toContain('</EnvioLibro><Signature xmlns="http://www.w3.org/2000/09/xmldsig#">')
    expect(signed.xml.endsWith('</Signature></LibroCompraVenta>')).toBe(true)
    expect(signed.xml).toContain(`<Reference URI="#${BOOK_ID}">`)
    expect(signed).toMatchObject({ id: BOOK_ID, signature: { digestValue: expect.any(String) } })
  })

  test('no line goes over the limit of the SII', () => {
    expect(Math.max(...signed.xml.split('\n').map((line) => line.length))).toBeLessThan(4090)
  })

  test('the XML is ISO-8859-1 text', () => {
    expect(() => encodeLatin1(signed.xml)).not.toThrow()
  })

  test('a tampered book does not verify', () => {
    const tampered = signed.xml.replace('<MntNeto>100000</MntNeto>', '<MntNeto>100001</MntNeto>')
    expect(verifyPurchaseSalesBookSignature(tampered)).toMatchObject({ digestValid: false, valid: false })
  })
})
