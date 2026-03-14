
import re, sys, json
from pathlib import Path
h = Path("designer/crystal-reports-designer-v4.html").read_text()
css = re.search(r"<style>(.*?)</style>", h, re.DOTALL).group(1)
REQUIRED_LAYERS = ["reset","tokens","base","layout","chrome","canvas","elements",
                   "geometry","selection","panels","menus","components","utilities",
                   "classic","modern","overrides"]
m = re.search(r"@layer\s+([\w,\s]+);", css)
if not m: print("FAIL: No @layer"); sys.exit(1)
declared = [l.strip() for l in m.group(1).split(",")]
missing = [l for l in REQUIRED_LAYERS if l not in declared]
if missing: print(f"FAIL: Missing layers {missing}"); sys.exit(1)
gi, si = declared.index("geometry"), declared.index("selection")
if gi >= si: print("FAIL: geometry must precede selection"); sys.exit(1)
# Token parity
css_tokens = set(re.findall(r"--rf-[\w-]+", css))
json_tokens = set(json.load(open("reportforge/designer/js/core/tokens.json"))["tokens"].keys())
orphans = json_tokens - css_tokens
if orphans: print(f"FAIL: orphan tokens in JSON: {list(orphans)[:3]}"); sys.exit(1)
# Pillars
checks = [
    ("spring-physics",   "cubic-bezier" in css),
    ("logical-props",    "margin-inline" in css),
    ("container-queries","@container" in css),
    ("fluid-math",       "clamp(" in css),
    ("invalidation",     "will-change" in css or "content-visibility" in css),
    ("geometry-tokens",  "--geo-canvas-w" in css),
    ("spring-token",     "--rf-transition-fast" in css),
]
for label, ok in checks:
    if not ok: print(f"FAIL: {label}"); sys.exit(1)
print(f"OK: {len(declared)} layers, {len(css_tokens)} tokens, all pillars verified")
