import { errorMessage } from '../errors'
import { uploadRecordName, type UploadArchive } from './archive'
import { memoize } from './lazy'
import { silentLogger, type Logger } from './logger'
import { loadNodeFs, type NodeFsModules } from './node-fs'

/**
 * EN: Options of `createDirectoryUploadArchive`.
 * ES: Opciones de `createDirectoryUploadArchive`.
 */
export type DirectoryUploadArchiveOptions = {
  /** EN: Root directory; `<environment>/<yyyy-mm>/` is created under it. ES: Directorio raíz; debajo se crea `<ambiente>/<aaaa-mm>/`. */
  readonly dir: string
  /** EN: Where failures are reported (default silent). ES: Dónde se reportan las fallas (por defecto silencioso). */
  readonly logger?: Logger
}

/**
 * EN: Writes the bytes sent as `<name>.xml` and the record without them as `<name>.json` under
 * `<dir>/<environment>/<yyyy-mm>/` (`name` from `uploadRecordName`). Never throws. `loadModules` is for tests.
 * ES: Escribe los bytes enviados como `<nombre>.xml` y el registro sin ellos como `<nombre>.json` bajo
 * `<dir>/<ambiente>/<aaaa-mm>/` (`nombre` según `uploadRecordName`). Nunca lanza. `loadModules` es para tests.
 */
export const createDirectoryUploadArchive = (
  options: DirectoryUploadArchiveOptions,
  loadModules: () => Promise<NodeFsModules> = loadNodeFs,
): UploadArchive => {
  const modules = memoize(loadModules)
  const logger = options.logger ?? silentLogger
  return async (record) => {
    try {
      const { fs, path } = await modules()
      const folder = path.join(options.dir, record.environment, record.sentAt.slice(0, 7))
      const name = uploadRecordName(record)
      await fs.mkdir(folder, { recursive: true })
      await fs.writeFile(path.join(folder, `${name}.xml`), record.xml)
      const { xml: _xml, ...metadata } = record
      await fs.writeFile(path.join(folder, `${name}.json`), JSON.stringify(metadata, null, 2))
    } catch (error) {
      logger.warn('upload archive failed', { trackId: record.trackId, reason: errorMessage(error) })
    }
  }
}
