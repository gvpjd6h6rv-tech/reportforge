from __future__ import annotations

from .layout_model import Layout


def _el(id, tp, sid, x, y, w, h, **kw):
    base = dict(
        id=id, type=tp, sectionId=sid, x=x, y=y, w=w, h=h,
        fontFamily="Arial", fontSize=8, bold=False, italic=False, underline=False,
        align="left", color="#000000", bgColor="transparent",
        borderColor="transparent", borderWidth=0, borderStyle="solid",
        lineDir="h", lineWidth=1, zIndex=0, content="", fieldPath="", fieldFmt=None,
    )
    base.update(kw)
    return base


def _default_invoice_raw():
    return {
        "name": "Factura Electrónica — Layout por Defecto", "version": "1.0", "docType": "factura",
        "pageWidth": 754, "pageSize": "A4",
        "margins": {"top": 15, "bottom": 15, "left": 20, "right": 20},
        "sections": [
            {"id": "s-rh", "stype": "rh", "label": "Encabezado del informe", "abbr": "EI", "height": 110},
            {"id": "s-ph", "stype": "ph", "label": "Encabezado de página", "abbr": "EP", "height": 80},
            {"id": "s-d1", "stype": "det", "label": "Detalle a", "abbr": "D", "height": 14, "iterates": "items"},
            {"id": "s-pf", "stype": "pf", "label": "Pie de página", "abbr": "PP", "height": 120},
            {"id": "s-rf", "stype": "rf", "label": "Resumen del informe", "abbr": "RI", "height": 30},
        ],
        "elements": [
            _el("rh-01", "field", "s-rh", 4, 4, 380, 16, fieldPath="empresa.razon_social", fontSize=11, bold=True),
            _el("rh-02", "field", "s-rh", 4, 22, 220, 12, fieldPath="empresa.ruc", fieldFmt="ruc_mask"),
            _el("rh-03", "field", "s-rh", 4, 35, 380, 12, fieldPath="empresa.direccion_matriz"),
            _el("rh-04", "field", "s-rh", 4, 48, 340, 10, fieldPath="empresa.obligado_contabilidad", fontSize=7, bold=True),
            _el("rh-rect", "rect", "s-rh", 530, 4, 220, 96, bgColor="transparent", borderColor="#C0511A", borderWidth=2),
            _el("rh-title", "text", "s-rh", 535, 8, 210, 16, content="FACTURA", fontSize=12, bold=True, align="center", color="#C0511A", zIndex=1),
            _el("rh-docnum", "field", "s-rh", 535, 28, 210, 14, fieldPath="fiscal.numero_documento", fontSize=10, bold=True, align="center", zIndex=1),
            _el("rh-amb", "field", "s-rh", 535, 45, 210, 11, fieldPath="fiscal.ambiente", fontSize=8, align="center", color="#856404", zIndex=1),
            _el("rh-date", "field", "s-rh", 535, 60, 210, 11, fieldPath="fiscal.fecha_autorizacion", fieldFmt="datetime", fontSize=7, align="center", zIndex=1),
            _el("rh-clave", "field", "s-rh", 535, 74, 210, 10, fieldPath="fiscal.clave_acceso", fieldFmt="clave_acceso", fontSize=6, align="center", color="#444", fontFamily="Courier New", zIndex=1),
            _el("ph-01", "text", "s-ph", 4, 4, 60, 12, content="Cliente:", bold=True),
            _el("ph-02", "field", "s-ph", 68, 4, 380, 12, fieldPath="cliente.razon_social"),
            _el("ph-03", "text", "s-ph", 4, 18, 60, 12, content="RUC/CI:", bold=True),
            _el("ph-04", "field", "s-ph", 68, 18, 160, 12, fieldPath="cliente.identificacion"),
            _el("ph-05", "text", "s-ph", 4, 32, 60, 12, content="Dirección:", bold=True),
            _el("ph-06", "field", "s-ph", 68, 32, 380, 12, fieldPath="cliente.direccion"),
            _el("ph-hdr", "rect", "s-ph", 4, 62, 746, 16, bgColor="#C0511A", borderColor="#A03010", borderWidth=1),
            _el("ph-h1", "text", "s-ph", 6, 63, 50, 14, content="CÓDIGO", fontSize=7, bold=True, color="#FFF", zIndex=1),
            _el("ph-h2", "text", "s-ph", 60, 63, 340, 14, content="DESCRIPCIÓN", fontSize=7, bold=True, color="#FFF", zIndex=1),
            _el("ph-h3", "text", "s-ph", 404, 63, 44, 14, content="CANT.", fontSize=7, bold=True, color="#FFF", align="right", zIndex=1),
            _el("ph-h4", "text", "s-ph", 452, 63, 70, 14, content="P.UNITARIO", fontSize=7, bold=True, color="#FFF", align="right", zIndex=1),
            _el("ph-h5", "text", "s-ph", 526, 63, 50, 14, content="DESCUENTO", fontSize=7, bold=True, color="#FFF", align="right", zIndex=1),
            _el("ph-h6", "text", "s-ph", 580, 63, 70, 14, content="SUBTOTAL", fontSize=7, bold=True, color="#FFF", align="right", zIndex=1),
            _el("det-01", "field", "s-d1", 4, 0, 52, 14, fieldPath="item.codigo", fontSize=7),
            _el("det-02", "field", "s-d1", 60, 0, 340, 14, fieldPath="item.descripcion", fontSize=7),
            _el("det-03", "field", "s-d1", 404, 0, 44, 14, fieldPath="item.cantidad", fieldFmt="float2", fontSize=7, align="right"),
            _el("det-04", "field", "s-d1", 452, 0, 70, 14, fieldPath="item.precio_unitario", fieldFmt="currency", fontSize=7, align="right"),
            _el("det-05", "field", "s-d1", 526, 0, 50, 14, fieldPath="item.descuento", fieldFmt="currency", fontSize=7, align="right"),
            _el("det-06", "field", "s-d1", 580, 0, 70, 14, fieldPath="item.subtotal", fieldFmt="currency", fontSize=7, align="right", bold=True),
            _el("pf-l1", "text", "s-pf", 440, 4, 130, 12, content="SUBTOTAL IVA 12%:", fontSize=7, bold=True, align="right"),
            _el("pf-v1", "field", "s-pf", 574, 4, 70, 12, fieldPath="totales.subtotal_12", fieldFmt="currency", fontSize=7, align="right", bold=True),
            _el("pf-l2", "text", "s-pf", 440, 18, 130, 12, content="SUBTOTAL IVA 0%:", fontSize=7, bold=True, align="right"),
            _el("pf-v2", "field", "s-pf", 574, 18, 70, 12, fieldPath="totales.subtotal_0", fieldFmt="currency", fontSize=7, align="right"),
            _el("pf-l3", "text", "s-pf", 440, 32, 130, 12, content="SUBTOTAL:", fontSize=7, bold=True, align="right"),
            _el("pf-v3", "field", "s-pf", 574, 32, 70, 12, fieldPath="totales.subtotal_sin_impuestos", fieldFmt="currency", fontSize=7, align="right"),
            _el("pf-sep", "line", "s-pf", 440, 47, 204, 2, borderColor="#C0511A", borderWidth=1),
            _el("pf-l4", "text", "s-pf", 440, 51, 130, 14, content="IVA 12%:", fontSize=8, bold=True, align="right"),
            _el("pf-v4", "field", "s-pf", 574, 51, 70, 14, fieldPath="totales.iva_12", fieldFmt="currency", fontSize=8, align="right"),
            _el("pf-sep2", "line", "s-pf", 440, 67, 204, 2, borderColor="#333", borderWidth=1),
            _el("pf-l5", "text", "s-pf", 440, 71, 130, 16, content="VALOR TOTAL:", fontSize=10, bold=True, align="right", color="#C0511A"),
            _el("pf-v5", "field", "s-pf", 574, 71, 70, 16, fieldPath="totales.importe_total", fieldFmt="currency", fontSize=10, align="right", bold=True, color="#C0511A"),
            _el("rf-line", "line", "s-rf", 4, 4, 746, 1, borderColor="#CCC", borderWidth=1),
            _el("rf-txt", "text", "s-rf", 4, 8, 450, 12, content="Documento generado electrónicamente · ReportForge", fontSize=7, color="#666"),
            _el("rf-doc", "field", "s-rf", 500, 8, 100, 12, fieldPath="meta.doc_num", fontSize=7, color="#666", align="right"),
        ],
    }


def default_invoice_layout() -> Layout:
    return Layout(_default_invoice_raw())
