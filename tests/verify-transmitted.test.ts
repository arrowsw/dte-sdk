import { expectTypeOf } from 'expect-type'
import { parseCaf } from '../src/caf/parse'
import { verifyReceivedDocuments } from '../src/document/verify-received'
import { issueDocument } from '../src/document/issue'
import { createEnvelope } from '../src/envelope/create'
import { signEnvelope } from '../src/envelope/sign'
import {
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
  stampedWith,
  TEST_SII_KEYS,
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

  test('a text whose DTE cuts are not one per element is refused, so no check is made of the wrong text', () => {
    const xml = envelopeOf([issued(1)]).replace('<SetDTE', '<!-- <DTE>x</DTE> --><SetDTE')
    expectFailure(() => verifyTransmittedEnvelope(xml), 'XML_PARSE_FAILED', { field: 'DTE' })
  })
})
