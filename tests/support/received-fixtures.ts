// Documents as a supplier would send them, for the tests of verifyReceivedDocuments. A test "SII" (sii-test-key.pem,
// from `npm run fixtures:sii`) signs the DA of every CAF here, the CAF key stamps the TED and the fixture certificate
// signs the documents and the envelope. Every RUT, name and amount is invented.
import { parseCaf, type Caf } from '../../src/caf/parse'
import { signWithCaf } from '../../src/caf/sign'
import { loadCertificateFromPem } from '../../src/certificate/pem'
import { rsaPublicKeyParts, rsaSha1SignBase64 } from '../../src/crypto/rsa'
import { sha1Base64 } from '../../src/crypto/digest'
import { createDocument } from '../../src/document/create'
import { issueDocument } from '../../src/document/issue'
import { signDocument, type SignedDocument } from '../../src/document/sign'
import { createEnvelope } from '../../src/envelope/create'
import { signEnvelope } from '../../src/envelope/sign'
import type { DocumentInput } from '../../src/model/document'
import { buildSignatureXml, buildSignedInfo } from '../../src/signature/xmldsig'
import { buildDdString, buildTedXml, tedText } from '../../src/ted/build'
import { canonicalizeElement } from '../../src/xml/c14n'
import { wrapBase64 } from '../../src/xml/format'
import { parseXmlDom } from '../../src/xml/parse'
import { fixtureText, FIXED_NOW, ISSUER_RUT, RECEIVER_RUT } from './fixtures'

export const SII_NS = 'http://www.sii.cl/SiiDte'
export const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'
/** A RUT of another company, for a CAF that is not the issuer's. */
export const OTHER_RUT = '10000004-0'

const SII_TEST_KEY = fixtureText('sii-test-key.pem')
/** The test SII's public key in place of the SII's own key 100. */
export const TEST_SII_KEYS = { 100: rsaPublicKeyParts(SII_TEST_KEY) } as const

export const certificate = loadCertificateFromPem(
  { privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') },
  { now: FIXED_NOW },
)

const SIGNED_CAF = fixtureText('caf-33-signed.xml')

/** What can be changed in the DA of the signed fixture CAF before the test SII signs it again. */
export type CafEdits = {
  readonly issuerRut?: string
  readonly type?: number
  readonly from?: number
  readonly to?: number
  readonly keyId?: number
  readonly businessName?: string
  /** Changes the business name after the SII signed the DA, so the FRMA no longer verifies. */
  readonly tamperAfterSigning?: boolean
}

const flatDa = (xml: string): string => /<DA>[\s\S]*?<\/DA>/.exec(xml)![0].replace(/>\s+</g, '><')

/** The CAF XML of the fixture, with its DA edited and signed again by the test SII. */
export const signedCafXml = (edits: CafEdits = {}): string => {
  const edited = SIGNED_CAF.replace(/<RE>[^<]*<\/RE>/, `<RE>${edits.issuerRut ?? ISSUER_RUT}</RE>`)
    .replace(/<TD>\d+<\/TD>/, `<TD>${edits.type ?? 33}</TD>`)
    .replace(/<RNG><D>\d+<\/D><H>\d+<\/H><\/RNG>/, `<RNG><D>${edits.from ?? 1}</D><H>${edits.to ?? 100}</H></RNG>`)
    .replace(/<IDK>\d+<\/IDK>/, `<IDK>${edits.keyId ?? 100}</IDK>`)
    .replace(/<RS>[^<]*<\/RS>/, `<RS>${edits.businessName ?? 'COMERCIAL ANDINA SPA'}</RS>`)
  const frma = rsaSha1SignBase64(SII_TEST_KEY, flatDa(edited), 'latin1')
  const signed = edited.replace(/(<FRMA[^>]*>)[^<]*(<\/FRMA>)/, `$1${frma}$2`)
  return edits.tamperAfterSigning ? signed.replace(/<RS>[^<]*<\/RS>/, '<RS>OTRA EMPRESA SPA</RS>') : signed
}

/** The fixture CAF, parsed, with its DA edited and signed again by the test SII. */
// Signing with the fixture certificate takes most of a second in pure JavaScript, so what is built is kept.
const built = new Map<string, unknown>()
const once = <T>(key: string, build: () => T): T => {
  if (!built.has(key)) built.set(key, build())
  return built.get(key) as T
}

export const signedCaf = (edits: CafEdits = {}): Caf =>
  once(`caf ${JSON.stringify(edits)}`, () => parseCaf(signedCafXml(edits)))

const issuer = {
  rut: ISSUER_RUT,
  businessName: 'Comercial Andina SpA',
  businessActivity: 'Software',
  address: 'Av. Los Aromos 1540',
  commune: 'Santiago',
  activityCode: 620200,
}
const receiver = {
  rut: RECEIVER_RUT,
  businessName: 'Comercializadora Rapel Ltda',
  businessActivity: 'Comercio',
  address: 'Pasaje Los Olmos 88',
  commune: 'Providencia',
}

/** An invoice of the fixture issuer to the fixture receiver. */
export const invoiceInput = (folio: number, overrides: Partial<DocumentInput> = {}): DocumentInput => ({
  type: 33,
  folio,
  issueDate: '2026-11-15',
  issuer,
  receiver,
  items: [
    { name: 'Licencia', quantity: 1, unitPrice: 100000 },
    { name: 'Soporte', quantity: 3, unitPrice: 15000 },
  ],
  ...overrides,
})

/** A document issued the normal way: stamped with `caf` and signed with the fixture certificate. */
export const issued = (folio: number, caf: Caf = signedCaf(), overrides: Partial<DocumentInput> = {}): SignedDocument =>
  once(`issued ${folio} ${caf.xml} ${JSON.stringify(overrides)}`, () =>
    issueDocument({ document: invoiceInput(folio, overrides), caf, certificate, now: FIXED_NOW }),
  )

/**
 * A document stamped with any CAF, past the checks of `stampDocument`, and signed. `dd` edits the DD after the CAF key
 * signed it, so the TED no longer verifies; `fields` changes what the DD says before it is signed.
 */
export const stampedWith = (
  folio: number,
  caf: Caf,
  options: {
    readonly dd?: (dd: string) => string
    readonly fields?: Partial<Parameters<typeof buildDdString>[0]>
  } = {},
): SignedDocument => {
  const doc = createDocument(invoiceInput(folio))
  const fields = {
    issuerRut: doc.header.issuer.rut,
    documentType: doc.header.type,
    folio: doc.header.folio,
    issueDate: doc.header.issueDate,
    receiverRut: doc.header.receiver.rut,
    receiverName: tedText(doc.header.receiver.businessName),
    totalAmount: doc.header.totals.totalAmount,
    firstItemName: tedText(doc.items[0].name),
    caf: caf.xml,
    stampedAt: '2026-11-15T15:30:00',
    ...options.fields,
  }
  const dd = buildDdString(fields)
  const signature = signWithCaf(caf, dd)
  const ted = { ...fields, signature, xml: buildTedXml(options.dd ? options.dd(dd) : dd, signature) }
  return signDocument({ ...doc, ted }, certificate, { now: FIXED_NOW })
}

/** The signed `EnvioDTE` of the documents. */
export const envelopeOf = (documents: readonly SignedDocument[]): string =>
  once(`envelope ${documents.map((document) => document.xml).join('')}`, () => envelopeXml(documents))

const envelopeXml = (documents: readonly SignedDocument[]): string =>
  signEnvelope(
    createEnvelope({
      kind: 'dte',
      documents,
      cover: {
        issuerRut: ISSUER_RUT,
        senderRut: ISSUER_RUT,
        receiverRut: RECEIVER_RUT,
        resolutionDate: '2026-01-15',
        resolutionNumber: 0,
      },
      now: FIXED_NOW,
    }),
    certificate,
  ).xml

const signatureOf = (signedInfo: string, canonicalSignedInfo: string): string =>
  buildSignatureXml(signedInfo, wrapBase64(rsaSha1SignBase64(certificate.privateKeyPem, canonicalSignedInfo, 'utf8')), {
    modulus: wrapBase64(certificate.publicKey.modulus),
    exponent: certificate.publicKey.exponent,
    certificate: wrapBase64(certificate.certificateBase64),
  })

/**
 * A `<DTE>` signed again the way other software may sign it: with only the namespaces `declarations` puts on its root
 * (none, or only the SII's), so its digest covers neither `xmlns:xsi` nor, with none, `xmlns`. `edit` changes the
 * document before it is signed.
 */
export const signedElsewhere = (
  doc: SignedDocument,
  declarations: string,
  edit: (xml: string) => string = (xml) => xml,
): string => {
  const unsigned = edit(
    doc.xml.replace(/<Signature[\s\S]*<\/Signature>/, '').replace(/^<DTE[^>]*>/, `<DTE${declarations} version="1.0">`),
  )
  const element = parseXmlDom(unsigned).getElementsByTagName('Documento')[0]
  const digest = sha1Base64(canonicalizeElement(element), 'utf8')
  const id = element.getAttribute('ID')!
  // The SignedInfo is canonicalized with the namespaces of the root it was signed under.
  const canonical = buildSignedInfo(id, digest, { expandTags: true, includeXsi: declarations.includes('xmlns:xsi') })
  const signature = signatureOf(buildSignedInfo(id, digest, { includeXsi: false }), canonical)
  return unsigned.replace('</DTE>', `${signature}</DTE>`)
}

/** An `EnvioDTE` that carries the given `<DTE>` texts as they are, signed by the fixture certificate. */
export const envelopeAround = (dtes: readonly string[]): string => {
  const unsigned = envelopeOf([issued(1)])
    .replace(/<\/SetDTE><Signature[\s\S]*<\/Signature><\/EnvioDTE>$/, '</SetDTE></EnvioDTE>')
    .replace(/<DTE[\s>][\s\S]*<\/DTE>/, () => dtes.join('\n'))
  const set = parseXmlDom(unsigned).getElementsByTagName('SetDTE')[0]
  const digest = sha1Base64(canonicalizeElement(set), 'utf8')
  const id = set.getAttribute('ID')!
  const signature = signatureOf(buildSignedInfo(id, digest), buildSignedInfo(id, digest, { expandTags: true }))
  return unsigned.replace('</SetDTE></EnvioDTE>', `</SetDTE>${signature}</EnvioDTE>`)
}
