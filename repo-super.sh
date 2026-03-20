#!/usr/bin/env bash
# repo-super.sh — QA Orchestrator v18.1 (Phases 29+35+36+37)
set -euo pipefail

T0=$(date +%s%N)
PASS_COUNT=0; FAIL_COUNT=0; FAILED_GROUPS=()
G="\033[0;32m"; R="\033[0;31m"; B="\033[1m"; N="\033[0m"

echo ""
echo "════════════════════════════════════════════════════════════"
echo -e "${B}RF SUPER QA PIPELINE v18.1${N}"
echo "════════════════════════════════════════════════════════════"
echo ""

run_and_report() {
  local LABEL="$1"; local SCRIPT="$2"
  local LOG="/tmp/rf-super-$(echo "$LABEL" | tr ' /' '--').log"
  kill $(fuser 8080/tcp 2>/dev/null) 2>/dev/null || true; sleep 1
  printf "  %-36s" "$LABEL"
  if [[ -f "./$SCRIPT" ]] && timeout 120 bash "./$SCRIPT" > "$LOG" 2>&1; then
    echo -e "${G}PASS${N}"; PASS_COUNT=$((PASS_COUNT+1))
  else
    echo -e "${R}FAIL${N}"; FAIL_COUNT=$((FAIL_COUNT+1)); FAILED_GROUPS+=("$LABEL")
    grep -E "^  (FAIL|Error)" "$LOG" 2>/dev/null | head -3 | sed 's/^/    /' || true
    T1=$(date +%s%N)
    echo -e "  ${R}Pipeline stopped: $LABEL ($(( (T1-T0)/1000000000 ))s)${N}"
    echo "════════════════════════════════════════════════════════════"
    echo "RF SUPER QA FAILED"; exit 1
  fi
}

# ════ GROUP 1: CORE ENGINE ════════════════════════════════════════════
echo "  ── Core Engine ──"
run_and_report "PERFORMANCE"              "repo-performance.sh"
run_and_report "GEOMETRY"                 "repo-geometry.sh"
run_and_report "FLOATING POINT"           "repo-floating-point.sh"
run_and_report "LAYOUT HASH"              "repo-layout-hash.sh"

# ════ GROUP 2: INTERACTION ════════════════════════════════════════════
echo "  ── Interaction ──"
run_and_report "INTERACTION"              "repo-interaction.sh"
run_and_report "SNAP"                     "repo-snap.sh"
run_and_report "ZOOM"                     "repo-zoom.sh"
run_and_report "UNDO INTEGRITY"           "repo-undo-integrity.sh"
run_and_report "IDEMPOTENCY"              "repo-idempotency.sh"
run_and_report "DETERMINISM"              "repo-determinism.sh"
run_and_report "REPLAY"                   "repo-replay.sh"
# Phase 36 interaction tests
run_and_report "SELECTION ENGINE"         "repo-selection-engine.sh"
run_and_report "DRAG PRECISION"           "repo-drag-precision.sh"
run_and_report "CLIPBOARD"                "repo-clipboard.sh"

# ════ GROUP 3: DESIGNER STRUCTURE ════════════════════════════════════
echo "  ── Designer Structure ──"
run_and_report "LAYOUT"                   "repo-layout.sh"
run_and_report "VISUAL"                   "repo-visual.sh"
run_and_report "LAYOUT REFLOW"            "repo-layout-reflow.sh"
run_and_report "LAYOUT INVARIANTS"        "repo-layout-invariants.sh"

# ════ GROUP 4: STRESS & CHAOS ═════════════════════════════════════════
echo "  ── Stress & Chaos ──"
run_and_report "MULTI OBJECT"             "repo-multi-object.sh"
run_and_report "MEMORY"                   "repo-memory.sh"
run_and_report "CRASH GUARD"              "repo-crash-guard.sh"
run_and_report "LAYOUT STRESS"            "repo-layout-stress.sh"
run_and_report "EXTENSION SAFETY"         "repo-extension-safety.sh"
# Phase 36 document tests
run_and_report "LARGE DOCUMENT"           "repo-large-document.sh"
run_and_report "CORRUPTED LOAD"           "repo-corrupted-load.sh"

# ════ GROUP 5: VALIDATION ══════════════════════════════════════════════
echo "  ── Validation ──"
run_and_report "STATE MACHINE"            "repo-state-machine.sh"
run_and_report "COMMAND IDEMPOTENCY"      "repo-command-idempotency.sh"
run_and_report "SERIALIZATION"            "repo-serialization.sh"
run_and_report "INPUT DEVICES"            "repo-input-devices.sh"
run_and_report "PERFORMANCE BUDGET"       "repo-performance-budget.sh"
run_and_report "LATENCY"                  "repo-latency.sh"
# Phase 36 validation tests
run_and_report "MIGRATION"                "repo-migration.sh"
run_and_report "TIME TRAVEL"              "repo-time-travel.sh"

# ════ GROUP 6: INPUT & ARCHITECTURE ═══════════════════════════════════
echo "  ── Input & Architecture ──"
run_and_report "KEYBOARD NAVIGATION"      "repo-keyboard-navigation.sh"
run_and_report "FOCUS MANAGEMENT"         "repo-focus.sh"
run_and_report "COMMAND COLLISION"        "repo-command-collision.sh"

# ════ GROUP 7: UI & COVERAGE ══════════════════════════════════════════
echo "  ── UI & Coverage ──"
run_and_report "COMMAND MATRIX"           "repo-command-matrix.sh"
run_and_report "UI EXPLORER"              "repo-ui-explorer.sh"
run_and_report "UI ENHANCED"              "repo-ui-enhanced.sh"
run_and_report "UI STATE SNAPSHOT"        "repo-ui-state.sh"

# ════ GROUP 8: VISUAL REGRESSION ══════════════════════════════════════
echo "  ── Visual Regression ──"
run_and_report "VISUAL DIFF"              "repo-visual-diff.sh"

# ════ FINAL GATE ═══════════════════════════════════════════════════════
echo "  ── Master Gate ──"
run_and_report "MASTER DESIGNER GOD"      "repo-designer-god.sh"

# ════ REPORT ════════════════════════════════════════════════════════════
T1=$(date +%s%N); ELAPSED=$(( (T1-T0)/1000000000 ))
kill $(fuser 8080/tcp 2>/dev/null) 2>/dev/null || true

echo ""
echo "════════════════════════════════════════════════════════════"
echo -e "${B}RF SUPER QA RESULTS${N}"
echo "════════════════════════════════════════════════════════════"
echo -e "  Groups passed: ${G}${PASS_COUNT}${N}  •  Failed: ${R}${FAIL_COUNT}${N}  •  Time: ${ELAPSED}s"
echo ""
echo -e "  ${G}${B}RF DESIGNER VERIFIED — v18.1${N}"
echo "════════════════════════════════════════════════════════════"
echo "RF SUPER QA PASSED"
