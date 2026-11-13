import type { SignedDocument } from '../src/document/sign'
import type { DocumentInput } from '../src/model/document'
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

const issuer = { ...baseIssuer, activityCode: 620200 }
const base = { issueDate: '2026-11-15', issuer, receiver }
const invoice = { ...base, type: 33, items: [{ name: 'Plan anual', unitPrice: 100000 }] } as const
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
