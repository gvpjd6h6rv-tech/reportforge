# server/api_tests.py
# Integration tests for the REST API — run without a live server using
# FastAPI's TestClient (if httpx is available).
#
# Usage:
#   pip install httpx  # only needed for these tests
#   python -m pytest server/api_tests.py -v
import json, sys, unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))

# ── Lightweight tests that run without FastAPI/httpx ──────────────
from server.cache  import LayoutCache, get_cache
from server.tenant import TenantConfig, get_registry


class TestLayoutCache(unittest.TestCase):

    def setUp(self):
        self.cache = LayoutCache(ttl=60, max_entries=4)

    def test_set_and_get(self):
        self.cache.set("k1", {"name": "layout1"})
        self.assertEqual(self.cache.get("k1"), {"name": "layout1"})

    def test_miss_returns_none(self):
        self.assertIsNone(self.cache.get("no_such_key"))

    def test_stats(self):
        self.cache.set("k", {"x": 1})
        self.cache.get("k")           # hit
        self.cache.get("missing")     # miss
        s = self.cache.stats()
        self.assertEqual(s["hits"],   1)
        self.assertEqual(s["misses"], 1)
        self.assertAlmostEqual(s["hit_rate"], 0.5)

    def test_make_key_tenant_isolated(self):
        layout = {"name": "test"}
        k1 = LayoutCache.make_key(layout, "acme")
        k2 = LayoutCache.make_key(layout, "corp")
        self.assertNotEqual(k1, k2)
        self.assertTrue(k1.startswith("acme:"))
        self.assertTrue(k2.startswith("corp:"))

    def test_clear_by_tenant(self):
        self.cache.set("acme:1", {"a": 1})
        self.cache.set("corp:1", {"b": 2})
        n = self.cache.clear("acme")
        self.assertEqual(n, 1)
        self.assertIsNone(self.cache.get("acme:1"))
        self.assertIsNotNone(self.cache.get("corp:1"))

    def test_eviction_when_full(self):
        for i in range(5):
            self.cache.set(f"k{i}", {"i": i})
        # After eviction we should have ≤ max_entries entries
        self.assertLessEqual(self.cache.stats()["entries"], 4)

    def test_invalidate(self):
        self.cache.set("rem", {"x": 1})
        ok = self.cache.invalidate("rem")
        self.assertTrue(ok)
        self.assertIsNone(self.cache.get("rem"))
        self.assertFalse(self.cache.invalidate("rem"))  # already gone


class TestTenantConfig(unittest.TestCase):

    def test_default_tenant(self):
        t = TenantConfig("default")
        self.assertEqual(t.tenant_id, "default")
        self.assertIn("primaryColor", t.theme)

    def test_acme_tenant(self):
        t = TenantConfig("acme")
        self.assertEqual(t.params.get("company"), "ACME Corporation")
        self.assertIn("#", t.primary_color)

    def test_unknown_tenant_falls_back(self):
        t = TenantConfig("unknown_xyz_tenant")
        self.assertIn("primaryColor", t.theme)  # default theme

    def test_css_overrides(self):
        t = TenantConfig("default")
        css = t.css_overrides()
        self.assertIn(":root", css)
        self.assertIn("--tenant-", css)

    def test_builtin_theme_ocean(self):
        t = TenantConfig("ocean")
        self.assertEqual(t.theme.get("primaryColor"), "#0077B6")

    def test_to_dict(self):
        t = TenantConfig("default")
        d = t.to_dict()
        self.assertIn("tenant_id", d)
        self.assertIn("theme", d)
        self.assertIn("params", d)


class TestTemplateRegistry(unittest.TestCase):

    def setUp(self):
        self.reg = get_registry()
        self._layout = {"name": "Test Invoice", "sections": [], "elements": []}

    def test_register_and_retrieve(self):
        self.reg.register("test_invoice", self._layout, "test_tenant")
        got = self.reg.get("test_invoice", "test_tenant")
        self.assertIsNotNone(got)
        self.assertEqual(got["name"], "Test Invoice")

    def test_missing_returns_none(self):
        self.assertIsNone(self.reg.get("does_not_exist", "test_tenant"))

    def test_delete(self):
        self.reg.register("tmp_tpl", self._layout, "test_tenant")
        self.assertTrue(self.reg.delete("tmp_tpl", "test_tenant"))
        self.assertIsNone(self.reg.get("tmp_tpl", "test_tenant"))

    def test_list_includes_registered(self):
        self.reg.register("list_test", self._layout, "test_tenant")
        items = self.reg.list("test_tenant")
        ids = [i["templateId"] for i in items]
        self.assertIn("list_test", ids)


# ── FastAPI endpoint tests (skipped if httpx/fastapi not installed) ─
try:
    from fastapi.testclient import TestClient
    from server.api import create_app
    _HAS_CLIENT = True
except ImportError:
    _HAS_CLIENT = False

_MINIMAL = {
    "name": "Test", "pageWidth": 754, "pageSize": "A4",
    "sections": [{"id":"s-rh","stype":"rh","height":40}],
    "elements": [{"id":"t1","type":"text","sectionId":"s-rh",
                  "x":4,"y":4,"w":200,"h":14,"content":"Hello"}],
}
_DATA = {"items": []}


@unittest.skipUnless(_HAS_CLIENT, "fastapi / httpx not installed")
class TestAPIEndpoints(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(create_app())

    def test_health(self):
        r = self.client.get("/health")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["status"], "ok")

    def test_designer_preview_returns_html(self):
        r = self.client.post("/designer-preview",
                             json={"layout": _MINIMAL, "data": _DATA})
        self.assertEqual(r.status_code, 200)
        self.assertIn("Hello", r.text)
        self.assertIn("<!DOCTYPE html>", r.text)

    def test_preview_returns_html(self):
        r = self.client.post("/preview",
                             json={"layout": _MINIMAL, "data": _DATA})
        self.assertEqual(r.status_code, 200)
        self.assertIn("Hello", r.text)

    def test_render_returns_html_format(self):
        r = self.client.post("/render",
                             json={"layout": _MINIMAL, "data": _DATA,
                                   "format": "html"})
        self.assertEqual(r.status_code, 200)
        self.assertIn("Hello", r.text)

    def test_validate_warns_empty_elements(self):
        bad = {**_MINIMAL, "elements": []}
        r = self.client.post("/validate", json=bad)
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertFalse(body["valid"])
        self.assertTrue(any("element" in w["message"].lower()
                            for w in body["warnings"]))

    def test_validate_element_overflow(self):
        wide = {**_MINIMAL, "elements": [
            {"id":"t1","type":"text","sectionId":"s-rh",
             "x":700,"y":4,"w":200,"h":14,"content":"Overflow"}
        ]}
        r = self.client.post("/validate", json=wide)
        warns = r.json()["warnings"]
        self.assertTrue(any("overflow" in w["message"].lower() for w in warns))

    def test_template_register_and_render(self):
        # Register
        r = self.client.post("/templates",
                             json={"templateId":"api_test","layout":_MINIMAL,
                                   "tenant":"default"})
        self.assertEqual(r.status_code, 201)
        # Render
        r2 = self.client.post("/render-template",
                              json={"templateId":"api_test","data":_DATA,
                                    "format":"html"})
        self.assertEqual(r2.status_code, 200)
        self.assertIn("Hello", r2.text)

    def test_template_list(self):
        r = self.client.get("/templates?tenant=default")
        self.assertEqual(r.status_code, 200)
        self.assertIsInstance(r.json(), list)

    def test_cache_stats(self):
        r = self.client.get("/cache/stats")
        self.assertEqual(r.status_code, 200)
        self.assertIn("entries", r.json())

    def test_tenant_theme_get(self):
        r = self.client.get("/tenants/default/theme")
        self.assertEqual(r.status_code, 200)
        self.assertIn("theme", r.json())

    def test_render_jrxml_file_not_found(self):
        r = self.client.post("/render-jrxml",
                             json={"jrxml":"no_such.jrxml","data":{}})
        self.assertEqual(r.status_code, 404)

    def test_designer_preview_rejects_file_path(self):
        r = self.client.post("/designer-preview",
                             json={"layout":"file.rfd.json","data":{}})
        self.assertEqual(r.status_code, 400)


if __name__ == "__main__":
    unittest.main(verbosity=2)
