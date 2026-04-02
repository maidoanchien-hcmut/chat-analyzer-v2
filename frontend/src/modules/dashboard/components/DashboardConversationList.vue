<template>
  <VCard class="dashboard-conversation-list">
    <div class="dashboard-conversation-list__head">
      <div>
        <p>Hội thoại gần đây</p>
        <h2>{{ visibleCount }}/{{ totalCount }} hội thoại</h2>
      </div>
    </div>

    <div class="dashboard-conversation-list__body">
      <div class="dashboard-conversation-list__columns">
        <span>Khách hàng</span>
        <span>Nhu cầu</span>
        <span>Nhân viên</span>
        <span>Thời gian</span>
      </div>

      <RouterLink
        v-for="conversation in conversations"
        :key="conversation.id"
        :to="{ name: 'conversation-detail', params: { conversationId: conversation.id } }"
        class="dashboard-conversation-list__item"
      >
        <strong>{{ conversation.customerName }}</strong>
        <span>{{ conversation.primaryNeed }}</span>
        <span>{{ conversation.staffName }}</span>
        <span>{{ formatDateTime(conversation.occurredAt) }}</span>
      </RouterLink>

      <div v-if="conversations.length === 0" class="dashboard-conversation-list__empty">
        Không có hội thoại phù hợp với bộ lọc hiện tại.
      </div>
    </div>
  </VCard>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import type { DashboardConversation } from "@/modules/dashboard/types";
import { formatDateTime } from "@/modules/dashboard/utils";

defineProps<{
  conversations: DashboardConversation[];
  visibleCount: number;
  totalCount: number;
}>();
</script>

<style scoped>
.dashboard-conversation-list {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 14px;
  height: 100%;
  padding: 18px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(12px);
}

.dashboard-conversation-list__head p,
.dashboard-conversation-list__head h2 {
  margin: 0;
}

.dashboard-conversation-list__head p {
  color: rgba(55, 65, 81, 0.8);
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.dashboard-conversation-list__head h2 {
  margin-top: 8px;
  font-size: 1.2rem;
}

.dashboard-conversation-list__body {
  display: grid;
  align-content: start;
  gap: 8px;
  max-height: 560px;
  overflow: auto;
}

.dashboard-conversation-list__columns,
.dashboard-conversation-list__item {
  display: grid;
  grid-template-columns: minmax(180px, 1.2fr) minmax(120px, 1fr) minmax(100px, 0.8fr) auto;
  gap: 12px;
  align-items: center;
}

.dashboard-conversation-list__columns {
  padding: 0 12px 4px;
  color: rgba(75, 85, 99, 0.78);
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.dashboard-conversation-list__item {
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid rgba(17, 24, 39, 0.06);
  border-radius: 16px;
  background: rgba(250, 248, 243, 0.98);
  transition: background 160ms ease, border-color 160ms ease;
}

.dashboard-conversation-list__item:hover {
  border-color: rgba(15, 118, 110, 0.22);
  background: rgba(244, 250, 248, 0.98);
}

.dashboard-conversation-list__item strong,
.dashboard-conversation-list__item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-conversation-list__item span {
  color: rgba(75, 85, 99, 0.86);
  font-size: 0.9rem;
}

.dashboard-conversation-list__empty {
  display: grid;
  place-items: center;
  min-height: 180px;
  border: 1px dashed rgba(17, 24, 39, 0.16);
  border-radius: 20px;
  color: rgba(75, 85, 99, 0.82);
}

@media (max-width: 900px) {
  .dashboard-conversation-list__columns {
    display: none;
  }

  .dashboard-conversation-list__item {
    grid-template-columns: 1fr;
    gap: 4px;
    min-height: auto;
    padding: 12px;
  }
}
</style>
