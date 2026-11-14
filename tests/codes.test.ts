import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as root from '../src'
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
  PAYMENT_MEDIA,
  RECEIPT_PAYMENT_MEDIA,
  isPaymentMedium,
  isReceiptPaymentMedium,
} from '../src/catalogs/codes'

// The values an element or simple type of an SII schema enumerates; the schemas are written in ISO-8859-1.
const enumeration = (file: string, opening: string): string[] => {
  const xsd = readFileSync(join(__dirname, 'fixtures/xsd', file), 'latin1')
  const body = xsd.split(opening)[1].split('</xs:simpleType>')[0]
  return [...body.matchAll(/<xs:enumeration value="([^"]+)"/g)].map((match) => match[1])
}

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

  test('payment media: the codes of Formato DTE 2.5, page 15, and of MedioPagoType', () => {
    expect(PAYMENT_MEDIA).toEqual({
      cheque: 'CH',
      postdatedCheque: 'CF',
      billOfExchange: 'LT',
      cash: 'EF',
      currentAccountPayment: 'PE',
      creditCard: 'TC',
      other: 'OT',
    })
    const schema = enumeration('SiiTypes_v10.xsd', '<xs:simpleType name="MedioPagoType">')
    expect([...schema].sort()).toEqual(Object.values(PAYMENT_MEDIA).sort())
    expect(Object.values(PAYMENT_MEDIA).every(isPaymentMedium)).toBe(true)
    expect(['1', 'ch', 'TD', 'cheque', 1, null].some(isPaymentMedium)).toBe(false)
  })

  test("a receipt's payment media: the numbers of Formato Boletas Electrónicas 4.2, page 9, and of its schema", () => {
    expect(RECEIPT_PAYMENT_MEDIA).toEqual({
      cash: '1',
      electronicPayment: '2',
      electronicTransfer: '3',
      cheque: '4',
      other: '5',
    })
    const schema = enumeration('EnvioBOLETA_v11.xsd', '<xs:element name="MedioPago" minOccurs="0">')
    expect(schema).toEqual(Object.values(RECEIPT_PAYMENT_MEDIA))
    expect(Object.values(RECEIPT_PAYMENT_MEDIA).every(isReceiptPaymentMedium)).toBe(true)
    expect(['0', '6', 'EF', 1, undefined].some(isReceiptPaymentMedium)).toBe(false)
  })

  test('the root entry exports the payment media and their guards', () => {
    expect(root.PAYMENT_MEDIA).toBe(PAYMENT_MEDIA)
    expect(root.RECEIPT_PAYMENT_MEDIA).toBe(RECEIPT_PAYMENT_MEDIA)
    expect(root.isPaymentMedium).toBe(isPaymentMedium)
    expect(root.isReceiptPaymentMedium).toBe(isReceiptPaymentMedium)
  })
})
