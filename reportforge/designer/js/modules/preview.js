import RF from '../rf.js';

/**
 * modules/preview.js — RF.Modules.Preview
 * Layer   : Modules (v3 + v4 patch)
 * Purpose : Preview panel. POSTs the current layout JSON to /designer/preview,
 *           displays the rendered HTML in a sandboxed iframe. Includes the v4
 *           navigation bar and zoom selector.
 * Deps    : none (reads RF.Core.DocumentModel directly)
 */

RF.Modules.Preview = {
  _panel: null,

  init() {
    this._panel=document.getElementById('preview-panel');
    RF.on(RF.E.PREVIEW_OPEN,  ()=>this.open());
    RF.on(RF.E.PREVIEW_CLOSE, ()=>this.close());
  },

  open() {
    if(!this._panel) return;
    this._panel.classList.add('active');
    const frame  = document.getElementById('pv-frame');
    const loading= document.getElementById('pv-loading');
    if(loading) { loading.classList.remove('u-hidden'); RF.clear(loading); loading.append(RF.html('<div class="pv-loading-msg">⏳ Rendering preview…</div>')); }
    if(frame)   frame.classList.add('u-hidden');

    const DM=RF.Core.DocumentModel;
    const payload={
      layout: RF.clone(DM.layout),
      data:{
        items:[
          {id:1,name:'Widget Pro',    category:'Hardware',qty:10,unit_price:25.00,  total:250.00},
          {id:2,name:'DataSync Suite',category:'Software',qty:5, unit_price:99.99,  total:499.95},
          {id:3,name:'Cloud Setup',   category:'Services',qty:3, unit_price:150.00, total:450.00},
          {id:4,name:'Cable Kit',     category:'Hardware',qty:20,unit_price:5.50,   total:110.00},
          {id:5,name:'License Pack',  category:'Software',qty:2, unit_price:299.00, total:598.00},
          {id:6,name:'Sensor Array',  category:'Hardware',qty:8, unit_price:45.00,  total:360.00},
          {id:7,name:'Analytics Pro', category:'Software',qty:1, unit_price:499.00, total:499.00},
        ],
        empresa:{ razon_social: DM.layout.parameters?.find(p=>p.name==='company')?.defaultValue||'Acme Corp' }
      },
      params: Object.fromEntries((DM.layout.parameters||[]).map(p=>[p.name,p.defaultValue]))
    };

    fetch('/designer-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    .then(r=>r.ok?r.text():Promise.reject('HTTP '+r.status))
    .then(html=>{
      if(loading) loading.classList.add('u-hidden');
      if(!frame) return;
      frame.classList.remove('u-hidden');
      frame.contentDocument.open();
      frame.contentDocument.write(html);
      frame.contentDocument.close();
    })
    .catch(err=>{
      if(!loading) return;
      const L=DM.layout;
      RF.clear(loading); loading.append(RF.html(`
        <div class="u-dark-panel">
          <div class="u-flex-gap10 u-mt-16">
            <span class="u-fs-24">📄</span>
            <div><div class="u-fs-16 u-bold u-accent">${L.name}</div>
            <div class="u-fs11-dim">Layout Preview — API offline (${err})</div></div>
          </div>
          <div class="u-dark-card">
            <div>📐 <b>Page:</b> ${L.pageSize} ${L.orientation} — ${L.pageWidth}px wide</div>
            <div>§ <b>Sections:</b> ${L.sections.map(s=>`)${s.label} (${s.height}px)`).join(', ')}</div>
            <div>⊞ <b>Elements:</b> ${L.elements.length} total</div>
            <div>▼ <b>Groups:</b> ${(L.groups||[]).map(g=>g.field).join(', ')||'none'}</div>
            <div>↑ <b>Sort:</b> ${(L.sortBy||[]).map(s=>s.field+(s.desc?' ↓':' ↑')).join(', ')||'none'}</div>
            <div>⊿ <b>Filters:</b> ${(L.filters||[]).length} condition(s)</div>
            <div>{?} <b>Parameters:</b> ${(L.parameters||[]).map(p=>p.name+'='+p.defaultValue).join(', ')||'none'}</div>
          </div>
          <div class="u-warn-box">
            💡 Start the API server for live preview:<br>
            <code class="u-dark-code">cd reportforge-complete && uvicorn reportforge.server.main:app --port 8000</code>
          </div>
          <details class="u-mt-14">
            <summary class="u-link-btn">▶ View layout JSON</summary>
            <pre class="u-code-block">${JSON.stringify(L,null,2).slice(0,5000)}</pre>
          </details>
        </div>`));
    });
  },

  close() { this._panel?.classList.remove('active'); },
};


// ── App Boot (v3) ──────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
// RF.App — Bootstrap. Initialises all subsystems in dependency order.
// ═══════════════════════════════════════════════════════════════════════════════

// ── v4 preview navigation bar patch ───────────────────────────
(() => {
  const _origOpen = RF.Modules.Preview.open.bind(RF.Modules.Preview);
  RF.Modules.Preview.open = function() {
    _origOpen();

    // Add navigation bar to preview topbar if not already there
    const topbar = document.querySelector('.preview-topbar');
    if (topbar && !topbar.dataset.v4nav) {
      topbar.dataset.v4nav = '1';
      topbar.insertAdjacentHTML('beforeend', `
        <div class="pv-nav">
          <button class="pv-page-btn" id="pv-first" onclick="RF.Modules.PreviewNav.go(1)" disabled>|◀</button>
          <button class="pv-page-btn" id="pv-prev"  onclick="RF.Modules.PreviewNav.prev()" disabled>◀</button>
          <span id="pv-page-info">Page 1</span>
          <button class="pv-page-btn" id="pv-next"  onclick="RF.Modules.PreviewNav.next()">▶</button>
          <button class="pv-page-btn" id="pv-last"  onclick="RF.Modules.PreviewNav.goLast()">▶|</button>
        </div>
        <button class="modal-btn u-btn-h28" onclick="RF.Modules.Preview.open()">↻ Refresh</button>
        <div class="pv-nav u-border-l0">
          <span class="u-fs11-dim">Zoom:</span>
          <select onchange="document.getElementById('pv-frame').style.width=(this.value==='fit'?'100%':this.value+'px')" class="u-input-code">
            <option value="794">100%</option>
            <option value="597">75%</option>
            <option value="397">50%</option>
            <option value="fit">Fit</option>
          </select>
        </div>
      `);
    }
  };
})();


RF.Modules.PreviewNav = {
  _page: 1, _total: 1,
  go(n) {
    this._page = Math.max(1, Math.min(n, this._total));
    this._updateUI();
    // In a real implementation, would call API with page param
    RF.emit(RF.E.STATUS, `Preview page ${this._page} of ${this._total}`);
  },
  prev()   { this.go(this._page - 1); },
  next()   { this.go(this._page + 1); },
  goLast() { this.go(this._total); },
  _updateUI() {
    const p=this._page, t=this._total;
    const first=document.getElementById('pv-first'), prev=document.getElementById('pv-prev');
    const next=document.getElementById('pv-next'), last=document.getElementById('pv-last');
    const info=document.getElementById('pv-page-info');
    if(first) first.disabled=p<=1; if(prev) prev.disabled=p<=1;
    if(next)  next.disabled=p>=t;  if(last) last.disabled=p>=t;
    if(info)  info.textContent=`Page ${p} of ${t}`;
  },
};


// ── v4: Extended keyboard shortcuts ────────────────────────────────────────────
