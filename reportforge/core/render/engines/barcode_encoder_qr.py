"""QR Code (ISO/IEC 18004) encoder — version 1-10, ECC level M, byte mode."""
from __future__ import annotations

from .advanced_engine_shared import _esc

def _text_anchor_x(align: str, w: int, quiet: int) -> tuple:
    if align == "left":   return quiet, "start"
    if align == "right":  return w - quiet, "end"
    return w / 2, "middle"

_QR_ECC_M = {  # version: (total_cw, data_cw, ecc_per_block, n_blocks)
    1:  (26,  16, 10, 1),  2:  (44,  28, 16, 1),  3:  (70,  44, 13, 2),
    4:  (100, 64, 18, 2),  5:  (134, 86, 24, 2),  6:  (172, 108,16, 4),
    7:  (196, 124,18, 4),  8:  (242, 154,22, 4),  9:  (292, 182,22, 5),
    10: (346, 216,26, 5),
}

def svg_qr(value: str, w: int, h: int, show_text: bool, align: str = "center") -> str:
    matrix = _qr_matrix(value.encode("iso-8859-1", errors="replace"))
    size = len(matrix)
    text_h = 11 if show_text else 0
    quiet = 4  # ISO 18004 §6.3.10: minimum 4-module quiet zone on all sides
    total_modules = size + 2 * quiet
    cell = (min(w, h - text_h)) / total_modules
    x_off = (w - total_modules * cell) / 2 + quiet * cell
    y_off = quiet * cell

    rects: list[str] = [f'<rect width="{w}" height="{h}" fill="white"/>']
    for r in range(size):
        c = 0
        while c < size:
            if matrix[r][c]:
                start = c
                while c < size and matrix[r][c]:
                    c += 1
                rects.append(
                    f'<rect x="{x_off + start*cell:.2f}" y="{y_off + r*cell:.2f}" '
                    f'width="{(c-start)*cell:.2f}" height="{cell:.2f}" fill="#000"/>'
                )
            else:
                c += 1

    text_el = ""
    if show_text:
        tx, anchor = _text_anchor_x(align, w, 4)
        text_el = (
            f'<text x="{tx:.1f}" y="{h - 1}" text-anchor="{anchor}" '
            f'font-family="monospace" font-size="7">{_esc(value[:30])}</text>'
        )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" '
        f'viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid meet">'
        + "".join(rects) + text_el + "</svg>"
    )


def _qr_matrix(data: bytes) -> list[list[int]]:
    n = len(data)
    version = next(
        (v for v, (_, dc, _, _) in _QR_ECC_M.items() if dc >= n + 2),
        None,
    )
    if version is None:
        raise ValueError(f"Data too long for QR version 1-10 at ECC M ({n} bytes)")

    size = version * 4 + 17
    mat = [[0] * size for _ in range(size)]
    reserved = [[False] * size for _ in range(size)]

    def set_mod(r, c, v):
        mat[r][c] = v; reserved[r][c] = True

    def finder(tr, tc):
        for dr in range(7):
            for dc in range(7):
                on = dr in (0, 6) or dc in (0, 6) or (2 <= dr <= 4 and 2 <= dc <= 4)
                if 0 <= tr+dr < size and 0 <= tc+dc < size:
                    set_mod(tr+dr, tc+dc, 1 if on else 0)
        for i in range(-1, 8):  # full perimeter including all 4 corners
            for r2, c2 in [(tr+i, tc-1), (tr+i, tc+7), (tr-1, tc+i), (tr+7, tc+i)]:
                if 0 <= r2 < size and 0 <= c2 < size:
                    set_mod(r2, c2, 0)

    finder(0, 0); finder(0, size-7); finder(size-7, 0)

    for i in range(8, size-8):
        set_mod(6, i, (i+1) % 2); set_mod(i, 6, (i+1) % 2)

    _AP = {2:[6,18],3:[6,22],4:[6,26],5:[6,30],6:[6,34],
           7:[6,22,38],8:[6,24,42],9:[6,26,46],10:[6,28,50]}
    if version >= 2:
        coords = _AP[version]
        for r2 in coords:
            for c2 in coords:
                if reserved[r2][c2]: continue
                for dr in range(-2, 3):
                    for dc in range(-2, 3):
                        on = abs(dr) == 2 or abs(dc) == 2 or (dr == 0 and dc == 0)
                        set_mod(r2+dr, c2+dc, 1 if on else 0)

    for i in range(9):
        if i != 6: reserved[8][i] = True; reserved[i][8] = True
    for i in range(size-8, size):
        reserved[8][i] = True; reserved[i][8] = True

    bits: list[int] = [0,1,0,0] + [(n >> (7-i)) & 1 for i in range(8)]
    for byte in data:
        bits += [(byte >> (7-i)) & 1 for i in range(8)]
    bits += [0,0,0,0]

    _, dc, ecc_per_block, n_blocks = _QR_ECC_M[version]
    while len(bits) % 8: bits.append(0)
    pad_bytes = [0xEC, 0x11]; i_pad = 0
    while len(bits) < dc * 8:
        bits += [(pad_bytes[i_pad%2] >> (7-j)) & 1 for j in range(8)]; i_pad += 1
    bits = bits[:dc*8]
    data_cws = [int("".join(str(b) for b in bits[i*8:(i+1)*8]), 2) for i in range(dc)]

    block_sz = dc // n_blocks; rem = dc % n_blocks
    blocks = []; idx = 0
    for b in range(n_blocks):
        blen = block_sz + (1 if b < rem else 0)
        blocks.append(data_cws[idx:idx+blen]); idx += blen

    def _rs_ecc(data_block, n_ecc):
        gf_exp = [0]*512; gf_log = [0]*256; x = 1
        for i in range(255):
            gf_exp[i] = x; gf_log[x] = i; x <<= 1
            if x > 255: x ^= 0x11D
        for i in range(255, 512): gf_exp[i] = gf_exp[i-255]
        mul = lambda a, b: 0 if (a==0 or b==0) else gf_exp[gf_log[a]+gf_log[b]]
        g = [1]
        for i in range(n_ecc):
            new_g = [0]*(len(g)+1); ai = gf_exp[i]
            for j, coef in enumerate(g):
                new_g[j] ^= coef; new_g[j+1] ^= mul(coef, ai)
            g = new_g
        msg = list(data_block) + [0]*n_ecc
        for i in range(len(data_block)):
            coef = msg[i]
            if coef:
                for j, gv in enumerate(g): msg[i+j] ^= mul(gv, coef)
        return msg[len(data_block):]

    ecc_blocks = [_rs_ecc(b, ecc_per_block) for b in blocks]
    final_cws = []
    max_b = max(len(b) for b in blocks)
    for i in range(max_b):
        for b in blocks:
            if i < len(b): final_cws.append(b[i])
    for i in range(ecc_per_block):
        for eb in ecc_blocks: final_cws.append(eb[i])

    final_bits = []
    for cw in final_cws: final_bits += [(cw >> (7-i)) & 1 for i in range(8)]
    final_bits += [0] * [0,7,7,7,7,7,0,0,0,0][version-1]

    bit_idx = 0; col = size-1; going_up = True
    while col >= 0:
        if col == 6: col -= 1; continue
        rows = range(size-1, -1, -1) if going_up else range(size)
        for row in rows:
            for c2 in (col, col-1):
                if not reserved[row][c2] and bit_idx < len(final_bits):
                    mat[row][c2] = final_bits[bit_idx]; bit_idx += 1
        col -= 2; going_up = not going_up

    for r2 in range(size):
        for c2 in range(size):
            if not reserved[r2][c2] and (r2+c2) % 2 == 0:
                mat[r2][c2] ^= 1

    fmt = [1,0,1,0,1,0,0,0,0,0,1,0,0,1,0]
    fi = [(8,i,fmt[i]) for i in range(6)] + [(8,7,fmt[6]),(8,8,fmt[7]),(7,8,fmt[8])]
    fi += [(5-i,8,fmt[9+i]) for i in range(6)]
    fi += [(size-1-i,8,fmt[i]) for i in range(7)]
    fi += [(8,size-8+i,fmt[7+i]) for i in range(8)]
    for r2, c2, v2 in fi:
        if 0 <= r2 < size and 0 <= c2 < size: mat[r2][c2] = v2

    mat[4 * version + 9][8] = 1  # ISO 18004 §7.9: mandatory dark module, always 1

    return mat
