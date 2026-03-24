<template>
  <section class="rf-grid">
    <div
      v-for="card in cards"
      :key="card.title"
      class="rf-card"
      :class="`rf-col-${card.cols || 4}`"
    >
      <h2>{{ card.title }}</h2>
      <p v-if="card.copy">{{ card.copy }}</p>
      <ul v-if="card.items?.length">
        <li v-for="item in card.items" :key="item">{{ item }}</li>
      </ul>
      <div v-if="card.chips?.length" class="rf-chip-row">
        <span v-for="chip in card.chips" :key="chip" class="rf-chip">{{ chip }}</span>
      </div>
    </div>
  </section>
</template>

<script setup>
defineProps({
  cards: { type: Array, required: true },
})
</script>
