import { verifyDocumentSignature } from '../document/sign'
import { readReceivedStructure } from '../document/received-structure'
import { DteError } from '../errors'
import { verifyEnveloped } from '../signature/xmldsig'
import { stampVerifiesAsWritten } from '../ted/as-written'

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
  /** EN: The text holds one `TED`, and its `FRMT` verifies over its `DD` exactly as the text writes it, with the key (`RSAPK`) of the CAF the stamp carries. ES: `TED` — El texto trae un solo `TED`, y su `FRMT` verifica sobre su `DD` exactamente como lo escribe el texto, con la llave (`RSAPK`) del CAF que trae el timbre. */
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

const DTE_TEXT = /<DTE[\s>][\s\S]*?<\/DTE>/g
const TED_TEXT = /<TED[\s>][\s\S]*?<\/TED>/g

// Every piece of `text` the pattern cuts, in order.
const cuts = (text: string, pattern: RegExp): readonly string[] =>
  Array.from(text.matchAll(pattern), (match) => match[0])

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
  return teds.length === 1 && stampVerifiesAsWritten(teds[0])
}

/**
 * EN: Verifies an `EnvioDTE` or `EnvioBOLETA` exactly as it will be sent, the way field behaviour shows the SII reads
 * it: each `<DTE>…</DTE>` is cut from the text, not written from a parsed tree, and checked on its own. Its signature
 * must verify over that fragment alone, so a `<DTE>` that verifies inside the envelope only because it inherits the
 * envelope's namespace fails here (the SII answers "Firma DTE Incorrecta"); and its stamp's `FRMT` must verify over
 * the `DD` as the text writes it, so a stamp written again after it was signed (an empty element `<RSR/>` where
 * `<RSR></RSR>` was signed) fails here (the SII objects "Firma Timbre Electrónico Incorrecta"). The envelope's own
 * signature over `SetDTE` is checked as well. A check that fails is a result, not an error. Pure: no clock, no network.
 * Not checked: the SII's signature over each CAF, the CAF against the document, and who signed.
 * ES: Verifica un `EnvioDTE` o `EnvioBOLETA` exactamente como se enviará, como el comportamiento de campo muestra que
 * lo lee el SII: cada `<DTE>…</DTE>` se corta del texto, no se escribe desde un árbol parseado, y se chequea por sí
 * solo. Su firma debe verificar sobre ese solo fragmento, así un `<DTE>` que verifica dentro del sobre solo porque
 * hereda el namespace del sobre falla aquí (el SII responde "Firma DTE Incorrecta"); y la `FRMT` de su timbre debe
 * verificar sobre el `DD` como lo escribe el texto, así un timbre escrito de nuevo después de firmarlo (un elemento
 * vacío `<RSR/>` donde se firmó `<RSR></RSR>`) falla aquí (el SII objeta "Firma Timbre Electrónico Incorrecta"). Se
 * chequea también la firma del propio sobre sobre `SetDTE`. Un chequeo que falla es un resultado, no un error. Pura:
 * sin reloj ni red. No se chequea: la firma del SII sobre cada CAF, el CAF frente al documento, ni quién firmó.
 * @param xml EN: the envelope as it will be uploaded. ES: el sobre tal como se subirá.
 * @returns EN: the checks of the envelope and of each document. ES: los chequeos del sobre y de cada documento.
 * @throws {DteError} EN: `XML_PARSE_FAILED` for what `verifyReceivedDocuments` refuses, a lone `DTE`, or a text that does not hold one `<DTE>…</DTE>` per `DTE` element (a comment that spells one); `ENVELOPE_EMPTY` for an envelope without documents. ES: `XML_PARSE_FAILED` para lo que rechaza `verifyReceivedDocuments`, un `DTE` solo, o un texto que no trae un `<DTE>…</DTE>` por cada elemento `DTE` (un comentario que escribe uno); `ENVELOPE_EMPTY` para un sobre sin documentos.
 */
export const verifyTransmittedEnvelope = (xml: string): TransmittedEnvelopeVerification => {
  const { rootTag, documents: read } = readReceivedStructure(xml)
  if (rootTag === 'DTE')
    throw new DteError('XML_PARSE_FAILED', { field: 'root', root: rootTag, reason: 'expected EnvioDTE or EnvioBOLETA' })
  const texts = cuts(xml, DTE_TEXT)
  if (texts.length !== read.length)
    throw new DteError('XML_PARSE_FAILED', { field: 'DTE', reason: 'the text does not hold one DTE per element' })
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
