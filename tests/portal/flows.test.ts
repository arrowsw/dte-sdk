import { readFileSync } from 'node:fs'
import { DteError } from '../../src/errors'
import { reobtainFolios, requestCafExact, requestCafInBatches } from '../../src/portal/flows'
import type { Logger } from '../../src/sii/logger'
import { FIXED_NOW, fixturePath } from '../support/fixtures'
import { failure, MAULLIN, signedIn } from '../support/portal'
import {
  ANNUL_ENTRY,
  ANNUL_FORM,
  ANNUL_OK,
  page,
  quotaForm,
  REJECTION_PAGES,
  REOBTAIN_RESOLUTION,
  reobtainDetailPage,
  reobtainListPage,
  refusedPage,
  STAMP_ENTRY,
  unusedRangesPage,
} from '../support/portal-pages'

const CAF_XML = readFileSync(fixturePath('caf-33.xml'), 'latin1')
const OLD_CAF_XML = readFileSync(fixturePath('caf-33-old.xml'), 'latin1')
const entry = { url: `${MAULLIN}/of_solicita_folios`, method: 'GET' as const, reply: { body: STAMP_ENTRY } }
const replies = (name: string, ...bodies: readonly (string | Error | { status: number })[]) => ({
  url: `${MAULLIN}/${name}`,
  method: 'POST' as const,
  reply: bodies.map((body) => (typeof body === 'string' ? { body } : body)),
})
const annulRoutes = (ranges: string, form: string = ANNUL_FORM) => [
  { url: `${MAULLIN}/af_anular1`, reply: { body: ANNUL_ENTRY } },
  { url: `${MAULLIN}/af_anular2`, reply: { body: ranges } },
  { url: `${MAULLIN}/af_anular3`, reply: { body: form } },
  { url: `${MAULLIN}/af_anular`, reply: { body: ANNUL_OK } },
]

describe('requestCafExact', () => {
  test('one CAF that covers everything', async () => {
    const harness = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', quotaForm(100, 0)),
      replies('of_confirma_folio', CAF_XML),
    ])
    const result = await requestCafExact(harness.portal, { type: 33, quantity: 100 })
    expect(result).toMatchObject({
      complete: true,
      granted: 100,
      rejection: null,
      maxAuthorized: 100,
      availableFolios: 0,
    })
    expect(result.cafs).toHaveLength(1)
    expect(harness.posted('of_solicita_folios_dcto')[0].CANTIDAD).toBe('100')
  })

  test('a CAF shorter than asked still reaches the caller', async () => {
    const harness = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', quotaForm()),
      replies('of_confirma_folio', CAF_XML),
    ])
    const result = await requestCafExact(harness.portal, { type: 33, quantity: 500, companyRut: '10000004-0' })
    expect(result).toMatchObject({ complete: false, rejection: 'foliosShort', granted: 100 })
    expect(result.cafs).toHaveLength(1)
  })

  test('a refusal is data, and annulling stays off by default', async () => {
    const harness = await signedIn([entry, replies('of_solicita_folios_dcto', quotaForm(2, 6))])
    await expect(requestCafExact(harness.portal, { type: 33, quantity: 5 })).resolves.toEqual({
      complete: false,
      cafs: [],
      granted: 0,
      maxAuthorized: 2,
      availableFolios: 6,
      rejection: 'quotaInsufficient',
      portalMessage: expect.any(String),
      knownAnnulled: [],
    })
    expect(harness.urls().some((url) => url.includes('af_anular'))).toBe(false)
  })

  test('with allowAnnul it annuls and asks once more', async () => {
    const harness = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', quotaForm(2, 6), quotaForm(100, 0)),
      replies('of_confirma_folio', CAF_XML),
      ...annulRoutes(unusedRangesPage([[1, 6]])),
    ])
    const result = await requestCafExact(harness.portal, { type: 33, quantity: 5, allowAnnul: true })
    expect(result).toMatchObject({ complete: true, availableFolios: 0 })
    expect(harness.posted('af_anular')).not.toEqual([])
  })

  test('annulling stops at 20 ranges in all', async () => {
    const many = unusedRangesPage(
      Array.from({ length: 30 }, (_, index) => [index * 10 + 1, index * 10 + 5] as [number, number]),
    )
    const harness = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', quotaForm(2, 6), quotaForm(100, 0)),
      replies('of_confirma_folio', CAF_XML),
      ...annulRoutes(many),
    ])
    await requestCafExact(harness.portal, { type: 33, quantity: 5, allowAnnul: true })
    expect(harness.posted('af_anular')).toHaveLength(20)
  })

  test('exclude and knownAnnulled reach the annulment, and the memory comes back', async () => {
    const harness = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', quotaForm(2, 6), quotaForm(100, 0)),
      replies('of_confirma_folio', CAF_XML),
      ...annulRoutes(
        unusedRangesPage([
          [1, 2],
          [3, 4],
          [5, 6],
        ]),
      ),
    ])
    const result = await requestCafExact(harness.portal, {
      type: 33,
      quantity: 5,
      allowAnnul: true,
      exclude: [{ from: 5, to: 6 }],
      knownAnnulled: ['3-4'],
    })
    expect(harness.posted('af_anular3').map((form) => form.FOLIO_INI)).toEqual(['1'])
    expect(result).toMatchObject({ complete: true, knownAnnulled: ['3-4', '1-2'] })
  })

  test('with nothing to annul the memory comes back as it was', async () => {
    const asked = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', quotaForm(100, 0)),
      replies('of_confirma_folio', CAF_XML),
    ])
    const known = await requestCafExact(asked.portal, { type: 33, quantity: 5, knownAnnulled: ['3-4'] })
    expect(known.knownAnnulled).toEqual(['3-4'])
    const empty = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', quotaForm(100, 0)),
      replies('of_confirma_folio', CAF_XML),
    ])
    expect((await requestCafExact(empty.portal, { type: 33, quantity: 5 })).knownAnnulled).toEqual([])
    const none = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', quotaForm(2, 6)),
      ...annulRoutes(page('sin rangos')),
    ])
    const refused = await requestCafExact(none.portal, {
      type: 33,
      quantity: 5,
      allowAnnul: true,
      knownAnnulled: ['3-4'],
    })
    expect(refused).toMatchObject({ rejection: 'noAnnullableFolios', knownAnnulled: ['3-4'] })
  })

  test('a blocked type has no FOLIOS_DISP, and that case does try', async () => {
    const harness = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', REJECTION_PAGES.stampingBlocked, quotaForm(100, 0)),
      replies('of_confirma_folio', CAF_XML),
      ...annulRoutes(unusedRangesPage([[1, 6]])),
    ])
    await expect(
      requestCafExact(harness.portal, { type: 33, quantity: 5, allowAnnul: true, companyRut: '76543210-3' }),
    ).resolves.toMatchObject({ complete: true })
  })

  test('FOLIOS_DISP 0 means nothing is annullable: no attempt', async () => {
    const harness = await signedIn([entry, replies('of_solicita_folios_dcto', quotaForm(2, 0))])
    const result = await requestCafExact(harness.portal, { type: 33, quantity: 5, allowAnnul: true })
    expect(result.rejection).toBe('quotaInsufficient')
    expect(harness.urls().some((url) => url.includes('af_anular'))).toBe(false)
  })

  test('nothing annulled is its own answer', async () => {
    const harness = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', quotaForm(2, 6)),
      ...annulRoutes(page('sin rangos')),
    ])
    const result = await requestCafExact(harness.portal, { type: 33, quantity: 5, allowAnnul: true })
    expect(result).toMatchObject({ complete: false, rejection: 'noAnnullableFolios', availableFolios: 6 })
  })

  test('a listing refused while trying to annul comes back as data, with the quota it had', async () => {
    const harness = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', quotaForm(2, 6)),
      { url: `${MAULLIN}/af_anular1`, reply: { body: refusedPage('ANULACION DE FOLIOS') } },
    ])
    const result = await requestCafExact(harness.portal, {
      type: 33,
      quantity: 5,
      allowAnnul: true,
      knownAnnulled: ['3-4'],
    })
    expect(result).toMatchObject({
      complete: false,
      rejection: 'optionNotAuthorized',
      availableFolios: 6,
      portalMessage: expect.stringContaining('autorizado'),
      knownAnnulled: ['3-4'],
    })
  })

  test('a refusal annulling cannot help is returned as it is', async () => {
    const harness = await signedIn([entry, replies('of_solicita_folios_dcto', REJECTION_PAGES.companyNotAuthorized)])
    const result = await requestCafExact(harness.portal, { type: 33, quantity: 5, allowAnnul: true })
    expect(result).toMatchObject({ rejection: 'companyNotAuthorized', maxAuthorized: null })
  })

  test('other failures stay errors', async () => {
    const harness = await signedIn([entry, replies('of_solicita_folios_dcto', page('algo raro'))])
    expect((await failure(requestCafExact(harness.portal, { type: 33, quantity: 5 }))).code).toBe(
      'SII_PORTAL_UNEXPECTED_PAGE',
    )
    const buggy = await signedIn([entry, replies('of_solicita_folios_dcto', new Error('bug'))])
    await expect(requestCafExact(buggy.portal, { type: 33, quantity: 5 })).rejects.toThrow('bug')
  })
})

describe('requestCafInBatches', () => {
  test('reads the quota and asks for what fits, batch after batch', async () => {
    const harness = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', quotaForm(3, 0), quotaForm(3, 0)),
      replies('of_confirma_folio', CAF_XML),
    ])
    const result = await requestCafInBatches(harness.portal, { type: 33, quantity: 3 })
    expect(result).toMatchObject({ complete: true, granted: 100, maxAuthorized: 3, rejection: null })
    expect(harness.posted('of_confirma_folio')[0].CANT_DOCTOS).toBe('3')
  })

  test('an unrestricted type asks for everything, and a quota in hand skips the first reading', async () => {
    const harness = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', quotaForm()),
      replies('of_confirma_folio', CAF_XML),
    ])
    const result = await requestCafInBatches(harness.portal, {
      type: 33,
      quantity: 80,
      companyRut: '76543210-3',
      initialQuota: { unrestricted: true, blocked: false, maxAuthorized: null, availableFolios: null },
    })
    expect(result).toMatchObject({
      complete: true,
      cafs: [expect.anything()],
      maxAuthorized: null,
      availableFolios: null,
    })
    expect(harness.posted('of_solicita_folios_dcto')).toHaveLength(1)
  })

  test('no room at the first reading, then a block with nothing obtained', async () => {
    const empty = await signedIn([entry, replies('of_solicita_folios_dcto', quotaForm(0, 3))])
    await expect(requestCafInBatches(empty.portal, { type: 33, quantity: 3 })).resolves.toEqual({
      complete: false,
      cafs: [],
      granted: 0,
      maxAuthorized: 0,
      availableFolios: 3,
      rejection: 'quotaCapReached',
      portalMessage: null,
    })
    const blocked = await signedIn([entry, replies('of_solicita_folios_dcto', REJECTION_PAGES.stampingBlocked)])
    await expect(requestCafInBatches(blocked.portal, { type: 33, quantity: 3 })).resolves.toMatchObject({
      complete: false,
      rejection: 'quotaCapReached',
      maxAuthorized: null,
    })
  })

  test('a rejection at the reading keeps its own value', async () => {
    const harness = await signedIn([entry, replies('of_solicita_folios_dcto', REJECTION_PAGES.companyNotAuthorized)])
    await expect(requestCafInBatches(harness.portal, { type: 33, quantity: 3 })).resolves.toMatchObject({
      rejection: 'companyNotAuthorized',
      portalMessage: expect.any(String),
    })
  })

  test('a refusal with nothing obtained keeps its value; after a grant it is the cap', async () => {
    const nothing = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', quotaForm(3, 0), REJECTION_PAGES.optionNotAuthorized),
    ])
    await expect(requestCafInBatches(nothing.portal, { type: 33, quantity: 3 })).resolves.toMatchObject({
      rejection: 'optionNotAuthorized',
      maxAuthorized: 3,
      availableFolios: 0,
    })
    const some = await signedIn([
      entry,
      replies(
        'of_solicita_folios_dcto',
        quotaForm(3, 0),
        quotaForm(3, 0),
        quotaForm(3, 0),
        REJECTION_PAGES.optionNotAuthorized,
      ),
      replies('of_confirma_folio', CAF_XML),
    ])
    await expect(requestCafInBatches(some.portal, { type: 33, quantity: 200 })).resolves.toMatchObject({
      complete: false,
      granted: 100,
      rejection: 'quotaCapReached',
    })
  })

  test('a rejection at a later reading keeps what was obtained', async () => {
    const harness = await signedIn([
      entry,
      replies('of_solicita_folios_dcto', quotaForm(3, 0), quotaForm(3, 0), REJECTION_PAGES.companyNotAuthorized),
      replies('of_confirma_folio', CAF_XML),
    ])
    const result = await requestCafInBatches(harness.portal, { type: 33, quantity: 200 })
    expect(result).toMatchObject({ complete: false, granted: 100, rejection: 'companyNotAuthorized' })
    expect(result.cafs).toHaveLength(1)
  })

  test('the batches are bounded', async () => {
    const harness = await signedIn([
      entry,
      { url: `${MAULLIN}/of_solicita_folios_dcto`, reply: { body: quotaForm(3, 0) } },
      { url: `${MAULLIN}/of_confirma_folio`, reply: { body: CAF_XML } },
    ])
    const result = await requestCafInBatches(harness.portal, { type: 33, quantity: 1000, maxBatches: 2 })
    expect(result).toMatchObject({ complete: false, granted: 200, rejection: 'quotaCapReached', maxAuthorized: 3 })
    expect(result.cafs).toHaveLength(2)
  })

  test('a failure of another kind stays an error', async () => {
    const harness = await signedIn([entry, replies('of_solicita_folios_dcto', page('raro'))])
    expect((await failure(requestCafInBatches(harness.portal, { type: 33, quantity: 3 }))).code).toBe(
      'SII_PORTAL_UNEXPECTED_PAGE',
    )
  })
})

describe('reobtainFolios', () => {
  test('a refused listing comes back as data', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/rf_reobtencion1_folios`, reply: { body: page('form') } },
      { url: `${MAULLIN}/rf_reobtencion2_folios`, reply: { body: refusedPage('REOBTENCION DE FOLIOS') } },
    ])
    await expect(reobtainFolios(harness.portal, { type: 33, quantity: 2 })).resolves.toEqual({
      complete: false,
      cafs: [],
      ranges: [],
      expired: [],
      available: 0,
      reason: expect.stringContaining('autorizado'),
      rejection: 'optionNotAuthorized',
    })
  })

  const listRoutes = (ranges: readonly (readonly [number, number])[], annulled: readonly number[] = []) => [
    { url: `${MAULLIN}/rf_reobtencion1_folios`, reply: { body: page('form') } },
    { url: `${MAULLIN}/rf_reobtencion2_folios`, reply: { body: reobtainListPage(ranges) } },
    {
      url: `${MAULLIN}/rf_reobtencion3_folios`,
      reply: ranges.map(([from]) => ({ body: reobtainDetailPage(from, annulled.includes(from)) })),
    },
  ]
  const download = (...files: readonly string[]) => [
    { url: `${MAULLIN}/rf_genera_folio`, reply: { body: REOBTAIN_RESOLUTION } },
    replies('rf_genera_archivo', ...files),
  ]

  test('covers the quantity, oldest first, and stops there', async () => {
    const harness = await signedIn([
      ...listRoutes([
        [50, 59],
        [1, 9],
      ]),
      ...download(CAF_XML),
    ])
    const result = await reobtainFolios(harness.portal, { type: 33, quantity: 2 })
    expect(result).toMatchObject({
      complete: true,
      available: 2,
      reason: null,
      ranges: [{ from: 1, to: 9, freeFolios: [1, 2] }],
      expired: [],
    })
    expect(result.cafs).toHaveLength(1)
  })

  test('annulled and issued ranges do not count; too little comes back without downloading', async () => {
    const harness = await signedIn([
      ...listRoutes(
        [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
        [1],
      ),
    ])
    const result = await reobtainFolios(harness.portal, {
      type: 33,
      quantity: 5,
      isIssued: async (range) => range.from === 3,
      companyRut: '76543210-3',
    })
    expect(result).toMatchObject({ complete: false, cafs: [], available: 2 })
    expect(result.reason).toContain('2 of 5')
    expect(harness.posted('rf_genera_folio')).toEqual([])
  })

  test('free folios are confirmed; a range with some received is still used', async () => {
    const harness = await signedIn([...listRoutes([[1, 9]]), ...download(CAF_XML)])
    const result = await reobtainFolios(harness.portal, {
      type: 33,
      quantity: 2,
      isFolioFree: async (folio) => folio > 4,
    })
    expect(result.ranges).toEqual([{ from: 1, to: 9, freeFolios: [5, 6] }])
  })

  test('the checks per range are bounded and a range with no free folio is skipped', async () => {
    const checked: number[] = []
    const harness = await signedIn([...listRoutes([[1, 9]]), ...download(CAF_XML)])
    const result = await reobtainFolios(harness.portal, {
      type: 33,
      quantity: 2,
      maxChecksPerRange: 3,
      isFolioFree: (folio) => {
        checked.push(folio)
        return false
      },
    })
    expect(checked).toEqual([1, 2, 3])
    expect(result).toMatchObject({ complete: false, cafs: [], available: 0 })
    expect(result.reason).toContain('0 of 2')
  })

  test('an expired CAF does not count and the walk moves on', async () => {
    const harness = await signedIn([
      ...listRoutes([
        [1, 2],
        [3, 4],
      ]),
      ...download(OLD_CAF_XML, CAF_XML),
    ])
    const result = await reobtainFolios(harness.portal, { type: 33, quantity: 2 })
    expect(result.expired).toEqual([{ from: 1, to: 2, authorizationDate: expect.any(String) }])
    expect(result).toMatchObject({ complete: true, ranges: [{ from: 3, to: 4 }] })
    expect(FIXED_NOW.getFullYear()).toBe(2026)
  })

  test('a refused range is logged and what was downloaded comes back', async () => {
    const lines: string[] = []
    const log = (message: string): void => {
      lines.push(message)
    }
    const logger: Logger = { debug: log, info: log, warn: log, error: log }
    const harness = await signedIn(
      [
        ...listRoutes([
          [1, 2],
          [3, 4],
        ]),
        { url: `${MAULLIN}/rf_genera_folio`, reply: { body: REOBTAIN_RESOLUTION } },
        replies('rf_genera_archivo', CAF_XML, page('nada')),
      ],
      { logger },
    )
    const result = await reobtainFolios(harness.portal, { type: 33, quantity: 3 })
    expect(result).toMatchObject({ complete: false, available: 2 })
    expect(result.cafs).toHaveLength(1)
    expect(lines).toContain('sii portal could not reobtain a range')
  })

  test('a transport failure stays an error', async () => {
    const harness = await signedIn([
      ...listRoutes([[1, 2]]),
      { url: `${MAULLIN}/rf_genera_folio`, reply: new DteError('TRANSPORT_FAILED') },
    ])
    expect((await failure(reobtainFolios(harness.portal, { type: 33, quantity: 1 }))).code).toBe('TRANSPORT_FAILED')
  })
})
