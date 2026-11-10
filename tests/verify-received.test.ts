import { expectTypeOf } from 'expect-type'
import { DteError } from '../src/errors'
import {
  verifyReceivedDocuments,
  type ReceivedDocument,
  type ReceivedDocumentsVerification,
} from '../src/document/verify-received'
import { createEnvelope } from '../src/envelope/create'
import { signEnvelope } from '../src/envelope/sign'
import { verifyDocumentSignature } from '../src/document/sign'
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

// The test CAFs carry IDK 100, the certification environment's key.
const options = { siiKeys: TEST_SII_KEYS, environment: 'certification' } as const
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
  environment: 'certification',
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
      'issuerRut' | 'documentType' | 'folio' | 'environment'
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

  test('a document whose SignedInfo carries a second Reference fails its signature', () => {
    const xml = signedElsewhere(
      issued(1),
      ` xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}"`,
      (text) => text,
      (signedInfo) =>
        signedInfo.replace(
          /<Reference[\s\S]*<\/Reference>/,
          (reference) => `${reference}${reference.replace(/URI="[^"]*"/, 'URI="#Otro"')}`,
        ),
    )
    expect(only(xml).signature).toMatchObject({ found: true, referenceId: null, digestValid: false, valid: false })
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

  test('a CAF whose FRMA is empty is a CAF that fails its check, and the stamp still verifies with its key', () => {
    const caf = signedCaf()
    const empty = { ...caf, xml: caf.xml.replace(/(<FRMA[^>]*>)[^<]*/, '$1') }
    const document = only(stampedWith(1, empty).xml)
    expect(document.ted).toEqual(VALID_TED)
    expect(document.caf).toEqual({ ...VALID_CAF, siiSignature: 'invalid', status: 'invalid' })
  })

  test('a CAF whose IDK has no known key is unchecked, not failed', () => {
    const result = verify(envelopeOf([issued(1, signedCaf({ keyId: 999 })), issued(2)]))
    expect(result.documents[0].caf).toEqual({
      ...VALID_CAF,
      keyId: 999,
      environment: null,
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
      environment: null,
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

  test.each([
    ['a prefixed DD beside the real one', `<x:DD xmlns:x="${SII_NS}">${dd.slice(4, -5)}</x:DD>${forgedDd}${frmt}`],
    ['the genuine DD prefixed, as the only DD', `<x:DD xmlns:x="${SII_NS}">${dd.slice(4, -5)}</x:DD>${frmt}`],
    ['a namespace declared inside the TED', `${forgedDd.replace('<DD>', `<DD xmlns="${SII_NS}">`)}${frmt}`],
    ['a name that begins like DD', `<DDX>${dd.slice(4, -5)}</DDX>${forgedDd}${frmt}`],
    ['a CDATA section in the DD', `${dd.replace(/<TSTED>([^<]*)</, '<TSTED><![CDATA[$1]]><')}${frmt}`],
  ])('%s is no stamp', (_label, content) => {
    expect(only(forged(`<TED version="1.0">${content}</TED>`)).ted).toMatchObject({ found: false, valid: false })
  })

  test('a prefixed CAF beside the forged one makes the TED no stamp', () => {
    const prefixed = `<x:CAF xmlns:x="${SII_NS}">${caf.slice(caf.indexOf('>') + 1, -6)}</x:CAF>${forgedCaf.xml}`
    const document = only(stampedWith(1, forgedCaf, { fields: { caf: prefixed } }).xml)
    expect(document.ted).toMatchObject({ found: false, valid: false })
    expect(document.caf.found).toBe(false)
  })

  test('a self-closing DD is a stamp with nothing to verify', () => {
    const document = only(forged(`<TED version="1.0"><DD/>${frmt}</TED>`))
    expect(document.ted).toMatchObject({ found: true, signatureValid: false, valid: false })
    expect(document.caf.found).toBe(false)
  })

  test('a prefixed TED beside the real one is no stamp', () => {
    const ted = /<TED[\s\S]*<\/TED>/.exec(genuine.xml)![0]
    const prefixed = `<x:TED xmlns:x="${SII_NS}" version="1.0">${dd}${frmt}</x:TED>`
    expect(only(forged(`${ted}${prefixed}`)).ted.found).toBe(false)
  })

  test('a genuine DD in an attribute value is only text: the DD read is the one checked', () => {
    const document = only(
      forged(`<TED version="1.0">${forgedDd}${frmt.replace('<FRMT ', `<FRMT nota="${dd.replace(/"/g, "'")}" `)}</TED>`),
    )
    expect(document.ted).toMatchObject({ found: true, signatureValid: false, valid: false })
  })

  test('an attribute on the DD is part of the bytes checked', () => {
    const document = only(forged(`<TED version="1.0">${dd.replace('<DD>', '<DD nota="x">')}${frmt}</TED>`))
    expect(document.ted).toMatchObject({ found: true, signatureValid: false, valid: false })
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
    ['a name that begins like CAF holding a genuine DA', `<CAFE>${da}</CAFE>${forgedCaf.xml}`],
    ['a self-closing CAF', '<CAF version="1.0"/>'],
  ])('%s is no CAF, and the stamp cannot verify', (_label, cafPart) => {
    const document = only(withCaf(cafPart))
    expect(document.ted).toMatchObject({ found: true, signatureValid: false, valid: false })
    expect(document.caf).toMatchObject({ found: false, siiSignature: 'invalid', status: 'invalid' })
    expect(document.status).toBe('invalid')
  })
})

describe('verifyReceivedDocuments: each text is its element', () => {
  test('a DTE hidden in an attribute value, beside a real one the text cannot see, is not paired with it', () => {
    const real = issued(1).xml
    const forged = issued(2).xml
    // The validator and xmldom accept `<` in an attribute value; `/>` in one hides a start tag from a reader of text.
    const hidden = real.replace('<DTE ', '<DTE nota="/>" ')
    const xml = envelopeAround([hidden]).replace(
      '<Caratula version="1.0">',
      () => `<Caratula nota="${forged.replace(/"/g, "'")}" version="1.0">`,
    )
    const result = verify(xml)
    expect(result.documents).toHaveLength(1)
    expect(result.documents[0]).toMatchObject({ xml: hidden, folio: 1 })
  })

  // Searching the text for each `<DTE` took quadratic time: 0.2 MB of these took 3 s, so 2 MB would take minutes.
  test('elements nested deeper than any document are XML_PARSE_FAILED, never a stack overflow', () => {
    const nested = (depth: number): string => `<DTE>${'<a>'.repeat(depth)}${'</a>'.repeat(depth)}</DTE>`
    for (const depth of [100, 5000, 20000])
      expectFailure(() => verify(nested(depth)), 'XML_PARSE_FAILED', { reason: 'nested deeper than 100 elements' })
  })

  test('megabytes of start and closing tags in attribute values are read in linear time', () => {
    const xml = envelopeOf([issued(1)]).replace(
      '</SetDTE>',
      `<Extra a="${'<DTE '.repeat(200000)}" b="${'</DTE'.repeat(200000)}" c="${'<TED <DD <CAF '.repeat(70000)}"/></SetDTE>`,
    )
    expect(xml.length).toBeGreaterThan(2_900_000)
    const started = Date.now()
    expect(verify(xml).documents).toHaveLength(1)
    expect(Date.now() - started).toBeLessThan(5000)
  }, 15000)

  test('positions hold across CR LF, a byte order mark and characters outside the BMP', () => {
    const { xml } = issued(1)
    const crlf = `\u{FEFF}<?xml version="1.0" encoding="ISO-8859-1"?>\r\n<!-- \u{1F600} -->\r\n${xml}\r\n`
    expect(verify(crlf).documents[0]).toMatchObject({ xml, status: 'valid' })
  })
})

describe('verifyReceivedDocuments: the node checked is the node read', () => {
  // A review's attack on reading each DTE's text by position: a valid DTE in a comment just before the real one, and a
  // comment with U+2029 after the real one's start tag, where xmldom's column count restarts. Comments are outside
  // C14N, so every signature still holds.
  const decoyed = (envelope: string, decoy: string): string => {
    const start = envelope.indexOf('<DTE')
    const tagEnd = envelope.indexOf('>', start) + 1
    const head = `${envelope.slice(0, start)}<!--${decoy}-->`
    const lineStart = head.lastIndexOf('\n') + 1
    const pad = lineStart + head.length - (start + 4) - 1 - (head.length + tagEnd - start) - 4
    return `${head}${envelope.slice(start, tagEnd)}<!--${'x'.repeat(pad)}\u{2029}-->${envelope.slice(tagEnd)}`
  }
  const decoy = issued(2).xml

  test('a genuine envelope with a decoy in a comment reports its own document', () => {
    const result = verify(decoyed(envelopeOf([issued(1)]), decoy))
    expect(result.documents).toHaveLength(1)
    expect(result.documents[0]).toMatchObject({ folio: 1, status: 'valid' })
    expect(result.status).toBe('valid')
  })

  test('a forged document cannot hide behind a decoy in a comment', () => {
    const forged = stampedWith(1, signedCaf(), { dd: (dd) => dd.replace(/<MNT>\d+<\/MNT>/, '<MNT>999</MNT>') }).xml
    const result = verify(decoyed(envelopeAround([forged]), decoy))
    expect(result.documents).toHaveLength(1)
    expect(result.documents[0]).toMatchObject({ folio: 1, ted: { signatureValid: false }, status: 'invalid' })
    expect(result.documents[0].xml).not.toBe(decoy)
    expect(result.status).toBe('invalid')
  })

  test.each([
    ['a lone CR', '\r'],
    ['NEL', '\x85'],
    ['CR NEL', '\r\x85'],
    ['LS', '\u{2028}'],
    ['PS', '\u{2029}'],
  ])('%s in text and around tags changes nothing', (_label, mark) => {
    const signed = signedElsewhere(issued(1), ` xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}"`, (text) =>
      text
        .replace('<GiroRecep>Comercio</GiroRecep>', `<GiroRecep>Comer${mark}cio</GiroRecep>`)
        .replace('</Encabezado>', `</Encabezado>${mark}`),
    )
    expect(only(signed)).toMatchObject({ folio: 1, status: 'valid' })
    const envelope = envelopeAround([`${mark}${signed}${mark}`])
    const result = verify(envelope)
    expect(result.documents).toHaveLength(1)
    expect(result.documents[0]).toMatchObject({ folio: 1, status: 'valid' })
    expect(result.status).toBe('valid')
  })

  // xmldom turns a raw NEL or LS into a line feed, in text and in attribute values, so the forms written from an
  // element must keep them as references.
  test.each([
    ['NEL', '&#x85;'],
    ['LS', '&#x2028;'],
  ])('a %s reference stays itself in text and attribute values, both ways', (_label, reference) => {
    const signedWith = (text: string, attribute: string): string =>
      signedElsewhere(issued(1), ` xmlns="${SII_NS}"`, (xml) =>
        xml.replace('<GiroRecep>Comercio</GiroRecep>', `<GiroRecep nota="a${attribute}b">Comer${text}cio</GiroRecep>`),
      )
    // A line feed swapped for the reference after signing, in the text or in the attribute, fails.
    const signedWithLf = signedWith('\n', '&#xA;')
    for (const tampered of [
      signedWithLf.replace('Comer\ncio', `Comer${reference}cio`),
      signedWithLf.replace('a&#xA;b', `a${reference}b`),
    ]) {
      expect(tampered).not.toBe(signedWithLf)
      expect(verifyDocumentSignature(tampered).valid).toBe(false)
      expect(only(tampered).signature.valid).toBe(false)
    }
    // A document signed with the reference itself verifies, and its xml keeps it.
    const genuine = only(signedWith(reference, reference))
    expect(genuine.status).toBe('valid')
    expect(genuine.xml).toContain(`<GiroRecep nota="a${reference}b">Comer${reference}cio</GiroRecep>`)
  })

  test('a closing DTE tag in a comment, an instruction or a CDATA section inside the document is only text', () => {
    const signed = signedElsewhere(issued(1), ` xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}"`, (text) =>
      text
        .replace('<Encabezado>', '<!-- </DTE> --><?nota </DTE>?><Encabezado>')
        .replace('<GiroRecep>Comercio</GiroRecep>', '<GiroRecep><![CDATA[Comercio </DTE>]]></GiroRecep>'),
    )
    const document = verify(envelopeAround([signed])).documents[0]
    expect(document.status).toBe('valid')
    // `xml` is written from the element: the comment and the instruction stay, the CDATA section becomes escaped text.
    expect(document.xml).toContain('<!-- </DTE> --><?nota </DTE>?><Encabezado>')
    expect(document.xml).toContain('<GiroRecep>Comercio &lt;/DTE&gt;</GiroRecep>')
  })

  test('xml is the element written from the DOM, which reads back the same', () => {
    const { xml } = issued(1)
    const quoted = xml.replace('<GiroRecep>Comercio</GiroRecep>', '<GiroRecep>Comercio &#x41;</GiroRecep>')
    expect(only(quoted).xml).toBe(xml.replace('<GiroRecep>Comercio</GiroRecep>', '<GiroRecep>Comercio A</GiroRecep>'))
  })
})

describe('verifyReceivedDocuments: the environment', () => {
  const production = { siiKeys: { 300: TEST_SII_KEYS[100] } }

  test('in production by default, a certification CAF is invalid, with the mismatch environment', () => {
    const document = verifyReceivedDocuments(issued(1).xml, { siiKeys: TEST_SII_KEYS }).documents[0]
    expect(document.caf).toEqual({ ...VALID_CAF, mismatches: ['environment'], status: 'invalid' })
    expect(document.status).toBe('invalid')
  })

  test('a production CAF passes in production and is invalid in certification', () => {
    const { xml } = issued(1, signedCaf({ keyId: 300 }))
    const valid = verifyReceivedDocuments(xml, production).documents[0]
    expect(valid.caf).toEqual({ ...VALID_CAF, keyId: 300, environment: 'production' })
    expect(valid.status).toBe('valid')
    const other = verifyReceivedDocuments(xml, { ...production, environment: 'certification' }).documents[0]
    expect(other.caf).toMatchObject({ environment: 'production', mismatches: ['environment'], status: 'invalid' })
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
      'a prefixed DTE',
      (xml: string) => xml.replace('</SetDTE>', `<x:DTE xmlns:x="${SII_NS}" version="1.0"/></SetDTE>`),
    ],
  ])('%s is XML_PARSE_FAILED', (_label, edit) => {
    expectFailure(() => verify(edit(envelopeOf([issued(1)]))), 'XML_PARSE_FAILED', { field: 'DTE' })
  })

  test.each([
    [
      'before the others',
      (xml: string) => xml.replace('<Caratula version="1.0">', '<DTE version="1.0"/><Caratula version="1.0">'),
    ],
    ['after the others', (xml: string) => xml.replace('</SetDTE>', '<DTE version="1.0"/></SetDTE>')],
  ])('an empty DTE %s is XML_PARSE_FAILED', (_label, edit) => {
    expectFailure(() => verify(edit(envelopeOf([issued(1)]))), 'XML_PARSE_FAILED')
  })

  test.each([
    ['an internal subset that declares an entity', '<!DOCTYPE EnvioDTE [<!ENTITY e "<DTE/>">]>'],
    ['an external id', '<!DOCTYPE EnvioDTE SYSTEM "EnvioDTE.dtd">'],
  ])('a DOCTYPE with %s is XML_PARSE_FAILED, before it is parsed', (_label, doctype) => {
    const xml = envelopeOf([issued(1)]).replace('<EnvioDTE ', `${doctype}<EnvioDTE `)
    expectFailure(() => verify(xml), 'XML_PARSE_FAILED', { field: 'DOCTYPE' })
  })

  test('a Documento with a prefix is XML_PARSE_FAILED, beside the real one or alone', () => {
    const { xml } = issued(1)
    const prefixed = xml.replace('</Documento>', `</Documento><x:Documento xmlns:x="${SII_NS}" ID="Otro"/>`)
    expectFailure(() => verify(prefixed), 'XML_PARSE_FAILED', { field: 'Documento' })
    const alone = xml
      .replace('<Documento ', `<x:Documento xmlns:x="${SII_NS}" `)
      .replace('</Documento>', '</x:Documento>')
    expectFailure(() => verify(alone), 'XML_PARSE_FAILED', { field: 'Documento' })
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
