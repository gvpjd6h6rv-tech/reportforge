from __future__ import annotations

from itertools import groupby

from .advanced_engine_shared import _ROW_EVEN, _ROW_ODD, _sk
from .element_renderers import calc_row_height, render_element
from ..expressions.aggregator import Aggregator


class AdvancedEngineRender:
    def _pages(self) -> str:
        ph_h = sum(s.height for s in self._secs("ph"))
        pf_h = sum(s.height for s in self._secs("pf"))
        rh_h = sum(s.height for s in self._secs("rh"))
        usable = self._page_h - self._mtop - self._mbot - ph_h - pf_h
        body = self._body_rows()
        pages: list[list] = []
        cur: list = []
        cy = float(rh_h)
        for row in body:
            sec = row["s"]
            force_break = getattr(sec, "newPageBefore", False)
            avail = usable - (rh_h if not pages else 0)
            row_h = row["h"]
            if (force_break and cur) or (cy + row_h > avail and cur):
                pages.append(cur)
                cur = []
                cy = 0.0
            cur.append(row)
            cy += row_h
        pages.append(cur)
        total_pages = len(pages)
        return "\n".join(self._page(rows, i == 0, i == len(pages) - 1, i + 1, total_pages) for i, rows in enumerate(pages))

    def _body_rows(self) -> list[dict]:
        rows = []
        det = self._secs("det")
        if not self._groups:
            for i, item in enumerate(self._items):
                prev_item = self._items[i - 1] if i > 0 else None
                next_item = self._items[i + 1] if i < len(self._items) - 1 else None
                for s in det:
                    if self._suppress_section(s, self._resolver.with_item(item)):
                        continue
                    rows.append({
                        "s": s, "item": item, "i": i, "alt": i % 2 == 1,
                        "h": calc_row_height(self, s, item), "gitems": [],
                        "gval": None, "gtype": "det", "record_number": i + 1,
                        "prev": prev_item, "next": next_item,
                    })
        else:
            rows = self._body_rows_grouped(self._items, self._groups, 0, det)
        return rows

    def _body_rows_grouped(self, items, groups, level, det_secs, parent_gitems=None):
        rows = []
        if not groups:
            for di, item in enumerate(items):
                for s in det_secs:
                    if self._suppress_section(s, self._resolver.with_item(item)):
                        continue
                    rows.append({
                        "s": s, "item": item, "i": di, "alt": di % 2 == 1,
                        "h": calc_row_height(self, s, item), "gitems": parent_gitems or items,
                        "gval": None, "gtype": "det", "record_number": di + 1,
                    })
            return rows
        gf = groups[0]["field"]
        go = groups[0].get("order", "ASC").upper()
        sorted_items = sorted(items, key=lambda it: _sk(it.get(gf, "")), reverse=(go == "DESC"))
        gi = 0
        for gval, git in groupby(sorted_items, key=lambda it: it.get(gf, "")):
            gitems = list(git)
            for s in self._secs_group("gh", level):
                if not self._suppress_section(s, self._resolver.with_item(gitems[0])):
                    rows.append({
                        "s": s, "item": gitems[0], "i": gi, "alt": False, "h": s.height,
                        "gitems": gitems, "gval": gval, "gtype": "gh", "group_number": gi + 1,
                    })
            rows.extend(self._body_rows_grouped(gitems, groups[1:], level + 1, det_secs, gitems))
            for s in self._secs_group("gf", level):
                if not self._suppress_section(s, self._resolver.with_item(gitems[-1])):
                    rows.append({
                        "s": s, "item": gitems[-1], "i": gi, "alt": False, "h": s.height,
                        "gitems": gitems, "gval": gval, "gtype": "gf", "group_number": gi + 1,
                    })
            gi += 1
        return rows

    def _suppress_section(self, sec, res) -> bool:
        sf = getattr(sec, "suppressFormula", None) or getattr(sec, "suppress", None)
        if not sf or not isinstance(sf, str):
            return bool(sf) if sf else False
        sf = sf.strip()
        if sf.lower() in ("true", "1", "yes"):
            return True
        if sf.lower() in ("false", "0", "no", ""):
            return False
        try:
            return bool(self._ev.eval_expr(sf, res))
        except Exception:
            return False

    def _page(self, rows, first, last, page_num, total_pages) -> str:
        page_width = self._layout.page_width
        ctx = {"page_number": page_num, "total_pages": total_pages, "print_date": self._print_date, "print_time": self._print_time}
        parts = [f'<div class="rpt-page" style="width:{page_width}px">']
        if first:
            for s in self._secs("rh"):
                parts.append(self._static(s, ctx))
        for s in self._secs("ph"):
            parts.append(self._static(s, ctx))
        for row in rows:
            parts.append(self._row(row, ctx))
        if last:
            for s in self._secs("rf"):
                parts.append(self._static(s, ctx))
        for s in self._secs("pf"):
            parts.append(self._static(s, ctx))
        parts.append("</div>")
        return "\n".join(parts)

    def _row(self, row, ctx=None) -> str:
        ctx = dict(ctx or {})
        s = row["s"]
        item = row["item"]
        ctx["record_number"] = row.get("record_number", 1)
        ctx["group_number"] = row.get("group_number", 1)
        if row["gtype"] in ("gh", "gf"):
            agg = Aggregator(row["gitems"])
            res = self._resolver.with_item(item) if item else self._resolver
            return self._sec(s, res, agg, ctx)
        res = self._resolver.with_item(item)
        bg = _ROW_EVEN if row["alt"] else _ROW_ODD
        sbg = getattr(s, "bgColor", "transparent")
        bgs = f"background:{sbg}" if sbg != "transparent" else f"background:{bg}"
        inner = "".join(render_element(self, e, res, self._agg, ctx) for e in self._layout.elements_for(s.id))
        return f'<div class="cr-detail-row" data-stype="det" data-row="{row["i"]}" style="height:{row["h"]}px;{bgs}">{inner}</div>'

    def _static(self, s, ctx=None) -> str:
        return self._sec(s, self._resolver, self._agg, ctx or {})

    def _sec(self, s, res, agg, ctx=None) -> str:
        ctx = ctx or {}
        inner = "".join(render_element(self, e, res, agg, ctx) for e in self._layout.elements_for(s.id))
        sbg = getattr(s, "bgColor", "transparent")
        bgs = f"background:{sbg};" if sbg != "transparent" else ""
        return f'<div class="cr-section" data-section="{s.id}" data-stype="{s.stype}" style="height:{s.height}px;{bgs}">{inner}</div>'

    def _secs(self, stype) -> list:
        return [s for s in self._layout.sections if s.stype == stype]

    def _secs_group(self, stype, gi) -> list:
        return [s for s in self._layout.sections if s.stype == stype and getattr(s, "groupIndex", 0) == gi]
