# core/render/expressions/cr_functions.py
# Crystal Reports native function library
# Implements the full CR formula language function set
from __future__ import annotations
import datetime, math, re
from typing import Any


# ── Helpers ────────────────────────────────────────────────────────────────

def _to_num(v: Any) -> float:
    """Coerce value to float, CR-style."""
    if v is None or v == "":
        return 0.0
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _to_str(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return str(v)


def _to_date(v: Any) -> datetime.date:
    """Parse various date formats CR accepts."""
    if isinstance(v, datetime.datetime):
        return v.date()
    if isinstance(v, datetime.date):
        return v
    if v is None or v == "":
        return datetime.date.today()
    s = str(v).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d",
                "%d/%m/%Y %H:%M:%S", "%d/%m/%Y", "%m/%d/%Y", "%Y%m%d"):
        try:
            return datetime.datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return datetime.date.today()


def _to_datetime(v: Any) -> datetime.datetime:
    if isinstance(v, datetime.datetime):
        return v
    if isinstance(v, datetime.date):
        return datetime.datetime(v.year, v.month, v.day)
    s = str(v).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S",
                "%d/%m/%Y %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.datetime.strptime(s, fmt)
        except ValueError:
            pass
    return datetime.datetime.now()


# ── Date / Time ────────────────────────────────────────────────────────────

_INTERVALS = {
    "yyyy": "year", "y": "year",
    "q": "quarter",
    "m": "month",
    "ww": "week", "w": "week",
    "d": "day",
    "h": "hour",
    "n": "minute",
    "s": "second",
}


def fn_dateadd(interval: Any, number: Any, date: Any) -> datetime.date:
    """DateAdd(interval, number, date)"""
    interval = str(interval).strip().lower().strip('"\'')
    n = int(_to_num(number))
    d = _to_date(date)
    key = _INTERVALS.get(interval, interval)
    if key == "year":
        try:
            return d.replace(year=d.year + n)
        except ValueError:
            return d.replace(year=d.year + n, day=28)
    if key == "month":
        month = d.month + n
        year  = d.year + (month - 1) // 12
        month = ((month - 1) % 12) + 1
        try:
            return d.replace(year=year, month=month)
        except ValueError:
            import calendar
            last_day = calendar.monthrange(year, month)[1]
            return d.replace(year=year, month=month, day=last_day)
    if key == "quarter":
        return fn_dateadd("m", n * 3, d)
    if key == "week":
        return d + datetime.timedelta(weeks=n)
    if key == "day":
        return d + datetime.timedelta(days=n)
    if key == "hour":
        return _to_datetime(d) + datetime.timedelta(hours=n)
    if key == "minute":
        return _to_datetime(d) + datetime.timedelta(minutes=n)
    if key == "second":
        return _to_datetime(d) + datetime.timedelta(seconds=n)
    return d


def fn_datediff(interval: Any, date1: Any, date2: Any) -> int:
    """DateDiff(interval, date1, date2)"""
    interval = str(interval).strip().lower().strip('"\'')
    d1 = _to_date(date1)
    d2 = _to_date(date2)
    key = _INTERVALS.get(interval, interval)
    delta = d2 - d1
    if key == "day":   return delta.days
    if key == "week":  return delta.days // 7
    if key == "year":  return d2.year - d1.year
    if key == "month": return (d2.year - d1.year) * 12 + (d2.month - d1.month)
    if key == "quarter": return fn_datediff("m", d1, d2) // 3
    if key in ("hour",):   return int(delta.total_seconds() // 3600)
    if key in ("minute",): return int(delta.total_seconds() // 60)
    if key in ("second",): return int(delta.total_seconds())
    return delta.days


def fn_dateserial(year: Any, month: Any, day: Any) -> datetime.date:
    """DateSerial(year, month, day)"""
    try:
        return datetime.date(int(_to_num(year)), int(_to_num(month)), int(_to_num(day)))
    except ValueError:
        return datetime.date.today()


def fn_datevalue(v: Any) -> datetime.date:
    """DateValue(string) — parse to date"""
    return _to_date(v)


def fn_cdate(v: Any) -> str:
    """CDate(value) — convert to formatted date string"""
    return _to_date(v).strftime("%d/%m/%Y")


def fn_year(v: Any) -> int:
    return _to_date(v).year


def fn_month(v: Any) -> int:
    return _to_date(v).month


def fn_day(v: Any) -> int:
    return _to_date(v).day


def fn_hour(v: Any) -> int:
    return _to_datetime(v).hour


def fn_minute(v: Any) -> int:
    return _to_datetime(v).minute


def fn_second(v: Any) -> int:
    return _to_datetime(v).second


def fn_dayofweek(v: Any) -> int:
    """DayOfWeek — 1=Sunday ... 7=Saturday (CR convention)"""
    # Python: 0=Monday, CR: 1=Sunday
    return (_to_date(v).weekday() + 1) % 7 + 1


def fn_weekdayname(n: Any, abbreviated: Any = False) -> str:
    days_full  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
    days_abbr  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
    idx = (int(_to_num(n)) - 1) % 7
    return days_abbr[idx] if abbreviated else days_full[idx]


def fn_monthname(n: Any, abbreviated: Any = False) -> str:
    months_full = ["","January","February","March","April","May","June",
                   "July","August","September","October","November","December"]
    months_abbr = ["","Jan","Feb","Mar","Apr","May","Jun",
                   "Jul","Aug","Sep","Oct","Nov","Dec"]
    idx = int(_to_num(n)) % 13
    return months_abbr[idx] if abbreviated else months_full[idx]


# ── String ─────────────────────────────────────────────────────────────────

def fn_mid(s: Any, start: Any, length: Any = None) -> str:
    """Mid(string, start[, length]) — 1-based"""
    s = _to_str(s)
    st = int(_to_num(start)) - 1
    st = max(0, st)
    if length is None:
        return s[st:]
    ln = int(_to_num(length))
    return s[st: st + ln]


def fn_left(s: Any, n: Any) -> str:
    return _to_str(s)[:int(_to_num(n))]


def fn_right(s: Any, n: Any) -> str:
    s = _to_str(s)
    n = int(_to_num(n))
    return s[-n:] if n > 0 else ""


def fn_instr(*args) -> int:
    """InStr([start,] string, substring) — 1-based, 0 if not found"""
    if len(args) == 2:
        s, sub = _to_str(args[0]), _to_str(args[1])
        start = 1
    else:
        start = int(_to_num(args[0]))
        s, sub = _to_str(args[1]), _to_str(args[2])
    idx = s.find(sub, start - 1)
    return idx + 1 if idx >= 0 else 0


def fn_replace(s: Any, find: Any, replacement: Any) -> str:
    return _to_str(s).replace(_to_str(find), _to_str(replacement))


def fn_split(s: Any, delimiter: Any = " ") -> list:
    return _to_str(s).split(_to_str(delimiter))


def fn_join(arr: Any, delimiter: Any = " ") -> str:
    if isinstance(arr, list):
        return _to_str(delimiter).join(_to_str(x) for x in arr)
    return _to_str(arr)


def fn_space(n: Any) -> str:
    return " " * max(0, int(_to_num(n)))


def fn_chr(n: Any) -> str:
    try:
        return chr(int(_to_num(n)))
    except (ValueError, OverflowError):
        return ""


def fn_asc(s: Any) -> int:
    s = _to_str(s)
    return ord(s[0]) if s else 0


def fn_val(s: Any) -> float:
    """Val(string) — convert leading numeric part to number"""
    s = _to_str(s).strip()
    m = re.match(r'^[+-]?(\d+\.?\d*|\.\d+)', s)
    if m:
        try:
            return float(m.group())
        except ValueError:
            pass
    return 0.0


def fn_len(s: Any) -> int:
    return len(_to_str(s))


def fn_trimleft(s: Any) -> str:
    return _to_str(s).lstrip()


def fn_trimright(s: Any) -> str:
    return _to_str(s).rstrip()


def fn_propercase(s: Any) -> str:
    return _to_str(s).title()


def fn_replicatestring(s: Any, n: Any) -> str:
    return _to_str(s) * max(0, int(_to_num(n)))


def fn_reverse(s: Any) -> str:
    return _to_str(s)[::-1]


# ── Conversion ─────────────────────────────────────────────────────────────

def fn_tonumber(v: Any) -> float:
    return _to_num(v)


def fn_totext(v: Any, decimals: Any = None, separator: Any = ",") -> str:
    """ToText(value[, decimals[, separator]])"""
    if decimals is None:
        n = _to_num(v)
        return str(int(n)) if n == int(n) else f"{n:.6f}".rstrip("0").rstrip(".")
    d = int(_to_num(decimals))
    n = _to_num(v)
    sep = _to_str(separator)
    if sep == ",":
        fmt = f"{{:,.{d}f}}"
    else:
        # European style: no thousands separator
        fmt = f"{{:.{d}f}}"
    return fmt.format(n)


def fn_cbool(v: Any) -> bool:
    if isinstance(v, bool):   return v
    if isinstance(v, (int, float)): return bool(v)
    s = _to_str(v).strip().lower()
    return s in ("true", "yes", "1", "on")


def fn_cstr(v: Any) -> str:
    return _to_str(v)


def fn_cdbl(v: Any) -> float:
    return _to_num(v)


def fn_cint(v: Any) -> int:
    return int(_to_num(v))


# ── Math ───────────────────────────────────────────────────────────────────

def fn_round(v: Any, decimals: Any = 0) -> float:
    return round(_to_num(v), int(_to_num(decimals)))


def fn_truncate(v: Any, decimals: Any = 0) -> float:
    d = int(_to_num(decimals))
    n = _to_num(v)
    factor = 10 ** d
    return math.trunc(n * factor) / factor


def fn_remainder(a: Any, b: Any) -> float:
    b_val = _to_num(b)
    if b_val == 0:
        return 0.0
    return _to_num(a) % b_val


def fn_int(v: Any) -> int:
    return int(math.floor(_to_num(v)))


def fn_fix(v: Any) -> int:
    return int(math.trunc(_to_num(v)))


def fn_abs(v: Any) -> float:
    return abs(_to_num(v))


def fn_sgn(v: Any) -> int:
    n = _to_num(v)
    return 1 if n > 0 else (-1 if n < 0 else 0)


def fn_sqrt(v: Any) -> float:
    return math.sqrt(max(0, _to_num(v)))


def fn_exp(v: Any) -> float:
    return math.exp(_to_num(v))


def fn_log(v: Any) -> float:
    n = _to_num(v)
    return math.log(n) if n > 0 else 0.0


def fn_sin(v: Any) -> float:
    return math.sin(_to_num(v))


def fn_cos(v: Any) -> float:
    return math.cos(_to_num(v))


def fn_pi() -> float:
    return math.pi


def fn_power(base: Any, exp: Any) -> float:
    return _to_num(base) ** _to_num(exp)


# ── Formatting ─────────────────────────────────────────────────────────────

def fn_numerictext(n: Any, picture: Any = "##,##0.00") -> str:
    """NumericText(number, picture) — format with picture mask"""
    n = _to_num(n)
    pic = _to_str(picture)
    # Count decimal places in picture
    if "." in pic:
        dec = len(pic.split(".")[1].replace("#", "0"))
        use_sep = "," in pic.split(".")[0]
    else:
        dec = 0
        use_sep = "," in pic
    import decimal as _dec
    # CR uses arithmetic (round-half-up) rounding, not banker's rounding
    try:
        ctx = _dec.getcontext().copy()
        ctx.rounding = _dec.ROUND_HALF_UP
        dn = _dec.Decimal(str(n)).quantize(_dec.Decimal(10) ** -dec, context=ctx)
        rounded = float(dn)
    except Exception:
        rounded = round(n, dec)
    if use_sep:
        return f"{rounded:,.{dec}f}"
    return f"{rounded:.{dec}f}"


def fn_towords(n: Any) -> str:
    """ToWords(number) — basic English number-to-words"""
    n = _to_num(n)
    int_part = int(abs(n))
    dec_part  = round(abs(n) - int_part, 2)

    ones  = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine",
             "Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen",
             "Seventeen","Eighteen","Nineteen"]
    tens  = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"]

    def _below_1000(x):
        if x == 0:   return ""
        if x < 20:   return ones[x]
        if x < 100:  return tens[x//10] + (" " + ones[x%10] if x%10 else "")
        return ones[x//100] + " Hundred" + (" " + _below_1000(x%100) if x%100 else "")

    def _convert(x):
        if x == 0: return "Zero"
        parts = []
        billions  = x // 1_000_000_000
        millions  = (x % 1_000_000_000) // 1_000_000
        thousands = (x % 1_000_000) // 1_000
        rem       = x % 1_000
        if billions:  parts.append(_below_1000(billions)  + " Billion")
        if millions:  parts.append(_below_1000(millions)  + " Million")
        if thousands: parts.append(_below_1000(thousands) + " Thousand")
        if rem:       parts.append(_below_1000(rem))
        return " ".join(parts)

    result = ("Negative " if n < 0 else "") + _convert(int_part)
    if dec_part > 0:
        cents = round(dec_part * 100)
        result += f" and {cents:02d}/100"
    return result


def fn_picture(s: Any, template: Any) -> str:
    """Picture(string, template) — apply formatting mask"""
    s = _to_str(s).replace(" ", "").replace("-", "").replace(".", "")
    t = _to_str(template)
    out, si = [], 0
    for ch in t:
        if ch == 'X':
            if si < len(s):
                out.append(s[si]); si += 1
            else:
                out.append(" ")
        else:
            out.append(ch)
    return "".join(out)


# ── Null / type checking ───────────────────────────────────────────────────

def fn_isnull(v: Any) -> bool:
    return v is None or v == ""


def fn_isdate(v: Any) -> bool:
    if isinstance(v, (datetime.date, datetime.datetime)):
        return True
    if v is None or v == "":
        return False
    s = str(v).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d",
                "%d/%m/%Y %H:%M:%S", "%d/%m/%Y", "%m/%d/%Y", "%Y%m%d"):
        try:
            datetime.datetime.strptime(s, fmt)
            return True
        except ValueError:
            pass
    return False


def fn_isnumber(v: Any) -> bool:
    if isinstance(v, (int, float)):
        return True
    try:
        float(str(v))
        return True
    except (TypeError, ValueError):
        return False


def fn_isstring(v: Any) -> bool:
    return isinstance(v, str)


def fn_isnull_or_empty(v: Any) -> bool:
    return v is None or _to_str(v).strip() == ""


# ── Conditional ────────────────────────────────────────────────────────────

def fn_iif(cond: Any, true_val: Any, false_val: Any) -> Any:
    """IIF(condition, trueValue, falseValue)"""
    return true_val if bool(cond) else false_val


def fn_choose(index: Any, *values) -> Any:
    """Choose(index, v1, v2, ...) — 1-based"""
    idx = int(_to_num(index)) - 1
    if 0 <= idx < len(values):
        return values[idx]
    return ""


def fn_switch(*pairs) -> Any:
    """Switch(cond1, val1, cond2, val2, ...) — returns val for first true cond"""
    for i in range(0, len(pairs) - 1, 2):
        if bool(pairs[i]):
            return pairs[i + 1]
    return ""


# ── String range / membership ──────────────────────────────────────────────

def fn_in_range(v: Any, low: Any, high: Any) -> bool:
    """InRange(value, low, high)"""
    try:
        n = _to_num(v)
        return _to_num(low) <= n <= _to_num(high)
    except Exception:
        s = _to_str(v)
        return _to_str(low) <= s <= _to_str(high)


def fn_in_list(v: Any, *values) -> bool:
    """InList(value, v1, v2, ...)"""
    return v in values or _to_str(v) in [_to_str(x) for x in values]


# ── Date/time constructors ─────────────────────────────────────────────────

def fn_today() -> datetime.date:
    return datetime.date.today()

def fn_now() -> datetime.datetime:
    return datetime.datetime.now()

def fn_currentdate() -> datetime.date:
    return datetime.date.today()

def fn_currentdatetime() -> datetime.datetime:
    return datetime.datetime.now()

def fn_timer() -> int:
    """Seconds since midnight."""
    n = datetime.datetime.now()
    return n.hour * 3600 + n.minute * 60 + n.second


# ── Registry ───────────────────────────────────────────────────────────────

# Map lowercase CR function names → (callable, min_args, max_args)
_REGISTRY: dict[str, tuple] = {
    # Date/time constructors
    "today":          (fn_today,            0, 0),
    "now":            (fn_now,              0, 0),
    "currentdate":    (fn_currentdate,      0, 0),
    "currentdatetime":(fn_currentdatetime,  0, 0),
    "timer":          (fn_timer,            0, 0),
    # Date
    "dateadd":       (fn_dateadd,       3, 3),
    "datediff":      (fn_datediff,      3, 3),
    "dateserial":    (fn_dateserial,    3, 3),
    "datevalue":     (fn_datevalue,     1, 1),
    "cdate":         (fn_cdate,         1, 1),
    "year":          (fn_year,          1, 1),
    "month":         (fn_month,         1, 1),
    "day":           (fn_day,           1, 1),
    "hour":          (fn_hour,          1, 1),
    "minute":        (fn_minute,        1, 1),
    "second":        (fn_second,        1, 1),
    "dayofweek":     (fn_dayofweek,     1, 1),
    "weekdayname":   (fn_weekdayname,   1, 2),
    "monthname":     (fn_monthname,     1, 2),
    # String
    "mid":           (fn_mid,           2, 3),
    "left":          (fn_left,          2, 2),
    "right":         (fn_right,         2, 2),
    "instr":         (fn_instr,         2, 3),
    "replace":       (fn_replace,       3, 3),
    "split":         (fn_split,         1, 2),
    "join":          (fn_join,          1, 2),
    "space":         (fn_space,         1, 1),
    "chr":           (fn_chr,           1, 1),
    "asc":           (fn_asc,           1, 1),
    "val":           (fn_val,           1, 1),
    "len":           (fn_len,           1, 1),
    "trimleft":      (fn_trimleft,      1, 1),
    "trimright":     (fn_trimright,     1, 1),
    "propercase":    (fn_propercase,    1, 1),
    "replicatestring":(fn_replicatestring,2,2),
    "reverse":       (fn_reverse,       1, 1),
    "uppercase":     (lambda s: _to_str(s).upper(), 1, 1),
    "lowercase":     (lambda s: _to_str(s).lower(), 1, 1),
    "trim":          (lambda s: _to_str(s).strip(), 1, 1),
    # Crystal Reports canonical name aliases
    "ucase":         (lambda s: _to_str(s).upper(), 1, 1),
    "lcase":         (lambda s: _to_str(s).lower(), 1, 1),
    "ltrim":         (fn_trimleft,  1, 1),
    "rtrim":         (fn_trimright, 1, 1),
    "strreverse":    (fn_reverse,   1, 1),
    "ucfirst":       (lambda s: _to_str(s).capitalize(), 1, 1),
    # Conversion
    "tonumber":      (fn_tonumber,      1, 1),
    "totext":        (fn_totext,        1, 3),
    "cbool":         (fn_cbool,         1, 1),
    "cstr":          (fn_cstr,          1, 1),
    "cdbl":          (fn_cdbl,          1, 1),
    "cint":          (fn_cint,          1, 1),
    # Math
    "round":         (fn_round,         1, 2),
    "truncate":      (fn_truncate,      1, 2),
    "remainder":     (fn_remainder,     2, 2),
    "int":           (fn_int,           1, 1),
    "fix":           (fn_fix,           1, 1),
    "abs":           (fn_abs,           1, 1),
    "sgn":           (fn_sgn,           1, 1),
    "sqrt":          (fn_sqrt,          1, 1),
    "exp":           (fn_exp,           1, 1),
    "log":           (fn_log,           1, 1),
    "sin":           (fn_sin,           1, 1),
    "cos":           (fn_cos,           1, 1),
    "pi":            (fn_pi,            0, 0),
    "power":         (fn_power,         2, 2),
    # Formatting
    "numerictext":   (fn_numerictext,   1, 2),
    "towords":       (fn_towords,       1, 1),
    "picture":       (fn_picture,       2, 2),
    # Null/type
    "isnull":        (fn_isnull,        1, 1),
    "isdate":        (fn_isdate,        1, 1),
    "isnumber":      (fn_isnumber,      1, 1),
    "isstring":      (fn_isstring,      1, 1),
    # Conditional
    "iif":           (fn_iif,           3, 3),
    "choose":        (fn_choose,        2, 99),
    "switch":        (fn_switch,        2, 99),
    # Range
    "inrange":       (fn_in_range,      3, 3),
    "inlist":        (fn_in_list,       2, 99),
}


def call(name: str, args: list) -> Any:
    """Dispatch a CR function call. Raises KeyError if unknown."""
    key = name.lower()
    if key not in _REGISTRY:
        raise KeyError(f"Unknown CR function: {name}")
    fn, min_a, max_a = _REGISTRY[key]
    if len(args) < min_a or len(args) > max_a:
        raise TypeError(f"{name}: expected {min_a}-{max_a} args, got {len(args)}")
    return fn(*args)


def is_cr_function(name: str) -> bool:
    return name.lower() in _REGISTRY

# Public alias for tests
REGISTRY = _REGISTRY
