"""
rate_limit.py — Principle #67 Rate-limit Safe Shell

Sliding-window in-memory rate limiter for the ReportForge API.
Protects against request bursts that would exhaust render threads or memory.

Design:
  - Per-IP sliding window counter (1-minute window by default).
  - Returns HTTP 429 with Retry-After header when limit exceeded.
  - X-Rate-Limit-* headers on every response.
  - State is in-process (not distributed); sufficient for single-node deployments.
  - Configurable via RF_RATE_LIMIT_RPM env var (default: 60 requests/minute).
  - Exempt paths can bypass the limiter (e.g. /health for load-balancer probes).
"""

from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from typing import Callable

_LIMIT_RPM = int(os.environ.get("RF_RATE_LIMIT_RPM", "60"))
_WINDOW_SECONDS = 60
_EXEMPT_PATHS = frozenset({"/health", "/docs", "/redoc", "/openapi.json"})


class _SlidingWindowCounter:
    """Thread-unsafe sliding window — safe for single-threaded async event loop."""

    def __init__(self, limit: int, window_seconds: float) -> None:
        self._limit = limit
        self._window = window_seconds
        # key → deque of request timestamps (float, seconds)
        self._windows: dict[str, deque] = defaultdict(deque)

    def is_allowed(self, key: str) -> tuple[bool, int, float]:
        """
        Check whether a new request from *key* is within the rate limit.

        Returns:
            (allowed, remaining, retry_after_seconds)
        """
        now = time.monotonic()
        cutoff = now - self._window
        dq = self._windows[key]

        # Evict expired timestamps.
        while dq and dq[0] < cutoff:
            dq.popleft()

        if len(dq) >= self._limit:
            oldest = dq[0]
            retry_after = self._window - (now - oldest)
            return False, 0, max(0.0, retry_after)

        dq.append(now)
        remaining = self._limit - len(dq)
        return True, remaining, 0.0

    def reset(self, key: str) -> None:
        self._windows.pop(key, None)


_counter = _SlidingWindowCounter(_LIMIT_RPM, _WINDOW_SECONDS)


def make_rate_limit_middleware(limit_rpm: int = _LIMIT_RPM) -> Callable:
    """
    Returns an ASGI middleware function ready for app.middleware("http").

    Usage in api.py:
        from reportforge.server.rate_limit import make_rate_limit_middleware
        @app.middleware("http")
        async def _rate_limit(request, call_next):
            return await make_rate_limit_middleware()(request, call_next)

    Or the simpler form used in create_app():
        app.middleware("http")(_rate_limiter)
    """
    counter = _SlidingWindowCounter(limit_rpm, _WINDOW_SECONDS)

    async def _middleware(request, call_next):
        # limit_rpm=0 means unlimited — pass-through mode for tests and dev.
        if limit_rpm <= 0:
            return await call_next(request)

        path = request.url.path
        if path in _EXEMPT_PATHS:
            return await call_next(request)

        client_ip = (request.client.host if request.client else "unknown")
        allowed, remaining, retry_after = counter.is_allowed(client_ip)

        if not allowed:
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=429,
                content={
                    "error": "rate_limit_exceeded",
                    "detail": f"Rate limit of {limit_rpm} requests/minute exceeded.",
                    "retry_after_seconds": round(retry_after, 1),
                },
                headers={
                    "Retry-After": str(int(retry_after) + 1),
                    "X-Rate-Limit-Limit": str(limit_rpm),
                    "X-Rate-Limit-Remaining": "0",
                    "X-Rate-Limit-Reset": str(int(time.time()) + int(retry_after) + 1),
                },
            )

        response = await call_next(request)
        response.headers["X-Rate-Limit-Limit"] = str(limit_rpm)
        response.headers["X-Rate-Limit-Remaining"] = str(remaining)
        return response

    return _middleware
