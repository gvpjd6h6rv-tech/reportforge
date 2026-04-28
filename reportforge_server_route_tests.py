from __future__ import annotations

import json
import re
import subprocess
import time
from pathlib import Path
from reportforge_server_http_utils import _json

_ROOT = Path(__file__).parent
_ANSI_RE = re.compile(r'(?:\x1B|\u001B|\u009B)\[[0-?]*[ -/]*[@-~]')

def _clean_output(text: str) -> str:
    return _ANSI_RE.sub('', str(text or ''))

def _run(cmd: list[str], timeout_s: int):
    t0 = time.perf_counter()
    try:
        p = subprocess.run(cmd, cwd=_ROOT, text=True, capture_output=True, timeout=timeout_s)
        return {
            "ok": p.returncode == 0,
            "code": p.returncode,
            "durationMs": round((time.perf_counter() - t0) * 1000),
            "cmd": " ".join(cmd),
            "stdout": _clean_output(p.stdout)[-12000:],
            "stderr": _clean_output(p.stderr)[-12000:],
        }
    except subprocess.TimeoutExpired as e:
        return {
            "ok": False,
            "code": 124,
            "durationMs": round((time.perf_counter() - t0) * 1000),
            "cmd": " ".join(cmd),
            "stdout": _clean_output(e.stdout)[-12000:] if isinstance(e.stdout, str) else "",
            "stderr": "timeout expired",
        }

def _post_tests_quick(handler, body: dict):
    _json(handler, _run(["bash", "validate_repo.sh", "--quick"], 180))

def _post_tests_full(handler, body: dict):
    _json(handler, _run(["bash", "validate_repo.sh"], 1200))

def _get_tests_stream(handler, kind: str):
    cmd = ["bash", "validate_repo.sh", "--quick"] if kind == "quick" else ["bash", "validate_repo.sh"]

    handler.send_response(200)
    handler.send_header("Content-Type", "text/plain; charset=utf-8")
    handler.send_header("Cache-Control", "no-cache")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()

    p = subprocess.Popen(
        cmd,
        cwd=_ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
    )

    handler.wfile.write(("RUNNING: " + " ".join(cmd) + "\n\n").encode())
    handler.wfile.flush()

    for line in p.stdout:
        handler.wfile.write(_clean_output(line).encode("utf-8", "replace"))
        handler.wfile.flush()

    code = p.wait()
    handler.wfile.write(f"\n\nEXIT CODE: {code}\n".encode())
    handler.wfile.flush()
