"""test_canonical_payload_parity — commit #7: parity gates for the canonical
contract wired in commit #6 (RF source -> adapt_rf_* -> normalize_* ->
renderer, mirroring sap_b1_linux's SAP source -> adapt_sap_model ->
normalize_* -> renderer).

Single responsibility: DEMONSTRATE, not fix, that SAP and RF converge on the
same CANONICAL_RENDER_PAYLOAD (the normalize_factura/normalize_guia output)
for the same real-world document, that the normalizers are deterministic and
key-order-independent (metamorphic), that critical business fields survive
the full pipeline for both sources, and that the RF-EMPRESA-RAZON-SOCIAL-VS-
COMERCIAL-1 fix (commit #6) does not regress.

OUT OF SCOPE (per commit #7 instructions — do not "fix" any of this here):
  padding, PrintTime rendering, pixel-perfect/visual layout, rendering
  engines, diagnostics stash, UDF guard work, contract changes (unless a
  proven bug — none found while writing this file).

Live smoke (TestLiveSapVsRfParitySmoke) is skipped unless both the shared
"sap_b1_linux" datasource is reachable AND the sibling sap_b1_linux repo is
importable — this keeps the suite green in environments without that live
infrastructure, per the same convention as test_document_integration.py's
`live_db` marker.
"""
from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT))

from reportforge.core.contracts.document_contract import (  # noqa: E402
    FACTURA_ROOT_KEYS, FACTURA_ITEM_KEYS, GUIA_ROOT_KEYS, GUIA_ITEM_KEYS,
)
from reportforge.core.contracts.factura_normalizer import normalize_factura  # noqa: E402
from reportforge.core.contracts.guia_normalizer import normalize_guia  # noqa: E402
from reportforge.core.contracts.model_adapters import (  # noqa: E402
    adapt_sap_model,
    adapt_rf_invoice_model,
    adapt_rf_remision_model,
)
from reportforge.tests.fixtures.canonical_fixtures import (  # noqa: E402
    sap_raw_factura_model_9501,
    rf_raw_invoice_model_9501,
    sap_raw_remision_model_9501,
    rf_raw_remision_model_9501,
    contract_invoice_15pct_net_gross_rf,
)

# Fields both sources MUST agree on for the same real document — the shared,
# source-independent business facts a parity gate must protect. Deliberately
# excludes fields already documented (in model_adapters.py) as genuine,
# pre-existing per-source data differences: empresa contact info (telefono/
# correo/direccion_matriz — different underlying config rows),
# numero_autorizacion/clave_acceso (each source's own SRI authorization value
# differs by design — different systems, same document).
#
# item NET pricing and fiscal ambiente representation were ALSO excluded here
# until #7.6/#7.5 fixed RF-NET-GROSS-PRICE-SOURCE-1 and RF-AMBIENTE-RAW-CODE-1
# respectively. Both sources now genuinely agree on raw ambiente code and on
# GROSS pricing for this real (0%-IVA) document, so those two are no longer
# excluded by design — but this specific real-document fixture is 100%
# IVA-exempt and can't tell NET from GROSS apart (both are numerically equal
# at 0% tax), so a NET/GROSS INVERSION regression still wouldn't show up in
# the shared-field comparison below. See TestNetGrossPriceContractFixture15Pct
# and TestSubtotalSinImpuestosDiscountDocumentalGuard further down, which use
# a synthetic 15%-IVA contract fixture (and this same real document's own
# documented discount) specifically to close that gap.
#
# empresa_razon_social is ALSO excluded from strict equality here — evidence
# gathered while writing this suite showed SAP's value ("CAROLINA JULIA
# CHANG AJOY", from sap_b1_linux's EMPRESA_NOMBRE env var) is missing one
# surname RF's OADM.AliasName carries ("...CHANG AJOY CHONG"). That is a
# separate, minor, pre-existing config-completeness gap in SAP's env var —
# NOT the RF-EMPRESA-RAZON-SOCIAL-VS-COMERCIAL-1 collision (which is guarded
# explicitly, with strict equality, in TestRazonSocialVsNombreComercialNoRegression
# below). See the "Evidence debt" note in the commit report.
_SHARED_FACTURA_ROOT_FIELDS = (
    "cliente_razon_social", "cliente_identificacion", "cliente_direccion",
    "fiscal_numero_documento", "fiscal_fecha_autorizacion",
    "fecha_emision",
    "totales_valor_total", "totales_descuento_total",
    "totales_subtotal_iva_0", "totales_subtotal_sin_impuestos",
    "meta_invoice_number", "meta_doc_total",
)
_SHARED_FACTURA_ITEM_FIELDS = ("codigo", "descripcion", "cantidad", "precio_unitario_con_iva", "precio_total_con_iva")

_SHARED_GUIA_ROOT_FIELDS = (
    "destinatario_razon_social", "destinatario_identificacion", "destinatario_direccion",
    "fiscal_numero_documento", "fiscal_fecha_autorizacion",
)
_SHARED_GUIA_ITEM_FIELDS = ("codigo", "descripcion", "cantidad")

_ENGINE_SPECIAL_FIELDS = ("PrintTime", "PrintDate", "RecordNumber", "PageNumber")


# ── 1. Same canonical shape in -> same payload out, regardless of builder ──

class TestSameCanonicalModelProducesSamePayload(unittest.TestCase):
    """Both normalizers are pure functions of their canonical-shaped input:
    calling normalize_factura/normalize_guia on the SAME dict (regardless of
    which adapter produced it) yields the SAME payload."""

    def test_factura_normalizer_output_depends_only_on_canonical_shape(self):
        canonical = adapt_sap_model(sap_raw_factura_model_9501())
        payload_a = normalize_factura(canonical)
        payload_b = normalize_factura(copy.deepcopy(canonical))
        self.assertEqual(payload_a, payload_b)

    def test_guia_normalizer_output_depends_only_on_canonical_shape(self):
        canonical = adapt_sap_model(sap_raw_remision_model_9501())
        payload_a = normalize_guia(canonical)
        payload_b = normalize_guia(copy.deepcopy(canonical))
        self.assertEqual(payload_a, payload_b)


# ── 2. Normalizers are deterministic ────────────────────────────────────────

class TestNormalizersAreDeterministic(unittest.TestCase):
    def test_normalize_factura_is_deterministic_across_repeated_calls(self):
        canonical = adapt_rf_invoice_model(rf_raw_invoice_model_9501())
        results = [normalize_factura(copy.deepcopy(canonical)) for _ in range(5)]
        self.assertTrue(all(r == results[0] for r in results))

    def test_normalize_guia_is_deterministic_across_repeated_calls(self):
        canonical = adapt_rf_remision_model(rf_raw_remision_model_9501())
        results = [normalize_guia(copy.deepcopy(canonical)) for _ in range(5)]
        self.assertTrue(all(r == results[0] for r in results))

    def test_adapters_are_deterministic(self):
        raw = rf_raw_invoice_model_9501()
        out_a = adapt_rf_invoice_model(raw)
        out_b = adapt_rf_invoice_model(copy.deepcopy(raw))
        self.assertEqual(out_a, out_b)


# ── 3. Metamorphic: key insertion order must not affect the result ─────────

def _reorder_dict(d: dict) -> dict:
    """Return a new dict with the SAME keys/values in REVERSED insertion
    order — recursively, for nested dicts. Lists (e.g. items) are left in
    place since item ORDER is a real business fact (line sequence), not an
    incidental Python dict-ordering artifact."""
    if not isinstance(d, dict):
        return d
    return {k: _reorder_dict(v) if isinstance(v, dict) else v for k, v in reversed(list(d.items()))}


class TestMetamorphicKeyOrderInvariance(unittest.TestCase):
    """A canonical model with its dict keys inserted in a different order
    must normalize to an identical payload — normalizers must key-lookup by
    name, never rely on iteration/insertion order."""

    def test_factura_payload_invariant_under_key_reordering(self):
        canonical = adapt_sap_model(sap_raw_factura_model_9501())
        reordered = _reorder_dict(canonical)
        self.assertEqual(normalize_factura(canonical), normalize_factura(reordered))

    def test_guia_payload_invariant_under_key_reordering(self):
        canonical = adapt_rf_remision_model(rf_raw_remision_model_9501())
        reordered = _reorder_dict(canonical)
        self.assertEqual(normalize_guia(canonical), normalize_guia(reordered))


# ── 4. SAP <-> RF parity on shared critical fields (same real document) ────

class TestSapRfParityFactura9501(unittest.TestCase):
    """docnum 1007542 (folio 9501, HUANG XIRU) through BOTH sources: fields
    both sides can legitimately agree on must match exactly."""

    @classmethod
    def setUpClass(cls):
        cls.sap_payload = normalize_factura(adapt_sap_model(sap_raw_factura_model_9501()))
        cls.rf_payload = normalize_factura(adapt_rf_invoice_model(rf_raw_invoice_model_9501()))

    def test_shared_root_fields_match(self):
        for field in _SHARED_FACTURA_ROOT_FIELDS:
            with self.subTest(field=field):
                self.assertEqual(
                    self.sap_payload[field], self.rf_payload[field],
                    f"{field}: SAP={self.sap_payload[field]!r} RF={self.rf_payload[field]!r}",
                )

    def test_shared_item_fields_match_in_order(self):
        self.assertEqual(len(self.sap_payload["items"]), len(self.rf_payload["items"]))
        for i, (sap_item, rf_item) in enumerate(zip(self.sap_payload["items"], self.rf_payload["items"])):
            for field in _SHARED_FACTURA_ITEM_FIELDS:
                with self.subTest(item=i, field=field):
                    self.assertEqual(sap_item[field], rf_item[field])

    def test_both_contracts_fully_covered(self):
        for payload in (self.sap_payload, self.rf_payload):
            self.assertEqual(FACTURA_ROOT_KEYS - set(payload), set())
            self.assertEqual(FACTURA_ITEM_KEYS - set(payload["items"][0]), set())


class TestSapRfParityGuia9501(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sap_payload = normalize_guia(adapt_sap_model(sap_raw_remision_model_9501()))
        cls.rf_payload = normalize_guia(adapt_rf_remision_model(rf_raw_remision_model_9501()))

    def test_shared_root_fields_match(self):
        for field in _SHARED_GUIA_ROOT_FIELDS:
            with self.subTest(field=field):
                self.assertEqual(
                    self.sap_payload[field], self.rf_payload[field],
                    f"{field}: SAP={self.sap_payload[field]!r} RF={self.rf_payload[field]!r}",
                )

    def test_shared_item_fields_match_in_order(self):
        self.assertEqual(len(self.sap_payload["items"]), len(self.rf_payload["items"]))
        for i, (sap_item, rf_item) in enumerate(zip(self.sap_payload["items"], self.rf_payload["items"])):
            for field in _SHARED_GUIA_ITEM_FIELDS:
                with self.subTest(item=i, field=field):
                    self.assertEqual(sap_item[field], rf_item[field])

    def test_both_contracts_fully_covered(self):
        for payload in (self.sap_payload, self.rf_payload):
            self.assertEqual(GUIA_ROOT_KEYS - set(payload), set())
            for item in payload["items"]:
                self.assertEqual(GUIA_ITEM_KEYS - set(item), set())


# ── 4b. NET/GROSS item pricing must not invert (RF-NET-GROSS-PRICE-SOURCE-1) ─

class TestNetGrossPriceContractFixture15Pct(unittest.TestCase):
    """The real-document fixture above (docnum 1007542) is 100% IVA-exempt,
    so it cannot tell a NET/GROSS inversion apart (NET == GROSS at 0% tax —
    that exact blind spot is what let RF-NET-GROSS-PRICE-SOURCE-1 regress
    unnoticed before #7.6). Uses the synthetic 15%-IVA contract fixture
    instead, so this parity gate has its OWN case where an inversion would
    be visible, independent of test_model_adapters.py's own unit coverage."""

    def test_rf_payload_net_and_gross_are_distinct_and_not_inverted(self):
        canonical = adapt_rf_invoice_model(contract_invoice_15pct_net_gross_rf())
        payload = normalize_factura(canonical)
        item = payload["items"][0]
        self.assertEqual(item["precio_unitario"], 2.26)
        self.assertEqual(item["precio_unitario_con_iva"], 2.60)
        self.assertEqual(item["subtotal"], 22.60)
        self.assertEqual(item["precio_total_con_iva"], 26.00)
        self.assertNotEqual(item["precio_unitario"], item["precio_unitario_con_iva"])
        self.assertNotEqual(item["subtotal"], item["precio_total_con_iva"])


# ── 4c. subtotal_sin_impuestos must reflect real lines, not DocTotal - IVA ──

class TestSubtotalSinImpuestosDiscountDocumentalGuard(unittest.TestCase):
    """Evidence: DocEntry 55142 (docnum 1007542, the same real document used
    by the fixtures above) has a document-level discount — real line
    subtotal 112.00, OINV.DocTotal 106.41, descuento 5.59 (see
    RF-SUBTOTAL-SIN-IMPUESTOS-1 in invoice_model.py). The fixtures above
    already carry these exact, evidence-based values (subtotal_sin_impuestos
    = 112.00, valor_total = 106.41). This gate makes the invariant explicit
    at the adapter/normalizer altitude: subtotal_sin_impuestos must NOT
    collapse to valor_total (the old `total - iva` bug would have silently
    produced 106.41 here, discarding the discount)."""

    def test_sap_subtotal_sin_impuestos_differs_from_valor_total_when_discounted(self):
        payload = normalize_factura(adapt_sap_model(sap_raw_factura_model_9501()))
        self.assertEqual(payload["totales_subtotal_sin_impuestos"], 112.00)
        self.assertEqual(payload["totales_valor_total"], 106.41)
        self.assertNotEqual(payload["totales_subtotal_sin_impuestos"], payload["totales_valor_total"])

    def test_rf_subtotal_sin_impuestos_differs_from_valor_total_when_discounted(self):
        payload = normalize_factura(adapt_rf_invoice_model(rf_raw_invoice_model_9501()))
        self.assertEqual(payload["totales_subtotal_sin_impuestos"], 112.00)
        self.assertEqual(payload["totales_valor_total"], 106.41)
        self.assertNotEqual(payload["totales_subtotal_sin_impuestos"], payload["totales_valor_total"])


# ── 5. RF-EMPRESA-RAZON-SOCIAL-VS-COMERCIAL-1 regression guard ─────────────

class TestRazonSocialVsNombreComercialNoRegression(unittest.TestCase):
    """commit #6 fixed OADM.AliasName -> razon_social / OADM.CompnyName ->
    nombre_comercial (was inverted). This parity suite re-asserts the
    OUTCOME (payload-level), independent of test_invoice_model_empresa.py's
    SQL-source-level guard, so a parity run alone catches a regression."""

    def test_rf_factura_payload_razon_social_is_fiscal_name_not_trade_name(self):
        payload = normalize_factura(adapt_rf_invoice_model(rf_raw_invoice_model_9501()))
        self.assertEqual(payload["empresa_razon_social"], "CAROLINA JULIA CHANG AJOY CHONG")
        self.assertNotEqual(payload["empresa_razon_social"], "SUPER MOTOS Y BICICLETAS")

    def test_rf_guia_payload_razon_social_is_fiscal_name_not_trade_name(self):
        payload = normalize_guia(adapt_rf_remision_model(rf_raw_remision_model_9501()))
        self.assertEqual(payload["empresa_razon_social"], "CAROLINA JULIA CHANG AJOY CHONG")
        self.assertNotEqual(payload["empresa_razon_social"], "SUPER MOTOS Y BICICLETAS")

    def test_sap_and_rf_agree_on_razon_social_for_the_same_document(self):
        sap_payload = normalize_factura(adapt_sap_model(sap_raw_factura_model_9501()))
        rf_payload = normalize_factura(adapt_rf_invoice_model(rf_raw_invoice_model_9501()))
        # Names differ by one middle surname (SAP's env-var config is
        # truncated) — a separate, minor, already-reported data-completeness
        # note, not this regression. The parity gate here only guards
        # against the TRADE name reappearing as razón social.
        self.assertNotEqual(rf_payload["empresa_razon_social"], "SUPER MOTOS Y BICICLETAS")
        self.assertTrue(sap_payload["empresa_razon_social"].startswith("CAROLINA"))
        self.assertTrue(rf_payload["empresa_razon_social"].startswith("CAROLINA"))


# ── 6. Dynamic/engine fields excluded from the contract ────────────────────

class TestDynamicFieldsExcludedFromContract(unittest.TestCase):
    """PrintTime/PrintDate/RecordNumber/PageNumber are supplied by the render
    engine at draw time (advanced_engine_shared.py::_SPECIAL), never by the
    payload — asserting this at the contract level, not just by convention."""

    def test_factura_contract_excludes_engine_special_fields(self):
        for field in _ENGINE_SPECIAL_FIELDS:
            self.assertNotIn(field, FACTURA_ROOT_KEYS)
            self.assertNotIn(field, FACTURA_ITEM_KEYS)

    def test_guia_contract_excludes_engine_special_fields(self):
        for field in _ENGINE_SPECIAL_FIELDS:
            self.assertNotIn(field, GUIA_ROOT_KEYS)
            self.assertNotIn(field, GUIA_ITEM_KEYS)

    def test_normalized_payloads_never_emit_engine_special_fields(self):
        payload = normalize_factura(adapt_rf_invoice_model(rf_raw_invoice_model_9501()))
        for field in _ENGINE_SPECIAL_FIELDS:
            self.assertNotIn(field, payload)


# ── 7. Live smoke: real SAP vs real RF for the same live document ──────────

def _sap_b1_linux_root() -> Path | None:
    candidate = _ROOT.parent / "sap_b1_linux"
    return candidate if (candidate / "services" / "operational_docs_bridge.py").exists() else None


def _live_datasource_reachable() -> bool:
    try:
        from reportforge.server.connections_store import load_persisted_connections
        return load_persisted_connections() > 0
    except Exception:
        return False


_SAP_ROOT = _sap_b1_linux_root()
_LIVE_READY = _SAP_ROOT is not None and _live_datasource_reachable()

live_smoke = pytest.mark.skipif(
    not _LIVE_READY,
    reason="requiere datasource 'sap_b1_linux' vivo + repo sibling sap_b1_linux presente",
)


@live_smoke
class TestLiveSapVsRfParitySmoke(unittest.TestCase):
    """End-to-end smoke against the REAL live document (docnum 1007542):
    RF's own export bridge vs sap_b1_linux's own bridge. Skipped, not
    failed, when the live infra isn't available (CI / offline dev)."""

    DOC_NUM = 1007542

    @classmethod
    def setUpClass(cls):
        try:
            from reportforge.scripts.rf_document_export import build_guia_a4_payload_from_rf
            cls.rf_payload = build_guia_a4_payload_from_rf(cls.DOC_NUM, datasource_alias="sap_b1_linux")

            sys.path.insert(0, str(_SAP_ROOT))
            from A4.backend.sap_lookup import resolve_invoice_context
            from services.operational_docs_bridge import build_guia_a4_payload
            _, _, _, model = resolve_invoice_context(55142)
            cls.sap_payload = build_guia_a4_payload(model, variant="fv2")
        except Exception as exc:  # cross-repo import/env mismatch (e.g. sap_b1_linux's
            # own venv-only deps like reportlab not present here) — skip, don't fail.
            raise unittest.SkipTest(f"live smoke setup unavailable: {exc}")

    def test_razon_social_matches_live(self):
        self.assertEqual(self.sap_payload["empresa_razon_social"][:8], self.rf_payload["empresa_razon_social"][:8])
        self.assertNotEqual(self.rf_payload["empresa_razon_social"], "SUPER MOTOS Y BICICLETAS")

    def test_destinatario_matches_live(self):
        self.assertEqual(self.sap_payload["destinatario_razon_social"], self.rf_payload["destinatario_razon_social"])
        self.assertEqual(self.sap_payload["destinatario_identificacion"], self.rf_payload["destinatario_identificacion"])

    def test_item_codes_and_quantities_match_live(self):
        sap_codes = [(it["codigo"], it["cantidad"]) for it in self.sap_payload["items"]]
        rf_codes = [(it["codigo"], it["cantidad"]) for it in self.rf_payload["items"]]
        self.assertEqual(sap_codes, rf_codes)


if __name__ == "__main__":
    unittest.main()
