/**
 * EN: dte-sdk/catalogs entry: the SII's large code tables, apart from the root so that only who imports them pays for
 * them. Today it holds the business activities (`Acteco`); the small tables (document types, additional taxes,
 * payment media, reference documents) stay in the root entry. It runs anywhere and never mentions a `node:` module.
 * ES: Entrada dte-sdk/catalogs: las tablas de códigos grandes del SII, aparte de la raíz para que las pague solo quien
 * las importa. Hoy trae las actividades económicas (`Acteco`); las tablas chicas (tipos de documento, impuestos
 * adicionales, medios de pago, documentos de referencia) siguen en la entrada raíz. Corre en cualquier parte y nunca
 * menciona un módulo `node:`.
 */
export { BUSINESS_ACTIVITIES, businessActivity, isBusinessActivityCode } from './activities'
export type { ActivityTaxCategory, ActivityVat, BusinessActivity } from './activities'
