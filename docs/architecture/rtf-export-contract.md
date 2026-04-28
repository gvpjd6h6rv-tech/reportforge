# RTF Export Contract

- `rtf_export.py` is facade-only.
- `rtf_export_impl.py` owns the RTF generation pipeline and helper functions.
- RTF export stays isolated from the multi-format exporter facade.
