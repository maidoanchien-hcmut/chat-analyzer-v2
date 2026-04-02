<template>
  <header class="stack-sm">
    <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
    <div class="stack-sm">
      <h1 class="page-title">{{ title }}</h1>
      <p v-if="description" class="page-description">{{ description }}</p>
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
  eyebrow?: string;
}>();
</script>
