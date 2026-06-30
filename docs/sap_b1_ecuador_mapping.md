# SAP Business One Ecuador
# Mapeo definitivo de UDF para ReportForge

Versión: 2026-06-30 (Base Producción SAP validada)
Estado: Validado contra base de producción

---

## Nota de opcionalidad

La presencia de varios UDF depende de la configuración de la serie y del flujo del documento. ReportForge debe tratar estos campos como opcionales y aceptar valores NULL.

---

# 1. FACTURAS
Tabla principal: OINV

## Información FE

| Campo ReportForge | Campo SAP |
|-------------------|-----------|
| tipo_comprobante | U_EXX_FE_TIPCOM |
| tipo_emision | U_EXX_FE_TIPEMI |
| ambiente | U_EXX_FE_TIPAMB |
| estado_fe | U_EXX_FE_Estado |
| clave_acceso | U_EXX_FE_ClaAcc |
| fecha_autorizacion | U_EXX_FE_FECAUT |
| codigo_error | U_EXX_FE_CODERR |
| descripcion_error | U_EXX_FE_DESERR |
| pdf_generado | U_EXX_FE_PdfCreado |
| mail_enviado | U_EXX_FE_MailEnviado |

---

## Datos Ecuador

| Campo ReportForge | Campo SAP |
|-------------------|-----------|
| establecimiento | U_SER_EST |
| punto_emision | U_SER_PE |
| correlativo | U_CORRELATIVO |

---

## Factura relacionada

| Campo ReportForge | Campo SAP |
|-------------------|-----------|
| establecimiento_relacionado | U_SER_EST_FR |
| punto_emision_relacionado | U_SER_PEFR |
| autorizacion_relacionada | U_NUM_AUT_FR |
| factura_relacionada | U_NUM_FAC_REL |
| fecha_emision_relacionada | U_fecha_emi_doc_rel |

---

## Guía asociada (FV_002)

Nota: Estos campos solo aplican a la serie FV_002.
En FVE_001 la guía utiliza U_NUM_AUTOR.

| Campo ReportForge | Campo SAP |
|-------------------|-----------|
| autorizacion_guia | U_NUM_AUT_GUIA_FV2 |
| numero_guia | U_NUM_GUIA_REMISION_FV2 |

---

## Traslado

| Campo ReportForge | Campo SAP |
|-------------------|-----------|
| punto_partida | U_PUNTO_PART |
| transporte | U_TRANSPORTE |
| transportista | U_TRANSPORTISTA |
| fecha_inicio | U_FEC_INI_TRAS |
| fecha_fin | U_FEC_FIN_TRAS |
| motivo | U_MOT_TRASLADO |
| documento_declarable | U_DOC_DECLARABLE |

---

# 2. GUÍAS ELECTRÓNICAS

Series soportadas:

- FVE_001 → utiliza información de ODLN (guía) y OINV (factura electrónica relacionada), según el flujo del documento.
- FV_002 → datos almacenados en OINV (campos FV2)

## Serie FVE_001 (ODLN)

| Campo ReportForge | Campo SAP |
|-------------------|-----------|
| establecimiento | U_SER_EST |
| punto_emision | U_SER_PE |
| autorizacion_guia | U_NUM_AUTOR |

---

## Serie FV_002 (OINV / campos FV2)

La guía electrónica FV_002 toma sus datos desde OINV. Su modelo incluye los campos propios de guía, la factura electrónica relacionada y los datos de traslado.

| Campo ReportForge | Campo SAP |
|-------------------|-----------|
| autorizacion_guia | U_NUM_AUT_GUIA_FV2 |
| numero_guia | U_NUM_GUIA_REMISION_FV2 |
| establecimiento_factura | U_SER_EST_FR |
| punto_emision_factura | U_SER_PEFR |
| autorizacion_factura | U_NUM_AUT_FR |
| numero_factura | U_NUM_FAC_REL |
| fecha_emision_factura | U_fecha_emi_doc_rel |
| punto_partida | U_PUNTO_PART |
| transporte | U_TRANSPORTE |
| transportista | U_TRANSPORTISTA |
| fecha_inicio | U_FEC_INI_TRAS |
| fecha_fin | U_FEC_FIN_TRAS |
| motivo | U_MOT_TRASLADO |
| documento_declarable | U_DOC_DECLARABLE |

---

## Punto de llegada (CRD1)

La dirección de entrega debe resolverse desde CRD1 según los criterios documentados en la sección **6. DIRECCIÓN DE ENTREGA**.

---

# 3. CLIENTE
Tabla OCRD

| Campo ReportForge | Campo SAP |
|-------------------|-----------|
| tipo_identificacion | U_TIPO_ID |
| forma_pago | U_Exx_Forma_Pago |
| plazo | U_Exx_Plazo |

---

# 4. DETALLE
Tabla INV1

| Campo ReportForge | Campo SAP |
|-------------------|-----------|
| descripcion_lineal | U_DescLineal |
| ice_porcentaje | U_EXX_FE_PorICEVta |
| ice_valor | U_EXX_FE_ValICEVta |

---

# 5. EMPRESA
Tabla OADM

| Campo ReportForge | Campo SAP |
|-------------------|-----------|
| razon_social | CompnyName |
| nombre_comercial | AliasName |
| direccion_matriz | CompnyAddr |
| pais | Country |
| telefono | Phone1 |
| email | E_Mail |
| RUC | TaxIdNum *(confirmado en producción)* |

Nota:
TaxIdNum corresponde al RUC de la empresa (OADM).
No debe confundirse con LicTradNum de OCRD, que corresponde al RUC/identificación del socio de negocio.

---

# 6. DIRECCIÓN DE ENTREGA
Tabla CRD1

| Campo ReportForge | Campo SAP |
|-------------------|-----------|
| direccion | Address |
| calle | Street |
| ciudad | City |
| provincia | State |
| pais | Country |

Seleccionar preferentemente:

CardCode = documento.CardCode

Address = ShipToCode

AdresType='S'

---

# Documentos soportados

✅ Factura FVE_001
✅ Factura FV_002
✅ Guía electrónica FVE_001
✅ Guía electrónica FV_002

---

## Alcance

Este documento no pretende listar todos los UDF existentes en SAP Business One.

Documenta únicamente los UDF y campos estándar utilizados por ReportForge para construir el modelo de datos de:

- Factura FVE_001
- Factura FV_002
- Guía electrónica FVE_001
- Guía electrónica FV_002

---

# Estado

Campos confirmados mediante consultas SQL sobre una base SAP Business One de producción.

Todos los UDF utilizados por ReportForge para Factura FVE_001, Factura FV_002, Guía electrónica FVE_001 y Guía electrónica FV_002 se encuentran documentados en este archivo.

Cualquier nuevo campo requerido deberá validarse previamente contra SAP antes de incorporarse al modelo de datos de ReportForge.

---

## Fuente de validación

Todos los campos de este documento fueron verificados mediante:

- Consultas SQL sobre SAP Business One (producción).
- Validación de INFORMATION_SCHEMA.COLUMNS.
- Verificación de CUFD (metadatos de UDF).
- Pruebas reales con las series:
  - Factura FVE_001
  - Factura FV_002
  - Guía electrónica FVE_001
  - Guía electrónica FV_002

