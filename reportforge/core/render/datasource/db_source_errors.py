from __future__ import annotations


class DbSourceError(RuntimeError):
    pass


class DbConnectionError(DbSourceError):
    """Raised when the datasource cannot be reached."""
    pass


class DbTimeoutError(DbSourceError):
    """Raised when a query exceeds the configured timeout."""
    pass


class DbDocNotFoundError(DbSourceError):
    """Raised by a mapper when the requested document does not exist."""
    pass
