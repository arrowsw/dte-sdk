import type { DocumentType } from './document-types'

/**
 * EN: The class of an additional tax or withholding, in the words the `MntTotal` field (Formato DTE 2.5, field 124)
 * groups them with: `additional` an additional tax, `specific` a specific tax, `margin` the VAT on a trading margin,
 * `advance` an advance VAT and `withholding` a withholding. It is the class the code's name gives; codes 51 and 52 (the
 * taxes on compressed natural gas and liquefied petroleum gas, charged by volume) are specific taxes.
 * ES: Clase de un impuesto adicional o retención, con las palabras con que los agrupa el campo `MntTotal` (Formato DTE
 * 2.5, campo 124): `additional` impuestos adicionales, `specific` impuestos específicos, `margin` IVA margen de
 * comercialización, `advance` IVA anticipado y `withholding` IVA retenido (retenciones). Es la clase que da el nombre
 * del código; los códigos 51 y 52 (gas natural comprimido y gas licuado de petróleo, que se cobran por volumen) son
 * impuestos específicos.
 */
export type AdditionalTaxKind = 'additional' | 'specific' | 'margin' | 'advance' | 'withholding'

/**
 * EN: One code of the table of additional taxes and withholdings.
 * ES: Un código de la tabla de impuestos adicionales y retenciones ("Codificación tipos de impuestos y recargos").
 */
export type AdditionalTax = {
  /**
   * EN: Name, as the SII writes it, in Spanish. Codes 25 and 26 share one; the table's description tells them apart
   * (wines, and beers and other alcoholic drinks). A code of total withholding takes the name of its row.
   * ES: Columna "Nombre" — Nombre, tal como lo escribe el SII. Los códigos 25 y 26 comparten uno; la descripción de
   * la tabla los distingue (vinos, y cervezas y bebidas alcohólicas). Un código de retención total lleva el nombre de
   * su fila.
   */
  readonly name: string
  /**
   * EN: Class of the code.
   * ES: Clase del código, según las palabras de `MntTotal`.
   */
  readonly kind: AdditionalTaxKind
  /**
   * EN: Rate in percent, the `TasaImp` the table gives: the tax's rate, or the share a partial withholding usually
   * keeps ("Normalmente"). Left out where the table gives none: a specific tax charged by volume, the VAT on a trading
   * margin, and a withholding of the whole VAT.
   * ES: `TasaImp` — Tasa en porcentaje que da la tabla: la del impuesto, o la que normalmente retiene una retención
   * parcial ("Normalmente"). Se omite donde la tabla no da una: impuesto específico por volumen, IVA de margen de
   * comercialización y retención del total del IVA.
   */
  readonly rate?: number
  /**
   * EN: Electronic documents the code applies to, as the table's column lists them (its paper codes 30, 45, 55 and 60
   * left out): a sale invoice (33) or a purchase invoice (46), with the debit (56) and credit (61) notes. The rows of
   * the specific taxes on diesel and gasoline (28, 35) name only the seller's invoice.
   * ES: Columna "Documentos en que se aplica" — Documentos electrónicos en que se aplica el código, como los lista
   * la tabla (sin sus códigos en papel 30, 45, 55 y 60): factura (33) o factura de compra (46), con las notas de
   * débito (56) y de crédito (61). Las filas de los impuestos específicos al diésel y a la gasolina (28, 35) nombran
   * solo la factura que emite el vendedor.
   */
  readonly documents: readonly DocumentType[]
  /**
   * EN: Code that takes the place of this one when the buyer withholds the whole VAT (a change of taxpayer).
   * ES: Columna "Código cambio de sujeto en retención total" — Código que reemplaza a este cuando el comprador
   * retiene el total del IVA (cambio de sujeto).
   */
  readonly totalWithholdingCode?: number
}

const SALE = [33, 56, 61] as const
const PURCHASE = [46, 56, 61] as const
const SELLER_INVOICE = [33] as const

const TAXES = {
  14: { name: 'IVA de margen de comercialización', kind: 'margin', documents: SALE },
  15: { name: 'IVA retenido total', kind: 'withholding', documents: PURCHASE },
  17: { name: 'IVA ANTICIPADO FAENAMIENTO CARNE', kind: 'advance', rate: 5, documents: SALE },
  18: { name: 'IVA ANTICIPADO CARNE', kind: 'advance', rate: 5, documents: SALE },
  19: { name: 'IVA ANTICIPADO HARINA', kind: 'advance', rate: 12, documents: SALE },
  23: { name: 'IMPUESTO ADICIONAL Art 37 Letras a, b, c', kind: 'additional', rate: 15, documents: SALE },
  24: { name: 'DL 825/74, ART. 42, letra b)', kind: 'additional', rate: 31.5, documents: SALE },
  25: { name: 'DL 825/74, ART. 42, letra c)', kind: 'additional', rate: 20.5, documents: SALE },
  26: { name: 'DL 825/74, ART. 42, letra c)', kind: 'additional', rate: 20.5, documents: SALE },
  27: { name: 'DL 825/74, ART. 42, letra a)', kind: 'additional', rate: 10, documents: SALE },
  28: { name: 'Impuesto específico diésel', kind: 'specific', documents: SELLER_INVOICE },
  30: { name: 'IVA RETENIDO LEGUMBRES', kind: 'withholding', rate: 10, documents: PURCHASE, totalWithholdingCode: 301 },
  31: { name: 'IVA RETENIDO SILVESTRES', kind: 'withholding', documents: PURCHASE },
  32: { name: 'IVA RETENIDO GANADO', kind: 'withholding', rate: 8, documents: PURCHASE, totalWithholdingCode: 321 },
  33: { name: 'IVA RETENIDO MADERA', kind: 'withholding', rate: 8, documents: PURCHASE, totalWithholdingCode: 331 },
  34: { name: 'IVA RETENIDO TRIGO', kind: 'withholding', rate: 4, documents: PURCHASE, totalWithholdingCode: 341 },
  35: { name: 'Impuesto específico gasolina', kind: 'specific', documents: SELLER_INVOICE },
  36: { name: 'IVA RETENIDO ARROZ', kind: 'withholding', rate: 10, documents: PURCHASE, totalWithholdingCode: 361 },
  37: {
    name: 'IVA RETENIDO HIDROBIOLOGICAS',
    kind: 'withholding',
    rate: 10,
    documents: PURCHASE,
    totalWithholdingCode: 371,
  },
  38: { name: 'IVA RETENIDO CHATARRA', kind: 'withholding', documents: PURCHASE },
  39: { name: 'IVA RETENIDO PPA', kind: 'withholding', documents: PURCHASE },
  41: { name: 'IVA RETENIDO CONSTRUCCION', kind: 'withholding', documents: PURCHASE },
  44: { name: 'IMPUESTO ADICIONAL Art 37 Letras e, h, I, l', kind: 'additional', rate: 15, documents: SALE },
  45: { name: 'IMPUESTO ADICIONAL Art 37 Letras j', kind: 'additional', rate: 50, documents: SALE },
  46: { name: 'IVA RETENIDO ORO', kind: 'withholding', documents: SALE },
  47: { name: 'IVA RETENIDO CARTONES', kind: 'withholding', documents: PURCHASE },
  48: {
    name: 'IVA RETENIDO FRAMBUESAS',
    kind: 'withholding',
    rate: 14,
    documents: PURCHASE,
    totalWithholdingCode: 481,
  },
  49: { name: 'FACTURA DE COMPRA SIN RETENCIÓN', kind: 'withholding', rate: 0, documents: PURCHASE },
  50: { name: 'IVA de margen de comercialización de instrumentos de prepago', kind: 'margin', documents: SALE },
  51: {
    name: 'Impuesto gas natural comprimido; 1,93 UTM/KM3, Art. 1°, Ley N° 20.052',
    kind: 'specific',
    documents: SALE,
  },
  52: {
    name: 'Impuesto gas licuado de petróleo; 1,40 UTM/M3, Art 1°, Ley N° 20.052',
    kind: 'specific',
    documents: SALE,
  },
  53: {
    name: 'Impuesto Retenido Suplementeros Art 74 N°5 Ley de la Renta',
    kind: 'withholding',
    rate: 0.5,
    documents: SALE,
  },
  271: { name: 'DL 825/74, ART. 42, letra a) Inciso Segundo', kind: 'additional', rate: 18, documents: SALE },
  301: { name: 'IVA RETENIDO LEGUMBRES', kind: 'withholding', documents: PURCHASE },
  321: { name: 'IVA RETENIDO GANADO', kind: 'withholding', documents: PURCHASE },
  331: { name: 'IVA RETENIDO MADERA', kind: 'withholding', documents: PURCHASE },
  341: { name: 'IVA RETENIDO TRIGO', kind: 'withholding', documents: PURCHASE },
  361: { name: 'IVA RETENIDO ARROZ', kind: 'withholding', documents: PURCHASE },
  371: { name: 'IVA RETENIDO HIDROBIOLOGICAS', kind: 'withholding', documents: PURCHASE },
  481: { name: 'IVA RETENIDO FRAMBUESAS', kind: 'withholding', documents: PURCHASE },
} as const satisfies Record<number, AdditionalTax>

/**
 * EN: A code of the table of additional taxes and withholdings (`TipoImp`, `CodImpAdic`).
 * ES: `TipoImp`, `CodImpAdic` — Un código de la tabla de impuestos adicionales y retenciones.
 */
export type AdditionalTaxCode = keyof typeof TAXES

/**
 * EN: The table of additional taxes and withholdings of Formato DTE 2.5, section 4 (pages 51 to 54), by code: its 33
 * rows and the 7 codes of total withholding of its second column, 40 codes. They are the codes `TipoImp` and
 * `CodImpAdic` take ("Código válido de impuesto o retención", field 115 of the header and field 37 of the detail);
 * code 15 is `WITHHOLDING_TAX_CODES.totalVatWithholding`. `ImpAdicDTEType` of `SiiTypes_v10.xsd` admits four more the
 * table does not describe, 16, 40, 54 and 55, which are left out. Code 49 is used today only by the Bolsa de
 * Productos de Chile, which the SII checks.
 * ES: `TipoImp`, `CodImpAdic` — La tabla de impuestos adicionales y retenciones del Formato DTE 2.5, punto 4
 * "Codificación tipos de impuestos y recargos" (páginas 51 a 54), por código: sus 33 filas y los 7 códigos de
 * retención total de su segunda columna, 40 códigos. Son los códigos que llevan `TipoImp` y `CodImpAdic` ("Código
 * válido de impuesto o retención", campo 115 del encabezado y campo 37 del detalle); el código 15 es
 * `WITHHOLDING_TAX_CODES.totalVatWithholding`. El tipo `ImpAdicDTEType` de `SiiTypes_v10.xsd` admite cuatro más que
 * la tabla no describe, 16, 40, 54 y 55, que quedan fuera. El código 49 hoy lo usa solo la Bolsa de Productos de
 * Chile, lo que valida el SII.
 */
export const ADDITIONAL_TAXES: Readonly<Record<AdditionalTaxCode, AdditionalTax>> = TAXES

/**
 * EN: Type guard: true when `value` is a code of `ADDITIONAL_TAXES`.
 * ES: Guarda de tipo: true cuando `value` es un código de `ADDITIONAL_TAXES`.
 */
export const isAdditionalTaxCode = (value: unknown): value is AdditionalTaxCode =>
  typeof value === 'number' && Object.prototype.hasOwnProperty.call(TAXES, value)
