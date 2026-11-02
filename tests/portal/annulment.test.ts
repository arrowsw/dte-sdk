import { DteError } from '../../src/errors'
import { annulFolios, listFolioRanges } from '../../src/portal/annulment'
import type { Logger } from '../../src/sii/logger'
import { failure, MAULLIN, signedIn } from '../support/portal'
import { ANNUL_ENTRY, ANNUL_FORM, ANNUL_OK, page, unusedRangesPage } from '../support/portal-pages'

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

  test('maxRanges takes the last ones of the listing', async () => {
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
    expect(harness.posted('af_anular3')[0]).toMatchObject({ FOLIO_INI: '5' })
    expect(harness.posted('af_anular3')).toHaveLength(3)
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
      twice(unusedRangesPage([[1, 2]])),
      respond('af_anular3', ANNUL_FORM),
      respond('af_anular', page('fue anulado y ya esta')),
    ])
    expect((await annulFolios(received.portal, { type: 33, all: true })).knownAnnulled).toEqual(['1-2'])
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
        respond('af_anular3', ANNUL_FORM, new DteError('TRANSPORT_FAILED'), ANNUL_FORM),
        respond('af_anular', page('la anulacion no procede'), ANNUL_OK),
      ],
      { logger },
    )
    const result = await annulFolios(harness.portal, { type: 33, all: true })
    expect(result.rejected).toEqual([
      { from: 1, to: 2, count: 2, reason: 'refused' },
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
    expect(result.rejected.map((entryItem) => entryItem.reason)).toEqual(['refused', 'alreadyAnnulled', 'refused'])
    expect(result.annulled).toEqual([{ from: 5, to: 6, count: 2 }])
  })

  test('a transport failure at the last step counts as a refusal', async () => {
    const harness = await signedIn([
      entry,
      twice(unusedRangesPage([[1, 2]])),
      respond('af_anular3', ANNUL_FORM),
      respond('af_anular', new DteError('TRANSPORT_FAILED')),
    ])
    const result = await annulFolios(harness.portal, { type: 33, all: true })
    expect(result.rejected).toEqual([{ from: 1, to: 2, count: 2, reason: 'transport' }])
  })

  test('a block ends everything', async () => {
    const harness = await signedIn([
      entry,
      list(unusedRangesPage([[1, 2]])),
      { url: `${MAULLIN}/af_anular3`, reply: { status: 403 } },
    ])
    expect((await failure(annulFolios(harness.portal, { type: 33, all: true }))).code).toBe('SII_PORTAL_BLOCKED')
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
