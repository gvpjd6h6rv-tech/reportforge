#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# ReportForge API — curl Examples
# Base URL: http://localhost:8000  (change RF_URL to match your server)
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

RF_URL="${RF_URL:-http://localhost:8000}"
LAYOUT="examples/enterprise_layout.rfd.json"
DATA_FILE="examples/enterprise_data.json"

echo "🚀  ReportForge API curl examples → $RF_URL"
echo "─────────────────────────────────────────────"

# ── 1. Health check ───────────────────────────────────────────────
echo -e "\n📡  1. Health check"
curl -s "$RF_URL/health" | python3 -m json.tool

# ── 2. Render to PDF ──────────────────────────────────────────────
echo -e "\n📄  2. Render layout → PDF"
curl -s -X POST "$RF_URL/render" \
  -H "Content-Type: application/json" \
  -d "{\"layout\":\"$LAYOUT\",\"data\":{},\"format\":\"pdf\"}" \
  --output /tmp/rf_report.pdf
echo "   Saved: /tmp/rf_report.pdf  ($(du -sh /tmp/rf_report.pdf | cut -f1))"

# ── 3. Render to HTML ─────────────────────────────────────────────
echo -e "\n🌐  3. Render layout → HTML"
curl -s -X POST "$RF_URL/render" \
  -H "Content-Type: application/json" \
  -d "{\"layout\":\"$LAYOUT\",\"data\":{},\"format\":\"html\"}" \
  --output /tmp/rf_report.html
echo "   Saved: /tmp/rf_report.html  ($(du -sh /tmp/rf_report.html | cut -f1))"

# ── 4. Fast HTML preview ──────────────────────────────────────────
echo -e "\n⚡  4. Fast preview (no PDF, with shadow CSS)"
curl -s -X POST "$RF_URL/preview" \
  -H "Content-Type: application/json" \
  -d "{\"layout\":\"$LAYOUT\",\"data\":{}}" \
  --output /tmp/rf_preview.html
echo "   Saved: /tmp/rf_preview.html  ($(du -sh /tmp/rf_preview.html | cut -f1))"

# ── 5. Designer live preview (inline JSON) ────────────────────────
echo -e "\n🎨  5. Designer preview (inline JSON layout)"
curl -s -X POST "$RF_URL/designer-preview" \
  -H "Content-Type: application/json" \
  -d '{
    "layout": {
      "name": "Designer Test",
      "pageWidth": 754,
      "pageSize": "A4",
      "sections": [{"id":"s-rh","stype":"rh","height":50}],
      "elements": [
        {"id":"t1","type":"text","sectionId":"s-rh",
         "x":4,"y":10,"w":400,"h":20,
         "content":"🚀 Live Designer Preview","fontSize":14,"bold":true}
      ]
    },
    "data": {}
  }' \
  --output /tmp/rf_designer.html
echo "   Saved: /tmp/rf_designer.html"

# ── 6. Render with tenant theme ───────────────────────────────────
echo -e "\n🏢  6. Render with tenant theme (acme)"
curl -s -X POST "$RF_URL/render" \
  -H "Content-Type: application/json" \
  -d "{\"layout\":\"$LAYOUT\",\"data\":{},\"tenant\":\"acme\",\"format\":\"html\"}" \
  --output /tmp/rf_acme.html
echo "   Saved: /tmp/rf_acme.html  (tenant: acme)"

# ── 7. Render with parameters ─────────────────────────────────────
echo -e "\n🔑  7. Render with report parameters"
curl -s -X POST "$RF_URL/render" \
  -H "Content-Type: application/json" \
  -d "{
    \"layout\": \"$LAYOUT\",
    \"data\":   {},
    \"params\": {\"startDate\":\"2026-01-01\",\"endDate\":\"2026-03-31\",\"company\":\"Acme Corp\"},
    \"format\": \"html\"
  }" \
  --output /tmp/rf_params.html
echo "   Saved: /tmp/rf_params.html"

# ── 8. Export to Excel ────────────────────────────────────────────
echo -e "\n📊  8. Export to XLSX"
curl -s -X POST "$RF_URL/render" \
  -H "Content-Type: application/json" \
  -d "{\"layout\":\"$LAYOUT\",\"data\":{},\"format\":\"xlsx\"}" \
  --output /tmp/rf_report.xlsx
echo "   Saved: /tmp/rf_report.xlsx  ($(du -sh /tmp/rf_report.xlsx | cut -f1))"

# ── 9. Export to CSV ──────────────────────────────────────────────
echo -e "\n📋  9. Export to CSV"
curl -s -X POST "$RF_URL/render" \
  -H "Content-Type: application/json" \
  -d "{\"layout\":\"$LAYOUT\",\"data\":{},\"format\":\"csv\"}" \
  --output /tmp/rf_report.csv
echo "   Saved: /tmp/rf_report.csv"

# ── 10. Register a template ───────────────────────────────────────
echo -e "\n💾  10. Register named template"
curl -s -X POST "$RF_URL/templates" \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": "demo_invoice",
    "tenant":     "acme",
    "layout": {
      "name": "Demo Invoice",
      "pageWidth": 754,
      "pageSize":  "A4",
      "sections":  [{"id":"s-rh","stype":"rh","height":40}],
      "elements":  [
        {"id":"t1","type":"text","sectionId":"s-rh",
         "x":4,"y":10,"w":400,"h":20,"content":"Invoice #001","fontSize":14,"bold":true}
      ]
    }
  }' | python3 -m json.tool

# ── 11. List templates ────────────────────────────────────────────
echo -e "\n📑  11. List templates for tenant"
curl -s "$RF_URL/templates?tenant=acme" | python3 -m json.tool

# ── 12. Render registered template ───────────────────────────────
echo -e "\n🖨️   12. Render registered template"
curl -s -X POST "$RF_URL/render-template" \
  -H "Content-Type: application/json" \
  -d '{"templateId":"demo_invoice","tenant":"acme","data":{},"format":"html"}' \
  --output /tmp/rf_invoice.html
echo "   Saved: /tmp/rf_invoice.html"

# ── 13. Validate a layout ─────────────────────────────────────────
echo -e "\n✅  13. Validate layout"
curl -s -X POST "$RF_URL/validate" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test",
    "pageWidth": 754,
    "sections": [{"id":"s-rh","stype":"rh","height":40}],
    "elements": [
      {"id":"t1","type":"text","sectionId":"WRONG_ID",
       "x":4,"y":4,"w":200,"h":14,"content":"Test"}
    ]
  }' | python3 -m json.tool

# ── 14. Update tenant theme ───────────────────────────────────────
echo -e "\n🎨  14. Update tenant theme via API"
curl -s -X PUT "$RF_URL/tenants/demo/theme" \
  -H "Content-Type: application/json" \
  -d '{
    "theme": {
      "primaryColor":  "#7C3AED",
      "accentColor":   "#10B981",
      "bgColor":       "#FFFFFF",
      "fontFamily":    "Arial",
      "fontSize":      9,
      "headerBg":      "#7C3AED",
      "headerColor":   "#FFFFFF",
      "altRowBg":      "#F5F3FF",
      "borderColor":   "#DDD6FE"
    },
    "params": {"company": "Demo Corp"},
    "styles": {}
  }' | python3 -m json.tool

# ── 15. Render JRXML ──────────────────────────────────────────────
echo -e "\n🔄  15. Render JRXML file"
curl -s -X POST "$RF_URL/render-jrxml" \
  -H "Content-Type: application/json" \
  -d '{
    "jrxml":  "examples/sample_report.jrxml",
    "data":   {},
    "format": "html"
  }' \
  --output /tmp/rf_jrxml.html
echo "   Saved: /tmp/rf_jrxml.html"

# ── 16. Cache stats ───────────────────────────────────────────────
echo -e "\n⚡  16. Cache statistics"
curl -s "$RF_URL/cache/stats" | python3 -m json.tool

# ── 17. Clear tenant cache ────────────────────────────────────────
echo -e "\n🗑️   17. Clear tenant cache"
curl -s -X DELETE "$RF_URL/cache?tenant=acme" | python3 -m json.tool

echo -e "\n✅  All done! Check /tmp/rf_*.{pdf,html,xlsx,csv} for outputs."
