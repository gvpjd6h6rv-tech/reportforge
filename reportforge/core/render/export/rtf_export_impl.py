from __future__ import annotations

from pathlib import Path

from ..pipeline.normalizer import normalize_layout
from ..resolvers.field_resolver import FieldResolver
from ..expressions.evaluator import ExpressionEvaluator
from ..expressions.aggregator import Aggregator


def _field_label(fp: str) -> str:
    part = fp.split(".")[-1] if "." in fp else fp
    return part.replace("_", " ").replace("-", " ").title()


def _rtf_str(s: str) -> str:
    out = []
    for ch in str(s):
        if ch == "\\":
            out.append("\\\\")
        elif ch == "{":
            out.append("\\{")
        elif ch == "}":
            out.append("\\}")
        elif ch == "\n":
            out.append("\\par\n")
        elif ord(ch) > 127:
            out.append(f"\\u{ord(ch)}?")
        else:
            out.append(ch)
    return "".join(out)


def _cell(s: str, width_twips: int = 1800) -> str:
    return _rtf_str(s) + r"\cell "


def _mm_tw(mm):
    return int(mm * 56.7)


def export_rtf(layout_raw: dict, data: dict, output_path: str | Path) -> Path:
    norm = normalize_layout(layout_raw)
    resolver = FieldResolver(data)
    items = list(data.get("items", []))
    ev = ExpressionEvaluator(items)
    agg = Aggregator(items)

    fonttbl = (
        r"{\fonttbl"
        r"{\f0\froman\fcharset0 Times New Roman;}"
        r"{\f1\fswiss\fcharset0 Arial;}"
        r"{\f2\fmodern\fcharset0 Courier New;}"
        r"}"
    )

    colortbl = (
        r"{\colortbl;"
        r"\red0\green0\blue0;"
        r"\red255\green255\blue255;"
        r"\red192\green81\blue26;"
        r"\red26\green58\blue107;"
        r"\red100\green100\blue100;"
        r"}"
    )

    margins = norm.get("margins", {"top": 15, "bottom": 15, "left": 20, "right": 20})
    pagesetup = (
        f"\\paperw11907\\paperh16840"
        f"\\margt{_mm_tw(margins.get('top',15))}"
        f"\\margb{_mm_tw(margins.get('bottom',15))}"
        f"\\margl{_mm_tw(margins.get('left',20))}"
        f"\\margr{_mm_tw(margins.get('right',20))}"
    )

    sec_map: dict[str, list] = {}
    for el in norm.get("elements", []):
        sec_map.setdefault(el.get("sectionId", ""), []).append(el)

    secs_by_type: dict[str, list] = {}
    for s in norm.get("sections", []):
        secs_by_type.setdefault(s["stype"], []).append(s)

    def _els_flat(stype: str):
        result = []
        for s in secs_by_type.get(stype, []):
            result.extend(sec_map.get(s["id"], []))
        return [e for e in result if e.get("type") in ("text", "field")]

    def _resolve(el: dict, item: dict | None = None) -> str:
        tp = el.get("type", "text")
        if tp == "text":
            content = el.get("content", "")
            if ev.contains_expr(content):
                res = resolver.with_item(item) if item else resolver
                content = ev.eval_text(content, res)
            return content
        if tp == "field":
            fp = el.get("fieldPath", "")
            fmt = el.get("fieldFmt")
            if not fp:
                return ""
            res = resolver.with_item(item) if item else resolver
            _SF = {
                "PageNumber": "1",
                "TotalPages": "?",
                "PrintDate": __import__("datetime").date.today().strftime("%d/%m/%Y"),
            }
            if fp in _SF:
                return _SF[fp]
            return str(res.get_formatted(fp, fmt))
        return ""

    def _section_text(els, item=None, bold=False):
        parts = sorted(els, key=lambda e: e.get("x", 0))
        combined = "  ".join(_resolve(e, item) for e in parts if _resolve(e, item))
        if not combined.strip():
            return ""
        if bold:
            return r"{\b " + _rtf_str(combined) + r"}\par" + "\n"
        return _rtf_str(combined) + r"\par" + "\n"

    body_parts = []

    rh_els = _els_flat("rh")
    if rh_els:
        body_parts.append(r"{\f1\fs18\cf4 ")
        body_parts.append(_section_text(rh_els, bold=True))
        body_parts.append("}")

    det_secs = secs_by_type.get("det", [])
    det_els = [e for s in det_secs for e in sec_map.get(s["id"], []) if e.get("type") in ("text", "field") and e.get("fieldPath")]
    det_els.sort(key=lambda e: e.get("x", 0))

    groups = norm.get("groups", [])
    if det_els:
        col_w = max(1000, 8000 // max(1, len(det_els)))
        row_defs = "".join(f"\\cellx{(i+1)*col_w}" for i in range(len(det_els)))
        body_parts.append(r"{\trowd\trgaph108\trleft-108" + row_defs)
        body_parts.append(r"{\b\f1\fs16\cf2 ")
        for el in det_els:
            label = el.get("content") or _field_label(el.get("fieldPath", ""))
            body_parts.append(r"{\shading10000\shdgcolor4\shdfgcolor4 ")
            body_parts.append(_rtf_str(label))
            body_parts.append(r"}\cell ")
        body_parts.append(r"}\row" + "\n}")

        def _write_item_row(item, gitems=None):
            body_parts.append(r"{\trowd\trgaph108\trleft-108" + row_defs)
            body_parts.append(r"{\f1\fs16 ")
            for el in det_els:
                body_parts.append(_cell(_resolve(el, item), col_w))
            body_parts.append(r"}\row" + "\n}")

        if not groups:
            for item in items:
                _write_item_row(item)
        else:
            from itertools import groupby as _groupby
            gf = groups[0]["field"]
            sorted_items = sorted(items, key=lambda it: str(it.get(gf, "")))
            for gval, git in _groupby(sorted_items, key=lambda it: it.get(gf, "")):
                gitems = list(git)
                body_parts.append(r"{\trowd\trgaph108\trleft-108" + f"\\cellx{len(det_els)*col_w}")
                body_parts.append(r"{\b\f1\fs16 " + _rtf_str(str(gval)) + r"\cell}")
                body_parts.append(r"\row" + "\n}")
                for item in gitems:
                    _write_item_row(item, gitems)

    rf_els = _els_flat("rf")
    if rf_els:
        body_parts.append(r"\par{\f1\fs14\cf5 ")
        body_parts.append(_section_text(rf_els))
        body_parts.append("}")

    rtf = (
        r"{\rtf1\ansi\ansicpg1252\deff0\deflang3082"
        + fonttbl
        + colortbl
        + pagesetup
        + "\n"
        + "".join(body_parts)
        + "\n}"
    )

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(rtf, encoding="latin-1", errors="replace")
    return out

