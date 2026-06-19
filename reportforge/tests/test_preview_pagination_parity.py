"""PV-PAG-PARITY — render-layer (Python engine) vs hit-layer (JS SSOT).

1 file = 1 responsibility: prove both paginators agree on rows-per-page for
real factura/guia layouts at 1/2/N pages. Adversarial: drives the actual
AdvancedHtmlEngine and the actual PreviewPaginationEngine.js (via node).
"""
import json
import os
import re
import math
import subprocess
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from reportforge.core.render.engines.advanced_engine import AdvancedHtmlEngine  # noqa: E402
from reportforge.core.render.pipeline.normalizer import normalize_layout  # noqa: E402

FIXTURE = os.path.join(ROOT, "examples", "pagination_adversarial.json")


def _engine_rows_per_page(layout, data):
    html = AdvancedHtmlEngine(layout, data).render()
    pages = re.split(r'class="rpt-page"', html)[1:]
    return [len(re.findall(r"cr-detail-row", p)) for p in pages]


def _js_rows_per_page(layout, data):
    norm = normalize_layout(layout)
    margins = layout.get("margins", {}) or {}
    detail = [s for s in layout["sections"] if s.get("iterates")]
    assert len(detail) == 1, "fixture must expose exactly one detail section"
    metrics = {
        "pageH": norm.get("pageHeight", 1123),
        "mTop": int(float(margins.get("top", 0)) * 3.7795),
        "mBot": int(float(margins.get("bottom", 0)) * 3.7795),
    }
    secs = [{"stype": s.get("stype"), "height": s.get("height", 0), "newPageBefore": s.get("newPageBefore", False)}
            for s in layout["sections"]]
    script = f"""
      const fs=require('fs'), vm=require('vm');
      const src=fs.readFileSync({json.dumps(os.path.join(ROOT, 'engines/PreviewPaginationEngine.js'))},'utf8');
      const ctx={{window:{{}}}}; vm.runInNewContext(src, ctx);
      const PT=1.333, CH=0.6;
      const items={json.dumps(data["items"])};
      const detail={json.dumps(detail)};
      const detEls={json.dumps([e for e in layout["elements"] if e.get("sectionId") in {s["id"] for s in detail}])};
      function resolve(path,row){{ if(!path) return ''; const k=path.replace(/^items?\\./,''); return row[k]; }}
      function calcElH(el,v){{ if(v===null || v===undefined || v==='') return el.h; const cw=Math.max(1,Math.trunc(el.w/Math.max(0.01,el.fontSize*PT*CH))); const lh=Math.trunc(el.fontSize*PT*1.4); const t=String(v).replace(/<[^>]+>/g,''); return Math.max(el.h, Math.max(1,Math.ceil(t.length/cw))*lh+4); }}
      function rowH(sec,row){{ let extra=0; for(const el of detEls.filter(e=>e.sectionId===sec.id)){{ if(!el.canGrow) continue; const v=el.type==='field'&&el.fieldPath?resolve(el.fieldPath,row):(el.content!==null && el.content!==undefined ? el.content : ''); extra=Math.max(extra, calcElH(el,v)-el.h); }} return (sec.height|0)+extra; }}
      const rows=[];
      for(const it of items) for(const sec of detail) rows.push({{height:rowH(sec,it), forceBreak:!!sec.newPageBefore}});
      const plan=ctx.window.PreviewPaginationEngine.paginate({json.dumps(secs)}, rows, {json.dumps(metrics)});
      process.stdout.write(JSON.stringify(plan.pages.map(p=>p.rowEnd-p.rowStart)));
    """
    out = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def _js_runtime_rows_per_page(layout, data):
    detail = [s for s in layout["sections"] if s.get("iterates")]
    assert len(detail) == 1, "fixture must expose exactly one detail section"
    detail_id = detail[0]["id"]
    script = f"""
      const fs=require('fs'), vm=require('vm');
      const root={json.dumps(ROOT)};
      const ctx={{window:{{}}, globalThis:{{}}}};
      ctx.window=ctx; ctx.globalThis=ctx;
      ctx.PreviewEngineContracts={{assertLayoutContract(){{}}}};
      ctx.CFG={{PAGE_W:{json.dumps(layout.get("pageWidth", 754))}, PAGE_H:{json.dumps(layout.get("pageHeight", 1123))}, margins:{json.dumps(layout.get("margins", {}) or {})}}};
      ctx.DS={{sections:{json.dumps(layout["sections"])}, elements:{json.dumps(layout["elements"])}, margins:{json.dumps(layout.get("margins", {}) or {})}}};
      ctx.resolveField=(path,data,item)=>{{ if(!path) return ''; const src=((path.startsWith('items.')||path.startsWith('item.'))&&item)?item:data; const keys=path.replace(/^items?\\./,'').split('.'); let v=src; for(const k of keys){{ if(v==null) return ''; v=v[k]; }} return v==null?'':v; }};
      ctx.formatValue=(v)=>v==null?'':String(v);
      vm.runInNewContext(fs.readFileSync(root + '/engines/PreviewPaginationEngine.js','utf8'), ctx);
      vm.runInNewContext(fs.readFileSync(root + '/engines/PreviewEngineData.js','utf8'), ctx);
      const html = ctx.PreviewEngineData.renderWithData({json.dumps(data)});
      process.stdout.write(JSON.stringify(html.split('<div class="pv-page"').slice(1).map((p) => (p.match(new RegExp('data-section-id="{detail_id}"', 'g')) || []).length)));
    """
    out = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True)
    return json.loads(out.stdout or "[]")


def _js_runtime_html(layout, data):
    script = f"""
      const fs=require('fs'), vm=require('vm');
      const root={json.dumps(ROOT)};
      const ctx={{window:{{}}, globalThis:{{}}}};
      ctx.window=ctx; ctx.globalThis=ctx;
      ctx.PreviewEngineContracts={{assertLayoutContract(){{}}}};
      ctx.CFG={{PAGE_W:{json.dumps(layout.get("pageWidth", 754))}, PAGE_H:{json.dumps(layout.get("pageHeight", 1123))}, margins:{json.dumps(layout.get("margins", {}) or {})}}};
      ctx.DS={{sections:{json.dumps(layout["sections"])}, elements:{json.dumps(layout["elements"])}, margins:{json.dumps(layout.get("margins", {}) or {})}}};
      ctx.resolveField=(path,data,item)=>{{ if(!path) return ''; const src=((path.startsWith('items.')||path.startsWith('item.'))&&item)?item:data; const keys=path.replace(/^items?\\./,'').split('.'); let v=src; for(const k of keys){{ if(v==null) return ''; v=v[k]; }} return v==null?'':v; }};
      ctx.formatValue=(v)=>v==null?'':String(v);
      vm.runInNewContext(fs.readFileSync(root + '/engines/PreviewPaginationEngine.js','utf8'), ctx);
      vm.runInNewContext(fs.readFileSync(root + '/engines/PreviewEngineData.js','utf8'), ctx);
      process.stdout.write(ctx.PreviewEngineData.renderWithData({json.dumps(data)}));
    """
    out = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True)
    return out.stdout


def _contract_rows(layout, data):
    margins = layout.get("margins", {}) or {}
    ph_h = sum(s["height"] for s in layout["sections"] if s["stype"] == "ph")
    pf_h = sum(s["height"] for s in layout["sections"] if s["stype"] == "pf")
    rh_h = sum(s["height"] for s in layout["sections"] if s["stype"] == "rh")
    usable = layout["pageHeight"] - int(float(margins.get("top", 0)) * 3.7795) - int(float(margins.get("bottom", 0)) * 3.7795) - ph_h - pf_h
    rows = [_row_height(layout, item) for item in data["items"]]
    pages = []
    cur = 0
    cy = 0
    for i, row_h in enumerate(rows):
        avail = usable - (rh_h if not pages else 0)
        if cur and cy + row_h > avail:
            pages.append(cur)
            cur = 0
            cy = 0
            avail = usable
        cur += 1
        cy += row_h
    if cur:
        pages.append(cur)
    return pages


def _row_height(layout, item):
    det = next(s for s in layout["sections"] if s["stype"] == "det")
    base = det["height"]
    extra = 0
    for el in layout["elements"]:
        if el.get("sectionId") != det["id"] or not el.get("canGrow"):
            continue
        value = ""
        path = el.get("fieldPath", "")
        if path:
            key = path.replace("items.", "").replace("item.", "")
            value = item.get(key, "")
        else:
            value = el.get("content", "")
        if value is None or value == "":
            continue
        cw = max(1, int(el["w"] / max(0.01, el["fontSize"] * 1.333 * 0.6)))
        lh = int(el["fontSize"] * 1.333 * 1.4)
        txt = re.sub(r"<[^>]+>", "", str(value))
        extra = max(extra, max(el["h"], max(1, math.ceil(len(txt) / cw)) * lh + 4) - el["h"])
    return base + extra


def test_render_and_hit_layers_paginate_identically():
    if not os.path.exists(FIXTURE):
        pytest.fail(f"fixture missing: {FIXTURE}")
    fixture = json.load(open(FIXTURE, encoding="utf-8"))
    cases = []
    layout = fixture["layout"]
    data = fixture["data"]
    cases.append(("nonzero-margins", layout, data))

    zero_layout = json.loads(json.dumps(layout))
    zero_layout["margins"]["top"] = 0
    zero_layout["margins"]["bottom"] = 0
    zero_layout["pageHeight"] = 1053
    cases.append(("zero-margins", zero_layout, data))

    grow_layout = json.loads(json.dumps(layout))
    grow_layout["elements"].append({
        "id": "dt-grow",
        "type": "field",
        "sectionId": "s-dt",
        "x": 4,
        "y": 16,
        "w": 180,
        "h": 14,
        "fieldPath": "item.note",
        "fontSize": 8,
        "canGrow": True,
    })
    grow_data = {"items": [{"code": f"G{i:03}", "name": f"Grow {i}", "note": "G" * 180} for i in range(4)]}
    cases.append(("growable-row", grow_layout, grow_data))

    zero_layout = {
        "name": "Zero Growable Field",
        "pageSize": "A4",
        "pageWidth": 754,
        "pageHeight": 27,
        "margins": {"top": 0, "right": 0, "bottom": 0, "left": 0},
        "sections": [
            {"id": "s-det", "stype": "det", "height": 10, "iterates": "items"},
        ],
        "elements": [
            {
                "id": "dt-zero",
                "type": "field",
                "sectionId": "s-det",
                "x": 4,
                "y": 0,
                "w": 180,
                "h": 10,
                "fieldPath": "item.note",
                "fontSize": 8,
                "canGrow": True,
            }
        ],
    }
    zero_data = {"items": [{"note": 0}, {"note": 0}]}
    cases.append(("zero-growable", zero_layout, zero_data))

    zero_content_layout = {
        "name": "Zero Growable Content",
        "pageSize": "A4",
        "pageWidth": 754,
        "pageHeight": 27,
        "margins": {"top": 0, "right": 0, "bottom": 0, "left": 0},
        "sections": [
            {"id": "s-det", "stype": "det", "height": 10, "iterates": "items"},
        ],
        "elements": [
            {
                "id": "dt-zero-content",
                "type": "text",
                "sectionId": "s-det",
                "x": 4,
                "y": 0,
                "w": 180,
                "h": 10,
                "content": 0,
                "fontSize": 8,
                "fontFamily": "Arial",
                "align": "left",
                "color": "#000000",
                "canGrow": True,
            }
        ],
    }
    zero_content_data = {"items": [{"code": "Z001"}, {"code": "Z002"}]}
    cases.append(("zero-growable-content", zero_content_layout, zero_content_data))

    for label, case_layout, case_data in cases:
        eng = _engine_rows_per_page(case_layout, case_data)
        js = _js_rows_per_page(case_layout, case_data)
        assert js == eng, f"{label}: pagination mismatch: engine={eng} js={js}"
        assert eng == _contract_rows(case_layout, case_data), f"{label}: contract mismatch: rows per page = {eng}"


def test_runtime_preview_engine_matches_python_for_integer_mm_margins():
    layout = {
        "name": "Runtime MM Margins",
        "pageSize": "A4",
        "pageWidth": 100,
        "pageHeight": 37,
        "margins": {"top": 1, "right": 0, "bottom": 1, "left": 0},
        "sections": [
            {"id": "s-det", "stype": "det", "height": 15, "iterates": "items"},
        ],
        "elements": [],
    }
    data = {"items": [{"code": "R001"}, {"code": "R002"}, {"code": "R003"}]}
    eng = _engine_rows_per_page(layout, data)
    js = _js_runtime_rows_per_page(layout, data)
    assert eng == js == [2, 1], f"runtime preview mismatch: engine={eng} js={js}"


def test_runtime_preview_engine_preserves_zero_growable_content():
    layout = {
        "name": "Runtime Zero Content",
        "pageSize": "A4",
        "pageWidth": 100,
        "pageHeight": 27,
        "margins": {"top": 0, "right": 0, "bottom": 0, "left": 0},
        "sections": [
            {"id": "s-det", "stype": "det", "height": 10, "iterates": "items"},
        ],
        "elements": [
            {
                "id": "dt-zero-content",
                "type": "text",
                "sectionId": "s-det",
                "x": 4,
                "y": 0,
                "w": 180,
                "h": 10,
                "content": 0,
                "fontSize": 8,
                "fontFamily": "Arial",
                "align": "left",
                "color": "#000000",
                "canGrow": True,
            }
        ],
    }
    data = {"items": [{"code": "Z001"}, {"code": "Z002"}]}
    pages = _js_runtime_rows_per_page(layout, data)
    html = _js_runtime_html(layout, data)
    assert pages == [1, 1], f"runtime zero-content pagination mismatch: pages={pages}"
    assert ">0</div>" in html, "runtime zero-content HTML should render the numeric 0"
