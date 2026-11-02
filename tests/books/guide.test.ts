import {
  accumulateGuideTotals,
  buildGuideBookXml,
  createGuideBook,
  signGuideBook,
  verifyGuideBookSignature,
} from '../../src/books/guide'
import type { DteError } from '../../src/errors'
import type { GuideBookInput, GuideEntryInput } from '../../src/model/book'
import { toSiiGuideBook } from '../../src/model/book-codec'
import { BOOK_ID, certificate, guideCover } from '../support/book-fixtures'
import { GUIDE_SAMPLES } from '../support/guide-samples'
import { FIXED_NOW, fixtureText, RECEIVER_RUT } from '../support/fixtures'
import { validateAgainstXsd } from '../support/xsd'

jest.setTimeout(30_000)

const failure = (input: GuideBookInput): { code: string; details: unknown } => {
  try {
    createGuideBook(input)
  } catch (error) {
    return { code: (error as DteError).code, details: (error as DteError).details }
  }
  throw new Error('expected a DteError')
}

const entry = (fields: Partial<GuideEntryInput>): GuideEntryInput => ({ folio: 1, transferType: 1, ...fields })
const firstEntry = (fields: Partial<GuideEntryInput>) =>
  createGuideBook({ cover: guideCover, entries: [entry(fields)] }).entries[0]

describe.each(['guide-total', 'guide-adjustment'] as const)('sample %s', (name) => {
  const { book, xml } = GUIDE_SAMPLES[name]

  test('matches its golden XML byte for byte', () => {
    expect(xml).toBe(fixtureText(`books/${name}.xml`).trimEnd())
  })

  test('signed, it validates against the official schema and verifies', async () => {
    const signed = signGuideBook(book, certificate)
    expect(await validateAgainstXsd(signed.xml, 'LibroGuia')).toEqual([])
    expect(verifyGuideBookSignature(signed.xml)).toMatchObject({ referenceId: BOOK_ID, valid: true })
  })
})

describe('createGuideBook', () => {
  test('defaults to a total and generates the id and timestamp', () => {
    const book = createGuideBook({ cover: guideCover, entries: [entry({ totalAmount: 1 })], now: FIXED_NOW })
    expect(book.cover).toMatchObject({ submission: 'total', notificationFolio: 3 })
    expect(book.id).toBe('LGD_15_11_2026_15_30_00_000')
    expect(book.signedAt).toBe('2026-11-15T15:30:00')
  })

  test('the summary counts voids, sales and transfers per operation', () => {
    expect(GUIDE_SAMPLES['guide-total'].book.periodTotals).toEqual({
      voidedFolios: 1,
      voidedGuides: 1,
      saleGuides: 2,
      saleGuidesAmount: 71400,
      modifiedAmount: 5950,
      transfers: [
        { type: 5, count: 1, amount: 0 },
        { type: 7, count: 1, amount: 11900 },
      ],
    })
  })

  test('the same operation adds up, and a line without operation only reports its modified amount', () => {
    const book = createGuideBook({
      cover: guideCover,
      entries: [
        { folio: 1, transferType: 5, totalAmount: 10 },
        { folio: 2, transferType: 5, totalAmount: 20 },
        { folio: 3, modifiedAmount: 7 },
      ],
    })
    expect(book.periodTotals).toEqual({
      voidedFolios: 0,
      voidedGuides: 0,
      saleGuides: 0,
      saleGuidesAmount: 0,
      modifiedAmount: 7,
      transfers: [{ type: 5, count: 2, amount: 30 }],
    })
  })

  test('an adjustment signs its segment and adds it to the previous totals', () => {
    const { book } = GUIDE_SAMPLES['guide-adjustment']
    expect(book.entries.map((line) => line.adjustment)).toEqual(['remove', 'add'])
    expect(book.segmentTotals).toMatchObject({ saleGuides: 0, saleGuidesAmount: -11900 })
    expect(book.periodTotals).toMatchObject({ saleGuides: 2, saleGuidesAmount: 59500 })
  })

  test('removed voids and transfers subtract, without producing -0', () => {
    const book = createGuideBook({
      cover: { ...guideCover, submission: 'adjustment' },
      entries: [
        { folio: 1, voided: 'folio', adjustment: 'remove' },
        { folio: 2, voided: 'guide', adjustment: 'remove' },
        { folio: 3, transferType: 5, totalAmount: 0, adjustment: 'remove' },
      ],
    })
    expect(book.segmentTotals).toEqual({
      voidedFolios: -1,
      voidedGuides: -1,
      saleGuides: 0,
      saleGuidesAmount: 0,
      modifiedAmount: 0,
      transfers: [{ type: 5, count: -1, amount: 0 }],
    })
    expect(Object.is(book.segmentTotals?.transfers[0].amount, 0)).toBe(true)
    expect(Object.is(book.segmentTotals?.modifiedAmount, 0)).toBe(true)
  })

  test('zones follow the submission', () => {
    const partial = createGuideBook({
      cover: { ...guideCover, submission: 'partial', segmentNumber: 2 },
      entries: [entry({ totalAmount: 1 })],
    })
    expect(partial.periodTotals).toBeNull()
    expect(partial.segmentTotals).not.toBeNull()
    expect(buildGuideBookXml(partial)).toContain('<NroSegmento>2</NroSegmento>')

    const previousTotals = GUIDE_SAMPLES['guide-total'].book.periodTotals
    const final = createGuideBook({
      cover: { ...guideCover, submission: 'final' },
      previousTotals: previousTotals as NonNullable<typeof previousTotals>,
    })
    expect(final.segmentTotals).toBeNull()
    expect(final.periodTotals).toEqual(previousTotals)

    const empty = createGuideBook({ cover: guideCover })
    expect(empty).toMatchObject({ entries: [], segmentTotals: null, periodTotals: null })
    expect(buildGuideBookXml(empty)).not.toContain('Resumen')

    const adjustmentOnlyTotals = createGuideBook({
      cover: { ...guideCover, submission: 'adjustment' },
      previousTotals: previousTotals as NonNullable<typeof previousTotals>,
    })
    expect(adjustmentOnlyTotals.segmentTotals).toBeNull()
  })

  test.each([
    [{ cover: { ...guideCover, notificationFolio: undefined } }, 'MISSING_FIELD', { field: 'cover.notificationFolio' }],
    [{ cover: guideCover, entries: [{ folio: 0 }] }, 'INVALID_FOLIO', { field: 'folio', folio: 0, index: 0 }],
    [
      { cover: guideCover, entries: [{ folio: 1, transferType: 8 }] },
      'INVALID_OPTION',
      { field: 'transferType', index: 0 },
    ],
    [
      { cover: guideCover, entries: [{ folio: 1, transferType: 0 }] },
      'INVALID_OPTION',
      { field: 'transferType', index: 0 },
    ],
    [
      { cover: guideCover, entries: [{ folio: 1, transferType: 1.5 }] },
      'INVALID_OPTION',
      { field: 'transferType', index: 0 },
    ],
    [
      { cover: guideCover, entries: [{ folio: 1, referenceType: 52 }] },
      'INVALID_DOCUMENT_TYPE',
      { field: 'referenceType', type: 52, index: 0 },
    ],
    [
      { cover: guideCover, entries: [{ folio: 1, referenceFolio: 0 }] },
      'INVALID_FOLIO',
      { field: 'referenceFolio', folio: 0, index: 0 },
    ],
    [{ cover: guideCover, entries: [{ folio: 1, netAmount: -1 }] }, 'INVALID_AMOUNT', { field: 'netAmount', index: 0 }],
    [{ cover: guideCover, entries: [{ folio: 1, taxRate: 101 }] }, 'INVALID_AMOUNT', { field: 'taxRate', index: 0 }],
    [
      {
        cover: guideCover,
        previousTotals: {
          voidedFolios: 0,
          voidedGuides: 0,
          saleGuides: 0,
          saleGuidesAmount: 0,
          modifiedAmount: 0,
          transfers: [],
        },
      },
      'INVALID_OPTION',
      { field: 'previousTotals' },
    ],
  ] as const)('rejects %j', (input, code, details) => {
    expect(failure(input as unknown as GuideBookInput)).toEqual({ code, details })
  })

  test('rejects a name over the limit, a bad date and a bad RUT', () => {
    expect(failure({ cover: guideCover, entries: [entry({ receiverName: 'x'.repeat(51) })] })).toMatchObject({
      code: 'FIELD_TOO_LONG',
      details: { field: 'RznSoc' },
    })
    expect(failure({ cover: guideCover, entries: [entry({ date: 'hoy' })] }).code).toBe('INVALID_DATE')
    expect(failure({ cover: guideCover, entries: [entry({ referenceDate: 'hoy' })] }).code).toBe('INVALID_DATE')
    expect(failure({ cover: guideCover, entries: [entry({ receiverRut: '1-1' })] }).code).toBe('INVALID_RUT')
  })
})

describe('guide lines', () => {
  test('rate and VAT default to 0 and the total to net plus VAT', () => {
    expect(firstEntry({})).toEqual({ folio: 1, transferType: 1, taxRate: 0, vatAmount: 0, totalAmount: 0 })
    expect(firstEntry({ netAmount: 100 })).toMatchObject({ taxRate: 0, vatAmount: 0, totalAmount: 100 })
  })

  test('VAT absent or 0 comes from rate and net, rounded', () => {
    expect(firstEntry({ netAmount: 1003, taxRate: 19 })).toMatchObject({ vatAmount: 191, totalAmount: 1194 })
    expect(firstEntry({ netAmount: 100, taxRate: 19, vatAmount: 0 }).vatAmount).toBe(19)
    expect(firstEntry({ netAmount: 100, taxRate: 19, vatAmount: 18 })).toMatchObject({
      vatAmount: 18,
      totalAmount: 118,
    })
  })

  test('an explicit total stays', () => {
    expect(firstEntry({ netAmount: 100, totalAmount: 5 }).totalAmount).toBe(5)
  })

  test('folio and guide voids drop amounts and receiver; a partial receipt keeps them', () => {
    const fields = { receiverRut: RECEIVER_RUT, receiverName: 'x', netAmount: 100, taxRate: 19, date: '2026-10-05' }
    expect(firstEntry({ ...fields, voided: 'folio' })).toEqual({
      folio: 1,
      voided: 'folio',
      transferType: 1,
      date: '2026-10-05',
      taxRate: 0,
      vatAmount: 0,
      totalAmount: 0,
    })
    expect(firstEntry({ ...fields, voided: 'guide' }).totalAmount).toBe(0)
    expect(firstEntry({ ...fields, voided: 'partialReceipt', modifiedAmount: 60 })).toMatchObject({
      voided: 'partialReceipt',
      receiverRut: RECEIVER_RUT,
      netAmount: 100,
      totalAmount: 119,
      modifiedAmount: 60,
    })
  })

  test('adjustments default to add on adjustment submissions and travel when given', () => {
    const book = createGuideBook({
      cover: { ...guideCover, submission: 'adjustment' },
      entries: [entry({})],
    })
    expect(book.entries[0].adjustment).toBe('add')
    expect(firstEntry({ adjustment: 'add' }).adjustment).toBe('add')
    expect(firstEntry({}).adjustment).toBeUndefined()
  })

  test('the reference to the invoice travels', () => {
    expect(GUIDE_SAMPLES['guide-total'].xml).toContain(
      '<TpoDocRef>33</TpoDocRef>\n<FolioDocRef>101</FolioDocRef>\n<FchDocRef>2026-10-05</FchDocRef>',
    )
  })
})

describe('accumulateGuideTotals', () => {
  test('adds everything, the transfers by operation', () => {
    const totals = {
      voidedFolios: 1,
      voidedGuides: 2,
      saleGuides: 3,
      saleGuidesAmount: 4,
      modifiedAmount: 5,
      transfers: [{ type: 5, count: 1, amount: 10 }],
    }
    expect(
      accumulateGuideTotals(totals, {
        ...totals,
        transfers: [
          { type: 5, count: 2, amount: 20 },
          { type: 7, count: 1, amount: 1 },
        ],
      }),
    ).toEqual({
      voidedFolios: 2,
      voidedGuides: 4,
      saleGuides: 6,
      saleGuidesAmount: 8,
      modifiedAmount: 10,
      transfers: [
        { type: 5, count: 3, amount: 30 },
        { type: 7, count: 1, amount: 1 },
      ],
    })
  })
})

describe('signGuideBook', () => {
  const signed = signGuideBook(GUIDE_SAMPLES['guide-total'].book, certificate)

  test('uses the XMLDSig namespace, as the schema requires', () => {
    expect(signed.xml).toContain('</EnvioLibro><Signature xmlns="http://www.w3.org/2000/09/xmldsig#">')
    expect(signed.xml.endsWith('</Signature></LibroGuia>')).toBe(true)
  })

  test('a tampered book does not verify', () => {
    expect(verifyGuideBookSignature(signed.xml.replace('<Folio>301</Folio>', '<Folio>399</Folio>'))).toMatchObject({
      valid: false,
    })
  })
})

describe('toSiiGuideBook', () => {
  test('the cover has no operation, and its kind is always ESPECIAL', () => {
    const sii = toSiiGuideBook(createGuideBook({ cover: guideCover }))
    expect(sii.Caratula.TipoLibro).toBe('ESPECIAL')
    expect(sii.Caratula).not.toHaveProperty('TipoOperacion')
    expect(sii).not.toHaveProperty('ResumenPeriodo')
    expect(sii).not.toHaveProperty('Detalle')
  })

  test('a line reaches its tags, in the order of the schema', () => {
    const sii = toSiiGuideBook(
      createGuideBook({
        cover: { ...guideCover, submission: 'adjustment' },
        entries: [
          {
            folio: 1,
            voided: 'partialReceipt',
            adjustment: 'remove',
            transferType: 1,
            date: '2026-10-05',
            receiverRut: RECEIVER_RUT,
            receiverName: 'Comercializadora Rapel Ltda',
            netAmount: 100,
            taxRate: 19,
            modifiedAmount: 50,
            referenceType: 33,
            referenceFolio: 2,
            referenceDate: '2026-10-05',
          },
        ],
      }),
    )
    expect(Object.keys(sii.Detalle?.[0] ?? {})).toEqual([
      'Folio',
      'Anulado',
      'Operacion',
      'TpoOper',
      'FchDoc',
      'RUTDoc',
      'RznSoc',
      'MntNeto',
      'TasaImp',
      'IVA',
      'MntTotal',
      'MntModificado',
      'TpoDocRef',
      'FolioDocRef',
      'FchDocRef',
    ])
    expect(sii.Detalle?.[0]).toMatchObject({ Anulado: 3, Operacion: 2 })
  })
})
