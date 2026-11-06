import { createDocument, FIELD_LIMITS } from '../src/document/create'
import { fromSiiDocument, toSiiDocument } from '../src/model/codec'
import { DteError } from '../src/errors'
import type { DocumentInput } from '../src/model/document'
import { FIXED_NOW, ISSUER_RUT, RECEIVER_RUT } from './support/fixtures'

const issuer = {
  rut: ISSUER_RUT,
  businessName: 'Comercial Andina SpA',
  businessActivity: 'Servicios informáticos',
  address: 'Av. Los Aromos 1540',
  commune: 'Santiago',
  activityCode: 620200,
}
const receiver = {
  rut: RECEIVER_RUT,
  businessName: "Comercializadora 'Rapel' Ltda",
  businessActivity: 'Comercio',
  address: 'Pasaje Los Olmos 88',
  commune: 'Providencia',
}
const items = [
  { name: 'Plan anual', quantity: 1, unitPrice: 100000 },
  { name: 'Horas de consultoría', quantity: 3, unitPrice: 15000 },
]

const expectError = (fn: () => unknown, code: string, details?: Record<string, unknown>) => {
  try {
    fn()
    throw new Error('expected DteError')
  } catch (err) {
    expect(err).toBeInstanceOf(DteError)
    expect((err as DteError).code).toBe(code)
    if (details) expect((err as DteError).details).toMatchObject(details)
  }
}

describe('createDocument', () => {
  test('invoice: normalizes parties, numbers lines, computes totals and id', () => {
    const doc = createDocument({ type: 33, folio: 7, issueDate: '2026-11-15', issuer, receiver, items })
    expect(doc.id).toBe('DTE_T33F7')
    expect(doc.header.type).toBe(33)
    expect(doc.header.folio).toBe(7)
    expect(doc.header.issueDate).toBe('2026-11-15')
    expect(doc.header.issuer).toEqual({ ...issuer, city: 'Santiago' })
    expect(doc.header.receiver.businessName).toBe('Comercializadora Rapel Ltda')
    expect(doc.header.options).toEqual({})
    expect(doc.items).toEqual([
      { lineNumber: 1, name: 'Plan anual', quantity: 1, unitPrice: 100000, amount: 100000 },
      { lineNumber: 2, name: 'Horas de consultoría', quantity: 3, unitPrice: 15000, amount: 45000 },
    ])
    expect(doc.header.totals).toEqual({ netAmount: 145000, vatRate: 19, vatAmount: 27550, totalAmount: 172550 })
    expect(doc.references).toEqual([])
    expect(doc.globalAdjustments).toEqual([])
    expect(doc.subtotals).toEqual([])
    expect(doc.commissions).toEqual([])
  })

  test('issueDate defaults to today in Chile (injectable clock)', () => {
    expect(createDocument({ type: 33, folio: 1, issuer, receiver, items }, { now: FIXED_NOW }).header.issueDate).toBe(
      '2026-11-15',
    )
  })

  test('receipt without receiver uses the final consumer and IndServicio 3', () => {
    const doc = createDocument({
      type: 39,
      folio: 1,
      issuer,
      items: [{ name: 'Café', unitPrice: 1000 }],
      pricesIncludeVat: true,
    })
    expect(doc.header.receiver).toEqual({
      rut: '66666666-6',
      businessName: 'Consumidor Final',
      address: 'Sin Direccion',
      commune: 'Santiago',
    })
    expect(doc.header.options).toEqual({ serviceIndicator: 3 })
    expect(doc.header.totals).toEqual({ netAmount: 840, vatAmount: 160, totalAmount: 1000 })
  })

  test('receipt with a partial receiver keeps what was given', () => {
    const doc = createDocument({
      type: 41,
      folio: 2,
      issuer,
      receiver: { rut: RECEIVER_RUT, businessName: 'Ana' },
      items: [{ name: 'Clase', unitPrice: 5000 }],
    })
    expect(doc.header.receiver).toEqual({ rut: RECEIVER_RUT, businessName: 'Ana' })
    expect(doc.items[0].exemptIndicator).toBe(1)
    expect(doc.header.totals).toEqual({ exemptAmount: 5000, totalAmount: 5000 })
  })

  test('VAT-included prices set grossAmounts on invoices but not on receipts', () => {
    const invoice = createDocument({
      type: 33,
      folio: 1,
      issuer,
      receiver,
      items: [{ name: 'P', quantity: 2, unitPrice: 1000 }],
      pricesIncludeVat: true,
    })
    expect(invoice.header.options).toEqual({ grossAmounts: 1 })
    expect(invoice.header.totals).toEqual({ netAmount: 1681, vatRate: 19, vatAmount: 319, totalAmount: 2000 })
    const exemptOnly = createDocument({
      type: 33,
      folio: 1,
      issuer,
      receiver,
      items: [{ name: 'E', unitPrice: 500, exempt: true }],
      pricesIncludeVat: true,
    })
    expect(exemptOnly.header.options).toEqual({})
  })

  test('explicit options are kept and serviceIndicator is not overridden', () => {
    const doc = createDocument({
      type: 39,
      folio: 1,
      issuer,
      items: [{ name: 'X', unitPrice: 100 }],
      options: { serviceIndicator: 1, paymentTerms: 1 },
    })
    expect(doc.header.options).toEqual({ serviceIndicator: 1, paymentTerms: 1 })
  })

  test('references, adjustments, transport, subtotals and explicit totals', () => {
    const doc = createDocument({
      type: 61,
      folio: 9,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [{ name: 'Devolución', unitPrice: 1000 }],
      references: [{ documentType: 33, folio: 7, date: '2026-11-01', code: 1, reason: "Anula 'factura'" }],
      globalAdjustments: [{ kind: 'discount', valueType: 'percent', value: 10, description: 'Desc. global' }],
      transport: {
        licensePlate: 'ABCD12',
        carrierRut: '12.345.678-5',
        driver: { rut: RECEIVER_RUT, name: 'Juan' },
        destinationAddress: 'Bodega 1',
        destinationCommune: 'Maipú',
      },
      subtotals: [{ number: 1, totalAmount: 1000 }],
      totals: { netAmount: 1000, vatRate: 19, vatAmount: 190, totalAmount: 1190 },
    })
    expect(doc.references).toEqual([
      { lineNumber: 1, documentType: 33, folio: '7', date: '2026-11-01', code: 1, reason: 'Anula factura' },
    ])
    expect(doc.globalAdjustments).toEqual([
      { lineNumber: 1, kind: 'discount', valueType: 'percent', value: 10, description: 'Desc. global' },
    ])
    expect(doc.header.transport).toEqual({
      licensePlate: 'ABCD12',
      carrierRut: '12345678-5',
      driver: { rut: '12345678-5', name: 'Juan' },
      destinationAddress: 'Bodega 1',
      destinationCommune: 'Maipú',
    })
    expect(doc.subtotals).toEqual([{ number: 1, totalAmount: 1000 }])
    expect(doc.header.totals).toEqual({ netAmount: 1000, vatRate: 19, vatAmount: 190, totalAmount: 1190 })
  })

  test('invoices need a receiver commune; items take surcharges; references may name a RUT; transport may omit the driver', () => {
    expectError(
      () =>
        createDocument({
          type: 33,
          folio: 1,
          issuer,
          items,
          receiver: {
            rut: RECEIVER_RUT,
            businessName: 'Cliente',
            businessActivity: 'Comercio',
            address: 'Pasaje Los Olmos 88',
          },
        }),
      'MISSING_FIELD',
      { field: 'receiver.commune' },
    )
    const doc = createDocument({
      type: 33,
      folio: 2,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [{ name: 'Con recargo', quantity: 1, unitPrice: 1000, surchargePercent: 10 }],
      references: [{ documentType: 33, folio: 5, date: '2026-11-01', otherRut: '12.345.678-5' }],
      transport: { licensePlate: 'ABCD12' },
    })
    expect(doc.items[0]).toMatchObject({ surchargePercent: 10, surchargeAmount: 100, amount: 1100 })
    expect(doc.references[0]).toMatchObject({ otherRut: '12345678-5' })
    expect(doc.header.transport).toEqual({ licensePlate: 'ABCD12' })
  })

  test('settlement invoice (43) requires settledDocumentType per line and keeps commissions', () => {
    const doc = createDocument({
      type: 43,
      folio: 1,
      issuer,
      receiver,
      items: [{ name: 'Venta liquidada', unitPrice: 10000, settledDocumentType: '33' }],
      commissions: [{ kind: 'commission', description: 'Comisión 10%', rate: 10, netValue: 1000, vatValue: 190 }],
    })
    expect(doc.items[0].settledDocumentType).toBe('33')
    expect(doc.commissions).toEqual([
      { lineNumber: 1, kind: 'commission', description: 'Comisión 10%', rate: 10, netValue: 1000, vatValue: 190 },
    ])
    expectError(
      () => createDocument({ type: 43, folio: 1, issuer, receiver, items: [{ name: 'X', unitPrice: 1 }] }),
      'MISSING_FIELD',
      { field: 'items[0].settledDocumentType' },
    )
  })

  test('line with explicit amount and reference fields', () => {
    const doc = createDocument({
      type: 52,
      folio: 1,
      issuer,
      receiver,
      items: [{ name: 'Pallet', quantity: 2, unit: 'UN', amount: 0, codes: [{ type: 'INT1', value: 'P-1' }] }],
    })
    expect(doc.items[0]).toEqual({
      lineNumber: 1,
      codes: [{ type: 'INT1', value: 'P-1' }],
      name: 'Pallet',
      quantity: 2,
      unit: 'UN',
      amount: 0,
    })
    expect(doc.header.totals).toEqual({ vatRate: 19, totalAmount: 0 })
  })

  describe('validation', () => {
    test.each([
      [{ type: 99 }, 'INVALID_DOCUMENT_TYPE', { type: 99 }],
      [{ folio: 0 }, 'INVALID_FOLIO', { folio: 0 }],
      [{ folio: 1.5 }, 'INVALID_FOLIO', { folio: 1.5 }],
      [{ issueDate: '15-11-2026x' }, 'INVALID_DATE', { field: 'issueDate' }],
      [{ issuer: { ...issuer, rut: '76543210-K' } }, 'INVALID_RUT', { field: 'issuer.rut' }],
      [{ issuer: { ...issuer, businessName: '' } }, 'MISSING_FIELD', { field: 'issuer.businessName' }],
      [{ issuer: { ...issuer, businessName: 'x'.repeat(101) } }, 'FIELD_TOO_LONG', { field: 'RznSoc', maxLength: 100 }],
      [{ receiver: undefined }, 'MISSING_FIELD', { field: 'receiver' }],
      [{ receiver: { ...receiver, address: undefined } }, 'MISSING_FIELD', { field: 'receiver.address' }],
      [
        { receiver: { ...receiver, businessActivity: 'x'.repeat(41) } },
        'FIELD_TOO_LONG',
        { field: 'GiroRecep', maxLength: 40 },
      ],
      [{ items: [] }, 'MISSING_FIELD', { field: 'items' }],
      [{ items: [{ name: '', unitPrice: 1 }] }, 'MISSING_FIELD', { field: 'items[0].name' }],
      [
        { items: [{ name: 'x'.repeat(81), unitPrice: 1 }] },
        'FIELD_TOO_LONG',
        { field: 'NmbItem', maxLength: 80, length: 81 },
      ],
      [{ items: [{ name: 'ok', unitPrice: Number.NaN }] }, 'INVALID_AMOUNT', { field: 'items[0].unitPrice' }],
      [{ items: [{ name: 'ok', quantity: Infinity }] }, 'INVALID_AMOUNT', { field: 'items[0].quantity' }],
      [{ references: [{ documentType: 33, folio: 1, date: 'ayer' }] }, 'INVALID_DATE', { field: 'references[0].date' }],
      [
        { references: [{ documentType: 33, folio: 1, date: '2026-01-01', reason: 'x'.repeat(91) }] },
        'FIELD_TOO_LONG',
        { field: 'RazonRef' },
      ],
      [{ transport: { carrierRut: 'nope' } }, 'INVALID_RUT', { field: 'transport.carrierRut' }],
    ] as const)('%p → %s', (override, code, details) => {
      expectError(
        () =>
          createDocument({
            type: 33,
            folio: 1,
            issueDate: '2026-11-15',
            issuer,
            receiver,
            items,
            ...override,
          } as unknown as DocumentInput),
        code,
        details,
      )
    })
  })

  test('FIELD_LIMITS exposes the schema limits used', () => {
    expect(FIELD_LIMITS.NmbItem).toBe(80)
    expect(FIELD_LIMITS.RznSoc).toBe(100)
    expect(FIELD_LIMITS.GiroRecep).toBe(40)
    expect(FIELD_LIMITS.DscItem).toBe(1000)
  })
})

test('withholdVat withholds the whole VAT on a note that affects a purchase invoice', () => {
  const base = {
    folio: 1,
    issueDate: '2026-11-15',
    issuer: {
      rut: '76543210-3',
      businessName: 'Comercial Andina SpA',
      businessActivity: 'Software',
      address: 'Av. 1',
      commune: 'Santiago',
    },
    receiver: {
      rut: '76543210-3',
      businessName: 'Comercial Andina SpA',
      businessActivity: 'Software',
      address: 'Av. 1',
      commune: 'Santiago',
    },
    items: [{ name: 'Chatarra', quantity: 10, unitPrice: 1000, additionalTaxCodes: [15] }],
    references: [{ documentType: 46, folio: 7, date: '2026-11-15', code: 3 as const, reason: 'DEVOLUCION' }],
  }
  const withheld = createDocument({ ...base, type: 61, withholdVat: true })
  expect(withheld.header.totals).toEqual({
    netAmount: 10000,
    vatRate: 19,
    vatAmount: 1900,
    withholdings: [{ taxCode: 15, rate: 19, amount: 1900 }],
    totalAmount: 10000,
  })
  expect(createDocument({ ...base, type: 61 }).header.totals).toEqual({
    netAmount: 10000,
    vatRate: 19,
    vatAmount: 1900,
    totalAmount: 11900,
  })
  expect(createDocument({ ...base, type: 46, withholdVat: false }).header.totals.totalAmount).toBe(11900)
})

describe('the decimals of a line price', () => {
  const priced = (unitPriceDecimals: number | undefined, price: { unitPrice?: number } = { unitPrice: 1200 }) =>
    createDocument({
      type: 33,
      folio: 7,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [{ name: 'Plan anual', quantity: 2, ...price, unitPriceDecimals }],
    })

  test('the price is written with the decimals asked for, and plain without them', () => {
    expect(toSiiDocument(priced(6)).Detalle[0].PrcItem).toBe('1200.000000')
    expect(toSiiDocument(priced(0)).Detalle[0].PrcItem).toBe('1200')
    expect(toSiiDocument(priced(undefined)).Detalle[0].PrcItem).toBe(1200)
    expect(priced(6).items[0]).toMatchObject({ unitPrice: 1200, unitPriceDecimals: 6, amount: 2400 })
  })

  test('a line without a price keeps no decimals, and a text price reads back as a number', () => {
    const bare = priced(6, {})
    expect(bare.items[0].unitPriceDecimals).toBeUndefined()
    expect(toSiiDocument(bare).Detalle[0].PrcItem).toBeUndefined()
    const sii = toSiiDocument(priced(6))
    expect(fromSiiDocument(sii).items[0].unitPrice).toBe(1200)
    expect(fromSiiDocument(toSiiDocument(bare)).items[0].unitPrice).toBeUndefined()
  })

  test.each([-1, 7, 1.5, Number.NaN])('%p decimals are refused', (decimals) => {
    expectError(() => priced(decimals), 'INVALID_OPTION', { field: 'items[0].unitPriceDecimals' })
  })
})
