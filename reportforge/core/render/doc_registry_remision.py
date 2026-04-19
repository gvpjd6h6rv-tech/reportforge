from __future__ import annotations

from .doc_registry_shared import _el

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
