import {
  classifyAdvanceAnswer,
  classifyDeclarationAnswer,
  classifyItemState,
  parseDeclarationForm,
  parseProgressPage,
  portalStageOf,
  verifyDeclaration,
} from '../../src/portal/pages/certification-progress'
import {
  ADVANCE_ANSWERS,
  DECLARATION_ANSWERS,
  declarationFormPage,
  progressPage,
  STATUS_PAGE,
} from '../support/certification-pages'
import { page } from '../support/portal-pages'

describe('parseDeclarationForm', () => {
  test('rows by label with their input index, hidden fields, current values and TOTREG', () => {
    const form = parseDeclarationForm(
      declarationFormPage(
        [
          { label: 'SET BASICO', state: 'REVISADO CONFORME' },
          { label: 'SET GUIA DE DESPACHO', index: 1, value: '77', date: '04-11-2026', est: 'S21' },
          { label: 'SET FACTURA EXENTA', index: 2 },
          { label: 'SET CASO GENERAL FACTURA COMPRA', index: 3, state: 'EN REVISION' },
          { label: 'LIBRO DE VENTAS', index: 4 },
          { label: 'LIBRO DE COMPRAS', index: 5 },
          { label: 'LIBRO DE COMPRAS PARA EXENTOS', index: 6 },
          { label: 'LIBRO DE GUIAS', index: 7 },
          { label: 'SET DOCUMENTOS DE EXPORTACION', index: 8 },
          { label: 'SET DOCUMENTOS DE EXPORTACION(2)', index: 9 },
          { label: 'SET LIQUIDACION FACTURA', index: 10 },
          { label: 'SET DE SIMULACION', index: 11 },
          { label: 'OTRA FILA', index: 12 },
        ],
        { totreg: 12, paso: 'P02' },
      ),
    )
    expect(form.rows.map((row) => [row.key, row.index, row.value, row.state])).toEqual([
      ['basic', null, null, 'REVISADO CONFORME'],
      ['guide', 1, '77', 'S21'],
      ['exempt', 2, '', 'S01'],
      ['purchase', 3, '', 'EN REVISION'],
      ['salesBook', 4, '', 'S01'],
      ['purchaseBook', 5, '', 'S01'],
      ['exemptPurchaseBook', 6, '', 'S01'],
      ['guideBook', 7, '', 'S01'],
      ['export1', 8, '', 'S01'],
      ['export2', 9, '', 'S01'],
      ['settlement', 10, '', 'S01'],
      ['simulation', 11, '', 'S01'],
    ])
    expect(form.hiddenFields).toMatchObject({ TOTREG: '12', PASO: 'P02', SET1: 'S01', EST1: 'S21' })
    expect(form.currentValues).toEqual({ NUM_ENV1: '77', FEC_ENV1: '04-11-2026' })
    expect(form.totalRows).toBe(12)
    expect(form.isStatusPage).toBe(false)
    expect(form.hasErrorStates).toBe(false)
  })

  test('a status page has no hidden field; error states are seen', () => {
    const status = parseDeclarationForm(STATUS_PAGE)
    expect(status.isStatusPage).toBe(true)
    expect(parseDeclarationForm(page('<p>nada</p>'))).toMatchObject({ rows: [], isStatusPage: true, totalRows: 10 })
    expect(status.hasErrorStates).toBe(true)
    expect(status.totalRows).toBe(10)
    expect(status.rows[0]).toMatchObject({ key: 'basic', index: null, state: 'ENVIO CON ERRORES O REPAROS' })
  })

  test('a row without state and without index reads null, and verifies as kept', () => {
    const html = page('<input type=hidden name=TOTREG value=x><tr><td>LIBRO DE GUIAS</td></tr>')
    const form = parseDeclarationForm(html)
    expect(form.rows).toEqual([{ key: 'guideBook', label: 'LIBRO DE GUIAS', index: null, value: null, state: null }])
    expect(form.totalRows).toBe(10)
    expect(verifyDeclaration(html, { guideBook: '1' })).toEqual({ guideBook: 'kept' })
    const bare = parseDeclarationForm(
      page('<input type=hidden name=X><tr><td>LIBRO DE GUIAS<input name=NUM_ENV3></td></tr>'),
    )
    expect(bare.rows[0]).toMatchObject({ index: 3, value: '', state: null })
  })
})

describe('classifyDeclarationAnswer', () => {
  test.each([
    ['success', { accepted: true, hasSuccess: true, hasError: false, notProcessed: false }],
    ['updated', { accepted: true, hasSuccess: true, hasError: true }],
    ['notProcessed', { accepted: true, notProcessed: true, hasError: false }],
    ['sessionExpired', { accepted: false, sessionExpired: true }],
    ['contentMismatch', { accepted: false, contentMismatch: true }],
    ['plainError', { accepted: false, hasError: true, hasSuccess: false }],
  ] as const)('%s', (name, expected) => {
    expect(classifyDeclarationAnswer(DECLARATION_ANSWERS[name])).toMatchObject(expected)
  })

  test('inconsistent data carries its sentence, and is definitive', () => {
    const answer = classifyDeclarationAnswer(DECLARATION_ANSWERS.inconsistent)
    expect(answer.inconsistentData).toBe('LA FECHA DE ENVIO NO CORRESPONDE AL ENVIO 123')
    expect(classifyDeclarationAnswer(page('EL RUT NO COINCIDE')).inconsistentData).toBe('EL RUT NO COINCIDE')
    expect(classifyDeclarationAnswer(DECLARATION_ANSWERS.success).inconsistentData).toBeNull()
  })

  test('content errors name their rows; "errores o reparos" is a state, not an error', () => {
    const answer = classifyDeclarationAnswer(DECLARATION_ANSWERS.contentErrors)
    expect(answer.contentErrors).toEqual(['exemptPurchaseBook', 'basic'])
    expect(answer.hasError).toBe(false)
    expect(answer.accepted).toBe(true)
  })
})

describe('verifyDeclaration', () => {
  test('approved, in review, empty, kept and missing', () => {
    const html = declarationFormPage([
      { label: 'SET BASICO', state: 'REVISADO CONFORME' },
      { label: 'SET GUIA DE DESPACHO', state: 'EN REVISION' },
      { label: 'SET FACTURA EXENTA', index: 1 },
      { label: 'SET CASO GENERAL FACTURA COMPRA', index: 2, value: '0055' },
      { label: 'LIBRO DE VENTAS', state: 'POR REALIZAR' },
      { label: 'LIBRO DE COMPRAS', index: 3, value: '77' },
    ])
    expect(
      verifyDeclaration(html, {
        basic: '1',
        guide: '2',
        exempt: '3',
        purchase: '55',
        salesBook: '5',
        purchaseBook: '6',
        guideBook: '7',
      }),
    ).toEqual({
      basic: 'approved',
      guide: 'inReview',
      exempt: 'empty',
      purchase: 'kept',
      salesBook: 'kept',
      purchaseBook: 'mismatch',
      guideBook: 'missing',
    })
  })
})

describe('classifyAdvanceAnswer', () => {
  test.each([
    ['advanced', 'advanced', 'La empresa ha pasado al paso de SIMULACION'],
    ['finished', 'advanced', 'La empresa ha finalizado con la certificación'],
    ['unchanged', 'unchanged', 'La empresa ya se encuentra en el paso SIMULACION'],
    ['failed', 'failed', 'No es posible avanzar: faltan sets por revisar.'],
  ] as const)('%s', (name, outcome, message) => {
    expect(classifyAdvanceAnswer(ADVANCE_ANSWERS[name])).toEqual({ outcome, message })
  })
})

describe('parseProgressPage', () => {
  test('the stage, each row by its own bold, the confirmation offer', () => {
    const parsed = parseProgressPage(
      progressPage(
        'SIMULACION',
        {
          'SET BASICO': 'REVISADO CONFORME',
          'SET GUIA DESP.': 'EN REVISION',
          'SET FACTURA EXENTA': 'RECHAZADO',
          'SET CASO GENERAL FACTURA COMPRA': 'POR REALIZAR',
          'SET SIMULACION': 'ANULADO',
          'LIBRO VENTAS': 'FECHA NO CORRESPONDE',
          'LIBRO DE COMPRAS': 'ENVIO CON ERRORES O REPAROS',
          'LIBRO DE COMPRAS PARA EXENTOS': 'lo que sea',
          'LIBRO GUIAS': 'REVISADO CONFORME',
        },
        { confirm: true },
      ),
    )
    expect(parsed.stage).toBe('SIMULACION')
    expect(parsed.stageKey).toBe('simulation')
    expect(parsed.simulationAwaitsConfirmation).toBe(true)
    expect(Object.fromEntries(Object.entries(parsed.states).map(([key, value]) => [key, value.state]))).toEqual({
      basic: 'approved',
      guide: 'inReview',
      exempt: 'rejected',
      purchase: 'pending',
      simulation: 'annulled',
      salesBook: 'inconsistent',
      purchaseBook: 'rejected',
      exemptPurchaseBook: 'unknown',
      guideBook: 'approved',
    })
  })

  test('a row without bold leaves no state; a label is read once; a label split by a tag still reads', () => {
    const parsed = parseProgressPage(
      page(
        '<p>paso <b>INTERCAMBIO</b></p><tr><td>SET BASICO</td><td>x</td></tr><tr><td>SET BASICO</td><td><b>EN REVISION</b></td></tr><tr><td>LIBRO DE <i>GUIAS</i></td><td><b>POR REALIZAR</b></td></tr>',
      ),
    )
    expect(parsed.states).toEqual({
      basic: { text: 'EN REVISION', state: 'inReview' },
      guideBook: { text: 'POR REALIZAR', state: 'pending' },
    })
    expect(parsed.simulationAwaitsConfirmation).toBe(false)
  })

  test.each([
    ['etapa', 'INTERCAMBIO', 'exchange'],
    ['etapaColon', 'DOCUMENTOS IMPRESOS', 'printedSamples'],
    ['etapaDe', 'LIBROS', 'books'],
    ['paso', 'SET DE PRUEBAS', 'testSets'],
  ] as const)('the stage through the "%s" wording', (wording, stage, key) => {
    const parsed = parseProgressPage(progressPage(stage, {}, { wording }))
    expect(parsed.stage).toBe(stage)
    expect(parsed.stageKey).toBe(key)
  })

  test('no stage at all', () => {
    expect(parseProgressPage(page('<p>nada</p>'))).toEqual({
      stage: null,
      stageKey: 'testSets',
      states: {},
      simulationAwaitsConfirmation: false,
      receipts: null,
    })
  })
})

test('portalStageOf and classifyItemState on the wordings of the field', () => {
  expect(portalStageOf('ETAPA DE MUESTRAS IMPRESAS')).toBe('printedSamples')
  expect(portalStageOf('AUTORIZADO')).toBe('printedSamples')
  expect(portalStageOf(null)).toBe('testSets')
  expect(classifyItemState('revisado conforme')).toBe('approved')
  expect(classifyItemState('FECHA INV&Aacute;LIDA')).toBe('unknown')
  expect(classifyItemState('FECHA INVALIDA')).toBe('inconsistent')
})

describe('the receipts row of the progress page', () => {
  test('gives the bold text after the receipts cell and whether it says authorised', () => {
    expect(
      parseProgressPage(progressPage('DOCUMENTOS IMPRESOS', { 'BOLETA ELECTRONICA': 'REVISADO CONFORME' })).receipts,
    ).toEqual({
      text: 'REVISADO CONFORME',
      authorized: true,
    })
    expect(parseProgressPage(progressPage('LIBROS', { 'SET BOLETA': 'EN REVISION' })).receipts).toEqual({
      text: 'EN REVISION',
      authorized: false,
    })
    expect(parseProgressPage(progressPage('LIBROS', { Boleta: ' Autorizado ' })).receipts).toEqual({
      text: 'Autorizado',
      authorized: true,
    })
  })

  test('a wording that denies, or that is unknown, is not an authorisation', () => {
    const authorized = (text: string): boolean | undefined =>
      parseProgressPage(progressPage('LIBROS', { 'BOLETA ELECTRONICA': text })).receipts?.authorized
    for (const text of ['AUTORIZADA', 'Aprobado', 'REVISADO CONFORME']) expect(authorized(text)).toBe(true)
    for (const text of [
      'NO AUTORIZADO',
      'DESAUTORIZADA',
      'NO CONFORME',
      'INCONFORME',
      'SIN AUTORIZACION',
      'AUTORIZADO CON REPAROS',
      'AUTORIZACION PENDIENTE',
      'RECHAZADO',
      'OTRO ESTADO',
    ])
      expect(authorized(text)).toBe(false)
  })

  test('a page without a receipts row gives null, whatever its text says about receipts', () => {
    const sentence = `${progressPage('LIBROS', {})}<p>Empresa autorizada para emitir boleta electrónica</p>`
    expect(parseProgressPage(sentence).receipts).toBeNull()
    expect(parseProgressPage(progressPage('LIBROS', { 'SET BASICO': 'REVISADO CONFORME' })).receipts).toBeNull()
  })
})
