import threading, http.server, sys, time
sys.path.insert(0, ".")
from reportforge_server import RFHandler
server = http.server.HTTPServer(("127.0.0.1", 8088), RFHandler)
threading.Thread(target=server.serve_forever, daemon=True).start()
time.sleep(1)

from playwright.sync_api import sync_playwright
errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
        args=["--no-sandbox","--disable-setuid-sandbox"])
    page = browser.new_page(viewport={"width":1400,"height":900})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto("http://127.0.0.1:8088/", wait_until="networkidle")
    page.wait_for_timeout(1500)

    # ── Geometry probes ────────────────────────────────────────────
    geo = page.evaluate("""() => {
        const cs = getComputedStyle(document.documentElement);
        const ws = document.getElementById('canvas-scroll');
        const cl = document.getElementById('canvas-surface');
        const wR = ws.getBoundingClientRect(), cR = cl.getBoundingClientRect();
        const layerOrder = [];
        for(const ss of document.styleSheets){
            try{ for(const r of ss.cssRules){
                if(r.constructor.name==='CSSLayerStatementRule') layerOrder.push(...r.nameList);
            }}catch(e){}
        }
        const labels = [];
        document.querySelectorAll('.cr-section').forEach(sec=>{
            const lbl=sec.querySelector('.section-label');
            if(!lbl)return;
            const sR=sec.getBoundingClientRect(),lR=lbl.getBoundingClientRect();
            labels.push(Math.abs((sR.top+sR.height/2)-(lR.top+lR.height/2)));
        });
        return {
            centerDelta:   Math.abs((wR.left+wR.width/2)-(cR.left+cR.width/2)),
            maxLabelDelta: Math.max(...labels, 0),
            layerCount:    new Set(layerOrder).size,
            springPhysics: cs.getPropertyValue('--rf-transition').includes('cubic-bezier'),
            layers: ['sections-layer','elements-layer','guides-layer','selection-layer','handles-layer','labels-layer']
                .map(l=>!!(document.getElementById(l)||document.querySelector('.'+l))).every(Boolean),
        };
    }""")
    geo_fails = []
    if geo['centerDelta'] >= 2:   geo_fails.append(f"centerDelta={geo['centerDelta']:.2f}")
    if geo['maxLabelDelta'] >= 2: geo_fails.append(f"maxLabelDelta={geo['maxLabelDelta']:.1f}")
    if not geo['layers']:         geo_fails.append("DOM layers missing")
    if geo['layerCount'] < 16:    geo_fails.append(f"layerCount={geo['layerCount']}")
    if not geo['springPhysics']:  geo_fails.append("spring physics off")
    if errors:                    geo_fails.append(f"JS errors: {errors}")
    if geo_fails:
        print("FAIL: " + "; ".join(geo_fails)); sys.exit(1)
    print(f"OK: centerDelta={geo['centerDelta']:.2f}, maxLabelDelta={geo['maxLabelDelta']:.1f}, layers={geo['layerCount']}, springPhysics={geo['springPhysics']}")

    # ── Zoom tests ─────────────────────────────────────────────────
    zoom = page.evaluate("""() => {
        DesignZoomEngine.set(0.25);
        const d_a = DS.zoom;
        DS.previewMode=true; document.body.setAttribute('data-render-mode','preview');
        PreviewZoomEngine.set(4.0);
        const pv_b=DS.previewZoom, d_b=DS.zoom;
        DS.previewMode=false; document.body.removeAttribute('data-render-mode');
        const d_c=DS.zoom;
        DesignZoomEngine.set(1.0);
        const el=document.querySelector('.cr-element');
        let t2=false;
        if(el){
            const mw=parseFloat(el.style.width)||el.getBoundingClientRect().width/DS.zoom;
            DesignZoomEngine.set(4.0);
            const w=el.getBoundingClientRect().width;
            t2=Math.abs(w-mw*4)<2;
            DesignZoomEngine.set(1.0);
        }
        const ws=document.getElementById('workspace')||document.getElementById('canvas-scroll');
        ws.scrollLeft=0; ws.scrollTop=100;
        DesignZoomEngine.set(2.0,700,450);
        const scrollComp=ws.scrollTop!==100;
        DesignZoomEngine.reset();
        return {
            t1:Math.abs(d_b-0.25)<0.001&&Math.abs(d_c-0.25)<0.001,
            t2, scrollComp,
            sliderPresent:!!document.getElementById('zw-slider'),
            steps:JSON.stringify(ZOOM_STEPS)==='[0.25,0.5,0.75,1,1.5,2,3,4]',
        };
    }""")
    zoom_fails = [k for k,v in zoom.items() if not v]
    if zoom_fails:
        print(f"FAIL: Zoom tests: {zoom_fails} | {zoom}"); sys.exit(1)
    print("OK-ZOOM: T1(independence) T2(css-zoom@400%) scrollComp slider steps")

    # ── Crystal Reports Preview Parity — 12 mandatory tests ───────
    parity = page.evaluate("""() => {
        function vis(el){ if(!el)return 'MISSING'; const r=el.getBoundingClientRect(); return getComputedStyle(el).display!=='none'&&r.width>0?'visible':'hidden'; }

        const t0=performance.now(); PreviewEngine.show(); const swMs=Math.round(performance.now()-t0);

        const panelL=vis(document.getElementById('panel-left'));
        const panelR=vis(document.getElementById('panel-right'));
        const toolbar=vis(document.getElementById('toolbars'));

        const instances=[...document.querySelectorAll('[data-origin-id]')];
        const pvPage=!!document.querySelector('.pv-page');
        const firstInst=instances[0];
        let originSel=false;
        if(firstInst){ firstInst.click(); originSel=DS.selection.has(firstInst.dataset.originId); }

        const originId=firstInst ? firstInst.dataset.originId : '';
        const allInstances=originId ? document.querySelectorAll('[data-origin-id="'+originId+'"]') : [];
        const allHL=[...allInstances].every(e=>e.classList.contains('pv-origin-selected'));

        const ws=document.getElementById('workspace')||document.getElementById('canvas-scroll');
        const wsCSS=getComputedStyle(ws);
        const scrollOK=wsCSS.overflow==='auto'||wsCSS.overflow==='scroll'||wsCSS.overflowY==='auto';

        const sliderOK=!!document.getElementById('zw-slider');

        ws.scrollLeft=0; ws.scrollTop=100;
        DesignZoomEngine.set(2.0,700,450);
        const scrollMoved=ws.scrollTop!==100;
        DesignZoomEngine.reset();

        const hasGuides=typeof AlignmentGuides!=='undefined';

        const elDiv=document.querySelector('.cr-element');
        const cornerSpans=elDiv ? elDiv.querySelectorAll('.el-corner') : [];
        const cornerOK=cornerSpans.length===4;

        const pvLayer=document.getElementById('preview-layer');
        const pvExpanded=!!pvLayer&&pvLayer.scrollHeight>200;

        const itemCount=typeof SAMPLE_DATA!=='undefined'?(SAMPLE_DATA.items||[]).length:0;
        const detailBands=[...document.querySelectorAll('.pv-section')].filter(d=>{
            const sec=DS.sections.find(s=>s.id===d.dataset.sectionId);
            return sec&&sec.iterates;
        }).length;
        const detailOK=detailBands===itemCount&&itemCount>0;

        const syncOK=DS.saveHistory.toString().includes('PreviewEngine')||
                     DS.saveHistory.toString().includes('previewMode');

        PreviewEngine.hide();
        return {
            T1_panelL:panelL==='visible', T1_panelR:panelR==='visible', T1_toolbar:toolbar==='visible',
            T2_instances:instances.length>0, T2_pvPage:pvPage, T2_click:originSel,
            T3T4_sync:syncOK,
            T5_slider:sliderOK,
            T6_scrollComp:scrollMoved,
            T7_scrollbars:scrollOK,
            T8_guides:hasGuides,
            T9_corners:cornerOK,
            T10_multiHL:allHL,
            T11_expand:pvExpanded,
            T12_perf:swMs<16,
            T_detail:detailOK,
            swMs:swMs, detailBands:detailBands, itemCount:itemCount,
        };
    }""")
    pv_fails=[k for k,v in parity.items() if k.startswith('T') and not k.startswith('Ts') and isinstance(v,bool) and not v]
    if pv_fails:
        print(f"FAIL: Crystal Preview tests: {pv_fails}")
        print(f"  Data: { {k:v for k,v in parity.items()} }")
        sys.exit(1)
    ms=parity['swMs']; db=parity['detailBands']; ic=parity['itemCount']
    print(f"OK-PREVIEW: T1-panels T2-instances+click T3/T4-sync T5-slider T6-zoom T7-scroll T8-guides T9-corners T10-multiHL T11-expand T12-{ms}ms T-detail-{db}/{ic}")

    browser.close()
    server.shutdown()
