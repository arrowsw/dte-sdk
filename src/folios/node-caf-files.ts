import { parseCaf, type Caf } from '../caf/parse'
import { availableFolios, isCafExpired } from '../caf/validity'
import type { Environment } from '../catalogs/codes'
import { isDocumentType, type DocumentType } from '../catalogs/document-types'
import { DteError, errorMessage } from '../errors'
import { toSiiRut, type SiiRut } from '../model/rut'
import { loadNodeFs, type NodeFsModules } from '../sii/node-fs'
import type { FolioScope } from './ledger'
import { cafFingerprint, type FolioRegistry } from './registry'

/**
 * EN: Options of `findCafFiles` and `findLatestCafFile`.
 * ES: Opciones de `findCafFiles` y `findLatestCafFile`.
 */
export type FindCafFilesOptions = {
  /** EN: Directory searched, with its folders down to five levels below it. ES: Directorio donde se busca, con sus carpetas hasta cinco niveles más abajo. */
  readonly dir: string
  /** EN: Document type of the CAF. ES: `TD` — Tipo de documento del CAF. */
  readonly type: DocumentType
  /** EN: Company RUT the CAF must be issued to, in any shape. ES: `RE` — RUT de la empresa a la que debe estar emitido el CAF, en cualquier forma. */
  readonly issuerRut: string
  /** EN: Clock for the expiry check. ES: Reloj para revisar el vencimiento. */
  readonly now?: () => Date
}

/**
 * EN: A CAF file found on disk.
 * ES: Un archivo CAF encontrado en disco.
 */
export type CafFile = {
  /** EN: Path of the file, joined from `dir`. ES: Ruta del archivo, armada desde `dir`. */
  readonly path: string
  /** EN: The file content, as `cafFingerprint` and `parseCaf` take it. ES: El contenido del archivo, como lo toman `cafFingerprint` y `parseCaf`. */
  readonly xml: string
  /** EN: The parsed CAF. ES: El CAF parseado. */
  readonly caf: Caf
  /** EN: Last modification of the file. ES: Última modificación del archivo. */
  readonly modifiedAt: Date
}

/**
 * EN: Options of `resolveCafFile`. With a registry, the environment of its scopes is required.
 * ES: Opciones de `resolveCafFile`. Con un registro, el ambiente de sus alcances es obligatorio.
 */
export type ResolveCafFileOptions = FindCafFilesOptions & {
  /** EN: Free folios the CAF must have; default 1. ES: Folios libres que debe tener el CAF; por defecto 1. */
  readonly required?: number
} & (
    | {
        /** EN: No registry: every folio of the range counts as free. ES: Sin registro: todos los folios del rango cuentan como libres. */
        readonly registry?: undefined
        /** EN: Environment of the `scope` returned; without it `scope` is null. ES: Ambiente del `scope` devuelto; sin él `scope` es null. */
        readonly environment?: Environment
      }
    | {
        /** EN: Registry that says how many folios of each CAF are still unused. ES: Registro que dice cuántos folios de cada CAF siguen sin usar. */
        readonly registry: FolioRegistry
        /** EN: Environment of the registry scopes. ES: Ambiente de los alcances del registro. */
        readonly environment: Environment
      }
  )

/**
 * EN: The CAF file `resolveCafFile` chose and its free folios.
 * ES: El archivo CAF que eligió `resolveCafFile` y sus folios libres.
 */
export type ResolvedCafFile = CafFile & {
  /** EN: Folios of the range still unused. ES: Folios del rango aún sin usar. */
  readonly remaining: number
  /** EN: The registry scope of the file, to reserve its folios with; null when no `environment` was given. ES: El alcance del archivo en el registro, para reservar sus folios; null si no se indicó `environment`. */
  readonly scope: FolioScope | null
}

// Field behaviour walks the directory and five levels of folders below it.
const MAX_DEPTH = 5

type Search = { readonly dir: string; readonly type: DocumentType; readonly rut: SiiRut; readonly now: Date }

const checkSearch = (options: FindCafFilesOptions): Search => {
  if (typeof options.dir !== 'string' || options.dir === '') throw new DteError('INVALID_OPTION', { field: 'dir' })
  if (!isDocumentType(options.type)) throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'type' })
  const rut = toSiiRut(options.issuerRut, 'issuerRut')
  return { dir: options.dir, type: options.type, rut, now: (options.now ?? (() => new Date()))() }
}

const loadModules = async (load: () => Promise<NodeFsModules>): Promise<NodeFsModules> =>
  load().catch((error: unknown) => {
    throw new DteError('TRANSPORT_UNAVAILABLE', { reason: errorMessage(error) })
  })

// Every `.xml` file below `dir`. A folder that cannot be read is skipped, as field behaviour does.
const xmlFiles = async ({ fs, path }: NodeFsModules, dir: string, depth: number): Promise<readonly string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (depth < MAX_DEPTH) files.push(...(await xmlFiles({ fs, path }, full, depth + 1)))
    } else if (entry.isFile() && entry.name.endsWith('.xml')) files.push(full)
  }
  return files
}

// The file as a usable CAF of the search, or null: unreadable, not a CAF, another type or issuer, or expired.
const usableCaf = async ({ fs }: NodeFsModules, file: string, search: Search): Promise<CafFile | null> => {
  try {
    const xml = await fs.readFile(file, 'utf8')
    const caf = parseCaf(xml)
    if (caf.documentType !== search.type || caf.issuerRut !== search.rut) return null
    if (isCafExpired(caf, { now: search.now })) return null
    return { path: file, xml, caf, modifiedAt: (await fs.stat(file)).mtime }
  } catch {
    return null
  }
}

const searchCafs = async (search: Search, load: () => Promise<NodeFsModules>): Promise<readonly CafFile[]> => {
  const modules = await loadModules(load)
  const found: CafFile[] = []
  for (const file of await xmlFiles(modules, search.dir, 0)) {
    const caf = await usableCaf(modules, file, search)
    if (caf !== null) found.push(caf)
  }
  return found.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime() || a.path.localeCompare(b.path))
}

/**
 * EN: Every usable CAF file of a type and company below a directory, newest first (by modification time, then path).
 * Usable means it parses as a CAF, its `TD` is the type, its `RE` is the company (read from the file, never from where it
 * lies: a shared folder may hold CAFs of other companies, and a stamp signed with one makes the SII reject the whole
 * envelope) and it has not expired, with the one-day margin of `isCafExpired`. Only `.xml` files count; a folder or file
 * that cannot be read is skipped, and a directory that does not exist gives an empty list.
 * ES: Todos los archivos CAF utilizables de un tipo y empresa bajo un directorio, del más nuevo al más viejo (por fecha de
 * modificación, luego ruta). Utilizable quiere decir que se parsea como CAF, su `TD` es el tipo, su `RE` es la empresa
 * (leído del archivo, nunca de dónde está: una carpeta compartida puede tener CAF de otras empresas, y un timbre firmado
 * con uno hace que el SII rechace el sobre entero) y no ha vencido, con el margen de un día de `isCafExpired`. Solo
 * cuentan los archivos `.xml`; una carpeta o archivo que no se pueda leer se salta, y un directorio que no existe da una
 * lista vacía.
 * @param options EN: directory, type, company and clock. ES: directorio, tipo, empresa y reloj.
 * @throws {DteError} EN: `INVALID_OPTION` (`dir`), `INVALID_DOCUMENT_TYPE`, `INVALID_RUT`, and `TRANSPORT_UNAVAILABLE` when `node:fs` cannot be loaded. ES: `INVALID_OPTION` (`dir`), `INVALID_DOCUMENT_TYPE`, `INVALID_RUT`, y `TRANSPORT_UNAVAILABLE` si `node:fs` no se puede cargar.
 */
export const findCafFiles = async (
  options: FindCafFilesOptions,
  load: () => Promise<NodeFsModules> = loadNodeFs,
): Promise<readonly CafFile[]> => searchCafs(checkSearch(options), load)

/**
 * EN: The newest usable CAF file of a type and company below a directory (see `findCafFiles`), or null.
 * ES: El archivo CAF utilizable más nuevo de un tipo y empresa bajo un directorio (ver `findCafFiles`), o null.
 * @param options EN: directory, type, company and clock. ES: directorio, tipo, empresa y reloj.
 * @throws {DteError} EN: as `findCafFiles`. ES: como `findCafFiles`.
 */
export const findLatestCafFile = async (
  options: FindCafFilesOptions,
  load: () => Promise<NodeFsModules> = loadNodeFs,
): Promise<CafFile | null> => (await findCafFiles(options, load))[0] ?? null

/**
 * EN: The newest usable CAF file (see `findCafFiles`) that still has `required` free folios, or null when none has. With
 * a registry the free folios are `registry.remaining` for the scope of the file (company, type, range, `environment` and
 * `cafFingerprint` of its content), which comes back as `scope`; without one, the whole range. It only reads: reserving the folio is the registry's
 * job, and asking the SII for a new CAF when this gives null is the caller's.
 * ES: El archivo CAF utilizable más nuevo (ver `findCafFiles`) que todavía tiene `required` folios libres, o null si
 * ninguno los tiene. Con un registro los folios libres son `registry.remaining` para el alcance del archivo (empresa, tipo,
 * rango, `environment` y `cafFingerprint` de su contenido), que vuelve como `scope`; sin registro, todo el rango. Solo lee: reservar el folio le
 * toca al registro, y pedir un CAF nuevo al SII cuando esto da null le toca a quien llama.
 * @param options EN: the search, the folios required and the registry. ES: la búsqueda, los folios requeridos y el registro.
 * @throws {DteError} EN: as `findCafFiles`, and `INVALID_OPTION` (`required`, or `environment` missing with a registry). ES: como `findCafFiles`, e `INVALID_OPTION` (`required`, o `environment` ausente con un registro).
 */
export const resolveCafFile = async (
  options: ResolveCafFileOptions,
  load: () => Promise<NodeFsModules> = loadNodeFs,
): Promise<ResolvedCafFile | null> => {
  const required = options.required ?? 1
  if (!Number.isInteger(required) || required < 1) throw new DteError('INVALID_OPTION', { field: 'required' })
  const { registry, environment } = options
  if (registry !== undefined && environment === undefined)
    throw new DteError('INVALID_OPTION', { field: 'environment' })
  for (const file of await findCafFiles(options, load)) {
    const scope: FolioScope | null =
      environment === undefined
        ? null
        : {
            companyRut: file.caf.issuerRut,
            type: file.caf.documentType,
            range: file.caf.range,
            environment,
            cafFingerprint: cafFingerprint(file.xml),
          }
    const remaining = registry === undefined ? availableFolios(file.caf) : await registry.remaining(scope as FolioScope)
    if (remaining >= required) return { ...file, remaining, scope }
  }
  return null
}
