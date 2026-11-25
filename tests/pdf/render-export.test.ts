import { issueDocument } from '../../src/document/issue'
import type { DocumentInput } from '../../src/model/document'
import { parsePrintableDocuments, type PrintableCustoms, type PrintableDocument } from '../../src/pdf/parse'
import { renderPrintedSample } from '../../src/pdf/render'
import { FIXED_NOW } from '../support/fixtures'
import { pdfPage, pdfText } from '../support/pdf'
import { failure } from '../support/portal'
import { guide, guideWithTransport } from '../support/printed-fixtures'
import { certificate, exportInput, signedCaf } from '../support/received-fixtures'

// Issuing and rendering several documents per test is slow on instrumented CI runners, as in the other print suites.
jest.setTimeout(30_000)

const CUSTOMS = {
  saleModality: 1,
  saleClause: 5,
  saleClauseTotal: 1266,
  transportRoute: 1,
  transportName: 'MSC ANDES',
  carrierRut: '76543210-3',
  carrierName: 'Naviera Austral',
  carrierAdditionalId: 'NA-1',
  booking: 'BK-778',
  operator: 'OP-2',
  loadingPort: 905,
  loadingPortAdditionalId: 'TPS',
  unloadingPort: 622,
  unloadingPortAdditionalId: 'ECT',
  tare: 120,
  tareUnit: 6,
  grossWeight: 1250.5,
  grossWeightUnit: 6,
  netWeight: 1100,
  netWeightUnit: 6,
  totalItems: 2,
  totalPackages: 14,
  packages: [
    { code: 80, count: 12, marks: 'ANDES', containerId: 'MSCU1234567', seal: 'S-99', sealIssuer: 'SAG' },
    { code: 22, count: 2 },
  ],
  freight: 150,
  insurance: 20.5,
  receiverCountry: 515,
  destinationCountry: 225,
} as const

const exported = (overrides: Partial<DocumentInput> = {}, type = 110): PrintableDocument => {
  const document = exportInput(5, {
    type: type as DocumentInput['type'],
    items: [
      { name: 'Uva de mesa', quantity: 100, unit: 'KN', unitPrice: 12.345 },
      { name: 'Cajas', quantity: 3, unit: 'U', unitPrice: 10.5, surchargePercent: 10 },
    ],
    exchangeRate: 950.25,
    options: { exportPaymentTerms: '32', dueDate: '2026-12-15' },
    transport: { customs: CUSTOMS },
    ...overrides,
  })
  const issued = issueDocument({ document, caf: signedCaf({ type }), certificate, now: FIXED_NOW })
  return parsePrintableDocuments(issued.xml)[0]
}
const render = (doc: PrintableDocument, options = {}) => renderPrintedSample(doc, { now: () => FIXED_NOW, ...options })
const textOf = async (doc: PrintableDocument): Promise<string> => pdfText(await render(doc))
// A label and what follows it, as the sheet draws a field: the label, then its value.
const field = (label: string, value: string): string => `${label}: \n${value}`

describe('an export invoice read for printing', () => {
  const doc = exported()

  test('carries its currency, its payment terms and its customs area as written', () => {
    expect(doc.type).toBe(110)
    expect(doc.currency).toBe('DOLAR USA')
    expect(doc.exportPaymentTerms).toBe(32)
    const customs = doc.transport?.customs as PrintableCustoms
    expect(customs).toEqual({
      ...CUSTOMS,
      packages: [
        { code: 80, count: 12, marks: 'ANDES', containerId: 'MSCU1234567', seal: 'S-99', sealIssuer: 'SAG' },
        { code: 22, count: 2, marks: '', containerId: '', seal: '', sealIssuer: '' },
      ],
    })
  })

  test('a document without them has none', () => {
    const plain = parsePrintableDocuments(guide(1).xml)[0]
    expect(plain.currency).toBeUndefined()
    expect(plain.exportPaymentTerms).toBeUndefined()
    expect(plain.transport?.customs).toBeUndefined()
    const bare = exported({
      transport: {
        customs: { saleModality: 1, saleClause: 2, saleClauseTotal: 10, transportRoute: 4, receiverCountry: 225 },
      },
    })
    expect(bare.transport?.customs).toMatchObject({
      transportName: '',
      packages: [],
      loadingPort: undefined,
      tare: undefined,
    })
  })
})

describe('an export invoice printed', () => {
  let text: string
  beforeAll(async () => {
    text = await textOf(exported())
  })

  test('names its type, and its amounts go in its currency, with their decimals and no peso sign', () => {
    expect(text).toContain('FACTURA DE EXPORTACIÓN\nELECTRÓNICA\nN° 5')
    expect(text).toContain('100\nKN\n12,345\n1.234,5')
    expect(text).toContain('3\nU\n10,5\n34,65')
    expect(text).toContain('Moneda\nDOLAR USA\nMonto Exento\n1.269,15\nMonto Total\n1.269,15')
    expect(text).not.toContain('$')
    // Its total in pesos is the other currency's.
    expect(text).toContain('Otra Moneda: PESO CL\nMonto Exento\n1.206.010\nMonto Total\n1.206.010')
  })

  test('has no total in words, which are of pesos, and no copy to transfer', async () => {
    expect(text).not.toContain('Son:')
    expect(text).not.toContain('CEDIBLE')
    expect((await pdfPage(await render(exported()))).pages).toBe(1)
  })

  test('prints its payment terms in words, beside the due date', () => {
    expect(text).toContain(field('Forma de Pago Exportación', 'Pago anticipado a la fecha de embarque'))
    expect(text).toContain(field('Fecha Vencimiento', '15 de diciembre de 2026'))
    expect(text).not.toContain('Forma de Pago: ')
  })

  test('prints its customs area, each code in the words of its customs table', () => {
    const printed = [
      field('Modalidad de Venta', 'A FIRME'),
      field('Cláusula de Venta', 'FOB'),
      field('Total Cláusula de Venta', '1.266'),
      field('Vía de Transporte', 'MARÍTIMA, FLUVIAL Y LACUSTRE'),
      field('Nombre Transporte', 'MSC ANDES'),
      field('RUT Cía. Transporte', '76543210-3'),
      field('Cía. Transporte', 'Naviera Austral'),
      field('Id. Adicional Transporte', 'NA-1'),
      field('Booking', 'BK-778'),
      field('Operador', 'OP-2'),
      field('Puerto de Embarque', 'VALPARAÍSO'),
      field('Id. Adicional Embarque', 'TPS'),
      field('Puerto de Desembarque', 'ROTTERDAM'),
      field('Id. Adicional Desembarque', 'ECT'),
      field('Tara', '120 KN'),
      field('Peso Bruto', '1.250,5 KN'),
      field('Peso Neto', '1.100 KN'),
      field('Total Ítems', '2'),
      field('Total Bultos', '14'),
      field('Bultos', '12 PALLETS'),
      field('Marcas', 'ANDES'),
      field('Contenedor', 'MSCU1234567'),
      field('Sello', 'S-99'),
      field('Emisor Sello', 'SAG'),
      field('Bultos', '2 CAJAS DE CARTÓN'),
      field('Flete', '150'),
      field('Seguro', '20,5'),
      field('País Receptor', 'PAÍSES BAJOS'),
      field('País Destino', 'ESTADOS UNIDOS DE AMÉRICA'),
    ]
    for (const one of printed) expect(text).toContain(one)
    // In the order of the format: the sale, the transport, the ports, the weights, the packages, the countries.
    const at = printed.map((one) => text.indexOf(one))
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  test('a receiver abroad that names no commune and no line of business prints neither label', async () => {
    expect(text).toContain(field('Señor(es)', 'Andes Trading LLC'))
    expect(text).toContain(field('Ciudad', 'Miami'))
    expect(text).not.toContain('Comuna: ')
    expect(text).not.toContain('Giro: ')
    const local = await textOf(
      exported({
        receiver: {
          rut: '55555555-5',
          businessName: 'Andes Trading LLC',
          businessActivity: 'Importadora',
          address: '1200 Harbor Blvd',
          commune: 'Miami Dade',
          city: 'Miami',
        },
      }),
    )
    expect(local).toContain(field('Comuna', 'Miami Dade'))
    expect(local).toContain(field('Giro', 'Importadora'))
  })
})

describe('what an export document may lack or carry besides', () => {
  test('a code its customs table does not list prints as written, and what is absent prints nothing', async () => {
    const doc = exported()
    const customs: PrintableCustoms = {
      ...(doc.transport?.customs as PrintableCustoms),
      saleModality: 7,
      saleClause: 99,
      transportRoute: 3,
      loadingPort: 1,
      unloadingPort: undefined,
      tareUnit: 99,
      grossWeight: undefined,
      netWeightUnit: undefined,
      totalItems: undefined,
      packages: [
        { code: 2, count: undefined, marks: '', containerId: '', seal: '', sealIssuer: '' },
        { code: undefined, count: 4, marks: '', containerId: '', seal: '', sealIssuer: '' },
      ],
      freight: undefined,
      receiverCountry: 1,
      destinationCountry: undefined,
    }
    const text = await textOf({
      ...doc,
      exportPaymentTerms: 99,
      transport: { ...doc.transport!, customs },
    })
    expect(text).toContain(field('Forma de Pago Exportación', '99'))
    expect(text).toContain(field('Modalidad de Venta', '7'))
    expect(text).toContain(field('Cláusula de Venta', '99'))
    expect(text).toContain(field('Vía de Transporte', '3'))
    expect(text).toContain(field('Puerto de Embarque', '1'))
    expect(text).not.toContain('Puerto de Desembarque')
    expect(text).toContain(field('Tara', '120 99'))
    expect(text).not.toContain('Peso Bruto')
    expect(text).toContain(field('Peso Neto', '1.100'))
    expect(text).not.toContain('Total Ítems')
    expect(text).toContain(field('Bultos', 'GRANEL SÓLIDO, PARTICULAS GRANULARES (GRANOS)'))
    expect(text).toContain(field('Bultos', '4'))
    expect(text).not.toContain('Flete')
    expect(text).toContain(field('País Receptor', '1'))
    expect(text).not.toContain('País Destino')
  })

  test('the amounts of a line and of the payment go in the currency too', async () => {
    const doc = exported()
    const text = await textOf({
      ...doc,
      settledAmount: 500.25,
      outstandingBalance: 768.9,
      payments: [{ date: '2026-12-01', amount: 100.5, note: 'Anticipo' }],
      items: [{ ...doc.items[0], surchargeAmount: 3.5, discountAmount: 1.25 }, doc.items[1]],
    })
    expect(text).toContain('Dcto: 1,25')
    expect(text).toContain('Recargo: 3,5')
    expect(text).toContain(field('Monto Cancelado', '500,25'))
    expect(text).toContain(field('Saldo Insoluto', '768,9'))
    expect(text).toContain('1 de diciembre de 2026 - 100,5 - Anticipo')
    expect(text).not.toContain('$')
  })

  test.each([
    [111, 'NOTA DE DÉBITO DE EXPORTACIÓN'],
    [112, 'NOTA DE CRÉDITO DE EXPORTACIÓN'],
  ])('a note of export (%p) prints the same way', async (type, name) => {
    const note = exported(
      { references: [{ documentType: 110, folio: 5, date: '2026-11-15', code: 3, reason: 'Corrige montos' }] },
      type,
    )
    const text = await textOf(note)
    expect(text.replace(/\n/g, ' ')).toContain(name)
    expect(text).toContain('Moneda\nDOLAR USA')
    expect(text).not.toContain('$')
  })

  test('an export document without a customs area prints none, and the sheet alone draws one', async () => {
    const doc = exported()
    const text = await textOf({ ...doc, transport: undefined })
    expect(text).not.toContain('Modalidad de Venta')
    expect(text).toContain('Moneda\nDOLAR USA')
    const error = await failure(render(doc, { paper: 'roll' }))
    expect(error.code).toBe('INVALID_OPTION')
    expect(error.details).toEqual({ field: 'paper', type: 110 })
  })

  test('a dispatch guide prints the customs area it carries, under its transport, and its amounts stay pesos', async () => {
    const plain = parsePrintableDocuments(guideWithTransport.xml)[0]
    const customs = exported().transport?.customs as PrintableCustoms
    const text = await textOf({ ...plain, transport: { ...plain.transport!, customs } })
    expect(text).toContain(field('Puerto de Embarque', 'VALPARAÍSO'))
    expect(text).toContain(field('País Destino', 'ESTADOS UNIDOS DE AMÉRICA'))
    expect(text).toContain('$')
    expect(text).not.toContain('Moneda\n')
    // Without it the guide prints as it did.
    expect(await textOf(plain)).not.toContain('Puerto de Embarque')
  })
})
