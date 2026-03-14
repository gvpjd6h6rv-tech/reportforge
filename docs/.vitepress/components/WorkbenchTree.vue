<template>
  <div class="wb-tree">
    <!-- Panel header -->
    <div class="wb-panel-hdr">
      <span class="wb-panel-title">EXPLORER</span>
      <div class="wb-panel-actions">
        <button class="wb-icon-btn" title="Collapse All" @click="collapseAll">⊟</button>
        <button class="wb-icon-btn" title="Refresh" @click="$emit('refresh')">↻</button>
      </div>
    </div>

    <!-- Workspace section -->
    <div class="wb-section">
      <div class="wb-section-hdr" @click="workspaceOpen = !workspaceOpen">
        <span class="wb-chevron" :class="{ open: workspaceOpen }">›</span>
        <span>WORKSPACE</span>
      </div>
      <div v-if="workspaceOpen" class="wb-section-body">
        <div
          v-for="rpt in files"
          :key="rpt.id"
          class="wb-tree-item"
          :class="{ active: activeId === rpt.id, open: expanded.has(rpt.id) }"
        >
          <!-- File row -->
          <div
            class="wb-tree-row"
            :style="{ paddingLeft: '8px' }"
            @click="toggle(rpt)"
            @dblclick="$emit('open', rpt)"
          >
            <span class="wb-chevron sm" :class="{ open: expanded.has(rpt.id) }">›</span>
            <span class="wb-file-icon">{{ rpt.icon }}</span>
            <span class="wb-file-name" :class="{ subreport: rpt.isSubreport }">{{ rpt.name }}</span>
            <span class="wb-file-size">{{ rpt.size }}</span>
          </div>

          <!-- Expanded sub-tree -->
          <div v-if="expanded.has(rpt.id)" class="wb-subtree">
            <!-- Sections -->
            <div class="wb-subtree-group" @click.stop="toggleGroup(rpt.id, 'sections')">
              <span class="wb-chevron xs" :class="{ open: openGroups.has(rpt.id + ':sections') }">›</span>
              <span class="wb-group-icon">📐</span>
              <span class="wb-group-label">Sections ({{ rpt.sections.length }})</span>
            </div>
            <div v-if="openGroups.has(rpt.id + ':sections')">
              <div
                v-for="sec in rpt.sections"
                :key="sec.id"
                class="wb-leaf"
                :class="{ selected: selectedSec === rpt.id + ':' + sec.id }"
                @click.stop="selectSection(rpt, sec)"
              >
                <span class="wb-leaf-icon">{{ sectionIcon(sec.type) }}</span>
                <span class="wb-leaf-label">{{ sec.label }}</span>
                <span class="wb-leaf-count">{{ sec.elements.length }}</span>
              </div>
            </div>

            <!-- Formulas -->
            <div class="wb-subtree-group" @click.stop="toggleGroup(rpt.id, 'formulas')">
              <span class="wb-chevron xs" :class="{ open: openGroups.has(rpt.id + ':formulas') }">›</span>
              <span class="wb-group-icon">𝑓</span>
              <span class="wb-group-label">Formulas ({{ rpt.formulas.length }})</span>
            </div>
            <div v-if="openGroups.has(rpt.id + ':formulas')">
              <div
                v-for="f in rpt.formulas"
                :key="f.id"
                class="wb-leaf formula-leaf"
                @click.stop="$emit('select-formula', { rpt, formula: f })"
              >
                <span class="wb-leaf-icon">@</span>
                <span class="wb-leaf-label">{{ f.name }}</span>
                <span class="wb-leaf-type">{{ f.type }}</span>
              </div>
            </div>

            <!-- Parameters -->
            <div class="wb-subtree-group" @click.stop="toggleGroup(rpt.id, 'params')">
              <span class="wb-chevron xs" :class="{ open: openGroups.has(rpt.id + ':params') }">›</span>
              <span class="wb-group-icon">⚙</span>
              <span class="wb-group-label">Parameters ({{ rpt.parameters.length }})</span>
            </div>
            <div v-if="openGroups.has(rpt.id + ':params')">
              <div
                v-for="p in rpt.parameters"
                :key="p.id"
                class="wb-leaf param-leaf"
                @click.stop="$emit('select-param', { rpt, param: p })"
              >
                <span class="wb-leaf-icon">?</span>
                <span class="wb-leaf-label">{{ p.name }}</span>
                <span class="wb-leaf-type">{{ p.type }}</span>
              </div>
            </div>

            <!-- Groups -->
            <div v-if="rpt.groups.length" class="wb-subtree-group" @click.stop="toggleGroup(rpt.id, 'groups')">
              <span class="wb-chevron xs" :class="{ open: openGroups.has(rpt.id + ':groups') }">›</span>
              <span class="wb-group-icon">⊞</span>
              <span class="wb-group-label">Groups ({{ rpt.groups.length }})</span>
            </div>
            <div v-if="rpt.groups.length && openGroups.has(rpt.id + ':groups')">
              <div v-for="g in rpt.groups" :key="g.id" class="wb-leaf group-leaf">
                <span class="wb-leaf-icon">⊞</span>
                <span class="wb-leaf-label">{{ g.field }}</span>
                <span class="wb-leaf-type">{{ g.order }}</span>
              </div>
            </div>

            <!-- Running totals -->
            <div v-if="rpt.runningTotals.length" class="wb-subtree-group" @click.stop="toggleGroup(rpt.id, 'rt')">
              <span class="wb-chevron xs" :class="{ open: openGroups.has(rpt.id + ':rt') }">›</span>
              <span class="wb-group-icon">Σ</span>
              <span class="wb-group-label">Running Totals ({{ rpt.runningTotals.length }})</span>
            </div>
            <div v-if="rpt.runningTotals.length && openGroups.has(rpt.id + ':rt')">
              <div v-for="rt in rpt.runningTotals" :key="rt.id" class="wb-leaf rt-leaf">
                <span class="wb-leaf-icon">Σ</span>
                <span class="wb-leaf-label">{{ rt.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  files: { type: Array, required: true },
  activeId: { type: String, default: null },
})
const emit = defineEmits(['open', 'refresh', 'select-formula', 'select-param', 'select-section'])

const workspaceOpen = ref(true)
const expanded = ref(new Set(['sales_q4']))
const openGroups = ref(new Set(['sales_q4:sections']))
const selectedSec = ref(null)

function toggle(rpt) {
  if (expanded.value.has(rpt.id)) expanded.value.delete(rpt.id)
  else { expanded.value.add(rpt.id); emit('open', rpt) }
  expanded.value = new Set(expanded.value)
}

function toggleGroup(rptId, key) {
  const k = rptId + ':' + key
  if (openGroups.value.has(k)) openGroups.value.delete(k)
  else openGroups.value.add(k)
  openGroups.value = new Set(openGroups.value)
}

function selectSection(rpt, sec) {
  selectedSec.value = rpt.id + ':' + sec.id
  emit('select-section', { rpt, section: sec })
}

function collapseAll() {
  expanded.value = new Set()
  openGroups.value = new Set()
}

function sectionIcon(type) {
  const m = { RH: '⬛', PH: '▬', GH: '▶', D: '▷', GF: '◀', PF: '▬', RF: '⬛' }
  return m[type] || '▷'
}
</script>

<style scoped>
.wb-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #252526;
  overflow-y: auto;
  overflow-x: hidden;
  user-select: none;
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  color: #cccccc;
}

.wb-panel-hdr {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  min-height: 28px;
  color: #bbbbbb;
  letter-spacing: .06em;
  font-size: 10px;
  font-weight: 600;
  background: #252526;
  position: sticky;
  top: 0;
  z-index: 1;
}

.wb-panel-title { flex: 1; }

.wb-panel-actions { display: flex; gap: 2px; }

.wb-icon-btn {
  background: none;
  border: none;
  color: #858585;
  cursor: pointer;
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 12px;
  line-height: 1;
}
.wb-icon-btn:hover { background: #3c3c3c; color: #ccc; }

.wb-section-hdr {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .08em;
  color: #aaa;
  cursor: pointer;
}
.wb-section-hdr:hover { background: #2a2d2e; }

.wb-tree-item { border-bottom: 1px solid #1e1e1e; }

.wb-tree-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px 4px 4px;
  cursor: pointer;
  transition: background .1s;
}
.wb-tree-row:hover { background: #2a2d2e; }
.wb-tree-item.active > .wb-tree-row { background: #37373d; }

.wb-file-icon { font-size: 13px; }
.wb-file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #e0e0e0;
}
.wb-file-name.subreport { color: #9cdcfe; font-style: italic; }
.wb-file-size { font-size: 10px; color: #666; margin-left: 4px; flex-shrink: 0; }

.wb-chevron {
  display: inline-block;
  font-size: 13px;
  color: #858585;
  transition: transform .15s;
  line-height: 1;
  width: 12px;
  text-align: center;
}
.wb-chevron.open { transform: rotate(90deg); }
.wb-chevron.sm { font-size: 11px; width: 10px; }
.wb-chevron.xs { font-size: 10px; width: 10px; }

.wb-subtree { padding-left: 16px; }

.wb-subtree-group {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px 3px 4px;
  cursor: pointer;
  color: #9d9d9d;
  font-size: 11px;
}
.wb-subtree-group:hover { background: #2a2d2e; }

.wb-group-icon { width: 14px; text-align: center; font-size: 11px; color: #c5a0e0; }
.wb-group-label { flex: 1; }

.wb-leaf {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px 2px 24px;
  cursor: pointer;
  font-size: 11px;
  color: #9cdcfe;
}
.wb-leaf:hover { background: #2a2d2e; }
.wb-leaf.selected { background: #094771; color: #fff; }

.wb-leaf-icon { font-size: 10px; color: #858585; width: 12px; text-align: center; font-style: normal; }
.wb-leaf-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wb-leaf-count { font-size: 10px; color: #555; }
.wb-leaf-type { font-size: 9px; color: #569cd6; background: #1a2a3a; padding: 0 3px; border-radius: 2px; }

.formula-leaf .wb-leaf-icon { color: #dcdcaa; font-style: italic; font-size: 11px; }
.formula-leaf { color: #dcdcaa; }
.param-leaf .wb-leaf-icon { color: #4ec9b0; }
.param-leaf { color: #4ec9b0; }
.group-leaf { color: #c5a0e0; }
.rt-leaf { color: #ce9178; }
</style>
