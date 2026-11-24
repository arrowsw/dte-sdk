import { calculateLineAmount, calculateTotals } from '../src/totals/calculate'
import {
  calculateExportLineAmount,
  calculateExportTotals,
  convertToPesos,
  roundHalfAwayFromZero,
} from '../src/totals/export'

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

  // Each of these is a half in decimal digits that binary floating point writes a hair below it: 375 × 9.2 / 100 is
  // 34.49999999999999 there, and 0.145 × 100 is 14.499999999999998.
  test.each([
    [
      { unitPrice: 375, discountPercent: 9.2 },
      { base: 375, discountAmount: 35, surchargeAmount: 0, amount: 340 },
    ],
    [
      { unitPrice: 375, surchargePercent: 16.4 },
      { base: 375, discountAmount: 0, surchargeAmount: 62, amount: 437 },
    ],
    [
      { unitPrice: 250, discountPercent: 64.6 },
      { base: 250, discountAmount: 162, surchargeAmount: 0, amount: 88 },
    ],
    [
      { quantity: 0.145, unitPrice: 100 },
      { base: 15, discountAmount: 0, surchargeAmount: 0, amount: 15 },
    ],
    [
      { quantity: 0.009, unitPrice: 1500 },
      { base: 14, discountAmount: 0, surchargeAmount: 0, amount: 14 },
    ],
  ])('a half in decimal digits rounds away from zero: %p → %p', (input, expected) => {
    expect(calculateLineAmount(input)).toEqual(expected)
  })

  test('a negative half rounds away from zero too', () => {
    expect(calculateLineAmount({ quantity: 1, unitPrice: -14.5 })).toEqual({
      base: -15,
      discountAmount: 0,
      surchargeAmount: 0,
      amount: -15,
    })
  })

  test('the quantity and the price are taken with the six decimals the schema holds, and a percent with two', () => {
    expect(calculateLineAmount({ quantity: 2.4999996, unitPrice: 1 })).toMatchObject({ base: 3, amount: 3 })
    expect(calculateLineAmount({ unitPrice: 100000, discountPercent: 4.994 })).toMatchObject({
      discountAmount: 4990,
      amount: 95010,
    })
  })

  test('an amount with more digits than a number holds is refused, and so is an input that is not finite', () => {
    expect(() => calculateLineAmount({ quantity: 123456789, unitPrice: 123456789 })).toThrow(
      expect.objectContaining({ code: 'INVALID_AMOUNT', details: { value: '15241578750190521' } }),
    )
    expect(() => calculateLineAmount({ quantity: Number.NaN, unitPrice: 1000 })).toThrow(
      expect.objectContaining({ code: 'INVALID_AMOUNT', details: { value: 'NaN' } }),
    )
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

  // Formato DTE 2.5, field 125: `MontoNF` is the lines with `IndExe` 2 less the lines with `IndExe` 6, and may be
  // negative.
  test('non-billable lines go to nonBillableAmount, less the IndExe 6 ones, and stay out of the total', () => {
    expect(calculateTotals([line(1000), line(1000, 2), line(400, 6)], { type: 33 })).toEqual({
      netAmount: 1000,
      vatRate: 19,
      vatAmount: 190,
      totalAmount: 1190,
      nonBillableAmount: 600,
    })
  })

  test('the non-billable amount is negative when the IndExe 6 lines are larger', () => {
    expect(calculateTotals([line(1000), line(300, 2), line(500, 6)], { type: 33 })).toEqual({
      netAmount: 1000,
      vatRate: 19,
      vatAmount: 190,
      totalAmount: 1190,
      nonBillableAmount: -200,
    })
    expect(calculateTotals([line(700, 6)], { type: 39 })).toEqual({ totalAmount: 0, nonBillableAmount: -700 })
  })

  test('IndExe 2 and 6 lines that cancel out leave no non-billable amount', () => {
    expect(calculateTotals([line(1000), line(400, 2), line(400, 6)], { type: 33 })).toEqual({
      netAmount: 1000,
      vatRate: 19,
      vatAmount: 190,
      totalAmount: 1190,
    })
  })

  test('lines that are not a sale (IndExe 4) or are to be deducted (IndExe 5) are in no total', () => {
    expect(calculateTotals([line(1000), line(500, 4), line(200, 5)], { type: 52 })).toEqual({
      netAmount: 1000,
      vatRate: 19,
      vatAmount: 190,
      totalAmount: 1190,
    })
  })

  // Formato DTE 2.5, fields 120 and 124: `GrntDep` is the sum of the lines with `IndExe` 3, and `MntTotal` adds it.
  test('deposit guarantee lines go to depositGuarantee and into the total, keys in schema order', () => {
    const totals = calculateTotals([line(1000), line(300, 3), line(200, 3)], { type: 33 })
    expect(Object.keys(totals)).toEqual(['netAmount', 'vatRate', 'vatAmount', 'depositGuarantee', 'totalAmount'])
    expect(totals).toEqual({ netAmount: 1000, vatRate: 19, vatAmount: 190, depositGuarantee: 500, totalAmount: 1690 })
  })

  test.each([34, 56, 61] as const)('a %i reports its deposit guarantee too', (type) => {
    expect(calculateTotals([line(1000, 1), line(300, 3)], { type })).toEqual({
      exemptAmount: 1000,
      depositGuarantee: 300,
      totalAmount: 1300,
    })
  })

  test('a document of deposit guarantee lines alone totals them', () => {
    expect(calculateTotals([line(300, 3)], { type: 33 })).toEqual({ depositGuarantee: 300, totalAmount: 300 })
  })

  test('the deposit guarantee comes before the commissions and is added on a withheld VAT', () => {
    const totals = calculateTotals([line(1000), line(300, 3)], {
      type: 61,
      withholdVat: true,
      commissions: [{ netValue: 100 }],
    })
    expect(Object.keys(totals)).toEqual([
      'netAmount',
      'vatRate',
      'vatAmount',
      'withholdings',
      'depositGuarantee',
      'commissions',
      'totalAmount',
    ])
    expect(totals.totalAmount).toBe(1000 + 300 - 100 - 19)
  })

  // The format gives `GrntDep` to no dispatch guide, purchase invoice or settlement invoice (field 120, code 0), and
  // `createDocument` refuses an `IndExe` 3 line on them.
  test.each([46, 52] as const)('a %i has no deposit guarantee to total', (type) => {
    expect(calculateTotals([line(300, 3)], { type })).toEqual({ vatRate: 19, totalAmount: 0 })
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

  // 9.2 % of 375 is 34.5 and 14.5 % of 100 is 14.5, each a hair below its half in binary floating point.
  test('a global percent is worked out over decimal digits and rounded half away from zero', () => {
    const adjusted = (amount: number, kind: 'discount' | 'surcharge', value: number) =>
      calculateTotals([line(amount)], {
        type: 33,
        globalAdjustments: [{ lineNumber: 1, kind, valueType: 'percent', value }],
      }).netAmount
    expect(adjusted(375, 'discount', 9.2)).toBe(340)
    expect(adjusted(100, 'surcharge', 14.5)).toBe(115)
    expect(adjusted(100, 'discount', 14.5)).toBe(85)
  })

  // A direct caller's numbers are taken as `createDocument` writes them: the value of an adjustment with two decimals,
  // and the amount it applies to as a whole peso, each rounded half away from zero.
  test('a global adjustment takes its value with two decimals and its base as a whole peso', () => {
    const adjusted = (amount: number, valueType: 'amount' | 'percent', value: number) =>
      calculateTotals([line(amount)], {
        type: 33,
        globalAdjustments: [{ lineNumber: 1, kind: 'discount', valueType, value }],
      }).netAmount
    // 0.495 is 0.50, half a peso, and takes one off; 0.494 is 0.49, and takes none.
    expect(adjusted(1000, 'amount', 0.495)).toBe(999)
    expect(adjusted(1000, 'amount', 0.494)).toBe(1000)
    // 0.004 % is 0.00 %.
    expect(adjusted(1_000_000, 'percent', 0.004)).toBe(1_000_000)
    // Half of 10.5 is taken of 11: 5.5, which rounds to 6.
    expect(adjusted(10.5, 'percent', 50)).toBe(4.5)
  })

  test.each([1e21, Number.NaN])('a global adjustment value of %p is refused', (value) => {
    const globalAdjustments = [{ lineNumber: 1, kind: 'discount' as const, valueType: 'amount' as const, value }]
    expect(() => calculateTotals([line(1000)], { type: 33, globalAdjustments })).toThrow(
      expect.objectContaining({ code: 'INVALID_AMOUNT', details: { value: String(value) } }),
    )
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

  test('the VAT of the summary is the rate by the total net value, rounded once, not the sum of the lines', () => {
    // Three charges of 1,003 net: 190.57 each, so 191 a line and 573 if added up. The SII checks the rate by the total
    // net value, 3,009: 571.71, so 572.
    const three = [{ netValue: 1003 }, { netValue: 1003 }, { netValue: 1003 }]
    expect(calculateTotals([line(10000)], { type: 43, commissions: three })).toMatchObject({
      commissions: { netValue: 3009, vatValue: 572 },
      totalAmount: 11900 - 3009 - 572,
    })
    // 630 and -2,197: 120 and -417 a line, -297 if added up, and -298 over the total of -1,567.
    const mixed = [{ netValue: 630 }, { netValue: -2197 }]
    expect(calculateTotals([line(10000)], { type: 43, commissions: mixed })).toMatchObject({
      commissions: { netValue: -1567, vatValue: -298 },
      totalAmount: 11900 + 1567 + 298,
    })
  })

  test('a line that states its VAT makes the summary the sum of the lines, the others at their net by the rate', () => {
    const lines = [{ netValue: 1003, vatValue: 191 }, { netValue: 1003 }, { exemptValue: 50 }]
    expect(calculateTotals([line(10000)], { type: 43, commissions: lines })).toMatchObject({
      commissions: { netValue: 2006, exemptValue: 50, vatValue: 382 },
      totalAmount: 11900 - 2006 - 50 - 382,
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

// The amounts of an export document are in a foreign currency, with four decimals in a line and in the totals and none
// in a line's discount and surcharge, as `Exportaciones` declares them. Each is worked out over the decimal digits of
// the numbers as JavaScript writes them, so binary floating point never decides a rounding.
describe('roundHalfAwayFromZero', () => {
  test.each([
    [1.00005, 4, 1.0001],
    [0.1 + 0.2, 4, 0.3],
    [1.005, 2, 1.01],
    [-2.5, 0, -3],
    [-1.00005, 4, -1.0001],
    [2.4999, 0, 2],
    [1e-7, 6, 0],
    [5e-7, 6, 0.000001],
    [12, 4, 12],
  ])('%p to %p decimals is %p', (value, decimals, expected) => {
    expect(roundHalfAwayFromZero(value, decimals)).toBe(expected)
  })

  const refused = (value: number) =>
    expect.objectContaining({ code: 'INVALID_AMOUNT', details: { value: String(value) } })

  test.each([NaN, Infinity, -Infinity, 1e21, -1e21])('%p has no digits to round, and is refused', (value) => {
    expect(() => roundHalfAwayFromZero(value, 4)).toThrow(refused(value))
  })

  test('the largest number written in digits still rounds, and what is built on the rounding refuses the same', () => {
    expect(roundHalfAwayFromZero(999999999999999900000, 0)).toBe(999999999999999900000)
    expect(() => convertToPesos(NaN, 950)).toThrow(refused(NaN))
    expect(() => convertToPesos(100, Infinity)).toThrow(refused(Infinity))
    expect(() => calculateExportLineAmount({ quantity: Infinity, unitPrice: 1 })).toThrow(refused(Infinity))
    expect(() => calculateExportTotals([{ amount: 1e21 }] as never)).toThrow(refused(1e21))
  })
})

describe('calculateExportLineAmount', () => {
  test.each([
    [
      { quantity: 3, unitPrice: 1234.565 },
      { base: 3703.695, discountAmount: 0, surchargeAmount: 0, amount: 3703.695 },
    ],
    [
      { quantity: 0.333333, unitPrice: 100 },
      { base: 33.3333, discountAmount: 0, surchargeAmount: 0, amount: 33.3333 },
    ],
    // 1.000005 × 1.5 = 1.5000075, which rounds half away from zero to 1.5000 + 0.0001.
    [
      { quantity: 1.000005, unitPrice: 1.5 },
      { base: 1.5, discountAmount: 0, surchargeAmount: 0, amount: 1.5 },
    ],
    [
      { quantity: 1.00005, unitPrice: 1.5 },
      { base: 1.5001, discountAmount: 0, surchargeAmount: 0, amount: 1.5001 },
    ],
    // Its 3 % is 37.035: a whole 37, the only amount `RecargoMonto` admits.
    [
      { quantity: 10, unitPrice: 123.45, surchargePercent: 3 },
      { base: 1234.5, discountAmount: 0, surchargeAmount: 37, amount: 1271.5 },
    ],
    // Its 10 % is 123.45, a whole 123; half a unit rounds away from zero.
    [
      { quantity: 1, unitPrice: 1234.5, discountPercent: 10 },
      { base: 1234.5, discountAmount: 123, surchargeAmount: 0, amount: 1111.5 },
    ],
    [
      { quantity: 1, unitPrice: 25, discountPercent: 10 },
      { base: 25, discountAmount: 3, surchargeAmount: 0, amount: 22 },
    ],
    [{}, { base: 0, discountAmount: 0, surchargeAmount: 0, amount: 0 }],
    [{ unitPrice: 0.1 + 0.2 }, { base: 0.3, discountAmount: 0, surchargeAmount: 0, amount: 0.3 }],
  ])('%p → %p', (input, expected) => {
    expect(calculateExportLineAmount(input)).toEqual(expected)
  })
})

describe('an amount with more digits than a number holds', () => {
  const unheld = (value: string) => expect.objectContaining({ code: 'INVALID_AMOUNT', details: { value } })

  test('is refused with its digits where it would be handed back as another amount', () => {
    expect(() => calculateExportLineAmount({ quantity: 1_000_001, unitPrice: 3_000_000.0001 })).toThrow(
      unheld('3000003000100.0001'),
    )
    expect(() => calculateExportTotals([{ amount: 3_000_003_000_100 }, { amount: 0.0001 }] as never)).toThrow(
      unheld('3000003000100.0001'),
    )
    expect(() => calculateExportTotals([{ amount: -3_000_003_000_100 }, { amount: -0.0001 }] as never)).toThrow(
      unheld('-3000003000100.0001'),
    )
  })

  test('is taken when its number writes it back, sixteen digits and all', () => {
    expect(calculateExportLineAmount({ quantity: 1, unitPrice: 123_456_789_012.3456 }).amount).toBe(
      123_456_789_012.3456,
    )
    expect(calculateExportTotals([{ amount: 150_000_000_000 }, { amount: 0.5 }] as never)).toEqual({
      exemptAmount: 150_000_000_000.5,
      totalAmount: 150_000_000_000.5,
    })
  })
})

describe('calculateExportTotals', () => {
  const adjustment = (kind: 'discount' | 'surcharge', valueType: 'percent' | 'amount', value: number) => ({
    lineNumber: 1,
    kind,
    valueType,
    value,
    exemptIndicator: 1 as const,
  })

  test('the exempt amount is the sum of the lines that are not non-billable, and the total is the exempt amount', () => {
    expect(calculateExportTotals([line(1000.5), line(0.25, 1), line(99, 2), line(7, 6)])).toEqual({
      exemptAmount: 1000.75,
      totalAmount: 1000.75,
    })
    expect(calculateExportTotals([])).toEqual({ exemptAmount: 0, totalAmount: 0 })
  })

  test('the global adjustments apply in order, a percent of the running amount rounded to four decimals', () => {
    const totals = calculateExportTotals([line(1000.5)], {
      globalAdjustments: [adjustment('surcharge', 'amount', 150.25), adjustment('discount', 'percent', 3.33)],
    })
    // 1150.75 less its 3.33 %, 38.319975, which is 38.32 to four decimals.
    expect(totals).toEqual({ exemptAmount: 1112.43, totalAmount: 1112.43 })
    expect(
      calculateExportTotals([line(100)], {
        globalAdjustments: [adjustment('discount', 'amount', 150), adjustment('surcharge', 'percent', 10)],
      }),
    ).toEqual({ exemptAmount: -55, totalAmount: -55 })
  })

  test('an export without payment totals zero, and keeps its exempt amount', () => {
    expect(calculateExportTotals([line(10.5)], { withoutPayment: true })).toEqual({
      exemptAmount: 10.5,
      totalAmount: 0,
    })
  })

  test('calculateTotals gives an export document these totals', () => {
    const items = [line(1000.5), line(3, 2)]
    const globalAdjustments = [adjustment('surcharge', 'amount', 0.5)]
    expect(calculateTotals(items, { type: 110, globalAdjustments })).toEqual({ exemptAmount: 1001, totalAmount: 1001 })
    expect(calculateTotals(items, { type: 112, withoutPayment: true, pricesIncludeVat: true })).toEqual({
      exemptAmount: 1000.5,
      totalAmount: 0,
    })
  })
})

describe('convertToPesos', () => {
  test.each([
    // 1234.5 × 950.25 = 1173083.625.
    [1234.5, 950.25, 1173084],
    // 1.015 × 100 = 101.5, exactly; in binary floating point it is 101.49999999999999.
    [1.015, 100, 102],
    [0.5, 1, 1],
    [0.4999, 1, 0],
    [8820, 950.25, 8381205],
    [12944.75, 950.25, 12300749],
    // 1234.5678 × 948.1234 = 1170522.62006652.
    [1234.5678, 948.1234, 1170523],
    [0, 950, 0],
    [-1.5, 1, -2],
  ])('%p at %p is %p pesos', (amount, rate, pesos) => {
    expect(convertToPesos(amount, rate)).toBe(pesos)
  })
})
