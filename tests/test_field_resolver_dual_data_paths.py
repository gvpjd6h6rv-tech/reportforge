from reportforge.core.render.resolvers.field_resolver import FieldResolver


def test_flat_key_wins_over_nested_alias():
    resolver = FieldResolver({
        "empresa_ruc": "PLANO_GANA",
        "empresa": {"ruc": "ANIDADO_NO_GANA"},
    })

    assert resolver.get("empresa_ruc") == "PLANO_GANA"


def test_flat_template_path_reads_nested_data_when_flat_key_is_missing():
    resolver = FieldResolver({
        "empresa": {"ruc": "0913042669001"},
        "fiscal": {
            "clave_acceso": "2602202601091304266900120021010000204821234567818",
            "numero_autorizacion": "2602202601091304266900120021010000204821234567818",
        },
        "cliente": {"razon_social": "CONSUMIDOR FINAL"},
        "forma_pago": {"valor": 3.50},
        "totales": {"valor_total": 3.50},
    })

    assert resolver.get("empresa_ruc") == "0913042669001"
    assert resolver.get("fiscal_clave_acceso") == "2602202601091304266900120021010000204821234567818"
    assert resolver.get("fiscal_numero_autorizacion") == "2602202601091304266900120021010000204821234567818"
    assert resolver.get("cliente_razon_social") == "CONSUMIDOR FINAL"
    assert resolver.get("forma_pago_valor") == 3.50
    assert resolver.get("totales_valor_total") == 3.50


def test_nested_template_path_reads_flat_data_when_nested_key_is_missing():
    resolver = FieldResolver({
        "empresa_ruc": "0913042669001",
        "fiscal_clave_acceso": "2602202601091304266900120021010000204821234567818",
        "cliente_razon_social": "CONSUMIDOR FINAL",
    })

    assert resolver.get("empresa.ruc") == "0913042669001"
    assert resolver.get("fiscal.clave_acceso") == "2602202601091304266900120021010000204821234567818"
    assert resolver.get("cliente.razon_social") == "CONSUMIDOR FINAL"


def test_current_item_resolution_stays_unchanged():
    resolver = FieldResolver({}, item={
        "codigo": "BLLAV.05",
        "descripcion": "LLAVE SACA CONOS TAIWAN (PAR)",
    })

    assert resolver.get("item.codigo") == "BLLAV.05"
    assert resolver.get("item.descripcion") == "LLAVE SACA CONOS TAIWAN (PAR)"
