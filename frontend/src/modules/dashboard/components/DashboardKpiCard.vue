<template>
  <VCard class="dashboard-kpi-card" :class="`dashboard-kpi-card--${tone}`">
    <div class="dashboard-kpi-card__icon">
      <VIcon :icon="icon" />
    </div>

    <div class="dashboard-kpi-card__content">
      <p>{{ label }}</p>
      <strong>{{ value }}</strong>
      <span>{{ helper }}</span>
    </div>
  </VCard>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    value: string;
    helper: string;
    icon: string;
    tone?: "primary" | "accent" | "neutral";
  }>(),
  {
    tone: "neutral"
  }
);
</script>

<style scoped>
.dashboard-kpi-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px;
  min-height: 118px;
  padding: 18px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  background: rgba(255, 255, 255, 0.84);
  backdrop-filter: blur(12px);
}

.dashboard-kpi-card__icon {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  color: #ffffff;
  background: linear-gradient(135deg, #0f766e 0%, #155e75 100%);
}

.dashboard-kpi-card__content {
  display: grid;
  gap: 6px;
  align-content: start;
}

.dashboard-kpi-card__content p,
.dashboard-kpi-card__content span {
  margin: 0;
}

.dashboard-kpi-card__content p {
  color: rgba(55, 65, 81, 0.8);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.dashboard-kpi-card__content strong {
  font-size: clamp(1.4rem, 2vw, 2rem);
  line-height: 1;
}

.dashboard-kpi-card__content span {
  color: rgba(75, 85, 99, 0.82);
  font-size: 0.84rem;
}

.dashboard-kpi-card--accent .dashboard-kpi-card__icon {
  background: linear-gradient(135deg, #c2410c 0%, #ea580c 100%);
}

.dashboard-kpi-card--neutral .dashboard-kpi-card__icon {
  background: linear-gradient(135deg, #475569 0%, #334155 100%);
}
</style>
