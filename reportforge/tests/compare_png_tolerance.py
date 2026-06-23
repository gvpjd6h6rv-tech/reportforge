#!/usr/bin/env python3
"""
compare_png_tolerance.py — perceptual diff for two same-size PNGs.

Exact byte/SHA256 comparison of screenshots is too strict: real browser
text rendering has inherent sub-pixel anti-aliasing jitter (confirmed via
two independent runs of the same Playwright test producing byte-identical
screenshots of each other, but a small, consistent few-dozen-pixel diff
against a screenshot captured via a separate baseline-update script run).
This reports diff stats so the caller can apply a tolerance threshold,
instead of silently accepting any drift.

Usage: compare_png_tolerance.py <baseline.png> <actual.png>
Prints JSON: {"total": int, "nonzero": int, "maxDiff": int, "mean": float}
"""
import json
import sys

from PIL import Image, ImageChops
import numpy as np

def main():
    baseline_path, actual_path = sys.argv[1], sys.argv[2]
    a = Image.open(baseline_path).convert("RGB")
    b = Image.open(actual_path).convert("RGB")
    if a.size != b.size:
        print(json.dumps({"error": f"size mismatch: {a.size} vs {b.size}"}))
        sys.exit(1)
    diff = np.array(ImageChops.difference(a, b))
    per_pixel = diff.sum(axis=2)
    result = {
        "total": int(per_pixel.size),
        "nonzero": int((per_pixel > 10).sum()),
        "maxDiff": int(diff.max()),
        "mean": float(diff.mean()),
    }
    print(json.dumps(result))

if __name__ == "__main__":
    main()
