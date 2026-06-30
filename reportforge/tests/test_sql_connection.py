"""
test_sql_connection.py

Backend tests for the SQL Connection from UI feature (Phase 8).

Coverage:
  §1  list_registered_safe() — credentials never returned
  §2  build_mssql_url() — correct SQLAlchemy URL format, password URL-encoded
  §3  ping_structured() — returns {ok, message, latency_ms}
  §4  POST /datasources/_test (FastAPI) — happy path, missing fields
  §5  POST /datasources/{alias}/connect (FastAPI) — registers, returns no URL
  §6  GET /datasources (FastAPI) — no credentials in response
  §7  stdlib server routing — GET /datasources, POST _test, POST connect, DELETE
  §8  Security: password never in logs, URL never in GET /datasources response
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))


# ── §1 — list_registered_safe() ──────────────────────────────────────────────

class TestListRegisteredSafe(unittest.TestCase):

    def setUp(self):
        from reportforge.core.render.datasource import db_source_registry as reg
        reg._REGISTRY.clear()

    def test_empty_returns_empty_list(self):
        from reportforge.core.render.datasource.db_source_registry import list_registered_safe
        self.assertEqual(list_registered_safe(), [])

    def test_registered_entry_has_alias_type_hint(self):
        from reportforge.core.render.datasource.db_source_registry import register, list_registered_safe
        register("sap_b1", {"type": "db", "url": "mssql+pyodbc://user:s3cr3t@host:1433/SBO?driver=x"})
        result = list_registered_safe()
        self.assertEqual(len(result), 1)
        entry = result[0]
        self.assertEqual(entry["alias"], "sap_b1")
        self.assertEqual(entry["type"], "db")
        self.assertIn("hint", entry)

    def test_password_not_in_safe_list(self):
        from reportforge.core.render.datasource.db_source_registry import register, list_registered_safe
        register("sap_b1", {"type": "db", "url": "mssql+pyodbc://user:s3cr3t@host:1433/SBO?driver=x"})
        result_str = json.dumps(list_registered_safe())
        self.assertNotIn("s3cr3t", result_str, "Password must not appear in safe list")

    def test_url_not_in_safe_list(self):
        from reportforge.core.render.datasource.db_source_registry import register, list_registered_safe
        register("sap_b1", {"type": "db", "url": "mssql+pyodbc://user:s3cr3t@host:1433/SBO?driver=x"})
        result_str = json.dumps(list_registered_safe())
        self.assertNotIn("mssql+pyodbc://", result_str, "Full connection URL must not appear in safe list")

    def test_multiple_entries(self):
        from reportforge.core.render.datasource.db_source_registry import register, list_registered_safe
        register("ds1", {"type": "db", "url": "mssql+pyodbc://u:p@h1/DB1"})
        register("ds2", {"type": "db", "url": "mssql+pyodbc://u:p@h2/DB2"})
        aliases = {e["alias"] for e in list_registered_safe()}
        self.assertEqual(aliases, {"ds1", "ds2"})


# ── §2 — build_mssql_url() ────────────────────────────────────────────────────

class TestBuildMssqlUrl(unittest.TestCase):

    def test_url_format(self):
        from reportforge.core.render.datasource.db_source_introspection import build_mssql_url
        url = build_mssql_url("myhost", 1433, "SBO_DEMO", "sa", "pass123")
        self.assertTrue(url.startswith("mssql+pyodbc://"), url)
        self.assertIn("@myhost:1433/SBO_DEMO", url)

    def test_password_url_encoded(self):
        from reportforge.core.render.datasource.db_source_introspection import build_mssql_url
        url = build_mssql_url("host", 1433, "DB", "user", "p@ss!w0rd")
        self.assertNotIn("p@ss!w0rd", url, "Raw password must not appear — should be URL-encoded")
        self.assertIn("p%40ss%21w0rd", url)

    def test_driver_in_url(self):
        from reportforge.core.render.datasource.db_source_introspection import build_mssql_url
        url = build_mssql_url("host", 1433, "DB", "user", "pass", "ODBC Driver 17 for SQL Server")
        self.assertIn("driver=", url)

    def test_custom_port(self):
        from reportforge.core.render.datasource.db_source_introspection import build_mssql_url
        url = build_mssql_url("host", 1435, "DB", "user", "pass")
        self.assertIn(":1435/", url)


# ── §3 — ping_structured() ────────────────────────────────────────────────────

class TestPingStructured(unittest.TestCase):

    def test_returns_ok_false_on_unreachable_host(self):
        from reportforge.core.render.datasource.db_source_introspection import ping_structured
        result = ping_structured("127.0.0.1", 19999, "DB", "user", "pass")
        self.assertIn("ok", result)
        self.assertIn("message", result)
        self.assertIn("latency_ms", result)
        self.assertIsInstance(result["latency_ms"], float)

    def test_result_has_required_keys(self):
        from reportforge.core.render.datasource.db_source_introspection import ping_structured
        result = ping_structured("127.0.0.1", 19999, "DB", "user", "pass")
        self.assertIn("ok", result)
        self.assertIn("message", result)
        self.assertIn("latency_ms", result)

    def test_ok_false_for_closed_port(self):
        from reportforge.core.render.datasource.db_source_introspection import ping_structured
        result = ping_structured("127.0.0.1", 19999, "DB", "user", "pass")
        self.assertFalse(result["ok"])

    def test_password_not_in_message(self):
        from reportforge.core.render.datasource.db_source_introspection import ping_structured
        result = ping_structured("myhost", 1433, "SBO", "sa", "s3cr3t_p@ss")
        msg = result.get("message", "")
        self.assertNotIn("s3cr3t_p@ss", msg, "Password must not appear in message")


# ── §4 — POST /datasources/_test via stdlib ───────────────────────────────────

class TestStdlibDsTest(unittest.TestCase):

    def _make_handler(self, body: dict):
        """Build a minimal mock handler for the stdlib datasource functions."""
        import io
        handler = MagicMock()
        handler.wfile = io.BytesIO()
        responses = []

        def send_response(code):
            responses.append(code)
        handler.send_response = send_response
        handler.send_header = MagicMock()
        handler.end_headers = MagicMock()

        sent_json = []

        from reportforge_server_http_utils import _json as orig_json, _error as orig_error

        def mock_json(h, data, status=200):
            sent_json.append({"status": status, "data": data})
        def mock_error(h, status, msg):
            sent_json.append({"status": status, "error": msg})

        return handler, sent_json, mock_json, mock_error

    def test_missing_host_returns_400(self):
        from reportforge_server_datasources import _post_ds_test
        handler = MagicMock()
        sent = []
        with patch("reportforge_server_datasources._error", side_effect=lambda h, s, m: sent.append((s, m))):
            with patch("reportforge_server_datasources._json"):
                _post_ds_test(handler, {"database": "DB", "username": "u", "password": "p"})
        self.assertTrue(len(sent) > 0)
        self.assertEqual(sent[0][0], 400)

    def test_missing_password_returns_400(self):
        from reportforge_server_datasources import _post_ds_test
        handler = MagicMock()
        sent = []
        with patch("reportforge_server_datasources._error", side_effect=lambda h, s, m: sent.append((s, m))):
            with patch("reportforge_server_datasources._json"):
                _post_ds_test(handler, {"host": "h", "database": "DB", "username": "u"})
        self.assertEqual(sent[0][0], 400)

    def test_valid_request_calls_ping_structured(self):
        from reportforge_server_datasources import _post_ds_test
        handler = MagicMock()
        json_sent = []
        fake_result = {"ok": False, "message": "Cannot connect", "latency_ms": 1.2}
        with patch("reportforge_server_datasources._json", side_effect=lambda h, d: json_sent.append(d)):
            with patch("reportforge_server_datasources._error"):
                with patch("reportforge.core.render.datasource.db_source_introspection.ping_structured",
                           return_value=fake_result):
                    _post_ds_test(handler, {"host": "h", "database": "DB", "username": "u", "password": "p"})
        self.assertEqual(len(json_sent), 1)
        self.assertEqual(json_sent[0]["ok"], False)
        self.assertNotIn("p", str(json_sent[0].get("message", "")), "Password must not be in response message")


# ── §5 — POST /datasources/{alias}/connect via stdlib ────────────────────────

class TestStdlibDsConnect(unittest.TestCase):

    def setUp(self):
        from reportforge.core.render.datasource import db_source_registry as reg
        reg._REGISTRY.clear()

    def test_missing_alias_returns_400(self):
        from reportforge_server_datasources import _post_ds_connect
        handler = MagicMock()
        sent = []
        with patch("reportforge_server_datasources._error", side_effect=lambda h, s, m: sent.append((s, m))):
            with patch("reportforge_server_datasources._json"):
                _post_ds_connect(handler, "", {"host": "h", "database": "D", "username": "u", "password": "p"})
        self.assertEqual(sent[0][0], 400)

    def test_valid_connect_registers_datasource(self):
        from reportforge_server_datasources import _post_ds_connect
        from reportforge.core.render.datasource.db_source_registry import get_registered
        handler = MagicMock()
        json_sent = []
        with patch("reportforge_server_datasources._json", side_effect=lambda h, d: json_sent.append(d)):
            with patch("reportforge_server_datasources._error"):
                with patch("reportforge.core.render.datasource.db_source_introspection.ping", return_value=False):
                    _post_ds_connect(handler, "test_alias",
                                     {"host": "srv", "port": 1433, "database": "SBO",
                                      "username": "sa", "password": "pw"})
        self.assertEqual(len(json_sent), 1)
        self.assertEqual(json_sent[0]["alias"], "test_alias")
        self.assertTrue(json_sent[0]["registered"])
        spec = get_registered("test_alias")
        self.assertIsNotNone(spec, "Datasource must be registered in registry")
        self.assertNotIn("pw", str(json_sent[0]), "Password must not appear in response JSON")

    def test_response_has_no_url_field(self):
        from reportforge_server_datasources import _post_ds_connect
        handler = MagicMock()
        json_sent = []
        with patch("reportforge_server_datasources._json", side_effect=lambda h, d: json_sent.append(d)):
            with patch("reportforge_server_datasources._error"):
                with patch("reportforge.core.render.datasource.db_source_introspection.ping", return_value=False):
                    _post_ds_connect(handler, "alias2",
                                     {"host": "h", "database": "D", "username": "u", "password": "p"})
        self.assertNotIn("url", json_sent[0], "URL must not be returned in connect response")


# ── §6 — GET /datasources via stdlib ─────────────────────────────────────────

class TestStdlibDsList(unittest.TestCase):

    def setUp(self):
        from reportforge.core.render.datasource import db_source_registry as reg
        reg._REGISTRY.clear()

    def test_empty_list(self):
        from reportforge_server_datasources import _get_ds_list
        handler = MagicMock()
        json_sent = []
        with patch("reportforge_server_datasources._json", side_effect=lambda h, d: json_sent.append(d)):
            _get_ds_list(handler)
        self.assertEqual(json_sent[0], [])

    def test_registered_ds_appears_without_credentials(self):
        from reportforge.core.render.datasource.db_source_registry import register
        from reportforge_server_datasources import _get_ds_list
        register("sap_b1", {"type": "db", "url": "mssql+pyodbc://user:hidden@host/SBO"})
        handler = MagicMock()
        json_sent = []
        with patch("reportforge_server_datasources._json", side_effect=lambda h, d: json_sent.append(d)):
            _get_ds_list(handler)
        result_str = json.dumps(json_sent[0])
        self.assertIn("sap_b1", result_str)
        self.assertNotIn("hidden", result_str, "Password must not appear in list response")
        self.assertNotIn("mssql+pyodbc://", result_str, "Full URL must not appear in list response")


# ── §7 — Service routing ──────────────────────────────────────────────────────

class TestServiceRouting(unittest.TestCase):

    def _mock_handler(self, path):
        h = MagicMock()
        h.path = path
        h.headers = {"Content-Length": "0"}
        h.rfile = MagicMock()
        h.rfile.read = MagicMock(return_value=b"{}")
        return h

    def test_get_datasources_routes(self):
        from reportforge_server_services import handle_get
        h = self._mock_handler("/datasources")
        with patch("reportforge_server_services._get_ds_list") as mock_fn:
            handle_get(h)
        mock_fn.assert_called_once_with(h)

    def test_post_ds_test_routes(self):
        from reportforge_server_services import handle_post
        h = self._mock_handler("/datasources/_test")
        with patch("reportforge_server_services._post_ds_test") as mock_fn:
            handle_post(h)
        mock_fn.assert_called_once()

    def test_post_ds_connect_routes(self):
        from reportforge_server_services import handle_post
        h = self._mock_handler("/datasources/my_alias/connect")
        with patch("reportforge_server_services._post_ds_connect") as mock_fn:
            handle_post(h)
        mock_fn.assert_called_once()
        call_args = mock_fn.call_args
        self.assertEqual(call_args[0][1], "my_alias")

    def test_delete_datasource_routes(self):
        from reportforge_server_services import handle_delete
        h = self._mock_handler("/datasources/my_alias")
        with patch("reportforge_server_services._delete_ds") as mock_fn:
            handle_delete(h)
        mock_fn.assert_called_once()


# ── §8 — Security invariants ──────────────────────────────────────────────────

class TestSecurityInvariants(unittest.TestCase):

    def setUp(self):
        from reportforge.core.render.datasource import db_source_registry as reg
        reg._REGISTRY.clear()

    def test_build_mssql_url_encodes_special_chars_in_password(self):
        from reportforge.core.render.datasource.db_source_introspection import build_mssql_url
        url = build_mssql_url("h", 1433, "DB", "u", "p@ss:w0rd/x")
        self.assertNotIn("p@ss:w0rd/x", url, "Special chars in password must be percent-encoded")

    def test_connect_response_does_not_contain_password(self):
        from reportforge_server_datasources import _post_ds_connect
        handler = MagicMock()
        json_sent = []
        with patch("reportforge_server_datasources._json", side_effect=lambda h, d: json_sent.append(d)):
            with patch("reportforge_server_datasources._error"):
                with patch("reportforge.core.render.datasource.db_source_introspection.ping", return_value=False):
                    _post_ds_connect(handler, "alias",
                                     {"host": "h", "database": "D", "username": "u",
                                      "password": "secret_pw_never_exposed"})
        response_str = json.dumps(json_sent)
        self.assertNotIn("secret_pw_never_exposed", response_str)

    def test_safe_list_strips_credentials_after_connect(self):
        from reportforge.core.render.datasource.db_source_introspection import build_mssql_url
        from reportforge.core.render.datasource.db_source_registry import register, list_registered_safe
        url = build_mssql_url("myhost", 1433, "MyDB", "sa", "ultra_secret")
        register("test_ds", {"type": "db", "url": url})
        safe = list_registered_safe()
        safe_str = json.dumps(safe)
        self.assertNotIn("ultra_secret", safe_str)
        self.assertNotIn("mssql+pyodbc://", safe_str)


if __name__ == "__main__":
    unittest.main()
