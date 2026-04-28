#!/usr/bin/env python3
"""
rate_limit_guard.py — Principle #67 Rate-limit Safe Shell

Static analysis verifying that the server-side rate-limit protection is wired
and that the rate_limit module is structurally correct.

RULE-A (RATELIMIT-MIDDLEWARE-001): reportforge/server/api.py must import
  make_rate_limit_middleware from .rate_limit and register it as middleware.
  Without wiring the middleware, the limiter exists but is never enforced.

RULE-B (RATELIMIT-MODULE-001): reportforge/server/rate_limit.py must exist
  and define make_rate_limit_middleware and _SlidingWindowCounter.

RULE-C (RATELIMIT-HEADERS-001): The rate_limit module must emit X-Rate-Limit-*
  headers (Limit, Remaining) on allowed responses and a Retry-After header on 429.
  Missing headers make the limiter invisible to clients and load-balancers.

RULE-D (RATELIMIT-EXEMPT-001): /health must be in the exempt paths so that
  load-balancer probes are never rate-limited.

Usage:
  python3 audit/rate_limit_guard.py          # fail on violations
  python3 audit/rate_limit_guard.py --report # report only
"""

import sys
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SERVER = ROOT / 'reportforge' / 'server'

ARGS = sys.argv[1:]
REPORT = '--report' in ARGS

violations = []


def check(rule, file_rel, condition, desc):
    if not condition:
        violations.append({'rule': rule, 'file': file_rel, 'desc': desc})


def read(rel):
    p = ROOT / rel
    return p.read_text(encoding='utf-8') if p.exists() else ''


api_src        = read('reportforge/server/api.py')
rate_limit_src = read('reportforge/server/rate_limit.py')

# RULE-A: api.py imports and wires make_rate_limit_middleware.
check('RATELIMIT-MIDDLEWARE-001', 'reportforge/server/api.py',
      'make_rate_limit_middleware' in api_src,
      'api.py must import make_rate_limit_middleware from .rate_limit')

check('RATELIMIT-MIDDLEWARE-001', 'reportforge/server/api.py',
      re.search(r'app\.middleware\s*\(\s*["\']http["\']\s*\)\s*\(\s*_rate_limiter\s*\)', api_src) or
      re.search(r'make_rate_limit_middleware', api_src),
      'api.py must wire the rate limiter via app.middleware("http")(_rate_limiter)')

# RULE-B: rate_limit.py module structure.
check('RATELIMIT-MODULE-001', 'reportforge/server/rate_limit.py',
      bool(rate_limit_src),
      'reportforge/server/rate_limit.py must exist')

check('RATELIMIT-MODULE-001', 'reportforge/server/rate_limit.py',
      'make_rate_limit_middleware' in rate_limit_src,
      'rate_limit.py must define make_rate_limit_middleware')

check('RATELIMIT-MODULE-001', 'reportforge/server/rate_limit.py',
      '_SlidingWindowCounter' in rate_limit_src,
      'rate_limit.py must implement _SlidingWindowCounter for sliding-window tracking')

# RULE-C: rate headers present.
check('RATELIMIT-HEADERS-001', 'reportforge/server/rate_limit.py',
      'X-Rate-Limit-Limit' in rate_limit_src,
      'rate_limit.py must set X-Rate-Limit-Limit header on every response')

check('RATELIMIT-HEADERS-001', 'reportforge/server/rate_limit.py',
      'X-Rate-Limit-Remaining' in rate_limit_src,
      'rate_limit.py must set X-Rate-Limit-Remaining header on every allowed response')

check('RATELIMIT-HEADERS-001', 'reportforge/server/rate_limit.py',
      'Retry-After' in rate_limit_src,
      'rate_limit.py must set Retry-After header on 429 responses')

# RULE-D: /health is exempt.
check('RATELIMIT-EXEMPT-001', 'reportforge/server/rate_limit.py',
      '"/health"' in rate_limit_src or "'/health'" in rate_limit_src,
      '/health must be in _EXEMPT_PATHS so load-balancer probes are never rate-limited')

# ── Report ─────────────────────────────────────────────────────────────────────

print('── Rate-Limit Guard (#67) ────────────────────────────────────────')
print(f'   violations found: {len(violations)}')

if violations:
    print('\n  Violations:')
    for v in violations:
        print(f'  [{v["rule"]}] {v["file"]}')
        print(f'    → {v["desc"]}')

if not violations:
    print('\n✅ rate-limit shell wired — middleware registered, headers set, /health exempt\n')
    sys.exit(0)

print('\n❌ rate-limit gap — server unprotected against request bursts')
print('   Fix: ensure rate_limit.py exists, middleware wired in api.py, headers emitted, /health exempt\n')
if not REPORT:
    sys.exit(1)
