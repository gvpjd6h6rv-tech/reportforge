import RF from '../rf.js';

/**
 * modules/filters.js — RF.Modules.Filters
 * Layer   : Modules (v3)
 * Purpose : Record-selection filters dialog. Define field + operator + value
 *           conditions to limit which records appear in the report.
 * Deps    : RF.Core.DocumentModel
 */

RF.Modules.Filters = {
  _el: null,
  init() { RF.on(RF.E.FILTERS_OPEN, ()=>this.open()); },

  open() {
    this._close();
    const filters=RF.Core.DocumentModel.layout.filters||[];
    const ov=document.createElement('div'); ov.className='modal-overlay';
    ov.append(RF.html(`
    <div class="modal modal-w-620">
      <div class="modal-hdr">
        <span>⊿ Report Filters</span>
        <button class="modal-close" onclick="RF.Modules.Filters._close()">×</button>
      </div>
      <div class="modal-body">
        <p class="u-modal-desc">Filter records before rendering. Multiple conditions combined with AND/OR connector.</p>
        <div class="u-grid-filter u-grid-filter-hdr">
          <span>Field</span><span>Operator</span><span>Value</span><span>Link</span><span></span>
        </div>
        <div id="flt-rows">${(filters.length?filters:[{}]).map((f,i)=>this._row(f,i)).join('')}</div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn" onclick="RF.Modules.Filters._add()">＋ Add Condition</button>
        <div class="u-flex-1"></div>
        <button class="modal-btn" onclick="RF.Modules.Filters._close()">Cancel</button>
        <button class="modal-btn primary" onclick="RF.Modules.Filters.save()">Apply Filters</button>
      </div>
    </div>`));
    document.body.appendChild(ov); this._el=ov;
  },

  _row(f={}) {
    const ops=['=','!=','>','<','>=','<=','contains','startsWith','endsWith','isEmpty','isNotEmpty'];
    return `<div class="filter-row u-grid-filter u-grid-filter-row">
      <input class="f-field u-mono" type="text" placeholder="field.path" value="${f.field||''}">
      <select class="f-op u-fs-11">${ops.map(o=>`<option ${f.op===o?'selected':''}>${o}</option>`).join('')}</select>
      <input class="f-val u-fs-11"  type="text" placeholder="value or {field}" value="${f.value||''}">
      <select class="f-con u-w-56 u-input">
        <option ${f.connector!=='OR'?'selected':''}>AND</option>
        <option ${f.connector==='OR'?'selected':''}>OR</option>
      </select>
      <button class="pi-cond-rm u-btn-rm" onclick="this.closest('.filter-row').remove()">×</button>
    </div>`;
  },

  _add() { const l=document.getElementById('flt-rows');if(!l)return;const d=document.createElement('div');d.append(RF.html(this._row({})));l.appendChild(d.firstElementChild); },

  save() {
    const filters=[];
    document.querySelectorAll('#flt-rows .filter-row').forEach(r=>{
      const field=r.querySelector('.f-field')?.value.trim(); if(!field) return;
      filters.push({field,op:r.querySelector('.f-op')?.value||'=',value:r.querySelector('.f-val')?.value||'',connector:r.querySelector('.f-con')?.value||'AND'});
    });
    RF.H.snapshot('before-filters');
    RF.Core.DocumentModel.layout.filters=filters;
    RF.Core.DocumentModel.isDirty=true;
    RF.emit(RF.E.STATUS,`Filters: ${filters.length} condition(s) applied`);
    this._close();
  },

  _close() { this._el?.remove(); this._el=null; },
};

// ── Tables ────────────────────────────────────────────────────────────────────
