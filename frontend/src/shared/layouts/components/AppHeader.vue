<template>
  <div class="app-header">
    <p class="app-header__greeting">Xin chào {{ displayName }}</p>

    <VMenu location="bottom end" offset="10">
      <template #activator="{ props: menuProps }">
        <VBtn v-bind="menuProps" icon variant="text" class="app-header__user-trigger">
          <VIcon icon="mdi-account-circle-outline" />
        </VBtn>
      </template>

      <VList min-width="180" class="app-header__menu">
        <VListItem
          prepend-icon="mdi-lock-reset"
          title="Đổi mật khẩu"
          @click="emitAction('change-password')"
        />
        <VListItem prepend-icon="mdi-logout" title="Đăng xuất" @click="emitAction('logout')" />
      </VList>
    </VMenu>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  displayName: string;
}>();

const emit = defineEmits<{
  action: [value: "change-password" | "logout"];
}>();

function emitAction(value: "change-password" | "logout") {
  emit("action", value);
}
</script>

<style scoped>
.app-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 20px;
}

.app-header__greeting {
  margin: 0;
  color: #111827;
  font-size: clamp(1rem, 1.4vw, 1.12rem);
  font-weight: 800;
}

.app-header__user-trigger {
  color: #374151;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(17, 24, 39, 0.08);
}

.app-header__menu {
  padding: 6px;
}

@media (max-width: 960px) {
  .app-header {
    padding: 0 14px;
  }
}
</style>
