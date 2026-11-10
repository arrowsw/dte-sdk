import { DteError } from '../../src/errors'
import { annulFolios, listFolioRanges } from '../../src/portal/annulment'
import type { Logger } from '../../src/sii/logger'
import { failure, MAULLIN, signedIn } from '../support/portal'
import { ANNUL_ENTRY, ANNUL_FORM, ANNUL_OK, page, refusedPage, unusedRangesPage } from '../support/portal-pages'

const entry = { url: `${MAULLIN}/af_anular1`, method: 'GET' as const, reply: { body: ANNUL_ENTRY } }
const list = (...bodies: readonly string[]) => ({
  url: `${MAULLIN}/af_anular2`,
  method: 'POST' as const,
  reply: bodies.map((body) => ({ body })),
})
const respond = (name: string, ...bodies: readonly (string | Error)[]) => ({
  url: `${MAULLIN}/${name}`,
  method: 'POST' as const,
  reply: bodies.map((body) => (typeof body === 'string' ? { body } : body)),
})

describe('listFolioRanges', () => {
  test('sends the query and returns the ranges', async () => {
    const harness = await signedIn([
      entry,
      list(
        unusedRangesPage([
          [1, 3],
          [4, 5],
        ]),
      ),
    ])
    await expect(listFolioRanges(harness.portal, { type: 33 })).resolves.toEqual({
      ranges: [
        { from: 1, to: 3, quantity: 3, date: '2026-11-15' },
        { from: 4, to: 5, quantity: 2, date: '2026-11-15' },
      ],
      lastFolio: 5,
    })
    expect(harness.posted('af_anular2')[0]).toEqual({
      KEY: 'abc',
      RUT_EMP: '76543210',
      PAGINA: '1',
      COD_DOCTO: '33',
      ACEPTAR: 'Consultar',
      DV_EMP: '3',
    })
  })

  test('follows the pages, merging, newest first', async () => {
    const harness = await signedIn([
      entry,
      list(
        unusedRangesPage([[1, 3]], 2),
        unusedRangesPage(
          [
            [1, 3],
            [10, 12],
          ],
          3,
        ),
        unusedRangesPage([[20, 21]]),
      ),
    ])
    const result = await listFolioRanges(harness.portal, { type: 33 })
    expect(result.ranges.map((range) => range.from)).toEqual([20, 10, 1])
    expect(result.lastFolio).toBe(21)
    expect(harness.posted('af_anular2')[1]).toMatchObject({ KEY: 'frm-key', PAGINA: '2' })
  })

  test('a next button with no form and no page still walks, and the walk is bounded', async () => {
    const endless = page(
      '<form><input name=FOLIO_INI value=1><input name=FOLIO_FIN value=2></form><input name=siguiente value=x>',
    )
    const harness = await signedIn([entry, { url: `${MAULLIN}/af_anular2`, reply: { body: endless } }])
    await listFolioRanges(harness.portal, { type: 33 })
    expect(harness.posted('af_anular2')).toHaveLength(21)
    expect(harness.posted('af_anular2')[1]).toEqual({})
  })

  test('nothing to list, the wrong page and a bad type', async () => {
    const empty = await signedIn([entry, list(page('sin rangos'))])
    await expect(listFolioRanges(empty.portal, { type: 33 })).resolves.toEqual({ ranges: [], lastFolio: null })
    const lost = await signedIn([{ url: `${MAULLIN}/af_anular1`, reply: { body: page('otra') } }])
    expect((await failure(listFolioRanges(lost.portal, { type: 33 }))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect((await failure(listFolioRanges(lost.portal, { type: 1 as never }))).code).toBe('INVALID_DOCUMENT_TYPE')
  })
})

describe('a refused listing is a refusal, not an empty list', () => {
  const refusal = { code: 'SII_PORTAL_REJECTED', details: { rejection: 'optionNotAuthorized' } }
  const refused = refusedPage('ANULACION DE FOLIOS')

  test('at the entry page, with nothing posted', async () => {
    const harness = await signedIn([{ url: `${MAULLIN}/af_anular1`, reply: { body: refused } }])
    expect(await failure(listFolioRanges(harness.portal, { type: 33 }))).toMatchObject(refusal)
    expect(harness.posted('af_anular2')).toEqual([])
  })

  test('at the first page of the listing', async () => {
    const harness = await signedIn([entry, list(refused)])
    expect(await failure(listFolioRanges(harness.portal, { type: 33 }))).toMatchObject(refusal)
  })

  test('at a later page of the listing', async () => {
    const harness = await signedIn([entry, list(unusedRangesPage([[1, 3]], 2), refused)])
    expect(await failure(listFolioRanges(harness.portal, { type: 33 }))).toMatchObject(refusal)
  })

  test('annulFolios says so too', async () => {
    const harness = await signedIn([entry, list(refused)])
    expect(await failure(annulFolios(harness.portal, { type: 33, all: true }))).toMatchObject(refusal)
  })
})

describe('annulFolios', () => {
  // Once a range was tried in the first pass, the second pass finds nothing new and stops.
  const twice = (html: string) => list(html, html)

  test('annulment needs an explicit scope', async () => {
    const harness = await signedIn([])
    const error = await failure(annulFolios(harness.portal, { type: 33 }))
    expect(error).toMatchObject({ code: 'INVALID_OPTION', details: { field: 'range' } })
    expect((await failure(annulFolios(harness.portal, { type: 1 as never, all: true }))).code).toBe(
      'INVALID_DOCUMENT_TYPE',
    )
    expect(harness.fake.requests).toHaveLength(0)
  })

  // Each of these used to widen the scope: `withinDays: NaN` passed every date, `maxRanges: 0` every range.
  test.each([
    ['withinDays', { withinDays: Number.NaN }],
    ['withinDays', { withinDays: Number.POSITIVE_INFINITY }],
    ['withinDays', { withinDays: 0 }],
    ['maxRanges', { all: true, maxRanges: 0 }],
    ['maxRanges', { all: true, maxRanges: Number.NaN }],
    ['maxRanges', { all: true, maxRanges: 1.5 }],
    ['range', { range: { from: 6, to: 3 } }],
    ['range', { range: { from: Number.NaN, to: 3 } }],
    ['range', { range: { from: 3, to: Number.NaN } }],
    ['range', { range: { from: 0, to: 3 } }],
    [
      'exclude',
      {
        all: true,
        exclude: [
          { from: 1, to: 2 },
          { from: Number.NaN, to: Number.NaN },
        ],
      },
    ],
  ])('a scope that cannot be read annuls nothing: %s %#', async (field, scope) => {
    const harness = await signedIn([])
    const error = await failure(annulFolios(harness.portal, { type: 33, ...scope }))
    expect(error).toMatchObject({ code: 'INVALID_OPTION', details: { field } })
    expect(harness.fake.requests).toHaveLength(0)
  })

  test('annuls a range with the fields of the SII form', async () => {
    const harness = await signedIn([
      entry,
      twice(unusedRangesPage([[1, 3]])),
      respond('af_anular3', ANNUL_FORM),
      respond('af_anular', ANNUL_OK),
    ])
    const result = await annulFolios(harness.portal, { type: 33, all: true })
    expect(result).toEqual({
      annulled: [{ from: 1, to: 3, count: 3 }],
      rejected: [],
      totalAnnulled: 3,
      totalRejected: 0,
      knownAnnulled: ['1-3'],
      failure: null,
    })
    expect(harness.posted('af_anular3')[0]).toEqual({
      RUT_EMP: '76543210',
      DV_EMP: '3',
      DIA: '15',
      MES: '11',
      ANO: '2026',
      COD_DOCTO: '33',
      FOLIO_INI: '1',
      FOLIO_FIN: '3',
      CANT_DOCTOS: '3',
    })
    expect(harness.posted('af_anular')[0]).toEqual({
      TOKEN_FORM: 'z',
      MOTIVO: 'Folios no utilizados',
      FOLIO_INI_A: '1',
      FOLIO_FIN_A: '3',
    })
    expect(harness.sleeps).toEqual([1500])
  })

  test('a range asks only for the folios inside it, and its reason goes along', async () => {
    const harness = await signedIn([
      entry,
      twice(
        unusedRangesPage([
          [1, 10],
          [20, 30],
        ]),
      ),
      respond('af_anular3', ANNUL_FORM),
      respond('af_anular', ANNUL_OK),
    ])
    const result = await annulFolios(harness.portal, { type: 33, range: { from: 4, to: 6 }, reason: 'Prueba' })
    expect(result.annulled).toEqual([{ from: 4, to: 6, count: 3 }])
    expect(harness.posted('af_anular')[0]).toMatchObject({ FOLIO_INI_A: '4', FOLIO_FIN_A: '6', MOTIVO: 'Prueba' })
    expect(harness.posted('af_anular3')[0]).toMatchObject({ FOLIO_INI: '1', FOLIO_FIN: '10' })
  })

  test('withinDays skips older ranges and those without a date: when unsure, do not annul', async () => {
    const html = page(
      `${unusedRangesPage([
        [1, 2, '15-11-2026'],
        [3, 4, '01-01-2020'],
      ])}<form><input name=FOLIO_INI value=5><input name=FOLIO_FIN value=6></form>`,
    )
    const harness = await signedIn([
      entry,
      twice(html),
      respond('af_anular3', ANNUL_FORM),
      respond('af_anular', ANNUL_OK),
    ])
    const result = await annulFolios(harness.portal, { type: 33, withinDays: 1 })
    expect(result.annulled).toEqual([{ from: 1, to: 2, count: 2 }])
  })

  test('exclude and knownAnnulled are left alone', async () => {
    const harness = await signedIn([
      entry,
      list(
        unusedRangesPage([
          [1, 2],
          [3, 4],
        ]),
      ),
    ])
    const result = await annulFolios(harness.portal, {
      type: 33,
      all: true,
      exclude: [{ from: 2, to: 2 }],
      knownAnnulled: ['3-4'],
    })
    expect(result).toMatchObject({ totalAnnulled: 0, knownAnnulled: ['3-4'] })
    expect(harness.posted('af_anular3')).toEqual([])
    expect(harness.sleeps).toEqual([])
  })

  test('maxRanges takes the last ones of the listing, once per pass', async () => {
    const harness = await signedIn([
      entry,
      {
        url: `${MAULLIN}/af_anular2`,
        reply: {
          body: unusedRangesPage([
            [1, 2],
            [3, 4],
            [5, 6],
          ]),
        },
      },
      { url: `${MAULLIN}/af_anular3`, reply: { body: ANNUL_FORM } },
      { url: `${MAULLIN}/af_anular`, reply: { body: ANNUL_OK } },
    ])
    await annulFolios(harness.portal, { type: 33, all: true, maxRanges: 1 })
    expect(harness.posted('af_anular3').map((form) => form.FOLIO_INI)).toEqual(['5', '3', '1'])
  })

  describe('maxRanges limits each pass', () => {
    const ranges = (count: number) =>
      unusedRangesPage(
        Array.from({ length: count }, (_, index) => [index * 10 + 1, index * 10 + 5] as [number, number]),
      )
    const routes = (count: number) => [
      entry,
      { url: `${MAULLIN}/af_anular2`, reply: { body: ranges(count) } },
      { url: `${MAULLIN}/af_anular3`, reply: { body: ANNUL_FORM } },
      { url: `${MAULLIN}/af_anular`, reply: { body: ANNUL_OK } },
    ]

    test('every pass takes the last ones it has not tried, so four passes reach four times the limit', async () => {
      const harness = await signedIn(routes(30))
      const result = await annulFolios(harness.portal, { type: 33, all: true, maxRanges: 8 })
      expect(harness.posted('af_anular')).toHaveLength(30)
      expect(result.totalAnnulled).toBe(150)
      expect(harness.posted('af_anular2')).toHaveLength(4)
      expect(harness.sleeps).toEqual([1500, 1500, 1500])
      const firsts = Array.from({ length: 30 }, (_, index) => String(index * 10 + 1))
      // Pass one takes the last 8 of the listing, pass two the 8 before them, and so on.
      expect(harness.posted('af_anular3').map((form) => form.FOLIO_INI)).toEqual([
        ...firsts.slice(22),
        ...firsts.slice(14, 22),
        ...firsts.slice(6, 14),
        ...firsts.slice(0, 6),
      ])
    })

    test('50 ranges by default in each pass', async () => {
      const harness = await signedIn(routes(300))
      await annulFolios(harness.portal, { type: 33, all: true })
      expect(harness.posted('af_anular')).toHaveLength(200)
    })

    test('ranges already annulled are tried once and then left to the next passes', async () => {
      const harness = await signedIn([
        entry,
        { url: `${MAULLIN}/af_anular2`, reply: { body: ranges(3) } },
        respond('af_anular3', page('ya fue anulado'), ANNUL_FORM, ANNUL_FORM),
        respond('af_anular', ANNUL_OK, ANNUL_OK),
      ])
      const result = await annulFolios(harness.portal, { type: 33, all: true, maxRanges: 1 })
      expect(result.annulled).toEqual([
        { from: 11, to: 15, count: 5 },
        { from: 1, to: 5, count: 5 },
      ])
      expect(result.rejected).toEqual([{ from: 21, to: 25, count: 5, reason: 'alreadyAnnulled' }])
    })

    test('a range annulled folio by folio is one range of its pass', async () => {
      const harness = await signedIn([
        entry,
        {
          url: `${MAULLIN}/af_anular2`,
          reply: {
            body: unusedRangesPage([
              [1, 2],
              [3, 4],
            ]),
          },
        },
        { url: `${MAULLIN}/af_anular3`, reply: { body: ANNUL_FORM } },
        respond('af_anular', page('ya fue anulado'), ANNUL_OK, ANNUL_OK, ANNUL_OK),
      ])
      const result = await annulFolios(harness.portal, { type: 33, all: true, maxRanges: 1 })
      expect(result.annulled).toEqual([
        { from: 3, to: 3, count: 1 },
        { from: 4, to: 4, count: 1 },
        { from: 1, to: 2, count: 2 },
      ])
      expect(harness.posted('af_anular3')).toHaveLength(2)
    })
  })

  test('a range annulled before is remembered, without going further', async () => {
    const harness = await signedIn([
      entry,
      twice(unusedRangesPage([[1, 3]])),
      respond('af_anular3', page('anulado anteriormente')),
    ])
    const result = await annulFolios(harness.portal, { type: 33, all: true })
    expect(result.rejected).toEqual([{ from: 1, to: 3, count: 3, reason: 'alreadyAnnulled' }])
    expect(result.knownAnnulled).toEqual(['1-3'])
    expect(harness.posted('af_anular')).toEqual([])
  })

  test('a conflict goes folio by folio; only what is final is remembered', async () => {
    const harness = await signedIn([
      entry,
      twice(unusedRangesPage([[1, 4]])),
      respond('af_anular3', ANNUL_FORM),
      respond(
        'af_anular',
        page('folio recepcionado'),
        ANNUL_OK,
        page('folio recepcionado'),
        page('Error 500'),
        new DteError('TRANSPORT_FAILED'),
        new DteError('TRANSPORT_FAILED'),
        new DteError('TRANSPORT_FAILED'),
      ),
    ])
    const result = await annulFolios(harness.portal, { type: 33, all: true })
    expect(result.annulled).toEqual([{ from: 1, to: 1, count: 1 }])
    expect(result.rejected).toEqual([
      { from: 2, to: 2, count: 1, reason: 'received' },
      { from: 3, to: 3, count: 1, reason: 'siiError' },
      { from: 4, to: 4, count: 1, reason: 'transport' },
    ])
    expect(result.knownAnnulled).toEqual(['1-1', '2-2'])
    expect(result).toMatchObject({ totalAnnulled: 1, totalRejected: 3 })
    expect(harness.posted('af_anular')[2]).toMatchObject({ FOLIO_INI_A: '2', FOLIO_FIN_A: '2' })
  })

  test('final answers are remembered and transient ones are not', async () => {
    const received = await signedIn([
      entry,
      twice(unusedRangesPage([[2, 2]])),
      respond('af_anular3', ANNUL_FORM),
      respond('af_anular', page('el folio ya fue anulado')),
    ])
    expect((await annulFolios(received.portal, { type: 33, all: true })).knownAnnulled).toEqual(['2-2'])
    const transient = await signedIn([
      entry,
      twice(unusedRangesPage([[1, 2]])),
      respond('af_anular3', ANNUL_FORM),
      respond('af_anular', page('xxx')),
    ])
    const result = await annulFolios(transient.portal, { type: 33, all: true })
    expect(result.rejected).toEqual([{ from: 1, to: 2, count: 2, reason: 'unknown' }])
    expect(result.knownAnnulled).toEqual([])
  })

  test('two real refusals in a row abandon the pass', async () => {
    const lines: string[] = []
    const log = (message: string): void => {
      lines.push(message)
    }
    const logger: Logger = { debug: log, info: log, warn: log, error: log }
    const harness = await signedIn(
      [
        entry,
        {
          url: `${MAULLIN}/af_anular2`,
          reply: {
            body: unusedRangesPage([
              [1, 2],
              [3, 4],
              [5, 6],
            ]),
          },
        },
        respond(
          'af_anular3',
          ANNUL_FORM,
          new DteError('TRANSPORT_FAILED'),
          new DteError('TRANSPORT_FAILED'),
          new DteError('TRANSPORT_FAILED'),
          ANNUL_FORM,
        ),
        respond('af_anular', page('la anulacion no procede'), ANNUL_OK),
      ],
      { logger },
    )
    const result = await annulFolios(harness.portal, { type: 33, all: true })
    expect(result.rejected).toEqual([
      { from: 1, to: 2, count: 2, reason: 'unknown' },
      { from: 3, to: 4, count: 2, reason: 'transport' },
    ])
    expect(lines).toContain('sii portal stopped annulling: the SII keeps refusing')
    // The next pass still reaches the range the first one abandoned.
    expect(result.annulled).toEqual([{ from: 5, to: 6, count: 2 }])
  })

  test('already annulled and received are not refusals, and a success resets the count', async () => {
    const harness = await signedIn([
      entry,
      list(
        unusedRangesPage([
          [1, 2],
          [3, 4],
          [5, 6],
          [7, 8],
        ]),
        unusedRangesPage([]),
      ),
      respond('af_anular3', ANNUL_FORM, page('ya fue anulado'), ANNUL_FORM, ANNUL_FORM),
      respond('af_anular', page('la anulacion no procede'), ANNUL_OK, page('la anulacion no procede')),
    ])
    const result = await annulFolios(harness.portal, { type: 33, all: true })
    expect(result.rejected.map((entryItem) => entryItem.reason)).toEqual(['unknown', 'alreadyAnnulled', 'unknown'])
    expect(result.annulled).toEqual([{ from: 5, to: 6, count: 2 }])
  })

  test('a transport failure at the last step counts as a refusal', async () => {
    const harness = await signedIn([
      entry,
      twice(unusedRangesPage([[1, 2]])),
      respond('af_anular3', ANNUL_FORM),
      respond(
        'af_anular',
        new DteError('TRANSPORT_FAILED'),
        new DteError('TRANSPORT_FAILED'),
        new DteError('TRANSPORT_FAILED'),
      ),
    ])
    const result = await annulFolios(harness.portal, { type: 33, all: true })
    expect(result.rejected).toEqual([{ from: 1, to: 2, count: 2, reason: 'transport' }])
  })

  describe('every query and step is tried up to three times, with 1.5 s between tries', () => {
    const failed = new DteError('TRANSPORT_FAILED')

    test('a step that fails twice and then answers is not a failure', async () => {
      const harness = await signedIn([
        entry,
        twice(unusedRangesPage([[1, 2]])),
        respond('af_anular3', failed, failed, ANNUL_FORM),
        respond('af_anular', ANNUL_OK),
      ])
      const result = await annulFolios(harness.portal, { type: 33, all: true })
      expect(result.annulled).toEqual([{ from: 1, to: 2, count: 2 }])
      expect(harness.posted('af_anular3')).toHaveLength(3)
      expect(harness.sleeps).toEqual([1500, 1500, 1500])
    })

    test('the query of the listing and its next pages are tried again too', async () => {
      const harness = await signedIn([
        entry,
        respond('af_anular2', failed, unusedRangesPage([[1, 3]], 2), failed, failed, unusedRangesPage([[10, 12]])),
      ])
      const result = await listFolioRanges(harness.portal, { type: 33 })
      expect(result.ranges.map((range) => range.from)).toEqual([10, 1])
      expect(harness.posted('af_anular2')).toHaveLength(5)
      expect(harness.sleeps).toEqual([1500, 1500, 1500])
    })

    test('the first query that fails three times ends the listing with its error', async () => {
      const harness = await signedIn([entry, respond('af_anular2', failed, failed, failed)])
      expect((await failure(listFolioRanges(harness.portal, { type: 33 }))).code).toBe('TRANSPORT_FAILED')
      expect(harness.sleeps).toEqual([1500, 1500])
    })

    test('any error is tried again, a block included, and then it ends everything', async () => {
      const harness = await signedIn([
        entry,
        list(unusedRangesPage([[1, 2]])),
        { url: `${MAULLIN}/af_anular3`, reply: { status: 403 } },
      ])
      expect((await failure(annulFolios(harness.portal, { type: 33, all: true }))).code).toBe('SII_PORTAL_BLOCKED')
      expect(harness.posted('af_anular3')).toHaveLength(3)
      expect(harness.sleeps).toEqual([1500, 1500])
    })

    test('each folio of a conflict has its own tries', async () => {
      const harness = await signedIn([
        entry,
        twice(unusedRangesPage([[1, 2]])),
        respond('af_anular3', ANNUL_FORM),
        respond('af_anular', page('ya fue anulado'), failed, ANNUL_OK, ANNUL_OK),
      ])
      const result = await annulFolios(harness.portal, { type: 33, all: true })
      expect(result.annulled).toEqual([
        { from: 1, to: 1, count: 1 },
        { from: 2, to: 2, count: 1 },
      ])
      expect(harness.sleeps).toEqual([1500, 1500])
    })
  })

  test('a block ends everything', async () => {
    const harness = await signedIn([
      entry,
      list(unusedRangesPage([[1, 2]])),
      { url: `${MAULLIN}/af_anular3`, reply: { status: 403 } },
    ])
    expect((await failure(annulFolios(harness.portal, { type: 33, all: true }))).code).toBe('SII_PORTAL_BLOCKED')
  })

  // Annulling cannot be undone: once the SII has answered for some folios, what it did reaches the caller.
  describe('a walk cut short returns what it already did, with the failure', () => {
    test('a later listing that fails for good, after an earlier pass annulled', async () => {
      const expired = new DteError('SII_PORTAL_SESSION_EXPIRED', { operation: 'annulFolios' })
      const harness = await signedIn([
        entry,
        respond('af_anular2', unusedRangesPage([[1, 3]]), expired, expired, expired),
        respond('af_anular3', ANNUL_FORM),
        respond('af_anular', ANNUL_OK),
      ])
      await expect(annulFolios(harness.portal, { type: 33, all: true, knownAnnulled: ['7-9'] })).resolves.toEqual({
        annulled: [{ from: 1, to: 3, count: 3 }],
        rejected: [],
        totalAnnulled: 3,
        totalRejected: 0,
        knownAnnulled: ['7-9', '1-3'],
        failure: { code: 'SII_PORTAL_SESSION_EXPIRED', operation: 'listFolioRanges' },
      })
      expect(harness.posted('af_anular')).toHaveLength(1)
    })

    test('a block at a later range, after an earlier one was annulled', async () => {
      const harness = await signedIn([
        entry,
        list(
          unusedRangesPage([
            [1, 2],
            [3, 4],
          ]),
        ),
        {
          url: `${MAULLIN}/af_anular3`,
          method: 'POST',
          reply: [{ body: ANNUL_FORM }, { status: 403 }, { status: 403 }, { status: 403 }],
        },
        respond('af_anular', ANNUL_OK),
      ])
      await expect(annulFolios(harness.portal, { type: 33, all: true })).resolves.toEqual({
        annulled: [{ from: 1, to: 2, count: 2 }],
        rejected: [],
        totalAnnulled: 2,
        totalRejected: 0,
        knownAnnulled: ['1-2'],
        failure: { code: 'SII_PORTAL_BLOCKED', operation: 'annulFolios' },
      })
    })

    test('a later listing the SII refuses keeps the kind of refusal in the failure', async () => {
      const harness = await signedIn([
        entry,
        list(unusedRangesPage([[1, 2]]), refusedPage('ANULACION DE FOLIOS')),
        respond('af_anular3', ANNUL_FORM),
        respond('af_anular', ANNUL_OK),
      ])
      const result = await annulFolios(harness.portal, { type: 33, all: true })
      expect(result.annulled).toEqual([{ from: 1, to: 2, count: 2 }])
      expect(result.failure).toEqual({
        code: 'SII_PORTAL_REJECTED',
        operation: 'listFolioRanges',
        rejection: 'optionNotAuthorized',
      })
    })

    test('a range that never got through is no answer, so a block after it still throws', async () => {
      const cut = new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' })
      const harness = await signedIn([
        entry,
        list(
          unusedRangesPage([
            [1, 2],
            [3, 4],
          ]),
        ),
        {
          url: `${MAULLIN}/af_anular3`,
          method: 'POST',
          reply: [cut, cut, cut, { status: 403 }, { status: 403 }, { status: 403 }],
        },
        respond('af_anular', ANNUL_OK),
      ])
      expect((await failure(annulFolios(harness.portal, { type: 33, all: true }))).code).toBe('SII_PORTAL_BLOCKED')
    })

    test('an answer that annuls nothing is still an answer, so a block after it returns the walk', async () => {
      const harness = await signedIn([
        entry,
        list(
          unusedRangesPage([
            [1, 2],
            [3, 4],
          ]),
        ),
        {
          url: `${MAULLIN}/af_anular3`,
          method: 'POST',
          reply: [{ body: page('ya fue anulado') }, { status: 403 }, { status: 403 }, { status: 403 }],
        },
      ])
      await expect(annulFolios(harness.portal, { type: 33, all: true })).resolves.toEqual(
        expect.objectContaining({
          annulled: [],
          rejected: [expect.objectContaining({ reason: 'alreadyAnnulled' })],
          failure: { code: 'SII_PORTAL_BLOCKED', operation: 'annulFolios' },
        }),
      )
    })

    test('a walk that finishes has no failure', async () => {
      const harness = await signedIn([
        entry,
        list(unusedRangesPage([[1, 2]]), unusedRangesPage([])),
        respond('af_anular3', ANNUL_FORM),
        respond('af_anular', ANNUL_OK),
      ])
      expect((await annulFolios(harness.portal, { type: 33, all: true })).failure).toBeNull()
    })

    test('anything that is not a DteError is a bug and still throws, whatever was annulled', async () => {
      const bug = new Error('bug')
      const harness = await signedIn([
        entry,
        list(
          unusedRangesPage([
            [1, 2],
            [3, 4],
          ]),
        ),
        respond('af_anular3', ANNUL_FORM, bug, bug, bug),
        respond('af_anular', ANNUL_OK),
      ])
      await expect(annulFolios(harness.portal, { type: 33, all: true })).rejects.toThrow('bug')
    })
  })

  test('the passes end after four, however many ranges keep appearing', async () => {
    const queue = [1, 2, 3, 4].map((n) => unusedRangesPage([[n * 10, n * 10 + 1]]))
    const harness = await signedIn([
      entry,
      list(...queue),
      { url: `${MAULLIN}/af_anular3`, reply: { body: ANNUL_FORM } },
      { url: `${MAULLIN}/af_anular`, reply: { body: ANNUL_OK } },
    ])
    const result = await annulFolios(harness.portal, { type: 33, all: true })
    expect(result.annulled).toHaveLength(4)
    expect(harness.sleeps).toEqual([1500, 1500, 1500])
  })

  test('a range with no date sends empty date fields', async () => {
    const html = page('<form><input name=FOLIO_INI value=5><input name=FOLIO_FIN value=6></form>')
    const harness = await signedIn([
      entry,
      twice(html),
      respond('af_anular3', ANNUL_FORM),
      respond('af_anular', ANNUL_OK),
    ])
    await annulFolios(harness.portal, { type: 33, all: true, companyRut: '10000004-0' })
    expect(harness.posted('af_anular3')[0]).toMatchObject({ DIA: '', MES: '', ANO: '', RUT_EMP: '10000004' })
  })
})
