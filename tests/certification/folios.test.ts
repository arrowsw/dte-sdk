import fc from 'fast-check'
import { parseCaf } from '../../src/caf/parse'
import { createFolioAllocator } from '../../src/certification/folios'
import { fixtureText } from '../support/fixtures'
import { failure } from '../support/portal'

const caf33 = parseCaf(fixtureText('caf-33.xml')) // folios 1 to 100
const caf33Next = parseCaf(fixtureText('caf-33.xml').replace('<D>1</D><H>100</H>', '<D>101</D><H>200</H>'))
const caf33Small = parseCaf(fixtureText('caf-33.xml').replace('<D>1</D><H>100</H>', '<D>1</D><H>2</H>'))
const caf39 = parseCaf(fixtureText('caf-39.xml'))

test('hands out consecutive folios of the first CAF of the type, with that CAF', async () => {
  const folios = createFolioAllocator([caf39, caf33, caf33Next])
  await expect(folios.take(33)).resolves.toEqual({ caf: caf33, folio: 1 })
  await expect(folios.take(33)).resolves.toEqual({ caf: caf33, folio: 2 })
  await expect(folios.take(39)).resolves.toEqual({ caf: caf39, folio: 1 })
})

test('moves to the next CAF when one is exhausted, and throws when every CAF of the type is', async () => {
  const folios = createFolioAllocator([caf33Small, caf33Next])
  await expect(folios.take(33)).resolves.toMatchObject({ folio: 1 })
  await expect(folios.take(33)).resolves.toMatchObject({ folio: 2 })
  await expect(folios.take(33)).resolves.toEqual({ caf: caf33Next, folio: 101 })
  const only = createFolioAllocator([caf33Small])
  await only.take(33)
  await only.take(33)
  const error = await failure(only.take(33))
  expect(error.code).toBe('FOLIO_OUT_OF_RANGE')
  expect(error.details).toEqual({ type: 33 })
})

test('a type with no CAF throws at once, and a CAF of another type is never used', async () => {
  const folios = createFolioAllocator([caf33])
  expect((await failure(folios.take(39))).code).toBe('FOLIO_OUT_OF_RANGE')
  expect((await failure(folios.take(61))).details).toEqual({ type: 61 })
})

test('used folios push the counter past the highest one inside the range, and others are ignored', async () => {
  const folios = createFolioAllocator([caf33, caf33Next], {
    usedFolios: [
      { type: 33, folio: 7 },
      { type: 33, folio: 3 },
      { type: 33, folio: 150 },
      { type: 33, folio: 999 },
      { type: 39, folio: 50 },
    ],
  })
  await expect(folios.take(33)).resolves.toEqual({ caf: caf33, folio: 8 })
  const exhausted = createFolioAllocator([caf33Small], { usedFolios: [{ type: 33, folio: 2 }] })
  expect((await failure(exhausted.take(33))).code).toBe('FOLIO_OUT_OF_RANGE')
})

test('never hands out the same folio twice, and every folio lies in its CAF range and outside the used ones', async () => {
  // Real CAFs of one type never overlap, so the property uses ranges 1-2, 3-100 and 101-200.
  const caf33Middle = parseCaf(fixtureText('caf-33.xml').replace('<D>1</D><H>100</H>', '<D>3</D><H>100</H>'))
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 250 }),
      fc.array(fc.integer({ min: 1, max: 200 }), { maxLength: 20 }),
      async (takes, used) => {
        const folios = createFolioAllocator([caf33Small, caf33Middle, caf33Next], {
          usedFolios: used.map((folio) => ({ type: 33, folio })),
        })
        const taken: { readonly caf: typeof caf33; readonly folio: number }[] = []
        for (let index = 0; index < takes; index++) {
          try {
            taken.push(await folios.take(33))
          } catch (error) {
            expect((error as { code?: string }).code).toBe('FOLIO_OUT_OF_RANGE')
            break
          }
        }
        const numbers = taken.map(({ caf, folio }) => `${caf.range.from}:${folio}`)
        expect(new Set(numbers).size).toBe(numbers.length)
        for (const { caf, folio } of taken) {
          expect(folio).toBeGreaterThanOrEqual(caf.range.from)
          expect(folio).toBeLessThanOrEqual(caf.range.to)
          expect(used).not.toContain(folio)
        }
      },
    ),
    { numRuns: 50 },
  )
})
