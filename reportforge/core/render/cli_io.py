from __future__ import annotations

import json
import sys
from pathlib import Path


def ok(msg: str) -> None:
    print(f"  \033[32m✓\033[0m {msg}")


def err(msg: str) -> None:
    print(f"  \033[31m✗\033[0m {msg}")
    sys.exit(1)


def info(msg: str) -> None:
    print(f"  \033[34m→\033[0m {msg}")


def head(msg: str) -> None:
    print(f"\n{'=' * 60}\n  {msg}\n{'=' * 60}")


def load_json(path: str, label: str) -> dict:
    try:
        raw_path = Path(path)
        raw = json.loads(raw_path.read_text(encoding="utf-8"))
        ok(f"{label.title()} loaded: {path}  ({len(raw_path.read_bytes()):,} bytes)")
        return raw
    except FileNotFoundError:
        err(f"{label.title()} file not found: {path}")
    except json.JSONDecodeError as e:
        err(f"Invalid JSON in {path}: {e}")


def el_obj_to_dict(e) -> dict:
    fields = [
        "id", "type", "sectionId", "x", "y", "w", "h",
        "content", "fieldPath", "fieldFmt",
        "fontSize", "bold", "italic", "underline", "fontFamily",
        "align", "color", "bgColor", "borderColor", "borderWidth", "borderStyle",
        "lineDir", "lineWidth", "zIndex",
    ]
    return {f: getattr(e, f, None) for f in fields if getattr(e, f, None) is not None}
