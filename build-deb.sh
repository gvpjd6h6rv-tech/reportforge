#!/bin/bash
# build-deb.sh — Reconstruye el .deb desde el source
# Ejecutar desde la raíz del zip
set -e

echo "[ReportForge] Construyendo .deb..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEB_SOURCE="$SCRIPT_DIR/deb-source"
OUTPUT="$SCRIPT_DIR/dist"

mkdir -p "$OUTPUT"

# Verificar que dpkg-deb está disponible
if ! command -v dpkg-deb &>/dev/null; then
    echo "ERROR: dpkg-deb no encontrado. Instala con: sudo apt install dpkg-dev"
    exit 1
fi

# Copiar el designer HTML al www del .deb
cp "$SCRIPT_DIR/designer/crystal-reports-designer.html" \
   "$DEB_SOURCE/opt/reportforge/www/index.html"

# Permisos correctos
chmod 755 "$DEB_SOURCE/DEBIAN/postinst"
chmod 755 "$DEB_SOURCE/DEBIAN/postrm"
chmod 755 "$DEB_SOURCE/usr/local/bin/reportforge"

# Construir el .deb
dpkg-deb --build --root-owner-group "$DEB_SOURCE" "$OUTPUT/reportforge_1.0.0_all.deb"

echo "[ReportForge] ✓ Construido: $OUTPUT/reportforge_1.0.0_all.deb"
echo "[ReportForge] Instalar con: sudo dpkg -i $OUTPUT/reportforge_1.0.0_all.deb"
