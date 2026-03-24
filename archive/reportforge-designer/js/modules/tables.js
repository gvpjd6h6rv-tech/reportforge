import RF from '../rf.js';

/**
 * modules/tables.js — RF.Modules.Tables
 * Layer   : Modules (v3)
 * Purpose : Linked tables dialog. Manage joined data sources and define
 *           join type and link fields between them.
 * Deps    : RF.Core.DocumentModel
 */

RF.Modules.Tables = {
  _el: null,
  init() { RF.on('tables:open', elId=>this.open(elId)); },

  open(elId) {
    this._close();
    const el=RF.Core.DocumentModel.getElementById(elId); if(!el) return;
    const cols=el.columns||[];
    const ov=document.createElement('div'); ov.className='modal-overlay';
    ov.append(RF.html(`
    <div class="modal modal-w-640">
      <div class="modal-hdr">
        <span>⊞ Table Column Designer — ${elId}</span>
        <button class="modal-close" onclick="RF.Modules.Tables._close()">×</button>
      </div>
      <div class="modal-body">
        <div class="u-grid-tbl-hdr">
          <span>Field Path</span><span>Header Label</span><span>Width</span><span>Align</span><span></span>
        </div>
        <div id="tbl-cols">${cols.map((c,i)=>this._colRow(c,i)).join('')}</div>
        <div class="u-fs11-sec-dim">
          Total width: <span id="tbl-total">0</span>px
          (page: ${RF.Core.DocumentModel.layout.pageWidth}px)
        </div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn" onclick="RF.Modules.Tables._add()">＋ Add Column</button>
        <button class="modal-btn" onclick="RF.Modules.Tables._autoSize()">⟺ Auto-Size</button>
        <div class="u-flex-1"></div>
        <button class="modal-btn" onclick="RF.Modules.Tables._close()">Cancel</button>
        <button class="modal-btn primary" onclick="RF.Modules.Tables.save('${elId}')">Apply</button>
      </div>
    </div>`));
    document.body.appendChild(ov); this._el=ov;
    this._updateTotal();
    document.getElementById('tbl-cols')?.addEventListener('input', ()=>this._updateTotal());
  },

  _colRow(c={}) {
    return `<div class="col-row u-grid-tbl-row">
      <input class="c-field u-mono" type="text" placeholder="field.path" value="${c.fieldPath||''}">
      <input class="c-label u-fs-11" type="text" placeholder="Header"    value="${c.label||''}"   >
      <input class="c-width u-fs-11" type="number" min="20" value="${c.width||80}"                 >
      <select class="c-align u-fs-11">${['left','center','right'].map(a=>`<option ${c.align===a?'selected':''}>${a}</option>`).join('')}</select>
      <button class="pi-cond-rm u-btn-rm" onclick="this.closest('.col-row').remove();RF.Modules.Tables._updateTotal()">×</button>
    </div>`;
  },

  _add() { const l=document.getElementById('tbl-cols');if(!l)return;const d=document.createElement('div');d.append(RF.html(this._colRow({})));l.appendChild(d.firstElementChild); },

  _autoSize() {
    const rows=document.querySelectorAll('#tbl-cols .col-row');
    const n=rows.length; if(!n) return;
    const el=document.querySelector('[data-elid]');
    const w=Math.floor((RF.Core.DocumentModel.layout.pageWidth-40)/n);
    rows.forEach(r=>{const inp=r.querySelector('.c-width');if(inp)inp.value=w;});
    this._updateTotal();
  },

  _updateTotal() {
    const rows=document.querySelectorAll('#tbl-cols .col-row');
    const total=[...rows].reduce((s,r)=>s+(parseInt(r.querySelector('.c-width')?.value)||0),0);
    const el=document.getElementById('tbl-total'); if(el) el.textContent=total;
  },

  save(elId) {
    const cols=[];
    document.querySelectorAll('#tbl-cols .col-row').forEach(r=>{
      const fp=r.querySelector('.c-field')?.value.trim(); if(!fp) return;
      cols.push({fieldPath:fp,label:r.querySelector('.c-label')?.value||fp.split('.').pop(),
        width:parseInt(r.querySelector('.c-width')?.value)||80,
        align:r.querySelector('.c-align')?.value||'left'});
    });
    RF.H.snapshot('before-table-cols');
    RF.Core.DocumentModel.updateElement(elId,{columns:cols});
    RF.RP.syncElement(RF.Core.DocumentModel.getElementById(elId));
    RF.emit(RF.E.STATUS,`Table: ${cols.length} columns`);
    this._close();
  },

  _close() { this._el?.remove(); this._el=null; },
};

// ── Charts ────────────────────────────────────────────────────────────────────
