from __future__ import annotations

from typing import Any

try:
    from sqlalchemy import create_engine
    HAS_SA = True
except ImportError:
    HAS_SA = False

_ENGINES: dict[str, Any] = {}


def get_engine(url: str):
    if not HAS_SA:
        raise RuntimeError("SQLAlchemy not installed. Run: pip install sqlalchemy")
    if url not in _ENGINES:
        connect_args = {"connect_timeout": 10} if "postgresql" in url or "mysql" in url else {}
        _ENGINES[url] = create_engine(
            url,
            pool_size=5,
            max_overflow=10,
            pool_pre_ping=True,
            connect_args=connect_args,
        )
    return _ENGINES[url]
