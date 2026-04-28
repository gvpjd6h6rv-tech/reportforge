# Advanced engine contract

- `advanced_engine.py` is facade-only.
- `AdvancedEngineState` owns layout normalization, data binding, sort ordering, page geometry, and CSS generation.
- `AdvancedEngineRender` owns pagination, grouping, suppression, and section/row rendering.
- `advanced_engine_shared.py` owns pure shared primitives and formatting helpers.
- `element_renderers.py` owns common element dispatch.
- `element_embed_renderers.py` owns chart, table, and subreport rendering.
- No advanced engine module writes DOM outside the returned HTML string.
- No advanced engine module mutates global runtime state.
