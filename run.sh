#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  run.sh — ReportForge v5.0 Smart Launcher + Live Dashboard
#  ──────────────────────────────────────────────────────────
#  ./run.sh [port]       Iniciar con dashboard (default: 8080)
#  ./run.sh --reset      Eliminar .venv y recrear
#  ./run.sh --check-only Solo verificar entorno
#
#  Controles:  R=Reiniciar  K=Kill+Reiniciar  Q=Salir (único que cierra)
# ═══════════════════════════════════════════════════════════════════════════

# ── Rutas ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"
VENV_PYTHON="$VENV_DIR/bin/python"
VENV_PIP="$VENV_DIR/bin/pip"
REQUIREMENTS="$SCRIPT_DIR/requirements.txt"
SERVER="$SCRIPT_DIR/reportforge_server.py"
PID_FILE="/tmp/rf_server.pid"
LOG_FILE="/tmp/rf_server.log"
BROWSER_PREF_FILE="$SCRIPT_DIR/.rf_browser_pref"

# ── Parámetros ───────────────────────────────────────────────────────────────
PORT="${1:-8080}"
RESET=false; CHECK_ONLY=false
for arg in "$@"; do
  case $arg in
    --reset)      RESET=true ;;
    --check-only) CHECK_ONLY=true ;;
    --help|-h)
      echo ""; echo "  ReportForge v5.0 — Smart Launcher"
      echo "  ./run.sh [port]       Iniciar (default: 8080)"
      echo "  ./run.sh --reset      Recrear .venv"
      echo "  ./run.sh --check-only Solo verificar entorno"
      echo ""; exit 0 ;;
  esac
done

# ── Colores ───────────────────────────────────────────────────────────────────
R='\033[0;31m'  ; G='\033[0;32m';  Y='\033[1;33m';  B='\033[0;34m'
M='\033[0;35m'  ; C='\033[0;36m';  W='\033[1;37m';  DIM='\033[2m'
BLD='\033[1m'   ; N='\033[0m'
BG_BLK='\033[40m'; BG_GRN='\033[42m'; BG_RED='\033[41m'; BG_BLU='\033[44m'

_ts()   { date '+%H:%M:%S'; }
_date() { date '+%Y-%m-%d'; }

# ── Funciones de log ──────────────────────────────────────────────────────────
_log() { echo -e "$1" | tee -a "$LOG_FILE"; }
log_ok()   { _log "$(_ts) ${G}✅${N} $1"; }
log_err()  { _log "$(_ts) ${R}❌${N} $1"; }
log_warn() { _log "$(_ts) ${Y}⚠️ ${N}  $1"; }
log_info() { _log "$(_ts) ${C}ℹ️ ${N}  $1"; }
log_run()  { _log "$(_ts) ${B}🚀${N} $1"; }
log_die()  { _log "$(_ts) ${R}💀${N} $1"; }
log_beat() { _log "$(_ts) ${G}💚${N} $1"; }
log_kill() { _log "$(_ts) ${M}🔫${N} $1"; }
log_net()  { _log "$(_ts) ${B}🌐${N} $1"; }
log_mem()  { _log "$(_ts) ${M}🧠${N} $1"; }
log_cfg()  { _log "$(_ts) ${C}⚙️ ${N}  $1"; }
log_auto() { _log "$(_ts) ${Y}🔁${N} $1"; }
log_sep()  { _log "${DIM}────────────────────────────────────────────────${N}"; }

# ── Setup del entorno virtual ─────────────────────────────────────────────────
setup_env() {
  log_sep
  log_cfg "${BLD}🏗️  SETUP — Verificando entorno${N}"
  log_sep

  # Detectar Python >= 3.10
  PYTHON=""
  for py in python3 python3.12 python3.11 python3.10; do
    if command -v "$py" &>/dev/null; then
      VER=$("$py" -c "import sys;print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null||echo "0.0")
      MAJ=$(echo "$VER"|cut -d. -f1); MIN=$(echo "$VER"|cut -d. -f2)
      if [ "$MAJ" -ge 3 ] && [ "$MIN" -ge 10 ]; then PYTHON="$py"; break; fi
    fi
  done
  if [ -z "$PYTHON" ]; then
    log_err "Python ≥ 3.10 no encontrado — instala Python y vuelve a ejecutar"
    exit 1
  fi
  log_ok "Python $("$PYTHON" --version 2>&1) encontrado → $PYTHON"

  "$PYTHON" -c "import venv" &>/dev/null || { log_err "Módulo venv no disponible"; exit 1; }

  # Reset
  $RESET && [ -d "$VENV_DIR" ] && { log_warn "♻️  Eliminando .venv existente..."; rm -rf "$VENV_DIR"; }

  # Crear .venv
  if [ ! -d "$VENV_DIR" ]; then
    log_info "🐣 Creando .venv en $VENV_DIR ..."
    "$PYTHON" -m venv "$VENV_DIR" --prompt "rf-v5"
    log_ok "✨ .venv creado correctamente"
  else
    log_ok ".venv ya existe → $VENV_DIR"
  fi

  # Integridad
  if [ ! -x "$VENV_PYTHON" ]; then
    log_err ".venv corrupto — ejecuta: ./run.sh --reset"
    exit 1
  fi
  REAL=$("$VENV_PYTHON" -c "import sys;print(sys.executable)" 2>/dev/null||echo "")
  if [ ! -f "$REAL" ]; then
    log_err "Intérprete roto: $REAL — ejecuta: ./run.sh --reset"
    exit 1
  fi
  "$VENV_PYTHON" -c "import site" &>/dev/null || { log_err "site-packages inaccesible"; exit 1; }
  log_ok "🔬 Integridad .venv — OK ($("$VENV_PYTHON" --version 2>&1))"

  # Dependencias
  if [ -f "$REQUIREMENTS" ]; then
    REQ_HASH=$(sha256sum "$REQUIREMENTS" 2>/dev/null|awk '{print $1}'||md5sum "$REQUIREMENTS" 2>/dev/null|awk '{print $1}')
    STORED=$(cat "$VENV_DIR/.req_hash" 2>/dev/null||echo "")
    if [ "$REQ_HASH" != "$STORED" ]; then
      log_info "📦 Instalando dependencias..."
      "$VENV_PIP" install -q --upgrade pip 2>/dev/null || log_warn "pip upgrade sin red — continuando"
      grep -v '^\s*#' "$REQUIREMENTS"|grep -v '^\s*$'|grep -v 'pytest\|httpx\|orjson' \
        |"$VENV_PIP" install -q -r /dev/stdin 2>/dev/null \
        ||log_warn "Algunas dependencias opcionales no instaladas (sin red — no crítico)"
      echo "$REQ_HASH" > "$VENV_DIR/.req_hash"
      log_ok "📦 Dependencias instaladas/actualizadas"
    else
      log_ok "📦 Dependencias al día (sin cambios)"
    fi
  else
    log_warn "requirements.txt no encontrado — saltando instalación"
  fi

  # Verificar importable
  if ! PYTHONPATH="$SCRIPT_DIR" "$VENV_PYTHON" -c "import reportforge" &>/dev/null 2>&1; then
    log_warn "Instalando reportforge editable..."
    { [ -f "$SCRIPT_DIR/pyproject.toml" ] || [ -f "$SCRIPT_DIR/setup.py" ]; } \
      && "$VENV_PIP" install -q -e "$SCRIPT_DIR" 2>/dev/null || true
  fi
  log_ok "🐍 Paquete reportforge importable"
  log_sep
}

# ── Servidor ──────────────────────────────────────────────────────────────────
server_running() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

server_stop() {
  if server_running; then
    local pid; pid=$(cat "$PID_FILE")
    log_kill "Enviando SIGTERM a PID $pid..."
    kill "$pid" 2>/dev/null || true
    local i=0
    while kill -0 "$pid" 2>/dev/null && [ $i -lt 10 ]; do sleep 0.3; i=$((i+1)); done
    kill -9 "$pid" 2>/dev/null || true
    rm -f "$PID_FILE"
    log_ok "🛑 Servidor detenido"
  fi
}

server_kill_all() {
  log_kill "💥 Matando TODAS las instancias de reportforge_server..."
  pkill -f "reportforge_server.py" 2>/dev/null || true
  sleep 0.5
  pkill -9 -f "reportforge_server.py" 2>/dev/null || true
  command -v fuser &>/dev/null && fuser -k "${PORT}/tcp" 2>/dev/null || true
  rm -f "$PID_FILE"
  sleep 0.5
  log_ok "💀 Todas las instancias eliminadas"
}

server_start() {
  log_run "🚀 Arrancando servidor en puerto $PORT ..."
  PYTHONPATH="$SCRIPT_DIR" "$VENV_PYTHON" "$SERVER" "$PORT" >> "$LOG_FILE" 2>&1 &
  local pid=$!
  echo "$pid" > "$PID_FILE"

  local i=0
  while [ $i -lt 20 ]; do
    sleep 0.5
    if curl -sf "http://localhost:$PORT/health" &>/dev/null; then
      log_ok "🟢 Servidor activo — PID $pid — puerto $PORT"
      log_net "🌐 Diseñador: http://localhost:$PORT/"
      log_net "🏥 Health:    http://localhost:$PORT/health"
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      log_die "💀 Proceso murió al arrancar — revisa el log"
      return 1
    fi
    i=$((i+1))
  done
  log_err "⏱️  Timeout esperando respuesta del servidor"
  return 1
}

# ── Menú ──────────────────────────────────────────────────────────────────────
draw_menu() {
  echo ""
  echo -e "${BLD}${BG_BLK}  ${BG_GRN}${W} R ${N}${BG_BLK}${W} Reiniciar   ${BG_RED}${W} K ${N}${BG_BLK}${W} Kill+Reiniciar   ${B}${W} B ${N}${BG_BLK}${W} Navegador   ${Y}[Q]${N}${BG_BLK}${W} Salir  ${N}"
  echo ""
}
# ── Detección y apertura de navegador ────────────────────────────────────────

# Detecta todos los navegadores disponibles en el sistema
detect_browsers() {
  local found=()
  command -v firefox              &>/dev/null && found+=("firefox:🦊 Firefox")
  command -v firefox-esr          &>/dev/null && found+=("firefox-esr:🦊 Firefox ESR")
  command -v chromium             &>/dev/null && found+=("chromium:🔵 Chromium")
  command -v chromium-browser     &>/dev/null && found+=("chromium-browser:🔵 Chromium")
  command -v google-chrome        &>/dev/null && found+=("google-chrome:🌐 Chrome")
  command -v google-chrome-stable &>/dev/null && found+=("google-chrome-stable:🌐 Chrome Stable")
  command -v ungoogled-chromium   &>/dev/null && found+=("ungoogled-chromium:🛡️  Ungoogled Chromium")
  command -v brave-browser        &>/dev/null && found+=("brave-browser:🦁 Brave")
  command -v opera                &>/dev/null && found+=("opera:🎭 Opera")
  command -v xdg-open             &>/dev/null && found+=("xdg-open:📂 Default del sistema")
  printf '%s
' "${found[@]}"
}

# Lee la preferencia guardada
load_browser_pref() {
  [ -f "$BROWSER_PREF_FILE" ] && cat "$BROWSER_PREF_FILE" || echo ""
}

# Guarda la preferencia
save_browser_pref() {
  echo "$1" > "$BROWSER_PREF_FILE"
}

# Verifica si la URL ya está abierta en algún navegador
tab_already_open() {
  local url="http://localhost:${PORT}"
  # Intentar detectar ventana activa del navegador (funciona en entornos con X11/Wayland)
  if command -v wmctrl &>/dev/null; then
    wmctrl -l 2>/dev/null | grep -qi "localhost:${PORT}" && return 0
    wmctrl -l 2>/dev/null | grep -qi "ReportForge"       && return 0
  fi
  if command -v xdotool &>/dev/null; then
    xdotool search --name "localhost:${PORT}" &>/dev/null && return 0
    xdotool search --name "ReportForge"       &>/dev/null && return 0
  fi
  # Si no hay herramientas de ventana, asumir que no está abierta
  return 1
}

# Menú de selección de navegador (interactivo, restaura terminal)
choose_browser() {
  tput cnorm 2>/dev/null || true   # mostrar cursor
  stty echo 2>/dev/null || true    # restaurar echo

  local IFS=$'
'
  local browsers=( $(detect_browsers) )

  if [ ${#browsers[@]} -eq 0 ]; then
    log_warn "⚠️  No se encontró ningún navegador instalado"
    log_info "Abre manualmente: http://localhost:${PORT}/"
    # Re-setup terminal para el dashboard
    stty -echo min 0 time 0 2>/dev/null || true
    tput civis 2>/dev/null || true
    return 1
  fi

  local saved_pref; saved_pref=$(load_browser_pref)
  local default_idx=0

  echo ""
  echo -e "${BLD}${BG_BLU}                                                  ${N}"
  echo -e "${BLD}${BG_BLU}  🌐  Abrir ReportForge en el navegador            ${N}"
  echo -e "${BLD}${BG_BLU}                                                  ${N}"
  echo ""

  for i in "${!browsers[@]}"; do
    local cmd="${browsers[$i]%%:*}"
    local label="${browsers[$i]#*:}"
    local marker=""
    local num_color="${C}"
    if [ "$cmd" = "$saved_pref" ]; then
      marker=" ${Y}← última selección${N}"
      default_idx=$i
      num_color="${G}"
    fi
    echo -e "  ${num_color}[$((i+1))]${N} ${label}${marker}"
  done

  local skip_opt=${#browsers[@]}
  echo ""
  echo -e "  ${DIM}[0] No abrir navegador ahora${N}"
  echo ""

  local pre_label=""
  if [ -n "$saved_pref" ]; then
    # Find label for saved pref
    for b in "${browsers[@]}"; do
      if [ "${b%%:*}" = "$saved_pref" ]; then
        pre_label="${b#*:}"; break
      fi
    done
    echo -e "  ${DIM}[Enter] Usar último: ${pre_label}${N}"
  fi
  echo ""

  local choice=""
  printf "  Selección: "
  read -r choice 2>/dev/null || choice=""

  # Enter con preferencia guardada
  if [ -z "$choice" ] && [ -n "$saved_pref" ]; then
    choice="$saved_pref"
    log_ok "🌐 Usando navegador guardado: ${pre_label}"
  elif [ "$choice" = "0" ]; then
    log_info "🚫 Apertura de navegador omitida"
    stty -echo min 0 time 0 2>/dev/null || true
    tput civis 2>/dev/null || true
    return 0
  else
    # Convertir número a comando
    local idx=$(( choice - 1 ))
    if [ "$idx" -ge 0 ] && [ "$idx" -lt "${#browsers[@]}" ]; then
      choice="${browsers[$idx]%%:*}"
    else
      log_warn "Selección inválida — omitiendo apertura"
      stty -echo min 0 time 0 2>/dev/null || true
      tput civis 2>/dev/null || true
      return 1
    fi
  fi

  save_browser_pref "$choice"
  open_in_browser "$choice"

  # Re-setup terminal para el dashboard
  stty -echo min 0 time 0 2>/dev/null || true
  tput civis 2>/dev/null || true
}

# Abre la URL en el navegador elegido
open_in_browser() {
  local browser="$1"
  local url="http://localhost:${PORT}/"

  echo ""
  log_net "🌐 Abriendo $url en ${browser}..."

  case "$browser" in
    firefox*|firefox-esr*)
      "$browser" --new-tab "$url" &>/dev/null &
      ;;
    chromium*|google-chrome*|ungoogled-chromium*)
      "$browser" --new-tab "$url" &>/dev/null 2>&1 &
      ;;
    brave-browser*)
      "$browser" --new-tab "$url" &>/dev/null &
      ;;
    xdg-open*)
      xdg-open "$url" &>/dev/null &
      ;;
    *)
      "$browser" "$url" &>/dev/null &
      ;;
  esac

  sleep 0.8
  log_ok "✅ Navegador lanzado — pestaña abierta"
}

# Decide si abrir el navegador (con selección de preferencia)
maybe_open_browser() {
  if tab_already_open; then
    log_info "🔍 Pestaña ya abierta — no se lanza nuevo navegador"
    return 0
  fi

  local saved_pref; saved_pref=$(load_browser_pref)

  if [ -n "$saved_pref" ] && command -v "$saved_pref" &>/dev/null; then
    # Preferencia guardada y disponible → abrir directo sin preguntar
    local label=""
    for b in $( detect_browsers ); do
      [ "${b%%:*}" = "$saved_pref" ] && label="${b#*:}" && break
    done
    log_info "🌐 Preferencia recordada: ${label:-$saved_pref}"
    open_in_browser "$saved_pref"
  else
    # Sin preferencia o navegador no disponible → mostrar menú
    choose_browser
  fi
}



draw_status_bar() {
  local pid="${1:-?}"; local uptime_str="${2:-00:00:00}"; local restarts="${3:-0}"
  local health="${4:-?}"
  local color=$G; [ "$health" != "200" ] && color=$R
  echo -e "${BLD}${BG_BLU}  🏗️  ReportForge v5.0  │  PID:$pid  │  ⏱ $uptime_str  │  HTTP:${color}$health${N}${BG_BLU}  │  ♻️ $restarts  │  $(_date) $(_ts)  ${N}"
}

# ── CHECK-ONLY ────────────────────────────────────────────────────────────────
if $CHECK_ONLY; then
  clear; setup_env
  log_ok "✅ Entorno verificado — usa ./run.sh para iniciar"
  echo ""; exit 0
fi

# ── LIMPIEZA AL SALIR ─────────────────────────────────────────────────────────
cleanup() {
  tput cnorm 2>/dev/null || true
  stty echo 2>/dev/null || true
  echo ""
  log_warn "🛑 Señal de salida recibida"
  server_stop
  log_ok "👋 ReportForge detenido. ¡Hasta pronto!"
  echo ""
  exit 0
}
trap cleanup INT TERM

# ── INICIO ────────────────────────────────────────────────────────────────────
clear
echo -e "${BLD}${BG_BLU}                                                                    ${N}"
echo -e "${BLD}${BG_BLU}   🏗️  ReportForge v5.0 — Live Dashboard                            ${N}"
echo -e "${BLD}${BG_BLU}   📅 $(_date)                                                      ${N}"
echo -e "${BLD}${BG_BLU}                                                                    ${N}"
echo ""

: > "$LOG_FILE"  # limpiar log al inicio
setup_env

server_kill_all 2>/dev/null || true  # matar instancias previas silenciosamente
server_start || { log_err "No se pudo iniciar — revisa los logs"; exit 1; }

# ── Abrir navegador si no hay pestaña activa ─────────────────────────────────
maybe_open_browser

# ── Variables de estado ───────────────────────────────────────────────────────
UPTIME_START=$(date +%s)
LAST_HEALTH=0
LAST_ENDPOINT_CHECK=0
LAST_SYS_CHECK=0
LAST_MENU=0
HEALTH_INTERVAL=5
ENDPOINT_INTERVAL=15
SYS_INTERVAL=30
MENU_INTERVAL=25
HEALTH_FAIL=0
MAX_FAILS=3
RESTART_COUNT=0
LAST_HTTP="?"

echo ""
log_sep
log_info "📋 ${BLD}Logs en tiempo real${N} — Controles: R Reiniciar  K Kill+Reiniciar  Q Salir"
log_sep
echo ""
draw_menu

# Configurar terminal: sin echo, lectura inmediata de 1 carácter
stty -echo min 0 time 0 2>/dev/null || true
tput civis 2>/dev/null || true  # ocultar cursor

# ── LOOP PRINCIPAL ────────────────────────────────────────────────────────────
ACTION=""
while true; do

  # Leer tecla sin bloquear
  KEY=""
  IFS= read -r -s -n 1 -t 0.05 KEY 2>/dev/null || true

  case "${KEY^^}" in
    R) ACTION="restart" ;;
    K) ACTION="kill_restart" ;;
    B) ACTION="browser" ;;
    Q) break ;;
  esac

  # ── Acciones ────────────────────────────────────────────────────────────────
  if [ "$ACTION" = "browser" ]; then
    echo ""
    log_sep
    log_info "🌐 Abriendo selector de navegador..."
    tput cnorm 2>/dev/null || true
    stty echo 2>/dev/null || true
    choose_browser
    log_sep; echo ""
    LAST_MENU=0; ACTION=""
    draw_menu
  fi

  if [ "$ACTION" = "restart" ]; then
    echo ""
    log_sep
    log_warn "🔄 ${BLD}REINICIANDO${N} servidor por solicitud..."
    server_stop; sleep 1
    if server_start; then
      UPTIME_START=$(date +%s); RESTART_COUNT=$((RESTART_COUNT+1)); HEALTH_FAIL=0; LAST_HTTP="?"
      log_ok "✅ Reinicio #$RESTART_COUNT completado"
    else
      log_err "❌ Reinicio fallido"
    fi
    log_sep; echo ""
    LAST_HEALTH=0; ACTION=""
    draw_menu
  fi

  if [ "$ACTION" = "kill_restart" ]; then
    echo ""
    log_sep
    log_kill "💥 ${BLD}KILL TOTAL + REINICIO${N}..."
    server_kill_all; sleep 1
    if server_start; then
      UPTIME_START=$(date +%s); RESTART_COUNT=$((RESTART_COUNT+1)); HEALTH_FAIL=0; LAST_HTTP="?"
      log_ok "✅ Kill+Reinicio #$RESTART_COUNT completado"
    else
      log_err "❌ Reinicio tras kill fallido"
    fi
    log_sep; echo ""
    LAST_HEALTH=0; ACTION=""
    draw_menu
  fi

  NOW=$(date +%s)

  # ── Health check ──────────────────────────────────────────────────────────
  if [ $(( NOW - LAST_HEALTH )) -ge $HEALTH_INTERVAL ]; then
    LAST_HEALTH=$NOW

    local_up=$(( NOW - UPTIME_START ))
    uh=$((local_up/3600)); um=$(( (local_up%3600)/60 )); us=$((local_up%60))
    printf -v UPSTR "%02d:%02d:%02d" "$uh" "$um" "$us"

    PID_NOW=$(cat "$PID_FILE" 2>/dev/null||echo "?")

    if ! server_running; then
      log_die "💀 Proceso $PID_NOW no encontrado"
      HEALTH_FAIL=$((HEALTH_FAIL+1))
      LAST_HTTP="DEAD"
    else
      HTTP=$(curl -so/dev/null -w "%{http_code}" --connect-timeout 2 \
        "http://localhost:$PORT/health" 2>/dev/null||echo "ERR")
      LAST_HTTP="$HTTP"

      if [ "$HTTP" = "200" ]; then
        HEALTH_FAIL=0
        # Estadísticas proceso
        CPU=$(ps -p "$PID_NOW" -o %cpu --no-headers 2>/dev/null|xargs||echo "?")
        RSS=$(ps -p "$PID_NOW" -o rss  --no-headers 2>/dev/null|xargs||echo "0")
        [ "$RSS" != "0" ] && MEM="${RSS}kB" || MEM="?"
        log_beat "💚 HEALTHY │ PID:$PID_NOW │ UP:$UPSTR │ HTTP:$HTTP │ CPU:${CPU}% │ MEM:$MEM │ Restarts:$RESTART_COUNT"
        draw_status_bar "$PID_NOW" "$UPSTR" "$RESTART_COUNT" "$HTTP"
      else
        HEALTH_FAIL=$((HEALTH_FAIL+1))
        log_warn "💛 DEGRADED │ HTTP:$HTTP │ UP:$UPSTR │ Fallo #$HEALTH_FAIL/$MAX_FAILS │ PID:$PID_NOW"
        draw_status_bar "$PID_NOW" "$UPSTR" "$RESTART_COUNT" "$HTTP"
      fi
    fi

    # Auto-restart
    if [ "$HEALTH_FAIL" -ge "$MAX_FAILS" ]; then
      echo ""
      log_sep
      log_auto "🔁 ${BLD}AUTO-RESTART${N} — $HEALTH_FAIL fallos consecutivos"
      server_stop; sleep 2
      if server_start; then
        UPTIME_START=$(date +%s); RESTART_COUNT=$((RESTART_COUNT+1)); HEALTH_FAIL=0
        log_ok "♻️  Auto-restart #$RESTART_COUNT exitoso"
      else
        log_err "💀 Auto-restart fallido — reintentando en ${HEALTH_INTERVAL}s"
      fi
      log_sep; echo ""
      LAST_HEALTH=0
      draw_menu
    fi
  fi

  # ── Endpoints check ──────────────────────────────────────────────────────
  if [ $(( NOW - LAST_ENDPOINT_CHECK )) -ge $ENDPOINT_INTERVAL ] && server_running; then
    LAST_ENDPOINT_CHECK=$NOW
    for ep in "/" "/health" "/classic" "/modern"; do
      CODE=$(curl -so/dev/null -w "%{http_code}" --connect-timeout 1 \
        "http://localhost:$PORT$ep" 2>/dev/null||echo "ERR")
      if [ "$CODE" = "200" ]; then
        log_net "🟢 GET $ep → ${G}$CODE OK${N}"
      else
        log_err "🔴 GET $ep → $CODE"
      fi
    done
  fi

  # ── Sistema check ────────────────────────────────────────────────────────
  if [ $(( NOW - LAST_SYS_CHECK )) -ge $SYS_INTERVAL ]; then
    LAST_SYS_CHECK=$NOW
    LOAD=$(uptime 2>/dev/null|awk -F'load average:''{print $2}'|xargs||echo "?")
    MEM_INFO=$(free -m 2>/dev/null|awk '/^Mem:/{printf "%dMB libre / %dMB total",$4,$2}'||echo "?")
    DISK_INFO=$(df -h "$SCRIPT_DIR" 2>/dev/null|awk 'NR==2{printf "%s usado / %s total",$3,$2}'||echo "?")
    log_mem "🖥️  Load: $LOAD │ RAM: $MEM_INFO │ Disco: $DISK_INFO"
  fi

  # ── Menú periódico ───────────────────────────────────────────────────────
  if [ $(( NOW - LAST_MENU )) -ge $MENU_INTERVAL ]; then
    LAST_MENU=$NOW
    draw_menu
  fi

  sleep 0.05
done

# ── SALIDA (Q) ────────────────────────────────────────────────────────────────
tput cnorm 2>/dev/null || true
stty echo 2>/dev/null || true
echo ""
log_sep
log_warn "👋 ${BLD}Salida por usuario (Q)${N}"
server_stop
log_ok "✅ Servidor detenido correctamente"
log_sep
echo -e "\n  ${G}${BLD}¡Hasta pronto! 🚀${N}\n"
exit 0
