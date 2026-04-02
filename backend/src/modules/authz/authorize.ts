import type { PermissionCode } from "./permissions.ts";

export type AuthorizationOptions = {
  permissions?: PermissionCode[];
  allowMustChangePassword?: boolean;
};

export function authorize(options: AuthorizationOptions = {}) {
  return {
    detail: {
      authz: options
    }
  };
}

