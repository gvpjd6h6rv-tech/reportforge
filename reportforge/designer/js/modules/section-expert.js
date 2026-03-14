import RF from '../rf.js';

/**
 * modules/section-expert.js — RF.Modules.SectionExpert
 * Layer   : Modules (v3 + v4 patch)
 * Purpose : Section expert dialog. Suppress, keepTogether, underlay-following,
 *           background color, and v4 fields (suppressFormula, pageBreak).
 * Deps    : RF.Core.DocumentModel
 */

RF.Modules.SectionExpert = {
  _el: null,
  init() { RF.on('section:edit', secId=>this.open(secId)); },

  open(secId) {
    this._close();
    const sec=RF.Core.DocumentModel.getSectionById(secId); if(!sec) return;
    const ov=document.createElement('div'); ov.className='modal-overlay';
    ov.append(RF.html(`
    <div class="modal u-modal-w-440">
      <div class="modal-hdr">
        <span>§ Section Expert — ${sec.label}</span>
        <button class="modal-close" onclick="RF.Modules.SectionExpert._close()">×</button>
      </div>
      <div class="modal-body">
        <div class="pi-row"><label class="u-mw-130">Label</label><input id="se-label" type="text" value="${sec.label}" class="u-flex-1"></div>
        <div class="pi-row"><label class="u-mw-130">Height</label><input id="se-height" type="number" value="${sec.height}" min="4" class="u-w-70"> px</div>
        <div class="pi-row"><label class="u-mw-130">Background</label>
          <input id="se-bg" type="color" value="${sec.bgColor==='transparent'?'#ffffff':sec.bgColor}">
          <label class="pi-check u-ml-8"><input id="se-bg-tr" type="checkbox" ${sec.bgColor==='transparent'?'checked':''}><span>Transparent</span></label>
        </div>
        <div class="pi-section">Behaviour</div>
        <div class="pi-checks">
          <label class="pi-check"><input id="se-grow"   type="checkbox" ${sec.canGrow?'checked':''}><span>Can Grow</span></label>
          <label class="pi-check"><input id="se-shrink" type="checkbox" ${sec.canShrink?'checked':''}><span>Can Shrink</span></label>
          <label class="pi-check"><input id="se-repeat" type="checkbox" ${sec.repeatOnNewPage?'checked':''}><span>Repeat on new page</span></label>
          <label class="pi-check"><input id="se-pbb"    type="checkbox" ${sec.pageBreakBefore?'checked':''}><span>Page break before</span></label>
          <label class="pi-check"><input id="se-pba"    type="checkbox" ${sec.pageBreakAfter?'checked':''}><span>Page break after</span></label>
        </div>
        <div class="pi-section">Data</div>
        <div class="pi-row"><label class="u-mw-130">Iterates over</label>
          <input id="se-iter" type="text" value="${sec.iterates||''}" placeholder="e.g. items" class="u-input-mono"></div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn" onclick="RF.Modules.SectionExpert._close()">Cancel</button>
        <button class="modal-btn primary" onclick="RF.Modules.SectionExpert.save('${secId}')">Apply</button>
      </div>
    </div>`));
    document.body.appendChild(ov); this._el=ov;
  },

  save(secId) {
    const bgTr=document.getElementById('se-bg-tr')?.checked;
    RF.H.snapshot('before-section');
    RF.Core.DocumentModel.updateSection(secId,{
      label:      document.getElementById('se-label')?.value||'',
      height:     parseInt(document.getElementById('se-height')?.value)||20,
      bgColor:    bgTr?'transparent':document.getElementById('se-bg')?.value||'transparent',
      canGrow:    document.getElementById('se-grow')?.checked||false,
      canShrink:  document.getElementById('se-shrink')?.checked||false,
      repeatOnNewPage:document.getElementById('se-repeat')?.checked||false,
      pageBreakBefore:document.getElementById('se-pbb')?.checked||false,
      pageBreakAfter: document.getElementById('se-pba')?.checked||false,
      iterates:   document.getElementById('se-iter')?.value||null,
    });
    RF.RP.fullRender();
    RF.emit(RF.E.STATUS,'Section updated');
    this._close();
  },

  _close() { this._el?.remove(); this._el=null; },
};

// ── Object Explorer Panel ─────────────────────────────────────────────────────

// ── v4 keepTogether / underlay / suppress fields patch ───────
  const _origSave = RF.Modules.SectionExpert.save.bind(RF.Modules.SectionExpert);
  const _origOpen = RF.Modules.SectionExpert.open.bind(RF.Modules.SectionExpert);

  RF.Modules.SectionExpert.open = function(secId) {
    _origOpen(secId);
    // Append extra fields to modal body
    setTimeout(() => {
      const sec = RF.Core.DocumentModel.getSectionById(secId);
      if (!sec) return;
      const body = document.querySelector('.modal .modal-body');
      if (!body || body.dataset.v4patched) return;
      body.dataset.v4patched = '1';
      const extra = document.createElement('div');
      extra.replaceChildren(); extra.append(RF.html(`
        <div class="pi-section u-mt-8">Advanced</div>
        <div class="pi-checks u-pad-6-10-col">
          <label class="pi-check"><input id="se-kt"     type="checkbox" ${sec.keepTogether?'checked':''}><span>Keep Together</span></label>
          <label class="pi-check"><input id="se-ul"     type="checkbox" ${sec.underlayFollowing?'checked':''}><span>Underlay Following Section</span></label>
          <label class="pi-check"><input id="se-supp"   type="checkbox" ${sec.suppress?'checked':''}><span>Suppress (No Drill-Down)</span></label>
        </div>
        <div class="pi-row">
          <label class="u-mw-130">Suppress formula</label>
          <input id="se-suppfm" type="text" value="${sec.suppressFormula||''}" placeholder="{items.qty} = 0" class="u-input-mono">
        </div>`));
      body.appendChild(extra);
    }, 50);
  };

  RF.Modules.SectionExpert.save = function(secId) {
    _origSave(secId);
    // Also save new fields if present
    const kt   = document.getElementById('se-kt')?.checked;
    const ul   = document.getElementById('se-ul')?.checked;
    const supp = document.getElementById('se-supp')?.checked;
    const suppFm = document.getElementById('se-suppfm')?.value||'';
    if (kt !== undefined) {
      RF.Core.DocumentModel.updateSection(secId, {
        keepTogether: kt, underlayFollowing: ul,
        suppress: supp, suppressFormula: suppFm,
      });
    }
  };


// ── v4: Formula Editor — syntax highlight + autocomplete ─────────────────────
