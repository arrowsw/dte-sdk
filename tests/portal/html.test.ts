import {
  alertMessages,
  attribute,
  decodeEntities,
  formAction,
  formBlocks,
  formWithAction,
  inputTags,
  inputValues,
  namedForm,
  selectOptions,
  stripTags,
  visibleText,
} from '../../src/portal/html'

test('entities: named, decimal, hex and unknown', () => {
  expect(decodeEntities('Autenticaci&oacute;n &amp; &#241;&#xF1; &Ntilde; &bogus;!')).toBe('Autenticación & ññ Ñ  !')
})

test('tags become spaces and whitespace collapses', () => {
  expect(stripTags('<td>&nbsp;Hola <b>Mundo</b>\n</td>')).toBe('Hola Mundo')
})

test('visible text drops scripts and styles and cuts', () => {
  expect(visibleText('<style>x{}</style><script>alert("no")</script><p>sí</p>')).toBe('sí')
  expect(visibleText('<p>abcdef</p>', 3)).toBe('abc')
  expect(visibleText('x'.repeat(500))).toHaveLength(400)
})

test('attributes with double, single or no quotes; a handler is not an attribute', () => {
  expect(attribute('<input name="a">', 'name')).toBe('a')
  expect(attribute("<input name='a'>", 'name')).toBe('a')
  expect(attribute('<input name = a>', 'name')).toBe('a')
  expect(attribute('<input onblur="this.value=this.value.toUpperCase()" name=x>', 'value')).toBeNull()
})

test('inputs: unnamed ones are skipped, a repeated name keeps the last', () => {
  const html = '<input type=submit><INPUT name=a value = 1><input name="b"><input name=a value="2" onClick="go(1)">'
  expect(inputTags(html)).toEqual([
    { name: 'a', value: '1', onClick: null },
    { name: 'b', value: '', onClick: null },
    { name: 'a', value: '2', onClick: 'go(1)' },
  ])
  expect(inputValues(html)).toEqual({ a: '2', b: '' })
  expect(inputValues('')).toEqual({})
})

test('forms by position, name and action', () => {
  const html = '<form name=one action="/a"><input name=x></form><FORM name="frm2" action=/b></FORM><form></form>'
  expect(formBlocks(html)).toHaveLength(3)
  expect(formBlocks('')).toEqual([])
  expect(formAction(html)).toBe('/a')
  expect(formAction('<form></form>')).toBeNull()
  expect(formAction('nothing')).toBeNull()
  expect(namedForm(html, 'one')).toContain('name=x')
  expect(namedForm(html, /^frm\d$/)).toContain('frm2')
  expect(namedForm(html, 'absent')).toBeNull()
  expect(formWithAction(html, '/b')).toContain('frm2')
  expect(formWithAction(html, '/c')).toBeNull()
})

test('select options, or null without the select', () => {
  const html = `<SELECT name = COD onChange="x()"><option value="33">FACTURA</option><option value=39 selected>BOLETA<option>nada</select>`
  expect(selectOptions(html, 'COD')).toEqual([
    { value: '33', label: 'FACTURA' },
    { value: '39', label: 'BOLETA' },
  ])
  expect(selectOptions(html, 'OTHER')).toBeNull()
})

test('alerts: unescaped, without markup, ignoring the ones commented out', () => {
  const html = `<script>
alert('It\\'s <b>first</b>\\n&aacute;');
// alert("template branch");
var url = 'https://x'; alert("second");
alert('');
</script>`
  expect(alertMessages(html)).toEqual(["It's first á", 'second'])
  expect(alertMessages('nothing')).toEqual([])
})
