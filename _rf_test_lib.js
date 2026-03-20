// Shared test library for all RF QA scripts
const {chromium} = require('playwright');

const RF = {
  async launch(port=8080) {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport:{width:1400,height:900} });
    const jsErrors = [];
    page.on('pageerror', e => jsErrors.push(e.message));
    await page.goto(`http://localhost:${port}/classic`);
    await page.waitForTimeout(3000);
    await page.waitForFunction("() => typeof DS !== 'undefined' && DS.elements.length > 0", {timeout:10000});
    return { browser, page, jsErrors };
  },

  async layout(page) {
    return page.evaluate(() => {
      const R = id => {
        const el = document.getElementById(id);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height),
                 ow:el.offsetWidth, oh:el.offsetHeight };
      };
      const rv = document.getElementById('ruler-v');
      const rh = document.getElementById('ruler-h-canvas');
      return {
        rv: R('ruler-v'), rh: R('ruler-h-canvas'), rhr: R('ruler-h-row'),
        ws: R('workspace'), vp: R('viewport'), cl: R('canvas-layer'),
        rvRight: (rv?.getBoundingClientRect().x||0) + (rv?.offsetWidth||0),
        rhBottom: (rh?.getBoundingClientRect().y||0) + (rh?.getBoundingClientRect().height||0),
      };
    });
  },

  async state(page) {
    return page.evaluate(() => ({
      zoom: DS.zoom, elCount: DS.elements.length,
      selCount: DS.selection.size, histIdx: DS.historyIndex,
      previewMode: DS.previewMode,
      clTransform: getComputedStyle(document.getElementById('canvas-layer')||document.body).transform,
    }));
  },

  async invariants(page) {
    return page.evaluate(() => {
      const rv = document.getElementById('ruler-v');
      const rh = document.getElementById('ruler-h-canvas');
      const ws = document.getElementById('workspace');
      const cl = document.getElementById('canvas-layer');
      if (!rv||!rh||!ws||!cl) return { ok:false, reason:'missing elements' };
      const rvR = rv.getBoundingClientRect();
      const rhR = rh.getBoundingClientRect();
      const wsR = ws.getBoundingClientRect();
      const clR = cl.getBoundingClientRect();
      const rvRight  = Math.round(rvR.x + rv.offsetWidth);
      const rhBottom = Math.round(rhR.y + rhR.height);
      const checks = {
        rvVisible:      rv.offsetWidth > 0 && rvR.height > 0,
        rhVisible:      rh.getBoundingClientRect().width > 0,
        wsAfterRulerV:  Math.abs(Math.round(wsR.x) - rvRight) <= 2,
        clAfterRulerV:  Math.round(clR.x) > rvRight - 1,
        clAfterRulerH:  Math.round(clR.y) >= rhBottom - 1,
        clTransformNone: getComputedStyle(cl).transform === 'none',
        zoomInRange:    DS.zoom >= 0.25 && DS.zoom <= 4.0,
      };
      const failed = Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);
      return { ok: failed.length===0, failed, checks,
               rvRight, wsX:Math.round(wsR.x), clX:Math.round(clR.x), zoom:DS.zoom };
    });
  },

  reporter(name) {
    let pass=0, fail=0;
    const ok  = m => { console.log('  PASS: '+m); pass++; };
    const bad = m => { console.log('  FAIL: '+m); fail++; };
    const done = () => {
      console.log('\n  '+name+' results: '+pass+' PASS, '+fail+' FAIL');
      return fail;
    };
    return { ok, bad, done };
  }
};

module.exports = RF;
