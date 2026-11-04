/**
 * EN: dte-sdk/pdf entry: the printed samples (PDF417 stamp and PDF per the SII manual). `pdf-lib` and `bwip-js` load on
 * first use. Node only, because the batch functions read and write files.
 * ES: Entrada dte-sdk/pdf: las muestras impresas (timbre PDF417 y PDF según el manual del SII). `pdf-lib` y `bwip-js` se
 * cargan en el primer uso. Solo Node, porque las funciones por lote leen y escriben archivos.
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
  PrintedSampleSet,
  PrintedSamplesInput,
  PrintedSamplesResult,
} from './samples'
export { findEnvelopeFiles, writePrintedSamples } from './node-samples'
export type { WritePrintedSamplesInput, WritePrintedSamplesResult, WrittenPrintedSample } from './node-samples'
