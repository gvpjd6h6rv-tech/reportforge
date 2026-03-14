import RF from '../rf.js';

/**
 * modules/topn.js — RF.Modules.TopN
 * Layer   : Modules (v4)
 * Purpose : Top-N / record-selection dialog. Filter the report to the top
 *           or bottom N records by a chosen field and direction.
 * Deps    : RF.Core.DocumentModel
 */

RF.Modules.TopN = {
  _el:null,
  init() { RF.on(RF.E.TOPN_OPEN, ()=>this.open()); },

  open() {
    this._close();
    const layout=RF.Core.DocumentModel.layout;
    const topN=layout.topN||{};
    const ov=document.createElement('div'); ov.className='modal-overlay';
    ov.append(RF.html(`
    <div class="modal modal-w-520">
      <div class="modal-hdr">
        <span>🏆 Top-N &amp; Record Selection</span>
        <button class="modal-close" onclick="RF.Modules.TopN._close()">×</button>
      </div>
      <div class="modal-body">
        <div class="pi-section u-mt-0">Record Selection Formula</div>
        <p class="u-fs11-dim-p">Applied to every record before grouping and sorting.</p>
        <div class="u-pad-panel">
          <textarea id="tn-recsel" rows="3" class="u-textarea">${layout.recordSelectionFormula||''}</textarea>
        </div>

        <div class="pi-section">Group Selection Formula</div>
        <div class="u-pad-panel">
          <textarea id="tn-grpsel" rows="2" class="u-textarea">${layout.groupSelectionFormula||''}</textarea>
        </div>

        <div class="pi-section">Top-N / Bottom-N</div>
        <div class="pi-checks u-mb-8">
          <label class="pi-check"><input id="tn-enabled" type="checkbox" ${topN.enabled?'checked':''}><span>Enable Top-N</span></label>
          <label class="pi-check"><input id="tn-bottom"  type="checkbox" ${topN.bottom?'checked':''}><span>Bottom-N (reverse)</span></label>
        </div>
        <div class="pi-row"><label class="u-mw-100">N value</label>
          <input id="tn-n" type="number" min="1" value="${topN.n||10}" class="u-w-70"></div>
        <div class="pi-row"><label class="u-mw-100">Sort field</label>
          <input id="tn-field" type="text" value="${topN.field||''}" placeholder="field.path" class="u-input-mono"></div>
        <div class="pi-row"><label class="u-mw-100">Include ties</label>
          <input id="tn-ties" type="checkbox" ${topN.includeTies?'checked':''}></div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn" onclick="RF.Modules.TopN._close()">Cancel</button>
        <button class="modal-btn primary" onclick="RF.Modules.TopN.save()">Apply</button>
      </div>
    </div>`));
    document.body.appendChild(ov); this._el=ov;
  },

  save() {
    RF.H.snapshot('before-topn');
    const DM=RF.Core.DocumentModel;
    DM.layout.recordSelectionFormula = document.getElementById('tn-recsel')?.value||'';
    DM.layout.groupSelectionFormula  = document.getElementById('tn-grpsel')?.value||'';
    DM.layout.topN = {
      enabled:     document.getElementById('tn-enabled')?.checked||false,
      bottom:      document.getElementById('tn-bottom')?.checked||false,
      n:           parseInt(document.getElementById('tn-n')?.value)||10,
      field:       document.getElementById('tn-field')?.value||'',
      includeTies: document.getElementById('tn-ties')?.checked||false,
    };
    DM.isDirty=true;
    RF.emit(RF.E.STATUS,'Record selection & Top-N saved');
    this._close();
  },
  _close() { this._el?.remove(); this._el=null; },
};


// ── v4: Add multiple detail sections / group headers ──────────────────────────
