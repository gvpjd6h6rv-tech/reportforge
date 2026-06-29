# RF Preview → Insert — Diagnostic Flight Recorders

Diagnostic tools for the Preview → Insert flow. **Not CI tests.** Run manually only.

---

## Files

| File | Purpose |
|---|---|
| `rf_preview_insert_menu_flight_recorder_live.spec.js` | **Baseline recorder** — no fix injection, records unmodified production behaviour for all 7 Insertar tools from Preview mode |
| `rf_preview_insert_flight_recorder_fix_injected.mjs` | **Fix-injection recorder** — injects `insertAtDefaultPosition` + section-height fix into `InsertEngine` via `page.evaluate` (no file writes); extended probes include `elementFromPoint`, `contain:paint` clipping verdict, 3-click survival |

---

## Prerequisites

```bash
# App running on localhost:5001
cd /path/to/RF && python app.py   # or however the dev server starts

# Playwright installed
npm install   # playwright is in devDependencies
```

---

## Usage

### Baseline (unmodified production behaviour)

```bash
cd /path/to/RF

# Headed (default — opens a real browser window, recommended)
node tools/diagnostics/rf-preview-insert/rf_preview_insert_menu_flight_recorder_live.spec.js

# Headless
HEADLESS=1 node tools/diagnostics/rf-preview-insert/rf_preview_insert_menu_flight_recorder_live.spec.js

# Custom target
FLIGHT_URL=http://localhost:8080/ node tools/diagnostics/rf-preview-insert/rf_preview_insert_menu_flight_recorder_live.spec.js
```

### Fix-injected (section-height fix + extended probes)

```bash
cd /path/to/RF

# Headed (default)
node --experimental-vm-modules tools/diagnostics/rf-preview-insert/rf_preview_insert_flight_recorder_fix_injected.mjs

# Headless
HEADLESS=1 node --experimental-vm-modules tools/diagnostics/rf-preview-insert/rf_preview_insert_flight_recorder_fix_injected.mjs

# Custom target
FLIGHT_URL=http://localhost:8080/ node --experimental-vm-modules tools/diagnostics/rf-preview-insert/rf_preview_insert_flight_recorder_fix_injected.mjs
```

---

## Output

Both tools write to `scratchpad/flight-recorder/` (relative to the RF repo root):

- `baseline-<timestamp>.jsonl` — full event timeline (baseline)
- `fix-injected-<timestamp>.jsonl` — full event timeline (fix-injected)
- `<action>-01-design.png`, `<action>-02-preview.png`, `<action>-03-post-insert.png` — screenshots per tool per phase
- `<action>-05-click-N-before/after.png` — click survival screenshots (fix-injected only)

---

## What each recorder measures

### Baseline (`rf_preview_insert_menu_flight_recorder_live.spec.js`)

| Signal | What it tells you |
|---|---|
| `setTool ✔/✘` | Did `InsertEngine.setTool` fire? |
| `hide ✔/✘` | Did `PreviewEngineMode.hide()` fire? |
| `setElements ✔/✘` | Did `DS.setElements` fire? |
| `DS+1 ✔/✘` | Element added to model? |
| `DOM+1 ✔/✘` | Element added to DOM? |
| `inSection ✔/✘` | Element inside `.cr-section` (not `#preview-content`)? |
| `wsOK ✔/✘` | `#workspace` retained the `workspace` class? |
| `overlay gone ✔/✘` | `canvas-layer` has no `preview-mode` class? |

### Fix-injected (`rf_preview_insert_flight_recorder_fix_injected.mjs`)

All baseline signals plus:

| Signal | What it tells you |
|---|---|
| `insDefault ✔/✘` | Did `insertAtDefaultPosition` fire? |
| `notClipped ✔/✘` | Element bottom ≤ section height? (`contain:paint` clipping check) |
| `hittable ✔/✘` | `elementFromPoint` at element center returns `.cr-element` or `sel-handle`? |
| `survived ✔/✘` | Element still in DOM after 3 clicks? |
| `efp@(x,y)` | Exact element returned by `elementFromPoint` at element center |
| `sectionH / elBottom` | Raw values for the clipping calculation |

---

## Root cause these tools diagnosed

**The section `det` had `height=14px`. `insertAtDefaultPosition` placed elements at `relY=4` with `h≥16`. Bottom (20px) exceeded section height (14px). CSS `contain: layout paint` on `.cr-section` clipped the element. `elementFromPoint` returned `.cr-section` (the parent), not `.cr-element` (the child). `DS+1` and `DOM+1` both passed → automated tests showed green for 20+ iterations while manual smoke failed every time.**

Fix applied in `engines/InsertEngine.js`: `insertAtDefaultPosition` now checks `sec.height < needed` and grows the section before rendering the element. Verified by `reportforge/tests/insert_preview_metamorphic.test.mjs` (3-phase: fix→PASS, bug→FAIL, fix→PASS).

---

## Do NOT add to CI

These tools are intentionally outside `reportforge/tests/` and `tests/e2e/`. They:
- Require a live server (`localhost:5001`)
- Open real browser windows by default
- Write to `scratchpad/` (not committed)
- Are for manual investigation, not regression gates
