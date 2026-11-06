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
        observations: ['Item exento debe informarse como exento', ''],
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

  test('an observation is cut at its first quote, and a price drops every dot and only its first comma', () => {
    const text = [
      'CASO-1',
      'Item\tCantidad\tPrecio',
      'Viga\t1\t1,234,567',
      'Tubo\t1\t1.234,5',
      'OBSERVACION: "Clavo de 3/4" con unidad de medida en Kg."',
      'OBSERVACION: Tubo de 1/2" sin comillas',
      'OBSERVACION: "  "',
    ].join('\n')
    expect(parseReceiptsTestSet(text)).toEqual([
      {
        number: 1,
        items: [
          { name: 'Viga', quantity: 1, unitPrice: 1234, exempt: false },
          { name: 'Tubo', quantity: 1, unitPrice: 12345, exempt: false },
        ],
        observations: ['Clavo de 3/4', 'Tubo de 1/2', ''],
      },
    ])
  })

  test('the empty parts of an item line are dropped, so a tab followed by spaces does not shift the columns', () => {
    expect(parseReceiptsTestSet('CASO-1\nItem\tCantidad\tPrecio\nitem\t  1\t1000\nPan \t\t 2   300')).toEqual([
      {
        number: 1,
        items: [
          { name: 'item', quantity: 1, unitPrice: 1000, exempt: false },
          { name: 'Pan', quantity: 2, unitPrice: 300, exempt: false },
        ],
        observations: [],
      },
    ])
  })

  test('the item header and the observation line are matched in exact case', () => {
    const text = [
      'CASO-1',
      'ITEM\tCANTIDAD\tPRECIO',
      'Pan\t1\t100',
      'Observacion: no es una observacion',
      'item\tcantidad\tprecio',
      'Pan\t1\t100',
      'CASO-2',
      'Item\tCantidad\tPrecio',
      'Pan\t1\t100',
    ].join('\n')
    expect(parseReceiptsTestSet(text)).toEqual([
      { number: 1, items: [], observations: [] },
      { number: 2, items: [{ name: 'Pan', quantity: 1, unitPrice: 100, exempt: false }], observations: [] },
    ])
  })
})
