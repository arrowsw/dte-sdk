import { canonicalizeElement, findElement } from '../src/xml/c14n'
import { parseXmlDom } from '../src/xml/parse'
import { DteError } from '../src/errors'

const NS = 'http://www.sii.cl/SiiDte'
const XSI = 'http://www.w3.org/2001/XMLSchema-instance'
const DSIG = 'http://www.w3.org/2000/09/xmldsig#'

const c14n = (xml: string, tag: string) => canonicalizeElement(findElement(parseXmlDom(xml), tag))

describe('canonicalizeElement', () => {
  test('apex inherits xmlns and xmlns:xsi from the root, then its own attributes', () => {
    const xml = `<DTE xmlns="${NS}" xmlns:xsi="${XSI}" version="1.0"><Documento ID="F1T33"><A>1</A></Documento></DTE>`
    expect(c14n(xml, 'Documento')).toBe(`<Documento xmlns="${NS}" xmlns:xsi="${XSI}" ID="F1T33"><A>1</A></Documento>`)
  })

  test('apostrophe and double quote stay literal in text; & < > and CR are escaped', () => {
    const xml = `<DTE xmlns="${NS}" xmlns:xsi="${XSI}"><Documento ID="X"><NmbItem>MANTENCION DE UPS&apos;s 10KVA</NmbItem><Nota>Cable de 3&quot; a &amp; b &lt; c &gt; d&#xD;</Nota></Documento></DTE>`
    const out = c14n(xml, 'Documento')
    expect(out).toContain("UPS's 10KVA")
    expect(out).toContain('Cable de 3" a &amp; b &lt; c &gt; d&#xD;')
    expect(out).not.toContain('&apos;')
    expect(out).not.toContain('&quot;')
  })

  test('children omit an xmlns equal to the inherited one and keep a different one', () => {
    const xml = `<EnvioDTE xmlns="${NS}" xmlns:xsi="${XSI}" version="1.0"><SetDTE ID="S"><DTE xmlns="${NS}" xmlns:xsi="${XSI}" version="1.0"><Documento ID="D"><A>1</A></Documento><Signature xmlns="${DSIG}"><SignedInfo><X/></SignedInfo></Signature></DTE></SetDTE></EnvioDTE>`
    expect(c14n(xml, 'SetDTE')).toBe(
      `<SetDTE xmlns="${NS}" xmlns:xsi="${XSI}" ID="S"><DTE version="1.0"><Documento ID="D"><A>1</A></Documento><Signature xmlns="${DSIG}"><SignedInfo><X></X></SignedInfo></Signature></DTE></SetDTE>`,
    )
  })

  test('nested SignedInfo gets dsig xmlns from Signature and xmlns:xsi from the root', () => {
    const xml = `<DTE xmlns="${NS}" xmlns:xsi="${XSI}"><Documento ID="D"/><Signature xmlns="${DSIG}"><SignedInfo><CanonicalizationMethod Algorithm="c"/></SignedInfo></Signature></DTE>`
    expect(c14n(xml, 'SignedInfo')).toBe(
      `<SignedInfo xmlns="${DSIG}" xmlns:xsi="${XSI}"><CanonicalizationMethod Algorithm="c"></CanonicalizationMethod></SignedInfo>`,
    )
  })

  test('attributes are sorted: xmlns, xmlns:*, then by name; values are escaped', () => {
    const xml = `<r xmlns="n"><e z="1" a="x&quot;y&lt;" xmlns:b="B"><f xmlns:a="A" xmlns:b="B"/></e></r>`
    expect(c14n(xml, 'e')).toBe('<e xmlns="n" xmlns:b="B" a="x&quot;y&lt;" z="1"><f xmlns:a="A"></f></e>')
  })

  test('keeps newline text nodes, treats CDATA as text and drops comments', () => {
    const xml = `<r><d><![CDATA[a<b]]><!-- no -->\n<x/></d></r>`
    expect(c14n(xml, 'd')).toBe('<d>a&lt;b\n<x></x></d>')
  })

  test('digest-relevant output is stable for plain content', () => {
    const xml = `<DTE xmlns="${NS}" xmlns:xsi="${XSI}"><Documento ID="F2T33"><Detalle><NmbItem>Panuelo AFECTO</NmbItem><Extra>a &amp; b &lt; c</Extra></Detalle></Documento></DTE>`
    expect(c14n(xml, 'Documento')).toBe(
      `<Documento xmlns="${NS}" xmlns:xsi="${XSI}" ID="F2T33"><Detalle><NmbItem>Panuelo AFECTO</NmbItem><Extra>a &amp; b &lt; c</Extra></Detalle></Documento>`,
    )
  })

  test('findElement throws when the tag is missing', () => {
    expect(() => findElement(parseXmlDom('<a/>'), 'b')).toThrow(DteError)
  })
})
