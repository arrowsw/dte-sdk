import { DteError, errorCode, errorMessage, type DteErrorCode } from '../errors'
import { parsePrintableDocuments, type PrintableDocument } from './parse'
import { needsTransferableCopy, renderPrintedSample, type PrintedSampleOptions } from './render'

/**
 * EN: An envelope to print: a name (the file name, the artefact key) and its XML.
 * ES: Un envío a imprimir: un nombre (el del archivo, la clave del artefacto) y su XML.
 */
export type PrintedEnvelope = {
  /** EN: Name; it decides the set (3.5 of the phase 5a spec). ES: Nombre; decide el conjunto. */
  readonly name: string
  /** EN: The envelope XML. ES: El XML del envío. */
  readonly xml: string
}

/**
 * EN: The two sets of printed samples the certification asks for.
 * ES: Los dos conjuntos de muestras impresas que pide la certificación.
 */
export type PrintedSampleSet = 'tests' | 'simulation'

/**
 * EN: Input of `renderPrintedSamples`.
 * ES: Entrada de `renderPrintedSamples`.
 */
export type PrintedSamplesInput = {
  /** EN: The envelopes to render, each with a name. ES: Los envíos a generar, cada uno con su nombre. */
  readonly envelopes: readonly PrintedEnvelope[]
  /** EN: Rendering options shared by every sample. ES: Opciones de generación compartidas por todas las muestras. */
  readonly options?: PrintedSampleOptions
  /** EN: Also produce the transferable copy of every document that admits one; default false. ES: Producir además la copia cedible de cada documento que la admite; por defecto false. */
  readonly transferable?: boolean
}

/**
 * EN: One rendered sample.
 * ES: Una muestra generada.
 */
export type PrintedSample = {
  /** EN: `muestra_{type}_{folio}.pdf`, with `_cedible` before the extension on a transferable copy. ES: `muestra_{tipo}_{folio}.pdf`, con `_cedible` antes de la extensión en una copia cedible. */
  readonly name: string
  /** EN: The set the sample belongs to. ES: El conjunto al que pertenece la muestra. */
  readonly set: PrintedSampleSet
  /** EN: The envelope name. ES: El nombre del envío. */
  readonly source: string
  /** EN: Document type. ES: `TipoDTE` — Tipo de documento. */
  readonly type: number
  /** EN: Folio. ES: `Folio` — Folio. */
  readonly folio: string
  /** EN: True on the transferable copy. ES: True en la copia cedible. */
  readonly transferable: boolean
  /** EN: The PDF bytes. ES: Los bytes del PDF. */
  readonly bytes: Uint8Array
}

/**
 * EN: A sample file as the certification uploads it: its base name and its bytes.
 * ES: Un archivo de muestra como lo sube la certificación: su nombre base y sus bytes.
 */
export type PrintedSampleFile = {
  /** EN: The file name, `[A-Za-z0-9_.-]+.pdf`. ES: El nombre de archivo, `[A-Za-z0-9_.-]+.pdf`. */
  readonly fileName: string
  /** EN: The PDF bytes. ES: Los bytes del PDF. */
  readonly bytes: Uint8Array
}

/**
 * EN: One envelope or document that could not be rendered.
 * ES: Un envío o documento que no se pudo generar.
 */
export type PrintedSampleFailure = {
  /** EN: The envelope name. ES: El nombre del envío. */
  readonly source: string
  /** EN: Absent when the envelope itself failed to parse. ES: Ausente cuando el envío mismo no se pudo parsear. */
  readonly type?: number
  /** EN: Folio of the document that failed. ES: `Folio` — Folio del documento que falló. */
  readonly folio?: string
  /** EN: True when the transferable copy failed. ES: True cuando falló la copia cedible. */
  readonly transferable?: boolean
  /** EN: The `DteError` code, when it was one. ES: El código del `DteError`, cuando lo fue. */
  readonly code?: DteErrorCode
  /** EN: The error message. ES: El mensaje del error. */
  readonly reason: string
}

/**
 * EN: Result of `renderPrintedSamples`.
 * ES: Resultado de `renderPrintedSamples`.
 */
export type PrintedSamplesResult = {
  /** EN: True when nothing failed. ES: True cuando nada falló. */
  readonly success: boolean
  /** EN: The samples rendered. ES: Las muestras generadas. */
  readonly samples: readonly PrintedSample[]
  /** EN: The envelopes and documents that failed. ES: Los envíos y documentos que fallaron. */
  readonly failures: readonly PrintedSampleFailure[]
  /** EN: Documents parsed. ES: Documentos parseados. */
  readonly documents: number
  /** EN: Samples in the test set. ES: Muestras del conjunto de pruebas. */
  readonly tests: number
  /** EN: Samples in the simulation set. ES: Muestras del conjunto de simulación. */
  readonly simulation: number
}

const TEST_SET_PATTERN = /envio-set-(basico|guia|exenta|compra)\.xml/

/**
 * EN: The set an envelope belongs to by its name: the basic, guide, exempt and purchase set envelopes go to the test
 * set, everything else to the simulation set.
 * ES: El conjunto al que pertenece un envío por su nombre: los envíos de los sets básico, guía, exento y compra van al
 * conjunto de pruebas, todo lo demás al de simulación.
 */
export const sampleSetOf = (name: string): PrintedSampleSet =>
  TEST_SET_PATTERN.test(name.toLowerCase()) ? 'tests' : 'simulation'

/**
 * EN: File name of a sample.
 * ES: Nombre de archivo de una muestra.
 */
export const sampleName = (doc: PrintableDocument, transferable: boolean): string =>
  `muestra_${doc.type}_${doc.folio}${transferable ? '_cedible' : ''}.pdf`

// The folio becomes part of the file name, so only a run of digits may reach `sampleName`: an XML from elsewhere could
// carry `..` or a separator in `<Folio>` and name a file outside the folder of its set.
const FOLIO_PATTERN = /^\d+$/

const failure = (
  source: string,
  error: unknown,
  doc?: PrintableDocument,
  transferable?: boolean,
): PrintedSampleFailure => ({
  source,
  ...(doc ? { type: doc.type, folio: doc.folio, transferable } : {}),
  code: errorCode(error),
  reason: errorMessage(error),
})

/**
 * EN: Renders every document of every envelope, in memory: one sample per document and, with `transferable`, a second
 * one for each document that admits a transferable copy. A parse failure skips the envelope; a folio that is not a run
 * of digits (`INVALID_FOLIO`, it would name the file) or a render failure skips the document; all are reported as data
 * and the batch goes on. Nothing is logged.
 * ES: Genera cada documento de cada envío, en memoria: una muestra por documento y, con `transferable`, una segunda
 * por cada documento que admite copia cedible. Una falla de parseo salta el envío; un folio que no sea solo dígitos
 * (`INVALID_FOLIO`, daría nombre al archivo) o una falla de dibujo saltan el documento; todo se reporta como datos y el
 * lote sigue. No se escribe nada en consola.
 * @param input EN: envelopes, options and `transferable`. ES: envíos, opciones y `transferable`.
 */
export const renderPrintedSamples = async (input: PrintedSamplesInput): Promise<PrintedSamplesResult> => {
  const samples: PrintedSample[] = []
  const failures: PrintedSampleFailure[] = []
  let documents = 0
  for (const envelope of input.envelopes) {
    let parsed: readonly PrintableDocument[]
    try {
      parsed = parsePrintableDocuments(envelope.xml)
    } catch (error) {
      failures.push(failure(envelope.name, error))
      continue
    }
    const set = sampleSetOf(envelope.name)
    for (const doc of parsed) {
      documents += 1
      if (!FOLIO_PATTERN.test(doc.folio)) {
        failures.push(failure(envelope.name, new DteError('INVALID_FOLIO', { field: 'Folio' }), doc, false))
        continue
      }
      const copies = input.transferable && needsTransferableCopy(doc) ? [false, true] : [false]
      for (const transferable of copies) {
        try {
          const bytes = await renderPrintedSample(doc, { ...input.options, transferable })
          samples.push({
            name: sampleName(doc, transferable),
            set,
            source: envelope.name,
            type: doc.type,
            folio: doc.folio,
            transferable,
            bytes,
          })
        } catch (error) {
          failures.push(failure(envelope.name, error, doc, transferable))
        }
      }
    }
  }
  return {
    success: failures.length === 0,
    samples,
    failures,
    documents,
    tests: samples.filter((sample) => sample.set === 'tests').length,
    simulation: samples.filter((sample) => sample.set === 'simulation').length,
  }
}
