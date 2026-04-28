#!/usr/bin/env bash
# validate_repo.sh — ReportForge repository validation script
# Usage: ./validate_repo.sh [--quick] [--json]
# Returns 0 if all checks pass, 1 if any fail.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAIL=0
PASS=0
SKIP=0
QUICK=${1:-""}
JSON_OUT=${2:-""}
RESULTS=()

# ── Helpers ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'; BOLD='\033[1m'

ok()   { echo -e "${GREEN}✅ PASS${NC}  $1"; PASS=$((PASS+1)); RESULTS+=("PASS|$1"); }
fail() { echo -e "${RED}❌ FAIL${NC}  $1${2:+ — $2}"; FAIL=$((FAIL+1)); RESULTS+=("FAIL|$1|${2:-}"); }
skip() { echo -e "${YELLOW}⏭  SKIP${NC}  $1"; SKIP=$((SKIP+1)); RESULTS+=("SKIP|$1"); }
hdr()  { echo -e "\n${BOLD}── $1 ──${NC}"; }

# ── 1. Repository structure ────────────────────────────────────────────────────
hdr "Repository Structure"

check_dir()  { [[ -d "$ROOT/$1" ]] && ok "dir: $1" || fail "dir: $1" "missing"; }
check_file() { [[ -f "$ROOT/$1" ]] && ok "file: $1" || fail "file: $1" "missing"; }

check_dir  "reportforge"
check_dir  "reportforge/core"
check_dir  "reportforge/core/render"
check_dir  "reportforge/core/render/expressions"
check_dir  "reportforge/server"
check_dir  "reportforge/tests"
check_dir  "designer"
check_dir  "engines"

check_file "reportforge_server.py"
check_file "reportforge/core/render/expressions/formula_parser.py"
check_file "reportforge/core/render/expressions/eval_context.py"
check_file "reportforge/core/render/expressions/evaluator.py"
check_file "reportforge/core/render/expressions/cr_functions.py"
check_file "reportforge/core/render/expressions/aggregator.py"
check_file "designer/crystal-reports-designer-v4.html"
check_file "engines/EngineCore.js"
check_file "engines/SelectionEngine.js"
check_file "engines/CanvasLayoutEngine.js"
check_file "engines/PreviewEngine.js"

# ── 2. Python syntax ───────────────────────────────────────────────────────────
hdr "Python Syntax (py_compile)"

PY_ERRORS=0
while IFS= read -r -d '' f; do
  if ! python3 -m py_compile "$f" 2>/dev/null; then
    fail "py syntax: ${f#$ROOT/}"
    PY_ERRORS=$((PY_ERRORS+1))
  fi
done < <(find "$ROOT/reportforge" -name "*.py" -not -path "*/__pycache__/*" -print0)

[[ $PY_ERRORS -eq 0 ]] && ok "All Python files compile without syntax errors"

# ── 3. JavaScript syntax ───────────────────────────────────────────────────────
hdr "JavaScript Syntax (node --check)"

if command -v node &>/dev/null; then
  JS_ERRORS=0
  while IFS= read -r -d '' f; do
    if ! node --input-type=module --check < "$f" 2>/dev/null; then
      fail "js syntax: ${f#$ROOT/}"
      JS_ERRORS=$((JS_ERRORS+1))
    fi
  done < <(find "$ROOT/engines" -name "*.js" -print0)
  [[ $JS_ERRORS -eq 0 ]] && ok "All JS files syntax-valid ($JS_ERRORS errors)"
else
  skip "node not installed — skipping JS syntax checks"
fi

# ── 4. Python unit tests ───────────────────────────────────────────────────────
hdr "Python Unit Tests"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  TEST_OUT=$(python3 -m unittest discover -s reportforge/tests -p "test_*.py" 2>&1)
  TEST_SUMMARY=$(echo "$TEST_OUT" | tail -3)
  if echo "$TEST_SUMMARY" | grep -qE "^OK"; then
    TOTAL=$(echo "$TEST_SUMMARY" | grep -oE "Ran [0-9]+" | awk '{print $2}')
    SKIP_CNT=$(echo "$TEST_SUMMARY" | grep -oE "skipped=[0-9]+" | grep -oE "[0-9]+")
    ok "Unit tests: ${TOTAL:-?} passed${SKIP_CNT:+, $SKIP_CNT skipped}"
  else
    FAIL_CNT=$(echo "$TEST_SUMMARY" | grep -oE "failures=[0-9]+" | grep -oE "[0-9]+")
    ERR_CNT=$(echo "$TEST_SUMMARY" | grep -oE "errors=[0-9]+" | grep -oE "[0-9]+")
    fail "Unit tests" "failures=${FAIL_CNT:-0} errors=${ERR_CNT:-0}"
    echo "$TEST_OUT" | grep -E "^(FAIL|ERROR):" | head -10
  fi
else
  skip "Unit tests (--quick mode)"
fi

# ── 5. Key module imports ──────────────────────────────────────────────────────
hdr "Python Imports"

check_import() {
  local mod="$1"
  if python3 -c "import sys; sys.path.insert(0,'$ROOT'); import $mod" 2>/dev/null; then
    ok "import $mod"
  else
    fail "import $mod"
  fi
}

check_import "reportforge.core.render.expressions.cr_functions"
check_import "reportforge.core.render.expressions.formula_parser"
check_import "reportforge.core.render.expressions.eval_context"
check_import "reportforge.core.render.expressions.evaluator"
check_import "reportforge.core.render.expressions.aggregator"
check_import "reportforge.server.main"

# ── 6. Server runtime checks ──────────────────────────────────────────────────
hdr "Server Runtime"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  # Start server on a random high port
  PORT=19977
  python3 reportforge_server.py $PORT &>/dev/null &
  SRV_PID=$!
  sleep 0.6

  check_endpoint() {
    local label="$1" url="$2" expected="$3"
    local body
    body=$(curl -sf "$url" 2>/dev/null) || { fail "endpoint: $label" "HTTP error"; return; }
    if echo "$body" | grep -q "$expected" 2>/dev/null; then
      ok "endpoint: $label"
    else
      fail "endpoint: $label" "expected '$expected' not found"
    fi
  }

  check_endpoint "GET /health"    "http://127.0.0.1:$PORT/health" '"status"'
  check_endpoint "GET / (designer)" "http://127.0.0.1:$PORT/"   '<!DOCTYPE'
  check_endpoint "GET / FormulaEngine" "http://127.0.0.1:$PORT/" 'FormulaEngine'
  check_endpoint "GET / pointer events" "http://127.0.0.1:$PORT/engines/GlobalEventHandlers.js" 'pointerdown'

  # POST /validate-formula
  VF=$(curl -sf -X POST "http://127.0.0.1:$PORT/validate-formula" \
    -H "Content-Type: application/json" \
    -d '{"formula":"Today()"}' 2>/dev/null)
  if echo "$VF" | python3 -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get('valid') else 1)" 2>/dev/null; then
    ok "POST /validate-formula (Today)"
  else
    fail "POST /validate-formula (Today)" "$VF"
  fi

  VF2=$(curl -sf -X POST "http://127.0.0.1:$PORT/validate-formula" \
    -H "Content-Type: application/json" \
    -d '{"formula":"IIf({total}>100,\"High\",\"Low\")","sample":{"total":150}}' 2>/dev/null)
  if echo "$VF2" | python3 -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get('valid') else 1)" 2>/dev/null; then
    ok "POST /validate-formula (IIf + sample)"
  else
    fail "POST /validate-formula (IIf)" "$VF2"
  fi

  # POST /designer-preview
  PREV=$(curl -sf -X POST "http://127.0.0.1:$PORT/designer-preview" \
    -H "Content-Type: application/json" \
    -d '{
      "layout":{
        "name":"Test","version":"3.0","pageSize":"A4","orientation":"portrait",
        "pageWidth":754,"margins":{"top":15,"bottom":15,"left":20,"right":20},
        "sections":[{"id":"s-ph","stype":"ph","label":"Page Header","height":36},
                    {"id":"s-det","stype":"det","label":"Detail","height":18,"iterates":"items"},
                    {"id":"s-pf","stype":"pf","label":"Page Footer","height":30}],
        "elements":[{"id":"e1","type":"text","sectionId":"s-ph","x":10,"y":4,"w":200,"h":14,
                     "content":"Report Title","fontFamily":"Arial","fontSize":12,"bold":true,
                     "italic":false,"underline":false,"align":"left","color":"#000","bgColor":"transparent",
                     "borderColor":"transparent","borderWidth":0,"zIndex":0}],
        "groups":[],"sortBy":[],"parameters":[],"filters":[]},
      "data":{"items":[{"id":1,"name":"Widget Pro","qty":10,"unit_price":25,"total":250}]}}' 2>/dev/null)
  if echo "$PREV" | grep -q '<html' 2>/dev/null; then
    ok "POST /designer-preview"
  else
    fail "POST /designer-preview" "no HTML in response"
  fi

  kill $SRV_PID 2>/dev/null || true
else
  skip "Server runtime checks (--quick mode)"
fi

# ── 7. Browser runtime regression suite ────────────────────────────────────────
hdr "Browser Runtime Regression"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if timeout 900s npm run test:runtime >/tmp/rf_runtime_regression.out 2>&1; then
      ok "Browser runtime regression suite"
    else
      fail "Browser runtime regression suite" "see /tmp/rf_runtime_regression.out"
      tail -40 /tmp/rf_runtime_regression.out || true
    fi
  else
    skip "node not installed — skipping browser runtime regression suite"
  fi
else
  skip "Browser runtime regression suite (--quick mode)"
fi

# ── 7a-2. Fix scope discipline (#72) ─────────────────────────────────────────
hdr "Fix Scope Discipline"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null && git rev-parse --git-dir &>/dev/null; then
    COMMIT_COUNT=$(git rev-list --count HEAD 2>/dev/null || echo 0)
    if [[ "$COMMIT_COUNT" -gt 1 ]]; then
      if node audit/fix_scope_guard.mjs >/tmp/rf_fix_scope.out 2>&1; then
        ok "Fix scope discipline (principle #72)"
      else
        fail "Fix scope discipline (principle #72)" "see /tmp/rf_fix_scope.out"
        tail -20 /tmp/rf_fix_scope.out || true
      fi
    else
      skip "Fix scope discipline (first commit — no prior to diff against)"
    fi
  else
    skip "Fix scope discipline (node or git not available)"
  fi
else
  skip "Fix scope discipline (--quick mode)"
fi

# ── 7a-3. Pain → guardrail enforcement (#80) ─────────────────────────────────
hdr "Pain Becomes Guardrail"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null && git rev-parse --git-dir &>/dev/null; then
    COMMIT_COUNT=$(git rev-list --count HEAD 2>/dev/null || echo 0)
    if [[ "$COMMIT_COUNT" -gt 1 ]]; then
      if node audit/pain_becomes_guardrail_guard.mjs >/tmp/rf_pain_guardrail.out 2>&1; then
        ok "Pain becomes guardrail (principle #80)"
      else
        fail "Pain becomes guardrail (principle #80)" "see /tmp/rf_pain_guardrail.out"
        tail -20 /tmp/rf_pain_guardrail.out || true
      fi
    else
      skip "Pain becomes guardrail (first commit — nothing to classify)"
    fi
  else
    skip "Pain becomes guardrail (node or git not available)"
  fi
else
  skip "Pain becomes guardrail (--quick mode)"
fi

# ── 7a-5. Cosmetic fix detection (#77) ───────────────────────────────────────
hdr "Cosmetic Fix Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null && git rev-parse --git-dir &>/dev/null; then
    COMMIT_COUNT=$(git rev-list --count HEAD 2>/dev/null || echo 0)
    if [[ "$COMMIT_COUNT" -gt 1 ]]; then
      if node audit/cosmetic_fix_guard.mjs >/tmp/rf_cosmetic_fix.out 2>&1; then
        ok "Cosmetic fix guard (principle #77)"
      else
        fail "Cosmetic fix guard (principle #77)" "see /tmp/rf_cosmetic_fix.out"
        tail -20 /tmp/rf_cosmetic_fix.out || true
      fi
    else
      skip "Cosmetic fix guard (first commit — nothing to classify)"
    fi
  else
    skip "Cosmetic fix guard (node or git not available)"
  fi
else
  skip "Cosmetic fix guard (--quick mode)"
fi

# ── 7a-6. Reset stability guard (#39 / #66) ──────────────────────────────────
hdr "Reset Stability Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/reset_stability_guard.mjs >/tmp/rf_reset_stability.out 2>&1; then
      ok "Reset stability guard (principles #39 / #66)"
    else
      fail "Reset stability guard (principles #39 / #66)" "see /tmp/rf_reset_stability.out"
      tail -20 /tmp/rf_reset_stability.out || true
    fi
  else
    skip "Reset stability guard (node not available)"
  fi
else
  skip "Reset stability guard (--quick mode)"
fi

# ── 7b. Architecture governance guardrails ────────────────────────────────────
hdr "Architecture Governance"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node --test reportforge/tests/governance_guardrails.test.mjs >/tmp/rf_governance_guardrails.out 2>&1; then
      ok "Architecture governance guardrails"
    else
      fail "Architecture governance guardrails" "see /tmp/rf_governance_guardrails.out"
      tail -40 /tmp/rf_governance_guardrails.out || true
    fi
  else
    skip "node not installed — skipping architecture governance guardrails"
  fi
else
  skip "Architecture governance guardrails (--quick mode)"
fi

# ── 7c. Memory leak / zombie state detection (#38 / #40) ─────────────────────
hdr "Memory Leak Detection"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node --test reportforge/tests/memory_leak_detection.test.mjs >/tmp/rf_memory_leak.out 2>&1; then
      ok "Memory leak detection (principles #38 / #40)"
    else
      fail "Memory leak detection (principles #38 / #40)" "see /tmp/rf_memory_leak.out"
      tail -20 /tmp/rf_memory_leak.out || true
    fi
  else
    skip "Memory leak detection (node not available)"
  fi
else
  skip "Memory leak detection (--quick mode)"
fi

# ── 7d. Mutation injection / side-effects (#6) ───────────────────────────────
hdr "Mutation Injection Tests"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node --test reportforge/tests/mutation_injection.test.mjs >/tmp/rf_mutation_injection.out 2>&1; then
      ok "Mutation injection tests (principle #6)"
    else
      fail "Mutation injection tests (principle #6)" "see /tmp/rf_mutation_injection.out"
      tail -20 /tmp/rf_mutation_injection.out || true
    fi
  else
    skip "Mutation injection tests (node not available)"
  fi
else
  skip "Mutation injection tests (--quick mode)"
fi

# ── 7e. Global state corruption detection (#20 / #47) ────────────────────────
hdr "Global State Corruption Tests"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node --test reportforge/tests/global_state_corruption.test.mjs >/tmp/rf_global_state.out 2>&1; then
      ok "Global state corruption detection (principles #20 / #47)"
    else
      fail "Global state corruption detection (principles #20 / #47)" "see /tmp/rf_global_state.out"
      tail -20 /tmp/rf_global_state.out || true
    fi
  else
    skip "Global state corruption tests (node not available)"
  fi
else
  skip "Global state corruption tests (--quick mode)"
fi

# ── 7f. Critical runtime contracts (#11 / #16 / #21 / #32 / #45 / #46) ────────
hdr "Critical Runtime Contracts"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node --test reportforge/tests/critical_runtime_contracts.test.mjs >/tmp/rf_critical_contracts.out 2>&1; then
      ok "Critical runtime contracts (principles #11 / #16 / #21 / #32 / #45 / #46)"
    else
      fail "Critical runtime contracts (principles #11 / #16 / #21 / #32 / #45 / #46)" "see /tmp/rf_critical_contracts.out"
      tail -30 /tmp/rf_critical_contracts.out || true
    fi
  else
    skip "Critical runtime contracts (node not available)"
  fi
else
  skip "Critical runtime contracts (--quick mode)"
fi

# ── 7g. Declarative bindings (#13) ───────────────────────────────────────────
hdr "Declarative Bindings Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/declarative_bindings_guard.mjs >/tmp/rf_declarative_bindings.out 2>&1; then
      ok "Declarative bindings guard (principle #13)"
    else
      fail "Declarative bindings guard (principle #13)" "see /tmp/rf_declarative_bindings.out"
      tail -20 /tmp/rf_declarative_bindings.out || true
    fi
  else
    skip "Declarative bindings guard (node not available)"
  fi
else
  skip "Declarative bindings guard (--quick mode)"
fi

# ── 7h. Polling relapse detection (#59) ──────────────────────────────────────
hdr "Polling Relapse Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/polling_relapse_guard.mjs >/tmp/rf_polling_relapse.out 2>&1; then
      ok "Polling relapse guard (principle #59)"
    else
      fail "Polling relapse guard (principle #59)" "see /tmp/rf_polling_relapse.out"
      tail -20 /tmp/rf_polling_relapse.out || true
    fi
  else
    skip "Polling relapse guard (node not available)"
  fi
else
  skip "Polling relapse guard (--quick mode)"
fi

# ── 7i. Shadow DOM isolation (#48/#49) ────────────────────────────────────────
hdr "Shadow DOM Isolation Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/shadow_dom_isolation_guard.mjs >/tmp/rf_shadow_dom.out 2>&1; then
      ok "Shadow DOM isolation guard (principles #48/#49)"
    else
      fail "Shadow DOM isolation guard (principles #48/#49)" "see /tmp/rf_shadow_dom.out"
      tail -20 /tmp/rf_shadow_dom.out || true
    fi
  else
    skip "Shadow DOM isolation guard (node not available)"
  fi
else
  skip "Shadow DOM isolation guard (--quick mode)"
fi

# ── 7j. Writer conflict detection (#54/#55) ───────────────────────────────────
hdr "Writer Conflict Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/writer_conflict_guard.mjs >/tmp/rf_writer_conflict.out 2>&1; then
      ok "Writer conflict guard (principles #54/#55)"
    else
      fail "Writer conflict guard (principles #54/#55)" "see /tmp/rf_writer_conflict.out"
      tail -20 /tmp/rf_writer_conflict.out || true
    fi
  else
    skip "Writer conflict guard (node not available)"
  fi
else
  skip "Writer conflict guard (--quick mode)"
fi

# ── 7k. Render storm & observability (#50-#53) ────────────────────────────────
hdr "Render Storm & Observability Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/render_storm_guard.mjs >/tmp/rf_render_storm.out 2>&1; then
      ok "Render storm & observability guard (principles #50-#53)"
    else
      fail "Render storm & observability guard (principles #50-#53)" "see /tmp/rf_render_storm.out"
      tail -20 /tmp/rf_render_storm.out || true
    fi
  else
    skip "Render storm guard (node not available)"
  fi
else
  skip "Render storm guard (--quick mode)"
fi

# ── 7l. Orphan node detection (#60) ──────────────────────────────────────────
hdr "Orphan Node Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/orphan_node_guard.mjs >/tmp/rf_orphan_node.out 2>&1; then
      ok "Orphan node guard (principle #60)"
    else
      fail "Orphan node guard (principle #60)" "see /tmp/rf_orphan_node.out"
      tail -20 /tmp/rf_orphan_node.out || true
    fi
  else
    skip "Orphan node guard (node not available)"
  fi
else
  skip "Orphan node guard (--quick mode)"
fi

# ── 7m. Visual contract snapshots & diff (#61/#62) ────────────────────────────
hdr "Visual Contract Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/visual_contract_guard.mjs >/tmp/rf_visual_contract.out 2>&1; then
      ok "Visual contract guard (principles #61/#62)"
    else
      fail "Visual contract guard (principles #61/#62)" "see /tmp/rf_visual_contract.out"
      tail -20 /tmp/rf_visual_contract.out || true
    fi
  else
    skip "Visual contract guard (node not available)"
  fi
else
  skip "Visual contract guard (--quick mode)"
fi

# ── 7r. Subsystem SSOT ────────────────────────────────────────────────────────
hdr "Subsystem SSOT Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/subsystem_ssot_guard.mjs >/tmp/rf_subsystem_ssot.out 2>&1; then
      ok "Subsystem SSOT guard (principle #1 — each subsystem owns its state)"
    else
      fail "Subsystem SSOT guard" "see /tmp/rf_subsystem_ssot.out"
      tail -20 /tmp/rf_subsystem_ssot.out || true
    fi
  else
    skip "Subsystem SSOT guard (node not available)"
  fi
else
  skip "Subsystem SSOT guard (--quick mode)"
fi

# ── 7p. Per-Task Profiling (#52) ──────────────────────────────────────────────
hdr "Per-Task Profiling Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/per_task_profiling_guard.mjs >/tmp/rf_per_task_profiling.out 2>&1; then
      ok "Per-task profiling guard (principle #52)"
    else
      fail "Per-task profiling guard (principle #52)" "see /tmp/rf_per_task_profiling.out"
      tail -20 /tmp/rf_per_task_profiling.out || true
    fi
  else
    skip "Per-task profiling guard (node not available)"
  fi
else
  skip "Per-task profiling guard (--quick mode)"
fi

# ── 7q. Rate-limit Safe Shell (#67) ───────────────────────────────────────────
hdr "Rate-Limit Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v python3 &>/dev/null; then
    if python3 audit/rate_limit_guard.py >/tmp/rf_rate_limit.out 2>&1; then
      ok "Rate-limit guard (principle #67)"
    else
      fail "Rate-limit guard (principle #67)" "see /tmp/rf_rate_limit.out"
      tail -20 /tmp/rf_rate_limit.out || true
    fi
  else
    skip "Rate-limit guard (python3 not available)"
  fi
else
  skip "Rate-limit guard (--quick mode)"
fi

# ── 7s. Safe Rollback Paths (#74) ─────────────────────────────────────────────
hdr "Safe Rollback Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/safe_rollback_guard.mjs >/tmp/rf_safe_rollback.out 2>&1; then
      ok "Safe rollback guard (principle #74)"
    else
      fail "Safe rollback guard (principle #74)" "see /tmp/rf_safe_rollback.out"
      tail -20 /tmp/rf_safe_rollback.out || true
    fi
  else
    skip "Safe rollback guard (node not available)"
  fi
else
  skip "Safe rollback guard (--quick mode)"
fi

# ── 7t. Three-Attempt Convergence (#79) ───────────────────────────────────────
hdr "Convergence Discipline Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/convergence_discipline_guard.mjs >/tmp/rf_convergence_discipline.out 2>&1; then
      ok "Convergence discipline guard (principle #79)"
    else
      fail "Convergence discipline guard (principle #79)" "see /tmp/rf_convergence_discipline.out"
      tail -20 /tmp/rf_convergence_discipline.out || true
    fi
  else
    skip "Convergence discipline guard (node not available)"
  fi
else
  skip "Convergence discipline guard (--quick mode)"
fi

# ── 7u. Immutability (#2) ─────────────────────────────────────────────────────
hdr "Immutability Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/immutability_guard.mjs >/tmp/rf_immutability.out 2>&1; then
      ok "Immutability guard (principle #2)"
    else
      fail "Immutability guard (principle #2)" "see /tmp/rf_immutability.out"
      tail -20 /tmp/rf_immutability.out || true
    fi
  else
    skip "Immutability guard (node not available)"
  fi
else
  skip "Immutability guard (--quick mode)"
fi

# ── 7v. Bootstrap Idempotency (#12) ───────────────────────────────────────────
hdr "Bootstrap Idempotency Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/bootstrap_idempotency_guard.mjs >/tmp/rf_bootstrap_idempotency.out 2>&1; then
      ok "Bootstrap idempotency guard (principle #12)"
    else
      fail "Bootstrap idempotency guard (principle #12)" "see /tmp/rf_bootstrap_idempotency.out"
      tail -20 /tmp/rf_bootstrap_idempotency.out || true
    fi
  else
    skip "Bootstrap idempotency guard (node not available)"
  fi
else
  skip "Bootstrap idempotency guard (--quick mode)"
fi

# ── 7w. Magic Offset (#24) ────────────────────────────────────────────────────
hdr "Magic Offset Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/magic_offset_guard.mjs >/tmp/rf_magic_offset.out 2>&1; then
      ok "Magic offset guard (principle #24)"
    else
      fail "Magic offset guard (principle #24)" "see /tmp/rf_magic_offset.out"
      tail -20 /tmp/rf_magic_offset.out || true
    fi
  else
    skip "Magic offset guard (node not available)"
  fi
else
  skip "Magic offset guard (--quick mode)"
fi

# ── 7x. Load Order (#31) ──────────────────────────────────────────────────────
hdr "Load Order Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/load_order_guard.mjs >/tmp/rf_load_order.out 2>&1; then
      ok "Load order guard (principle #31)"
    else
      fail "Load order guard (principle #31)" "see /tmp/rf_load_order.out"
      tail -20 /tmp/rf_load_order.out || true
    fi
  else
    skip "Load order guard (node not available)"
  fi
else
  skip "Load order guard (--quick mode)"
fi

# ── 7y. Pipeline Phase Order (#34) ────────────────────────────────────────────
hdr "Pipeline Phase Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/pipeline_phase_guard.mjs >/tmp/rf_pipeline_phase.out 2>&1; then
      ok "Pipeline phase guard (principle #34)"
    else
      fail "Pipeline phase guard (principle #34)" "see /tmp/rf_pipeline_phase.out"
      tail -20 /tmp/rf_pipeline_phase.out || true
    fi
  else
    skip "Pipeline phase guard (node not available)"
  fi
else
  skip "Pipeline phase guard (--quick mode)"
fi

# ── 7z. Error Taxonomy (#69) ──────────────────────────────────────────────────
hdr "Error Taxonomy Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/error_taxonomy_guard.mjs >/tmp/rf_error_taxonomy.out 2>&1; then
      ok "Error taxonomy guard (principle #69)"
    else
      fail "Error taxonomy guard (principle #69)" "see /tmp/rf_error_taxonomy.out"
      tail -20 /tmp/rf_error_taxonomy.out || true
    fi
  else
    skip "Error taxonomy guard (node not available)"
  fi
else
  skip "Error taxonomy guard (--quick mode)"
fi

# ── 7aa. Incident Replay (#70) ────────────────────────────────────────────────
hdr "Incident Replay Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/incident_replay_guard.mjs >/tmp/rf_incident_replay.out 2>&1; then
      ok "Incident replay guard (principle #70)"
    else
      fail "Incident replay guard (principle #70)" "see /tmp/rf_incident_replay.out"
      tail -20 /tmp/rf_incident_replay.out || true
    fi
  else
    skip "Incident replay guard (node not available)"
  fi
else
  skip "Incident replay guard (--quick mode)"
fi

# ── 7bb. Derived State (#4) ───────────────────────────────────────────────────
hdr "Derived State Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/derived_state_guard.mjs >/tmp/rf_derived_state.out 2>&1; then
      ok "Derived state guard (principle #4)"
    else
      fail "Derived state guard (principle #4)" "see /tmp/rf_derived_state.out"
      tail -20 /tmp/rf_derived_state.out || true
    fi
  else
    skip "Derived state guard (node not available)"
  fi
else
  skip "Derived state guard (--quick mode)"
fi

# ── 7cc. Phase Sequence (#8) ──────────────────────────────────────────────────
hdr "Phase Sequence Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/phase_sequence_guard.mjs >/tmp/rf_phase_sequence.out 2>&1; then
      ok "Phase sequence guard (principle #8)"
    else
      fail "Phase sequence guard (principle #8)" "see /tmp/rf_phase_sequence.out"
      tail -20 /tmp/rf_phase_sequence.out || true
    fi
  else
    skip "Phase sequence guard (node not available)"
  fi
else
  skip "Phase sequence guard (--quick mode)"
fi

# ── 7dd. Visual State (#17) ───────────────────────────────────────────────────
hdr "Visual State Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/visual_state_guard.mjs >/tmp/rf_visual_state.out 2>&1; then
      ok "Visual state guard (principle #17)"
    else
      fail "Visual state guard (principle #17)" "see /tmp/rf_visual_state.out"
      tail -20 /tmp/rf_visual_state.out || true
    fi
  else
    skip "Visual state guard (node not available)"
  fi
else
  skip "Visual state guard (--quick mode)"
fi

# ── 7ee. Honest Fallbacks (#22) ───────────────────────────────────────────────
hdr "Honest Fallback Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/honest_fallback_guard.mjs >/tmp/rf_honest_fallback.out 2>&1; then
      ok "Honest fallback guard (principle #22)"
    else
      fail "Honest fallback guard (principle #22)" "see /tmp/rf_honest_fallback.out"
      tail -20 /tmp/rf_honest_fallback.out || true
    fi
  else
    skip "Honest fallback guard (node not available)"
  fi
else
  skip "Honest fallback guard (--quick mode)"
fi

# ── 7ff. Semantic Classes (#30) ───────────────────────────────────────────────
hdr "Semantic Class Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/semantic_class_guard.mjs >/tmp/rf_semantic_class.out 2>&1; then
      ok "Semantic class guard (principle #30)"
    else
      fail "Semantic class guard (principle #30)" "see /tmp/rf_semantic_class.out"
      tail -20 /tmp/rf_semantic_class.out || true
    fi
  else
    skip "Semantic class guard (node not available)"
  fi
else
  skip "Semantic class guard (--quick mode)"
fi

# ── 7gg. Minimal Repro First (#71) ────────────────────────────────────────────
hdr "Minimal Repro Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/minimal_repro_guard.mjs >/tmp/rf_minimal_repro.out 2>&1; then
      ok "Minimal repro guard (principle #71)"
    else
      fail "Minimal repro guard (principle #71)" "see /tmp/rf_minimal_repro.out"
      tail -20 /tmp/rf_minimal_repro.out || true
    fi
  else
    skip "Minimal repro guard (node not available)"
  fi
else
  skip "Minimal repro guard (--quick mode)"
fi

# ── 7hh. Shared Core Standards (#76) ─────────────────────────────────────────
hdr "Shared Core Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/shared_core_guard.mjs >/tmp/rf_shared_core.out 2>&1; then
      ok "Shared core guard (principle #76)"
    else
      fail "Shared core guard (principle #76)" "see /tmp/rf_shared_core.out"
      tail -20 /tmp/rf_shared_core.out || true
    fi
  else
    skip "Shared core guard (node not available)"
  fi
else
  skip "Shared core guard (--quick mode)"
fi

# ── 7ii. Declarative Coercion Map (#22 evidence) ──────────────────────────────
hdr "Coercion Map Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/coercion_map_guard.mjs >/tmp/rf_coercion_map.out 2>&1; then
      ok "Coercion map guard (canonical coercion layer)"
    else
      fail "Coercion map guard (canonical coercion layer)" "see /tmp/rf_coercion_map.out"
      tail -20 /tmp/rf_coercion_map.out || true
    fi
  else
    skip "Coercion map guard (node not available)"
  fi
else
  skip "Coercion map guard (--quick mode)"
fi

# ── 7jj. Critical Field Mutation (#22 + ownership) ────────────────────────────
hdr "Critical Field Mutation Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/critical_field_mutation_guard.mjs >/tmp/rf_critfield.out 2>&1; then
      ok "Critical field mutation guard (REQUIRED_KEYS ownership)"
    else
      fail "Critical field mutation guard" "see /tmp/rf_critfield.out"
      tail -20 /tmp/rf_critfield.out || true
    fi
  else
    skip "Critical field mutation guard (node not available)"
  fi
else
  skip "Critical field mutation guard (--quick mode)"
fi

# ── 7kk. Regression Naming Convention ─────────────────────────────────────────
hdr "Regression Naming Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/regression_naming_guard.mjs >/tmp/rf_regression_naming.out 2>&1; then
      ok "Regression naming guard (test_regression_NNN_field_cause)"
    else
      fail "Regression naming guard" "see /tmp/rf_regression_naming.out"
      tail -20 /tmp/rf_regression_naming.out || true
    fi
  else
    skip "Regression naming guard (node not available)"
  fi
else
  skip "Regression naming guard (--quick mode)"
fi

# ── 7n. Geometric Assertions (#63) ────────────────────────────────────────────
hdr "Geometric Assertions Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/geometric_assertions_guard.mjs >/tmp/rf_geometric_assertions.out 2>&1; then
      ok "Geometric assertions guard (principle #63)"
    else
      fail "Geometric assertions guard (principle #63)" "see /tmp/rf_geometric_assertions.out"
      tail -20 /tmp/rf_geometric_assertions.out || true
    fi
  else
    skip "Geometric assertions guard (node not available)"
  fi
else
  skip "Geometric assertions guard (--quick mode)"
fi

# ── 7o. Reload Storm Safety (#65) ─────────────────────────────────────────────
hdr "Reload Storm Guard"

if [[ "$QUICK" != "--quick" ]]; then
  cd "$ROOT"
  if command -v node &>/dev/null; then
    if node audit/reload_storm_guard.mjs >/tmp/rf_reload_storm.out 2>&1; then
      ok "Reload storm guard (principle #65)"
    else
      fail "Reload storm guard (principle #65)" "see /tmp/rf_reload_storm.out"
      tail -20 /tmp/rf_reload_storm.out || true
    fi
  else
    skip "Reload storm guard (node not available)"
  fi
else
  skip "Reload storm guard (--quick mode)"
fi

# ── 8. Designer HTML checks ────────────────────────────────────────────────────
hdr "Designer HTML"

DESIGNER="$ROOT/designer/crystal-reports-designer-v4.html"
if [[ -f "$DESIGNER" ]]; then
  html_check() {
    local label="$1" pattern="$2" should_exist="${3:-yes}"
    if grep -q "$pattern" "$DESIGNER"; then
      [[ "$should_exist" == "yes" ]] && ok "$label" || fail "$label" "should NOT be present"
    else
      [[ "$should_exist" == "no" ]]  && ok "$label" || fail "$label" "pattern not found"
    fi
  }

  html_check "Canonical CSS entrypoint"      "/designer/styles/index.css"
  html_check "No inline <style>"             "<style" no
  html_check "No inline style="              "style=" no
  html_check "No inline onclick="            "onclick=" no
  html_check "No inline onchange="           "onchange=" no
  html_check "No inline oninput="            "oninput=" no
  html_check "No inline function declarations" "function " no
  html_check "No inline engine declarations" "const .*Engine" no
  html_check "No inline document listeners"  "document.addEventListener" no
  html_check "No inline window listeners"    "window.addEventListener" no
  html_check "No inline command dispatcher"  "handleAction" no

  OPENS=$(grep -c '<script' "$DESIGNER" 2>/dev/null || echo 0)
  CLOSES=$(grep -c '</script>' "$DESIGNER" 2>/dev/null || echo 0)
  [[ "$OPENS" -eq "$CLOSES" ]] && ok "Script tags balanced ($OPENS)" || \
    fail "Script tags balanced" "open=$OPENS close=$CLOSES"

  HTML_BYTES=$(wc -c < "$DESIGNER" | tr -d ' ')
  if [[ "$HTML_BYTES" -le 30000 ]]; then
    ok "Shell HTML below 30KB threshold ($HTML_BYTES bytes)"
  else
    fail "Shell HTML below 30KB threshold" "actual=$HTML_BYTES"
  fi
else
  fail "Designer HTML" "file not found: designer/crystal-reports-designer-v4.html"
fi

# ── 8. Formula engine Python checks ───────────────────────────────────────────
hdr "Formula Engine"

cd "$ROOT"
python3 << 'PYEOF'
import sys
sys.path.insert(0, '.')
from reportforge.core.render.expressions.formula_parser import FormulaParser
from reportforge.core.render.expressions.eval_context import EvalContext
from reportforge.core.render.expressions.cr_functions import call, is_cr_function

tests = [
    ("Today()", lambda r: r is not None),
    ("Now()", lambda r: r is not None),
    ("IIf(1 > 0, 'yes', 'no')", lambda r: r == 'yes'),
    ('ToText(3.14, 2)', lambda r: '3.14' in str(r)),
    ("DateAdd('m', 1, #2024-01-15#)", lambda r: r is not None),
    ("Pi()", lambda r: abs(r - 3.14159) < 0.01),
]

from reportforge.core.render.expressions.eval_context import EvalContext

ok = 0; fail = 0
ctx = EvalContext()
for expr, check in tests:
    try:
        result = ctx.eval_formula(expr)
        if check(result):
            print(f"  ✅ {expr} → {result}")
            ok += 1
        else:
            print(f"  ❌ {expr} → {result} (check failed)")
            fail += 1
    except Exception as e:
        print(f"  ❌ {expr} → ERROR: {e}")
        fail += 1

sys.exit(0 if fail == 0 else 1)
PYEOF
[[ $? -eq 0 ]] && ok "Formula engine eval checks" || fail "Formula engine eval checks"

# ── Summary ────────────────────────────────────────────────────────────────────
hdr "Summary"
TOTAL=$((PASS+FAIL+SKIP))
echo -e "  Total checks : $TOTAL"
echo -e "  ${GREEN}Passed${NC}        : $PASS"
echo -e "  ${RED}Failed${NC}        : $FAIL"
echo -e "  ${YELLOW}Skipped${NC}       : $SKIP"

if [[ "$JSON_OUT" == "--json" ]]; then
  echo '{'
  echo "  \"pass\": $PASS,"
  echo "  \"fail\": $FAIL,"
  echo "  \"skip\": $SKIP,"
  echo "  \"results\": ["
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r status label msg <<< "$r"
    echo "    {\"status\":\"$status\",\"label\":\"${label//\"/\\\"}\",\"msg\":\"${msg//\"/\\\"}\"},"
  done
  echo "  ]"
  echo '}'
fi

if [[ $FAIL -gt 0 ]]; then
  echo -e "\n${RED}${BOLD}VALIDATION FAILED — $FAIL check(s) did not pass.${NC}"
  exit 1
else
  echo -e "\n${GREEN}${BOLD}✅ VALIDATION PASSED${NC}"
  exit 0
fi
