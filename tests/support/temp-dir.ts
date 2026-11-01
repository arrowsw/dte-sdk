import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Temporary directories under `os.tmpdir()` that a test file removes when it ends: call `make()` for each
 * directory and `cleanup()` from `afterAll`. Nothing is ever created outside the OS temp directory.
 */
export const createTempDirs = (): {
  readonly make: (prefix: string) => Promise<string>
  readonly cleanup: () => Promise<void>
} => {
  const created: string[] = []
  return {
    make: async (prefix) => {
      const dir = await mkdtemp(join(tmpdir(), prefix))
      created.push(dir)
      return dir
    },
    cleanup: async () => {
      await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
    },
  }
}
