import RF from '../rf.js';

/**
 * modules/charts.js — RF.Modules.Charts
 * Layer   : Modules (v3)
 * Purpose : Chart element editor dialog. Select chart type, bind data
 *           series, configure axes, and preview chart appearance.
 * Deps    : RF.Core.DocumentModel
 */

RF.Modules.Charts = {
  _el: null,
  TYPES: ['bar','line','pie','donut','area','scatter','bubble','waterfall','gauge','heatmap'],
  init() { RF.on('charts:open', elId=>this.open(elId)); },

  open(elId) {
    this._close();
    const el=RF.Core.DocumentModel.getElementById(elId); if(!el) return;
    const ov=document.createElement('div'); ov.className='modal-overlay';
    ov.append(RF.html(`
    <div class="modal modal-w-520">
      <div class="modal-hdr">
        <span>📊 Chart Designer — ${elId}</span>
        <button class="modal-close" onclick="RF.Modules.Charts._close()">×</button>
      </div>
      <div class="modal-body">
        <div class="pi-section u-mt-0">Chart Type</div>
        <div class="u-pad-wrap6">
          ${this.TYPES.map(t=>`)<button class="modal-btn ${el.chartType===t?'primary':''} u-mw-80 u-input" onclick="RF.Modules.Charts._setType(this,'${t}')">${t}</button>`).join('')}
        </div>
        <input type="hidden" id="cht-type" value="${el.chartType||'bar'}">

        <div class="pi-section">Data</div>
        <div class="pi-row"><label class="u-mw-100">Category field</label>
          <input id="cht-cat" type="text" value="${el.categoryField||el.fieldPath||''}" placeholder="e.g. items.category" class="u-input-mono"></div>
        <div class="pi-row"><label class="u-mw-100">Value field</label>
          <input id="cht-val" type="text" value="${el.valueField||''}" placeholder="e.g. items.total" class="u-input-mono"></div>
        <div class="pi-row"><label class="u-mw-100">Series field</label>
          <input id="cht-ser" type="text" value="${el.seriesField||''}" placeholder="Optional grouping" class="u-input-mono"></div>

        <div class="pi-section">Appearance</div>
        <div class="pi-row"><label class="u-mw-100">Title</label>
          <input id="cht-title" type="text" value="${el.chartTitle||''}" class="u-flex-1 u-input"></div>
        <div class="pi-row"><label class="u-mw-100">Show legend</label>
          <input id="cht-legend" type="checkbox" ${el.showLegend?'checked':''}></div>
        <div class="pi-row"><label class="u-mw-100">Show labels</label>
          <input id="cht-labels" type="checkbox" ${el.showLabels?'checked':''}></div>
        <div class="pi-row"><label class="u-mw-100">Primary color</label>
          <input id="cht-color" type="color" value="${el.color||'#3B7FE8'}"></div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn" onclick="RF.Modules.Charts._close()">Cancel</button>
        <button class="modal-btn primary" onclick="RF.Modules.Charts.save('${elId}')">Apply</button>
      </div>
    </div>`));
    document.body.appendChild(ov); this._el=ov;
  },

  _setType(btn,t) {
    document.querySelectorAll('.modal .modal-btn').forEach(b=>b.classList.remove('primary'));
    btn.classList.add('primary');
    const inp=document.getElementById('cht-type'); if(inp) inp.value=t;
  },

  save(elId) {
    RF.H.snapshot('before-chart');
    RF.Core.DocumentModel.updateElement(elId,{
      chartType:  document.getElementById('cht-type')?.value||'bar',
      categoryField:document.getElementById('cht-cat')?.value||'',
      valueField: document.getElementById('cht-val')?.value||'',
      seriesField:document.getElementById('cht-ser')?.value||'',
      chartTitle: document.getElementById('cht-title')?.value||'',
      showLegend: document.getElementById('cht-legend')?.checked||false,
      showLabels: document.getElementById('cht-labels')?.checked||false,
      color:      document.getElementById('cht-color')?.value||'#3B7FE8',
      fieldPath:  document.getElementById('cht-cat')?.value||'',
    });
    RF.RP.syncElement(RF.Core.DocumentModel.getElementById(elId));
    RF.emit(RF.E.STATUS,'Chart updated');
    this._close();
  },

  _close() { this._el?.remove(); this._el=null; },
};

// ── Subreports ────────────────────────────────────────────────────────────────
