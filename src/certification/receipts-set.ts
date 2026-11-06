/**
 * EN: One item of a case of the receipts test set.
 * ES: Un ítem de un caso del set de pruebas de boletas.
 */
export type ReceiptsTestItem = {
  /** EN: Item name. ES: `NmbItem` — Nombre del ítem. */
  readonly name: string
  /** EN: Quantity. ES: `QtyItem` — Cantidad. */
  readonly quantity: number
  /** EN: Unit price, VAT included. ES: `PrcItem` — Precio unitario, con IVA. */
  readonly unitPrice: number
  /** EN: The name says the item is exempt. ES: `IndExe` — El nombre dice que el ítem es exento. */
  readonly exempt: boolean
}

/**
 * EN: One case of the receipts test set: one receipt to issue.
 * ES: Un caso del set de pruebas de boletas: una boleta por emitir.
 */
export type ReceiptsTestCase = {
  /** EN: The case number, as in `CASO-1`. ES: El número del caso, como en `CASO-1`. */
  readonly number: number
  /** EN: The items, in order. ES: Los ítems, en orden. */
  readonly items: readonly ReceiptsTestItem[]
  /** EN: The observations of the case, each up to its first quote. ES: Las observaciones del caso, cada una hasta su primera comilla. */
  readonly observations: readonly string[]
}

const CASE = /^CASO-?(\d+)/i
const OBSERVATION_LABEL = 'OBSERVACION'
// The text of an observation runs up to its first quote: the quotes are optional and one inside the text ends it.
const OBSERVATION = /OBSERVACION[ES]*:\s*"?([^"]+)"?/i
const COLUMNS = /\t+|\s{2,}/
const RULE = '='

// The labels are matched in exact case: a set in capitals has no header and so no items.
const isItemHeader = (line: string): boolean =>
  line.includes('Item') && line.includes('Cantidad') && line.includes('Precio')

// An item line: the name, the quantity (a decimal comma is accepted) and the price (every thousands dot and the first
// comma are dropped), separated by tabs or by runs of two or more spaces. A part left empty by the split is dropped,
// so a tab followed by spaces does not shift the columns.
const itemOf = (line: string): ReceiptsTestItem | null => {
  const parts = line.split(COLUMNS).filter((part) => part.trim().length > 0)
  if (parts.length < 3) return null
  const name = parts[0].trim()
  const quantity = Number.parseFloat(parts[1].replace(',', '.'))
  const unitPrice = Number.parseInt(parts[2].replace(/\./g, '').replace(',', ''), 10)
  if (Number.isNaN(quantity) || Number.isNaN(unitPrice)) return null
  return { name, quantity, unitPrice, exempt: name.toLowerCase().includes('exento') }
}

type Reading = { readonly cases: readonly ReceiptsTestCase[]; readonly inItems: boolean }

const withLast = (reading: Reading, change: (last: ReceiptsTestCase) => ReceiptsTestCase): Reading => {
  const last = reading.cases[reading.cases.length - 1]
  return last === undefined ? reading : { ...reading, cases: [...reading.cases.slice(0, -1), change(last)] }
}

const readLine = (reading: Reading, line: string): Reading => {
  const opening = CASE.exec(line)
  if (opening !== null)
    return { cases: [...reading.cases, { number: Number(opening[1]), items: [], observations: [] }], inItems: false }
  if (isItemHeader(line)) return { ...reading, inItems: true }
  if (line.startsWith(OBSERVATION_LABEL)) {
    const observation = OBSERVATION.exec(line)?.[1].trim()
    return observation === undefined
      ? reading
      : withLast(reading, (last) => ({ ...last, observations: [...last.observations, observation] }))
  }
  if (!reading.inItems || line === '' || line.startsWith(RULE)) return reading
  const item = itemOf(line)
  return item === null ? reading : withLast(reading, (last) => ({ ...last, items: [...last.items, item] }))
}

/**
 * EN: Parses the receipts test set the receipts portal delivers, a plain text. A line starting with `CASO-<n>` opens a
 * case; a line naming `Item`, `Cantidad` and `Precio` (in exact case) turns the item mode on for that case; a line
 * starting with `OBSERVACION` gives its text, up to the first quote, to the case; in item mode every other non-empty line
 * that is not a rule of `=` is an item when it splits, by tabs or runs of spaces and without its empty parts, into a name, a quantity and a price. An item whose name says
 * `exento` is exempt. Nothing before the first case is kept, and a text without cases gives an empty list.
 * ES: Parsea el set de pruebas de boletas que entrega el portal de boletas, un texto plano. Una línea que empieza con
 * `CASO-<n>` abre un caso; una línea que nombra `Item`, `Cantidad` y `Precio` (con esas mayúsculas exactas) activa el
 * modo de ítems de ese caso; una línea que empieza con `OBSERVACION` entrega su texto, hasta la primera comilla, al caso; en modo
 * de ítems cualquier otra línea no vacía que no sea una regla de `=` es un ítem cuando se parte, por tabuladores o
 * grupos de espacios y sin sus partes vacías, en nombre, cantidad y precio. Un ítem cuyo nombre dice `exento` es exento. Nada anterior al primer caso se guarda, y un texto sin casos
 * da una lista vacía.
 * @param text EN: the set text. ES: el texto del set.
 * @returns EN: the cases, in order. ES: los casos, en orden.
 */
export const parseReceiptsTestSet = (text: string): readonly ReceiptsTestCase[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .reduce<Reading>(readLine, { cases: [], inItems: false }).cases
