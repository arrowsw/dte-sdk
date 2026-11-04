import { errorMessage } from '../errors'
import { portalRequest, type PortalContext } from './session'

/**
 * EN: One parameter of a GWT-RPC call, as the SII's portals serialize it: a string (interned in the table, `0` when
 * null), a boxed `java.lang.Integer`, a boxed `java.lang.Long` (a number, or a token already in the GWT base-64
 * alphabet), a primitive boolean (`Z`), null, or an object with its fields in serialization order.
 * ES: Un parámetro de una llamada GWT-RPC, como lo serializan los portales del SII: un string (en la tabla, `0` si es
 * null), un `java.lang.Integer` encajonado, un `java.lang.Long` encajonado (un número, o un token ya en el alfabeto
 * base 64 de GWT), un booleano primitivo (`Z`), null, o un objeto con sus campos en orden de serialización.
 */
export type GwtParameter =
  | { readonly kind: 'string'; readonly value: string | null }
  | { readonly kind: 'integer'; readonly value: number }
  | { readonly kind: 'long'; readonly value: number | string }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'null' }
  | { readonly kind: 'object'; readonly type: string; readonly fields: readonly GwtParameter[] }

/**
 * EN: One GWT-RPC call: where it goes and what it carries.
 * ES: Una llamada GWT-RPC: adónde va y qué lleva.
 */
export type GwtCall = {
  /** EN: The module base URL, with its trailing slash. ES: La URL base del módulo, con su barra final. */
  readonly moduleBase: string
  /** EN: The serialization policy hash. ES: El hash de la política de serialización. */
  readonly policy: string
  /** EN: The service interface name. ES: El nombre de la interfaz del servicio. */
  readonly service: string
  /** EN: The method. ES: El método. */
  readonly method: string
  /** EN: The parameters, in order. ES: Los parámetros, en orden. */
  readonly parameters: readonly GwtParameter[]
}

/**
 * EN: A GWT-RPC answer, read.
 * ES: Una respuesta GWT-RPC, leída.
 */
export type GwtAnswer = {
  /** EN: The body starts with `//OK`. ES: El cuerpo empieza con `//OK`. */
  readonly ok: boolean
  /** EN: The string table of the answer, empty when none can be read. ES: La tabla de strings de la respuesta, vacía si no se puede leer. */
  readonly table: readonly string[]
  /** EN: The first sentence of the table that reads as a message to the user, or null. ES: La primera frase de la tabla que se lee como mensaje al usuario, o null. */
  readonly message: string | null
  /** EN: Every single-quoted token of the body decoded as a GWT Long. ES: Cada token entre comillas simples del cuerpo decodificado como Long de GWT. */
  readonly longs: readonly number[]
  /** EN: The raw body. ES: El cuerpo crudo. */
  readonly body: string
}

/**
 * EN: The two hashes a GWT portal requires on every call.
 * ES: Los dos hashes que un portal GWT exige en cada llamada.
 */
export type GwtHashes = {
  /** EN: `X-GWT-Permutation`, the name of the compiled module. ES: `X-GWT-Permutation`, el nombre del módulo compilado. */
  readonly permutation: string
  /** EN: The serialization policy, the second string of every body. ES: La política de serialización, el segundo string de cada cuerpo. */
  readonly policy: string
}

/** EN: GWT signature of `java.lang.String`. ES: Firma GWT de `java.lang.String`. */
export const GWT_STRING = 'java.lang.String/2004016611'
/** EN: GWT signature of `java.lang.Integer`. ES: Firma GWT de `java.lang.Integer`. */
export const GWT_INTEGER = 'java.lang.Integer/3438268394'
/** EN: GWT signature of `java.lang.Long`. ES: Firma GWT de `java.lang.Long`. */
export const GWT_LONG = 'java.lang.Long/4227064769'
/** EN: GWT signature of a primitive boolean. ES: Firma GWT de un booleano primitivo. */
export const GWT_BOOLEAN = 'Z'
/** EN: The `Content-Type` of a GWT-RPC body. ES: El `Content-Type` de un cuerpo GWT-RPC. */
export const GWT_CONTENT_TYPE = 'text/x-gwt-rpc; charset=UTF-8'

const PROTOCOL_VERSION = '7'
const FLAGS = '0'
const NULL = '0'
const LONG_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$_'
const LONG_RADIX = 64
const MESSAGE_MIN_LENGTH = 15
const MESSAGE_WORDS = /(no ha|no est|no se|no corresp|debe |error|inv[aá]lid|rechaz|El estado|El contribuyente)/i
const TYPE_NAME = /^[\w.$]+\/\d+$/

/**
 * EN: A number in the GWT base-64 alphabet, most significant digit first (`264872` is `BAqo`).
 * ES: Un número en el alfabeto base 64 de GWT, el dígito más significativo primero (`264872` es `BAqo`).
 */
export const encodeGwtLong = (value: number): string => {
  let rest = Math.trunc(value)
  let out = ''
  do {
    out = LONG_ALPHABET[rest % LONG_RADIX] + out
    rest = Math.trunc(rest / LONG_RADIX)
  } while (rest > 0)
  return out
}

/**
 * EN: The number a GWT base-64 token holds, or null when a character is not in the alphabet.
 * ES: El número que contiene un token base 64 de GWT, o null si un carácter no está en el alfabeto.
 */
export const decodeGwtLong = (token: string): number | null => {
  let value = 0
  for (const char of token) {
    const digit = LONG_ALPHABET.indexOf(char)
    if (digit === -1) return null
    value = value * LONG_RADIX + digit
  }
  return value
}

const escapeTableString = (value: string): string => value.replace(/\\/g, '\\\\').replace(/\|/g, '\\!')

// One pass that interns strings as it writes them: the four header slots, then the parameter types, then the values.
const serialize = (call: GwtCall): { readonly table: string[]; readonly body: string[] } => {
  const table: string[] = []
  const intern = (value: string): string => {
    const at = table.indexOf(value)
    if (at !== -1) return String(at + 1)
    table.push(value)
    return String(table.length)
  }
  const typeOf = (parameter: GwtParameter): string => {
    switch (parameter.kind) {
      case 'string':
      case 'null':
        return GWT_STRING
      case 'integer':
        return GWT_INTEGER
      case 'long':
        return GWT_LONG
      case 'boolean':
        return GWT_BOOLEAN
      default:
        return parameter.type
    }
  }
  const body: string[] = [intern(call.moduleBase), intern(call.policy), intern(call.service), intern(call.method)]
  const write = (parameter: GwtParameter): void => {
    switch (parameter.kind) {
      case 'string':
        body.push(parameter.value === null ? NULL : intern(parameter.value))
        return
      case 'null':
        body.push(NULL)
        return
      case 'integer':
        body.push(intern(GWT_INTEGER), String(parameter.value))
        return
      case 'long':
        body.push(
          intern(GWT_LONG),
          typeof parameter.value === 'string' ? parameter.value : encodeGwtLong(parameter.value),
        )
        return
      case 'boolean':
        body.push(parameter.value ? '1' : '0')
        return
      default:
        body.push(intern(parameter.type))
        for (const field of parameter.fields) write(field)
    }
  }
  body.push(String(call.parameters.length))
  for (const parameter of call.parameters) body.push(intern(typeOf(parameter)))
  for (const parameter of call.parameters) write(parameter)
  return { table, body }
}

/**
 * EN: The request body of a call: `7|0|N|` + the string table + the body, every item followed by `|`.
 * ES: El cuerpo de petición de una llamada: `7|0|N|` + la tabla de strings + el cuerpo, cada ítem seguido de `|`.
 */
export const gwtBody = (call: GwtCall): string => {
  const { table, body } = serialize(call)
  return [PROTOCOL_VERSION, FLAGS, String(table.length), ...table.map(escapeTableString), ...body].join('|') + '|'
}

/**
 * EN: The headers of a call: the GWT content type, the module base and the permutation, the origin and the referer.
 * ES: Las cabeceras de una llamada: el content type GWT, la base del módulo y la permutación, el origen y el referer.
 */
export const gwtHeaders = (moduleBase: string, permutation: string): Readonly<Record<string, string>> => ({
  'Content-Type': GWT_CONTENT_TYPE,
  'X-GWT-Module-Base': moduleBase,
  'X-GWT-Permutation': permutation,
  Origin: new URL(moduleBase).origin,
  Referer: moduleBase,
})

const tableOf = (body: string): readonly string[] => {
  const start = body.lastIndexOf(',["')
  const end = body.lastIndexOf('],')
  if (start === -1 || end <= start) return []
  // GWT writes `\x27` for a quote, which JSON refuses.
  const raw = body.slice(start + 1, end + 1).replace(/\\x([0-9A-Fa-f]{2})/g, '\\u00$1')
  try {
    // The slice opens with `[` and closes with `]`, so a parse that succeeds gives an array.
    return (JSON.parse(raw) as unknown[]).filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

/**
 * EN: The first string of a table that reads as a message to the user: a sentence with whitespace, longer than 15
 * characters, not a type name, not a class path, with one of the words the SII uses to refuse.
 * ES: El primer string de una tabla que se lee como mensaje al usuario: una frase con espacios, de más de 15
 * caracteres, que no es un nombre de tipo ni una ruta de clase, con una de las palabras con que el SII rechaza.
 */
export const gwtMessage = (table: readonly string[]): string | null =>
  table.find(
    (item) =>
      item.length > MESSAGE_MIN_LENGTH &&
      /\s/.test(item) &&
      !TYPE_NAME.test(item) &&
      !item.includes('cl.sii.sdi') &&
      MESSAGE_WORDS.test(item),
  ) ?? null

/**
 * EN: Reads an answer: `//OK`, the string table, the message, the Long tokens.
 * ES: Lee una respuesta: `//OK`, la tabla de strings, el mensaje, los tokens Long.
 */
export const gwtAnswer = (body: string): GwtAnswer => {
  const table = tableOf(body)
  return {
    ok: body.startsWith('//OK'),
    table,
    message: gwtMessage(table),
    // The pattern only admits the alphabet, so every token decodes.
    longs: [...body.matchAll(/'([A-Za-z0-9$_]{3,7})'/g)].map((match) => decodeGwtLong(match[1])!),
    body,
  }
}

/**
 * EN: The first Long of an answer inside a range, or null.
 * ES: El primer Long de una respuesta dentro de un rango, o null.
 */
export const firstGwtLongIn = (answer: GwtAnswer, min: number, max: number): number | null =>
  answer.longs.find((value) => value >= min && value <= max) ?? null

/**
 * EN: The single-quoted token of an answer whose value is `value`, as the portal wrote it, or null.
 * ES: El token entre comillas simples de una respuesta cuyo valor es `value`, tal como lo escribió el portal, o null.
 */
export const gwtLongToken = (answer: GwtAnswer, value: number): string | null =>
  [...answer.body.matchAll(/'([A-Za-z0-9$_]{3,7})'/g)].find((match) => decodeGwtLong(match[1]) === value)?.[1] ?? null

/**
 * EN: What `discoverGwtHashes` needs: the module, the pair known to work, and a pair from the caller that wins.
 * ES: Lo que necesita `discoverGwtHashes`: el módulo, el par que se sabe que funciona, y un par del llamador que gana.
 */
export type GwtDiscoveryInput = {
  /** EN: The module base URL, with its trailing slash. ES: La URL base del módulo, con su barra final. */
  readonly moduleBase: string
  /** EN: The module name (`<name>.nocache.js`). ES: El nombre del módulo (`<name>.nocache.js`). */
  readonly moduleName: string
  /** EN: The pair known to work. ES: El par que se sabe que funciona. */
  readonly known: GwtHashes
  /** EN: A pair the caller knows better; nothing is fetched then. ES: Un par que el llamador conoce mejor; entonces no se consulta nada. */
  readonly override?: GwtHashes
}

const uniqueUpper = (matches: Iterable<RegExpMatchArray>): readonly string[] => [
  ...new Set([...matches].map((match) => match[1].toUpperCase())),
]

/**
 * EN: The hashes of a GWT portal: the caller's pair when given; else the module's `nocache.js` is read (the 32-hex
 * strings delimited by `=`, `'` or `,`): the known pair stands when its permutation is listed, else the first one listed
 * is the permutation and its `cache.html` gives the policy, the first quoted 32-hex string that differs from it; any
 * failure, empty page or missing candidate keeps the known pair. The SII changes both when it redeploys a portal.
 * ES: Los hashes de un portal GWT: el par del llamador si lo da; si no, se lee el `nocache.js` del módulo (los strings
 * de 32 hexadecimales entre `=`, `'` o `,`): el par conocido vale si su permutación está listada, si no, la primera
 * listada es la permutación y su `cache.html` da la política, el primer string de 32 hexadecimales entre comillas que
 * no sea ella; cualquier falla, página vacía o candidato ausente deja el par conocido. El SII cambia ambos al
 * redesplegar un portal.
 */
export const discoverGwtHashes = async (context: PortalContext, input: GwtDiscoveryInput): Promise<GwtHashes> => {
  if (input.override !== undefined) return input.override
  const warn = (reason: string): GwtHashes => {
    context.portal.logger.warn('gwt hashes kept', { module: input.moduleName, reason })
    return input.known
  }
  try {
    const page = await portalRequest(context, 'gwt.nocache', 'GET', `${input.moduleBase}${input.moduleName}.nocache.js`)
    if (page.status !== 200 || page.html === '') return warn('nocache unavailable')
    const candidates = uniqueUpper(page.html.matchAll(/[=',]([0-9A-Fa-f]{32})[',]/g))
    if (candidates.includes(input.known.permutation)) return input.known
    const permutation = candidates[0]
    if (permutation === undefined) return warn('no permutation listed')
    const cache = await portalRequest(context, 'gwt.cache', 'GET', `${input.moduleBase}${permutation}.cache.html`, {
      referer: input.moduleBase,
    })
    const policy = uniqueUpper(cache.html.matchAll(/["']([0-9A-Fa-f]{32})["']/g)).find(
      (candidate) => candidate !== permutation,
    )
    if (policy === undefined) return warn('no policy in cache.html')
    return { permutation, policy }
  } catch (error) {
    return warn(errorMessage(error))
  }
}
