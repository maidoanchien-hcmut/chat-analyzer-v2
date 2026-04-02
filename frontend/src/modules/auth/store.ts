import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { PermissionCode } from "./permissions";
import type { RoleCode } from "./roles";
import { authApi } from "./api";
import type {
  AuthLoginPayload,
  AuthMeResponse,
  AuthUserSummary,
  ChangePasswordPayload,
  PlatformSummary
} from "./types";

export const useAuthStore = defineStore("auth", () => {
  const accessToken = ref<string | null>(null);
  const currentUser = ref<AuthUserSummary | null>(null);
  const currentPlatform = ref<PlatformSummary | null>(null);
  const roleIds = ref<number[]>([]);
  const roleCodes = ref<RoleCode[]>([]);
  const permissions = ref<PermissionCode[]>([]);
  const initialized = ref(false);
  const initializing = ref(false);
  const pending = ref(false);
  const lastError = ref<string | null>(null);

  const isAuthenticated = computed(() => Boolean(accessToken.value && currentUser.value));
  const mustChangePassword = computed(() => currentUser.value?.mustChangePassword ?? false);

  function applyProfile(profile: AuthMeResponse) {
    currentUser.value = profile.user;
    currentPlatform.value = profile.platform;
    roleIds.value = profile.roleIds;
    roleCodes.value = profile.roleCodes;
    permissions.value = profile.permissions;
  }

  function clearSession() {
    accessToken.value = null;
    currentUser.value = null;
    currentPlatform.value = null;
    roleIds.value = [];
    roleCodes.value = [];
    permissions.value = [];
  }

  async function hydrateProfile(token: string) {
    const profile = await authApi.getMe(token);
    applyProfile(profile);
  }

  async function initializeSession() {
    if (initialized.value || initializing.value) {
      return;
    }

    initializing.value = true;
    lastError.value = null;

    try {
      const response = await authApi.refresh();
      accessToken.value = response.accessToken;

      if (response.profile) {
        applyProfile(response.profile);
      } else {
        await hydrateProfile(response.accessToken);
      }
    } catch {
      clearSession();
    } finally {
      initialized.value = true;
      initializing.value = false;
    }
  }

  async function login(payload: AuthLoginPayload) {
    pending.value = true;
    lastError.value = null;

    try {
      const response = await authApi.login(payload);
      accessToken.value = response.accessToken;

      if (response.profile) {
        applyProfile(response.profile);
      } else {
        await hydrateProfile(response.accessToken);
      }

      initialized.value = true;
    } catch (error) {
      clearSession();
      initialized.value = true;
      lastError.value = error instanceof Error ? error.message : "Đăng nhập thất bại.";
      throw error;
    } finally {
      pending.value = false;
    }
  }

  async function logout() {
    const token = accessToken.value;

    try {
      await authApi.logout(token);
    } finally {
      clearSession();
      initialized.value = true;
    }
  }

  async function logoutAll() {
    const token = accessToken.value;

    try {
      await authApi.logoutAll(token);
    } finally {
      clearSession();
      initialized.value = true;
    }
  }

  async function changePassword(payload: ChangePasswordPayload) {
    if (!accessToken.value) {
      throw new Error("Phien dang nhap khong hop le.");
    }

    if (payload.confirmPassword && payload.confirmPassword !== payload.newPassword) {
      throw new Error("Mat khau xac nhan khong khop.");
    }

    pending.value = true;
    lastError.value = null;

    try {
      const response = await authApi.changePassword(payload, accessToken.value);
      accessToken.value = response.accessToken;

      if (response.profile) {
        applyProfile(response.profile);
      } else {
        await hydrateProfile(response.accessToken);
      }
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : "Đổi mật khẩu thất bại.";
      throw error;
    } finally {
      pending.value = false;
    }
  }

  function hasRole(role: RoleCode) {
    return roleCodes.value.includes(role);
  }

  function hasAnyPermission(required: PermissionCode[]) {
    return required.some((permission) => permissions.value.includes(permission));
  }

  function hasAllPermissions(required: PermissionCode[]) {
    return required.every((permission) => permissions.value.includes(permission));
  }

  return {
    accessToken,
    currentUser,
    currentPlatform,
    roleIds,
    roleCodes,
    permissions,
    initialized,
    initializing,
    pending,
    lastError,
    isAuthenticated,
    mustChangePassword,
    initializeSession,
    login,
    logout,
    logoutAll,
    changePassword,
    hasRole,
    hasAnyPermission,
    hasAllPermissions
  };
});
