import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseCaf } from '../../src/caf/parse'
import { signWithCaf } from '../../src/caf/sign'
import { writePrintedSamples } from '../../src/pdf/node-samples'
import { parsePrintableDocuments } from '../../src/pdf/parse'
import { renderPrintedSample } from '../../src/pdf/render'
import { renderPrintedSamples } from '../../src/pdf/samples'
import { FIXED_NOW, fixtureText } from '../support/fixtures'
import { decodeStampInPdf, pdfText } from '../support/pdf'
import { invoice, thirdPartyXml } from '../support/printed-fixtures'
import { createTempDirs } from '../support/temp-dir'

// Issuing and rendering several documents per test is slow on instrumented CI runners, as in the books suites.
jest.setTimeout(30_000)

const dirs = createTempDirs()
afterAll(() => dirs.cleanup())

const options = { now: () => FIXED_NOW }
// What a tool that pretty-prints a file does to it: a line break and an indentation between every two tags.
const indented = (xml: string): string => xml.replace(/></g, '>\n      <')
const tedOf = (xml: string): string => /<TED[^>]*>[\s\S]*?<\/TED>/.exec(xml)![0]
// A stamp over a `DD` of the test's own, signed with the key of the fixture CAF the `DD` carries.
const caf = parseCaf(fixtureText('caf-33.xml'))
const signedDd = /<DD>[\s\S]*<\/DD>/.exec(invoice.ted.xml)![0]
const stamped = (dd: string): string =>
  `<TED version="1.0">${dd}<FRMT algoritmo="SHA1withRSA">${signWithCaf(caf, dd)}</FRMT></TED>`

describe('the stamp of a file changed after it was signed', () => {
  test('indented: the stamp is taken without the whitespace between its tags, as it was signed', () => {
    const xml = indented(invoice.xml)
    expect(tedOf(xml)).not.toBe(invoice.ted.xml)
    expect(parsePrintableDocuments(xml)[0].tedXml).toBe(invoice.ted.xml)
  })

  test('and the printed stamp decodes to the signed TED', async () => {
    const [doc] = parsePrintableDocuments(indented(invoice.xml))
    expect(await decodeStampInPdf(await renderPrintedSample(doc, options))).toBe(invoice.ted.xml)
  })

  test('written again with other escapes: the DD is written as it was signed', () => {
    // The SDK strips quotes from the stamp, so this one is signed by hand, escaped the SII's way.
    const ted = stamped(signedDd.replace(/<RSR>[^<]*<\/RSR>/, '<RSR>Viña O&apos;Higgins &quot;Sur&quot; Ltda</RSR>'))
    // A serializer that escapes only what text needs writes the quotes as themselves.
    const rewritten = indented(invoice.xml.replace(invoice.ted.xml, ted))
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
    expect(tedOf(rewritten)).toContain('O\'Higgins "Sur"')
    expect(parsePrintableDocuments(rewritten)[0].tedXml).toBe(ted)
  })

  test('a stamp signed with whitespace between its tags is left as it is', () => {
    const ted = stamped(signedDd.replace(/></g, '>\n<'))
    expect(parsePrintableDocuments(invoice.xml.replace(invoice.ted.xml, ted))[0].tedXml).toBe(ted)
  })

  test('a stamp whose signature verifies over no form is left as written', () => {
    const xml = indented(thirdPartyXml)
    expect(parsePrintableDocuments(xml)[0].tedXml).toBe(tedOf(xml))
  })

  test('a cut of the text that is not a stamp on its own is left as written', () => {
    // The cut starts at the `<TED` inside the comment, so it holds two openings and one closing.
    const xml = thirdPartyXml.replace('<TED version="1.0">', '<!-- <TED> --><TED version="1.0">')
    const [doc] = parsePrintableDocuments(xml)
    expect(doc.tedXml).toBe(tedOf(xml))
    expect(doc.tedXml.startsWith('<TED> --><TED version="1.0">')).toBe(true)
  })

  test('a stamp without a DD is left as written', () => {
    const ted = '<TED version="1.0">\n<FRMT algoritmo="SHA1withRSA">AA==</FRMT>\n</TED>'
    expect(parsePrintableDocuments(invoice.xml.replace(invoice.ted.xml, ted))[0].tedXml).toBe(ted)
  })
})

describe('an XML given as bytes', () => {
  const latin1 = new Uint8Array(Buffer.from(thirdPartyXml, 'latin1'))
  const utf8 = new Uint8Array(Buffer.from(thirdPartyXml, 'utf8'))
  const expected = parsePrintableDocuments(thirdPartyXml)

  test('the fixture has characters the two encodings write differently', () => {
    expect(expected[0].receiver.name).toBe('Óptica Muñoz Ltda')
    expect(latin1.length).toBeLessThan(utf8.length)
  })

  test('ISO-8859-1 bytes, as the SII asks to write a document, are read as such', () => {
    expect(parsePrintableDocuments(latin1)).toEqual(expected)
  })

  test('UTF-8 bytes are read as UTF-8 whatever the declaration says, and a byte order mark is dropped', () => {
    expect(parsePrintableDocuments(utf8)).toEqual(expected)
    expect(parsePrintableDocuments(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]))).toEqual(expected)
  })

  test('renderPrintedSamples takes the bytes of an envelope', async () => {
    const result = await renderPrintedSamples({ envelopes: [{ name: 'tercero.xml', xml: latin1 }], options })
    expect(result).toMatchObject({ success: true, documents: 1 })
    expect(await pdfText(result.samples[0].bytes)).toContain('Óptica Muñoz Ltda')
  })

  test.each([
    ['ISO-8859-1', latin1],
    ['UTF-8', utf8],
  ])('writePrintedSamples reads a file written in %s', async (_, bytes) => {
    const dir = await dirs.make('dte-sdk-third-party-')
    const file = join(dir, 'tercero.xml')
    await writeFile(file, bytes)
    const result = await writePrintedSamples({ xmlFiles: [file], outDir: join(dir, 'out'), options })
    expect(result).toMatchObject({ success: true, failures: [], documents: 1 })
    expect(await pdfText(new Uint8Array(await readFile(result.samples[0].path)))).toContain('Óptica Muñoz Ltda')
  })
})
