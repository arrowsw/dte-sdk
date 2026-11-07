// The SII portal serves HTML 4.01: rows without `</tr>`, attributes with or without quotes, entities for accents. These
// helpers read exactly what the page modules need; nothing outside `src/portal/` looks at markup.

const LAST_CODE_POINT = 0x10ffff
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  ntilde: 'ñ',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  Ntilde: 'Ñ',
}

/**
 * EN: Decodes named and numeric entities; one it does not know becomes a space.
 * ES: Decodifica entidades con nombre y numéricas; una desconocida se vuelve un espacio.
 */
export const decodeEntities = (text: string): string =>
  text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (_whole, entity: string) => {
    if (entity.startsWith('#')) {
      const hex = entity[1].toLowerCase() === 'x'
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10)
      return code <= LAST_CODE_POINT ? String.fromCodePoint(code) : ' '
    }
    return NAMED_ENTITIES[entity] ?? ' '
  })

/**
 * EN: Text of a fragment: tags become spaces, entities are decoded, whitespace collapses.
 * ES: Texto de un fragmento: las etiquetas se vuelven espacios, se decodifican las entidades y se colapsa el espacio.
 */
export const stripTags = (html: string): string =>
  decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()

/**
 * EN: Readable text of a page, without scripts or styles, cut at `max` characters (400 by default). Detection runs on
 * this, because the SII writes accents as entities.
 * ES: Texto legible de una página, sin scripts ni estilos, cortado en `max` caracteres (400 por defecto). La detección
 * corre sobre esto, porque el SII escribe los acentos como entidades.
 */
export const visibleText = (html: string, max = 400): string =>
  stripTags(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')).slice(0, max)

/**
 * EN: The whole readable text of a page, title excluded: what the certification pages are classified on, because the
 * title is the same on every one of them and its words would leak into the sentences read.
 * ES: Todo el texto legible de una página, sin el título: sobre esto se clasifican las páginas de certificación, porque
 * el título es el mismo en todas y sus palabras se colarían en las frases leídas.
 */
export const bodyText = (html: string): string =>
  visibleText(html.replace(/<title[\s\S]*?<\/title>/gi, ' '), Number.MAX_SAFE_INTEGER)

/**
 * EN: Value of an attribute inside a tag, with double, single or no quotes. It needs a separator before the name, so
 * `this.value=` inside a handler is not taken for it.
 * ES: Valor de un atributo dentro de una etiqueta, con comillas dobles, simples o sin ellas. Exige un separador antes del
 * nombre, para que `this.value=` dentro de un handler no se confunda con él.
 */
export const attribute = (tag: string, name: string): string | null => {
  const match =
    new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag) ??
    new RegExp(`\\s${name}\\s*=\\s*'([^']*)'`, 'i').exec(tag) ??
    new RegExp(`\\s${name}\\s*=\\s*([^\\s>"']+)`, 'i').exec(tag)
  return match === null ? null : match[1]
}

/**
 * EN: One `<input>` as the flows read it.
 * ES: Un `<input>` tal como lo leen los flujos.
 */
export type InputTag = {
  /** EN: Field name. ES: Nombre del campo. */
  readonly name: string
  /** EN: Value, empty when absent. ES: Valor, vacío si no viene. */
  readonly value: string
  /** EN: `onClick` handler, when there is one. ES: Handler `onClick`, si lo hay. */
  readonly onClick: string | null
}

/**
 * EN: Every named `<input>` of a fragment, in order.
 * ES: Todos los `<input>` con nombre de un fragmento, en orden.
 */
export const inputTags = (html: string): readonly InputTag[] =>
  (html.match(/<input\b[^>]*>/gi) ?? []).flatMap((tag) => {
    const name = attribute(tag, 'name')
    return name === null ? [] : [{ name, value: attribute(tag, 'value') ?? '', onClick: attribute(tag, 'onClick') }]
  })

/**
 * EN: The fields of a fragment as a map; a repeated name keeps the last value, as a form post would.
 * ES: Los campos de un fragmento como mapa; un nombre repetido conserva el último valor, como en un envío de formulario.
 */
export const inputValues = (html: string): Readonly<Record<string, string>> =>
  Object.fromEntries(inputTags(html).map((tag) => [tag.name, tag.value]))

/**
 * EN: The hidden fields of a fragment, as a map: what a page carries forward to its next post.
 * ES: Los campos ocultos de un fragmento, como mapa: lo que una página arrastra a su siguiente envío.
 */
export const hiddenInputs = (html: string): Readonly<Record<string, string>> =>
  Object.fromEntries(
    (html.match(/<input\b[^>]*>/gi) ?? [])
      .filter((tag) => attribute(tag, 'type')?.toLowerCase() === 'hidden')
      .flatMap((tag) => {
        const name = attribute(tag, 'name')
        return name === null ? [] : [[name, attribute(tag, 'value') ?? '']]
      }),
  )

/**
 * EN: Every `<form>…</form>` block of a page, in order.
 * ES: Todos los bloques `<form>…</form>` de una página, en orden.
 */
export const formBlocks = (html: string): readonly string[] => html.match(/<form\b[^>]*>[\s\S]*?<\/form>/gi) ?? []

/**
 * EN: The `action` of a form tag.
 * ES: El `action` de una etiqueta de formulario.
 */
const actionOfTag = (tag: string): string | null => attribute(tag, 'action')

/**
 * EN: The `action` of the first form of a page.
 * ES: El `action` del primer formulario de una página.
 */
export const formAction = (html: string): string | null => {
  const tag = /<form\b[^>]*>/i.exec(html)
  return tag === null ? null : actionOfTag(tag[0])
}

/**
 * EN: The block of the form with this `name`.
 * ES: El bloque del formulario con este `name`.
 */
export const namedForm = (html: string, name: string | RegExp): string | null =>
  formBlocks(html).find((block) => {
    const value = attribute(/<form\b[^>]*>/i.exec(block)![0], 'name')
    return value !== null && (typeof name === 'string' ? value === name : name.test(value))
  }) ?? null

/**
 * EN: The block of the first form whose `action` contains this text.
 * ES: El bloque del primer formulario cuyo `action` contiene este texto.
 */
export const formWithAction = (html: string, action: string): string | null =>
  formBlocks(html).find((block) => actionOfTag(/<form\b[^>]*>/i.exec(block)![0])?.includes(action)) ?? null

/**
 * EN: The options of a `<select>`, or null when the page has no such select. `selected` is the bare attribute: the SII
 * may mark more than one option, and a browser takes the last.
 * ES: Las opciones de un `<select>`, o null si la página no tiene ese select. `selected` es el atributo sin valor: el SII
 * puede marcar más de una opción, y un navegador toma la última.
 */
export const selectOptions = (
  html: string,
  name: string,
): readonly { readonly value: string; readonly label: string; readonly selected: boolean }[] | null => {
  const block = new RegExp(`<select\\b[^>]*name\\s*=\\s*["']?${name}\\b[^>]*>([\\s\\S]*?)</select>`, 'i').exec(html)
  if (block === null) return null
  return [...block[1].matchAll(/<option\b([^>]*)>([^<]*)/gi)].flatMap((match) => {
    const value = attribute(`<option ${match[1]}>`, 'value')
    return value === null ? [] : [{ value, label: stripTags(match[2]), selected: /(?:^|\s)selected\b/i.test(match[1]) }]
  })
}

/**
 * EN: The messages of `alert(...)` calls, which is how the old portal reports errors, whatever its title says. An alert
 * commented out on its own line belongs to the template and is ignored.
 * ES: Los mensajes de las llamadas a `alert(...)`, que es como el portal antiguo informa errores, diga lo que diga su
 * título. Un alert comentado en su propia línea es parte de la plantilla y se ignora.
 */
export const alertMessages = (html: string): readonly string[] =>
  [...html.matchAll(/alert\s*\(\s*(['"])([\s\S]*?)\1\s*\)/g)].flatMap((match) => {
    const lineStart = html.lastIndexOf('\n', match.index) + 1
    if (
      html
        .slice(lineStart, match.index)
        .replace(/[a-z]+:\/\//gi, '')
        .includes('//')
    )
      return []
    const text = stripTags(match[2].replace(/\\(['"\\])/g, '$1').replace(/\\[rnt]/g, ' '))
    return text === '' ? [] : [text]
  })
