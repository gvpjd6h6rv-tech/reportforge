# Align Engine Contract

## Facade

- `AlignEngine.js` is facade-only.
- `AlignEngineActions.js` owns align button actions and fallback layout mutation.

## Invariants

- Align button orchestration is separate from mutation logic.
- Fallback alignment writes only through `DS.updateElementLayout`.
- The facade remains thin and compatibility-safe for existing callers.
