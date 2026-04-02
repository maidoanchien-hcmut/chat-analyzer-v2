<template>
  <article class="content-card stack-sm">
    <p class="eyebrow">{{ label }}</p>
    <div class="stack-sm">
      <strong style="font-size: 2rem; line-height: 1">{{ value }}</strong>
      <p class="muted" style="margin: 0">{{ description }}</p>
    </div>
  </article>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  value: string;
  description: string;
}>();
</script>
