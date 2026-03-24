import RF from '../rf.js';

/**
 * modules/crosstab.js — RF.Modules.Crosstab
 * Layer   : Modules (v4)
 * Purpose : Crosstab element editor. Configure row field, column field,
 *           summary field/function, and row/column totals.
 * Deps    : RF.Core.DocumentModel
 */

RF.Modules.Crosstab = {
  _el:null,
  init() { RF.on('crosstab:open', elId=>this.open(elId)); },

  open(elId) {
    this._close();
    const el=RF.Core.DocumentModel.getElementById(elId); if(!el) return;
    const ov=document.createElement('div'); ov.className='modal-overlay';
    ov.append(RF.html(`
    <div class="modal modal-w-520">
      <div class="modal-hdr">
        <span>⊟ Crosstab Designer — ${elId}</span>
        <button class="modal-close" onclick="RF.Modules.Crosstab._close()">×</button>
      </div>
      <div class="modal-body">
        <div class="pi-section u-mt-0">Rows, Columns &amp; Summary</div>
        <div class="pi-row"><label class="u-mw-110">Row field</label>
          <input id="ct-row" type="text" value="${el.rowField||''}" placeholder="e.g. items.category" class="u-input-mono"></div>
        <div class="pi-row"><label class="u-mw-110">Column field</label>
          <input id="ct-col" type="text" value="${el.colField||''}" placeholder="e.g. items.region" class="u-input-mono"></div>
        <div class="pi-row"><label class="u-mw-110">Summary field</label>
          <input id="ct-sum" type="text" value="${el.summaryField||''}" placeholder="e.g. items.total" class="u-input-mono"></div>
        <div class="pi-row"><label class="u-mw-110">Function</label>
          <select id="ct-fn" class="u-flex-1 u-input">
            ${['Sum','Count','Avg','Max','Min','DistinctCount'].map(f=>`)<option ${el.summaryFunc===f?'selected':''}>${f}</option>`).join('')}
          </select></div>
        <div class="pi-section">Options</div>
        <div class="pi-checks">
          <label class="pi-check"><input id="ct-rowt" type="checkbox" ${el.rowTotals!==false?'checked':''}><span>Row Totals</span></label>
          <label class="pi-check"><input id="ct-colt" type="checkbox" ${el.colTotals!==false?'checked':''}><span>Column Totals</span></label>
          <label class="pi-check"><input id="ct-grt"  type="checkbox" ${el.grandTotal?'checked':''}><span>Grand Total</span></label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn" onclick="RF.Modules.Crosstab._close()">Cancel</button>
        <button class="modal-btn primary" onclick="RF.Modules.Crosstab.save('${elId}')">Apply</button>
      </div>
    </div>`));
    document.body.appendChild(ov); this._el=ov;
  },

  save(elId) {
    RF.H.snapshot('before-crosstab');
    RF.Core.DocumentModel.updateElement(elId,{
      rowField:    document.getElementById('ct-row')?.value||'',
      colField:    document.getElementById('ct-col')?.value||'',
      summaryField:document.getElementById('ct-sum')?.value||'',
      summaryFunc: document.getElementById('ct-fn')?.value||'Sum',
      rowTotals:   document.getElementById('ct-rowt')?.checked,
      colTotals:   document.getElementById('ct-colt')?.checked,
      grandTotal:  document.getElementById('ct-grt')?.checked,
    });
    RF.RP.syncElement(RF.Core.DocumentModel.getElementById(elId));
    RF.emit(RF.E.STATUS,'Crosstab updated');
    this._close();
  },
  _close() { this._el?.remove(); this._el=null; },
};


// ── v4: Top-N Sort + Record Selection Formula ──────────────────────────────────
