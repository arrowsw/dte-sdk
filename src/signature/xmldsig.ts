import type { Certificate } from '../certificate/certificate'
import { sha1Base64 } from '../crypto/digest'
import { rsaPublicKeyPartsFromCertificatePem, rsaSha1SignBase64, rsaSha1VerifyBase64 } from '../crypto/rsa'
import { DteError } from '../errors'
import { canonicalizeElement, findElement } from '../xml/c14n'
import { wrapBase64 } from '../xml/format'
import { parseXmlDom } from '../xml/parse'

const XMLDSIG_NS = 'http://www.w3.org/2000/09/xmldsig#'
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'
const C14N_ALGORITHM = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
const RSA_SHA1_ALGORITHM = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1'
const SHA1_ALGORITHM = 'http://www.w3.org/2000/09/xmldsig#sha1'
const ENVELOPED_SIGNATURE = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature'

/**
 * EN: The two values that identify a signature.
 * ES: Los dos valores que identifican una firma.
 */
export type XmlSignature = {
  /** EN: Base64 SHA-1 of the canonical signed element. ES: `DigestValue` — SHA-1 en base64 del elemento firmado canónico. */
  readonly digestValue: string
  /** EN: Base64 RSA signature, single line. ES: `SignatureValue` — Firma RSA en base64, en una línea. */
  readonly signatureValue: string
}

/**
 * EN: Builds `SignedInfo`. `expandTags` renders empty elements as `<X></X>` (the canonical form that is signed);
 * `includeXsi` adds `xmlns:xsi`, which the canonical form inherits from the root anyway.
 * ES: Arma `SignedInfo`. `expandTags` escribe los elementos vacíos como `<X></X>` (la forma canónica que se firma);
 * `includeXsi` agrega `xmlns:xsi`, que la forma canónica hereda del raíz de todos modos.
 */
export const buildSignedInfo = (
  referenceId: string,
  digestValue: string,
  options: { readonly expandTags?: boolean; readonly includeXsi?: boolean } = {},
): string => {
  const uri = referenceId.startsWith('#') ? referenceId : `#${referenceId}`
  const xsi = (options.includeXsi ?? true) ? ` xmlns:xsi="${XSI_NS}"` : ''
  const empty = (tag: string, algorithm: string): string =>
    options.expandTags ? `<${tag} Algorithm="${algorithm}"></${tag}>` : `<${tag} Algorithm="${algorithm}"/>`
  return (
    `<SignedInfo xmlns="${XMLDSIG_NS}"${xsi}>` +
    empty('CanonicalizationMethod', C14N_ALGORITHM) +
    empty('SignatureMethod', RSA_SHA1_ALGORITHM) +
    `<Reference URI="${uri}"><Transforms>${empty('Transform', ENVELOPED_SIGNATURE)}</Transforms>${empty('DigestMethod', SHA1_ALGORITHM)}<DigestValue>${digestValue}</DigestValue></Reference>` +
    '</SignedInfo>'
  )
}

/**
 * EN: Builds the `Signature` element from a stored `SignedInfo`, the wrapped signature and the key material.
 * ES: Arma el elemento `Signature` a partir del `SignedInfo` guardado, la firma recortada y el material de clave.
 */
export const buildSignatureXml = (
  signedInfo: string,
  signatureValue: string,
  keyInfo: { readonly modulus: string; readonly exponent: string; readonly certificate: string },
): string =>
  `<Signature xmlns="${XMLDSIG_NS}">${signedInfo}<SignatureValue>${signatureValue}</SignatureValue><KeyInfo><KeyValue><RSAKeyValue><Modulus>${keyInfo.modulus}</Modulus><Exponent>${keyInfo.exponent}</Exponent></RSAKeyValue></KeyValue><X509Data><X509Certificate>${keyInfo.certificate}</X509Certificate></X509Data></KeyInfo></Signature>`

/**
 * EN: Input of `signEnveloped`.
 * ES: Entrada de `signEnveloped`.
 */
export type SignEnvelopedInput = {
  /** EN: Unsigned XML. ES: XML sin firma. */
  readonly xml: string
  /** EN: Tag of the element with the `ID` to sign (`Documento`, `SetDTE`, `EnvioLibro`…). ES: Etiqueta del elemento con `ID` a firmar. */
  readonly elementTag: string
  /** EN: Root tag whose closing tag follows the signed element (`DTE`, `EnvioDTE`…). ES: Etiqueta raíz cuyo cierre sigue al elemento firmado. */
  readonly rootTag: string
  /** EN: Signing certificate. ES: Certificado firmante. */
  readonly certificate: Pick<Certificate, 'privateKeyPem' | 'publicKey' | 'certificateBase64'>
  /** EN: Write `xmlns:xsi` in the stored `SignedInfo` (default true; false for the DTE). ES: Escribir `xmlns:xsi` en el `SignedInfo` guardado (por defecto true; false en el DTE). */
  readonly includeXsiInStoredSignedInfo?: boolean
}

/**
 * EN: Signs `elementTag` with an enveloped XMLDSig signature (C14N 1.0, RSA-SHA1) and returns the XML with the
 * `Signature` inserted right before `</rootTag>`.
 * ES: Firma `elementTag` con una firma XMLDSig envuelta (C14N 1.0, RSA-SHA1) y devuelve el XML con la `Signature`
 * insertada justo antes de `</rootTag>`.
 * @throws {DteError} EN: `XML_PARSE_FAILED` when the element, its `ID` or the adjacent closing tags are missing. ES: `XML_PARSE_FAILED` si faltan el elemento, su `ID` o los cierres adyacentes.
 */
export const signEnveloped = ({
  xml,
  elementTag,
  rootTag,
  certificate,
  includeXsiInStoredSignedInfo = true,
}: SignEnvelopedInput): { readonly xml: string; readonly signature: XmlSignature } => {
  const element = findElement(parseXmlDom(xml), elementTag)
  const id = element.getAttribute('ID')
  if (!id) throw new DteError('XML_PARSE_FAILED', { field: elementTag, reason: 'missing ID attribute' })
  const closing = `</${elementTag}></${rootTag}>`
  if (!xml.includes(closing)) throw new DteError('XML_PARSE_FAILED', { field: rootTag, reason: `expected ${closing}` })
  const digestValue = sha1Base64(canonicalizeElement(element), 'utf8')
  const signedInfoToSign = buildSignedInfo(id, digestValue, { expandTags: true, includeXsi: true })
  const signedInfoToStore = buildSignedInfo(id, digestValue, {
    expandTags: false,
    includeXsi: includeXsiInStoredSignedInfo,
  })
  const signatureValue = rsaSha1SignBase64(certificate.privateKeyPem, signedInfoToSign, 'utf8')
  const signatureXml = buildSignatureXml(signedInfoToStore, wrapBase64(signatureValue), {
    modulus: wrapBase64(certificate.publicKey.modulus),
    exponent: certificate.publicKey.exponent,
    certificate: wrapBase64(certificate.certificateBase64),
  })
  return {
    // A replacer function keeps `$`-patterns in the inserted content literal.
    xml: xml.replace(closing, () => `</${elementTag}>${signatureXml}</${rootTag}>`),
    signature: { digestValue, signatureValue },
  }
}

/**
 * EN: Outcome of verifying an enveloped signature. `valid` proves that the referenced element and `SignedInfo` are
 * intact with respect to the certificate embedded in `KeyInfo`; whether that certificate belongs to the expected
 * signer is a separate check.
 * ES: Resultado de verificar una firma envuelta. `valid` prueba que el elemento referenciado y `SignedInfo` están
 * íntegros respecto del certificado embebido en `KeyInfo`; que ese certificado sea del firmante esperado es otro chequeo.
 */
export type SignatureVerification = {
  /** EN: `Reference/@URI` without `#`, or null when the signature carries no reference. ES: `Reference/@URI` sin `#`, o null si la firma no trae referencia. */
  readonly referenceId: string | null
  /** EN: The referenced element is unique, sits next to `Signature` under the root, has the expected tag and still hashes to `DigestValue`. ES: El elemento referenciado es único, está junto a `Signature` bajo el raíz, tiene la etiqueta esperada y sigue produciendo el `DigestValue`. */
  readonly digestValid: boolean
  /** EN: `SignatureValue` verifies with the embedded certificate. ES: `SignatureValue` verifica con el certificado embebido. */
  readonly signatureValid: boolean
  /** EN: Both checks passed. ES: Pasaron ambos chequeos. */
  readonly valid: boolean
}

const elementChildren = (parent: Element): readonly Element[] =>
  Array.from(parent.childNodes).filter((node): node is Element => node.nodeType === 1)

const firstChildElement = (parent: Element, tag: string): Element | undefined =>
  elementChildren(parent).find((child) => child.tagName === tag)

const descendantsAndSelf = (element: Element): readonly Element[] => [
  element,
  ...elementChildren(element).flatMap(descendantsAndSelf),
]

const textOf = (parent: Element, tag: string): string | null => parent.getElementsByTagName(tag)[0]?.textContent ?? null

/**
 * EN: Locates the element a `Reference` points to, resisting signature wrapping: the `ID` must be unique in the whole
 * document and the element must be a direct child of the root (a sibling of `Signature`) with tag `elementTag`.
 * ES: Ubica el elemento al que apunta una `Reference`, resistiendo el *signature wrapping*: el `ID` debe ser único en
 * todo el documento y el elemento debe ser hijo directo del raíz (hermano de `Signature`) con etiqueta `elementTag`.
 */
const referencedElement = (root: Element, referenceId: string | null, elementTag: string): Element | null => {
  if (referenceId === null || referenceId === '') return null
  const matches = descendantsAndSelf(root).filter((element) => element.getAttribute('ID') === referenceId)
  const element = matches.length === 1 ? matches[0] : undefined
  if (element === undefined || element.parentNode !== root || element.tagName !== elementTag) return null
  return element
}

/**
 * EN: Verifies the enveloped signature that is a direct child of `rootTag`: locates the signed element by the `ID`
 * named in `Reference/@URI` (see `referencedElement`), recomputes its digest and checks `SignatureValue` with the
 * `X509Certificate` carried in `KeyInfo`. A reference that is missing, ambiguous, misplaced or not an `elementTag`
 * yields `digestValid: false` instead of throwing, so wrapped or duplicated elements never verify.
 * ES: Verifica la firma envuelta que es hija directa de `rootTag`: ubica el elemento firmado por el `ID` que nombra
 * `Reference/@URI` (ver `referencedElement`), recalcula su digest y comprueba `SignatureValue` con el
 * `X509Certificate` que viene en `KeyInfo`. Una referencia ausente, ambigua, mal ubicada o que no es un `elementTag`
 * da `digestValid: false` en vez de lanzar, así que un elemento envuelto o duplicado nunca verifica.
 * @throws {DteError} EN: `XML_PARSE_FAILED` (malformed XML or wrong root), `SIGNATURE_NOT_FOUND` (no `Signature` under the root or no `SignedInfo` in it). ES: `XML_PARSE_FAILED` (XML malformado o raíz incorrecta), `SIGNATURE_NOT_FOUND` (sin `Signature` bajo el raíz o sin `SignedInfo` dentro).
 */
export const verifyEnveloped = (
  xml: string,
  target: { readonly elementTag: string; readonly rootTag: string },
): SignatureVerification => {
  const dom = parseXmlDom(xml)
  const root = dom.documentElement
  if (root.tagName !== target.rootTag)
    throw new DteError('XML_PARSE_FAILED', { field: target.rootTag, reason: `root is ${root.tagName}` })
  const signature = firstChildElement(root, 'Signature')
  if (signature === undefined) throw new DteError('SIGNATURE_NOT_FOUND', { field: target.rootTag })
  const signedInfo = firstChildElement(signature, 'SignedInfo')
  if (signedInfo === undefined) throw new DteError('SIGNATURE_NOT_FOUND', { field: 'SignedInfo' })
  const storedDigest = (textOf(signedInfo, 'DigestValue') ?? '').replace(/\s+/g, '')
  const signatureValue = (textOf(signature, 'SignatureValue') ?? '').replace(/\s+/g, '')
  const certificateBase64 = (textOf(signature, 'X509Certificate') ?? '').replace(/\s+/g, '')
  const referenceUri = firstChildElement(signedInfo, 'Reference')?.getAttribute('URI')
  const referenceId = referenceUri ? referenceUri.replace(/^#/, '') : null
  const element = referencedElement(root, referenceId, target.elementTag)
  const digestValid = element !== null && sha1Base64(canonicalizeElement(element), 'utf8') === storedDigest
  const certificatePem = `-----BEGIN CERTIFICATE-----\n${wrapBase64(certificateBase64)}\n-----END CERTIFICATE-----\n`
  const publicKey = (() => {
    try {
      return rsaPublicKeyPartsFromCertificatePem(certificatePem)
    } catch {
      return null
    }
  })()
  const signatureValid =
    publicKey !== null && rsaSha1VerifyBase64(publicKey, canonicalizeElement(signedInfo), 'utf8', signatureValue)
  return { referenceId, digestValid, signatureValid, valid: digestValid && signatureValid }
}
