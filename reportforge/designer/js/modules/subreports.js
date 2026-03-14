import RF from '../rf.js';

/**
 * modules/subreports.js — RF.Modules.Subreports
 * Layer   : Modules (v3)
 * Purpose : Subreport element editor. Configure the linked report file,
 *           link fields from parent to subreport parameters.
 * Deps    : RF.Core.DocumentModel
 */

RF.Modules.Subreports = {
  _el: null,
  init() { RF.on('subreports:open', elId=>this.open(elId)); },

  open(elId) {
    this._close();
    const el=RF.Core.DocumentModel.getElementById(elId); if(!el) return;
    const ov=document.createElement('div'); ov.className='modal-overlay';
    ov.append(RF.html(`
    <div class="modal u-modal-w-500">
      <div class="modal-hdr">
        <span>🗂 Subreport Configuration — ${elId}</span>
        <button class="modal-close" onclick="RF.Modules.Subreports._close()">×</button>
      </div>
      <div class="modal-body">
        <div class="pi-section u-mt-0">Layout</div>
        <div class="pi-row"><label class="u-mw-110">Layout path</label>
          <input id="sr-layout" type="text" value="${el.layoutPath||''}" placeholder="path/to/report.rfd.json" class="u-input-mono"></div>
        <div class="pi-row"><label class="u-mw-110">Data path</label>
          <input id="sr-data"   type="text" value="${el.dataPath||''}"   placeholder="field.subItems" class="u-input-mono"></div>

        <div class="pi-section">Link Fields</div>
        <p class="u-fs11-dim-p">Pass parent fields into the subreport as parameters.</p>
        <div id="sr-links">${(el.linkFields||[]).map((lf,i)=>this._linkRow(lf)).join('')}</div>
        <button class="modal-btn u-pad-4-10" onclick="RF.Modules.Subreports._addLink()">＋ Link Field</button>

        <div class="pi-section">Options</div>
        <div class="pi-checks u-pad-6-10">
          <label class="pi-check"><input id="sr-border" type="checkbox" ${el.borderWidth?'checked':''}><span>Show border</span></label>
          <label class="pi-check"><input id="sr-grow"   type="checkbox" ${el.canGrow?'checked':''}><span>Can grow</span></label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn" onclick="RF.Modules.Subreports._close()">Cancel</button>
        <button class="modal-btn primary" onclick="RF.Modules.Subreports.save('${elId}')">Apply</button>
      </div>
    </div>`));
    document.body.appendChild(ov); this._el=ov;
  },

  _linkRow(lf={}) {
    return `<div class="link-row u-flex-gap6-m">
      <input class="lf-parent u-input-mono" type="text" placeholder="parent.field" value="${lf.parentField||''}">
      <span class="u-line-28">→</span>
      <input class="lf-param u-input-mono"  type="text" placeholder="param.name"   value="${lf.paramName||''}">
      <button class="pi-cond-rm u-btn-rm" onclick="this.closest('.link-row').remove()">×</button>
    </div>`;
  },

  _addLink() { const l=document.getElementById('sr-links');if(!l)return;const d=document.createElement('div');d.append(RF.html(this._linkRow({})));l.appendChild(d.firstElementChild); },

  save(elId) {
    const linkFields=[];
    document.querySelectorAll('#sr-links .link-row').forEach(r=>{
      const p=r.querySelector('.lf-parent')?.value.trim();
      const n=r.querySelector('.lf-param')?.value.trim();
      if(p&&n) linkFields.push({parentField:p,paramName:n});
    });
    RF.H.snapshot('before-subreport');
    RF.Core.DocumentModel.updateElement(elId,{
      layoutPath:document.getElementById('sr-layout')?.value||'',
      dataPath:  document.getElementById('sr-data')?.value||'',
      linkFields,
      borderWidth:document.getElementById('sr-border')?.checked?1:0,
      canGrow:   document.getElementById('sr-grow')?.checked||false,
    });
    RF.RP.syncElement(RF.Core.DocumentModel.getElementById(elId));
    RF.emit(RF.E.STATUS,'Subreport configured');
    this._close();
  },

  _close() { this._el?.remove(); this._el=null; },
};

// ── Conditional Formatting ────────────────────────────────────────────────────
