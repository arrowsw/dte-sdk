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
