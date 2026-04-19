from __future__ import annotations

from .resolvers.layout_loader import layout_from_dict
from .doc_registry_liquidacion import LIQUIDACION_FIELD_TREE, LIQUIDACION_SAMPLE, _liquidacion_layout_raw as liquidacion_layout_raw
from .doc_registry_nota_credito import NOTA_CREDITO_FIELD_TREE, NOTA_CREDITO_SAMPLE, _nota_credito_layout_raw as nota_credito_layout_raw
from .doc_registry_remision import REMISION_FIELD_TREE, REMISION_SAMPLE, _remision_layout_raw as remision_layout_raw
from .doc_registry_retencion import RETENCION_FIELD_TREE, RETENCION_SAMPLE, _retencion_layout_raw as retencion_layout_raw


def _factura_layout_raw():
    return __import__(
        "core.render.resolvers.layout_loader",
        fromlist=["_default_raw"]
    )._default_raw()

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
        layout_raw_fn=_factura_layout_raw,
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
        layout_raw_fn=remision_layout_raw,
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
        layout_raw_fn=nota_credito_layout_raw,
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
        layout_raw_fn=retencion_layout_raw,
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
        layout_raw_fn=liquidacion_layout_raw,
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
