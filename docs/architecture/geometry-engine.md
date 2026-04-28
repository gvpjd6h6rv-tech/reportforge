# RF.Geometry — Unified Geometry Engine

**Introduced:** v18.10 | **Stabilized:** v19.0

## Rule

```
DS.zoom is READ ONLY by RF.Geometry.zoom()
DS.zoom is WRITTEN ONLY by DesignZoomEngine._apply()
```

## API

| Method | Signature | Description |
|--------|-----------|-------------|
| `zoom()` | `() → number` | Current zoom factor |
| `scale(v)` | `(number) → number` | Model → view scalar |
| `unscale(v)` | `(number) → number` | View → model scalar |
| `modelToView(x, y)` | `→ {x,y}` | Point model → DOM px |
| `viewToModel(cx, cy)` | `→ {x,y}` | Client coords → model |
| `rectToView(r)` | `→ {x,y,w,h}` | Rect model → view |
| `canvasRect()` | `→ DOMRect` | `#canvas-layer` BCR (cached) |
| `sectionBand(div)` | `→ {y,h}` | Section band in view px |
| `invalidate()` | `→ void` | Clear BCR frame cache |

## Migration History

| Version | What |
|---------|------|
| v18.10 | Added `scale/unscale/modelToView/viewToModel/rectToView`; 13 call sites |
| v18.11 | Eliminated remaining 9 direct `DS.zoom` reads in render paths |
| v18.12 | Section width, font-size, CSS overrides fixed |
| v18.14 | Preview renderer: all 4 render functions migrated |
| v18.15 | Preview max-inline-size constraint removed |
| v18.16 | Preview refresh on zoom change via `_apply` hook |
| v19.0  | Engine modules — `RulerEngine`, `GridEngine`, `SnapCore/SnapState`, `WorkspaceScrollEngine` |

## Remaining Legitimate `DS.zoom` Access (17 occurrences)

These are engine internals, not render-path violations:

- `DesignZoomEngine._apply()` — reads `oldZ`, writes `DS.zoom = z`
- `DesignZoomEngine.get/zoomIn/zoomOut` — step navigation
- `ZoomWidget.sync()` — display
- `PreviewEngine.show/hide()` — saves `DS.zoomDesign/zoomPreview`
- Wheel zoom handler, boot init, architecture comments
