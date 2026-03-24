<template>
  <section class="rf-fair-hero">
    <div class="rf-hero-panel">
      <span class="rf-kicker">{{ kicker }}</span>
      <h1 class="rf-hero-title">
        {{ title }}
        <br>
        <span class="rf-gradient-text">{{ highlight }}</span>
      </h1>
      <p class="rf-hero-copy">{{ copy }}</p>
      <div class="rf-button-row">
        <a
          v-for="action in actions"
          :key="action.href"
          class="rf-button"
          :class="action.variant === 'primary' ? 'rf-button-primary' : 'rf-button-secondary'"
          :href="action.href"
        >
          {{ action.label }}
        </a>
      </div>
      <div class="rf-stat-row">
        <div v-for="stat in stats" :key="stat.label" class="rf-stat">
          <strong>{{ stat.value }}</strong>
          <span>{{ stat.label }}</span>
        </div>
      </div>
    </div>

    <aside class="rf-side-panel">
      <span class="rf-side-badge">{{ sideBadge }}</span>
      <h2>{{ sideTitle }}</h2>
      <ul class="rf-feature-list">
        <li v-for="item in highlights" :key="item">{{ item }}</li>
      </ul>
      <div class="rf-note">
        <strong>{{ noteTitle }}</strong> {{ note }}
      </div>
    </aside>
  </section>
</template>

<script setup>
defineProps({
  kicker: { type: String, required: true },
  title: { type: String, required: true },
  highlight: { type: String, required: true },
  copy: { type: String, required: true },
  sideBadge: { type: String, required: true },
  sideTitle: { type: String, required: true },
  noteTitle: { type: String, required: true },
  note: { type: String, required: true },
  actions: { type: Array, required: true },
  stats: { type: Array, required: true },
  highlights: { type: Array, required: true },
})
</script>
