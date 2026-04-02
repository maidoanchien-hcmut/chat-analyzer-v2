import type { PermissionCode } from "./permissions";
import type { RoleCode } from "./roles";

export type PlatformSummary = {
  id: number;
  code?: string;
  name: string;
  brandName?: string | null;
};

export type AuthUserSummary = {
  id: number;
  identifier: string;
  displayName: string;
  email?: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
};

export type AuthMeResponse = {
  user: AuthUserSummary;
  platform: PlatformSummary;
  roleIds: number[];
  roleCodes: RoleCode[];
  permissions: PermissionCode[];
};

export type AuthLoginPayload = {
  identifier: string;
  password: string;
};

export type AuthLoginResponse = {
  accessToken: string;
  profile?: AuthMeResponse;
};

export type AuthRefreshResponse = {
  accessToken: string;
  profile?: AuthMeResponse;
};

export type ChangePasswordPayload = {
  currentPassword: string;
  newPassword: string;
  confirmPassword?: string;
};

export type ChangePasswordResponse = AuthRefreshResponse;
