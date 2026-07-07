#!/usr/bin/env bash
# rf-bbox-ink — install the read-only preview bbox diagnostic into the runtime.
# Idempotent. Undo with ./disable.sh. Does NOT modify any ReportForge engine.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
SRC="$HERE/RfBboxInkDiagnostic.js"
DST="$ROOT/engines/RfBboxInkDiagnostic.js"
HTML="$ROOT/designer/crystal-reports-designer-v4.html"
TAG='<script src="/engines/RfBboxInkDiagnostic.js"></script>'
ANCHOR='<script src="/engines/PreviewOverlayStyle.js"></script>'

cp "$SRC" "$DST"

if grep -qF "$TAG" "$HTML"; then
  echo "script tag already present"
elif grep -qF "$ANCHOR" "$HTML"; then
  awk -v tag="$TAG" -v anchor="$ANCHOR" '{ print; if (index($0, anchor)) print tag }' \
    "$HTML" > "$HTML.tmp" && mv "$HTML.tmp" "$HTML"
  echo "script tag inserted after PreviewOverlayStyle.js"
else
  echo "WARNING: anchor not found; add this line to $HTML manually:"
  echo "  $TAG"
fi

echo "ENABLED. Restart the server if needed, then open:"
echo "  ?rf_bbox_ink=1&rf_bbox_zoom=40   (hard-reload: Ctrl+Shift+R)"
