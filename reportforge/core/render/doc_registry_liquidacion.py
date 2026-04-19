from __future__ import annotations

from .doc_registry_shared import _el

#  4. LIQUIDACIÓN DE COMPRAS
# ═════════════════════════════════════════════════════════════════
LIQUIDACION_FIELD_TREE = {
    "empresa":   {"label": "empresa (Emisor)", "icon": "🏢", "fields": [
        ("empresa.razon_social",    "razon_social",    "string"),
        ("empresa.ruc",             "ruc",             "string"),
        ("empresa.direccion_matriz","direccion_matriz","string"),
    ]},
    "proveedor": {"label": "proveedor (Vendedor)", "icon": "👤", "fields": [
        ("proveedor.razon_social",   "razon_social",   "string"),
        ("proveedor.identificacion", "identificacion", "string"),
        ("proveedor.direccion",      "direccion",      "string"),
        ("proveedor.email",          "email",          "string"),
    ]},
    "fiscal":    {"label": "fiscal", "icon": "🧾", "fields": [
        ("fiscal.numero_documento",   "numero_documento",   "string"),
        ("fiscal.clave_acceso",       "clave_acceso",       "string"),
        ("fiscal.fecha_autorizacion", "fecha_autorizacion", "date"),
        ("fiscal.ambiente",           "ambiente",           "string"),
    ]},
    "pago_liq":  {"label": "pago", "icon": "💳", "fields": [
        ("pago.forma_pago_fe", "forma_pago_fe", "string"),
        ("pago.total",         "total",         "currency"),
    ]},
    "items_liq": {"label": "items", "icon": "📦", "fields": [
        ("item.codigo",          "codigo",          "string"),
        ("item.descripcion",     "descripcion",     "string"),
        ("item.cantidad",        "cantidad",        "number"),
        ("item.unidad_medida",   "unidad_medida",   "string"),
        ("item.precio_unitario", "precio_unitario", "currency"),
        ("item.descuento",       "descuento",       "currency"),
        ("item.subtotal",        "subtotal",        "currency"),
    ]},
    "totales_liq": {"label": "totales", "icon": "Σ", "fields": [
        ("totales.subtotal_12",            "subtotal_12",            "currency"),
        ("totales.subtotal_0",             "subtotal_0",             "currency"),
        ("totales.subtotal_sin_impuestos", "subtotal_sin_impuestos", "currency"),
        ("totales.iva_12",                 "iva_12",                 "currency"),
        ("totales.importe_total",          "importe_total",          "currency"),
    ]},
}

LIQUIDACION_SAMPLE = {
    "meta": {"doc_entry": 12, "doc_num": 12, "obj_type": "18", "currency": "USD"},
    "empresa": {
        "razon_social": "DISTRIBUIDORA EPSON ECUADOR S.A.",
        "nombre_comercial": "EPSON ECUADOR",
        "ruc": "0991234567001",
        "direccion_matriz": "Av. 9 de Octubre 1234, Guayaquil",
        "obligado_contabilidad": "SI",
    },
    "proveedor": {
        "razon_social": "MÉNDEZ SUÁREZ JUAN CARLOS",
        "identificacion": "0912345678",
        "tipo_identificacion": "05",
        "direccion": "Cdla. La Garzota Mz. 25 Vs. 3, Guayaquil",
        "email": "juan.mendez@gmail.com",
    },
    "fiscal": {
        "ambiente": "PRUEBAS",
        "tipo_emision": "NORMAL",
        "numero_documento": "003-001-000000012",
        "numero_autorizacion": "2602202603991234567001030010010000000121234567811",
        "fecha_autorizacion": "2025-11-21T11:45:00",
        "clave_acceso": "2602202603991234567001030010010000000121234567811",
    },
    "pago": {"forma_pago_fe": "01", "total": 345.60},
    "items": [
        {"codigo": "SRV-001", "descripcion": "Servicios de limpieza industrial bodega Norte",   "cantidad": 1, "unidad_medida": "SRV", "precio_unitario": 150.00, "descuento": 0, "subtotal": 150.00},
        {"codigo": "SRV-002", "descripcion": "Mantenimiento y pintura paredes internas",       "cantidad": 2, "unidad_medida": "SRV", "precio_unitario": 80.00,  "descuento": 0, "subtotal": 160.00},
        {"codigo": "MAT-001", "descripcion": "Materiales de limpieza (escobas, trapeadores)",  "cantidad": 5, "unidad_medida": "UN",  "precio_unitario": 4.00,   "descuento": 0, "subtotal": 20.00},
    ],
    "totales": {
        "subtotal_12": 330.00, "subtotal_0": 0, "subtotal_sin_impuestos": 330.00,
        "descuento_total": 0, "iva_12": 39.60, "importe_total": 369.60,
    },
}

def _liquidacion_layout_raw():
    C = "#2E7D32"  # verde liquidación
    return {
        "name": "Liquidación de Compras — Layout por Defecto",
        "version": "1.0", "pageWidth": 754, "pageSize": "A4",
        "margins": {"top": 15, "bottom": 15, "left": 20, "right": 20},
        "sections": [
            {"id":"s-rh","stype":"rh","label":"Encabezado","abbr":"EI","height":110},
            {"id":"s-ph","stype":"ph","label":"Proveedor / Vendedor","abbr":"PR","height":80},
            {"id":"s-d1","stype":"det","label":"Detalle","abbr":"D","height":14,"iterates":"items"},
            {"id":"s-pf","stype":"pf","label":"Totales","abbr":"PP","height":110},
            {"id":"s-rf","stype":"rf","label":"Resumen","abbr":"RI","height":30},
        ],
        "elements": [
            # RH
            _el("rh-01","field","s-rh",4,4,380,16,  fieldPath="empresa.razon_social",fontSize=11,bold=True),
            _el("rh-02","field","s-rh",4,22,220,12, fieldPath="empresa.ruc",fieldFmt="ruc_mask"),
            _el("rh-03","field","s-rh",4,35,380,12, fieldPath="empresa.direccion_matriz"),
            _el("rh-rect","rect","s-rh",530,4,220,96, bgColor="transparent",borderColor=C,borderWidth=2),
            _el("rh-title","text","s-rh",535,8,210,16,content="LIQUIDACIÓN DE COMPRAS",fontSize=10,bold=True,align="center",color=C,zIndex=1),
            _el("rh-doc","field","s-rh",535,28,210,14,fieldPath="fiscal.numero_documento",fontSize=10,bold=True,align="center",zIndex=1),
            _el("rh-amb","field","s-rh",535,45,210,11,fieldPath="fiscal.ambiente",fontSize=8,align="center",color="#856404",zIndex=1),
            _el("rh-date","field","s-rh",535,60,210,11,fieldPath="fiscal.fecha_autorizacion",fieldFmt="datetime",fontSize=7,align="center",zIndex=1),
            _el("rh-clave","field","s-rh",535,74,210,10,fieldPath="fiscal.clave_acceso",fieldFmt="clave_acceso",fontSize=6,align="center",color="#444",fontFamily="Courier New",zIndex=1),
            # PH proveedor (vendedor persona natural)
            _el("ph-banner","rect","s-ph",4,2,746,14,bgColor="#E8F5E9",borderColor=C,borderWidth=1),
            _el("ph-banner-t","text","s-ph",8,3,400,12,content="VENDEDOR — PERSONA NATURAL SIN OBLIGACIÓN DE EMITIR FACTURAS",fontSize=7,bold=True,color=C,zIndex=1),
            _el("ph-01","text","s-ph",4,18,80,12,  content="Vendedor:",bold=True),
            _el("ph-02","field","s-ph",88,18,380,12,fieldPath="proveedor.razon_social"),
            _el("ph-03","text","s-ph",4,32,80,12,  content="Cédula:",bold=True),
            _el("ph-04","field","s-ph",88,32,160,12,fieldPath="proveedor.identificacion"),
            _el("ph-05","text","s-ph",4,46,80,12,  content="Dirección:",bold=True),
            _el("ph-06","field","s-ph",88,46,380,12,fieldPath="proveedor.direccion"),
            # Tabla header
            _el("ph-hdr","rect","s-ph",4,62,746,16,  bgColor=C,borderColor=C,borderWidth=1),
            _el("ph-h1","text","s-ph",6,63,50,14,   content="CÓDIGO",     fontSize=7,bold=True,color="#FFF",zIndex=1),
            _el("ph-h2","text","s-ph",60,63,270,14,  content="DESCRIPCIÓN",fontSize=7,bold=True,color="#FFF",zIndex=1),
            _el("ph-h3","text","s-ph",334,63,60,14,  content="CANT.",      fontSize=7,bold=True,color="#FFF",align="right",zIndex=1),
            _el("ph-h4","text","s-ph",398,63,50,14,  content="U.M.",       fontSize=7,bold=True,color="#FFF",align="center",zIndex=1),
            _el("ph-h5","text","s-ph",452,63,70,14,  content="P.UNITARIO", fontSize=7,bold=True,color="#FFF",align="right",zIndex=1),
            _el("ph-h6","text","s-ph",526,63,50,14,  content="DESC.",      fontSize=7,bold=True,color="#FFF",align="right",zIndex=1),
            _el("ph-h7","text","s-ph",580,63,70,14,  content="SUBTOTAL",   fontSize=7,bold=True,color="#FFF",align="right",zIndex=1),
            # Detail
            _el("det-01","field","s-d1",4,0,52,14,   fieldPath="item.codigo",fontSize=7),
            _el("det-02","field","s-d1",60,0,270,14,  fieldPath="item.descripcion",fontSize=7),
            _el("det-03","field","s-d1",334,0,60,14,  fieldPath="item.cantidad",fieldFmt="float2",fontSize=7,align="right"),
            _el("det-04","field","s-d1",398,0,50,14,  fieldPath="item.unidad_medida",fontSize=7,align="center"),
            _el("det-05","field","s-d1",452,0,70,14,  fieldPath="item.precio_unitario",fieldFmt="currency",fontSize=7,align="right"),
            _el("det-06","field","s-d1",526,0,50,14,  fieldPath="item.descuento",fieldFmt="currency",fontSize=7,align="right"),
            _el("det-07","field","s-d1",580,0,70,14,  fieldPath="item.subtotal",fieldFmt="currency",fontSize=7,align="right",bold=True),
            # PF
            _el("pf-l1","text","s-pf",440,4,130,12,   content="SUBTOTAL IVA 12%:",fontSize=7,bold=True,align="right"),
            _el("pf-v1","field","s-pf",574,4,70,12,    fieldPath="totales.subtotal_12",fieldFmt="currency",fontSize=7,align="right",bold=True),
            _el("pf-l2","text","s-pf",440,18,130,12,  content="SUBTOTAL IVA 0%:", fontSize=7,bold=True,align="right"),
            _el("pf-v2","field","s-pf",574,18,70,12,   fieldPath="totales.subtotal_0",fieldFmt="currency",fontSize=7,align="right"),
            _el("pf-l3","text","s-pf",440,32,130,12,  content="SUBTOTAL:",         fontSize=7,bold=True,align="right"),
            _el("pf-v3","field","s-pf",574,32,70,12,   fieldPath="totales.subtotal_sin_impuestos",fieldFmt="currency",fontSize=7,align="right"),
            _el("pf-sep","line","s-pf",440,47,204,2,  borderColor=C,borderWidth=1),
            _el("pf-l4","text","s-pf",440,51,130,14,  content="IVA 12%:",fontSize=8,bold=True,align="right"),
            _el("pf-v4","field","s-pf",574,51,70,14,   fieldPath="totales.iva_12",fieldFmt="currency",fontSize=8,align="right"),
            _el("pf-sep2","line","s-pf",440,67,204,2, borderColor="#333",borderWidth=1),
            _el("pf-l5","text","s-pf",440,71,130,16,  content="VALOR TOTAL:",fontSize=10,bold=True,align="right",color=C),
            _el("pf-v5","field","s-pf",574,71,70,16,   fieldPath="totales.importe_total",fieldFmt="currency",fontSize=10,align="right",bold=True,color=C),
            # RF
            _el("rf-line","line","s-rf",4,4,746,1,  borderColor="#CCC",borderWidth=1),
            _el("rf-txt","text","s-rf",4,8,400,12,  content="Documento generado electrónicamente · ReportForge",fontSize=7,color="#666"),
        ],
    }


# ═════════════════════════════════════════════════════════════════
