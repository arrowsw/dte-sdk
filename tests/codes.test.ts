import {
  ENVIRONMENTS,
  REFERENCE_CODES,
  TRANSFER_TYPES,
  DISPATCH_TYPES,
  SERVICE_INDICATORS,
  PAYMENT_TERMS,
  EXEMPT_INDICATORS,
  WITHHOLDING_TAX_CODES,
  VAT_RATE,
  SII_RUT,
  FINAL_CONSUMER_RUT,
  CERTIFICATION_KEY_ID,
  isEnvironment,
} from '../src/catalogs/codes'

describe('codes', () => {
  test('constants match the SII values', () => {
    expect(ENVIRONMENTS).toEqual({ certification: 'certification', production: 'production' })
    expect(REFERENCE_CODES).toEqual({ cancels: 1, correctsText: 2, correctsAmounts: 3 })
    expect(TRANSFER_TYPES.sale).toBe(1)
    expect(TRANSFER_TYPES.internalTransfer).toBe(5)
    expect(TRANSFER_TYPES.exportSale).toBe(9)
    expect(DISPATCH_TYPES.byReceiver).toBe(1)
    expect(SERVICE_INDICATORS.salesAndServices).toBe(3)
    expect(PAYMENT_TERMS).toEqual({ cash: 1, credit: 2, free: 3 })
    expect(EXEMPT_INDICATORS.exempt).toBe(1)
    expect(EXEMPT_INDICATORS.nonBillableNegative).toBe(6)
    expect(WITHHOLDING_TAX_CODES.totalVatWithholding).toBe(15)
    expect(VAT_RATE).toBe(19)
    expect(SII_RUT).toBe('60803000-K')
    expect(FINAL_CONSUMER_RUT).toBe('66666666-6')
    expect(CERTIFICATION_KEY_ID).toBe(100)
  })

  test('isEnvironment', () => {
    expect(isEnvironment('certification')).toBe(true)
    expect(isEnvironment('production')).toBe(true)
    expect(isEnvironment('certificacion')).toBe(false)
    expect(isEnvironment(1)).toBe(false)
  })
})
