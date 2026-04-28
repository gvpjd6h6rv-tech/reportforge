from __future__ import annotations

import ast
import datetime
import os
import re
import uuid as _uuid_mod

_EXPR_PAT = re.compile(r"\{([^{}]+)\}")
_AGG_PAT = re.compile(r"\b(sum|count|avg|min|max|first|last)\s*\(\s*([\w.]+)\s*\)")
_RUNSUM_PAT = re.compile(r"\brunningSum\s*\(\s*([\w.]+)\s*\)")
_RUNCNT_PAT = re.compile(r"\brunningCount\s*\(\s*([\w.]+)\s*\)")
_TERNARY = re.compile(r"^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$", re.DOTALL)
_IF_THEN = re.compile(r"^if\s+(.+?)\s+then\s+(.+?)(?:\s+else\s+(.+))?$", re.IGNORECASE | re.DOTALL)
_FIELD = re.compile(r"\b([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)+)\b")
_CALL_PAT = re.compile(r"^([a-zA-Z_]\w*)\s*\((.*)?\)$", re.DOTALL)
_ENV_PAT = re.compile(r"\benv\.([\w_]+)\b")
_PARAM_PAT = re.compile(r"\bparam\.([\w_]+)\b")
_SIMPLE_FUNC_NAMES = (
    "now|today|uuid|timestamp|upper|lower|title|strip|len|"
    "year|month|day|hour|minute|second|dayofweek|"
    "tonumber|cbool|cstr|cdbl|cint|abs|sgn|sqrt|exp|log|sin|cos|pi|"
    "isnull|isdate|isnumber|isstring|val|asc|"
    "trimleft|trimright|propercase|reverse|fix|int|"
    "towords|datevalue|cdate"
)
_FUNC_PAT = re.compile(r"\b(" + _SIMPLE_FUNC_NAMES + r")\s*\(([^)]*)\)")

_TEMPLATE_FUNCS = {
    "now": lambda: datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
    "today": lambda: datetime.date.today().strftime("%d/%m/%Y"),
    "uuid": lambda: str(_uuid_mod.uuid4()),
    "timestamp": lambda: str(int(datetime.datetime.now().timestamp())),
}

_STRING_FUNCS = {
    "upper": lambda s: str(s).upper(),
    "lower": lambda s: str(s).lower(),
    "title": lambda s: str(s).title(),
    "strip": lambda s: str(s).strip(),
}


def split_args(s):
    args, current, depth, in_q, q_ch = [], [], 0, False, ""
    for ch in s:
        if in_q:
            current.append(ch)
            if ch == q_ch:
                in_q = False
        elif ch in ('"', "'"):
            in_q = True
            q_ch = ch
            current.append(ch)
        elif ch == "(":
            depth += 1
            current.append(ch)
        elif ch == ")":
            depth -= 1
            current.append(ch)
        elif ch == "," and depth == 0:
            args.append("".join(current).strip())
            current = []
        else:
            current.append(ch)
    if current:
        args.append("".join(current).strip())
    return [a for a in args if a]


class _Vis(ast.NodeVisitor):
    _OK = {
        ast.Expression, ast.Constant, ast.Num, ast.Str,
        ast.BinOp, ast.UnaryOp, ast.BoolOp, ast.Compare, ast.IfExp,
        ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv,
        ast.Mod, ast.Pow, ast.USub, ast.UAdd,
        ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE,
        ast.And, ast.Or, ast.Not,
    }

    def generic_visit(self, node):
        if type(node) not in self._OK:
            raise ValueError(f"Forbidden: {type(node).__name__}")
        super().generic_visit(node)


def safe_eval(expr):
    if not expr.strip():
        return ""
    try:
        tree = ast.parse(expr, mode="eval")
        _Vis().visit(tree)
        return eval(compile(tree, "<expr>", "eval"), {"__builtins__": {}}, {})  # noqa
    except Exception:
        return expr


def coerce_str(val):
    if isinstance(val, float):
        return str(int(val)) if val == int(val) else f"{val:.6f}".rstrip("0").rstrip(".")
    if isinstance(val, bool):
        return "Yes" if val else "No"
    if isinstance(val, datetime.date):
        return val.strftime("%d/%m/%Y")
    return str(val) if val is not None else ""


def env_value(name: str) -> str:
    return os.environ.get(name, "")
