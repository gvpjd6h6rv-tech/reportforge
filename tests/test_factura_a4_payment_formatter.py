import json
from pathlib import Path


def test_factura_a4_payment_description_uses_forma_pago_formatter():
    layout = json.loads(Path("reportforge/layouts/factura_a4.json").read_text(encoding="utf-8"))

    pay_desc = next(
        element for element in layout["elements"]
        if element["id"] == "rf-pay-desc"
    )

    assert pay_desc["fieldPath"] == "forma_pago_descripcion"
    assert pay_desc["fieldFmt"] == "forma_pago"
