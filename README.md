# 🚀 ReportForge Enterprise v2.0

> Crystal Reports for the cloud — visual designer, REST API, Docker, SaaS multi-tenant.

---

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Start the API server
uvicorn reportforge.server.main:app --port 8000 --reload

# 3. Render a report
curl -X POST http://localhost:8000/render \
  -d '{"layout":"reportforge/examples/enterprise_layout.rfd.json","data":{}}' \
  --output report.pdf
```

## Docker

```bash
docker compose up -d
curl http://localhost:8000/health
```

## CLI

```bash
python -m core render layout.json data.json output.pdf
python -m core preview layout.json data.json
python -m core render-jrxml report.jrxml data.json output.pdf
```

## Project Structure

```
reportforge-complete/
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── curl_examples.sh          ← 17 ready-to-run API examples
└── reportforge/
    ├── server/
    │   ├── api.py            ← FastAPI app (14 endpoints)
    │   ├── main.py           ← uvicorn entrypoint
    │   ├── cache.py          ← LRU layout cache (TTL, tenant-isolated)
    │   ├── tenant.py         ← Multi-tenant themes + template registry
    │   ├── api_tests.py      ← 29 unit/integration tests
    │   └── themes/
    │       ├── acme.json     ← Sample tenant theme
    │       └── techcorp.json
    ├── core/render/          ← UNTOUCHED render engine
    │   ├── engines/
    │   │   └── enterprise_engine.py
    │   ├── jrxml_parser.py
    │   └── ...
    ├── docs/
    │   ├── index.html        ← Landing page (dark theme)
    │   └── manual.html       ← Full reference manual
    ├── examples/
    │   ├── enterprise_layout.rfd.json
    │   ├── enterprise_data.json
    │   └── sample_report.jrxml
    └── tests/                ← 376 engine tests (all passing)
```

## REST API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/render` | Render → PDF / HTML / XLSX / CSV / PNG |
| `POST` | `/render-jrxml` | JRXML → PDF / HTML |
| `POST` | `/preview` | Fast HTML preview |
| `POST` | `/designer-preview` | Live designer preview (inline JSON) |
| `POST` | `/render-template` | Render saved template by ID |
| `POST` | `/templates` | Register named template |
| `GET`  | `/templates` | List templates |
| `DELETE` | `/templates/{id}` | Delete template |
| `GET`  | `/tenants/{id}/theme` | Get tenant theme |
| `PUT`  | `/tenants/{id}/theme` | Update tenant theme |
| `POST` | `/validate` | Validate layout + get warnings |
| `GET`  | `/health` | Health check |
| `GET`  | `/cache/stats` | Cache statistics |
| `DELETE` | `/cache` | Clear cache |

Full curl examples: `./curl_examples.sh`
Interactive docs: http://localhost:8000/docs

## Documentation

- **Landing page:** `reportforge/docs/index.html`
- **Full manual:** `reportforge/docs/manual.html`
- **API docs:** http://localhost:8000/docs (Swagger UI)

## Tests

```bash
# All 376 engine tests
cd reportforge && python -m unittest discover tests -q

# API/server tests (29 tests, 17 skipped without fastapi+httpx)
python -m unittest server.api_tests -v
```
