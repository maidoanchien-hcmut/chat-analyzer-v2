<template>
  <form class="content-card stack-lg" @submit.prevent="handleSubmit">
    <PageHeader
      eyebrow="Tác vụ admin"
      title="Tạo tài khoản nội bộ"
      description="Khởi tạo tài khoản nội bộ bằng mật khẩu tạm, role đầu tiên và trạng thái kích hoạt."
    />

    <div class="stack-md">
      <div class="field">
        <label for="displayName">Tên hiển thị</label>
        <input id="displayName" v-model="form.displayName" type="text" required />
      </div>

      <div class="field">
        <label for="identifier">Identifier</label>
        <input id="identifier" v-model="form.identifier" type="text" required />
      </div>

      <div class="field">
        <label for="email">Email</label>
        <input id="email" v-model="form.email" type="email" />
      </div>

      <div class="field">
        <label for="temporaryPassword">Mật khẩu tạm</label>
        <input id="temporaryPassword" v-model="form.temporaryPassword" type="password" required />
      </div>

      <div class="field">
        <label for="roleId">Role</label>
        <select id="roleId" v-model="form.roleId" required>
          <option disabled value="">Chọn role</option>
          <option v-for="role in roles" :key="role.id" :value="role.id">
            {{ role.name }}
          </option>
        </select>
      </div>

      <label class="toggle-row">
        <input v-model="form.isActive" type="checkbox" />
        <span>Kích hoạt ngay</span>
      </label>
    </div>

    <div class="button-row">
      <button class="button button-primary" type="submit" :disabled="pending">
        {{ pending ? "Đang tạo..." : "Tạo tài khoản" }}
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive } from "vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import type { CreateUserPayload, RoleSummary } from "@/modules/admin-accounts/types";

const props = defineProps<{
  roles: RoleSummary[];
  pending: boolean;
}>();

const emit = defineEmits<{
  submit: [payload: CreateUserPayload];
}>();

const form = reactive({
  displayName: "",
  identifier: "",
  email: "",
  temporaryPassword: "",
  roleId: "",
  isActive: true
});

function handleSubmit() {
  emit("submit", {
    displayName: form.displayName,
    identifier: form.identifier,
    email: form.email || undefined,
    temporaryPassword: form.temporaryPassword,
    roleIds: [Number(form.roleId)],
    isActive: form.isActive
  });
}
</script>

<style scoped>
.toggle-row {
  display: inline-flex;
  gap: 10px;
  align-items: center;
  color: var(--text-soft);
  font-weight: 700;
}
</style>
