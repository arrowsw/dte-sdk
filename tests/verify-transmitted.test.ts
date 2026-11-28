import { expectTypeOf } from 'expect-type'
import { parseCaf } from '../src/caf/parse'
import { verifyReceivedDocuments } from '../src/document/verify-received'
import { issueDocument } from '../src/document/issue'
import { createEnvelope } from '../src/envelope/create'
import { signEnvelope } from '../src/envelope/sign'
import { readReceivedStructure } from '../src/document/received-structure'
import {
  documentTexts,
  verifyTransmittedEnvelope,
  type TransmittedDocumentCheck,
  type TransmittedEnvelopeVerification,
} from '../src/envelope/verify-transmitted'
import { DteError } from '../src/errors'
import { fixtureText, FIXED_NOW, ISSUER_RUT } from './support/fixtures'
import {
  certificate,
  envelopeAround,
  envelopeOf,
  issued,
  SII_NS,
  signedCaf,
  signedElsewhere,
  stampedWith,
  TEST_SII_KEYS,
  XSI_NS,
} from './support/received-fixtures'

const PASSED: Omit<TransmittedDocumentCheck, 'folio'> = {
  type: 33,
  signatureValid: true,
  stampValid: true,
  valid: true,
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

// The library's own output, read as the SII reads it.
describe('verifyTransmittedEnvelope: an envelope the library issues', () => {
  test('an EnvioDTE passes: each document on its own, its stamp as written, and the envelope', () => {
    const result = verifyTransmittedEnvelope(envelopeOf([issued(1), issued(2)]))
    expect(result).toEqual({
      root: 'EnvioDTE',
      envelopeSignatureValid: true,
      documents: [
        { ...PASSED, folio: 1 },
        { ...PASSED, folio: 2 },
      ],
      valid: true,
    })
    expectTypeOf(result).toEqualTypeOf<TransmittedEnvelopeVerification>()
  })

  test('an EnvioBOLETA passes', () => {
    const receipt = issueDocument({
      document: {
        type: 39,
        folio: 1,
        issueDate: '2026-11-15',
        issuer: {
          rut: ISSUER_RUT,
          businessName: 'Comercial Andina SpA',
          businessActivity: 'Software',
          address: 'Av. Los Aromos 1540',
          commune: 'Santiago',
          activityCode: 620200,
        },
        items: [{ name: 'Café', unitPrice: 1000 }],
        pricesIncludeVat: true,
      },
      caf: parseCaf(fixtureText('caf-39.xml')),
      certificate,
      now: FIXED_NOW,
    })
    const cover = { issuerRut: ISSUER_RUT, senderRut: ISSUER_RUT, resolutionDate: '2026-01-15', resolutionNumber: 0 }
    const xml = signEnvelope(
      createEnvelope({ kind: 'receipt', documents: [receipt], cover, now: FIXED_NOW }),
      certificate,
    ).xml
    expect(verifyTransmittedEnvelope(xml)).toEqual({
      root: 'EnvioBOLETA',
      envelopeSignatureValid: true,
      documents: [{ type: 39, folio: 1, signatureValid: true, stampValid: true, valid: true }],
      valid: true,
    })
  })
})

describe('verifyTransmittedEnvelope: what verifies in the parsed envelope and not as the SII cuts it', () => {
  test('a DTE that lost its own xmlns in the text fails on its signature', () => {
    const dte = issued(1).xml.replace(`<DTE xmlns="${SII_NS}"`, '<DTE')
    expect(dte).not.toContain(`<DTE xmlns="${SII_NS}"`)
    const xml = envelopeAround([dte])
    // Inside the envelope it inherits the namespace, so read from the tree it verifies.
    expect(
      verifyReceivedDocuments(xml, { siiKeys: TEST_SII_KEYS, environment: 'certification' }).documents[0],
    ).toMatchObject({
      signature: { valid: true },
    })
    expect(verifyTransmittedEnvelope(xml)).toEqual({
      root: 'EnvioDTE',
      envelopeSignatureValid: true,
      documents: [{ ...PASSED, folio: 1, signatureValid: false, valid: false }],
      valid: false,
    })
  })

  test('a stamp written again after it was signed fails on the stamp, though the document still verifies', () => {
    // An empty receiver name signs `<RSR></RSR>`; the same element written `<RSR/>` canonicalizes the same, so the
    // document's signature still verifies, but the bytes of the DD are no longer the ones the CAF key signed.
    const signed = stampedWith(1, signedCaf(), { fields: { receiverName: '' } })
    expect(signed.xml).toContain('<RSR></RSR>')
    const xml = envelopeAround([signed.xml.replace('<RSR></RSR>', '<RSR/>')])
    expect(
      verifyReceivedDocuments(xml, { siiKeys: TEST_SII_KEYS, environment: 'certification' }).documents[0].ted.valid,
    ).toBe(true)
    expect(verifyTransmittedEnvelope(xml)).toEqual({
      root: 'EnvioDTE',
      envelopeSignatureValid: true,
      documents: [{ ...PASSED, folio: 1, stampValid: false, valid: false }],
      valid: false,
    })
  })

  test('an envelope whose cover changed after it was signed fails on the envelope signature', () => {
    const xml = envelopeOf([issued(1)]).replace('<NroResol>0</NroResol>', '<NroResol>1</NroResol>')
    expect(verifyTransmittedEnvelope(xml)).toEqual({
      root: 'EnvioDTE',
      envelopeSignatureValid: false,
      documents: [{ ...PASSED, folio: 1 }],
      valid: false,
    })
  })
})

describe('verifyTransmittedEnvelope: incomplete and malformed inputs', () => {
  test('an envelope without its signature, a document without its signature and one without a stamp are failed checks', () => {
    const unsigned = issued(1).xml.replace(/<Signature[\s\S]*<\/Signature>/, '')
    const stampless = issued(2).xml.replace(/<TED[\s\S]*<\/TED>/, '')
    const xml = envelopeAround([unsigned, stampless]).replace(/<\/SetDTE><Signature[\s\S]*<\/Signature>/, '</SetDTE>')
    expect(verifyTransmittedEnvelope(xml)).toEqual({
      root: 'EnvioDTE',
      envelopeSignatureValid: false,
      documents: [
        { ...PASSED, folio: 1, signatureValid: false, valid: false },
        { ...PASSED, folio: 2, signatureValid: false, stampValid: false, valid: false },
      ],
      valid: false,
    })
  })

  test('a stamp whose key or signature cannot be read is a failed check', () => {
    const xml = envelopeAround([issued(1).xml.replace(/<FRMT([^>]*)>[^<]*<\/FRMT>/, '<FRMT$1>not base64</FRMT>')])
    expect(verifyTransmittedEnvelope(xml).documents[0].stampValid).toBe(false)
  })

  test.each([
    ['empty text', '', { reason: 'empty' }],
    ['text that is not XML', '<EnvioDTE><SetDTE>', {}],
    ['a document alone', issued(1).xml, { field: 'root', root: 'DTE' }],
    ['another root', '<Otro/>', { field: 'root' }],
  ])('%s is refused with XML_PARSE_FAILED', (_label, xml, details) => {
    expectFailure(() => verifyTransmittedEnvelope(xml), 'XML_PARSE_FAILED', details)
  })

  test('an envelope without documents is refused with ENVELOPE_EMPTY', () => {
    expectFailure(() => verifyTransmittedEnvelope('<EnvioDTE><SetDTE ID="X"/></EnvioDTE>'), 'ENVELOPE_EMPTY')
  })

  test('a stamp found twice in the text of a document is a failed check, even when each verifies', () => {
    const dte = issued(1).xml
    const ted = /<TED[\s\S]*<\/TED>/.exec(dte)![0]
    const twice = envelopeAround([dte.replace('</Documento>', () => `${ted}</Documento>`)])
    expect(verifyTransmittedEnvelope(twice).documents[0].stampValid).toBe(false)
  })
})

// "Instructivo Emisión DTE" of the SII, A.2.4, pages 19 to 21: "Para efecto de calcular el digest de la firma digital
// del timbre electrónico [...] se eliminan los caracteres de fin de línea y los blancos y/o tab entre TAGS, así como la
// referencia a NameSpaces. El digest se calcula sobre el string resultante."
describe('verifyTransmittedEnvelope: the stamp as the Instructivo has it verified', () => {
  test('a DD written with blanks, tabs and ends of line between its tags still verifies', () => {
    const indent = (text: string): string =>
      text.replace(/<DD>[\s\S]*<\/DD>/, (dd) => dd.replace(/></g, '>\n\t\t<').replace(/<RSR>/, ' \t<RSR>'))
    const dte = signedElsewhere(issued(5), ` xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}"`, indent)
    expect(dte).toContain('<DD>\n\t\t<RE>')
    expect(verifyTransmittedEnvelope(envelopeAround([dte])).documents).toEqual([{ ...PASSED, folio: 5 }])
  })

  test('a DD that names the SII namespace still verifies', () => {
    // The document's namespace already is the SII's, so the declaration changes no canonical form.
    const dte = issued(1).xml.replace('<DD>', `<DD xmlns="${SII_NS}">`)
    expect(verifyTransmittedEnvelope(envelopeAround([dte])).documents).toEqual([{ ...PASSED, folio: 1 }])
  })

  test('a DD whose content changed fails: the empty element written <RSR/> where <RSR></RSR> was signed', () => {
    // The Instructivo's string removes what lies between tags, "sin modificar la información que va entre el tag de
    // inicio y el tag de fin de los elementos terminales", and says nothing of writing an element again.
    const signed = stampedWith(1, signedCaf(), { fields: { receiverName: '' } })
    const dte = signed.xml.replace('<RSR></RSR>', '<RSR/>').replace(/<DD>/, '<DD>\n')
    expect(verifyTransmittedEnvelope(envelopeAround([dte])).documents[0].stampValid).toBe(false)
  })
})

describe('verifyTransmittedEnvelope: the cut of each DTE from the text', () => {
  test('a comment that holds a valid DTE does not stand for a tampered one closed with blanks', () => {
    // The real document says another total than the one it signed, and closes as `</DTE >`, which XML allows.
    const tampered = issued(2)
      .xml.replace(/<MntTotal>\d+<\/MntTotal>/, '<MntTotal>1</MntTotal>')
      .replace(/<\/DTE>$/, '</DTE >')
    const xml = envelopeAround([tampered]).replace('<SetDTE', () => `<!--${issued(1).xml}--><SetDTE`)
    expect(
      verifyReceivedDocuments(xml, { siiKeys: TEST_SII_KEYS, environment: 'certification' }).documents[0].signature
        .valid,
    ).toBe(false)
    expectFailure(() => verifyTransmittedEnvelope(xml), 'XML_PARSE_FAILED', { field: 'comment' })
  })

  test.each([
    ['comment', '<!-- nota -->'],
    ['CDATA', '<![CDATA[nota]]>'],
    ['instruction', '<?nota uno?>'],
  ])('a text with a %s, which could hide a DTE, is refused', (field, markup) => {
    const xml = envelopeOf([issued(1)]).replace('<Caratula', () => `${markup}<Caratula`)
    expectFailure(() => verifyTransmittedEnvelope(xml), 'XML_PARSE_FAILED', { field })
  })

  test('the XML declaration that opens the file is not an instruction that is refused', () => {
    expect(envelopeOf([issued(1)])).toMatch(/^<\?xml /)
    expect(verifyTransmittedEnvelope(envelopeOf([issued(1)])).valid).toBe(true)
  })

  test('a DTE closed with blanks before its > is cut whole', () => {
    const xml = envelopeAround([issued(1).xml.replace(/<\/DTE>$/, '</DTE\n >')])
    expect(verifyTransmittedEnvelope(xml)).toMatchObject({ documents: [{ ...PASSED, folio: 1 }], valid: true })
  })

  test('each cut must hold what its element holds, and there must be one per element', () => {
    const xml = envelopeOf([issued(1)])
    const other = readReceivedStructure(envelopeOf([issued(2)])).documents
    expectFailure(() => documentTexts(xml, other), 'XML_PARSE_FAILED', { field: 'DTE', index: 0 })
    const two = readReceivedStructure(envelopeOf([issued(1), issued(2)])).documents
    expectFailure(() => documentTexts(xml, two), 'XML_PARSE_FAILED', { field: 'DTE' })
    expect(documentTexts(xml, readReceivedStructure(xml).documents)).toEqual([issued(1).xml])
  })
})
