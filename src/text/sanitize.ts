import { DteError } from '../errors'
import { dropForbiddenControls } from '../xml/escape'

// What a character outside ISO-8859-1 is written as when Unicode gives it no decomposition into ISO-8859-1.
const WRITTEN_AS: ReadonlyMap<string, string> = new Map([
  ['€', 'EUR'],
  ['‰', 'o/oo'],
  ['•', '*'],
  ['‣', '*'],
  ['◦', '*'],
  ['∙', '*'],
  ['⁄', '/'],
  ['∕', '/'],
  ['≤', '<='],
  ['≥', '>='],
  ['→', '->'],
  ['←', '<-'],
  ['Ł', 'L'],
  ['ł', 'l'],
  ['Đ', 'D'],
  ['đ', 'd'],
  ['ı', 'i'],
  ['Œ', 'OE'],
  ['œ', 'oe'],
])
const OUTSIDE_LATIN1 = /[\u0100-\u{10FFFF}]/u
const TYPOGRAPHIC_QUOTES = /[\u2018-\u201F\u2032-\u2037\u2039\u203A]/u
// A letter, a digit, a currency sign or a math sign: dropping one changes what the text says.
const CARRIES_MEANING = /[\p{L}\p{N}\p{Sc}\p{Sm}]/u
const LETTER = /\p{L}/u
// A superscript, a subscript or a fraction: spelled out beside other digits it reads as another number (`10⁴`, `2⅓`).
const NUMBER_FORM = /\p{No}/u
const SEPARATOR = /\p{Z}/u

// The ISO-8859-1 form of one character outside it, or null when it has none: its own entry, or its compatibility
// decomposition (`ﬁ` is `fi`, `™` is `TM`), which for a letter leaves its diacritics out (`š` is `s`). Only a letter
// loses its marks: on a sign the mark is the meaning (`≠` is `=` with a stroke).
const latin1Form = (char: string): string | null => {
  const written = WRITTEN_AS.get(char)
  if (written !== undefined) return written
  if (NUMBER_FORM.test(char)) return null
  const decomposed = char.normalize('NFKD')
  const parts = [...(LETTER.test(char) ? decomposed.replace(/\p{M}/gu, '') : decomposed)].map((part) =>
    OUTSIDE_LATIN1.test(part) ? WRITTEN_AS.get(part) : part,
  )
  return parts.includes(undefined) ? null : parts.join('')
}

// Every character outside ISO-8859-1, one by one: transliterated, dropped when it is a quote, an invisible mark or a
// decoration, a plain space when it is a separator, and refused when dropping it would change the text.
const toLatin1 = (text: string, field: string | undefined): string => {
  if (!OUTSIDE_LATIN1.test(text)) return text
  let index = 0
  return Array.from(text, (char) => {
    const at = index
    index += char.length
    if (!OUTSIDE_LATIN1.test(char)) return char
    if (TYPOGRAPHIC_QUOTES.test(char)) return ''
    const form = latin1Form(char)
    if (form !== null) return form
    if (CARRIES_MEANING.test(char))
      throw new DteError('ENCODING_UNSUPPORTED_CHAR', {
        ...(field === undefined ? {} : { field }),
        index: at,
        codePoint: char.codePointAt(0),
      })
    return SEPARATOR.test(char) ? ' ' : ''
  }).join('')
}

/**
 * EN: Normalizes free text for a DTE field, which the SII reads as ISO-8859-1: drops apostrophes and double quotes,
 * straight or typographic (they break the SII signature checks), maps every typographic dash and the minus sign
 * (U+2010 to U+2015, U+2212) to a hyphen, the ellipsis to three dots and the typographic spaces to a plain space, and
 * writes every other character outside ISO-8859-1 in its ISO-8859-1 form when it has one: a letter without its
 * diacritic (`š` is `s`, `ł` is `l`, `œ` is `oe`), a ligature or a compatibility form spelled out (`ﬁ` is `fi`, `™` is
 * `TM`, `№` is `No`), `€` as `EUR`, a bullet as `*`, `≤` and `≥` as `<=` and `>=`, an arrow as `->`. A letter, a digit,
 * a currency sign or a math sign with no such form is refused, because dropping it would change what the text says
 * (`Ω-3` would read `-3`), and so is a superscript, a subscript or a fraction outside ISO-8859-1, which spelled out
 * would read as another number (`10⁴`); what is decoration (an emoji, a star, a check mark) or invisible (a zero-width
 * space) is dropped. The text is composed first (NFC), so a letter typed as a base and a combining accent keeps the
 * accent ISO-8859-1 has. It also removes the control characters XML 1.0 forbids (U+0000 to U+001F but the tab, the
 * line feed and the carriage return), and trims. `null`/`undefined` become `''`.
 * ES: Normaliza texto libre para un campo del DTE, que el SII lee como ISO-8859-1: quita apóstrofes y comillas dobles,
 * rectas o tipográficas (rompen la validación de firma del SII), pasa todo guion tipográfico y el signo menos (U+2010
 * a U+2015, U+2212) a un guion, los puntos suspensivos a tres puntos y los espacios tipográficos a un espacio simple,
 * y escribe todo otro carácter fuera de ISO-8859-1 en su forma ISO-8859-1 cuando la tiene: una letra sin su
 * diacrítico (`š` es `s`, `ł` es `l`, `œ` es `oe`), una ligadura o forma de compatibilidad deletreada (`ﬁ` es `fi`,
 * `™` es `TM`, `№` es `No`), `€` como `EUR`, una viñeta como `*`, `≤` y `≥` como `<=` y `>=`, una flecha como `->`.
 * Una letra, un dígito, un signo de moneda o un signo matemático sin esa forma se rechaza, porque quitarlo cambiaría
 * lo que dice el texto (`Ω-3` se leería `-3`), y también un superíndice, un subíndice o una fracción fuera de
 * ISO-8859-1, que deletreado se leería como otro número (`10⁴`); lo que es adorno (un emoji, una estrella, un visto
 * bueno) o invisible (un espacio de ancho cero) se elimina. El texto se compone primero (NFC), así una letra escrita
 * como base más acento combinante conserva el acento que ISO-8859-1 tiene. Además quita los caracteres de control que
 * XML 1.0 prohíbe (U+0000 a U+001F salvo el tabulador, el salto de línea y el retorno de carro), y recorta espacios.
 * `null`/`undefined` quedan en `''`.
 * @param text EN: the text to normalize. ES: el texto por normalizar.
 * @param field EN: the name of the field, for the error's details. ES: el nombre del campo, para los detalles del error.
 * @returns EN: the text in ISO-8859-1. ES: el texto en ISO-8859-1.
 * @throws {DteError} EN: `ENCODING_UNSUPPORTED_CHAR { field?, index, codePoint }` for a letter, a digit, a currency sign or a math sign that has no ISO-8859-1 form; `index` counts on the composed text. ES: `ENCODING_UNSUPPORTED_CHAR { field?, index, codePoint }` ante una letra, un dígito, un signo de moneda o un signo matemático sin forma ISO-8859-1; `index` cuenta sobre el texto compuesto.
 */
export const sanitizeText = (text: string | null | undefined, field?: string): string => {
  if (text === undefined || text === null) return ''
  return dropForbiddenControls(
    toLatin1(
      String(text)
        .normalize('NFC')
        .replace(/[\u2010-\u2015\u2212]/g, '-')
        .replace(/…/g, '...')
        .replace(/[\u2000-\u200A\u202F\u205F\u3000]/g, ' '),
      field,
    )
      .replace(/['´`]/g, '')
      .replace(/"/g, ''),
  ).trim()
}

const LIGATURES: Readonly<Record<string, string>> = {
  ﬀ: 'ff',
  ﬁ: 'fi',
  ﬂ: 'fl',
  ﬃ: 'ffi',
  ﬄ: 'ffl',
  Œ: 'OE',
  œ: 'oe',
  Æ: 'AE',
  æ: 'ae',
  Ø: 'O',
  ø: 'o',
  Ð: 'D',
  ð: 'd',
  Þ: 'TH',
  þ: 'th',
  ß: 'ss',
}

/**
 * EN: Folds text to printable ASCII for the TED (`RSR`, `IT1`): strips diacritics (á→a, ñ→n), expands ligatures and
 * special letters (ß→ss, Æ→AE, Þ→TH), then drops every remaining non-ASCII character. The SII PDF417 reader loses
 * bytes ≥ 128 and verifies the TED signature over what it read, so any accent inside the stamp means
 * "TED - Firma invalida". Apply BEFORE truncating to 40: folding can lengthen the text.
 * ES: Pliega texto a ASCII imprimible para el TED (`RSR`, `IT1`): quita diacríticos (á→a, ñ→n), expande ligaduras y
 * letras especiales (ß→ss, Æ→AE, Þ→TH) y elimina lo que siga fuera de ASCII. El lector PDF417 del SII pierde los
 * bytes ≥ 128 y verifica la firma del TED sobre lo que leyó, así que una tilde dentro del timbre termina en
 * "TED - Firma invalida". Aplicar ANTES de truncar a 40: el plegado puede alargar el texto.
 */
export const foldToAscii = (text: string | null | undefined): string =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ﬀ-ﬄŒœÆæØøÐðÞþß]/g, (m) => LIGATURES[m])
    .replace(/[^ -~]/g, '')
    .trim()

/**
 * EN: Sanitizes and cuts text to `maxLength`; with `preserveWords`, backs up to the last space when it sits past 70 % of the limit.
 * ES: Sanitiza y corta el texto a `maxLength`; con `preserveWords`, retrocede al último espacio si queda después del 70 % del límite.
 */
export const truncateText = (text: string | null | undefined, maxLength: number, preserveWords = false): string => {
  const sanitized = sanitizeText(text)
  if (sanitized.length <= maxLength) return sanitized
  const cut = sanitized.slice(0, maxLength)
  if (!preserveWords) return cut
  const lastSpace = cut.lastIndexOf(' ')
  return lastSpace > maxLength * 0.7 ? cut.slice(0, lastSpace).trim() : cut
}

/**
 * EN: Throws `FIELD_TOO_LONG` when the (already sanitized) text exceeds the `xs:maxLength` of the SII schema. The SII
 * rejects the WHOLE envelope when one document fails the schema, so this fails early instead of truncating silently.
 * ES: Lanza `FIELD_TOO_LONG` cuando el texto (ya sanitizado) supera el `xs:maxLength` del esquema del SII. El SII
 * rechaza el sobre COMPLETO cuando un documento falla el schema, por eso se falla temprano en vez de truncar en silencio.
 * @param value EN: sanitized text. ES: texto ya sanitizado.
 * @param maxLength EN: schema limit. ES: límite del esquema.
 * @param field EN: schema element name, e.g. `NmbItem`. ES: nombre del elemento del esquema, p. ej. `NmbItem`.
 */
export const assertMaxLength = (value: string, maxLength: number, field: string): void => {
  if (value.length > maxLength) throw new DteError('FIELD_TOO_LONG', { field, maxLength, length: value.length, value })
}
