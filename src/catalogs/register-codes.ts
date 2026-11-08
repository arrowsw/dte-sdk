import type { RegisterOperation } from './portal'

/**
 * EN: One document code of the purchase and sales register, with what the register does with it.
 * ES: Un código de documento del registro de compras y ventas, con lo que el registro hace con él.
 */
export type RegisterDocumentCode = {
  /**
   * EN: SII document code (the tax document type number).
   * ES: `TpoDoc` — Código de documento del SII (número del tipo de documento tributario).
   */
  readonly code: number
  /**
   * EN: Official SII label, in Spanish.
   * ES: Nombre oficial del documento en las tablas de códigos del SII.
   */
  readonly name: string
  /**
   * EN: Sides of the register where the code appears, purchase before sale; empty when the code is not in the register.
   * ES: Lados del registro donde aparece el código (compras antes que ventas); vacío si el código no está en el registro.
   */
  readonly operations: readonly RegisterOperation[]
  /**
   * EN: Issued as a DTE, an electronic tax document in the SII XML format. Codes 47 and 48 are not DTEs.
   * ES: Documento tributario electrónico (DTE) en el formato XML del SII. Los códigos 47 y 48 no son DTE.
   */
  readonly electronic: boolean
  /**
   * EN: False when the code never reaches the register (dispatch guides).
   * ES: Falso cuando el código nunca llega al registro (guías de despacho).
   */
  readonly inRegister: boolean
  /**
   * EN: -1 when the code subtracts from the register's totals (credit notes and decreases), 1 otherwise. The amounts of
   * codes 40, 43 and 103 may arrive negative and carry their own sign.
   * ES: Signo con que el código entra en los totales del registro: -1 resta (notas de crédito y disminuciones), 1 suma.
   * Los montos de los códigos 40, 43 y 103 pueden venir negativos y traen su propio signo.
   */
  readonly sign: 1 | -1
  /**
   * EN: False when the register shows only a monthly summary line for the code, with no document by document detail.
   * ES: Columna "solo en resumen" — Falso cuando el registro muestra solo una línea de resumen mensual del código, sin
   * detalle por documento.
   */
  readonly perDocument: boolean
  /**
   * EN: The buyer withholds the VAT (cambio de sujeto). Debit and credit notes tied to a purchase invoice may carry the
   * withholding per document, not per code, so this flag does not cover them.
   * ES: Retención de IVA por el comprador (cambio de sujeto). Las notas de débito y crédito de una factura de compra
   * pueden llevar la retención por documento y no por código, así que este indicador no las cubre.
   */
  readonly buyerWithholdsVat: boolean
}

/**
 * EN: The 49 document codes of the purchase and sales register, sorted by code. Sources, all public: the SII's
 * "Información Electrónica de Compras y Ventas" format v3.0 (the code tables of each side and the "solo en resumen"
 * column), the register's upload formats for purchases, sales and the sales summary, the register's FAQ, Resolución
 * Exenta SII N° 12 of 2011 (the buyer of a factura de inicio withholds the whole VAT) and the F29 instructions (credit
 * notes subtract). What the SII does not state and this catalog infers: dispatch guides 50 and 52 appear in no register
 * code table, so they are marked as outside the register; the sign of each code is the F29's (credit notes subtract),
 * not one the register states; code 906 is summary only; and codes 500 and 501 come from the older book format.
 * ES: Los 49 códigos de documento del registro de compras y ventas, ordenados por código. Fuentes, todas públicas: el
 * formato "Información Electrónica de Compras y Ventas" v3.0 del SII (las tablas de códigos de cada lado y la columna
 * "solo en resumen"), los formatos de carga del registro para compras, ventas y resumen de ventas, las preguntas
 * frecuentes del registro, la Resolución Exenta SII N° 12 de 2011 (el comprador de una factura de inicio retiene todo
 * el IVA) y las instrucciones del F29 (las notas de crédito restan). Lo que el SII no dice y este catálogo infiere: las
 * guías de despacho 50 y 52 no figuran en ninguna tabla de códigos del registro, por eso quedan fuera del registro; el
 * signo de cada código es el del F29 (las notas de crédito restan) y no uno que el registro declare; el código 906 es
 * solo resumen; y los códigos 500 y 501 vienen del formato antiguo de libros.
 */
export const REGISTER_DOCUMENT_CODES: readonly RegisterDocumentCode[] = [
  {
    code: 29,
    name: 'Factura de Inicio',
    operations: ['purchase', 'sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: true,
  },
  {
    code: 30,
    name: 'Factura',
    operations: ['purchase', 'sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 32,
    name: 'Factura de Ventas y Servicios No Afectos o Exentos de IVA',
    operations: ['purchase', 'sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 33,
    name: 'Factura Electrónica',
    operations: ['purchase', 'sale'],
    electronic: true,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 34,
    name: 'Factura No Afecta o Exenta Electrónica',
    operations: ['purchase', 'sale'],
    electronic: true,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 35,
    name: 'Boleta de Ventas y Servicios',
    operations: ['sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: false,
    buyerWithholdsVat: false,
  },
  {
    code: 38,
    name: 'Boleta de Ventas y Servicios No Afectos o Exentos de IVA',
    operations: ['sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: false,
    buyerWithholdsVat: false,
  },
  {
    code: 39,
    name: 'Boleta Electrónica',
    operations: ['sale'],
    electronic: true,
    inRegister: true,
    sign: 1,
    perDocument: false,
    buyerWithholdsVat: false,
  },
  {
    code: 40,
    name: 'Liquidación Factura',
    operations: ['purchase', 'sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 41,
    name: 'Boleta No Afecta o Exenta Electrónica',
    operations: ['sale'],
    electronic: true,
    inRegister: true,
    sign: 1,
    perDocument: false,
    buyerWithholdsVat: false,
  },
  {
    code: 43,
    name: 'Liquidación Factura Electrónica',
    operations: ['purchase', 'sale'],
    electronic: true,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 45,
    name: 'Factura de Compra',
    operations: ['purchase', 'sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: true,
  },
  {
    code: 46,
    name: 'Factura de Compra Electrónica',
    operations: ['purchase', 'sale'],
    electronic: true,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: true,
  },
  {
    code: 47,
    name: 'Vale Electrónico',
    operations: ['sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: false,
    buyerWithholdsVat: false,
  },
  {
    code: 48,
    name: 'Comprobante de Pago Electrónico',
    operations: ['sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: false,
    buyerWithholdsVat: false,
  },
  {
    code: 50,
    name: 'Guía de Despacho',
    operations: [],
    electronic: false,
    inRegister: false,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 52,
    name: 'Guía de Despacho Electrónica',
    operations: [],
    electronic: true,
    inRegister: false,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 55,
    name: 'Nota de Débito',
    operations: ['purchase', 'sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 56,
    name: 'Nota de Débito Electrónica',
    operations: ['purchase', 'sale'],
    electronic: true,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 60,
    name: 'Nota de Crédito',
    operations: ['purchase', 'sale'],
    electronic: false,
    inRegister: true,
    sign: -1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 61,
    name: 'Nota de Crédito Electrónica',
    operations: ['purchase', 'sale'],
    electronic: true,
    inRegister: true,
    sign: -1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 101,
    name: 'Factura de Exportación',
    operations: ['sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 102,
    name: 'Factura de Venta Exenta a Zona Franca Primaria',
    operations: ['sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 103,
    name: 'Liquidación',
    operations: ['sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 104,
    name: 'Nota de Débito de Exportación',
    operations: ['sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 105,
    name: 'Boleta Liquidación',
    operations: ['sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: false,
    buyerWithholdsVat: false,
  },
  {
    code: 106,
    name: 'Nota de Crédito de Exportación',
    operations: ['sale'],
    electronic: false,
    inRegister: true,
    sign: -1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 108,
    name: 'Solicitud Registro de Factura (SRF)',
    operations: ['purchase', 'sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 109,
    name: 'Factura a Turista',
    operations: ['sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 110,
    name: 'Factura de Exportación Electrónica',
    operations: ['sale'],
    electronic: true,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 111,
    name: 'Nota de Débito de Exportación Electrónica',
    operations: ['sale'],
    electronic: true,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 112,
    name: 'Nota de Crédito de Exportación Electrónica',
    operations: ['sale'],
    electronic: true,
    inRegister: true,
    sign: -1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 500,
    name: 'Ajuste Aumento Tipo de Cambio',
    operations: ['sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: false,
    buyerWithholdsVat: false,
  },
  {
    code: 501,
    name: 'Ajuste Disminución Tipo de Cambio',
    operations: ['sale'],
    electronic: false,
    inRegister: true,
    sign: -1,
    perDocument: false,
    buyerWithholdsVat: false,
  },
  {
    code: 901,
    name: 'Factura de Ventas a Empresas del Territorio Preferencial',
    operations: ['purchase', 'sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 902,
    name: 'Conocimiento de Embarque',
    operations: ['sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 903,
    name: 'Documento Único de Salida (DUS)',
    operations: ['sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 904,
    name: 'Factura de Traspaso',
    operations: ['purchase', 'sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 905,
    name: 'Factura de Reexpedición',
    operations: ['sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 906,
    name: 'Boletas Venta Módulos ZF (todas)',
    operations: ['sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: false,
    buyerWithholdsVat: false,
  },
  {
    code: 907,
    name: 'Facturas Venta Módulo ZF (todas)',
    operations: ['sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 909,
    name: 'Facturas Venta Módulo ZF',
    operations: ['purchase'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 910,
    name: 'Solicitud Traslado Zona Franca (Z)',
    operations: ['purchase'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 911,
    name: 'Declaración de Ingreso a Zona Franca Primaria',
    operations: ['purchase'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 914,
    name: 'Declaración de Ingreso (DIN)',
    operations: ['purchase'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: true,
    buyerWithholdsVat: false,
  },
  {
    code: 919,
    name: 'Resumen Ventas Nacionales Pasajes sin Factura',
    operations: ['sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: false,
    buyerWithholdsVat: false,
  },
  {
    code: 920,
    name: 'Otros Registros no Documentados Aumenta Débito',
    operations: ['sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: false,
    buyerWithholdsVat: false,
  },
  {
    code: 922,
    name: 'Otros Registros Disminuye Débito',
    operations: ['sale'],
    electronic: false,
    inRegister: true,
    sign: -1,
    perDocument: false,
    buyerWithholdsVat: false,
  },
  {
    code: 924,
    name: 'Resumen Ventas Internacionales Pasajes sin Factura',
    operations: ['sale'],
    electronic: false,
    inRegister: true,
    sign: 1,
    perDocument: false,
    buyerWithholdsVat: false,
  },
] as const

const BY_CODE: ReadonlyMap<number, RegisterDocumentCode> = new Map(
  REGISTER_DOCUMENT_CODES.map((entry) => [entry.code, entry]),
)

/**
 * EN: What the register does with a document code, or `undefined` when the code is not one of the 49.
 * ES: Lo que el registro hace con un código de documento, o `undefined` si el código no es uno de los 49.
 */
export const registerDocumentCode = (code: number): RegisterDocumentCode | undefined => BY_CODE.get(code)
