from __future__ import annotations

from typing import Any

from .cr_functions_shared import _to_num, _to_str


def fn_numerictext(n: Any, picture: Any = "##,##0.00") -> str:
    n = _to_num(n)
    pic = _to_str(picture)
    if "." in pic:
        dec = len(pic.split(".")[1].replace("#", "0"))
        use_sep = "," in pic.split(".")[0]
    else:
        dec = 0
        use_sep = "," in pic
    import decimal as _dec
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
    n = _to_num(n)
    int_part = int(abs(n))
    dec_part = round(abs(n) - int_part, 2)

    ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
            "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
            "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    def _below_1000(x):
        if x == 0:
            return ""
        if x < 20:
            return ones[x]
        if x < 100:
            return tens[x // 10] + (" " + ones[x % 10] if x % 10 else "")
        return ones[x // 100] + " Hundred" + (" " + _below_1000(x % 100) if x % 100 else "")

    def _convert(x):
        if x == 0:
            return "Zero"
        parts = []
        billions = x // 1_000_000_000
        millions = (x % 1_000_000_000) // 1_000_000
        thousands = (x % 1_000_000) // 1_000
        rem = x % 1_000
        if billions:
            parts.append(_below_1000(billions) + " Billion")
        if millions:
            parts.append(_below_1000(millions) + " Million")
        if thousands:
            parts.append(_below_1000(thousands) + " Thousand")
        if rem:
            parts.append(_below_1000(rem))
        return " ".join(parts)

    result = ("Negative " if n < 0 else "") + _convert(int_part)
    if dec_part > 0:
        cents = round(dec_part * 100)
        result += f" and {cents:02d}/100"
    return result


def fn_picture(s: Any, template: Any) -> str:
    s = _to_str(s).replace(" ", "").replace("-", "").replace(".", "")
    t = _to_str(template)
    out, si = [], 0
    for ch in t:
        if ch == "X":
            if si < len(s):
                out.append(s[si]); si += 1
            else:
                out.append(" ")
        else:
            out.append(ch)
    return "".join(out)
