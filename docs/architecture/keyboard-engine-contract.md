# Keyboard Engine Contract

- `KeyboardEngine.js` is facade-only.
- `KeyboardCombo.js` owns key encoding and combo normalization.
- `KeyboardRegistry.js` owns shortcut registration, lookup, removal, and direct trigger dispatch.
- `KeyboardBindings.js` owns the default shortcut map and keydown wiring.
- The facade must not reintroduce shortcut tables or key normalization logic.
- Keyboard handling stays centralized in one registry with one listener path.
