import { parseReceiptsTestSet } from '../../src/certification/receipts-set'
import { RECEIPTS_SET_TEXT } from '../support/receipts-set-samples'

describe('parseReceiptsTestSet', () => {
  test('reads every case with its items and observations, and nothing before the first case', () => {
    expect(parseReceiptsTestSet(RECEIPTS_SET_TEXT)).toEqual([
      {
        number: 1,
        items: [
          { name: 'Cambio de aceite', quantity: 1, unitPrice: 19900, exempt: false },
          { name: 'Alineacion y balanceo', quantity: 1, unitPrice: 9900, exempt: false },
        ],
        observations: [],
      },
      {
        number: 2,
        items: [{ name: 'Papel de regalo', quantity: 17, unitPrice: 120, exempt: false }],
        observations: [],
      },
      {
        number: 3,
        items: [{ name: 'Clavo galvanizado 3/4"', quantity: 3.7, unitPrice: 1190, exempt: false }],
        observations: ['Se debe informar en el XML Unidad de medida en Kg.'],
      },
      {
        number: 4,
        items: [
          { name: 'item afecto 1', quantity: 8, unitPrice: 1590, exempt: false },
          { name: 'item exento 2', quantity: 2, unitPrice: 1000, exempt: true },
        ],
        observations: ['Item exento debe informarse como exento'],
      },
    ])
  })

  test('a case without an item header has no items, and a text without cases gives nothing', () => {
    expect(parseReceiptsTestSet('CASO-9\nPan\t1\t100\nOBSERVACION: sola')).toEqual([
      { number: 9, items: [], observations: ['sola'] },
    ])
    expect(parseReceiptsTestSet('Item\tCantidad\tPrecio\nPan\t1\t100\nOBSERVACION: sin caso')).toEqual([])
    expect(parseReceiptsTestSet('')).toEqual([])
  })

  test('Windows line ends are handled like any other', () => {
    expect(parseReceiptsTestSet('CASO-1\r\nItem\tCantidad\tPrecio\r\nPan\t2\t1.500\r\n')).toEqual([
      { number: 1, items: [{ name: 'Pan', quantity: 2, unitPrice: 1500, exempt: false }], observations: [] },
    ])
  })
})
