import { isHistoryUnauthorized, parseBookHistory } from '../../src/portal/pages/certification-books'
import { bookHistoryPage, HISTORY_EXPIRED, HISTORY_UNAUTHORIZED } from '../support/certification-pages'
import { page } from '../support/portal-pages'

test('six-cell rows become entries; headers and odd periods are ignored', () => {
  const entries = parseBookHistory(
    bookHistoryPage([
      ['2026-10', 'COMPRA', 'Recibido', 'LIBRO', 'MENSUAL', 'AB12'],
      ['2026-09', 'VENTA', 'Recibido', 'LIBRO', 'RECTIFICA', null],
      ['Total', 'x', 'y', 'z', 'w', null],
    ]),
  )
  expect(entries).toEqual([
    {
      period: '2026-10',
      operation: 'purchase',
      state: 'Recibido',
      kind: 'LIBRO',
      periodicity: 'monthly',
      code: 'AB12',
    },
    {
      period: '2026-09',
      operation: 'sale',
      state: 'Recibido',
      kind: 'LIBRO',
      periodicity: 'rectification',
      code: null,
    },
  ])
})

test('rows without `</tr>`, a link without Codigo, and short rows', () => {
  const html = page(
    '<table><tr><td>2026-08<td>COMPRA<td>Recibido<td>LIBRO<td>MENSUAL<td><a href="QDetEstLibro?x=1">1</a><tr><td>2026-07<td>VENTA</table>',
  )
  expect(parseBookHistory(html)).toEqual([
    { period: '2026-08', operation: 'purchase', state: 'Recibido', kind: 'LIBRO', periodicity: 'monthly', code: null },
  ])
})

test('the unauthorized and expired wordings', () => {
  expect(isHistoryUnauthorized(HISTORY_UNAUTHORIZED)).toBe(true)
  expect(isHistoryUnauthorized(HISTORY_EXPIRED)).toBe(true)
  expect(isHistoryUnauthorized(bookHistoryPage([]))).toBe(false)
})
