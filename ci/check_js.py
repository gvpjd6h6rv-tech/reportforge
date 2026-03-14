
import subprocess, re, sys
from pathlib import Path
h = Path("designer/crystal-reports-designer-v4.html").read_text()
scripts = re.findall(r"<script[^>]*>(.*?)</script>", h, re.DOTALL)
for i, s in enumerate(scripts):
    r = subprocess.run(["node","--check"], input=s, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"FAIL Script {i+1}: {r.stderr.strip()[:120]}")
        sys.exit(1)
print(f"OK: {len(scripts)} scripts valid")
