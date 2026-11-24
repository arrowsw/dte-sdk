import { ROLL, STAMP, stampSize } from '../../src/pdf/layout'
import { byteCompactionCodewords, renderTedBarcode, type BarcodeModule } from '../../src/pdf/stamp'
import { decodePdf417Png, pdf417ErrorCorrectionLevel, pngLuminance } from '../support/pdf417'
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

// What the library is asked for, with the real one doing the work.
const recording = async (): Promise<{ load: () => Promise<BarcodeModule>; calls: Record<string, unknown>[] }> => {
  const real = (await import('bwip-js')) as unknown as BarcodeModule
  const calls: Record<string, unknown>[] = []
  const toBuffer: BarcodeModule['toBuffer'] = (options) => {
    calls.push(options)
    return real.toBuffer(options)
  }
  return { load: async () => ({ toBuffer }), calls }
}

describe('the error correction level', () => {
  test('is 5 on the stamp of a document', async () => {
    expect(pdf417ErrorCorrectionLevel(await renderTedBarcode(ted))).toBe(5)
  })

  test('is 5 on a symbol short enough for the library to pick a lower one, and on one with accents', async () => {
    expect(pdf417ErrorCorrectionLevel(await renderTedBarcode('<TED>corto</TED>'))).toBe(5)
    expect(pdf417ErrorCorrectionLevel(await renderTedBarcode('<TED>Ñuñoa</TED>'))).toBe(5)
  })
})

describe('a stamp with a byte above ASCII', () => {
  // The example of the symbology's standard: "alcool" in byte compaction is these five codewords.
  const ALCOOL = [163, 238, 432, 766, 244]
  const bytes = (text: string): Uint8Array => Uint8Array.from(text, (char) => char.charCodeAt(0))

  test('six bytes are five codewords in base 900, and the latch says whether every group is whole', () => {
    expect(byteCompactionCodewords(bytes('alcool'))).toEqual([924, ...ALCOOL])
    expect(byteCompactionCodewords(bytes('alcoolñ!'))).toEqual([901, ...ALCOOL, 0xf1, 0x21])
    expect(byteCompactionCodewords(bytes('ñ'))).toEqual([901, 0xf1])
    expect(byteCompactionCodewords(new Uint8Array([255, 255, 255, 255, 255, 255]))).toEqual([
      924, 429, 11, 71, 222, 855,
    ])
  })

  test('is written in bytes alone, and reads back as the text that was signed', async () => {
    const accented = ted
      .replace(/<RSR>[^<]*<\/RSR>/, '<RSR>JOSÉ ÑUÑEZ PÉREZ</RSR>')
      .replace(/<IT1>[^<]*</, '<IT1>Cañería<')
    const { load, calls } = await recording()
    expect(decodePdf417Png(await renderTedBarcode(accented, load))).toBe(accented)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ raw: true, eclevel: 5, fixedeclevel: true })
    const codewords = String(calls[0].text)
    expect(codewords).toMatch(/^\^(901|924)/)
    expect(codewords).toMatch(/^(\^\d{3})+$/)
  })

  test('a stamp of plain ASCII is written in bytes alone too, the compaction the instructions name', async () => {
    const { load, calls } = await recording()
    expect(decodePdf417Png(await renderTedBarcode(ted, load))).toBe(ted)
    expect(calls[0]).toMatchObject({ raw: true, eclevel: 5, fixedeclevel: true })
    expect(String(calls[0].text)).toMatch(/^\^(901|924)(\^\d{3})+$/)
  })

  test('one too long to fit in bytes keeps the compaction the library picks, and still reads back', async () => {
    // 1 035 bytes are 864 codewords in bytes alone (the latch, 172 groups of five and three bytes over), one more than a
    // symbol holds beside its error correction; the 1 034 bytes below are 863, and fit.
    const long = `<TED>ñ${'A'.repeat(1023)}</TED>`
    const { load, calls } = await recording()
    expect(decodePdf417Png(await renderTedBarcode(long, load))).toBe(long)
    expect(calls[0]).not.toHaveProperty('raw')
    const fits = `<TED>ñ${'A'.repeat(1022)}</TED>`
    await renderTedBarcode(fits, load)
    expect(calls[1]).toMatchObject({ raw: true })
  })
})

// The geometry of section A.2.5 of the SII's instructions: rows three modules high, a module of 6.7 mils or more,
// 300 DPI or more.
describe('the geometry of the symbol', () => {
  const PIXELS = 4
  const QUIET = 6 * PIXELS
  const MILS_PER_POINT = 1000 / 72
  // The runs of equal pixel rows between the quiet zones: one run for each row of the symbol.
  const rowHeights = ({ width, height, luminance }: ReturnType<typeof pngLuminance>): readonly number[] => {
    const row = (y: number) => luminance.slice(y * width, (y + 1) * width).join()
    const heights: number[] = []
    for (let y = QUIET; y < height - QUIET; y += 1) {
      if (y > QUIET && row(y) === row(y - 1)) heights[heights.length - 1] += 1
      else heights.push(1)
    }
    return heights
  }

  test('4 px modules, 6 modules of quiet zone, 387 modules across and rows three modules high', async () => {
    const image = pngLuminance(await renderTedBarcode(ted))
    expect(image.width).toBe(387 * PIXELS)
    const rows = rowHeights(image)
    expect(rows.length).toBeGreaterThanOrEqual(3)
    expect(rows.length).toBeLessThanOrEqual(90)
    expect(new Set(rows)).toEqual(new Set([3 * PIXELS]))
    expect(image.height).toBe(rows.length * 3 * PIXELS + 2 * QUIET)
  })

  test.each([
    ['the sheet', STAMP.maxWidth],
    ['the 80 mm roll', ROLL.contentWidth],
  ])('on %s it is drawn by one factor, with a module over 6.7 mils and over 300 DPI', async (_where, maxWidth) => {
    const image = pngLuminance(await renderTedBarcode(ted))
    const drawn = stampSize(image, maxWidth)
    expect(drawn.width).toBeCloseTo(maxWidth)
    expect(drawn.height / drawn.width).toBeCloseTo(image.height / image.width)
    expect(drawn.height).toBeGreaterThanOrEqual(STAMP.minHeight)
    expect(drawn.height).toBeLessThanOrEqual(STAMP.maxHeight)
    expect((drawn.width / (image.width / PIXELS)) * MILS_PER_POINT).toBeGreaterThanOrEqual(6.7)
    expect(image.width / (drawn.width / 72)).toBeGreaterThanOrEqual(300)
  })

  test('a symbol too high for the stamp box is brought down on both sides', () => {
    const drawn = stampSize({ width: 1548, height: 1200 })
    expect(drawn.height).toBeCloseTo(STAMP.maxHeight)
    expect(drawn.width).toBeCloseTo((STAMP.maxHeight * 1548) / 1200)
  })
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
    {
      bcid: 'pdf417',
      text: expect.stringMatching(/^(\^\d{3})+$/),
      raw: true,
      scale: 4,
      columns: 18,
      padding: 6,
      includetext: false,
      binarytext: true,
      eclevel: 5,
      fixedeclevel: true,
    },
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
