import {
  cafEnvironment,
  checkCafBlock,
  readCaf,
  SII_CAF_KEYS,
  type CafBlock,
  type SiiCafKeys,
  type VerificationStatus,
} from '../caf/sii-signature'
import { rsaSha1VerifyBase64 } from '../crypto/rsa'
import type { Environment } from '../catalogs/codes'
import { DteError } from '../errors'
import { toSiiRut } from '../model/rut'
import { verifyEnveloped, type SignatureVerification } from '../signature/xmldsig'
import {
  child,
  childElements,
  declarationsOf,
  descendants,
  integer,
  isPlain,
  named,
  signedForms,
  textAt,
  writeXml,
} from '../xml/elements'
import { parseXmlDom } from '../xml/parse'

const SII_NS = 'http://www.sii.cl/SiiDte'
const ROOTS = ['DTE', 'EnvioDTE', 'EnvioBOLETA'] as const
const SIGNED_ELEMENTS = ['Documento', 'Liquidacion']

/**
 * EN: Options of `verifyReceivedDocuments`.
 * ES: Opciones de `verifyReceivedDocuments`.
 */
export type VerifyReceivedDocumentsOptions = {
  /** EN: The environment whose CAFs are accepted, `production` by default: a CAF signed with the other environment's SII key (100 in certification, 300 in production) is `invalid`, with the mismatch `environment`. ES: El ambiente cuyos CAF se aceptan, `production` por defecto: un CAF firmado con la llave del SII del otro ambiente (100 en certificación, 300 en producción) es `invalid`, con la diferencia `environment`. */
  readonly environment?: Environment
  /** EN: The SII keys that verify each CAF's `FRMA`, by `IDK`, in place of `SII_CAF_KEYS` (spread it to add one). ES: Las llaves del SII que verifican la `FRMA` de cada CAF, por `IDK`, en lugar de `SII_CAF_KEYS` (para agregar una, expándela). */
  readonly siiKeys?: SiiCafKeys
}

/**
 * EN: An XMLDSig signature, checked. `valid` proves the signed element is intact with respect to the certificate in
 * `KeyInfo`; whether that certificate is the issuer's is not checked.
 * ES: Una firma XMLDSig, chequeada. `valid` prueba que el elemento firmado está íntegro respecto del certificado de
 * `KeyInfo`; que ese certificado sea del emisor no se chequea.
 */
export type ReceivedSignatureCheck = SignatureVerification & {
  /** EN: A `Signature` with a `SignedInfo` sits under the root; when false every other field is false or null. ES: Hay una `Signature` con `SignedInfo` bajo el raíz; si es false, los demás campos son false o null. */
  readonly found: boolean
}

/**
 * EN: A field of the TED's `DD` compared with the document's header.
 * ES: Un campo del `DD` del TED comparado con el encabezado del documento: `issuerRut` (`RE`/`RUTEmisor`),
 * `documentType` (`TD`/`TipoDTE`), `folio` (`F`/`Folio`), `issueDate` (`FE`/`FchEmis`), `receiverRut`
 * (`RR`/`RUTRecep`), `totalAmount` (`MNT`/`MntTotal`).
 */
export type TedMismatch = 'issuerRut' | 'documentType' | 'folio' | 'issueDate' | 'receiverRut' | 'totalAmount'

/**
 * EN: The electronic stamp, checked.
 * ES: `TED` — El timbre electrónico, chequeado.
 */
export type ReceivedTedCheck = {
  /** EN: One `TED` in the document, by local name, sits in the signed element, is plain (no prefix, no namespace declaration, no comment, CDATA or instruction) and holds exactly a `DD` and then an `FRMT`, with no other `DD` or `FRMT` inside. ES: Hay un solo `TED` en el documento, por nombre local, está en el elemento firmado, es simple (sin prefijos, sin declaraciones de namespace, sin comentarios, CDATA ni instrucciones) y tiene exactamente un `DD` y luego una `FRMT`, sin otro `DD` ni `FRMT` dentro. */
  readonly found: boolean
  /** EN: `FRMT` verifies with the `RSAPK` of the CAF the TED carries, over the `DD` written from its element as ISO-8859-1 bytes: flattened, its texts escaped the SII's way or with only `&`, `<` and `>` escaped. ES: `FRMT` verifica con la `RSAPK` del CAF que trae el TED, sobre el `DD` escrito desde su elemento en bytes ISO-8859-1: aplanado, con sus textos escapados a la manera del SII o con solo `&`, `<` y `>` escapados. */
  readonly signatureValid: boolean
  /** EN: The `DD` fields that differ from the header, or that one of the two lacks. `RSR` and `IT1` are free text each issuer folds and cuts its own way, and are not compared. ES: Los campos del `DD` que difieren del encabezado, o que falta en uno de los dos. `RSR` e `IT1` son texto libre que cada emisor pliega y corta a su manera, y no se comparan. */
  readonly mismatches: readonly TedMismatch[]
  /** EN: Found, its signature verifies and nothing differs. ES: Encontrado, su firma verifica y nada difiere. */
  readonly valid: boolean
}

/**
 * EN: A field of the document the CAF must cover.
 * ES: Un campo del documento que el CAF debe cubrir: `issuerRut` (`RE` frente a `RUTEmisor`), `documentType` (`TD`
 * frente a `TipoDTE`), `folio` (`Folio` dentro de `RNG`).
 */
export type CafMismatch = 'issuerRut' | 'documentType' | 'folio' | 'environment'

/**
 * EN: The CAF the TED carries, checked against the document and against the SII's signature.
 * ES: `TED/DD/CAF` — El CAF que trae el TED, chequeado contra el documento y contra la firma del SII.
 */
export type ReceivedCafCheck = {
  /** EN: The stamp was found and its `DD` holds one `CAF`, `DA` and `FRMA` by local name, the `CAF` a direct child of the `DD` with the other two as its direct children, and the `DA` has `RE`, `TD`, `RNG`, `RSAPK` and `IDK`; when false every other field is null or empty and the status is `invalid`. ES: Se encontró el timbre y su `DD` tiene un solo `CAF`, `DA` y `FRMA` por nombre local, el `CAF` hijo directo del `DD` con los otros dos como hijos directos suyos, y el `DA` tiene `RE`, `TD`, `RNG`, `RSAPK` e `IDK`; si es false, los demás campos son null o vacíos y el estado es `invalid`. */
  readonly found: boolean
  /** EN: Id of the SII key that signed it; 100 marks certification and 300 production. ES: `DA/IDK` — Id de la llave del SII que lo firmó; 100 marca certificación y 300 producción. */
  readonly keyId: number | null
  /** EN: The environment of that SII key: `certification` for 100, `production` for 300, null for another. ES: El ambiente de esa llave del SII: `certification` para 100, `production` para 300, null para otra. */
  readonly environment: Environment | null
  /** EN: The issuer the CAF authorizes, as written. ES: `DA/RE` — El emisor que autoriza el CAF, tal como viene. */
  readonly issuerRut: string | null
  /** EN: The type the CAF authorizes. ES: `DA/TD` — El tipo que autoriza el CAF. */
  readonly documentType: number | null
  /** EN: The folios the CAF authorizes, inclusive. ES: `DA/RNG` — Los folios que autoriza el CAF, inclusivo. */
  readonly range: { readonly from: number; readonly to: number } | null
  /** EN: Authorization date as written, `YYYY-MM-DD` in the SII's CAFs. ES: `DA/FA` — Fecha de autorización tal como viene, `AAAA-MM-DD` en los CAF del SII. */
  readonly authorizationDate: string | null
  /** EN: What the CAF does not cover of the document: another issuer, another type, a folio outside its range. ES: Lo que el CAF no cubre del documento: otro emisor, otro tipo, un folio fuera de su rango. */
  readonly mismatches: readonly CafMismatch[]
  /** EN: The SII's signature over `DA` (`FRMA`): `unchecked` when no SII key is known for `keyId`. ES: La firma del SII sobre `DA` (`FRMA`): `unchecked` si no se conoce la llave del SII para `keyId`. */
  readonly siiSignature: VerificationStatus
  /** EN: `invalid` when not found, a mismatch or an `FRMA` that fails; `unchecked` when only the `FRMA` could not be checked. ES: `invalid` si no se encontró, hay una diferencia o la `FRMA` falla; `unchecked` si solo la `FRMA` no se pudo chequear. */
  readonly status: VerificationStatus
}

/**
 * EN: One received document with its checks. The header fields are null when absent, and the numbers when they are not
 * whole numbers.
 * ES: Un documento recibido con sus chequeos. Los campos del encabezado son null si faltan, y los números si no son
 * enteros.
 */
export type ReceivedDocument = {
  /** EN: The `<DTE>` written from its element (`writeXml`): the elements, attributes, own namespace declarations, text, comments and instructions of the input, which read back and verify the same, but not the input byte for byte (a CDATA section becomes escaped text, a character reference the character, an empty element `<X/>`); the namespaces it inherits from the envelope are not added. ES: El `<DTE>` escrito desde su elemento (`writeXml`): los elementos, atributos, declaraciones de namespace propias, texto, comentarios e instrucciones de la entrada, que se leen y verifican igual, pero no la entrada byte a byte (una sección CDATA pasa a texto escapado, una referencia de carácter al carácter, un elemento vacío a `<X/>`); no se agregan los namespaces que hereda del sobre. */
  readonly xml: string
  /** EN: `ID` of the signed element. ES: `Documento/@ID` (o `Liquidacion/@ID`) — `ID` del elemento firmado. */
  readonly id: string | null
  /** EN: Document type, any SII code. ES: `TipoDTE` — Tipo de documento, cualquier código del SII. */
  readonly type: number | null
  /** EN: Folio. ES: `Folio`. */
  readonly folio: number | null
  /** EN: Issue date as written. ES: `FchEmis` — Fecha de emisión tal como viene. */
  readonly issueDate: string | null
  /** EN: Issuer RUT as written. ES: `RUTEmisor` — RUT del emisor tal como viene. */
  readonly issuerRut: string | null
  /** EN: Receiver RUT as written. ES: `RUTRecep` — RUT del receptor tal como viene. */
  readonly receiverRut: string | null
  /** EN: Total amount. ES: `MntTotal` — Monto total. */
  readonly totalAmount: number | null
  /** EN: The document's XMLDSig signature over its signed element. ES: La firma XMLDSig del documento sobre su elemento firmado. */
  readonly signature: ReceivedSignatureCheck
  /** EN: The electronic stamp. ES: `TED` — El timbre electrónico. */
  readonly ted: ReceivedTedCheck
  /** EN: The CAF the stamp carries. ES: `TED/DD/CAF` — El CAF que trae el timbre. */
  readonly caf: ReceivedCafCheck
  /** EN: `invalid` when a check fails; `unchecked` when none fails but the CAF's `FRMA` could not be checked; `valid` otherwise. ES: `invalid` si falla un chequeo; `unchecked` si ninguno falla pero la `FRMA` del CAF no se pudo chequear; `valid` en otro caso. */
  readonly status: VerificationStatus
}

/**
 * EN: Result of `verifyReceivedDocuments`.
 * ES: Resultado de `verifyReceivedDocuments`.
 */
export type ReceivedDocumentsVerification = {
  /** EN: Root of the input: one document or an envelope. ES: Raíz de la entrada: un documento o un sobre. */
  readonly root: 'DTE' | 'EnvioDTE' | 'EnvioBOLETA'
  /** EN: The envelope's own signature over `SetDTE`; null for a single `DTE`. ES: La firma del propio sobre sobre `SetDTE`; null para un `DTE` solo. */
  readonly envelope: ReceivedSignatureCheck | null
  /** EN: Every document, in the order of the input. ES: Cada documento, en el orden de la entrada. */
  readonly documents: readonly ReceivedDocument[]
  /** EN: The worst of the envelope and the documents. ES: El peor estado entre el sobre y los documentos. */
  readonly status: VerificationStatus
}

const NOT_FOUND: ReceivedSignatureCheck = {
  found: false,
  referenceId: null,
  digestValid: false,
  signatureValid: false,
  valid: false,
}

const rutKey = (rut: string): string => {
  try {
    return toSiiRut(rut)
  } catch {
    return rut.toUpperCase()
  }
}

const sameRut = (a: string | null, b: string | null): boolean => a !== null && b !== null && rutKey(a) === rutKey(b)

const worst = (statuses: readonly VerificationStatus[]): VerificationStatus =>
  statuses.includes('invalid') ? 'invalid' : statuses.includes('unchecked') ? 'unchecked' : 'valid'

const passed = (valid: boolean): VerificationStatus => (valid ? 'valid' : 'invalid')

// The namespace declarations in scope at an element from its ancestors, the nearest winning.
const inheritedDeclarations = (element: Element): ReadonlyMap<string, string> => {
  const ancestors: Element[] = []
  for (let node = element.parentNode; node !== null && node.nodeType === 1; node = node.parentNode) {
    ancestors.unshift(node as Element)
  }
  return new Map(ancestors.flatMap(declarationsOf))
}

/**
 * EN: The forms a document's signature may cover, in the order they are tried, each written from its element
 * (`writeXml`): where it sits (every namespace it inherits), on its own with the SII namespace (as it is signed before
 * it goes into an envelope), and on its own as written (the example the SII publishes is signed with no namespace at
 * all). They differ only in the namespaces declared at the root, which carry no content.
 * ES: Las formas que puede cubrir la firma de un documento, en el orden en que se prueban, cada una escrita desde su
 * elemento (`writeXml`): donde está (todos los namespaces que hereda), solo con el namespace del SII (como se firma antes de ir en un sobre) y solo tal como viene
 * (el ejemplo que publica el SII está firmado sin namespace alguno). Difieren solo en los namespaces declarados en el
 * raíz, que no llevan contenido.
 */
const namespaceForms = (element: Element): readonly string[] => {
  const own = new Map(declarationsOf(element))
  const asWritten = writeXml(element)
  const inPlace = writeXml(
    element,
    Array.from(inheritedDeclarations(element)).filter(([name]) => !own.has(name)),
  )
  const alone = own.has('xmlns') ? asWritten : writeXml(element, [['xmlns', SII_NS]])
  return [...new Set([inPlace, alone, asWritten])]
}

const hasSignature = (root: Element): boolean => child(child(root, 'Signature'), 'SignedInfo') !== undefined

// The result where the document sits, unless the document verifies in one of the other forms.
const checkSignature = (root: Element, forms: readonly string[], elementTag: string): ReceivedSignatureCheck => {
  if (!hasSignature(root)) return NOT_FOUND
  const [first, ...others] = forms
  const inPlace = verifyEnveloped(first, { elementTag, rootTag: 'DTE' })
  if (inPlace.valid) return { found: true, ...inPlace }
  const alone = others.map((form) => verifyEnveloped(form, { elementTag, rootTag: 'DTE' })).find((r) => r.valid)
  return { found: true, ...(alone ?? inPlace) }
}

type Header = {
  readonly type: number | null
  readonly folio: number | null
  readonly issueDate: string | null
  readonly issuerRut: string | null
  readonly receiverRut: string | null
  readonly totalAmount: number | null
}

const readHeader = (signed: Element): Header => {
  const header = child(signed, 'Encabezado')
  return {
    type: integer(textAt(header, 'IdDoc', 'TipoDTE')),
    folio: integer(textAt(header, 'IdDoc', 'Folio')),
    issueDate: textAt(header, 'IdDoc', 'FchEmis'),
    issuerRut: textAt(header, 'Emisor', 'RUTEmisor'),
    receiverRut: textAt(header, 'Receptor', 'RUTRecep'),
    totalAmount: integer(textAt(header, 'Totales', 'MntTotal')),
  }
}

const NO_TED: ReceivedTedCheck = { found: false, signatureValid: false, mismatches: [], valid: false }
const NO_CAF: ReceivedCafCheck = {
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
}

const tedMismatches = (dd: Element, header: Header): readonly TedMismatch[] => {
  const differs: Readonly<Record<TedMismatch, boolean>> = {
    issuerRut: !sameRut(textAt(dd, 'RE'), header.issuerRut),
    documentType: header.type === null || integer(textAt(dd, 'TD')) !== header.type,
    folio: header.folio === null || integer(textAt(dd, 'F')) !== header.folio,
    issueDate: header.issueDate === null || textAt(dd, 'FE') !== header.issueDate,
    receiverRut: !sameRut(textAt(dd, 'RR'), header.receiverRut),
    totalAmount: header.totalAmount === null || integer(textAt(dd, 'MNT')) !== header.totalAmount,
  }
  return (Object.keys(differs) as TedMismatch[]).filter((field) => differs[field])
}

// The SII keys that may verify a CAF's FRMA, and the environment whose CAFs are accepted.
type StampRules = { readonly keys: SiiCafKeys; readonly environment: Environment }

const checkCaf = (block: CafBlock, header: Header, rules: StampRules): ReceivedCafCheck => {
  const { da } = block
  const issuerRut = textAt(da, 'RE')
  const documentType = integer(textAt(da, 'TD'))
  const from = integer(textAt(da, 'RNG', 'D'))
  const to = integer(textAt(da, 'RNG', 'H'))
  const hasKey = textAt(da, 'RSAPK', 'M') !== null && textAt(da, 'RSAPK', 'E') !== null
  if (issuerRut === null || documentType === null || from === null || to === null || !hasKey) return NO_CAF
  const environment = cafEnvironment(block.keyId)
  const differs: Readonly<Record<CafMismatch, boolean>> = {
    issuerRut: !sameRut(issuerRut, header.issuerRut),
    documentType: documentType !== header.type,
    folio: header.folio === null || header.folio < from || header.folio > to,
    environment: environment !== null && environment !== rules.environment,
  }
  const mismatches = (Object.keys(differs) as CafMismatch[]).filter((field) => differs[field])
  const siiSignature = checkCafBlock(block, rules.keys)
  return {
    found: true,
    keyId: block.keyId,
    environment,
    issuerRut,
    documentType,
    range: { from, to },
    authorizationDate: textAt(da, 'FA'),
    mismatches,
    siiSignature,
    status: mismatches.length > 0 ? 'invalid' : siiSignature,
  }
}

const NO_STAMP = { ted: NO_TED, caf: NO_CAF } as const

// The DD, the FRMT's value and nothing else: the TED holds a DD and then an FRMT, and no other DD or FRMT inside.
const stampParts = (ted: Element): { readonly dd: Element; readonly signature: string } | undefined => {
  const [dd, frmt, ...others] = childElements(ted)
  const inside = descendants(ted)
  const signature = String(frmt?.textContent).replace(/\s+/g, '')
  return dd?.tagName === 'DD' &&
    frmt?.tagName === 'FRMT' &&
    others.length === 0 &&
    named(inside, 'DD').length === 1 &&
    named(inside, 'FRMT').length === 1 &&
    signature !== ''
    ? { dd, signature }
    : undefined
}

/**
 * EN: Checks the stamp and its CAF from their elements alone: the signed bytes are written from the `DD` and the `DA`
 * whose fields are read (`signedForms`), never searched for in the text. A stamp is read only when its structure leaves
 * no doubt: one `TED` in the document by local name, a direct child of the signed element, plain (`isPlain`: no
 * prefix, no namespace declaration, no comment, CDATA or instruction), holding a `DD` and then an `FRMT` and nothing
 * else. Its CAF is read as `readCaf` reads it inside the `DD`; otherwise there is no CAF and no key to verify the
 * `FRMT` with.
 * ES: Chequea el timbre y su CAF solo desde sus elementos: los bytes firmados se escriben desde el `DD` y el `DA` cuyos
 * campos se leen (`signedForms`), nunca se buscan en el texto. Un timbre se lee solo cuando su estructura no deja dudas:
 * un `TED` en el documento por nombre local, hijo directo del elemento firmado, simple (`isPlain`: sin prefijos, sin
 * declaraciones de namespace, sin comentarios, CDATA ni instrucciones), con un `DD` y luego una `FRMT` y nada más. Su
 * CAF se lee como lo lee `readCaf` dentro del `DD`; si no, no hay CAF ni llave con que verificar la `FRMT`.
 */
const checkStamp = (
  root: Element,
  signed: Element,
  header: Header,
  rules: StampRules,
): { readonly ted: ReceivedTedCheck; readonly caf: ReceivedCafCheck } => {
  const teds = named(descendants(root), 'TED')
  const parts = teds.length === 1 && teds[0].parentNode === signed && isPlain(teds[0]) ? stampParts(teds[0]) : undefined
  if (parts === undefined) return NO_STAMP
  const block = readCaf(parts.dd)
  const key = { modulus: textAt(block?.da, 'RSAPK', 'M') ?? '', exponent: textAt(block?.da, 'RSAPK', 'E') ?? '' }
  const signatureValid = signedForms(parts.dd).some((data) => rsaSha1VerifyBase64(key, data, 'latin1', parts.signature))
  const mismatches = tedMismatches(parts.dd, header)
  return {
    ted: { found: true, signatureValid, mismatches, valid: signatureValid && mismatches.length === 0 },
    caf: block === null ? NO_CAF : checkCaf(block, header, rules),
  }
}

// Everything is read from the element itself: the signature is checked over forms written from it, and the header and
// the stamp are read from it, so what is checked and what is reported are the same node.
const verifyDocument = (element: Element, index: number, rules: StampRules): ReceivedDocument => {
  const forms = namespaceForms(element)
  const signedElements = childElements(element).filter((node) => SIGNED_ELEMENTS.includes(node.localName))
  if (signedElements.length !== 1 || signedElements[0].tagName !== signedElements[0].localName)
    throw new DteError('XML_PARSE_FAILED', {
      field: 'Documento',
      index,
      reason: 'expected one Documento or Liquidacion',
    })
  const signed = signedElements[0]
  const header = readHeader(signed)
  const signature = checkSignature(element, forms, signed.tagName)
  const { ted, caf } = checkStamp(element, signed, header, rules)
  return {
    xml: writeXml(element),
    id: signed.getAttribute('ID') || null,
    ...header,
    signature,
    ted,
    caf,
    status: worst([passed(signature.valid), passed(ted.valid), caf.status]),
  }
}

const checkEnvelope = (xml: string, root: Element): ReceivedSignatureCheck =>
  hasSignature(root)
    ? { found: true, ...verifyEnveloped(xml, { elementTag: 'SetDTE', rootTag: root.tagName }) }
    : NOT_FOUND

/**
 * EN: Verifies the documents of a `DTE`, `EnvioDTE` or `EnvioBOLETA` as received from a supplier, and the envelope's
 * own signature. Each document is read from its element in the parsed input, never from a cut of the text: its
 * signature is checked over forms written from that element, and its fields and stamp are read from it. It is
 * checked for: its XMLDSig signature; its TED, whose `FRMT` must verify with the key of the CAF the TED carries and
 * whose `DD` must agree with the header; that CAF against the document (the issuer, the type, the folio inside the
 * range); and the SII's signature over the CAF (`FRMA`) with the SII key of its `IDK` (`SII_CAF_KEYS`, or
 * `siiKeys`), for the CAFs of `environment` only (production by default). A document that fails a check is a result,
 * not an error; a CAF whose `IDK` has no known key leaves the document `unchecked`. Pure: no clock, no network. Not
 * checked: who owns the signing certificate, and whether the CAF had expired.
 * ES: Verifica los documentos de un `DTE`, `EnvioDTE` o `EnvioBOLETA` tal como llega de un proveedor, y la firma del
 * propio sobre. Cada documento se lee desde su elemento en la entrada parseada, nunca de un trozo del texto: su
 * firma se chequea sobre formas escritas desde ese elemento, y sus campos y su timbre se leen de él. Se chequea: su
 * firma XMLDSig; su TED, cuya `FRMT` debe verificar con la llave del CAF que trae el TED y cuyo `DD` debe coincidir
 * con el encabezado; ese CAF contra el documento (el emisor, el tipo, el folio dentro del rango); y la firma del SII
 * sobre el CAF (`FRMA`) con la llave del SII de su `IDK` (`SII_CAF_KEYS`, o `siiKeys`), solo para los CAF de
 * `environment` (producción por defecto). Un documento que falla un chequeo es un resultado, no un error; un CAF
 * cuyo `IDK` no tiene llave conocida deja el documento `unchecked`. Pura: sin reloj ni red. No se chequea: de quién
 * es el certificado que firma, ni si el CAF estaba vencido.
 * @throws {DteError} EN: `XML_PARSE_FAILED` for empty or malformed XML, a DOCTYPE, another root, an envelope without exactly one `SetDTE`, a `DTE` out of place or prefixed, or a `DTE` without one unprefixed `Documento` or `Liquidacion`; `ENVELOPE_EMPTY` for an envelope without documents. ES: `XML_PARSE_FAILED` para XML vacío o malformado, un DOCTYPE, otro raíz, un sobre sin exactamente un `SetDTE`, un `DTE` fuera de lugar o con prefijo, o un `DTE` sin un `Documento` o `Liquidacion` sin prefijo; `ENVELOPE_EMPTY` para un sobre sin documentos.
 */
export const verifyReceivedDocuments = (
  xml: string,
  options: VerifyReceivedDocumentsOptions = {},
): ReceivedDocumentsVerification => {
  if (typeof xml !== 'string' || xml.trim() === '') throw new DteError('XML_PARSE_FAILED', { reason: 'empty' })
  // The parsers read a DOCTYPE differently (xmldom takes markup in an entity for elements), so none is read.
  if (/<!DOCTYPE/i.test(xml))
    throw new DteError('XML_PARSE_FAILED', { field: 'DOCTYPE', reason: 'a DOCTYPE is not read' })
  const dom = parseXmlDom(xml)
  const root = dom.documentElement
  const rootTag = ROOTS.find((tag) => tag === root.tagName)
  if (rootTag === undefined)
    throw new DteError('XML_PARSE_FAILED', {
      field: 'root',
      root: root.tagName,
      reason: 'expected DTE, EnvioDTE or EnvioBOLETA',
    })
  // One SetDTE, so the one the envelope's signature covers is the one whose documents are read.
  const sets = rootTag === 'DTE' ? [] : childElements(root).filter((element) => element.tagName === 'SetDTE')
  if (rootTag !== 'DTE' && sets.length !== 1)
    throw new DteError('XML_PARSE_FAILED', { field: 'SetDTE', reason: 'expected one SetDTE' })
  const set = sets[0]
  const placed = set === undefined ? [root] : childElements(set).filter((element) => element.tagName === 'DTE')
  const total = named([root, ...descendants(root)], 'DTE').length
  if (total === 0) throw new DteError('ENVELOPE_EMPTY', { field: 'SetDTE' })
  if (placed.length !== total) throw new DteError('XML_PARSE_FAILED', { field: 'DTE', reason: 'a DTE out of place' })
  const rules = { keys: options.siiKeys ?? SII_CAF_KEYS, environment: options.environment ?? 'production' }
  const documents = placed.map((element, index) => verifyDocument(element, index, rules))
  const envelope = rootTag === 'DTE' ? null : checkEnvelope(xml, root)
  return {
    root: rootTag,
    envelope,
    documents,
    status: worst([...(envelope === null ? [] : [passed(envelope.valid)]), ...documents.map((d) => d.status)]),
  }
}
