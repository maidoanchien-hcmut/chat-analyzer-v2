import "vue-router";
import type { PermissionCode } from "@/modules/auth/permissions";

declare module "vue-router" {
  interface RouteMeta {
    title?: string;
    description?: string;
    layout?: "auth" | "app";
    guestOnly?: boolean;
    requiresAuth?: boolean;
    requiresAdmin?: boolean;
    permissions?: PermissionCode[];
  }
}
