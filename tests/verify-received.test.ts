import { expectTypeOf } from 'expect-type'
import { DteError } from '../src/errors'
import {
  verifyReceivedDocuments,
  type ReceivedDocument,
  type ReceivedDocumentsVerification,
} from '../src/document/verify-received'
import { createEnvelope } from '../src/envelope/create'
import { signEnvelope } from '../src/envelope/sign'
import { issueDocument } from '../src/document/issue'
import { FIXED_NOW, ISSUER_RUT, RECEIVER_RUT } from './support/fixtures'
import {
  certificate,
  envelopeAround,
  envelopeOf,
  invoiceInput,
  issued,
  OTHER_RUT,
  SII_NS,
  signedCaf,
  signedElsewhere,
  stampedWith,
  TEST_SII_KEYS,
  XSI_NS,
} from './support/received-fixtures'

const options = { siiKeys: TEST_SII_KEYS }
const verify = (xml: string): ReceivedDocumentsVerification => verifyReceivedDocuments(xml, options)
const only = (xml: string): ReceivedDocument => {
  const { documents } = verify(xml)
  expect(documents).toHaveLength(1)
  return documents[0]
}

const VALID_SIGNATURE = { found: true, digestValid: true, signatureValid: true, valid: true }
const VALID_TED = { found: true, signatureValid: true, mismatches: [], valid: true }
const VALID_CAF = {
  found: true,
  keyId: 100,
  issuerRut: ISSUER_RUT,
  documentType: 33,
  range: { from: 1, to: 100 },
  authorizationDate: '2026-10-31',
  mismatches: [],
  siiSignature: 'valid',
  status: 'valid',
}

const expectFailure = (run: () => unknown, code: string, details: Record<string, unknown> = {}): void => {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(DteError)
    expect((error as DteError).code).toBe(code)
    expect((error as DteError).details).toMatchObject(details)
    return
  }
  throw new Error(`expected ${code}`)
}

describe('verifyReceivedDocuments: a valid envelope', () => {
  const first = issued(1)
  const second = issued(2)
  const result = verify(envelopeOf([first, second]))

  test('checks the envelope and every document in it', () => {
    expect(result.root).toBe('EnvioDTE')
    expect(result.status).toBe('valid')
    expect(result.envelope).toEqual({ ...VALID_SIGNATURE, referenceId: expect.stringMatching(/^DTE_SetDoc_/) })
    expect(result.documents).toHaveLength(2)
  })

  test('reads each document from its own header and checks its signature, stamp and CAF', () => {
    expect(result.documents[0]).toEqual({
      xml: first.xml,
      id: 'DTE_T33F1',
      type: 33,
      folio: 1,
      issueDate: '2026-11-15',
      issuerRut: ISSUER_RUT,
      receiverRut: RECEIVER_RUT,
      totalAmount: 172550,
      signature: { ...VALID_SIGNATURE, referenceId: 'DTE_T33F1' },
      ted: VALID_TED,
      caf: VALID_CAF,
      status: 'valid',
    })
    expect(result.documents[1]).toMatchObject({ xml: second.xml, folio: 2, status: 'valid' })
  })

  test('the types say what each field holds', () => {
    expectTypeOf(verifyReceivedDocuments).returns.toEqualTypeOf<ReceivedDocumentsVerification>()
    expectTypeOf<ReceivedDocumentsVerification['root']>().toEqualTypeOf<'DTE' | 'EnvioDTE' | 'EnvioBOLETA'>()
    expectTypeOf<ReceivedDocumentsVerification['status']>().toEqualTypeOf<'valid' | 'invalid' | 'unchecked'>()
    expectTypeOf<ReceivedDocument['type']>().toEqualTypeOf<number | null>()
    expectTypeOf<ReceivedDocument['ted']['mismatches'][number]>().toEqualTypeOf<
      'issuerRut' | 'documentType' | 'folio' | 'issueDate' | 'receiverRut' | 'totalAmount'
    >()
    expectTypeOf<ReceivedDocument['caf']['mismatches'][number]>().toEqualTypeOf<
      'issuerRut' | 'documentType' | 'folio'
    >()
  })

  test('without the test key, the SII key 100 refuses the test CAF: the default keys are the real ones', () => {
    const real = verifyReceivedDocuments(envelopeOf([first]))
    expect(real.documents[0].caf).toMatchObject({ siiSignature: 'invalid', status: 'invalid' })
    expect(real.status).toBe('invalid')
  })

  test('a document that fails leaves the others valid', () => {
    const tampered = first.xml.replace('<GiroRecep>Comercio</GiroRecep>', '<GiroRecep>Industria</GiroRecep>')
    const mixed = verify(envelopeAround([tampered, second.xml]))
    expect(mixed.envelope?.valid).toBe(true)
    expect(mixed.documents.map((document) => document.status)).toEqual(['invalid', 'valid'])
    expect(mixed.status).toBe('invalid')
  })
})

describe('verifyReceivedDocuments: each check on its own', () => {
  test('a document changed after it was signed fails its signature, and only that', () => {
    const tampered = issued(1).xml.replace('<GiroRecep>Comercio</GiroRecep>', '<GiroRecep>Industria</GiroRecep>')
    const document = only(tampered)
    expect(document.signature).toEqual({
      ...VALID_SIGNATURE,
      referenceId: 'DTE_T33F1',
      digestValid: false,
      valid: false,
    })
    expect(document.ted).toEqual(VALID_TED)
    expect(document.caf).toEqual(VALID_CAF)
    expect(document.status).toBe('invalid')
  })

  test('a document without a signature is a failed check, not an error', () => {
    const document = only(issued(1).xml.replace(/<Signature[\s\S]*<\/Signature>/, ''))
    expect(document.signature).toEqual({
      found: false,
      referenceId: null,
      digestValid: false,
      signatureValid: false,
      valid: false,
    })
    expect(document.status).toBe('invalid')
  })

  test('a DD changed after the CAF key signed it fails the stamp, and only that', () => {
    const document = only(
      stampedWith(1, signedCaf(), {
        dd: (dd) => dd.replace('<TSTED>2026-11-15T15:30:00</TSTED>', '<TSTED>2026-11-15T15:31:00</TSTED>'),
      }).xml,
    )
    expect(document.signature.valid).toBe(true)
    expect(document.ted).toEqual({ ...VALID_TED, signatureValid: false, valid: false })
    expect(document.caf).toEqual(VALID_CAF)
    expect(document.status).toBe('invalid')
  })

  test.each([
    ['issuerRut', { issuerRut: OTHER_RUT }],
    ['documentType', { documentType: 34 }],
    ['folio', { folio: 2 }],
    ['issueDate', { issueDate: '2026-11-16' }],
    ['receiverRut', { receiverRut: OTHER_RUT }],
    ['totalAmount', { totalAmount: 1 }],
  ] as const)('a DD that says another %s than the header fails the stamp', (field, fields) => {
    const document = only(stampedWith(1, signedCaf(), { fields: fields as never }).xml)
    expect(document.ted).toEqual({ ...VALID_TED, mismatches: [field], valid: false })
    expect(document.status).toBe('invalid')
  })

  test.each([
    ['issuerRut', { issuerRut: OTHER_RUT }],
    ['documentType', { type: 34 }],
    ['folio', { from: 101, to: 200 }],
  ] as const)('a CAF for another %s fails the CAF check', (field, edits) => {
    const document = only(stampedWith(1, signedCaf(edits)).xml)
    expect(document.signature.valid).toBe(true)
    expect(document.ted).toEqual(VALID_TED)
    expect(document.caf).toMatchObject({ mismatches: [field], siiSignature: 'valid', status: 'invalid' })
    expect(document.status).toBe('invalid')
  })

  test('a CAF whose FRMA does not verify fails the CAF check', () => {
    const document = only(issued(1, signedCaf({ tamperAfterSigning: true })).xml)
    expect(document.ted).toEqual(VALID_TED)
    expect(document.caf).toEqual({ ...VALID_CAF, siiSignature: 'invalid', status: 'invalid' })
    expect(document.status).toBe('invalid')
  })

  test('a CAF whose IDK has no known key is unchecked, not failed', () => {
    const result = verify(envelopeOf([issued(1, signedCaf({ keyId: 999 })), issued(2)]))
    expect(result.documents[0].caf).toEqual({
      ...VALID_CAF,
      keyId: 999,
      siiSignature: 'unchecked',
      status: 'unchecked',
    })
    expect(result.documents[0].status).toBe('unchecked')
    expect(result.documents[1].status).toBe('valid')
    expect(result.status).toBe('unchecked')
  })

  test('an invalid check outweighs an unchecked one', () => {
    const tampered = issued(1, signedCaf({ keyId: 999 })).xml.replace(
      '<GiroRecep>Comercio</GiroRecep>',
      '<GiroRecep>Industria</GiroRecep>',
    )
    expect(only(tampered).status).toBe('invalid')
  })

  test('a document without a TED fails the stamp and the CAF', () => {
    const xml = signedElsewhere(issued(1), ` xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}"`, (text) =>
      text.replace(/<TED[\s\S]*<\/TED>\n?/, ''),
    )
    const document = only(xml)
    expect(document.signature.valid).toBe(true)
    expect(document.ted).toEqual({ found: false, signatureValid: false, mismatches: [], valid: false })
    expect(document.caf).toEqual({
      found: false,
      keyId: null,
      issuerRut: null,
      documentType: null,
      range: null,
      authorizationDate: null,
      mismatches: [],
      siiSignature: 'invalid',
      status: 'invalid',
    })
    expect(document.status).toBe('invalid')
  })

  test.each([
    ['a comment in the TED', (ted: string) => ted.replace('<DD>', '<!-- otro --><DD>')],
    ['a TED without FRMT', (ted: string) => ted.replace(/<FRMT[^>]*>[^<]*<\/FRMT>/, '')],
    ['a second TED', (ted: string) => `${ted}${ted}`],
  ])('%s is no TED', (_label, edit) => {
    const xml = signedElsewhere(issued(1), ` xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}"`, (text) =>
      text.replace(/<TED[\s\S]*<\/TED>/, (ted) => edit(ted)),
    )
    expect(only(xml).ted).toMatchObject({ found: false, valid: false })
  })

  test('a TED whose CAF lacks its key is a stamp that cannot verify, with no CAF', () => {
    const xml = signedElsewhere(issued(1), ` xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}"`, (text) =>
      text.replace(/<RSAPK>[\s\S]*?<\/RSAPK>/, ''),
    )
    const document = only(xml)
    expect(document.ted).toMatchObject({ found: true, signatureValid: false, valid: false })
    expect(document.caf).toMatchObject({ found: false, siiSignature: 'invalid', status: 'invalid' })
  })

  test('an envelope changed after it was signed fails its own signature, its documents stay valid', () => {
    const xml = envelopeOf([issued(1)]).replace(/<TmstFirmaEnv>[^<]*</, '<TmstFirmaEnv>2026-11-15T16:00:00<')
    const result = verify(xml)
    expect(result.envelope).toMatchObject({ found: true, digestValid: false, valid: false })
    expect(result.documents[0].status).toBe('valid')
    expect(result.status).toBe('invalid')
  })

  test('an envelope without its own signature is a failed check', () => {
    const xml = envelopeOf([issued(1)]).replace(
      /<\/SetDTE><Signature[\s\S]*<\/Signature><\/EnvioDTE>$/,
      '</SetDTE></EnvioDTE>',
    )
    const result = verify(xml)
    expect(result.envelope).toEqual({
      found: false,
      referenceId: null,
      digestValid: false,
      signatureValid: false,
      valid: false,
    })
    expect(result.status).toBe('invalid')
  })
})

describe('verifyReceivedDocuments: the inputs it takes', () => {
  test('a single DTE file, with or without its XML declaration', () => {
    const { xml } = issued(1)
    for (const input of [xml, `<?xml version="1.0" encoding="ISO-8859-1"?>\n${xml}\n`]) {
      const result = verify(input)
      expect(result.root).toBe('DTE')
      expect(result.envelope).toBeNull()
      expect(result.documents).toHaveLength(1)
      expect(result.documents[0]).toMatchObject({ xml, folio: 1, status: 'valid' })
      expect(result.status).toBe('valid')
    }
  })

  test('a DTE signed with only the SII namespace, with or without it in the envelope', () => {
    const signed = signedElsewhere(issued(1), ` xmlns="${SII_NS}"`)
    expect(only(signed).status).toBe('valid')
    const keeping = verify(envelopeAround([signed]))
    expect(keeping.documents[0]).toMatchObject({ xml: signed, status: 'valid' })
    const stripped = signed.replace(` xmlns="${SII_NS}"`, '')
    const relying = verify(envelopeAround([stripped]))
    expect(relying.documents[0]).toMatchObject({ xml: stripped, status: 'valid' })
    expect(relying.envelope?.valid).toBe(true)
  })

  test('a DTE signed with no namespace at all, as the example the SII publishes was', () => {
    const signed = signedElsewhere(issued(1), '')
    expect(only(signed).status).toBe('valid')
    expect(verify(envelopeAround([signed])).documents[0].status).toBe('valid')
  })

  test('a DTE that uses a prefix it inherits from the envelope verifies where it sits', () => {
    const signed = signedElsewhere(issued(1), ` xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}"`)
    const prefixed = signed.replace(` xmlns:xsi="${XSI_NS}" version="1.0">`, ' version="1.0" xsi:type="DTEDefType">')
    expect(verify(envelopeAround([prefixed])).documents[0]).toMatchObject({ xml: prefixed, status: 'valid' })
  })

  test('comments around the documents do not hide or add one', () => {
    const xml = envelopeOf([issued(1)]).replace('<DTE ', '<!-- <DTE>nada</DTE> --><DTE ')
    expect(verify(xml).documents).toHaveLength(1)
  })

  test('an EnvioBOLETA of receipts', () => {
    const caf = signedCaf({ type: 39, to: 1000 })
    const receipt = issueDocument({
      document: {
        type: 39,
        folio: 10,
        issueDate: '2026-11-15',
        issuer: invoiceInput(10).issuer,
        items: [{ name: 'Café', unitPrice: 1500 }],
        pricesIncludeVat: true,
      },
      caf,
      certificate,
      now: FIXED_NOW,
    })
    const xml = signEnvelope(
      createEnvelope({
        kind: 'receipt',
        documents: [receipt],
        cover: { issuerRut: ISSUER_RUT, senderRut: ISSUER_RUT, resolutionDate: '2026-01-15', resolutionNumber: 0 },
        now: FIXED_NOW,
      }),
      certificate,
    ).xml
    const result = verify(xml)
    expect(result.root).toBe('EnvioBOLETA')
    expect(result.documents[0]).toMatchObject({
      type: 39,
      receiverRut: '66666666-6',
      totalAmount: 1500,
      status: 'valid',
    })
  })

  test('a settlement invoice, signed over its Liquidacion', () => {
    const settlement = issued(
      3,
      signedCaf({ type: 43 }),
      invoiceInput(3, {
        type: 43,
        items: [{ name: 'Venta', unitPrice: 1000, settledDocumentType: '33' }],
        commissions: [{ kind: 'commission', description: 'Comisión', netValue: 100 }],
      }),
    )
    expect(only(settlement.xml)).toMatchObject({ id: 'DTE_T43F3', type: 43, status: 'valid' })
  })

  test('fields the header lacks or does not give as numbers are null, and fail what compares them', () => {
    const xml = signedElsewhere(issued(1), ` xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}"`, (text) =>
      text
        .replace('<FchEmis>2026-11-15</FchEmis>', '')
        .replace('<RUTRecep>12345678-5</RUTRecep>', '')
        .replace('<Folio>1</Folio>', '<Folio>uno</Folio>')
        .replace('<MntTotal>172550</MntTotal>', '<MntTotal>1.5</MntTotal>'),
    )
    const document = only(xml)
    expect(document).toMatchObject({ folio: null, issueDate: null, receiverRut: null, totalAmount: null })
    expect(document.ted.mismatches).toEqual(['folio', 'issueDate', 'receiverRut', 'totalAmount'])
    expect(document.caf.mismatches).toEqual(['folio'])
  })

  test('a stamp whose writer escaped its texts otherwise still verifies, its CAF too', () => {
    const caf = signedCaf({ businessName: 'COMERCIAL ÑANDÚ SPA' })
    const signed = stampedWith(1, caf, { fields: { receiverName: 'Rapel & Cía' } }).xml
    expect(only(signed).status).toBe('valid')
    // Character references, hexadecimal and decimal, where the signer wrote the characters themselves.
    const rewritten = signed.replace(/Ñ/g, '&#xD1;').replace(/Ú/g, '&#218;').replace('Cía', 'C&#xED;a')
    expect(rewritten).not.toBe(signed)
    const document = only(rewritten)
    expect(document.signature.valid).toBe(true)
    expect(document.ted).toEqual(VALID_TED)
    expect(document.caf).toMatchObject({ siiSignature: 'valid', status: 'valid' })
  })

  test('RUTs compare by value whatever their dots, and a wrong check digit differs', () => {
    const dotted = signedElsewhere(issued(1), ` xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}"`, (text) =>
      text.replace('<RUTEmisor>76543210-3</RUTEmisor>', '<RUTEmisor>76.543.210-3</RUTEmisor>'),
    )
    const document = only(dotted)
    expect(document.issuerRut).toBe('76.543.210-3')
    expect(document.ted.mismatches).toEqual([])
    expect(document.caf.mismatches).toEqual([])
    const wrong = signedElsewhere(issued(1), ` xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}"`, (text) =>
      text.replace('<RUTEmisor>76543210-3</RUTEmisor>', '<RUTEmisor>76543210-K</RUTEmisor>'),
    )
    expect(only(wrong).ted.mismatches).toEqual(['issuerRut'])
    expect(only(wrong).caf.mismatches).toEqual(['issuerRut'])
  })

  test('a signed element without an ID has a null id and a signature that points nowhere', () => {
    const document = only(issued(1).xml.replace(' ID="DTE_T33F1"', ''))
    expect(document.id).toBeNull()
    expect(document.signature).toMatchObject({ found: true, digestValid: false, valid: false })
  })
})

describe('verifyReceivedDocuments: the bytes checked are the bytes read', () => {
  const genuine = issued(1)
  const dd = /<DD>[\s\S]*<\/DD>/.exec(genuine.xml)![0]
  const frmt = /<FRMT[\s\S]*<\/FRMT>/.exec(genuine.xml)![0]
  const caf = /<CAF[\s\S]*<\/CAF>/.exec(dd)![0]
  const da = /<DA>[\s\S]*<\/DA>/.exec(caf)![0]
  const frma = /<FRMA[\s\S]*<\/FRMA>/.exec(caf)![0]
  // The amount a forger wants, in the header and in a DD of their own; the genuine DD and its signature ride along.
  const forgedDd = dd.replace('<MNT>172550</MNT>', '<MNT>999</MNT>')
  const forged = (ted: string): string =>
    signedElsewhere(genuine, ` xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}"`, (text) =>
      text.replace(/<TED[\s\S]*<\/TED>/, () => ted).replace('<MntTotal>172550</MntTotal>', '<MntTotal>999</MntTotal>'),
    )

  test('the genuine stamp, put back the same way, passes', () => {
    const document = only(forged(`<TED version="1.0">${dd}${frmt}</TED>`))
    expect(document.ted).toEqual({ ...VALID_TED, mismatches: ['totalAmount'], valid: false })
    expect(only(signedElsewhere(genuine, ` xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}"`)).status).toBe('valid')
  })

  test.each([
    ['a genuine DD inside another child of the TED', `<X>${dd}</X>${forgedDd}${frmt}`],
    ['a second DD before the genuine one', `${forgedDd}${dd}${frmt}`],
    ['a second DD after the genuine one', `${dd}${forgedDd}${frmt}`],
    ['a genuine DD after the FRMT', `${forgedDd}${frmt}<X>${dd}</X>`],
    ['a second FRMT', `${forgedDd}${frmt}${frmt}`],
    ['the FRMT before the DD', `${frmt}${forgedDd}`],
    ['another child in the TED', `${forgedDd}${frmt}<X/>`],
  ])('%s is no stamp', (_label, content) => {
    const document = only(forged(`<TED version="1.0">${content}</TED>`))
    expect(document.ted).toMatchObject({ found: false, valid: false })
    expect(document.caf).toMatchObject({ found: false, status: 'invalid' })
    expect(document.status).toBe('invalid')
  })

  // A DD signed with a CAF key the forger holds, carrying a genuine CAF for its FRMA and a forged one for its fields.
  const forgedCaf = signedCaf({ tamperAfterSigning: true })
  const withCaf = (cafPart: string): string => stampedWith(1, forgedCaf, { fields: { caf: cafPart } }).xml

  test.each([
    ['a genuine CAF inside another child of the DD', `<X>${caf}</X>${forgedCaf.xml}`],
    ['a second CAF', `${forgedCaf.xml}${caf}`],
    ['a genuine DA inside the DD, outside the CAF', `<X>${da}</X>${forgedCaf.xml}`],
    ['a second DA in the CAF', forgedCaf.xml.replace('<DA>', `${da}<DA>`)],
    ['a second FRMA in the CAF', forgedCaf.xml.replace('</CAF>', `${frma}</CAF>`)],
    ['a DA inside another child of the CAF', caf.replace(/<DA>[\s\S]*<\/DA>/, (value) => `<X>${value}</X>`)],
    ['an FRMA inside another child of the CAF', caf.replace(/<FRMA[\s\S]*<\/FRMA>/, (value) => `<X>${value}</X>`)],
  ])('%s is no CAF, and the stamp cannot verify', (_label, cafPart) => {
    const document = only(withCaf(cafPart))
    expect(document.ted).toMatchObject({ found: true, signatureValid: false, valid: false })
    expect(document.caf).toMatchObject({ found: false, siiSignature: 'invalid', status: 'invalid' })
    expect(document.status).toBe('invalid')
  })
})

describe('verifyReceivedDocuments: malformed input throws', () => {
  test.each([
    ['empty text', ''],
    ['blank text', '  \n'],
    ['text that is not XML', 'no es XML'],
    ['XML that is not well formed', '<DTE version="1.0"><Documento>'],
  ])('%s is XML_PARSE_FAILED', (_label, xml) => {
    expectFailure(() => verify(xml), 'XML_PARSE_FAILED')
  })

  test('a value that is not a string is XML_PARSE_FAILED', () => {
    expectFailure(() => verifyReceivedDocuments(undefined as unknown as string), 'XML_PARSE_FAILED')
  })

  test('another root is XML_PARSE_FAILED, naming it', () => {
    expectFailure(() => verify('<EnvioLibro version="1.0"/>'), 'XML_PARSE_FAILED', {
      field: 'root',
      root: 'EnvioLibro',
    })
  })

  test('an envelope without SetDTE is XML_PARSE_FAILED', () => {
    expectFailure(() => verify(`<EnvioDTE xmlns="${SII_NS}" version="1.0"/>`), 'XML_PARSE_FAILED', { field: 'SetDTE' })
  })

  test('an envelope with a second SetDTE is XML_PARSE_FAILED, whichever one is signed', () => {
    const xml = envelopeOf([issued(1)])
    const set = /<SetDTE[\s\S]*<\/SetDTE>/.exec(xml)![0]
    const decoy = set.replace(/ ID="[^"]*"/, ' ID="Otro"')
    expectFailure(() => verify(xml.replace(set, () => `${decoy}${set}`)), 'XML_PARSE_FAILED', { field: 'SetDTE' })
  })

  test('an envelope without documents is ENVELOPE_EMPTY', () => {
    const xml = `<EnvioDTE xmlns="${SII_NS}" version="1.0"><SetDTE ID="S"><Caratula version="1.0"/></SetDTE></EnvioDTE>`
    expectFailure(() => verify(xml), 'ENVELOPE_EMPTY')
  })

  test.each([
    [
      'a DTE inside another element',
      (xml: string) =>
        xml.replace(
          '<Caratula version="1.0">',
          `<Caratula version="1.0"><Extra><DTE version="1.0"><Documento ID="X"/></DTE></Extra>`,
        ),
    ],
    [
      'an empty DTE',
      (xml: string) => xml.replace('<Caratula version="1.0">', '<DTE version="1.0"/><Caratula version="1.0">'),
    ],
  ])('%s is XML_PARSE_FAILED', (_label, edit) => {
    expectFailure(() => verify(edit(envelopeOf([issued(1)]))), 'XML_PARSE_FAILED', { field: 'DTE' })
  })

  test('a DTE without one Documento or Liquidacion is XML_PARSE_FAILED, with its index', () => {
    const second = issued(2)
      .xml.replace(/<Documento /, '<Exportaciones ')
      .replace('</Documento>', '</Exportaciones>')
    expectFailure(() => verify(envelopeAround([issued(1).xml, second])), 'XML_PARSE_FAILED', {
      field: 'Documento',
      index: 1,
    })
  })
})
