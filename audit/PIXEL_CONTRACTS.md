# Pixel Contract Testing

Generic system for declaring and validating explicit geometry contracts against
any UI component in a real browser. Runs via Playwright — no snapshot comparison,
no subjective diffs.

## Files

| File | Role |
|------|------|
| `audit/pixel-contracts.mjs` | Core module: runner, evaluator, Python pixel scanner |
| `audit/ruler_pixel_contracts.mjs` | Ruler contracts (INV-1…INV-13) |
| `audit/ruler_rendered_geometry_guard.mjs` | Playwright driver for rulers (Chromium + Firefox) |
| `reportforge/tests/pixel_contracts.test.mjs` | Unit tests (no browser needed) |

## Contract shape

```js
{
  name:      "top-ruler",           // human label + pixel scan key
  selector:  "#ruler-h-row",        // CSS selector

  expected: {
    heightPx:        22,            // exact CSS height in px
    widthPx:         200,           // exact CSS width in px
    width:           "fill-parent", // width === parent.width (exclusive with widthPx)
    height:          "fill-parent", // height === parent.height
    overflow:        "none",        // no overflow:hidden ancestor clips this element
    maxTolerancePx:  1.5,           // tolerance for all numeric checks (default 1.5)

    transform: {
      maxScaleDeviation: 0.01,      // |scaleX-1| and |scaleY-1| must be < this
    },

    canvas: {
      backingStore: true,           // bitmap.wh = cssWH × devicePixelRatio
      paintedArea: {
        axis:       "h",            // "h" scans rows, "v" scans columns
        minSpanPx:  18,             // painted span ≥ this (Layer 2 draw audit)
      },
    },

    pixelScan: {
      axis:                   "v",
      minPaintedThicknessPx:  20,   // painted content thickness ≥ this (Layer 3)
      bgColor:                [128, 128, 128],  // background RGB to subtract
      bgTolerance:            15,
    },
  },

  // Optional: cross-element or app-specific checks.
  // Receives all measurements, pixel scan results, and the context you passed.
  custom: (measurements, pixelRegions, context) => {
    const a = measurements["#ruler-h-row"]?.rect?.h;
    const b = measurements["#ruler-v"]?.rect?.w;
    if (Math.abs(a - b) > 1.5)
      return [{ id: "SYM", detail: `asymmetry: h=${a} w=${b}` }];
    return [];
  },
}
```

## Usage

```js
import { runContracts }  from './audit/pixel-contracts.mjs';

const contracts = [
  {
    name:     "top-ruler",
    selector: "#ruler-h-row",
    expected: {
      heightPx:       22,
      overflow:       "none",
      maxTolerancePx: 1,
    },
  },
  {
    name:     "h-canvas",
    selector: "#ruler-h-inner",
    expected: {
      height:  "fill-parent",
      canvas:  { backingStore: true },
    },
  },
];

// context is optional — passed to custom() validators
const context = await page.evaluate(() => window.MyApp?.config ?? null);

const { violations, measurements, pixelData } = await runContracts(page, contracts, {
  artifactsDir: "/tmp/myapp-artifacts",
  label:        "chromium",
  context,
});

if (violations.length > 0) {
  console.error(violations);
  // JSON + annotated debug PNG saved to artifactsDir automatically
}
```

## Measurement layers

| Layer | What | How |
|-------|------|-----|
| 1 — BCR | `getBoundingClientRect`, DPR, transform, clipping ancestor | `page.evaluate` in browser |
| 2 — Draw audit | Canvas `getImageData` bitmap pixel scan (painted span per axis) | `page.evaluate` in browser |
| 3 — Pixel scan | Screenshot → Python PIL → painted thickness per region | `python3` subprocess |

Layer 3 requires `Pillow` (`pip install Pillow`). Layers 1 and 2 run in any
Playwright-accessible browser without extra dependencies.

## Running ruler guard

```sh
# Start the RF server first, then:
node audit/ruler_rendered_geometry_guard.mjs
```

Artifacts (violations JSON + annotated PNG) are saved to `/tmp/rf_ruler_artifacts/`
on failure.

## Running unit tests

```sh
node --test reportforge/tests/pixel_contracts.test.mjs
```

No browser required. Tests inject synthetic measurements directly into `evaluateContract`.
