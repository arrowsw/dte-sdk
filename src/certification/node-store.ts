import { DteError, errorMessage } from '../errors'
import { memoize } from '../sii/lazy'
import { loadNodeFs, type NodeFsModules } from '../sii/node-fs'
import { assertArtefactName, type CertificationState, type CertificationStore } from './state'

/**
 * EN: Options of `createDirectoryCertificationStore`.
 * ES: Opciones de `createDirectoryCertificationStore`.
 */
export type DirectoryCertificationStoreOptions = {
  /** EN: The directory of `state.json` and the artefacts; created on first use. It holds CAF private keys: keep it out of version control. ES: El directorio de `state.json` y los artefactos; se crea en el primer uso. Contiene llaves privadas de CAF: fuera del control de versiones. */
  readonly dir: string
}

const STATE_FILE = 'state.json'
// The directory holds CAF private keys: directories are created private to the user and files unreadable by others.
// An existing directory keeps its mode.
const DIRECTORY_MODE = 0o700
const FILE_MODE = 0o600
const isMissingFile = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === 'ENOENT'

/**
 * EN: A store in a directory: `state.json` written atomically (temp file and rename), the artefacts as files, a `/`
 * in a name as a sub-directory. Directories it creates are private to the user (0700) and files unreadable by others
 * (0600), because the state holds CAF private keys; a directory that already exists keeps its mode. For a single
 * process.
 * ES: Un almacén en un directorio: `state.json` escrito de forma atómica (archivo temporal y renombre), los artefactos
 * como archivos, una `/` en un nombre como subdirectorio. Los directorios que crea son privados del usuario (0700) y
 * los archivos ilegibles para otros (0600), porque el estado contiene llaves privadas de CAF; un directorio que ya
 * existe conserva su modo. Para un solo proceso.
 * @param options EN: the directory. ES: el directorio.
 * @throws {DteError} EN: `TRANSPORT_UNAVAILABLE` when `node:fs` cannot be loaded, `INVALID_OPTION { field: 'name' }` for an unsafe artefact name. ES: `TRANSPORT_UNAVAILABLE` si `node:fs` no se puede cargar, `INVALID_OPTION { field: 'name' }` por un nombre de artefacto inseguro.
 */
export const createDirectoryCertificationStore = (
  options: DirectoryCertificationStoreOptions,
  load: () => Promise<NodeFsModules> = loadNodeFs,
): CertificationStore => {
  const modules = memoize(async () =>
    load().catch((error: unknown) => {
      throw new DteError('TRANSPORT_UNAVAILABLE', { reason: errorMessage(error) })
    }),
  )
  const fileOf = async (name: string): Promise<NodeFsModules & { readonly file: string }> => {
    const loaded = await modules()
    return { ...loaded, file: loaded.path.join(options.dir, ...name.split('/')) }
  }
  const write = async (name: string, content: string): Promise<void> => {
    const { fs, path, file } = await fileOf(name)
    await fs.mkdir(path.dirname(file), { recursive: true, mode: DIRECTORY_MODE })
    await fs.writeFile(`${file}.tmp`, content, { encoding: 'utf8', mode: FILE_MODE })
    await fs.rename(`${file}.tmp`, file)
  }
  const read = async (name: string): Promise<string | null> => {
    const { fs, file } = await fileOf(name)
    try {
      return await fs.readFile(file, 'utf8')
    } catch (error) {
      if (isMissingFile(error)) return null
      throw error
    }
  }
  const walk = async (dir: string, prefix: string): Promise<readonly string[]> => {
    const { fs, path } = await modules()
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch((error: unknown) => {
      if (isMissingFile(error)) return []
      throw error
    })
    const names: string[] = []
    for (const entry of entries) {
      const name = `${prefix}${entry.name}`
      if (entry.isDirectory()) names.push(...(await walk(path.join(dir, entry.name), `${name}/`)))
      else if (name !== STATE_FILE && !name.endsWith('.tmp')) names.push(name)
    }
    return names
  }
  return {
    load: async () => {
      const text = await read(STATE_FILE)
      return text === null ? null : (JSON.parse(text) as CertificationState)
    },
    save: (state) => write(STATE_FILE, JSON.stringify(state, null, 2)),
    writeArtefact: async (name, content) => {
      assertArtefactName(name)
      await write(name, content)
    },
    readArtefact: async (name) => {
      assertArtefactName(name)
      return read(name)
    },
    listArtefacts: async () => [...(await walk(options.dir, ''))].sort(),
  }
}
