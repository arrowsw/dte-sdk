/**
 * EN: dte-sdk/catalogs entry: the large code tables, apart from the root so that only who imports them pays for them.
 * It holds the SII's business activities (`Acteco`) and the customs tables an export document takes its codes from
 * (countries, ports, package types and the rest of Anexo 51 of the Compendio de Normas Aduaneras); the small tables
 * (document types, additional taxes, payment media, reference documents) stay in the root entry. It runs anywhere and
 * never mentions a `node:` module.
 * ES: Entrada dte-sdk/catalogs: las tablas de códigos grandes, aparte de la raíz para que las pague solo quien las
 * importa. Trae las actividades económicas del SII (`Acteco`) y las tablas de Aduanas de las que un documento de
 * exportación toma sus códigos (países, puertos, tipos de bulto y el resto del Anexo 51 del Compendio de Normas
 * Aduaneras); las tablas chicas (tipos de documento, impuestos adicionales, medios de pago, documentos de referencia)
 * siguen en la entrada raíz. Corre en cualquier parte y nunca menciona un módulo `node:`.
 */
export { BUSINESS_ACTIVITIES, businessActivity, isBusinessActivityCode } from './activities'
export type { ActivityTaxCategory, ActivityVat, BusinessActivity } from './activities'
export {
  CUSTOMS_COUNTRIES,
  CUSTOMS_PACKAGE_TYPES,
  CUSTOMS_PAYMENT_TERMS,
  CUSTOMS_PORTS,
  CUSTOMS_SALE_CLAUSES,
  CUSTOMS_SALE_MODES,
  CUSTOMS_TRANSPORT_ROUTES,
  CUSTOMS_UNITS,
  customsCode,
  customsName,
} from './customs'
export type { CustomsEntry } from './customs'
export { unknownCustomsCodes } from './unknown-customs-codes'
export type { CustomsTableName, UnknownCustomsCode } from './unknown-customs-codes'
