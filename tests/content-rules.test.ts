import type { DocumentType } from '../src/catalogs/document-types'
import { createDocument } from '../src/document/create'
import { DteError } from '../src/errors'
import { toSiiDocument } from '../src/model/codec'
import type { DocumentInput, Totals } from '../src/model/document'
import { issue, issuer, receiver } from './support/printed-fixtures'

// What the SII rejects or objects to in a document's content, caught by `createDocument` before a folio is stamped:
// the counts and the required elements of the schemas, the amounts their types admit, the SII's validations 55 to 57
// of the DTE, the sums of Formato DTE 2.5, and the validations 10, 12 and 56, which the SII answers with an objection
// and `createDocument` reports in `warnings`.

jest.setTimeout(30_000)

const base = { folio: 1, issueDate: '2026-11-15', issuer, receiver } as const
const build = (input: Omit<DocumentInput, 'folio' | 'issueDate' | 'issuer'> & Partial<DocumentInput>) =>
  createDocument({ ...base, ...input })
const invoice = (extra: Partial<DocumentInput> = {}) =>
  build({ type: 33, items: [{ name: 'Plan anual', unitPrice: 100000 }], ...extra })
const receipt = (extra: Partial<DocumentInput> = {}) =>
  build({ type: 39, receiver: undefined, items: [{ name: 'Café', quantity: 2, unitPrice: 1500 }], ...extra })
// Formato DTE 2.5, page 10: a credit note names the document it changes.
const changes = (code: 2 | 3): DocumentInput['references'] => [{ documentType: 33, folio: 1, date: '2026-11-01', code }]
const lines = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ name: `Ítem ${index + 1}`, unitPrice: 100 }))

const refusal = (work: () => unknown): { readonly code: string; readonly details: unknown } => {
  try {
    work()
  } catch (error) {
    expect(error).toBeInstanceOf(DteError)
    return { code: (error as DteError).code, details: (error as DteError).details }
  }
  throw new Error('expected a DteError')
}

describe('the lines a document admits', () => {
  test('60 on every type but a receipt, as each root of DTE_v10.xsd declares', () => {
    expect(invoice({ items: lines(60) }).items).toHaveLength(60)
    expect(refusal(() => invoice({ items: lines(61) }))).toEqual({
      code: 'INVALID_OPTION',
      details: { field: 'items' },
    })
    expect(refusal(() => build({ type: 52, items: lines(61) }))).toEqual({
      code: 'INVALID_OPTION',
      details: { field: 'items' },
    })
  })

  test('1,000 on a receipt, as EnvioBOLETA_v11.xsd declares', () => {
    expect(receipt({ items: lines(1000), pricesIncludeVat: true }).items).toHaveLength(1000)
    expect(refusal(() => receipt({ items: lines(1001), pricesIncludeVat: true }))).toEqual({
      code: 'INVALID_OPTION',
      details: { field: 'items' },
    })
  })

  // `MontoItem` is a `MontoType` in `Documento` and in a receipt, and a `ValorType` only in `Liquidacion`.
  test('a line amount is a whole number, and below zero only on a settlement invoice', () => {
    const refused = { code: 'INVALID_AMOUNT', details: { field: 'items[0].amount' } }
    expect(refusal(() => invoice({ items: [{ name: 'Lote', unitPrice: 1000, discountPercent: 150 }] }))).toEqual(
      refused,
    )
    expect(refusal(() => build({ type: 61, items: [{ name: 'Ajuste', amount: -5 }], references: changes(3) }))).toEqual(
      refused,
    )
    expect(refusal(() => invoice({ items: [{ name: 'Lote', amount: 10.5 }] }))).toEqual(refused)
    const settlement = build({
      type: 43,
      items: [
        { name: 'Venta liquidada', unitPrice: 10000, settledDocumentType: '33' },
        { name: 'Devolución', amount: -2000, settledDocumentType: '33' },
      ],
    })
    expect(settlement.items[1].amount).toBe(-2000)
    expect(settlement.header.totals).toMatchObject({ netAmount: 8000, totalAmount: 9520 })
  })
})

describe("the issuer's activity code", () => {
  const { activityCode, ...withoutCode } = issuer
  void activityCode

  test.each([33, 34, 43, 46, 52, 56, 61] as const)('a %s needs one, as Acteco is required on it', (type) => {
    expect(refusal(() => build({ type, issuer: withoutCode, items: lines(1) }))).toEqual({
      code: 'MISSING_FIELD',
      details: { field: 'issuer.activityCode' },
    })
  })

  test('a receipt needs none, and keeps the one it brings out of its XML', () => {
    expect(receipt({ issuer: withoutCode }).header.issuer.activityCode).toBeUndefined()
    const coded = receipt()
    expect(coded.header.issuer.activityCode).toBe(620200)
    expect(toSiiDocument(coded).Encabezado.Emisor).not.toHaveProperty('Acteco')
  })

  test.each([0, 1.5, -3, 1_000_000, Number.NaN])('%p is not a positive integer of at most six digits', (code) => {
    expect(refusal(() => invoice({ issuer: { ...issuer, activityCode: code } }))).toEqual({
      code: 'INVALID_OPTION',
      details: { field: 'issuer.activityCode' },
    })
  })

  test('999999 is the largest it admits', () => {
    expect(invoice({ issuer: { ...issuer, activityCode: 999_999 } }).header.issuer.activityCode).toBe(999_999)
  })
})

describe('the description of an informative subtotal', () => {
  const subtotal = { number: 1, totalAmount: 100000, lines: [1] }

  test('is required on every type but a receipt, as GlosaSTI is in DTE_v10.xsd', () => {
    const refused = { code: 'MISSING_FIELD', details: { field: 'subtotals[1].description' } }
    const named = { ...subtotal, description: 'Servicios' }
    expect(refusal(() => invoice({ subtotals: [named, subtotal] }))).toEqual(refused)
    expect(refusal(() => invoice({ subtotals: [named, { ...subtotal, description: '   ' }] }))).toEqual(refused)
  })

  test('is sanitized and held to its 40 characters', () => {
    expect(invoice({ subtotals: [{ ...subtotal, description: " Servicios 'A' " }] }).subtotals).toEqual([
      { ...subtotal, description: 'Servicios A' },
    ])
    expect(refusal(() => invoice({ subtotals: [{ ...subtotal, description: 'x'.repeat(41) }] }))).toMatchObject({
      code: 'FIELD_TOO_LONG',
      details: { field: 'GlosaSTI', maxLength: 40, length: 41 },
    })
  })

  test('is optional on a receipt, whose schema leaves GlosaSTI out when there is none', () => {
    const doc = receipt({ pricesIncludeVat: true, subtotals: [subtotal, { ...subtotal, number: 2, description: '' }] })
    expect(doc.subtotals).toEqual([subtotal, { ...subtotal, number: 2 }])
  })
})

describe('the amounts the types of the totals admit', () => {
  const totals = { netAmount: 1000, vatRate: 19, vatAmount: 190, totalAmount: 1190 }

  test.each([
    ['netAmount', -1],
    ['exemptAmount', 10.5],
    ['vatAmount', -190],
    ['depositGuarantee', -300],
    ['depositGuarantee', 0.5],
    ['totalAmount', -1190],
  ] as const)('a %s of %p is refused on an invoice', (field, amount) => {
    expect(refusal(() => invoice({ totals: { ...totals, [field]: amount } }))).toEqual({
      code: 'INVALID_AMOUNT',
      details: { field: `totals.${field}` },
    })
  })

  // Worked out, the net amount and the VAT below zero are left out, and the total keeps them.
  test('a global discount larger than the lines it applies to leaves a total below zero, which is refused', () => {
    const discount = { kind: 'discount', valueType: 'amount', value: 200000 } as const
    const items = [
      { name: 'Plan anual', unitPrice: 100000 },
      { name: 'Exento', unitPrice: 50000, exempt: true },
    ]
    expect(refusal(() => invoice({ items, globalAdjustments: [discount] }))).toEqual({
      code: 'INVALID_AMOUNT',
      details: { field: 'totals.totalAmount' },
    })
  })

  test('a settlement invoice admits a negative total, but not one with decimals', () => {
    const settled = { name: 'Venta liquidada', unitPrice: 1000, settledDocumentType: '33' }
    const commissions = [{ kind: 'commission', description: 'Comisión', netValue: 2000 }] as const
    expect(build({ type: 43, items: [settled], commissions }).header.totals.totalAmount).toBe(-1190)
    expect(refusal(() => build({ type: 43, items: [settled], totals: { ...totals, totalAmount: 1190.5 } }))).toEqual({
      code: 'INVALID_AMOUNT',
      details: { field: 'totals.totalAmount' },
    })
  })
})

// "Nuevas validaciones a la IECV, DTE y DJ 3327 y 3328", validations 55 to 57: the ones the SII runs on the DTE.
describe('the validations of an invoice and an exempt invoice', () => {
  test('55: an invoice without VAT is refused, worked out from exempt lines or given', () => {
    const refused = { code: 'MISSING_FIELD', details: { field: 'totals.vatAmount' } }
    expect(refusal(() => invoice({ items: [{ name: 'Exento', unitPrice: 1000, exempt: true }] }))).toEqual(refused)
    expect(refusal(() => invoice({ totals: { netAmount: 1000, totalAmount: 1000 } }))).toEqual(refused)
  })

  test('57: an exempt invoice whose lines add up to nothing has no exempt amount, and is refused', () => {
    expect(refusal(() => build({ type: 34, items: [{ name: 'Glosa' }] }))).toEqual({
      code: 'MISSING_FIELD',
      details: { field: 'totals.exemptAmount' },
    })
  })

  test.each([
    ['an exempt amount of zero', { exemptAmount: 0, totalAmount: 0 }, 'exemptAmount'],
    ['a net amount', { exemptAmount: 1000, netAmount: 100, totalAmount: 1100 }, 'netAmount'],
    ['a VAT', { exemptAmount: 1000, vatAmount: 19, totalAmount: 1019 }, 'vatAmount'],
  ] as const)('57: an exempt invoice with %s is refused', (_name, totals, field) => {
    expect(refusal(() => build({ type: 34, items: lines(1), totals }))).toEqual({
      code: 'INVALID_AMOUNT',
      details: { field: `totals.${field}` },
    })
  })

  test('57: a net amount and a VAT of zero are admitted on an exempt invoice', () => {
    const totals = { exemptAmount: 1000, netAmount: 0, vatAmount: 0, totalAmount: 1000 }
    expect(build({ type: 34, items: lines(1), totals }).header.totals).toEqual(totals)
  })
})

// Formato DTE 2.5, fields 124 and 126.
describe('the sums of the totals', () => {
  const mismatch = (field: string, expected: number, actual: number) => ({
    code: 'TOTAL_MISMATCH',
    details: { field, expected, actual },
  })

  test('a total that is not the net amount, the exempt amount and the VAT is refused', () => {
    const totals = { netAmount: 1000, exemptAmount: 500, vatRate: 19, vatAmount: 190, totalAmount: 1690 }
    expect(invoice({ totals }).header.totals).toEqual(totals)
    expect(refusal(() => invoice({ totals: { ...totals, totalAmount: 1700 } }))).toEqual(
      mismatch('totals.totalAmount', 1690, 1700),
    )
  })

  // Formato DTE 2.5, field 124: "Garantía por depósito de envases o embalajes" is one of the amounts added up.
  test('the deposit guarantee is added to the total', () => {
    const totals = { netAmount: 1000, vatRate: 19, vatAmount: 190, depositGuarantee: 300, totalAmount: 1490 }
    expect(invoice({ totals }).header.totals).toEqual(totals)
    expect(refusal(() => invoice({ totals: { ...totals, totalAmount: 1190 } }))).toEqual(
      mismatch('totals.totalAmount', 1490, 1190),
    )
  })

  test('the VAT withheld (code 15) and the commissions come off the total', () => {
    const withheld: Totals = {
      netAmount: 1000,
      vatRate: 19,
      vatAmount: 190,
      withholdings: [{ taxCode: 15, rate: 19, amount: 190 }],
      totalAmount: 1000,
    }
    const purchase = (totals: Totals) => build({ type: 46, items: lines(1), totals })
    expect(purchase(withheld).header.totals).toEqual(withheld)
    expect(refusal(() => purchase({ ...withheld, totalAmount: 1190 }))).toEqual(
      mismatch('totals.totalAmount', 1000, 1190),
    )
    const charged: Totals = {
      netAmount: 10000,
      vatRate: 19,
      vatAmount: 1900,
      commissions: { netValue: 1000, exemptValue: 500, vatValue: 190 },
      totalAmount: 10210,
    }
    const settlement = (totals: Totals) =>
      build({ type: 43, items: [{ name: 'Venta', unitPrice: 10000, settledDocumentType: '33' }], totals })
    expect(settlement(charged).header.totals).toEqual(charged)
    expect(refusal(() => settlement({ ...charged, totalAmount: 11900 }))).toEqual(
      mismatch('totals.totalAmount', 10210, 11900),
    )
  })

  test('with a tax code other than 15 the total is not checked, since its side of the sum is not known here', () => {
    const totals: Totals = {
      netAmount: 1000,
      vatRate: 19,
      vatAmount: 190,
      withholdings: [{ taxCode: 24, rate: 31.5, amount: 315 }],
      totalAmount: 1505,
    }
    expect(invoice({ totals }).header.totals).toEqual(totals)
  })

  test('a period amount that is not the total plus the non-billable amount is refused, on a receipt too', () => {
    const totals = { netAmount: 1000, vatRate: 19, vatAmount: 190, totalAmount: 1190, nonBillableAmount: 300 }
    expect(invoice({ totals: { ...totals, periodAmount: 1490 } }).header.totals.periodAmount).toBe(1490)
    expect(refusal(() => invoice({ totals: { ...totals, periodAmount: 1190 } }))).toEqual(
      mismatch('totals.periodAmount', 1490, 1190),
    )
    expect(
      refusal(() => receipt({ totals: { netAmount: 2521, vatAmount: 479, totalAmount: 3000, periodAmount: 3500 } })),
    ).toEqual(mismatch('totals.periodAmount', 3000, 3500))
  })

  // The discount is applied to the affected amounts, of which an exempt invoice has none, so the total is worked out
  // below the exempt amount the totals declare.
  test('a global amount discount on an exempt invoice that does not say it applies to exempt amounts is refused', () => {
    const discount = { kind: 'discount', valueType: 'amount', value: 100 } as const
    expect(
      refusal(() => build({ type: 34, items: [{ name: 'Asesoría', unitPrice: 1000 }], globalAdjustments: [discount] })),
    ).toEqual(mismatch('totals.totalAmount', 1000, 881))
    const exempt = { ...discount, exemptIndicator: 1 } as const
    expect(
      build({ type: 34, items: [{ name: 'Asesoría', unitPrice: 1000 }], globalAdjustments: [exempt] }).header.totals,
    ).toMatchObject({ exemptAmount: 900, totalAmount: 900 })
  })
})

describe('what the SII accepts with an objection', () => {
  const settled = { name: 'Venta liquidada', unitPrice: 1000, settledDocumentType: '33' }

  test('a document it does not object to carries no warnings', () => {
    expect(invoice()).not.toHaveProperty('warnings')
    expect(build({ type: 61, items: [{ name: 'Corrige texto' }], references: changes(2) })).not.toHaveProperty(
      'warnings',
    )
  })

  test('10: a settlement invoice whose total is zero', () => {
    const commissions = [{ kind: 'commission', description: 'Comisión', netValue: 1000 }] as const
    const doc = build({ type: 43, items: [settled], commissions })
    expect(doc.header.totals.totalAmount).toBe(0)
    expect(doc.warnings).toEqual([{ validation: 10, field: 'totals.totalAmount' }])
  })

  test('12: a settlement invoice or a purchase invoice whose net amount is zero', () => {
    const warning = [{ validation: 12, field: 'totals.netAmount' }]
    expect(build({ type: 43, items: [{ ...settled, exempt: true }] }).warnings).toEqual(warning)
    expect(build({ type: 46, items: [{ name: 'Exento', unitPrice: 1000, exempt: true }] }).warnings).toEqual(warning)
  })

  test('12 and 56: an invoice that declares a VAT of zero and no net amount', () => {
    const doc = invoice({
      items: [{ name: 'Exento', unitPrice: 1000, exempt: true }],
      totals: { exemptAmount: 1000, vatAmount: 0, totalAmount: 1000 },
    })
    expect(doc.warnings).toEqual([
      { validation: 12, field: 'totals.netAmount' },
      { validation: 56, field: 'totals.netAmount' },
    ])
  })

  test('10 and 12 on a settlement invoice that settles nothing, and they travel to the signed document', () => {
    const signed = issue({ ...base, type: 43, items: [{ ...settled, unitPrice: 0 }] })
    expect(signed.warnings).toEqual([
      { validation: 10, field: 'totals.totalAmount' },
      { validation: 12, field: 'totals.netAmount' },
    ])
    expect(signed.xml).not.toContain('warning')
  })
})

describe('the net amounts indicator of a receipt', () => {
  const indicator = (doc: ReturnType<typeof createDocument>) => doc.header.options.netAmountsIndicator

  test('a receipt (39) issued without pricesIncludeVat says its lines are net, as IndMntNeto 2', () => {
    const doc = receipt()
    expect(indicator(doc)).toBe(2)
    expect(doc.header.totals).toEqual({ netAmount: 3000, vatAmount: 570, totalAmount: 3570 })
    expect(toSiiDocument(doc).Encabezado.IdDoc).toMatchObject({ IndMntNeto: 2 })
  })

  test.each<[string, Partial<DocumentInput>, DocumentType]>([
    ['prices that include VAT', { pricesIncludeVat: true }, 39],
    ['only exempt lines', { items: [{ name: 'Libro', unitPrice: 9000, exemptIndicator: 1 }] }, 39],
    ['an exempt receipt', {}, 41],
  ])('a receipt with %s does not', (_name, extra, type) => {
    expect(indicator(receipt({ type, ...extra }))).toBeUndefined()
  })

  test('an invoice never carries it', () => {
    expect(indicator(invoice())).toBeUndefined()
  })
})
