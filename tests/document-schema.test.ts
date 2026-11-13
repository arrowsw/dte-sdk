import type { DocumentType } from '../src/catalogs/document-types'
import type { SignedDocument } from '../src/document/sign'
import type { DocumentInput } from '../src/model/document'
import { RECEIVER_RUT } from './support/fixtures'
import { envelopeXml, issue, issuer as baseIssuer, receiver } from './support/printed-fixtures'
import { validateAgainstXsd } from './support/xsd'

// Every type dte-sdk sends in an `EnvioDTE`, with the variants it builds, run through the SII's own `DTE_v10.xsd` and
// `EnvioDTE_v10.xsd`: each signed document alone, then the documents of a type together in one signed envelope.
// What the schema rejects today is in `document-schema-gaps.test.ts`.

jest.setTimeout(60_000)

// The schema asks every issuer for at least one `Acteco`.
const issuer = { ...baseIssuer, activityCode: 620200 }
const base = { issueDate: '2026-11-15', issuer, receiver }
type Variant = Omit<DocumentInput, 'type' | 'folio' | 'issueDate' | 'issuer' | 'receiver'>

const invoiceReference = { documentType: 33, folio: 7, date: '2026-11-01' }
const setReference = { documentType: 'SET', folio: 'CASO-1', date: '2026-11-15', reason: 'Set de pruebas' } as const
const purchaseReference = { documentType: 46, folio: 7, date: '2026-11-15', code: 3, reason: 'DEVOLUCION' } as const
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
      items: [{ name: 'Venta por cuenta de terceros', unitPrice: 10000, settledDocumentType: '33' }],
      commissions: [
        { kind: 'commission', description: 'Comisión 10%', rate: 10, netValue: 1000, exemptValue: 0, vatValue: 190 },
      ],
    },
    'another charge with its net and exempt values, and a reference': {
      items: [{ name: 'Venta por cuenta de terceros', unitPrice: 100, settledDocumentType: '39' }],
      commissions: [{ kind: 'otherCharge', description: 'Flete', netValue: 10, exemptValue: 0 }],
      references: [setReference],
    },
  },
  46: {
    'withholds the VAT': {
      items: [{ name: 'Chatarra de fierro', quantity: 300, unitPrice: 1200, additionalTaxCodes: [15] }],
    },
    'without withholding': { items: [{ name: 'Chatarra de fierro', unitPrice: 1200 }], withholdVat: false },
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

  test.each([10, 11, 12])('IndTraslado %p, which Res. Ex. 144/2026 names, is not in the schema', async (code) => {
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
