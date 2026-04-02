<template>
  <slot v-if="allowed" />
  <slot v-else name="fallback" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { PermissionCode } from "@/modules/auth/permissions";
import { useAuthStore } from "@/modules/auth/store";

const props = withDefaults(
  defineProps<{
    permissions: PermissionCode[];
    match?: "all" | "any";
  }>(),
  {
    match: "all"
  }
);

const authStore = useAuthStore();

const allowed = computed(() => {
  return props.match === "all"
    ? authStore.hasAllPermissions(props.permissions)
    : authStore.hasAnyPermission(props.permissions);
});
</script>
