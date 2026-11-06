import { TEST_SET_REFERENCE_TYPE } from '../catalogs/certification'
import type { Certificate } from '../certificate/certificate'
import { issueDocument } from '../document/issue'
import type { SignedDocument } from '../document/sign'
import { createEnvelope } from '../envelope/create'
import { signEnvelope, type SignedEnvelope } from '../envelope/sign'
import { DteError } from '../errors'
import type { IssuerInput, LineItemInput } from '../model/document'
import type { FolioSource } from './folios'
import type { ReceiptsTestCase } from './receipts-set'

const RECEIPT_TYPE = 39
const UNIT_OBSERVATION = /unidad de medida/i
const UNIT_WORD = /en\s+(\w+)\.?$/i

/**
 * EN: What issuing the receipts set needs.
 * ES: Lo que necesita emitir el set de boletas.
 */
export type IssueReceiptsSetOptions = {
  /** EN: The issuer, as for phase 1. ES: El emisor, como en la fase 1. */
  readonly issuer: IssuerInput
  /** EN: The signing certificate; its holder is the sender of the envelope. ES: `RutEnvia` — El certificado de firma; su titular es quien envía el sobre. */
  readonly certificate: Certificate
  /** EN: Where the folios of type 39 and their CAFs come from. ES: De dónde salen los folios del tipo 39 y sus CAF. */
  readonly folios: FolioSource
  /** EN: The resolution of the certification environment: number 0 and its date. ES: `NroResol`, `FchResol` — La resolución del ambiente de certificación: número 0 y su fecha. */
  readonly resolution: { readonly number: number; readonly date: string }
  /** EN: Clock; the issue date is the UTC date of it. ES: `FchEmis` — Reloj; la fecha de emisión es la fecha UTC de él. */
  readonly now?: () => Date
}

/**
 * EN: One issued receipt of the set.
 * ES: Una boleta emitida del set.
 */
export type IssuedReceipt = {
  /** EN: The case it answers. ES: El caso que responde. */
  readonly caseNumber: number
  /** EN: Folio taken for it. ES: `Folio` — Folio tomado para ella. */
  readonly folio: number
  /** EN: The issued and signed receipt. ES: La boleta emitida y firmada. */
  readonly document: SignedDocument
}

/**
 * EN: The receipts set issued: its receipts in case order and the signed envelope that carries them.
 * ES: El set de boletas emitido: sus boletas en orden de caso y el sobre firmado que las lleva.
 */
export type IssuedReceiptsSet = {
  /** EN: The receipts, in case order. ES: Las boletas, en orden de caso. */
  readonly receipts: readonly IssuedReceipt[]
  /** EN: The signed envelope. ES: `EnvioBOLETA` — El sobre firmado. */
  readonly envelope: SignedEnvelope
  /** EN: The first folio used. ES: El primer folio usado. */
  readonly firstFolio: number
  /** EN: The last folio used. ES: El último folio usado. */
  readonly lastFolio: number
}

// "… unidad de medida en Kg." names the unit of the first item: the word after the `en` that ends the text. No word
// boundary is asked before `en`, as in the field, so the end of a longer word counts too.
const unitOf = (testCase: ReceiptsTestCase): string | undefined => {
  const observation = testCase.observations.find((text) => UNIT_OBSERVATION.test(text))
  return observation === undefined ? undefined : UNIT_WORD.exec(observation.trim())?.[1]
}

const linesOf = (testCase: ReceiptsTestCase): readonly LineItemInput[] => {
  const unit = unitOf(testCase)
  return testCase.items.map((item, index) => ({
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    ...(index === 0 && unit !== undefined ? { unit } : {}),
    ...(item.exempt ? { exempt: true } : {}),
  }))
}

/**
 * EN: Issues the receipts test set: one receipt of type 39 per case, in order, each with the next folio of the source,
 * the final consumer as receiver, the prices of the set taken as including VAT, the exemption of an exempt item, the
 * unit of measure an observation names on its first item, and one reference with the code `SET` and the reason
 * `CASO-<n>`; then signs the `EnvioBOLETA` that carries them, with the certificate holder as sender (the issuer when
 * the certificate names none) and the SII as receiver.
 * ES: Emite el set de pruebas de boletas: una boleta tipo 39 por caso, en orden, cada una con el siguiente folio de la
 * fuente, el consumidor final como receptor, los precios del set tomados con IVA incluido, la exención de un ítem
 * exento, la unidad de medida que nombra una observación en su primer ítem, y una referencia con el código `SET` y la
 * razón `CASO-<n>`; luego firma el `EnvioBOLETA` que las lleva, con el titular del certificado como enviador (el
 * emisor cuando el certificado no nombra ninguno) y el SII como receptor.
 * @param cases EN: the cases of `parseReceiptsTestSet`. ES: los casos de `parseReceiptsTestSet`.
 * @param options EN: issuer, certificate, folios, resolution, clock. ES: emisor, certificado, folios, resolución, reloj.
 * @throws {DteError} EN: `MISSING_FIELD { field: 'cases' }` without cases, `FOLIO_OUT_OF_RANGE` from the folio source, and the phase 1 codes. ES: `MISSING_FIELD { field: 'cases' }` sin casos, `FOLIO_OUT_OF_RANGE` de la fuente de folios, y los códigos de la fase 1.
 */
export const issueReceiptsSet = async (
  cases: readonly ReceiptsTestCase[],
  options: IssueReceiptsSetOptions,
): Promise<IssuedReceiptsSet> => {
  if (cases.length === 0) throw new DteError('MISSING_FIELD', { field: 'cases' })
  const now = options.now?.() ?? new Date()
  // The UTC date of the instant, as the field issues them: late in the evening in Chile it is already tomorrow's.
  const issueDate = now.toISOString().slice(0, 10)
  const receipts: IssuedReceipt[] = []
  for (const testCase of cases) {
    const { caf, folio } = await options.folios.take(RECEIPT_TYPE)
    const document = issueDocument({
      document: {
        type: RECEIPT_TYPE,
        folio,
        issueDate,
        issuer: options.issuer,
        items: linesOf(testCase),
        pricesIncludeVat: true,
        receiptReferences: [{ code: TEST_SET_REFERENCE_TYPE, reason: `CASO-${testCase.number}` }],
      },
      caf,
      certificate: options.certificate,
      now,
    })
    receipts.push({ caseNumber: testCase.number, folio, document })
  }
  const envelope = signEnvelope(
    createEnvelope({
      kind: 'receipt',
      documents: receipts.map((receipt) => receipt.document),
      cover: {
        issuerRut: options.issuer.rut,
        senderRut: options.certificate.rut ?? options.issuer.rut,
        resolutionDate: options.resolution.date,
        resolutionNumber: options.resolution.number,
      },
      now,
    }),
    options.certificate,
  )
  return { receipts, envelope, firstFolio: receipts[0].folio, lastFolio: receipts[receipts.length - 1].folio }
}
