import { RECEIPTS_PORTAL } from '../../src/catalogs/certification'
import { gwtAnswer } from '../../src/portal/gwt'
import {
  inputFieldsOf,
  isDeclaredState,
  isEmptyList,
  isReadyState,
  isReceiptsSet,
  offeredTypes,
  postulationOf,
  receiptsComplianceBody,
  receiptsProgressRow,
  representativeDigitsOf,
  stampingAction,
  stateNamedIn,
} from '../../src/portal/pages/receipts-certification'
import { EMPTY_OK, EXCEPTION, okAnswer } from '../support/gwt-answers'

const REPRESENTATIVES = okAnswer(
  [2, 1],
  ['java.util.ArrayList/4159755760', 'cl.sii.sdi.diii.certBolElectDte.to.RepreTo/1', '9', '11111111', '5', '12345678'],
)

describe('the receipts portal answers', () => {
  test('the representative is the last string of 7 or 8 digits, none on an empty table', () => {
    expect(representativeDigitsOf(gwtAnswer(REPRESENTATIVES))).toBe('12345678')
    expect(representativeDigitsOf(gwtAnswer(okAnswer([1], ['x', '1234567'])))).toBe('1234567')
    expect(representativeDigitsOf(gwtAnswer(EMPTY_OK))).toBeNull()
    expect(representativeDigitsOf(gwtAnswer(okAnswer([1], ['123456', '123456789'])))).toBeNull()
  })

  test('the application record gives the authorisation date and the Long as written; without a Long it is no record', () => {
    const answer = gwtAnswer('//OK[3,\'BAqo\',2,1,["cl.sii.x/1","15/11/2026","otro"],0,7]')
    expect(postulationOf(answer)).toEqual({ authorizationDate: '15/11/2026', token: 'BAqo' })
    // A record without a date keeps the date empty, as the field declares it.
    expect(postulationOf(gwtAnswer('//OK[3,\'BAqo\',2,1,["cl.sii.x/1","otro"],0,7]'))).toEqual({
      authorizationDate: '',
      token: 'BAqo',
    })
    // No default stands in for the Long: a record without one is no record.
    expect(postulationOf(gwtAnswer(EMPTY_OK))).toBeNull()
    expect(postulationOf(gwtAnswer('//OK[3,2,1,["cl.sii.x/1","15/11/2026"],0,7]'))).toBeNull()
    expect(postulationOf(gwtAnswer('//EX[3,\'BAqo\',2,1,["cl.sii.x/1","15/11/2026"],0,7]'))).toBeNull()
    // The Long is a token of the GWT alphabet: quoted text that is no Long, a separator inside it included, is none.
    const quoted = '//OK[3,\'x|9|8\',2,1,["cl.sii.x/1","15/11/2026","Comercial \'La Esquina\' SpA"],0,7]'
    expect(postulationOf(gwtAnswer(quoted))).toBeNull()
  })

  test('the states are read on the raw body: P90 and P91 anywhere, the first quoted P code as the state', () => {
    expect(isReadyState(okAnswer([1], ['x', 'P90']))).toBe(true)
    expect(isReadyState(okAnswer([1], ['La empresa no esta en estado P90']))).toBe(true)
    expect(isReadyState('//EX[1,["P90"],0,7]')).toBe(true)
    expect(isReadyState(okAnswer([1], ['x', 'P91']))).toBe(false)
    expect(isReadyState(EMPTY_OK)).toBe(false)
    expect(isDeclaredState(okAnswer([1], ['x', 'P91']))).toBe(true)
    expect(isDeclaredState('<html>P91</html>')).toBe(true)
    expect(isDeclaredState(okAnswer([1], ['x', 'P90']))).toBe(false)
    expect(stateNamedIn(okAnswer([1], ['x', 'P05', 'P91']))).toBe('P05')
    expect(stateNamedIn('<html>"P90"</html>')).toBe('P90')
    expect(stateNamedIn(okAnswer([1], ['xP90', 'P90x', 'P']))).toBeNull()
    expect(stateNamedIn(EMPTY_OK)).toBeNull()
  })

  test('an empty list is an //OK answer that starts with a zero count and an empty table, wherever it starts', () => {
    expect(isEmptyList(EMPTY_OK)).toBe(true)
    expect(isEmptyList(`  ${EMPTY_OK}`)).toBe(true)
    expect(isEmptyList(okAnswer([1], ['P90']))).toBe(false)
    expect(isEmptyList(EXCEPTION)).toBe(false)
  })

  test('a set is ten characters of text or more, whatever the HTTP status was', () => {
    expect(isReceiptsSet('CASO-1\nItem')).toBe(true)
    expect(isReceiptsSet('   corto   ')).toBe(false)
    expect(isReceiptsSet('')).toBe(false)
  })
})

describe('the stamping form, read as the field reads it', () => {
  test('the action is the first form tag with a double-quoted action, resolved against the host', () => {
    const host = 'https://palena.sii.cl'
    expect(stampingAction('<form name=a><form method=post action="/cvc_cgi/dte/of_x">', host)).toBe(
      'https://palena.sii.cl/cvc_cgi/dte/of_x',
    )
    expect(stampingAction('<FORM action="of_relative">', host)).toBe('https://palena.sii.cl/cvc_cgi/dte/of_relative')
    expect(stampingAction('<form action="https://otro.sii.cl/x">', host)).toBe('https://otro.sii.cl/x')
    expect(stampingAction('<form action=sin_comillas>', host)).toBe(
      'https://palena.sii.cl/cvc_cgi/dte/of_solicita_folios_dcto',
    )
    expect(stampingAction('', host)).toBe('https://palena.sii.cl/cvc_cgi/dte/of_solicita_folios_dcto')
  })

  test('the fields are the named inputs, with double, single or no quotes, empty when they have no value', () => {
    const html = [
      '<input type=hidden name="A" value="1">',
      "<input name='B' value='dos'>",
      '<input type=hidden name=C value = 3>',
      '<input name=D>',
      '<input value="sin nombre">',
      '<input name="E" onblur="this.value=this.value.toUpperCase()" value="e">',
      '<input name="A" value="otra">',
    ].join('\n')
    expect(inputFieldsOf(html)).toEqual({ A: 'otra', B: 'dos', C: '3', D: '', E: 'e' })
    expect(inputFieldsOf('sin campos')).toEqual({})
  })

  test('the types are the positive integers of the options with a quoted value, anywhere in the page', () => {
    const html =
      '<option value="33">F</option><option value=39>unquoted</option><option class=x value="0">c</option><option value="-1">n</option><OPTION VALUE="39" selected>B</OPTION><option value="41">E'
    expect(offeredTypes(html)).toEqual([33, 39, 41])
    expect(offeredTypes('nada')).toEqual([])
  })
})

describe('the progress page, read as the field reads it', () => {
  const row = (state: string): string => `<tr><td>BOLETA ELECTRONICA</td><td><b>${state}</b></td></tr>`

  test('the receipts row is authorised when its state says conform, approved or authorised, in any case', () => {
    for (const state of ['REVISADO CONFORME', 'Aprobado', 'AUTORIZADA', 'NO AUTORIZADO'])
      expect(receiptsProgressRow(row(state))).toEqual({ authorized: true, state })
    expect(receiptsProgressRow(row(' PENDIENTE '))).toEqual({ authorized: false, state: 'PENDIENTE' })
  })

  test('without a state in the row, a line of the page that says authorised and receipt gives AUTORIZADA', () => {
    expect(receiptsProgressRow('<p>La boleta esta autorizada</p>')).toEqual({ authorized: true, state: 'AUTORIZADA' })
    expect(receiptsProgressRow('<p>Empresa autorizada para boleta</p>')).toEqual({
      authorized: true,
      state: 'AUTORIZADA',
    })
    expect(receiptsProgressRow(row('   ') + '<p>Boleta autorizada</p>')).toEqual({
      authorized: true,
      state: 'AUTORIZADA',
    })
    expect(receiptsProgressRow('<p>autorizada\nboleta</p>')).toEqual({ authorized: false, state: null })
    expect(receiptsProgressRow(row('   '))).toEqual({ authorized: false, state: '' })
    expect(receiptsProgressRow('<tr><td>SET BASICO</td><td><b>REVISADO CONFORME</b></td></tr>')).toEqual({
      authorized: false,
      state: null,
    })
  })
})

describe('the declaration body', () => {
  const values = {
    moduleBase: RECEIPTS_PORTAL.base,
    policy: RECEIPTS_PORTAL.known.policy,
    serviceInterface: RECEIPTS_PORTAL.serviceInterface,
    company: { digits: '76543210', verifier: '3' },
    provider: { digits: '10000004', verifier: '0' },
    representative: { digits: '12345678', verifier: '5' },
    date: '15-11-2026',
    providerMail: 'soporte@example.test',
    providerName: 'Proveedor de Software SpA',
    link: 'www.sii.cl',
    authorizationDate: '10/11/2026',
    token: 'BAqo',
    businessName: 'Comercial Andina SpA',
  }

  test('is the 24-string table and the fixed sequence with the values in their places', () => {
    expect(receiptsComplianceBody(values)).toBe(
      [
        '7|0|24',
        RECEIPTS_PORTAL.base,
        RECEIPTS_PORTAL.known.policy,
        RECEIPTS_PORTAL.serviceInterface,
        'autorizarEmpresaBolProd',
        'cl.sii.sdi.diii.certBolElectDte.to.PostulSegHistInsUpdTo/138688689',
        'P91',
        'BVE',
        'java.lang.Integer/3438268394',
        '3',
        'cl.sii.sdi.diii.certBolElectDte.to.TdtEmpresaAutorizadaTo/2240026086',
        '0',
        '5',
        'SII',
        '15-11-2026',
        'soporte@example.test',
        'Proveedor de Software SpA',
        '19',
        'S',
        'www.sii.cl',
        'java.util.ArrayList/4159755760',
        'cl.sii.sdi.diii.certBolElectDte.to.DocumentoAutorizadoTo/493967287',
        '10/11/2026',
        'java.lang.Long/4227064769',
        'Comercial Andina SpA',
        '1|2|3|4|1|5|5|6|0|7|8|90|0|0|0|0|9|0|10|0|7|9|11|12|13|14|14|14|15|16|17|18|8|76543210|8|10000004|8|12345678|19|14|14|0|20|2|21|0|0|9|12|22|0|0|0|0|0|0|8|76543210|8|12345678|23|BAqo|-11|8|39|0|21|0|0|9|12|22|0|0|0|0|0|0|8|76543210|8|12345678|-11|-11|8|41|0|0|24|-11|0|8|76543210|0|0|',
      ].join('|'),
    )
  })

  test('a pipe or a backslash in a value is escaped, so the table keeps its 24 strings', () => {
    const body = receiptsComplianceBody({ ...values, businessName: 'A|B\\C', providerName: 'Uno | Dos' })
    expect(body).toContain('|A\\!B\\\\C|')
    expect(body).toContain('|Uno \\! Dos|')
    expect(body.startsWith('7|0|24|')).toBe(true)
  })
})
