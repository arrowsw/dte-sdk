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
    readonly columns: number
    readonly padding: number
    readonly includetext: boolean
    readonly binarytext: boolean
    readonly eclevel: number
    readonly fixedeclevel: boolean
    readonly raw?: boolean
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

// PDF417 as the SII's instructions ask for the stamp (section A.2.5): error correction level 5, fixed, since the
// library would otherwise pick it by the size of the data; rows three modules high, the library's own proportion; and
// a raster of four pixels a module, over 300 DPI at any size the stamp is printed at. The text is handed over as bytes
// (`binarytext`), so an `ñ` reaches the symbol as the single ISO-8859-1 byte that was signed, never as two UTF-8 bytes.
// Eighteen data columns make a symbol 387 modules wide with its quiet zone of six on each side: the widest whose
// module stays over the 6.7 mils of the instructions on the 80 mm roll (7.1 mils across its 7 cm), and 9.2 mils across
// the 9 cm of the sheet, where a stamp of a CAF of 512 bits is about 3 cm high.
const STAMP_OPTIONS = {
  bcid: 'pdf417',
  scale: 4,
  columns: 18,
  padding: 6,
  includetext: false,
  binarytext: true,
  eclevel: 5,
  fixedeclevel: true,
} as const

// A symbol holds 928 codewords: its length, the data and, at level 5, 64 of error correction.
const MAX_DATA_CODEWORDS = 928 - 64 - 1
const BYTE_LATCH = 901
const BYTE_LATCH_BY_SIX = 924

// Six bytes as five codewords in base 900, the byte compaction mode of the symbology. 256^6 is below 2^53, so plain
// numbers hold a group.
const groupOfSix = (bytes: Uint8Array, start: number): readonly number[] => {
  let value = 0
  for (let index = 0; index < 6; index += 1) value = value * 256 + bytes[start + index]
  const codewords = [0, 0, 0, 0, 0]
  for (let index = 4; index >= 0; index -= 1) {
    codewords[index] = value % 900
    value = Math.floor(value / 900)
  }
  return codewords
}

/**
 * EN: The codewords of a text in the byte compaction mode of PDF417 alone, as the SII's instructions ask for the stamp:
 * the latch, every six bytes as five codewords and the bytes left over as one each. Internal: exported for its test.
 * ES: Los codewords de un texto solo en el modo de compactación de bytes de PDF417, como piden las instrucciones del
 * SII para el timbre: el cambio de modo, cada seis bytes como cinco codewords y los bytes que sobran como uno cada uno.
 * Interno: se exporta para su test.
 * @internal
 */
export const byteCompactionCodewords = (bytes: Uint8Array): readonly number[] => {
  const whole = bytes.length - (bytes.length % 6)
  const groups = Array.from({ length: whole / 6 }, (_, index) => groupOfSix(bytes, index * 6)).flat()
  return [bytes.length === whole ? BYTE_LATCH_BY_SIX : BYTE_LATCH, ...groups, ...bytes.subarray(whole)]
}

// The stamp is written in bytes alone, the compaction the SII's instructions name. Mixed with text compaction, a byte
// above ASCII (an `ñ` in a name) travels behind a shift that readers are known to lose, and the stamp then reads as
// another text than the one that was signed. Only a text too long to fit in bytes keeps the compaction the library
// picks: 1,034 bytes fit, and the stamp of a CAF of 512 bits is under 900.
const rawCodewords = (bytes: Uint8Array): string | null => {
  const codewords = byteCompactionCodewords(bytes)
  return codewords.length > MAX_DATA_CODEWORDS
    ? null
    : codewords.map((codeword) => `^${String(codeword).padStart(3, '0')}`).join('')
}

/**
 * EN: Renders the stamp with an already loaded barcode module. Internal: `renderPrintedSample` shares it.
 * ES: Genera el timbre con un módulo de códigos de barras ya cargado. Interno: lo comparte `renderPrintedSample`.
 */
export const renderTedBarcodeWith = async (barcode: BarcodeModule, tedXml: string): Promise<Uint8Array> => {
  if (!tedXml.includes('<TED')) throw new DteError('MISSING_FIELD', { field: 'TED' })
  const raw = rawCodewords(encodeLatin1(tedXml))
  return new Uint8Array(
    await barcode.toBuffer(
      raw === null ? { ...STAMP_OPTIONS, text: tedXml } : { ...STAMP_OPTIONS, text: raw, raw: true },
    ),
  )
}

/**
 * EN: The PDF417 stamp of a TED as a PNG, by the SII's instructions for it (section A.2.5): error correction level 5,
 * always; byte compaction alone, whenever the TED fits in it (up to 1,034 bytes); rows three modules high; and four
 * pixels a module, with a quiet zone of six modules on each side, 387 modules across in all. The TED bytes are exactly
 * the ones that were signed. The renderer embeds it under the totals; callers with a layout of their own use it
 * directly, and must scale its two sides by one factor: 9 cm across gives a module of 9.2 mils, and nothing under
 * 6.6 cm keeps the 6.7 mils the instructions ask for.
 * ES: El timbre PDF417 de un TED como PNG, según las instrucciones del SII para él (sección A.2.5): nivel de corrección
 * 5, siempre; solo compactación de bytes, siempre que el TED quepa en ella (hasta 1.034 bytes); filas de tres módulos
 * de alto; y cuatro píxeles por módulo, con una zona de silencio de seis módulos a cada lado, 387 módulos de ancho en
 * total. Los bytes del TED son exactamente los que se firmaron. El renderizador lo incrusta bajo los totales; quien arma
 * su propia diagramación lo usa directo, y debe escalar sus dos lados por un mismo factor: 9 cm de ancho dan un módulo
 * de 9,2 mils, y nada bajo 6,6 cm conserva los 6,7 mils que piden las instrucciones.
 * @param tedXml EN: the `<TED>…</TED>` XML, verbatim from the signed document. ES: el XML `<TED>…</TED>`, textual del documento firmado.
 * @param load EN: loader of the barcode library, for tests. ES: cargador de la librería de códigos de barras, para tests.
 * @throws {DteError} EN: `MISSING_FIELD` (field `TED`) without a `<TED`, `ENCODING_UNSUPPORTED_CHAR` for a code point above U+00FF, `DEPENDENCY_UNAVAILABLE` when the library cannot be loaded. ES: `MISSING_FIELD` (campo `TED`) sin `<TED`, `ENCODING_UNSUPPORTED_CHAR` ante un code point mayor a U+00FF, `DEPENDENCY_UNAVAILABLE` si la librería no se puede cargar.
 */
export const renderTedBarcode = async (
  tedXml: string,
  load: () => Promise<BarcodeModule> = loadBarcodeModule,
): Promise<Uint8Array> => renderTedBarcodeWith(await load(), tedXml)
