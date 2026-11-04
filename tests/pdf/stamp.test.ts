import { renderTedBarcode } from '../../src/pdf/stamp'
import { decodePdf417Png, pngLuminance } from '../support/pdf417'
import { failure } from '../support/portal'
import { invoice } from '../support/printed-fixtures'

const ted = invoice.ted.xml

test('the stamp decodes to the exact TED, including its signature', async () => {
  const png = await renderTedBarcode(ted)
  expect(decodePdf417Png(png)).toBe(ted)
})

test('an accented name reaches the symbol as the single ISO-8859-1 bytes that were signed', async () => {
  const accented = ted.replace(/<RSR>[^<]*<\/RSR>/, '<RSR>SEÑORA MUÑOZ ÓPTICA</RSR>')
  expect(decodePdf417Png(await renderTedBarcode(accented))).toBe(accented)
})

test('the symbol keeps the field geometry: 3 px modules, 6 modules of quiet zone, rows as tall as modules', async () => {
  const { width, height } = pngLuminance(await renderTedBarcode(ted))
  expect((width - 36) % 3).toBe(0)
  expect((height - 36) % 3).toBe(0)
  const rows = (height - 36) / 3
  expect(rows).toBeGreaterThanOrEqual(3)
  expect(rows).toBeLessThanOrEqual(90)
  expect(width).toBeGreaterThan(height * 4)
})

test('without a <TED it is MISSING_FIELD', async () => {
  const error = await failure(renderTedBarcode('<DD></DD>'))
  expect(error.code).toBe('MISSING_FIELD')
  expect(error.details).toEqual({ field: 'TED' })
})

test('a code point above U+00FF cannot be a byte: ENCODING_UNSUPPORTED_CHAR', async () => {
  const error = await failure(renderTedBarcode(ted.replace('<RSR>', '<RSR>€')))
  expect(error.code).toBe('ENCODING_UNSUPPORTED_CHAR')
})

test('a loader for tests replaces the library', async () => {
  const calls: unknown[] = []
  const png = await renderTedBarcode(ted, async () => ({
    toBuffer: async (options) => {
      calls.push(options)
      return new Uint8Array([1, 2, 3])
    },
  }))
  expect(png).toEqual(new Uint8Array([1, 2, 3]))
  expect(calls).toEqual([
    { bcid: 'pdf417', text: ted, scale: 3, height: 10, padding: 6, includetext: false, binarytext: true },
  ])
})

test('when the library cannot be loaded it is DEPENDENCY_UNAVAILABLE', async () => {
  jest.doMock('bwip-js', () => {
    throw new Error('not installed')
  })
  try {
    await jest.isolateModulesAsync(async () => {
      const { loadBarcodeModule: load } = await import('../../src/pdf/stamp')
      const error = await failure(load())
      expect(error.code).toBe('DEPENDENCY_UNAVAILABLE')
      expect(error.details).toEqual({ module: 'bwip-js', reason: 'not installed' })
    })
  } finally {
    jest.dontMock('bwip-js')
  }
})
