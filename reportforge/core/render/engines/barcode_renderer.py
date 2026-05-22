from __future__ import annotations

from .advanced_engine_shared import _esc


def _render_barcode_svg(value: str, bc_type: str, w: int, h: int, show_text: bool) -> str:
    if bc_type in ("qr", "qrcode"):
        return _svg_qr_placeholder(value, w, h, show_text)
    return _svg_linear_barcode(value, w, h, show_text)


def _svg_linear_barcode(value: str, w: int, h: int, show_text: bool) -> str:
    return _svg_code128b(value, w, h, show_text)


# ---------------------------------------------------------------------------
# Real Code128B encoder
# Binary patterns (11 modules each) derived from ISO/IEC 15417.
# Indices 0-105 = data symbols; 106=StartA, 107=StartB, 108=StartC; STOP separate.
# ---------------------------------------------------------------------------
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
    "11010000100","11010010000","11010011100",  # 106=StartA, 107=StartB, 108=StartC
)
_C128_STOP_BIN = "1100011101011"  # 13 modules


def _c128_widths(b: str) -> tuple:
    runs, cnt, prev = [], 1, b[0]
    for c in b[1:]:
        if c == prev:
            cnt += 1
        else:
            runs.append(cnt)
            prev = c
            cnt = 1
    runs.append(cnt)
    return tuple(runs)


_C128_PAT = tuple(_c128_widths(b) for b in _C128_BIN)
_C128_STOP = _c128_widths(_C128_STOP_BIN)
_START_B = 104  # symbol value


def _c128_pat(sym: int) -> tuple:
    if sym <= 105:
        return _C128_PAT[sym]
    if sym == 103:
        return _C128_PAT[106]
    if sym == 104:
        return _C128_PAT[107]
    if sym == 105:
        return _C128_PAT[108]
    # fallback: use closest valid symbol
    return _C128_PAT[min(sym, 105)]


def _svg_code128b(value: str, w: int, h: int, show_text: bool) -> str:
    if not value:
        value = "0"
    data = [ord(c) - 32 for c in value if 32 <= ord(c) <= 127]
    if not data:
        data = [0]
    check = (_START_B + sum((i + 1) * v for i, v in enumerate(data))) % 103
    sym_seq = [_START_B] + data + [check]
    widths_seq = [_c128_pat(s) for s in sym_seq] + [_C128_STOP]

    total_mods = sum(sum(p) for p in widths_seq)
    quiet = 8
    usable = w - 2 * quiet
    mod_w = max(0.5, usable / total_mods)

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
        text_el = (
            f'<text x="{w / 2:.1f}" y="{h - 1}" text-anchor="middle" '
            f'font-family="monospace" font-size="7.5">{_esc(value)}</text>'
        )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
        f'<rect width="{w}" height="{h}" fill="white"/>'
        + "".join(bars)
        + text_el
        + "</svg>"
    )


def _svg_qr_placeholder(value: str, w: int, h: int, show_text: bool) -> str:
    size = min(w, h) - (12 if show_text else 4)
    x0 = (w - size) // 2
    text_el = ""
    if show_text:
        text_el = (
            f'<text x="{w/2}" y="{h-2}" text-anchor="middle" '
            f'font-family="monospace" font-size="7">{_esc(value[:20])}</text>'
        )
    cell = size // 7
    rects = [
        f'<rect x="{x0}" y="2" width="{size}" height="{size}" fill="none" stroke="#000" stroke-width="1"/>'
    ]
    for fx, fy in [(0, 0), (4 * cell, 0), (0, 4 * cell)]:
        rects.append(f'<rect x="{x0+fx}" y="{2+fy}" width="{3*cell}" height="{3*cell}" fill="#000"/>')
        rects.append(
            f'<rect x="{x0+fx+cell//2}" y="{2+fy+cell//2}" width="{2*cell}" height="{2*cell}" fill="white"/>'
        )
    for row in range(7):
        for col in range(7):
            if (row + col) % 3 == 0 and not (row < 3 and col < 3):
                rects.append(
                    f'<rect x="{x0+col*cell}" y="{2+row*cell}" width="{cell-1}" height="{cell-1}" fill="#000"/>'
                )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
        f'<rect width="{w}" height="{h}" fill="white"/>'
        + "".join(rects)
        + text_el
        + "</svg>"
    )
