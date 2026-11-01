import { calculateLineAmount, calculateTotals } from '../src/totals/calculate'

const line = (amount: number, exemptIndicator?: 1 | 2 | 3 | 4 | 5 | 6) => ({ amount, exemptIndicator })

describe('calculateLineAmount', () => {
  test.each([
    [
      { quantity: 2, unitPrice: 1000 },
      { base: 2000, discountAmount: 0, surchargeAmount: 0, amount: 2000 },
    ],
    [
      { quantity: 1.5, unitPrice: 333 },
      { base: 500, discountAmount: 0, surchargeAmount: 0, amount: 500 },
    ],
    [
      { quantity: 3, unitPrice: 1000, discountPercent: 10 },
      { base: 3000, discountAmount: 300, surchargeAmount: 0, amount: 2700 },
    ],
    [
      { quantity: 1, unitPrice: 1000, surchargePercent: 5 },
      { base: 1000, discountAmount: 0, surchargeAmount: 50, amount: 1050 },
    ],
    [{}, { base: 0, discountAmount: 0, surchargeAmount: 0, amount: 0 }],
    [{ unitPrice: 999 }, { base: 999, discountAmount: 0, surchargeAmount: 0, amount: 999 }],
  ])('%p → %p', (input, expected) => {
    expect(calculateLineAmount(input)).toEqual(expected)
  })
})

describe('calculateTotals', () => {
  test('invoice, net prices', () => {
    expect(calculateTotals([line(1680)], { type: 33 })).toEqual({
      netAmount: 1680,
      vatRate: 19,
      vatAmount: 319,
      totalAmount: 1999,
    })
  })

  test('invoice with VAT-included prices derives net and VAT from the gross', () => {
    expect(calculateTotals([line(2000)], { type: 33, pricesIncludeVat: true })).toEqual({
      netAmount: 1681,
      vatRate: 19,
      vatAmount: 319,
      totalAmount: 2000,
    })
    expect(calculateTotals([line(1018)], { type: 33, pricesIncludeVat: true })).toEqual({
      netAmount: 855,
      vatRate: 19,
      vatAmount: 163,
      totalAmount: 1018,
    })
    expect(calculateTotals([line(1005)], { type: 33, pricesIncludeVat: true })).toEqual({
      netAmount: 845,
      vatRate: 19,
      vatAmount: 160,
      totalAmount: 1005,
    })
  })

  test('affected + exempt keeps exempt out of the net, keys in schema order', () => {
    const totals = calculateTotals([line(2000), line(500, 1)], { type: 33, pricesIncludeVat: true })
    expect(Object.keys(totals)).toEqual(['netAmount', 'exemptAmount', 'vatRate', 'vatAmount', 'totalAmount'])
    expect(totals).toEqual({ netAmount: 1681, exemptAmount: 500, vatRate: 19, vatAmount: 319, totalAmount: 2500 })
  })

  test('receipt: no vatRate, gross by default', () => {
    expect(calculateTotals([line(2000)], { type: 39, pricesIncludeVat: true })).toEqual({
      netAmount: 1681,
      vatAmount: 319,
      totalAmount: 2000,
    })
  })

  test('only exempt lines: no net, no VAT', () => {
    expect(calculateTotals([line(500, 1)], { type: 33 })).toEqual({ exemptAmount: 500, totalAmount: 500 })
  })

  test('non-billable lines go to nonBillableAmount and stay out of the total', () => {
    expect(calculateTotals([line(1000), line(300, 2), line(-50, 6)], { type: 33 })).toEqual({
      netAmount: 1000,
      vatRate: 19,
      vatAmount: 190,
      totalAmount: 1190,
      nonBillableAmount: 250,
    })
  })

  test('purchase invoice withholds the whole VAT', () => {
    expect(calculateTotals([line(1000)], { type: 46 })).toEqual({
      netAmount: 1000,
      vatRate: 19,
      vatAmount: 190,
      withholdings: [{ taxCode: 15, rate: 19, amount: 190 }],
      totalAmount: 1000,
    })
  })

  test('global percent discount applies to the affected base', () => {
    const totals = calculateTotals([line(1000), line(500, 1)], {
      type: 33,
      globalAdjustments: [{ lineNumber: 1, kind: 'discount', valueType: 'percent', value: 10 }],
    })
    expect(totals).toEqual({ netAmount: 900, exemptAmount: 500, vatRate: 19, vatAmount: 171, totalAmount: 1571 })
  })

  test('global amount surcharge on exempt base', () => {
    const totals = calculateTotals([line(1000), line(500, 1)], {
      type: 33,
      globalAdjustments: [{ lineNumber: 1, kind: 'surcharge', valueType: 'amount', value: 100, exemptIndicator: 1 }],
    })
    expect(totals).toEqual({ netAmount: 1000, exemptAmount: 600, vatRate: 19, vatAmount: 190, totalAmount: 1790 })
  })

  test('global adjustments on the non-billable base stay out of the total', () => {
    const totals = calculateTotals([line(1000), line(300, 2)], {
      type: 33,
      globalAdjustments: [{ lineNumber: 1, kind: 'discount', valueType: 'percent', value: 50, exemptIndicator: 2 }],
    })
    expect(totals).toEqual({ netAmount: 1000, vatRate: 19, vatAmount: 190, nonBillableAmount: 150, totalAmount: 1190 })
  })

  test('no amounts at all (transfer without values)', () => {
    expect(calculateTotals([line(0)], { type: 52 })).toEqual({ vatRate: 19, totalAmount: 0 })
    expect(calculateTotals([], { type: 39 })).toEqual({ totalAmount: 0 })
  })

  test('custom VAT rate', () => {
    expect(calculateTotals([line(1000)], { type: 33, vatRate: 10 })).toEqual({
      netAmount: 1000,
      vatRate: 10,
      vatAmount: 100,
      totalAmount: 1100,
    })
  })
})
