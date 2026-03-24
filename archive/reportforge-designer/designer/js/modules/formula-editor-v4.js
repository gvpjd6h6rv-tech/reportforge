import RF from '../rf.js';

/**
 * modules/formula-editor-v4.js — RF.Modules.FormulaEditorV4
 * Layer   : Modules (v4)
 * Purpose : Patches RF.Modules.FormulaEditor with v4 enhancements:
 *           syntax highlighting, bracket matching, and inline autocomplete.
 * Deps    : RF.Modules.FormulaEditor
 */

RF.Modules.FormulaEditorV4 = {

  FUNCTIONS: [
    'Sum','Avg','Count','Max','Min','Round','Ceil','Floor',
    'If','IIf','Not','And','Or','Contains','StartsWith','EndsWith',
    'Len','SubStr','Trim','Upper','Lower','Replace','Split',
    'ToDate','DateAdd','DateDiff','Year','Month','Day','Hour','Minute',
    'ToString','ToNumber','IsNull','IsEmpty','Coalesce','In',
    'RunningTotal','Previous','Next','PageNumber','PageCount','ReportName',
    'GrandTotal','SubTotal','PercentOfTotal','PercentOfSum',
  ],

  KEYWORDS: ['if','then','else','and','or','not','in','true','false','null'],

  // Inject syntax highlighting into the formula editor
  patchFormulaEditor() {
    const _origOpen = RF.Modules.FormulaEditor.open.bind(RF.Modules.FormulaEditor);
    RF.Modules.FormulaEditor.open = (existing=null) => {
      _origOpen(existing);
      // Replace textarea with highlighted editor
      setTimeout(() => {
        const ta = document.getElementById('fw-expr');
        if (!ta || ta.dataset.v4) return;
        ta.dataset.v4 = '1';
        this._upgradeTextarea(ta);
      }, 30);
    };
  },

  _upgradeTextarea(ta) {
    const parent = ta.parentElement;
    if (!parent) return;

    // Create wrapper
    const wrap = document.createElement('div');
    wrap.className = 'fw-wrap';
    const highlight = document.createElement('div');
    highlight.className = 'fw-highlight';
    highlight.id = 'fw-hl';

    // Re-style textarea
    ta.className = 'fw-ta';
    ta.style.cssText = '';
    ta.rows = null;

    // Insert
    parent.replaceChild(wrap, ta);
    wrap.appendChild(highlight);
    wrap.appendChild(ta);

    // Autocomplete dropdown
    const ac = document.createElement('div');
    ac.className = 'fw-autocomplete';
    ac.id = 'fw-ac';
    wrap.appendChild(ac);

    // Wire events
    ta.addEventListener('input',   () => { this._highlight(ta, highlight); this._autocomplete(ta, ac); RF.Modules.FormulaEditor._validate(); });
    ta.addEventListener('keydown', e  => this._handleKey(e, ta, ac));
    ta.addEventListener('scroll',  () => { highlight.scrollTop = ta.scrollTop; });
    ta.addEventListener('blur',    () => setTimeout(()=>ac.classList.remove('show'), 150));

    // Initial highlight
    this._highlight(ta, highlight);
  },

  _highlight(ta, hl) {
    let src = ta.value || '';
    // Escape HTML first
    const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    src = esc(src);
    // Fields: {name} → accent
    src = src.replace(/\{([^}]+)\}/g, (m,n) => `<span class="hl-field">{${n}}</span>`);
    // Params: [name]
    src = src.replace(/\[([^\]]+)\]/g, (m,n) => `<span class="hl-param">[${n}]</span>`);
    // Strings
    src = src.replace(/"([^"]*)"/g, (m,s) => `<span class="hl-str">"${s}"</span>`);
    src = src.replace(/'([^']*)'/g, (m,s) => `<span class="hl-str">'${s}'</span>`);
    // Numbers
    src = src.replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-num">$1</span>');
    // Functions (case-insensitive)
    const fnPat = new RegExp(`\\b(${this.FUNCTIONS.join('|')})(?=\\s*\\()`, 'gi');
    src = src.replace(fnPat, '<span class="hl-fn">$1</span>');
    // Keywords
    const kwPat = new RegExp(`\\b(${this.KEYWORDS.join('|')})\\b`, 'gi');
    src = src.replace(kwPat, '<span class="hl-kw">$1</span>');
    // Operators
    src = src.replace(/([+\-*\/%=!<>&|?:]+)/g, (m,o) => {
      if (o.startsWith('<span') || o.startsWith('</span')) return m;
      return `<span class="hl-op">${o}</span>`;
    });
    hl.append(RF.html(src+'<br>'));
  },

  _autocomplete(ta, ac) {
    const val = ta.value;
    const pos = ta.selectionStart;
    // Find current word
    const before = val.slice(0, pos);
    const wordMatch = before.match(/[\w.]+$/);
    const word = wordMatch ? wordMatch[0] : '';
    if (word.length < 2) { ac.classList.remove('show'); return; }

    const DM = RF.Core.DocumentModel;
    const fields = [...DM.fieldData.database, ...DM.fieldData.formula,
                    ...DM.fieldData.parameter, ...DM.fieldData.special];

    const matches = [];
    // Functions
    this.FUNCTIONS.filter(f => f.toLowerCase().startsWith(word.toLowerCase()))
      .slice(0,6).forEach(f => matches.push({label:f+'(',type:'fn'}));
    // Fields
    fields.filter(f => f.includes(word)).slice(0,6)
      .forEach(f => matches.push({label:f, type:'field'}));

    if (!matches.length) { ac.classList.remove('show'); return; }

    RF.clear(ac); ac.append(RF.html(matches.map((m,i) =>
      `<div class="fw-ac-item${i===0?' active':''}" data-val="${m.label}" data-type="${m.type}">
        <span>${m.label.replace(new RegExp(word,'i'), `<span class="fw-ac-match">$&</span>`)}</span>
        <span class="fw-ac-type">${m.type}</span>
      </div>`
    ).join('')));

    ac.querySelectorAll('.fw-ac-item').forEach(item => {
      item.addEventListener('pointerdown', e => {
        e.preventDefault();
        this._applyAutocomplete(ta, word, item.dataset.val);
        ac.classList.remove('show');
      });
    });

    // Position dropdown
    ac.classList.add('show');
  },

  _handleKey(e, ta, ac) {
    if (!ac.classList.contains('show')) return;
    const items = ac.querySelectorAll('.fw-ac-item');
    const active = ac.querySelector('.fw-ac-item.active');
    let idx = [...items].indexOf(active);

    if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(idx+1,items.length-1)]?.classList.add('active'); active?.classList.remove('active'); }
    else if (e.key === 'ArrowUp')  { e.preventDefault(); items[Math.max(idx-1,0)]?.classList.add('active'); active?.classList.remove('active'); }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const val = ac.querySelector('.fw-ac-item.active')?.dataset.val;
      if (val) {
        const before = ta.value.slice(0, ta.selectionStart);
        const wm = before.match(/[\w.]+$/);
        this._applyAutocomplete(ta, wm?wm[0]:'', val);
      }
      ac.classList.remove('show');
    }
    else if (e.key === 'Escape') { ac.classList.remove('show'); }
  },

  _applyAutocomplete(ta, word, completion) {
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos - word.length);
    const after  = ta.value.slice(pos);
    ta.value = before + completion + after;
    ta.selectionStart = ta.selectionEnd = (before + completion).length;
    ta.dispatchEvent(new Event('input'));
    ta.focus();
  },
};


// ── v4: Object Grouping ────────────────────────────────────────────────────────
