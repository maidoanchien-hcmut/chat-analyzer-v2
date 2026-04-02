<template>
  <VNavigationDrawer
    permanent
    :rail="sidebarCollapsed"
    :rail-width="78"
    :width="250"
    class="app-shell-drawer"
  >
    <AppSidebar
      :app-name="appName"
      :collapsed="sidebarCollapsed"
      :nav-items="navItems"
      @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
    />
  </VNavigationDrawer>

  <VAppBar color="transparent" class="app-shell-bar">
    <AppHeader :display-name="displayName" @action="handleHeaderAction" />
  </VAppBar>

  <VMain class="app-shell-main">
    <div class="app-shell-content">
      <slot />
    </div>
  </VMain>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useDisplay } from "vuetify";
import { permissionCodes } from "@/modules/auth/permissions";
import { useAuthStore } from "@/modules/auth/store";
import AppHeader from "@/shared/layouts/components/AppHeader.vue";
import AppSidebar from "@/shared/layouts/components/AppSidebar.vue";

type AppNavItem = {
  label: string;
  icon: string;
  to: {
    name: string;
  };
  matchNames: string[];
};

const router = useRouter();
const authStore = useAuthStore();
const { mdAndDown } = useDisplay();
const appName = import.meta.env.VITE_APP_NAME || "Chat analyzer";
const sidebarCollapsed = ref(false);

watch(
  mdAndDown,
  (value) => {
    sidebarCollapsed.value = value;
  },
  { immediate: true }
);

const navItems = computed<AppNavItem[]>(() => {
  const canViewBusiness = authStore.hasAllPermissions([permissionCodes.GET_DASHBOARD]);
  const canManageUsers =
    authStore.hasRole("admin") && authStore.hasAllPermissions([permissionCodes.GET_USERS]);
  const isAdmin = authStore.hasRole("admin");

  return [
    {
      label: "Dashboard",
      icon: "mdi-view-dashboard-outline",
      to: { name: "dashboard" },
      matchNames: ["dashboard"]
    },
    {
      label: "Hội thoại",
      icon: "mdi-chat-processing-outline",
      to: { name: "conversations" },
      matchNames: ["conversations", "conversation-detail"]
    },
    {
      label: "Hiệu suất",
      icon: "mdi-chart-line",
      to: { name: "performance" },
      matchNames: ["performance"]
    },
    {
      label: "Lịch sử phân tích",
      icon: "mdi-history",
      to: { name: "analysis-history" },
      matchNames: ["analysis-history"]
    },
    {
      label: "Quản lý người dùng",
      icon: "mdi-account-cog-outline",
      to: { name: "admin-accounts" },
      matchNames: ["admin-accounts"]
    },
    {
      label: "Cài đặt",
      icon: "mdi-cog-outline",
      to: { name: "settings" },
      matchNames: ["settings"]
    }
  ].filter((item) => {
    if (["dashboard", "conversations", "performance", "analysis-history"].includes(item.to.name)) {
      return canViewBusiness;
    }

    if (item.to.name === "admin-accounts") {
      return canManageUsers;
    }

    return isAdmin;
  });
});

const displayName = computed(() => {
  return authStore.currentUser?.displayName || authStore.currentUser?.identifier || "người dùng";
});

async function handleHeaderAction(value: "change-password" | "logout") {
  if (value === "change-password") {
    await router.push({ name: "change-password" });
    return;
  }

  await authStore.logout();
  await router.push({ name: "login" });
}
</script>

<style scoped>
.app-shell-drawer {
  border-right: 1px solid rgba(17, 24, 39, 0.08);
  background:
    linear-gradient(180deg, rgba(14, 116, 144, 0.08), transparent 28%),
    linear-gradient(180deg, #fffdf8 0%, #f7f3eb 100%);
}

.app-shell-bar {
  border-bottom: 1px solid rgba(17, 24, 39, 0.08);
  backdrop-filter: blur(14px);
  background: rgba(255, 252, 247, 0.88);
}

.app-shell-main {
  background:
    radial-gradient(circle at top left, rgba(15, 118, 110, 0.08), transparent 22%),
    radial-gradient(circle at top right, rgba(194, 65, 12, 0.08), transparent 24%),
    linear-gradient(180deg, #fffdf8 0%, #f4efe7 100%);
}

.app-shell-content {
  min-height: calc(100vh - 76px);
  padding: 20px;
}

@media (max-width: 960px) {
  .app-shell-content {
    padding: 14px;
  }
}
</style>
