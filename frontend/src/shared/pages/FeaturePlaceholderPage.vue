<template>
  <div class="feature-placeholder">
    <VCard class="feature-placeholder__card">
      <VChip color="primary" variant="tonal" size="small">
        Ngoài phạm vi refactor hiện tại
      </VChip>

      <div class="feature-placeholder__copy">
        <h1>{{ pageTitle }}</h1>
        <p>{{ pageDescription }}</p>
      </div>

      <div class="feature-placeholder__actions">
        <VBtn color="primary" :to="{ name: 'dashboard' }">Về Dashboard</VBtn>
      </div>
    </VCard>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();

const pageTitle = computed(() => route.meta.title ?? "Tính năng đang được chuẩn bị");
const pageDescription = computed(() => {
  return (
    route.meta.description ??
    "Trang này đã có vị trí trong sidebar chung, nhưng nội dung chi tiết chưa nằm trong scope triển khai lần này."
  );
});
</script>

<style scoped>
.feature-placeholder {
  display: grid;
  min-height: calc(100vh - 116px);
  place-items: center;
}

.feature-placeholder__card {
  width: min(100%, 720px);
  padding: 28px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  background: rgba(255, 255, 255, 0.84);
  backdrop-filter: blur(12px);
}

.feature-placeholder__copy {
  margin-top: 18px;
}

.feature-placeholder__copy h1 {
  margin: 0;
  font-size: clamp(1.8rem, 2.8vw, 2.4rem);
}

.feature-placeholder__copy p {
  margin: 12px 0 0;
  color: rgba(55, 65, 81, 0.82);
  line-height: 1.6;
}

.feature-placeholder__actions {
  margin-top: 24px;
}
</style>
