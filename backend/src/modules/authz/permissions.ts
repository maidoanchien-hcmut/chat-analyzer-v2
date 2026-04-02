export const roleCodes = {
  ADMIN: "admin",
  VIEWER: "viewer"
} as const;

export type RoleCode = (typeof roleCodes)[keyof typeof roleCodes];

export const permissionCodes = {
  GET_AUTH_ME: "GET_AUTH_ME",
  REFRESH_AUTH_SESSION: "REFRESH_AUTH_SESSION",
  LOGOUT_AUTH_SESSION: "LOGOUT_AUTH_SESSION",
  CHANGE_OWN_PASSWORD: "CHANGE_OWN_PASSWORD",
  GET_USERS: "GET_USERS",
  GET_USER: "GET_USER",
  CREATE_USER: "CREATE_USER",
  UPDATE_USER: "UPDATE_USER",
  RESET_USER_PASSWORD: "RESET_USER_PASSWORD",
  DISABLE_USER: "DISABLE_USER",
  GET_ROLES: "GET_ROLES",
  ASSIGN_ROLE: "ASSIGN_ROLE",
  GET_PERMISSIONS: "GET_PERMISSIONS",
  GET_AUDIT_LOGS: "GET_AUDIT_LOGS",
  GET_DASHBOARD: "GET_DASHBOARD",
  EXPORT_REPORT: "EXPORT_REPORT"
} as const;

export type PermissionCode = (typeof permissionCodes)[keyof typeof permissionCodes];

export type PermissionCatalogItem = {
  code: PermissionCode;
  name: string;
  description: string;
  screen: string;
};

export type RoleCatalogItem = {
  code: RoleCode;
  name: string;
  description: string;
};

export const permissionCatalog: PermissionCatalogItem[] = [
  { code: permissionCodes.GET_AUTH_ME, name: "Get auth me", description: "View current session profile.", screen: "AUTH" },
  { code: permissionCodes.REFRESH_AUTH_SESSION, name: "Refresh auth session", description: "Rotate refresh session and issue a new access token.", screen: "AUTH" },
  { code: permissionCodes.LOGOUT_AUTH_SESSION, name: "Logout auth session", description: "Logout the current auth session.", screen: "AUTH" },
  { code: permissionCodes.CHANGE_OWN_PASSWORD, name: "Change own password", description: "Change the current user's password.", screen: "AUTH" },
  { code: permissionCodes.GET_USERS, name: "Get users", description: "View internal user accounts.", screen: "USERS" },
  { code: permissionCodes.GET_USER, name: "Get user", description: "View a specific internal user account.", screen: "USERS" },
  { code: permissionCodes.CREATE_USER, name: "Create user", description: "Create a new internal user account.", screen: "USERS" },
  { code: permissionCodes.UPDATE_USER, name: "Update user", description: "Update a user profile or active status.", screen: "USERS" },
  { code: permissionCodes.RESET_USER_PASSWORD, name: "Reset user password", description: "Reset another user's password.", screen: "USERS" },
  { code: permissionCodes.DISABLE_USER, name: "Disable user", description: "Disable an internal user account.", screen: "USERS" },
  { code: permissionCodes.GET_ROLES, name: "Get roles", description: "View available auth roles.", screen: "ROLES" },
  { code: permissionCodes.ASSIGN_ROLE, name: "Assign role", description: "Assign a role to a user.", screen: "ROLES" },
  { code: permissionCodes.GET_PERMISSIONS, name: "Get permissions", description: "View the permission catalog.", screen: "PERMISSIONS" },
  { code: permissionCodes.GET_AUDIT_LOGS, name: "Get audit logs", description: "View auth audit logs.", screen: "AUDIT" },
  { code: permissionCodes.GET_DASHBOARD, name: "Get dashboard", description: "View the dashboard shell.", screen: "DASHBOARD" },
  { code: permissionCodes.EXPORT_REPORT, name: "Export report", description: "Export read-only reports.", screen: "DASHBOARD" }
];

export const roleCatalog: RoleCatalogItem[] = [
  { code: roleCodes.ADMIN, name: "Administrator", description: "Full internal system access." },
  { code: roleCodes.VIEWER, name: "Viewer", description: "Read-only dashboard access." }
];

export const rolePermissionMap: Record<RoleCode, PermissionCode[]> = {
  [roleCodes.ADMIN]: permissionCatalog.map((permission) => permission.code),
  [roleCodes.VIEWER]: [
    permissionCodes.GET_AUTH_ME,
    permissionCodes.REFRESH_AUTH_SESSION,
    permissionCodes.LOGOUT_AUTH_SESSION,
    permissionCodes.CHANGE_OWN_PASSWORD,
    permissionCodes.GET_DASHBOARD,
    permissionCodes.EXPORT_REPORT
  ]
};

