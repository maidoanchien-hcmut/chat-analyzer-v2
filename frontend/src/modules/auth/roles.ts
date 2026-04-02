export const roleCodes = {
  ADMIN: "admin",
  VIEWER: "viewer"
} as const;

export type RoleCode = (typeof roleCodes)[keyof typeof roleCodes];
