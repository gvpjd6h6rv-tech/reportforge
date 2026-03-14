import RF from '../rf.js';

/**
 * modules/rich-text-editor.js — RF.Modules.RichTextEditor
 * Layer   : Modules (v4)
 * Purpose : Rich-text element editor. Basic HTML formatting toolbar (bold,
 *           italic, color) over a contenteditable area.
 * Deps    : RF.Core.DocumentModel
 */

RF.Modules.RichTextEditor = {
  _el:null,
  init() { RF.on('richtext:open', elId=>this.open(elId)); },

  open(elId) {
    this._close();
    const el=RF.Core.DocumentModel.getElementById(elId); if(!el) return;
    const ov=document.createElement('div'); ov.className='modal-overlay';
    ov.append(RF.html(`
    <div class="modal modal-w-640">
      <div class="modal-hdr">
        <span>📝 Rich Text Editor — ${elId}</span>
        <button class="modal-close" onclick="RF.Modules.RichTextEditor._close()">×</button>
      </div>
      <div class="modal-body u-pad-0">
        <div class="u-btn-bar">
          ${[['<b>B</b>','bold'],['<i>I</i>','italic'],['<u>U</u>','underline'],['<s>S</s>','strikethrough']].map(([icon,cmd])=>`)
          <button class="modal-btn u-btn-compact" onclick="document.execCommand('${cmd}');document.getElementById('rt-editor').focus()">${icon}</button>`).join('')}
          <div class="tb-sep"></div>
          ${[['Left','justifyLeft'],['Center','justifyCenter'],['Right','justifyRight']].map(([lbl,cmd])=>`
          <button class="modal-btn u-fs-11 u-pad-panel8" onclick="document.execCommand('${cmd}');document.getElementById('rt-editor').focus()">${lbl}</button>`).join('')}
          <div class="tb-sep"></div>
          <select onchange="document.execCommand('fontName',false,this.value);document.getElementById('rt-editor').focus()" class="u-input-code">
            <option>Arial</option><option>Times New Roman</option><option>Courier New</option><option>Georgia</option><option>Verdana</option>
          </select>
          <select onchange="document.execCommand('fontSize',false,this.value);document.getElementById('rt-editor').focus()" class="u-input-code">
            ${[1,2,3,4,5,6].map(n=>`<option ${n===3?'selected':''}>${n}</option>`).join('')}
          </select>
          <div class="tb-sep"></div>
          <input type="color" title="Text color" onchange="document.execCommand('foreColor',false,this.value)" class="u-color-btn">
          <input type="color" title="Highlight" onchange="document.execCommand('hiliteColor',false,this.value)" class="u-color-btn">
          <div class="tb-sep"></div>
          <select id="rt-field-sel" class="u-fs11-input-mw150">
            <option value="">— Insert field —</option>
            ${[...RF.Core.DocumentModel.fieldData.database,...RF.Core.DocumentModel.fieldData.parameter].map(f=>`<option value="{${f}}">{${f}}</option>`).join('')}
          </select>
          <button class="modal-btn u-fs-11" onclick="RF.Modules.RichTextEditor._insertField()">Insert</button>
        </div>
        <div class="u-rte-area" id="rt-editor" contenteditable="true"
           
             >${el.htmlContent||'<p>Enter rich text here…</p>'}</div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn" onclick="RF.Modules.RichTextEditor._close()">Cancel</button>
        <button class="modal-btn primary" onclick="RF.Modules.RichTextEditor.save('${elId}')">Apply</button>
      </div>
    </div>`));
    document.body.appendChild(ov); this._el=ov;
    document.getElementById('rt-editor')?.focus();
  },

  _insertField() {
    const sel=document.getElementById('rt-field-sel'); if(!sel||!sel.value) return;
    document.getElementById('rt-editor')?.focus();
    document.execCommand('insertText',false,sel.value);
    sel.value='';
  },

  save(elId) {
    const html=document.getElementById('rt-editor')?.innerHTML||'';
    RF.H.snapshot('before-richtext');
    RF.Core.DocumentModel.updateElement(elId,{htmlContent:html});
    RF.RP.syncElement(RF.Core.DocumentModel.getElementById(elId));
    RF.emit(RF.E.STATUS,'Rich text saved');
    this._close();
  },
  _close() { this._el?.remove(); this._el=null; },
};

// ═══════════════════════════════════════════════════════════════════════════
// RF.Modules.MapEditor — map object configuration
// ═══════════════════════════════════════════════════════════════════════════
