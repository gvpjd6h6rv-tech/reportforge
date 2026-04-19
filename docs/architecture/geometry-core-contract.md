# Geometry Core Contract

`GeometryCore.js` is the only source of truth for primitive rectangle and point math.

## Scope

- Pure primitives only.
- Deterministic and side-effect free.
- No DOM, no window, no DS, no scheduler, no render logic.
- All higher-order geometry lives in dedicated domain modules.

## API

- `makePoint(x, y)`
- `makeRect(x, y, w, h)`
- `normalizeRect(rect)`
- `rectUnion(a, b)`
- `rectIntersect(a, b)`
- `rectOverlaps(a, b)`
- `rectContainsPoint(rect, point)`
- `rectContainsRect(outer, inner)`
- `translateRect(rect, dx, dy)`
- `inflateRect(rect, amount)`
- `deflateRect(rect, amount)`
- `clampRect(rect, bounds)`
- `snapValue(value, grid)`
- `snapRect(rect, grid)`
- `bboxFromRects(rects)`
- `resizeRectFromHandle(rect, handle, dx, dy, constraints)`
- `rectCenter(rect)`
- `rectEqualsWithinTolerance(a, b, tolerance)`
- `pointDistance(a, b)`

## Domain split

| Concern | Owner |
| --- | --- |
| Pure rectangle / point math | `GeometryCore.js` |
| Canvas / page transforms | `CanvasGeometry.js` |
| Selection bounds / handles / rubber-band | `SelectionGeometry.js` |
| Hit tests / tolerances | `HitTestGeometry.js` |

## Current split audit

| Existing function / helper | Destination |
| --- | --- |
| `makePoint`, `makeRect`, `normalizeRect`, `rectUnion`, `rectIntersect`, `rectOverlaps`, `rectContainsPoint`, `rectContainsRect`, `translateRect`, `inflateRect`, `deflateRect`, `clampRect`, `snapValue`, `snapRect`, `bboxFromRects`, `resizeRectFromHandle`, `rectCenter`, `rectEqualsWithinTolerance`, `pointDistance` | `GeometryCore.js` |
| `sectionAbsoluteRect`, `elementCanvasRect`, `elementViewRect`, `rectToView`, `canvasBoundsFromSections`, `selectionViewRects` | `CanvasGeometry.js` |
| `selectionBoundsFromRects`, `selectionBoundsFromElements`, `selectionHandles`, `rubberBandRect`, `rectOverlapsBand` | `SelectionGeometry.js` |
| `pointInRect`, `handlePoint`, `handleAt`, `edgeAt`, `rectOverlapsRect`, `rectContainsBand` | `HitTestGeometry.js` |

## Removal notes

- Old DOM-aware selection-rect helpers are retired.
- Preview and selection overlays now consume domain geometry instead of deriving rects inline.
- If a future change needs DOM or state access, it belongs outside this module family.
