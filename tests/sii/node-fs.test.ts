// The Node modules must be evaluated the first time an adapter is used, never when the SDK is imported (D12): the
// root entry has to stay importable on runtimes without `node:fs`.
describe('lazy Node modules', () => {
  afterEach(() => {
    jest.dontMock('node:fs/promises')
    jest.dontMock('node:path')
    jest.resetModules()
  })

  test('importing the directory adapters evaluates neither node:fs/promises nor node:path', async () => {
    const evaluated: string[] = []
    jest.doMock('node:fs/promises', () => {
      evaluated.push('node:fs/promises')
      return jest.requireActual('node:fs/promises')
    })
    jest.doMock('node:path', () => {
      evaluated.push('node:path')
      return jest.requireActual('node:path')
    })
    await jest.isolateModulesAsync(async () => {
      await import('../../src/sii/node-capture')
      await import('../../src/sii/node-archive')
      const { loadNodeFs } = await import('../../src/sii/node-fs')
      expect(evaluated).toEqual([])
      const { fs, path } = await loadNodeFs()
      expect(evaluated.sort()).toEqual(['node:fs/promises', 'node:path'])
      expect(typeof fs.writeFile).toBe('function')
      expect(path.join('a', 'b')).toBe(`a${path.sep}b`)
    })
  })
})
