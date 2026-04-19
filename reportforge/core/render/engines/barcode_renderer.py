from __future__ import annotations

from .advanced_engine_shared import _esc


def _render_barcode_svg(value: str, bc_type: str, w: int, h: int, show_text: bool) -> str:
    if bc_type in ("qr", "qrcode"):
        return _svg_qr_placeholder(value, w, h, show_text)
    return _svg_linear_barcode(value, w, h, show_text)


def _svg_linear_barcode(value: str, w: int, h: int, show_text: bool) -> str:
    chars = value[:20]
    pattern = []
    for ch in chars:
        code = ord(ch) % 16
        bits = f"{code:04b}"
        pattern.extend([1 if bit == "1" else 0 for bit in bits])
        pattern.append(0)
    pattern = [0, 0] + pattern + [1, 1, 0, 0]
    n = len(pattern)
    bar_w = max(1.0, (w - 4) / max(1, n))
    text_h = 10 if show_text else 0
    bar_h = h - text_h - 4
    bars = []
    x = 2.0
    for bit in pattern:
        if bit:
            bars.append(f'<rect x="{x:.1f}" y="2" width="{bar_w:.1f}" height="{bar_h}" fill="#000"/>')
        x += bar_w
    text_el = ""
    if show_text:
        text_el = (
            f'<text x="{w/2}" y="{h-2}" text-anchor="middle" '
            f'font-family="monospace" font-size="8">{_esc(value)}</text>'
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
