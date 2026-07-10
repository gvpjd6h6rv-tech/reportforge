# rf-drag-line-section-lock-ink — horizontal-drag section-lock diagnostic

Read-only visual-ink diagnostic for the Design canvas drag engine. It proves,
from the live DOM and the real model, that a **horizontal-only** drag on an
element taller than its own section (e.g. a vertical line whose bottom edge
touches/enters the next section) changes **only x** — `sectionId`, `y`, and
the DOM owner section must stay on the original section, even though the
element keeps visually invading the next one.

Born as the instrumentation behind fix `DESIGNER-DRAG-LINE-SECTION-LOCK-01`.
Kept here as a reusable tool so it can re-verify the contract any time the
drag engine changes, without shipping in the normal runtime.

## What it diagnoses

The bug had three independent root-cause layers, all in
`engines/DocumentActionsLayoutClamp.js::normalizeElementLayout` and
`engines/SelectionInteractionMotion.js::_doMove`:

1. `_doMove` used to send `{x, y}` unconditionally on every `mousemove` tick.
2. `normalizeElementLayout`'s overflow/carry re-owner fired whenever the
   patch merely *had* a `y` key, not when `y` actually changed — an
   oversized element (taller than its own section) overflows its own band
   on every move regardless of real vertical intent.
3. `normalizeElementLayout`'s anti-straddle `y`-clamp ran unconditionally;
   for an oversized element `maxY=0`, so even a correctly-omitted-`y` patch
   still got a forced `y=0` the moment *any* patch touched the element
   (`curY` falls back to `element.y` and gets clamped). Only visible
   against a non-grid-aligned `y` — confirmed live against
   `factura_a4.json`, where `DS.snap(5)` itself returns `4.988976...`, so
   comparing a snapped drag candidate against the raw stored `y` produced a
   false "vertical intent" even at a real mouse `deltaY = 0`.

It never mutates the model outside the drag/insert it performs, and the ink
overlay is `pointer-events:none` — it never intercepts the real drag.

## Ink drawn

| Color | Meaning |
|-------|---------|
| Blue rect | Owner section (original, before **and** after) |
| Orange rect | Next section (the one the element's bottom overlaps) |
| Purple rect | Element's real bounding box |
| Green bar | The line's visible vertical axis |
| Blue dot | Top anchor |
| Red dot | Bottom end |
| Label panel | `sectionId_before/after`, `y_before/after`, `x_before/after`, `lineBottom`, `ownerSectionBottom` |

## Run

Self-contained — spawns its own `reportforge_server.py` on `--port` from the
repo's current disk, so it always reflects freshly-loaded code:

```bash
node drag_line_section_lock_ink.mjs --scenario fixture --port 5273 --outdir /tmp/rf-drag-line-section-lock-ink
node drag_line_section_lock_ink.mjs --scenario factura --port 5274 --outdir /tmp/rf-drag-line-section-lock-ink
```

- `--scenario fixture` (default) — minimal synthetic 2-section layout
  (`reportforge/tests/fixtures/designer_drag_line_section_lock_two_section_vline.json`):
  `vline1` (h=60) in a 30px section, `y=5` (deliberately **not**
  grid-aligned, so it also exercises root-cause layer 3). Produces
  `fixture_idle.png` and `fixture_after_horizontal_drag.png`.
- `--scenario factura` — real production layout (`reportforge/layouts/factura_a4.json`),
  vertical line inserted via the **real toolbar tool** (`#tool-line-v`,
  click-to-place in the one free sliver of `s-ph`), same insertion path a
  user would use. Produces `factura_a4_after_horizontal_drag.png`.

## Bug criterion

**Bug ⇔ any of these is false** (printed as `asserts` in the JSON report):

```
sectionId_before === sectionId_after
y_before === y_after
x_after !== x_before
lineBottom_after > ownerSectionBottom   (element still genuinely overflows)
domOwner_is_original_section            (DOM node never reparented)
```

Exit code is `1` if any assertion fails, `0` otherwise.

## ⚠️ Warning

**Read-only diagnostic. It must never patch the product.** It only drags,
measures, and reports. Any fix goes into the real ReportForge engines,
validated *against* this tool — not inside it.

## Files

- `drag_line_section_lock_ink.mjs` — the diagnostic (spawns its own server, no install step needed).
