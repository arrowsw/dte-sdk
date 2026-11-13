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
