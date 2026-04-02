<template>
  <div ref="pickerRef" class="dashboard-range-picker">
    <VBtn
      variant="outlined"
      color="primary"
      class="dashboard-range-picker__trigger"
      prepend-icon="mdi-calendar-range"
      @click="toggleOpen"
    >
      {{ displayRange }}
    </VBtn>

    <VCard v-if="isOpen" class="dashboard-range-picker__menu">
      <div class="dashboard-range-picker__menu-grid">
        <aside class="dashboard-range-picker__presets">
          <button
            v-for="preset in presets"
            :key="preset.key"
            type="button"
            class="dashboard-range-picker__preset"
            :class="{ 'dashboard-range-picker__preset-active': activePresetKey === preset.key }"
            @click="applyPreset(preset.key)"
          >
            {{ preset.label }}
          </button>
        </aside>

        <section class="dashboard-range-picker__calendars">
          <div class="dashboard-range-picker__toolbar">
            <div>
              <p>Khoảng thời gian đang xem</p>
              <strong>{{ displayRange }}</strong>
            </div>
            <div class="dashboard-range-picker__nav">
              <VBtn icon size="small" variant="text" @click="shiftMonth(-1)">
                <VIcon icon="mdi-chevron-left" />
              </VBtn>
              <VBtn icon size="small" variant="text" @click="shiftMonth(1)">
                <VIcon icon="mdi-chevron-right" />
              </VBtn>
            </div>
          </div>

          <div class="dashboard-range-picker__calendar-grid">
            <article v-for="month in visibleMonths" :key="month.key" class="dashboard-range-picker__month">
              <div class="dashboard-range-picker__month-head">{{ month.label }}</div>
              <div class="dashboard-range-picker__weekday-row">
                <span v-for="weekday in weekdays" :key="weekday">{{ weekday }}</span>
              </div>
              <div class="dashboard-range-picker__day-grid">
                <button
                  v-for="day in month.days"
                  :key="day.key"
                  type="button"
                  class="dashboard-range-picker__day"
                  :class="{
                    'dashboard-range-picker__day-outside': !day.isCurrentMonth,
                    'dashboard-range-picker__day-selected': day.isEdge,
                    'dashboard-range-picker__day-in-range': day.isInRange
                  }"
                  @click="selectDate(day.iso)"
                >
                  {{ day.label }}
                </button>
              </div>
            </article>
          </div>
        </section>
      </div>
    </VCard>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { DashboardDatePresetKey, DashboardDateRange } from "@/modules/dashboard/types";
import {
  addDays,
  addMonths,
  formatDateRange,
  formatIsoDate,
  getPresetRange,
  parseIsoDate,
  startOfMonth,
  startOfWeek
} from "@/modules/dashboard/utils";

const props = defineProps<{
  modelValue: DashboardDateRange;
  today: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: DashboardDateRange];
}>();

const pickerRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const pickingStart = ref(true);
const anchorMonth = ref(startOfMonth(parseIsoDate(props.modelValue.start)));

const presets: Array<{ key: DashboardDatePresetKey; label: string }> = [
  { key: "1d", label: "1 ngày" },
  { key: "1w", label: "1 tuần" },
  { key: "1m", label: "1 tháng" },
  { key: "1q", label: "1 quý" },
  { key: "1y", label: "1 năm" }
];

const weekdays = ["Th 2", "Th 3", "Th 4", "Th 5", "Th 6", "Th 7", "CN"];

const displayRange = computed(() => formatDateRange(props.modelValue));

const activePresetKey = computed(() => {
  return (
    presets.find((preset) => {
      const value = getPresetRange(preset.key, props.today);
      return value.start === props.modelValue.start && value.end === props.modelValue.end;
    })?.key ?? null
  );
});

const visibleMonths = computed(() => {
  return [0, 1].map((offset) => {
    const monthDate = addMonths(anchorMonth.value, offset);
    return {
      key: `${monthDate.getFullYear()}-${monthDate.getMonth() + 1}`,
      label: monthDate.toLocaleDateString("vi-VN", {
        month: "long",
        year: "numeric"
      }),
      days: buildMonthDays(monthDate)
    };
  });
});

watch(
  () => props.modelValue.start,
  (value) => {
    anchorMonth.value = startOfMonth(parseIsoDate(value));
  }
);

onMounted(() => {
  document.addEventListener("click", handleDocumentClick);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", handleDocumentClick);
});

function toggleOpen() {
  isOpen.value = !isOpen.value;
  pickingStart.value = true;
  anchorMonth.value = startOfMonth(parseIsoDate(props.modelValue.start));
}

function shiftMonth(direction: number) {
  anchorMonth.value = addMonths(anchorMonth.value, direction);
}

function applyPreset(key: DashboardDatePresetKey) {
  emit("update:modelValue", getPresetRange(key, props.today));
  isOpen.value = false;
  pickingStart.value = true;
}

function selectDate(iso: string) {
  const selectedDate = parseIsoDate(iso);
  const currentStart = parseIsoDate(props.modelValue.start);

  if (pickingStart.value) {
    emit("update:modelValue", {
      start: iso,
      end: iso
    });
    pickingStart.value = false;
    return;
  }

  emit("update:modelValue", {
    start: formatIsoDate(selectedDate < currentStart ? selectedDate : currentStart),
    end: formatIsoDate(selectedDate < currentStart ? currentStart : selectedDate)
  });
  isOpen.value = false;
  pickingStart.value = true;
}

function buildMonthDays(monthDate: Date) {
  const firstDay = startOfMonth(monthDate);
  const gridStart = startOfWeek(firstDay);
  const rangeStart = parseIsoDate(props.modelValue.start);
  const rangeEnd = parseIsoDate(props.modelValue.end);

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    const iso = formatIsoDate(date);
    const isEdge = iso === props.modelValue.start || iso === props.modelValue.end;
    const isInRange = date >= rangeStart && date <= rangeEnd;

    return {
      key: iso,
      iso,
      label: date.getDate(),
      isCurrentMonth: date.getMonth() === monthDate.getMonth(),
      isEdge,
      isInRange
    };
  });
}

function handleDocumentClick(event: MouseEvent) {
  if (!pickerRef.value) {
    return;
  }

  if (event.target instanceof Node && !pickerRef.value.contains(event.target)) {
    isOpen.value = false;
    pickingStart.value = true;
  }
}
</script>

<style scoped>
.dashboard-range-picker {
  position: relative;
}

.dashboard-range-picker__trigger {
  min-width: 260px;
  justify-content: flex-start;
  padding-inline: 14px;
  font-weight: 700;
}

.dashboard-range-picker__menu {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 20;
  width: min(920px, calc(100vw - 132px));
  padding: 14px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(18px);
}

.dashboard-range-picker__menu-grid {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 16px;
}

.dashboard-range-picker__presets {
  display: grid;
  gap: 8px;
  padding: 4px;
  border-radius: 20px;
  background: rgba(15, 118, 110, 0.06);
}

.dashboard-range-picker__preset {
  min-height: 42px;
  padding: 0 14px;
  color: #1f2937;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 14px;
}

.dashboard-range-picker__preset-active {
  color: #0f766e;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 22px rgba(15, 118, 110, 0.12);
}

.dashboard-range-picker__calendars {
  display: grid;
  gap: 14px;
}

.dashboard-range-picker__toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.dashboard-range-picker__toolbar p,
.dashboard-range-picker__toolbar strong {
  margin: 0;
}

.dashboard-range-picker__toolbar p {
  color: rgba(55, 65, 81, 0.78);
  font-size: 0.82rem;
}

.dashboard-range-picker__nav {
  display: inline-flex;
  gap: 4px;
}

.dashboard-range-picker__calendar-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.dashboard-range-picker__month {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 20px;
  background: rgba(246, 244, 239, 0.92);
}

.dashboard-range-picker__month-head {
  font-weight: 800;
  text-transform: capitalize;
}

.dashboard-range-picker__weekday-row,
.dashboard-range-picker__day-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}

.dashboard-range-picker__weekday-row span {
  color: rgba(75, 85, 99, 0.76);
  font-size: 0.74rem;
  text-align: center;
}

.dashboard-range-picker__day {
  aspect-ratio: 1;
  border: 0;
  border-radius: 12px;
  color: #111827;
  background: transparent;
}

.dashboard-range-picker__day-outside {
  color: rgba(107, 114, 128, 0.5);
}

.dashboard-range-picker__day-in-range {
  background: rgba(15, 118, 110, 0.1);
}

.dashboard-range-picker__day-selected {
  color: #ffffff;
  background: linear-gradient(135deg, #0f766e 0%, #155e75 100%);
}

@media (max-width: 1080px) {
  .dashboard-range-picker__menu {
    width: min(920px, calc(100vw - 28px));
    right: auto;
    left: 0;
  }

  .dashboard-range-picker__menu-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 820px) {
  .dashboard-range-picker__trigger {
    width: 100%;
    min-width: 0;
  }

  .dashboard-range-picker__calendar-grid {
    grid-template-columns: 1fr;
  }
}
</style>
