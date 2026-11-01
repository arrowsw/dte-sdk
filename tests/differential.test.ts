import { execFileSync } from 'node:child_process'
import { parseCaf } from '../src/caf/parse'
import { loadCertificateFromPem } from '../src/certificate/pem'
import { createDocument } from '../src/document/create'
import { issueDocument } from '../src/document/issue'
import { createEnvelope } from '../src/envelope/create'
import { signEnvelope } from '../src/envelope/sign'
import { toSiiDocument } from '../src/model/codec'
import { chileTimestamp } from '../src/time/chile'
import type { DocumentInput } from '../src/model/document'
import { fixtureText, FIXED_NOW, ISSUER_RUT, RECEIVER_RUT } from './support/fixtures'

/**
 * Byte-for-byte comparison against an external reference harness (see the plan for the
 * stdin/stdout JSON contract). Opt-in: RUN_DIFFERENTIAL=1 DTE_REFERENCE_HARNESS=/path/to/harness.
 */
const harness = process.env.DTE_REFERENCE_HARNESS
const guarded = process.env.RUN_DIFFERENTIAL === '1' && harness ? describe : describe.skip

const issuer = {
  rut: ISSUER_RUT,
  businessName: 'Empresa Ejemplo SpA',
  businessActivity: 'Desarrollo de software',
  address: 'Av. Ejemplo 123',
  commune: 'Santiago',
  activityCode: 620200,
}
const receiver = {
  rut: RECEIVER_RUT,
  businessName: 'Cliente Ñandú SA',
  businessActivity: 'Comercio',
  address: 'Calle 456',
  commune: 'Providencia',
}
const stampedAt = chileTimestamp(FIXED_NOW)

const cases: readonly { name: string; kind: 'dte' | 'receipt'; caf: string; input: DocumentInput }[] = [
  {
    name: 'invoice 33 with exempt line and reference',
    kind: 'dte',
    caf: 'caf-33.xml',
    input: {
      type: 33,
      folio: 7,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [
        { name: 'Licencia anual', quantity: 2, unitPrice: 1000 },
        { name: 'Exento', unitPrice: 500, exempt: true },
      ],
      references: [{ documentType: 801, folio: 'OC-77', date: '2026-11-01', reason: 'Orden de compra' }],
    },
  },
  {
    name: 'invoice 33 with VAT-included prices',
    kind: 'dte',
    caf: 'caf-33.xml',
    input: {
      type: 33,
      folio: 8,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [{ name: 'Producto', quantity: 2, unitPrice: 1000 }],
      pricesIncludeVat: true,
    },
  },
  {
    name: 'receipt 39 for a final consumer',
    kind: 'receipt',
    caf: 'caf-39.xml',
    input: {
      type: 39,
      folio: 1,
      issueDate: '2026-11-15',
      issuer,
      items: [{ name: 'Café', quantity: 1, unitPrice: 1000 }],
      pricesIncludeVat: true,
    },
  },
]

guarded('differential against the reference harness', () => {
  const certificate = loadCertificateFromPem(
    { privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') },
    { now: FIXED_NOW },
  )

  test.each(cases)('$name', ({ kind, caf: cafFile, input }) => {
    const cafXml = fixtureText(cafFile)
    const caf = parseCaf(cafXml)
    const doc = createDocument(input)
    const signed = issueDocument({ document: doc, caf, certificate, now: FIXED_NOW })
    const cover = {
      issuerRut: ISSUER_RUT,
      senderRut: ISSUER_RUT,
      receiverRut: '60803000-K',
      resolutionDate: '2014-08-22',
      resolutionNumber: 80,
      signedAt: stampedAt,
      setId: kind === 'receipt' ? 'ENVIOBOLETA_TEST' : 'DTE_SetDoc_TEST',
    }
    const envelope = signEnvelope(createEnvelope({ kind, documents: [signed], cover, now: FIXED_NOW }), certificate)

    const payload = {
      kind,
      siiDocument: toSiiDocument(doc),
      cafXml,
      certificatePem: fixtureText('cert.pem'),
      privateKeyPem: fixtureText('cert.key.pem'),
      stampedAt,
      cover,
    }
    const output = JSON.parse(
      execFileSync(process.execPath, [harness as string], {
        input: JSON.stringify(payload),
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      }),
    ) as { documentXml: string; envelopeXml: string }

    expect(signed.xml).toBe(output.documentXml)
    expect(envelope.xml).toBe(output.envelopeXml)
  })
})
