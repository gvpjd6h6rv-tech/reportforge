"""
coercion_logger.py — Coercion event logger for ReportForge.

Captures type-mismatch events during formula evaluation and field resolution.
Silent in production (disabled by default); enabled only in debug mode.

Usage:
    from .coercion_logger import coercion_logger

    coercion_logger.enable()
    coercion_logger.record_mismatch(
        value="abc", expected_type="number",
        field="item.precio", result=0,
    )
    events = coercion_logger.events()
    coercion_logger.disable()
    coercion_logger.clear()
"""
from __future__ import annotations

import inspect
import threading
from dataclasses import dataclass, field as dc_field
from typing import Any, List, Optional


@dataclass
class CoercionEvent:
    """Single coercion mismatch record — all fields required for replay."""
    file:          str
    line:          int
    module:        str          # __name__ of the calling module
    function_name: str          # function or method where mismatch occurred
    field:         str          # dot-path or "" if unknown
    value_repr:    str          # repr(value)[:200]
    expected_type: str
    received_type: str
    result_repr:   str          # repr(result)[:200]


class CoercionLogger:
    """
    Thread-safe singleton logger for coercion mismatches.
    Disabled by default — call enable() to activate.
    Max 200 events; oldest evicted when full (ring buffer).
    """

    _instance: Optional["CoercionLogger"] = None
    _lock = threading.Lock()
    MAX_EVENTS = 200

    def __init__(self) -> None:
        self._enabled = False
        self._events: List[CoercionEvent] = []
        self._event_lock = threading.Lock()

    # ── Singleton ──────────────────────────────────────────────────

    @classmethod
    def get(cls) -> "CoercionLogger":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    # ── Lifecycle ─────────────────────────────────────────────────

    def enable(self) -> None:
        self._enabled = True

    def disable(self) -> None:
        self._enabled = False

    @property
    def is_enabled(self) -> bool:
        return self._enabled

    def clear(self) -> None:
        with self._event_lock:
            self._events.clear()

    # ── Recording ─────────────────────────────────────────────────

    def record_mismatch(
        self,
        *,
        value: Any,
        expected_type: str,
        result: Any = None,
        field: str = "",
        _depth: int = 1,
    ) -> None:
        """
        Record a coercion mismatch event.

        Parameters
        ----------
        value         : The original value that could not be coerced cleanly.
        expected_type : The type that was attempted (e.g. "number", "date").
        result        : The fallback value that was returned (e.g. 0, None).
        field         : The field path being resolved (optional context).
        _depth        : Stack depth offset; 1 = direct caller of this method.
        """
        if not self._enabled:
            return
        try:
            frame_info = inspect.stack()[_depth + 1]
            file = frame_info.filename
            line = frame_info.lineno
            module = frame_info.frame.f_globals.get("__name__", "<unknown>")
            function_name = frame_info.function or "<unknown>"
        except (IndexError, AttributeError):
            file = "<unknown>"
            line = 0
            module = "<unknown>"
            function_name = "<unknown>"

        evt = CoercionEvent(
            file=file,
            line=line,
            module=module,
            function_name=function_name,
            field=field or "",
            value_repr=repr(value)[:200],
            expected_type=expected_type,
            received_type=type(value).__name__,
            result_repr=repr(result)[:200],
        )
        with self._event_lock:
            max_events = getattr(self, '_max', self.MAX_EVENTS)
            if len(self._events) >= max_events:
                self._events.pop(0)
            self._events.append(evt)

    # ── Inspection ────────────────────────────────────────────────

    def events(self) -> List[CoercionEvent]:
        with self._event_lock:
            return list(self._events)

    def last(self) -> Optional[CoercionEvent]:
        with self._event_lock:
            return self._events[-1] if self._events else None

    def count(self) -> int:
        with self._event_lock:
            return len(self._events)


# Module-level singleton — import this directly.
coercion_logger = CoercionLogger.get()
