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
  EXPORT_ATTENTION_1,
  EXPORT_ATTENTION_2,
  EXPORT_SET_TEXT,
  FULL_SET_TEXT,
  GUIDE_BOOK_ATTENTION,
  GUIDE_SET_TEXT,
  PURCHASE_BOOK_SET_TEXT,
  purchaseSetText,
  SALES_BOOK_ATTENTION,
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
      'guideBook',
    ])
    expect(sets.map((set) => set.attentionNumber)).toEqual([
      ...Array<string>(4).fill(ATTENTION),
      SALES_BOOK_ATTENTION,
      ATTENTION,
      ATTENTION,
      GUIDE_BOOK_ATTENTION,
    ])
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
      { name: 'Servicio EXENTO de instalacion', quantity: 1, unitPrice: 20000 },
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
})

describe('the export sets', () => {
  const [first, second] = parseTestSetText(EXPORT_SET_TEXT)
  const id1 = (n: number) => `${EXPORT_ATTENTION_1}-${n}`
  const id2 = (n: number) => `${EXPORT_ATTENTION_2}-${n}`
  const exportCase = (lines: readonly string[]) =>
    parseTestSetText(['SET DOCUMENTOS DE EXPORTACION - NUMERO DE ATENCION: 7', 'CASO 7-1', ...lines].join('\n'))[0]
      .cases[0]

  test('are two sets, each with its attention number, an invoice and two notes, then three invoices', () => {
    expect([first, second].map((set) => [set.name, set.attentionNumber, set.kind])).toEqual([
      ['BASICO DOCUMENTOS DE EXPORTACION (1)', EXPORT_ATTENTION_1, 'export'],
      ['BASICO DOCUMENTOS DE EXPORTACION (2)', EXPORT_ATTENTION_2, 'export'],
    ])
    expect(first.cases.map((testCase) => [testCase.id, testCase.documentType])).toEqual([
      [id1(1), 110],
      [id1(2), 112],
      [id1(3), 111],
    ])
    expect(second.cases.map((testCase) => [testCase.id, testCase.documentType])).toEqual([
      [id2(1), 110],
      [id2(2), 110],
      [id2(3), 110],
    ])
  })

  test('an invoice keeps its labelled lines, the units of tare and weights, its customs document and its items', () => {
    expect(first.cases[0]).toMatchObject({
      currency: 'FRANCO SZ',
      exportFields: {
        'FORMA DE PAGO EXPORTACION': 'ANTICIPO',
        'MODALIDAD DE VENTA': 'EN CONSIGNACION LIBRE',
        'CLAUSULA DE VENTA': 'S/CL',
        'TOTAL CLAUSULA DE VENTA': '3523.59',
        'VIA DE TRANSPORTE': 'FERROVIARIO',
        'PUERTO DE EMBARQUE': 'PUERTO MONTT',
        'PUERTO DE DESEMBARQUE': 'NAPOLES',
        'UNIDAD DE MEDIDA DE TARA': 'KN',
        'UNIDAD DE PESO BRUTO': 'PAR',
        'UNIDAD DE PESO NETO': 'PAR',
        'TIPO DE BULTO': 'PLANCHAS',
        'TOTAL BULTOS': '69',
        FLETE: '2069.28',
        SEGURO: '1215.22',
        'PAIS RECEPTOR': 'ITALIA',
      },
      customsReferences: ['MIC (MANIFIESTO INTERNACIONAL)'],
      items: [{ name: 'CHATARRA DE ALUMINIO', quantity: 687, unit: 'PAR', unitPrice: 159 }],
    })
    // The documentary line is not the document of the case, and the instruction lines are nothing.
    expect(first.cases[0].documentText).toBe('FACTURA DE EXPORTACION ELECTRONICA')
    expect(Object.keys(first.cases[0].exportFields)).toHaveLength(15)
  })

  test('a row reads its columns by the header, a line value, the discount of a numbered line and two customs documents', () => {
    expect(second.cases[1].items).toEqual([
      { name: 'CAJAS CIRUELAS TIERNIZADAS SIN CAROZO CALIBRE 60/70', quantity: 1036, unit: 'KN', unitPrice: 194 },
      { name: 'CAJAS DE PASAS DE UVA FLAME MORENA SIN SEMILLA MEDIANAS', quantity: 243, unit: 'KN', unitPrice: 132 },
    ])
    // The set states the discount in a line of its own, by the number of the line it is for.
    expect(second.cases[1].exportFields['DESCUENTO LINEA 1']).toBe('5')
    expect(second.cases[1].exportFields['COMISIONES EN EL EXTRANJERO']).toBe('11')
    expect(second.cases[1].customsReferences).toEqual(['DUS', 'AWB'])
    expect(second.cases[0].items).toEqual([{ name: 'ASESORIAS Y PROYECTOS PROFESIONALES', quantity: 1, unitPrice: 94 }])
    expect(second.cases[0].exportFields['RECARGO EN LA LINEA']).toBe('10')
    // The lodging case gives a nationality in place of a country and names no customs document; the instructions
    // that close the set are nothing of its case.
    expect(second.cases[2]).toMatchObject({
      currency: 'DOLAR USA',
      exportFields: { NACIONALIDAD: 'VENEZUELA' },
      customsReferences: [],
      items: [{ name: 'ALOJAMIENTO HABITACIONES', quantity: 1, unitPrice: 281 }],
    })
    expect(Object.keys(second.cases[2].exportFields)).toEqual(['NACIONALIDAD'])
  })

  test('the clause of the sale under its long label, its short one and with no colon', () => {
    const clause = (line: string) => exportCase([line]).exportFields['CLAUSULA DE VENTA']
    expect(clause('CLAUSULA DE VENTA DE EXPORTACION:   CIF')).toBe('CIF')
    expect(clause('CLAUSULA DE VENTA DE EXPORTACION:\tEXW')).toBe('EXW')
    expect(clause('CLAUSULA DE VENTA: S/CL')).toBe('S/CL')
    expect(clause('CLAUSULA DE VENTA   DAP')).toBe('DAP')
    // The total of the clause is a line of its own.
    expect(exportCase(['TOTAL CLAUSULA DE VENTA:\t\t 1234.5']).exportFields).toEqual({
      'TOTAL CLAUSULA DE VENTA': '1234.5',
    })
  })

  test('the discount of a numbered line, with or without its mark and with a comma', () => {
    const fields = exportCase([
      'DESCUENTO LINEA # 1:   5%',
      'DESCUENTO LINEA 2: 7,5 %',
      'DESCUENTO EN LA LINEA #03 12%',
    ]).exportFields
    expect(fields).toEqual({ 'DESCUENTO LINEA 1': '5', 'DESCUENTO LINEA 2': '7.5', 'DESCUENTO LINEA 3': '12' })
    // A discount of the whole document is another line.
    expect(exportCase(['DESCUENTO GLOBAL ITEMES AFECTOS: 7%'])).toMatchObject({
      globalDiscountPercent: 7,
      exportFields: {},
    })
  })

  test('a note keeps its reference, its reason and the items it names, or none', () => {
    expect(first.cases[1]).toMatchObject({
      referencedCase: id1(1),
      reasonText: 'DEVOLUCION DE MERCADERIA',
      items: [{ name: 'CHATARRA DE ALUMINIO', quantity: 229 }],
      customsReferences: [],
    })
    expect(first.cases[2]).toMatchObject({ referencedCase: id1(2), reasonText: 'ANULA NOTA DE CREDITO', items: [] })
  })

  test('numbers take a point or a comma, a cell that is no number keeps a row out, and a row with no header is a quantity', () => {
    const testCase = exportCase([
      'Vino  12  BOT  3,5',
      'ITEM  CANTIDAD  UNIDAD  PRECIO  DESCUENTO  OTRA',
      'Pisco  2.5  BOT  1.25  10%  x',
      'Queso  dos  KN  4',
      'Uva  4  KN  y',
      'Nada',
      'ITEM  VALOR',
      'Embalaje especial  10,75',
    ])
    expect(testCase.items).toEqual([
      { name: 'Vino', quantity: 12 },
      { name: 'Pisco', quantity: 2.5, unit: 'BOT', unitPrice: 1.25, discount: '10%' },
      { name: 'Embalaje especial', quantity: 1, unitPrice: 10.75 },
    ])
  })

  test('the tolerant labels: a percent after its number, a destination of its own, and a reference that names a case', () => {
    const testCase = exportCase([
      'DOCUMENTO  FACTURA DE EXPORTACION ELECTRONICA',
      '10 % RECARGO EN LA LINEA',
      'RECARGO EN LA LINEA SIN PORCENTAJE',
      'PAIS DE DESTINO: ESPAÑA',
      'UNIDAD DE MEDIDA DEL PESO BRUTO: KN',
      'UNIDAD TARA KN',
      'REFERENCIA: CASO 7-0',
      'REFERENCIA: B/L Y CARTA DE PORTE',
      'REFERENCIA: RESOLUCION DEL SERVICIO NACIONAL DE ADUANAS',
      'DOC. REFERENCIA  DUS',
    ])
    expect(testCase.exportFields).toEqual({
      'RECARGO EN LA LINEA': '10',
      'PAIS DESTINO': 'ESPAÑA',
      'UNIDAD DE PESO BRUTO': 'KN',
      'UNIDAD DE MEDIDA DE TARA': 'KN',
    })
    expect(testCase.referencedCase).toBe('7-0')
    expect(testCase.customsReferences).toEqual([
      'B/L Y CARTA DE PORTE',
      'RESOLUCION DEL SERVICIO NACIONAL DE ADUANAS',
      'DUS',
    ])
  })

  // Under a header of several columns, a row that fills every one of them is an item, whatever its name starts with:
  // a label of the case holds one value, or a colon. Read as a label, such a row lost its item and changed the totals.
  test('a row that fills the columns of its header is an item, even when its name reads as a label', () => {
    const testCase = exportCase([
      'DOCUMENTO  FACTURA DE EXPORTACION ELECTRONICA',
      'ITEM  CANTIDAD  UNIDAD  PRECIO',
      'FLETE INTERNO  1  UN  100',
      'SEGURO DE CARGA  2  UN  50',
      'CAJAS CON REFERENCIA DUS  3  UN  10',
      'SERVICIO CON RECARGO EN LA LINEA  1  UN  9',
      'UNIDAD DE PESO NETO MEDIDOR  4  UN  1',
      'VINO  5  BOT  7',
    ])
    expect(testCase.items.map((item) => [item.name, item.quantity, item.unitPrice])).toEqual([
      ['FLETE INTERNO', 1, 100],
      ['SEGURO DE CARGA', 2, 50],
      ['CAJAS CON REFERENCIA DUS', 3, 10],
      ['SERVICIO CON RECARGO EN LA LINEA', 1, 9],
      ['UNIDAD DE PESO NETO MEDIDOR', 4, 1],
      ['VINO', 5, 7],
    ])
    expect(testCase.exportFields).toEqual({})
    expect(testCase.customsReferences).toEqual([])
  })

  test('after the header a label is still a label: with its colon, or with fewer cells than the header has columns', () => {
    const testCase = exportCase([
      'DOCUMENTO  FACTURA DE EXPORTACION ELECTRONICA',
      'ITEM  CANTIDAD  UNIDAD  PRECIO',
      'VINO  5  BOT  7',
      'FLETE (**): 100',
      'SEGURO  50',
      'TOTAL BULTOS  69',
      'UNIDAD DE PESO NETO: KN  1  2',
      'REFERENCIA: DUS',
      '%10 RECARGO EN LA LINEA DE ITEM POR COMISIONES EN EL EXTERIOR',
    ])
    expect(testCase.items.map((item) => item.name)).toEqual(['VINO'])
    expect(testCase.exportFields).toEqual({
      FLETE: '100',
      SEGURO: '50',
      'TOTAL BULTOS': '69',
      'UNIDAD DE PESO NETO': 'KN  1  2',
      'RECARGO EN LA LINEA': '10',
    })
    expect(testCase.customsReferences).toEqual(['DUS'])
  })

  test('the cases of every other set carry no customs references', () => {
    for (const set of parseTestSetText(FULL_SET_TEXT))
      for (const testCase of set.cases) expect(testCase).not.toHaveProperty('customsReferences')
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

  test('a separator line or a case header ends the rows of a book set until the next set', () => {
    const regular = parseTestSetText(
      `SET LIBRO DE COMPRAS - NUMERO DE ATENCION: 1\nFACTURA 1\nFACTURA DEL GIRO\n100\n${'-'.repeat(30)}\nFACTURA 2\nFACTURA DEL GIRO\n200\nFACTOR DE PROPORCIONALIDAD 0.3\n`,
    )[0]
    expect(regular.bookDocuments.map((doc) => doc.folio)).toEqual([1])
    expect(regular.proportionalityFactor).toBeNull()
    const exempt = parseTestSetText(
      `SET LIBRO DE COMPRAS PARA EXENTOS - NUMERO DE ATENCION: 1\nFACTURA    1    100\nCASO 1-1\nFACTURA    2    200\nFACTURA    3    300\n`,
    )[0]
    expect(exempt.bookDocuments.map((doc) => doc.folio)).toEqual([1])
  })

  test('a separator line does not end the exempt-book set: its rows go on until a case header or the next set', () => {
    const [exempt, next] = parseTestSetText(
      `SET LIBRO DE COMPRAS PARA EXENTOS - NUMERO DE ATENCION: 1\n${'-'.repeat(30)}\nFACTURA    1    100\n${'-'.repeat(30)}\nOBS: FACTURA DEL GIRO\nFACTURA    2    200\nSET LIBRO DE COMPRAS - NUMERO DE ATENCION: 2\nFACTURA 3\n`,
    )
    expect(exempt.bookDocuments.map((doc) => [doc.folio, doc.observation])).toEqual([
      [1, 'FACTURA DEL GIRO'],
      [2, null],
    ])
    expect(next.bookDocuments.map((doc) => doc.folio)).toEqual([3])
  })

  test('the observation flags of the regular book are case sensitive, the observation itself is not', () => {
    const [set] = parseTestSetText(
      `SET LIBRO DE COMPRAS - NUMERO DE ATENCION: 1\nFACTURA 1\nfactura con iva uso comun\n100\nFACTURA 2\nENTREGA gratuita\n100\nFACTURA 3\nCOMPRA CON RETENCION total\n100\n`,
    )
    expect(
      set.bookDocuments.map((doc) => [
        doc.observation,
        doc.commonUseVat,
        doc.nonRecoverableVatCode,
        doc.totalWithholding,
      ]),
    ).toEqual([
      ['factura con iva uso comun', false, null, false],
      ['ENTREGA gratuita', false, null, false],
      ['COMPRA CON RETENCION total', false, null, false],
    ])
  })

  test('an exempt-book amount column that is not a number counts as no amount', () => {
    const [set] = parseTestSetText(
      `SET LIBRO DE COMPRAS PARA EXENTOS - NUMERO DE ATENCION: 1\nFACTURA    1    -    -\nFACTURA EXENTA    2    -\nFACTURA    3    0    50\n`,
    )
    expect(set.bookDocuments.map((doc) => [doc.exemptAmount, doc.affectedAmount])).toEqual([
      [null, null],
      [null, null],
      [null, 50],
    ])
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

  test('the MODIFICA MONTO reason counts in capitals only: in another case the value of a two-part row is a quantity', () => {
    expect(parseItems('Caja\t5000', 'modifica monto')).toEqual([{ name: 'Caja', quantity: 5000 }])
  })

  test('the words that keep a row from being an item count in capitals only', () => {
    expect(parseItems('Razones varias  2  1500')).toEqual([{ name: 'Razones varias', quantity: 2, unitPrice: 1500 }])
    expect(parseItems('Documentos  1  500')).toEqual([{ name: 'Documentos', quantity: 1, unitPrice: 500 }])
    expect(parseItems('Referencias  3')).toEqual([{ name: 'Referencias', quantity: 3 }])
    expect(parseItems('Item  5')).toEqual([{ name: 'Item', quantity: 5 }])
    expect(parseItems('Cantidad adicional  1  500')).toEqual([
      { name: 'Cantidad adicional', quantity: 1, unitPrice: 500 },
    ])
    expect(parseItems('Precio unitario  5')).toEqual([{ name: 'Precio unitario', quantity: 5 }])
    expect(parseItems('RAZONES VARIAS  2  1500')).toEqual([])
  })

  test('MODIFICA MONTO turns the value of a two-part row into the new price', () => {
    expect(parseItems('Cajon  3100', 'MODIFICA MONTO')).toEqual([{ name: 'Cajon', quantity: 1, unitPrice: 3100 }])
    expect(parseItems('Cajon  3100', 'DEVOLUCION')).toEqual([{ name: 'Cajon', quantity: 3100 }])
  })

  test('a line of prose that ends in a number is never an item: a row has its cells apart, like its header', () => {
    expect(parseItems('ITEM\t\tCANTIDAD\nTornillo largo\t\t8\nDespachar antes del dia 4')).toEqual([
      { name: 'Tornillo largo', quantity: 8 },
    ])
    expect(parseItems('ITEM 1 56')).toEqual([])
    expect(parseItems('Caja grande x 5')).toEqual([])
    expect(parseItems('Llamar al cliente  antes de 3')).toEqual([])
    expect(parseItems('Caja grande x\t5')).toEqual([{ name: 'Caja grande x', quantity: 5 }])
  })
})

describe('the lines the reader did not use', () => {
  const unreadOf = (text: string) => parseTestSetText(text)[0].cases.map((testCase) => testCase.unread)
  const basic = (lines: string) => `SET BASICO - NUMERO DE ATENCION: 1\nCASO 1-1\n==========\n${lines}\n`

  test('are kept per case, in order and as written, leaving out blank and separator lines', () => {
    const text = basic(
      [
        'DOCUMENTO\tFACTURA ELECTRONICA',
        '',
        'ITEM\t\tCANTIDAD\tPRECIO UNITARIO',
        'Tornillo largo\t\t8\t\t120',
        'Despachar antes del dia 4',
        '   ',
        '\t',
        '-----',
        '***',
        'NOTA: entregar en la bodega norte',
        'a  b  c  d  e',
        'ITEM  5',
        'CANTIDAD TOTAL  5',
      ].join('\n'),
    )
    const [testCase] = parseTestSetText(text)[0].cases
    expect(testCase.items).toEqual([{ name: 'Tornillo largo', quantity: 8, unitPrice: 120 }])
    expect(testCase.unread).toEqual([
      'Despachar antes del dia 4',
      'NOTA: entregar en la bodega norte',
      'a  b  c  d  e',
      'ITEM  5',
      'CANTIDAD TOTAL  5',
    ])
  })

  test('a case the grammar reads in full has none, and the sample sets read in full', () => {
    expect(unreadOf(basic('DOCUMENTO\tFACTURA ELECTRONICA\nITEM\tCANTIDAD\nTornillo\t3'))).toEqual([[]])
    for (const text of [
      BASIC_SET_TEXT,
      EXEMPT_SET_TEXT,
      GUIDE_SET_TEXT,
      EXPORT_SET_TEXT,
      purchaseSetText('SET FACTURA DE COMPRA'),
    ])
      for (const set of parseTestSetText(text))
        expect(set.cases.every((testCase) => testCase.unread.length === 0)).toBe(true)
  })

  test('the sentence that asks a note for the prices of its document is known prose and is left out', () => {
    const text = basic(
      [
        'DOCUMENTO\tNOTA DE CREDITO ELECTRONICA',
        'Los precios unitarios deben ser los mismos de la factura',
        'EL PRECIO UNITARIO DEL ITEM DEBE SER EL MISMO DE LA FACTURA',
        'EL PRECIO UNITARIO DEBE SUBIR',
      ].join('\n'),
    )
    expect(unreadOf(text)).toEqual([['EL PRECIO UNITARIO DEBE SUBIR']])
  })

  test('the known sentence is only the sentence: a line that goes on after it is unread', () => {
    const goesOn = 'Los precios unitarios deben ser los mismos de la factura, salvo el segundo que sube a 70'
    const changes = 'Los precios unitarios deben ser los mismos, salvo el segundo que sube a 70'
    expect(unreadOf(basic(`DOCUMENTO\tNOTA DE CREDITO ELECTRONICA\n${goesOn}\n${changes}`))).toEqual([
      [goesOn, changes],
    ])
  })

  test('in a case of any other set the export labels are no labels: such a row is an item, a labelled line unread', () => {
    const [testCase] = parseTestSetText(
      basic(
        [
          'DOCUMENTO\tFACTURA ELECTRONICA',
          'ITEM\t\tCANTIDAD\tPRECIO UNITARIO',
          'SEGURO DE CARGA\t\t2\t\t500',
          'FLETE MARITIMO\t\t1\t\t900',
          'FLETE: 100',
        ].join('\n'),
      ),
    )[0].cases
    expect(testCase.items).toEqual([
      { name: 'SEGURO DE CARGA', quantity: 2, unitPrice: 500 },
      { name: 'FLETE MARITIMO', quantity: 1, unitPrice: 900 },
    ])
    expect(testCase.exportFields).toEqual({})
    expect(testCase.unread).toEqual(['FLETE: 100'])
  })

  test('a row that starts with a header word and holds a number is no header: it is unread, never dropped', () => {
    const [testCase] = parseTestSetText(
      basic(
        [
          'DOCUMENTO\tFACTURA ELECTRONICA',
          'CANTIDAD\tPRECIO',
          'PRECIO UNITARIO ESPECIAL\t2\t500',
          'CANTIDAD MINIMA DE COMPRA\t10\t300',
          'ITEM  5',
        ].join('\n'),
      ),
    )[0].cases
    expect(testCase.items).toEqual([])
    expect(testCase.unread).toEqual([
      'PRECIO UNITARIO ESPECIAL\t2\t500',
      'CANTIDAD MINIMA DE COMPRA\t10\t300',
      'ITEM  5',
    ])
  })

  test('a settlement case and an export case report theirs too', () => {
    const settlement = [
      'SET BASICO LIQUIDACIONES - NUMERO DE ATENCION: 2',
      'CASO 2-1',
      'DOCUMENTO\tLIQUIDACION FACTURA ELECTRONICA',
      'ITEM\t\tCANTIDAD\tTOTAL LINEA',
      'NETO FACTURAS\t\t2\t\t9000',
      'Revisar con el mandante 2',
      'COMISIONES Y OTROS CARGOS\tTOTAL LINEA',
      'NETO COMISION DE COBRANZA\t\t300',
      'OBSERVACION: sin cargos extra',
    ].join('\n')
    expect(unreadOf(settlement)).toEqual([['Revisar con el mandante 2', 'OBSERVACION: sin cargos extra']])
    const exportCase = [
      'SET BASICO DOCUMENTOS DE EXPORTACION (1) - NUMERO DE ATENCION: 3',
      'CASO 3-1',
      'DOCUMENTO\tFACTURA DE EXPORTACION ELECTRONICA',
      'ITEM                CANTIDAD\tPRECIO UNITARIO',
      'LANA CRUDA          12\t\t40',
      'LANA PEINADA        x\t\t40',
      'EMBALAR POR SEPARADO',
      'MONEDA DE LA OPERACION:     DOLAR USA',
      'RECARGO EN LA LINEA DE ITEM POR GASTOS',
    ].join('\n')
    const [testCase] = parseTestSetText(exportCase)[0].cases
    expect(testCase.items).toEqual([{ name: 'LANA CRUDA', quantity: 12, unitPrice: 40 }])
    expect(testCase.exportFields).toEqual({})
    expect(testCase.unread).toEqual([
      'LANA PEINADA        x\t\t40',
      'EMBALAR POR SEPARADO',
      'RECARGO EN LA LINEA DE ITEM POR GASTOS',
    ])
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
    ['FACTURA NO AFECTA ELECTRONICO', 30],
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
