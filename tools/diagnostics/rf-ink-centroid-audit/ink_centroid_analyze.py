#!/usr/bin/env python3
"""
RF Ink Centroid Analyzer

Reads raw screenshot metadata from rf_ink_centroid_audit.mjs and computes
visible ink centroid per field/state/zoom.

Diagnostic only.
"""

import json
import math
import os
import sys
from pathlib import Path
from typing import Dict, Any, List, Tuple

try:
    from PIL import Image, ImageDraw, ImageFont
except Exception as exc:
    print("ERROR: Pillow no está instalado. Instala con: python3 -m pip install pillow", file=sys.stderr)
    raise

import numpy as np


THRESHOLD = float(os.environ.get("INK_THRESHOLD", "140"))
BORDER_DARK_THRESHOLD = float(os.environ.get("BORDER_DARK_THRESHOLD", "110"))
EDGE_CSS_PX = float(os.environ.get("EDGE_CSS_PX", "2"))
Y_INSET_CSS_PX = float(os.environ.get("Y_INSET_CSS_PX", "0"))
CROP_SCALE = int(os.environ.get("CROP_SCALE", "4"))
NO_MOVE_EPS = float(os.environ.get("NO_MOVE_EPS", "1.0"))
SCAN_MODE = os.environ.get("SCAN_MODE", "auto")  # auto | full | right | left | center


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def safe_name(s: str) -> str:
    return "".join(c if c.isalnum() or c in "._-" else "_" for c in str(s))


def parse_px(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace("px", "")
    try:
        return float(s)
    except ValueError:
        return None


def choose_scan_x(x0, x1, align: str, mode: str):
    w = x1 - x0
    if w <= 2:
        return x0, x1

    align = (align or "").lower()
    mode = (mode or "auto").lower()

    if mode == "full":
        return x0, x1
    if mode == "right":
        return x0 + int(w * 0.55), x1
    if mode == "left":
        return x0, x0 + int(w * 0.55)
    if mode == "center":
        return x0 + int(w * 0.20), x0 + int(w * 0.80)

    # auto
    if "right" in align:
        return x0 + int(w * 0.55), x1
    if "left" in align:
        return x0, x0 + int(w * 0.65)
    return x0, x1


def suppress_border_lines(weights, brightness):
    """
    Suppress likely decorative borders without killing glyph strokes.
    Strategy:
    - Remove very dark horizontal rows that span most of ROI.
    - Remove very dark vertical columns only at ROI edges.
    """
    h, w = brightness.shape
    if h <= 0 or w <= 0:
        return weights

    dark_bool = brightness < BORDER_DARK_THRESHOLD

    # Horizontal border rows: dark across most width.
    row_frac = dark_bool.sum(axis=1) / max(1, w)
    for r, frac in enumerate(row_frac):
        if frac > 0.78:
            weights[r, :] = 0

    # Vertical border columns: only near left/right edges.
    edge = max(1, min(w // 4, int(round(EDGE_CSS_PX))))
    col_frac = dark_bool.sum(axis=0) / max(1, h)

    for c in list(range(edge)) + list(range(max(0, w - edge), w)):
        if 0 <= c < w and col_frac[c] > 0.55:
            weights[:, c] = 0

    return weights


def ink_measurement(image_path: str, meta: Dict[str, Any], out_dir: Path, label: str) -> Dict[str, Any]:
    if not image_path or not Path(image_path).exists():
        return {"status": "NO_SCREENSHOT", "error": image_path}

    if not meta or meta.get("status") != "OK":
        return {"status": "NO_META"}

    field_rect = meta.get("fieldRect") or {}
    styles = meta.get("styles") or {}
    model = meta.get("model") or {}

    dsf = float(meta.get("_deviceScaleFactor") or 1.0)

    im = Image.open(image_path).convert("RGB")
    arr = np.asarray(im).astype(np.float32)
    img_h, img_w = arr.shape[:2]

    left = float(field_rect.get("left", 0))
    right = float(field_rect.get("right", 0))
    top = float(field_rect.get("top", 0))
    bottom = float(field_rect.get("bottom", 0))

    x0 = int(round((left + EDGE_CSS_PX) * dsf))
    x1 = int(round((right - EDGE_CSS_PX) * dsf))
    y0 = int(round((top + Y_INSET_CSS_PX) * dsf))
    y1 = int(round((bottom - Y_INSET_CSS_PX) * dsf))

    x0 = clamp(x0, 0, img_w)
    x1 = clamp(x1, 0, img_w)
    y0 = clamp(y0, 0, img_h)
    y1 = clamp(y1, 0, img_h)

    if x1 <= x0 or y1 <= y0:
        return {
            "status": "BAD_ROI",
            "roi": {"x0": x0, "x1": x1, "y0": y0, "y1": y1},
        }

    align = (
        model.get("align")
        or styles.get("contentTextAlign")
        or styles.get("nodeJustifyContent")
        or ""
    )

    sx0, sx1 = choose_scan_x(x0, x1, align, SCAN_MODE)
    sx0 = clamp(sx0, 0, img_w)
    sx1 = clamp(sx1, 0, img_w)

    if sx1 <= sx0:
        sx0, sx1 = x0, x1

    region = arr[y0:y1, sx0:sx1, :]
    if region.size == 0:
        return {"status": "EMPTY_ROI"}

    brightness = region.mean(axis=2)
    weights = np.clip(THRESHOLD - brightness, 0, None)

    # Remove likely lines/borders.
    weights = suppress_border_lines(weights, brightness)

    total_weight = float(weights.sum())
    ink_mask = weights > 0
    ink_pixels = int(ink_mask.sum())

    if total_weight <= 1 or ink_pixels < 2:
        crop_path = save_crop(im, (sx0, y0, sx1, y1), out_dir, label, None)
        return {
            "status": "NO_INK_DETECTED",
            "crop": str(crop_path),
            "roi": {"x0": sx0, "x1": sx1, "y0": y0, "y1": y1},
            "inkPixels": ink_pixels,
            "totalWeight": total_weight,
        }

    row_weights = weights.sum(axis=1)
    col_weights = weights.sum(axis=0)

    rows = np.arange(weights.shape[0], dtype=np.float32)
    cols = np.arange(weights.shape[1], dtype=np.float32)

    centroid_row = float((row_weights * rows).sum() / total_weight)
    centroid_col = float((col_weights * cols).sum() / total_weight)

    any_rows = np.where(ink_mask.any(axis=1))[0]
    any_cols = np.where(ink_mask.any(axis=0))[0]

    vis_top_css = top + ((y0 - int(round(top * dsf))) + float(any_rows.min())) / dsf
    vis_bottom_css = top + ((y0 - int(round(top * dsf))) + float(any_rows.max())) / dsf
    vis_left_css = left + ((sx0 - int(round(left * dsf))) + float(any_cols.min())) / dsf
    vis_right_css = left + ((sx0 - int(round(left * dsf))) + float(any_cols.max())) / dsf

    centroid_y_css = top + ((y0 - int(round(top * dsf))) + centroid_row) / dsf
    centroid_x_css = left + ((sx0 - int(round(left * dsf))) + centroid_col) / dsf

    bbox_center_y = (vis_top_css + vis_bottom_css) / 2.0

    field_h = float(field_rect.get("height", 0) or 0)
    item_h = parse_px(styles.get("contentHeight"))
    line_h = parse_px(styles.get("contentLineHeight"))
    font_size = parse_px(styles.get("contentFontSize"))

    confidence = min(1.0, total_weight / 1500.0)
    if ink_pixels < 8:
        confidence *= 0.45

    crop_path = save_crop(
        im,
        (sx0, y0, sx1, y1),
        out_dir,
        label,
        {
            "centroid_row": centroid_row,
            "vis_top": float(any_rows.min()),
            "vis_bottom": float(any_rows.max()),
        },
    )

    return {
        "status": "OK",
        "crop": str(crop_path),
        "centroidY": round(centroid_y_css, 3),
        "centroidX": round(centroid_x_css, 3),
        "visibleTop": round(vis_top_css, 3),
        "visibleBottom": round(vis_bottom_css, 3),
        "visibleLeft": round(vis_left_css, 3),
        "visibleRight": round(vis_right_css, 3),
        "bboxCenterY": round(bbox_center_y, 3),
        "fieldH": round(field_h, 3),
        "itemH": round(item_h, 3) if item_h is not None else None,
        "lineHeight": round(line_h, 3) if line_h is not None else None,
        "fontSize": round(font_size, 3) if font_size is not None else None,
        "overflowRisk": round(max(0.0, (line_h or 0.0) - field_h), 3) if line_h else None,
        "inkPixels": ink_pixels,
        "totalWeight": round(total_weight, 2),
        "confidence": round(confidence, 3),
        "roi": {"x0": sx0, "x1": sx1, "y0": y0, "y1": y1},
        "scanMode": SCAN_MODE,
        "alignUsed": align,
    }


def save_crop(im: Image.Image, box: Tuple[int, int, int, int], out_dir: Path, label: str, overlay):
    crop = im.crop(box)
    if crop.width <= 0 or crop.height <= 0:
        crop = Image.new("RGB", (20, 20), "white")

    scale = max(1, CROP_SCALE)
    crop = crop.resize((crop.width * scale, crop.height * scale), Image.Resampling.NEAREST)
    draw = ImageDraw.Draw(crop)

    if overlay:
        cy = overlay["centroid_row"] * scale
        vt = overlay["vis_top"] * scale
        vb = overlay["vis_bottom"] * scale

        # centroid: red
        draw.line((0, cy, crop.width, cy), fill=(255, 0, 0), width=max(1, scale // 2))
        # bbox top/bottom: blue
        draw.line((0, vt, crop.width, vt), fill=(0, 80, 255), width=1)
        draw.line((0, vb, crop.width, vb), fill=(0, 80, 255), width=1)

    crop_path = out_dir / f"{safe_name(label)}_crop.png"
    crop.save(crop_path)
    return crop_path


def classify_group(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    by_state = {x["state"]: x for x in items if x.get("state") in ("top", "middle", "bottom")}
    missing = [s for s in ("top", "middle", "bottom") if s not in by_state]

    if missing:
        return {"verdict": "INCOMPLETE", "missing": missing}

    vals = {}
    for state in ("top", "middle", "bottom"):
        ink = by_state[state].get("ink") or {}
        if ink.get("status") != "OK":
            return {
                "verdict": ink.get("status", "NO_INK"),
                "failedState": state,
                "ink": ink,
            }
        vals[state] = float(ink["centroidY"])

    t, m, b = vals["top"], vals["middle"], vals["bottom"]
    span = b - t

    if abs(span) < NO_MOVE_EPS:
        verdict = "NO_MOVE"
    elif t < m < b:
        verdict = "CORRECT"
    elif t > m > b:
        verdict = "INVERTED"
    else:
        verdict = "MIXED"

    return {
        "verdict": verdict,
        "top": round(t, 3),
        "middle": round(m, 3),
        "bottom": round(b, 3),
        "span": round(span, 3),
    }


def make_contact_sheet(result_items: List[Dict[str, Any]], out_dir: Path):
    crops = []
    for item in result_items:
        ink = item.get("ink") or {}
        crop = ink.get("crop")
        if crop and Path(crop).exists():
            crops.append((item, Image.open(crop).convert("RGB")))

    if not crops:
        return None

    cell_w = max(im.width for _, im in crops)
    cell_h = max(im.height for _, im in crops) + 26
    cols = 3
    rows = math.ceil(len(crops) / cols)

    sheet = Image.new("RGB", (cols * cell_w, rows * cell_h), "white")
    draw = ImageDraw.Draw(sheet)

    for idx, (item, im) in enumerate(crops):
        x = (idx % cols) * cell_w
        y = (idx // cols) * cell_h
        sheet.paste(im, (x, y + 22))
        label = f"{item.get('fieldId')} {item.get('view')} {item.get('zoomLabel')} {item.get('state')}"
        draw.text((x + 4, y + 4), label[:60], fill=(0, 0, 0))

    path = out_dir / "contact_sheet.png"
    sheet.save(path)
    return path


def print_table(summary: List[Dict[str, Any]]):
    headers = [
        "Field",
        "View",
        "Zoom",
        "fieldH",
        "itemH",
        "lineH",
        "top",
        "middle",
        "bottom",
        "span",
        "verdict",
    ]

    rows = []
    for s in summary:
        sample = s.get("sample") or {}
        ink = sample.get("ink") or {}
        rows.append([
            s.get("fieldId", ""),
            s.get("view", ""),
            s.get("zoomLabel", ""),
            str(ink.get("fieldH", "")),
            str(ink.get("itemH", "")),
            str(ink.get("lineHeight", "")),
            str(s.get("top", "")),
            str(s.get("middle", "")),
            str(s.get("bottom", "")),
            str(s.get("span", "")),
            s.get("verdict", ""),
        ])

    widths = [len(h) for h in headers]
    for r in rows:
        for i, c in enumerate(r):
            widths[i] = max(widths[i], len(c))

    def fmt(r):
        return " | ".join(str(c).ljust(widths[i]) for i, c in enumerate(r))

    print("")
    print(fmt(headers))
    print("-+-".join("-" * w for w in widths))
    for r in rows:
        print(fmt(r))
    print("")


def main():
    if len(sys.argv) < 3:
        print("Uso: ink_centroid_analyze.py raw_results.json OUTPUT_DIR", file=sys.stderr)
        sys.exit(2)

    raw_path = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)

    raw = json.loads(raw_path.read_text())

    result_items = []

    for rec in raw.get("measurements", []):
        item = dict(rec)
        meta = item.get("meta") or {}
        meta["_deviceScaleFactor"] = item.get("deviceScaleFactor") or 1.0

        if item.get("status") == "NO_NODE":
            item["ink"] = {"status": "NO_NODE"}
        elif item.get("state"):
            label = f"{item.get('fieldId')}_{item.get('view')}_{item.get('zoomLabel')}_{item.get('state')}"
            item["ink"] = ink_measurement(item.get("screenshot"), meta, out_dir, label)
        else:
            item["ink"] = {"status": "SKIPPED"}

        result_items.append(item)

    groups = {}
    for item in result_items:
        key = (item.get("fieldId"), item.get("view"), item.get("zoomLabel"))
        groups.setdefault(key, []).append(item)

    summary = []
    for (field_id, view, zoom_label), items in groups.items():
        cls = classify_group(items)
        sample = next((x for x in items if (x.get("ink") or {}).get("status") == "OK"), items[0])
        summary.append({
            "fieldId": field_id,
            "view": view,
            "zoomLabel": zoom_label,
            **cls,
            "sample": sample,
        })

    verdict_order = {
        "INVERTED": 0,
        "MIXED": 1,
        "NO_MOVE": 2,
        "CORRECT": 3,
        "NO_INK_DETECTED": 4,
        "NO_NODE": 5,
        "INCOMPLETE": 6,
    }
    summary.sort(key=lambda x: (x.get("fieldId") or "", x.get("view") or "", x.get("zoomLabel") or ""))

    contact = make_contact_sheet(result_items, out_dir)

    results = {
        "generatedAt": raw.get("generatedAt"),
        "config": raw.get("config"),
        "summary": summary,
        "items": result_items,
        "contactSheet": str(contact) if contact else None,
        "legend": {
            "CORRECT": "top < middle < bottom; Y baja correctamente al pedir bottom",
            "INVERTED": "top > middle > bottom; alinear arriba baja la tinta visible",
            "NO_MOVE": f"abs(bottom-top) < {NO_MOVE_EPS}px CSS",
            "MIXED": "No hay orden limpio",
            "NO_INK_DETECTED": "No se detectó tinta confiable",
        },
    }

    (out_dir / "results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")

    print_table(summary)

    counts = {}
    for s in summary:
        counts[s.get("verdict", "UNKNOWN")] = counts.get(s.get("verdict", "UNKNOWN"), 0) + 1

    print("Resumen:")
    for k in sorted(counts, key=lambda x: verdict_order.get(x, 99)):
        print(f"  {k}: {counts[k]}")

    if contact:
        print(f"\nContact sheet: {contact}")

    print(f"Results JSON: {out_dir / 'results.json'}")


if __name__ == "__main__":
    main()
