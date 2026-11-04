import fc from 'fast-check'
import {
  bookDocumentTypeOf,
  dispatchTypeOf,
  documentTypeOf,
  parseTestSetText,
  referenceCodeOf,
  testSetKindOf,
  transferReasonOf,
} from '../../src/certification/set-text'
import {
  ATTENTION,
  BASIC_SET_TEXT,
  EXEMPT_PURCHASE_BOOK_SET_TEXT,
  EXEMPT_SET_TEXT,
  EXPORT_SET_TEXT,
  FULL_SET_TEXT,
  GUIDE_SET_TEXT,
  PURCHASE_BOOK_SET_TEXT,
  purchaseSetText,
} from '../support/test-set-samples'

describe('the whole download', () => {
  const sets = parseTestSetText(FULL_SET_TEXT)

  test('yields every set in order, with its kind and attention number, ignoring junk', () => {
    expect(sets.map((set) => set.kind)).toEqual([
      'basic',
      'guide',
      'exempt',
      'purchase',
      'salesBook',
      'purchaseBook',
      'exemptPurchaseBook',
      'export',
    ])
    expect(sets.every((set) => set.attentionNumber === ATTENTION)).toBe(true)
    expect(sets[0].name).toBe('BASICO')
    expect(sets[3].name).toBe('CASO GENERAL FACTURA COMPRA')
  })

  test('a corrupted accent in ATENCION still opens the set', () => {
    const corrupted = BASIC_SET_TEXT.replace('NUMERO DE ATENCION', 'NUMERO DE ATENCI�N')
    expect(parseTestSetText(corrupted)[0]).toMatchObject({ kind: 'basic', attentionNumber: ATTENTION })
  })
})

describe('the basic set', () => {
  const [set] = parseTestSetText(BASIC_SET_TEXT)
  const byNumber = (number: number) => set.cases.find((item) => item.number === number)!

  test('has eight cases with ids, document texts and types', () => {
    expect(set.cases).toHaveLength(8)
    expect(set.cases.map((item) => item.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => `${ATTENTION}-${n}`))
    expect(set.cases.map((item) => item.documentType)).toEqual([33, 33, 33, 61, 61, 61, 56, 56])
    expect(byNumber(1)).toMatchObject({ setId: ATTENTION, documentText: 'FACTURA ELECTRONICA' })
  })

  test('reads three-part rows, discount rows, unit rows and the global discount', () => {
    expect(byNumber(1).items).toEqual([
      { name: 'Cajon de manzanas', quantity: 130, unitPrice: 2800 },
      { name: 'Relleno de pollo', quantity: 90, unitPrice: 1700 },
    ])
    expect(byNumber(2).items).toEqual([
      { name: 'Pintura blanca', quantity: 40, unitPrice: 5000, discount: '14%' },
      { name: 'Servicio exento de instalacion', quantity: 1, unitPrice: 20000 },
    ])
    expect(byNumber(2).globalDiscountPercent).toBe(7)
    expect(byNumber(3).items).toEqual([{ name: 'Cemento', quantity: 10, unit: 'SACO', unitPrice: 8000 }])
    expect(byNumber(1).globalDiscountPercent).toBeNull()
  })

  test('reads references, reasons, quantity-only rows and MODIFICA MONTO rows', () => {
    expect(byNumber(4)).toMatchObject({
      referenceText: `CASO ${ATTENTION}-1`,
      referencedCase: `${ATTENTION}-1`,
      reasonText: 'DEVOLUCION DE MERCADERIAS',
      items: [{ name: 'Cajon de manzanas', quantity: 62 }],
    })
    expect(byNumber(5)).toMatchObject({
      referencedCase: `${ATTENTION}-2`,
      reasonText: 'CORRIGE GIRO DEL RECEPTOR',
      items: [],
    })
    expect(byNumber(7)).toMatchObject({
      referencedCase: `${ATTENTION}-6`,
      reasonText: 'ANULA NOTA DE CREDITO ELECTRONICA',
    })
    expect(byNumber(8).items).toEqual([{ name: 'Cajon de manzanas', quantity: 1, unitPrice: 3100 }])
  })

  test('a reference without a CASO keeps its text and no referenced case', () => {
    const [set] = parseTestSetText(
      `SET BASICO - NUMERO DE ATENCION: 1\nCASO 1-1\nDOCUMENTO NOTA DE CREDITO\nREFERENCIA FACTURA 55\n`,
    )
    expect(set.cases[0]).toMatchObject({ referenceText: 'FACTURA 55', referencedCase: null })
  })

  test('keeps the raw lines of a case, including blank ones and headers', () => {
    expect(byNumber(1).raw).toEqual([
      'DOCUMENTO                        FACTURA ELECTRONICA',
      '',
      'ITEM                             CANTIDAD   PRECIO UNITARIO',
      'Cajon de manzanas                130        2800',
      'Relleno de pollo                 90         1700',
      '',
    ])
  })
})

describe('the other case sets', () => {
  test('exempt: 34 and notes, with no price rows kept as quantity rows', () => {
    const [set] = parseTestSetText(EXEMPT_SET_TEXT)
    expect(set.kind).toBe('exempt')
    expect(set.cases.map((item) => item.documentType)).toEqual([34, 61, 56, 61])
    expect(set.cases[0].items).toEqual([
      { name: 'Arriendo de oficina', quantity: 1, unitPrice: 450000 },
      { name: 'Asesoria tributaria', quantity: 2, unitPrice: 80000 },
    ])
    expect(set.cases[3].items).toEqual([{ name: 'Asesoria tributaria', quantity: 1, unitPrice: 75000 }])
  })

  test('guide: motive and transfer-by lines, with and without prices', () => {
    const [set] = parseTestSetText(GUIDE_SET_TEXT)
    expect(set.kind).toBe('guide')
    expect(set.cases.map((item) => item.documentType)).toEqual([52, 52, 52])
    expect(set.cases[0]).toMatchObject({
      motive: 'VENTA',
      transferBy: 'EMISOR DEL DOCUMENTO AL LOCAL DEL CLIENTE',
      items: [{ name: 'Cajon de manzanas', quantity: 25, unitPrice: 2800 }],
    })
    expect(set.cases[1]).toMatchObject({
      motive: 'TRASLADO DE MATERIALES ENTRE BODEGAS DE LA EMPRESA',
      transferBy: 'CLIENTE',
      items: [{ name: 'Relleno de pollo', quantity: 40 }],
    })
    expect(set.cases[2]).toMatchObject({ motive: 'VENTA', transferBy: '' })
  })

  test.each(['SET FACTURA DE COMPRA', 'SET CASO GENERAL FACTURA COMPRA'])('purchase under the header %s', (header) => {
    const [set] = parseTestSetText(purchaseSetText(header))
    expect(set.kind).toBe('purchase')
    expect(set.cases.map((item) => item.documentType)).toEqual([46, 61, 56])
    expect(set.cases[1].items).toEqual([{ name: 'Chatarra de fierro', quantity: 100 }])
  })

  test('export: the export-only lines are kept by label and the set is typed export', () => {
    const [set] = parseTestSetText(EXPORT_SET_TEXT)
    expect(set.kind).toBe('export')
    expect(set.cases[0]).toMatchObject({
      documentType: 110,
      currency: 'DOLAR USA',
      exportFields: {
        'FORMA DE PAGO EXPORTACION': 'ANTICIPO',
        'MODALIDAD DE VENTA': 'A FIRME',
        'CLAUSULA DE VENTA': 'CIF',
        'TOTAL CLAUSULA DE VENTA': '1500.50',
        'VIA DE TRANSPORTE': 'MARITIMA',
        'PUERTO DE EMBARQUE': 'VALPARAISO',
        'PUERTO DE DESEMBARQUE': 'ROTTERDAM',
        'TIPO DE BULTO': 'PALLET',
        'TOTAL BULTOS': '4',
        FLETE: '200',
        SEGURO: '50',
        'PAIS RECEPTOR': 'HOLANDA',
        'COMISIONES EN EL EXTRANJERO': '5',
      },
      items: [{ name: 'Vino tinto reserva', quantity: 100, unitPrice: 12 }],
    })
  })
})

describe('the purchase-book sets', () => {
  test('LIBRO DE COMPRAS: document, observation and amount lines, and the factor', () => {
    const [set] = parseTestSetText(PURCHASE_BOOK_SET_TEXT)
    expect(set.kind).toBe('purchaseBook')
    expect(set.proportionalityFactor).toBe(0.6)
    expect(set.bookDocuments).toEqual([
      {
        documentText: 'FACTURA',
        folio: 234,
        observation: 'FACTURA DEL GIRO CON DERECHO A CREDITO',
        exemptAmount: 7893,
        affectedAmount: 3897,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
      {
        documentText: 'FACTURA ELECTRONICA',
        folio: 32,
        observation: 'FACTURA DEL GIRO CON DERECHO A CREDITO',
        exemptAmount: null,
        affectedAmount: 4305,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
      {
        documentText: 'FACTURA',
        folio: 781,
        observation: 'FACTURA CON IVA USO COMUN',
        exemptAmount: null,
        affectedAmount: 12000,
        commonUseVat: true,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
      {
        documentText: 'FACTURA ELECTRONICA',
        folio: 1004,
        observation: 'ENTREGA GRATUITA DEL PROVEEDOR',
        exemptAmount: null,
        affectedAmount: 2000,
        commonUseVat: false,
        nonRecoverableVatCode: 4,
        totalWithholding: false,
      },
      {
        documentText: 'FACTURA DE COMPRA ELECTRONICA',
        folio: 87,
        observation: 'COMPRA CON RETENCION TOTAL DEL IVA',
        exemptAmount: null,
        affectedAmount: 9000,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: true,
      },
      {
        documentText: 'NOTA DE CREDITO',
        folio: 5,
        observation: 'NOTA DE CREDITO POR DESCUENTO FACTURA ELECTRONICA 32',
        exemptAmount: null,
        affectedAmount: 1000,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
    ])
  })

  test('LIBRO DE COMPRAS PARA EXENTOS: columnar lines, OBS lines, the exempt column by type', () => {
    const [set] = parseTestSetText(EXEMPT_PURCHASE_BOOK_SET_TEXT)
    expect(set.kind).toBe('exemptPurchaseBook')
    expect(set.proportionalityFactor).toBe(0.6)
    expect(
      set.bookDocuments.map((doc) => [
        doc.documentText,
        doc.folio,
        doc.exemptAmount,
        doc.affectedAmount,
        doc.observation,
      ]),
    ).toEqual([
      ['FACTURA', 120, null, 5000, null],
      ['FACTURA ELECTRONICA', 77, 3000, 10000, null],
      ['FACTURA EXENTA', 9, 2500, null, null],
      ['NOTA DE DEBITO', 3, 400, null, 'NOTA DE DEBITO POR INTERESES FACTURA 120'],
      ['NOTA DE CREDITO ELECTRONICA', 14, null, null, 'NOTA DE CREDITO POR DESCUENTO FACTURA ELECTRONICA 77'],
    ])
  })

  test('an OBS line before any document is ignored, and a factor with no documents is kept', () => {
    const [set] = parseTestSetText(
      `SET LIBRO DE COMPRAS PARA EXENTOS - NUMERO DE ATENCION: 1\nOBS: nada\nFACTOR DE PROPORCIONALIDAD IVA: 0.4\n`,
    )
    expect(set.bookDocuments).toEqual([])
    expect(set.proportionalityFactor).toBe(0.4)
    const [plain] = parseTestSetText(
      `SET LIBRO DE COMPRAS - NUMERO DE ATENCION: 1\nFACTURA 9\nFACTURA DEL GIRO\nno es monto\nFACTOR DE PROPORCIONALIDAD 0.5\n`,
    )
    expect(plain.bookDocuments).toEqual([
      expect.objectContaining({ folio: 9, affectedAmount: null, exemptAmount: null }),
    ])
    expect(plain.proportionalityFactor).toBe(0.5)
  })

  test('a sales-book set keeps its instruction lines out and a factor outside book sets is read too', () => {
    const [set] = parseTestSetText(
      `SET LIBRO DE VENTAS - NUMERO DE ATENCION: 1\nUsar DTEs del SET BASICO\nFACTOR DE PROPORCIONALIDAD IVA: 0.7\n`,
    )
    expect(set).toMatchObject({ kind: 'salesBook', cases: [], bookDocuments: [], proportionalityFactor: 0.7 })
  })
})

describe('item rows', () => {
  const parseItems = (lines: string, reason = '') =>
    parseTestSetText(
      `SET BASICO - NUMERO DE ATENCION: 1\nCASO 1-1\nDOCUMENTO FACTURA\n${reason ? `RAZON REFERENCIA ${reason}\n` : ''}${lines}\n`,
    )[0].cases[0].items

  test('four parts with a non-letter third part is a discount row; a bad quantity becomes 1', () => {
    expect(parseItems('Pintura  x  5000  14%')).toEqual([
      { name: 'Pintura', quantity: 1, unitPrice: 5000, discount: '14%' },
    ])
    expect(parseItems('Cemento  3  SACO  abc')).toEqual([{ name: 'Cemento', quantity: 3, unit: 'SACO', unitPrice: 0 }])
    expect(parseItems('Pintura  2  x5  14%')).toEqual([{ name: 'Pintura', quantity: 2, unitPrice: 0, discount: '14%' }])
    expect(parseItems('Cemento  x  SACO  8000')).toEqual([
      { name: 'Cemento', quantity: 1, unit: 'SACO', unitPrice: 8000 },
    ])
  })

  test('three parts with a non-number fall to the fallback; two non-numeric parts are dropped', () => {
    expect(parseItems('ITEM 1         56')).toEqual([{ name: 'ITEM 1', quantity: 56 }])
    expect(parseItems('Caja grande  x  5')).toEqual([{ name: 'Caja grande  x', quantity: 5 }])
    expect(parseItems('Servicio basico  dos')).toEqual([])
    expect(parseItems('Servicio  dos  tres')).toEqual([])
    expect(parseItems('a  b  c  d  e')).toEqual([])
  })

  test('a line with a colon, a header-like first part or a single part is never an item', () => {
    expect(parseItems('NOTA: 5  6')).toEqual([])
    expect(parseItems('ITEM  5')).toEqual([])
    expect(parseItems('CANTIDAD TOTAL  5')).toEqual([])
    expect(parseItems('PRECIO UNITARIO  5')).toEqual([])
    expect(parseItems('Solo')).toEqual([])
  })

  test('the MODIFICA MONTO reason is matched without regard to case', () => {
    expect(parseItems('Caja\t5000', 'modifica monto')).toEqual([{ name: 'Caja', quantity: 1, unitPrice: 5000 }])
  })

  test('MODIFICA MONTO turns the value of a two-part row into the new price', () => {
    expect(parseItems('Cajon  3100', 'MODIFICA MONTO')).toEqual([{ name: 'Cajon', quantity: 1, unitPrice: 3100 }])
    expect(parseItems('Cajon  3100', 'DEVOLUCION')).toEqual([{ name: 'Cajon', quantity: 3100 }])
  })
})

describe('detectors', () => {
  test.each([
    ['LIBRO DE COMPRAS PARA EXENTOS', 'exemptPurchaseBook'],
    ['LIBRO DE COMPRAS', 'purchaseBook'],
    ['LIBRO DE VENTAS', 'salesBook'],
    ['LIBRO DE GUIAS', 'guideBook'],
    ['GUIA DE DESPACHO', 'guide'],
    ['FACTURA EXENTA', 'exempt'],
    ['FACTURA NO AFECTA', 'exempt'],
    ['DOCUMENTOS DE EXPORTACION (2)', 'export'],
    ['LIQUIDACION FACTURA', 'settlement'],
    ['FACTURA DE COMPRA', 'purchase'],
    ['CASO GENERAL FACTURA COMPRA', 'purchase'],
    ['BASICO', 'basic'],
    ['ALGO MAS', 'other'],
  ])('set kind of %s is %s', (name, kind) => {
    expect(testSetKindOf(name)).toBe(kind)
  })

  test.each([
    ['LIQUIDACION FACTURA ELECTRONICA', 43],
    ['FACTURA DE COMPRA ELECTRONICA', 46],
    ['FACTURA DE EXPORTACION ELECTRONICA', 110],
    ['NOTA DE CREDITO DE EXPORTACION ELECTRONICA', 112],
    ['NOTA DE DEBITO DE EXPORTACION ELECTRONICA', 111],
    ['FACTURA NO AFECTA O EXENTA ELECTRONICA', 34],
    ['GUIA DE DESPACHO ELECTRONICA', 52],
    ['NOTA DE CRÉDITO ELECTRÓNICA', 61],
    ['NOTA DE DÉBITO ELECTRÓNICA', 56],
    ['FACTURA ELECTRONICA', 33],
    ['BOLETA', null],
  ])('document type of %s is %s', (text, type) => {
    expect(documentTypeOf(text)).toBe(type)
  })

  test.each([
    ['', 1],
    ['ANULA FACTURA', 1],
    ['CORRIGE GIRO', 2],
    ['CORRIGE TEXTO DEL ITEM', 2],
    ['CORRIGE MONTO', 1],
    ['DEVOLUCION DE MERCADERIAS', 3],
    ['MODIFICA MONTO', 3],
    ['OTRA COSA', 1],
  ])('reference code of "%s" is %s', (reason, code) => {
    expect(referenceCodeOf(reason)).toBe(code)
  })

  test.each([
    ['', 1],
    ['VENTA', 1],
    ['VENTAS POR EFECTUAR', 2],
    ['CONSIGNACION', 3],
    ['ENTREGA GRATUITA', 4],
    ['TRASLADO DE MATERIALES ENTRE BODEGAS', 5],
    ['TRASLADO INTERNO', 5],
    ['OTROS TRASLADOS QUE NO SON VENTA', 6],
    ['DEVOLUCION', 7],
    ['TRASLADO PARA EXPORTACION', 8],
    ['VENTA PARA EXPORTACION', 9],
    ['TRASLADO', 5],
    ['CUALQUIER COSA', 1],
  ])('transfer reason of "%s" is %s', (motive, reason) => {
    expect(transferReasonOf(motive)).toBe(reason)
  })

  test.each([
    ['EMISOR DEL DOCUMENTO AL LOCAL DEL CLIENTE', 2],
    ['CLIENTE', 1],
    ['', null],
    ['TRANSPORTISTA', null],
  ])('dispatch type of "%s" is %s', (text, type) => {
    expect(dispatchTypeOf(text)).toBe(type)
  })

  test.each([
    ['FACTURA DE COMPRA ELECTRONICA', 46],
    ['FACTURA EXENTA ELECTRONICA', 34],
    ['FACTURA NO AFECTA ELECTRONICA', 34],
    ['FACTURA ELECTRONICA', 33],
    ['FACTURA EXENTA', 30],
    ['FACTURA NO AFECTA', 30],
    ['FACTURA', 30],
    ['NOTA DE CREDITO ELECTRONICA', 61],
    ['NOTA DE CREDITO', 60],
    ['NOTA DE DEBITO ELECTRONICO', 56],
    ['NOTA DE DEBITO', 55],
    ['BOLETA', null],
  ])('book document type of %s is %s', (text, type) => {
    expect(bookDocumentTypeOf(text)).toBe(type)
  })
})

test('the parser never throws and keeps the case ids it finds', () => {
  const line = fc.oneof(
    fc.constantFrom(
      `CASO ${ATTENTION}-1`,
      'DOCUMENTO FACTURA ELECTRONICA',
      'ITEM CANTIDAD',
      'a  1  2',
      '=====',
      '-'.repeat(25),
      '',
      'OBS: x',
    ),
    fc.string({ maxLength: 40 }),
  )
  fc.assert(
    fc.property(fc.array(line, { maxLength: 40 }), (lines) => {
      const text = `SET BASICO - NUMERO DE ATENCION: ${ATTENTION}\n${lines.join('\n')}`
      const [set] = parseTestSetText(text)
      const expected = lines.filter((candidate) => candidate === `CASO ${ATTENTION}-1`).length
      expect(set.cases).toHaveLength(expected)
      expect(set.cases.every((item) => item.id === `${ATTENTION}-1`)).toBe(true)
    }),
  )
  expect(parseTestSetText('')).toEqual([])
  expect(parseTestSetText('no set here\nCASO 1-1\nDOCUMENTO FACTURA')).toEqual([])
})
