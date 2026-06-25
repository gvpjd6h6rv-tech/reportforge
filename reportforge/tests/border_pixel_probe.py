#!/usr/bin/env python3
"""
border_pixel_probe.py — checks whether a rect/line element's stroke is
ACTUALLY PAINTED on screen, by sampling real pixels against the EXPECTED
border color (not a generic "is it dark" heuristic — real layouts use
gray (#888), blue, etc. borders, not just black).

Usage: border_pixel_probe.py <screenshot.png> <boxLocalX> <boxLocalY> <boxW> <boxH> <margin> <r> <g> <b>
  The screenshot must be a clip of [boxLocalX-margin, boxLocalY-margin] to
  [boxLocalX+boxW+margin, boxLocalY+boxH+margin] (i.e. the element's own
  box plus a margin-px border of surrounding context on all sides).
  r,g,b: the EXPECTED border color (from getComputedStyle's borderColor —
  that resolves correctly regardless of whether borderWidth/borderStyle
  are valid, so it's a trustworthy target even when the bug under test is
  exactly "borderWidth/Style failed to apply").

A real border/line paints a CONTINUOUS line of close-to-that-color pixels
spanning (close to) the full length of an edge. Random nearby content
(e.g. a bold text label placed close to a box's edge) only colors
ISOLATED points along that edge, never a high proportion of it. A few
candidate offsets (0..2px) from the exact edge absorb sub-pixel
anti-aliasing without widening the search so much that interior content
merely sitting close to the edge gets picked up instead.

Prints JSON: {"edgeMatchFractions": {...}, "painted": bool}
"""
import json
import sys

from PIL import Image

COLOR_MATCH_TOLERANCE = 40     # per-channel distance to count as "matches the expected border color"
MATCH_FRACTION_THRESHOLD = 0.6  # >=60% of an edge's length must match
OFFSET_CANDIDATES = (0, 1, 2)   # sub-pixel anti-aliasing tolerance


def matches(img, points, target):
    if not points:
        return 0.0
    matched = 0
    total = 0
    for (px, py) in points:
        if px < 0 or py < 0 or px >= img.width or py >= img.height:
            continue
        r, g, b = img.getpixel((px, py))[:3]
        total += 1
        if abs(r - target[0]) <= COLOR_MATCH_TOLERANCE and abs(g - target[1]) <= COLOR_MATCH_TOLERANCE and abs(b - target[2]) <= COLOR_MATCH_TOLERANCE:
            matched += 1
    return (matched / total) if total else 0.0


def best_fraction_near(img, line_points_fn, length, offsets, target):
    best = 0.0
    for off in offsets:
        if off >= length:
            break
        frac = matches(img, line_points_fn(off), target)
        if frac > best:
            best = frac
    return best


def main():
    path, bx, by, bw, bh, margin, r, g, b = sys.argv[1], *[int(v) for v in sys.argv[2:10]]
    img = Image.open(path).convert("RGB")
    target = (r, g, b)

    fractions = {
        "top": best_fraction_near(img, lambda off: [(bx + dx, by + off) for dx in range(bw)], bh, OFFSET_CANDIDATES, target),
        "bottom": best_fraction_near(img, lambda off: [(bx + dx, by + bh - 1 - off) for dx in range(bw)], bh, OFFSET_CANDIDATES, target),
        "left": best_fraction_near(img, lambda off: [(bx + off, by + dy) for dy in range(bh)], bw, OFFSET_CANDIDATES, target),
        "right": best_fraction_near(img, lambda off: [(bx + bw - 1 - off, by + dy) for dy in range(bh)], bw, OFFSET_CANDIDATES, target),
    }
    painted = any(f >= MATCH_FRACTION_THRESHOLD for f in fractions.values())

    print(json.dumps({"edgeMatchFractions": fractions, "painted": painted}))


if __name__ == "__main__":
    main()
