import RF from '../rf.js';

/**
 * ux/panel-tabs.js — RF.UX.PanelTabs
 * Layer   : UX / v4
 * Purpose : Renders tab bars for the left panel (Field / Report / Repository
 *           explorers) and the right panel (Inspector / Object Explorer).
 *           Switches visible pane on click.
 * Deps    : RF.Modules.ObjectExplorer, RF.Modules.ReportExplorer,
 *           RF.Modules.RepositoryExplorer
 */

RF.UX.PanelTabs = {
  _activeLeft: 'field',
  _activeRight: 'props',

  init() {
    // Build left panel tab strip
    const fe = document.getElementById('field-explorer');
    if (fe && !fe.dataset.tabbed) {
      fe.dataset.tabbed = '1';
      const original = fe.innerHTML;

      const tabbar = document.createElement('div');
      tabbar.className = 'panel-tabbar';
      tabbar.append(RF.html(`
        <div class="panel-tab active"  data-ltab="field"  onclick="RF.UX.PanelTabs.switchLeft('field',this)">Fields</div>
        <div class="panel-tab"         data-ltab="report" onclick="RF.UX.PanelTabs.switchLeft('report',this)">Report</div>
        <div class="panel-tab"         data-ltab="repo"   onclick="RF.UX.PanelTabs.switchLeft('repo',this)">Repository</div>
      `));

      const wrap = document.createElement('div');
      wrap.className = 'u-panel-tab-wrap';

      const content = document.createElement('div');
      content.id = 'field-explorer-inner';
      content.className = 'u-panel-tab-content';
      if(original) content.append(RF.html(original));

      const reportContent = document.createElement('div');
      reportContent.id = 'report-explorer-content';
      reportContent.className = 'u-panel-tab-content u-hidden';

      RF.clear(fe);
      wrap.appendChild(tabbar);
      wrap.appendChild(content);
      wrap.appendChild(reportContent);
      fe.appendChild(wrap);

      RF.Modules.ReportExplorer._visible = false;
    }

    // Right panel tabs
    const pi = document.getElementById('property-inspector');
    if (pi && !pi.dataset.tabbed) {
      pi.dataset.tabbed = '1';
      const original = pi.innerHTML;

      const tabbar = document.createElement('div');
      tabbar.className = 'panel-tabbar';
      tabbar.append(RF.html(`
        <div class="panel-tab active" data-rtab="props" onclick="RF.UX.PanelTabs.switchRight('props',this)">Properties</div>
        <div class="panel-tab"        data-rtab="objexp" onclick="RF.UX.PanelTabs.switchRight('objexp',this)">Objects</div>
      `));

      const wrap = document.createElement('div');
      wrap.className = 'u-panel-tab-wrap';

      const content = document.createElement('div');
      content.id = 'props-panel-inner';
      content.className = 'u-panel-tab-content';
      if(original) content.append(RF.html(original));

      const objContent = document.createElement('div');
      objContent.id = 'obj-panel-inner';
      objContent.className = 'u-panel-tab-content u-hidden';

      RF.clear(pi);
      wrap.appendChild(tabbar);
      wrap.appendChild(content);
      wrap.appendChild(objContent);
      pi.appendChild(wrap);
    }

    // Wire events
    RF.on(RF.E.SEL_CHANGED,    () => this._syncObjPanel());
    RF.on(RF.E.LAYOUT_CHANGED, () => this._syncObjPanel());
  },

  switchLeft(tab, el) {
    this._activeLeft = tab;
    document.querySelectorAll('[data-ltab]').forEach(t=>t.classList.toggle('active',t===el));

    const fe = document.getElementById('field-explorer-inner');
    const re = document.getElementById('report-explorer-content');
    if (!fe||!re) return;

    if (tab==='field') {
      fe.classList.remove('u-hidden'); re.classList.add('u-hidden');
      RF.Modules.ReportExplorer._visible=false;
    } else if (tab==='report') {
      fe.classList.add('u-hidden'); re.classList.remove('u-hidden');
      RF.Modules.ReportExplorer._visible=true;
      RF.Modules.ReportExplorer.render();
    } else if (tab==='repo') {
      fe.classList.add('u-hidden'); re.classList.remove('u-hidden');
      RF.Modules.ReportExplorer._visible=false;
      RF.clear(re);
      // Inline repo in the panel
      const repoDiv=document.createElement('div');
      repoDiv.style.cssText='display:flex;flex-direction:column;height:100%';
      repoDiv.append(RF.html(RF.Modules.RepositoryExplorer._build()));
      re.appendChild(repoDiv);
    }
  },

  switchRight(tab, el) {
    this._activeRight = tab;
    document.querySelectorAll('[data-rtab]').forEach(t=>t.classList.toggle('active',t===el));

    const pp = document.getElementById('props-panel-inner');
    const op = document.getElementById('obj-panel-inner');
    if (!pp||!op) return;

    if (tab==='props') {
      pp.classList.remove('u-hidden'); op.classList.add('u-hidden');
    } else {
      pp.classList.add('u-hidden'); op.classList.remove('u-hidden');
      this._syncObjPanel();
    }
  },

  _syncObjPanel() {
    const op = document.getElementById('obj-panel-inner');
    if (!op || op.classList.contains('u-hidden')) return;
    RF.Modules.ObjectExplorer._el = op;
    RF.Modules.ObjectExplorer._visible = true;
    RF.Modules.ObjectExplorer.render();
  },
};

// Panel tab CSS (added dynamically)
