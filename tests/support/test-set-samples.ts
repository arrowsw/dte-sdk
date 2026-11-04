/**
 * Synthetic SII test-set texts, written from the grammar of the phase 5b-1 spec with invented data. No real set text
 * exists in any public source; these reproduce every line shape the parser knows.
 */
export const ATTENTION = '2410011'

export const BASIC_SET_TEXT = `SET BASICO - NUMERO DE ATENCION: ${ATTENTION}
==========================================
CASO ${ATTENTION}-1
==========================================
DOCUMENTO                        FACTURA ELECTRONICA

ITEM                             CANTIDAD   PRECIO UNITARIO
Cajon de manzanas                130        2800
Relleno de pollo                 90         1700

--------------------------------------------------
CASO ${ATTENTION}-2
DOCUMENTO                        FACTURA ELECTRONICA
ITEM                             CANTIDAD   PRECIO UNITARIO   DESCUENTO
Pintura blanca                   40         5000              14%
Servicio exento de instalacion   1          20000

DESCUENTO GLOBAL ITEMES AFECTOS  7%
--------------------------------------------------
CASO ${ATTENTION}-3
DOCUMENTO                        FACTURA ELECTRONICA
ITEM                             CANTIDAD   UNIDAD   PRECIO UNITARIO
Cemento                          10         SACO     8000
--------------------------------------------------
CASO ${ATTENTION}-4
DOCUMENTO                        NOTA DE CREDITO ELECTRONICA
REFERENCIA                       CASO ${ATTENTION}-1
RAZON REFERENCIA                 DEVOLUCION DE MERCADERIAS
ITEM                             CANTIDAD
Cajon de manzanas                62
--------------------------------------------------
CASO ${ATTENTION}-5
DOCUMENTO                        NOTA DE CREDITO ELECTRONICA
REFERENCIA                       CASO ${ATTENTION}-2
RAZON REFERENCIA                 CORRIGE GIRO DEL RECEPTOR
--------------------------------------------------
CASO ${ATTENTION}-6
DOCUMENTO                        NOTA DE CREDITO ELECTRONICA
REFERENCIA                       CASO ${ATTENTION}-3
RAZON REFERENCIA                 ANULA FACTURA ELECTRONICA
--------------------------------------------------
CASO ${ATTENTION}-7
DOCUMENTO                        NOTA DE DEBITO ELECTRONICA
REFERENCIA                       CASO ${ATTENTION}-6
RAZON REFERENCIA                 ANULA NOTA DE CREDITO ELECTRONICA
--------------------------------------------------
CASO ${ATTENTION}-8
DOCUMENTO                        NOTA DE DEBITO ELECTRONICA
REFERENCIA                       CASO ${ATTENTION}-1
RAZON REFERENCIA                 MODIFICA MONTO
ITEM                             VALOR
Cajon de manzanas                3100
--------------------------------------------------
`

export const EXEMPT_SET_TEXT = `SET FACTURA EXENTA - NUMERO DE ATENCION: ${ATTENTION}
CASO ${ATTENTION}-9
DOCUMENTO                        FACTURA NO AFECTA O EXENTA ELECTRONICA
ITEM                             CANTIDAD   PRECIO UNITARIO
Arriendo de oficina              1          450000
Asesoria tributaria              2          80000
--------------------------------------------------
CASO ${ATTENTION}-10
DOCUMENTO                        NOTA DE CREDITO ELECTRONICA
REFERENCIA                       CASO ${ATTENTION}-9
RAZON REFERENCIA                 DEVOLUCION DE MERCADERIAS
--------------------------------------------------
CASO ${ATTENTION}-11
DOCUMENTO                        NOTA DE DEBITO ELECTRONICA
REFERENCIA                       CASO ${ATTENTION}-10
RAZON REFERENCIA                 ANULA NOTA DE CREDITO
--------------------------------------------------
CASO ${ATTENTION}-12
DOCUMENTO                        NOTA DE CREDITO ELECTRONICA
REFERENCIA                       CASO ${ATTENTION}-9
RAZON REFERENCIA                 MODIFICA MONTO
ITEM                             VALOR
Asesoria tributaria              75000
--------------------------------------------------
`

export const GUIDE_SET_TEXT = `SET GUIA DE DESPACHO - NUMERO DE ATENCION: ${ATTENTION}
CASO ${ATTENTION}-13
DOCUMENTO                        GUIA DE DESPACHO
MOTIVO:                          VENTA
TRASLADO POR:                    EMISOR DEL DOCUMENTO AL LOCAL DEL CLIENTE
ITEM                             CANTIDAD   PRECIO UNITARIO
Cajon de manzanas                25         2800
--------------------------------------------------
CASO ${ATTENTION}-14
DOCUMENTO                        GUIA DE DESPACHO
MOTIVO:                          TRASLADO DE MATERIALES ENTRE BODEGAS DE LA EMPRESA
TRASLADO POR:                    CLIENTE
ITEM                             CANTIDAD
Relleno de pollo                 40
--------------------------------------------------
CASO ${ATTENTION}-15
DOCUMENTO                        GUIA DE DESPACHO
MOTIVO:                          VENTA
ITEM                             CANTIDAD   PRECIO UNITARIO
Pintura blanca                   12         5000
--------------------------------------------------
`

export const purchaseSetText = (
  header = 'SET FACTURA DE COMPRA',
): string => `${header} - NUMERO DE ATENCION: ${ATTENTION}
CASO ${ATTENTION}-16
DOCUMENTO                        FACTURA DE COMPRA ELECTRONICA
ITEM                             CANTIDAD   PRECIO UNITARIO
Chatarra de fierro               300        1200
--------------------------------------------------
CASO ${ATTENTION}-17
DOCUMENTO                        NOTA DE CREDITO ELECTRONICA
REFERENCIA                       CASO ${ATTENTION}-16
RAZON REFERENCIA                 DEVOLUCION DE MERCADERIAS
ITEM                             CANTIDAD
Chatarra de fierro               100
--------------------------------------------------
CASO ${ATTENTION}-18
DOCUMENTO                        NOTA DE DEBITO ELECTRONICA
REFERENCIA                       CASO ${ATTENTION}-17
RAZON REFERENCIA                 ANULA NOTA DE CREDITO
--------------------------------------------------
`

export const PURCHASE_BOOK_SET_TEXT = `SET LIBRO DE COMPRAS - NUMERO DE ATENCION: ${ATTENTION}
TIPO DOCUMENTO                   FOLIO
FACTURA                          234
FACTURA DEL GIRO CON DERECHO A CREDITO
                                 MONTO EXENTO   MONTO AFECTO
   7893     3897
FACTURA ELECTRONICA              32
FACTURA DEL GIRO CON DERECHO A CREDITO
          4305
FACTURA                          781
FACTURA CON IVA USO COMUN
          12000
FACTURA ELECTRONICA              1004
ENTREGA GRATUITA DEL PROVEEDOR
          2000
FACTURA DE COMPRA ELECTRONICA    87
COMPRA CON RETENCION TOTAL DEL IVA
          9000
NOTA DE CREDITO                  5
NOTA DE CREDITO POR DESCUENTO FACTURA ELECTRONICA 32
          1000
FACTOR DE PROPORCIONALIDAD IVA: 0.60
`

export const EXEMPT_PURCHASE_BOOK_SET_TEXT = `SET LIBRO DE COMPRAS PARA EXENTOS - NUMERO DE ATENCION: ${ATTENTION}
TIPO DOCUMENTO                   FOLIO     MONTO EXENTO   MONTO AFECTO
==========================================
FACTURA                          120       5000
FACTURA ELECTRONICA              77        3000           10000
FACTURA EXENTA                   9         2500
NOTA DE DEBITO                   3         400
OBS: NOTA DE DEBITO POR INTERESES FACTURA 120
NOTA DE CREDITO ELECTRONICA      14
OBS: NOTA DE CREDITO POR DESCUENTO FACTURA ELECTRONICA 77
FACTOR DE PROPORCIONALIDAD IVA: 0.60
`

export const SALES_BOOK_SET_TEXT = `SET LIBRO DE VENTAS - NUMERO DE ATENCION: ${ATTENTION}
Usar DTEs del SET BASICO
`

export const EXPORT_SET_TEXT = `SET DOCUMENTOS DE EXPORTACION (1) - NUMERO DE ATENCION: ${ATTENTION}
CASO ${ATTENTION}-19
DOCUMENTO                        FACTURA DE EXPORTACION ELECTRONICA
MONEDA DE LA OPERACION:          DOLAR USA
FORMA DE PAGO EXPORTACION:       ANTICIPO
MODALIDAD DE VENTA:              A FIRME
CLAUSULA DE VENTA:               CIF
TOTAL CLAUSULA DE VENTA:         1500.50
VIA DE TRANSPORTE:               MARITIMA
PUERTO DE EMBARQUE:              VALPARAISO
PUERTO DE DESEMBARQUE:           ROTTERDAM
TIPO DE BULTO:                   PALLET
TOTAL BULTOS:                    4
FLETE:                           200
SEGURO:                          50
PAIS RECEPTOR:                   HOLANDA
COMISIONES EN EL EXTRANJERO:     5%
ITEM                             CANTIDAD   PRECIO UNITARIO
Vino tinto reserva               100        12
--------------------------------------------------
`

/** The whole download, every set, with the corrupted accent the portal sometimes sends and some junk lines. */
export const FULL_SET_TEXT = [
  'Postulacion Factura Electronica',
  '',
  BASIC_SET_TEXT.replace('NUMERO DE ATENCION', 'NUMERO DE ATENCIÓN'),
  GUIDE_SET_TEXT,
  EXEMPT_SET_TEXT,
  purchaseSetText('SET CASO GENERAL FACTURA COMPRA'),
  SALES_BOOK_SET_TEXT,
  PURCHASE_BOOK_SET_TEXT,
  EXEMPT_PURCHASE_BOOK_SET_TEXT,
  EXPORT_SET_TEXT,
  'Fin del set',
].join('\n')
