import {
  changeMessageOf,
  parseRcvAnswer,
  periodDocumentsOf,
  periodSummaryOf,
  purchaseDocumentOf,
  purchaseTypesOf,
  registerSummaryOf,
} from '../../src/portal/pages/rcv'

const SUMMARY_ROW = {
  tipoDoc: 33,
  tipoDocDesc: 'Factura Electronica',
  seccion: 'S1',
  totalDoc: 2,
  mntExento: 0,
  mntNeto: 10000,
  mntIVA: 1900,
  mntTotal: 11900,
  totalReparos: 0,
}

const row = periodSummaryOf({ data: { resumenDte: [SUMMARY_ROW] } })[0]

describe('parseRcvAnswer', () => {
  test('an object is an answer', () => {
    expect(parseRcvAnswer('{"data":null}')).toEqual({ data: null })
  })

  test.each(['<html>no</html>', '{"data":', '', 'null', '[]', '"texto"', '3'])('%s is not', (text) => {
    expect(parseRcvAnswer(text)).toBeNull()
  })
})

describe('periodSummaryOf', () => {
  test('typed fields, and the row as it came', () => {
    expect(row).toEqual({
      type: 33,
      typeDescription: 'Factura Electronica',
      section: 'S1',
      documentCount: 2,
      exemptAmount: 0,
      netAmount: 10000,
      vatAmount: 1900,
      totalAmount: 11900,
      raw: SUMMARY_ROW,
    })
  })

  test('a number may come as text; anything else is null and stays in raw', () => {
    const [read] = periodSummaryOf({
      data: { resumenDte: [{ tipoDoc: '61', mntNeto: 'mucho', mntTotal: '', totalDoc: true }] },
    })
    expect(read).toMatchObject({ type: 61, netAmount: null, totalAmount: null, documentCount: null, section: null })
    expect(read.raw.mntNeto).toBe('mucho')
  })

  test('text may come as a number', () => {
    const [read] = periodSummaryOf({ data: { resumenDte: [{ seccion: 1 }] } })
    expect(read.section).toBe('1')
  })

  test.each([
    ['measured, with no documents', { data: { resumenDte: [], datosAsync: null } }],
    ['no list', { data: { resumenDte: null } }],
    ['no data', { data: null }],
    ['nothing', {}],
  ])('%s reads as empty', (_name, answer) => {
    expect(periodSummaryOf(answer)).toEqual([])
  })

  test('an entry that is not an object is ignored', () => {
    expect(periodSummaryOf({ data: { resumenDte: [null, 'x', [1]] } })).toEqual([])
  })
})

describe('periodDocumentsOf', () => {
  const DETAIL = {
    folio: 1234,
    fechaEmision: '05/10/2026',
    fechaRecepcion: '06/10/2026',
    rutReceptor: 12345678,
    dvReceptor: '5',
    rznSocRecep: 'COMERCIAL ANDINA SPA',
    mntExento: 0,
    mntNeto: 5000,
    mntIva: 950,
    mntTotal: 5950,
    dehOrdenEvento: 3,
    dehDescripcion: 'Aceptado',
  }

  test('typed fields, with the type from the summary row', () => {
    const [document] = periodDocumentsOf({ dataResp: { detalles: [DETAIL] } }, row)
    expect(document).toEqual({
      type: 33,
      typeDescription: 'Factura Electronica',
      folio: 1234,
      issueDate: '05/10/2026',
      receivedDate: '06/10/2026',
      counterpartyRut: '12345678-5',
      counterpartyName: 'COMERCIAL ANDINA SPA',
      exemptAmount: 0,
      netAmount: 5000,
      vatAmount: 950,
      totalAmount: 5950,
      eventOrder: 3,
      eventDescription: 'Aceptado',
      raw: DETAIL,
    })
  })

  test('its own name of the type wins, unless it is empty', () => {
    const name = (descTipoDoc: unknown) =>
      periodDocumentsOf({ dataResp: { detalles: [{ descTipoDoc }] } }, row)[0].typeDescription
    expect(name('Factura propia')).toBe('Factura propia')
    expect(name('')).toBe('Factura Electronica')
    expect(name(undefined)).toBe('Factura Electronica')
  })

  test('half a RUT is no RUT', () => {
    const rut = (fields: Record<string, unknown>) =>
      periodDocumentsOf({ dataResp: { detalles: [fields] } }, row)[0].counterpartyRut
    expect(rut({ rutReceptor: '12345678' })).toBeNull()
    expect(rut({ dvReceptor: '5' })).toBeNull()
    expect(rut({ rutReceptor: '', dvReceptor: '5' })).toBeNull()
  })

  test.each([
    ['no list', { dataResp: { detalles: null } }],
    ['no data', { dataResp: null }],
    ['nothing', {}],
  ])('%s reads as empty', (_name, answer) => {
    expect(periodDocumentsOf(answer, row)).toEqual([])
  })
})

describe('registerSummaryOf', () => {
  const REGISTER_ROW = {
    rsmnTipoDocInteger: 33,
    dcvNombreTipoDoc: 'Factura Electronica',
    rsmnTotDoc: 4,
    rsmnMntExe: 0,
    rsmnMntNeto: 20000,
    rsmnMntIVA: 3800,
    rsmnIVAUsoComun: 100,
    rsmnMntIVANoRec: 200,
    rsmnMntTotal: 23800,
    rsmnLink: true,
  }

  test('rows and header', () => {
    const header = { dcvFecModificacion: '01/10/2026', dcvFctProp: '0.5' }
    expect(registerSummaryOf({ data: [REGISTER_ROW], dataCabecera: header })).toEqual({
      rows: [
        {
          type: 33,
          typeName: 'Factura Electronica',
          documentCount: 4,
          exemptAmount: 0,
          netAmount: 20000,
          vatAmount: 3800,
          commonUseVat: 100,
          nonRecoverableVat: 200,
          totalAmount: 23800,
          raw: REGISTER_ROW,
        },
      ],
      header: { updatedAt: '01/10/2026', proportionalityFactor: 0.5, raw: header },
    })
  })

  test('as measured with no documents', () => {
    expect(registerSummaryOf({ data: null, dataCabecera: null, respEstado: { codRespuesta: 3 } })).toEqual({
      rows: [],
      header: null,
    })
  })
})

describe('purchaseTypesOf', () => {
  test('as measured', () => {
    expect(
      purchaseTypesOf({
        data: [
          { id: '1', descripcion: 'Del Giro', intercambiable: false },
          { id: '2', descripcion: 'Supermercados', intercambiable: true },
        ],
      }),
    ).toEqual([
      { id: '1', description: 'Del Giro', interchangeable: false },
      { id: '2', description: 'Supermercados', interchangeable: true },
    ])
  })

  test('no data is an empty catalogue', () => {
    expect(purchaseTypesOf({ data: null })).toEqual([])
  })
})

describe('purchaseDocumentOf', () => {
  test('typed fields, and the document as it came', () => {
    const raw = {
      det_tipo_doc: 33,
      det_nro_doc: '1234',
      det_rzn_soc: 'COMERCIAL ANDINA SPA',
      det_fec_creacion: '06/10/2026',
      det_mnt_exe: 0,
      det_mnt_neto: 5000,
      det_mnt_iva: 950,
      det_iva_uso_comun: 0,
      det_monto_iva_no_r: 0,
      det_mnt_total: 5950,
      det_tipo_transaccion: '4',
      det_tpo_imp: '1',
    }
    expect(purchaseDocumentOf({ data: raw })).toEqual({
      type: 33,
      folio: 1234,
      businessName: 'COMERCIAL ANDINA SPA',
      createdAt: '06/10/2026',
      exemptAmount: 0,
      netAmount: 5000,
      vatAmount: 950,
      commonUseVat: 0,
      nonRecoverableVat: 0,
      totalAmount: 5950,
      purchaseType: '4',
      raw,
    })
  })

  test('no data is null', () => {
    expect(purchaseDocumentOf({ data: null })).toBeNull()
    expect(purchaseDocumentOf({})).toBeNull()
  })
})

describe('changeMessageOf', () => {
  test('the first error, when there is one', () => {
    expect(changeMessageOf({ metaData: { errors: [{ descripcion: 'No se pudo' }, { descripcion: 'Otro' }] } })).toBe(
      'No se pudo',
    )
  })

  test.each([
    ['no errors', { metaData: { errors: [] } }],
    ['errors with no text', { metaData: { errors: [{}] } }],
    ['no metadata', {}],
  ])('%s', (_name, answer) => {
    expect(changeMessageOf(answer)).toBeNull()
  })
})
