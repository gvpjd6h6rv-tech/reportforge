#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

required_phrases=(
  "Baseline A"
  "Scenario B"
  "A/B diff"
  "Evidence"
  "Regression test"
  "Residual risk"
)

fail() {
  printf 'debugging-policy: %s\n' "$1" >&2
  exit 1
}

check_file_contains() {
  local file="$1"
  [[ -f "$file" ]] || fail "missing file: $file"
  for phrase in "${required_phrases[@]}"; do
    if ! grep -Fqi -- "$phrase" "$file"; then
      fail "missing phrase '$phrase' in $file"
    fi
  done
  if ! grep -Eq -- 'Evidence Level: L[3-4]' "$file"; then
    fail "missing evidence level L3-L4 marker in $file"
  fi
}

template_lc="$ROOT/.github/pull_request_template.md"
template_uc="$ROOT/.github/PULL_REQUEST_TEMPLATE.md"

check_file_contains "$template_lc"
if [[ -f "$template_uc" ]]; then
  check_file_contains "$template_uc"
fi

branch_name="${BRANCH_NAME:-${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-}}}"
if [[ -z "$branch_name" ]]; then
  branch_name="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
fi

pr_body=""
if [[ -n "${PR_BODY_FILE:-}" && -f "${PR_BODY_FILE:-}" ]]; then
  pr_body="$(cat "$PR_BODY_FILE")"
elif [[ -n "${PR_BODY:-}" ]]; then
  pr_body="$PR_BODY"
fi

case "$branch_name" in
  bugfix/*|fix/*)
    ticket="${branch_name#bugfix/}"
    ticket="${ticket#fix/}"
    ticket="${ticket//\//-}"
    ticket="${ticket// /-}"
    ticket="${ticket%.md}"

    report_file="$ROOT/docs/debug-reports/$ticket.md"
    check_file_contains "$report_file"

    if [[ -z "$pr_body" ]]; then
      fail "bugfix/fix branches must include PR body evidence sections"
    fi
    for phrase in "${required_phrases[@]}"; do
      if ! grep -Fqi -- "$phrase" <<<"$pr_body"; then
        fail "missing phrase '$phrase' in PR body for bugfix/fix branch '$branch_name'"
      fi
    done
    if ! grep -Eq -- 'Evidence Level: L[3-4]' <<<"$pr_body"; then
      fail "missing evidence level L3-L4 marker in PR body for bugfix/fix branch '$branch_name'"
    fi
    ;;
esac

printf 'debugging-policy: ok\n'
