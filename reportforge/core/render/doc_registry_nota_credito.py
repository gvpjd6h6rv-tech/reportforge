from __future__ import annotations

from .doc_registry_shared import _el

#  2. NOTA DE CRÉDITO CLIENTE
# ═════════════════════════════════════════════════════════════════
NOTA_CREDITO_FIELD_TREE = {
    "empresa":      {"label": "empresa", "icon": "🏢", "fields": [
        ("empresa.razon_social",    "razon_social",    "string"),
        ("empresa.ruc",             "ruc",             "string"),
        ("empresa.direccion_matriz","direccion_matriz","string"),
    ]},
    "cliente":      {"label": "cliente", "icon": "👤", "fields": [
        ("cliente.razon_social",   "razon_social",   "string"),
        ("cliente.identificacion", "identificacion", "string"),
        ("cliente.direccion",      "direccion",      "string"),
        ("cliente.email",          "email",          "string"),
    ]},
    "doc_modificado": {"label": "doc. modificado", "icon": "📋", "fields": [
        ("doc_modificado.numero_documento", "numero_documento", "string"),
        ("doc_modificado.fecha_emision",    "fecha_emision",    "date"),
        ("doc_modificado.tipo_documento",   "tipo_documento",   "string"),
    ]},
    "fiscal": {"label": "fiscal", "icon": "🧾", "fields": [
        ("fiscal.numero_documento",   "numero_documento",   "string"),
        ("fiscal.clave_acceso",       "clave_acceso",       "string"),
        ("fiscal.fecha_autorizacion", "fecha_autorizacion", "date"),
        ("fiscal.ambiente",           "ambiente",           "string"),
    ]},
    "pago": {"label": "pago", "icon": "💳", "fields": [
        ("pago.forma_pago_fe", "forma_pago_fe", "string"),
        ("pago.total",         "total",         "currency"),
    ]},
    "items_nc": {"label": "items", "icon": "📦", "fields": [
        ("item.codigo",          "codigo",          "string"),
        ("item.descripcion",     "descripcion",     "string"),
        ("item.cantidad",        "cantidad",        "number"),
        ("item.precio_unitario", "precio_unitario", "currency"),
        ("item.descuento",       "descuento",       "currency"),
        ("item.subtotal",        "subtotal",        "currency"),
    ]},
    "totales": {"label": "totales", "icon": "Σ", "fields": [
        ("totales.subtotal_12",            "subtotal_12",            "currency"),
        ("totales.subtotal_0",             "subtotal_0",             "currency"),
        ("totales.subtotal_sin_impuestos", "subtotal_sin_impuestos", "currency"),
        ("totales.descuento_total",        "descuento_total",        "currency"),
        ("totales.iva_12",                 "iva_12",                 "currency"),
        ("totales.importe_total",          "importe_total",          "currency"),
    ]},
}

NOTA_CREDITO_SAMPLE = {
    "meta": {"doc_entry": 45, "doc_num": 45, "obj_type": "14", "currency": "USD"},
    "empresa": {
        "razon_social": "DISTRIBUIDORA EPSON ECUADOR S.A.",
        "nombre_comercial": "EPSON ECUADOR",
        "ruc": "0991234567001",
        "direccion_matriz": "Av. 9 de Octubre 1234, Guayaquil",
        "obligado_contabilidad": "SI",
        "agente_retencion": "NO",
    },
    "cliente": {
        "razon_social": "SILVA LEON ROBERTO CARLOS",
        "identificacion": "0923748188",
        "tipo_identificacion": "05",
        "direccion": "44 Y SEDALANA, Guayaquil",
        "email": "roberto@email.com",
    },
    "fiscal": {
        "ambiente": "PRUEBAS",
        "tipo_emision": "NORMAL",
        "numero_documento": "004-001-000000045",
        "numero_autorizacion": "2602202604991234567001040010010000000451234567811",
        "fecha_autorizacion": "2025-11-20T09:15:00",
        "clave_acceso": "2602202604991234567001040010010000000451234567811",
    },
    "doc_modificado": {
        "numero_documento": "002-101-000020482",
        "fecha_emision": "2025-11-19",
        "tipo_documento": "FACTURA",
    },
    "motivo": "Devolución de mercadería en mal estado",
    "pago": {"forma_pago_fe": "01", "total": 7.02},
    "items": [
        {"codigo": "BCANA.12", "descripcion": "CANASTILLA INC. POSTERIOR TAIWAN DINT",  "cantidad": 10, "precio_unitario": 0.10, "descuento": 0, "subtotal": 1.00},
        {"codigo": "BTUBO.62", "descripcion": "TUBO 20X2 125 AV DURO TAILANDIA",         "cantidad": 2,  "precio_unitario": 2.00, "descuento": 0, "subtotal": 4.00},
        {"codigo": "BPEDA.12", "descripcion": "PEDAL STD TAIWAN 3657 RECTANGULAR",      "cantidad": 1,  "precio_unitario": 1.00, "descuento": 0, "subtotal": 1.00},
    ],
    "totales": {
        "subtotal_12": 6.00, "subtotal_0": 0, "subtotal_sin_impuestos": 6.00,
        "descuento_total": 0, "iva_12": 0.90, "importe_total": 6.90,
    },
}

def _nota_credito_layout_raw():
    C = "#C62828"  # rojo nota crédito
    return {
        "name": "Nota de Crédito Cliente — Layout por Defecto",
        "version": "1.0", "pageWidth": 754, "pageSize": "A4",
        "margins": {"top": 15, "bottom": 15, "left": 20, "right": 20},
        "sections": [
            {"id":"s-rh","stype":"rh","label":"Encabezado","abbr":"EI","height":120},
            {"id":"s-ph","stype":"ph","label":"Cliente + doc. modificado","abbr":"EP","height":90},
            {"id":"s-d1","stype":"det","label":"Detalle","abbr":"D","height":14,"iterates":"items"},
            {"id":"s-pf","stype":"pf","label":"Pie","abbr":"PP","height":110},
            {"id":"s-rf","stype":"rf","label":"Resumen","abbr":"RI","height":30},
        ],
        "elements": [
            # RH
            _el("rh-01","field","s-rh",4,4,380,16,  fieldPath="empresa.razon_social",fontSize=11,bold=True),
            _el("rh-02","field","s-rh",4,22,220,12, fieldPath="empresa.ruc",fieldFmt="ruc_mask"),
            _el("rh-03","field","s-rh",4,35,380,12, fieldPath="empresa.direccion_matriz"),
            _el("rh-rect","rect","s-rh",530,4,220,106,bgColor="transparent",borderColor=C,borderWidth=2),
            _el("rh-title","text","s-rh",535,8,210,18,content="NOTA DE CRÉDITO",fontSize=11,bold=True,align="center",color=C,zIndex=1),
            _el("rh-doc","field","s-rh",535,30,210,14,fieldPath="fiscal.numero_documento",fontSize=10,bold=True,align="center",zIndex=1),
            _el("rh-amb","field","s-rh",535,47,210,11,fieldPath="fiscal.ambiente",fontSize=8,align="center",color="#856404",zIndex=1),
            _el("rh-date","field","s-rh",535,60,210,11,fieldPath="fiscal.fecha_autorizacion",fieldFmt="datetime",fontSize=7,align="center",zIndex=1),
            _el("rh-clave","field","s-rh",535,74,210,10,fieldPath="fiscal.clave_acceso",fieldFmt="clave_acceso",fontSize=6,align="center",color="#444",fontFamily="Courier New",zIndex=1),
            _el("rh-mot-l","text","s-rh",4,60,70,12,   content="Motivo:",bold=True,fontSize=7),
            _el("rh-mot-v","field","s-rh",78,60,360,12,  fieldPath="motivo",fontSize=7,color=C,bold=True),
            # Doc modificado box
            _el("rh-dm-bg","rect","s-rh",4,74,380,20,  bgColor="#FFF8F8",borderColor=C,borderWidth=1),
            _el("rh-dm-l","text","s-rh",8,77,140,14,   content="Modifica documento:",bold=True,fontSize=7),
            _el("rh-dm-v","field","s-rh",155,77,110,14, fieldPath="doc_modificado.numero_documento",fontSize=7,bold=True,color=C,zIndex=1),
            _el("rh-dm-f","field","s-rh",270,77,100,14, fieldPath="doc_modificado.fecha_emision",fieldFmt="date",fontSize=7,zIndex=1),
            # PH
            _el("ph-01","text","s-ph",4,4,80,12,   content="Cliente:",bold=True),
            _el("ph-02","field","s-ph",88,4,380,12, fieldPath="cliente.razon_social"),
            _el("ph-03","text","s-ph",4,18,80,12,  content="RUC/CI:",bold=True),
            _el("ph-04","field","s-ph",88,18,160,12,fieldPath="cliente.identificacion"),
            _el("ph-05","text","s-ph",4,32,80,12,  content="Dirección:",bold=True),
            _el("ph-06","field","s-ph",88,32,380,12,fieldPath="cliente.direccion"),
            # Tabla header
            _el("ph-hdr","rect","s-ph",4,62,746,16,  bgColor=C,borderColor=C,borderWidth=1),
            _el("ph-h1","text","s-ph",6,63,50,14,   content="CÓDIGO",     fontSize=7,bold=True,color="#FFF",zIndex=1),
            _el("ph-h2","text","s-ph",60,63,340,14,  content="DESCRIPCIÓN",fontSize=7,bold=True,color="#FFF",zIndex=1),
            _el("ph-h3","text","s-ph",404,63,44,14,  content="CANT.",      fontSize=7,bold=True,color="#FFF",align="right",zIndex=1),
            _el("ph-h4","text","s-ph",452,63,70,14,  content="P.UNITARIO", fontSize=7,bold=True,color="#FFF",align="right",zIndex=1),
            _el("ph-h5","text","s-ph",526,63,50,14,  content="DESC.",      fontSize=7,bold=True,color="#FFF",align="right",zIndex=1),
            _el("ph-h6","text","s-ph",580,63,70,14,  content="SUBTOTAL",   fontSize=7,bold=True,color="#FFF",align="right",zIndex=1),
            # Detail
            _el("det-01","field","s-d1",4,0,52,14,   fieldPath="item.codigo",fontSize=7),
            _el("det-02","field","s-d1",60,0,340,14,  fieldPath="item.descripcion",fontSize=7),
            _el("det-03","field","s-d1",404,0,44,14,  fieldPath="item.cantidad",fieldFmt="float2",fontSize=7,align="right"),
            _el("det-04","field","s-d1",452,0,70,14,  fieldPath="item.precio_unitario",fieldFmt="currency",fontSize=7,align="right"),
            _el("det-05","field","s-d1",526,0,50,14,  fieldPath="item.descuento",fieldFmt="currency",fontSize=7,align="right"),
            _el("det-06","field","s-d1",580,0,70,14,  fieldPath="item.subtotal",fieldFmt="currency",fontSize=7,align="right",bold=True),
            # PF totales
            _el("pf-l1","text","s-pf",440,4,130,12,   content="SUBTOTAL IVA 12%:",fontSize=7,bold=True,align="right"),
            _el("pf-v1","field","s-pf",574,4,70,12,    fieldPath="totales.subtotal_12",fieldFmt="currency",fontSize=7,align="right",bold=True),
            _el("pf-l2","text","s-pf",440,18,130,12,  content="SUBTOTAL IVA 0%:", fontSize=7,bold=True,align="right"),
            _el("pf-v2","field","s-pf",574,18,70,12,   fieldPath="totales.subtotal_0",fieldFmt="currency",fontSize=7,align="right"),
            _el("pf-l3","text","s-pf",440,32,130,12,  content="DESCUENTO TOTAL:",  fontSize=7,bold=True,align="right"),
            _el("pf-v3","field","s-pf",574,32,70,12,   fieldPath="totales.descuento_total",fieldFmt="currency",fontSize=7,align="right"),
            _el("pf-sep","line","s-pf",440,47,204,2,  borderColor=C,borderWidth=1),
            _el("pf-l4","text","s-pf",440,51,130,14,  content="IVA 12%:",fontSize=8,bold=True,align="right"),
            _el("pf-v4","field","s-pf",574,51,70,14,   fieldPath="totales.iva_12",fieldFmt="currency",fontSize=8,align="right"),
            _el("pf-sep2","line","s-pf",440,67,204,2, borderColor="#333",borderWidth=1),
            _el("pf-l5","text","s-pf",440,71,130,16,  content="TOTAL NOTA CRÉD.:",fontSize=10,bold=True,align="right",color=C),
            _el("pf-v5","field","s-pf",574,71,70,16,   fieldPath="totales.importe_total",fieldFmt="currency",fontSize=10,align="right",bold=True,color=C),
            # RF
            _el("rf-line","line","s-rf",4,4,746,1,  borderColor="#CCC",borderWidth=1),
            _el("rf-txt","text","s-rf",4,8,400,12,  content="Documento generado electrónicamente · ReportForge",fontSize=7,color="#666"),
        ],
    }


# ═════════════════════════════════════════════════════════════════
