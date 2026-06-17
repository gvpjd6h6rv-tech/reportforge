from __future__ import annotations

import base64
import subprocess
from pathlib import Path


def _isrc(src) -> str:
    if src.startswith(("data:", "http://", "https://", "//")):
        return src

    for p in _image_src_candidates(src):
        if p.exists() and p.is_file():
            mime = {
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".gif": "image/gif",
                ".svg": "image/svg+xml",
                ".webp": "image/webp",
            }.get(p.suffix.lower(), "image/png")
            return f"data:{mime};base64,{base64.b64encode(p.read_bytes()).decode()}"

    return src


def _image_src_candidates(src: str) -> list[Path]:
    raw = Path(src).expanduser()
    if raw.is_absolute():
        return [raw]

    here = Path(__file__).resolve()
    repo_root = here.parents[4]
    package_root = here.parents[3]

    candidates = [
        raw,
        Path.cwd() / raw,
        repo_root / raw,
        package_root / raw,
    ]

    unique = []
    seen = set()
    for candidate in candidates:
        key = str(candidate)
        if key not in seen:
            unique.append(candidate)
            seen.add(key)
    return unique


def _barcode_font_source(engine, el, family: str) -> dict | None:
    candidates = []
    layout_path = str(getattr(el, "barcodeFontPath", "") or getattr(engine._layout, "barcodeFontPath", "") or "")
    env_path = ""
    try:
        import os

        env_path = os.getenv("REPORTFORGE_BARCODE_FONT_PATH", "").strip()
    except Exception:
        env_path = ""
    if layout_path:
        candidates.append(Path(layout_path).expanduser())
    if env_path:
        candidates.append(Path(env_path).expanduser())
    candidates.append(Path.home() / ".local" / "share" / "fonts" / f"{family}.ttf")
    candidates.append(Path.home() / ".local" / "share" / "fonts" / f"{family}.otf")
    for path in candidates:
        if path.exists():
            return {"kind": "path", "path": str(path)}
    return {"kind": "local"} if _font_available(family) else None


def _font_available(family: str) -> bool:
    try:
        proc = subprocess.run(
            ["fc-match", "-f", "%{family}\n", family],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
    except Exception:
        return False
    out = (proc.stdout or "").strip().lower()
    return bool(out) and family.lower() in out
