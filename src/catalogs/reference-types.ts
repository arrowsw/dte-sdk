const TYPES = {
  30: 'Factura',
  32: 'Factura de venta bienes y servicios no afectos o exentos de IVA',
  33: 'Factura Electrónica',
  34: 'Factura No Afecta o Exenta Electrónica',
  35: 'Boleta',
  38: 'Boleta exenta',
  39: 'Boleta Electrónica',
  40: 'Liquidación Factura',
  41: 'Boleta Exenta Electrónica',
  43: 'Liquidación-Factura Electrónica',
  45: 'Factura de compra',
  46: 'Factura de Compra Electrónica',
  48: 'Comprobante de pago electrónico',
  50: 'Guía de Despacho',
  52: 'Guía de Despacho Electrónica',
  55: 'Nota de débito',
  56: 'Nota de Débito Electrónica',
  60: 'Nota de crédito',
  61: 'Nota de Crédito Electrónica',
  103: 'Liquidación',
  110: 'Factura de Exportación Electrónica',
  111: 'Nota de Débito de Exportación Electrónica',
  112: 'Nota de Crédito de Exportación Electrónica',
  801: 'Orden de Compra',
  802: 'Nota de pedido',
  803: 'Contrato',
  804: 'Resolución',
  805: 'Proceso ChileCompra',
  806: 'Ficha ChileCompra',
  807: 'DUS',
  808: 'B/L (Conocimiento de embarque)',
  809: 'AWB (Air Waybill)',
  810: 'MIC/DTA',
  811: 'Carta de Porte',
  812: 'Resolución del SNA donde califica Servicios de Exportación',
  813: 'Pasaporte',
  814: 'Certificado de Depósito Bolsa Prod. Chile',
  815: 'Vale de Prenda Bolsa Prod. Chile',
  820: 'Código de Inscripción en el Registro de Acuerdos con Plazo de Pago Excepcional',
  821: 'Geo Referencia Predio',
  822: 'ROL Avalúo Predio',
  823: 'Plan Manejo – CONAF',
} as const

/**
 * EN: A numeric code of a document a reference can name (`Referencia/TpoDocRef`).
 * ES: `TpoDocRef` — Un código numérico de documento que puede nombrar una referencia.
 */
export type ReferenceDocumentType = keyof typeof TYPES

/**
 * EN: The documents a reference can name, by code, each with its name as the SII writes it: the tax documents, paper
 * and electronic, and the other documents of codes 801 to 823. Formato DTE 2.5, field 2 of "Información de
 * Referencia" (`TpoDocRef`, page 45), lists 39 of them; codes 821 to 823 were added on 2021-09-14 by its change log
 * (page 3), which the field's list does not repeat. A numeric `TpoDocRef` must be one of these; an alphabetic one
 * (`SET` among them) is not checked, and names any other document.
 * ES: `TpoDocRef` — Los documentos que puede nombrar una referencia, por código, cada uno con su nombre tal como
 * lo escribe el SII: los documentos tributarios, en papel y electrónicos, y los otros documentos de los códigos 801 a
 * 823. El Formato DTE 2.5, campo 2 de la información de referencia ("Tipo Documento de referencia", página 45), lista
 * 39; los códigos 821 a 823 los agregó su bitácora de cambios el 14-09-2021 (página 3), y la lista del campo no los
 * repite. Un `TpoDocRef` numérico debe ser uno de estos; uno alfabético (`SET` entre ellos) no se valida y nombra
 * cualquier otro documento.
 */
export const REFERENCE_DOCUMENT_TYPES: Readonly<Record<ReferenceDocumentType, string>> = TYPES

/**
 * EN: Type guard: true when `value` is a code of `REFERENCE_DOCUMENT_TYPES`.
 * ES: Guarda de tipo: true cuando `value` es un código de `REFERENCE_DOCUMENT_TYPES`.
 */
export const isReferenceDocumentType = (value: unknown): value is ReferenceDocumentType =>
  typeof value === 'number' && Object.prototype.hasOwnProperty.call(TYPES, value)

/**
 * EN: The documents a receipt's reference can name: receipts (39, 41), dispatch guides (50, 52) and documents 801 to
 * 806 and 813 (Formato Boletas Electrónicas 4.2, field 2 of "Datos de Referencia", page 18).
 * ES: `TpoDocRef` — Los documentos que puede nombrar una referencia de boleta: boletas (39, 41), guías de despacho
 * (50, 52) y los documentos 801 a 806 y 813 (Formato Boletas Electrónicas 4.2, campo 2 de los datos de referencia,
 * página 18).
 */
export const RECEIPT_REFERENCE_DOCUMENT_TYPES = [
  39, 41, 50, 52, 801, 802, 803, 804, 805, 806, 813,
] as const satisfies readonly ReferenceDocumentType[]

/**
 * EN: A numeric code of a document a receipt's reference can name.
 * ES: `TpoDocRef` — Un código numérico de documento que puede nombrar una referencia de boleta.
 */
export type ReceiptReferenceDocumentType = (typeof RECEIPT_REFERENCE_DOCUMENT_TYPES)[number]

/**
 * EN: Type guard: true when `value` is a code of `RECEIPT_REFERENCE_DOCUMENT_TYPES`.
 * ES: Guarda de tipo: true cuando `value` es un código de `RECEIPT_REFERENCE_DOCUMENT_TYPES`.
 */
export const isReceiptReferenceDocumentType = (value: unknown): value is ReceiptReferenceDocumentType =>
  (RECEIPT_REFERENCE_DOCUMENT_TYPES as readonly unknown[]).includes(value)
