# EngineCoreRouting Contract

`EngineCoreRouting.js` is facade-only.

- `EngineCoreRoutingPointer.js` owns pointer normalization and pointer dispatch.
- `EngineCoreRoutingZoom.js` owns zoom pre/post hooks.
- `EngineCoreRoutingRegistry.js` owns engine registration and zoom patch wiring.
- `EngineCoreRoutingWorkspace.js` owns workspace wiring and workspace event wiring.
- `EngineCoreRouting.js` only composes and reexports the public routing API.
