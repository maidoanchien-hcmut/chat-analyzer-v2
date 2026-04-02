<template>
  <section class="content-card stack-md" style="max-width: 720px; margin: 0 auto">
    <div class="pill">404</div>
    <PageHeader
      eyebrow="Không tìm thấy"
      title="Không tìm thấy trang"
      description="Frontend đã có router shell, nhưng route bạn mở chưa được định nghĩa."
    />
    <div class="button-row">
      <RouterLink class="button button-primary" :to="{ name: 'dashboard' }">
        Về tổng quan
      </RouterLink>
      <RouterLink class="button button-ghost" :to="{ name: 'login' }">
        Về đăng nhập
      </RouterLink>
    </div>
  </section>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import PageHeader from "@/shared/components/PageHeader.vue";
</script>
