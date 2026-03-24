import RF from '../rf.js';

/**
 * core/document-model.js — RF.Core.DocumentModel
 * Layer   : Core
 * Purpose : Single source of truth for all layout state. All mutations
 *           (add/remove/update elements and sections) must go through here
 *           so history snapshots and layout events remain consistent.
 * Deps    : RF.Classic.Elements (DEFAULTS registry for new-element creation)
 */

RF.Core.DocumentModel = {

  // ── Default blank layout ───────────────────────────────────────────────────
  _blank() {
    return {
      name:        'Untitled Report',
      version:     '3.0',
      pageSize:    'A4',
      orientation: 'portrait',
      pageWidth:   754,
      margins:     { top:15, bottom:15, left:20, right:20 },
      sections: [
        { id:'s-rh',  stype:'rh',  label:'Report Header',  height:70, iterates:null,   groupIndex:0, canGrow:false, canShrink:false, repeatOnNewPage:false, pageBreakBefore:false, bgColor:'transparent' },
        { id:'s-ph',  stype:'ph',  label:'Page Header',    height:36, iterates:null,   groupIndex:0, canGrow:false, canShrink:false, repeatOnNewPage:false, pageBreakBefore:false, bgColor:'transparent' },
        { id:'s-det', stype:'det', label:'Detail',         height:18, iterates:'items',groupIndex:0, canGrow:true,  canShrink:false, repeatOnNewPage:false, pageBreakBefore:false, bgColor:'transparent' },
        { id:'s-pf',  stype:'pf',  label:'Page Footer',    height:30, iterates:null,   groupIndex:0, canGrow:false, canShrink:false, repeatOnNewPage:false, pageBreakBefore:false, bgColor:'transparent' },
        { id:'s-rf',  stype:'rf',  label:'Report Footer',  height:40, iterates:null,   groupIndex:0, canGrow:false, canShrink:false, repeatOnNewPage:false, pageBreakBefore:false, bgColor:'transparent' },
      ],
      elements:   [],
      groups:     [],
      sortBy:     [],
      parameters: [],
      filters:    [],
    };
  },

  // ── State ──────────────────────────────────────────────────────────────────
  layout:       null,
  selectedIds:  new Set(),
  clipboard:    [],
  zoom:         1.0,
  panX:         40,
  panY:         40,
  gridSize:     8,
  snapToGrid:   true,
  snapToElems:  true,
  showGrid:     true,
  showRulers:   true,
  showGuides:   true,
  showDistances:false,
  guides:       [],
  activeTool:   'select',
  isDirty:      false,
  formatPainterStyle: null,  // active format-painter payload

  // ── Field data (for explorer) ──────────────────────────────────────────────
  fieldData: {
    database:  ['items.id','items.name','items.qty','items.unit_price','items.total','items.category','empresa.razon_social'],
    formula:   [],
    parameter: [],
    running:   [],
    sql:       [],
    special:   ['{now()}','{today()}','{uuid()}','[page]','[pageCount]','[reportName]'],
  },

  // ── Init ──────────────────────────────────────────────────────────────────
  init() {
    this.layout = this._blank();
    this._loadDemo();
  },

  _loadDemo() {
    this.layout.name = 'Sales Report Demo';
    this.layout.groups  = [{ field:'items.category', sortDesc:false, label:'Category' }];
    this.layout.sortBy  = [{ field:'items.category', desc:false }, { field:'items.total', desc:true }];
    this.layout.filters = [];
    this.layout.parameters = [
      { name:'startDate', type:'date',   defaultValue:'2026-01-01', prompt:'Start Date' },
      { name:'endDate',   type:'date',   defaultValue:'2026-12-31', prompt:'End Date'   },
      { name:'company',   type:'string', defaultValue:'Acme Corp',  prompt:'Company'    },
    ];
    this.fieldData.parameter = this.layout.parameters.map(p => `param.${p.name}`);
    this.fieldData.formula   = ['{items.qty * items.unit_price}', '{sum(items.total)}'];
    this.fieldData.running   = ['RunTotal_Sales'];

    const E = (id,t,sid,x,y,w,h,extra) => ({
      id, type:t, sectionId:sid, x,y,w,h,
      fontFamily:'Arial', fontSize:9, bold:false, italic:false, underline:false, align:'left',
      color:'#111', bgColor:'transparent', borderWidth:0, borderColor:'#000', borderStyle:'solid',
      zIndex:1, content:'', fieldPath:'', fieldFmt:null, canGrow:false, canShrink:false,
      wordWrap:false, src:'', srcFit:'contain', conditionalStyles:[], suppressIfEmpty:false,
      visibleIf:'', style:'', locked:false, groupVisible:false,
      columns:[], chartType:'bar', layoutPath:'', dataPath:'',
      ...extra
    });

    this.layout.sections[0].height = 70;
    this.layout.sections[1].height = 36;
    this.layout.sections[2].height = 18;
    this.layout.sections[3].height = 30;
    this.layout.sections[4].height = 44;

    this.layout.elements = [
      // Report Header
      E('rh-title','text','s-rh',20,8,460,28,{content:'Sales Report',fontSize:22,bold:true,color:'#1A3C5E',align:'left'}),
      E('rh-sub',  'text','s-rh',20,42,360,16,{content:'Quarterly Summary — param.company',fontSize:9,italic:true,color:'#6A7A9A'}),
      E('rh-date', 'text','s-rh',560,42,174,14,{content:'{now()}',fontSize:8,align:'right',color:'#6A7A9A'}),
      E('rh-line', 'line','s-rh',20,64,714,2,{color:'#1A3C5E',lineWidth:2,lineDir:'h'}),
      // Page Header
      E('ph-bg','rect','s-ph',20,2,714,26,{bgColor:'#1A3C5E',borderWidth:0}),
      E('ph-name', 'text','s-ph',24,5,200,16,{content:'Product',bold:true,color:'#FFF',bgColor:'transparent',borderWidth:0,fontSize:9}),
      E('ph-cat',  'text','s-ph',228,5,130,16,{content:'Category',bold:true,color:'#FFF',bgColor:'transparent',borderWidth:0,fontSize:9,align:'center'}),
      E('ph-qty',  'text','s-ph',362,5,80,16, {content:'Qty',bold:true,color:'#FFF',bgColor:'transparent',borderWidth:0,fontSize:9,align:'right'}),
      E('ph-price','text','s-ph',446,5,100,16,{content:'Unit Price',bold:true,color:'#FFF',bgColor:'transparent',borderWidth:0,fontSize:9,align:'right'}),
      E('ph-total','text','s-ph',550,5,100,16,{content:'Total',bold:true,color:'#FFF',bgColor:'transparent',borderWidth:0,fontSize:9,align:'right'}),
      // Detail
      E('d-name',  'field','s-det',24,2,200,14,{fieldPath:'items.name',color:'#222'}),
      E('d-cat',   'field','s-det',228,2,130,14,{fieldPath:'items.category',align:'center',color:'#445'}),
      E('d-qty',   'field','s-det',362,2,80,14, {fieldPath:'items.qty',align:'right',color:'#222'}),
      E('d-price', 'field','s-det',446,2,100,14,{fieldPath:'items.unit_price',fieldFmt:'currency',align:'right',color:'#222'}),
      E('d-total', 'field','s-det',550,2,100,14,{fieldPath:'items.total',fieldFmt:'currency',align:'right',color:'#1A3C5E',bold:true,
        conditionalStyles:[{field:'items.total',op:'>',value:'100',color:'#14532D',bgColor:'transparent',bold:true}]}),
      // Page Footer
      E('pf-line','line','s-pf',20,4,714,1,{color:'#CBD5E0',lineWidth:1,lineDir:'h'}),
      E('pf-conf','text','s-pf',20,8,360,14,{content:'CONFIDENTIAL — Internal Use Only',fontSize:8,italic:true,color:'#8A9ABF'}),
      E('pf-page','text','s-pf',614,8,120,14,{content:'Page [page] of [pageCount]',fontSize:8,align:'right',color:'#8A9ABF'}),
      // Report Footer
      E('rf-line', 'line','s-rf',20,2,714,2,{color:'#1A3C5E',lineWidth:2,lineDir:'h'}),
      E('rf-lbl',  'text','s-rf',20,10,200,18,{content:'Grand Total:',fontSize:11,bold:true,color:'#1A3C5E'}),
      E('rf-total','text','s-rf',550,10,100,18,{content:'$24,599.00',fontSize:11,bold:true,align:'right',color:'#1A3C5E'}),
      E('rf-note', 'text','s-rf',20,32,400,12,{content:'Generated by ReportForge Enterprise v3.0',fontSize:8,color:'#8A9ABF'}),
    ];
  },

  // ── Accessors ──────────────────────────────────────────────────────────────
  get selectedElements() { return this.layout.elements.filter(e => this.selectedIds.has(e.id)); },
  getElementById(id)     { return this.layout.elements.find(e => e.id === id) || null; },
  getSectionById(id)     { return this.layout.sections.find(s => s.id === id) || null; },

  // ── Mutations ──────────────────────────────────────────────────────────────
  setLayout(layout) {
    this.layout     = layout;
    this.selectedIds = new Set();
    this.isDirty    = false;
    RF.RP?.invalidate('elements'); RF.emit(RF.E.LAYOUT_CHANGED);
    RF.emit(RF.E.SEL_CHANGED);
  },

  createElement(type, sectionId, x, y, extra={}) {
    const sec = this.getSectionById(sectionId);
    if (!sec) return null;
    const defaults = RF.Classic.Elements.defaults(type);
    if (!defaults) return null;
    const el = {
      id: RF.uid('el'), type, sectionId,
      x:Math.round(x), y:Math.round(y),
      locked:false, conditionalStyles:[], visibleIf:'', style:'', zIndex:0,
      columns:[], chartType:'bar', layoutPath:'', dataPath:'',
      ...RF.clone(defaults), ...extra,
    };
    this.layout.elements.push(el);
    this.isDirty = true;
    RF.emit(RF.E.ELEMENT_CREATED, el);
    RF.RP?.invalidate('elements'); RF.emit(RF.E.LAYOUT_CHANGED);
    return el;
  },

  updateElement(id, props) {
    const el = this.getElementById(id);
    if (!el) return;
    Object.assign(el, props);
    this.isDirty = true;
    RF.emit(RF.E.ELEMENT_MUTATED, { id, props });
    RF.emit(RF.E.INSPECTOR_REFRESH);
  },

  updateSection(id, props) {
    const sec = this.getSectionById(id);
    if (!sec) return;
    Object.assign(sec, props);
    this.isDirty = true;
    RF.emit(RF.E.SECTION_MUTATED, { id, props });
  },

  deleteElements(ids) {
    const idSet = new Set(ids);
    this.layout.elements = this.layout.elements.filter(e => !idSet.has(e.id));
    ids.forEach(id => this.selectedIds.delete(id));
    this.isDirty = true;
    RF.emit(RF.E.ELEMENT_DELETED, ids);
    RF.emit(RF.E.SEL_CHANGED);
    RF.RP?.invalidate('elements'); RF.emit(RF.E.LAYOUT_CHANGED);
  },

  moveElements(deltas) {
    // deltas: [{id, dx, dy}]
    deltas.forEach(({id, dx, dy}) => {
      const el = this.getElementById(id);
      const sec = el && this.getSectionById(el.sectionId);
      if (!el || !sec) return;
      el.x = RF.clamp(Math.round(el.x+dx), 0, this.layout.pageWidth - el.w);
      el.y = RF.clamp(Math.round(el.y+dy), 0, sec.height - el.h);
    });
    this.isDirty = true;
    RF.emit(RF.E.INSPECTOR_REFRESH);
  },

  resizeElement(id, rect) {
    const el = this.getElementById(id);
    if (!el) return;
    const MIN = 4;
    el.x = Math.round(rect.x);
    el.y = Math.round(rect.y);
    el.w = Math.max(MIN, Math.round(rect.w));
    el.h = Math.max(MIN, Math.round(rect.h));
    this.isDirty = true;
    RF.emit(RF.E.INSPECTOR_REFRESH);
  },

  duplicateElements(ids) {
    const newIds = [];
    ids.forEach(id => {
      const src = this.getElementById(id);
      if (!src) return;
      const el = RF.clone(src);
      el.id = RF.uid('el');
      el.x += 16; el.y += 16;
      this.layout.elements.push(el);
      newIds.push(el.id);
    });
    this.selectedIds = new Set(newIds);
    this.isDirty = true;
    RF.RP?.invalidate('elements'); RF.emit(RF.E.LAYOUT_CHANGED);
    RF.emit(RF.E.SEL_CHANGED);
    return newIds;
  },

  reorderElement(id, dir) {
    // dir: 'front' | 'back' | 'forward' | 'backward'
    const el = this.getElementById(id);
    if (!el) return;
    const siblings = this.layout.elements.filter(e => e.sectionId===el.sectionId).sort((a,b)=>(a.zIndex||0)-(b.zIndex||0));
    const idx = siblings.indexOf(el);
    if (dir==='front')    { siblings.forEach((e,i) => e.zIndex=i); el.zIndex = siblings.length; }
    else if (dir==='back') { siblings.forEach((e,i) => e.zIndex=i+1); el.zIndex = 0; }
    else if (dir==='forward'  && idx < siblings.length-1) { [siblings[idx].zIndex, siblings[idx+1].zIndex] = [siblings[idx+1].zIndex, siblings[idx].zIndex]; }
    else if (dir==='backward' && idx > 0)                 { [siblings[idx].zIndex, siblings[idx-1].zIndex] = [siblings[idx-1].zIndex, siblings[idx].zIndex]; }
    this.isDirty = true;
    RF.RP?.invalidate('elements'); RF.emit(RF.E.LAYOUT_CHANGED);
  },
};


// ═══════════════════════════════════════════════════════════════════════════════
// RF.Core.HistoryEngine — Snapshot-based undo/redo, 100 levels.
// ═══════════════════════════════════════════════════════════════════════════════
