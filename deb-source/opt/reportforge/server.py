#!/usr/bin/env python3
"""
ReportForge — Python app server
Serves the designer on localhost and launches the browser in app mode.
"""

import os
import sys
import signal
import socket
import threading
import subprocess
import time
import json
import http.server
import urllib.parse
from pathlib import Path

# ── Paths ──────────────────────────────────────────────
APP_DIR = Path(__file__).parent.resolve()
WWW_DIR = APP_DIR / "www"
DATA_DIR = Path.home() / ".local" / "share" / "reportforge"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# ── Find a free port ───────────────────────────────────
def find_free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]

PORT = find_free_port()
LOCK_FILE = DATA_DIR / "server.lock"

# ── HTTP Handler ───────────────────────────────────────
class ReportForgeHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WWW_DIR), **kwargs)

    def log_message(self, fmt, *args):
        pass  # Suppress access logs

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        # API: list saved reports
        if parsed.path == '/api/reports':
            reports = []
            for f in DATA_DIR.glob("*.rfd.json"):
                try:
                    with open(f) as fp:
                        data = json.load(fp)
                    reports.append({
                        "name": f.stem.replace(".rfd",""),
                        "file": f.name,
                        "modified": f.stat().st_mtime,
                    })
                except Exception:
                    pass
            self._json(200, reports)
            return

        # API: load report
        if parsed.path.startswith('/api/report/'):
            name = urllib.parse.unquote(parsed.path.split('/')[-1])
            target = DATA_DIR / f"{name}.rfd.json"
            if target.exists():
                self._json(200, json.loads(target.read_text()))
            else:
                self._json(404, {"error": "Not found"})
            return

        # API: server info
        if parsed.path == '/api/info':
            self._json(200, {
                "version": "1.0.0",
                "platform": sys.platform,
                "dataDir": str(DATA_DIR),
            })
            return

        # Static files
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)

        # API: save report
        if parsed.path == '/api/save':
            try:
                data = json.loads(body)
                name = data.get("name", "untitled")
                # Sanitize filename
                safe = "".join(c for c in name if c.isalnum() or c in " -_").strip() or "untitled"
                target = DATA_DIR / f"{safe}.rfd.json"
                target.write_text(json.dumps(data, indent=2, ensure_ascii=False))
                self._json(200, {"ok": True, "file": target.name})
            except Exception as e:
                self._json(500, {"error": str(e)})
            return

        # API: quit app
        if parsed.path == '/api/quit':
            self._json(200, {"ok": True})
            threading.Thread(target=_shutdown, daemon=True).start()
            return

        self._json(404, {"error": "Not found"})

    def _json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type",   "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control",  "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()


# ── Shutdown ───────────────────────────────────────────
_browser_proc = None

def _shutdown():
    global _browser_proc
    if LOCK_FILE.exists():
        LOCK_FILE.unlink(missing_ok=True)
    if _browser_proc and _browser_proc.poll() is None:
        _browser_proc.terminate()
    os.kill(os.getpid(), signal.SIGTERM)


# ── Browser launcher ───────────────────────────────────
BROWSERS = [
    # Chromium family — supports --app for frameless window
    ["chromium-browser",  "--app={url}", "--disable-infobars", "--no-first-run"],
    ["chromium",          "--app={url}", "--disable-infobars", "--no-first-run"],
    ["google-chrome",     "--app={url}", "--disable-infobars", "--no-first-run"],
    ["google-chrome-stable", "--app={url}", "--disable-infobars"],
    ["brave-browser",     "--app={url}", "--disable-infobars"],
    # Firefox — kiosk mode
    ["firefox",           "--kiosk", "{url}"],
    ["firefox-esr",       "--kiosk", "{url}"],
    # Fallback: xdg-open
    ["xdg-open",          "{url}"],
]

def launch_browser(url: str):
    global _browser_proc
    for cmd_template in BROWSERS:
        browser = cmd_template[0]
        # Check if browser exists
        check = subprocess.run(
            ["which", browser],
            capture_output=True, text=True
        )
        if check.returncode != 0:
            continue

        args = [browser] + [
            a.replace("{url}", url) for a in cmd_template[1:]
        ]
        try:
            _browser_proc = subprocess.Popen(
                args,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            print(f"[ReportForge] Launched: {' '.join(args[:2])}")
            return True
        except Exception as e:
            print(f"[ReportForge] Failed to launch {browser}: {e}")
            continue

    print("[ReportForge] Warning: No browser found. Open manually:", url)
    return False


# ── Prevent duplicate instances ────────────────────────
def check_already_running():
    if LOCK_FILE.exists():
        try:
            old_port = int(LOCK_FILE.read_text().strip())
            # Try to connect
            with socket.create_connection(("127.0.0.1", old_port), timeout=1):
                print(f"[ReportForge] Already running on port {old_port}")
                # Just open browser to existing instance
                launch_browser(f"http://127.0.0.1:{old_port}")
                sys.exit(0)
        except Exception:
            LOCK_FILE.unlink(missing_ok=True)

def write_lock():
    LOCK_FILE.write_text(str(PORT))


# ── Main ───────────────────────────────────────────────
def main():
    check_already_running()
    write_lock()

    # Handle signals
    signal.signal(signal.SIGTERM, lambda *_: _shutdown())
    signal.signal(signal.SIGINT,  lambda *_: _shutdown())

    # Start HTTP server
    server = http.server.ThreadingHTTPServer(
        ("127.0.0.1", PORT),
        ReportForgeHandler
    )

    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    print(f"[ReportForge] Server running at http://127.0.0.1:{PORT}")

    # Small delay to ensure server is ready
    time.sleep(0.3)

    # Launch browser
    url = f"http://127.0.0.1:{PORT}"
    if not launch_browser(url):
        print("[ReportForge] Open your browser at:", url)

    # Wait for browser to exit (if we have a handle)
    try:
        if _browser_proc:
            _browser_proc.wait()
        else:
            # No browser handle — wait indefinitely (user closes terminal)
            server_thread.join()
    except KeyboardInterrupt:
        pass
    finally:
        _shutdown()


if __name__ == "__main__":
    main()
