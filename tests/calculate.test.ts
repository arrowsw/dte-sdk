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

// Formato DTE 2.5: fields 121 to 123 of the header are the sums of the commission lines, and field 124, `MntTotal`,
// takes the three of them off the total. A line's `ValComIVA` is its net value by the VAT rate.
describe('calculateTotals with commissions and other charges', () => {
  test('sums the lines into the summary, in schema order, and takes them off the total', () => {
    const totals = calculateTotals([line(10000)], {
      type: 43,
      commissions: [{ netValue: 1000, exemptValue: 0, vatValue: 190 }],
    })
    expect(Object.keys(totals)).toEqual(['netAmount', 'vatRate', 'vatAmount', 'commissions', 'totalAmount'])
    expect(totals).toEqual({
      netAmount: 10000,
      vatRate: 19,
      vatAmount: 1900,
      commissions: { netValue: 1000, vatValue: 190 },
      totalAmount: 10710,
    })
  })

  test.each([
    [1000, 190],
    [1005, 191],
    [1050, 200],
    [-1050, -200],
    [-1005, -191],
    [2, 0],
  ])('a line of net %p without a VAT value gets %p: its net by the rate, rounded half away from zero', (net, vat) => {
    const { commissions, totalAmount } = calculateTotals([line(10000)], { type: 43, commissions: [{ netValue: net }] })
    expect(commissions).toEqual(vat === 0 ? { netValue: net } : { netValue: net, vatValue: vat })
    expect(totalAmount).toBe(11900 - net - vat)
  })

  test("a line's own VAT value rules over its net by the rate", () => {
    expect(
      calculateTotals([line(10000)], { type: 43, commissions: [{ netValue: 1000, vatValue: 0 }] }).commissions,
    ).toEqual({ netValue: 1000 })
    expect(
      calculateTotals([line(10000)], { type: 43, commissions: [{ netValue: 1000, vatValue: 200 }] }),
    ).toMatchObject({ commissions: { netValue: 1000, vatValue: 200 }, totalAmount: 10700 })
  })

  test('the VAT of the summary is the sum of the VAT of the lines, each rounded on its own', () => {
    // Three charges of 1,003 net: 190.57 each, so 191 a line and 573 in all. One rounding over 3,009 would give 572.
    const three = [{ netValue: 1003 }, { netValue: 1003 }, { netValue: 1003 }]
    expect(calculateTotals([line(10000)], { type: 43, commissions: three })).toMatchObject({
      commissions: { netValue: 3009, vatValue: 573 },
      totalAmount: 11900 - 3009 - 573,
    })
  })

  test('exempt charges are summed apart, and a rate of its own applies to the VAT of the lines', () => {
    expect(
      calculateTotals([line(10000)], {
        type: 43,
        vatRate: 10,
        commissions: [{ netValue: 1000 }, { exemptValue: 300 }, { netValue: 0, exemptValue: 200 }],
      }),
    ).toEqual({
      netAmount: 10000,
      vatRate: 10,
      vatAmount: 1000,
      commissions: { netValue: 1000, exemptValue: 500, vatValue: 100 },
      totalAmount: 11000 - 1000 - 500 - 100,
    })
  })

  test('a settlement invoice whose charges equal or exceed what it settles totals zero or less', () => {
    expect(calculateTotals([line(1000)], { type: 43, commissions: [{ netValue: 1000 }] })).toEqual({
      netAmount: 1000,
      vatRate: 19,
      vatAmount: 190,
      commissions: { netValue: 1000, vatValue: 190 },
      totalAmount: 0,
    })
    expect(calculateTotals([line(1000)], { type: 43, commissions: [{ netValue: 2000 }] }).totalAmount).toBe(-1190)
  })

  test('charges on a settlement invoice with no amounts leave a negative total', () => {
    expect(calculateTotals([line(0)], { type: 43, commissions: [{ netValue: 100 }] })).toEqual({
      commissions: { netValue: 100, vatValue: 19 },
      totalAmount: -119,
    })
  })

  test('lines that cancel each other out leave no summary', () => {
    expect(
      calculateTotals([line(1000)], {
        type: 43,
        commissions: [{ netValue: 100 }, { netValue: -100 }, { exemptValue: 5 }, { exemptValue: -5 }],
      }),
    ).toEqual({ netAmount: 1000, vatRate: 19, vatAmount: 190, totalAmount: 1190 })
  })

  test('a value that adds up to zero is left out of the summary, and the others stay', () => {
    expect(calculateTotals([line(10000)], { type: 43, commissions: [{ exemptValue: 500 }] })).toMatchObject({
      commissions: { exemptValue: 500 },
      totalAmount: 11400,
    })
    expect(
      calculateTotals([line(10000)], {
        type: 43,
        commissions: [{ netValue: 100 }, { netValue: -100, vatValue: 0 }],
      }),
    ).toMatchObject({ commissions: { vatValue: 19 }, totalAmount: 11881 })
  })

  test('a purchase invoice takes them off after withholding its VAT', () => {
    const totals = calculateTotals([line(1000)], { type: 46, commissions: [{ netValue: 100 }] })
    expect(Object.keys(totals)).toEqual([
      'netAmount',
      'vatRate',
      'vatAmount',
      'withholdings',
      'commissions',
      'totalAmount',
    ])
    expect(totals).toMatchObject({ commissions: { netValue: 100, vatValue: 19 }, totalAmount: 881 })
  })

  test('no commission lines, or an empty list, change nothing', () => {
    const plain = { netAmount: 1000, vatRate: 19, vatAmount: 190, totalAmount: 1190 }
    expect(calculateTotals([line(1000)], { type: 43 })).toEqual(plain)
    expect(calculateTotals([line(1000)], { type: 43, commissions: [] })).toEqual(plain)
  })
})

// Formato DTE 2.5 admits negative values on a settlement invoice for `MntNeto`, `MntExe`, `IVA` and `MntTotal`, and
// `Liquidacion` declares them as signed values and has no `MontoNF`.
describe('calculateTotals on a settlement invoice (43)', () => {
  test('negative lines keep their sign in the net, the VAT and the total', () => {
    expect(calculateTotals([line(-1000)], { type: 43 })).toEqual({
      netAmount: -1000,
      vatRate: 19,
      vatAmount: -190,
      totalAmount: -1190,
    })
    expect(calculateTotals([line(-1050)], { type: 43 }).vatAmount).toBe(-200)
  })

  test('negative exempt lines keep their sign', () => {
    expect(calculateTotals([line(-500, 1)], { type: 43 })).toEqual({ exemptAmount: -500, totalAmount: -500 })
    expect(calculateTotals([line(1000), line(-500, 1)], { type: 43 })).toEqual({
      netAmount: 1000,
      exemptAmount: -500,
      vatRate: 19,
      vatAmount: 190,
      totalAmount: 690,
    })
  })

  test('negative lines with VAT-included prices derive a negative net and VAT from the gross', () => {
    expect(calculateTotals([line(-2000)], { type: 43, pricesIncludeVat: true })).toEqual({
      netAmount: -1681,
      vatRate: 19,
      vatAmount: -319,
      totalAmount: -2000,
    })
  })

  test('negative charges add to the total', () => {
    expect(calculateTotals([line(-1000)], { type: 43, commissions: [{ netValue: -100 }] })).toEqual({
      netAmount: -1000,
      vatRate: 19,
      vatAmount: -190,
      commissions: { netValue: -100, vatValue: -19 },
      totalAmount: -1071,
    })
  })

  test('lines that add up to zero leave the total alone', () => {
    expect(calculateTotals([line(1000), line(-1000)], { type: 43 })).toEqual({ vatRate: 19, totalAmount: 0 })
  })

  test('non-billable lines stay out of the totals, which have no nonBillableAmount', () => {
    expect(calculateTotals([line(1000), line(-300, 2)], { type: 43 })).toEqual({
      netAmount: 1000,
      vatRate: 19,
      vatAmount: 190,
      totalAmount: 1190,
    })
    expect(calculateTotals([line(-300, 2)], { type: 43 })).toEqual({ vatRate: 19, totalAmount: 0 })
  })

  test('any other type still drops a negative net and reports its non-billable amount', () => {
    expect(calculateTotals([line(-1000)], { type: 33 })).toEqual({ vatRate: 19, totalAmount: 0 })
    expect(calculateTotals([line(-300, 2)], { type: 33 })).toEqual({ totalAmount: 0, nonBillableAmount: -300 })
  })
})
