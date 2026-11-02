import {
  emptyLedger,
  markAnnulledInLedger,
  markSentInLedger,
  releaseInLedger,
  remainingInLedger,
  reserveInLedger,
  statsOfLedger,
  type FolioLedger,
  type FolioScope,
} from '../../src/folios/ledger'

const AT = '2026-11-15T18:30:00.000Z'
const scope: FolioScope = {
  companyRut: '76543210-3',
  type: 33,
  range: { from: 1, to: 3 },
  environment: 'certification',
}

const reserveMany = (ledger: FolioLedger, count: number, target = scope): { ledger: FolioLedger; folios: number[] } => {
  const folios: number[] = []
  const box = { ledger }
  for (let index = 0; index < count; index += 1) {
    const reserved = reserveInLedger(box.ledger, target, AT)
    box.ledger = reserved.ledger
    folios.push(reserved.folio)
  }
  return { ledger: box.ledger, folios }
}

test('folios go out in order, then the range ends', () => {
  const { ledger, folios } = reserveMany(emptyLedger(), 3)
  expect(folios).toEqual([1, 2, 3])
  expect(() => reserveInLedger(ledger, scope, AT)).toThrow(
    expect.objectContaining({ code: 'FOLIO_OUT_OF_RANGE', details: { folio: 4, from: 1, to: 3, type: 33 } }),
  )
})

test('a long run of used folios after an unsent one does not overflow the stack', () => {
  const wide = { ...scope, range: { from: 1, to: 50000 } }
  const seeded = markSentInLedger(emptyLedger(), wide, 2, {}, AT)
  const [key] = Object.keys(seeded.entries)
  const used = Array.from({ length: 30000 }, (_, index) => index + 1)
  const sent = Object.fromEntries(used.slice(1).map((folio) => [String(folio), { trackId: null, sentAt: AT }]))
  const ledger = { ...seeded, entries: { [key]: { ...seeded.entries[key], used, lastReserved: 30000, sent } } }
  expect(reserveInLedger(ledger, wide, AT).folio).toBe(30001)
})

test('the input is never changed', () => {
  const ledger = emptyLedger()
  reserveInLedger(ledger, scope, AT)
  expect(ledger).toEqual(emptyLedger())
})

test('a gap left by a release is reused while something stays unsent', () => {
  const { ledger } = reserveMany(emptyLedger(), 3)
  const released = releaseInLedger(ledger, scope, [2], AT)
  expect(reserveInLedger(released, scope, AT).folio).toBe(2)
})

test('after everything was sent a gap below stays a gap', () => {
  const big = { ...scope, range: { from: 1, to: 9 } }
  const { ledger } = reserveMany(emptyLedger(), 3, big)
  const sent = markSentInLedger(markSentInLedger(ledger, big, 1, {}, AT), big, 3, {}, AT)
  const released = releaseInLedger(sent, big, [2], AT)
  expect(reserveInLedger(released, big, AT).folio).toBe(4)
})

test('annulled folios of any entry of the company, type and environment are skipped', () => {
  const other = { ...scope, cafFingerprint: 'abc' }
  const annulled = markAnnulledInLedger(emptyLedger(), other, [1, 1, 2], AT)
  expect(reserveInLedger(annulled, scope, AT).folio).toBe(3)
  expect(reserveInLedger(annulled, { ...scope, type: 34 }, AT).folio).toBe(1)
  expect(reserveInLedger(annulled, { ...scope, environment: 'production' }, AT).folio).toBe(1)
  expect(reserveInLedger(annulled, { ...scope, companyRut: '10000004-0' }, AT).folio).toBe(1)
  expect(markAnnulledInLedger(annulled, other, [2, 3], AT).entries[Object.keys(annulled.entries)[0]].annulled).toEqual([
    1, 2, 3,
  ])
})

test('marking as sent records it, counts as used and keeps the order', () => {
  const ledger = markSentInLedger(
    emptyLedger(),
    scope,
    3,
    { trackId: '99', sentAt: 'then', extra: { kind: 'dte' } },
    AT,
  )
  const entry = Object.values(ledger.entries)[0]
  expect(entry.used).toEqual([3])
  expect(entry.lastReserved).toBe(3)
  expect(entry.sent['3']).toEqual({ trackId: '99', sentAt: 'then', extra: { kind: 'dte' } })
  const again = markSentInLedger(ledger, scope, 1, {}, AT)
  expect(Object.values(again.entries)[0].used).toEqual([1, 3])
  expect(Object.values(again.entries)[0].sent['1']).toEqual({ trackId: null, sentAt: AT })
  const same = markSentInLedger(again, scope, 1, { trackId: '1' }, AT)
  expect(Object.values(same.entries)[0].used).toEqual([1, 3])
  expect(() => markSentInLedger(emptyLedger(), scope, 4, {}, AT)).toThrow(
    expect.objectContaining({ code: 'FOLIO_OUT_OF_RANGE' }),
  )
})

test('a release also forgets the sent record; unknown entries stay unknown', () => {
  const sent = markSentInLedger(reserveMany(emptyLedger(), 1).ledger, scope, 1, {}, AT)
  const released = releaseInLedger(sent, scope, [1], AT)
  const entry = Object.values(released.entries)[0]
  expect(entry).toMatchObject({ used: [], sent: {}, lastReserved: null })
  const other = emptyLedger()
  expect(releaseInLedger(other, scope, [1], AT)).toBe(other)
})

test('remaining and statistics', () => {
  expect(remainingInLedger(emptyLedger(), scope)).toBe(3)
  const { ledger } = reserveMany(emptyLedger(), 2)
  expect(remainingInLedger(ledger, scope)).toBe(1)
  const sent = markSentInLedger(ledger, scope, 1, {}, AT)
  const production = reserveMany(sent, 1, { ...scope, environment: 'production' }).ledger
  expect(statsOfLedger(production, { companyRut: scope.companyRut, type: 33, environment: 'certification' })).toEqual({
    totalEntries: 1,
    totalUsed: 2,
    totalSent: 1,
    ranges: [{ from: 1, to: 3, used: 2, sent: 1, remaining: 1 }],
  })
  expect(statsOfLedger(production, { companyRut: scope.companyRut, type: 33 }).totalEntries).toBe(2)
  expect(statsOfLedger(production, { companyRut: scope.companyRut, type: 34 }).totalEntries).toBe(0)
  expect(statsOfLedger(production, { companyRut: '10000004-0', type: 33 }).totalEntries).toBe(0)
})
