// Synthetic answers of the SII's GWT portals. The shapes follow the field; every value is invented.

/** A `//OK` answer: the values, then the string table, then the trailer `0,7`. */
export const okAnswer = (values: readonly (string | number)[], table: readonly string[]): string =>
  `//OK[${values.join(',')},[${table.map((item) => JSON.stringify(item)).join(',')}],0,7]`

/** The answer of a call that returns nothing. */
export const EMPTY_OK = '//OK[0,[],0,7]'

/** A server-side exception. */
export const EXCEPTION = '//EX[2,1,["java.lang.RuntimeException/515124647","The call failed on the server"],0,7]'

/** An HTML detail table as the samples portal embeds it: `\x3C` for `<`, inside the string table. */
export const detailAnswer = (rows: readonly (readonly string[])[]): string => {
  const html = `\\x3Chtml\\x3E\\x3Ctable\\x3E${rows
    .map((cells) => `\\x3Ctr\\x3E${cells.map((cell) => `\\x3Ctd\\x3E${cell}\\x3C/td\\x3E`).join('')}\\x3C/tr\\x3E`)
    .join('')}\\x3C/table\\x3E\\x3C/html\\x3E`
  return `//OK[1,["${html}"],0,7]`
}
