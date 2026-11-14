import { parseCaf } from '../src/caf/parse'
import { loadCertificateFromPem } from '../src/certificate/pem'
import { issueDocument } from '../src/document/issue'
import { verifyDocumentSignature } from '../src/document/sign'
import { buildEnvelopeXml } from '../src/envelope/build-xml'
import { createEnvelope, generateSetId } from '../src/envelope/create'
import { signEnvelope, verifyEnvelopeSignature } from '../src/envelope/sign'
import { DteError } from '../src/errors'
import { encodeLatin1 } from '../src/text/latin1'
import { fixtureText, FIXED_NOW, ISSUER_RUT, RECEIVER_RUT } from './support/fixtures'

const caf33 = parseCaf(fixtureText('caf-33.xml'))
const caf39 = parseCaf(fixtureText('caf-39.xml'))
const certificate = loadCertificateFromPem(
  { privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') },
  { now: FIXED_NOW },
)
const issuer = {
  rut: ISSUER_RUT,
  businessName: 'Comercial Andina SpA',
  businessActivity: 'Software',
  address: 'Av. Los Aromos 1540',
  commune: 'Ñuñoa',
}
const receiver = {
  rut: RECEIVER_RUT,
  businessName: 'Comercializadora Rapel Ltda',
  businessActivity: 'Comercio',
  address: 'Pasaje Los Olmos 88',
  commune: 'Providencia',
}
const cafFor = (type: number) => parseCaf(fixtureText('caf-33.xml').replace(/<TD>33<\/TD>/, `<TD>${type}</TD>`))
const issue = (type: 33 | 56 | 61 | 52, folio: number) =>
  issueDocument({
    document: {
      type,
      folio,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [{ name: 'Ítem', unitPrice: 1000 }],
      references:
        type === 33 || type === 52
          ? []
          : [{ documentType: 33, folio: 1, date: '2026-11-01', code: 1, reason: 'Anula' }],
    },
    caf: type === 33 ? caf33 : cafFor(type),
    certificate,
    now: FIXED_NOW,
  })
const receipt = (folio: number) =>
  issueDocument({
    document: {
      type: 39,
      folio,
      issueDate: '2026-11-15',
      issuer,
      items: [{ name: 'Café', unitPrice: 1000 }],
      pricesIncludeVat: true,
    },
    caf: caf39,
    certificate,
    now: FIXED_NOW,
  })
const cover = { issuerRut: '76.543.210-3', senderRut: ISSUER_RUT, resolutionDate: '22-08-2014', resolutionNumber: 80 }

const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn()
    throw new Error('expected DteError')
  } catch (err) {
    expect(err).toBeInstanceOf(DteError)
    expect((err as DteError).code).toBe(code)
  }
}

describe('createEnvelope', () => {
  test('dte envelope: normalized cover, generated set id and subtotals with 33, 61, 56 first', () => {
    const envelope = createEnvelope({
      kind: 'dte',
      documents: [issue(56, 1), issue(52, 2), issue(33, 3), issue(33, 4), issue(61, 5)],
      cover,
      now: FIXED_NOW,
    })
    expect(envelope.setId).toBe('DTE_SetDoc_15_11_2026_15_30_00_000')
    expect(envelope.cover).toEqual({
      issuerRut: ISSUER_RUT,
      senderRut: ISSUER_RUT,
      receiverRut: '60803000-K',
      resolutionDate: '2014-08-22',
      resolutionNumber: 80,
      signedAt: '2026-11-15T15:30:00',
      subtotals: [
        { type: 33, count: 2 },
        { type: 61, count: 1 },
        { type: 56, count: 1 },
        { type: 52, count: 1 },
      ],
    })
  })

  test('explicit receiver, set id and timestamp are respected', () => {
    const envelope = createEnvelope({
      kind: 'dte',
      documents: [issue(33, 1)],
      cover: { ...cover, receiverRut: RECEIVER_RUT, setId: 'SET-X', signedAt: '2026-01-01T00:00:00' },
      now: FIXED_NOW,
    })
    expect(envelope.setId).toBe('SET-X')
    expect(envelope.cover.receiverRut).toBe(RECEIVER_RUT)
    expect(envelope.cover.signedAt).toBe('2026-01-01T00:00:00')
  })

  test('receipt envelope always targets the SII and uses the ENVIOBOLETA prefix', () => {
    const envelope = createEnvelope({
      kind: 'receipt',
      documents: [receipt(1), receipt(2)],
      cover: { ...cover, receiverRut: RECEIVER_RUT },
      now: FIXED_NOW,
    })
    expect(envelope.setId).toBe('ENVIOBOLETA_15_11_2026_15_30_00_000')
    expect(envelope.cover.receiverRut).toBe('60803000-K')
    expect(envelope.cover.subtotals).toEqual([{ type: 39, count: 2 }])
  })

  test('rejects empty envelopes, mixed kinds and bad covers', () => {
    expectCode(() => createEnvelope({ kind: 'dte', documents: [], cover }), 'ENVELOPE_EMPTY')
    expectCode(() => createEnvelope({ kind: 'dte', documents: [receipt(1)], cover }), 'ENVELOPE_KIND_MISMATCH')
    expectCode(() => createEnvelope({ kind: 'receipt', documents: [issue(33, 1)], cover }), 'ENVELOPE_KIND_MISMATCH')
    expectCode(
      () => createEnvelope({ kind: 'dte', documents: [issue(33, 1)], cover: { ...cover, senderRut: 'x' } }),
      'INVALID_RUT',
    )
    expectCode(
      () => createEnvelope({ kind: 'dte', documents: [issue(33, 1)], cover: { ...cover, resolutionDate: 'ayer' } }),
      'INVALID_DATE',
    )
  })

  // `NroResol` is a non-negative integer of at most six digits in `EnvioDTE_v10.xsd` and `EnvioBOLETA_v11.xsd`.
  test.each([1.5, -1, 1_234_567, Number.NaN])('a resolution number of %p is refused', (resolutionNumber) => {
    const bad = { ...cover, resolutionNumber }
    try {
      createEnvelope({ kind: 'dte', documents: [issue(33, 1)], cover: bad })
      throw new Error('expected DteError')
    } catch (err) {
      expect(err).toBeInstanceOf(DteError)
      expect(err).toMatchObject({ code: 'INVALID_OPTION', details: { field: 'cover.resolutionNumber' } })
    }
    expectCode(() => createEnvelope({ kind: 'receipt', documents: [receipt(1)], cover: bad }), 'INVALID_OPTION')
  })

  test('a resolution number of 0, the one of certification, and of 999 999 pass', () => {
    const numbered = (resolutionNumber: number) =>
      createEnvelope({ kind: 'dte', documents: [issue(33, 1)], cover: { ...cover, resolutionNumber } })
    expect(numbered(0).cover.resolutionNumber).toBe(0)
    expect(numbered(999_999).cover.resolutionNumber).toBe(999_999)
  })

  test('generateSetId pads milliseconds', () => {
    expect(generateSetId('X', new Date('2026-11-15T18:30:05.007Z'))).toBe('X_15_11_2026_15_30_05_007')
    expect(generateSetId('X')).toMatch(/^X_\d{2}_\d{2}_\d{4}_\d{2}_\d{2}_\d{2}_\d{3}$/)
  })
})

describe('buildEnvelopeXml / signEnvelope', () => {
  test('renders prolog, root, caratula and the documents joined by newlines without inner prologs', () => {
    const docs = [issue(33, 1), issue(33, 2)]
    const envelope = createEnvelope({ kind: 'dte', documents: docs, cover, now: FIXED_NOW })
    const xml = buildEnvelopeXml(envelope)
    expect(
      xml.startsWith(
        '<?xml version="1.0" encoding="ISO-8859-1"?>\n<EnvioDTE xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte EnvioDTE_v10.xsd" version="1.0"><SetDTE ID="DTE_SetDoc_15_11_2026_15_30_00_000"><Caratula version="1.0">',
      ),
    ).toBe(true)
    expect(xml).toContain(
      `<RutEmisor>${ISSUER_RUT}</RutEmisor><RutEnvia>${ISSUER_RUT}</RutEnvia><RutReceptor>60803000-K</RutReceptor><FchResol>2014-08-22</FchResol><NroResol>80</NroResol><TmstFirmaEnv>2026-11-15T15:30:00</TmstFirmaEnv><SubTotDTE><TpoDTE>33</TpoDTE><NroDTE>2</NroDTE></SubTotDTE></Caratula>`,
    )
    expect(xml).toContain(`</Caratula>${docs[0].xml}\n${docs[1].xml}</SetDTE></EnvioDTE>`)
    expect(xml.indexOf('<?xml')).toBe(xml.lastIndexOf('<?xml'))
  })

  test('receipt envelope uses EnvioBOLETA and its schema', () => {
    const xml = buildEnvelopeXml(createEnvelope({ kind: 'receipt', documents: [receipt(1)], cover, now: FIXED_NOW }))
    expect(xml).toContain(
      '<EnvioBOLETA xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte EnvioBOLETA_v11.xsd" version="1.0"><SetDTE ID="ENVIOBOLETA_',
    )
    expect(xml.endsWith('</SetDTE></EnvioBOLETA>')).toBe(true)
  })

  test('signs the SetDTE; envelope and inner documents all verify; Latin-1 encodable', () => {
    const signed = signEnvelope(
      createEnvelope({ kind: 'dte', documents: [issue(33, 1), issue(61, 2)], cover, now: FIXED_NOW }),
      certificate,
    )
    expect(signed.xml).toContain(
      '</SetDTE><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    )
    expect(signed.xml.endsWith('</Signature></EnvioDTE>')).toBe(true)
    expect(verifyEnvelopeSignature(signed.xml)).toMatchObject({ referenceId: signed.setId, valid: true })
    for (const doc of signed.documents) expect(verifyDocumentSignature(doc.xml).valid).toBe(true)
    expect(encodeLatin1(signed.xml).length).toBe(signed.xml.length)
    expect(signed.xml).toContain('Ñuñoa')
  })

  test('receipt envelope signs and verifies', () => {
    const signed = signEnvelope(
      createEnvelope({ kind: 'receipt', documents: [receipt(1)], cover, now: FIXED_NOW }),
      certificate,
    )
    expect(verifyEnvelopeSignature(signed.xml).valid).toBe(true)
  })

  test('tampering a cover value breaks the envelope signature', () => {
    const signed = signEnvelope(
      createEnvelope({ kind: 'dte', documents: [issue(33, 1)], cover, now: FIXED_NOW }),
      certificate,
    )
    expect(
      verifyEnvelopeSignature(signed.xml.replace('<NroResol>80</NroResol>', '<NroResol>81</NroResol>')).valid,
    ).toBe(false)
  })
})
