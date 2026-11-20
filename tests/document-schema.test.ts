import { parseCaf } from '../src/caf/parse'
import { FOREIGN_RECEIVER_RUT } from '../src/catalogs/codes'
import type { DocumentType } from '../src/catalogs/document-types'
import { verifyDocumentSignature, type SignedDocument } from '../src/document/sign'
import { verifyReceivedDocuments } from '../src/document/verify-received'
import type { DocumentInput } from '../src/model/document'
import { verifyTed } from '../src/ted/build'
import { RECEIVER_RUT, fixtureText } from './support/fixtures'
import { envelopeXml, issue, issuer, receiver } from './support/printed-fixtures'
import { validateAgainstXsd } from './support/xsd'

// Every type dte-sdk sends in an `EnvioDTE`, with the variants it builds, run through the SII's own `DTE_v10.xsd` and
// `EnvioDTE_v10.xsd`: each signed document alone, then the documents of a type together in one signed envelope.
// What the schema would reject for want of an `Acteco` or a `GlosaSTI`, `createDocument` refuses before stamping.

jest.setTimeout(60_000)

const base = { issueDate: '2026-11-15', issuer, receiver }
type Variant = Omit<DocumentInput, 'type' | 'folio' | 'issueDate' | 'issuer' | 'receiver'> &
  Partial<Pick<DocumentInput, 'issuer' | 'receiver'>>

const invoiceReference = { documentType: 33, folio: 7, date: '2026-11-01' }
const setReference = { documentType: 'SET', folio: 'CASO-1', date: '2026-11-15', reason: 'Set de pruebas' } as const
const purchaseReference = { documentType: 46, folio: 7, date: '2026-11-15', code: 3, reason: 'DEVOLUCION' } as const
const settledLine = { name: 'Venta por cuenta de terceros', unitPrice: 10000, settledDocumentType: '33' }
const transport = {
  licensePlate: 'ABCD12',
  carrierRut: RECEIVER_RUT,
  driver: { rut: RECEIVER_RUT, name: 'Juan Pérez' },
  destinationAddress: 'Bodega 1',
  destinationCommune: 'Maipú',
  destinationCity: 'Santiago',
}
// Every element of `Transporte` dte-sdk writes, the four of 2026 (Res. Ex. 144/2026) included.
const wholeTransport = {
  ...transport,
  trailerLicensePlate: 'JK1234',
  departureDate: '2026-11-15',
  departureTime: '08:30',
  arrivalDate: '2026-11-16',
}

// An export document goes to a receiver abroad, under the generic RUT the format gives, in a foreign currency.
const foreignReceiver = {
  rut: FOREIGN_RECEIVER_RUT,
  businessName: 'Andes Trading LLC',
  address: '1200 Harbor Blvd',
  city: 'Miami',
  foreign: { id: '59-1234567', nationality: '225' },
}
const exportBase = { receiver: foreignReceiver, currency: 'DOLAR USA' } as const
// What an export of goods carries in its customs area: sale modality, clause and total, route, ports, countries,
// weights with their units, and the packages with their marks; the codes are illustrative.
const goodsCustoms = {
  saleModality: 1,
  saleClause: 2,
  saleClauseTotal: 12500.5,
  transportRoute: 1,
  transportName: 'MV Pacific Star',
  carrierRut: RECEIVER_RUT,
  carrierName: 'Naviera del Sur',
  booking: 'BK-778899',
  loadingPort: 906,
  unloadingPort: 211,
  tare: 2200,
  tareUnit: 6,
  grossWeight: 18450.75,
  grossWeightUnit: 6,
  netWeight: 16250.5,
  netWeightUnit: 6,
  totalItems: 2,
  totalPackages: 801,
  packages: [
    { code: 13, count: 800, marks: 'ANDES MIAMI 1-800' },
    { code: 75, count: 1, marks: 'CONT 1', containerId: 'MSCU1234565', seal: 'SL-0098', sealIssuer: 'Aduana de Chile' },
  ],
  receiverCountry: 225,
  destinationCountry: 225,
}
const exportInvoiceReference = { documentType: 110, folio: 1, date: '2026-11-10' }

const VARIANTS: Record<Exclude<DocumentType, 39 | 41>, Record<string, Variant>> = {
  33: {
    plain: { items: [{ name: 'Plan anual', quantity: 2, unitPrice: 100000 }] },
    'line codes, a discount, a surcharge, an exempt line and a price with decimals': {
      items: [
        {
          name: 'Licencia',
          quantity: 2,
          unitPrice: 100000,
          discountPercent: 10,
          codes: [{ type: 'INT1', value: 'L-1' }],
        },
        { name: 'Soporte', quantity: 3, unit: 'HR', unitPrice: 15000, surchargePercent: 5, unitPriceDecimals: 6 },
        { name: 'Despacho', unitPrice: 5000, exemptIndicator: 2 },
      ],
    },
    'a quantity, a price, a reference pair, a discount and a surcharge with more decimals than the schema holds': {
      items: [
        {
          name: 'Granel',
          quantity: 1 / 3,
          unitPrice: 100000 / 3,
          referenceQuantity: 2 / 3,
          referenceUnit: 'KG',
          referencePrice: 1000 / 7,
          discountPercent: 100 / 3,
        },
        { name: 'Flete', quantity: 0.1 + 0.2, unitPrice: 1000, surchargePercent: 100 / 3 },
      ],
      globalAdjustments: [{ kind: 'discount', valueType: 'percent', value: 100 / 3, description: 'Pronto pago' }],
    },
    'references, one to another issuer and one to the SET': {
      items: [{ name: 'Plan anual', unitPrice: 100000 }],
      references: [
        setReference,
        { documentType: 52, folio: 9, date: '2026-11-10', otherRut: RECEIVER_RUT, reason: 'Guía' },
        { documentType: 801, folio: 'OC-55', date: '2026-11-01', reason: 'Orden de compra' },
      ],
    },
    'a global discount and a global surcharge': {
      items: [
        { name: 'Plan anual', unitPrice: 100000 },
        { name: 'Despacho', unitPrice: 5000, exempt: true },
      ],
      globalAdjustments: [
        { kind: 'discount', valueType: 'percent', value: 5, description: 'Pronto pago' },
        { kind: 'surcharge', valueType: 'amount', value: 700, exemptIndicator: 1 },
      ],
    },
    'an informative subtotal, payments and a billing period': {
      items: [{ name: 'Plan mensual', quantity: 3, unitPrice: 100 }],
      subtotals: [{ number: 1, description: 'Servicios', totalAmount: 300, lines: [1] }],
      options: {
        paymentTerms: 2,
        payments: [{ date: '2026-12-01', amount: 100, note: 'Cuota 1' }],
        billingPeriod: { from: '2026-11-01', to: '2026-11-30' },
        dueDate: '2026-12-15',
      },
    },
    'prices that include VAT': {
      items: [{ name: 'Plan anual', quantity: 2, unitPrice: 1190 }],
      pricesIncludeVat: true,
    },
    transport: { items: [{ name: 'Cajón', quantity: 10, unitPrice: 8000 }], transport },
    'the whole transport area, with the trailer plate and the departure and arrival of 2026': {
      items: [{ name: 'Cajón', quantity: 10, unitPrice: 8000 }],
      transport: wholeTransport,
    },
  },
  34: {
    'exempt lines': { items: [{ name: 'Asesoría exenta', quantity: 2, unit: 'UN', unitPrice: 50000 }] },
    'a global discount and a reference': {
      items: [{ name: 'Asesoría exenta', unitPrice: 50000 }],
      globalAdjustments: [{ kind: 'discount', valueType: 'percent', value: 10 }],
      references: [setReference],
    },
  },
  43: {
    'a commission with its net, exempt and VAT values': {
      items: [settledLine],
      commissions: [
        { kind: 'commission', description: 'Comisión 10%', rate: 10, netValue: 1000, exemptValue: 0, vatValue: 190 },
      ],
    },
    'another charge with its net and exempt values, and a reference': {
      items: [{ name: 'Venta por cuenta de terceros', unitPrice: 100, settledDocumentType: '39' }],
      commissions: [{ kind: 'otherCharge', description: 'Flete', netValue: 10, exemptValue: 0 }],
      references: [setReference],
    },
    'a commission with only a net value: its exempt value is written as zero and its VAT worked out': {
      items: [settledLine],
      commissions: [{ kind: 'commission', description: 'Comisión 10%', rate: 10, netValue: 1000 }],
    },
    'a commission with a net and a VAT value, and another charge with only an exempt value': {
      items: [settledLine],
      commissions: [
        { kind: 'commission', description: 'Comisión 10%', rate: 10, netValue: 1000, vatValue: 190 },
        { kind: 'otherCharge', description: 'Flete', exemptValue: 10 },
      ],
    },
    'charges equal to what it settles, so a total of zero': {
      items: [settledLine],
      commissions: [{ kind: 'commission', description: 'Comisión 100%', rate: 100, netValue: 10000 }],
    },
    'charges above what it settles, so a negative total': {
      items: [settledLine],
      commissions: [
        { kind: 'commission', description: 'Comisión 100%', rate: 100, netValue: 10000 },
        { kind: 'otherCharge', description: 'Bodegaje', exemptValue: 500 },
      ],
    },
    'a negative line and a negative commission, which settle a credit note': {
      items: [{ name: 'Nota de crédito liquidada', amount: -10000, settledDocumentType: '61' }],
      commissions: [{ kind: 'commission', description: 'Reverso de comisión', netValue: -1000 }],
    },
    'a negative exempt line and a non-billable one, which the totals leave out': {
      items: [
        settledLine,
        { name: 'Devolución exenta', amount: -500, exempt: true, settledDocumentType: '61' },
        { name: 'Anticipo ya liquidado', amount: -300, exemptIndicator: 2, settledDocumentType: '99' },
      ],
      commissions: [{ kind: 'commission', description: 'Comisión', netValue: 1000 }],
    },
    'no commissions, with the payment and period fields of its header': {
      items: [settledLine],
      subtotals: [{ number: 1, description: 'Ventas', totalAmount: 10000, lines: [1] }],
      options: {
        serviceIndicator: 3,
        paymentTerms: 2,
        payments: [{ date: '2026-12-01', amount: 100, note: 'Cuota 1' }],
        billingPeriod: { from: '2026-11-01', to: '2026-11-30' },
        dueDate: '2026-12-15',
      },
    },
    'prices that include VAT': {
      items: [{ ...settledLine, unitPrice: 11900 }],
      commissions: [{ kind: 'commission', description: 'Comisión', netValue: 1000 }],
      pricesIncludeVat: true,
    },
    'totals given by the caller, with the own and third-party VAT': {
      items: [settledLine],
      commissions: [{ kind: 'commission', description: 'Comisión', netValue: 1000 }],
      totals: {
        netAmount: 10000,
        vatRate: 19,
        vatAmount: 1900,
        ownVatAmount: 190,
        thirdPartyVatAmount: 1710,
        commissions: { netValue: 1000, exemptValue: 0, vatValue: 190 },
        totalAmount: 10710,
      },
    },
    'the 60 lines and the 20 commissions the schema admits': {
      items: Array.from({ length: 60 }, () => settledLine),
      commissions: Array.from({ length: 20 }, () => ({
        kind: 'otherCharge' as const,
        description: 'Cargo',
        netValue: 100,
      })),
    },
  },
  46: {
    'withholds the VAT': {
      items: [{ name: 'Chatarra de fierro', quantity: 300, unitPrice: 1200, additionalTaxCodes: [15] }],
    },
    'without withholding': { items: [{ name: 'Chatarra de fierro', unitPrice: 1200 }], withholdVat: false },
    'the lines of a withholding agent, marked alone and with the bases they declare': {
      items: [
        { name: 'Chatarra de fierro', quantity: 300, unitPrice: 1200, withholdingAgent: {} },
        {
          name: 'Carne en vara',
          unitPrice: 5000,
          exempt: true,
          withholdingAgent: { slaughterBase: 4000, marginBase: 0, finalConsumerPrice: 6500 },
        },
      ],
    },
    'a global discount and a reference': {
      items: [{ name: 'Chatarra de fierro', quantity: 10, unitPrice: 1000, additionalTaxCodes: [15] }],
      globalAdjustments: [{ kind: 'discount', valueType: 'amount', value: 100 }],
      references: [setReference],
    },
  },
  52: {
    'a sale with its dispatch type and transport': {
      items: [{ name: 'Cajón de manzanas', quantity: 10, unitPrice: 8000 }],
      options: { transferType: 1, dispatchType: 2 },
      transport,
    },
    'an internal transfer at zero, with a driver': {
      items: [{ name: 'Pallet', quantity: 2, unit: 'UN', amount: 0 }],
      options: { transferType: 5 },
      transport: { licensePlate: 'XX1234', driver: { rut: RECEIVER_RUT, name: 'Ana' } },
    },
    'the whole transport area, with the trailer plate and the departure and arrival of 2026': {
      items: [{ name: 'Cajón de manzanas', quantity: 10, unitPrice: 8000 }],
      options: { transferType: 1, dispatchType: 2 },
      transport: wholeTransport,
    },
    'only the departure date of 2026, with a trailer and no time': {
      items: [{ name: 'Pallet', quantity: 2, unit: 'UN', amount: 0 }],
      options: { transferType: 5 },
      transport: { licensePlate: 'XX1234', trailerLicensePlate: 'RR5678', departureDate: '2026-11-15' },
    },
  },
  56: {
    'a global surcharge, referencing the invoice': {
      items: [{ name: 'Interés por mora', unitPrice: 10000 }],
      globalAdjustments: [{ kind: 'surcharge', valueType: 'amount', value: 2500 }],
      references: [{ ...invoiceReference, code: 3, reason: 'Corrige monto' }],
    },
    'withholds the VAT, referencing a purchase invoice': {
      items: [{ name: 'Chatarra de fierro', quantity: 10, unitPrice: 1000, additionalTaxCodes: [15] }],
      references: [purchaseReference],
      withholdVat: true,
    },
  },
  61: {
    'cancels an invoice, referencing it and the SET': {
      items: [{ name: 'Plan anual', unitPrice: 100000 }],
      references: [setReference, { ...invoiceReference, code: 1, reason: 'Anula factura' }],
    },
    'corrects a text at zero': {
      items: [{ name: 'Corrige giro del receptor', amount: 0 }],
      references: [{ ...invoiceReference, code: 2, reason: 'Corrige giro' }],
    },
    'a global reference and a global discount': {
      items: [{ name: 'Devolución', unitPrice: 1000 }],
      references: [{ ...invoiceReference, global: true, code: 3, reason: 'Descuento por volumen' }],
      globalAdjustments: [{ kind: 'discount', valueType: 'percent', value: 10, description: 'Desc. global' }],
    },
    'withholds the VAT, referencing a purchase invoice': {
      items: [{ name: 'Chatarra de fierro', quantity: 10, unitPrice: 1000, additionalTaxCodes: [15] }],
      references: [purchaseReference],
      withholdVat: true,
    },
  },
  110: {
    'goods with packages and a container, in dollars, with the totals in pesos': {
      ...exportBase,
      items: [
        { name: 'Uva de mesa', quantity: 800, unit: 'KN', unitPrice: 12.25, codes: [{ type: 'INT1', value: 'UV-1' }] },
        { name: 'Pallet de madera', quantity: 1, unit: 'U', unitPrice: 2700.5 },
      ],
      transport: { customs: goodsCustoms },
      options: { paymentTerms: 2, exportPaymentTerms: '1', dueDate: '2026-12-15' },
      exchangeRate: 950.25,
    },
    'freight and insurance in the customs area and as two global surcharges on the exempt amount': {
      ...exportBase,
      items: [{ name: 'Salmón congelado', quantity: 1000.5, unit: 'KN', unitPrice: 9.875 }],
      transport: { customs: { ...goodsCustoms, saleClause: 1, freight: 1250.1234, insurance: 75.5 } },
      globalAdjustments: [
        { kind: 'surcharge', valueType: 'amount', value: 1250.12, description: 'Flete', exemptIndicator: 1 },
        { kind: 'surcharge', valueType: 'amount', value: 75.5, description: 'Seguro', exemptIndicator: 1 },
      ],
      exchangeRate: 948.5,
    },
    'a line surcharge, a line discount and a global discount in percent': {
      ...exportBase,
      currency: 'EURO',
      items: [
        { name: 'Vino tinto', quantity: 120, unit: 'BOT', unitPrice: 8.4, surchargePercent: 10 },
        { name: 'Vino blanco', quantity: 60, unit: 'BOT', unitPrice: 7.2, discountPercent: 5 },
      ],
      transport: { customs: goodsCustoms },
      globalAdjustments: [{ kind: 'discount', valueType: 'percent', value: 2.5, exemptIndicator: 1 }],
    },
    'services rendered abroad: no quantity or unit, no sale clause, with the issuer and receiver identifiers': {
      ...exportBase,
      issuer: { ...issuer, additionalBranchCode: 'CL-01', additionalId: 'EXP-7' },
      receiver: { ...foreignReceiver, foreign: { ...foreignReceiver.foreign, additionalId: 'VAT-US-1' } },
      items: [{ name: 'Desarrollo de software a medida', amount: 15000 }],
      transport: { customs: { transportRoute: 4, receiverCountry: 225, destinationCountry: 225 } },
      options: {
        serviceIndicator: 3,
        paymentTermsCode: 'FRF',
        paymentTermsNote: 'Fecha de recepción',
        paymentTermsDays: 30,
      },
      exchangeRate: 950,
    },
    'samples without payment: a total of zero': {
      ...exportBase,
      items: [{ name: 'Muestra de aceite de oliva', quantity: 6, unit: 'BOT', unitPrice: 15 }],
      transport: { customs: { ...goodsCustoms, packages: undefined, totalPackages: 1 } },
      options: { exportPaymentTerms: '21' },
    },
    'the smallest valid document': {
      ...exportBase,
      receiver: { rut: FOREIGN_RECEIVER_RUT, businessName: 'Andes Trading LLC', address: 'Calle 1', city: 'Lima' },
      items: [{ name: 'Asesoría', amount: 100 }],
      transport: { customs: { transportRoute: 4, receiverCountry: 219 } },
      options: { serviceIndicator: 4 },
    },
  },
  111: {
    'raises the price, referencing the export invoice': {
      ...exportBase,
      items: [{ name: 'Diferencia de precio', amount: 250.75 }],
      references: [{ ...exportInvoiceReference, code: 3, reason: 'Corrige monto', otherAdditionalId: 'REF-1' }],
      exchangeRate: 950.25,
    },
    'the smallest valid document': {
      ...exportBase,
      receiver: { rut: FOREIGN_RECEIVER_RUT, businessName: 'Andes Trading LLC', address: 'Calle 1' },
      items: [{ name: 'Interés', amount: 1 }],
      references: [{ ...exportInvoiceReference, code: 3 }],
    },
  },
  112: {
    'cancels the export invoice, with its customs area and the totals in pesos': {
      ...exportBase,
      items: [{ name: 'Uva de mesa', quantity: 800, unit: 'KN', unitPrice: 12.25 }],
      transport: { customs: goodsCustoms },
      references: [{ ...exportInvoiceReference, code: 1, reason: 'Anula factura de exportación' }],
      exchangeRate: 950.25,
    },
    'a discount on the exempt amount, referencing the export invoice and the SET': {
      ...exportBase,
      items: [{ name: 'Descuento por calidad', amount: 500 }],
      globalAdjustments: [{ kind: 'discount', valueType: 'amount', value: 10.5, exemptIndicator: 1 }],
      references: [setReference, { ...exportInvoiceReference, code: 3, reason: 'Corrige monto' }],
    },
  },
}

describe.each(Object.entries(VARIANTS))('type %s', (type, variants) => {
  const entries = Object.entries(variants)
  // Issuing signs twice with node-forge, so each variant is issued once, by the first test that needs it.
  const signed: SignedDocument[] = []
  const issued = (index: number): SignedDocument =>
    (signed[index] ??= issue({ ...base, ...entries[index][1], type: Number(type) as DocumentType, folio: index + 1 }))

  test.each(entries.map(([name], index) => [name, index] as const))(
    '%s: the signed document validates against DTE_v10.xsd',
    async (_name, index) => {
      expect(await validateAgainstXsd(issued(index).xml, 'DTE')).toEqual([])
    },
  )

  test('every variant together in one signed envelope validates against EnvioDTE_v10.xsd', async () => {
    expect(await validateAgainstXsd(envelopeXml(entries.map((_, index) => issued(index))), 'EnvioDTE')).toEqual([])
  })

  // An export document is signed over `Exportaciones` and stamped with the total it writes: both verify, by the
  // signature alone, by the stamp against the CAF, and as a received document.
  if (Number(type) >= 110)
    test.each(entries.map(([name], index) => [name, index] as const))(
      '%s: its signature and its stamp verify',
      (_name, index) => {
        const document = issued(index)
        const caf = parseCaf(fixtureText('caf-33.xml').replace(/<TD>33<\/TD>/, `<TD>${type}</TD>`))
        expect(verifyDocumentSignature(document.xml).valid).toBe(true)
        expect(verifyTed(document.ted.xml, caf)).toBe(true)
        expect(document.xml).toContain(`<MntTotal>${document.header.totals.totalAmount}</MntTotal>`)
        expect(document.ted.xml).toContain(`<MNT>${document.header.totals.totalAmount}</MNT>`)
        const [received] = verifyReceivedDocuments(document.xml, { environment: 'certification' }).documents
        expect(received).toMatchObject({ totalAmount: document.header.totals.totalAmount })
        expect(received.signature.valid).toBe(true)
        expect(received.ted).toEqual({ found: true, signatureValid: true, mismatches: [], valid: true })
      },
    )
})

// What `createDocument` refuses or rewrites because the schema would reject it. If a new `DTE_v10.xsd` admits these,
// the test fails and the model can follow.
describe('what the schema refuses in the transport of a guide', () => {
  let guide: SignedDocument | undefined
  const issued = (): SignedDocument =>
    (guide ??= issue({
      ...base,
      type: 52,
      folio: 99,
      items: [{ name: 'Cajón de manzanas', quantity: 10, unitPrice: 8000 }],
      options: { transferType: 1 },
      transport: wholeTransport,
    }))

  // Res. Ex. 144/2026 names three transfer types, a transfer of more than one day as a sale or not and an outsourced
  // transfer, and neither it nor the Formato gives them a code. The schema admits 1 to 9, so a code after 9 fails.
  test.each([10, 11, 12])('IndTraslado %p, past the 9 the schema admits, fails it', async (code) => {
    const xml = issued().xml.replace('<IndTraslado>1</IndTraslado>', `<IndTraslado>${code}</IndTraslado>`)
    expect(await validateAgainstXsd(xml, 'DTE')).toEqual([
      expect.stringContaining(
        `The value '${code}' is not an element of the set {'1', '2', '3', '4', '5', '6', '7', '8', '9'}`,
      ),
    ])
  })

  test('HraSalida needs its seconds, so a time given as HH:MM is written with :00', async () => {
    const xml = issued().xml
    expect(xml).toContain('<HraSalida>08:30:00</HraSalida>')
    expect(await validateAgainstXsd(xml.replace('08:30:00', '08:30'), 'DTE')).toEqual([
      expect.stringContaining("Element '{http://www.sii.cl/SiiDte}HraSalida': '08:30' is not a valid value"),
    ])
  })
})

// `IndMntNeto` and `RUTProvSW` are a receipt's: `EnvioBOLETA_v11.xsd` declares them and `DTE_v10.xsd` does not, so
// `createDocument` refuses `options.netAmountsIndicator` and `softwareProviderRut` on every type but 39 and 41.
describe('what only the schema of receipts declares', () => {
  const ns = (element: string): string => `{http://www.sii.cl/SiiDte}${element}`
  let signed: SignedDocument | undefined
  const invoice = (): string =>
    (signed ??= issue({ ...base, type: 33, folio: 94, items: [{ name: 'Plan anual', unitPrice: 100000 }] })).xml

  test.each([
    ['IndMntNeto', '<IndMntNeto>2</IndMntNeto></IdDoc>', '</IdDoc>'],
    ['RUTProvSW', `</Receptor><RUTProvSW>${RECEIVER_RUT}</RUTProvSW>`, '</Receptor>'],
  ])('%s on an invoice fails it', async (element, written, anchor) => {
    expect(await validateAgainstXsd(invoice(), 'DTE')).toEqual([])
    expect(await validateAgainstXsd(invoice().replace(anchor, written), 'DTE')).toEqual([
      expect.stringContaining(`Element '${ns(element)}': This element is not expected.`),
    ])
  })
})

// A settlement invoice has a root of its own, `Liquidacion`, which declares less than `Documento` does. What follows
// is what `createDocument` refuses, requires or completes on a 43 because the schema would reject the document, each
// written by hand into a signed one to show the rejection. If a new `DTE_v10.xsd` admits one, its test fails and the
// model can follow.
describe('what the schema refuses in a settlement invoice', () => {
  const ns = (element: string): string => `{http://www.sii.cl/SiiDte}${element}`
  let signed: SignedDocument | undefined
  const settlement = (): string =>
    (signed ??= issue({
      ...base,
      type: 43,
      folio: 99,
      items: [settledLine],
      references: [invoiceReference],
      commissions: [{ kind: 'commission', description: 'Comisión 10%', rate: 10, netValue: 1000 }],
    })).xml
  const rejected = async (xml: string): Promise<readonly string[]> => {
    expect(await validateAgainstXsd(settlement(), 'DTE')).toEqual([])
    expect(xml).not.toBe(settlement())
    return validateAgainstXsd(xml, 'DTE')
  }

  test('the document it is written into validates, with its totals and its stamp', async () => {
    const xml = settlement()
    expect(xml).toContain('<Comisiones><ValComNeto>1000</ValComNeto><ValComIVA>190</ValComIVA></Comisiones>')
    expect(xml).toContain('<MntTotal>10710</MntTotal>')
    expect(xml).toContain('<MNT>10710</MNT>')
    expect(await validateAgainstXsd(xml, 'DTE')).toEqual([])
  })

  // Each element only `Documento` declares, written where the codec would put it.
  test.each([
    ['IndNoRebaja', '<IndNoRebaja>1</IndNoRebaja>', '</FchEmis>', 'after'],
    ['TipoDespacho', '<TipoDespacho>1</TipoDespacho>', '</FchEmis>', 'after'],
    ['IndTraslado', '<IndTraslado>1</IndTraslado>', '</FchEmis>', 'after'],
    ['TpoImpresion', '<TpoImpresion>T</TpoImpresion>', '</FchEmis>', 'after'],
    ['FmaPagExp', '<FmaPagExp>1</FmaPagExp>', '</FchEmis>', 'after'],
    ['IndMntNeto', '<IndMntNeto>2</IndMntNeto>', '</IdDoc>', 'before'],
    ['Transporte', '<Transporte><Patente>ABCD12</Patente></Transporte>', '<Totales>', 'before'],
    ['MontoNF', '<MontoNF>5</MontoNF>', '</MntTotal>', 'after'],
    ['DescuentoPct', '<DescuentoPct>10</DescuentoPct><DescuentoMonto>1000</DescuentoMonto>', '<MontoItem>', 'before'],
    ['RecargoPct', '<RecargoPct>10</RecargoPct><RecargoMonto>1000</RecargoMonto>', '<MontoItem>', 'before'],
    [
      'DscRcgGlobal',
      '<DscRcgGlobal><NroLinDR>1</NroLinDR><TpoMov>D</TpoMov><TpoValor>%</TpoValor><ValorDR>5</ValorDR></DscRcgGlobal>',
      '<Referencia>',
      'before',
    ],
    ['RUTOtr', `<RUTOtr>${RECEIVER_RUT}</RUTOtr>`, '<FchRef>', 'before'],
  ] as const)('%s, which only Documento declares, fails it', async (element, written, anchor, side) => {
    const xml = settlement().replace(anchor, side === 'after' ? `${anchor}${written}` : `${written}${anchor}`)
    expect(await rejected(xml)).toEqual([
      expect.stringContaining(`Element '${ns(element)}': This element is not expected.`),
    ])
  })

  test('a receiver without GiroRecep fails it', async () => {
    const xml = settlement().replace(/<GiroRecep>[^<]*<\/GiroRecep>/, '')
    expect(await rejected(xml)).toEqual([
      `Schemas validity error : Element '${ns('DirRecep')}': This element is not expected. Expected is ( ${ns('GiroRecep')} ).`,
    ])
  })

  test.each([
    ['ValComExe', `Element '${ns('ValComIVA')}': This element is not expected. Expected is ( ${ns('ValComExe')} ).`],
    [
      'ValComNeto',
      `Element '${ns('ValComExe')}': This element is not expected. Expected is one of ( ${ns('TasaComision')}, ${ns('ValComNeto')} ).`,
    ],
  ])('a commission line without %s fails it', async (element, error) => {
    // The summary in the totals has no `ValComExe`, and its `ValComNeto` comes first: the last one is the line's.
    const written = new RegExp(`<${element}>-?\\d+</${element}>(?![\\s\\S]*<${element}>)`)
    const xml = settlement().replace(written, '')
    expect(
      await rejected(element === 'ValComNeto' ? xml.replace(/<TasaComision>[^<]*<\/TasaComision>/, '') : xml),
    ).toEqual([`Schemas validity error : ${error}`])
  })

  test('a 61st line and a 21st commission fail it', async () => {
    const full = issue({
      ...base,
      type: 43,
      folio: 98,
      items: Array.from({ length: 60 }, () => settledLine),
      commissions: Array.from({ length: 20 }, () => ({
        kind: 'otherCharge' as const,
        description: 'Cargo',
        netValue: 100,
      })),
    }).xml
    expect(await validateAgainstXsd(full, 'DTE')).toEqual([])
    const lastOf = (element: string): string => {
      const start = full.lastIndexOf(`<${element}><NroLin`)
      return full.slice(start, full.indexOf(`</${element}>`, start) + element.length + 3)
    }
    const oneMore = (element: string): string => full.replace(lastOf(element), lastOf(element) + lastOf(element))
    expect(await validateAgainstXsd(oneMore('Detalle'), 'DTE')).toEqual([
      expect.stringContaining(`Element '${ns('Detalle')}': This element is not expected.`),
    ])
    expect(await validateAgainstXsd(oneMore('Comisiones'), 'DTE')).toEqual([
      expect.stringContaining(`Element '${ns('Comisiones')}': This element is not expected.`),
    ])
  })

  test('a negative total fails it on any other type: only Liquidacion declares MntTotal and MNT as signed', async () => {
    const negative = issue({
      ...base,
      type: 43,
      folio: 97,
      items: [settledLine],
      commissions: [{ kind: 'commission', description: 'Comisión', netValue: 20000 }],
    }).xml
    expect(negative).toContain('<MntTotal>-11900</MntTotal>')
    expect(negative).toContain('<MNT>-11900</MNT>')
    expect(await validateAgainstXsd(negative, 'DTE')).toEqual([])
    const invoice = issue({ ...base, type: 33, folio: 96, items: [{ name: 'Plan anual', unitPrice: 100000 }] }).xml
    const errors = await validateAgainstXsd(
      invoice
        .replace('<MntTotal>119000</MntTotal>', '<MntTotal>-119000</MntTotal>')
        .replace('<MNT>119000</MNT>', '<MNT>-119000</MNT>'),
      'DTE',
    )
    expect(errors).toEqual([
      expect.stringContaining(`Element '${ns('MntTotal')}': '-119000' is not a valid value`),
      expect.stringContaining(`Element '${ns('MNT')}': '-119000' is not a valid value`),
    ])
  })

  test('Retenedor on its line fails it: only Documento declares it', async () => {
    const settlement = issue({ ...base, type: 43, folio: 96, items: [settledLine] }).xml
    expect(await validateAgainstXsd(settlement, 'DTE')).toEqual([])
    const marked = settlement.replace('<NmbItem>', '<Retenedor><IndAgente>R</IndAgente></Retenedor><NmbItem>')
    expect(await validateAgainstXsd(marked, 'DTE')).toEqual([
      expect.stringContaining(`Element '${ns('Retenedor')}': This element is not expected.`),
    ])
  })

  test('TpoDocLiq on the line of an invoice fails it: only Liquidacion declares it', async () => {
    const invoice = issue({ ...base, type: 33, folio: 95, items: [{ name: 'Plan anual', unitPrice: 100000 }] }).xml
    expect(await validateAgainstXsd(invoice, 'DTE')).toEqual([])
    expect(await validateAgainstXsd(invoice.replace('<NmbItem>', '<TpoDocLiq>33</TpoDocLiq><NmbItem>'), 'DTE')).toEqual(
      [expect.stringContaining(`Element '${ns('TpoDocLiq')}': This element is not expected.`)],
    )
  })
})

// An export document has a root of its own, `Exportaciones`. What follows is what `createDocument` refuses, requires
// or rounds on a 110, 111 or 112 because the schema would reject the document, each written by hand into a signed one
// to show the rejection. If a new `DTE_v10.xsd` admits one, its test fails and the model can follow.
describe('what the schema refuses in an export document', () => {
  const ns = (element: string): string => `{http://www.sii.cl/SiiDte}${element}`
  let signed: SignedDocument | undefined
  const exported = (): string =>
    (signed ??= issue({
      ...base,
      ...exportBase,
      type: 110,
      folio: 99,
      items: [{ name: 'Uva de mesa', quantity: 800, unit: 'KN', unitPrice: 12.25, discountPercent: 10 }],
      transport: { licensePlate: 'ABCD12', customs: { ...goodsCustoms, freight: 150.25 } },
      references: [{ documentType: 807, folio: '7001', date: '2026-11-14', otherRut: RECEIVER_RUT }],
      exchangeRate: 950.25,
    })).xml
  const rejected = async (xml: string): Promise<readonly string[]> => {
    expect(await validateAgainstXsd(exported(), 'DTE')).toEqual([])
    expect(xml).not.toBe(exported())
    return validateAgainstXsd(xml, 'DTE')
  }

  test('the document it is written into validates, with its currency, its totals in pesos and its stamp', async () => {
    const xml = exported()
    expect(xml).toContain('<Exportaciones ID="DTE_T110F99">')
    expect(xml).toContain(
      '<Totales><TpoMoneda>DOLAR USA</TpoMoneda><MntExe>8820</MntExe><MntTotal>8820</MntTotal></Totales>',
    )
    expect(xml).toContain(
      '<OtraMoneda><TpoMoneda>PESO CL</TpoMoneda><TpoCambio>950.25</TpoCambio><MntExeOtrMnda>8381205</MntExeOtrMnda><MntTotOtrMnda>8381205</MntTotOtrMnda></OtraMoneda>',
    )
    expect(xml).toContain(
      '<DescuentoPct>10</DescuentoPct><DescuentoMonto>980</DescuentoMonto><MontoItem>8820</MontoItem>',
    )
    expect(xml).toContain('<MNT>8820</MNT>')
    expect(await validateAgainstXsd(xml, 'DTE')).toEqual([])
  })

  // Each element only `Documento` declares, written where the codec would put it.
  test.each([
    ['IndNoRebaja', '<IndNoRebaja>1</IndNoRebaja>', '</FchEmis>', 'after'],
    ['IndTraslado', '<IndTraslado>9</IndTraslado>', '</FchEmis>', 'after'],
    ['TpoImpresion', '<TpoImpresion>T</TpoImpresion>', '</FchEmis>', 'after'],
    ['MntBruto', '<MntBruto>1</MntBruto>', '</FchEmis>', 'after'],
    ['TpoTranVenta', '<TpoTranVenta>1</TpoTranVenta>', '</FchEmis>', 'after'],
    ['PatenteCarro', '<PatenteCarro>JK1234</PatenteCarro>', '</Patente>', 'after'],
    ['FchSalida', '<FchSalida>2026-11-15</FchSalida>', '<Aduana>', 'before'],
    ['MntNeto', '<MntNeto>10</MntNeto>', '<MntExe>', 'before'],
    ['TasaIVA', '<TasaIVA>19</TasaIVA>', '</MntExe>', 'after'],
    ['MontoNF', '<MontoNF>5</MontoNF>', '</MntTotal>', 'after'],
    ['Retenedor', '<Retenedor><IndAgente>R</IndAgente></Retenedor>', '<NmbItem>', 'before'],
    ['TpoDocLiq', '<TpoDocLiq>33</TpoDocLiq>', '<NmbItem>', 'before'],
    ['CodImpAdic', '<CodImpAdic>27</CodImpAdic>', '<MontoItem>', 'before'],
    [
      'Comisiones',
      '<Comisiones><NroLinCom>1</NroLinCom><TipoMovim>C</TipoMovim><Glosa>C</Glosa><ValComNeto>1</ValComNeto><ValComExe>0</ValComExe></Comisiones>',
      '<TED',
      'before',
    ],
  ] as const)('%s, which Exportaciones does not declare, fails it', async (element, written, anchor, side) => {
    const xml = exported().replace(anchor, side === 'after' ? `${anchor}${written}` : `${written}${anchor}`)
    expect(await rejected(xml)).toEqual([
      expect.stringContaining(`Element '${ns(element)}': This element is not expected.`),
    ])
  })

  test.each([
    ['TpoMoneda', /<Totales><TpoMoneda>[^<]*<\/TpoMoneda>/, '<Totales>', `Expected is ( ${ns('TpoMoneda')} )`],
    ['MntExe', /<MntExe>[^<]*<\/MntExe>/, '', `Expected is ( ${ns('MntExe')} )`],
  ])('totals without %s fail it: the schema asks for it', async (_element, written, replacement, expected) => {
    expect(await rejected(exported().replace(written, replacement))).toEqual([expect.stringContaining(expected)])
  })

  test.each([
    [
      'IndServicio 1, which only Documento admits',
      '</FchEmis>',
      '</FchEmis><IndServicio>1</IndServicio>',
      'IndServicio',
    ],
    ['a currency outside TipMonType', '<TpoMoneda>DOLAR USA</TpoMoneda>', '<TpoMoneda>USD</TpoMoneda>', 'TpoMoneda'],
    ['an amount with five decimals', '<MntTotal>8820</MntTotal>', '<MntTotal>8820.00001</MntTotal>', 'MntTotal'],
    ['a negative amount', '<MntExe>8820</MntExe>', '<MntExe>-8820</MntExe>', 'MntExe'],
    [
      'a line discount with decimals',
      '<DescuentoMonto>980</DescuentoMonto>',
      '<DescuentoMonto>980.5</DescuentoMonto>',
      'DescuentoMonto',
    ],
    ['a freight of zero', /<MntFlete>[^<]*<\/MntFlete>/, '<MntFlete>0</MntFlete>', 'MntFlete'],
    ['an exchange rate of zero', '<TpoCambio>950.25</TpoCambio>', '<TpoCambio>0</TpoCambio>', 'TpoCambio'],
    [
      'a code of the customs tables with more digits',
      '<CodModVenta>1</CodModVenta>',
      '<CodModVenta>100</CodModVenta>',
      'CodModVenta',
    ],
    [
      'a nationality longer than 3',
      '<Nacionalidad>225</Nacionalidad>',
      '<Nacionalidad>2250</Nacionalidad>',
      'Nacionalidad',
    ],
    [
      'a gross weight with more digits',
      '<PesoBruto>18450.75</PesoBruto>',
      '<PesoBruto>1234567890.5</PesoBruto>',
      'PesoBruto',
    ],
  ] as const)('%s fails it', async (_label, anchor, written, element) => {
    expect(await rejected(exported().replace(anchor, written))).toEqual([
      expect.stringContaining(`Element '${ns(element)}': `),
    ])
  })

  test('the stamp of an export document carries its total with its decimals, which only Exportaciones admits', async () => {
    const decimals = issue({
      ...base,
      ...exportBase,
      type: 110,
      folio: 98,
      items: [{ name: 'Asesoría', amount: 1234.5678 }],
      transport: { customs: { transportRoute: 4, receiverCountry: 225 } },
      options: { serviceIndicator: 4 },
    }).xml
    expect(decimals).toContain('<MntTotal>1234.5678</MntTotal>')
    expect(decimals).toContain('<MNT>1234.5678</MNT>')
    expect(await validateAgainstXsd(decimals, 'DTE')).toEqual([])
    const invoice = issue({ ...base, type: 33, folio: 93, items: [{ name: 'Plan anual', unitPrice: 100000 }] }).xml
    const errors = await validateAgainstXsd(
      invoice
        .replace('<MntTotal>119000</MntTotal>', '<MntTotal>119000.5</MntTotal>')
        .replace('<MNT>119000</MNT>', '<MNT>119000.5</MNT>'),
      'DTE',
    )
    expect(errors).toEqual([
      expect.stringContaining(`Element '${ns('MntTotal')}': '119000.5' is not a valid value`),
      expect.stringContaining(`Element '${ns('MNT')}': '119000.5' is not a valid value`),
    ])
  })

  test('an 11th package type fails it', async () => {
    const xml = exported()
    const pack = /<TipoBultos>[\s\S]*?<\/TipoBultos>/.exec(xml)?.[0] ?? ''
    const ten = xml.replace(pack, pack.repeat(9))
    expect(await validateAgainstXsd(ten, 'DTE')).toEqual([])
    expect(await validateAgainstXsd(ten.replace(pack, pack + pack), 'DTE')).toEqual([
      expect.stringContaining(`Element '${ns('TipoBultos')}': This element is not expected.`),
    ])
  })

  test('a control character in a text written as it comes is dropped, and the document is still XML', async () => {
    // A code, the folio of a reference and the note of a payment are written as they are given.
    const xml = issue({
      ...base,
      type: 33,
      folio: 92,
      items: [{ name: 'Plan anual', unitPrice: 100000, codes: [{ type: 'INT1', value: 'L\u00011' }] }],
      references: [{ documentType: 801, folio: 'OC\u0001-1', date: '2026-11-01' }],
      options: { paymentTerms: 2, payments: [{ date: '2026-12-01', amount: 100, note: 'Cuota\u00011' }] },
    }).xml
    expect(xml).toContain('<VlrCodigo>L1</VlrCodigo>')
    expect(xml).toContain('<FolioRef>OC-1</FolioRef>')
    expect(xml).toContain('<GlosaPagos>Cuota1</GlosaPagos>')
    expect(await validateAgainstXsd(xml, 'DTE')).toEqual([])
    expect(verifyDocumentSignature(xml).valid).toBe(true)
  })

  test.each([
    ['CodAdicSucur', '<CodAdicSucur>CL-01</CodAdicSucur>', '<DirOrigen>'],
    ['IdAdicOtr', '<IdAdicOtr>DUS-1</IdAdicOtr>', '<FchRef>'],
  ])('%s on an invoice fails it: only Exportaciones declares it', async (element, written, anchor) => {
    const invoice = issue({
      ...base,
      type: 33,
      folio: 92,
      items: [{ name: 'Plan anual', unitPrice: 100000 }],
      references: [{ documentType: 801, folio: 'OC-1', date: '2026-11-01' }],
    }).xml
    expect(await validateAgainstXsd(invoice, 'DTE')).toEqual([])
    expect(await validateAgainstXsd(invoice.replace(anchor, `${written}${anchor}`), 'DTE')).toEqual([
      expect.stringContaining(`Element '${ns(element)}': This element is not expected.`),
    ])
  })
})
