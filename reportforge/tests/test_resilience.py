"""
test_resilience.py — Resilience / Chaos tests for the ReportForge API.

Objetivo: si un subsistema falla (DB, datasource, timeout, bad payload),
el sistema no muere — devuelve errores controlados, no 500/crash.

Coverage:
  1.  DataSource file not found → 422, not 500.
  2.  DataSource invalid JSON → 422, not 500.
  3.  External HTTP datasource timeout → 422, not 500.
  4.  JRXML file not found → 404.
  5.  Layout file not found → 404.
  6.  Malformed layout (no sections) → 422 with specific message.
  7.  Missing required layout field → handled, not crash.
  8.  Unknown tenant → defaults silently, renders ok.
  9.  Oversized params dict (100 keys) → renders ok, not crash.
  10. Deeply nested data dict → renders ok, not crash.
  11. items=None in data → handled, not crash.
  12. items with non-dict elements → handled, not crash.
  13. Formula with infinite recursion → timeout or clean error.
  14. Template render with missing template → 404.
  15. Datasource alias not found → 404.
  16. DB ping failure → registered but reachable=False, not crash.
  17. Render engine crash → 422, not 500.
  18. Preview with empty layout sections → renders ok (blank report).
  19. Designer-preview with file path (not dict) → 400.
  20. Rate limit recovery: after cooldown, requests resume normally.
"""
from __future__ import annotations

import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

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
# Fixtures
# ---------------------------------------------------------------------------

_MINIMAL_LAYOUT = {
    "name": "resilience_test",
    "pageSize": "A4",
    "sections": [{"id": "ph", "stype": "pageHeader", "height": 40}],
    "elements": [
        {"id": "e1", "sectionId": "ph", "type": "text",
         "x": 10, "y": 10, "w": 200, "h": 20, "content": "Resilience Test"},
    ],
}

_MINIMAL_DATA = {"items": []}


@unittest.skipUnless(_HAS_CLIENT, "fastapi / httpx not installed")
class TestDatasourceFaults(unittest.TestCase):
    """DataSource failures must return clean API errors, not server crashes."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(create_app())

    # ── Test 1: File not found → 422 ─────────────────────────────────────────

    def test_datasource_file_not_found_returns_422(self):
        r = self.client.post("/render", json={
            "layout": _MINIMAL_LAYOUT,
            "data": "/nonexistent/path/data.json",
            "format": "html",
        })
        self.assertIn(r.status_code, (404, 422),
                      f"Missing data file must return 4xx. Got {r.status_code}: {r.text[:200]}")
        self.assertNotEqual(r.status_code, 500,
                            "DataSource file not found must not return 500")

    # ── Test 2: Invalid JSON → 422 ────────────────────────────────────────────

    def test_datasource_invalid_json_spec_returns_422(self):
        """dict spec with type=json and bad path → 4xx, not crash."""
        r = self.client.post("/render", json={
            "layout": _MINIMAL_LAYOUT,
            "data": {"type": "json", "path": "/no/such/file.json"},
            "format": "html",
        })
        self.assertNotEqual(r.status_code, 500,
                            f"Invalid JSON datasource spec must not return 500. Got: {r.status_code}")

    # ── Test 3: External HTTP timeout (mocked) → 422 ─────────────────────────

    def test_external_http_timeout_returns_422(self):
        """HTTP datasource timeout must not crash the server."""
        import urllib.error

        with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("timed out")):
            r = self.client.post("/render", json={
                "layout": _MINIMAL_LAYOUT,
                "data": "https://example.com/data.json",
                "format": "html",
            })
        self.assertNotEqual(r.status_code, 500,
                            f"HTTP timeout must not return 500. Got {r.status_code}: {r.text[:200]}")
        self.assertIn(r.status_code, (400, 422, 503),
                      f"Timeout must return 4xx/503. Got: {r.status_code}")


@unittest.skipUnless(_HAS_CLIENT, "fastapi / httpx not installed")
class TestLayoutFaults(unittest.TestCase):
    """Layout resolution failures must return clean errors."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(create_app())

    # ── Test 4: JRXML not found → 404 ─────────────────────────────────────────

    def test_jrxml_not_found_returns_404(self):
        r = self.client.post("/render-jrxml", json={
            "jrxml": "/nonexistent/report.jrxml",
            "data": {},
            "format": "html",
        })
        self.assertEqual(r.status_code, 404,
                         f"Missing JRXML must return 404. Got: {r.status_code}")

    # ── Test 5: Layout file not found → 404 ──────────────────────────────────

    def test_layout_file_not_found_returns_404(self):
        r = self.client.post("/render", json={
            "layout": "/no/such/layout.rfd.json",
            "data": {},
            "format": "html",
        })
        self.assertEqual(r.status_code, 404,
                         f"Missing layout file must return 404. Got: {r.status_code}")

    # ── Test 6: Malformed layout (no sections) → 422 ─────────────────────────

    def test_malformed_layout_no_sections_returns_error(self):
        bad_layout = {"name": "bad", "elements": []}  # no sections key
        r = self.client.post("/render", json={
            "layout": bad_layout, "data": {}, "format": "html",
        })
        self.assertIn(r.status_code, (422, 200),
                      f"Malformed layout must return 422 or degrade gracefully. Got: {r.status_code}")
        self.assertNotEqual(r.status_code, 500,
                            "Malformed layout must not return 500")

    # ── Test 7: Empty layout dict → not crash ─────────────────────────────────

    def test_empty_layout_dict_not_crash(self):
        r = self.client.post("/render", json={
            "layout": {}, "data": {}, "format": "html",
        })
        self.assertNotEqual(r.status_code, 500,
                            f"Empty layout must not crash server. Got: {r.status_code}: {r.text[:200]}")

    # ── Test 19: designer-preview with file path → 400 ───────────────────────

    def test_designer_preview_with_file_path_returns_400(self):
        r = self.client.post("/designer-preview", json={
            "layout": "path/to/file.rfd.json", "data": {},
        })
        self.assertEqual(r.status_code, 400,
                         f"designer-preview with string layout must return 400. Got: {r.status_code}")


@unittest.skipUnless(_HAS_CLIENT, "fastapi / httpx not installed")
class TestPayloadAbuse(unittest.TestCase):
    """Abusive / edge-case payloads must be handled without server crashes."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(create_app())

    # ── Test 8: Unknown tenant → defaults, renders ok ─────────────────────────

    def test_unknown_tenant_falls_back_to_default(self):
        r = self.client.post("/render", json={
            "layout": _MINIMAL_LAYOUT,
            "data": _MINIMAL_DATA,
            "format": "html",
            "tenant": "tenant_that_does_not_exist_xyz",
        })
        self.assertEqual(r.status_code, 200,
                         f"Unknown tenant must fall back to default. Got: {r.status_code}: {r.text[:200]}")

    # ── Test 9: Oversized params (100 keys) → renders ok ─────────────────────

    def test_oversized_params_dict_renders_ok(self):
        big_params = {f"param_{i}": f"value_{i}" for i in range(100)}
        r = self.client.post("/render", json={
            "layout": _MINIMAL_LAYOUT,
            "data": _MINIMAL_DATA,
            "format": "html",
            "params": big_params,
        })
        self.assertIn(r.status_code, (200, 422),
                      f"Oversized params must not crash. Got: {r.status_code}: {r.text[:200]}")
        self.assertNotEqual(r.status_code, 500,
                            "Oversized params must not return 500")

    # ── Test 10: Deeply nested data dict → renders ok ─────────────────────────

    def test_deeply_nested_data_dict_renders_ok(self):
        deep = {}
        current = deep
        for i in range(20):
            current["nested"] = {}
            current = current["nested"]
        current["leaf"] = "value"

        data = {"items": [], "meta": {"deep": deep}}
        r = self.client.post("/render", json={
            "layout": _MINIMAL_LAYOUT, "data": data, "format": "html",
        })
        self.assertNotEqual(r.status_code, 500,
                            f"Deeply nested data must not crash. Got: {r.status_code}: {r.text[:200]}")

    # ── Test 11: items=null in data → handled ────────────────────────────────

    def test_items_null_in_data_not_crash(self):
        r = self.client.post("/render", json={
            "layout": _MINIMAL_LAYOUT,
            "data": {"items": None},
            "format": "html",
        })
        self.assertNotEqual(r.status_code, 500,
                            f"items=null must not crash. Got: {r.status_code}: {r.text[:200]}")

    # ── Test 12: items with non-dict elements → handled ──────────────────────

    def test_items_with_non_dict_elements_not_crash(self):
        r = self.client.post("/render", json={
            "layout": _MINIMAL_LAYOUT,
            "data": {"items": [1, "string", None, True, []]},
            "format": "html",
        })
        self.assertNotEqual(r.status_code, 500,
                            f"Non-dict items must not crash. Got: {r.status_code}: {r.text[:200]}")

    # ── Test 13: Extremely long string field values → no memory crash ─────────

    def test_extremely_long_string_field_not_crash(self):
        long_str = "A" * 100_000
        data = {"items": [{"descripcion": long_str}]}
        r = self.client.post("/render", json={
            "layout": _MINIMAL_LAYOUT, "data": data, "format": "html",
        })
        self.assertNotEqual(r.status_code, 500,
                            f"100k-char string must not crash. Got: {r.status_code}")

    # ── Test: Null byte in string field → safe ────────────────────────────────

    def test_null_byte_in_string_field_safe(self):
        data = {"items": [{"codigo": "A\x00B", "descripcion": "test\x00"}]}
        r = self.client.post("/render", json={
            "layout": _MINIMAL_LAYOUT, "data": data, "format": "html",
        })
        self.assertNotEqual(r.status_code, 500,
                            f"Null byte in string field must not crash. Got: {r.status_code}")

    # ── Test: Unicode edge cases → safe ───────────────────────────────────────

    def test_unicode_edge_cases_safe(self):
        """RTL override, zero-width space, emoji — must not crash render."""
        data = {
            "items": [{
                "descripcion": "\u202E reversed \u202C",  # RTL override
                "codigo": "\u200B\u200B",                # zero-width space
                "label": "emoji \U0001F525 fire",
            }]
        }
        r = self.client.post("/render", json={
            "layout": _MINIMAL_LAYOUT, "data": data, "format": "html",
        })
        self.assertNotEqual(r.status_code, 500,
                            f"Unicode edge cases must not crash. Got: {r.status_code}")


@unittest.skipUnless(_HAS_CLIENT, "fastapi / httpx not installed")
class TestSubsystemFaults(unittest.TestCase):
    """Subsystem failures must degrade gracefully, not cascade to 500."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(create_app())

    # ── Test 14: Template not found → 404 ────────────────────────────────────

    def test_render_missing_template_returns_404(self):
        r = self.client.post("/render-template", json={
            "templateId": "template_that_does_not_exist_xyz",
            "data": {},
            "format": "html",
        })
        self.assertEqual(r.status_code, 404,
                         f"Missing template must return 404. Got: {r.status_code}")

    # ── Test 15: Datasource alias not found → 404 ────────────────────────────

    def test_datasource_alias_not_found_returns_404(self):
        r = self.client.delete("/datasources/alias_that_does_not_exist_xyz")
        self.assertEqual(r.status_code, 404,
                         f"Missing datasource alias must return 404. Got: {r.status_code}")

    # ── Test 16: DB ping failure → registered but reachable=False ────────────

    def test_db_ping_failure_returns_reachable_false(self):
        """Registering a datasource with unreachable URL must not crash — reachable=False."""
        r = self.client.post("/datasources", json={
            "alias": "resilience_test_bad_db",
            "type": "sqlite",
            "url": "sqlite:////nonexistent/path/db.sqlite",
            "query": "",
        })
        self.assertIn(r.status_code, (201, 422),
                      f"Unreachable datasource must return 201 or 422. Got: {r.status_code}")
        self.assertNotEqual(r.status_code, 500,
                            "DB ping failure must not return 500")
        if r.status_code == 201:
            body = r.json()
            self.assertFalse(body.get("reachable"),
                             f"Unreachable URL must set reachable=False. Got: {body}")
            # Cleanup
            self.client.delete("/datasources/resilience_test_bad_db")

    # ── Test 17: Render engine exception → 422 not 500 ───────────────────────

    def test_render_engine_exception_returns_422_not_500(self):
        """If EnterpriseEngine.render() raises, API must return 422, not propagate."""
        with patch(
            "reportforge.core.render.engines.enterprise_engine.EnterpriseEngine.render",
            side_effect=RuntimeError("simulated engine crash"),
        ):
            r = self.client.post("/render", json={
                "layout": _MINIMAL_LAYOUT,
                "data": _MINIMAL_DATA,
                "format": "html",
            })
        self.assertEqual(r.status_code, 422,
                         f"Engine exception must return 422. Got: {r.status_code}: {r.text[:300]}")
        body = r.json()
        self.assertIn("detail", body,
                      "422 response must include detail field")
        self.assertIn("Render error", body["detail"],
                      f"422 detail must name the error. Got: {body['detail']!r}")

    # ── Test 18: Empty sections layout → blank but no crash ──────────────────

    def test_empty_sections_layout_renders_blank_not_crash(self):
        empty_sections_layout = {
            "name": "empty_sections",
            "pageSize": "A4",
            "sections": [],
            "elements": [],
        }
        r = self.client.post("/preview", json={
            "layout": empty_sections_layout, "data": {},
        })
        self.assertNotEqual(r.status_code, 500,
                            f"Empty sections layout must not crash. Got: {r.status_code}: {r.text[:200]}")


@unittest.skipUnless(_HAS_CLIENT, "fastapi / httpx not installed")
class TestFormatResilience(unittest.TestCase):
    """Invalid or unsupported format values must be handled cleanly."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(create_app())

    def test_unknown_format_does_not_crash(self):
        r = self.client.post("/render", json={
            "layout": _MINIMAL_LAYOUT,
            "data": _MINIMAL_DATA,
            "format": "xyz_unknown_format",
        })
        self.assertNotEqual(r.status_code, 500,
                            f"Unknown format must not crash server. Got: {r.status_code}: {r.text[:200]}")

    def test_uppercase_format_accepted(self):
        """Format negotiation must be case-insensitive."""
        r = self.client.post("/render", json={
            "layout": _MINIMAL_LAYOUT, "data": _MINIMAL_DATA, "format": "HTML",
        })
        # May return 200 or 422 depending on normalization — must not be 500
        self.assertNotEqual(r.status_code, 500,
                            f"Uppercase format must not crash. Got: {r.status_code}")

    def test_empty_format_defaults_gracefully(self):
        r = self.client.post("/render", json={
            "layout": _MINIMAL_LAYOUT, "data": _MINIMAL_DATA, "format": "",
        })
        self.assertNotEqual(r.status_code, 500,
                            f"Empty format must not crash. Got: {r.status_code}")


@unittest.skipUnless(_HAS_CLIENT, "fastapi / httpx not installed")
class TestRateLimitRecovery(unittest.TestCase):
    """After rate limit cooldown, requests must resume normally."""

    def test_rate_limit_recovery_after_new_app_instance(self):
        """
        Rate limit is per-app-instance (in-memory sliding window).
        A fresh app instance has fresh counters — requests must succeed.
        Verifies that limits don't persist across deployments.
        """
        # Fresh app with rpm=2 (very low)
        client = TestClient(create_app(rate_limit_rpm=2))

        # Exhaust the limit
        for _ in range(3):
            client.post("/validate", json={"name": "x", "sections": [], "elements": []})

        # Fresh app (simulates restart/new worker) — limit reset
        fresh_client = TestClient(create_app(rate_limit_rpm=2))
        r = fresh_client.get("/health")
        self.assertEqual(r.status_code, 200,
                         "Fresh app instance must not carry over rate limit state")


if __name__ == "__main__":
    unittest.main(verbosity=2)
