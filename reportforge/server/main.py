# server/main.py
# ReportForge server entrypoint.
# Usage:
#   uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
#   python server/main.py  (dev mode)
import logging, os, sys
from pathlib import Path

# Ensure project root is on path
_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT))

logging.basicConfig(
    level   = logging.INFO,
    format  = "%(asctime)s  %(levelname)-7s  %(name)s  %(message)s",
    datefmt = "%H:%M:%S",
)
logger = logging.getLogger("reportforge")

from reportforge.server.api import create_app

try:
    app = create_app()
except ImportError as _e:
    # FastAPI not installed — app is None; uvicorn will not be invoked
    import logging as _logging
    _logging.getLogger("reportforge").warning(
        "FastAPI unavailable (%s). "
        "Install with: pip install fastapi uvicorn python-multipart", _e
    )
    app = None  # type: ignore

if __name__ == "__main__":
    try:
        import uvicorn
    except ImportError:
        print("uvicorn not installed. Run: pip install uvicorn")
        sys.exit(1)

    host = os.environ.get("RF_HOST", "0.0.0.0")
    port = int(os.environ.get("RF_PORT", "8000"))
    workers = int(os.environ.get("RF_WORKERS", "1"))
    reload  = os.environ.get("RF_RELOAD", "false").lower() == "true"

    logger.info("🚀  ReportForge API starting on http://%s:%d", host, port)
    uvicorn.run(
        "server.main:app",
        host    = host,
        port    = port,
        workers = workers,
        reload  = reload,
        log_level = "info",
    )
