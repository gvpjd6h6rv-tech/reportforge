<template>
  <div class="rf-banner">
    <h2>{{ title }}</h2>
    <p>{{ copy }}</p>
    <div class="rf-chip-row">
      <span v-for="chip in chips" :key="chip" class="rf-chip">{{ chip }}</span>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  copy: { type: String, required: true },
  chips: { type: Array, required: true },
})
</script>
