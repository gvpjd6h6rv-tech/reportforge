import RF from '../rf.js';

/**
 * classic/inspector.js — RF.Classic.Inspector
 * Layer   : Classic UI
 * Purpose : Property inspector panel. Renders type-specific form controls
 *           when elements are selected and writes mutations back to DocumentModel.
 *           Includes the v4 type-specific edit button patch.
 * Deps    : RF.Core.DocumentModel, RF.UX.Alignment
 */

RF.Classic.Inspector = {
  _el: null,

  init() {
    this._el = document.getElementById('property-inspector');
    RF.on(RF.E.SEL_CHANGED,       () => this.render());
    RF.on(RF.E.INSPECTOR_REFRESH, () => this.refresh());
  },

  // Returns the container to render into (supports PanelTabs wrapping)
  _container() {
    return document.getElementById('props-panel-inner') || this._el;
  },

  _lastRenderedId: null,
  _lastRenderedCount: 0,

  render() {
    if (!this._el) return;
    const sel = RF.Core.DocumentModel.selectedElements;
    if (!sel.length) {
      if (this._lastRenderedCount !== 0) { this._empty(); this._lastRenderedId = null; this._lastRenderedCount = 0; }
      return;
    }
    if (sel.length > 1) {
      if (this._lastRenderedCount !== sel.length) { this._multi(sel); this._lastRenderedCount = sel.length; this._lastRenderedId = null; }
      return;
    }
    // Single element — only full-render when element id changes
    const el = sel[0];
    if (this._lastRenderedId === el.id && this._lastRenderedCount === 1) {
      // Same element — update values only
      this.refresh();
      return;
    }
    this._lastRenderedId = el.id;
    this._lastRenderedCount = 1;
    this._single(el);
  },

  refresh() {
    const sel = RF.Core.DocumentModel.selectedElements;
    if (sel.length!==1) return;
    const el = sel[0];
    ['x','y','w','h'].forEach(p => {
      const i = this._el.querySelector(`[data-prop="${p}"]`);
      if (i) i.value = Math.round(el[p]);
    });
  },

  focusProp(name) {
    const inp = this._el?.querySelector(`[data-prop="${name}"]`);
    if (inp) { inp.focus(); inp.select(); }
  },

  _sortMode: 'category', // 'category' | 'alpha'

  _empty() {
    this._container().append(RF.html(`
      <div class="panel-hdr">
        <span>Properties</span>
        <div class="panel-hdr-actions">
          <button class="panel-icon-btn pi-sort-cat u-bold10" title="Sort by Category"
            onclick="RF.Classic.Inspector._sortMode='category';RF.Classic.Inspector.render()"
          >&#9776;</button>
          <button class="panel-icon-btn pi-sort-az u-bold9" title="Sort Alphabetically"
            onclick="RF.Classic.Inspector._sortMode='alpha';RF.Classic.Inspector.render()"
          >A&#8203;Z</button>
        </div>
      </div>
      <div class="pi-empty">
        <div class="u-el-ph">&#9635;</div>
        <div>Select an element<br>to inspect properties</div>
      </div>`));
  },

  _multi(els) {
    this._container().append(RF.html(`<div class="panel-hdr"><span>Properties</span><span class="panel-hdr-actions"><small class="u-text-dim">${els.length} selected</small></span></div>
      <div class="pi-section">Alignment</div>
      <div class="pi-actions">
        <button class="pi-btn" onclick="RF.UX.Alignment.alignLeft()">⊢ Left</button>
        <button class="pi-btn" onclick="RF.UX.Alignment.alignRight()">⊣ Right</button>
        <button class="pi-btn" onclick="RF.UX.Alignment.alignHCenter()">⊟ H.Ctr</button>
        <button class="pi-btn" onclick="RF.UX.Alignment.alignTop()">⊤ Top</button>
        <button class="pi-btn" onclick="RF.UX.Alignment.alignBottom()">⊥ Bottom</button>
        <button class="pi-btn" onclick="RF.UX.Alignment.alignVCenter()">⊞ V.Ctr</button>
        <button class="pi-btn" onclick="RF.UX.Alignment.alignBaseline()">═ Base</button>
      </div>
      <div class="pi-section">Distribution</div>
      <div class="pi-actions">
        <button class="pi-btn" onclick="RF.UX.Alignment.distributeH()">↔ H</button>
        <button class="pi-btn" onclick="RF.UX.Alignment.distributeV()">↕ V</button>
        <button class="pi-btn" onclick="RF.UX.Alignment.equalSpacing()">⟺ Space</button>
        <button class="pi-btn" onclick="RF.UX.Alignment.equalWidth()">↔= W</button>
        <button class="pi-btn" onclick="RF.UX.Alignment.equalHeight()">↕= H</button>
      </div>
      <div class="pi-section">Actions</div>
      <div class="pi-actions">
        <button class="pi-btn danger" onclick="RF.H.snapshot('del');RF.Core.DocumentModel.deleteElements([...RF.Core.DocumentModel.selectedIds])">🗑 Delete All</button>
        <button class="pi-btn" onclick="RF.Core.DocumentModel.duplicateElements([...RF.Core.DocumentModel.selectedIds]);RF.RP.reconcile()">⊕ Duplicate</button>
      </div>`));
  },

  _single(el) {
    const isText   = el.type==='text'||el.type==='field';
    const isLine   = el.type==='line';
    const isShape  = el.type==='rect'||el.type==='image';
    const isChart  = el.type==='chart';
    const isTable  = el.type==='table';
    const isSub    = el.type==='subreport';
    const typeClass= `pi-t-${el.type}`;

    this._container().append(RF.html(`
    <div class="panel-hdr">
      <span>Properties</span>
      <div class="panel-hdr-actions">
        <button class="panel-icon-btn" title="Bring to Front" onclick="RF.Core.DocumentModel.reorderElement('${el.id}','front');RF.RP.reconcile()">&#8679;</button>
        <button class="panel-icon-btn" title="Send to Back"  onclick="RF.Core.DocumentModel.reorderElement('${el.id}','back');RF.RP.reconcile()">&#8681;</button>
        <button class="panel-icon-btn u-bold10" title="Sort by Category"
          onclick="RF.Classic.Inspector._sortMode='category';RF.Classic.Inspector.render()">&#9776;</button>
        <button class="panel-icon-btn u-bold9" title="Sort Alphabetically"
          onclick="RF.Classic.Inspector._sortMode='alpha';RF.Classic.Inspector.render()">AZ</button>
      </div>
    </div>
    <div class="pi-hdr">
      <span class="pi-type-label">${el.type.toUpperCase()}</span>
      <span class="pi-id">${el.id}</span>
      ${el.locked?'<span title="Locked" class="u-ml-auto">🔒</span>':''}
    </div>

    <div class="pi-section">Position / Size</div>
    <div class="pi-4grid">
      ${this._num('X','x',el.x,'px')} ${this._num('Y','y',el.y,'px')}
      ${this._num('W','w',el.w,'px')} ${this._num('H','h',el.h,'px')}
    </div>
    <div class="pi-row">
      <label>Z-Index</label>
      <input type="number" data-prop="zIndex" value="${el.zIndex||0}" class="u-w-54">
    </div>

    ${isText ? `)
    <div class="pi-section">Font</div>
    <div class="pi-row">
      <label>Family</label>
      <select data-prop="fontFamily">
        ${['Arial','Arial Narrow','Helvetica','Times New Roman','Georgia','Courier New','Verdana','Tahoma','Calibri','Trebuchet MS']
          .map(f=>`<option ${el.fontFamily===f?'selected':''}>${f}</option>`).join('')}
      </select>
    </div>
    <div class="pi-4grid">
      ${this._num('Size','fontSize',el.fontSize||9,'pt')}
      <div class="pi-row"><label>Align</label>
        <select data-prop="align">
          ${['left','center','right','justify'].map(a=>`<option ${el.align===a?'selected':''}>${a}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="pi-checks">
      ${this._chk('Bold','bold',el.bold)} ${this._chk('Italic','italic',el.italic)} ${this._chk('Under','underline',el.underline)}
    </div>
    <div class="pi-section">Color</div>
    <div class="pi-row"><label>Text</label><input type="color" data-prop="color" value="${el.color||'#000000'}"><span class="pi-hex">${el.color||'#000'}</span></div>
    <div class="pi-row"><label>BG</label>
      <input type="color" data-prop="bgColor" value="${el.bgColor==='transparent'?'#ffffff':el.bgColor||'#ffffff'}">
      ${this._chk('Transparent','_bgTransp',el.bgColor==='transparent'||!el.bgColor)}
    </div>
    ${el.type==='field' ? `
    <div class="pi-section">Field</div>
    <div class="pi-row"><label>Path</label><input type="text" data-prop="fieldPath" value="${el.fieldPath||''}"></div>
    <div class="pi-row"><label>Format</label>
      <select data-prop="fieldFmt">
        ${['','currency','int','float2','pct','date','datetime','yesno'].map(f=>`<option ${el.fieldFmt===f?'selected':''}>${f||'(auto)'}</option>`).join('')}
      </select>
    </div>
    ` : `
    <div class="pi-section">Content</div>
    <div class="pi-row"><label>Text</label><textarea data-prop="content" rows="2">${el.content||''}</textarea></div>
    `}
    ` : ''}

    ${isLine ? `
    <div class="pi-section">Line</div>
    <div class="pi-row"><label>Direction</label>
      <select data-prop="lineDir">
        <option ${el.lineDir==='h'?'selected':''} value="h">Horizontal</option>
        <option ${el.lineDir==='v'?'selected':''} value="v">Vertical</option>
      </select>
    </div>
    ${this._num('Width','lineWidth',el.lineWidth||1,'px')}
    <div class="pi-row"><label>Color</label><input type="color" data-prop="color" value="${el.color||'#000000'}"><span class="pi-hex">${el.color||'#000'}</span></div>
    ` : ''}

    ${isChart ? `
    <div class="pi-section">Chart</div>
    <div class="pi-row"><label>Type</label>
      <select data-prop="chartType">
        ${['bar','line','pie','donut','area','scatter'].map(t=>`<option ${el.chartType===t?'selected':''}>${t}</option>`).join('')}
      </select>
    </div>
    <div class="pi-row"><label>Data Field</label><input type="text" data-prop="fieldPath" value="${el.fieldPath||''}"></div>
    ` : ''}

    ${isSub ? `
    <div class="pi-section">Subreport</div>
    <div class="pi-row"><label>Layout</label><input type="text" data-prop="layoutPath" value="${el.layoutPath||''}"></div>
    <div class="pi-row"><label>Data</label><input type="text" data-prop="dataPath" value="${el.dataPath||''}"></div>
    ` : ''}

    <div class="pi-section">Border</div>
    <div class="pi-4grid">
      ${this._num('Width','borderWidth',el.borderWidth||0,'px')}
      <div class="pi-row"><label>Style</label>
        <select data-prop="borderStyle">
          ${['solid','dashed','dotted','double','none'].map(s=>`<option ${el.borderStyle===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="pi-row"><label>Color</label><input type="color" data-prop="borderColor" value="${el.borderColor||'#000000'}"><span class="pi-hex">${el.borderColor||'#000'}</span></div>

    <div class="pi-section">Visibility</div>
    <div class="pi-row"><label>Visible If</label><input type="text" data-prop="visibleIf" value="${el.visibleIf||''}"></div>
    <div class="pi-checks">
      ${this._chk('Suppress if empty','suppressIfEmpty',el.suppressIfEmpty)}
      ${isText ? this._chk('Can Grow','canGrow',el.canGrow) : ''}
      ${isText ? this._chk('Word Wrap','wordWrap',el.wordWrap) : ''}
    </div>

    <div class="pi-section">Section</div>
    <div class="pi-row"><label>In section</label>
      <select data-prop="sectionId">
        ${RF.Core.DocumentModel.layout.sections.map(s=>`<option value="${s.id}" ${el.sectionId===s.id?'selected':''}>${s.label}</option>`).join('')}
      </select>
    </div>

    ${(el.conditionalStyles||[]).length>0 ? `
    <div class="pi-section">Conditional</div>
    ${(el.conditionalStyles||[]).map((c,i)=>`
    <div class="pi-cond-row" data-ci="${i}">
      <select class="cond-field u-flex-1 u-fs-105"><option>${c.field||''}</option></select>
      <select class="cond-op u-w-50 u-fs-105">${['=','!=','>','<','>=','<=','contains'].map(o=>`<option ${c.op===o?'selected':''}>${o}</option>`).join('')}</select>
      <input class="cond-val u-w-60 u-fs-105" value="${c.value||''}">
      <input type="color" class="cond-color u-btn-105" value="${c.color||'#000000'}">
      <button class="pi-cond-rm" onclick="RF.Classic.Inspector.removeCond('${el.id}',${i})">×</button>
    </div>`).join('')}
    ` : ''}

    <div class="pi-section">Lock / Layer</div>
    <div class="pi-checks">
      ${this._chk('Lock element','locked',el.locked)}
    </div>

    <div class="pi-actions u-mt-10">
      <button class="pi-btn" onclick="RF.H.snapshot('dup');RF.Core.DocumentModel.duplicateElements(['${el.id}']);RF.RP.reconcile()">⊕ Duplicate</button>
      <button class="pi-btn" onclick="RF.emit(RF.E.COND_FMT_OPEN,'${el.id}')">🎨 Cond. Fmt</button>
      <button class="pi-btn danger" onclick="RF.H.snapshot('del');RF.Core.DocumentModel.deleteElements(['${el.id}'])">🗑 Delete</button>
    </div>
    `));

    this._container().querySelectorAll('[data-prop]').forEach(inp => {
      inp.addEventListener(inp.type==='checkbox'?'change':'input', () => this._onChange(el, inp));
    });
  },

  removeCond(elId, index) {
    const el = RF.Core.DocumentModel.getElementById(elId);
    if (!el) return;
    RF.H.snapshot('before-rm-cond');
    el.conditionalStyles.splice(index, 1);
    RF.Core.DocumentModel.isDirty = true;
    RF.RP.syncElement(el);
    this.render();
  },

  _onChange(el, inp) {
    const prop = inp.dataset.prop;
    let   val  = inp.type==='checkbox' ? inp.checked : inp.value;

    if (['x','y','w','h','fontSize','lineWidth','borderWidth','zIndex'].includes(prop)) val=parseFloat(val)||0;

    if (prop==='_bgTransp') {
      el.bgColor = val ? 'transparent' : '#FFFFFF';
      RF.RP.syncElement(el);
      RF.Core.DocumentModel.isDirty=true;
      RF.emit(RF.E.LAYOUT_CHANGED);
      return;
    }

    RF.Core.DocumentModel.updateElement(el.id, {[prop]:val});
    RF.RP.syncElement(el);
    RF.Sel.syncDOM();

    if (inp.type==='color') {
      const hex = inp.nextElementSibling;
      if (hex?.classList.contains('pi-hex')) hex.textContent = val;
    }
    if (prop==='sectionId') RF.RP.reconcile();
    if (['w','h'].includes(prop)) RF.Sel.syncDOM();
  },

  _num(label, prop, val, unit) {
    return `<div class="pi-row"><label>${label}</label>
      <input type="number" data-prop="${prop}" value="${Math.round(val)}" class="u-w-58">
      <span class="u-fs-10 u-text-faint">${unit}</span></div>`;
  },
  _chk(label, prop, val) {
    return `<label class="pi-check"><input type="checkbox" data-prop="${prop}" ${val?'checked':''}><span>${label}</span></label>`;
  },
};


// ═══════════════════════════════════════════════════════════════════════════════
// RF.Classic.Explorer — Field Explorer panel.
// 6 groups: Database, Formula, Parameter, Running Totals, SQL, Special.
// Drag-to-canvas creates elements. Filter search. Inline formula add.
// ═══════════════════════════════════════════════════════════════════════════════

// ── v4 type-specific edit button patch ─────────────────────
;(() => {
  const _orig = RF.Classic.Inspector._single.bind(RF.Classic.Inspector);
  RF.Classic.Inspector._single = function(el) {
    _orig(el);
    // Find actions area and inject type-specific edit button
    const actions = document.querySelector('.pi-actions');
    if (!actions) return;

    const editEvents = {
      chart:     ['charts:open',    '📊 Edit Chart'],
      table:     ['tables:open',    '⊞ Edit Columns'],
      subreport: ['subreports:open','🗂 Edit Subreport'],
      crosstab:  ['crosstab:open',  '⊟ Edit Crosstab'],
      barcode:   ['barcode:open',   '▐▌ Edit Barcode'],
      richtext:  ['richtext:open',  '📝 Edit Text'],
      mapobj:    ['mapobj:open',    '🗺 Edit Map'],
    };

    if (editEvents[el.type]) {
      const [evt, label] = editEvents[el.type];
      const btn = document.createElement('button');
      btn.className='pi-btn accent';
      btn.textContent = label;
      btn.addEventListener('click', () => RF.emit(evt, el.id));
      actions.insertBefore(btn, actions.firstChild);
    }

    // Add "Debug Formula" for field elements with formula path
    if (el.type==='field' && el.fieldPath?.startsWith('{') && RF.Core.DocumentModel.layout.formulas) {
      const fName = el.fieldPath.replace(/^\{|\}$/g,'');
      if (RF.Core.DocumentModel.layout.formulas[fName]) {
        const btn = document.createElement('button');
        btn.className='pi-btn';
        btn.textContent='🐛 Debug Formula';
        btn.addEventListener('click', () => {
          RF.Modules.FormulaDebugger.open();
          setTimeout(()=>RF.Modules.FormulaDebugger._selectFormula(fName),100);
        });
        actions.appendChild(btn);
      }
    }
  };
})();


// ── v4 Boot patches ─────────────────────────────────────────────────────
