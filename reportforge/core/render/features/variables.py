# core/render/features/variables.py
import datetime, uuid as _uuid, os, re


class TemplateVariables:
    """
    Resolves template variable expressions: now(), uuid(), env.VAR, etc.
    Returns (handled, value) tuple.
    """
    def __init__(self, page: int = 1, page_count: int = 1, **kwargs):
        self._page = page
        self._page_count = page_count
    _STATIC_FUNCS = {
        "now":       lambda: datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
        "today":     lambda: datetime.date.today().strftime("%d/%m/%Y"),
        "year":      lambda: str(datetime.date.today().year),
        "month":     lambda: str(datetime.date.today().month),
        "uuid":      lambda: str(_uuid.uuid4()),
        "timestamp": lambda: str(int(datetime.datetime.now().timestamp())),
    }
    _FN_PAT = re.compile(r'^(\w+)\(\)$')
    _ENV_PAT= re.compile(r'^env\.(\w+)$')

    def resolve(self, expr: str) -> tuple[bool, any]:
        expr = expr.strip()
        m = self._FN_PAT.match(expr)
        if m:
            fn = m.group(1)
            if fn in self._STATIC_FUNCS:
                return True, self._STATIC_FUNCS[fn]()
            if fn == "page":
                return True, self._page
            if fn == "pageCount":
                return True, self._page_count
        e = self._ENV_PAT.match(expr)
        if e:
            return True, os.environ.get(e.group(1), "")
        return False, None
