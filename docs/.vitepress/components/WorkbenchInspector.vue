<template>
  <div class="wb-inspector">
    <div class="wb-panel-hdr">
      <span class="wb-panel-title">{{ panelTitle }}</span>
      <div class="wb-panel-actions">
        <button
          v-for="mode in modes"
          :key="mode.id"
          class="wb-mode-btn"
          :class="{ active: activeMode === mode.id }"
          :title="mode.label"
          @click="activeMode = mode.id"
        >{{ mode.icon }}</button>
      </div>
    </div>

    <!-- Nothing selected -->
    <div v-if="!selection" class="wb-insp-empty">
      <div class="wb-insp-empty-icon">🔍</div>
      <div>Select an element<br>or section to inspect</div>
    </div>

    <!-- Section selected -->
    <template v-else-if="selection.type === 'section'">
      <div class="wb-insp-type-badge sec">
        {{ selection.data.type }} — Section
      </div>
      <div class="wb-insp-group">
        <div class="wb-insp-group-hdr">Identity</div>
        <div class="wb-insp-row"><label>ID</label><span class="val mono">{{ selection.data.id }}</span></div>
        <div class="wb-insp-row"><label>Label</label><span class="val">{{ selection.data.label }}</span></div>
        <div class="wb-insp-row"><label>Type</label><span class="val type">{{ selection.data.type }}</span></div>
        <div class="wb-insp-row"><label>Elements</label><span class="val num">{{ selection.data.elements.length }}</span></div>
      </div>
      <div class="wb-insp-group">
        <div class="wb-insp-group-hdr">Layout</div>
        <div class="wb-insp-row"><label>Height</label><span class="val num">{{ selection.data.height }}px</span></div>
        <div class="wb-insp-row"><label>Suppressed</label><span class="val bool" :class="selection.data.suppress ? 'true' : 'false'">{{ selection.data.suppress ? 'Yes' : 'No' }}</span></div>
      </div>
    </template>

    <!-- Element selected -->
    <template v-else-if="selection.type === 'element'">
      <div class="wb-insp-type-badge" :class="selection.data.type">
        {{ typeLabel(selection.data.type) }}
      </div>

      <!-- Mode: Properties -->
      <template v-if="activeMode === 'props'">
        <div class="wb-insp-group">
          <div class="wb-insp-group-hdr">Identity</div>
          <div class="wb-insp-row"><label>ID</label><span class="val mono">{{ selection.data.id }}</span></div>
          <div class="wb-insp-row"><label>Label</label><span class="val">{{ selection.data.label }}</span></div>
          <div class="wb-insp-row"><label>Type</label><span class="val type">{{ selection.data.type }}</span></div>
        </div>

        <div class="wb-insp-group">
          <div class="wb-insp-group-hdr">Position &amp; Size</div>
          <div class="wb-insp-row"><label>X</label><span class="val num">{{ selection.data.x }}<em>px</em></span></div>
          <div class="wb-insp-row"><label>Y</label><span class="val num">{{ selection.data.y }}<em>px</em></span></div>
          <div class="wb-insp-row"><label>Width</label><span class="val num">{{ selection.data.w }}<em>px</em></span></div>
          <div class="wb-insp-row"><label>Height</label><span class="val num">{{ selection.data.h }}<em>px</em></span></div>
        </div>

        <div class="wb-insp-group">
          <div class="wb-insp-group-hdr">Content</div>
          <div v-if="selection.data.content" class="wb-insp-row"><label>Text</label><span class="val string">{{ selection.data.content }}</span></div>
          <div v-if="selection.data.fieldPath" class="wb-insp-row"><label>Field</label><span class="val field">{{ selection.data.fieldPath }}</span></div>
          <div v-if="selection.data.target" class="wb-insp-row"><label>Target</label><span class="val link">{{ selection.data.target }}</span></div>
          <div v-if="selection.data.chartType" class="wb-insp-row"><label>Chart</label><span class="val">{{ selection.data.chartType }}</span></div>
          <div v-if="selection.data.fieldFmt" class="wb-insp-row"><label>Format</label><span class="val type">{{ selection.data.fieldFmt }}</span></div>
        </div>

        <div v-if="hasFontProps" class="wb-insp-group">
          <div class="wb-insp-group-hdr">Typography</div>
          <div v-if="selection.data.fontSize" class="wb-insp-row"><label>Size</label><span class="val num">{{ selection.data.fontSize }}<em>pt</em></span></div>
          <div v-if="selection.data.bold !== undefined" class="wb-insp-row"><label>Bold</label><span class="val bool" :class="selection.data.bold ? 'true' : 'false'">{{ selection.data.bold ? 'Yes' : 'No' }}</span></div>
          <div v-if="selection.data.italic !== undefined" class="wb-insp-row"><label>Italic</label><span class="val bool" :class="selection.data.italic ? 'true' : 'false'">{{ selection.data.italic ? 'Yes' : 'No' }}</span></div>
          <div v-if="selection.data.align" class="wb-insp-row"><label>Align</label><span class="val">{{ selection.data.align }}</span></div>
          <div v-if="selection.data.color" class="wb-insp-row">
            <label>Color</label>
            <span class="val color-val">
              <span class="color-swatch" :style="{ background: selection.data.color }"></span>
              {{ selection.data.color }}
            </span>
          </div>
          <div v-if="selection.data.bgColor && selection.data.bgColor !== 'transparent'" class="wb-insp-row">
            <label>BgColor</label>
            <span class="val color-val">
              <span class="color-swatch" :style="{ background: selection.data.bgColor }"></span>
              {{ selection.data.bgColor }}
            </span>
          </div>
        </div>

        <div v-if="selection.data.lineColor" class="wb-insp-group">
          <div class="wb-insp-group-hdr">Line</div>
          <div class="wb-insp-row">
            <label>Color</label>
            <span class="val color-val">
              <span class="color-swatch" :style="{ background: selection.data.lineColor }"></span>
              {{ selection.data.lineColor }}
            </span>
          </div>
        </div>

        <div class="wb-insp-group">
          <div class="wb-insp-group-hdr">Section</div>
          <div class="wb-insp-row"><label>Parent</label><span class="val mono">{{ selection.section?.id }}</span></div>
          <div class="wb-insp-row"><label>Sec Type</label><span class="val type">{{ selection.section?.type }}</span></div>
        </div>
      </template>

      <!-- Mode: Formula editor -->
      <template v-else-if="activeMode === 'formula'">
        <div v-if="selection.data.type === 'formula' || selection.data.fieldPath?.startsWith('@')" class="wb-formula-editor">
          <div class="wb-formula-hdr">
            <span>{{ selection.data.fieldPath || selection.data.label }}</span>
            <span class="wb-formula-type">{{ selection.data.type }}</span>
          </div>
          <div class="wb-formula-body">
            <div class="wb-formula-line"><span class="kw">@</span><span class="fn">{{ selection.data.fieldPath?.replace('@','') || selection.data.label }}</span></div>
            <div class="wb-formula-line mt"><span class="comment">// Crystal Reports Formula</span></div>
            <div class="wb-formula-line"><span class="kw">If</span> <span class="field">{Sales.Total}</span> <span class="op">&gt;</span> <span class="num">0</span></div>
            <div class="wb-formula-line"><span class="kw">Then</span> <span class="fn">Currency</span><span class="op">(</span><span class="field">{Sales.Total}</span><span class="op">)</span></div>
            <div class="wb-formula-line"><span class="kw">Else</span> <span class="string">"—"</span></div>
          </div>
        </div>
        <div v-else class="wb-insp-empty sm">
          <div>No formula attached<br>to this element</div>
        </div>
      </template>

      <!-- Mode: SQL -->
      <template v-else-if="activeMode === 'sql'">
        <div class="wb-formula-editor">
          <div class="wb-formula-hdr"><span>Generated SQL</span><span class="wb-formula-type">SELECT</span></div>
          <div class="wb-formula-body small">
            <div class="wb-formula-line"><span class="kw">SELECT</span></div>
            <div class="wb-formula-line indent"><span class="field">s.CustName</span><span class="op">,</span></div>
            <div class="wb-formula-line indent"><span class="field">s.RepName</span><span class="op">,</span></div>
            <div class="wb-formula-line indent"><span class="field">s.Qty</span><span class="op">,</span></div>
            <div class="wb-formula-line indent"><span class="field">s.Total</span><span class="op">,</span></div>
            <div class="wb-formula-line indent"><span class="field">s.Region</span></div>
            <div class="wb-formula-line"><span class="kw">FROM</span> <span class="fn">dbo.Sales</span> <span class="field">s</span></div>
            <div class="wb-formula-line"><span class="kw">WHERE</span> <span class="field">s.OrderDate</span></div>
            <div class="wb-formula-line indent"><span class="kw">BETWEEN</span> <span class="string">{?StartDate}</span></div>
            <div class="wb-formula-line indent"><span class="kw">AND</span> <span class="string">{?EndDate}</span></div>
            <div class="wb-formula-line"><span class="kw">ORDER BY</span> <span class="field">s.Region</span><span class="op">,</span> <span class="field">s.CustName</span></div>
          </div>
        </div>
      </template>
    </template>

    <!-- Formula selected -->
    <template v-else-if="selection.type === 'formula'">
      <div class="wb-insp-type-badge formula">Formula</div>
      <div class="wb-insp-group">
        <div class="wb-insp-group-hdr">Formula</div>
        <div class="wb-insp-row"><label>Name</label><span class="val mono">@{{ selection.data.name }}</span></div>
        <div class="wb-insp-row"><label>Returns</label><span class="val type">{{ selection.data.type }}</span></div>
      </div>
      <div class="wb-formula-editor mt8">
        <div class="wb-formula-hdr"><span>Expression</span></div>
        <div class="wb-formula-body">
          <div class="wb-formula-line">
            <span class="comment">// @{{ selection.data.name }}</span>
          </div>
          <div class="wb-formula-line mt expr-wrap">{{ selection.data.expr }}</div>
        </div>
      </div>
    </template>

    <!-- Param selected -->
    <template v-else-if="selection.type === 'param'">
      <div class="wb-insp-type-badge param">Parameter</div>
      <div class="wb-insp-group">
        <div class="wb-insp-group-hdr">Parameter</div>
        <div class="wb-insp-row"><label>Name</label><span class="val mono">{?{{ selection.data.name }}}</span></div>
        <div class="wb-insp-row"><label>Type</label><span class="val type">{{ selection.data.type }}</span></div>
        <div v-if="selection.data.default" class="wb-insp-row"><label>Default</label><span class="val string">{{ selection.data.default }}</span></div>
        <div class="wb-insp-row"><label>Prompt</label><span class="val string">{{ selection.data.prompt }}</span></div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  selection: { type: Object, default: null },
})

const activeMode = ref('props')
const modes = [
  { id: 'props',   icon: '⊟', label: 'Properties' },
  { id: 'formula', icon: '𝑓', label: 'Formula' },
  { id: 'sql',     icon: '⊡', label: 'SQL' },
]

const panelTitle = computed(() => {
  if (!props.selection) return 'PROPERTIES'
  if (props.selection.type === 'section') return 'SECTION'
  if (props.selection.type === 'formula') return 'FORMULA'
  if (props.selection.type === 'param')   return 'PARAMETER'
  return 'ELEMENT'
})

const hasFontProps = computed(() => {
  const d = props.selection?.data
  if (!d) return false
  return d.fontSize || d.bold !== undefined || d.italic !== undefined || d.align || d.color
})

function typeLabel(type) {
  const m = {
    text: '🔤 Text', field: '📋 Field', formula: '@ Formula',
    special: '⊛ Special', picture: '🖼 Picture', line: '— Line',
    rect: '□ Rectangle', chart: '📊 Chart', subreport: '↗ Subreport',
    crosstab: '⊞ Crosstab', barcode: '▦ Barcode',
  }
  return m[type] || type
}
</script>

<style scoped>
.wb-inspector {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #252526;
  overflow-y: auto;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 11px;
  color: #cccccc;
  scrollbar-width: thin;
  scrollbar-color: #444 transparent;
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
  gap: 4px;
}
.wb-panel-title { flex: 1; }
.wb-panel-actions { display: flex; gap: 2px; }

.wb-mode-btn {
  background: none;
  border: none;
  color: #858585;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
  transition: background .1s, color .1s;
}
.wb-mode-btn:hover { background: #3c3c3c; color: #ccc; }
.wb-mode-btn.active { background: #094771; color: #007acc; }

.wb-insp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 10px;
  color: #555;
  text-align: center;
  font-size: 11px;
  line-height: 1.6;
  font-family: 'Segoe UI', sans-serif;
  padding: 20px;
}
.wb-insp-empty.sm { flex: 0; padding: 16px; }
.wb-insp-empty-icon { font-size: 32px; opacity: .3; }

.wb-insp-type-badge {
  margin: 8px;
  padding: 4px 10px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
  background: #2d2d30;
  color: #9cdcfe;
  border-left: 3px solid #007acc;
}
.wb-insp-type-badge.sec    { border-color: #569cd6; color: #9cdcfe; }
.wb-insp-type-badge.text   { border-color: #9cdcfe; color: #9cdcfe; }
.wb-insp-type-badge.field  { border-color: #4ec9b0; color: #4ec9b0; }
.wb-insp-type-badge.formula{ border-color: #dcdcaa; color: #dcdcaa; }
.wb-insp-type-badge.special{ border-color: #9cdcfe; color: #9cdcfe; }
.wb-insp-type-badge.chart  { border-color: #569cd6; color: #569cd6; }
.wb-insp-type-badge.subreport{ border-color: #4ec9b0; color: #4ec9b0; }
.wb-insp-type-badge.crosstab{ border-color: #c5a0e0; color: #c5a0e0; }
.wb-insp-type-badge.param  { border-color: #4ec9b0; color: #4ec9b0; }
.wb-insp-type-badge.picture{ border-color: #ce9178; color: #ce9178; }
.wb-insp-type-badge.line   { border-color: #858585; color: #858585; }

.wb-insp-group {
  margin: 0 0 1px;
  border-top: 1px solid #2d2d30;
}
.wb-insp-group-hdr {
  padding: 5px 10px 3px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .08em;
  color: #7a7a7a;
  text-transform: uppercase;
}

.wb-insp-row {
  display: flex;
  align-items: flex-start;
  padding: 3px 10px;
  gap: 6px;
  border-bottom: 1px solid transparent;
}
.wb-insp-row:hover { background: #2a2d2e; }

label {
  flex-shrink: 0;
  width: 54px;
  color: #858585;
  font-size: 10px;
  padding-top: 1px;
}

.val {
  flex: 1;
  color: #cccccc;
  word-break: break-all;
  font-size: 11px;
  line-height: 1.4;
}
.val.mono    { color: #9cdcfe; font-family: 'JetBrains Mono', monospace; font-size: 10px; }
.val.num     { color: #b5cea8; }
.val.num em  { color: #666; font-size: 9px; font-style: normal; }
.val.string  { color: #ce9178; }
.val.type    { color: #4ec9b0; font-size: 10px; }
.val.field   { color: #9cdcfe; }
.val.link    { color: #4ec9b0; text-decoration: underline; cursor: pointer; }
.val.bool.true  { color: #4ec9b0; }
.val.bool.false { color: #f44747; }

.color-val   { display: flex; align-items: center; gap: 5px; }
.color-swatch { width: 10px; height: 10px; border-radius: 2px; border: 1px solid #555; flex-shrink: 0; }

/* Formula / SQL view */
.wb-formula-editor {
  margin: 6px 8px;
  border: 1px solid #3c3c3c;
  border-radius: 3px;
  overflow: hidden;
  font-size: 11px;
}
.wb-formula-editor.mt8 { margin-top: 0; }
.wb-formula-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: #2d2d30;
  border-bottom: 1px solid #3c3c3c;
  font-size: 10px;
  color: #aaa;
}
.wb-formula-type { font-size: 9px; color: #569cd6; background: #1a2a3a; padding: 1px 4px; border-radius: 2px; }
.wb-formula-body {
  padding: 8px;
  background: #1e1e1e;
  overflow-x: auto;
}
.wb-formula-body.small { font-size: 10px; }
.wb-formula-line { line-height: 1.7; white-space: nowrap; }
.wb-formula-line.mt { margin-top: 6px; }
.wb-formula-line.indent { padding-left: 14px; }
.wb-formula-line.expr-wrap { white-space: pre-wrap; color: #dcdcaa; }

.kw      { color: #c586c0; }
.fn      { color: #dcdcaa; }
.field   { color: #9cdcfe; }
.string  { color: #ce9178; }
.num     { color: #b5cea8; }
.op      { color: #d4d4d4; }
.comment { color: #6a9955; }
</style>
