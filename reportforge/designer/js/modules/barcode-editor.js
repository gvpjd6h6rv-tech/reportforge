import RF from '../rf.js';

/**
 * modules/barcode-editor.js — RF.Modules.BarcodeEditor
 * Layer   : Modules (v4)
 * Purpose : Barcode element editor. Select barcode symbology (Code 128,
 *           QR, etc.), bind to a data field, toggle human-readable text.
 * Deps    : RF.Core.DocumentModel
 */

RF.Modules.BarcodeEditor = {
  _el:null,
  init() { RF.on('barcode:open', elId=>this.open(elId)); },

  open(elId) {
    this._close();
    const el=RF.Core.DocumentModel.getElementById(elId); if(!el) return;
    const TYPES=['code128','code39','ean13','ean8','qr','datamatrix','pdf417','aztec','upca'];
    const ov=document.createElement('div'); ov.className='modal-overlay';
    ov.append(RF.html(`
    <div class="modal u-modal-w-460">
      <div class="modal-hdr">
        <span>▐▌ Barcode Designer — ${elId}</span>
        <button class="modal-close" onclick="RF.Modules.BarcodeEditor._close()">×</button>
      </div>
      <div class="modal-body">
        <div class="pi-section u-mt-0">Barcode Type</div>
        <div class="u-pad-wrap5">
          ${TYPES.map(t=>`)<button class="modal-btn ${el.barcodeType===t?'primary':''} u-mw-70-fs11" onclick="RF.Modules.BarcodeEditor._setType(this,'${t}')">${t.toUpperCase()}</button>`).join('')}
        </div>
        <input type="hidden" id="bc-type" value="${el.barcodeType||'code128'}">
        <div class="pi-section">Data</div>
        <div class="pi-row"><label class="u-mw-90">Field path</label>
          <input id="bc-field" type="text" value="${el.fieldPath||''}" placeholder="items.barcode_value" class="u-input-mono"></div>
        <div class="pi-row"><label class="u-mw-90">Static value</label>
          <input id="bc-static" type="text" value="${el.content||''}" placeholder="e.g. 1234567890" class="u-input-mono"></div>
        <div class="pi-section">Appearance</div>
        <div class="pi-row"><label class="u-mw-90">Bar color</label>
          <input id="bc-color" type="color" value="${el.color||'#000000'}"></div>
        <div class="pi-row"><label class="u-mw-90">Background</label>
          <input id="bc-bg" type="color" value="${el.bgColor==='transparent'?'#ffffff':el.bgColor||'#ffffff'}">
          <label class="pi-check u-ml-8"><input id="bc-bg-tr" type="checkbox" ${el.bgColor==='transparent'?'checked':''}><span>Transparent</span></label>
        </div>
        <div class="pi-checks">
          <label class="pi-check"><input id="bc-txt" type="checkbox" ${el.showText!==false?'checked':''}><span>Show text below barcode</span></label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn" onclick="RF.Modules.BarcodeEditor._close()">Cancel</button>
        <button class="modal-btn primary" onclick="RF.Modules.BarcodeEditor.save('${elId}')">Apply</button>
      </div>
    </div>`));
    document.body.appendChild(ov); this._el=ov;
  },

  _setType(btn,t) {
    document.querySelectorAll('.modal .modal-btn').forEach(b=>{
      if(['CODE128','CODE39','EAN13','EAN8','QR','DATAMATRIX','PDF417','AZTEC','UPCA'].includes(b.textContent)) b.classList.remove('primary');
    });
    btn.classList.add('primary');
    const inp=document.getElementById('bc-type'); if(inp) inp.value=t;
  },

  save(elId) {
    const bgTr=document.getElementById('bc-bg-tr')?.checked;
    RF.H.snapshot('before-barcode');
    RF.Core.DocumentModel.updateElement(elId,{
      barcodeType:document.getElementById('bc-type')?.value||'code128',
      fieldPath:  document.getElementById('bc-field')?.value||'',
      content:    document.getElementById('bc-static')?.value||'',
      color:      document.getElementById('bc-color')?.value||'#000',
      bgColor:    bgTr?'transparent':document.getElementById('bc-bg')?.value||'transparent',
      showText:   document.getElementById('bc-txt')?.checked!==false,
    });
    RF.RP.syncElement(RF.Core.DocumentModel.getElementById(elId));
    RF.emit(RF.E.STATUS,'Barcode configured');
    this._close();
  },
  _close() { this._el?.remove(); this._el=null; },
};

// ═══════════════════════════════════════════════════════════════════════════
// RF.Modules.RichTextEditor — HTML rich text editor
// ═══════════════════════════════════════════════════════════════════════════
