/**
 * EN: One test set or book of the certification, and its state.
 * ES: Un set de pruebas o libro de la certificación, y su estado.
 */
export type CertificationSet = {
  /** EN: Name as the portal shows it. ES: Nombre tal como lo muestra el portal (`SET BASICO`, `LIBRO DE VENTAS`…). */
  readonly name: string
  /** EN: State in upper case, or the hidden code (`S01` not declared, `S21` declared). ES: Estado en mayúsculas (`REVISADO CONFORME`, `EN REVISION`…) o el código oculto (`S01` sin declarar, `S21` declarado). */
  readonly status: string
}

/**
 * EN: The rows of `pe_avance2`, one by one: a match across the whole page once gave one row's state to the next.
 * ES: Las filas de `pe_avance2`, una por una: una búsqueda sobre toda la página ya le asignó el estado de una fila a la siguiente.
 */
export const parseCertificationSets = (html: string): readonly CertificationSet[] =>
  html.split(/<\/tr>/i).flatMap((row) => {
    const name = /(SET[^<\n\r]*|LIBRO[^<\n\r]*)<\/font><\/td>/i.exec(row)?.[1].trim()
    if (name === undefined) return []
    const status = /<b>([^<]+)<\/b>/i.exec(row)?.[1].trim().toUpperCase()
    return [{ name, status: status ?? /name="EST\d+"[^>]*value="([^"]+)"/i.exec(row)?.[1] ?? 'S01' }]
  })
