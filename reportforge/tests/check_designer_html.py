#!/usr/bin/env python3
"""Check designer HTML for Enterprise CSS and Dual UI requirements."""
import sys, os

html_path = os.environ.get('DESIGNER_PATH', '/tmp/rf_des_check.html')
try:
    src = open(html_path).read()
except FileNotFoundError:
    print(f"File not found: {html_path}")
    sys.exit(1)

checks = [
    ("ReportForge" in src or "Crystal Reports" in src, "GET / → designer HTML (title)"),
    ('data-ui="classic"' in src,    "GET / → Classic UI default (data-ui=classic)"),
    ('data-ui' in src and 'modern' in src, "GET / → Modern UI CSS present"),
    ('rf-accent' in src,            "GET / → --rf-* design tokens"),
    ('@layer reset,tokens,base' in src, "GET / → @layer CSS architecture"),
]
fails = 0
for ok, label in checks:
    if ok:
        print(f"  \033[0;32m✅ PASS\033[0m  {label}")
    else:
        print(f"  \033[0;31m❌ FAIL\033[0m  {label}")
        fails += 1
sys.exit(fails)
