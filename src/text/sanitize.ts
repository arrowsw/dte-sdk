import { DteError } from '../errors'

/**
 * EN: Normalizes free text for a DTE field: drops apostrophes and double quotes (they break the SII signature
 * checks), maps typographic dashes and ellipsis to ASCII, removes anything outside ISO-8859-1 (emoji, curly quotes)
 * and trims. `null`/`undefined` become `''`.
 * ES: Normaliza texto libre para un campo del DTE: quita apóstrofes y comillas dobles (rompen la validación de firma
 * del SII), pasa guiones y puntos suspensivos tipográficos a ASCII, elimina todo lo que no es ISO-8859-1 (emoji,
 * comillas curvas) y recorta espacios. `null`/`undefined` quedan en `''`.
 */
export const sanitizeText = (text: string | null | undefined): string => {
  if (text === undefined || text === null) return ''
  return String(text)
    .replace(/['´`]/g, '')
    .replace(/"/g, '')
    .replace(/[—–]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\u0000-ÿ]/g, '')
    .trim()
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
