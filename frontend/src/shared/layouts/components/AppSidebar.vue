<template>
  <div class="app-sidebar" :class="{ 'app-sidebar-collapsed': collapsed }">
    <div class="app-sidebar__head">
      <div class="app-sidebar__brand-mark">CA</div>
      <div v-if="!collapsed" class="app-sidebar__brand-copy">
        <strong>{{ appName }}</strong>
      </div>
    </div>

    <VList nav density="comfortable" class="app-sidebar__nav">
      <VTooltip
        v-for="item in navItems"
        :key="item.to.name"
        :text="item.label"
        location="end"
        :disabled="!collapsed"
      >
        <template #activator="{ props: tooltipProps }">
          <VListItem
            v-bind="tooltipProps"
            :to="item.to"
            :active="item.matchNames.includes(currentRouteName)"
            nav
            rounded="xl"
            class="app-sidebar__item"
            :class="{ 'app-sidebar__item-collapsed': collapsed }"
            :title="collapsed ? undefined : item.label"
          >
            <template #prepend>
              <VIcon :icon="item.icon" />
            </template>
          </VListItem>
        </template>
      </VTooltip>
    </VList>

    <div class="app-sidebar__footer">
      <VTooltip :text="collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'" location="end">
        <template #activator="{ props: tooltipProps }">
          <VBtn
            v-bind="tooltipProps"
            icon
            size="small"
            variant="text"
            class="app-sidebar__toggle"
            @click="emit('toggle-collapse')"
          >
            <VIcon :icon="collapsed ? 'mdi-chevron-right' : 'mdi-chevron-left'" />
          </VBtn>
        </template>
      </VTooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();

defineProps<{
  appName: string;
  collapsed: boolean;
  navItems: Array<{
    label: string;
    to: {
      name: string;
    };
    icon: string;
    matchNames: string[];
  }>;
}>();

const emit = defineEmits<{
  "toggle-collapse": [];
}>();

const currentRouteName = computed(() => route.name?.toString() ?? "");
</script>

<style scoped>
.app-sidebar {
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 18px;
  padding: 18px 12px 16px;
}

.app-sidebar__head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
}

.app-sidebar__brand-mark {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  color: #ffffff;
  font-size: 0.84rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  background: linear-gradient(135deg, #0f766e 0%, #155e75 100%);
  box-shadow: 0 12px 26px rgba(15, 118, 110, 0.18);
}

.app-sidebar__brand-copy {
  min-width: 0;
}

.app-sidebar__brand-copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.94rem;
}

.app-sidebar__nav {
  align-self: start;
  gap: 6px;
  padding: 0;
}

.app-sidebar__item {
  min-height: 48px;
  margin-bottom: 6px;
  color: #1f2937;
}

.app-sidebar__item :deep(.v-list-item__prepend) {
  margin-inline-end: 14px;
}

.app-sidebar__item-collapsed {
  padding-inline: 0;
}

.app-sidebar__item-collapsed :deep(.v-list-item__prepend) {
  width: 100%;
  margin-inline-end: 0;
  display: flex;
  justify-content: center;
}

.app-sidebar__item-collapsed :deep(.v-list-item__prepend > .v-icon) {
  margin: 0 auto;
}

.app-sidebar__item-collapsed :deep(.v-list-item__spacer),
.app-sidebar__item-collapsed :deep(.v-list-item__content) {
  display: none;
}

.app-sidebar :deep(.v-list-item--active) {
  color: #0f766e;
  background: rgba(15, 118, 110, 0.1);
}

.app-sidebar__footer {
  display: flex;
  justify-content: center;
  padding-top: 14px;
  border-top: 1px solid rgba(17, 24, 39, 0.08);
}

.app-sidebar__toggle {
  color: #374151;
}

.app-sidebar-collapsed .app-sidebar__head {
  grid-template-columns: 1fr;
  justify-items: center;
}
</style>
