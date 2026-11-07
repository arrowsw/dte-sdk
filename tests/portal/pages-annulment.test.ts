import {
  annulledBefore,
  annulmentAnswer,
  isAlreadyAnnulled,
  nextPageButton,
  parseUnusedRanges,
  uniqueRanges,
} from '../../src/portal/pages/annulment'
import { capturedPage } from '../support/captured-pages'
import { ANNUL_OK, page, unusedRangesPage } from '../support/portal-pages'

test('ranges come from the hidden fields of each form, once each', () => {
  const html = unusedRangesPage([
    [1, 3],
    [1, 3],
    [4, 9, '01-02-2026'],
  ])
  expect(parseUnusedRanges(html)).toEqual([
    { from: 1, to: 3, quantity: 3, date: '2026-11-15' },
    { from: 4, to: 9, quantity: 6, date: '2026-02-01' },
  ])
})

test('missing quantity and date have sensible values', () => {
  const html = page(
    '<form><input name=FOLIO_INI value=5><input name=FOLIO_FIN value=6></form><form><input name=FOLIO_INI value=7></form>',
  )
  expect(parseUnusedRanges(html)).toEqual([{ from: 5, to: 6, quantity: 2, date: null }])
})

test('rows without forms fall back to columns', () => {
  const html = page(`<table>
<tr><td>15-11-2026</td><td>3</td><td>1</td><td>3</td><td>x</td></tr>
<tr><td>no fecha</td><td>--</td><td>7</td><td>9</td></tr>
<tr><td>a</td><td>b</td><td>c</td><td>d</td></tr>
<tr><td>cabecera</td></tr>
<tr><th>titulo</th></tr>
</table>`)
  expect(parseUnusedRanges(html)).toEqual([
    { from: 1, to: 3, quantity: 3, date: '2026-11-15' },
    { from: 7, to: 9, quantity: 3, date: null },
  ])
  expect(parseUnusedRanges(page('nada'))).toEqual([])
})

test('uniqueRanges keeps the first', () => {
  const range = { from: 1, to: 2, quantity: 2, date: null }
  expect(uniqueRanges([range, { ...range, quantity: 9 }])).toEqual([range])
})

test('the next page button, with or without its page', () => {
  expect(nextPageButton(unusedRangesPage([[1, 2]], 3))).toEqual({ page: 3 })
  expect(nextPageButton(page('<input type=button name=siguiente value=x>'))).toEqual({ page: null })
  expect(nextPageButton(page('<input type=button name=NEXT value=x onClick="other()">'))).toEqual({ page: null })
  expect(nextPageButton(page('<input name=a value=b>'))).toBeNull()
})

test.each([
  ['ya ha sido efectuado', true],
  ['ya fue anulado', true],
  ['efectuado anteriormente', true],
  ['fue anulado anteriormente', true],
  ['anulada anteriormente', true],
  ['otra cosa', false],
])('already annulled: %s', (text, expected) => {
  expect(isAlreadyAnnulled(page(text))).toBe(expected)
})

test.each([
  [ANNUL_OK, 'accepted'],
  [page('ha autorizado la anulaci&oacute;n'), 'accepted'],
  [page('folio recepcionado'), 'received'],
  [page('YA FUE ANULADO'), 'alreadyAnnulled'],
  [page('anulado anteriormente'), 'alreadyAnnulled'],
  [page('ya ha sido efectuado anteriormente'), 'alreadyAnnulled'],
  [page('Error 500'), 'siiError'],
  [page('Internal Server Error'), 'siiError'],
  [page('la anulacion no procede'), 'unknown'],
  [page('fue anulada y ya esta'), 'unknown'],
  [page('xxx'), 'unknown'],
] as const)('answer %#: %s', (html, answer) => {
  expect(annulmentAnswer(html)).toBe(answer)
})

describe('the pages of the procedure, as the certification environment serves them', () => {
  test.each([
    ['af_anular-ok', 'accepted'],
    ['af_anular-recepcionado', 'received'],
    ['af_anular3-ya-anulado', 'alreadyAnnulled'],
    ['af_anular1', 'unknown'],
    ['af_anular2', 'unknown'],
    ['af_anular2-pagina2', 'unknown'],
    ['af_anular3', 'unknown'],
    ['af_anular3-114', 'unknown'],
  ] as const)('%s reads as %s', (name, answer) => {
    expect(annulmentAnswer(capturedPage(name))).toBe(answer)
  })

  test('the sentences that describe the procedure are not an answer, in any case or accent', () => {
    for (const sentence of [
      'folios que no han sido recepcionados por el SII',
      'siempre y cuando no hayan sido recepcionados por el SII',
      'siempre y cuando ning&uacute;n folio haya sido recepcionado por el SII',
      'NINGUN FOLIO HAYA SIDO RECEPCIONADO POR EL SII',
    ])
      expect(annulmentAnswer(page(sentence))).toBe('unknown')
    expect(annulmentAnswer(page('no han sido recepcionados por el SII. El folio 3 fue recepcionado'))).toBe('received')
  })

  test('only the form page that was annulled before reads as such, and it lists its folios', () => {
    expect(isAlreadyAnnulled(capturedPage('af_anular3-ya-anulado'))).toBe(true)
    expect(isAlreadyAnnulled(capturedPage('af_anular3-114'))).toBe(false)
    expect(annulledBefore(capturedPage('af_anular3-ya-anulado'))).toEqual([{ from: 114, to: 114 }])
    expect(annulledBefore(page('anulado anteriormente'))).toEqual([])
  })
})
