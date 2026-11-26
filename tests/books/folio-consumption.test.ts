import {
  buildFolioConsumptionXml,
  compactFolioRanges,
  createFolioConsumption,
  signFolioConsumption,
  verifyFolioConsumptionSignature,
} from '../../src/books/folio-consumption'
import type { DteError } from '../../src/errors'
import type { FolioConsumptionEntry, FolioConsumptionInput } from '../../src/model/book'
import { toSiiFolioConsumption } from '../../src/model/book-codec'
import { BOOK_ID, certificate, reportCover } from '../support/book-fixtures'
import { REPORT_SAMPLES } from '../support/report-samples'
import { FIXED_NOW, fixtureText } from '../support/fixtures'
import { validateAgainstXsd } from '../support/xsd'

jest.setTimeout(30_000)

const receipt: FolioConsumptionEntry = { type: 39, folio: 1, issueDate: '2026-10-15', totalAmount: 1000 }

const failure = (input: FolioConsumptionInput): { code: string; details: unknown } => {
  try {
    createFolioConsumption(input)
  } catch (error) {
    return { code: (error as DteError).code, details: (error as DteError).details }
  }
  throw new Error('expected a DteError')
}

describe.each(['report-day', 'report-no-sales'] as const)('sample %s', (name) => {
  const { book, xml } = REPORT_SAMPLES[name]

  test('matches its golden XML byte for byte', () => {
    expect(xml).toBe(fixtureText(`books/${name}.xml`).trimEnd())
  })

  test('signed, it validates against the official schema and verifies', async () => {
    const signed = signFolioConsumption(book, certificate)
    expect(await validateAgainstXsd(signed.xml, 'ConsumoFolio')).toEqual([])
    expect(verifyFolioConsumptionSignature(signed.xml)).toMatchObject({ referenceId: BOOK_ID, valid: true })
  })
})

describe('compactFolioRanges', () => {
  test.each([
    [[], []],
    [[5], [{ from: 5, to: 5 }]],
    [[3, 1, 2], [{ from: 1, to: 3 }]],
    [
      [1, 2, 3, 7, 9, 10],
      [
        { from: 1, to: 3 },
        { from: 7, to: 7 },
        { from: 9, to: 10 },
      ],
    ],
    [
      [10, 2],
      [
        { from: 2, to: 2 },
        { from: 10, to: 10 },
      ],
    ],
  ])('%j', (folios, ranges) => {
    expect(compactFolioRanges(folios)).toEqual(ranges)
  })
})

describe('createFolioConsumption', () => {
  // `ConsumoFolio_v10.xsd` types the `ID` of `DocumentoConsumoFolios` as `xs:ID`, a name.
  test.each(['1RCOF', 'a b', 'x<y', 'a"b', ''])('an id of %j is refused, and a name is kept', (id) => {
    const report = { cover: reportCover, entries: [receipt] }
    expect(failure({ ...report, id })).toEqual({ code: 'INVALID_OPTION', details: { field: 'id' } })
    expect(createFolioConsumption({ ...report, id: 'RCOF_2026-10.a' }).id).toBe('RCOF_2026-10.a')
  })

  test('an id of null is one left out, as before: an id is generated', () => {
    const id = null as unknown as undefined
    expect(createFolioConsumption({ ...{ cover: reportCover, entries: [receipt], now: FIXED_NOW }, id }).id).toBe(
      'RCOF_15_11_2026_15_30_00_000',
    )
  })

  test('the dates come from the lines, the sequence defaults to 1 and the id and timestamp are generated', () => {
    const report = createFolioConsumption({
      cover: reportCover,
      entries: [
        receipt,
        { ...receipt, folio: 2, issueDate: '2026-10-13' },
        { ...receipt, folio: 3, issueDate: undefined },
      ],
      now: FIXED_NOW,
    })
    expect(report.cover).toMatchObject({
      from: '2026-10-13',
      to: '2026-10-15',
      sequence: 1,
      signedAt: '2026-11-15T15:30:00',
    })
    expect(report.cover).not.toHaveProperty('correlative')
    expect(report.id).toBe('RCOF_15_11_2026_15_30_00_000')
  })

  test('explicit dates win and are normalized', () => {
    const report = createFolioConsumption({
      cover: { ...reportCover, from: '01-10-2026', to: '02-10-2026' },
      entries: [receipt],
    })
    expect(report.cover).toMatchObject({ from: '2026-10-01', to: '2026-10-02' })
  })

  test('a summary adds the receipts and counts issued, voided and used folios', () => {
    expect(REPORT_SAMPLES['report-day'].book.summaries).toEqual([
      {
        type: 39,
        netAmount: 5882,
        vatAmount: 1118,
        vatRate: 19,
        exemptAmount: 500,
        totalAmount: 7500,
        issuedCount: 4,
        voidedCount: 2,
        usedCount: 6,
        usedRanges: [
          { from: 1, to: 3 },
          { from: 7, to: 7 },
        ],
        voidedRanges: [{ from: 4, to: 5 }],
      },
      {
        type: 41,
        netAmount: 0,
        vatAmount: 0,
        exemptAmount: 900,
        totalAmount: 900,
        issuedCount: 1,
        voidedCount: 1,
        usedCount: 2,
        usedRanges: [{ from: 50, to: 50 }],
        voidedRanges: [{ from: 51, to: 51 }],
      },
    ])
  })

  test('type 41 ignores net and VAT and emits no rate', () => {
    const { summaries } = createFolioConsumption({
      cover: reportCover,
      entries: [{ type: 41, folio: 1, issueDate: '2026-10-15', netAmount: 5, vatAmount: 1, totalAmount: 6 }],
    })
    expect(summaries[0]).toMatchObject({ netAmount: 0, vatAmount: 0, totalAmount: 6 })
    expect(summaries[0]).not.toHaveProperty('vatRate')
  })

  // `ConsumoFolio_v10.xsd` admits three types in a summary (`TipoConsumoType`): 39, 41 and 61, which it annotates
  // "Nota de Credito Electronica".
  describe('a credit note', () => {
    const note = {
      type: 61,
      folio: 4,
      issueDate: '2026-10-15',
      netAmount: 1000,
      vatAmount: 190,
      exemptAmount: 50,
      totalAmount: 1240,
    } as const
    const report = createFolioConsumption({
      cover: reportCover,
      entries: [note, receipt, { type: 41, folio: 2, issueDate: '2026-10-15', exemptAmount: 300, totalAmount: 300 }],
      voidedFolios: [{ type: 61, folio: 5 }],
      now: FIXED_NOW,
    })

    test('is reported beside the receipts, after them, with its net, its VAT and its exempt amount', () => {
      expect(report.summaries.map((summary) => summary.type)).toEqual([39, 41, 61])
      expect(report.summaries[2]).toEqual({
        type: 61,
        netAmount: 1000,
        vatAmount: 190,
        vatRate: 19,
        exemptAmount: 50,
        totalAmount: 1240,
        issuedCount: 1,
        voidedCount: 1,
        usedCount: 2,
        usedRanges: [{ from: 4, to: 4 }],
        voidedRanges: [{ from: 5, to: 5 }],
      })
    })

    test('makes a report the schema admits', async () => {
      const { xml } = signFolioConsumption(report, certificate)
      expect(xml).toContain('<TipoDocumento>61</TipoDocumento>\n<MntNeto>1000</MntNeto>\n<MntIva>190</MntIva>')
      expect(await validateAgainstXsd(xml, 'ConsumoFolio')).toEqual([])
    })

    test('alone, with no receipt, is a report of its type', () => {
      const alone = createFolioConsumption({ cover: reportCover, entries: [note] })
      expect(alone.summaries.map((summary) => [summary.type, summary.usedCount])).toEqual([[61, 1]])
    })
  })

  test('voided folios alone produce a summary of their type', () => {
    const { summaries } = createFolioConsumption({
      cover: { ...reportCover, from: '2026-10-15', to: '2026-10-15' },
      voidedFolios: [{ type: 41, folio: 9 }],
    })
    expect(summaries.map((summary) => [summary.type, summary.usedCount])).toEqual([[41, 1]])
  })

  test('a day without sales is one summary of type 39 in zeros', () => {
    const { book, xml } = REPORT_SAMPLES['report-no-sales']
    expect(book.summaries).toEqual([
      {
        type: 39,
        netAmount: 0,
        vatAmount: 0,
        vatRate: 19,
        exemptAmount: 0,
        totalAmount: 0,
        issuedCount: 0,
        voidedCount: 0,
        usedCount: 0,
        usedRanges: [],
        voidedRanges: [],
      },
    ])
    expect(xml).not.toContain('Rango')
  })

  test('zero amounts are omitted from the XML and the counts are not', () => {
    const xml = buildFolioConsumptionXml(createFolioConsumption({ cover: reportCover, entries: [receipt] }))
    expect(xml).toContain(
      '<TipoDocumento>39</TipoDocumento>\n<TasaIVA>19</TasaIVA>\n<MntTotal>1000</MntTotal>\n<FoliosEmitidos>1</FoliosEmitidos>\n<FoliosAnulados>0</FoliosAnulados>',
    )
  })

  test('the cover carries its version attribute and its correlative', () => {
    const { xml } = REPORT_SAMPLES['report-day']
    expect(xml).toContain('<Caratula version="1.0">')
    expect(xml).toContain('<Correlativo>1</Correlativo>\n<SecEnvio>2</SecEnvio>')
  })

  test.each([
    [{ cover: reportCover }, 'MISSING_FIELD', { field: 'cover.from' }],
    [{ cover: { ...reportCover, from: '2026-10-15' } }, 'MISSING_FIELD', { field: 'cover.to' }],
    [{ cover: reportCover, entries: [{ ...receipt, type: 33 }] }, 'INVALID_DOCUMENT_TYPE', { field: 'type', type: 33 }],
    [{ cover: reportCover, entries: [{ ...receipt, folio: 0 }] }, 'INVALID_FOLIO', { field: 'folio', folio: 0 }],
    [{ cover: reportCover, entries: [receipt, receipt] }, 'INVALID_FOLIO', { field: 'folio', folio: 1, type: 39 }],
    [
      { cover: reportCover, entries: [receipt], voidedFolios: [{ type: 39, folio: 1 }] },
      'INVALID_FOLIO',
      { field: 'folio', folio: 1, type: 39 },
    ],
    [{ cover: reportCover, entries: [{ ...receipt, totalAmount: -1 }] }, 'INVALID_AMOUNT', { field: 'totalAmount' }],
    [
      { cover: { ...reportCover, resolutionNumber: -1 }, entries: [receipt] },
      'INVALID_OPTION',
      { field: 'cover.resolutionNumber' },
    ],
    [{ cover: { ...reportCover, sequence: 1000 }, entries: [receipt] }, 'INVALID_OPTION', { field: 'cover.sequence' }],
    [
      { cover: { ...reportCover, correlative: -1 }, entries: [receipt] },
      'INVALID_OPTION',
      { field: 'cover.correlative' },
    ],
    [{ cover: { ...reportCover, sequence: 1.5 }, entries: [receipt] }, 'INVALID_OPTION', { field: 'cover.sequence' }],
  ] as const)('rejects %j', (input, code, details) => {
    expect(failure(input as FolioConsumptionInput)).toEqual({ code, details })
  })

  test('the same folio may appear on both receipt types', () => {
    expect(
      createFolioConsumption({ cover: reportCover, entries: [receipt, { ...receipt, type: 41 }] }).summaries,
    ).toHaveLength(2)
  })

  test('rejects bad dates and RUTs', () => {
    expect(failure({ cover: reportCover, entries: [{ ...receipt, issueDate: 'hoy' }] }).code).toBe('INVALID_DATE')
    expect(failure({ cover: { ...reportCover, issuerRut: '1-1' }, entries: [receipt] }).code).toBe('INVALID_RUT')
  })
})

describe('signFolioConsumption', () => {
  const signed = signFolioConsumption(REPORT_SAMPLES['report-day'].book, certificate)

  test('inserts the signature between the closing tags', () => {
    expect(signed.xml).toContain('</DocumentoConsumoFolios><Signature xmlns="http://www.w3.org/2000/09/xmldsig#">')
    expect(signed.xml.endsWith('</Signature></ConsumoFolios>')).toBe(true)
  })

  test('a tampered report does not verify', () => {
    const tampered = signed.xml.replace('<MntTotal>7500</MntTotal>', '<MntTotal>7501</MntTotal>')
    expect(verifyFolioConsumptionSignature(tampered)).toMatchObject({ digestValid: false, valid: false })
  })
})

describe('toSiiFolioConsumption', () => {
  test('the cover and the summary follow the order of the schema', () => {
    const sii = toSiiFolioConsumption(
      createFolioConsumption({
        cover: { ...reportCover, correlative: 1 },
        entries: [
          {
            type: 39,
            folio: 1,
            issueDate: '2026-10-15',
            netAmount: 84,
            vatAmount: 16,
            exemptAmount: 5,
            totalAmount: 105,
          },
        ],
        voidedFolios: [{ type: 39, folio: 2 }],
        now: FIXED_NOW,
      }),
    )
    expect(Object.keys(sii.Caratula)).toEqual([
      'RutEmisor',
      'RutEnvia',
      'FchResol',
      'NroResol',
      'FchInicio',
      'FchFinal',
      'Correlativo',
      'SecEnvio',
      'TmstFirmaEnv',
    ])
    expect(Object.keys(sii.Resumen[0])).toEqual([
      'TipoDocumento',
      'MntNeto',
      'MntIva',
      'TasaIVA',
      'MntExento',
      'MntTotal',
      'FoliosEmitidos',
      'FoliosAnulados',
      'FoliosUtilizados',
      'RangoUtilizados',
      'RangoAnulados',
    ])
  })
})
