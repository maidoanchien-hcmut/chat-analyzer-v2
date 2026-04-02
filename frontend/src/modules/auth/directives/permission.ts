import type { App, DirectiveBinding } from "vue";
import type { Pinia } from "pinia";
import type { PermissionCode } from "@/modules/auth/permissions";
import { useAuthStore } from "@/modules/auth/store";

type PermissionBindingValue = PermissionCode | PermissionCode[];

function applyPermission(
  el: HTMLElement,
  binding: DirectiveBinding<PermissionBindingValue>,
  pinia: Pinia
) {
  const authStore = useAuthStore(pinia);
  const required = Array.isArray(binding.value) ? binding.value : binding.value ? [binding.value] : [];
  const allowed = required.length === 0 || authStore.hasAllPermissions(required);

  el.style.display = allowed ? "" : "none";
}

export function registerPermissionDirective(app: App, pinia: Pinia) {
  app.directive("permission", {
    mounted(el, binding) {
      applyPermission(el as HTMLElement, binding, pinia);
    },
    updated(el, binding) {
      applyPermission(el as HTMLElement, binding, pinia);
    }
  });
}
