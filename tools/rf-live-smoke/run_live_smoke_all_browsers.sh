#!/usr/bin/env bash
set -euo pipefail

PORT="${RF_LIVE_PORT:-5017}"
BASE_URL="${RF_LIVE_BASE_URL:-http://127.0.0.1:${PORT}}"
LOG_DIR="${RF_LIVE_LOG_DIR:-/tmp/rf-live-smoke}"
mkdir -p "$LOG_DIR"

find_exe() {
  for p in "$@"; do
    [[ -n "${p:-}" && -x "$p" ]] && { printf '%s\n' "$p"; return 0; }
  done
  return 1
}

export RF_FIREFOX_EXECUTABLE="${RF_FIREFOX_EXECUTABLE:-$(find_exe \
  /usr/bin/firefox \
  /usr/bin/firefox-esr \
  /snap/bin/firefox \
  /var/lib/flatpak/exports/bin/org.mozilla.firefox \
  "$HOME/.local/share/flatpak/exports/bin/org.mozilla.firefox" \
  2>/dev/null || true)}"

export RF_CHROME_EXECUTABLE="${RF_CHROME_EXECUTABLE:-$(find_exe \
  /usr/bin/google-chrome \
  /usr/bin/google-chrome-stable \
  /opt/google/chrome/google-chrome \
  2>/dev/null || true)}"

export RF_UNGOOGLED_CHROMIUM_EXECUTABLE="${RF_UNGOOGLED_CHROMIUM_EXECUTABLE:-$(find_exe \
  /var/lib/flatpak/exports/bin/io.github.ungoogled_software.ungoogled_chromium \
  "$HOME/.local/share/flatpak/exports/bin/io.github.ungoogled_software.ungoogled_chromium" \
  /var/lib/flatpak/exports/bin/com.github.Eloston.UngoogledChromium \
  "$HOME/.local/share/flatpak/exports/bin/com.github.Eloston.UngoogledChromium" \
  /usr/bin/ungoogled-chromium \
  /usr/bin/ungoogled-chromium-browser \
  2>/dev/null || true)}"

[[ -n "$RF_FIREFOX_EXECUTABLE" ]] || { echo "ERROR: Firefox real no encontrado."; exit 2; }
[[ -n "$RF_CHROME_EXECUTABLE" ]] || { echo "ERROR: Google Chrome oficial no encontrado."; exit 2; }
[[ -n "$RF_UNGOOGLED_CHROMIUM_EXECUTABLE" ]] || { echo "ERROR: Ungoogled Chromium no encontrado."; exit 2; }

cleanup() {
  if [[ -n "${RF_LIVE_SERVER_PID:-}" ]]; then
    kill "$RF_LIVE_SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ "${RF_LIVE_EXTERNAL_SERVER:-0}" != "1" ]]; then
  echo "Starting real ReportForge server on ${BASE_URL}"
  python3 reportforge_server.py "$PORT" >"$LOG_DIR/server.log" 2>&1 &
  RF_LIVE_SERVER_PID=$!
fi

python3 - <<PY
import time, urllib.request, sys
url = "${BASE_URL}/health"
for _ in range(60):
    try:
        with urllib.request.urlopen(url, timeout=2) as r:
            if r.status == 200:
                print("SERVER_READY", url)
                sys.exit(0)
    except Exception:
        time.sleep(0.5)
print("SERVER_NOT_READY", url)
sys.exit(1)
PY

echo "BROWSERS:"
echo "  Firefox real    : $RF_FIREFOX_EXECUTABLE"
echo "  Chrome official : $RF_CHROME_EXECUTABLE"
echo "  Ungoogled       : $RF_UNGOOGLED_CHROMIUM_EXECUTABLE"
echo "  Chromium standalone: DISABLED / FORBIDDEN"

RF_LIVE_BASE_URL="$BASE_URL" \
npx playwright test reportforge/tests/e2e/live_smoke_reportforge_real.spec.mjs \
  -c pw.live.config.mjs \
  --reporter=line
