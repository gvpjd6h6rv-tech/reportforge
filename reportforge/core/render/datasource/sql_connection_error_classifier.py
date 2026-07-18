from __future__ import annotations

import errno
import socket
import ssl
from collections.abc import Iterable

from .sql_error_sanitizer import sanitize

DRIVER_MISSING = "DRIVER_MISSING"
DNS_FAILURE = "DNS_FAILURE"
CONNECTION_REFUSED = "CONNECTION_REFUSED"
CONNECTION_TIMEOUT = "CONNECTION_TIMEOUT"
AUTHENTICATION_FAILED = "AUTHENTICATION_FAILED"
DATABASE_UNAVAILABLE = "DATABASE_UNAVAILABLE"
PERMISSION_DENIED = "PERMISSION_DENIED"
TLS_ERROR = "TLS_ERROR"
SERVER_UNAVAILABLE = "SERVER_UNAVAILABLE"
DRIVER_ERROR = "DRIVER_ERROR"
UNKNOWN_CONNECTION_ERROR = "UNKNOWN_CONNECTION_ERROR"

_DRIVER_EXCEPTION_NAMES = {
    "DatabaseError",
    "DataError",
    "Error",
    "InterfaceError",
    "InternalError",
    "NotSupportedError",
    "OperationalError",
    "ProgrammingError",
}

_AUTH_ERROR_CODES = {18452, 18456, 18470, 18487, 18488}
_DATABASE_UNAVAILABLE_CODES = {4060, 40613, 911, 912, 913, 924, 925, 926, 927, 945, 951, 952}
_PERMISSION_DENIED_CODES = {229, 230, 916, 15151, 15247}
_SERVER_UNAVAILABLE_CODES = {20002, 20003, 20009, 20017, 20018, 20047, 20060, 20061, 20068}
_DNS_ERROR_CODES = {-2, -3, 11001}
_CONNECTION_REFUSED_ERRNOS = {errno.ECONNREFUSED, 111, 10061, 61}
_CONNECTION_TIMEOUT_ERRNOS = {errno.ETIMEDOUT, 110, 10060}
_SERVER_UNAVAILABLE_ERRNOS = {
    errno.EHOSTDOWN,
    errno.EHOSTUNREACH,
    errno.ENETDOWN,
    errno.ENETUNREACH,
    errno.ECONNRESET,
    errno.ECONNABORTED,
    errno.EPIPE,
}

_SUGGESTIONS = {
    DRIVER_MISSING: "Instala `pymssql` y reinicia el servidor.",
    DNS_FAILURE: "Revisa el nombre del host o usa la IP correcta.",
    CONNECTION_REFUSED: "Verifica que SQL Server esté escuchando en ese puerto y que el firewall lo permita.",
    CONNECTION_TIMEOUT: "Revisa red, firewall y latencia; aumenta el timeout si hace falta.",
    AUTHENTICATION_FAILED: "Confirma usuario, contraseña y el método de autenticación.",
    DATABASE_UNAVAILABLE: "Comprueba que la base exista, esté en línea y sea accesible.",
    PERMISSION_DENIED: "Concede permisos de conexión y lectura sobre la base.",
    TLS_ERROR: "Revisa certificados, cifrado obligatorio y la configuración TLS.",
    SERVER_UNAVAILABLE: "Verifica que el host esté en línea y accesible desde este equipo.",
    DRIVER_ERROR: "Actualiza el driver o revisa los logs del controlador.",
    UNKNOWN_CONNECTION_ERROR: "Revisa la configuración y vuelve a intentar.",
}


def _iter_exception_chain(exc: BaseException) -> Iterable[BaseException]:
    seen: set[int] = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        yield current
        current = current.__cause__ or current.__context__


def _extract_numeric_code(exc: BaseException) -> int | None:
    for attr in ("errno", "winerror", "code", "number"):
        value = getattr(exc, attr, None)
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)
    sqlstate = getattr(exc, "sqlstate", None)
    if isinstance(sqlstate, int):
        return sqlstate
    if isinstance(sqlstate, str) and sqlstate.isdigit():
        return int(sqlstate)
    for arg in exc.args:
        if isinstance(arg, int):
            return arg
        if isinstance(arg, str) and arg.isdigit():
            return int(arg)
    return None


def _classify_single(exc: BaseException) -> str | None:
    type_name = type(exc).__name__
    code = _extract_numeric_code(exc)

    if isinstance(exc, (ImportError, ModuleNotFoundError)):
        return DRIVER_MISSING
    if isinstance(exc, RuntimeError) and "pymssql not installed" in str(exc).lower():
        return DRIVER_MISSING

    if isinstance(exc, (ssl.SSLError, ssl.CertificateError)):
        return TLS_ERROR

    if isinstance(exc, socket.timeout) or isinstance(exc, TimeoutError) or code in _CONNECTION_TIMEOUT_ERRNOS:
        return CONNECTION_TIMEOUT

    if isinstance(exc, socket.gaierror) or code in _DNS_ERROR_CODES:
        return DNS_FAILURE

    if isinstance(exc, ConnectionRefusedError) or code in _CONNECTION_REFUSED_ERRNOS:
        return CONNECTION_REFUSED

    if code in _AUTH_ERROR_CODES or type_name == "AuthenticationError":
        return AUTHENTICATION_FAILED

    if code in _PERMISSION_DENIED_CODES or isinstance(exc, PermissionError):
        return PERMISSION_DENIED

    if code in _DATABASE_UNAVAILABLE_CODES:
        return DATABASE_UNAVAILABLE

    if code in _SERVER_UNAVAILABLE_CODES or code in _SERVER_UNAVAILABLE_ERRNOS or isinstance(exc, (ConnectionAbortedError, ConnectionResetError, BrokenPipeError)):
        return SERVER_UNAVAILABLE

    if type_name in _DRIVER_EXCEPTION_NAMES:
        return DRIVER_ERROR

    return None


def _sanitized_debug_code(exc: BaseException, password: str) -> str:
    safe_msg = sanitize(str(exc))
    if password:
        safe_msg = safe_msg.replace(password, "***")
    return f"{type(exc).__name__}: {safe_msg}"


def _format_message(category: str, host: str, port: int, database: str) -> str:
    target = f"{host}:{port}/{database}" if host or database else "la conexión"
    if category == DRIVER_MISSING:
        return f"No se pudo probar {target}: falta el controlador SQL Server."
    if category == DNS_FAILURE:
        return f"No se pudo conectar a {target}: no se pudo resolver el host."
    if category == CONNECTION_REFUSED:
        return f"No se pudo conectar a {target}: el servidor rechazó la conexión."
    if category == CONNECTION_TIMEOUT:
        return f"No se pudo conectar a {target}: la conexión expiró."
    if category == AUTHENTICATION_FAILED:
        return f"No se pudo conectar a {target}: las credenciales fueron rechazadas."
    if category == DATABASE_UNAVAILABLE:
        return f"No se pudo conectar a {target}: la base de datos no está disponible."
    if category == PERMISSION_DENIED:
        return f"No se pudo conectar a {target}: el usuario no tiene permisos suficientes."
    if category == TLS_ERROR:
        return f"No se pudo conectar a {target}: falló la negociación TLS/SSL."
    if category == SERVER_UNAVAILABLE:
        return f"No se pudo conectar a {target}: el servidor no está disponible."
    if category == DRIVER_ERROR:
        return f"No se pudo conectar a {target}: el controlador devolvió un error."
    return f"No se pudo completar la conexión a {target}."


def _format_suggestion(category: str) -> str:
    return _SUGGESTIONS.get(category, _SUGGESTIONS[UNKNOWN_CONNECTION_ERROR])


def classify_connection_error(
    exc: BaseException,
    *,
    host: str,
    port: int,
    database: str,
    password: str = "",
) -> dict:
    """
    Classify a SQL Server connection failure into a stable category.

    The returned payload is safe to show or log:
      - category: stable machine-readable family
      - message: user-facing explanation
      - suggestion: concrete next action
      - debugCode: sanitized technical exception summary
    """
    winning_exc = exc
    category = None
    fallback_category = None
    fallback_exc = exc
    for candidate in _iter_exception_chain(exc):
        category = _classify_single(candidate)
        if not category:
            continue
        if category not in {DRIVER_ERROR, UNKNOWN_CONNECTION_ERROR}:
            winning_exc = candidate
            break
        if fallback_category is None or fallback_category == UNKNOWN_CONNECTION_ERROR:
            fallback_category = category
            fallback_exc = candidate
        category = None
    if category is None:
        category = fallback_category or UNKNOWN_CONNECTION_ERROR
        winning_exc = fallback_exc

    return {
        "category": category,
        "message": _format_message(category, host, port, database),
        "suggestion": _format_suggestion(category),
        "debugCode": _sanitized_debug_code(winning_exc, password),
    }
