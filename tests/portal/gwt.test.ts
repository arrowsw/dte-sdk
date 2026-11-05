import {
  decodeGwtLong,
  discoverGwtHashes,
  encodeGwtLong,
  firstGwtLongIn,
  gwtAnswer,
  gwtBody,
  gwtHeaders,
  gwtLongToken,
  gwtMessage,
  gwtNull,
  GWT_INTEGER,
  GWT_LONG,
  GWT_STRING,
  type GwtCall,
} from '../../src/portal/gwt'
import { withPortalSession } from '../../src/portal/session'
import { signedIn } from '../support/portal'
import { page } from '../support/portal-pages'

const PFE = 'https://www4.sii.cl/pfeInternet/'
const PDF = 'https://www4.sii.cl/pdfdteInternet/'
const POLICY = '4EB230A83E74980F353E4FCC209543CB'
const FACADE = 'cl.sii.sdi.dim.pfe.web.client.service.Facade'
const PDF_SERVICE = 'cl.sii.sdi.dim.validaPdfDte.web.client.service.ServicePdfDte'
const call = (moduleBase: string, service: string, method: string, parameters: GwtCall['parameters']): GwtCall => ({
  moduleBase,
  policy: POLICY,
  service,
  method,
  parameters,
})
const string = (value: string | null) => ({ kind: 'string' as const, value })
const integer = (value: number) => ({ kind: 'integer' as const, value })
const nothing = { kind: 'null' as const }

describe('gwtBody writes the wire format of the SII portals', () => {
  test('validarUsuario: one object with nulls, strings and boxed integers, interned as written', () => {
    const body = gwtBody(
      call(PFE, FACADE, 'validarUsuario', [
        {
          kind: 'object',
          type: 'cl.sii.sdi.dim.pfe.to.UsuarioTo/3723336533',
          fields: [
            nothing,
            nothing,
            nothing,
            nothing,
            string('5'),
            string('3'),
            integer(76543210),
            nothing,
            nothing,
            nothing,
            nothing,
            nothing,
            integer(12345678),
          ],
        },
      ]),
    )
    expect(body).toBe(
      `7|0|8|${PFE}|${POLICY}|${FACADE}|validarUsuario|cl.sii.sdi.dim.pfe.to.UsuarioTo/3723336533|5|3|${GWT_INTEGER}|1|2|3|4|1|5|5|0|0|0|0|6|7|8|76543210|0|0|0|0|0|8|12345678|`,
    )
  })

  test('validarSetContriPostSeguimiento: a boxed integer and a string', () => {
    expect(gwtBody(call(PFE, FACADE, 'validarSetContriPostSeguimiento', [integer(76543210), string('3')]))).toBe(
      `7|0|7|${PFE}|${POLICY}|${FACADE}|validarSetContriPostSeguimiento|${GWT_INTEGER}|${GWT_STRING}|3|1|2|3|4|2|5|6|5|76543210|7|`,
    )
  })

  test('updatePostulacionSeguimiento: the id first inside the object', () => {
    const body = gwtBody(
      call(PFE, FACADE, 'updatePostulacionSeguimiento', [
        {
          kind: 'object',
          type: 'cl.sii.sdi.dim.pfe.to.PostulacionSeguimientoTo/3921005560',
          fields: [integer(40), nothing, nothing, nothing, nothing, string('3'), integer(76543210)],
        },
      ]),
    )
    expect(body).toBe(
      `7|0|7|${PFE}|${POLICY}|${FACADE}|updatePostulacionSeguimiento|cl.sii.sdi.dim.pfe.to.PostulacionSeguimientoTo/3921005560|${GWT_INTEGER}|3|1|2|3|4|1|5|5|6|40|0|0|0|0|7|6|76543210|`,
    )
  })

  test('leeImpreso, creaLista and solicitaRevisionSII: strings, the empty string, booleans and longs', () => {
    expect(gwtBody(call(PDF, PDF_SERVICE, 'leeImpreso', [string('76543210-3')]))).toBe(
      `7|0|6|${PDF}|${POLICY}|${PDF_SERVICE}|leeImpreso|${GWT_STRING}|76543210-3|1|2|3|4|1|5|6|`,
    )
    expect(
      gwtBody(
        call(PDF, PDF_SERVICE, 'creaLista', [
          string('76543210'),
          string('3'),
          string(''),
          string('76543210'),
          string('3'),
          { kind: 'boolean', value: false },
        ]),
      ),
    ).toBe(
      `7|0|9|${PDF}|${POLICY}|${PDF_SERVICE}|creaLista|${GWT_STRING}|Z|76543210|3||1|2|3|4|6|5|5|5|5|5|6|7|8|9|7|8|0|`,
    )
    expect(
      gwtBody(
        call(PDF, PDF_SERVICE, 'solicitaRevisionSII', [
          { kind: 'long', value: 'BAqo' },
          { kind: 'boolean', value: true },
        ]),
      ),
    ).toBe(`7|0|6|${PDF}|${POLICY}|${PDF_SERVICE}|solicitaRevisionSII|${GWT_LONG}|Z|1|2|3|4|2|5|6|5|BAqo|1|`)
    expect(gwtBody(call(PDF, PDF_SERVICE, 'muestraMail', [{ kind: 'long', value: 264872 }]))).toBe(
      `7|0|5|${PDF}|${POLICY}|${PDF_SERVICE}|muestraMail|${GWT_LONG}|1|2|3|4|1|5|5|BAqo|`,
    )
  })

  test('a null string is 0, and pipes and backslashes in a table string are escaped', () => {
    expect(gwtBody(call(PFE, FACADE, 'm', [string(null), string('a|b\\c')]))).toBe(
      `7|0|6|${PFE}|${POLICY}|${FACADE}|m|${GWT_STRING}|a\\!b\\\\c|1|2|3|4|2|5|5|0|6|`,
    )
  })

  test('the headers of a call', () => {
    expect(gwtHeaders(PFE, 'E487C7488217509D4EDCE9D341782C20')).toEqual({
      'Content-Type': 'text/x-gwt-rpc; charset=UTF-8',
      'X-GWT-Module-Base': PFE,
      'X-GWT-Permutation': 'E487C7488217509D4EDCE9D341782C20',
      Origin: 'https://www4.sii.cl',
      Referer: PFE,
    })
  })
})

describe('GWT longs', () => {
  test('encode and decode in the GWT base-64 alphabet', () => {
    expect(encodeGwtLong(264872)).toBe('BAqo')
    expect(decodeGwtLong('BAqo')).toBe(264872)
    expect(encodeGwtLong(0)).toBe('A')
    expect(decodeGwtLong('A')).toBe(0)
    expect(encodeGwtLong(63)).toBe('_')
    expect(decodeGwtLong('$_')).toBe(62 * 64 + 63)
    expect(decodeGwtLong('B-q')).toBeNull()
    for (const value of [1, 64, 4095, 9999999, 123456789]) expect(decodeGwtLong(encodeGwtLong(value))).toBe(value)
  })
})

describe('gwtAnswer', () => {
  test('//OK, the table with \\x escapes, the longs and the first in a range', () => {
    const answer = gwtAnswer(`//OK[1,'BAqo',2,'abc',["La revisi\\x27on 'BAqo' est\\xe1 en","INGRESO","3"],0,7]`)
    expect(answer.ok).toBe(true)
    expect(answer.table).toEqual(["La revisi'on 'BAqo' está en", 'INGRESO', '3'])
    expect(answer.longs).toEqual([264872, decodeGwtLong('abc'), 264872])
    expect(firstGwtLongIn(answer, 10000, 9999999)).toBe(264872)
    expect(firstGwtLongIn(answer, 1, 5)).toBeNull()
    expect(gwtLongToken(answer, 264872)).toBe('BAqo')
    expect(gwtLongToken(answer, 7)).toBeNull()
    expect(answer.message).toBeNull()
  })

  test('no //OK, an empty table, an unreadable table, a table that is no array', () => {
    expect(gwtAnswer('//EX[2,1,["java.lang.RuntimeException/515124647","boom"],0,7]')).toMatchObject({
      ok: false,
      table: ['java.lang.RuntimeException/515124647', 'boom'],
    })
    expect(gwtAnswer('//OK[0,[],0,7]')).toMatchObject({ ok: true, table: [], longs: [], message: null })
    expect(gwtAnswer('//OK[1,["unterminated],0,7]').table).toEqual([])
    expect(gwtAnswer('//OK[1,["a",{"b":1}],0,7]').table).toEqual(['a'])
    expect(gwtAnswer('<html>error</html>').table).toEqual([])
    expect(gwtAnswer(`//OK[,[{"x":1}],0,7]`).table).toEqual([])
  })

  test('the message: a sentence with the words the SII uses, never a type name or a class path', () => {
    expect(
      gwtMessage([
        'cl.sii.sdi.dim.pfe.to.UsuarioTo/3723336533',
        'java.util.ArrayList/4159755760',
        'cl.sii.sdi algo que no corresponde en absoluto',
        "El estado de la postulacion NO es: 'DOCUMENTOS IMPRESOS'",
      ]),
    ).toBe("El estado de la postulacion NO es: 'DOCUMENTOS IMPRESOS'")
    expect(gwtMessage(['El contribuyente 76543210-3 no ha solicitado Set de pruebas.'])).toBe(
      'El contribuyente 76543210-3 no ha solicitado Set de pruebas.',
    )
    expect(gwtMessage(['short error', 'Una frase larga sin las palabras esperadas aqui', 'APROBADO'])).toBeNull()
  })
})

describe('discoverGwtHashes', () => {
  const known = { permutation: 'D86ACF99AE5C17F0B0F673A9872EF6CB', policy: '5459B93B9D030A67564300FBD346270F' }
  const fresh = { permutation: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1', policy: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB2' }
  const nocache = (...permutations: readonly string[]) => page(`var x=['${permutations.join("','")}'],y=1;`)
  const discover = async (routes: Parameters<typeof signedIn>[0], override?: typeof known) => {
    const harness = await signedIn(routes)
    const hashes = await withPortalSession(harness.portal, 'test', undefined, (context) =>
      discoverGwtHashes(context, {
        moduleBase: PDF,
        moduleName: 'pdfdte',
        known,
        ...(override === undefined ? {} : { override }),
      }),
    )
    return { hashes, harness }
  }

  test('the known pair stands when the portal still lists it', async () => {
    const { hashes, harness } = await discover([
      {
        url: `${PDF}pdfdte.nocache.js`,
        reply: { body: nocache('0000000000000000000000000000000f', known.permutation) },
      },
    ])
    expect(hashes).toEqual(known)
    expect(harness.urls()).toEqual([`${PDF}pdfdte.nocache.js`])
  })

  test('a new permutation takes the first listed and its policy from the cache page', async () => {
    const { hashes, harness } = await discover([
      {
        url: `${PDF}pdfdte.nocache.js`,
        reply: { body: nocache(fresh.permutation.toLowerCase(), 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC3') },
      },
      {
        url: `${PDF}${fresh.permutation}.cache.html`,
        reply: { body: page(`var p='${fresh.permutation}', q="${fresh.policy}";`) },
      },
    ])
    expect(hashes).toEqual(fresh)
    expect(harness.fake.requests[1].headers.referer).toBe(PDF)
  })

  test('the known pair stays when the portal cannot be read, lists nothing, or hides the policy', async () => {
    const { hashes: down, harness } = await discover([
      { url: `${PDF}pdfdte.nocache.js`, reply: { status: 500, body: 'down' } },
    ])
    expect(down).toEqual(known)
    expect(harness.portal.logger).toBeDefined()
    const { hashes: empty } = await discover([
      { url: `${PDF}pdfdte.nocache.js`, reply: { body: page('nothing here') } },
    ])
    expect(empty).toEqual(known)
    const { hashes: blank } = await discover([{ url: `${PDF}pdfdte.nocache.js`, reply: { body: '' } }])
    expect(blank).toEqual(known)
    const { hashes: noPolicy } = await discover([
      { url: `${PDF}pdfdte.nocache.js`, reply: { body: nocache(fresh.permutation) } },
      { url: `${PDF}${fresh.permutation}.cache.html`, reply: { body: page(`'${fresh.permutation}'`) } },
    ])
    expect(noPolicy).toEqual(known)
    const { hashes: thrown } = await discover([{ url: `${PDF}pdfdte.nocache.js`, reply: new Error('socket hang up') }])
    expect(thrown).toEqual(known)
  })

  test('a pair from the caller is taken without a request', async () => {
    const { hashes, harness } = await discover([], fresh)
    expect(hashes).toEqual(fresh)
    expect(harness.urls()).toEqual([])
  })
})

describe('a null that names its declared type', () => {
  const RECEIPTS = 'https://www4.sii.cl/certBolElectDteInternet/'
  const RECEIPTS_FACADE = 'cl.sii.sdi.diii.certBolElectDte.web.client.service.Facade'

  test('ingresarTrackId: seven parameters, the fifth a null Integer', () => {
    const body = gwtBody(
      call(RECEIPTS, RECEIPTS_FACADE, 'ingresarTrackId', [
        integer(76543210),
        string('3'),
        string(null),
        string('90'),
        gwtNull(GWT_INTEGER),
        string(null),
        string('9876543210'),
      ]),
    )
    expect(body).toBe(
      `7|0|9|${RECEIPTS}|${POLICY}|${RECEIPTS_FACADE}|ingresarTrackId|${GWT_INTEGER}|${GWT_STRING}|3|90|9876543210|1|2|3|4|7|5|6|6|6|5|6|6|5|76543210|7|0|8|0|0|9|`,
    )
  })

  test('obtenerEstadoAutorizaEmp and obtenerPostulacionSeg, as the receipts portal takes them', () => {
    expect(
      gwtBody(
        call(RECEIPTS, RECEIPTS_FACADE, 'obtenerEstadoAutorizaEmp', [
          integer(76543210),
          string('3'),
          integer(90),
          string(null),
        ]),
      ),
    ).toBe(
      `7|0|7|${RECEIPTS}|${POLICY}|${RECEIPTS_FACADE}|obtenerEstadoAutorizaEmp|${GWT_INTEGER}|${GWT_STRING}|3|1|2|3|4|4|5|6|5|6|5|76543210|7|5|90|0|`,
    )
    expect(
      gwtBody(
        call(RECEIPTS, RECEIPTS_FACADE, 'obtenerPostulacionSeg', [
          integer(76543210),
          string('3'),
          string('90'),
          string('P90'),
        ]),
      ),
    ).toBe(
      `7|0|9|${RECEIPTS}|${POLICY}|${RECEIPTS_FACADE}|obtenerPostulacionSeg|${GWT_INTEGER}|${GWT_STRING}|3|90|P90|1|2|3|4|4|5|6|6|6|5|76543210|7|8|9|`,
    )
  })

  test('a plain null stays a String', () => {
    expect(gwtBody(call(RECEIPTS, RECEIPTS_FACADE, 'x', [nothing]))).toBe(
      `7|0|5|${RECEIPTS}|${POLICY}|${RECEIPTS_FACADE}|x|${GWT_STRING}|1|2|3|4|1|5|0|`,
    )
  })
})
