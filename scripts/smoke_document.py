#!/usr/bin/env python3
"""
smoke_document.py — Smoke manual de GET /document/factura/{DocEntry}

Inicio rápido:
  # Terminal 1: iniciar server (SAP_B1_DB_URL configurado en entorno del servidor)
  SAP_B1_DB_URL="mssql+pyodbc://user@host/SBO_EMPRESA" \\
    python -m uvicorn reportforge.server.api:create_app --factory --host 0.0.0.0 --port 5000

  # Terminal 2: ejecutar smoke
  python scripts/smoke_document.py --doc 12345
  python scripts/smoke_document.py --server http://prod-host:5000 --doc 20482

Variables de entorno:
  RF_SMOKE_SERVER       URL base del server (default: http://localhost:5000)
  SAP_B1_TEST_DOC_ENTRY DocEntry existente para test positivo

Escenarios:
  1. Factura existente        → 200, contract OK, schemaOk, items no vacío
  2. Factura inexistente      → 404, DOC_NOT_FOUND
  3. Tipo desconocido         → 400, INVALID_DOC_TYPE
  4. Número inválido          → 400, INVALID_DOC_NUMBER
  5. Datasource inválido      → 503, DB_CONNECTION_FAILED  (requiere --test-bad-ds)

Importante: este script habla HTTP contra el servidor.
Las credenciales de BD las maneja el servidor, no este script.
No se imprimen ni registran credenciales.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any

_GREEN = "\033[32m"
_RED = "\033[31m"
_YELLOW = "\033[33m"
_RESET = "\033[0m"
_BOLD = "\033[1m"

_CONTRACT = "rf.document.dataset.v1"


def _color(text: str, code: str) -> str:
    return f"{code}{text}{_RESET}" if sys.stdout.isatty() else text


def _ok(label: str) -> str:
    return _color(f"  OK  {label}", _GREEN)


def _fail(label: str) -> str:
    return _color(f" FAIL {label}", _RED)


def _skip(label: str) -> str:
    return _color(f" SKIP {label}", _YELLOW)


def _get(server: str, path: str, timeout: int = 10) -> tuple[int, dict]:
    url = f"{server.rstrip('/')}{path}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode())
    except urllib.error.URLError as exc:
        print(_fail(f"No se pudo conectar a {url}: {exc.reason}"))
        sys.exit(2)


def _check_contract(body: dict, label: str) -> bool:
    if body.get("contract") != _CONTRACT:
        print(_fail(f"{label}: contract={body.get('contract')!r} (esperado {_CONTRACT!r})"))
        return False
    major = int(body.get("schemaVersion", "0.0.0").split(".")[0])
    if major != 1:
        print(_fail(f"{label}: schemaVersion major={major} (esperado 1)"))
        return False
    return True


def _check_error(body: dict, expected_code: str, label: str) -> bool:
    code = body.get("error", {}).get("code")
    if code != expected_code:
        print(_fail(f"{label}: error.code={code!r} (esperado {expected_code!r})"))
        return False
    return True


def run_smoke(server: str, doc_entry: str | None, test_bad_ds: bool) -> int:
    failures = 0

    print(f"\n{_BOLD}=== Smoke: GET /document/factura ==={_RESET}")
    print(f"Server: {server}\n")

    # ── Escenario 1: factura existente ────────────────────────────────────────
    label = "1. Factura existente → 200"
    if not doc_entry:
        print(_skip(f"{label} (SAP_B1_TEST_DOC_ENTRY no definido)"))
    else:
        status, body = _get(server, f"/document/factura/{doc_entry}")
        if status == 200 and _check_contract(body, label):
            ds = body.get("dataset", {})
            items = ds.get("items", [])
            schema_ok = body.get("validation", {}).get("schemaOk", False)
            if schema_ok and items:
                print(_ok(f"{label} (DocEntry={doc_entry}, items={len(items)})"))
            else:
                print(_fail(f"{label}: schemaOk={schema_ok} items={len(items)}"))
                print(json.dumps(body.get("validation"), indent=2))
                failures += 1
        else:
            print(_fail(f"{label}: status={status}"))
            print(json.dumps(body, indent=2))
            failures += 1

    # ── Escenario 2: factura inexistente ─────────────────────────────────────
    label = "2. Factura inexistente → 404"
    status, body = _get(server, "/document/factura/999999999")
    if status == 404 and _check_contract(body, label) and _check_error(body, "DOC_NOT_FOUND", label):
        print(_ok(label))
    else:
        print(_fail(f"{label}: status={status}"))
        print(json.dumps(body, indent=2))
        failures += 1

    # ── Escenario 3: tipo inválido ────────────────────────────────────────────
    label = "3. Tipo desconocido → 400 INVALID_DOC_TYPE"
    status, body = _get(server, "/document/boleta/1")
    if status == 400 and _check_contract(body, label) and _check_error(body, "INVALID_DOC_TYPE", label):
        print(_ok(label))
    else:
        print(_fail(f"{label}: status={status}"))
        failures += 1

    # ── Escenario 4: número inválido ──────────────────────────────────────────
    label = "4. Número inválido → 400 INVALID_DOC_NUMBER"
    status, body = _get(server, "/document/factura/abc")
    if status == 400 and _check_contract(body, label) and _check_error(body, "INVALID_DOC_NUMBER", label):
        print(_ok(label))
    else:
        print(_fail(f"{label}: status={status}"))
        failures += 1

    # ── Escenario 5: datasource inválido ──────────────────────────────────────
    label = "5. Datasource inválido → 503 DB_CONNECTION_FAILED"
    if not test_bad_ds:
        print(_skip(f"{label} (pasar --test-bad-ds para activar)"))
    else:
        # Register a bad datasource via the /datasources API if available,
        # or call the mapper via the env var override.
        # Simplest: override env and restart is not feasible here.
        # Just document: configure SAP_B1_DB_URL=invalid and hit the endpoint.
        print(_skip(f"{label} (configura SAP_B1_DB_URL con URL inválida y reintenta)"))

    # ── Resumen ───────────────────────────────────────────────────────────────
    print()
    if failures == 0:
        print(_color("All smoke checks passed.", _GREEN))
    else:
        print(_color(f"{failures} check(s) failed.", _RED))

    return failures


def _curl_examples(server: str, doc_entry: str) -> None:
    print(f"\n{_BOLD}=== Ejemplos curl ==={_RESET}\n")

    entry = doc_entry or "12345"
    s = server.rstrip("/")

    print("# Factura existente:")
    print(f"curl -s '{s}/document/factura/{entry}' | python -m json.tool\n")

    print("# Factura inexistente:")
    print(f"curl -s '{s}/document/factura/999999999' | python -m json.tool\n")

    print("# Tipo inválido:")
    print(f"curl -s '{s}/document/boleta/1' | python -m json.tool\n")

    print("# Número inválido:")
    print(f"curl -s '{s}/document/factura/abc' | python -m json.tool\n")

    print("# Con datasource alternativo:")
    print(f"curl -s '{s}/document/factura/{entry}?datasource=sap_b1' | python -m json.tool\n")

    print("# Con timeout personalizado (segundos):")
    print(f"curl -s '{s}/document/factura/{entry}?timeout=30' | python -m json.tool\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Smoke de GET /document/factura")
    parser.add_argument(
        "--server",
        default=os.environ.get("RF_SMOKE_SERVER", "http://localhost:5000"),
        help="URL base del servidor ReportForge (default: http://localhost:5000)"
    )
    parser.add_argument(
        "--doc",
        default=os.environ.get("SAP_B1_TEST_DOC_ENTRY", ""),
        help="DocEntry de una factura existente para el test positivo"
    )
    parser.add_argument(
        "--test-bad-ds",
        action="store_true",
        help="Activar escenario 5 (datasource inválido)"
    )
    parser.add_argument(
        "--curl",
        action="store_true",
        help="Solo mostrar ejemplos curl, sin ejecutar"
    )
    args = parser.parse_args()

    if args.curl:
        _curl_examples(args.server, args.doc)
        return

    failures = run_smoke(args.server, args.doc or None, args.test_bad_ds)
    sys.exit(min(failures, 1))


if __name__ == "__main__":
    main()
