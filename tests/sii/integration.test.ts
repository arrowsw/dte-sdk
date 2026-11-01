import {
  createEnvelope,
  createMemoryUploadArchive,
  encodeLatin1,
  issueDocument,
  parseCaf,
  signEnvelope,
  uploadEnvelope,
  verifyEnvelopeSignature,
} from '../../src'
import { fixtureText, FIXED_NOW, ISSUER_RUT, RECEIVER_RUT } from '../support/fixtures'
import { cachedSii, certificate, COMPANY_RUT, siiFixture } from '../support/sii-client'

const SLOW = 30000
const CGI = 'https://maullin.sii.cl/cgi_dte/UPL/DTEUpload'
const REST_UPLOAD = 'https://rahue.sii.cl/recursos/v1/boleta.electronica.envio'
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
const cover = { issuerRut: ISSUER_RUT, senderRut: ISSUER_RUT, resolutionDate: '2014-08-22', resolutionNumber: 80 }

// The other suites feed the client hand-written XML; these prove it accepts what phase 1 really produces.
describe('phase 1 output through the SII client', () => {
  test(
    'a signed EnvioDTE reaches DTEUpload byte for byte and its signature still verifies',
    async () => {
      const document = issueDocument({
        document: {
          type: 33,
          folio: 1,
          issueDate: '2026-11-15',
          issuer,
          receiver,
          items: [{ name: 'Ítem de diseño', unitPrice: 1000 }],
        },
        caf: parseCaf(fixtureText('caf-33.xml')),
        certificate,
        now: FIXED_NOW,
      })
      const envelope = signEnvelope(
        createEnvelope({ kind: 'dte', documents: [document], cover, now: FIXED_NOW }),
        certificate,
      )
      const memory = createMemoryUploadArchive()
      const { sii, fake } = cachedSii(
        [
          {
            url: CGI,
            reply: { body: siiFixture('reception-ok.xml') },
          },
        ],
        { archive: memory.archive },
      )

      const receipt = await uploadEnvelope(sii, { envelope, companyRut: COMPANY_RUT })

      expect(receipt).toMatchObject({ kind: 'dte', channel: 'soap', fileName: 'EnvioDTE.xml', duplicate: false })
      const file = fake.requests[0].parts.find((part) => part.name === 'archivo')!
      expect(file.fileName).toBe('EnvioDTE.xml')
      expect(file.value).toBe(envelope.xml)
      expect(file.value.startsWith('<?xml version="1.0" encoding="ISO-8859-1"?>')).toBe(true)
      // The raw request holds the Latin-1 bytes of the signed XML: `ñ` is 0xF1, never the two UTF-8 bytes.
      const sent = Buffer.from(fake.requests[0].body!)
      expect(sent.includes(Buffer.from(encodeLatin1(envelope.xml)))).toBe(true)
      expect(sent.includes(Buffer.from('Ñuñoa', 'utf8'))).toBe(false)
      expect(Array.from(memory.records()[0].xml)).toEqual(Array.from(encodeLatin1(envelope.xml)))
      // What the SII receives still verifies: the envelope signature covers every document inside it.
      expect(verifyEnvelopeSignature(file.value).valid).toBe(true)
    },
    SLOW,
  )

  test(
    'a signed EnvioBOLETA goes to the receipts REST API in production, counted from its real cover',
    async () => {
      const document = issueDocument({
        document: {
          type: 39,
          folio: 1,
          issueDate: '2026-11-15',
          issuer,
          items: [{ name: 'Café', unitPrice: 1000 }],
          pricesIncludeVat: true,
        },
        caf: parseCaf(fixtureText('caf-39.xml')),
        certificate,
        now: FIXED_NOW,
      })
      const envelope = signEnvelope(
        createEnvelope({ kind: 'receipt', documents: [document], cover, now: FIXED_NOW }),
        certificate,
      )
      expect(envelope.cover.subtotals).toEqual([{ type: 39, count: 1 }])
      const { sii, fake } = cachedSii(
        [{ url: REST_UPLOAD, reply: { body: siiFixture('rest-upload-ok.json'), encoding: 'utf8' } }],
        { environment: 'production' },
      )

      const receipt = await uploadEnvelope(sii, { envelope, companyRut: COMPANY_RUT })

      expect(receipt).toMatchObject({ kind: 'receipt', channel: 'rest', fileName: 'EnvioBOLETA.xml' })
      const file = fake.requests[0].parts.find((part) => part.name === 'archivo')!
      expect(file.value).toBe(envelope.xml)
      expect(Buffer.from(fake.requests[0].body!).includes(Buffer.from(encodeLatin1(envelope.xml)))).toBe(true)
    },
    SLOW,
  )
})
