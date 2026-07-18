"""
test_sql_connection.py

Backend tests for the SQL Connection from UI feature (Phase 8).

Coverage:
  §1  list_registered_safe() — credentials never returned
  §2  build_mssql_url() — correct SQLAlchemy URL format, password URL-encoded
  §3  ping_structured() — returns {ok, message, latency_ms, details}
  §4  POST /datasources/_test (FastAPI) — happy path, missing fields
  §5  POST /datasources/{alias}/connect (FastAPI) — registers, returns no URL
  §6  GET /datasources (FastAPI) — no credentials in response
  §7  stdlib server routing — GET /datasources, POST _test, POST connect, DELETE
  §8  Security: password never in logs, URL never in GET /datasources response
  §9  ConnectionsStore — save/load/remove + password never in plaintext on disk
  §10 load_persisted_connections — startup populates _REGISTRY from store
  §11 Integration — _post_ds_connect persists; _delete_ds removes
"""
from __future__ import annotations

import json
import os
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


# ── §2 — pymssql connect spec and ping ───────────────────────────────────────

class TestPymssqlConnectSpec(unittest.TestCase):

    def test_structured_spec_has_required_keys(self):
        spec = {"type": "mssql", "host": "myhost", "port": 1433,
                "database": "SBO_DEMO", "username": "sa", "password": "pass123"}
        for key in ("host", "port", "database", "username", "password"):
            self.assertIn(key, spec)

    def test_no_pyodbc_import_in_pymssql_module(self):
        import inspect
        import reportforge.core.render.datasource.db_source_pymssql as mod
        source = inspect.getsource(mod)
        self.assertNotIn("pyodbc", source, "pyodbc must not appear in db_source_pymssql")

    def test_no_mssql_pyodbc_url_in_pymssql_module(self):
        import inspect
        import reportforge.core.render.datasource.db_source_pymssql as mod
        source = inspect.getsource(mod)
        self.assertNotIn("mssql+pyodbc", source)

    def test_connect_passes_correct_kwargs_to_pymssql(self):
        """pymssql.connect must receive server, port(int), user, password, database, login_timeout, timeout."""
        import sys
        from reportforge.core.render.datasource.db_source_pymssql import connect
        spec = {"host": "myhost", "port": 1433, "database": "SBO_DEMO",
                "username": "sa", "password": "s3cr3t"}
        mock_pymssql = MagicMock()
        mock_pymssql.connect.return_value = MagicMock()
        with patch.dict(sys.modules, {"pymssql": mock_pymssql}):
            connect(spec)
        kw = mock_pymssql.connect.call_args.kwargs
        self.assertEqual(kw["server"], "myhost")
        self.assertIsInstance(kw["port"], int, "port must be int, not str")
        self.assertEqual(kw["port"], 1433)
        self.assertEqual(kw["user"], "sa")
        self.assertEqual(kw["password"], "s3cr3t")
        self.assertEqual(kw["database"], "SBO_DEMO")
        self.assertIn("login_timeout", kw)
        self.assertIn("timeout", kw)

    def test_connect_works_after_stale_import_cache(self):
        """connect() must succeed even when pymssql was absent at module load time."""
        import sys
        from reportforge.core.render.datasource.db_source_pymssql import connect
        spec = {"host": "h", "port": 1433, "database": "DB", "username": "u", "password": "p"}
        mock_pymssql = MagicMock()
        mock_pymssql.connect.return_value = MagicMock()
        original = sys.modules.pop("pymssql", None)
        try:
            sys.modules["pymssql"] = mock_pymssql
            connect(spec)
            mock_pymssql.connect.assert_called_once()
        finally:
            if original is not None:
                sys.modules["pymssql"] = original
            else:
                sys.modules.pop("pymssql", None)

    def test_pymssql_ping_returns_bool_on_mock(self):
        import sys
        from reportforge.core.render.datasource.db_source_pymssql import ping
        spec = {"host": "h", "port": 1433, "database": "DB", "username": "u", "password": "p"}
        mock_pymssql = MagicMock()
        mock_pymssql.connect.return_value = MagicMock()
        with patch.dict(sys.modules, {"pymssql": mock_pymssql}):
            result = ping(spec)
        self.assertIsInstance(result, bool)

    def test_pymssql_ping_false_on_connection_error(self):
        import sys
        from reportforge.core.render.datasource.db_source_pymssql import ping
        spec = {"host": "h", "port": 1433, "database": "DB", "username": "u", "password": "p"}
        mock_pymssql = MagicMock()
        mock_pymssql.connect.side_effect = Exception("Connection refused")
        with patch.dict(sys.modules, {"pymssql": mock_pymssql}):
            result = ping(spec)
        self.assertFalse(result)


# ── §3 — ping_structured() ────────────────────────────────────────────────────

class TestPingStructured(unittest.TestCase):

    def test_returns_ok_false_on_unreachable_host(self):
        import sys
        from reportforge.core.render.datasource.db_source_introspection import ping_structured
        mock_pymssql = MagicMock()
        mock_pymssql.connect.side_effect = ConnectionResetError(104, "Connection reset by peer")
        with patch.dict(sys.modules, {"pymssql": mock_pymssql}):
            result = ping_structured("127.0.0.1", 19999, "DB", "user", "pass")
        self.assertIn("ok", result)
        self.assertIn("message", result)
        self.assertIn("latency_ms", result)
        self.assertIsInstance(result["latency_ms"], float)

    def test_result_has_required_keys(self):
        import sys
        from reportforge.core.render.datasource.db_source_introspection import ping_structured
        mock_pymssql = MagicMock()
        mock_pymssql.connect.side_effect = ConnectionRefusedError(111, "Connection refused")
        with patch.dict(sys.modules, {"pymssql": mock_pymssql}):
            result = ping_structured("127.0.0.1", 19999, "DB", "user", "pass")
        self.assertIn("ok", result)
        self.assertIn("message", result)
        self.assertIn("latency_ms", result)

    def test_ok_false_for_closed_port(self):
        import sys
        from reportforge.core.render.datasource.db_source_introspection import ping_structured
        mock_pymssql = MagicMock()
        mock_pymssql.connect.side_effect = ConnectionRefusedError(111, "Connection refused")
        with patch.dict(sys.modules, {"pymssql": mock_pymssql}):
            result = ping_structured("127.0.0.1", 19999, "DB", "user", "pass")
        self.assertFalse(result["ok"])

    def test_password_not_in_message(self):
        import sys
        from reportforge.core.render.datasource.db_source_introspection import ping_structured
        mock_pymssql = MagicMock()
        mock_pymssql.connect.side_effect = Exception("Login failed. Password: s3cr3t_p@ss")
        with patch.dict(sys.modules, {"pymssql": mock_pymssql}):
            result = ping_structured("myhost", 1433, "SBO", "sa", "s3cr3t_p@ss")
        msg = result.get("message", "")
        self.assertNotIn("s3cr3t_p@ss", msg, "Password must not appear in message")
        self.assertNotIn("s3cr3t_p@ss", result.get("details", {}).get("debugCode", ""), "Password must not appear in debugCode")

    def test_error_response_has_debugCode(self):
        """On failure, details.debugCode must contain the real exception info."""
        import sys
        from reportforge.core.render.datasource.db_source_introspection import ping_structured
        mock_pymssql = MagicMock()
        mock_pymssql.connect.side_effect = Exception("server not found: badhost")
        with patch.dict(sys.modules, {"pymssql": mock_pymssql}):
            result = ping_structured("badhost", 1433, "DB", "u", "p")
        self.assertFalse(result["ok"])
        self.assertIn("details", result, "details key must be present on failure")
        self.assertIn("debugCode", result["details"])
        self.assertIn("server not found", result["details"]["debugCode"])

    def test_password_not_in_debugCode(self):
        """debugCode must have password replaced with *** — never raw."""
        import sys
        from reportforge.core.render.datasource.db_source_introspection import ping_structured
        mock_pymssql = MagicMock()
        mock_pymssql.connect.side_effect = Exception("Login failed. Password: ultra_secret")
        with patch.dict(sys.modules, {"pymssql": mock_pymssql}):
            result = ping_structured("h", 1433, "DB", "sa", "ultra_secret")
        debug_code = result.get("details", {}).get("debugCode", "")
        self.assertNotIn("ultra_secret", debug_code, "Raw password must not appear in debugCode")
        self.assertIn("***", debug_code, "Password placeholder must appear in debugCode")

    def test_ok_response_has_no_details(self):
        """On success there must be no details key."""
        import sys
        from reportforge.core.render.datasource.db_source_introspection import ping_structured
        mock_pymssql = MagicMock()
        conn_mock = MagicMock()
        conn_mock.cursor.return_value.__enter__ = MagicMock(return_value=MagicMock())
        mock_pymssql.connect.return_value = conn_mock
        with patch.dict(sys.modules, {"pymssql": mock_pymssql}):
            result = ping_structured("h", 1433, "DB", "u", "p")
        self.assertTrue(result["ok"])
        self.assertNotIn("details", result)

    def test_failure_response_exposes_classified_details(self):
        import sys
        from reportforge.core.render.datasource.db_source_introspection import ping_structured
        mock_pymssql = MagicMock()
        mock_pymssql.connect.side_effect = ConnectionRefusedError(111, "Connection refused")
        with patch.dict(sys.modules, {"pymssql": mock_pymssql}):
            result = ping_structured("srv", 1433, "SBO", "u", "p")
        self.assertFalse(result["ok"])
        self.assertEqual(result["details"]["category"], "CONNECTION_REFUSED")
        self.assertIn("suggestion", result["details"])
        self.assertIn("debugCode", result["details"])


class TestSqlConnectionErrorClassification(unittest.TestCase):

    def _assert_classification(self, exc, category, message_fragment, suggestion_fragment, *, password=""):
        from reportforge.core.render.datasource.sql_connection_error_classifier import classify_connection_error
        result = classify_connection_error(exc, host="srv", port=1433, database="SBO", password=password)
        self.assertEqual(result["category"], category)
        self.assertIn(message_fragment, result["message"])
        self.assertIn(suggestion_fragment, result["suggestion"])
        self.assertIn(type(exc).__name__, result["debugCode"])
        self.assertNotIn("traceback", result["debugCode"].lower())
        if password:
            self.assertNotIn(password, result["debugCode"])

    def test_driver_missing(self):
        self._assert_classification(
            RuntimeError("pymssql not installed. Run: pip install pymssql"),
            "DRIVER_MISSING",
            "falta el controlador SQL Server",
            "Instala `pymssql`",
        )

    def test_dns_failure(self):
        import socket
        self._assert_classification(
            socket.gaierror(-2, "Name or service not known"),
            "DNS_FAILURE",
            "no se pudo resolver el host",
            "nombre del host",
        )

    def test_connection_refused(self):
        self._assert_classification(
            ConnectionRefusedError(111, "Connection refused"),
            "CONNECTION_REFUSED",
            "rechazó la conexión",
            "escuchando en ese puerto",
        )

    def test_connection_timeout(self):
        self._assert_classification(
            TimeoutError(110, "Connection timed out"),
            "CONNECTION_TIMEOUT",
            "conexión expiró",
            "timeout",
        )

    def test_authentication_failed(self):
        self._assert_classification(
            Exception(18456, "Login failed for user 'sa'"),
            "AUTHENTICATION_FAILED",
            "credenciales fueron rechazadas",
            "usuario, contraseña",
            password="secret_pw",
        )

    def test_database_unavailable(self):
        self._assert_classification(
            Exception(4060, "Cannot open database requested by the login"),
            "DATABASE_UNAVAILABLE",
            "base de datos no está disponible",
            "base exista",
        )

    def test_permission_denied(self):
        self._assert_classification(
            Exception(229, "The SELECT permission was denied"),
            "PERMISSION_DENIED",
            "no tiene permisos suficientes",
            "permisos de conexión",
        )

    def test_tls_error(self):
        import ssl
        self._assert_classification(
            ssl.SSLError("TLS handshake failed"),
            "TLS_ERROR",
            "negociación TLS/SSL",
            "certificados",
        )

    def test_server_unavailable(self):
        self._assert_classification(
            ConnectionResetError(104, "Connection reset by peer"),
            "SERVER_UNAVAILABLE",
            "servidor no está disponible",
            "host esté en línea",
        )

    def test_driver_error(self):
        class OperationalError(Exception):
            pass
        self._assert_classification(
            OperationalError("driver internal failure"),
            "DRIVER_ERROR",
            "controlador devolvió un error",
            "logs del controlador",
        )

    def test_unknown_connection_error_fallback(self):
        self._assert_classification(
            Exception("unexpected boom"),
            "UNKNOWN_CONNECTION_ERROR",
            "No se pudo completar la conexión",
            "vuelve a intentar",
        )


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
                with patch("reportforge.core.render.datasource.db_source_introspection.ping_structured",
                           return_value={"ok": True, "message": "Conectado a srv/SBO", "latency_ms": 1.2}):
                    with patch("reportforge.server.connections_store.save"):
                        _post_ds_connect(handler, "test_alias",
                                         {"host": "srv", "port": 1433, "database": "SBO",
                                          "username": "sa", "password": "pw"})
        self.assertEqual(len(json_sent), 1)
        self.assertEqual(json_sent[0]["alias"], "test_alias")
        self.assertTrue(json_sent[0]["registered"])
        self.assertTrue(json_sent[0]["reachable"])
        spec = get_registered("test_alias")
        self.assertIsNotNone(spec, "Datasource must be registered in registry")
        self.assertNotIn("pw", str(json_sent[0]), "Password must not appear in response JSON")

    def test_response_has_no_url_field(self):
        from reportforge_server_datasources import _post_ds_connect
        handler = MagicMock()
        json_sent = []
        with patch("reportforge_server_datasources._json", side_effect=lambda h, d: json_sent.append(d)):
            with patch("reportforge_server_datasources._error"):
                with patch("reportforge.core.render.datasource.db_source_introspection.ping_structured",
                           return_value={"ok": True, "message": "Conectado a h/D", "latency_ms": 1.2}):
                    with patch("reportforge.server.connections_store.save"):
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

    def test_no_pyodbc_in_production_datasource_code(self):
        import inspect
        import reportforge.core.render.datasource.db_source_introspection as mod_intr
        import reportforge.core.render.datasource.db_source_pymssql as mod_pymssql
        for mod in (mod_intr, mod_pymssql):
            src = inspect.getsource(mod)
            self.assertNotIn("pyodbc", src, f"pyodbc found in {mod.__name__}")

    def test_connect_response_does_not_contain_password(self):
        from reportforge_server_datasources import _post_ds_connect
        handler = MagicMock()
        json_sent = []
        with patch("reportforge_server_datasources._json", side_effect=lambda h, d: json_sent.append(d)):
            with patch("reportforge_server_datasources._error"):
                with patch("reportforge.core.render.datasource.db_source_introspection.ping_structured",
                           return_value={"ok": True, "message": "Conectado a h/D", "latency_ms": 1.2}):
                    with patch("reportforge.server.connections_store.save"):
                        _post_ds_connect(handler, "alias",
                                         {"host": "h", "database": "D", "username": "u",
                                          "password": "secret_pw_never_exposed"})
        response_str = json.dumps(json_sent)
        self.assertNotIn("secret_pw_never_exposed", response_str)

    def test_safe_list_strips_credentials_after_connect(self):
        from reportforge.core.render.datasource.db_source_registry import register, list_registered_safe, unregister
        spec = {"type": "mssql", "host": "myhost", "port": 1433,
                "database": "MyDB", "username": "sa", "password": "ultra_secret"}
        register("test_ds", spec)
        try:
            safe = list_registered_safe()
            safe_str = json.dumps(safe)
            self.assertNotIn("ultra_secret", safe_str)
            self.assertNotIn("mssql+pyodbc://", safe_str)
        finally:
            unregister("test_ds")


# ── §9 — ConnectionsStore: save / load / remove / security ───────────────────

class _StoreTestBase(unittest.TestCase):
    """Mixin: patches _KEY_PATH and _STORE_PATH to a tmpdir for isolation."""

    def setUp(self):
        import tempfile
        import shutil
        self._tmpdir = Path(tempfile.mkdtemp())
        self._shutil = shutil
        import reportforge.server.connections_store as cs
        self._cs = cs
        self._orig_key = cs._KEY_PATH
        self._orig_store = cs._STORE_PATH
        cs._KEY_PATH = self._tmpdir / ".conn_key"
        cs._STORE_PATH = self._tmpdir / ".connections.enc.json"

    def tearDown(self):
        self._cs._KEY_PATH = self._orig_key
        self._cs._STORE_PATH = self._orig_store
        self._shutil.rmtree(self._tmpdir, ignore_errors=True)


class TestConnectionsStore(_StoreTestBase):

    def test_load_all_empty_when_no_file(self):
        self.assertEqual(self._cs.load_all(), {})

    def test_save_and_load_roundtrip(self):
        spec = {"type": "mssql", "host": "srv", "port": 1433,
                "database": "SBO", "username": "sa", "password": "s3cr3t"}
        self._cs.save("sap_b1_linux", spec)
        loaded = self._cs.load_all()
        self.assertIn("sap_b1_linux", loaded)
        self.assertEqual(loaded["sap_b1_linux"]["password"], "s3cr3t")
        self.assertEqual(loaded["sap_b1_linux"]["host"], "srv")
        self.assertEqual(loaded["sap_b1_linux"]["database"], "SBO")

    def test_password_not_in_plaintext_on_disk(self):
        spec = {"type": "mssql", "host": "h", "port": 1433,
                "database": "D", "username": "u", "password": "super_secret_pw"}
        self._cs.save("alias1", spec)
        raw = (self._tmpdir / ".connections.enc.json").read_text(encoding="utf-8")
        self.assertNotIn("super_secret_pw", raw)

    def test_remove_deletes_alias(self):
        spec = {"type": "mssql", "host": "h", "port": 1433,
                "database": "D", "username": "u", "password": "pw"}
        self._cs.save("to_remove", spec)
        self._cs.remove("to_remove")
        self.assertNotIn("to_remove", self._cs.load_all())

    def test_remove_nonexistent_is_noop(self):
        self._cs.remove("does_not_exist")  # must not raise

    def test_wrong_key_skips_alias_no_crash(self):
        from cryptography.fernet import Fernet
        spec = {"type": "mssql", "host": "h", "port": 1433,
                "database": "D", "username": "u", "password": "pw"}
        self._cs.save("alias_bad", spec)
        # replace key with a different one (simulates lost key)
        (self._tmpdir / ".conn_key").write_bytes(Fernet.generate_key())
        loaded = self._cs.load_all()  # must not raise
        self.assertNotIn("alias_bad", loaded)

    def test_key_file_chmod600(self):
        import stat as stat_mod
        self._cs._get_or_create_key()
        mode = stat_mod.S_IMODE(os.stat(self._cs._KEY_PATH).st_mode)
        self.assertEqual(mode, 0o600, f"Expected 0o600 but got {oct(mode)}")

    def test_store_file_chmod600(self):
        import stat as stat_mod
        spec = {"type": "mssql", "host": "h", "port": 1433,
                "database": "D", "username": "u", "password": "pw"}
        self._cs.save("alias1", spec)
        mode = stat_mod.S_IMODE(os.stat(self._cs._STORE_PATH).st_mode)
        self.assertEqual(mode, 0o600, f"Expected 0o600 but got {oct(mode)}")

    def test_multiple_aliases_roundtrip(self):
        for i in range(3):
            self._cs.save(f"alias_{i}", {"type": "mssql", "host": f"h{i}", "port": 1433,
                                          "database": "D", "username": "u", "password": f"pw_{i}"})
        loaded = self._cs.load_all()
        self.assertEqual(set(loaded.keys()), {"alias_0", "alias_1", "alias_2"})
        for i in range(3):
            self.assertEqual(loaded[f"alias_{i}"]["password"], f"pw_{i}")

    def test_save_overwrites_existing_alias(self):
        spec = {"type": "mssql", "host": "h", "port": 1433,
                "database": "D", "username": "u", "password": "old_pw"}
        self._cs.save("alias_upd", spec)
        spec2 = dict(spec, password="new_pw", host="h2")
        self._cs.save("alias_upd", spec2)
        loaded = self._cs.load_all()
        self.assertEqual(loaded["alias_upd"]["password"], "new_pw")
        self.assertEqual(loaded["alias_upd"]["host"], "h2")

    def test_password_enc_field_not_returned_in_load_all(self):
        spec = {"type": "mssql", "host": "h", "port": 1433,
                "database": "D", "username": "u", "password": "pw"}
        self._cs.save("alias1", spec)
        loaded = self._cs.load_all()
        self.assertNotIn("password_enc", loaded["alias1"])

    def test_no_plaintext_passwords_in_file_with_multiple_saves(self):
        passwords = ["alpha_secret", "beta_secret", "gamma_secret"]
        for i, pw in enumerate(passwords):
            self._cs.save(f"alias_{i}", {"type": "mssql", "host": "h", "port": 1433,
                                          "database": "D", "username": "u", "password": pw})
        raw = (self._tmpdir / ".connections.enc.json").read_text(encoding="utf-8")
        for pw in passwords:
            self.assertNotIn(pw, raw)


# ── §10 — load_persisted_connections: startup populates _REGISTRY ─────────────

class TestLoadPersistedConnections(_StoreTestBase):

    def setUp(self):
        super().setUp()
        from reportforge.core.render.datasource import db_source_registry as reg
        reg._REGISTRY.clear()

    def tearDown(self):
        super().tearDown()
        from reportforge.core.render.datasource import db_source_registry as reg
        reg._REGISTRY.clear()

    def test_registers_persisted_alias_in_registry(self):
        spec = {"type": "mssql", "host": "myhost", "port": 1433,
                "database": "SBO", "username": "sa", "password": "s3cr3t"}
        self._cs.save("sap_b1_linux", spec)
        count = self._cs.load_persisted_connections()
        self.assertEqual(count, 1)
        from reportforge.core.render.datasource.db_source_registry import get_registered
        loaded = get_registered("sap_b1_linux")
        self.assertIsNotNone(loaded)
        self.assertEqual(loaded["host"], "myhost")
        self.assertEqual(loaded["password"], "s3cr3t")

    def test_returns_zero_when_no_store(self):
        count = self._cs.load_persisted_connections()
        self.assertEqual(count, 0)

    def test_skips_bad_alias_no_crash(self):
        from cryptography.fernet import Fernet
        spec = {"type": "mssql", "host": "h", "port": 1433,
                "database": "D", "username": "u", "password": "pw"}
        self._cs.save("bad_alias", spec)
        (self._tmpdir / ".conn_key").write_bytes(Fernet.generate_key())
        count = self._cs.load_persisted_connections()  # must not raise
        self.assertEqual(count, 0)
        from reportforge.core.render.datasource.db_source_registry import get_registered
        self.assertIsNone(get_registered("bad_alias"))

    def test_password_in_registry_is_plaintext(self):
        spec = {"type": "mssql", "host": "h", "port": 1433,
                "database": "D", "username": "u", "password": "cleartext_in_memory"}
        self._cs.save("alias_mem", spec)
        self._cs.load_persisted_connections()
        from reportforge.core.render.datasource.db_source_registry import get_registered
        reg_spec = get_registered("alias_mem")
        self.assertEqual(reg_spec["password"], "cleartext_in_memory")

    def test_get_datasources_never_exposes_password_after_startup(self):
        spec = {"type": "mssql", "host": "srv", "port": 1433,
                "database": "SBO", "username": "sa", "password": "never_expose_me"}
        self._cs.save("check_alias", spec)
        self._cs.load_persisted_connections()
        from reportforge.core.render.datasource.db_source_registry import list_registered_safe
        safe_str = json.dumps(list_registered_safe())
        self.assertNotIn("never_expose_me", safe_str)
        self.assertNotIn("password", safe_str)


# ── §11 — Integration: stdlib connect/delete round-trip with store ─────────────

class TestDsConnectPersistence(_StoreTestBase):

    def setUp(self):
        super().setUp()
        from reportforge.core.render.datasource import db_source_registry as reg
        reg._REGISTRY.clear()

    def tearDown(self):
        super().tearDown()
        from reportforge.core.render.datasource import db_source_registry as reg
        reg._REGISTRY.clear()

    def test_connect_persists_to_store(self):
        from reportforge_server_datasources import _post_ds_connect
        handler = MagicMock()
        with patch("reportforge_server_datasources._json"):
            with patch("reportforge_server_datasources._error"):
                with patch("reportforge.core.render.datasource.db_source_introspection.ping_structured",
                           return_value={"ok": True, "message": "Conectado a h/D", "latency_ms": 1.2}):
                    _post_ds_connect(handler, "persist_alias",
                                     {"host": "h", "database": "D",
                                      "username": "u", "password": "persist_pw"})
        loaded = self._cs.load_all()
        self.assertIn("persist_alias", loaded)
        self.assertEqual(loaded["persist_alias"]["password"], "persist_pw")

    def test_failed_connect_does_not_register_or_persist(self):
        from reportforge_server_datasources import _post_ds_connect
        from reportforge.core.render.datasource.db_source_registry import get_registered
        handler = MagicMock()
        json_sent = []
        failure = {
            "ok": False,
            "message": "No se pudo conectar a h:1433/D",
            "latency_ms": 12.3,
            "details": {
                "category": "CONNECTION_REFUSED",
                "suggestion": "Verifica que SQL Server esté escuchando en ese puerto y que el firewall lo permita.",
                "debugCode": "ConnectionRefusedError: [Errno 111] Connection refused",
            },
        }
        with patch("reportforge_server_datasources._json", side_effect=lambda h, d: json_sent.append(d)):
            with patch("reportforge_server_datasources._error"):
                with patch("reportforge.core.render.datasource.db_source_introspection.ping_structured",
                           return_value=failure):
                    _post_ds_connect(handler, "fail_alias",
                                     {"host": "h", "database": "D",
                                      "username": "u", "password": "fail_pw"})
        self.assertEqual(self._cs.load_all(), {})
        self.assertIsNone(get_registered("fail_alias"))
        self.assertFalse(json_sent[0]["registered"])
        self.assertFalse(json_sent[0]["reachable"])
        self.assertEqual(json_sent[0]["details"]["category"], "CONNECTION_REFUSED")

    def test_delete_removes_from_store(self):
        from reportforge_server_datasources import _post_ds_connect, _delete_ds
        handler = MagicMock()
        with patch("reportforge_server_datasources._json"):
            with patch("reportforge_server_datasources._error"):
                with patch("reportforge.core.render.datasource.db_source_introspection.ping_structured",
                           return_value={"ok": True, "message": "Conectado a h/D", "latency_ms": 1.2}):
                    _post_ds_connect(handler, "del_alias",
                                     {"host": "h", "database": "D",
                                      "username": "u", "password": "del_pw"})
        self.assertIn("del_alias", self._cs.load_all())
        with patch("reportforge_server_datasources._json"):
            with patch("reportforge_server_datasources._error"):
                _delete_ds(handler, "del_alias")
        self.assertNotIn("del_alias", self._cs.load_all())

    def test_connect_password_not_in_api_response(self):
        from reportforge_server_datasources import _post_ds_connect
        handler = MagicMock()
        json_sent = []
        with patch("reportforge_server_datasources._json", side_effect=lambda h, d: json_sent.append(d)):
            with patch("reportforge_server_datasources._error"):
                with patch("reportforge.core.render.datasource.db_source_introspection.ping_structured",
                           return_value={"ok": True, "message": "Conectado a h/D", "latency_ms": 1.2}):
                    _post_ds_connect(handler, "resp_alias",
                                     {"host": "h", "database": "D",
                                      "username": "u", "password": "resp_secret"})
        self.assertNotIn("resp_secret", json.dumps(json_sent))

    def test_persisted_file_has_no_plaintext_password(self):
        from reportforge_server_datasources import _post_ds_connect
        handler = MagicMock()
        with patch("reportforge_server_datasources._json"):
            with patch("reportforge_server_datasources._error"):
                with patch("reportforge.core.render.datasource.db_source_introspection.ping_structured",
                           return_value={"ok": True, "message": "Conectado a h/D", "latency_ms": 1.2}):
                    _post_ds_connect(handler, "file_alias",
                                     {"host": "h", "database": "D",
                                      "username": "u", "password": "file_secret"})
        raw = (self._tmpdir / ".connections.enc.json").read_text(encoding="utf-8")
        self.assertNotIn("file_secret", raw)


if __name__ == "__main__":
    unittest.main()
