import { apiRequest } from "@/shared/api/http";
import type {
  AuthLoginPayload,
  AuthLoginResponse,
  ChangePasswordResponse,
  AuthMeResponse,
  AuthRefreshResponse,
  ChangePasswordPayload
} from "./types";

export const authApi = {
  login(payload: AuthLoginPayload) {
    return apiRequest<AuthLoginResponse>("/auth/login", {
      method: "POST",
      data: payload
    });
  },

  refresh() {
    return apiRequest<AuthRefreshResponse>("/auth/refresh", {
      method: "POST"
    });
  },

  logout(token: string | null) {
    return apiRequest<void>("/auth/logout", {
      method: "POST",
      token
    });
  },

  logoutAll(token: string | null) {
    return apiRequest<void>("/auth/logout-all", {
      method: "POST",
      token
    });
  },

  changePassword(payload: ChangePasswordPayload, token: string) {
    return apiRequest<ChangePasswordResponse>("/auth/change-password", {
      method: "POST",
      token,
      data: {
        currentPassword: payload.currentPassword,
        newPassword: payload.newPassword
      }
    });
  },

  getMe(token: string) {
    return apiRequest<AuthMeResponse>("/auth/me", {
      token
    });
  }
};
