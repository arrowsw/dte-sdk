import {
  firstValues,
  folioOf,
  formFields,
  isFirewallRejection,
  isSignatureRefused,
  sendOutcome,
  signedDocumentOf,
  signForm,
  signingTimeOf,
  siiCodeOf,
} from '../../src/portal/pages/free-system'

// Written by hand on the markup the free invoicing system is described with: every name and number is invented.
describe('formFields', () => {
  test('inputs, selects and textareas in the order of the page, a repeated name repeated', () => {
    const html = `<form name=x>
<input type=hidden name=A value="1"><input name=B value='dos &amp; tres'><input type=button value=Sin>
<select name=PAGO><option value=1>Contado<option value="2" selected>Cr&eacute;dito</select>
<textarea name=NOTA>a &lt;b&gt; c</textarea>
<input name=A value=4><input name=VACIO>
</form>`
    expect(formFields(html)).toEqual([
      ['A', '1'],
      ['B', 'dos & tres'],
      ['PAGO', '2'],
      ['NOTA', 'a <b> c'],
      ['A', '4'],
      ['VACIO', ''],
    ])
  })

  test('a select posts its last selected option, else its first, else nothing', () => {
    const select = (options: string): string => `<select name="S">${options}</select>`
    expect(formFields(select('<option value=a selected>A<option value=b selected>B'))).toEqual([['S', 'b']])
    expect(formFields(select('<option value=a>A<option value=b>B'))).toEqual([['S', 'a']])
    expect(formFields(select('<option>Sin valor'))).toEqual([['S', '']])
    expect(formFields(select(''))).toEqual([['S', '']])
    expect(formFields('<select><option value=1>x</select>')).toEqual([])
  })

  test('a page with no fields has none', () => {
    expect(formFields('<p>nada</p>')).toEqual([])
  })
})

test('firstValues keeps the first value of a repeated name', () => {
  expect(
    firstValues([
      ['A', '1'],
      ['A', '2'],
      ['B', ''],
    ]),
  ).toEqual({ A: '1', B: '' })
})

describe('signForm', () => {
  test('the signing form, its action decoded, and only its own fields', () => {
    const html = `<form name="PreViewDTE" action="mipeGenXMLFirma.cgi"><input name=OTRO value=1></form>
<FORM NAME="FRMSIGN" method=post action="mipeSendXML.cgi?a=1&amp;b=2"><input name=TMST_SIGN value="2026-11-15T15:30:00"></FORM>`
    expect(signForm(html)).toEqual({
      action: 'mipeSendXML.cgi?a=1&b=2',
      fields: [['TMST_SIGN', '2026-11-15T15:30:00']],
    })
  })

  test('no action is an empty one, and a page without the form has none', () => {
    expect(signForm('<form name=frmSign><input name=A value=1></form>')).toEqual({ action: '', fields: [['A', '1']] })
    expect(signForm('<form name=otro></form>')).toBeNull()
  })
})

test('the folio and the signing time of a document', () => {
  expect(folioOf('<IdDoc><Folio> 1001 </Folio></IdDoc>')).toBe(1001)
  expect(folioOf('<IdDoc></IdDoc>')).toBeNull()
  expect(signingTimeOf('<TmstFirma>2026-11-15T15:30:05</TmstFirma>')).toBe('2026-11-15T15:30:05')
  expect(signingTimeOf('<DTE/>')).toBeNull()
})

describe('signedDocumentOf', () => {
  const signed = '<?xml version="1.0"?><DTE><Signature/></DTE>'

  test('the signed document as plain text, with or without a declaration', () => {
    expect(signedDocumentOf(`  ${signed}\n`)).toBe(signed)
    expect(signedDocumentOf('<DTE version="1.0"><Signature/></DTE>')).toBe('<DTE version="1.0"><Signature/></DTE>')
  })

  test('the signed document inside a JSON answer, with or without the prefix', () => {
    expect(signedDocumentOf(JSON.stringify({ status: 0, text: signed }))).toBe(signed)
    expect(signedDocumentOf(`while(1);${JSON.stringify({ statusCode: '0', text: signed })}`)).toBe(signed)
  })

  test('no signature, a status that is not 0 or an answer that is not a document is nothing', () => {
    expect(signedDocumentOf('<?xml version="1.0"?><DTE/>')).toBeNull()
    expect(signedDocumentOf(JSON.stringify({ status: 2, text: 'clave no corresponde' }))).toBeNull()
    expect(signedDocumentOf(JSON.stringify({ status: 0, text: 5 }))).toBeNull()
    expect(signedDocumentOf(JSON.stringify({ text: signed }))).toBeNull()
    expect(signedDocumentOf('null')).toBeNull()
    expect(signedDocumentOf('5')).toBeNull()
    expect(signedDocumentOf('<html>error</html>')).toBeNull()
  })
})

test('the words of a refused signature, of the firewall and of a support code', () => {
  expect(isSignatureRefused('Error: Clave no  corresponde')).toBe(true)
  expect(isSignatureRefused('<DTE/>')).toBe(false)
  expect(isFirewallRejection('<html><title>Request Rejected</title>The requested URL was rejected.</html>')).toBe(true)
  expect(isFirewallRejection('<html>ok</html>')).toBe(false)
  expect(siiCodeOf('Error al contribuyente. CODIGO: 02.35.209.44.1')).toBe('02.35.209.44.1')
  expect(siiCodeOf('Error al contribuyente')).toBeNull()
})

describe('sendOutcome', () => {
  test('the id from the page, or from the redirect', () => {
    expect(sendOutcome('<a href="mipeDisplayPDF.cgi?DHDR_CODIGO=900000001">PDF</a>', '')).toEqual({
      documentId: '900000001',
      confirmed: true,
    })
    expect(sendOutcome('', 'mipeGesDocEmi.cgi?DHDR_CODIGO=900000002')).toEqual({
      documentId: '900000002',
      confirmed: true,
    })
  })

  test('the words of a sent document confirm it without an id', () => {
    expect(sendOutcome('Documento Firmado y Enviado', '')).toEqual({ documentId: null, confirmed: true })
    expect(sendOutcome('DOCUMENTO ENVIADO EXITOSAMENTE', '')).toEqual({ documentId: null, confirmed: true })
  })

  test('a signature not recognized, or a page that says nothing, confirms nothing', () => {
    expect(sendOutcome('Firma no reconocida DHDR_CODIGO=900000003', '')).toEqual({
      documentId: '900000003',
      confirmed: false,
    })
    expect(sendOutcome('<html>?</html>', '')).toEqual({ documentId: null, confirmed: false })
  })
})
