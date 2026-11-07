import { mkdir, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FolioScope } from '../../src/folios/ledger'
import { findCafFiles, findLatestCafFile, resolveCafFile } from '../../src/folios/node-caf-files'
import { cafFingerprint, createMemoryFolioRegistry } from '../../src/folios/registry'
import { loadNodeFs, type NodeFsModules } from '../../src/sii/node-fs'
import { cafXml } from '../support/certification-harness'
import { FIXED_NOW, fixtureText, ISSUER_RUT, RECEIVER_RUT } from '../support/fixtures'
import { failure } from '../support/portal'
import { createTempDirs } from '../support/temp-dir'

const temp = createTempDirs()
afterAll(() => temp.cleanup())

const now = () => FIXED_NOW

/** Writes a file under `dir`, creating its folders, with a modification time `minutes` after a fixed instant. */
const put = async (dir: string, name: string, content: string, minutes = 0): Promise<string> => {
  const file = join(dir, ...name.split('/'))
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, content, 'utf8')
  const at = new Date(Date.UTC(2026, 10, 1, 12, minutes))
  await utimes(file, at, at)
  return file
}

const otherIssuer = (xml: string): string => xml.replace(`<RE>${ISSUER_RUT}</RE>`, `<RE>${RECEIVER_RUT}</RE>`)

describe('findCafFiles', () => {
  test('lists the CAFs of the type and issuer, newest first, from every folder below the directory', async () => {
    const dir = await temp.make('dte-sdk-caf-')
    const older = await put(dir, 'auto/caf-33-1-100.xml', cafXml(33), 1)
    const newer = await put(
      dir,
      'caf/certification/33/2026-11-02/caf-33-101-200.xml',
      cafXml(33, { from: 101, to: 200 }),
      5,
    )
    await put(dir, 'caf-39.xml', cafXml(39), 9)
    const files = await findCafFiles({ dir, type: 33, issuerRut: ISSUER_RUT, now })
    expect(files.map((file) => file.path)).toEqual([newer, older])
    expect(files[0].caf.range).toEqual({ from: 101, to: 200 })
    expect(files[0].xml).toBe(cafXml(33, { from: 101, to: 200 }))
    expect(files[0].modifiedAt).toEqual(new Date(Date.UTC(2026, 10, 1, 12, 5)))
  })

  test('the issuer comes from the `RE` of each file, never from where it lies, and is compared in SII shape', async () => {
    const dir = await temp.make('dte-sdk-caf-')
    await put(dir, `${ISSUER_RUT}/caf.xml`, otherIssuer(cafXml(33)), 9)
    const own = await put(dir, `${RECEIVER_RUT}/caf.xml`, cafXml(33), 1)
    const files = await findCafFiles({ dir, type: 33, issuerRut: '76.543.210-3', now })
    expect(files.map((file) => file.path)).toEqual([own])
  })

  test('an expired CAF, a file that is not a CAF and a file that is not `.xml` are left out', async () => {
    const dir = await temp.make('dte-sdk-caf-')
    await put(dir, 'old.xml', fixtureText('caf-33-old.xml'), 9)
    await put(dir, 'broken.xml', '<AUTORIZACION><CAF/></AUTORIZACION>', 8)
    await put(dir, 'notes.xml', 'not xml at all', 7)
    await put(dir, 'caf.txt', cafXml(33), 6)
    await put(dir, 'caf.xml.usado', cafXml(33), 5)
    const good = await put(dir, 'good.xml', cafXml(33), 1)
    const files = await findCafFiles({ dir, type: 33, issuerRut: ISSUER_RUT, now })
    expect(files.map((file) => file.path)).toEqual([good])
  })

  test('an expired CAF counts as expired one day before it lapses, by the given clock', async () => {
    const dir = await temp.make('dte-sdk-caf-')
    await put(dir, 'caf.xml', cafXml(33))
    // Authorized 2026-10-31: April has no 31st, so it expires on 2027-04-30 at 04:00 UTC, and it is left out once less
    // than a day is left.
    const at = (iso: string) => () => new Date(iso)
    await expect(
      findCafFiles({ dir, type: 33, issuerRut: ISSUER_RUT, now: at('2027-04-29T04:00:00Z') }),
    ).resolves.toHaveLength(1)
    await expect(
      findCafFiles({ dir, type: 33, issuerRut: ISSUER_RUT, now: at('2027-04-29T04:01:00Z') }),
    ).resolves.toHaveLength(0)
  })

  test('without a clock it uses the system time, and a type that never expires is kept', async () => {
    const dir = await temp.make('dte-sdk-caf-')
    await put(dir, 'caf-39.xml', cafXml(39))
    await put(dir, 'caf-33-old.xml', fixtureText('caf-33-old.xml'))
    await expect(findCafFiles({ dir, type: 39, issuerRut: ISSUER_RUT })).resolves.toHaveLength(1)
    await expect(findCafFiles({ dir, type: 33, issuerRut: ISSUER_RUT })).resolves.toHaveLength(0)
  })

  test('two files with the same time come in path order', async () => {
    const dir = await temp.make('dte-sdk-caf-')
    const b = await put(dir, 'b.xml', cafXml(33), 3)
    const a = await put(dir, 'a.xml', cafXml(33, { from: 101, to: 200 }), 3)
    const files = await findCafFiles({ dir, type: 33, issuerRut: ISSUER_RUT, now })
    expect(files.map((file) => file.path)).toEqual([a, b])
  })

  test('it looks five folders deep and no deeper', async () => {
    const dir = await temp.make('dte-sdk-caf-')
    const deep = await put(dir, '1/2/3/4/5/deep.xml', cafXml(33), 1)
    await put(dir, '1/2/3/4/5/6/too-deep.xml', cafXml(33), 2)
    const files = await findCafFiles({ dir, type: 33, issuerRut: ISSUER_RUT, now })
    expect(files.map((file) => file.path)).toEqual([deep])
  })

  test('a directory that does not exist gives nothing', async () => {
    const dir = join(await temp.make('dte-sdk-caf-'), 'missing')
    await expect(findCafFiles({ dir, type: 33, issuerRut: ISSUER_RUT, now })).resolves.toEqual([])
  })

  test('a folder or a file that cannot be read is skipped, as field behaviour does', async () => {
    const dir = await temp.make('dte-sdk-caf-')
    const good = await put(dir, 'good/caf.xml', cafXml(33), 1)
    await put(dir, 'locked/caf.xml', cafXml(33), 2)
    await put(dir, 'unreadable.xml', cafXml(33), 3)
    const real = await loadNodeFs()
    const load = async (): Promise<NodeFsModules> => ({
      path: real.path,
      fs: {
        ...real.fs,
        readdir: (async (target: string, options: unknown) => {
          if (target.endsWith('locked')) throw Object.assign(new Error('denied'), { code: 'EACCES' })
          return real.fs.readdir(target, options as { withFileTypes: true })
        }) as typeof real.fs.readdir,
        readFile: (async (target: string, encoding: unknown) => {
          if (target.endsWith('unreadable.xml')) throw Object.assign(new Error('denied'), { code: 'EACCES' })
          return real.fs.readFile(target, encoding as 'utf8')
        }) as typeof real.fs.readFile,
      },
    })
    const files = await findCafFiles({ dir, type: 33, issuerRut: ISSUER_RUT, now }, load)
    expect(files.map((file) => file.path)).toEqual([good])
  })

  test('the options are checked before anything is read', async () => {
    const load = jest.fn(loadNodeFs)
    const base = { dir: 'x', type: 33, issuerRut: ISSUER_RUT } as const
    expect((await failure(findCafFiles({ ...base, dir: '' }, load))).details).toEqual({ field: 'dir' })
    expect((await failure(findCafFiles({ ...base, type: 99 as 33 }, load))).code).toBe('INVALID_DOCUMENT_TYPE')
    const rut = await failure(findCafFiles({ ...base, issuerRut: '12345678-9' }, load))
    expect(rut.code).toBe('INVALID_RUT')
    expect(rut.details).toEqual({ field: 'issuerRut' })
    expect(load).not.toHaveBeenCalled()
  })

  test('without node:fs it says so', async () => {
    const error = await failure(
      findCafFiles({ dir: 'x', type: 33, issuerRut: ISSUER_RUT }, async () => {
        throw new Error('no fs')
      }),
    )
    expect(error.code).toBe('TRANSPORT_UNAVAILABLE')
    expect(error.details).toEqual({ reason: 'no fs' })
  })
})

describe('findLatestCafFile', () => {
  test('gives the newest usable CAF, or null when there is none', async () => {
    const dir = await temp.make('dte-sdk-caf-')
    await expect(findLatestCafFile({ dir, type: 33, issuerRut: ISSUER_RUT, now })).resolves.toBeNull()
    await put(dir, 'a.xml', cafXml(33), 1)
    const newer = await put(dir, 'b.xml', cafXml(33, { from: 101, to: 200 }), 2)
    await expect(findLatestCafFile({ dir, type: 33, issuerRut: ISSUER_RUT, now })).resolves.toMatchObject({
      path: newer,
    })
  })
})

describe('resolveCafFile', () => {
  const scopeOf = (xml: string, range: { readonly from: number; readonly to: number }): FolioScope => ({
    companyRut: ISSUER_RUT,
    type: 33,
    range,
    environment: 'certification',
    cafFingerprint: cafFingerprint(xml),
  })

  test('without a registry every folio of the range counts as free, so the newest CAF wide enough wins', async () => {
    const dir = await temp.make('dte-sdk-caf-')
    const wide = await put(dir, 'wide.xml', cafXml(33, { from: 1, to: 10 }), 1)
    const narrow = await put(dir, 'narrow.xml', cafXml(33, { from: 11, to: 12 }), 2)
    const base = { dir, type: 33, issuerRut: ISSUER_RUT, now } as const
    await expect(resolveCafFile(base)).resolves.toMatchObject({ path: narrow, remaining: 2, scope: null })
    await expect(resolveCafFile({ ...base, required: 2 })).resolves.toMatchObject({ path: narrow, remaining: 2 })
    await expect(resolveCafFile({ ...base, required: 3 })).resolves.toMatchObject({ path: wide, remaining: 10 })
    await expect(resolveCafFile({ ...base, required: 11 })).resolves.toBeNull()
  })

  test('with a registry the free folios are the ones it has not used, in that environment and file', async () => {
    const dir = await temp.make('dte-sdk-caf-')
    const olderXml = cafXml(33, { from: 1, to: 10 })
    const newerXml = cafXml(33, { from: 11, to: 13 })
    const older = await put(dir, 'older.xml', olderXml, 1)
    const newer = await put(dir, 'newer.xml', newerXml, 2)
    const registry = createMemoryFolioRegistry(now)
    await registry.reserve(scopeOf(newerXml, { from: 11, to: 13 }))
    await registry.reserve(scopeOf(newerXml, { from: 11, to: 13 }))
    const base = { dir, type: 33, issuerRut: ISSUER_RUT, now, registry, environment: 'certification' } as const
    await expect(resolveCafFile(base)).resolves.toEqual(
      expect.objectContaining({ path: newer, remaining: 1, scope: scopeOf(newerXml, { from: 11, to: 13 }) }),
    )
    // Without a registry the environment still gives the scope to reserve with.
    await expect(
      resolveCafFile({ dir, type: 33, issuerRut: ISSUER_RUT, now, environment: 'certification' }),
    ).resolves.toMatchObject({ path: newer, remaining: 3, scope: scopeOf(newerXml, { from: 11, to: 13 }) })
    await expect(resolveCafFile({ ...base, required: 2 })).resolves.toMatchObject({ path: older, remaining: 10 })
    // The same files in production have nothing used yet.
    await expect(resolveCafFile({ ...base, required: 2, environment: 'production' })).resolves.toMatchObject({
      path: newer,
      remaining: 3,
    })
  })

  test('the options are checked', async () => {
    const registry = createMemoryFolioRegistry(now)
    const base = { dir: 'x', type: 33, issuerRut: ISSUER_RUT } as const
    for (const required of [0, 1.5, -1])
      expect((await failure(resolveCafFile({ ...base, required }))).details).toEqual({ field: 'required' })
    const missing = await failure(
      resolveCafFile({ ...base, registry } as unknown as Parameters<typeof resolveCafFile>[0]),
    )
    expect(missing.code).toBe('INVALID_OPTION')
    expect(missing.details).toEqual({ field: 'environment' })
  })
})
