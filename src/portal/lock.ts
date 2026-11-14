/**
 * EN: Who may use a portal session now: `run` starts only when the lock is held and the lock is released when it
 * settles, even if it fails. The SII rations sessions per RUT and its balancer cookies break when two requests of one
 * session overlap, so several replicas need a shared implementation.
 * ES: Quién puede usar ahora una sesión del portal: `run` parte solo con el candado tomado y este se libera al
 * terminar, aunque falle. El SII raciona las sesiones por RUT y sus cookies de balanceador se rompen cuando dos
 * peticiones de una misma sesión se cruzan, así que varias réplicas necesitan una implementación compartida.
 */
export type PortalLock = <T>(key: string, run: () => Promise<T>) => Promise<T>

/**
 * EN: Mutex per key, for the callers that share this lock: each call makes a lock of its own, so two portal clients
 * exclude each other only when both were given the same one.
 * ES: Exclusión mutua por clave, para quienes comparten este candado: cada llamada crea un candado propio, así que dos
 * clientes del portal se excluyen entre sí solo si a ambos se les pasó el mismo.
 */
export const createMemoryPortalLock = (): PortalLock => {
  const queues = new Map<string, Promise<void>>()
  return async <T>(key: string, run: () => Promise<T>): Promise<T> => {
    const turn = (queues.get(key) ?? Promise.resolve()).then(run)
    const settled = turn.then(
      () => undefined,
      () => undefined,
    )
    queues.set(key, settled)
    try {
      return await turn
    } finally {
      if (queues.get(key) === settled) queues.delete(key)
    }
  }
}
