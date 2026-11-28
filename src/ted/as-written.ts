import { rsaSha1VerifyBase64 } from '../crypto/rsa'

/**
 * EN: The `DD` of a stamp's text, from its first `<DD>` to its last `</DD>`. Internal.
 * ES: El `DD` del texto de un timbre, desde su primer `<DD>` hasta su último `</DD>`. Interno.
 */
export const DD_PATTERN = /<DD>[\s\S]*<\/DD>/

const textOf = (ted: string, tag: string): string =>
  new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`).exec(ted)?.[1] ?? ''

/**
 * EN: True when the signature of a stamp (`FRMT`) covers its `DD` exactly as this text writes it, byte for byte as
 * ISO-8859-1, with the key (`RSAPK`) of the CAF the stamp itself carries, so nothing else is needed. Anything missing,
 * malformed or out of bounds is false: a stamp is input from anyone, and `rsaSha1VerifyBase64` refuses a key larger
 * than any CAF key before trying its signature. Internal.
 * ES: True cuando la firma de un timbre (`FRMT`) cubre su `DD` exactamente como lo escribe este texto, byte a byte en
 * ISO-8859-1, con la llave (`RSAPK`) del CAF que trae el propio timbre, así que no se necesita nada más. Lo que falte,
 * esté malformado o fuera de cota es false: un timbre es entrada de cualquiera, y `rsaSha1VerifyBase64` rechaza una
 * llave mayor que cualquier llave de CAF antes de probar su firma. Interno.
 */
export const stampVerifiesAsWritten = (ted: string): boolean =>
  rsaSha1VerifyBase64(
    { modulus: textOf(ted, 'M'), exponent: textOf(ted, 'E') },
    DD_PATTERN.exec(ted)?.[0] ?? '',
    'latin1',
    textOf(ted, 'FRMT'),
  )

const NAMESPACE_DECLARATION = /\s+xmlns(?::[\w.-]+)?\s*=\s*(?:"[^"]*"|'[^']*')/g
const BETWEEN_TAGS = />(\s+)</g
// A start tag, not an end tag nor an empty element, with the name it opens.
const START_TAG = /^<([A-Za-z_][\w.:-]*)(?:\s[^>]*[^/])?>$/

/**
 * EN: The string the SII's "Instructivo Emisión DTE" (A.2.4, pages 19 to 21) says a stamp is signed and verified over:
 * the text with "los caracteres de fin de línea y los blancos y/o tab entre TAGS, así como la referencia a
 * NameSpaces" removed, "sin modificar la información que va entre el tag de inicio y el tag de fin de los elementos
 * terminales". So the blanks between two tags go, those a terminal element holds stay, a namespace declaration goes
 * from every tag, and nothing else changes: an empty element stays as it is written. Internal.
 * ES: El string sobre el que el "Instructivo Emisión DTE" del SII (A.2.4, páginas 19 a 21) dice que se firma y
 * verifica un timbre: el texto sin "los caracteres de fin de línea y los blancos y/o tab entre TAGS, así como la
 * referencia a NameSpaces", "sin modificar la información que va entre el tag de inicio y el tag de fin de los
 * elementos terminales". Así se van los blancos entre dos etiquetas, quedan los que trae un elemento terminal, se va
 * la declaración de namespace de cada etiqueta, y nada más cambia: un elemento vacío queda como está escrito. Interno.
 */
export const instructivoForm = (text: string): string =>
  text
    .replace(/<[^>]*>/g, (tag) => tag.replace(NAMESPACE_DECLARATION, ''))
    .replace(BETWEEN_TAGS, (between: string, _blanks: string, offset: number, all: string) => {
      const name = START_TAG.exec(all.slice(all.lastIndexOf('<', offset), offset + 1))?.[1]
      const terminal = name !== undefined && all.startsWith(`</${name}>`, offset + between.length - 1)
      return terminal ? between : '><'
    })

/**
 * EN: True when the stamp's `FRMT` verifies over its `DD` as the text writes it or, failing that, over the string the
 * SII's "Instructivo Emisión DTE" says the SII verifies it over (`instructivoForm`), which "de lo contrario la
 * verificación del timbre electrónico resultará incorrecta". Internal.
 * ES: True cuando la `FRMT` del timbre verifica sobre su `DD` tal como lo escribe el texto o, si no, sobre el string
 * sobre el que el "Instructivo Emisión DTE" del SII dice que el SII lo verifica (`instructivoForm`), y "de lo
 * contrario la verificación del timbre electrónico resultará incorrecta". Interno.
 */
export const stampVerifiesAsSiiReads = (ted: string): boolean =>
  stampVerifiesAsWritten(ted) || stampVerifiesAsWritten(instructivoForm(ted))
