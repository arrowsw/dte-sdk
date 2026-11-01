/**
 * EN: The Node modules the directory adapters load lazily.
 * ES: Los módulos de Node que los adaptadores de directorio cargan de forma perezosa.
 */
export type NodeFsModules = {
  /** EN: The `node:fs/promises` module. ES: Módulo `node:fs/promises`. */
  readonly fs: typeof import('node:fs/promises')
  /** EN: The `node:path` module. ES: Módulo `node:path`. */
  readonly path: typeof import('node:path')
}

/**
 * EN: Loads `node:fs/promises` and `node:path` on first use.
 * ES: Carga `node:fs/promises` y `node:path` en el primer uso.
 */
export const loadNodeFs = async (): Promise<NodeFsModules> => {
  const [fs, path] = await Promise.all([import('node:fs/promises'), import('node:path')])
  return { fs, path }
}
