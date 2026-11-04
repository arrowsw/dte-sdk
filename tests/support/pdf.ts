import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream, type PDFObject } from 'pdf-lib'
import { decodePdf417, luminanceOf, type Luminance } from './pdf417'

export type PdfPageInfo = { readonly pages: number; readonly width: number; readonly height: number }

export const pdfPage = async (bytes: Uint8Array): Promise<PdfPageInfo> => {
  const document = await PDFDocument.load(bytes)
  const { width, height } = document.getPage(0).getSize()
  return { pages: document.getPageCount(), width, height }
}

const rawStream = (document: PDFDocument, object: PDFObject): PDFRawStream => {
  const stream = document.context.lookup(object)
  if (!(stream instanceof PDFRawStream)) throw new Error('expected a raw stream')
  return stream
}

/** Every string drawn on the first page, in drawing order, one per line (WinAnsi read as Latin-1). */
export const pdfText = async (bytes: Uint8Array): Promise<string> => {
  const document = await PDFDocument.load(bytes)
  const contents = document.getPage(0).node.Contents()
  const parts = contents instanceof PDFArray ? contents.asArray() : contents === undefined ? [] : [contents]
  const strings: string[] = []
  for (const part of parts) {
    const text = Buffer.from(decodePDFRawStream(rawStream(document, part)).decode()).toString('latin1')
    for (const match of text.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g))
      strings.push(Buffer.from(match[1], 'hex').toString('latin1'))
  }
  return strings.join('\n')
}

export type PdfImage = { readonly width: number; readonly height: number; readonly pixels: Luminance | null }

const numberOf = (dict: PDFDict, key: string): number => Number(dict.get(PDFName.of(key))?.toString())

/** The image objects of the first page; `pixels` is null for an encoding the test helper cannot decode (JPEG). */
export const pdfImages = async (bytes: Uint8Array): Promise<readonly PdfImage[]> => {
  const document = await PDFDocument.load(bytes)
  const xobjects = document.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'))
  if (!(xobjects instanceof PDFDict)) return []
  const images: PdfImage[] = []
  for (const [, value] of xobjects.entries()) {
    const stream = rawStream(document, value)
    if (stream.dict.get(PDFName.of('Subtype'))?.toString() !== '/Image') continue
    const width = numberOf(stream.dict, 'Width')
    const height = numberOf(stream.dict, 'Height')
    try {
      const data = decodePDFRawStream(stream).decode()
      const mask = stream.dict.get(PDFName.of('SMask'))
      const alpha = mask === undefined ? null : decodePDFRawStream(rawStream(document, mask)).decode()
      images.push({ width, height, pixels: luminanceOf(data, width, height, alpha) })
    } catch {
      images.push({ width, height, pixels: null })
    }
  }
  return images
}

/** The TED decoded from the stamp embedded in the PDF, by an independent PDF417 reader. */
export const decodeStampInPdf = async (bytes: Uint8Array): Promise<string> => {
  for (const image of await pdfImages(bytes)) {
    if (image.pixels === null) continue
    try {
      return decodePdf417(image.pixels)
    } catch {
      // not the stamp (a logo): try the next image
    }
  }
  throw new Error('no decodable stamp in the PDF')
}
