<template>
  <div class="wb-canvas" ref="canvasEl" @click.self="$emit('deselect')">
    <div v-if="!rpt" class="wb-canvas-empty">
      <div class="wb-canvas-empty-icon">📊</div>
      <div class="wb-canvas-empty-title">No report open</div>
      <div class="wb-canvas-empty-sub">Double-click a .rpt file in the Explorer to open it</div>
    </div>

    <div v-else class="wb-report" :style="{ width: CANVAS_W + 'px' }">
      <!-- Report info header -->
      <div class="wb-report-meta">
        <span class="wb-meta-name">{{ rpt.icon }} {{ rpt.name }}</span>
        <span class="wb-meta-conn">🔌 {{ rpt.connection }}</span>
        <span class="wb-meta-date">📅 {{ rpt.modified }}</span>
      </div>

      <!-- Sections -->
      <div
        v-for="sec in rpt.sections"
        :key="sec.id"
        class="wb-section"
        :class="[
          'wb-sec-' + sec.type.toLowerCase(),
          { suppressed: sec.suppress, active: activeSec === sec.id }
        ]"
      >
        <!-- Section label col -->
        <div
          class="wb-sec-label"
          :class="'lbl-' + sec.type.toLowerCase()"
          @click="$emit('select-section', { rpt, section: sec })"
          :title="sec.label + (sec.suppress ? ' [SUPPRESSED]' : '')"
        >
          <span class="wb-sec-abbr">{{ abbr(sec.type) }}</span>
          <span v-if="sec.suppress" class="wb-sec-suppress-dot" title="Suppressed">◌</span>
        </div>

        <!-- Section body -->
        <div
          class="wb-sec-body"
          :style="{ height: Math.max(sec.height, 20) + 'px', opacity: sec.suppress ? .4 : 1 }"
          @click.self="$emit('select-section', { rpt, section: sec })"
        >
          <!-- Elements -->
          <div
            v-for="el in sec.elements"
            :key="el.id"
            class="wb-el"
            :class="[
              'el-' + el.type,
              { selected: selectedEl === el.id }
            ]"
            :style="elStyle(el)"
            :title="el.label + ' [' + el.type + ']'"
            @click.stop="selectElement(el, sec)"
          >
            <span class="wb-el-inner" :style="elTextStyle(el)">{{ elContent(el) }}</span>
            <!-- Subreport badge -->
            <span v-if="el.type === 'subreport'" class="wb-el-badge sub">↗</span>
            <!-- Formula badge -->
            <span v-if="el.type === 'formula'" class="wb-el-badge formula">@</span>
            <!-- Special badge -->
            <span v-if="el.type === 'special'" class="wb-el-badge special">⊛</span>
          </div>
          <!-- Empty section hint -->
          <div v-if="sec.elements.length === 0 && !sec.suppress" class="wb-sec-empty">
            empty section
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const CANVAS_W = 650

const props = defineProps({
  rpt:       { type: Object, default: null },
  activeSec: { type: String, default: null },
  selectedEl:{ type: String, default: null },
})
const emit = defineEmits(['select-element', 'select-section', 'deselect'])

const canvasEl = ref(null)

function abbr(type) {
  const m = { RH:'RH', PH:'PH', GH:'GH', D:'D', GF:'GF', PF:'PF', RF:'RF' }
  return m[type] || type
}

function elStyle(el) {
  return {
    position: 'absolute',
    left: el.x + 'px',
    top: el.y + 'px',
    width: el.w + 'px',
    height: el.h + 'px',
    background: el.bgColor && el.bgColor !== 'transparent'
      ? el.bgColor
      : el.type === 'subreport' ? 'rgba(78,201,176,.08)'
      : el.type === 'chart' ? 'rgba(86,156,214,.07)'
      : el.type === 'crosstab' ? 'rgba(197,160,224,.07)'
      : 'transparent',
    border: el.type === 'line'
      ? 'none'
      : el.type === 'subreport'
      ? '1px dashed #4ec9b0'
      : el.type === 'chart'
      ? '1px dashed #569cd6'
      : el.type === 'crosstab'
      ? '1px dashed #c5a0e0'
      : el.type === 'picture'
      ? '1px dashed #ce9178'
      : '1px solid transparent',
    borderBottom: el.type === 'line' ? `${el.h || 1}px solid ${el.lineColor || '#aaa'}` : undefined,
    boxSizing: 'border-box',
    cursor: 'pointer',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    transition: 'outline .1s',
  }
}

function elTextStyle(el) {
  return {
    fontWeight: el.bold ? '700' : '400',
    fontStyle: el.italic ? 'italic' : 'normal',
    textDecoration: el.underline ? 'underline' : 'none',
    fontSize: (el.fontSize || 10) + 'px',
    color: el.color || (
      el.type === 'formula' ? '#dcdcaa'
      : el.type === 'special' ? '#9cdcfe'
      : el.type === 'field' ? '#c6d5e8'
      : '#cccccc'
    ),
    textAlign: el.align || 'left',
    width: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    padding: '0 2px',
    lineHeight: '1',
    pointerEvents: 'none',
  }
}

function elContent(el) {
  if (el.type === 'text')      return el.content
  if (el.type === 'field')     return el.fieldPath
  if (el.type === 'formula')   return '@' + (el.fieldPath?.replace('@','') || el.label)
  if (el.type === 'special')   return '⊛ ' + el.fieldPath
  if (el.type === 'picture')   return '🖼 ' + el.content
  if (el.type === 'chart')     return '📊 ' + (el.chartType || 'chart')
  if (el.type === 'subreport') return '↗ ' + (el.target || 'subreport')
  if (el.type === 'crosstab')  return '⊞ ' + (el.rowField || '') + ' × ' + (el.colField || '')
  if (el.type === 'line')      return ''
  return el.label
}

function selectElement(el, sec) {
  emit('select-element', { element: el, section: sec })
}
</script>

<style scoped>
.wb-canvas {
  flex: 1;
  overflow: auto;
  background: #1e1e1e;
  padding: 24px 32px;
  scrollbar-width: thin;
  scrollbar-color: #444 #1e1e1e;
}

.wb-canvas-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 10px;
  color: #555;
}
.wb-canvas-empty-icon { font-size: 48px; opacity: .4; }
.wb-canvas-empty-title { font-size: 16px; color: #666; font-family: 'Segoe UI', sans-serif; }
.wb-canvas-empty-sub { font-size: 12px; color: #444; font-family: 'Segoe UI', sans-serif; }

.wb-report {
  background: #252526;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 4px 24px rgba(0,0,0,.4);
  margin: 0 auto;
}

.wb-report-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 6px 12px;
  background: #2d2d30;
  border-bottom: 1px solid #3c3c3c;
  font-size: 11px;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  flex-wrap: wrap;
}
.wb-meta-name { color: #e0e0e0; font-weight: 600; }
.wb-meta-conn { color: #9cdcfe; }
.wb-meta-date { color: #6a9955; margin-left: auto; }

.wb-section {
  display: flex;
  border-bottom: 1px solid #2d2d30;
}
.wb-section:last-child { border-bottom: none; }
.wb-section.active > .wb-sec-body { outline: 1px solid #007acc; outline-offset: -1px; }
.wb-section.suppressed { opacity: .5; }

/* Section label column */
.wb-sec-label {
  width: 28px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  cursor: pointer;
  border-right: 2px solid #3c3c3c;
  transition: background .1s;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
}
.wb-sec-label:hover { background: #2a2d2e; }

.wb-sec-abbr {
  font-size: 9px;
  font-weight: 700;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  transform: rotate(180deg);
  letter-spacing: .05em;
  white-space: nowrap;
}
.wb-sec-suppress-dot { font-size: 10px; color: #f44747; }

/* Section type colors */
.lbl-rh { background: #1a2a1a; color: #6a9955; border-right-color: #3a5a3a; }
.lbl-ph { background: #1a2030; color: #569cd6; border-right-color: #2a4060; }
.lbl-gh { background: #2a2040; color: #c5a0e0; border-right-color: #4a3a60; }
.lbl-d  { background: #1e1e1e; color: #9cdcfe; border-right-color: #2a3a4a; }
.lbl-gf { background: #2a2040; color: #c5a0e0; border-right-color: #4a3a60; }
.lbl-pf { background: #1a2030; color: #569cd6; border-right-color: #2a4060; }
.lbl-rf { background: #1a2a1a; color: #6a9955; border-right-color: #3a5a3a; }

/* Section body */
.wb-sec-body {
  flex: 1;
  position: relative;
  min-height: 20px;
  cursor: default;
}

.wb-sec-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: #444;
  font-style: italic;
  font-family: 'Segoe UI', sans-serif;
  pointer-events: none;
}

/* Elements */
.wb-el {
  border-radius: 1px;
}
.wb-el:hover {
  outline: 1px solid rgba(0,122,204,.6);
}
.wb-el.selected {
  outline: 2px solid #007acc !important;
  z-index: 10;
  background: rgba(0,122,204,.08) !important;
}

.wb-el-badge {
  position: absolute;
  top: 1px;
  right: 1px;
  font-size: 8px;
  line-height: 1;
  padding: 0 2px;
  border-radius: 2px;
  font-family: 'JetBrains Mono', monospace;
  pointer-events: none;
}
.wb-el-badge.sub     { background: rgba(78,201,176,.2); color: #4ec9b0; }
.wb-el-badge.formula { background: rgba(220,220,170,.2); color: #dcdcaa; }
.wb-el-badge.special { background: rgba(156,220,254,.2); color: #9cdcfe; }

.wb-el-inner { font-family: 'JetBrains Mono', 'Consolas', monospace; }
</style>
