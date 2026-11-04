import { DteError, errorMessage } from '../errors'
import { encodeLatin1 } from '../text/latin1'

/**
 * EN: The part of the barcode library the stamp uses: `toBuffer` of its Node entry, which renders a PNG.
 * ES: La parte de la librería de códigos de barras que usa el timbre: `toBuffer` de su entrada Node, que genera un PNG.
 */
export type BarcodeModule = {
  /** EN: Renders a symbol to PNG bytes. ES: Genera un símbolo como bytes PNG. */
  readonly toBuffer: (options: {
    readonly bcid: string
    readonly text: string
    readonly scale: number
    readonly height: number
    readonly padding: number
    readonly includetext: boolean
    readonly binarytext: boolean
  }) => Promise<Uint8Array>
}

/**
 * EN: Loads `bwip-js` on first use, never at import time.
 * ES: Carga `bwip-js` en el primer uso, nunca al importar.
 * @throws {DteError} EN: `DEPENDENCY_UNAVAILABLE` with `module: 'bwip-js'`. ES: `DEPENDENCY_UNAVAILABLE` con `module: 'bwip-js'`.
 */
export const loadBarcodeModule = async (): Promise<BarcodeModule> => {
  try {
    return (await import('bwip-js')) as unknown as BarcodeModule
  } catch (error) {
    throw new DteError('DEPENDENCY_UNAVAILABLE', { module: 'bwip-js', reason: errorMessage(error) })
  }
}

// PDF417 as the SII reads it: the text is handed over as bytes (`binarytext`), so an `ñ` reaches the symbol as the
// single ISO-8859-1 byte that was signed, never as two UTF-8 bytes. Scale, height and padding are those of the field.
const STAMP_OPTIONS = {
  bcid: 'pdf417',
  scale: 3,
  height: 10,
  padding: 6,
  includetext: false,
  binarytext: true,
} as const

/**
 * EN: Renders the stamp with an already loaded barcode module. Internal: `renderPrintedSample` shares it.
 * ES: Genera el timbre con un módulo de códigos de barras ya cargado. Interno: lo comparte `renderPrintedSample`.
 */
export const renderTedBarcodeWith = async (barcode: BarcodeModule, tedXml: string): Promise<Uint8Array> => {
  if (!tedXml.includes('<TED')) throw new DteError('MISSING_FIELD', { field: 'TED' })
  encodeLatin1(tedXml)
  return new Uint8Array(await barcode.toBuffer({ ...STAMP_OPTIONS, text: tedXml }))
}

/**
 * EN: The PDF417 stamp of a TED as a PNG: error correction level 5, the TED bytes exactly as they were signed. The
 * renderer embeds it under the totals; callers with a layout of their own use it directly.
 * ES: El timbre PDF417 de un TED como PNG: nivel de corrección 5, los bytes del TED exactamente como se firmaron. El
 * renderizador lo incrusta bajo los totales; quien arma su propia diagramación lo usa directo.
 * @param tedXml EN: the `<TED>…</TED>` XML, verbatim from the signed document. ES: el XML `<TED>…</TED>`, textual del documento firmado.
 * @param load EN: loader of the barcode library, for tests. ES: cargador de la librería de códigos de barras, para tests.
 * @throws {DteError} EN: `MISSING_FIELD` (field `TED`) without a `<TED`, `ENCODING_UNSUPPORTED_CHAR` for a code point above U+00FF, `DEPENDENCY_UNAVAILABLE` when the library cannot be loaded. ES: `MISSING_FIELD` (campo `TED`) sin `<TED`, `ENCODING_UNSUPPORTED_CHAR` ante un code point mayor a U+00FF, `DEPENDENCY_UNAVAILABLE` si la librería no se puede cargar.
 */
export const renderTedBarcode = async (
  tedXml: string,
  load: () => Promise<BarcodeModule> = loadBarcodeModule,
): Promise<Uint8Array> => renderTedBarcodeWith(await load(), tedXml)
