import type { PermissionCode, RoleCode } from "../authz/permissions.ts";

export type AuthUserProfile = {
  id: number;
  identifier: string;
  displayName: string;
  email: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
};

export type PlatformProfile = {
  id: number;
  code: string;
  name: string;
  brandName: string | null;
};

export type AuthMeResponse = {
  user: AuthUserProfile;
  platform: PlatformProfile;
  roleIds: number[];
  roleCodes: RoleCode[];
  permissions: PermissionCode[];
};

export type AuthTokenResponse = {
  accessToken: string;
  profile: AuthMeResponse;
};

export type LoginPayload = {
  identifier: string;
  password: string;
};

export type ChangePasswordPayload = {
  currentPassword: string;
  newPassword: string;
};

export type RequestMetadata = {
  ipAddress: string | null;
  userAgent: string | null;
  origin: string | null;
};

