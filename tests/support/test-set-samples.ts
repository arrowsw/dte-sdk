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
Servicio EXENTO de instalacion   1          20000

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
  'Fin del set',
].join('\n')

/** The attention numbers of the two synthetic export sets: each set has its own and goes in its own envelope. */
export const EXPORT_ATTENTION_1 = '2410021'
export const EXPORT_ATTENTION_2 = '2410022'

/**
 * The two export sets (110, 111, 112), written by hand. Nobody here has the literal text of an export set: this is the
 * best reconstruction of the six cases of the two sets as field behaviour issues them, their contents kept and their
 * wording guessed. What is guessed is the wording of the labels (the units of tare and weights, the country line, the
 * customs document a case names, the line surcharge, the column headers) and the layout; the names of currencies,
 * ports, countries, clauses, routes, modes, payment terms, units and package types are those of the SII's and the
 * customs service's tables. The amounts are the cases' own, so the six totals field behaviour arrives at are known:
 * 112517.50, 36411 and 36411 in `FRANCO SZ`, and 103.4 and 233792.38 in `YEN` and 281 in `DOLAR USA`; the second of the
 * second set writes the 5 % discount of its first line as a whole 10049, where its share is 10049.2. `(**)` marks the
 * freight and the insurance in the text; the run writes both as global surcharges whether the mark is there or not.
 */
export const EXPORT_SET_TEXT = [
  `SET DOCUMENTOS DE EXPORTACION (1) - NUMERO DE ATENCION: ${EXPORT_ATTENTION_1}`,
  '==========================================',
  `CASO ${EXPORT_ATTENTION_1}-1`,
  '==========================================',
  'DOCUMENTO                        FACTURA DE EXPORTACION ELECTRONICA',
  'MONEDA DE LA OPERACION:          FRANCO SZ',
  'FORMA DE PAGO EXPORTACION:       ANTICIPO',
  'MODALIDAD DE VENTA:              EN CONSIGNACION LIBRE',
  'CLAUSULA DE VENTA:               S/CL',
  'TOTAL CLAUSULA DE VENTA:         3523.59',
  'VIA DE TRANSPORTE:               FERROVIARIO',
  'PUERTO DE EMBARQUE:              PUERTO MONTT',
  'PUERTO DE DESEMBARQUE:           NAPOLES',
  'UNIDAD DE MEDIDA DE TARA:        KN',
  'UNIDAD PESO BRUTO:               PAR',
  'UNIDAD PESO NETO:                PAR',
  'CALCULE LOS VALORES DE TARA, PESO BRUTO Y PESO NETO',
  'TIPO DE BULTO:                   PLANCHAS',
  'TOTAL BULTOS:                    69',
  'FLETE (**):                      2069.28',
  'SEGURO (**):                     1215.22',
  'PAIS RECEPTOR Y PAIS DESTINO:    ITALIA',
  'DOCUMENTO DE REFERENCIA:         MIC/DTA',
  '',
  'ITEM                             CANTIDAD   UNIDAD MEDIDA   PRECIO UNITARIO',
  'CHATARRA DE ALUMINIO             687        PAR             159',
  '',
  '(**) INFORME ADEMAS EL FLETE Y EL SEGURO COMO RECARGOS GLOBALES',
  '--------------------------------------------------',
  `CASO ${EXPORT_ATTENTION_1}-2`,
  '==========================================',
  'DOCUMENTO                        NOTA DE CREDITO DE EXPORTACION ELECTRONICA',
  `REFERENCIA                       CASO ${EXPORT_ATTENTION_1}-1`,
  'RAZON REFERENCIA                 DEVOLUCION DE MERCADERIA',
  '',
  'ITEM                             CANTIDAD',
  'CHATARRA DE ALUMINIO             229',
  '--------------------------------------------------',
  `CASO ${EXPORT_ATTENTION_1}-3`,
  '==========================================',
  'DOCUMENTO                        NOTA DE DEBITO DE EXPORTACION ELECTRONICA',
  `REFERENCIA                       CASO ${EXPORT_ATTENTION_1}-2`,
  'RAZON REFERENCIA                 ANULA NOTA DE CREDITO',
  '--------------------------------------------------',
  '',
  `SET DOCUMENTOS DE EXPORTACION (2) - NUMERO DE ATENCION: ${EXPORT_ATTENTION_2}`,
  '==========================================',
  `CASO ${EXPORT_ATTENTION_2}-1`,
  '==========================================',
  'DOCUMENTO                        FACTURA DE EXPORTACION ELECTRONICA',
  'MONEDA DE LA OPERACION:          YEN',
  'FORMA DE PAGO EXPORTACION:       COB1',
  'CLAUSULA DE VENTA:               CFR',
  'VIA DE TRANSPORTE:               OLEODUCTOS, GASODUCTOS',
  'PUERTO DE EMBARQUE:              TALCAHUANO',
  'PUERTO DE DESEMBARQUE:           MARACAIBO',
  'PAIS RECEPTOR Y PAIS DESTINO:    VENEZUELA',
  'DOCUMENTO DE REFERENCIA:         RESOLUCION SNA',
  '',
  'ITEM                                     VALOR LINEA',
  'ASESORIAS Y PROYECTOS PROFESIONALES      94',
  '%10 RECARGO EN LA LINEA DE ITEM POR COMISIONES EN EL EXTERIOR',
  '--------------------------------------------------',
  `CASO ${EXPORT_ATTENTION_2}-2`,
  '==========================================',
  'DOCUMENTO                        FACTURA DE EXPORTACION ELECTRONICA',
  'MONEDA DE LA OPERACION:          YEN',
  'FORMA DE PAGO EXPORTACION:       COB1',
  'MODALIDAD DE VENTA:              SIN PAGO',
  'CLAUSULA DE VENTA:               CFR',
  'TOTAL CLAUSULA DE VENTA:         5613.15',
  'VIA DE TRANSPORTE:               OLEODUCTOS, GASODUCTOS',
  'PUERTO DE EMBARQUE:              TALCAHUANO',
  'PUERTO DE DESEMBARQUE:           MARACAIBO',
  'UNIDAD DE MEDIDA DE TARA:        MCUB',
  'UNIDAD PESO BRUTO:               MCUB',
  'UNIDAD PESO NETO:                MCUB',
  'CALCULE LOS VALORES DE TARA, PESO BRUTO Y PESO NETO',
  'TIPO DE BULTO:                   TRONCOS',
  'TOTAL BULTOS:                    104',
  'FLETE (**):                      5251.25',
  'SEGURO (**):                     4912.68',
  'COMISIONES EN EL EXTRANJERO:     11% DEL TOTAL CLAUSULA DE VENTA',
  'PAIS RECEPTOR Y PAIS DESTINO:    VENEZUELA',
  'DOCUMENTO DE REFERENCIA:         DUS',
  'DOCUMENTO DE REFERENCIA:         AWB',
  '',
  'ITEM                                                      CANTIDAD   UNIDAD MEDIDA   PRECIO UNITARIO   DESCUENTO',
  'CAJAS CIRUELAS TIERNIZADAS SIN CAROZO CALIBRE 60/70       1036       KN              194               5%',
  'CAJAS DE PASAS DE UVA FLAME MORENA SIN SEMILLA MEDIANAS   243        KN              132',
  '',
  '(**) INFORME ADEMAS EL FLETE Y EL SEGURO COMO RECARGOS GLOBALES',
  '--------------------------------------------------',
  `CASO ${EXPORT_ATTENTION_2}-3`,
  '==========================================',
  'DOCUMENTO                        FACTURA DE EXPORTACION ELECTRONICA',
  'MONEDA DE LA OPERACION:          DOLAR USA',
  'PAIS RECEPTOR Y PAIS DESTINO:    VENEZUELA',
  'DOCUMENTO DE REFERENCIA:         RESOLUCION SNA',
  '',
  'ITEM                             VALOR LINEA',
  'ALOJAMIENTO HABITACIONES         281',
  '--------------------------------------------------',
].join('\n')

/** The attention number of the synthetic settlement set: the SII numbers each set apart. */
export const SETTLEMENT_ATTENTION = '2410018'

/**
 * A synthetic settlement set (43) with invented amounts. No real set is public: the SII hands one out per company. The
 * line shapes follow the field: tab-separated columns, the accents of the set, negative line totals, a commissions
 * table on two of the cases, and a commission pair whose VAT rounds differently line by line and on their total.
 */
export const SETTLEMENT_SET_TEXT = [
  `SET BASICO LIQUIDACIONES - NUMERO DE ATENCION: ${SETTLEMENT_ATTENTION}`,
  '',
  `CASO ${SETTLEMENT_ATTENTION}-1`,
  '==============',
  'DOCUMENTO\tLIQUIDACION FACTURA ELECTRONICA',
  '',
  'ITEM\t\t\t\tCANTIDAD\tTOTAL LINEA',
  'NETO FACTURAS\t\t\t      6\t\t 241300',
  'EXENTO FACTURAS\t\t\t      2\t\t  38750',
  'NETO FACTURAS ELECTRONICAS \t     19\t\t  57210',
  'EXENTO FACTURAS ELECTRONICAS \t      7\t\t  21480',
  '',
  '',
  `CASO ${SETTLEMENT_ATTENTION}-2`,
  '==============',
  'DOCUMENTO\tLIQUIDACION FACTURA ELECTRONICA',
  '',
  'ITEM\t\t\t\t\tCANTIDAD\tTOTAL LINEA',
  'NETO FACTURA ELECTRÓNICA 812\t\t      1\t\t  27640',
  'EXENTO FACTURA ELECTRÓNICA 812\t\t      1\t\t   9315',
  'NETO NOTA DE CRÉDITO 77\t\t      1\t\t -15220',
  'EXENTO NOTA DE CRÉDITO 77\t\t      1\t\t  -4310',
  'BOLETAS\t\t\t\t\t   1430\t\t 982560',
  '',
  '',
  `CASO ${SETTLEMENT_ATTENTION}-3`,
  '==============',
  'DOCUMENTO\tLIQUIDACION FACTURA ELECTRONICA',
  '',
  'ITEM\t\t\t\t\t\tCANTIDAD\tTOTAL LINEA',
  'NETO FACTURA ELECTRÓNICA 2093\t\t\t      1\t\t 118470',
  'NETO FACTURAS ELECTRÓNICAS\t\t\t     41\t\t  63905',
  'EXENTO FACTURAS ELECTRÓNICAS\t\t\t      9\t\t  17260',
  '',
  'COMISIONES Y OTROS CARGOS\tTOTAL LINEA',
  'NETO COMISIÓN FIJA\t\t   1250',
  'NETO COMISIÓN VARIABLE\t\t   3485',
  '',
  '',
  `CASO ${SETTLEMENT_ATTENTION}-4`,
  '==============',
  'DOCUMENTO\tLIQUIDACION FACTURA ELECTRONICA',
  '',
  'ITEM\t\t\t\t\t\tCANTIDAD\tTOTAL LINEA',
  'NETO ANTICIPO FACTURACIÓN\t\t\t     41\t\t 400000',
  'NETO FACTURAS\t\t\t\t\t      9\t\t  77120',
  'EXENTO FACTURAS\t\t\t\t\t     11\t\t 152300',
  'NETO FACTURAS ELECTRÓNICAS\t\t\t      8\t\t  26450',
  'EXENTO FACTURAS ELECTRÓNICAS\t\t\t      3\t\t 288900',
  'NETO NOTA DE CRÉDITO 655\t\t\t      1\t\t -22870',
  'NETO LIQUIDACIÓN FACTURA ELECTRÓNICA 3108\t      1\t\t -38615',
  'EXENTO LIQUIDACIÓN FACTURA ELECTRÓNICA 3108\t      1\t\t -31240',
  '',
  'COMISIONES Y OTROS CARGOS\t\t\t\tTOTAL LINEA',
  'NETO COMISIÓN CONSIGNACIÓN\t\t\t\t    845',
  'NETO COMISIONES LIQUIDACIÓN FACTURA ELECTRÓNICA 3108\t  -1733',
  '',
  '-'.repeat(80),
].join('\n')
