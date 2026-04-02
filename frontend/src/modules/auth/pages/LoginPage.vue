<template>
  <section class="login-page">
    <div class="login-page__brand">
      <div class="login-page__brand-mark">
        <VIcon icon="mdi-account-outline" />
      </div>
      <div>
        <strong>{{ appName }}</strong>
        <span>Manage</span>
      </div>
    </div>

    <div class="login-page__copy">
      <h1>Đăng nhập</h1>
    </div>

    <form class="login-page__form" @submit.prevent="handleSubmit">
      <VTextField
        v-model="form.identifier"
        prepend-inner-icon="mdi-phone-outline"
        label="Số điện thoại hoặc identifier"
        hide-details
        variant="solo-filled"
        flat
        rounded="xl"
        autocomplete="username"
        required
      />

      <VTextField
        v-model="form.password"
        :append-inner-icon="showPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
        prepend-inner-icon="mdi-lock-outline"
        :type="showPassword ? 'text' : 'password'"
        label="Mật khẩu"
        hide-details
        variant="solo-filled"
        flat
        rounded="xl"
        autocomplete="current-password"
        required
        @click:append-inner="showPassword = !showPassword"
      />

      <div v-if="errorMessage" class="alert alert-danger">
        {{ errorMessage }}
      </div>

      <VBtn
        block
        color="primary"
        size="large"
        rounded="xl"
        class="login-page__submit"
        type="submit"
        :loading="authStore.pending"
      >
        Đăng nhập
      </VBtn>

      <button type="button" class="login-page__helper">
        Quên mật khẩu?
      </button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/modules/auth/store";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const appName = import.meta.env.VITE_APP_NAME || "Chat analyzer";
const errorMessage = ref("");
const showPassword = ref(false);

const form = reactive({
  identifier: "",
  password: ""
});

async function handleSubmit() {
  errorMessage.value = "";

  try {
    await authStore.login({
      identifier: form.identifier,
      password: form.password
    });

    const redirectTarget =
      typeof route.query.redirect === "string" && route.query.redirect.length > 0
        ? route.query.redirect
        : authStore.mustChangePassword
          ? "/change-password"
          : "/dashboard";

    await router.push(redirectTarget);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Đăng nhập thất bại.";
  }
}
</script>

<style scoped>
.login-page {
  display: grid;
  gap: 22px;
  width: 100%;
  padding: 8px 4px;
}

.login-page__brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.login-page__brand-mark {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: rgba(75, 85, 99, 0.82);
  background: rgba(209, 213, 219, 0.7);
}

.login-page__brand strong,
.login-page__brand span,
.login-page__copy h1 {
  display: block;
}

.login-page__brand strong {
  font-size: 1.1rem;
  line-height: 1.1;
}

.login-page__brand span {
  color: rgba(75, 85, 99, 0.82);
  line-height: 1.1;
}

.login-page__copy {
  padding-bottom: 18px;
  border-bottom: 1px solid rgba(17, 24, 39, 0.08);
}

.login-page__copy h1 {
  margin: 0;
  font-size: clamp(2.4rem, 4vw, 3rem);
  line-height: 1;
}

.login-page__form {
  display: grid;
  gap: 14px;
}

.login-page__submit {
  margin-top: 2px;
}

.login-page__helper {
  width: fit-content;
  padding: 0;
  color: rgba(55, 65, 81, 0.84);
  background: transparent;
  border: 0;
  font-weight: 600;
}
</style>
