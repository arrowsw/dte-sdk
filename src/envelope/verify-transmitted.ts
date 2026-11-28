import { verifyDocumentSignature } from '../document/sign'
import { readReceivedStructure, type ReceivedDocumentElements } from '../document/received-structure'
import { DteError } from '../errors'
import { verifyEnveloped } from '../signature/xmldsig'
import { stampVerifiesAsSiiReads } from '../ted/as-written'

/**
 * EN: One document of an envelope, checked as it stands in the text of the file.
 * ES: Un documento de un sobre, chequeado tal como está en el texto del archivo.
 */
export type TransmittedDocumentCheck = {
  /** EN: Document type, or null when it is not a whole number. ES: `TipoDTE` — Tipo de documento, o null si no es un entero. */
  readonly type: number | null
  /** EN: Folio, or null when it is not a whole number. ES: `Folio` — Folio, o null si no es un entero. */
  readonly folio: number | null
  /** EN: The document's XMLDSig signature verifies over the `<DTE>…</DTE>` cut from the text and read on its own, with only the namespaces that text declares. ES: La firma XMLDSig del documento verifica sobre el `<DTE>…</DTE>` cortado del texto y leído por sí solo, con solo los namespaces que declara ese texto. */
  readonly signatureValid: boolean
  /** EN: The text holds one `TED`, and its `FRMT` verifies, with the key (`RSAPK`) of the CAF the stamp carries, over its `DD` as the text writes it or as the SII's "Instructivo Emisión DTE" (A.2.4) has it verified: without the blanks, tabs and ends of line between tags and without namespace declarations. ES: `TED` — El texto trae un solo `TED`, y su `FRMT` verifica, con la llave (`RSAPK`) del CAF que trae el timbre, sobre su `DD` tal como lo escribe el texto o como el "Instructivo Emisión DTE" del SII (A.2.4) indica verificarlo: sin los blancos, tabulaciones y fines de línea entre etiquetas y sin declaraciones de namespace. */
  readonly stampValid: boolean
  /** EN: Both checks passed. ES: Pasaron ambos chequeos. */
  readonly valid: boolean
}

/**
 * EN: Result of `verifyTransmittedEnvelope`.
 * ES: Resultado de `verifyTransmittedEnvelope`.
 */
export type TransmittedEnvelopeVerification = {
  /** EN: Root of the envelope. ES: Raíz del sobre. */
  readonly root: 'EnvioDTE' | 'EnvioBOLETA'
  /** EN: The envelope's own signature over `SetDTE` verifies. ES: La firma del propio sobre sobre `SetDTE` verifica. */
  readonly envelopeSignatureValid: boolean
  /** EN: Every document, in the order of the text. ES: Cada documento, en el orden del texto. */
  readonly documents: readonly TransmittedDocumentCheck[]
  /** EN: The envelope's signature and every document passed. ES: Pasaron la firma del sobre y cada documento. */
  readonly valid: boolean
}

const DTE_TEXT = /<DTE[\s>][\s\S]*?<\/DTE\s*>/g
const TED_TEXT = /<TED[\s>][\s\S]*?<\/TED\s*>/g
const XML_DECLARATION = /^\s*<\?xml\s[^>]*\?>/
// Markup a reader may skip and a cut of the text would not: each could hold text that spells a DTE.
const UNREAD: readonly (readonly [string, string])[] = [
  ['comment', '<!--'],
  ['CDATA', '<![CDATA['],
  ['instruction', '<?'],
]

// Every piece of `text` the pattern cuts, in order.
const cuts = (text: string, pattern: RegExp): readonly string[] =>
  Array.from(text.matchAll(pattern), (match) => match[0])

const sameDocument = (cut: ReceivedDocumentElements, element: ReceivedDocumentElements): boolean =>
  cut.signed.getAttribute('ID') === element.signed.getAttribute('ID') &&
  cut.header.type === element.header.type &&
  cut.header.folio === element.header.folio

/**
 * EN: The `<DTE>…</DTE>` texts of an envelope, one per element of `documents` and in their order, each checked to be
 * that element: the text holds no comment, CDATA section or processing instruction past its XML declaration (in XML a
 * `<` is markup anywhere else, so every `<DTE` left is a start tag), a closing tag may carry blanks before its `>`, and
 * each cut, read on its own, has the `ID` of its signed element, the type and the folio of its element. Internal.
 * ES: Los textos `<DTE>…</DTE>` de un sobre, uno por elemento de `documents` y en su orden, cada uno chequeado como
 * ese elemento: el texto no trae comentarios, secciones CDATA ni instrucciones de procesamiento después de su
 * declaración XML (en XML un `<` es marcado en cualquier otro lugar, así cada `<DTE` que queda es una etiqueta de
 * inicio), una etiqueta de cierre puede traer blancos antes de su `>`, y cada corte, leído por sí solo, tiene el `ID`
 * de su elemento firmado, el tipo y el folio de su elemento. Interno.
 * @throws {DteError} EN: `XML_PARSE_FAILED { field: 'comment' | 'CDATA' | 'instruction' }` for such markup, `XML_PARSE_FAILED { field: 'DTE' }` when the cuts are not one per element, `XML_PARSE_FAILED { field: 'DTE', index }` when a cut is not its element. ES: `XML_PARSE_FAILED { field: 'comment' | 'CDATA' | 'instruction' }` por ese marcado, `XML_PARSE_FAILED { field: 'DTE' }` si los cortes no son uno por elemento, `XML_PARSE_FAILED { field: 'DTE', index }` si un corte no es su elemento.
 */
export const documentTexts = (xml: string, documents: readonly ReceivedDocumentElements[]): readonly string[] => {
  const body = xml.replace(XML_DECLARATION, '')
  for (const [field, opening] of UNREAD)
    if (body.includes(opening))
      throw new DteError('XML_PARSE_FAILED', { field, reason: 'not read before an upload: it may hide a DTE' })
  const texts = cuts(body, DTE_TEXT)
  if (texts.length !== documents.length)
    throw new DteError('XML_PARSE_FAILED', { field: 'DTE', reason: 'the text does not hold one DTE per element' })
  texts.forEach((text, index) => {
    if (!sameDocument(readReceivedStructure(text).documents[0], documents[index]))
      throw new DteError('XML_PARSE_FAILED', { field: 'DTE', index, reason: 'the text of the DTE is not its element' })
  })
  return texts
}

// A check that cannot even be made (no signature, a text that does not read on its own) is a check that failed.
const holds = (check: () => boolean): boolean => {
  try {
    return check()
  } catch {
    return false
  }
}

const stampHolds = (dte: string): boolean => {
  const teds = cuts(dte, TED_TEXT)
  return teds.length === 1 && stampVerifiesAsSiiReads(teds[0])
}

/**
 * EN: Verifies an `EnvioDTE` or `EnvioBOLETA` exactly as it will be sent: each `<DTE>…</DTE>` is cut from the text,
 * not written from a parsed tree, and checked on its own (`documentTexts` says how a cut is made sure of). Its signature
 * must verify over that fragment alone: field behaviour is that the SII reads each document so, and answers "Firma DTE
 * Incorrecta" for a `<DTE>` that verifies inside the envelope only because it inherits the envelope's namespace. Its
 * stamp's `FRMT` must verify over the `DD` as the text writes it or over the string the SII's "Instructivo Emisión
 * DTE" (A.2.4, pages 19 to 21) says the stamp is signed and verified over, the text without "los caracteres de fin de
 * línea y los blancos y/o tab entre TAGS, así como la referencia a NameSpaces", which "de lo contrario la verificación
 * del timbre electrónico resultará incorrecta". That string changes nothing a terminal element holds, so a stamp whose
 * content was written again after it was signed (an empty element `<RSR/>` where `<RSR></RSR>` was signed) fails. The
 * envelope's own signature over `SetDTE` is checked as well. A check that fails is a result, not an error. Pure: no
 * clock, no network. Not checked: the SII's signature over each CAF, the CAF against the document, and who signed.
 * ES: Verifica un `EnvioDTE` o `EnvioBOLETA` exactamente como se enviará: cada `<DTE>…</DTE>` se corta del texto, no
 * se escribe desde un árbol parseado, y se chequea por sí solo (`documentTexts` dice cómo se asegura un corte). Su
 * firma debe verificar sobre ese solo fragmento: el comportamiento de campo es que el SII lee así cada documento, y
 * responde "Firma DTE Incorrecta" por un `<DTE>` que verifica dentro del sobre solo porque hereda el namespace del
 * sobre. La `FRMT` de su timbre debe verificar sobre el `DD` como lo escribe el texto o sobre el string sobre el que el
 * "Instructivo Emisión DTE" del SII (A.2.4, páginas 19 a 21) dice que se firma y verifica el timbre, el texto sin "los
 * caracteres de fin de línea y los blancos y/o tab entre TAGS, así como la referencia a NameSpaces", y "de lo
 * contrario la verificación del timbre electrónico resultará incorrecta". Ese string no cambia nada de lo que trae un
 * elemento terminal, así un timbre cuyo contenido se escribió de nuevo después de firmarlo (un elemento vacío `<RSR/>`
 * donde se firmó `<RSR></RSR>`) falla. Se chequea también la firma del propio sobre sobre `SetDTE`. Un chequeo que
 * falla es un resultado, no un error. Pura: sin reloj ni red. No se chequea: la firma del SII sobre cada CAF, el CAF
 * frente al documento, ni quién firmó.
 * @param xml EN: the envelope as it will be uploaded. ES: el sobre tal como se subirá.
 * @returns EN: the checks of the envelope and of each document. ES: los chequeos del sobre y de cada documento.
 * @throws {DteError} EN: `XML_PARSE_FAILED` for what `verifyReceivedDocuments` refuses, a lone `DTE`, and the codes of `documentTexts`; `ENVELOPE_EMPTY` for an envelope without documents. ES: `XML_PARSE_FAILED` para lo que rechaza `verifyReceivedDocuments`, un `DTE` solo, y los códigos de `documentTexts`; `ENVELOPE_EMPTY` para un sobre sin documentos.
 */
export const verifyTransmittedEnvelope = (xml: string): TransmittedEnvelopeVerification => {
  const { rootTag, documents: read } = readReceivedStructure(xml)
  if (rootTag === 'DTE')
    throw new DteError('XML_PARSE_FAILED', { field: 'root', root: rootTag, reason: 'expected EnvioDTE or EnvioBOLETA' })
  const texts = documentTexts(xml, read)
  const documents = read.map(({ header }, index): TransmittedDocumentCheck => {
    const signatureValid = holds(() => verifyDocumentSignature(texts[index]).valid)
    const stampValid = stampHolds(texts[index])
    return { type: header.type, folio: header.folio, signatureValid, stampValid, valid: signatureValid && stampValid }
  })
  const envelopeSignatureValid = holds(() => verifyEnveloped(xml, { elementTag: 'SetDTE', rootTag }).valid)
  return {
    root: rootTag,
    envelopeSignatureValid,
    documents,
    valid: envelopeSignatureValid && documents.every((document) => document.valid),
  }
}
