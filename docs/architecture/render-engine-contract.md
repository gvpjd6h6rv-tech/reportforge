# Render Engine Contract

- `render_engine.py` is facade-only.
- `render_engine_validation.py` owns render-data validation and the public error type.
- `render_engine_runtime.py` owns `RenderEngine` and the HTML/PDF pipeline.
- `render_engine_api.py` owns convenience entrypoints for one-line callers.
- The runtime must not reintroduce layout loading, PDF generation, validation, and public helpers into one file.
