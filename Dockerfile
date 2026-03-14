# ──────────────────────────────────────────────────────────────────
# ReportForge Enterprise — Production Dockerfile
# Multi-stage build: slim Python + WeasyPrint + Cairo system deps
# ──────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS base

LABEL maintainer="ReportForge Team"
LABEL description="ReportForge Enterprise Reporting Engine"
LABEL version="2.0.0"

# ── System dependencies (WeasyPrint needs Cairo + Pango + fonts) ──
RUN apt-get update && apt-get install -y --no-install-recommends \
    # WeasyPrint / Cairo PDF
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    shared-mime-info \
    # Fonts
    fonts-liberation \
    fonts-dejavu-core \
    fonts-noto-core \
    # Build tools (for lxml, cffi)
    gcc \
    libxml2-dev \
    libxslt1-dev \
    zlib1g-dev \
    # Cleanup
    && rm -rf /var/lib/apt/lists/*

# ── Python layer ──────────────────────────────────────────────────
WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ── Application code ──────────────────────────────────────────────
COPY reportforge/ ./reportforge/

# ── Runtime config ────────────────────────────────────────────────
ENV PYTHONPATH=/app \
    RF_HOST=0.0.0.0 \
    RF_PORT=8000 \
    RF_WORKERS=2 \
    RF_RELOAD=false \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Writable dirs for cache and tenant themes
RUN mkdir -p /app/reportforge/server/themes \
             /app/reportforge/server/templates_registry \
             /app/layouts \
             /app/output && \
    chmod -R 777 /app/reportforge/server/themes \
                 /app/reportforge/server/templates_registry \
                 /app/output

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# ── Entrypoint ────────────────────────────────────────────────────
CMD ["uvicorn", "reportforge.server.main:app", \
     "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "2", \
     "--log-level", "info", \
     "--access-log"]
