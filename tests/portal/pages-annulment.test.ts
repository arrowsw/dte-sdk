import {
  annulmentRefusal,
  isAlreadyAnnulled,
  isAnnulmentAccepted,
  isAnnulmentConflict,
  nextPageButton,
  parseUnusedRanges,
  uniqueRanges,
} from '../../src/portal/pages/annulment'
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

test('accepted and conflict', () => {
  expect(isAnnulmentAccepted(ANNUL_OK)).toBe(true)
  expect(isAnnulmentAccepted(page('ha autorizado la anulaci&oacute;n'))).toBe(true)
  expect(isAnnulmentAccepted(page('no'))).toBe(false)
  for (const text of ['ya ha sido efectuado', 'ya fue anulado', 'efectuado anteriormente', 'folio recepcionado'])
    expect(isAnnulmentConflict(page(text))).toBe(true)
  expect(isAnnulmentConflict(page('otra'))).toBe(false)
})

test.each([
  ['folio recepcionado', 'received'],
  ['YA FUE ANULADO', 'alreadyAnnulled'],
  ['anulado anteriormente', 'alreadyAnnulled'],
  ['ya ha sido efectuado anteriormente', 'alreadyAnnulled'],
  ['fue anulada y ya esta', 'alreadyAnnulled'],
  ['la anulacion no procede', 'refused'],
  ['Error 500', 'siiError'],
  ['Internal Server Error', 'siiError'],
  ['xxx', 'unknown'],
] as const)('refusal %s', (text, reason) => {
  expect(annulmentRefusal(text)).toBe(reason)
})
