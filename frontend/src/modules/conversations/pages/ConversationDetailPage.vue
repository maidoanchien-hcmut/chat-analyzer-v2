<template>
  <div class="conversation-detail-page">
    <VBtn variant="text" prepend-icon="mdi-arrow-left" :to="{ name: 'dashboard' }">
      Quay lại Dashboard
    </VBtn>

    <VCard v-if="conversation" class="conversation-detail-page__card">
      <div class="conversation-detail-page__head">
        <div>
          <h1>{{ conversation.customerName }}</h1>
          <p>{{ sourceLabel }} · {{ formatDateTime(conversation.occurredAt) }}</p>
        </div>
        <VChip color="primary" variant="tonal">{{ conversation.staffName }}</VChip>
      </div>

      <div class="conversation-detail-page__chips">
        <VChip size="small" variant="outlined">
          {{ formatInboxStatusLabel(conversation.inboxStatus) }}
        </VChip>
        <VChip size="small" variant="outlined">
          {{ formatRevisitStatusLabel(conversation.revisitStatus) }}
        </VChip>
        <VChip size="small" variant="outlined">{{ conversation.primaryNeed }}</VChip>
        <VChip size="small" variant="outlined">
          {{ formatSentimentLabel(conversation.sentiment) }}
        </VChip>
        <VChip size="small" variant="outlined">
          {{ formatClosingOutcomeLabel(conversation.closingOutcome) }}
        </VChip>
        <VChip v-if="conversation.warningCount > 0" size="small" color="warning" variant="tonal">
          {{ conversation.warningCount }} cảnh báo
        </VChip>
      </div>

      <VDivider />

      <div class="conversation-detail-page__body">
        <section>
          <h2>Tóm tắt hội thoại</h2>
          <p>{{ conversation.summary }}</p>
        </section>

        <section>
          <h2>Mock data hiện có</h2>
          <ul>
            <li>Chi phí AI: {{ formatCurrency(conversation.aiCost) }}</li>
            <li>Trang nguồn: {{ sourceLabel }}</li>
            <li>Route detail này chỉ để đảm bảo click từ dashboard hoạt động đúng.</li>
          </ul>
        </section>
      </div>
    </VCard>

    <VCard v-else class="conversation-detail-page__card">
      <h1>Không tìm thấy hội thoại</h1>
      <p>ID mock này không tồn tại trong dataset dashboard hiện tại.</p>
    </VCard>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { dashboardConversations, dashboardSourceOptions } from "@/modules/dashboard/mock-data";
import {
  formatClosingOutcomeLabel,
  formatCurrency,
  formatDateTime,
  formatInboxStatusLabel,
  formatRevisitStatusLabel,
  formatSentimentLabel
} from "@/modules/dashboard/utils";

const route = useRoute();

const conversation = computed(() => {
  return dashboardConversations.find((item) => item.id === route.params.conversationId);
});

const sourceLabel = computed(() => {
  if (!conversation.value) {
    return "Không xác định";
  }

  return (
    dashboardSourceOptions.find((source) => source.id === conversation.value?.sourceId)?.label ??
    "Không xác định"
  );
});
</script>

<style scoped>
.conversation-detail-page {
  display: grid;
  gap: 14px;
}

.conversation-detail-page__card {
  display: grid;
  gap: 18px;
  padding: 24px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
}

.conversation-detail-page__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.conversation-detail-page__head h1,
.conversation-detail-page__head p,
.conversation-detail-page__body h2,
.conversation-detail-page__body p {
  margin: 0;
}

.conversation-detail-page__head p {
  margin-top: 8px;
  color: rgba(75, 85, 99, 0.82);
}

.conversation-detail-page__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.conversation-detail-page__body {
  display: grid;
  gap: 18px;
}

.conversation-detail-page__body section {
  display: grid;
  gap: 10px;
}

.conversation-detail-page__body ul {
  margin: 0;
  padding-left: 18px;
  color: rgba(55, 65, 81, 0.9);
}

@media (max-width: 900px) {
  .conversation-detail-page__head {
    display: grid;
  }
}
</style>
