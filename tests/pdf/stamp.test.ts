import { STAMP, stampSize } from '../../src/pdf/layout'
import { byteCompactionCodewords, loadBarcodeModule, renderTedBarcode, type BarcodeModule } from '../../src/pdf/stamp'
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

  test('a stamp of plain ASCII keeps the compaction the library picks', async () => {
    const { load, calls } = await recording()
    await renderTedBarcode(ted, load)
    expect(calls[0]).toMatchObject({ text: ted, eclevel: 5, fixedeclevel: true })
    expect(calls[0]).not.toHaveProperty('raw')
  })

  test('one too long to fit in bytes keeps it too, and still reads back', async () => {
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
    {
      bcid: 'pdf417',
      text: ted,
      scale: 3,
      height: 10,
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

// The symbol of section A.2.5 of the SII's instructions, the stamp of the sheet: rows three modules high, a module of
// 6.7 mils or more, 300 DPI or more.
describe('the geometry of the instructions', () => {
  const PIXELS = 4
  const QUIET = 6 * PIXELS
  const MILS_PER_POINT = 1000 / 72
  const instructions = { unstable_geometry: 'instructions' } as const
  const drawn = (text: string, load = loadBarcodeModule) => renderTedBarcode(text, load, instructions)
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
    const image = pngLuminance(await drawn(ted))
    expect(image.width).toBe(387 * PIXELS)
    const rows = rowHeights(image)
    expect(rows.length).toBeGreaterThanOrEqual(3)
    expect(rows.length).toBeLessThanOrEqual(90)
    expect(new Set(rows)).toEqual(new Set([3 * PIXELS]))
    expect(image.height).toBe(rows.length * 3 * PIXELS + 2 * QUIET)
    // The default's rows are one module high, and its symbol is the one of every release so far.
    const usual = pngLuminance(await renderTedBarcode(ted))
    expect(usual.width).not.toBe(image.width)
  })

  test('it reads back as the text that was signed, at level 5, with and without accents', async () => {
    const accented = '<TED><DD><RSR>Peña y Muñoz</RSR></DD></TED>'
    for (const text of [ted, accented]) {
      const png = await drawn(text)
      expect(decodePdf417Png(png)).toBe(text)
      expect(pdf417ErrorCorrectionLevel(png)).toBe(5)
    }
  })

  test('a stamp of plain ASCII is written in bytes alone too, the compaction the instructions name', async () => {
    const { load, calls } = await recording()
    await drawn(ted, load)
    expect(calls[0]).toMatchObject({ raw: true, eclevel: 5, fixedeclevel: true, scale: 4, columns: 18, padding: 6 })
    expect(calls[0]).not.toHaveProperty('height')
    expect(String(calls[0].text)).toMatch(/^\^(901|924)(\^\d{3})+$/)
    // The default hands the text over as it is, with its own scale and height.
    await renderTedBarcode(ted, load)
    expect(calls[1]).toMatchObject({ scale: 3, height: 10, text: ted })
    expect(calls[1]).not.toHaveProperty('columns')
  })

  test('one too long to fit in bytes keeps the compaction the library picks, and still reads back', async () => {
    // 1 035 bytes are 864 codewords in bytes alone, one more than a symbol holds beside its error correction.
    const long = `<TED>${'A'.repeat(1024)}</TED>`
    const { load, calls } = await recording()
    expect(decodePdf417Png(await drawn(long, load))).toBe(long)
    expect(calls[0]).not.toHaveProperty('raw')
    await drawn(`<TED>${'A'.repeat(1023)}</TED>`, load)
    expect(calls[1]).toMatchObject({ raw: true })
  })

  test('on the sheet it is drawn by one factor, with a module over 6.7 mils and over 300 DPI', async () => {
    const image = pngLuminance(await drawn(ted))
    const size = stampSize(image)
    expect(size.width).toBeCloseTo(STAMP.maxWidth)
    expect(size.height / size.width).toBeCloseTo(image.height / image.width)
    expect(size.height).toBeLessThanOrEqual(STAMP.maxHeight)
    expect((size.width / (image.width / PIXELS)) * MILS_PER_POINT).toBeGreaterThanOrEqual(6.7)
    expect(image.width / (size.width / 72)).toBeGreaterThanOrEqual(300)
  })

  test('a symbol too high for the stamp box is brought down on both sides', () => {
    const size = stampSize({ width: 1548, height: 1200 })
    expect(size.height).toBeCloseTo(STAMP.maxHeight)
    expect(size.width).toBeCloseTo((STAMP.maxHeight * 1548) / 1200)
  })

  test("named `'compact'`, the stamp is the one drawn when no geometry is named", async () => {
    const named = await renderTedBarcode(ted, loadBarcodeModule, { unstable_geometry: 'compact' })
    expect(named).toEqual(await renderTedBarcode(ted))
    expect(named).not.toEqual(await drawn(ted))
  })

  test('a geometry that is not one is refused before the library loads', async () => {
    const load = jest.fn()
    const error = await failure(renderTedBarcode(ted, load, { unstable_geometry: 'tall' as 'instructions' }))
    expect(error.code).toBe('INVALID_OPTION')
    expect(error.details).toEqual({ field: 'unstable_geometry' })
    expect(load).not.toHaveBeenCalled()
  })
})
