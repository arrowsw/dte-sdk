/**
 * EN: Layout of the printed sample in typographic points (1 cm = 28.3465 pt), following the SII printed-samples
 * manual: sheet width, height bounds, margins, the type box, the stamp box, fonts, line heights, tables, colours and
 * the fixed texts. None of this is a parameter: the layout is the SII's.
 * ES: Diagramación de la muestra impresa en puntos tipográficos (1 cm = 28,3465 pt), según el manual de muestras
 * impresas del SII: ancho de hoja, límites del alto, márgenes, recuadro del tipo, caja del timbre, fuentes, altos de
 * línea, tablas, colores y los textos fijos. Nada de esto es parámetro: la diagramación es la del SII.
 */

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

/**
 * EN: Resolution line printed under the stamp when none is given, for a year.
 * ES: Línea de resolución impresa bajo el timbre cuando no se indica otra, para un año.
 */
export const defaultResolution = (year: number): string => `Res. Ex. SII N° 0 del ${year}`

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
