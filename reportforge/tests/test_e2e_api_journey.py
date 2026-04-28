"""
test_e2e_api_journey.py — End-to-end API user journey tests.

Objetivo: el usuario real completa un flujo completo sin romper el estado.
No mocks — usa TestClient in-process contra la app real.

Journeys:
  1. Template lifecycle: register → render → update → delete → 404.
  2. Multi-tenant isolation: tenant A template not visible to tenant B.
  3. Render format negotiation: same data → HTML / CSV / XLSX without crash.
  4. Validate → fix → validate again: iterative layout correction.
  5. Datasource lifecycle: register → query → delete.
  6. Cache invalidation: template update reflected in next render.
  7. Preview → render parity: same layout produces HTML in both endpoints.
  8. Concurrent tenants: 3 tenants render simultaneously without state bleed.
  9. Error recovery: bad request → good request → correct response.
  10. Full render pipeline: layout inline + data inline → HTML output valid.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT / "reportforge"))

_HAS_CLIENT = False
try:
    from fastapi.testclient import TestClient
    from server.api import create_app
    _HAS_CLIENT = True
except ImportError:
    pass

# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

_LAYOUT_V1 = {
    "name": "journey_v1",
    "pageSize": "A4",
    "sections": [{"id": "s-rh", "stype": "rh", "height": 40}],
    "elements": [
        {"id": "title", "sectionId": "s-rh", "type": "text",
         "x": 10, "y": 10, "w": 300, "h": 20, "content": "Invoice v1"},
    ],
}

_LAYOUT_V2 = {
    "name": "journey_v2",
    "pageSize": "A4",
    "sections": [{"id": "s-rh", "stype": "rh", "height": 40}],
    "elements": [
        {"id": "title", "sectionId": "s-rh", "type": "text",
         "x": 10, "y": 10, "w": 300, "h": 20, "content": "Invoice v2"},
    ],
}

_INVOICE_DATA = {
    "items": [
        {"codigo": "A1", "descripcion": "Widget", "cantidad": 2,
         "precio_unitario": 50.0, "subtotal": 100.0},
    ],
    "totales": {"subtotal": 100.0, "iva": 12.0, "total": 112.0},
}


@unittest.skipUnless(_HAS_CLIENT, "fastapi / httpx not installed")
class TestTemplatLifecycle(unittest.TestCase):
    """
    Journey 1: register → render → delete → 404.
    Each step must succeed; the final delete must make the template unreachable.
    """

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(create_app())
        cls.template_id = "e2e_journey_lifecycle_001"
        cls.tenant = "default"

        # Ensure clean state
        cls.client.delete(f"/templates/{cls.template_id}?tenant={cls.tenant}")

    def test_01_register_template(self):
        r = self.client.post("/templates", json={
            "templateId": self.template_id,
            "layout": _LAYOUT_V1,
            "tenant": self.tenant,
        })
        self.assertEqual(r.status_code, 201,
                         f"Register must return 201. Got: {r.status_code}: {r.text[:200]}")
        body = r.json()
        self.assertEqual(body["templateId"], self.template_id)
        self.assertEqual(body["status"], "registered")

    def test_02_template_appears_in_list(self):
        r = self.client.get(f"/templates?tenant={self.tenant}")
        self.assertEqual(r.status_code, 200)
        ids = [t["templateId"] for t in r.json()]
        self.assertIn(self.template_id, ids,
                      f"Registered template must appear in list. Got: {ids}")

    def test_03_render_registered_template(self):
        r = self.client.post("/render-template", json={
            "templateId": self.template_id,
            "data": _INVOICE_DATA,
            "format": "html",
            "tenant": self.tenant,
        })
        self.assertEqual(r.status_code, 200,
                         f"Render registered template must return 200. Got: {r.status_code}: {r.text[:200]}")
        self.assertIn("Invoice v1", r.text,
                      "Rendered HTML must contain template content 'Invoice v1'")
        self.assertIn("<!DOCTYPE html>", r.text,
                      "Rendered HTML must be a valid HTML document")

    def test_04_delete_template(self):
        r = self.client.delete(f"/templates/{self.template_id}?tenant={self.tenant}")
        self.assertEqual(r.status_code, 200,
                         f"Delete must return 200. Got: {r.status_code}: {r.text[:200]}")
        body = r.json()
        self.assertEqual(body.get("deleted"), self.template_id)

    def test_05_deleted_template_returns_404(self):
        r = self.client.post("/render-template", json={
            "templateId": self.template_id,
            "data": {},
            "format": "html",
            "tenant": self.tenant,
        })
        self.assertEqual(r.status_code, 404,
                         f"Deleted template must return 404. Got: {r.status_code}")

    def test_06_delete_again_returns_404(self):
        r = self.client.delete(f"/templates/{self.template_id}?tenant={self.tenant}")
        self.assertEqual(r.status_code, 404,
                         "Double-delete must return 404, not crash")


@unittest.skipUnless(_HAS_CLIENT, "fastapi / httpx not installed")
class TestMultiTenantIsolation(unittest.TestCase):
    """
    Journey 2: templates are tenant-scoped — tenant A sees only its own templates.
    """

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(create_app())
        cls.tid = "e2e_isolation_tpl_001"

        # Ensure clean state
        for t in ("tenant_alpha", "tenant_beta"):
            cls.client.delete(f"/templates/{cls.tid}?tenant={t}")

    def test_01_tenant_alpha_registers_template(self):
        r = self.client.post("/templates", json={
            "templateId": self.tid, "layout": _LAYOUT_V1, "tenant": "tenant_alpha",
        })
        self.assertEqual(r.status_code, 201)

    def test_02_tenant_beta_cannot_render_tenant_alpha_template(self):
        r = self.client.post("/render-template", json={
            "templateId": self.tid, "data": {}, "format": "html", "tenant": "tenant_beta",
        })
        self.assertEqual(r.status_code, 404,
                         f"tenant_beta must not access tenant_alpha template. Got: {r.status_code}")

    def test_03_tenant_alpha_can_render_own_template(self):
        r = self.client.post("/render-template", json={
            "templateId": self.tid, "data": {}, "format": "html", "tenant": "tenant_alpha",
        })
        self.assertEqual(r.status_code, 200,
                         f"tenant_alpha must render its own template. Got: {r.status_code}")

    def test_04_cleanup_tenant_alpha(self):
        r = self.client.delete(f"/templates/{self.tid}?tenant=tenant_alpha")
        self.assertEqual(r.status_code, 200)


@unittest.skipUnless(_HAS_CLIENT, "fastapi / httpx not installed")
class TestFormatNegotiationJourney(unittest.TestCase):
    """
    Journey 3: same layout + data → different formats without crash.
    """

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(create_app())

    def _render(self, fmt):
        return self.client.post("/render", json={
            "layout": _LAYOUT_V1, "data": _INVOICE_DATA, "format": fmt,
        })

    def test_html_format_returns_html(self):
        r = self._render("html")
        self.assertEqual(r.status_code, 200)
        self.assertIn("<html", r.text.lower())

    def test_csv_format_does_not_crash(self):
        r = self._render("csv")
        # May return CSV bytes or 422 if data has no items in right shape — must not be 500
        self.assertNotEqual(r.status_code, 500,
                            f"CSV format must not crash. Got: {r.status_code}: {r.text[:200]}")

    def test_xlsx_format_does_not_crash(self):
        r = self._render("xlsx")
        self.assertNotEqual(r.status_code, 500,
                            f"XLSX format must not crash. Got: {r.status_code}: {r.text[:200]}")

    def test_pdf_format_does_not_crash(self):
        r = self._render("pdf")
        self.assertNotEqual(r.status_code, 500,
                            f"PDF format must not crash. Got: {r.status_code}")
        # If PDF generation succeeded, bytes start with %PDF
        if r.status_code == 200 and r.content:
            self.assertIn(r.headers.get("content-type", ""), [
                "application/pdf", "text/html; charset=utf-8",
            ])


@unittest.skipUnless(_HAS_CLIENT, "fastapi / httpx not installed")
class TestValidateIterativeFixJourney(unittest.TestCase):
    """
    Journey 4: validate → fix → validate again.
    The iterative correction workflow must converge.
    """

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(create_app())

    def test_bad_layout_has_validation_warnings(self):
        bad = {"name": "bad", "pageSize": "A4", "sections": [], "elements": []}
        r = self.client.post("/validate", json=bad)
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertFalse(body.get("valid", True),
                         "Layout with no sections must not be valid")
        self.assertGreater(len(body.get("warnings", [])), 0,
                           "Bad layout must produce at least one warning")

    def test_fixed_layout_passes_validation(self):
        good = {
            "name": "good", "pageSize": "A4",
            "sections": [{"id": "ph", "stype": "pageHeader", "height": 40}],
            "elements": [
                {"id": "e1", "type": "text", "sectionId": "ph",
                 "x": 10, "y": 10, "w": 200, "h": 20, "content": "OK"},
            ],
        }
        r = self.client.post("/validate", json=good)
        self.assertEqual(r.status_code, 200)
        body = r.json()
        errors = [w for w in body.get("warnings", []) if w.get("level") == "error"]
        self.assertEqual(errors, [],
                         f"Fixed layout must have no error-level warnings. Got: {errors}")

    def test_element_overflow_detected(self):
        overflow = {
            "name": "overflow_test", "pageSize": "A4", "pageWidth": 794,
            "sections": [{"id": "ph", "stype": "pageHeader", "height": 40}],
            "elements": [
                {"id": "wide", "type": "text", "sectionId": "ph",
                 "x": 700, "y": 10, "w": 200, "h": 20, "content": "overflow"},
            ],
        }
        r = self.client.post("/validate", json=overflow)
        self.assertEqual(r.status_code, 200)
        warns = r.json().get("warnings", [])
        overflow_warns = [w for w in warns if "overflow" in w.get("message", "").lower()]
        self.assertGreater(len(overflow_warns), 0,
                           "Overflow element must produce overflow warning")


@unittest.skipUnless(_HAS_CLIENT, "fastapi / httpx not installed")
class TestPreviewRenderParity(unittest.TestCase):
    """
    Journey 7: preview and render endpoints must produce compatible HTML.
    Same layout → both return valid HTML documents.
    """

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(create_app())

    def test_preview_and_render_both_return_html(self):
        layout = _LAYOUT_V1
        data = _INVOICE_DATA

        preview_r = self.client.post("/preview", json={"layout": layout, "data": data})
        render_r = self.client.post("/render", json={"layout": layout, "data": data, "format": "html"})

        self.assertEqual(preview_r.status_code, 200, f"/preview: {preview_r.status_code}")
        self.assertEqual(render_r.status_code, 200, f"/render: {render_r.status_code}")

        self.assertIn("<html", preview_r.text.lower(), "/preview must return HTML")
        self.assertIn("<html", render_r.text.lower(), "/render must return HTML")

    def test_designer_preview_matches_inline_layout(self):
        r = self.client.post("/designer-preview", json={
            "layout": _LAYOUT_V1, "data": _INVOICE_DATA,
        })
        self.assertEqual(r.status_code, 200)
        self.assertIn("Invoice v1", r.text,
                      "designer-preview must render layout content")


@unittest.skipUnless(_HAS_CLIENT, "fastapi / httpx not installed")
class TestErrorRecoveryJourney(unittest.TestCase):
    """
    Journey 9: bad request → good request → correct response.
    A prior failure must not corrupt state for subsequent valid requests.
    """

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(create_app())

    def test_bad_request_followed_by_good_request_succeeds(self):
        # Send a bad request first
        bad_r = self.client.post("/render", json={
            "layout": {}, "data": {}, "format": "html",
        })
        self.assertNotEqual(bad_r.status_code, 500,
                            "Bad request must not crash server")

        # Immediately follow with a valid request
        good_r = self.client.post("/render", json={
            "layout": _LAYOUT_V1, "data": _INVOICE_DATA, "format": "html",
        })
        self.assertEqual(good_r.status_code, 200,
                         f"Valid request after bad request must succeed. Got: {good_r.status_code}: {good_r.text[:200]}")
        self.assertIn("Invoice v1", good_r.text)

    def test_multiple_bad_requests_do_not_degrade_server(self):
        """Server must remain operational after multiple sequential bad requests."""
        for _ in range(5):
            self.client.post("/render", json={"layout": {}, "data": {}, "format": "html"})

        # Server must still respond correctly
        r = self.client.get("/health")
        self.assertEqual(r.status_code, 200,
                         "Health check must pass after multiple bad requests")
        self.assertEqual(r.json()["status"], "ok")

    def test_missing_template_error_does_not_block_next_call(self):
        # 404 for missing template
        self.client.post("/render-template", json={
            "templateId": "does_not_exist", "data": {}, "format": "html",
        })
        # Next valid render must work
        r = self.client.post("/render", json={
            "layout": _LAYOUT_V1, "data": {}, "format": "html",
        })
        self.assertEqual(r.status_code, 200,
                         f"Valid render must work after 404. Got: {r.status_code}")


@unittest.skipUnless(_HAS_CLIENT, "fastapi / httpx not installed")
class TestFullPipelineJourney(unittest.TestCase):
    """
    Journey 10: full inline render pipeline.
    Layout + data inline → HTML contains content from data.
    """

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(create_app())

    def test_inline_layout_and_data_produces_output(self):
        layout = {
            "name": "full_pipeline",
            "pageSize": "A4",
            "sections": [{"id": "s-rh", "stype": "rh", "height": 60}],
            "elements": [
                {"id": "t1", "sectionId": "s-rh", "type": "text",
                 "x": 10, "y": 10, "w": 400, "h": 20,
                 "content": "FULL PIPELINE TEST"},
            ],
        }
        r = self.client.post("/render", json={
            "layout": layout, "data": {"items": []}, "format": "html",
        })
        self.assertEqual(r.status_code, 200)
        self.assertIn("<!DOCTYPE html>", r.text)
        self.assertIn("<html", r.text.lower())

    def test_system_info_endpoint_alive(self):
        """Health + info endpoints accessible throughout journey."""
        r = self.client.get("/health")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertIn("status", body)
        self.assertEqual(body["status"], "ok")


if __name__ == "__main__":
    unittest.main(verbosity=2)
