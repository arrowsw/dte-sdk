/**
 * EN: dte-sdk/pdf entry: the printed samples (PDF417 stamp and PDF per the SII manual). `pdf-lib` and `bwip-js` are
 * optional peer dependencies, loaded on first use; without them the render functions throw `DEPENDENCY_UNAVAILABLE`. Node
 * only, because the batch functions read and write files.
 * ES: Entrada dte-sdk/pdf: las muestras impresas (timbre PDF417 y PDF según el manual del SII). `pdf-lib` y `bwip-js` son
 * dependencias peer opcionales, cargadas en el primer uso; sin ellas las funciones de render lanzan
 * `DEPENDENCY_UNAVAILABLE`. Solo Node, porque las funciones por lote leen y escriben archivos.
 */
export { parsePrintableDocuments } from './parse'
export type {
  PrintableAdjustment,
  PrintableDocument,
  PrintableIssuer,
  PrintableItem,
  PrintableParty,
  PrintableReference,
  PrintableTotals,
} from './parse'
export { renderTedBarcode } from './stamp'
export { needsTransferableCopy, renderPrintedSample } from './render'
export type { PrintedLogo, PrintedSampleOptions, RenderPrintedSampleOptions } from './render'
export { renderPrintedSamples } from './samples'
export type {
  PrintedEnvelope,
  PrintedSample,
  PrintedSampleFailure,
  PrintedSampleFile,
  PrintedSampleSet,
  PrintedSamplesInput,
  PrintedSamplesResult,
} from './samples'
export { findEnvelopeFiles, readPrintedSamples, writePrintedSamples } from './node-samples'
export type { WritePrintedSamplesInput, WritePrintedSamplesResult, WrittenPrintedSample } from './node-samples'
