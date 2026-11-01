import { escapeXmlText, escapeXmlAttribute } from '../src/xml/escape'
import { buildXml } from '../src/xml/build'
import {
  parseXml,
  parseXmlWithoutNamespaces,
  parseXmlDom,
  extractTagContent,
  decodeXmlEntities,
} from '../src/xml/parse'
import { wrapBase64, formatBase64Columns } from '../src/xml/format'
import { DteError } from '../src/errors'

describe('escape', () => {
  test('text escapes the five XML entities', () => {
    expect(escapeXmlText(`a & b < c > d "e" 'f'`)).toBe('a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;')
    expect(escapeXmlAttribute(`x"y<z&`)).toBe('x&quot;y&lt;z&amp;')
  })
})

describe('buildXml', () => {
  test('renders attributes, nested objects, arrays and escapes values in insertion order', () => {
    const xml = buildXml({
      DTE: {
        '@_xmlns': 'http://www.sii.cl/SiiDte',
        '@_version': '1.0',
        Documento: {
          '@_ID': 'DTE_T33F1',
          Encabezado: { IdDoc: { TipoDTE: 33, Folio: 1 } },
          Detalle: [
            { NroLinDet: 1, NmbItem: "PLC'S & <X>" },
            { NroLinDet: 2, NmbItem: 'B' },
          ],
          TED: '__TED__',
        },
      },
    })
    expect(xml).toBe(
      '<DTE xmlns="http://www.sii.cl/SiiDte" version="1.0"><Documento ID="DTE_T33F1"><Encabezado><IdDoc><TipoDTE>33</TipoDTE><Folio>1</Folio></IdDoc></Encabezado><Detalle><NroLinDet>1</NroLinDet><NmbItem>PLC&apos;S &amp; &lt;X&gt;</NmbItem></Detalle><Detalle><NroLinDet>2</NroLinDet><NmbItem>B</NmbItem></Detalle><TED>__TED__</TED></Documento></DTE>',
    )
  })
})

describe('parseXml', () => {
  const caf =
    '<AUTORIZACION><CAF version="1.0"><DA><RE>76543210-3</RE><TD>33</TD><RNG><D>1</D><H>100</H></RNG><FA>2026-10-31</FA></DA></CAF><RSASK>x</RSASK></AUTORIZACION>'

  test('keeps every value as string and exposes attributes with @_', () => {
    expect(parseXml(caf)).toEqual({
      AUTORIZACION: {
        CAF: { '@_version': '1.0', DA: { RE: '76543210-3', TD: '33', RNG: { D: '1', H: '100' }, FA: '2026-10-31' } },
        RSASK: 'x',
      },
    })
  })

  test('without namespaces strips SII: prefixes', () => {
    expect(
      parseXmlWithoutNamespaces(
        '<SII:RESPUESTA xmlns:SII="x"><SII:RESP_BODY><TOKEN>abc</TOKEN></SII:RESP_BODY></SII:RESPUESTA>',
      ),
    ).toEqual({
      RESPUESTA: { RESP_BODY: { TOKEN: 'abc' } },
    })
  })

  test('throws XML_PARSE_FAILED on malformed input', () => {
    expect(() => parseXml('<a><b></a>')).toThrow(DteError)
    try {
      parseXml('<a><b></a>')
    } catch (err) {
      expect((err as DteError).code).toBe('XML_PARSE_FAILED')
    }
    expect(() => parseXmlDom('<a><b></a>')).toThrow(DteError)
    expect(() => parseXmlDom('<a>&foo;</a>')).toThrow(expect.objectContaining({ code: 'XML_PARSE_FAILED' }))
  })

  test('parseXmlDom returns a DOM with attributes in source order', () => {
    const dom = parseXmlDom('<r xmlns="n"><e b="2" a="1">t&apos;s</e></r>')
    const element = dom.getElementsByTagName('e')[0]
    expect(element.attributes[0].name).toBe('b')
    expect(element.textContent).toBe("t's")
    expect(dom.documentElement.getAttribute('xmlns')).toBe('n')
  })

  test('extractTagContent and decodeXmlEntities', () => {
    expect(extractTagContent('<r><ESTADO>00</ESTADO><SEMILLA>123</SEMILLA></r>', 'SEMILLA')).toBe('123')
    expect(extractTagContent('<r/>', 'SEMILLA')).toBeNull()
    expect(decodeXmlEntities('&lt;a&gt;&quot;x&quot;&apos;y&apos;&amp;')).toBe(`<a>"x"'y'&`)
  })
})

describe('format', () => {
  test('wrapBase64 strips whitespace and wraps at 64', () => {
    const value = 'A'.repeat(130)
    expect(wrapBase64(`${value.slice(0, 10)}\n ${value.slice(10)}`)).toBe(
      `${'A'.repeat(64)}\n${'A'.repeat(64)}\n${'A'.repeat(2)}`,
    )
    expect(wrapBase64('abc', 2)).toBe('ab\nc')
  })

  test('formatBase64Columns rewraps SignatureValue, Modulus and X509Certificate only', () => {
    const b64 = 'B'.repeat(70)
    const xml = `<Signature><SignatureValue>\n${b64}</SignatureValue><Modulus>${b64}</Modulus><X509Certificate>${b64}</X509Certificate><Other>${b64}</Other></Signature>`
    const out = formatBase64Columns(xml)
    expect(out).toContain(`<SignatureValue>${'B'.repeat(64)}\n${'B'.repeat(6)}</SignatureValue>`)
    expect(out).toContain(`<Modulus>${'B'.repeat(64)}\n${'B'.repeat(6)}</Modulus>`)
    expect(out).toContain(`<X509Certificate>${'B'.repeat(64)}\n${'B'.repeat(6)}</X509Certificate>`)
    expect(out).toContain(`<Other>${b64}</Other>`)
  })
})
