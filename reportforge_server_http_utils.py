from __future__ import annotations

import json


def _cors_headers(handler):
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")


def _respond(handler, code: int, body: bytes, ct: str):
    handler.send_response(code)
    handler.send_header("Content-Type", ct)
    handler.send_header("Content-Length", str(len(body)))
    _cors_headers(handler)
    handler.end_headers()
    handler.wfile.write(body)


def _json(handler, data):
    body = json.dumps(data, default=str, ensure_ascii=False).encode("utf-8")
    _respond(handler, 200, body, "application/json; charset=utf-8")


def _html(handler, html: str):
    _respond(handler, 200, html.encode("utf-8"), "text/html; charset=utf-8")


def _error(handler, code: int, msg: str):
    _respond(handler, code, json.dumps({"error": msg}).encode("utf-8"), "application/json; charset=utf-8")


def _not_found(handler, path: str):
    _error(handler, 404, f"Not found: {path}")
