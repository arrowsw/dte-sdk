import {
  checkCafBlock,
  readCafBlock,
  signedTextForms,
  SII_CAF_KEYS,
  startTags,
  type CafBlock,
  type SiiCafKeys,
  type VerificationStatus,
} from '../caf/sii-signature'
import { rsaSha1VerifyBase64 } from '../crypto/rsa'
import { DteError } from '../errors'
import { toSiiRut } from '../model/rut'
import { verifyEnveloped, type SignatureVerification } from '../signature/xmldsig'
import { escapeXmlAttribute } from '../xml/escape'
import { parseXmlDom } from '../xml/parse'

const SII_NS = 'http://www.sii.cl/SiiDte'
const ROOTS = ['DTE', 'EnvioDTE', 'EnvioBOLETA'] as const
const SIGNED_ELEMENTS = ['Documento', 'Liquidacion']

/**
 * EN: Options of `verifyReceivedDocuments`.
 * ES: Opciones de `verifyReceivedDocuments`.
 */
export type VerifyReceivedDocumentsOptions = {
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
  /** EN: One `TED` sits in the signed element and holds exactly a `DD` and then an `FRMT`, with no other `DD` or `FRMT` tag and no comment, CDATA or instruction inside. ES: Hay un solo `TED` en el elemento firmado y tiene exactamente un `DD` y luego una `FRMT`, sin otra etiqueta `DD` ni `FRMT` y sin comentarios, CDATA ni instrucciones dentro. */
  readonly found: boolean
  /** EN: `FRMT` verifies with the `RSAPK` of the CAF the TED carries, over the `DD` as ISO-8859-1 bytes: as written, flattened, or with its texts written the SII's way. ES: `FRMT` verifica con la `RSAPK` del CAF que trae el TED, sobre el `DD` en bytes ISO-8859-1: tal como viene, aplanado, o con sus textos escritos a la manera del SII. */
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
export type CafMismatch = 'issuerRut' | 'documentType' | 'folio'

/**
 * EN: The CAF the TED carries, checked against the document and against the SII's signature.
 * ES: `TED/DD/CAF` — El CAF que trae el TED, chequeado contra el documento y contra la firma del SII.
 */
export type ReceivedCafCheck = {
  /** EN: The `DD` holds one `CAF` with one `DA` and one `FRMA` as its direct children, and the `DA` has `RE`, `TD`, `RNG`, `RSAPK` and `IDK`; when false every other field is null or empty and the status is `invalid`. ES: El `DD` tiene un solo `CAF` con un `DA` y una `FRMA` como hijos directos, y el `DA` tiene `RE`, `TD`, `RNG`, `RSAPK` e `IDK`; si es false, los demás campos son null o vacíos y el estado es `invalid`. */
  readonly found: boolean
  /** EN: Id of the SII key that signed it; 100 marks certification and 300 production. ES: `DA/IDK` — Id de la llave del SII que lo firmó; 100 marca certificación y 300 producción. */
  readonly keyId: number | null
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
  /** EN: The `<DTE>…</DTE>` exactly as written in the input, without the namespaces it inherits from the envelope. ES: El `<DTE>…</DTE>` exactamente como viene en la entrada, sin los namespaces que hereda del sobre. */
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

// An element's text in the input: comments, CDATA sections and processing instructions are matched whole and skipped,
// so a tag inside one of them is never taken for an element.
const elementPattern = (tag: string): RegExp =>
  new RegExp(
    `<!--[\\s\\S]*?-->|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>|<\\?[\\s\\S]*?\\?>|<${tag}(?:\\s[^>]*)?(?<!/)>[\\s\\S]*?</${tag}\\s*>`,
    'g',
  )
const DTE_PATTERN = elementPattern('DTE')
const TED_PATTERN = elementPattern('TED')
const elementTexts = (text: string, pattern: RegExp, tag: string): readonly string[] =>
  Array.from(text.matchAll(pattern), (match) => match[0]).filter((match) => match.startsWith(`<${tag}`))

const childElements = (parent: Element): readonly Element[] =>
  Array.from(parent.childNodes).filter((node): node is Element => node.nodeType === 1)

const child = (parent: Element | undefined, tag: string): Element | undefined =>
  parent === undefined ? undefined : childElements(parent).find((element) => element.tagName === tag)

const textAt = (parent: Element | undefined, ...path: readonly string[]): string | null => {
  const element = path.reduce<Element | undefined>(child, parent)
  const text = element?.textContent?.trim()
  return text === undefined || text === '' ? null : text
}

const integer = (text: string | null): number | null => (text !== null && /^\d+$/.test(text) ? Number(text) : null)

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

const declarationsOf = (element: Element): readonly (readonly [string, string])[] =>
  Array.from(element.attributes)
    .filter((attribute) => attribute.name === 'xmlns' || attribute.name.startsWith('xmlns:'))
    .map((attribute) => [attribute.name, attribute.value] as const)

// The namespace declarations in scope at an element from its ancestors, the nearest winning.
const inheritedDeclarations = (element: Element): ReadonlyMap<string, string> => {
  const ancestors: Element[] = []
  for (let node = element.parentNode; node !== null && node.nodeType === 1; node = node.parentNode) {
    ancestors.unshift(node as Element)
  }
  return new Map(ancestors.flatMap(declarationsOf))
}

const withDeclarations = (dte: string, declarations: readonly (readonly [string, string])[]): string =>
  `<DTE${declarations.map(([name, value]) => ` ${name}="${escapeXmlAttribute(value)}"`).join('')}${dte.slice(4)}`

/**
 * EN: The forms a document's signature may cover, in the order they are tried: where it sits (every namespace it
 * inherits), on its own with the SII namespace (as it is signed before it goes into an envelope), and on its own as
 * written (the example the SII publishes is signed with no namespace at all). They differ only in the namespaces
 * declared at the root, which carry no content.
 * ES: Las formas que puede cubrir la firma de un documento, en el orden en que se prueban: donde está (todos los
 * namespaces que hereda), solo con el namespace del SII (como se firma antes de ir en un sobre) y solo tal como viene
 * (el ejemplo que publica el SII está firmado sin namespace alguno). Difieren solo en los namespaces declarados en el
 * raíz, que no llevan contenido.
 */
const signedForms = (dte: string, element: Element): readonly string[] => {
  const own = new Map(declarationsOf(element))
  const inPlace = withDeclarations(
    dte,
    Array.from(inheritedDeclarations(element)).filter(([name]) => !own.has(name)),
  )
  const alone = own.has('xmlns') ? dte : withDeclarations(dte, [['xmlns', SII_NS]])
  return [...new Set([inPlace, alone, dte])]
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

const checkCaf = (da: Element, block: CafBlock, header: Header, keys: SiiCafKeys): ReceivedCafCheck => {
  const issuerRut = textAt(da, 'RE')
  const documentType = integer(textAt(da, 'TD'))
  const from = integer(textAt(da, 'RNG', 'D'))
  const to = integer(textAt(da, 'RNG', 'H'))
  const hasKey = textAt(da, 'RSAPK', 'M') !== null && textAt(da, 'RSAPK', 'E') !== null
  if (issuerRut === null || documentType === null || from === null || to === null || !hasKey) return NO_CAF
  const differs: Readonly<Record<CafMismatch, boolean>> = {
    issuerRut: !sameRut(issuerRut, header.issuerRut),
    documentType: documentType !== header.type,
    folio: header.folio === null || header.folio < from || header.folio > to,
  }
  const mismatches = (Object.keys(differs) as CafMismatch[]).filter((field) => differs[field])
  const siiSignature = checkCafBlock(block, keys)
  return {
    found: true,
    keyId: block.keyId,
    issuerRut,
    documentType,
    range: { from, to },
    authorizationDate: textAt(da, 'FA'),
    mismatches,
    siiSignature,
    status: mismatches.length > 0 ? 'invalid' : siiSignature,
  }
}

const UNREAD_MARKUP = /<!--|<!\[CDATA\[|<\?/
const DD_BLOCK = /<DD(?:\s[^>]*)?>[\s\S]*?<\/DD\s*>/
const NO_STAMP = { ted: NO_TED, caf: NO_CAF } as const

/**
 * EN: Checks the stamp and its CAF, taking every signed text from the element its fields are read from. A stamp is read
 * only when its structure leaves no doubt: one `TED`, a direct child of the signed element, holding a `DD` and then an
 * `FRMT` and nothing else, with no other `DD` or `FRMT` tag and nothing the DOM does not read (comments, CDATA,
 * instructions). Its CAF is read only when the `DD` holds one `CAF`, one `DA` and one `FRMA` tag, the `CAF` a direct
 * child of the `DD` and the other two direct children of the `CAF`; otherwise there is no CAF and no key to verify the
 * `FRMT` with.
 * ES: Chequea el timbre y su CAF, tomando cada texto firmado del elemento del que se leen sus campos. Un timbre se lee
 * solo cuando su estructura no deja dudas: un `TED`, hijo directo del elemento firmado, con un `DD` y luego una `FRMT`
 * y nada más, sin otra etiqueta `DD` ni `FRMT` y sin nada que el DOM no lea (comentarios, CDATA, instrucciones). Su CAF
 * se lee solo cuando el `DD` tiene una etiqueta `CAF`, una `DA` y una `FRMA`, el `CAF` hijo directo del `DD` y las otras
 * dos hijas directas del `CAF`; si no, no hay CAF ni llave con que verificar la `FRMT`.
 */
const checkStamp = (
  dte: string,
  root: Element,
  signed: Element,
  header: Header,
  keys: SiiCafKeys,
): { readonly ted: ReceivedTedCheck; readonly caf: ReceivedCafCheck } => {
  const elements = Array.from(root.getElementsByTagName('TED'))
  const texts = elementTexts(dte, TED_PATTERN, 'TED')
  const tedText = texts.length === 1 && !UNREAD_MARKUP.test(texts[0]) ? texts[0] : ''
  const [dd, frmt, ...others] =
    elements.length === 1 && elements[0].parentNode === signed ? childElements(elements[0]) : []
  const ddText = DD_BLOCK.exec(tedText)?.[0]
  const signature = frmt?.textContent?.replace(/\s+/g, '') ?? ''
  if (
    dd?.tagName !== 'DD' ||
    frmt?.tagName !== 'FRMT' ||
    others.length > 0 ||
    startTags(tedText, 'DD') !== 1 ||
    startTags(tedText, 'FRMT') !== 1 ||
    ddText === undefined ||
    signature === ''
  )
    return NO_STAMP
  const caf = child(dd, 'CAF')
  const da = child(caf, 'DA')
  const block = child(caf, 'FRMA') === undefined ? null : readCafBlock(ddText)
  const keyDa = block === null ? undefined : da
  const key = { modulus: textAt(keyDa, 'RSAPK', 'M') ?? '', exponent: textAt(keyDa, 'RSAPK', 'E') ?? '' }
  const signatureValid = signedTextForms(ddText).some((data) => rsaSha1VerifyBase64(key, data, 'latin1', signature))
  const mismatches = tedMismatches(dd, header)
  return {
    ted: { found: true, signatureValid, mismatches, valid: signatureValid && mismatches.length === 0 },
    caf: block === null || da === undefined ? NO_CAF : checkCaf(da, block, header, keys),
  }
}

const verifyDocument = (dte: string, element: Element, index: number, keys: SiiCafKeys): ReceivedDocument => {
  const forms = signedForms(dte, element)
  const root = parseXmlDom(forms[0]).documentElement
  const signedElements = childElements(root).filter((node) => SIGNED_ELEMENTS.includes(node.tagName))
  if (signedElements.length !== 1)
    throw new DteError('XML_PARSE_FAILED', {
      field: 'Documento',
      index,
      reason: 'expected one Documento or Liquidacion',
    })
  const signed = signedElements[0]
  const header = readHeader(signed)
  const signature = checkSignature(root, forms, signed.tagName)
  const { ted, caf } = checkStamp(dte, root, signed, header, keys)
  return {
    xml: dte,
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
 * own signature. Each document is found in the input with the exact text its signature covers, and checked for: its
 * XMLDSig signature; its TED, whose `FRMT` must verify with the key of the CAF the TED carries and whose `DD` must
 * agree with the header; that CAF against the document (the issuer, the type, the folio inside the range); and the
 * SII's signature over the CAF (`FRMA`) with the SII key of its `IDK` (`SII_CAF_KEYS`, or `siiKeys`). A document that
 * fails a check is a result, not an error; a CAF whose `IDK` has no known key leaves the document `unchecked`. Pure:
 * no clock, no network. Not checked: who owns the signing certificate, and whether the CAF had expired.
 * ES: Verifica los documentos de un `DTE`, `EnvioDTE` o `EnvioBOLETA` tal como llega de un proveedor, y la firma del
 * propio sobre. Cada documento se ubica en la entrada con el texto exacto que cubre su firma, y se chequea: su firma
 * XMLDSig; su TED, cuya `FRMT` debe verificar con la llave del CAF que trae el TED y cuyo `DD` debe coincidir con el
 * encabezado; ese CAF contra el documento (el emisor, el tipo, el folio dentro del rango); y la firma del SII sobre el
 * CAF (`FRMA`) con la llave del SII de su `IDK` (`SII_CAF_KEYS`, o `siiKeys`). Un documento que falla un chequeo es un
 * resultado, no un error; un CAF cuyo `IDK` no tiene llave conocida deja el documento `unchecked`. Pura: sin reloj ni
 * red. No se chequea: de quién es el certificado que firma, ni si el CAF estaba vencido.
 * @throws {DteError} EN: `XML_PARSE_FAILED` for empty or malformed XML, another root, an envelope without exactly one `SetDTE`, a `DTE` out of place or a `DTE` without one `Documento` or `Liquidacion`; `ENVELOPE_EMPTY` for an envelope without documents. ES: `XML_PARSE_FAILED` para XML vacío o malformado, otro raíz, un sobre sin exactamente un `SetDTE`, un `DTE` fuera de lugar o un `DTE` sin un `Documento` o `Liquidacion`; `ENVELOPE_EMPTY` para un sobre sin documentos.
 */
export const verifyReceivedDocuments = (
  xml: string,
  options: VerifyReceivedDocumentsOptions = {},
): ReceivedDocumentsVerification => {
  if (typeof xml !== 'string' || xml.trim() === '') throw new DteError('XML_PARSE_FAILED', { reason: 'empty' })
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
  const total = dom.getElementsByTagName('DTE').length
  if (total === 0) throw new DteError('ENVELOPE_EMPTY', { field: 'SetDTE' })
  const texts = elementTexts(xml, DTE_PATTERN, 'DTE')
  if (placed.length !== total || texts.length !== total)
    throw new DteError('XML_PARSE_FAILED', { field: 'DTE', reason: 'a DTE out of place' })
  const keys = options.siiKeys ?? SII_CAF_KEYS
  const documents = texts.map((text, index) => verifyDocument(text, placed[index], index, keys))
  const envelope = rootTag === 'DTE' ? null : checkEnvelope(xml, root)
  return {
    root: rootTag,
    envelope,
    documents,
    status: worst([...(envelope === null ? [] : [passed(envelope.valid)]), ...documents.map((d) => d.status)]),
  }
}
