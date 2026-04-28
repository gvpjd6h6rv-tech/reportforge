# Layout Loader Contract

`reportforge/core/render/resolvers/layout_loader.py` is facade-only.

Responsibilities are split by ownership:
- `layout_model.py` owns `Layout`, `Section`, `Element`, and structural constants.
- `layout_defaults.py` owns the default invoice layout fixture and builder.
- `layout_loader.py` owns file loading and public reexports.

Invariants:
- `layout_loader.py` does not embed the full model or the default fixture.
- `layout_model.py` contains no file I/O.
- `layout_defaults.py` contains no file I/O.
- compatibility alias `_default_raw` remains available for existing callers.
