from reportforge.core.render.resolvers.field_resolver import FieldResolver
from reportforge_server_shared import _DEMO_DATA


def test_factura_a4_demo_footer_fields_are_populated():
    resolver = FieldResolver(_DEMO_DATA)

    required = [
        "forma_pago_descripcion",
        "forma_pago_valor",
        "cliente_telefono",
        "cliente_email",
        "cliente_direccion",
        "empresa_agente_retencion",
        "totales_subtotal_15",
        "totales_subtotal_iva_0",
        "totales_subtotal_no_objeto_iva",
        "totales_subtotal_exento_iva",
        "totales_subtotal_sin_impuestos",
        "totales_descuento_total",
        "totales_valor_ice",
        "totales_iva_15",
        "totales_propina",
        "totales_valor_total",
    ]

    missing = [field for field in required if resolver.get(field, "") == ""]
    assert missing == []


def test_factura_a4_demo_detail_items_are_flat_for_item_field_paths():
    first_item = _DEMO_DATA["items"][0]
    resolver = FieldResolver(_DEMO_DATA, item=first_item)

    assert resolver.get("item.codigo") == "BTUB0.62"
    assert resolver.get("item.descripcion") == "TUBO 20x2 125 AV DURO TAILANDIA"
    assert resolver.get("item.cantidad") == 3.0
    assert resolver.get("item.precio_unitario") == 2.0
    assert resolver.get("item.subtotal") == 6.0
