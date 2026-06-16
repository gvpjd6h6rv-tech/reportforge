"""PV-PAG-PARITY — render-layer (Python engine) vs hit-layer (JS SSOT).

1 file = 1 responsibility: prove both paginators agree on rows-per-page for
real factura/guia layouts at 1/2/N pages. Adversarial: drives the actual
AdvancedHtmlEngine and the actual PreviewPaginationEngine.js (via node).
"""
import json
import os
import re
import subprocess
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from reportforge.core.render.engines.advanced_engine import AdvancedHtmlEngine  # noqa: E402
from reportforge.core.render.pipeline.normalizer import normalize_layout  # noqa: E402

LAYOUTS = [
    os.path.join(ROOT, "examples", "guia_remision_a4.json"),
    os.path.join(ROOT, "examples", "factura_a4.json"),
]


def _engine_rows_per_page(layout, n_items):
    data = {"items": [{"codigo": f"C{i}", "cantidad": str(i), "descripcion": f"ITEM {i}"} for i in range(n_items)]}
    html = AdvancedHtmlEngine(layout, data).render()
    pages = re.split(r'class="rpt-page"', html)[1:]
    return [len(re.findall(r"cr-detail-row", p)) for p in pages]


def _js_rows_per_page(layout, n_items):
    norm = normalize_layout(layout)
    margins = layout.get("margins", {}) or {}
    metrics = {
        "pageH": norm.get("pageHeight", 1123),
        "mTop": round(float(margins.get("top", 0)) * 3.7795),
        "mBot": round(float(margins.get("bottom", 0)) * 3.7795),
    }
    secs = [{"stype": s.get("stype"), "height": s.get("height", 0), "newPageBefore": s.get("newPageBefore", False)}
            for s in layout["sections"]]
    detail = [s for s in layout["sections"] if s.get("iterates")]
    items = [{"codigo": f"C{i}", "cantidad": str(i), "descripcion": f"ITEM {i}"} for i in range(n_items)]
    det_els = [e for e in layout["elements"] if e.get("sectionId") in {s["id"] for s in detail}]
    script = f"""
      const fs=require('fs'), vm=require('vm');
      const src=fs.readFileSync({json.dumps(os.path.join(ROOT, 'engines/PreviewPaginationEngine.js'))},'utf8');
      const ctx={{window:{{}}}}; vm.runInNewContext(src, ctx);
      const PT=1.333, CH=0.6;
      const detEls={json.dumps(det_els)};
      const items={json.dumps(items)};
      const detail={json.dumps(detail)};
      function resolve(path,row){{ if(!path) return ''; const k=path.replace(/^items?\\./,''); return row[k]!=null?String(row[k]):''; }}
      function calcElH(el,v){{ if(!v) return el.h; const cw=Math.max(1,Math.trunc(el.w/Math.max(0.01,el.fontSize*PT*CH))); const lh=Math.trunc(el.fontSize*PT*1.4); const t=String(v).replace(/<[^>]+>/g,''); return Math.max(el.h, Math.max(1,Math.ceil(t.length/cw))*lh+4); }}
      function rowH(sec,row){{ let extra=0; for(const el of detEls.filter(e=>e.sectionId===sec.id)){{ if(!el.canGrow) continue; const v=el.type==='field'&&el.fieldPath?resolve(el.fieldPath,row):(el.content||''); extra=Math.max(extra, calcElH(el,String(v))-el.h); }} return (sec.height|0)+extra; }}
      const rows=[];
      for(const it of items) for(const sec of detail) rows.push({{height:rowH(sec,it), forceBreak:!!sec.newPageBefore}});
      const plan=ctx.window.PreviewPaginationEngine.paginate({json.dumps(secs)}, rows, {json.dumps(metrics)});
      process.stdout.write(JSON.stringify(plan.pages.map(p=>p.rowEnd-p.rowStart)));
    """
    out = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


@pytest.mark.parametrize("layout_path", LAYOUTS)
@pytest.mark.parametrize("n_items", [1, 2, 30, 60, 200])
def test_render_and_hit_layers_paginate_identically(layout_path, n_items):
    if not os.path.exists(layout_path):
        pytest.skip(f"layout missing: {layout_path}")
    layout = json.load(open(layout_path, encoding="utf-8"))
    eng = _engine_rows_per_page(layout, n_items)
    js = _js_rows_per_page(layout, n_items)
    assert js == eng, f"pagination mismatch items={n_items}: engine={eng} js={js}"
