"""
connections_store.py — encrypted local persistence for SQL datasource credentials.

Files (never in git, chmod 600):
  .conn_key               — Fernet key (generated on first use)
  .connections.enc.json   — {alias: {type, host, port, database, username, password_enc}}

Password is never stored in plaintext on disk. If the key is lost, re-enter credentials
via the UI — same behavior as before this module existed.
"""
from __future__ import annotations

import json
import logging
import os
import stat
from pathlib import Path

_log = logging.getLogger(__name__)

_SERVER_DIR = Path(__file__).parent
_KEY_PATH = _SERVER_DIR / ".conn_key"
_STORE_PATH = _SERVER_DIR / ".connections.enc.json"


def _chmod600(path: Path) -> None:
    try:
        os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
    except Exception:
        pass  # best-effort (Windows / restricted env)


def _get_or_create_key() -> bytes:
    from cryptography.fernet import Fernet
    if _KEY_PATH.exists():
        return _KEY_PATH.read_bytes().strip()
    key = Fernet.generate_key()
    _KEY_PATH.write_bytes(key)
    _chmod600(_KEY_PATH)
    return key


def _fernet():
    from cryptography.fernet import Fernet
    return Fernet(_get_or_create_key())


def _load_raw() -> dict:
    if not _STORE_PATH.exists():
        return {}
    try:
        return json.loads(_STORE_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        _log.warning("connections_store: cannot parse store file: %s", exc)
        return {}


def _write_raw(data: dict) -> None:
    _STORE_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    _chmod600(_STORE_PATH)


def load_all() -> dict[str, dict]:
    """
    Return {alias: spec_with_plaintext_password} for all persisted connections.
    Skips any alias whose password cannot be decrypted — never raises.
    """
    raw = _load_raw()
    if not raw:
        return {}
    try:
        f = _fernet()
    except Exception as exc:
        _log.warning("connections_store: key unavailable, skipping all connections: %s", exc)
        return {}
    result = {}
    for alias, entry in raw.items():
        try:
            password = f.decrypt(entry["password_enc"].encode()).decode()
            spec = {k: v for k, v in entry.items() if k != "password_enc"}
            spec["password"] = password
            result[alias] = spec
        except Exception as exc:
            _log.warning("connections_store: skipping %r — decrypt failed: %s", alias, exc)
    return result


def save(alias: str, spec: dict) -> None:
    """Encrypt password and persist connection (upsert). spec must contain 'password'."""
    f = _fernet()
    password_enc = f.encrypt((spec.get("password") or "").encode()).decode()
    existing = _load_raw()
    existing[alias] = {
        "type": spec.get("type", "mssql"),
        "host": spec.get("host", ""),
        "port": int(spec.get("port") or 1433),
        "database": spec.get("database", ""),
        "username": spec.get("username", ""),
        "password_enc": password_enc,
    }
    _write_raw(existing)


def remove(alias: str) -> None:
    """Remove alias from the store. No-op if alias not present."""
    existing = _load_raw()
    if alias in existing:
        del existing[alias]
        _write_raw(existing)


def load_persisted_connections() -> int:
    """Load all persisted connections into the datasource registry. Returns count loaded."""
    try:
        from reportforge.core.render.datasource.db_source_registry import register
    except Exception as exc:
        _log.warning("connections_store: registry unavailable: %s", exc)
        return 0
    specs = load_all()
    for alias, spec in specs.items():
        register(alias, spec)
    if specs:
        _log.info("connections_store: loaded %d connection(s): %s", len(specs), list(specs.keys()))
    return len(specs)
