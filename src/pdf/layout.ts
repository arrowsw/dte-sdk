/**
 * EN: Layout of the printed sample in typographic points (1 cm = 28.3465 pt), following the SII printed-samples
 * manual: sheet width, height bounds, margins, the type box, the stamp box, fonts, line heights, tables, colours and
 * the fixed texts. None of this is a parameter: the layout is the SII's.
 * ES: Diagramación de la muestra impresa en puntos tipográficos (1 cm = 28,3465 pt), según el manual de muestras
 * impresas del SII: ancho de hoja, límites del alto, márgenes, recuadro del tipo, caja del timbre, fuentes, altos de
 * línea, tablas, colores y los textos fijos. Nada de esto es parámetro: la diagramación es la del SII.
 */
import { DteError } from '../errors'
import { isIsoDate } from '../time/chile'

/** EN: Sheet width (21.5 cm) and height bounds (11 to 33 cm). ES: Ancho de la hoja (21,5 cm) y límites del alto (11 a 33 cm). */
export const PAGE = { width: 609.45, minHeight: 311.81, maxHeight: 935.43 } as const

/** EN: Blank border on the four sides (0.5 cm). ES: Margen en blanco en los cuatro bordes (0,5 cm). */
export const MARGIN = 14.17

/** EN: Vertical gaps between and inside blocks. ES: Espacios verticales entre bloques y dentro de ellos. */
export const GAP = { section: 10, small: 6, tiny: 4 } as const

/** EN: The red type box at the top right (5.5 cm wide, 1.5 to 4 cm high). ES: Recuadro rojo del tipo de documento, arriba a la derecha (5,5 cm de ancho, 1,5 a 4 cm de alto). */
export const TYPE_BOX = { width: 155.91, minHeight: 42.52, maxHeight: 113.39, border: 1.5, padX: 8, padY: 6 } as const

/** EN: The stamp box: 5 to 9 cm wide, 2 to 4 cm high, 2 cm from the left margin. ES: Caja del timbre: 5 a 9 cm de ancho, 2 a 4 cm de alto, a 2 cm del margen izquierdo. */
export const STAMP = {
  minWidth: 141.73,
  minHeight: 56.69,
  maxWidth: 255.12,
  maxHeight: 113.39,
  marginLeft: 56.69,
  legendGap: 5,
} as const

/**
 * EN: The size a stamp of the geometry of the instructions is drawn at: as wide as the stamp box, as high as the
 * symbol's own proportion makes it, and both sides brought down together when that height would pass the box. One
 * factor for the two sides: a PDF417 whose rows are stretched or squashed is no longer the symbol that was rendered,
 * with rows three modules high.
 * ES: El tamaño con que se dibuja un timbre de la geometría del instructivo: del ancho de la caja del timbre, del alto
 * que le da la proporción del propio símbolo, y ambos lados reducidos juntos cuando ese alto pasaría la caja. Un solo
 * factor para los dos lados: un PDF417 con las filas estiradas o aplastadas ya no es el símbolo que se generó, de filas
 * de tres módulos de alto.
 * @param natural EN: the size of the stamp image, in pixels. ES: el tamaño de la imagen del timbre, en píxeles.
 * @returns EN: the width and the height to draw it at, in points. ES: el ancho y el alto con que se dibuja, en puntos.
 */
export const stampSize = (natural: {
  readonly width: number
  readonly height: number
}): { readonly width: number; readonly height: number } => {
  const factor = Math.min(STAMP.maxWidth / natural.width, STAMP.maxHeight / natural.height)
  return { width: natural.width * factor, height: natural.height * factor }
}

/** EN: Font sizes. ES: Tamaños de fuente. */
export const FONT = { name: 11, normal: 10, small: 9, tiny: 8, legal: 7, legend: 7 } as const

/** EN: Line heights. ES: Altos de línea. */
export const LINE = { normal: 13, small: 11, tiny: 10, legal: 9 } as const

/** EN: Table rows and cell padding. ES: Filas de tabla y relleno de celda. */
export const TABLE = { rowHeight: 12, headerHeight: 14, padX: 3, padY: 2 } as const

/** EN: Padding of the receiver, transport and acknowledgement boxes, the height of an acknowledgement field and the space between two fields on a line of the transport box. ES: Relleno de las cajas de receptor, transporte y acuse, alto de un campo del acuse y espacio entre dos campos de una línea de la caja de transporte. */
export const BOX = { padX: 8, padY: 8, fieldHeight: 14, fieldGap: 12 } as const

/** EN: Colours as RGB fractions. ES: Colores como fracciones RGB. */
export const COLOURS = {
  black: [0, 0, 0],
  red: [0.75, 0, 0],
  darkGrey: [0.4, 0.4, 0.4],
  midGrey: [0.5, 0.5, 0.5],
  lightGrey: [0.88, 0.88, 0.88],
} as const

/** EN: SII office printed under the type box when none is given. ES: Oficina del SII impresa bajo el recuadro cuando no se indica otra. */
export const DEFAULT_SII_OFFICE = 'S.I.I. - SANTIAGO CENTRO'

/** EN: Site the legend under the stamp names when none is given. ES: Sitio que nombra la leyenda bajo el timbre cuando no se indica otro. */
export const DEFAULT_VERIFICATION_SITE = 'www.sii.cl'

/**
 * EN: The legend under the stamp that says where the document is verified: `Verifique documento: {site}`.
 * ES: La leyenda bajo el timbre que dice dónde se verifica el documento: `Verifique documento: {sitio}`.
 * @param site EN: the site, up to 80 printable ASCII characters with no space; `www.sii.cl` when omitted. ES: el sitio, hasta 80 caracteres ASCII imprimibles sin espacios; `www.sii.cl` si se omite.
 * @throws {DteError} EN: `INVALID_OPTION { field: 'verificationSite' }` for anything else. ES: `INVALID_OPTION { field: 'verificationSite' }` ante cualquier otra cosa.
 */
export const verificationLine = (site: string = DEFAULT_VERIFICATION_SITE): string => {
  if (typeof site !== 'string' || !/^[\x21-\x7e]{1,80}$/.test(site))
    throw new DteError('INVALID_OPTION', { field: 'verificationSite' })
  return `Verifique documento: ${site}`
}

/**
 * EN: Resolution line printed under the stamp when none is given, for a year.
 * ES: Línea de resolución impresa bajo el timbre cuando no se indica otra, para un año.
 */
export const defaultResolution = (year: number): string => `Res. Ex. SII N° 0 del ${year}`

/**
 * EN: The resolution line printed under the stamp for the SII resolution of a company: `Res. Ex. SII N° {number} del
 * {year}`, the wording of the default line with the number and the year of the date. Pure, so a caller can show the
 * same line elsewhere.
 * ES: La línea de resolución impresa bajo el timbre para la resolución del SII de una empresa: `Res. Ex. SII N°
 * {número} del {año}`, con la redacción de la línea por defecto y el número y el año de la fecha. Pura, para que quien
 * llama muestre la misma línea en otro lugar.
 * @param resolution EN: `number` (`NroResol`, a whole number from 0; 0 is certification's) and `date` (`FchResol`, `YYYY-MM-DD`). ES: `number` (`NroResol`, entero desde 0; 0 es el de certificación) y `date` (`FchResol`, `AAAA-MM-DD`).
 * @returns EN: the line, for example `Res. Ex. SII N° 99 del 2014`. ES: la línea, por ejemplo `Res. Ex. SII N° 99 del 2014`.
 * @throws {DteError} EN: `INVALID_OPTION { field: 'resolution.number' }` when the number is not a whole number from 0, `INVALID_DATE { field: 'resolution.date' }` when the date is not a real `YYYY-MM-DD`. ES: `INVALID_OPTION { field: 'resolution.number' }` si el número no es un entero desde 0, `INVALID_DATE { field: 'resolution.date' }` si la fecha no es una `AAAA-MM-DD` real.
 */
export const resolutionLine = (resolution: { readonly number: number; readonly date: string }): string => {
  if (!Number.isSafeInteger(resolution.number) || resolution.number < 0) {
    throw new DteError('INVALID_OPTION', { field: 'resolution.number' })
  }
  if (typeof resolution.date !== 'string' || !isIsoDate(resolution.date)) {
    throw new DteError('INVALID_DATE', { field: 'resolution.date' })
  }
  return `Res. Ex. SII N° ${resolution.number} del ${resolution.date.slice(0, 4)}`
}

/** EN: Text of the acknowledgement box (Res. Ex. 51 of 2005, Ley 19.983). ES: Texto del acuse de recibo (Res. Ex. 51 de 2005, Ley 19.983). */
export const ACKNOWLEDGEMENT_TEXT =
  'El acuse de recibo que se declara en este acto, de acuerdo a lo dispuesto en la letra b) del Art. 4°, y la letra c) del Art. 5° de la Ley 19.983, acredita que la entrega de mercaderías o servicio(s) prestado(s) ha(n) sido recibido(s).'

/** EN: Printed names of the transfer reasons of a dispatch guide. ES: `IndTraslado` — Nombres impresos de los tipos de traslado de una guía. */
export const TRANSFER_REASON_NAMES: Readonly<Record<number, string>> = {
  1: 'Operación constituye venta',
  2: 'Ventas por efectuar',
  3: 'Consignaciones',
  4: 'Entrega gratuita',
  5: 'Traslados internos',
  6: 'Otros traslados no venta',
  7: 'Guía de devolución',
  8: 'Traslado para exportación (no venta)',
  9: 'Venta para exportación',
}

/** EN: Printed names of the payment terms, as Formato DTE 2.5 words them (field 13 of the header, page 14). ES: `FmaPago` — Nombres impresos de las formas de pago, como las nombra el Formato DTE 2.5 (campo 13 del encabezado, página 14). */
export const PAYMENT_TERMS_NAMES: Readonly<Record<number, string>> = {
  1: 'Contado',
  2: 'Crédito',
  3: 'Sin costo (entrega gratuita)',
}

/** EN: Printed names of who dispatches the goods (Formato DTE 2.5, field 6 of the header, page 12). ES: `TipoDespacho` — Nombres impresos de quién despacha los bienes (Formato DTE 2.5, campo 6 del encabezado, página 12). */
export const DISPATCH_TYPE_NAMES: Readonly<Record<number, string>> = {
  1: 'Por cuenta del receptor',
  2: 'Por cuenta del emisor a instalaciones del cliente',
  3: 'Por cuenta del emisor a otras instalaciones',
}

/** EN: What a document does to the one it references, in words (Formato DTE 2.5, field 8 of the references, page 46). ES: `CodRef` — Lo que un documento le hace al que referencia, en palabras (Formato DTE 2.5, campo 8 de las referencias, página 46). */
export const REFERENCE_CODE_NAMES: Readonly<Record<number, string>> = {
  1: 'Anula documento de referencia',
  2: 'Corrige texto documento de referencia',
  3: 'Corrige montos',
}

/** EN: Printed names of the payment media, as Formato DTE 2.5 words them (field 23 of the header, page 15). ES: `MedioPago` — Nombres impresos de los medios de pago, como los nombra el Formato DTE 2.5 (campo 23 del encabezado, página 15). */
export const PAYMENT_MEDIUM_NAMES: Readonly<Record<string, string>> = {
  CH: 'Cheque',
  CF: 'Cheque a fecha',
  LT: 'Letra',
  EF: 'Efectivo',
  PE: 'Pago a cuenta corriente',
  TC: 'Tarjeta de crédito',
  OT: 'Otro',
}

/** EN: Printed names of the payment media of a receipt (Formato Boletas Electrónicas 4.2, field 10 of the header, page 9). ES: `MedioPago` — Nombres impresos de los medios de pago de una boleta (Formato Boletas Electrónicas 4.2, campo 10 del encabezado, página 9). */
export const RECEIPT_PAYMENT_MEDIUM_NAMES: Readonly<Record<string, string>> = {
  1: 'Efectivo',
  2: 'Pago electrónico',
  3: 'Transferencia electrónica',
  4: 'Cheque',
  5: 'Otro',
}

/** EN: Printed names of the kinds of payment account, the values the schema admits (field 24 of the header, page 15). ES: `TpoCtaPago` — Nombres impresos de los tipos de cuenta del pago, los valores que admite el esquema (campo 24 del encabezado, página 15). */
export const PAYMENT_ACCOUNT_NAMES: Readonly<Record<string, string>> = {
  CORRIENTE: 'Cuenta corriente',
  AHORRO: 'Cuenta de ahorro',
  VISTA: 'Cuenta vista',
}

/** EN: Printed names of the kinds of special invoice (Formato DTE 2.5, field 31 of the header, page 16). ES: `TipoFactEsp` — Nombres impresos de los tipos de factura especial (Formato DTE 2.5, campo 31 del encabezado, página 16). */
export const SPECIAL_INVOICE_NAMES: Readonly<Record<number, string>> = { 1: 'Factura Turista' }

/** EN: Printed names of the documents of a tourist (Formato DTE 2.5, field 55 of the header, page 20). ES: `TipoDocID` — Nombres impresos de los documentos del turista (Formato DTE 2.5, campo 55 del encabezado, página 20). */
export const FOREIGN_ID_NAMES: Readonly<Record<number, string>> = { 1: 'Pasaporte', 2: 'DNI' }

/** EN: Printed names of who issues a guide for export (Formato DTE 2.5, field 38 of the header, page 18). ES: `CdgTraslado` — Nombres impresos del código emisor traslado excepcional de una guía de exportación (Formato DTE 2.5, campo 38 del encabezado, página 18). */
export const EXCEPTIONAL_TRANSFER_NAMES: Readonly<Record<number, string>> = {
  1: 'Exportador',
  2: 'Agente de Aduana',
  3: 'Vendedor',
  4: 'Contribuyente autorizado expresamente por el SII',
}

/** EN: The notice printed where the stamp goes on a document that has none, and its legend. ES: El aviso que se imprime donde va el timbre en un documento que no lo trae, y su leyenda. */
export const UNSTAMPED = { title: 'SIN TIMBRE ELECTRÓNICO', legend: 'Documento sin validez tributaria' } as const

/**
 * EN: Printed names of the codes of additional taxes and withholdings, as Formato DTE 2.5 names them in its table of
 * codes (section 4, pages 51 to 54); the printed sample translates the code into words, as the format asks of
 * `TipoImp`. A code of total withholding (301 to 481) takes the name of its row.
 * ES: `TipoImp` — Nombres impresos de los códigos de impuestos adicionales y retenciones, como los nombra el Formato
 * DTE 2.5 en su tabla "Codificación tipos de impuestos y recargos" (punto 4, páginas 51 a 54); la muestra impresa
 * traduce el código a palabras, como lo pide el formato. Un código de retención total (301 a 481) lleva el nombre de su
 * fila.
 */
export const TAX_NAMES: Readonly<Record<string, string>> = {
  14: 'IVA de margen de comercialización',
  15: 'IVA retenido total',
  17: 'IVA ANTICIPADO FAENAMIENTO CARNE',
  18: 'IVA ANTICIPADO CARNE',
  19: 'IVA ANTICIPADO HARINA',
  23: 'IMPUESTO ADICIONAL Art 37 Letras a, b, c',
  24: 'DL 825/74, ART. 42, letra b)',
  25: 'DL 825/74, ART. 42, letra c)',
  26: 'DL 825/74, ART. 42, letra c)',
  27: 'DL 825/74, ART. 42, letra a)',
  271: 'DL 825/74, ART. 42, letra a) Inciso Segundo',
  28: 'Impuesto específico diésel',
  30: 'IVA RETENIDO LEGUMBRES',
  301: 'IVA RETENIDO LEGUMBRES',
  31: 'IVA RETENIDO SILVESTRES',
  32: 'IVA RETENIDO GANADO',
  321: 'IVA RETENIDO GANADO',
  33: 'IVA RETENIDO MADERA',
  331: 'IVA RETENIDO MADERA',
  34: 'IVA RETENIDO TRIGO',
  341: 'IVA RETENIDO TRIGO',
  35: 'Impuesto específico gasolina',
  36: 'IVA RETENIDO ARROZ',
  361: 'IVA RETENIDO ARROZ',
  37: 'IVA RETENIDO HIDROBIOLOGICAS',
  371: 'IVA RETENIDO HIDROBIOLOGICAS',
  38: 'IVA RETENIDO CHATARRA',
  39: 'IVA RETENIDO PPA',
  41: 'IVA RETENIDO CONSTRUCCION',
  44: 'IMPUESTO ADICIONAL Art 37 Letras e, h, I, l',
  45: 'IMPUESTO ADICIONAL Art 37 Letras j',
  46: 'IVA RETENIDO ORO',
  47: 'IVA RETENIDO CARTONES',
  48: 'IVA RETENIDO FRAMBUESAS',
  481: 'IVA RETENIDO FRAMBUESAS',
  49: 'FACTURA DE COMPRA SIN RETENCIÓN',
  50: 'IVA de margen de comercialización de instrumentos de prepago',
  51: 'Impuesto gas natural comprimido; 1,93 UTM/KM3, Art. 1°, Ley N° 20.052',
  52: 'Impuesto gas licuado de petróleo; 1,40 UTM/M3, Art 1°, Ley N° 20.052',
  53: 'Impuesto Retenido Suplementeros Art 74 N°5 Ley de la Renta',
}

/**
 * EN: Layout of the printed sample on continuous paper (the manual's "papel continuo", the format of a point of sale
 * printer), in points. The roll is 80 mm wide (226.77 pt), above the manual's least width of 7.5 cm (212.6 pt), with
 * the 0.5 cm blank border on both sides, which leaves 7 cm (198.43 pt) to print. The stamp takes the 7 cm, between its
 * 5 and 9 cm bounds, instead of starting 2 cm from the left as on a sheet: the manual's own roll example prints it
 * across the width, and the type box takes the 7 cm too. The box letters are 10 pt bold
 * and the stamp legends are 7 pt, over the manual's minimums (10 pt and 6 pt). The page is as tall as its content.
 * ES: Diagramación de la muestra impresa en papel continuo (formato de las impresoras de punto de venta), en puntos. El
 * rollo mide 80 mm de ancho (226,77 pt), sobre el ancho mínimo de 7,5 cm (212,6 pt) del manual, con el borde en
 * blanco de 0,5 cm a cada lado, lo que deja 7 cm (198,43 pt) para imprimir. El timbre ocupa los 7 cm, entre sus
 * límites de 5 y 9 cm, en vez de partir a 2 cm del borde izquierdo como en hoja: el propio ejemplo de papel continuo
 * del manual lo imprime a lo ancho, y el recuadro también ocupa los 7 cm. Las letras del recuadro son de
 * 10 pt en negrita y las leyendas del timbre de 7 pt, sobre los mínimos del manual (10 pt y 6 pt). La página mide lo
 * que su contenido.
 */
export const ROLL = {
  width: 226.77,
  margin: 14.17,
  /** EN: Printable width (7 cm). ES: Ancho imprimible (7 cm). */
  contentWidth: 198.43,
  /** EN: Line height as a multiple of the font size. ES: Alto de línea como múltiplo del tamaño de letra. */
  leading: 1.25,
  /** EN: Type box padding and border (1 mm). ES: Relleno y filete del recuadro (1 mm). */
  box: { pad: 5, border: 2.83 },
  /** EN: Height of a rule and of the gap between blocks. ES: Alto de una línea divisoria y del espacio entre bloques. */
  rule: 8,
  gap: 6,
  /** EN: Height of an acknowledgement field to write in. ES: Alto de un campo del acuse donde escribir. */
  field: 18,
  /** EN: Largest logo (4 cm by 1.5 cm). ES: Logo más grande (4 cm por 1,5 cm). */
  logo: { width: 113.39, height: 42.52 },
} as const

/** EN: Font sizes on continuous paper. ES: Tamaños de letra en papel continuo. */
export const ROLL_FONT = { box: 10, name: 9, body: 8, small: 7, total: 9 } as const
