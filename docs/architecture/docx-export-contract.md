# DOCX Export Contract

- `docx_export.py` is facade-only.
- `docx_export_impl.py` owns the DOCX mapping and write pipeline.
- DOCX export stays isolated from the multi-format exporter facade.
