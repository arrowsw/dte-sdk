import { escapeXmlText, escapeXmlAttribute, escapeXmlMarkup } from '../src/xml/escape'
import { buildXml } from '../src/xml/build'
import {
  parseXml,
  parseXmlWithReferences,
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

  test('markup escapes only the ampersand and the angle brackets', () => {
    expect(escapeXmlMarkup(`a & b < c > d "e" 'f'`)).toBe(`a &amp; b &lt; c &gt; d "e" 'f'`)
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
            { NroLinDet: 1, NmbItem: "UPS'S & <X>" },
            { NroLinDet: 2, NmbItem: 'B' },
          ],
          TED: '__TED__',
        },
      },
    })
    expect(xml).toBe(
      '<DTE xmlns="http://www.sii.cl/SiiDte" version="1.0"><Documento ID="DTE_T33F1"><Encabezado><IdDoc><TipoDTE>33</TipoDTE><Folio>1</Folio></IdDoc></Encabezado><Detalle><NroLinDet>1</NroLinDet><NmbItem>UPS&apos;S &amp; &lt;X&gt;</NmbItem></Detalle><Detalle><NroLinDet>2</NroLinDet><NmbItem>B</NmbItem></Detalle><TED>__TED__</TED></Documento></DTE>',
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

describe('parseXmlWithReferences', () => {
  test('decodes numeric character references as a DOM does, where parseXml keeps them', () => {
    const xml = '<?xml version="1.0"?><a b="&#67;"><c>&#209;&#xD1;&#x1F600; &amp;#67; &lt;&gt;&quot;&apos;</c></a>'
    expect(parseXmlWithReferences(xml)).toEqual({
      '?xml': { '@_version': '1.0' },
      a: { '@_b': 'C', c: 'ÑÑ😀 &#67; <>"\'' },
    })
    expect((parseXml(xml) as { a: { c: string } }).a.c).toBe('&#209;&#xD1;&#x1F600; &#67; <>"\'')
  })

  test('a reference to a character XML does not allow, and a named entity, stay as written', () => {
    expect(parseXmlWithReferences('<a>&#0;&#xD800;&#xFFFE;&#1114112;&nbsp;&#9;&#10;&#13;x</a>')).toEqual({
      a: '&#0;&#xD800;&#xFFFE;&#1114112;&nbsp;\t\n\rx',
    })
  })

  test('an entity a DOCTYPE declares is not expanded', () => {
    expect(parseXmlWithReferences('<!DOCTYPE a [<!ENTITY x "y">]><a>&x;</a>')).toEqual({ a: '&x;' })
  })
})

describe('parseXmlDom depth', () => {
  const nested = (depth: number): string => `${'<a>'.repeat(depth)}${'</a>'.repeat(depth)}`

  test('a document 100 elements deep is read; one deeper is XML_PARSE_FAILED', () => {
    expect(parseXmlDom(nested(100)).documentElement.tagName).toBe('a')
    expect(() => parseXmlDom(nested(101))).toThrow(
      expect.objectContaining({ code: 'XML_PARSE_FAILED', details: { reason: 'nested deeper than 100 elements' } }),
    )
  })

  test('text, comments and siblings do not count as depth', () => {
    const wide = `<r>${'<!-- c --><a>x</a>'.repeat(500)}${nested(98)}</r>`
    expect(parseXmlDom(wide).documentElement.childNodes.length).toBe(1001)
  })
})
