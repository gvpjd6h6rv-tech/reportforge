# Getting Started — ReportForge v18.0

## Installation

**Requirements:** Python 3.10+, modern browser (Chrome/Firefox/Edge)

```bash
git clone <repo>
cd reportforge-complete
pip install -r requirements.txt
python3 reportforge_server.py
```

Open **http://localhost:8080** in your browser.

## Docker

```bash
docker compose up -d
open http://localhost:8080
```

## Creating a Report

1. Click **New** (Ctrl+N) to start a blank report
2. Drag fields from the **Field Explorer** onto the canvas
3. Use the toolbar to format text, set fonts, add borders
4. Click **Preview** to see the rendered output
5. Click **Save** (Ctrl+S) to save as `.rfd.json`
6. Use the Render API to generate PDF/HTML output

## Render API

```bash
# Start the render server
uvicorn reportforge.server.main:app --port 8000

# Render to PDF
curl -X POST http://localhost:8000/render \
  -H "Content-Type: application/json" \
  -d '{"layout": "path/to/report.rfd.json", "data": {...}}' \
  --output report.pdf

# Validate a formula
curl -X POST http://localhost:8000/validate-formula \
  -d '{"formula": "=IIf({sales} > 1000, \"High\", \"Low\")"}'
```

## Next Steps

- [Designer Interface →](./designer.md)
- [Keyboard Shortcuts →](./shortcuts.md)
- [Formula Reference →](./formulas.md)
- [Section System →](./sections.md)
- [Architecture →](../architecture/overview.md)
