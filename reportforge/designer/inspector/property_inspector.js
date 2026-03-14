// ─────────────────────────────────────────────────────────────────────────────
// inspector/property_inspector.js  –  Property Inspector  (feature 40)
// Shows editable properties for selected element(s).
// ─────────────────────────────────────────────────────────────────────────────
RF.PropertyInspector = {

  _el: null,   // Root DOM element

  init() {
    this._el = document.getElementById('property-inspector');
    if (!this._el) return;

    RF.EventBus
      .on('selection:changed', () => this.render())
      .on('inspector:refresh',  () => this.refresh());
  },

  render() {
    if (!this._el) return;
    const sel = RF.AppState.selectedElements;

    if (sel.length === 0) {
      this._renderEmpty();
    } else if (sel.length === 1) {
      this._renderElement(sel[0]);
    } else {
      this._renderMulti(sel);
    }
  },

  refresh() {
    // Quick position/size update without full re-render
    const sel = RF.AppState.selectedElements;
    if (sel.length !== 1) return;
    const el = sel[0];
    const setV = (id, v) => { const i = this._el.querySelector(`[data-prop="${id}"]`); if (i) i.value = Math.round(v); };
    setV('x', el.x); setV('y', el.y); setV('w', el.w); setV('h', el.h);
  },

  focusField(name) {
    const inp = this._el?.querySelector(`[data-prop="${name}"]`);
    if (inp) { inp.focus(); inp.select(); }
  },

  _renderEmpty() {
    this._el.innerHTML = `
      <div class="pi-empty">
        <div class="pi-empty-icon">☰</div>
        <div>Select an element<br>to see its properties</div>
      </div>`;
  },

  _renderMulti(els) {
    this._el.innerHTML = `
      <div class="pi-section-hdr">Multiple Selection (${els.length})</div>
      <div class="pi-row">
        <label>X offset</label>
        <input type="number" data-prop="multi-x" value="0">
      </div>
      <div class="pi-row">
        <label>Y offset</label>
        <input type="number" data-prop="multi-y" value="0">
      </div>
      <div class="pi-actions">
        <button onclick="RF.Alignment.alignLeft()">⊢ Left</button>
        <button onclick="RF.Alignment.alignRight()">⊣ Right</button>
        <button onclick="RF.Alignment.alignHCenter()">⊟ H.Center</button>
        <button onclick="RF.Alignment.alignTop()">⊤ Top</button>
        <button onclick="RF.Alignment.alignBottom()">⊥ Bottom</button>
        <button onclick="RF.Alignment.distributeHorizontal()">↔ Dist H</button>
        <button onclick="RF.Alignment.distributeVertical()">↕ Dist V</button>
      </div>`;
  },

  _renderElement(el) {
    const isText  = el.type === 'text' || el.type === 'field';
    const isLine  = el.type === 'line';
    const isShape = el.type === 'rect' || el.type === 'image';

    this._el.innerHTML = `
      <!-- Header -->
      <div class="pi-section-hdr">
        <span class="pi-el-type pi-type-${el.type}">${el.type.toUpperCase()}</span>
        <span class="pi-el-id">${el.id}</span>
      </div>

      <!-- Position & Size (feature: Position) -->
      <div class="pi-section">📐 Position &amp; Size</div>
      <div class="pi-grid4">
        ${this._num('X',    'x',  el.x,  'px')}
        ${this._num('Y',    'y',  el.y,  'px')}
        ${this._num('W',    'w',  el.w,  'px')}
        ${this._num('H',    'h',  el.h,  'px')}
        ${this._num('Z',    'zIndex', el.zIndex||0, '')}
      </div>

      ${isText ? `
      <!-- Font (feature: Font) -->
      <div class="pi-section">🔤 Font</div>
      <div class="pi-row">
        <label>Family</label>
        <select data-prop="fontFamily">
          ${['Arial','Helvetica','Times New Roman','Courier New','Georgia','Verdana']
              .map(f=>`<option ${el.fontFamily===f?'selected':''}>${f}</option>`).join('')}
        </select>
      </div>
      <div class="pi-grid2">
        ${this._num('Size','fontSize',el.fontSize||9,'pt')}
        <div class="pi-row">
          <label>Align</label>
          <select data-prop="align">
            ${['left','center','right','justify'].map(a=>`<option ${el.align===a?'selected':''}>${a}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="pi-row pi-checkrow">
        ${this._chk('Bold',      'bold',      el.bold)}
        ${this._chk('Italic',    'italic',    el.italic)}
        ${this._chk('Underline', 'underline', el.underline)}
      </div>
      <!-- Color -->
      <div class="pi-section">🎨 Color</div>
      <div class="pi-row">
        <label>Text</label>
        <input type="color" data-prop="color" value="${el.color||'#000000'}">
        <span class="pi-hex">${el.color||'#000000'}</span>
      </div>
      <div class="pi-row">
        <label>Background</label>
        <div style="display:flex;gap:6px;align-items:center">
          <input type="color" data-prop="bgColor" value="${el.bgColor==='transparent'?'#ffffff':el.bgColor||'#ffffff'}">
          ${this._chk('Transparent','_bgTransparent', el.bgColor==='transparent'||!el.bgColor)}
        </div>
      </div>
      ${el.type === 'field' ? `
      <!-- Field path -->
      <div class="pi-section">🔗 Field</div>
      <div class="pi-row">
        <label>Path</label>
        <input type="text" data-prop="fieldPath" value="${el.fieldPath||''}">
      </div>
      <div class="pi-row">
        <label>Format</label>
        <select data-prop="fieldFmt">
          ${['','currency','int','float2','pct','date','datetime']
              .map(f=>`<option ${el.fieldFmt===f?'selected':''}>${f||'(auto)'}</option>`).join('')}
        </select>
      </div>
      ` : `
      <!-- Text content -->
      <div class="pi-section">📝 Content</div>
      <div class="pi-row">
        <label>Text</label>
        <textarea data-prop="content" rows="2">${el.content||''}</textarea>
      </div>
      `}
      ` : ''}

      ${isLine ? `
      <div class="pi-section">📏 Line</div>
      <div class="pi-row">
        <label>Direction</label>
        <select data-prop="lineDir">
          <option ${el.lineDir==='h'?'selected':''}>h</option>
          <option ${el.lineDir==='v'?'selected':''}>v</option>
        </select>
      </div>
      ${this._num('Width','lineWidth',el.lineWidth||1,'px')}
      <div class="pi-row">
        <label>Color</label>
        <input type="color" data-prop="color" value="${el.color||'#000000'}">
      </div>
      ` : ''}

      <!-- Border (feature: Border) -->
      <div class="pi-section">🔲 Border</div>
      <div class="pi-grid2">
        ${this._num('Width','borderWidth',el.borderWidth||0,'px')}
        <div class="pi-row">
          <label>Style</label>
          <select data-prop="borderStyle">
            ${['solid','dashed','dotted','double','none']
                .map(s=>`<option ${el.borderStyle===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="pi-row">
        <label>Color</label>
        <input type="color" data-prop="borderColor" value="${el.borderColor||'#000000'}">
      </div>

      <!-- Visibility (feature: Suppression) -->
      <div class="pi-section">👁 Visibility</div>
      <div class="pi-row">
        <label>Visible If</label>
        <input type="text" data-prop="visibleIf" value="${el.visibleIf||''}">
      </div>
      <div class="pi-row pi-checkrow">
        ${this._chk('Suppress if empty','suppressIfEmpty',el.suppressIfEmpty)}
        ${isText ? this._chk('Can Grow','canGrow',el.canGrow) : ''}
        ${isText ? this._chk('Word Wrap','wordWrap',el.wordWrap) : ''}
      </div>

      <!-- Section -->
      <div class="pi-section">📋 Section</div>
      <div class="pi-row">
        <label>Section</label>
        <select data-prop="sectionId">
          ${RF.AppState.layout.sections.map(s=>
            `<option value="${s.id}" ${el.sectionId===s.id?'selected':''}>${s.label}</option>`
          ).join('')}
        </select>
      </div>

      <!-- Delete button -->
      <div class="pi-actions" style="margin-top:12px">
        <button class="pi-btn-danger" onclick="RF.History.snapshot('before-delete');RF.ElementFactory.deleteElements(['${el.id}'])">
          🗑 Delete Element
        </button>
      </div>
    `;

    // Attach live change listeners
    this._el.querySelectorAll('[data-prop]').forEach(inp => {
      const ev = inp.type === 'checkbox' ? 'change' : 'input';
      inp.addEventListener(ev, () => this._onPropChange(el, inp));
    });
  },

  _onPropChange(el, inp) {
    const prop  = inp.dataset.prop;
    let   value = inp.type === 'checkbox' ? inp.checked : inp.value;

    // Numeric props
    if (['x','y','w','h','fontSize','lineWidth','borderWidth','zIndex'].includes(prop)) {
      value = parseFloat(value) || 0;
    }

    // Background color transparency toggle
    if (prop === '_bgTransparent') {
      el.bgColor = value ? 'transparent' : '#FFFFFF';
      RF.ElementFactory.syncDOM(el);
      RF.AppState.isDirty = true;
      RF.EventBus.emit('layout:changed');
      return;
    }

    el[prop] = value;

    // Clamp position
    if (prop === 'w') el.w = Math.max(4, el.w);
    if (prop === 'h') el.h = Math.max(4, el.h);

    // Update DOM
    RF.ElementFactory.syncDOM(el);
    RF.SelectionHandles.sync();
    RF.AppState.isDirty = true;
    RF.EventBus.emit('layout:changed');

    // Update hex display
    if (inp.type === 'color') {
      const hex = inp.nextElementSibling;
      if (hex && hex.classList.contains('pi-hex')) hex.textContent = value;
    }
  },

  // ── Helpers ──────────────────────────────────────────────────────────────
  _num(label, prop, val, unit) {
    return `<div class="pi-row">
      <label>${label}</label>
      <div style="display:flex;align-items:center;gap:3px">
        <input type="number" data-prop="${prop}" value="${Math.round(val)}" style="width:60px">
        <span style="font-size:10px;color:#666">${unit}</span>
      </div>
    </div>`;
  },
  _chk(label, prop, val) {
    return `<label class="pi-check">
      <input type="checkbox" data-prop="${prop}" ${val?'checked':''}>
      <span>${label}</span>
    </label>`;
  },
};
