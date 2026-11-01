import { buildSoapEnvelope, parseSoapResponse, SOAP_HEADERS, stripNamespacePrefixes } from '../../src/sii/soap'
import { decodeXmlEntities } from '../../src/xml/parse'

const SOAPENV = 'http://schemas.xmlsoap.org/soap/envelope/'

describe('buildSoapEnvelope', () => {
  test('DTEWS style: unqualified operation, escaped parameter text', () => {
    expect(buildSoapEnvelope({ method: 'getSeed' })).toBe(
      `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="${SOAPENV}"><soapenv:Body><getSeed></getSeed></soapenv:Body></soapenv:Envelope>`,
    )
    expect(
      buildSoapEnvelope({ method: 'getToken', params: [{ name: 'pszXml', value: '<getToken>&</getToken>' }] }),
    ).toContain('<getToken><pszXml>&lt;getToken&gt;&amp;&lt;/getToken&gt;</pszXml></getToken>')
  })

  test('WSRECLAMO style: qualified operation, unqualified parameters in order', () => {
    const xml = buildSoapEnvelope({
      method: 'ingresarAceptacionReclamoDoc',
      namespace: 'http://ws.registroreclamodte.diii.sdi.sii.cl',
      params: [
        { name: 'rutEmisor', value: '10000004' },
        { name: 'dvEmisor', value: '0' },
        { name: 'tipoDoc', value: '33' },
        { name: 'folio', value: '45' },
        { name: 'accionDoc', value: 'ACD' },
      ],
    })
    expect(xml).toContain(
      `<soapenv:Envelope xmlns:soapenv="${SOAPENV}" xmlns:ws="http://ws.registroreclamodte.diii.sdi.sii.cl">`,
    )
    expect(xml).toContain(
      '<ws:ingresarAceptacionReclamoDoc><rutEmisor>10000004</rutEmisor><dvEmisor>0</dvEmisor><tipoDoc>33</tipoDoc><folio>45</folio><accionDoc>ACD</accionDoc></ws:ingresarAceptacionReclamoDoc>',
    )
  })

  test('a signed seed travels XML-escaped inside pszXml and round-trips', () => {
    const signedSeed =
      '<getToken><item><Semilla>000000000078</Semilla></item><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignatureValue>a&b\'c</SignatureValue></Signature></getToken>'
    const xml = buildSoapEnvelope({ method: 'getToken', params: [{ name: 'pszXml', value: signedSeed }] })
    const carried = /<pszXml>([^]*)<\/pszXml>/.exec(xml)?.[1] ?? ''
    expect(carried).not.toMatch(/[<>"']/)
    expect(carried).toContain('&lt;getToken&gt;&lt;item&gt;&lt;Semilla&gt;000000000078')
    expect(carried).toContain('xmlns=&quot;http://www.w3.org/2000/09/xmldsig#&quot;')
    expect(carried).toContain('a&amp;b&apos;c')
    expect(decodeXmlEntities(carried)).toBe(signedSeed)
  })

  test('parameters keep their order and an empty value stays an empty element', () => {
    expect(
      buildSoapEnvelope({
        method: 'getEstUp',
        params: [
          { name: 'RutCompania', value: '10000004' },
          { name: 'Token', value: '' },
        ],
      }),
    ).toContain('<getEstUp><RutCompania>10000004</RutCompania><Token></Token></getEstUp>')
  })

  test('headers', () => {
    expect(SOAP_HEADERS).toEqual({ 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' })
  })
})

describe('stripNamespacePrefixes', () => {
  test('removes element prefixes only', () => {
    expect(stripNamespacePrefixes('<?xml version="1.0"?><ns1:a xsi:type="xsd:string"><b:c>1</b:c></ns1:a>')).toBe(
      '<?xml version="1.0"?><a xsi:type="xsd:string"><c>1</c></a>',
    )
  })
})

describe('parseSoapResponse', () => {
  test('DTEWS: unescapes the XML carried inside *Return, including numeric entities', () => {
    const reply =
      `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="${SOAPENV}"><soapenv:Body><ns1:getSeedResponse xmlns:ns1="http://DefaultNamespace"><ns1:getSeedReturn xsi:type="xsd:string">` +
      '&lt;?xml version=&quot;1.0&quot; encoding=&quot;UTF-8&quot;?&gt;&#xd;\n&lt;SII:RESPUESTA xmlns:SII=&quot;http://www.sii.cl/XMLSchema&quot;&gt;&lt;SII:RESP_HDR&gt;&lt;ESTADO&gt;00&lt;/ESTADO&gt;&lt;/SII:RESP_HDR&gt;&lt;SII:RESP_BODY&gt;&lt;SEMILLA&gt;000000000078&lt;/SEMILLA&gt;&lt;/SII:RESP_BODY&gt;&lt;/SII:RESPUESTA&gt;' +
      '</ns1:getSeedReturn></ns1:getSeedResponse></soapenv:Body></soapenv:Envelope>'
    const parsed = parseSoapResponse(reply)
    expect(parsed.fault).toBeNull()
    expect(parsed.returnXml).toBeNull()
    expect(parsed.returnValue).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\r\n<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema"><SII:RESP_HDR><ESTADO>00</ESTADO></SII:RESP_HDR><SII:RESP_BODY><SEMILLA>000000000078</SEMILLA></SII:RESP_BODY></SII:RESPUESTA>',
    )
  })

  test('WSRECLAMO: returns the inner XML of <return> with prefixes stripped', () => {
    const reply = `<soapenv:Envelope xmlns:soapenv="${SOAPENV}"><soapenv:Body><ns2:listarEventosHistDocResponse xmlns:ns2="http://ws.registroreclamodte.diii.sdi.sii.cl"><ns2:return><codResp>15</codResp><descResp>Lista</descResp><listaEventosDoc><codEvento>ACD</codEvento></listaEventosDoc></ns2:return></ns2:listarEventosHistDocResponse></soapenv:Body></soapenv:Envelope>`
    expect(parseSoapResponse(reply).returnXml).toBe(
      '<codResp>15</codResp><descResp>Lista</descResp><listaEventosDoc><codEvento>ACD</codEvento></listaEventosDoc>',
    )
    expect(parseSoapResponse(reply).returnValue).toBeNull()
  })

  test('faults', () => {
    const reply = `<soapenv:Envelope xmlns:soapenv="${SOAPENV}"><soapenv:Body><soapenv:Fault><faultcode>soapenv:Server</faultcode><faultstring>Error de Autenticacion: TOKEN invalido</faultstring></soapenv:Fault></soapenv:Body></soapenv:Envelope>`
    expect(parseSoapResponse(reply).fault).toEqual({
      code: 'soapenv:Server',
      reason: 'Error de Autenticacion: TOKEN invalido',
    })
    expect(parseSoapResponse('<Envelope><Body><Fault/></Body></Envelope>').fault).toEqual({
      code: 'Unknown',
      reason: '',
    })
  })

  test('a Return element with an empty body is an empty string, other operations work the same', () => {
    expect(
      parseSoapResponse('<s:Body><ns1:getTokenReturn xsi:type="xsd:string"></ns1:getTokenReturn></s:Body>').returnValue,
    ).toBe('')
    expect(
      parseSoapResponse(
        '<s:Body><ns1:getEstUpReturn xsi:type="xsd:string">&lt;a&gt;1&lt;/a&gt;</ns1:getEstUpReturn></s:Body>',
      ).returnValue,
    ).toBe('<a>1</a>')
  })

  test('decodes entities in a single pass: an escaped ampersand never starts a second entity', () => {
    const reply = (payload: string): string => `<s:Body><ns1:getSeedReturn>${payload}</ns1:getSeedReturn></s:Body>`
    expect(parseSoapResponse(reply('&amp;lt;a&amp;gt; &amp;#xd; &amp;#38;amp;')).returnValue).toBe(
      '&lt;a&gt; &#xd; &#38;amp;',
    )
    expect(parseSoapResponse(reply('&lt;GLOSA&gt;A&amp;amp;B&lt;/GLOSA&gt;')).returnValue).toBe(
      '<GLOSA>A&amp;B</GLOSA>',
    )
    expect(parseSoapResponse(reply('&#60;a&#x3E;&#233;&#x1F600;')).returnValue).toBe('<a>é\u{1F600}')
  })

  test('numeric references outside the Unicode range are left as text instead of throwing', () => {
    const reply = '<s:Body><ns1:getSeedReturn>x&#x110000;y&#99999999999999999999;z&#xD;</ns1:getSeedReturn></s:Body>'
    expect(parseSoapResponse(reply).returnValue).toBe('x&#x110000;y&#99999999999999999999;z\r')
  })

  test('Axis style fault: attributes on faultcode, namespaced code text, escaped reason', () => {
    const reply =
      `<soapenv:Envelope xmlns:soapenv="${SOAPENV}"><soapenv:Body><soapenv:Fault>` +
      '<faultcode xmlns:ns1="http://xml.apache.org/axis/">ns1:Client.NoSOAPAction</faultcode>' +
      '<faultstring>Error &amp; mas: &lt;detalle&gt;</faultstring>' +
      '<detail><ns2:hostname xmlns:ns2="http://xml.apache.org/axis/">host</ns2:hostname></detail>' +
      '</soapenv:Fault></soapenv:Body></soapenv:Envelope>'
    const parsed = parseSoapResponse(reply)
    expect(parsed.fault).toEqual({ code: 'ns1:Client.NoSOAPAction', reason: 'Error & mas: <detalle>' })
    expect(parsed.returnValue).toBeNull()
    expect(parsed.returnXml).toBeNull()
  })

  test('JAX-WS style fault with a different envelope prefix', () => {
    const reply =
      '<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body><S:Fault xmlns:ns4="http://www.w3.org/2003/05/soap-envelope">' +
      '<faultcode>S:Server</faultcode><faultstring>Error de Autenticacion: TOKEN invalido</faultstring></S:Fault></S:Body></S:Envelope>'
    expect(parseSoapResponse(reply).fault).toEqual({
      code: 'S:Server',
      reason: 'Error de Autenticacion: TOKEN invalido',
    })
  })

  test('an escaped Fault inside a payload is not a fault', () => {
    const reply =
      '<s:Body><ns1:getSeedReturn>&lt;Fault&gt;&lt;faultcode&gt;x&lt;/faultcode&gt;&lt;/Fault&gt;</ns1:getSeedReturn></s:Body>'
    const parsed = parseSoapResponse(reply)
    expect(parsed.fault).toBeNull()
    expect(parsed.returnValue).toBe('<Fault><faultcode>x</faultcode></Fault>')
  })

  test('WSRECLAMO: a plain string inside <return>, and attributes on the element', () => {
    const reply =
      '<s:Body><ns2:consultarFechaRecepcionSiiResponse xmlns:ns2="http://ws.registroreclamodte.diii.sdi.sii.cl"><ns2:return xmlns:ns3="x">2026-10-31 10:00:00</ns2:return></ns2:consultarFechaRecepcionSiiResponse></s:Body>'
    expect(parseSoapResponse(reply).returnXml).toBe('2026-10-31 10:00:00')
  })

  test('anything else yields nulls', () => {
    expect(parseSoapResponse('<html><body>Mantencion</body></html>')).toEqual({
      fault: null,
      returnValue: null,
      returnXml: null,
    })
  })
})
