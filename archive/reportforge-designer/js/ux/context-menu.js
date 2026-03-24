import RF from '../rf.js';

/**
 * ux/context-menu.js — RF.UX.ContextMenu
 * Layer   : UX / v4
 * Purpose : Right-click context menu. Menu items are built dynamically based
 *           on the current selection and section under the pointer.
 * Deps    : RF.Core.DocumentModel, RF.Classic.Sections,
 *           RF.UX.Alignment, RF.UX.FormatPainter, RF.UX.ObjectGroup
 */

RF.UX.ContextMenu = {
  _el: null,
  _targetEl: null,
  _targetSecId: null,

  init() {
    this._el = document.getElementById('ctx-menu');
    if (!this._el) {
      this._el = document.createElement('div');
      this._el.id = 'ctx-menu';
      document.body.appendChild(this._el);
    }
    // Close on any click outside
    document.addEventListener('pointerdown', e => {
      if (!this._el.contains(e.target)) this.hide();
    });
    document.addEventListener('scroll', () => this.hide(), true);
    // Keyboard close
    document.addEventListener('keydown', e => { if(e.key==='Escape') this.hide(); });

    // Attach to canvas
    document.addEventListener('contextmenu', e => this._onContextMenu(e));
  },

  _onContextMenu(e) {
    const elDiv = e.target.closest('.rf-el[data-elid]');
    const secBody = e.target.closest('.rf-sec-body');
    if (!elDiv && !secBody) return;
    e.preventDefault();

    this._targetEl    = elDiv ? elDiv.dataset.elid : null;
    this._targetSecId = secBody ? secBody.dataset.secid : null;

    // If right-clicking an element not in selection, select it
    if (this._targetEl && !RF.Core.DocumentModel.selectedIds.has(this._targetEl)) {
      RF.Sel.select(this._targetEl, false);
    }

    this._build();
    this.show(e.clientX, e.clientY);
  },

  _build() {
    const DM  = RF.Core.DocumentModel;
    const sel = DM.selectedElements;
    const el  = this._targetEl ? DM.getElementById(this._targetEl) : null;
    const multi = sel.length > 1;

    const items = [];

    if (el) {
      items.push(
        this._item('✂','Cut',         'Ctrl+X', () => { RF.App.copy(); RF.App.deleteSelected(); }),
        this._item('⧉','Copy',        'Ctrl+C', () => RF.App.copy()),
        this._item('⊕','Duplicate',   'Ctrl+D', () => RF.App.duplicate()),
        this._sep(),
        this._item('✕','Delete',      'Del',    () => RF.App.deleteSelected(), true),
        this._sep(),
        // Layer sub-menu
        this._sub('⬆','Layer Order', [
          this._item('⬆','Bring to Front',  '', () => { DM.reorderElement(el.id,'front');   RF.RP.reconcile(); }),
          this._item('↑','Bring Forward',   '', () => { DM.reorderElement(el.id,'forward');  RF.RP.reconcile(); }),
          this._item('↓','Send Backward',   '', () => { DM.reorderElement(el.id,'backward'); RF.RP.reconcile(); }),
          this._item('⬇','Send to Back',    '', () => { DM.reorderElement(el.id,'back');     RF.RP.reconcile(); }),
        ]),
      );

      if (multi) {
        items.push(
          this._sep(),
          this._sub('⊟','Align', [
            this._item('⊢','Left',     '', () => RF.UX.Alignment.alignLeft()),
            this._item('⊣','Right',    '', () => RF.UX.Alignment.alignRight()),
            this._item('⊟','H.Center', '', () => RF.UX.Alignment.alignHCenter()),
            this._item('⊤','Top',      '', () => RF.UX.Alignment.alignTop()),
            this._item('⊥','Bottom',   '', () => RF.UX.Alignment.alignBottom()),
            this._item('⊞','V.Center', '', () => RF.UX.Alignment.alignVCenter()),
          ]),
          this._sub('↔','Distribute', [
            this._item('↔','Horizontal', '', () => RF.UX.Alignment.distributeH()),
            this._item('↕','Vertical',   '', () => RF.UX.Alignment.distributeV()),
            this._item('⟺','Equal Space','', () => RF.UX.Alignment.equalSpacing()),
            this._item('↔=','Equal Width','',() => RF.UX.Alignment.equalWidth()),
            this._item('↕=','Equal Height','',()=> RF.UX.Alignment.equalHeight()),
          ]),
          this._item('⊚','Group Objects', '', () => RF.UX.ObjectGroup.group()),
          this._sep(),
        );
      } else {
        items.push(this._sep());
      }

      if (el.grouped) {
        items.push(this._item('◉','Ungroup', '', () => RF.UX.ObjectGroup.ungroupEl(el.id)));
        items.push(this._sep());
      }

      items.push(
        el.locked
          ? this._item('🔓','Unlock',    '', () => { DM.updateElement(el.id,{locked:false}); RF.RP.reconcile(); })
          : this._item('🔒','Lock',      '', () => { DM.updateElement(el.id,{locked:true});  RF.RP.reconcile(); }),
        this._sep(),
        this._item('🎨','Format Object',    '', () => { RF.emit(RF.E.COND_FMT_OPEN, el.id); }),
        this._item('🖌','Format Painter',   '', () => RF.UX.FormatPainter.activate()),
      );

      // Type-specific
      if (el.type==='chart')     items.push(this._item('📊','Edit Chart',     '', () => RF.emit('charts:open',el.id)));
      if (el.type==='table')     items.push(this._item('⊞','Edit Table',      '', () => RF.emit('tables:open',el.id)));
      if (el.type==='subreport') items.push(this._item('🗂','Edit Subreport',  '', () => RF.emit('subreports:open',el.id)));
      if (el.type==='crosstab')  items.push(this._item('⊟','Edit Crosstab',   '', () => RF.emit('crosstab:open',el.id)));
    }

    if (!items.length || (secBody && !el)) {
      // Right-click on empty section
      items.push(
        this._item('⊕','Insert Text Field',  'T', () => this._insertAt('text')),
        this._item('≡','Insert DB Field',    'F', () => this._insertAt('field')),
        this._item('—','Insert Line',        'L', () => this._insertAt('line')),
        this._item('□','Insert Rectangle',   'R', () => this._insertAt('rect')),
        this._item('◉','Insert Barcode',     '',  () => this._insertAt('barcode')),
        this._item('⊞','Insert Crosstab',    '',  () => this._insertAt('crosstab')),
        this._sep(),
        this._item('§','Section Expert',     '',  () => { if(this._targetSecId) RF.emit('section:edit', this._targetSecId); }),
      );
    }

    this._el.append(RF.html(items.join('')));
  },

  _insertAt(type) {
    const sid = this._targetSecId; if(!sid) return;
    const DM = RF.Core.DocumentModel;
    RF.H.snapshot('before-insert');
    const el = DM.createElement(type, sid, 20, 4, {});
    if (el) RF.Classic.Sections.attachNewElement(el);
    this.hide();
  },

  _item(icon, label, kb, fn, danger=false) {
    const id = RF.uid('ctx');
    // Store callback
    RF.UX.ContextMenu._cbs = RF.UX.ContextMenu._cbs || {};
    RF.UX.ContextMenu._cbs[id] = () => { fn(); this.hide(); };
    return `<div class="ctx-item${danger?' danger':''}" onclick="RF.UX.ContextMenu._cbs['${id}']()" onpointerdown="event.stopPropagation()">
      <span class="ctx-icon">${icon}</span><span>${label}</span>${kb?`<span class="ctx-kb">${kb}</span>`:''}
    </div>`;
  },

  _sep() { return '<div class="ctx-sep"></div>'; },

  _sub(icon, label, subitems) {
    return `<div class="ctx-item ctx-sub" onpointerdown="event.stopPropagation()">
      <span class="ctx-icon">${icon}</span><span>${label}</span>
      <div class="ctx-submenu">${subitems.join('')}</div>
    </div>`;
  },

  /**
   * showAt(x, y, items) — programmatic context menu with item array.
   * items: [{label, action, danger, sep}]
   */
  showAt(x, y, items) {
    const el = this._el;
    RF.clear(el);
    items.forEach(item => {
      if (item.sep) {
        const sep = document.createElement('div');
        sep.className = 'ctx-sep';
        el.appendChild(sep);
        return;
      }
      const row = document.createElement('div');
      row.className = 'ctx-item' + (item.danger ? ' danger' : '');
      row.append(RF.html(`<span class="ctx-icon"></span><span>${item.label}</span>`));
      row.addEventListener('pointerdown', e => {
        e.preventDefault();
        this.hide();
        item.action?.();
      });
      el.appendChild(row);
    });
    this.show(x, y);
  },

  show(x, y) {
    const el = this._el;
    el.className = 'show';
    el.style.left = '0'; el.style.top = '0';
    document.body.appendChild(el);
    // Position avoiding screen edges
    const W = window.innerWidth, H = window.innerHeight;
    const mw = el.offsetWidth||200, mh = el.offsetHeight||200;
    el.style.left = Math.min(x, W-mw-8)+'px';
    el.style.top  = Math.min(y, H-mh-8)+'px';
  },

  hide() {
    if (this._el) this._el.className = '';
  },
};


// ── v4: Running Totals Editor ─────────────────────────────────────────────────
