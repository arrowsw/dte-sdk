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
      options: { serviceIndicator: 1, dueDate: '2026-12-01' },
    })
    expect(doc.header.options).toEqual({ serviceIndicator: 1, dueDate: '2026-12-01' })
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

  test('the largest values the schema admits pass', () => {
    const doc = line({ name: 'Lote', quantity: 999_999_999_999.999, unitPrice: 0.000001, discountPercent: 999.99 })
    expect(doc.items[0]).toMatchObject({ quantity: 999_999_999_999.999, unitPrice: 0.000001, discountPercent: 999.99 })
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
    expect(line({ name: 'Glosa' }).items[0].quantity).toBeUndefined()
    expect(line({ name: 'Pallet', quantity: 2, amount: 0 }).items[0].quantity).toBe(2)
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
      items: [line, { ...line, name: 'No facturable', amount: -300, exemptIndicator: 2 }],
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
