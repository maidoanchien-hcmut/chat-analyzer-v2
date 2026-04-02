import { apiRequest } from "@/shared/api/http";
import type {
  AdminUser,
  AssignRolePayload,
  CreateUserPayload,
  PermissionSummary,
  ResetUserPasswordPayload,
  RoleSummary,
  UpdateUserPayload,
  UsersResponse
} from "./types";

export const adminAccountsApi = {
  getUsers(token: string) {
    return apiRequest<UsersResponse>("/admin/users", {
      token
    });
  },

  getRoles(token: string) {
    return apiRequest<RoleSummary[]>("/admin/roles", {
      token
    });
  },

  getPermissions(token: string) {
    return apiRequest<PermissionSummary[]>("/admin/permissions", {
      token
    });
  },

  createUser(token: string, payload: CreateUserPayload) {
    return apiRequest<AdminUser>("/admin/users", {
      method: "POST",
      token,
      data: payload
    });
  },

  updateUser(token: string, userId: number, payload: UpdateUserPayload) {
    return apiRequest<AdminUser>(`/admin/users/${userId}`, {
      method: "PATCH",
      token,
      data: payload
    });
  },

  assignRole(token: string, userId: number, payload: AssignRolePayload) {
    return apiRequest<AdminUser>(`/admin/users/${userId}/roles`, {
      method: "PUT",
      token,
      data: payload
    });
  },

  resetPassword(token: string, userId: number, payload: ResetUserPasswordPayload) {
    return apiRequest<{ message: string }>(`/admin/users/${userId}/reset-password`, {
      method: "POST",
      token,
      data: payload
    });
  }
};
