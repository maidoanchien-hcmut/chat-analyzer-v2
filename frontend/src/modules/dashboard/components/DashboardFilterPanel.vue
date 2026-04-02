<template>
  <section class="dashboard-filter-panel">
    <div class="dashboard-filter-panel__bar">
      <VTextField
        :model-value="searchQuery"
        prepend-inner-icon="mdi-magnify"
        label="Tìm theo tên khách hàng hoặc nhân viên"
        hide-details
        clearable
        @update:model-value="emit('update:searchQuery', $event ?? '')"
      />

      <div class="dashboard-filter-panel__actions">
        <VChip variant="tonal" color="primary">{{ resultCount }} hội thoại</VChip>
        <VBtn
          prepend-icon="mdi-filter-variant"
          variant="outlined"
          color="primary"
          @click="emit('update:expanded', !expanded)"
        >
          Lọc
        </VBtn>
      </div>
    </div>

    <div v-if="selectedFilterLabels.length > 0" class="dashboard-filter-panel__chips">
      <VChip
        v-for="label in selectedFilterLabels"
        :key="label"
        size="small"
        color="primary"
        variant="tonal"
      >
        {{ label }}
      </VChip>
    </div>

    <VExpandTransition>
      <VCard v-show="expanded" class="dashboard-filter-panel__dropdown">
        <div class="dashboard-filter-panel__dropdown-grid">
          <VSelect
            v-for="group in groups"
            :key="group.key"
            :model-value="group.selected"
            :items="group.options"
            item-title="label"
            item-value="value"
            :label="group.label"
            clearable
            hide-details
            @update:model-value="emit('set-group', { groupKey: group.key, value: $event ? String($event) : null })"
          />
        </div>

        <div class="dashboard-filter-panel__footer">
          <VBtn variant="text" color="primary" @click="emit('reset-draft')">Đặt lại</VBtn>
          <VBtn color="primary" @click="emit('apply-filters')">Áp dụng</VBtn>
        </div>
      </VCard>
    </VExpandTransition>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  searchQuery: string;
  resultCount: number;
  expanded: boolean;
  selectedFilterLabels: string[];
  groups: Array<{
    key: string;
    label: string;
    selected: string | null;
    options: Array<{
      value: string;
      label: string;
    }>;
  }>;
}>();

const emit = defineEmits<{
  "update:searchQuery": [value: string];
  "update:expanded": [value: boolean];
  "set-group": [payload: { groupKey: string; value: string | null }];
  "reset-draft": [];
  "apply-filters": [];
}>();
</script>

<style scoped>
.dashboard-filter-panel {
  display: grid;
  gap: 12px;
}

.dashboard-filter-panel__bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.dashboard-filter-panel__actions {
  display: inline-flex;
  gap: 10px;
  align-items: center;
}

.dashboard-filter-panel__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.dashboard-filter-panel__dropdown {
  padding: 18px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(12px);
}

.dashboard-filter-panel__dropdown-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.dashboard-filter-panel__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

@media (max-width: 1080px) {
  .dashboard-filter-panel__dropdown-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .dashboard-filter-panel__bar {
    grid-template-columns: 1fr;
  }

  .dashboard-filter-panel__actions {
    justify-content: space-between;
  }

  .dashboard-filter-panel__dropdown-grid {
    grid-template-columns: 1fr;
  }
}
</style>
