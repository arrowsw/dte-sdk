import type { GwtPortal } from '../catalogs/certification'
import { errorMessage } from '../errors'
import type { CallOverrides } from '../sii/client'
import { encodeUtf8 } from '../sii/transport'
import type { PortalClient } from './client'
import { ensureLiveSession, portalRequest, withPortalSession, type PortalContext, type PortalPage } from './session'

/**
 * EN: One parameter of a GWT-RPC call, as the SII's portals serialize it: a string (interned in the table, `0` when
 * null, or in a slot of its own when `distinct`), a boxed `java.lang.Integer`, a boxed `java.lang.Long` (a number, or a token already in the GWT base-64
 * alphabet), a primitive boolean (`Z`), null (a String unless it names its declared type), or an object with its fields
 * in serialization order.
 * ES: Un parámetro de una llamada GWT-RPC, como lo serializan los portales del SII: un string (en la tabla, `0` si es
 * null, o en un lugar propio si es `distinct`), un `java.lang.Integer` encajonado, un `java.lang.Long` encajonado (un número, o un token ya en el alfabeto
 * base 64 de GWT), un booleano primitivo (`Z`), null (un String salvo que nombre su tipo declarado), o un objeto con
 * sus campos en orden de serialización.
 */
export type GwtParameter =
  | { readonly kind: 'string'; readonly value: string | null; readonly distinct?: boolean }
  | { readonly kind: 'integer'; readonly value: number }
  | { readonly kind: 'long'; readonly value: number | string }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'null'; readonly type?: string }
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
  const add = (value: string): string => {
    table.push(value)
    return String(table.length)
  }
  const intern = (value: string): string => {
    const at = table.indexOf(value)
    return at === -1 ? add(value) : String(at + 1)
  }
  const typeOf = (parameter: GwtParameter): string => {
    switch (parameter.kind) {
      case 'string':
        return GWT_STRING
      case 'null':
        return parameter.type ?? GWT_STRING
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
        body.push(
          parameter.value === null
            ? NULL
            : parameter.distinct === true
              ? add(parameter.value)
              : intern(parameter.value),
        )
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

/** EN: A String parameter. ES: Un parámetro String. */
export const gwtString = (value: string | null): GwtParameter => ({ kind: 'string', value })
/**
 * EN: A String parameter that takes its own slot of the string table even when an earlier string has the same text, as
 * the field's body for `validarUsuario` writes its two verifiers.
 * ES: Un parámetro String que toma su propio lugar de la tabla de strings aunque un string anterior tenga el mismo
 * texto, como escribe el cuerpo de campo de `validarUsuario` sus dos dígitos verificadores.
 */
export const gwtDistinctString = (value: string): GwtParameter => ({ kind: 'string', value, distinct: true })
/** EN: A boxed Integer parameter. ES: Un parámetro Integer encajonado. */
export const gwtInteger = (value: number): GwtParameter => ({ kind: 'integer', value })
/** EN: A boxed Long parameter: a number, or a token as the portal wrote it. ES: Un parámetro Long encajonado: un número, o un token como lo escribió el portal. */
export const gwtLong = (value: number | string): GwtParameter => ({ kind: 'long', value })
/** EN: A primitive boolean parameter. ES: Un parámetro booleano primitivo. */
export const gwtBoolean = (value: boolean): GwtParameter => ({ kind: 'boolean', value })
/** EN: A null parameter or field. ES: Un parámetro o campo nulo. */
export const GWT_NULL: GwtParameter = { kind: 'null' }
/** EN: A null parameter declared with a type other than String. ES: Un parámetro nulo declarado con un tipo distinto de String. */
export const gwtNull = (type: string): GwtParameter => ({ kind: 'null', type })

const REDIRECT_STATUS: ReadonlySet<number> = new Set([301, 302])

/**
 * EN: The warm-up of a GWT portal: `GET` of its base with the session and one redirect (301 or 302) followed, so the
 * server opens the portal's context as it would for a browser; every cookie it sets joins the jar. A failure is logged
 * and ignored.
 * ES: El calentamiento de un portal GWT: `GET` de su base con la sesión y una redirección (301 o 302) seguida, para que
 * el servidor abra el contexto del portal como lo haría para un navegador; cada cookie que fija entra a la bolsa. Una
 * falla se registra y se ignora.
 */
export const warmUpGwtPortal = async (context: PortalContext, portal: GwtPortal): Promise<void> => {
  try {
    const first = await portalRequest(context, 'warm-up', 'GET', portal.base)
    const location = first.headers['location']
    if (location !== undefined && REDIRECT_STATUS.has(first.status))
      await portalRequest(context, 'warm-up', 'GET', new URL(location, portal.base).toString())
  } catch (error) {
    context.portal.logger.warn('gwt portal warm-up failed', { module: portal.moduleName, reason: errorMessage(error) })
  }
}

/**
 * EN: One GWT-RPC call posted to a portal's service: the page and the answer read from it.
 * ES: Una llamada GWT-RPC enviada al servicio de un portal: la página y la respuesta leída de ella.
 */
export const postGwt = async (
  context: PortalContext,
  step: string,
  portal: GwtPortal,
  hashes: GwtHashes,
  method: string,
  parameters: readonly GwtParameter[],
  headers: Readonly<Record<string, string>> = {},
): Promise<{ readonly page: PortalPage; readonly answer: GwtAnswer }> => {
  const body = gwtBody({
    moduleBase: portal.base,
    policy: hashes.policy,
    service: portal.serviceInterface,
    method,
    parameters,
  })
  const page = await portalRequest(context, step, 'POST', `${portal.base}${portal.service}`, {
    body: encodeUtf8(body),
    contentType: GWT_CONTENT_TYPE,
    referer: portal.base,
    headers: { ...gwtHeaders(portal.base, hashes.permutation), ...headers },
  })
  return { page, answer: gwtAnswer(page.html) }
}

/**
 * EN: The multipart boundary of the portals' uploads: the browser's prefix and the clock in hexadecimal.
 * ES: El límite multipart de las subidas de los portales: el prefijo del navegador y el reloj en hexadecimal.
 */
export const portalBoundary = (now: Date): string => `----WebKitFormBoundary${now.getTime().toString(16)}`

// The longest wait a timer holds (Node truncates a larger one to 1 ms); the field's calls to these portals have none.
const LONGEST_TIMEOUT_MS = 2 ** 31 - 1

/**
 * EN: How a stage talks to a GWT portal: the portal, the headers every request of the stage starts from, and whether
 * the hashes are looked up in the portal's module script (else the known pair stands).
 * ES: Cómo habla una etapa con un portal GWT: el portal, las cabeceras de las que parte cada petición de la etapa, y si
 * los hashes se buscan en el script del módulo del portal (si no, vale el par conocido).
 */
export type GwtStageSpec = {
  /** EN: The portal. ES: El portal. */
  readonly portal: GwtPortal
  /** EN: The headers each request starts from; the client adds no others. ES: Las cabeceras de las que parte cada petición; el cliente no agrega otras. */
  readonly headers: Readonly<Record<string, string>>
  /** EN: True to look the hashes up once, after the warm-up. ES: True para buscar los hashes una vez, tras el calentamiento. */
  readonly discoverHashes: boolean
}

/**
 * EN: A stage of work on one GWT portal: one authenticated entry, one warm-up and one pair of hashes that every call of
 * the stage shares. Its cookies live only as long as the stage.
 * ES: Una etapa de trabajo en un portal GWT: una entrada autenticada, un calentamiento y un par de hashes que comparten
 * todas las llamadas de la etapa. Sus cookies viven solo lo que dura la etapa.
 */
export type GwtStage = {
  /** EN: The context the calls of the stage run in. ES: El contexto en que corren las llamadas de la etapa. */
  readonly context: PortalContext
  /** EN: The hashes the calls of the stage use. ES: Los hashes que usan las llamadas de la etapa. */
  readonly hashes: GwtHashes
}

/**
 * EN: Runs a stage on a GWT portal, as the field does: the session is made sure of first (a cached one is checked and
 * replaced when dead); then the portal is warmed up once, with its cookies kept for the stage alone, so they neither
 * join the shared session nor travel to another portal; the hashes are taken once; and every call of `run` is sent
 * once, with no retry and the longest timeout a timer allows, with the portal's own headers, its answers read as UTF-8.
 * ES: Ejecuta una etapa en un portal GWT, como lo hace el campo: primero se asegura la sesión (una en caché se comprueba
 * y se reemplaza si está muerta); luego se calienta el portal una vez, con sus cookies guardadas solo para la etapa,
 * de modo que ni entran a la sesión compartida ni viajan a otro portal; los hashes se toman una vez; y cada llamada de
 * `run` se envía una sola vez, sin reintento y con el mayor timeout que admite un timer, con las cabeceras propias del
 * portal y sus respuestas leídas como UTF-8.
 * @param hashes EN: a pair that wins over the known one and over any lookup. ES: un par que gana sobre el conocido y sobre cualquier búsqueda.
 * @throws {DteError} EN: the session codes of `ensureSession`; whatever `run` throws. ES: los códigos de sesión de `ensureSession`; lo que lance `run`.
 */
export const withGwtStage = <T>(
  portal: PortalClient,
  operation: string,
  overrides: CallOverrides | undefined,
  spec: GwtStageSpec,
  hashes: GwtHashes | undefined,
  run: (stage: GwtStage) => Promise<T>,
): Promise<T> =>
  withPortalSession(portal, operation, overrides, async (session) => {
    await ensureLiveSession(session)
    const warming: PortalContext = {
      ...session,
      overrides: { ...overrides, retry: false, timeoutMs: overrides?.timeoutMs ?? LONGEST_TIMEOUT_MS },
      // The stage's own jar: it starts from the session's cookies, and what the warm-up sets stays here.
      state: { cookies: session.state.cookies, loggedIn: session.state.loggedIn },
      verbatim: { headers: spec.headers, sealed: false },
    }
    await warmUpGwtPortal(warming, spec.portal)
    const context: PortalContext = { ...warming, verbatim: { headers: spec.headers, sealed: true } }
    const { portal: gwtPortal } = spec
    const used =
      hashes ??
      (spec.discoverHashes
        ? await discoverGwtHashes(context, {
            moduleBase: gwtPortal.base,
            moduleName: gwtPortal.moduleName,
            known: gwtPortal.known,
          })
        : gwtPortal.known)
    return run({ context, hashes: used })
  })

/**
 * EN: Runs inside the caller's stage when there is one, else opens a stage of its own for the call.
 * ES: Corre dentro de la etapa de quien llama si la hay; si no, abre una etapa propia para la llamada.
 */
export const inGwtStage = <T>(
  portal: PortalClient,
  operation: string,
  overrides: CallOverrides | undefined,
  spec: GwtStageSpec,
  input: { readonly stage?: GwtStage; readonly gwt?: GwtHashes },
  run: (stage: GwtStage) => Promise<T>,
): Promise<T> =>
  input.stage === undefined
    ? withGwtStage(portal, operation, overrides, spec, input.gwt, run)
    : run({ context: { ...input.stage.context, operation }, hashes: input.gwt ?? input.stage.hashes })
