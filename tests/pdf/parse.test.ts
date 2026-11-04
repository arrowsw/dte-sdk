import { parsePrintableDocuments } from '../../src/pdf/parse'
import { extractTagContent } from '../../src/xml/parse'
import { ISSUER_RUT, RECEIVER_RUT } from '../support/fixtures'
import {
  bareSetDte,
  basicSetXml,
  creditNote,
  debitNote,
  invoice,
  receiptsXml,
  settlementXml,
  thirdPartyXml,
  withoutTed,
} from '../support/printed-fixtures'

const tag = (xml: string, name: string): number => Number(extractTagContent(xml, name))

describe('an envelope the SDK signed', () => {
  const [first, second, third] = parsePrintableDocuments(basicSetXml)

  test('yields one printable document per DTE, in order', () => {
    expect(parsePrintableDocuments(basicSetXml)).toHaveLength(3)
    expect([first.type, second.type, third.type]).toEqual([33, 61, 56])
    expect([first.folio, second.folio, third.folio]).toEqual(['7', '5', '8'])
  })

  test('copies every TED verbatim from the input and matches it by folio and type', () => {
    expect(first.tedXml).toBe(invoice.ted.xml)
    expect(second.tedXml).toBe(creditNote.ted.xml)
    expect(third.tedXml).toBe(debitNote.ted.xml)
    expect(basicSetXml).toContain(first.tedXml)
  })

  test('maps the header', () => {
    expect(first).toMatchObject({
      issueDate: '2026-11-15',
      transferReason: null,
      grossAmounts: false,
      issuer: {
        rut: ISSUER_RUT,
        name: 'Comercial Andina SpA',
        activity: 'Desarrollo de software',
        address: 'Av. Los Aromos 1540',
        commune: 'Ñuñoa',
        branch: '',
      },
      receiver: {
        rut: RECEIVER_RUT,
        name: 'Comercializadora Rapel Ltda',
        activity: 'Comercio al por menor',
        address: 'Pasaje Los Olmos 88',
        commune: 'Providencia',
      },
    })
  })

  test('maps the totals as numbers and leaves absent ones undefined', () => {
    expect(first.totals).toEqual({
      net: tag(invoice.xml, 'MntNeto'),
      exempt: undefined,
      vat: tag(invoice.xml, 'IVA'),
      vatRate: 19,
      total: tag(invoice.xml, 'MntTotal'),
    })
  })

  test('maps global adjustments, items and references', () => {
    expect(first.globalAdjustments).toEqual([{ kind: 'D', valueType: '%', value: 5 }])
    expect(first.items).toEqual([
      {
        code: 'LIC-01',
        name: 'Licencia anual de software de gestión para pequeñas empresas',
        quantity: 2,
        unit: undefined,
        unitPrice: 100000,
        amount: tag(invoice.xml, 'MontoItem'),
        discountAmount: 20000,
        discountPercent: 10,
      },
      {
        code: '',
        name: 'Soporte',
        quantity: 3,
        unit: 'HR',
        unitPrice: 15000,
        amount: 45000,
        discountAmount: undefined,
        discountPercent: undefined,
      },
    ])
    expect(first.references).toEqual([])
    expect(second.references).toEqual([
      { documentType: '33', folio: '7', date: '2026-11-15', reason: 'Anula factura' },
      { documentType: 'SET', folio: 'CASO-1', date: '2026-11-15', reason: 'Set de pruebas' },
    ])
    expect(third.globalAdjustments).toEqual([{ kind: 'R', valueType: '$', value: 2500 }])
  })
})

describe('other roots', () => {
  test('an EnvioBOLETA', () => {
    const [doc] = parsePrintableDocuments(receiptsXml)
    expect(doc).toMatchObject({ type: 39, folio: '11', grossAmounts: false, receiver: { rut: '66666666-6' } })
    expect(doc.items[0]).toMatchObject({ name: 'Café', quantity: 2 })
    expect(doc.tedXml).toContain('<TD>39</TD>')
  })

  test('a bare SetDTE and a bare DTE', () => {
    expect(parsePrintableDocuments(bareSetDte(basicSetXml))).toHaveLength(3)
    const [doc] = parsePrintableDocuments(invoice.xml)
    expect(doc.folio).toBe('7')
    expect(doc.tedXml).toBe(invoice.ted.xml)
  })

  test.each(['EnvioDTEB', 'EnvioDTETraslado'])('an %s envelope', (root) => {
    const xml = thirdPartyXml.replace('<EnvioDTE ', `<${root} `).replace('</EnvioDTE>', `</${root}>`)
    expect(parsePrintableDocuments(xml)[0].folio).toBe('100')
  })

  test('a settlement invoice lives under Liquidacion', () => {
    const [doc] = parsePrintableDocuments(settlementXml)
    expect(doc).toMatchObject({ type: 43, folio: '9', issuer: { activity: 'Comisionista' }, tedXml: '' })
  })

  test('any other root, or an envelope without documents, is an empty list', () => {
    expect(parsePrintableDocuments('<Foo><Bar/></Foo>')).toEqual([])
    expect(parsePrintableDocuments('<EnvioDTE><SetDTE/></EnvioDTE>')).toEqual([])
  })

  test('malformed XML is XML_PARSE_FAILED', () => {
    expect(() => parsePrintableDocuments('<EnvioDTE><SetDTE>')).toThrow(
      expect.objectContaining({ code: 'XML_PARSE_FAILED' }),
    )
  })
})

describe('third-party shapes', () => {
  const [doc] = parsePrintableDocuments(thirdPartyXml)

  test('issuer name from RznSocEmisor, branch, gross amounts, first of several codes, coerced quantity', () => {
    expect(doc).toMatchObject({
      grossAmounts: true,
      issuer: { name: 'Distribuidora Lican SpA', branch: 'Casa 2' },
      receiver: { name: 'Óptica Muñoz Ltda' },
    })
    expect(doc.items[0]).toEqual({
      code: '7800000000001',
      name: 'Lentes',
      quantity: 2,
      unit: 'PAR',
      unitPrice: 5950,
      amount: 11800,
      discountAmount: 100,
      discountPercent: undefined,
    })
    expect(doc.globalAdjustments).toEqual([{ kind: 'R', valueType: '$', value: 100 }])
    expect(doc.references).toEqual([
      { documentType: '801', folio: 'OC-55', date: '2026-09-30', reason: 'Orden de compra' },
    ])
  })

  test('type, folio and date fall back to the TED when IdDoc lacks them', () => {
    const xml = thirdPartyXml.replace(/<IdDoc>[\s\S]*?<\/IdDoc>/, '<IdDoc><MntBruto>1</MntBruto></IdDoc>')
    const [fallback] = parsePrintableDocuments(xml)
    expect(fallback).toMatchObject({ type: 33, folio: '100', issueDate: '2026-10-01' })
    expect(fallback.tedXml).toContain('<F>100</F>')
  })

  test('a TED that matches nothing is taken by position, and none at all is empty', () => {
    const [unmatched] = parsePrintableDocuments(
      thirdPartyXml.replace('<TipoDTE>33</TipoDTE>', '<TipoDTE>110</TipoDTE>'),
    )
    expect(unmatched.type).toBe(110)
    expect(unmatched.tedXml).toContain('<TD>33</TD>')
    const [none] = parsePrintableDocuments(withoutTed(thirdPartyXml))
    expect(none.tedXml).toBe('')
    expect(none.type).toBe(33)
  })

  test('a document with neither type nor TED is type 0', () => {
    const xml = withoutTed(thirdPartyXml).replace(/<IdDoc>[\s\S]*?<\/IdDoc>/, '<IdDoc><Folio>1</Folio></IdDoc>')
    expect(parsePrintableDocuments(xml)[0]).toMatchObject({ type: 0, folio: '1', issueDate: '' })
  })
})

describe('coercion and document elements', () => {
  test('a value that is not a number is undefined', () => {
    const [doc] = parsePrintableDocuments(thirdPartyXml.replace('<QtyItem>2.000</QtyItem>', '<QtyItem>dos</QtyItem>'))
    expect(doc.items[0].quantity).toBeUndefined()
  })

  test('an export document lives under Exportaciones', () => {
    const xml = settlementXml
      .replace(/Liquidacion/g, 'Exportaciones')
      .replace('<TipoDTE>43</TipoDTE>', '<TipoDTE>110</TipoDTE>')
    expect(parsePrintableDocuments(xml)[0]).toMatchObject({ type: 110, folio: '9' })
  })
})
