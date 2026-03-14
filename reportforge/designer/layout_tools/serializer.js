// ─────────────────────────────────────────────────────────────────────────────
// layout_tools/serializer.js  –  Save / Load  .rfd.json
// Produces JSON exactly matching the ReportForge engine contract.
// ─────────────────────────────────────────────────────────────────────────────
RF.Serializer = {

  /** Export current layout as a JSON string */
  toJSON() {
    const s   = RF.AppState;
    const out = RF.clone(s.layout);

    // Ensure all required fields exist
    out.version   = '2.0';
    out.pageSize  = out.pageSize  || 'A4';
    out.pageWidth = out.pageWidth || 754;
    out.orientation = out.orientation || 'portrait';
    out.margins   = out.margins   || { top:15, bottom:15, left:20, right:20 };

    // Strip designer-only _meta fields
    out.elements = out.elements.map(el => {
      const clean = { ...el };
      delete clean._hover;
      delete clean._dragOffX;
      delete clean._dragOffY;
      return clean;
    });

    return JSON.stringify(out, null, 2);
  },

  /** Import a JSON string / parsed object into AppState */
  fromJSON(raw) {
    let layout;
    try {
      layout = typeof raw === 'string' ? JSON.parse(raw) : RF.clone(raw);
    } catch(e) {
      alert('Invalid JSON: ' + e.message);
      return false;
    }

    // Minimal validation
    if (!layout.sections || !Array.isArray(layout.sections)) {
      alert('Invalid layout: missing sections array');
      return false;
    }
    if (!layout.elements) layout.elements = [];

    RF.History.snapshot('before-load');
    RF.AppState.layout      = layout;
    RF.AppState.selectedIds = new Set();
    RF.AppState.isDirty     = false;
    RF.EventBus.emit('layout:changed');
    RF.EventBus.emit('selection:changed');
    RF.History.snapshot('load');
    return true;
  },

  /** Download JSON file */
  download() {
    const name = (RF.AppState.layout.name || 'report').replace(/\s+/g,'_');
    RF.Utils.downloadText(`${name}.rfd.json`, this.toJSON());
  },

  /** Open file picker and load JSON */
  openFile() {
    const inp = document.createElement('input');
    inp.type   = 'file';
    inp.accept = '.json,.rfd.json';
    inp.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        if (RF.Serializer.fromJSON(ev.target.result)) {
          RF.EventBus.emit('status', `Loaded: ${file.name}`);
        }
      };
      reader.readAsText(file);
    };
    inp.click();
  },

  /** Create a new blank layout */
  newLayout() {
    if (RF.AppState.isDirty) {
      if (!confirm('Discard unsaved changes?')) return;
    }
    RF.AppState.layout = {
      name: 'Untitled Report',
      pageSize: 'A4',
      orientation: 'portrait',
      pageWidth: 754,
      margins: { top:15, bottom:15, left:20, right:20 },
      sections: [
        { id:'s-rh',  stype:'rh',  label:'Report Header',  height:60 },
        { id:'s-ph',  stype:'ph',  label:'Page Header',    height:40 },
        { id:'s-det', stype:'det', label:'Detail',         height:20 },
        { id:'s-pf',  stype:'pf',  label:'Page Footer',    height:30 },
        { id:'s-rf',  stype:'rf',  label:'Report Footer',  height:30 },
      ],
      elements: [],
      groups: [], sortBy: [], parameters: [],
    };
    RF.AppState.selectedIds = new Set();
    RF.AppState.isDirty     = false;
    RF.History.clear();
    RF.EventBus.emit('layout:changed');
    RF.EventBus.emit('selection:changed');
    RF.EventBus.emit('status', 'New layout created');
  },
};
