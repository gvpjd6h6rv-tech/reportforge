# Getting Started

## Requirements

- Python 3.10+
- `pip install fastapi uvicorn weasyprint openpyxl`

## Installation

```bash
git clone https://github.com/your-org/reportforge
cd reportforge
pip install -r requirements.txt
```

## Start the server

```bash
python -m reportforge.server.main
# → http://localhost:8000
```

Open the designer at **http://localhost:8000/designer/**

## Project layout

```
reportforge/
├── designer/          # Frontend (HTML + ES modules)
│   ├── index.html
│   ├── css/           # 7 CSS files (light CR theme)
│   ├── js/            # 52 ES module files
│   └── server.py      # FastAPI router
├── core/
│   └── render/        # Python render engine
│       └── engines/
│           └── enterprise_engine.py
├── server/
│   ├── api.py         # FastAPI app factory
│   └── main.py        # Uvicorn entry point
└── tests/             # 405 tests
```

## Quick report via API

```bash
curl -X POST http://localhost:8000/render \
  -H 'Content-Type: application/json' \
  -d '{
    "layout": {"name":"Test","pageSize":"A4","sections":[...]},
    "data": {"items":[...]},
    "format": "html"
  }'
```
