# core/render/engines/advanced_engine_fonts.py
# Barcode @font-face resolution for AdvancedHtmlEngine._css() — extracted
# verbatim from advanced_engine.py to keep that file under its governance
# line-count threshold. No behavior change: same lookup order, same output.
from __future__ import annotations

import os
import subprocess
from pathlib import Path


def barcode_font_css(engine) -> str:
    faces = []
    seen: set[str] = set()
    for el in engine._layout.elements:
        family = getattr(el, "barcodeFontFamily", "") or ""
        if not family or family in seen:
            continue
        seen.add(family)
        source = resolve_barcode_font_source(engine, el, family)
        if not source:
            continue
        fmt = source["format"]
        if source["kind"] == "path":
            faces.append(
                f"@font-face{{font-family:'{family}';"
                f"src:local('{family}'),url('{source['url']}') format('{fmt}');}}"
            )
        else:
            faces.append(f"@font-face{{font-family:'{family}';src:local('{family}');}}")
    return "".join(faces)


def resolve_barcode_font_source(engine, el, family: str) -> dict[str, str] | None:
    candidates: list[Path] = []
    layout_path = str(getattr(el, "barcodeFontPath", "") or engine._layout.__dict__.get("barcodeFontPath", "") or "")
    env_path = os.getenv("REPORTFORGE_BARCODE_FONT_PATH", "").strip()
    if layout_path:
        candidates.append(Path(layout_path).expanduser())
    if env_path:
        candidates.append(Path(env_path).expanduser())
    candidates.append(Path.home() / ".local" / "share" / "fonts" / f"{family}.ttf")
    candidates.append(Path.home() / ".local" / "share" / "fonts" / f"{family}.otf")
    candidates.append(Path("/usr/share/fonts") / f"{family}.ttf")
    for path in candidates:
        if path.exists():
            return {
                "kind": "path",
                "url": path.resolve().as_uri(),
                "format": (getattr(el, "barcodeFontFormat", "") or "truetype").lower(),
            }
    if fc_exact_family_exists(family):
        return {"kind": "local", "format": "truetype"}
    return None


def fc_exact_family_exists(family: str) -> bool:
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
    return (proc.stdout or "").strip() == family
