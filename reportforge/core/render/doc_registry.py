# core/render/doc_registry.py
# ─────────────────────────────────────────────────────────────────
# Registro de tipos de documento.
#
# Cada tipo de documento registra:
#   - contrato:     dict canónico (estructura de campos)
#   - layout:       Layout por defecto (callable → Layout)
#   - field_tree:   árbol de campos para el Designer
#   - sample_data:  datos de prueba para preview/CLI test
#   - builder:      nombre de función en core.models.*
#   - label:        nombre legible
#   - color:        color de acento del tipo de documento
# ─────────────────────────────────────────────────────────────────

from __future__ import annotations
from typing import Callable, Optional
from .resolvers.layout_loader import layout_from_dict

# ─────────────────────────────────────────────────────────────────
#  Helper para construir elementos del layout
# ─────────────────────────────────────────────────────────────────
def _el(id, tp, sid, x, y, w, h, **kw):
    base = dict(id=id, type=tp, sectionId=sid, x=x, y=y, w=w, h=h,
                fontFamily="Arial", fontSize=8, bold=False, italic=False,
                underline=False, align="left", color="#000000",
                bgColor="transparent", borderColor="transparent",
                borderWidth=0, borderStyle="solid",
                lineDir="h", lineWidth=1, zIndex=0,
                content="", fieldPath="", fieldFmt=None)
    base.update(kw)
    return base


# ═════════════════════════════════════════════════════════════════
#  1. GUÍA DE REMISIÓN
# ═════════════════════════════════════════════════════════════════
REMISION_FIELD_TREE = {
    "empresa":      {"label": "empresa (Remitente)", "icon": "🏢", "fields": [
        ("empresa.razon_social",   "razon_social",   "string"),
        ("empresa.ruc",            "ruc",            "string"),
        ("empresa.direccion",      "direccion",      "string"),
    ]},
    "destinatario": {"label": "destinatario", "icon": "📦", "fields": [
        ("destinatario.razon_social",   "razon_social",   "string"),
        ("destinatario.identificacion", "identificacion", "string"),
        ("destinatario.direccion",      "direccion",      "string"),
    ]},
    "traslado": {"label": "traslado", "icon": "🚚", "fields": [
        ("traslado.motivo",                "motivo",                "string"),
        ("traslado.ruta",                  "ruta",                  "string"),
        ("traslado.fecha_inicio_traslado", "fecha_inicio_traslado", "date"),
        ("traslado.fecha_fin_traslado",    "fecha_fin_traslado",    "date"),
        ("traslado.placa_vehiculo",        "placa_vehiculo",        "string"),
        ("traslado.transportista_nombre",  "transportista_nombre",  "string"),
        ("traslado.transportista_ruc",     "transportista_ruc",     "string"),
    ]},
    "origen": {"label": "origen", "icon": "📍", "fields": [
        ("origen.direccion", "direccion", "string"),
    ]},
    "destino": {"label": "destino", "icon": "🏁", "fields": [
        ("destino.direccion", "direccion", "string"),
    ]},
    "fiscal":   {"label": "fiscal", "icon": "🧾", "fields": [
        ("fiscal.numero_documento",    "numero_documento",    "string"),
        ("fiscal.clave_acceso",        "clave_acceso",        "string"),
        ("fiscal.fecha_autorizacion",  "fecha_autorizacion",  "date"),
        ("fiscal.ambiente",            "ambiente",            "string"),
    ]},
    "items_remision": {"label": "items (bienes)", "icon": "📦", "fields": [
        ("item.codigo",        "codigo",        "string"),
        ("item.descripcion",   "descripcion",   "string"),
        ("item.cantidad",      "cantidad",      "number"),
        ("item.unidad_medida", "unidad_medida", "string"),
    ]},
}

REMISION_SAMPLE = {
    "meta": {"doc_entry": 1234, "doc_num": 1234, "obj_type": "112", "currency": "USD"},
    "empresa": {
        "razon_social": "DISTRIBUIDORA EPSON ECUADOR S.A.",
        "ruc": "0991234567001",
        "direccion": "Av. 9 de Octubre 1234, Guayaquil",
        "obligado_contabilidad": "SI",
    },
    "destinatario": {
        "razon_social": "FERRETERÍA EL PROGRESO CIA. LTDA.",
        "identificacion": "0992345678001",
        "tipo_identificacion": "04",
        "direccion": "Calle Olmedo 456 y Sucre, Quito",
    },
    "fiscal": {
        "ambiente": "PRUEBAS",
        "tipo_emision": "NORMAL",
        "numero_documento": "006-001-000000123",
        "numero_autorizacion": "2602202606991234567001060010010000001231234567811",
        "fecha_autorizacion": "2025-11-19T10:00:00",
        "clave_acceso": "2602202606991234567001060010010000001231234567811",
    },
    "traslado": {
        "motivo": "VENTA",
        "ruta": "Guayaquil - Quito",
        "fecha_inicio_traslado": "19/11/2025",
        "fecha_fin_traslado": "20/11/2025",
        "placa_vehiculo": "GBA-1234",
        "transportista_nombre": "TRANSPORTES RÁPIDOS S.A.",
        "transportista_ruc": "0985678901001",
    },
    "origen": {"direccion": "Av. 9 de Octubre 1234, Guayaquil - BODEGA CENTRAL"},
    "destino": {"direccion": "Calle Olmedo 456 y Sucre, Quito"},
    "items": [
        {"codigo": "BCANA.12", "descripcion": "CANASTILLA INC. POSTERIOR TAIWAN DINT",  "cantidad": 30, "unidad_medida": "UN"},
        {"codigo": "BEJE.18",  "descripcion": "EJE DEL GRUESO CICISMO FINO TAIWAN",      "cantidad": 6,  "unidad_medida": "UN"},
        {"codigo": "BTUBO.62", "descripcion": "TUBO 20X2 125 AV DURO TAILANDIA",         "cantidad": 3,  "unidad_medida": "UN"},
        {"codigo": "BPEDA.12", "descripcion": "PEDAL STD TAIWAN 3657 RECTANGULAR",      "cantidad": 2,  "unidad_medida": "PAR"},
    ],
}

def _remision_layout_raw():
    C = "#1565C0"  # azul remisión
    return {
        "name": "Guía de Remisión — Layout por Defecto",
        "version": "1.0", "pageWidth": 754, "pageSize": "A4",
        "margins": {"top": 15, "bottom": 15, "left": 20, "right": 20},
        "sections": [
            {"id":"s-rh","stype":"rh","label":"Encabezado","abbr":"EI","height":110},
            {"id":"s-ph","stype":"ph","label":"Datos traslado","abbr":"TR","height":90},
            {"id":"s-d1","stype":"det","label":"Bienes","abbr":"B","height":14,"iterates":"items"},
            {"id":"s-pf","stype":"pf","label":"Pie","abbr":"PP","height":50},
        ],
        "elements": [
            # RH — empresa
            _el("rh-01","field","s-rh",4,4,380,16,   fieldPath="empresa.razon_social",fontSize=11,bold=True),
            _el("rh-02","field","s-rh",4,22,220,12,  fieldPath="empresa.ruc",fieldFmt="ruc_mask"),
            _el("rh-03","field","s-rh",4,35,380,12,  fieldPath="empresa.direccion"),
            _el("rh-rect","rect","s-rh",530,4,220,96, bgColor="transparent",borderColor=C,borderWidth=2),
            _el("rh-title","text","s-rh",535,8,210,18, content="GUÍA DE REMISIÓN",fontSize=11,bold=True,align="center",color=C,zIndex=1),
            _el("rh-doc","field","s-rh",535,30,210,14, fieldPath="fiscal.numero_documento",fontSize=10,bold=True,align="center",zIndex=1),
            _el("rh-amb","field","s-rh",535,47,210,11, fieldPath="fiscal.ambiente",fontSize=8,align="center",color="#856404",zIndex=1),
            _el("rh-date","field","s-rh",535,60,210,11,fieldPath="fiscal.fecha_autorizacion",fieldFmt="datetime",fontSize=7,align="center",zIndex=1),
            _el("rh-clave","field","s-rh",535,74,210,10,fieldPath="fiscal.clave_acceso",fieldFmt="clave_acceso",fontSize=6,align="center",color="#444",fontFamily="Courier New",zIndex=1),
            # PH — datos traslado
            _el("ph-01","text","s-ph",4,4,80,12,   content="Destinatario:",bold=True),
            _el("ph-02","field","s-ph",88,4,380,12,  fieldPath="destinatario.razon_social"),
            _el("ph-03","text","s-ph",4,18,80,12,  content="RUC/CI:",bold=True),
            _el("ph-04","field","s-ph",88,18,200,12, fieldPath="destinatario.identificacion"),
            _el("ph-05","text","s-ph",4,32,80,12,  content="Dirección:",bold=True),
            _el("ph-06","field","s-ph",88,32,380,12, fieldPath="destinatario.direccion"),
            _el("ph-07","text","s-ph",4,46,80,12,  content="Motivo:",bold=True),
            _el("ph-08","field","s-ph",88,46,180,12, fieldPath="traslado.motivo",bold=True),
            _el("ph-09","text","s-ph",280,46,60,12,  content="Ruta:",bold=True),
            _el("ph-10","field","s-ph",344,46,200,12, fieldPath="traslado.ruta"),
            _el("ph-11","text","s-ph",4,60,80,12,  content="F. Inicio:",bold=True),
            _el("ph-12","field","s-ph",88,60,100,12, fieldPath="traslado.fecha_inicio_traslado"),
            _el("ph-13","text","s-ph",200,60,60,12, content="F. Fin:",bold=True),
            _el("ph-14","field","s-ph",264,60,100,12,fieldPath="traslado.fecha_fin_traslado"),
            _el("ph-15","text","s-ph",380,60,60,12, content="Placa:",bold=True),
            _el("ph-16","field","s-ph",444,60,100,12,fieldPath="traslado.placa_vehiculo",bold=True),
            _el("ph-17","text","s-ph",4,74,80,12,  content="Transportista:",bold=True),
            _el("ph-18","field","s-ph",88,74,300,12, fieldPath="traslado.transportista_nombre"),
            # Header tabla bienes (azul)
            _el("ph-hdr","rect","s-ph",4,88,746,14,   bgColor=C,borderColor=C,borderWidth=1),
            _el("ph-h1","text","s-ph",6,89,60,12,   content="CÓDIGO",   fontSize=7,bold=True,color="#FFF",zIndex=1),
            _el("ph-h2","text","s-ph",70,89,500,12,  content="DESCRIPCIÓN", fontSize=7,bold=True,color="#FFF",zIndex=1),
            _el("ph-h3","text","s-ph",574,89,80,12,  content="CANT.",   fontSize=7,bold=True,color="#FFF",align="right",zIndex=1),
            _el("ph-h4","text","s-ph",658,89,80,12,  content="U.MEDIDA",fontSize=7,bold=True,color="#FFF",align="center",zIndex=1),
            # Detail — bienes
            _el("det-01","field","s-d1",4,0,62,14,   fieldPath="item.codigo",fontSize=7),
            _el("det-02","field","s-d1",70,0,500,14,  fieldPath="item.descripcion",fontSize=7),
            _el("det-03","field","s-d1",574,0,80,14,  fieldPath="item.cantidad",fieldFmt="float2",fontSize=7,align="right"),
            _el("det-04","field","s-d1",658,0,80,14,  fieldPath="item.unidad_medida",fontSize=7,align="center"),
            # PF
            _el("pf-line","line","s-pf",4,4,746,1,   borderColor="#CCC",borderWidth=1),
            _el("pf-01","text","s-pf",4,8,500,12,   content="Origen:",bold=True,fontSize=7),
            _el("pf-02","field","s-pf",50,8,350,12,  fieldPath="origen.direccion",fontSize=7),
            _el("pf-03","text","s-pf",4,20,500,12,  content="Destino:",bold=True,fontSize=7),
            _el("pf-04","field","s-pf",50,20,350,12, fieldPath="destino.direccion",fontSize=7),
        ],
    }


# ═════════════════════════════════════════════════════════════════
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
#  3. COMPROBANTE DE RETENCIÓN
# ═════════════════════════════════════════════════════════════════
RETENCION_FIELD_TREE = {
    "empresa":    {"label": "empresa (Agente)", "icon": "🏢", "fields": [
        ("empresa.razon_social",     "razon_social",     "string"),
        ("empresa.ruc",              "ruc",              "string"),
        ("empresa.direccion_matriz", "direccion_matriz", "string"),
        ("empresa.agente_retencion", "agente_retencion", "string"),
    ]},
    "proveedor":  {"label": "proveedor (Retenido)", "icon": "👤", "fields": [
        ("proveedor.razon_social",   "razon_social",   "string"),
        ("proveedor.identificacion", "identificacion", "string"),
        ("proveedor.direccion",      "direccion",      "string"),
        ("proveedor.email",          "email",          "string"),
    ]},
    "doc_sustento": {"label": "doc. sustento", "icon": "📄", "fields": [
        ("doc_sustento.numero_documento", "numero_documento", "string"),
        ("doc_sustento.fecha_emision",    "fecha_emision",    "date"),
        ("doc_sustento.tipo_documento",   "tipo_documento",   "string"),
    ]},
    "fiscal":     {"label": "fiscal", "icon": "🧾", "fields": [
        ("fiscal.numero_documento",   "numero_documento",   "string"),
        ("fiscal.clave_acceso",       "clave_acceso",       "string"),
        ("fiscal.fecha_autorizacion", "fecha_autorizacion", "date"),
        ("fiscal.ambiente",           "ambiente",           "string"),
    ]},
    "items_ret":  {"label": "impuestos retenidos", "icon": "📊", "fields": [
        ("item.tipo",               "tipo",               "string"),
        ("item.codigo_retencion",   "codigo_retencion",   "string"),
        ("item.descripcion",        "descripcion",        "string"),
        ("item.base_imponible",     "base_imponible",     "currency"),
        ("item.porcentaje",         "porcentaje",         "number"),
        ("item.valor_retenido",     "valor_retenido",     "currency"),
    ]},
    "totales_ret": {"label": "totales retención", "icon": "Σ", "fields": [
        ("totales.total_base_imponible", "total_base_imponible", "currency"),
        ("totales.total_retenido",       "total_retenido",       "currency"),
        ("totales.total_retenido_renta", "total_retenido_renta", "currency"),
        ("totales.total_retenido_iva",   "total_retenido_iva",   "currency"),
    ]},
}

RETENCION_SAMPLE = {
    "meta": {"doc_entry": 89, "doc_num": 89, "obj_type": "46", "currency": "USD"},
    "empresa": {
        "razon_social": "DISTRIBUIDORA EPSON ECUADOR S.A.",
        "ruc": "0991234567001",
        "direccion_matriz": "Av. 9 de Octubre 1234, Guayaquil",
        "obligado_contabilidad": "SI",
        "agente_retencion": "Res. NAC-0532",
    },
    "proveedor": {
        "razon_social": "CONSULTORES TECH CIA. LTDA.",
        "identificacion": "0992345678001",
        "tipo_identificacion": "04",
        "direccion": "Av. República de El Salvador N34-183, Quito",
        "email": "facturacion@consultorestech.com",
    },
    "fiscal": {
        "ambiente": "PRUEBAS",
        "tipo_emision": "NORMAL",
        "numero_documento": "007-001-000000089",
        "numero_autorizacion": "2602202607991234567001070010010000000891234567811",
        "fecha_autorizacion": "2025-11-22T14:30:00",
        "clave_acceso": "2602202607991234567001070010010000000891234567811",
    },
    "doc_sustento": {
        "numero_documento": "001-001-000005678",
        "fecha_emision": "2025-11-20",
        "tipo_documento": "01",
        "serie_doc_sustento": "001-001",
        "numero_doc_sustento": "000005678",
    },
    "items": [
        {"tipo": "RENTA", "codigo_retencion": "303", "descripcion": "Honorarios y demás pagos por servicios predomina intelecto",
         "base_imponible": 2000.00, "porcentaje": 10.0, "valor_retenido": 200.00},
        {"tipo": "IVA",   "codigo_retencion": "721", "descripcion": "Servicios donde predomina mano de obra - 30%",
         "base_imponible":  240.00, "porcentaje": 30.0, "valor_retenido":  72.00},
    ],
    "totales": {
        "total_base_imponible": 2240.00,
        "total_retenido": 272.00,
        "total_retenido_renta": 200.00,
        "total_retenido_iva": 72.00,
    },
}

def _retencion_layout_raw():
    C = "#4A148C"  # púrpura retención
    return {
        "name": "Comprobante de Retención — Layout por Defecto",
        "version": "1.0", "pageWidth": 754, "pageSize": "A4",
        "margins": {"top": 15, "bottom": 15, "left": 20, "right": 20},
        "sections": [
            {"id":"s-rh","stype":"rh","label":"Encabezado","abbr":"EI","height":120},
            {"id":"s-ph","stype":"ph","label":"Proveedor + doc. sustento","abbr":"PS","height":70},
            {"id":"s-d1","stype":"det","label":"Impuestos retenidos","abbr":"IR","height":22,"iterates":"items"},
            {"id":"s-pf","stype":"pf","label":"Totales retención","abbr":"TR","height":80},
        ],
        "elements": [
            # RH
            _el("rh-01","field","s-rh",4,4,380,16,  fieldPath="empresa.razon_social",fontSize=11,bold=True),
            _el("rh-02","field","s-rh",4,22,220,12, fieldPath="empresa.ruc",fieldFmt="ruc_mask"),
            _el("rh-03","field","s-rh",4,35,380,12, fieldPath="empresa.direccion_matriz"),
            _el("rh-04","text","s-rh",4,48,80,12,   content="Agente Ret.:",bold=True,fontSize=7),
            _el("rh-05","field","s-rh",88,48,200,12, fieldPath="empresa.agente_retencion",fontSize=7,color=C,bold=True),
            _el("rh-rect","rect","s-rh",530,4,220,106,bgColor="transparent",borderColor=C,borderWidth=2),
            _el("rh-title","text","s-rh",535,8,210,18,content="RETENCIÓN",fontSize=12,bold=True,align="center",color=C,zIndex=1),
            _el("rh-doc","field","s-rh",535,30,210,14,fieldPath="fiscal.numero_documento",fontSize=10,bold=True,align="center",zIndex=1),
            _el("rh-amb","field","s-rh",535,47,210,11,fieldPath="fiscal.ambiente",fontSize=8,align="center",color="#856404",zIndex=1),
            _el("rh-date","field","s-rh",535,60,210,11,fieldPath="fiscal.fecha_autorizacion",fieldFmt="datetime",fontSize=7,align="center",zIndex=1),
            _el("rh-clave","field","s-rh",535,74,210,10,fieldPath="fiscal.clave_acceso",fieldFmt="clave_acceso",fontSize=6,align="center",color="#444",fontFamily="Courier New",zIndex=1),
            # PH
            _el("ph-01","text","s-ph",4,4,80,12,   content="Proveedor:",bold=True),
            _el("ph-02","field","s-ph",88,4,380,12, fieldPath="proveedor.razon_social"),
            _el("ph-03","text","s-ph",4,18,80,12,  content="RUC/CI:",bold=True),
            _el("ph-04","field","s-ph",88,18,160,12,fieldPath="proveedor.identificacion"),
            _el("ph-05","text","s-ph",4,32,80,12,  content="Doc. Sustento:",bold=True),
            _el("ph-06","field","s-ph",88,32,200,12,fieldPath="doc_sustento.numero_documento",bold=True),
            _el("ph-07","text","s-ph",296,32,80,12, content="F. Emisión:",bold=True),
            _el("ph-08","field","s-ph",380,32,120,12,fieldPath="doc_sustento.fecha_emision",fieldFmt="date"),
            # Tabla header impuestos
            _el("ph-hdr","rect","s-ph",4,54,746,14,  bgColor=C,borderColor=C,borderWidth=1),
            _el("ph-h1","text","s-ph",6,55,40,12,   content="TIPO",       fontSize=7,bold=True,color="#FFF",zIndex=1),
            _el("ph-h2","text","s-ph",50,55,40,12,   content="CÓD. RET",  fontSize=7,bold=True,color="#FFF",align="center",zIndex=1),
            _el("ph-h3","text","s-ph",94,55,280,12,  content="DESCRIPCIÓN",fontSize=7,bold=True,color="#FFF",zIndex=1),
            _el("ph-h4","text","s-ph",378,55,100,12, content="BASE IMP.",  fontSize=7,bold=True,color="#FFF",align="right",zIndex=1),
            _el("ph-h5","text","s-ph",482,55,60,12,  content="%",         fontSize=7,bold=True,color="#FFF",align="center",zIndex=1),
            _el("ph-h6","text","s-ph",546,55,100,12, content="VALOR RET.",  fontSize=7,bold=True,color="#FFF",align="right",zIndex=1),
            # Detail
            _el("det-01","field","s-d1",4,4,42,14,   fieldPath="item.tipo",fontSize=7,color=C,bold=True),
            _el("det-02","field","s-d1",50,4,40,14,   fieldPath="item.codigo_retencion",fontSize=7,align="center",bold=True),
            _el("det-03","field","s-d1",94,4,280,14,  fieldPath="item.descripcion",fontSize=7),
            _el("det-04","field","s-d1",378,4,100,14, fieldPath="item.base_imponible",fieldFmt="currency",fontSize=7,align="right"),
            _el("det-05","field","s-d1",482,4,60,14,  fieldPath="item.porcentaje",fieldFmt="pct",fontSize=7,align="center"),
            _el("det-06","field","s-d1",546,4,100,14, fieldPath="item.valor_retenido",fieldFmt="currency",fontSize=7,align="right",bold=True),
            # PF
            _el("pf-sep","line","s-pf",4,4,746,1,   borderColor="#CCC",borderWidth=1),
            _el("pf-l1","text","s-pf",440,10,120,12,  content="BASE IMPONIBLE TOTAL:",fontSize=7,bold=True,align="right"),
            _el("pf-v1","field","s-pf",564,10,90,12,   fieldPath="totales.total_base_imponible",fieldFmt="currency",fontSize=7,align="right"),
            _el("pf-l2","text","s-pf",440,24,120,12,  content="RETENCIÓN RENTA:",fontSize=7,bold=True,align="right"),
            _el("pf-v2","field","s-pf",564,24,90,12,   fieldPath="totales.total_retenido_renta",fieldFmt="currency",fontSize=7,align="right"),
            _el("pf-l3","text","s-pf",440,38,120,12,  content="RETENCIÓN IVA:",fontSize=7,bold=True,align="right"),
            _el("pf-v3","field","s-pf",564,38,90,12,   fieldPath="totales.total_retenido_iva",fieldFmt="currency",fontSize=7,align="right"),
            _el("pf-sep2","line","s-pf",440,53,214,1, borderColor=C,borderWidth=2),
            _el("pf-l4","text","s-pf",440,57,120,18,  content="TOTAL RETENIDO:",fontSize=10,bold=True,align="right",color=C),
            _el("pf-v4","field","s-pf",564,57,90,18,   fieldPath="totales.total_retenido",fieldFmt="currency",fontSize=10,align="right",bold=True,color=C),
        ],
    }


# ═════════════════════════════════════════════════════════════════
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
#  REGISTRY
# ═════════════════════════════════════════════════════════════════
class DocType:
    """Descriptor de un tipo de documento."""
    def __init__(self, *, key, label, sri_code, color,
                 layout_raw_fn, sample_data, field_tree, builder_module, builder_fn):
        self.key            = key
        self.label          = label
        self.sri_code       = sri_code
        self.color          = color
        self._layout_raw_fn = layout_raw_fn
        self.sample_data    = sample_data
        self.field_tree     = field_tree
        self.builder_module = builder_module
        self.builder_fn     = builder_fn

    def default_layout(self):
        return layout_from_dict(self._layout_raw_fn())

    def call_builder(self, doc_entry: int) -> dict:
        import importlib
        mod = importlib.import_module(self.builder_module)
        fn  = getattr(mod, self.builder_fn)
        return fn(doc_entry)

    def __repr__(self):
        return f"<DocType {self.key} '{self.label}'>"


REGISTRY: dict[str, DocType] = {

    "factura": DocType(
        key="factura",
        label="Factura Electrónica",
        sri_code="01",
        color="#C0511A",
        layout_raw_fn=lambda: __import__(
            "core.render.resolvers.layout_loader",
            fromlist=["_default_raw"]
        )._default_raw(),
        sample_data=None,   # uses SAMPLE_DATA from layout_loader default
        field_tree=None,    # uses FIELD_TREE from designer
        builder_module="core.models.invoice_model",
        builder_fn="build_invoice_model",
    ),

    "remision": DocType(
        key="remision",
        label="Guía de Remisión",
        sri_code="06",
        color="#1565C0",
        layout_raw_fn=_remision_layout_raw,
        sample_data=REMISION_SAMPLE,
        field_tree=REMISION_FIELD_TREE,
        builder_module="core.models.remision_model",
        builder_fn="build_remision_model",
    ),

    "nota_credito": DocType(
        key="nota_credito",
        label="Nota de Crédito Cliente",
        sri_code="04",
        color="#C62828",
        layout_raw_fn=_nota_credito_layout_raw,
        sample_data=NOTA_CREDITO_SAMPLE,
        field_tree=NOTA_CREDITO_FIELD_TREE,
        builder_module="core.models.nota_credito_model",
        builder_fn="build_nota_credito_model",
    ),

    "retencion": DocType(
        key="retencion",
        label="Comprobante de Retención",
        sri_code="07",
        color="#4A148C",
        layout_raw_fn=_retencion_layout_raw,
        sample_data=RETENCION_SAMPLE,
        field_tree=RETENCION_FIELD_TREE,
        builder_module="core.models.retencion_model",
        builder_fn="build_retencion_model",
    ),

    "liquidacion": DocType(
        key="liquidacion",
        label="Liquidación de Compras",
        sri_code="03",
        color="#2E7D32",
        layout_raw_fn=_liquidacion_layout_raw,
        sample_data=LIQUIDACION_SAMPLE,
        field_tree=LIQUIDACION_FIELD_TREE,
        builder_module="core.models.liquidacion_model",
        builder_fn="build_liquidacion_model",
    ),
}


def get_doc_type(key: str) -> DocType:
    if key not in REGISTRY:
        raise KeyError(f"Tipo de documento desconocido: {key!r}. "
                       f"Disponibles: {list(REGISTRY.keys())}")
    return REGISTRY[key]


def list_doc_types() -> list[dict]:
    return [{"key": dt.key, "label": dt.label, "sri_code": dt.sri_code, "color": dt.color}
            for dt in REGISTRY.values()]
