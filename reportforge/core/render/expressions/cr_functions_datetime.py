from __future__ import annotations

import datetime
from typing import Any

from .cr_functions_shared import _to_date, _to_datetime, _to_num

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
        year = d.year + (month - 1) // 12
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
    interval = str(interval).strip().lower().strip('"\'')
    d1 = _to_date(date1)
    d2 = _to_date(date2)
    key = _INTERVALS.get(interval, interval)
    delta = d2 - d1
    if key == "day":
        return delta.days
    if key == "week":
        return delta.days // 7
    if key == "year":
        return d2.year - d1.year
    if key == "month":
        return (d2.year - d1.year) * 12 + (d2.month - d1.month)
    if key == "quarter":
        return fn_datediff("m", d1, d2) // 3
    if key == "hour":
        return int(delta.total_seconds() // 3600)
    if key == "minute":
        return int(delta.total_seconds() // 60)
    if key == "second":
        return int(delta.total_seconds())
    return delta.days


def fn_dateserial(year: Any, month: Any, day: Any) -> datetime.date:
    try:
        return datetime.date(int(_to_num(year)), int(_to_num(month)), int(_to_num(day)))
    except ValueError:
        return datetime.date.today()


def fn_datevalue(v: Any) -> datetime.date:
    return _to_date(v)


def fn_cdate(v: Any) -> str:
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
    return (_to_date(v).weekday() + 1) % 7 + 1


def fn_weekdayname(n: Any, abbreviated: Any = False) -> str:
    days_full = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    days_abbr = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    idx = (int(_to_num(n)) - 1) % 7
    return days_abbr[idx] if abbreviated else days_full[idx]


def fn_monthname(n: Any, abbreviated: Any = False) -> str:
    months_full = ["", "January", "February", "March", "April", "May", "June",
                   "July", "August", "September", "October", "November", "December"]
    months_abbr = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    idx = int(_to_num(n)) % 13
    return months_abbr[idx] if abbreviated else months_full[idx]


def fn_today() -> datetime.date:
    return datetime.date.today()


def fn_now() -> datetime.datetime:
    return datetime.datetime.now()


def fn_currentdate() -> datetime.date:
    return datetime.date.today()


def fn_currentdatetime() -> datetime.datetime:
    return datetime.datetime.now()


def fn_timer() -> int:
    n = datetime.datetime.now()
    return n.hour * 3600 + n.minute * 60 + n.second
