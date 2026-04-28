# Alignment and Guide Contracts

## Alignment

- `AlignmentEngine.js` is facade-only.
- `AlignmentGeometry.js` owns pure alignment math and spacing detection.
- `AlignmentActions.js` owns align and distribute mutations.
- Alignment computations stay in model space.
- Alignment helpers do not write DOM or own selection state.

## Guide

- `GuideEngine.js` is facade-only.
- `GuideState.js` owns the active guide list.
- `GuideRenderer.js` owns the `#guide-layer` DOM overlay and guide line painting.
- Guide state and guide rendering are separate owners.
- Guide rendering converts model positions to view positions only at the render boundary.

## Canonical invariants

- One owner for alignment math.
- One owner for alignment mutations.
- One owner for guide state.
- One owner for guide DOM rendering.
- No module in this split may write DOM except `GuideRenderer.js`.
- No module in this split may mutate selection or document state except `AlignmentActions.js` where alignment/distribution explicitly apply element mutations.
- Legacy compatibility lives in `AlignmentGuides.js` and `AlignmentGuideOverlay.js`; the legacy bridge must stay thin and must not become the new owner of guide rendering.
