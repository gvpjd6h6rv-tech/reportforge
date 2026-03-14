<template>
  <div class="wb-root">
    <!-- ─── Title bar ─── -->
    <div class="wb-titlebar">
      <div class="wb-titlebar-left">
        <span class="wb-app-icon">📊</span>
        <span class="wb-app-name">ReportForge</span>
        <span class="wb-app-sep">—</span>
        <span class="wb-app-sub">Crystal RPT Workbench</span>
      </div>
      <div class="wb-titlebar-menu">
        <span v-for="m in menus" :key="m" class="wb-menu-item" @click="handleMenu(m)">{{ m }}</span>
      </div>
      <div class="wb-titlebar-right">
        <span class="wb-title-badge">ES Modules</span>
        <span class="wb-title-badge green">405/405 ✓</span>
      </div>
    </div>

    <!-- ─── Main body ─── -->
    <div class="wb-body">

      <!-- Activity bar -->
      <div class="wb-activity-bar">
        <button
          v-for="act in activities"
          :key="act.id"
          class="wb-act-btn"
          :class="{ active: activeActivity === act.id }"
          :title="act.label"
          @click="toggleActivity(act.id)"
        >
          <span class="wb-act-icon">{{ act.icon }}</span>
          <span v-if="act.badge" class="wb-act-badge">{{ act.badge }}</span>
        </button>
        <div class="wb-act-spacer" />
        <button class="wb-act-btn" title="Settings" @click="showSettings = !showSettings">⚙</button>
        <button class="wb-act-btn" title="Back to Docs" @click="goToDocs">←</button>
      </div>

      <!-- Side panel -->
      <div class="wb-side-panel" v-if="activeActivity" :style="{ width: sidePanelW + 'px' }">
        <WorkbenchTree
          v-if="activeActivity === 'explorer'"
          :files="rptFiles"
          :activeId="activeRpt?.id"
          @open="openRpt"
          @select-section="onSelectSection"
          @select-formula="onSelectFormula"
          @select-param="onSelectParam"
        />
        <div v-else-if="activeActivity === 'search'" class="wb-search-panel">
          <div class="wb-panel-hdr"><span class="wb-panel-title">SEARCH</span></div>
          <div class="wb-search-box">
            <input
              v-model="searchQuery"
              class="wb-search-input"
              placeholder="Search RPT elements…"
              @input="doSearch"
            />
          </div>
          <div class="wb-search-results">
            <div v-for="r in searchResults" :key="r.id" class="wb-search-result" @click="openRptById(r.rptId)">
              <span class="wb-sr-icon">{{ r.icon }}</span>
              <div class="wb-sr-content">
                <div class="wb-sr-label">{{ r.label }}</div>
                <div class="wb-sr-file">{{ r.file }}</div>
              </div>
              <span class="wb-sr-type">{{ r.type }}</span>
            </div>
            <div v-if="searchQuery && !searchResults.length" class="wb-search-empty">No results</div>
          </div>
        </div>
        <div v-else-if="activeActivity === 'fields'" class="wb-fields-panel">
          <div class="wb-panel-hdr"><span class="wb-panel-title">FIELD REFERENCE</span></div>
          <div class="wb-field-list">
            <div v-for="f in allFields" :key="f.id" class="wb-field-row">
              <span class="wb-field-icon">{{ f.icon }}</span>
              <span class="wb-field-name">{{ f.path }}</span>
              <span class="wb-field-kind">{{ f.kind }}</span>
            </div>
          </div>
        </div>
        <div v-else-if="activeActivity === 'connections'" class="wb-conn-panel">
          <div class="wb-panel-hdr"><span class="wb-panel-title">CONNECTIONS</span></div>
          <div v-for="conn in connections" :key="conn.id" class="wb-conn-card">
            <div class="wb-conn-hdr">
              <span class="wb-conn-icon">🔌</span>
              <span class="wb-conn-name">{{ conn.name }}</span>
              <span class="wb-conn-status" :class="conn.status">{{ conn.status }}</span>
            </div>
            <div class="wb-conn-detail">Driver: <span>{{ conn.driver }}</span></div>
            <div class="wb-conn-detail">DB: <span>{{ conn.db }}</span></div>
            <div class="wb-conn-detail">Tables: <span>{{ conn.tables }}</span></div>
          </div>
        </div>
      </div>

      <!-- Resize handle -->
      <div v-if="activeActivity" class="wb-resize-handle" @mousedown="startResize" />

      <!-- Editor area -->
      <div class="wb-editor">
        <!-- Tabs -->
        <WorkbenchTabs
          :tabs="openTabs"
          :activeId="activeRpt?.id"
          @activate="activateTab"
          @close="closeTab"
        />

        <!-- Canvas + Inspector split -->
        <div class="wb-editor-body">
          <!-- Canvas -->
          <WorkbenchCanvas
            :rpt="activeRpt"
            :activeSec="activeSec"
            :selectedEl="selectedElId"
            @select-element="onSelectElement"
            @select-section="onSelectSection"
            @deselect="onDeselect"
          />

          <!-- Inspector -->
          <div class="wb-inspector-pane" :style="{ width: inspectorW + 'px' }">
            <WorkbenchInspector :selection="selection" />
          </div>
        </div>
      </div>
    </div>

    <!-- ─── Console ─── -->
    <div class="wb-console-pane" :style="{ height: consoleH + 'px' }">
      <WorkbenchConsole
        :log="consoleLog"
        :problems="problems"
        @toggle-collapse="toggleConsole"
      />
    </div>

    <!-- ─── Status bar ─── -->
    <div class="wb-statusbar">
      <div class="wb-status-left">
        <span class="wb-status-item source-ctrl">⎇ main</span>
        <span v-if="activeRpt" class="wb-status-item">📊 {{ activeRpt.name }}</span>
        <span v-if="problems.length" class="wb-status-item warn">⚠ {{ problems.length }}</span>
        <span v-else class="wb-status-item ok">✓ No problems</span>
      </div>
      <div class="wb-status-right">
        <span v-if="selection?.type === 'element'" class="wb-status-item">
          {{ selection.data.type }} · {{ selection.data.w }}×{{ selection.data.h }}px
        </span>
        <span class="wb-status-item">ReportForge v2.0</span>
        <span class="wb-status-item">UTF-8</span>
        <span class="wb-status-item">RPT</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import WorkbenchTree      from './WorkbenchTree.vue'
import WorkbenchTabs      from './WorkbenchTabs.vue'
import WorkbenchCanvas    from './WorkbenchCanvas.vue'
import WorkbenchInspector from './WorkbenchInspector.vue'
import WorkbenchConsole   from './WorkbenchConsole.vue'
import { RPT_FILES, PARSE_LOG, generateParseLog } from './rptData.js'

// ── Layout state ──────────────────────────────────────────────
const sidePanelW = ref(240)
const inspectorW = ref(220)
const consoleH   = ref(160)
const showSettings = ref(false)

// ── Activity bar ──────────────────────────────────────────────
const activeActivity = ref('explorer')
const activities = [
  { id: 'explorer',    icon: '📁', label: 'Explorer' },
  { id: 'search',      icon: '🔍', label: 'Search' },
  { id: 'fields',      icon: '📋', label: 'Field Reference' },
  { id: 'connections', icon: '🔌', label: 'Connections', badge: '2' },
]

function toggleActivity(id) {
  activeActivity.value = activeActivity.value === id ? null : id
}

// ── Tabs / RPT files ──────────────────────────────────────────
const rptFiles  = ref(RPT_FILES)
const openTabs  = ref([])
const activeRpt = ref(null)

function openRpt(rpt) {
  if (!openTabs.value.find(t => t.id === rpt.id)) {
    openTabs.value.push({ id: rpt.id, name: rpt.name, icon: rpt.icon, isSubreport: rpt.isSubreport })
    addLog(generateParseLog(rpt))
  }
  activateTab(rpt.id)
}

function openRptById(id) {
  const rpt = rptFiles.value.find(r => r.id === id)
  if (rpt) openRpt(rpt)
}

function activateTab(id) {
  activeRpt.value = rptFiles.value.find(r => r.id === id) || null
  onDeselect()
}

function closeTab(id) {
  openTabs.value = openTabs.value.filter(t => t.id !== id)
  if (activeRpt.value?.id === id) {
    activeRpt.value = openTabs.value.length
      ? rptFiles.value.find(r => r.id === openTabs.value[openTabs.value.length-1].id)
      : null
  }
}

// ── Selection ─────────────────────────────────────────────────
const selection   = ref(null)
const activeSec   = ref(null)
const selectedElId = ref(null)

function onSelectElement({ element, section }) {
  selectedElId.value = element.id
  activeSec.value    = section.id
  selection.value    = { type: 'element', data: element, section }
}

function onSelectSection({ rpt, section }) {
  selectedElId.value = null
  activeSec.value    = section.id
  selection.value    = { type: 'section', data: section }
  if (rpt && activeRpt.value?.id !== rpt.id) openRpt(rpt)
}

function onSelectFormula({ rpt, formula }) {
  selection.value    = { type: 'formula', data: formula }
  selectedElId.value = null
  if (activeRpt.value?.id !== rpt.id) openRpt(rpt)
}

function onSelectParam({ rpt, param }) {
  selection.value    = { type: 'param', data: param }
  selectedElId.value = null
  if (activeRpt.value?.id !== rpt.id) openRpt(rpt)
}

function onDeselect() {
  selection.value    = null
  activeSec.value    = null
  selectedElId.value = null
}

// ── Console / log ─────────────────────────────────────────────
const consoleLog = ref([...PARSE_LOG])

function addLog(lines) {
  consoleLog.value.push(...lines)
}

const problems = computed(() => {
  const p = []
  for (const rpt of openTabs.value.map(t => rptFiles.value.find(r => r.id === t.id)).filter(Boolean)) {
    if (rpt.formulas.some(f => f.expr.includes('PrevTotal') || f.expr.includes('PrevRevenue'))) {
      p.push({ level: 'warn', file: rpt.name, msg: 'Formula references previous-period field — verify data source availability' })
    }
    if (rpt.sections.some(s => s.elements.some(e => e.type === 'subreport'))) {
      p.push({ level: 'warn', file: rpt.name, msg: 'Subreport references require linked parameter configuration' })
    }
  }
  return p
})

function toggleConsole() {
  consoleH.value = consoleH.value > 50 ? 26 : 160
}

// ── Resize ────────────────────────────────────────────────────
let _resizing = false
function startResize(e) {
  _resizing = true
  const startX = e.clientX, startW = sidePanelW.value
  const onMove = (ev) => { if (_resizing) sidePanelW.value = Math.max(160, Math.min(400, startW + ev.clientX - startX)) }
  const onUp   = () => { _resizing = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// ── Menu ──────────────────────────────────────────────────────
const menus = ['File', 'Edit', 'View', 'Report', 'Tools', 'Help']
function handleMenu(m) {
  addLog([{ time: nowTime(), level: 'debug', msg: `Menu: ${m}` }])
}
function nowTime() {
  const d = new Date()
  return `${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}`
}

function goToDocs() {
  if (typeof window !== 'undefined') window.location.href = '/'
}

// ── Search ────────────────────────────────────────────────────
const searchQuery   = ref('')
const searchResults = ref([])

function doSearch() {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) { searchResults.value = []; return }
  const results = []
  for (const rpt of rptFiles.value) {
    for (const sec of rpt.sections) {
      for (const el of sec.elements) {
        if (el.label?.toLowerCase().includes(q) || el.content?.toLowerCase().includes(q) || el.fieldPath?.toLowerCase().includes(q)) {
          results.push({ id: rpt.id+':'+el.id, rptId: rpt.id, icon: rpt.icon, label: el.label, file: rpt.name, type: el.type })
        }
      }
    }
    for (const f of rpt.formulas) {
      if (f.name.toLowerCase().includes(q) || f.expr.toLowerCase().includes(q)) {
        results.push({ id: rpt.id+':'+f.id, rptId: rpt.id, icon: '𝑓', label: '@'+f.name, file: rpt.name, type: 'formula' })
      }
    }
  }
  searchResults.value = results.slice(0, 20)
}

// ── Field reference ───────────────────────────────────────────
const allFields = [
  { id: 'f1',  path: 'Sales.CustName',    kind: 'String',  icon: '🔤' },
  { id: 'f2',  path: 'Sales.RepName',     kind: 'String',  icon: '🔤' },
  { id: 'f3',  path: 'Sales.Region',      kind: 'String',  icon: '🔤' },
  { id: 'f4',  path: 'Sales.Qty',         kind: 'Number',  icon: '🔢' },
  { id: 'f5',  path: 'Sales.Total',       kind: 'Currency',icon: '💰' },
  { id: 'f6',  path: 'Sales.OrderDate',   kind: 'Date',    icon: '📅' },
  { id: 'f7',  path: 'Sales.PrevTotal',   kind: 'Currency',icon: '💰' },
  { id: 'f8',  path: 'Inv.Category',      kind: 'String',  icon: '🔤' },
  { id: 'f9',  path: 'Inv.Warehouse',     kind: 'String',  icon: '🔤' },
  { id: 'f10', path: 'Inv.QtyOnHand',     kind: 'Number',  icon: '🔢' },
  { id: 'f11', path: 'Inv.ReorderPoint',  kind: 'Number',  icon: '🔢' },
  { id: 'f12', path: 'Orders.OrderDate',  kind: 'Date',    icon: '📅' },
  { id: 'f13', path: 'Orders.OrderId',    kind: 'String',  icon: '🔤' },
  { id: 'f14', path: 'Orders.Total',      kind: 'Currency',icon: '💰' },
  { id: 'f15', path: 'KPI.Revenue',       kind: 'Currency',icon: '💰' },
  { id: 'f16', path: 'KPI.PrevRevenue',   kind: 'Currency',icon: '💰' },
  { id: 'f17', path: 'KPI.Actual',        kind: 'Currency',icon: '💰' },
  { id: 'f18', path: 'KPI.Target',        kind: 'Currency',icon: '💰' },
]

// ── Connections ───────────────────────────────────────────────
const connections = [
  { id: 'c1', name: 'PROD\\REPORTS', driver: 'SQL Server 2019', db: 'ReportsDB', tables: 12, status: 'connected' },
  { id: 'c2', name: 'WAREHOUSE_DB',  driver: 'Oracle 19c',      db: 'WHSDB',    tables: 8,  status: 'connected' },
  { id: 'c3', name: 'ANALYTICS',     driver: 'SQL Server 2022', db: 'Analytics', tables: 21, status: 'connected' },
]

// ── Init ──────────────────────────────────────────────────────
onMounted(() => {
  // Auto-open first RPT
  openRpt(rptFiles.value[0])
})
</script>

<style>
/* Global reset for workbench — scoped to wb-root */
.wb-root * { box-sizing: border-box; margin: 0; padding: 0; }
.wb-root button { cursor: pointer; }
</style>

<style scoped>
.wb-root {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  background: #1e1e1e;
  color: #cccccc;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  font-size: 13px;
  overflow: hidden;
  position: fixed;
  inset: 0;
  z-index: 9999;
}

/* ─── Title bar ─── */
.wb-titlebar {
  display: flex;
  align-items: center;
  height: 30px;
  background: #323233;
  border-bottom: 1px solid #1e1e1e;
  flex-shrink: 0;
  padding: 0 12px;
  gap: 16px;
  -webkit-app-region: drag;
  font-size: 12px;
}
.wb-titlebar-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 180px;
}
.wb-app-icon { font-size: 14px; }
.wb-app-name { font-weight: 700; color: #e0e0e0; font-size: 12px; }
.wb-app-sep  { color: #555; }
.wb-app-sub  { color: #9cdcfe; font-size: 11px; }

.wb-titlebar-menu {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  justify-content: center;
  -webkit-app-region: no-drag;
}
.wb-menu-item {
  padding: 3px 8px;
  cursor: pointer;
  border-radius: 3px;
  font-size: 12px;
  color: #ccc;
  transition: background .1s;
}
.wb-menu-item:hover { background: #4a4a4a; }

.wb-titlebar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 180px;
  justify-content: flex-end;
}
.wb-title-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
  background: #2d2d30;
  color: #858585;
}
.wb-title-badge.green { background: #1a3a1a; color: #4ec9b0; }

/* ─── Body ─── */
.wb-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

/* ─── Activity bar ─── */
.wb-activity-bar {
  width: 46px;
  flex-shrink: 0;
  background: #2c2c2c;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 0;
  border-right: 1px solid #1e1e1e;
  gap: 2px;
}
.wb-act-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  border-radius: 4px;
  color: #858585;
  transition: background .1s, color .1s;
  position: relative;
}
.wb-act-btn:hover  { background: #3c3c3c; color: #ccc; }
.wb-act-btn.active { color: #e0e0e0; border-left: 2px solid #007acc; background: #37373d; }
.wb-act-badge {
  position: absolute;
  top: 3px;
  right: 3px;
  font-size: 8px;
  background: #007acc;
  color: #fff;
  border-radius: 8px;
  min-width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  pointer-events: none;
}
.wb-act-spacer { flex: 1; }

/* ─── Side panel ─── */
.wb-side-panel {
  flex-shrink: 0;
  background: #252526;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid #1e1e1e;
  min-width: 160px;
}

/* ─── Resize handle ─── */
.wb-resize-handle {
  width: 4px;
  flex-shrink: 0;
  cursor: col-resize;
  background: transparent;
  transition: background .15s;
  position: relative;
  z-index: 10;
}
.wb-resize-handle:hover { background: #007acc; }

/* ─── Editor area ─── */
.wb-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}
.wb-editor-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ─── Inspector pane ─── */
.wb-inspector-pane {
  flex-shrink: 0;
  background: #252526;
  border-left: 1px solid #1e1e1e;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 180px;
}

/* ─── Console pane ─── */
.wb-console-pane {
  flex-shrink: 0;
  min-height: 26px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: height .15s;
}

/* ─── Status bar ─── */
.wb-statusbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 22px;
  background: #007acc;
  color: rgba(255,255,255,.9);
  font-size: 11px;
  padding: 0 8px;
  flex-shrink: 0;
  font-family: 'Segoe UI', system-ui, sans-serif;
}
.wb-status-left, .wb-status-right {
  display: flex;
  align-items: center;
  gap: 2px;
}
.wb-status-item {
  padding: 0 6px;
  height: 22px;
  display: flex;
  align-items: center;
  cursor: pointer;
  white-space: nowrap;
  transition: background .1s;
}
.wb-status-item:hover { background: rgba(255,255,255,.15); }
.wb-status-item.source-ctrl { background: rgba(0,0,0,.15); }
.wb-status-item.warn  { background: #8a6400; color: #ffcc02; }
.wb-status-item.ok    { color: rgba(255,255,255,.75); }

/* ─── Search panel ─── */
.wb-panel-hdr {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  min-height: 28px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .06em;
  color: #bbbbbb;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
}
.wb-panel-title { flex: 1; }
.wb-search-panel, .wb-fields-panel, .wb-conn-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 11px;
}
.wb-search-box { padding: 8px; border-bottom: 1px solid #3c3c3c; }
.wb-search-input {
  width: 100%;
  background: #3c3c3c;
  border: 1px solid #555;
  color: #ccc;
  padding: 4px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-family: inherit;
  outline: none;
}
.wb-search-input:focus { border-color: #007acc; }
.wb-search-results { flex: 1; overflow-y: auto; }
.wb-search-result {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  cursor: pointer;
  border-bottom: 1px solid #2d2d30;
}
.wb-search-result:hover { background: #2a2d2e; }
.wb-sr-icon { font-size: 13px; flex-shrink: 0; }
.wb-sr-content { flex: 1; overflow: hidden; }
.wb-sr-label { color: #e0e0e0; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wb-sr-file  { color: #555; font-size: 10px; }
.wb-sr-type  { font-size: 9px; color: #4ec9b0; background: #1a3a2a; padding: 1px 4px; border-radius: 2px; flex-shrink: 0; }
.wb-search-empty { padding: 12px; color: #555; text-align: center; }

/* ─── Field list ─── */
.wb-field-list { flex: 1; overflow-y: auto; }
.wb-field-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-bottom: 1px solid #2d2d30;
  font-size: 11px;
}
.wb-field-row:hover { background: #2a2d2e; }
.wb-field-icon { font-size: 11px; }
.wb-field-name { flex: 1; color: #9cdcfe; }
.wb-field-kind { font-size: 9px; color: #569cd6; background: #1a2a3a; padding: 1px 4px; border-radius: 2px; }

/* ─── Connection cards ─── */
.wb-conn-card {
  margin: 8px;
  background: #2d2d30;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  padding: 8px;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
}
.wb-conn-hdr { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.wb-conn-icon { font-size: 14px; }
.wb-conn-name { flex: 1; color: #e0e0e0; font-weight: 600; font-size: 11px; }
.wb-conn-status { font-size: 9px; padding: 1px 6px; border-radius: 8px; }
.wb-conn-status.connected { background: #1a3a1a; color: #4ec9b0; }
.wb-conn-status.error { background: #3a1a1a; color: #f44747; }
.wb-conn-detail { color: #858585; font-size: 10px; line-height: 1.6; }
.wb-conn-detail span { color: #9cdcfe; }
</style>
