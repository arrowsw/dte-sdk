import type { SignedDocument } from '../src/document/sign'
import type { DocumentInput, HeaderOptions, LineItemInput, Totals } from '../src/model/document'
import { envelopeXml, issue, issuer } from './support/printed-fixtures'
import { validateAgainstXsd } from './support/xsd'

// What dte-sdk issues today as a receipt (39, 41) that the SII's `EnvioBOLETA_v11.xsd` rejects, each case with the
// validator's exact errors. Every case is a gap, not the behaviour wanted, so the change that closes one fails its
// test here: `createDocument` then refuses the input and `issue` throws, or the codec writes it right and the
// validator returns no error. Either way the case leaves this file, for `receipt-schema.test.ts` or for a test of the
// new error.

jest.setTimeout(120_000)

const ns = (element: string): string => `{http://www.sii.cl/SiiDte}${element}`
const expected = (elements: readonly string[]): string =>
  elements.length === 0
    ? ''
    : elements.length === 1
      ? ` Expected is ( ${ns(elements[0])} ).`
      : ` Expected is one of ( ${elements.map(ns).join(', ')} ).`
const notExpected = (element: string, ...next: readonly string[]): string =>
  `Schemas validity error : Element '${ns(element)}': This element is not expected.${expected(next)}`
const notInSet = (element: string, value: number, set: readonly number[]): string =>
  `Schemas validity error : Element '${ns(element)}': [facet 'enumeration'] The value '${value}' is not an element of the set {${set.map((member) => `'${member}'`).join(', ')}}.`

const coffee = { name: 'Café', quantity: 2, unitPrice: 1500 }
const receipt = { type: 39, issueDate: '2026-11-15', issuer, items: [coffee], pricesIncludeVat: true } as const
type Gap = { readonly input: Omit<DocumentInput, 'folio'>; readonly errors: readonly string[] }

const withOptions = (options: HeaderOptions): Gap['input'] => ({ ...receipt, options })
const withTotals = (totals: Partial<Totals>): Gap['input'] => ({
  ...receipt,
  pricesIncludeVat: undefined,
  totals: { netAmount: 2521, vatAmount: 479, totalAmount: 3000, ...totals },
})
const withLine = (line: Partial<LineItemInput>): Gap['input'] => ({ ...receipt, items: [{ ...coffee, ...line }] })

// What follows `IndServicio` in the receipt's `IdDoc`, and the rest of a receipt's line after its name.
const AFTER_SERVICE = ['IndMntNeto', 'PeriodoDesde', 'PeriodoHasta', 'FchVenc', 'MedioPago']
const AFTER_NAME = [
  'InfoTicket',
  'DscItem',
  'QtyItem',
  'UnmdItem',
  'PrcItem',
  'DescuentoPct',
  'DescuentoMonto',
  'RecargoPct',
  'RecargoMonto',
  'MontoItem',
]

// The options of the invoice's `IdDoc` that the receipt's does not declare: each is written, and where it lands
// decides what the validator expected in its place.
const INVOICE_OPTIONS: readonly (readonly [HeaderOptions, string, readonly string[]])[] = [
  [{ noDebitReduction: 1 }, 'IndNoRebaja', ['IndServicio']],
  [{ dispatchType: 1 }, 'TipoDespacho', ['IndServicio']],
  [{ transferType: 1 }, 'IndTraslado', ['IndServicio']],
  [{ printFormat: 'T' }, 'TpoImpresion', ['IndServicio']],
  [{ grossAmounts: 1 }, 'MntBruto', AFTER_SERVICE],
  [{ purchaseTransactionType: 1 }, 'TpoTranCompra', AFTER_SERVICE],
  [{ saleTransactionType: 1 }, 'TpoTranVenta', AFTER_SERVICE],
  [{ paymentTerms: 1 }, 'FmaPago', AFTER_SERVICE],
  [{ exportPaymentTerms: '1' }, 'FmaPagExp', AFTER_SERVICE],
  [{ settlementDate: '2026-11-15' }, 'FchCancel', AFTER_SERVICE],
  [{ settledAmount: 3000 }, 'MntCancel', AFTER_SERVICE],
  [{ outstandingBalance: 0 }, 'SaldoInsol', AFTER_SERVICE],
  [{ payments: [{ date: '2026-12-01', amount: 3000 }] }, 'MntPagos', AFTER_SERVICE],
  [{ paymentAccountType: 'CORRIENTE' }, 'TpoCtaPago', AFTER_SERVICE],
  [{ paymentAccountNumber: '123' }, 'NumCtaPago', AFTER_SERVICE],
  [{ paymentBank: 'Banco' }, 'BcoPago', AFTER_SERVICE],
  [{ paymentTermsCode: 'A' }, 'TermPagoCdg', AFTER_SERVICE],
  [{ paymentTermsNote: '30 días' }, 'TermPagoGlosa', AFTER_SERVICE],
  [{ paymentTermsDays: 30 }, 'TermPagoDias', AFTER_SERVICE],
]

const GAPS: Record<string, Gap> = {
  ...Object.fromEntries(
    INVOICE_OPTIONS.map(([options, element, next]) => [
      `options.${Object.keys(options)[0]} writes ${element}, which the receipt's IdDoc does not declare`,
      { input: withOptions(options), errors: [notExpected(element, ...next)] },
    ]),
  ),
  // The receipt's `IdDoc` has an order of its own: `IndMntNeto` right after `IndServicio`, and `FchVenc` before
  // `MedioPago`. The codec writes the invoice's order.
  'a period and the net amounts indicator: IndMntNeto is written after the period': {
    input: withOptions({ billingPeriod: { from: '2026-11-01', to: '2026-11-30' }, netAmountsIndicator: 2 }),
    errors: [notExpected('IndMntNeto', 'FchVenc', 'MedioPago')],
  },
  'a due date and the net amounts indicator: IndMntNeto is written after FchVenc': {
    input: withOptions({ dueDate: '2026-12-10', netAmountsIndicator: 2 }),
    errors: [notExpected('IndMntNeto', 'MedioPago')],
  },
  'a payment medium and a due date: FchVenc is written after MedioPago': {
    input: withOptions({ paymentMedium: '1', dueDate: '2026-12-10' }),
    errors: [notExpected('FchVenc')],
  },
  // Values the receipt's schema does not admit.
  'a net amounts indicator other than 2': {
    input: withOptions({ netAmountsIndicator: 1 }),
    errors: [notInSet('IndMntNeto', 1, [2])],
  },
  "a payment medium with one of the invoice's codes: the receipt's is a number from 1 to 5": {
    input: withOptions({ paymentMedium: 'EF' }),
    errors: [
      `Schemas validity error : Element '${ns('MedioPago')}': 'EF' is not a valid value of the local atomic type.`,
    ],
  },
  ...Object.fromEntries(
    ([3, 4, 5] as const).map((exemptIndicator) => [
      `a line with the exempt indicator ${exemptIndicator}: a receipt admits 1, 2 and 6`,
      { input: withLine({ exemptIndicator }), errors: [notInSet('IndExe', exemptIndicator, [1, 2, 6])] },
    ]),
  ),
  // The issuer, the transport and the totals.
  "an issuer with a branch name writes Sucursal, which the receipt's Emisor does not declare": {
    input: { ...receipt, issuer: { ...issuer, branch: 'Casa Matriz' } },
    errors: [notExpected('Sucursal', 'CdgSIISucur', 'DirOrigen', 'CmnaOrigen', 'CiudadOrigen')],
  },
  'transport writes Transporte, which a receipt does not declare': {
    input: { ...receipt, transport: { licensePlate: 'ABCD12' } },
    errors: [notExpected('Transporte', 'RUTProvSW', 'Totales')],
  },
  'totals.vatRate writes TasaIVA': {
    input: withTotals({ vatRate: 19 }),
    errors: [notExpected('TasaIVA', 'MntExe', 'IVA', 'MntTotal')],
  },
  'totals.ownVatAmount writes IVAProp': {
    input: withTotals({ ownVatAmount: 100 }),
    errors: [notExpected('IVAProp', 'MntTotal')],
  },
  'totals.thirdPartyVatAmount writes IVATerc': {
    input: withTotals({ thirdPartyVatAmount: 100 }),
    errors: [notExpected('IVATerc', 'MntTotal')],
  },
  'totals.withholdings writes ImptoReten': {
    input: withTotals({ withholdings: [{ taxCode: 15, rate: 19, amount: 479 }] }),
    errors: [notExpected('ImptoReten', 'MntTotal')],
  },
  'withholdVat writes ImptoReten too': {
    input: { ...receipt, withholdVat: true },
    errors: [notExpected('ImptoReten', 'MntTotal')],
  },
  'totals.commissions writes Comisiones in the totals': {
    input: withTotals({ commissions: { netValue: 100 } }),
    errors: [notExpected('Comisiones', 'MntTotal')],
  },
  "totals.periodAmount writes the invoice's MontoPeriodo: the receipt's tag is TotalPeriodo": {
    input: withTotals({ periodAmount: 3000 }),
    errors: [notExpected('MontoPeriodo', 'MontoNF', 'TotalPeriodo', 'SaldoAnterior', 'VlrPagar')],
  },
  // The lines.
  'a line with a reference quantity writes QtyRef': {
    input: withLine({ referenceQuantity: 2 }),
    errors: [notExpected('QtyRef', ...AFTER_NAME)],
  },
  'a line with a reference unit writes UnmdRef': {
    input: withLine({ referenceUnit: 'KG' }),
    errors: [notExpected('UnmdRef', ...AFTER_NAME)],
  },
  'a line with a reference price writes PrcRef': {
    input: withLine({ referencePrice: 100 }),
    errors: [notExpected('PrcRef', ...AFTER_NAME)],
  },
  'a line with additional tax codes writes CodImpAdic': {
    input: withLine({ additionalTaxCodes: [27] }),
    errors: [notExpected('CodImpAdic', 'DescuentoPct', 'DescuentoMonto', 'RecargoPct', 'RecargoMonto', 'MontoItem')],
  },
  'commissions write Comisiones twice, in the totals and as lines': {
    input: { ...receipt, commissions: [{ kind: 'commission', description: 'Comisión', netValue: 100 }] },
    errors: [
      notExpected('Comisiones', 'MntTotal'),
      notExpected('Comisiones', 'SubTotInfo', 'DscRcgGlobal', 'Referencia', 'GeoRefEmision', 'TED'),
    ],
  },
}

describe('what EnvioBOLETA_v11.xsd rejects today', () => {
  const entries = Object.entries(GAPS)
  // Issuing signs twice with node-forge, so each case is issued once, by the first test that needs it. The schema
  // declares no root but the envelope, and signing one per case costs as much again: every case is validated in the
  // place of the one receipt of the same signed envelope.
  const signed: SignedDocument[] = []
  const issued = (index: number): SignedDocument =>
    (signed[index] ??= issue({ ...entries[index][1].input, folio: index + 1 } as DocumentInput))
  let valid: { readonly receipt: string; readonly envelope: string } | undefined
  const alone = (xml: string): string => {
    if (valid === undefined) {
      const one = issue({ ...receipt, folio: 999 })
      valid = { receipt: one.xml, envelope: envelopeXml([one], 'receipt') }
    }
    return valid.envelope.replace(valid.receipt, xml)
  }

  test('the envelope the cases are written into validates', async () => {
    const xml = alone('')
    expect(xml).not.toContain('<DTE')
    expect(valid).toBeDefined()
    expect(await validateAgainstXsd(valid!.envelope, 'EnvioBOLETA')).toEqual([])
  })

  test.each(entries.map(([name, gap], index) => [name, gap.errors, index] as const))(
    '%s',
    async (_name, errors, index) => {
      const xml = alone(issued(index).xml)
      expect(xml).toContain(`<Folio>${index + 1}</Folio>`)
      expect(await validateAgainstXsd(xml, 'EnvioBOLETA')).toEqual(errors)
    },
  )

  test('in one signed envelope, the schema rejects each receipt with its own errors, in order', async () => {
    const envelope = envelopeXml(
      entries.map((_, index) => issued(index)),
      'receipt',
    )
    expect(await validateAgainstXsd(envelope, 'EnvioBOLETA')).toEqual(entries.flatMap(([, gap]) => gap.errors))
  })
})
