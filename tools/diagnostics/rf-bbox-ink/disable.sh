#!/usr/bin/env bash
# rf-bbox-ink — remove the diagnostic from the runtime (restore clean runtime).
# Idempotent. Does NOT modify any ReportForge engine.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
DST="$ROOT/engines/RfBboxInkDiagnostic.js"
HTML="$ROOT/designer/crystal-reports-designer-v4.html"
TAG='<script src="/engines/RfBboxInkDiagnostic.js"></script>'

if grep -qF "$TAG" "$HTML"; then
  grep -vF "$TAG" "$HTML" > "$HTML.tmp" && mv "$HTML.tmp" "$HTML"
  echo "script tag removed"
else
  echo "script tag not present"
fi

rm -f "$DST" && echo "runtime copy removed: $DST"
echo "DISABLED. Runtime is clean."
