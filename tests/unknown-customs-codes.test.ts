import { unknownCustomsCodes } from '../src/catalogs'
import { createDocument } from '../src/document/create'
import type { Customs, DocumentInput } from '../src'
import { exportInput, invoiceInput } from './support/received-fixtures'

// Every code of the customs area below is a row of its table of Anexo 51 of the Compendio de Normas Aduaneras.
const knownCustoms: Customs = {
  saleModality: 1,
  saleClause: 2,
  saleClauseTotal: 1234.5,
  transportRoute: 1,
  loadingPort: 906,
  unloadingPort: 211,
  tare: 2200,
  tareUnit: 6,
  grossWeight: 18450.75,
  grossWeightUnit: 6,
  netWeight: 16250.5,
  netWeightUnit: 6,
  totalPackages: 801,
  packages: [
    { code: 13, count: 800, marks: 'ANDES MIAMI 1-800' },
    { code: 75, count: 1, containerId: 'MSCU1234565', seal: 'SL-0098', sealIssuer: 'Aduana de Chile' },
  ],
  receiverCountry: 225,
  destinationCountry: 225,
}

// Codes inside the range the schema admits for their field that no row of their table has.
const GAP = { mode: 98, clause: 98, route: 2, port: 9998, unit: 1, country: 996, payment: 3, pack: 6 } as const

const receiverWith = (foreign?: { readonly nationality?: string }) => ({
  rut: '55555555-5',
  businessName: 'Andes Trading LLC',
  address: '1200 Harbor Blvd',
  city: 'Miami',
  ...(foreign === undefined ? {} : { foreign }),
})

const exportWith = (customs: Customs, overrides: Partial<DocumentInput> = {}) =>
  createDocument(exportInput(1, { transport: { customs }, options: { exportPaymentTerms: '1' }, ...overrides }))

describe('unknownCustomsCodes', () => {
  test('an export document whose every code is in its table has none unknown', () => {
    const document = exportWith(knownCustoms, { receiver: receiverWith({ nationality: '225' }) })
    expect(unknownCustomsCodes(document)).toEqual([])
  })

  test.each([
    ['saleModality', GAP.mode, 'saleModes'],
    ['saleClause', GAP.clause, 'saleClauses'],
    ['transportRoute', GAP.route, 'transportRoutes'],
    ['loadingPort', GAP.port, 'ports'],
    ['unloadingPort', GAP.port, 'ports'],
    ['tareUnit', GAP.unit, 'units'],
    ['grossWeightUnit', GAP.unit, 'units'],
    ['netWeightUnit', GAP.unit, 'units'],
    ['receiverCountry', GAP.country, 'countries'],
    ['destinationCountry', GAP.country, 'countries'],
  ] as const)('%s alone unknown gives its entry', (key, code, table) => {
    const document = exportWith({ ...knownCustoms, [key]: code })
    expect(unknownCustomsCodes(document)).toEqual([{ field: `transport.customs.${key}`, code, table }])
  })

  test('a package type alone unknown gives its entry, by its index', () => {
    const document = exportWith({
      ...knownCustoms,
      packages: [
        { code: 13, count: 800, marks: 'A' },
        { code: GAP.pack, count: 1, marks: 'B' },
      ],
    })
    expect(unknownCustomsCodes(document)).toEqual([
      { field: 'transport.customs.packages[1].code', code: GAP.pack, table: 'packageTypes' },
    ])
  })

  test('a package without a code is left alone', () => {
    const document = exportWith({ ...knownCustoms, packages: [{ count: 1, marks: 'A' }] })
    expect(unknownCustomsCodes(document)).toEqual([])
  })

  test('the nationality of the foreign receiver, a number in text, is held to the countries', () => {
    const unknown = exportWith(knownCustoms, { receiver: receiverWith({ nationality: String(GAP.country) }) })
    expect(unknownCustomsCodes(unknown)).toEqual([
      { field: 'receiver.foreign.nationality', code: GAP.country, table: 'countries' },
    ])
    expect(unknownCustomsCodes(exportWith(knownCustoms, { receiver: receiverWith({ nationality: '225' }) }))).toEqual(
      [],
    )
    expect(unknownCustomsCodes(exportWith(knownCustoms, { receiver: receiverWith({}) }))).toEqual([])
  })

  test('a nationality that is not made of digits is unknown, reported as the text it is', () => {
    const document = exportWith(knownCustoms, { receiver: receiverWith({ nationality: 'US' }) })
    expect(unknownCustomsCodes(document)).toEqual([
      { field: 'receiver.foreign.nationality', code: 'US', table: 'countries' },
    ])
  })

  test('the export payment terms, a number in text, are held to the payment forms', () => {
    const unknown = exportWith(knownCustoms, { options: { exportPaymentTerms: String(GAP.payment) } })
    expect(unknownCustomsCodes(unknown)).toEqual([
      { field: 'options.exportPaymentTerms', code: GAP.payment, table: 'paymentTerms' },
    ])
    expect(unknownCustomsCodes(exportWith(knownCustoms, { options: { exportPaymentTerms: '21' } }))).toEqual([])
  })

  test('several unknown come in the order of the fields, the packages in theirs', () => {
    const document = exportWith(
      {
        ...knownCustoms,
        destinationCountry: 996,
        receiverCountry: 995,
        netWeightUnit: 1,
        loadingPort: 9998,
        saleModality: 98,
        packages: [
          { code: 6, count: 1, marks: 'A' },
          { code: 13, count: 1, marks: 'B' },
          { code: 7, count: 1, marks: 'C' },
        ],
      },
      { receiver: receiverWith({ nationality: '996' }), options: { exportPaymentTerms: '3' } },
    )
    expect(unknownCustomsCodes(document).map((entry) => `${entry.field}=${entry.code}`)).toEqual([
      'transport.customs.saleModality=98',
      'transport.customs.loadingPort=9998',
      'transport.customs.netWeightUnit=1',
      'transport.customs.packages[0].code=6',
      'transport.customs.packages[2].code=7',
      'transport.customs.receiverCountry=995',
      'transport.customs.destinationCountry=996',
      'receiver.foreign.nationality=996',
      'options.exportPaymentTerms=3',
    ])
  })

  test('a document that is no export has none, and an export without the optional fields has none', () => {
    expect(unknownCustomsCodes(createDocument(invoiceInput(1)))).toEqual([])
    const bare = createDocument(
      exportInput(1, {
        transport: { customs: { transportRoute: 4, receiverCountry: 225 } },
        options: { serviceIndicator: 4 },
      }),
    )
    expect(unknownCustomsCodes(bare)).toEqual([])
  })

  test('it does not change the document', () => {
    const document = exportWith({ ...knownCustoms, loadingPort: GAP.port })
    const before = JSON.stringify(document)
    unknownCustomsCodes(document)
    expect(JSON.stringify(document)).toBe(before)
  })
})
