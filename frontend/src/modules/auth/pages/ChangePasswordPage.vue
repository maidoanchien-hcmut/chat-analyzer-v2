<template>
  <section class="content-card stack-lg">
    <PageHeader
      eyebrow="Đăng nhập lần đầu"
      title="Đổi mật khẩu bắt buộc"
      description="Nếu tài khoản đang ở trạng thái must_change_password, chỉ màn này được phép truy cập cho đến khi cập nhật xong."
    />

    <form class="stack-lg" @submit.prevent="handleSubmit">
      <div class="field">
        <label for="currentPassword">Mật khẩu hiện tại hoặc tạm thời</label>
        <input
          id="currentPassword"
          v-model="form.currentPassword"
          type="password"
          autocomplete="current-password"
          required
        />
      </div>

      <div class="field">
        <label for="newPassword">Mật khẩu mới</label>
        <input
          id="newPassword"
          v-model="form.newPassword"
          type="password"
          autocomplete="new-password"
          required
        />
      </div>

      <div class="field">
        <label for="confirmPassword">Xác nhận mật khẩu mới</label>
        <input
          id="confirmPassword"
          v-model="form.confirmPassword"
          type="password"
          autocomplete="new-password"
          required
        />
      </div>

      <div v-if="errorMessage" class="alert alert-danger">
        {{ errorMessage }}
      </div>

      <div class="button-row">
        <button class="button button-primary" type="submit" :disabled="authStore.pending">
          {{ authStore.pending ? "Đang cập nhật..." : "Cập nhật mật khẩu" }}
        </button>
        <button class="button button-ghost" type="button" @click="handleLogout">
          Đăng xuất
        </button>
      </div>
    </form>

    <div class="alert alert-neutral">
      Mật khẩu mới nên được thay đổi ngay trong lần đăng nhập đầu tiên để đóng session tạm thời do
      admin tạo.
    </div>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import PageHeader from "@/shared/components/PageHeader.vue";
import { useAuthStore } from "@/modules/auth/store";

const router = useRouter();
const authStore = useAuthStore();
const errorMessage = ref("");

const form = reactive({
  currentPassword: "",
  newPassword: "",
  confirmPassword: ""
});

async function handleSubmit() {
  errorMessage.value = "";

  try {
    await authStore.changePassword(form);
    await router.push({ name: "dashboard" });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Đổi mật khẩu thất bại.";
  }
}

async function handleLogout() {
  await authStore.logout();
  await router.push({ name: "login" });
}
</script>
