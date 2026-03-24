import RF from '../rf.js';

/**
 * modules/formula-debugger.js — RF.Modules.FormulaDebugger
 * Layer   : Modules (v4)
 * Purpose : Formula debugger panel (Ctrl+Shift+F). Step-through expression
 *           evaluation, watch list, and variable scope inspector.
 * Deps    : RF.Classic.Explorer, RF.Core.DocumentModel
 */

RF.Modules.FormulaDebugger = {
  _el: null,
  init() { RF.on('formula:debug', ()=>this.open()); },

  open() {
    this._close();
    const DM = RF.Core.DocumentModel;
    const formulas = DM.layout.formulas || {};
    const keys = Object.keys(formulas);
    const sampleRecord = { id:1, name:'Widget Pro', category:'Hardware', qty:10, unit_price:25.00, total:250.00 };

    const ov = document.createElement('div'); ov.className='modal-overlay';
    ov.append(RF.html(`
    <div class="modal u-modal-w-720vh">
      <div class="modal-hdr">
        <span class="u-accent">🐛</span>
        <span>Formula Debugger &amp; Tester</span>
        <button class="modal-close" onclick="RF.Modules.FormulaDebugger._close()">×</button>
      </div>
      <div class="modal-body u-modal-split2">
        <!-- Formula list -->
        <div class="u-panel-left">
          <div class="u-hdr-strip2">
            Formulas (${keys.length})
          </div>
          <div class="u-scroll-flex">
            ${keys.map(name=>`)
            <div class="fe-field-item u-col-item-click" data-fdb-name="${name}"
                 onclick="RF.Modules.FormulaDebugger._selectFormula('${name}')"
               >
              <span class="u-accent">ƒ</span>${name}
            </div>`).join('') || '<div class="u-pad-12 u-text-faint u-fs-11">No formulas in this report</div>'}
          </div>
          <div class="u-pad-8-top">
            <button class="modal-btn u-input-full" onclick="RF.emit(RF.E.FORMULA_OPEN,null)">＋ New Formula</button>
          </div>
        </div>
        <!-- Debug pane -->
        <div id="fdb-pane" class="u-flex-col-p16">
          <div id="fdb-graph" class="u-flex-0-auto"></div>
          <div class="u-text-center-empty">
            Select a formula to debug
          </div>
        </div>
      </div>
    </div>`));
    document.body.appendChild(ov); this._el=ov;
    if (keys.length) this._selectFormula(keys[0]);
  },

  _selectFormula(name) {
    const DM = RF.Core.DocumentModel;
    const expr = DM.layout.formulas[name]||'';
    const pane = document.getElementById('fdb-pane'); if(!pane) return;

    // Compute dependencies
    const deps = this._getDeps(expr);
    const usedBy = Object.entries(DM.layout.formulas||{})
      .filter(([n,e])=>n!==name && e.includes(`{${name}}`))
      .map(([n])=>n);

    // Sample evaluation
    const sampleData = {id:1,name:'Widget Pro',category:'Hardware',qty:10,unit_price:25.00,total:250.00};
    let evalResult = '—';
    try {
      let evalExpr = expr.replace(/\{(\w+)\.(\w+)\}/g,(_,t,f)=>sampleData[f]??0);
      evalExpr = evalExpr.replace(/\{(\w+)\}/g,(_,f)=>sampleData[f]??0);
      evalResult = String(Function(`"use strict"; try { return (${evalExpr}); } catch(e) { return '⚠ ' + e.message; }`)());
    } catch(e) { evalResult = '⚠ ' + e.message; }

    pane.replaceChildren(); pane.append(RF.html(`
    <div class="u-bold-accent13">ƒ ${name}</div>

    <div class="fw-wrap u-min-h60">
      <div class="fw-highlight" id="fdb-hl"></div>
      <textarea class="fw-ta u-min-h60" id="fdb-expr" oninput="RF.Modules.FormulaDebugger._hlExpr()">${expr}</textarea>
    </div>

    <div class="u-modal-split2col">
      <div>
        <div class="pi-section u-mb-6">Dependencies (${deps.length})</div>
        ${deps.length ? deps.map(d=>`)<div class="fe-field-item u-fs-11">
          <span class="u-text-primary-c">{${d}}</span>
        </div>`).join('') : '<div class="u-pad-xs u-text-faint">None</div>'}
      </div>
      <div>
        <div class="pi-section u-mb-6">Used By (${usedBy.length})</div>
        ${usedBy.length ? usedBy.map(n=>`<div class="fe-field-item u-fs11-cur" onclick="RF.Modules.FormulaDebugger._selectFormula('${n}')">
          <span class="u-accent">ƒ</span>${n}
        </div>`).join('') : '<div class="u-pad-xs u-text-faint">No dependents</div>'}
      </div>
    </div>

    <div class="u-card">
      <div class="u-sec-lbl-mb6">Test Evaluation (sample record)</div>
      <div class="u-fs11-mono-dim">
        ${Object.entries(sampleData).map(([k,v])=>`<span class="u-text-faint">${k}=</span><span class="u-accent">${v}</span>`).join('  ')}
      </div>
      <div class="u-flex-gap10">
        <span class="u-fs11-dim">Result:</span>
        <span id="fdb-result" class="u-eval-result${evalResult.startsWith('⚠')?' u-danger':' u-accent'}\">${evalResult}</span>
        <button class="modal-btn u-ml-auto" onclick="RF.Modules.FormulaDebugger._reEval('${name}')">▶ Re-evaluate</button>
      </div>
    </div>

    <div class="u-flex-gap8">
      <button class="modal-btn primary" onclick="RF.Modules.FormulaDebugger._saveEdit('${name}')">Save Changes</button>
      <button class="modal-btn danger" onclick="RF.Modules.FormulaDebugger._deleteFormula('${name}')">Delete Formula</button>
    </div>`));

    setTimeout(()=>this._hlExpr(), 20);
    // Highlight selected
    document.querySelectorAll('[data-fdb-name]').forEach(el=>{
      el.style.background=el.dataset.fdbName===name?'var(--primary-glow)':'';
    });
  },

  _hlExpr() {
    const ta = document.getElementById('fdb-expr');
    const hl = document.getElementById('fdb-hl');
    if(!ta||!hl) return;
    let s = ta.value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    s = s.replace(/\{([^}]+)\}/g,'<span class="hl-field">{$1}</span>');
    s = s.replace(/"([^"]*)"/g,'<span class="hl-str">"$1"</span>');
    s = s.replace(/\b(\d+\.?\d*)\b/g,'<span class="hl-num">$1</span>');
    s = s.replace(/\b(Sum|Avg|Count|Max|Min|Round|If|IIf|Not|And|Or|Contains|Year|Month|Day|ToString|ToNumber|IsNull)(?=\s*\()/gi,'<span class="hl-fn">$1</span>');
    s = s.replace(/\b(if|then|else|and|or|not|true|false|null)\b/gi,'<span class="hl-kw">$1</span>');
    hl.append(RF.html(s+'<br>'));
  },

  _getDeps(expr) {
    const deps=[]; const re=/\{([^}]+)\}/g; let m;
    while((m=re.exec(expr))!==null) deps.push(m[1]);
    return [...new Set(deps)];
  },

  _reEval(name) {
    const expr=document.getElementById('fdb-expr')?.value||'';
    const sampleData={id:1,name:'Widget Pro',category:'Hardware',qty:10,unit_price:25.00,total:250.00};
    let res='—';
    try {
      let e2=expr.replace(/\{(\w+)\.(\w+)\}/g,(_,t,f)=>sampleData[f]??0).replace(/\{(\w+)\}/g,(_,f)=>sampleData[f]??0);
      res=String(Function(`"use strict"; try { return (${e2}); } catch(e) { return '⚠ '+e.message; }`)());
    } catch(e) { res='⚠ '+e.message; }
    const el=document.getElementById('fdb-result');
    if(el){el.textContent=res;el.style.color=res.startsWith('⚠')?'var(--danger)':'var(--accent)';}
  },

  _saveEdit(name) {
    const expr=document.getElementById('fdb-expr')?.value||'';
    RF.H.snapshot('before-formula-edit');
    RF.Core.DocumentModel.layout.formulas[name]=expr;
    RF.Core.DocumentModel.isDirty=true;
    RF.emit(RF.E.STATUS,`Formula saved: ${name}`);
    this._reEval(name);
  },

  _deleteFormula(name) {
    if(!confirm(`Delete formula "${name}"?`)) return;
    delete RF.Core.DocumentModel.layout.formulas[name];
    const idx=RF.Core.DocumentModel.fieldData.formula.indexOf(`{${name}}`);
    if(idx>=0) RF.Core.DocumentModel.fieldData.formula.splice(idx,1);
    RF.Classic.Explorer.render();
    RF.Core.DocumentModel.isDirty=true;
    this._close(); this.open();
  },

  _close() { this._el?.remove(); this._el=null; },
};


// ═══════════════════════════════════════════════════════════════════════════
// RF.Modules.BarcodeEditor — Barcode object configuration
// ═══════════════════════════════════════════════════════════════════════════
