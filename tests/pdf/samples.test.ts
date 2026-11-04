import { renderPrintedSamples, sampleName, sampleSetOf } from '../../src/pdf/samples'
import { FIXED_NOW } from '../support/fixtures'
import { pdfText } from '../support/pdf'
import { basicSetXml, receiptsXml, thirdPartyXml, withoutTed } from '../support/printed-fixtures'

// Issuing and rendering several documents per test is slow on instrumented CI runners, as in the books suites.
jest.setTimeout(30_000)

const options = { now: () => FIXED_NOW }

test('the set of an envelope comes from its name', () => {
  expect(sampleSetOf('envio-set-basico.xml')).toBe('tests')
  expect(sampleSetOf('ENVIO-SET-GUIA.XML')).toBe('tests')
  expect(sampleSetOf('envio-set-exenta.xml')).toBe('tests')
  expect(sampleSetOf('envio-set-compra.xml')).toBe('tests')
  expect(sampleSetOf('envio-set-boleta.xml')).toBe('simulation')
  expect(sampleSetOf('envio-simulacion.xml')).toBe('simulation')
  expect(sampleSetOf('artefact:basic')).toBe('simulation')
})

test('a sample is named by type and folio, with _cedible on the transferable copy', () => {
  const doc = { type: 33, folio: '7' } as Parameters<typeof sampleName>[0]
  expect(sampleName(doc, false)).toBe('muestra_33_7.pdf')
  expect(sampleName(doc, true)).toBe('muestra_33_7_cedible.pdf')
})

test('renders every document of every envelope, with the transferable copies that apply', async () => {
  const result = await renderPrintedSamples({
    envelopes: [
      { name: 'envio-set-basico.xml', xml: basicSetXml },
      { name: 'envio-simulacion.xml', xml: receiptsXml },
    ],
    options,
    transferable: true,
  })
  expect(result.success).toBe(true)
  expect(result.failures).toEqual([])
  expect(result).toMatchObject({ documents: 4, tests: 4, simulation: 1 })
  expect(
    result.samples.map((sample) => [
      sample.name,
      sample.set,
      sample.source,
      sample.type,
      sample.folio,
      sample.transferable,
    ]),
  ).toEqual([
    ['muestra_33_7.pdf', 'tests', 'envio-set-basico.xml', 33, '7', false],
    ['muestra_33_7_cedible.pdf', 'tests', 'envio-set-basico.xml', 33, '7', true],
    ['muestra_61_5.pdf', 'tests', 'envio-set-basico.xml', 61, '5', false],
    ['muestra_56_8.pdf', 'tests', 'envio-set-basico.xml', 56, '8', false],
    ['muestra_39_11.pdf', 'simulation', 'envio-simulacion.xml', 39, '11', false],
  ])
  expect(await pdfText(result.samples[1].bytes)).toContain('CEDIBLE')
  expect(await pdfText(result.samples[0].bytes)).not.toContain('CEDIBLE')
})

test('without transferable only the plain copies come out', async () => {
  const result = await renderPrintedSamples({
    envelopes: [{ name: 'envio-set-basico.xml', xml: basicSetXml }],
    options,
  })
  expect(result.samples.map((sample) => sample.name)).toEqual([
    'muestra_33_7.pdf',
    'muestra_61_5.pdf',
    'muestra_56_8.pdf',
  ])
})

test('an envelope that cannot be parsed and a document that cannot be rendered are failures, and the rest goes on', async () => {
  const typeless = withoutTed(thirdPartyXml).replace(/<IdDoc>[\s\S]*?<\/IdDoc>/, '<IdDoc><Folio>1</Folio></IdDoc>')
  const result = await renderPrintedSamples({
    envelopes: [
      { name: 'broken.xml', xml: '<EnvioDTE><SetDTE>' },
      { name: 'typeless.xml', xml: typeless },
      { name: 'envio-set-exenta.xml', xml: thirdPartyXml },
    ],
    options,
    transferable: true,
  })
  expect(result.success).toBe(false)
  expect(result.failures).toEqual([
    { source: 'broken.xml', code: 'XML_PARSE_FAILED', reason: expect.stringContaining('XML could not be parsed') },
    {
      source: 'typeless.xml',
      type: 0,
      folio: '1',
      transferable: false,
      code: 'MISSING_FIELD',
      reason: 'Required field is missing (field=TipoDTE)',
    },
  ])
  expect(result).toMatchObject({ documents: 2, tests: 2, simulation: 0 })
  expect(result.samples.map((sample) => sample.name)).toEqual(['muestra_33_100.pdf', 'muestra_33_100_cedible.pdf'])
})

test('a folio that is not a run of digits never becomes a file name: the document is a failure, the rest goes on', async () => {
  const escaping = thirdPartyXml.replace('<Folio>100</Folio>', '<Folio>../../100</Folio>')
  const result = await renderPrintedSamples({
    envelopes: [
      { name: 'envio-set-exenta.xml', xml: escaping },
      { name: 'envio-set-basico.xml', xml: basicSetXml },
    ],
    options,
  })
  expect(result.success).toBe(false)
  expect(result.failures).toEqual([
    {
      source: 'envio-set-exenta.xml',
      type: 33,
      folio: '../../100',
      transferable: false,
      code: 'INVALID_FOLIO',
      reason: 'Folio must be a positive integer (field=Folio)',
    },
  ])
  expect(result.samples.map((sample) => sample.name)).toEqual([
    'muestra_33_7.pdf',
    'muestra_61_5.pdf',
    'muestra_56_8.pdf',
  ])
  expect(result).toMatchObject({ documents: 4, tests: 3, simulation: 0 })
})
