import { createDocument } from '../src/document/create'
import { DteError } from '../src/errors'
import { fromSiiDocument, toSiiDocument } from '../src/model/codec'
import type { DocumentInput } from '../src/model/document'
import { envelopeXml, issue, issuer, receiver } from './support/printed-fixtures'
import { validateAgainstXsd } from './support/xsd'

jest.setTimeout(30_000)

const receipt = (extra: Partial<DocumentInput> = {}): DocumentInput => ({
  type: 39,
  folio: 11,
  issueDate: '2026-11-15',
  issuer,
  items: [{ name: 'Café', quantity: 2, unitPrice: 1500 }],
  pricesIncludeVat: true,
  ...extra,
})
const SET_REFERENCE = { code: 'SET', reason: 'CASO-1' }
const codeOf = (work: () => unknown): { code: string; details: unknown } => {
  try {
    work()
  } catch (error) {
    return { code: (error as DteError).code, details: (error as DteError).details }
  }
  throw new Error('expected a throw')
}

describe('the reference of a receipt', () => {
  test('is normalised with its line number, its texts sanitized and its numbers as text', () => {
    const document = createDocument(
      receipt({ receiptReferences: [SET_REFERENCE, { documentType: 39, folio: 7, code: ' CAJA "2" ', reason: '' }] }),
    )
    expect(document.receiptReferences).toEqual([
      { lineNumber: 1, code: 'SET', reason: 'CASO-1' },
      { lineNumber: 2, documentType: '39', folio: '7', code: 'CAJA 2' },
    ])
    expect(document.references).toEqual([])
    expect(createDocument(receipt()).receiptReferences).toEqual([])
  })

  test('is written in the order of the receipts schema, without a date, and read back', () => {
    const document = createDocument(
      receipt({ receiptReferences: [{ documentType: 39, folio: 7, code: 'SET', reason: 'CASO-1' }] }),
    )
    const sii = toSiiDocument(document)
    expect(sii.Referencia).toEqual([
      { NroLinRef: 1, TpoDocRef: '39', FolioRef: '7', CodRef: 'SET', RazonRef: 'CASO-1' },
    ])
    expect(Object.keys(sii.Referencia![0])).toEqual(['NroLinRef', 'TpoDocRef', 'FolioRef', 'CodRef', 'RazonRef'])
    expect(fromSiiDocument(sii)).toEqual(document)
    const bare = { ...sii, Referencia: [{ NroLinRef: 1, RazonRef: 'solo la razón' }] }
    expect(fromSiiDocument(bare).receiptReferences).toEqual([{ lineNumber: 1, reason: 'solo la razón' }])
    expect(fromSiiDocument({ ...sii, Referencia: undefined }).receiptReferences).toEqual([])
  })

  test('each kind of document takes its own kind of reference, and the schema limits hold', () => {
    const invoiceReference = { documentType: 33, folio: 7, date: '2026-11-15' }
    expect(codeOf(() => createDocument(receipt({ references: [invoiceReference] })))).toEqual({
      code: 'INVALID_OPTION',
      details: { field: 'references' },
    })
    const invoice: DocumentInput = {
      type: 33,
      folio: 7,
      issuer,
      receiver,
      items: [{ name: 'Licencia', unitPrice: 1000 }],
    }
    expect(codeOf(() => createDocument({ ...invoice, receiptReferences: [SET_REFERENCE] }))).toEqual({
      code: 'INVALID_OPTION',
      details: { field: 'receiptReferences' },
    })
    expect(
      createDocument({ ...invoice, references: [invoiceReference], receiptReferences: [] }).receiptReferences,
    ).toEqual([])
    expect(codeOf(() => createDocument(receipt({ receiptReferences: [{ code: 'X'.repeat(19) }] }))).code).toBe(
      'FIELD_TOO_LONG',
    )
    expect(codeOf(() => createDocument(receipt({ receiptReferences: [{ documentType: 1234 }] }))).code).toBe(
      'FIELD_TOO_LONG',
    )
  })

  test('a receipts envelope validates against the official schema, with and without a reference', async () => {
    const plain = envelopeXml([issue(receipt())], 'receipt')
    await expect(validateAgainstXsd(plain, 'EnvioBOLETA')).resolves.toEqual([])
    const referenced = envelopeXml([issue(receipt({ receiptReferences: [SET_REFERENCE] }))], 'receipt')
    expect(referenced).toContain(
      '<Referencia><NroLinRef>1</NroLinRef><CodRef>SET</CodRef><RazonRef>CASO-1</RazonRef></Referencia>',
    )
    await expect(validateAgainstXsd(referenced, 'EnvioBOLETA')).resolves.toEqual([])
  })
})
