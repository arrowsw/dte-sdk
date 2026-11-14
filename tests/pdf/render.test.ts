import fc from 'fast-check'
import { PNG } from 'pngjs'
import { BOX, GAP, LINE } from '../../src/pdf/layout'
import { parsePrintableDocuments, type PrintableDocument, type PrintableTransport } from '../../src/pdf/parse'
import { needsTransferableCopy, renderPrintedSample } from '../../src/pdf/render'
import { FIXED_NOW } from '../support/fixtures'
import { decodeStampInPdf, pdfImages, pdfPage, pdfText } from '../support/pdf'
import { failure } from '../support/portal'
import {
  basicSetXml,
  creditNote,
  exemptInvoice,
  guide,
  guideWithTransport,
  invoice,
  invoiceWithTransport,
  receiptsXml,
  settlementXml,
  thirdPartyXml,
  withoutTed,
} from '../support/printed-fixtures'

// Issuing and rendering several documents per test is slow on instrumented CI runners, as in the books suites.
jest.setTimeout(30_000)

const first = (xml: string): PrintableDocument => parsePrintableDocuments(xml)[0]
const invoiceDoc = first(invoice.xml)
const render = (doc: PrintableDocument, options = {}) => renderPrintedSample(doc, { now: () => FIXED_NOW, ...options })

const smallPng = (): Uint8Array => {
  const png = new PNG({ width: 4, height: 4 })
  png.data.fill(200)
  return new Uint8Array(PNG.sync.write(png))
}

describe('an invoice', () => {
  let pdf: Uint8Array
  let text: string
  beforeAll(async () => {
    pdf = await render(invoiceDoc)
    text = await pdfText(pdf)
  })

  test('is one page, 21.5 cm wide, between 11 and 33 cm tall', async () => {
    const page = await pdfPage(pdf)
    expect(page.pages).toBe(1)
    expect(page.width).toBeCloseTo(609.45)
    expect(page.height).toBeGreaterThanOrEqual(311.81)
    expect(page.height).toBeLessThanOrEqual(935.43)
    expect(pdf.length).toBeLessThanOrEqual(500 * 1024)
  })

  test('prints the type box, the issuer, the date, the receiver, the detail and the totals', () => {
    expect(text).toContain('R.U.T.: 76.543.210-3')
    expect(text).toContain('FACTURA ELECTRÓNICA')
    expect(text).toContain('N° 7')
    expect(text).toContain('S.I.I. - ÑUÑOA')
    expect(text).toContain('Comercial Andina SpA')
    expect(text).toContain('Casa Matriz: Av. Los Aromos 1540, Ñuñoa')
    expect(text).toContain('Fecha Emisión: 2026-11-15')
    expect(text).toContain('Comercializadora Rapel Ltda')
    expect(text).toContain('12345678-5')
    expect(text).toContain('Detalle')
    expect(text).toContain('LIC-01')
    expect(text).toContain('Dcto: $20.000')
    expect(text).toContain('HR')
    expect(text).toContain('$100.000')
    expect(text).toContain('Descuento Global')
    expect(text).toContain('5%')
    expect(text).toContain('Monto Neto')
    expect(text).toContain('IVA (19%)')
    expect(text).toContain('Monto Total')
    expect(text).not.toContain('Sucursal:')
    expect(text).not.toContain('Referencias')
    expect(text).not.toContain('Tipo de Traslado')
    expect(text).not.toContain('Patente')
  })

  test('carries the stamp with its legends, and the stamp decodes to the signed TED', async () => {
    expect(text).toContain('Timbre Electrónico SII')
    expect(text).toContain('Res. Ex. SII N° 0 del 2026')
    expect(text).toContain('Verifique documento: www.sii.cl')
    expect(await pdfImages(pdf)).toHaveLength(1)
    expect(await decodeStampInPdf(pdf)).toBe(invoice.ted.xml)
  })

  test('has no acknowledgement box nor CEDIBLE mark on the plain copy', () => {
    expect(text).not.toContain('Acuse de Recibo')
    expect(text).not.toContain('CEDIBLE')
  })

  test('the transferable copy adds the acknowledgement box and the CEDIBLE mark', async () => {
    const copy = await pdfText(await render(invoiceDoc, { transferable: true }))
    expect(copy).toContain('Acuse de Recibo')
    expect(copy).toContain('Nombre: ____________________________')
    expect(copy).toContain('Recinto: __________________')
    expect(copy).toContain(
      'El acuse de recibo que se declara en este acto, de acuerdo a lo dispuesto en la letra b) del Art.',
    )
    expect(copy).toContain('CEDIBLE')
    expect(copy).not.toContain('CEDIBLE CON SU FACTURA')
  })

  test('office and resolution come from the options', async () => {
    const custom = await pdfText(
      await render(invoiceDoc, { siiOffice: 'S.I.I. - SANTIAGO ORIENTE', resolution: 'Res. Ex. SII N° 80 del 2014' }),
    )
    expect(custom).toContain('S.I.I. - SANTIAGO ORIENTE')
    expect(custom).toContain('Res. Ex. SII N° 80 del 2014')
    expect(custom).not.toContain('SANTIAGO CENTRO')
    expect(custom).not.toContain('S.I.I. - ÑUÑOA')
  })

  test("without an office the one of the issuer's commune is printed, and Santiago Centro when the table lacks it", async () => {
    const office = async (commune: string) =>
      (await pdfText(await render({ ...invoiceDoc, issuer: { ...invoiceDoc.issuer, commune } }))).match(
        /S\.I\.I\. - [^\n]+/,
      )?.[0]
    await expect(office('LAS CONDES')).resolves.toBe('S.I.I. - SANTIAGO ORIENTE')
    await expect(office('Chillán Viejo')).resolves.toBe('S.I.I. - CHILLÁN')
    await expect(office('Atlantis')).resolves.toBe('S.I.I. - SANTIAGO CENTRO')
    await expect(office('')).resolves.toBe('S.I.I. - SANTIAGO CENTRO')
  })

  test('the default resolution takes the year from the system clock when no clock is given', async () => {
    const year = new Date().getFullYear()
    expect(await pdfText(await renderPrintedSample(invoiceDoc))).toContain(`Res. Ex. SII N° 0 del ${year}`)
  })
})

describe('the other types', () => {
  test('a dispatch guide prints the transfer reason; a sale gets CEDIBLE CON SU FACTURA', async () => {
    const sale = await pdfText(await render(first(guide(1).xml), { transferable: true }))
    expect(sale).toContain('GUÍA DE DESPACHO\nELECTRÓNICA')
    expect(sale).toContain('Tipo de Traslado: 1 - Operación constituye venta')
    expect(sale).toContain('CEDIBLE CON SU FACTURA')
    expect(sale).toContain('Acuse de Recibo')
    const internal = await pdfText(await render(first(guide(5).xml), { transferable: true }))
    expect(internal).toContain('Tipo de Traslado: 5 - Traslados internos')
    expect(internal).not.toContain('CEDIBLE')
    expect(internal).not.toContain('Acuse de Recibo')
  })

  test('a credit note prints its references and never a transferable copy', async () => {
    const note = await pdfText(await render(first(creditNote.xml), { transferable: true }))
    expect(note).toContain('NOTA DE CRÉDITO')
    expect(note).toContain('Referencias a otros documentos')
    expect(note).toContain('Razón Referencia')
    expect(note).toContain('Anula factura')
    expect(note).toContain('Tipo SET')
    expect(note).toContain('CASO-1')
    expect(note).not.toContain('CEDIBLE')
    expect(note).not.toContain('Acuse de Recibo')
  })

  test('an exempt invoice prints only the exempt amount and the total', async () => {
    const exempt = await pdfText(await render(first(exemptInvoice.xml)))
    expect(exempt).toContain('FACTURA NO AFECTA O\nEXENTA ELECTRÓNICA') // the type name wraps inside the box
    expect(exempt).toContain('Monto Exento')
    expect(exempt).toContain('Monto Total')
    expect(exempt).not.toContain('Monto Neto')
    expect(exempt).not.toContain('IVA (')
  })

  test('a receipt prints with the same layout', async () => {
    const receipt = await pdfText(await render(first(receiptsXml)))
    expect(receipt).toContain('BOLETA ELECTRÓNICA')
    // A receipt names its issuer's line of business `GiroEmisor`.
    expect(receipt).toContain('Desarrollo de software')
    expect(receipt).toContain('Café')
    expect(receipt).toContain('Monto Total')
  })

  test('third-party shapes: branch, gross labels, a surcharge, an amount discount and a non-DTE reference', async () => {
    const third = await pdfText(await render(first(thirdPartyXml)))
    expect(third).toContain('Sucursal: Casa 2')
    expect(third).toContain('Distribuidora Lican SpA')
    expect(third).toContain('P.Unit. c/IVA')
    expect(third).toContain('Valor c/IVA')
    expect(third).toContain('Recargo Global')
    expect(third).toContain('$100')
    expect(third).toContain('Dcto: $100')
    expect(third).toContain('Tipo 801')
    expect(third).toContain('PAR')
    expect(third).toContain('Óptica Muñoz Ltda')
  })

  test('a type outside the catalog prints as DTE {type} and a settlement invoice under Liquidacion prints', async () => {
    const unknown = await pdfText(
      await render(first(thirdPartyXml.replace('<TipoDTE>33</TipoDTE>', '<TipoDTE>110</TipoDTE>'))),
    )
    expect(unknown).toContain('DTE 110')
    const settlement = await pdfText(await render(first(settlementXml)))
    expect(settlement).toContain('LIQUIDACIÓN FACTURA')
    expect(settlement).toContain('Comisionista')
  })
})

describe('the transport area', () => {
  const guideDoc = first(guideWithTransport.xml)
  const heightOf = async (doc: PrintableDocument): Promise<number> => (await pdfPage(await render(doc))).height
  const boxOf = (rows: number): number => BOX.padY * 2 + LINE.small * rows + GAP.tiny * (rows - 1)

  test("a guide prints every field of its transport under the transfer type, in the Formato's order", async () => {
    const area = [
      ['Patente: ', 'ABCD12'],
      ['Patente Carro: ', 'JK1234'],
      ['RUT Transportista: ', '7654321-6'],
      ['Chofer: ', 'Juan Pérez Soto'],
      ['RUT Chofer: ', '11111111-1'],
      ['Dirección Destino: ', 'Camino a Melipilla 9870, Bodega 4'],
      ['Comuna Destino: ', 'Maipú'],
      ['Ciudad Destino: ', 'Santiago'],
      ['Fecha de Salida: ', '2026-11-15'],
      ['Hora de Salida: ', '08:30:00'],
      ['Fecha de Llegada: ', '2026-11-16'],
    ]
    expect(await pdfText(await render(guideDoc))).toContain(
      `Tipo de Traslado: 1 - Operación constituye venta\n${area.flat().join('\n')}\nDetalle`,
    )
  })

  test('an invoice that moves goods prints what its transport carries and nothing else of the area', async () => {
    const text = await pdfText(await render(first(invoiceWithTransport.xml)))
    expect(text).toContain(
      'Giro: \nComercio al por menor\nPatente: \nWXYZ98\nDirección Destino: \nPasaje Los Olmos 88\nFecha de Salida: \n2026-11-15\nDetalle',
    )
    for (const absent of ['Tipo de Traslado', 'Patente Carro', 'Transportista', 'Chofer', 'Comuna Destino', 'Llegada'])
      expect(text).not.toContain(absent)
  })

  test('the page grows by the box of the area and its gap, one line per group', async () => {
    const without = await heightOf({ ...guideDoc, transport: undefined })
    expect((await heightOf(guideDoc)) - without).toBe(boxOf(4) + GAP.section)
  })

  test('a group too wide for one line flows onto the next, and the box grows with it', async () => {
    const wide = {
      ...guideDoc,
      transport: {
        ...guideDoc.transport!,
        destinationAddress: 'AVENIDA LIBERTADOR BERNARDO OHIGGINS 12345 DEPARTAMENTO 1201 TORRE B',
        destinationCommune: 'PEDRO AGUIRRE CERDA',
        destinationCity: 'SANTIAGO DE CHILE',
      },
    }
    expect((await heightOf(wide)) - (await heightOf(guideDoc))).toBe(boxOf(5) - boxOf(4))
    expect(await pdfText(await render(wide))).toContain('PEDRO AGUIRRE CERDA\nCiudad Destino: \nSANTIAGO DE CHILE')
  })

  test('a transport with every field empty prints nothing', async () => {
    const empty = Object.fromEntries(Object.keys(guideDoc.transport!).map((key) => [key, '']))
    const doc = { ...guideDoc, transport: empty as unknown as PrintableTransport }
    expect(await heightOf(doc)).toBe(await heightOf({ ...guideDoc, transport: undefined }))
    expect(await pdfText(await render(doc))).not.toContain('Patente')
  })
})

describe('page height', () => {
  test('a document without TED has no image and no stamp legends', async () => {
    const pdf = await render(first(withoutTed(thirdPartyXml)))
    expect(await pdfImages(pdf)).toHaveLength(0)
    expect(await pdfText(pdf)).not.toContain('Timbre Electrónico SII')
  })

  test('a tiny document gets the minimum height', async () => {
    const tiny = { ...invoiceDoc, tedXml: '', items: [], references: [], globalAdjustments: [], totals: {} }
    expect((await pdfPage(await render(tiny))).height).toBeCloseTo(311.81)
  })

  test('a long detail stops at the maximum height', async () => {
    const items = Array.from({ length: 80 }, (_, index) => ({
      code: '',
      name: `Producto ${index + 1}`,
      quantity: 1,
      unitPrice: 1000,
      amount: 1000,
    }))
    expect((await pdfPage(await render({ ...invoiceDoc, items }))).height).toBeCloseTo(935.43)
  })

  test('a word wider than the column is split by characters and the row grows', async () => {
    const short = await pdfPage(await render({ ...invoiceDoc, tedXml: '' }))
    const long = await pdfPage(
      await render({ ...invoiceDoc, tedXml: '', items: [{ ...invoiceDoc.items[0], name: 'X'.repeat(160) }] }),
    )
    expect(long.height).toBeGreaterThan(short.height)
  })

  test('stays within the bounds for any detail', async () => {
    const letters = 'abcdefghijklmnopqrstuvwxyz ÁÉÍÓÚñ'.split('')
    const name = fc.array(fc.constantFrom(...letters), { minLength: 1, maxLength: 120 }).map((chars) => chars.join(''))
    await fc.assert(
      fc.asyncProperty(fc.array(name, { minLength: 1, maxLength: 40 }), async (names) => {
        const items = names.map((itemName, index) => ({ code: '', name: itemName, quantity: index + 1, amount: 100 }))
        const page = await pdfPage(await render({ ...invoiceDoc, tedXml: '', items }))
        expect(page.pages).toBe(1)
        expect(page.height).toBeGreaterThanOrEqual(311.81)
        expect(page.height).toBeLessThanOrEqual(935.43)
      }),
      { numRuns: 8 },
    )
  })
})

describe('the logo', () => {
  test('a PNG logo is embedded next to the stamp', async () => {
    expect(await pdfImages(await render(invoiceDoc, { logo: { bytes: smallPng(), format: 'png' } }))).toHaveLength(2)
  })

  test('a JPEG logo is embedded as JPEG', async () => {
    // The smallest valid JPEG: a 1×1 grey pixel.
    const jpeg = Buffer.from(
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
      'base64',
    )
    const images = await pdfImages(await render(invoiceDoc, { logo: { bytes: new Uint8Array(jpeg), format: 'jpeg' } }))
    expect(images).toHaveLength(2)
    expect(images.some((image) => image.pixels === null)).toBe(true)
  })

  test('bytes the library cannot embed are ignored', async () => {
    const pdf = await render(invoiceDoc, { logo: { bytes: new Uint8Array([1, 2, 3]), format: 'png' } })
    expect(await pdfImages(pdf)).toHaveLength(1)
  })
})

describe('needsTransferableCopy', () => {
  test.each([
    [33, null, true],
    [34, null, true],
    [43, null, true],
    [46, null, true],
    [52, null, true],
    [52, 1, true],
    [52, 9, true],
    [52, 5, false],
    [52, 3, false],
    [56, null, false],
    [61, null, false],
    [39, null, false],
    [110, null, false],
    [0, null, false],
  ])('type %s with transfer reason %s → %s', (type, transferReason, expected) => {
    expect(needsTransferableCopy({ ...invoiceDoc, type, transferReason })).toBe(expected)
  })
})

describe('errors', () => {
  test('a document without type is MISSING_FIELD', async () => {
    const error = await failure(render({ ...invoiceDoc, type: 0 }))
    expect(error.code).toBe('MISSING_FIELD')
    expect(error.details).toEqual({ field: 'TipoDTE' })
  })

  test('a character outside WinAnsi is PDF_RENDER_FAILED with the type and folio', async () => {
    const error = await failure(render({ ...invoiceDoc, items: [{ ...invoiceDoc.items[0], name: '你好' }] }))
    expect(error.code).toBe('PDF_RENDER_FAILED')
    expect(error.details).toMatchObject({ type: 33, folio: '7' })
    expect(typeof error.details.reason).toBe('string')
  })

  test('a TED with a code point above U+00FF keeps its own code', async () => {
    const error = await failure(render({ ...invoiceDoc, tedXml: invoiceDoc.tedXml.replace('<RSR>', '<RSR>€') }))
    expect(error.code).toBe('ENCODING_UNSUPPORTED_CHAR')
  })

  test('a loader that fails propagates its error', async () => {
    await expect(
      renderPrintedSample(invoiceDoc, {}, async () => {
        throw new Error('no libraries')
      }),
    ).rejects.toThrow('no libraries')
  })

  test.each(['pdf-lib', 'bwip-js'])('when %s cannot be loaded it is DEPENDENCY_UNAVAILABLE', async (module) => {
    jest.doMock(module, () => {
      throw new Error('not installed')
    })
    try {
      await jest.isolateModulesAsync(async () => {
        const { loadPdfModules: load } = await import('../../src/pdf/render')
        const error = await failure(load())
        expect(error.code).toBe('DEPENDENCY_UNAVAILABLE')
        expect(error.details).toEqual({ module, reason: 'not installed' })
      })
    } finally {
      jest.dontMock(module)
    }
  })
})

test('every sample of the basic set weighs at most 500 KB', async () => {
  for (const doc of parsePrintableDocuments(basicSetXml)) {
    expect((await render(doc, { transferable: true })).length).toBeLessThanOrEqual(500 * 1024)
  }
})

describe('sparse data', () => {
  test('empty names, items without amounts, a percent-only discount and an adjustment without value still print', async () => {
    const sparse: PrintableDocument = {
      ...invoiceDoc,
      tedXml: '',
      issuer: { ...invoiceDoc.issuer, commune: '' },
      items: [
        { code: '', name: '' },
        { code: 'A', name: 'Con descuento', discountPercent: 15 },
      ],
      globalAdjustments: [{ kind: 'D', valueType: '%' }],
      references: [{ documentType: '', folio: 'X-1', date: '', reason: '' }],
      totals: { net: 100, exempt: 50, vat: 19, total: 169 },
    }
    const text = await pdfText(await render(sparse))
    expect(text).toContain('Casa Matriz: Av. Los Aromos 1540\n')
    expect(text).toContain('Dcto: 15%')
    expect(text).toContain('Descuento Global')
    expect(text).toContain('Monto Exento')
    expect(text).toContain('$50')
    expect(text).toContain('X-1')
  })

  test('an exempt invoice without amounts prints no total rows, and an issuer RUT that is not valid prints as it came', async () => {
    const text = await pdfText(
      await render({
        ...first(exemptInvoice.xml),
        tedXml: '',
        totals: {},
        issuer: { ...invoiceDoc.issuer, rut: 'sin-rut' },
      }),
    )
    expect(text).not.toContain('Monto')
    expect(text).toContain('R.U.T.: sin-rut')
  })

  test('a transfer reason outside the table prints its number alone', async () => {
    const text = await pdfText(await render({ ...first(guide(1).xml), transferReason: 12 }))
    expect(text).toContain('Tipo de Traslado: 12 - ')
  })

  test('a description wider than two columns is split by characters more than once', async () => {
    const wide = { ...invoiceDoc, tedXml: '', items: [{ code: '', name: 'W'.repeat(400) }] }
    expect((await pdfPage(await render(wide))).height).toBeGreaterThan(400)
  })
})
