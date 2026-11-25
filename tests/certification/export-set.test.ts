import type { Caf } from '../../src/caf/parse'
import { loadCustomsCodes } from '../../src/certification/export-codes'
import { createFolioAllocator, type FolioSource } from '../../src/certification/folios'
import {
  DEFAULT_CERTIFICATION_FOREIGN_RECEIVER,
  issueTestSet,
  prepareExportSet,
  type IssueSetOptions,
  type IssuedSet,
} from '../../src/certification/issue-set'
import { planCertificationSets, type ExportSetPlan, type PlannedExport } from '../../src/certification/set-plan'
import { simulationFolioNeeds } from '../../src/certification/folios-step'
import { parseTestSetText } from '../../src/certification/set-text'
import { issueSimulation } from '../../src/certification/simulation'
import { verifyDocumentSignature } from '../../src/document/sign'
import { verifyEnvelopeSignature } from '../../src/envelope/sign'
import { verifyTed } from '../../src/ted/build'
import { cafFor, fullPlan, issueOptions } from '../support/certification-fixtures'
import { failure } from '../support/portal'
import { EXPORT_ATTENTION_1, EXPORT_ATTENTION_2, EXPORT_SET_TEXT, FULL_SET_TEXT } from '../support/test-set-samples'
import { validateAgainstXsd } from '../support/xsd'

// Two XSD validations and the signatures of six documents: CI's coverage job runs several times slower.
jest.setTimeout(60_000)

const id1 = (n: number) => `${EXPORT_ATTENTION_1}-${n}`
const id2 = (n: number) => `${EXPORT_ATTENTION_2}-${n}`
const DATE = '2026-11-15'
const RATES = { 'FRANCO SZ': 1075, YEN: 7, 'DOLAR USA': 950 }
const plan = planCertificationSets(parseTestSetText(EXPORT_SET_TEXT))
const first = plan.export1!
const second = plan.export2!
const exportCafs = (): readonly Caf[] => [cafFor(110), cafFor(111), cafFor(112)]
const options = (exportSets: IssueSetOptions['exportSets'] = { exchangeRates: RATES }): IssueSetOptions => ({
  ...issueOptions(exportCafs()),
  exportSets,
})
const planOf = (lines: readonly string[]): ExportSetPlan =>
  planCertificationSets(
    parseTestSetText(['SET DOCUMENTOS DE EXPORTACION - NUMERO DE ATENCION: 7', ...lines].join('\n')),
  ).export1!
const INVOICE = [
  'CASO 7-1',
  'DOCUMENTO  FACTURA DE EXPORTACION ELECTRONICA',
  'MONEDA DE LA OPERACION: DOLAR USA',
  'MODALIDAD DE VENTA: A FIRME',
  'CLAUSULA DE VENTA: FOB',
  'TOTAL CLAUSULA DE VENTA: 100',
  'VIA DE TRANSPORTE: MARITIMA',
  'PAIS RECEPTOR: ESTADOS UNIDOS',
  'ITEM  CANTIDAD  UNIDAD  PRECIO',
  'Uva de mesa  10  KN  10',
]
// A folio source that counts what it is asked for.
const counting = (): FolioSource & { readonly taken: () => number } => {
  const inner = createFolioAllocator(exportCafs())
  const box = { taken: 0 }
  return {
    take: (type) => {
      box.taken += 1
      return inner.take(type)
    },
    taken: () => box.taken,
  }
}

describe('the export plans', () => {
  test('one plan per set, each with its attention number and the folios of its documents', () => {
    expect(first).toMatchObject({
      kind: 'export',
      attentionNumber: EXPORT_ATTENTION_1,
      folios: { 110: 1, 111: 1, 112: 1 },
    })
    expect(second).toMatchObject({ kind: 'export', attentionNumber: EXPORT_ATTENTION_2, folios: { 110: 3 } })
    expect(first.documents.map((document) => [document.caseId, document.type])).toEqual([
      [id1(1), 110],
      [id1(2), 112],
      [id1(3), 111],
    ])
  })

  test('an invoice keeps its currency, items, payment form, customs area in words and customs documents', () => {
    expect(first.documents[0]).toEqual<PlannedExport>({
      caseId: id1(1),
      type: 110,
      currency: 'FRANCO SZ',
      items: [{ name: 'CHATARRA DE ALUMINIO', quantity: 687, unit: 'PAR', unitPrice: 159 }],
      paymentTerms: 'ANTICIPO',
      customs: {
        saleModality: 'EN CONSIGNACION LIBRE',
        saleClause: 'S/CL',
        saleClauseTotal: 3523.59,
        transportRoute: 'FERROVIARIO',
        loadingPort: 'PUERTO MONTT',
        unloadingPort: 'NAPOLES',
        tareUnit: 'KN',
        grossWeightUnit: 'PAR',
        netWeightUnit: 'PAR',
        packageType: 'PLANCHAS',
        totalPackages: 69,
        freight: 2069.28,
        insurance: 1215.22,
        receiverCountry: 'ITALIA',
        destinationCountry: 'ITALIA',
      },
      customsReferences: [{ type: 810, name: 'MIC/DTA' }],
    })
  })

  test('a note keeps the case it refers to, with the code of its reason, and takes the country of the set', () => {
    expect(first.documents[1]).toEqual<PlannedExport>({
      caseId: id1(2),
      type: 112,
      items: [{ name: 'CHATARRA DE ALUMINIO', quantity: 229 }],
      customs: { receiverCountry: 'ITALIA', destinationCountry: 'ITALIA' },
      customsReferences: [],
      reference: { caseId: id1(1), code: 3, reason: 'DEVOLUCION DE MERCADERIA' },
    })
    expect(first.documents[2]).toMatchObject({
      type: 111,
      items: [],
      reference: { caseId: id1(2), code: 1, reason: 'ANULA NOTA DE CREDITO' },
    })
  })

  test('services: a line surcharge, a line discount, a commission abroad and two customs documents', () => {
    const [services, goods, lodging] = second.documents
    expect(services).toMatchObject({
      serviceIndicator: 3,
      paymentTerms: 'COB1',
      items: [{ name: 'ASESORIAS Y PROYECTOS PROFESIONALES', quantity: 1, unitPrice: 94, surchargePercent: 10 }],
      customsReferences: [{ type: 812, name: 'RESOLUCION SNA' }],
    })
    expect(services.customs).not.toHaveProperty('saleModality')
    expect(goods).not.toHaveProperty('serviceIndicator')
    expect(goods).toMatchObject({
      foreignCommissionPercent: 11,
      customsReferences: [
        { type: 807, name: 'DUS' },
        { type: 809, name: 'AWB' },
      ],
    })
    expect(goods.items[0]).toEqual({
      name: 'CAJAS CIRUELAS TIERNIZADAS SIN CAROZO CALIBRE 60/70',
      quantity: 1036,
      unit: 'KN',
      unitPrice: 194,
      discountPercent: 5,
    })
    expect(lodging).toMatchObject({
      serviceIndicator: 4,
      currency: 'DOLAR USA',
      customs: { receiverCountry: 'VENEZUELA' },
    })
  })

  test('a case without a country takes the one an earlier case named, and a destination of its own is kept', () => {
    const planned = planOf([
      ...INVOICE,
      'PAIS DESTINO: CANADA',
      'CASO 7-2',
      'DOCUMENTO  FACTURA DE EXPORTACION ELECTRONICA',
      'MONEDA DE LA OPERACION: DOLAR USA',
      'ITEM  CANTIDAD',
      'Uva de mesa  4',
      'CASO 7-3',
      'DOCUMENTO  BOLETA',
      'CASO 7-4',
      'DOCUMENTO  NOTA DE CREDITO DE EXPORTACION ELECTRONICA',
      'RAZON REFERENCIA  CORRIGE MONTO',
    ])
    expect(planned.documents.map((document) => document.customs.destinationCountry)).toEqual([
      'CANADA',
      'ESTADOS UNIDOS',
      'ESTADOS UNIDOS',
    ])
    // A case of another document is no export case; a note that names no case has no reference.
    expect(planned.documents.map((document) => document.caseId)).toEqual(['7-1', '7-2', '7-4'])
    expect(planned.documents[2]).not.toHaveProperty('reference')
    expect(planned.folios).toEqual({ 110: 2, 112: 1 })
  })

  test('a set goes to the slot its name gives, or the first one free, and a third set is left out', () => {
    const header = (name: string, attention: number) =>
      `SET ${name} - NUMERO DE ATENCION: ${attention}\nCASO ${attention}-1\nDOCUMENTO  FACTURA DE EXPORTACION ELECTRONICA\n`
    const named = planCertificationSets(
      parseTestSetText(header('DOCUMENTOS DE EXPORTACION (2)', 2) + header('DOCUMENTOS DE EXPORTACION (1)', 1)),
    )
    expect([named.export1?.attentionNumber, named.export2?.attentionNumber]).toEqual(['1', '2'])
    const unnamed = planCertificationSets(
      parseTestSetText(
        header('DOCUMENTOS DE EXPORTACION', 1) +
          header('DOCUMENTOS DE EXPORTACION', 2) +
          header('DOCUMENTOS DE EXPORTACION', 3),
      ),
    )
    expect([unnamed.export1?.attentionNumber, unnamed.export2?.attentionNumber]).toEqual(['1', '2'])
    // Two sets named alike are both planned: the second takes the slot left free.
    const twice = planCertificationSets(
      parseTestSetText(header('DOCUMENTOS DE EXPORTACION (2)', 7) + header('DOCUMENTOS DE EXPORTACION (2)', 8)),
    )
    expect([twice.export1?.attentionNumber, twice.export2?.attentionNumber]).toEqual(['8', '7'])
  })

  test('a set built by hand without customs references plans none', () => {
    const [set] = parseTestSetText(EXPORT_SET_TEXT)
    const byHand = { ...set, cases: set.cases.map(({ customsReferences: _dropped, ...rest }) => rest) }
    expect(planCertificationSets([byHand]).export1!.documents.map((document) => document.customsReferences)).toEqual([
      [],
      [],
      [],
    ])
  })

  test('next to the other sets they add plans of their own and leave theirs exactly as they were', () => {
    const both = planCertificationSets(parseTestSetText(`${FULL_SET_TEXT}\n${EXPORT_SET_TEXT}`))
    const { export1, export2, ...rest } = both
    expect([export1, export2]).toEqual([first, second])
    expect(JSON.stringify(rest)).toBe(JSON.stringify(fullPlan()))
  })
})

describe('the customs codes', () => {
  test('each name of the sets, an abbreviation, the start of a name, and a port told apart by its heading', async () => {
    const codes = await loadCustomsCodes()
    expect([
      codes.country('ITALIA'),
      codes.loadingPort('PUERTO MONTT'),
      codes.unloadingPort('NAPOLES', 'ITALIA'),
      codes.transportRoute('FERROVIARIO'),
      codes.transportRoute('MARITIMA'),
      codes.saleClause('S/CL'),
      codes.saleModality('EN CONSIGNACION LIBRE'),
      codes.paymentTerms('ANTICIPO'),
      codes.packageType('PLANCHAS'),
      codes.unit('PAR'),
      codes.unit('MCUB'),
      codes.unit('KN'),
    ]).toEqual([504, 910, 544, 6, 1, 6, 3, 32, 89, 17, 16, 6])
    // SAN FRANCISCO is a port of the United States and a border crossing of Chile.
    expect(codes.unloadingPort('SAN FRANCISCO', undefined)).toBeNull()
    expect(codes.unloadingPort('SAN FRANCISCO', 'ESTADOS UNIDOS')).toBe(
      codes.unloadingPort('SAN FRANCISCO', 'ESTADOS UNIDOS'),
    )
    expect(codes.unloadingPort('SAN FRANCISCO', 'ESTADOS UNIDOS')).not.toBeNull()
    expect(codes.loadingPort('SAN FRANCISCO')).not.toBeNull()
    expect(codes.loadingPort('SAN FRANCISCO')).not.toBe(codes.unloadingPort('SAN FRANCISCO', 'ESTADOS UNIDOS'))
    expect([codes.country(''), codes.country('ATLANTIDA'), codes.loadingPort('ATLANTIDA')]).toEqual([null, null, null])
    expect(codes.countryName(504)).toBe('ITALIA')
  })
})

describe('issuing the export sets', () => {
  let one: IssuedSet
  let two: IssuedSet
  beforeAll(async () => {
    one = await issueTestSet(first, options())
    two = await issueTestSet(second, options())
  })
  const doc = (set: IssuedSet, n: number) => set.cases[n - 1].document

  test('each set issues its documents in the order of the set, each with its folio', () => {
    expect(one).toMatchObject({ kind: 'export', attentionNumber: EXPORT_ATTENTION_1 })
    expect(one.cases.map((issued) => [issued.caseId, issued.type, issued.folio])).toEqual([
      [id1(1), 110, 1],
      [id1(2), 112, 1],
      [id1(3), 111, 1],
    ])
    expect(two.cases.map((issued) => [issued.caseId, issued.type, issued.folio])).toEqual([
      [id2(1), 110, 1],
      [id2(2), 110, 2],
      [id2(3), 110, 3],
    ])
  })

  test('the totals: lines after their discounts and surcharges plus the global surcharges, in the currency of the case', () => {
    expect(one.cases.map((issued) => issued.document.header.totals)).toEqual([
      { exemptAmount: 112517.5, totalAmount: 112517.5 },
      { exemptAmount: 36411, totalAmount: 36411 },
      { exemptAmount: 36411, totalAmount: 36411 },
    ])
    // Field behaviour writes the 5 % of 200984 of the goods invoice, 10049.2, as a whole 10049 beside its percent,
    // and the surcharge of the service, 9.4, in the line's amount alone.
    expect(two.cases.map((issued) => issued.document.header.totals.totalAmount)).toEqual([103.4, 233792.38, 281])
    expect(two.cases[1].document.items[0]).toMatchObject({ discountPercent: 5, discountAmount: 10049, amount: 190935 })
    expect(two.cases.map((issued) => issued.document.header.currency)).toEqual(['YEN', 'YEN', 'DOLAR USA'])
  })

  test('the totals in pesos and the global surcharges in pesos, by the rate of each currency', () => {
    expect(doc(one, 1).header.otherCurrency).toEqual({
      currency: 'PESO CL',
      exchangeRate: 1075,
      exemptAmount: 120956313,
      totalAmount: 120956313,
    })
    expect(doc(one, 3).header.otherCurrency).toMatchObject({ exchangeRate: 1075, totalAmount: 39141825 })
    expect(two.cases.map((issued) => issued.document.header.otherCurrency?.totalAmount)).toEqual([724, 1636547, 266950])
    expect(doc(one, 1).globalAdjustments).toEqual([
      {
        lineNumber: 1,
        kind: 'surcharge',
        valueType: 'amount',
        value: 2069.28,
        description: 'FLETE',
        exemptIndicator: 1,
        otherCurrencyValue: 2224476,
      },
      {
        lineNumber: 2,
        kind: 'surcharge',
        valueType: 'amount',
        value: 1215.22,
        description: 'SEGURO',
        exemptIndicator: 1,
        otherCurrencyValue: 1306362,
      },
    ])
  })

  test('the invoice paid in advance: its foreign customer, its settlement date, its customs area and its references', () => {
    const invoice = doc(one, 1)
    expect(invoice.header.options).toEqual({ exportPaymentTerms: '32', settlementDate: DATE })
    expect(invoice.header.receiver).toEqual({
      rut: '55555555-5',
      businessName: 'IMPORTADOR EXTRANJERO',
      businessActivity: 'IMPORTACIONES',
      address: 'AVENIDA PRINCIPAL 123',
      city: 'ITALIA',
      foreign: { nationality: '504' },
    })
    expect(invoice.header.transport).toEqual({
      customs: {
        saleModality: 3,
        saleClause: 6,
        saleClauseTotal: 3523.59,
        transportRoute: 6,
        loadingPort: 910,
        unloadingPort: 544,
        // The net weight is the 687 of the line; 2 % of it is 13.74, a tare of 14.
        tare: 14,
        tareUnit: 6,
        grossWeight: 701,
        grossWeightUnit: 17,
        netWeight: 687,
        netWeightUnit: 17,
        totalItems: 1,
        totalPackages: 69,
        packages: [{ code: 89, count: 69, marks: 'S/M' }],
        freight: 2069.28,
        insurance: 1215.22,
        receiverCountry: 504,
        destinationCountry: 504,
      },
    })
    expect(invoice.references).toEqual([
      { lineNumber: 1, documentType: 'SET', folio: '1', date: DATE, reason: `CASO ${id1(1)}` },
      { lineNumber: 2, documentType: 810, folio: '1', date: DATE, reason: 'MIC/DTA' },
    ])
    expect(invoice.items).toEqual([
      { lineNumber: 1, name: 'CHATARRA DE ALUMINIO', quantity: 687, unit: 'PAR', unitPrice: 159, amount: 109233 },
    ])
  })

  test('the notes repeat the price of the invoice, name its customer and carry no customs area or surcharge', () => {
    const credit = doc(one, 2)
    const debit = doc(one, 3)
    expect(credit.items).toEqual([
      { lineNumber: 1, name: 'CHATARRA DE ALUMINIO', quantity: 229, unit: 'PAR', unitPrice: 159, amount: 36411 },
    ])
    expect(debit.items).toEqual(credit.items)
    expect(credit.header.receiver).toEqual(doc(one, 1).header.receiver)
    expect(debit.header.receiver).toEqual(doc(one, 1).header.receiver)
    expect(credit.references.slice(1)).toEqual([
      { lineNumber: 2, documentType: 110, folio: '1', date: DATE, code: 3, reason: 'DEVOLUCION DE MERCADERIA' },
    ])
    expect(debit.references.slice(1)).toEqual([
      { lineNumber: 2, documentType: 112, folio: '1', date: DATE, code: 1, reason: 'ANULA NOTA DE CREDITO' },
    ])
    for (const note of [credit, debit]) {
      expect(note.header.transport).toBeUndefined()
      expect(note.globalAdjustments).toEqual([])
      expect(note.header.options).toEqual({})
    }
  })

  test('services: the surcharge stays on the line, and the service indicator excuses the sale modality', () => {
    const services = doc(two, 1)
    expect(services.header.options).toEqual({ serviceIndicator: 3, exportPaymentTerms: '1' })
    expect(services.items[0]).toMatchObject({ unitPrice: 94, surchargePercent: 10, amount: 103.4 })
    expect(services.globalAdjustments).toEqual([])
    expect(services.header.transport?.customs).toEqual({
      saleClause: 2,
      transportRoute: 8,
      loadingPort: 907,
      unloadingPort: 285,
      totalItems: 1,
      receiverCountry: 201,
      destinationCountry: 201,
    })
    expect(services.references.map((reference) => [reference.documentType, reference.reason])).toEqual([
      ['SET', `CASO ${id2(1)}`],
      [812, 'RESOLUCION SNA'],
    ])
    expect(services.xml).toContain('<PrcItem>94</PrcItem><RecargoPct>10</RecargoPct><MontoItem>103.4</MontoItem>')
  })

  test('goods by volume: the commission abroad, the freight and the insurance as surcharges, and two customs documents', () => {
    const goods = doc(two, 2)
    expect(
      goods.globalAdjustments.map(({ description, value, otherCurrencyValue }) => [
        description,
        value,
        otherCurrencyValue,
      ]),
    ).toEqual([
      // 11 % of 5613.15 is 617.4465, 617.45 in the cents of `ValorDR`.
      ['COMISIONES EN EL EXTRANJERO', 617.45, 4322],
      ['FLETE', 5251.25, 36759],
      ['SEGURO', 4912.68, 34389],
    ])
    expect(goods.header.transport?.customs).toMatchObject({
      saleModality: 9,
      tare: 26,
      grossWeight: 1305,
      netWeight: 1279,
      tareUnit: 16,
      grossWeightUnit: 16,
      netWeightUnit: 16,
      totalItems: 2,
      packages: [{ code: 18, count: 104, marks: 'S/M' }],
    })
    expect(goods.header.options).toEqual({ exportPaymentTerms: '1' })
    expect(goods.references.map((reference) => [reference.documentType, reference.reason])).toEqual([
      ['SET', `CASO ${id2(2)}`],
      [807, 'DUS'],
      [809, 'AWB'],
    ])
    expect(goods.items[0]).toMatchObject({ discountPercent: 5, discountAmount: 10049, amount: 190935 })
  })

  test('lodging: the country and nothing else of the customs area', () => {
    const lodging = doc(two, 3)
    expect(lodging.header.options).toEqual({ serviceIndicator: 4 })
    expect(lodging.header.transport).toEqual({ customs: { receiverCountry: 201, destinationCountry: 201 } })
    expect(lodging.header.receiver).toMatchObject({ city: 'VENEZUELA', foreign: { nationality: '201' } })
  })

  test('each envelope carries its set, every signature and stamp verifies, and both validate against EnvioDTE_v10.xsd', async () => {
    for (const set of [one, two]) {
      expect(set.envelope.setId).toBe('DTE_SetDoc')
      expect(set.envelope.documents).toHaveLength(3)
      expect(verifyEnvelopeSignature(set.envelope.xml).valid).toBe(true)
      for (const issued of set.cases) {
        expect(verifyDocumentSignature(issued.document.xml).valid).toBe(true)
        expect(verifyTed(issued.document.ted.xml, cafFor(issued.type))).toBe(true)
      }
      expect(await validateAgainstXsd(set.envelope.xml, 'EnvioDTE')).toEqual([])
    }
  })
})

describe('what the run gives an export set', () => {
  test('the foreign customer of the options, and a tare of another percent', async () => {
    const set = await issueTestSet(
      first,
      options({
        exchangeRates: RATES,
        receiver: { businessName: 'Andes Trading LLC', city: 'Genova', address: undefined },
        tarePercent: 10,
      }),
    )
    expect(set.cases[0].document.header.receiver).toEqual({
      ...DEFAULT_CERTIFICATION_FOREIGN_RECEIVER,
      businessName: 'Andes Trading LLC',
      city: 'Genova',
      foreign: { nationality: '504' },
    })
    expect(set.cases[0].document.header.transport?.customs).toMatchObject({ tare: 69, grossWeight: 756 })
  })

  test.each([0, -1, 101, Number.NaN])('a tare percent of %p is refused', async (tarePercent) => {
    expect(await failure(issueTestSet(first, options({ exchangeRates: RATES, tarePercent })))).toMatchObject({
      code: 'INVALID_OPTION',
      details: { field: 'exportSets.tarePercent' },
    })
  })

  test('a currency without its rate stops the set before any folio is taken', async () => {
    for (const given of [issueOptions(exportCafs()), options({}), options({ exchangeRates: { 'FRANCO SZ': 1075 } })]) {
      const folios = counting()
      const error = await failure(issueTestSet(second, { ...given, folios }))
      expect(error).toMatchObject({
        code: 'MISSING_FIELD',
        details: { field: 'exportSets.exchangeRates', currency: 'YEN', caseId: id2(1) },
      })
      expect(folios.taken()).toBe(0)
    }
  })

  test('a rate createDocument refuses, or any document it refuses, stops the set before any folio is taken too', async () => {
    const folios = counting()
    const error = await failure(issueTestSet(first, { ...options({ exchangeRates: { 'FRANCO SZ': 0 } }), folios }))
    expect(error).toMatchObject({ code: 'INVALID_AMOUNT', details: { field: 'exchangeRate' } })
    const packed = planOf([...INVOICE, 'TIPO DE BULTO: PALLETS'])
    expect(await failure(issueTestSet(packed, { ...options(), folios }))).toMatchObject({
      code: 'MISSING_FIELD',
      details: { field: 'transport.customs.totalPackages' },
    })
    expect(folios.taken()).toBe(0)
  })

  test.each([
    ['PUERTO DE EMBARQUE: ATLANTIDA', 'transport.customs.loadingPort'],
    ['PUERTO DE DESEMBARQUE: ATLANTIDA', 'transport.customs.unloadingPort'],
    ['UNIDAD TARA: LEGUAS', 'transport.customs.tareUnit'],
    ['UNIDAD PESO BRUTO: LEGUAS', 'transport.customs.grossWeightUnit'],
    ['UNIDAD PESO NETO: LEGUAS', 'transport.customs.netWeightUnit'],
    ['TIPO DE BULTO: GLOBOS', 'transport.customs.packages[0].code'],
    ['FORMA DE PAGO EXPORTACION: TRUEQUE', 'options.exportPaymentTerms'],
    ['PAIS DESTINO: ATLANTIDA', 'transport.customs.destinationCountry'],
  ])('a name the customs tables do not know (%s) is INVALID_OPTION with its field', async (line, field) => {
    const value = line.split(':')[1].trim()
    expect(await failure(issueTestSet(planOf([...INVOICE, line]), options()))).toEqual(
      expect.objectContaining({ code: 'INVALID_OPTION', details: { field, value, caseId: '7-1' } }),
    )
  })

  test('a currency the SII does not list is refused with the case that names it, before any folio', async () => {
    const odd = planOf(INVOICE.map((line) => line.replace('DOLAR USA', 'DOBLON')))
    const folios = counting()
    const error = await failure(issueTestSet(odd, { ...options({ exchangeRates: { DOBLON: 5 } }), folios }))
    expect(error).toMatchObject({
      code: 'INVALID_OPTION',
      details: { field: 'currency', value: 'DOBLON', caseId: '7-1' },
    })
    expect(folios.taken()).toBe(0)
  })

  test('a receiver country the tables do not know, a container and a set without a currency', async () => {
    const atlantis = planOf(INVOICE.map((line) => line.replace('ESTADOS UNIDOS', 'ATLANTIDA')))
    expect((await failure(issueTestSet(atlantis, options()))).details).toEqual({
      field: 'transport.customs.receiverCountry',
      value: 'ATLANTIDA',
      caseId: '7-1',
    })
    // An invoice that names no country, in a set that named none before, has no city for its customer either, and
    // `createDocument` refuses it on that first.
    const nowhere = planOf(INVOICE.filter((line) => !line.startsWith('PAIS')))
    expect((await failure(issueTestSet(nowhere, options()))).details).toEqual({ field: 'receiver.city' })
    const container = await issueTestSet(planOf([...INVOICE, 'TIPO DE BULTO: CONT40', 'TOTAL BULTOS: 1']), options())
    expect(container.cases[0].document.header.transport?.customs?.packages).toEqual([{ code: 74, count: 1 }])
    const noCurrency = planOf(INVOICE.filter((line) => !line.startsWith('MONEDA')))
    expect((await failure(issueTestSet(noCurrency, options()))).details).toEqual({ field: 'currency', caseId: '7-1' })
  })

  test('a commission abroad without the total of the sale clause is MISSING_FIELD', async () => {
    const planned = planOf([
      ...INVOICE.filter((line) => !line.startsWith('TOTAL CLAUSULA')),
      'COMISIONES EN EL EXTRANJERO: 5%',
    ])
    expect((await failure(issueTestSet(planned, options()))).details).toEqual({
      field: 'transport.customs.saleClauseTotal',
      caseId: '7-1',
    })
  })

  test('a note keeps a price of its own, a currency of its own, and names a line the invoice does not have as it is', async () => {
    const planned = planOf([
      ...INVOICE,
      'CASO 7-2',
      'DOCUMENTO  NOTA DE CREDITO DE EXPORTACION ELECTRONICA',
      'REFERENCIA  CASO 7-1',
      'RAZON REFERENCIA  DEVOLUCION DE MERCADERIAS',
      'ITEM  CANTIDAD  UNIDAD  PRECIO',
      'Uva de mesa  2  KN  9',
      'Embalaje  1  U  3',
      'CASO 7-3',
      'DOCUMENTO  NOTA DE DEBITO DE EXPORTACION ELECTRONICA',
      'MONEDA DE LA OPERACION: EURO',
      'REFERENCIA  CASO 7-2',
      'RAZON REFERENCIA  ANULA NOTA DE CREDITO',
    ])
    const set = await issueTestSet(planned, options({ exchangeRates: { 'DOLAR USA': 950, EURO: 1020 } }))
    expect(set.cases[1].document.items.map(({ name, unitPrice, amount }) => [name, unitPrice, amount])).toEqual([
      ['Uva de mesa', 9, 18],
      ['Embalaje', 3, 3],
    ])
    expect(set.cases[2].document.header).toMatchObject({ currency: 'EURO', otherCurrency: { exchangeRate: 1020 } })
  })

  test('a note that names a line the invoice does not have and no price, an empty plan and a note without its case', async () => {
    const unknown = planOf([
      ...INVOICE,
      'CASO 7-2',
      'DOCUMENTO  NOTA DE CREDITO DE EXPORTACION ELECTRONICA',
      'REFERENCIA  CASO 7-1',
      'RAZON REFERENCIA  DEVOLUCION DE MERCADERIAS',
      'ITEM  CANTIDAD',
      'Embalaje  1',
    ])
    const drafts = await prepareExportSet(unknown, options(), DATE)
    expect(drafts[1].lines).toEqual([{ name: 'Embalaje', quantity: 1 }])
    const empty: ExportSetPlan = { ...first, documents: [] }
    expect((await failure(issueTestSet(empty, options()))).details).toEqual({ field: 'documents', kind: 'export' })
    const orphan: ExportSetPlan = { ...first, documents: first.documents.slice(1) }
    expect((await failure(issueTestSet(orphan, options()))).details).toEqual({
      field: 'referencedCase',
      caseId: id1(2),
    })
    const unreferenced: ExportSetPlan = {
      ...first,
      documents: [first.documents[0], { ...first.documents[1], reference: undefined }],
    }
    expect((await failure(issueTestSet(unreferenced, options()))).details).toEqual({
      field: 'referencedCase',
      caseId: id1(2),
    })
  })
})

// The simulation issues again the cases of the sets the run sent. A run that sent the export sets issues their
// documents again too: each as its set issued it, less the reference of the test set.
describe('the export sets in the simulation', () => {
  test('each document comes again, a note still names its invoice, and no document carries the SET reference', async () => {
    const one = await issueTestSet(first, options())
    const two = await issueTestSet(second, options())
    const simulation = await issueSimulation({ export1: first, export2: second }, options())
    expect(simulation.cases.map((issued) => [issued.caseId, issued.type])).toEqual(
      [...one.cases, ...two.cases].map((issued) => [issued.caseId, issued.type]),
    )
    expect(simulation.types).toEqual([110, 112, 111])
    const originals = [...one.cases, ...two.cases].map((issued) => issued.document)
    simulation.cases.forEach((issued, index) => {
      const references = issued.document.references
      expect(references.some((reference) => reference.documentType === 'SET')).toBe(false)
      expect(references).toHaveLength(originals[index].references.length - 1)
      expect(issued.document.header.totals).toEqual(originals[index].header.totals)
      expect(issued.document.items).toEqual(originals[index].items)
    })
    // The credit note refers to the invoice the simulation issued, and the debit note to that credit note.
    expect(simulation.cases[1].document.references[0]).toMatchObject({
      documentType: 110,
      folio: String(simulation.cases[0].folio),
      code: 3,
    })
    expect(simulation.cases[2].document.references[0]).toMatchObject({ documentType: 112, code: 1 })
    expect(verifyEnvelopeSignature(simulation.envelope.xml).valid).toBe(true)
    expect(await validateAgainstXsd(simulation.envelope.xml, 'EnvioDTE')).toEqual([])
  })

  test('its folios are counted with those of the other sets, and a simulation without them is as before', async () => {
    expect(simulationFolioNeeds({ export1: first, export2: second })).toEqual({ 110: 4, 111: 1, 112: 1 })
    expect(simulationFolioNeeds({ export2: second })).toEqual({ 110: 3 })
    expect(simulationFolioNeeds(fullPlan())).not.toHaveProperty('110')
    const error = await failure(issueSimulation({ export1: first }, options({})))
    expect(error.details).toMatchObject({ field: 'exportSets.exchangeRates' })
  })
})
