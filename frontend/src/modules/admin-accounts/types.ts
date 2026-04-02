import type { PermissionCode } from "@/modules/auth/permissions";
import type { RoleCode } from "@/modules/auth/roles";

export type AdminUser = {
  id: number;
  identifier: string;
  displayName: string;
  email?: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  roleIds: number[];
  roleCodes: RoleCode[];
};

export type RoleSummary = {
  id: number;
  code?: RoleCode;
  name: string;
  description?: string | null;
  isActive?: boolean;
  permissionCodes?: PermissionCode[];
};

export type PermissionSummary = {
  id: number;
  code: PermissionCode;
  name: string;
  description?: string | null;
  screen?: string | null;
};

export type UsersResponse = {
  items: AdminUser[];
  count?: number;
};

export type CreateUserPayload = {
  identifier: string;
  displayName: string;
  email?: string;
  temporaryPassword: string;
  roleIds: number[];
  isActive: boolean;
};

export type UpdateUserPayload = {
  displayName?: string;
  email?: string | null;
  isActive?: boolean;
};

export type AssignRolePayload = {
  roleIds: number[];
};

export type ResetUserPasswordPayload = {
  temporaryPassword: string;
};
