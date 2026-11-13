import type { SignedDocument } from '../src/document/sign'
import type { DocumentInput } from '../src/model/document'
import { RECEIVER_RUT } from './support/fixtures'
import { envelopeXml, issue, issuer as baseIssuer, receiver } from './support/printed-fixtures'
import { validateAgainstXsd } from './support/xsd'

// What dte-sdk issues today that the SII's `DTE_v10.xsd` rejects, each case with the validator's exact error. Every
// case is a gap, not the behaviour wanted, so the change that closes one fails its test here: `createDocument` then
// refuses the input and `issue` throws, or the codec writes it right and the validator returns no error. Either way
// the case leaves this file, for `document-schema.test.ts` or for a test of the new error.

jest.setTimeout(60_000)

const ns = (element: string): string => `{http://www.sii.cl/SiiDte}${element}`
const expected = (elements: readonly string[]): string =>
  elements.length === 1
    ? `Expected is ( ${ns(elements[0])} ).`
    : `Expected is one of ( ${elements.map(ns).join(', ')} ).`
const notExpected = (element: string, ...next: readonly string[]): string =>
  `Schemas validity error : Element '${ns(element)}': This element is not expected. ${expected(next)}`
const missingChild = (element: string, ...next: readonly string[]): string =>
  `Schemas validity error : Element '${ns(element)}': Missing child element(s). ${expected(next)}`

const issuer = { ...baseIssuer, activityCode: 620200 }
const base = { issueDate: '2026-11-15', issuer, receiver }
const invoice = { ...base, type: 33, items: [{ name: 'Plan anual', unitPrice: 100000 }] } as const
const settledLine = { name: 'Venta por cuenta de terceros', unitPrice: 10000, settledDocumentType: '33' }
const commission = { kind: 'commission', description: 'Comisión 10%', rate: 10, netValue: 1000, vatValue: 190 } as const
const settlement = {
  ...base,
  type: 43,
  items: [settledLine],
  commissions: [{ ...commission, exemptValue: 0 }],
} as const
// What `IdDoc` may hold under `Liquidacion` after `FchEmis`, as the validator lists it.
const SETTLEMENT_ID_DOC = [
  'IndServicio',
  'MntBruto',
  'TpoTranCompra',
  'TpoTranVenta',
  'FmaPago',
  'FchCancel',
  'MntCancel',
  'SaldoInsol',
  'MntPagos',
  'PeriodoDesde',
]

type Gap = { readonly input: Omit<DocumentInput, 'folio'>; readonly error: string }

const GAPS: Record<string, Gap> = {
  // Every type. `activityCode` is optional in the model, and the schema asks every issuer for one to four `Acteco`.
  'an issuer without an activity code has no Acteco': {
    input: { ...invoice, issuer: baseIssuer },
    error: notExpected('DirOrigen', 'Telefono', 'CorreoEmisor', 'Acteco'),
  },
  // Every type. A subtotal's `description` is optional in the model, and the schema asks for `GlosaSTI`.
  'an informative subtotal without a description has no GlosaSTI': {
    input: { ...invoice, subtotals: [{ number: 1, totalAmount: 100000 }] },
    error: notExpected('ValSubtotSTI', 'GlosaSTI'),
  },
  // Every type. `IndMntNeto` is a receipt's field, and the codec writes `netAmountsIndicator` on any type.
  'netAmountsIndicator writes IndMntNeto, which only a receipt declares': {
    input: { ...invoice, options: { netAmountsIndicator: 2 } },
    error: notExpected(
      'IndMntNeto',
      'IndNoRebaja',
      'TipoDespacho',
      'IndTraslado',
      'TpoImpresion',
      'IndServicio',
      'MntBruto',
      'TpoTranCompra',
      'TpoTranVenta',
      'FmaPago',
      'FmaPagExp',
    ),
  },
  // `Documento`. `TpoDocLiq` belongs to a settlement invoice's lines, and the codec writes `settledDocumentType` on any
  // type.
  "a line's settledDocumentType writes TpoDocLiq under Documento": {
    input: { ...invoice, items: [{ name: 'Plan anual', unitPrice: 100000, settledDocumentType: '33' }] },
    error: notExpected('TpoDocLiq', 'CdgItem', 'IndExe', 'Retenedor', 'NmbItem'),
  },
  // 43. The schema asks every commission line for `ValComNeto` and `ValComExe`, and both are optional in the model.
  '43: a commission line with net and VAT values has no ValComExe': {
    input: { ...settlement, commissions: [commission] },
    error: notExpected('ValComIVA', 'ValComExe'),
  },
  '43: another charge with only a net value has no ValComExe': {
    input: { ...settlement, commissions: [{ kind: 'otherCharge', description: 'Flete', netValue: 10 }] },
    error: missingChild('Comisiones', 'ValComExe'),
  },
  '43: another charge with only an exempt value has no ValComNeto': {
    input: { ...settlement, commissions: [{ kind: 'otherCharge', description: 'Flete', exemptValue: 10 }] },
    error: notExpected('ValComExe', 'TasaComision', 'ValComNeto'),
  },
  // 43. The schema asks a settlement invoice's receiver for `GiroRecep`, and `businessActivity` is optional.
  '43: a receiver without a business activity has no GiroRecep': {
    input: { ...settlement, receiver: { ...receiver, businessActivity: undefined } },
    error: notExpected('DirRecep', 'GiroRecep'),
  },
  // 43. The codec has one shape for `Documento` and `Liquidacion`, so it writes under `Liquidacion` what only
  // `Documento` declares.
  '43: a global discount writes DscRcgGlobal': {
    input: { ...settlement, globalAdjustments: [{ kind: 'discount', valueType: 'percent', value: 5 }] },
    error: notExpected('DscRcgGlobal', 'SubTotInfo', 'Referencia', 'Comisiones', 'TED'),
  },
  '43: transport writes Transporte': {
    input: { ...settlement, transport: { licensePlate: 'ABCD12' } },
    error: notExpected('Transporte', 'Totales'),
  },
  '43: a line discount writes DescuentoPct and DescuentoMonto': {
    input: { ...settlement, items: [{ ...settledLine, discountPercent: 10 }] },
    error: notExpected('DescuentoPct', 'CodImpAdic', 'MontoItem'),
  },
  '43: a line surcharge writes RecargoPct and RecargoMonto': {
    input: { ...settlement, items: [{ ...settledLine, surchargePercent: 10 }] },
    error: notExpected('RecargoPct', 'CodImpAdic', 'MontoItem'),
  },
  "43: a reference to another issuer's document writes RUTOtr": {
    input: { ...settlement, references: [{ documentType: 33, folio: 9, date: '2026-11-10', otherRut: RECEIVER_RUT }] },
    error: notExpected('RUTOtr', 'FchRef'),
  },
  '43: noDebitReduction writes IndNoRebaja': {
    input: { ...settlement, options: { noDebitReduction: 1 } },
    error: notExpected('IndNoRebaja', ...SETTLEMENT_ID_DOC),
  },
  '43: dispatchType writes TipoDespacho': {
    input: { ...settlement, options: { dispatchType: 1 } },
    error: notExpected('TipoDespacho', ...SETTLEMENT_ID_DOC),
  },
  '43: transferType writes IndTraslado': {
    input: { ...settlement, options: { transferType: 1 } },
    error: notExpected('IndTraslado', ...SETTLEMENT_ID_DOC),
  },
  '43: printFormat writes TpoImpresion': {
    input: { ...settlement, options: { printFormat: 'T' } },
    error: notExpected('TpoImpresion', ...SETTLEMENT_ID_DOC),
  },
  '43: exportPaymentTerms writes FmaPagExp': {
    input: { ...settlement, options: { exportPaymentTerms: '1' } },
    error: notExpected('FmaPagExp', ...SETTLEMENT_ID_DOC),
  },
  '43: a non-billable amount in the totals writes MontoNF': {
    input: {
      ...settlement,
      totals: { netAmount: 10000, vatRate: 19, vatAmount: 1900, totalAmount: 11900, nonBillableAmount: 5 },
    },
    error: notExpected('MontoNF', 'MontoPeriodo', 'SaldoAnterior', 'VlrPagar'),
  },
}

describe('what DTE_v10.xsd rejects today', () => {
  const entries = Object.entries(GAPS)
  // Issuing signs twice with node-forge, so each case is issued once, by the first test that needs it.
  const signed: SignedDocument[] = []
  const issued = (index: number): SignedDocument =>
    (signed[index] ??= issue({ ...entries[index][1].input, folio: index + 1 } as DocumentInput))

  test.each(entries.map(([name, gap], index) => [name, gap.error, index] as const))(
    '%s',
    async (_name, error, index) => {
      expect(await validateAgainstXsd(issued(index).xml, 'DTE')).toEqual([error])
    },
  )

  test('in one signed envelope, EnvioDTE_v10.xsd rejects each document with its own error, in order', async () => {
    const envelope = envelopeXml(entries.map((_, index) => issued(index)))
    expect(await validateAgainstXsd(envelope, 'EnvioDTE')).toEqual(entries.map(([, gap]) => gap.error))
  })
})
