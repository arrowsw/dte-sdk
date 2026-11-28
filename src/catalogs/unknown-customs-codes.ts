import type { Document } from '../model/document'
import {
  CUSTOMS_COUNTRIES,
  CUSTOMS_PACKAGE_TYPES,
  CUSTOMS_PAYMENT_TERMS,
  CUSTOMS_PORTS,
  CUSTOMS_SALE_CLAUSES,
  CUSTOMS_SALE_MODES,
  CUSTOMS_TRANSPORT_ROUTES,
  CUSTOMS_UNITS,
  type CustomsEntry,
} from './customs'

/**
 * EN: The name of a customs table, as `unknownCustomsCodes` reports which one a code was held to: `countries`,
 * `ports`, `transportRoutes`, `saleClauses`, `paymentTerms`, `packageTypes`, `units` or `saleModes`, after
 * `CUSTOMS_COUNTRIES` and the rest.
 * ES: El nombre de una tabla de Aduanas, con que `unknownCustomsCodes` dice a cuál se comparó un código: `countries`,
 * `ports`, `transportRoutes`, `saleClauses`, `paymentTerms`, `packageTypes`, `units` o `saleModes`, según
 * `CUSTOMS_COUNTRIES` y las demás.
 */
export type CustomsTableName =
  | 'countries'
  | 'ports'
  | 'transportRoutes'
  | 'saleClauses'
  | 'paymentTerms'
  | 'packageTypes'
  | 'units'
  | 'saleModes'

/**
 * EN: A code of a document that its customs table does not have.
 * ES: Un código de un documento que su tabla de Aduanas no tiene.
 */
export type UnknownCustomsCode = {
  /** EN: The field that carries the code, named as `createDocument` names it in an error: `transport.customs.loadingPort`, `transport.customs.packages[1].code`, `receiver.foreign.nationality`, `options.exportPaymentTerms`. ES: El campo que lleva el código, nombrado como lo nombra `createDocument` en un error: `transport.customs.loadingPort`, `transport.customs.packages[1].code`, `receiver.foreign.nationality`, `options.exportPaymentTerms`. */
  readonly field: string
  /** EN: The code the document carries: a number, or the text as it is for a nationality or a payment form that is not made of digits. ES: El código que lleva el documento: un número, o el texto tal cual para una nacionalidad o una forma de pago que no son solo dígitos. */
  readonly code: number | string
  /** EN: The table the code was held to. ES: La tabla a la que se comparó el código. */
  readonly table: CustomsTableName
}

const TABLES: Readonly<Record<CustomsTableName, readonly CustomsEntry[]>> = {
  countries: CUSTOMS_COUNTRIES,
  ports: CUSTOMS_PORTS,
  transportRoutes: CUSTOMS_TRANSPORT_ROUTES,
  saleClauses: CUSTOMS_SALE_CLAUSES,
  paymentTerms: CUSTOMS_PAYMENT_TERMS,
  packageTypes: CUSTOMS_PACKAGE_TYPES,
  units: CUSTOMS_UNITS,
  saleModes: CUSTOMS_SALE_MODES,
}

// A code the document writes as text (a nationality, an export payment form) is a number when it is made of digits;
// any other text is no code of a table, and is reported as it is.
const fromText = (text: string | undefined): number | string | undefined =>
  text !== undefined && /^\d+$/.test(text) ? Number(text) : text

/**
 * EN: The codes of an export document that the customs tables do not have, in the order of the fields: sale modality
 * (`CodModVenta`), sale clause (`CodClauVenta`), transport route (`CodViaTransp`), ports of loading and unloading
 * (`CodPtoEmbarque`, `CodPtoDesemb`), units of the tare, the gross weight and the net weight (`CodUnidMedTara`,
 * `CodUnidPesoBruto`, `CodUnidPesoNeto`), the type of each package (`CodTpoBultos`, in their order), country of the
 * receiver and of destination (`CodPaisRecep`, `CodPaisDestin`), nationality of the foreign receiver (`Nacionalidad`)
 * and export payment terms (`FmaPagExp`). `createDocument` only checks the range of each code and writes it as given;
 * this holds them to the tables, which live in `dte-sdk/catalogs` so that the root entry does not carry them. It asks
 * only whether the table has the code, not whether it fits another (a port of another country, a unit that is no
 * weight). An absent field, and a document with no customs data, give nothing. It never throws and never changes the
 * document.
 * ES: Los códigos de un documento de exportación que las tablas de Aduanas no tienen, en el orden de los campos:
 * modalidad de venta (`CodModVenta`), cláusula de venta (`CodClauVenta`), vía de transporte (`CodViaTransp`), puertos
 * de embarque y desembarque (`CodPtoEmbarque`, `CodPtoDesemb`), unidades de la tara, del peso bruto y del peso neto
 * (`CodUnidMedTara`, `CodUnidPesoBruto`, `CodUnidPesoNeto`), el tipo de cada bulto (`CodTpoBultos`, en su orden), país
 * del receptor y de destino (`CodPaisRecep`, `CodPaisDestin`), nacionalidad del receptor extranjero (`Nacionalidad`) y
 * forma de pago de exportación (`FmaPagExp`). `createDocument` solo revisa el rango de cada código y lo escribe tal
 * como viene; esto los compara con las tablas, que viven en `dte-sdk/catalogs` para que la entrada raíz no las cargue.
 * Solo pregunta si la tabla tiene el código, no si calza con otro (un puerto de otro país, una unidad que no es de
 * peso). Un campo ausente, y un documento sin datos de Aduana, no dan nada. Nunca lanza y nunca cambia el documento.
 * @param document EN: a document as `createDocument` returns it. ES: un documento tal como lo entrega `createDocument`.
 * @returns EN: one entry per code its table does not have; empty when there is none. ES: una entrada por cada código que su tabla no tiene; vacío si no hay ninguno.
 */
export const unknownCustomsCodes = (document: Document): readonly UnknownCustomsCode[] => {
  const { transport, receiver, options } = document.header
  const customs = transport?.customs
  const base = 'transport.customs'
  const unknown: UnknownCustomsCode[] = []
  const ask = (field: string, code: number | string | undefined, table: CustomsTableName): void => {
    if (code !== undefined && !TABLES[table].some((entry) => entry.code === code)) unknown.push({ field, code, table })
  }
  ask(`${base}.saleModality`, customs?.saleModality, 'saleModes')
  ask(`${base}.saleClause`, customs?.saleClause, 'saleClauses')
  ask(`${base}.transportRoute`, customs?.transportRoute, 'transportRoutes')
  ask(`${base}.loadingPort`, customs?.loadingPort, 'ports')
  ask(`${base}.unloadingPort`, customs?.unloadingPort, 'ports')
  ask(`${base}.tareUnit`, customs?.tareUnit, 'units')
  ask(`${base}.grossWeightUnit`, customs?.grossWeightUnit, 'units')
  ask(`${base}.netWeightUnit`, customs?.netWeightUnit, 'units')
  customs?.packages?.forEach((pack, index) => ask(`${base}.packages[${index}].code`, pack.code, 'packageTypes'))
  ask(`${base}.receiverCountry`, customs?.receiverCountry, 'countries')
  ask(`${base}.destinationCountry`, customs?.destinationCountry, 'countries')
  ask('receiver.foreign.nationality', fromText(receiver.foreign?.nationality), 'countries')
  ask('options.exportPaymentTerms', fromText(options.exportPaymentTerms), 'paymentTerms')
  return unknown
}
