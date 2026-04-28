from __future__ import annotations


class RenderEngineError(Exception):
    pass


REQUIRED_KEYS = {"meta", "empresa", "cliente", "fiscal", "items", "totales"}


def validate_render_data(data: dict) -> None:
    if not isinstance(data, dict):
        raise RenderEngineError("data debe ser un dict")
    missing = REQUIRED_KEYS - set(data.keys())
    if missing:
        raise RenderEngineError(f"Faltan claves en data: {missing}")
    if not isinstance(data.get("items"), list):
        raise RenderEngineError("data['items'] debe ser una lista")
