import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createDirectoryCertificationStore } from '../../src/certification/node-store'
import {
  assertArtefactName,
  createCertificationState,
  createMemoryCertificationStore,
  type CertificationStore,
} from '../../src/certification/state'
import { FIXED_NOW, ISSUER_RUT } from '../support/fixtures'
import { failure } from '../support/portal'
import { createTempDirs } from '../support/temp-dir'

const temp = createTempDirs()
afterAll(temp.cleanup)

test('a fresh state', () => {
  expect(createCertificationState(ISSUER_RUT, FIXED_NOW)).toEqual({
    version: 1,
    companyRut: ISSUER_RUT,
    cafs: [],
    usedFolios: [],
    sets: {},
    setsApproved: false,
    books: { occupiedPeriods: [], adjustmentTried: [], accumulated: {}, results: {} },
    stage: 'testSets',
    updatedAt: '2026-11-15T18:30:00.000Z',
  })
  expect(createCertificationState(ISSUER_RUT).version).toBe(1)
})

test.each(['../x', 'a/../b', '/abs', 'a//b', '.', 'a/./b', 'con espacio', ''])('unsafe artefact name %j', (name) => {
  expect(() => assertArtefactName(name)).toThrow(
    expect.objectContaining({ code: 'INVALID_OPTION', details: { field: 'name', name } }),
  )
})

const roundTrip = async (store: CertificationStore): Promise<void> => {
  expect(await store.load()).toBeNull()
  expect(await store.listArtefacts()).toEqual([])
  expect(await store.readArtefact('missing.txt')).toBeNull()
  const state = createCertificationState(ISSUER_RUT, FIXED_NOW)
  await store.save(state)
  await store.save({ ...state, stage: 'books' })
  expect(await store.load()).toEqual({ ...state, stage: 'books' })
  await store.writeArtefact('set-texto.txt', 'SET BASICO')
  await store.writeArtefact('sets-prueba/dtes/dte-33-000001.xml', '<DTE/>')
  await store.writeArtefact('set-texto.txt', 'SET BASICO v2')
  expect(await store.readArtefact('set-texto.txt')).toBe('SET BASICO v2')
  expect(await store.readArtefact('sets-prueba/dtes/dte-33-000001.xml')).toBe('<DTE/>')
  expect(await store.listArtefacts()).toEqual(['set-texto.txt', 'sets-prueba/dtes/dte-33-000001.xml'])
  expect((await failure(store.writeArtefact('../x', ''))).details).toMatchObject({ field: 'name' })
  expect((await failure(store.readArtefact('../x'))).details).toMatchObject({ field: 'name' })
}

test('the memory store', () => roundTrip(createMemoryCertificationStore()))

test('the directory store: state.json atomic, artefacts as files under sub-directories', async () => {
  const dir = await temp.make('dte-sdk-cert-')
  const store = createDirectoryCertificationStore({ dir })
  await roundTrip(store)
  expect(JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'))).toMatchObject({ stage: 'books' })
  expect(await readFile(join(dir, 'sets-prueba', 'dtes', 'dte-33-000001.xml'), 'utf8')).toBe('<DTE/>')
  if (process.platform !== 'win32') {
    expect((await stat(join(dir, 'sets-prueba', 'dtes'))).mode & 0o777).toBe(0o700)
    expect((await stat(join(dir, 'state.json'))).mode & 0o777).toBe(0o600)
    expect((await stat(join(dir, 'sets-prueba', 'dtes', 'dte-33-000001.xml'))).mode & 0o777).toBe(0o600)
  }
  expect(await createDirectoryCertificationStore({ dir: join(dir, 'nope') }).listArtefacts()).toEqual([])
  const again = createDirectoryCertificationStore({ dir })
  expect(await again.load()).toMatchObject({ companyRut: ISSUER_RUT })
  expect(await again.listArtefacts()).toEqual(['set-texto.txt', 'sets-prueba/dtes/dte-33-000001.xml'])
})

test('the directory store: a read failure that is not a missing file propagates', async () => {
  const dir = await temp.make('dte-sdk-cert-')
  const store = createDirectoryCertificationStore({ dir })
  await store.writeArtefact('dir-like/inner.txt', 'x')
  const error = await failure(store.readArtefact('dir-like'))
  expect((error as unknown as { code: string }).code).toBe('EISDIR')
  const listing = createDirectoryCertificationStore({ dir: join(dir, 'dir-like', 'inner.txt') })
  await expect(listing.listArtefacts()).rejects.toMatchObject({ code: 'ENOTDIR' })
})

test('the directory store without node:fs', async () => {
  const store = createDirectoryCertificationStore({ dir: 'x' }, () => Promise.reject(new Error('no fs')))
  const error = await failure(store.load())
  expect(error.code).toBe('TRANSPORT_UNAVAILABLE')
  expect(error.details).toEqual({ reason: 'no fs' })
})
