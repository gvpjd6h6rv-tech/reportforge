"""Barcode dispatcher — routes to the correct encoder by symbology.

Supported types (anything else raises ValueError):
  code128  — ISO/IEC 15417 Code128B (full encoder, real bars)
  code39   — ISO/IEC 16388 Code39   (full encoder, real bars)
  qr       — ISO/IEC 18004 QR Code  (full encoder, scannable)
  qrcode   — alias for qr
"""
from __future__ import annotations

from .advanced_engine_shared import _esc
from .barcode_encoder_code39 import svg_code39
from .barcode_encoder_qr import svg_qr

_SUPPORTED = frozenset({"code128", "code39", "qr", "qrcode"})


def _text_anchor_pos(align: str, w: int, quiet: int) -> tuple:
    if align == "left":   return quiet, "start"
    if align == "right":  return w - quiet, "end"
    return w / 2, "middle"


def _render_barcode_svg(value: str, bc_type: str, w: int, h: int,
                        show_text: bool, align: str = "center") -> str:
    t = (bc_type or "code128").lower().strip() or "code128"
    if t not in _SUPPORTED:
        raise ValueError(
            f"Barcode type {bc_type!r} is not supported. Supported: {sorted(_SUPPORTED)}"
        )
    if t in ("qr", "qrcode"):
        return svg_qr(value, w, h, show_text, align)
    if t == "code39":
        return svg_code39(value, w, h, show_text, align)
    return _svg_code128b(value, w, h, show_text, align)


# ── Code128B (ISO/IEC 15417) ──────────────────────────────────────────────────
_C128_BIN = (
    "11011001100","11001101100","11001100110","10010011000","10010001100",
    "10001001100","10011001000","10011000100","10001100100","11001001000",
    "11001000100","11000100100","10110011100","10011011100","10011001110",
    "10111001100","10011101100","10011100110","11001110010","11001011100",
    "11001001110","11011100100","11001110100","11101101110","11101001100",
    "11100101100","11100100110","11101100100","11100110100","11100110010",
    "11011011000","11011000110","11000110110","10100011000","10001011000",
    "10001000110","10110001000","10001101000","10001100010","11010001000",
    "11000101000","11000100010","10110111000","10110001110","10001101110",
    "10111011000","10111000110","10001110110","11101110110","11010001110",
    "11000101110","11011101000","11011100010","11011101110","11101011000",
    "11101000110","11100010110","11010111000","11010001110","11001011110",
    "11101101000","11101100010","11100011010","11101111010","11001000010",
    "11110001010","10100110000","10100001100","10010110000","10010000110",
    "10000101100","10000100110","10110010000","10110000100","10011010000",
    "10011000010","10000110100","10000110010","11000010010","11001010000",
    "11110111010","11000010100","10001111010","10100111100","10010111100",
    "10010011110","10111100100","10011110100","10011110010","11110100100",
    "11110010100","11110010010","11011011110","11011110110","11110110110",
    "10101111000","10100011110","10001011110","10111101000","10111100010",
    "11110101000","11110100010","10111011110","10111101110","11101011110",
    "11110101110",
    "11010000100","11010010000","11010011100",
)
_C128_STOP_BIN = "1100011101011"
_START_B = 104

def _c128_widths(b: str) -> tuple:
    runs, cnt, prev = [], 1, b[0]
    for c in b[1:]:
        if c == prev: cnt += 1
        else: runs.append(cnt); prev = c; cnt = 1
    runs.append(cnt)
    return tuple(runs)

_C128_PAT = tuple(_c128_widths(b) for b in _C128_BIN)
_C128_STOP = _c128_widths(_C128_STOP_BIN)

def _c128_pat(sym: int) -> tuple:
    if sym <= 105: return _C128_PAT[sym]
    if sym == 103: return _C128_PAT[106]
    if sym == 104: return _C128_PAT[107]
    if sym == 105: return _C128_PAT[108]
    return _C128_PAT[min(sym, 105)]

def _svg_code128b(value: str, w: int, h: int, show_text: bool, align: str = "center") -> str:
    if not value: value = "0"
    data = [ord(c) - 32 for c in value if 32 <= ord(c) <= 127]
    if not data: data = [0]
    check = (_START_B + sum((i + 1) * v for i, v in enumerate(data))) % 103
    sym_seq = [_START_B] + data + [check]
    widths_seq = [_c128_pat(s) for s in sym_seq] + [_C128_STOP]
    total_mods = sum(sum(p) for p in widths_seq)
    quiet = 8
    mod_w = max(0.5, (w - 2 * quiet) / total_mods)
    text_h = 11 if show_text else 0
    bar_h = max(4, h - text_h - 3)
    bars = []
    x = float(quiet)
    for widths in widths_seq:
        is_bar = True
        for mw in widths:
            pw = mw * mod_w
            if is_bar:
                bars.append(f'<rect x="{x:.2f}" y="1" width="{pw:.2f}" height="{bar_h}" fill="#000"/>')
            x += pw
            is_bar = not is_bar
    text_el = ""
    if show_text:
        tx, anchor = _text_anchor_pos(align, w, quiet)
        text_el = (f'<text x="{tx:.1f}" y="{h - 1}" text-anchor="{anchor}" '
                   f'font-family="monospace" font-size="7.5">{_esc(value)}</text>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" '
            f'viewBox="0 0 {w} {h}" preserveAspectRatio="none">'
            f'<rect width="{w}" height="{h}" fill="white"/>' + "".join(bars) + text_el + "</svg>")


# Backward-compat aliases (imported by advanced_engine.py and tests).
def _svg_linear_barcode(value: str, w: int, h: int, show_text: bool, align: str = "center") -> str:
    return _svg_code128b(value, w, h, show_text, align)

def _svg_qr_placeholder(value: str, w: int, h: int, show_text: bool, align: str = "center") -> str:
    """Retained for import compatibility — delegates to real QR encoder."""
    return svg_qr(value, w, h, show_text, align)
