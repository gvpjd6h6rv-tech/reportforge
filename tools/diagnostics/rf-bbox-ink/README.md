# rf-bbox-ink — Preview hover/selection bbox diagnostic

Read-only visual-ink diagnostic for ReportForge **Preview**. It proves, from the
live DOM, whether the hover outline and the selection box hug the **same
external visual bbox** as the rendered black ink — and, when they don't, exactly
which layer diverges and by how many pixels.

Born as the instrumentation behind fix `#10.15`
(`fix(preview): hover/selection hug the same visual bbox`). Kept here as a
reusable tool so it never ships in the normal runtime.

## What it diagnoses

For each hovered / selected element it measures four boxes:

| Field | Source | Meaning |
|-------|--------|---------|
| `renderInkRect`      | `.preview-render-layer` `.cr-el` (`data-el-index`) | **The truth** — the visible black ink actually painted. |
| `hitLayerRect`       | `.preview-hit-layer` `.pv-el` (`data-origin-id`)   | Interaction proxy geometry. |
| `hoverOverlayRect`   | `.preview-hover-box`                                | The orange hover outline. |
| `selectionOverlayRect` | `.preview-selection-layer .sel-box`              | The blue selection box. |

It never mutates the model, selection, hover, or render. It only reads
`getBoundingClientRect()` and draws non-interactive overlays
(`pointer-events:none`).

## Activate

1. `tools/diagnostics/rf-bbox-ink/enable.sh` — copies the JS into `engines/` and
   adds its `<script>` tag to `designer/crystal-reports-designer-v4.html`.
2. Restart the server if needed, then open with the query flags and hard-reload
   (Ctrl+Shift+R):

   ```
   http://localhost:5001/?rf_bbox_ink=1&rf_bbox_zoom=40
   ```

   - `rf_bbox_ink=1` (or `window.RF_BBOX_INK = true`) turns it on. **Zero effect
     otherwise.**
   - `rf_bbox_zoom=N` magnifies only the *delta* (edges are pushed away from
     `renderInkRect` by N×). Layout is untouched; it just makes sub-pixel gaps
     visible. Also use the app's own zoom (100/200/400).

3. Hover / click an element. Read the console (`[RF_BBOX_INK]` /
   `RF_BBOX_DIAG_INCOMPLETE`) or use the on-screen buttons:
   - **EXPORT BBOX JSON** → downloads `rf_bbox_ink_YYYYMMDD_HHMMSS.json` with
     metadata + `hoverReports` and `selectionReports` **separated** (Chrome
     console collapses objects and mixes targets — the file is copy-safe).
   - **CLEAR BBOX LOGS** → empties the buffer and the ink layer.

4. `tools/diagnostics/rf-bbox-ink/disable.sh` — removes the `<script>` tag and
   deletes the runtime copy, restoring a clean runtime.

## realPx vs logicalPx

All rects come from `getBoundingClientRect()`, i.e. **screen pixels**, which
scale with the app zoom. So each side-delta is reported twice:

- `sides…_realPx` — raw screen px (a 4px gap at 400% zoom is 4 screen px).
- `sides…_logicalPx` — screen px ÷ zoom = **logical px** (that same 4px screen
  gap is **1 logical px**).

Always judge with **logicalPx** — it is zoom-invariant.

## Reading the report

- `renderNodeSource`: `index` (trustworthy — matched by section + data-el-index)
  · `nearest` (suspect — nearest-center fallback) · `none`.
- `status`: `OK` or `DIAG_INCOMPLETE`. A report is **incomplete** (not a verdict)
  when a rect is missing/0×0, when a selection can't be attributed to the same
  `elementId` (e.g. multiple sel-boxes), or when a hover is contaminated by a
  selection of a **different** element.
- `blueBoxDom`: every `.sel-box` / `.preview-hover-box` in the DOM with its
  class/parent/rect — reveals stale or mismatched boxes.

## Bug criterion

**Bug ⇔ any `sides…_logicalPx` ≠ 0.** The overlay/hit layer is not hugging the
ink.

## Closure criterion

`hoverOverlayRect` and `selectionOverlayRect` both hug `renderInkRect`:

```
sidesHoverVsRenderInk_logicalPx     = {top:0, left:0, right:0, bottom:0}
sidesSelectionVsRenderInk_logicalPx = {top:0, left:0, right:0, bottom:0}
```

with `renderNodeSource: index` and `status: OK`.

## ⚠️ Warning

**Read-only diagnostic. It must never patch the product.** It only measures and
reports. Any fix goes into the real ReportForge engines, validated *against* this
tool — not inside it.

## Runtime fingerprint

`/runtime-fingerprint` **permanently** reports the served Preview overlay/
selection files (`SelectionOverlayPreview.js`, `SelectionOverlayRender.js`,
`PreviewHoverOutline.js`, `PreviewOverlayStyle.js`) with their sha + fix-marker —
use it to confirm the browser isn't on a stale cache and the server serves the
`#10.15` fix. The fingerprint **does not depend on this tool**; it only
soft-reports `RfBboxInkDiagnostic.js` (under `enabled_diagnostics`) when
`enable.sh` has copied it into `engines/`.

## Files

- `RfBboxInkDiagnostic.js` — the diagnostic (served from `engines/` only while enabled).
- `enable.sh` / `disable.sh` — install / uninstall into the runtime (idempotent).
