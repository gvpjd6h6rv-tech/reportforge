import RF from '../rf.js';

/**
 * modules/multi-section.js — RF.Modules.MultiSection
 * Layer   : Modules (v4)
 * Purpose : Multi-section manager. Add, remove, and reorder sub-sections
 *           within a detail or group band (equivalent to Crystal's "§§").
 * Deps    : RF.Classic.Sections, RF.Core.DocumentModel
 */

RF.Modules.MultiSection = {
  _el: null,
  init() { RF.on('multisec:open', ()=>this.open()); },

  open() {
    this._close();
    const layout = RF.Core.DocumentModel.layout;
    const ov = document.createElement('div'); ov.className='modal-overlay';
    ov.append(RF.html(`
    <div class="modal modal-w-480">
      <div class="modal-hdr">
        <span>§§ Section Manager</span>
        <button class="modal-close" onclick="RF.Modules.MultiSection._close()">×</button>
      </div>
      <div class="modal-body">
        <p class="u-modal-desc">
          Add multiple detail or group header/footer sections for complex layouts.
        </p>
        <table class="sec-exp-table">
          <thead><tr><th>Type</th><th>Label</th><th>Height</th><th>Group</th><th>Action</th></tr></thead>
          <tbody id="ms-body">
            ${layout.sections.map((sec,i)=>`)
            <tr>
              <td><span class="sec-badge u-sec-badge" style="--sec-color:${RF.Classic.Sections.COLORS[sec.stype]||'#555'}">${sec.stype.toUpperCase()}</span></td>
              <td class="u-fs-11">${sec.label}</td>
              <td class="u-mono">${sec.height}px</td>
              <td class="u-mono">${sec.groupIndex||0}</td>
              <td><button class="pi-btn u-pad-sec" onclick="RF.emit('section:edit','${sec.id}')">⚙</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div class="pi-actions u-mt8-flex-wrap">
          ${['det','gh','gf','rh','ph','pf','rf'].map(t=>`<button class="modal-btn u-fs-11" onclick="RF.Modules.MultiSection.addSec('${t}')">＋ ${t.toUpperCase()}</button>`).join('')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn primary" onclick="RF.Modules.MultiSection._close()">Close</button>
      </div>
    </div>`));
    document.body.appendChild(ov); this._el=ov;
  },

  addSec(stype) {
    const DM = RF.Core.DocumentModel;
    const labels = {det:'Detail',gh:'Group Header',gf:'Group Footer',rh:'Report Header',ph:'Page Header',pf:'Page Footer',rf:'Report Footer'};
    const color  = RF.Classic.Sections.COLORS;
    RF.H.snapshot('before-add-sec');
    const newSec = {
      id:RF.uid(stype), stype, label:labels[stype]||stype, height:20,
      iterates:stype==='det'?'items':null, groupIndex:0,
      canGrow:false, canShrink:false, repeatOnNewPage:false,
      pageBreakBefore:false, bgColor:'transparent',
    };
    // Insert at correct position (after last section of same type)
    const idx = [...DM.layout.sections].reverse().findIndex(s=>s.stype===stype);
    if (idx>=0) DM.layout.sections.splice(DM.layout.sections.length-idx, 0, newSec);
    else        DM.layout.sections.push(newSec);
    DM.isDirty=true;
    RF.RP.fullRender();
    RF.emit(RF.E.STATUS,`Added section: ${newSec.label}`);
    this._close(); this.open(); // Refresh
  },

  _close() { this._el?.remove(); this._el=null; },
};


// ── v4 v5 Panels ────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════
// RF.Modules.ReportExplorer — Crystal-style report tree (left panel tab 2)
// ═══════════════════════════════════════════════════════════════════════════
