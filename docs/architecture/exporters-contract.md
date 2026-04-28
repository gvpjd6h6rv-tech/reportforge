# Exporters Contract

- `exporters.py` is facade-only.
- `exporters_runtime.py` owns `Exporter`.
- `exporters_html.py` owns HTML rendering.
- `exporters_pdf.py` owns PDF and PNG rendering.
- `exporters_tabular.py` owns CSV and XLSX rendering.
- `exporters_documents.py` owns DOCX and RTF rendering.
- `exporters_api.py` owns the one-call `export()` helper.
- No format family may be reintroduced into the facade.
