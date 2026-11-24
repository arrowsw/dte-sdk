import { createDocument, FIELD_LIMITS } from '../src/document/create'
import { fromSiiDocument, toSiiDocument } from '../src/model/codec'
import { DteError } from '../src/errors'
import { calculateLineAmount } from '../src/totals/calculate'
import type { Currency } from '../src/catalogs/codes'
import { FOREIGN_RECEIVER_RUT } from '../src/catalogs/codes'
import type { DocumentInput, LineItemInput } from '../src/model/document'
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
      type: 34,
      folio: 1,
      issuer,
      receiver,
      items: [{ name: 'E', unitPrice: 500 }],
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
      options: { serviceIndicator: 1, dueDate: '2026-12-01' },
    })
    // Its lines are net, so it says so.
    expect(doc.header.options).toEqual({ serviceIndicator: 1, dueDate: '2026-12-01', netAmountsIndicator: 2 })
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
      subtotals: [{ number: 1, description: 'Devoluciones', totalAmount: 1000 }],
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
    expect(doc.subtotals).toEqual([{ number: 1, description: 'Devoluciones', totalAmount: 1000 }])
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
      {
        lineNumber: 1,
        kind: 'commission',
        description: 'Comisión 10%',
        rate: 10,
        netValue: 1000,
        exemptValue: 0,
        vatValue: 190,
      },
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
    expect(FIELD_LIMITS.PatenteCarro).toBe(8)
  })
})

describe('the transport fields of 2026', () => {
  const guide = (transport: DocumentInput['transport'], options?: DocumentInput['options']) =>
    createDocument({
      type: 52,
      folio: 1,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items,
      options: { transferType: 1, ...options },
      transport,
    })

  test('a guide keeps the trailer plate, the departure date and time and the arrival date', () => {
    const doc = guide({
      licensePlate: 'ABCD12',
      trailerLicensePlate: 'JK1234',
      departureDate: '2026-11-15',
      departureTime: '08:30:00',
      arrivalDate: '2026-11-16',
    })
    expect(doc.header.transport).toEqual({
      licensePlate: 'ABCD12',
      trailerLicensePlate: 'JK1234',
      departureDate: '2026-11-15',
      departureTime: '08:30:00',
      arrivalDate: '2026-11-16',
    })
  })

  test('dates take the day first, a time without seconds gets them, and the plate is sanitized', () => {
    const doc = guide({
      trailerLicensePlate: ' jk-1234 ',
      departureDate: '15-11-2026',
      departureTime: '23:59',
      arrivalDate: '17/11/2026',
    })
    expect(doc.header.transport).toEqual({
      trailerLicensePlate: 'jk-1234',
      departureDate: '2026-11-15',
      departureTime: '23:59:00',
      arrivalDate: '2026-11-17',
    })
  })

  test('none of the four is required, as the schema declares them', () => {
    expect(guide({ licensePlate: 'ABCD12' }).header.transport).toEqual({ licensePlate: 'ABCD12' })
    expect(guide(undefined).header.transport).toBeUndefined()
  })

  test.each([
    [{ trailerLicensePlate: 'ABCDE1234' }, 'FIELD_TOO_LONG', { field: 'PatenteCarro', maxLength: 8, length: 9 }],
    [{ departureDate: 'mañana' }, 'INVALID_DATE', { field: 'transport.departureDate' }],
    [{ departureDate: '2026-02-30' }, 'INVALID_DATE', { field: 'transport.departureDate' }],
    [{ departureDate: '2003-03-31' }, 'INVALID_DATE', { field: 'transport.departureDate' }],
    [{ arrivalDate: '2051-01-01' }, 'INVALID_DATE', { field: 'transport.arrivalDate' }],
    [{ departureTime: '24:00:00' }, 'INVALID_TIME', { field: 'transport.departureTime' }],
    [{ departureTime: '12:60' }, 'INVALID_TIME', { field: 'transport.departureTime' }],
    [{ departureTime: '12:00:60' }, 'INVALID_TIME', { field: 'transport.departureTime' }],
    [{ departureTime: '9:30' }, 'INVALID_TIME', { field: 'transport.departureTime' }],
    [{ departureTime: '09:30:00Z' }, 'INVALID_TIME', { field: 'transport.departureTime' }],
    [{ departureTime: '' }, 'INVALID_TIME', { field: 'transport.departureTime' }],
  ] as const)('%p → %s', (transport, code, details) => {
    expectError(() => guide(transport), code, details)
  })

  test('the schema bounds both dates from 2003-04-01 to 2050-12-31', () => {
    expect(guide({ departureDate: '2003-04-01', arrivalDate: '2050-12-31' }).header.transport).toEqual({
      departureDate: '2003-04-01',
      arrivalDate: '2050-12-31',
    })
  })

  test.each([0, 10, 11, 12, '1', 1.5, Number.NaN, null])(
    'transfer type %p is outside the 1 to 9 the schema admits',
    (transferType) => {
      expectError(
        () => guide({ licensePlate: 'ABCD12' }, { transferType } as unknown as DocumentInput['options']),
        'INVALID_OPTION',
        { field: 'options.transferType' },
      )
    },
  )

  test('transfer types 1 and 9 are the bounds the schema admits', () => {
    expect(guide({ licensePlate: 'ABCD12' }, { transferType: 1 }).header.options.transferType).toBe(1)
    expect(guide({ licensePlate: 'ABCD12' }, { transferType: 9 }).header.options.transferType).toBe(9)
  })

  test('a time is trimmed, and runs from 00:00 to 23:59:59', () => {
    expect(guide({ departureTime: ' 08:30 ' }).header.transport).toEqual({ departureTime: '08:30:00' })
    expect(guide({ departureTime: '00:00' }).header.transport).toEqual({ departureTime: '00:00:00' })
    expect(guide({ departureTime: '23:59:59' }).header.transport).toEqual({ departureTime: '23:59:59' })
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
      activityCode: 620200,
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

// Formato DTE 2.5, field 117: the withheld amount is the rate by the sum of the lines that carry the code of the
// withholding. A document that withholds the whole VAT and whose lines carry no code states a withholding over nothing.
describe('the lines of a document that withholds the whole VAT', () => {
  const purchase = (items: DocumentInput['items'], extra: Partial<DocumentInput> = {}) =>
    createDocument({ type: 46, folio: 7, issueDate: '2026-11-15', issuer, receiver, items, ...extra })
  const codes = (doc: ReturnType<typeof createDocument>) => doc.items.map((item) => item.additionalTaxCodes)

  test('each VAT-affected line of a purchase invoice carries code 15, and an exempt or non-billable one does not', () => {
    const doc = purchase([
      { name: 'Chatarra', quantity: 2, unitPrice: 1000 },
      { name: 'Flete', unitPrice: 500, exempt: true },
      { name: 'Envase', unitPrice: 300, exemptIndicator: 2 },
    ])
    expect(codes(doc)).toEqual([[15], undefined, undefined])
    expect(doc.header.totals.withholdings).toEqual([{ taxCode: 15, rate: 19, amount: 380 }])
    expect(toSiiDocument(doc).Detalle.map((line) => line.CodImpAdic)).toEqual([[15], undefined, undefined])
  })

  test('a note that withholds the VAT of a purchase invoice carries the code too', () => {
    const note = purchase([{ name: 'Chatarra', quantity: 2, unitPrice: 1000 }], {
      type: 61,
      withholdVat: true,
      references: [{ documentType: 46, folio: 7, date: '2026-11-15', code: 3, reason: 'DEVOLUCION' }],
    })
    expect(codes(note)).toEqual([[15]])
  })

  test('a line that brings its own codes keeps them, an empty list included', () => {
    const doc = purchase([
      { name: 'Chatarra', unitPrice: 1000, additionalTaxCodes: [15] },
      { name: 'Carne', unitPrice: 1000, additionalTaxCodes: [17] },
      { name: 'Otro', unitPrice: 1000, additionalTaxCodes: [] },
    ])
    expect(codes(doc)).toEqual([[15], [17], []])
  })

  test('without a withholding no line gets the code', () => {
    expect(codes(purchase([{ name: 'Chatarra', unitPrice: 1000 }], { withholdVat: false }))).toEqual([undefined])
    expect(codes(purchase([{ name: 'Flete', unitPrice: 500, exempt: true }]))).toEqual([undefined])
    expect(codes(purchase([{ name: 'Chatarra', unitPrice: 1000 }], { type: 33 }))).toEqual([undefined])
  })

  test('totals given by the caller leave the lines as they came', () => {
    const totals = { netAmount: 1000, vatRate: 19, vatAmount: 190, totalAmount: 1190 }
    expect(codes(purchase([{ name: 'Chatarra', unitPrice: 1000 }], { totals }))).toEqual([undefined])
  })
})

describe('the line of a withholding agent', () => {
  const purchase = (items: DocumentInput['items'], type: DocumentInput['type'] = 46) =>
    createDocument({ type, folio: 7, issueDate: '2026-11-15', issuer, receiver, items })

  test('an empty mark writes the indicator alone, between the exemption and the name', () => {
    const doc = purchase([{ name: 'Chatarra', quantity: 2, unitPrice: 1000, withholdingAgent: {} }])
    expect(doc.items[0].withholdingAgent).toEqual({})
    const line = toSiiDocument(doc).Detalle[0]
    expect(line.Retenedor).toEqual({ IndAgente: 'R' })
    expect(Object.keys(line).slice(0, 3)).toEqual(['NroLinDet', 'Retenedor', 'NmbItem'])
    expect(fromSiiDocument(toSiiDocument(doc))).toEqual(doc)
  })

  test('the bases it declares travel with it, zero included, in the order of the schema', () => {
    const withholdingAgent = { finalConsumerPrice: 2500, slaughterBase: 0, marginBase: 150 }
    const doc = purchase(
      [
        { name: 'Flete', unitPrice: 500 },
        { name: 'Carne', unitPrice: 1000, exempt: true, withholdingAgent },
      ],
      33,
    )
    expect(doc.items[1].withholdingAgent).toEqual({ slaughterBase: 0, marginBase: 150, finalConsumerPrice: 2500 })
    const line = toSiiDocument(doc).Detalle[1]
    expect(line.Retenedor).toEqual({ IndAgente: 'R', MntBaseFaena: 0, MntMargComer: 150, PrcConsFinal: 2500 })
    expect(Object.keys(line.Retenedor!)).toEqual(['IndAgente', 'MntBaseFaena', 'MntMargComer', 'PrcConsFinal'])
    expect(Object.keys(line).slice(0, 4)).toEqual(['NroLinDet', 'IndExe', 'Retenedor', 'NmbItem'])
    expect(fromSiiDocument(toSiiDocument(doc))).toEqual(doc)
  })

  test('a line without the mark has no such element', () => {
    const doc = purchase([{ name: 'Chatarra', unitPrice: 1000 }])
    expect(doc.items[0]).not.toHaveProperty('withholdingAgent')
    expect(toSiiDocument(doc).Detalle[0]).not.toHaveProperty('Retenedor')
  })

  test.each([
    ['slaughterBase', -1],
    ['marginBase', 10.5],
    ['finalConsumerPrice', Number.NaN],
  ])('%s is a whole amount from zero up', (field, value) => {
    expectError(
      () => purchase([{ name: 'Carne', unitPrice: 1000, withholdingAgent: { [field]: value } }]),
      'INVALID_AMOUNT',
      { field: `items[0].withholdingAgent.${field}` },
    )
  })
})

describe('the decimals of a line price', () => {
  const priced = (
    unitPriceDecimals: number | undefined,
    price: { unitPrice?: number; amount?: number } = { unitPrice: 1200 },
  ) =>
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
    const bare = priced(6, { amount: 2400 })
    expect(bare.items[0].unitPriceDecimals).toBeUndefined()
    expect(toSiiDocument(bare).Detalle[0].PrcItem).toBeUndefined()
    const sii = toSiiDocument(priced(6))
    expect(fromSiiDocument(sii).items[0].unitPrice).toBe(1200)
    expect(fromSiiDocument(toSiiDocument(bare)).items[0].unitPrice).toBeUndefined()
  })

  test.each([-1, 7, 1.5, Number.NaN])('%p decimals are refused', (decimals) => {
    expectError(() => priced(decimals), 'INVALID_OPTION', { field: 'items[0].unitPriceDecimals' })
  })

  // With fewer decimals than the price has, `PrcItem` would be another price than the one the amount is worked out
  // with: 1.005 with two is 1.00 or 1.01, either of which by 1 000 is not 1 005, and 0.4 with none is zero.
  test.each([
    [1.005, 2],
    [0.4, 0],
    [1000.5, 0],
    [1 / 3, 5],
  ])('a price of %p with %p decimals is refused', (unitPrice, decimals) => {
    expectError(() => priced(decimals, { unitPrice }), 'INVALID_OPTION', { field: 'items[0].unitPriceDecimals' })
  })

  // `toFixed` writes the binary value of a number: 84301134689.0647 with six decimals would be 84301134689.064697.
  test('the price is written over its decimal digits, padded with the zeros asked for', () => {
    expect(toSiiDocument(priced(3, { unitPrice: 1.005 })).Detalle[0].PrcItem).toBe('1.005')
    expect(toSiiDocument(priced(4, { unitPrice: 1.005 })).Detalle[0].PrcItem).toBe('1.0050')
    expect(toSiiDocument(priced(6, { unitPrice: 84301134689.0647 })).Detalle[0].PrcItem).toBe('84301134689.064700')
  })
})

// `DTE_v10.xsd` and `EnvioBOLETA_v11.xsd` give `QtyItem`, `PrcItem`, `QtyRef` and `PrcRef` twelve digits and six
// decimals, and `DescuentoPct`, `RecargoPct`, `TasaComision` and `ValorDR` two decimals. A number with more decimals,
// which plain arithmetic gives (0.1 + 0.2), fails the schema and with it the whole envelope.
describe('the decimals the schema admits', () => {
  const line = (item: DocumentInput['items'][number], extra: Partial<DocumentInput> = {}) =>
    createDocument({ type: 33, folio: 7, issueDate: '2026-11-15', issuer, receiver, items: [item], ...extra })

  test('a quantity and a price are rounded to six decimals, and the amount is worked out from what is written', () => {
    const doc = line({ name: 'Granel', quantity: 1 / 3, unitPrice: 100 / 3 })
    expect(doc.items[0]).toMatchObject({ quantity: 0.333333, unitPrice: 33.333333, amount: 11 })
    expect(toSiiDocument(doc).Detalle[0]).toMatchObject({ QtyItem: 0.333333, PrcItem: 33.333333, MontoItem: 11 })
    expect(line({ name: 'Granel', quantity: 0.1 + 0.2, unitPrice: 1000 }).items[0]).toMatchObject({
      quantity: 0.3,
      amount: 300,
    })
    // 1.0000004 × 3 000 000 is 3 000 001.2, but the quantity is written as 1: the amount is the one of what is
    // written, so the SII, which multiplies `QtyItem` by `PrcItem`, finds the same number.
    expect(line({ name: 'Granel', quantity: 1.0000004, unitPrice: 3_000_000 }).items[0]).toMatchObject({
      quantity: 1,
      amount: 3_000_000,
    })
  })

  test('QtyRef and PrcRef are rounded to six decimals', () => {
    const doc = line({ name: 'Caja', quantity: 1, unitPrice: 1000, referenceQuantity: 2 / 3, referencePrice: 1000 / 7 })
    expect(doc.items[0]).toMatchObject({ referenceQuantity: 0.666667, referencePrice: 142.857143 })
  })

  test('a discount and a surcharge percent are rounded to two decimals, and their amounts follow', () => {
    const discounted = line({ name: 'Lote', quantity: 3, unitPrice: 1_000_000, discountPercent: 100 / 3 })
    expect(discounted.items[0]).toMatchObject({ discountPercent: 33.33, discountAmount: 999_900, amount: 2_000_100 })
    const surcharged = line({ name: 'Lote', quantity: 3, unitPrice: 1_000_000, surchargePercent: 100 / 3 })
    expect(surcharged.items[0]).toMatchObject({ surchargePercent: 33.33, surchargeAmount: 999_900, amount: 3_999_900 })
  })

  test('the value of a global adjustment and the rate of a commission are rounded to two decimals', () => {
    const doc = line(
      { name: 'Lote', quantity: 3, unitPrice: 1_000_000 },
      {
        globalAdjustments: [{ kind: 'discount', valueType: 'percent', value: 100 / 3 }],
        commissions: [{ kind: 'commission', description: 'Comisión', rate: 10 / 3, netValue: 1000 }],
      },
    )
    expect(doc.globalAdjustments[0].value).toBe(33.33)
    expect(doc.commissions[0].rate).toBe(3.33)
    // 3 000 000 less 33.33 %.
    expect(doc.header.totals.netAmount).toBe(2_000_100)
  })

  test.each([
    ['quantity', { quantity: 1e12, unitPrice: 1 }],
    ['unitPrice', { quantity: 1, unitPrice: 1e12 }],
    ['referenceQuantity', { quantity: 1, unitPrice: 1, referenceQuantity: 1e12 }],
    ['referencePrice', { quantity: 1, unitPrice: 1, referencePrice: 1e12 }],
    ['discountPercent', { quantity: 1, unitPrice: 1, discountPercent: 1000 }],
    ['surchargePercent', { quantity: 1, unitPrice: 1, surchargePercent: 1000 }],
  ])('a %s with more digits than its type holds is refused', (field, item) => {
    expectError(() => line({ name: 'Lote', ...item }), 'INVALID_AMOUNT', { field: `items[0].${field}` })
  })

  // From 10^21 up a number has no decimal digits to round, and what is not a finite number has none at all: either is
  // refused on its field before it is rounded.
  test.each([1e21, -1e21, Number.POSITIVE_INFINITY, Number.NaN, '5'])('a quantity of %p is refused', (quantity) => {
    expectError(() => line({ name: 'Lote', quantity: quantity as number, unitPrice: 1 }), 'INVALID_AMOUNT', {
      field: 'items[0].quantity',
    })
  })

  test('so is a global adjustment value of 10^21', () => {
    const adjusted = { globalAdjustments: [{ kind: 'discount', valueType: 'amount', value: 1e21 }] } as const
    expectError(() => line({ name: 'Lote', unitPrice: 1 }, adjusted), 'INVALID_AMOUNT', {
      field: 'globalAdjustments[0].value',
    })
  })

  // A discount of 999.99 % leaves the line below zero, which `MontoItem` does not admit: the surcharge, of the same
  // type, takes the largest percentage.
  test('the largest values the schema admits pass', () => {
    const doc = line({ name: 'Lote', quantity: 999_999_999_999.999, unitPrice: 0.000001, surchargePercent: 999.99 })
    expect(doc.items[0]).toMatchObject({ quantity: 999_999_999_999.999, unitPrice: 0.000001, surchargePercent: 999.99 })
  })

  test('a global adjustment value and a commission rate out of range are refused', () => {
    const adjusted = { globalAdjustments: [{ kind: 'discount', valueType: 'amount', value: 1e16 }] } as const
    expectError(() => line({ name: 'Lote', unitPrice: 1 }, adjusted), 'INVALID_AMOUNT', {
      field: 'globalAdjustments[0].value',
    })
    const charged = { commissions: [{ kind: 'commission', description: 'Comisión', rate: 1000, netValue: 1 }] } as const
    expectError(() => line({ name: 'Lote', unitPrice: 1 }, charged), 'INVALID_AMOUNT', {
      field: 'commissions[0].rate',
    })
  })
})

// Formato DTE 2.5, fields 30 and 34 of the detail: "Si va el descuento en %, debe ir el monto correspondiente", and the
// same of a surcharge. `DescuentoMonto` and `RecargoMonto` are `MntImpType` in `DTE_v10.xsd`, a positive integer, so a
// percent whose share of the line rounds to no peso has no amount to go with it. The receipts schema takes an amount of
// zero, and a receipt follows the same rule all the same.
describe('a line percent goes with its amount', () => {
  const line = (item: LineItemInput, type: 33 | 34 | 52 = 33) =>
    createDocument({ type, folio: 7, issueDate: '2026-11-15', issuer, receiver, items: [item] })
  const receipt = (item: LineItemInput, type: 39 | 41 = 39) =>
    createDocument({ type, folio: 1, issueDate: '2026-11-15', issuer, items: [item], pricesIncludeVat: type === 39 })

  test.each<[string, LineItemInput, string]>([
    ['a discount', { name: 'Clip', quantity: 1, unitPrice: 49, discountPercent: 1 }, 'discountPercent'],
    ['a surcharge', { name: 'Clip', quantity: 1, unitPrice: 49, surchargePercent: 1 }, 'surchargePercent'],
    [
      'a discount on a line with an amount and no price',
      { name: 'Ajuste', amount: 100, discountPercent: 5 },
      'discountPercent',
    ],
    [
      'a surcharge on a line priced at zero',
      { name: 'Regalo', quantity: 1, unitPrice: 0, surchargePercent: 10 },
      'surchargePercent',
    ],
  ])('%s in percent whose amount rounds to no peso is refused', (_label, item, field) => {
    // 1 % of 49 is 0.49, which rounds to 0.
    expectError(() => line(item), 'INVALID_AMOUNT', { field: `items[0].${field}` })
  })

  test.each([34, 52] as const)('the same line is refused on a %s', (type) => {
    const item = { name: 'Clip', quantity: 1, unitPrice: 49, discountPercent: 1 }
    expectError(() => line(item, type), 'INVALID_AMOUNT', { field: 'items[0].discountPercent' })
  })

  test.each([39, 41] as const)('and on a receipt (%s)', (type) => {
    const item = { name: 'Clip', quantity: 1, unitPrice: 49, surchargePercent: 1 }
    expectError(() => receipt(item, type), 'INVALID_AMOUNT', { field: 'items[0].surchargePercent' })
  })

  // `PctType` starts at 0.01 in `SiiTypes_v10.xsd`, so `<DescuentoPct>0</DescuentoPct>` fails the schema.
  test.each([33, 34, 52] as const)('a percent of zero is left out of a %s: it is no discount or surcharge', (type) => {
    const doc = line({ name: 'Clip', quantity: 1, unitPrice: 49, discountPercent: 0, surchargePercent: -0 }, type)
    expect(doc.items[0]).not.toHaveProperty('discountPercent')
    expect(doc.items[0]).not.toHaveProperty('surchargePercent')
    expect(doc.items[0].amount).toBe(49)
    expect(toSiiDocument(doc).Detalle[0]).not.toHaveProperty('DescuentoPct')
  })

  test.each([39, 41] as const)('and of a receipt (%s)', (type) => {
    const doc = receipt({ name: 'Clip', quantity: 1, unitPrice: 49, discountPercent: 0 }, type)
    expect(doc.items[0]).not.toHaveProperty('discountPercent')
  })

  test.each<[string, LineItemInput, string]>([
    ['a negative discount', { name: 'Clip', quantity: 1, unitPrice: 1000, discountPercent: -5 }, 'discountPercent'],
    ['a negative surcharge', { name: 'Clip', quantity: 1, unitPrice: 1000, surchargePercent: -5 }, 'surchargePercent'],
    // 0.004 is written to two decimals as 0: a percent asked for with no share of the line.
    [
      'a discount its two decimals bring to zero',
      { name: 'Clip', unitPrice: 1e6, discountPercent: 0.004 },
      'discountPercent',
    ],
    [
      'a negative one they bring to zero',
      { name: 'Clip', unitPrice: 1e6, surchargePercent: -0.004 },
      'surchargePercent',
    ],
  ])('%s is refused', (_label, item, field) => {
    expectError(() => line(item), 'INVALID_AMOUNT', { field: `items[0].${field}` })
  })

  test('a percent whose amount rounds to one peso is written with it', () => {
    // 1 % of 50 is 0.5, which rounds half away from zero to 1.
    const doc = line({ name: 'Clip', quantity: 1, unitPrice: 50, discountPercent: 1, surchargePercent: 1 })
    expect(doc.items[0]).toMatchObject({ discountAmount: 1, surchargeAmount: 1, amount: 50 })
    expect(toSiiDocument(doc).Detalle[0]).toMatchObject({
      DescuentoPct: 1,
      DescuentoMonto: 1,
      RecargoPct: 1,
      RecargoMonto: 1,
    })
  })

  // 9.2 % of 375 is 34.5, which binary floating point works out as 34.49999999999999; 0.145 by 100 is 14.5, which it
  // works out as 14.499999999999998.
  test('a share and a base that are a half in decimal digits round half away from zero', () => {
    const discounted = line({ name: 'Clip', quantity: 1, unitPrice: 375, discountPercent: 9.2 })
    expect(discounted.items[0]).toMatchObject({ discountAmount: 35, amount: 340 })
    expect(toSiiDocument(discounted).Detalle[0]).toMatchObject({ DescuentoMonto: 35, MontoItem: 340 })
    const weighed = line({ name: 'Granel', quantity: 0.145, unitPrice: 100 })
    expect(weighed.items[0].amount).toBe(15)
  })

  // 1.005 is 1.00499999999999989… in binary floating point, 0.015 is 0.01499999999999999… and 1.0000015 is
  // 1.00000149999999…: each is a half past the decimals its schema type holds in decimal digits, and a hair below it
  // in binary. Each is written rounded half away from zero, and the line is worked out with what is written.
  test.each<[string, LineItemInput, Record<string, number>]>([
    [
      'a discount percent',
      { name: 'Clip', unitPrice: 10000, discountPercent: 1.005 },
      { discountPercent: 1.01, discountAmount: 101, amount: 9899 },
    ],
    [
      'a surcharge percent',
      { name: 'Clip', unitPrice: 10000, surchargePercent: 0.015 },
      { surchargePercent: 0.02, surchargeAmount: 2, amount: 10002 },
    ],
    [
      'a quantity',
      { name: 'Granel', quantity: 1.0000015, unitPrice: 1000000 },
      { quantity: 1.000002, amount: 1000002 },
    ],
  ])(
    '%s a half past its decimals is written rounded half away from zero, with its amounts',
    (_label, item, written) => {
      const [first] = line(item).items
      expect(first).toMatchObject(written)
      const computed = calculateLineAmount(item)
      expect([first.discountAmount ?? 0, first.surchargeAmount ?? 0, first.amount]).toEqual([
        computed.discountAmount,
        computed.surchargeAmount,
        computed.amount,
      ])
    },
  )

  test('and so is a percent on a receipt line with a price', () => {
    const doc = receipt({ name: 'Café', quantity: 1, unitPrice: 10000, discountPercent: 1.005 })
    expect(doc.items[0]).toMatchObject({ discountPercent: 1.01, discountAmount: 101, amount: 9899 })
    expect(toSiiDocument(doc).Detalle[0]).toMatchObject({ DescuentoPct: 1.01, DescuentoMonto: 101, MontoItem: 9899 })
  })

  // `EnvioBOLETA_v11.xsd` restricts a receipt's `DescuentoPct` and `RecargoPct` to 100.00 at most, where the
  // `PctType` of `DTE_v10.xsd` goes up to 999.99.
  test.each<[39 | 41, keyof LineItemInput]>([
    [39, 'surchargePercent'],
    [41, 'surchargePercent'],
    [39, 'discountPercent'],
    [41, 'discountPercent'],
  ])('a receipt (%s) refuses a %s above 100', (type, field) => {
    expectError(
      () => receipt({ name: 'Café', quantity: 1, unitPrice: 1500, [field]: 100.01 }, type),
      'INVALID_AMOUNT',
      {
        field: `items[0].${field}`,
      },
    )
  })

  // The cap is on the percent as it is written, with two decimals: 100.004 is written 100, and 100.005, a hair below
  // its half in binary, is written 100.01.
  test('a receipt takes a percent its two decimals write as 100, and refuses one they write above it', () => {
    const doc = receipt({ name: 'Café', quantity: 1, unitPrice: 1500, discountPercent: 100.004 })
    expect(doc.items[0]).toMatchObject({ discountPercent: 100, discountAmount: 1500, amount: 0 })
    expectError(
      () => receipt({ name: 'Café', quantity: 1, unitPrice: 1500, discountPercent: 100.005 }),
      'INVALID_AMOUNT',
      { field: 'items[0].discountPercent' },
    )
  })

  // `PctType` stops at 999.99: 999.995 is below it, and its two decimals write it 1000.
  test('a percent its two decimals write past 999.99 is refused', () => {
    expectError(
      () => line({ name: 'Café', quantity: 1, unitPrice: 1500, surchargePercent: 999.995 }),
      'INVALID_AMOUNT',
      { field: 'items[0].surchargePercent' },
    )
    const doc = line({ name: 'Café', quantity: 1, unitPrice: 1500, surchargePercent: 999.994 })
    expect(doc.items[0]).toMatchObject({ surchargePercent: 999.99 })
  })

  test('a receipt takes a percent of 100, and any other type one above it', () => {
    const doc = receipt({ name: 'Café', quantity: 1, unitPrice: 1500, surchargePercent: 100 })
    expect(doc.items[0]).toMatchObject({ surchargePercent: 100, surchargeAmount: 1500, amount: 3000 })
    const invoice = line({ name: 'Café', quantity: 1, unitPrice: 1500, surchargePercent: 150 })
    expect(invoice.items[0]).toMatchObject({ surchargePercent: 150, surchargeAmount: 2250, amount: 3750 })
  })
})

// Formato DTE 2.5, field 38 of the detail: `MontoItem` is "(Precio Unitario * Cantidad) – Monto Descuento + Monto
// Recargo". It must be zero on a line that is not a sale (`IndExe` 4 or 5) and on a credit note that corrects a text,
// may be zero on a dispatch guide that is not a sale, and may be negative on a settlement invoice.
describe('a given amount on a priced line', () => {
  const line = (item: LineItemInput, type: DocumentInput['type'] = 33, options?: DocumentInput['options']) =>
    createDocument({ type, folio: 7, issueDate: '2026-11-15', issuer, receiver, items: [item], options })

  test.each<[string, LineItemInput, number]>([
    ['a discount', { name: 'Clip', unitPrice: 1000, amount: 100, discountPercent: 10 }, 900],
    ['a surcharge', { name: 'Clip', unitPrice: 1000, amount: 1000, surchargePercent: 10 }, 1100],
    ['a quantity', { name: 'Clip', quantity: 2, unitPrice: 1000, amount: 1500 }, 2000],
    ['a zero next to a percent', { name: 'Clip', unitPrice: 1000, amount: 0, discountPercent: 10 }, 900],
    ['a zero and no percent', { name: 'Clip', unitPrice: 1000, amount: 0 }, 1000],
  ])('that does not add up with %s is refused', (_label, item, expected) => {
    expectError(() => line(item), 'TOTAL_MISMATCH', { field: 'items[0].amount', expected, actual: item.amount })
  })

  test('one that adds up is taken, as if it were not given', () => {
    const item = { name: 'Clip', quantity: 2, unitPrice: 1000, discountPercent: 10 }
    expect(line({ ...item, amount: 1800 }).items).toEqual(line(item).items)
  })

  test.each<[string, DocumentInput['options']]>([
    ['with no transfer type', undefined],
    ['whose transfer is a sale', { transferType: 1 }],
  ])('a zero is refused on a guide %s', (_label, options) => {
    expectError(
      () => line({ name: 'Pallet', quantity: 3, unitPrice: 1000, amount: 0 }, 52, options),
      'TOTAL_MISMATCH',
      {
        field: 'items[0].amount',
        expected: 3000,
        actual: 0,
      },
    )
  })

  test.each([2, 5, 6, 9] as const)('a zero is taken on a guide whose transfer is not a sale (%s)', (transferType) => {
    const guide = line({ name: 'Pallet', quantity: 3, unitPrice: 1000, amount: 0 }, 52, { transferType })
    expect(guide.items[0]).toMatchObject({ quantity: 3, unitPrice: 1000, amount: 0 })
    expect(toSiiDocument(guide).Detalle[0]).toMatchObject({ PrcItem: 1000, MontoItem: 0 })
    expect(line({ name: 'Pallet', quantity: 3, unitPrice: 1000 }, 52, { transferType }).items[0].amount).toBe(3000)
  })

  test('but not next to a percent, whose discount would add up with nothing', () => {
    const item = { name: 'Pallet', quantity: 3, unitPrice: 1000, amount: 0, discountPercent: 10 }
    expectError(() => line(item, 52, { transferType: 5 }), 'TOTAL_MISMATCH', { expected: 2700, actual: 0 })
  })

  test('a line with no price takes its amount as it comes', () => {
    expect(line({ name: 'Glosa', quantity: 2, amount: 1500 }).items[0]).toMatchObject({ quantity: 2, amount: 1500 })
  })

  test('a zero given as -0 is written 0, not -0', () => {
    for (const item of [
      { name: 'Pallet', quantity: 3, unitPrice: 1000, amount: -0 },
      { name: 'Glosa', amount: -0 },
    ]) {
      const guide = line(item, 52, { transferType: 5 })
      expect(guide.items[0].amount).toBe(0)
      expect(toSiiDocument(guide).Detalle[0].MontoItem).toBe(0)
    }
  })

  // 123 456 789 by 123 456 789 is 15 241 578 750 190 521, which has no number of its own: the nearest one ends in 520.
  test('an amount with more digits than a number holds is refused on the line amount', () => {
    expectError(() => line({ name: 'Clip', quantity: 123456789, unitPrice: 123456789 }), 'INVALID_AMOUNT', {
      field: 'items[0].amount',
      value: '15241578750190521',
    })
  })
})

describe('a line that must be zero', () => {
  const sale = { name: 'Bebida', quantity: 1, unitPrice: 990 }
  const issue = (
    type: DocumentInput['type'],
    items: readonly LineItemInput[],
    overrides: Partial<DocumentInput> = {},
  ) => createDocument({ type, folio: 7, issueDate: '2026-11-15', issuer, receiver, items, ...overrides })
  const correction = { documentType: 33, folio: 5, date: '2026-11-01', code: 2 as const, reason: 'Corrige giro' }

  test.each<[string, LineItemInput, DocumentInput['type'], DocumentInput['options']]>([
    [
      'that is not a sale (IndExe 4), on an invoice',
      { name: 'Envase', quantity: 2, unitPrice: 1000, exemptIndicator: 4 },
      33,
      undefined,
    ],
    [
      'that is not a sale, on a guide that is one',
      { name: 'Envase', quantity: 2, unitPrice: 1000, exemptIndicator: 4 },
      52,
      { transferType: 1 },
    ],
    [
      'to take off an earlier guide (IndExe 5)',
      { name: 'Envase', quantity: 2, unitPrice: 1000, exemptIndicator: 5 },
      52,
      { transferType: 5 },
    ],
  ])('a line %s is written at zero, with its price and quantity', (_label, item, type, options) => {
    const written = issue(type, [sale, item], { options })
    expect(written.items[1]).toMatchObject({ quantity: 2, unitPrice: 1000, amount: 0 })
    expect(toSiiDocument(written).Detalle[1]).toMatchObject({ PrcItem: 1000, MontoItem: 0 })
    expect(issue(type, [sale, { ...item, amount: 0 }], { options }).items[1].amount).toBe(0)
    expectError(() => issue(type, [sale, { ...item, amount: 2000 }], { options }), 'TOTAL_MISMATCH', {
      field: 'items[1].amount',
      expected: 0,
      actual: 2000,
    })
  })

  test.each(['discountPercent', 'surchargePercent'] as const)('a %s on such a line is refused', (field) => {
    const item = { name: 'Envase', unitPrice: 1000, exemptIndicator: 4 as const, [field]: 10 }
    expectError(() => issue(33, [sale, item]), 'INVALID_AMOUNT', { field: `items[1].${field}` })
  })

  test('every line of a credit note that corrects a text is zero, and so is its total', () => {
    const note = issue(61, [{ name: 'Clip', quantity: 2, unitPrice: 1000 }, { name: 'Glosa' }], {
      references: [correction],
    })
    expect(note.items.map((item) => [item.unitPrice, item.amount])).toEqual([
      [1000, 0],
      [undefined, 0],
    ])
    expect(note.header.totals.totalAmount).toBe(0)
    expectError(() => issue(61, [{ name: 'Glosa', amount: 500 }], { references: [correction] }), 'TOTAL_MISMATCH', {
      field: 'items[0].amount',
      expected: 0,
      actual: 500,
    })
  })

  test.each<[string, Partial<DocumentInput>]>([
    ['globalAdjustments[0]', { globalAdjustments: [{ kind: 'discount', valueType: 'percent', value: 10 }] }],
    ['commissions[0]', { commissions: [{ kind: 'commission', description: 'Comisión', netValue: 100 }] }],
  ])('a credit note that corrects a text refuses %s: it has nothing to apply it to', (field, extra) => {
    const lines = [{ name: 'Clip', quantity: 2, unitPrice: 1000 }]
    expectError(() => issue(61, lines, { references: [correction], ...extra }), 'INVALID_OPTION', { field })
    const empty = { globalAdjustments: [], commissions: [] }
    expect(issue(61, lines, { references: [correction], ...empty }).header.totals.totalAmount).toBe(0)
  })

  test.each<[string, DocumentInput['type'], 1 | 2 | 3]>([
    ['a credit note that corrects amounts', 61, 3],
    ['a debit note that corrects a text', 56, 2],
  ])('%s keeps the amounts of its lines', (_label, type, code) => {
    const note = issue(type, [{ name: 'Clip', quantity: 2, unitPrice: 1000 }], {
      references: [{ ...correction, code }],
    })
    expect(note.items[0].amount).toBe(2000)
  })
})

// Formato DTE 2.5, field 22 of the detail: "Para documentos de traslados que no importen venta podrá omitirse el valor
// unitario". `PrcItem` is a `Dec12_6Type` in `SiiTypes_v10.xsd`, and a `Dec5Type` with the same limits in
// `EnvioBOLETA_v11.xsd`: both start at 0.000001.
describe('the unit price of a line', () => {
  const sale = { name: 'Bebida', quantity: 1, unitPrice: 990 }
  const issue = (items: readonly LineItemInput[], type: DocumentInput['type'] = 33) =>
    createDocument({ type, folio: 7, issueDate: '2026-11-15', issuer, receiver, items })

  test('a price of zero is no price: the line is written without one, with the amount it brings', () => {
    const written = issue([sale, { name: 'Regalo', quantity: 2, unitPrice: 0, unitPriceDecimals: 2 }])
    expect(written.items[1]).toEqual({ lineNumber: 2, name: 'Regalo', quantity: 2, amount: 0 })
    expect(toSiiDocument(written).Detalle[1]).not.toHaveProperty('PrcItem')
    expect(issue([{ name: 'Ajuste', unitPrice: 0, amount: 500 }]).items[0]).toMatchObject({ amount: 500 })
    expect(issue([{ name: 'Ajuste', unitPrice: -0, amount: 500 }]).items[0]).not.toHaveProperty('unitPrice')
  })

  test('so a line with a price of zero and no quantity is written with none, except on a guide', () => {
    expect(issue([sale, { name: 'Regalo', unitPrice: 0 }]).items[1]).not.toHaveProperty('quantity')
    expect(issue([{ name: 'Regalo', unitPrice: 0 }], 52).items[0]).toMatchObject({ quantity: 1, amount: 0 })
  })

  test.each([-1, -0.5, 0.0000004, -0.0000004])('a price of %p is refused', (unitPrice) => {
    expectError(() => issue([{ name: 'Clip', quantity: 1, unitPrice }]), 'INVALID_AMOUNT', {
      field: 'items[0].unitPrice',
    })
  })

  test('a settlement invoice (43) writes a negative line as an amount, not a price', () => {
    const settle = (item: LineItemInput) =>
      createDocument({
        type: 43,
        folio: 1,
        issueDate: '2026-11-15',
        issuer,
        receiver,
        items: [{ name: 'Venta liquidada', unitPrice: 10000, settledDocumentType: '33' }, item],
        commissions: [{ kind: 'commission', description: 'Comisión', netValue: 1000 }],
      })
    expect(
      settle({ name: 'Ajuste', amount: -300, exemptIndicator: 2, settledDocumentType: '33' }).items[1].amount,
    ).toBe(-300)
    expectError(
      () => settle({ name: 'Ajuste', quantity: 1, unitPrice: -300, exemptIndicator: 2, settledDocumentType: '33' }),
      'INVALID_AMOUNT',
      { field: 'items[1].unitPrice' },
    )
  })
})

// `QtyItem`, `QtyRef` and `PrcRef` are each a `Dec12_6Type` in `SiiTypes_v10.xsd`, and a receipt's `QtyItem` a
// `Dec5Type` of `EnvioBOLETA_v11.xsd` with the same limits: both start at 0.000001.
describe('the quantity of a line', () => {
  const issue = (type: DocumentInput['type'], item: LineItemInput, overrides: Partial<DocumentInput> = {}) =>
    createDocument({ type, folio: 7, issueDate: '2026-11-15', issuer, receiver, items: [item], ...overrides })
  const correction = { documentType: 33, folio: 5, date: '2026-11-01', code: 2 as const }

  test.each([0, -0, -1, 0.0000004, -0.0000004])('a quantity of %p is refused', (quantity) => {
    expectError(() => issue(33, { name: 'Clip', quantity, unitPrice: 1000 }), 'INVALID_AMOUNT', {
      field: 'items[0].quantity',
    })
  })

  test.each<[string, DocumentInput['type'], LineItemInput, Partial<DocumentInput>]>([
    ['a line that is not a sale', 33, { name: 'Envase', quantity: -1, unitPrice: 1000, exemptIndicator: 4 }, {}],
    [
      'a credit note that corrects a text',
      61,
      { name: 'Clip', quantity: -1, unitPrice: 1000 },
      {
        references: [correction],
      },
    ],
    ['a line without a price', 33, { name: 'Glosa', quantity: 0, amount: 500 }, {}],
    [
      'a guide that is not a sale',
      52,
      { name: 'Pallet', quantity: 0, unitPrice: 1000, amount: 0 },
      {
        options: { transferType: 5 },
      },
    ],
    [
      'a priced line of a settlement invoice',
      43,
      { name: 'Venta', quantity: -1, unitPrice: 300, settledDocumentType: '33' },
      {},
    ],
    [
      'a line of a settlement invoice with no price',
      43,
      { name: 'Ajuste', quantity: -1, amount: -300, settledDocumentType: '33' },
      {},
    ],
    ['a receipt', 39, { name: 'Pan', quantity: 0, unitPrice: 1000 }, { receiver: undefined }],
  ])('so is one on %s', (_label, type, item, overrides) => {
    expectError(() => issue(type, item, overrides), 'INVALID_AMOUNT', { field: 'items[0].quantity' })
  })

  test.each(['referenceQuantity', 'referencePrice'] as const)('a %s at or below zero is refused', (field) => {
    for (const value of [0, -1, 0.0000004])
      expectError(() => issue(33, { name: 'Caja', quantity: 1, unitPrice: 1000, [field]: value }), 'INVALID_AMOUNT', {
        field: `items[0].${field}`,
      })
  })
})

// The `CodRef` row of Formato DTE 2.5: a credit note that cancels the document it references or corrects a text of
// it, and a debit note that cancels a credit note, "DEBEN TENER UN ÚNICO DOCUMENTO DE REFERENCIA".
describe('a note that cancels a document or corrects a text', () => {
  const note = (type: DocumentInput['type'], references: DocumentInput['references']) =>
    createDocument({
      type,
      folio: 7,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [{ name: 'Clip', quantity: 1, unitPrice: 1000 }],
      references,
    })
  const reference = (code: 1 | 2 | 3 | undefined, folio: number, documentType = 33) =>
    code === undefined ? { documentType, folio, date: '2026-11-01' } : { documentType, folio, date: '2026-11-01', code }

  test.each<[string, DocumentInput['type'], (1 | 2 | 3 | undefined)[], string]>([
    ['a credit note that corrects a text, after another', 61, [3, 2], 'references[0]'],
    ['a credit note that corrects a text, before another', 61, [2, 3], 'references[1]'],
    ['a credit note that cancels, next to one with no code', 61, [1, undefined], 'references[1]'],
    ['a credit note that cancels two documents', 61, [1, 1], 'references[1]'],
    ['a debit note that cancels a credit note', 56, [1, 3], 'references[1]'],
  ])('%s is refused on the other reference', (_label, type, codes, field) => {
    const references = codes.map((code, index) => reference(code, 8 + index, type === 56 ? 61 : 33))
    expectError(() => note(type, references), 'INVALID_OPTION', { field })
  })

  test('the reference of a certification set is not a document, and other notes keep every reference', () => {
    const set = { documentType: 'SET' as const, folio: 1, date: '2026-11-15', reason: 'CASO 1' }
    expect(note(61, [set, reference(2, 8)]).items[0].amount).toBe(0)
    expect(note(61, [set, reference(1, 8)]).references).toHaveLength(2)
    expect(note(56, [reference(2, 8), reference(3, 9)]).references).toHaveLength(2)
    expect(note(61, [reference(3, 8), reference(3, 9)]).references).toHaveLength(2)
    expect(note(33, [reference(1, 8), reference(1, 9)]).references).toHaveLength(2)
  })

  test('a SET reference with code 2 makes no note one that corrects a text: its lines keep their amounts', () => {
    const set = { documentType: 'SET' as const, folio: 1, date: '2026-11-15', code: 2 as const, reason: 'CASO 1' }
    const written = note(61, [set, reference(3, 8)])
    expect(written.items[0].amount).toBe(1000)
    expect(written.header.totals.totalAmount).toBe(1190)
  })
})

// `CdgSIISucur` is a positive integer of at most nine digits in `DTE_v10.xsd` and `EnvioBOLETA_v11.xsd`.
describe("the issuer's SII branch code", () => {
  const branch = (siiBranchCode: number, type: DocumentInput['type'] = 33) =>
    createDocument({ type, folio: 7, issuer: { ...issuer, siiBranchCode }, receiver, items })

  test.each([0, 1.5, -3, 1_000_000_000, Number.NaN])('%p is refused', (code) => {
    expectError(() => branch(code), 'INVALID_OPTION', { field: 'issuer.siiBranchCode' })
    expectError(() => branch(code, 39), 'INVALID_OPTION', { field: 'issuer.siiBranchCode' })
  })

  test('1 and 999 999 999 are the bounds the schema admits', () => {
    expect(branch(1).header.issuer.siiBranchCode).toBe(1)
    expect(branch(999_999_999).header.issuer.siiBranchCode).toBe(999_999_999)
  })
})

describe('the quantity of a priced line', () => {
  const line = (item: DocumentInput['items'][number], type: DocumentInput['type'] = 33) =>
    createDocument({ type, folio: 7, issueDate: '2026-11-15', issuer, receiver, items: [item] })

  test('a line with a price and no quantity is written with the quantity it is computed with, 1', () => {
    const doc = line({ name: 'Plan anual', unitPrice: 100000 })
    expect(doc.items[0]).toMatchObject({ quantity: 1, unitPrice: 100000, amount: 100000 })
    expect(toSiiDocument(doc).Detalle[0]).toMatchObject({ QtyItem: 1, PrcItem: 100000, MontoItem: 100000 })
    expect(toSiiDocument(line({ name: 'Flete', unitPrice: 5000 }, 52)).Detalle[0].QtyItem).toBe(1)
    expect(toSiiDocument(line({ name: 'Pan', unitPrice: 1190 }, 39)).Detalle[0].QtyItem).toBe(1)
  })

  // Formato DTE 2.5, field 15: `QtyItem` is required on a dispatch guide, priced or not.
  test('a line of a dispatch guide with no quantity is written with 1, even without a price', () => {
    const guide = line({ name: 'Pallet', amount: 0 }, 52)
    expect(guide.items[0]).toMatchObject({ quantity: 1, amount: 0 })
    expect(toSiiDocument(guide).Detalle[0].QtyItem).toBe(1)
    expect(line({ name: 'Pallet', quantity: 3, amount: 0 }, 52).items[0].quantity).toBe(3)
  })

  test('a line without a price gets no quantity of its own', () => {
    expect(line({ name: 'Glosa', amount: 500 }).items[0].quantity).toBeUndefined()
    // A line of nothing on an invoice leaves it without VAT, so these are credit notes.
    expect(line({ name: 'Glosa' }, 61).items[0].quantity).toBeUndefined()
    expect(line({ name: 'Pallet', quantity: 2, amount: 0 }, 61).items[0].quantity).toBe(2)
  })
})

// Formato DTE 2.5, section F and fields 121 to 124. `DTE_v10.xsd` asks every commission line for `ValComNeto` and
// `ValComExe`, and admits 20 of them.
describe('commissions and other charges', () => {
  const settle = (overrides: Partial<DocumentInput> = {}) =>
    createDocument({
      type: 43,
      folio: 1,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [{ name: 'Venta liquidada', unitPrice: 10000, settledDocumentType: '33' }],
      commissions: [{ kind: 'commission', description: 'Comisión 10%', rate: 10, netValue: 1000 }],
      ...overrides,
    })
  const charge = { kind: 'otherCharge', description: 'Flete' } as const

  test('the totals carry the sums of the lines and take them off the total', () => {
    const doc = settle()
    expect(doc.commissions).toEqual([
      {
        lineNumber: 1,
        kind: 'commission',
        description: 'Comisión 10%',
        rate: 10,
        netValue: 1000,
        exemptValue: 0,
        vatValue: 190,
      },
    ])
    expect(doc.header.totals).toEqual({
      netAmount: 10000,
      vatRate: 19,
      vatAmount: 1900,
      commissions: { netValue: 1000, vatValue: 190 },
      totalAmount: 10710,
    })
    const sii = toSiiDocument(doc)
    expect(sii.Encabezado.Totales).toEqual({
      MntNeto: 10000,
      TasaIVA: 19,
      IVA: 1900,
      Comisiones: { ValComNeto: 1000, ValComIVA: 190 },
      MntTotal: 10710,
    })
    expect(sii.Comisiones).toEqual([
      {
        NroLinCom: 1,
        TipoMovim: 'C',
        Glosa: 'Comisión 10%',
        TasaComision: 10,
        ValComNeto: 1000,
        ValComExe: 0,
        ValComIVA: 190,
      },
    ])
  })

  test('a line gets the value it lacks as zero, and no VAT when its net by the rate rounds to none', () => {
    const doc = settle({
      commissions: [
        { ...charge, exemptValue: 500 },
        { ...charge, netValue: 2 },
      ],
    })
    expect(doc.commissions).toEqual([
      { lineNumber: 1, ...charge, netValue: 0, exemptValue: 500 },
      { lineNumber: 2, ...charge, netValue: 2, exemptValue: 0 },
    ])
    expect(doc.header.totals).toMatchObject({ commissions: { netValue: 2, exemptValue: 500 }, totalAmount: 11398 })
  })

  test("a line's own VAT value is kept, zero included, and is what the summary adds up", () => {
    const none = settle({ commissions: [{ ...charge, netValue: 1000, vatValue: 0 }] })
    expect(none.commissions[0]).toMatchObject({ netValue: 1000, exemptValue: 0, vatValue: 0 })
    expect(none.header.totals).toMatchObject({ commissions: { netValue: 1000 }, totalAmount: 10900 })
    const own = settle({ commissions: [{ ...charge, netValue: 1000, vatValue: 200 }] })
    expect(own.header.totals).toMatchObject({ commissions: { netValue: 1000, vatValue: 200 }, totalAmount: 10700 })
  })

  test('the VAT of the summary is worked out once, over the total net value, and each line keeps its own', () => {
    const each = { ...charge, netValue: 1003 }
    const doc = settle({ commissions: [each, each, each] })
    expect(doc.commissions.map(({ vatValue }) => vatValue)).toEqual([191, 191, 191])
    expect(doc.header.totals).toMatchObject({ commissions: { netValue: 3009, vatValue: 572 } })
    // A line that states its VAT makes the summary the sum of the lines.
    const stated = settle({ commissions: [{ ...each, vatValue: 191 }, each, each] })
    expect(stated.header.totals).toMatchObject({ commissions: { netValue: 3009, vatValue: 573 } })
  })

  test('the total of a settlement invoice may be zero or negative', () => {
    const items = [{ name: 'Venta liquidada', unitPrice: 1000, settledDocumentType: '33' }]
    expect(settle({ items, commissions: [{ ...charge, netValue: 1000 }] }).header.totals.totalAmount).toBe(0)
    expect(settle({ items, commissions: [{ ...charge, netValue: 2000 }] }).header.totals.totalAmount).toBe(-1190)
  })

  test('a negative line and a negative charge keep their sign', () => {
    const doc = settle({
      items: [{ name: 'Nota de crédito liquidada', amount: -1000, settledDocumentType: '61' }],
      commissions: [{ kind: 'commission', description: 'Reverso', netValue: -100 }],
    })
    expect(doc.commissions[0]).toMatchObject({ netValue: -100, exemptValue: 0, vatValue: -19 })
    expect(doc.header.totals).toEqual({
      netAmount: -1000,
      vatRate: 19,
      vatAmount: -190,
      commissions: { netValue: -100, vatValue: -19 },
      totalAmount: -1071,
    })
  })

  test('totals given by the caller still rule, with the own and third-party VAT they carry', () => {
    const totals = {
      netAmount: 10000,
      vatRate: 19,
      vatAmount: 1900,
      ownVatAmount: 190,
      thirdPartyVatAmount: 1710,
      commissions: { netValue: 1000, exemptValue: 0, vatValue: 189 },
      totalAmount: 10711,
    }
    const doc = settle({ totals })
    expect(doc.header.totals).toBe(totals)
    expect(toSiiDocument(doc).Encabezado.Totales).toEqual({
      MntNeto: 10000,
      TasaIVA: 19,
      IVA: 1900,
      IVAProp: 190,
      IVATerc: 1710,
      Comisiones: { ValComNeto: 1000, ValComExe: 0, ValComIVA: 189 },
      MntTotal: 10711,
    })
  })

  test('a purchase invoice takes its commission off the total too', () => {
    const doc = createDocument({
      type: 46,
      folio: 1,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [{ name: 'Chatarra', unitPrice: 1000 }],
      commissions: [{ kind: 'commission', description: 'Comisión', netValue: 100 }],
    })
    expect(doc.header.totals).toEqual({
      netAmount: 1000,
      vatRate: 19,
      vatAmount: 190,
      withholdings: [{ taxCode: 15, rate: 19, amount: 190 }],
      commissions: { netValue: 100, vatValue: 19 },
      totalAmount: 881,
    })
  })

  test('a line with neither a net nor an exempt value is refused', () => {
    expectError(() => settle({ commissions: [{ ...charge, rate: 10 }] }), 'MISSING_FIELD', {
      field: 'commissions[0].netValue',
    })
    expectError(
      () =>
        settle({
          commissions: [
            { ...charge, netValue: 1 },
            { ...charge, vatValue: 19 },
          ],
        }),
      'MISSING_FIELD',
      {
        field: 'commissions[1].netValue',
      },
    )
  })

  test.each(['netValue', 'exemptValue', 'vatValue'] as const)(
    'a %s that is not a finite number is refused',
    (field) => {
      for (const value of [Number.NaN, Number.POSITIVE_INFINITY, '100' as unknown as number])
        expectError(() => settle({ commissions: [{ ...charge, netValue: 1, [field]: value }] }), 'INVALID_AMOUNT', {
          field: `commissions[0].${field}`,
        })
    },
  )

  test('the schema admits 20 lines, on any type', () => {
    const lines = (count: number) => Array.from({ length: count }, () => ({ ...charge, netValue: 10 }))
    expect(settle({ commissions: lines(20) }).commissions).toHaveLength(20)
    expectError(() => settle({ commissions: lines(21) }), 'INVALID_OPTION', { field: 'commissions' })
    expectError(
      () =>
        createDocument({
          type: 46,
          folio: 1,
          issuer,
          receiver,
          items: [{ name: 'Chatarra', unitPrice: 1000 }],
          commissions: lines(21),
        }),
      'INVALID_OPTION',
      { field: 'commissions' },
    )
  })
})

// `DTE_v10.xsd` gives a settlement invoice a root of its own, `Liquidacion`, which declares less than `Documento`
// does: no transport, no global or line discounts and surcharges, no `MontoNF`, no `RUTOtr`, and five fields fewer in
// `IdDoc`. It asks the receiver for `GiroRecep` and admits 60 lines. `TpoDocLiq` exists only on its lines.
describe('what the schema admits on a settlement invoice (43)', () => {
  const line = { name: 'Venta liquidada', unitPrice: 10000, settledDocumentType: '33' }
  const settle = (overrides: Partial<DocumentInput> = {}) =>
    createDocument({
      type: 43,
      folio: 1,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [line],
      commissions: [{ kind: 'commission', description: 'Comisión', netValue: 1000 }],
      ...overrides,
    })

  test('a quantity a half past its six decimals is written rounded half away from zero, with its amount', () => {
    const items = [{ ...line, quantity: 1.0000015, unitPrice: 1000000 }]
    expect(settle({ items }).items[0]).toMatchObject({ quantity: 1.000002, amount: 1000002 })
  })

  test('the receiver needs a business activity', () => {
    expectError(() => settle({ receiver: { ...receiver, businessActivity: undefined } }), 'MISSING_FIELD', {
      field: 'receiver.businessActivity',
    })
    expectError(() => settle({ receiver: { ...receiver, businessActivity: ' ' } }), 'MISSING_FIELD', {
      field: 'receiver.businessActivity',
    })
  })

  test.each<[string, Partial<DocumentInput>]>([
    ['globalAdjustments', { globalAdjustments: [{ kind: 'discount', valueType: 'percent', value: 5 }] }],
    ['transport', { transport: { licensePlate: 'ABCD12' } }],
    ['transport', { transport: {} }],
    ['items[0].discountPercent', { items: [{ ...line, discountPercent: 10 }] }],
    ['items[1].surchargePercent', { items: [line, { ...line, surchargePercent: 10 }] }],
    ['items[0].discountPercent', { items: [{ ...line, discountPercent: 0 }] }],
    ['items[1].withholdingAgent', { items: [line, { ...line, withholdingAgent: {} }] }],
    [
      'references[1].otherRut',
      {
        references: [
          { documentType: 33, folio: 8, date: '2026-11-10' },
          { documentType: 33, folio: 9, date: '2026-11-10', otherRut: RECEIVER_RUT },
        ],
      },
    ],
    ['options.noDebitReduction', { options: { noDebitReduction: 1 } }],
    ['options.dispatchType', { options: { dispatchType: 1 } }],
    ['options.transferType', { options: { transferType: 1 } }],
    ['options.printFormat', { options: { printFormat: 'T' } }],
    ['options.exportPaymentTerms', { options: { exportPaymentTerms: '1' } }],
    ['options.netAmountsIndicator', { options: { netAmountsIndicator: 2 } }],
    [
      'totals.nonBillableAmount',
      { totals: { netAmount: 10000, vatRate: 19, vatAmount: 1900, totalAmount: 11900, nonBillableAmount: 5 } },
    ],
  ])('%s is refused: Liquidacion does not declare what it writes', (field, overrides) => {
    expectError(() => settle(overrides), 'INVALID_OPTION', { field })
  })

  test('what Liquidacion does declare still passes', () => {
    const doc = settle({
      // A negative line has no price: `PrcItem` is above zero, and field 38 makes the amount its price by its quantity.
      items: [line, { name: 'No facturable', amount: -300, exemptIndicator: 2, settledDocumentType: '33' }],
      references: [{ documentType: 33, folio: 9, date: '2026-11-10', reason: 'Factura liquidada' }],
      subtotals: [{ number: 1, description: 'Ventas', totalAmount: 10000, lines: [1] }],
      globalAdjustments: [],
      options: {
        serviceIndicator: 3,
        paymentTerms: 2,
        billingPeriod: { from: '2026-11-01', to: '2026-11-30' },
        dueDate: '2026-12-15',
      },
    })
    expect(doc.header.options).toEqual({
      serviceIndicator: 3,
      paymentTerms: 2,
      billingPeriod: { from: '2026-11-01', to: '2026-11-30' },
      dueDate: '2026-12-15',
    })
    // The non-billable line stays out of the totals: `Liquidacion` has no `MontoNF` to report it in.
    expect(doc.header.totals).toEqual({
      netAmount: 10000,
      vatRate: 19,
      vatAmount: 1900,
      commissions: { netValue: 1000, vatValue: 190 },
      totalAmount: 10710,
    })
  })

  test('it admits 60 lines', () => {
    const lines = (count: number) => Array.from({ length: count }, () => line)
    expect(settle({ items: lines(60) }).items).toHaveLength(60)
    expectError(() => settle({ items: lines(61) }), 'INVALID_OPTION', { field: 'items' })
  })

  test('commissions are not required: the schema declares them from none to 20', () => {
    expect(settle({ commissions: undefined }).header.totals).toEqual({
      netAmount: 10000,
      vatRate: 19,
      vatAmount: 1900,
      totalAmount: 11900,
    })
  })

  test.each([33, 34, 39, 46, 52, 56, 61] as const)(
    'a settledDocumentType on a %p is refused: only Liquidacion declares TpoDocLiq',
    (type) => {
      expectError(
        () => createDocument({ type, folio: 1, issuer, receiver, items: [{ ...line, exempt: type === 34 }] }),
        'INVALID_OPTION',
        { field: 'items[0].settledDocumentType' },
      )
    },
  )
})

// `EnvioBOLETA_v11.xsd` gives a receipt a shape of its own, which declares much less than the invoice's `Documento`:
// nine fields in `IdDoc`, no transport, no commissions, no withholdings, eight totals and a shorter line. Its issuer
// and its receiver are the exception: what they carry that the codec does not write on a receipt is left out.
describe('what the schema admits on a receipt (39, 41)', () => {
  const coffee = { name: 'Café', quantity: 2, unitPrice: 1500 }
  const receipt = (overrides: Partial<DocumentInput> = {}, type: 39 | 41 = 39) =>
    createDocument({
      type,
      folio: 1,
      issueDate: '2026-11-15',
      issuer,
      items: [coffee],
      pricesIncludeVat: type === 39,
      ...overrides,
    })
  const totals = { netAmount: 2521, vatAmount: 479, totalAmount: 3000 }

  test.each<[string, Partial<DocumentInput>]>([
    ['transport', { transport: { licensePlate: 'ABCD12' } }],
    ['transport', { transport: {} }],
    ['commissions', { commissions: [{ kind: 'commission', description: 'Comisión', netValue: 100 }] }],
    ['withholdVat', { withholdVat: true }],
    ['options.noDebitReduction', { options: { noDebitReduction: 1 } }],
    ['options.dispatchType', { options: { dispatchType: 1 } }],
    ['options.transferType', { options: { transferType: 1 } }],
    ['options.printFormat', { options: { printFormat: 'T' } }],
    ['options.grossAmounts', { options: { grossAmounts: 1 } }],
    ['options.purchaseTransactionType', { options: { purchaseTransactionType: 1 } }],
    ['options.saleTransactionType', { options: { saleTransactionType: 1 } }],
    ['options.paymentTerms', { options: { paymentTerms: 1 } }],
    ['options.exportPaymentTerms', { options: { exportPaymentTerms: '1' } }],
    ['options.settlementDate', { options: { settlementDate: '2026-11-15' } }],
    ['options.settledAmount', { options: { settledAmount: 3000 } }],
    ['options.outstandingBalance', { options: { outstandingBalance: 0 } }],
    ['options.payments', { options: { payments: [{ date: '2026-12-01', amount: 3000 }] } }],
    ['options.paymentAccountType', { options: { paymentAccountType: 'CORRIENTE' } }],
    ['options.paymentAccountNumber', { options: { paymentAccountNumber: '123' } }],
    ['options.paymentBank', { options: { paymentBank: 'Banco' } }],
    ['options.paymentTermsCode', { options: { paymentTermsCode: 'A' } }],
    ['options.paymentTermsNote', { options: { paymentTermsNote: '30 días' } }],
    ['options.paymentTermsDays', { options: { paymentTermsDays: 30 } }],
    ['totals.vatRate', { totals: { ...totals, vatRate: 19 } }],
    ['totals.ownVatAmount', { totals: { ...totals, ownVatAmount: 100 } }],
    ['totals.thirdPartyVatAmount', { totals: { ...totals, thirdPartyVatAmount: 100 } }],
    ['totals.withholdings', { totals: { ...totals, withholdings: [{ taxCode: 15, rate: 19, amount: 479 }] } }],
    ['totals.commissions', { totals: { ...totals, commissions: { netValue: 100 } } }],
    ['items[0].referenceQuantity', { items: [{ ...coffee, referenceQuantity: 2 }] }],
    ['items[1].referenceUnit', { items: [coffee, { ...coffee, referenceUnit: 'KG' }] }],
    ['items[0].referencePrice', { items: [{ ...coffee, referencePrice: 0 }] }],
    ['items[0].additionalTaxCodes', { items: [{ ...coffee, additionalTaxCodes: [27] }] }],
    ['items[0].withholdingAgent', { items: [{ ...coffee, withholdingAgent: {} }] }],
  ])('%s is refused: a receipt does not declare what it writes', (field, overrides) => {
    expectError(() => receipt(overrides), 'INVALID_OPTION', { field })
    expectError(() => receipt(overrides, 41), 'INVALID_OPTION', { field })
  })

  test('its IdDoc declares five options, and any other is refused, one this model does not know included', () => {
    const unknown = { loyaltyPoints: 10 } as DocumentInput['options']
    expectError(() => receipt({ options: unknown }), 'INVALID_OPTION', { field: 'options.loyaltyPoints' })
    expect(
      receipt({ options: { ...unknown, loyaltyPoints: undefined } as DocumentInput['options'] }).header.options,
    ).toEqual({ serviceIndicator: 3 })
  })

  test.each([3, 4, 5] as const)('an exempt indicator of %p is refused: a receipt admits 1, 2 and 6', (indicator) => {
    expectError(() => receipt({ items: [coffee, { ...coffee, exemptIndicator: indicator }] }), 'INVALID_OPTION', {
      field: 'items[1].exemptIndicator',
    })
  })

  test('a net amounts indicator other than 2 is refused: it is the one value its schema admits', () => {
    expectError(() => receipt({ options: { netAmountsIndicator: 1 as 2 } }), 'INVALID_OPTION', {
      field: 'options.netAmountsIndicator',
    })
    expect(receipt({ options: { netAmountsIndicator: 2 } }).header.options).toEqual({
      serviceIndicator: 3,
      netAmountsIndicator: 2,
    })
  })

  test('what a receipt does declare still passes', () => {
    const doc = receipt({
      receiver: { rut: RECEIVER_RUT, businessName: 'Ana Rojas', address: 'Pasaje Los Olmos 88', commune: 'Ñuñoa' },
      softwareProviderRut: '76.543.210-3',
      items: [
        { ...coffee, discountPercent: 10, codes: [{ type: 'INT1', value: 'C-1' }] },
        { name: 'Propina', unitPrice: 300, exemptIndicator: 1 },
        { name: 'Envase', unitPrice: 500, exemptIndicator: 2 },
        { name: 'Recaudación de terceros', unitPrice: 700, exemptIndicator: 6 },
      ],
      globalAdjustments: [{ kind: 'discount', valueType: 'percent', value: 5 }],
      subtotals: [{ number: 1, totalAmount: 2700, lines: [1] }],
      receiptReferences: [{ code: 'SET', reason: 'CASO-1' }],
      options: {
        serviceIndicator: 2,
        billingPeriod: { from: '2026-11-01', to: '2026-11-30' },
        dueDate: '2026-12-10',
        paymentMedium: '1',
      },
    })
    expect(doc.header.softwareProviderRut).toBe(ISSUER_RUT)
    expect(doc.header.options).toEqual({
      serviceIndicator: 2,
      billingPeriod: { from: '2026-11-01', to: '2026-11-30' },
      dueDate: '2026-12-10',
      paymentMedium: '1',
    })
    expect(doc.items.map((item) => item.exemptIndicator)).toEqual([undefined, 1, 2, 6])
    expect(doc.header.totals).toEqual({
      netAmount: 2155,
      exemptAmount: 300,
      vatAmount: 410,
      totalAmount: 2865,
      nonBillableAmount: 1200,
    })
  })

  test('totals given by the caller keep the amounts a receipt declares', () => {
    const given = { ...totals, nonBillableAmount: 500, periodAmount: 3500, previousBalance: -200, amountDue: 3300 }
    expect(receipt({ pricesIncludeVat: undefined, totals: given }).header.totals).toEqual(given)
  })

  test('an empty list or a withholding turned off writes nothing, so it is not refused', () => {
    const doc = receipt({
      commissions: [],
      withholdVat: false,
      options: { payments: [] },
      items: [{ ...coffee, additionalTaxCodes: [] }],
    })
    expect(doc.commissions).toEqual([])
    expect(doc.header.totals).toEqual(totals)
    expect(receipt({ pricesIncludeVat: undefined, totals: { ...totals, withholdings: [] } }).header.totals).toEqual({
      ...totals,
      withholdings: [],
    })
  })

  test('what the issuer and the receiver carry that is not written on a receipt is kept in the document, not refused', () => {
    const everything = {
      ...issuer,
      branch: 'Casa Matriz',
      phone: '+56 2 2345 6789',
      email: 'ventas@example.cl',
      salespersonCode: 'V-1',
    }
    const doc = receipt({
      issuer: everything,
      receiver: { rut: RECEIVER_RUT, businessName: 'Ana Rojas', businessActivity: 'Particular' },
    })
    expect(doc.header.issuer).toMatchObject({ branch: 'Casa Matriz', activityCode: 620200, salespersonCode: 'V-1' })
    expect(doc.header.receiver.businessActivity).toBe('Particular')
  })

  test("the software provider's RUT is checked with rut.ts and left out when not given", () => {
    expectError(() => receipt({ softwareProviderRut: '76543210-K' }), 'INVALID_RUT', { field: 'softwareProviderRut' })
    expect(receipt().header).not.toHaveProperty('softwareProviderRut')
    expect(receipt({ softwareProviderRut: ISSUER_RUT }, 41).header.softwareProviderRut).toBe(ISSUER_RUT)
  })

  test.each([33, 34, 43, 46, 52, 56, 61] as const)(
    'a net amounts indicator or a software provider on a %p is refused: only a receipt declares them',
    (type) => {
      const document = {
        type,
        folio: 1,
        issuer,
        receiver,
        items: [{ name: 'Plan anual', unitPrice: 1000, settledDocumentType: type === 43 ? '33' : undefined }],
      }
      expectError(() => createDocument({ ...document, options: { netAmountsIndicator: 2 } }), 'INVALID_OPTION', {
        field: 'options.netAmountsIndicator',
      })
      expectError(() => createDocument({ ...document, softwareProviderRut: ISSUER_RUT }), 'INVALID_OPTION', {
        field: 'softwareProviderRut',
      })
      expect(createDocument(document).header).not.toHaveProperty('softwareProviderRut')
    },
  )
})

// `DTE_v10.xsd` gives an export document a root of its own, `Exportaciones`: its totals are a currency, an exempt
// amount and a total with four decimals, it declares the foreign receiver and the customs area, and it declares less
// than `Documento` in `IdDoc`, the totals, the transport and a line. What it does not declare is refused; what Formato
// DTE 2.5 asks of an export invoice is required.
describe('what the schema admits on an export document (110, 111, 112)', () => {
  const foreign = {
    rut: FOREIGN_RECEIVER_RUT,
    businessName: 'Andes Trading LLC',
    address: '1200 Harbor Blvd',
    city: 'Miami',
  }
  const customs = { saleModality: 1, saleClause: 2, saleClauseTotal: 1234.5, transportRoute: 1, receiverCountry: 225 }
  const line = { name: 'Uva de mesa', quantity: 100, unit: 'KN', unitPrice: 12.345 }
  const exportOf = (overrides: Partial<DocumentInput> = {}) =>
    createDocument({
      type: 110,
      folio: 1,
      issueDate: '2026-11-15',
      issuer,
      receiver: foreign,
      currency: 'DOLAR USA',
      items: [line],
      transport: { customs },
      ...overrides,
    })
  const note = (type: 111 | 112, overrides: Partial<DocumentInput> = {}) =>
    exportOf({
      type,
      receiver: { ...foreign, city: undefined },
      items: [{ name: 'Diferencia', amount: 10.5 }],
      transport: undefined,
      references: [{ documentType: 110, folio: 1, date: '2026-11-10', code: 3 }],
      ...overrides,
    })

  test('an export invoice is exempt as a whole, in its currency, with the decimals of its amounts', () => {
    const doc = exportOf()
    expect(doc.id).toBe('DTE_T110F1')
    expect(doc.header.currency).toBe('DOLAR USA')
    expect(doc.items[0]).toEqual({ lineNumber: 1, ...line, amount: 1234.5 })
    expect(doc.header.totals).toEqual({ exemptAmount: 1234.5, totalAmount: 1234.5 })
    expect(doc.header.receiver).toEqual(foreign)
    expect(doc.header.transport).toEqual({ customs })
    expect(doc.header.otherCurrency).toBeUndefined()
    expect(doc.warnings).toBeUndefined()
  })

  test('with an exchange rate it carries its totals in pesos, each rounded half away from zero to a whole peso', () => {
    // 1234.5 × 950.25 = 1173083.625.
    expect(exportOf({ exchangeRate: 950.25 }).header.otherCurrency).toEqual({
      currency: 'PESO CL',
      exchangeRate: 950.25,
      exemptAmount: 1173084,
      totalAmount: 1173084,
    })
    expect(exportOf({ exchangeRate: 950.123456 }).header.otherCurrency?.exchangeRate).toBe(950.1235)
  })

  test.each([0, -1, 1_000_000, Number.NaN])('an exchange rate of %p is refused', (exchangeRate) => {
    expectError(() => exportOf({ exchangeRate }), 'INVALID_AMOUNT', { field: 'exchangeRate' })
  })

  test('a line is its quantity by its price to four decimals, with a discount and a surcharge in whole units', () => {
    const doc = exportOf({
      items: [
        { name: 'Vino', quantity: 3, unit: 'BOT', unitPrice: 1234.565, surchargePercent: 3 },
        { name: 'Pisco', quantity: 1 / 3, unit: 'BOT', unitPrice: 100, discountPercent: 10 },
        { name: 'Flete interno', quantity: 1, unit: 'U', amount: 10.123456 },
      ],
    })
    expect(
      doc.items.map(({ amount, discountAmount, surchargeAmount }) => ({ amount, discountAmount, surchargeAmount })),
    ).toEqual([
      // 3 × 1234.565 = 3703.695, and its 3 % is 111.11085, written as 111.
      { amount: 3814.695, discountAmount: undefined, surchargeAmount: 111 },
      // 0.333333 × 100 = 33.3333, and its 10 % is 3.33333, written as 3.
      { amount: 30.3333, discountAmount: 3, surchargeAmount: undefined },
      { amount: 10.1235, discountAmount: undefined, surchargeAmount: undefined },
    ])
    expect(doc.header.totals).toEqual({ exemptAmount: 3855.1518, totalAmount: 3855.1518 })
  })

  test.each<[string, LineItemInput]>([
    ['a negative amount', { name: 'Ajuste', quantity: 1, unit: 'U', amount: -1 }],
    ['an amount past 14 digits', { name: 'Ajuste', quantity: 1, unit: 'U', amount: 1e14 }],
    ['a quantity by a price past 14 digits', { name: 'Granel', quantity: 1_000_000, unit: 'KN', unitPrice: 1e8 }],
    ['a discount above the line', { name: 'Granel', quantity: 1, unit: 'KN', unitPrice: 10, discountPercent: 200 }],
  ])('%s is refused: MontoItem is a decimal from zero up', (_label, item) => {
    expectError(() => exportOf({ items: [item] }), 'INVALID_AMOUNT', { field: 'items[0].amount' })
  })

  test('an amount of a number too large to be written in digits is refused', () => {
    const item = { name: 'Ajuste', quantity: 1, unit: 'U', amount: 1e21 }
    expectError(() => exportOf({ items: [item] }), 'INVALID_AMOUNT', { field: 'items[0].amount' })
  })

  test('so is a base with more digits than a number holds, on the line amount', () => {
    const item = { name: 'Uva de mesa', quantity: 123456789, unit: 'KN', unitPrice: 123456789 }
    expectError(() => exportOf({ items: [item] }), 'INVALID_AMOUNT', {
      field: 'items[0].amount',
      value: '15241578750190521.0000',
    })
  })

  // Formato DTE 2.5, field 38 of the detail, on an export credit note as on a 61: every line of one that corrects a
  // text is zero.
  test('every line of an export credit note that corrects a text is zero, and so are its totals', () => {
    const correction = { documentType: 110, folio: 1, date: '2026-11-10', code: 2 as const }
    const priced = { name: 'Uva de mesa', quantity: 100, unit: 'KN', unitPrice: 12.345 }
    const doc = note(112, { items: [priced], references: [correction] })
    expect(doc.items[0]).toMatchObject({ unitPrice: 12.345, amount: 0 })
    expect(doc.header.totals).toMatchObject({ totalAmount: 0 })
    expectError(() => note(112, { references: [correction] }), 'TOTAL_MISMATCH', {
      field: 'items[0].amount',
      expected: 0,
      actual: 10.5,
    })
    expect(note(111, { items: [priced], references: [correction] }).items[0].amount).toBe(1234.5)
  })

  test.each<[111 | 112, 1 | 2]>([
    [112, 1],
    [112, 2],
    [111, 1],
  ])('a %s with a reference of code %s and another is refused on the other', (type, code) => {
    const references = [
      { documentType: 110, folio: 1, date: '2026-11-10', code },
      { documentType: 110, folio: 2, date: '2026-11-10', code: 3 as const },
    ]
    expectError(() => note(type, { references }), 'INVALID_OPTION', { field: 'references[1]' })
  })

  test('a quantity at or below zero is refused on an export line too', () => {
    expectError(() => exportOf({ items: [{ ...line, quantity: 0 }] }), 'INVALID_AMOUNT', { field: 'items[0].quantity' })
  })

  // An export line's amount is written with four decimals, so a given one is compared as it is written.
  test.each([
    [0.00001, undefined],
    [0.00005, 0.0001],
    [1e15, 1e15],
  ])(
    'a given amount of %p on a line of an export credit note that corrects a text is compared as %p',
    (amount, actual) => {
      const correction = { documentType: 110, folio: 1, date: '2026-11-10', code: 2 as const }
      const items = [{ name: 'Uva de mesa', quantity: 100, unit: 'KN', unitPrice: 12.345, amount }]
      if (actual === undefined) expect(note(112, { items, references: [correction] }).items[0].amount).toBe(0)
      else
        expectError(() => note(112, { items, references: [correction] }), 'TOTAL_MISMATCH', {
          field: 'items[0].amount',
          expected: 0,
          actual,
        })
    },
  )

  // Formato DTE 2.5, field 38 of the detail, as on any other type: a given amount is the one the price gives, to the
  // four decimals the schema holds, and a zero is no exception.
  test('a given amount on a priced line is the quantity by the price, or it is refused', () => {
    const priced = { name: 'Uva de mesa', quantity: 100, unit: 'KN', unitPrice: 12.345 }
    expect(exportOf({ items: [{ ...priced, amount: 1234.50001 }] }).items[0].amount).toBe(1234.5)
    for (const amount of [1234.6, 0])
      expectError(() => exportOf({ items: [{ ...priced, amount }] }), 'TOTAL_MISMATCH', {
        field: 'items[0].amount',
        expected: 1234.5,
        actual: amount,
      })
  })

  // 150 000 000 000 guaranies and 120 000 000 000 pesos are exports of some twenty and some hundred million dollars.
  test.each([
    ['eleven digits and four decimals', 99999999999.9999],
    ['a whole amount of twelve digits', 150_000_000_000],
    ['twelve digits and a decimal', 123_456_789_012.5],
    ['the largest whole amount of the schema', 99_999_999_999_999],
  ])('an amount of %s is written as it is given, up to what the schema admits', (_label, amount) => {
    const doc = exportOf({ items: [{ name: 'Granel', quantity: 1, unit: 'KN', amount }] })
    expect(doc.items[0].amount).toBe(amount)
    expect(doc.header.totals).toEqual({ exemptAmount: amount, totalAmount: amount })
    expectError(() => exportOf({ totals: { totalAmount: 1e14 } }), 'INVALID_AMOUNT', { field: 'totals.totalAmount' })
  })

  test('an amount worked out with more digits than a number holds is refused, and not written as another', () => {
    // 1 000 001 by 3 000 000.0001 is 3 000 003 000 100.0001, and the nearest number is 3 000 003 000 100.
    const line = { name: 'Granel', quantity: 1_000_001, unit: 'KN', unitPrice: 3_000_000.0001 }
    expectError(() => exportOf({ items: [line] }), 'INVALID_AMOUNT', { value: '3000003000100.0001' })
    // Two amounts a number holds, and a sum it does not.
    const lines = [
      { name: 'Granel', quantity: 1, unit: 'KN', amount: 3_000_003_000_100 },
      { name: 'Ajuste', quantity: 1, unit: 'U', amount: 0.0001 },
    ]
    expectError(() => exportOf({ items: lines }), 'INVALID_AMOUNT', { value: '3000003000100.0001' })
  })

  test.each<[string, LineItemInput, string]>([
    [
      'a discount',
      { name: 'Muestra', quantity: 1, unit: 'U', unitPrice: 4.99, discountPercent: 10 },
      'discountPercent',
    ],
    [
      'a surcharge',
      { name: 'Muestra', quantity: 1, unit: 'U', unitPrice: 4.99, surchargePercent: 10 },
      'surchargePercent',
    ],
    [
      'a discount on a line with an amount and no price',
      { name: 'Ajuste', quantity: 1, unit: 'U', amount: 100, discountPercent: 5 },
      'discountPercent',
    ],
  ])('%s in percent whose whole amount is zero is refused: a percent goes with its amount', (_label, item, field) => {
    // Formato DTE 2.5, fields 30 and 34 of the detail. On an export line the amount is a whole number of a currency
    // whose unit is worth much, so 10 % of 4.99 rounds to none, and the percent would be written alone.
    expectError(() => exportOf({ items: [item] }), 'INVALID_AMOUNT', { field: `items[0].${field}` })
  })

  test('the global adjustments apply to the exempt amount, in order', () => {
    const doc = exportOf({
      globalAdjustments: [
        { kind: 'surcharge', valueType: 'amount', value: 150.25, description: 'Flete', exemptIndicator: 1 },
        { kind: 'discount', valueType: 'percent', value: 3.33, exemptIndicator: 1 },
      ],
    })
    // 1234.5 + 150.25 = 1384.75; its 3.33 % is 46.112175, 46.1122 to four decimals.
    expect(doc.header.totals).toEqual({ exemptAmount: 1338.6378, totalAmount: 1338.6378 })
    expectError(
      () =>
        exportOf({ globalAdjustments: [{ kind: 'discount', valueType: 'amount', value: 2000, exemptIndicator: 1 }] }),
      'INVALID_AMOUNT',
      { field: 'totals.exemptAmount' },
    )
  })

  test('non-billable lines are not totalled: Exportaciones has no MontoNF', () => {
    const doc = exportOf({ items: [line, { ...line, name: 'Muestra', exemptIndicator: 2 }, { ...line, exempt: true }] })
    expect(doc.items.map((item) => item.exemptIndicator)).toEqual([undefined, 2, 1])
    expect(doc.header.totals).toEqual({ exemptAmount: 2469, totalAmount: 2469 })
  })

  test('an export without payment (FmaPagExp 21) has a total of zero', () => {
    expect(exportOf({ options: { exportPaymentTerms: '21' } }).header.totals).toEqual({
      exemptAmount: 1234.5,
      totalAmount: 0,
    })
    expect(exportOf({ options: { exportPaymentTerms: '2' } }).header.options).toEqual({ exportPaymentTerms: '2' })
  })

  test('totals given by the caller are checked: four decimals, from zero up, and a total that is the exempt amount', () => {
    expect(exportOf({ totals: { exemptAmount: 99.5, totalAmount: 99.5 } }).header.totals).toEqual({
      exemptAmount: 99.5,
      totalAmount: 99.5,
    })
    expect(exportOf({ totals: { totalAmount: 0 } }).header.totals).toEqual({ totalAmount: 0 })
    expect(exportOf({ totals: { totalAmount: 0 }, exchangeRate: 950 }).header.otherCurrency).toEqual({
      currency: 'PESO CL',
      exchangeRate: 950,
      exemptAmount: 0,
      totalAmount: 0,
    })
    expectError(() => exportOf({ totals: { exemptAmount: 99.5, totalAmount: 100 } }), 'TOTAL_MISMATCH', {
      field: 'totals.totalAmount',
      expected: 99.5,
      actual: 100,
    })
    expectError(
      () => exportOf({ options: { exportPaymentTerms: '21' }, totals: { exemptAmount: 5, totalAmount: 5 } }),
      'TOTAL_MISMATCH',
      { expected: 0, actual: 5 },
    )
    expectError(() => exportOf({ totals: { exemptAmount: 1.00001, totalAmount: 1.00001 } }), 'INVALID_AMOUNT', {
      field: 'totals.exemptAmount',
    })
    expectError(() => exportOf({ totals: { exemptAmount: 1, totalAmount: -1 } }), 'INVALID_AMOUNT', {
      field: 'totals.totalAmount',
    })
    expectError(() => exportOf({ totals: { totalAmount: 1e14 } }), 'INVALID_AMOUNT', { field: 'totals.totalAmount' })
  })

  test.each<[string, Partial<DocumentInput>]>([
    ['pricesIncludeVat', { pricesIncludeVat: true }],
    ['withholdVat', { withholdVat: true }],
    ['commissions', { commissions: [{ kind: 'commission', description: 'Comisión', netValue: 10 }] }],
    ['options.noDebitReduction', { options: { noDebitReduction: 1 } }],
    ['options.transferType', { options: { transferType: 9 } }],
    ['options.printFormat', { options: { printFormat: 'T' } }],
    ['options.grossAmounts', { options: { grossAmounts: 1 } }],
    ['options.purchaseTransactionType', { options: { purchaseTransactionType: 1 } }],
    ['options.saleTransactionType', { options: { saleTransactionType: 1 } }],
    ['options.netAmountsIndicator', { options: { netAmountsIndicator: 2 } }],
    ['options.serviceIndicator', { options: { serviceIndicator: 1 } }],
    ['options.serviceIndicator', { options: { serviceIndicator: 2 } }],
    ['options.exportPaymentTerms', { options: { exportPaymentTerms: 'A1' } }],
    ['options.exportPaymentTerms', { options: { exportPaymentTerms: '100' } }],
    ['options.exportPaymentTerms', { options: { exportPaymentTerms: '00' } }],
    ['totals.netAmount', { totals: { netAmount: 10, exemptAmount: 0, totalAmount: 10 } }],
    ['totals.vatRate', { totals: { vatRate: 19, totalAmount: 0 } }],
    ['totals.vatAmount', { totals: { vatAmount: 0, totalAmount: 0 } }],
    ['totals.withholdings', { totals: { withholdings: [{ taxCode: 15, rate: 19, amount: 1 }], totalAmount: 0 } }],
    ['totals.commissions', { totals: { commissions: { netValue: 1 }, totalAmount: 0 } }],
    ['totals.nonBillableAmount', { totals: { nonBillableAmount: 1, totalAmount: 0 } }],
    ['totals.periodAmount', { totals: { periodAmount: 0, totalAmount: 0 } }],
    ['totals.amountDue', { totals: { amountDue: 0, totalAmount: 0 } }],
    ['transport.trailerLicensePlate', { transport: { trailerLicensePlate: 'JK1234', customs } }],
    ['transport.departureDate', { transport: { departureDate: '2026-11-15', customs } }],
    ['transport.departureTime', { transport: { departureTime: '08:30', customs } }],
    ['transport.arrivalDate', { transport: { arrivalDate: '2026-11-16', customs } }],
    ['items[0].withholdingAgent', { items: [{ ...line, withholdingAgent: {} }] }],
    ['items[0].additionalTaxCodes', { items: [{ ...line, additionalTaxCodes: [27] }] }],
    [
      'globalAdjustments[0].exemptIndicator',
      { globalAdjustments: [{ kind: 'discount', valueType: 'amount', value: 1 }] },
    ],
    [
      'globalAdjustments[0].exemptIndicator',
      { globalAdjustments: [{ kind: 'discount', valueType: 'amount', value: 1, exemptIndicator: 2 }] },
    ],
    ['currency', { currency: 'DOLLAR' as Currency }],
    ['receiver.rut', { receiver: { ...foreign, rut: RECEIVER_RUT } }],
    ['items[0].settledDocumentType', { items: [{ ...line, settledDocumentType: '33' }] }],
    [
      'transport.customs.packages',
      {
        transport: {
          customs: {
            ...customs,
            totalPackages: 11,
            packages: Array.from({ length: 11 }, () => ({ code: 13, count: 1 })),
          },
        },
      },
    ],
    ['transport.customs.saleModality', { transport: { customs: { ...customs, saleModality: 100 } } }],
    ['transport.customs.saleClause', { transport: { customs: { ...customs, saleClause: 0 } } }],
    ['transport.customs.transportRoute', { transport: { customs: { ...customs, transportRoute: 1.5 } } }],
    ['transport.customs.loadingPort', { transport: { customs: { ...customs, loadingPort: 10000 } } }],
    ['transport.customs.receiverCountry', { transport: { customs: { ...customs, receiverCountry: 1000 } } }],
    [
      'transport.customs.packages[0].code',
      { transport: { customs: { ...customs, totalPackages: 1, packages: [{ code: 1000 }] } } },
    ],
  ])('%s is refused: Exportaciones does not declare or admit what it writes', (field, overrides) => {
    expectError(() => exportOf(overrides), 'INVALID_OPTION', { field })
  })

  test.each<[string, Partial<DocumentInput>]>([
    ['currency', { currency: undefined }],
    ['receiver.city', { receiver: { ...foreign, city: undefined } }],
    ['receiver.address', { receiver: { ...foreign, address: undefined } }],
    ['options.paymentTermsNote', { options: { paymentTermsCode: 'FRF' } }],
    ['transport.customs.receiverCountry', { transport: undefined }],
    ['transport.customs.receiverCountry', { transport: { customs: { ...customs, receiverCountry: undefined } } }],
    ['transport.customs.saleModality', { transport: { customs: { ...customs, saleModality: undefined } } }],
    ['transport.customs.saleClause', { transport: { customs: { ...customs, saleClause: undefined } } }],
    ['transport.customs.saleClauseTotal', { transport: { customs: { ...customs, saleClauseTotal: undefined } } }],
    ['transport.customs.transportRoute', { transport: { customs: { ...customs, transportRoute: undefined } } }],
    ['transport.customs.tareUnit', { transport: { customs: { ...customs, tare: 100 } } }],
    ['transport.customs.grossWeightUnit', { transport: { customs: { ...customs, grossWeight: 100.5 } } }],
    ['transport.customs.netWeightUnit', { transport: { customs: { ...customs, netWeight: 90.25 } } }],
    ['transport.customs.totalPackages', { transport: { customs: { ...customs, packages: [{ code: 13, count: 2 }] } } }],
    ['items[0].quantity', { items: [{ name: 'Granel', unit: 'KN', amount: 10 }] }],
    ['items[0].unit', { items: [{ name: 'Granel', quantity: 1, unitPrice: 10 }] }],
  ])('%s is required on an export invoice', (field, overrides) => {
    expectError(() => exportOf(overrides), 'MISSING_FIELD', { field })
  })

  test.each([
    [3, 'transport.customs.transportRoute'],
    [4, undefined],
    [5, 'transport.customs.transportRoute'],
    [6, 'items[0].quantity'],
  ] as const)('service indicator %p excuses what Formato DTE 2.5 says it excuses', (serviceIndicator, required) => {
    const bare = {
      transport: { customs: { receiverCountry: 225 } },
      items: [{ name: 'Servicio', amount: 100 }],
      options: { serviceIndicator },
    }
    if (required === undefined) expect(exportOf(bare).header.totals.totalAmount).toBe(100)
    else expectError(() => exportOf(bare), 'MISSING_FIELD', { field: required })
  })

  test('service indicator 6 is excused of nothing: the sale clause is asked for too', () => {
    expectError(
      () => exportOf({ transport: { customs: { receiverCountry: 225 } }, options: { serviceIndicator: 6 } }),
      'MISSING_FIELD',
      { field: 'transport.customs.saleModality' },
    )
    expect(exportOf({ options: { serviceIndicator: 6 } }).header.options).toEqual({ serviceIndicator: 6 })
  })

  test.each([111, 112] as const)(
    'an export note (%p) asks for none of it, and its commune is not asked either',
    (type) => {
      const doc = note(type)
      expect(doc.header.totals).toEqual({ exemptAmount: 10.5, totalAmount: 10.5 })
      expect(doc.header.receiver.commune).toBeUndefined()
      expect(note(type, { transport: { customs: { totalPackages: 1 } } }).header.transport).toEqual({
        customs: { totalPackages: 1 },
      })
      expectError(() => note(type, { transport: { customs: { packages: [{ code: 13 }] } } }), 'MISSING_FIELD', {
        field: 'transport.customs.totalPackages',
      })
      expectError(() => note(type, { options: { paymentTermsCode: 'FRF' } }), 'MISSING_FIELD', {
        field: 'options.paymentTermsNote',
      })
    },
  )

  test('the customs area is normalized: codes, counts, weights to two decimals, amounts to four, texts and the RUT', () => {
    const doc = exportOf({
      transport: {
        licensePlate: 'ABCD12',
        customs: {
          ...customs,
          saleClauseTotal: 1234.567,
          transportName: '  MV Pacific Star ',
          carrierRut: '12.345.678-5',
          carrierName: 'Naviera del Sur',
          carrierAdditionalId: 'NV-1',
          booking: 'BK-1',
          operator: 'OP-1',
          loadingPort: 906,
          loadingPortAdditionalId: 'SAI',
          unloadingPort: 211,
          unloadingPortAdditionalId: 'MIA',
          tare: 2200,
          tareUnit: 6,
          grossWeight: 18450.756,
          grossWeightUnit: 6,
          netWeight: 16250.5,
          netWeightUnit: 6,
          totalItems: 1,
          totalPackages: 1,
          packages: [
            { code: 75, count: 1, marks: 'CONT 1', containerId: 'MSCU1234565', seal: 'SL-1', sealIssuer: 'Aduana' },
          ],
          freight: 1250.123456,
          insurance: 75.5,
          destinationCountry: 225,
        },
      },
    })
    expect(doc.header.transport).toEqual({
      licensePlate: 'ABCD12',
      customs: {
        ...customs,
        saleClauseTotal: 1234.57,
        transportName: 'MV Pacific Star',
        carrierRut: RECEIVER_RUT,
        carrierName: 'Naviera del Sur',
        carrierAdditionalId: 'NV-1',
        booking: 'BK-1',
        operator: 'OP-1',
        loadingPort: 906,
        loadingPortAdditionalId: 'SAI',
        unloadingPort: 211,
        unloadingPortAdditionalId: 'MIA',
        tare: 2200,
        tareUnit: 6,
        grossWeight: 18450.76,
        grossWeightUnit: 6,
        netWeight: 16250.5,
        netWeightUnit: 6,
        totalItems: 1,
        totalPackages: 1,
        packages: [
          { code: 75, count: 1, marks: 'CONT 1', containerId: 'MSCU1234565', seal: 'SL-1', sealIssuer: 'Aduana' },
        ],
        freight: 1250.1235,
        insurance: 75.5,
        destinationCountry: 225,
      },
    })
  })

  test.each([
    ['freight', 0],
    ['insurance', -1],
    ['saleClauseTotal', 0.001],
    ['grossWeight', 100_000_000],
  ] as const)('a %s of %p is refused', (field, value) => {
    expectError(() => exportOf({ transport: { customs: { ...customs, [field]: value } } }), 'INVALID_AMOUNT', {
      field: `transport.customs.${field}`,
    })
  })

  test('the issuer, the foreign receiver and a reference carry the identifiers only Exportaciones declares', () => {
    const doc = exportOf({
      issuer: { ...issuer, additionalBranchCode: ' CL-01 ', additionalId: 'EXP-7' },
      receiver: {
        ...foreign,
        commune: 'Florida',
        foreign: { id: '59-1234567', nationality: '225', additionalId: 'VAT-1' },
      },
      references: [{ documentType: 807, folio: '123', date: '2026-11-10', otherAdditionalId: 'DUS-1' }],
    })
    expect(doc.header.issuer).toMatchObject({ additionalBranchCode: 'CL-01', additionalId: 'EXP-7' })
    expect(doc.header.receiver).toMatchObject({
      commune: 'Florida',
      foreign: { id: '59-1234567', nationality: '225', additionalId: 'VAT-1' },
    })
    expect(doc.references[0].otherAdditionalId).toBe('DUS-1')
    expect(exportOf({ receiver: { ...foreign, foreign: { id: ' ' } } }).header.receiver.foreign).toBeUndefined()
    expectError(() => exportOf({ receiver: { ...foreign, foreign: { nationality: 'USA1' } } }), 'FIELD_TOO_LONG', {
      field: 'Nacionalidad',
    })
  })

  test.each<[string, Partial<DocumentInput>]>([
    ['currency', { currency: 'DOLAR USA' }],
    ['exchangeRate', { exchangeRate: 950 }],
    ['issuer.additionalBranchCode', { issuer: { ...issuer, additionalBranchCode: 'CL-01' } }],
    ['issuer.additionalId', { issuer: { ...issuer, additionalId: 'EXP-7' } }],
    ['receiver.foreign', { receiver: { ...receiver, foreign: {} } }],
    ['transport.customs', { transport: { customs: {} } }],
    [
      'references[0].otherAdditionalId',
      { references: [{ documentType: 33, folio: 1, date: '2026-11-10', otherAdditionalId: 'X' }] },
    ],
    ['options.serviceIndicator', { options: { serviceIndicator: 5 } }],
    ['options.serviceIndicator', { options: { serviceIndicator: 6 } }],
  ])('%s is refused on an invoice: only Exportaciones declares or admits it', (field, overrides) => {
    expectError(() => createDocument({ type: 33, folio: 1, issuer, receiver, items, ...overrides }), 'INVALID_OPTION', {
      field,
    })
  })

  test('a receipt refuses them too', () => {
    expectError(() => createDocument({ type: 39, folio: 1, issuer, items, currency: 'EURO' }), 'INVALID_OPTION', {
      field: 'currency',
    })
  })

  test('it admits 60 lines', () => {
    expect(exportOf({ items: Array.from({ length: 60 }, () => line) }).items).toHaveLength(60)
    expectError(() => exportOf({ items: Array.from({ length: 61 }, () => line) }), 'INVALID_OPTION', { field: 'items' })
  })
})
