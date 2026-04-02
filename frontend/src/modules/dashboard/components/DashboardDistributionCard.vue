<template>
  <VCard class="dashboard-distribution-card">
    <div class="dashboard-distribution-card__head">
      <div>
        <p>Phân bố hội thoại</p>
        <h2>{{ currentDimensionLabel }}</h2>
      </div>

      <VSelect
        :model-value="selectedDimension"
        :items="dimensionOptions"
        item-title="label"
        item-value="value"
        label="Chiều hiển thị"
        hide-details
        density="comfortable"
        class="dashboard-distribution-card__dimension-select"
        @update:model-value="emit('update:selectedDimension', String($event ?? ''))"
      />
    </div>

    <div v-if="segments.length > 0" class="dashboard-distribution-card__body">
      <div class="dashboard-distribution-card__chart-wrap">
        <svg viewBox="0 0 180 180" class="dashboard-distribution-card__chart" aria-hidden="true">
          <circle class="dashboard-distribution-card__track" cx="90" cy="90" r="58" />
          <circle
            v-for="segment in chartSegments"
            :key="segment.label"
            class="dashboard-distribution-card__segment"
            cx="90"
            cy="90"
            r="58"
            :stroke="segment.color"
            :stroke-dasharray="`${segment.length} ${circumference - segment.length}`"
            :stroke-dashoffset="`${-segment.offset}`"
          />
        </svg>

        <div class="dashboard-distribution-card__center">
          <strong>{{ totalCount }}</strong>
          <span>hội thoại</span>
        </div>
      </div>

      <div class="dashboard-distribution-card__legend">
        <div
          v-for="segment in segments"
          :key="segment.label"
          class="dashboard-distribution-card__legend-item"
        >
          <div class="dashboard-distribution-card__legend-line">
            <span
              class="dashboard-distribution-card__legend-dot"
              :style="{ backgroundColor: segment.color }"
            ></span>
            <strong>{{ segment.label }}</strong>
          </div>
          <span>{{ segment.count }} · {{ segment.share }}</span>
        </div>
      </div>
    </div>

    <div v-else class="dashboard-distribution-card__empty">
      Chưa có dữ liệu để dựng biểu đồ cho tập hội thoại hiện tại.
    </div>
  </VCard>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  selectedDimension: string;
  dimensionOptions: Array<{
    value: string;
    label: string;
  }>;
  currentDimensionLabel: string;
  segments: Array<{
    label: string;
    count: number;
    share: string;
    color: string;
  }>;
  totalCount: number;
}>();

const emit = defineEmits<{
  "update:selectedDimension": [value: string];
}>();

const circumference = 2 * Math.PI * 58;

const chartSegments = computed(() => {
  let offset = 0;

  return props.segments.map((segment) => {
    const ratio = props.totalCount > 0 ? segment.count / props.totalCount : 0;
    const length = ratio * circumference;
    const current = {
      ...segment,
      length,
      offset
    };

    offset += length;
    return current;
  });
});
</script>

<style scoped>
.dashboard-distribution-card {
  display: grid;
  gap: 18px;
  height: 100%;
  padding: 18px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(12px);
}

.dashboard-distribution-card__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.dashboard-distribution-card__head p,
.dashboard-distribution-card__head h2 {
  margin: 0;
}

.dashboard-distribution-card__head p {
  color: rgba(55, 65, 81, 0.8);
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.dashboard-distribution-card__head h2 {
  margin-top: 8px;
  font-size: 1.16rem;
}

.dashboard-distribution-card__dimension-select {
  width: 220px;
  min-width: 220px;
}

.dashboard-distribution-card__body {
  display: grid;
  gap: 18px;
}

.dashboard-distribution-card__chart-wrap {
  position: relative;
  width: 180px;
  height: 180px;
  margin-inline: auto;
}

.dashboard-distribution-card__chart {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.dashboard-distribution-card__track,
.dashboard-distribution-card__segment {
  fill: none;
  stroke-width: 18;
}

.dashboard-distribution-card__track {
  stroke: rgba(226, 232, 240, 0.95);
}

.dashboard-distribution-card__center {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  text-align: center;
}

.dashboard-distribution-card__center strong {
  font-size: 1.8rem;
  line-height: 1;
}

.dashboard-distribution-card__center span {
  color: rgba(75, 85, 99, 0.78);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.dashboard-distribution-card__legend {
  display: grid;
  gap: 10px;
}

.dashboard-distribution-card__legend-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 16px;
  background: rgba(250, 248, 243, 0.98);
}

.dashboard-distribution-card__legend-line {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.dashboard-distribution-card__legend-dot {
  width: 11px;
  height: 11px;
  border-radius: 999px;
}

.dashboard-distribution-card__empty {
  display: grid;
  place-items: center;
  min-height: 260px;
  border: 1px dashed rgba(17, 24, 39, 0.14);
  border-radius: 20px;
  color: rgba(75, 85, 99, 0.82);
  text-align: center;
}

@media (max-width: 1180px) {
  .dashboard-distribution-card__head {
    display: grid;
  }

  .dashboard-distribution-card__dimension-select {
    width: 100%;
    min-width: 0;
  }
}
</style>
