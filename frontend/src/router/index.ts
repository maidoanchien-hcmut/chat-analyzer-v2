import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import AccountsPage from "@/modules/admin-accounts/pages/AccountsPage.vue";
import ChangePasswordPage from "@/modules/auth/pages/ChangePasswordPage.vue";
import LoginPage from "@/modules/auth/pages/LoginPage.vue";
import ConversationDetailPage from "@/modules/conversations/pages/ConversationDetailPage.vue";
import DashboardPage from "@/modules/dashboard/pages/DashboardPage.vue";
import { permissionCodes } from "@/modules/auth/permissions";
import { useAuthStore } from "@/modules/auth/store";
import ForbiddenPage from "@/shared/pages/ForbiddenPage.vue";
import FeaturePlaceholderPage from "@/shared/pages/FeaturePlaceholderPage.vue";
import NotFoundPage from "@/shared/pages/NotFoundPage.vue";

const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "login",
    component: LoginPage,
    meta: {
      title: "Đăng nhập",
      layout: "auth",
      guestOnly: true
    }
  },
  {
    path: "/change-password",
    name: "change-password",
    component: ChangePasswordPage,
    meta: {
      title: "Đổi mật khẩu",
      requiresAuth: true
    }
  },
  {
    path: "/",
    redirect: {
      name: "dashboard"
    }
  },
  {
    path: "/dashboard",
    name: "dashboard",
    component: DashboardPage,
    meta: {
      title: "Dashboard",
      requiresAuth: true,
      permissions: [permissionCodes.GET_DASHBOARD]
    }
  },
  {
    path: "/conversations",
    name: "conversations",
    component: FeaturePlaceholderPage,
    meta: {
      title: "Hội thoại",
      description:
        "Danh sách hội thoại đầy đủ chưa nằm trong scope này. Dashboard vẫn dẫn được vào mock detail của từng hội thoại.",
      requiresAuth: true,
      permissions: [permissionCodes.GET_DASHBOARD]
    }
  },
  {
    path: "/conversations/:conversationId",
    name: "conversation-detail",
    component: ConversationDetailPage,
    meta: {
      title: "Hội thoại",
      description: "Mock detail cho một hội thoại được mở từ dashboard.",
      requiresAuth: true,
      permissions: [permissionCodes.GET_DASHBOARD]
    }
  },
  {
    path: "/performance",
    name: "performance",
    component: FeaturePlaceholderPage,
    meta: {
      title: "Hiệu suất",
      description: "Trang hiệu suất chưa nằm trong phạm vi refactor lần này.",
      requiresAuth: true,
      permissions: [permissionCodes.GET_DASHBOARD]
    }
  },
  {
    path: "/analysis-history",
    name: "analysis-history",
    component: FeaturePlaceholderPage,
    meta: {
      title: "Lịch sử phân tích",
      description: "Trang lịch sử phân tích chưa nằm trong phạm vi refactor lần này.",
      requiresAuth: true,
      permissions: [permissionCodes.GET_DASHBOARD]
    }
  },
  {
    path: "/admin/users",
    name: "admin-accounts",
    component: AccountsPage,
    meta: {
      title: "Quản lý người dùng",
      requiresAuth: true,
      requiresAdmin: true,
      permissions: [permissionCodes.GET_USERS]
    }
  },
  {
    path: "/admin/settings",
    name: "settings",
    component: FeaturePlaceholderPage,
    meta: {
      title: "Cài đặt",
      description: "Trang cài đặt admin chưa nằm trong phạm vi refactor lần này.",
      requiresAuth: true,
      requiresAdmin: true
    }
  },
  {
    path: "/forbidden",
    name: "forbidden",
    component: ForbiddenPage,
    meta: {
      title: "Không có quyền",
      requiresAuth: true
    }
  },
  {
    path: "/:pathMatch(.*)*",
    name: "not-found",
    component: NotFoundPage,
    meta: {
      title: "Không tìm thấy",
      layout: "auth"
    }
  }
];

export const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();

  if (!authStore.initialized && !authStore.initializing) {
    await authStore.initializeSession();
  }

  if (to.meta.guestOnly && authStore.isAuthenticated) {
    return authStore.mustChangePassword
      ? { name: "change-password" }
      : { name: "dashboard" };
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return {
      name: "login",
      query: {
        redirect: to.fullPath
      }
    };
  }

  if (authStore.mustChangePassword && to.name !== "change-password") {
    return {
      name: "change-password"
    };
  }

  if (to.meta.requiresAdmin && !authStore.hasRole("admin")) {
    return {
      name: "forbidden"
    };
  }

  if (to.meta.permissions && !authStore.hasAllPermissions(to.meta.permissions)) {
    return {
      name: "forbidden"
    };
  }

  return true;
});

router.afterEach((to) => {
  const appName = import.meta.env.VITE_APP_NAME || "Chat analyzer";
  document.title = to.meta.title ? `${to.meta.title} | ${appName}` : appName;
});
