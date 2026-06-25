"""Code39 (ISO/IEC 16388) encoder — real implementation, no alias to Code128."""
from __future__ import annotations

from .advanced_engine_shared import _esc

def _text_anchor_x(align: str, w: int, quiet: int) -> tuple:
    if align == "left":   return quiet, "start"
    if align == "right":  return w - quiet, "end"
    return w / 2, "middle"

# 43-character alphabet + 1 START/STOP (*).  Index matches _C39_CHARS.
_C39_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%"
_C39_PATTERNS = (
    "000110100","100100001","001100001","101100000",
    "000110001","100110000","001110000","000100101",
    "100100100","001100100",
    "100001001","001001001","101001000","000011001",
    "100011000","001011000","000001101","100001100",
    "001001100","000011100","100000011","001000011",
    "101000010","000010011","100010010","001010010",
    "000000111","100000110","001000110","000010110",
    "110000001","011000001","111000000","010010001",
    "110010000","011010000","010000101","110000100",
    "011000100","010010100",
    "010000011","110000010","011000010","010101000",
)
_C39_LOOKUP = {c: _C39_PATTERNS[i] for i, c in enumerate(_C39_CHARS)}
_C39_START_STOP = "010010100"  # '*'

def svg_code39(value: str, w: int, h: int, show_text: bool, align: str = "center") -> str:
    if not value:
        value = "A"
    up = value.upper()
    for ch in up:
        if ch not in _C39_LOOKUP:
            raise ValueError(
                f"Character {ch!r} is not in the Code39 alphabet. "
                f"Valid: A-Z, 0-9, space, - . $ / + %"
            )
    if "*" in up:
        raise ValueError("'*' is the Code39 START/STOP symbol and cannot appear in data")

    symbols = [_C39_START_STOP] + [_C39_LOOKUP[ch] for ch in up] + [_C39_START_STOP]
    n_syms = len(symbols)

    # 3 wide elements (=3× narrow) + 6 narrow = 12 narrow units per symbol.
    # Inter-character gap = 1 narrow unit.
    total_mods = n_syms * 12 + (n_syms - 1) * 1
    narrow_w = max(0.3, w / (total_mods + 16))  # +16 for quiet zones (8 each side)
    wide_w = 3 * narrow_w

    text_h = 11 if show_text else 0
    bar_h = max(4, h - text_h - 3)

    bars: list[str] = []
    x = 8 * narrow_w  # left quiet zone
    for i, sym in enumerate(symbols):
        widths = [wide_w if b == "1" else narrow_w for b in sym]
        for j, pw in enumerate(widths):
            if j % 2 == 0:  # odd positions are bars
                bars.append(f'<rect x="{x:.2f}" y="1" width="{pw:.2f}" height="{bar_h}" fill="#000"/>')
            x += pw
        if i < n_syms - 1:
            x += narrow_w  # inter-character gap

    text_el = ""
    if show_text:
        tx, anchor = _text_anchor_x(align, w, int(8 * narrow_w))
        text_el = (
            f'<text x="{tx:.1f}" y="{h - 1}" text-anchor="{anchor}" '
            f'font-family="monospace" font-size="7.5">{_esc(value)}</text>'
        )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" '
        f'viewBox="0 0 {w} {h}" preserveAspectRatio="none">'
        f'<rect width="{w}" height="{h}" fill="white"/>'
        + "".join(bars) + text_el + "</svg>"
    )
