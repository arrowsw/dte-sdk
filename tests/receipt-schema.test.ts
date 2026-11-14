import type { SignedDocument } from '../src/document/sign'
import type { DocumentInput } from '../src/model/document'
import { RECEIVER_RUT } from './support/fixtures'
import { envelopeXml, issue, issuer } from './support/printed-fixtures'
import { validateAgainstXsd } from './support/xsd'

// The two receipts dte-sdk sends in an `EnvioBOLETA`, with the variants it builds, run through the SII's own
// `EnvioBOLETA_v11.xsd`. That schema declares one root, the envelope, so a receipt is validated inside one: each signed
// receipt alone in a signed envelope, then the receipts of a type together in one, then both types in one.
// What the schema rejects today is in `receipt-schema-gaps.test.ts`.

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
