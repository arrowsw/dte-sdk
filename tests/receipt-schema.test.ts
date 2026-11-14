import type { SignedDocument } from '../src/document/sign'
import type { DocumentInput } from '../src/model/document'
import { ISSUER_RUT, RECEIVER_RUT } from './support/fixtures'
import { envelopeXml, issue, issuer } from './support/printed-fixtures'
import { validateAgainstXsd } from './support/xsd'

// The two receipts dte-sdk sends in an `EnvioBOLETA`, with the variants it builds, run through the SII's own
// `EnvioBOLETA_v11.xsd`. That schema declares one root, the envelope, so a receipt is validated inside one: each signed
// receipt alone in a signed envelope, then the receipts of a type together in one, then both types in one.
// What `createDocument` refuses on a receipt because the schema would reject it is written by hand further down, to
// show each rejection. What the schema still rejects today is in `receipt-schema-gaps.test.ts`.

jest.setTimeout(60_000)

const base = { issueDate: '2026-11-15', issuer }
type Variant = Omit<DocumentInput, 'type' | 'folio' | 'issueDate' | 'issuer'> & Partial<Pick<DocumentInput, 'issuer'>>

const namedReceiver = {
  rut: RECEIVER_RUT,
  businessName: 'Comercializadora Rapel Ltda',
  internalCode: 'CLI-0042',
  contact: 'Ana Rojas',
  address: 'Pasaje Los Olmos 88',
  commune: 'Providencia',
  city: 'Santiago',
}
const setReference = { code: 'SET', reason: 'CASO-1' }
const coffee = { name: 'Café', quantity: 2, unitPrice: 1500 }

const VARIANTS: Record<39 | 41, Record<string, Variant>> = {
  39: {
    'prices that include VAT, for a final consumer': { items: [coffee], pricesIncludeVat: true },
    'net amounts, with their indicator': {
      items: [{ name: 'Plan mensual', unitPrice: 10000 }],
      options: { netAmountsIndicator: 2 },
    },
    'the whole IdDoc its schema declares, in its order: net amounts, a period, a due date and a payment medium': {
      items: [{ name: 'Internet hogar', unitPrice: 21840 }],
      receiver: namedReceiver,
      options: {
        serviceIndicator: 2,
        netAmountsIndicator: 2,
        billingPeriod: { from: '2026-11-01', to: '2026-11-30' },
        dueDate: '2026-12-10',
        paymentMedium: '2',
      },
    },
    "the RUT of the software's provider": { items: [coffee], pricesIncludeVat: true, softwareProviderRut: ISSUER_RUT },
    'a receiver with its internal code, its contact and its address': {
      items: [coffee],
      pricesIncludeVat: true,
      receiver: namedReceiver,
    },
    'an issuer with its SII branch code and its city': {
      issuer: { ...issuer, siiBranchCode: 81234567, city: 'Santiago' },
      items: [coffee],
      pricesIncludeVat: true,
    },
    'an issuer and a receiver with what a receipt is not written with, which is left out': {
      issuer: {
        ...issuer,
        branch: 'Casa Matriz',
        phone: '+56 2 2345 6789',
        email: 'ventas@example.cl',
        activityCode: 620200,
        salespersonCode: 'V-1',
      },
      receiver: { ...namedReceiver, businessActivity: 'Comercio al por menor' },
      items: [coffee],
      pricesIncludeVat: true,
    },
    'line codes, a discount, a surcharge, a description and a price with decimals': {
      items: [
        {
          name: 'Licencia',
          description: 'Licencia mensual de uso',
          quantity: 2,
          unit: 'UN',
          unitPrice: 11900,
          discountPercent: 10,
          codes: [
            { type: 'INT1', value: 'L-1' },
            { type: 'EAN13', value: '7800000000001' },
          ],
        },
        { name: 'Soporte', quantity: 1.5, unit: 'HR', unitPrice: 15000.5, surchargePercent: 5, unitPriceDecimals: 6 },
      ],
      pricesIncludeVat: true,
    },
    'a quantity, a price, a discount and a surcharge with more decimals than the schema holds': {
      items: [
        { name: 'Queso a granel', quantity: 1 / 3, unit: 'KG', unitPrice: 100000 / 3, discountPercent: 100 / 3 },
        { name: 'Jamón a granel', quantity: 0.1 + 0.2, unit: 'KG', unitPrice: 11900, surchargePercent: 100 / 3 },
      ],
      pricesIncludeVat: true,
      globalAdjustments: [{ kind: 'discount', valueType: 'percent', value: 100 / 3, description: 'Cliente frecuente' }],
    },
    'an exempt line and the two non-billable lines its schema admits': {
      items: [
        coffee,
        { name: 'Propina', unitPrice: 300, exempt: true },
        { name: 'Envase retornable', unitPrice: 500, exemptIndicator: 2 },
        { name: 'Recaudación por cuenta de terceros', unitPrice: 700, exemptIndicator: 6 },
      ],
      pricesIncludeVat: true,
    },
    'a global discount and a global surcharge': {
      items: [coffee, { name: 'Propina', unitPrice: 300, exempt: true }],
      pricesIncludeVat: true,
      globalAdjustments: [
        { kind: 'discount', valueType: 'percent', value: 5, description: 'Cliente frecuente' },
        { kind: 'surcharge', valueType: 'amount', value: 100, exemptIndicator: 1 },
      ],
    },
    'an informative subtotal': {
      items: [coffee, { name: 'Té', unitPrice: 1200 }],
      pricesIncludeVat: true,
      subtotals: [{ number: 1, description: 'Bebidas calientes', order: 1, totalAmount: 4200, lines: [1, 2] }],
    },
    'a periodic home service, with its period, its due date and the address it is given at': {
      items: [{ name: 'Internet hogar', unitPrice: 25990 }],
      pricesIncludeVat: true,
      receiver: namedReceiver,
      options: { serviceIndicator: 2, billingPeriod: { from: '2026-11-01', to: '2026-11-30' }, dueDate: '2026-12-10' },
    },
    'references, one of the test set and one with a type and a folio': {
      items: [coffee],
      pricesIncludeVat: true,
      receiptReferences: [setReference, { documentType: 39, folio: 7, code: 'CAJA-2', reason: 'Reemplaza' }],
    },
    'totals given by the caller, with the non-billable amount, the previous balance and the amount due': {
      items: [
        { name: 'Internet hogar', unitPrice: 11900 },
        { name: 'Arriendo de equipo', unitPrice: 2000, exemptIndicator: 2 },
      ],
      totals: {
        netAmount: 10000,
        vatAmount: 1900,
        totalAmount: 11900,
        nonBillableAmount: 2000,
        previousBalance: -500,
        amountDue: 13400,
      },
    },
    "totals given by the caller, with the period's total": {
      items: [
        { name: 'Internet hogar', unitPrice: 11900 },
        { name: 'Arriendo de equipo', unitPrice: 2000, exemptIndicator: 2 },
      ],
      totals: { netAmount: 10000, vatAmount: 1900, totalAmount: 11900, nonBillableAmount: 2000, periodAmount: 13900 },
    },
  },
  41: {
    'exempt lines, for a final consumer': { items: [{ name: 'Consulta médica', unitPrice: 30000 }] },
    'a receiver with its internal code, its contact and its address': {
      items: [{ name: 'Consulta médica', unitPrice: 30000 }],
      receiver: namedReceiver,
    },
    'a global discount, an informative subtotal and a reference': {
      items: [
        { name: 'Consulta médica', unitPrice: 30000 },
        { name: 'Curación', quantity: 2, unitPrice: 5000 },
      ],
      globalAdjustments: [{ kind: 'discount', valueType: 'percent', value: 10, exemptIndicator: 1 }],
      subtotals: [{ number: 1, description: 'Atenciones', totalAmount: 40000, lines: [1, 2] }],
      receiptReferences: [setReference],
    },
    'a periodic service, with its period and its due date': {
      items: [{ name: 'Colegiatura', unitPrice: 150000 }],
      receiver: namedReceiver,
      options: { serviceIndicator: 1, billingPeriod: { from: '2026-11-01', to: '2026-11-30' }, dueDate: '2026-12-05' },
    },
    "the RUT of the software's provider, a payment medium and the period's total": {
      items: [{ name: 'Colegiatura', unitPrice: 150000 }],
      softwareProviderRut: ISSUER_RUT,
      options: { paymentMedium: '3' },
      totals: { exemptAmount: 150000, totalAmount: 150000, periodAmount: 150000 },
    },
  },
}

type ReceiptType = keyof typeof VARIANTS
const TYPES = Object.keys(VARIANTS).map(Number) as ReceiptType[]
const variantsOf = (type: ReceiptType): [string, Variant][] => Object.entries(VARIANTS[type])
// Issuing signs twice with node-forge, so each variant is issued once, by the first test that needs it.
const signed = new Map<string, SignedDocument>()
const issued = (type: ReceiptType, index: number): SignedDocument => {
  const key = `${type}-${index}`
  const document = signed.get(key) ?? issue({ ...base, ...variantsOf(type)[index][1], type, folio: index + 1 })
  signed.set(key, document)
  return document
}
const everyVariant = (type: ReceiptType): SignedDocument[] => variantsOf(type).map((_, index) => issued(type, index))

describe.each(TYPES)('type %s', (type) => {
  test.each(variantsOf(type).map(([name], index) => [name, index] as const))(
    '%s: the signed receipt validates against EnvioBOLETA_v11.xsd, alone in a signed envelope',
    async (_name, index) => {
      expect(await validateAgainstXsd(envelopeXml([issued(type, index)], 'receipt'), 'EnvioBOLETA')).toEqual([])
    },
  )

  test('every variant together in one signed envelope validates against EnvioBOLETA_v11.xsd', async () => {
    expect(await validateAgainstXsd(envelopeXml(everyVariant(type), 'receipt'), 'EnvioBOLETA')).toEqual([])
  })
})

test('the receipts of both types together in one signed envelope validate against EnvioBOLETA_v11.xsd', async () => {
  const envelope = envelopeXml(TYPES.flatMap(everyVariant), 'receipt')
  expect(envelope.match(/<SubTotDTE>/g)).toHaveLength(2)
  expect(await validateAgainstXsd(envelope, 'EnvioBOLETA')).toEqual([])
})

const ns = (element: string): string => `{http://www.sii.cl/SiiDte}${element}`

// One signed receipt in one signed envelope, which validates. Each test writes something by hand into the receipt
// and validates the envelope again: the schema does not look at the signatures.
let written: { readonly xml: string; readonly envelope: string } | undefined
const whole = (): { readonly xml: string; readonly envelope: string } => {
  if (written === undefined) {
    const document = issue({
      ...base,
      type: 39,
      folio: 99,
      softwareProviderRut: ISSUER_RUT,
      items: [{ name: 'Internet hogar', unitPrice: 21840, exemptIndicator: 2 }, coffee],
      options: {
        netAmountsIndicator: 2,
        billingPeriod: { from: '2026-11-01', to: '2026-11-30' },
        dueDate: '2026-12-10',
        paymentMedium: '2',
      },
    })
    written = { xml: document.xml, envelope: envelopeXml([document], 'receipt') }
  }
  return written
}
const rejected = async (change: (xml: string) => string): Promise<readonly string[]> => {
  const { xml, envelope } = whole()
  expect(await validateAgainstXsd(envelope, 'EnvioBOLETA')).toEqual([])
  const changed = change(xml)
  expect(changed).not.toBe(xml)
  return validateAgainstXsd(envelope.replace(xml, changed), 'EnvioBOLETA')
}
const put = (anchor: string, element: string, side: 'before' | 'after') => (xml: string) =>
  xml.replace(anchor, side === 'after' ? `${anchor}${element}` : `${element}${anchor}`)

// A receipt has less than the invoice's `Documento`. What follows is what `createDocument` refuses on a receipt, or
// the codec leaves out of one, because the schema would reject the receipt: each written by hand where the invoice
// has it. If a new `EnvioBOLETA_v11.xsd` admits one, its test fails and the model can follow.
describe('what the schema refuses in a receipt', () => {
  test('the receipt it is written into carries the whole IdDoc and the software provider', () => {
    const { xml } = whole()
    expect(xml).toContain(
      '<IndServicio>3</IndServicio><IndMntNeto>2</IndMntNeto><PeriodoDesde>2026-11-01</PeriodoDesde>' +
        '<PeriodoHasta>2026-11-30</PeriodoHasta><FchVenc>2026-12-10</FchVenc><MedioPago>2</MedioPago></IdDoc>',
    )
    expect(xml).toContain(`</Receptor><RUTProvSW>${ISSUER_RUT}</RUTProvSW><Totales>`)
  })

  // The 33 elements and blocks of the invoice a receipt does not declare; `Comisiones` is two of them, the summary in
  // the totals and the lines.
  test.each([
    ['IndNoRebaja', '<IndNoRebaja>1</IndNoRebaja>', '</FchEmis>', 'after'],
    ['TipoDespacho', '<TipoDespacho>1</TipoDespacho>', '</FchEmis>', 'after'],
    ['IndTraslado', '<IndTraslado>1</IndTraslado>', '</FchEmis>', 'after'],
    ['TpoImpresion', '<TpoImpresion>T</TpoImpresion>', '</FchEmis>', 'after'],
    ['MntBruto', '<MntBruto>1</MntBruto>', '</IndServicio>', 'after'],
    ['TpoTranCompra', '<TpoTranCompra>1</TpoTranCompra>', '</IndServicio>', 'after'],
    ['TpoTranVenta', '<TpoTranVenta>1</TpoTranVenta>', '</IndServicio>', 'after'],
    ['FmaPago', '<FmaPago>1</FmaPago>', '</IndServicio>', 'after'],
    ['FmaPagExp', '<FmaPagExp>1</FmaPagExp>', '</IndServicio>', 'after'],
    ['FchCancel', '<FchCancel>2026-11-15</FchCancel>', '</IndServicio>', 'after'],
    ['MntCancel', '<MntCancel>3000</MntCancel>', '</IndServicio>', 'after'],
    ['SaldoInsol', '<SaldoInsol>0</SaldoInsol>', '</IndServicio>', 'after'],
    [
      'MntPagos',
      '<MntPagos><FchPago>2026-12-01</FchPago><MntPago>3000</MntPago></MntPagos>',
      '</IndServicio>',
      'after',
    ],
    ['TpoCtaPago', '<TpoCtaPago>CORRIENTE</TpoCtaPago>', '</MedioPago>', 'after'],
    ['NumCtaPago', '<NumCtaPago>123</NumCtaPago>', '</MedioPago>', 'after'],
    ['BcoPago', '<BcoPago>Banco</BcoPago>', '</MedioPago>', 'after'],
    ['TermPagoCdg', '<TermPagoCdg>A</TermPagoCdg>', '</MedioPago>', 'after'],
    ['TermPagoGlosa', '<TermPagoGlosa>30 días</TermPagoGlosa>', '</MedioPago>', 'after'],
    ['TermPagoDias', '<TermPagoDias>30</TermPagoDias>', '</MedioPago>', 'after'],
    ['Sucursal', '<Sucursal>Casa Matriz</Sucursal>', '</GiroEmisor>', 'after'],
    ['Transporte', '<Transporte><Patente>ABCD12</Patente></Transporte>', '<Totales>', 'before'],
    ['TasaIVA', '<TasaIVA>19</TasaIVA>', '<IVA>', 'before'],
    ['IVAProp', '<IVAProp>100</IVAProp>', '</IVA>', 'after'],
    ['IVATerc', '<IVATerc>100</IVATerc>', '</IVA>', 'after'],
    [
      'ImptoReten',
      '<ImptoReten><TipoImp>15</TipoImp><TasaImp>19</TasaImp><MontoImp>570</MontoImp></ImptoReten>',
      '</IVA>',
      'after',
    ],
    ['Comisiones', '<Comisiones><ValComNeto>100</ValComNeto></Comisiones>', '<MntTotal>', 'before'],
    ['MontoPeriodo', '<MontoPeriodo>3570</MontoPeriodo>', '</MontoNF>', 'after'],
    ['TpoDocLiq', '<TpoDocLiq>33</TpoDocLiq>', '<NmbItem>Café', 'before'],
    ['QtyRef', '<QtyRef>2</QtyRef>', '<QtyItem>', 'before'],
    ['UnmdRef', '<UnmdRef>KG</UnmdRef>', '<QtyItem>', 'before'],
    ['PrcRef', '<PrcRef>100</PrcRef>', '<QtyItem>', 'before'],
    ['CodImpAdic', '<CodImpAdic>27</CodImpAdic>', '<MontoItem>3000', 'before'],
    [
      'Comisiones',
      '<Comisiones><NroLinCom>1</NroLinCom><TipoMovim>C</TipoMovim><Glosa>Comisión</Glosa><ValComNeto>100</ValComNeto><ValComExe>0</ValComExe></Comisiones>',
      '<TED ',
      'before',
    ],
  ] as const)('%s, which only the invoice declares, fails it', async (element, xml, anchor, side) => {
    expect(await rejected(put(anchor, xml, side))).toEqual([
      expect.stringContaining(`Element '${ns(element)}': This element is not expected.`),
    ])
  })

  // The order of the receipt's `IdDoc` is its own. The invoice's puts `IndMntNeto` last and `MedioPago` before `FchVenc`.
  test('IndMntNeto after the period, where the invoice has it, fails it', async () => {
    const moved = (xml: string): string =>
      xml.replace('<IndMntNeto>2</IndMntNeto>', '').replace('</IdDoc>', '<IndMntNeto>2</IndMntNeto></IdDoc>')
    expect(await rejected(moved)).toEqual([
      `Schemas validity error : Element '${ns('IndMntNeto')}': This element is not expected.`,
    ])
  })

  test('MedioPago before FchVenc, where the invoice has it, fails it', async () => {
    const moved = (xml: string): string =>
      xml.replace('<MedioPago>2</MedioPago>', '').replace('<FchVenc>', '<MedioPago>2</MedioPago><FchVenc>')
    expect(await rejected(moved)).toEqual([
      `Schemas validity error : Element '${ns('FchVenc')}': This element is not expected.`,
    ])
  })

  test('IndMntNeto takes one value, 2', async () => {
    expect(await rejected((xml) => xml.replace('<IndMntNeto>2<', '<IndMntNeto>1<'))).toEqual([
      `Schemas validity error : Element '${ns('IndMntNeto')}': [facet 'enumeration'] The value '1' is not an element of the set {'2'}.`,
    ])
  })

  test.each([3, 4, 5])('IndExe %p, which the invoice admits, fails it: a receipt admits 1, 2 and 6', async (value) => {
    expect(await rejected((xml) => xml.replace('<IndExe>2<', `<IndExe>${value}<`))).toEqual([
      `Schemas validity error : Element '${ns('IndExe')}': [facet 'enumeration'] The value '${value}' is not an element of the set {'1', '2', '6'}.`,
    ])
  })

  // Which is why `createDocument` writes 3 on a receipt when the caller gives none.
  test('a receipt without IndServicio fails it: its schema requires the element', async () => {
    expect(await rejected((xml) => xml.replace('<IndServicio>3</IndServicio>', ''))).toEqual([
      `Schemas validity error : Element '${ns('IndMntNeto')}': This element is not expected. Expected is ( ${ns('IndServicio')} ).`,
    ])
  })
})

// Formato de Boletas 4.2 (2025-09-08) and the schema the SII publishes with it do not say the same everywhere. The
// SII validates what it receives against the schema, so dte-sdk follows it; these tests are the schema's answer.
describe('where Formato de Boletas 4.2 and the schema differ', () => {
  test('the Formato prints the tag as RutProvSW; the schema declares RUTProvSW', async () => {
    expect(await rejected((xml) => xml.replace(/RUTProvSW>/g, 'RutProvSW>'))).toEqual([
      `Schemas validity error : Element '${ns('RutProvSW')}': This element is not expected. Expected is one of ( ${ns('RUTProvSW')}, ${ns('Totales')} ).`,
    ])
  })

  test("the Formato has RznSocProvSW, the provider's name, as field 31; the schema declares no such element", async () => {
    const named = put('</RUTProvSW>', '<RznSocProvSW>Comercial Andina SpA</RznSocProvSW>', 'after')
    expect(await rejected(named)).toEqual([
      `Schemas validity error : Element '${ns('RznSocProvSW')}': This element is not expected. Expected is ( ${ns('Totales')} ).`,
    ])
  })

  test('the Formato gives IndMntNeto, MntNeto and IVA a 0 on an exempt receipt; the schema declares them on both', async () => {
    const exempt = issue({
      ...base,
      type: 41,
      folio: 98,
      items: [{ name: 'Consulta médica', unitPrice: 30000 }],
      options: { netAmountsIndicator: 2 },
      totals: { netAmount: 0, exemptAmount: 30000, vatAmount: 0, totalAmount: 30000 },
    })
    expect(exempt.xml).toContain('<IndMntNeto>2</IndMntNeto>')
    expect(exempt.xml).toContain('<MntNeto>0</MntNeto><MntExe>30000</MntExe><IVA>0</IVA>')
    expect(await validateAgainstXsd(envelopeXml([exempt], 'receipt'), 'EnvioBOLETA')).toEqual([])
  })
})
