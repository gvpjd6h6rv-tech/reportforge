<template>
  <div class="wb-console">
    <!-- Console tabs bar -->
    <div class="wb-console-tabs">
      <div
        v-for="tab in consoleTabs"
        :key="tab.id"
        class="wb-console-tab"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
        <span v-if="tab.count" class="wb-console-badge" :class="tab.badgeClass">{{ tab.count }}</span>
      </div>
      <div class="wb-console-tab-spacer" />
      <button class="wb-console-action" title="Clear" @click="clearLog">⊘</button>
      <button class="wb-console-action" title="Collapse" @click="$emit('toggle-collapse')">⌄</button>
    </div>

    <!-- Console output -->
    <div v-if="activeTab === 'console'" class="wb-console-body" ref="consoleEl">
      <div
        v-for="(line, i) in log"
        :key="i"
        class="wb-log-line"
        :class="'log-' + line.level"
      >
        <span class="wb-log-time">{{ line.time }}</span>
        <span class="wb-log-level" :class="'lvl-' + line.level">{{ levelIcon(line.level) }}</span>
        <span class="wb-log-msg">{{ line.msg }}</span>
      </div>
      <div class="wb-log-cursor">▌</div>
    </div>

    <!-- Problems tab -->
    <div v-else-if="activeTab === 'problems'" class="wb-console-body">
      <div v-for="(p, i) in problems" :key="i" class="wb-problem-row" :class="'prob-' + p.level">
        <span class="wb-prob-icon">{{ p.level === 'error' ? '⊗' : '⚠' }}</span>
        <span class="wb-prob-file">{{ p.file }}</span>
        <span class="wb-prob-msg">{{ p.msg }}</span>
      </div>
      <div v-if="!problems.length" class="wb-console-empty">No problems detected ✓</div>
    </div>

    <!-- Output tab -->
    <div v-else-if="activeTab === 'output'" class="wb-console-body">
      <div class="wb-output-row">
        <span class="out-kw">ReportForge</span> RPT Workbench v2.0 · Crystal Reports Reverse-Engineering
      </div>
      <div class="wb-output-row"><span class="out-dim">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span></div>
      <div class="wb-output-row">Workspace: <span class="out-val">./reports/</span></div>
      <div class="wb-output-row">Engine: <span class="out-val">ReportForge v2.0 · 405/405 tests passing</span></div>
      <div class="wb-output-row">Node: <span class="out-val">v22 · ES Modules</span></div>
    </div>

    <!-- Terminal tab -->
    <div v-else-if="activeTab === 'terminal'" class="wb-console-body terminal">
      <div class="wb-terminal-row">
        <span class="t-dim">~/reports</span> <span class="t-prompt">$</span>
        <span class="wb-terminal-input" ref="termInput" contenteditable="true" spellcheck="false" @keydown="handleTermKey">{{ termInput }}</span>
      </div>
      <div v-for="(line, i) in termHistory" :key="'t'+i" class="wb-terminal-row output" v-html="line" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue'

const props = defineProps({
  log:      { type: Array, default: () => [] },
  problems: { type: Array, default: () => [] },
})
defineEmits(['toggle-collapse'])

const activeTab = ref('console')
const consoleEl = ref(null)
const termInput = ref('')
const termHistory = ref([
  '<span style="color:#6a9955">// Type help for available commands</span>'
])

const consoleTabs = computed(() => [
  { id: 'console',  label: 'CONSOLE',  count: null },
  { id: 'problems', label: 'PROBLEMS', count: props.problems.length || null, badgeClass: 'badge-warn' },
  { id: 'output',   label: 'OUTPUT',   count: null },
  { id: 'terminal', label: 'TERMINAL', count: null },
])

function levelIcon(level) {
  return { info: 'ℹ', warn: '⚠', error: '⊗', ok: '✓', debug: '⬡' }[level] || '·'
}

function clearLog() {
  // emit clear — parent handles it
}

function handleTermKey(e) {
  if (e.key !== 'Enter') return
  e.preventDefault()
  const cmd = e.target.textContent.trim()
  e.target.textContent = ''
  runCommand(cmd)
}

function runCommand(cmd) {
  if (!cmd) return
  termHistory.value.push(`<span style="color:#858585">~/reports</span> <span style="color:#4ec9b0">$</span> ${cmd}`)
  const cmds = {
    help: () => [
      '<span style="color:#9cdcfe">Available commands:</span>',
      '  <span style="color:#dcdcaa">parse</span> &lt;file&gt;     — Parse an RPT file',
      '  <span style="color:#dcdcaa">list</span>              — List workspace files',
      '  <span style="color:#dcdcaa">formulas</span> &lt;file&gt; — Show formula list',
      '  <span style="color:#dcdcaa">clear</span>             — Clear terminal',
    ],
    list: () => [
      '  <span style="color:#ce9178">📊 SalesReport_Q4_2024.rpt</span>  <span style="color:#555">284 KB</span>',
      '  <span style="color:#9cdcfe">🔗 CustomerDetail.rpt</span>       <span style="color:#555"> 96 KB</span>',
      '  <span style="color:#ce9178">📦 InventoryMatrix.rpt</span>      <span style="color:#555">178 KB</span>',
      '  <span style="color:#ce9178">📈 ExecutiveSummary.rpt</span>     <span style="color:#555">342 KB</span>',
    ],
    clear: () => { termHistory.value = []; return [] },
  }
  const parts = cmd.split(' ')
  const c = parts[0].toLowerCase()
  if (cmds[c]) {
    const out = cmds[c](parts.slice(1))
    if (out) termHistory.value.push(...out)
  } else if (c === 'parse') {
    const f = parts[1] || 'SalesReport_Q4_2024.rpt'
    termHistory.value.push(
      `<span style="color:#6a9955">✓ Parsing ${f}…</span>`,
      `  Sections: <span style="color:#b5cea8">7</span>  Elements: <span style="color:#b5cea8">22</span>  Formulas: <span style="color:#b5cea8">4</span>`,
      `  <span style="color:#4ec9b0">✓ Done</span>`
    )
  } else if (c === 'formulas') {
    termHistory.value.push(
      '<span style="color:#dcdcaa">@RegionSum</span>  <span style="color:#555">→ Sum({Sales.Total}, {Sales.Region})</span>',
      '<span style="color:#dcdcaa">@GrandSum</span>   <span style="color:#555">→ Sum({Sales.Total})</span>',
      '<span style="color:#dcdcaa">@GrowthPct</span>  <span style="color:#555">→ ({Sales.Total} - {Sales.PrevTotal}) / ...</span>',
    )
  } else {
    termHistory.value.push(`<span style="color:#f44747">command not found: ${cmd}</span>`)
  }
}

watch(() => props.log.length, async () => {
  await nextTick()
  if (consoleEl.value) consoleEl.value.scrollTop = consoleEl.value.scrollHeight
})
</script>

<style scoped>
.wb-console {
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  border-top: 1px solid #3c3c3c;
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 11px;
}

.wb-console-tabs {
  display: flex;
  align-items: center;
  background: #2d2d30;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
  overflow-x: auto;
}

.wb-console-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 14px;
  cursor: pointer;
  font-size: 11px;
  color: #969696;
  border-right: 1px solid #1e1e1e;
  white-space: nowrap;
  transition: background .1s, color .1s;
  letter-spacing: .04em;
}
.wb-console-tab:hover { background: #3c3c3c; color: #ccc; }
.wb-console-tab.active { background: #1e1e1e; color: #e0e0e0; border-top: 1px solid #007acc; }

.wb-console-badge {
  font-size: 9px;
  padding: 0 4px;
  border-radius: 8px;
  min-width: 14px;
  text-align: center;
  line-height: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.badge-warn { background: #7d6608; color: #ffcc02; }
.badge-error { background: #5c1616; color: #f44747; }

.wb-console-tab-spacer { flex: 1; }
.wb-console-action {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 4px 8px;
  font-size: 13px;
  transition: color .1s;
}
.wb-console-action:hover { color: #ccc; }

.wb-console-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 6px 0;
  scrollbar-width: thin;
  scrollbar-color: #444 transparent;
  max-height: 100%;
}
.wb-console-body.terminal { padding: 8px 12px; }

.wb-console-empty {
  padding: 12px 16px;
  color: #6a9955;
  font-size: 11px;
}

/* Log lines */
.wb-log-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 1px 12px;
  line-height: 1.5;
}
.wb-log-line:hover { background: #2a2a2a; }
.log-warn  { background: rgba(125,102,8,.08); }
.log-error { background: rgba(92,22,22,.15); }
.log-ok    { color: #6a9955; }

.wb-log-time  { color: #555; font-size: 10px; flex-shrink: 0; width: 56px; }
.wb-log-level { flex-shrink: 0; width: 14px; text-align: center; font-size: 11px; }
.lvl-info  { color: #007acc; }
.lvl-warn  { color: #ffcc02; }
.lvl-error { color: #f44747; }
.lvl-ok    { color: #4ec9b0; }
.lvl-debug { color: #555; }

.wb-log-msg { flex: 1; color: #cccccc; font-size: 11px; word-break: break-word; }
.log-ok .wb-log-msg  { color: #6a9955; }
.log-warn .wb-log-msg  { color: #e5c07b; }
.log-error .wb-log-msg { color: #f47474; }

.wb-log-cursor { padding: 2px 12px; color: #007acc; animation: blink 1s step-end infinite; }
@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }

/* Problems */
.wb-problem-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 12px;
  border-bottom: 1px solid #2d2d30;
  font-size: 11px;
}
.wb-problem-row:hover { background: #2a2a2a; }
.prob-warn .wb-prob-icon  { color: #ffcc02; }
.prob-error .wb-prob-icon { color: #f44747; }
.wb-prob-file { color: #569cd6; flex-shrink: 0; }
.wb-prob-msg  { color: #cccccc; flex: 1; }

/* Output */
.wb-output-row {
  padding: 2px 12px;
  line-height: 1.6;
  color: #9cdcfe;
  font-size: 11px;
}
.out-kw  { color: #c586c0; font-weight: 600; }
.out-val { color: #ce9178; }
.out-dim { color: #444; }

/* Terminal */
.wb-terminal-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 1px 0;
  line-height: 1.6;
  font-size: 11px;
  color: #cccccc;
  flex-wrap: wrap;
}
.wb-terminal-row.output { padding-left: 0; }
.t-dim    { color: #6a9955; }
.t-prompt { color: #4ec9b0; }
.wb-terminal-input {
  flex: 1;
  color: #cccccc;
  outline: none;
  caret-color: #007acc;
  min-width: 200px;
}
</style>
