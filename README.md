# ReportForge v19.0

> Crystal Reports–compatible report designer for SAP Business One (Ecuador SRI)

**Current version:** v19.0 — Modular Engine Architecture  
**Designer:** `designer/crystal-reports-designer-v4.html`  
**Server:** `reportforge_server.py` (stdlib only, port 8080)

## Quick start

```bash
python3 reportforge_server.py
# Open: http://localhost:8080/classic
```

## Engine Architecture (v19)

```
/engines/
  WorkspaceScrollEngine.js   — scroll container sizing
  GridEngine.js              — zoom-aware dot grid
  SnapEngine.js              — model-space snap
  RulerEngine.js             — DPR-correct rulers
```

All geometry through `RF.Geometry` — no raw `DS.zoom` in render paths.

## Version history

See [CHANGELOG.md](CHANGELOG.md) for full history from v18.0 → v19.0.

---

# ReportForge v18.14 v18.0

> Crystal Reports–style visual report designer — open source, browser-based, fully offline.

## What it is

ReportForge is a complete Crystal Reports–compatible report designer

**Current version:** v18.14 — Unified Geometry Engine (complete)

All coordinate conversions go through `RF.Geometry`. Canvas, sections, elements, fonts, and preview renderer all scale consistently with `DS.zoom`. that runs in the browser:

- **Visual canvas designer** with Crystal Reports XI fidelity (rulers, sections, snap guides, L-shaped selection handles, property inspector, field explorer)
- **Python render engine** — layouts → PDF, HTML, XLSX, CSV
- **REST API** compatible with Crystal Reports generation workflows
- **Advanced QA pipeline** — 43 scripts, 1000+ automated tests, zero regressions

## Quick Start

```bash
cd reportforge-complete
python3 reportforge_server.py
# Open http://localhost:8080
```

## Docker

```bash
docker compose up -d && open http://localhost:8080
```

## Project Structure

```
reportforge-complete/
├── designer/
│   └── crystal-reports-designer-v4.html   # Single-file designer (all engines inline)
├── reportforge/
│   ├── core/render/                        # Python render engine
│   │   ├── expressions/                    # Formula engine (Python + JS)
│   │   ├── engines/                        # HTML / PDF / enterprise renderers
│   │   └── export/                         # CSV, DOCX, HTML exporters
│   └── server/                             # FastAPI REST API
├── sandbox/
│   ├── god-level-qa.js                     # 955-test engine QA
│   └── full-verification.js                # 66-test runtime checks
├── repo-super.sh                           # Master QA orchestrator (33 scripts)
├── repo-designer-god.sh                    # Master designer validation (60 checks)
├── repo-command-matrix.sh                  # Command coverage (84/84)
├── repo-layout-invariants.sh              # Layout invariant engine (12 invariants)
└── docs/                                   # Architecture + API docs
```

## QA

```bash
bash repo-super.sh                  # Full pipeline, fail-fast, 33 scripts
bash repo-designer-god.sh           # 60 checks: DOM + rulers + keyboard + snap + zoom
bash repo-layout-invariants.sh      # 12 invariants × 6 scenarios
bash repo-command-matrix.sh         # 84/84 commands verified
node sandbox/god-level-qa.js        # 955 engine tests
```

| Suite | Tests | Result |
|-------|-------|--------|
| God-level engine QA | 955 | ✅ 955/955 |
| Layout invariants | 43 | ✅ 43/43 |
| Designer god test | 60 | ✅ 60/60 |
| Command matrix | 84 | ✅ 84/84 (100%) |
| UI controls | 57 | ✅ 57/57 (100%) |

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Undo / Redo | Ctrl+Z / Ctrl+Y |
| Copy / Paste / Cut | Ctrl+C / Ctrl+V / Ctrl+X |
| Delete | Delete |
| Select all | Ctrl+A |
| Move object | Arrow keys (1px) |
| Move large | Shift+Arrow (8px) |
| Zoom in | Ctrl+B |
| Zoom reset | Ctrl+0 |
| Preview | F5 |

## License

MIT
