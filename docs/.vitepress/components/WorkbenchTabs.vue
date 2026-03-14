<template>
  <div class="wb-tabs">
    <div
      v-for="tab in tabs"
      :key="tab.id"
      class="wb-tab"
      :class="{ active: activeId === tab.id, modified: tab.modified, subreport: tab.isSubreport }"
      @click="$emit('activate', tab.id)"
    >
      <span class="wb-tab-icon">{{ tab.icon }}</span>
      <span class="wb-tab-name">{{ tab.name }}</span>
      <button
        class="wb-tab-close"
        @click.stop="$emit('close', tab.id)"
        :title="'Close ' + tab.name"
      >×</button>
    </div>
    <div class="wb-tabs-spacer" />
  </div>
</template>

<script setup>
defineProps({
  tabs: { type: Array, required: true },
  activeId: { type: String, default: null },
})
defineEmits(['activate', 'close'])
</script>

<style scoped>
.wb-tabs {
  display: flex;
  align-items: flex-end;
  background: #2d2d30;
  border-bottom: 1px solid #1e1e1e;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  scrollbar-color: #444 transparent;
  min-height: 34px;
  flex-shrink: 0;
}

.wb-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px 6px 10px;
  cursor: pointer;
  border-right: 1px solid #1e1e1e;
  font-size: 12px;
  color: #969696;
  white-space: nowrap;
  border-top: 2px solid transparent;
  transition: background .1s, color .1s;
  min-width: 100px;
  max-width: 200px;
  font-family: 'Segoe UI', system-ui, sans-serif;
  background: #2d2d30;
  position: relative;
}
.wb-tab:hover { background: #3c3c3c; color: #ccc; }
.wb-tab.active {
  background: #1e1e1e;
  color: #e0e0e0;
  border-top-color: #007acc;
}
.wb-tab.modified .wb-tab-name::after {
  content: '●';
  font-size: 7px;
  color: #e5c07b;
  margin-left: 4px;
  vertical-align: super;
}
.wb-tab.subreport { border-top-color: #4ec9b0; }

.wb-tab-icon { font-size: 13px; flex-shrink: 0; }
.wb-tab-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
}

.wb-tab-close {
  background: none;
  border: none;
  color: transparent;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
  border-radius: 3px;
  flex-shrink: 0;
  transition: color .1s, background .1s;
}
.wb-tab:hover .wb-tab-close { color: #858585; }
.wb-tab-close:hover { background: #4a4a4a !important; color: #ccc !important; }

.wb-tabs-spacer { flex: 1; cursor: default; }
</style>
