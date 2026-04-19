#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# ═══════════════════════════════════════════════════════════════════
#  COLORES
# ═══════════════════════════════════════════════════════════════════
if command -v tput >/dev/null 2>&1 && [[ -t 1 ]]; then
  BOLD="$(tput bold)"
  DIM="$(tput dim)"
  RED="$(tput setaf 1)"
  GREEN="$(tput setaf 2)"
  YELLOW="$(tput setaf 3)"
  BLUE="$(tput setaf 4)"
  MAGENTA="$(tput setaf 5)"
  CYAN="$(tput setaf 6)"
  WHITE="$(tput setaf 7)"
  RESET="$(tput sgr0)"
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; MAGENTA=""; CYAN=""; WHITE=""; RESET=""
fi

PYTEST_BIN="${PYTEST_BIN:-pytest}"
NODE_BIN="${NODE_BIN:-node}"

# ═══════════════════════════════════════════════════════════════════
#  OPCIONES
# ═══════════════════════════════════════════════════════════════════
declare -a LABELS=(
  "🧪 Pytest completo"
  "⚡ Pytest completo (stop en primer fallo)"
  "🛡️ Governance guardrails"
  "🏗️ Architecture matrix"
  "🔌 Engine contracts"
  "🌐 Tests Python del perímetro reportforge"
  "🎭 User parity blocking"
  "🌙 User parity extended"
  "📦 test:arch completo"
  "✅ Checks rápidos recomendados"
  "🧹 Limpiar pantalla"
)

declare -a CMDS=(
  "$PYTEST_BIN -q"
  "$PYTEST_BIN -q -x"
  "$NODE_BIN --test reportforge/tests/governance_guardrails.test.mjs"
  "$NODE_BIN --test reportforge/tests/architecture_matrix.test.mjs"
  "$NODE_BIN --test reportforge/tests/engine_contracts.test.mjs"
  "$PYTEST_BIN reportforge/tests -q"
  "npm run test:parity:blocking"
  "npm run test:parity:extended"
  "npm run test:arch"
  "__quick__"
  "__clear__"
)

# ═══════════════════════════════════════════════════════════════════
#  UI
# ═══════════════════════════════════════════════════════════════════
banner() {
  clear || true
  echo -e "${MAGENTA}${BOLD}"
  echo "╔════════════════════════════════════════════════════════════════════╗"
  echo "║   🚀 RF TEST MENU · pytest · arch · parity · guardrails · smoke  ║"
  echo "╚════════════════════════════════════════════════════════════════════╝"
  echo -e "${RESET}"
  echo -e "${CYAN}😎 Usa:${RESET} ${YELLOW}[número]${RESET} ejecutar · ${YELLOW}h${RESET} help · ${YELLOW}l${RESET} listar · ${YELLOW}q${RESET} salir"
  echo
}

menu() {
  for i in "${!LABELS[@]}"; do
    printf "%b%2d%b) %s\n" "$GREEN" "$((i+1))" "$RESET" "${LABELS[$i]}"
  done
  echo
}

help_screen() {
  echo -e "${BOLD}${CYAN}📘 AYUDA RÁPIDA${RESET}"
  echo
  echo -e "${YELLOW}Cómo se usa:${RESET}"
  echo "  - Escribe un número y Enter para correr esa opción."
  echo "  - Escribe varios números separados por espacio para correr varias seguidas."
  echo "    Ejemplo: 3 4 5"
  echo "  - Escribe h para ayuda."
  echo "  - Escribe l para volver a listar el menú."
  echo "  - Escribe q para salir."
  echo
  echo -e "${YELLOW}Recomendación práctica:${RESET}"
  echo "  - Si tocaste arquitectura: 10"
  echo "  - Si tocaste Python server/render: 1 o 2"
  echo "  - Si tocaste user_parity: 7 y luego 8"
  echo
}

pause_return() {
  echo
  read -r -p "⏎ Presiona Enter para volver al menú..." _
}

run_quick_checks() {
  local checks=(
    "$NODE_BIN --test reportforge/tests/governance_guardrails.test.mjs"
    "$NODE_BIN --test reportforge/tests/architecture_matrix.test.mjs"
    "$NODE_BIN --test reportforge/tests/engine_contracts.test.mjs"
  )

  echo -e "${BLUE}${BOLD}▶ Ejecutando checks rápidos...${RESET}"
  echo

  local cmd
  for cmd in "${checks[@]}"; do
    echo -e "${CYAN}👉 $cmd${RESET}"
    if eval "$cmd"; then
      echo -e "${GREEN}✅ OK${RESET}"
    else
      echo -e "${RED}❌ Falló${RESET}"
      return 1
    fi
    echo
  done
}

run_one() {
  local idx="$1"

  if ! [[ "$idx" =~ ^[0-9]+$ ]]; then
    echo -e "${RED}❌ Entrada inválida: $idx${RESET}"
    return 1
  fi

  if (( idx < 1 || idx > ${#LABELS[@]} )); then
    echo -e "${RED}❌ Opción fuera de rango: $idx${RESET}"
    return 1
  fi

  local label="${LABELS[$((idx-1))]}"
  local cmd="${CMDS[$((idx-1))]}"

  echo
  echo -e "${MAGENTA}${BOLD}════════════════════════════════════════════════════════════════════${RESET}"
  echo -e "${BOLD}🚀 Opción $idx:${RESET} $label"
  echo -e "${DIM}Comando:${RESET} ${CYAN}$cmd${RESET}"
  echo -e "${MAGENTA}${BOLD}════════════════════════════════════════════════════════════════════${RESET}"
  echo

  case "$cmd" in
    "__quick__")
      run_quick_checks
      ;;
    "__clear__")
      banner
      menu
      return 0
      ;;
    *)
      eval "$cmd"
      ;;
  esac

  local rc=$?
  echo
  if [[ $rc -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}✅ Terminó bien${RESET}"
  else
    echo -e "${RED}${BOLD}💥 Terminó con error (exit $rc)${RESET}"
  fi
  echo
  return "$rc"
}

main() {
  banner
  menu

  while true; do
    read -r -p "👉 Selección: " input || exit 0

    case "${input:-}" in
      q|Q|quit|exit)
        echo -e "${YELLOW}👋 Saliendo...${RESET}"
        exit 0
        ;;
      h|H|help|-h|--help)
        help_screen
        pause_return
        banner
        menu
        ;;
      l|L|list|menu)
        banner
        menu
        ;;
      "")
        ;;
      *)
        local had_error=0
        for token in $input; do
          if ! run_one "$token"; then
            had_error=1
          fi
        done
        if [[ $had_error -ne 0 ]]; then
          echo -e "${YELLOW}⚠️ Algunas opciones fallaron.${RESET}"
        fi
        pause_return
        banner
        menu
        ;;
    esac
  done
}

main
