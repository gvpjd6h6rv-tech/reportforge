from __future__ import annotations

from .doc_registry_shared import _el

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
