# core/render/expressions/eval_context.py
# Crystal Reports Evaluation Context
# Manages: local/global/shared variable scopes, evaluation timing,
#          record context, group context, page context
from __future__ import annotations
import datetime
from typing import Any, Dict, Optional, List
from .formula_parser import (
    parse_formula, EvalTiming, VarScope, VarType,
    NumLit, StrLit, BoolLit, NullLit, DateLit,
    FieldRef, VarRef, BinOp, UnaryOp, FuncCall,
    IfExpr, SelectExpr, VarDecl, Assignment, Block, EvalTimingDecl,
)


class FormulaError(Exception):
    pass


class EvalContext:
    """
    Holds all runtime state for CR formula evaluation.

    Scopes:
      - local:  per-formula execution (reset each call)
      - global: per-report run (shared across formulas)
      - shared: cross-report (persisted across sub-reports)

    Timing:
      - whileReadingRecords:  evaluated during data pass
      - whilePrintingRecords: evaluated during print/render pass
    """

    def __init__(self):
        # Variable stores
        self._global: Dict[str, Any] = {}
        self._shared: Dict[str, Any] = {}

        # Current record data
        self._record: Dict[str, Any] = {}
        self._all_records: List[Dict] = []
        self._record_number: int = 0
        self._group_items: List[Dict] = []

        # Page / print state
        self._page_number: int = 1
        self._total_pages: int = 1
        self._print_date: str = datetime.date.today().strftime("%d/%m/%Y")
        self._print_time: str = datetime.datetime.now().strftime("%H:%M:%S")

        # Parameters
        self._params: Dict[str, Any] = {}

        # Formula registry (name → parsed AST + timing)
        self._formulas: Dict[str, dict] = {}

        # Aggregation cache
        self._agg_cache: Dict[str, Any] = {}

    # ── Setup ──────────────────────────────────────────────────────────────────

    def set_records(self, records: List[Dict]):
        self._all_records = records
        self._agg_cache.clear()

    def set_record(self, record: Dict, number: int = 0):
        self._record = record
        self._record_number = number

    def set_group(self, items: List[Dict]):
        self._group_items = items

    def set_params(self, params: Dict[str, Any]):
        self._params = params

    def set_page(self, page: int, total: int):
        self._page_number = page
        self._total_pages = total

    def register_formula(self, name: str, expr: str, timing: EvalTiming = EvalTiming.WHILE_READING):
        try:
            ast = parse_formula(expr)
            self._formulas[name] = {'ast': ast, 'timing': timing, 'src': expr}
        except Exception as e:
            self._formulas[name] = {'ast': None, 'timing': timing, 'src': expr, 'error': str(e)}

    # ── Evaluation ─────────────────────────────────────────────────────────────

    def eval(self, expr_or_name: str, local_vars: Optional[Dict] = None) -> Any:
        """Evaluate a formula expression or registered formula by name."""
        local: Dict[str, Any] = local_vars or {}

        # Named formula lookup
        if expr_or_name in self._formulas:
            entry = self._formulas[expr_or_name]
            if entry.get('ast') is None:
                return ""
            return self._eval_node(entry['ast'], local)

        # Inline expression
        try:
            ast = parse_formula(expr_or_name)
            return self._eval_node(ast, local)
        except Exception as e:
            return ""

    def eval_formula(self, formula_text: str) -> Any:
        """Evaluate an inline formula string."""
        try:
            ast = parse_formula(formula_text)
            return self._eval_node(ast, {})
        except Exception:
            return ""

    def _eval_node(self, node: Any, local: Dict) -> Any:
        # Literals
        if isinstance(node, NumLit):  return node.value
        if isinstance(node, StrLit):  return node.value
        if isinstance(node, BoolLit): return node.value
        if isinstance(node, NullLit): return None
        if isinstance(node, DateLit): return self._parse_date(node.value)

        # Field reference {field.path}
        if isinstance(node, FieldRef):
            return self._resolve_field(node.path)

        # Variable reference
        if isinstance(node, VarRef):
            name_l = node.name.lower()
            # Special CR fields
            special = self._special_field(name_l)
            if special is not None:
                return special
            # Scope lookup: local → global → shared → record field
            if node.name in local:        return local[node.name]
            if node.name in self._global: return self._global[node.name]
            if node.name in self._shared: return self._shared[node.name]
            # Try as field path (handles param.xxx, dotted paths etc.)
            return self._resolve_field(node.name)

        # Variable declaration
        if isinstance(node, VarDecl):
            init_val = self._eval_node(node.init, local) if node.init else self._default(node.type_)
            if node.scope == VarScope.GLOBAL:
                if node.name not in self._global:  # declare only if not exists
                    self._global[node.name] = init_val
                return self._global[node.name]
            elif node.scope == VarScope.SHARED:
                if node.name not in self._shared:
                    self._shared[node.name] = init_val
                return self._shared[node.name]
            else:  # local
                local[node.name] = init_val
                return init_val

        # Assignment
        if isinstance(node, Assignment):
            val = self._eval_node(node.value, local)
            if node.name in self._global:   self._global[node.name] = val
            elif node.name in self._shared: self._shared[node.name] = val
            else:                           local[node.name] = val
            return val

        # Block
        if isinstance(node, Block):
            result = None
            for stmt in node.stmts:
                result = self._eval_node(stmt, local)
            return result if result is not None else ""

        # If/then/else
        if isinstance(node, IfExpr):
            cond = self._eval_node(node.cond, local)
            if self._truthy(cond):
                return self._eval_node(node.then_, local)
            elif node.else_ is not None:
                return self._eval_node(node.else_, local)
            return None

        # Select/case
        if isinstance(node, SelectExpr):
            expr_val = self._eval_node(node.expr, local)
            for case_val, case_body in node.cases:
                cv = self._eval_node(case_val, local)
                if self._eq(expr_val, cv):
                    return self._eval_node(case_body, local)
            if node.default_ is not None:
                return self._eval_node(node.default_, local)
            return None

        # Evaluation timing declaration (no-op at eval time)
        if isinstance(node, EvalTimingDecl):
            return None

        # Binary operations
        if isinstance(node, BinOp):
            return self._eval_binop(node, local)

        # Unary operations
        if isinstance(node, UnaryOp):
            v = self._eval_node(node.operand, local)
            if node.op == '-': return -self._to_num(v)
            if node.op == 'not': return not self._truthy(v)
            return v

        # Function call
        if isinstance(node, FuncCall):
            return self._eval_func(node, local)

        return None

    def _eval_binop(self, node: BinOp, local: Dict) -> Any:
        op = node.op
        # Short-circuit boolean ops
        if op == 'and':
            return self._truthy(self._eval_node(node.left, local)) and \
                   self._truthy(self._eval_node(node.right, local))
        if op == 'or':
            return self._truthy(self._eval_node(node.left, local)) or \
                   self._truthy(self._eval_node(node.right, local))

        left  = self._eval_node(node.left, local)
        right = self._eval_node(node.right, local)

        if op == '+':
            if isinstance(left, str) or isinstance(right, str):
                return str(left or '') + str(right or '')
            return self._to_num(left) + self._to_num(right)
        if op == '-': return self._to_num(left) - self._to_num(right)
        if op == '*': return self._to_num(left) * self._to_num(right)
        if op == '/':
            r = self._to_num(right)
            return self._to_num(left) / r if r != 0 else 0
        if op == '^': return self._to_num(left) ** self._to_num(right)
        if op == '%': return self._to_num(left) % self._to_num(right)
        if op == '&': return str(left or '') + str(right or '')

        # Comparisons
        if op == '=':  return self._eq(left, right)
        if op == '<>': return not self._eq(left, right)
        if op == '<':  return self._cmp(left, right) < 0
        if op == '>':  return self._cmp(left, right) > 0
        if op == '<=': return self._cmp(left, right) <= 0
        if op == '>=': return self._cmp(left, right) >= 0

        return None

    def _eval_func(self, node: FuncCall, local: Dict) -> Any:
        name = node.name.lower()
        args_raw = node.args

        # Built-in special functions
        if name == '__in__':
            val = self._eval_node(args_raw[0], local)
            return any(self._eq(val, self._eval_node(a, local)) for a in args_raw[1:])
        if name == '__between__':
            val = self._eval_node(args_raw[0], local)
            lo  = self._eval_node(args_raw[1], local)
            hi  = self._eval_node(args_raw[2], local)
            return self._cmp(val, lo) >= 0 and self._cmp(val, hi) <= 0

        # Lazy-eval control functions
        if name == 'iif':
            if len(args_raw) < 3: return None
            cond = self._eval_node(args_raw[0], local)
            return self._eval_node(args_raw[1] if self._truthy(cond) else args_raw[2], local)

        if name == 'if':  # alias
            return self._eval_func(FuncCall('iif', args_raw), local)

        if name == 'choose':
            idx = int(self._to_num(self._eval_node(args_raw[0], local)))
            if 1 <= idx <= len(args_raw) - 1:
                return self._eval_node(args_raw[idx], local)
            return None

        if name == 'switch':
            for i in range(0, len(args_raw) - 1, 2):
                if self._truthy(self._eval_node(args_raw[i], local)):
                    return self._eval_node(args_raw[i+1], local)
            return None

        # Evaluate all args for remaining functions
        args = [self._eval_node(a, local) for a in args_raw]

        # Aggregation functions
        if name == 'sum':
            return self._agg_sum(args)
        if name == 'avg' or name == 'average':
            return self._agg_avg(args)
        if name == 'count':
            return self._agg_count(args)
        if name == 'maximum' or name == 'max':
            return self._agg_max(args)
        if name == 'minimum' or name == 'min':
            return self._agg_min(args)
        if name == 'distinctcount':
            return self._agg_distinct_count(args)

        # Null / type functions
        if name == 'isnull':
            return args[0] is None if args else True
        if name == 'isnumeric' or name == 'isnumber':
            return isinstance(args[0], (int, float)) if args else False
        if name == 'isdate':
            return isinstance(args[0], (datetime.date, datetime.datetime)) if args else False
        if name == 'isstring':
            return isinstance(args[0], str) if args else False

        # Conversion
        if name in ('totext', 'cstr', 'str', 'tostring'):
            return self._fn_totext(args)
        if name in ('tonumber', 'cdbl', 'cint', 'val', 'num'):
            return self._to_num(args[0]) if args else 0
        if name in ('tobool', 'cbool'):
            return self._truthy(args[0]) if args else False

        # String functions
        if name == 'len': return len(str(args[0])) if args else 0
        if name in ('ucase', 'uppercase', 'upper'): return str(args[0]).upper() if args else ''
        if name in ('lcase', 'lowercase', 'lower'): return str(args[0]).lower() if args else ''
        if name in ('trim'): return str(args[0]).strip() if args else ''
        if name in ('ltrim', 'trimleft'): return str(args[0]).lstrip() if args else ''
        if name in ('rtrim', 'trimright'): return str(args[0]).rstrip() if args else ''
        if name == 'left': return str(args[0])[:int(self._to_num(args[1]))] if len(args)>=2 else ''
        if name == 'right':
            n = int(self._to_num(args[1]))
            return str(args[0])[-n:] if n and len(args)>=2 else ''
        if name == 'mid':
            s = str(args[0]); start = max(0, int(self._to_num(args[1]))-1)
            length = int(self._to_num(args[2])) if len(args)>=3 else len(s)
            return s[start:start+length]
        if name == 'instr':
            if len(args) == 2:
                haystack, needle = str(args[0]), str(args[1])
                pos = haystack.find(needle)
                return pos + 1 if pos >= 0 else 0
            if len(args) >= 3:
                start = int(self._to_num(args[0])) - 1
                haystack, needle = str(args[1]), str(args[2])
                pos = haystack.find(needle, start)
                return pos + 1 if pos >= 0 else 0
            return 0
        if name == 'replace':
            if len(args) < 3: return str(args[0]) if args else ''
            return str(args[0]).replace(str(args[1]), str(args[2]))
        if name == 'space': return ' ' * int(self._to_num(args[0])) if args else ''
        if name == 'replicate' or name == 'replicatestring':
            return str(args[0]) * int(self._to_num(args[1])) if len(args)>=2 else ''

        # Numeric functions
        if name == 'abs': return abs(self._to_num(args[0])) if args else 0
        if name == 'round':
            n = self._to_num(args[0]); d = int(self._to_num(args[1])) if len(args)>=2 else 0
            return round(n, d)
        if name == 'truncate' or name == 'int': return int(self._to_num(args[0])) if args else 0
        if name == 'sqrt': import math; return math.sqrt(max(0, self._to_num(args[0]))) if args else 0
        if name == 'pi': import math; return math.pi
        if name == 'power': return self._to_num(args[0]) ** self._to_num(args[1]) if len(args)>=2 else 0
        if name == 'remainder': return self._to_num(args[0]) % self._to_num(args[1]) if len(args)>=2 else 0
        if name == 'sgn':
            v = self._to_num(args[0]) if args else 0
            return 1 if v > 0 else (-1 if v < 0 else 0)

        # Date functions
        if name == 'year':   return self._date_part(args[0], 'year')
        if name == 'month':  return self._date_part(args[0], 'month')
        if name == 'day':    return self._date_part(args[0], 'day')
        if name == 'hour':   return self._date_part(args[0], 'hour')
        if name == 'minute': return self._date_part(args[0], 'minute')
        if name == 'second': return self._date_part(args[0], 'second')
        if name == 'today' or name == 'currentdate':
            return datetime.date.today()
        if name == 'now' or name == 'currentdatetime':
            return datetime.datetime.now()
        if name == 'dateadd':
            return self._fn_dateadd(args)
        if name == 'datediff':
            return self._fn_datediff(args)
        if name == 'dateserial':
            if len(args) >= 3:
                try: return datetime.date(int(args[0]), int(args[1]), int(args[2]))
                except: return None
        if name == 'cdate':
            return self._parse_date(str(args[0])) if args else None

        # Special fields as functions
        if name == 'pagenumber':  return self._page_number
        if name == 'totalpages':  return self._total_pages
        if name == 'recordnumber': return self._record_number

        # Delegate to cr_functions registry
        try:
            from . import cr_functions as _cr
            if _cr.is_cr_function(name):
                return _cr.call(name, args)
        except Exception:
            pass

        return None

    # ── Aggregations ───────────────────────────────────────────────────────────

    def _agg_items(self, args: list) -> tuple:
        """Return (field_name, items_to_aggregate)."""
        if not args: return (None, self._group_items or self._all_records)
        if isinstance(args[0], str):
            field = args[0]
            items = self._group_items if len(args) < 2 else self._all_records
            return (field, items)
        # numeric array
        return (None, args)

    def _agg_sum(self, args: list) -> float:
        field, items = self._agg_items(args)
        if field:
            return sum(self._to_num(r.get(field, 0)) for r in items if r.get(field) is not None)
        return sum(self._to_num(v) for v in items)

    def _agg_avg(self, args: list) -> float:
        field, items = self._agg_items(args)
        if field:
            vals = [self._to_num(r.get(field, 0)) for r in items if r.get(field) is not None]
        else:
            vals = [self._to_num(v) for v in items]
        return sum(vals) / len(vals) if vals else 0

    def _agg_count(self, args: list) -> int:
        field, items = self._agg_items(args)
        if field:
            return sum(1 for r in items if r.get(field) is not None)
        return len(items)

    def _agg_max(self, args: list) -> Any:
        field, items = self._agg_items(args)
        if field:
            vals = [r.get(field) for r in items if r.get(field) is not None]
        else:
            vals = items
        return max(vals) if vals else None

    def _agg_min(self, args: list) -> Any:
        field, items = self._agg_items(args)
        if field:
            vals = [r.get(field) for r in items if r.get(field) is not None]
        else:
            vals = items
        return min(vals) if vals else None

    def _agg_distinct_count(self, args: list) -> int:
        field, items = self._agg_items(args)
        if field:
            return len(set(r.get(field) for r in items if r.get(field) is not None))
        return len(set(str(v) for v in items))

    # ── Helpers ────────────────────────────────────────────────────────────────

    def _resolve_field(self, path: str) -> Any:
        """Resolve a dotted field path against current record."""
        if not path: return None
        parts = path.split('.')
        # Try record directly
        if parts[0] in self._record:
            val = self._record[parts[0]]
            for p in parts[1:]:
                if isinstance(val, dict): val = val.get(p)
                else: val = None; break
            return val
        # Try flat record key
        if path in self._record:
            return self._record[path]
        # Try params
        if parts[0] == 'param' and len(parts) > 1:
            return self._params.get('.'.join(parts[1:]))
        return None

    def _special_field(self, name: str) -> Any:
        m = {
            'pagenumber': self._page_number,
            'totalpages': self._total_pages,
            'recordnumber': self._record_number,
            'printdate': self._print_date,
            'printtime': self._print_time,
            'true': True, 'false': False,
        }
        return m.get(name)

    def _default(self, vtype: VarType) -> Any:
        defaults = {
            VarType.NUMBER: 0, VarType.CURRENCY: 0.0,
            VarType.STRING: '', VarType.BOOLEAN: False,
            VarType.DATE: datetime.date.today(),
            VarType.DATETIME: datetime.datetime.now(),
        }
        return defaults.get(vtype, None)

    def _truthy(self, v: Any) -> bool:
        if v is None: return False
        if isinstance(v, bool): return v
        if isinstance(v, (int, float)): return v != 0
        if isinstance(v, str): return v.lower() not in ('', 'false', '0', 'no')
        return bool(v)

    def _to_num(self, v: Any) -> float:
        if v is None: return 0
        if isinstance(v, bool): return 1 if v else 0
        if isinstance(v, (int, float)): return float(v)
        try: return float(str(v).replace(',', ''))
        except: return 0

    def _eq(self, a: Any, b: Any) -> bool:
        if a is None and b is None: return True
        if a is None or b is None: return False
        if type(a) == type(b): return a == b
        try: return float(a) == float(b)
        except: return str(a) == str(b)

    def _cmp(self, a: Any, b: Any) -> int:
        try:
            fa, fb = float(a), float(b)
            return (fa > fb) - (fa < fb)
        except:
            sa, sb = str(a), str(b)
            return (sa > sb) - (sa < sb)

    def _parse_date(self, s: str) -> Optional[datetime.date]:
        if isinstance(s, (datetime.date, datetime.datetime)): return s
        for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%d-%m-%Y', '%Y/%m/%d'):
            try: return datetime.datetime.strptime(str(s).strip(), fmt).date()
            except: pass
        return None

    def _date_part(self, v: Any, part: str) -> int:
        d = self._parse_date(v) or datetime.date.today()
        return getattr(d, part, 0)

    def _fn_totext(self, args: list) -> str:
        if not args: return ''
        v = args[0]
        if isinstance(v, float) and len(args) >= 2:
            decimals = int(self._to_num(args[1]))
            return f"{v:.{decimals}f}"
        if isinstance(v, datetime.date):
            fmt = str(args[1]) if len(args) >= 2 else '%d/%m/%Y'
            return v.strftime(fmt)
        return str(v) if v is not None else ''

    def _fn_dateadd(self, args: list) -> Any:
        if len(args) < 3: return None
        interval = str(args[0]).lower()
        n = int(self._to_num(args[1]))
        d = self._parse_date(args[2])
        if not d: return None
        try:
            if interval in ('d', 'day', 'days'):
                return d + datetime.timedelta(days=n)
            if interval in ('m', 'month', 'months'):
                month = d.month - 1 + n
                y = d.year + month // 12; m = month % 12 + 1
                return d.replace(year=y, month=m)
            if interval in ('y', 'year', 'years', 'yyyy'):
                return d.replace(year=d.year + n)
            if interval in ('h', 'hour', 'hours'):
                return datetime.datetime.combine(d, datetime.time()) + datetime.timedelta(hours=n)
            if interval in ('n', 'min', 'minute', 'minutes'):
                return datetime.datetime.combine(d, datetime.time()) + datetime.timedelta(minutes=n)
            if interval in ('w', 'week', 'weeks'):
                return d + datetime.timedelta(weeks=n)
        except: pass
        return d

    def _fn_datediff(self, args: list) -> int:
        if len(args) < 3: return 0
        interval = str(args[0]).lower()
        d1 = self._parse_date(args[1])
        d2 = self._parse_date(args[2])
        if not d1 or not d2: return 0
        delta = d2 - d1
        if interval in ('d', 'day', 'days'): return delta.days
        if interval in ('w', 'week', 'weeks'): return delta.days // 7
        if interval in ('m', 'month', 'months'):
            return (d2.year - d1.year) * 12 + (d2.month - d1.month)
        if interval in ('y', 'year', 'years', 'yyyy'):
            return d2.year - d1.year
        if interval in ('h', 'hour', 'hours'):
            return int(delta.total_seconds()) // 3600
        return delta.days
