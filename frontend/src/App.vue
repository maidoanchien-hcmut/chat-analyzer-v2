<template>
  <VApp>
    <component :is="layoutComponent">
      <RouterView />
    </component>
  </VApp>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterView, useRoute } from "vue-router";
import AuthLayout from "@/shared/layouts/AuthLayout.vue";
import AppShell from "@/shared/layouts/AppShell.vue";

const route = useRoute();

const layoutComponent = computed(() => {
  return route.meta.layout === "auth" ? AuthLayout : AppShell;
});
</script>
