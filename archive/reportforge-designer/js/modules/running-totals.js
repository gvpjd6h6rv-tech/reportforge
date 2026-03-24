import RF from '../rf.js';

/**
 * modules/running-totals.js — RF.Modules.RunningTotals
 * Layer   : Modules (v4)
 * Purpose : Running totals dialog. Define named accumulators with summary
 *           function, evaluate-on trigger, and reset-on condition.
 * Deps    : RF.Classic.Explorer, RF.Core.DocumentModel
 */

RF.Modules.RunningTotals = {
  _el: null,
  init() { RF.on(RF.E.RUNNING_TOTAL, ()=>this.open()); },

  open() {
    this._close();
    const rts = RF.Core.DocumentModel.layout.runningTotals||[];
    const ov = document.createElement('div'); ov.className='modal-overlay';
    ov.append(RF.html(`
    <div class="modal modal-w-680">
      <div class="modal-hdr">
        <span class="u-accent">Σ</span>
        <span>Running Totals Editor</span>
        <button class="modal-close" onclick="RF.Modules.RunningTotals._close()">×</button>
      </div>
      <div class="modal-body">
        <p class="u-modal-desc">
          Running totals accumulate across records. Reference as <code>RunTotal.name</code>.
        </p>
        <div class="u-grid-formula-hdr">
          <span>Name</span><span>Field</span><span>Summary</span><span>Evaluate</span><span>Reset</span><span></span>
        </div>
        <div id="rt-rows">${rts.map((r,i)=>this._row(r,i)).join('')}</div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn" onclick="RF.Modules.RunningTotals._add()">＋ Add Running Total</button>
        <div class="u-flex-1"></div>
        <button class="modal-btn" onclick="RF.Modules.RunningTotals._close()">Cancel</button>
        <button class="modal-btn primary" onclick="RF.Modules.RunningTotals.save()">Save</button>
      </div>
    </div>`));
    document.body.appendChild(ov); this._el=ov;
  },

  _row(r={}) {
    const evals=['PerRecord','OnChangeOf','OnGroupChange','Never'];
    const resets=['Never','OnGroupChange','OnReport','OnPage'];
    const funcs=['Sum','Count','Avg','Max','Min','DistinctCount'];
    return `<div class="rt-row">
      <input class="rt-name u-mono"  type="text"   value="${r.name||''}"   placeholder="TotalSales"    >
      <input class="rt-field u-mono" type="text"   value="${r.field||''}"  placeholder="field.path"    >
      <select class="rt-func u-fs-11">${funcs.map(f=>`<option ${r.summaryFunction===f?'selected':''}>${f}</option>`).join('')}</select>
      <select class="rt-eval u-fs-11">${evals.map(e=>`<option ${r.evaluateOn===e?'selected':''}>${e}</option>`).join('')}</select>
      <select class="rt-rst u-fs-11">${resets.map(r2=>`<option ${r.resetOn===r2?'selected':''}>${r2}</option>`).join('')}</select>
      <button class="pi-cond-rm u-btn-rm" onclick="this.closest('.rt-row').remove()">×</button>
    </div>`;
  },

  _add() { const l=document.getElementById('rt-rows');if(!l)return;const d=document.createElement('div');d.append(RF.html(this._row({})));l.appendChild(d.firstElementChild); },

  save() {
    const rts=[];
    document.querySelectorAll('#rt-rows .rt-row').forEach(r=>{
      const name=r.querySelector('.rt-name')?.value.trim(); if(!name) return;
      rts.push({name, field:r.querySelector('.rt-field')?.value||'',
        summaryFunction:r.querySelector('.rt-func')?.value||'Sum',
        evaluateOn:r.querySelector('.rt-eval')?.value||'PerRecord',
        resetOn:r.querySelector('.rt-rst')?.value||'Never'});
    });
    RF.H.snapshot('before-rt');
    RF.Core.DocumentModel.layout.runningTotals=rts;
    RF.Core.DocumentModel.fieldData.running=rts.map(r=>`RunTotal.${r.name}`);
    RF.Core.DocumentModel.isDirty=true;
    RF.Classic.Explorer.render();
    RF.emit(RF.E.STATUS,`Running Totals: ${rts.length}`);
    this._close();
  },
  _close() { this._el?.remove(); this._el=null; },
};


// ── v4: Crosstab Editor ────────────────────────────────────────────────────────
