import { downloadMipymeBackup } from '../../src/portal/backup'
import { DteError } from '../../src/errors'
import { encodeLatin1 } from '../../src/text/latin1'
import { RECEIVER_RUT } from '../support/fixtures'
import type { FakeReply, FakeRoute, RecordedRequest } from '../support/fake-sii'
import { failure, HERCULES, MAULLIN, portalWith, signedIn, type PortalHarness } from '../support/portal'
import { AUTH_PAGE, COMPANY_FORM, page } from '../support/portal-pages'

const BASE = 'https://www1.sii.cl/cgi-bin/Portal001'
const LIST = `${BASE}/lista_documentos.cgi`
const DOWNLOAD = `${BASE}/download.cgi`
const SESSION: FakeRoute = { url: `${MAULLIN}/ad_empresa1`, reply: { body: COMPANY_FORM } }
const RANGE = { from: '2026-09-01', to: '2026-09-10' }
const REFUSAL = (...messages: readonly string[]): string =>
  page(
    `<script language="JavaScript">${messages.map((message) => `alert('${message}');`).join('\n')}history.back();</script>`,
    'Seleccionar empresa',
  )

const dayOf = (time: number): string => new Date(time).toISOString().slice(0, 10)
const daysBetween = (from: string, to: string): readonly string[] => {
  const days: string[] = []
  for (let time = Date.parse(from); time <= Date.parse(to); time += 86400000) days.push(dayOf(time))
  return days
}
const listing = (total: number, extra = ''): string => page(`Numero total de documentos : ${total} ${extra}`)
const documentsXml = (count: number): string =>
  `<?xml version="1.0" encoding="ISO-8859-1"?><SetDTE>${'<TipoDTE>33</TipoDTE>'.repeat(count)}</SetDTE>`

type DayCounts = Readonly<Record<string, number>>
type Inventory = (day: string) => DayCounts

const countIn = (inventory: Inventory, from: string, to: string, type: string): number =>
  daysBetween(from, to).reduce(
    (sum, day) =>
      sum +
      Object.entries(inventory(day))
        .filter(([documentType]) => type === '' || documentType === type)
        .reduce((subtotal, [, count]) => subtotal + count, 0),
    0,
  )

/** An SII whose documents per day and type come from `inventory`. It counts and downloads as the filters say. */
const backupRoutes = (inventory: Inventory): readonly FakeRoute[] => [
  SESSION,
  {
    url: LIST,
    method: 'POST',
    reply: (request) => {
      const form = new URLSearchParams(request.text)
      return {
        body: listing(countIn(inventory, form.get('FEC_DESDE')!, form.get('FEC_HASTA')!, form.get('TPO_DOC')!)),
      }
    },
  },
  {
    url: `${DOWNLOAD}*`,
    method: 'GET',
    reply: (request) => {
      const query = new URL(request.url).searchParams
      return {
        body: documentsXml(countIn(inventory, query.get('FEC_DESDE')!, query.get('FEC_HASTA')!, query.get('TPO_DOC')!)),
      }
    },
  },
]

const downloads = (harness: PortalHarness): readonly URLSearchParams[] =>
  harness.fake.requests
    .filter((request) => request.url.startsWith(DOWNLOAD))
    .map((request) => new URL(request.url).searchParams)
const lists = (harness: PortalHarness): readonly RecordedRequest[] =>
  harness.fake.requests.filter((request) => request.url === LIST)
const tagCount = (xml: string | undefined): number => (xml?.match(/<TipoDTE>/g) ?? []).length

describe('splitting the range', () => {
  test('it fits: one piece and one download', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 1 })))
    const result = await downloadMipymeBackup(harness.portal, RANGE)
    expect(result.total).toBe(10)
    expect(result.chunks).toEqual([{ ...RANGE, total: 10, xml: documentsXml(10) }])
    expect(downloads(harness)).toHaveLength(1)
  })

  test('it does not fit: no piece goes over 20 and every document arrives once', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 5 })))
    const result = await downloadMipymeBackup(harness.portal, RANGE)
    expect(result.chunks.length).toBeGreaterThan(1)
    expect(result.total).toBe(50)
    for (const chunk of result.chunks) expect(chunk.total).toBeLessThanOrEqual(20)
    expect(result.chunks.reduce((sum, chunk) => sum + tagCount(chunk.xml), 0)).toBe(50)
  })

  test('the pieces leave no gaps and no overlaps', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 5 })))
    const { chunks } = await downloadMipymeBackup(harness.portal, RANGE)
    const ascending = [...chunks].sort((a, b) => a.from.localeCompare(b.from))
    expect(ascending[0].from).toBe(RANGE.from)
    expect(ascending[ascending.length - 1].to).toBe(RANGE.to)
    ascending.slice(1).forEach((chunk, index) => {
      expect(Date.parse(chunk.from) - Date.parse(ascending[index].to)).toBe(86400000)
    })
  })

  test('nothing in the range: no download', async () => {
    const harness = await signedIn(backupRoutes(() => ({})))
    await expect(downloadMipymeBackup(harness.portal, RANGE)).resolves.toEqual({ total: 0, chunks: [] })
    expect(downloads(harness)).toHaveLength(0)
  })

  test('one empty half adds nothing', async () => {
    const inventory: Inventory = (day) => ({ '33': day >= '2026-09-06' ? 5 : 0 })
    const harness = await signedIn(backupRoutes(inventory))
    const { chunks, total } = await downloadMipymeBackup(harness.portal, RANGE)
    expect(total).toBe(25)
    expect(chunks.every((chunk) => chunk.from >= '2026-09-06')).toBe(true)
  })

  test('a day over 20 splits by type, in the order of the list', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '61': 10, '33': 15 })))
    const { chunks, total } = await downloadMipymeBackup(harness.portal, { from: '2026-09-05', to: '2026-09-05' })
    expect(total).toBe(25)
    expect(chunks.map(({ type, total: count }) => [type, count])).toEqual([
      [33, 15],
      [61, 10],
    ])
    expect(chunks[0]).toMatchObject({ from: '2026-09-05', to: '2026-09-05' })
    expect(downloads(harness).map((query) => query.get('TPO_DOC'))).toEqual(['33', '61'])
  })

  test('one type over 20 in a day cannot be divided, and nothing is downloaded', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 30 })))
    const error = await failure(downloadMipymeBackup(harness.portal, { from: '2026-09-05', to: '2026-09-05' }))
    expect(error).toMatchObject({
      code: 'SII_PORTAL_REJECTED',
      details: { rejection: 'backupDayOverLimit', day: '2026-09-05', type: 33, listed: 30 },
    })
    expect(downloads(harness)).toHaveLength(0)
  })

  test('that holds when the impossible day is the last one of a range that could start downloading', async () => {
    const inventory: Inventory = (day) => (day === '2026-09-03' ? { '33': 25 } : { '33': 1 })
    const harness = await signedIn(backupRoutes(inventory))
    const error = await failure(downloadMipymeBackup(harness.portal, { from: '2026-09-01', to: '2026-09-03' }))
    expect(error.details).toMatchObject({ rejection: 'backupDayOverLimit', day: '2026-09-03' })
    expect(downloads(harness)).toHaveLength(0)
  })

  test('types outside the list that leave the day short are declared, not lost', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 5, '43': 20 })))
    const error = await failure(downloadMipymeBackup(harness.portal, { from: '2026-09-05', to: '2026-09-05' }))
    expect(error).toMatchObject({
      code: 'SII_PORTAL_REJECTED',
      details: { rejection: 'backupDayUnknownTypes', day: '2026-09-05', listed: 25, covered: 5 },
    })
    expect(downloads(harness)).toHaveLength(0)
  })

  test('KNOWN DEFECT, kept on purpose: two days over 20 download only the first day, and the total counts both', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 6, '61': 6 })))
    const result = await downloadMipymeBackup(harness.portal, { from: '2026-09-05', to: '2026-09-06' })
    expect(result.total).toBe(24)
    expect(result.chunks.map(({ from, to, type, total }) => ({ from, to, type, total }))).toEqual([
      { from: '2026-09-05', to: '2026-09-05', type: 33, total: 12 },
      { from: '2026-09-05', to: '2026-09-05', type: 61, total: 12 },
    ])
    expect(downloads(harness).every((query) => query.get('FEC_HASTA') === '2026-09-05')).toBe(true)
    expect(result.chunks.reduce((sum, chunk) => sum + tagCount(chunk.xml), 0)).toBe(12)
  })

  test('KEPT ON PURPOSE: with a type of the caller, a day over 20 still splits across the types of the list', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '43': 25, '33': 10, '61': 15 })))
    const { chunks } = await downloadMipymeBackup(harness.portal, { from: '2026-09-05', to: '2026-09-05', type: 43 })
    expect(chunks.map((chunk) => chunk.type)).toEqual([33, 61])
  })

  test('a type of the caller filters listings and downloads', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 1, '61': 1 })))
    const { total, chunks } = await downloadMipymeBackup(harness.portal, { ...RANGE, type: 61 })
    expect(total).toBe(10)
    expect(chunks[0].type).toBeUndefined()
    expect(harness.posted('lista_documentos')[0].TPO_DOC).toBe('61')
    expect(downloads(harness)[0].get('TPO_DOC')).toBe('61')
  })
})

describe('what is sent', () => {
  test('the session is checked on maullin, and then every request goes to www1, even from a certification client', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 1 })))
    await downloadMipymeBackup(harness.portal, RANGE)
    expect(harness.portal.environment).toBe('certification')
    expect(harness.urls()[0]).toBe(`${MAULLIN}/ad_empresa1`)
    expect(
      harness
        .urls()
        .slice(1)
        .every((url) => url.startsWith(`${BASE}/`)),
    ).toBe(true)
  })

  test('a production client checks the session in the same place', async () => {
    const harness = await signedIn(
      backupRoutes(() => ({})),
      { environment: 'production' },
    )
    await downloadMipymeBackup(harness.portal, RANGE)
    expect(harness.urls()).toEqual([`${MAULLIN}/ad_empresa1`, LIST])
  })

  test('the listing fields, in the order of the form', async () => {
    const harness = await signedIn(backupRoutes(() => ({})))
    await downloadMipymeBackup(harness.portal, { ...RANGE, direction: 'received' })
    expect(Object.entries(harness.posted('lista_documentos')[0])).toEqual([
      ['recaptcha-response', ''],
      ['ORIGEN', 'RCP'],
      ['FEC_DESDE', RANGE.from],
      ['FEC_HASTA', RANGE.to],
      ['NUM_PAG', '1'],
      ['TPO_ARCHIVO', 'dte'],
      ['RUT_EMP', '76543210'],
      ['DV_EMP', '3'],
      ['RUT_RECP', ''],
      ['FOLIO', ''],
      ['FOLIOHASTA', ''],
      ['RZN_SOC', ''],
      ['TPO_DOC', ''],
      ['ESTADO', ''],
      ['ORDEN', ''],
    ])
    const [request] = lists(harness)
    expect(request.headers).toMatchObject({ origin: 'https://www1.sii.cl', referer: LIST })
  })

  test('the download query, in the order of the form, with the listing as the referer', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 1 })))
    await downloadMipymeBackup(harness.portal, RANGE)
    const request = harness.fake.requests.find((candidate) => candidate.url.startsWith(DOWNLOAD))!
    expect(request.url).toBe(
      `${DOWNLOAD}?RUT_EMP=76543210&DV_EMP=3&RUT_RECP=&FOLIO=&FOLIOHASTA=&RZN_SOC=&TPO_DOC=&ESTADO=&ORDEN=&ORIGEN=ENV&FEC_DESDE=${RANGE.from}&FEC_HASTA=${RANGE.to}&DOWNLOAD=XML`,
    )
    expect(request.headers.referer).toBe(LIST)
  })

  test('the cookie the old portal expects goes in the listing and the download, but not in the session check', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 1 })))
    await downloadMipymeBackup(harness.portal, RANGE)
    const cookies = harness.fake.requests.map((request) => request.headers.cookie)
    expect(cookies[0]).not.toContain('usa_firma_central')
    expect(cookies[1]).toContain('usa_firma_central=true')
    expect(cookies[2]).toContain('usa_firma_central=true')
  })

  test('the company of the call wins over the one of the client', async () => {
    const harness = await signedIn(backupRoutes(() => ({})))
    await downloadMipymeBackup(harness.portal, { ...RANGE, companyRut: RECEIVER_RUT })
    expect(harness.posted('lista_documentos')[0]).toMatchObject({ RUT_EMP: '12345678', DV_EMP: '5' })
  })

  test('with no session, the session check logs in, and the listing goes with that session', async () => {
    const check = `${MAULLIN}/ad_empresa1`
    const harness = portalWith([
      {
        url: check,
        reply: [
          {
            status: 302,
            headers: { Location: `https://zeus.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?${check}` },
          },
          { body: COMPANY_FORM },
        ],
      },
      { url: 'https://zeus.sii.cl/AUT2000/InicioAutenticacion/*', reply: { body: AUTH_PAGE } },
      {
        url: `${HERCULES}*`,
        method: 'POST',
        reply: { status: 302, headers: { Location: check, 'Set-Cookie': 'NETSCAPE_LIVEWIRE.rut=12345678; Path=/' } },
      },
      { url: LIST, method: 'POST', reply: { body: listing(0) } },
    ])
    await downloadMipymeBackup(harness.portal, RANGE)
    expect(harness.urls().filter((url) => url.startsWith(HERCULES))).toHaveLength(1)
    expect(lists(harness)[0].headers.cookie).toContain('NETSCAPE_LIVEWIRE.rut=12345678')
  })

  test('overrides reach the requests', async () => {
    const harness = await signedIn(backupRoutes(() => ({})))
    await downloadMipymeBackup(harness.portal, RANGE, { timeoutMs: 1234 })
    expect(lists(harness)[0].timeoutMs).toBe(1234)
  })

  test.each([
    ['from', { ...RANGE, from: '2026-13-01' }, 'INVALID_DATE'],
    ['to', { ...RANGE, to: '01-09-2026' }, 'INVALID_DATE'],
    ['direction', { ...RANGE, direction: 'sideways' }, 'INVALID_OPTION'],
    ['attempts', { ...RANGE, attempts: 0 }, 'INVALID_OPTION'],
  ])('a bad %s is refused before any request', async (field, input, code) => {
    const harness = await signedIn(backupRoutes(() => ({})))
    const error = await failure(downloadMipymeBackup(harness.portal, input as never))
    expect(error).toMatchObject({ code, details: { field } })
    expect(harness.fake.requests).toHaveLength(0)
  })

  test('no company at all is a missing field', async () => {
    const harness = await signedIn(
      backupRoutes(() => ({})),
      { companyRut: undefined },
    )
    const error = await failure(downloadMipymeBackup(harness.portal, RANGE))
    expect(error).toMatchObject({ code: 'MISSING_FIELD', details: { field: 'companyRut' } })
  })
})

describe('what the portal answers', () => {
  const answering = (list: FakeRoute['reply'], download: FakeRoute['reply'] = { body: documentsXml(1) }) => [
    SESSION,
    { url: LIST, method: 'POST' as const, reply: list },
    { url: `${DOWNLOAD}*`, method: 'GET' as const, reply: download },
  ]

  test('the total wins over the recaptcha and the commented-out alert of a valid page', async () => {
    const valid = listing(
      1,
      `<div class="g-recaptcha"></div><script>
      if (cant_reg > 20) { //alert("Maximo numero de documentos: 20.");
      }
    </script>`,
    )
    const harness = await signedIn(answering({ body: valid }))
    await expect(downloadMipymeBackup(harness.portal, RANGE)).resolves.toMatchObject({ total: 1 })
  })

  test.each([
    ['backupCaptcha', page('<div class="g-recaptcha"></div>')],
    ['backupNoData', REFUSAL('No existe información en MIPYME para el rut ingresado')],
    ['backupRefused', REFUSAL('Mensaje que nadie ha visto')],
    ['backupIndeterminate', REFUSAL('uno', 'dos', 'tres')],
    ['backupNoCompany', page('', 'Seleccionar empresa')],
  ])('%s in a listing is not repeated', async (rejection, body) => {
    const harness = await signedIn(answering({ body }))
    const error = await failure(downloadMipymeBackup(harness.portal, RANGE))
    expect(error).toMatchObject({ code: 'SII_PORTAL_REJECTED', details: { rejection } })
    expect(lists(harness)).toHaveLength(1)
    expect(harness.sleeps).toEqual([])
  })

  test('what the portal said travels with the refusal', async () => {
    const harness = await signedIn(answering({ body: REFUSAL('uno', 'dos') }))
    const several = await failure(downloadMipymeBackup(harness.portal, RANGE))
    expect(several.details.portalMessages).toEqual(['uno', 'dos'])
    const single = await signedIn(answering({ body: REFUSAL('Mensaje que nadie ha visto') }))
    const one = await failure(downloadMipymeBackup(single.portal, RANGE))
    expect(one.details.portalMessage).toBe('Mensaje que nadie ha visto')
  })

  test('a refusal in a download is not repeated either', async () => {
    const harness = await signedIn(answering({ body: listing(1) }, { body: page('recaptcha requerido') }))
    const error = await failure(downloadMipymeBackup(harness.portal, RANGE))
    expect(error.details).toMatchObject({ rejection: 'backupCaptcha' })
    expect(harness.sleeps).toEqual([])
  })

  test('an XML that says the words of the firewall is still a document, and it decodes as Latin-1', async () => {
    const xml = '<?xml version="1.0"?><RznSoc>ACCESO ANDINO Ñ</RznSoc><!-- acceso restringido -->'
    const harness = await signedIn(answering({ body: listing(1) }, { body: encodeLatin1(xml) }))
    const { chunks } = await downloadMipymeBackup(harness.portal, RANGE)
    expect(chunks[0].xml).toBe(xml)
  })

  test('a firewall page is never repeated', async () => {
    const harness = await signedIn(answering({ body: page('Transaccion Rechazada<br>ID: 980') }))
    const error = await failure(downloadMipymeBackup(harness.portal, RANGE))
    expect(error.code).toBe('SII_PORTAL_BLOCKED')
    expect(lists(harness)).toHaveLength(1)
  })
})

describe('retries', () => {
  const slow = new DteError('TRANSPORT_FAILED', {})
  const routes = (list: readonly FakeReply[], download: FakeRoute['reply'] = { body: documentsXml(1) }) => [
    SESSION,
    { url: LIST, method: 'POST' as const, reply: [...list] },
    { url: `${DOWNLOAD}*`, method: 'GET' as const, reply: download },
  ]

  test('a listing recovers from two failures, waiting 1 and 2 seconds', async () => {
    const harness = await signedIn(routes([slow, slow, { body: listing(1) }]))
    await expect(downloadMipymeBackup(harness.portal, RANGE)).resolves.toMatchObject({ total: 1 })
    expect(harness.sleeps).toEqual([1000, 2000])
  })

  test('a download has its own loop', async () => {
    const harness = await signedIn(routes([{ body: listing(1) }], [slow, { body: documentsXml(1) }]))
    await expect(downloadMipymeBackup(harness.portal, RANGE)).resolves.toMatchObject({ total: 1 })
    expect(harness.sleeps).toEqual([1000])
  })

  test('the retries of the client do not multiply with the loop', async () => {
    const harness = await signedIn(routes([slow, slow, { body: listing(0) }]), { retry: {} })
    await downloadMipymeBackup(harness.portal, RANGE)
    expect(lists(harness)).toHaveLength(3)
    expect(harness.sleeps).toEqual([1000, 2000])
  })

  test('nor do those the caller asks for: they reach only the login', async () => {
    const harness = await signedIn(routes([slow, { body: listing(0) }]))
    await downloadMipymeBackup(harness.portal, RANGE, { retry: { maxAttempts: 5 } })
    expect(lists(harness)).toHaveLength(2)
  })

  test('with attempts spent, the failure reaches the caller with how many there were', async () => {
    const harness = await signedIn(routes([slow, slow, { body: listing(0) }]))
    const error = await failure(downloadMipymeBackup(harness.portal, { ...RANGE, attempts: 2 }))
    expect(error).toMatchObject({ code: 'TRANSPORT_FAILED', details: { attempts: 2 } })
    expect(lists(harness)).toHaveLength(2)
  })

  test('attempts: 1 is one try', async () => {
    const harness = await signedIn(routes([slow, { body: listing(0) }]))
    await failure(downloadMipymeBackup(harness.portal, { ...RANGE, attempts: 1 }))
    expect(lists(harness)).toHaveLength(1)
    expect(harness.sleeps).toEqual([])
  })

  test('a page it cannot read is repeated, and then reported with what it said', async () => {
    const harness = await signedIn(routes([{ body: page('Hola') }, { body: page('Hola') }, { body: page('Hola') }]))
    const error = await failure(downloadMipymeBackup(harness.portal, RANGE))
    expect(error).toMatchObject({ code: 'SII_PORTAL_UNEXPECTED_PAGE', details: { step: 'list', attempts: 3 } })
    expect(harness.sleeps).toEqual([1000, 2000])
  })

  test('a download that is not a document is repeated in the same way', async () => {
    const harness = await signedIn(routes([{ body: listing(1) }], { body: page('Hola') }))
    const error = await failure(downloadMipymeBackup(harness.portal, RANGE))
    expect(error).toMatchObject({ code: 'SII_PORTAL_UNEXPECTED_PAGE', details: { step: 'download' } })
  })

  test('an HTTP 503 is repeated', async () => {
    const harness = await signedIn(routes([{ status: 503, body: 'caido' }, { body: listing(0) }]))
    await downloadMipymeBackup(harness.portal, RANGE)
    expect(harness.sleeps).toEqual([1000])
  })

  test('a TLS failure that is not transient is not', async () => {
    const harness = await signedIn(routes([new DteError('TRANSPORT_TLS', { reason: 'CERT_HAS_EXPIRED' })]))
    const error = await failure(downloadMipymeBackup(harness.portal, RANGE))
    expect(error.code).toBe('TRANSPORT_TLS')
    expect(harness.sleeps).toEqual([])
  })
})

describe('delivery', () => {
  test('newest first, without changing the order inside a day', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 5 })))
    const { chunks } = await downloadMipymeBackup(harness.portal, RANGE)
    const days = chunks.map((chunk) => chunk.from)
    expect(days).toEqual([...days].sort((a, b) => b.localeCompare(a)))
    expect(downloads(harness).map((query) => query.get('FEC_DESDE'))).toEqual(days)
  })

  test('onChunk receives each XML, awaited and in order, and the result keeps none', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 5 })))
    const received: { from: string; xml: string }[] = []
    const result = await downloadMipymeBackup(harness.portal, {
      ...RANGE,
      onChunk: async ({ from, xml }) => {
        await Promise.resolve()
        received.push({ from, xml })
      },
    })
    expect(result.total).toBe(50)
    expect(result.chunks.every((chunk) => chunk.xml === undefined)).toBe(true)
    expect(received.reduce((sum, chunk) => sum + tagCount(chunk.xml), 0)).toBe(50)
    expect(received.map((chunk) => chunk.from)).toEqual(result.chunks.map((chunk) => chunk.from))
  })

  test('onChunk gets no type, although the piece has one', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 15, '61': 10 })))
    const received: object[] = []
    const { chunks } = await downloadMipymeBackup(harness.portal, {
      from: '2026-09-05',
      to: '2026-09-05',
      onChunk: (chunk) => {
        received.push(chunk)
      },
    })
    expect(Object.keys(received[0]).sort()).toEqual(['from', 'to', 'total', 'xml'])
    expect(chunks[0].type).toBe(33)
  })

  test('an error of onChunk ends the run, with no retry', async () => {
    const harness = await signedIn(backupRoutes(() => ({ '33': 5 })))
    await expect(
      downloadMipymeBackup(harness.portal, {
        ...RANGE,
        onChunk: () => {
          throw new DteError('TRANSPORT_FAILED', {})
        },
      }),
    ).rejects.toMatchObject({ code: 'TRANSPORT_FAILED' })
    expect(downloads(harness)).toHaveLength(1)
    expect(harness.sleeps).toEqual([])
  })
})
