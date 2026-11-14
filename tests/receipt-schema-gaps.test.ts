import type { SignedDocument } from '../src/document/sign'
import type { DocumentInput } from '../src/model/document'
import { envelopeXml, issue, issuer } from './support/printed-fixtures'
import { validateAgainstXsd } from './support/xsd'

// What dte-sdk issues today as a receipt (39, 41) that the SII's `EnvioBOLETA_v11.xsd` rejects, each case with the
// validator's exact errors. Every case is a gap, not the behaviour wanted, so the change that closes one fails its
// test here: `createDocument` then refuses the input and `issue` throws, or the codec writes it right and the
// validator returns no error. Either way the case leaves this file, for `receipt-schema.test.ts` or for a test of the
// new error.

jest.setTimeout(60_000)

const ns = (element: string): string => `{http://www.sii.cl/SiiDte}${element}`

const receipt = {
  type: 39,
  issueDate: '2026-11-15',
  issuer,
  items: [{ name: 'Café', quantity: 2, unitPrice: 1500 }],
  pricesIncludeVat: true,
} as const
type Gap = { readonly input: Omit<DocumentInput, 'folio'>; readonly errors: readonly string[] }

const GAPS: Record<string, Gap> = {
  // `paymentMedium` is one text for every type, and the invoice's `MedioPago` takes codes such as `EF` or `TC`. The
  // receipt's takes a number: 1 cash, 2 electronic payment, 3 electronic transfer, 4 cheque, 5 other.
  "a payment medium with one of the invoice's codes: the receipt's is a number from 1 to 5": {
    input: { ...receipt, options: { paymentMedium: 'EF' } },
    errors: [
      `Schemas validity error : Element '${ns('MedioPago')}': 'EF' is not a valid value of the local atomic type.`,
    ],
  },
}

describe('what EnvioBOLETA_v11.xsd rejects today', () => {
  const entries = Object.entries(GAPS)
  // Issuing signs twice with node-forge, so each case is issued once, by the first test that needs it.
  const signed: SignedDocument[] = []
  const issued = (index: number): SignedDocument =>
    (signed[index] ??= issue({ ...entries[index][1].input, folio: index + 1 } as DocumentInput))

  test.each(entries.map(([name, gap], index) => [name, gap.errors, index] as const))(
    '%s',
    async (_name, errors, index) => {
      expect(await validateAgainstXsd(envelopeXml([issued(index)], 'receipt'), 'EnvioBOLETA')).toEqual(errors)
    },
  )

  test('in one signed envelope with a receipt that validates, the schema rejects only the ones here', async () => {
    const valid = issue({ ...receipt, folio: 999 })
    expect(await validateAgainstXsd(envelopeXml([valid], 'receipt'), 'EnvioBOLETA')).toEqual([])
    const envelope = envelopeXml([valid, ...entries.map((_, index) => issued(index))], 'receipt')
    expect(await validateAgainstXsd(envelope, 'EnvioBOLETA')).toEqual(entries.flatMap(([, gap]) => gap.errors))
  })
})
