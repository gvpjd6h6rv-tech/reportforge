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
check_dir  "reportforge/core/render/engines"
check_dir  "reportforge/core/render/export"
check_dir  "reportforge/server"
check_dir  "reportforge/tests"
check_dir  "reportforge/designer"
check_dir  "reportforge/designer/js"
check_dir  "reportforge/designer/js/core"
check_dir  "reportforge/designer/js/classic"
check_dir  "reportforge/designer/js/modules"
check_dir  "reportforge/designer/js/ux"
check_dir  "designer"

check_file "reportforge_server.py"
check_file "reportforge/core/render/expressions/formula_parser.py"
check_file "reportforge/core/render/expressions/eval_context.py"
check_file "reportforge/core/render/expressions/evaluator.py"
check_file "reportforge/core/render/expressions/cr_functions.py"
check_file "reportforge/core/render/expressions/aggregator.py"
check_file "reportforge/designer/js/core/formula-engine.js"
check_file "reportforge/designer/js/core/document-model.js"
check_file "reportforge/designer/js/core/history.js"
check_file "reportforge/designer/js/core/layout-tools.js"
check_file "reportforge/designer/js/core/render-pipeline.js"
check_file "reportforge/designer/js/core/selection.js"
check_file "designer/crystal-reports-designer-v3.html"

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
  done < <(find "$ROOT/reportforge/designer/js" -name "*.js" -print0)
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
  check_endpoint "GET / pointer events" "http://127.0.0.1:$PORT/" 'pointerdown'

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
    if node reportforge/tests/run_runtime_regression.mjs >/tmp/rf_runtime_regression.out 2>&1; then
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

# ── 8. Designer HTML checks ────────────────────────────────────────────────────
hdr "Designer HTML"

DESIGNER="$ROOT/designer/crystal-reports-designer-v3.html"
if [[ -f "$DESIGNER" ]]; then
  html_check() {
    local label="$1" pattern="$2" should_exist="${3:-yes}"
    if grep -q "$pattern" "$DESIGNER"; then
      [[ "$should_exist" == "yes" ]] && ok "$label" || fail "$label" "should NOT be present"
    else
      [[ "$should_exist" == "no" ]]  && ok "$label" || fail "$label" "pattern not found"
    fi
  }

  html_check "FormulaEngine present"         "FormulaEngine"
  html_check "FormulaEditorDialog present"   "FormulaEditorDialog"
  html_check "Pointer events (pointerdown)"  "pointerdown"
  html_check "RAF batching"                  "requestAnimationFrame"
  html_check "content-visibility CSS"        "content-visibility"
  html_check "CSS contain"                   "contain:"
  html_check "No mousedown listeners"        "addEventListener('mousedown'" no
  html_check "No mousemove listeners"        "addEventListener('mousemove'" no
  html_check "No innerHTML= destruction"     "handles-layer.innerHTML=''"    no
  html_check "Script tags balanced" "" # handled below

  OPENS=$(grep -c '<script' "$DESIGNER" 2>/dev/null || echo 0)
  CLOSES=$(grep -c '</script>' "$DESIGNER" 2>/dev/null || echo 0)
  [[ "$OPENS" -eq "$CLOSES" ]] && ok "Script tags balanced ($OPENS)" || \
    fail "Script tags balanced" "open=$OPENS close=$CLOSES"
else
  fail "Designer HTML" "file not found: designer/crystal-reports-designer-v3.html"
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
