/**
 * EN: Memoizes an async factory: the first call starts it, every call returns the same promise. Used by the Node
 * adapters to load `node:` modules once, on first use, never at import time.
 * ES: Memoriza una fábrica asíncrona: la primera llamada la inicia, todas devuelven la misma promesa. Lo usan los
 * adaptadores Node para cargar módulos `node:` una vez, en el primer uso, nunca al importar.
 */
export const memoize = <T>(factory: () => Promise<T>): (() => Promise<T>) => {
  const box: { promise: Promise<T> | null } = { promise: null }
  return () => {
    if (box.promise === null) box.promise = factory()
    return box.promise
  }
}
