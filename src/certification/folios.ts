import type { Caf } from '../caf/parse'
import type { DocumentType } from '../catalogs/document-types'
import { DteError } from '../errors'

/**
 * EN: Where the next folio of a type comes from, with the CAF that stamps it. The in-memory allocator below is one
 * implementation; the runner may implement it with the folio registry.
 * ES: De dónde sale el siguiente folio de un tipo, con el CAF que lo timbra. El asignador en memoria de abajo es una
 * implementación; el runner puede implementarlo con el registro de folios.
 */
export type FolioSource = {
  /** EN: The next free folio of the type and its CAF. ES: El siguiente folio libre del tipo y su CAF. */
  readonly take: (type: DocumentType) => Promise<{ readonly caf: Caf; readonly folio: number }>
}

/**
 * EN: Options of `createFolioAllocator`.
 * ES: Opciones de `createFolioAllocator`.
 */
export type FolioAllocatorOptions = {
  /** EN: Folios already used; the allocator starts after the highest used one of each CAF. ES: Folios ya usados; el asignador parte después del mayor usado de cada CAF. */
  readonly usedFolios?: readonly { readonly type: number; readonly folio: number }[]
}

/**
 * EN: A folio source over one or several CAFs: one counter per CAF, the first CAF of the type with a folio left wins,
 * a folio is never given twice, and the CAF returned is the one whose range holds the folio, so it stamps with its own
 * key. When every CAF of the type is exhausted it throws `FOLIO_OUT_OF_RANGE`.
 * ES: Una fuente de folios sobre uno o varios CAF: un contador por CAF, gana el primer CAF del tipo con folio libre, un
 * folio nunca se entrega dos veces, y el CAF devuelto es el que contiene el folio en su rango, así timbra con su propia
 * llave. Cuando todos los CAF del tipo se agotan lanza `FOLIO_OUT_OF_RANGE`.
 * @param cafs EN: the CAFs, in the order to use them. ES: los CAF, en el orden en que se usan.
 * @param options EN: folios already used. ES: folios ya usados.
 * @throws {DteError} EN: `FOLIO_OUT_OF_RANGE` with `{ type }` from `take`. ES: `FOLIO_OUT_OF_RANGE` con `{ type }` desde `take`.
 */
export const createFolioAllocator = (cafs: readonly Caf[], options: FolioAllocatorOptions = {}): FolioSource => {
  const next = cafs.map((caf) => {
    const used = (options.usedFolios ?? [])
      .filter(
        (entry) => entry.type === caf.documentType && entry.folio >= caf.range.from && entry.folio <= caf.range.to,
      )
      .map((entry) => entry.folio)
    return used.length === 0 ? caf.range.from : Math.max(...used) + 1
  })
  return {
    take: async (type) => {
      for (const [index, caf] of cafs.entries()) {
        if (caf.documentType !== type || next[index] > caf.range.to) continue
        const folio = next[index]
        next[index] = folio + 1
        return { caf, folio }
      }
      throw new DteError('FOLIO_OUT_OF_RANGE', { type })
    },
  }
}
