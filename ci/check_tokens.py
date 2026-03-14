
import json, sys
from pathlib import Path
t = json.load(open("reportforge/designer/js/core/tokens.json"))
assert t["stats"]["count"] >= 90, f"Too few tokens: {t["stats"]["count"]}"
assert len(t["stats"]["layers"]) >= 16, "Layer count low"
assert "getCanvasRect" not in t  # tokens file, not geometry
print(f"OK: {t["stats"]["count"]} tokens, {len(t["stats"]["layers"])} layers")
